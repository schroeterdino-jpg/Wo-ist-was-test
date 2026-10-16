/* ============================================================
   ORTS-ERINNERUNGEN (nur in der Android-App): Kommst du an einem Supermarkt in Schwarzenbek an (Penny, Aldi, Edeka, Rewe, Lidl),
   sagt Nova dir, was auf deiner Einkaufsliste steht. Das geht auch bei gesperrtem Handy: Die App lässt sich vom Handy bei
   Standortänderungen wecken (OrtReceiver), schaltet den Bildschirm ein und holt Nova nach vorn; Nova spricht dann (plan_ansagen.js ruft ansage() hier auf).
   - Orte: aus den Kartendaten (OpenStreetMap, wie die Orte-Suche), 14 Tage gemerkt.
   - Meldet höchstens alle 3 Stunden pro Markt, nur zwischen 8 und 21 Uhr und nur, wenn etwas auf der Einkaufsliste steht.
   - Voraussetzung: Standort-Erlaubnis "Immer zulassen" für die Nova-App (Nova fragt einmal nach und öffnet die Einstellungen).
   Sprachbefehle: "Ortserinnerungen aus/an", "Wo meldest du dich?", "Teste die Ortserinnerung", "Ortszugriff einrichten".
   Braucht: window.ZaneNative.planOrte (neue App), shoppingEntries, jvOverpass (ortsuche.js) oder /api/overpass.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvOrte) return;

    const K_AN = 'jv_orte_an', K_CACHE = 'jv_orte_cache', K_FRAGE = 'jv_orte_frage';
    const MITTE = { lat: 53.5033, lon: 10.4781 }, RADIUS_M = 4500, TREFFER_M = 100;
    const MARKEN = ['Penny', 'Aldi', 'Edeka', 'Rewe', 'Lidl'];
    const CACHE_MS = 14 * 24 * 3600 * 1000, FRAGE_MS = 3 * 24 * 3600 * 1000;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function N() { const n = window.ZaneNative; return n && typeof n.planOrte === 'function' ? n : null; }
    function an() { return lsGet(K_AN) !== '0'; }
    function sagen(t) { try { speak(t); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function karte(l) { try { if (typeof showActionCards === 'function') showActionCards(l); } catch (e) { } }
    function einkauf() {
        try { return (typeof shoppingEntries !== 'undefined' && Array.isArray(shoppingEntries) ? shoppingEntries : []).map(e => String(e && e.text || '').trim()).filter(Boolean); }
        catch (e) { return []; }
    }
    function undListe(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]; }

    /* ---------- Supermärkte finden ---------- */
    async function ladeOrte(erzwingen) {
        if (!erzwingen) {
            try { const c = JSON.parse(lsGet(K_CACHE) || 'null'); if (c && Date.now() - c.t < CACHE_MS && Array.isArray(c.orte) && c.orte.length) return c.orte; } catch (e) { }
        }
        const q = '[out:json][timeout:25];(nwr["shop"~"supermarket|convenience|discount"]["name"~"' + MARKEN.join('|') + '",i](around:' + RADIUS_M + ',' + MITTE.lat + ',' + MITTE.lon + '););out center tags;';
        let el = null;
        try { if (typeof window.jvOverpass === 'function') el = await window.jvOverpass(q); } catch (e) { console.error('Orte (jvOverpass)', e && e.message); }
        if (!el) {
            try {
                const res = await apiFetch('/api/overpass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) });
                if (res.ok) { const d = await res.json(); el = (d && d.elements) || null; }
            } catch (e) { console.error('Orte (api)', e && e.message); }
        }
        if (!Array.isArray(el)) return null;
        const orte = [], gesehen = new Set();
        el.forEach(x => {
            const t = x.tags || {}; if (!t.name) return;
            const lat = x.lat !== undefined ? x.lat : (x.center && x.center.lat), lon = x.lon !== undefined ? x.lon : (x.center && x.center.lon);
            if (lat === undefined || lon === undefined) return;
            const id = 'osm' + (x.type || 'x') + x.id; if (gesehen.has(id)) return; gesehen.add(id);
            const marke = MARKEN.find(m => new RegExp(m, 'i').test(t.name));
            orte.push({ id, name: marke || t.name, lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, r: TREFFER_M });
        });
        if (orte.length) lsSet(K_CACHE, JSON.stringify({ t: Date.now(), orte }));
        return orte;
    }

    /* ---------- An die App melden ---------- */
    let letzte = '';
    async function senden(erzwingen) {
        const n = N(); if (!n) return false;
        try {
            const orte = (await ladeOrte(false)) || [];
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
        karte([{ icon: '📍', title: 'Standort „Immer zulassen“', subtitle: 'Damit Nova dich im Supermarkt erinnern kann', onclick: 'jvOrte.rechte()' }]);
        sagen('Ich kann dich im Supermarkt an deine Einkaufsliste erinnern. Dafür braucht die App den Standort mit der Einstellung „Immer zulassen“. Soll ich dir die Einstellungen öffnen?');
    }
    function rechte() {
        const n = window.ZaneNative;
        if (!n || typeof n.ortRechte !== 'function') { sagen('Dafür brauchst du die neue Nova-App.'); return; }
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
                if (!N()) { sagen('Die Ortserinnerungen gibt es nur in der Nova-App.'); return true; }
                if (!einkauf().length) { sagen('Deine Einkaufsliste ist leer, so gibt es nichts zu erinnern. Setz erst etwas auf die Liste.'); return true; }
                ansage('ort|' + Date.now() + '|Edeka (Test)'); return true;
            }
            if (/\b(aus\w*|ab\w*|deaktiv\w*|stopp\w*|beende\w*)\b/.test(t)) { lsSet(K_AN, '0'); senden(true); sagen('Gut, ich erinnere dich nicht mehr, wenn du an einem Supermarkt ankommst.'); return true; }
            if (/\b(an\w*|ein\w*|aktiv\w*|starte\w*)\b/.test(t)) { lsSet(K_AN, '1'); senden(true); setTimeout(erlaubnisFragen, 1500); sagen('Okay, ich erinnere dich wieder, wenn du an einem Supermarkt ankommst.'); return true; }
        }
        if (/\b(wo|bei welchen)\b.*\b(meldest|erinnerst)\b.*\bdu\b|\bwelche (maerkte|supermaerkte|orte)\b.*\b(kennst|merkst|ueberwachst)\b/.test(t)) {
            if (!N()) { sagen('Die Ortserinnerungen gibt es nur in der Nova-App.'); return true; }
            ladeOrte(false).then(o => {
                const s = status();
                const namen = [...new Set((o || []).map(x => x.name))];
                let m = namen.length ? 'Ich melde mich bei ' + (o.length) + ' Märkten in Schwarzenbek: ' + undListe(namen) + '.' : 'Ich habe noch keine Märkte gefunden.';
                m += an() ? '' : ' Die Erinnerung ist gerade ausgeschaltet.';
                if (!(s.fein && s.immer)) m += ' Es fehlt noch der Standort „Immer zulassen“. Sag „Ortszugriff einrichten“.';
                sagen(m);
            }).catch(() => sagen('Das konnte ich gerade nicht nachsehen.'));
            return true;
        }
        if (/\b(ortszugriff|standortzugriff)\b/.test(t) || (/\bstandort\b/.test(t) && /\bimmer\b/.test(t) && /\b(erlauben|einrichten|freigeben)\b/.test(t))) { rechte(); return true; }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('orte', befehl, 97);

    window.jvOrte = { ansage, senden, ladeOrte, rechte, status, _norm: norm };

    /* ---------- Start ---------- */
    if (N()) {
        setTimeout(() => { senden(true); }, 6000);
        setTimeout(erlaubnisFragen, 40000);
        setInterval(() => senden(false), 45000);   // Einkaufsliste hat sich geändert? Dann der App neu melden
        try { document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => senden(false), 1500); }); } catch (e) { }
    }
})();
