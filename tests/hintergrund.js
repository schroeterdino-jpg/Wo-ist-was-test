/* ============================================================
   HINTERGRUND-GOLDEN-MASTER (Phase 6A, nur Analyse und Sicherheitsnetz). Start: node tests/hintergrund.js      (Soll neu schreiben: --schreiben)
   Erfasst den IST-Zustand aller Hintergrundprozesse (setInterval, selbstansetzende setTimeout, requestAnimationFrame) mit Startart, Betrieb (ab Laden /
   bei Bedarf), Sichtbarkeits-Wächter, Stop, Begrenzung von Warte-Schleifen, Doppelstart-Schutz und vergleicht mit tests/hintergrund_soll.json.
   Dazu der gespeicherte Chromium-Messstand (tests/hintergrund_laufzeit.json): Start-Menge, Leerlauf sichtbar/versteckt, Netz, Native, Doppelstart.
   Was tests/timer.js schon sicher abdeckt (Register: Art, Takt, Vollständigkeit, Warte-Poller-Abbruch), wird hier NICHT wiederholt.
   Neu hier: Betrieb/Wächter/Stop/Begrenzung/Doppelstart je Prozess, rAF-Schleifen, Laufzeit-Kennzahlen, Gegenproben A–L.
   Ändert keinen Produktcode. Neu messen (lokal, braucht Playwright): node tests/hintergrund_messen.js, danach node tests/hintergrund.js --schreiben.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const an = require('./hintergrund_analyse.js'), aw = require('./hintergrund_auswertung.js');
const inventar = require('./timer_inventar.js'), sc = require('./timer_scan.js');
const SOLL = path.join(__dirname, 'hintergrund_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(name, c, info) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);
const lies = d => fs.readFileSync(path.join(sc.ROOT, 'js', d), 'utf8');

/* ---------- Projektion: nur die Merkmale, die ein Golden Master festhalten soll ---------- */
const kopf = s => String(s || '').replace(/[ :(].*/, '');
const proj = a => ({ id: a.id, art: a.art, ms: a.ms, klasse: a.klasse, anfang: a.anfang, start: kopf(a.start), guard: kopf(a.guard), stop: a.stop.replace(/\(.*$/, '').replace(/ gespeichert.*/, ' gespeichert').trim(), begrenzt: !!a.begrenzung, doppel: a.doppel, netz: !!(a.netz || a.netzInventar === 'ja'), nativ: !!(a.nativ || a.nativInventar === 'ja') });
const projRaf = (r, i, alle) => { const n = alle.slice(0, i + 1).filter(x => x.datei === r.datei).length; return { id: r.datei + '#r' + n, funktion: r.funktion, schleife: r.schleife, start: kopf(r.start), guard: !!r.guardHidden, cancel: !!r.stopFlag }; };
const messe = (ov) => ({ prozesse: an.analysiere(ov).map(proj), raf: (() => { const r = an.rafSchleifen(ov); return r.map((x, i) => projRaf(x, i, r)); })() });
function diff(soll, ist, schluessel) {
    const S = {}, I = {}; soll.forEach(x => { S[x[schluessel]] = x; }); ist.forEach(x => { I[x[schluessel]] = x; });
    const neu = Object.keys(I).filter(k => !(k in S)), weg = Object.keys(S).filter(k => !(k in I));
    const geaendert = Object.keys(I).filter(k => k in S && JS(S[k]) !== JS(I[k])).map(k => ({ id: k, felder: Object.keys(I[k]).filter(f => JS(S[k][f]) !== JS(I[k][f])) }));
    return { neu, weg, geaendert, ok: !neu.length && !weg.length && !geaendert.length };
}

(async () => {
    const soll = fs.existsSync(SOLL) ? JSON.parse(fs.readFileSync(SOLL, 'utf8')) : {};
    const ist = messe();
    const lauf = aw.laden(); ist.laufzeit = lauf ? aw.auswerten(lauf) : null;
    const LZ = ist.laufzeit;
    const KEINE_ZEIT = { idleProMinuteZahl: 1, idleNetz: 1, szenarien: 1, nativIdle: 1, nativStart: 1, speicherSichtbarIdle: 1, speicherVerstecktIdle: 1, callbacksSichtbarIdle: 1, callbacksVerstecktIdle: 1, domSichtbarIdle: 1, domVerstecktIdle: 1, versteckt: 1, nativPollProMinute: 1 };   // schwankende Rohzahlen: nur im Messstand/Doku, nicht im Soll-Vergleich
    const lzSoll = x => x ? Object.fromEntries(Object.entries(x).filter(([k]) => !KEINE_ZEIT[k])) : null;
    const istSoll = { prozesse: ist.prozesse, raf: ist.raf, laufzeit: lzSoll(LZ), sichtbarkeitsHoerer: an.sichtbarkeitHoerer() };
    if (SCHREIBEN) { fs.writeFileSync(SOLL, JSON.stringify(istSoll, null, 1) + '\n'); console.log('Soll-Zustand geschrieben: tests/hintergrund_soll.json'); return; }

    /* ===== A. Zahlen und Anschluss an das Register ===== */
    console.log('A. Zahlen (neu gemessen auf main) und Anschluss an tests/timer.js');
    const P = ist.prozesse;
    const nIv = P.filter(p => p.art === 'intervall').length, nSelbst = P.filter(p => p.art === 'selbstansetzend').length, dateien = new Set(P.map(p => p.id.replace(/#.*/, '')));
    check('102 Konstrukte (72 setInterval + 30 selbstansetzende setTimeout) in 58 Dateien, wie das Register', P.length === 102 && nIv === 72 && nSelbst === 30 && dateien.size === 58, P.length + '/' + nIv + '/' + nSelbst + '/' + dateien.size);
    check('Jede Zeile hat einen Registereintrag (gleiche id wie tests/timer_inventar.js)', P.every(p => inventar.some(e => e.id === p.id)) && P.length === inventar.length);
    check('16 requestAnimationFrame-Stellen in 6 Dateien', ist.raf.length === 16 && new Set(ist.raf.map(r => r.id.replace(/#.*/, ''))).size === 6, ist.raf.length + '');
    check('29 Dateien hören auf visibilitychange (dazu weitere mit direkter document.hidden-Prüfung)', istSoll.sichtbarkeitsHoerer.length === 29, String(istSoll.sichtbarkeitsHoerer.length));
    check('Betrieb: ab Laden / bei Bedarf / von außen sind alle drei belegt (Einordnung funktioniert)', ['ab Laden', 'bei Bedarf', 'von außen/Ereignis'].every(k => P.some(p => p.anfang === k)));

    /* ===== B. Golden Master gegen die Soll-Datei ===== */
    console.log('B. Golden Master Hintergrundprozesse');
    const dp = diff(soll.prozesse || [], ist.prozesse, 'id');
    check('Prozesse: nichts neu, nichts weg, nichts geändert (Art, Takt, Betrieb, Wächter, Stop, Begrenzung, Doppelstart-Schutz)', dp.ok, JS({ neu: dp.neu, weg: dp.weg, geaendert: dp.geaendert.slice(0, 6) }));
    const dr = diff(soll.raf || [], ist.raf, 'id');
    check('rAF-Schleifen: nichts neu, nichts weg, nichts geändert', dr.ok, JS(dr));
    check('visibilitychange-Hörer wie eingefroren', JS(istSoll.sichtbarkeitsHoerer) === JS(soll.sichtbarkeitsHoerer));

    /* ===== C. Gruppenbefunde (Sachaussagen, unabhängig vom Soll) ===== */
    console.log('C. Befunde je Gruppe');
    const soz = (f) => P.filter(f).map(p => p.id);
    const ALWAYS_ON = soz(p => p.anfang === 'ab Laden' && p.stop.indexOf('nie gestoppt') === 0 && p.art === 'intervall');
    check('Always-on: setInterval ab Laden ohne gespeicherte Kennung/Stop (mindestens 30; jeder neue fällt hier gezielt auf)', ALWAYS_ON.length >= 30, String(ALWAYS_ON.length));
    check('Unter 1 Sekunde: genau sieben Dauerläufer (anzeige 300/400, holo_look 700, mimik 120, native_speech 300, ruhe 400, synapsen 200)', JS(soz(p => p.ms != null && p.ms < 1000 && p.klasse === 'dauerlauf').sort()) === JS(['anzeige.js#1', 'anzeige.js#2', 'holo_look.js#1', 'mimik.js#1', 'native_speech.js#1', 'ruhe.js#1', 'synapsen.js#1']));
    const warte = P.filter(p => p.klasse === 'warte-poller');
    check('Retry/Wait: 29 Warte-Poller; die meisten mit Versuchsgrenze, genau drei ohne Zählgrenze (voice.js#1 bis maxMs per Timeout, wake_start.js#1 unbegrenzt, mehrfach/plan_ansagen/voicefix mit Zeitgrenze zählen als begrenzt)', warte.length === 29, String(warte.length));
    check('Unbegrenzt (heute): wake_start.js#1 wartet ohne Grenze auf speakAck/startListening', warte.find(p => p.id === 'wake_start.js#1').begrenzt === false);
    check('Begrenzt (heute): adresse_speichern.js#1 gibt nach 40 Versuchen auf', warte.find(p => p.id === 'adresse_speichern.js#1').begrenzt === true);
    check('Wächter: es gibt direkte, indirekte und fehlende Sichtbarkeitsprüfungen', ['direkt', 'indirekt', 'keiner'].every(g => P.some(p => p.guard === g)));
    check('Der 1-Sekunden-Erinnerungs-Takt calendar.js#1 hat KEINEN Sichtbarkeits-Wächter und wird nie gestoppt (läuft immer, absichtlich)', (() => { const p = P.find(q => q.id === 'calendar.js#1'); return p.guard === 'keiner' && p.stop.indexOf('nie gestoppt') === 0 && p.anfang === 'ab Laden'; })());
    check('Netz-Poller mit Wächter: sync.js#1, auftraege.js#2 (60 s), parkplatz_auto.js#1 prüfen document.hidden direkt', ['sync.js#1', 'auftraege.js#2', 'parkplatz_auto.js#1'].every(i => P.find(p => p.id === i).guard === 'direkt'));
    const dgr = {}; P.forEach(p => { dgr[p.doppel] = (dgr[p.doppel] || 0) + 1; });
    check('Doppelstart-Schutz (statisch): 47 einmalig beim Laden, 23 Selbstaufrufe, 17 ohne erkennbaren Schutz bei mehrfachem Funktionsaufruf, 9 mit Flag/Kennungsprüfung, 6 mit clear vor Neustart', JS(dgr) === JS({ 'Selbstaufruf (Start je Aufruf der Funktion)': 23, 'keiner (mehrfacher Aufruf der Funktion möglich)': 17, 'einmalig beim Laden': 47, 'clear vor Neustart': 6, 'Flag/Kennung geprüft': 9 }), JS(dgr));
    check('Stop: jedes bedingte Intervall (bedingt), das in einer Funktion startet, hat ein clearInterval, außer spotify.js#2 (Kennung gespeichert, aber nie gelöscht – nur beobachtet)', P.filter(p => p.klasse === 'bedingt' && p.art === 'intervall').every(p => /^clearInterval/.test(p.stop) || p.id === 'spotify.js#2'), JS(P.filter(p => p.klasse === 'bedingt' && p.art === 'intervall' && !/^clearInterval/.test(p.stop)).map(p => p.id)));
    const raf = ist.raf;
    check('rAF: sphere.js hat genau eine Selbstschleife (frame), holo_look.js und wetterfx.js eigene Schleifen, synapsen.js zwei Stellen', raf.filter(r => /^sphere\.js/.test(r.id) && r.schleife).length >= 1 && raf.some(r => /^holo_look/.test(r.id)) && raf.some(r => /^wetterfx/.test(r.id)) && raf.filter(r => /^synapsen/.test(r.id)).length === 2);
    check('rAF: holo_look, sphere, synapsen und wetterfx haben eine Sichtbarkeitsprüfung; avatar3d.js (3 Stellen, Selbstschleife loop) hat KEINE und kein cancelAnimationFrame – der Browser pausiert rAF im verdeckten Tab', ['holo_look.js', 'sphere.js', 'synapsen.js', 'wetterfx.js'].every(f => raf.filter(r => r.id.indexOf(f) === 0).every(r => r.guard)) && raf.filter(r => r.id.indexOf('avatar3d.js') === 0).length === 3 && raf.filter(r => r.id.indexOf('avatar3d.js') === 0).every(r => !r.guard && !r.cancel));
    check('rAF: kein cancelAnimationFrame in den js-Dateien (alle Schleifen enden, indem sie sich nicht erneut anfordern)', raf.every(r => !r.cancel));

    /* ===== D. Laufzeit-Messstand (Chromium) ===== */
    console.log('D. Chromium-Messstand');
    check('Messstand vorhanden (tests/hintergrund_laufzeit.json) – sonst lokal: node tests/hintergrund_messen.js', !!lauf);
    if (LZ) {
        check('Messfenster: 10 s Start, 60 s Leerlauf', lauf.fensterMs.start === 10000 && lauf.fensterMs.idle === 60000 && lauf.modus === 'voll');
        const regIv = {}; for (const a of an.analysiere()) if (a.art === 'intervall') regIv[a.datei + ':' + a.zeile] = a;
        const alleIvStellen = new Set(); for (const l of Object.values(lauf.lauf)) for (const p of Object.values(l.phasen)) for (const [s, v] of Object.entries(p.sites)) if (v.k === 'iv') alleIvStellen.add(s);
        const unbekannt = [...alleIvStellen].filter(s => !regIv[s]);
        check('Statisch gegen Laufzeit: jedes im Browser beobachtete setInterval steht im Inventar (' + alleIvStellen.size + ' von 72 beobachtet)', unbekannt.length === 0, JS(unbekannt));
        check('Start: genau ' + LZ.startIntervalle.length + ' Intervalle entstehen beim Laden und in den ersten 10 s (Menge eingefroren)', JS(LZ.startIntervalle) === JS((soll.laufzeit || {}).startIntervalle));
        check('Leerlauf: aktive Intervalle nach 60 s = Start-Menge + verzögert gestartete (Wächter/Briefing) – eingefroren', LZ.idleAktivIntervalle === (soll.laufzeit || {}).idleAktivIntervalle && LZ.startAktivIntervalle === (soll.laufzeit || {}).startAktivIntervalle, LZ.startAktivIntervalle + '→' + LZ.idleAktivIntervalle);
        check('Leerlauf: genau eine rAF-Schleife aktiv (Kugel-Avatar sphere.js)', JS(LZ.idleAktivRaf.map(s => s.replace(/·r$/, ''))) === JS(['sphere.js:342']), JS(LZ.idleAktivRaf));
        check('Leerlauf: Stufen der Rückrufe pro Minute je Datei eingefroren', JS(LZ.idleProMinuteStufe) === JS((soll.laufzeit || {}).idleProMinuteStufe));
        check('Leerlauf: Burst – systemcheck_voll.js (Tagescheck 45 s nach dem Start) erzeugt viele Einmal-Timeouts und Server-Aufrufe in einem Schwall', Object.keys(LZ.idleBurstTimeouts).some(s => /^systemcheck_voll\.js/.test(s)));
        check('Versteckt: ALLE Netzaufrufe hören auf (sichtbar >0, versteckt 0)', LZ.netzSichtbarIdle > 0 && LZ.netzVerstecktIdle === 0, LZ.netzSichtbarIdle + ' → ' + LZ.netzVerstecktIdle);
        check('Versteckt: die kurzen Animations-/Anzeige-Takte laufen unverändert weiter (mimik 120 ms, synapsen 200 ms, anzeige 300/400 ms, ruhe 400 ms, holo_look 700 ms)', ['mimik.js:202', 'synapsen.js:153', 'anzeige.js:160', 'anzeige.js:150', 'ruhe.js:18', 'holo_look.js:254'].every(s => LZ.verstecktWeiter.indexOf(s) >= 0), JS(LZ.verstecktWeiter));
        check('Versteckt: nur sphere.js (rAF) pausiert; voice.js:346 und laune.js:191 sind kurzlebig (versteckt 0, kein Dauertakt)', JS(LZ.verstecktPausiert.map(s => s.replace(/·r$/, ''))) === JS(['sphere.js:342']) && LZ.versteckt['voice.js:346'].versteckt === 0 && LZ.versteckt['laune.js:191'].versteckt === 0, JS(LZ.verstecktPausiert));
        check('Versteckt: Der 1-s-Erinnerungstakt calendar.js:42 läuft unverändert weiter', LZ.verstecktWeiter.indexOf('calendar.js:42') >= 0);
        check('Versteckt: weniger Rückrufe als sichtbar, aber nicht null (Jarvis-Guards pausieren nur rAF und Netz, nicht die Takte)', LZ.callbacksVerstecktIdle > 0 && LZ.callbacksVerstecktIdle < LZ.callbacksSichtbarIdle);
        check('Doppelstart-Probe (Erinnerungs-Panel 6× öffnen/schließen): kein neues Intervall, aktive Menge unverändert', LZ.doppelstartNeueIntervalle.length === 0 && LZ.doppelstartAktivGeaendert.length === 0, JS([LZ.doppelstartNeueIntervalle, LZ.doppelstartAktivGeaendert]));
        check('Mehrfach angelegte Intervall-Stellen im Lauf: nur voice.js:346 (whenVoicesReady, beendet sich selbst)', JS(LZ.mehrfachGestartet.versteckt) === JS(['voice.js:346 x2']) && JS(LZ.mehrfachGestartet.startVersteckt) === JS([]));
        check('Native-Attrappe: der 300-ms-Takt native_speech.js meldet setBusy etwa 200× pro Minute', LZ.nativPollQuelle === 'setBusy@native_speech.js' && LZ.nativPollProMinute >= 150 && LZ.nativPollProMinute <= 230, String(LZ.nativPollProMinute));
        check('Keine echte Benachrichtigung ausgelöst (Benachrichtigungs-Hülle zählt 0)', LZ.benachrichtigungenGesamt === 0);
        check('Szenarien: Panel-Wechsel/Erinnerungen/Termine/KI starten keine neuen setInterval', Object.values(LZ.szenarien).every(s => s.neueIntervalle === 0));
        check('Laufzeit-Kennzahlen (ohne Rohzähler) wie eingefroren', JS(lzSoll(LZ)) === JS(soll.laufzeit), '');
    }

    /* ===== E. Gegenproben A–L: die Analyse muss genau die jeweilige Änderung erkennen ===== */
    console.log('E. Gegenproben A–L');
    const ersetze1 = (q, alt, neu) => { if (q.indexOf(alt) < 0) throw new Error('Textstelle fehlt: ' + alt.slice(0, 50)); return q.replace(alt, neu); };
    const probe = (datei, f) => messe({ [datei]: f(lies(datei)) });
    const gegen = (name, datei, f, erwartet) => {
        let m; try { m = probe(datei, f); } catch (e) { check('Gegenprobe ' + name + ' (Textstelle gefunden)', false, e.message); return; }
        const d = diff(soll.prozesse, m.prozesse, 'id'), dr2 = diff(soll.raf, m.raf, 'id');
        check('Gegenprobe ' + name, !d.ok || !dr2.ok ? erwartet(d, dr2) : false, JS({ neu: d.neu, weg: d.weg, geaendert: d.geaendert.slice(0, 3), rafNeu: dr2.neu, rafGeaendert: dr2.geaendert.slice(0, 2) }));
    };
    gegen('A: kritischer Reminder-Timer (calendar.js, 1 s) entfernt', 'calendar.js', q => ersetze1(q, 'setInterval(() => {\n    if (window.jvPushHold)', 'void(() => {\n    if (window.jvPushHold)'), (d) => d.weg.indexOf('calendar.js#1') >= 0 || d.geaendert.length > 0 || d.neu.length > 0);
    gegen('B: Intervall des kritischen Timers verändert (1000 → 2000)', 'calendar.js', q => { const i = q.indexOf('if (window.jvPushHold)'); const j = q.indexOf('}, 1000);', i); if (i < 0 || j < 0) throw new Error('Textstelle fehlt'); return q.slice(0, j) + '}, 2000);' + q.slice(j + 9); }, d => d.geaendert.some(x => x.id === 'calendar.js#1' && x.felder.indexOf('ms') >= 0));
    gegen('C: Always-on-Prozess (sync.js) versehentlich doppelt gestartet', 'sync.js', q => q + '\nsetInterval(() => { if (!document.hidden) syncNow(); }, 180000);\n', d => d.neu.indexOf('sync.js#2') >= 0);
    gegen('D: Netzwerk-Polling doppelte Frequenz (sync.js 180000 → 90000)', 'sync.js', q => ersetze1(q, '}, 180000);', '}, 90000);'), d => d.geaendert.some(x => x.id === 'sync.js#1' && x.felder.indexOf('ms') >= 0));
    gegen('E: Visibility-Guard entfernt (sync.js)', 'sync.js', q => ersetze1(q, 'setInterval(() => { if (!document.hidden) syncNow(); }, 180000);', 'setInterval(() => { syncNow(); }, 180000);'), d => d.geaendert.some(x => x.id === 'sync.js#1' && x.felder.indexOf('guard') >= 0));
    gegen('F: clearInterval/Stop entfernt (lagebild.js)', 'lagebild.js', q => q.split('clearInterval(timer)').join('void(timer)'), d => d.geaendert.some(x => x.id === 'lagebild.js#1' && x.felder.indexOf('stop') >= 0));
    gegen('G: Native-Polling entfernt (native_speech.js, 300 ms)', 'native_speech.js', q => ersetze1(q, 'setInterval(function () {\n        try {\n            const busy', 'void(function () {\n        try {\n            const busy'), d => d.weg.indexOf('native_speech.js#1') >= 0 || d.neu.length > 0 || d.geaendert.length > 0);
    gegen('H: Avatar-Loop doppelt gestartet (sphere.js, zweiter rAF-Aufruf)', 'sphere.js', q => ersetze1(q, '            requestAnimationFrame(frame);', '            requestAnimationFrame(frame); requestAnimationFrame(frame);'), (d, dr2) => dr2.neu.length > 0 || dr2.geaendert.length > 0);
    gegen('I: Retry wird unbegrenzt, obwohl heute begrenzt (adresse_speichern.js)', 'adresse_speichern.js', q => ersetze1(q, 'n++ < 40', 'true'), d => d.geaendert.some(x => x.id === 'adresse_speichern.js#1' && x.felder.indexOf('begrenzt') >= 0));
    gegen('J: heute unbegrenzter Retry wird still begrenzt (wake_start.js)', 'wake_start.js', q => ersetze1(q, 'function warten() {', 'var wn = 0; function warten() { if (++wn > 40) return;'), d => d.geaendert.some(x => x.id === 'wake_start.js#1' && x.felder.indexOf('begrenzt') >= 0));
    gegen('K: Timer startet plötzlich schon beim Seitenstart statt erst bei Bedarf (lagebild.js open())', 'lagebild.js', q => { const i = q.lastIndexOf('})();'); if (i < 0) throw new Error('Textstelle fehlt'); return q.slice(0, i) + 'open();\n' + q.slice(i); }, d => d.geaendert.some(x => x.id === 'lagebild.js#1' && x.felder.indexOf('anfang') >= 0));
    gegen('L: bedarfsgesteuerter Timer wird Always-on (karte_zu.js: Start beim Laden + kein Stop)', 'karte_zu.js', q => { const r = q.split('clearInterval(timer)').join('void(timer)'); const i = r.lastIndexOf('})();'); if (i < 0) throw new Error('Textstelle fehlt'); return r.slice(0, i) + 'watch();\n' + r.slice(i); }, d => d.geaendert.some(x => x.id === 'karte_zu.js#1' && x.felder.indexOf('anfang') >= 0 && x.felder.indexOf('stop') >= 0));
    {   // Kontrollen: harmlose Änderungen bleiben unauffällig
        const m1 = messe({ 'sync.js': lies('sync.js') + '\n// setInterval(x, 10)\nconst z = "setInterval(y, 5)";\nsetTimeout(function () { eins(); }, 800);\n' });
        check('Kontrolle: Kommentar, Text und einmaliges setTimeout verändern die Analyse nicht', diff(soll.prozesse, m1.prozesse, 'id').ok && diff(soll.raf, m1.raf, 'id').ok);
        const m2 = messe({});
        check('Kontrolle: unveränderter Code = grün (Analyse ist deterministisch)', diff(soll.prozesse, m2.prozesse, 'id').ok);
    }
    if (LZ) {   // Laufzeit-Gegenproben: dieselben Kennzahlen mit manipuliertem Messstand
        const kopie = JSON.parse(JSON.stringify(lauf));
        kopie.lauf.versteckt.phasen.idle_versteckt.net['/api/sync'] = { n: 5, von: { 'sync.js': 5 }, ausTimer: 5 };
        check('Gegenprobe E (Laufzeit): Netz im versteckten Leerlauf wird erkannt', aw.auswerten(kopie).netzVerstecktIdle === 5 && aw.auswerten(kopie).netzVerstecktIdle !== LZ.netzVerstecktIdle);
        const kopie2 = JSON.parse(JSON.stringify(lauf)); kopie2.lauf.sichtbar.aktiv.doppelstart_6x.iv['calendar.js:42 @1000'] = 2;
        check('Gegenprobe C (Laufzeit): ein zusätzlicher aktiver Intervall nach dem Panel-Wechsel wird erkannt', aw.auswerten(kopie2).doppelstartAktivGeaendert.length === 1);
        const kopie3 = JSON.parse(JSON.stringify(lauf)); kopie3.lauf.sichtbar.phasen.start.sites['calendar.js:42'].c++; kopie3.lauf.versteckt.phasen.laden.sites['calendar.js:42'].c += 0;
        check('Gegenprobe H (Laufzeit): eine zweite rAF-Schleife im Leerlauf wird erkannt', (() => { const k = JSON.parse(JSON.stringify(lauf)); k.lauf.sichtbar.aktiv.idle.raf['sphere.js:350·r'] = 1; return aw.auswerten(k).idleAktivRaf.length === 2; })());
    }

    console.log('HINTERGRUND: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
