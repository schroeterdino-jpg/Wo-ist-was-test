/* ============================================================
   WIRKUNGSLOSE FUNKTIONEN (Phase 5C, nur Analyse und Sicherheitsnetz). Start: node tests/wirkungslos.js      (Soll neu schreiben: --schreiben)
   Ändert kein Produktverhalten und keine Produktdatei. Alles Eingeschaltete passiert NUR in der Testwelt (Ladereihenfolge im Test verändert).
   Soll-Zustand: tests/wirkungslos_soll.json. Beschreibung und Empfehlungen: tests/wirkungslos-analyse.md.

   Gemessen wird:
   A. searchSemanticMemory: die heute aktive Suche (assistant.js) gegen die heute überschriebene Suche aus langzeit.js (im Test NACH assistant.js geladen),
      mit der ECHTEN Server-Datei api/memory.js und einem Attrappen-Vektorspeicher (Treffer-Reihenfolge durch Stichwörter bestimmt, KEINE echte Bedeutungssuche:
      gemessen wird, was der Code mit den Treffern macht, nicht wie gut ein Embedding ist). 12 Fixtures (leer, wenig, viel, relevant, irrelevant, doppelt,
      alt+neu, sehr lang, Umlaute, API-Fehler, leere Antwort, langsam) plus Datumsfragen, "Zweitschlüssel" (Merk-dir-Eintrag) und Wetterfrage mit "morgen".
   B. cleanupOnce (langzeit.js, heute AKTIV): was das einmalige Aufräumen im Vektorspeicher löscht.
   C. foto_stundenplan.js: die Suche-Hülle, wenn die Datei hinter assistant.js geladen würde.
   D. festnamen.js / hoerkorrektur.js: jede Regel einzeln (positive und negative Fälle), dann 35 Eingaben durch den echten Sprechweg
      (voice.js: fixKnownMishearings -> handleLocalCommand -> sendToGroqSmart) in vier Testwelten: A heute, B +festnamen, C +hoerkorrektur, D beide.
   E. Wohin der (korrigierte) Text läuft: Chat-Verlauf, Gedächtnis-Text, Aktionen.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), url = require('url');
const { starte, lies } = require('./umgebung.js');

const SOLL_DATEI = path.join(__dirname, 'wirkungslos_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);
const kurz = (s, n) => { s = String(s).replace(/\s+/g, ' '); return s.length > (n || 90) ? s.slice(0, n || 90) + '…' : s; };

/* ---------- Ladereihenfolge nur im Test ---------- */
const hinterAssistant = dateien => l => { dateien.forEach(f => { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); }); const j = l.indexOf('assistant.js'); l.splice(j + 1, 0, ...dateien); return l; };
const welt = opt => starte(Object.assign({ festerZufall: true, echtesSpeak: true }, opt || {}));

