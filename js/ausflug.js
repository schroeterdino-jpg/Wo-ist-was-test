/* ============================================================
   AUSFLUGS-PLANER: "Was können wir Samstag mit den Kindern unternehmen?", "Hast du eine Idee fürs Wochenende?", "Was können wir heute machen?"
   Jarvis fragt (falls du es nicht gesagt hast) kurz, wer mitkommt, und holt dann nacheinander:
   Kalender des Tages -> Wettervorhersage (Regen: drinnen, trocken: draußen) -> dein Standort -> passende Ziele im Umkreis von 25 km
   (Google Places über /api/maps?action=places) -> Entfernung und geschätzte Fahrzeit -> drei Vorschläge als Karten (Tipp = Route) und kurz gesprochen.
   Gemerkte Ausflüge ("Da waren wir schon", "Wir waren gestern im Tierpark Hagenbeck, war super"): Ort, Datum, wer dabei war, Urteil.
   Bekannte Ziele kommen später wieder weiter hinten (bei Datum unbekannt oder unter 120 Tagen alt); schlecht Bewertete werden nicht mehr vorgeschlagen.
   Sprache:  "Wo waren wir schon?" (Liste), "Ausflugsliste löschen", "Da waren wir schon" (nach den Vorschlägen: Nummer oder Name dazusagen)
   Speicher: jv_ausfluege = [{name, datum, mit, urteil:'gut'|'schlecht'|'', am}] (wird gesichert, siehe api/sync.js).
   Grenzen: Eintrittspreise kennt die Orte-Suche nicht; Öffnungszeiten nur, wenn Google sie liefert (für "heute" werden geschlossene Ziele weggelassen).
   Fahrzeit ist eine Schätzung (Luftlinie mal 1,35, 55 km/h). Braucht: commands.js, calendar.js (calendarEntries), briefing.js (fetchWeatherForecast, wetterPosition), places.js (showActionCards), storage.js.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_ausfluege';
    const RADIUS = 25000;
    const WT = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'];
    const GENERISCH = /^(?:tierpark|wildpark|freizeitpark|museum|schwimmbad|hallenbad|spielplatz|minigolf|park|zoo|therme|kino|cafe|bowling|schloss|strand|strandbad|indoor|abenteuerspielplatz|aussichtspunkt|der|die|das|dem|den|und|von|vom|zum|zur|bei|beim|am|im|in)$/;

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
    function bekannt(name) { return laden().filter(a => gleich(a.name, name)); }
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
        if (m) { const ziel = WT.indexOf(m[1]), jetzt = new Date(h + 'T12:00:00').getDay(); return plusTage(h, ((ziel - jetzt) + 7) % 7); }
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
        if (/\b(?:ohne kinder|nur wir|zu zweit|erwachsene\w*|nur wir zwei|mit meiner frau|nur meine frau|allein\w*)\b/.test(n)) return { art: 'erwachsene', mit: 'Erwachsene' };
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

    /* ---------- Erkennen ---------- */
    const FRAGE = [
        /\bwas\s+(?:koennen|wollen|sollen|duerfen|moechten|machen)\s+wir\b.*\b(?:machen|unternehmen)\b/,
        /\b(?:wir\s+)?(?:wollen|moechten|moechte|will)\b.*\b(?:was|etwas|irgendwas|irgendetwas)\b.*\b(?:unternehmen|machen)\b/,
        /\b(?:was|wohin)\s+(?:kann|koennte|koennen|sollen)\s+(?:man|ich|wir)\b.*\b(?:unternehmen|machen|fahren)\b.*\b(?:kinder\w*|wochenende|samstag|sonntag|heute|morgen|enkel\w*|familie)\b/,
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
    function urteilAus(t) {
        if (/\b(?:langweilig|doof|schlecht|nicht so (?:schoen|toll|gut)|zu voll|zu teuer|nie wieder|bloed|blöd|enttaeuschend\w*|nicht mehr)\b/.test(t)) return 'schlecht';
        if (/\b(?:super|toll|schoen|schön|klasse|prima|gut|top|genial|spitze|lohnt sich|gefallen)\b/.test(t)) return 'gut';
        return '';
    }
    function nummerAus(t) {
        const w = [/\b(?:1|eins|erste[nrs]?|ein)\b/, /\b(?:2|zwei|zweite[nrs]?)\b/, /\b(?:3|drei|dritte[nrs]?)\b/];
        const i = w.findIndex(r => r.test(t));
        return i;
    }
    function frischeVorschlaege() { return letzte.items.length && Date.now() - letzte.at < 6 * 3600000 ? letzte.items : []; }
    function namenImSatz(raw) {
        const t = String(raw || '');
        const m = t.match(/\b(?:waren\s+wir|wir\s+waren|war\s+wir)\s+(?:\w+\s+){0,4}?(?:im|in\s+der|in\s+dem|in|beim|bei\s+der|bei|auf\s+dem|auf\s+der|am|an\s+der|im\s+\w+-?)\s+([A-ZÄÖÜ][\wäöüß.\-]*(?:\s+[A-ZÄÖÜa-zäöüß][\wäöüß.\-]*){0,3})/);
        if (m) return m[1].replace(/\s+(?:und|das|es|war|schon|gestern|heute|letzte\w*|vor|mit|dort)\b.*$/i, '').trim();
        return '';
    }
    function merken(name, t) {
        const a = laden();
        const mit = (personen(t) || {}).mit || letzte.mit || '';
        const eintrag = { name, datum: datumAus(t) || '', mit, urteil: urteilAus(t), am: heute() };
        const i = a.findIndex(x => gleich(x.name, name));
        if (i >= 0) a[i] = Object.assign({}, a[i], eintrag, { datum: eintrag.datum || a[i].datum || '', urteil: eintrag.urteil || a[i].urteil || '', mit: eintrag.mit || a[i].mit || '' }); else a.push(eintrag);
        speichern(a);
        const folge = eintrag.urteil === 'schlecht' ? ' Das schlage ich dir nicht mehr vor.' : ' Das schlage ich so schnell nicht wieder vor.';
        sagen('Gemerkt: ' + name + (eintrag.datum && eintrag.datum !== heute() ? ', am ' + new Date(eintrag.datum + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }) : '') + (mit ? ', mit ' + mit : '') + '.' + folge);
        return true;
    }
    function besuchBehandeln(raw, t) {
        const vor = frischeVorschlaege();
        const frei = namenImSatz(raw);
        if (frei) return merken(frei, t);
        if (vor.length) {
            const treffer = vor.find(p => gleich(p.name, raw));
            if (treffer) return merken(treffer.name, t);
            const i = nummerAus(t);
            if (i >= 0 && vor[i]) return merken(vor[i].name, t);
            if (vor.length === 1) return merken(vor[0].name, t);
            wartet = { phase: 'wahl', at: Date.now(), t };
            sagen('Welcher war es? Sag eins, zwei oder drei.');
            return true;
        }
        wartet = { phase: 'name', at: Date.now(), t };
        sagen('Wo wart ihr? Nenne mir den Ort, zum Beispiel: Tierpark Hagenbeck.');
        return true;
    }

    /* ---------- Befehl ---------- */
    function befehl(text, next) {
        const raw = String(text || '').trim(), t = norm(raw);
        if (!t) return next(text);
        if (wartet && Date.now() - wartet.at > 90000) wartet = null;
        if (wartet) {
            const w = wartet;
            if (/^(?:nein|nee|abbrechen|stopp?|lass es|vergiss es|egal)\b/.test(t)) { wartet = null; sagen('Okay, lassen wir es.'); return true; }
            if (w.phase !== 'wer' && (istFrage(t) || /\bwaren\s+wir\b|\bwir\s+waren\b/.test(t))) { wartet = null; return befehl(text, next); }
            if (w.phase === 'wer') {
                wartet = null;
                const p = personen(t) || { art: 'erwachsene', mit: '' };
                planen({ iso: w.iso, art: p.art, mit: p.mit }).catch(e => { console.error('Ausflug', e); sagen('Beim Planen ist etwas schiefgegangen.'); });
                return true;
            }
            if (w.phase === 'wahl') {
                const vor = frischeVorschlaege(), i = nummerAus(t);
                const treffer = vor.find(p => gleich(p.name, raw));
                const p = treffer || vor[i];
                if (p) { wartet = null; return merken(p.name, w.t); }
                return next(text);
            }
            if (w.phase === 'name') {
                wartet = null;
                const name = raw.replace(/^(?:im|in\s+der|in\s+dem|in|beim|bei|am|an\s+der)\s+/i, '').replace(/[.!?]+$/, '').trim();
                if (name.length < 3 || name.split(' ').length > 6) return next(text);
                return merken(name, w.t);
            }
        }
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
        const streng = /\b(?:da|dort)\s+waren\s+wir\b|\bwaren\s+wir\s+(?:schon|bereits)\b/.test(t) && !/\bwo\s+waren\b/.test(t);
        const locker = /\bwir\s+waren\b/.test(t) && !/\bwo\s+war/.test(t);
        if (streng || locker || /\bmerk\w*\s+(?:dir\s+)?(?:den\s+|diesen\s+)?ausflug\b/.test(t)) {
            if (t.split(' ').length > 30) return next(text);
            const ortWort = /\b(?:tierpark|wildpark|zoo|park|museum|schwimmbad|hallenbad|freizeit\w*|spielplatz|minigolf|therme|schloss|strand\w*|bowling|kino|ausflug\w*)\b/.test(t);
            const vorTreffer = frischeVorschlaege().some(p => gleich(p.name, raw));
            // "Da waren wir schon" gilt nur nach Vorschlägen (oder mit Ortswort); "Wir waren im Stau" o. ä. wird nicht abgefangen
            if (!((streng && (frischeVorschlaege().length || ortWort)) || ortWort || vorTreffer)) return next(text);
            return besuchBehandeln(raw, t);
        }
        if (istFrage(t)) {
            const iso = tagAus(t), p = personen(t);
            if (!p) {
                wartet = { phase: 'wer', at: Date.now(), iso };
                sagen('Gern. Wer kommt mit? Sag zum Beispiel: die Kinder, Finja oder nur wir.');
                return true;
            }
            planen({ iso, art: p.art, mit: p.mit }).catch(e => { console.error('Ausflug', e); sagen('Beim Planen ist etwas schiefgegangen.'); });
            return true;
        }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') {
        window.jvCommands.use('ausflug', befehl, 0.35);   // früh: eine offene Rückfrage ("Wer kommt mit?") muss die Antwort vor allen anderen bekommen
    }
    window.jvAusflug = { istFrage, tagAus, personen, kalenderText, waehle, gleich, abzug, datumAus, urteilAus, namenImSatz, laden };
})();
