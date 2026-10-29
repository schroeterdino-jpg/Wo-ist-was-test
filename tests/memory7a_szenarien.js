/* ============================================================
   Phase 7A: Szenarien zum lokalen Gedächtnis (memoryItems). Jedes Szenario läuft in einer FRISCHEN Welt (tests/memory7a_welt.js) und liefert
   einen kleinen, vergleichbaren Messwert (nur was der heutige Code wirklich tut). Das ist der Ist-Zustand, kein Wunschzustand.
   alle(opt)  ->  { S01: {...}, S02: {...}, ... }; opt.quelleAendern(datei, text) nur für Gegenproben (Quelltext im Speicher verändert).
   ============================================================ */
'use strict';
const { welt, serverAttrappe, MEMKEYS, GEHEIM, lies } = require('./memory7a_welt.js');

const MEM0 = { 'schlüssel': 'unter dem Kopfkissen', 'brille': 'auf dem Tisch' };
const SPEICHER0 = () => ({ helfer_memory: JSON.stringify(MEM0) });
const K = w => (w.keys() || []).slice().sort();
const sortiert = o => (o && typeof o === 'object') ? Object.keys(o).sort() : o;
const kurz = x => (typeof x === 'string' && x.length > 90) ? x.slice(0, 90) + '…' : x;

function ohneZeit(z) { return z && typeof z === 'object' ? Object.keys(z).sort() : z; }

const S = {};

/* S01 Start mit leerem Speicher */
S.S01_startLeer = async function (opt) {
    const w = welt(opt);
    return { ladefehler: w.ladefehler, typ: w.ev('typeof memoryItems'), schluessel: w.keys(), proxy: w.proxy(), takte: w.timerNamen(), schreibenBeimStart: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
};

/* S02 Start mit vorhandenen Einträgen */
S.S02_startMitEintraegen = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: Object.assign(SPEICHER0(), { helfer_memory_zeit: JSON.stringify({ 'schlüssel': '2026-10-01T08:00:00.000Z' }) }) }));
    return { ladefehler: w.ladefehler, schluessel: w.keys(), proxy: w.proxy(), takte: w.timerNamen(), schreibenBeimStart: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']), zeitUnveraendert: w.A.store.helfer_memory_zeit === JSON.stringify({ 'schlüssel': '2026-10-01T08:00:00.000Z' }) };
};

/* S03 Ablauf A: "Merk dir, dass mein Zweitschlüssel ..." (KI liefert memory_store). Input → Verarbeitung → RAM → Storage → Server/Sync → späteres Lesen */
S.S03_merkDir = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0(), mitSync: true }));
    w.merke('vorher'); w.markiere();
    const k = await w.A.ki('Merk dir, dass mein Zweitschlüssel im Blumentopf liegt', [{ type: 'memory_store', memory_key: 'Zweitschlüssel', memory_value: 'im Blumentopf' }]);
    const sofort = { speicher: w.json('helfer_memory'), zeit: ohneZeit(w.json('helfer_memory_zeit')), schreiben: w.schreibzaehler(), langzeitAufrufe: w.memAufrufe.map(b => b && b.action), refGleich: w.gleich('vorher'), proxy: w.proxy(), fehler: k.fehler || null };
    // späteres Lesen (RAM, Suche, Zeitfrage)
    const lesen = { suche: w.ev("searchMemory('zweitschlüssel')"), zeitantwort: null };
    const s = await w.A.satz('Wann habe ich den Zweitschlüssel abgelegt?');
    lesen.zeitantwort = { lokal: s.lokal, modul: s.modul, gesagt: s.gesagt.map(kurz) };
    return { sofort, lesen };
};

/* S03b derselbe Satz als gesprochener Satz (lokaler Weg zuerst) */
S.S03b_merkDirSatz = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0() })); w.markiere();
    const s = await w.A.satz('Merk dir, dass mein Zweitschlüssel im Blumentopf liegt');
    return { lokal: s.lokal, modul: s.modul, aenderungen: Object.keys(s.aenderungen || {}), schreiben: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
};

