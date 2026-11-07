/* Echter Browser-Test (Chromium über Playwright) für die Studio-Vorschau MIT der echten Jarvis-Hauptseite (Fehler aus dem Android-Live-Test von PR #363).
   Start: node tools/studio_vorschau_check.js   Lädt die ECHTE index.html samt allen Skripten (Tailwind aus lokaler Kopie, Umgebungsvariable TAILWIND_JS), öffnet die echte
   Vorschau (jvStudioAnsicht.aktion('vorschau')) und klickt in dem echten Sandbox-Rahmen auf Links. Gesichert wird: kein Link lädt je die Jarvis-Seite in die Vorschau,
   #anker scrollen, gesperrte Links zeigen einen Hinweis, kaputte Bilder werden vom Testlauf gemeldet, Skript-Navigation wird zurückgesetzt, Sandbox ohne allow-same-origin.
   Nicht Teil der automatischen Tests (braucht einen Browser). */
'use strict';
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), TW = process.env.TAILWIND_JS || '/opt/npm-tools/node_modules/@zenuml/core/dist/vendor/tailwindcss/tailwindcss.js';
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png' };
let ok = 0, fehler = 0;
function check(n, b, info) { if (b) { ok++; console.log('✓ ' + n); } else { fehler++; console.log('✗ ' + n + (info !== undefined ? ' → ' + JSON.stringify(info).slice(0, 400) : '')); } }
const SVG = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='40' height='40'%3E%3Crect width='40' height='40' fill='gold'/%3E%3C/svg%3E";
const SEITE = (extra, js) => [{ pfad: 'index.html', inhalt: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="style.css"></head><body>' +
    '<nav><a id="a1" href="index.html">Start</a> <a id="a2" href="/">Root</a> <a id="a3" href="#angebote">Angebote</a> <a id="a4" href="angebote.html">Seite</a> <a id="a5" href="./">Punkt</a> <a id="a6" href="https://example.com/x">Extern</a> <a id="a7" href="#gibtsnicht">Tot</a> <a id="a8" href="tel:+49123">Tel</a></nav>' +
    '<section id="angebote" style="margin-top:1500px;height:600px"><h2>Angebote</h2>' + (extra || '') + '</section><script src="app.js"></script></body></html>' }, { pfad: 'style.css', inhalt: 'body{background:#000;color:#fc0}' }, { pfad: 'app.js', inhalt: js || 'var x=1;' }];