/* ---------- Server-Datei api/memory.js mit Attrappen-Vektorspeicher ---------- */
const UP = 'https://upstash.test';
async function ladeHandler() {
    const tmp = path.join(os.tmpdir(), 'memory_5c_' + process.pid + '.mjs');
    fs.copyFileSync(path.join(__dirname, '..', 'api', 'memory.js'), tmp);
    try { return (await import(url.pathToFileURL(tmp).href)).default; } finally { try { fs.unlinkSync(tmp); } catch (e) { } }
}
function wortStamm(t) { return String(t).toLowerCase().replace(/[^a-zäöüß0-9 ]+/g, ' ').split(/\s+/).filter(x => x.length >= 4).map(x => x.slice(0, 5)); }
function bewerte(frage, v) {   // Stand-in für Ähnlichkeit: Stichwort-Treffer. Alles bekommt eine Grundnote, der Speicher liefert immer die besten K.
    const txt = String(v.data).toLowerCase();
    const n = wortStamm(frage).filter(s => txt.indexOf(s) >= 0).length;
    return Math.min(0.95, 0.15 + 0.2 * n);
}
function upstash(vektoren, log) {
    return async (u, o) => {
        const pfad = new url.URL(u).pathname, b = JSON.parse((o && o.body) || 'null');
        let payload = {};
        if (pfad.startsWith('/query-data')) {
            log.push('upstash:query topK=' + b.topK);
            payload = { result: vektoren.map(v => ({ id: v.id, data: v.data, metadata: v.metadata, score: bewerte(b.data, v) })).sort((x, y) => y.score - x.score).slice(0, b.topK) };
        } else if (pfad.startsWith('/range')) { log.push('upstash:range'); payload = { result: { vectors: vektoren.map(v => ({ id: v.id, data: v.data, metadata: v.metadata })), nextCursor: '0' } }; }
        else if (pfad.startsWith('/delete')) { log.push('upstash:delete ' + b.length); b.forEach(id => { const i = vektoren.findIndex(v => v.id === id); if (i >= 0) vektoren.splice(i, 1); }); payload = { result: { deleted: b.length } }; }
        else if (pfad.startsWith('/upsert-data')) { vektoren.push({ id: b.id, data: b.data, metadata: b.metadata }); payload = { result: 'Success' }; }
        return { ok: true, status: 200, json: async () => payload };
    };
}
async function rufeApi(handler, bodyStr) {
    let status = 200, payload; const res = { status(c) { status = c; return this; }, json(p) { payload = p; return this; } };
    await handler({ method: 'POST', headers: { 'x-app-key': 'geheim' }, body: bodyStr }, res);
    return { status, payload };
}
/* Hängt die Testwelt an den Vektorspeicher. opt.latenz: { search: ms, listall: ms }, opt.fehler: 'wirft' | '502' | 'leer' */
function verbinde(w, handler, vektoren, opt) {
    opt = opt || {}; const log = [];
    global.fetch = upstash(vektoren, log);
    w.sb.apiFetch = async (u, o) => {
        if (String(u).indexOf('/api/memory') < 0) return { ok: false, status: 404, json: async () => ({}) };
        const b = JSON.parse(o.body);
        log.push('app:' + b.action + (b.topK ? ' topK=' + b.topK : ''));
        if (opt.fehler === 'wirft') throw new Error('offline (Test)');
        if (opt.fehler === '502') return { ok: false, status: 502, json: async () => ({ error: 'kaputt' }) };
        if (opt.fehler === 'leer') return { ok: true, status: 200, json: async () => ({}) };
        const wait = opt.latenz && opt.latenz[b.action];
        if (wait) await new Promise(r => w.sb.setTimeout(r, wait));
        const r = await rufeApi(handler, o.body);
        return { ok: r.status < 300, status: r.status, json: async () => r.payload };
    };
    return log;
}
const heuteIso = w => vm.runInContext("new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })", w.sb);
const plusTage = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lesbar = iso => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
function fixture(d0) {   // d0 = "heute" der Testwelt
    const ep = (id, text, kat, extra) => ({ id, data: text, metadata: Object.assign({ typ: 'episode', kategorie: kat, datum_gesagt: plusTage(d0, -1), quelle: 'gespraech', status: 'ohne_nachfrage' }, extra || {}) });
    const mitDatum = (text, iso) => text + ' (' + lesbar(iso) + ')';   // so legt storeEpisode den Text ab
    const lang = 'Der User erzählt ausführlich von seinem Garten. ' + 'Die Beete sind sehr groß und die Tomaten wachsen gut. '.repeat(36);
    return {
        schwimmen: ep('e1', mitDatum('Der User geht mit Finja schwimmen.', plusTage(d0, 1)), 'Event', { ereignis_datum: plusTage(d0, 1), frage: 'Frage beiläufig, wie es war.', status: 'offen' }),
        kaffee: ep('e2', 'Der User trinkt Kaffee ohne Zucker und mag zum Frühstück Brötchen mit Marmelade.', 'Vorliebe'),
        liam: ep('e3', mitDatum('Liam hat Geburtstag.', plusTage(d0, 6)), 'Geburtstag', { ereignis_datum: plusTage(d0, 6), jaehrlich: true }),
        liam2: ep('e4', 'Liam, der Enkel, mag Dinosaurier und Lego.', 'Vorliebe'),
        sylt: ep('e5', mitDatum('Der User fährt mit seiner Frau nach Sylt.', plusTage(d0, 30)), 'Event', { ereignis_datum: plusTage(d0, 30) }),
        stressAlt: ep('e6', 'Der User war gestresst wegen der Frühschicht und der Stimmung im Team.', 'Stimmung', { datum_gesagt: plusTage(d0, -90) }),
        stressNeu: ep('e7', 'Der User war gestresst wegen der Spätschicht und der Stimmung im Team.', 'Stimmung', { datum_gesagt: plusTage(d0, -1) }),
        krimi1: ep('e8', 'Der User liest gern Krimis.', 'Vorliebe'),
        krimi2: ep('e9', 'Der User liest gern Krimis.', 'Vorliebe'),
        lang: ep('e10', lang, 'Vorliebe'),
        umlaut: ep('e11', 'Der User mag Müsli mit Äpfeln, Zimt & Süßem und sagt „Prost“ (ß, ü, ö).', 'Vorliebe'),
        // Einträge, die NICHT von langzeit.js kommen: "Merk dir ..." (gedaechtnis.js) und automatisch Gelerntes (briefing.js)
        merkdir: { id: 'm1', data: 'Am 12.10.2026 um 18:00 hat der Nutzer ausdrücklich darum gebeten, sich Folgendes zu merken: "Der Zweitschlüssel liegt bei der Nachbarin" (gemerkt als: Zweitschlüssel - bei der Nachbarin)', metadata: { quelle: 'merk_dir', datum: plusTage(d0, -16) + 'T18:00:00.000Z' } },
        auto: { id: 'm2', data: 'lieblingsessen: Pizza Margherita', metadata: { datum: plusTage(d0, -20) + 'T10:00:00.000Z' } },
        frist: { id: 'f1', data: 'Vertrag kündigen', metadata: { typ: 'frist', status: 'offen', ereignis_datum: plusTage(d0, 3) } },
        plan: tag => ({ id: 'stundenplan_isabel_' + tag.toLowerCase(), data: 'Stundenplan von Isabel, ' + tag + ': 1. Mathe, 2. Deutsch, 3. Sport, 4. Englisch', metadata: { typ: 'episode', kategorie: 'Stundenplan', person: 'Isabel', wochentag: tag, quelle: 'foto', datum_gesagt: plusTage(d0, -5), status: 'ohne_nachfrage', anstoss_aus: true } }),
        fueller: n => Array.from({ length: n }, (_, i) => ep('x' + i, 'Der User hat am ' + (i + 1) + '. Notiz Nummer ' + (i + 1) + ' zum Thema Haushalt aufgeschrieben.', 'Event'))
    };
}
function szenarien(fx) {
    const alle = Object.values(fx).filter(v => v && typeof v === 'object' && v.id);
    return [
        { n: '01 keine Erinnerungen', f: 'Wann war ich schwimmen?', db: [], relevant: [] },
        { n: '02 wenige Erinnerungen', f: 'Wann war ich schwimmen?', db: [fx.schwimmen, fx.kaffee, fx.liam], relevant: ['schwimmen'] },
        { n: '03 viele Erinnerungen (Liam)', f: 'Was weißt du über Liam?', db: [fx.liam, fx.liam2, ...fx.fueller(14).map((e, i) => Object.assign({}, e, { data: 'Liam Notiz ' + i + ' vom Spielplatz', id: 'l' + i })), fx.kaffee], relevant: ['Liam'] },
        { n: '04 relevante Erinnerung (Zweitschlüssel, Merk-dir-Eintrag)', f: 'Wo liegt der Zweitschlüssel?', db: [fx.merkdir, fx.kaffee, fx.schwimmen], relevant: ['Zweitschlüssel'] },
        { n: '05 nur irrelevante Erinnerungen', f: 'Wie funktioniert ein Hubschrauber?', db: [fx.kaffee, fx.krimi1, fx.umlaut], relevant: [] },
        { n: '06 doppelte Erinnerungen', f: 'Was lese ich gern?', db: [fx.krimi1, fx.krimi2, fx.kaffee], relevant: ['Krimis'] },
        { n: '07 alte und neue Erinnerung (Stimmung)', f: 'Warum war ich gestresst wegen der Schicht?', db: [fx.stressAlt, fx.stressNeu, fx.kaffee], relevant: ['Spätschicht'] },
        { n: '08 sehr lange Erinnerung', f: 'Was erzähle ich vom Garten?', db: [fx.lang, fx.kaffee], relevant: ['Tomaten'] },
        { n: '09 Sonderzeichen und Umlaute', f: 'Was mag ich zum Müsli mit Äpfeln?', db: [fx.umlaut, fx.kaffee], relevant: ['Äpfeln'] },
        { n: '10a API-Fehler (HTTP 502)', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], fehler: '502', relevant: [] },
        { n: '10b API-Fehler (Netz weg)', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], fehler: 'wirft', relevant: [] },
        { n: '11 leere Antwort', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], fehler: 'leer', relevant: [] },
        { n: '12a langsame Antwort (Suche 2 s)', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], latenz: { search: 2000 }, relevant: ['schwimmen'] },
        { n: '12b Datumsfrage, Suche schnell, Gesamtliste langsam (2 s)', f: 'Was habe ich morgen vor?', db: [fx.schwimmen, fx.kaffee], latenz: { listall: 2000 }, relevant: ['schwimmen'] },
        { n: '13 Datumsfrage "morgen" mit Plan', f: 'Was habe ich morgen vor?', db: [fx.schwimmen, fx.kaffee, fx.sylt], relevant: ['schwimmen'] },
        { n: '14 Datumsfrage "diese Woche"', f: 'Was steht diese Woche an?', db: [fx.schwimmen, fx.liam, fx.sylt, fx.kaffee, ...fx.fueller(8)], relevant: ['schwimmen', 'Liam hat Geburtstag'] },
        { n: '15 Wetterfrage mit "morgen" (kein Gedächtnisbezug)', f: 'Wie wird morgen das Wetter?', db: [fx.schwimmen, fx.kaffee], relevant: [] },
        { n: '15b Satz mit "los" (Fahr gleich los) ohne Gedächtnisbezug', f: 'Fahr gleich los', db: [fx.schwimmen, fx.kaffee], relevant: [] },
        { n: '15c Satz mit "vor" (Lies mir etwas vor) ohne Gedächtnisbezug', f: 'Lies mir etwas vor', db: [fx.schwimmen, fx.kaffee], relevant: [] },
        { n: '16 Frist-Eintrag im Speicher (Fristen kommen sonst über jvFristHinweis/dueBlock)', f: 'Was muss ich kündigen?', db: [fx.frist, fx.kaffee], relevant: [] }
    ];
}
async function messeSuche(w, handler, sz) {
    const vektoren = sz.db.map(e => Object.assign({}, e)), log = verbinde(w, handler, vektoren, { fehler: sz.fehler, latenz: sz.latenz });
    const t0 = w.uhr.ms;
    // wie assistant.js: höchstens 1,5 Sekunden warten
    const x = await w.lassLaufen(() => Promise.race([w.sb.searchSemanticMemory(sz.f), new Promise(res => w.sb.setTimeout(() => res([]), 1500))]));
    const ergebnis = x.haengt ? 'HÄNGT' : x.wert;
    return { anfragen: log.filter(l => l.indexOf('app:') === 0).map(l => l.slice(4)), upstash: log.filter(l => l.indexOf('upstash:') === 0).map(l => l.slice(8)), wartezeitMs: w.uhr.ms - t0, ergebnis };
}
const enthaelt = (liste, teil) => Array.isArray(liste) && liste.some(x => String(x).indexOf(teil) >= 0);
function urteil(h, l, relevant) {
    if (JS(h.ergebnis) === JS(l.ergebnis)) return 'kein Unterschied';
    const rh = relevant.filter(r => enthaelt(h.ergebnis, r)).length, rl = relevant.filter(r => enthaelt(l.ergebnis, r)).length;
    if (rl > rh) return 'tatsächlich besser';
    if (rl < rh) return 'potenziell schlechter';
    if (h.wartezeitMs !== l.wartezeitMs && (l.ergebnis || []).length === 0 && (h.ergebnis || []).length === 0) return 'nur anders (Wartezeit)';
    return 'nur anders';
}

