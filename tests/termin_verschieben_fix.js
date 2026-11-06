/* ============================================================
   TESTS Bugfix „Friseurtermin lässt sich nicht verschieben“: Terminsuche, Rückfragen, Bestätigung, Chef-KI EIN und AUS. Start: node tests/termin_verschieben_fix.js
   Alles über den ECHTEN Sprachweg: Mikrofon (Erkenner-Ereignis), Android-Brücke (__zaneRec) und Text (jvTippen).
   Der Entscheider (KI) ist eine Attrappe; Wetter, Websuche und Ortssuche laufen mit Attrappen für Netz und Suchdienste.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
const PL = [{ name: 'Trattoria Roma', street: 'Hauptstr.', housenumber: '1', city: 'Hamburg', lat: 53.551, lon: 10.001 }, { name: 'Fischerhaus Elbblick', street: 'Elbweg', housenumber: '2', city: 'Hamburg', lat: 53.545, lon: 9.95 }];
const WETTER_JETZT = { current: { temperature_2m: 9.4, apparent_temperature: 7.1, relative_humidity_2m: 80, precipitation: 0, weather_code: 3, wind_speed_10m: 12, windgusts_10m: 20 }, current_units: { temperature_2m: '°C' }, hourly: { time: [], precipitation: [], weather_code: [] } };
const WETTER_TAGE = { daily: { time: ['2026-11-05', '2026-11-06', '2026-11-07'], weather_code: [3, 61, 1], temperature_2m_max: [10, 8, 12], temperature_2m_min: [5, 4, 6], precipitation_sum: [0, 4, 0], precipitation_probability_max: [10, 80, 5], wind_speed_10m_max: [15, 25, 10], wind_gusts_10m_max: [25, 40, 15] } };

function umgebung(opt) {
    opt = opt || {};
    const st = { plan: { schritte: [] }, verhalten: '', wetter: 'ok', web: 'ok', places: 'ok', ent: 0, groq: 0, webN: 0, wetterN: 0, placesN: 0, entNachrichten: [], normaleSaetze: [], webHaengt: null };
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, spracherkennung: !opt.native, native: opt.native, fetch: async (u, o) => {
        u = String(u);
        if (/api\/groq/.test(u)) {
            let m = []; try { m = JSON.parse(o.body).messages || []; } catch (e) { }
            if (m[0] && /Du planst für einen Sprachassistenten/.test(String(m[0].content))) {
                st.ent++; st.entNachrichten.push(m);
                if (st.verhalten === 'haengt') return new Promise(() => { });
                if (st.verhalten === 'fehler') return { ok: false, status: 500, json: async () => ({}) };
                const a = typeof st.plan === 'function' ? st.plan(m) : st.plan;
                return ant({ choices: [{ message: { content: typeof a === 'string' ? a : JSON.stringify(a) } }] });
            }
            st.groq++; st.normaleSaetze.push(String((m[m.length - 1] || {}).content || ''));
            return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Okay.', actions: [] }) } }] });
        }
        if (/api\/geocode/.test(u)) { st.geoN = (st.geoN || 0) + 1; const q = decodeURIComponent((u.match(/q=([^&]*)/) || [])[1] || ''); st.geoQ = (st.geoQ || []).concat(q); if (st.geo === 'leer') return ant([]); return ant([{ lat: '53.55', lon: '10.0', display_name: q + ', Deutschland', class: st.geoKlasse || 'boundary', type: 'administrative' }]); }
        if (/open-meteo/.test(u)) { (st.wetterUrls = st.wetterUrls || []).push(u); st.wetterN++; if (st.wetter === 'fehler') throw new Error('offline'); return ant(/daily=/.test(u) && /current=/.test(u) ? Object.assign({}, WETTER_JETZT, WETTER_TAGE) : /daily=/.test(u) ? WETTER_TAGE : WETTER_JETZT); }
        if (/action=places/.test(u)) { st.placesN++; if (st.places === 'fehler') return { ok: false, status: 500, json: async () => ({}) }; return ant({ places: st.places === 'leer' ? [] : PL }); }
        if (/api\/memory/.test(u)) return ant({});
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.st = st;
    A.sb.answerWithWebSearch = async () => { st.webN++; if (st.web === 'haengt') return new Promise(res => { st.webHaengt = res; }); return st.web === 'fehler' ? null : 'Die Nachrichten: in Hamburg ist es ruhig.'; };
    A.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.1 });
    A.sb.navigator.geolocation.getCurrentPosition = (okf, err) => okf({ coords: { latitude: 53.5, longitude: 10.1 } });
    A.karten = []; A.sb.showActionCards = c => { A.karten.push(c); };
    A.sb.jvChef.an();
    return A;
}
async function lauf(A, aktion, zeitMs) {
    const g0 = A.gesagt.length;
    await A.lassLaufen(async () => { await aktion(); if (zeitMs) await new Promise(res => A.sb.setTimeout(res, zeitMs)); await warte(80); });
    await A.lassLaufen(async () => { await warte(60); });
    return A.gesagt.slice(g0);
}
const tippen = (A, s, z) => lauf(A, async () => { A.sb.jvTippen(s); }, z);
const mikro = (A, s, z) => lauf(A, async () => { A.erkenner[0].onresult({ resultIndex: 0, results: [[{ transcript: s, confidence: 0.9 }]] }); }, z);
const eing = A => A.sb.jvChef.eingaenge();
const codes = A => { const e = eing(A); return e.length ? e[e.length - 1].codes.join('>') : '(keiner)'; };
const plan = (...s) => ({ schritte: s });
const W = tag => ({ faehigkeit: 'wetter', params: tag ? { tag } : {} });
const O = (b, o) => ({ faehigkeit: 'ortssuche', params: o ? { suchbegriff: b, ort: o } : { suchbegriff: b } });
const AUF = t => ({ faehigkeit: 'aufgabe_erstellen', params: { text: t } });
const ERI = (t, z) => ({ faehigkeit: 'erinnerung_erstellen', params: z ? { text: t, zeit: z } : { text: t } });
const TER = (t, z) => ({ faehigkeit: 'termin_erstellen', params: { text: t, zeit: z } });
const GED = (k, w) => ({ faehigkeit: 'gedaechtnis_speichern', params: { schluessel: k, wert: w } });
const KON = p => ({ faehigkeit: 'kontakt_speichern', params: p });
const V = (s, extra) => ({ faehigkeit: 'termin_verschieben', params: Object.assign({ suche: s }, extra || {}) });
const Z1 = '2026-11-06T15:00:00';
const ZAHN = (id, iso, text) => ({ id: id || 'local_z1', text: text || 'Zahnarzt', date: 'x', isoDate: iso || '2026-11-06T15:00:00+01:00', location: '' });
const stand = A => JSON.stringify({ t: A.lese('todoEntries'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), k: A.lese('savedContacts'), m: A.lese('memoryItems') });
const termine = (A, ...l) => { A.lese('calendarEntries').length = 0; l.forEach(e => A.lese('calendarEntries').push(e)); return A; };
const zeitVon = (A, id) => { const e = A.lese('calendarEntries').find(x => x.id === (id || 'local_z1')); return e ? new Date(e.isoDate).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 16) : null; };
const anzahlUpdate = A => { A.upd = A.upd || 0; return A.upd; };
function zaehleUpdates(A) { const alt = A.sb.executeAction; A.upd = 0; A.sb.executeAction = async function (a) { if (a && a.type === 'calendar_update') A.upd++; return alt.apply(this, arguments); }; }
const mit = (A, s, p) => { A.st.plan = p; return tippen(A, s); };
const alles = A => A.gesagt.join(' | ');


const FRIS = { type: 'calendar', calendar_text: 'Friseurtermin', calendar_time: '2026-11-06T13:00:00+01:00' };
const neuCtx = () => ({ counter: 0, cards: [], notes: [], panel: null });
let idZaehler = 0;
async function anlegen(A, a) { await A.lassLaufen(() => A.sb.executeAction(a || FRIS, 'Erstelle einen Friseurtermin morgen um 13 Uhr', neuCtx())); A.lese('calendarEntries').forEach((e, i) => { if (/^local_\d+$/.test(e.id) && !e.__n) { e.id = 'local_t' + (++idZaehler); e.__n = 1; } }); }   // feste Uhr im Test: sonst bekämen zwei Termine dieselbe Kennung (echt sind es Zeitstempel in Millisekunden)
const fris = A => A.lese('calendarEntries').filter(e => /friseur/i.test(e.text));
const frisZeit = A => fris(A).length === 1 ? new Date(fris(A)[0].isoDate).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 16) : 'ANZAHL ' + fris(A).length;

(async () => {
    let A, r;
    /* ===== Ursache: die KI setzt beim Verschieben einen falschen Tag (heute/Wochentag) ===== */
    for (const tag of [undefined, 'heute', 'morgen', '2026-11-06', 'Freitag', 'nächste Woche']) {
        A = umgebung(); await anlegen(A);
        check('0 Voraussetzung: Termin liegt lokal (' + tag + ')', fris(A).length === 1);
        r = await mit(A, 'Verschiebe meinen Friseurtermin', plan(V('Friseurtermin', tag ? { tag } : {})));
        check('1 „Verschiebe meinen Friseurtermin“ (Tag der KI: ' + tag + '): Termin gefunden, es wird nach der neuen Zeit gefragt', r.length === 1 && /Auf wann soll ich „Friseurtermin“/.test(r[0]) && !/keinen passenden/.test(r[0]) && A.sb.jvChef.pauseOffen().was === 'zeit', JSON.stringify(r));
        r = await tippen(A, 'Auf Samstag um 15 Uhr');
        check('2 neue Zeit genannt (Tag der KI: ' + tag + '): alte und neue Zeit werden genannt, Bestätigung verlangt, noch nichts geändert', r.length === 1 && /Soll ich „Friseurtermin“/.test(r[0]) && /13:00/.test(r[0]) && /15:00/.test(r[0]) && frisZeit(A) === '2026-11-06 13:00', JSON.stringify(r) + frisZeit(A));
        r = await tippen(A, 'Ja');
        check('3 „Ja“: derselbe Termin steht auf Samstag 15 Uhr, genau EIN Friseurtermin (kein zweiter)', frisZeit(A) === '2026-11-07 15:00', frisZeit(A) + ' ' + JSON.stringify(r));
    }

    /* ===== Namensrückfrage: „Friseurtermin.“ gehört zur Verschiebeanfrage ===== */
    for (const antwort of ['Friseurtermin.', 'Friseurtermin', 'Mein Friseurtermin', 'Der Friseur', 'Friseur']) {
        A = umgebung(); await anlegen(A);
        r = await mit(A, 'Verschiebe meinen Termin', plan(V('')));
        check('4 ohne Namen: gezielte Frage nach dem Termin', r.length === 1 && /Welchen Termin/.test(r[0]) && A.sb.jvChef.pauseOffen().was === 'suche', JSON.stringify(r));
        A.st.plan = plan(V('Friseurtermin', { tag: 'heute' }));
        r = await tippen(A, antwort);
        check('5 Antwort „' + antwort + '“ gehört zur Anfrage: Termin gefunden, nach der Zeit gefragt, nicht noch einmal nach dem Namen', r.length === 1 && /Auf wann soll ich „Friseurtermin“/.test(r[0]) && !/keinen passenden/.test(r[0]), JSON.stringify(r));
        r = await tippen(A, 'Auf Freitag um 15 Uhr');
        check('5b „Auf Freitag um 15 Uhr“ → Bestätigungsfrage mit alter und neuer Zeit', r.length === 1 && /Soll ich/.test(r[0]) && /13:00/.test(r[0]) && /15:00/.test(r[0]), JSON.stringify(r));
        await tippen(A, 'Ja');
        check('5c nach Ja: Termin verschoben, nur einer', frisZeit(A) === '2026-11-06 15:00', frisZeit(A));
    }

    /* ===== Satzvarianten ===== */
    for (const [satz, such] of [['Verschiebe den Friseur', 'Friseur'], ['Verschiebe meinen Friseurtermin', 'meinen Friseurtermin'], ['Verschiebe den Friseurtermin auf Samstag um 10 Uhr', 'Friseurtermin']]) {
        A = umgebung(); await anlegen(A);
        r = await mit(A, satz, plan(V(such, { tag: 'heute' })));
        check('6 „' + satz + '“: Termin wird gefunden', r.length === 1 && !/keinen passenden/.test(r[0]) && /Friseurtermin/.test(r[0]), JSON.stringify(r));
        check('6 … und es wird nichts ohne Bestätigung geändert', frisZeit(A) === '2026-11-06 13:00');
    }

    /* ===== „Wann ist mein Friseurtermin?“ liefert nach dem Verschieben die neue Zeit ===== */
    A = umgebung(); await anlegen(A);
    await mit(A, 'Verschiebe meinen Friseurtermin auf Samstag um 15 Uhr', plan(V('Friseurtermin', { tag: 'heute' }))); await tippen(A, 'Ja');
    const gelesen = await A.lassLaufen(async () => A.sb.jvSchreibkern.kandidatenTermine({ suche: 'friseur' }));
    check('7 „Wann ist mein Friseurtermin?“: die Terminliste (Quelle der Antwort) liefert die NEUE Zeit, Samstag 15 Uhr, genau einen Termin', gelesen.wert.length === 1 && frisZeit(A) === '2026-11-07 15:00', frisZeit(A));

    /* ===== Zwei gleichnamige Termine: nachfragen ===== */
    A = umgebung(); await anlegen(A); await anlegen(A, { type: 'calendar', calendar_text: 'Friseurtermin', calendar_time: '2026-11-09T11:00:00+01:00' });
    check('8 Voraussetzung: zwei Friseurtermine', fris(A).length === 2);
    r = await mit(A, 'Verschiebe meinen Friseurtermin', plan(V('Friseurtermin', { tag: 'heute' })));
    check('8 zwei gleichnamige Termine: Jarvis fragt, welchen, mit beiden Zeiten', r.length === 1 && /mehrere passende Termine/.test(r[0]) && /1:/.test(r[0]) && /2:/.test(r[0]) && A.sb.jvChef.pauseOffen().was === 'wahl', JSON.stringify(r));
    r = await tippen(A, 'Der zweite');
    check('8b „Der zweite“: der zweite Termin wird gemeint, der erste bleibt', /Auf wann soll ich „Friseurtermin“/.test(r.join(' ')) && /9\. November/.test(r.join(' ')), JSON.stringify(r));
    await tippen(A, 'Auf Dienstag um 15 Uhr'); await tippen(A, 'Ja');
    const z = fris(A).map(e => new Date(e.isoDate).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 16)).sort();
    check('8c nach Ja ist nur der zweite verschoben, der erste unverändert, weiter zwei Termine', z.join() === '2026-11-06 13:00,2026-11-10 15:00', z.join());

    /* ===== Termin existiert nicht ===== */
    A = umgebung(); await anlegen(A);
    r = await mit(A, 'Verschiebe meinen Zahnarzttermin', plan(V('Zahnarzttermin')));
    check('9 nicht vorhandener Termin: verständliche Meldung, nichts geändert', r.length === 1 && /keinen passenden Termin gefunden/.test(r[0]) && frisZeit(A) === '2026-11-06 13:00', JSON.stringify(r));
    A.st.plan = plan(V('Friseurtermin'));
    r = await tippen(A, 'Dann den Friseurtermin');
    check('9b … und die Korrektur („Dann den Friseurtermin“) führt weiter, kein Kreis', /Auf wann soll ich „Friseurtermin“/.test(r.join(' ')), JSON.stringify(r));

    /* ===== Nein / Abbruch ===== */
    A = umgebung(); await anlegen(A);
    await mit(A, 'Verschiebe meinen Friseurtermin auf Samstag um 15 Uhr', plan(V('Friseurtermin', { tag: 'heute' })));
    r = await tippen(A, 'Nein');
    check('10 „Nein“: Termin unverändert, kein zweiter, Frage geschlossen', frisZeit(A) === '2026-11-06 13:00' && A.sb.jvChef.pauseOffen() === null, JSON.stringify(r) + frisZeit(A));

    /* ===== Google nicht verbunden: lokale Änderung wird ehrlich gemeldet ===== */
    A = umgebung(); await anlegen(A);
    await mit(A, 'Verschiebe meinen Friseurtermin auf Samstag um 15 Uhr', plan(V('Friseurtermin')));
    r = await tippen(A, 'Ja');
    check('11 ohne Google: Termin lokal verschoben UND ehrlicher Hinweis, dass es nur in der App gilt', frisZeit(A) === '2026-11-07 15:00' && /nur in der App|nicht (?:bei|mit) Google|Google/i.test(r.join(' ')), JSON.stringify(r));

    /* ===== Bisheriger KI-Weg (Chef-KI aus): Aktion calendar_update direkt, mit Rückfrage ===== */
    for (const q of ['Friseurtermin', 'meinen Friseurtermin', 'Friseur', 'friseurtermin']) {
        A = umgebung(); await anlegen(A);
        let fehl = null; try { await A.lassLaufen(() => A.sb.executeAction({ type: 'calendar_update', calendar_query: q, calendar_time: '2026-11-07T15:00:00+01:00' }, 'Verschiebe meinen Friseurtermin auf Samstag um 15 Uhr', neuCtx())); } catch (e) { fehl = e; }
        check('12 alter KI-Weg (Suchbegriff „' + q + '“): Termin gefunden, Rückfrage mit Namen, noch nichts geändert', !!fehl && /Friseurtermin/.test(String(fehl.userMessage || fehl.message)) && frisZeit(A) === '2026-11-06 13:00', String(fehl && (fehl.userMessage || fehl.message)));
        await A.sb.jvLoeschFrage.antworte(true); await warte(80); await A.lassLaufen(async () => { await warte(60); });
        check('12b … nach Ja derselbe Termin verschoben, nur einer', frisZeit(A) === '2026-11-07 15:00', frisZeit(A));
    }
    A = umgebung(); await anlegen(A);
    try { await A.lassLaufen(() => A.sb.executeAction({ type: 'calendar_update', calendar_query: 'Friseurtermin', calendar_time: '2026-11-07T15:00:00+01:00' }, 'Verschiebe', neuCtx())); } catch (e) { }
    await A.sb.jvLoeschFrage.antworte(false);
    check('12c alter KI-Weg, Nein: Termin unverändert', frisZeit(A) === '2026-11-06 13:00');

    /* ===== Chef-KI AUS: nichts vom Chef-Weg ===== */
    A = umgebung(); A.sb.jvChef.aus(); await anlegen(A);
    r = await mit(A, 'Verschiebe meinen Friseurtermin', plan(V('Friseurtermin')));
    check('13 Chef-KI aus: der Planer wird nicht gefragt, nichts geändert', A.st.ent === 0 && frisZeit(A) === '2026-11-06 13:00', 'Planer ' + A.st.ent);

    console.log('TERMIN-VERSCHIEBEN-FIX: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})();
