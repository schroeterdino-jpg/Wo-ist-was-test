/* ============================================================
   TESTS Jarvis Studio M1: Missions-Kern (js/mission_kern.js) und Testansicht (js/mission_ansicht.js). Start: node tests/mission_kern.js
   Läuft ohne Browser: der Kern wird in einer eigenen Umgebung mit steuerbarer Uhr und einem gemeinsamen Speicher geladen.
   Ein "Neustart" ist ein frisches Laden des Skripts auf demselben Speicher (genau wie ein Seiten-Neuladen im Browser).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info !== undefined ? '  →  ' + (typeof info === 'string' ? info : JSON.stringify(info)) : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KERN = lies('js/mission_kern.js'), ANSICHT = lies('js/mission_ansicht.js');
const S = 1000, MIN = 60 * S;

/* Umgebung: gemeinsamer Speicher, steuerbare Uhr */
function speicher(opt) {
    const m = new Map(); opt = opt || {};
    return {
        map: m, voll: false, sperre: false,
        getItem(k) { if (this.sperre) throw new Error('gesperrt'); return m.has(k) ? m.get(k) : null; },
        setItem(k, v) { if (this.voll) { const e = new Error('Quota'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); },
        removeItem(k) { m.delete(k); }
    };
}
const uhr = { t: Date.UTC(2026, 10, 6, 10, 0, 0) };
function lade(ls, dateien) {   // frisches Laden = Neustart der App
    const win = {};
    const FalschDate = function () { return new Date(uhr.t); }; FalschDate.now = () => uhr.t;
    const ctx = { window: win, localStorage: ls, Date: FalschDate, JSON, Math, Object, Array, String, Number, Promise, isFinite, console, setTimeout, clearTimeout, setInterval: () => 1, clearInterval: () => { },
        document: { getElementById: () => null, createElement: () => ({}), body: { appendChild() { } }, querySelectorAll: () => [] } };
    ctx.window = ctx; vm.createContext(ctx);
    (dateien || [KERN]).forEach(src => vm.runInContext(src, ctx));
    return ctx.jvMission || ctx.window.jvMission ? ctx : ctx;
}
const neuLs = () => speicher();
const K = c => c.jvMission;
function mission(k, extra) {
    const r = k.neu(Object.assign({ titel: 'Probe', auftrag: 'Auftrag', schritte: [{ titel: 'Eins' }, { titel: 'Zwei', abhaengigVon: ['s1'] }, { titel: 'Drei' }] }, extra || {}));
    return r;
}
const beleg = { art: 'test', text: 'Test-Beleg ok' };

(async function () {
    /* ---------- 1 Anlegen, Felder, Prüfung der Eingaben ---------- */
    {
        const k = K(lade(neuLs()));
        const r = mission(k);
        check('1a Mission wird angelegt', r.ok && r.mission.id && r.mission.status === 'geplant', r);
        const m = r.mission;
        check('1b Felder: ID, Titel, Auftrag, Status, Zeitstempel, Schritte', typeof m.id === 'string' && m.titel === 'Probe' && m.auftrag === 'Auftrag' && m.erstellt > 0 && m.schritte.length === 3 && m.schritte[1].abhaengigVon[0] === 's1');
        check('1c vor dem Start läuft keine Zeit', k.hole(m.id).zeiten.aktivMs === 0 && (uhr.t += 5 * MIN, k.hole(m.id).zeiten.aktivMs === 0 && k.hole(m.id).zeiten.pauseMs === 0));
        check('1d IDs sind eindeutig', new Set([1, 2, 3, 4, 5, 6, 7, 8].map(() => mission(k).mission.id)).size === 8);
        check('1e ohne Titel abgelehnt', !k.neu({ titel: ' ', auftrag: 'x' }).ok && !k.neu({ titel: 'x', auftrag: '' }).ok);
        check('1f Abhängigkeit nur auf frühere Schritte (kein Kreis)', !k.neu({ titel: 'x', auftrag: 'y', schritte: [{ titel: 'a', abhaengigVon: ['s2'] }, { titel: 'b' }] }).ok && !k.neu({ titel: 'x', auftrag: 'y', schritte: [{ titel: 'a', abhaengigVon: ['s1'] }] }).ok);
        check('1g Kosten-Eingaben müssen ganze Cent sein', !k.neu({ titel: 'x', auftrag: 'y', budgetCent: 1.5 }).ok && !k.neu({ titel: 'x', auftrag: 'y', budgetCent: -1 }).ok && !k.neu({ titel: 'x', auftrag: 'y', geschaetztCent: '5' }).ok);
        check('1h Werkzeugname im Schritt wird geprüft', !k.neu({ titel: 'x', auftrag: 'y', schritte: [{ titel: 'a', werkzeug: 'Böse Name!' }] }).ok);
        check('1i Höchstzahl der Missionen (50)', (() => { const k2 = K(lade(neuLs())); let n = 0; while (k2.neu({ titel: 't', auftrag: 'a' }).ok) n++; return n === 50; })());
        check('1j ohne Schritte kann man nicht starten', (() => { const id = k.neu({ titel: 't', auftrag: 'a' }).mission.id; const r2 = k.starten(id); return !r2.ok && r2.code === 'keineSchritte'; })());
    }

    /* ---------- 2 Zustandsautomat ---------- */
    {
        const k = K(lade(neuLs()));
        const gueltig = k.UEBERGAENGE;
        check('2a alle sieben Zustände vorhanden', JSON.stringify(k.STATUS) === JSON.stringify(['geplant', 'laeuft', 'wartet_freigabe', 'pausiert', 'abgeschlossen', 'fehlgeschlagen', 'abgebrochen']));
        check('2b Endzustände haben keine Übergänge', ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen'].every(s => gueltig[s].length === 0));
        const id = mission(k).mission.id;
        check('2c geplant → pausieren nicht erlaubt', !k.pausieren(id).ok && k.hole(id).status === 'geplant');
        check('2d geplant → fortsetzen/freigeben/abschließen nicht erlaubt', !k.fortsetzen(id).ok && !k.freigeben(id).ok && !k.abschliessen(id).ok);
        check('2e starten', k.starten(id).ok && k.hole(id).status === 'laeuft');
        check('2f doppeltes Starten abgelehnt', !k.starten(id).ok);
        check('2g läuft → pausiert → läuft', k.pausieren(id).ok && k.hole(id).status === 'pausiert' && k.fortsetzen(id).ok && k.hole(id).status === 'laeuft');
        check('2h läuft → wartet auf Freigabe (mit Grund) → läuft', !k.freigabeAnfordern(id, '').ok && k.freigabeAnfordern(id, 'Soll ich Seite X lesen?').ok && k.hole(id).status === 'wartet_freigabe' && k.freigeben(id).ok && k.hole(id).status === 'laeuft');
        check('2i pausiert → abschließen nicht erlaubt', (k.pausieren(id), !k.abschliessen(id).ok));
        k.fortsetzen(id);
        check('2j abschließen mit offenen Schritten abgelehnt', (() => { const r = k.abschliessen(id); return !r.ok && r.code === 'offeneSchritte'; })());
        for (const s of ['s1', 's2', 's3']) { k.schrittStarten(id, s); k.schrittErledigt(id, s, beleg); }
        check('2k abschließen, wenn alle Schritte Beleg haben', k.abschliessen(id).ok && k.hole(id).status === 'abgeschlossen' && k.hole(id).ende > 0);
        check('2l aus Endzustand führt nichts heraus', !k.starten(id).ok && !k.fortsetzen(id).ok && !k.pausieren(id).ok && !k.abbrechen(id, 'x').ok && !k.fehlschlagen(id, 'x').ok);
        const id2 = mission(k).mission.id; k.starten(id2);
        check('2m fehlschlagen braucht Grund, speichert ihn', !k.fehlschlagen(id2, '').ok && k.fehlschlagen(id2, 'Quelle nicht erreichbar').ok && k.hole(id2).status === 'fehlgeschlagen' && k.hole(id2).fehlergrund === 'Quelle nicht erreichbar');
        check('2n unbekannte Mission wird sauber abgelehnt', k.starten('gibt-es-nicht').code === 'unbekannt' && k.hole('x') === null);
    }

    /* ---------- 3 Echte Zeit: aktiv, Warten, Pause getrennt ---------- */
    {
        const ls = neuLs(), k = K(lade(ls));
        const id = mission(k).mission.id;
        k.starten(id); uhr.t += 90 * S;
        check('3a laufende Zeit wird aus Zeitstempeln gerechnet (90 s)', k.zeiten(id).aktivMs === 90 * S, k.zeiten(id));
        k.pausieren(id); uhr.t += 40 * S;
        let z = k.zeiten(id);
        check('3b Pause zählt nicht als aktiv', z.aktivMs === 90 * S && z.pauseMs === 40 * S, z);
        k.fortsetzen(id); uhr.t += 10 * S; k.freigabeAnfordern(id, 'Frage'); uhr.t += 25 * S;
        z = k.zeiten(id);
        check('3c Wartezeit getrennt von aktiver Zeit', z.aktivMs === 100 * S && z.wartezeitMs === 25 * S && z.pauseMs === 40 * S, z);
        k.freigeben(id); uhr.t += 5 * S; k.abbrechen(id, 'Ende');
        z = k.zeiten(id);
        check('3d Endzeit eingefroren: danach wächst nichts mehr', (uhr.t += 10 * MIN, JSON.stringify(k.zeiten(id)) === JSON.stringify(z)) && z.aktivMs === 105 * S, z);
        check('3e Summe aktiv+warten+pause = Gesamtdauer seit Start (ohne Zeit vor dem Start)', z.aktivMs + z.wartezeitMs + z.pauseMs + z.unterbrochenMs === 170 * S);
        /* Uhr rückwärts */
        const id2 = mission(k).mission.id; k.starten(id2); uhr.t -= 20 * S;
        check('3f rückwärts gestellte Uhr ergibt nie negative Zeit (Anzeige und gespeichert)', k.zeiten(id2).aktivMs === 0 && k.pausieren(id2).ok && k.hole(id2).zeit.aktivMs === 0 && k.hole(id2).uhrSprung === 1, k.hole(id2).zeit);
        uhr.t += 20 * S;
    }

    /* ---------- 4 Neustart ---------- */
    {
        const ls = neuLs();
        let c = lade(ls), k = K(c);
        const id = mission(k).mission.id;
        k.starten(id); k.schrittStarten(id, 's1');
        uhr.t += 100 * S; k.herzschlag();   // letztes Lebenszeichen nach 100 s (wird gespeichert)
        const hs = uhr.t;
        uhr.t += 60 * S;   // App war 60 s zu
        c = lade(ls); k = K(c);   // Neustart
        const m = k.hole(id), z = m.zeiten;
        check('4a nach Neustart ist die Mission pausiert, nicht still weiterlaufend', m.status === 'pausiert' && m.unterbrochen === true, m.status);
        check('4b aktive Zeit nur bis zum Lebenszeichen (100 s), Rest als Unterbrechung (60 s)', z.aktivMs === 100 * S && z.unterbrochenMs === 60 * S, z);
        check('4c der laufende Schritt ist "unterbrochen", nicht "erledigt"', m.schritte[0].status === 'unterbrochen' && !m.schritte[0].beleg);
        check('4d Lebenszeichen wirklich gespeichert', hs - 100 * S > 0 && m.herzschlag === hs, m.herzschlag);
        uhr.t += 5 * MIN;
        check('4e die Uhr läuft danach NICHT als aktiv (5 min später immer noch 100 s aktiv)', k.zeiten(id).aktivMs === 100 * S && k.zeiten(id).pauseMs === 5 * MIN);
        const n0 = k.hole(id).schritte[0].versuche;
        c = lade(ls); k = K(c);
        check('4f zweiter Neustart ändert nichts Weiteres (kein doppeltes Zählen)', k.hole(id).zeiten.aktivMs === 100 * S && k.hole(id).zeiten.unterbrochenMs === 60 * S && k.hole(id).status === 'pausiert', k.hole(id).zeiten);
        check('4g ausdrückliches Fortsetzen geht, der Schritt startet nicht von selbst', k.fortsetzen(id).ok && k.hole(id).schritte[0].status === 'unterbrochen' && k.hole(id).schritte[0].versuche === n0);
        check('4h unterbrochener Schritt kann neu gestartet werden (Versuch 2)', k.schrittStarten(id, 's1').ok && k.hole(id).schritte[0].versuche === n0 + 1);
        /* wartend/pausiert/geplant bleiben, was sie sind */
        const a = mission(k).mission.id, b = mission(k).mission.id, d = mission(k).mission.id;
        k.starten(b); k.freigabeAnfordern(b, 'F'); k.starten(d); k.pausieren(d);
        c = lade(ls); k = K(c);
        check('4i geplant/wartend/pausiert bleiben nach Neustart erhalten', k.hole(a).status === 'geplant' && k.hole(b).status === 'wartet_freigabe' && k.hole(d).status === 'pausiert' && k.hole(d).unterbrochen === false);
        /* Beleg bleibt */
        const e = mission(k).mission.id; k.starten(e); k.schrittStarten(e, 's1'); k.schrittErledigt(e, 's1', { art: 'quelle', text: 'https://beispiel.test/a', ref: 'a' });
        c = lade(ls); k = K(c);
        check('4j erledigter Schritt behält Beleg und Dauer nach Neustart', k.hole(e).schritte[0].status === 'erledigt' && k.hole(e).schritte[0].beleg.text === 'https://beispiel.test/a');
        check('4k mehrere Missionen überleben den Neustart unabhängig', k.liste().length >= 5);
    }

    /* ---------- 5 Schritte und Belege ---------- */
    {
        const k = K(lade(neuLs()));
        const id = mission(k).mission.id;
        check('5a Schritt starten nur in laufender Mission', !k.schrittStarten(id, 's1').ok);
        k.starten(id);
        check('5b Abhängigkeit: s2 erst nach s1', (() => { const r = k.schrittStarten(id, 's2'); return !r.ok && r.code === 'abhaengig'; })());
        check('5c nur ein Schritt gleichzeitig', k.schrittStarten(id, 's1').ok && k.schrittStarten(id, 's3').code === 'belegt');
        check('5d ohne Beleg nicht erledigt', !k.schrittErledigt(id, 's1').ok && !k.schrittErledigt(id, 's1', {}).ok && !k.schrittErledigt(id, 's1', { art: 'test', text: '' }).ok && !k.schrittErledigt(id, 's1', { art: 'erfunden', text: 'abc' }).ok && k.hole(id).schritte[0].status === 'laeuft');
        check('5e mit Beleg erledigt, Beleg mit Zeit gespeichert', k.schrittErledigt(id, 's1', { art: 'pruefung', text: 'Zahlen nachgerechnet' }).ok && k.hole(id).schritte[0].beleg.art === 'pruefung' && k.hole(id).schritte[0].beleg.zeit > 0);
        check('5f erledigten Schritt nicht nochmal erledigen/starten', !k.schrittErledigt(id, 's1', beleg).ok && !k.schrittStarten(id, 's1').ok);
        check('5g Schrittfehler braucht Grund und gilt nicht als erledigt', k.schrittStarten(id, 's2').ok && !k.schrittFehler(id, 's2', '').ok && k.schrittFehler(id, 's2', 'Seite leer').ok && k.hole(id).schritte[1].status === 'fehlgeschlagen' && !k.hole(id).schritte[1].beleg);
        check('5h Überspringen nur mit Grund; verhindert aber kein Abschließen ohne Beleg-Täuschung', !k.schrittUeberspringen(id, 's2', '').ok && k.schrittUeberspringen(id, 's2', 'nicht nötig').ok);
        k.schrittStarten(id, 's3'); k.schrittErledigt(id, 's3', beleg);
        check('5i Abschluss, wenn alle erledigt oder bewusst übersprungen', k.abschliessen(id).ok);
        const id2 = mission(k).mission.id; k.starten(id2); k.schrittStarten(id2, 's1');
        k.pausieren(id2);
        check('5j Pause hält den laufenden Schritt an (unterbrochen) und schließt seine Zeit', k.hole(id2).schritte[0].status === 'unterbrochen');
        check('5k Schritt in pausierter Mission nicht erledigbar', !k.schrittErledigt(id2, 's1', beleg).ok);
    }

    /* ---------- 6 Kosten ---------- */
    {
        const k = K(lade(neuLs()));
        const id = mission(k, { budgetCent: 50, geschaetztCent: 30 }).mission.id;
        let a = k.hole(id).kostenAnsicht;
        check('6a Schätzung und Budget getrennt von gemeldeten Kosten; gemeldet startet bei 0', a.geschaetztCent === 30 && a.budgetCent === 50 && a.gemeldetCent === 0 && a.unbekannt === 0);
        const id0 = mission(k).mission.id;
        a = k.hole(id0).kostenAnsicht;
        check('6b ohne Angaben: keine Schätzung (null, nicht 0), kein Budget', a.geschaetztCent === null && a.budgetCent === null);
        k.starten(id);
        check('6c Kosten melden', k.kostenMelden(id, { cent: 20, quelle: 'groq' }).ok && k.hole(id).kostenAnsicht.gemeldetCent === 20);
        check('6d ungültige Beträge abgelehnt (Kommazahl, negativ, Text, undefined)', [1.5, -3, '5', undefined, NaN, Infinity].every(c => !k.kostenMelden(id, { cent: c, quelle: 'x' }).ok) && k.hole(id).kostenAnsicht.gemeldetCent === 20);
        check('6e ohne Quelle abgelehnt', !k.kostenMelden(id, { cent: 1, quelle: '' }).ok);
        check('6f unbekannte Kosten (null) werden gezählt, ohne Betrag zu erfinden', k.kostenMelden(id, { cent: null, quelle: 'groq' }).ok && k.hole(id).kostenAnsicht.unbekannt === 1 && k.hole(id).kostenAnsicht.gemeldetCent === 20);
        check('6g mit unbekanntem Posten ist das Budget "nicht prüfbar"', k.hole(id).kostenAnsicht.budgetPruefbar === false);
        check('6h darfAusgeben: unbekannte/nicht prüfbare Kosten werden bei Budget nicht erlaubt', !k.darfAusgeben(id, null).erlaubt && !k.darfAusgeben(id, 1).erlaubt);
        const id2 = mission(k, { budgetCent: 50 }).mission.id; k.starten(id2);
        check('6i darfAusgeben: im Budget ja, darüber nein', k.darfAusgeben(id2, 50).erlaubt && !k.darfAusgeben(id2, 51).erlaubt && !k.darfAusgeben(id2, 'x').erlaubt);
        k.kostenMelden(id2, { cent: 40, quelle: 'a' });
        check('6j Rest- und Grenzrechnung (40 von 50 → 10 übrig, 10 noch erlaubt, 11 nicht)', k.hole(id2).kostenAnsicht.rest === 10 && k.darfAusgeben(id2, 10).erlaubt && !k.darfAusgeben(id2, 11).erlaubt);
        const r = k.kostenMelden(id2, { cent: 15, quelle: 'b' });
        check('6k Budget überschritten: Mission hält sofort an (wartet auf Freigabe)', r.ok && r.angehalten === true && k.hole(id2).status === 'wartet_freigabe' && k.hole(id2).kostenAnsicht.budgetUeberschritten);
        check('6l Freigabe ohne höheres Budget bleibt abgelehnt, Fortsetzen nicht möglich', !k.freigeben(id2).ok && k.hole(id2).status === 'wartet_freigabe');
        check('6m mit höherem Budget (Freigabe) läuft es weiter', k.freigeben(id2, { budgetCent: 100 }).ok && k.hole(id2).status === 'laeuft' && k.hole(id2).kostenAnsicht.rest === 45);
        check('6n Budget schon überschritten: Start/Fortsetzen verweigert', (() => { const x = mission(k).mission.id; k.starten(x); k.kostenMelden(x, { cent: 100, quelle: 'q' }); k.budgetSetzen(x, 10); k.pausieren(x); const f = k.fortsetzen(x); return !f.ok && f.code === 'budget'; })());
        check('6o Schätzung ändern/löschen, ungültige abgelehnt', k.kostenSchaetzung(id, 99).ok && k.hole(id).kostenAnsicht.geschaetztCent === 99 && k.kostenSchaetzung(id, null).ok && k.hole(id).kostenAnsicht.geschaetztCent === null && !k.kostenSchaetzung(id, -1).ok);
        check('6p Kosten beendeter Mission nicht mehr änderbar', (() => { const x = mission(k).mission.id; k.abbrechen(x, 'x'); return !k.kostenMelden(x, { cent: 1, quelle: 'q' }).ok && !k.budgetSetzen(x, 5).ok; })());
        check('6q ohne Budget: unbegrenzt erlaubt, auch ohne Schätzung', (() => { const x = mission(k).mission.id; k.starten(x); return k.darfAusgeben(x, 999999).erlaubt; })());
        const ls = neuLs(); let c = lade(ls), k3 = K(c); const y = mission(k3, { budgetCent: 77 }).mission.id; k3.starten(y); k3.kostenMelden(y, { cent: 7, quelle: 'q' }); k3.kostenMelden(y, { cent: null, quelle: 'q' });
        uhr.t += MIN; c = lade(ls); k3 = K(c);
        check('6r Kosten überleben den Neustart (Budget, gemeldet, unbekannt)', (() => { const a2 = k3.hole(y).kostenAnsicht; return a2.budgetCent === 77 && a2.gemeldetCent === 7 && a2.unbekannt === 1; })());
    }

    /* ---------- 7 Speicher: Fehler, Beschädigung, Wiederherstellung ---------- */
    {
        const ls = neuLs(); let c = lade(ls), k = K(c);
        check('7a leerer Start', k.status().ladeStatus === 'leer' && k.liste().length === 0);
        const id = mission(k).mission.id;
        check('7b gespeichert unter eigenem Schlüssel jv_missionen_v1, ohne fremde Schlüssel anzufassen', ls.map.has('jv_missionen_v1') && [...ls.map.keys()].every(x => /^jv_missionen_v1/.test(x)));
        /* Speicher voll */
        ls.voll = true;
        const r = mission(k);
        check('7c Speicher voll: Fehler wird gemeldet, nicht verschwiegen; Mission lebt im Arbeitsspeicher weiter', r.ok && r.gespeichert === false && /Speicher/.test(r.warnung) && /Speicher/.test(k.status().speicherFehler) && k.liste().length === 2);
        check('7d Statuswechsel bei vollem Speicher meldet Warnung', (() => { const x = k.starten(id); return x.ok && x.gespeichert === false && !!x.warnung; })());
        ls.voll = false; k.pausieren(id);
        check('7e danach wieder speicherbar, Fehler weg', k.status().speicherFehler === '' && k.liste().length === 2);
        c = lade(ls); k = K(c);
        check('7f nach Neustart ist der zuletzt gespeicherte Stand da', k.liste().length === 2 && k.hole(id).status === 'pausiert');
        /* Speicher gesperrt (getItem wirft) */
        ls.sperre = true; let c2 = null; try { c2 = lade(ls); } catch (e) { c2 = null; }
        check('7g gesperrter Speicher bringt die App nicht zum Absturz', c2 && K(c2).liste().length === 0 && K(c2).status().ladeStatus === 'leer');
        ls.sperre = false;
        /* kaputtes JSON mit guter Sicherung */
        const gut = ls.map.get('jv_missionen_v1');
        ls.map.set('jv_missionen_v1_bak', gut);
        ls.map.set('jv_missionen_v1', '{kaputt');
        c = lade(ls); k = K(c);
        check('7h kaputte Daten: aus Sicherung wiederhergestellt, Original als _defekt gesichert', k.status().ladeStatus === 'gesichert' && k.liste().length === 2 && ls.map.get('jv_missionen_v1_defekt') === '{kaputt');
        /* kaputt ohne Sicherung */
        const ls2 = neuLs(); ls2.map.set('jv_missionen_v1', 'zufall');
        c = lade(ls2); k = K(c);
        check('7i kaputt ohne Sicherung: leer gestartet, Daten gesichert, Warnung sichtbar', k.status().ladeStatus === 'defekt' && k.liste().length === 0 && ls2.map.get('jv_missionen_v1_defekt') === 'zufall');
        check('7j danach normal weiterarbeiten', mission(k).ok && K(lade(ls2)).liste().length === 1);
        /* veränderte Daten (Prüfsumme) */
        const ls3 = neuLs(); let k3 = K(lade(ls3)); mission(k3); const o = JSON.parse(ls3.map.get('jv_missionen_v1')); o.daten = o.daten.replace('Probe', 'Fremd'); ls3.map.set('jv_missionen_v1', JSON.stringify(o));
        k3 = K(lade(ls3));
        check('7k Prüfsumme erkennt Veränderung', k3.status().ladeStatus !== 'ok' && k3.liste().length === 0);
        /* einzelne ungültige Mission verwerfen, gültige behalten */
        const ls4 = neuLs(); let k4 = K(lade(ls4)); mission(k4); mission(k4, { titel: 'Zweite' });
        const o4 = JSON.parse(ls4.map.get('jv_missionen_v1')), d4 = JSON.parse(o4.daten);
        d4.missionen[0].status = 'gibtsnicht';
        const daten = JSON.stringify(d4);
        // gültige Prüfsumme neu berechnen über den Kern: Schreibweg nachbauen
        const k4b = K(lade(ls4)); void k4b;
        const ls5 = neuLs(); let k5 = K(lade(ls5)); const a5 = mission(k5).mission.id; mission(k5, { titel: 'Zweite' });
        const roh = JSON.parse(ls5.map.get('jv_missionen_v1')); const dd = JSON.parse(roh.daten); dd.missionen[0].status = 'gibtsnicht';
        // Prüfsumme (FNV-1a) wie im Kern
        const fnv = s => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; } return h.toString(16); };
        roh.daten = JSON.stringify(dd); roh.summe = fnv(roh.daten); ls5.map.set('jv_missionen_v1', JSON.stringify(roh));
        k5 = K(lade(ls5));
        check('7l eine ungültige Mission wird verworfen und gezählt, die andere bleibt', k5.liste().length === 1 && k5.liste()[0].titel === 'Zweite' && k5.status().verworfen === 1 && a5 !== k5.liste()[0].id);
        /* "erledigt" ohne Beleg im Speicher ist ungültig */
        const ls6 = neuLs(); let k6 = K(lade(ls6)); const i6 = mission(k6).mission.id; k6.starten(i6); k6.schrittStarten(i6, 's1'); k6.schrittErledigt(i6, 's1', beleg);
        const r6 = JSON.parse(ls6.map.get('jv_missionen_v1')); const d6 = JSON.parse(r6.daten); d6.missionen[0].schritte[0].beleg = null; r6.daten = JSON.stringify(d6); r6.summe = fnv(r6.daten); ls6.map.set('jv_missionen_v1', JSON.stringify(r6));
        k6 = K(lade(ls6));
        check('7m Schritt "erledigt" ohne Beleg im Speicher wird nicht geglaubt', k6.liste().length === 0 && k6.status().verworfen === 1);
        /* negative Zeit im Speicher */
        const r7 = JSON.parse(ls6.map.get('jv_missionen_v1')); void r7;
        const ls8 = neuLs(); let k8 = K(lade(ls8)); mission(k8);
        const r8 = JSON.parse(ls8.map.get('jv_missionen_v1')); const d8 = JSON.parse(r8.daten); d8.missionen[0].zeit.aktivMs = -5; r8.daten = JSON.stringify(d8); r8.summe = fnv(r8.daten); ls8.map.set('jv_missionen_v1', JSON.stringify(r8));
        check('7n negative Zeit im Speicher wird verworfen', K(lade(ls8)).liste().length === 0);
        /* Zukunft: andere Version */
        const ls9 = neuLs(); ls9.map.set('jv_missionen_v1', JSON.stringify({ v: 99, rev: 1, summe: 'x', daten: '{}' }));
        check('7o fremde Datenversion wird nicht überschrieben, sondern gesichert', K(lade(ls9)).status().ladeStatus === 'defekt' && ls9.map.has('jv_missionen_v1_defekt'));
        /* Ausgabe ist Kopie */
        const ls10 = neuLs(), k10 = K(lade(ls10)); const i10 = mission(k10).mission.id; const kopie = k10.hole(i10); kopie.titel = 'Hack'; kopie.status = 'abgeschlossen';
        check('7p Änderungen an der gelieferten Kopie verändern die Mission nicht', k10.hole(i10).titel === 'Probe' && k10.hole(i10).status === 'geplant');
    }

    /* ---------- 8 Abbruch, Entfernen, mehrere Missionen ---------- */
    {
        const k = K(lade(neuLs()));
        const sta = {};
        const mk = s => { const id = mission(k).mission.id; if (s !== 'geplant') k.starten(id); if (s === 'wartet_freigabe') k.freigabeAnfordern(id, 'F'); if (s === 'pausiert') k.pausieren(id); return id; };
        ['geplant', 'laeuft', 'wartet_freigabe', 'pausiert'].forEach(s => { const id = mk(s); sta[s] = k.abbrechen(id, 'Nutzer'); check('8a Abbrechen aus „' + s + '“ geht', sta[s].ok && k.hole(id).status === 'abgebrochen' && k.hole(id).abbruchgrund === 'Nutzer'); });
        const id = mk('laeuft'); k.schrittStarten(id, 's1'); uhr.t += 30 * S; k.abbrechen(id, 'Stopp');
        check('8b Abbruch stoppt den laufenden Schritt (nicht mehr "läuft") und hält die Zeit an', k.hole(id).schritte[0].status === 'unterbrochen' && (uhr.t += MIN, k.zeiten(id).aktivMs === 30 * S) && k.hole(id).schritte[0].dauerMs === 30 * S);
        check('8c nach Abbruch keine Schritte, keine Kosten, keine Freigabe', !k.schrittStarten(id, 's1').ok && !k.kostenMelden(id, { cent: 1, quelle: 'q' }).ok && !k.freigeben(id).ok);
        check('8d Entfernen nur beendeter Missionen', (() => { const l = mk('laeuft'); return !k.entfernen(l).ok && k.entfernen(id).ok && k.hole(id) === null; })());
        const a = mk('laeuft'), b = mk('laeuft'); k.pausieren(a); uhr.t += 10 * S;
        check('8e mehrere Missionen laufen unabhängig (a pausiert, b aktiv)', k.hole(a).status === 'pausiert' && k.hole(b).status === 'laeuft' && k.zeiten(b).aktivMs >= 10 * S);
        check('8f Fehlschlag einer Mission berührt die andere nicht', (() => { k.fehlschlagen(b, 'kaputt'); return k.hole(a).status === 'pausiert' && k.hole(b).status === 'fehlgeschlagen'; })());
    }

    /* ---------- 9 Werkzeug-Schnittstelle (nur Rahmen) und keine doppelte Ausführung ---------- */
    {
        const k = K(lade(neuLs()));
        check('9a in M1 ist kein Werkzeug registriert', k.werkzeuge.liste().length === 0);
        check('9b ungültige Werkzeuge abgelehnt', !k.werkzeuge.registriere({ name: 'X!', art: 'code', ausfuehren() { } }).ok && !k.werkzeuge.registriere({ name: 'abc', art: 'unbekannt', ausfuehren() { } }).ok && !k.werkzeuge.registriere({ name: 'abc', art: 'code' }).ok);
        let aufrufe = 0, loslassen = null;
        check('9c Werkzeug registrieren (Recherche), nicht doppelt', k.werkzeuge.registriere({ name: 'probe_recherche', art: 'recherche', beschreibung: 't', ausfuehren: async () => { aufrufe++; return { ok: true, beleg: { art: 'quelle', text: 'Quelle gelesen' }, kostenCent: 2 }; } }).ok && !k.werkzeuge.registriere({ name: 'probe_recherche', art: 'recherche', ausfuehren() { } }).ok);
        k.werkzeuge.registriere({ name: 'probe_ohnebeleg', art: 'dokument', ausfuehren: async () => ({ ok: true }) });
        k.werkzeuge.registriere({ name: 'probe_absturz', art: 'code', ausfuehren: async () => { throw new Error('boom'); } });
        k.werkzeuge.registriere({ name: 'probe_langsam', art: 'apk', ausfuehren: () => new Promise(res => { loslassen = () => res({ ok: true, beleg: { art: 'datei', text: 'fertig' }, kostenCent: 0 }); }) });
        k.werkzeuge.registriere({ name: 'probe_teuer', art: 'sonstiges', ausfuehren: async () => ({ ok: true, beleg: { art: 'test', text: 'x' }, kostenCent: 500 }) });
        const mw = (w, extra) => { const id = k.neu(Object.assign({ titel: 'W', auftrag: 'a', schritte: [{ titel: 'S', werkzeug: w }] }, extra || {})).mission.id; k.starten(id); return id; };
        let id = mw('probe_recherche'); let r = await k.fuehreSchrittAus(id, 's1');
        check('9d Werkzeug liefert Beleg + Kosten → Schritt erledigt, Kosten verbucht', r.ok && k.hole(id).schritte[0].status === 'erledigt' && k.hole(id).schritte[0].beleg.text === 'Quelle gelesen' && k.hole(id).kostenAnsicht.gemeldetCent === 2 && aufrufe === 1);
        id = mw('probe_ohnebeleg'); r = await k.fuehreSchrittAus(id, 's1');
        check('9e Werkzeug ohne Beleg: Schritt FEHLGESCHLAGEN, nie als Erfolg', k.hole(id).schritte[0].status === 'fehlgeschlagen' && !k.hole(id).schritte[0].beleg, k.hole(id).schritte[0]);
        check('9e2 Werkzeug ohne Kostenangabe → kein erfundener Betrag', k.hole(id).kostenAnsicht.gemeldetCent === 0 && k.hole(id).kostenAnsicht.unbekannt === 0);
        id = mw('probe_absturz'); r = await k.fuehreSchrittAus(id, 's1');
        check('9f abgestürztes Werkzeug: Schritt fehlgeschlagen mit Grund, App läuft weiter', k.hole(id).schritte[0].status === 'fehlgeschlagen' && /abgestürzt/.test(k.hole(id).schritte[0].fehler));
        id = mw('probe_langsam'); const p1 = k.fuehreSchrittAus(id, 's1'); const p2 = await k.fuehreSchrittAus(id, 's1');
        check('9g keine doppelte Ausführung desselben Schritts', !p2.ok && p2.code === 'doppelt', p2);
        loslassen(); await p1;
        check('9h erster Lauf schließt normal ab', k.hole(id).schritte[0].status === 'erledigt');
        id = mw('probe_langsam'); const p3 = k.fuehreSchrittAus(id, 's1'); k.pausieren(id); loslassen(); const r3 = await p3;
        check('9i Mission währenddessen pausiert: Ergebnis wird NICHT übernommen', !r3.ok && r3.code === 'nichtMehrLaufend' && k.hole(id).schritte[0].status !== 'erledigt', k.hole(id).schritte[0].status);
        id = mw('probe_teuer', { budgetCent: 100 }); r = await k.fuehreSchrittAus(id, 's1', { erwarteteKostenCent: 500 });
        check('9j Budget wird vor der Ausführung geprüft (nicht ausgeführt)', !r.ok && r.code === 'budget' && k.hole(id).schritte[0].status === 'offen');
        id = mw('probe_teuer', { budgetCent: 100 }); r = await k.fuehreSchrittAus(id, 's1', { erwarteteKostenCent: 10 });
        check('9k tatsächlich höhere Kosten als erwartet: Mission hält an, Freigabe nötig', k.hole(id).status === 'wartet_freigabe' && k.hole(id).kostenAnsicht.gemeldetCent === 500, k.hole(id).status);
        id = mw(null); const r9 = await k.fuehreSchrittAus(id, 's1');
        check('9l Schritt ohne Werkzeug wird nicht ausgeführt', !r9.ok && r9.code === 'keinWerkzeug');
        id = mw('nicht_da'); const r10 = await k.fuehreSchrittAus(id, 's1');
        check('9m unregistriertes Werkzeug wird nicht ausgeführt', !r10.ok && r10.code === 'keinWerkzeug');
    }

    /* ---------- 10 Benachrichtigung, Lebenszeichen ---------- */
    {
        const ls = neuLs(), k = K(lade(ls)); const ev = []; k.an((a, id) => ev.push(a));
        const id = mission(k).mission.id; k.starten(id);
        check('10a Hörer bekommen neu/geändert', ev.indexOf('neu') >= 0 && ev.indexOf('geaendert') >= 0);
        check('10b Hörer, der wirft, stört nicht', (() => { k.an(() => { throw new Error('x'); }); return k.pausieren(id).ok; })());
        const c = lade(ls), k2 = K(c); k2.fortsetzen(id); const r0 = JSON.parse(ls.map.get('jv_missionen_v1')).rev;
        uhr.t += 3 * S; k2.herzschlag(); uhr.t += 20 * S; k2.herzschlag();
        check('10c Lebenszeichen wird höchstens alle 10 s gespeichert', JSON.parse(ls.map.get('jv_missionen_v1')).rev <= r0 + 2);
        check('10d Lebenszeichen ohne laufende Mission: nichts zu tun', (() => { const k3 = K(lade(neuLs())); return k3.herzschlag() === false; })());
    }

    /* ---------- 11 Ansicht und Einbindung (statisch + Unterfunktionen) ---------- */
    {
        const idx = lies('index.html');
        check('11a beide Skripte in index.html, Kern vor Ansicht, mit Stempel', /mission_kern\.js\?v=[0-9a-f]{8}"/.test(idx) && /mission_ansicht\.js\?v=[0-9a-f]{8}"/.test(idx) && idx.indexOf('mission_kern.js') < idx.indexOf('mission_ansicht.js'));
        const c = lade(neuLs(), [KERN, ANSICHT]); const a = c.jvMissionAnsicht;
        check('11b Ansicht schützt Texte (kein HTML aus Missionsdaten)', a._esc('<img src=x onerror=alert(1)>"\'&') === '&lt;img src=x onerror=alert(1)&gt;&quot;&#39;&amp;');
        check('11c Dauer wird lesbar angezeigt', a._dauer(0) === '0:00' && a._dauer(61 * S) === '1:01' && a._dauer(3725 * S) === '1:02:05' && a._hms(3725 * S) === '01:02:05');
        check('11d kein Sprachbefehl registriert, Befehlsreihenfolge unberührt', !/jvCommands/.test(ANSICHT) && !/jvCommands/.test(KERN));
        check('11e Menüeintrag über jvChain "buildMenuPanel"', /jvChain\.use\('buildMenuPanel', 'mission'/.test(ANSICHT) && /<b class="block text-\[#49d7ff\] text-sm">Missionszentrale<\/b>/.test(ANSICHT));
        check('11f die Ansicht schreibt Missionsdaten nur escaped (Titel, Auftrag, Beleg, Schritt, Grund)', /esc\(m\.titel\)/.test(ANSICHT) && /esc\(m\.auftrag\)/.test(ANSICHT) && /esc\(s\.beleg\.text\)/.test(ANSICHT) && /esc\(s\.titel\)/.test(ANSICHT));
    }

    /* ---------- 12 Sicherheitsgrenzen von M1 ---------- */
    {
        check('12a Kern: kein Netz, kein fetch, kein eval, keine Server-Aufrufe, kein APP_SECRET', !/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function|apiFetch|app_secret|APP_SECRET|WebSocket/.test(KERN));
        check('12b Ansicht: ebenfalls kein Netz, kein eval', !/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function|apiFetch|app_secret|APP_SECRET/.test(ANSICHT));
        check('12c Missionsdaten nicht im Geräte-Abgleich', !/jv_missionen/.test(lies('js/sync.js')) && !/jv_missionen/.test(lies('api/sync.js')));
        check('12d kein Eingriff in Android/APK und keine neue API-Datei', fs.readdirSync(path.join(ROOT, 'api')).filter(f => /\.js$/.test(f)).length === 11 && !/mission/i.test(fs.readdirSync(path.join(ROOT, 'api')).join(' ')));
        const sw = lies('sw.js');
        check('12e Service-Worker/Index kennen die Dateien, ohne dass Bestehendes entfällt (Skriptliste enthält weiter assistant.js)', /assistant\.js/.test(lies('index.html')) && sw.length > 0);
        check('12f Kern fasst keine fremden Speicherschlüssel an', (KERN.match(/localStorage\.(get|set)Item\(\s*'[^']+'/g) || []).length === 0 && !/getPersistentData|setPersistentData|sessionStorage/.test(KERN));
        check('12g Chef-KI unverändert zuständig: Kern ruft kein jvChef/jvFrage/speak auf', !/jvChef|jvFrage|speak\(|callGroq|jvTippen/.test(KERN));
    }

    console.log('MISSION M1: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(1); });
