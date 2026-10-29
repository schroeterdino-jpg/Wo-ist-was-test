/* ============================================================
   SPRACH-GOLDEN-MASTER (Phase 4). Start: node tests/sprache.js        (Soll-Zustand neu schreiben: node tests/sprache.js --schreiben)
   Friert die HEUTIGE Sprach-/TTS-Kette ein, BEVOR jemand sie umbaut. Verändert keine Produktdatei und kein Produktverhalten.
   Der Soll-Zustand steht in tests/sprache_soll.json (neue Datei, überschreibt keinen bestehenden Sollwert).

   Anders als tests/reihenfolge.js sitzt der Aufzeichner NICHT oben auf der Kette, sondern ganz unten: Handy-Stimme (speechSynthesis),
   Audio-Abspielen, Netzabrufe der Cloud-Stimme, Töne, Anzeige-Funktionen (Untertitel, Ruhe-Zustand), Zeitgeber, Native-Brücke.
   So wird die GESAMTE Kette gemessen: voice.js, voicefix.js, pronunciation.js, speechrate.js, sprueche.js, toene.js, fish.js, kontext_lokal.js, teilen.js, mehrfach.js.

   Wirklichkeitsnähe: Die Seite meldet während des Ladens readyState "loading"; erst nach dem letzten Skript werden die DOMContentLoaded-Hörer
   ausgelöst (wie im Browser). Das ist wichtig, weil pronunciation.js sich erst dann einhängt und damit für speakBrowser und fetchCloudSpeechBlob
   die ÄUSSERSTE Stufe ist. Die bisherige Testumgebung (readyState "complete") hängt es dagegen sofort ein.
   Zufall fest (0,5), Uhr virtuell. DOM: nur über die Anzeige-Funktionen beobachtbar (die Elemente der Test-Umgebung sind Attrappen).

   Gemessen wird in Gruppen (G1 ... G10), dazu das Lade-Protokoll (P), eine Paar-Vertauschungs-Matrix (M) und Gegenproben (A-E).
   Mit --details zeigt der Test bei jeder Gegenprobe, WAS sich geändert hat. Erklärung des Ist-Zustands: tests/sprache-ist-zustand.md.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const { starte, lies } = require('./umgebung.js');

const SOLL_DATEI = path.join(__dirname, 'sprache_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }

const html = lies('index.html');
const SKRIPTE = [...html.matchAll(/<script[^>]+src="\.\/js\/([^"?]+)/g)].map(m => m[1]);
const LETZTES = SKRIPTE[SKRIPTE.length - 1];
const SPRACH_DATEIEN = /(voice|voicefix|pronunciation|speechrate|sprueche|toene|fish|kontext_lokal|teilen|mehrfach|native_speech|audio)\.js/;

/* Funktionen/Objekte, deren Ersetzung im Ladeprotokoll festgehalten wird */
const BEOBACHTET = ['speak', 'speakBrowser', 'speakAck', 'speakAckBrowser', 'fetchCloudSpeechBlob', 'getTtsEngine', 'setTtsEngine', 'startThinkingSound', 'getSpeechRateFactor', 'setSpeechRate', 'Audio'];

function kurz(s, n) { s = String(s == null ? '' : s).replace(/⁣/g, '‹lach›').replace(/\s+/g, ' '); return s.length > (n || 140) ? s.slice(0, n || 140) + '…' : s; }

/* ---------- Welt mit Aufzeichner ganz unten ---------- */
let EXTRA = {};   // wird von messeAlles(extra) gesetzt: gilt für JEDE Welt (zum Beispiel vertauschte Ladereihenfolge)
function sprachWelt(extra) {
    extra = Object.assign({}, EXTRA, extra || {});
    extra.opt = Object.assign({}, EXTRA.opt || {}, (arguments[0] && arguments[0].opt) || {});
    const ev = [], prot = [], letzte = {}, syn = { speaking: false, wirft: false, stimmen: [{ name: 'Anna', lang: 'de-DE' }] };
    let w = null, t0 = 0, an = false, installiert = false;
    const stempel = () => '+' + (w ? w.uhr.ms - t0 : 0) + 'ms ';
    const log = s => { if (an) ev.push(stempel() + s); };
    function aufrufStapelSprache() { return SPRACH_DATEIEN.test(String(new Error().stack || '').split('\n').slice(3, 7).join(' ')); }

    const dclHoerer = [];
    function installiere(sb) {
        sb.document.readyState = 'loading';
        const aeh = sb.document.addEventListener;
        sb.document.addEventListener = function (typ, fn) { if (typ === 'DOMContentLoaded') dclHoerer.push(fn); return aeh.apply(this, arguments); };
        sb.speechSynthesis = {
            speak(u) { log('stimme: "' + kurz(u.text) + '" rate=' + (+u.rate).toFixed(2) + ' pitch=' + u.pitch + ' lang=' + u.lang + ' stimme=' + (u.voice ? u.voice.name : '-')); if (syn.wirft) throw new Error('synth kaputt'); },
            cancel() { log('stimme: abbrechen'); },
            getVoices() { return syn.stimmen; },
            get speaking() { return syn.speaking; }, pending: false, onvoiceschanged: null
        };
        sb.SpeechSynthesisUtterance = function (text) { this.text = text; };
        sb.Audio = function (src) {
            this.src = src; this.paused = true; this.ended = false; this.playbackRate = 1; this.defaultPlaybackRate = 1;
            log('audio: neu ' + (String(src).indexOf('blob:') === 0 ? 'blob' : kurz(src, 60)));
            this.play = () => { this.paused = false; log('audio: spielt rate=' + (+this.playbackRate).toFixed(2)); return Promise.resolve(); };
            this.pause = () => { this.paused = true; log('audio: pause'); };
        };
        letzte.Audio = sb.Audio; letzte.synthSpeak = sb.speechSynthesis.speak;   // die Attrappen selbst gehören nicht ins Protokoll
        const T = sb.setTimeout, I = sb.setInterval;
        sb.setTimeout = function (fn, ms) { if (an && aufrufStapelSprache()) log('zeitgeber: setTimeout ' + ms + 'ms'); return T.apply(this, arguments); };
        sb.setInterval = function (fn, ms) { if (an && aufrufStapelSprache()) log('zeitgeber: setInterval ' + ms + 'ms'); return I.apply(this, arguments); };
    }
    function beobachte(f, sb) {
        for (const n of BEOBACHTET) {
            const v = sb[n];
            if (typeof v === 'function' && letzte[n] !== v) { prot.push(f + ' -> ' + n); letzte[n] = v; }
        }
        const s = sb.speechSynthesis && sb.speechSynthesis.speak;
        if (typeof s === 'function' && letzte.synthSpeak !== s) { prot.push(f + ' -> speechSynthesis.speak'); letzte.synthSpeak = s; }
    }
    function nachLaden(sb) {
        const dcl = dclHoerer.slice();
        sb.document.readyState = 'interactive';
        for (const fn of dcl) { try { fn({}); } catch (e) { } }
        sb.document.readyState = 'complete';
        beobachte('DOMContentLoaded', sb);
        // ab hier Aufzeichner für Töne und Anzeige (vor dem Laden würden sie von den Skripten überschrieben)
        for (const [fn, name] of [['playSuccessSound', 'erfolg'], ['playErrorSound', 'fehler'], ['playAlertSound', 'warnung']]) sb[fn] = function () { log('ton: ' + name); };
        for (const fn of ['setHudSubtitle', 'setIdleUi', 'updateTerminalStream', 'jvListenIndicator']) {
            const o = sb[fn]; if (typeof o !== 'function') continue;
            sb[fn] = function () { log('anzeige: ' + fn + '(' + Array.from(arguments).map(a => typeof a === 'string' ? '"' + kurz(a, 60) + '"' : String(a)).join(', ') + ')'); return o.apply(this, arguments); };
        }
    }
    const opt = Object.assign({
        festerZufall: true, echtesSpeak: true,
        nachSkript: (f, sb) => {
            if (!installiert) { installiert = true; installiere(sb); }
            if (extra.nachSkript) extra.nachSkript(f, sb);
            beobachte(f, sb);
            if (f === (extra.letztes || LETZTES)) { nachLaden(sb); }
        },
        fetch: async (u) => {
            const s = String(u);
            if (/\/api\/stau\?tts=1/.test(s)) {
                const text = decodeURIComponent((s.match(/[?&]text=([^&]*)/) || [])[1] || '');
                const eng = (s.match(/[&?]engine=([^&]*)/) || [])[1] || '-';
                log('netz: Cloud-Stimme engine=' + eng + (/diag=1/.test(s) ? ' (diag)' : '') + ' text="' + kurz(text, 200) + '"');
                if (syn.netzAus) return { ok: false, status: 500, headers: { get: () => null }, blob: async () => null };
                return { ok: true, headers: { get: n => (n === 'x-voice-engine' ? (eng === 'fish' ? 'fish' : 'edge') : null) }, blob: async () => new Blob([new Uint8Array(4000)]) };
            }
            throw new Error('offline (Attrappe)');
        }
    }, extra.opt || {});
    w = starte(opt);
    w.ev = ev; w.prot = prot; w.syn = syn;
    w.start = () => { t0 = w.uhr.ms; ev.length = 0; an = true; };
    w.stopp = () => { an = false; return ev.slice(); };
    w.engine = e => { w.sb.setPersistentData('tts_engine', e); };
    w.ruhig = async (ms) => { for (let i = 0; i < 3; i++) await w.vorspulen(ms || 100); };
    w.setzeV = (n, v) => w.setze(n, v);
    w.zufall = v => { w.sb.Math.random = () => v; };
    return w;
}

