/* ============================================================
   Phase 7B – Prüfung: Zeitfrage (exakter Name vor Teilwort-Treffer) und Lesefehler von helfer_memory (storage.js isoliert).
   Produktänderung: je EINE Zeile in js/gedaechtnis_zeit.js (answer) und js/storage.js (memoryItems-Start).
   Teile:
     A  Zeitfrage: 15 Fälle, VORHER (alter Zustand, nachgebaut mit tests/memory7b_alt.js) gegen NACHHER (heutiger Code)
     B  Lesefehler: 8 Fälle, VORHER gegen NACHHER (Kontakte, Tageslog, Originalwert, Schreibzugriffe)
     C  Unverändert: alle 20 Phase-7A-Szenarien außer den zwei bewusst geänderten, Server-Befunde, statische Funde
     D  Chromium-Messstand (tests/memory7b_laufzeit.json)
     E  Gegenproben A–P (Quelltext nur im Speicher verändert) samt Kontrollläufen
   Golden Master: tests/memory7b_soll.json (vorher + nachher). Der 7A-Golden-Master (tests/memory7a_soll.json) bleibt UNVERÄNDERT.
   Start: node tests/memory7b.js        Soll neu schreiben (nur bewusst!): node tests/memory7b.js --schreiben
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
process.on('unhandledRejection', () => { });
const ROOT = path.join(__dirname, '..');
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const { welt, GEHEIM } = require('./memory7a_welt.js');
const sz = require('./memory7a_szenarien.js'), srv = require('./memory7a_server.js');
const { zustandVor7b: ALT, TAUSCH } = require('./memory7b_alt.js');
const SOLL = path.join(__dirname, 'memory7b_soll.json'), SOLL7A = path.join(__dirname, 'memory7a_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(n, c, extra) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + n + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 400) : '')); } }
const J = x => JSON.stringify(x), gleich = (a, b) => J(a) === J(b), kopie = x => JSON.parse(J(x));
const ZEIT0 = '2026-10-02T09:30:00.000Z';

/* ---------------- A  Zeitfrage ---------------- */
const FAELLE_A = {
    '01_exakt_nach_teilwort': { items: { 'schlüssel': 'im Flurschrank', 'zweitschlüssel': 'im Blumentopf' }, frage: 'zweitschlüssel' },
    '02_exakt_vor_teilwort': { items: { 'zweitschlüssel': 'im Blumentopf', 'schlüssel': 'im Flurschrank' }, frage: 'schlüssel' },
    '03_nur_teilwort': { items: { 'zweitschlüssel': 'im Blumentopf' }, frage: 'schlüssel' },
    '04_mehrere_teilwort': { items: { 'zweitschlüssel': 'im Blumentopf', 'ersatzschlüssel': 'in der Garage' }, frage: 'schlüssel' },
    '05_grossklein': { items: { 'Schlüssel': 'im Flurschrank', 'Zweitschlüssel': 'im Blumentopf' }, frage: 'ZWEITSCHLÜSSEL' },
    '06_umlaute': { items: { 'schlüssel': 'im Flurschrank', 'büro schlüssel': 'im Blumentopf' }, frage: 'büro schlüssel' },
    '07_bindestrich': { items: { 'schlüssel': 'im Flurschrank', 'zweit-schlüssel': 'im Blumentopf' }, frage: 'zweit-schlüssel' },
    '08_leerzeichen': { items: { 'schlüssel': 'im Flurschrank', 'zweiter schlüssel': 'im Blumentopf' }, frage: 'zweiter   schlüssel' },
    '09_kein_treffer': { items: { 'brille': 'im Flurschrank' }, frage: 'hammer' },
    '10_aehnlich_anderer_begriff': { items: { 'brille': 'im Flurschrank' }, frage: 'brillenetui' },
    '11_mehrere_aehnliche': { items: { 'schlüssel': 'im Flurschrank', 'schlüssel keller': 'im Blumentopf', 'schlüssel auto': 'in der Garage' }, frage: 'schlüssel auto' },
    '12_zwei_exakte_kandidaten': { items: { 'Schlüssel': 'im Flurschrank', 'schlüssel': 'im Blumentopf' }, frage: 'schlüssel' },
    '13_tippfehler_unscharf': { items: { 'brille': 'im Flurschrank' }, frage: 'brile' },
    '14_ohne_zeitstempel': { items: { 'schlüssel': 'im Flurschrank', 'zweitschlüssel': 'im Blumentopf' }, frage: 'zweitschlüssel', ohneZeit: true },
    '15_wert_gleich_frage': { items: { 'tisch': 'schlüssel', 'zweitschlüssel': 'im Blumentopf' }, frage: 'schlüssel' }
};
async function zeitfall(f, opt) {
    const zeit = {}; if (!f.ohneZeit) Object.keys(f.items).forEach(k => { zeit[k] = ZEIT0; });
    const w = welt(Object.assign({}, opt, { speicher: { helfer_memory: J(f.items), helfer_memory_zeit: J(zeit) } }));
    w.markiere();
    const s = await w.A.satz('Wann habe ich den ' + f.frage + ' abgelegt?');
    return { lokal: s.lokal, modul: s.modul, gesagt: s.gesagt, speicherUnveraendert: w.A.store.helfer_memory === J(f.items) && w.A.store.helfer_memory_zeit === J(zeit), memSchreib: w.log.filter(e => /^helfer_memory/.test(e[1])).length };
}
async function teilA(opt) { const o = {}; for (const [n, f] of Object.entries(FAELLE_A)) o[n] = await zeitfall(f, opt); return o; }

