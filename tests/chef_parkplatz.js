/* ============================================================
   TEST: Der Planer der Chef-KI (js/chef.js) behandelt Fragen nach dem Auto/Parkplatz nicht als Gedächtnisfrage (keine Rückfrage "Unter welchem Stichwort ...?"),
   sondern gibt sie unverändert an die App weiter (leerer Plan -> Weg 'nichts'). Start: node tests/chef_parkplatz.js
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name); }
const c = fs.readFileSync(path.join(__dirname, '..', 'js', 'chef.js'), 'utf8');
check('Planer-Text: Auto/Parkplatz sind keine Gedächtnisfragen', /Fragen nach dem Auto oder Parkplatz[^']*KEINE Gedächtnisfragen/.test(c));
check('Planer-Text: Beispiele "Wo ist mein Auto" und "Wo habe ich geparkt"', /Wo ist mein Auto\?[^']*Wo habe ich geparkt\?/.test(c));
check('Planer-Text: Auto-Fragen nutzen parkplatz_lesen, Navigation geht an die App zurück', /nutze dafür parkplatz_lesen/.test(c) && /weder Schritte noch frage noch hinweis/.test(c));
check('Leerer Plan geht an die App zurück (Weg nichts)', /!pr\.plan\.schritte\.length && !pr\.plan\.hinweis && !pr\.plan\.frage\) \{ aus\.weg = 'nichts'/.test(c));
check('parkplatz_lesen ist in allen Listen der Chef-KI (lesend)', ['FREIGEGEBEN', 'KI_PLAN', 'KI_FAEHIGKEITEN', 'LESEND'].every(n => new RegExp(n + ' = Object\\.freeze\\(\\[[^\\]]*\'parkplatz_lesen\'').test(c)));
check('Gedächtnis-Lesen bleibt für echte Merk-Fragen', /gedaechtnis_lesen \(params\.suche = Stichwort\) nur für Fragen, was sich Jarvis gemerkt hat/.test(c));
(async () => {
    const A = starte({ jetzt: '2026-11-12T14:30:00+01:00', festerZufall: true, fetch: async u => { throw new Error('offline ' + u); } });
    A.vorspulen(2000);
    const R = A.sb.jvRegistry;
    check('parkplatz_lesen ist angemeldet und nur lesend', !!R.hole('parkplatz_lesen') && R.hole('parkplatz_lesen').bestaetigung.noetig === false);
    A.setze('parkingSpot', null);
    const leer = await R.fuehreAus('parkplatz_lesen', {}, {});
    check('kein Parkplatz gespeichert: ehrliche Antwort', leer.status === 'SUCCESS' && /keinen gespeicherten Parkplatz/.test(leer.daten.nachricht), JSON.stringify(leer).slice(0, 200));
    A.setze('parkingSpot', { lat: 53.5, lon: 10.5, adresse: 'Neu-Galliner-Ring 6, Schwarzenbek', notiz: 'Reihe 3', gespeichert: new Date('2026-11-12T13:00:00+01:00').toISOString() });
    const da = await R.fuehreAus('parkplatz_lesen', {}, {});
    check('Parkplatz gespeichert: nennt Adresse, Zeit und Notiz', da.status === 'SUCCESS' && /Neu-Galliner-Ring 6/.test(da.daten.nachricht) && /gespeichert vor/.test(da.daten.nachricht) && /Reihe 3/.test(da.daten.nachricht), JSON.stringify(da).slice(0, 250));
    const g = A.sb.jvChef.planErlaubt({ schritte: [{ faehigkeit: 'parkplatz_lesen', params: {} }] });
    check('Chef-KI darf parkplatz_lesen planen, aber nicht mit Fremdangaben', g === true && A.sb.jvChef.planErlaubt({ schritte: [{ faehigkeit: 'parkplatz_lesen', params: { x: 1 } }] }) === false);
console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
process.exit(fehler ? 1 : 0);
})();
