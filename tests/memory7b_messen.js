/* ============================================================
   PHASE 7B: CHROMIUM-MESSUNG (nur lokal, nicht im CI-Pflichtlauf). Start: node tests/memory7b_messen.js [--aus=<Datei>]
   Schreibt tests/memory7b_laufzeit.json. KEINE echten Nutzerdaten: künstliche Einträge (schlüssel, zweitschlüssel, Kontakt "Testoma").
   Teil A: Zeitfrage nach "Zweitschlüssel" bei vorhandenem "schlüssel" (Sprachausgabe wird abgefangen).
   Teil B: ungültiges helfer_memory setzen, neu laden: App startet weiter? Kontakte/Tageslog da? Originalwert unverändert? neue Schreibzugriffe? Konsole?
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { chromium = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright').chromium; }
const ROOT = path.join(__dirname, '..');
const ARG = (process.argv.find(a => a.startsWith('--aus=')) || '').slice(6);
const AUS = ARG ? path.resolve(ARG) : path.join(__dirname, 'memory7b_laufzeit.json');
const warte = ms => new Promise(r => setTimeout(r, ms));
const MEM = { 'schlüssel': 'unter dem Testkissen', 'zweitschlüssel': 'im Testtopf' };
const ZEIT = { 'schlüssel': '2026-10-01T08:00:00.000Z', 'zweitschlüssel': '2026-10-02T09:30:00.000Z' };
const HUELLE = function (d) {
    const H = window.__m7b = { schreib: {} };
    const MK = /^(helfer_memory|helfer_memory_zeit|helfer_contacts|jv_tageslog)$/;
    [['setItem', 's'], ['removeItem', 'r']].forEach(([m, n]) => { const o = Storage.prototype[m]; Storage.prototype[m] = function (k) { try { if (this === window.localStorage && MK.test(k)) { H.schreib[k] = H.schreib[k] || { s: 0, r: 0 }; H.schreib[k][n]++; } } catch (e) { } return o.apply(this, arguments); }; });
    try { if (!localStorage.getItem('__m7b_gesetzt')) { localStorage.setItem('__m7b_gesetzt', '1'); for (const k of Object.keys(d)) localStorage.setItem(k, d[k]); H.schreib = {}; } } catch (e) { }
};
(async () => {
    const port = 8970 + Math.floor(Math.random() * 100);
    const srv = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
    await warte(1200);
    const browser = await chromium.launch(), erg = { zeitfrage: {}, kaputt: {} };
    try {
        const ctx = await browser.newContext({ serviceWorkers: 'block' }), page = await ctx.newPage();
        const konsole = [], seitenfehler = []; let phase = 'laden';
        page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') konsole.push(phase + '|' + m.type() + '|' + String(m.text()).slice(0, 120)); });
        page.on('pageerror', e => seitenfehler.push(phase + '|' + String(e.message).slice(0, 90)));
        await ctx.route('**/*', r => { const u = r.request().url(); if (!u.startsWith('http://localhost:' + port)) return r.abort(); if (/\/api\//.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }); return r.continue(); });
        await page.addInitScript(HUELLE, { helfer_memory: JSON.stringify(MEM), helfer_memory_zeit: JSON.stringify(ZEIT), helfer_contacts: JSON.stringify({ testoma: { originalName: 'Testoma' } }) });
        await page.goto('http://localhost:' + port + '/index.html'); await warte(4000);
        // Teil A
        phase = 'zeitfrage';
        const sag = async frage => page.evaluate(f => { const g = []; const o = window.speak; window.speak = t => { g.push(String(t)); }; let r; try { r = window.handleGedaechtnisZeitCommand(f); } finally { window.speak = o; } return { behandelt: r, gesagt: g }; }, frage);
        erg.zeitfrage.zweit = await sag('wann habe ich den zweitschlüssel abgelegt');
        erg.zeitfrage.erst = await sag('wann habe ich den schlüssel abgelegt');
        erg.zeitfrage.keiner = await sag('wann habe ich den hammer abgelegt');
        // Teil B
        phase = 'kaputt';
        await page.evaluate(() => { localStorage.setItem('helfer_memory', '{kaputt'); window.__m7b.schreib = {}; });
        await page.evaluate(() => { try { sessionStorage.removeItem('helfer_memory'); } catch (e) { } });
        const vorher = '{kaputt';
        await page.reload(); await warte(4500);
        erg.kaputt = await page.evaluate(() => {
            const t = n => { try { return eval('typeof ' + n); } catch (e) { return 'FEHLER'; } };
            return {
                memoryItems: t('memoryItems'), schluessel: (() => { try { return Object.keys(memoryItems); } catch (e) { return 'FEHLER'; } })(),
                kontakte: (() => { try { return Object.keys(savedContacts); } catch (e) { return 'FEHLER'; } })(),
                chatHistory: t('chatHistory'), originalWert: localStorage.getItem('helfer_memory'),
                schreibzugriffe: window.__m7b.schreib, proxy: (() => { try { return memoryItems.__jvZeitProxy === true; } catch (e) { return 'FEHLER'; } })()
            };
        });
        erg.kaputt.originalGleich = erg.kaputt.originalWert === vorher;
        erg.konsole = konsole; erg.seitenfehler = seitenfehler; erg.gemessen = new Date().toISOString().slice(0, 10);
        fs.writeFileSync(AUS, JSON.stringify(erg, null, 1) + '\n'); console.log('Messstand geschrieben: ' + AUS);
    } finally { await browser.close(); srv.kill(); }
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
