/* ============================================================
   PHASE 7A: GEDÄCHTNIS-MESSUNG IN ECHTEM CHROMIUM (nur Messen). Start: node tests/memory7a_messen.js [--aus=<Datei>]
   Schreibt tests/memory7a_laufzeit.json. Braucht Playwright (nur lokal/Analyse, NICHT im CI-Pflichtlauf).
   Ändert keinen Produktcode. Eine Messhülle (addInitScript) zählt im Browser nur: Zugriffe auf localStorage für die Gedächtnis-Schlüssel
   (helfer_memory, helfer_memory_zeit, helfer_sync_meta) je Phase und die Aufrufe des 3-Sekunden-Takts (ensureProxy).
   KEINE echten Nutzerdaten: der Speicher bekommt künstliche Testeinträge (testschluessel, testbrille). /api/sync ist eine Attrappe im Test
   (nimmt neuere Zeitstempel an, kann Fehler liefern), /api/memory liefert leere Antworten, alles Fremde wird abgebrochen.
   Phasen: start, ruhe12s, hinzufuegen, aendern, schnell5, loeschen, neustart (Seite neu laden), sync_neuer (Server hat neueren Stand),
           versteckt (Referenz ersetzen, während document.hidden), serverfehler, kaputtes_json (danach wieder gültig).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
let chromium; try { chromium = require('playwright').chromium; } catch (e) { try { chromium = require(require('child_process').execSync('npm root -g').toString().trim() + '/playwright').chromium; } catch (e2) { console.log('Playwright fehlt: Messung übersprungen (nur lokal nötig).'); process.exit(0); } }
const ROOT = path.join(__dirname, '..');
const ARG_AUS = (process.argv.find(a => a.startsWith('--aus=')) || '').slice(6);
const AUS = ARG_AUS ? path.resolve(ARG_AUS) : path.join(__dirname, 'memory7a_laufzeit.json');
const warte = ms => new Promise(r => setTimeout(r, ms));
const TESTMEM = { testschluessel: 'testplatz eins', testbrille: 'testplatz zwei' };

const MESSHUELLE = function (testmem) {
    const H = window.__m7 = { phase: 'laden', st: {}, ticks: {}, ep: null };
    const MK = /^(helfer_memory|helfer_memory_zeit|helfer_sync_meta)$/;
    const zaehle = (m, k) => { if (!MK.test(k)) return; const p = (H.st[H.phase] = H.st[H.phase] || {}); const q = (p[k] = p[k] || { get: 0, set: 0, remove: 0 }); q[m]++; };
    [['getItem', 'get'], ['setItem', 'set'], ['removeItem', 'remove']].forEach(([m, n]) => { const o = Storage.prototype[m]; Storage.prototype[m] = function (k) { try { if (this === window.localStorage) zaehle(n, k); } catch (e) { } return o.apply(this, arguments); }; });
    const oSI = window.setInterval;
    window.setInterval = function (fn, ms) {
        if (typeof fn === 'function' && fn.name === 'ensureProxy') { const w = function () { H.ticks[H.phase] = (H.ticks[H.phase] || 0) + 1; return fn.apply(this, arguments); }; H.ep = { ms: +ms, angelegt: (H.ep ? H.ep.angelegt : 0) + 1 }; return oSI.call(window, w, ms); }
        return oSI.apply(this, arguments);
    };
    H.setPhase = n => { H.phase = n; };
    // Testdaten nur beim allerersten Laden (nicht bei jedem Neuladen)
    try { if (!localStorage.getItem('__m7a_gesetzt')) { localStorage.setItem('__m7a_gesetzt', '1'); localStorage.setItem('helfer_memory', JSON.stringify(testmem)); localStorage.setItem('app_secret', 'testcode'); } } catch (e) { }
};

function sortiere(o) { if (Array.isArray(o)) return o.map(sortiere); if (o && typeof o === 'object') { const r = {}; Object.keys(o).sort().forEach(k => { r[k] = sortiere(o[k]); }); return r; } return o; }

(async () => {
    const port = 8870 + Math.floor(Math.random() * 100);
    const srv = spawn('python3', ['-m', 'http.server', String(port)], { cwd: ROOT, stdio: 'ignore' });
    await warte(1200);
    const browser = await chromium.launch();
    const ergebnis = { phasen: {}, schnappschuss: {} };
    const server = { items: {}, modus: 'ok', anfragen: [] };
    try {
        const ctx = await browser.newContext({ serviceWorkers: 'block' }); const page = await ctx.newPage();
        const konsole = [], seitenfehler = [], extern = {};
        let phase = 'laden';
        page.on('console', m => { if (m.type() === 'error') konsole.push(phase + '|' + String(m.text()).slice(0, 110)); });
        page.on('pageerror', e => { seitenfehler.push(phase + '|' + String(e.message).slice(0, 90)); });
        await ctx.route('**/*', async r => {
            const u = r.request().url();
            if (!u.startsWith('http://localhost:' + port)) { try { const x = new URL(u).host; extern[x] = (extern[x] || 0) + 1; } catch (e) { } return r.abort(); }
            if (/\/api\/sync/.test(u)) {
                const m = r.request().method(); let body = null; try { body = JSON.parse(r.request().postData() || 'null'); } catch (e) { }
                server.anfragen.push(phase + '|' + m + (body && body.items ? ':' + Object.keys(body.items).join(',') : ''));
                if (server.modus === '500') return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Server kaputt' }) });
                if (m === 'POST' && body && body.items) for (const k of Object.keys(body.items)) { const c = server.items[k], n = body.items[k]; if (!c || n.ts >= c.ts) server.items[k] = n; }
                return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ items: server.items }) });
            }
            if (/\/api\/memory/.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
            if (/\/api\//.test(u)) return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
            return r.continue();
        });
        await page.addInitScript(MESSHUELLE, TESTMEM);
        const setPhase = async n => { phase = n; await page.evaluate(n => window.__m7.setPhase(n), n); };
        const lies = () => page.evaluate(() => {
            const o = { typ: typeof memoryItems, proxy: !!(memoryItems && memoryItems.__jvZeitProxy), schluessel: Object.keys(memoryItems || {}).sort() };
            try { o.zeit = Object.keys(JSON.parse(localStorage.getItem('helfer_memory_zeit') || '{}')).sort(); } catch (e) { o.zeit = 'KAPUTT'; }
            try { o.gespeichert = Object.keys(JSON.parse(localStorage.getItem('helfer_memory') || '{}')).sort(); } catch (e) { o.gespeichert = 'KAPUTT'; }
            return o;
        }).catch(e => ({ fehler: String(e.message).slice(0, 80) }));
        const gesamt = { st: {}, ticks: {}, ep: null };
        const sammle = async () => {   // vor jedem Neuladen die Zähler der alten Seite einsammeln
            const x = await page.evaluate(() => ({ st: window.__m7.st, ticks: window.__m7.ticks, ep: window.__m7.ep })).catch(() => null); if (!x) return;
            for (const ph of Object.keys(x.st)) { gesamt.st[ph] = gesamt.st[ph] || {}; for (const k of Object.keys(x.st[ph])) { const g = gesamt.st[ph][k] = gesamt.st[ph][k] || { get: 0, set: 0, remove: 0 }; for (const m of ['get', 'set', 'remove']) g[m] += x.st[ph][k][m]; } }
            for (const ph of Object.keys(x.ticks)) gesamt.ticks[ph] = (gesamt.ticks[ph] || 0) + x.ticks[ph];
            if (x.ep) gesamt.ep = { ms: x.ep.ms, angelegtProSeite: x.ep.angelegt };
        };
        const ex = (js, arg) => page.evaluate(js, arg).catch(e => ({ fehler: String(e.message).slice(0, 80) }));
        const aktion = a => ex(async a => { const c = { counter: 0, cards: [], notes: [], panel: null }; try { await executeAction(a, 'Merk dir ' + (a.memory_key || ''), c); return 'ok'; } catch (e) { return 'fehler: ' + String(e.userMessage || e.message); } }, a);

        await page.goto('http://localhost:' + port + '/index.html', { waitUntil: 'load' });
        // 1) Start: Testdaten laden, erster Abgleich (nach 1,5 s) läuft mit
        await setPhase('start'); await warte(4500);
        ergebnis.schnappschuss.start = await lies();
        await ex(() => { window.__r0 = memoryItems; return true; });
        // 2) Ruhe: mindestens 12 s, damit der 3-s-Takt mehrfach auftritt
        await setPhase('ruhe12s'); await warte(12500);
        ergebnis.schnappschuss.ruhe = Object.assign(await lies(), { referenzGleich: await ex(() => window.__r0 === memoryItems) });
        // 3) Eintrag hinzufügen
        await setPhase('hinzufuegen'); ergebnis.hinzufuegen = await aktion({ type: 'memory_store', memory_key: 'testneu', memory_value: 'testwert eins' });
        ergebnis.schnappschuss.hinzufuegen = Object.assign(await lies(), { referenzGleich: await ex(() => window.__r0 === memoryItems) });
        // 4) Eintrag ändern
        await warte(1100); await setPhase('aendern'); await aktion({ type: 'memory_store', memory_key: 'testneu', memory_value: 'testwert zwei' });
        ergebnis.schnappschuss.aendern = Object.assign(await lies(), { wert: await ex(() => memoryItems.testneu), referenzGleich: await ex(() => window.__r0 === memoryItems) });
        // 5) fünf schnelle Änderungen hintereinander
        await setPhase('schnell5'); await ex(async () => { const c = () => ({ counter: 0, cards: [], notes: [], panel: null }); await Promise.all([1, 2, 3, 4, 5].map(i => executeAction({ type: 'memory_store', memory_key: 'testschnell' + i, memory_value: 'w' + i }, 'x', c()))); return true; });
        ergebnis.schnappschuss.schnell5 = Object.assign(await lies(), { referenzGleich: await ex(() => window.__r0 === memoryItems) });
        // 6) löschen
        await setPhase('loeschen'); await aktion({ type: 'list_edit', list_name: 'gedaechtnis', list_op: 'remove', list_items: ['testneu'] });
        ergebnis.schnappschuss.loeschen = Object.assign(await lies(), { referenzGleich: await ex(() => window.__r0 === memoryItems) });
        await warte(3000);   // der verzögerte Abgleich (2,5 s nach der letzten Änderung) läuft
        ergebnis.serverNachAbgleich = Object.keys(server.items.helfer_memory ? JSON.parse(server.items.helfer_memory.v) : {}).sort();
        // 7) Neustart (Seite neu laden)
        await setPhase('neustart_vorher'); const vorher = await lies();
        await sammle(); await page.reload({ waitUntil: 'load' }); await setPhase('neustart'); await warte(4500);
        ergebnis.schnappschuss.neustart = Object.assign(await lies(), { gleicheSchluesselWieVorher: JSON.stringify((await lies()).schluessel) === JSON.stringify(vorher.schluessel) });
        // 8) Server hat einen neueren Stand: Abgleich ersetzt die Liste
        await ex(() => { window.__r1 = memoryItems; return true; });
        server.items.helfer_memory = { v: JSON.stringify({ testschluessel: 'vom server', testfern: 'fern' }), ts: Date.now() + 60000 };
        await setPhase('sync_neuer'); await ex(() => { syncNow(); return true; }); await warte(700);
        ergebnis.schnappschuss.sync_neuer_direkt = Object.assign(await lies(), { referenzGleich: await ex(() => window.__r1 === memoryItems) });
        await warte(3600);
        ergebnis.schnappschuss.sync_neuer_nach3s = Object.assign(await lies(), { referenzGleich: await ex(() => window.__r1 === memoryItems) });
        // 9) versteckt: Referenz wird ersetzt, der Takt hat keinen Sichtbarkeitsschutz
        await ex(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); return true; });
        await ex(() => { memoryItems = JSON.parse(JSON.stringify(memoryItems)); return true; });
        ergebnis.schnappschuss.versteckt_direkt = await lies();
        await setPhase('versteckt'); await warte(7000);
        ergebnis.schnappschuss.versteckt_nach7s = await lies();
        await ex(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); return true; });
        // 10) Serverfehler: lokaler Stand bleibt
        await setPhase('serverfehler'); server.modus = '500'; const vorFehler = await lies();
        server.items.helfer_memory = { v: JSON.stringify({ leer: 'x' }), ts: Date.now() + 120000 };
        await ex(() => { syncNow(); return true; }); await warte(800);
        ergebnis.schnappschuss.serverfehler = Object.assign(await lies(), { unveraendert: JSON.stringify((await lies()).schluessel) === JSON.stringify(vorFehler.schluessel) });
        server.modus = 'ok';
        // 11) kaputtes JSON im Speicher (Server nicht erreichbar, damit der Abgleich nichts heilt), dann Neuladen
        await ex(() => { localStorage.setItem('helfer_memory', '{kaputt'); return true; });
        server.modus = '500'; await setPhase('kaputtes_json'); await sammle(); await page.reload({ waitUntil: 'load' }); await warte(3500);
        const zustandKaputt = () => ex(() => ({ memoryItems: (() => { try { return typeof memoryItems; } catch (e) { return 'FEHLER ' + e.name; } })(), kontakte: (() => { try { return typeof savedContacts; } catch (e) { return 'FEHLER ' + e.name; } })(), chatHistory: (() => { try { return typeof chatHistory; } catch (e) { return 'FEHLER ' + e.name; } })(), speicher: localStorage.getItem('helfer_memory') }));
        ergebnis.schnappschuss.kaputtes_json = await zustandKaputt();
        // 12) der Server hat wieder einen guten, neueren Stand: der Abgleich heilt den Speicher, der Arbeitsspeicher bleibt bis zum nächsten Neuladen kaputt
        server.modus = 'ok'; server.items.helfer_memory = { v: JSON.stringify({ testgeheilt: 'vom server' }), ts: Date.now() + 300000 };
        await setPhase('kaputt_geheilt'); await ex(() => { syncNow(); return true; }); await warte(900);
        ergebnis.schnappschuss.kaputt_geheilt = await zustandKaputt();
        await sammle(); await page.reload({ waitUntil: 'load' }); await setPhase('nach_reparatur'); await warte(3500);
        ergebnis.schnappschuss.nach_reparatur = await lies();

        await sammle(); ergebnis.phasen = gesamt;
        ergebnis.serverAnfragen = server.anfragen.length;
        ergebnis.extern = extern; ergebnis.seitenfehler = seitenfehler; ergebnis.konsole = konsole;
        await ctx.close();
        const out = { gemessen: new Date().toISOString().slice(0, 10), ergebnis };
        fs.writeFileSync(AUS, JSON.stringify(sortiere(out), null, 1) + '\n');
        console.log('Messstand geschrieben: ' + path.relative(ROOT, AUS));
    } finally { await browser.close(); srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
