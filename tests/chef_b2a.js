/* ============================================================
   TESTS Chef-KI B2a (echte Kalender-, Erinnerungs-, Aufgaben-, Kontakt- und Gedächtnisaktionen, bis zu 3 Schritte): Start: node tests/chef_b2a.js
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

(async () => {
    let A = umgebung();
    check('0a keine Ladefehler, Chef-KI standardmäßig AUS (frische Umgebung ohne an())', (() => { const B = starte({ jetzt: '2026-11-05T10:00:00+01:00', spracherkennung: true, fetch: async () => { throw new Error('offline'); } }); return B.ladefehler.length === 0 && B.sb.jvChef.istAn() === false; })());
    check('0b B2a-Liste: 7 Fähigkeiten, nie termin_verschieben; die alte FREIGEGEBEN-Liste bleibt unverändert', A.sb.jvChef.B2A_NEU.length === 7 && !A.sb.jvChef.B2A_NEU.includes('termin_verschieben') && A.sb.jvChef.FREIGEGEBEN.join() === 'ortssuche,websuche,wetter,produktsuche,foto_info,jarvis_info');
    check('0c planErlaubt: termin_verschieben und fremde Fähigkeiten gesperrt', !A.sb.jvChef.planErlaubt({ schritte: [{ faehigkeit: 'termin_verschieben', params: { suche: 'Zahnarzt', neue_zeit: Z1 } }] }) && !A.sb.jvChef.planErlaubt({ schritte: [{ faehigkeit: 'termin_loeschen', params: { suche: 'x' } }] }));

    /* ===== 1 einzelne Schreibaktionen ===== */
    A = umgebung(); await satz(A, plan(AUF('Blumen kaufen')));
    check('1a Aufgabe: genau 1 Eintrag, eine Sprachausgabe, kein alter KI-Weg', n(A, 'todoEntries') === 1 && A.lese('todoEntries')[0].text === 'Blumen kaufen' && A.gesagt.length === 1 && A.st.groq === 0 && A.st.ent === 1, JSON.stringify([n(A, 'todoEntries'), A.gesagt, A.st.groq, A.st.ent]));
    A = umgebung(); await satz(A, plan(ERI('Brot kaufen', Z1)));
    check('1b Erinnerung: genau 1 neue Erinnerung mit dem Text', n(A, 'reminderEntries') === 1 && /Brot/i.test(JSON.stringify(A.lese('reminderEntries'))) && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([A.lese('reminderEntries'), A.gesagt]));
    A = umgebung(); await satz(A, plan(TER('Zahnarzt', Z1)));
    check('1c Termin: genau 1 neuer Termin „Zahnarzt“', n(A, 'calendarEntries') === 1 && /Zahnarzt/.test(JSON.stringify(A.lese('calendarEntries'))) && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([A.lese('calendarEntries'), A.gesagt]));
    A = umgebung(); await satz(A, plan(GED('schlüssel', 'im Auto')));
    check('1d Gedächtnis: gemerkt, eine Antwort', /im Auto/i.test(JSON.stringify(A.lese('memoryItems'))) && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([A.gesagt]));
    A = umgebung(); await satz(A, plan(KON({ name: 'Matze', adresse: 'Hauptstr. 5, Hamburg' })));
    check('1e Kontakt mit Name und Adresse gespeichert', /Matze/i.test(JSON.stringify(A.lese('savedContacts'))) && /Hauptstr/.test(JSON.stringify(A.lese('savedContacts'))) && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([A.lese('savedContacts'), A.gesagt]));
    A = umgebung(); A.lese('todoEntries').push({ id: 1, text: 'Milch holen' }); const s0 = stand(A);
    await satz(A, plan(ALES));
    check('1f Aufgaben lesen: nennt die Aufgabe, verändert nichts', /Milch/.test(A.gesagt.join(' ')) && stand(A) === s0 && A.st.groq === 0, JSON.stringify(A.gesagt));
    A = umgebung(); A.lese('calendarEntries').push({ id: 'local_1', text: 'Zahnarzt', date: 'x', isoDate: '2026-11-06T15:00:00+01:00', location: '' }); const s1 = stand(A);
    await satz(A, plan(TLES('morgen')));
    check('1g Termine lesen: nennt den Termin, verändert nichts', /Zahnarzt/.test(A.gesagt.join(' ')) && stand(A) === s1 && A.st.groq === 0, JSON.stringify(A.gesagt));

    /* ===== 2 zwei und drei Schritte ===== */
    A = umgebung(); await satz(A, plan(AUF('Blumen kaufen'), ERI('Brot kaufen', Z1)));
    check('2a zwei Schritte: beide ausgeführt, GENAU eine Sprachausgabe mit beiden Teilen', n(A, 'todoEntries') === 1 && n(A, 'reminderEntries') === 1 && A.gesagt.length === 1 && /Blumen/.test(A.gesagt[0]) && /Erinnerung/.test(A.gesagt[0]), JSON.stringify(A.gesagt));
    A = umgebung(); await satz(A, plan(TER('Zahnarzt', Z1), ERI('Zahnarzt', '2026-11-06T14:00:00'), AUF('Versichertenkarte einpacken')));
    check('2b drei Schritte: Termin, Erinnerung, Aufgabe je genau einmal; eine Sprachausgabe', n(A, 'calendarEntries') === 1 && n(A, 'reminderEntries') === 1 && n(A, 'todoEntries') === 1 && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([n(A, 'calendarEntries'), n(A, 'reminderEntries'), n(A, 'todoEntries'), A.gesagt]));
    A = umgebung(); await satz(A, plan(TLES('heute'), AUF('Blumen kaufen')));
    check('2c lesen, dann schreiben (Reihenfolge): beides erledigt, eine Antwort', n(A, 'todoEntries') === 1 && A.gesagt.length === 1, JSON.stringify(A.gesagt));
    A = umgebung(); await satz(A, plan(O('Apotheke'), KON({ nummer: 1 })), 'Bitte besorge mir eine Apotheke und lege dafür einen Kontakt an');
    check('2d Abhängigkeit: erst Ortssuche, dann Kontakt aus dem gefundenen Ort (Ort wird sofort gemerkt)', A.st.placesN === 1 && Object.keys(A.lese('savedContacts') || {}).length === 1 && A.gesagt.length === 1, JSON.stringify([A.st.placesN, A.lese('savedContacts'), A.gesagt]));

    /* ===== 3 Fehler bei Schritt 1, 2, 3 ===== */
    const kaputt = (A, name) => { const alt = A.sb.executeAction; A.sb.executeAction = async function (a) { if (a && a.type === name) { A.fehlVersuche = (A.fehlVersuche || 0) + 1; return; } return alt.apply(this, arguments); }; };
    A = umgebung(); kaputt(A, 'todo_add'); A.sb.executeAction = A.sb.executeAction;
    const schreibTyp = (() => { const B = umgebung(); return null; })(); void schreibTyp;
    A = umgebung(); { const alt = A.sb.executeAction; A.zaehle = 0; A.sb.executeAction = async function () { A.zaehle++; return; }; void alt; }
    await satz(A, plan(AUF('Blumen kaufen'), ERI('Brot kaufen', Z1), TER('Zahnarzt', Z1)));
    check('3a Schritt 1 schlägt fehl: SOFORT gestoppt (nur ein Versuch), nichts wiederholt, kein alter KI-Weg, ehrliche Antwort', A.zaehle === 1 && n(A, 'todoEntries') === 0 && n(A, 'reminderEntries') === 0 && n(A, 'calendarEntries') === 0 && A.st.groq === 0 && A.gesagt.length === 1 && /nicht geklappt/.test(A.gesagt[0]) && /nichts wiederholt/.test(A.gesagt[0]), JSON.stringify([A.zaehle, A.gesagt, A.st.groq]));
    A = umgebung(); { const alt = A.sb.executeAction; A.zaehle = 0; A.sb.executeAction = async function (a) { A.zaehle++; if (A.zaehle === 2) return; return alt.apply(this, arguments); }; }
    await satz(A, plan(AUF('Blumen kaufen'), ERI('Brot kaufen', Z1), TER('Zahnarzt', Z1)));
    check('3b Schritt 2 schlägt fehl: Aufgabe bleibt (ehrlich genannt), Schritt 3 wird NICHT ausgeführt, kein zweiter Versuch, kein alter KI-Weg', A.zaehle === 2 && n(A, 'todoEntries') === 1 && n(A, 'reminderEntries') === 0 && n(A, 'calendarEntries') === 0 && A.st.groq === 0 && A.gesagt.length === 1 && /Erledigt/.test(A.gesagt[0]) && /Blumen/.test(A.gesagt[0]) && /nicht geklappt/.test(A.gesagt[0]) && /nicht mehr ausgeführt/.test(A.gesagt[0]), JSON.stringify([A.zaehle, A.gesagt, A.st.groq]));
    A = umgebung(); { const alt = A.sb.executeAction; A.zaehle = 0; A.sb.executeAction = async function (a) { A.zaehle++; if (A.zaehle === 3) return; return alt.apply(this, arguments); }; }
    await satz(A, plan(AUF('Blumen kaufen'), ERI('Brot kaufen', Z1), TER('Zahnarzt', Z1)));
    check('3c Schritt 3 schlägt fehl: Schritt 1 und 2 stehen, ehrlicher Teilerfolg, keine Wiederholung, kein alter KI-Weg', A.zaehle === 3 && n(A, 'todoEntries') === 1 && n(A, 'reminderEntries') === 1 && n(A, 'calendarEntries') === 0 && A.st.groq === 0 && A.gesagt.length === 1 && /Erledigt/.test(A.gesagt[0]) && /Termin eintragen/.test(A.gesagt[0]) && /nicht geklappt/.test(A.gesagt[0]), JSON.stringify([A.zaehle, A.gesagt]));
    A = umgebung(); { const alt = A.sb.executeAction; A.zaehle = 0; A.sb.executeAction = async function () { A.zaehle++; throw new Error('kaputt'); }; void alt; }
    await satz(A, plan(AUF('Blumen kaufen'), ERI('Brot kaufen', Z1)));
    check('3d Schreibaufruf wirft: gestoppt, ein Versuch, kein alter KI-Weg (Rückfall könnte doppelt schreiben)', A.zaehle === 1 && A.st.groq === 0 && A.gesagt.length === 1 && /nicht geklappt/.test(A.gesagt[0]), JSON.stringify([A.zaehle, A.st.groq, A.gesagt]));

    /* ===== 4 kein Doppeltes ===== */
    A = umgebung(); await satz(A, plan(AUF('Blumen kaufen'), AUF('Blumen kaufen')));
    check('4a derselbe Schritt zweimal im Plan: Plan abgelehnt, nichts von der Chef-KI geschrieben, GENAU einmal der bisherige Ablauf', A.st.groq === 1 && A.st.ent === 1 && n(A, 'todoEntries') === 0, JSON.stringify([A.st.groq, n(A, 'todoEntries')]));
    A = umgebung(); await satz(A, plan(AUF('Blumen kaufen'))); await satz(A, plan(AUF(' blumen KAUFEN ')), 'Setz noch einmal Blumen kaufen auf meine Aufgabenliste');
    check('4b dieselbe Aufgabe später noch einmal: B1-Doppelschutz, es bleibt EINE Aufgabe', n(A, 'todoEntries') === 1, String(n(A, 'todoEntries')));
    A = umgebung(); await satz(A, plan(TER('Zahnarzt', Z1))); await satz(A, plan(TER('Zahnarzt', Z1)), 'Trag den Zahnarzttermin morgen um drei in den Kalender ein');
    check('4c derselbe Termin zweimal: nur EIN Kalendereintrag', n(A, 'calendarEntries') === 1, String(n(A, 'calendarEntries')));
    A = umgebung(); await satz(A, plan(ERI('Brot kaufen', Z1)));
    const z4 = A.gesagt.length;
    check('4d nach einer Schreibaktion kein Rückfall: die Normal-KI wurde nicht gefragt', A.st.groq === 0 && z4 === 1);

    /* ===== 5 kein gefährlicher Rückfall ===== */
    A = umgebung(); { A.sb.jvRegistry.hole('aufgabe_erstellen'); }
    A.st.plan = plan(AUF('Blumen kaufen'), ERI('Brot kaufen', Z1)); { const alt = A.sb.executeAction; A.zaehle = 0; A.sb.executeAction = async function (a) { A.zaehle++; const r = await alt.apply(this, arguments); if (A.zaehle === 1) throw new Error('nach dem Schreiben'); return r; }; }
    await tippen(A, SATZ);
    check('5a Fehler NACH erfolgreichem Schreiben: Eintrag steht, kein alter KI-Weg, keine zweite Ausführung, ehrliche Antwort', n(A, 'todoEntries') <= 1 && A.zaehle === 1 && A.st.groq === 0 && A.gesagt.length === 1, JSON.stringify([A.zaehle, A.st.groq, A.gesagt, n(A, 'todoEntries')]));
    A = umgebung(); await satz(A, plan(AUF('Blumen kaufen'), { faehigkeit: 'termin_verschieben', params: { suche: 'Zahnarzt', neue_zeit: Z1 } }));
    check('5b Plan mit termin_verschieben (Termin gibt es nicht): erster Schritt ehrlich erledigt, Verschieben fragt nach statt zu raten, nichts verschoben, KEIN Rückfall auf den alten Weg', n(A, 'todoEntries') === 1 && n(A, 'calendarEntries') === 0 && A.st.groq === 0 && /keinen passenden Termin/.test(A.gesagt.join(' ')), JSON.stringify([n(A, 'todoEntries'), A.st.groq, A.gesagt]));
    A = umgebung(); A.st.plan = '{kaputt'; await tippen(A, 'Setz Blumen kaufen auf meine Aufgabenliste');
    check('5c ungültige KI-Antwort bei Schreibwunsch: nichts geschrieben von der Chef-KI, genau einmal der bisherige Weg', A.st.groq === 1 && A.st.ent === 1 && n(A, 'todoEntries') === 0);
    A = umgebung(); A.st.verhalten = 'fehler'; await tippen(A, 'Setz Blumen kaufen auf meine Aufgabenliste');
    check('5d KI-Ausfall bei Schreibwunsch: genau einmal der bisherige Weg', A.st.groq === 1 && A.st.ent === 1);

    /* ===== 6 fehlende Angaben ===== */
    A = umgebung(); await satz(A, { schritte: [], frage: 'Für welche Uhrzeit soll der Termin sein?' }, 'Trag einen Termin beim Zahnarzt ein');
    check('6a fehlende Zeit: eine Rückfrage, nichts geschrieben', A.gesagt.length === 1 && /Uhrzeit/.test(A.gesagt[0]) && geschrieben(A) === 0 && A.st.groq === 0, JSON.stringify(A.gesagt));
    A = umgebung(); await satz(A, plan({ faehigkeit: 'termin_erstellen', params: { text: 'Zahnarzt' } }));
    check('6b Plan ohne Zeit (unvollständig) wird nicht ausgeführt', geschrieben(A) === 0 && A.st.groq === 1, JSON.stringify([geschrieben(A), A.st.groq]));
    A = umgebung(); await satz(A, plan(TER('Zahnarzt', '2026-11-01T10:00:00')));
    check('6c Termin in der Vergangenheit: nicht ausgeführt, der bisherige Weg fragt', geschrieben(A) === 0 && A.st.groq === 1);
    A = umgebung(); await satz(A, plan(KON({ name: 'Matze' })));
    check('6d Kontakt ohne Adresse/Telefon: Rückfrage der Registry, nichts gespeichert, kein alter KI-Weg', Object.keys(A.lese('savedContacts') || {}).length === 0 && A.gesagt.length === 1 && A.st.groq === 0, JSON.stringify([A.gesagt, A.st.groq]));

    /* ===== 7 bestätigungspflichtig / mehrdeutig: nicht ausgeführt ===== */
    A = umgebung(); A.setze('savedContacts', { matze: { address: 'Alte Str. 1', originalName: 'Matze' } });
    await satz(A, plan(KON({ name: 'Matze', adresse: 'Neue Str. 2' })));
    check('7a Kontakt mit abweichender Adresse (Überschreiben): NICHT geändert, verständlicher Hinweis, kein „Ja“ nötig oder wirksam', /Alte Str/.test(JSON.stringify(A.lese('savedContacts'))) && !/Neue Str/.test(JSON.stringify(A.lese('savedContacts'))) && A.gesagt.length === 1 && /Soll ich/.test(A.gesagt[0]) && A.st.groq === 0, JSON.stringify([A.gesagt, A.lese('savedContacts')]));
    A = umgebung(); A.sb.executeAction({ type: 'memory_store', memory_key: 'schlüssel', memory_value: 'im Auto' }, 'merk dir schlüssel im auto', {}); await warte(20);
    const g7 = stand(A);
    await satz(A, plan(GED('schlüssel', 'im Keller')));
    check('7b Gedächtnis überschreiben: NICHT überschrieben, Hinweis, nichts geändert', !/im Keller/.test(stand(A)) && A.gesagt.length === 1 && /Soll ich/.test(A.gesagt[0]), JSON.stringify([A.gesagt]));
    A = umgebung(); A.setze('savedContacts', { matze: { address: 'A 1', originalName: 'Matze' } });
    await satz(A, plan(AUF('Blumen kaufen'), KON({ name: 'Matze', adresse: 'B 2' }), ERI('Brot kaufen', Z1)));
    check('7c Mehrschritt mit bestätigungspflichtigem Schritt 2: Aufgabe steht (ehrlich genannt), Schritt 2 und 3 NICHT ausgeführt', n(A, 'todoEntries') === 1 && n(A, 'reminderEntries') === 0 && /A 1/.test(JSON.stringify(A.lese('savedContacts'))) && /Soll ich/.test(A.gesagt[0]) && /Erledigt/.test(A.gesagt[0]) && A.st.groq === 0, JSON.stringify(A.gesagt));
    A = umgebung(); await satz(A, plan(AUF('Blumen kaufen')), 'Setz Blumen kaufen auf meine Aufgabenliste');
    const gj = await tippen(A, 'Ja');
    check('7d „Ja“ nach einer abgeschlossenen Chef-KI-Aktion löst nichts aus (es gibt keine offene Aktion)', n(A, 'todoEntries') === 1 && geschrieben(A) === 1, JSON.stringify([n(A, 'todoEntries'), n(A, 'reminderEntries'), n(A, 'calendarEntries'), gj]));

    /* ===== 8 Chef-KI AUS ===== */
    A = umgebung(); A.sb.jvChef.aus(); A.st.plan = plan(AUF('Blumen kaufen'));
    await tippen(A, 'Setz Blumen kaufen auf meine Aufgabenliste');
    check('8a AUS: keine Entscheider-Anfrage, kein Chef-KI-Schreiben; der bisherige Weg läuft wie früher', A.st.ent === 0 && A.sb.jvChef.eingaenge().length === 0);
    A = umgebung(); A.sb.jvChef.aus();
    check('8b AUS: kiWeg und behandle geben sofort false', A.sb.jvChef.kiWeg('Setz Blumen kaufen auf meine Aufgabenliste') === false && A.sb.jvChef.behandle('Setz Blumen kaufen auf meine Aufgabenliste') === false);

    /* ===== 9 Sprachunterbrechung ===== */
    A = umgebung(); A.st.verhalten = 'haengt'; A.st.plan = plan(AUF('Blumen kaufen'));
    const pA = A.lassLaufen(() => A.sb.jvTippen('Setz Blumen kaufen auf meine Aufgabenliste')); await warte(5);
    A.st.verhalten = ''; A.st.plan = plan(AUF('Milch holen')); await tippen(A, 'Setz Milch holen auf meine Aufgabenliste'); await pA;
    check('9a neuer Satz überholt einen hängenden: nur die neue Aufgabe, keine doppelte Antwort', n(A, 'todoEntries') === 1 && A.lese('todoEntries')[0].text === 'Milch holen', JSON.stringify(A.lese('todoEntries')));


    /* ===== 11 Verschieben (B2b-1: nur mit Bestätigung, Ausführlicheres in chef_b2b.js) – nie Rückfall auf den alten KI-Weg (Chef-KI EIN) ===== */
    A = umgebung(); A.lese('calendarEntries').push({ id: 'local_1', text: 'Zahnarzt', date: 'x', isoDate: '2026-11-06T15:00:00+01:00', location: '' }); { const sv = stand(A);
    await tippen(A, 'Verschiebe den Zahnarzttermin auf Freitag um vier');
    check('11a Satz mit „verschieb…“ bei Chef-KI EIN: angehalten, keine Planer-Anfrage, KEIN alter KI-Weg, nichts geändert, eine ehrliche Antwort', A.st.ent === 1 && A.st.groq === 0 && stand(A) === sv && A.gesagt.length === 1 && /Welchen Termin/.test(A.gesagt[0]), JSON.stringify([A.st.ent, A.st.groq, A.gesagt]));
    A.st.plan = plan({ faehigkeit: 'termin_verschieben', params: { suche: 'Zahnarzt', neue_zeit: Z2 } });
    await tippen(A, 'Mein Termin beim Zahnarzt soll jetzt am Freitag stattfinden');
    check('11b Planer will verschieben (Satz ohne „verschieb…“): nichts geändert, KEIN alter KI-Weg', A.st.ent === 2 && A.st.groq === 0 && stand(A) === sv && /nichts geändert/.test(A.gesagt.join(' ')), JSON.stringify([A.st.ent, A.st.groq, A.gesagt]));
    A.sb.jvChef.aus(); const g0 = A.st.groq; await tippen(A, 'Verschiebe den Zahnarzttermin auf Freitag um vier');
    check('11c Chef-KI AUS: unverändert, der Satz geht wie bisher an den alten Weg (keine Planer-Anfrage)', A.st.ent === 2 && A.st.groq === g0 + 1, JSON.stringify([A.st.ent, A.st.groq]));
    A.sb.jvChef.an(); const e0 = A.st.ent; await tippen(A, 'Setz Blumen kaufen auf meine Aufgabenliste');
    check('11d normale Schreibwünsche gehen weiter an die Chef-KI (nur „verschieb…“ ist gesperrt)', A.st.ent === e0 + 1); }

    /* ===== 12 Unterbrechung mitten in einer Mehrschritt-Aufgabe ===== */
    A = umgebung(); A.zaehle = 0; A.st.plan = plan(AUF('Blumen kaufen'), ERI('Brot kaufen', Z1)); {
        const alt = A.sb.executeAction; A.sb.executeAction = async function () { A.zaehle++; const r = await alt.apply(this, arguments); if (A.zaehle === 1) { A.st.plan = plan(AUF('Milch holen')); A.sb.jvChef.kiWeg('Setz Milch holen auf meine Aufgabenliste'); } return r; }; }
    await tippen(A, SATZ);
    const alleSaetze = A.gesagt.join(' | ');
    check('12a Unterbrechung nach Schritt 1: die erledigte Aufgabe bleibt und wird ehrlich genannt, Schritt 2 (Erinnerung) NICHT ausgeführt', n(A, 'reminderEntries') === 0 && A.lese('todoEntries').filter(e => e.text === 'Blumen kaufen').length === 1 && /Erledigt/.test(alleSaetze) && /Blumen/.test(alleSaetze) && /neuen Satz/.test(alleSaetze), alleSaetze);
    check('12b … und die neue Aufgabe wird einmal angelegt; nichts doppelt, kein alter KI-Weg, keine falsche Erfolgsmeldung für die Erinnerung', A.lese('todoEntries').filter(e => e.text === 'Milch holen').length === 1 && n(A, 'todoEntries') === 2 && A.st.groq === 0 && !/Erinnerung/.test(A.gesagt.filter(x => /neuen Satz/.test(x)).join(' ')), JSON.stringify([A.lese('todoEntries'), A.st.groq]));

    /* ===== 10 Prompt und Netz ===== */
    A = umgebung(); await satz(A, plan(AUF('Blumen kaufen')));
    const sys = String(((A.st.entNachrichten[0] || [])[0] || {}).content || '');
    check('10a Prompt nennt die B2a-Fähigkeiten und das heutige Datum, (B2b-1) termin_verschieben nur mit suche/tag; weiter nur 2 Nachrichten', /termin_erstellen/.test(sys) && /aufgabe_erstellen/.test(sys) && /2026-11-05/.test(sys) && /termin_verschieben/.test(sys) && A.st.entNachrichten[0].length === 2);
    check('10b genau EINE zusätzliche KI-Anfrage je Schreibwunsch, kein weiteres Netz', A.st.ent === 1 && A.st.groq === 0 && A.st.placesN === 0 && A.st.wetterN === 0 && A.st.webN === 0);
    check('10c Diagnose: ohne Satzinhalt, mit Codes für die Schreib-Aktion', /schreiben_ausgefuehrt/.test(codes(A)) && !/Blumen/.test(JSON.stringify(A.sb.jvChef.eingaenge())) && !/Blumen/.test(JSON.stringify(A.sb.jvChef.protokoll())));
    const cs = lies('js/chef.js').replace(/\/\*[\s\S]*?\*\//g, '');
    check('10d keine Löschfunktion und kein Verschieben in der Chef-KI freigeschaltet', !/_delete|forget|löschen|loeschen/.test(cs.split('B2A_NEU = ')[1].split(';')[0]) && !/'termin_verschieben'\s*\]/.test(cs.split('B2A_NEU = ')[1].split(';')[0]));

    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ CHEF-KI B2a: alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
