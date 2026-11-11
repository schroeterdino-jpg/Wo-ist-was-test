/* ============================================================
   TESTS Mehrteilige Befehle bei eingeschalteter Chef-KI (Priorität gegenüber festen Befehlen): Start: node tests/chef_mehrteilig.js
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


const S1 = 'Erstelle morgen um 19 Uhr einen Termin namens B2a Test und gleichzeitig eine Aufgabe namens Milch kaufen';
const S2 = 'Trag morgen um 15 Uhr Zahnarzt in den Kalender ein und erinnere mich eine Stunde vorher';
const S3 = 'Setz Brot auf meine Aufgabenliste und sag mir, was morgen im Kalender steht';
const S4 = 'Speichere die Adresse der Apotheke und erinnere mich morgen an das Rezept';
const Z19 = '2026-11-06T19:00:00';
const kont = A => Object.keys(A.lese('savedContacts') || {}).length;

(async () => {
    let A = umgebung();
    /* ===== 1 Erkennung ===== */
    const JA = [S1, S2, S3, S4, 'Zeig mir meine Termine und meine Aufgaben', 'Merk dir dass der Schlüssel im Auto liegt und erinnere mich morgen an den Zahnarzt', 'Setz Brot kaufen auf meine Aufgabenliste und danach trag einen Termin ein'];
    const NEIN = ['Setz Blumen kaufen auf meine Aufgabenliste', 'Erinnere mich morgen um 8 Uhr an Brot', 'Trag morgen um 15 Uhr Zahnarzt in den Kalender ein', 'Wo ist die nächste Apotheke und wie komme ich dahin', 'Wie ist das Wetter morgen und wie wird die Fahrt', 'Ruf Mama an und navigiere nach Hause', 'Was steht morgen im Kalender', 'Erzähl mir etwas Lustiges'];
    check('1a mehrteilig: ausdrücklich kombinierte Aktionen werden erkannt', JA.every(s => A.sb.jvChef.mehrteilig(s)), JSON.stringify(JA.filter(s => !A.sb.jvChef.mehrteilig(s))));
    check('1b mehrteilig: einfache Sätze und fremde Kombinationen werden NICHT erkannt', NEIN.every(s => !A.sb.jvChef.mehrteilig(s)), JSON.stringify(NEIN.filter(s => A.sb.jvChef.mehrteilig(s))));
    const aus = umgebung(); aus.sb.jvChef.aus();
    check('1c Chef-KI AUS: nie mehrteilig', JA.every(s => !aus.sb.jvChef.mehrteilig(s)));

    /* ===== 2 die vier Beispielsätze laufen vollständig ===== */
    A = umgebung(); await satz(A, plan(TER('B2a Test', Z19), AUF('Milch kaufen')), S1);
    check('2a Termin UND Aufgabe: beides genau einmal, eine Sprachausgabe, kein alter Weg', n(A, 'calendarEntries') === 1 && /B2a Test/.test(JSON.stringify(A.lese('calendarEntries'))) && n(A, 'todoEntries') === 1 && A.gesagt.length === 1 && A.st.groq === 0 && A.st.ent === 1, JSON.stringify([n(A, 'calendarEntries'), n(A, 'todoEntries'), A.gesagt, A.st.groq]));
    A = umgebung(); await satz(A, plan(TER('Zahnarzt', Z1), ERI('Zahnarzt', '2026-11-06T14:00:00')), S2);
    check('2b Termin UND Erinnerung („eine Stunde vorher“ = 14:00): beides genau einmal, KEIN „Ort nicht gefunden“, eine Sprachausgabe', n(A, 'calendarEntries') === 1 && n(A, 'reminderEntries') === 1 && !/Ort/.test(A.gesagt.join(' ')) && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([A.gesagt, n(A, 'calendarEntries'), n(A, 'reminderEntries')]));
    A = umgebung(); A.lese('calendarEntries').push({ id: 'local_1', text: 'Zahnarzt', date: 'x', isoDate: '2026-11-06T15:00:00+01:00', location: '' });
    await satz(A, plan(AUF('Brot'), TLES('morgen')), S3);
    check('2c Aufgabe UND Kalender vorlesen: Aufgabe steht, Termin wird genannt, eine Antwort (nicht nur „was steht an“)', n(A, 'todoEntries') === 1 && /Zahnarzt/.test(A.gesagt.join(' ')) && /Brot/.test(A.gesagt.join(' ')) && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify(A.gesagt));
    A = umgebung(); await satz(A, plan(O('Apotheke'), KON({ nummer: 1 }), ERI('Rezept', Z1)), S4);
    check('2d Adresse speichern UND Erinnerung: Kontakt UND Erinnerung, eine Antwort (nicht nur „adresse-speichern“)', kont(A) === 1 && n(A, 'reminderEntries') === 1 && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([kont(A), n(A, 'reminderEntries'), A.gesagt]));
    A = umgebung(); await satz(A, plan(KON({ ort: 'Apotheke' }), ERI('Rezept', Z1)), S4);
    check('2e … ohne gemerkten Ort: Rückfrage, NICHTS ausgeführt (auch keine Erinnerung), kein alter Weg', kont(A) === 0 && n(A, 'reminderEntries') === 0 && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify(A.gesagt));

    /* ===== 3 Rückfall nur, wenn nichts ausgeführt wurde ===== */
    A = umgebung(); await satz(A, { schritte: [] }, S4);
    check('3a Chef-KI lehnt ab (kein Schritt, nichts getan): der feste Befehl antwortet wie bisher (inklusive seiner eigenen Mehrfach-Aufteilung: Rest an den alten KI-Weg, genau einmal)', /keine Adresse/.test(A.gesagt.join(' ')) && A.st.groq <= 1 && A.st.ent === 1 && geschrieben(A) === 0, JSON.stringify([A.gesagt, A.st.groq]));
    A = umgebung(); await satz(A, '{kaputt', S2);
    check('3b ungültige KI-Antwort: nichts geschrieben; der feste Befehl/alte Weg übernimmt genau einmal (keine doppelte Antwort)', geschrieben(A) === 0 && A.gesagt.length <= 2 && (A.st.groq + (A.gesagt.length ? 0 : 0)) <= 1, JSON.stringify([A.gesagt, A.st.groq]));
    A = umgebung(); await satz(A, plan(AUF('Milch kaufen')), S1);
    check('3c Planer erkennt nur EINEN Teil (Aufgabe, der Termin fehlt): VOR dem Schreiben angehalten, nichts ausgeführt, verständliche Erklärung, kein Rückfall auf alte Wege', geschrieben(A) === 0 && A.st.groq === 0 && A.gesagt.length === 1 && /nicht alles/.test(A.gesagt[0]) && /Termin/.test(A.gesagt[0]) && /nichts ausgeführt/.test(A.gesagt[0]), JSON.stringify([geschrieben(A), A.st.groq, A.gesagt]));
    const S3A = 'Trag morgen um 15 Uhr Zahnarzt in den Kalender ein, erinnere mich eine Stunde vorher und setz Blumen kaufen auf meine Aufgabenliste';
    A = umgebung(); await satz(A, plan(TER('Zahnarzt', Z1), ERI('Zahnarzt', '2026-11-06T14:00:00'), AUF('Blumen kaufen')), S3A);
    check('3c1 drei verlangte Aktionen, drei Schritte: alle drei genau einmal, eine Sprachausgabe', n(A, 'calendarEntries') === 1 && n(A, 'reminderEntries') === 1 && n(A, 'todoEntries') === 1 && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([n(A, 'calendarEntries'), n(A, 'reminderEntries'), n(A, 'todoEntries'), A.gesagt]));
    for (const [name, p] of [['Aufgabe fehlt', plan(TER('Zahnarzt', Z1), ERI('Zahnarzt', '2026-11-06T14:00:00'))], ['Erinnerung fehlt', plan(TER('Zahnarzt', Z1), AUF('Blumen kaufen'))], ['Termin fehlt', plan(ERI('Zahnarzt', '2026-11-06T14:00:00'), AUF('Blumen kaufen'))]]) {
        A = umgebung(); await satz(A, p, S3A);
        check('3c2 drei verlangte Aktionen, nur zwei geplant (' + name + '): NICHTS ausgeführt (nicht still nur zwei), Erklärung, kein Rückfall', geschrieben(A) === 0 && A.st.groq === 0 && A.gesagt.length === 1 && /nicht alles/.test(A.gesagt[0]) && /nichts ausgeführt/.test(A.gesagt[0]), name + ' ' + JSON.stringify([geschrieben(A), A.st.groq, A.gesagt]));
    }
    A = umgebung(); await satz(A, plan(TLES('heute'), ALES), 'Zeig mir meine Termine und meine Aufgaben');
    check('3c3 „Termine und Aufgaben“ vorlesen: beide Lese-Schritte erkannt, eine Antwort', A.gesagt.length === 1 && A.st.groq === 0 && A.st.ent === 1, JSON.stringify(A.gesagt));
    A = umgebung(); await satz(A, plan(ERI('Zahnarzt', Z1), AUF('Blumen kaufen')), 'Erinnere mich morgen an den Termin beim Zahnarzt und setz Blumen kaufen auf meine Aufgabenliste');
    check('3c4 „erinnere mich an den Termin“ zählt nicht als Termin eintragen: Erinnerung + Aufgabe laufen ohne falschen Stopp', n(A, 'reminderEntries') === 1 && n(A, 'todoEntries') === 1 && A.st.groq === 0, JSON.stringify(A.gesagt));
    A = umgebung();
    await satz(A, plan(ERI('Rezept', Z1), KON({ name: 'Matze' })), S4);
    check('3d nach einer ausgeführten Aktion KEIN Rückfall: der feste Befehl „adresse-speichern“ läuft NICHT, der alte KI-Weg auch nicht; ehrlicher Teilerfolg', n(A, 'reminderEntries') === 1 && kont(A) === 0 && !/keine Adresse, die ich speichern könnte/.test(A.gesagt.join(' ')) && A.st.groq === 0 && A.gesagt.length === 1 && /Erledigt/.test(A.gesagt[0]), JSON.stringify([A.gesagt, A.st.groq]));
    A = umgebung(); await satz(A, plan(AUF('Milch kaufen'), ERI('Rezept', Z1)), 'Setz Milch kaufen auf meine Aufgabenliste und erinnere mich morgen an das Rezept'); const z0 = stand(A);
    await satz(A, plan(AUF('Milch kaufen'), ERI('Rezept', Z1)), 'Setz Milch kaufen auf meine Aufgabenliste und erinnere mich morgen an das Rezept');
    check('3e derselbe Satz noch einmal: keine Doppelbuchung (Aufgabe bleibt eine, B1-Doppelschutz)', n(A, 'todoEntries') === 1, String(n(A, 'todoEntries')));

    /* ===== 4 einfache Befehle unverändert ===== */
    A = umgebung(); A.st.plan = plan(AUF('Blumen kaufen')); await tippen(A, 'Setz Blumen kaufen auf meine Aufgabenliste');
    check('4a einfacher Aufgabensatz: nicht vorgezogen, geht den bisherigen Chef-KI-Weg (ein Planer-Aufruf, eine Aufgabe)', A.st.ent === 1 && n(A, 'todoEntries') === 1 && A.st.groq === 0, JSON.stringify([A.st.ent, A.lese('todoEntries'), A.st.groq, A.gesagt]));
    A = umgebung(); await tippen(A, 'Wie ist das Wetter morgen');
    check('4b fester/Chef-Weg für Wetter unverändert: kein Planer-Aufruf durch die neue Regel nötig, genau eine Antwort', A.gesagt.length >= 1 && A.st.ent <= 1);
    A = umgebung(); const o1 = A.sb.parsePlacesRequest('Wo ist eine Apotheke in Hamburg'), o2 = A.sb.parsePlacesRequest('Zahnarzt in Hamburg');
    check('4c Ortssuche unverändert: „Apotheke in Hamburg“ und „Zahnarzt in Hamburg“ bleiben Ortssuchen', !!o1 && o1.place && !!o2 && o2.place, JSON.stringify([o1 && o1.place, o2 && o2.place]));
    check('4d Kalender-/Aufgaben-/Erinnerungssätze sind KEINE Ortssuche mehr', ['Trag morgen um 15 Uhr Zahnarzt in den Kalender ein', 'Setz Brot auf meine Aufgabenliste', 'Erinnere mich morgen an den Zahnarzt in Hamburg', 'Setz einen Zahnarzt in Hamburg auf meine Aufgaben'].every(s => A.sb.parsePlacesRequest(s) === null));
    A = umgebung(); A.sb.jvChef.aus(); await tippen(A, 'Trag morgen um 15 Uhr Zahnarzt in den Kalender ein');
    check('4e Chef-KI AUS: kein Planer, der Satz ist keine Ortssuche mehr und geht wie ein normaler Satz an den alten KI-Weg (einmal)', A.st.ent === 0 && A.st.groq === 1 && !/Ort/.test(A.gesagt.join(' ')), JSON.stringify([A.st.ent, A.st.groq, A.gesagt]));
    A = umgebung(); A.sb.jvChef.aus(); await tippen(A, S4);
    check('4f Chef-KI AUS bei mehrteiligem Satz: exakt wie bisher (fester Befehl adresse-speichern antwortet, keine Planer-Anfrage)', A.st.ent === 0 && /keine Adresse/.test(A.gesagt.join(' ')), JSON.stringify([A.st.ent, A.gesagt]));

    /* ===== 5 Sicherheit bleibt ===== */
    A = umgebung(); await satz(A, plan(AUF('a'), AUF('b'), AUF('c'), AUF('d')), 'Setz a und b und c und d auf meine Aufgabenliste und erinnere mich');
    check('5a mehr als 3 Schritte: abgelehnt, nichts geschrieben', n(A, 'todoEntries') === 0);
    A = umgebung(); await satz(A, plan(AUF('Blumen'), { faehigkeit: 'termin_verschieben', params: { suche: 'Zahnarzt', neue_zeit: Z1 } }), 'Setz Blumen auf meine Aufgabenliste und erinnere mich morgen an den Zahnarzt');
    check('5b Plan mit Verschieben: nichts ausgeführt, kein Rückfall', n(A, 'todoEntries') === 0 && A.st.groq === 0);
    A = umgebung(); await tippen(A, 'Verschiebe den Zahnarzttermin auf Freitag und erinnere mich eine Stunde vorher');
    check('5c Verschieben in mehrteiligem Satz: angehalten, nichts geändert, kein alter Weg', A.st.groq === 0 && geschrieben(A) === 0 && /Welchen Termin|nichts geändert/.test(A.gesagt.join(' ')), JSON.stringify(A.gesagt));
    check('5d keine neue Befehlsreihenfolge: 93 Befehle, Anfang unverändert', A.sb.jvCommands.list().length === 93 && /^0 karten-weg/.test(A.sb.jvCommands.list()[0]));

    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ MEHRTEILIGE BEFEHLE: alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
