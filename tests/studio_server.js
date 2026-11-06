/* ============================================================
   TESTS Jarvis Studio, Server-Teil (api/maps.js: studio_suche, studio_seite, studio_bau, studio_status). Start: node tests/studio_server.js
   Der ECHTE Servercode läuft; nur das Netz (fetch) ist eine Attrappe. Geprüft: Zugang, Eingaben, Schutz vor internen Adressen, Weiterleitungen,
   Textauszug, Freigabe-Pflicht, Dateiprüfung, Anfragen an GitHub (Form, Ziel, Token nur im Kopf), Statusabbildung, Fehlerfälle.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), url = require('url');
const ROOT = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function check(n, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + n + (info !== undefined ? '  →  ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 300) : '')); }
(async function () {
    const tmp = path.join(os.tmpdir(), 'studio_maps_' + process.pid + '.mjs');
    fs.copyFileSync(path.join(ROOT, 'api', 'maps.js'), tmp);
    const handler = (await import(url.pathToFileURL(tmp).href)).default; try { fs.unlinkSync(tmp); } catch (e) { }
    process.env.APP_SECRET = 'geheim'; process.env.SERPER_API_KEY = 'serper-test'; delete process.env.STUDIO_GITHUB_TOKEN; delete process.env.STUDIO_BUILD_REPO; delete process.env.STUDIO_BASE_REF;
    const echtFetch = global.fetch; let netz = [], skript = () => ({ status: 404, body: '{}' });
    global.fetch = async (u, o) => {
        o = o || {}; netz.push({ url: String(u), o }); const r = await skript(String(u), o);
        const kopf = new Map(Object.entries(Object.assign({ 'content-type': 'application/json' }, r.headers || {})));
        const roh = typeof r.body === 'string' ? r.body : JSON.stringify(r.body || {});
        return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: k => kopf.get(String(k).toLowerCase()) || null }, text: async () => roh, json: async () => JSON.parse(roh), body: null };
    };
    async function ruf(action, query, opt) {
        opt = opt || {}; let status = 200, payload; const res = { status(c) { status = c; return this; }, json(p) { payload = p; return this; } };
        await handler({ method: opt.method || 'GET', query: Object.assign({ action }, query || {}), headers: opt.ohneSchluessel ? {} : { 'x-app-key': opt.schluessel || 'geheim' }, body: opt.body }, res);
        return { status, payload };
    }
    const gut = { dateien: [{ pfad: 'index.html', inhalt: '<html><body>x</body></html>' }, { pfad: 'app.js', inhalt: 'var a=1' }], freigabe: true, name: 'Zähler' };

    /* Zugang */
    check('1a ohne App-Code: 401 für alle vier Studio-Aktionen', (await Promise.all(['studio_suche', 'studio_seite', 'studio_bau', 'studio_status'].map(a => ruf(a, {}, { ohneSchluessel: true })))).every(r => r.status === 401));
    check('1b falscher App-Code: 401', (await ruf('studio_suche', { q: 'test test' }, { schluessel: 'falsch' })).status === 401);
    check('1c bestehende Aktionen unverändert erreichbar (unbekannte Aktion → 400)', (await ruf('gibtsnicht')).status === 400);

    /* studio_suche */
    check('2a zu kurzer Suchbegriff → 400, kein Netzaufruf', (netz = [], (await ruf('studio_suche', { q: 'ab' })).status === 400) && netz.length === 0);
    skript = () => ({ status: 200, body: { organic: [{ title: 'A', link: 'https://a.example/x', snippet: 's' }, { title: 'B', link: 'http://unsicher.example', snippet: 's' }, { title: 'C', link: 'https://www.c.example/y' }] } });
    netz = []; let r = await ruf('studio_suche', { q: '  Wallbox   Kosten  ' });
    check('2b Treffer: nur https, Domain ohne www, Anfrage bereinigt, Schlüssel nur im Kopf zum Suchdienst', r.status === 200 && r.payload.treffer.length === 2 && r.payload.treffer[1].domain === 'c.example' && JSON.parse(netz[0].o.body).q === 'Wallbox Kosten' && netz[0].o.headers['X-API-KEY'] === 'serper-test' && !/serper-test/.test(JSON.stringify(r.payload)), r);
    skript = () => ({ status: 500, body: {} }); check('2c Suchdienst-Fehler → 502 mit Statuscode', (r = await ruf('studio_suche', { q: 'Wallbox Kosten' })).status === 502 && /500/.test(r.payload.error));
    delete process.env.SERPER_API_KEY; check('2d ohne SERPER_API_KEY → klare Meldung', (r = await ruf('studio_suche', { q: 'Wallbox Kosten' })).status === 500 && /SERPER_API_KEY/.test(r.payload.error)); process.env.SERPER_API_KEY = 'serper-test';

    /* studio_seite: Schutz vor internen Adressen */
    netz = [];
    const verboten = ['http://93.184.216.34/', 'https://localhost/', 'https://127.0.0.1/', 'https://10.0.0.5/', 'https://192.168.1.1/', 'https://172.16.0.1/', 'https://169.254.169.254/latest/meta-data/', 'https://[::1]/', 'https://[fd00::1]/', 'https://[::ffff:127.0.0.1]/', 'https://drucker.local/', 'https://intranet/', 'https://x.internal/', 'https://user:pw@93.184.216.34/', 'https://93.184.216.34:8443/', 'https://0.0.0.0/', 'https://100.64.0.1/', 'ftp://93.184.216.34/', 'kein url'];
    for (const v of verboten) { const x = await ruf('studio_seite', { url: v }); check('3a abgelehnt: ' + v, x.status >= 400 && x.status < 600, x); }
    check('3b bei keiner der verbotenen Adressen ging eine Anfrage ins Netz', netz.length === 0, netz.map(n => n.url));
    /* erlaubt + Textauszug */
    const html = '<html><head><title>Wallbox &amp; Co</title><meta name="description" content="Kurz"><script>alert(1)</script></head><body><h1>Preise</h1><p>Ab 500 Euro.</p><style>p{}</style><!-- weg --><div>Ende</div></body></html>';
    skript = () => ({ status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: html });
    r = await ruf('studio_seite', { url: 'https://93.184.216.34/seite' });
    check('3c Textauszug: Titel, Beschreibung, Text ohne Skript/Stil/Kommentar, Hash 16 Zeichen, Zeitstempel', r.status === 200 && r.payload.titel === 'Wallbox & Co' && r.payload.beschreibung === 'Kurz' && /Preise\s+Ab 500 Euro\.\s+Ende/.test(r.payload.text) && !/alert|p\{\}|weg/.test(r.payload.text) && /^[0-9a-f]{16}$/.test(r.payload.hash) && !!r.payload.abgerufen, r);
    skript = () => ({ status: 200, headers: { 'content-type': 'image/png' }, body: 'x' }); check('3d Bilder/Binärdaten → 415', (await ruf('studio_seite', { url: 'https://93.184.216.34/a.png' })).status === 415);
    skript = () => ({ status: 404, body: '' }); check('3e Seite 404 → 502 mit Status', (r = await ruf('studio_seite', { url: 'https://93.184.216.34/x' })).status === 502 && /404/.test(r.payload.error));
    skript = () => ({ status: 200, headers: { 'content-type': 'text/plain' }, body: 'x'.repeat(20000) }); check('3f Text auf 8000 Zeichen begrenzt', (await ruf('studio_seite', { url: 'https://93.184.216.34/lang' })).payload.zeichen === 8000);
    /* Weiterleitungen */
    netz = []; skript = (u) => u.indexOf('start') >= 0 ? { status: 302, headers: { location: 'https://10.0.0.5/geheim' }, body: '' } : { status: 200, headers: { 'content-type': 'text/plain' }, body: 'GEHEIM' };
    r = await ruf('studio_seite', { url: 'https://93.184.216.34/start' });
    check('3g Weiterleitung auf eine interne Adresse wird geprüft und blockiert (kein Abruf der internen Adresse)', r.status === 502 && /Interne Adressen/.test(r.payload.error) && netz.every(n => n.url.indexOf('10.0.0.5') < 0) && !/GEHEIM/.test(JSON.stringify(r.payload)), [r, netz.map(n => n.url)]);
    netz = []; skript = (u) => ({ status: 302, headers: { location: u.replace(/\/(\d*)$/, (m, a) => '/' + ((+a || 0) + 1)) }, body: '' });
    r = await ruf('studio_seite', { url: 'https://93.184.216.34/1' }); check('3h Endlos-Weiterleitung bricht nach 4 Schritten ab', r.status === 502 && /Weiterleitungen/.test(r.payload.error) && netz.length === 4, [r.payload, netz.length]);
    skript = (u) => u.indexOf('/a') >= 0 ? { status: 301, headers: { location: 'https://93.184.216.34/b' }, body: '' } : { status: 200, headers: { 'content-type': 'text/plain' }, body: 'Ziel erreicht' };
    r = await ruf('studio_seite', { url: 'https://93.184.216.34/a' }); check('3i erlaubte Weiterleitung wird gefolgt, Endadresse genannt', r.status === 200 && r.payload.endadresse === 'https://93.184.216.34/b' && /Ziel erreicht/.test(r.payload.text), r);

    /* studio_bau */
    check('4a nur POST', (await ruf('studio_bau', {}, { method: 'GET' })).status === 405);
    r = await ruf('studio_bau', {}, { method: 'POST', body: gut });
    check('4b ohne Token: 501 und die Meldung nennt die fehlende Variable genau', r.status === 501 && r.payload.fehlt === 'STUDIO_GITHUB_TOKEN' && /STUDIO_GITHUB_TOKEN/.test(r.payload.error), r);
    process.env.STUDIO_GITHUB_TOKEN = 'ghp_TESTTOKEN';
    netz = []; check('4c ohne ausdrückliche Freigabe: 400, kein GitHub-Aufruf', (r = await ruf('studio_bau', {}, { method: 'POST', body: Object.assign({}, gut, { freigabe: false }) })).status === 400 && netz.length === 0, r);
    check('4c2 „freigabe“ als Text "true" zählt nicht', (await ruf('studio_bau', {}, { method: 'POST', body: Object.assign({}, gut, { freigabe: 'true' }) })).status === 400);
    const schlecht = [
        [{ dateien: [{ pfad: 'index.html', inhalt: 'x' }, { pfad: '../x.js', inhalt: 'x' }] }, 'Pfad nach oben'], [{ dateien: [{ pfad: 'index.html', inhalt: 'x' }, { pfad: '/etc/x.js', inhalt: 'x' }] }, 'absolut'],
        [{ dateien: [{ pfad: 'index.html', inhalt: 'x' }, { pfad: 'a.exe', inhalt: 'x' }] }, 'Typ'], [{ dateien: [{ pfad: 'index.html', inhalt: 'x' }, { pfad: 'a.php', inhalt: 'x' }] }, 'php'],
        [{ dateien: [{ pfad: 'a.js', inhalt: 'x' }] }, 'ohne index'], [{ dateien: [{ pfad: 'index.html', inhalt: 'x' }, { pfad: 'index.html', inhalt: 'y' }] }, 'doppelt'],
        [{ dateien: [{ pfad: 'index.html', inhalt: 'x'.repeat(400001) }] }, 'zu groß'], [{ dateien: Array.from({ length: 41 }, (_, i) => ({ pfad: i ? 'f' + i + '.js' : 'index.html', inhalt: 'x' })) }, '41 Dateien'],
        [{ dateien: [{ pfad: 'index.html', inhalt: 5 }] }, 'Inhalt keine Zeichenkette'], [{ dateien: 'x' }, 'keine Liste'], [{}, 'leer'],
        [{ dateien: [{ pfad: 'index.html', inhalt: 'x' }, { pfad: 'Gross.js', inhalt: 'x' }] }, 'Großbuchstaben'], [{ dateien: [{ pfad: 'index.html', inhalt: 'x' }, { pfad: '.github/workflows/x.js', inhalt: 'x' }] }, 'Punktordner'],
        [{ dateien: [{ pfad: 'index.html', inhalt: 'x' }, { pfad: 'a/../../b.js', inhalt: 'x' }] }, 'Pfadtrick']
    ];
    for (const [b, n] of schlecht) { netz = []; const x = await ruf('studio_bau', {}, { method: 'POST', body: Object.assign({ freigabe: true, name: 'X' }, b) }); check('4d abgelehnt: ' + n, x.status === 400 && netz.length === 0, x); }
    /* Erfolgreicher Bau: genau die erwarteten GitHub-Aufrufe */
    netz = []; skript = (u, o) => {
        if (/actions\/workflows\/studio-apk\.yml\/runs/.test(u)) return { status: 200, body: { workflow_runs: [] } };
        if (/git\/ref\/heads\/main$/.test(u)) return { status: 200, body: { object: { sha: 'BASIS' } } };
        if (/git\/commits\/BASIS$/.test(u)) return { status: 200, body: { tree: { sha: 'BASISTREE' } } };
        if (/git\/trees$/.test(u)) return { status: 201, body: { sha: 'NEUTREE' } };
        if (/git\/commits$/.test(u)) return { status: 201, body: { sha: 'NEUCOMMIT' } };
        if (/git\/refs$/.test(u)) return { status: 201, body: {} };
        return { status: 404, body: { message: 'nein' } };
    };
    r = await ruf('studio_bau', {}, { method: 'POST', body: gut });
    check('4e Erfolg: Branch studio/p…, Commit, Repository', r.status === 200 && /^studio\/p[a-z0-9]{6,20}$/.test(r.payload.branch) && r.payload.commit === 'NEUCOMMIT' && r.payload.repo === 'schroeterdino-jpg/Wo-ist-was-test', r);
    check('4f 6 GitHub-Aufrufe in der richtigen Reihenfolge, nur api.github.com', netz.length === 6 && netz.every(n => n.url.startsWith('https://api.github.com/repos/schroeterdino-jpg/Wo-ist-was-test/')) && /studio-apk\.yml\/runs/.test(netz[0].url) && /git\/ref\/heads\/main$/.test(netz[1].url) && /git\/trees$/.test(netz[3].url) && /git\/refs$/.test(netz[5].url), netz.map(n => n.url));
    const baum = JSON.parse(netz[3].o.body), ref = JSON.parse(netz[5].o.body);
    check('4g Dateien landen NUR unter studio-projekt/www/ (+meta.json); Basis-Baum und Eltern-Commit stimmen', baum.base_tree === 'BASISTREE' && baum.tree.every(t => /^studio-projekt\/(www\/[a-z0-9._\/-]+|meta\.json)$/.test(t.path) && t.mode === '100644' && t.type === 'blob') && baum.tree.length === 3 && JSON.parse(netz[4].o.body).parents[0] === 'BASIS' && /^refs\/heads\/studio\/p/.test(ref.ref) && ref.sha === 'NEUCOMMIT', baum);
    check('4h Token nur im Authorization-Kopf, nie in Antwort oder Anfrage-Inhalt', netz.every(n => n.o.headers.Authorization === 'Bearer ghp_TESTTOKEN' && !/ghp_TESTTOKEN/.test(String(n.o.body || ''))) && !/ghp_TESTTOKEN/.test(JSON.stringify(r)));
    /* Dauerhafte Grenzen aus GitHub */
    const mitLaeufen = (laeufe) => (u) => /actions\/workflows\/studio-apk\.yml\/runs/.test(u) ? { status: 200, body: { workflow_runs: laeufe } } : { status: 404, body: {} };
    netz = []; skript = mitLaeufen([{ status: 'in_progress', created_at: new Date().toISOString() }]);
    r = await ruf('studio_bau', {}, { method: 'POST', body: gut }); check('4i1 offener Bau auf GitHub → 429, nichts angelegt (gilt über alle Server-Instanzen)', r.status === 429 && netz.length === 1, [r, netz.length]);
    skript = mitLaeufen(Array.from({ length: 5 }, () => ({ status: 'completed', created_at: new Date(Date.now() - 600000).toISOString() })));
    r = await ruf('studio_bau', {}, { method: 'POST', body: gut }); check('4i2 5 Läufe in der letzten Stunde → 429', r.status === 429 && /5 Builds/.test(r.payload.error), r);
    skript = mitLaeufen(Array.from({ length: 5 }, () => ({ status: 'completed', created_at: new Date(Date.now() - 7200000).toISOString() })));
    skript = ((alt) => (u) => /studio-apk\.yml\/runs/.test(u) ? alt(u) : { status: 404, body: {} })(skript);
    r = await ruf('studio_bau', {}, { method: 'POST', body: gut }); check('4i3 alte Läufe (älter als 1 Stunde) zählen nicht (hier scheitert erst der Folgeschritt, nicht die Grenze)', r.status === 502, r);
    skript = () => ({ status: 404, body: { message: 'Not Found' } });
    r = await ruf('studio_bau', {}, { method: 'POST', body: gut }); check('4i4 Workflow liegt nicht auf dem Standard-Branch → 409 mit klarer Meldung, nichts angelegt', r.status === 409 && /studio-apk\.yml/.test(r.payload.error), r);
    let parallel = [], blocker; skript = async (u) => { if (/studio-apk\.yml\/runs/.test(u)) { await new Promise(x => setTimeout(x, 30)); return { status: 200, body: { workflow_runs: [{ status: 'completed', created_at: '2020-01-01T00:00:00Z' }] } }; } return { status: 404, body: {} }; };
    parallel = await Promise.all([ruf('studio_bau', {}, { method: 'POST', body: gut }), ruf('studio_bau', {}, { method: 'POST', body: gut })]);
    check('4i5 zwei gleichzeitige Anfragen: die zweite wird abgewiesen (429)', parallel.some(x => x.status === 429 && /vorbereitet/.test(x.payload.error)), parallel.map(x => x.status));
    /* Fehler und Grenzen */
    skript = (u) => /studio-apk\.yml\/runs/.test(u) ? { status: 200, body: { workflow_runs: [] } } : /git\/ref\/heads/.test(u) ? { status: 401, body: { message: 'Bad credentials' } } : { status: 404, body: {} };
    r = await ruf('studio_bau', {}, { method: 'POST', body: gut }); check('4i GitHub lehnt ab → 502 mit Grund, ohne Token im Text', r.status === 502 && /401/.test(r.payload.error) && !/ghp_/.test(r.payload.error), r);
    skript = (u) => /studio-apk\.yml\/runs/.test(u) ? { status: 200, body: { workflow_runs: [] } } : { status: 200, body: { object: { sha: 'B' }, tree: { sha: 'T' }, sha: 'N' } };
    let letzter = 0; for (let i = 0; i < 6; i++) letzter = (await ruf('studio_bau', {}, { method: 'POST', body: gut })).status;
    check('4j Grenze: höchstens 5 Builds pro Stunde (weitere → 429)', letzter === 429);
    process.env.STUDIO_BUILD_REPO = 'böse/../repo'; check('4k ungültiger Repo-Name wird nicht benutzt (nicht eingerichtet statt Fremdziel)', (await ruf('studio_bau', {}, { method: 'POST', body: gut })).status === 501);
    delete process.env.STUDIO_BUILD_REPO;

    /* studio_status */
    process.env.STUDIO_GITHUB_TOKEN = 'ghp_TESTTOKEN';
    check('5a ungültiger Branch → 400 (keine Pfadtricks)', (await Promise.all(['main', 'studio/../main', 'studio/pAB', 'studio/p1234567/../x', ''].map(b => ruf('studio_status', { branch: b })))).every(x => x.status === 400));
    const B = 'studio/pabc123xyz';
    skript = (u) => /actions\/runs\?/.test(u) ? { status: 200, body: { workflow_runs: [] } } : { status: 404, body: {} };
    check('5b noch kein Lauf → „wartet“', (await ruf('studio_status', { branch: B })).payload.zustand === 'wartet');
    skript = (u) => /actions\/runs\?/.test(u) ? { status: 200, body: { workflow_runs: [{ id: 7, status: 'in_progress', conclusion: null, html_url: 'https://github.com/x/y/actions/runs/7' }] } } : { status: 404, body: {} };
    check('5c laufender Lauf → „laeuft“ mit Protokoll-Link', (r = await ruf('studio_status', { branch: B })).payload.zustand === 'laeuft' && /runs\/7/.test(r.payload.run_url));
    skript = (u) => /actions\/runs\?/.test(u) ? { status: 200, body: { workflow_runs: [{ id: 7, status: 'completed', conclusion: 'failure', html_url: 'https://github.com/x/y/actions/runs/7' }] } } : /jobs$/.test(u) ? { status: 200, body: { jobs: [{ steps: [{ name: 'Checkout', conclusion: 'success' }, { name: 'APK bauen', conclusion: 'failure' }] }] } } : { status: 404, body: {} };
    r = await ruf('studio_status', { branch: B }); check('5d fehlgeschlagen → Name des fehlerhaften Schritts', r.payload.zustand === 'fehlgeschlagen' && r.payload.fehlerSchritt === 'APK bauen', r);
    const erfolg = { id: 8, status: 'completed', conclusion: 'success', html_url: 'https://github.com/x/y/actions/runs/8' };
    skript = (u) => /actions\/runs\?/.test(u) ? { status: 200, body: { workflow_runs: [erfolg] } } : /releases\/tags\/studio-pabc123xyz$/.test(u) ? { status: 200, body: { assets: [{ name: 'Jarvis-Studio-pabc123xyz.apk', size: 8945, browser_download_url: 'https://github.com/x/y/releases/download/studio-pabc123xyz/Jarvis-Studio-pabc123xyz.apk' }] } } : { status: 404, body: {} };
    r = await ruf('studio_status', { branch: B }); check('5e erfolgreich + Release-Datei → „fertig“ mit Download, Größe, Name', r.payload.zustand === 'fertig' && r.payload.apk_bytes === 8945 && /\.apk$/.test(r.payload.apk_url) && /^https:\/\/github\.com\//.test(r.payload.apk_url), r);
    skript = (u) => /actions\/runs\?/.test(u) ? { status: 200, body: { workflow_runs: [erfolg] } } : { status: 404, body: { message: 'Not Found' } };
    r = await ruf('studio_status', { branch: B }); check('5f erfolgreich, aber noch keine Datei → bleibt „laeuft“ (nie ein erfundener Link)', r.payload.zustand === 'laeuft' && !r.payload.apk_url, r);
    skript = () => ({ status: 500, body: { message: 'x' } }); check('5g GitHub-Fehler → 502', (await ruf('studio_status', { branch: B })).status === 502);
    delete process.env.STUDIO_GITHUB_TOKEN; check('5h ohne Token → 501 mit Variablennamen', (r = await ruf('studio_status', { branch: B })).status === 501 && r.payload.fehlt === 'STUDIO_GITHUB_TOKEN');
    global.fetch = echtFetch;
    console.log('STUDIO-SERVER: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler'); process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(1); });
