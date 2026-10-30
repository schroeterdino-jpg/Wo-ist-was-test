/* ============================================================
   Phase 6B.2: Der 200-ms-Takt in js/synapsen.js pausiert bei hidden.
   ALT = Stand nach Phase 6B.1 (eingefroren): tests/hintergrund_soll_6b1.json, tests/hintergrund_laufzeit_6b1.json,
         tests/hintergrund_6b2_vorher.json (Prüfwelt-Szenarien auf main 4d5b9e6, vor der Änderung)
   NEU = der heutige Code, tests/hintergrund_soll.json, tests/hintergrund_laufzeit.json (Chromium nach der Änderung)
   Teile: S Stufe-A-Belege (der Takt ist rein visuell; Hülle um sendToGroqSmart unberührt), A Umfang, B Prüfwelt, C Chromium alt/neu, D Gegenproben A–L.
   Läuft ohne Browser (CI). Neu messen (lokal, Playwright): node tests/hintergrund_messen.js
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const an = require('./hintergrund_analyse.js'), aw = require('./hintergrund_auswertung.js');
const sz = require('./hintergrund_6b2_szenarien.js');
const T = f => path.join(__dirname, f), JS = x => JSON.stringify(x);
const lesen = f => JSON.parse(fs.readFileSync(T(f), 'utf8'));
const quelle = d => fs.readFileSync(path.join(__dirname, '..', 'js', d), 'utf8');
let ok = 0, fehler = 0;
function check(name, c, info) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }

/* ---------- kleine Quelltext-Hilfen (nur für diese Datei, ohne Kommentare/Strings zu maskieren: synapsen.js hat keine Klammern in Texten) ---------- */
function koerper(q, name) {
    const i = q.indexOf('function ' + name + '(');
    if (i < 0) return null;
    let j = q.indexOf('{', q.indexOf(')', i)), tiefe = 0, k = j;
    for (; k < q.length; k++) { if (q[k] === '{') tiefe++; else if (q[k] === '}') { tiefe--; if (!tiefe) break; } }
    return q.slice(j, k + 1);
}
const ERREICHBAR = ['takt', 'denkt', 'start', 'stop', 'anlegen', 'messen', 'bauen', 'stichworte', 'zeichnen', 'glow', 'schritt', 'schleife', 'weniger', 'an', 'pd'];
const VERBOTEN = [/\bfetch\s*\(/, /XMLHttpRequest/, /sendBeacon/, /ZaneNative/, /ZaneBridge/, /localStorage/, /sessionStorage/, /\bsd\s*\(/, /setPersistentData/, /\bspeak\s*\(/, /speechSynthesis/, /Notification/, /memory/i, /jvKi/, /executeAction/, /sendToGroqSmart/, /remind|erinner(?!ungen')/i, /calendar|kalender(?!')/i, /isProcessing\s*=[^=]/, /__jvArbeit\s*=[^=]/, /ZaneNative|window\.jv[A-Z]/];
function statisch(q) {
    const f = [];
    for (const n of ERREICHBAR) {
        const k = koerper(q, n);
        if (k == null) { f.push('Funktion fehlt: ' + n); continue; }
        // Textliste WORTE/SCHRITTE enthält Wörter wie "Kalender": nur Funktionskörper prüfen, dort kommen sie nicht vor (stichworte nutzt die Liste nur lesend)
        for (const r of VERBOTEN) if (r.test(k)) f.push(n + '() enthält ' + r);
    }
    if ((q.match(/\bsd\s*\(/g) || []).length !== 2) f.push('Speicher-Schreibzugriffe nur im Befehl erlaubt (sd( genau 2×: Definition + Befehl)');
    if (/window\.[A-Za-z_$][\w$]*\s*=[^=]/.test(q.replace(/window\.__jvArbeit/g, ''))) f.push('schreibt eine globale Eigenschaft (window.x = …)');
    if ((q.match(/setInterval\(/g) || []).length !== 2) f.push('setInterval-Anzahl ≠ 2 (Takt + Befehls-Wartepoller)');
    return f;
}
const HUELLE = "try { if (typeof sendToGroqSmart === 'function' && !sendToGroqSmart._jvSyn) { var orig = sendToGroqSmart; sendToGroqSmart = function (text) { letzterText = String(text || ''); return orig.apply(this, arguments); }; sendToGroqSmart._jvSyn = true; } } catch (e) {}";
const huelle = q => { const m = /try \{\s*if \(typeof sendToGroqSmart[\s\S]*?\} catch \(e\) \{\}/.exec(q); return m ? m[0].replace(/\s+/g, ' ') : null; };
const SRC = quelle('synapsen.js');

/* ===== S. Stufe-A-Belege ===== */
console.log('S. Stufe A: was der 200-ms-Takt tut');
const sv = statisch(SRC);
check('Takt-Pfad (takt → denkt/start/stop → anlegen/messen/zeichnen/schleife …) schreibt keinen Speicher, ruft kein Netz/Native/Sprache/KI/Memory/Aktion/Kalender/Erinnerung auf und setzt keine globalen Werte', sv.length === 0, JS(sv));
check('Der Takt liest nur isProcessing (denkt) und window.__jvArbeit (schritt); beides nur lesend', /function denkt\(\)[^}]*isProcessing/.test(SRC) && /function schritt\(\)[^}]*__jvArbeit/.test(SRC));
const tk = koerper(SRC, 'takt');
check('takt(): springt versteckt sofort zurück und gleicht nur ab (denkt → start, sonst stop)', /document\.hidden\)\s*return/.test(tk) && /denkt\(\)/.test(tk) && /start\(\)/.test(tk) && /stop\(\)/.test(tk) && tk.replace(/\s+/g, ' ').length < 110, tk);
check('start() ist idempotent (aktiv-Wächter), stop() ohne aktiv tut nichts: die einmalige Sofort-Prüfung bei der Rückkehr kann keinen Schwall auslösen', /function start\(\)\s*\{\s*if \(aktiv \|\|/.test(SRC) && /function stop\(\)\s*\{\s*if \(!aktiv\) return;/.test(SRC));
check('Die vom Takt gesetzten Werte (aktiv, alpha, cv, ctx, txt, raf, worte …) sind Variablen im Skript; nirgends in window abgelegt, nirgends sonst gelesen', !/window\.[A-Za-z_$][\w$]*\s*=[^=]/.test(SRC.replace(/window\.__jvArbeit/g, '')));
const ANDERE = ['jvSynapsen', 'jvSynText', '_jvSyn', 'helfer_synapsen'];
const dateienMit = ANDERE.map(w => fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => /\.js$/.test(f) && fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8').indexOf(w) >= 0).sort());
check('Repo-weit: nur synapsen.js kennt die Anzeige-Elemente und die Hülle; boot.js liest nur den Schalter helfer_synapsen (Selbsttest, nicht den Takt)', JS(dateienMit) === JS([['synapsen.js'], ['synapsen.js'], ['synapsen.js'], ['boot.js', 'synapsen.js']]), JS(dateienMit));
check('KI-Hülle (einhaengen: synapsen → sendToGroqSmart) ist Zeichen für Zeichen unverändert und kommt im Takt-Pfad nicht vor', huelle(SRC) === HUELLE && (SRC.match(/sendToGroqSmart/g) || []).length === 5, String(huelle(SRC)).slice(0, 80));
check('Befehl "Synapsen aus/an" (Speicher-Schreibzugriff, Sprache) liegt außerhalb des Takts und ist unverändert', koerper(SRC, 'befehl') === koerper(require('child_process').execSync('git show 4d5b9e6:js/synapsen.js', { cwd: path.join(__dirname, '..') }).toString(), 'befehl'));

/* ===== A. Umfang ===== */
console.log('A. Umfang (alt = nach 6B.1, neu = 6B.2)');
const alt = lesen('hintergrund_soll_6b1.json'), neu = lesen('hintergrund_soll.json'), vorher = lesen('hintergrund_6b2_vorher.json').messung;
const imAlt = Object.fromEntries(alt.prozesse.map(p => [p.id, p])), imNeu = Object.fromEntries(neu.prozesse.map(p => [p.id, p]));
const geaendert = Object.keys(imNeu).filter(k => JS(imAlt[k]) !== JS(imNeu[k]));
check('Genau ein Prozess ändert sich: synapsen.js#1; keiner neu, keiner weg', JS(geaendert) === JS(['synapsen.js#1']) && alt.prozesse.length === 102 && neu.prozesse.length === 102, JS(geaendert));
check('synapsen.js#1: nur Stop und Doppelstart-Schutz ändern sich (nie gestoppt → clearInterval, keiner → clear vor Neustart); 200 ms, Klasse, Netz, Native gleich', JS(Object.keys(imNeu['synapsen.js#1']).filter(f => JS(imAlt['synapsen.js#1'][f]) !== JS(imNeu['synapsen.js#1'][f])).sort()) === JS(['doppel', 'stop']) && imNeu['synapsen.js#1'].ms === 200 && imNeu['synapsen.js#1'].klasse === 'dauerlauf' && !imNeu['synapsen.js#1'].netz && !imNeu['synapsen.js#1'].nativ, JS(imNeu['synapsen.js#1']));
const A_IDS = ['calendar.js#1', 'native_speech.js#1', 'voice.js#2', 'voice.js#3', 'auftraege.js#2', 'wachter.js#1', 'pushsync.js#1', 'pushsync.js#2', 'plan_ansagen.js#2'];
check('Kategorie A unverändert', A_IDS.every(id => JS(imAlt[id]) === JS(imNeu[id])));
const NETZ = Object.keys(imAlt).filter(id => imAlt[id].netz);
check('Alle Netzwerk-Poller (' + NETZ.length + ') unverändert', NETZ.length > 20 && NETZ.every(id => JS(imAlt[id]) === JS(imNeu[id])));
check('6B.1-Takte (mimik, holo_look, anzeige 300/400) unverändert; laune.js#2 weiter ab Laden und nie gestoppt; UI-Schreibmaschine unverändert', ['mimik.js#1', 'holo_look.js#1', 'anzeige.js#1', 'anzeige.js#2', 'laune.js#2', 'ui.js#1', 'ui.js#2', 'ui.js#3', 'ui.js#4'].every(id => JS(imAlt[id]) === JS(imNeu[id])) && imNeu['laune.js#2'].stop.indexOf('nie gestoppt') === 0);
check('synapsen.js#2 (Wartepoller 250 ms für jvCommands) unverändert; rAF-Schleifen unverändert', JS(imAlt['synapsen.js#2']) === JS(imNeu['synapsen.js#2']) && JS(alt.raf) === JS(neu.raf));
check('Neu auf visibilitychange hört genau synapsen.js dazu (31 → 32)', JS(neu.sichtbarkeitsHoerer.filter(x => alt.sichtbarkeitsHoerer.indexOf(x) < 0)) === JS(['synapsen.js']) && alt.sichtbarkeitsHoerer.length === 31 && neu.sichtbarkeitsHoerer.length === 32);
const sy = an.analysiere().find(a => a.id === 'synapsen.js#1');
check('Statisch: synapsen.js#1 wird nur über eine Kennung gestartet und per clearInterval gestoppt', sy.stop.indexOf('clearInterval') === 0 && /Neustart/.test(sy.doppel), JS([sy.stop, sy.doppel]));

/* ===== B. Prüfwelt ===== */
console.log('B. Prüfwelt (virtuelle Uhr, steuerbare Sichtbarkeit)');
const GLEICH = ['huelle', 'leerlauf30', 'ki', 'kiEnde', 'rueck30Sofort', 'rueck30Nach250', 'hiddenDenktRueckNach250', 'hiddenEnde', 'hiddenEndeRueckNach250', 'hiddenEndeNach1250', 'nachWechsel', 'denkt10', 'fehler', 'netz', 'speicherSchreiben', 'huelleNachher'];
function verstoesse(r, v) {
    const f = [];
    if (r.ladeFehler) return ['Ladefehler: ' + r.ladeFehler];
    for (const k of GLEICH) if (JS(r[k]) !== JS(v[k])) f.push('verändert gegenüber vorher: ' + k);
    if (r.start.aktiv !== v.start.aktiv || JS(r.start.ms) !== JS(v.start.ms)) f.push('Start: Anzahl/Takt anders');
    if (r.hidden30.aufrufe !== 0) f.push('hidden30: Timer-Rückrufe laufen weiter (' + r.hidden30.aufrufe + ')');
    if (r.hidden30.aktiv !== 0) f.push('hidden30: Timer nicht pausiert (' + r.hidden30.aktiv + ' aktiv)');
    if (r.hidden30.zeichnen !== 0 || r.hidden30.speicher !== 0 || r.hidden30.netz !== 0) f.push('hidden30: Zeichnen/Speicher/Netz im Hintergrund');
    if (r.hiddenDenkt.aufrufe !== 0) f.push('hiddenDenkt: Timer-Rückrufe laufen weiter (' + r.hiddenDenkt.aufrufe + ')');
    if (r.hiddenDenktRueckSofort.leinwand !== '1') f.push('Rückkehr (Denken läuft): Anzeige nicht sofort an');
    if (r.hiddenEndeRueckSofort.leinwand !== '0') f.push('Rückkehr (Denken war vorbei): Anzeige nicht sofort aus');
    if (r.wechsel10.aktiv !== 1 || JS(r.wechsel10.ms) !== JS([200]) || r.wechsel10.fehler !== 0) f.push('10 Wechsel: Timer vermehrt/verloren (' + r.wechsel10.aktiv + ')');
    if (JS(r.wechsel10.zustand) !== JS(v.wechsel10.zustand)) f.push('10 Wechsel: Anzeigezustand anders');
    return f;
}
const ist = sz.ablauf();
check('Prüfwelt lädt synapsen.js ohne Fehler; ein Takt à 200 ms; Hülle um sendToGroqSmart markiert und reicht Aufruf/Rückgabe unverändert durch', !ist.ladeFehler && ist.start.aktiv === 1 && JS(ist.start.ms) === JS([200]) && ist.huelle.markiert && ist.ki.rueckgabe === 'antwort:Wie wird das Wetter morgen?' && JS(ist.ki.originalAufrufe) === JS(['Wie wird das Wetter morgen?']));
check('SICHTBAR unverändert gegenüber vorher: Leerlauf 30 s (150 Takte), KI-Anfrage (Anzeige an/aus, Stichzeile), Takte bei Denken (50 in 10 s), Zeichnen', JS(ist.leerlauf30) === JS(vorher.leerlauf30) && JS(ist.ki) === JS(vorher.ki) && JS(ist.kiEnde) === JS(vorher.kiEnde) && JS(ist.denkt10) === JS(vorher.denkt10) && ist.leerlauf30.aufrufe === 150 && ist.denkt10.aufrufe === 50);
check('VORHER lief der Takt versteckt weiter (150 Rückrufe in 30 s, 25 in 5 s) – alter Zustand eingefroren', vorher.hidden30.aufrufe === 150 && vorher.hidden30.aktiv === 1 && vorher.hiddenDenkt.aufrufe === 25);
check('VERSTECKT jetzt: 0 Rückrufe, 0 aktive Takte, 0 Zeichenaufrufe, 0 Schreibzugriffe, 0 Netz', ist.hidden30.aufrufe === 0 && ist.hidden30.aktiv === 0 && ist.hidden30.zeichnen === 0 && ist.hidden30.speicher === 0 && ist.hidden30.netz === 0 && ist.hiddenDenkt.aufrufe === 0, JS([ist.hidden30, ist.hiddenDenkt]));
check('Fachlicher Zustand: versteckt eingefrorene Anzeige bleibt wie vorher (Denken beginnt/endet versteckt → Anzeige ändert sich nicht)', JS(ist.hiddenDenkt.zustand) === JS(vorher.hiddenDenkt.zustand) && JS(ist.hiddenEnde) === JS(vorher.hiddenEnde));
check('RÜCKKEHR: Anzeige stimmt SOFORT (Denken läuft → an; Denken vorbei → aus), nach 250 ms wie vorher; vorher kam das erst mit dem nächsten Takt', ist.hiddenDenktRueckSofort.leinwand === '1' && vorher.hiddenDenktRueckSofort.leinwand === '0' && ist.hiddenEndeRueckSofort.leinwand === '0' && vorher.hiddenEndeRueckSofort.leinwand === '1' && JS(ist.hiddenDenktRueckNach250) === JS(vorher.hiddenDenktRueckNach250) && JS(ist.hiddenEndeRueckNach250) === JS(vorher.hiddenEndeRueckNach250));
check('10 schnelle Wechsel (Denken läuft): weiter genau ein 200-ms-Takt, keine Ausnahme, Anzeige an; danach Denken vorbei → aus, ein Takt', ist.wechsel10.aktiv === 1 && JS(ist.wechsel10.ms) === JS([200]) && ist.wechsel10.fehler === 0 && ist.wechsel10.neueIntervalle <= 10 && ist.nachWechsel.aktiv === 1 && JS(ist.nachWechsel) === JS(vorher.nachWechsel), JS(ist.wechsel10));
check('Keine Ausnahme, kein Netz, kein Speicher-Schreibzugriff, Hülle nach dem Lauf weiter markiert und ruft das Original genau einmal', ist.fehler.length === 0 && ist.netz === 0 && ist.speicherSchreiben === 0 && ist.huelleNachher.markiert && ist.huelleNachher.originalAufrufe === 1);
check('Verstoß-Liste leer (gemeinsame Beurteilung)', verstoesse(ist, vorher).length === 0, JS(verstoesse(ist, vorher)));
check('Einsparung in 30 s versteckt (Prüfwelt): ' + (vorher.hidden30.aufrufe - ist.hidden30.aufrufe) + ' Rückrufe', vorher.hidden30.aufrufe - ist.hidden30.aufrufe === 150);

/* ===== C. Chromium alt (nach 6B.1) gegen neu (nach 6B.2) ===== */
console.log('C. Chromium-Messstand (alt gegen neu)');
const lAlt = lesen('hintergrund_laufzeit_6b1.json'), lNeu = lesen('hintergrund_laufzeit.json');
const A6 = aw.auswerten(lAlt), N6 = aw.auswerten(lNeu);
const synSite = l => Object.entries(aw.summiere(l.lauf.versteckt, Object.keys(l.lauf.versteckt.phasen))).filter(([s, v]) => /^synapsen\.js:/.test(s) && v.k === 'iv' && v.ms[200]).map(([s]) => s);
const synA = synSite(lAlt)[0], synN = synSite(lNeu)[0];
check('Messfenster gleich (10 s Start, 60 s Leerlauf, Modus voll) – dieselbe Messung wie 6A/6B.1', lNeu.modus === 'voll' && lAlt.modus === 'voll' && lNeu.fensterMs.idle === 60000 && lAlt.fensterMs.idle === 60000 && lNeu.fensterMs.start === 10000);
const prozent = (a, b) => Math.round((a - b) / a * 1000) / 10;
check('VERSTECKT: Rückrufe pro 60 s (alt ' + A6.callbacksVerstecktIdle + ' → neu ' + N6.callbacksVerstecktIdle + ', -' + prozent(A6.callbacksVerstecktIdle, N6.callbacksVerstecktIdle) + ' %) – der synapsen-Takt fehlt', A6.callbacksVerstecktIdle > 500 && N6.callbacksVerstecktIdle < A6.callbacksVerstecktIdle - 150 && N6.callbacksVerstecktIdle > 0);
const hid = (l, s) => { const x = aw.summiere(l.lauf.versteckt, ['idle_versteckt'])[s]; return x ? x.f : 0; }, vis = (l, s) => { const x = aw.summiere(l.lauf.sichtbar, ['idle'])[s]; return x ? x.f : 0; };
check('Der synapsen-Takt (' + synA + ' → ' + synN + '): versteckt vorher ≈ 300 Rückrufe, jetzt 0', !!synA && !!synN && hid(lAlt, synA) >= 250 && hid(lNeu, synN) === 0, JS([hid(lAlt, synA), hid(lNeu, synN)]));
check('SICHTBAR: der synapsen-Takt ruft im Leerlauf gleich oft auf wie vorher (±10 %), Rückrufe gesamt nicht schlechter (' + A6.callbacksSichtbarIdle + ' → ' + N6.callbacksSichtbarIdle + '; Schwankung der rAF-Kugel; Toleranz 10 %, weil auch unverändertes main auf anderer Maschine 2362 misst)', Math.abs(vis(lAlt, synA) - vis(lNeu, synN)) <= 0.1 * vis(lAlt, synA) && vis(lNeu, synN) > 250 && N6.callbacksSichtbarIdle <= A6.callbacksSichtbarIdle * 1.10);
/* Seit "Letzte Frage gewinnt" lädt die App eine Skriptdatei mehr; das ist die einzige Abweichung im Netz (eine Anfrage nach der Datei selbst). */
const NEUE_DATEIEN = ['/js/fragen_reihenfolge.js'];
check('Netz sichtbar/versteckt unverändert bis auf die neue Skriptdatei (' + A6.netzSichtbarIdle + '/0 → ' + N6.netzSichtbarIdle + '/0), gleiche Ziele', N6.netzSichtbarIdle - NEUE_DATEIEN.length === A6.netzSichtbarIdle && N6.netzVerstecktIdle === 0 && JS(Object.keys(lAlt.lauf.sichtbar.phasen.idle.net).sort()) === JS(Object.keys(lNeu.lauf.sichtbar.phasen.idle.net).filter(k => NEUE_DATEIEN.indexOf(k) < 0).sort()));
check('Native (Attrappe): dieselben Aufrufe (setBusy ≈ 200/min, sonst Einzelaufrufe)', JS(Object.keys(A6.nativIdle).sort()) === JS(Object.keys(N6.nativIdle).sort()) && N6.nativPollProMinute >= 150 && N6.nativPollProMinute <= 230, JS([A6.nativPollProMinute, N6.nativPollProMinute]));
const vAkt = n => { const a = lNeu.lauf.versteckt.aktiv[n]; return a ? Object.values(a.iv).reduce((x, y) => x + y, 0) : -1; };
check('Aktive Intervalle: Start 38, nach 60 s 39, versteckt 34 (die fünf Pausen-Takte fehlen), nach Rückkehr und 10 Wechseln wieder 39', N6.startAktivIntervalle === 38 && vAkt('idle') === 39 && vAkt('idle_versteckt') === 34 && vAkt('rueckkehr') === 39 && vAkt('wechsel10') === 39 && vAkt('nach_wechsel') === 39, JS(['idle', 'idle_versteckt', 'rueckkehr', 'wechsel10', 'nach_wechsel'].map(vAkt)));
const alle = aw.summiere(lNeu.lauf.versteckt, Object.keys(lNeu.lauf.versteckt.phasen));
check('10 Wechsel im echten Chromium: synapsen-Takt 12 Starts, 11 Stopps (genau einer aktiv)', alle[synN] && alle[synN].c === 12 && alle[synN].x === 11, JS(alle[synN] && [alle[synN].c, alle[synN].x]));
check('Pausiert versteckt: genau mimik, holo_look, anzeige×2, synapsen und die rAF-Kugel; weiter laufen calendar, gedaechtnis_zeit, ruhe, spotify', JS(N6.verstecktPausiert.map(s => s.replace(/·r$/, '').replace(/:\d+$/, '')).sort()) === JS(['anzeige.js', 'anzeige.js', 'holo_look.js', 'mimik.js', 'sphere.js', 'synapsen.js']) && JS(N6.verstecktWeiter.map(s => s.replace(/:\d+$/, ''))) === JS(['calendar.js', 'gedaechtnis_zeit.js', 'ruhe.js', 'spotify.js']), JS([N6.verstecktPausiert, N6.verstecktWeiter]));
const sp = l => l.lauf.versteckt.phasen.idle_versteckt.store;
check('Speicher versteckt: Schreibzugriffe wie vorher, Lesezugriffe sinken', sp(lNeu).set === sp(lAlt).set && sp(lNeu).remove === sp(lAlt).remove && sp(lNeu).get <= sp(lAlt).get, JS([sp(lAlt), sp(lNeu)]));
const ERLAUBT = [/Failed to load resource/, /JARVIS 3D: Loader konnten nicht geladen werden/, /Aufräumen des Langzeitgedächtnisses fehlgeschlagen/, /Dirigent: KI Cannot read properties of undefined/];
const konsole = Object.values(lNeu.lauf).flatMap(l => (l.konsole || []).map(x => x.replace(/^[a-z_0-9]+\|/, '')));
check('Konsole: nur die bekannten externen/Test-bedingten Meldungen, nichts Neues; Seitenfehler nur tailwind', konsole.length > 0 && konsole.every(x => ERLAUBT.some(r => r.test(x))) && Object.values(lNeu.lauf).every(l => (l.seitenfehler || []).every(x => /tailwind is not defined/.test(x))), JS(konsole.filter(x => !ERLAUBT.some(r => r.test(x))).slice(0, 3)));
check('Szenarien Sprache/Erinnerungen/Termine/Wetter/KI/Panelwechsel: keine Benachrichtigung, keine neuen setInterval', N6.benachrichtigungenGesamt === 0 && Object.values(N6.szenarien).every(s => s.neueIntervalle === 0));

/* ===== D. Gegenproben A–L (Quelltext nur im Speicher verändert) ===== */
console.log('D. Gegenproben A–L');
function mutiere(datei, altText, neuText) { const q = quelle(datei); if (q.indexOf(altText) < 0) throw new Error('Textstelle fehlt in ' + datei + ': ' + altText.slice(0, 50)); return q.replace(altText, neuText); }
function probe(name, datei, altText, neuText, erwartet) {
    let q; try { q = mutiere(datei, altText, neuText); } catch (e) { check('Gegenprobe ' + name + ' (Textstelle gefunden)', false, e.message); return; }
    const v = verstoesse(sz.ablauf(q), vorher).concat(statisch(q)).concat(huelle(q) === HUELLE ? [] : ['KI-Hülle verändert']);
    check('Gegenprobe ' + name + ' wird erkannt (' + erwartet + ')', v.some(x => x.indexOf(erwartet) >= 0), JS(v.slice(0, 4)));
}
const START = "if (!taktId) taktId = setInterval(takt, 200);", HIDDEN = "if (document.hidden) { if (taktId) { clearInterval(taktId); taktId = 0; } return; }";
probe('A: Takt komplett entfernt (Anzeige wird nie mehr eingeschaltet)', 'synapsen.js', START, ";", 'verändert gegenüber vorher');
probe('B: Hidden-Pause entfernt (Takt läuft versteckt weiter)', 'synapsen.js', HIDDEN, "if (false) { }", 'Timer-Rückrufe laufen weiter');
probe('C: beim Sichtbarwerden starten zwei Timer', 'synapsen.js', START, "if (!taktId) taktId = setInterval(takt, 200); setInterval(takt, 200);", 'Timer');
probe('D: zehn Wechsel vermehren die Timer (Kennung vergessen statt gestoppt)', 'synapsen.js', "if (taktId) { clearInterval(taktId); taktId = 0; }", "taktId = 0;", 'Timer');
probe('E1: KI-Hülle verändert (Markierung fehlt)', 'synapsen.js', "sendToGroqSmart._jvSyn = true;", "", 'KI-Hülle verändert');
probe('E2: KI-Hülle verändert (Text wird nicht mehr gemerkt, Rückgabe fehlt)', 'synapsen.js', "letzterText = String(text || ''); return orig.apply(this, arguments);", "letzterText = ''; return undefined;", 'KI-Hülle verändert');
probe('F: Storage-Verhalten verändert (Takt schreibt in den Speicher)', 'synapsen.js', "function takt() { if (document.hidden) return;", "function takt() { if (document.hidden) return; setPersistentData('x', '1');", 'speicherSchreiben');
probe('G: Netzwerkverhalten verändert (Takt ruft das Netz auf)', 'synapsen.js', "function takt() { if (document.hidden) return;", "function takt() { if (document.hidden) return; fetch('/api/probe');", 'fetch');
probe('H: Native-Verhalten verändert (Takt ruft ZaneNative auf)', 'synapsen.js', "function takt() { if (document.hidden) return;", "function takt() { if (document.hidden) return; try { window.ZaneNative.x(); } catch (e) {}", 'ZaneNative');
probe('I: fachlicher Zustand geht versteckt verloren (aktiv wird beim Verstecken zurückgesetzt)', 'synapsen.js', HIDDEN, "if (document.hidden) { if (taktId) { clearInterval(taktId); taktId = 0; } aktiv = false; return; }", 'verändert gegenüber vorher');
probe('J: sichtbare Frequenz verändert (200 → 400 ms)', 'synapsen.js', START, "if (!taktId) taktId = setInterval(takt, 400);", 'verändert gegenüber vorher');
probe('K: nur "if (hidden) return" statt echter Pause (Takt läuft weiter und ruft sinnlos auf)', 'synapsen.js', HIDDEN, "if (document.hidden) { return; }", 'Timer-Rückrufe laufen weiter');
{   /* L: Kategorie-A-Prozess verändert → statische Analyse erkennt es gegen den Soll-Zustand */
    const idNeu = ov => Object.fromEntries(an.analysiere(ov).map(a => [a.id, { ms: a.ms, art: a.art, klasse: a.klasse }]));
    const basis = idNeu(), q = quelle('calendar.js'), i = q.indexOf('if (window.jvPushHold)'), j = q.indexOf('}, 1000);', i);
    const l1 = idNeu({ 'calendar.js': q.slice(0, j) + '}, 2000);' + q.slice(j + '}, 1000);'.length) });
    check('Gegenprobe L1: Erinnerungs-Takt calendar.js#1 1000 → 2000 ms wird erkannt', l1['calendar.js#1'] && l1['calendar.js#1'].ms === 2000 && basis['calendar.js#1'].ms === 1000);
    const l2 = idNeu({ 'calendar.js': mutiere('calendar.js', "setInterval(() => {\n    if (window.jvPushHold)", "void(() => {\n    if (window.jvPushHold)") });
    check('Gegenprobe L2: Erinnerungs-Takt calendar.js#1 entfernt wird erkannt', !l2['calendar.js#1'] || Object.keys(l2).length !== Object.keys(basis).length);
}
{   /* Kontrollen: kein Fehlalarm */
    const k0 = verstoesse(sz.ablauf(SRC), vorher).concat(statisch(SRC));
    check('Kontrolle: unveränderter Quelltext → keine Verstöße (kein Fehlalarm)', k0.length === 0, JS(k0));
    const q1 = mutiere('synapsen.js', START, START + ' /* Kommentar */');
    check('Kontrolle: ein Kommentar im Quelltext → keine Verstöße', verstoesse(sz.ablauf(q1), vorher).length === 0 && statisch(q1).length === 0);
}

console.log('HINTERGRUND 6B.2: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
