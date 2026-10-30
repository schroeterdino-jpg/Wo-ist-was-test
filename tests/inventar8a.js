/* ============================================================
   Phase 8A – Schlussinventur: reine Inventar- und Konsistenzprüfung. KEINE Produktlogik, kein Produktcode geändert.
   Misst den heutigen Stand des Repositorys und vergleicht ihn mit dem Golden Master tests/inventar8a_soll.json (Ist-Zustand, nicht Wunsch).
   Teile:
     1  Gesamtzahlen (Dateien, Zeilen, Bytes, gzip, Script-Tags, api, Tests, Android) und Vergleich mit dem Stand vor Phase 2 ("Phase 1")
     2  index.html: Skriptliste, Reihenfolge, doppelte/fehlende/verwaiste Einträge, Stempel, Drittanbieter, Inline-Skripte
     3  LANDKARTE.md / ARCHITEKTUR.md: jede js-Datei zugeordnet, genannte Dateien existieren, Besitzer der Ketten vorhanden, bekannte Doku-Abweichungen
     4  Ketten und Verzeichnisse zur Laufzeit (jvAktionen, jvFotoKette, jvSpeakKette, jvCommands, jvChain, jvSuchQuellen, jvFaehigkeiten, jvMeldungen, jvRegeln)
     5  Klassifikation aller Produkt-JS-Dateien A–E mit Dead-Code-Erkennung (E und D bleiben leer, solange der Erkenner nichts findet)
     6  Reste: Rückfallzweige, Property-Kopien, Guard-Marker, Testhaken, Duplikate
     7  Testbestand, Doku-Bestand, CI-Konsistenz (Workflow), verwaiste Dateien, Service Worker, Android, API
     8  Gegenproben (nur der Prüf-Eingang wird im Speicher verändert, nie eine Datei)
   Start: node tests/inventar8a.js        Soll neu schreiben (nur bewusst!): node tests/inventar8a.js --schreiben        Tabelle der Dateien: --tabelle
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path'), zlib = require('zlib');
const ROOT = path.join(__dirname, '..');
const SOLL = path.join(__dirname, 'inventar8a_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben'), TABELLE = process.argv.includes('--tabelle');
let ok = 0, fehler = 0;
function check(n, c, extra) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + n + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); } }
const J = x => JSON.stringify(x), gleich = (a, b) => J(a) === J(b);

/* ---------- Leser: alles geht über dieses Objekt, damit die Gegenproben den Eingang verändern können ---------- */
function leser(ueber) {
    ueber = ueber || {};
    const geloescht = new Set(ueber.geloescht || []), zusatz = ueber.zusatz || {}, ersatz = ueber.ersatz || {};
    return {
        gibt(p) { return !geloescht.has(p) && (p in zusatz || fs.existsSync(path.join(ROOT, p))); },
        lies(p) { if (geloescht.has(p)) throw new Error('fehlt: ' + p); if (p in zusatz) return zusatz[p]; const t = fs.readFileSync(path.join(ROOT, p), 'utf8'); return ersatz[p] ? ersatz[p](t) : t; },
        liste(d) { const a = fs.readdirSync(path.join(ROOT, d)).map(f => d + '/' + f).filter(p => !geloescht.has(p)); Object.keys(zusatz).filter(p => path.dirname(p) === d).forEach(p => { if (!a.includes(p)) a.push(p); }); return a.sort(); }
    };
}
function dateien(L, d, rx) { return L.liste(d).filter(p => rx.test(p)).map(p => path.basename(p)); }

/* ---------- 1/2  Zahlen und index.html ---------- */
function zahlen(L) {
    const js = dateien(L, 'js', /\.js$/), idx = L.lies('index.html');
    const alleDateien = (function lauf(d, n) { let c = 0; for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { if (e.name === '.git' || e.name === 'node_modules') continue; const p = d ? d + '/' + e.name : e.name; c += e.isDirectory() ? lauf(p) : 1; } return c; })('');
    const gesamt = Buffer.concat(js.map(f => Buffer.from(L.lies('js/' + f))));
    const tags = [...idx.matchAll(/<script\b[^>]*>/g)].map(m => m[0]);
    const eigene = tags.filter(t => /src="\.\/js\//.test(t)).length, dritt = tags.filter(t => /src="https?:/.test(t)).length, inline = tags.filter(t => !/\bsrc=/.test(t)).length;
    const ls = d => L.liste(d);
    return {
        repoDateien: alleDateien, produktJs: js.length, jsZeilen: gesamt.toString().split('\n').length - 1 + js.length - js.length, jsBytes: gesamt.length, jsGzip: zlib.gzipSync(gesamt, { level: 9 }).length,
        scriptTags: tags.length, eigeneScripts: eigene, drittScripts: dritt, inlineScripts: inline,
        api: ls('api').length, testsGesamt: ls('tests').length, testsJs: dateien(L, 'tests', /\.js$/).length, testsMd: dateien(L, 'tests', /\.md$/).length, testsJson: dateien(L, 'tests', /\.json$/).length,
        workflows: ls('.github/workflows').length, weckrufSrc: ls('weckruf-src').length, weckrufTest: ls('weckruf-test').length, tools: ls('tools').length, models: ls('models').length,
        assets: ['icon-192.png', 'icon-512.png', 'beispielrechnung.jpg', 'style.css', 'manifest.json'].filter(p => L.gibt(p)).length
    };
}
function indexBefunde(L) {
    const idx = L.lies('index.html'), js = dateien(L, 'js', /\.js$/);
    const tags = [...idx.matchAll(/<script\b[^>]*src="\.\/js\/([^"?]+)(\?v=([^"]*))?"/g)].map(m => ({ f: m[1], v: m[3] }));
    const namen = tags.map(t => t.f), doppelt = namen.filter((n, i) => namen.indexOf(n) !== i);
    return {
        doppelt: Array.from(new Set(doppelt)), fehlendeDatei: namen.filter(n => !js.includes(n)), ohneTag: js.filter(n => !namen.includes(n)), ohneStempel: tags.filter(t => !t.v).map(t => t.f),
        drittHosts: Array.from(new Set([...idx.matchAll(/<script\b[^>]*src="(https?:\/\/[^"/]+)/g)].map(m => m[1]))).sort(),
        pos: o => namen.indexOf(o) + 1, namen
    };
}
const KETTEN_DATEIEN = ['aktionen_kette.js', 'foto_kette.js', 'speak_kette.js', 'commands.js', 'meldungen.js', 'meldungs_regeln.js', 'faehigkeiten.js'];
const WICHTIG = ['ARCHITEKTUR.md', 'LANDKARTE.md', 'CLAUDE.md', 'index.html', 'sw.js', 'manifest.json', '.github/workflows/tests.yml', 'tools/stempel.js', 'tests/umgebung.js', 'tests/landkarte.js'];

