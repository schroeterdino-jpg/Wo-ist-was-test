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
    check('20b genau die fünf Fähigkeiten sind angemeldet', A.sb.jvRegistry.namen().join() === FUENF.join(), A.sb.jvRegistry.namen().join());
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
    const andere = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !/^registry(_faehigkeiten)?\.js$/.test(f)).filter(f => /jvRegistry/.test(lies('js/' + f)));
    check('22a keine andere App-Datei benutzt die Registry', andere.length === 0, andere.join(', '));
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
        const O = umgebung(); let gesehen = null, ortWaehrend = null;
        O.sb.window.jvLetzterText = 'Ursprünglicher Satz';
        O.sb.findNearbyRestaurants = async (q) => { gesehen = q; ortWaehrend = O.sb.window.jvLetzterText; return { reply: 'In Reinbek gibt es zum Beispiel Roma.', cards: [{ title: 'Roma' }] }; };
        r = await ruf(O, 'ortssuche', { suchbegriff: 'Pizzeria', ort: 'Reinbek' });
        check('28a Ortssuche: SUCCESS, Suchbegriff wird an die bestehende Funktion gegeben, Daten = Antwort + Karten', r.status === 'SUCCESS' && gesehen === 'Pizzeria' && r.daten.cards.length === 1 && /Roma/.test(r.nachricht), JSON.stringify(r));
        check('28b Ortssuche: während des Aufrufs gilt der gewünschte Ort, danach ist der ursprüngliche Satz wieder da', ortWaehrend === 'in Reinbek' && O.sb.window.jvLetzterText === 'Ursprünglicher Satz', String(ortWaehrend));
        await ruf(O, 'ortssuche', { suchbegriff: 'Pizzeria' });
        check('28c Ortssuche ohne Ort: kein alter Ort aus dem letzten Satz wird benutzt', ortWaehrend === '' && O.sb.window.jvLetzterText === 'Ursprünglicher Satz');
        O.sb.findNearbyRestaurants = async () => ({ reply: 'In der Nähe habe ich leider nichts gefunden.', cards: [] });
        r = await ruf(O, 'ortssuche', { suchbegriff: 'Sushi' });
        check('28d Ortssuche ohne Treffer: NO_RESULTS, Alternative "websuche"', r.status === 'NO_RESULTS' && r.ausgefuehrt === true && r.alternativen.join() === 'websuche' && /nichts gefunden/.test(r.nachricht), JSON.stringify(r));
        O.sb.findNearbyRestaurants = async () => { ortWaehrend = O.sb.window.jvLetzterText; const e = new Error('x'); e.userMessage = 'Deinen Standort konnte ich gerade nicht ermitteln. Ist der Standortzugriff erlaubt?'; throw e; };
        r = await ruf(O, 'ortssuche', { suchbegriff: 'Sushi', ort: 'Hamburg' });
        check('28e Ortssuche, Standort fehlt: TOOL_FAILED mit verständlicher Meldung; Satz wird auch nach dem Fehler wiederhergestellt', r.status === 'TOOL_FAILED' && /Standort/.test(r.nachricht) && O.sb.window.jvLetzterText === 'Ursprünglicher Satz');
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
        check('30a sechste Fähigkeit läuft neben den fünf, Fallback auf eine bestehende wird erkannt', reg.ok && r.status === 'SUCCESS' && F.sb.jvRegistry.namen().length === 6 && F.sb.jvRegistry.pruefeVerweise().length === 0);
        check('30b die fünf Namen lassen sich nicht überschreiben', F.sb.jvRegistry.registriere(frisch({ name: 'ortssuche' })).ok === false && F.sb.jvRegistry.hole('ortssuche').verbindung.funktion === 'findNearbyRestaurants');
    }

    /* --- Registry-Skripte sind die einzigen Neuzugänge im Code; die Dokumentation nennt sie --- */
    const arch = lies('ARCHITEKTUR.md'), karte = lies('LANDKARTE.md');
    check('31a ARCHITEKTUR.md beschreibt die Registry und nennt beide Dateien', /Capability Registry/.test(arch) && /js\/registry\.js/.test(arch) && /js\/registry_faehigkeiten\.js/.test(arch));
    check('31b LANDKARTE.md nennt beide Dateien', /registry\.js/.test(karte) && /registry_faehigkeiten\.js/.test(karte));

    console.log(`REGISTRY: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABSTURZ', e && e.stack || e); process.exit(2); });
