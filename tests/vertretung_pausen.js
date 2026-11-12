/* ============================================================
   TEST: Die Pausenzeiten stehen als eine eigene Zeile im Wissensblatt (das bekommt die KI der Vertretung), passend zur Schicht;
   eigene Zeilen des Nutzers bleiben, ohne Schicht verschwindet die Pausenzeile. Start: node tests/vertretung_pausen.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
(async () => {
    for (const [sh, erwartet] of [['spaet', ['15:45 bis 16:05', '18:00 bis 18:30']], ['frueh', ['7:30 bis 7:50', '11:30 bis 12:00']], [null, []]]) {
        let blatt = 'Dino fährt gern Rad\nPausen bei der Arbeit: alt und falsch';
        const native = new Proxy({ schlafStand: () => '{}', schlafKontext() { }, schlafArbeit() { }, wissenListe: () => blatt, wissenSetzen: z => { blatt = z; } }, { get: (t, k) => k in t ? t[k] : (() => '') });
        const A = starte({ jetzt: '2026-11-12T13:09:00+01:00', festerZufall: true, native, fetch: async u => { throw new Error('offline ' + u); } });
        A.sb.jvPlan = Object.assign(A.sb.jvPlan || {}, { schichtAm: () => sh });
        if (A.sb.window && A.sb.window.jvPlan) A.sb.window.jvPlan.schichtAm = () => sh;
        await A.lassLaufen(async () => { await A.vorspulen(9000); });
        const z = blatt.split('\n');
        check((sh || 'keine Schicht') + ': eigene Zeile des Nutzers bleibt', z.indexOf('Dino fährt gern Rad') >= 0, blatt);
        check((sh || 'keine Schicht') + ': alte Pausenzeile ersetzt, genau eine oder keine', z.filter(x => x.indexOf('Pausen bei der Arbeit:') === 0).length === (sh ? 1 : 0) && blatt.indexOf('alt und falsch') < 0, blatt);
        if (sh) check(sh + ': Pausenzeiten stimmen', erwartet.every(e => blatt.indexOf(e) >= 0) && /nicht am Handy/.test(blatt), blatt);
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
