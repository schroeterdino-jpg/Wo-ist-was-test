/* ============================================================
   Phase 7A – Prüfung: lokales Gedächtnis (memoryItems) und seine Kopplungen. NUR Messen, kein Produktcode geändert.
   Teile:
     1  Statische Funde (Fundstellen von memoryItems, Schlüssel, jv_/nova_, Abgleichslisten, kein removeItem auf Gedächtnis-Schlüssel)
     2  Szenarien gegen den Golden Master (tests/memory7a_soll.json = Ist-Zustand, nicht Wunsch)
     3  Server-Befunde (api/sync.js, api/memory.js) gegen den Golden Master
     4  Einstufung GRÜN / GELB / ROT, jede an einen messbaren Wert gebunden
     5  Chromium-Messung (tests/memory7a_laufzeit.json, erzeugt mit tests/memory7a_messen.js)
     6  Gegenproben A–O (Quelltext nur im Speicher verändert) samt Kontrollläufen
   Start: node tests/memory7a.js            Soll neu schreiben (nur bewusst!): node tests/memory7a.js --schreiben
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
process.on('unhandledRejection', () => { });
const ROOT = path.join(__dirname, '..');
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SOLL_PFAD = path.join(__dirname, 'memory7a_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(n, c, extra) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + n + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); } }
const J = x => JSON.stringify(x);
const gleich = (a, b) => J(a) === J(b);

/* ---------------- 1  Statische Funde ---------------- */
const jsDateien = fs.readdirSync(path.join(ROOT, 'js')).filter(f => /\.js$/.test(f)).sort();
const leseJs = d => lies('js/' + d);