/* Suche: searchMemory selbst wird nicht verändert (andere Aufrufer: assistant.js, proaktiv.js) */
async function sucheMessen(opt) {
    const w = welt(Object.assign({}, opt, { speicher: { helfer_memory: J({ 'schlüssel': 'A', 'zweitschlüssel': 'B', 'ersatz schlüssel': 'C', 'brille': 'D', 'tisch': 'schlüssel' }) } }));
    const o = {}; for (const q of ['schlüssel', 'zweitschlüssel', 'SCHLÜSSEL', 'brille', 'brile', 'hammer', 'ersatz schlüssel', 'tisch']) o[q] = w.ev('searchMemory(' + J(q) + ')');
    return o;
}

/* ---------------- B  Lesefehler ---------------- */
const KONTAKTE = J({ testoma: { originalName: 'Testoma' } });
const FAELLE_B = {
    'A_nur_memory_kaputt': { helfer_memory: '{kaputt', helfer_contacts: KONTAKTE },
    'A2_memory_abgeschnitten': { helfer_memory: '{"a":"b"', helfer_contacts: KONTAKTE },
    'B_memory_korrekt': { helfer_memory: J({ 'schlüssel': 'A' }), helfer_contacts: KONTAKTE },
    'C_memory_leer_objekt': { helfer_memory: '{}', helfer_contacts: KONTAKTE },
    'C2_memory_leerer_text': { helfer_memory: '', helfer_contacts: KONTAKTE },
    'D_schluessel_fehlt': { helfer_contacts: KONTAKTE },
    'E_gueltiges_leeres_array': { helfer_memory: '[]', helfer_contacts: KONTAKTE },
    'F_gueltige_eintraege': { helfer_memory: J({ 'schlüssel': 'A', 'brille': 'B', 'zweitschlüssel': 'C' }), helfer_contacts: KONTAKTE }
};
async function fallB(sp, opt) {
    const w = welt(Object.assign({}, opt, { speicher: Object.assign({}, sp) }));
    const start = { geschrieben: w.log.map(e => e[0] + ':' + e[1]).sort() };
    w.merke('r'); w.markiere();
    await w.A.vorspulen(12000);
    const ruhe = w.log.map(e => e[0] + ':' + e[1]).sort();
    return {
        ladefehler: w.ladefehler.map(x => x.slice(0, 50)), memoryItems: w.ev('typeof memoryItems'), schluessel: w.keys(), istArray: w.ev('Array.isArray(memoryItems)'),
        kontakte: w.ev('typeof savedContacts === "object" ? Object.keys(savedContacts) : typeof savedContacts'), chatHistory: w.ev('typeof chatHistory'),
        briefing: w.ev('typeof briefingWishes'), home: w.ev('typeof homeAddress'),
        originalImSpeicher: sp.helfer_memory === undefined ? (w.A.store.helfer_memory === undefined ? 'fehlt' : 'NEU:' + w.A.store.helfer_memory) : (w.A.store.helfer_memory === sp.helfer_memory ? 'unveraendert' : 'GEAENDERT:' + w.A.store.helfer_memory),
        schreibenBeimStart: start.geschrieben, schreibenNach12s: ruhe, proxy: w.proxy(), takte: w.timerNamen(), refStabil: w.gleich('r')
    };
}
async function teilB(opt) { const o = {}; for (const [n, sp] of Object.entries(FAELLE_B)) o[n] = await fallB(sp, opt); return o; }

