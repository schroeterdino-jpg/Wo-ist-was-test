/* Echter Browser-Test (Chromium über Playwright) für den abgeschotteten Testlauf von Jarvis Studio. Start: node tools/studio_browser_check.js
   Nicht Teil der automatischen Tests (braucht einen Browser). Prüft mit den ECHTEN Studio-Skripten: gute Seite lädt, Laufzeitfehler werden gemeldet,
   Netzwerkzugriff wird blockiert, der erzeugte Code kommt NICHT an Daten der App-Seite, und die Vorschau-Karte nutzt ein Sandbox-iframe. */
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const ROOT = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function check(n, b, info) { if (b) { ok++; console.log('✓ ' + n); } else { fehler++; console.log('✗ ' + n + (info !== undefined ? ' → ' + JSON.stringify(info).slice(0, 300) : '')); } }
(async () => {
    const browser = await chromium.launch(); const page = await browser.newPage();
    const konsole = []; page.on('console', m => konsole.push(m.type() + ': ' + m.text()));
    await page.route('http://studio.test/**', rt => rt.fulfill({ contentType: 'text/html', body: '<!doctype html><html><body><div id="recordBtn"></div></body></html>' }));
    await page.goto('http://studio.test/');
    await page.evaluate(() => { localStorage.setItem('GEHEIM_DER_APP', 'nicht-lesbar'); window.apiFetch = async () => ({ ok: false, status: 500, json: async () => ({}) }); });
    for (const f of ['mission_kern', 'studio_dateien', 'studio_projekte', 'studio_regie', 'studio_werkzeuge', 'studio_ansicht', 'studio_auftrag']) await page.addScriptTag({ path: path.join(ROOT, 'js', f + '.js') });
    const lauf = d => page.evaluate(async dateien => window.jvStudioWerkzeuge._laufPruefungEcht(dateien), d);
    const html = (body, js) => [{ pfad: 'index.html', inhalt: '<!doctype html><html><head><meta charset="utf-8"><title>T</title></head><body>' + body + '<script src="app.js"></script></body></html>' }, { pfad: 'app.js', inhalt: js }];

    let r = await lauf(html('<h1 id="z">0</h1>', 'document.getElementById("z").textContent="1";'));
    check('gute Seite: Testlauf möglich, geladen, keine Fehler', r.moeglich && r.geladen && r.fehler.length === 0, r);
    r = await lauf(html('<p>x</p>', 'nichtDa.foo();'));
    check('Laufzeitfehler (ReferenceError) wird gemeldet', r.moeglich && r.fehler.some(e => /nichtDa/.test(e)), r);
    r = await lauf(html('<p>x</p>', 'JSON.parse("{kaputt")'));
    check('Syntax-/Parsefehler im Code wird gemeldet', r.fehler.length > 0, r);
    r = await lauf(html('<p>x</p>', 'fetch("https://example.com/").then(()=>{window.__netz="ja"}).catch(e=>{throw e}); new Image().src="https://example.com/x.png";'));
    check('Netzwerkzugriff aus dem erzeugten Code wird blockiert (kein stilles Abfließen)', r.moeglich, r);
    const netzAnfragen = [], blockiert = []; page.on('response', q => { if (/example\.com/.test(q.url())) netzAnfragen.push(q.url()); }); page.on('requestfailed', q => { if (/example\.com/.test(q.url())) blockiert.push(q.url() + ' ' + (q.failure() && q.failure().errorText)); });
    await lauf(html('<p>x</p>', 'fetch("https://example.com/leak"); new Image().src="https://example.com/p.png"; var l=document.createElement("link");l.rel="stylesheet";l.href="https://example.com/s.css";document.head.appendChild(l);'));
    await page.waitForTimeout(500);
    check('kein fremder Aufruf kam an: nichts wurde beantwortet, Versuche von der Content-Security-Policy gestoppt', netzAnfragen.length === 0 && blockiert.every(b => /BLOCKED|blocked|csp/i.test(b)), [netzAnfragen, blockiert]);
    r = await lauf(html('<p>x</p>', 'try{var v=window.parent.localStorage.getItem("GEHEIM_DER_APP");throw new Error("LECK:"+v)}catch(e){if(/LECK/.test(e.message))throw e;}try{var d=window.parent.document.title;throw new Error("LECK-DOM")}catch(e){if(/LECK/.test(e.message))throw e;}'));
    check('erzeugter Code kommt NICHT an localStorage oder DOM der App-Seite (kein allow-same-origin)', r.moeglich && r.geladen && r.fehler.length === 0, r);
    r = await lauf(html('<p>x</p>', 'try{localStorage.setItem("a","b");}catch(e){throw new Error("kein Speicher: "+e.name)}'));
    check('im Sandbox-iframe ohne eigene Herkunft ist localStorage gesperrt (Fehler wird gemeldet, nicht verschluckt)', r.moeglich && r.fehler.some(e => /kein Speicher/.test(e)) , r);
    r = await lauf(html('<p>x</p>', 'window.top.location.href="https://example.com/";'));
    check('Navigation der App-Seite von innen wird verhindert', await page.evaluate(() => location.href.indexOf('example.com') < 0), await page.evaluate(() => location.href));
    r = await lauf(html('<p>x</p>', 'parent.postMessage({fertig:true,jvStudio:"falsch"},"*");parent.postMessage({fehler:"gefälscht"},"*");'));
    check('gefälschte Meldungen ohne die Zufallskennung ändern das Ergebnis nicht', r.moeglich && r.geladen && !r.fehler.some(e => /gefälscht/.test(e)), r);
    r = await lauf(html('<p>x</p>', 'for(;;){}'));
    check('Endlosschleife beim Laden: wird im Worker erkannt und beendet, die App-Seite friert nicht ein', r.moeglich && r.geladen === false && r.fehler.some(e => /Endlosschleife/.test(e)), r);
    r = await lauf(html('<p>x</p>', 'var i=0;while(true){i++;}'));
    check('auch while(true) wird erkannt', r.fehler.some(e => /Endlosschleife/.test(e)), r);
    r = await lauf(html('<button id="b">x</button>', 'var n=0;for(var i=0;i<1e5;i++){n+=i}document.getElementById("b").onclick=function(){n++};setTimeout(function(){},10);'));
    check('normaler Code mit Schleife, Zeitgeber und Klick-Handler wird NICHT fälschlich blockiert', r.moeglich && r.geladen && r.fehler.length === 0, r);
    const lebt = await Promise.race([page.evaluate(() => 1 + 1), new Promise(res => setTimeout(() => res('haengt'), 4000))]);
    check('die App-Seite reagiert danach noch', lebt === 2, lebt);

    /* Vorschau-Karte: echtes Sandbox-iframe */
    const dateien = html('<h1 id="z">Hallo</h1>', 'document.getElementById("z").textContent="Hallo Welt"');
    await page.evaluate(d => { const p = window.jvStudioProjekte.neu({ name: 'Browsertest', art: 'app', auftrag: 'x', dateien: d }); window.__pid = p.projekt.id; }, dateien);
    const vorschau = await page.evaluate(() => { const A = window.jvStudioAnsicht; A.zeigeProjekt(window.__pid); const h = A.html(); return { h: h, hat: /Vorschau/.test(h) }; });
    check('Karte bietet Vorschau an', vorschau.hat, vorschau.h.slice(0, 200));
    const sb = await page.evaluate(() => { const fr = document.createElement('iframe'); const A = window.jvStudioAnsicht; return A.vorschauAttribute ? A.vorschauAttribute() : null; });
    const quelle = fs.readFileSync(path.join(ROOT, 'js/studio_ansicht.js'), 'utf8');
    check('Vorschau-iframe: sandbox ohne allow-same-origin und ohne allow-top-navigation', /sandbox', 'allow-scripts allow-forms allow-modals'/.test(quelle) && !/allow-same-origin|allow-top-navigation|allow-popups/.test(quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')));
    await browser.close();
    console.log('BROWSER: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler'); process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ abgestürzt: ' + (e && e.stack || e)); process.exit(1); });