/* ---------- D: Korrektur-Regeln und Eingaben ---------- */
const MIS_QUELLE = (lies('js/voice.js').match(/function fixKnownMishearings\(text\) \{[\s\S]*?\n    \}/) || [''])[0];
const fixKnownMishearings = MIS_QUELLE ? vm.runInNewContext('(' + MIS_QUELLE.replace(/^function fixKnownMishearings/, 'function') + ')') : null;

const FEST_REGELN = [   // [Eingabe, erwartet (so wie gemeint), Art]
    ['Route zu Alicia', 'Route zu Alyssa', 'pos'], ['Alycia kommt', 'Alyssa kommt', 'pos'], ['Alisia', 'Alyssa', 'pos'], ['Alissa', 'Alyssa', 'pos'], ['Alyssia', 'Alyssa', 'pos'], ['Alicias Geburtstag', 'Alyssas Geburtstag', 'pos'],
    ['Alyssa', 'Alyssa', 'neg'], ['Alissandro kommt', 'Alissandro kommt', 'neg'], ['Alicante im Urlaub', 'Alicante im Urlaub', 'neg'],
    ['Fahr zum Neu Galina Ring', 'Fahr zum Neu-Galliner-Ring', 'pos'], ['Neu Gallin Ring', 'Neu-Galliner-Ring', 'pos'], ['neugalliner ring', 'Neu-Galliner-Ring', 'pos'], ['Neu-Galliner-Ring', 'Neu-Galliner-Ring', 'neg'], ['Neu Kalliner Ring', 'Neu-Galliner-Ring', 'luecke'],
    ['Wie komme ich nach Schwarzenbeck', 'Wie komme ich nach Schwarzenbek', 'pos'], ['Schwarzenbek', 'Schwarzenbek', 'neg'],
    ['Mein Name ist Schröter', 'Mein Name ist Schroeter', 'pos'], ['Ich bin Schroeter', 'Ich bin Schroeter', 'neg'], ['Ruf Herrn Schröter von der Bank an', 'Ruf Herrn Schröter von der Bank an', 'mehrdeutig'],
    ['Zum Verbrüderungs Ring', 'Zum Verbrüderungsring', 'pos'], ['Verbrüderungsring 13', 'Verbrüderungsring 13', 'neg'],
    ['Zain wie spät ist es', 'Zane wie spät ist es', 'pos'], ['Zayn bitte', 'Zane bitte', 'pos'], ['Sane sag mal', 'Zane sag mal', 'pos'], ['Zaino Kaffee', 'Zaino Kaffee', 'neg'], ['Sanierung am Haus', 'Sanierung am Haus', 'neg'], ['Zane', 'Zane', 'neg'],
    ['Hey Sein was gibt es Neues', 'Hey Zane was gibt es Neues', 'pos'], ['Hallo zehn Euro sind zu wenig', 'Hallo zehn Euro sind zu wenig', 'falsch'], ['Hey sehn wir uns morgen', 'Hey sehn wir uns morgen', 'falsch'], ['Um zehn Uhr Termin', 'Um zehn Uhr Termin', 'neg'],
    ['Ein Zein Protein', 'Ein Zein Protein', 'falsch']
];
function hoerRegeln(sb, store) {   // vom Nutzer gelernt (so wie "Wenn ich X sage, meine ich Y" es ablegt)
    store['jv_hoerkorrektur'] = JSON.stringify({ 'Matthes': 'Matze', 'haben jetzt': { r: 'Hamiyet', c: 1 } });
}
const HOER_REGELN = [
    ['Wann hat Hamlet Feierabend', 'Wann hat Hamiyet Feierabend', 'pos'], ['hamlet', 'Hamiyet', 'pos'], ['Wer hat Hamlet von Shakespeare geschrieben', 'Wer hat Hamlet von Shakespeare geschrieben', 'falsch'], ['Hamlets Monolog', 'Hamlets Monolog', 'neg'],
    ['Ruf Matthes an', 'Ruf Matze an', 'pos'], ['Matthes Tisch', 'Matthes Tisch', 'mehrdeutig'],
    ['Ruf haben jetzt an', 'Ruf Hamiyet an', 'pos'], ['Wir haben jetzt Zeit', 'Wir haben jetzt Zeit', 'neg'], ['Schreib mit haben jetzt', 'Schreib mit Hamiyet', 'pos'],
    ['Wann haben jetzt Pause', 'Wann haben jetzt Pause', 'neg']
];

