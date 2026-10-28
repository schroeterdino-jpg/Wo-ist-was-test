/* Cache-Stempel: setzt hinter jedes eigene Skript (./js/*.js) und ./style.css in index.html ?v=<Kurzkennung aus dem Inhalt>.
   Ändert sich eine Datei, ändert sich nur ihr Stempel. Fremde Skripte (https://...) bleiben unberührt.
   Aufruf:  node tools/stempel.js            setzt/aktualisiert alle Stempel in index.html
            node tools/stempel.js --pruefen  ändert nichts, meldet Abweichungen (Exit 1), wird auch von den Tests benutzt */
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const ROOT = path.join(__dirname, '..');
const INDEX = path.join(ROOT, 'index.html');
const MUSTER = /(<(?:script|link)\b[^>]*?\b(?:src|href)=")(\.\/(?:js\/[A-Za-z0-9_.-]+\.js|style\.css))(?:\?v=[^"]*)?(")/g;

function stempelVon(rel) {
    const bytes = fs.readFileSync(path.join(ROOT, rel));
    return crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 8);
}
function berechne(html) {
    const abweichungen = [];
    let anzahl = 0;
    const neu = html.replace(MUSTER, (all, vor, datei, nach) => {
        const rel = datei.replace(/^\.\//, '');
        if (!fs.existsSync(path.join(ROOT, rel))) { abweichungen.push(rel + ': Datei fehlt'); return all; }
        anzahl++;
        return vor + datei + '?v=' + stempelVon(rel) + nach;
    });
    if (neu !== html) {
        const alt = html.match(MUSTER) || [], nu = neu.match(MUSTER) || [];
        alt.forEach((a, i) => { if (a !== nu[i]) abweichungen.push((nu[i].match(/\.\/[^"?]+/) || ['?'])[0].slice(2) + ': Stempel fehlt oder ist veraltet'); });
    }
    return { neu, anzahl, abweichungen };
}
module.exports = { berechne, stempelVon, MUSTER };

if (require.main === module) {
    try {
        const html = fs.readFileSync(INDEX, 'utf8');
        const r = berechne(html);
        if (process.argv.includes('--pruefen')) {
            if (r.abweichungen.length) { console.log('Stempel nicht aktuell (' + r.abweichungen.length + '): ' + r.abweichungen.slice(0, 8).join(' | ') + (r.abweichungen.length > 8 ? ' …' : '') + '\nBitte "node tools/stempel.js" ausführen.'); process.exit(1); }
            console.log('Stempel aktuell (' + r.anzahl + ' Dateien).');
        } else {
            if (r.neu !== html) fs.writeFileSync(INDEX, r.neu);
            console.log('Stempel gesetzt: ' + r.anzahl + ' Dateien, ' + (r.abweichungen.length || 'keine') + ' geändert/Fehler.');
        }
    } catch (e) { console.log('Stempel-Skript: ' + e.message); process.exit(process.argv.includes('--pruefen') ? 1 : 0); }
}
