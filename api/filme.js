/* ============================================================
   /api/filme: Vermittler zur Filmdatenbank TMDB (themoviedb.org). Der Schlüssel steht nur hier auf dem Server
   (Vercel: Settings > Environment Variables > TMDB_API_KEY), nie im Browser.
   Aufrufe aus js/filme.js:
     /api/filme?mode=discover&genres=27|28   Filmtipps (zufällige Auswahl guter, beliebter Filme; bevorzugt solche, die gerade im Abo laufen)
     /api/filme?mode=kino                    aktuell im Kino (Deutschland)
     /api/filme?mode=search&q=Titel          Film oder Serie suchen und sagen, wo sie in Deutschland laufen
   Antwort: { ok: true, results: [ { id, kind, title, year, rating, overview, release, providers: { flatrate, rent, buy } } ] }
   Hinweis: Diese Datei benutzt "module.exports". Beginnen deine anderen Dateien im Ordner api mit "export default", ersetze die letzte Zeile
   durch:  export default handler;
   ============================================================ */

const BASE = 'https://api.themoviedb.org/3';

async function tmdb(path, params, key) {
    const q = new URLSearchParams(Object.assign({ api_key: key, language: 'de-DE' }, params || {}));
    const r = await fetch(`${BASE}${path}?${q.toString()}`);
    if (!r.ok) throw new Error('TMDB ' + r.status);
    return r.json();
}

function slim(m, kind) {
    const date = m.release_date || m.first_air_date || '';
    return {
        id: m.id,
        kind: kind || (m.media_type === 'tv' || m.first_air_date ? 'tv' : 'movie'),
        title: m.title || m.name || '',
        year: date.slice(0, 4),
        rating: Math.round((m.vote_average || 0) * 10) / 10,
        votes: m.vote_count || 0,
        overview: String(m.overview || '').slice(0, 260),
        release: date
    };
}

async function providers(kind, id, key) {
    const empty = { flatrate: [], rent: [], buy: [] };
    try {
        const d = await tmdb(`/${kind}/${id}/watch/providers`, {}, key);
        const de = (d.results && d.results.DE) || null;
        if (!de) return empty;
        const names = (a) => (a || []).map(p => p.provider_name).slice(0, 4);
        return { flatrate: names(de.flatrate), rent: names(de.rent), buy: names(de.buy) };
    } catch (e) { return empty; }
}

function shuffle(a) {
    const x = a.slice();
    for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; }
    return x;
}

async function handler(req, res) {
    const key = process.env.TMDB_API_KEY;
    if (!key) { res.status(500).json({ ok: false, error: 'TMDB_API_KEY fehlt in Vercel' }); return; }
    const mode = String((req.query && req.query.mode) || 'discover');
    try {
        if (mode === 'kino') {
            const d = await tmdb('/movie/now_playing', { region: 'DE', page: 1 }, key);
            const list = (d.results || []).filter(m => m.overview && m.poster_path).sort((a, b) => (b.popularity || 0) - (a.popularity || 0)).slice(0, 8).map(m => slim(m, 'movie'));
            res.setHeader('Cache-Control', 's-maxage=3600');
            res.status(200).json({ ok: true, results: list });
            return;
        }

        if (mode === 'search') {
            const q = String((req.query && req.query.q) || '').trim().slice(0, 80);
            if (!q) { res.status(400).json({ ok: false, error: 'Kein Titel' }); return; }
            const d = await tmdb('/search/multi', { query: q, include_adult: 'false' }, key);
            const hit = (d.results || []).find(r => r.media_type === 'movie' || r.media_type === 'tv');
            if (!hit) { res.status(200).json({ ok: true, results: [] }); return; }
            const item = slim(hit, hit.media_type);
            item.providers = await providers(item.kind, item.id, key);
            res.status(200).json({ ok: true, results: [item] });
            return;
        }

        // discover (Standard)
        let genres = String((req.query && req.query.genres) || '27|28');
        if (!/^[0-9|,]+$/.test(genres)) genres = '27|28';
        const page = 1 + Math.floor(Math.random() * 3);
        const d = await tmdb('/discover/movie', {
            with_genres: genres, sort_by: 'popularity.desc', 'vote_average.gte': '6.3', 'vote_count.gte': '400',
            region: 'DE', watch_region: 'DE', page: String(page), include_adult: 'false'
        }, key);
        const pool = shuffle((d.results || []).filter(m => m.overview && m.poster_path)).slice(0, 6).map(m => slim(m, 'movie'));
        await Promise.all(pool.map(async m => { m.providers = await providers('movie', m.id, key); }));
        pool.sort((a, b) => (b.providers.flatrate.length > 0) - (a.providers.flatrate.length > 0));   // Filme im Abo zuerst
        res.status(200).json({ ok: true, results: pool.slice(0, 3) });
    } catch (e) {
        res.status(502).json({ ok: false, error: String((e && e.message) || e).slice(0, 120) });
    }
}

module.exports = handler;