/* Kontrollen und Veränderungen am Rest */
async function sync7a(opt) { const s = sz.szenarien; return { S11: kopie(await s.S11_syncFehler(opt)), S12: kopie(await s.S12_syncNormal(opt)), S13: kopie(await s.S13_rennen(opt)), S16: kopie(await s.S16_dreiSekunden(opt)), S15: kopie(await s.S15_proxy(opt)) }; }
async function messen(opt) { return { zeit: await teilA(opt), suche: await sucheMessen(opt), lesefehler: await teilB(opt), rest: await sync7a(opt) }; }

/* ---------------- Gegenproben ---------------- */
const ers = (t, von, nach) => { if (!t.includes(von)) throw new Error('Gegenprobe: Muster nicht gefunden: ' + von.slice(0, 70)); return t.replace(von, () => nach); };
const mut = (datei, fn) => (d, t) => d === datei ? fn(t) : t;
const NEU_ZEIT = TAUSCH.find(t => t.datei === 'gedaechtnis_zeit.js').neu, NEU_STO = TAUSCH.find(t => t.datei === 'storage.js').neu;
const CATCH = "console.warn('helfer_memory ist kein gültiges JSON: Gedächtnis startet leer, der gespeicherte Wert bleibt unverändert.'); return {};";
const GP = {
    A: ['exakter Treffer wieder hinter Teilwort', mut('gedaechtnis_zeit.js', t => ers(t, "res.find(r => !r.unscharf && String(r.key).toLowerCase().replace(/\\s+/g, ' ').trim() === nt) || res[0] || null", 'res[0] || null'))],
    B: ['nur Teilwort-Treffer funktioniert nicht mehr', mut('gedaechtnis_zeit.js', t => ers(t, '=== nt) || res[0] || null', '=== nt) || null'))],
    C: ['kein Treffer erzeugt falsche Antwort', mut('gedaechtnis_zeit.js', t => ers(t, '=== nt) || res[0] || null', "=== nt) || res[0] || { key: 'Hammer', value: 'irgendwo' }"))],
    D: ['searchMemory() global verändert', mut('lists.js', t => ers(t, '    if (exact.length > 0) return exact;', '    exact.sort((a, b) => b.key.length - a.key.length);\n    if (exact.length > 0) return exact;'))],
    E: ['gespeicherter Text verändert', mut('gedaechtnis_zeit.js', t => ers(t, 'const ts = load()[hit.key];', "try { memoryItems[hit.key] = String(memoryItems[hit.key]).trim() + ' '; } catch (e) { } const ts = load()[hit.key];"))],
    F: ['neue Fuzzy-Suche (unscharfer Treffer wird beantwortet)', mut('gedaechtnis_zeit.js', t => ers(t, 'if (!hit || hit.unscharf) return null;', 'if (!hit) return null;')) ],
    G: ['mehrere exakte Kandidaten instabil (letzter statt erster)', mut('gedaechtnis_zeit.js', t => ers(t, 'hit = res.find(r =>', 'hit = res.filter(r => true).reverse().find(r =>'))],
    H: ['kaputtes JSON stoppt Kontakte wieder', mut('storage.js', t => ers(t, CATCH, 'throw e;'))],
    I: ['kaputtes JSON stoppt Tageslog wieder', mut('storage.js', t => ers(t, CATCH, 'throw e;'))],
    J: ['defektes helfer_memory wird gelöscht', mut('storage.js', t => ers(t, CATCH, "try { localStorage.removeItem('helfer_memory'); } catch (e2) { } return {};"))],
    K: ['defektes helfer_memory wird überschrieben', mut('storage.js', t => ers(t, CATCH, "setPersistentData('helfer_memory', '{}'); return {};"))],
    L: ['gültiges Memory lädt nicht mehr', mut('storage.js', t => ers(t, "return JSON.parse(getPersistentData('helfer_memory', '{}')) || {}; } catch", 'return {}; } catch'))],
    M: ['Proxy-/3-s-Verhalten verändert', mut('gedaechtnis_zeit.js', t => ers(t, 'setInterval(ensureProxy, 3000)', 'setInterval(ensureProxy, 5000)'))],
    N: ['Sync-Verhalten verändert', mut('sync.js', t => ers(t, 'JSON.stringify({ ...l, ...r })', 'JSON.stringify({ ...r, ...l })'))],
    O: ['Storage-Schlüssel umbenannt', mut('storage.js', t => ers(t, "return JSON.parse(getPersistentData('helfer_memory', '{}')) || {}; } catch", "return JSON.parse(getPersistentData('helfer_memory2', '{}')) || {}; } catch"))],
    P: ['Fehlerfall verursacht neue Schreibzugriffe', mut('storage.js', t => ers(t, CATCH, "setPersistentData('jv_lesefehler', '1'); return {};"))]
};
const teile = (a, b) => Object.keys(a).filter(k => !gleich(a[k], b[k]));

