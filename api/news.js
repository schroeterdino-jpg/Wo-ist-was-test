// Aktuelle Nachrichten zu einem Land, einer Region oder einer Stadt (für die Weltkugel).
// Quellen (beide kostenlos, ohne Schlüssel, gleichzeitig abgefragt):
//   1. tagesschau.de (offizielle Such-API der ARD): Schlagzeilen MIT Bild, zu manchen Themen auch ein Kurzvideo
//   2. Google News (RSS): breitere Abdeckung, Schlagzeile und Quelle, aber ohne Bild
// GDELT wird nicht mehr genutzt: Der Dienst blockt Anfragen von gemeinsam genutzten Servern (Vercel) sehr oft mit "429 Please limit requests".
// Läuft über den Server, damit der Browser keine Probleme mit fremden Adressen (CORS) bekommt.

const NAMED_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è' };
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m))
    .replace(/\s+/g, ' ').trim();
}

const MAX_AGE_DAYS = 7;          // ältere Meldungen nur, wenn es sonst kaum etwas gibt
const CACHE_MS = 10 * 60 * 1000; // gleiche Frage innerhalb von 10 Minuten wird nicht neu abgefragt (schont die Dienste)
const cache = new Map();

/* ---------- tagesschau.de ---------- */
const MAX_VIDEO_AGE_DAYS = 10;   // ältere Videos wären keine "aktuelle Lage" mehr

