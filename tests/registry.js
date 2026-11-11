/* ============================================================
   TESTS Phase 2 "Capability Registry": Start: node tests/registry.js
   Teil 1: der Kern (js/registry.js) für sich: Anmeldung, Parameter, alle sechs Ergebnisse, Bestätigung, Trockenlauf, Erfolgsprüfung, Erweiterbarkeit
   Teil 2: die fünf angebundenen Fähigkeiten (js/registry_faehigkeiten.js) in der ganzen App-Attrappe (tests/umgebung.js):
           nichts Echtes wird angelegt (Attrappe für Netz, Speicher, Kalender), die Phase-1-Sicherheit wird nicht umgangen,
           die Registry ist NICHT produktiv angeschlossen
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const JETZT = '2026-11-05T10:00:00+01:00';
const SECHS = ['SUCCESS', 'NO_RESULTS', 'TOOL_FAILED', 'CAPABILITY_MISSING', 'NEEDS_INFORMATION', 'NEEDS_CONFIRMATION'];
const FELDER = 'alternativen,ausgefuehrt,daten,faehigkeit,fehlend,grund,nachricht,status,trocken';

(async () => {
    /* ================= Teil 1: Kern ================= */
    const quelle = lies('js/registry.js');
    function neuerKern(mitSicher) {
        const sb = { window: {}, console: { warn() { }, error() { } } }; vm.createContext(sb);
        if (mitSicher) vm.runInContext(lies('js/sicherheit.js'), sb);
        vm.runInContext(quelle, sb);
        return sb.window;
    }
    const W = neuerKern(true), R = W.jvRegistry;
    check('1a Kern legt nur window.jvRegistry (und die Sicherheit) an', Object.keys(neuerKern(false)).join() === 'jvRegistry', Object.keys(neuerKern(false)).join());
    check('1b Kern: kein Speicher, kein Netz, keine Sprachausgabe, kein Zeitgeber, kein Seitenzugriff (außerhalb der Kommentare)',
        !/localStorage|sessionStorage|fetch\(|speak\(|executeAction|document\.|setTimeout|setInterval/.test(quelle.replace(/\/\*[\s\S]*?\*\//g, '')));
    check('1c Statuswerte: genau die sechs', JSON.stringify(Object.keys(R.STATUS)) === JSON.stringify(SECHS) && SECHS.every(s => R.STATUS[s] === s));

    let aufrufe, def;
    const frisch = (over) => {
        const d = {
            name: 'test_faehigkeit', beschreibung: 'Eine Testfähigkeit.',
            pflicht: [{ name: 'text', typ: 'text', beschreibung: 'Text' }],
            optional: [{ name: 'anzahl', typ: 'zahl', beschreibung: 'Anzahl' }],
            rueckgabe: { beschreibung: 'Ein Wert', felder: ['wert'] },
            fehler: [{ status: 'TOOL_FAILED', wann: 'wenn es kaputt ist' }],
            fallbacks: [], bestaetigung: { noetig: false, grund: 'Harmlos.' },
            pruefeErfolg: d2 => !!d2 && d2.wert === 1,
            verbindung: { datei: 'js/x.js', funktion: 'x' },
            ausfuehren: async () => { aufrufe++; return { wert: 1 }; }
        };
        return Object.assign(d, over || {});
    };
    const einE = () => R.erzeuge();

    /* --- Anmeldung --- */
    let E = einE(); aufrufe = 0;
    check('2a gültige Fähigkeit wird angemeldet', E.registriere(frisch()).ok === true && E.namen().join() === 'test_faehigkeit');
    check('2b doppelter Name wird abgelehnt, die erste bleibt', E.registriere(frisch({ beschreibung: 'Zweite' })).ok === false && E.hole('test_faehigkeit').beschreibung === 'Eine Testfähigkeit.');
    const ungueltig = {
        'ohne Namen': { name: '' }, 'Name mit Großbuchstaben': { name: 'Test' }, 'Name mit Leerzeichen': { name: 'a b' }, 'ohne Beschreibung': { beschreibung: ' ' },
        'pflicht keine Liste': { pflicht: 'text' }, 'pflicht ohne Typ': { pflicht: [{ name: 'a', beschreibung: 'x' }] }, 'pflicht mit falschem Typ': { pflicht: [{ name: 'a', typ: 'objekt', beschreibung: 'x' }] },
        'pflicht ohne Beschreibung': { pflicht: [{ name: 'a', typ: 'text' }] }, 'Parameter doppelt': { pflicht: [{ name: 'a', typ: 'text', beschreibung: 'x' }, { name: 'a', typ: 'text', beschreibung: 'y' }] },
        'Parameter in pflicht und optional': { optional: [{ name: 'text', typ: 'text', beschreibung: 'x' }] }, 'optional fehlt': { optional: undefined },
        'ohne Rückgabeformat': { rueckgabe: undefined }, 'Rückgabe ohne felder': { rueckgabe: { beschreibung: 'x' } },
        'ohne Fehlerzustände': { fehler: [] }, 'Fehlerzustand SUCCESS': { fehler: [{ status: 'SUCCESS', wann: 'x' }] }, 'Fehlerzustand erfunden': { fehler: [{ status: 'KAPUTT', wann: 'x' }] },
        'Fehlerzustand ohne Beschreibung': { fehler: [{ status: 'TOOL_FAILED' }] }, 'fallbacks keine Liste': { fallbacks: undefined }, 'eigener Fallback': { fallbacks: ['test_faehigkeit'] },
        'ohne Bestätigungsangabe': { bestaetigung: undefined }, 'Bestätigung ohne Grund': { bestaetigung: { noetig: true } }, 'Bestätigung nicht boolesch': { bestaetigung: { noetig: 'ja', grund: 'x' } },
        'ohne Erfolgsprüfung': { pruefeErfolg: undefined }, 'ohne Verbindung': { verbindung: undefined }, 'Verbindung ohne Funktion': { verbindung: { datei: 'js/x.js' } },
        'ohne ausfuehren': { ausfuehren: undefined }, 'leer keine Funktion': { leer: 'ja' }, 'vorpruefung keine Funktion': { vorpruefung: 1 }, 'verfuegbar keine Funktion': { verfuegbar: true }
    };
    for (const k of Object.keys(ungueltig)) {
        const e = einE(); let r;
        try { r = e.registriere(frisch(ungueltig[k])); } catch (x) { r = 'WIRFT ' + x.message; }
        check('2c ungültig wird abgelehnt (' + k + ')', r && r.ok === false && Array.isArray(r.fehler) && r.fehler.length > 0 && e.namen().length === 0, JSON.stringify(r));
    }
    for (const bad of [null, undefined, 5, 'x', []]) { let r; try { r = einE().registriere(bad); } catch (x) { r = 'WIRFT'; } check('2d registriere(' + JSON.stringify(bad) + ') wirft nicht', r && r.ok === false); }
    check('2e globale und neue Registry sind getrennt', einE().namen().length === 0 && R.namen().length === 0);
    const gespeichert = E.hole('test_faehigkeit');
    check('2f angemeldete Fähigkeit ist eingefroren', Object.isFrozen(gespeichert) && Object.isFrozen(gespeichert.pflicht[0]));
    let quellDef = frisch(); const E2 = einE(); E2.registriere(quellDef); quellDef.pflicht[0].name = 'verändert'; quellDef.beschreibung = 'verändert';
    check('2g nachträgliche Änderung am Original ändert die Registry nicht', E2.hole('test_faehigkeit').pflicht[0].name === 'text' && E2.hole('test_faehigkeit').beschreibung === 'Eine Testfähigkeit.');
    check('2h hole() kennt keine Fremdnamen (auch nicht "constructor")', E.hole('gibt_es_nicht') === null && E.hole('constructor') === null && E.hole('__proto__') === null);

    /* --- Beschreibung für die spätere Chef-KI --- */
    const bs = E.beschreibe('test_faehigkeit');
    check('3a beschreibe: alle Angaben, nur Daten (JSON, keine Funktionen)', JSON.stringify(Object.keys(bs).sort()) === JSON.stringify(['beschreibung', 'bestaetigung', 'fallbacks', 'fehler', 'name', 'optional', 'pflicht', 'rueckgabe', 'verbindung'])
        && JSON.parse(JSON.stringify(bs)).name === 'test_faehigkeit' && !/function/.test(JSON.stringify(bs)));
    check('3b beschreibe() ohne Namen: Liste; unbekannt: null', Array.isArray(E.beschreibe()) && E.beschreibe().length === 1 && E.beschreibe('nein') === null);
    check('3c beschreibe liefert Kopien (Änderung wirkt nicht zurück)', (() => { const b = E.beschreibe('test_faehigkeit'); b.pflicht.push({ name: 'x' }); b.beschreibung = 'x'; return E.beschreibe('test_faehigkeit').pflicht.length === 1 && E.hole('test_faehigkeit').beschreibung === 'Eine Testfähigkeit.'; })());

    /* --- Ausführen: alle sechs Ergebnisse --- */
    async function lauf(e, name, p, o) { const r = await e.fuehreAus(name, p, o); check('4x Ergebnis hat immer genau die vereinbarten Felder (' + name + ')', Object.keys(r).sort().join() === FELDER, Object.keys(r).join()); check('4y Status ist einer der sechs (' + name + ')', SECHS.includes(r.status), r.status); return r; }
    E = einE(); E.registriere(frisch()); aufrufe = 0;
    let r = await lauf(E, 'test_faehigkeit', { text: 'a' });
    check('4a SUCCESS: ausgeführt, Daten da, genau ein Aufruf', r.status === 'SUCCESS' && r.ausgefuehrt === true && r.trocken === false && r.daten.wert === 1 && aufrufe === 1 && r.fehlend.length === 0, JSON.stringify(r));

    r = await lauf(E, 'gibt_es_nicht', {});
    check('4b CAPABILITY_MISSING: unbekannte Fähigkeit, verständlicher Satz, nichts ausgeführt', r.status === 'CAPABILITY_MISSING' && r.ausgefuehrt === false && /Fähigkeit/.test(r.nachricht) && r.faehigkeit === 'gibt_es_nicht', JSON.stringify(r));
    for (const nm of [undefined, null, 5, {}, '']) { r = await lauf(E, nm, {}); check('4c Name ' + JSON.stringify(nm) + ': CAPABILITY_MISSING, kein Absturz', r.status === 'CAPABILITY_MISSING'); }

    aufrufe = 0;
    for (const [titel, p] of [['fehlt ganz', {}], ['null', null], ['kein Objekt', 'text'], ['Liste', ['a']], ['leerer Text', { text: '' }], ['nur Leerzeichen', { text: '   ' }], ['null-Wert', { text: null }], ['leere Liste', { text: [] }]]) {
        r = await lauf(E, 'test_faehigkeit', p);
        check('4d NEEDS_INFORMATION bei Pflichtangabe: ' + titel, r.status === 'NEEDS_INFORMATION' && r.fehlend.join() === 'text' && r.ausgefuehrt === false && !!r.nachricht, JSON.stringify(r));
    }
    r = await lauf(E, 'test_faehigkeit', { text: 'a', anzahl: 'viele' });
    check('4e NEEDS_INFORMATION bei ungültigem optionalem Parameter', r.status === 'NEEDS_INFORMATION' && r.fehlend.join() === 'anzahl', JSON.stringify(r));
    r = await lauf(E, 'test_faehigkeit', { text: 'a', anzahl: '3' });
    check('4f Zahl als Text ist gültig', r.status === 'SUCCESS');
    check('4g bei NEEDS_INFORMATION wurde nichts ausgeführt (nur der eine gültige Lauf zählt)', aufrufe === 1, String(aufrufe));
    const pz = E.pruefeParameter('test_faehigkeit', { text: 'a' });
    check('4h pruefeParameter allein: führt nichts aus', pz.status === 'SUCCESS' && aufrufe === 1 && E.pruefeParameter('nein', {}).status === 'CAPABILITY_MISSING');

    /* Typen */
    const tE = einE();
    tE.registriere(frisch({ name: 'typen', pflicht: [{ name: 'z', typ: 'zeit', beschreibung: 'z' }, { name: 'j', typ: 'ja_nein', beschreibung: 'j' }, { name: 'l', typ: 'liste', beschreibung: 'l' }, { name: 'n', typ: 'zahl', beschreibung: 'n' }], optional: [] }));
    const gut = { z: '2026-11-05T10:00:00', j: true, l: ['a'], n: 3 };
    check('5a Typen: gültige Werte', (await lauf(tE, 'typen', gut)).status === 'SUCCESS');
    for (const [k, v] of [['z', 'morgen früh'], ['z', 'nein'], ['j', 'vielleicht'], ['j', 1], ['l', 'a'], ['n', 'abc'], ['n', NaN], ['n', Infinity]]) {
        r = await lauf(tE, 'typen', Object.assign({}, gut, { [k]: v }));
        check('5b Typ ungültig: ' + k + '=' + String(v), r.status === 'NEEDS_INFORMATION' && r.fehlend.join() === k, JSON.stringify(r));
    }

    /* Fehler in der Implementierung */
    E = einE();
    E.registriere(frisch({ name: 'wirft', ausfuehren: async () => { aufrufe++; throw new Error('geheimer Technikfehler'); } }));
    E.registriere(frisch({ name: 'wirft_nutzer', ausfuehren: async () => { const e = new Error('x'); e.userMessage = 'Deinen Standort konnte ich nicht ermitteln.'; throw e; } }));
    E.registriere(frisch({ name: 'wirft_sync', ausfuehren: () => { throw new Error('sync'); } }));
    E.registriere(frisch({ name: 'wirft_rejected', ausfuehren: () => Promise.reject('nur ein Text') }));
    aufrufe = 0;
    r = await lauf(E, 'wirft', { text: 'a' });
    check('6a TOOL_FAILED: Ausnahme wird gefangen, Technikfehler wird nicht vorgelesen', r.status === 'TOOL_FAILED' && r.ausgefuehrt === true && !/geheimer/.test(r.nachricht) && /technisch/.test(r.nachricht), JSON.stringify(r));
    r = await lauf(E, 'wirft_nutzer', { text: 'a' });
    check('6b TOOL_FAILED: verständliche Meldung der Implementierung (userMessage) bleibt', r.status === 'TOOL_FAILED' && r.nachricht === 'Deinen Standort konnte ich nicht ermitteln.');
    r = await lauf(E, 'wirft_sync', { text: 'a' });
    check('6c TOOL_FAILED: auch bei synchronem Fehler', r.status === 'TOOL_FAILED');
    r = await lauf(E, 'wirft_rejected', { text: 'a' });
    check('6d TOOL_FAILED: auch bei abgelehntem Versprechen ohne Error', r.status === 'TOOL_FAILED');

    /* Erfolgsprüfung */
    E = einE();
    E.registriere(frisch({ name: 'ohne_wirkung', ausfuehren: async () => ({ wert: 0 }) }));
    E.registriere(frisch({ name: 'pruefung_wirft', pruefeErfolg: () => { throw new Error('x'); } }));
    E.registriere(frisch({ name: 'pruefung_truthy', pruefeErfolg: () => 'ja' }));
    E.registriere(frisch({ name: 'daten_undefined', ausfuehren: async () => undefined }));
    E.registriere(frisch({ name: 'mit_nachricht', ausfuehren: async () => ({ wert: 0, nachricht: 'Bereits vorhanden.' }) }));
    r = await lauf(E, 'ohne_wirkung', { text: 'a' });
    check('7a Erfolg nicht nachgewiesen: TOOL_FAILED, nicht SUCCESS', r.status === 'TOOL_FAILED' && r.ausgefuehrt === true && r.grund === 'Erfolg nicht nachgewiesen' && r.daten.wert === 0, JSON.stringify(r));
    r = await lauf(E, 'pruefung_wirft', { text: 'a' });
    check('7b Fehler in der Erfolgsprüfung zählt als nicht nachgewiesen', r.status === 'TOOL_FAILED');
    r = await lauf(E, 'pruefung_truthy', { text: 'a' });
    check('7c nur genau true belegt den Erfolg (ein "ja" reicht nicht)', r.status === 'TOOL_FAILED');
    r = await lauf(E, 'daten_undefined', { text: 'a' });
    check('7d Implementierung liefert nichts: TOOL_FAILED, daten = null', r.status === 'TOOL_FAILED' && r.daten === null);
    r = await lauf(E, 'mit_nachricht', { text: 'a' });
    check('7e eigene Meldung der Implementierung wird bei Nicht-Erfolg übernommen', r.status === 'TOOL_FAILED' && r.nachricht === 'Bereits vorhanden.');

    /* Keine Treffer, Verfügbarkeit, Fallbacks */
    E = einE();
    E.registriere(frisch({ name: 'suche', ausfuehren: async () => ({ treffer: [], reply: 'Nichts gefunden.' }), leer: d => d.treffer.length === 0, fallbacks: ['andere', 'nicht_da'] }));
    E.registriere(frisch({ name: 'andere' }));
    E.registriere(frisch({ name: 'weg', verfuegbar: () => false }));
    r = await lauf(E, 'suche', { text: 'a' });
    check('8a NO_RESULTS mit Meldung, ausgeführt, nur angemeldete Fallbacks genannt', r.status === 'NO_RESULTS' && r.ausgefuehrt === true && r.nachricht === 'Nichts gefunden.' && r.alternativen.join() === 'andere', JSON.stringify(r));
    aufrufe = 0; r = await lauf(E, 'weg', { text: 'a' });
    check('8b CAPABILITY_MISSING, wenn die Implementierung fehlt (verfuegbar=false), nichts ausgeführt', r.status === 'CAPABILITY_MISSING' && r.ausgefuehrt === false && aufrufe === 0);
    check('8c pruefeVerweise findet nicht angemeldete Fallbacks', JSON.stringify(E.pruefeVerweise()) === JSON.stringify([{ faehigkeit: 'suche', fallback: 'nicht_da' }]));
    r = await lauf(E, 'andere', { text: '' });
    check('8d Alternativen werden auch bei Fehlern genannt (NEEDS_INFORMATION), bei SUCCESS nicht', r.alternativen.length === 0 && (await lauf(E, 'suche', {})).alternativen.join() === 'andere' && (await lauf(E, 'andere', { text: 'a' })).alternativen.length === 0);
    check('8e die Registry führt Fallbacks NICHT selbst aus', (aufrufe = 0, await E.fuehreAus('suche', { text: 'a' }), aufrufe === 0));

    /* Bestätigung und Trockenlauf */
    E = einE();
    E.registriere(frisch({ name: 'gefaehrlich', bestaetigung: { noetig: true, grund: 'Löscht Daten.' } }));
    aufrufe = 0;
    r = await lauf(E, 'gefaehrlich', { text: 'a' });
    check('9a NEEDS_CONFIRMATION: nichts ausgeführt, Rückfrage mit Grund', r.status === 'NEEDS_CONFIRMATION' && r.ausgefuehrt === false && aufrufe === 0 && /Löscht Daten/.test(r.nachricht), JSON.stringify(r));
    for (const b of [false, 'true', 1, 'ja', undefined, null]) { r = await E.fuehreAus('gefaehrlich', { text: 'a' }, { bestaetigt: b }); check('9b nur bestaetigt===true zählt (' + String(b) + ')', r.status === 'NEEDS_CONFIRMATION' && aufrufe === 0); }
    r = await lauf(E, 'gefaehrlich', { text: 'a' }, { bestaetigt: true });
    check('9c mit Bestätigung wird genau einmal ausgeführt', r.status === 'SUCCESS' && aufrufe === 1);
    r = await lauf(E, 'gefaehrlich', {}, { bestaetigt: true });
    check('9d Bestätigung ersetzt keine fehlende Pflichtangabe', r.status === 'NEEDS_INFORMATION' && aufrufe === 1);
    r = await lauf(E, 'gefaehrlich', { text: 'a' }, { frage: 'Soll ich den Termin wirklich löschen?' });
    check('9e eigene Rückfrage wird übernommen', r.nachricht === 'Soll ich den Termin wirklich löschen?');
    aufrufe = 0;
    r = await lauf(E, 'gefaehrlich', { text: 'a' }, { trocken: true, bestaetigt: true });
    check('9f Trockenlauf: geprüft, trocken=true, ausgefuehrt=false, nichts ausgeführt', r.status === 'SUCCESS' && r.trocken === true && r.ausgefuehrt === false && aufrufe === 0, JSON.stringify(r));
    r = await lauf(E, 'gefaehrlich', {}, { trocken: true, bestaetigt: true });
    check('9g Trockenlauf prüft auch die Parameter', r.status === 'NEEDS_INFORMATION' && aufrufe === 0);
    r = await lauf(E, 'gefaehrlich', { text: 'a' }, { trocken: true });
    check('9h Trockenlauf prüft auch die Bestätigung', r.status === 'NEEDS_CONFIRMATION' && aufrufe === 0);

    /* Vorprüfung */
    E = einE();
    E.registriere(frisch({ name: 'vp_info', vorpruefung: () => ({ status: 'NEEDS_INFORMATION', nachricht: 'Da fehlt was.', fehlend: ['zeit'] }) }));
    E.registriere(frisch({ name: 'vp_fehlt', vorpruefung: () => ({ status: 'CAPABILITY_MISSING', nachricht: 'Geht nicht.' }) }));
    E.registriere(frisch({ name: 'vp_ok', vorpruefung: () => null }));
    E.registriere(frisch({ name: 'vp_wirft', vorpruefung: () => { throw new Error('x'); } }));
    E.registriere(frisch({ name: 'vp_unsinn', vorpruefung: () => ({ status: 'SUCCESS' }) }));
    aufrufe = 0;
    r = await lauf(E, 'vp_info', { text: 'a' });
    check('10a Vorprüfung kann abbrechen (NEEDS_INFORMATION)', r.status === 'NEEDS_INFORMATION' && r.fehlend.join() === 'zeit' && r.nachricht === 'Da fehlt was.' && aufrufe === 0);
    r = await lauf(E, 'vp_fehlt', { text: 'a' });
    check('10b Vorprüfung kann abbrechen (CAPABILITY_MISSING)', r.status === 'CAPABILITY_MISSING' && aufrufe === 0);
    check('10c Vorprüfung ohne Einwand: läuft', (await lauf(E, 'vp_ok', { text: 'a' })).status === 'SUCCESS' && aufrufe === 1);
    r = await lauf(E, 'vp_wirft', { text: 'a' }); check('10d Fehler in der Vorprüfung: TOOL_FAILED, nichts ausgeführt, kein Absturz', r.status === 'TOOL_FAILED' && r.ausgefuehrt === false && aufrufe === 1);
    r = await lauf(E, 'vp_unsinn', { text: 'a' }); check('10e Vorprüfung mit Status SUCCESS ist kein Abbruch', r.status === 'SUCCESS');

    /* Erweiterbarkeit */
    const x = einE(); const vorher = x.namen().length;
    const neu = x.registriere(frisch({ name: 'ganz_neu', ausfuehren: async (p, k) => ({ wert: 1, kontext: k }) }));
    r = await lauf(x, 'ganz_neu', { text: 'a' }, { kontext: { text: 'Satz' } });
    check('11a neue Fähigkeit ohne Änderung am Kern: anmelden, beschreiben, ausführen; Kontext wird durchgereicht', neu.ok && x.namen().length === vorher + 1 && r.status === 'SUCCESS' && r.daten.kontext.text === 'Satz' && x.beschreibe('ganz_neu').name === 'ganz_neu');
    check('11b Fähigkeiten laufen unabhängig voneinander (parallel)', (await Promise.all([x.fuehreAus('ganz_neu', { text: 'a' }), x.fuehreAus('ganz_neu', { text: 'b' })])).every(q => q.status === 'SUCCESS'));
    /* Sicherheit-Sätze: ohne sicherheit.js gibt es feste Ersatzsätze */
    const ohne = neuerKern(false).jvRegistry; const rr = await ohne.fuehreAus('nix', {});
    check('11c ohne js/sicherheit.js funktionieren die Ersatzsätze', rr.status === 'CAPABILITY_MISSING' && /Fähigkeit/.test(rr.nachricht));

    /* ================= Teil 2: die fünf Fähigkeiten in der App-Attrappe ================= */
    const ant = d => ({ ok: true, status: 200, json: async () => d });
    function umgebung(extra) {
        const A = starte({ jetzt: JETZT, festerZufall: true, fetch: async (u) => { if (extra) { const q = await extra(u); if (q) return q; } throw new Error('offline (Attrappe) ' + u); } });
        A.zaehler = { exec: 0, pruefe: 0, registry: 0 };
        const exec0 = A.sb.executeAction; A.sb.executeAction = function () { A.zaehler.exec++; return exec0.apply(this, arguments); };
        const pr0 = A.sb.jvSicher.pruefe; A.sb.jvSicher.pruefe = function () { A.zaehler.pruefe++; return pr0.apply(this, arguments); };
        return A;
    }
    const ruf = async (A, name, p, o) => { const q = await A.lassLaufen(() => A.sb.jvRegistry.fuehreAus(name, p, o)); if (q.haengt) return { status: 'HAENGT' }; return q.wert; };
    const zustand = A => JSON.stringify({ s: A.store, m: A.lese('memoryItems'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), t: A.lese('todoEntries'), e: A.lese('shoppingEntries') });

    let A = umgebung();
    check('20a keine Ladefehler', A.ladefehler.length === 0, A.ladefehler.join('; '));
    const FUENF = ['ortssuche', 'websuche', 'erinnerung_erstellen', 'termin_erstellen', 'gedaechtnis_speichern'];
    check('20b die fünf Fähigkeiten sind in dieser Reihenfolge angemeldet, dazu "wetter" (Chef-KI-Paket) und die fünf des Schreibkerns (B1)', A.sb.jvRegistry.namen().slice(0, 2).join() === 'ortssuche,websuche' && FUENF.every(n => A.sb.jvRegistry.namen().includes(n)) && A.sb.jvRegistry.namen().length === 22 && A.sb.jvRegistry.namen().includes('wetter') && A.sb.jvRegistry.namen().includes('produktsuche') && ['aufgabe_erstellen', 'aufgaben_lesen', 'termine_lesen', 'termin_verschieben', 'kontakt_speichern'].every(n => A.sb.jvRegistry.namen().includes(n)), A.sb.jvRegistry.namen().join());
    check('20c alle Fallbacks sind angemeldet', A.sb.jvRegistry.pruefeVerweise().length === 0);
    const bekannteAktionen = new Set(A.sb.jvSicher._bekannteTypen());
    for (const n of FUENF) {
        const b = A.sb.jvRegistry.beschreibe(n), h = A.sb.jvRegistry.hole(n);
        check('21a ' + n + ': alle zehn Angaben vorhanden', !!b.name && !!b.beschreibung.trim() && Array.isArray(b.pflicht) && Array.isArray(b.optional) && b.rueckgabe.felder.length > 0 && b.fehler.length > 0 && Array.isArray(b.fallbacks) && typeof b.bestaetigung.noetig === 'boolean' && !!b.bestaetigung.grund && typeof h.pruefeErfolg === 'function' && !!b.verbindung.datei && !!b.verbindung.funktion);
        check('21b ' + n + ': Verbindung zeigt auf bestehenden Code (' + b.verbindung.datei + ' → ' + b.verbindung.funktion + ')', fs.existsSync(path.join(ROOT, b.verbindung.datei)) && new RegExp('function\\s+' + b.verbindung.funktion + '\\s*\\(').test(lies(b.verbindung.datei)));
        check('21c ' + n + ': die verbundene Aktionsart ist der Sicherheit (Phase 1) bekannt', bekannteAktionen.has(b.verbindung.aktion));
        check('21d ' + n + ': Beschreibung ist reine Daten', !/function/.test(JSON.stringify(b)));
    }
    check('21e Pflicht/optional der fünf', JSON.stringify(FUENF.map(n => A.sb.jvRegistry.beschreibe(n).pflicht.map(p => p.name))) === JSON.stringify([['suchbegriff'], ['frage'], ['text'], ['text', 'zeit'], ['schluessel']]));

    /* --- nicht produktiv --- */
    const andere = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !/^(registry(_faehigkeiten|_schreibkern|_produkt)?|foto_werkzeuge|schatten|chef|assistant|rueckfrage|plan_ansagen)\.js$/.test(f)).filter(f => /jvRegistry/.test(lies('js/' + f)));
    check('22a keine andere App-Datei benutzt die Registry (außer dem Schattenbetrieb, der sie nur liest, der Chef-KI aus Phase 6 und dem Fahrzeit-Aufruf in assistant.js der Adress-Rückfrage in rueckfrage.js und der kurzen Abfahrtsfrage zu einem Termin in plan_ansagen.js (B2, ruft die Fähigkeit abfahrt auf), die sie aufrufen)', andere.length === 0, andere.join(', '));
    check('22b keine Datei außer index.html bindet die beiden Registry-Skripte ein / ruft sie auf (Service Worker, Hüllen)', ['sw.js', 'manifest.json'].filter(f => fs.existsSync(path.join(ROOT, f)) && /jvRegistry/.test(lies(f))).length === 0);
    check('22c die Registry-Skripte stehen in index.html hinter sicherheit.js', (() => { const h = lies('index.html'); const i = h.indexOf('js/sicherheit.js'), j = h.indexOf('js/registry.js'), k = h.indexOf('js/registry_faehigkeiten.js'); return i > 0 && j > i && k > j; })());
    {
        const B = umgebung(u => /\/api\/groq/.test(u) ? ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Hallo, schön dich zu hören.', actions: [{ type: 'chat' }] }) } }] }) : null);
        const f0 = B.sb.jvRegistry.fuehreAus; B.sb.jvRegistry.fuehreAus = function () { B.zaehler.registry++; return f0.apply(this, arguments); };
        await B.lassLaufen(() => B.sb.sendToGroqSmart('Wie geht es dir heute'));
        await B.lassLaufen(() => B.sb.sendToGroqSmart('Erinner mich morgen an Kaffee'));
        check('22d ein normales Gespräch und die normale KI-Steuerung rufen die Registry nie auf', B.zaehler.registry === 0 && B.gesagt.length >= 1, String(B.zaehler.registry));
    }

    /* --- Trockenlauf und fehlende Angaben: nichts verändert, nichts ausgeführt, kein Netz --- */
    const gueltig = {
        ortssuche: { suchbegriff: 'Pizzeria' }, websuche: { frage: 'Was läuft heute im Fernsehen' }, erinnerung_erstellen: { text: 'Kaffee kaufen', zeit: '2026-11-06T08:00:00' },
        termin_erstellen: { text: 'Zahnarzt', zeit: '2026-11-06T10:00:00' }, gedaechtnis_speichern: { schluessel: 'Schlüssel', wert: 'im Auto' }
    };
    const z0 = zustand(A), n0 = A.aufrufe.length;
    for (const n of FUENF) {
        r = await ruf(A, n, gueltig[n], { trocken: true, kontext: { text: 'Test' } });
        check('23a Trockenlauf ' + n + ': SUCCESS, nicht ausgeführt', r.status === 'SUCCESS' && r.trocken === true && r.ausgefuehrt === false, JSON.stringify(r));
    }
    check('23b Trockenlauf aller fünf: Speicher, Listen, Kalender unverändert, kein Netzaufruf, executeAction nie aufgerufen', zustand(A) === z0 && A.aufrufe.length === n0 && A.zaehler.exec === 0, A.aufrufe.slice(n0).join());
    const leerP = { ortssuche: {}, websuche: { frage: '  ' }, erinnerung_erstellen: { zeit: '2026-11-06T08:00:00' }, termin_erstellen: { text: 'Zahnarzt' }, gedaechtnis_speichern: { wert: 'im Auto' } };
    const fehlt = { ortssuche: 'suchbegriff', websuche: 'frage', erinnerung_erstellen: 'text', termin_erstellen: 'zeit', gedaechtnis_speichern: 'schluessel' };
    for (const n of FUENF) {
        r = await ruf(A, n, leerP[n]);
        check('24a ' + n + ': fehlende Angabe → NEEDS_INFORMATION (' + fehlt[n] + '), nichts ausgeführt', r.status === 'NEEDS_INFORMATION' && r.fehlend.join() === fehlt[n] && r.ausgefuehrt === false, JSON.stringify(r));
    }
    r = await ruf(A, 'termin_erstellen', { text: 'Zahnarzt', zeit: 'irgendwann' });
    check('24b Termin mit unlesbarer Zeit → NEEDS_INFORMATION', r.status === 'NEEDS_INFORMATION' && r.fehlend.join() === 'zeit');
    r = await ruf(A, 'termin_erstellen', { text: 'Zahnarzt', zeit: '2026-11-06T10:00:00', dauer_minuten: 'lang' });
    check('24c Termin mit unlesbarer Dauer → NEEDS_INFORMATION', r.status === 'NEEDS_INFORMATION' && r.fehlend.join() === 'dauer_minuten');
    check('24d nach allen Fehlversuchen: nichts verändert, nichts ausgeführt, kein Netz', zustand(A) === z0 && A.zaehler.exec === 0 && A.aufrufe.length === n0);

    /* --- echte Läufe, aber nur in der Attrappe --- */
    const B2 = umgebung();
    const zB = zustand(B2);
    r = await ruf(B2, 'gedaechtnis_speichern', gueltig.gedaechtnis_speichern, { kontext: { text: 'Merk dir Schlüssel im Auto' } });
    check('25a Gedächtnis: SUCCESS, Eintrag nachweisbar, vorhandene bestehende Funktion benutzt', r.status === 'SUCCESS' && r.ausgefuehrt === true && r.daten.schluessel === 'schlüssel' && r.daten.gespeichert === 'im Auto' && B2.lese('memoryItems')['schlüssel'] === 'im Auto' && B2.zaehler.exec === 1, JSON.stringify(r));
    check('25b Gedächtnis: die Sicherheitsprüfung aus Phase 1 wurde aufgerufen (Vorprüfung + Erfolgsprüfung)', B2.zaehler.pruefe >= 1, String(B2.zaehler.pruefe));
    const rem0 = B2.lese('reminderEntries').length;
    r = await ruf(B2, 'erinnerung_erstellen', gueltig.erinnerung_erstellen, { kontext: { text: 'Erinner mich morgen um acht an Kaffee kaufen' } });
    check('25c Erinnerung: SUCCESS, genau eine mehr', r.status === 'SUCCESS' && B2.lese('reminderEntries').length === rem0 + 1 && r.daten.nachher === r.daten.vorher + 1, JSON.stringify(r).slice(0, 300));
    check('25d Erinnerung: ehrlicher Hinweis, dass Google nicht verbunden ist, bleibt erhalten', /nur in der App gespeichert/.test(r.nachricht) && r.daten.hinweise.length >= 1, r.nachricht);
    const cal0 = B2.lese('calendarEntries').length;
    r = await ruf(B2, 'termin_erstellen', gueltig.termin_erstellen, { kontext: { text: 'Trag morgen um zehn Zahnarzt ein' } });
    check('25e Termin: SUCCESS, genau einer mehr', r.status === 'SUCCESS' && B2.lese('calendarEntries').length === cal0 + 1 && r.daten.nachher === r.daten.vorher + 1, JSON.stringify(r).slice(0, 300));
    check('25f nur die angeforderten Listen haben sich geändert (keine Einkäufe, Aufgaben)', B2.lese('shoppingEntries').length === 0 && B2.lese('todoEntries').length === 0 && Object.keys(B2.lese('memoryItems')).length === 1);
    check('25g Netz: nur Attrappen-Aufrufe auf eigene /api-Wege, nie ein fremder Server', B2.aufrufe.every(u => u.startsWith('/') || /^\/?api\//.test(u)), B2.aufrufe.join());
    check('25i jede Umgebung startet leer: kein Test hinterlässt etwas', umgebung().lese('reminderEntries').length === 0 && umgebung().lese('calendarEntries').length === 0 && Object.keys(umgebung().lese('memoryItems')).length === 0);

    /* --- Phase-1-Sicherheit wird nicht umgangen --- */
    {
        const C = umgebung(); const z = zustand(C);
        C.sb.jvSicher.pruefe = function () { C.zaehler.pruefe++; return 'unvollstaendig'; };
        for (const n of ['erinnerung_erstellen', 'termin_erstellen', 'gedaechtnis_speichern']) {
            r = await ruf(C, n, gueltig[n]);
            check('26a ' + n + ': meldet die Sicherheit "unvollständig" → NEEDS_INFORMATION, nichts geschrieben', r.status === 'NEEDS_INFORMATION' && r.ausgefuehrt === false && /unvollständig/.test(r.nachricht), JSON.stringify(r));
        }
        C.sb.jvSicher.pruefe = function () { C.zaehler.pruefe++; return 'fehlt'; };
        for (const n of ['erinnerung_erstellen', 'termin_erstellen', 'gedaechtnis_speichern']) {
            r = await ruf(C, n, gueltig[n]);
            check('26b ' + n + ': meldet die Sicherheit "fehlt" → CAPABILITY_MISSING, nichts geschrieben', r.status === 'CAPABILITY_MISSING' && r.ausgefuehrt === false && /Fähigkeit/.test(r.nachricht), JSON.stringify(r));
        }
        check('26c in beiden Fällen: nichts verändert, executeAction nie aufgerufen', zustand(C) === z && C.zaehler.exec === 0);
        const D = umgebung();
        await ruf(D, 'erinnerung_erstellen', gueltig.erinnerung_erstellen);
        check('26d bei Normalbetrieb wird die Sicherheitsprüfung für jede Schreib-Aktion wirklich befragt', D.zaehler.pruefe >= 1);
    }

    /* --- Erfolgsprüfung gegen die echten Listen --- */
    {
        const E1 = umgebung(); E1.sb.executeAction = async () => { E1.zaehler.exec++; };   // "Aktion läuft ohne Fehler, schreibt aber nichts"
        for (const n of ['erinnerung_erstellen', 'termin_erstellen', 'gedaechtnis_speichern']) {
            r = await ruf(E1, n, gueltig[n]);
            check('27a ' + n + ': Aktion lief, aber nichts geschrieben → TOOL_FAILED (kein falscher Erfolg)', r.status === 'TOOL_FAILED' && r.ausgefuehrt === true && r.grund === 'Erfolg nicht nachgewiesen', JSON.stringify(r).slice(0, 250));
        }
        const E2b = umgebung(); E2b.sb.executeAction = async () => { const e = new Error('x'); e.userMessage = 'Dazu habe ich keinen Eintrag.'; throw e; };
        r = await ruf(E2b, 'termin_erstellen', gueltig.termin_erstellen);
        check('27b Aktion wirft verständlichen Fehler → TOOL_FAILED mit dieser Meldung', r.status === 'TOOL_FAILED' && r.nachricht === 'Dazu habe ich keinen Eintrag.');
        const E3 = umgebung(); E3.sb.executeAction = async (a, t, ctx) => { ctx[Symbol.for('jv.nichtsGetan')] = ['Es war schon vorhanden, deshalb wurde nichts gespeichert.']; };
        r = await ruf(E3, 'erinnerung_erstellen', gueltig.erinnerung_erstellen);
        check('27c "bewusst nichts getan" (nichtsGetan) zählt nicht als Erfolg und wird ehrlich weitergegeben', r.status === 'TOOL_FAILED' && /nichts gespeichert/.test(r.nachricht), JSON.stringify(r).slice(0, 250));
        const E4 = umgebung(); E4.sb.executeAction = undefined;
        r = await ruf(E4, 'erinnerung_erstellen', gueltig.erinnerung_erstellen);
        check('27d ohne Aktionsausführung in der Umgebung: CAPABILITY_MISSING', r.status === 'CAPABILITY_MISSING' && r.ausgefuehrt === false);
    }

    /* --- Ortssuche --- */
    {
        const O = umgebung(); let gesehen = null, ortWaehrend = null, ortArg = null;
        O.sb.window.jvLetzterText = 'Ursprünglicher Satz';
        O.sb.findNearbyRestaurants = async (q, ort) => { gesehen = q; ortArg = ort; ortWaehrend = O.sb.window.jvLetzterText; return { reply: 'In Reinbek gibt es zum Beispiel Roma.', cards: [{ title: 'Roma' }] }; };
        r = await ruf(O, 'ortssuche', { suchbegriff: 'Pizzeria', ort: 'Reinbek' });
        check('28a Ortssuche: SUCCESS, Suchbegriff wird an die bestehende Funktion gegeben, Daten = Antwort + Karten', r.status === 'SUCCESS' && gesehen === 'Pizzeria' && r.daten.cards.length === 1 && /Roma/.test(r.nachricht), JSON.stringify(r));
        check('28b Ortssuche: der Ort geht als zweiter Wert an die Funktion; window.jvLetzterText bleibt davor, währenddessen und danach unberührt', ortArg === 'Reinbek' && ortWaehrend === 'Ursprünglicher Satz' && O.sb.window.jvLetzterText === 'Ursprünglicher Satz', String(ortArg) + ' / ' + ortWaehrend);
        await ruf(O, 'ortssuche', { suchbegriff: 'Pizzeria' });
        check('28c Ortssuche ohne Ort: leerer Ort (= um den Nutzer herum) wird übergeben, kein alter Ort aus dem letzten Satz', ortArg === '' && typeof ortArg === 'string' && ortWaehrend === 'Ursprünglicher Satz' && O.sb.window.jvLetzterText === 'Ursprünglicher Satz');
        O.sb.findNearbyRestaurants = async () => ({ reply: 'In der Nähe habe ich leider nichts gefunden.', cards: [] });
        r = await ruf(O, 'ortssuche', { suchbegriff: 'Sushi' });
        check('28d Ortssuche ohne Treffer: NO_RESULTS, Alternative "websuche"', r.status === 'NO_RESULTS' && r.ausgefuehrt === true && r.alternativen.join() === 'websuche' && /nichts gefunden/.test(r.nachricht), JSON.stringify(r));
        O.sb.findNearbyRestaurants = async () => { const e = new Error('x'); e.userMessage = 'Deinen Standort konnte ich gerade nicht ermitteln. Ist der Standortzugriff erlaubt?'; throw e; };
        r = await ruf(O, 'ortssuche', { suchbegriff: 'Sushi', ort: 'Hamburg' });
        check('28e Ortssuche, Standort fehlt: TOOL_FAILED mit verständlicher Meldung; der Satz bleibt auch nach dem Fehler unberührt', r.status === 'TOOL_FAILED' && /Standort/.test(r.nachricht) && O.sb.window.jvLetzterText === 'Ursprünglicher Satz');
        const O2 = umgebung();
        r = await ruf(O2, 'ortssuche', { suchbegriff: 'Pizzeria' });
        check('28f echte bestehende Funktion ohne Standort/Netz: TOOL_FAILED, kein Absturz, kein Hängen', r.status === 'TOOL_FAILED' && r.ausgefuehrt === true && !!r.nachricht, JSON.stringify(r));
        O2.sb.findNearbyRestaurants = undefined;
        check('28g ohne die Funktion: CAPABILITY_MISSING', (await ruf(O2, 'ortssuche', { suchbegriff: 'Pizzeria' })).status === 'CAPABILITY_MISSING');
    }

    /* --- Websuche --- */
    {
        let modus = 'gut'; const gesendet = [];
        const Wb = umgebung(u => {
            if (!/\/api\/groq/.test(u)) return null;
            if (modus === 'gut') return ant({ choices: [{ message: { content: 'Heute läuft um 20:15 Uhr der Tatort im Ersten.' } }] });
            if (modus === 'kaputt') return { ok: false, status: 500, json: async () => ({}) };
            if (modus === 'leer') return ant({ choices: [{ message: { content: '' } }] });
            return null;
        });
        r = await ruf(Wb, 'websuche', { frage: 'Was läuft heute im Fernsehen' });
        check('29a Websuche: SUCCESS mit Antworttext (bestehende Funktion, Attrappe als Dienst)', r.status === 'SUCCESS' && /Tatort/.test(r.daten.antwort) && r.nachricht === r.daten.antwort, JSON.stringify(r));
        modus = 'kaputt'; r = await ruf(Wb, 'websuche', { frage: 'Was läuft heute im Fernsehen' });
        check('29b Websuche, Dienst antwortet mit Fehler: TOOL_FAILED mit der bekannten Meldung', r.status === 'TOOL_FAILED' && /Suche im Internet hat gerade nicht geklappt/.test(r.nachricht), JSON.stringify(r));
        modus = 'leer'; r = await ruf(Wb, 'websuche', { frage: 'Was läuft heute im Fernsehen' });
        check('29c Websuche, leere Antwort: TOOL_FAILED, kein leerer Erfolg', r.status === 'TOOL_FAILED');
        modus = 'offline'; r = await ruf(Wb, 'websuche', { frage: 'Was läuft heute im Fernsehen' });
        check('29d Websuche offline: TOOL_FAILED, kein Absturz', r.status === 'TOOL_FAILED');
        Wb.sb.answerWithWebSearch = undefined;
        check('29e ohne die Funktion: CAPABILITY_MISSING', (await ruf(Wb, 'websuche', { frage: 'x' })).status === 'CAPABILITY_MISSING');
    }

    /* --- Erweiterung zur Laufzeit in der App-Umgebung, ohne den Kern anzufassen --- */
    {
        const F = umgebung();
        const reg = F.sb.jvRegistry.registriere(frisch({ name: 'neue_faehigkeit', fallbacks: ['websuche'], ausfuehren: async () => ({ wert: 1 }) }));
        r = await ruf(F, 'neue_faehigkeit', { text: 'a' });
        check('30a eine weitere Fähigkeit läuft neben den angemeldeten (fünf + wetter + Schreibkern), Fallback auf eine bestehende wird erkannt', reg.ok && r.status === 'SUCCESS' && F.sb.jvRegistry.namen().length === 23 && F.sb.jvRegistry.pruefeVerweise().length === 0);
        check('30b die fünf Namen lassen sich nicht überschreiben', F.sb.jvRegistry.registriere(frisch({ name: 'ortssuche' })).ok === false && F.sb.jvRegistry.hole('ortssuche').verbindung.funktion === 'findNearbyRestaurants');
    }

    /* ================= Teil 3: gezielte Prüfung der drei Schwachstellen (Erfolgsnachweis und globaler Zustand) ================= */
    const stumm = A2 => { A2.sb.executeAction = async () => { A2.zaehler.exec++; }; return A2; };   // Aktion läuft ohne Fehler, schreibt aber nichts
    const mem = (A2, o) => { const m = A2.lese('memoryItems'); Object.keys(o).forEach(k => { m[k] = o[k]; }); };

    /* --- Punkt 1: Gedächtnis --- */
    {
        const G = umgebung();
        await ruf(G, 'gedaechtnis_speichern', { schluessel: 'Schlüssel', wert: 'im Auto' });
        r = await ruf(G, 'gedaechtnis_speichern', { schluessel: 'Schlüssel', wert: 'in der Tasche' });
        check('40a echtes Überschreiben: SUCCESS, neuer Wert steht da, als überschrieben gekennzeichnet', r.status === 'SUCCESS' && G.lese('memoryItems')['schlüssel'] === 'in der Tasche' && r.daten.ueberschrieben === true && r.daten.vorher === 'im Auto' && r.daten.erwartet === 'in der Tasche', JSON.stringify(r.daten));
        stumm(G);
        r = await ruf(G, 'gedaechtnis_speichern', { schluessel: 'Schlüssel', wert: 'beim Nachbarn' });
        check('40b Überschreiben ohne Wirkung: der alte Treffer zählt NICHT als Erfolg (TOOL_FAILED)', r.status === 'TOOL_FAILED' && r.grund === 'Erfolg nicht nachgewiesen' && r.daten.gespeichert === 'in der Tasche' && r.daten.erwartet === 'beim Nachbarn' && G.lese('memoryItems')['schlüssel'] === 'in der Tasche', JSON.stringify(r));
        const G2 = umgebung(); mem(G2, { 'schlüssel': 'im Auto' });
        G2.sb.executeAction = async () => { G2.lese('memoryItems')['schlüssel'] = 'ein ganz anderer Wert'; };
        r = await ruf(G2, 'gedaechtnis_speichern', { schluessel: 'Schlüssel', wert: 'in der Tasche' });
        check('40c falscher Wert unter dem richtigen Stichwort → TOOL_FAILED', r.status === 'TOOL_FAILED' && r.daten.gespeichert === 'ein ganz anderer Wert');
        const G3 = umgebung(); mem(G3, { 'schlüssel': 'im Auto' });
        G3.sb.executeAction = async () => { G3.lese('memoryItems')['anderes stichwort'] = 'in der Tasche'; };
        r = await ruf(G3, 'gedaechtnis_speichern', { schluessel: 'Schlüssel', wert: 'in der Tasche' });
        check('40d richtiger Wert unter einem ANDEREN Stichwort → TOOL_FAILED', r.status === 'TOOL_FAILED' && r.daten.gespeichert === 'im Auto');
        const G4 = stumm(umgebung());
        r = await ruf(G4, 'gedaechtnis_speichern', { schluessel: 'Neu', wert: 'x' });
        check('40e neues Stichwort, nichts geschrieben → TOOL_FAILED (gespeichert leer)', r.status === 'TOOL_FAILED' && r.daten.gespeichert === '');
        const G5 = umgebung(); mem(G5, { 'schlüssel': 'im Auto' });
        r = await ruf(G5, 'gedaechtnis_speichern', { schluessel: 'Schlüssel', wert: 'im Auto' });
        check('40f gleicher Wert wie vorher: Zustand stimmt → SUCCESS, aber als "unverändert" gekennzeichnet (bekannte Grenze)', r.status === 'SUCCESS' && r.daten.unveraendert === true && r.daten.ueberschrieben === false);
        const G6 = umgebung(); mem(G6, { 'schlüssel': 'im Auto' });
        r = await ruf(G6, 'gedaechtnis_speichern', { schluessel: '  SCHLÜSSEL ', wert: 'in der Tasche' });
        check('40g Stichwort mit Großbuchstaben/Leerzeichen: gleiches Stichwort wird überschrieben, kein zweites angelegt', r.status === 'SUCCESS' && Object.keys(G6.lese('memoryItems')).length === 1 && G6.lese('memoryItems')['schlüssel'] === 'in der Tasche');
        const G7 = umgebung(); mem(G7, { 'schlüssel': 'im Auto' });
        r = await ruf(G7, 'gedaechtnis_speichern', { schluessel: 'Schlüssel' });
        check('40h ohne Wert speichert die bestehende Funktion "gespeichert": das wird erwartet und nachgewiesen', r.status === 'SUCCESS' && r.daten.erwartet === 'gespeichert' && G7.lese('memoryItems')['schlüssel'] === 'gespeichert');
        const G8 = stumm(umgebung()); mem(G8, { 'schlüssel': 'gespeichert' });
        r = await ruf(G8, 'gedaechtnis_speichern', { schluessel: 'Schlüssel' });
        check('40i (Randfall, bekannte Grenze) Standardwert schon vorhanden und nichts geschrieben: Zustand stimmt → SUCCESS, "unverändert"', r.status === 'SUCCESS' && r.daten.unveraendert === true);
        const G9 = umgebung(); mem(G9, { 'schlüsselbund': 'im Flur', 'auto': 'schlüssel im Handschuhfach' });
        stumm(G9);
        r = await ruf(G9, 'gedaechtnis_speichern', { schluessel: 'Schlüssel', wert: 'in der Tasche' });
        check('40j ähnliche Treffer (Teilwort im Stichwort, Wort im Wert) zählen nicht: nur genau dieses Stichwort', r.status === 'TOOL_FAILED' && r.daten.gespeichert === '' && r.daten.vorher === '', JSON.stringify(r.daten));
        const G10 = umgebung();
        r = await ruf(G10, 'gedaechtnis_speichern', { schluessel: 'Name', wert: 'Herr Schröter' });
        check('40k Namensumschreibung der bestehenden Funktion (jvFestnamen) wird vorhergesagt: SUCCESS, Wert = was wirklich gespeichert wurde', r.status === 'SUCCESS' && r.daten.gespeichert === G10.lese('memoryItems')['name'] && r.daten.erwartet === r.daten.gespeichert, JSON.stringify(r.daten));
        const G11 = umgebung();
        r = await ruf(G11, 'gedaechtnis_speichern', { schluessel: 'Ort', wert: '{"value":"Reinbek"}' });
        check('40l Wert als JSON-Text: erwartet wird, was die bestehende Funktion daraus macht', r.status === 'SUCCESS' && r.daten.erwartet === r.daten.gespeichert, JSON.stringify(r.daten));
        const G12 = umgebung();
        r = await ruf(G12, 'gedaechtnis_speichern', { schluessel: 'Zahl', wert: 0 });
        check('40m Wert 0 / leer: wie in der bestehenden Funktion wird "gespeichert" erwartet (kein Fehlalarm)', r.status === 'SUCCESS' && r.daten.erwartet === 'gespeichert');
    }

    /* --- Punkt 2: Erinnerungen und Termine --- */
    const ZEIT = '2026-11-06T08:00:00', ZEIT_T = '2026-11-06T10:00:00';
    const mitEintrag = (A2, welche, e) => { A2.sb.executeAction = async () => { A2.zaehler.exec++; A2.lese(welche).unshift(e); }; return A2; };
    const iso = z => new Date(z).toISOString();
    {
        let q; const L = umgebung();
        r = await ruf(L, 'erinnerung_erstellen', { text: 'Kaffee kaufen', zeit: ZEIT });
        check('41a Erinnerung echt: SUCCESS, genau der neue Eintrag ist der gewünschte', r.status === 'SUCCESS' && r.daten.neu === 1 && r.daten.passend === 1 && r.daten.unerwartet === 0, JSON.stringify(r.daten).slice(0, 250));
        const fall = async (titel, welche, name, p, eintrag, erwartetStatus, vorher, kontext) => {
            const A2 = umgebung(); if (vorher) vorher(A2);
            if (eintrag === 'stumm') stumm(A2); else if (eintrag) mitEintrag(A2, welche, eintrag);
            const q = await ruf(A2, name, p, kontext ? { kontext } : undefined);
            check(titel, q.status === erwartetStatus && (erwartetStatus !== 'TOOL_FAILED' || q.grund === 'Erfolg nicht nachgewiesen'), q.status + ' ' + q.grund + ' ' + JSON.stringify(q.daten).slice(0, 200));
            return q;
        };
        const R = (text, zeit, extra) => Object.assign({ id: 5, googleId: null, text, time: iso(zeit), triggered: false, recurrence: null, important: false }, extra || {});
        const T = (text, zeit, extra) => Object.assign({ id: 'local_5', text, date: 'x', isoDate: iso(zeit), location: '' }, extra || {});
        const rp = { text: 'Kaffee kaufen', zeit: ZEIT }, tp = { text: 'Zahnarzt', zeit: ZEIT_T };
        /* Erinnerung */
        await fall('41b Erinnerung: Liste unverändert → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', rp, 'stumm', 'TOOL_FAILED');
        await fall('41c Erinnerung: neuer Eintrag mit FALSCHEM TEXT, Anzahl +1 → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', rp, R('Brot kaufen', ZEIT), 'TOOL_FAILED');
        await fall('41d Erinnerung: richtiger Text, Uhrzeit eine Stunde später → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', rp, R('Kaffee kaufen', '2026-11-06T09:00:00'), 'TOOL_FAILED');
        await fall('41e Erinnerung: richtiger Text, richtige Uhrzeit, falscher Tag → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', rp, R('Kaffee kaufen', '2026-11-07T08:00:00'), 'TOOL_FAILED');
        await fall('41f Erinnerung: Zeit um 5 Minuten daneben → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', rp, R('Kaffee kaufen', '2026-11-06T08:05:00'), 'TOOL_FAILED');
        await fall('41g Erinnerung: gleicher Text, nur 59 Sekunden Abweichung → SUCCESS (Toleranz unter einer Minute)', 'reminderEntries', 'erinnerung_erstellen', rp, R('Kaffee kaufen', '2026-11-06T08:00:59'), 'SUCCESS');
        await fall('41h Erinnerung: Groß-/Kleinschreibung und Leerzeichen im Text sind egal → SUCCESS', 'reminderEntries', 'erinnerung_erstellen', rp, R('  KAFFEE kaufen ', ZEIT), 'SUCCESS');
        await fall('41i Erinnerung: gleicher Eintrag war schon da (B1-Doppelschutz) → SUCCESS "schon vorhanden", nichts neu geschrieben', 'reminderEntries', 'erinnerung_erstellen', rp, 'stumm', 'SUCCESS', A2 => A2.lese('reminderEntries').push(R('Kaffee kaufen', ZEIT)));
        await fall('41j Erinnerung: alter Eintrag ersetzt durch falschen (Anzahl gleich) → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', rp, null, 'TOOL_FAILED', A2 => { A2.lese('reminderEntries').push(R('Alt', ZEIT)); A2.sb.executeAction = async () => { const l = A2.lese('reminderEntries'); l.length = 0; l.push(R('Brot', ZEIT)); }; });
        q = await fall('41k Erinnerung: richtiger Eintrag UND ein zusätzlicher unpassender → SUCCESS, der Zusatz wird gemeldet (unerwartet=1)', 'reminderEntries', 'erinnerung_erstellen', rp, null, 'SUCCESS', A2 => { A2.sb.executeAction = async () => { const l = A2.lese('reminderEntries'); l.unshift(R('Zusatz', ZEIT)); l.unshift(R('Kaffee kaufen', ZEIT)); }; });
        check('41l … und der Zusatz steht in den Daten', q.daten.neu === 2 && q.daten.passend === 1 && q.daten.unerwartet === 1);
        await fall('41m Erinnerung wichtig verlangt, Eintrag nicht wichtig → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', { text: 'Kaffee kaufen', zeit: ZEIT, wichtig: true }, R('Kaffee kaufen', ZEIT, { important: false }), 'TOOL_FAILED');
        await fall('41n Erinnerung wichtig verlangt, Eintrag wichtig → SUCCESS', 'reminderEntries', 'erinnerung_erstellen', { text: 'Kaffee kaufen', zeit: ZEIT, wichtig: true }, R('Kaffee kaufen', ZEIT, { important: true }), 'SUCCESS');
        await fall('41o Erinnerung echt mit wichtig:true → SUCCESS und wirklich wichtig', 'reminderEntries', 'erinnerung_erstellen', { text: 'Kaffee kaufen', zeit: ZEIT, wichtig: true }, undefined, 'SUCCESS');
        await fall('41p Erinnerung mit Wiederholung ("jeden Montag"): Tag darf wandern, die Uhrzeit nicht → SUCCESS bei gleicher Uhrzeit', 'reminderEntries', 'erinnerung_erstellen', rp, R('Kaffee kaufen', '2026-11-09T08:00:00'), 'SUCCESS', null, { text: 'Erinner mich jeden Montag um acht an Kaffee kaufen' });
        await fall('41q Erinnerung mit Wiederholung: falsche Uhrzeit → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', rp, R('Kaffee kaufen', '2026-11-09T09:00:00'), 'TOOL_FAILED', null, { text: 'Erinner mich jeden Montag um acht an Kaffee kaufen' });
        await fall('41r ohne Wiederholungswunsch darf der Tag NICHT wandern → TOOL_FAILED', 'reminderEntries', 'erinnerung_erstellen', rp, R('Kaffee kaufen', '2026-11-09T08:00:00'), 'TOOL_FAILED', null, { text: 'Erinner mich morgen um acht an Kaffee kaufen' });
        /* Termin */
        q = await ruf(L, 'termin_erstellen', { text: 'Zahnarzt', zeit: ZEIT_T }, { kontext: { text: 'Trag Zahnarzt ein' } });
        check('42a Termin echt: SUCCESS, genau der neue Eintrag ist der gewünschte', q.status === 'SUCCESS' && q.daten.neu === 1 && q.daten.passend === 1 && q.daten.unerwartet === 0, JSON.stringify(q.daten).slice(0, 250));
        await fall('42b Termin: Liste unverändert → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', tp, 'stumm', 'TOOL_FAILED');
        await fall('42c Termin: neuer Eintrag mit FALSCHEM TITEL, Anzahl +1 → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', tp, T('Friseur', ZEIT_T), 'TOOL_FAILED');
        await fall('42d Termin: richtiger Titel, falsche Uhrzeit (11 statt 10) → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', tp, T('Zahnarzt', '2026-11-06T11:00:00'), 'TOOL_FAILED');
        await fall('42e Termin: richtiger Titel, richtige Uhrzeit, falscher Tag → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', tp, T('Zahnarzt', '2026-11-07T10:00:00'), 'TOOL_FAILED');
        await fall('42f Termin: gleicher Eintrag war schon da (B1-Doppelschutz) → SUCCESS "schon vorhanden", nichts neu geschrieben', 'calendarEntries', 'termin_erstellen', tp, 'stumm', 'SUCCESS', A2 => A2.lese('calendarEntries').push(T('Zahnarzt', ZEIT_T)));
        await fall('42g Termin: alter Eintrag ersetzt durch falschen (Anzahl gleich) → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', tp, null, 'TOOL_FAILED', A2 => { A2.lese('calendarEntries').push(T('Alt', ZEIT_T)); A2.sb.executeAction = async () => { const l = A2.lese('calendarEntries'); l.length = 0; l.push(T('Friseur', ZEIT_T)); }; });
        q = await fall('42h Termin: richtiger Eintrag UND ein zusätzlicher unpassender → SUCCESS mit unerwartet=1', 'calendarEntries', 'termin_erstellen', tp, null, 'SUCCESS', A2 => { A2.sb.executeAction = async () => { const l = A2.lese('calendarEntries'); l.unshift(T('Zusatz', ZEIT_T)); l.unshift(T('Zahnarzt', ZEIT_T)); }; });
        check('42i … der Zusatz steht in den Daten', q.daten.neu === 2 && q.daten.passend === 1 && q.daten.unerwartet === 1);
        await fall('42j Termin mit Ort verlangt, Eintrag mit anderem Ort → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', { text: 'Zahnarzt', zeit: ZEIT_T, ort: 'Hamburg' }, T('Zahnarzt', ZEIT_T, { location: 'Berlin' }), 'TOOL_FAILED');
        await fall('42k Termin mit Ort verlangt, Eintrag mit diesem Ort → SUCCESS', 'calendarEntries', 'termin_erstellen', { text: 'Zahnarzt', zeit: ZEIT_T, ort: 'Hamburg' }, T('Zahnarzt', ZEIT_T, { location: 'hamburg' }), 'SUCCESS');
        await fall('42l Termin echt mit Ort → SUCCESS und Ort wirklich gespeichert', 'calendarEntries', 'termin_erstellen', { text: 'Zahnarzt', zeit: ZEIT_T, ort: 'Hamburg' }, undefined, 'SUCCESS');
        await fall('42m ganztägiger Eintrag (nur Datum) am richtigen Tag → SUCCESS, am falschen → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', tp, { id: 'x', text: 'Zahnarzt', date: 'x', isoDate: '2026-11-06', location: '' }, 'SUCCESS');
        await fall('42n ganztägiger Eintrag am falschen Tag → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', tp, { id: 'x', text: 'Zahnarzt', date: 'x', isoDate: '2026-11-08', location: '' }, 'TOOL_FAILED');
        await fall('42o Eintrag mit unlesbarer Zeit → TOOL_FAILED', 'calendarEntries', 'termin_erstellen', tp, { id: 'x', text: 'Zahnarzt', date: 'x', isoDate: 'kaputt', location: '' }, 'TOOL_FAILED');
        await fall('42p Termin mit Wiederholung: richtige Uhrzeit, Tag verschoben → SUCCESS', 'calendarEntries', 'termin_erstellen', tp, T('Zahnarzt', '2026-11-09T10:00:00'), 'SUCCESS', null, { text: 'Trag jeden Montag Zahnarzt ein' });
        /* Google hat den Termin angenommen (echte ID), die App lädt die Liste erst danach neu */
        const googleMock = (A2, id, text) => { A2.sb.executeAction = async (a, t, ctx) => { A2.zaehler.exec++; A2.sb.window.jvLetzterGoogleTermin = { id, text }; ctx[Symbol.for('jv.googleTerminId')] = id; }; return A2; };
        q = await ruf(googleMock(umgebung(), 'g123', 'Zahnarzt'), 'termin_erstellen', tp);
        check('43a Google bestätigt (echte ID, richtiger Titel), Liste noch nicht neu geladen → SUCCESS mit googleBestaetigt', q.status === 'SUCCESS' && q.daten.googleBestaetigt === true && q.daten.passend === 0, JSON.stringify(q.daten).slice(0, 200));
        q = await ruf(googleMock(umgebung(), 'g123', 'Friseur'), 'termin_erstellen', tp);
        check('43b Google bestätigt einen ANDEREN Titel → TOOL_FAILED', q.status === 'TOOL_FAILED' && q.daten.googleBestaetigt === false);
        {
            const A2 = googleMock(umgebung(), 'g123', 'Zahnarzt'); const ctx = { counter: 0, cards: [], notes: [], panel: null }; ctx[Symbol.for('jv.googleTerminId')] = 'g123';
            q = await ruf(A2, 'termin_erstellen', tp, { kontext: { ctx } });
            check('43c alte Google-ID aus einem früheren Aufruf (nicht neu) zählt nicht → TOOL_FAILED', q.status === 'TOOL_FAILED' && q.daten.googleBestaetigt === false);
        }
        q = await ruf(googleMock(umgebung(), 'g123', 'Zahnarzt'), 'erinnerung_erstellen', rp);
        check('43d Google-Nachweis gilt nur für Termine, nicht für Erinnerungen → TOOL_FAILED', q.status === 'TOOL_FAILED');
        /* der echte Weg über Google (Attrappe als Google-Server) */
        {
            const gesendet = [];
            const Gg = umgebung(u => {
                if (/googleapis\.com\/calendar\/v3\/calendars\/primary\/events/.test(u)) { gesendet.push(u); return ant({ id: 'g-echt-1', items: [] }); }
                return null;
            });
            Gg.setze('accessToken', 'attrappe'); Gg.setze('googleTokenExpiresAt', Number.MAX_SAFE_INTEGER);
            q = await ruf(Gg, 'termin_erstellen', tp, { kontext: { text: 'Trag Zahnarzt ein' } });
            check('43e echter Google-Weg (Attrappe): SUCCESS durch die echte Google-ID, nur die Attrappe wurde angesprochen', q.status === 'SUCCESS' && (q.daten.googleBestaetigt === true || q.daten.passend >= 1) && gesendet.length >= 1 && Gg.aufrufe.every(u => u.startsWith('/') || /googleapis\.com/.test(u)), q.status + ' ' + JSON.stringify(q.daten).slice(0, 200) + ' ' + Gg.aufrufe.join());
        }
    }

    /* --- Punkt 3: Ortssuche und globaler Zustand --- */
    {
        const quellReg = lies('js/registry_faehigkeiten.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        check('44a die Registry-Datei benutzt window.jvLetzterText überhaupt nicht mehr (außerhalb von Kommentaren)', !/jvLetzterText/.test(quellReg));
        const P = umgebung(); P.sb.window.jvLetzterText = 'Original'; const log = [];
        P.sb.findNearbyRestaurants = async (q, ort) => { log.push(q + '|' + ort + '|' + P.sb.window.jvLetzterText); await new Promise(res => setImmediate(res)); log.push('ende ' + ort + '|' + P.sb.window.jvLetzterText); return { reply: 'Treffer in ' + ort, cards: [{}] }; };
        const [a, b] = await Promise.all([ruf(P, 'ortssuche', { suchbegriff: 'Pizza', ort: 'Reinbek' }), ruf(P, 'ortssuche', { suchbegriff: 'Sushi', ort: 'Hamburg' })]);
        check('44b zwei parallele Suchen: jede bekommt IHREN Ort und ihr Ergebnis, nichts vermischt', a.status === 'SUCCESS' && b.status === 'SUCCESS' && a.nachricht === 'Treffer in Reinbek' && b.nachricht === 'Treffer in Hamburg' && log.includes('Pizza|Reinbek|Original') && log.includes('Sushi|Hamburg|Original'), log.join(' / '));
        check('44c … und jvLetzterText ist danach unverändert', P.sb.window.jvLetzterText === 'Original' && log.every(x => /Original$/.test(x)));
        const V = umgebung(); V.sb.window.jvLetzterText = 'Original'; const orte = [];
        V.sb.findNearbyRestaurants = async (q, ort) => { await new Promise(res => setTimeout(res, 1)); await new Promise(res => setImmediate(res)); orte.push(ort); return { reply: 'in ' + ort, cards: [{}] }; };
        const alle = await Promise.all(['A-Stadt', 'B-Stadt', 'C-Stadt', 'D-Stadt', 'E-Stadt', ''].map(o => V.lassLaufen(() => V.sb.jvRegistry.fuehreAus('ortssuche', { suchbegriff: 'x', ort: o || undefined })).then(x => x.wert)));
        check('44d sechs parallele Suchen (auch ohne Ort): jede Antwort passt zu ihrer Anfrage', alle.map(x => x.nachricht).join() === 'in A-Stadt,in B-Stadt,in C-Stadt,in D-Stadt,in E-Stadt,in ' && V.sb.window.jvLetzterText === 'Original', alle.map(x => x.nachricht).join());
        const Fh = umgebung(); Fh.sb.window.jvLetzterText = 'Original';
        Fh.sb.findNearbyRestaurants = async (q, ort) => { await new Promise(res => setImmediate(res)); if (ort === 'Fehlerstadt') { const e = new Error('x'); e.userMessage = 'Kaputt.'; throw e; } return { reply: 'ok ' + ort, cards: [{}] }; };
        const [f1, f2, f3] = await Promise.all([ruf(Fh, 'ortssuche', { suchbegriff: 'x', ort: 'Fehlerstadt' }), ruf(Fh, 'ortssuche', { suchbegriff: 'x', ort: 'Gutstadt' }), ruf(Fh, 'ortssuche', { suchbegriff: 'x' })]);
        check('44e ein Fehler in einer Suche stört die parallelen nicht; jvLetzterText bleibt unverändert', f1.status === 'TOOL_FAILED' && f1.nachricht === 'Kaputt.' && f2.status === 'SUCCESS' && f2.nachricht === 'ok Gutstadt' && f3.status === 'SUCCESS' && Fh.sb.window.jvLetzterText === 'Original');
        const Us = umgebung(); Us.sb.window.jvLetzterText = 'Original';
        Us.sb.findNearbyRestaurants = async () => { await new Promise(res => setImmediate(res)); Us.sb.window.jvLetzterText = 'Neuer Satz des Nutzers'; await new Promise(res => setImmediate(res)); return { reply: 'x', cards: [{}] }; };
        await ruf(Us, 'ortssuche', { suchbegriff: 'x', ort: 'Reinbek' });
        check('44f spricht der Nutzer währenddessen (neuer Satz), bleibt sein Satz erhalten und wird NICHT mit dem alten überschrieben', Us.sb.window.jvLetzterText === 'Neuer Satz des Nutzers');
        const Ab = umgebung(); Ab.sb.window.jvLetzterText = 'Original';
        Ab.sb.findNearbyRestaurants = async () => { throw new Error('technisch'); };
        await ruf(Ab, 'ortssuche', { suchbegriff: 'x', ort: 'Reinbek' });
        check('44g Absturz der Suche (ohne Meldung): jvLetzterText unverändert', Ab.sb.window.jvLetzterText === 'Original');
        /* die ECHTE bestehende Funktion (nur Netz, Standort und Orte sind Attrappen) */
        const geo = [], plaetze = [];
        const Rl = umgebung(u => {
            if (/^\/api\/geocode/.test(u)) { geo.push(decodeURIComponent(u)); const ort = /q=([^,&]+)/.exec(decodeURIComponent(u)); return ant([{ lat: '53.6', lon: '10.2', class: 'place', display_name: (ort ? ort[1] : '') + ', Deutschland' }]); }
            if (/^\/api\/maps\?action=places/.test(u)) { plaetze.push(u); return ant({ places: [{ name: 'Roma', lat: 53.61, lon: 10.21, street: 'Hauptstr.', housenumber: '1', city: 'Reinbek', postcode: '21465' }] }); }
            return null;
        });
        Rl.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.0 });
        const zeiger = { lesen: 0, schreiben: 0 }; let wert = 'Original-Satz';
        Object.defineProperty(Rl.sb.window, 'jvLetzterText', { get() { zeiger.lesen++; return wert; }, set(v) { zeiger.schreiben++; wert = v; }, configurable: true });
        r = await ruf(Rl, 'ortssuche', { suchbegriff: 'Pizzeria', ort: 'Reinbek' });
        check('45a echte Funktion über die Registry: SUCCESS, der übergebene Ort wird gesucht (Geocoding von "Reinbek")', r.status === 'SUCCESS' && geo.some(x => /Reinbek/.test(x)) && /Roma/.test(r.nachricht) && r.daten.cards.length === 1, r.status + ' ' + geo.join() + ' ' + r.nachricht);
        check('45b … und dabei wurde window.jvLetzterText weder gelesen noch geschrieben', zeiger.lesen === 0 && zeiger.schreiben === 0 && wert === 'Original-Satz', JSON.stringify(zeiger));
        geo.length = 0; r = await ruf(Rl, 'ortssuche', { suchbegriff: 'Pizzeria' });
        check('45c ohne Ort: kein Geocoding, Suche um den Nutzer herum (kein Ort aus dem alten Satz)', r.status === 'SUCCESS' && geo.length === 0 && zeiger.lesen === 0 && zeiger.schreiben === 0);
        /* Der bisherige Weg der App (ein Wert, Ort steht im Satz) bleibt unverändert */
        wert = 'Gibt es in Reinbek eine Pizzeria'; zeiger.lesen = 0; geo.length = 0;
        const alt = await Rl.lassLaufen(() => Rl.sb.findNearbyRestaurants('Pizzeria'));
        check('45d bestehender Aufruf mit EINEM Wert liest den Ort weiter aus dem Satz (nearby.js unverändert im Verhalten)', !alt.haengt && zeiger.lesen >= 1 && geo.some(x => /Reinbek/.test(x)) && /Roma/.test(alt.wert.reply), geo.join() + ' lesen=' + zeiger.lesen);
        wert = 'Gibt es in Reinbek eine Pizzeria'; geo.length = 0;
        await Rl.lassLaufen(() => Rl.sb.findNearbyRestaurants('Pizzeria', ''));
        check('45e leerer Ort als zweiter Wert überstimmt den Satz (Suche um den Nutzer herum)', geo.length === 0);
    }

    /* --- Registry-Skripte sind die einzigen Neuzugänge im Code; die Dokumentation nennt sie --- */
    const arch = lies('ARCHITEKTUR.md'), karte = lies('LANDKARTE.md');
    check('31a ARCHITEKTUR.md beschreibt die Registry und nennt beide Dateien', /Capability Registry/.test(arch) && /js\/registry\.js/.test(arch) && /js\/registry_faehigkeiten\.js/.test(arch));
    check('31b LANDKARTE.md nennt beide Dateien', /registry\.js/.test(karte) && /registry_faehigkeiten\.js/.test(karte));

    console.log(`REGISTRY: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABSTURZ', e && e.stack || e); process.exit(2); });
