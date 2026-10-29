/* ============================================================
   Phase 6B.1: Visuelle Hintergrundtakte pausieren bei hidden (mimik, holo_look, anzeige 300/400 ms; laune 14 s wurde aus dem Umfang genommen).
   Diese Suite unterscheidet ausdrücklich:
     ALT   = Phase 6A (eingefroren): tests/hintergrund_soll_6a.json (statisch), tests/hintergrund_laufzeit_6a.json (Chromium),
             tests/hintergrund_6b1_vorher.json (Prüfwelt-Szenarien auf main 4b93261, vor jeder Änderung)
     NEU   = Phase 6B.1: der heutige Code, tests/hintergrund_soll.json, tests/hintergrund_laufzeit.json (Chromium nach der Änderung)
   Teile: A Umfang (nur diese vier Prozesse, sonst nichts), B Prüfwelt (sichtbar unverändert, versteckt 0, Rückkehr, 10 Wechsel),
          C Chromium-Messstand alt/neu, D Gegenproben A–J (Quelltext im Speicher verändert).
   Läuft ohne Browser (CI). Neu messen (lokal, Playwright): node tests/hintergrund_messen.js
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const an = require('./hintergrund_analyse.js'), aw = require('./hintergrund_auswertung.js');
const sz = require('./hintergrund_6b1_szenarien.js');
const T = f => path.join(__dirname, f);
const lesen = f => JSON.parse(fs.readFileSync(T(f), 'utf8'));
let ok = 0, fehler = 0;
function check(name, c, info) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);
const quelle = d => fs.readFileSync(path.join(__dirname, '..', 'js', d), 'utf8');

const alt = lesen('hintergrund_soll_6a.json'), neu = lesen('hintergrund_soll_6b1.json'), vorher = lesen('hintergrund_6b1_vorher.json').messung;

/* ===== A. Umfang: genau vier Prozesse ändern ihr Verhalten, sonst nichts ===== */
console.log('A. Umfang (alt = Phase 6A, neu = 6B.1)');
const imAlt = Object.fromEntries(alt.prozesse.map(p => [p.id, p])), imNeu = Object.fromEntries(neu.prozesse.map(p => [p.id, p]));
const GEAENDERT = ['anzeige.js#1', 'anzeige.js#2', 'holo_look.js#1', 'mimik.js#1'];
check('Gleiche Prozess-Ids alt und neu (keiner neu, keiner weg)', JS(Object.keys(imAlt).sort()) === JS(Object.keys(imNeu).sort()) && alt.prozesse.length === 102);
check('Nur diese vier Prozesse unterscheiden sich: anzeige.js#1/#2, holo_look.js#1, mimik.js#1', JS(Object.keys(imNeu).filter(k => JS(imAlt[k]) !== JS(imNeu[k])).sort()) === JS(GEAENDERT), JS(Object.keys(imNeu).filter(k => JS(imAlt[k]) !== JS(imNeu[k]))));
const felder = id => Object.keys(imNeu[id]).filter(f => JS(imAlt[id][f]) !== JS(imNeu[id][f])).sort();
check('Geändert sind ausschließlich Start (ab Laden → in Steuerfunktion), Stop (nie → clearInterval) und Doppelstart-Schutz', GEAENDERT.every(id => JS(felder(id).filter(f => ['start', 'stop', 'doppel'].indexOf(f) < 0)) === '[]'), JS(GEAENDERT.map(felder)));
check('Sichtbare Frequenz unverändert: mimik 120 ms, holo_look 700 ms, anzeige 400/300 ms', imNeu['mimik.js#1'].ms === 120 && imNeu['holo_look.js#1'].ms === 700 && imNeu['anzeige.js#1'].ms === 400 && imNeu['anzeige.js#2'].ms === 300 && GEAENDERT.every(id => imAlt[id].ms === imNeu[id].ms));
check('laune.js#2 (14 s) bewusst NICHT geändert: faceTick ruft ensure() auf (würfelt bei abgelaufener Laune eine neue Stimmung und speichert sie) – mehr als Darstellung; weiter ab Laden, nie gestoppt', JS(imAlt['laune.js#2']) === JS(imNeu['laune.js#2']) && imNeu['laune.js#2'].ms === 14000 && imNeu['laune.js#2'].stop.indexOf('nie gestoppt') === 0 && /function ensure\(\) \{ if \(!st \|\| st\.until <= Date\.now\(\)\) roll\(\); return st; \}/.test(quelle('laune.js')) && /function roll\(\)[\s\S]{0,600}setMood\(/.test(quelle('laune.js')) && /function setMood[\s\S]{0,300}save\(\)/.test(quelle('laune.js')) && /function faceTick\(\)[\s\S]{0,400}ensure\(\)/.test(quelle('laune.js')) && quelle('laune.js').indexOf('visibilitychange') < 0);
check('Art/Klasse/Netz/Native der vier unverändert (weiter Intervall, Dauerläufer ohne Netz)', GEAENDERT.every(id => ['art', 'klasse', 'netz', 'nativ'].every(f => JS(imAlt[id][f]) === JS(imNeu[id][f]))));
const A_IDS = ['calendar.js#1', 'native_speech.js#1', 'voice.js#2', 'voice.js#3', 'auftraege.js#2', 'wachter.js#1', 'pushsync.js#1', 'pushsync.js#2', 'plan_ansagen.js#2'];
check('Kategorie A (Erinnerung, Weckwort, Native-Status, Aufträge, Wächter, Push, Ansagen) ist Zeichen für Zeichen unverändert', A_IDS.every(id => imAlt[id] && JS(imAlt[id]) === JS(imNeu[id])));
const NETZ = Object.keys(imAlt).filter(id => imAlt[id].netz);
check('Alle Netzwerk-Poller (' + NETZ.length + ') unverändert', NETZ.length > 20 && NETZ.every(id => JS(imAlt[id]) === JS(imNeu[id])));
check('synapsen.js#1 bewusst zurückgestellt: unverändert (200 ms Dauerläufer, nie gestoppt)', JS(imAlt['synapsen.js#1']) === JS(imNeu['synapsen.js#1']) && imNeu['synapsen.js#1'].ms === 200 && imNeu['synapsen.js#1'].stop.indexOf('nie gestoppt') === 0);
check('UI-Schreibmaschine (ui.js#1–4) kein Kandidat: setTimeout-Ketten, die am Textende enden, unverändert', [1, 2, 3, 4].every(n => imNeu['ui.js#' + n].klasse === 'animation' && imNeu['ui.js#' + n].art === 'selbstansetzend' && JS(imAlt['ui.js#' + n]) === JS(imNeu['ui.js#' + n])));
check('rAF-Schleifen unverändert', JS(alt.raf) === JS(neu.raf));
check('Neu auf visibilitychange hören genau mimik.js und anzeige.js (holo_look.js tat es schon)', JS(neu.sichtbarkeitsHoerer.filter(x => alt.sichtbarkeitsHoerer.indexOf(x) < 0).sort()) === JS(['anzeige.js', 'mimik.js']) && alt.sichtbarkeitsHoerer.every(x => neu.sichtbarkeitsHoerer.indexOf(x) >= 0));
const wachNeu = an.analysiere().filter(a => GEAENDERT.indexOf(a.id) >= 0);
check('Statisch: jeder der vier Takte wird nur über eine Kennung gestartet und per clearInterval gestoppt (höchstens ein Takt je Funktion)', wachNeu.length === 4 && wachNeu.every(a => a.stop.indexOf('clearInterval') === 0 && /Neustart/.test(a.doppel)), JS(wachNeu.map(a => [a.id, a.stop, a.doppel])));

/* ===== B. Prüfwelt: Szenarien je Kandidat gegen den Zustand VOR der Änderung ===== */
console.log('B. Prüfwelt (virtuelle Uhr, steuerbare Sichtbarkeit)');
/* Gemeinsame Beurteilung eines Ablaufs r gegen den alten Zustand v. Liefert die Liste der Verstöße (leer = in Ordnung). */
function verstoesse(name, r, v) {
    const f = [];
    if (r.ladeFehler) return ['Ladefehler: ' + r.ladeFehler];
    if (JS(r.sichtbar) !== JS(v.sichtbar)) f.push('sichtbares Verhalten verändert');
    if (JS(r.start) !== JS(v.start) && JS(Object.assign({}, r.start, { hoererVisibility: 0 })) !== JS(Object.assign({}, v.start, { hoererVisibility: 0 }))) f.push('Start anders (Anzahl/Takt)');
    for (const p of ['hidden5', 'hidden30']) {
        if (r[p].aufrufe !== 0) f.push(p + ': Timer-Rückrufe laufen weiter (' + r[p].aufrufe + ')');
        if (r[p].aktiv !== 0) f.push(p + ': Timer nicht pausiert (' + r[p].aktiv + ' aktiv)');
        if (r[p].speicherSchreiben !== 0) f.push(p + ': Schreibzugriff im Hintergrund');
        if (r[p].netz !== 0) f.push(p + ': Netzaufruf im Hintergrund');
    }
    const erwartetSofort = p => v[p];
    for (const p of ['rueck5Sofort', 'rueck30Sofort']) if (JS(r[p]) !== JS(erwartetSofort(p))) f.push(p + ': Zustand beim Zurückkommen nicht sofort wie erwartet');
    for (const p of ['rueck5Danach', 'rueck30Danach']) if (r[p].aktiv !== v[p].aktiv) f.push(p + ': Timeranzahl nach Rückkehr ' + r[p].aktiv + ' statt ' + v[p].aktiv);
    if (r.wechsel10.aktiv !== v.wechsel10.aktiv || JS(r.wechsel10.ms) !== JS(v.wechsel10.ms)) f.push('10 Wechsel: Timer vermehrt/verloren (' + r.wechsel10.aktiv + ' statt ' + v.wechsel10.aktiv + ')');
    if (r.wechsel10.fehler !== 0 || r.fehler.length !== 0) f.push('Ausnahme aufgetreten');
    if (r.netz !== v.netz) f.push('Netzaufrufe anders');
    if (JS(r.hidden5.zustand) !== JS(v.hidden5.zustand)) f.push('hidden5: innerer Zustand weicht ab');
    if (name === 'mimik' && !(r.rueck5Danach.zustand.grimassen > r.rueck5Sofort.grimassen)) f.push('Mimik bleibt nach Rückkehr eingefroren');
    return f;
}
const ist = sz.messeAlle();
for (const n of Object.keys(sz.KANDIDATEN)) {
    const r = ist[n], v = vorher[n], k = sz.KANDIDATEN[n];
    check(n + ': lädt ohne Fehler, kein Netzaufruf, keine Ausnahme', !r.ladeFehler && r.netz === 0 && r.fehler.length === 0 && r.wechsel10.fehler === 0);
    check(n + ': SICHTBAR unverändert gegenüber vorher (Aufrufzahl, Takt, Zustand nach ' + k.sichtbarMs / 1000 + ' s)', JS(r.sichtbar) === JS(v.sichtbar), JS(r.sichtbar) + ' ≠ ' + JS(v.sichtbar));
    check(n + ': VORHER lief versteckt weiter (alter Zustand eingefroren: >0 Rückrufe, Takt aktiv)', v.hidden5.aufrufe > 0 && v.hidden5.aktiv >= 1, JS(v.hidden5));
    check(n + ': VERSTECKT jetzt 0 Rückrufe und 0 aktive Takte (5 s und 30 s)', r.hidden5.aufrufe === 0 && r.hidden5.aktiv === 0 && r.hidden30.aufrufe === 0 && r.hidden30.aktiv === 0, JS([r.hidden5, r.hidden30]));
    check(n + ': versteckt kein Speicher-Schreibzugriff, kein Netz', r.hidden5.speicherSchreiben === 0 && r.hidden30.speicherSchreiben === 0 && r.hidden5.netz === 0 && r.hidden30.netz === 0);
    check(n + ': RÜCKKEHR – Zustand sofort richtig (vor dem ersten Takt) und gleich wie vorher', JS(r.rueck5Sofort) === JS(v.rueck5Sofort) && JS(r.rueck30Sofort) === JS(v.rueck30Sofort), JS([r.rueck30Sofort, v.rueck30Sofort]));
    check(n + ': nach der Rückkehr dieselbe Zahl Takte wie vorher (kein Doppelstart, kein Verlust)', r.rueck5Danach.aktiv === v.rueck5Danach.aktiv && r.rueck30Danach.aktiv === v.rueck30Danach.aktiv, JS([r.rueck5Danach.aktiv, r.rueck30Danach.aktiv]));
    check(n + ': 10 schnelle Wechsel – Timeranzahl und Takte bleiben gleich, keine Ausnahme', r.wechsel10.aktiv === v.wechsel10.aktiv && JS(r.wechsel10.ms) === JS(v.wechsel10.ms) && r.wechsel10.fehler === 0, JS(r.wechsel10));
    check(n + ': Verstoß-Liste leer (gemeinsame Beurteilung)', verstoesse(n, r, v).length === 0, JS(verstoesse(n, r, v)));
}
check('Mimik: während hidden wird die Überlagerung genau einmal gelöscht (innerer Zustand wie vorher), nach der Rückkehr kommen wieder Grimassen', ist.mimik.hidden5.zustand.geloescht === vorher.mimik.hidden5.zustand.geloescht && ist.mimik.rueck5Danach.zustand.grimassen > ist.mimik.rueck5Sofort.grimassen, JS([ist.mimik.hidden5.zustand, vorher.mimik.hidden5.zustand]));
check('Anzeige: während hidden geänderter Zustand (Autoansicht offen, Fenster offen) steht beim Zurückkommen SOFORT richtig (Zoom 0.8, Schließen-Knopf sichtbar)', ist.anzeige.hidden30.zustand.zoom === '' && ist.anzeige.rueck30Sofort.zoom === '0.8' && ist.anzeige.rueck30Sofort.knopf === 'block' && vorher.anzeige.rueck30Sofort.zoom === '0.8', JS([ist.anzeige.hidden30.zustand, ist.anzeige.rueck30Sofort]));
check('Holo: Kopf-Klassen stimmen sofort nach der Rückkehr (Kopf-Ansicht in der Zwischenzeit verlassen)', ist.holo_look.rueck30Sofort.klassen === 'jv-holo' && vorher.holo_look.rueck30Sofort.klassen === 'jv-holo');
const ersparnis = n => vorher[n].hidden30.aufrufe - ist[n].hidden30.aufrufe;
check('Einsparung in 30 s versteckt (Prüfwelt): mimik ' + ersparnis('mimik') + ', holo_look ' + ersparnis('holo_look') + ', anzeige ' + ersparnis('anzeige') + ' Rückrufe', ersparnis('mimik') === 250 && ersparnis('holo_look') === 43 && ersparnis('anzeige') === 175, [ersparnis('mimik'), ersparnis('holo_look'), ersparnis('anzeige')].join('/'));

/* ===== C. Chromium-Messstand alt (6A) gegen neu (nach 6B.1) ===== */
console.log('C. Chromium-Messstand (alt gegen neu)');
const lAlt = lesen('hintergrund_laufzeit_6a.json'), lNeu = lesen('hintergrund_laufzeit_6b1.json');
const A6 = aw.auswerten(lAlt), N6 = aw.auswerten(lNeu);
check('Messfenster gleich (10 s Start, 60 s Leerlauf, Modus voll) – exakt die 60-s-Messung der Phase 6A', lNeu.modus === 'voll' && lAlt.modus === 'voll' && lNeu.fensterMs.idle === 60000 && lAlt.fensterMs.idle === 60000 && lNeu.fensterMs.start === 10000);
const prozent = (a, b) => Math.round((a - b) / a * 1000) / 10;
check('VERSTECKT: Rückrufe pro 60 s deutlich geringer (alt ' + A6.callbacksVerstecktIdle + ' → neu ' + N6.callbacksVerstecktIdle + ', -' + prozent(A6.callbacksVerstecktIdle, N6.callbacksVerstecktIdle) + ' %)', A6.callbacksVerstecktIdle > 1400 && N6.callbacksVerstecktIdle < 0.7 * A6.callbacksVerstecktIdle && N6.callbacksVerstecktIdle > 0);
check('Versteckt: genau die drei Kandidaten (vier Takte) pausieren zusätzlich zu sphere.js; synapsen, ruhe, calendar, gedaechtnis_zeit, spotify laufen weiter', JS(N6.verstecktPausiert.map(s => s.replace(/·r$/, '')).sort()) === JS(['anzeige.js:171', 'anzeige.js:172', 'holo_look.js:259', 'mimik.js:211', 'sphere.js:342']) && JS(N6.verstecktWeiter) === JS(['calendar.js:42', 'gedaechtnis_zeit.js:55', 'ruhe.js:18', 'spotify.js:531', 'synapsen.js:153']), JS([N6.verstecktPausiert, N6.verstecktWeiter]));
const siteSumme = (lauf, phase, stelle) => aw.summiere(lauf, [phase])[stelle] ? aw.summiere(lauf, [phase])[stelle].f : 0;
const PAARE = [['mimik.js:202', 'mimik.js:211'], ['anzeige.js:150', 'anzeige.js:171'], ['anzeige.js:160', 'anzeige.js:172'], ['holo_look.js:254', 'holo_look.js:259']];
check('SICHTBAR: die vier Takte rufen im Leerlauf gleich oft auf wie vorher (±10 %)', PAARE.every(([a, b]) => { const x = siteSumme(lAlt.lauf.sichtbar, 'idle', a), y = siteSumme(lNeu.lauf.sichtbar, 'idle', b); return x > 50 && Math.abs(x - y) <= 0.1 * x; }), JS(PAARE.map(([a, b]) => [siteSumme(lAlt.lauf.sichtbar, 'idle', a), siteSumme(lNeu.lauf.sichtbar, 'idle', b)])));
check('Sichtbar: Rückrufe gesamt nicht schlechter (alt ' + A6.callbacksSichtbarIdle + ' → neu ' + N6.callbacksSichtbarIdle + '; Schwankung der rAF-Kugel, die Kandidaten sind gleich)', N6.callbacksSichtbarIdle <= A6.callbacksSichtbarIdle * 1.05);
check('Netz: sichtbar gleiche Aufrufe wie 6A (' + A6.netzSichtbarIdle + ' → ' + N6.netzSichtbarIdle + '), versteckt 0 → 0', N6.netzSichtbarIdle === A6.netzSichtbarIdle && N6.netzVerstecktIdle === 0 && A6.netzVerstecktIdle === 0 && JS(Object.keys(lAlt.lauf.sichtbar.phasen.idle.net).sort()) === JS(Object.keys(lNeu.lauf.sichtbar.phasen.idle.net).sort()));
check('Native (Attrappe): dieselben Aufrufe wie 6A (setBusy ≈ 200/min, sonst Einzelaufrufe)', JS(Object.keys(A6.nativIdle).sort()) === JS(Object.keys(N6.nativIdle).sort()) && N6.nativPollProMinute >= 150 && N6.nativPollProMinute <= 230, JS([A6.nativPollProMinute, N6.nativPollProMinute]));
check('Aktive Intervalle: Start 38 → 38, nach 60 s Leerlauf 39 → 39, eine rAF-Schleife (sphere.js)', A6.startAktivIntervalle === 38 && N6.startAktivIntervalle === 38 && A6.idleAktivIntervalle === 39 && N6.idleAktivIntervalle === 39 && N6.idleAktivRaf.length === 1);
const vAkt = n => { const a = lNeu.lauf.versteckt.aktiv[n]; return a ? Object.values(a.iv).reduce((x, y) => x + y, 0) : -1; };
check('Aktive Intervalle: versteckt 35 (genau die vier pausierten weniger), nach Rückkehr und nach 10 Wechseln wieder 39 – keine Vermehrung', vAkt('idle') === 39 && vAkt('idle_versteckt') === 35 && vAkt('rueckkehr') === 39 && vAkt('wechsel10') === 39 && vAkt('nach_wechsel') === 39, JS(['idle', 'idle_versteckt', 'rueckkehr', 'wechsel10', 'nach_wechsel'].map(vAkt)));
const alle = aw.summiere(lNeu.lauf.versteckt, Object.keys(lNeu.lauf.versteckt.phasen));
check('10 Wechsel im echten Chromium: je Pausen-Takt 12 Starts und 11 Stopps (genau einer aktiv)', ['anzeige.js:171', 'anzeige.js:172', 'holo_look.js:259', 'mimik.js:211'].every(s => alle[s] && alle[s].c === 12 && alle[s].x === 11), JS(['anzeige.js:171', 'mimik.js:211'].map(s => alle[s] && [alle[s].c, alle[s].x])));
check('Start versteckt: kein Pausen-Takt wird mehrfach angelegt; bevor die Seite sichtbar wird; keine Vermehrung', ['anzeige.js:171', 'anzeige.js:172', 'holo_look.js:259', 'mimik.js:211'].every(s => !(aw.summiere(lNeu.lauf.startVersteckt, Object.keys(lNeu.lauf.startVersteckt.phasen))[s]) || aw.summiere(lNeu.lauf.startVersteckt, Object.keys(lNeu.lauf.startVersteckt.phasen))[s].c <= 1));
const sp = lauf => lauf.versteckt.phasen.idle_versteckt.store;
check('Speicher (localStorage) versteckt: Schreibzugriffe wie vorher (1 → 1), Lesezugriffe sinken (nur weniger Takte)', sp(lNeu.lauf).set === sp(lAlt.lauf).set && sp(lNeu.lauf).remove === sp(lAlt.lauf).remove && sp(lNeu.lauf).get < sp(lAlt.lauf).get, JS([sp(lAlt.lauf), sp(lNeu.lauf)]));
const ERLAUBT = [/Failed to load resource/, /JARVIS 3D: Loader konnten nicht geladen werden/, /Aufräumen des Langzeitgedächtnisses fehlgeschlagen/, /Dirigent: KI Cannot read properties of undefined/];
const konsole = Object.values(lNeu.lauf).flatMap(l => (l.konsole || []).map(x => x.replace(/^[a-z_0-9]+\|/, '')));
check('Konsole: nur die bekannten externen/Test-bedingten Meldungen (Fremd-Server gesperrt, 3D-Lader von esm.sh, leere Test-Antworten), nichts Neues', konsole.length > 0 && konsole.every(x => ERLAUBT.some(r => r.test(x))), JS(konsole.filter(x => !ERLAUBT.some(r => r.test(x))).slice(0, 3)));
check('Seitenfehler: nur "tailwind is not defined" (CDN im Test gesperrt)', Object.values(lNeu.lauf).every(l => (l.seitenfehler || []).every(x => /tailwind is not defined/.test(x))));
check('Szenarien Sprache/Erinnerungen/Termine/Wetter/KI/Panelwechsel: weiter keine Benachrichtigung, keine neuen setInterval', N6.benachrichtigungenGesamt === 0 && Object.values(N6.szenarien).every(s => s.neueIntervalle === 0));

/* ===== D. Gegenproben A–J: jede Änderung am Quelltext (nur im Speicher) muss auffallen ===== */
console.log('D. Gegenproben A–J');
function mutiere(datei, altText, neuText) { const q = quelle(datei); if (q.indexOf(altText) < 0) throw new Error('Textstelle fehlt in ' + datei + ': ' + altText.slice(0, 50)); return q.replace(altText, neuText); }
function probe(name, kandidat, datei, altText, neuText, erwartetTeil) {
    let r; try { r = sz.ablauf(kandidat, mutiere(datei, altText, neuText)); } catch (e) { check('Gegenprobe ' + name + ' (Textstelle gefunden)', false, e.message); return; }
    const v = verstoesse(kandidat, r, vorher[kandidat]);
    if (process.env.PROBEN) console.log("  PROBE " + name + " → " + JS(v));
    check('Gegenprobe ' + name + ' wird erkannt' + (erwartetTeil ? ' (' + erwartetTeil + ')' : ''), v.length > 0 && (!erwartetTeil || v.some(x => x.indexOf(erwartetTeil) >= 0)), JS(v));
}
const M_STEUER_START = "if (!taktId) taktId = setInterval(takt, 120);", M_HIDDEN = "if (document.hidden) {\n            if (taktId) { clearInterval(taktId); taktId = 0; }";
probe('A: Pause wieder entfernt (mimik läuft versteckt wie früher)', 'mimik', 'mimik.js', M_HIDDEN, "if (false) {\n            if (taktId) { clearInterval(taktId); taktId = 0; }", 'Timer-Rückrufe laufen weiter');
probe('B: beim Sichtbarwerden starten zwei Timer', 'mimik', 'mimik.js', M_STEUER_START, "if (!taktId) taktId = setInterval(takt, 120); setInterval(takt, 120);", 'Timeranzahl');
probe('C: zehn Wechsel vermehren die Timer (Kennung vergessen statt gestoppt)', 'holo_look', 'holo_look.js', "if (wachId) { clearInterval(wachId); wachId = 0; }", "wachId = 0;", 'Timer');
probe('D: Rückkehr aktualisiert die Anzeige nicht sofort', 'anzeige', 'anzeige.js', "if (sichtbarGeworden) { autoTakt(); if (knopfTakt) knopfTakt(); }", "", 'nicht sofort wie erwartet');
probe('E: Mimik bleibt nach der Rückkehr eingefroren (Takt startet nie wieder)', 'mimik', 'mimik.js', M_STEUER_START, "if (!taktId && !window.__einmal) { window.__einmal = 1; taktId = setInterval(takt, 120); }", 'eingefroren');
probe('F: hidden verändert den Speicher (localStorage-Schreibzugriff beim Verstecken)', 'mimik', 'mimik.js', "if (meinAktiv) loesche();\n            return;", "if (meinAktiv) loesche();\n            localStorage.setItem('jv_probe', '1');\n            return;", 'Schreibzugriff');
probe('G: Netzwerkverhalten ändert sich (Netzaufruf beim Verstecken)', 'holo_look', 'holo_look.js', "if (wachId) { clearInterval(wachId); wachId = 0; } return; }", "if (wachId) { clearInterval(wachId); wachId = 0; } fetch('/api/probe'); return; }", 'Netzaufruf');
probe('I: sichtbare Frequenz unbeabsichtigt verändert (120 → 240 ms)', 'mimik', 'mimik.js', M_STEUER_START, "if (!taktId) taktId = setInterval(takt, 240);", 'sichtbares Verhalten');
probe('I2: sichtbare Frequenz unbeabsichtigt verändert (Anzeige 300 → 600 ms)', 'anzeige', 'anzeige.js', "autoId = setInterval(autoTakt, 300)", "autoId = setInterval(autoTakt, 600)", 'sichtbares Verhalten');
probe('J: nur "if (hidden) return" – der Takt läuft weiter und ruft sinnlos auf', 'mimik', 'mimik.js', M_HIDDEN + "\n            if (meinAktiv) loesche();\n            return;\n        }", "if (document.hidden) {\n            if (meinAktiv) loesche();\n            return;\n        }", 'Timer-Rückrufe laufen weiter');
{   /* H: Kategorie-A-Timer verändert → die statische Analyse erkennt es gegen den Soll-Zustand (wie in der 6A-Suite) */
    const idNeu = ov => Object.fromEntries(an.analysiere(ov).map(a => [a.id, { ms: a.ms, art: a.art, klasse: a.klasse }]));
    const basis = idNeu();
    const h1 = idNeu({ 'calendar.js': mutiere('calendar.js', "setInterval(() => {\n    if (window.jvPushHold)", "void(() => {\n    if (window.jvPushHold)") });
    check('Gegenprobe H1: Kategorie-A-Timer (Erinnerungs-Takt calendar.js#1) entfernt → erkannt', !h1['calendar.js#1'] || JS(h1['calendar.js#1']) !== JS(basis['calendar.js#1']) || Object.keys(basis).length !== Object.keys(h1).length, JS(h1['calendar.js#1']));
    const h2 = idNeu({ 'native_speech.js': (() => { const q = quelle('native_speech.js'); const i = q.indexOf('setInterval('); if (i < 0) throw new Error('setInterval fehlt'); return q.slice(0, i) + 'void(' + q.slice(i + 'setInterval('.length); })() });
    check('Gegenprobe H2: Kategorie-A-Timer (Native-Status native_speech.js#1) entfernt → erkannt', Object.keys(h2).length !== Object.keys(basis).length || JS(h2['native_speech.js#1']) !== JS(basis['native_speech.js#1']));
    const q = quelle('calendar.js'), i = q.indexOf('if (window.jvPushHold)'), j = q.indexOf('}, 1000);', i);
    const h3 = idNeu({ 'calendar.js': q.slice(0, j) + '}, 2000);' + q.slice(j + '}, 1000);'.length) });
    check('Gegenprobe H3: Intervall des Erinnerungs-Takts 1000 → 2000 ms → erkannt', h3['calendar.js#1'] && h3['calendar.js#1'].ms === 2000 && basis['calendar.js#1'].ms === 1000);
}
{   /* Kontrollen: unveränderter Quelltext = keine Verstöße (kein falscher Alarm) */
    const kontrolle = Object.keys(sz.KANDIDATEN).map(n => verstoesse(n, sz.ablauf(n, quelle(sz.KANDIDATEN[n].datei)), vorher[n]).length);
    check('Kontrolle: unveränderter Quelltext → keine Verstöße (kein Fehlalarm)', JS(kontrolle) === JS([0, 0, 0]), JS(kontrolle));
    const harmlos = verstoesse('mimik', sz.ablauf('mimik', mutiere('mimik.js', M_STEUER_START, "if (!taktId) taktId = setInterval(takt, 120); /* Kommentar */")), vorher.mimik);
    check('Kontrolle: ein Kommentar im Quelltext → keine Verstöße', harmlos.length === 0, JS(harmlos));
}

console.log('HINTERGRUND 6B.1: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
