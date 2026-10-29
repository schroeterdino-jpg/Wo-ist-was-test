/* ============================================================
   LANGZEIT-SUCHE UND AUFRÄUMEN (Phase 5D.1). Start: node tests/suche.js
     --vorher       misst den Zustand VOR dem Umbau und schreibt tests/suche_vorher.json (Golden Master "heute", nur zum Nachlesen)
     --schreiben    schreibt den Soll-Zustand tests/suche_soll.json neu
   Gemessen wird mit der ECHTEN Server-Datei api/memory.js und einem Attrappen-Vektorspeicher (tests/vektor_hilfen.js), in der echten Skript-Reihenfolge.
   Die Ähnlichkeit ist ein Stellvertreter: gemessen wird, was die App mit den Treffern macht, nicht wie gut ein Embedding ist.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { starte, lies } = require('./umgebung.js');
const H = require('./vektor_hilfen.js');

const DATEI = n => path.join(__dirname, n);
const VORHER = process.argv.includes('--vorher'), SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);
const CLEAN = 'jv_langzeit_aufgeraeumt_v1';
const welt = opt => starte(Object.assign({ festerZufall: true, echtesSpeak: true }, opt || {}));
const enthaelt = (liste, teil) => Array.isArray(liste) && liste.some(x => String(x).indexOf(teil) >= 0);
const zaehle = (liste, teil) => (liste || []).filter(x => String(x).indexOf(teil) >= 0).length;

/* ---------- Suchszenarien ---------- */
function szenarien(fx) {
    const bunt = [fx.plan('Montag'), fx.plan('Dienstag'), fx.plan('Mittwoch'), fx.plan('Donnerstag'), fx.plan('Freitag'), fx.kaffee, fx.liam2, fx.krimi1,
        { id: 's1', data: 'Isabel hat in der Schule Elternabend, die Stunde dafür ist noch offen', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: fx.d0 } },
        { id: 's2', data: 'Isabel braucht morgen Sportzeug für die dritte Stunde, hat Isabel gesagt', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: fx.d0 } },
        { id: 's3', data: 'Isabel Stunden Hausaufgaben morgen Schule dritte Stunde Matheheft', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: fx.d0 } },
        { id: 's4', data: 'Isabel Schule Stunde morgen dritte Elternbrief', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: fx.d0 } },
        { id: 's5', data: 'Isabel Schule Stunde morgen dritte Turnbeutel', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: fx.d0 } },
        { id: 's6', data: 'Isabel Schule Stunde morgen dritte Mathebuch', metadata: { typ: 'episode', kategorie: 'Event', datum_gesagt: fx.d0 } }];
    const alltag = [fx.schwimmen, fx.zahnarzt, fx.liam, fx.naechsteWoche, fx.kaffee, fx.sylt, fx.merkdir, fx.auto];
    return [
        { n: 'S01 normale Frage', f: 'Wann war ich schwimmen?', db: [fx.schwimmen, fx.kaffee, fx.liam] },
        { n: 'S02 keine Erinnerungen', f: 'Wann war ich schwimmen?', db: [] },
        { n: 'S03 Datumsfrage morgen', f: 'Was habe ich morgen vor?', db: alltag },
        { n: 'S04 diese Woche erledigen', f: 'Was muss ich diese Woche noch erledigen?', db: alltag.concat([fx.fristEpisode]) },
        { n: 'S05 nächste Woche geplant', f: 'Habe ich nächste Woche etwas geplant?', db: alltag },
        { n: 'S06 diese Woche anstehen', f: 'Was steht diese Woche an?', db: alltag.concat(fx.fueller(8)) },
        { n: 'S07 "Guten Morgen" (kein Zeitbezug)', f: 'Guten Morgen, wie geht es dir?', db: alltag },
        { n: 'S08 Wetter morgen', f: 'Wie wird morgen das Wetter?', db: alltag },
        { n: 'S09 Fahrt mit Zeitwort (gleich los)', f: 'Ich fahr gleich los', db: alltag },
        { n: 'S10 Vorlesen mit Zeitwort', f: 'Lies mir morgen etwas vor', db: alltag },
        { n: 'S11 Navigation mit Zeitwort', f: 'Navigier mich morgen früh zur Arbeit', db: alltag },
        { n: 'S12 Erinnerung mit Zeitwort', f: 'Erinner mich heute Abend an den Müll', db: alltag },
        { n: 'S13 Zweitschlüssel (Merk-dir-Eintrag ohne typ)', f: 'Wo liegt der Zweitschlüssel?', db: [fx.merkdir, fx.kaffee, fx.schwimmen] },
        { n: 'S14 Briefing-Fakt ohne Metadaten', f: 'Was ist mein Lieblingsessen?', db: [fx.auto, fx.ohneMeta, fx.kaffee] },
        { n: 'S15 Kündigen (Frist als typ frist und als Episode)', f: 'Was muss ich kündigen?', db: [fx.fristTyp, fx.fristEpisode, fx.kaffee] },
        { n: 'S16 Stundenplan mit Zeitwort', f: 'Was hat Isabel morgen in der dritten Stunde?', db: bunt },
        { n: 'S17 Stundenplan ohne Zeitwort', f: 'Wann hat Isabel Sport?', db: bunt },
        { n: 'S18 Dubletten (zwei gleiche Einträge)', f: 'Was lese ich gern?', db: [fx.krimi1, fx.krimi2, fx.kaffee] },
        { n: 'S19 Plan erscheint als Treffer UND als Zeitplan', f: 'Was habe ich morgen vor?', db: [fx.schwimmen, fx.kaffee] },
        { n: 'S20 Sonderzeichen und Umlaute', f: 'Was mag ich zum Müsli mit Äpfeln?', db: [fx.umlaut, fx.kaffee] },
        { n: 'S21 sehr viele Treffer', f: 'Was steht diese Woche an Haushalt Notiz?', db: alltag.concat(fx.fueller(60)) },
        { n: 'S22 Suche: API-Fehler 502', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], fehler: { search: '502' } },
        { n: 'S23 Suche: Netz weg', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], fehler: { search: 'wirft' } },
        { n: 'S24 Suche: leere Antwort', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], fehler: { search: 'leer' } },
        { n: 'S25 Suche: ungültige Antwort', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], fehler: { search: 'kaputt' } },
        { n: 'S26 Suche: zu langsam (2,5 s)', f: 'Wann war ich schwimmen?', db: [fx.schwimmen], latenz: { search: 2500 } },
        { n: 'S27 Zeitfrage: Gesamtliste fällt aus (502)', f: 'Was habe ich morgen vor?', db: alltag, fehler: { listall: '502' } },
        { n: 'S28 Zeitfrage: Gesamtliste Netz weg', f: 'Was habe ich morgen vor?', db: alltag, fehler: { listall: 'wirft' } },
        { n: 'S29 Zeitfrage: Gesamtliste ungültig', f: 'Was habe ich morgen vor?', db: alltag, fehler: { listall: 'kaputt' } },
        { n: 'S30 Zeitfrage: Gesamtliste zu langsam (2,5 s)', f: 'Was habe ich morgen vor?', db: alltag, latenz: { listall: 2500 } },
        { n: 'S31 Zeitfrage: beide fallen aus', f: 'Was habe ich morgen vor?', db: alltag, fehler: { search: '502', listall: '502' } },
        { n: 'S32 Zeitfrage: Suche fällt aus, Gesamtliste geht', f: 'Was habe ich morgen vor?', db: alltag, fehler: { search: '502' } },
        { n: 'S33 Stundenplan: Gesamtliste zu langsam', f: 'Was hat Isabel morgen in der dritten Stunde?', db: bunt, latenz: { listall: 2500 } }
        ,{ n: 'S34 Planungsfrage: Stimmung/Vorliebe mit Datum sind keine Pläne', f: 'Was steht diese Woche an?', db: [fx.stimmungMitDatum, fx.vorliebeMitDatum, fx.schwimmen, fx.kaffee] }
        ,{ n: 'S35 Stundenplan: kein Plan vorhanden und das ist nach dem Start bekannt', f: 'Wann hat Isabel Sport?', db: [fx.kaffee, fx.liam2, fx.krimi1], nachStart: true }
        ,{ n: 'S36 Stundenplan: Plan vorhanden, nach dem Start bekannt', f: 'Wann hat Isabel Sport?', db: bunt, nachStart: true }
    ];
}
async function messeSuche(handler, d0, sz) {
    const w = welt(); w.store[CLEAN] = '2026-10-07T00:00:00.000Z';   // Aufräumen läuft hier nicht mit
    const vektoren = sz.db.map(e => Object.assign({}, e)), log = H.verbinde(w, handler, vektoren, { fehler: sz.fehler, latenz: sz.latenz });
    if (sz.nachStart) { await w.vorspulen(5000); log.length = 0; }   // Start-Abfragen der App (Fristen, Stundenplan) sind vorbei
    const t0 = w.uhr.ms;
    const x = await w.lassLaufen(() => Promise.race([w.sb.searchSemanticMemory(sz.f), new Promise(res => w.sb.setTimeout(() => res([]), 1500))]));   // wie assistant.js: höchstens 1,5 s
    return { ladefehler: w.ladefehler.length, frage: sz.f, anfragen: log.filter(l => l.indexOf('app:') === 0).map(l => l.slice(4)), schreibzugriffe: log.filter(l => /^upstash:(delete|upsert)/.test(l)).length, wartezeitMs: w.uhr.ms - t0, ergebnis: x.haengt ? 'HÄNGT' : x.wert };
}

