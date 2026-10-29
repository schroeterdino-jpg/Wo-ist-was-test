/* ============================================================
   GLOBALE ERSETZUNGEN (Phase 5A, nur Sicherheitsnetz). Start: node tests/globale.js        (Soll neu schreiben: node tests/globale.js --schreiben)
   Friert den HEUTIGEN Zustand der noch impliziten globalen Wrapper ein, BEVOR jemand sie umbaut. Ändert kein Produktverhalten und keine Produktdatei.
   Soll-Zustand: tests/globale_soll.json. Beschreibung der Befunde: tests/globale-ist-zustand.md.

   Die App wird wie im Browser geladen (document.readyState 'loading', danach DOMContentLoaded, load, Zeitgeber), alle Skripte in der echten Reihenfolge
   (das Inline-Skript mit den Mimik-Befehlen steht an seiner Stelle). Gemessen wird:
   A. Ersetzungsprotokoll: nach jedem Skript und nach jeder Start-Phase, welche globale Funktion durch eine andere ersetzt wurde (Ladereihenfolge-Landkarte).
   B. Wirkung: buildSystemPrompt (seit Phase 5B nur noch die Kette jvChain; früher Moment gegen Endstand), handleLocalCommand (Eingabe -> Ergebnis), sendToGroqSmart (was beim Kern
      ankommt), searchSemanticMemory (welche Anfrage geht raus), openPanel/closePanel (welche Schließer laufen).
   C. Wartekonstruktionen: Zeitgeber, die beim Laden entstehen (Wiederholung "warte auf jvCommands"), und der Beweis, dass sie bei fehlender Datei wirklich warten.
   D. Paar-Vertauschungen INNERHALB der Plätze der beteiligten Wrapper-Dateien (nie eine Datei vor ihre Voraussetzungen ziehen): friert ein, was sich ändert.
   Gegenproben: jede Messung wird mit künstlich verändertem Quelltext oder Ladeumfang wiederholt und muss dann abweichen.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), crypto = require('crypto');
const { starte, lies } = require('./umgebung.js');

const SOLL_DATEI = path.join(__dirname, 'globale_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
const DETAILS = process.argv.includes('--details');
let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);
const kurz = (s, n) => { s = String(s).replace(/\s+/g, ' '); return s.length > (n || 90) ? s.slice(0, n || 90) + '…' : s; };
const sha = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 10);

const html = lies('index.html');
const INLINE = (html.split('<script>').slice(1).map(x => x.split('</script>')[0]).filter(x => x.indexOf('handleAvatarExpressionCommand') >= 0)[0]) || '';
const PRE = "(function(){ if (window.__ev) return; document.readyState = 'loading'; window.__ev = {}; var reg = function (o, n) { var a = o.addEventListener; o.addEventListener = function (t, fn) { (window.__ev[n + ':' + t] = window.__ev[n + ':' + t] || []).push(fn); return a && a.apply(this, arguments); }; }; reg(window, 'w'); reg(document, 'd');" +
    " window.__tl = []; ['setTimeout', 'setInterval'].forEach(function (n) { var o = window[n]; window[n] = function (fn, ms) { var s = (new Error().stack || '').split('\\n').slice(2).map(function (l) { var m = /([\\w.-]+\\.js):/.exec(l); return m && m[1]; }).filter(function (x) { return x && x !== 'umgebung.js'; })[0] || '?'; window.__tl.push([n === 'setTimeout' ? 't' : 'i', ms, s]); return o.apply(this, arguments); }; }); })();\n";

/* ---------- Welt wie im Browser ---------- */
async function baue(opt) {
    opt = opt || {};
    let erste = true;
    const snap = {}, proto = { laden: [], DCL: [], load: [], zeit: [] };
    function scan(phase, tag, sb) {
        for (const k of Object.getOwnPropertyNames(sb)) {
            let v; try { v = sb[k]; } catch (e) { continue; }
            if (!(k in snap)) { snap[k] = v; continue; }
            if (snap[k] !== v) { if (typeof v === 'function' || typeof snap[k] === 'function') proto[phase].push(tag + ' -> ' + k); snap[k] = v; }
        }
    }
    const w = starte(Object.assign({ festerZufall: true, echtesSpeak: true }, opt, {
        quelleAendern: (f, q) => { const q2 = typeof opt.quelleAendern === 'function' ? opt.quelleAendern(f, q) : q; if (erste) { erste = false; return PRE + q2; } return q2; },
        nachSkript: (f, sb) => {
            if (f === 'kopf.js' && INLINE) { try { vm.runInContext(INLINE, sb, { filename: 'index.html(inline)' }); } catch (e) { } scan('laden', 'index.html(inline)', sb); }
            scan('laden', f, sb);
            if (typeof opt.nachSkript === 'function') opt.nachSkript(f, sb);
        }
    }));
    const sb = w.sb, ev = sb.__ev || {};
    sb.document.readyState = 'interactive';
    for (const fn of (ev['d:DOMContentLoaded'] || []).concat(ev['w:DOMContentLoaded'] || [])) { try { fn({}); } catch (e) { } }
    scan('DCL', 'DOMContentLoaded', sb);
    sb.document.readyState = 'complete';
    for (const fn of (ev['w:load'] || [])) { try { fn({}); } catch (e) { } }
    scan('load', 'load', sb);
    for (let i = 0; i < 4; i++) { await w.vorspulen(500); scan('zeit', 't+' + ((i + 1) * 0.5) + 's', sb); }
    w.proto = proto;
    w.zeitgeberLaden = {};   // Zeitgeber, die beim Laden der Skripte entstanden (vor den Start-Ereignissen)
    return w;
}
const lade = w => w.sb.__tl;   // alle Zeitgeber-Aufrufe (Laden + später)