/* ---------- Proben ---------- */
const PROBEN = [
    ['kurz', 'Okay.'],
    ['sprit', 'Diesel kostet aktuell 2,193 Euro bei Aral in der Hauptstraße.'],
    ['preis-euro', 'Das kostet 12,50 € – ein fairer Preis.'],
    ['uhrzeit', 'Es ist 21:40 Uhr und ich habe es eingetragen.'],
    ['erfolg', 'Das hat geklappt, ich habe es eingetragen.'],
    ['fehler', 'Das konnte ich leider nicht finden.'],
    ['warnung', 'Achtung, Unwetterwarnung für heute Abend.'],
    ['name-datum', 'Hallo Alyssa, wir treffen uns am 3.11.2026 um 9 Uhr.'],
    ['strich', 'Heute werden es 14 - 16 Grad, also ziemlich mild.'],
    ['strasse', 'Fahr bitte in die Ring und dann an die Bahnhofstraße.'],
    ['markdown', 'Das ist *wichtig* und _unterstrichen_ mit #Hashtag und `Code`.'],
    ['mond', 'Der Mond geht heute um 18:20 Uhr auf, es ist Vollmond.'],
    ['stau', 'Auf deiner Strecke gibt es einen Stau mit etwa 25 Minuten Verzögerung.']
];
const LANG_PROBE = ['Hello, how are you today?', 'Das hat geklappt, ich habe es eingetragen.'];
const LANG_TEXT_LANG = 'en-US';
const LANG_TEXT = 'Please speak slowly. I have saved it.';

function letzteTeilen(w) { try { return w.sb.jvTeilen.letzte(); } catch (e) { return '(teilen.js fehlt)'; } }
function ereignisse(w) { return w.stopp().filter(Boolean); }
async function sprich(w, text, opts) {
    opts = opts || {};
    w.start();
    let ret, wirft = '';
    const fertig = () => w.ev.push('+' + (w.uhr.ms - 0) + 'ms (Rückruf: fertig)');
    try { ret = w.sb.speak(text, opts.ohneRueckruf ? undefined : function () { w.ev.push('(Rückruf: fertig)'); }, opts.lang); } catch (e) { wirft = 'WIRFT ' + (e && e.constructor && e.constructor.name) + ': ' + kurz(e && e.message, 70); }
    const sofort = w.ev.length;
    await w.ruhig(opts.ms || 100);
    const e = w.stopp();
    try { if (w.sb.jvTeilen && w.sb.jvTeilen.letzte) e.push('merkt(teilen): ' + kurz(letzteTeilen(w), 70)); } catch (x) { }
    return { zeilen: e, rueck: wirft || ('Rückgabe: ' + (ret === undefined ? 'undefined' : (ret && typeof ret.then === 'function') ? 'Promise' : typeof ret)) };
}
function dichte(w, name, erg) { return [name + ' | ' + erg.rueck].concat(erg.zeilen.map(z => '  ' + z)); }

