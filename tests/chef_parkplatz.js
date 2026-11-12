/* ============================================================
   TEST: Der Planer der Chef-KI (js/chef.js) behandelt Fragen nach dem Auto/Parkplatz nicht als Gedächtnisfrage (keine Rückfrage "Unter welchem Stichwort ...?"),
   sondern gibt sie unverändert an die App weiter (leerer Plan -> Weg 'nichts'). Start: node tests/chef_parkplatz.js
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
let ok = 0, fehler = 0;
function check(name, b) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name); }
const c = fs.readFileSync(path.join(__dirname, '..', 'js', 'chef.js'), 'utf8');
check('Planer-Text: Auto/Parkplatz sind keine Gedächtnisfragen', /Fragen nach dem Auto oder Parkplatz[^']*KEINE Gedächtnisfragen/.test(c));
check('Planer-Text: Beispiele "Wo ist mein Auto" und "Wo habe ich geparkt"', /Wo ist mein Auto\?[^']*Wo habe ich geparkt\?/.test(c));
check('Planer-Text: keine Schritte, keine Frage, kein Hinweis', /weder Schritte noch frage noch hinweis/.test(c));
check('Leerer Plan geht an die App zurück (Weg nichts)', /!pr\.plan\.schritte\.length && !pr\.plan\.hinweis && !pr\.plan\.frage\) \{ aus\.weg = 'nichts'/.test(c));
check('Gedächtnis-Lesen bleibt für echte Merk-Fragen', /gedaechtnis_lesen \(params\.suche = Stichwort\) nur für Fragen, was sich Jarvis gemerkt hat/.test(c));
console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
process.exit(fehler ? 1 : 0);