(async () => {
    const vorher = kopie(await messen({ quelleAendern: ALT })), nachher = kopie(await messen({}));
    const statisch7a = kopie(JSON.parse(lies('tests/memory7a_soll.json')).statisch);

    /* Golden Master */
    const ist = { vorher: { zeit: vorher.zeit, lesefehler: vorher.lesefehler }, nachher: { zeit: nachher.zeit, suche: nachher.suche, lesefehler: nachher.lesefehler } };
    if (SCHREIBEN) { fs.writeFileSync(SOLL, JSON.stringify(ist, null, 1) + '\n'); console.log('Soll geschrieben: ' + SOLL); }
    else if (!fs.existsSync(SOLL)) check('Golden Master vorhanden (tests/memory7b_soll.json)', false);
    else {
        const soll = JSON.parse(fs.readFileSync(SOLL, 'utf8'));
        check('Golden Master VORHER (alter Zustand): Zeitfragen', gleich(soll.vorher.zeit, ist.vorher.zeit), teile(soll.vorher.zeit, ist.vorher.zeit));
        check('Golden Master VORHER (alter Zustand): Lesefehler', gleich(soll.vorher.lesefehler, ist.vorher.lesefehler), teile(soll.vorher.lesefehler, ist.vorher.lesefehler));
        check('Golden Master NACHHER: Zeitfragen', gleich(soll.nachher.zeit, ist.nachher.zeit), teile(soll.nachher.zeit, ist.nachher.zeit));
        check('Golden Master NACHHER: Suche (searchMemory)', gleich(soll.nachher.suche, ist.nachher.suche));
        check('Golden Master NACHHER: Lesefehler', gleich(soll.nachher.lesefehler, ist.nachher.lesefehler), teile(soll.nachher.lesefehler, ist.nachher.lesefehler));
    }
    check('Suche: searchMemory liefert vorher und nachher dasselbe (nicht global verändert)', gleich(vorher.suche, nachher.suche));

    /* A – Zeitfrage Erwartungen (inhaltlich, nicht nur Golden) */
    const sagt = (m, n) => (m.zeit[n].gesagt || []).join(' | ');
    const startet = (m, n, key) => new RegExp('^' + key + ',|^Dazu habe ich kein Datum gespeichert\\. ' + key + ' steht').test(sagt(m, n));
    check('VORHER reproduzierbar: "Zweitschlüssel" landet beim falschen "schlüssel"-Treffer', startet(vorher, '01_exakt_nach_teilwort', 'Schlüssel'), sagt(vorher, '01_exakt_nach_teilwort'));
    check('NACHHER: "Zweitschlüssel" gewinnt gegen "schlüssel"', startet(nachher, '01_exakt_nach_teilwort', 'Zweitschlüssel'), sagt(nachher, '01_exakt_nach_teilwort'));
    check('VORHER Fehler auch in anderer Reihenfolge (Fall 02: Teilwort stand vorn -> falscher Eintrag)', startet(vorher, '02_exakt_vor_teilwort', 'Zweitschlüssel'), sagt(vorher, '02_exakt_vor_teilwort'));
    check('NACHHER: Fall 02 liefert den exakten Eintrag "schlüssel"', startet(nachher, '02_exakt_vor_teilwort', 'Schlüssel'), sagt(nachher, '02_exakt_vor_teilwort'));
    check('NACHHER: Fall 14 (ohne Zeitstempel) nennt den exakten Eintrag Zweitschlüssel', startet(nachher, '14_ohne_zeitstempel', 'Zweitschlüssel'), sagt(nachher, '14_ohne_zeitstempel'));
    for (const n of ['03_nur_teilwort', '04_mehrere_teilwort', '09_kein_treffer', '10_aehnlich_anderer_begriff', '12_zwei_exakte_kandidaten', '13_tippfehler_unscharf', '15_wert_gleich_frage'])
        check('Teilwort-/Rückfallverhalten unverändert: ' + n, gleich(vorher.zeit[n], nachher.zeit[n]), { v: vorher.zeit[n], n: nachher.zeit[n] });
    check('Teilwort-Fallback: nur Teilwort-Treffer wird weiter beantwortet (Fall 03 -> Zweitschlüssel)', startet(nachher, '03_nur_teilwort', 'Zweitschlüssel'));
    check('Mehrere Teilworttreffer: weiter der erste (Fall 04 -> Zweitschlüssel)', startet(nachher, '04_mehrere_teilwort', 'Zweitschlüssel'));
    check('Kein Treffer: keine Antwort, normale Verarbeitung (Fall 09)', nachher.zeit['09_kein_treffer'].lokal === false && nachher.zeit['09_kein_treffer'].gesagt.length === 0);
    check('Tippfehler (unscharf) wird weiter NICHT lokal beantwortet (kein Fuzzy, Fall 13)', nachher.zeit['13_tippfehler_unscharf'].lokal === false);
    check('Zwei exakte Kandidaten: stabil der erste, zweimal gleich (Fall 12)', gleich(nachher.zeit['12_zwei_exakte_kandidaten'], (await teilA({}))['12_zwei_exakte_kandidaten']));
    for (const n of ['05_grossklein', '06_umlaute', '07_bindestrich', '08_leerzeichen', '11_mehrere_aehnliche']) {
        const key = { '05_grossklein': 'Zweitschlüssel', '06_umlaute': 'Büro schlüssel', '07_bindestrich': 'Zweit-schlüssel', '08_leerzeichen': 'Zweiter schlüssel', '11_mehrere_aehnliche': 'Schlüssel auto' }[n];
        check('NACHHER richtiger exakter Eintrag: ' + n, startet(nachher, n, key), sagt(nachher, n));
    }
    const geaendert = teile(vorher.zeit, nachher.zeit);
    check('Genau diese Fälle ändern sich (exakter Name stand hinter einem Teilwort-Treffer)', gleich(geaendert, ['01_exakt_nach_teilwort', '02_exakt_vor_teilwort', '05_grossklein', '06_umlaute', '07_bindestrich', '08_leerzeichen', '11_mehrere_aehnliche', '14_ohne_zeitstempel']), geaendert);
    check('Gespeicherte Daten und Zeitstempel bleiben unverändert, kein Schreibzugriff auf helfer_memory* durch die Zeitfrage', Object.values(nachher.zeit).every(f => f.speicherUnveraendert && f.memSchreib === 0));

    /* B – Lesefehler Erwartungen */
    const Bn = nachher.lesefehler, Bv = vorher.lesefehler;
    check('VORHER reproduzierbar: kaputtes helfer_memory bricht storage.js ab (memoryItems, Kontakte, Tageslog fehlen)', /is not defined/.test(J(Bv.A_nur_memory_kaputt.memoryItems)) && /is not defined/.test(J(Bv.A_nur_memory_kaputt.kontakte)) && /is not defined/.test(J(Bv.A_nur_memory_kaputt.chatHistory)) && Bv.A_nur_memory_kaputt.ladefehler.length > 0, Bv.A_nur_memory_kaputt);
    check('VORHER: das kaputte Original blieb im Speicher bestehen', Bv.A_nur_memory_kaputt.originalImSpeicher === 'unveraendert');
    for (const n of ['A_nur_memory_kaputt', 'A2_memory_abgeschnitten']) {
        const r = Bn[n];
        check('NACHHER ' + n + ': keine Ladefehler, memoryItems leeres Objekt', r.ladefehler.length === 0 && r.memoryItems === 'object' && gleich(r.schluessel, []) && r.istArray === false, r);
        check('NACHHER ' + n + ': Kontakte, Tageslog, Briefing, Heimadresse laden weiter', gleich(r.kontakte, ['testoma']) && r.chatHistory === 'object' && r.briefing === 'object' && r.home === 'string', r);
        check('NACHHER ' + n + ': kaputtes Original bleibt exakt erhalten', r.originalImSpeicher === 'unveraendert', r.originalImSpeicher);
        check('NACHHER ' + n + ': keine zusätzlichen Schreibzugriffe (gleiche Schreibzugriffe wie mit gültigem Gedächtnis, nichts auf helfer_memory*)', gleich(r.schreibenBeimStart, Bn.B_memory_korrekt.schreibenBeimStart) && gleich(r.schreibenNach12s, Bn.B_memory_korrekt.schreibenNach12s) && ![].concat(r.schreibenBeimStart, r.schreibenNach12s).some(x => /helfer_memory/.test(x)), { s: r.schreibenBeimStart, n: r.schreibenNach12s });
        check('NACHHER ' + n + ': Proxy aktiv, genau ein 3-s-Takt', r.proxy === true && r.takte === 1);
    }
    for (const n of ['B_memory_korrekt', 'C_memory_leer_objekt', 'D_schluessel_fehlt', 'E_gueltiges_leeres_array', 'F_gueltige_eintraege']) check('Erfolgsfall unverändert (vorher = nachher): ' + n, gleich(Bv[n], Bn[n]), { v: Bv[n], n: Bn[n] });
    check('C2 leerer Text: vorher = nachher (leerer Text wird wie bisher behandelt)', gleich(Bv.C2_memory_leerer_text, Bn.C2_memory_leerer_text), { v: Bv.C2_memory_leerer_text, n: Bn.C2_memory_leerer_text });
    check('F gültige Einträge: Referenz stabil, Proxy, ein Takt', Bn.F_gueltige_eintraege.refStabil === true && Bn.F_gueltige_eintraege.proxy === true && Bn.F_gueltige_eintraege.takte === 1 && gleich(Bn.F_gueltige_eintraege.schluessel, ['schlüssel', 'brille', 'zweitschlüssel']));
    check('E gültiges leeres Array bleibt ein Array (Form wird nicht angefasst)', Bn.E_gueltiges_leeres_array.istArray === true);
    check('Kein Fall verändert den Originalwert (außer fehlendem Schlüssel: bleibt fehlend)', Object.values(Bn).every(r => /^(unveraendert|fehlt)$/.test(r.originalImSpeicher)), Object.values(Bn).map(r => r.originalImSpeicher));
    const gB = teile(Bv, Bn);
    check('Nur die zwei Fehlerfälle ändern sich (Erfolgsfälle nicht)', gleich(gB.filter(x => /^A/.test(x)), gB) && gB.length >= 1, gB);

    /* C – alles andere unverändert */
    const sz7a = JSON.parse(lies('tests/memory7a_soll.json')).szenarien;
    const jetzt = kopie(await sz.alle({}));
    for (const k of Object.keys(sz7a)) {
        if (k === 'S03_merkDir' || k === 'S14_kaputt') continue;
        check('Szenario ' + k + ' unverändert gegenüber Phase-7A-Golden-Master', gleich(sz7a[k], jetzt[k]), { soll: sz7a[k], ist: jetzt[k] });
    }
    const s03a = kopie(sz7a.S03_merkDir), s03n = kopie(jetzt.S03_merkDir);
    check('S03 (Merk-dir): Schreiben/Speichern unverändert, nur die Zeitantwort ist neu', gleich(s03a.sofort, s03n.sofort) && gleich(s03a.lesen.suche, s03n.lesen.suche) && !gleich(s03a.lesen.zeitantwort, s03n.lesen.zeitantwort));
    check('S03: Zeitantwort nennt jetzt Zweitschlüssel', /^Zweitschlüssel, im Blumentopf: Das habe ich /.test((s03n.lesen.zeitantwort.gesagt || [])[0] || ''), s03n.lesen.zeitantwort);
    const s14n = jetzt.S14_kaputt;
    check('S14: kaputtes JSON – ladefehlerfrei, memoryItems/Kontakte definiert, Original unverändert', gleich(s14n.kaputtesJson.ladefehler, []) && s14n.kaputtesJson.memoryItems === 'object' && s14n.kaputtesJson.kontakte === 'object' && s14n.kaputtesJson.speicherUnveraendert === true, s14n.kaputtesJson);
    check('S14: Array-Form (arrayStattObjekt) unverändert', gleich(sz7a.S14_kaputt.arrayStattObjekt, s14n.arrayStattObjekt));
    check('S14: Datenabgleich mit gutem Server-Stand unverändert (Sync nicht angefasst)', gleich(sz7a.S14_kaputt.kaputtesJsonMitServer, s14n.kaputtesJsonMitServer));
    const server = kopie(await srv.alle());
    check('Server-Befunde unverändert (api/sync.js, api/memory.js nicht angefasst)', gleich(JSON.parse(lies('tests/memory7a_soll.json')).server, server));
    /* statisch: Quelltext nur in den zwei Zeilen geändert */
    for (const t of TAUSCH) {
        const jetztT = lies('js/' + t.datei), altT = ALT(t.datei, jetztT);
        const a = jetztT.split('\n'), b = altT.split('\n');
        check('Produktdiff ' + t.datei + ': genau eine Zeile geändert', a.length === b.length && a.filter((z, i) => z !== b[i]).length === 1);
    }
    const stat = (() => { const F = {}; let n = 0; for (const d of fs.readdirSync(path.join(ROOT, 'js')).filter(f => /\.js$/.test(f)).sort()) { const c = lies('js/' + d).split('\n').filter(z => /\bmemoryItems\b/.test(z)).length; if (c) { F[d] = c; n += c; } } return { n, F }; })();
    check('memoryItems-Fundstellen weiter 47 in 13 Dateien (wie 7A)', stat.n === statisch7a.fundstellen && gleich(stat.F, statisch7a.fundstellenJeDatei));
    check('helfer_memory-Schlüssel nicht umbenannt (keine "helfer_memory2" im Code)', !fs.readdirSync(path.join(ROOT, 'js')).some(d => /helfer_memory2/.test(lies('js/' + d))));
    check('kein removeItem/clear auf helfer_memory in js/', !fs.readdirSync(path.join(ROOT, 'js')).some(d => lies('js/' + d).split('\n').some(z => /removeItem\([^)]*helfer_memory/.test(z))));
    check('Sync, Server, Android, jvMemory: nicht angefasst (nur 2 Produktdateien vom Tausch betroffen)', TAUSCH.length === 2);

    /* D – Chromium */
    const cp = path.join(__dirname, 'memory7b_laufzeit.json');
    if (!fs.existsSync(cp)) check('Chromium-Messstand vorhanden', false);
    else {
        const c = JSON.parse(fs.readFileSync(cp, 'utf8'));
        check('Chromium: Zeitfrage "Zweitschlüssel" -> richtiger Eintrag', c.zeitfrage.zweit.behandelt === true && /^Zweitschlüssel, im Testtopf/.test(c.zeitfrage.zweit.gesagt[0]), c.zeitfrage.zweit);
        check('Chromium: Zeitfrage "schlüssel" -> exakter Eintrag', /^Schlüssel, unter dem Testkissen/.test(c.zeitfrage.erst.gesagt[0]));
        check('Chromium: unbekannter Gegenstand wird nicht lokal beantwortet', c.zeitfrage.keiner.behandelt === false);
        const k = c.kaputt;
        check('Chromium: App startet weiter (memoryItems Objekt, Proxy aktiv)', k.memoryItems === 'object' && k.proxy === true);
        check('Chromium: Kontakte und Tageslog verfügbar', gleich(k.kontakte, ['testoma']) && k.chatHistory === 'object');
        check('Chromium: defekter Originalwert noch exakt vorhanden', k.originalGleich === true && k.originalWert === '{kaputt');
        check('Chromium: keine Schreibzugriffe auf Gedächtnis-Schlüssel (keine automatische Reparatur)', gleich(k.schreibzugriffe, {}));
        check('Chromium: keine neuen Seitenfehler im Fehlerfall (nur das bekannte "tailwind")', c.seitenfehler.filter(s => s.startsWith('kaputt|')).every(s => /tailwind is not defined/.test(s)), c.seitenfehler);
        const neu = c.konsole.filter(s => s.startsWith('kaputt|')).filter(s => !/ERR_FAILED|3D|AudioContext|Service Worker|Aufräumen des Langzeit/.test(s));
        check('Chromium: einzige neue Konsolenmeldung ist die gewollte Warnung', neu.length === 1 && /warning\|helfer_memory ist kein gültiges JSON/.test(neu[0]), neu);
    }

    /* E – Gegenproben */
    const kontrollen = { unveraendert: await messen({ quelleAendern: (d, t) => t }), nurKommentar: await messen({ quelleAendern: (d, t) => d === 'gedaechtnis_zeit.js' ? '/* Kommentar */\n' + t : t }) };
    for (const [n, m] of Object.entries(kontrollen)) check('Kontrolle "' + n + '": alles wie nachher', gleich(kopie(m), nachher), teile(kopie(m), nachher));
    const erg = {};
    for (const [id, [text, q]] of Object.entries(GP)) {
        let teileGeaendert = [], hinweis = '';
        try {
            const m = kopie(await messen({ quelleAendern: q }));
            for (const t of ['zeit', 'suche', 'lesefehler', 'rest']) { const d = teile(m[t], nachher[t]); if (d.length) teileGeaendert.push(t + ':' + d.slice(0, 3).join('+')); }
        } catch (e) { hinweis = 'FEHLER ' + e.message; }
        erg[id] = { text, erkannt: teileGeaendert.length > 0, wo: teileGeaendert.join(' ') || hinweis };
        check('Gegenprobe ' + id + ' (' + text + ') wird erkannt', teileGeaendert.length > 0, hinweis);
    }
    if (process.argv.includes('--zeige')) console.log(JSON.stringify({ gegenproben: erg, geaendertZeit: geaendert, geaendertLesefehler: gB }, null, 1));
    console.log('PHASE 7B: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
