/* ============================================================
   TESTS Paket B2b-1: Termine verschieben mit Bestätigung, Rückfragen, Kontext, Mehrschritt-Fortsetzung (Chef-KI EIN): Start: node tests/chef_b2b.js
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

(async () => {
    let A, r;
    const SV = 'Verschiebe den Zahnarzt auf Freitag um 15 Uhr';

    /* ===== 1 Eindeutiger Termin: erst Frage, dann (nur nach Ja) verschieben, danach prüfen ===== */
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); const s1 = stand(A);
    r = await mit(A, SV, plan(V('Zahnarzt')));
    check('1a eindeutiger Termin: genau EINE Rückfrage mit der konkreten Änderung, noch nichts geändert', r.length === 1 && /Soll ich/.test(r[0]) && /Zahnarzt/.test(r[0]) && /15:00 Uhr/.test(r[0]) && /Ja oder Nein/.test(r[0]) && stand(A) === s1 && A.upd === 0 && A.st.groq === 0, JSON.stringify(r));
    check('1b offene Bestätigung ist EINE Aktion (Art: Bestätigung, Schritt 0), kein alter KI-Weg', JSON.stringify(A.sb.jvChef.pauseOffen()) === JSON.stringify({ art: 'bestaetigung', was: 'ja', naechsterSchritt: 0 }) && A.sb.jvFrage.aktuell() === 'chef');
    r = await tippen(A, 'Ja');
    check('1c „Ja“: Termin steht auf Freitag 15 Uhr, genau EIN Update, Erfolg wurde geprüft und ehrlich gesagt', zeitVon(A) === '2026-11-06 15:00' && A.upd === 1 && r.length === 1 && /verschoben/.test(r[0]) && A.lese('calendarEntries').length === 1 && A.sb.jvChef.pauseOffen() === null && A.st.groq === 0, JSON.stringify([r, zeitVon(A), A.upd]));
    r = await tippen(A, 'Ja');
    check('1d ein zweites „Ja“ löst nichts mehr aus (kein zweites Update, keine Doppelbuchung)', A.upd === 1 && A.lese('calendarEntries').length === 1 && zeitVon(A) === '2026-11-06 15:00', JSON.stringify([r, A.upd]));
    check('1e Diagnose ohne Satzinhalt, mit Codes', /bestaetigung_gefragt/.test(JSON.stringify(eing(A))) && /bestaetigung_ja/.test(JSON.stringify(eing(A))) && !/Zahnarzt/.test(JSON.stringify(eing(A))) && !/Zahnarzt/.test(JSON.stringify(A.sb.jvChef.protokoll())));

    /* ===== 2 Relative Angaben ===== */
    const REL = [['Verschiebe den Zahnarzt eine Stunde später', '2026-11-06 16:00', 'eine Stunde später'], ['Verschiebe den Zahnarzt eine Stunde früher', '2026-11-06 14:00', 'eine Stunde früher'], ['Verschiebe den Zahnarzt einen Tag nach hinten', '2026-11-07 15:00', 'einen Tag nach hinten'], ['Verschiebe den Zahnarzt um 30 Minuten später', '2026-11-06 15:30', '30 Minuten später'], ['Verschiebe den Zahnarzt anderthalb Stunden früher', '2026-11-06 13:30', 'anderthalb Stunden früher'], ['Verschiebe den Zahnarzt zwei Tage später', '2026-11-08 15:00', 'zwei Tage später']];
    for (const [satz, soll, name] of REL) {
        A = umgebung(); termine(A, ZAHN()); zaehleUpdates(A);
        const f = await mit(A, satz, plan(V('Zahnarzt')));
        const vorher = zeitVon(A);
        await tippen(A, 'Ja');
        check('2 relativ „' + name + '“: erst Frage (nichts geändert), nach Ja genau die berechnete Zeit ' + soll, vorher === '2026-11-06 15:00' && zeitVon(A) === soll && A.upd === 1 && /Soll ich/.test(f[0]), JSON.stringify([f, zeitVon(A)]));
    }
    A = umgebung(); termine(A, ZAHN()); zaehleUpdates(A);
    await mit(A, 'Verschiebe den Zahnarzt um eine Stunde', plan(V('Zahnarzt')));
    check('2g ohne Richtung („um eine Stunde“): nicht raten, nach dem Ziel fragen, nichts geändert', zeitVon(A) === '2026-11-06 15:00' && A.upd === 0 && /Auf wann/.test(alles(A)) && A.sb.jvChef.pauseOffen().was === 'zeit', alles(A));

    /* ===== 3 Absolut: nur Tag / nur Uhrzeit / Wochentag + Uhrzeit ===== */
    const ABS = [['Verschiebe den Zahnarzt auf 17 Uhr', '2026-11-06 17:00'], ['Verschiebe den Zahnarzt auf Montag', '2026-11-09 15:00'], ['Verschiebe den Zahnarzt auf Montag um 9:30 Uhr', '2026-11-09 09:30'], ['Verschiebe den Zahnarzt auf den 12.11. um 8 Uhr', '2026-11-12 08:00'], ['Verschiebe den Zahnarzt auf übermorgen', '2026-11-07 15:00']];
    for (const [satz, soll] of ABS) {
        A = umgebung(); termine(A, ZAHN()); zaehleUpdates(A);
        await mit(A, satz, plan(V('Zahnarzt'))); await tippen(A, 'Ja');
        check('3 absolut „' + satz.replace('Verschiebe den Zahnarzt ', '') + '“ → ' + soll, zeitVon(A) === soll && A.upd === 1, zeitVon(A));
    }
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-06T15:00:00+01:00'), ZAHN('local_z2', '2026-11-09T09:00:00+01:00', 'Friseur')); zaehleUpdates(A);
    await mit(A, 'Verschiebe den Zahnarzt am Freitag auf Montag um 10 Uhr', plan(V('Zahnarzt'))); await tippen(A, 'Ja');
    check('3f „am Freitag“ gehört zum BESTEHENDEN Termin, Ziel ist Montag 10 Uhr; der andere Termin bleibt unberührt', zeitVon(A) === '2026-11-09 10:00' && zeitVon(A, 'local_z2') === '2026-11-09 09:00' && A.upd === 1, JSON.stringify([zeitVon(A), zeitVon(A, 'local_z2')]));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A);
    await mit(A, 'Verschiebe den Zahnarzt auf Freitag um 15 Uhr', plan(V('Zahnarzt', { neue_zeit: '2030-01-01T10:00:00', termin_id: 'fremd' })));
    check('3g die Zeit kommt NIE vom Planer: eigene Angaben des Planers (neue_zeit, termin_id) werden verworfen; Satz zählt', /Zahnarzt/.test(alles(A)) && A.upd === 0 && /Soll ich/.test(alles(A)) && !/2030/.test(alles(A)) && /15:00 Uhr/.test(alles(A)), alles(A));

    /* ===== 4 Mehrere gleichnamige Termine ===== */
    const ZWEI = () => termine(umgebung(), ZAHN('local_z1', '2026-11-06T10:00:00+01:00'), ZAHN('local_z2', '2026-11-09T14:00:00+01:00'));
    A = ZWEI(); zaehleUpdates(A);
    r = await mit(A, 'Verschiebe den Zahnarzt auf 16 Uhr', plan(V('Zahnarzt')));
    check('4a zwei gleichnamige Termine: nummerierte Rückfrage mit Tag und Uhrzeit, nichts geändert', /1: Zahnarzt/.test(r[0]) && /2: Zahnarzt/.test(r[0]) && /Welchen meinst du/.test(r[0]) && A.upd === 0 && A.sb.jvChef.pauseOffen().was === 'wahl', JSON.stringify(r));
    r = await tippen(A, 'Den zweiten');
    check('4b „Den zweiten“: jetzt die Bestätigung für GENAU den Montags-Termin, noch nichts geändert', /Soll ich/.test(r[0]) && /Montag/.test(r[0]) && /16:00 Uhr/.test(r[0]) && A.upd === 0 && A.sb.jvChef.pauseOffen().art === 'bestaetigung', JSON.stringify(r));
    await tippen(A, 'Ja');
    check('4c nach „Ja“: nur der zweite Termin ist verschoben, der erste unberührt, kein Duplikat', zeitVon(A, 'local_z2') === '2026-11-09 16:00' && zeitVon(A, 'local_z1') === '2026-11-06 10:00' && A.upd === 1 && A.lese('calendarEntries').length === 2);
    A = ZWEI(); zaehleUpdates(A);
    r = await mit(A, 'Verschiebe den ersten Zahnarzt auf 16 Uhr', plan(V('Zahnarzt')));
    check('4d „den ersten“ schon im Satz: direkt die Bestätigung für den Freitags-Termin', /Soll ich/.test(r[0]) && /morgen/.test(r[0]) && A.upd === 0, JSON.stringify(r));
    A = ZWEI(); r = await mit(A, 'Verschiebe den Zahnarzt auf 16 Uhr', plan(V('Zahnarzt'))); r = await tippen(A, 'Den fünften');
    check('4e Nummer gibt es nicht: erneute Rückfrage, nichts geraten', /gibt es nicht/.test(r[0]) && A.sb.jvChef.pauseOffen().was === 'wahl' && A.upd !== 1);
    A = ZWEI(); await mit(A, 'Verschiebe den Zahnarzt auf 16 Uhr', plan(V('Zahnarzt'))); r = await tippen(A, 'Ja');
    check('4f auf die Auswahl-Frage nur „Ja“: nicht raten (einmal nachfragen), nichts geändert', /nicht eindeutig/.test(r[0]) && zeitVon(A, 'local_z1') === '2026-11-06 10:00' && zeitVon(A, 'local_z2') === '2026-11-09 14:00');
    A = ZWEI(); zaehleUpdates(A); await mit(A, 'Verschiebe den Zahnarzt am Montag auf 16 Uhr', plan(V('Zahnarzt')));
    check('4g „am Montag“ macht den Termin eindeutig: direkt Bestätigung, keine Nummernfrage', /Soll ich/.test(alles(A)) && !/Welchen meinst du/.test(alles(A)) && A.sb.jvChef.pauseOffen().art === 'bestaetigung');

    /* ===== 5 Fehlende Angaben ===== */
    A = umgebung(); termine(A, ZAHN()); zaehleUpdates(A);
    r = await mit(A, 'Verschiebe den Zahnarzt', plan(V('Zahnarzt')));
    check('5a ohne Ziel: gezielte Frage „Auf wann …“, nichts geändert', /Auf wann/.test(r[0]) && /Zahnarzt/.test(r[0]) && A.upd === 0 && A.sb.jvChef.pauseOffen().was === 'zeit', JSON.stringify(r));
    r = await tippen(A, 'Freitag um 17 Uhr');
    check('5b Antwort „Freitag um 17 Uhr“ ergibt die Bestätigung (nicht sofort verschoben)', /Soll ich/.test(r[0]) && /17:00 Uhr/.test(r[0]) && A.upd === 0 && zeitVon(A) === '2026-11-06 15:00', JSON.stringify(r));
    await tippen(A, 'Ja');
    check('5c … und nach „Ja“ steht der Termin auf 17 Uhr', zeitVon(A) === '2026-11-06 17:00' && A.upd === 1);
    A = umgebung(); termine(A, ZAHN()); zaehleUpdates(A); await mit(A, 'Verschiebe den Zahnarzt', plan(V('Zahnarzt'))); r = await tippen(A, 'Um 16 Uhr');
    check('5d Antwort nur „Um 16 Uhr“: Tag bleibt, Bestätigung für 16 Uhr', /16:00 Uhr/.test(r[0]) && /Soll ich/.test(r[0]));
    A = umgebung(); termine(A, ZAHN()); zaehleUpdates(A); await mit(A, 'Verschiebe den Zahnarzt', plan(V('Zahnarzt'))); r = await tippen(A, 'Eine Stunde später');
    check('5e Antwort „Eine Stunde später“ wird richtig zugeordnet', /16:00 Uhr/.test(r[0]) && /Soll ich/.test(r[0]));
    A = umgebung(); termine(A, ZAHN()); zaehleUpdates(A); await mit(A, 'Verschiebe den Zahnarzt', plan(V('Zahnarzt'))); r = await tippen(A, 'Banane'); const r2 = await tippen(A, 'Banane');
    check('5f unverständliche Antwort: höchstens EINE erneute Rückfrage, dann Abbruch ohne Änderung', /nicht eindeutig verstanden/.test(r[0]) && /nichts geändert/.test(r2[0]) && A.sb.jvChef.pauseOffen() === null && A.upd === 0 && zeitVon(A) === '2026-11-06 15:00', JSON.stringify([r, r2]));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); r = await mit(A, 'Verschiebe den Friseur auf 15 Uhr', plan(V('Friseur')));
    check('5g Termin nicht gefunden: nach dem Namen fragen, nichts geraten', /keinen passenden Termin/.test(r[0]) && A.upd === 0);
    r = await tippen(A, 'Zahnarzt');
    check('5h Antwort „Zahnarzt“: weiter mit der Bestätigung', /Soll ich/.test(r[0]) && /Zahnarzt/.test(r[0]) && A.upd === 0, JSON.stringify(r));
    A = umgebung(); termine(A, ZAHN()); zaehleUpdates(A); r = await mit(A, 'Verschiebe den Zahnarzt auf heute 8 Uhr', plan(V('Zahnarzt')));
    check('5i Zeit liegt in der Vergangenheit: Rückfrage statt Verschieben', /Vergangenheit/.test(alles(A)) && A.upd === 0 && zeitVon(A) === '2026-11-06 15:00', alles(A));
    A = umgebung(); termine(A, { id: 'local_g', text: 'Geburtstag Oma', date: 'x', isoDate: '2026-11-08', location: '' }); zaehleUpdates(A);
    r = await mit(A, 'Verschiebe den Geburtstag eine Stunde später', plan(V('Geburtstag')));
    check('5j ganztägiger Termin kann nicht um Stunden verschoben werden: Rückfrage, nichts geändert', /ganztägig/.test(r[0]) && A.upd === 0);

    /* ===== 6 Ablehnung, unklare Antwort, Ablauf ===== */
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt'))); r = await tippen(A, 'Nein');
    check('6a „Nein“: nichts verschoben, ehrliche Antwort, Bestätigung beendet', zeitVon(A) === '2026-11-07 10:00' && A.upd === 0 && /nichts verschoben/.test(r[0]) && A.sb.jvChef.pauseOffen() === null, JSON.stringify(r));
    await tippen(A, 'Ja');
    check('6b ein späteres „Ja“ nach „Nein“ verschiebt nichts', A.upd === 0 && zeitVon(A) === '2026-11-07 10:00');
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt'))); r = await tippen(A, 'Vielleicht');
    check('6c unklare Antwort („Vielleicht“): EINE erneute Rückfrage mit derselben Änderung, nichts verschoben', /nicht eindeutig/.test(r[0]) && /Soll ich/.test(r[0]) && A.upd === 0 && A.sb.jvChef.pauseOffen().art === 'bestaetigung', JSON.stringify(r));
    r = await tippen(A, 'Ja');
    check('6d … danach gilt ein klares „Ja“ (genau einmal)', A.upd === 1 && zeitVon(A) === '2026-11-06 15:00');
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt'))); await tippen(A, 'Jein'); r = await tippen(A, 'Hmm');
    check('6e zweite unklare Antwort: Abbruch ohne Änderung', /nichts geändert/.test(r[0]) && A.upd === 0 && A.sb.jvChef.pauseOffen() === null && zeitVon(A) === '2026-11-07 10:00', JSON.stringify(r));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt'))); r = await tippen(A, 'Ja aber lieber um 16 Uhr');
    check('6f „Ja aber …“ zählt NICHT als Zustimmung', A.upd === 0 && zeitVon(A) === '2026-11-07 10:00');
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt'))); await A.vorspulen(121000); r = await tippen(A, 'Ja');
    check('6g abgelaufene Bestätigung (über 2 Minuten): „Ja“ verschiebt NICHTS, ehrlicher Hinweis', A.upd === 0 && zeitVon(A) === '2026-11-07 10:00' && /abgelaufen/.test(r.join(' ')) && A.sb.jvChef.pauseOffen() === null, JSON.stringify(r));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt'))); await A.vorspulen(100000); await tippen(A, 'Ja');
    check('6h kurz vor Ablauf (100 s) gilt die Bestätigung noch', A.upd === 1 && zeitVon(A) === '2026-11-06 15:00');
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt')));
    A.lese('calendarEntries')[0].isoDate = '2026-11-08T10:00:00+01:00'; await tippen(A, 'Ja');
    check('6i der Termin hat sich zwischen Frage und „Ja“ geändert: NICHT verschoben, ehrlicher Hinweis', A.upd === 0 && /geändert|nicht mehr/.test(alles(A)) && zeitVon(A) === '2026-11-08 10:00', alles(A));

    /* ===== 7 Neuer Befehl / andere Rückfragen ===== */
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt')));
    r = await mit(A, 'Wie wird das Wetter morgen', plan(W('morgen')));
    check('7a ein neuer, unabhängiger Befehl beendet die offene Bestätigung und läuft normal (Wetter)', A.sb.jvChef.pauseOffen() === null && A.st.wetterN > 0 && A.upd === 0, JSON.stringify([r, A.st.wetterN]));
    await tippen(A, 'Ja');
    check('7b … ein späteres „Ja“ verschiebt nichts', A.upd === 0 && zeitVon(A) === '2026-11-07 10:00');
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt')));
    A.sb.jvFrage.neu('termin-erinnern'); r = await tippen(A, 'Ja');
    check('7c zwei Rückfragen offen: eine jüngere Frage eines anderen Moduls bekommt das „Ja“; die Chef-KI verschiebt NICHTS', A.upd === 0 && zeitVon(A) === '2026-11-07 10:00', JSON.stringify(r));
    r = await tippen(A, 'Ja');
    check('7d … und die überholte Chef-Bestätigung bleibt für immer tot (kein späteres Ja löst sie aus)', A.upd === 0 && A.sb.jvChef.pauseOffen() === null);
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt')));
    A.st.plan = plan(V('Zahnarzt')); await tippen(A, 'Verschiebe den Zahnarzt auf Montag um 9 Uhr');
    check('7e neue Verschiebe-Anfrage ersetzt die alte Bestätigung: es gibt nur EINE offene, und sie nennt Montag 9 Uhr', A.sb.jvChef.pauseOffen().art === 'bestaetigung' && /Montag/.test(A.gesagt[A.gesagt.length - 1]) && A.upd === 0);
    await tippen(A, 'Ja');
    check('7f … ein „Ja“ führt nur diese eine aus', A.upd === 1 && zeitVon(A) === '2026-11-09 09:00');
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt'))); A.sb.jvChef.aus(); await tippen(A, 'Ja');
    check('7g Chef-KI wird ausgeschaltet: die offene Bestätigung ist weg, „Ja“ verschiebt nichts', A.upd === 0 && zeitVon(A) === '2026-11-07 10:00' && A.sb.jvChef.pauseOffen() === null);
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt')));
    A.st.plan = plan(AUF('Blumen kaufen')); await tippen(A, 'Setz Blumen kaufen auf meine Aufgabenliste');
    check('7h eine andere Rückfrage-freie Anfrage (Aufgabe) läuft normal; die Bestätigung ist dadurch beendet, nichts verschoben', A.lese('todoEntries').length === 1 && A.upd === 0 && A.sb.jvChef.pauseOffen() === null);

    /* ===== 8 Drei zusammenhängende Aktionen mit Pause ===== */
    const DREI = 'Setz Blumen kaufen auf die Aufgabenliste und verschiebe den Zahnarzt auf Freitag um 15 Uhr und erinnere mich eine Stunde vorher';
    const PL3 = () => plan(AUF('Blumen kaufen'), V('Zahnarzt'), ERI('Zahnarzt', Z1));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A);
    r = await mit(A, DREI, PL3());
    check('8a Schritt 1 (Aufgabe) läuft, bei Schritt 2 wird pausiert und gefragt; Schritt 3 noch NICHT ausgeführt; EINE Antwort', A.lese('todoEntries').length === 1 && A.upd === 0 && A.lese('reminderEntries').length === 0 && r.length === 1 && /Erledigt/.test(r[0]) && /Soll ich/.test(r[0]), JSON.stringify(r));
    r = await tippen(A, 'Ja');
    check('8b nach „Ja“: Verschieben und Erinnerung ausgeführt, die Aufgabe NICHT noch einmal (genau 1), EINE zusammenfassende Antwort', A.lese('todoEntries').length === 1 && A.upd === 1 && zeitVon(A) === '2026-11-06 15:00' && A.lese('reminderEntries').length === 1 && r.length === 1 && /verschoben/.test(r[0]) && /Erledigt|Blumen/.test(r[0]) && A.st.groq === 0, JSON.stringify([r, A.lese('todoEntries').length, A.lese('reminderEntries').length]));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, DREI, PL3()); r = await tippen(A, 'Nein');
    check('8c „Nein“ beim mittleren Schritt: Aufgabe bleibt (ehrlich genannt), Verschieben und Erinnerung NICHT ausgeführt', A.lese('todoEntries').length === 1 && A.upd === 0 && A.lese('reminderEntries').length === 0 && /Schon erledigt/.test(r[0]) && /weiteren Schritte/.test(r[0]), JSON.stringify(r));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, DREI, plan(V('Zahnarzt'), AUF('Blumen kaufen'), ERI('Zahnarzt', Z1)));
    check('8d Verschieben als ERSTER Schritt: nichts geschrieben, bis „Ja“ kommt (auch nicht die späteren Schritte)', A.lese('todoEntries').length === 0 && A.lese('reminderEntries').length === 0 && A.upd === 0);
    await tippen(A, 'Ja');
    check('8e … nach „Ja“ alle drei, jeder genau einmal', A.upd === 1 && A.lese('todoEntries').length === 1 && A.lese('reminderEntries').length === 1);
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, DREI, PL3());
    const alt = A.sb.executeAction; A.sb.executeAction = async function (a) { if (a && a.type === 'reminder') throw new Error('Erinnerung kaputt'); return alt.apply(this, arguments); };
    r = await tippen(A, 'Ja');
    check('8f Teilerfolg: Verschieben gelungen, Erinnerung gescheitert: beides ehrlich gemeldet, nichts wiederholt, kein alter KI-Weg', A.upd === 1 && zeitVon(A) === '2026-11-06 15:00' && /verschoben/.test(r[0]) && /nicht geklappt/.test(r[0]) && A.st.groq === 0 && A.lese('todoEntries').length === 1, JSON.stringify(r));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, DREI, plan(AUF('Blumen kaufen'), V('Zahnarzt'), V('Zahnarzt'), ERI('x', Z1)));
    check('8g mehr als 3 Schritte: abgelehnt, nichts ausgeführt', A.lese('todoEntries').length === 0 && A.upd === 0);

    /* ===== 9 Fehler beim Verschieben ===== */
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt')));
    { const o = A.sb.executeAction; A.sb.executeAction = async function (a) { if (a && a.type === 'calendar_update') { A.upd++; throw new Error('Google weg'); } return o.apply(this, arguments); }; }
    r = await tippen(A, 'Ja');
    check('9a Ausnahme beim Verschieben: ehrlich berichtet, genau EIN Versuch, kein Wiederholen, kein alter KI-Weg', A.upd === 1 && A.st.groq === 0 && /nicht geklappt|schiefgelaufen/.test(r.join(' ')) && !/Ich habe .* verschoben\./.test(r.join(' ')) && A.sb.jvChef.pauseOffen() === null, JSON.stringify(r));
    await tippen(A, 'Ja');
    check('9b ein weiteres „Ja“ wiederholt NICHTS', A.upd === 1);
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A); await mit(A, SV, plan(V('Zahnarzt')));
    { const o = A.sb.executeAction; A.sb.executeAction = async function (a) { if (a && a.type === 'calendar_update') { A.upd++; return {}; } return o.apply(this, arguments); }; }
    r = await tippen(A, 'Ja');
    check('9c Aktion meldet Erfolg, der Kalender zeigt es aber nicht: NICHT „verschoben“ behaupten, Prüfhinweis, genau ein Versuch', A.upd === 1 && !/Ich habe .* verschoben\./.test(r.join(' ')) && /nicht bestätigen|nicht geklappt|prüfe/.test(r.join(' ')) && A.st.groq === 0, JSON.stringify(r));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); A.st.verhalten = 'fehler'; r = await tippen(A, SV);
    check('9d Planer-Fehler bei einem Verschiebe-Satz: ehrliche Antwort, nichts geändert, KEIN alter KI-Weg', A.st.groq === 0 && /nicht sicher erkennen/.test(r.join(' ')) && zeitVon(A) === '2026-11-07 10:00', JSON.stringify(r));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); A.st.verhalten = 'haengt'; A.sb.jvChef._setzeZeitlimit(30); r = await tippen(A, SV, 200);
    check('9e Planer hängt (Zeitlimit): ehrliche Antwort, nichts geändert, KEIN alter KI-Weg', A.st.groq === 0 && /nicht sicher erkennen/.test(r.join(' ')) && zeitVon(A) === '2026-11-07 10:00', JSON.stringify(r));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); r = await mit(A, 'Verschieb den Zahnarzt bitte', plan(W()));
    check('9f Verschiebe-Satz, Planer liefert etwas anderes: nichts ausgeführt, KEIN alter KI-Weg', A.st.groq === 0 && A.st.wetterN === 0 && /nicht sicher erkennen/.test(r.join(' ')));
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); r = await mit(A, 'Verschiebs', plan());
    check('9g sehr kurzer Verschiebe-Satz („Verschiebs“): nicht still an den alten KI-Weg', A.st.groq === 0);

    /* ===== 10 Kontakt- und Gedächtnis-Überschreibung nur mit Bestätigung ===== */
    A = umgebung(); A.setze('savedContacts', { matze: { address: 'Alte Str. 1', originalName: 'Matze' } }); await mit(A, 'Notiere für Matze die neue Anschrift Neue Str. 2', plan(KON({ name: 'Matze', adresse: 'Neue Str. 2' })));
    check('10a Kontakt überschreiben: erst Frage, Adresse unverändert', /Alte Str/.test(JSON.stringify(A.lese('savedContacts'))) && /Soll ich/.test(alles(A)) && A.sb.jvChef.pauseOffen().art === 'bestaetigung');
    r = await tippen(A, 'Ja');
    check('10b nach „Ja“: Adresse ersetzt, genau einmal, ehrlich gesagt', /Neue Str/.test(JSON.stringify(A.lese('savedContacts'))) && !/Alte Str/.test(JSON.stringify(A.lese('savedContacts'))) && r.length === 1, JSON.stringify(r));
    A = umgebung(); A.setze('savedContacts', { matze: { address: 'Alte Str. 1', originalName: 'Matze' } }); await mit(A, 'Notiere für Matze die neue Anschrift Neue Str. 2', plan(KON({ name: 'Matze', adresse: 'Neue Str. 2' }))); await tippen(A, 'Nein');
    check('10c „Nein“: alte Adresse bleibt', /Alte Str/.test(JSON.stringify(A.lese('savedContacts'))) && !/Neue Str/.test(JSON.stringify(A.lese('savedContacts'))));
    A = umgebung(); A.sb.executeAction({ type: 'memory_store', memory_key: 'schlüssel', memory_value: 'im Auto' }, 'merk dir schlüssel im auto', {}); await warte(20);
    await mit(A, 'Merk dir schlüssel im Keller', plan(GED('schlüssel', 'im Keller')));
    check('10d Gedächtnis überschreiben: erst Frage mit altem und neuem Wert, nichts geändert', /im Auto/.test(alles(A)) && /im Keller/.test(alles(A)) && !/im Keller/.test(stand(A)) && A.sb.jvChef.pauseOffen().art === 'bestaetigung', alles(A));
    r = await tippen(A, 'Ja');
    check('10e nach „Ja“: überschrieben', /im Keller/.test(stand(A)) && !/im Auto/.test(stand(A)), stand(A));
    A = umgebung(); A.sb.executeAction({ type: 'memory_store', memory_key: 'schlüssel', memory_value: 'im Auto' }, 'merk dir schlüssel im auto', {}); await warte(20);
    await mit(A, 'Merk dir schlüssel im Keller', plan(GED('schlüssel', 'im Keller'))); await tippen(A, 'Nein');
    check('10f „Nein“: alter Wert bleibt', /im Auto/.test(stand(A)) && !/im Keller/.test(stand(A)));
    A = umgebung(); A.setze('savedContacts', { matze: { address: 'A 1', originalName: 'Matze' } }); await mit(A, 'Setz Blumen kaufen auf die Aufgabenliste und speichere den Kontakt Matze mit Adresse B 2 und erinnere mich morgen', plan(AUF('Blumen kaufen'), KON({ name: 'Matze', adresse: 'B 2' }), ERI('Matze anrufen', Z1)));
    check('10g Mehrschritt: Aufgabe steht, Kontakt wartet auf Bestätigung, Erinnerung noch nicht', A.lese('todoEntries').length === 1 && A.lese('reminderEntries').length === 0 && /A 1/.test(JSON.stringify(A.lese('savedContacts'))));
    r = await tippen(A, 'Ja');
    check('10h nach „Ja“: Kontakt ersetzt, Erinnerung angelegt, Aufgabe NICHT doppelt', A.lese('todoEntries').length === 1 && A.lese('reminderEntries').length === 1 && /B 2/.test(JSON.stringify(A.lese('savedContacts'))), JSON.stringify(r));

    /* ===== 11 Löschen bleibt gesperrt, Chef-KI AUS unverändert, Quelltext ===== */
    A = umgebung(); termine(A, ZAHN()); await mit(A, 'Lösche den Termin beim Zahnarzt', plan({ faehigkeit: 'termin_loeschen', params: { suche: 'Zahnarzt' } }));
    check('11a Löschen: weder planbar noch ausführbar, Termin bleibt', A.lese('calendarEntries').length === 1 && !A.sb.jvChef.planErlaubt({ schritte: [{ faehigkeit: 'termin_loeschen', params: { suche: 'x' } }] }) && A.sb.jvChef.B2B_NAMEN.join() === 'termin_verschieben');
    const cj = lies('js/chef.js').replace(/\/\*[\s\S]*?\*\//g, '');
    check('11b Quelltext: kein calendar_delete / reminder_delete / episode_forget in der Chef-KI; bestaetigt:true nur an einer Stelle', !/calendar_delete|reminder_delete|episode_forget|termin_loeschen/.test(cj) && (cj.match(/bestaetigt\s*:\s*true/g) || []).length === 1);
    A = umgebung(); termine(A, ZAHN()); A.sb.jvChef.aus(); const g0 = A.st.groq; await tippen(A, SV);
    check('11c Chef-KI AUS: unverändert, der Satz geht an den alten Weg (keine Planer-Anfrage, keine Bestätigung der Chef-KI)', A.st.ent === 0 && A.st.groq === g0 + 1 && A.sb.jvChef.pauseOffen() === null);
    check('11d Chef-KI standardmäßig AUS', (() => { const B = starte({ jetzt: '2026-11-05T10:00:00+01:00', spracherkennung: true, fetch: async () => { throw new Error('offline'); } }); return B.ladefehler.length === 0 && B.sb.jvChef.istAn() === false; })());
    A = umgebung(); termine(A, ZAHN('local_z1', '2026-11-07T10:00:00+01:00')); zaehleUpdates(A);
    A.st.plan = plan(V('Zahnarzt')); await mikro(A, SV); await mikro(A, 'ja');
    check('11e über das Mikrofon (echter Sprachweg): Frage, dann „Ja“ verschiebt genau einmal', A.upd === 1 && zeitVon(A) === '2026-11-06 15:00');

    /* ===== 12 Alte Termin-Rückfrage „Wie viele Stunden vorher?“ bleibt unberührt ===== */
    A = umgebung(); r = await mit(A, 'Trag den Zahnarzt morgen um 15 Uhr in den Kalender ein', plan(TER('Zahnarzt', Z1)));
    const frage = A.gesagt.join(' ');
    check('12a Chef legt Termin an: die alte Rückfrage nach den Stunden wird gestellt', A.lese('calendarEntries').length === 1 && /Stunden vorher/.test(frage), frage);
    r = await tippen(A, 'gar nicht');
    check('12b Antwort „gar nicht“: keine Erinnerung angelegt, Chef-KI greift nicht ein (kein Planer-Aufruf, keine Bestätigung)', A.lese('reminderEntries').length === 0 && A.sb.jvChef.pauseOffen() === null && A.st.ent === 1, JSON.stringify([r, A.lese('reminderEntries').length, A.st.ent]));
    A = umgebung(); await mit(A, 'Trag den Zahnarzt morgen um 15 Uhr in den Kalender ein', plan(TER('Zahnarzt', Z1))); await tippen(A, 'zwei Stunden');
    check('12c Antwort „zwei Stunden“ legt die Erinnerung an', A.lese('reminderEntries').length === 1);
    zaehleUpdates(A); const zuvor = A.lese('reminderEntries')[0] && A.lese('reminderEntries')[0].time; const rid = JSON.stringify(A.lese('reminderEntries').map(e => e.text));
    await mit(A, 'Verschiebe den Zahnarzt eine Stunde später', plan(V('Zahnarzt'))); await tippen(A, 'Ja');
    check('12d Verschieben des Termins: die mitwandernde Erinnerung bleibt EINE (kein Duplikat) und wird nicht gelöscht', A.upd === 1 && A.lese('reminderEntries').length === 1 && A.lese('calendarEntries').length === 1, JSON.stringify([A.lese('reminderEntries').length, zuvor, A.lese('reminderEntries')[0] && A.lese('reminderEntries')[0].time]));
    check('12e Erinnerung ist mit dem Termin mitgewandert (neue Zeit = alte + 1 Stunde)', (() => { const e = A.lese('reminderEntries')[0]; return !!e && !!zuvor && new Date(e.time).getTime() - new Date(zuvor).getTime() === 3600000; })(), JSON.stringify([zuvor, A.lese('reminderEntries')[0]]));

    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ CHEF-KI B2b-1: alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Absturz', e && e.stack || e); process.exit(1); });