/* S04 Ablauf B: normale Erinnerung anlegen (berührt memoryItems nicht) */
S.S04_erinnerung = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0() })); w.markiere();
    const k = await w.A.ki('Erinner mich morgen um 9 Uhr an den Anruf', [{ type: 'reminder', reminder_text: 'Anruf', reminder_time: '2026-10-29T09:00:00+01:00' }]);
    return { schreiben: w.schreibzaehler(), erinnerungen: w.json('helfer_reminders') ? w.json('helfer_reminders').length : 0, gedaechtnisUnberuehrt: JSON.stringify(w.json('helfer_memory')) === JSON.stringify(MEM0), fehler: k.fehler || null };
};

/* S05 Ablauf C und D: Langzeitgedächtnis (Vektor) lesen und semantische Suche */
S.S05_langzeitLesen = async function (opt) {
    const treffer = [{ id: 'v1', text: 'Der Zweitschlüssel liegt im Blumentopf.', score: 0.9, metadata: { typ: 'episode', kategorie: 'Merk-dir' } }];
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0(), mitSync: true, memoryAntwort: b => b && b.action === 'search' ? { treffer } : (b && b.action === 'listall' ? { eintraege: [] } : { ok: true }) })); w.markiere();
    const zeilen = await w.A.sb.searchSemanticMemory('Wo ist mein Zweitschlüssel versteckt');
    return { zeilen: Array.from(zeilen), aufrufe: w.memAufrufe.map(b => b.action + (b.topK ? ' topK=' + b.topK : '')), speicherGeschrieben: w.log.length, lokalesGedaechtnisUnberuehrt: JSON.stringify(w.json('helfer_memory')) === JSON.stringify(MEM0) };
};
S.S05b_langzeitSpeichern = async function (opt) {   // Merk-dir legt zusätzlich einen Langzeit-Eintrag ab (gedaechtnis.js, fire-and-forget)
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0(), mitSync: true })); w.markiere();
    await w.speichere('zweitschlüssel', 'im Blumentopf');
    return { aufrufe: w.memAufrufe.map(b => b && b.action), textEnthaeltOriginalsatz: !!(w.memAufrufe[0] && /Merk dir/.test(String(w.memAufrufe[0].text))) };
};