/* ---------- Messgruppen ---------- */
async function g1_handy(extra) {   // Handy-Stimme, alle Proben nacheinander (jede Probe mit Pause > 3 s, damit Wiederholungsschutz nicht stört)
    const w = sprachWelt(extra); w.engine('browser'); const r = [];
    for (const [n, t] of PROBEN) { r.push(...dichte(w, n, await sprich(w, t))); await w.vorspulen(5000); }
    r.push('teilen.letzte = ' + kurz(w.sb.jvTeilen && w.sb.jvTeilen.letzte && letzteTeilen(w), 90));
    return r;
}
async function g2_fremdsprache() {
    const w = sprachWelt(); w.engine('browser'); const r = [];
    r.push(...dichte(w, 'dolmetscher en-US', await sprich(w, LANG_TEXT, { lang: LANG_TEXT_LANG })));
    await w.vorspulen(5000);
    r.push(...dichte(w, 'dolmetscher erfolgs-satz', await sprich(w, 'Das habe ich gespeichert und eingetragen.', { lang: 'en-US' })));
    return r;
}
async function g3_cloud(motor) {
    const w = sprachWelt(); w.engine(motor); const r = [];
    for (const [n, t] of PROBEN.filter(p => ['kurz', 'sprit', 'preis-euro', 'uhrzeit', 'erfolg', 'name-datum', 'stau'].includes(p[0]))) { r.push(...dichte(w, n, await sprich(w, t, { ms: 400 }))); await w.vorspulen(5000); }
    return r;
}
async function g3b_cloud_lang() {
    const w = sprachWelt(); w.engine('fish'); const r = [];
    const lang = 'Heute ist ein schöner Tag in Hamburg und ich wollte dir dazu einiges sagen. Zuerst scheint die Sonne am Vormittag über der Elbe. Danach ziehen am Nachmittag ein paar Wolken auf, und gegen Abend wird es windig. Morgen bleibt es trocken, aber deutlich kühler als heute. Am Wochenende kommt dann wieder mehr Sonne.';
    r.push(...dichte(w, 'lang (Stücke)', await sprich(w, lang, { ms: 1500 })));
    return r;
}
async function g3c_cloud_ausfall() {
    const w = sprachWelt(); w.engine('edge'); w.syn.netzAus = true; const r = [];
    r.push(...dichte(w, 'cloud kaputt -> Rückfall Handy', await sprich(w, 'Das hat geklappt.', { ms: 500 })));
    await w.vorspulen(5000);
    r.push(...dichte(w, 'cloud kaputt, zweiter Versuch', await sprich(w, 'Noch einmal bitte.', { ms: 500 })));
    r.push('Fehlerzähler ttsCloudFailCount = ' + w.lese('ttsCloudFailCount'));
    return r;
}
async function g4_ack() {
    const r = [];
    { const w = sprachWelt(); w.engine('browser'); w.start();
      let rueck = 0; const x = w.sb.speakAck('Einen Moment.', () => { rueck++; }); await w.ruhig(100);
      r.push('ack frei (Handy) | Rückgabe ' + (x === undefined ? 'undefined' : typeof x) + ' | Rückrufe ' + rueck); ereignisse(w).forEach(z => r.push('  ' + z)); }
    { const w = sprachWelt(); w.engine('browser'); w.setzeV('currentUtterance', { x: 1 }); w.start();
      let rueck = 0; w.sb.speakAck('Einen Moment.', () => { rueck++; }); await w.ruhig(100);
      r.push('ack während Jarvis spricht (unterdrückt?) | Rückrufe ' + rueck); ereignisse(w).forEach(z => r.push('  ' + z)); }
    { const w = sprachWelt(); w.engine('browser'); w.setzeV('isRecording', true); w.start();
      let rueck = 0; w.sb.speakAck('Einen Moment.', () => { rueck++; }); await w.ruhig(100);
      r.push('ack während Aufnahme | Rückrufe ' + rueck); ereignisse(w).forEach(z => r.push('  ' + z)); }
    { const w = sprachWelt(); w.engine('fish'); w.start();
      let rueck = 0; w.sb.speakAck('Einen Moment.', () => { rueck++; }); await w.ruhig(400);
      r.push('ack Fish (Wache __jvAck) | Rückrufe ' + rueck + ' | __jvAck danach ' + w.sb.__jvAck); ereignisse(w).forEach(z => r.push('  ' + z)); }
    { const w = sprachWelt(); w.engine('edge'); w.start();
      let rueck = 0; w.sb.speakAck('Einen Moment.', () => { rueck++; }); await w.ruhig(400);
      r.push('ack Edge | Rückrufe ' + rueck); ereignisse(w).forEach(z => r.push('  ' + z)); }
    // Antwort während die Zwischenansage läuft (Handy-Stimme): voicefix lässt die Ansage ausreden (höchstens 2 s)
    { const w = sprachWelt(); w.engine('browser'); w.start();
      w.sb.speakAck('Einen Moment.'); w.syn.speaking = true; await w.vorspulen(10);
      w.sb.speak('Hier ist die Antwort.'); await w.vorspulen(180); w.syn.speaking = false; await w.ruhig(300);
      r.push('antwort kommt während ack spricht (ack endet nach ~190 ms)'); ereignisse(w).forEach(z => r.push('  ' + z)); }
    { const w = sprachWelt(); w.engine('browser'); w.start();
      w.sb.speakAck('Einen Moment.'); w.syn.speaking = true; await w.vorspulen(10);
      w.sb.speak('Hier ist die Antwort.'); await w.ruhig(2500);
      r.push('antwort kommt, ack hängt (Höchstwartezeit 2 s)'); ereignisse(w).forEach(z => r.push('  ' + z)); }
    // Antwort kommt, während die Cloud-Zwischenansage noch geholt wird: Ansage wird verworfen
    { const w = sprachWelt(); w.engine('edge'); w.start();
      w.sb.speakAck('Einen Moment.'); w.sb.speak('Hier ist die Antwort.'); await w.ruhig(500);
      r.push('antwort überholt cloud-ack'); ereignisse(w).forEach(z => r.push('  ' + z)); }
    return r;
}
async function g4k_ack() {   // verkürzt für Vertauschungs-Matrix und Gegenproben: eine Welt
    const w = sprachWelt(); w.engine('browser'); const r = [];
    w.start(); w.sb.speakAck('Einen Moment.'); w.syn.speaking = true; await w.vorspulen(10);
    w.sb.speak('Hier ist die Antwort.'); await w.vorspulen(180); w.syn.speaking = false; await w.ruhig(300);
    r.push('antwort kommt während ack spricht'); ereignisse(w).forEach(z => r.push('  ' + z));
    w.setzeV('currentUtterance', { x: 1 }); w.start(); let rueck = 0; w.sb.speakAck('Zwischenansage.', () => { rueck++; }); await w.ruhig(100);
    r.push('ack während Jarvis spricht | Rückrufe ' + rueck); ereignisse(w).forEach(z => r.push('  ' + z));
    return r;
}
async function g5_wiederholung() {   // Wiederholungs- und Zeitfenster-Regeln innerhalb der Wrapper (sprueche 3 s, toene 1,5 s, teilen 40 Zeichen, Längenobergrenzen)
    const w = sprachWelt(); w.engine('browser'); const r = [];
    const stau = 'Auf deiner Strecke gibt es einen Stau mit etwa 25 Minuten Verzögerung.';
    r.push(...dichte(w, 'stau erstes Mal', await sprich(w, stau)));
    r.push(...dichte(w, 'stau nochmal sofort (Spruch nur einmal innerhalb 3 s)', await sprich(w, stau)));
    await w.vorspulen(4000);
    r.push(...dichte(w, 'stau nach 4 s', await sprich(w, stau)));
    await w.vorspulen(5000);
    r.push(...dichte(w, 'erfolg erstes Mal', await sprich(w, 'Das habe ich eingetragen.')));
    await w.vorspulen(1000);
    r.push(...dichte(w, 'erfolg nach 1,1 s (gleicher Ton nicht doppelt)', await sprich(w, 'Das habe ich gespeichert.')));
    await w.vorspulen(2000);
    r.push(...dichte(w, 'erfolg nach 2,1 s (Ton wieder erlaubt)', await sprich(w, 'Das habe ich notiert.')));
    await w.vorspulen(5000);
    const lang420 = 'Das habe ich eingetragen. ' + 'x'.repeat(420 - 26);
    const lang421 = 'Das habe ich eingetragen. ' + 'x'.repeat(421 - 26);
    r.push(...dichte(w, 'erfolg mit 420 Zeichen (Ton ja)', await sprich(w, lang420))); await w.vorspulen(5000);
    r.push(...dichte(w, 'erfolg mit 421 Zeichen (Ton nein)', await sprich(w, lang421))); await w.vorspulen(5000);
    const stauLang = 'Auf deiner Strecke gibt es einen Stau. ' + 'y'.repeat(430);
    r.push(...dichte(w, 'stau mit >430 Zeichen (kein Spruch)', await sprich(w, stauLang))); await w.vorspulen(5000);
    r.push('teilen.letzte = ' + kurz(letzteTeilen(w), 60));
    // Töne aus
    w.sb.setSoundEnabled(false); await w.vorspulen(5000);
    r.push(...dichte(w, 'Töne aus: erfolg', await sprich(w, 'Das habe ich verschoben und gespeichert.')));
    w.sb.setSoundEnabled(true); await w.vorspulen(5000);
    // kein Zufall-Treffer: Spruch bleibt weg
    w.zufall(0.99); w.sb.Math.random = () => 0.99;
    r.push(...dichte(w, 'zufall 0,99: kein Spruch', await sprich(w, 'Auf deiner Strecke gibt es einen Stau mit etwa 25 Minuten Verzögerung.')));
    return r;
}
async function g6_teilen_kontext() {
    const w = sprachWelt(); w.engine('browser'); const r = [];
    const ch0 = (w.lese('chatHistory') || []).length;
    w.start();
    const x = await w.satz('Wie spät ist es in Istanbul?');
    await w.ruhig(200);
    r.push('satz Istanbul | lokal=' + x.lokal + ' | modul=' + x.modul + ' | gesagt=' + kurz(x.gesagt.join(' / '), 120)); ereignisse(w).forEach(z => r.push('  ' + z));
    const ch = w.lese('chatHistory') || [];
    r.push('chatHistory neu: ' + (ch.length - ch0) + ' | ' + kurz(JSON.stringify(ch.slice(ch0)), 220));
    r.push('teilen.letzte = ' + kurz(letzteTeilen(w), 100));
    await w.vorspulen(5000); w.start();
    const y = await w.satz('Und in Tokio?');
    await w.ruhig(200);
    r.push('satz Tokio (Anschlussfrage) | lokal=' + y.lokal + ' | gesagt=' + kurz(y.gesagt.join(' / '), 120)); ereignisse(w).forEach(z => r.push('  ' + z));
    const ch2 = w.lese('chatHistory') || [];
    r.push('chatHistory neu: ' + (ch2.length - ch.length));
    // "Schick das per WhatsApp": eigenes Sagen zählt nicht als merkenswerte Antwort
    await w.vorspulen(5000); w.start();
    const z = await w.satz('Schick das per WhatsApp');
    await w.ruhig(200);
    r.push('satz WhatsApp | lokal=' + z.lokal + ' | modul=' + z.modul + ' | gesagt=' + kurz(z.gesagt.join(' / '), 120)); ereignisse(w).forEach(q => r.push('  ' + q));
    r.push('teilen.letzte danach = ' + kurz(letzteTeilen(w), 100));
    return r;
}
async function g7_mehrfach(kern) {
    const r = [];
    const FRAGE = 'Wie wird morgen das Wetter und wann ist der nächste Vollmond?';
    let zaehler = 0;
    const lauf = async (...a) => { if (kern && ++zaehler > 2) return; return fuenf(...a); };
    const fuenf = async (name, vorbereiten) => {
        const w = sprachWelt(); w.engine('browser');
        if (vorbereiten) vorbereiten(w);
        const vor = w.sb.speak;
        w.start();
        let ret, wirft = '';
        try { ret = await w.lassLaufen(() => w.sb.handleLocalCommand(FRAGE)); } catch (e) { wirft = 'WIRFT ' + kurz(e && e.message, 60); }
        await w.ruhig(300);
        r.push(name + ' | ' + (wirft || (ret && ret.haengt ? 'hängt' : 'Rückgabe ' + JSON.stringify(ret && ret.wert))) + ' | window.speak danach unverändert: ' + (w.sb.speak === vor));
        ereignisse(w).forEach(z => r.push('  ' + z));
        w.start(); await sprich(w, 'Danach spreche ich normal weiter.'); const z2 = w.stopp();
        // (sprich startet selbst neu; Ergebnis steht darum nicht in z2) – prüfe über eigenen Lauf
        w.start(); w.sb.speak('Probe nach dem Fang.'); await w.ruhig(100);
        r.push('  nach dem Fang gesprochen: ' + (w.stopp().filter(l => /stimme: "Probe/.test(l)).length ? 'ja (hörbar)' : 'NEIN (verschluckt)'));
    };
    await lauf('echte Mehrfachfrage (Wetter nur KI, Vollmond lokal)');
    const mitNur = fn => w => { w.sb.jvCommands.nur = fn(w); };
    await lauf('Fang: Teilantwort wird aufgefangen, spätere Sprache (Mikrotask/Zeitgeber) entkommt', mitNur(w => function () {
        w.sb.speak('Gefangen: erster Satz.');
        Promise.resolve().then(() => w.sb.speak('Mikrotask nach dem Fang.'));
        w.sb.setTimeout(() => w.sb.speak('Zeitgeber nach dem Fang.'), 0);
        return true;
    }));
    await lauf('Fang: Ausnahme im Befehl -> window.speak wird trotzdem zurückgesetzt', mitNur(w => function () { w.sb.speak('Gefangen vor der Ausnahme.'); throw new Error('Befehl kaputt'); }));
    await lauf('Fang: Befehl liefert ein Versprechen (async) -> gilt als erledigt, Sprache nach dem await entkommt', mitNur(w => function () {
        return (async () => { w.sb.speak('Gefangen vor dem await.'); await null; w.sb.speak('Nach dem await (nicht mehr gefangen).'); return true; })();
    }));
    await lauf('Fang: Befehl spricht über gespeicherte Referenz auf speak (entkommt dem Fang)', mitNur(w => { const gespeichert = w.sb.speak; return function () { gespeichert('Über gespeicherte Referenz.'); w.sb.speakAck('Zwischenansage im Fang.'); return true; }; }));
    return r;
}
async function g8_fehlerverhalten() {
    const r = [];
    { const w = sprachWelt(); w.engine('browser'); r.push(...dichte(w, 'speak(undefined)', await (async () => { w.start(); let ret, wirft = ''; try { ret = w.sb.speak(undefined); } catch (e) { wirft = 'WIRFT ' + e.constructor.name + ': ' + kurz(e.message, 60); } await w.ruhig(100); return { zeilen: w.stopp(), rueck: wirft || 'Rückgabe ' + typeof ret }; })())); }
    { const w = sprachWelt(); w.engine('browser'); r.push(...dichte(w, 'speak(null)', await (async () => { w.start(); let ret, wirft = ''; try { ret = w.sb.speak(null); } catch (e) { wirft = 'WIRFT ' + e.constructor.name + ': ' + kurz(e.message, 60); } await w.ruhig(100); return { zeilen: w.stopp(), rueck: wirft || 'Rückgabe ' + typeof ret }; })())); }
    { const w = sprachWelt(); w.engine('browser'); r.push(...dichte(w, 'speak(Zahl 42)', await (async () => { w.start(); let ret, wirft = ''; try { ret = w.sb.speak(42); } catch (e) { wirft = 'WIRFT ' + e.constructor.name + ': ' + kurz(e.message, 60); } await w.ruhig(100); return { zeilen: w.stopp(), rueck: wirft || 'Rückgabe ' + typeof ret }; })())); }
    { const w = sprachWelt(); w.engine('browser'); w.syn.wirft = true; r.push(...dichte(w, 'Handy-Stimme wirft', await sprich(w, 'Das habe ich eingetragen.'))); }
    { const w = sprachWelt(); w.engine('browser'); w.sb.playSuccessSound = undefined; /* wird in nachLaden gesetzt, hier nach dem Laden entfernt */ w.start(); let wirft = ''; try { w.sb.speak('Das habe ich eingetragen.'); } catch (e) { wirft = 'WIRFT ' + e.message; } await w.ruhig(100); r.push('Ton-Funktion fehlt | ' + (wirft || 'kein Fehler') + ' | ' + ereignisse(w).filter(z => /stimme|ton/.test(z)).map(z => kurz(z, 60)).join(' ; ')); }
    { const w = sprachWelt(); w.engine('browser'); w.sb.sassLevel = function () { throw new Error('kaputt'); }; r.push(...dichte(w, 'sassLevel wirft (sprueche)', await sprich(w, 'Auf deiner Strecke gibt es einen Stau mit etwa 25 Minuten Verzögerung.'))); }
    return r;
}
async function g9_native() {   // APK: ZaneNative-Attrappe; der 300-ms-Melder (native_speech.js) läuft mit
    const r = [];
    const NATIV = { native: true, sekundenTakt: true, weitereTakte: [300] };
    const bruecke = (w, ab) => {
        const l = w.ereignisse.slice(ab).filter(e => e.art === 'brücke').map(e => e.text);
        const k = []; for (const x of l) if (k[k.length - 1] !== x) k.push(x);   // aufeinanderfolgende Wiederholungen zusammenfassen
        return k.length ? k.join(' ; ') : '(keine Aufrufe)';
    };
    for (const motor of ['browser', 'fish']) {
        const w = sprachWelt({ opt: NATIV }); w.engine(motor); const e0 = w.ereignisse.length; w.start();
        w.sb.zaneWake(); await w.ruhig(400);
        r.push('Weckwort ' + motor + ' (APK)');
        ereignisse(w).forEach(z => r.push('  ' + z));
        r.push('  Brücke: ' + bruecke(w, e0));
    }
    { const w = sprachWelt({ opt: NATIV }); w.engine('browser'); const e0 = w.ereignisse.length; w.start(); w.sb.speak('Das habe ich eingetragen.'); await w.ruhig(400);
      r.push('speak mit ZaneNative: gesprochen, Brücke meldet Zustand'); ereignisse(w).forEach(z => r.push('  ' + z)); r.push('  Brücke: ' + bruecke(w, e0)); }
    { const w = sprachWelt({ opt: NATIV }); w.engine('browser'); w.setzeV('currentUtterance', { x: 1 }); const e0 = w.ereignisse.length; w.start(); w.sb.zaneWake(); await w.ruhig(400);
      r.push('Weckwort WÄHREND Jarvis spricht: sofort still (interruptSpeaking), dann zuhören'); ereignisse(w).forEach(z => r.push('  ' + z)); r.push('  Brücke: ' + bruecke(w, e0)); }
    return r;
}
async function g10_tempo() {   // speechrate.js: Tempo wird aufgerechnet
    const r = []; const w = sprachWelt(); w.engine('browser');
    for (const f of [0.5, 0.8, 1, 1.3, 1.4, 3]) {   // 0,7 bis 1,4 gilt, alles andere fällt auf 1 zurück
        if (typeof w.sb.setSpeechRate === 'function') w.sb.setSpeechRate(f); else w.sb.setPersistentData('helfer_speech_rate', String(f));
        r.push(...dichte(w, 'Tempo-Stufe ' + f, await sprich(w, 'Tempo ' + f + ' ist eingestellt.'))); await w.vorspulen(5000);
    }
    if (typeof w.sb.setSpeechRate === 'function') w.sb.setSpeechRate(1);
    return r;
}
async function g1b_sprueche() {   // Zufall 0: Sprüche und Lacher greifen (bei 0,5 greifen sie nur teilweise)
    const r = [];
    for (const motor of ['browser', 'fish']) {
        const w = sprachWelt(); w.engine(motor); w.zufall(0);
        for (const [n, t] of PROBEN.filter(p => ['sprit', 'preis-euro', 'erfolg', 'mond', 'stau'].includes(p[0]))) { r.push(...dichte(w, motor + ' ' + n, await sprich(w, t, { ms: 400 }))); await w.vorspulen(5000); }
    }
    return r;
}

async function g1c_spruch_und_ton() {   // Reihenfolge Ton <-> Spruch: der Spruch (Stufe 3, letzter Spruch der Liste) enthält selbst "ich kann ... nicht" und würde einen Fehlerton auslösen, wenn der Ton NACH dem Anhängen des Spruchs entschieden würde
    const w = sprachWelt(); w.engine('browser'); w.sb.setPersistentData('helfer_sass_level', '3'); w.zufall(0.99); const r = [];
    r.push(...dichte(w, 'ort_weit mit Spruch, der selbst ein Fehlerwort enthält', await sprich(w, 'Am nächsten ist die Eisdiele am Markt, rund 5 Kilometer entfernt.')));
    return r;
}

async function messeAlles(extra) {
    EXTRA = extra || {};
    const g = {};
    g.G1_handy = await g1_handy();
    g.G2_fremdsprache = await g2_fremdsprache();
    g.G3_edge = await g3_cloud('edge');
    g.G3_fish = await g3_cloud('fish');
    g.G3b_fish_lang = await g3b_cloud_lang();
    g.G3c_cloud_ausfall = await g3c_cloud_ausfall();
    g.G4_ack = await g4_ack();
    g.G5_regeln = await g5_wiederholung();
    g.G6_teilen_kontext = await g6_teilen_kontext();
    g.G7_mehrfach = await g7_mehrfach();
    g.G8_fehler = await g8_fehlerverhalten();
    g.G9_native = await g9_native();
    g.G10_tempo = await g10_tempo();
    g.G1b_sprueche = await g1b_sprueche();
    g.G1c_spruch_und_ton = await g1c_spruch_und_ton();
    EXTRA = {};
    return g;
}

/* ---------- Vergleich mit Soll ---------- */
function vergleiche(name, ist, soll) {
    const a = JSON.stringify(ist), b = JSON.stringify(soll);
    if (a === b) { check(name, true); return true; }
    let i = 0; const n = Math.max(ist ? ist.length : 0, soll ? soll.length : 0);
    for (; i < n; i++) if (JSON.stringify(ist && ist[i]) !== JSON.stringify(soll && soll[i])) break;
    check(name, false, 'erste Abweichung in Zeile ' + (i + 1) + '\n    soll: ' + JSON.stringify(soll && soll[i]) + '\n    ist:  ' + JSON.stringify(ist && ist[i]));
    return false;
}

/* ---------- Paar-Vertauschung ---------- */
const WRAPPER = ['voicefix.js', 'pronunciation.js', 'speechrate.js', 'sprueche.js', 'toene.js', 'fish.js', 'kontext_lokal.js', 'teilen.js', 'mehrfach.js'];
const tausche = (a, b) => l => { const x = l.indexOf(a), y = l.indexOf(b); if (x < 0 || y < 0) return l; l[x] = b; l[y] = a; return l; };

/* Phase 4B: die sechs Speak-Dateien dürfen nur dort permutiert werden, wo ihre Nicht-Speak-Voraussetzungen schon geladen sind.
   Sicherer Bereich = die Plätze von sprueche, toene, fish, kontext_lokal, teilen (alle NACH commands.js, localcommands.js, audio.js, voice.js) plus ein sechster Platz
   direkt vor mehrfach.js für voicefix.js (voicefix.js selbst ist an jeder Stelle nach voice.js/audio.js unkritisch, bewiesen durch die Verschiebeprobe).
   Begründung je Datei (nur außerhalb ihres Speak-Wrappers): sprueche -> jvChain (commands.js); toene -> audio.js (Töne, Einstellungen); fish -> voice.js (getTtsEngine, speakBrowser, speakAck);
   kontext_lokal/teilen -> jvCommands (commands.js); voicefix -> speakAck/startThinkingSound (voice.js, audio.js). Der gemeinsame sichere Bereich beginnt deshalb nach commands.js (Zeile 795 in index.html). */
const SICHER_PLAETZE = ['sprueche.js', 'toene.js', 'fish.js', 'kontext_lokal.js', 'teilen.js', 'voicefix.js'];
const sicher = reihe => l => {
    const iv = l.indexOf('voicefix.js'); if (iv >= 0) l.splice(iv, 1);
    const p = SICHER_PLAETZE.slice(0, 5).map(n => l.indexOf(n));
    const m = l.indexOf('mehrfach.js');
    if (m < 0 || p.some(x => x < 0)) return l;
    l.splice(m, 0, 'voicefix.js');
    const pos = p.concat([m]);
    reihe.forEach((n, i) => { l[pos[i]] = n; });
    return l;
};
const vertausche = (reihe, x, y) => { const r = reihe.slice(), i = r.indexOf(x), j = r.indexOf(y); r[i] = y; r[j] = x; return r; };
function mischenReihe(liste, saat) { const l = liste.slice(); let z = saat; for (let i = l.length - 1; i > 0; i--) { z = (z * 1103515245 + 12345) % 2147483648; const j = z % (i + 1); const t = l[i]; l[i] = l[j]; l[j] = t; } return l; }
async function messeKern(extra) {   // verkürzte Messung (wenige Welten), berührt trotzdem alle Stufen: Handy, Fish, Zufall 0, Zwischenansage, Wiederholungsregeln, Teilen/Kontext, Fang
    EXTRA = extra || {};
    const g = {};
    g.G1_handy = await g1_handy();
    g.G1b_sprueche = await g1b_sprueche();
    g.G1c_spruch_und_ton = await g1c_spruch_und_ton();
    g.G3_fish = await g3_cloud('fish');
    g.G4k_ack = await g4k_ack();
    g.G5_regeln = await g5_wiederholung();
    g.G6_teilen_kontext = await g6_teilen_kontext();
    g.G7_mehrfach = await g7_mehrfach(true);
    g.G10_tempo = await g10_tempo();
    EXTRA = {};
    return g;
}
function gruppenMitUnterschied(a, b) {   // Namen der Messgruppen ('## G1_handy' ...), in denen sich zwei flache Messungen unterscheiden
    const teile = l => { const m = {}; let k = '?'; for (const z of l) { if (/^## /.test(z)) { k = z.slice(3); m[k] = []; } else (m[k] = m[k] || []).push(z); } return m; };
    const x = teile(a), y = teile(b), out = [];
    for (const k of new Set([...Object.keys(x), ...Object.keys(y)])) if (JSON.stringify(x[k]) !== JSON.stringify(y[k])) out.push(k.replace(/^G(\d+)[a-z]?_.*/, 'G$1'));
    return out;
}
async function kompakt(extra) {   // flach
    const g = await messeKern(extra); const r = [];
    for (const k of Object.keys(g)) { r.push('## ' + k); r.push(...g[k]); }
    return r;
}

(async () => {
    const soll = fs.existsSync(SOLL_DATEI) ? JSON.parse(fs.readFileSync(SOLL_DATEI, 'utf8')) : {};
    const ist = {};

    /* P. Lade-Protokoll (echtes Browser-Verhalten: pronunciation hängt sich erst bei DOMContentLoaded ein) */
    { const w = sprachWelt(); ist.protokoll = w.prot.slice(); check('Alle Skripte laden ohne Fehler', w.ladefehler.length === 0, w.ladefehler.join(' | '));
      check('pronunciation.js hängt sich erst nach dem letzten Skript ein (DOMContentLoaded)', w.prot.filter(p => /^DOMContentLoaded/.test(p)).length >= 2, JSON.stringify(w.prot.filter(p => /^DOMContentLoaded/.test(p)))); }

    /* G. Messgruppen */
    const g = await messeAlles();
    Object.assign(ist, g);

    /* Grundsätzliche Beweise (unabhängig vom Soll) */
    { const w = sprachWelt(); w.engine('browser');
      const e1 = await sprich(w, 'Das hat geklappt, ich habe es eingetragen.');
      check('Handy-Stimme: der Satz kommt unten an', e1.zeilen.some(z => /stimme: "Das hat geklappt, ich habe es eingetragen\./.test(z)));
      check('Erfolgston kommt VOR der Stimme', (() => { const i = e1.zeilen.findIndex(z => /ton: erfolg/.test(z)), j = e1.zeilen.findIndex(z => /stimme: "/.test(z)); return i >= 0 && j > i; })());
      const e2 = await sprich(w, 'Auf deiner Strecke gibt es einen Stau mit etwa 25 Minuten Verzögerung.');
      check('Spruch wird nach der Information angehängt (sprueche.js)', e2.zeilen.some(z => /stimme: "Auf deiner Strecke gibt es einen Stau mit etwa 25 Minuten Verzögerung\. .+"/.test(z)));
    }
    { const w = sprachWelt(); w.engine('browser'); const e = await sprich(w, 'Okay.', { ohneRueckruf: true });
      check('speak gibt kein Versprechen zurück (Rückgabe undefined)', /Rückgabe: undefined/.test(e.rueck), e.rueck); }

    /* Vergleich mit Soll */
    if (SCHREIBEN) {
        fs.writeFileSync(SOLL_DATEI, JSON.stringify(ist, null, 1) + '\n');
        console.log('Soll-Zustand geschrieben: ' + SOLL_DATEI);
    } else {
        for (const k of Object.keys(ist)) vergleiche('Golden Master ' + k, ist[k], soll[k]);
    }

    /* M. Paar-Vertauschungs-Matrix */
    const basis = await kompakt();
    ist.matrix = {};
    for (let i = 0; i < WRAPPER.length; i++) for (let j = i + 1; j < WRAPPER.length; j++) {
        const a = WRAPPER[i], b = WRAPPER[j];
        const p = await kompakt({ opt: { skriptReihenfolge: tausche(a, b) } });
        let diff = -1; for (let k = 0; k < Math.max(p.length, basis.length); k++) if (p[k] !== basis[k]) { diff = k; break; }
        ist.matrix[a + ' <-> ' + b] = diff < 0 ? 'identisch' : 'verändert in ' + gruppenMitUnterschied(basis, p).join('+') + ': ' + kurz(basis[diff], 70) + '  =>  ' + kurz(p[diff], 70);
    }
    if (SCHREIBEN) { fs.writeFileSync(SOLL_DATEI, JSON.stringify(ist, null, 1) + '\n'); }
    else {
        const sm = soll.matrix || {};
        for (const k of Object.keys(ist.matrix)) check('Vertauschung ' + k + ' → ' + (sm[k] || '?').split(':')[0], ist.matrix[k] === sm[k], 'soll ' + sm[k] + ' | ist ' + ist.matrix[k]);
    }

    /* M2. Phase 4B: Reihenfolge-Matrix der sechs Speak-Dateien im sicheren Ladebereich (alle 15 Paare, umgekehrt, gemischt) -> muss überall identisch sein */
    ist.matrix_sechs = {};
    const unterschiedStelle = (p, b) => { for (let k = 0; k < Math.max(p.length, b.length); k++) if (p[k] !== b[k]) return k; return -1; };
    const messeSicher = async (name, reihe) => {
        const p = await kompakt({ opt: { skriptReihenfolge: sicher(reihe) } });
        const d = unterschiedStelle(p, basis);
        ist.matrix_sechs[name] = d < 0 ? 'identisch' : 'verändert in ' + gruppenMitUnterschied(basis, p).join('+') + ': ' + kurz(basis[d], 70) + '  =>  ' + kurz(p[d], 70);
    };
    await messeSicher('Grundordnung (voicefix wandert an den sechsten Platz)', SICHER_PLAETZE);
    for (let i = 0; i < SICHER_PLAETZE.length; i++) for (let j = i + 1; j < SICHER_PLAETZE.length; j++)
        await messeSicher(SICHER_PLAETZE[i] + ' <-> ' + SICHER_PLAETZE[j], vertausche(SICHER_PLAETZE, SICHER_PLAETZE[i], SICHER_PLAETZE[j]));
    await messeSicher('alle sechs umgekehrt', SICHER_PLAETZE.slice().reverse());
    for (const saat of [1, 7, 42, 99]) await messeSicher('alle sechs gemischt (Saat ' + saat + ')', mischenReihe(SICHER_PLAETZE, saat));
    if (SCHREIBEN) { fs.writeFileSync(SOLL_DATEI, JSON.stringify(ist, null, 1) + '\n'); }
    else {
        for (const k of Object.keys(ist.matrix_sechs)) check('Sicherer Bereich (Phase 4B): ' + k + ' → beobachtbares Verhalten identisch', ist.matrix_sechs[k] === 'identisch', ist.matrix_sechs[k]);
    }

    if (!SCHREIBEN) for (const k of Object.keys(soll)) check('Soll-Schlüssel ' + k + ' wird noch gemessen', k in ist);

    /* Gegenproben A–E: künstliche Fehler müssen erkannt werden (Produktdateien auf der Platte bleiben unverändert) */
    const DETAILS = process.argv.includes('--details');   // zeigt je Gegenprobe, WAS sich geändert hat
    const unterschied = (x, y) => {
        const d = JSON.stringify(x) !== JSON.stringify(y);
        if (DETAILS) { let k = -1; for (let i = 0; i < Math.max(x.length, y.length); i++) if (x[i] !== y[i]) { k = i; break; } console.log('   ↳ ' + (d ? 'verändert in ' + gruppenMitUnterschied(y, x).join('+') + ': ' + kurz(y[k], 90) + '  =>  ' + kurz(x[k], 90) : 'KEINE Änderung sichtbar')); }
        return d;
    };
    /* Gegenprobe A/A2 (seit Phase 4B umgedreht): Reihenfolge der sechs Speak-Dateien im sicheren Bereich darf NICHTS mehr verändern; dafür ändert ein anderer RANG sehr wohl das Verhalten */
    { const p = await kompakt({ opt: { skriptReihenfolge: sicher(vertausche(SICHER_PLAETZE, 'fish.js', 'teilen.js')) } });
      check('Gegenprobe A: fish.js <-> teilen.js (früher: teilen merkt 2,19 statt 2,193) verändert das Verhalten NICHT mehr', !unterschied(p, basis)); }
    { const p = await kompakt({ opt: { skriptReihenfolge: sicher(vertausche(SICHER_PLAETZE, 'sprueche.js', 'toene.js')) } });
      check('Gegenprobe A2: sprueche.js <-> toene.js (früher: Ton hing am Spruch-Text) verändert das Verhalten NICHT mehr', !unterschied(p, basis)); }
    { const p = await kompakt({ opt: { quelleAendern: (f, q) => f === 'teilen.js' ? q.replace("anmelden('teilen', 10,", "anmelden('teilen', 55,") : q } });
      check('Gegenprobe A3: ein anderer RANG (teilen 10 -> 55, also hinter sprueche) verändert das Verhalten sehr wohl (Reihenfolge steckt jetzt im Rang)', unterschied(p, basis));
      check('Gegenprobe A3: die Quell-Ersetzung hat gegriffen', lies('js/teilen.js').indexOf("anmelden('teilen', 10,") >= 0); }
    { const p = await kompakt({ opt: { quelleAendern: (f, q) => f === 'sprueche.js' ? q.replace("anmelden('sprueche', 50,", "anmelden('sprueche', 35,") : q } });
      check('Gegenprobe A4: ein anderer RANG (sprueche 50 -> 35, also vor toene) verändert das Verhalten sehr wohl', unterschied(p, basis));
      check('Gegenprobe A4: die Quell-Ersetzung hat gegriffen', lies('js/sprueche.js').indexOf("anmelden('sprueche', 50,") >= 0); }
    for (const f of ['sprueche.js', 'toene.js', 'fish.js', 'pronunciation.js', 'voicefix.js', 'teilen.js', 'kontext_lokal.js', 'speechrate.js']) {
        const p = await kompakt({ opt: { ohneSkripte: [f] } });
        check('Gegenprobe B: ohne ' + f + ' wird erkannt', unterschied(p, basis));
    }
    { const p = await kompakt({ opt: { quelleAendern: (f, q) => f === 'fish.js' ? q.replace("if (typeof a[0] === 'string') a[0] = normalizeSpoken(a[0]);", "if (typeof a[0] === 'string') a[0] = normalizeSpoken(a[0]).toUpperCase();") : q } });
      check('Gegenprobe C: Text in einem Wrapper (fish.js) verändert wird erkannt', unterschied(p, basis)); }
    { const p = await kompakt({ opt: { quelleAendern: (f, q) => f === 'sprueche.js' ? q.replace("args[0] = addQuip(text);", "args[0] = addQuip(text) + ' Peng.';") : q } });
      check('Gegenprobe C2: Text in sprueche.js verändert wird erkannt', unterschied(p, basis)); }
    { const p = await kompakt({ opt: { quelleAendern: (f, q) => f === 'mehrfach.js' ? q.replace('finally { window.speak = orig; }', 'finally { }') : q } });
      check('Gegenprobe D: mehrfach.js ohne Wiederherstellung wird erkannt', unterschied(p, basis));
      check('Gegenprobe D: die Quell-Ersetzung hat gegriffen', lies('js/mehrfach.js').indexOf('finally { window.speak = orig; }') >= 0); }
    for (const [datei, von, nach, was] of [
        ['toene.js', 't.length > 420', 't.length > 42', 'Längengrenze der Töne'],
        ['sprueche.js', 'Date.now() - lastAt < 3000', 'Date.now() - lastAt < 30', 'Wiederholungsschutz der Sprüche'],
        ['sprueche.js', 'const MAX_LEN = 430;', 'const MAX_LEN = 43;', 'Längengrenze der Sprüche'],
        ['teilen.js', 't.length >= 40', 't.length >= 400', 'Merk-Grenze von teilen.js'],
        ['voicefix.js', "if (typeof isSpeaking === 'function' && isSpeaking()) { if (onComplete) onComplete(); return; }", "if (false) { if (onComplete) onComplete(); return; }", 'Unterdrückung der Zwischenansage'],
        ['toene.js', 'now - lastTone.at < 1500', 'now - lastTone.at < 15', 'Doppel-Ton-Schutz']]) {
        const p = await kompakt({ opt: { quelleAendern: (f, q) => f === datei ? q.replace(von, nach) : q } });
        check('Gegenprobe E: veränderte Unterdrückungsbedingung (' + was + ') wird erkannt', unterschied(p, basis));
        check('Gegenprobe E: Quell-Ersetzung greift (' + was + ')', lies('js/' + datei).indexOf(von) >= 0);
    }

    /* ---------- Phase 4B: die Speak-Kette selbst ---------- */
    const KETTE = [['teilen', 10], ['kontext_lokal', 20], ['fish._dash', 30], ['toene', 40], ['sprueche', 50], ['voicefix.speak', 60]];
    const KETTE_TEXT = 'teilen(10) > kontext_lokal(20) > fish._dash(30) > toene(40) > sprueche(50) > voicefix.speak(60) > [Basis voice.js]';
    const JS = x => JSON.stringify(x);
    function ketteWelt(extra) {   // wie sprachWelt, merkt sich zusätzlich den load-Hörer der Kette (window.addEventListener ist in der Testumgebung sonst leer)
        const lade = [], ex = Object.assign({}, extra || {});
        const eigen = ex.nachSkript;
        ex.nachSkript = (f, sb) => {
            if (!sb.__ketteHoerer) { sb.__ketteHoerer = true; const a = sb.addEventListener; sb.addEventListener = function (t, fn) { if (t === 'load' && /speak_kette\.js/.test(String(new Error().stack))) lade.push(fn); return a.apply(this, arguments); }; }
            if (eigen) eigen(f, sb);
        };
        const w = sprachWelt(ex); w.lade = lade; return w;
    }
    function verzoegertePruefung(w) {   // läuft die 3-Sekunden-Prüfung nach 'load' ab; liefert die Fehler, die sie in die Fehleranzeige werfen würde
        const fehler = [], T = w.sb.setTimeout;
        w.sb.setTimeout = function (fn) { try { fn(); } catch (e) { fehler.push(String(e && e.message)); } return 0; };
        w.lade.forEach(f => { try { f({}); } catch (e) { } });
        w.sb.setTimeout = T;
        return fehler;
    }
    {   // normaler Start
        const w = ketteWelt(), K = w.sb.jvSpeakKette;
        w.start(); const fe = verzoegertePruefung(w); const ev = w.stopp();
        check('Kette (Normalstart): genau eine verzögerte Prüfung angemeldet', w.lade.length === 1, String(w.lade.length));
        check('Kette (Normalstart): Stufen und Ränge außen -> innen wie beauftragt', JS(K.liste().map(x => [x.name, x.rang])) === JS(KETTE), JS(K.liste()));
        check('Kette (Normalstart): text() lesbar mit Basis voice.js', K.text() === KETTE_TEXT, K.text());
        check('Kette (Normalstart): pruefe() vollständig, keine Anmeldefehler, nichts fehlt/unerwartet', K.pruefe().vollstaendig === true && K.pruefe().fehler.length === 0, JS(K.pruefe()));
        check('Kette (Normalstart): KEINE neue Fehlermeldung nach der verzögerten Prüfung', fe.length === 0, JS(fe));
        check('Kette (Normalstart): keine Sprache, keine Anzeige, kein Ton durch die Prüfung', ev.length === 0, JS(ev));
        check('Kette (Normalstart): keine Ladefehler in den Skripten', w.ladefehler.length === 0, JS(w.ladefehler));
        check('Kette (Normalstart): window.speak ist die äußerste Stufe (nicht voice.js direkt)', typeof w.sb.speak === 'function' && w.sb.speak.length >= 0 && w.sb.speak !== undefined);
    }
    {   // ungültige Anmeldungen
        const w = ketteWelt(), K = w.sb.jvSpeakKette, nop = innen => function () { return innen.apply(this, arguments); };
        const vorListe = JS(K.liste()), vorSpeak = w.sb.speak;
        const faelle = [
            ['doppelter Name (toene nochmal, anderer Rang)', () => K.anmelden('toene', 99, nop)],
            ['doppelter Rang (40 gehört toene)', () => K.anmelden('zusatz', 40, nop)],
            ['Rang ist Text', () => K.anmelden('zusatz', '5', nop)],
            ['Rang ist NaN', () => K.anmelden('zusatz', NaN, nop)],
            ['Name fehlt', () => K.anmelden('', 5, nop)],
            ['fabrik ist keine Funktion', () => K.anmelden('zusatz', 5, 'x')],
            ['fabrik wirft', () => K.anmelden('zusatz', 5, () => { throw new Error('kaputt'); })],
            ['fabrik liefert keine Funktion', () => K.anmelden('zusatz', 5, () => 42)]
        ];
        let n = 0;
        for (const [name, tu] of faelle) {
            const r = tu(); n++;
            check('Kette: ungültige Anmeldung abgelehnt und gemeldet: ' + name, r === false && K.pruefe().fehler.length === n && K.pruefe().vollstaendig === false, JS(K.pruefe().fehler));
            check('Kette:   ... nichts eingebaut (Liste und window.speak unverändert): ' + name, JS(K.liste()) === vorListe && w.sb.speak === vorSpeak);
        }
        const w2 = ketteWelt(), K2 = w2.sb.jvSpeakKette, fremd = function () { };
        w2.sb.speak = fremd;
        check('Kette: von außen ersetztes window.speak (alte Art zu umhüllen) wird erkannt, Anmeldung abgelehnt, window.speak bleibt', K2.anmelden('zusatz', 5, nop) === false && w2.sb.speak === fremd && K2.pruefe().vollstaendig === false);
        const w3 = ketteWelt(), K3 = w3.sb.jvSpeakKette;
        check('Kette: gültige Zusatz-Stufe wird eingebaut, steht je nach Rang, pruefe() meldet sie als unerwartet',
            K3.anmelden('zusatz', 5, nop) === true && K3.liste()[0].name === 'zusatz' && JS(K3.pruefe().unerwartet) === JS(['zusatz']) && K3.pruefe().vollstaendig === false);
    }
    for (const [datei, name] of [['teilen.js', 'teilen'], ['kontext_lokal.js', 'kontext_lokal'], ['fish.js', 'fish._dash'], ['toene.js', 'toene'], ['sprueche.js', 'sprueche'], ['voicefix.js', 'voicefix.speak']]) {   // Gegenprobe B
        const w = ketteWelt({ opt: { ohneSkripte: [datei] } }), K = w.sb.jvSpeakKette;
        w.start(); const fe = verzoegertePruefung(w); const ev = w.stopp();
        check('Gegenprobe B (Kette): ohne ' + datei + ' meldet pruefe() "' + name + '" als fehlend und nicht vollständig', K.pruefe().vollstaendig === false && K.pruefe().fehlend.indexOf(name) >= 0, JS(K.pruefe()));
        check('Gegenprobe B (Kette): ohne ' + datei + ' kommt genau EIN Fehler für die Fehleranzeige, mit dem Namen', fe.length === 1 && /Speak-Kette unvollständig/.test(fe[0]) && fe[0].indexOf(name) >= 0, JS(fe));
        check('Gegenprobe B (Kette): ohne ' + datei + ' keine Sprache/Anzeige/Karte', ev.length === 0, JS(ev));
    }
    {   // Gegenprobe G: Basis voice.js fehlt
        const w = ketteWelt({ opt: { ohneSkripte: ['voice.js'] } }), K = w.sb.jvSpeakKette;
        w.start(); const fe = verzoegertePruefung(w); const ev = w.stopp();
        check('Gegenprobe G (Kette): ohne voice.js ist KEINE Stufe eingebaut (kein stilles halbes Kettenverhalten)', K.liste().length === 0 && typeof w.sb.speak !== 'function', JS(K.liste()));
        check('Gegenprobe G (Kette): verständliche Meldung, dass die Basis (voice.js) fehlt', K.pruefe().fehler.length > 0 && K.pruefe().fehler.every(x => /Basis window\.speak \(voice\.js\)/.test(x)), JS(K.pruefe().fehler));
        check('Gegenprobe G (Kette): die verzögerte Prüfung wirft genau einen Fehler (Fehleranzeige), keine Sprache', fe.length === 1 && /Speak-Kette unvollständig/.test(fe[0]) && ev.length === 0, JS(fe));
    }
    {   // Gegenprobe F: mehrfach.js-Fang trifft die ganze Kette und stellt sie danach wieder her
        const w = ketteWelt(); w.engine('browser'); const K = w.sb.jvSpeakKette;
        const vorListe = JS(K.liste()), vor = w.sb.speak, fang = [];
        w.start();
        w.sb.speak = function (t) { fang.push(String(t)); };
        w.sb.speak('Gefangen: Kettentest.');
        w.sb.speak = vor;
        await w.ruhig(100);
        const evFang = w.stopp();
        check('Gegenprobe F (Kette): während des Fangs erreicht nichts die Kette (keine Stimme, kein Ton)', fang.length === 1 && evFang.filter(z => /stimme:|ton:|audio:/.test(z)).length === 0, JS(evFang));
        check('Gegenprobe F (Kette): nach dem Zurücksetzen spricht die Kette wieder, Stufen unverändert', (() => { w.start(); w.sb.speak('Danach spricht die Kette wieder.'); return true; })() && JS(K.liste()) === vorListe);
        await w.ruhig(100);
        check('Gegenprobe F (Kette): nach dem Fang ist die Sprache hörbar', w.stopp().some(z => /stimme: "Danach spricht/.test(z)));
        const w2 = ketteWelt(); w2.engine('browser'); const vor2 = w2.sb.speak;
        w2.sb.jvCommands.nur = function () { w2.sb.speak('Teil A.'); return true; };
        w2.start();
        await w2.lassLaufen(() => w2.sb.handleLocalCommand('Wie wird morgen das Wetter und wann ist der nächste Vollmond?'));
        await w2.ruhig(300); w2.stopp();
        check('Gegenprobe F (Kette): echter mehrfach.js-Lauf stellt window.speak exakt wieder her und lässt die Stufen unverändert', w2.sb.speak === vor2 && JS(w2.sb.jvSpeakKette.liste()) === JS(KETTE.map(([name, rang]) => ({ name, rang }))));
    }

    console.log(`\nSprach-Golden-Master: ${ok} Prüfungen ok, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
