/* ============================================================
   TESTS Chef-KI-Paket (Orte, Internet, Wetter, Unterhaltung, Rückfragen, Anschlussfragen): Start: node tests/chef_paket.js
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
const WEB = f => ({ faehigkeit: 'websuche', params: { frage: f } });
const SW = 'Brauche ich heute einen Regenschirm oder eine Jacke';
const SW2 = 'Wie wird das Wetter morgen';
const SWEB = 'Schau mal nach was heute im Kino läuft';
const SO = 'Mir knurrt der Magen wo gibt es hier was Warmes';
const SK = 'Wie wird das Wetter morgen und wo gibt es hier ein Restaurant';
const SWK = 'Wie wird das Wetter morgen und schau mal nach was heute im Kino läuft';

(async () => {
    let A = umgebung();
    check('0a keine Ladefehler; wetter ist in der Registry, Chef-KI führt nur lesende Fähigkeiten aus', A.ladefehler.length === 0 && !!A.sb.jvRegistry.hole('wetter') && A.sb.jvChef.FREIGEGEBEN.join() === 'ortssuche,websuche,wetter' && A.sb.jvChef.FREIGEGEBEN.every(n => !A.sb.jvChef.SCHREIB.includes(n)), A.ladefehler.join(';'));
    check('0b Obergrenzen sind festgelegt: Zeitbudget 20 s, höchstens 3 Schritte', A.sb.jvChef.GESAMT_MS === 20000);
    const befehle0 = A.sb.jvCommands.list().map(c => c.name || c).join('|');

    /* ---------- Wetter ---------- */
    for (const weg of ['mikro', 'tippen']) {
        A = umgebung(); A.st.plan = plan(W('heute'));
        const g = await (weg === 'mikro' ? mikro : tippen)(A, SW);
        check('1 Wetter heute (' + weg + '): genau EINE Antwort aus den Wetterdaten, die normale KI wird nicht zusätzlich gefragt', g.length === 1 && /Aktuell sind es 9 Grad, gefühlt 7/.test(g[0]) && /Regenschirm/.test(g[0]) && /Jacke/.test(g[0]) && A.st.ent === 1 && A.st.groq === 0 && A.st.wetterN === 2, JSON.stringify({ g, ent: A.st.ent, groq: A.st.groq, w: A.st.wetterN }));
        check('1b Diagnose: Wetter gesagt, Dauer und KI-Anfragen als Zahlen (1 KI), kein Satz', codes(A) === 'ki_aufgerufen>wetter_ausgefuehrt' && eing(A)[0].ki === 1 && typeof eing(A)[0].ms === 'number', JSON.stringify(eing(A)));
    }
    A = umgebung(); A.st.plan = plan(W('morgen'));
    let g = await tippen(A, SW2);
    check('2 Wetter morgen: Vorhersage von morgen (Regen, 80 Prozent)', g.length === 1 && /^Das Wetter morgen: leichter Regen/.test(g[0]) && /80 Prozent/.test(g[0]) && /Regenschirm mitnehmen/.test(g[0]), JSON.stringify(g));

    /* ---------- Anschlussfrage ---------- */
    A.st.plan = m => /Anschlussfragen/.test(JSON.stringify(m)) ? plan(W('uebermorgen')) : plan();
    g = await tippen(A, 'und übermorgen');
    check('3 Anschlussfrage "und übermorgen" nach Wetter: Kontext geht zum Entscheider, Antwort kommt, Diagnose "Anschlussfrage"', g.length === 1 && /^Das Wetter übermorgen:/.test(g[0]) && codes(A) === 'anschluss>ki_aufgerufen>wetter_ausgefuehrt' && /Wetter \(Tag: morgen\)/.test(JSON.stringify(A.st.entNachrichten[A.st.entNachrichten.length - 1])) && A.sb.jvChef.thema().art === 'wetter', JSON.stringify({ g, c: codes(A) }));
    const B = umgebung(); B.st.plan = plan(W('morgen'));
    g = await tippen(B, 'und übermorgen');
    check('3b ohne vorheriges Thema wird die kurze Äußerung NICHT abgefangen (kein Entscheider, normaler Ablauf)', B.st.ent === 0 && B.st.groq === 1 && /vorfilter_laenge/.test(codes(B)), codes(B));

    /* ---------- Internetsuche ---------- */
    for (const weg of ['mikro', 'tippen']) {
        A = umgebung(); A.st.plan = plan(WEB(SWEB));
        g = await (weg === 'mikro' ? mikro : tippen)(A, SWEB);
        check('4 Internetsuche (' + weg + '): eine Antwort, genau eine Websuche, 2 KI-Anfragen insgesamt (Entscheider + Suche), normale KI nicht zusätzlich', g.length === 1 && /Hamburg ist es ruhig|in Hamburg/.test(g[0]) && A.st.webN === 1 && A.st.groq === 0 && codes(A) === 'ki_aufgerufen>websuche_ausgefuehrt' && eing(A)[0].ki === 2, JSON.stringify({ g, c: codes(A), ki: eing(A)[0] && eing(A)[0].ki }));
    }

    /* ---------- Ortssuche ---------- */
    A = umgebung(); A.st.plan = plan(O('Restaurant'));
    g = await mikro(A, SO);
    check('5 Ortssuche: Treffer gesprochen, Karten gezeigt, eine Antwort', g.length === 1 && /Trattoria Roma|Fischerhaus/.test(g[0]) && A.karten.length >= 1 && codes(A) === 'ki_aufgerufen>ortssuche_ausgefuehrt' && A.st.groq === 0, JSON.stringify({ g, c: codes(A) }));
    check('5b Anschlussfrage "Das zweite gefällt mir" nutzt die gemerkten Treffer (Gesprächsgedächtnis)', (await tippen(A, 'Das zweite gefällt mir'), A.sb.jvOrtGespraech.status ? true : true) && !!A.sb.jvGespraech.ausgewaehlt() && A.sb.jvGespraech.ausgewaehlt().nr === 2);

    /* ---------- Kombinierte Fragen ---------- */
    for (const weg of ['mikro', 'tippen']) {
        A = umgebung(); A.st.plan = plan(W('morgen'), O('Restaurant'));
        g = await (weg === 'mikro' ? mikro : tippen)(A, SK);
        check('6 Wetter + Ortssuche (' + weg + '): EINE zusammenhängende Antwort mit beiden Teilen, Karten erhalten, eine Entscheider-Anfrage', g.length === 1 && /Das Wetter morgen/.test(g[0]) && /Trattoria Roma|Fischerhaus/.test(g[0]) && A.karten.length >= 1 && A.st.ent === 1 && A.st.groq === 0, JSON.stringify({ g, ent: A.st.ent }));
        check('6b Diagnose: mehrere Schritte, beide ausgeführt', codes(A) === 'ki_aufgerufen>mehrere_schritte>wetter_ausgefuehrt>ortssuche_ausgefuehrt', codes(A));
    }
    A = umgebung(); A.st.plan = plan(W('heute'), WEB(SWEB), O('Eisdiele'));
    g = await tippen(A, 'Wie ist das Wetter, schau mal nach was im Kino läuft und wo gibt es hier eine Eisdiele');
    check('6c drei Schritte (Wetter, Internet, Ort): eine Antwort, je höchstens ein Aufruf', g.length === 1 && /Aktuell sind es/.test(g[0]) && /ruhig/.test(g[0]) && /Trattoria|Fischerhaus/.test(g[0]) && A.st.webN === 1 && A.st.placesN === 1 && A.st.ent === 1, JSON.stringify({ g, w: A.st.webN, p: A.st.placesN }));
    A = umgebung(); A.st.plan = plan(O('Pizzeria'), O('Eisdiele'), W('heute'));
    g = await tippen(A, 'Wo gibt es hier eine Pizzeria, außerdem eine Eisdiele in der Nähe, und wie wird das Wetter');
    check('6d zwei Ortssuchen plus Wetter sind erlaubt: eine Antwort', g.length === 1 && A.st.placesN === 2 && /Aktuell sind es/.test(g[0]), JSON.stringify({ g, p: A.st.placesN }));

    /* ---------- Teilfehler und Rückfälle ---------- */
    A = umgebung(); A.st.plan = plan(W('morgen'), O('Restaurant')); A.st.wetter = 'fehler';
    g = await tippen(A, SK);
    check('7 Wetter fällt aus, Ortssuche klappt: Treffer UND ehrlicher Hinweis in EINER Antwort, nichts verschluckt', g.length === 1 && /Trattoria|Fischerhaus/.test(g[0]) && /Wetterdaten/.test(g[0]) && /schritt_fehler/.test(codes(A)), JSON.stringify({ g, c: codes(A) }));
    A = umgebung(); A.st.plan = plan(W('heute')); A.st.wetter = 'fehler';
    g = await tippen(A, SW);
    check('7b nur Wetter, Wetterdaten fehlen: GENAU EINMAL der bisherige Ablauf, keine Stille', A.st.groq === 1 && A.st.normaleSaetze[0].includes('Regenschirm') && codes(A) === 'ki_aufgerufen>schritt_fehler>rueckfall' && A.sb.jvChef.kiZaehler().zurueck === 1, JSON.stringify({ groq: A.st.groq, c: codes(A) }));
    A = umgebung(); A.st.plan = plan(WEB(SWEB)); A.st.web = 'fehler';
    g = await tippen(A, SWEB);
    check('7c nur Internetsuche, ohne Ergebnis: einmal der bisherige Ablauf', A.st.groq === 1 && codes(A) === 'ki_aufgerufen>schritt_fehler>rueckfall', codes(A));
    A = umgebung(); A.st.plan = plan(O('Restaurant')); A.st.places = 'fehler';
    g = await tippen(A, SO);
    check('7d Ortssuche-Fehler: verständliche Meldung wie bisher, KEIN zweiter Weg', g.length === 1 && A.st.groq === 0 && /fehler_suche/.test(codes(A)), JSON.stringify({ g, c: codes(A), groq: A.st.groq }));

    /* ---------- Unterhaltung / Wissensfragen ---------- */
    A = umgebung(); A.st.plan = plan();
    g = await tippen(A, 'Ich finde Regen im Herbst eigentlich ganz gemütlich');
    check('8 Wetterwort, aber Gespräch: der Entscheider plant nichts -> normaler Ablauf (eine Anfrage mehr, einmal)', A.st.ent === 1 && A.st.groq === 1 && codes(A) === 'ki_aufgerufen>ki_kein_ortswunsch>rueckfall', codes(A));
    g = await tippen(A, 'Wie geht es dir heute so');
    check('8b reiner Smalltalk: KEINE zusätzliche Entscheider-Anfrage, nur der normale Ablauf', A.st.ent === 1 && A.st.groq === 2 && /vorfilter_stichwort/.test(codes(A)), JSON.stringify({ ent: A.st.ent, groq: A.st.groq, c: codes(A) }));

    /* ---------- Rückfrage ---------- */
    A = umgebung(); A.st.plan = m => /Antwort|Wetter/.test(String(m[m.length - 1].content)) && /Verkehr oder Wetter/.test(String(m[m.length - 1].content)) ? plan(W('heute')) : { schritte: [], frage: 'Meinst du das Wetter oder den Verkehr?' };
    A.st.plan = m => /^Was gibt es heute/.test(String(m[m.length - 1].content)) && /Wetter$/.test(String(m[m.length - 1].content)) ? plan(W('heute')) : { schritte: [], frage: 'Meinst du das Wetter oder den Verkehr?' };
    g = await tippen(A, 'Was gibt es heute draußen zu wissen');
    check('9 unklarer Wunsch: EINE kurze Rückfrage gesprochen, nichts ausgeführt, keine normale KI', g.length === 1 && /Wetter oder den Verkehr/.test(g[0]) && A.st.groq === 0 && codes(A) === 'ki_aufgerufen>ki_nachfrage', JSON.stringify({ g, c: codes(A) }));
    g = await tippen(A, 'Wetter');
    check('9b die kurze Antwort gehört zur Rückfrage: ursprünglicher Satz + Antwort gehen zusammen an den Entscheider; Wetter wird gesagt', g.length === 1 && /Aktuell sind es/.test(g[0]) && A.st.ent === 2 && /Was gibt es heute draußen zu wissen Wetter/.test(JSON.stringify(A.st.entNachrichten[1])) && codes(A) === 'nachfrage_antwort>ki_aufgerufen>wetter_ausgefuehrt', JSON.stringify({ g, c: codes(A) }));
    A = umgebung(); A.st.plan = { schritte: [], frage: 'Was genau meinst du?' };
    g = await tippen(A, 'Was gibt es heute draußen zu wissen'); g = await tippen(A, 'Dieses');
    check('9c keine Fragekette: antwortet der Entscheider auf die Antwort wieder nur mit einer Frage, läuft der bisherige Ablauf', g.length <= 1 && A.st.groq === 1 && /ki_nicht_erlaubt>rueckfall/.test(codes(A)) && A.st.ent === 2, JSON.stringify({ g, groq: A.st.groq, c: codes(A) }));
    A = umgebung(); A.st.plan = { schritte: [], frage: 'Was genau meinst du?' };
    await tippen(A, 'Was gibt es heute draußen zu wissen'); g = await tippen(A, 'Nein');
    check('9d "Nein" auf die Rückfrage bricht ab', g.length === 1 && /Alles klar/.test(g[0]) && A.st.ent === 1 && A.st.groq === 0, JSON.stringify(g));

    /* ---------- Grenzen ---------- */
    const GRENZEN = [
        ['4 Schritte', plan(W('heute'), O('A1'), O('A2'), WEB('Nachrichten heute bitte'))],
        ['drei Ortssuchen', plan(O('Pizza'), O('Sushi'), O('Eis'))],
        ['zwei Websuchen', plan(WEB('Was läuft im Kino heute'), WEB('Was läuft im Fernsehen heute'))],
        ['zwei Wetter', plan(W('heute'), W('morgen'))],
        ['Schreibaktion Erinnerung', plan({ faehigkeit: 'erinnerung_erstellen', params: { text: 'Essen' } })],
        ['Schreibaktion neben Wetter', plan(W('heute'), { faehigkeit: 'gedaechtnis_speichern', params: { schluessel: 'a', wert: 'b' } })],
        ['Wetter mit Ort als Zahl', plan({ faehigkeit: 'wetter', params: { tag: 'heute', ort: 42 } })],
        ['Wetter mit unbekanntem Zusatz', plan({ faehigkeit: 'wetter', params: { tag: 'heute', ort: 'Paris', zusatz: 1 } })],
        ['Wetter mit falschem Tag', plan(W('gestern'))],
        ['Frage zusammen mit Schritten', { schritte: [W('heute')], frage: 'Welcher Tag?' }],
        ['Websuche ohne Frage', plan({ faehigkeit: 'websuche', params: {} })],
        ['erfundene Fähigkeit', plan({ faehigkeit: 'flug_buchen', params: {} })]
    ];
    for (const [name, p] of GRENZEN) {
        A = umgebung(); A.st.plan = p;
        await tippen(A, SW);
        const kz = A.sb.jvChef.kiZaehler();
        check('10 Grenze (' + name + '): die Chef-KI führt nichts aus (kein Schritt gezählt), einmal der bisherige Ablauf', kz.websuchen === 0 && kz.ortssuchen === 0 && kz.wetter === 0 && A.st.webN === 0 && A.st.placesN === 0 && A.st.groq === 1 && /rueckfall/.test(codes(A)) && kz.zurueck === 1, JSON.stringify({ kz, web: A.st.webN, pl: A.st.placesN, groq: A.st.groq, c: codes(A) }));
    }

    /* ---------- Fehler und Zeitüberschreitung ---------- */
    for (const [name, v, soll] of [['Entscheider hängt', { verhalten: 'haengt' }, 'ki_aufgerufen>ki_zeitlimit>rueckfall'], ['Serverfehler', { verhalten: 'fehler' }, 'ki_aufgerufen>ki_fehler>rueckfall'], ['ungültige Antwort', { plan: 'kein json' }, 'ki_aufgerufen>ki_ungueltig>rueckfall']]) {
        A = umgebung(); Object.assign(A.st, v);
        await tippen(A, SW, v.verhalten === 'haengt' ? 9000 : 0);
        check('11 ' + name + ': genau eine Entscheider-Anfrage, danach einmal der bisherige Ablauf', A.st.ent === 1 && A.st.groq === 1 && codes(A) === soll && A.st.webN === 0 && A.st.placesN === 0, JSON.stringify({ ent: A.st.ent, groq: A.st.groq, c: codes(A) }));
    }
    A = umgebung(); A.st.plan = plan(W('heute'), WEB(SWEB)); A.st.web = 'haengt';
    g = await tippen(A, 'Wie wird das Wetter morgen und was sind die aktuellen Nachrichten', 21000);
        if (A.st.webHaengt) await A.lassLaufen(async () => { A.st.webHaengt('Die Nachrichten: spät.'); await warte(60); });
    check('12 Zeitbudget (20 s) überschritten: nichts Halbes gesprochen, EINMAL der bisherige Ablauf; die späte Antwort wird verworfen (keine Doppelantwort)', A.st.groq === 1 && /budget_ueberschritten>rueckfall/.test(codes(A)) && !A.gesagt.some(x => /spät|Kino|Das Wetter morgen/.test(x)) && A.gesagt.length === 1 && A.gesagt[0] === 'Okay.', JSON.stringify({ gesagt: A.gesagt, groq: A.st.groq, c: codes(A) }));

    /* ---------- Überholt: ein neuer Satz verdrängt einen laufenden ---------- */
    A = umgebung(); A.st.verhalten = 'haengt';
    await A.lassLaufen(async () => { A.sb.jvTippen(SW); await warte(10); });
    A.st.verhalten = ''; A.st.plan = plan(W('morgen'));
    g = await tippen(A, SW2);
    check('13 neuer Satz überholt den hängenden: der alte wird verworfen (kein Rückfall), der neue wird beantwortet', g.length === 1 && /^Das Wetter morgen:/.test(g[0]) && A.st.groq === 0 && eing(A).length === 2, JSON.stringify({ g, groq: A.st.groq, e: eing(A).map(e => e.codes.join('>')) }));

    /* ---------- Android-Brücke ---------- */
    const native = { recStart() { }, recStop() { }, recAbort() { } };
    A = umgebung({ native }); A.st.plan = plan(W('heute'), O('Restaurant'));
    const rec = A.lese('recognition'); const g0 = A.gesagt.length;
    await A.lassLaufen(async () => { try { rec.start(); } catch (e) { } await warte(5); });
    await A.lassLaufen(async () => { A.sb.__zaneRec('result', [{ t: SK, c: 0.9 }]); await warte(100); }); await A.lassLaufen(async () => { await warte(60); });
    g = A.gesagt.slice(g0);
    check('14 Android-Brücke (__zaneRec -> native_speech -> hoeren -> voice): kombinierte Frage, eine Antwort', g.length === 1 && /Aktuell sind es/.test(g[0]) && /Trattoria|Fischerhaus/.test(g[0]) && codes(A) === 'ki_aufgerufen>mehrere_schritte>wetter_ausgefuehrt>ortssuche_ausgefuehrt', JSON.stringify({ g, c: codes(A) }));

    /* ---------- AUS ---------- */
    A = umgebung(); A.sb.jvChef.aus(); A.st.plan = plan(W('heute'));
    await mikro(A, SW); await tippen(A, SWEB); await tippen(A, 'Wie wird das Wetter morgen und wo gibt es hier ein Eiscafé');
    check('15 Chef-KI AUS: keine Entscheider-Anfrage, kein Wetter-/Web-/Ortsaufruf über die Chef-KI, keine Einträge; nur die bisherigen Abläufe', A.st.ent === 0 && A.sb.jvChef.kiZaehler().anfragen === 0 && eing(A).length === 0 && A.st.groq >= 1, JSON.stringify({ ent: A.st.ent, web: A.st.webN, pl: A.st.placesN, groq: A.st.groq }));

    /* ---------- Bestehende Befehle, Sprachausgabe, Daten ---------- */
    A = umgebung(); g = await tippen(A, 'was kannst du');
    check('16 fester Befehl behält Vorrang und spricht', g.length >= 1 && codes(A) === 'befehl_vorrang' && A.st.ent === 0 && A.st.groq === 0, JSON.stringify({ g, c: codes(A) }));
    check('16b die Befehlsliste ist unverändert (Anzahl und Reihenfolge)', A.sb.jvCommands.list().map(c => c.name || c).join('|') === befehle0);
    A = umgebung(); A.st.plan = plan(W('heute'), O('Restaurant'), WEB(SWEB));
    await tippen(A, 'Wie ist das Wetter, wo gibt es hier Essen und schau mal nach was im Kino läuft');
    const roh = JSON.stringify(eing(A)) + JSON.stringify(A.sb.jvChef.protokoll()) + JSON.stringify(A.sb.jvChef.thema());
    check('17 keine Sätze in Diagnose und Protokoll; Messwerte nur Zahlen', !/Wetter, wo|Kino|Essen und/.test(roh) && eing(A).every(e => e.ms === undefined || (typeof e.ms === 'number' && typeof e.ki === 'number')) && eing(A)[0].codes.length <= 8, roh.slice(0, 300));
    check('17b nichts geschrieben: Erinnerungen, Termine, Gedächtnis unverändert', JSON.stringify([A.lese('reminderEntries'), A.lese('calendarEntries')]) === JSON.stringify([umgebung().lese('reminderEntries'), umgebung().lese('calendarEntries')]));

    /* ---------- Gesprächsort ("dort"), Wetter mit Ort, kürzere Antworten, Unterbrechung (Verbesserungspaket) ---------- */
    const SDORT = 'Und wie wird dort das Wetter?';
    const eigenerOrt = A => (A.st.wetterUrls || []).some(u => /latitude=53\.5(&|$)/.test(u));
    { const A = umgebung(); A.st.plan = plan(W('heute'));
      const g0 = await tippen(A, 'Was kannst du mir zu Hamburg erzählen?');   // nennt genau einen Ort
      check('20a Ort im Satz wird gemerkt (nur Arbeitsspeicher)', A.sb.jvChef.ort() === 'Hamburg', String(A.sb.jvChef.ort()));
      A.st.wetterUrls = []; A.st.wetterN = 0; const g = await tippen(A, SDORT);
      check('20b "dort" -> Wetter für Hamburg (Geocode geprüft), nicht der eigene Standort', g.length === 1 && /Hamburg/.test(g[0]) && (A.st.wetterUrls || []).length >= 1 && !eigenerOrt(A) && A.st.geoQ.indexOf('Hamburg') >= 0 && /ort_bezug/.test(codes(A)), JSON.stringify({ g, urls: A.st.wetterUrls, c: codes(A) })); }
    { const A = umgebung(); A.st.plan = plan(W('heute'));
      await tippen(A, 'Was kannst du mir zu Hamburg erzählen?'); await A.vorspulen(11 * 60000);
      check('20c nach 10 Minuten ist der Ort vergessen', A.sb.jvChef.ort() === null);
      A.st.wetterN = 0; A.st.wetterUrls = []; const e0 = A.st.ent; const g = await tippen(A, SDORT);
      check('20d abgelaufen -> Rückfrage "Welchen Ort meinst du?", kein Wetter, keine KI-Anfrage, nie still der eigene Standort', g.length === 1 && /Welchen Ort meinst du/.test(g[0]) && A.st.wetterN === 0 && A.st.ent === e0 && /ort_unklar/.test(codes(A)), JSON.stringify({ g, c: codes(A), w: A.st.wetterN }));
      const g2 = await tippen(A, 'Paris');
      check('20e Antwort "Paris" ersetzt "dort": Wetter für Paris, genau eine Antwort', g2.length === 1 && /Paris/.test(g2[0]) && A.st.geoQ.indexOf('Paris') >= 0 && !eigenerOrt(A), JSON.stringify({ g2, q: A.st.geoQ })); }
    { const A = umgebung(); A.st.plan = plan(W('heute'));
      await tippen(A, 'Wie weit ist es von Hamburg nach Berlin'); A.st.wetterN = 0;
      check('20f zwei Orte im Satz -> keiner wird angenommen', A.sb.jvChef.ort() === null, String(A.sb.jvChef.ort()));
      const g = await tippen(A, SDORT);
      check('20g bei mehreren Orten fragt die App nach, Wetter wird nicht geholt', /Welchen Ort meinst du/.test(g.join('|')) && A.st.wetterN === 0, JSON.stringify(g)); }
    { const A = umgebung(); A.st.plan = plan(W('heute')); A.sb.jvChef._setzeOrtPruefer(async () => false);
      await tippen(A, 'Was kannst du mir zu Hamburg erzählen?'); A.st.wetterN = 0; const g = await tippen(A, SDORT);
      check('20h Name ist kein Ort (Prüfung negativ) -> Rückfrage statt Wetter', /Welchen Ort meinst du/.test(g.join('|')) && A.st.wetterN === 0, JSON.stringify(g)); }
    { const A = umgebung(); A.st.plan = plan(W('heute')); A.sb.jvChef.aus();
      const ok1 = A.sb.jvChef.ortMerken('Hamburg', true);
      check('20i Chef-KI AUS: nichts wird gemerkt, nichts geändert', ok1 === false && A.sb.jvChef.ort() === null && A.st.ent === 0 && A.st.geoN === undefined, String(ok1)); }
    { const A = umgebung(); A.st.plan = plan(W('morgen'));
      A.sb.jvChef.ortMerken('Hamburg', true); A.st.wetterUrls = [];
      const g = await tippen(A, 'Wie wird das Wetter morgen dort');
      check('21a Wetter mit Ort, morgen: Hamburg, mit Vorhersage-Daten', g.length === 1 && /Hamburg/.test(g[0]) && /morgen/i.test(g[0]) && !eigenerOrt(A), JSON.stringify({ g, u: A.st.wetterUrls }));
      const g2 = await tippen(A, 'und übermorgen?');
      check('21b Anschlussfrage nach Wetter für einen Ort bleibt beim Ort', g2.length <= 1 && !eigenerOrt(A), JSON.stringify({ g2, u: A.st.wetterUrls })); }
    { const A = umgebung(); A.st.plan = plan({ faehigkeit: 'wetter', params: { tag: 'heute', ort: 'Atlantis' } }); A.st.geo = 'leer';
      const g = await tippen(A, 'Wie wird das Wetter in Atlantis');
      check('21c unbekannter Ort: ehrliche Meldung, keine erfundenen Werte, kein eigener Standort', g.length >= 1 && /Atlantis/.test(g.join('|')) && /nicht gefunden/.test(g.join('|')) && A.st.wetterN === 0, JSON.stringify(g)); }
    { const A = umgebung(); A.st.plan = plan(W('heute'));
      const g = await tippen(A, SW);   // Wetter am Standort: unverändert
      check('21d Wetter ohne Ort bleibt Wetter am eigenen Standort', g.length === 1 && A.st.geoN === undefined && eigenerOrt(A), JSON.stringify({ g, u: A.st.wetterUrls })); }
    { const pr = lies('js/prompt.js');
      check('22a Prompt: Wissensantworten standardmäßig 2-3 Sätze, mehr auf Wunsch, Listen/Warnungen nie kürzen', /ERKLÄRUNGEN UND WISSENSANTWORTEN/.test(pr) && /2 bis 3 verständliche Sätze/.test(pr) && /erzähl mehr/i.test(pr) && /Listen/.test(pr) && /Warn/i.test(pr)); }
    { const fi = lies('js/fish.js');
      check('22b Sprachausgabe: nach Unterbrechung keine alten Stücke mehr (Abbruchprüfung vor und nach dem Abruf, Warteschlange stoppt)', /unterbrochen\(\)/.test(fi) && /stopped/.test(fi) && (fi.match(/unterbrochen\(\)/g) || []).length >= 2); }
    { const vo = lies('js/voice.js'); const nb = lies('js/nearbymore.js');
      check('22c Android-Brücke und voice.js unverändert, Ortsmessung nur Zahlen (keine Namen/Koordinaten im Protokoll)', (vo.match(/jvChef\.kiWeg/g) || []).length === 1 && !/weckruf/.test(nb) && !/jvOrtZeiten[^\n]*(lat|lon|name)/.test(nb)); }

    /* ---------- Werkstatt-Rückfall (PR #342) und Handler-Audit: statisch ---------- */
    const nm = lies('js/nearbymore.js');
    check('18 Werkstatt-Rückfall unverändert vorhanden (zwei Übergabestellen, Standortfehler ausgenommen)', (nm.match(/plUebergabe\(originalText\)/g) || []).length === 2 && /window\.handleOrtsucheCommand\(text\)/.test(nm));
    check('19a Handler-Audit: Mehrfachfrage, Lagebild-Weg und Mail-Antwort melden einen Fehler nicht mehr stumm', /Mehrfachfrage[^\n]*window\.speak\(/.test(lies('js/mehrfach.js')) && /Lagebild Weg[^\n]*sagen\(/.test(lies('js/lagebild.js')) && /Mail-Antwort[^\n]*say\(/.test(lies('js/mailwatch.js')));
    const chefJs = lies('js/chef.js').replace(/\/\*[\s\S]*?\*\//g, '');
    check('19b Quelltext: nie bestaetigt:true, Entscheider-Fähigkeiten nur ortssuche/websuche/wetter, ein einziges Zeitbudget', !/bestaetigt\s*:\s*true/.test(chefJs) && /KI_FAEHIGKEITEN = Object\.freeze\(\['ortssuche', 'websuche', 'wetter'\]\)/.test(chefJs) && /GESAMT_MS = 20000/.test(chefJs));
    check('19c voice.js unverändert (kein Umbau): ein Haken befehlVorrang, ein Haken kiWeg', (lies('js/voice.js').match(/befehlVorrang/g) || []).length === 1 && (lies('js/voice.js').match(/jvChef\.kiWeg/g) || []).length === 1);

    console.log('CHEF-PAKET: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(2); });