/* S06 Ablauf E: Eintrag ändern / überschreiben */
S.S06_aendern = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: Object.assign(SPEICHER0(), { helfer_memory_zeit: JSON.stringify({ 'schlüssel': '2026-10-01T08:00:00.000Z' }) }) }));
    w.merke('v'); await w.A.vorspulen(60000); w.markiere();
    await w.speichere('schlüssel', 'in der Jacke');
    const nachNeu = { mem: w.json('helfer_memory'), zeit: w.json('helfer_memory_zeit'), schreiben: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
    await w.A.vorspulen(60000); w.markiere();
    await w.speichere('schlüssel', 'in der Jacke');   // derselbe Platz noch einmal
    const nachGleich = { zeitGeaendert: w.json('helfer_memory_zeit')['schlüssel'] !== nachNeu.zeit['schlüssel'], schreiben: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
    await w.A.vorspulen(60000); w.markiere();
    await w.listEdit('replace', ['brille'], 'in der Tasche');
    const nachListEdit = { mem: w.json('helfer_memory'), schreiben: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
    await w.A.vorspulen(60000); w.markiere();
    await w.speichere('schlüsselort', 'im Auto');   // Variante "…ort" ersetzt den alten Schlüssel
    const nachVariante = { schluessel: Object.keys(w.json('helfer_memory')).sort(), zeitSchluessel: ohneZeit(w.json('helfer_memory_zeit')) };
    return { nachNeu, nachGleich, nachListEdit, nachVariante, refGleich: w.gleich('v') };
};

/* S07 Ablauf F: Eintrag löschen */
S.S07_loeschen = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: Object.assign({ helfer_memory: JSON.stringify({ 'schlüssel': 'a', 'zweitschlüssel': 'b', 'brille': 'c' }) }, { helfer_memory_zeit: JSON.stringify({ 'schlüssel': '2026-10-01T08:00:00.000Z', 'brille': '2026-10-02T08:00:00.000Z' }) }) }));
    w.merke('v'); w.markiere();
    const eindeutig = await w.listEdit('remove', ['brille']);
    const a = { mem: sortiert(w.json('helfer_memory')), zeit: ohneZeit(w.json('helfer_memory_zeit')), fehler: eindeutig.fehler || null, schreiben: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
    w.markiere();
    const exakt = await w.listEdit('remove', ['schlüssel']);   // "schlüssel" ist exakt da, "zweitschlüssel" enthält es nur
    const b = { mem: sortiert(w.json('helfer_memory')), fehler: exakt.fehler || null };
    w.A.sb.__t = { 'ersatzschlüssel': 'x', 'zweitschlüssel': 'y' }; w.ev('memoryItems = window.__t; setPersistentData("helfer_memory", JSON.stringify(memoryItems));');
    const mehrdeutig = await w.listEdit('remove', ['schlüssel']);
    const c = { mem: sortiert(w.json('helfer_memory')), fehler: (mehrdeutig.fehler || []).map(kurz) };
    w.A.sb.__t = { 'schlüssel': 'a', 'brille': 'c' }; w.ev('memoryItems = window.__t; setPersistentData("helfer_memory", JSON.stringify(memoryItems));');
    w.markiere(); w.ev("deleteMemoryItem('brille')");
    const d = { mem: sortiert(w.json('helfer_memory')), zeit: ohneZeit(w.json('helfer_memory_zeit')), schreiben: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
    const leeren = await w.listEdit('clear', []);   // per Sprache nicht erlaubt
    const e = { fehler: (leeren.fehler || []).map(kurz), mem: sortiert(w.json('helfer_memory')) };
    w.merke('vorClear'); w.ev('clearAllMemory()');
    const f = { mem: w.json('helfer_memory'), zeit: w.json('helfer_memory_zeit'), refGleich: w.gleich('vorClear'), proxy: w.proxy() };
    return { a, b, c, d, e, f };
};

/* S08 Ablauf G: App-Neustart */
S.S08_neustart = async function (opt) {
    const w1 = welt(Object.assign({}, opt, { speicher: SPEICHER0(), mitSync: true }));
    await w1.speichere('zweitschlüssel', 'im Blumentopf');
    const w2 = w1.neustart(); const z = w2.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']);
    const gleich = JSON.stringify(w2.A.store.helfer_memory) === JSON.stringify(w1.A.store.helfer_memory);
    // nur der Sitzungsspeicher hat die Daten (Gerätespeicher leer): getPersistentData holt sie von dort
    const w3 = welt(Object.assign({}, opt, { speicher: {}, sitzung: { helfer_memory: JSON.stringify({ 'nur': 'sitzung' }) } }));
    return { schluesselNachNeustart: w2.keys(), proxy: w2.proxy(), zeitNachNeustart: ohneZeit(w2.json('helfer_memory_zeit')), schreibenBeimStart: z, speicherGleich: gleich, referenzNeu: w2.ev('typeof memoryItems') === 'object', nurSitzung: w3.keys() };
};

/* S09 Ablauf H: mehrere Änderungen kurz hintereinander */
S.S09_schnell = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0() })); w.merke('v'); w.markiere();
    await Promise.all([w.speichere('a', '1'), w.speichere('b', '2'), w.speichere('c', '3')]);
    const nacheinander = (async () => { await w.speichere('d', '4'); await w.speichere('d', '5'); })(); await nacheinander;
    return { mem: w.json('helfer_memory'), zeit: ohneZeit(w.json('helfer_memory_zeit')), schreiben: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']), refGleich: w.gleich('v') };
};