/* Jede Zeile, die das Wort memoryItems enthält, je Datei. Zuweisungen an die Variable selbst (Referenzersetzung) getrennt gezählt. */
function fundstellen(lese) {
    const je = {}, ersetzt = [], definiert = [];
    let gesamt = 0;
    for (const d of jsDateien) {
        const zeilen = lese(d).split('\n');
        zeilen.forEach((z, i) => {
            if (!/\bmemoryItems\b/.test(z)) return;
            je[d] = (je[d] || 0) + 1; gesamt++;
            if (/\blet\s+memoryItems\b/.test(z)) definiert.push(d);
            else if (/(^|[^.\w$])memoryItems\s*=(?![=>])/.test(z.replace(/\/\/.*$/, ''))) ersetzt.push(d + ':' + (i + 1));
        });
    }
    return { gesamt, je, definiert, ersetzt: ersetzt.map(s => s.split(':')[0]) };
}
const memKeyLiterale = lese => {
    const out = {};
    for (const d of jsDateien) { const t = lese(d); (t.match(/['"`](?:helfer_|jv_|nova_)[A-Za-z0-9_]*['"`]/g) || []).forEach(s => { const k = s.slice(1, -1); (out[k] = out[k] || {})[d] = ((out[k] || {})[d] || 0) + 1; }); }
    return out;
};
const listeAus = (text, name) => { const m = text.match(new RegExp('(?:const|let|var)\\s+' + name + '\\s*=\\s*\\[([\\s\\S]*?)\\]')); return m ? (m[1].match(/'[^']+'/g) || []).map(s => s.slice(1, -1)) : null; };

const F = fundstellen(leseJs);
const schluessel = memKeyLiterale(leseJs);
const jvNova = Object.keys(schluessel).filter(k => /^(jv_|nova_)/.test(k)).sort();
const syncJs = listeAus(lies('js/sync.js'), 'SYNC_KEYS'), syncApi = listeAus(lies('api/sync.js'), 'ALLOWED_KEYS');
const nativ = {};
for (const f of fs.readdirSync(path.join(ROOT, 'weckruf-src'))) { if (!/\.(java|xml)$/.test(f)) continue; const t = lies('weckruf-src/' + f); const g = (t.match(/helfer_memory|nova_[a-z_]+|jv_[a-z_]+/g) || []); if (g.length) nativ[f] = Array.from(new Set(g)).sort(); }
const statisch = {
    fundstellen: F.gesamt, fundstellenJeDatei: F.je, definiert: F.definiert, ersetztIn: F.ersetzt,
    schluesselAnzahl: Object.keys(schluessel).length, jvNova,
    gedaechtnisSchluesselSchreiber: Object.keys(schluessel['helfer_memory'] || {}).sort(),
    zeitSchluesselDateien: Object.keys(schluessel['helfer_memory_zeit'] || {}).sort(),
    syncJs, syncApi, nurImClient: (syncJs || []).filter(k => !(syncApi || []).includes(k)), nurAmServer: (syncApi || []).filter(k => !(syncJs || []).includes(k)),
    nativ
};
check('Statisch: memoryItems wird genau einmal definiert (storage.js)', gleich(F.definiert, ['storage.js']), F.definiert);
check('Statisch: kein removeItem/clear auf helfer_memory in js/', !jsDateien.some(d => leseJs(d).split('\n').some(z => /removeItem\([^)]*helfer_memory/.test(z))));
check('Statisch: Abgleichsliste im Client enthält helfer_memory', (syncJs || []).includes('helfer_memory'));
check('Statisch: Abgleichsliste am Server enthält helfer_memory', (syncApi || []).includes('helfer_memory'));
check('Statisch: helfer_memory_zeit ist NICHT in den Abgleichslisten (nur lokal)', !(syncJs || []).includes('helfer_memory_zeit') && !(syncApi || []).includes('helfer_memory_zeit'));
check('Statisch: Sicherung erfasst helfer_-Schlüssel per Vorbereich', /BACKUP_PREFIX_RX\s*=\s*\/\^\(helfer_\|jv_/.test(lies('js/storage.js')));
check('Statisch: jv_/nova_-Schlüssel gefunden', jvNova.length > 5, jvNova.length);

/* ---------------- 2/3  Szenarien und Server ---------------- */
const sz = require('./memory7a_szenarien.js'), srv = require('./memory7a_server.js');

/* ---------------- 4  Einstufung ---------------- */
function einstufung(R, S) {
    const s = R.szenarien, v = R.server;
    const T = [];
    const t = (name, farbe, grund, bedingung) => T.push({ name, farbe, grund, bedingung: !!bedingung });
    /* ROT: nachweisbar falsche Daten / Verlust */
    t('Zeitfrage trifft bei Teilwort-Treffer den falschen Eintrag', 'ROT', 'Zweitschlüssel wird nach dem Zeitpunkt von "schlüssel" beantwortet bzw. gar nicht (searchMemory()[0])', s.S03_merkDir && s.S03_merkDir.lesen && /Dazu habe ich kein Datum gespeichert\. Schlüssel steht/.test(String((s.S03_merkDir.lesen.zeitantwort.gesagt || [])[0] || '')));
    /* GELB: Risiken ohne heutigen Verlust im Normalbetrieb */
    t('Proxy wird bei jedem Schreiben dreifach gestempelt', 'GELB', 'drei Zeitstempel-Schreibzugriffe je Eintrag', s.S03_merkDir && s.S03_merkDir.sofort.schreiben.helfer_memory_zeit.L === 3);
    t('3-Sekunden-Takt läuft ohne Sichtbarkeitsprüfung und ohne Ende', 'GELB', 'setInterval(ensureProxy,3000)', s.S16_dreiSekunden && gleich(s.S16_dreiSekunden.intervall, [3000]));
    t('Datenabgleich ersetzt die Referenz von memoryItems', 'GELB', 'Proxy fehlt bis zum nächsten Takt', s.S12_syncNormal && s.S12_syncNormal.serverNeuer.refGleich === false);
    t('Datenabgleich ersetzt das ganze Gedächtnis (zuletzt geschrieben gewinnt)', 'GELB', 'zwei Geräte offline: ein Eintrag geht verloren', s.S12_syncNormal && s.S12_syncNormal.parallel && s.S12_syncNormal.parallel.extraVerloren === true);
    t('Eintrag, der von außen im Speicher ergänzt wird, geht beim nächsten Schreiben verloren', 'GELB', 'zweiter Tab', s.S10_fremderZugriff && s.S10_fremderZugriff.externerEintragVerloren === true);
    t('Kaputtes JSON in helfer_memory stoppt storage.js (Folgeschaden)', 'GELB', 'memoryItems, Kontakte, Tageslog nicht definiert bis zur Reparatur', s.S14_kaputt && s.S14_kaputt.kaputtesJson.memoryItems.fehler === 'memoryItems is not defined');
    t('Server: gleichzeitige Schreibzugriffe verlieren einen Schlüssel', 'GELB', 'api/sync.js liest-ändert-schreibt ohne Sperre', v.sync && v.sync.gleichzeitigeBereiche && gleich(v.sync.gleichzeitigeBereiche.gespeichert, ['helfer_contacts']));
    t('Server: beschädigter Gesamtwert wird still ersetzt', 'GELB', 'api/sync.js stored-Reset', v.sync && v.sync.beschaedigterGesamtwert && v.sync.beschaedigterGesamtwert.status === 200);
    t('Server: mark-Rennen im Langzeitgedächtnis verliert eine Markierung', 'GELB', 'api/memory.js', v.memory && v.memory.gleichzeitigeMarkierungen && v.memory.gleichzeitigeMarkierungen.anstoss_tag === false);
    /* GRÜN: bewusst stabile Muster */
    t('Normales Schreiben: Referenz bleibt gleich', 'GRÜN', 'kein Austausch beim Speichern', s.S09_schnell && s.S09_schnell.refGleich === true);
    t('Neustart: Gedächtnis und Zeiten bleiben erhalten', 'GRÜN', 'gleicher Speicher, gleiche Daten', s.S08_neustart && s.S08_neustart.speicherGleich === true);
    t('Löschen entfernt Zeitstempel mit', 'GRÜN', 'deleteProperty-Falle', s.S07_loeschen && gleich(s.S07_loeschen.a.zeit, ['schlüssel']));
    t('Sync-Fehler (500, offline, leer) verändern das lokale Gedächtnis nicht', 'GRÜN', 'Fehler überschreiben nichts', s.S11_syncFehler && ['fehler500', 'offline', 'leer'].every(m => s.S11_syncFehler[m] && s.S11_syncFehler[m].ramGleich === true));
    t('Späte Server-Antwort überschreibt neueren lokalen Stand nicht', 'GRÜN', 'lokal gewinnt', s.S13_rennen && s.S13_rennen.getVerspaetet.lokalGewinnt === true);
    t('Langzeit-Lesen schreibt nichts ins lokale Gedächtnis', 'GRÜN', 'Datenfluss C/D getrennt', s.S05_langzeitLesen && s.S05_langzeitLesen.lokalesGedaechtnisUnberuehrt === true);
    t('Erinnerungen berühren das Gedächtnis nicht', 'GRÜN', 'Datenfluss B getrennt', s.S04_erinnerung && s.S04_erinnerung.gedaechtnisUnberuehrt === true);
    t('Doppelte Initialisierung wird erkannt (ein Proxy)', 'GRÜN', 'FLAG verhindert Proxy im Proxy', s.S17_doppelteInit && s.S17_doppelteInit.nachZweitemLaden.proxy === true);
    return T;
}

/* ---------------- 5  Chromium ---------------- */
function chromiumPruefen() {
    const p = path.join(__dirname, 'memory7a_laufzeit.json');
    if (!fs.existsSync(p)) { check('Chromium-Messstand vorhanden (tests/memory7a_laufzeit.json)', false); return null; }
    const j = JSON.parse(fs.readFileSync(p, 'utf8')).ergebnis, sn = j.schnappschuss || {}, ph = j.phasen || {};
    check('Chromium: Eintrag hinzufügen ok', j.hinzufuegen === 'ok');
    for (const n of ['hinzufuegen', 'aendern']) check('Chromium: ' + n + ' – Referenz gleich, Proxy aktiv, Zeit gestempelt', sn[n] && sn[n].referenzGleich === true && sn[n].proxy === true && (sn[n].zeit || []).includes('testneu'), sn[n]);
    check('Chromium: ändern schreibt den Wert', sn.aendern && sn.aendern.wert === 'testwert zwei');
    check('Chromium: genau ein ensureProxy-Takt (3000 ms) pro Seite', ph.ep && ph.ep.angelegtProSeite === 1 && ph.ep.ms === 3000, ph.ep);
    check('Chromium: kein removeItem auf Gedächtnis-Schlüssel in allen Phasen', Object.values(ph.st || {}).every(p => Object.values(p).every(k => k.remove === 0)));
    check('Chromium: kaputtes JSON → memoryItems nicht definiert (Ist)', sn.kaputtes_json && sn.kaputtes_json.memoryItems === 'FEHLER ReferenceError', sn.kaputtes_json);
    check('Chromium: kaputtes JSON → auch Kontakte und Tageslog betroffen (Ist)', sn.kaputtes_json && sn.kaputtes_json.kontakte === 'FEHLER ReferenceError' && sn.kaputtes_json.chatHistory === 'FEHLER ReferenceError');
    check('Chromium: Server hat nach Abgleich die Testeinträge', Array.isArray(j.serverNachAbgleich) && j.serverNachAbgleich.includes('testschluessel'));
    return { phasen: Object.keys(ph.st || {}), referenzStabil: ['hinzufuegen', 'aendern'].every(n => sn[n] && sn[n].referenzGleich) };
}

/* ---------------- 6  Gegenproben ---------------- */
const ersetze = (text, von, nach, alle) => { if (!text.includes(von)) throw new Error('Gegenprobe: Muster nicht gefunden: ' + von.slice(0, 60)); return alle ? text.split(von).join(nach) : text.replace(von, () => nach); };
const mut = (datei, fn) => (d, t) => d === datei ? fn(t) : t;
const GEGENPROBEN = {
    A: { text: 'Besitzer geändert (travel.js ersetzt memoryItems)', statisch: true, quelle: mut('travel.js', t => t + '\nmemoryItems = {};\n') },
    B: { text: 'Proxy entfernt (ensureProxy tut nichts)', szen: ['S01_startLeer', 'S15_proxy'], quelle: mut('gedaechtnis_zeit.js', t => ersetze(t, 'function ensureProxy() {\n        try {', 'function ensureProxy() {\n        return; try {')) },
    C: { text: 'Zusätzlicher Proxy (FLAG-Prüfung entfernt)', szen: ['S17_doppelteInit', 'S16_dreiSekunden'], quelle: mut('gedaechtnis_zeit.js', t => ersetze(t, '|| memoryItems[FLAG]) return;', ') return;')) },
    D: { text: '3-Sekunden-Takt entfernt', szen: ['S16_dreiSekunden', 'S01_startLeer', 'S18_hintergrundTakte'], quelle: mut('gedaechtnis_zeit.js', t => ersetze(t, 'try { setInterval(ensureProxy, 3000); } catch (e) {}', '')) },
    E: { text: '3-Sekunden-Takt doppelt gestartet', szen: ['S18_hintergrundTakte', 'S01_startLeer'], quelle: mut('gedaechtnis_zeit.js', t => ersetze(t, 'try { setInterval(ensureProxy, 3000); } catch (e) {}', 'try { setInterval(ensureProxy, 3000); } catch (e) {} try { setInterval(ensureProxy, 3000); } catch (e) {}')) },
    F: { text: 'Referenz beim Speichern ersetzt (memory_store)', szen: ['S09_schnell', 'S03_merkDir'], quelle: mut('actions.js', t => ersetze(t, "setPersistentData('helfer_memory', JSON.stringify(memoryItems))", "memoryItems = Object.assign({}, memoryItems); setPersistentData('helfer_memory', JSON.stringify(memoryItems))")) },
    G: { text: 'Schlüsselname geändert (helfer_memory → helfer_memory2 in actions.js)', szen: ['S03_merkDir', 'S08_neustart'], quelle: mut('actions.js', t => ersetze(t, "setPersistentData('helfer_memory',", "setPersistentData('helfer_memory2',", true)) },
    H: { text: 'jv_/nova_-Schlüssel umbenannt (nova_kopf)', statisch: true, quelle: mut('storage.js', t => t + "\n/* nova_kopf */ localStorage.getItem('nova_kopf_neu');\n") },
    I: { text: 'Lesefehler löscht Daten (kaputtes JSON wird zu {} geschrieben)', szen: ['S14_kaputt'], quelle: mut('storage.js', t => ersetze(t, "let memoryItems = JSON.parse(getPersistentData('helfer_memory', '{}')) || {};", "let memoryItems; try { memoryItems = JSON.parse(getPersistentData('helfer_memory', '{}')) || {}; } catch (e) { memoryItems = {}; setPersistentData('helfer_memory', '{}'); }")) },
    J: { text: 'Abgleich überschreibt immer (Server gewinnt auch wenn älter)', szen: ['S13_rennen'], quelle: mut('sync.js', t => ersetze(t, "case 'helfer_memory': memoryItems = JSON.parse(valueString) || {}; break;", "case 'helfer_memory': memoryItems = {}; break;")) },
    K: { text: 'Doppeltes Schreiben (setPersistentData zweimal in memory_store)', szen: ['S03_merkDir', 'S09_schnell'], quelle: mut('actions.js', t => ersetze(t, "setPersistentData('helfer_memory', JSON.stringify(memoryItems))", "setPersistentData('helfer_memory', JSON.stringify(memoryItems)); setPersistentData('helfer_memory', JSON.stringify(memoryItems))")) },
    L: { text: 'Neustart verliert Daten (Start ignoriert Speicher)', szen: ['S02_startMitEintraegen', 'S08_neustart'], quelle: mut('storage.js', t => ersetze(t, "let memoryItems = JSON.parse(getPersistentData('helfer_memory', '{}')) || {};", "let memoryItems = {};")) },
    M: { text: 'Löschen entfernt den falschen Eintrag (immer den ersten)', szen: ['S07_loeschen'], quelle: mut('lists.js', t => ersetze(t, 'function deleteMemoryItem(key) {\n    delete memoryItems[key];', 'function deleteMemoryItem(key) {\n    delete memoryItems[Object.keys(memoryItems)[0]];')) },
    N: { text: 'Server-Fehler leert das lokale Gedächtnis', szen: ['S11_syncFehler'], quelle: null /* wird unten aus sync.js-Fehlerzweig gebaut */ },
    O: { text: 'Initialisierung läuft zweimal (gedaechtnis_zeit.js doppelt geladen)', szen: ['S17_doppelteInit'], quelle: null /* S17 lädt selbst doppelt: Messwert wird mit Kontrolle verglichen */ }
};

async function main() {
    const R = { statisch, szenarien: await sz.alle(), server: await srv.alle() };
    /* Serverwerte auf die Bausteine der Einstufung abbilden (aus den echten Messwerten) */
    const sv = R.server;
    R.einstufung = einstufung({ szenarien: R.szenarien, server: sv }, statisch).map(e => ({ name: e.name, farbe: e.farbe, ok: e.bedingung }));
    R.chromium = chromiumPruefen();

    /* Golden Master */
    const ist = { statisch, szenarien: R.szenarien, server: sv };
    if (SCHREIBEN) { fs.writeFileSync(SOLL_PFAD, JSON.stringify(ist, null, 1) + '\n'); console.log('Soll geschrieben: ' + SOLL_PFAD); }
    else if (!fs.existsSync(SOLL_PFAD)) check('Golden Master vorhanden (tests/memory7a_soll.json)', false);
    else {
        const soll = JSON.parse(fs.readFileSync(SOLL_PFAD, 'utf8')), istJ = JSON.parse(J(ist));
        check('Golden Master: statische Funde unverändert', gleich(soll.statisch, istJ.statisch), { soll: soll.statisch && soll.statisch.fundstellen, ist: istJ.statisch.fundstellen });
        for (const k of Object.keys(soll.szenarien)) check('Golden Master: Szenario ' + k, gleich(soll.szenarien[k], istJ.szenarien[k]), { soll: soll.szenarien[k], ist: istJ.szenarien[k] });
        check('Golden Master: keine zusätzlichen Szenarien', gleich(Object.keys(soll.szenarien), Object.keys(istJ.szenarien)));
        check('Golden Master: Server-Befunde unverändert', gleich(soll.server, istJ.server));
    }
    for (const e of R.einstufung) check('Einstufung ' + e.farbe + ': ' + e.name, e.ok);
    check('Einstufung: genau ein ROT-Befund (Zeitfrage/Teilwort), kein weiterer', R.einstufung.filter(e => e.farbe === 'ROT').length === 1);

    /* Gegenproben */
    const basis = R.szenarien;
    const kontrollen = {
        unveraendert: await sz.alle({ quelleAendern: (d, t) => t }),
        nurKommentar: await sz.alle({ quelleAendern: (d, t) => d === 'gedaechtnis_zeit.js' ? '/* nur ein Kommentar */\n' + t : t })
    };
    for (const [n, k] of Object.entries(kontrollen)) check('Kontrolle "' + n + '": alle Szenarien gleich wie Ist', gleich(basis, JSON.parse(J(k))));
    const stat0 = fundstellen(leseJs);
    const ergebnisse = {};
    for (const [id, g] of Object.entries(GEGENPROBEN)) {
        let erkannt = false, hinweis = '';
        try {
            if (g.statisch) {
                const lese = d => g.quelle(d, leseJs(d));
                const f = fundstellen(lese), sk = memKeyLiterale(lese);
                erkannt = id === 'A' ? !gleich(f.ersetztIn, stat0.ersetzt) : !gleich(Object.keys(sk).filter(k => /^(jv_|nova_)/.test(k)).sort(), jvNova);
                hinweis = id === 'A' ? 'Ersetzer: ' + J(f.ersetztIn) : 'neue jv_/nova_-Schlüssel';
            } else if (id === 'N') {
                const aend = (d, t) => d === 'sync.js' ? t.replace(/(console\.(?:warn|error)\([^;]*\);)?\s*\}\s*finally/, m => m) : t;
                const ls = leseJs('sync.js');
                if (!/applyingRemote\s*=\s*false/.test(ls)) throw new Error('sync.js: Muster fehlt');
                const q = (d, t) => d === 'sync.js' ? ersetze(t, 'async function pullFromServer', "async function pullFromServer_alt") + '\nasync function pullFromServer() { try { return await pullFromServer_alt.apply(this, arguments); } catch (e) { memoryItems = {}; setPersistentData("helfer_memory", "{}"); } }\n' : t;
                const m = await sz.szenarien.S11_syncFehler({ quelleAendern: q });
                erkannt = !gleich(JSON.parse(J(m)), basis.S11_syncFehler); hinweis = 'S11';
            } else if (id === 'O') {
                const m = await sz.szenarien.S01_startLeer({ quelleAendern: mut('gedaechtnis_zeit.js', t => t + '\n' + t) });
                erkannt = m.takte === 2 && basis.S01_startLeer.takte === 1; hinweis = 'Takte beim Start: ' + basis.S01_startLeer.takte + ' -> ' + m.takte;
            } else {
                for (const s of g.szen) {
                    const m = await sz.szenarien[s]({ quelleAendern: g.quelle });
                    if (!gleich(JSON.parse(J(m)), basis[s])) { erkannt = true; hinweis += s + ' '; }
                }
            }
        } catch (e) { hinweis = 'FEHLER ' + e.message; }
        ergebnisse[id] = { text: g.text, erkannt, hinweis: hinweis.trim() };
        check('Gegenprobe ' + id + ' (' + g.text + ') wird erkannt', erkannt, hinweis);
    }
    R.gegenproben = ergebnisse;
    if (process.argv.includes('--zeige')) console.log(JSON.stringify({ statisch: R.statisch, einstufung: R.einstufung, gegenproben: ergebnisse, chromium: R.chromium }, null, 1));
    console.log('PHASE 7A: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
}
main().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
