/* ============================================================
   TEST: Beträge ab 1.000 Euro werden für die Stimme in Worte umgeschrieben ("1.500,00 €" wurde als "eins 500" gesprochen).
   Start: node tests/preis_tausender.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const A = starte({ jetzt: '2026-11-12T11:13:00+01:00', festerZufall: true, fetch: async u => { throw new Error('offline ' + u); } });
A.vorspulen(500);
const W = A.sb.jvPricesToWords;
const f = [
    ['1.500,00 €', 'eintausendfünfhundert Euro'],
    ['1.500 Euro', 'eintausendfünfhundert Euro'],
    ['1500,00 Euro', 'eintausendfünfhundert Euro'],
    ['1.299,99 €', 'eintausendzweihundertneunundneunzig Euro neunundneunzig'],
    ['2.000 Euro', 'zweitausend Euro'],
    ['21.000,00 €', 'einundzwanzigtausend Euro'],
    ['Der Fernseher kostet 1.500,00 € bei Amazon.', 'Der Fernseher kostet eintausendfünfhundert Euro bei Amazon.']
];
check('0 Funktion vorhanden', typeof W === 'function');
for (const [ein, aus] of f) check('1 ' + ein, W(ein) === aus, JSON.stringify(W(ein)));
// Unverändertes
check('2a 129,99 Euro wie bisher', W('129,99 Euro') === 'einhundertneunundzwanzig Euro neunundneunzig', W('129,99 Euro'));
check('2b 12,50 Euro wie bisher', W('12,50 Euro') === 'zwölf Euro fünfzig', W('12,50 Euro'));
check('2c Jahreszahl und Datum bleiben', W('Am 12. November 2026') === 'Am 12. November 2026', W('Am 12. November 2026'));
check('2d 1.500 Meter bleiben (kein Geld)', W('1.500 Meter') === '1.500 Meter', W('1.500 Meter'));
console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
process.exit(fehler ? 1 : 0);
