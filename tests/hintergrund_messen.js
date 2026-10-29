/* ============================================================
   HINTERGRUND-MESSUNG IN ECHTEM CHROMIUM (Phase 6A, nur Messen). Start: node tests/hintergrund_messen.js [--kurz]
   Schreibt tests/hintergrund_laufzeit.json (Messstand). Braucht Playwright (nur lokal/Analyse, NICHT im CI-Pflichtlauf).
   Ändert keinen Produktcode: eine Messhülle (addInitScript) umschließt nur im Browser-Test setInterval/setTimeout/requestAnimationFrame/fetch/XHR/
   Storage/Sprache/Benachrichtigung und zählt, WER (Datei:Zeile aus dem Aufruf-Stapel) wie oft etwas tut. Die Seite sieht dasselbe Verhalten wie sonst.
   Alle /api/* werden mit leeren Antworten bedient, alles Fremde wird abgebrochen (aber gezählt): es entsteht kein echter Verkehr, keine echte Benachrichtigung.
   Läufe (je ein frischer Browser-Kontext):
     sichtbar   Start (10 s) + 60 s Leerlauf + danach Szenarien (Sprache, Erinnerungen, Termine, Dashboard/Wetter, KI, Panel-Wechsel, Doppelstart-Probe)
     versteckt  wie sichtbar, dann document.hidden = true (+ visibilitychange) und 60 s Leerlauf   -> misst NUR Jarvis' eigene Guards, nicht das Browser-Throttling
     nativ      wie sichtbar, aber mit einer ZaneNative-Attrappe (APK-Modus), zählt Brücken-Aufrufe
   Messgrenzen: kein echtes Hintergrund-Tab (Playwright/Chromium headless drosselt nicht wie ein verdecktes Tab), 3D-Avatar lädt von esm.sh (im Test nicht erreichbar),
   Zeiten sind echte Uhr (Schwankung), Netz/Native nur soweit die Attrappe reicht.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright').chromium; } catch (e2) { try { chromium = require(require('child_process').execSync('npm root -g').toString().trim() + '/@playwright/test').chromium; } catch (e3) { console.log('Playwright nicht gefunden – Messung nicht möglich.'); process.exit(3); } } }
const ROOT = path.join(__dirname, '..');
const ARG_AUS = (process.argv.find(a => a.startsWith('--aus=')) || '').slice(6);
const AUS = ARG_AUS ? path.resolve(ARG_AUS) : path.join(__dirname, 'hintergrund_laufzeit.json');
const KURZ = process.argv.includes('--kurz');
const IDLE_MS = KURZ ? 15000 : 60000, START_MS = KURZ ? 5000 : 10000, SZENARIO_MS = KURZ ? 3000 : 8000;
const warte = ms => new Promise(r => setTimeout(r, ms));

const MESSHUELLE = function (NATIV) {
    const H = window.__hg = { phase: 'laden', p: {}, versteckt: false, aktivIv: new Map(), aktivRaf: new Map(), tid: 0, cur: [] };
    const P = () => H.p[H.phase] || (H.p[H.phase] = { sites: {}, net: {}, store: { get: 0, set: 0, remove: 0 }, dom: 0, domAttr: 0, sprache: 0, audio: 0, benachr: 0, nativ: {}, wake: 0 });
    const Site = (s, k) => { const p = P(); return p.sites[s] || (p.sites[s] = { k, ms: {}, c: 0, f: 0, x: 0, ausCb: 0 }); };
    const stelle = (voll, ueberspringe) => { const st = String(new Error().stack || '').split('\n'), fs = []; for (const l of st) { const m = /\/js\/([\w.-]+\.js)(?:\?[^:\s)]*)?:(\d+):\d+/.exec(l); if (m && !/hintergrund/.test(l)) fs.push(m); } if (fs.length) { const w = (ueberspringe && fs.find(m => !/^(storage|boot)\.js$/.test(m[1]))) || fs[0]; return voll ? w[1] + ':' + w[2] : w[1]; } for (const l of st) { if (/index\.html:(\d+)/.test(l)) return 'index.html'; } return '(fremd/unbekannt)'; };
    H.stelle = stelle;
    const oSI = window.setInterval, oST = window.setTimeout, oCI = window.clearInterval, oCT = window.clearTimeout, oRAF = window.requestAnimationFrame, oCRAF = window.cancelAnimationFrame;
    const id2 = new Map();
    function huelle(site, kind, fn) { return function () { const s = Site(site, kind); s.f++; H.cur.push({ site, kind }); try { return fn.apply(this, arguments); } finally { H.cur.pop(); } }; }
    window.setInterval = function (fn, ms) {
        if (typeof fn !== 'function') return oSI.apply(this, arguments);
        const site = stelle(true), s = Site(site, 'iv'); s.c++; s.ms[+ms || 0] = 1; if (H.cur.length) s.ausCb++;
        const id = oSI.call(window, huelle(site, 'iv', fn), ms, ...Array.prototype.slice.call(arguments, 2)); H.aktivIv.set(id, { site, ms: +ms || 0 }); return id;
    };
    window.clearInterval = function (id) { if (H.aktivIv.has(id)) { const a = H.aktivIv.get(id); Site(a.site, 'iv').x++; H.aktivIv.delete(id); } return oCI.apply(this, arguments); };
    window.setTimeout = function (fn, ms) {
        if (typeof fn !== 'function') return oST.apply(this, arguments);
        const site = stelle(true) + '·t', s = Site(site, 'to'); s.c++; s.ms[+ms || 0] = 1; if (H.cur.length) s.ausCb++;
        const id = oST.call(window, huelle(site, 'to', fn), ms, ...Array.prototype.slice.call(arguments, 2)); return id;
    };
    window.clearTimeout = function (id) { return oCT.apply(this, arguments); };
    window.requestAnimationFrame = function (fn) {
        if (typeof fn !== 'function') return oRAF.apply(this, arguments);
        const site = stelle(true) + '·r', s = Site(site, 'raf'); s.c++; if (H.cur.length) s.ausCb++;
        const id = oRAF.call(window, function () { H.aktivRaf.delete(id); return huelle(site, 'raf', fn).apply(this, arguments); }); H.aktivRaf.set(id, site); return id;
    };
    window.cancelAnimationFrame = function (id) { if (H.aktivRaf.has(id)) { Site(H.aktivRaf.get(id), 'raf').x++; H.aktivRaf.delete(id); } return oCRAF.apply(this, arguments); };
    const zaehleNet = (url, art) => { const p = P(); let u; try { u = new URL(String(url), location.href); } catch (e) { u = { host: '', pathname: String(url).slice(0, 40), search: '' }; } const k = (u.host === location.host ? '' : u.host) + u.pathname + (/action=([\w_]+)/.exec(u.search || '') ? '?action=' + /action=([\w_]+)/.exec(u.search)[1] : ''); const e = p.net[k] || (p.net[k] = { n: 0, von: {}, ausTimer: 0 }); e.n++; const f = stelle(false, true); e.von[f] = (e.von[f] || 0) + 1; if (H.cur.length) e.ausTimer++; };
    const oFetch = window.fetch; window.fetch = function (u) { try { zaehleNet(u && u.url ? u.url : u, 'fetch'); } catch (e) { } return oFetch.apply(this, arguments); };
    const oOpen = XMLHttpRequest.prototype.open; XMLHttpRequest.prototype.open = function (m, u) { try { zaehleNet(u, 'xhr'); } catch (e) { } return oOpen.apply(this, arguments); };
    if (navigator.sendBeacon) { const ob = navigator.sendBeacon.bind(navigator); navigator.sendBeacon = function (u) { try { zaehleNet(u, 'beacon'); } catch (e) { } return ob.apply(null, arguments); }; }
    ['getItem', 'setItem', 'removeItem'].forEach(m => { const o = Storage.prototype[m]; Storage.prototype[m] = function () { try { const p = P(); p.store[m === 'getItem' ? 'get' : m === 'setItem' ? 'set' : 'remove']++; const f = stelle(false, true); p.storeVon = p.storeVon || {}; p.storeVon[f] = (p.storeVon[f] || 0) + 1; } catch (e) { } return o.apply(this, arguments); }; });
    try { const oSp = speechSynthesis.speak.bind(speechSynthesis); speechSynthesis.speak = function () { try { P().sprache++; } catch (e) { } return oSp.apply(null, arguments); }; } catch (e) { }
    try { const oPl = HTMLMediaElement.prototype.play; HTMLMediaElement.prototype.play = function () { try { P().audio++; } catch (e) { } return oPl.apply(this, arguments); }; } catch (e) { }
    try { const OldN = window.Notification; if (OldN) { window.Notification = function () { try { P().benachr++; } catch (e) { } return new OldN(...arguments); }; window.Notification.permission = OldN.permission; window.Notification.requestPermission = OldN.requestPermission.bind(OldN); } } catch (e) { }
    try { if (navigator.wakeLock) { const ow = navigator.wakeLock.request.bind(navigator.wakeLock); navigator.wakeLock.request = function () { try { P().wake++; } catch (e) { } return ow.apply(null, arguments); }; } } catch (e) { }
    // Schlüssel: Datei:Zeile für setInterval, Datei:Zeile·t für setTimeout, Datei:Zeile·r für requestAnimationFrame (mehrere Aufrufe in einer Zeile bleiben getrennt)
    // Sichtbarkeit steuerbar (nur im Test): misst Jarvis' eigene Guards, nicht das Throttling des Browsers
    Object.defineProperty(Document.prototype, 'hidden', { configurable: true, get() { return H.versteckt; } });
    Object.defineProperty(Document.prototype, 'visibilityState', { configurable: true, get() { return H.versteckt ? 'hidden' : 'visible'; } });
    H.verstecke = function (an) { H.versteckt = !!an; document.dispatchEvent(new Event('visibilitychange')); };
    document.addEventListener('DOMContentLoaded', () => { try { new MutationObserver(ms => { const p = P(); ms.forEach(m => { if (m.type === 'attributes') p.domAttr++; else p.dom++; }); }).observe(document.documentElement, { childList: true, subtree: true, attributes: true, characterData: true }); } catch (e) { } });
    if (NATIV) {
        window.ZaneNative = new Proxy({ _w: '' }, { get: (t, k) => {
            if (typeof k !== 'string') return undefined;
            if (k === 'schlafStand') return () => { const p = P(); p.nativ[k] = (p.nativ[k] || 0) + 1; return JSON.stringify({ an: false }); };
            if (k === 'vertretungStand') return () => { const p = P(); p.nativ[k] = (p.nativ[k] || 0) + 1; return JSON.stringify({ an: false, minuten: 5 }); };
            return function () { const p = P(); const key = k + '@' + stelle(false); p.nativ[key] = (p.nativ[key] || 0) + 1; if (k === 'wissenListe') return t._w; if (k === 'wissenSetzen') { t._w = String(arguments[0] || ''); return; } return ''; };
        } });
    }
    H.setPhase = function (n) { H.phase = n; P(); };
    H.aktiv = function () { const iv = {}; H.aktivIv.forEach(a => { const k = a.site + ' @' + a.ms; iv[k] = (iv[k] || 0) + 1; }); const raf = {}; H.aktivRaf.forEach(s => { raf[s] = (raf[s] || 0) + 1; }); return { iv, raf }; };
};

function sortiere(o) { if (Array.isArray(o)) return o.map(sortiere); if (o && typeof o === 'object') { const r = {}; Object.keys(o).sort().forEach(k => { r[k] = sortiere(o[k]); }); return r; } return o; }

async function lauf(browser, port, name, opt) {
    const ctx = await browser.newContext({ serviceWorkers: 'block' }); const page = await ctx.newPage();
    const extern = []; let phase = 'laden';
    page.on('request', rq => { const u = rq.url(); if (!u.startsWith('http://localhost:' + port)) { try { const x = new URL(u); extern.push(phase + '|' + x.host); } catch (e) { } } });
    page.on('console', m => { if (m.type() === 'error') (page.__konsole = page.__konsole || []).push(phase + '|' + String(m.text()).slice(0, 110)); });
    page.on('pageerror', e => { (page.__fehler = page.__fehler || []).push('pageerror: ' + String(e.message).slice(0, 90)); });
    await ctx.route('**/*', async r => {
        const u = r.request().url();
        if (!u.startsWith('http://localhost:' + port)) return r.abort();
        if (/\/api\//.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
        return r.continue();
    });
    await page.addInitScript(MESSHUELLE, !!opt.nativ);
    if (opt.startVersteckt) await page.addInitScript(() => { window.__hgVersteckt = true; });
    await page.goto('http://localhost:' + port + '/index.html', { waitUntil: 'load' });
    if (opt.startVersteckt) await page.evaluate(() => { window.__hg.versteckt = true; });
    const setPhase = async n => { phase = n; await page.evaluate(n => window.__hg.setPhase(n), n); };
    const ergebnis = { phasen: {}, aktiv: {} };
    const ende = async n => { ergebnis.aktiv[n] = await page.evaluate(() => window.__hg.aktiv()); };
    await setPhase('start'); await warte(START_MS); await ende('start');
    await setPhase('idle'); await warte(IDLE_MS); await ende('idle');
    if (opt.versteckenDanach) {
        await page.evaluate(() => window.__hg.verstecke(true));
        await setPhase('idle_versteckt'); await warte(IDLE_MS); await ende('idle_versteckt');
        await page.evaluate(() => window.__hg.verstecke(false));
        // Phase 6B.1: Rückkehr und 10 schnelle Sichtbarkeitswechsel (Aktive Intervalle danach = Anzahl darf nicht wachsen)
        await setPhase('rueckkehr'); await warte(KURZ ? 2000 : 5000); await ende('rueckkehr');
        await setPhase('wechsel10');
        for (let i = 0; i < 10; i++) { await page.evaluate(() => window.__hg.verstecke(true)); await warte(300); await page.evaluate(() => window.__hg.verstecke(false)); await warte(300); }
        await ende('wechsel10');
        await setPhase('nach_wechsel'); await warte(KURZ ? 2000 : 5000); await ende('nach_wechsel');
    }
    if (opt.szenarien) {
        const S = async (n, js) => { await setPhase(n); try { await page.evaluate(js); } catch (e) { (ergebnis.szenarioFehler = ergebnis.szenarioFehler || {})[n] = String(e.message).slice(0, 80); } await warte(SZENARIO_MS); await ende(n); };
        await S('sprache', () => { if (typeof speak === 'function') speak('Das ist ein Test.'); });
        await S('erinnerungen', () => { openPanel('erinnerungen'); });
        await S('termine_heute', () => { openPanel('termine'); });
        await S('dashboard_wetter', () => { openPanel('dashboard'); });
        await S('ki_anfrage', () => { return sendToGroqSmart('Hallo, erzähl mir einen Witz'); });
        await S('panel_wechsel', async () => { for (const n of ['settings', 'adressen', 'einkauf', 'gedaechtnis', 'planer', 'nachrichten']) { openPanel(n); await new Promise(r => setTimeout(r, 400)); } });
        // Doppelstart-Probe: dasselbe Panel mehrfach öffnen/schließen; Anzahl aktiver Intervalle vorher/nachher
        await setPhase('doppelstart_vorher'); await ende('doppelstart_vorher');
        await S('doppelstart_6x', async () => { for (let i = 0; i < 6; i++) { openPanel('erinnerungen'); await new Promise(r => setTimeout(r, 300)); if (typeof closePanel === 'function') closePanel(); await new Promise(r => setTimeout(r, 300)); } });
    }
    for (const n of Object.keys(await page.evaluate(() => window.__hg.p))) { }
    ergebnis.phasen = await page.evaluate(() => window.__hg.p);
    ergebnis.extern = extern.reduce((a, k) => { a[k] = (a[k] || 0) + 1; return a; }, {});
    ergebnis.seitenfehler = page.__fehler || [];
    ergebnis.konsole = page.__konsole || [];
    await ctx.close();
    return ergebnis;
}

