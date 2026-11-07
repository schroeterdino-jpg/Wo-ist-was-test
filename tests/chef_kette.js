/* ============================================================
   TESTS Chef-KI "Kette" (Phase 2): Ergebnisweitergabe zwischen lesenden Schritten, Erfolgsprüfung, sicherer Fallback, Zeitüberschreitung, Bestätigungspflicht, Rückkehr zum bisherigen Weg.
   Start: node tests/chef_kette.js. Alles über den ECHTEN Sprachweg (jvTippen); der Entscheider (KI) ist eine Attrappe, Dienste laufen mit Attrappen.
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
const WEB = f => ({ faehigkeit: 'websuche', params: { frage: f } });
const SW = 'Brauche ich heute einen Regenschirm oder eine Jacke';
const SW2 = 'Wie wird das Wetter morgen';
const SWEB = 'Schau mal nach was heute im Kino läuft';
const SO = 'Mir knurrt der Magen wo gibt es hier was Warmes';
const SK = 'Wie wird das Wetter morgen und wo gibt es hier ein Restaurant';
const SWK = 'Wie wird das Wetter morgen und schau mal nach was heute im Kino läuft';


const SATZ = 'Bitte erledige das mit meiner Aufgabenliste heute';
const AUF = t => ({ faehigkeit: 'aufgabe_erstellen', params: { text: t } });
const ERI = (t, z) => ({ faehigkeit: 'erinnerung_erstellen', params: z ? { text: t, zeit: z } : { text: t } });
const TER = (t, z, extra) => ({ faehigkeit: 'termin_erstellen', params: Object.assign({ text: t, zeit: z }, extra || {}) });
const TLES = tag => ({ faehigkeit: 'termine_lesen', params: tag ? { tag } : {} });
const ALES = { faehigkeit: 'aufgaben_lesen', params: {} };
const GED = (k, w) => ({ faehigkeit: 'gedaechtnis_speichern', params: { schluessel: k, wert: w } });
const KON = p => ({ faehigkeit: 'kontakt_speichern', params: p });
const Z1 = '2026-11-06T15:00:00', Z2 = '2026-11-06T18:30:00';
const stand = A => JSON.stringify({ t: A.lese('todoEntries'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), k: A.lese('savedContacts'), m: A.lese('memoryItems') });
const n = (A, l) => (A.lese(l) || []).length;
async function satz(A, plan0, s) { A.st.plan = plan0; return tippen(A, s || SATZ); }
const geschrieben = A => A.lese('todoEntries').length + A.lese('reminderEntries').length + A.lese('calendarEntries').length;

const OA = (b, aus) => Object.assign(O(b), {});
const mitAus = (s, aus) => Object.assign({}, s, { aus: aus });
const SWEB2 = 'Such mal raus wer gestern das Spiel gewonnen hat';
const SKETTE = 'Mir knurrt der Magen wo gibt es hier was Warmes und wie wird das Wetter morgen';

(async () => {
    /* ---- 1. Mehrere lesende Werkzeuge hintereinander + Ergebnisweitergabe ---- */
    {
        const A = umgebung();
        A.st.plan = plan(O('Restaurant'), mitAus(W('morgen'), { ort: { schritt: 1, feld: 'orte' } }));
        const g = await tippen(A, SKETTE);
        check('1.1 zwei Schritte nacheinander, GENAU eine gesprochene Antwort', g.length === 1 && A.st.placesN === 1 && A.st.geoN === 1 && A.st.groq === 0, JSON.stringify(g) + ' places=' + A.st.placesN + ' geo=' + A.st.geoN);
        check('1.2 Ergebnisweitergabe: Schritt 2 (Wetter) bekam den Ort aus dem ECHTEN Ergebnis von Schritt 1 (Name des ersten Treffers), nicht vom Modell', (A.st.geoQ || [])[0] === 'Trattoria Roma', JSON.stringify(A.st.geoQ));
        check('1.3 beide Ergebnisse stehen in der einen Antwort', /Trattoria Roma/.test(g[0]) && /morgen|Grad/i.test(g[0]), g[0]);
    }
    /* ---- 2. Ungültige Übernahmen werden vom Planprüfer verworfen ---- */
    {
        const J = A0 => A0.sb.jvChef;
        const A = umgebung(), c = A.sb.jvChef;
        const gut = c.pruefePlan({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }, { faehigkeit: 'wetter', params: {}, aus: { ort: { schritt: 1, feld: 'orte' } } }] });
        check('2.1 gültige Übernahme bleibt im Plan', gut.ok && gut.plan.schritte[1].aus && gut.plan.schritte[1].aus.ort.schritt === 1, JSON.stringify(gut.probleme));
        const vor = c.pruefePlan({ schritte: [{ faehigkeit: 'wetter', params: {}, aus: { ort: { schritt: 1, feld: 'orte' } } }] });
        check('2.2 Übernahme im ersten Schritt (kein Vorgänger) ist ungültig', !vor.ok);
        const feld = c.pruefePlan({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }, { faehigkeit: 'wetter', params: {}, aus: { ort: { schritt: 1, feld: 'gibtEsNicht' } } }] });
        check('2.3 Feld, das die Registry für die Quelle nicht beschreibt, ist ungültig', !feld.ok);
        const ziel = c.pruefePlan({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }, { faehigkeit: 'wetter', params: {}, aus: { tag: { schritt: 1, feld: 'nachricht' } } }] });
        check('2.4 nur ort, suchbegriff und frage dürfen übernommen werden (nicht tag)', !ziel.ok);
        const vorwaerts = c.pruefePlan({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' }, aus: { ort: { schritt: 2, feld: 'orte' } } }, { faehigkeit: 'wetter', params: {} }] });
        check('2.5 Übernahme aus einem späteren Schritt ist ungültig', !vorwaerts.ok);
        const schreib = c.pruefePlan({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }, { faehigkeit: 'erinnerung_erstellen', params: { text: 'Pizza', zeit: Z1 }, aus: { ort: { schritt: 1, feld: 'orte' } } }] });
        check('2.6 schreibende Schritte dürfen nichts übernehmen', !schreib.ok);
        A.st.plan = plan(O('Restaurant'), mitAus(W('morgen'), { ort: { schritt: 1, feld: 'orte' } }), AUF('Pizza bestellen'));
        const g = await tippen(A, SKETTE);
        check('2.7 Kette zusammen mit einem Schreibschritt wird nicht ausgeführt (Plan abgelehnt, bisheriger Weg)', A.st.placesN === 0 && A.st.groq === 1, 'places=' + A.st.placesN + ' groq=' + A.st.groq);
    }
    /* ---- 3. Erfolgsprüfung (pruefeErfolg) wird im Ablauf wirklich benutzt ---- */
    {
        const A = umgebung();
        A.st.places = 'leer';   // Ortssuche findet nichts brauchbares
        A.st.plan = plan(O('Restaurant'), mitAus(W('morgen'), { ort: { schritt: 1, feld: 'orte' } }));
        const g = await tippen(A, SKETTE);
        check('3.1 hat Schritt 1 kein geprüftes Ergebnis, wird NICHTS aus ihm übernommen (Wetter wird nicht mit erfundenem Ort geholt)', (A.st.geoN || 0) === 0 && !/Trattoria/.test((g || []).join(' ')), JSON.stringify(g) + ' geo=' + A.st.geoN);
        const A2 = umgebung();
        const reg0 = A2.sb.jvRegistry.registriere({ name: 'test_lesen', beschreibung: 'Testwerkzeug', pflicht: [], optional: [], rueckgabe: { beschreibung: 'x', felder: ['nachricht'] }, fehler: [{ status: 'TOOL_FAILED', wann: 'Test' }], fallbacks: [], bestaetigung: { noetig: false, grund: 'Test: reine Auskunft' }, pruefeErfolg: d => !!d && d.ok === true, verbindung: { datei: 'test', funktion: 'test' }, verfuegbar: () => true, ausfuehren: async () => ({ ok: false, nachricht: 'Behauptet Erfolg' }) });
        check('3.2a Testwerkzeug ist registriert', reg0.ok, JSON.stringify(reg0));
        const r = await A2.sb.jvRegistry.fuehreAus('test_lesen', {}, {});
        check('3.2 Registry-Prüfung: behauptet ein Werkzeug Erfolg ohne Nachweis, ist es TOOL_FAILED', r.status === 'TOOL_FAILED', r.status);
    }
    /* ---- 4. Fehler und sicherer Fallback ---- */
    {
        const A = umgebung();
        A.st.wetter = 'fehler';
        A.st.plan = plan(W('morgen'));
        const g = await tippen(A, 'Brauche ich morgen einen Regenschirm oder eine Jacke');
        check('4.1 Wetter-Fehler: der deklarierte Fallback (Websuche) wird versucht und beantwortet, genau eine Antwort, kein Rückfall auf den alten Weg', g.length === 1 && A.st.webN === 1 && /Hamburg ist es ruhig/.test(g[0]) && A.st.groq === 0, JSON.stringify(g) + ' web=' + A.st.webN + ' groq=' + A.st.groq);
        const A2 = umgebung();
        A2.st.wetter = 'fehler'; A2.st.web = 'fehler';
        A2.st.plan = plan(W('morgen'));
        const g2 = await tippen(A2, 'Brauche ich morgen einen Regenschirm oder eine Jacke');
        check('4.2 auch der Fallback scheitert: höchstens EIN Fallback, dann genau einmal der bisherige Jarvis-Weg', A2.st.webN === 1 && A2.st.groq === 1, 'web=' + A2.st.webN + ' groq=' + A2.st.groq + ' ' + JSON.stringify(g2));
        const A3 = umgebung();
        A3.st.places = 'fehler';
        A3.st.plan = plan(O('Restaurant'));
        const g3 = await tippen(A3, SO);
        check('4.3 Ortssuche-Fehler: Websuche als Fallback mit dem Wortlaut des Nutzers', A3.st.webN === 1 && g3.length === 1, JSON.stringify(g3) + ' web=' + A3.st.webN);
        const A4 = umgebung();
        A4.st.web = 'fehler';
        A4.st.plan = plan(WEB(SWEB2));
        const g4 = await tippen(A4, SWEB2);
        check('4.4 für die Websuche gibt es keinen Fallback (kein Kreis): ein Versuch, dann bisheriger Weg', A4.st.webN === 1 && A4.st.groq === 1, 'web=' + A4.st.webN + ' groq=' + A4.st.groq);
    }
    /* ---- 5. Zeitüberschreitung ---- */
    {
        const A = umgebung();
        A.st.web = 'haengt';
        A.st.plan = plan(WEB(SWEB2));
        const g = await tippen(A, SWEB2, 22000);
        check('5.1 hängt ein Werkzeug über das Zeitbudget, wird nichts nachträglich gesprochen und genau einmal der bisherige Weg genommen', A.st.webN === 1 && A.st.groq === 1 && g.every(x => !/Nachrichten: in Hamburg/.test(x)), JSON.stringify(g) + ' groq=' + A.st.groq);
        A.st.webHaengt && A.st.webHaengt('spät');
        await warte(40);
        check('5.2 die verspätete Antwort wird verworfen (nichts doppelt gesagt)', A.gesagt.filter(x => /spät/.test(x)).length === 0);
    }
    /* ---- 6. Bestätigungspflicht bleibt ---- */
    {
        const A = umgebung();
        const r = await A.sb.jvChef.verarbeite('Verschiebe den Zahnarzt', { entscheider: async () => plan(Object.assign({ faehigkeit: 'termin_verschieben', params: { suche: 'zahnarzt', neue_zeit: Z2 } })) });
        check('6.1 ein Schritt, der eine Bestätigung braucht, wird ohne Bestätigung nicht ausgeführt', !r.schritte || r.schritte.every(s => !s.ausgefuehrt), JSON.stringify(r).slice(0, 200));
        const A2 = umgebung();
        A2.st.plan = plan(mitAus(AUF('x'), { ort: { schritt: 1, feld: 'orte' } }));
        const g = await tippen(A2, SATZ);
        check('6.2 über die Kette lässt sich keine Schreib-Aktion an der Bestätigung vorbei auslösen', A2.lese('todoEntries') === undefined || (A2.lese('todoEntries') || []).length === 0);
    }
    /* ---- 7. Rückkehr zum bisherigen Weg / Standard AUS ---- */
    {
        const A = umgebung();
        A.sb.jvChef.aus();
        const g = await tippen(A, SKETTE);
        check('7.1 Chef-KI AUS: kein Plan-Aufruf, nichts von der Kette, der bisherige Weg antwortet', A.st.ent === 0 && A.st.placesN === 0 && A.st.groq === 1, 'ent=' + A.st.ent + ' places=' + A.st.placesN + ' groq=' + A.st.groq);
        const A2 = umgebung();
        A2.st.plan = 'das ist kein json';
        const g2 = await tippen(A2, SKETTE);
        check('7.2 ungültiger Plan: bisheriger Weg genau einmal', A2.st.groq === 1);
        const fresh = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, fetch: async () => { throw new Error('offline'); } });
        check('7.3 frisch gestartet ist die Chef-KI AUS (keine automatische Aktivierung)', fresh.sb.jvChef.istAn() === false);
    }
    console.log('Chef-Kette: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
