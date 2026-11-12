/* ============================================================
   TEST: "Schreib Eier auf den Einkaufszettel" ist ein Schreibwunsch (geht zur KI), kein Foto-Auftrag;
   "Schreib den Einkaufszettel ab" bleibt der Foto-Auftrag. Start: node tests/einkaufszettel.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
(async () => {
    const A = starte({ jetzt: '2026-11-07T14:40:00+01:00', festerZufall: true, fetch: async u => { throw new Error('offline ' + u); } });
    A.vorspulen(2000);
    for (const s of ['Schreib Eier und Brot auf den Einkaufszettel', 'Setz Milch auf den Einkaufszettel', 'Schreib das auf den Zettel', 'Schreib Käse auf die Einkaufsliste']) {
        let r; await A.lassLaufen(async () => { r = await A.satz(s); });
        check('geht nicht an den Foto-Auftrag: ' + s, !r.lokal, String(r.modul));
    }
    for (const s of ['Schreib den Einkaufszettel ab', 'Fotografiere den Einkaufszettel und setz ihn auf die Liste']) {
        let r; await A.lassLaufen(async () => { r = await A.satz(s); });
        check('bleibt Foto-Auftrag: ' + s, r.lokal === true, String(r.modul));
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