(async () => {
    const port = 8770 + Math.floor(Math.random() * 100);
    const srv = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
    await warte(1200);
    const browser = await chromium.launch();
    try {
        const t0 = Date.now();
        const [sichtbar, versteckt, nativ, startVersteckt] = await Promise.all([
            lauf(browser, port, 'sichtbar', { szenarien: true }),
            lauf(browser, port, 'versteckt', { versteckenDanach: true }),
            lauf(browser, port, 'nativ', { nativ: true }),
            lauf(browser, port, 'startVersteckt', { startVersteckt: true })
        ]);
        const out = { gemessen: new Date().toISOString().slice(0, 10), modus: KURZ ? 'kurz' : 'voll', fensterMs: { start: START_MS, idle: IDLE_MS, szenario: SZENARIO_MS }, dauerMs: Date.now() - t0, lauf: { sichtbar, versteckt, nativ, startVersteckt } };
        if (!KURZ) fs.writeFileSync(AUS, JSON.stringify(sortiere(out), null, 1) + '\n');
        else fs.writeFileSync((process.env.HG_KURZ_AUS || '/tmp/hintergrund_kurz.json'), JSON.stringify(sortiere(out), null, 1));
        console.log((KURZ ? 'Kurzmessung' : 'Messstand geschrieben: tests/hintergrund_laufzeit.json') + ' (' + Math.round(out.dauerMs / 1000) + ' s)');
    } finally { await browser.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
