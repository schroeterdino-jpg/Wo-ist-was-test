/* ============================================================
   Phase 6B.1: kleine Prüfwelt für EINE Datei (mimik.js, holo_look.js, anzeige.js, laune.js) mit
   - gesteuerter Sichtbarkeit (document.hidden + visibilitychange),
   - virtueller Uhr (setInterval/setTimeout/requestAnimationFrame laufen nur über tick(ms)),
   - festem Zufall (Math.random) und fester Zeit (Date.now),
   - Zählern: gesetzte/gelöschte/aktive Intervalle, Rückrufe,
   - einem Attrappen-Kopf (jvAvatar3D) mit Protokoll.
   Kein echter Browser, keine Netz-/Speicherzugriffe nach außen. Nur Prüfwerkzeug, kein Produktcode.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');

function lade(datei, opt) {
    opt = opt || {};
    const quelle = opt.quelle != null ? opt.quelle : fs.readFileSync(path.join(ROOT, 'js', datei), 'utf8');
    let jetzt = 1000000, idZaehler = 0, saat = 12345;
    const timer = new Map();   // id -> { fn, ms, naechster, wiederholt, art }
    const z = { setInterval: 0, clearInterval: 0, intervalAufrufe: 0, timeoutAufrufe: 0, rafAufrufe: 0, setTimeout: 0, speicherSchreiben: 0, netz: 0, fehler: [] };
    const hoerer = {}, ls = new Map(Object.entries(opt.speicher || {}));
    let versteckt = !!opt.startVersteckt;

    const ctx2d = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : (...a) => ctx2d), set: () => true });
    function el(tag) {
        const e = {
            tag, children: [], style: { setProperty(k, v) { this[k] = v; }, removeProperty(k) { delete this[k]; } }, dataset: {}, _cls: new Set(), parentElement: null, textContent: '', innerHTML: '', id: '', className: '', value: '',
            classList: {
                add(...c) { c.forEach(x => e._cls.add(x)); }, remove(...c) { c.forEach(x => e._cls.delete(x)); },
                toggle(c, f) { const an = f === undefined ? !e._cls.has(c) : !!f; if (an) e._cls.add(c); else e._cls.delete(c); return an; },
                contains(c) { return e._cls.has(c); }
            },
            appendChild(c) { e.children.push(c); if (c && typeof c === 'object') c.parentElement = e; return c; },
            insertBefore(c) { e.children.push(c); if (c && typeof c === 'object') c.parentElement = e; return c; },
            addEventListener() { }, removeEventListener() { }, setAttribute() { }, getAttribute() { return null; }, removeAttribute() { },
            getContext() { return ctx2d; }, querySelector() { return null; }, querySelectorAll() { return []; },
            getBoundingClientRect() { return { left: 0, top: 0, width: 400, height: 400 }; }, focus() { }, remove() { }
        };
        return e;
    }
    const body = el('body'), html = el('html'), holder = el('div');
    const doc = {
        createElement: el, createTextNode: () => el('#text'), getElementById: id => (opt.elemente && opt.elemente[id]) || null,
        querySelector: s => (opt.mitHolo && s === '.holo-container') ? holder : null, querySelectorAll: () => [],
        addEventListener(t, fn) { (hoerer[t] = hoerer[t] || []).push(fn); }, removeEventListener(t, fn) { hoerer[t] = (hoerer[t] || []).filter(f => f !== fn); },
        head: el('head'), body, documentElement: html, readyState: 'complete', cookie: '', title: 'Jarvis'
    };
    Object.defineProperty(doc, 'hidden', { get: () => versteckt });
    Object.defineProperty(doc, 'visibilityState', { get: () => (versteckt ? 'hidden' : 'visible') });

    const sb = {
        document: doc, console: { log() { }, warn() { }, error() { }, info() { } },
        localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { z.speicherSchreiben++; ls.set(k, String(v)); }, removeItem: k => { z.speicherSchreiben++; ls.delete(k); } },
        performance: { now: () => jetzt - 1000000 },
        navigator: { userAgent: 'test', language: 'de-DE' }, innerWidth: opt.breite || 412, innerHeight: opt.hoehe || 900, devicePixelRatio: 1,
        matchMedia: () => ({ matches: false, addEventListener() { }, addListener() { } }),
        getComputedStyle: () => ({ getPropertyValue: () => '' }),
        fetch: () => { z.netz++; return Promise.resolve({ ok: true, json: () => Promise.resolve({}), text: () => Promise.resolve('') }); },
        XMLHttpRequest: function () { z.netz++; this.open = () => { }; this.send = () => { }; this.setRequestHeader = () => { }; },
        addEventListener(t, fn) { (hoerer['win:' + t] = hoerer['win:' + t] || []).push(fn); }, removeEventListener() { },
        dispatchEvent: () => true, open() { return null; }, alert() { }, confirm: () => false, prompt: () => null, CustomEvent: function () { }, Event: function () { }
    };
    const FakeDate = function () { return new Date(jetzt); };
    FakeDate.now = () => jetzt; FakeDate.UTC = Date.UTC; FakeDate.parse = Date.parse;
    FakeDate.prototype = Date.prototype;
    sb.Date = FakeDate;
    function nimm(ms) { return Math.max(0, +ms || 0); }
    sb.setInterval = function (fn, ms) { if (typeof fn !== 'function') return 0; const id = ++idZaehler; z.setInterval++; timer.set(id, { fn, ms: nimm(ms) || 1, naechster: jetzt + (nimm(ms) || 1), wiederholt: true, art: 'iv' }); return id; };
    sb.clearInterval = function (id) { if (timer.has(id) && timer.get(id).art === 'iv') { z.clearInterval++; timer.delete(id); } };
    sb.setTimeout = function (fn, ms) { if (typeof fn !== 'function') return 0; const id = ++idZaehler; z.setTimeout++; timer.set(id, { fn, ms: nimm(ms), naechster: jetzt + nimm(ms), wiederholt: false, art: 'to' }); return id; };
    sb.clearTimeout = function (id) { if (timer.has(id) && timer.get(id).art === 'to') timer.delete(id); };
    sb.requestAnimationFrame = function (fn) { const id = ++idZaehler; timer.set(id, { fn, ms: 16, naechster: jetzt + 16, wiederholt: false, art: 'raf' }); return id; };
    sb.cancelAnimationFrame = function (id) { if (timer.has(id) && timer.get(id).art === 'raf') timer.delete(id); };
    sb.window = sb;
    const kontext = vm.createContext(sb);
    // fester Zufall (Reihenfolge reproduzierbar)
    vm.runInContext('Math.random = __zufall', Object.assign(kontext, { __zufall: function () { saat = (saat * 1103515245 + 12345) & 0x7fffffff; return saat / 0x7fffffff; } }));
    if (opt.kopf !== false) sb.jvAvatar3D = kopf();

    function kopf() {
        const k = { ready: true, active: true, state: 'idle', busy: false, protokoll: [], grimasse(m) { k.protokoll.push(m === null ? 'grimasse:null' : 'grimasse:' + Object.keys(m).sort().join(',')); }, setExpression(x) { k.protokoll.push('ausdruck:' + x); } };
        return k;
    }
    let ladeFehler = null;
    try { vm.runInContext(quelle, kontext, { filename: datei }); } catch (e) { ladeFehler = e; }

    function tick(ms) {
        const ziel = jetzt + ms;
        for (;;) {
            let besteId = null, beste = null;
            for (const [id, t] of timer) if (t.naechster <= ziel && (!beste || t.naechster < beste.naechster || (t.naechster === beste.naechster && id < besteId))) { besteId = id; beste = t; }
            if (!beste) break;
            jetzt = Math.max(jetzt, beste.naechster);
            if (beste.wiederholt) beste.naechster = jetzt + beste.ms; else timer.delete(besteId);
            if (beste.art === 'iv') z.intervalAufrufe++; else if (beste.art === 'to') z.timeoutAufrufe++; else z.rafAufrufe++;
            try { beste.fn(beste.art === 'raf' ? jetzt - 1000000 : undefined); } catch (e) { z.fehler.push(String(e && e.message || e)); }
        }
        jetzt = ziel;
    }
    function verstecke(an) {
        versteckt = !!an;
        (hoerer.visibilitychange || []).slice().forEach(fn => { try { fn({ type: 'visibilitychange' }); } catch (e) { z.fehler.push('visibilitychange: ' + String(e && e.message || e)); } });
    }
    const aktiv = art => [...timer.values()].filter(t => t.art === art).length;
    return {
        sb, doc, body, html, holder, z, tick, verstecke, ladeFehler, ls,
        get hidden() { return versteckt; }, get jetzt() { return jetzt - 1000000; },
        aktiveIntervalle: () => aktiv('iv'), aktiveRaf: () => aktiv('raf'), aktiveTimeouts: () => aktiv('to'),
        aktiveIntervallMs: () => [...timer.values()].filter(t => t.art === 'iv').map(t => t.ms).sort((a, b) => a - b),
        hoererAnzahl: t => (hoerer[t] || []).length, kopf
    };
}
module.exports = { lade, ROOT };