const EINGABEN = [   // [Kategorie, Eingabe wie vom Handy erkannt, erwartet für die KI (gemeint), mehrdeutig?]
    ['Unterhaltung', 'Hallo Jarvis wie geht es dir', 'Hallo Zane wie geht es dir'], ['Unterhaltung', 'Erzähl mir einen Witz', 'Erzähl mir einen Witz'], ['Unterhaltung', 'Hey sein was machst du so', 'Hey Zane was machst du so'],
    ['Unterhaltung', 'Hallo zehn Minuten Pause bitte', 'Hallo zehn Minuten Pause bitte'],
    ['Namen', 'Ruf Alicia an', 'Ruf Alyssa an'], ['Namen', 'Schreib Alycia eine Nachricht', 'Schreib Alyssa eine Nachricht'], ['Namen', 'Wann hat Alissa Geburtstag', 'Wann hat Alyssa Geburtstag'],
    ['Namen', 'Ist Herr Schröter heute da', 'Ist Herr Schröter heute da', true], ['Namen', 'Wer hat Hamlet geschrieben', 'Wer hat Hamlet geschrieben'], ['Namen', 'Wann hat Hamlet Feierabend', 'Wann hat Hamiyet Feierabend'], ['Namen', 'Zayn wie spät ist es', 'Zane wie spät ist es'],
    ['Orte', 'Fahr zum Neu Galina Ring', 'Fahr zum Neu-Galliner-Ring'], ['Orte', 'Wie komme ich nach Schwarzenbeck', 'Wie komme ich nach Schwarzenbek'], ['Orte', 'Navigier mich zum Verbrüderungs Ring', 'Navigier mich zum Verbrüderungsring'], ['Orte', 'Wo ist der Neugalliner Ring Parkplatz', 'Wo ist der Neu-Galliner-Ring Parkplatz'],
    ['Navigation', 'Wie lange brauche ich zur Arbeit', 'Wie lange brauche ich zur Arbeit'], ['Navigation', 'Route nach Alicia', 'Route nach Alyssa'], ['Navigation', 'Navigier mich nach Schwarzenbeck bei Hamburg', 'Navigier mich nach Schwarzenbek bei Hamburg'],
    ['Termine', 'Trag morgen um zehn Uhr einen Termin ein', 'Trag morgen um zehn Uhr einen Termin ein'], ['Termine', 'Termin mit Alicia am Freitag um 15 Uhr', 'Termin mit Alyssa am Freitag um 15 Uhr'], ['Termine', 'Termin mit Herrn Schröter am Montag', 'Termin mit Herrn Schröter am Montag', true],
    ['Erinnerungen', 'Erinner mich morgen an den Arzt', 'Erinner mich morgen an den Arzt'], ['Erinnerungen', 'Erinner mich an den Anruf bei Hamlet', 'Erinner mich an den Anruf bei Hamiyet'],
    ['Wetter', 'Wird es in Schwarzenbeck morgen regnen', 'Wird es in Schwarzenbek morgen regnen'], ['Wetter', 'Brauche ich heute einen Schirm', 'Brauche ich heute einen Schirm'],
    ['Schicht', 'Wann habe ich nächste Woche Frühschicht', 'Wann habe ich nächste Woche Frühschicht'], ['Schicht', 'Habe ich am Wochenende Spätschicht', 'Habe ich am Wochenende Spätschicht'],
    ['Gedächtnis', 'Merk dir dass Alicia am Samstag kommt', 'Merk dir dass Alyssa am Samstag kommt'], ['Gedächtnis', 'Merk dir mein Nachname ist Schröter', 'Merk dir mein Nachname ist Schroeter'], ['Gedächtnis', 'Was weißt du über mich', 'Was weißt du über mich'], ['Gedächtnis', 'Was habe ich mir über Hamlet gemerkt', 'Was habe ich mir über Hamiyet gemerkt'],
    ['Foto', 'Mach ein Foto vom Brief an Schröter', 'Mach ein Foto vom Brief an Schröter', true], ['Foto', 'Stundenplan von Alycia fotografieren', 'Stundenplan von Alyssa fotografieren'],
    ['Mehrfachfrage', 'Wie wird das Wetter in Schwarzenbeck und ruf Alicia an', 'Wie wird das Wetter in Schwarzenbek und ruf Alyssa an'], ['Mehrfachfrage', 'Was habe ich heute vor und wie kalt ist es in Schwarzenbeck', 'Was habe ich heute vor und wie kalt ist es in Schwarzenbek']
];