function toHttps(u) { return String(u || '').replace(/^http:\/\//i, 'https://'); }

/* Abspielbaren Stream aus dem "streams"-Feld holen: bevorzugt MP4 in mittlerer Größe (schont das Datenvolumen), sonst HLS */
function pickStream(streams) {
  if (!streams || typeof streams !== 'object') return null;
  for (const k of ['h264m', 'h264s', 'h264ml', 'h264sm', 'h264l', 'h264xl']) {
    if (typeof streams[k] === 'string' && streams[k]) return { url: toHttps(streams[k]), type: 'video/mp4' };
  }
  if (typeof streams.adaptivestreaming === 'string' && streams.adaptivestreaming) return { url: toHttps(streams.adaptivestreaming), type: 'application/x-mpegURL' };
  return null;
}

async function fetchTagesschau(q) {
  const url = 'https://www.tagesschau.de/api2u/search/?searchText=' + encodeURIComponent(q) + '&pageSize=20&resultPage=0';
  const headers = { 'User-Agent': 'Mozilla/5.0 (compatible; AlltagsHelfer/1.0)', 'Accept': 'application/json' };
  const r = await fetch(url, { headers, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('tagesschau Status ' + r.status);
  const data = await r.json();
  const out = [];
  const videos = [];
  for (const it of (data.searchResults || [])) {
    if (!['story', 'webview', 'video'].includes(it.type)) continue;
    const title = decodeEntities(it.title);
    const link = it.shareURL || it.detailsweb;
    if (!title || !/^https?:\/\//i.test(link || '')) continue;
    const variants = (it.teaserImage && it.teaserImage.imageVariants) || {};
    const image = variants['16x9-384'] || variants['16x9-256'] || variants['16x9-512'] || Object.values(variants).find(v => /^https:\/\//.test(v)) || '';
    const d = it.date ? new Date(it.date) : null;
    const entry = { title, url: link, domain: 'tagesschau.de', date: d && !isNaN(d) ? d.toISOString() : null, image: /^https:\/\//.test(image) ? image : '' };
    out.push(entry);
    if (it.type === 'video') videos.push({ entry, streams: it.streams, details: it.details });
  }

  // Das neueste, noch aktuelle Video mit abspielbarem Stream heraussuchen (fehlt "streams" in der Suche, einmal in die Einzelansicht schauen)
  let video = null;
  const ts = (x) => (x.entry.date ? new Date(x.entry.date).getTime() : 0);
  const fresh = videos.filter(v => ts(v) >= Date.now() - MAX_VIDEO_AGE_DAYS * 86400000).sort((a, b) => ts(b) - ts(a));
  // Erst die Streams nehmen, die schon in der Suche stehen; MP4 geht überall, HLS (m3u8) nur auf manchen Geräten
  const cands = [];
  for (const v of fresh) {
    const stream = pickStream(v.streams);
    if (stream) cands.push({ v, stream });
  }
  const best = cands.find(c => c.stream.type === 'video/mp4') || cands[0];
  if (best) {
    video = { url: best.stream.url, type: best.stream.type, poster: best.v.entry.image, title: best.v.entry.title, date: best.v.entry.date, link: best.v.entry.url };
  } else {
    // Fehlt "streams" in der Suche, einmal in die Einzelansicht des neuesten Videos schauen
    const v = fresh.find(x => x.details && /^https:\/\/www\.tagesschau\.de\//.test(x.details));
    if (v) {
      try {
        const dr = await fetch(v.details, { headers, signal: AbortSignal.timeout(4000) });
        const stream = dr.ok ? pickStream((await dr.json()).streams) : null;
        if (stream) video = { url: stream.url, type: stream.type, poster: v.entry.image, title: v.entry.title, date: v.entry.date, link: v.entry.url };
      } catch (e) { /* dann eben kein Video */ }
    }
  }
  return { items: out, video };
}

/* ---------- Google News (RSS) ---------- */
function tagContent(block, name) {
  const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>').exec(block);
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1') : '';
}

async function fetchGoogleNews(q) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:2d') + '&hl=de&gl=DE&ceid=DE:de';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlltagsHelfer/1.0)' }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('Google News Status ' + r.status);
  const xml = await r.text();
  const out = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of items.slice(0, 20)) {
    let title = decodeEntities(tagContent(block, 'title'));
    const link = decodeEntities(tagContent(block, 'link'));
    const source = decodeEntities(tagContent(block, 'source'));
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3)).trim();
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const d = new Date(tagContent(block, 'pubDate'));
    out.push({ title, url: link, domain: source || 'news.google.com', date: isNaN(d) ? null : d.toISOString(), image: '' });
  }
  return out;
}

/* Beide Quellen zusammenführen: doppelte Titel raus, Meldungen mit Bild zuerst (bis zu drei), der Rest nach Datum */
function merge(lists) {
  const seen = new Set();
  const all = [];
  for (const it of lists.flat()) {
    const key = it.title.toLowerCase().replace(/[^a-zäöüß0-9]/g, '').slice(0, 40);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(it);
  }
  const ts = (x) => (x.date ? new Date(x.date).getTime() : 0);
  const limit = Date.now() - MAX_AGE_DAYS * 86400000;
  let fresh = all.filter(x => ts(x) >= limit);
  if (fresh.length < 3) fresh = all;            // sonst lieber ältere zeigen als nichts
  fresh.sort((a, b) => ts(b) - ts(a));
  const withImage = fresh.filter(x => x.image).slice(0, 3);
  const rest = fresh.filter(x => !withImage.includes(x));
  return [...withImage, ...rest].slice(0, 10);
}

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const q = String(req.query.q || '').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (q.length < 3) return res.status(400).json({ error: 'Suchbegriff fehlt' });

  const cacheKey = q.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_MS) return res.status(200).json(hit.data);

  const [ts, gn] = await Promise.allSettled([fetchTagesschau(q), fetchGoogleNews(q)]);
  const tsItems = ts.status === 'fulfilled' ? ts.value.items : [];
  const video = ts.status === 'fulfilled' ? ts.value.video : null;
  const articles = merge([tsItems, gn.status === 'fulfilled' ? gn.value : []]);
  const problems = [];
  if (ts.status === 'rejected') problems.push(String(ts.reason && ts.reason.message || ts.reason));
  if (gn.status === 'rejected') problems.push(String(gn.reason && gn.reason.message || gn.reason));

  const data = { articles, video, fehler: articles.length ? null : (problems.join('; ') || null), quellen: { tagesschau: ts.status === 'fulfilled' ? tsItems.length : -1, google: gn.status === 'fulfilled' ? gn.value.length : -1 } };
  if (articles.length) cache.set(cacheKey, { t: Date.now(), data });   // Fehler und leere Ergebnisse werden nicht gemerkt
  return res.status(200).json(data);
}