/* S10 Ablauf I: der Speicher wird von anderer Stelle verändert (zweiter Tab/Fenster, gleicher Ursprung) */
S.S10_fremderZugriff = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0() }));
    w.A.store.helfer_memory = JSON.stringify({ 'schlüssel': 'unter dem Kopfkissen', 'brille': 'auf dem Tisch', 'extern': 'vom zweiten Tab' });   // Tab B schreibt
    const ramSieht = w.keys();
    await w.speichere('neu', 'x');   // Tab A schreibt danach
    const nach = sortiert(w.json('helfer_memory'));
    // RAM älter als Speicher beim Lesen: Suche sieht nur RAM
    return { ramSiehtExternen: ramSieht.includes('extern'), nachSchreibenInA: nach, externerEintragVerloren: !nach.includes('extern') };
};

/* S11 Ablauf J: Fehler bei Server-/Memory-Synchronisierung */
async function syncLauf(modus, lokal, opt, serverItems, meta, extra) {
    const server = serverAttrappe(); if (serverItems) server.setzeItems(serverItems); server.modus = modus;
    const sp = { helfer_memory: JSON.stringify(lokal) }; if (meta) sp.helfer_sync_meta = JSON.stringify(meta);
    const w = welt(Object.assign({}, opt, { speicher: sp, mitSync: true, server }, extra || {}));
    w.merke('v'); w.markiere();
    await w.ev('syncNow()');
    return { w, server };
}
S.S11_syncFehler = async function (opt) {
    const out = {};
    for (const modus of ['fehler500', 'offline', 'leer', 'kaputt']) {
        const { w, server } = await syncLauf(modus, MEM0, opt, { helfer_memory: { v: JSON.stringify({ 'ganz': 'anders' }), ts: 9e12 } });
        out[modus] = { lokal: sortiert(w.json('helfer_memory')), ramGleich: JSON.stringify(K(w)) === JSON.stringify(sortiert(MEM0)), refGleich: w.gleich('v'), serverAnfragen: server.anfragen.map(a => a.methode), schreibenMem: w.schreibzaehler(['helfer_memory']) };
    }
    return out;
};

