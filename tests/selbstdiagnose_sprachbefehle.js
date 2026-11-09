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
assert.ok(phase2.includes('Ob alle Fähigkeiten tatsächlich funktionieren, wurde nicht getestet.'), 'Keine unbelegten Funktionsbehauptungen');
console.log('Selbstdiagnose Phase 3: Anbindung OK');