/* Eingangsprüfung: liefert eine Liste von Meldungen (leer = alles in Ordnung). Dieselbe Funktion prüft die Gegenproben. */
function konsistenz(L) {
    const m = [], idx = indexBefunde(L), js = dateien(L, 'js', /\.js$/);
    for (const p of WICHTIG) if (!L.gibt(p)) m.push('wichtige Datei fehlt: ' + p);
    if (idx.doppelt.length) m.push('Script doppelt geladen: ' + idx.doppelt.join(','));
    if (idx.fehlendeDatei.length) m.push('Script-Tag ohne Datei: ' + idx.fehlendeDatei.join(','));
    if (idx.ohneTag.length) m.push('js-Datei ohne Script-Tag: ' + idx.ohneTag.join(','));
    if (idx.ohneStempel.length) m.push('Script ohne Stempel: ' + idx.ohneStempel.join(','));
    for (const f of KETTEN_DATEIEN) if (!js.includes(f)) m.push('Chain-Datei fehlt: ' + f);
    if (L.gibt('LANDKARTE.md')) {
        const md = L.lies('LANDKARTE.md'), teil4 = md.slice(md.indexOf('## 4.'));
        for (const n of js.map(f => f.slice(0, -3))) if ((teil4.match(new RegExp('`' + n + '`', 'g')) || []).length !== 1) m.push('Landkarte: Produktdatei nicht genau einmal zugeordnet: ' + n);
    }
    for (const d of ['ARCHITEKTUR.md', 'LANDKARTE.md']) if (L.gibt(d)) for (const p of Array.from(new Set(L.lies(d).match(/\bjs\/[a-z0-9_]+\.js\b/g) || []))) if (!L.gibt(p)) m.push('Doku nennt nicht vorhandene Datei: ' + d + ' -> ' + p);
    return m;
}

