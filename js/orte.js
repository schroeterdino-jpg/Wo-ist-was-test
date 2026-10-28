/* ============================================================
   ORTS-ERINNERUNGEN (nur in der Android-App): Kommst du an einem Supermarkt in Schwarzenbek an (Penny, Aldi, Edeka, Rewe, Lidl),
   sagt Jarvis dir, was auf deiner Einkaufsliste steht. Das geht auch bei gesperrtem Handy: Die App lässt sich vom Handy bei
   Standortänderungen wecken (OrtReceiver), schaltet den Bildschirm ein und holt Jarvis nach vorn; Jarvis spricht dann (plan_ansagen.js ruft ansage() hier auf).
   - Orte: aus den Kartendaten (OpenStreetMap, wie die Orte-Suche), 14 Tage gemerkt.
   - Meldet höchstens alle 3 Stunden pro Markt, nur zwischen 8 und 21 Uhr und nur, wenn etwas auf der Einkaufsliste steht.
   - Voraussetzung: Standort-Erlaubnis "Immer zulassen" für die Jarvis-App (Jarvis fragt einmal nach und öffnet die Einstellungen).
   Sprachbefehle: "Ortserinnerungen aus/an", "Wo meldest du dich?", "Teste die Ortserinnerung", "Ortszugriff einrichten".
   Braucht: window.ZaneNative.planOrte (neue App), shoppingEntries, jvOverpass (ortsuche.js) oder /api/overpass.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvOrte) return;

    const K_AN = 'jv_orte_an', K_CACHE = 'jv_orte_cache', K_FRAGE = 'jv_orte_frage';
    const MITTE = { lat: 53.5033, lon: 10.4781 }, RADIUS_M = 4500, TREFFER_M = 100;
    const MARKEN = ['Penny', 'Aldi', 'Edeka', 'Rewe', 'Lidl'];
    /* Manche Märkte stehen unter anderem Namen in den Kartendaten: Edeka zum Beispiel als "E center Kratzmann" (Hans-Koch-Ring 6) */
    const ZUSATZ_OV = { Edeka: '^E[ -]?(center|neukauf)|Marktkauf|Nahkauf' };
    const ZUSATZ_JS = { Edeka: '(?:^|[^a-z])e[ -]?(?:center|neukauf)|marktkauf|nahkauf' };
    const ovMuster = m => m + (ZUSATZ_OV[m] ? '|' + ZUSATZ_OV[m] : '');
    const jsMuster = m => new RegExp(m + (ZUSATZ_JS[m] ? '|' + ZUSATZ_JS[m] : ''), 'i');
    const CACHE_MS = 14 * 24 * 3600 * 1000, FRAGE_MS = 3 * 24 * 3600 * 1000;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function N() { const n = window.ZaneNative; return n && typeof n.planOrte === 'function' ? n : null; }
    function an() { return lsGet(K_AN) !== '0'; }
    function sagen(t) { try { speak(t); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    let meineKarte = false;   // unsere Karte steht gerade unten: beim nächsten Satz von dir verschwindet sie
    function karte(l) { try { if (typeof showActionCards === 'function') { showActionCards(l); meineKarte = true; } } catch (e) { } }
    function karteWeg() { if (!meineKarte) return; meineKarte = false; try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) { } }
    function einkauf() {
        try { return (typeof shoppingEntries !== 'undefined' && Array.isArray(shoppingEntries) ? shoppingEntries : []).map(e => String(e && e.text || '').trim()).filter(Boolean); }
        catch (e) { return []; }
    }
    function undListe(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]; }

    /* ---------- Supermärkte finden ---------- */
    const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
    const K_VERSUCH = 'jv_orte_versuch', K_PLACES_AUS = 'jv_orte_places_aus';
    let letzterFehler = '';
    function zeit(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }
    function grundText() {
        const f = letzterFehler || '';
        if (!f) return '';
        if (/keine dieser/.test(f)) return 'Der Kartendienst kennt dort keine dieser Märkte';
        return 'Der Kartendienst antwortet gerade nicht' + (/Zeit/.test(f) ? ' (Zeitüberschreitung)' : '');
    }
    function kurz(e) { return String((e && e.message) || e || '').replace(/signal is aborted without reason/i, 'Zeitüberschreitung').slice(0, 70); }

    /* Kartendaten: Server der App UND die öffentlichen Kartenserver gleichzeitig, die erste brauchbare Antwort gewinnt */
    function overpassRennen(q) {
        return new Promise((resolve, reject) => {
            const fehler = [], ctls = [];
            let offen = 0, fertig = false;
            const aus = (wer, e) => { fehler.push(wer + ': ' + kurz(e)); if (--offen === 0 && !fertig) reject(new Error(fehler.join(' · '))); };
            const sieg = el => { if (fertig) return; fertig = true; ctls.forEach(c => { try { c.abort(); } catch (e) { } }); resolve(el); };
            if (typeof apiFetch === 'function') {
                offen++;
                zeit(apiFetch('/api/overpass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) }), 28000)
                    .then(async r => { if (!r.ok) throw new Error('Status ' + r.status); const d = await r.json(); if (!d || !Array.isArray(d.elements)) throw new Error('keine Daten'); sieg(d.elements); })
                    .catch(e => aus('App-Server', e));
            }
            ENDPOINTS.forEach(url => {
                offen++;
                const ctl = typeof AbortController === 'function' ? new AbortController() : null;
                if (ctl) ctls.push(ctl);
                const t = setTimeout(() => { if (ctl) ctl.abort(); }, 25000);
                fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(q), signal: ctl ? ctl.signal : undefined })
                    .then(async r => { clearTimeout(t); if (!r.ok) throw new Error('Status ' + r.status); const d = await r.json(); if (!d || !Array.isArray(d.elements)) throw new Error('keine Daten'); sieg(d.elements); })
                    .catch(e => { clearTimeout(t); if (!fertig) aus(url.replace(/^https:\/\//, '').split('/')[0], e); else if (--offen === 0 && !fertig) reject(new Error(fehler.join(' · '))); });
            });
            if (!offen) reject(new Error('keine Verbindung'));
        });
    }
    function ausElementen(el) {
        const orte = [];
        (el || []).forEach(x => {
            const t = x.tags || {}; if (!t.name) return;
            const lat = x.lat !== undefined ? x.lat : (x.center && x.center.lat), lon = x.lon !== undefined ? x.lon : (x.center && x.center.lon);
            if (lat === undefined || lon === undefined) return;
            const marke = MARKEN.find(m => jsMuster(m).test(t.name)); if (!marke) return;
            orte.push({ id: 'osm' + (x.type || 'x') + x.id, name: marke, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, r: TREFFER_M });
        });
        return orte;
    }
    /* Google Places (falls bei dir eingerichtet), nur als zweiter Weg: pro Marke eine Abfrage */
    async function ausPlaces() {
        const orte = [];
        let fehler = '';
        for (const m of MARKEN) {
            try {
                const url = '/api/maps?action=places&q=' + encodeURIComponent(m + ' Schwarzenbek') + '&lat=' + MITTE.lat + '&lon=' + MITTE.lon + '&radius=' + RADIUS_M;
                const r = await zeit(apiFetch(url), 12000);
                const d = await r.json().catch(() => ({}));
                if (!r.ok) { fehler = (d && d.error) || ('Status ' + r.status); if (r.status === 503 || r.status === 429) { lsSet(K_PLACES_AUS, String(Date.now())); break; } continue; }
                (d.places || []).forEach(p => {
                    if (!jsMuster(m).test(String(p.name || ''))) return;
                    if (isFinite(p.lat) && isFinite(p.lon)) orte.push({ id: 'gp' + m + Math.round(p.lat * 1e5) + Math.round(p.lon * 1e5), name: m, lat: Math.round(p.lat * 1e6) / 1e6, lon: Math.round(p.lon * 1e6) / 1e6, r: TREFFER_M });
                });
            } catch (e) { fehler = kurz(e); }
        }
        if (!orte.length && fehler) throw new Error('Google Places: ' + fehler);
        return orte;
    }
    function ohneDoppelte(liste) {
        const aus = [];
        liste.forEach(o => {
            const nah = aus.find(x => x.name === o.name && Math.abs(x.lat - o.lat) < 0.0007 && Math.abs(x.lon - o.lon) < 0.001);
            if (!nah) aus.push(o);
        });
        return aus;
    }
    function versucheHeute() {
        try { const v = JSON.parse(lsGet(K_VERSUCH) || '{}'); const tag = new Date().toISOString().slice(0, 10); return v.tag === tag ? v.n : 0; } catch (e) { return 0; }
    }
    function merkeVersuch() { try { const tag = new Date().toISOString().slice(0, 10); lsSet(K_VERSUCH, JSON.stringify({ tag, n: versucheHeute() + 1 })); } catch (e) { } }
    function cacheOrte() {
        try { const c = JSON.parse(lsGet(K_CACHE) || 'null'); if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.orte) && c.orte.length) return c.orte; } catch (e) { }
        return null;
    }
    let imGang = null;
    function ladeOrte(erzwingen) {
        if (imGang) return imGang;
        imGang = ladeOrteInner(erzwingen).then(r => { imGang = null; return r; }, e => { imGang = null; throw e; });
        return imGang;
    }
    async function ladeOrteInner(erzwingen) {
        if (!erzwingen) {
            try { const c = JSON.parse(lsGet(K_CACHE) || 'null'); if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.orte) && c.orte.length) return c.orte; } catch (e) { }
            if (versucheHeute() >= 4) return null;   // automatisch nur wenige Versuche pro Tag
        }
        merkeVersuch();
        const q = '[out:json][timeout:25];(nwr["shop"~"supermarket|convenience|discount"]["name"~"' + MARKEN.map(ovMuster).join('|') + '",i](around:' + RADIUS_M + ',' + MITTE.lat + ',' + MITTE.lon + '););out center tags;';
        let orte = [];
        letzterFehler = '';
        try {
            let el = null;
            if (typeof window.jvOverpass === 'function') { try { el = await window.jvOverpass(q); } catch (e) { letzterFehler = 'Kartendienst: ' + kurz(e); } }
            if (!Array.isArray(el)) el = await overpassRennen(q);
            orte = ausElementen(el);
            if (!orte.length) letzterFehler = 'Der Kartendienst kennt in Schwarzenbek keine dieser Märkte';
        } catch (e) { letzterFehler = 'Kartendienst: ' + kurz(e); }
        if (!orte.length && Date.now() - Number(lsGet(K_PLACES_AUS) || 0) > 7 * 24 * 3600 * 1000 && typeof apiFetch === 'function') {
            try { orte = await ausPlaces(); if (orte.length) letzterFehler = ''; } catch (e) { letzterFehler += (letzterFehler ? ' · ' : '') + kurz(e); }
        }
        orte = ohneDoppelte(orte);
        if (orte.length) lsSet(K_CACHE, JSON.stringify({ t: Date.now(), orte }));
        return orte.length ? orte : null;
    }

    /* ---------- An die App melden ---------- */
    let letzte = '';
    async function senden(erzwingen, mitSuche) {
        const n = N(); if (!n) return false;
        try {
            const orte = cacheOrte() || (mitSuche === false ? [] : (await ladeOrte(false)) || []);
            const plan = { an: an(), orte, einkauf: einkauf().slice(0, 40) };
            const sig = JSON.stringify(plan);
            if (!erzwingen && sig === letzte) return true;
            letzte = sig;
            return !!n.planOrte(sig);
        } catch (e) { console.error('Orte senden', e && e.message); return false; }
    }
    function status() {
        try { const n = window.ZaneNative; if (n && typeof n.ortStatus === 'function') return JSON.parse(n.ortStatus() || '{}'); } catch (e) { }
        return {};
    }

    /* ---------- Einmal nach der Erlaubnis fragen ---------- */
    let frageOffen = 0;
    function erlaubnisFragen() {
        const n = N(); if (!n || !an()) return;
        const s = status();
        if (s.fein && s.immer) return;
        if (Date.now() - Number(lsGet(K_FRAGE) || 0) < FRAGE_MS) return;
        if (document.hidden) return;
        lsSet(K_FRAGE, String(Date.now()));
        frageOffen = Date.now();
try { if (window.jvMeldungen) window.jvMeldungen.beobachte({ quelle: 'orte', kanal: ['karte', 'sprache'], grund: 'standort-frage', ausloeser: 'timer', ereignis: 'ort|standort-frage', bezug: null, frage: true, text: 'Ich kann dich im Supermarkt an deine Einkaufsliste erinnern. Dafür braucht die App den Standort mit der Einstellung „Immer zulassen“.' }) } catch (e) { }   // C1: nur Beobachtung
        karte([{ icon: '📍', title: 'Standort „Immer zulassen“', subtitle: 'Damit Jarvis dich im Supermarkt erinnern kann', onclick: 'jvOrte.rechte()' }]);
        sagen('Ich kann dich im Supermarkt an deine Einkaufsliste erinnern. Dafür braucht die App den Standort mit der Einstellung „Immer zulassen“. Soll ich dir die Einstellungen öffnen?');
    }
    function rechte() {
        const n = window.ZaneNative;
        if (!n || typeof n.ortRechte !== 'function') { sagen('Dafür brauchst du die neue Jarvis-App.'); return; }
        frageOffen = 0;
        n.ortRechte();
        sagen('Ich öffne die Einstellungen. Tippe auf Berechtigungen, dann auf Standort, und wähle „Immer zulassen“.');
    }

    /* ---------- Ansage beim Ankommen (aus plan_ansagen.js) ---------- */
    function ansage(id) {
        const teile = String(id || '').split('|');
        const wann = Number(teile[1] || 0), name = teile.slice(2).join('|') || 'dem Supermarkt';
        if (!wann || Date.now() - wann > 25 * 60000) return false;   // alte Meldung angetippt: nichts sagen
        const l = einkauf();
        if (!l.length) return false;
        const zeig = l.slice(0, 10);
try { if (window.jvMeldungen) window.jvMeldungen.beobachte({ quelle: 'orte', kanal: ['karte', 'sprache'], grund: 'einkaufsliste-markt', ausloeser: 'apk', ereignis: String(id), bezug: window.jvMeldungen.bezugId('markt', name), text: 'Du bist bei ' + name + '. Auf deiner Einkaufsliste ' + (l.length === 1 ? 'steht: ' : 'stehen: ') + undListe(zeig) }) } catch (e) { }   // C1: nur Beobachtung
        karte([{ icon: '🛒', title: 'Einkaufsliste · ' + name, subtitle: zeig.join(', ') + (l.length > 10 ? ' …' : '') }]);
        sagen('Du bist bei ' + name + '. Auf deiner Einkaufsliste ' + (l.length === 1 ? 'steht: ' : 'stehen: ') + undListe(zeig) + (l.length > 10 ? ' und ' + (l.length - 10) + ' weitere.' : '.'));
        return true;
    }

    /* ---------- Sprachbefehle ---------- */
    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.length > 90) return next(text);
        if (frageOffen && Date.now() - frageOffen < 2 * 60000) {
            if (/^(ja|ja bitte|gerne|bitte|ok|okay|klar|mach das|oeffne sie|oeffne die einstellungen)$/.test(t)) { rechte(); return true; }
            if (/^(nein|nee|nicht jetzt|spaeter|lieber nicht)$/.test(t)) { frageOffen = 0; sagen('Gut, ich frage in ein paar Tagen noch einmal.'); return true; }
        }
        if (/\b(orts ?erinnerung\w*|standort ?erinnerung\w*)\b/.test(t)) {
            if (/\b(test\w*|probe\w*)\b/.test(t)) {
                if (!N()) { sagen('Die Ortserinnerungen gibt es nur in der Jarvis-App.'); return true; }
                if (!einkauf().length) { sagen('Deine Einkaufsliste ist leer, so gibt es nichts zu erinnern. Setz erst etwas auf die Liste.'); return true; }
                ansage('ort|' + Date.now() + '|Edeka (Test)'); return true;
            }
            if (/\b(aus\w*|ab\w*|deaktiv\w*|stopp\w*|beende\w*)\b/.test(t)) { lsSet(K_AN, '0'); senden(true); sagen('Gut, ich erinnere dich nicht mehr, wenn du an einem Supermarkt ankommst.'); return true; }
            if (/\b(an\w*|ein\w*|aktiv\w*|starte\w*)\b/.test(t)) { lsSet(K_AN, '1'); senden(true); setTimeout(erlaubnisFragen, 1500); sagen('Okay, ich erinnere dich wieder, wenn du an einem Supermarkt ankommst.'); return true; }
        }
        if (/^(such\w*|lad\w*|aktualisier\w*) (die |deine )?(maerkte|supermaerkte|orte) neu$/.test(t)) {
            if (!N()) { sagen('Die Ortserinnerungen gibt es nur in der Jarvis-App.'); return true; }
            sagen('Ich suche die Märkte neu. Einen Moment.');
            ladeOrte(true).then(o => { senden(true, false); sagen(o && o.length ? 'Gefunden: ' + o.length + ' Märkte, ' + undListe([...new Set(o.map(x => x.name))]) + '.' : 'Ich habe keine Märkte gefunden. ' + (grundText() ? 'Grund: ' + grundText() + '.' : '')); }).catch(() => sagen('Das hat gerade nicht geklappt.'));
            return true;
        }
        if (/\b(wo|bei welchen)\b.*\b(meldest|erinnerst)\b.*\bdu\b|\bwelche (maerkte|supermaerkte|orte)\b.*\b(kennst|merkst|ueberwachst)\b/.test(t)) {
            if (!N()) { sagen('Die Ortserinnerungen gibt es nur in der Jarvis-App.'); return true; }
            ladeOrte(true).then(o => {
                const s = status();
                const namen = [...new Set((o || []).map(x => x.name))];
                let m = namen.length ? 'Ich melde mich bei ' + (o.length) + ' Märkten in Schwarzenbek: ' + undListe(namen) + '.' : 'Ich habe noch keine Märkte gefunden.' + (grundText() ? ' Grund: ' + grundText() + '.' : '') + ' Sag „Suche die Märkte neu“, um es noch einmal zu versuchen.';
                if (namen.length) senden(true, false);
                m += an() ? '' : ' Die Erinnerung ist gerade ausgeschaltet.';
                if (!(s.fein && s.immer)) m += ' Es fehlt noch der Standort „Immer zulassen“. Sag „Ortszugriff einrichten“.';
                sagen(m);
            }).catch(() => sagen('Das konnte ich gerade nicht nachsehen.'));
            return true;
        }
        if (/\b(ortszugriff|standortzugriff)\b/.test(t) || (/\bstandort\b/.test(t) && /\bimmer\b/.test(t) && /\b(erlauben|einrichten|freigeben)\b/.test(t))) { rechte(); return true; }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') {
        window.jvCommands.use('orte-karte', function (text, next) { karteWeg(); return next(text); }, 1);
        window.jvCommands.use('orte', befehl, 97);
    }

    window.jvOrte = { ansage, senden, ladeOrte, rechte, status, _norm: norm, _fehler: () => letzterFehler };

    /* ---------- Start ---------- */
    if (N()) {
        setTimeout(() => { senden(true); }, 6000);
        setTimeout(erlaubnisFragen, 40000);
        setInterval(() => senden(false), 45000);   // Einkaufsliste hat sich geändert? Dann der App neu melden
        try { document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => senden(false), 1500); }); } catch (e) { }
    }
})();