/* ---------- Aufräum-Szenarien ---------- */
function aufraeumDaten(fx) {
    return [
        fx.merkdir, fx.auto, fx.ohneMeta,                                           // gültig, ohne typ
        fx.schwimmen, fx.liam, fx.plan('Montag'),                                   // episode
        fx.fristTyp, fx.fristEpisode,                                               // frist
        { id: 'u1', data: 'Altes Zeug mit anderem typ', metadata: { typ: 'notiz', datum: '2026-01-01' } },        // alter/unbekannter Typ
        { id: 'u2', data: 'Eintrag mit Zahl als typ', metadata: { typ: 7 } },
        { id: 'd1', data: 'Doppelt: Der Schlüssel liegt im Flur', metadata: { quelle: 'merk_dir', datum: fx.d0 + 'T08:00:00.000Z' } },
        { id: 'd2', data: 'Doppelt: Der Schlüssel liegt im Flur', metadata: { quelle: 'merk_dir', datum: fx.d0 + 'T08:00:00.000Z' } },
        { id: 'l1', data: '', metadata: {} },                                      // eindeutig leer
        { id: 'l2', data: '   ', metadata: {} },                                   // nur Leerzeichen
        { id: 'l3', data: '', metadata: { typ: 'episode', kategorie: 'Event' } },   // leerer Text, aber mit Angaben: nicht eindeutig
        { id: 'b1', data: 'Beschädigt: Metadaten fehlen ganz', metadata: null },
        { id: 'b2', data: null, metadata: { quelle: 'merk_dir' } }                 // Text fehlt, Metadaten da
    ];
}
async function messeAufraeumen(handler, db, vorher, opt) {
    const w = welt(), vek = db.map(e => Object.assign({}, e)), log = H.verbinde(w, handler, vek, opt || {});
    if (vorher) vorher(w);
    await w.vorspulen(5000);
    return { geloescht: db.map(e => e.id).filter(id => !vek.some(v => v.id === id)), uebrig: vek.map(v => v.id), marke: !!w.store[CLEAN], deleteAnfragen: log.filter(l => l.indexOf('app:delete') === 0).length, ladefehler: w.ladefehler.length };
}