/* ---------- B1: buildSystemPrompt ---------- */
const PROMPT_EINGABEN = [
    'Hallo wie geht es dir',
    'Was weißt du über mich? Erinnerst du dich an mein Gedächtnis?',
    'Antworte nur kurz',
    'Erklär mir das bitte genauer und ausführlich',
    'Wo ist aktuell Krieg auf der Welt?',
    'Ich habe ein Rezept fotografiert'
];
const KOPF = /^[A-ZÄÖÜ][A-ZÄÖÜß0-9 ,\/()+\-]{5,70}:/;
function promptInfo(p) {
    p = String(p);
    const kopf = p.split('\n').map(z => z.trim()).filter(z => KOPF.test(z)).map(z => z.replace(/:.*$/, ''));
    return { len: p.length, sha: sha(p), kopfAnzahl: kopf.length, kopfSha: sha(kopf.join('|')), kontextPlus: p.split('GESPRÄCHSKONTEXT UND FOLGEFRAGEN').length - 1, kopf };
}
function messePrompt(w) {
    const r = {};
    PROMPT_EINGABEN.forEach((t, i) => {
        let p; try { p = w.sb.buildSystemPrompt(t, {}, '2026-10-29T08:00:00+01:00'); } catch (e) { p = 'FEHLER ' + e.message; }
        const info = promptInfo(p);
        r['e' + i] = i === 0 ? info : { len: info.len, sha: info.sha, kopfAnzahl: info.kopfAnzahl, kopfSha: info.kopfSha, kontextPlus: info.kontextPlus };
    });
    return r;
}

/* Marker der fünf Blöcke; Anzahl je Block in der fertigen KI-Anweisung */
const BLOECKE = { kontextplus: 'GESPRÄCHSKONTEXT UND FOLGEFRAGEN', fish: 'LAUTES LACHEN:', worldqueryfix: 'GLOBALE LAGEFRAGE:', gedaechtnisFrage: 'GEDÄCHTNIS-FRAGEN:', gedaechtnisGehirn: 'KONTEXT-GEHIRN / AKTIVES LANGZEITGEDÄCHTNIS', lachwunsch: 'LACHEN: Der Nutzer wünscht' };
const anzahl = (p, m) => String(p).split(m).length - 1;
const zaehle = p => { const r = {}; for (const k of Object.keys(BLOECKE)) r[k] = anzahl(p, BLOECKE[k]); r.zane = (String(p).match(/ZANE(?![A-Z_])|\bZane/g) || []).length; return r; };
const ZUSTAENDE = { normal: {}, lachen: { jvLaughWish: () => true }, aus: { getHumanLevel: () => 'aus' } };
function messeZustaende(w) {   // Zustand der Einstellungen ändert, welche Blöcke dazukommen (Lachwunsch, "Menschliche Laute aus")
    const r = {}, sb = w.sb;
    for (const z of Object.keys(ZUSTAENDE)) {
        const alt = {}; for (const k of Object.keys(ZUSTAENDE[z])) { alt[k] = sb[k]; sb[k] = ZUSTAENDE[z][k]; }
        r[z] = [0, 1, 4].map(i => { const p = sb.buildSystemPrompt(PROMPT_EINGABEN[i], {}, '2026-10-29T08:00:00+01:00'); return { sha: sha(p), len: String(p).length, bloecke: zaehle(p) }; });
        for (const k of Object.keys(alt)) sb[k] = alt[k];
    }
    return r;
}
const kette = w => { const f = w.sb.buildSystemPrompt; return { liste: w.sb.jvChain.list('buildSystemPrompt'), dispatcher: f._jvChain === true, schluessel: Object.keys(f) }; };
const KETTE_NEU = ['10 name', '20 gedaechtnis', '30 worldqueryfix', '40 fish', '50 contextplus'];
const KETTE_ALT = ['100 formulierungen', '200 langzeit', '210 rechnungen', '210 stundenplan', '212 foto-person', '215 termin-erinnern', '216 geburtstag-ganztag', '230 ki-mitdenken', '400 sprueche', '500 charakter'];
const FUENF = ['contextplus.js', 'fish.js', 'worldqueryfix.js', 'gedaechtnis.js', 'name.js'];
const permutiere = neu => l => { const plaetze = FUENF.map(f => l.indexOf(f)).sort((a, b) => a - b); neu.forEach((f, i) => { l[plaetze[i]] = f; }); return l; };
function mitFehlerLog() { const log = []; return { log, nachSkript: (f, sb) => { try { sb.console.error = function () { log.push(Array.prototype.slice.call(arguments).map(a => String(a && a.message || a)).join(' ')); }; } catch (e) { } } }; }

/* ---------- B2: handleLocalCommand ---------- */
const LOKAL_EINGABEN = [
    'Mail Push einrichten',                      // mailpush.js (Außen-Wrapper)
    'Wo ist aktuell Krieg auf der Welt?',        // worldqueryfix.js (liefert false -> KI)
    'Zwinker mal',                               // Inline-Skript (Mimik)
    'Wie spät ist es in Istanbul?',              // Basis localcommands.js
    'Wo ist der nächste Penny?',                 // ortsuche.js
    'Gibt es eine Tankstelle in der Nähe?',      // ortsuche.js
    'Karte schließen',
    'Zeig mir die Ferien',
    'Jarvis fahr zum Neu Galina Ring',           // festnamen.js
    'Was steht heute an?',
    'Wie wird morgen das Wetter?',
    'Langzeit Gedächtnis öffnen',
    'Das war Quatsch',
    'Rezept merken'
];
async function messeLokal(w) {
    const r = [], sb = w.sb, gesagt = [], alt = { speak: sb.speak, speakAck: sb.speakAck };
    sb.speak = function (t, f) { gesagt.push(String(t)); };       // Sprache wird nur aufgezeichnet (die Kette selbst misst tests/sprache.js)
    sb.speakAck = function (t, f) { gesagt.push('[Ack] ' + String(t)); };
    for (const t of LOKAL_EINGABEN) {
        gesagt.length = 0;
        const x = await w.satz(t);
        r.push(t + ' => lokal=' + x.lokal + ' | ' + kurz(x.modul || '-', 60) + ' | gesagt=' + kurz(JS(gesagt.slice()), 110));
    }
    sb.speak = alt.speak; sb.speakAck = alt.speakAck;
    return r;
}

