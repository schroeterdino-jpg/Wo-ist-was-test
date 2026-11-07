/* Echter Browser-Test (Chromium über Playwright) für die Studio-Bildverwaltung (Phase 1) mit der ECHTEN Jarvis-Hauptseite.
   Start: node tools/studio_bilder_check.js   (TAILWIND_JS wie bei tools/studio_vorschau_check.js)
   Geprüft mit echter IndexedDB, echtem Canvas, echter Datei-Auswahl (setInputFiles auf den Knopf „Foto hinzufügen“), echtem Sandbox-Rahmen:
   Verkleinern, Speichern, Vorschau zeigt das Foto, Neuladen, ZIP-Download, Offline, EXIF/Ortsdaten entfernt, abgelehnte Dateien, Entfernen, Löschen.
   Nicht Teil der automatischen Tests (braucht einen Browser). */
'use strict';
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..'), TW = process.env.TAILWIND_JS || '/opt/npm-tools/node_modules/@zenuml/core/dist/vendor/tailwindcss/tailwindcss.js';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let ok = 0, fehler = 0;
function check(n, b, info) { if (b) { ok++; console.log('✓ ' + n); } else { fehler++; console.log('✗ ' + n + (info !== undefined ? ' → ' + JSON.stringify(info).slice(0, 400) : '')); } }
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sbc-'));
(async () => {
    const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block', acceptDownloads: true }); const page = await ctx.newPage();
    const fehlerSeite = []; page.on('pageerror', e => fehlerSeite.push(String(e.message).slice(0, 200)));
    const extern = []; page.on('request', r => { const u = new URL(r.url()); if (!/^(jarvis\.test|cdn\.tailwindcss\.com|accounts\.google\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)$/.test(u.host) && !/^(data|blob|about):/.test(r.url())) extern.push(r.url()); });
    await page.route('**/*', rt => { const u = new URL(rt.request().url());
        if (u.host === 'cdn.tailwindcss.com') return rt.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(TW) });
        if (u.host === 'jarvis.test') { const p = u.pathname === '/' ? '/index.html' : u.pathname; const f = path.join(ROOT, decodeURIComponent(p)); if (fs.existsSync(f) && fs.statSync(f).isFile()) return rt.fulfill({ contentType: MIME[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) }); return rt.fulfill({ status: 404, body: 'nf' }); }
        return rt.abort(); });
    const laden = async () => { await page.goto('http://jarvis.test/'); await page.waitForFunction(() => window.jvStudioAnsicht && window.jvStudioBilder && window.jvStudioProjekte, null, { timeout: 25000 }); await page.waitForTimeout(500); };
    await laden();
    await page.evaluate(() => { try { indexedDB.deleteDatabase('jv_studio_bilder'); localStorage.removeItem('jv_studio_projekte_v1'); } catch (e) { } }); await laden();
    check('Browser: Bildverwaltung ist verfügbar (IndexedDB + Canvas)', await page.evaluate(() => window.jvStudioBilder.verfuegbar()));

    /* Testfoto: 4032x3024, Verlauf mit Kreisen + Rauschen, als JPEG; dazu eine Fassung mit eingebauten EXIF-/Ortsdaten */
    const jpeg = await page.evaluate(async () => {
        const c = document.createElement('canvas'); c.width = 4032; c.height = 3024; const g = c.getContext('2d');
        const v = g.createLinearGradient(0, 0, 4032, 3024); v.addColorStop(0, '#f6a800'); v.addColorStop(1, '#1a3a6e'); g.fillStyle = v; g.fillRect(0, 0, 4032, 3024);
        for (let i = 0; i < 400; i++) { g.fillStyle = 'hsla(' + (i * 37 % 360) + ',70%,50%,.5)'; g.beginPath(); g.arc((i * 997) % 4032, (i * 613) % 3024, 20 + (i % 90), 0, 7); g.fill(); }
        const id = g.getImageData(0, 0, 4032, 3024); for (let i = 0; i < id.data.length; i += 4) { const r = (Math.random() * 40) | 0; id.data[i] += r; id.data[i + 1] += r; id.data[i + 2] += r; } g.putImageData(id, 0, 0);
        const bl = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.95)); return Array.from(new Uint8Array(await bl.arrayBuffer()));
    });
    const roh = Buffer.from(jpeg); const exif = Buffer.from('Exif\0\0MM GPSLatitude 52.5200 GPSLongitude 13.4050 Samsung SM-S938B', 'latin1');
    const app1 = Buffer.concat([Buffer.from([0xFF, 0xE1, (exif.length + 2) >> 8, (exif.length + 2) & 255]), exif]);
    const mitExif = Buffer.concat([roh.subarray(0, 2), app1, roh.subarray(2)]);
    fs.writeFileSync(path.join(tmp, 'Urlaub Strand.jpg'), mitExif);
    fs.writeFileSync(path.join(tmp, 'boese.jpg'), '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    check('Testfoto ist ein echtes großes Handyfoto (> 2 MB)', mitExif.length > 2e6, mitExif.length);

    const pid = await page.evaluate(() => { const p = window.jvStudioProjekte.neu({ name: 'Fototest', art: 'webseite', auftrag: 'x', dateien: [{ pfad: 'index.html', inhalt: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>T</title></head><body><main><h1>Hallo</h1></main></body></html>' }] }); window.jvStudioAnsicht.zeigeProjekt(p.projekt.id); return p.projekt.id; });
    await page.waitForTimeout(400);
    const eingabe = page.locator('#studioKarte input[type=file], input[type=file][aria-label*="Foto"]').first();
    check('Oberfläche: Knopf „Foto hinzufügen“ mit Dateiauswahl vorhanden', (await eingabe.count()) === 1);
    check('Oberfläche: Auswahl erlaubt Bilder und mehrere Dateien', await eingabe.evaluate(e => /image/.test(e.accept) && e.multiple));

    /* 1 Foto vom "Handy" wählen */
    const t0 = Date.now(); await eingabe.setInputFiles(path.join(tmp, 'Urlaub Strand.jpg'));
    await page.waitForFunction(id => (window.jvStudioProjekte.hole(id).dateien || []).length === 2, pid, { timeout: 30000 }); const dauer = Date.now() - t0;
    const pr = await page.evaluate(id => window.jvStudioProjekte.hole(id), pid); const f = pr.dateien.find(x => x.bildId);
    check('Foto angenommen: Verweis im Projekt, Name bereinigt', f && f.pfad === 'bilder/urlaub-strand.jpg' && f.inhalt === '', f);
    check('Foto verkleinert (höchstens 1600 Pixel, unter 350 KB)', f && Math.max(f.w, f.h) <= 1600 && f.bytes <= 350000, f && { w: f.w, h: f.h, b: f.bytes });
    console.log('  (Verarbeitung ' + (dauer / 1000).toFixed(1) + ' s für ' + Math.round(mitExif.length / 1e6) + ' MB)');
    check('Foto steht im HTML (img mit alt, width, height)', /<img src="bilder\/urlaub-strand.jpg" alt="Foto" width="\d+" height="\d+"/.test(pr.dateien[0].inhalt));
    const ls = await page.evaluate(() => (localStorage.getItem('jv_studio_projekte_v1') || '').length);
    check('localStorage: Projekte bleiben winzig (keine Bilddaten)', ls < 4000, ls);
    const idb = await page.evaluate(() => new Promise(r => { const q = indexedDB.open('jv_studio_bilder'); q.onsuccess = () => { const a = q.result.transaction('bilder').objectStore('bilder').getAll(); a.onsuccess = () => r(a.result.map(x => ({ id: x.id, p: x.projektId, n: x.daten.byteLength, d: Array.from(new Uint8Array(x.daten.slice(0, 4000))) }))); }; }));
    check('IndexedDB: genau ein Foto, dem Projekt zugeordnet', idb.length === 1 && idb[0].p === pid && idb[0].n === f.bytes, idb.map(x => ({ p: x.p, n: x.n })));
    const kopf = Buffer.from(idb[0].d).toString('latin1');
    check('Datenschutz: EXIF und Ortsdaten sind weg', !/Exif|GPSLat|Samsung/.test(kopf) && idb[0].d[0] === 0xFF && idb[0].d[1] === 0xD8);
    const mel = await page.locator('#studioKarte').innerText().catch(() => '');
    check('Rückmeldung im Studio: „1 Foto hinzugefügt“', /1 Foto hinzugefügt/.test(mel), mel.slice(0, 200));

    /* 2 Vorschau */
    const vorschau = async () => {
        await page.evaluate(id => window.jvStudioAnsicht.aktion('vorschau', id), pid);
        await page.waitForSelector('#studioVorschau iframe', { timeout: 8000 });
        let fr = page.frames().filter(x => x !== page.mainFrame()).pop();
        for (let i = 0; i < 75; i++) { await page.waitForTimeout(200); fr = page.frames().filter(x => x !== page.mainFrame()).pop(); try { if (await fr.evaluate(() => { const i = document.querySelector('img'); return !!i && i.complete; })) break; } catch (e) { } }
        const r = await fr.evaluate(() => { const i = document.querySelector('img'); return i ? { ok: i.complete && i.naturalWidth > 0, c: i.complete, len: i.getAttribute('src').length, w: i.naturalWidth, h: i.naturalHeight, src: i.getAttribute('src').slice(0, 20) } : null; });
        const sb = await page.evaluate(() => document.querySelector('#studioVorschau iframe').getAttribute('sandbox'));
        return { r, sb };
    };
    let v = await vorschau();
    check('Vorschau: das Foto wird wirklich angezeigt (Breite > 0)', v.r && v.r.ok && v.r.w === f.w && v.r.h === f.h && /^data:image\/jpeg/.test(v.r.src), v);
    check('Vorschau: Sandbox unverändert (ohne allow-same-origin)', v.sb === 'allow-scripts allow-forms allow-modals', v.sb);

    /* 3 Neuladen = Neustart der App */
    await laden();
    v = await vorschau();
    check('Nach Neuladen der App: Foto in der Vorschau noch da', v.r && v.r.ok, v);
    await page.evaluate(id => { window.jvStudioAnsicht.aktion('vorschauZu'); window.jvStudioAnsicht.zeigeProjekt(id); }, pid);

    /* 4 ZIP */
    const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.evaluate(id => window.jvStudioAnsicht.aktion('zip', id), pid)]);
    const zp = path.join(tmp, 'p.zip'); await dl.saveAs(zp);
    let lst = ''; try { lst = cp.execFileSync('unzip', ['-l', zp], { encoding: 'utf8' }); cp.execFileSync('unzip', ['-tq', zp]); cp.execFileSync('unzip', ['-o', '-q', zp, '-d', path.join(tmp, 'z')]); } catch (e) { lst = 'FEHLER ' + e.message; }
    check('ZIP: enthält index.html und das Foto, Prüfsummen in Ordnung', /index\.html/.test(lst) && /bilder\/urlaub-strand\.jpg/.test(lst) && !/FEHLER/.test(lst), lst);
    const entpackt = fs.existsSync(path.join(tmp, 'z', 'bilder', 'urlaub-strand.jpg')) ? fs.readFileSync(path.join(tmp, 'z', 'bilder', 'urlaub-strand.jpg')) : null;
    check('ZIP: Foto byte-gleich zum gespeicherten', entpackt && entpackt.length === f.bytes && Buffer.compare(entpackt.subarray(0, 4000), Buffer.from(idb[0].d)) === 0);
    if (entpackt) {   // das fertige Projekt aus dem ZIP lokal öffnen: Bild muss laden
        const p2 = await ctx.newPage(); await p2.route('**/*', rt => { const u = new URL(rt.request().url()); const f2 = path.join(tmp, 'z', u.pathname); if (u.host === 'fertig.test' && fs.existsSync(f2) && fs.statSync(f2).isFile()) return rt.fulfill({ contentType: MIME[path.extname(f2)] || 'image/jpeg', body: fs.readFileSync(f2) }); return rt.abort(); });
        await p2.goto('http://fertig.test/index.html'); await p2.waitForTimeout(500);
        check('Fertiges Projekt (aus dem ZIP entpackt): Foto lädt', await p2.evaluate(() => { const i = document.querySelector('img'); return !!i && i.complete && i.naturalWidth > 0; })); await p2.close();
    }

    /* 5 Offline */
    await ctx.setOffline(true);
    v = await vorschau(); check('Offline: Vorschau mit Foto funktioniert', v.r && v.r.ok, v);
    await page.evaluate(() => window.jvStudioAnsicht.aktion('vorschauZu'));
    await page.locator('#studioKarte input[type=file]').first().setInputFiles(path.join(tmp, 'Urlaub Strand.jpg'));
    await page.waitForFunction(id => (window.jvStudioProjekte.hole(id).dateien || []).length === 3, pid, { timeout: 30000 });
    const pr2 = await page.evaluate(id => window.jvStudioProjekte.hole(id), pid);
    check('Offline: zweites Foto lässt sich hinzufügen, Name wird nummeriert', pr2.dateien.some(x => x.pfad === 'bilder/urlaub-strand-2.jpg'), pr2.dateien.map(x => x.pfad));
    await ctx.setOffline(false);

    /* 6 Abgelehnte Datei */
    await page.locator('#studioKarte input[type=file]').first().setInputFiles(path.join(tmp, 'boese.jpg')); await page.waitForTimeout(800);
    const n3 = await page.evaluate(id => window.jvStudioProjekte.hole(id).dateien.length, pid);
    check('SVG mit Skript, als boese.jpg getarnt: abgelehnt, Projekt unverändert', n3 === 3, n3);
    check('Ablehnung wird verständlich gemeldet', /kein Foto|SVG/.test(await page.locator('#studioKarte').innerText().catch(() => '')));

    /* 7 Entfernen, Löschen */
    await page.evaluate(id => window.jvStudioAnsicht.aktion('fotoWeg', id + '|bilder/urlaub-strand-2.jpg'), pid); await page.waitForTimeout(400);
    const pr3 = await page.evaluate(id => window.jvStudioProjekte.hole(id), pid);
    check('Foto entfernen: Eintrag und Bild-Stelle weg, Projekt weiter gültig', !pr3.dateien.some(x => x.pfad === 'bilder/urlaub-strand-2.jpg') && !/urlaub-strand-2/.test(pr3.dateien[0].inhalt) && /urlaub-strand.jpg/.test(pr3.dateien[0].inhalt));
    check('Foto entfernen: Fassung davor behält ihr Foto (Rückgängig möglich)', await page.evaluate(() => window.jvStudioBilder.verbrauch().then(x => x.anzahl)) === 2);
    await page.evaluate(id => window.jvStudioProjekte.entferne(id), pid); await page.waitForTimeout(600);
    check('Projekt löschen: Fotos in IndexedDB aufgeräumt', await page.evaluate(() => window.jvStudioBilder.verbrauch().then(x => x.anzahl)) === 0);
    const platz = await page.evaluate(async () => ({ info: await window.jvStudioBilder.platzInfo(), dauer: await window.jvStudioBilder.dauerhaft() }));
    console.log('  (Speicherinfo: ' + JSON.stringify(platz) + ')');
    check('Keine Seitenfehler und kein Zugriff auf fremde Adressen', fehlerSeite.length === 0 && extern.length === 0, { fehlerSeite, extern });
    await b.close(); fs.rmSync(tmp, { recursive: true, force: true });
    console.log('\nSTUDIO-BILDER-BROWSER: ' + ok + ' in Ordnung, ' + fehler + ' Fehler'); process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Absturz: ' + (e && e.stack || e)); process.exit(1); });
