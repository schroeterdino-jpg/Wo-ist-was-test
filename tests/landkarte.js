/* Prüft LANDKARTE.md gegen den echten Dateibestand (nur Dokumentation, keine Produktlogik). Start: node tests/landkarte.js */
const fs = require('fs'), path = require('path');
const root = path.join(__dirname, '..');
let fehler = 0, ok = 0;
function check(n, c) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + n); } }
function alle(d, out) { for (const f of fs.readdirSync(d, { withFileTypes: true })) { if (f.name === 'node_modules' || f.name === '.git') continue; const p = path.join(d, f.name); if (f.isDirectory()) alle(p, out); else out.push(p); } return out; }
const md = fs.readFileSync(path.join(root, 'LANDKARTE.md'), 'utf8');
const jsDateien = fs.readdirSync(path.join(root, 'js')).filter(f => /\.js$/.test(f)).map(f => f.slice(0, -3));
const index = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const eingebunden = (index.match(/<script[^>]+src="\.\/js\/[^"?]+\.js/g) || []).length;

/* Abschnitt 4: jede js-Datei genau einmal */
const teil4 = md.slice(md.indexOf('## 4.'));
const genannt = {};
(teil4.match(/`[a-z0-9_]+`/g) || []).forEach(t => { const n = t.slice(1, -1); genannt[n] = (genannt[n] || 0) + 1; });
jsDateien.forEach(n => check('Bereichs-Zuordnung: ' + n + ' kommt genau einmal vor (statt ' + (genannt[n] || 0) + ')', genannt[n] === 1));
Object.keys(genannt).forEach(n => check('Zuordnung nennt unbekannte Datei: ' + n, jsDateien.indexOf(n) >= 0));
check('Anzahl js-Dateien = in index.html eingebundene Skripte (' + jsDateien.length + ' / ' + eingebunden + ')', jsDateien.length === eingebunden);
check('LANDKARTE.md nennt die aktuelle Dateizahl', md.indexOf(jsDateien.length + ' Produktdateien') >= 0);

/* Abschnitt 1+2: jede genannte Datei mit Endung existiert */
const bekannt = {}; alle(root, []).forEach(p => { bekannt[path.basename(p)] = true; });
const teil12 = md.slice(0, md.indexOf('## 4.'));
const namen = {}; (teil12.match(/[A-Za-z0-9_]+\.(js|java|glb|html)\b/g) || []).forEach(n => { namen[n] = 1; });
Object.keys(namen).forEach(n => check('Genannte Datei existiert: ' + n, bekannt[n] === true));
console.log('LANDKARTE: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