/* ---------- B3: sendToGroqSmart ---------- */
async function messeGroq(w) {
    const sb = w.sb, r = [], aufruf = [];
    const kern = sb.sendToGroqSmartCore;
    sb.sendToGroqSmartCore = async function (t, o) { aufruf.push(String(t)); return 'KERN'; };
    const ebenen = []; let f = sb.sendToGroqSmart; ebenen.push(Object.keys(f).join(',') || '(keine Marke)');
    for (const t of ['Fahr zum Neu Galina Ring', 'Hallo Jarvis', 'Sag Schröter Bescheid']) {
        aufruf.length = 0;
        const v = sb.sendToGroqSmart(t);
        const rueck = await v;
        r.push(t + ' => Kern bekommt: ' + JS(aufruf) + ' | Rückgabe ' + (v && typeof v.then === 'function' ? 'Promise' : typeof v) + '→' + JS(rueck));
    }
    r.push('Marken der äußersten Hülle: ' + ebenen[0]);
    r.push('async: ' + (Object.prototype.toString.call(sb.sendToGroqSmart) + '|' + (sb.sendToGroqSmart.constructor && sb.sendToGroqSmart.constructor.name)));
    sb.sendToGroqSmartCore = kern;
    return r;
}

/* ---------- B4: searchSemanticMemory ---------- */
async function messeSemantik(w) {
    const sb = w.sb, r = [], bodies = [];
    const alt = sb.apiFetch;
    sb.apiFetch = async function (u, o) { bodies.push(String(u) + ' ' + String((o && o.body) || '')); return { ok: true, json: async () => ({ treffer: [], eintraege: [] }) }; };
    for (const t of ['Wann war ich schwimmen?', 'ab']) {
        bodies.length = 0;
        let ergebnis; try { ergebnis = await sb.searchSemanticMemory(t); } catch (e) { ergebnis = 'WIRFT ' + e.message; }
        r.push(JS(t) + ' => Anfragen ' + JS(bodies) + ' | Ergebnis ' + JS(ergebnis));
    }
    sb.apiFetch = alt;
    r.push('jvFristHinweis("Okay.", "hallo") => ' + JS((() => { try { return sb.jvFristHinweis('Okay.', 'hallo'); } catch (e) { return 'WIRFT ' + e.message; } })()));
    return r;
}

/* ---------- B5: Fenster (openPanel/closePanel/isPanelOpen/refreshOpenPanel) ---------- */
function messePanels(w) {
    const sb = w.sb, r = [], rec = [];
    const alt = {};
    for (const n of ['closeWeatherMap', 'closeFerienkalender', 'closeUeberblick']) { alt[n] = sb[n]; sb[n] = function () { rec.push(n); }; }
    const lauf = (name, fn) => { rec.length = 0; let rv; try { rv = fn(); } catch (e) { rv = 'WIRFT ' + String(e.message).slice(0, 40); } r.push(name + ' => ' + JS(rv === undefined ? null : rv) + ' | Schließer ' + JS(rec)); };
    lauf('openPanel("einstellungen")', () => sb.openPanel('einstellungen'));
    lauf('openPanel("dashboard")', () => sb.openPanel('dashboard'));
    lauf('openPanel("gibtesnicht")', () => sb.openPanel('gibtesnicht'));
    lauf('closePanel()', () => sb.closePanel());
    lauf('isPanelOpen()', () => sb.isPanelOpen());
    lauf('refreshOpenPanel()', () => sb.refreshOpenPanel());
    for (const n of Object.keys(alt)) sb[n] = alt[n];
    return r;
}

/* ---------- B6: vorübergehende Ersetzungen (temporäre Swaps) ---------- */
async function messeSwaps(w) {
    const sb = w.sb, r = [];
    const vorCards = sb.showActionCards, vorSay = sb.photoSay;
    try { w.setze('lastPhoto', { dataUrl: 'data:image/jpeg;base64,AAAA', name: 'x.jpg' }); } catch (e) { }
    let rv, err = '';
    try { rv = sb.photoAskWhatToDo(); } catch (e) { err = e.message; }
    await w.vorspulen(500);
    r.push('photoAskWhatToDo (normal): Rückgabe ' + typeof rv + ', Fehler "' + err + '", showActionCards wieder gleich=' + (sb.showActionCards === vorCards) + ', photoSay wieder gleich=' + (sb.photoSay === vorSay));
    const wirft = function () { throw new Error('Karten kaputt'); };
    sb.showActionCards = wirft;
    err = ''; try { sb.photoAskWhatToDo(); } catch (e) { err = e.message; }
    r.push('photoAskWhatToDo (Karten werfen): Fehler "' + err + '", showActionCards wieder die geworfene Attrappe=' + (sb.showActionCards === wirft));
    sb.showActionCards = vorCards;
    return r;
}