/* S12 Datenabgleich im Normalfall: Server unbekannt / Server neuer / Gerät neuer / nie abgeglichen / Gerät leer */
S.S12_syncNormal = async function (opt) {
    const out = {};
    let r = await syncLauf('ok', MEM0, opt, null, null);
    out.serverKenntNichts = { serverHat: sortiert(JSON.parse(r.server.items().helfer_memory.v)), anfragen: r.server.anfragen.map(a => a.methode + ':' + a.ids.filter(i => i === 'helfer_memory').join()) };
    r = await syncLauf('ok', MEM0, opt, { helfer_memory: { v: JSON.stringify({ 'schlüssel': 'im Auto', 'neu': 'x' }), ts: 2000 } }, { helfer_memory: 1000 });
    out.serverNeuer = { lokal: r.w.json('helfer_memory'), refGleich: r.w.gleich('v'), proxyDirekt: r.w.proxy(), zeit: ohneZeit(r.w.json('helfer_memory_zeit')), schreibenMem: r.w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
    await r.w.A.vorspulen(3100); out.serverNeuer.proxyNach3s = r.w.proxy();
    r = await syncLauf('ok', MEM0, opt, { helfer_memory: { v: JSON.stringify({ 'alt': 'x' }), ts: 1000 } }, { helfer_memory: 2000 });
    out.geraetNeuer = { serverHat: sortiert(JSON.parse(r.server.items().helfer_memory.v)), lokal: sortiert(r.w.json('helfer_memory')) };
    r = await syncLauf('ok', MEM0, opt, { helfer_memory: { v: JSON.stringify({ 'schlüssel': 'im Auto', 'neu': 'x' }), ts: 2000 } }, null);
    out.nieAbgeglichen = { lokal: r.w.json('helfer_memory'), serverHat: sortiert(JSON.parse(r.server.items().helfer_memory.v)) };
    const server = serverAttrappe(); server.setzeItems({ helfer_memory: { v: JSON.stringify({ 'vom': 'server' }), ts: 5 } });
    const w = welt(Object.assign({}, opt, { speicher: {}, mitSync: true, server })); await w.ev('syncNow()');
    out.geraetLeer = { lokal: w.json('helfer_memory'), keys: w.keys() };
    // zwei Geräte, beide offline geändert: lokal neuerer Stand (ts 3000) mit Extra-Eintrag, Server hat noch neueren Stand (ts 4000) von einem anderen Gerät
    r = await syncLauf('ok', Object.assign({}, MEM0, { lokalextra: 'nur hier' }), opt, { helfer_memory: { v: JSON.stringify({ 'schlüssel': 'vom anderen Gerät' }), ts: 4000 } }, { helfer_memory: 3000 });
    out.parallel = { lokal: sortiert(r.w.json('helfer_memory')), extraVerloren: !('lokalextra' in (r.w.json('helfer_memory') || {})) };
    // mehr als fünf geänderte Einträge auf einmal: Zeitstempel nur für das Rückfall-Verfahren bis fünf
    const viele = {}; for (let i = 0; i < 7; i++) viele['k' + i] = 'v' + i;
    r = await syncLauf('ok', {}, opt, { helfer_memory: { v: JSON.stringify(viele), ts: 2000 } }, { helfer_memory: 1000 });
    out.siebenNeue = { anzahl: r.w.keys().length, zeitEintraege: Object.keys(r.w.json('helfer_memory_zeit') || {}).length };
    return out;
};

/* S13 Datenabgleich mit Rennen: verspätete Serverantwort, lokaler Write während Sync */
S.S13_rennen = async function (opt) {
    const out = {};
    // (a) GET verspätet, in der Wartezeit schreibt der Nutzer lokal
    let server = serverAttrappe(); server.setzeItems({ helfer_memory: { v: JSON.stringify({ 'serverwert': 'x' }), ts: 1500 } }); server.modus = 'verspaetet';
    let w = welt(Object.assign({}, opt, { speicher: SPEICHER0(), mitSync: true, server, }));
    w.A.store.helfer_sync_meta = JSON.stringify({ helfer_memory: 1000 });
    w.ev('syncMeta = JSON.parse(localStorage.getItem("helfer_sync_meta"))');
    const lauf = w.ev('syncNow()');
    await w.speichere('lokalneu', 'waehrend der Wartezeit');
    server.modus = 'ok'; server.freigeben(); await lauf;
    out.getVerspaetet = { lokal: sortiert(w.json('helfer_memory')), serverHat: sortiert(JSON.parse(server.items().helfer_memory.v)), lokalGewinnt: w.keys().includes('lokalneu') };
    // (b) POST verspätet (Upload läuft), in der Wartezeit schreibt der Nutzer lokal
    server = serverAttrappe(); server.setzeItems({ helfer_memory: { v: JSON.stringify({ 'alt': 'x' }), ts: 1000 } });
    w = welt(Object.assign({}, opt, { speicher: SPEICHER0(), mitSync: true, server }));
    w.A.store.helfer_sync_meta = JSON.stringify({ helfer_memory: 2000 }); w.ev('syncMeta = JSON.parse(localStorage.getItem("helfer_sync_meta"))');
    server.modus = 'verspaetet'; server.verspaetetPost = true;
    const lauf2 = w.ev('syncNow()');
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));
    server.freigeben();   // GET darf antworten
    for (let i = 0; i < 20 && server.anfragen.length < 2; i++) await new Promise(r => setImmediate(r));
    await w.speichere('waehrendUpload', 'x');   // der Upload (POST) hängt noch
    server.modus = 'ok'; server.verspaetetPost = false; server.freigeben(); await lauf2;
    out.postVerspaetet = { anfragen: server.anfragen.map(a => a.methode), serverNachErstemLauf: Object.keys(JSON.parse(server.items().helfer_memory.v)).sort(), lokal: K(w) };
    await w.A.vorspulen(4000);   // der gemerkte zweite Abgleich läuft
    out.postVerspaetet.serverNachZweitemLauf = Object.keys(JSON.parse(server.items().helfer_memory.v)).sort();
    // (c) Zwei Writes direkt nacheinander und eine Referenz, die ein Modul über eine Ersetzung hinweg hält
    w = welt(Object.assign({}, opt, { speicher: SPEICHER0() }));
    w.ev('window.__alias = memoryItems'); w.ev("applyRemoteValue('helfer_memory', JSON.stringify({ 'fern': 'x' }))");
    w.ev("window.__alias['verloren'] = 'ueber alte Referenz'; setPersistentData('helfer_memory', JSON.stringify(memoryItems))");
    out.aliasUeberErsetzung = { ramHat: K(w), speicherHat: sortiert(w.json('helfer_memory')), aliasWriteVerloren: !w.keys().includes('verloren') };
    return out;
};