(async () => {
    const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 390, height: 780 }, serviceWorkers: 'block' }); const page = await ctx.newPage();
    const jarvisAnfragen = [], jarvisSub = []; page.on('request', r => { if (r.frame() !== page.mainFrame() && /jarvis\.test\/(js\/|style\.css|api\/)/.test(r.url())) jarvisSub.push(r.url()); const u = r.url(); if (/jarvis\.test\/(index\.html|api\/|\?|$)/.test(u) && r.frame() !== page.mainFrame()) jarvisAnfragen.push(u); });
    await page.route('**/*', rt => { const u = new URL(rt.request().url());
        if (u.host === 'cdn.tailwindcss.com') return rt.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(TW) });
        if (u.host === 'jarvis.test') { const p = u.pathname === '/' ? '/index.html' : u.pathname; const f = path.join(ROOT, decodeURIComponent(p)); if (fs.existsSync(f) && fs.statSync(f).isFile()) return rt.fulfill({ contentType: MIME[path.extname(f)] || 'text/plain', body: fs.readFileSync(f) }); return rt.fulfill({ status: 404, body: 'nf' }); }
        return rt.abort(); });
    await page.goto('http://jarvis.test/'); await page.waitForFunction(() => window.jvStudioAnsicht && window.jvStudioDateien && window.jvStudioProjekte, null, { timeout: 25000 }); await page.waitForTimeout(3000);
    const vorschauOffnen = async (dateien) => { await page.evaluate(() => window.jvStudioAnsicht.aktion('vorschauZu')); jarvisAnfragen.length = 0;
        await page.evaluate(d => { const p = window.jvStudioProjekte.neu({ name: 'Autohaus', art: 'app', auftrag: 'x', dateien: d }); window.__pid = p.projekt.id; window.jvStudioAnsicht.aktion('vorschau', window.__pid); }, dateien); await page.waitForTimeout(1200);
        return page.frames().filter(f => f !== page.mainFrame()).pop(); };
    const nurVorschau = async () => { const fr = page.frames().filter(f => f !== page.mainFrame()).pop(); const s = fr ? await fr.evaluate(() => ({ url: location.href, jarvis: !!document.getElementById('jvBoot') || /Alltags-Helfer|recordBtn/.test(document.documentElement.innerHTML) , t: document.title })).catch(() => null) : null; return s; };

    /* 1 Links in der echten Vorschau */
    let fr = await vorschauOffnen(SEITE(''));
    const sandbox = await page.evaluate(() => document.querySelector('#studioVorschau iframe').getAttribute('sandbox'));
    check('Vorschau-Rahmen: sandbox ohne allow-same-origin / allow-top-navigation / allow-popups', sandbox === 'allow-scripts allow-forms allow-modals', sandbox);
    for (const id of ['a1', 'a2', 'a5']) {
        await fr.click('#' + id); await page.waitForTimeout(700);
        const s = await nurVorschau();
        check('Link ' + id + ' (Startseite): bleibt in der Vorschau, lädt NICHT die Jarvis-App', s && /about:srcdoc/.test(s.url) && !s.jarvis && jarvisAnfragen.length === 0, { s, jarvisAnfragen });
    }
    await fr.click('#a3'); await page.waitForTimeout(900);
    let sc = await fr.evaluate(() => Math.round(document.scrollingElement.scrollTop)); let s = await nurVorschau();
    check('Anker #angebote: Seite scrollt zum Abschnitt, Vorschau bleibt die Vorschau', sc > 800 && /about:srcdoc/.test(s.url) && !s.jarvis && jarvisAnfragen.length === 0, { sc, s });
    await fr.click('#a1'); await page.waitForTimeout(900);
    sc = await fr.evaluate(() => Math.round(document.scrollingElement.scrollTop));
    check('Link auf index.html scrollt nach oben (statt die Jarvis-App zu laden)', sc < 50, sc);
    for (const [id, muster] of [['a4', /gesperrt/], ['a6', /gesperrt/], ['a7', /Ziel gibt es auf der Seite nicht/], ['a8', /Telefon/]]) {
        await fr.evaluate(() => scrollTo(0, 0)); await fr.click('#' + id); await page.waitForTimeout(500);
        const hin = await fr.evaluate(() => { const d = document.getElementById('jvHinweis'); return d && d.style.display !== 'none' ? d.textContent : ''; }); s = await nurVorschau();
        check('Link ' + id + ': verständlicher Hinweis, Vorschau bleibt, keine Jarvis-Anfrage', muster.test(hin) && /about:srcdoc/.test(s.url) && !s.jarvis && jarvisAnfragen.length === 0, { hin, s, jarvisAnfragen });
    }

    /* 2 Navigation per Skript: zweite Sicherung setzt zurück */
    fr = await vorschauOffnen(SEITE('', 'setTimeout(function(){ location.href="index.html"; }, 400);'));
    await page.waitForTimeout(1500);
    const rueck = await page.evaluate(() => { const h = document.querySelector('#studioVorschau div[role=status]'); return h ? h.textContent : null; }); s = await nurVorschau();
    check('Navigation per Skript: Rahmen wird SOFORT zurückgesetzt (Hinweis sichtbar), die Jarvis-App wird nicht angezeigt', s && /about:srcdoc/.test(s.url) && !s.jarvis && /zurückgesetzt|angehalten|verlassen/.test(rueck || s.t || ''), { s, rueck });
    await page.waitForTimeout(5000); s = await nurVorschau();
    const stopp = await page.evaluate(() => document.querySelector('#studioVorschau iframe').srcdoc);
    check('Endlos-Navigation wird nach 3 Rücksetzungen angehalten (Rahmen zeigt den Stopp-Text, keine Jarvis-Seite)', s && !s.jarvis && /angehalten/.test(stopp), { s, stopp: stopp.slice(0, 120) });
    console.log('  (Hinweis: Eine Skript-Navigation kann der Browser nicht verhindern; die Jarvis-Seite wird kurz angefragt, aber sofort zurückgesetzt. Nachgeladene Jarvis-Dateien im Rahmen: ' + jarvisSub.length + ' – der Rahmen ist abgeschottet und kommt an keine Daten.)');

    /* 3 Bilder in der echten Vorschau und im Testlauf */
    const lauf = d => page.evaluate(async dateien => window.jvStudioWerkzeuge._laufPruefungEcht(dateien), d);
    const mitBild = src => SEITE('<img id="b" alt="Ferrari" src="' + src + '" width="40" height="40">');
    let r = await lauf(mitBild('https://upload.wikimedia.org/ferrari.jpg'));
    check('Testlauf: externes Bild wird als Fehler gemeldet', r.moeglich && r.fehler.some(e => /Bild lädt nicht|Blockiert/.test(e)), r);
    r = await lauf(mitBild('images/lambo.jpg'));
    check('Testlauf: fehlende Bilddatei wird als Fehler gemeldet', r.moeglich && r.fehler.some(e => /Bild lädt nicht|Blockiert/.test(e)), r);
    r = await lauf(mitBild(SVG));
    check('Testlauf: data:-Bild gilt als in Ordnung, keine Fehler', r.moeglich && r.geladen && r.fehler.length === 0, r);
    r = await lauf(SEITE('<svg role="img" aria-label="Auto" viewBox="0 0 10 10" width="40"><rect width="10" height="10" fill="gold"/></svg>'));
    check('Testlauf: Inline-SVG statt Bild ist in Ordnung', r.moeglich && r.geladen && r.fehler.length === 0, r);
    const gerettet = await page.evaluate(d => { const x = window.jvStudioDateien.ersetzeBilder(d); return { anzahl: x.anzahl, fehler: window.jvStudioDateien.pruefeVerweise(x.dateien).fehler.filter(f => /Bild/.test(f)) }; }, mitBild('https://u/f.jpg'));
    r = await lauf((await page.evaluate(d => window.jvStudioDateien.ersetzeBilder(d).dateien, mitBild('https://u/f.jpg'))));
    check('Ersatz-Grafik: statt kaputtem Bild wird Inline-SVG eingesetzt, Testlauf danach sauber', gerettet.anzahl === 1 && gerettet.fehler.length === 0 && r.geladen && r.fehler.filter(e => /Bild/.test(e)).length === 0, { gerettet, r });
    fr = await vorschauOffnen(SEITE('<img id="b" alt="Ferrari" src="https://u/f.jpg" width="40" height="40"><img id="c" alt="ok" src="' + SVG + '" width="40" height="40">'));
    const bilder = await fr.evaluate(() => [...document.images].map(i => [i.id, i.complete && i.naturalWidth > 0]));
    check('Echte Vorschau: data:-Bild wird angezeigt, externes bleibt (wie bekannt) leer – daher fängt es die Prüfung vorher ab', bilder.find(x => x[0] === 'c')[1] === true && bilder.find(x => x[0] === 'b')[1] === false, bilder);
    const geladenSvg = await vorschauOffnen([{ pfad: 'index.html', inhalt: '<html><head></head><body><img id="l" src="logo.svg" width="40" height="40" alt="l"></body></html>' }, { pfad: 'logo.svg', inhalt: "<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><rect width='40' height='40' fill='gold'/></svg>" }]);
    check('Eigene SVG-Datei des Projekts wird in der Vorschau als Bild angezeigt', await geladenSvg.evaluate(() => { const i = document.getElementById('l'); return i.complete && i.naturalWidth > 0; }));
    await page.evaluate(() => window.jvStudioAnsicht.aktion('vorschauZu'));
    check('Jarvis-Hauptseite selbst blieb während aller Klicks heil (Studio-Skripte noch da, kein zweites Jarvis im Hauptfenster)', await page.evaluate(() => !!window.jvStudioAnsicht && document.querySelectorAll('#jvBoot').length <= 1));
    await b.close();
    console.log('VORSCHAU-BROWSER: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler'); process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ abgestürzt: ' + (e && e.stack || e)); process.exit(1); });
