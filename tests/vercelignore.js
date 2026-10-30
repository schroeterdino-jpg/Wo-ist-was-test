/* ============================================================
   VERCEL-DEPLOYMENT-INHALT (Start: node tests/vercelignore.js)
   Die Datei .vercelignore hält Entwicklungsdateien (Tests, Doku, Android-Bau) aus dem Vercel-Deployment heraus, damit jedes Deployment
   weniger Speicher belegt. Dieser Test sorgt dafür, dass dabei NIE etwas ausgeschlossen wird, was die laufende App braucht:
     1  .vercelignore besteht nur aus Kommentaren und KONKRETEN Pfaden (/ordner/ oder /datei), keine Platzhalter, kein Verneinen
     2  ausgeschlossen werden dürfen nur die Pfade auf der ERLAUBT-Liste (Tests, Doku, Android-Bau, Werkzeuge, GitHub-Dateien)
     3  alles, was die App zur Laufzeit lädt, ist NICHT ausgeschlossen: index.html, style.css, manifest.json, sw.js, vercel.json, package.json,
        Symbole, alle Skripte aus index.html, alle Dateien in js/, alle 11 Functions in api/, alle Dateien in models/ (falls vorhanden)
     4  nichts in der Laufzeit (index.html, js/, api/, sw.js, manifest.json, vercel.json) lädt etwas aus einem ausgeschlossenen Pfad
     5  Gegenproben: wird ein Laufzeitpfad oder ein Platzhalter eingetragen, schlägt der Test an
   Es werden keine Dateien verändert.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

let ok = 0, fehler = 0;
function check(n, c, extra) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + n + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); } }

/* Nur diese Pfade dürfen ausgeschlossen werden (Entwicklung, nicht Laufzeit). */
const ERLAUBT = ['/tests/', '/tools/', '/weckruf-src/', '/weckruf-test/', '/.github/', '/ARCHITEKTUR.md', '/LANDKARTE.md', '/CLAUDE.md'];

function regeln(text) { return text.split(/\r?\n/).map(z => z.trim()).filter(z => z && !z.startsWith('#')); }
function formOk(r) { return /^\/[A-Za-z0-9_.\-]+(\/)?$/.test(r); }   // nur /name oder /name/ , nichts anderes
function ausgeschlossen(p, rs) { return rs.some(r => r.endsWith('/') ? p.startsWith(r.slice(1)) : p === r.slice(1)); }
function alleDateien(d) {
    const a = [];
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
        const p = d ? d + '/' + e.name : e.name;
        if (e.name === '.git' || e.name === 'node_modules') continue;
        if (e.isDirectory()) a.push(...alleDateien(p)); else a.push(p);
    }
    return a;
}
function pruefe(text, laufzeit) {
    const m = [], rs = regeln(text);
    for (const r of rs) {
        if (!formOk(r)) m.push('Muster nicht erlaubt (nur konkrete Pfade): ' + r);
        else if (!ERLAUBT.includes(r)) m.push('Pfad nicht auf der Erlaubt-Liste: ' + r);
    }
    for (const p of laufzeit) if (ausgeschlossen(p, rs)) m.push('Laufzeitdatei ausgeschlossen: ' + p);
    return m;
}

/* ---------- Laufzeitdateien bestimmen ---------- */
const alle = alleDateien('').filter(p => p !== '.vercelignore');
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const skripte = [...idx.matchAll(/<script\b[^>]*\bsrc="\.\/([^"?]+)/g)].map(m => m[1]);
const links = [...idx.matchAll(/<link\b[^>]*\bhref="\.\/([^"?]+)/g)].map(m => m[1]);
const modelle = alle.filter(p => p.startsWith('models/'));
const laufzeit = Array.from(new Set([
    'index.html', 'style.css', 'manifest.json', 'sw.js', 'vercel.json', 'package.json', 'icon-192.png', 'icon-512.png',
    ...skripte, ...links, ...alle.filter(p => p.startsWith('js/') || p.startsWith('api/')), ...modelle
]));