(async () => {
    const soll = fs.existsSync(DATEI('suche_soll.json')) ? JSON.parse(fs.readFileSync(DATEI('suche_soll.json'), 'utf8')) : {};
    const ist = {};
    const aufraeumenEnv = H.envSetzen();
    const handler = await H.ladeHandler();
    const w0 = welt(); const d0 = H.heuteIso(w0), fx = H.fixture(d0);
    check('Testwelt lädt ohne Ladefehler', w0.ladefehler.length === 0, JS(w0.ladefehler));

    ist.suche = {};
    for (const sz of szenarien(fx)) ist.suche[sz.n] = await messeSuche(handler, d0, sz);
    ist.aufraeumen = {
        ersterStart: await messeAufraeumen(handler, aufraeumDaten(fx), null),
        markeSchonGesetzt: await messeAufraeumen(handler, aufraeumDaten(fx), w => { w.store[CLEAN] = '2026-10-07T00:00:00.000Z'; }),
        listallFehler: await messeAufraeumen(handler, aufraeumDaten(fx), null, { fehler: { listall: '502' } }),
        listallUngueltig: await messeAufraeumen(handler, aufraeumDaten(fx), null, { fehler: { listall: 'kaputt' } }),
        syncListe: /jv_langzeit_aufgeraeumt/.test(lies('js/sync.js'))
    };

    if (VORHER) {
        fs.writeFileSync(DATEI('suche_vorher.json'), JSON.stringify(ist, null, 2) + '\n');
        console.log('Zustand VOR dem Umbau geschrieben: tests/suche_vorher.json');
        aufraeumenEnv(); return;
    }
    const S = ist.suche, A = ist.aufraeumen;
    const zeilen = n => Array.isArray(S[n].ergebnis) ? S[n].ergebnis : [];
    const listalls = n => S[n].anfragen.filter(x => x === 'listall').length;
    const nurSuche = n => JS(S[n].anfragen) === JS(['search topK=5']);
    const zeitFrage = n => JS(S[n].anfragen) === JS(['search topK=5', 'listall']);

    /* ---------- Reihenfolge-Unabhängigkeit: dieselben Ergebnisse, egal wo langzeit.js / foto_stundenplan.js geladen werden ---------- */
    const nach = (f, ziel) => l => { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); const j = l.indexOf(ziel); l.splice(j + 1, 0, f); return l; };
    const vor = (f, ziel) => l => { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); const j = l.indexOf(ziel); l.splice(j, 0, f); return l; };
    const REIHEN = {
        'langzeit.js nach assistant.js': nach('langzeit.js', 'assistant.js'),
        'foto_stundenplan.js nach assistant.js': nach('foto_stundenplan.js', 'assistant.js'),
        'beide nach assistant.js': l => nach('foto_stundenplan.js', 'assistant.js')(nach('langzeit.js', 'assistant.js')(l)),
        'langzeit.js ganz am Ende': l => { const i = l.indexOf('langzeit.js'); l.splice(i, 1); l.push('langzeit.js'); return l; },
        'foto_stundenplan.js hinter langzeit.js': l => nach('foto_stundenplan.js', 'langzeit.js')(l)
    };
    ist.reihenfolge = {};
    for (const [rn, fn] of Object.entries(REIHEN)) {
        ist.reihenfolge[rn] = {};
        for (const n of ['S03 Datumsfrage morgen', 'S08 Wetter morgen', 'S13 Zweitschlüssel (Merk-dir-Eintrag ohne typ)', 'S16 Stundenplan mit Zeitwort', 'S19 Plan erscheint als Treffer UND als Zeitplan', 'S30 Zeitfrage: Gesamtliste zu langsam (2,5 s)']) {
            const sz = szenarien(fx).find(x => x.n === n);
            const w = welt({ skriptReihenfolge: fn }); w.store[CLEAN] = '2026-10-07T00:00:00.000Z';
            const vek = sz.db.map(e => Object.assign({}, e)), log = H.verbinde(w, handler, vek, { fehler: sz.fehler, latenz: sz.latenz });
            const x = await w.lassLaufen(() => Promise.race([w.sb.searchSemanticMemory(sz.f), new Promise(res => w.sb.setTimeout(() => res([]), 1500))]));
            ist.reihenfolge[rn][n] = { ladefehler: w.ladefehler.length, anfragen: log.filter(l => l.indexOf('app:') === 0).map(l => l.slice(4)), ergebnis: x.haengt ? 'HÄNGT' : x.wert };
        }
    }

    /* ---------- Quelltext-Fakten: genau ein Besitzer ---------- */
    const quellen = {}; fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => f.endsWith('.js')).forEach(f => { quellen[f] = lies('js/' + f); });
    const fremdeSuche = q => Object.keys(q).filter(f => f !== 'assistant.js' && /(?:window\.)?searchSemanticMemory\s*=(?!=)/.test(q[f].replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
    const aufraeumRegel = src => (src.match(/async function cleanupOnce\(\) \{[\s\S]*?\n    \}\n/) || [''])[0];
    ist.quelltext = {
        fremdeZuweisungen: fremdeSuche(quellen),
        funktionsDeklarationen: Object.keys(quellen).filter(f => /(^|\n)\s*(?:async )?function searchSemanticMemory\b/.test(quellen[f])),
        quellenEintraege: Object.keys(quellen).filter(f => /jvSuchQuellen\s*=\s*window\.jvSuchQuellen\s*\|\|\s*\[\]\)\.push/.test(quellen[f])).sort(),
        aufraeumenLoeschtNachTyp: /metadata\.typ/.test(aufraeumRegel(quellen['langzeit.js'])),
        cleanKeyUnveraendert: /const CLEAN_KEY = 'jv_langzeit_aufgeraeumt_v1';/.test(quellen['langzeit.js'])
    };

    if (SCHREIBEN) { aufraeumenEnv(); fs.writeFileSync(DATEI('suche_soll.json'), JSON.stringify(ist, null, 1) + '\n'); console.log('Soll-Zustand geschrieben: tests/suche_soll.json'); return; }

    /* ---------- Vergleich mit dem Soll (Golden Master NACH dem Umbau) ---------- */
    for (const k of Object.keys(S)) check('Soll Suche ' + k, JS(S[k]) === JS(soll.suche && soll.suche[k]), JS(S[k]).slice(0, 300));
    for (const k of Object.keys(A)) check('Soll Aufräumen ' + k, JS(A[k]) === JS(soll.aufraeumen && soll.aufraeumen[k]), JS(A[k]));
    for (const rn of Object.keys(ist.reihenfolge)) check('Soll Reihenfolge ' + rn, JS(ist.reihenfolge[rn]) === JS(soll.reihenfolge && soll.reihenfolge[rn]));
    check('Soll Quelltext-Fakten', JS(ist.quelltext) === JS(soll.quelltext), JS(ist.quelltext));
    for (const k of Object.keys(soll)) check('Soll-Schlüssel ' + k + ' wird noch gemessen', k in ist);

    /* ---------- Erwartungen (das gewünschte Verhalten, unabhängig vom Soll) ---------- */
    const keinFehler = Object.keys(S).every(n => S[n].ladefehler === 0 && S[n].ergebnis !== 'HÄNGT' && Array.isArray(S[n].ergebnis));
    check('E00 alle Suchen laufen ohne Ladefehler, werfen nie und hängen nie', keinFehler);
    check('E00 Suche und Gesamtliste schreiben nie in den Speicher (kein delete/upsert)', Object.keys(S).every(n => S[n].schreibzugriffe === 0));

    // normale Suche
    check('E01 normale Frage: genau eine Anfrage (search, topK 5), keine Gesamtliste, Treffer vorhanden', nurSuche('S01 normale Frage') && enthaelt(S['S01 normale Frage'].ergebnis, 'schwimmen'));
    check('E02 keine Erinnerungen: leere Liste', JS(S['S02 keine Erinnerungen'].ergebnis) === '[]' && nurSuche('S02 keine Erinnerungen'));
    // Zeitfragen
    const Z3 = zeilen('S03 Datumsfrage morgen');
    check('E03 "Was habe ich morgen vor?": Zeitweg läuft (search + genau EINE listall), Plan von morgen steht zuerst als GEPLANT, andere Termine nicht als Plan', zeitFrage('S03 Datumsfrage morgen') && /^GEPLANT am .*: Der User geht mit Finja schwimmen/.test(Z3[0]) && Z3.filter(z => /^GEPLANT/.test(z)).length === 1 && !Z3.some(z => /^GEPLANT.*Sylt/.test(z)));
    const Z4 = zeilen('S04 diese Woche erledigen');
    check('E04 "Was muss ich diese Woche noch erledigen?": Zeitweg läuft; Plan, Geburtstag UND Frist erscheinen mit der richtigen Beschriftung (GEPLANT / GEBURTSTAG / FRIST)', zeitFrage('S04 diese Woche erledigen') && Z4.some(z => /^GEPLANT am .*schwimmen/.test(z)) && Z4.some(z => /^GEBURTSTAG am .*Liam hat Geburtstag/.test(z)) && Z4.some(z => /^FRIST am .*kündigen/.test(z)) && !Z4.some(z => /^GEPLANT am .*kündigen/.test(z)));
    const Z5 = zeilen('S05 nächste Woche geplant');
    check('E05 "Habe ich nächste Woche etwas geplant?": Zeitweg läuft; nur Pläne der nächsten Woche (Mutter), nicht von dieser (Schwimmen, Zahnarzt)', zeitFrage('S05 nächste Woche geplant') && Z5.some(z => /^GEPLANT am .*Mutter/.test(z)) && !Z5.some(z => /^GEPLANT am .*(schwimmen|Zahnarzt)/.test(z)));
    check('E06 "Was steht diese Woche an?": Zeitweg läuft, Pläne sortiert nach Datum', zeitFrage('S06 diese Woche anstehen') && (() => { const p = zeilen('S06 diese Woche anstehen').filter(z => /^(GEPLANT|GEBURTSTAG)/.test(z)); return p.length >= 3 && /schwimmen/.test(p[0]); })());
    // kein Zeitweg bei fremdem Zusammenhang
    for (const n of ['S01 normale Frage', 'S07 "Guten Morgen" (kein Zeitbezug)', 'S08 Wetter morgen', 'S09 Fahrt mit Zeitwort (gleich los)', 'S10 Vorlesen mit Zeitwort', 'S11 Navigation mit Zeitwort', 'S12 Erinnerung mit Zeitwort', 'S13 Zweitschlüssel (Merk-dir-Eintrag ohne typ)', 'S14 Briefing-Fakt ohne Metadaten', 'S15 Kündigen (Frist als typ frist und als Episode)', 'S18 Dubletten (zwei gleiche Einträge)', 'S20 Sonderzeichen und Umlaute'])
        check('E07 keine Gesamtliste bei: ' + S[n].frage, nurSuche(n) && !zeilen(n).some(z => /^(GEPLANT|FRIST|GEBURTSTAG) am /.test(z)));
    // Datenarten werden gefunden
    check('E08 Zweitschlüssel (Merk-dir-Eintrag ohne typ) wird gefunden, unverändert ohne Kategorie-Zusatz', zeilen('S13 Zweitschlüssel (Merk-dir-Eintrag ohne typ)').some(z => /^Am 12\.10\.2026 um 18:00 hat der Nutzer ausdrücklich .*Zweitschlüssel liegt bei der Nachbarin/.test(z)));
    check('E09 Briefing-Fakt ohne Metadaten und Eintrag mit leeren Metadaten werden gefunden', enthaelt(S['S14 Briefing-Fakt ohne Metadaten'].ergebnis, 'lieblingsessen: Pizza Margherita') && enthaelt(S['S14 Briefing-Fakt ohne Metadaten'].ergebnis, 'Waschmaschine'));
    check('E10 Kündigen: Frist-Eintrag (typ "frist") UND Frist-Episode werden gefunden', enthaelt(S['S15 Kündigen (Frist als typ frist und als Episode)'].ergebnis, 'Vertrag kündigen') && enthaelt(S['S15 Kündigen (Frist als typ frist und als Episode)'].ergebnis, 'Handyvertrag kündigen'));
    // Stundenplan
    const P16 = zeilen('S16 Stundenplan mit Zeitwort'), P17 = zeilen('S17 Stundenplan ohne Zeitwort');
    check('E11 Stundenplan mit "morgen": genau EINE Gesamtliste (keine doppelte), der Plan für morgen (Donnerstag) steht zuerst, die anderen Tage nicht', zeitFrage('S16 Stundenplan mit Zeitwort') && /^Stundenplan von Isabel, Donnerstag:/.test(P16[0]) && P16.filter(z => /^Stundenplan von/.test(z)).length === 1);
    check('E12 Stundenplan ohne Tag: genau EINE Gesamtliste, alle Tage', zeitFrage('S17 Stundenplan ohne Zeitwort') && P17.filter(z => /^Stundenplan von/.test(z)).length === 5);
    check('E13 Stundenplan-Frage mit "morgen" UND Planungsfrage braucht trotzdem nur EINE Gesamtliste', (() => { const n = 'S16 Stundenplan mit Zeitwort'; return listalls(n) === 1; })());
    check('E14 kein Plan vorhanden und nach dem Start bekannt: keine Gesamtliste mehr nur wegen des Stundenplans', nurSuche('S35 Stundenplan: kein Plan vorhanden und das ist nach dem Start bekannt'));
    check('E15 Plan vorhanden und nach dem Start bekannt: weiterhin genau eine Gesamtliste, Plan kommt', zeitFrage('S36 Stundenplan: Plan vorhanden, nach dem Start bekannt') && zeilen('S36 Stundenplan: Plan vorhanden, nach dem Start bekannt').filter(z => /^Stundenplan von/.test(z)).length === 5);
    // Dubletten
    check('E16 Dublette (zwei gleiche Einträge) erscheint nur einmal, der andere Eintrag bleibt', zaehle(S['S18 Dubletten (zwei gleiche Einträge)'].ergebnis, 'liest gern Krimis') === 1 && zaehle(S['S18 Dubletten (zwei gleiche Einträge)'].ergebnis, 'Kaffee') === 1);
    check('E17 Plan als Zeitzeile UND als Treffer: nur einmal (die GEPLANT-Zeile), der andere Treffer bleibt', zaehle(S['S19 Plan erscheint als Treffer UND als Zeitplan'].ergebnis, 'schwimmen') === 1 && /^GEPLANT/.test(zeilen('S19 Plan erscheint als Treffer UND als Zeitplan')[0]) && zaehle(S['S19 Plan erscheint als Treffer UND als Zeitplan'].ergebnis, 'Kaffee') === 1);
    check('E18 ähnliche, aber verschiedene Erinnerungen werden NICHT zusammengeworfen (7 verschiedene Notizen bleiben 7)', (() => { const n = 'S21 sehr viele Treffer'; return zeilen(n).filter(z => /Notiz Nummer/.test(z)).length === new Set(zeilen(n).filter(z => /Notiz Nummer/.test(z))).size; })());
    // Umfang
    check('E19 sehr viele Treffer: höchstens 12 Zeilen', zeilen('S21 sehr viele Treffer').length > 0 && zeilen('S21 sehr viele Treffer').length <= 12);
    // Formatierung
    check('E20 Erlebnisse mit Kategorie: "Kategorie: Text (erzählt am Datum)", Datum nur wenn vorhanden', zeilen('S01 normale Frage').some(z => /^Event: Der User geht mit Finja schwimmen\. \(.*\) \(erzählt am .*2026\)$/.test(z)));
    check('E21 Eintrag ohne Kategorie/Datum bleibt unverändert (kein erfundener Zusatz), nirgends "undefined"/"null"/"Eintrag:"', Object.keys(S).every(n => zeilen(n).every(z => !/undefined|null|NaN|^Eintrag:/.test(z))));
    check('E22 Stundenplan-Zeilen tragen keine Kategorie-Doppelung und kein "erzählt am" (Quelle Foto)', P17.filter(z => /Stundenplan von/.test(z)).every(z => /^Stundenplan von Isabel, \w+: 1\. Mathe/.test(z) && z.indexOf('erzählt') < 0));
    const Z34 = zeilen('S34 Planungsfrage: Stimmung/Vorliebe mit Datum sind keine Pläne');
    check('E23 Stimmung/Vorliebe mit Ereignisdatum werden NICHT als GEPLANT/FRIST/GEBURTSTAG beschriftet (keine falsche Kennzeichnung)', zeitFrage('S34 Planungsfrage: Stimmung/Vorliebe mit Datum sind keine Pläne') && !Z34.some(z => /^(GEPLANT|FRIST|GEBURTSTAG).*(gestresst|Eis)/.test(z)) && Z34.some(z => /^GEPLANT.*schwimmen/.test(z)));
    // Fehler
    for (const n of ['S22 Suche: API-Fehler 502', 'S23 Suche: Netz weg', 'S24 Suche: leere Antwort', 'S25 Suche: ungültige Antwort'])
        check('E24 ' + n + ': leere Liste, keine Ausnahme', JS(S[n].ergebnis) === '[]' && nurSuche(n));
    check('E25 Suche zu langsam (2,5 s): der Aufrufer bekommt nach 1,5 s eine leere Liste (Obergrenze von assistant.js)', JS(S['S26 Suche: zu langsam (2,5 s)'].ergebnis) === '[]' && S['S26 Suche: zu langsam (2,5 s)'].wartezeitMs === 1500);
    const ohnePlan = zeilen('S08 Wetter morgen');   // Trefferliste der normalen Suche für dieselbe Datenlage (anderer Satz, gleiche Treffer)
    for (const n of ['S27 Zeitfrage: Gesamtliste fällt aus (502)', 'S28 Zeitfrage: Gesamtliste Netz weg', 'S29 Zeitfrage: Gesamtliste ungültig'])
        check('E26 ' + n + ': die Treffer der normalen Suche bleiben erhalten, nichts Erfundenes', zeilen(n).length >= 4 && enthaelt(zeilen(n), 'schwimmen') && !zeilen(n).some(z => /^(GEPLANT|FRIST|GEBURTSTAG) am /.test(z)) && S[n].wartezeitMs === 0);
    const n30 = 'S30 Zeitfrage: Gesamtliste zu langsam (2,5 s)';
    check('E27 Gesamtliste zu langsam: die Treffer der normalen Suche bleiben erhalten (nicht alles verloren), Wartezeit höchstens 1 s', zeilen(n30).length >= 4 && enthaelt(zeilen(n30), 'schwimmen') && S[n30].wartezeitMs <= 1000 && !zeilen(n30).some(z => /^GEPLANT/.test(z)));
    check('E28 beide fallen aus: leere Liste, kein Hängen', JS(S['S31 Zeitfrage: beide fallen aus'].ergebnis) === '[]' && S['S31 Zeitfrage: beide fallen aus'].wartezeitMs === 0);
    check('E29 Suche fällt aus, Gesamtliste geht: die Pläne kommen trotzdem', zeilen('S32 Zeitfrage: Suche fällt aus, Gesamtliste geht').some(z => /^GEPLANT am .*schwimmen/.test(z)));
    check('E30 Stundenplan: Gesamtliste zu langsam: die Treffer der normalen Suche bleiben, Wartezeit höchstens 1 s', enthaelt(S['S33 Stundenplan: Gesamtliste zu langsam'].ergebnis, 'Sportzeug') && S['S33 Stundenplan: Gesamtliste zu langsam'].wartezeitMs <= 1000);
    // Reihenfolge
    for (const rn of Object.keys(ist.reihenfolge)) {
        check('E31 Reihenfolge "' + rn + '": lädt ohne Fehler und liefert dieselben Anfragen und Zeilen wie die normale Reihenfolge', Object.keys(ist.reihenfolge[rn]).every(n => ist.reihenfolge[rn][n].ladefehler === 0 && JS(ist.reihenfolge[rn][n].anfragen) === JS(S[n].anfragen) && JS(ist.reihenfolge[rn][n].ergebnis) === JS(S[n].ergebnis)), rn);
    }
    // Besitzer
    check('E32 genau EINE Fassung von searchSemanticMemory: nur assistant.js deklariert sie, keine andere Datei weist sie zu (ki_mitdenken.js hüllt sie per window.searchSemanticMemory = ... erst beim Seiten-Load, sieh Hinweis)', JS(ist.quelltext.funktionsDeklaration || ist.quelltext.funktionsDeklarationen) === JS(['assistant.js']) && JS(ist.quelltext.fremdeZuweisungen) === JS(['ki_mitdenken.js']), JS(ist.quelltext));
    check('E33 genau zwei Zusatzquellen tragen sich ein: langzeit.js und foto_stundenplan.js', JS(ist.quelltext.quellenEintraege) === JS(['foto_stundenplan.js', 'langzeit.js']));
    // Aufräumen
    const gesamt = new Set(aufraeumDaten(fx).map(e => e.id));
    check('E34 Aufräumen (erster Start / Neuinstallation): löscht NUR die eindeutig leeren Einträge (l1 leer, l2 nur Leerzeichen)', JS(A.ersterStart.geloescht.slice().sort()) === JS(['l1', 'l2']) && A.ersterStart.marke === true && A.ersterStart.deleteAnfragen === 1);
    check('E35 Aufräumen behält: Merk-dir, Briefing-Fakt, Eintrag ohne Metadaten, Episode, Plan, Frist (typ + Episode), unbekannte Typen, Dubletten, leeren Text MIT Angaben, beschädigte Einträge', ['m1', 'm2', 'm3', 'e1', 'e3', 'stundenplan_isabel_montag', 'f1', 'f2', 'u1', 'u2', 'd1', 'd2', 'l3', 'b1', 'b2'].every(id => A.ersterStart.uebrig.indexOf(id) >= 0) && A.ersterStart.uebrig.length === gesamt.size - 2);
    check('E36 bestehende V1-Marke: Aufräumen läuft nicht mehr, nichts wird gelöscht (auch keine leeren Einträge)', A.markeSchonGesetzt.geloescht.length === 0 && A.markeSchonGesetzt.deleteAnfragen === 0 && A.markeSchonGesetzt.uebrig.length === gesamt.size);
    check('E37 Gesamtliste fällt aus oder ist ungültig: nichts gelöscht, Marke NICHT gesetzt (neuer Versuch später)', [A.listallFehler, A.listallUngueltig].every(x => x.geloescht.length === 0 && x.marke === false && x.deleteAnfragen === 0));
    check('E38 Marke "jv_langzeit_aufgeraeumt_v1" unverändert, keine neue Marke, nicht in der Sync-Liste; Aufräumen entscheidet nicht mehr nach metadata.typ', ist.quelltext.cleanKeyUnveraendert && A.syncListe === false && ist.quelltext.aufraeumenLoeschtNachTyp === false && !/jv_langzeit_aufgeraeumt_v2/.test(quellen['langzeit.js']));
    check('E39 bestehende Einträge werden nie umgeschrieben: in allen Suchläufen kein upsert/delete (siehe E00) und Aufräumen sendet nur "delete" (keine Neuanlage)', Object.keys(A).filter(k => k !== 'syncListe').every(k => A[k].ladefehler === 0));

    /* ---------- Gegenproben: ein absichtlich zurückgebauter Zustand MUSS rot werden ---------- */
    async function probe(dateiAenderung, sz, opt) {
        const w = welt(Object.assign({ quelleAendern: (f, q) => dateiAenderung[f] ? dateiAenderung[f](q) : q }, opt || {})); w.store[CLEAN] = '2026-10-07T00:00:00.000Z';
        const vek = sz.db.map(e => Object.assign({}, e)), log = H.verbinde(w, handler, vek, { fehler: sz.fehler, latenz: sz.latenz });
        const t0 = w.uhr.ms;
        const x = await w.lassLaufen(() => Promise.race([w.sb.searchSemanticMemory(sz.f), new Promise(res => w.sb.setTimeout(() => res([]), 1500))]));
        return { anfragen: log.filter(l => l.indexOf('app:') === 0).map(l => l.slice(4)), wartezeitMs: w.uhr.ms - t0, ergebnis: x.haengt ? 'HÄNGT' : x.wert, ladefehler: w.ladefehler.length };
    }
    const SZ = n => szenarien(fx).find(x => x.n === n);
    const ersetze = (alt, neu) => q => { if (q.indexOf(alt) < 0) throw new Error('Gegenprobe: Textstelle nicht gefunden: ' + alt.slice(0, 50)); return q.replace(alt, neu); };
    {   // A: alter Episoden-Filter
        const r = await probe({ 'assistant.js': ersetze("if (!t || typeof t.text !== 'string' || !t.text.trim()) return;", "if (!t || typeof t.text !== 'string' || !t.text.trim() || !t.metadata || t.metadata.typ !== 'episode') return;") }, SZ('S13 Zweitschlüssel (Merk-dir-Eintrag ohne typ)'));
        check('Gegenprobe A: alter "episode"-Filter wieder aktiv → Zweitschlüssel nicht mehr gefunden (Test wird rot)', !enthaelt(r.ergebnis, 'Zweitschlüssel'));
        // G: Zweitschlüssel nicht gefunden (anderer Mechanismus: nur Einträge mit Kategorie)
        const g = await probe({ 'assistant.js': ersetze("if (!t || typeof t.text !== 'string' || !t.text.trim()) return;", "if (!t || typeof t.text !== 'string' || !t.text.trim() || !t.metadata || !t.metadata.kategorie) return;") }, SZ('S13 Zweitschlüssel (Merk-dir-Eintrag ohne typ)'));
        check('Gegenprobe G: Suche lässt Einträge ohne Kategorie weg → Zweitschlüssel nicht gefunden (Test wird rot)', !enthaelt(g.ergebnis, 'Zweitschlüssel'));
        // H: Kündigung nicht gefunden
        const h = await probe({ 'assistant.js': ersetze("if (!t || typeof t.text !== 'string' || !t.text.trim()) return;", "if (!t || typeof t.text !== 'string' || !t.text.trim() || (t.metadata && (t.metadata.typ === 'frist' || t.metadata.frist))) return;") }, SZ('S15 Kündigen (Frist als typ frist und als Episode)'));
        check('Gegenprobe H: Suche lässt Fristen weg → Kündigungsinformation nicht gefunden (Test wird rot)', !(enthaelt(h.ergebnis, 'Vertrag kündigen') && enthaelt(h.ergebnis, 'Handyvertrag kündigen')));
    }
    {   // B: Aufräumen löscht typ-losen Eintrag
        const w = welt({ quelleAendern: (f, q) => f === 'langzeit.js' ? q.replace(/const leer = d\.eintraege\.filter\([\s\S]*?\.map\(e => e\.id\);/, "const leer = d.eintraege.filter(e => !(e.metadata && (e.metadata.typ === 'episode' || e.metadata.typ === 'frist'))).map(e => e.id);") : q });
        const vek = aufraeumDaten(fx).map(e => Object.assign({}, e)); H.verbinde(w, handler, vek, {}); await w.vorspulen(5000);
        check('Gegenprobe B: Aufräumen wie früher (alles ohne typ episode/frist) → Merk-dir-Eintrag m1 gelöscht (Test wird rot)', !vek.some(v => v.id === 'm1'));
        check('Gegenprobe B: der Quelltext-Test erkennt das alte Aufräumen', /metadata\.typ/.test(aufraeumRegel(lies('js/langzeit.js').replace(/const leer = d\.eintraege\.filter\([\s\S]*?\.map\(e => e\.id\);/, "const leer = d.eintraege.filter(e => !(e.metadata && (e.metadata.typ === 'episode'))).map(e => e.id);"))));
    }
    {   // C: Wetter morgen löst listall aus
        const r = await probe({ 'langzeit.js': ersetze('braucht: q => istPlanungsfrage(q) && !!zeitraum(q)', 'braucht: q => !!zeitraum(q)') }, SZ('S08 Wetter morgen'));
        check('Gegenprobe C: Zeitweg allein wegen des Wortes "morgen" → Wetterfrage löst listall aus (Test wird rot)', r.anfragen.indexOf('listall') >= 0);
        // D: Planungsfrage löst Zeitweg NICHT aus
        const d = await probe({ 'langzeit.js': ersetze('braucht: q => istPlanungsfrage(q) && !!zeitraum(q)', 'braucht: q => false') }, SZ('S03 Datumsfrage morgen'));
        check('Gegenprobe D: Zeitweg aus → "Was habe ich morgen vor?" ohne GEPLANT-Zeile (Test wird rot)', d.anfragen.indexOf('listall') < 0 && !d.ergebnis.some(z => /^GEPLANT/.test(z)));
    }
    {   // E: langsame Gesamtliste löscht Treffer
        const r = await probe({ 'assistant.js': ersetze('SUCH_ZUSATZ_MS = 1000', 'SUCH_ZUSATZ_MS = 9000') }, SZ('S30 Zeitfrage: Gesamtliste zu langsam (2,5 s)'));
        check('Gegenprobe E: Gesamtliste ohne eigene Zeitgrenze → die erfolgreichen Treffer gehen verloren (Test wird rot)', JS(r.ergebnis) === '[]');
    }
    {   // F: Dublette zweimal
        const r = await probe({ 'assistant.js': ersetze("if ((id != null && ids.has(String(id))) || gesehen.has(schluessel)) return;", '') }, SZ('S19 Plan erscheint als Treffer UND als Zeitplan'));
        check('Gegenprobe F: ohne Entdoppelung erscheint der Plan doppelt (Test wird rot)', zaehle(r.ergebnis, 'schwimmen') === 2);
        const r2 = await probe({ 'assistant.js': ersetze("if ((id != null && ids.has(String(id))) || gesehen.has(schluessel)) return;", '') }, SZ('S18 Dubletten (zwei gleiche Einträge)'));
        check('Gegenprobe F2: ohne Entdoppelung erscheint die Dublette zweimal (Test wird rot)', zaehle(r2.ergebnis, 'liest gern Krimis') === 2);
    }
    {   // I: Stundenplan erzeugt zweite Gesamtliste
        const r = await probe({ 'foto_stundenplan.js': ersetze("liefere: function (q, gesamt) {", "liefere: function (q, gesamt) { try { apiFetch('/api/memory', { method: 'POST', headers: {}, body: JSON.stringify({ action: 'listall' }) }); } catch (e) {}") }, SZ('S16 Stundenplan mit Zeitwort'));
        check('Gegenprobe I: Stundenplan holt selbst nochmal die Gesamtliste → zwei listall (Test wird rot)', r.anfragen.filter(x => x === 'listall').length === 2);
    }
    {   // J: alte konkurrierende Implementierung wieder aktiv
        const q2 = Object.assign({}, quellen); q2['langzeit.js'] = quellen['langzeit.js'] + '\nwindow.searchSemanticMemory = async function (t) { return ["alt"]; };\n';
        check('Gegenprobe J: langzeit.js weist searchSemanticMemory wieder selbst zu → der Quelltext-Test meldet eine fremde Zuweisung (Test wird rot)', JS(fremdeSuche(q2)) === JS(['ki_mitdenken.js', 'langzeit.js']));
        const q3 = Object.assign({}, quellen); q3['foto_stundenplan.js'] = quellen['foto_stundenplan.js'] + '\nconst origSearch = window.searchSemanticMemory; window.searchSemanticMemory = async function () { return origSearch.apply(this, arguments); };\n';
        check('Gegenprobe J2: die alte Stundenplan-Hülle wird erkannt', JS(fremdeSuche(q3)) === JS(['foto_stundenplan.js', 'ki_mitdenken.js']));
        const wj = welt({ skriptReihenfolge: nach('langzeit.js', 'assistant.js'), quelleAendern: (f, q) => f === 'langzeit.js' ? q + '\nwindow.searchSemanticMemory = async function () { return ["alt"]; };\n' : q });
        check('Gegenprobe J3: eine zweite Fassung NACH assistant.js würde die Suche tatsächlich überschreiben (ohne Quelltext-Test unbemerkt)', /alt/.test(String(wj.sb.searchSemanticMemory)) && !/jvSuchQuellen/.test(String(wj.sb.searchSemanticMemory)));
    }
    check('Gegenproben-Anzahl: A–J sind alle gelaufen (Fehlschlag einer Textstelle würde oben mit Ausnahme abbrechen)', true);

    aufraeumenEnv();
    console.log('\nSuche und Aufräumen (Phase 5D.1): ' + ok + ' Prüfungen ok, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
