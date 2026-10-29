/* Gemeinsamer Scanner für das Timer-Register (rein lesend, keine externen Pakete). Findet in js/*.js
   - setInterval(...)                       → Art "intervall"
   - setTimeout, das sich selbst neu ansetzt → Art "selbstansetzend" (Dauerschleife oder Warte-Poller)
   Einmalige Verzögerungen (setTimeout ohne Selbstaufruf) sind absichtlich NICHT erfasst: sie sind legitim und werden nicht überwacht.
   Bekannte Grenze: eine Schleife über zwei Funktionen (A setzt B an, B setzt A an) oder über einen Zwischenaufruf außerhalb der Funktion wird nicht erkannt;
   die heutigen setTimeout-Aufrufe mit mehrfach angesetztem Namen (z. B. spotify jetzt, schicht tick) wurden von Hand geprüft: es sind einmalige Starts neben einem setInterval. */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..');

/* Kommentare, Strings, Template-Texte und Regex-Literale durch Leerzeichen ersetzen (Länge und Zeilen bleiben gleich) */
function maskiere(src) {
    const out = src.split(''); const n = src.length; let i = 0; let letztesZeichen = '';   // letztes bedeutungstragendes Zeichen (für Regex-Erkennung)
    const leer = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
    const regexErlaubt = () => letztesZeichen === '' || /[(,=:[!&|?{};+\-*%<>~^]/.test(letztesZeichen) || /(?:return|typeof|case|in|of|delete|void|throw|new)$/.test(src.slice(Math.max(0, i - 8), i).trim());
    while (i < n) {
        const c = src[i], d = src[i + 1];
        if (c === '/' && d === '/') { let j = i; while (j < n && src[j] !== '\n') j++; leer(i, j); i = j; continue; }
        if (c === '/' && d === '*') { let j = src.indexOf('*/', i + 2); j = j < 0 ? n : j + 2; leer(i, j); i = j; continue; }
        if (c === '"' || c === "'") { let j = i + 1; while (j < n && src[j] !== c && src[j] !== '\n') { if (src[j] === '\\') j++; j++; } leer(i + 1, j); i = j + 1; letztesZeichen = c; continue; }
        if (c === '`') {   // Template: Text maskieren, ${...} bleibt sichtbar (einfach geklammert)
            let j = i + 1;
            while (j < n && src[j] !== '`') {
                if (src[j] === '\\') { out[j] = ' '; if (out[j + 1] !== '\n') out[j + 1] = ' '; j += 2; continue; }
                if (src[j] === '$' && src[j + 1] === '{') { let t = 1; const s = j; j += 2; while (j < n && t > 0) { if (src[j] === '{') t++; else if (src[j] === '}') t--; j++; } leer(s, j); continue; }
                if (src[j] !== '\n') out[j] = ' '; j++;
            }
            i = j + 1; letztesZeichen = '`'; continue;
        }
        if (c === '/' && regexErlaubt()) {   // Regex-Literal
            let j = i + 1, klasse = false;
            while (j < n && src[j] !== '\n') { if (src[j] === '\\') { j += 2; continue; } if (src[j] === '[') klasse = true; else if (src[j] === ']') klasse = false; else if (src[j] === '/' && !klasse) break; j++; }
            if (j < n && src[j] === '/') { leer(i + 1, j); i = j + 1; while (/[a-z]/.test(src[i] || '')) i++; letztesZeichen = '/'; continue; }
        }
        if (!/\s/.test(c)) letztesZeichen = c;
        i++;
    }
    return out.join('');
}
function klammerEnde(m, start, auf, zu) {   // Position der passenden schließenden Klammer (m = maskierter Text, start zeigt auf die öffnende)
    let t = 0;
    for (let i = start; i < m.length; i++) { if (m[i] === auf) t++; else if (m[i] === zu) { t--; if (t === 0) return i; } }
    return -1;
}
function argumente(m, original, klammerStart) {   // Top-Level-Argumente eines Aufrufs als Original-Text
    const ende = klammerEnde(m, klammerStart, '(', ')'); if (ende < 0) return null;
    const teile = []; let t = 0, von = klammerStart + 1;
    for (let i = klammerStart + 1; i < ende; i++) { const c = m[i]; if ('([{'.includes(c)) t++; else if (')]}'.includes(c)) t--; else if (c === ',' && t === 0) { teile.push(original.slice(von, i).trim()); von = i + 1; } }
    teile.push(original.slice(von, ende).trim());
    return { teile, ende };
}
function zeileVon(src, pos) { let z = 1; for (let i = 0; i < pos; i++) if (src[i] === '\n') z++; return z; }

/* Zahl aus einem Ausdruck wie 60*1000, 30 * 1000, 5000, MS_TAKT (Konstante aus derselben Datei) */
function rechne(ausdruck, m, original) {
    let e = String(ausdruck).replace(/\s+/g, '');
    for (let runde = 0; runde < 4; runde++) {
        e = e.replace(/[A-Za-z_$][\w$]*/g, name => {
            const re = new RegExp('(?:const|let|var)\\s+' + name.replace(/\$/g, '\\$') + '\\s*=\\s*([^;,\\n]+)');
            const x = re.exec(original); return x ? '(' + x[1].replace(/\s+/g, '') + ')' : name;
        });
    }
    if (/^[\d+*\/().\-e]+$/.test(e)) { try { const v = Function('"use strict";return (' + e + ')')(); if (typeof v === 'number' && isFinite(v)) return v; } catch (er) { } }
    return null;
}

/* Funktionskörper mit Namen: function NAME(...){...}, NAME = function(...){...}, const NAME = (..) => {...}, async-Varianten */
function funktionen(m) {
    const res = [];
    const re = /(?:function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function\b[^(]*\(|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)|([A-Za-z_$][\w$.]*)\s*=\s*(?:async\s*)?function\b[^(]*\()/g;
    let x;
    while ((x = re.exec(m))) {
        const name = (x[1] || x[2] || x[3] || '').split('.').pop();
        const k = m.indexOf('{', x.index + x[0].length - 1 > x.index ? x.index + x[0].length - 1 : x.index);
        let bo = m.indexOf('{', x.index + x[0].length - 1);
        if (/=>/.test(x[0])) bo = m.indexOf('{', x.index + x[0].length - 1);
        if (bo < 0) continue;
        // Nur wenn zwischen Kopf und { nur Leerraum/Klammer steht
        const eb = klammerEnde(m, bo, '{', '}'); if (eb < 0) continue;
        res.push({ name, von: bo, bis: eb });
    }
    return res;
}

function scanne(datei, quelle) {   // quelle (optional): Text statt der Datei (für Gegenproben im Speicher)
    const original = typeof quelle === 'string' ? quelle : fs.readFileSync(path.join(ROOT, 'js', datei), 'utf8');
    const m = maskiere(original);
    const funde = [];
    const fn = funktionen(m);
    const re = /\b(setInterval|setTimeout)\s*\(/g; let x;
    while ((x = re.exec(m))) {
        const klammer = x.index + x[0].length - 1;
        const a = argumente(m, original, klammer); if (!a) continue;
        const pos = x.index;
        if (x[1] === 'setInterval') {
            funde.push({ datei, art: 'intervall', zeile: zeileVon(original, pos), pos, ausdruck: a.teile[a.teile.length - 1].replace(/\s+/g, ' '), ms: rechne(a.teile[a.teile.length - 1], m, original), text: original.slice(pos, Math.min(a.ende + 1, pos + 1500)) });
            continue;
        }
        // setTimeout: selbstansetzend, wenn der Aufruf im Körper einer Funktion F steht und sein Rückruf F erwähnt
        const cb = a.teile[0] || '';
        const innen = fn.filter(f => f.von < pos && f.bis > pos);
        let rekursiv = null;
        for (const f of innen) { if (f.name && new RegExp('(^|[^\\w$.])' + f.name.replace(/\$/g, '\\$') + '\\b').test(maskiere(cb)) ) { rekursiv = f; } }
        const benannt = /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/.exec(cb);   // setTimeout(function schau(){ ... setTimeout(schau, ..) })
        if (!rekursiv && benannt) {
            const f = fn.find(g => g.name === benannt[1] && g.von > klammer && g.von < a.ende);
            if (f) { const innenText = m.slice(f.von, f.bis); if (new RegExp('setTimeout\\s*\\(\\s*(?:function\\s+)?' + benannt[1] + '\\b').test(innenText)) continue; }   // wird beim inneren Aufruf erfasst
        }
        if (rekursiv) funde.push({ datei, art: 'selbstansetzend', zeile: zeileVon(original, pos), pos, ausdruck: a.teile[a.teile.length - 1].replace(/\s+/g, ' '), ms: rechne(a.teile[a.teile.length - 1], m, original), funktion: rekursiv.name, text: original.slice(Math.max(rekursiv.von - 200, 0), Math.min(rekursiv.bis + 1, rekursiv.von + 2500)) });
    }
    return funde;
}
function alleDateien() { return fs.readdirSync(path.join(ROOT, 'js')).filter(f => /\.js$/.test(f)).sort(); }
function scanneAlle() { let r = []; for (const f of alleDateien()) r = r.concat(scanne(f)); return r; }
module.exports = { maskiere, scanne, scanneAlle, alleDateien, ROOT, funktionen, klammerEnde, argumente, zeileVon, rechne };
