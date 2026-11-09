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
