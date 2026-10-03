/* ============================================================
   FILMTIPPS (TMDB über /api/filme):
   - "Gib mir einen guten Horrorfilm", "Filmtipp", "Was soll ich heute schauen?", "Empfiehl mir eine Komödie"
     Ohne Genre nimmt Jarvis Horror oder Action. Drei Tipps, bevorzugt solche, die gerade im Abo laufen (Netflix, Prime ...).
   - "Was läuft im Kino?" (nur diese allgemeine Frage: bundesweit aktuelle Kinofilme; sobald ein Ort oder Kinoname dabeisteht, oder "heute Abend", geht es an die Internet-Suche)
   - "Wo kann ich Dune streamen?", "Wo läuft Alien?", "Auf welchem Streamingdienst ist Squid Game?"
   Fernsehprogramm ("Was läuft im Fernsehen?") bleibt bei der Internet-Suche.
   Braucht: speak (voice.js), apiFetch, showActionCards/clearActionCards, /api/filme (Vercel-Variable TMDB_API_KEY).
   Wird von erweiterungen.js in die festen Sprachbefehle eingehängt.
   ============================================================ */
(function () {
    const DEFAULT_GENRES = '27|28';   // Horror oder Action
    const GENRES = [
        { re: /\b(horror\w*|grusel\w*|schocker)\b/, id: '27', label: 'Horror' },
        { re: /\b(action\w*)\b/, id: '28', label: 'Action' },
        { re: /\b(thriller|spannend\w*)\b/, id: '53', label: 'Thriller' },
        { re: /\b(komödie\w*|komoedie\w*|comedy|lustig\w*)\b/, id: '35', label: 'Komödie' },
        { re: /\b(science[- ]?fiction|sci[- ]?fi|scifi)\b/, id: '878', label: 'Science-Fiction' },
        { re: /\b(drama\w*)\b/, id: '18', label: 'Drama' },
        { re: /\b(krimi\w*)\b/, id: '80', label: 'Krimi' },
        { re: /\b(animation\w*|zeichentrick\w*|trickfilm\w*)\b/, id: '16', label: 'Animation' },
        { re: /\b(fantasy\w*)\b/, id: '14', label: 'Fantasy' },
        { re: /\b(abenteuer\w*)\b/, id: '12', label: 'Abenteuer' },
        { re: /\b(familienfilm\w*|kinderfilm\w*|familie)\b/, id: '10751', label: 'Familie' },
        { re: /\b(doku\w*|dokumentation\w*)\b/, id: '99', label: 'Dokumentation' },
        { re: /\b(kriegsfilm\w*)\b/, id: '10752', label: 'Krieg' },
        { re: /\b(western\w*)\b/, id: '37', label: 'Western' },
        { re: /\b(liebesfilm\w*|romantik\w*|romanze\w*|schnulze\w*)\b/, id: '10749', label: 'Liebesfilm' },
        { re: /\b(mystery\w*)\b/, id: '9648', label: 'Mystery' }
    ];

    function say(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }
    function showCards(cards) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(cards);
        } catch (e) {}
    }
    function rate(n) { return (Math.round(n * 10) / 10).toFixed(1).replace('.', ','); }
    function joinList(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]; }
    function ctx() { return (typeof charAddress === 'function') ? charAddress() : ''; }

    async function call(query) {
        const res = await apiFetch('/api/filme?' + query);
        let data = null;
        try { data = await res.json(); } catch (e) {}
        if (!res.ok || !data || !data.ok) {
            const err = new Error((data && data.error) || ('Status ' + res.status));
            err.missingKey = /TMDB_API_KEY/.test(String(err.message));
            throw err;
        }
        return data.results || [];
    }
    function failMessage(e) {
        if (e && e.missingKey) return 'Die Filmdatenbank ist noch nicht eingerichtet. In Vercel fehlt die Variable TMDB_API_KEY, oder nach dem Eintragen fehlt noch ein Redeploy.';
        if (e && e.auth) return 'Dafür ist die Anmeldung an der App-Schnittstelle nötig. Bitte den App-Code in den Einstellungen prüfen.';
        return 'Die Filmdatenbank antwortet gerade nicht.';
    }
    function providerLine(p) {
        if (!p) return '';
        if (p.flatrate && p.flatrate.length) return 'Im Abo: ' + p.flatrate.join(', ');
        if (p.rent && p.rent.length) return 'Zum Leihen: ' + p.rent.join(', ');
        if (p.buy && p.buy.length) return 'Zum Kaufen: ' + p.buy.join(', ');
        return 'Kein Streaming in Deutschland gefunden';
    }
    function cardFor(m) {
        const bits = [];
        if (m.rating) bits.push('★ ' + rate(m.rating));
        if (m.year) bits.push(m.year);
        const pl = providerLine(m.providers);
        if (pl) bits.push(pl);
        return { icon: m.kind === 'tv' ? '📺' : '🎬', title: m.title, subtitle: bits.join(' · ') };
    }

    /* ---------- Tipps ---------- */
    async function recommend(genreIds, label) {
        say('Ich schaue in die Filmdatenbank.');
        try {
            const list = await call('mode=discover&genres=' + encodeURIComponent(genreIds));
            if (!list.length) { say('Dazu habe ich gerade keinen passenden Film gefunden.'); return; }
            showCards(list.map(cardFor));
            const names = list.map(m => `„${m.title}“ (${rate(m.rating)} von 10)`);
            const first = list[0], pl = first.providers && first.providers.flatrate && first.providers.flatrate.length ? ` „${first.title}“ läuft im Abo bei ${first.providers.flatrate[0]}.` : '';
            say(`${label ? label + '-Tipps' : 'Drei Tipps'}: ${joinList(names)}.${pl} Einzelheiten stehen unten.`);
        } catch (e) { say(failMessage(e)); }
    }

    async function cinema() {
        say('Ich sehe nach, was im Kino läuft.');
        try {
            const list = await call('mode=kino');
            if (!list.length) { say('Ich finde gerade keine aktuellen Kinofilme.'); return; }
            showCards(list.map(m => ({ icon: '🎬', title: m.title, subtitle: ['★ ' + rate(m.rating), m.release ? 'ab ' + new Date(m.release + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : ''].filter(Boolean).join(' · ') })));
            say(`Aktuell laufen in den deutschen Kinos unter anderem ${joinList(list.slice(0, 4).map(m => `„${m.title}“`))}. Mehr steht unten. Das Programm eines bestimmten Kinos kenne ich so nicht.`);
        } catch (e) { say(failMessage(e)); }
    }

    async function whereToWatch(title) {
        say(`Ich suche „${title}“.`);
        try {
            const list = await call('mode=search&q=' + encodeURIComponent(title));
            if (!list.length) { say(`Zu „${title}“ finde ich in der Filmdatenbank nichts.`); return; }
            const m = list[0], p = m.providers || { flatrate: [], rent: [], buy: [] };
            showCards([cardFor(m)]);
            let msg;
            if (p.flatrate.length) msg = `„${m.title}“ läuft in Deutschland im Abo bei ${joinList(p.flatrate)}.`;
            else if (p.rent.length || p.buy.length) msg = `„${m.title}“ gibt es in Deutschland nicht im Abo, aber zum ${p.rent.length ? 'Leihen' : 'Kaufen'} bei ${joinList(p.rent.length ? p.rent : p.buy)}.`;
            else msg = `Für „${m.title}“ finde ich in Deutschland keinen Streamingdienst.`;
            say(msg);
        } catch (e) { say(failMessage(e)); }
    }

    /* ---------- Sprachbefehle ---------- */
    function pickGenres(t) {
        const hits = GENRES.filter(g => g.re.test(t));
        if (!hits.length) return { ids: DEFAULT_GENRES, label: '' };
        return { ids: hits.map(h => h.id).join('|'), label: hits.map(h => h.label).join(' oder ') };
    }

    function handleFilmCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 110) return false;
        if (/\b(fernseh\w*|tv|programm|sender|mediathek|heute abend|später|gleich)\b/.test(t)) return false;   // Fernsehen, Kinoprogramm und Uhrzeiten: Internet-Suche

        // Wo kann ich X streamen?
        const wo = t.match(/(?:wo\s+(?:kann ich|läuft|laufen|gibt es|sehe ich|finde ich|streame ich)|auf welchem (?:streamingdienst|streaming[- ]?dienst|dienst|anbieter)\s+(?:läuft|ist|gibt es|kann ich))\s+(.+?)(?:\s+(?:streamen|streamen|sehen|schauen|anschauen|ansehen|gucken|laufen|finden|ansehen))*$/);
        const streamWord = /(streamen|streaming|\bnetflix|\bprime\b|\bamazon|\bdisney|\bwow\b|\bsky\b|apple tv|paramount|\bjoyn|\brtl)/.test(t) || /\b(film|serie)\b/.test(t);
        if (wo && streamWord) {
            let title = wo[1].replace(/\b(den|die|das|dem|film|serie|folge|staffel|bei|auf|netflix|prime|amazon|disney\+?|streamen|streaming)\b/g, ' ').replace(/\s+/g, ' ').trim();
            if (title.length >= 2 && title.length <= 60 && !/^(ich|du|man|wir|es)$/.test(title)) { whereToWatch(title); return true; }
        }

        // Kino: nur die ganz allgemeine Frage ("Was läuft im Kino?"). Steht ein Ort oder Kinoname dabei ("in Schwarzenbek", "Kino Grimm"),
        // geht der Satz weiter an die Internet-Suche, denn die Filmdatenbank kennt kein Kinoprogramm eines bestimmten Hauses.
        if (/\bkinos?\b/.test(t) && /\b(läuft|laufen|kommt|neu|neue|aktuell\w*|filme|gerade)\b/.test(t)) {
            const rest = t.replace(/\b(was|welche|welcher|filme?|läuft|laufen|kommt|gibt|es|gerade|aktuell\w*|zurzeit|momentan|derzeit|jetzt|neu|neue|neues|im|in|den|deutschen|kinos?|moment|so|mal|denn|eigentlich|bitte|alles|noch|und|jarvis)\b/g, ' ').replace(/\s+/g, ' ').trim();
            if (rest === '') { cinema(); return true; }
            return false;
        }

        // Filmtipp
        const tip = /\b(filmtipp\w*|serientipp\w*|film\s*empfehlung\w*)\b/.test(t)
            || (/\b(empfiehl|empfehle|empfehlen|gib mir|hast du|such mir|nenn mir|schlag mir|schlage mir|zeig mir)\b/.test(t) && /\b(film\w*|horrorfilm\w*|actionfilm\w*|thriller|komödie\w*)\b/.test(t))
            || /\bwas (?:soll|kann|könnte|könnten|sollen) (?:ich|wir) (?:heute |jetzt |mal )?(?:schauen|gucken|sehen|ansehen|anschauen)\b/.test(t)
            || /\bwelchen film\b/.test(t) || /\b(?:gib|hast|empfiehl)\w*\b.*\b(?:horror|action)film\b/.test(t);
        if (tip) {
            const g = pickGenres(t);
            recommend(g.ids, g.label);
            return true;
        }
        return false;
    }

    window.handleFilmCommand = handleFilmCommand;
})();