/* S14 fehlerhaftes JSON beim Start und falsche Form */
S.S14_kaputt = async function (opt) {
    const out = {};
    let w = welt(Object.assign({}, opt, { speicher: { helfer_memory: '{kaputt', helfer_contacts: JSON.stringify({ 'oma': { originalName: 'Oma' } }) } }));
    out.kaputtesJson = { ladefehler: w.ladefehler.map(x => x.slice(0, 40)), memoryItems: w.ev('typeof memoryItems'), kontakte: w.ev('typeof savedContacts'), speicherUnveraendert: w.A.store.helfer_memory === '{kaputt' };
    const k = await w.A.ki('x', [{ type: 'memory_store', memory_key: 'k', memory_value: 'v' }]);
    out.kaputtesJson.nachSchreibversuch = { speicher: w.A.store.helfer_memory, fehler: (k.fehler || []).map(kurz) };
    // Server hat einen guten Stand: Sync schreibt ihn in den Speicher, RAM bleibt kaputt, bis neu geladen wird
    const server = serverAttrappe(); server.setzeItems({ helfer_memory: { v: JSON.stringify({ 'gut': 'x' }), ts: 9e12 } });
    w = welt(Object.assign({}, opt, { speicher: { helfer_memory: '{kaputt', app_secret: GEHEIM }, server })); await w.ev('syncNow()');
    out.kaputtesJsonMitServer = { speicher: w.A.store.helfer_memory, nachNeustart: w.neustart().keys() };
    // Falsche Form: Array statt Objekt
    w = welt(Object.assign({}, opt, { speicher: { helfer_memory: '[]' } }));
    await w.speichere('k', 'v');
    out.arrayStattObjekt = { istArray: w.ev('Array.isArray(memoryItems)'), speicher: w.A.store.helfer_memory, eintragVerloren: w.A.store.helfer_memory === '[]' };
    return out;
};

/* S15 Proxy-Eigenschaften */
S.S15_proxy = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0() }));
    const out = { proxy: w.proxy(), flagAufzaehlbar: w.ev('Object.keys(memoryItems).includes("__jvZeitProxy")'), flagImJson: w.ev('JSON.stringify(memoryItems).includes("__jvZeitProxy")') };
    w.markiere(); w.ev("memoryItems['x'] = '1'");
    out.setEinKey = w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']);
    w.markiere(); w.ev("delete memoryItems['x']");
    out.deleteEinKey = { schreiben: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']), zeit: ohneZeit(w.json('helfer_memory_zeit')) };
    w.markiere(); w.ev("Object.assign(memoryItems, { a: 1, b: 2 })");
    out.assignZwei = w.schreibzaehler(['helfer_memory_zeit']);
    w.ev("memoryItems.verschachtelt = { ort: 'a' }"); w.markiere(); w.ev("memoryItems.verschachtelt.ort = 'b'");
    out.verschachteltetAenderung = { schreiben: w.schreibzaehler(['helfer_memory_zeit']) };
    out.einTickStabil = (await (async () => { w.merke('p'); await w.A.vorspulen(12000); return w.gleich('p'); })());
    out.nachTicksSchreiben = w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']);
    w.markiere(); w.ev("memoryItems['y'] = '1'");
    out.setNachTicksZeitSchreibungen = w.schreibzaehler(['helfer_memory_zeit']);   // wäre bei verschachtelten Proxys höher
    out.nichtObjekt = [];
    for (const e of ['null', '[]', '5']) { const w2 = welt(Object.assign({}, opt, { speicher: {} })); w2.ev('memoryItems = ' + e); await w2.A.vorspulen(3100); out.nichtObjekt.push({ wert: e, proxyNach3s: w2.proxy() }); }
    return out;
};