async function weltMitKern(opt) {
    const w = welt(opt), aufruf = [];
    w.sb.sendToGroqSmartCore = async function (t) { aufruf.push(String(t)); return 'KERN'; };
    w.aufruf = aufruf; hoerRegeln(w.sb, w.store);
    return w;
}
async function sprechweg(w, roh) {   // wie voice.js handleRecognizedText: erst fixKnownMishearings, dann feste Befehle, sonst KI
    const m = fixKnownMishearings(roh), alt = { speak: w.sb.speak, speakAck: w.sb.speakAck };
    w.sb.speak = function () { }; w.sb.speakAck = function () { };
    w.aufruf.length = 0;
    const x = await w.satz(m);
    if (!x.lokal) await w.sb.sendToGroqSmart(m);   // sonst ging der Satz (oder ein Teilsatz bei Mehrfachfragen) schon im lokalen Weg an die KI-Kappe
    const ki = w.aufruf.length ? w.aufruf.slice() : null;
    w.sb.speak = alt.speak; w.sb.speakAck = alt.speakAck;
    return { lokal: x.lokal, modul: x.modul, ki };
}

(async () => {
    const soll = fs.existsSync(SOLL_DATEI) ? JSON.parse(fs.readFileSync(SOLL_DATEI, 'utf8')) : {};
    const ist = {};
    const env = { UPSTASH_VECTOR_REST_URL: UP, UPSTASH_VECTOR_REST_TOKEN: 't', APP_SECRET: 'geheim' }, envAlt = {}, fetchAlt = global.fetch;
    for (const k of Object.keys(env)) { envAlt[k] = process.env[k]; process.env[k] = env[k]; }
    const handler = await ladeHandler();

    /* ===== A. searchSemanticMemory heute gegen die tote Langzeit-Variante ===== */
    const wH = welt(), wL = welt({ skriptReihenfolge: hinterAssistant(['langzeit.js']) });
    check('A0. Testwelten laden ohne Fehler (heute und mit langzeit.js hinter assistant.js)', wH.ladefehler.length === 0 && wL.ladefehler.length === 0, JS(wH.ladefehler.concat(wL.ladefehler)));
    const d0 = heuteIso(wH), fx = fixture(d0);
    check('A0. Beide Welten haben denselben "heute"-Tag (feste Uhr)', heuteIso(wL) === d0, d0 + ' / ' + heuteIso(wL));
    check('A0. heute: die Funktion stammt aus assistant.js (kein listall, topK 5); mit langzeit.js dahinter ist es die Langzeit-Suche', !/listall|episode/.test(String(wH.sb.searchSemanticMemory)) && /episode/.test(String(wL.sb.searchSemanticMemory)));
    ist.suche = {};
    for (const sz of szenarien(fx)) {
        const h = await messeSuche(wH, handler, sz), l = await messeSuche(wL, handler, sz);
        ist.suche[sz.n] = { frage: sz.f, heute: h, langzeit: l, urteil: urteil(h, l, sz.relevant) };
    }
    /* Kosten je Frage */
    const anfr = k => Object.keys(ist.suche).map(n => ist.suche[n][k].anfragen.length);

    /* ===== B. cleanupOnce (heute AKTIV) ===== */
    {
        const sz = { db: [fx.schwimmen, fx.kaffee, fx.liam, fx.frist, fx.merkdir, fx.auto, fx.plan('Montag')] };
        const lauf = async (vorher) => {
            const w = welt(), vek = sz.db.map(e => Object.assign({}, e)), log = verbinde(w, handler, vek, {});
            if (vorher) vorher(w);
            await w.vorspulen(5000);
            return { geloescht: sz.db.map(e => e.id).filter(id => !vek.some(v => v.id === id)), uebrig: vek.map(v => v.id), marke: !!w.store['jv_langzeit_aufgeraeumt_v1'], delete: log.filter(l => l.indexOf('app:delete') === 0).length };
        };
        ist.aufraeumen = {
            ersterStart: await lauf(null),
            markeSchonGesetzt: await lauf(w => { w.store['jv_langzeit_aufgeraeumt_v1'] = '2026-10-07T00:00:00.000Z'; }),
            neueInstallation: await lauf(w => { delete w.store['jv_langzeit_aufgeraeumt_v1']; })
        };
        ist.aufraeumen.syncListe = /jv_langzeit_aufgeraeumt/.test(lies('js/sync.js'));
    }

    /* ===== C. foto_stundenplan: Suche-Hülle (heute tot) ===== */
    {
        const wF = welt({ skriptReihenfolge: hinterAssistant(['foto_stundenplan.js']) });
        const tage = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag'];
        const bunt = [fx.plan('Montag'), fx.plan('Dienstag'), fx.plan('Mittwoch'), fx.plan('Donnerstag'), fx.kaffee, fx.liam2, fx.krimi1,
            { id: 's1', data: 'Isabel hat in der Schule Elternabend, die Stunde dafür ist noch offen', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: d0 } },
            { id: 's2', data: 'Isabel braucht morgen Sportzeug für die dritte Stunde, hat Isabel gesagt', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: d0 } },
            { id: 's3', data: 'Isabel freut sich auf die Schule morgen, die dritten Stunden mag sie', metadata: { typ: 'episode', kategorie: 'Vorliebe', datum_gesagt: d0 } },
            { id: 's4', data: 'Isabel Stunden Hausaufgaben morgen Schule dritte Stunde Matheheft', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: d0 } },
            { id: 's5', data: 'Isabel Schule Stunde morgen dritte Elternbrief', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: d0 } },
            { id: 's6', data: 'Isabel Schule Stunde morgen dritte Turnbeutel', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: d0 } }];
        check('C0. foto_stundenplan.js hinter assistant.js lädt ohne Ladefehler', wF.ladefehler.length === 0, JS(wF.ladefehler));
        ist.stundenplan = {
            geladenAn: lies('index.html').split('\n').findIndex(z => z.indexOf('js/foto_stundenplan.js') >= 0) < lies('index.html').split('\n').findIndex(z => z.indexOf('js/assistant.js') >= 0) ? 'VOR assistant.js (Hülle greift ins Leere)' : 'nach assistant.js',
            heuteHuelle: /listall|Stundenplan/.test(String(wH.sb.searchSemanticMemory)),
            fragen: {}
        };
        for (const f of ['Was hat Isabel morgen in der dritten Stunde?', 'Wann hat Isabel Sport?', 'Wie wird morgen das Wetter?']) {
            const sz = { f, db: bunt, relevant: [] };
            const h = await messeSuche(wH, handler, sz), s = await messeSuche(wF, handler, sz);
            ist.stundenplan.fragen[f] = { heute: { anfragen: h.anfragen, plan: h.ergebnis.filter(x => /^Stundenplan von/.test(x)).map(x => x.slice(0, 40)), gesamt: h.ergebnis.length }, mitHuelle: { anfragen: s.anfragen, plan: s.ergebnis.filter(x => /^Stundenplan von/.test(x)).map(x => x.slice(0, 40)), gesamt: s.ergebnis.length } };
        }
    }

    /* ===== D. Korrektur-Regeln ===== */
    check('D0. fixKnownMishearings lässt sich aus js/voice.js lesen (Testwerkzeug)', typeof fixKnownMishearings === 'function');
    const wR = await weltMitKern();
    ist.regeln = { festnamen: FEST_REGELN.map(([e, erw, art]) => { const a = wR.sb.jvFestnamen(e); return [e, a, art, a === erw ? 'wie gemeint' : 'ANDERS']; }), hoerkorrektur: HOER_REGELN.map(([e, erw, art]) => { const a = wR.sb.jvHoerKorrektur(e); return [e, a, art, a === erw ? 'wie gemeint' : 'ANDERS']; }) };
    {   // kurze, allgemeine Wörter: der Lernbefehl prüft nur eine kleine Liste
        const w = await weltMitKern(); w.store['jv_hoerkorrektur'] = '{}';
        const lernen = [];
        for (const s of ['Wenn ich Mal sage, meine ich Malte', 'Wenn ich Ende sage, meine ich Enne', 'Wenn ich der sage, meine ich den', 'Wenn ich Hamlet sage, meine ich Hamiyet']) { w.sb.handleHoerKorrekturCommand(s); }
        const map = JSON.parse(w.store['jv_hoerkorrektur'] || '{}');
        ist.lernen = { gespeichert: Object.keys(map), danach: ['Sag mal wie spät es ist', 'Am Ende der Straße', 'Wer ist der Mann'].map(t => [t, w.sb.jvHoerKorrektur(t)]) };
    }
    /* vier Welten */
    const WELTEN = {
        'A heute': {},
        'B +festnamen': { skriptReihenfolge: hinterAssistant(['festnamen.js']) },
        'C +hoerkorrektur': { skriptReihenfolge: hinterAssistant(['hoerkorrektur.js']) },
        'D beide': { skriptReihenfolge: hinterAssistant(['festnamen.js', 'hoerkorrektur.js']) }
    };
    const wk = {};
    for (const n of Object.keys(WELTEN)) { wk[n] = await weltMitKern(WELTEN[n]); check('D0. Welt ' + n + ' lädt ohne Ladefehler', wk[n].ladefehler.length === 0, JS(wk[n].ladefehler)); }
    ist.eingaben = [];
    for (const [kat, roh, erw, mehr] of EINGABEN) {
        const z = { kat, roh, erwartet: erw, mehrdeutig: !!mehr };
        for (const n of Object.keys(WELTEN)) z[n] = await sprechweg(wk[n], roh);
        const A = z['A heute'];
        z.heuteWieGemeint = !A.lokal && (A.ki || [])[0] === erw;   // false = schon die heutige Verarbeitung weicht vom Gemeinten ab
        z.urteil = {};
        for (const n of ['B +festnamen', 'C +hoerkorrektur', 'D beide']) {
            const r = z[n];
            if (A.lokal || r.lokal) { z.urteil[n] = A.lokal !== r.lokal ? 'ANDERER WEG' : JS(A.ki) === JS(r.ki) ? 'unverändert (lokaler Weg)' : 'KI-Teilsatz geändert'; continue; }
            const heuteT = (A.ki || [])[0], neuT = (r.ki || [])[0];
            if (neuT === heuteT) z.urteil[n] = 'unverändert';
            else if (z.mehrdeutig) z.urteil[n] = 'fragwürdig';
            else if (neuT === erw) z.urteil[n] = 'verbessert';
            else if (heuteT === erw) z.urteil[n] = 'verschlechtert';
            else z.urteil[n] = 'fragwürdig';
        }
        ist.eingaben.push(z);
    }

    /* Der lokale Weg: festnamen (Rang 10) und hoerkorrektur (Rang 400) sind als Befehls-Einträge AKTIV. Was bekommt ein spätes Glied der Kette? */
    {
        const w = await weltMitKern(), gesehen = [];
        w.sb.jvCommands.use('zz_test_spaetes_glied', function (text, next) { gesehen.push(text); return false; }, 5000);
        w.sb.speak = function () { }; w.sb.speakAck = function () { };
        ist.lokalerText = [];
        for (const t of ['Termin mit Herrn Schröter am Montag', 'Erinner mich an den Anruf bei Hamlet', 'Schreib Alycia eine Nachricht', 'Fahr zum Neu Galina Ring', 'Wie komme ich nach Schwarzenbeck', 'Hey sehn wir uns morgen', 'Wer hat Hamlet geschrieben']) {
            gesehen.length = 0; await w.satz(t); ist.lokalerText.push(t + ' => ' + JS(gesehen.slice()));
        }
    }

    /* ===== E. wohin der Text läuft (Quelltext-Fakten) ===== */
    const ass = lies('js/assistant.js');
    ist.textfluss = {
        chatVerlauf: /chatHistory\.push\(\{ role: "user", content: text \}\)/.test(ass),
        letzterText: /window\.jvLetzterText = text/.test(ass),
        aktionenBekommenText: /await executeAction\(action, text, ctx\)/.test(ass),
        merkDirTextKommtAusText: /const said = String\(text \|\| ''\)/.test(lies('js/gedaechtnis.js')),
        festnamenBeimSpeichern: /jvFestnamen\(memoryItems\[newKey\]\)/.test(lies('js/actions.js')) && /body\.text = window\.jvFestnamen\(body\.text\)/.test(lies('js/langzeit.js')),
        hoerenNutztFestnamenNurZumBewerten: /const score = t => \{ const f = fest\(t\)/.test(lies('js/hoeren.js')) && !/window\.jvFestnamen\(/.test(lies('js/hoeren.js').replace(/const fest = [^\n]*/, ''))
    };

    const aufraeumenEnv = () => { for (const k of Object.keys(env)) { if (envAlt[k] === undefined) delete process.env[k]; else process.env[k] = envAlt[k]; } global.fetch = fetchAlt; };

    if (SCHREIBEN) { aufraeumenEnv(); fs.writeFileSync(SOLL_DATEI, JSON.stringify(ist, null, 1) + '\n'); console.log('Soll-Zustand geschrieben: ' + SOLL_DATEI); process.exit(0); }

    /* ---------- Vergleich mit dem Soll ---------- */
    for (const k of Object.keys(ist.suche)) check('A. Suche ' + k + ': heute und Langzeit-Variante wie eingefroren', JS(ist.suche[k]) === JS(soll.suche && soll.suche[k]), kurz(JS(ist.suche[k].urteil)));
    check('B. cleanupOnce wie eingefroren', JS(ist.aufraeumen) === JS(soll.aufraeumen), JS(ist.aufraeumen));
    check('C. foto_stundenplan wie eingefroren', JS(ist.stundenplan) === JS(soll.stundenplan));
    check('D. Regeln festnamen/hoerkorrektur wie eingefroren', JS(ist.regeln) === JS(soll.regeln));
    check('D. Lernbefehl (kurze/allgemeine Wörter) wie eingefroren', JS(ist.lernen) === JS(soll.lernen));
    ist.eingaben.forEach((z, i) => check('D. Eingabe ' + (i + 1) + ' (' + z.kat + '): ' + kurz(z.roh, 40) + ' in allen vier Welten wie eingefroren', JS(z) === JS(soll.eingaben && soll.eingaben[i])));
    check('D. Text, den spätere Glieder der lokalen Befehlskette heute bekommen, wie eingefroren', JS(ist.lokalerText) === JS(soll.lokalerText), JS(ist.lokalerText));
    check('E. Textfluss (Quelltext-Fakten) wie eingefroren', JS(ist.textfluss) === JS(soll.textfluss), JS(ist.textfluss));
    for (const k of Object.keys(soll)) check('Soll-Schlüssel ' + k + ' wird noch gemessen', k in ist);

    /* ---------- Sachaussagen (Befunde), unabhängig von der Soll-Datei ---------- */
    const S = ist.suche;
    check('Befund Suche: heute genau EINE Anfrage (search, topK 5); Langzeit-Variante topK 8, bei Datumsfragen zusätzlich die komplette Liste (listall)', JS(S['02 wenige Erinnerungen'].heute.anfragen) === JS(['search topK=5']) && JS(S['02 wenige Erinnerungen'].langzeit.anfragen) === JS(['search topK=8']) && JS(S['13 Datumsfrage "morgen" mit Plan'].langzeit.anfragen.sort()) === JS(['listall', 'search topK=8']), JS(S['13 Datumsfrage "morgen" mit Plan'].langzeit.anfragen));
    check('Befund Suche: die Langzeit-Variante lässt Merk-dir-Einträge (kein typ "episode") weg; heute werden sie gefunden', enthaelt(S['04 relevante Erinnerung (Zweitschlüssel, Merk-dir-Eintrag)'].heute.ergebnis, 'Zweitschlüssel') && !enthaelt(S['04 relevante Erinnerung (Zweitschlüssel, Merk-dir-Eintrag)'].langzeit.ergebnis, 'Zweitschlüssel') && S['04 relevante Erinnerung (Zweitschlüssel, Merk-dir-Eintrag)'].urteil === 'potenziell schlechter');
    check('Befund Suche: Wetterfrage mit "morgen" löst in der Langzeit-Variante eine zusätzliche Abfrage der kompletten Liste aus, heute nicht', S['15 Wetterfrage mit "morgen" (kein Gedächtnisbezug)'].heute.anfragen.length === 1 && S['15 Wetterfrage mit "morgen" (kein Gedächtnisbezug)'].langzeit.anfragen.indexOf('listall') >= 0);
    check('Befund Suche: auch harmlose Sätze mit Wortanfang "los"/"vor" lösen die Abfrage der kompletten Liste aus (zeitraum() trifft jeden Wortanfang "vor...", "los...", "termin...")', ['15b Satz mit "los" (Fahr gleich los) ohne Gedächtnisbezug', '15c Satz mit "vor" (Lies mir etwas vor) ohne Gedächtnisbezug'].every(k => S[k].langzeit.anfragen.indexOf('listall') >= 0 && S[k].heute.anfragen.indexOf('listall') < 0));
    check('Befund Suche: Datumsfrage mit langsamer Gesamtliste (2 s) verliert in der Langzeit-Variante alles (1,5-s-Grenze in assistant.js), heute kommt der Treffer', enthaelt(S['12b Datumsfrage, Suche schnell, Gesamtliste langsam (2 s)'].heute.ergebnis, 'schwimmen') && S['12b Datumsfrage, Suche schnell, Gesamtliste langsam (2 s)'].langzeit.ergebnis.length === 0);
    check('Befund Suche: Datumsfrage "diese Woche" liefert in der Langzeit-Variante die Pläne vollständig und mit Datum zuerst ("GEPLANT am ..."), heute nur, was die Bedeutungssuche in die Top 5 bringt', /^GEPLANT am /.test(S['14 Datumsfrage "diese Woche"'].langzeit.ergebnis[0] || ''));
    check('Befund Suche: Fehler/leere Antwort ergeben in beiden Varianten leere Listen ohne Ausnahme', ['10a API-Fehler (HTTP 502)', '10b API-Fehler (Netz weg)', '11 leere Antwort'].every(k => S[k].heute.ergebnis.length === 0 && S[k].langzeit.ergebnis.length === 0));
    check('Befund Aufräumen: langzeit.js löscht beim ersten Start auf einem Gerät alle Einträge ohne typ "episode"/"frist" (Merk-dir-Einträge, automatisch Gelerntes, Stundenplan bleibt), die Marke steht NICHT in der Sicherungsliste', JS(ist.aufraeumen.ersterStart.geloescht.sort()) === JS(['m1', 'm2']) && ist.aufraeumen.markeSchonGesetzt.geloescht.length === 0 && JS(ist.aufraeumen.neueInstallation.geloescht.sort()) === JS(['m1', 'm2']) && ist.aufraeumen.syncListe === false, JS(ist.aufraeumen));
    check('Befund foto_stundenplan: Datei lädt vor assistant.js, die Suche-Hülle greift heute ins Leere; hinter assistant.js liefert sie die Pläne des gefragten Wochentags gezielt', /VOR assistant\.js/.test(ist.stundenplan.geladenAn) && ist.stundenplan.heuteHuelle === false);
    const F = ist.eingaben;
    check('Befund Korrektur: die Welten B/C/D ändern den lokalen Weg nicht (gleiches Ergebnis wie heute)', F.every(z => ['B +festnamen', 'C +hoerkorrektur', 'D beide'].every(n => z.urteil[n] !== 'ANDERER WEG')));
    check('Befund Korrektur: 35 Eingaben, alle vier Welten gemessen', F.length === 35 && F.every(z => 'A heute' in z && 'D beide' in z));
    check('Befund Korrektur: es gibt echte Verbesserungen UND echte Verschlechterungen (Hamlet-Frage, "Hallo zehn ..."/Schröter mehrdeutig)', F.some(z => Object.values(z.urteil).includes('verbessert')) && F.some(z => Object.values(z.urteil).includes('verschlechtert') || Object.values(z.urteil).includes('fragwürdig')));
    check('Befund Textfluss: die korrigierte Fassung (nicht das Original) landet im Chat-Verlauf, in jvLetzterText, im Aktionskontext und im Merk-dir-Text', ist.textfluss.chatVerlauf && ist.textfluss.letzterText && ist.textfluss.aktionenBekommenText && ist.textfluss.merkDirTextKommtAusText);

    check('Befund lokaler Weg: festnamen/hoerkorrektur wirken HEUTE schon auf alle lokalen Befehle (Schröter -> Schroeter, Hamlet -> Hamiyet, Alycia -> Alyssa, Neu Galina Ring -> Neu-Galliner-Ring)', /Schroeter/.test(ist.lokalerText[0]) && /Hamiyet/.test(ist.lokalerText[1]) && /Alyssa/.test(ist.lokalerText[2]) && /Neu-Galliner-Ring/.test(ist.lokalerText[3]) && /Schwarzenbek/.test(ist.lokalerText[4]), JS(ist.lokalerText));
    check('Befund Doppelkorrektur: Alicia/Alissa/Alisha und Zain/Zayn/Zein/Zeyn/Sane/Jarvis und "Hey sein/sain/zehn/seyn" korrigiert schon voice.js (fixKnownMishearings); die Welten B/C/D ändern diese Namen nicht', ist.eingaben.filter(z => /Alicia|Alissa|Zayn|Hey sein/.test(z.roh) && !z['A heute'].lokal).every(z => z.urteil['D beide'] === 'unverändert'));
    check('Befund heutige Fehlkorrektur: "Hallo zehn Minuten Pause bitte" wird schon HEUTE (voice.js) zu "Hallo Zane Minuten ..."', ist.eingaben.find(z => z.roh === 'Hallo zehn Minuten Pause bitte').heuteWieGemeint === false);
    check('Befund Lernbefehl: "Wenn ich Mal sage, meine ich Malte" und "... Ende ..." werden angenommen und verändern danach normale Sätze', JS(ist.lernen.gespeichert) === JS(['Mal', 'Ende', 'Hamlet']) && /Sag Malte/.test(ist.lernen.danach[0][1]) && /Enne/.test(ist.lernen.danach[1][1]));

    /* Gegenproben */
    {
        const wx = welt({ skriptReihenfolge: hinterAssistant(['langzeit.js']), quelleAendern: (f, q) => f === 'langzeit.js' ? q.replace("t.metadata.typ === 'episode'", 't.metadata.typ !== "nie"') : q });
        const sz = szenarien(fx)[3], x = await messeSuche(wx, handler, sz);
        check('Gegenprobe: ohne den Episoden-Filter findet die Langzeit-Variante den Merk-dir-Eintrag (der Test erkennt den Filter als Ursache)', enthaelt(x.ergebnis, 'Zweitschlüssel'));
        const wy = welt({ quelleAendern: (f, q) => f === 'langzeit.js' ? q.replace("if (lsGet(CLEAN_KEY)) return;", "return;") : q });
        const vek = [fx.merkdir, fx.kaffee].map(e => Object.assign({}, e)); verbinde(wy, handler, vek, {}); await wy.vorspulen(5000);
        check('Gegenprobe: ohne cleanupOnce bleiben die Merk-dir-Einträge erhalten (der Test erkennt das Aufräumen als Ursache)', vek.some(v => v.id === 'm1'));
        const wz = await weltMitKern({ skriptReihenfolge: hinterAssistant(['festnamen.js']), quelleAendern: (f, q) => f === 'festnamen.js' ? q.replace("[/schwarzenbeck/, 'Schwarzenbek'],", '') : q });
        const r = await sprechweg(wz, 'Wie komme ich nach Schwarzenbeck');
        check('Gegenprobe: ohne die Schwarzenbek-Regel bleibt der Ortsname unkorrigiert (der Test misst die Regel wirklich)', r.ki && /Schwarzenbeck/.test(r.ki[0]));
    }

    aufraeumenEnv();
    console.log('\nWirkungslose Funktionen (Phase 5C): ' + ok + ' Prüfungen ok, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