/* ---------- 1/2/3 ---------- */
check('.vercelignore vorhanden', fs.existsSync(path.join(ROOT, '.vercelignore')));
const text = fs.existsSync(path.join(ROOT, '.vercelignore')) ? fs.readFileSync(path.join(ROOT, '.vercelignore'), 'utf8') : '';
const rs = regeln(text);
check('.vercelignore hat Einträge', rs.length > 0);
const meldungen = pruefe(text, laufzeit);
check('.vercelignore: nur konkrete, erlaubte Pfade und keine Laufzeitdatei betroffen', meldungen.length === 0, meldungen);

for (const p of ['index.html', 'style.css', 'manifest.json', 'sw.js', 'vercel.json', 'package.json', 'icon-192.png', 'icon-512.png']) check('Laufzeitdatei vorhanden und nicht ausgeschlossen: ' + p, fs.existsSync(path.join(ROOT, p)) && !ausgeschlossen(p, rs));
check('index.html: Skripte gefunden', skripte.length > 100, skripte.length);
for (const p of skripte) if (!fs.existsSync(path.join(ROOT, p)) || ausgeschlossen(p, rs)) check('Skript aus index.html vorhanden und nicht ausgeschlossen: ' + p, false);
const api = alle.filter(p => /^api\/[^/]+\.js$/.test(p));
check('alle 11 Functions in api/ vorhanden und nicht ausgeschlossen', api.length === 11 && api.every(p => !ausgeschlossen(p, rs)), api.length);
check('alle Dateien in models/ (falls vorhanden) nicht ausgeschlossen', modelle.every(p => !ausgeschlossen(p, rs)));
check('alle Dateien in js/ nicht ausgeschlossen', alle.filter(p => p.startsWith('js/')).every(p => !ausgeschlossen(p, rs)));

/* ---------- 4  die Laufzeit lädt nichts aus einem ausgeschlossenen Pfad ---------- */
const ausPfade = rs.filter(formOk).map(r => r.slice(1));
const laufzeitQuellen = ['index.html', 'sw.js', 'manifest.json', 'vercel.json', ...alle.filter(p => /^(js|api)\/.*\.js$/.test(p))];
const treffer = [];
for (const q of laufzeitQuellen) {
    const t = fs.readFileSync(path.join(ROOT, q), 'utf8');
    for (const a of ausPfade) {
        const name = a.replace(/\/$/, '');
        const rx = new RegExp('(?:fetch|import|require|importScripts|loadUrl)\\s*\\(\\s*[\'"`](?:\\./|/)?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:/|[\'"`])|(?:src|href)\\s*=\\s*["\'](?:\\./|/)?' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?:/|["\'])');
        if (rx.test(t)) treffer.push(q + ' -> ' + a);
    }
}
check('Laufzeit (index.html, js/, api/, sw.js, manifest.json) lädt nichts aus ausgeschlossenen Pfaden', treffer.length === 0, treffer);

/* ---------- 5  Gegenproben (nur im Speicher) ---------- */
check('Gegenprobe: /js/ eintragen wird gemeldet', pruefe(text + '\n/js/\n', laufzeit).length > 0);
check('Gegenprobe: /api/ eintragen wird gemeldet', pruefe(text + '\n/api/\n', laufzeit).length > 0);
check('Gegenprobe: /models/ eintragen wird gemeldet', pruefe(text + '\n/models/\n', laufzeit).length > 0);
check('Gegenprobe: /index.html eintragen wird gemeldet', pruefe(text + '\n/index.html\n', laufzeit).length > 0);
check('Gegenprobe: Platzhalter *.md wird gemeldet', pruefe(text + '\n*.md\n', laufzeit).length > 0);
check('Gegenprobe: Platzhalter *.json wird gemeldet', pruefe(text + '\n*.json\n', laufzeit).length > 0);
check('Gegenprobe: Verneinung !/js/ wird gemeldet', pruefe(text + '\n!/js/\n', laufzeit).length > 0);
check('Gegenprobe: /sw.js eintragen wird gemeldet', pruefe(text + '\n/sw.js\n', laufzeit).length > 0);
check('Gegenprobe: unbekannter Pfad /beispielrechnung.jpg wird gemeldet (nicht auf der Erlaubt-Liste)', pruefe(text + '\n/beispielrechnung.jpg\n', laufzeit).length > 0);

console.log((fehler ? 'FEHLGESCHLAGEN' : 'OK') + ': ' + ok + ' Prüfungen bestanden, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
