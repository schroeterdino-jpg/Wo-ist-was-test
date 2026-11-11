/* Regressionstest: Selbstdiagnose-Sprachbefehle, ohne App oder Netzwerk. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const src = fs.readFileSync('js/systemcheck_voll.js', 'utf8');
const start = src.indexOf('window.isSystemCheckCommand = function (text) {');
assert.ok(start >= 0, 'Systemcheck-Erkennung vorhanden');
const end = src.indexOf('\n    };', start);
assert.ok(end > start, 'Ende der Erkennung vorhanden');
const sandbox = { window: {} };
vm.runInNewContext(src.slice(start, end + 7), sandbox);
const erkennt = sandbox.window.isSystemCheckCommand;
for (const text of [
    'Mach eine Selbstdiagnose',
    'Jarvis, kannst du dich selbst diagnostizieren?',
    'Diagnostiziere dich selbst',
    'Prüfe deine Fähigkeiten',
    'Systemcheck',
    'Selbsttest',
    'Diagnose an'
]) {
    assert.equal(erkennt(text), text !== 'Diagnose an', text);
}
for (const text of ['Stell mir einen Wecker', 'Was gibt es heute zu essen?']) {
    assert.equal(erkennt(text), false, text);
}
console.log('Selbstdiagnose-Sprachbefehle: OK');


/* Phase 2: nur technische Teilchecks, niemals ungeprüfte Funktionen als OK ausgeben. */
const phase2 = fs.readFileSync('js/systemcheck_voll.js', 'utf8');
const a = phase2.indexOf('    const FAehIGKEITS_CHECKS = ');
const b = phase2.indexOf('\n    /* Namen, die andere Dateien', a);
assert.ok(a > 0 && b > a, 'Fähigkeitsdiagnose eingebunden');
const ctx = { window: { jvFaehigkeiten: { liste: [
    { id: 'kalender', name: 'Kalender', bekannteGrenzen: ['Bekannte Einschränkung'] },
    { id: 'wetter', name: 'Wetter', bekannteGrenzen: [] }
] } } };
ctx.GRUPPEN = ['Handy', 'Programm', 'Google', 'Dienste', 'Server', 'Daten', 'Weckruf-App'];
vm.runInNewContext(phase2.slice(a, b), ctx);
const diagnose = ctx.window.jvFaehigkeitsDiagnose;
assert.equal(typeof diagnose, 'function');
const leer = diagnose([]);
assert.equal(leer[0].status, 'nicht_geprueft');
const gruen = diagnose([{ name: 'Google Kalender', ok: true }, { name: 'Funktionen', ok: true }, { name: 'Programmfehler', ok: true }]);
assert.equal(gruen[0].status, 'nicht_geprueft', 'grüne Teilchecks beweisen keine komplette Fähigkeit');
assert.equal(gruen[0].teilchecksOk, 3);
const rot = diagnose([{ name: 'Google Kalender', ok: false, text: 'abgelaufen', fix: 'neu verbinden' }]);
assert.equal(rot[0].status, 'problem');
assert.ok(rot[0].vorschlaege.includes('neu verbinden'));
assert.ok(rot[0].vorschlaege.includes('Bekannte Einschränkung'));
assert.equal(rot[1].status, 'nicht_geprueft');
console.log('Fähigkeitsdiagnose Phase 2: OK');

/* Phase 3: Selbstdiagnose wird separat ausgegeben; Systemcheck bleibt erhalten. */
const local = fs.readFileSync('js/localcommands.js', 'utf8');
assert.ok(local.includes('runSystemCheckSpoken(text)'), 'Originalbefehl wird weitergereicht');
assert.ok(phase2.includes('const selbstdiagnose = /selbstdiagnose|diagnostizier|fähigkeiten/i.test'), 'Selbstdiagnose separat erkannt');
assert.ok(phase2.includes('window.jvFaehigkeitsDiagnose(res)'), 'Vorhandene Prüfergebnisse werden wiederverwendet');
assert.ok(phase2.includes('Die vollständige Funktion wurde nicht getestet.'), 'Keine unbelegten Funktionsbehauptungen');
console.log('Selbstdiagnose Phase 3: Anbindung OK');

/* Phase 4: Diagnose zeigt belegte Teilcheck-Informationen in kompakter Karte. */
assert.ok(phase2.includes('kompakt: true'), 'kompakte Diagnosekarte aktiviert');
assert.ok(phase2.includes('f.teilchecksOk > 0'), 'Teilchecks werden ausgewertet');
assert.ok(phase2.includes('a.naechsterSchritt'), 'konkrete Reparaturhinweise werden angezeigt');
assert.ok(!phase2.includes("8 Fähigkeiten erfasst, keine davon vollständig getestet"), 'alte pauschale Meldung entfernt');
const hud = fs.readFileSync('js/hud_fenster.js', 'utf8');
assert.ok(hud.includes('max-height:min(48vh,360px)'), 'Diagnosehöhe begrenzt');
assert.ok(hud.includes('overflow-y:auto'), 'Diagnose scrollbar');
console.log('Selbstdiagnose Phase 4: Anzeige OK');

/* Phase 5: Vollständiger technischer Bericht ohne erfundene Funktionstests oder Reparaturen. */
const report = ctx.window.jvSelbstdiagnoseBericht([
    { gruppe: 'Handy', name: 'Benachrichtigungen', ok: null, text: 'nicht nachgewiesen', fix: 'Testalarm auslösen' },
    { gruppe: 'Programm', name: 'Programmfehler', ok: false, text: '1 Fehler', fix: 'Fehlerprotokoll prüfen' },
    { gruppe: 'Programm', name: 'Bausteine', ok: true, text: 'geladen' }
]);
assert.equal(report.zaehler.gesamt, 3);
assert.equal(report.zaehler.bestanden, 1);
assert.equal(report.zaehler.probleme, 1);
assert.equal(report.zaehler.hinweise, 1);
assert.equal(report.aufgaben.length, 2);
assert.equal(report.aufgaben[0].naechsterSchritt, 'Testalarm auslösen');
assert.equal(report.vollstaendigerFunktionstest, false);
assert.equal(report.automatischRepariert, false);
assert.ok(phase2.includes('native Android-Alarmplanung vorhanden'), 'APK-Erinnerung nicht mit Browser-Push verwechseln');
console.log('Selbstdiagnose Phase 5: Detailbericht und sichere Reparaturplanung OK');


/* Regression: mehrtägige Ganztagstermine und normale Einzeltermine. */
const kalenderActions = fs.readFileSync('js/actions.js', 'utf8');
const kalenderGanztag = fs.readFileSync('js/geburtstag_ganztag.js', 'utf8');
const kalenderCore = fs.readFileSync('js/calendar.js', 'utf8');
assert.match(kalenderActions, /action\.calendar_end_date/);
assert.match(kalenderActions, /ganztag && gueltigesEnde/);
assert.match(kalenderGanztag, /true, endTag\)/);
assert.match(kalenderGanztag, /action\.calendar_end_date/);
assert.match(kalenderCore, /d1\.setDate\(d1\.getDate\(\) \+ 1\)/);
console.log('Mehrtägige Kalendertermine: Weitergabe und exklusives Google-Enddatum geprüft');
