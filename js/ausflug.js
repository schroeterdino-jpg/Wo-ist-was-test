/* ============================================================
   AUSFLUGS-PLANER: "Was können wir Samstag mit den Kindern unternehmen?", "Hast du eine Idee fürs Wochenende?", "Was können wir heute machen?"
   Jarvis fragt (falls du es nicht gesagt hast) kurz, wer mitkommt, und holt dann nacheinander:
   Kalender des Tages -> Wettervorhersage (Regen: drinnen, trocken: draußen) -> dein Standort -> passende Ziele im Umkreis von 25 km
   (Google Places über /api/maps?action=places) -> Entfernung und geschätzte Fahrzeit -> drei Vorschläge als Karten (Tipp = Route) und kurz gesprochen.
   Gemerkte Ausflüge ("Da waren wir schon", "Wir waren gestern im Tierpark Hagenbeck, war super"): Ort, Datum, wer dabei war, Urteil.
   Bekannte Ziele kommen später wieder weiter hinten (bei Datum unbekannt oder unter 120 Tagen alt); schlecht Bewertete werden nicht mehr vorgeschlagen.
   Sprache:  "Wo waren wir schon?" (Liste), "Ausflugsliste löschen", "Da waren wir schon" (nach den Vorschlägen: Nummer oder Name dazusagen)
   ERLEBNISSE (Situationsgedächtnis): auch Restaurants: "Wir waren im Restaurant Zur Linde essen, das Essen war gut, der Parkplatz schlecht, Simone fand es super".
             Jarvis merkt Ort, Datum, wer dabei war und die Punkte mit Urteil (Essen +, Parkplatz -). Fragen: "Wo waren wir essen?", "Wo waren wir essen, wo Simone das Essen so gut fand?",
             "Wie war es im Restaurant Zur Linde?". Restaurants werden nie als Ausflug vorgeschlagen.
   AGENTEN-STUFE 1 ("Plane Samstag einen Ausflug mit den Kindern und kümmer dich darum", "Plane unseren Samstag", "Such uns für Samstag etwas mit den Kindern und kümmer dich darum"):
             gleiche Bausteine wie oben, dazu: freies Zeitfenster aus dem Kalender (voll -> "Soll ich stattdessen Sonntag prüfen?"), Wünsche (Indoor/Outdoor, günstig),
             echte Fahrzeit (/api/route, sonst Schätzung), EIN Plan mit Abfahrtszeit + zwei Alternativen und EINE konkrete Frage ("Soll ich X für Samstag um 13:30 Uhr in deinen
             Kalender eintragen?"). Erst nach "Ja" wird über executeAction ein Kalendereintrag geschrieben, "Nein" schreibt nichts. Das Ergebnis wird wie in antwort_bau.js
             (PR #325) unterschieden: eingetragen / schon vorhanden (nichts verändert) / nicht bei Google abgeglichen / Fehler. Die Google-ID bleibt intern (letzte.eintrag).
             "Kümmer dich darum" allein aktiviert nichts: nur Sätze, die eindeutig Freizeit/Ausflug meinen (Tag + Kinder/Ausflug/unternehmen ...). Alles andere läuft wie bisher.
             Ohne "plane/organisiere/kümmer" bleibt der normale Ablauf unverändert (Ideen + Karten, keine Frage).
   Speicher: jv_ausfluege = [{name, art:'ausflug'|'essen', datum, mit, urteil:'gut'|'schlecht'|'', punkte:[{t,pol:'+'|'-',von}], am}] (wird gesichert, siehe api/sync.js).
   Grenzen: Eintrittspreise kennt die Orte-Suche nicht; Öffnungszeiten nur, wenn Google sie liefert (für "heute" werden geschlossene Ziele weggelassen).
   Fahrzeit ist eine Schätzung (Luftlinie mal 1,35, 55 km/h). Braucht: commands.js, calendar.js (calendarEntries), briefing.js (fetchWeatherForecast, wetterPosition), places.js (showActionCards), storage.js.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_ausfluege';
    const RADIUS = 25000;
    const WT = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
    const GENERISCH = /^(?:tierpark|wildpark|freizeitpark|museum|schwimmbad|hallenbad|spielplatz|minigolf|park|zoo|therme|kino|cafe|bowling|schloss|strand|strandbad|indoor|abenteuerspielplatz|aussichtspunkt|restaurant|gasthof|gasthaus|pizzeria|imbiss|italiener|griechen|asiaten|eisdiele|biergarten|brunch|der|die|das|dem|den|und|von|vom|zum|zur|bei|beim|am|im|in)$/;

    function sagen(msg) { try { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function pd(k, d) { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) || d); } catch (e) { return d; } }
    function sd(k, v) { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) { } }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function plusTage(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }
    function wochentag(iso) { return WT[new Date(iso + 'T12:00:00').getDay()]; }
    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }

    /* ---------- Gemerkte Ausflüge ---------- */
    function laden() { try { const a = JSON.parse(pd(KEY, '') || '[]'); return Array.isArray(a) ? a.filter(x => x && x.name) : []; } catch (e) { return []; } }
    function speichern(a) { sd(KEY, a.length ? JSON.stringify(a.slice(-200)) : ''); }
    function tokens(n) { return norm(n).split(' ').filter(w => w.length >= 5 && !GENERISCH.test(w)); }
    function gleich(a, b) {
        const x = norm(a), y = norm(b);
        if (!x || !y) return false;
        if (x === y || (x.length >= 6 && y.includes(x)) || (y.length >= 6 && x.includes(y))) return true;
        const tb = tokens(b);
        return tokens(a).some(w => tb.includes(w));
    }
    function bekannt(name) { return laden().filter(a => a.art !== 'essen' && gleich(a.name, name)); }   // Restaurants zählen nicht für Ausflugs-Vorschläge
    function abzug(name) {
        const l = bekannt(name);
        if (!l.length) return 0;
        if (l.some(a => a.urteil === 'schlecht')) return -1;     // nie wieder vorschlagen
        const jung = l.some(a => !a.datum || (Date.parse(heute()) - Date.parse(a.datum)) / 86400000 < 120);
        return jung ? 1 : 0;                                       // 1: nach hinten schieben
    }

    /* ---------- Tag, Personen verstehen ---------- */
    function tagAus(t) {
        const h = heute();
        if (/\bübermorgen\b|\buebermorgen\b/.test(t)) return plusTage(h, 2);
        if (/\bmorgen\b/.test(t) && !/\bmorgens\b/.test(t)) return plusTage(h, 1);
        const m = t.match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/);
        if (m) { const ziel = WT.indexOf(m[1]), jetzt = new Date(h + 'T12:00:00').getDay(); let n = ((ziel - jetzt) + 7) % 7; if (n === 0 && /\bnaechst\w*\b/.test(t)) n = 7; return plusTage(h, n); }
        if (/\bwochenende\b/.test(t)) {
            const jetzt = new Date(h + 'T12:00:00').getDay();
            if (jetzt === 6 || jetzt === 0) return h;
            return plusTage(h, 6 - jetzt);
        }
        return h;
    }
    function tagWort(iso) {
        const h = heute();
        if (iso === h) return 'Heute';
        if (iso === plusTage(h, 1)) return 'Morgen';
        if (iso === plusTage(h, 2)) return 'Übermorgen';
        return cap(wochentag(iso));
    }
    function personen(t) {
        const n = norm(t);
        if (/\b(?:ohne kinder|nur wir|zu zweit|erwachsene\w*|nur wir zwei|mit meiner frau|nur meine frau|allein\w*|nur\s+[a-z]{3,}\s+und\s+ich)\b/.test(n)) return { art: 'erwachsene', mit: 'Erwachsene' };
        const namen = ['finja', 'isabel', 'julia', 'alyssa'].filter(x => n.includes(x));
        if (/\b(?:kinder\w*|kids|enkel\w*|tochter|toechter|kleine\w*|baby|babys)\b/.test(n) || namen.length) {
            return { art: 'kinder', mit: namen.length ? namen.map(cap).join(' und ') : (/enkel/.test(n) ? 'den Enkeln' : 'den Kindern') };
        }
        return null;
    }

    /* ---------- Kalender des Tages ---------- */
    function kalenderText(iso) {
        let arr = [];
        try { arr = (typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries)) ? calendarEntries : []; } catch (e) { }
        const ganz = [], zeit = [];
        arr.forEach(e => {
            const s = e && e.isoDate ? String(e.isoDate) : '';
            if (!s || !e.text) return;
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { if (s === iso) ganz.push(e.text); return; }
            const d = new Date(s); if (isNaN(d)) return;
            if (d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) !== iso) return;
            const hh = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
            zeit.push({ hh, h: +hh.slice(0, 2), text: e.text });
        });
        zeit.sort((a, b) => a.hh < b.hh ? -1 : 1);
        if (!ganz.length && !zeit.length) return 'Im Kalender steht an dem Tag nichts.';
        const teile = [];
        if (ganz.length) teile.push('ganztägig ' + ganz.slice(0, 2).join(' und '));
        zeit.slice(0, 3).forEach(z => teile.push('um ' + (z.hh.endsWith(':00') ? z.h : z.hh.replace(/^0/, '')) + ' Uhr ' + z.text));
        const vorm = !zeit.some(z => z.h < 12), nachm = !zeit.some(z => z.h >= 12 && z.h < 18);
        let frei = '';
        if (zeit.length && vorm && nachm) frei = ' Vormittags und nachmittags bist du frei.';
        else if (zeit.length && vorm) frei = ' Vormittags bist du frei.';
        else if (zeit.length && nachm) frei = ' Nachmittags bist du frei.';
        return 'Im Kalender steht: ' + teile.join(', ') + '.' + frei;
    }

    /* ---------- Wetter ---------- */
    async function wetter(iso) {
        try {
            if (typeof fetchWeatherForecast !== 'function') return null;
            const f = await fetchWeatherForecast();
            const t = f && f.tage ? f.tage.find(x => x.datum === iso) : null;
            if (!t) return null;
            const regen = (t.regenwahrscheinlichkeit_prozent || 0) >= 50 || (t.niederschlag_mm || 0) >= 3;
            return { regen, text: (regen ? 'es sieht nach Regen aus' : 'es bleibt voraussichtlich trocken') + ', höchstens ' + t.hoechstwert_grad + ' Grad' };
        } catch (e) { return null; }
    }

    /* ---------- Suche ---------- */
    function anfragen(art, regen) {
        if (art === 'kinder') return regen
            ? [{ q: 'Indoor Spielplatz', icon: '🧸' }, { q: 'Hallenbad Schwimmbad', icon: '🏊' }, { q: 'Museum für Kinder', icon: '🏛️' }, { q: 'Bowling', icon: '🎳' }]
            : [{ q: 'Tierpark Wildpark', icon: '🦌' }, { q: 'Freizeitpark', icon: '🎢' }, { q: 'Minigolf', icon: '⛳' }, { q: 'Abenteuerspielplatz', icon: '🛝' }];
        return regen
            ? [{ q: 'Museum', icon: '🏛️' }, { q: 'Therme', icon: '♨️' }, { q: 'Café', icon: '☕' }, { q: 'Kino', icon: '🎬' }]
            : [{ q: 'Aussichtspunkt', icon: '🏞️' }, { q: 'Schloss Park', icon: '🏰' }, { q: 'Café', icon: '☕' }, { q: 'Wanderweg Naturpark', icon: '🥾' }];
    }
    function haversine(a, b, c, d) {
        const R = 6371000, r = Math.PI / 180, dLat = (c - a) * r, dLon = (d - b) * r;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a * r) * Math.cos(c * r) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    async function sucheZiele(pos, qs, istHeute) {
        const antworten = await Promise.all(qs.map(async q => {
            try {
                const url = '/api/maps?action=places&q=' + encodeURIComponent(q.q) + '&lat=' + pos.lat.toFixed(6) + '&lon=' + pos.lon.toFixed(6) + '&radius=' + RADIUS;
                const r = await apiFetch(url);
                const d = await r.json().catch(() => ({}));
                if (!r.ok || !d || !Array.isArray(d.places)) return null;
                return d.places.map(p => ({
                    name: p.name || q.q, lat: +p.lat, lon: +p.lon, icon: q.icon, art: q.q,
                    street: [p.street, p.housenumber].filter(Boolean).join(' '), city: p.city || '',
                    hours: p.hours || '', openNow: p.openNow, until: p.until || null,
                    dist: haversine(pos.lat, pos.lon, +p.lat, +p.lon)
                })).filter(p => isFinite(p.lat) && isFinite(p.lon) && p.dist <= RADIUS * 1.15 && !(istHeute && p.openNow === false));
            } catch (e) { return null; }
        }));
        if (antworten.every(a => a === null)) return null;
        return antworten.map(a => a || []);
    }
    function waehle(gruppen) {
        const gesehen = new Set(), gewaehlt = [];
        const sortiert = gruppen.map(g => g.map(p => ({ p, ab: abzug(p.name) })).filter(x => x.ab >= 0)
            .sort((a, b) => (a.ab - b.ab) || (a.p.dist - b.p.dist)).map(x => x.p));
        const nimm = p => { const k = norm(p.name); if (gesehen.has(k) || gewaehlt.some(x => gleich(x.name, p.name))) return false; gesehen.add(k); gewaehlt.push(p); return true; };
        for (const g of sortiert) { if (gewaehlt.length >= 3) break; for (const p of g) if (nimm(p)) break; }   // je Art höchstens einer
        const rest = [].concat.apply([], sortiert).sort((a, b) => (abzug(a.name) - abzug(b.name)) || (a.dist - b.dist));
        for (const p of rest) { if (gewaehlt.length >= 3) break; nimm(p); }
        return gewaehlt;
    }
    function minuten(m) { return Math.max(5, Math.round((m * 1.35 / 1000) / 55 * 60 / 5) * 5); }
    function routeUrl(p) { return 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=' + p.lat.toFixed(6) + ',' + p.lon.toFixed(6); }

    /* ---------- Planer ---------- */
    let letzte = { at: 0, items: [], mit: '' };
    let wartet = null;   // {phase:'wer'|'name'|'wahl', ...}

    async function planen(req) {
        const h = req.iso === heute();
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Plane den Ausflug...'); } catch (e) { }
        const [w, pos] = await Promise.all([wetter(req.iso), (typeof wetterPosition === 'function' ? wetterPosition() : Promise.resolve(null))]);
        if (!pos) { sagen('Ich kenne deinen Standort gerade nicht. Schalte die Ortung ein und frag mich noch einmal.'); return; }
        const regen = w ? w.regen : false;
        const gruppen = await sucheZiele(pos, anfragen(req.art, regen), h);
        if (!gruppen) { sagen('Die Suche nach Ausflugszielen geht gerade nicht. Versuch es gleich noch einmal.'); return; }
        const top = waehle(gruppen);
        const kopf = tagWort(req.iso) + ': ' + (w ? w.text + '. ' : 'eine Vorhersage habe ich dafür noch nicht. ') + kalenderText(req.iso);
        if (!top.length) { sagen(kopf + ' In 25 Kilometern habe ich nichts Passendes gefunden.'); return; }
        letzte = { at: Date.now(), items: top, mit: req.mit };
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(top.map(p => ({
                icon: p.icon, title: p.name,
                subtitle: (p.dist / 1000).toFixed(0) + ' km · ca. ' + minuten(p.dist) + ' Min · ' + (p.hours ? p.hours.slice(0, 40) : (p.until ? 'offen bis ' + p.until : 'Öffnungszeiten vorher prüfen')),
                href: routeUrl(p)
            })));
        } catch (e) { }
        const liste = top.map((p, i) => (i + 1) + ', ' + p.name + ', etwa ' + minuten(p.dist) + ' Minuten').join('. ');
        sagen(kopf + ' ' + (regen ? 'Drinnen' : 'Draußen') + ' habe ich drei Ideen. ' + liste + '. Die Karten mit der Route stehen unten. Wenn ihr schon dort wart, sag: Da waren wir schon.');
    }


    /* ---------- Agenten-Stufe 1: Fenster, Wünsche, Fahrzeit, Plan, Bestätigung, Eintragen ---------- */
    const QUARTAL = m => Math.ceil(m / 15) * 15;
    const hmText = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
    function jetztMin() { const p = new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).split(':'); return +p[0] * 60 + +p[1]; }
    function wuenscheAus(t) {
        return {
            indoor: /\b(?:indoor|drinnen|in der halle|ueberdacht\w*)\b/.test(t),
            outdoor: /\b(?:draussen|outdoor|an der frischen luft)\b/.test(t),
            guenstig: /\b(?:nicht so teuer|guenstig\w*|billig\w*|kostenlos|umsonst|wenig kosten\w*)\b/.test(t)
        };
    }
    /* Eindeutig Freizeit/Ausflug (nicht: "Meine Versicherung ist zu teuer. Kümmer dich darum.") */
    const TAG_WORT = /\b(?:samstag|sonntag|wochenende|freitag|montag|dienstag|mittwoch|donnerstag|morgen|uebermorgen|heute)\b/;
    function freizeitSzenario(t) {
        if (!t || t.split(' ').length > 28) return false;
        if (/\b(?:waren|war)\s+wir\b|\bwir\s+waren\b/.test(t)) return false;
        if (/\b(?:loesch\w*|entfern\w*|vergiss\w*)\b/.test(t)) return false;
        if (istFrage(t)) return true;   // "Ausflug", "was machen/unternehmen", "Ideen fürs Wochenende" ... (mit den Ausschlüssen von istFrage)
        if (!TAG_WORT.test(t)) return false;
        // zweiter Weg: Tag + eindeutig Freizeit ("Such uns für Samstag etwas mit den Kindern", "Plane unseren Samstag")
        if (/\b(?:unternehm\w*|freizeit\w*)\b/.test(t)) return true;
        if (/\bplan\w*\s+uns\w*\s+(?:samstag|sonntag|wochenende)\b/.test(t)) return true;
        if (/\b(?:indoor|outdoor|drinnen|draussen)\b/.test(t) && /\b(?:kinder\w*|enkel\w*|etwas|was)\b/.test(t)) return true;   // "Sonntag etwas Indoor"
        return /\b(?:kinder\w*|enkel\w*|finja|isabel|julia|alyssa)\b/.test(t) && /\b(?:etwas|was|irgendwas)\s+(?:mit|fuer|zusammen)\b/.test(t);
    }
    /* Agenten-Ablauf nur bei ausdrücklichem Auftrag: "kümmer dich", "plane", "organisiere" UND eindeutig Freizeit */
    function agentAnfrage(t) {
        if (!freizeitSzenario(t)) return false;
        return /\bkuemmer\w*\b|\b(?:plane|planen|organisiere|organisieren)\b/.test(t);
    }
    /* Freies Zeitfenster eines Tages aus dem Kalender (nur Termine; jeder Termin zählt eine Stunde, 15 Minuten Puffer) */
    function freiesFenster(iso) {
        let arr = [];
        try { arr = (typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries)) ? calendarEntries : []; } catch (e) { }
        const busy = [], ganz = [];
        arr.forEach(e => {
            const s = e && e.isoDate ? String(e.isoDate) : ''; if (!s || !e.text) return;
            if (/^\d{4}-\d{2}-\d{2}$/.test(s)) { if (s === iso) ganz.push(e.text); return; }
            const d = new Date(s); if (isNaN(d)) return;
            if (d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) !== iso) return;
            const p = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).split(':');
            const a = +p[0] * 60 + +p[1];
            busy.push([a, a + 60, e.text]);
        });
        busy.sort((x, y) => x[0] - y[0]);
        let lo = 10 * 60; const hi = 18 * 60;
        if (iso === heute()) lo = Math.max(lo, QUARTAL(jetztMin() + 30));
        let best = null, cur = lo;
        const kand = (s0, e0) => { s0 = QUARTAL(s0); const len = e0 - s0; if (len > 0 && (!best || len > best.len)) best = { von: s0, bis: e0, len }; };
        for (const b of busy) {
            if (b[1] + 15 <= cur) continue;
            if (b[0] - 15 > cur) kand(cur, Math.min(hi, b[0] - 15));
            cur = Math.max(cur, b[1] + 15);
        }
        if (cur < hi) kand(cur, hi);
        return { von: best ? best.von : 0, bis: best ? best.bis : 0, minuten: best ? best.len : 0, voll: !best || best.len < 150, busy, ganz };
    }
    async function fahrtMinuten(pos, p) {   // echte Route über /api/route (wie terminfinder.js); null = nicht verfügbar
        try {
            const r = await apiFetch('/api/route?fromLat=' + pos.lat + '&fromLon=' + pos.lon + '&toLat=' + p.lat + '&toLon=' + p.lon);
            const d = await r.json();
            const sec = d && d.routes && d.routes[0] && d.routes[0].duration;
            return sec ? Math.max(5, Math.round(sec / 60 * 1.1 / 5) * 5) : null;   // 10 % Puffer, auf 5 Minuten
        } catch (e) { return null; }
    }
    function folgeFrage(pl) { return 'Soll ich ' + pl.p.name + ' für ' + tagWort(pl.iso) + ' um ' + hmText(pl.von) + ' Uhr in deinen Kalender eintragen?'; }

    async function planenAgent(req) {
        const h = req.iso === heute(), wu = req.wuensche || {};
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Plane den Ausflug...'); } catch (e) { }
        const fenster = freiesFenster(req.iso);
        if (fenster.voll) {   // ganzer Tag belegt: nichts vorschlagen, anderen Tag anbieten (keine Kalenderänderung)
            const nx = plusTage(req.iso, 1);   // Samstag -> Sonntag, sonst der Folgetag
            wartet = { phase: 'tag', at: Date.now(), iso: nx, art: req.art, mit: req.mit, wuensche: wu };
            try { window.jvFrage && window.jvFrage.neu('ausflug'); } catch (e) { }
            sagen(tagWort(req.iso) + ' ist bei dir schon ziemlich voll. Soll ich stattdessen ' + tagWort(nx) + ' prüfen?');
            return;
        }
        const [w, pos] = await Promise.all([wetter(req.iso), (typeof wetterPosition === 'function' ? wetterPosition() : Promise.resolve(null))]);
        if (!pos) { sagen('Ich kenne deinen Standort gerade nicht. Schalte die Ortung ein und frag mich noch einmal.'); return; }
        const drinnen = wu.indoor ? true : wu.outdoor ? false : (w ? w.regen : false);
        const gruppen = await sucheZiele(pos, anfragen(req.art, drinnen), h);
        if (!gruppen) { sagen('Die Suche nach Ausflugszielen geht gerade nicht. Versuch es gleich noch einmal.'); return; }
        const top = waehle(gruppen);
        const wetterSatz = w ? tagWort(req.iso) + ': ' + w.text + '.' : tagWort(req.iso) + ': Das Wetter konnte ich nicht berücksichtigen.';
        if (!top.length) { sagen(wetterSatz + ' In 25 Kilometern habe ich nichts Passendes gefunden.'); return; }
        const fahrten = await Promise.all(top.map(p => fahrtMinuten(pos, p)));   // fällt eine Route aus, gilt die Schätzung (ehrlich gesagt), die Planung läuft weiter
        top.forEach((p, i) => { p.fahrt = fahrten[i] || minuten(p.dist); p.fahrtEcht = !!fahrten[i]; });
        const passt = p => 2 * p.fahrt + 90 <= fenster.minuten;
        top.sort((a, b) => (passt(b) ? 1 : 0) - (passt(a) ? 1 : 0));   // stabil: erst was ins Zeitfenster passt
        letzte = { at: Date.now(), items: top, mit: req.mit };
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(top.map(p => ({
                icon: p.icon, title: p.name,
                subtitle: (p.dist / 1000).toFixed(0) + ' km · ca. ' + p.fahrt + ' Min' + (p.fahrtEcht ? '' : ' (geschätzt)') + ' · ' + (p.hours ? p.hours.slice(0, 40) : (p.until ? 'offen bis ' + p.until : 'Öffnungszeiten vorher prüfen')),
                href: routeUrl(p)
            })));
        } catch (e) { }
        const pl = { p: top[0], top, iso: req.iso, von: fenster.von, dauer: Math.min(fenster.minuten, 2 * top[0].fahrt + 120), mit: req.mit };
        const teile = [wetterSatz];
        if (fenster.busy.length) teile.push('Um ' + hmText(fenster.busy[0][0]) + ' Uhr hast du ' + fenster.busy[0][2] + (fenster.von > 10 * 60 ? ', deshalb plane ich später' : '') + '.');
        if (fenster.ganz.length) teile.push('Ganztägig steht ' + fenster.ganz.slice(0, 2).join(' und ') + ' im Kalender.');
        teile.push('Ich würde ' + top[0].name + ' empfehlen. Fahr gegen ' + hmText(fenster.von) + ' Uhr los, die Fahrt dauert ' + (top[0].fahrtEcht ? 'ungefähr ' : 'geschätzt etwa ') + top[0].fahrt + ' Minuten.');
        if (top[0].hours) teile.push('Öffnungszeiten laut Google: ' + top[0].hours.slice(0, 40) + '.');
        if (!passt(top[0])) teile.push('Die Zeit ist dafür allerdings knapp.');
        if (wu.guenstig) teile.push('Eintrittspreise kenne ich nicht, das musst du vorher prüfen.');
        if (top.length > 1) teile.push('Alternativ: ' + top.slice(1).map(p => p.name).join(' oder ') + '.');
        teile.push(folgeFrage(pl));
        wartet = { phase: 'folge', at: Date.now(), plan: pl };
        try { window.jvFrage && window.jvFrage.neu('ausflug'); } catch (e) { }
        sagen(teile.join(' '));
    }

    /* Nach dem "Ja": über executeAction schreiben (kein eigener Schreibweg) und das Ergebnis ehrlich unterscheiden */
    async function eintragen(pl) {
        const p = pl.p, titel = 'Ausflug: ' + p.name, hhmm = hmText(pl.von), zeitWort = tagWort(pl.iso) + ' um ' + hhmm + ' Uhr';
        const ctx = { counter: 0, cards: [], notes: [], panel: null };
        let fehler = null, nichts = [];
        let schonDa = false;
        try {
            const l = (typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries)) ? calendarEntries : [];
            schonDa = l.some(e => e && norm(e.text) === norm(titel) && e.isoDate && new Date(e.isoDate).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) === pl.iso);
        } catch (e) { }
        if (schonDa) nichts.push('Der Ausflug steht schon im Kalender, es wurde nichts geändert.');
        else {
            try {
                const ort = [p.street, p.city].filter(Boolean).join(', ') || p.name;
                await window.executeAction({ type: 'calendar', calendar_text: titel, calendar_time: pl.iso + 'T' + hhmm + ':00', calendar_location: ort, calendar_duration: pl.dauer }, 'Trag den Ausflug ein', ctx);
            } catch (e) { fehler = e && e.userMessage ? e.userMessage : 'Der Kalendereintrag hat nicht geklappt.'; }
            nichts = nichts.concat(ctx[Symbol.for('jv.nichtsGetan')] || []);
        }
        const id = ctx[Symbol.for('jv.googleTerminId')] || '';
        const teilfehler = !!ctx[Symbol.for('jv.googleTeilfehler')];
        const geklappt = !fehler && !nichts.length;
        if (geklappt) letzte.eintrag = { name: p.name, iso: pl.iso, von: hhmm, googleId: id };   // nur intern, wird nicht vorgelesen
        const basis = geklappt ? (teilfehler ? 'Den Ausflug habe ich geplant, aber der Kalendereintrag konnte nicht mit Google synchronisiert werden.' : 'Erledigt. Der Ausflug steht ' + zeitWort + ' im Kalender.') : '';
        const e = { basis, erfolge: geklappt ? ['calendar'] : [], okAnzahl: geklappt ? 1 : 0, fehler: fehler ? ['Den Ausflug habe ich geplant, aber ' + fehler.charAt(0).toLowerCase() + fehler.slice(1)] : [], nichts, hinweise: geklappt ? ctx.notes : [] };
        let text = '';
        try { text = window.jvAntwort && typeof window.jvAntwort.baue === 'function' ? window.jvAntwort.baue(e) : ''; } catch (x) { text = ''; }
        if (!text) text = basis || (fehler || nichts.join(' '));
        sagen(text);
        return true;
    }
    const JA = /^(?:ja\b|jawohl|jep\b|jo\b|joa\b|gerne|gern\b|klar\b|okay|ok\b|bitte\b|genau|natuerlich|mach (?:das|es)\b|trag\w*\s+(?:ihn|es|das|den)\b.*\bein\b)/;

    /* ---------- Erkennen ---------- */
    const FRAGE = [
        /\bwas\s+(?:koennen|wollen|sollen|duerfen|moechten|machen)\s+wir\b.*\b(?:machen|unternehmen)\b/,
        /\b(?:wir\s+)?(?:wollen|moechten|moechte|will)\b.*\b(?:was|etwas|irgendwas|irgendetwas)\b.*\b(?:unternehmen|machen)\b/,
        /\b(?:was|wohin)\s+(?:kann|koennte|koennen|sollen)\s+(?:man|ich|wir)\b(?=.*\b(?:unternehmen|machen|fahren)\b)(?=.*\b(?:kinder\w*|wochenende|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|heute|morgen|uebermorgen|enkel\w*|familie)\b)/,
        /\b(?:ausflug|ausfluege|ausflugsziel\w*|ausflugstipp\w*|ausflugsidee\w*)\b/,
        /\b(?:idee|ideen|tipp|tipps|vorschlag|vorschlaege)\b.*\b(?:wochenende|samstag|sonntag|ausflug|kinder\w*|unternehmung\w*)\b/,
        /\bwas\s+(?:ist|gibt es|gibts)\b.*\b(?:heute|morgen|am wochenende)\b.*\bin der naehe\b.*\blos\b|\bwas ist .*in der naehe los\b/,
        /\bunternehmung\w*\b/
    ];
    function istFrage(t) {
        if (!t || t.split(' ').length > 22) return false;
        if (/\b(?:waren|war)\s+wir\b|\bwir\s+waren\b/.test(t)) return false;
        if (/\b(?:loesch\w*|entfern\w*)\b/.test(t)) return false;
        if (/\b(?:wetter|rezept|fernsehen|film\w*|essen\s+gehen|kochen|restaurant)\b/.test(t)) return false;
        return FRAGE.some(r => r.test(t));
    }

    /* ---------- Merken ---------- */
    function datumAus(t) {
        const h = heute();
        const zahl = { ein: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6 };
        if (/\bvorgestern\b/.test(t)) return plusTage(h, -2);
        if (/\bgestern\b/.test(t)) return plusTage(h, -1);
        if (/\bheute\b/.test(t)) return h;
        if (/\bletzte[nrs]?\s+woche\b/.test(t)) return plusTage(h, -7);
        if (/\bletzte[nrs]?\s+monat\b/.test(t)) return plusTage(h, -30);
        if (/\bletzte[nrs]?\s+jahr\b/.test(t)) return plusTage(h, -365);
        const m = t.match(/\bvor\s+(\d+|ein|eine|einer|zwei|drei|vier|fuenf|sechs)\s+(tagen?|wochen?|monaten?|jahren?)\b/);
        if (m) {
            const n = /^\d+$/.test(m[1]) ? +m[1] : (zahl[m[1]] || 1);
            return plusTage(h, -n * (/^tag/.test(m[2]) ? 1 : /^woch/.test(m[2]) ? 7 : /^monat/.test(m[2]) ? 30 : 365));
        }
        return '';
    }
    const NEG = /\b(?:nicht\s+(?:so\s+)?(?:gut|schoen|toll|lecker|sauber)|schlecht\w*|schlimm\w*|teuer\w*|ueberteuert\w*|zu\s+voll|voll|laut|langsam\w*|kalt\w*|lieblos\w*|mies\w*|bloed\w*|doof|langweilig\w*|eng|dreckig\w*|schmutzig\w*|enttaeuschend\w*|unfreundlich\w*|versalzen|nie\s+wieder|nicht\s+mehr|zu\s+weit|zu\s+klein|begrenzt\w*|schade|knapp\w*|wenig\w*|mager\w*|ueberfuellt\w*|aergerlich\w*|nervig\w*|stoerend\w*|laestig\w*|unpraktisch\w*)\b/;
    const POS = /\b(?:gut\w*|super|toll\w*|lecker\w*|schoen\w*|klasse|prima|top|genial\w*|spitze|hervorragend\w*|perfekt\w*|freundlich\w*|guenstig\w*|sauber\w*|ausgezeichnet\w*|fantastisch\w*|herrlich\w*|gefallen|lohnt\s+sich|empfehlenswert\w*|lecker\w*|reichhaltig\w*)\b/;
    function polAus(n) { if (NEG.test(n)) return '-'; if (POS.test(n)) return '+'; return ''; }
    const THEMA = /\b(?:essen|service|bedienung|parkplatz\w*|parkplaetze|parken|preise?|preis|atmosphaere|ambiente|eis|kuchen|kaffee|pizza|pasta|spielplatz|toiletten?|wartezeit|portionen?|auswahl|kinderkarte|personal|lage|aussicht|wetter)\b/;
    const NAME = /\b([A-ZÄÖÜ][a-zäöüß]{2,})\b/g;
    const KEIN_NAME = /^(?:Wir|Das|Der|Die|Dort|Da|Es|Ich|Jarvis|Zane|Essen|Service|Parkplatz|Preise|Restaurant|Tierpark|Wildpark|Minigolf|Gestern|Heute|Letzten|Letzte|Wo|Wie|Was|Und|Aber|Mit|Fand|Fanden|Hat|Haben|War|Waren|Ist|Sind|Im|Beim|Zum|Zur|Gasthof|Pizzeria|Imbiss|Cafe|Café|Museum|Zoo|Park|Eis)$/;
    /* Punkte mit Urteil aus dem Satz: "Das Essen war gut, der Parkplatz schlecht, Simone fand es super" -> Essen +, Parkplatz -, Insgesamt + (von Simone) */
    function punkteAus(raw) {
        const out = [];
        String(raw || '').split(/[,;]|\s+und\s+|\s+aber\s+|\s+jedoch\s+|\s+dafuer\s+|\.\s+/i).forEach(c => {
            const n = norm(c); if (!n) return;
            const pol = polAus(n); if (!pol) return;
            if (out.length && !THEMA.test(n) && /^(?:und\s+)?(?:das|es|dies\w*|was)\b/.test(n)) return;   // "... und das fand ich schade" bezieht sich auf den Punkt davor
            const mt = n.match(THEMA);
            let von = '';
            const mf = c.match(/\b([A-ZÄÖÜ][a-zäöüß]{2,})\s+(?:fand|fanden)\b/) || c.match(/\b(?:fand|fanden)\s+(?:es\s+|das\s+\w+\s+|der\s+\w+\s+|die\s+\w+\s+)?([A-ZÄÖÜ][a-zäöüß]{2,})\b/);
            if (mf && !KEIN_NAME.test(mf[1])) von = mf[1];
            if (mt || von || /\b(?:war|waren|ist|sind|fand|fanden)\b/.test(n)) out.push({ t: mt ? cap(/^park/.test(mt[0]) ? 'parkplatz' : mt[0]) : 'Insgesamt', pol, von });
        });
        return out;
    }
    function urteilAus(t, punkte) {
        const p = punkte || [];
        const gesamt = p.filter(x => x.t === 'Insgesamt');
        if (gesamt.length) return gesamt.every(x => x.pol === '-') ? 'schlecht' : gesamt.every(x => x.pol === '+') ? 'gut' : '';
        if (p.length) return p.every(x => x.pol === '-') ? 'schlecht' : p.every(x => x.pol === '+') ? 'gut' : '';
        if (/\bnie\s+wieder\b/.test(t)) return 'schlecht';
        const pol = polAus(t);
        return pol === '-' ? 'schlecht' : pol === '+' ? 'gut' : '';
    }
    function artAus(t) {
        if (/\b(?:restaurant|lokal|gasthof|gasthaus|pizzeria|imbiss|italiener|griechen|asiaten|eisdiele|biergarten|brunch|gegessen|mittagessen|abendessen|fruehstueck|doener|buffet|buffett|speisekarte|kellner|kellnerin|das\s+essen\s+(?:war|waren|ist)|das\s+essen\s+schmeckte)\b/.test(t)) return 'essen';
        if (/\bwaren\s+wir\b.*\bessen\b(?!\s+(?:war|waren|ist|sind))|\b(?:wir\s+waren|ich\s+war|war\s+ich)\b.*\bessen\b(?!\s+(?:war|waren|ist|sind))/.test(t)) return 'essen';
        return 'ausflug';
    }
    function mitAus(raw, t) {
        const p0 = personen(String(t).replace(/\bmit\s+(?:meiner\s+)?(?:ehe)?frau\b/g, ' '));
        const p = p0 && p0.art === 'kinder' ? p0 : null;   // "Erwachsene" sagt nichts über die Mitkommenden
        const fam = [];
        if (/\b(?:meiner|meine|mit)\s+(?:frau|ehefrau)\b/.test(t)) fam.push('meiner Frau');
        if (/\b(?:meinem|mein)\s+(?:mann|ehemann)\b/.test(t)) fam.push('meinem Mann');
        const namen = [];
        String(raw || '').replace(/\bmit\s+([A-ZÄÖÜ][a-zäöüß]{2,}(?:\s+und\s+[A-ZÄÖÜ][a-zäöüß]{2,})?)/g, (m, x) => { x.split(/\s+und\s+/).forEach(y => { if (!KEIN_NAME.test(y)) namen.push(y); }); return m; });
        if (namen.length) return namen.concat(fam).join(' und ');
        const alle = fam.concat(p ? [p.mit] : []);
        return alle.join(' und ');
    }
    function nummerAus(t) {
        const w = [/\b(?:1|eins|erste[nrs]?|ein)\b/, /\b(?:2|zwei|zweite[nrs]?)\b/, /\b(?:3|drei|dritte[nrs]?)\b/];
        const i = w.findIndex(r => r.test(t));
        return i;
    }
    function frischeVorschlaege() { return letzte.items.length && Date.now() - letzte.at < 6 * 3600000 ? letzte.items : []; }
    const KEIN_ORT_NAME = /^(?:Oma|Opa|Mama|Papa|Mutti|Vati|Hause|Haus|Arbeit|Freunden|Freunde|Arzt|Zahnarzt|Doktor|Friseur|Schule|Kita|Kindergarten|Urlaub|Besuch|Termin|Krankenhaus|Werkstatt|Baumarkt|Hochzeit|Feier|Party|Stau)\b/i;
    const NAME_ENDE = /\s+(?:und|das|der|die|es|war|waren|schon|gestern|heute|letzte\w*|vor|mit|dort|essen|gegessen|zum|in|im|bei|am|um|aber|ich|wir|er|sie|es)\b.*$/i;
    function namenImSatz(raw) {
        const t = String(raw || '');
        const VOR = '\\b(?:waren\\s+wir|[Ww]ir\\s+waren|war\\s+wir|[Ii]ch\\s+war|war\\s+ich)\\s+(?:\\w+\\s+){0,4}?(?:im|in\\s+der|in\\s+dem|in|beim|bei\\s+der|bei|auf\\s+dem|auf\\s+der|am|an\\s+der)\\s+';
        // 1) Name groß geschrieben (Browser-Spracherkennung): "im Great Asia Haus in Reinbek"
        let m = t.match(new RegExp(VOR + '([A-ZÄÖÜ][\\wäöüß.\\-]*(?:\\s+[A-ZÄÖÜa-zäöüß][\\wäöüß.\\-]*){0,3})'));
        if (m) {
            if (KEIN_ORT_NAME.test(m[1])) return '';
            return m[1].replace(NAME_ENDE, '').trim();
        }
        // 2) alles klein geschrieben (Sprachpaket der Handy-App): Wörter bis zum ersten Trennwort, jedes mit großem Anfang
        m = t.match(new RegExp(VOR.replace(/\[Ww\]ir/, '[Ww]ir').replace(/\[Ii\]ch/, '[Ii]ch') + '([a-zäöüß][\\wäöüß\\-]*(?:\\s+[\\wäöüß\\-]+){0,3})', 'i'));
        if (m && !KEIN_ORT_NAME.test(m[1])) {
            const n = m[1].replace(NAME_ENDE, '').trim();
            if (n.length >= 3) return n.split(/\s+/).map(cap).join(' ');
        }
        return '';
    }
    function datumText(d) { return d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : ''; }
    function punkteText(p) { return (p || []).filter(x => x.t !== 'Insgesamt').map(x => x.t + (x.pol === '+' ? ' gut' : ' nicht gut') + (x.von ? ' (' + x.von + ')' : '')).join(', '); }
    function merken(name, t, raw) {
        const a = laden();
        const punkte = punkteAus(raw || t);
        const art = artAus(t);
        const vonNamen = Array.from(new Set(punkte.map(x => x.von).filter(Boolean))).join(' und ');
        const mit = mitAus(raw, t) || vonNamen || letzte.mit || '';
        const ortStadt = (typeof ortAusSatz === 'function') ? ortAusSatz(String(raw || '').replace(new RegExp(String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'), ' ')) : '';
        const eintrag = { name, art, datum: datumAus(t) || '', mit, urteil: urteilAus(t, punkte), punkte, ort: ortStadt.split(' ').map(cap).join(' '), am: heute() };
        const i = a.findIndex(x => (x.art || 'ausflug') === art && gleich(x.name, name));
        if (i >= 0) {
            const o = a[i];
            a[i] = Object.assign({}, o, eintrag, { ort: eintrag.ort || o.ort || '', datum: eintrag.datum || o.datum || '', urteil: eintrag.urteil || o.urteil || '', mit: eintrag.mit || o.mit || '', punkte: punkte.length ? punkte : (o.punkte || []) });
        } else a.push(eintrag);
        speichern(a);
        const e = i >= 0 ? a[i] : eintrag;
        const dt = datumText(e.datum);
        const pt = punkteText(e.punkte);
        const folge = art === 'essen' ? '' : (e.urteil === 'schlecht' ? ' Das schlage ich dir nicht mehr vor.' : ' Das schlage ich so schnell nicht wieder vor.');
        sagen('Gemerkt: ' + name + (e.ort ? ' in ' + e.ort : '') + (dt && e.datum !== heute() ? ', am ' + dt : '') + (e.mit ? ', mit ' + e.mit : '') + '.' + (pt ? ' ' + pt + '.' : '') + folge);
        return true;
    }
    function besuchBehandeln(raw, t) {
        const vor = frischeVorschlaege();
        const frei = namenImSatz(raw);
        if (frei) return merken(frei, t, raw);
        if (vor.length) {
            const treffer = vor.find(p => gleich(p.name, raw));
            if (treffer) return merken(treffer.name, t, raw);
            const i = nummerAus(t);
            if (i >= 0 && vor[i]) return merken(vor[i].name, t, raw);
            if (vor.length === 1) return merken(vor[0].name, t, raw);
            wartet = { phase: 'wahl', at: Date.now(), t, raw };
            try { window.jvFrage && window.jvFrage.neu('ausflug'); } catch (e) { }
            sagen('Welcher war es? Sag eins, zwei oder drei.');
            return true;
        }
        wartet = { phase: 'name', at: Date.now(), t, raw };
        try { window.jvFrage && window.jvFrage.neu('ausflug'); } catch (e) { }
        sagen(artAus(t) === 'essen' ? 'Wie hieß das Lokal? Nenne mir den Namen.' : 'Wo wart ihr? Nenne mir den Ort, zum Beispiel: Tierpark Hagenbeck.');
        return true;
    }

    /* ---------- Fragen an die Erlebnisse ---------- */
    function bekannteNamen() {
        const set = new Set(['finja', 'isabel', 'julia', 'alyssa']);
        laden().forEach(a => { String(a.mit || '').split(/\s+und\s+/).forEach(x => x && set.add(norm(x))); (a.punkte || []).forEach(p => p.von && set.add(norm(p.von))); });
        return Array.from(set);
    }
    function erlebnisFrage(raw, t) {
        const essQ = /\bwo\s+(?:waren|war|haben|hatten)\s+wir\b.*\b(?:essen|gegessen|restaurant|lokal|pizzeria|italiener|griechen|asiaten|imbiss|eis|brunch)\b|\b(?:welche[sn]?)\s+(?:restaurant|lokal|italiener|griechen|asiaten)\w*\b|\bunsere\s+(?:restaurants?|lokale)\b|\bwo\s+(?:war|waren|gab)\b.*\b(?:parkplatz\w*|essen|service|bedienung|preise?)\b/.test(t);
        const wie = t.match(/\bwie\s+war\s+(?:es|das)\s+(?:im|in\s+der|in\s+dem|in|beim|bei\s+der|bei|am)\s+(.+)$/);
        const l = laden();
        if (wie && l.length) {
            const e = l.find(x => gleich(x.name, wie[1]));
            if (e) {
                const pt = punkteText(e.punkte);
                sagen(e.name + (e.ort ? ' in ' + e.ort : '') + (e.datum ? ', am ' + datumText(e.datum) : '') + (e.mit ? ', mit ' + e.mit : '') + '. ' + (e.urteil === 'gut' ? 'Insgesamt gut. ' : e.urteil === 'schlecht' ? 'Insgesamt nicht gut. ' : '') + (pt ? pt + '.' : (e.urteil ? '' : 'Dazu habe ich kein Urteil gemerkt.')));
                return true;
            }
            return false;
        }
        if (!essQ) return false;
        const essen = l.filter(x => x.art === 'essen');
        if (!essen.length) { sagen('Ich habe noch kein Restaurant gemerkt. Sag nach dem Essen zum Beispiel: Wir waren im Restaurant Zur Linde essen, das Essen war gut.'); return true; }
        const namen = bekannteNamen().filter(nm => nm.length >= 3 && new RegExp('\\b' + nm + '\\b').test(t));
        const alle = t.match(new RegExp(THEMA.source, 'g')) || [];
        const pol = polAus(t.replace(/\bwo\s+waren\s+wir\b/, ''));
        const thema = alle.find(x => x !== 'essen') || (pol ? (alle[0] || '') : '');   // "Wo waren wir essen?" allein ist kein Thema
        let treffer = essen;
        if (namen.length) treffer = treffer.filter(x => namen.some(nm => norm(x.mit).includes(nm) || (x.punkte || []).some(p => norm(p.von) === nm)));
        if (thema || pol) {
            const th = thema === 'parken' ? 'parkplatz' : thema;
            const t2 = treffer.filter(x => (x.punkte || []).some(p => (!th || norm(p.t) === th || (th === 'essen' && p.t === 'Insgesamt')) && (!pol || p.pol === pol) && (!namen.length || !p.von || namen.some(nm => norm(p.von) === nm))));
            if (t2.length) treffer = t2; else if (thema || pol) treffer = [];
        }
        if (!treffer.length) { sagen('Dazu habe ich nichts gemerkt.' + (essen.length ? ' Gemerkt sind ' + essen.length + (essen.length === 1 ? ' Restaurant' : ' Restaurants') + '. Sag „Wo waren wir essen?“ für die Liste.' : '')); return true; }
        const teile = treffer.slice(-3).reverse().map(x => x.name + (x.ort ? ' in ' + x.ort : '') + (x.datum ? ' am ' + datumText(x.datum) : '') + (punkteText(x.punkte) ? ' (' + punkteText(x.punkte) + ')' : ''));
        sagen((namen.length || thema || pol ? 'Das passt: ' : 'Zuletzt wart ihr hier essen: ') + teile.join('; ') + '.');
        return true;
    }

    /* ---------- Befehl ---------- */
    function befehl(text, next) {
        const raw = String(text || '').trim(), t = norm(raw);
        if (!t) return next(text);
        if (wartet && Date.now() - wartet.at > (wartet.phase === 'folge' || wartet.phase === 'tag' ? 600000 : 90000)) wartet = null;   // eine Bestätigungsfrage bleibt 10 Minuten offen, die übrigen 90 Sekunden
        if (wartet) {
            const w = wartet;
            if (/^(?:nein|nee|abbrechen|stopp?|lass es|vergiss es|egal)\b/.test(t)) { wartet = null; sagen('Okay, lassen wir es.'); return true; }
            if (w.phase !== 'wer' && (istFrage(t) || /\bwaren\s+wir\b|\bwir\s+waren\b/.test(t))) { wartet = null; return befehl(text, next); }
            if (w.phase === 'wer') {
                wartet = null;
                const p = personen(t) || { art: 'erwachsene', mit: '' };
                (w.agent ? planenAgent({ iso: w.iso, art: p.art, mit: p.mit, wuensche: w.wuensche }) : planen({ iso: w.iso, art: p.art, mit: p.mit })).catch(e => { console.error('Ausflug', e); sagen('Beim Planen ist etwas schiefgegangen.'); });
                return true;
            }
            if (w.phase === 'tag') {   // "Soll ich stattdessen Sonntag prüfen?"
                if (JA.test(t)) { wartet = null; planenAgent({ iso: w.iso, art: w.art, mit: w.mit, wuensche: w.wuensche }).catch(e => { console.error('Ausflug', e); sagen('Beim Planen ist etwas schiefgegangen.'); }); return true; }
                wartet = null; return next(text);
            }
            if (w.phase === 'folge') {   // "Soll ich X für Samstag um 13:30 Uhr in deinen Kalender eintragen?" - geschrieben wird nur nach einem Ja
                if (JA.test(t)) { wartet = null; eintragen(w.plan).catch(e => { console.error('Ausflug', e); sagen('Den Kalendereintrag konnte ich nicht anlegen.'); }); return true; }
                const i = nummerAus(t), treffer = w.plan.top.find(p => gleich(p.name, raw)) || (/\b(?:nimm|nehm\w*|lieber|die|den|das|nummer)\b/.test(t) || t.split(' ').length <= 3 ? w.plan.top[i] : null);
                if (treffer && treffer !== w.plan.p) { w.plan.p = treffer; w.at = Date.now(); try { window.jvFrage && window.jvFrage.neu('ausflug'); } catch (e) { } sagen(folgeFrage(w.plan)); return true; }
                wartet = null; return next(text);
            }
            if (w.phase === 'wahl') {
                const vor = frischeVorschlaege(), i = nummerAus(t);
                const treffer = vor.find(p => gleich(p.name, raw));
                const p = treffer || vor[i];
                if (p) { wartet = null; return merken(p.name, w.t, w.raw); }
                return next(text);
            }
            if (w.phase === 'name') {
                wartet = null;
                const name = raw.replace(/^(?:im|in\s+der|in\s+dem|in|beim|bei|am|an\s+der)\s+/i, '').replace(/[.!?]+$/, '').trim();
                if (name.length < 3 || name.split(' ').length > 6) return next(text);
                return merken(name, w.t, w.raw);
            }
        }
        if (erlebnisFrage(raw, t)) return true;
        if (/\bwo\s+waren\s+wir\b.*\bschon\b|\bwelche\s+ausfluege\b|\bunsere\s+ausfluege\b|\bausflugsliste\b.*\b(?:zeig\w*|vorles\w*)|\b(?:zeig\w*|lies)\b.*\bausfluege\b/.test(t)) {
            const l = laden();
            if (!l.length) { sagen('Ich habe noch keinen Ausflug gemerkt. Sag nach einem Ausflug zum Beispiel: Wir waren im Tierpark Hagenbeck, das war super.'); return true; }
            const teile = l.slice(-5).reverse().map(a => a.name + (a.datum ? ' am ' + new Date(a.datum + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : '') + (a.urteil === 'schlecht' ? ', nicht gut' : a.urteil === 'gut' ? ', gut' : ''));
            sagen('Zuletzt wart ihr hier: ' + teile.join('; ') + '.');
            return true;
        }
        if (/\bausflug\w*\b/.test(t) && /\b(?:loesch\w*|entfern\w*|vergiss\w*)\b/.test(t)) {
            if (!laden().length) { sagen('Es ist kein Ausflug gemerkt.'); return true; }
            speichern([]); sagen('Die gemerkten Ausflüge sind gelöscht.'); return true;
        }
        const streng = /\b(?:da|dort)\s+(?:waren\s+wir|war\s+ich)\b|\bwaren\s+wir\s+(?:schon|bereits)\b/.test(t) && !/\bwo\s+waren\b/.test(t);
        const locker = /\b(?:wir\s+waren|ich\s+war)\b/.test(t) && !/\bwo\s+war/.test(t);
        if (streng || locker || /\bmerk\w*\s+(?:dir\s+)?(?:den\s+|diesen\s+)?ausflug\b/.test(t)) {
            if (t.split(' ').length > 70) return next(text);
            const ortWort = /\b(?:tierpark|wildpark|zoo|park|museum|schwimmbad|hallenbad|freizeit\w*|spielplatz|minigolf|therme|schloss|strand\w*|bowling|kino|ausflug\w*|restaurant|lokal|gasthof|gasthaus|pizzeria|imbiss|italiener|griechen|asiaten|eisdiele|biergarten|cafe)\b/.test(t) || (artAus(t) === 'essen' && !!namenImSatz(raw));
            const vorTreffer = frischeVorschlaege().some(p => gleich(p.name, raw));
            // "Da waren wir schon" gilt nur nach Vorschlägen (oder mit Ortswort); "Wir waren im Stau" o. ä. wird nicht abgefangen
            if (!((streng && (frischeVorschlaege().length || ortWort)) || ortWort || vorTreffer)) return next(text);
            return besuchBehandeln(raw, t);
        }
        const agent = agentAnfrage(t);
        if (agent || istFrage(t)) {
            const iso = tagAus(t), p = personen(t), wuensche = wuenscheAus(t);
            if (!p) {
                wartet = { phase: 'wer', at: Date.now(), iso, agent, wuensche };
                try { window.jvFrage && window.jvFrage.neu('ausflug'); } catch (e) { }
                sagen('Gern. Wer kommt mit? Sag zum Beispiel: die Kinder, Finja oder nur wir.');
                return true;
            }
            (agent ? planenAgent({ iso, art: p.art, mit: p.mit, wuensche }) : planen({ iso, art: p.art, mit: p.mit })).catch(e => { console.error('Ausflug', e); sagen('Beim Planen ist etwas schiefgegangen.'); });
            return true;
        }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') {
        window.jvCommands.use('ausflug', befehl, 0.35);   // früh: eine offene Rückfrage ("Wer kommt mit?") muss die Antwort vor allen anderen bekommen
    }
    window.jvAusflug = { agentAnfrage, freiesFenster, wuenscheAus, letzteEintragung: () => letzte.eintrag || null, erlebnisFrage, punkteAus, artAus, mitAus, istFrage, tagAus, personen, kalenderText, waehle, gleich, abzug, datumAus, urteilAus, namenImSatz, laden };
})();
