/* ============================================================
   TEST: Wecker-Wünsche in jeder Formulierung stellen den Wecker (nicht nur eine Erinnerung):
   "Kannst du mich um 12 Uhr wecken?", "Weckst du mich um 6?", "Weck mich um sieben" ... Start: node tests/wecken_woerter.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
(async () => {
    const aufrufe = [];
    const native = new Proxy({ weckerStellen: (h, m) => { aufrufe.push([h, m]); return true; } }, { get: (t, k) => k in t ? t[k] : (() => '') });
    const A = starte({ jetzt: '2026-11-12T11:13:00+01:00', festerZufall: true, native, fetch: async u => { throw new Error('offline ' + u); } });
    A.vorspulen(2000);
    const faelle = [['Kannst du mich um 12 Uhr wecken', 12, 0], ['Ob er mich um 12 Uhr wecken kann', 12, 0], ['Weckst du mich um 6 Uhr', 6, 0], ['Weck mich um sieben', 7, 0], ['Wecke mich um 5 Uhr 30', 5, 30], ['Stell mir einen Wecker auf 12 Uhr', 12, 0], ['Bitte um 14 Uhr aufwecken', 14, 0]];
    for (const [satz, h, m] of faelle) {
        aufrufe.length = 0;
        await A.lassLaufen(async () => { await A.satz(satz); });
        check('stellt den Wecker: ' + satz, aufrufe.length === 1 && aufrufe[0][0] === h && aufrufe[0][1] === m, JSON.stringify(aufrufe));
    }
    for (const satz of ['Kaffee weckt die Lebensgeister', 'Erinner mich um 12 Uhr an den Anruf']) {
        aufrufe.length = 0;
        await A.lassLaufen(async () => { await A.satz(satz); });
        check('stellt KEINEN Wecker: ' + satz, aufrufe.length === 0, JSON.stringify(aufrufe));
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