/* S16 der 3-Sekunden-Takt */
S.S16_dreiSekunden = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0() }));
    const out = { takte: w.timerNamen(), intervall: w.A.timerListe().filter(t => t.name === 'ensureProxy').map(t => t.iv) };
    w.merke('t0'); w.markiere(); await w.A.vorspulen(12000);
    out.zwoelfSekunden = { referenzGleich: w.gleich('t0'), proxy: w.proxy(), speicherLesen: 'nicht gemessen (nur Schreibzugriffe)', schreibenMemory: w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']) };
    // Referenz wird ersetzt (wie durch den Abgleich): wann ist der Proxy wieder da?
    w.ev('memoryItems = JSON.parse(JSON.stringify({ a: "1" }))'); out.nachErsetzung = { proxy: w.proxy() };
    await w.A.vorspulen(2900); out.nachErsetzung.nach2900ms = w.proxy();
    await w.A.vorspulen(200); out.nachErsetzung.nach3100ms = w.proxy();
    const neuRef = w.ev('window.__r9 = memoryItems; true'); await w.A.vorspulen(9000); out.nachErsetzung.referenzNachWeiterenTicks = w.ev('window.__r9 === memoryItems');
    // versteckt: der Takt hat keinen Sichtbarkeitsschutz
    const v = welt(Object.assign({}, opt, { speicher: SPEICHER0(), versteckt: true }));
    v.ev('memoryItems = { b: "2" }'); await v.A.vorspulen(3100);
    out.versteckt = { hiddenIst: v.ev('document.hidden'), proxyTrotzdem: v.proxy() };
    // die Schreibzugriffe des Takts selbst: keine (nur Proxy-Neuanlage)
    const z = welt(Object.assign({}, opt, { speicher: SPEICHER0() })); z.ev('memoryItems = { c: "3" }'); z.markiere(); await z.A.vorspulen(3100);
    out.taktSchreibt = z.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']);
    return out;
};

/* S17 doppelte Initialisierung (gedaechtnis_zeit.js wird ein zweites Mal geladen) */
S.S17_doppelteInit = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0() }));
    const vorher = { takte: w.timerNamen() };
    w.A.vm.runInContext(lies('js/gedaechtnis_zeit.js'), w.A.sb, { filename: 'gedaechtnis_zeit.js' });
    vorher.nachZweitemLaden = { takte: w.timerNamen(), proxy: w.proxy() };
    w.markiere(); await w.speichere('zweit', '1');
    vorher.einWriteDanach = w.schreibzaehler(['helfer_memory', 'helfer_memory_zeit']);
    return vorher;
};

/* S18 Timer-Landkarte rund ums Gedächtnis: welche Intervalle gibt es nach dem Start (≥ 3 s) */
S.S18_hintergrundTakte = async function (opt) {
    const w = welt(Object.assign({}, opt, { speicher: SPEICHER0() }));
    const l = w.A.timerListe();
    return { ensureProxy: l.filter(t => t.name === 'ensureProxy').length, intervalle3s: l.filter(t => t.iv === 3000).length };
};

async function alle(opt) {
    const out = {};
    for (const k of Object.keys(S)) {
        try { out[k] = await S[k](opt || {}); } catch (e) { out[k] = { ausnahme: String(e && e.message || e).slice(0, 120) }; }
    }
    return out;
}
module.exports = { alle, szenarien: S };
if (require.main === module) { process.on('unhandledRejection', () => { }); alle().then(r => console.log(JSON.stringify(r, null, 1))); }