/* ---------- Alles messen ---------- */
async function messeAlles(w) {
    return {
        prompt: messePrompt(w),
        lokal: await messeLokal(w),
        groq: await messeGroq(w),
        semantik: await messeSemantik(w),
        panels: messePanels(w),
        swaps: await messeSwaps(w)
    };
}
const POLL_DATEIEN = ['adresse_speichern.js', 'alleinstellung.js', 'anleitung.js', 'einfuehrung.js', 'ergebnisse.js', 'mitnehmen.js', 'laune.js', 'contextplus.js', 'ki_mitdenken.js', 'synapsen.js', 'native_speech.js'];
function zeitgeberLaden(w) {
    const r = {};
    for (const [art, ms, datei] of lade(w)) if (POLL_DATEIEN.indexOf(datei) >= 0) (r[datei] = r[datei] || []).push(art + ms);
    return r;
}

const tausche = (a, b) => l => { const x = l.indexOf(a), y = l.indexOf(b); if (x < 0 || y < 0) return l; l[x] = b; l[y] = a; return l; };
function vergleicheListe(a, b) { const m = Math.max(a.length, b.length); const d = []; for (let i = 0; i < m; i++) if (a[i] !== b[i]) d.push(i); return d; }
function erstesDiff(ist, soll) {   // kurze Beschreibung des ersten Unterschieds zwischen zwei Messungen
    const bereiche = Object.keys(ist);
    const aus = [];
    for (const b of bereiche) {
        const x = JS(ist[b]), y = JS(soll[b]);
        if (x === y) continue;
        if (Array.isArray(ist[b])) { const d = vergleicheListe(ist[b], soll[b] || []); aus.push(b + ': ' + kurz(String((soll[b] || [])[d[0]]), 70) + '  =>  ' + kurz(String(ist[b][d[0]]), 70)); }
        else { const ks = Object.keys(ist[b]).filter(k => JS(ist[b][k]) !== JS((soll[b] || {})[k])); aus.push(b + ': ' + ks.join('+')); }
    }
    return aus.length ? 'verändert in ' + aus.join(' | ') : 'identisch';
}

