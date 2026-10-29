/* ============================================================
   HINTERGRUND-ANALYSE (Phase 6A, rein lesend). Baut auf tests/timer_scan.js und tests/timer_inventar.js auf und ergänzt je Hintergrundprozess:
   Startkontext (Laden / Ereignis / Funktion), Sichtbarkeits-Wächter (direkt/indirekt), Stop (clearInterval, gespeicherte Kennung), Begrenzung von Warte-Schleifen,
   Netz/Native/Speicher/Oberfläche/Sprache/Benachrichtigung im Rückruf (eine Ebene Hilfsfunktionen derselben Datei mitgelesen), dazu alle requestAnimationFrame-Schleifen.
   Ändert nichts. Bekannte Grenze: rein statisch – wer eine Funktion wann aufruft, zeigt erst die Messung (tests/hintergrund_messen.js).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const sc = require('./timer_scan.js');
const inventar = require('./timer_inventar.js');

const NETZ = /\b(?:fetch|apiFetch|XMLHttpRequest|sendBeacon|EventSource|WebSocket)\b/;
const NATIV = /\bZane(?:Native|Bridge)\b/;
const SPEICHER = /\b(?:localStorage|sessionStorage)\b/;
const OBERFLAECHE = /\b(?:document\.|innerHTML|classList|\.style\b|textContent|createElement|canvas|getContext)/;
const SPRACHE = /\b(?:speak|speakAck|speechSynthesis|SpeechSynthesis|Audio|\.play\()/;
const BENACHR = /\b(?:Notification|showNotification)\b/;
const WAECHTER_DIREKT = /\bdocument\.hidden\b|\bdocument\.visibilityState\b|\bvisibilityState\b/;
const BEGRENZUNG = /\+\+\s*\w+\s*[<>]=?\s*\d+|\b\w+\s*\+\+\s*[<>]=?\s*\d+|\b(?:versuch\w*|tries|try|n|i|zaehler\w*|count\w*)\s*(?:>=?|<=?)\s*\d+|Date\.now\(\)\s*-\s*\w+\s*[<>]=?\s*[\d*() ]+/i;

let cache = {}, OV = null;   // OV: nur für Gegenproben im Speicher { datei: geänderter Text }
function datei(d) {
    if (!OV && cache[d]) return cache[d];
    const original = OV && typeof OV[d] === 'string' ? OV[d] : fs.readFileSync(path.join(sc.ROOT, 'js', d), 'utf8'), m = sc.maskiere(original);
    const fn = sc.funktionen(m);
    const byName = {}; fn.forEach(f => { (byName[f.name] = byName[f.name] || []).push(f); });
    const r = { original, m, fn, byName };
    if (!OV) cache[d] = r;
    return r;
}

/* Stapel der umschließenden '{' an Position pos: [{art:'funktion'|'pfeil'|'steuer'|'block', name, offen}] */
function stapel(m, pos) {
    const st = [];
    for (let i = 0; i < pos; i++) {
        const c = m[i];
        if (c === '{') {
            const vor = m.slice(Math.max(0, i - 300), i).replace(/\s+$/, '');
            let art = 'block', name = '';
            if (/\b(?:else|try|finally|do)$/.test(vor)) art = 'steuer';
            else if (/=>$/.test(vor)) { art = 'pfeil'; const x = /([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^()]*\)|[A-Za-z_$][\w$]*)\s*=>$/.exec(vor); if (x) name = x[1]; }
            else if (/\)$/.test(vor)) {
                let t = 0, j = vor.length - 1;
                for (; j >= 0; j--) { if (vor[j] === ')') t++; else if (vor[j] === '(') { t--; if (t === 0) break; } }
                const kopf = j > 0 ? vor.slice(0, j).replace(/\s+$/, '') : '';
                if (/\b(?:if|for|while|switch|catch|with)$/.test(kopf)) art = 'steuer';
                else { art = 'funktion'; const x = /function\s*\*?\s*([A-Za-z_$][\w$]*)$/.exec(kopf) || /([A-Za-z_$][\w$]*)$/.exec(kopf); name = (x && !/^function$/.test(x[1])) ? x[1] : ''; }
            }
            st.push({ art, name, offen: i });
        } else if (c === '}') st.pop();
    }
    return st;
}
function istWrapper(m, rahmen) { return /^\s*;?\s*[(!+]\s*(?:async\s*)?(?:function\s*[\w$]*\s*\([^)]*\)|\([^)]*\)\s*=>)\s*$/.test(m.slice(0, rahmen.offen)); }
function aufrufKopf(d, rahmen) {   // bei anonymen Funktionen: in welchem Aufruf steht sie? (z. B. addEventListener('DOMContentLoaded', ...))
    const { m, original } = d; let t = 0, j = rahmen.offen;
    // von der Funktion rückwärts zur unausgeglichenen '('
    for (j = rahmen.offen - 1; j >= 0; j--) { const c = m[j]; if (c === ')' || c === ']' || c === '}') t++; else if (c === '(' || c === '[' || c === '{') { if (t === 0) break; t--; } }
    if (j < 0 || m[j] !== '(') return '';
    const kopf = original.slice(Math.max(0, j - 40), rahmen.offen);
    const ev = /addEventListener\s*\(\s*['"]([\w:-]+)['"]/.exec(kopf);
    if (ev) return 'ereignis:' + ev[1];
    const nm = /([A-Za-z_$][\w$.]*)\s*\($/.exec(original.slice(Math.max(0, j - 40), j + 1));
    return nm ? 'rueckruf:' + nm[1] : '';
}
function startKontext(d, pos, tiefe) {
    const st = stapel(d.m, pos), fr = st.filter(f => f.art === 'funktion' || f.art === 'pfeil');
    if (fr.length && istWrapper(d.m, fr[0])) fr.shift();
    if (!fr.length) return 'laden';
    const f = fr[fr.length - 1];
    if (f.name) return 'funktion:' + f.name;
    return aufrufKopf(d, f) || 'rueckruf:anonym';
}
function aufrufStellen(d, name, ausser) {   // Aufrufe von name(...) in der Datei ausserhalb der Definition(en) und ausserhalb von "ausser" (Funktionsbereich)
    const re = new RegExp('(?<![\\w$.])' + name.replace(/\$/g, '\\$') + '\\s*\\(', 'g'), res = []; let x;
    const defs = (d.byName[name] || []);
    while ((x = re.exec(d.m))) {
        const p = x.index;
        if (/(?:function\s*\*?\s*|\.\s*)$/.test(d.m.slice(Math.max(0, p - 12), p))) continue;   // Definition oder Methode
        if (ausser && p > ausser.von && p < ausser.bis) continue;
        res.push(p);
    }
    // auch als Wert (setTimeout(name, ...), addEventListener(..., name))
    const re2 = new RegExp('[,(]\\s*' + name.replace(/\$/g, '\\$') + '\\s*[,)]', 'g');
    while ((x = re2.exec(d.m))) { const p = x.index + 1; if (ausser && p > ausser.von && p < ausser.bis) continue; if (defs.some(f => p > f.von && p < f.bis && false)) continue; res.push(p); }
    return res.sort((a, b) => a - b);
}
function erststart(d, name, eigen, tiefe) {   // wo wird die Funktion zuerst angestoßen?
    if (tiefe > 2) return ['(tiefer verschachtelt)'];
    const stellen = aufrufStellen(d, name, eigen);
    if (!stellen.length) return ['(kein Aufruf in der Datei: von außen oder Ereignis)'];
    const k = []; for (const p of stellen.slice(0, 6)) { let c = startKontext(d, p); if (/^funktion:/.test(c) && tiefe < 2) { const n2 = c.slice(9); const f2 = (d.byName[n2] || [])[0]; if (n2 !== name && f2) { const w = erststart(d, n2, f2, tiefe + 1); c = c + ' → ' + w.join(' | '); } } k.push(c); }
    return [...new Set(k)];
}

function rueckrufText(d, f) {   // der Text, der bei jedem Lauf ausgeführt wird
    if (f.art === 'intervall') {
        const klammer = f.pos + f.text.indexOf('(');
        const a = sc.argumente(d.m, d.original, klammer);
        if (!a) return f.text;
        const cb = a.teile[0] || '';
        const nm = /^[A-Za-z_$][\w$]*$/.exec(cb.trim());
        if (nm) { const fx = (d.byName[nm[0]] || [])[0]; if (fx) return d.original.slice(fx.von, fx.bis + 1); }
        return cb;
    }
    const fx = (d.byName[f.funktion] || []).find(x => x.von < f.pos && x.bis > f.pos);
    return fx ? d.original.slice(fx.von, fx.bis + 1) : f.text;
}
function mitHilfen(d, text) {   // Text + Körper der in ihm aufgerufenen Funktionen derselben Datei (zwei Ebenen)
    let alles = text; const gesehen = new Set(); let schicht = [text];
    for (let e = 0; e < 2; e++) {
        const neu = [];
        for (const t of schicht) {
            const re = /(?<![\w$.])([A-Za-z_$][\w$]*)\s*\(/g; let x;
            while ((x = re.exec(sc.maskiere(t)))) { const n = x[1]; if (gesehen.has(n) || !d.byName[n]) continue; gesehen.add(n); d.byName[n].forEach(fx => { const b = d.original.slice(fx.von, fx.bis + 1); neu.push(b); alles += '\n' + b; }); }
        }
        schicht = neu;
    }
    return alles;
}
function wachterFunktionen(d) {   // dateilokale Funktionen, deren Körper selbst auf hidden prüft
    const s = new Set(); d.fn.forEach(f => { if (WAECHTER_DIREKT.test(d.m.slice(f.von, f.bis))) s.add(f.name); }); return s;
}
const GLOBALE_WAECHTER = /\b(?:wachterIdle|wachterAktiv|wachterOk|jvSichtbar|istSichtbar)\s*\(/;

function analysiere(ueberschreibe) {
    OV = ueberschreibe || null;
    try { return analysiere2(); } finally { OV = null; }
}
function analysiere2() {
    let funde = []; for (const dn of sc.alleDateien()) funde = funde.concat(sc.scanne(dn, OV && typeof OV[dn] === 'string' ? OV[dn] : undefined));
    const zaehl = {}, reg = {}; inventar.forEach(e => { reg[e.id] = e; });
    const res = [];
    for (const f of funde) {
        zaehl[f.datei] = (zaehl[f.datei] || 0) + 1;
        const id = f.datei + '#' + zaehl[f.datei], e = reg[id], d = datei(f.datei);
        const text = rueckrufText(d, f), alles = mitHilfen(d, text), m = sc.maskiere(alles);
        const wf = wachterFunktionen(d);
        let guard = 'keiner';
        if (WAECHTER_DIREKT.test(sc.maskiere(text))) guard = 'direkt';
        else if (WAECHTER_DIREKT.test(m)) guard = 'indirekt (Hilfsfunktion)';
        else if (GLOBALE_WAECHTER.test(m)) guard = 'indirekt (wachterIdle)';
        else { const aufrufe = [...wf].filter(n => new RegExp('(?<![\\w$.])' + n + '\\s*\\(').test(sc.maskiere(text))); if (aufrufe.length) guard = 'indirekt (' + aufrufe[0] + ')'; }
        // Start
        let start, erst = null;
        if (f.art === 'intervall') start = startKontext(d, f.pos);
        else { const fx = (d.byName[f.funktion] || []).find(x => x.von < f.pos && x.bis > f.pos); start = 'selbst:' + f.funktion; erst = fx ? erststart(d, f.funktion, fx, 0) : ['(unbekannt)']; }
        // Betrieb: läuft er ab dem Laden der Seite oder erst bei Bedarf?
        let anfang;
        if (f.art === 'intervall' && /^funktion:/.test(start)) { const n = start.slice(9), fx = (d.byName[n] || [])[0]; erst = fx ? erststart(d, n, fx, 0) : ['(unbekannt)']; }
        const ladeStart = start === 'laden' || /ereignis:(?:DOMContentLoaded|load)/.test(start) || (erst && erst.some(x => /(^|→ |\| )laden\b|ereignis:(?:DOMContentLoaded|load)/.test(x)));
        anfang = ladeStart ? 'ab Laden' : (erst && erst.length && erst[0].indexOf('kein Aufruf') >= 0 ? 'von außen/Ereignis' : 'bei Bedarf');
        // Doppelstart-Schutz
        const kopf800 = d.original.slice(0, 900), davor = d.original.slice(Math.max(0, f.pos - 700), f.pos);
        const idMatch = /([A-Za-z_$][\w$.]*)\s*=\s*$/.exec(d.original.slice(Math.max(0, f.pos - 90), f.pos).replace(/\s+$/, ''));
        let doppel;
        if (/if\s*\(\s*(?:window\.)?__\w+\s*\)\s*return/.test(kopf800)) doppel = 'Datei-Schutz (window.__...)';
        else if (idMatch && new RegExp('clearInterval\\s*\\(\\s*' + idMatch[1].replace(/[.$]/g, '\\$&') + '\\s*\\)').test(davor)) doppel = 'clear vor Neustart';
        else if (idMatch && new RegExp('if\\s*\\(\\s*!?\\s*' + idMatch[1].replace(/[.$]/g, '\\$&') + '\\s*\\)').test(davor)) doppel = 'Flag/Kennung geprüft';
        else if (start === 'laden' || /ereignis:(?:DOMContentLoaded|load)/.test(start)) doppel = 'einmalig beim Laden';
        else if (f.art === 'selbstansetzend') doppel = 'Selbstaufruf (Start je Aufruf der Funktion)';
        else doppel = 'keiner (mehrfacher Aufruf der Funktion möglich)';
        // Stop
        const vorher = d.original.slice(Math.max(0, f.pos - 90), f.pos), gespeichert = /([A-Za-z_$][\w$.]*)\s*=\s*$/.exec(vorher.replace(/\s+$/, ''));
        let stop;
        if (f.art === 'intervall') {
            const id2 = gespeichert ? gespeichert[1] : null;
            const hatClear = id2 ? new RegExp('clearInterval\\s*\\(\\s*' + id2.replace(/[.$]/g, '\\$&') + '\\s*\\)').test(sc.maskiere(d.original)) : /clearInterval/.test(text);
            stop = id2 ? (hatClear ? 'clearInterval(' + id2 + ')' : 'Kennung ' + id2 + ' gespeichert, aber kein clearInterval') : (/clearInterval/.test(text) ? 'clearInterval im Rückruf (Kennung nicht außen gespeichert)' : 'nie gestoppt (Kennung nicht gespeichert)');
        } else stop = /\b(?:if|return|while)\b/.test(sc.maskiere(text)) ? 'Bedingung im Körper (setzt sich nur bei Bedarf neu an)' : 'keine erkennbar';
        const bg = BEGRENZUNG.exec(sc.maskiere(text)) || BEGRENZUNG.exec(m);
        res.push({
            id, datei: f.datei, zeile: f.zeile, art: f.art, ms: f.ms, ausdruck: f.ausdruck, funktion: f.funktion || null,
            klasse: e ? e.klasse : '?', start, erststart: erst, anfang, doppel, guard, stop, begrenzung: bg ? bg[0].replace(/\s+/g, ' ') : null,
            netz: NETZ.test(m), nativ: NATIV.test(m), speicher: SPEICHER.test(m), oberflaeche: OBERFLAECHE.test(m), sprache: SPRACHE.test(m), benachrichtigung: BENACHR.test(m),
            netzInventar: e ? e.netz : '?', nativInventar: e ? e.native : '?'
        });
    }
    return res;
}

function rafSchleifen(ueberschreibe) {
    OV = ueberschreibe || null;
    try { return rafSchleifen2(); } finally { OV = null; }
}
function rafSchleifen2() {
    const out = [];
    for (const dn of sc.alleDateien()) {
        const d = datei(dn), re = /\brequestAnimationFrame\s*\(/g; let x;
        while ((x = re.exec(d.m))) {
            const pos = x.index, innen = d.fn.filter(f => f.von < pos && f.bis > pos).sort((a, b) => (b.von - a.von));
            const f = innen[0] || null;
            const a = sc.argumente(d.m, d.original, pos + x[0].length - 1), arg = a ? a.teile[0].trim() : '';
            const selbst = f && f.name && new RegExp('(?<![\\w$.])' + f.name + '\\b').test(arg || '') || (!!f && f.name && arg === f.name);
            const fxText = f ? d.original.slice(f.von, f.bis + 1) : '';
            out.push({ datei: dn, zeile: sc.zeileVon(d.original, pos), funktion: f ? f.name : null, arg: arg.slice(0, 40), schleife: !!(f && f.name && (arg === f.name || new RegExp('(?<![\\w$.])' + f.name + '(?![\\w$])').test(arg))), start: startKontext(d, pos), guardHidden: WAECHTER_DIREKT.test(sc.maskiere(fxText)) || WAECHTER_DIREKT.test(d.m), stopFlag: /cancelAnimationFrame/.test(d.m) });
        }
    }
    return out;
}
function sichtbarkeitHoerer() {   // Dateien mit visibilitychange
    const out = []; for (const dn of sc.alleDateien()) { const d = datei(dn); if (/visibilitychange/.test(d.original)) out.push(dn); } return out;
}

module.exports = { analysiere, rafSchleifen, sichtbarkeitHoerer, startKontext, datei, stapel };

if (require.main === module) {
    const a = analysiere();
    const k = {}; a.forEach(x => { k[x.start.replace(/:.*/, '')] = (k[x.start.replace(/:.*/, '')] || 0) + 1; });
    console.log('Funde: ' + a.length + ', Startarten: ' + JSON.stringify(k));
    const g = {}; a.forEach(x => { g[x.guard.replace(/ \(.*/, '')] = (g[x.guard.replace(/ \(.*/, '')] || 0) + 1; });
    console.log('Wächter: ' + JSON.stringify(g));
    console.log('rAF-Stellen: ' + rafSchleifen().length);
    if (process.argv.includes('--tabelle')) a.forEach(x => console.log([x.id, x.zeile, x.art, x.ms, x.klasse, x.start, x.guard, x.stop, x.begrenzung || '-', x.netz ? 'N' : '', x.nativ ? 'A' : ''].join(' | ')));
}
