/* ============================================================
   TEST: Die Vertretung bekommt die Pausenzeiten als Tageskontext (Spätschicht und Frühschicht), damit sie sagt, wann Dino sich meldet.
   Start: node tests/vertretung_pausen.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
(async () => {
    for (const [sh, erwartet] of [['spaet', ['15:45 bis 16:05', '18:00 bis 18:30']], ['frueh', ['7:30 bis 8:10', '9:30 bis 12:00']], [null, []]]) {
        const texte = [];
        const native = new Proxy({ schlafStand: () => '{}', schlafKontext: (d, t) => { texte.push(t); }, schlafArbeit() { } }, { get: (t, k) => k in t ? t[k] : (() => '') });
        const A = starte({ jetzt: '2026-11-12T13:09:00+01:00', festerZufall: true, native, fetch: async u => { throw new Error('offline ' + u); } });
        A.sb.jvPlan = Object.assign(A.sb.jvPlan || {}, { schichtAm: () => sh });
        if (A.sb.window && A.sb.window.jvPlan) A.sb.window.jvPlan.schichtAm = () => sh;
        await A.lassLaufen(async () => { await A.vorspulen(9000); });
        const t = texte[texte.length - 1] || '';
        if (sh) check(sh + ': Kontext nennt die Pausen', texte.length > 0 && erwartet.every(e => t.indexOf(e) >= 0) && /nicht am Handy/.test(t), t);
        else check('ohne Schicht keine Pausen im Kontext', /keine Schicht/.test(t) && !/Pausen/.test(t), t);
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