/* ---------- 5  Klassifikation und Dead-Code-Erkennung ---------- */
function fakten(L) {
    const js = dateien(L, 'js', /\.js$/), T = {}; js.forEach(f => { T[f] = L.lies('js/' + f); });
    const html = L.lies('index.html').replace(/<script[^>]*src[^>]*>/g, '');
    const java = L.liste('weckruf-src').filter(p => /\.(java|xml)$/.test(p)).map(p => L.lies(p)).join('\n'), api = L.liste('api').map(p => L.lies(p)).join('\n');
    const out = {};
    for (const f of js) {
        const t = T[f], names = new Set();
        for (const m of t.matchAll(/^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
        for (const m of t.matchAll(/^(?:const|let|var)\s+([A-Za-z_$][\w$]*)/gm)) names.add(m[1]);
        for (const m of t.matchAll(/window\.([A-Za-z_$][\w$]*)\s*=[^=]/g)) names.add(m[1]);
        let ext = 0;
        for (const n of names) {
            if (n.length < 4) continue;
            const re = new RegExp('(?:(?<![\\w$.])|(?<=window\\.))' + n.replace(/\$/g, '\\$') + '(?![\\w$])');
            if (js.some(g => g !== f && re.test(T[g])) || re.test(html) || new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b').test(java) || new RegExp('\\b' + n.replace(/\$/g, '\\$') + '\\b').test(api)) ext++;
        }
        const wirkung = /jvCommands\.use|jvAktionen\.|jvChain\.|jvSpeakKette\.|jvFotoKette\.|jvKiText|jvSuchQuellen|jvFaehigkeiten\.|jvMeldungen\.|jvRegeln\.|addEventListener|\.on[a-z]+\s*=[^=]|setInterval|setTimeout|requestAnimationFrame|MutationObserver|fetch\(|apiFetch\(|ZaneBridge|ZaneNative|window\[[a-zA-Z_]+\]\s*=|window\.[A-Za-z_$][\w$]*\s*=\s*function|document\.(?:body|getElementById|createElement)/.test(t);
        out[f] = { zeilen: t.split('\n').length, bytes: Buffer.byteLength(t), ext, wirkung };
    }
    return out;
}
const C_MUSTER = [/else\s+window\.executeAction\s*=\s*baue\(/, /Object\.keys\(original\)\.forEach\(k => \{ try \{ wrapped\[k\] = original\[k\]/];
function klassifiziere(L) {
    const F = fakten(L), K = {};
    for (const f of Object.keys(F)) {
        const t = L.lies('js/' + f), x = F[f];
        if (!x.wirkung && x.ext === 0) K[f] = 'D';                        // keine Wirkung, keine Nutzer: verdächtig tot (Beweis fehlt noch)
        else if (C_MUSTER.some(r => r.test(t))) K[f] = 'C';              // aktive Datei mit überholtem Rückfallzweig / alter Eigenschaftskopie
        else if (x.zeilen <= 60 && x.bytes <= 4500) K[f] = 'B';          // klein, aber eigene Verantwortung
        else K[f] = 'A';
    }
    return K;
}

/* ---------- 6  Reste ---------- */
function reste(L) {
    const js = dateien(L, 'js', /\.js$/), T = {}; js.forEach(f => { T[f] = L.lies('js/' + f); });
    const dateienMit = rx => js.filter(f => rx.test(T[f]));
    const guard = {}; for (const f of js) { const n = (T[f].match(/\b(?:wrapped|neu|orig|original|alt|w|o|hooked|window\.[A-Za-z]+|proto|[a-z]+)\._[a-zA-Z]+\s*=\s*true/g) || []).length; if (n) guard[f] = n; }
    return {
        rueckfallAktionen: dateienMit(/else\s+window\.executeAction\s*=\s*baue\(/), eigenschaftsKopie: dateienMit(/Object\.keys\(original\)\.forEach\(k => \{ try \{ wrapped\[k\] = original\[k\]/),
        testhaken: dateienMit(/window\._[a-zA-Z]+Test\s*=/), guardMarkerDateien: Object.keys(guard).length, guardMarkerGesamt: Object.values(guard).reduce((a, b) => a + b, 0),
        rueckfallFotoSpeak: dateienMit(/jvFotoKette[^\n]*else|jvSpeakKette[^\n]*else/)
    };
}
function duplikate(L) {
    const js = dateien(L, 'js', /\.js$/), gruppen = {}, globalNamen = {}, lokal = {};
    function funcs(t) {
        const out = [], re = /(?:^|\n)([ \t]*)(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g; let m;
        while ((m = re.exec(t))) {
            let i = re.lastIndex, d = 1;
            while (i < t.length && d > 0) { const c = t[i]; if (c === '{') d++; else if (c === '}') d--; else if (c === '"' || c === "'" || c === '`') { const q = c; i++; while (i < t.length && t[i] !== q) { if (t[i] === '\\') i++; i++; } } else if (c === '/' && t[i + 1] === '/') { while (i < t.length && t[i] !== '\n') i++; } else if (c === '/' && t[i + 1] === '*') { i = t.indexOf('*/', i + 2); if (i < 0) break; i++; } i++; }
            out.push({ name: m[2], indent: m[1].length, body: t.slice(m.index, i) });
        }
        return out;
    }
    const norm = b => b.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
    for (const f of js) for (const fn of funcs(L.lies('js/' + f))) {
        const n = norm(fn.body);
        if (n.length >= 150) (gruppen[n] = gruppen[n] || []).push(f + ':' + fn.name);
        if (fn.indent === 0) (globalNamen[fn.name] = globalNamen[fn.name] || new Set()).add(f);
        else (lokal[fn.name] = lokal[fn.name] || {})[n] = (lokal[fn.name][n] || 0) + 1;
    }
    const hilfen = {};
    for (const nm of ['norm', 'sagen', 'say', 'lsGet', 'lsSet', 'esc', 'befehl']) if (lokal[nm]) hilfen[nm] = { kopien: Object.values(lokal[nm]).reduce((a, b) => a + b, 0), fassungen: Object.keys(lokal[nm]).length };
    return {
        identischeGruppen: Object.values(gruppen).filter(a => a.length > 1).length, identischeStellen: Object.values(gruppen).filter(a => a.length > 1).reduce((a, g) => a + g.length, 0),
        grosseGruppen: Object.values(gruppen).filter(a => a.length > 1).map(g => g.join(' = ')).filter(s => /kennenlernen\.js:ruhig|mail_nacht\.js:rohMail/.test(s)),
        gleichnamigeGlobale: Object.entries(globalNamen).filter(([, s]) => s.size > 1).map(([n]) => n), lokaleHilfen: hilfen
    };
}

/* ---------- 7  Tests, Doku, CI, Orphans, SW, Android, API ---------- */
const TEST_KLASSE = {
    regression: ['lauf', 'aktionen_kette', 'jarvis_pruefstrecke', 'faehigkeiten', 'handyapp', 'antwort', 'mehrfachfrage', 'c1_stufe1', 'meldungen', 'regeln', 'hintergrund_6b1', 'hintergrund_6b2', 'memory7b', 'verkehr', 'dirigent_fragen', 'pending_reihenfolge'],
    goldenMaster: ['aktionen', 'reihenfolge', 'sprache', 'globale', 'wirkungslos', 'suche', 'kitext', 'hintergrund'],
    inventar: ['landkarte', 'timer', 'inventar8a'],
    historischEingefroren: ['memory7a'],
    hilfe: ['umgebung', 'aktionen_szenarien', 'hintergrund_6b1_szenarien', 'hintergrund_6b1_welt', 'hintergrund_6b2_szenarien', 'hintergrund_analyse', 'hintergrund_auswertung', 'meldungen_auswertung', 'meldungen_welt', 'regeln_bericht', 'regeln_entwurf', 'timer_inventar', 'timer_scan', 'vektor_hilfen', 'memory7a_server', 'memory7a_szenarien', 'memory7a_welt', 'memory7b_alt'],
    werkzeugLokal: ['hintergrund_doku', 'hintergrund_messen', 'memory7a_messen', 'memory7b_messen']
};
const MOEGLICH_UEBERLAPPEND = ['aktionen', 'hintergrund', 'memory7a'];   // nur Hinweis, kein Löschgrund (siehe tests/inventar8a-analyse.md)
const DOKU_KLASSE = {
    aktuell: ['ARCHITEKTUR.md', 'LANDKARTE.md', 'CLAUDE.md', 'tests/memory7b-analyse.md', 'tests/hintergrund-6b1.md', 'tests/hintergrund-6b2.md', 'tests/kitext-ist-zustand.md', 'tests/suche-ist-zustand.md', 'tests/inventar8a-analyse.md'],
    momentaufnahme: ['tests/ist-zustand.md', 'tests/sprache-ist-zustand.md', 'tests/globale-ist-zustand.md', 'tests/wirkungslos-analyse.md', 'tests/hintergrund-analyse.md', 'tests/hintergrund-tabelle.md', 'tests/meldungen-bericht.md', 'tests/regeln-bericht.md', 'tests/memory7a-analyse.md']
};
function testbestand(L) {
    const t = dateien(L, 'tests', /\.js$/).map(f => f.slice(0, -3)), wf = L.lies('.github/workflows/tests.yml');
    const klasse = {}; for (const [k, a] of Object.entries(TEST_KLASSE)) a.forEach(n => { klasse[n] = k; });
    const imWorkflow = Array.from(wf.matchAll(/node tests\/([a-z0-9_]+)\.js/g)).map(m => m[1]);
    return {
        unklassifiziert: t.filter(n => !klasse[n]), klasseOhneDatei: Object.keys(klasse).filter(n => !t.includes(n)),
        workflowOhneDatei: imWorkflow.filter(n => !t.includes(n)), workflowDoppelt: imWorkflow.filter((n, i) => imWorkflow.indexOf(n) !== i),
        regressionNichtImWorkflow: t.filter(n => ['regression', 'goldenMaster', 'inventar', 'historischEingefroren'].includes(klasse[n]) && !imWorkflow.includes(n)),
        imWorkflow: imWorkflow.length, jeKlasse: Object.fromEntries(Object.entries(TEST_KLASSE).map(([k, a]) => [k, a.length]))
    };
}
function dokubestand(L) {
    const md = ['ARCHITEKTUR.md', 'LANDKARTE.md', 'CLAUDE.md'].concat(L.liste('tests').filter(p => /\.md$/.test(p)));
    const klasse = {}; for (const [k, a] of Object.entries(DOKU_KLASSE)) a.forEach(n => { klasse[n] = k; });
    const markiert = md.filter(p => /Nachtrag|Stand Phase|historisch|überholt|Stand vor/i.test(L.lies(p)));
    return { unklassifiziert: md.filter(p => !klasse[p]), klasseOhneDatei: Object.keys(klasse).filter(p => !L.gibt(p)), momentaufnahmeOhneHistorischHinweis: DOKU_KLASSE.momentaufnahme.filter(p => !markiert.includes(p)).sort(), anzahl: md.length };
}
function dokuRegeln8b(L) {
    const ar = L.lies('ARCHITEKTUR.md'), lk = L.lies('LANDKARTE.md'), n = dateien(L, 'js', /\.js$/).length, m = [];
    const zahl = (ar.match(/`js\/` \((\d+) Skripte\)/) || [])[1];
    if (Number(zahl) !== n) m.push('ARCHITEKTUR.md nennt ' + zahl + ' Skripte, vorhanden sind ' + n);
    if (!new RegExp('Stand: [^\\n]*' + n + ' Produkt-JS').test(ar) && !new RegExp(n + ' Produktdateien').test(lk)) m.push('Produktzahl im Kopf der Doku fehlt/falsch');
    const k = ar.indexOf('## Bekannte offene technische Punkte');
    if (k < 0) m.push('Abschnitt "Bekannte offene technische Punkte" fehlt');
    else {
        const abschnitt = ar.slice(k, ar.indexOf('\n## ', k + 5) < 0 ? undefined : ar.indexOf('\n## ', k + 5));
        for (const d of ['tests/memory7a-analyse.md', 'tests/memory7b-analyse.md', 'tests/inventar8a-analyse.md']) { if (!abschnitt.includes(d)) m.push('offene Punkte verweisen nicht auf ' + d); if (!L.gibt(d)) m.push('Analyse-Verweis existiert nicht: ' + d); }
        for (const d of Array.from(new Set(abschnitt.match(/tests\/[a-z0-9_-]+\.md/g) || []))) if (!L.gibt(d)) m.push('Analyse-Verweis existiert nicht: ' + d);
        if (!/keine automatisch zu behebenden Fehler/.test(abschnitt)) m.push('Hinweis "keine automatisch zu behebenden Fehler" fehlt');
    }
    for (const d of ['tests/ist-zustand.md', 'tests/hintergrund-tabelle.md', 'tests/meldungen-bericht.md', 'tests/regeln-bericht.md', 'tests/memory7a-analyse.md']) if (L.gibt(d) && !/^> \*\*Historische Momentaufnahme/m.test(L.lies(d).slice(0, 400))) m.push('Momentaufnahme nicht eindeutig markiert: ' + d);
    return m;
}
function ci(L) {
    const wf = L.lies('.github/workflows/tests.yml');
    const schritte = Array.from(wf.matchAll(/node (tests\/[a-z0-9_]+\.js)/g)).map(m => m[1]);
    const tzFix = f => /process\.env\.TZ\s*=/.test(L.lies(f));
    return { nodeVersion: (wf.match(/node-version:\s*'?([0-9]+)/) || [])[1], schritte: schritte.length, fehlendeDatei: schritte.filter(p => !L.gibt(p)), zeitzoneImWorkflow: /\bTZ:/.test(wf), zeitzonenVertragZentral: /^process\.env\.TZ\s*=\s*'Europe\/Berlin';/m.test(L.lies('tests/umgebung.js')), vertragVorErstemRequire: (function () { const u = L.lies('tests/umgebung.js'); const a = u.search(/^process\.env\.TZ\s*=/m), b = u.indexOf("require('fs')"); return a >= 0 && a < b; })(), nutzerOhneVertrag: ['sprache', 'globale'].filter(n => !/require\('\.\/umgebung\.js'\)/.test(L.lies('tests/' + n + '.js'))), zeitzoneFixiert: Object.fromEntries(['tests/sprache.js', 'tests/globale.js', 'tests/memory7a.js', 'tests/memory7b.js', 'tests/umgebung.js'].map(f => [f, tzFix(f)])), npmInstall: /npm (ci|install)/.test(wf), vollerGitVerlauf: /actions\/checkout@v4\s*\n\s*with:\s*\n\s*fetch-depth:\s*0\b/.test(wf), testsMitGit: dateien(L, 'tests', /\.js$/).filter(f => /execSync\([^)]*git show/.test(L.lies('tests/' + f))), workflows: L.liste('.github/workflows').map(p => path.basename(p)) };
}
function orphans(L) {
    const alle = []; (function lauf(d) { for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) { if (e.name === '.git' || e.name === 'node_modules') continue; const p = d ? d + '/' + e.name : e.name; if (e.isDirectory()) lauf(p); else alle.push(p); } })('');
    const text = {}; alle.forEach(p => { if (/\.(js|md|json|html|java|xml|yml|css|txt|py|gradle)$/.test(p) || p === 'CLAUDE.md') text[p] = fs.readFileSync(path.join(ROOT, p), 'utf8'); });
    return alle.filter(p => !/^(js|api|weckruf-src|\.github)\//.test(p)).filter(p => { const b = path.basename(p); return !Object.keys(text).some(q => q !== p && text[q].includes(b)); }).concat(alle.filter(p => /^weckruf-src\//.test(p)).filter(p => { const b = path.basename(p).replace(/\.[^.]+$/, ''); return !Object.keys(text).some(q => q !== p && text[q].includes(b)); })).sort();
}
function android(L) {
    const java = L.liste('weckruf-src').filter(p => /\.java$/.test(p)).map(p => L.lies(p)).join('\n'), js = dateien(L, 'js', /\.js$/).map(f => L.lies('js/' + f)).join('\n') + L.lies('index.html');
    const meth = Array.from(java.matchAll(/@JavascriptInterface\s*\n?\s*public\s+[\w<>\[\]]+\s+(\w+)\s*\(/g)).map(m => m[1]);
    const genutzt = new Set(Array.from(js.matchAll(/Zane(?:Native|Bridge)\.(\w+)/g)).map(m => m[1]));
    const rueckrufe = Array.from(new Set(Array.from(java.matchAll(/window\.(jv[A-Za-z]+|__zane[A-Za-z]*|zane[A-Za-z]+)/g)).map(m => m[1]))).sort();
    return { nativeMethoden: meth.length, ungenutzteNative: meth.filter(m => !new RegExp('\\b' + m + '\\b').test(js)), jsRuftFehlendeNative: Array.from(genutzt).filter(n => !meth.includes(n)).sort(), webRueckrufe: rueckrufe, rueckrufeOhneJs: rueckrufe.filter(n => !new RegExp('\\b' + n + '\\b').test(js)) };
}
function apiBefund(L) {
    const dateienApi = dateien(L, 'api', /\.js$/), clients = L.liste('js').map(p => L.lies(p)).join('\n') + L.lies('vercel.json') + L.lies('sw.js') + L.liste('weckruf-src').filter(p => /\.java$/.test(p)).map(p => L.lies(p)).join('\n');
    return { dateien: dateienApi.length, hobbyGrenzeOk: dateienApi.length <= 12, ohneClient: dateienApi.filter(f => !new RegExp('api/' + f.slice(0, -3) + '\\b').test(clients) && !(f === 'maps.js' || f === 'groq.js')) };
}
function serviceWorker(L) {
    const sw = L.lies('sw.js'), mf = JSON.parse(L.lies('manifest.json'));
    return { fetchHandler: /addEventListener\(\s*'fetch'/.test(sw), cacheListe: /caches\.(open|match)|cache\.addAll/.test(sw), pushHandler: /addEventListener\(\s*'push'/.test(sw), manifestIcons: (mf.icons || []).map(i => i.src), iconsVorhanden: (mf.icons || []).every(i => L.gibt(i.src.replace(/^\.\//, ''))) };
}

/* ---------- 4  Ketten zur Laufzeit ---------- */
function laufzeit(opt) {
    const { starte } = require('./umgebung.js');
    const A = starte(Object.assign({ sekundenTakt: true, festerZufall: true }, opt || {}));
    const ev = e => { try { return A.vm.runInContext(e, A.sb); } catch (x) { return { fehler: String(x.message).slice(0, 80) }; } };
    const lst = (kette, f) => { const l = ev(kette + '.liste()'); return Array.isArray(l) ? l : null; };
    const dupl = l => l.filter((x, i) => l.findIndex(y => y.rang === x.rang) !== i).length;
    const A1 = ev('jvAktionen.liste()'), P1 = ev('jvAktionen.pruefe()');
    const foto = ev('jvFotoKette.liste()'), fotoP = ev('jvFotoKette.pruefe()'), spk = ev('jvSpeakKette.liste()'), spkP = ev('jvSpeakKette.pruefe()');
    const cmd = ev('jvCommands.list()'), chain = ev('jvChain.list()');
    const faeh = ev('JSON.parse(JSON.stringify(jvFaehigkeiten.liste))');
    const cmdRaenge = Array.isArray(cmd) ? cmd.map(s => String(s).split(' ')[0]) : [];
    return {
        aktionen: { eintraege: A1.length, doppelteRaenge: dupl(A1), vollstaendig: P1.vollstaendig },
        foto: { methoden: Object.keys(foto).length, eintraegeGesamt: Object.values(foto).reduce((a, l) => a + l.length, 0), doppelteRaenge: Object.values(foto).reduce((a, l) => a + dupl(l), 0), vollstaendig: fotoP.vollstaendig },
        speak: { eintraege: spk.length, doppelteRaenge: dupl(spk), vollstaendig: spkP.vollstaendig },
        commands: { eintraege: cmd.length, gleicherRangMehrfach: cmdRaenge.filter((r, i) => cmdRaenge.indexOf(r) !== i).length },
        chain: { eintraege: Array.isArray(chain) ? chain.length : chain },
        suchQuellen: ev('jvSuchQuellen.map(x=>x&&x.name||"?")'),
        meldungen: { methoden: ev('Object.keys(jvMeldungen).length') }, regeln: { methoden: ev('Object.keys(jvRegeln).length') },
        faehigkeiten: { anzahl: faeh.length, ids: faeh.map(c => c.id), moduleDateien: Array.from(new Set(faeh.flatMap(c => (c.module || []).filter(m => /^js\/.+\.js$/.test(m))))).sort() },
        ladefehler: A.ladefehler
    };
}

/* ---------- Alles zusammen ---------- */
function messen() {
    const L = leser(), K = klassifiziere(L), idx = indexBefunde(L);
    const je = { A: 0, B: 0, C: 0, D: 0, E: 0 }; Object.values(K).forEach(k => { je[k]++; });
    const F = fakten(L), caps = laufzeit();
    const js = dateien(L, 'js', /\.js$/);
    const moduleSet = new Set(caps.faehigkeiten.moduleDateien.map(m => m.replace(/^js\//, '')));
    return {
        zahlen: zahlen(L),
        index: { doppelt: idx.doppelt, fehlendeDatei: idx.fehlendeDatei, ohneTag: idx.ohneTag, ohneStempel: idx.ohneStempel, drittHosts: idx.drittHosts, positionen: { 'actions.js': idx.pos('actions.js'), 'aktionen_kette.js': idx.pos('aktionen_kette.js'), 'places.js': idx.pos('places.js'), 'foto_kette.js': idx.pos('foto_kette.js'), 'voice.js': idx.pos('voice.js'), 'speak_kette.js': idx.pos('speak_kette.js'), 'commands.js': idx.pos('commands.js'), 'storage.js': idx.pos('storage.js') } },
        konsistenz: konsistenz(L), doku8b: dokuRegeln8b(L), klasse: K, klassenZahl: je, kleineDateien: js.filter(f => F[f].zeilen <= 80).sort(), reste: reste(L), duplikate: duplikate(L),
        ketten: caps, capabilityNichtReferenziert: js.filter(f => !moduleSet.has(f)).length, tests: testbestand(L), doku: dokubestand(L), ci: ci(L), verwaiste: orphans(L), serviceWorker: serviceWorker(L), android: android(L), api: apiBefund(L),
        dokuAbweichungen: {
            architekturStandZeile: (L.lies('ARCHITEKTUR.md').match(/^Stand: [^\n]*/m) || [''])[0].slice(0, 80), architekturSkriptzahl: (L.lies('ARCHITEKTUR.md').match(/js\/` \((\d+) Skripte\)/) || [])[1] || null,
            landkarteStandZeile: (L.lies('LANDKARTE.md').match(/^Stand: [^\n]*/m) || [''])[0].slice(0, 60), architekturProjektstandAbschnitt: (L.lies('ARCHITEKTUR.md').match(/## 8\. Projektstand[^\n]*/) || [''])[0]
        }
    };
}

/* ---------- Tabelle (--tabelle) ---------- */
function tabelle(m) {
    const L = leser(), F = fakten(L), idx = indexBefunde(L);
    const kopf = '| Datei | Klasse | Zeilen | Ladeposition | Nutzer außerhalb | Wirkung |\n|---|---|---|---|---|---|\n';
    return kopf + Object.keys(m.klasse).sort().map(f => `| ${f} | ${m.klasse[f]} | ${F[f].zeilen} | ${idx.pos(f)} | ${F[f].ext} | ${F[f].wirkung ? 'ja' : 'nein'} |`).join('\n') + '\n';
}

(async () => {
    const m = messen();
    if (TABELLE) { console.log(tabelle(m)); return; }
    /* Phase 1 = Stand vor Phase 2 (main f8e6db1), einmal gemessen und hier festgehalten */
    const PHASE1 = { repoDateien: 250, produktJs: 167, jsZeilen: 43178, jsBytes: 3032680, jsGzip: 908760, eigeneScripts: 167, drittScripts: 2, inlineScripts: 5, api: 11, testsJs: 17, testsGesamt: 22, workflows: 3, weckrufSrc: 26 };
    const ist = m;
    if (SCHREIBEN) { fs.writeFileSync(SOLL, JSON.stringify(Object.assign({ phase1: PHASE1 }, ist), null, 1) + '\n'); console.log('Soll geschrieben: ' + SOLL); }
    else if (!fs.existsSync(SOLL)) check('Golden Master vorhanden (tests/inventar8a_soll.json)', false);
    else {
        const soll = JSON.parse(fs.readFileSync(SOLL, 'utf8')), istJ = JSON.parse(J(ist));
        for (const k of Object.keys(soll)) { if (k === 'phase1') continue; check('Golden Master: ' + k, gleich(soll[k], istJ[k]), { soll: J(soll[k]).slice(0, 120), ist: J(istJ[k]).slice(0, 120) }); }
        check('Golden Master: keine zusätzlichen Bereiche', gleich(Object.keys(soll).filter(k => k !== 'phase1'), Object.keys(istJ)));
        check('Phase-1-Zahlen unverändert festgehalten', gleich(soll.phase1, PHASE1));
    }
    /* Inhaltliche Erwartungen (unabhängig vom Golden Master) */
    const z = m.zahlen;
    check('Zahlen: eigene Script-Tags = Produkt-JS-Dateien', z.eigeneScripts === z.produktJs, z);
    check('Zahlen: Vercel Hobby höchstens 12 Functions', z.api <= 12, z.api);
    check('Zahlen: weiterhin 2 Drittanbieter-Scripts und 5 Inline-Scripts (wie Phase 1)', z.drittScripts === 2 && z.inlineScripts === 5);
    check('Zahlen: nur 2 neue Produktdateien seit Phase 1 (foto_kette, speak_kette)', z.produktJs - PHASE1.produktJs === 2);
    check('index.html: keine doppelten, fehlenden oder verwaisten Skripte, alle mit Stempel', m.konsistenz.filter(x => /Script|js-Datei/.test(x)).length === 0, m.konsistenz);
    check('Konsistenz: ganze Eingangsprüfung ohne Meldung', m.konsistenz.length === 0, m.konsistenz);
    const p = m.index.positionen;
    check('Reihenfolge: aktionen_kette direkt nach actions.js', p['aktionen_kette.js'] === p['actions.js'] + 1);
    check('Reihenfolge: foto_kette nach places.js, speak_kette nach voice.js, commands.js vor den Ketten-Nutzern', p['foto_kette.js'] > p['places.js'] && p['speak_kette.js'] > p['voice.js'] && p['commands.js'] > 0);
    check('Klassifikation: jede Datei genau eine Klasse, Summe = Produktdateien', Object.keys(m.klasse).length === z.produktJs && Object.values(m.klassenZahl).reduce((a, b) => a + b, 0) === z.produktJs);
    check('Klassifikation: keine Datei der Klasse E (nachweislich tot) und keine der Klasse D (verdächtig tot)', m.klassenZahl.E === 0 && m.klassenZahl.D === 0, m.klassenZahl);
    check('Klassifikation: Klasse C = die acht Dateien mit Rückfallzweig der Aktions-Kette', gleich(Object.keys(m.klasse).filter(f => m.klasse[f] === 'C').sort(), m.reste.rueckfallAktionen.slice().sort()) && m.reste.rueckfallAktionen.length === 8, m.reste.rueckfallAktionen);
    check('Ketten: Aktions-, Foto-, Speak-Kette vollständig und ohne doppelte Ränge', m.ketten.aktionen.vollstaendig && m.ketten.foto.vollstaendig && m.ketten.speak.vollstaendig && m.ketten.aktionen.doppelteRaenge + m.ketten.foto.doppelteRaenge + m.ketten.speak.doppelteRaenge === 0);
    check('Ketten: App lädt ohne Ladefehler', m.ketten.ladefehler.length === 0, m.ketten.ladefehler);
    check('Capability: alle genannten Dateien existieren', m.ketten.faehigkeiten.moduleDateien.every(x => fs.existsSync(path.join(ROOT, x))));
    check('Duplikate: keine gleichnamigen globalen Funktionen in mehreren Dateien', m.duplikate.gleichnamigeGlobale.length === 0, m.duplikate.gleichnamigeGlobale);
    check('Testbestand: jede Testdatei klassifiziert, Workflow-Schritte existieren, keine Regressionsprüfung fehlt im Workflow', m.tests.unklassifiziert.length === 0 && m.tests.workflowOhneDatei.length === 0 && m.tests.klasseOhneDatei.length === 0 && m.tests.workflowDoppelt.length === 0 && m.tests.regressionNichtImWorkflow.length === 0, m.tests);
    check('Doku: jede .md klassifiziert', m.doku.unklassifiziert.length === 0 && m.doku.klasseOhneDatei.length === 0, m.doku);
    check('Android: keine native Methode ungenutzt, keine fehlende, jeder Rückruf hat ein Ziel im Web-Code', m.android.ungenutzteNative.length === 0 && m.android.jsRuftFehlendeNative.length === 0 && m.android.rueckrufeOhneJs.length === 0, m.android);
    check('API: Funktionsgrenze eingehalten, jede Datei hat einen Aufrufer', m.api.hobbyGrenzeOk && m.api.ohneClient.length === 0, m.api);
    check('Service Worker: nur Push, kein fetch-Handler, keine Cache-Liste; Manifest-Icons vorhanden', m.serviceWorker.pushHandler && !m.serviceWorker.fetchHandler && !m.serviceWorker.cacheListe && m.serviceWorker.iconsVorhanden);
    /* Phase 8B: Zeitzonen-Vertrag der Testwelt und Enddokumentation (Soll bleibt grün, solange der Vertrag steht) */
    check('CI-Vertrag: umgebung.js setzt die Zeitzone zentral auf Europe/Berlin, und zwar vor dem ersten require', m.ci.zeitzonenVertragZentral && m.ci.vertragVorErstemRequire, m.ci);
    check('CI-Vertrag: sprache.js und globale.js hängen an umgebung.js (erben den Vertrag), Node-Version im Workflow unverändert 20', m.ci.nutzerOhneVertrag.length === 0 && m.ci.nodeVersion === '20', m.ci);
    check('CI-Vertrag: Workflow holt den vollen Git-Verlauf (fetch-depth: 0), solange ein Test `git show` nutzt', m.ci.testsMitGit.length === 0 || m.ci.vollerGitVerlauf, m.ci);
    check('Doku 8B: Produktzahl, offene Punkte mit Verweisen, Momentaufnahmen markiert', m.doku8b.length === 0, m.doku8b);
    check('Doku 8B: kein Momentaufnahme-Dokument ohne Hinweis mehr', m.doku.momentaufnahmeOhneHistorischHinweis.length === 0, m.doku.momentaufnahmeOhneHistorischHinweis);

    /* ---------- 8  Gegenproben ---------- */
    const idxText = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), lkText = fs.readFileSync(path.join(ROOT, 'LANDKARTE.md'), 'utf8'), arText = fs.readFileSync(path.join(ROOT, 'ARCHITEKTUR.md'), 'utf8');
    const erkannt = (name, ueber, rx) => { const mm = konsistenz(leser(ueber)); check('Gegenprobe: ' + name, mm.some(x => rx.test(x)), mm); };
    check('Kontrolle: unveränderter Eingang ergibt keine Meldung', konsistenz(leser()).length === 0);
    check('Kontrolle: Leerzeichen in der Landkarte ändern nichts', konsistenz(leser({ ersatz: { 'LANDKARTE.md': t => t + '\n \n' } })).length === 0);
    erkannt('Produktdatei fehlt in der Landkarte', { ersatz: { 'LANDKARTE.md': t => t.replace(/`mimik`/g, 'mimik') } }, /Landkarte: .*mimik/);
    erkannt('Produktdatei steht zweimal in der Landkarte', { ersatz: { 'LANDKARTE.md': t => t + '\n- `mimik` nochmal\n' } }, /Landkarte: .*mimik/);
    erkannt('Script doppelt geladen', { ersatz: { 'index.html': t => t.replace(/(<script[^>]*src="\.\/js\/mimik\.js[^>]*><\/script>)/, '$1\n$1') } }, /Script doppelt geladen: mimik\.js/);
    erkannt('Script-Datei fehlt', { geloescht: ['js/mimik.js'] }, /Script-Tag ohne Datei: mimik\.js/);
    erkannt('verwaister Script-Tag auf nicht vorhandene Datei', { ersatz: { 'index.html': t => t.replace('</body>', '<script src="./js/gibtes_nicht.js?v=1"></script></body>') } }, /Script-Tag ohne Datei: gibtes_nicht\.js/);
    erkannt('js-Datei ohne Script-Tag', { zusatz: { 'js/niemand_laedt_mich.js': '// nichts' } }, /js-Datei ohne Script-Tag: niemand_laedt_mich\.js/);
    erkannt('Chain-Datei fehlt', { geloescht: ['js/foto_kette.js'] }, /Chain-Datei fehlt: foto_kette\.js/);
    erkannt('Script ohne Stempel', { ersatz: { 'index.html': t => t.replace(/(src="\.\/js\/mimik\.js)\?v=[^"]*"/, '$1"') } }, /Script ohne Stempel: mimik\.js/);
    erkannt('dokumentierter Besitzer fehlt (Doku nennt nicht vorhandene Datei)', { ersatz: { 'ARCHITEKTUR.md': t => t.replace(/js\/foto_kette\.js/g, 'js/foto_kette_alt.js') } }, /Doku nennt nicht vorhandene Datei: ARCHITEKTUR\.md -> js\/foto_kette_alt\.js/);
    erkannt('wichtige Architekturdatei fehlt (ARCHITEKTUR.md)', { geloescht: ['ARCHITEKTUR.md'] }, /wichtige Datei fehlt: ARCHITEKTUR\.md/);
    erkannt('wichtige Datei fehlt (LANDKARTE.md)', { geloescht: ['LANDKARTE.md'] }, /wichtige Datei fehlt: LANDKARTE\.md/);
    {   // Capability verweist auf nicht existente Datei: Quelltext von faehigkeiten.js im Speicher verändert, Laufzeit neu gemessen
        const caps = laufzeit({ quelleAendern: (d, t) => d === 'faehigkeiten.js' ? t.replace("'js/foto_rezept.js'", "'js/foto_nixda.js'") : t });
        check('Gegenprobe: Capability verweist auf nicht existente Datei', !caps.faehigkeiten.moduleDateien.every(x => fs.existsSync(path.join(ROOT, x))), caps.faehigkeiten.moduleDateien.length);
    }
    {   // Dead-Code-Erkennung: Datei ohne Wirkung und ohne Nutzer wird als D erkannt; eine mit Wirkung nicht
        const tot = klassifiziere(leser({ zusatz: { 'js/tot_test.js': '(function(){ var nurLokal = 1; })();' }, ersatz: { 'index.html': t => t } }));
        check('Gegenprobe: Datei ohne Wirkung und ohne Nutzer wird als "verdächtig tot" (D) erkannt', tot['tot_test.js'] === 'D', tot['tot_test.js']);
        const lebt = klassifiziere(leser({ zusatz: { 'js/lebt_test.js': '(function(){ setInterval(function(){}, 1000); })();' } }));
        check('Gegenprobe: Datei mit Timer wird NICHT als tot erkannt', lebt['lebt_test.js'] !== 'D' && lebt['lebt_test.js'] !== 'E', lebt['lebt_test.js']);
        const alt = klassifiziere(leser({ ersatz: { 'js/loeschen_fragen.js': t => t.replace(/else window\.executeAction = baue\(/g, 'else /*weg*/ void(') } }));
        check('Gegenprobe: entfernter Rückfallzweig verändert die Klasse (loeschen_fragen nicht mehr C-nach-Rückfall, nur noch Eigenschaftskopie)', alt['loeschen_fragen.js'] === 'C' || alt['loeschen_fragen.js'] === 'A', alt['loeschen_fragen.js']);
    }
    {   // Testbestand: neue Testdatei ohne Klasse, Workflow verweist auf fehlende Datei
        const t1 = testbestand(leser({ zusatz: { 'tests/neu_ohne_klasse.js': '//' } }));
        check('Gegenprobe: neue Testdatei ohne Klasse wird gemeldet', t1.unklassifiziert.includes('neu_ohne_klasse'));
        const t2 = testbestand(leser({ ersatz: { '.github/workflows/tests.yml': t => t + '      - run: node tests/gibtes_nicht.js\n' } }));
        check('Gegenprobe: Workflow-Schritt auf fehlende Testdatei wird gemeldet', t2.workflowOhneDatei.includes('gibtes_nicht'));
        const t3 = testbestand(leser({ ersatz: { '.github/workflows/tests.yml': t => t.replace('      - run: node tests/memory7b.js\n', '') } }));
        check('Gegenprobe: Regressionsprüfung fehlt im Workflow wird gemeldet', t3.regressionNichtImWorkflow.includes('memory7b'));
    }
    {   // CI: Zeitzone im Workflow gesetzt wird erkannt (Folge-Phase 8B ändert den Sollwert bewusst)
        const c = ci(leser({ ersatz: { '.github/workflows/tests.yml': t => t.replace('    runs-on: ubuntu-latest', '    runs-on: ubuntu-latest\n    env:\n      TZ: Europe/Berlin') } }));
        check('Gegenprobe: Zeitzone im Workflow wird erkannt', c.zeitzoneImWorkflow === true);
    }
    {   // Phase 8B Gegenproben (nur Prüf-Eingang im Speicher verändert)
        check('Kontrolle 8B: unveränderter Eingang ergibt keine Meldung', dokuRegeln8b(leser()).length === 0);
        const e = (name, ueber, rx) => { const mm = dokuRegeln8b(leser(ueber)); check('Gegenprobe 8B: ' + name, mm.some(x => rx.test(x)), mm); };
        e('falsche Produktzahl in ARCHITEKTUR.md', { ersatz: { 'ARCHITEKTUR.md': t => t.replace('(169 Skripte)', '(168 Skripte)') } }, /nennt 168 Skripte/);
        e('Abschnitt offene Punkte fehlt', { ersatz: { 'ARCHITEKTUR.md': t => t.replace('## Bekannte offene technische Punkte', '## Anderes') } }, /Abschnitt .* fehlt/);
        e('Verweis auf memory7b-analyse fehlt', { ersatz: { 'ARCHITEKTUR.md': t => t.replace(/(## Bekannte offene technische Punkte[\s\S]*)tests\/memory7b-analyse\.md/, '$1tests/memory7b.md') } }, /verweisen nicht auf tests\/memory7b-analyse\.md|nicht existiert|existiert nicht/);
        e('Analyse-Datei existiert nicht', { geloescht: ['tests/memory7a-analyse.md'] }, /existiert nicht: tests\/memory7a-analyse\.md/);
        e('Momentaufnahme nicht markiert', { ersatz: { 'tests/ist-zustand.md': t => t.replace(/^> \*\*Historische Momentaufnahme[^\n]*\n\n/, '') } }, /nicht eindeutig markiert: tests\/ist-zustand\.md/);
        e('Hinweis "keine automatisch zu behebenden Fehler" entfernt', { ersatz: { 'ARCHITEKTUR.md': t => t.replace('keine automatisch zu behebenden Fehler', 'Fehler') } }, /Hinweis/);
        const g = ci(leser({ ersatz: { '.github/workflows/tests.yml': t => t.replace(/\n\s*with:\s*\n\s*fetch-depth: 0[^\n]*/, '') } }));
        check('Gegenprobe 8B: fehlender voller Git-Verlauf im Workflow wird erkannt', g.vollerGitVerlauf === false && g.testsMitGit.includes('hintergrund_6b2.js'), g);
        const c1 = ci(leser({ ersatz: { 'tests/umgebung.js': t => t.replace("process.env.TZ = 'Europe/Berlin';", '') } }));
        check('Gegenprobe 8B: fehlender Zeitzonen-Vertrag in umgebung.js wird erkannt', c1.zeitzonenVertragZentral === false);
        const c2 = ci(leser({ ersatz: { 'tests/umgebung.js': t => t.replace("process.env.TZ = 'Europe/Berlin';", '').replace("const fs = require('fs')", "const fs0 = require('fs'); process.env.TZ = 'Europe/Berlin';\nconst fs = require('fs')") } }));
        check('Gegenprobe 8B: Zeitzone erst nach dem ersten require wird erkannt', c2.vertragVorErstemRequire === false, c2);
        const c3 = ci(leser({ ersatz: { 'tests/globale.js': t => t.replace("require('./umgebung.js')", "require('./andere.js')") } }));
        check('Gegenprobe 8B: Test ohne Anbindung an umgebung.js wird erkannt', c3.nutzerOhneVertrag.includes('globale'), c3.nutzerOhneVertrag);
    }
    console.log('PHASE 8A: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