(async () => {
    const soll = fs.existsSync(SOLL_DATEI) ? JSON.parse(fs.readFileSync(SOLL_DATEI, 'utf8')) : {};
    const ist = {};

    /* Basis: Browser-Start, Spät-Variante (der 0-ms-Zeitgeber aus contextplus.js läuft erst nach allen Skripten, wie in jeder Testumgebung) */
    const basis = await baue();
    check('Start ohne Ladefehler', basis.ladefehler.length === 0, JS(basis.ladefehler));
    ist.ladeprotokoll = basis.proto;
    const m = await messeAlles(basis);
    ist.messung = m;

    /* Früher Moment: die KI-Anweisung gleich nach dem Laden von name.js, noch vor DOMContentLoaded/load/Zeitgebern. Das ist die Früh-Variante des echten Browsers (echtes Chromium gemessen:
       Kontext+-Block 1x). Seit Phase 5B gibt es keinen Zeitgeber mehr, der etwas nachhängt; früher Moment und Endstand müssen deshalb identisch sein. */
    let fruehMoment = null;
    await baue({ nachSkript: (f, sb) => { if (f === 'name.js') fruehMoment = messePrompt({ sb }); } });
    ist.promptFrueh = fruehMoment;
    ist.promptZustaende = messeZustaende(basis);

    /* Zeitgeber beim Laden (Wartekonstruktionen) */
    ist.zeitgeber = zeitgeberLaden(basis);

    /* Gegenprobe Warten: ohne commands.js müssen die sechs "warte auf jvCommands"-Dateien tatsächlich wiederholen (500 ms) */
    const ohneCmd = await baue({ ohneSkripte: ['commands.js'] });
    const zc = zeitgeberLaden(ohneCmd);
    ist.zeitgeberOhneCommands = Object.keys(zc).filter(d => zc[d].some(x => x === 't500')).sort();

    /* Paar-Vertauschungen innerhalb der Plätze der beteiligten Dateien */
    const GRUPPEN = {
        prompt: ['contextplus.js', 'fish.js', 'worldqueryfix.js', 'gedaechtnis.js', 'name.js'],
        lokal: ['mailpush.js', 'worldqueryfix.js', 'ortsuche.js'],
        fenster: ['weathermap.js', 'ferien.js', 'tagesueberblick.js', 'karte_zu.js']
    };
    ist.matrix = {};
    const kernMessung = async (g, w) => {
        if (g === 'prompt') return { prompt: messePrompt(w) };
        if (g === 'lokal') return { lokal: await messeLokal(w) };
        return { panels: messePanels(w) };
    };
    for (const g of Object.keys(GRUPPEN)) {
        const bas = await kernMessung(g, basis);
        const L = GRUPPEN[g];
        for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
            const w = await baue({ skriptReihenfolge: tausche(L[i], L[j]) });
            ist.matrix[g + ': ' + L[i] + ' <-> ' + L[j]] = erstesDiff(await kernMessung(g, w), bas) + (w.ladefehler.length ? ' [Ladefehler: ' + w.ladefehler.length + ']' : '');
        }
    }

    /* Sonderproben (Ist-Zustand, kein Soll-Wunsch): Was passiert, wenn eine Datei NACH ihrer Basis statt davor lädt? Zeigt echte Ladereihenfolge-Abhängigkeiten (Klasse A) */
    const nach = (f, ziel) => l => { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); const j = l.indexOf(ziel); l.splice(j + 1, 0, f); return l; };
    {
        const bas = { semantik: basis ? ist.messung.semantik : [], groq: ist.messung.groq };
        const w1 = await baue({ skriptReihenfolge: nach('langzeit.js', 'assistant.js') });
        ist.matrix['sonder: langzeit.js NACH assistant.js (searchSemanticMemory)'] = erstesDiff({ semantik: await messeSemantik(w1) }, { semantik: bas.semantik }) + (w1.ladefehler.length ? ' [Ladefehler: ' + w1.ladefehler.length + ']' : '');
        const w2 = await baue({ skriptReihenfolge: l => nach('hoerkorrektur.js', 'assistant.js')(nach('festnamen.js', 'assistant.js')(l)) });
        ist.matrix['sonder: festnamen.js + hoerkorrektur.js NACH assistant.js (sendToGroqSmart)'] = erstesDiff({ groq: await messeGroq(w2) }, { groq: bas.groq }) + (w2.ladefehler.length ? ' [Ladefehler: ' + w2.ladefehler.length + ']' : '');
        const w3 = await baue({ skriptReihenfolge: tausche('synapsen.js', 'weathermap.js') });
        ist.matrix['sonder: synapsen.js <-> weathermap.js (sendToGroqSmart: DCL- gegen load-Hülle)'] = erstesDiff({ groq: await messeGroq(w3) }, { groq: bas.groq }) + ' | Protokoll ' + (JS(w3.proto.DCL.concat(w3.proto.load)) === JS(ist.ladeprotokoll.DCL.concat(ist.ladeprotokoll.load)) ? 'gleich' : 'anders');
    }

    /* Vergleich mit dem Soll */
    if (SCHREIBEN) {
        fs.writeFileSync(SOLL_DATEI, JSON.stringify({ ladeprotokoll: ist.ladeprotokoll, messung: ist.messung, promptFrueh: ist.promptFrueh, zeitgeber: ist.zeitgeber, zeitgeberOhneCommands: ist.zeitgeberOhneCommands, matrix: ist.matrix, promptZustaende: ist.promptZustaende }, null, 1) + '\n');
        console.log('Soll-Zustand geschrieben: ' + SOLL_DATEI);
        process.exit(0);
    }
    for (const ph of ['laden', 'DCL', 'load', 'zeit']) check('A. Ersetzungsprotokoll "' + ph + '" wie eingefroren (' + (soll.ladeprotokoll[ph] || []).length + ' Ersetzungen)', JS(ist.ladeprotokoll[ph]) === JS(soll.ladeprotokoll[ph]), kurz(JS(ist.ladeprotokoll[ph].filter(x => (soll.ladeprotokoll[ph] || []).indexOf(x) < 0)), 200));
    check('B1. buildSystemPrompt (Spät-Variante) wie eingefroren', JS(ist.messung.prompt) === JS(soll.messung.prompt), erstesDiff({ p: [JS(ist.messung.prompt)] }, { p: [JS(soll.messung.prompt)] }).slice(0, 60));
    check('B1. buildSystemPrompt (Früh-Variante, wie im echten Browser) wie eingefroren', JS(ist.promptFrueh) === JS(soll.promptFrueh));
    check('B1. buildSystemPrompt: Einstellungen (Lachwunsch, Lachen aus) wie eingefroren', JS(ist.promptZustaende) === JS(soll.promptZustaende));
    check('B1. buildSystemPrompt: früher Moment (nach name.js) und Endstand (nach allen Zeitgebern) sind identisch', JS(ist.promptFrueh) === JS(ist.messung.prompt));
    check('B2. handleLocalCommand: ' + LOKAL_EINGABEN.length + ' Eingaben wie eingefroren', JS(ist.messung.lokal) === JS(soll.messung.lokal), ist.messung.lokal.find((x, i) => x !== soll.messung.lokal[i]));
    check('B3. sendToGroqSmart wie eingefroren', JS(ist.messung.groq) === JS(soll.messung.groq), ist.messung.groq.find((x, i) => x !== soll.messung.groq[i]));
    check('B4. searchSemanticMemory / jvFristHinweis wie eingefroren', JS(ist.messung.semantik) === JS(soll.messung.semantik), ist.messung.semantik.find((x, i) => x !== soll.messung.semantik[i]));
    check('B5. openPanel/closePanel/isPanelOpen/refreshOpenPanel wie eingefroren', JS(ist.messung.panels) === JS(soll.messung.panels), ist.messung.panels.find((x, i) => x !== soll.messung.panels[i]));
    check('B6. vorübergehende Ersetzungen (photoSay, showActionCards) werden wiederhergestellt, auch bei Ausnahme', JS(ist.messung.swaps) === JS(soll.messung.swaps), ist.messung.swaps.find((x, i) => x !== soll.messung.swaps[i]));
    check('C. Zeitgeber der Wartekonstruktionen beim Laden wie eingefroren', JS(ist.zeitgeber) === JS(soll.zeitgeber), JS(ist.zeitgeber));
    check('C. Gegenprobe: ohne commands.js warten die "warte auf jvCommands"-Dateien wirklich (500 ms)', JS(ist.zeitgeberOhneCommands) === JS(soll.zeitgeberOhneCommands), JS(ist.zeitgeberOhneCommands));
    for (const k of Object.keys(ist.matrix)) check('D. Vertauschung ' + k + ' wie eingefroren', ist.matrix[k] === soll.matrix[k], 'soll ' + soll.matrix[k] + ' | ist ' + ist.matrix[k]);
    for (const k of Object.keys(soll)) check('Soll-Schlüssel ' + k + ' wird noch gemessen', k in ist);

    /* Sachaussagen über den Ist-Zustand (aus den eingefrorenen Werten abgeleitet, damit Befunde nicht still verschwinden) */
    const lp = ist.ladeprotokoll;
    const folge = key => [].concat(lp.laden, lp.DCL, lp.load, lp.zeit).filter(x => x.endsWith(' -> ' + key)).map(x => x.split(' -> ')[0]);
    check('Befund buildSystemPrompt (5B): nur noch EINE Ersetzung beim Laden (commands.js = jvChain-Verteiler), keine direkten Hüllen, kein Nachhängen per Zeitgeber', JS(folge('buildSystemPrompt')) === JS(['commands.js']), JS(folge('buildSystemPrompt')));
    check('Befund buildSystemPrompt (5B): Kontext+-Block in früher und später Messung genau einmal', ist.messung.prompt.e0.kontextPlus === 1 && ist.promptFrueh.e0.kontextPlus === 1, ist.messung.prompt.e0.kontextPlus + '/' + ist.promptFrueh.e0.kontextPlus);
    check('Befund handleLocalCommand: genau diese Ersetzer in dieser Reihenfolge (innen -> außen)', JS(folge('handleLocalCommand')) === JS(['commands.js', 'mailpush.js', 'worldqueryfix.js', 'index.html(inline)', 'ortsuche.js']), JS(folge('handleLocalCommand')));
    check('Befund sendToGroqSmart: nach dem Start nur synapsen.js (DCL) und weathermap.js (load) als Hüllen; festnamen.js/hoerkorrektur.js greifen nie (assistant.js lädt später)', JS(folge('sendToGroqSmart')) === JS(['DOMContentLoaded', 'load']), JS(folge('sendToGroqSmart')));
    check('Befund searchSemanticMemory (5D.1): genau EINE Fassung (assistant.js, topK 5, bei normaler Frage keine Gesamtliste); langzeit.js ersetzt sie nicht mehr, beim Laden ersetzt nur ki_mitdenken.js (load) eine Hülle darum', /topK\\":5/.test(ist.messung.semantik[0]) && ist.messung.semantik[0].indexOf('listall') < 0 && JS(folge('searchSemanticMemory')) === JS(['load']), ist.messung.semantik[0] + ' / ' + JS(folge('searchSemanticMemory')));

    check('Befund sendToGroqSmart: der Kern bekommt den Text UNVERÄNDERT (die Namens- und Hör-Korrektur in festnamen.js/hoerkorrektur.js wirkt auf diesem Weg nicht)', ist.messung.groq[0].indexOf('Kern bekommt: ["Fahr zum Neu Galina Ring"]') >= 0 && ist.messung.groq[2].indexOf('Kern bekommt: ["Sag Schröter Bescheid"]') >= 0, ist.messung.groq[0]);

    /* Gegenproben: veränderte Quelle / veränderter Umfang muss abweichen */
    {
        const w = await baue({ quelleAendern: (f, q) => f === 'worldqueryfix.js' ? q.replace('if(isGlobalInfoQuestion(text)) return false;', '') : q });
        const lm = await messeLokal(w);
        check('Gegenprobe: ohne die Abfrage in worldqueryfix.js ändert sich handleLocalCommand', JS(lm) !== JS(ist.messung.lokal));
        const w2 = await baue({ quelleAendern: (f, q) => f === 'name.js' ? q.replace('return typeof r === \'string\' ? ersetze(r) : r;', 'return r;') : q });
        check('Gegenprobe: ohne die Umbenennung in name.js ändert sich buildSystemPrompt', JS(messePrompt(w2)) !== JS(ist.messung.prompt));
        const w3 = await baue({ ohneSkripte: ['weathermap.js'] });
        check('Gegenprobe: ohne weathermap.js ändert sich das Ersetzungsprotokoll', JS(w3.proto) !== JS(ist.ladeprotokoll));
    }


    /* ---------- E. Phase 5B: buildSystemPrompt hat nur noch EINE Erweiterungsarchitektur (jvChain) ---------- */
    {
        const bas = kette(basis);
        check('E1. jvChain: Reihenfolge außen -> innen = die fünf neuen Einträge (Rang 10..50) vor den zehn bisherigen (100..500)', JS(bas.liste) === JS(KETTE_NEU.concat(KETTE_ALT)), JS(bas.liste));
        check('E1. jvChain: die zehn bisherigen Einträge sind unverändert (Namen, Ränge, Reihenfolge)', JS(bas.liste.slice(5)) === JS(KETTE_ALT));
        check('E1. buildSystemPrompt ist der jvChain-Verteiler ohne eigene Merkmale (nur die Verteiler-Marke _jvChain, keine alten Schutzmarken _contextPlus/_fishLach/_globalInfo65/_gedaechtnis)', bas.dispatcher && JS(bas.schluessel) === JS(['_jvChain']), JS(bas.schluessel));
        check('E1. kein Rang der fünf kollidiert mit einem bisherigen Eintrag', new Set(bas.liste.map(x => x.split(' ')[0])).size === bas.liste.map(x => x.split(' ')[0]).filter((v, i, a) => a.indexOf(v) === i).length && KETTE_NEU.every(x => KETTE_ALT.every(y => x.split(' ')[0] !== y.split(' ')[0])));
        check('E1. contextplus.js legt keinen Zeitgeber mehr an (nichts mehr nur zum Einhängen)', !('contextplus.js' in ist.zeitgeber), JS(ist.zeitgeber));

        /* Blöcke: jeder in erwarteter Anzahl und in erwarteter Reihenfolge (innen zuerst angehängt: contextplus, fish, worldqueryfix, gedaechtnis) */
        PROMPT_EINGABEN.forEach((t, i) => {
            const p = basis.sb.buildSystemPrompt(t, {}, '2026-10-29T08:00:00+01:00'), c = zaehle(p), ix = k => p.indexOf(BLOECKE[k]);
            const soll5 = { kontextplus: 1, fish: 1, worldqueryfix: i === 4 ? 1 : 0, gedaechtnisFrage: i === 1 ? 1 : 0, gedaechtnisGehirn: 1, lachwunsch: 0, zane: 0 };
            check('E2. Eingabe ' + i + ': jeder Block genau in erwarteter Anzahl, keine Doppelblöcke, keine "Zane"-Reste', JS(c) === JS(soll5), JS(c));
            const reihe = ['kontextplus', 'fish', 'worldqueryfix', 'gedaechtnisFrage', 'gedaechtnisGehirn'].filter(k => ix(k) >= 0).map(ix);
            check('E2. Eingabe ' + i + ': Blöcke in der Reihenfolge contextplus < fish < worldqueryfix < gedaechtnis', reihe.every((v, j) => j === 0 || reihe[j - 1] < v), JS(reihe));
        });
        const z = ist.promptZustaende;
        check('E2. Lachwunsch: Lach-Block genau einmal; "Lachen aus": Fish-Block fehlt, Rest bleibt', z.lachen.every(x => x.bloecke.lachwunsch === 1 && x.bloecke.fish === 1) && z.aus.every(x => x.bloecke.fish === 0 && x.bloecke.lachwunsch === 0 && x.bloecke.kontextplus === 1 && x.bloecke.gedaechtnisGehirn === 1), JS(z.aus.map(x => x.bloecke)));

        /* Fehlerpfade: Ein Eintrag, der wirft, darf die KI-Anweisung nicht verhindern (jvChain fängt pro Eintrag; früher flog die Ausnahme durch buildSystemPrompt) */
        {
            const f1 = mitFehlerLog();
            const w = await baue({ nachSkript: f1.nachSkript, quelleAendern: (f, q) => f === 'contextplus.js' ? q.replace('function extraRules(text){', "function extraRules(text){ throw new Error('kaputt');") : q });
            let p = '', err = ''; try { p = w.sb.buildSystemPrompt(PROMPT_EINGABEN[0], {}, '2026-10-29T08:00:00+01:00'); } catch (e) { err = e.message; }
            const c = zaehle(p);
            check('E3. Fehlerpfad contextplus: kein Abbruch, nur der Kontext+-Block fehlt, die übrigen Blöcke bleiben, der Fehler wird gemeldet', err === '' && c.kontextplus === 0 && c.fish === 1 && c.gedaechtnisGehirn === 1 && f1.log.some(x => x.indexOf('contextplus') >= 0), err + ' ' + JS(c) + ' ' + JS(f1.log));
            const f2 = mitFehlerLog();
            const w2 = await baue({ nachSkript: f2.nachSkript, quelleAendern: (f, q) => f === 'name.js' ? q.replace("return typeof r === 'string' ? ersetze(r) : r;", "throw new Error('kaputt');") : q });
            let p2 = '', err2 = ''; try { p2 = w2.sb.buildSystemPrompt(PROMPT_EINGABEN[0], {}, '2026-10-29T08:00:00+01:00'); } catch (e) { err2 = e.message; }
            check('E3. Fehlerpfad name: kein Abbruch, der fertige Text kommt unverändert zurück (ohne Umbenennung), der Fehler wird gemeldet', err2 === '' && p2.length > 1000 && zaehle(p2).kontextplus === 1 && f2.log.some(x => x.indexOf('name') >= 0), err2 + ' ' + f2.log.join(';'));
        }

        /* Reihenfolge-Unabhängigkeit: alle 10 Paare (oben in der Matrix), Umkehrung, gemischte Reihenfolgen. Die fünf tauschen nur ihre Plätze untereinander (alle liegen nach commands.js und prompt.js) */
        const paare = Object.keys(ist.matrix).filter(k => k.indexOf('prompt: ') === 0);
        check('E4. alle 10 Paarvertauschungen der fünf Dateien: identische KI-Anweisung', paare.length === 10 && paare.every(k => ist.matrix[k] === 'identisch'), paare.filter(k => ist.matrix[k] !== 'identisch').join(' | '));
        const reihen = {
            'umgekehrt': FUENF.slice().reverse(),
            'gemischt 1': ['gedaechtnis.js', 'name.js', 'contextplus.js', 'worldqueryfix.js', 'fish.js'],
            'gemischt 2': ['worldqueryfix.js', 'contextplus.js', 'name.js', 'fish.js', 'gedaechtnis.js'],
            'gemischt 3': ['name.js', 'fish.js', 'gedaechtnis.js', 'contextplus.js', 'worldqueryfix.js'],
            'gemischt 4': ['fish.js', 'gedaechtnis.js', 'worldqueryfix.js', 'name.js', 'contextplus.js']
        };
        for (const n of Object.keys(reihen)) {
            const w = await baue({ skriptReihenfolge: permutiere(reihen[n]) });
            check('E4. Reihenfolge "' + n + '" (' + reihen[n].map(x => x.replace('.js', '')).join(' > ') + '): identische KI-Anweisung, gleiche Kette, keine Ladefehler', JS(messePrompt(w)) === JS(ist.messung.prompt) && JS(kette(w)) === JS(bas) && w.ladefehler.length === 0, kurz(JS(w.ladefehler), 120));
        }

        /* Gegenproben A-H (nur veränderter Quelltext oder Ladeumfang im Test, keine Datei im Repo wird angefasst) */
        const mess = async opt => { const w = await baue(opt); let p; try { p = messePrompt(w); } catch (e) { p = 'FEHLER'; } return { w, p, k: kette(w) }; };
        const gleich = r => JS(r.p) === JS(ist.messung.prompt) && JS(r.k) === JS(bas);
        for (const d of FUENF) {
            const n = d.replace('.js', '');
            const r = await mess({ quelleAendern: (f, q) => f === d ? q.split("window.jvChain.use('buildSystemPrompt'").join("(function(){})('buildSystemPrompt'") .split("window.jvChain.use('buildSystemPrompt',").join("(function(){})('buildSystemPrompt',") : q });
            check('Gegenprobe A (' + n + '): Registrierung entfernt -> Kette und/oder KI-Anweisung weichen ab (Sicherheitsnetz rot)', !gleich(r) && r.k.liste.length === 14, r.k.liste.length + ' Einträge');
        }
        {   // B: zwei Ränge vertauschen
            const r = await mess({ quelleAendern: (f, q) => f === 'contextplus.js' ? q.replace(/\},50\);/, '},15);') : f === 'gedaechtnis.js' ? q.replace(/\}, 20\);/, '}, 55);') : q });
            check('Gegenprobe B: zwei Ränge vertauscht -> Reihenfolge-Prüfung (Kette) und KI-Anweisung weichen ab', JS(r.k.liste) !== JS(bas.liste) && JS(r.p) !== JS(ist.messung.prompt), JS(r.k.liste.slice(0, 5)));
        }
        {   // C: Blocktext ändern
            const r = await mess({ quelleAendern: (f, q) => f === 'contextplus.js' ? q.replace('GESPRÄCHSKONTEXT UND FOLGEFRAGEN', 'GESPRÄCHSKONTEXT GEÄNDERT') : q });
            check('Gegenprobe C: Blocktext geändert -> Golden Master rot', JS(r.p) !== JS(ist.messung.prompt) && JS(r.p) !== JS(soll.messung.prompt));
        }
        {   // D: Registrierung doppelt ausführen (Datei zweimal laden / zweimal in die Kette)
            const r = await mess({ skriptReihenfolge: l => { const i = l.indexOf('contextplus.js'); l.splice(i + 1, 0, 'contextplus.js'); const j = l.indexOf('fish.js'); l.splice(j + 1, 0, 'fish.js'); const k = l.indexOf('name.js'); l.splice(k + 1, 0, 'name.js'); return l; } });
            check('Gegenprobe D: dieselbe Registrierung doppelt ausgeführt -> kein Doppelblock, identisch (gleicher Name ersetzt den Eintrag)', gleich(r) && r.p.e0.kontextPlus === 1, kurz(JS(r.k.liste), 150));
            const r2 = await mess({ quelleAendern: (f, q) => f === 'contextplus.js' ? q.replace(/\},50\);\s*$/m, "},50);\nif(window.jvChain) window.jvChain.use('buildSystemPrompt','contextplus-zweiter',function(next,args){ return next()+extraRules(args[0]); },51);") : q });
            check('Gegenprobe D2: unter zweitem Namen registriert -> Doppelblock wird vom Sicherheitsnetz erkannt', r2.p.e0.kontextPlus === 2 && !gleich(r2) && r2.k.liste.length === 16, r2.p.e0.kontextPlus + ' / ' + r2.k.liste.length);
        }
        {   // E: umgekehrt, F: gemischt -> siehe E4 oben (positive Proben); hier die Gegenseite: ohne Rang-Schutz würde die Datei-Reihenfolge wirken
            const r = await mess({ skriptReihenfolge: permutiere(reihen['umgekehrt']), quelleAendern: (f, q) => f === 'fish.js' ? q.replace(/\}, 40\);/, '}, 500);') : q });
            check('Gegenprobe E/F: Datei-Reihenfolge ist nur dann egal, wenn die Ränge eindeutig sind (gleicher Rang wie ein bestehender Eintrag wird erkannt)', JS(r.k.liste) !== JS(bas.liste), JS(r.k.liste.slice(0, 6)));
        }
        {   // G: contextplus-Timing künstlich ändern
            const spaet = (name) => "\nsetTimeout(function(){ if(window.jvChain) window.jvChain.use('buildSystemPrompt','" + name + "',function(next,args){ return next()+extraRules(args[0]); },50); },0);\n})();";
            const g1 = await mess({ quelleAendern: (f, q) => f === 'contextplus.js' ? q.replace(/\}\)\(\);\s*$/, spaet('contextplus')) : q });
            check('Gegenprobe G1: verspätete Registrierung unter demselben Namen -> weiterhin genau ein Block (kein Rennen), aber der Zeitgeber wird erkannt', gleich(g1) && 'contextplus.js' in zeitgeberLaden(g1.w), JS(zeitgeberLaden(g1.w)));
            const g2 = await mess({ quelleAendern: (f, q) => f === 'contextplus.js' ? q.replace(/\}\)\(\);\s*$/, spaet('contextplus-spaet')) : q });
            check('Gegenprobe G2: verspätete Registrierung unter anderem Namen -> Doppelblock und Fehl-Reihenfolge werden erkannt', g2.p.e0.kontextPlus === 2 && !gleich(g2) && 'contextplus.js' in zeitgeberLaden(g2.w), g2.p.e0.kontextPlus + '');
        }
        {   // H: alten direkten Wrapper (mit setTimeout(0)) wieder aktivieren
            const alt = "\nfunction install(){ if(typeof window.buildSystemPrompt!=='function' || window.buildSystemPrompt._contextPlus)return; const original=window.buildSystemPrompt; const wrapped=function(text){ return original.apply(this,arguments)+extraRules(text); }; Object.keys(original).forEach(k=>{try{wrapped[k]=original[k]}catch(e){}}); wrapped._contextPlus=true; window.buildSystemPrompt=wrapped; }\ninstall();\nsetTimeout(install,0);\n})();";
            const h = await mess({ quelleAendern: (f, q) => f === 'contextplus.js' ? q.replace(/\}\)\(\);\s*$/, alt) : q });
            check('Gegenprobe H: alter direkter Wrapper wieder aktiv -> Doppelblock, alte Schutzmarke taucht auf, Protokoll/Zeitgeber weichen ab', h.p.e0.kontextPlus === 2 && h.k.schluessel.indexOf('_contextPlus') >= 0 && !gleich(h) && JS(h.w.proto) !== JS(ist.ladeprotokoll) && 'contextplus.js' in zeitgeberLaden(h.w), h.p.e0.kontextPlus + ' / ' + JS(h.k.schluessel));
        }
    }

    console.log('\nGlobale Ersetzungen: ' + ok + ' Prüfungen ok, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
