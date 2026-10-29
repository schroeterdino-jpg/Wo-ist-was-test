/* ============================================================
   GLOBALE ERSETZUNGEN (Phase 5A, nur Sicherheitsnetz). Start: node tests/globale.js        (Soll neu schreiben: node tests/globale.js --schreiben)
   Friert den HEUTIGEN Zustand der noch impliziten globalen Wrapper ein, BEVOR jemand sie umbaut. Ändert kein Produktverhalten und keine Produktdatei.
   Soll-Zustand: tests/globale_soll.json. Beschreibung der Befunde: tests/globale-ist-zustand.md.

   Die App wird wie im Browser geladen (document.readyState 'loading', danach DOMContentLoaded, load, Zeitgeber), alle Skripte in der echten Reihenfolge
   (das Inline-Skript mit den Mimik-Befehlen steht an seiner Stelle). Gemessen wird:
   A. Ersetzungsprotokoll: nach jedem Skript und nach jeder Start-Phase, welche globale Funktion durch eine andere ersetzt wurde (Ladereihenfolge-Landkarte).
   B. Wirkung: buildSystemPrompt (zwei Zeitvarianten des 0-ms-Zeitgebers in contextplus.js), handleLocalCommand (Eingabe -> Ergebnis), sendToGroqSmart (was beim Kern
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

    /* Frühe Variante: Der Browser lässt den 0-ms-Zeitgeber zwischen zwei Skripten laufen (echtes Chromium, gemessen); gleichwertig: contextplus.js hängt sich nur einmal ein */
    const frueh = await baue({ quelleAendern: (f, q) => f === 'contextplus.js' ? q.replace('setTimeout(install,0);', '') : q });
    ist.promptFrueh = messePrompt(frueh);

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
        fs.writeFileSync(SOLL_DATEI, JSON.stringify({ ladeprotokoll: ist.ladeprotokoll, messung: ist.messung, promptFrueh: ist.promptFrueh, zeitgeber: ist.zeitgeber, zeitgeberOhneCommands: ist.zeitgeberOhneCommands, matrix: ist.matrix }, null, 1) + '\n');
        console.log('Soll-Zustand geschrieben: ' + SOLL_DATEI);
        process.exit(0);
    }
    for (const ph of ['laden', 'DCL', 'load', 'zeit']) check('A. Ersetzungsprotokoll "' + ph + '" wie eingefroren (' + (soll.ladeprotokoll[ph] || []).length + ' Ersetzungen)', JS(ist.ladeprotokoll[ph]) === JS(soll.ladeprotokoll[ph]), kurz(JS(ist.ladeprotokoll[ph].filter(x => (soll.ladeprotokoll[ph] || []).indexOf(x) < 0)), 200));
    check('B1. buildSystemPrompt (Spät-Variante) wie eingefroren', JS(ist.messung.prompt) === JS(soll.messung.prompt), erstesDiff({ p: [JS(ist.messung.prompt)] }, { p: [JS(soll.messung.prompt)] }).slice(0, 60));
    check('B1. buildSystemPrompt (Früh-Variante, wie im echten Browser) wie eingefroren', JS(ist.promptFrueh) === JS(soll.promptFrueh));
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
    check('Befund buildSystemPrompt: sechs Hüllen beim Laden (commands.js = jvChain, contextplus, fish, worldqueryfix, gedaechtnis, name), contextplus.js zusätzlich noch einmal nach dem Laden (0-ms-Zeitgeber)', JS(folge('buildSystemPrompt')) === JS(['commands.js', 'contextplus.js', 'fish.js', 'worldqueryfix.js', 'gedaechtnis.js', 'name.js', 't+0.5s']), JS(folge('buildSystemPrompt')));
    check('Befund buildSystemPrompt: in der Spät-Variante steht der Kontext+-Block zweimal, in der Früh-Variante (echter Browser) einmal', ist.messung.prompt.e0.kontextPlus === 2 && ist.promptFrueh.e0.kontextPlus === 1, ist.messung.prompt.e0.kontextPlus + '/' + ist.promptFrueh.e0.kontextPlus);
    check('Befund handleLocalCommand: genau diese Ersetzer in dieser Reihenfolge (innen -> außen)', JS(folge('handleLocalCommand')) === JS(['commands.js', 'mailpush.js', 'worldqueryfix.js', 'index.html(inline)', 'ortsuche.js']), JS(folge('handleLocalCommand')));
    check('Befund sendToGroqSmart: nach dem Start nur synapsen.js (DCL) und weathermap.js (load) als Hüllen; festnamen.js/hoerkorrektur.js greifen nie (assistant.js lädt später)', JS(folge('sendToGroqSmart')) === JS(['DOMContentLoaded', 'load']), JS(folge('sendToGroqSmart')));
    check('Befund searchSemanticMemory: die Ersetzung in langzeit.js geht beim Laden von assistant.js verloren (Funktionsdeklaration überschreibt)', /topK\\*":5/.test(ist.messung.semantik[0]) && ist.messung.semantik[0].indexOf('listall') < 0, ist.messung.semantik[0]);

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

    console.log('\nGlobale Ersetzungen: ' + ok + ' Prüfungen ok, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
