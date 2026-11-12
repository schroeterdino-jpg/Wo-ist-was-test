/* ============================================================
   TEST: Der KI-Text (js/prompt.js) trennt Handlungen von Wissensfragen: "Kann ich mit meiner Auto-App die Klimatisierung einschalten?" und
   "Wie schalte ich beim Kia das Nebellicht an?" sind Wissensfragen (kein "das kann ich nicht"), Satzfetzen führen zur Nachfrage. Start: node tests/prompt_wissen.js
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
let ok = 0, fehler = 0;
function check(name, b) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name); }
const p = fs.readFileSync(path.join(__dirname, '..', 'js', 'prompt.js'), 'utf8');
check('Regel: nur HANDLUNGEN sind "kann ich nicht"', /Das gilt nur für HANDLUNGEN/.test(p));
check('Regel: Fragen zu App/Auto/Gerät sind Wissensfragen', /Wissensfragen: beantworte sie aus deinem Wissen/.test(p) && /Auto-App die Klimatisierung/.test(p));
check('Regel: Satzfetzen führen zur Nachfrage', /unvollständiger Satzfetzen/.test(p) && /frage kurz nach/.test(p));
check('Die Handlungsgrenze steht davor (Anrufen, Geräte steuern)', p.indexOf('Geräte steuern') > 0 && p.indexOf('Geräte steuern') < p.indexOf('Das gilt nur für HANDLUNGEN'));
console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
process.exit(fehler ? 1 : 0);
