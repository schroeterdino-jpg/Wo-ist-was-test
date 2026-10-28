/* ============================================================
   TESTUMGEBUNG "ganze App": lädt ALLE Skripte aus index.html in der echten Reihenfolge in eine Attrappe von Browser, Sprachausgabe,
   Uhr und Netz. Ändert keinen App-Code. Genutzt von tests/jarvis_pruefstrecke.js.

   starte({ jetzt, native, dienste })  ->  App-Objekt:
     jetzt     Feste Uhrzeit (ISO mit Zone, Standard: Mittwoch 28.10.2026 10:00 Berlin), die Uhr tickt nicht.
     native    true: window.ZaneNative ist da (Attrappe der Handy-App-Brücke), false: normaler Browser.
     sekundenTakt  true: auch der 1-Sekunden-Zeitgeber (Erinnerungs-Timer in calendar.js) läuft; sonst werden Zeitgeber unter 15 s ausgelassen.
   sprechenBeendet  true: nach jeder Sprachausgabe wird der übergebene "fertig"-Rückruf nach 2 s (virtuelle Uhr) aufgerufen, wie bei echter Sprachausgabe (nicht der Gesprächs-Rückruf continueConversation).
  festerZufall  true: Math.random liefert immer 0.5 (schon beim Laden der Skripte), damit zwei Läufe gleich ausfallen.
   ohneSkripte   Liste von Dateinamen aus index.html, die NICHT geladen werden (zum Beispiel ['meldungen.js'] für den Vergleich mit und ohne Beobachter).
   dienste   { kalender, wetter, route, ... }: 'ok' oder 'aus' je Dienst. 'aus' lässt gezielt EINEN Dienst ausfallen.
   App.satz(text)       Der Satz geht den echten Weg: erst die feste Befehls-Kette (handleLocalCommand). Ergebnis:
                        { lokal, modul, gesagt[], reaktionen[], aenderungen }
   App.ki(text, aktionen)  Der Satz geht an die (Attrappen-)KI. Die KI liefert die vorgegebenen Aktionen, die laufen durch
                        executeAction mit ALLEN Umhüllungen, so wie in assistant.js. Ergebnis wie satz().
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const RealTimeout = setTimeout; const RealNow = () => process.hrtime.bigint() / 1000000n > 0n ? Number(process.hrtime.bigint() / 1000000n) : 0;
const ROOT = path.join(__dirname, '..');
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

// feste Zeit: eine Date-Klasse, die immer dieselbe "Jetzt"-Zeit liefert
function festeDate(uhr, Echt) {
    function D(...a) { return a.length ? new Echt(...a) : new Echt(uhr.ms); }
    D.prototype = Echt.prototype;
    D.now = () => uhr.ms;
    D.UTC = Echt.UTC; D.parse = Echt.parse;
    return D;
}

function starte(opt) {
    opt = opt || {};
    const uhr = { ms: new Date(opt.jetzt || '2026-10-28T10:00:00+01:00').getTime() };
    const startMs = uhr.ms;
    const dienste = Object.assign({ kalender: 'ok', wetter: 'ok', route: 'ok', ort: 'ok', gedaechtnis: 'ok', ki: 'ok' }, opt.dienste || {});
    const gesagt = [], store = {}, sess = {}, aufrufe = [], reaktionen = [];
    const wer = { aktuell: null };
    const el = () => new Proxy(function () { }, {
        get: (t, k) => k === 'style' ? new Proxy({}, { get: (a, b) => b === 'setProperty' || b === 'removeProperty' || b === 'getPropertyValue' ? () => '' : '', set: () => true }) : k === 'classList' ? { add() { }, remove() { }, contains() { return false; }, toggle() { } } : k === 'children' || k === 'childNodes' ? [] :
            (k === 'appendChild' || k === 'querySelector' || k === 'getContext' || k === 'cloneNode' || k === 'insertBefore' || k === 'append') ? () => el() :
                (k === 'value' || k === 'textContent' || k === 'innerHTML' || k === 'innerText' || k === 'id' || k === 'className') ? '' : (k === 'length' ? 0 : (k === Symbol.toPrimitive ? () => '' : el())),
        set: () => true, apply: () => el(), construct: () => el(), has: () => true
    });
    const timer = []; let tid = 1;
    function plane(fn, ms, a, iv) { if (typeof fn !== 'function') return 0; if (iv === 0 && !(ms >= 0)) ms = 0; if (iv && !(+ms >= 15000) && !(opt.sekundenTakt && +ms === 1000)) return 0;   const id = tid++; timer.push({ id, at: uhr.ms + Math.max(0, +ms || 0), fn, a, iv }); return id; }
    function abbrechen(id) { const i = timer.findIndex(t => t.id === id); if (i >= 0) timer.splice(i, 1); }
    // Wer wollte sprechen? Aus dem Aufruf-Stapel: erste Datei, die nicht nur Sprach-Technik ist
    const TECHNIK = new Set(['voice.js', 'fish.js', 'tempo.js', 'speechrate.js', 'voicefix.js', 'native_speech.js', 'tts.js', 'audio.js', 'hoeren.js', 'pronunciation.js', 'umgebung.js']);
    function aufrufer() {
        const zeilen = String(new Error().stack || '').split('\n').slice(2);
        for (const l of zeilen) {
            const m = /at (?:async )?(?:([\w$.<>]+) )?\(?(?:.*[\\/])?([\w.-]+\.js):\d+:\d+\)?\s*$/.exec(l.trim());
            if (m && !TECHNIK.has(m[2]) && !/^node:/.test(m[2])) return m[2] + (m[1] && m[1] !== 'Object.<anonymous>' ? ':' + m[1] : '');
        }
        return '(unbekannt)';
    }
    const ereignisse = [];
    const hhmm = () => new RealDateFmt(uhr.ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
    const lauf = { chain: null };
    const RealDate = Date; const RealDateFmt = Date;
    const LOC = { href: 'http://test/', search: '', hash: '', origin: 'http://test', pathname: '/', reload() { } };
    const sb = {
        console: { log() { }, warn() { }, error() { }, info() { }, debug() { } },
        setTimeout: (fn, ms, ...a) => plane(fn, ms, a, 0), clearTimeout: id => abbrechen(id), setInterval: (fn, ms, ...a) => plane(fn, ms, a, Math.max(15000, +ms || 0)), clearInterval: id => abbrechen(id), queueMicrotask,
        Promise, JSON, Math, Array, Object, String, Number, Boolean, RegExp, Set, Map, WeakMap, Symbol, Error, TypeError, parseFloat, parseInt, isNaN, isFinite,
        encodeURIComponent, decodeURIComponent, encodeURI, decodeURI, escape, unescape, Intl, URL, URLSearchParams, Blob, TextEncoder, TextDecoder, Uint8Array, ArrayBuffer, atob, btoa,
        Date: festeDate(uhr, RealDate),
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; }, get length() { return Object.keys(store).length; }, key: i => Object.keys(store)[i] || null },
        sessionStorage: { getItem: k => (k in sess ? sess[k] : null), setItem: (k, v) => { sess[k] = String(v); }, removeItem: k => { delete sess[k]; } },
        document: { createElement: el, createTextNode: () => el(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() { }, removeEventListener() { }, head: el(), body: el(), documentElement: el(), hidden: false, readyState: 'complete', cookie: '', title: 'Jarvis', location: LOC },
        navigator: { userAgent: 'test', language: 'de-DE', onLine: true, geolocation: { getCurrentPosition(ok, err) { err && err({ code: 1 }); }, watchPosition() { return 0; }, clearWatch() { } }, mediaDevices: {}, serviceWorker: undefined, clipboard: { writeText: async () => { } }, permissions: { query: async () => ({ state: 'denied' }) } },
        location: LOC,
        performance: { now: () => 0 }, history: { pushState() { }, replaceState() { } },
        Audio: function () { return new Proxy({}, { get: (t, k) => typeof k === 'string' && k !== 'then' ? function () { return Promise.resolve(); } : undefined, set: () => true }); },
        speechSynthesis: { speak() { }, cancel() { }, getVoices: () => [], speaking: false, onvoiceschanged: null },
        SpeechSynthesisUtterance: function () { },
        AudioContext: function () { return new Proxy({}, { get: (t, k) => k === 'destination' ? {} : function () { return new Proxy({}, { get: () => function () { } }); } }); },
        Image: function () { }, requestAnimationFrame: () => 0, cancelAnimationFrame() { },
        matchMedia: () => ({ matches: false, addEventListener() { }, addListener() { } }),
        MutationObserver: function () { return { observe() { }, disconnect() { } }; }, ResizeObserver: function () { return { observe() { }, disconnect() { } }; }, IntersectionObserver: function () { return { observe() { }, disconnect() { } }; },
        Event: function () { }, CustomEvent: function () { }, ErrorEvent: function () { }, FileReader: function () { }, XMLHttpRequest: function () { },
        addEventListener() { }, removeEventListener() { }, dispatchEvent: () => true, open() { return null; }, alert() { }, confirm: () => false, prompt: () => null,
        AbortController, AbortSignal, structuredClone, Response: typeof Response !== 'undefined' ? Response : function () { }, Headers: typeof Headers !== 'undefined' ? Headers : function () { }, FormData: typeof FormData !== 'undefined' ? FormData : function () { },
        accessToken: '', isProcessing: false
    };
    sb.webkitAudioContext = sb.AudioContext;
    sb.window = sb; sb.globalThis = sb; sb.self = sb; sb.top = sb; sb.parent = sb;
    sb.innerWidth = 400; sb.innerHeight = 800;

    // Netz: nur die Dienste, die der Test ausdrücklich erlaubt; alles andere wie "offline"
    sb.fetch = async (url) => {
        const u = String(url); aufrufe.push(u);
        throw new Error('offline (Attrappe): ' + u.slice(0, 80));
    };
    sb.apiFetch = async (url) => { const u = String(url); aufrufe.push(u); throw new Error('offline (Attrappe): ' + u.slice(0, 80)); };
    if (opt.fetch) { sb.fetch = async (u, o) => { aufrufe.push(String(u)); return opt.fetch(String(u), o); }; sb.apiFetch = sb.fetch; }
    if (opt.native) sb.ZaneNative = opt.native === true ? nativeAttrappe() : opt.native;

    vm.createContext(sb);
    if (opt.festerZufall) vm.runInContext('Math.random = function () { return 0.5; }', sb);   // vor dem Laden der Skripte: gleiche Zufallszahlen in jedem Lauf
    const html = lies('index.html');
    const reihenfolge = [...html.matchAll(/<script[^>]+src="\.\/js\/([^"?]+)/g)].map(m => m[1]).filter(f => !(opt.ohneSkripte || []).includes(f));
    const ladefehler = [];
    const behandelt = [];
    for (const f of reihenfolge) {
        try { vm.runInContext(lies('js/' + f), sb, { filename: f }); } catch (e) { ladefehler.push(f + ': ' + String(e.message).slice(0, 100)); }
        if (f === 'commands.js' && sb.jvCommands && !sb.jvCommands._beobachtet) {   // Beobachter: wer übernimmt einen Satz?
            const orig = sb.jvCommands.use;
            sb.jvCommands.use = sb.jvCommandsUse = function (name, mw, order) {
                return orig(name, function (t, next) {
                    let weiter = false;
                    const r = mw(t, function () { weiter = true; return next.apply(null, arguments); });
                    if (r === true && !weiter) behandelt.push(name);
                    return r;
                }, order);
            };
            sb.jvCommands._beobachtet = true;
        }
    }
    // Sprachausgabe abfangen (nach dem Laden, denn voice.js/fish.js definieren speak selbst)
    const echtSpeak = sb.speak;
    sb.speak = function (t, fertig) { const x = String(t == null ? '' : t); gesagt.push(x); ereignisse.push({ art: 'sprechen', zeit: hhmm(), modul: aufrufer(), text: x });
        if (opt.sprechenBeendet && typeof fertig === 'function' && fertig !== sb.continueConversation) plane(function () { try { fertig(); } catch (e) { } }, 2000, []); };
    for (const fn of ['openExtraWindow', 'showSuggestionCard', 'showToast', 'zeigeKarte']) {   // Karten/Fenster, die Module von selbst öffnen
        const o = sb[fn]; if (typeof o !== 'function') continue;
        sb[fn] = function () { ereignisse.push({ art: 'karte', zeit: hhmm(), modul: aufrufer(), text: fn + ': ' + String(arguments[0]).slice(0, 60) }); try { return o.apply(this, arguments); } catch (e) { } };
    }
    sb.sagenAttrappe = true;
    async function vorspulen(ms) {   // Uhr und Zeitgeber vorstellen; fällige Zeitgeber laufen der Reihe nach
        const ende = uhr.ms + ms; let n = 0; const t0 = Date.now ? RealNow() : 0;
        while (n++ < 60000 && RealNow() - t0 < 25000) {
            timer.sort((a, b) => a.at - b.at);
            const t = timer[0]; if (!t || t.at > ende) break;
            uhr.ms = Math.max(uhr.ms, t.at);
            if (t.iv) t.at += t.iv; else timer.splice(0, 1);
            try { const r = t.fn(...t.a); if (r && typeof r.then === 'function') await Promise.race([r.catch(() => { }), new Promise(res => RealTimeout(res, 30))]); } catch (e) { }
            if (n % 20 === 0) await new Promise(res => setImmediate(res));
        }
        uhr.ms = ende; await new Promise(res => setImmediate(res)); await new Promise(res => setImmediate(res));
    }

    function zustand() {
        const g = n => { try { return vm.runInContext('typeof ' + n + " !== 'undefined' ? " + n + ' : null', sb); } catch (e) { return null; } };
        return {
            termine: (g('calendarEntries') || []).map(x => ({ text: x.text, iso: x.isoDate })),
            erinnerungen: (g('reminderEntries') || []).map(x => ({ text: x.text, zeit: x.time })),
            gedaechtnis: (() => { const m = g('memoryItems') || []; return (Array.isArray(m) ? m : Object.entries(m)).map(x => (x && x.text) || JSON.stringify(x)); })(),
            speicher: Object.assign({}, store)
        };
    }
    function diff(vor, nach) {
        const d = {};
        for (const k of ['termine', 'erinnerungen', 'gedaechtnis']) {
            const a = JSON.stringify(vor[k]), b = JSON.stringify(nach[k]);
            if (a !== b) d[k] = { vorher: vor[k].length, nachher: nach[k].length, neu: nach[k].filter(x => !vor[k].some(y => JSON.stringify(y) === JSON.stringify(x))) };
        }
        const sk = Object.keys(nach.speicher).filter(k => vor.speicher[k] !== nach.speicher[k]);
        if (sk.length) d.speicherSchluessel = sk;
        return d;
    }

    async function satz(text) {
        behandelt.length = 0; const g0 = gesagt.length, v = zustand(); let r, fehler = null;
        try { const x = await lassLaufen(() => sb.handleLocalCommand(text)); if (x.haengt) fehler = 'hängt (Antwort kam nicht)'; else r = x.wert; } catch (e) { fehler = String(e.message); }
        await warte();
        return { text, lokal: r === true, modul: behandelt.length ? behandelt.join('+') : (r === true ? '(Basis localcommands.js oder altes Einhängen)' : null), mehrere: behandelt.length > 1, gesagt: gesagt.slice(g0), aenderungen: diff(v, zustand()), fehler };
    }
    async function ki(text, aktionen, antwort) {
        const g0 = gesagt.length, v = zustand(); const ctx = { counter: 0, cards: [], notes: [], panel: null }; const fehler = [];
        for (const a of aktionen || []) { try { const x = await lassLaufen(() => sb.executeAction(a, text, ctx)); if (x.haengt) fehler.push('hängt: ' + a.type); } catch (e) { fehler.push(String(e.userMessage || e.message)); } }
        await warte();
        return { text, lokal: false, modul: 'KI-Weg (Attrappe liefert: ' + (aktionen || []).map(a => a.type).join(', ') + ')', gesagt: gesagt.slice(g0), notizen: ctx.notes.map(n => typeof n === 'string' ? n : JSON.stringify(n)).slice(0, 5), karten: ctx.cards.length, aenderungen: diff(v, zustand()), fehler };
    }
    const warte = () => new Promise(res => setImmediate(res));
    // Eine Anfrage läuft, bis sie fertig ist. Hängt sie an einem Zeitgeber, den sie selbst angelegt hat (z. B. "höchstens 1,5 Sekunden warten"),
    // wird die Uhr dafür vorgestellt. Zeitgeber, die schon vorher da waren (Dauerläufer der App), bleiben unberührt.
    async function lassLaufen(promiseFn) {
        const ab = tid; let fertig = false, wert, fehl = null;
        const p = Promise.resolve().then(promiseFn).then(v => { fertig = true; wert = v; }, e => { fertig = true; fehl = e; });
        for (let i = 0; i < 400 && !fertig; i++) {
            await new Promise(res => setImmediate(res));
            if (fertig) break;
            const neu = timer.filter(t => t.id >= ab && !t.iv).sort((a, b) => a.at - b.at)[0];
            if (neu) { uhr.ms = Math.max(uhr.ms, neu.at); timer.splice(timer.indexOf(neu), 1); try { neu.fn(...neu.a); } catch (e) { } }
            else await new Promise(res => RealTimeout(res, 2));
        }
        if (!fertig) return { haengt: true };
        if (fehl) throw fehl;
        return { wert };
    }
    function setze(name, wert) { sb.__t = wert; vm.runInContext(name + ' = window.__t;', sb); }
    function lese(name) { try { return vm.runInContext('typeof ' + name + " !== 'undefined' ? " + name + ' : undefined', sb); } catch (e) { return undefined; } }
    function nativeAttrappe() {
        const n = { _wissen: '' };
        return new Proxy(n, { get: (t, k) => {
            if (typeof k === 'string' && !/^(schlafStand|wissenListe|vertretungStand)$/.test(k)) return function () { ereignisse.push({ art: 'brücke', zeit: hhmm(), modul: aufrufer(), text: k + '(' + Array.from(arguments).map(a => String(a).slice(0, 50)).join(', ') + ')' }); return k === 'wissenSetzen' ? (t._wissen = String(arguments[0] || '')) && undefined : (k === 'planAnsagen' ? true : ''); };
            if (k === 'schlafStand') return () => JSON.stringify({ an: false });
            if (k === 'wissenListe') return () => t._wissen;
            if (k === 'wissenSetzen') return (x) => { t._wissen = String(x || ''); };
            if (k === 'vertretungMinuten') return (m) => { t._min = m; };
            if (k === 'vertretungStand') return () => JSON.stringify({ an: false, minuten: 5 });
            return () => '';
        } });
    }
    return { lassLaufen, vorspulen, ereignisse, uhr, sb, gesagt, store, aufrufe, ladefehler, satz, ki, zustand, setze, lese, behandelt, reihenfolge, kette: () => sb.jvCommands.list(), vm };
}

module.exports = { starte, ROOT, lies };
