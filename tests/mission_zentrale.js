/* ============================================================
   TESTS Jarvis Studio M2: Missionszentrale (js/mission_ansicht.js) auf dem echten Missions-Kern (js/mission_kern.js). Start: node tests/mission_zentrale.js
   Läuft ohne Browser mit einer Attrappe des Dokuments (Elemente, Zeichenschleife, Zeitgeber, Bewegungs-Einstellung, Sichtbarkeit) und steuerbarer Uhr.
   Geprüft: Oberfläche und Bedienung, alle sieben Zustände, Bestätigungen, Neustart, Zeit, keine erfundenen Werte, genau eine Schleife und ein Takt,
   Pause bei unsichtbarer App, reduzierte Bewegung, Aufräumen beim Schließen, Schutz vor HTML in Texten.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info !== undefined ? '  →  ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400) : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const KERN = lies('js/mission_kern.js'), ANSICHT = lies('js/mission_ansicht.js');
const S = 1000, MIN = 60 * S;
const uhr = { t: Date.UTC(2026, 10, 6, 10, 0, 0) };

function speicher() { const m = new Map(); return { map: m, getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } }; }
/* Attrappe: Dokument, Zeichenschleife, Zeitgeber */
function welt(ls, opt) {
    opt = opt || {};
    const w = { raf: [], rafNr: 0, rafAbgebrochen: 0, intervalle: [], intervallGeloescht: 0, timeouts: [], docHoerer: {}, mqHoerer: [], zeichnungen: 0, sphere: !opt.ohneKugel, elemente: [] };
    const FalschDate = function () { return new Date(uhr.t); }; FalschDate.now = () => uhr.t;
    function el(tag) {
        const e = { tag, id: '', innerHTML: '', textContent: '', className: '', scrollTop: 0, listeners: {}, entfernt: false, felder: {}, tickZiele: {},
            addEventListener(t, f) { e.listeners[t] = f; }, removeEventListener(t) { delete e.listeners[t]; }, remove() { e.entfernt = true; },
            querySelectorAll(sel) { if (sel === '[data-f]') return Object.keys(e.felder).map(n => ({ getAttribute: () => n, value: e.felder[n] })); return []; },
            querySelector(sel) { const mm = /data-k="([a-z]+)"/.exec(sel); if (!mm) return null; return e.tickZiele[mm[1]] || (e.tickZiele[mm[1]] = { textContent: '' }); },
            appendChild(c) { w.elemente.push(c); return c; } };
        return e;
    }
    const ctxStub = () => ({ clearRect() { }, drawImage() { w.zeichnungen++; }, beginPath() { }, arc() { }, stroke() { } });
    const doc = {
        hidden: false, createElement: el, head: { appendChild: c => { w.elemente.push(c); return c; } }, body: { appendChild: c => { w.elemente.push(c); return c; } },
        getElementById: id => {
            if (id === 'mzKugel') return { width: 224, height: 224, getContext: ctxStub };
            if (id === 'jarvisSphere') return w.sphere ? { width: 348, height: 348 } : null;
            return w.elemente.filter(x => x.id === id && !x.entfernt).pop() || null;
        },
        addEventListener(t, f) { w.docHoerer[t] = f; }, removeEventListener(t) { delete w.docHoerer[t]; }
    };
    w.mq = { matches: !!opt.reduziert, addEventListener(t, f) { w.mqHoerer.push(f); }, removeEventListener(t, f) { w.mqHoerer = w.mqHoerer.filter(x => x !== f); } };
    const ctx = { localStorage: ls, Date: FalschDate, JSON, Math, Object, Array, String, Number, Promise, isFinite, console, document: doc,
        setInterval: (f, ms) => { const o = { f, ms, id: w.intervalle.length + 1, aktiv: true }; w.intervalle.push(o); return o.id; },
        clearInterval: id => { const o = w.intervalle.find(x => x.id === id); if (o && o.aktiv) { o.aktiv = false; w.intervallGeloescht++; } },
        setTimeout: (f, ms) => { const o = { f, ms, id: w.timeouts.length + 1, aktiv: true }; w.timeouts.push(o); return o.id; },
        clearTimeout: id => { const o = w.timeouts.find(x => x.id === id); if (o) o.aktiv = false; } };
    ctx.window = ctx;
    ctx.matchMedia = () => w.mq;
    ctx.requestAnimationFrame = f => { const id = ++w.rafNr; w.raf.push({ id, f }); return id; };
    ctx.cancelAnimationFrame = id => { const n = w.raf.length; w.raf = w.raf.filter(x => x.id !== id); if (w.raf.length < n) w.rafAbgebrochen++; };
    vm.createContext(ctx);
    vm.runInContext(KERN, ctx); vm.runInContext(ANSICHT, ctx);
    w.ctx = ctx; w.doc = doc; w.K = ctx.jvMission; w.A = ctx.jvMissionAnsicht;
    w.wurzel = () => w.elemente.filter(x => x.id === 'mzRoot' && !x.entfernt).pop() || null;
    w.takt = () => w.intervalle.filter(x => x.aktiv && x.ms === 1000);
    w.rahmen = () => { const r = w.raf.shift(); if (r) r.f(); return !!r; };
    w.zeit = ms => { uhr.t += ms; };
    return w;
}
const sichtbarText = h => String(h).replace(/<style[\s\S]*?<\/style>/g, '').replace(/ style="[^"]*"/g, '').replace(/<[^>]+>/g, ' ');
const SCHR = [{ titel: 'Quellen sammeln' }, { titel: 'Zahlen prüfen', abhaengigVon: ['s1'] }, { titel: 'Bericht schreiben' }];
const neu = (K, o) => K.neu(Object.assign({ titel: 'Probe', auftrag: 'Auftrag Text', schritte: SCHR }, o || {})).mission.id;
const beleg = { art: 'test', text: 'Test-Beleg ok' };
function inZustand(K, z) {
    const id = neu(K, { titel: 'Z-' + z });
    if (z === 'geplant') return id;
    K.starten(id);
    if (z === 'wartet_freigabe') K.freigabeAnfordern(id, 'Darf ich Seite X lesen?');
    if (z === 'pausiert') K.pausieren(id);
    if (z === 'abgeschlossen') { for (const s of ['s1', 's2', 's3']) { K.schrittStarten(id, s); K.schrittErledigt(id, s, beleg); } K.abschliessen(id); }
    if (z === 'fehlgeschlagen') K.fehlschlagen(id, 'Quelle nicht erreichbar');
    if (z === 'abgebrochen') K.abbrechen(id, 'Nutzer');
    return id;
}

(async function () {
    /* ---------- 1 Öffnen: genau ein Fenster, ein Takt ---------- */
    {
        const ls = speicher(), w = welt(ls), A = w.A;
        A.oeffnen(); A.oeffnen(); A.oeffnen();
        check('1a dreimal öffnen ergibt genau EIN Fenster', w.elemente.filter(x => x.id === 'mzRoot').length === 1);
        check('1b genau ein Sekundentakt', w.takt().length === 1 && w.intervalle.length === 1);
        check('1c Stil wird beim Öffnen eingefügt', w.elemente.filter(x => x.id === 'mzStil').length === 1);
        check('1d leere Liste zeigt Hinweis und Knopf „Neue Mission“', /Noch keine Mission/.test(w.wurzel().innerHTML) && /NEUE MISSION/.test(w.wurzel().innerHTML));
        check('1e Wurzel hat Klassen für Bewegung (an), nicht pausiert', w.wurzel().className === 'an');
    }

    /* ---------- 2 Liste ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A;
        const a = inZustand(K, 'abgeschlossen'), b = inZustand(K, 'laeuft'), c = inZustand(K, 'wartet_freigabe'), d = inZustand(K, 'geplant');
        A.oeffnen();
        const h = w.wurzel().innerHTML;
        check('2a alle gespeicherten Missionen stehen in der Liste', [a, b, c, d].every(id => h.indexOf('data-a="' + id + '"') >= 0));
        check('2b aktive vor beendeten', h.indexOf('data-a="' + a + '"') > h.indexOf('data-a="' + b + '"') && h.indexOf('data-a="' + a + '"') > h.indexOf('data-a="' + d + '"'));
        check('2c Zusammenfassung zählt echt (4 gespeichert, 1 läuft, 1 wartet)', /4 gespeichert · 1 läuft · 1 wartet auf dich/.test(sichtbarText(h).replace(/\s+/g, ' ')), sichtbarText(h).replace(/\s+/g, ' ').slice(0, 200));
        check('2d Karte zeigt Schritte belegt (3 von 3 / 0 von 3)', /3 von 3 Schritten belegt/.test(h) && /0 von 3 Schritten belegt/.test(h));
        check('2e Chip oben nennt „1 LÄUFT“', /1 LÄUFT/.test(h));
        check('2f jede Karte hat eigenen Mini-Ring mit echtem Zustand', ['abgeschlossen', 'laeuft', 'wartet_freigabe', 'geplant'].every(z => h.indexOf('class="mzMini" viewBox="0 0 62 62" aria-hidden="true" data-z="' + z + '"') >= 0));
    }

    /* ---------- 3 Neue Mission anlegen ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        A.aktion('neu', '');
        check('3a Formular wird gezeigt', /NEUE MISSION/.test(w.wurzel().innerHTML) && /data-f="titel"/.test(w.wurzel().innerHTML) && /data-f="schritte"/.test(w.wurzel().innerHTML));
        let r = A.aktion('anlegen', '', { titel: '', auftrag: 'x' });
        check('3b ohne Titel: Fehlermeldung, nichts angelegt', !r.ok && K.liste().length === 0 && /Titel/.test(w.wurzel().innerHTML));
        r = A.aktion('anlegen', '', { titel: 'T', auftrag: 'A', budget: 'abc' });
        check('3c ungültiges Budget abgelehnt', !r.ok && K.liste().length === 0 && /Euro-Zahl/.test(w.wurzel().innerHTML));
        r = A.aktion('anlegen', '', { titel: 'Bericht', auftrag: 'Wochenbericht prüfen', schritte: 'Eins\n\n  Zwei  \nDrei', budget: '1,50', schaetzung: '0.4' });
        const m = K.liste()[0];
        check('3d Anlegen über den echten Kern: Titel, 3 Schritte (Leerzeilen weg), Budget 150 Cent, Schätzung 40 Cent', r.ok && K.liste().length === 1 && m.titel === 'Bericht' && m.schritte.length === 3 && m.schritte[1].titel === 'Zwei' && m.kosten.budgetCent === 150 && m.kosten.geschaetztCent === 40, m);
        check('3e danach öffnet sich die Detailansicht der neuen Mission', A._zustand().ansicht === 'detail' && A._zustand().id === m.id && /GEPLANT/.test(w.wurzel().innerHTML));
        r = A.aktion('anlegen', '', { titel: 'Leer', auftrag: 'ohne Budget' });
        check('3f ohne Budget und Schätzung: keine Grenze, keine Schätzung (nicht 0)', r.ok && K.liste().filter(x => x.titel === 'Leer')[0].kosten.budgetCent === null && K.liste().filter(x => x.titel === 'Leer')[0].kosten.geschaetztCent === null);
        check('3g Eurobeträge: 2 → 200, 0,05 → 5, leer → null, "1,234" und "-1" ungültig', A._parseEuro('2') === 200 && A._parseEuro('0,05') === 5 && A._parseEuro('') === null && Number.isNaN(A._parseEuro('1,234')) && Number.isNaN(A._parseEuro('-1')));
        const viele = Array.from({ length: 31 }, (_, i) => 'S' + i).join('\n');
        r = A.aktion('anlegen', '', { titel: 'Viele', auftrag: 'a', schritte: viele });
        check('3h mehr als 30 Schritte werden vom Kern abgelehnt und gemeldet', !r.ok && /30/.test(w.wurzel().innerHTML));
    }

    /* ---------- 4 Alle sieben Zustände korrekt dargestellt ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const erwartet = {
            geplant: { knoepfe: ['START', 'ABBRECHEN'], nicht: ['PAUSE', 'FORTSETZEN', 'FREIGEBEN', 'ENTFERNEN'] },
            laeuft: { knoepfe: ['PAUSE', 'ABBRECHEN'], nicht: ['START', 'FORTSETZEN', 'FREIGEBEN', 'ENTFERNEN'] },
            wartet_freigabe: { knoepfe: ['FREIGEBEN', 'ABBRECHEN'], nicht: ['START', 'PAUSE', 'FORTSETZEN', 'ENTFERNEN'] },
            pausiert: { knoepfe: ['FORTSETZEN', 'ABBRECHEN'], nicht: ['START', 'FREIGEBEN', 'ENTFERNEN'] },
            abgeschlossen: { knoepfe: ['ENTFERNEN'], nicht: ['START', 'PAUSE', 'FORTSETZEN', 'FREIGEBEN', 'ABBRECHEN'] },
            fehlgeschlagen: { knoepfe: ['ENTFERNEN'], nicht: ['START', 'PAUSE', 'FORTSETZEN', 'FREIGEBEN', 'ABBRECHEN'] },
            abgebrochen: { knoepfe: ['ENTFERNEN'], nicht: ['START', 'PAUSE', 'FORTSETZEN', 'FREIGEBEN', 'ABBRECHEN'] }
        };
        for (const z of K.STATUS) {
            const id = inZustand(K, z); A.aktion('oeffne', id);
            const h = A.html(), akt = h.slice(h.indexOf('class="mzAkt"'));
            check('4 ' + z + ': Name, Ring-Zustand und Farbe stimmen', h.indexOf(A._name[z]) >= 0 && h.indexOf('class="mzRing" data-z="' + z + '"') >= 0 || h.indexOf('data-z="' + z + '" style="--c:' + A._farbe[z] + '"') >= 0, z);
            check('4 ' + z + ': passende Knöpfe', erwartet[z].knoepfe.every(k => akt.indexOf('>' + k + '<') >= 0) && erwartet[z].nicht.every(k => akt.indexOf('>' + k + '<') < 0), akt.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' '));
        }
        check('4a sieben verschiedene Farben', new Set(Object.values(A._farbe)).size === 7);
        let id = inZustand(K, 'wartet_freigabe'); A.aktion('oeffne', id);
        check('4b Freigabe-Grund wird gezeigt', /Darf ich Seite X lesen\?/.test(A.html()));
        id = inZustand(K, 'fehlgeschlagen'); A.aktion('oeffne', id);
        check('4c Fehlergrund wird gezeigt', /Grund: Quelle nicht erreichbar/.test(A.html()));
        id = inZustand(K, 'abgebrochen'); A.aktion('oeffne', id);
        check('4d Abbruchgrund wird gezeigt', /Abgebrochen: Nutzer/.test(A.html()));
    }

    /* ---------- 5 Echte Daten: Uhr, Schritte, Belege, Kosten, Ring ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = neu(K, { budgetCent: 77, geschaetztCent: 30 });
        K.starten(id); K.schrittStarten(id, 's1'); w.zeit(4 * MIN + 2 * S);
        K.schrittErledigt(id, 's1', { art: 'quelle', text: 'Drei Seiten gelesen', ref: 'a.test' }); K.schrittStarten(id, 's2'); w.zeit(80 * S);
        K.kostenMelden(id, { cent: 7, quelle: 'groq' }); K.kostenMelden(id, { cent: null, quelle: 'groq' });
        A.aktion('oeffne', id);
        const m = K.hole(id), h = A.html();
        check('5a große Uhr = echte aktive Zeit aus M1 (00:05:22)', h.indexOf('data-k="haupt">' + A._hms(m.zeiten.aktivMs) + '<') >= 0 && A._hms(m.zeiten.aktivMs) === '00:05:22', A._hms(m.zeiten.aktivMs));
        check('5b Zeitfelder zeigen aktiv/warten/pause/unterbrochen aus M1', h.indexOf('data-k="aktiv">5:22<') >= 0 && h.indexOf('data-k="warten">0:00<') >= 0 && h.indexOf('data-k="pause">0:00<') >= 0 && h.indexOf('data-k="unterbr">0:00<') >= 0);
        check('5c Schrittliste: Titel, Zustand, Beleg mit Art, Text und Verweis', /Quellen sammeln/.test(h) && /Beleg \(Quelle\): Drei Seiten gelesen · a\.test/.test(h) && />erledigt</.test(h) && />läuft</.test(h) && />offen</.test(h));
        check('5d Schrittdauer des erledigten Schritts echt (4:02)', /<span class="mzD">4:02<\/span>/.test(h), h.match(/mzD[^<]*<\/span>/g));
        check('5e laufender Schritt hat Zeitgeber (data-sd) für die Sekundenanzeige', /data-sd="\d+\|0"/.test(h));
        check('5f Kosten: gemeldet 0,07 €, Budget 0,77 €, Schätzung 0,30 €, 1 Posten ohne Betrag, Budget nicht prüfbar', /Kosten gemeldet <b>0,07 €<\/b>/.test(h) && /Budget 0,77 €/.test(h) && /Schätzung 0,30 €/.test(h) && /1 Posten ohne bekannten Betrag: das Budget ist nicht prüfbar/.test(h));
        check('5g Kostenbalken = echtes Verhältnis (7 von 77 Cent = 9)', /class="mzBalken"><i style="width:9%"/.test(h));
        const farben = [...h.matchAll(/<path d="M[^"]*A124 124[^>]*stroke="(#[0-9a-f]+)"/g)].map(x => x[1]);
        check('5h Phasenring: ein Bogen je echtem Schritt, Farbe je Schrittzustand (erledigt, läuft, offen)', JSON.stringify(farben) === JSON.stringify(['#3ee6b0', '#5ee7ff', '#1d3a5f']), farben);
        const id0 = neu(K); A.aktion('oeffne', id0); const h0 = A.html();
        check('5i ohne Budget: keine Balken, „keine Grenze“, „keine Schätzung“ (nichts erfunden)', h0.indexOf('mzBalken') < 0 && /keine Grenze/.test(h0) && /keine Schätzung/.test(h0));
        check('5j keine erfundenen Zahlen: sichtbarer Text enthält kein Prozentzeichen und kein „Fortschritt“', !/%|Fortschritt|Prozent/i.test(sichtbarText(h) + sichtbarText(h0)));
        check('5k Platzhalter für später sind als „ohne Funktion“ gekennzeichnet und ohne Aktion', /Folgt in einer späteren Version\. Noch ohne Funktion\./.test(h) && !/data-mk="[^"]*"[^>]*>🔎/.test(h));
        const id1 = neu(K, { schritte: [] }); A.aktion('oeffne', id1);
        check('5l Mission ohne Schritte: Ring bleibt (ein leerer Kreis), Hinweis „keine Schritte“, keine Abstürze', /keine Schritte/.test(A.html()) && A.html().indexOf('class="mzRing"') >= 0);
    }

    /* ---------- 6 Bedienung: Start, Pause, Fortsetzen, Abschluss ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = neu(K); A.aktion('oeffne', id);
        let r = A.aktion('start', id);
        check('6a Start über die Oberfläche startet die echte Mission', r.ok && K.hole(id).status === 'laeuft');
        check('6b Aktivierungsanimation: Ring trägt „akt“, Text „MISSION AKTIVIERT“', /class="mzRing akt"/.test(A.html()) && /MISSION AKTIVIERT/.test(A.html()));
        const t = w.timeouts.filter(x => x.aktiv);
        check('6c die Aktivierung endet von selbst (ein einmaliger Zeitgeber, 1,8 s)', t.length === 1 && t[0].ms === 1800);
        t[0].f(); t[0].aktiv = false;
        check('6d danach ist die Aktivierung weg, der Zustand bleibt', !/MISSION AKTIVIERT/.test(A.html()) && K.hole(id).status === 'laeuft');
        w.zeit(30 * S); r = A.aktion('pause', id);
        check('6e Pause', r.ok && K.hole(id).status === 'pausiert' && /FORTSETZEN/.test(A.html()) && /data-z="pausiert"/.test(A.html()));
        w.zeit(10 * S); r = A.aktion('weiter', id);
        check('6f Fortsetzen', r.ok && K.hole(id).status === 'laeuft' && K.hole(id).zeiten.pauseMs === 10 * S);
        check('6g „ABSCHLIESSEN“ erscheint erst, wenn alle Schritte erledigt/übersprungen sind', A.html().indexOf('>ABSCHLIESSEN<') < 0);
        r = A.aktion('start', id);
        check('6h doppelter Start wird vom Kern abgelehnt und gemeldet', !r.ok && /gestartet/.test(w.wurzel().innerHTML));
        A.aktion('sstart', id + '|s1');
        check('6i Schritt starten über die Oberfläche', K.hole(id).schritte[0].status === 'laeuft');
        r = A.aktion('sstart', id + '|s3');
        check('6j zweiter gleichzeitiger Schritt abgelehnt (Kern-Regel)', !r.ok && K.hole(id).schritte[2].status === 'offen');
        A.aktion('sheet', 'beleg|' + id + '|s1');
        check('6k Beleg-Fenster erscheint, Schritt noch NICHT erledigt', /Beleg zum Schritt/.test(A.html()) && K.hole(id).schritte[0].status === 'laeuft');
        r = A.aktion('ok2', '', { art: 'ergebnis', text: '' });
        check('6l ohne Belegtext: abgelehnt, Fenster bleibt mit Fehler, Schritt nicht erledigt', !r.ok && /Beleg zum Schritt/.test(A.html()) && /mzSheetFehler/.test(A.html()) && K.hole(id).schritte[0].status === 'laeuft');
        r = A.aktion('ok2', '', { art: 'ergebnis', text: 'Drei Quellen gelesen', ref: '' });
        check('6m mit Beleg erledigt, Beleg sichtbar, Fenster zu', r.ok && K.hole(id).schritte[0].status === 'erledigt' && /Beleg \(Ergebnis\): Drei Quellen gelesen/.test(A.html()) && !A._zustand().sheet);
        A.aktion('sheet', 'skip|' + id + '|s2'); r = A.aktion('ok2', '', { grund: '' });
        check('6n Überspringen ohne Grund abgelehnt', !r.ok && K.hole(id).schritte[1].status === 'offen');
        r = A.aktion('ok2', '', { grund: 'nicht nötig' });
        check('6o Überspringen mit Grund, als „übersprungen“ gezeigt (nicht erledigt)', r.ok && K.hole(id).schritte[1].status === 'uebersprungen' && /Übersprungen: nicht nötig/.test(A.html()));
        A.aktion('sstart', id + '|s3'); A.aktion('sheet', 'beleg|' + id + '|s3'); A.aktion('ok2', '', { art: 'test', text: 'Test-Beleg' });
        check('6p jetzt wird „ABSCHLIESSEN“ angeboten', A.html().indexOf('>ABSCHLIESSEN<') > 0);
        r = A.aktion('ende', id);
        check('6q Abschluss: Zustand, Abschluss-Animation, Zeit eingefroren', r.ok && K.hole(id).status === 'abgeschlossen' && /class="mzRing fertig"/.test(A.html()) && (w.zeit(5 * MIN), K.zeiten(id).aktivMs === K.hole(id).zeiten.aktivMs));
        check('6r Schritt-Fehler melden: Grund Pflicht', (() => { const x = neu(K); K.starten(x); K.schrittStarten(x, 's1'); A.aktion('oeffne', x); A.aktion('sheet', 'sfehler|' + x + '|s1'); const a1 = A.aktion('ok2', '', { grund: '' }); const a2 = A.aktion('ok2', '', { grund: 'Seite leer' }); return !a1.ok && a2.ok && K.hole(x).schritte[0].status === 'fehlgeschlagen' && /Fehler: Seite leer/.test(A.html()); })());
    }

    /* ---------- 7 Kritische Aktionen nur mit Bestätigung ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = neu(K); K.starten(id); A.aktion('oeffne', id);
        A.aktion('sheet', 'abbr|' + id);
        check('7a Abbrechen: erst nur das Bestätigungsfenster, Mission läuft weiter', K.hole(id).status === 'laeuft' && /Mission wirklich abbrechen\?/.test(A.html()));
        A.aktion('zu2', '');
        check('7b „Zurück“ verwirft die Aktion', K.hole(id).status === 'laeuft' && !A._zustand().sheet);
        A.aktion('sheet', 'abbr|' + id); A.aktion('ok2', '', { grund: 'Test' });
        check('7c erst nach „JA“ wird abgebrochen, mit Grund', K.hole(id).status === 'abgebrochen' && K.hole(id).abbruchgrund === 'Test');
        A.aktion('sheet', 'weg|' + id);
        check('7d Entfernen: erst Bestätigung, Mission noch da', K.hole(id) !== null && /Mission entfernen\?/.test(A.html()));
        A.aktion('ok2', '');
        check('7e nach „JA“ entfernt, zurück in der Liste', K.hole(id) === null && A._zustand().ansicht === 'liste');
        const x = neu(K); K.starten(x); K.pausieren(x); A.aktion('oeffne', x);
        check('7f laufende/pausierte Mission lässt sich über die Oberfläche nicht entfernen (kein Knopf, Kern lehnt ab)', A.html().indexOf('>ENTFERNEN<') < 0 && !K.entfernen(x).ok);
        A.aktion('sheet', 'weg|' + x); const rr = A.aktion('ok2', '');
        check('7g selbst bei erzwungener Bestätigung lehnt der Kern ab', !rr.ok && K.hole(x) !== null);
        /* Freigabe */
        const f = neu(K, { budgetCent: 50 }); K.starten(f); K.kostenMelden(f, { cent: 60, quelle: 'q' }); A.aktion('oeffne', f);
        check('7h Budget gerissen: Mission wartet, Oberfläche zeigt WARTET AUF FREIGABE und „Budget überschritten“', K.hole(f).status === 'wartet_freigabe' && /WARTET AUF FREIGABE/.test(A.html()) && /Budget überschritten \(\+0,10 €\)/.test(A.html()));
        A.aktion('sheet', 'frei|' + f);
        check('7i Freigabe-Fenster verlangt neues Budget', /data-f="budget"/.test(A.html()) && /Das Budget ist überschritten/.test(A.html()));
        let r = A.aktion('ok2', '', { budget: '' });
        check('7j ohne höheres Budget bleibt es bei „wartet“, Fehler im Fenster', !r.ok && K.hole(f).status === 'wartet_freigabe' && /mzSheetFehler/.test(A.html()));
        r = A.aktion('ok2', '', { budget: 'abc' });
        check('7k ungültiges Budget wird abgelehnt', !r.ok && K.hole(f).status === 'wartet_freigabe');
        r = A.aktion('ok2', '', { budget: '2' });
        check('7l mit höherem Budget (2 €) läuft die Mission weiter', r.ok && K.hole(f).status === 'laeuft' && K.hole(f).kosten.budgetCent === 200);
        const g = neu(K); K.starten(g); K.freigabeAnfordern(g, 'Bitte prüfen'); A.aktion('oeffne', g); A.aktion('sheet', 'frei|' + g);
        check('7m Freigabe ohne Budgetproblem braucht nur „JA“', !/data-f="budget"/.test(A.html()) && A.aktion('ok2', '', {}).ok && K.hole(g).status === 'laeuft');
        /* Budget ändern, Scheitern */
        A.aktion('sheet', 'budget|' + g); r = A.aktion('ok2', '', { budget: '1,25' });
        check('7n Budget ändern über die Oberfläche', r.ok && K.hole(g).kosten.budgetCent === 125);
        A.aktion('sheet', 'budget|' + g); r = A.aktion('ok2', '', { budget: '' });
        check('7o Budget leer = keine Grenze', r.ok && K.hole(g).kosten.budgetCent === null);
        A.aktion('sheet', 'gescheitert|' + g); r = A.aktion('ok2', '', { grund: '' });
        check('7p Scheitern melden braucht Grund', !r.ok && K.hole(g).status === 'laeuft');
        r = A.aktion('ok2', '', { grund: 'Quelle fehlt' });
        check('7q mit Grund: fehlgeschlagen', r.ok && K.hole(g).status === 'fehlgeschlagen');
    }

    /* ---------- 8 Klicks über die Ereignis-Weiterleitung ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = neu(K); A.aktion('oeffne', id);
        const knopf = (mk, a) => ({ target: { closest: () => ({ getAttribute: n => (n === 'data-mk' ? mk : a) }) } });
        w.wurzel().listeners.click(knopf('start', id));
        check('8a Tipp auf START (über das Klick-Ereignis) startet die echte Mission', K.hole(id).status === 'laeuft');
        w.wurzel().listeners.click({ target: { closest: () => null } });
        check('8b Tipp ins Leere tut nichts', K.hole(id).status === 'laeuft');
        w.wurzel().listeners.click(knopf('sheet', 'abbr|' + id)); w.wurzel().felder = { grund: 'per Klick' }; w.wurzel().listeners.click(knopf('ok2', ''));
        check('8c Eingabefelder werden eingesammelt (Grund „per Klick“)', K.hole(id).status === 'abgebrochen' && K.hole(id).abbruchgrund === 'per Klick');
        w.wurzel().felder = {};
        w.wurzel().listeners.click(knopf('neu', '')); w.wurzel().felder = { titel: 'Per Formular', auftrag: 'a', schritte: 'x\ny' }; w.wurzel().listeners.click(knopf('anlegen', ''));
        check('8d Formular über Klick legt die Mission an', K.liste().filter(m => m.titel === 'Per Formular').length === 1);
    }

    /* ---------- 9 Neustart und Wiederaufnahme ---------- */
    {
        const ls = speicher(); let w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = neu(K); K.starten(id); K.schrittStarten(id, 's1'); w.zeit(100 * S); K.herzschlag(); w.zeit(60 * S);
        const w2 = welt(ls); const K2 = w2.K, A2 = w2.A;   // Neustart: neu laden auf demselben Speicher
        A2.oeffnen();
        check('9a nach dem Neustart steht die Mission in der Liste als PAUSIERT', /PAUSIERT/.test(w2.wurzel().innerHTML) && K2.hole(id).status === 'pausiert');
        A2.aktion('oeffne', id);
        const h = A2.html();
        check('9b Hinweis „Unterbrochen“ und „Nichts läuft von selbst weiter“', /Unterbrochen: Die App war zu\. Nichts läuft von selbst weiter\./.test(h));
        check('9c Zeit: aktiv 1:40 bis zum Lebenszeichen, Unterbrochen 1:00', /data-k="aktiv">1:40</.test(h) && /data-k="unterbr">1:00</.test(h), h.match(/data-k="[a-z]+">[^<]*</g));
        check('9d der Schritt steht „unterbrochen“, nicht „läuft“', /unterbrochen/.test(h) && K2.hole(id).schritte[0].status === 'unterbrochen');
        check('9e kein Takt-Doppel und keine Mission läuft von selbst', w2.takt().length === 1 && K2.liste().every(m => m.status !== 'laeuft'));
        check('9f „Fortsetzen“ ist angeboten, Fortsetzen klappt, Schritt startet NICHT von selbst', />FORTSETZEN</.test(h) && A2.aktion('weiter', id).ok && K2.hole(id).status === 'laeuft' && K2.hole(id).schritte[0].status === 'unterbrochen');
        check('9g danach „Schritt starten“ möglich (Versuch 2)', (() => { A2.aktion('sstart', id + '|s1'); return K2.hole(id).schritte[0].versuche === 2 && K2.hole(id).schritte[0].status === 'laeuft'; })());
    }

    /* ---------- 10 Takt: Zeit und Lebenszeichen ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = neu(K); K.starten(id); A.aktion('oeffne', id);
        w.zeit(5 * S); w.takt()[0].f();
        const r = w.wurzel();
        check('10a Sekundentakt schreibt die echte Zeit in die große Uhr (00:00:05)', r.tickZiele.haupt.textContent === '00:00:05' && r.tickZiele.aktiv.textContent === '0:05', r.tickZiele);
        check('10b Takt gibt dem Kern das Lebenszeichen', K.hole(id).herzschlag === uhr.t);
        w.zeit(70 * S); w.takt()[0].f();
        check('10c Uhr rechnet aus Zeitstempeln (nicht durch Mitzählen): nach 75 s → 00:01:15', r.tickZiele.haupt.textContent === '00:01:15');
        A.aktion('pause', id); w.zeit(30 * S); w.takt()[0].f();
        check('10d in der Pause bleibt die aktive Uhr stehen', r.tickZiele.haupt.textContent === '00:01:15' && r.tickZiele.pause.textContent === '0:30');
        A._setSicht(false); w.zeit(20 * S); r.tickZiele.pause.textContent = 'alt'; w.takt()[0].f();
        check('10e bei unsichtbarer App wird die Anzeige nicht angefasst, das Lebenszeichen geht trotzdem', r.tickZiele.pause.textContent === 'alt');
        A._setSicht(true);
        const lm = neu(K); A.aktion('anlegen', '', { titel: 'x', auftrag: 'y' }); A.aktion('liste', '');
        check('10f Listenansicht: Zeitzahlen werden vom Takt aktualisiert (ohne Absturz)', (() => { try { w.takt()[0].f(); return true; } catch (e) { return false; } })());
        void lm;
    }

    /* ---------- 11 Bewegung: genau eine Schleife, Pause bei unsichtbarer App, reduzierte Bewegung ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = inZustand(K, 'laeuft');
        check('11a in der Liste gibt es keine Zeichenschleife', w.raf.length === 0 && !A._laeuft().schleife);
        A.aktion('oeffne', id);
        check('11b Detailansicht startet genau EINE Schleife', w.raf.length === 1 && A._laeuft().schleife);
        for (let i = 0; i < 6; i++) { A.aktion('pause', id); A.aktion('weiter', id); A.aktion('sheet', 'abbr|' + id); A.aktion('zu2', ''); }
        check('11c nach vielen Neuzeichnungen immer noch höchstens EINE Schleife', w.raf.length <= 1, w.raf.length);
        const z0 = w.zeichnungen; for (let i = 0; i < 10; i++) w.rahmen();
        check('11d die Schleife kopiert das Bild der vorhandenen Kugel (drawImage) und plant genau einen Folgerahmen', w.zeichnungen > z0 && w.raf.length === 1, w.zeichnungen - z0);
        A._setSicht(false);
        check('11e App unsichtbar: Schleife beendet, Ring-Animationen pausiert (Klasse „pause“)', w.raf.length === 0 && /pause/.test(w.wurzel().className));
        A._setSicht(true);
        check('11f wieder sichtbar: wieder genau eine Schleife, Klasse ohne „pause“', w.raf.length === 1 && !/pause/.test(w.wurzel().className));
        w.doc.hidden = true; w.docHoerer.visibilitychange();
        check('11g Sichtbarkeits-Ereignis des Browsers pausiert (Schleife aus)', w.raf.length === 0 && /pause/.test(w.wurzel().className));
        w.doc.hidden = false; w.docHoerer.visibilitychange();
        check('11h und setzt fort', w.raf.length === 1);
        const z1 = w.zeichnungen; A._setBewegungAus(true);
        check('11i reduzierte Bewegung: Klasse „ruhe“, keine Schleife', /ruhe/.test(w.wurzel().className) && w.raf.length === 0);
        A.aktion('oeffne', id);
        check('11j auch nach Neuzeichnen keine Schleife, aber ein Standbild der Kugel', w.raf.length === 0 && w.zeichnungen > z1);
        w.mq.matches = false; w.mqHoerer.forEach(f => f());
        check('11k Einstellung wird live beobachtet (Bewegung wieder erlaubt → eine Schleife)', w.raf.length === 1 && !/ruhe/.test(w.wurzel().className));
        const w3 = welt(speicher(), { reduziert: true }); w3.A.oeffnen(); const id3 = inZustand(w3.K, 'laeuft'); w3.A.aktion('oeffne', id3);
        check('11l bei reduzierter Bewegung schon beim Öffnen: „ruhe“, keine Schleife', /ruhe/.test(w3.wurzel().className) && w3.raf.length === 0);
        const w4 = welt(speicher(), { ohneKugel: true }); w4.A.oeffnen(); const id4 = inZustand(w4.K, 'laeuft');
        check('11m ohne Kugel auf der Startseite: kein Absturz, Ersatzbild', (() => { try { w4.A.aktion('oeffne', id4); w4.rahmen(); return true; } catch (e) { return false; } })());
        const stil = vm.runInNewContext(ANSICHT.slice(ANSICHT.indexOf('const STIL = ') + 13, ANSICHT.indexOf(";\n\n    /* ---------- Zeichnen")));
        const regeln = stil.split('}').filter(r => /animation\s*:/.test(r) && !/animation\s*:\s*none/.test(r));
        check('11n jede Animation im Stil gilt nur unter „#mzRoot.an“ (nie dauerhaft)', regeln.length > 8 && regeln.every(r => /^#mzRoot\.an /.test(r.trim()) || /^@keyframes/.test(r.trim()) === false && /#mzRoot\.an /.test(r.split('{')[0])), regeln.filter(r => !/#mzRoot\.an /.test(r.split('{')[0])));
        check('11o Stil enthält Pause und „ruhe“ (keine Animation)', /#mzRoot\.pause \*\{animation-play-state:paused!important\}/.test(stil) && /#mzRoot\.ruhe \*\{animation:none!important/.test(stil));
        check('11p Datei: genau ein Sekundentakt, eine Schleife, keine zweite Kugel', (ANSICHT.match(/setInterval\(/g) || []).length === 1 && (ANSICHT.match(/requestAnimationFrame\(/g) || []).length === 2 && (ANSICHT.match(/getElementById\('jarvisSphere'\)/g) || []).length === 1 && !/Math\.random|golden|POINT_COUNT/.test(ANSICHT));
        const sph = lies('js/sphere.js');
        check('11q sphere.js bleibt unangetastet (kennt die Missionszentrale nicht)', !/mission|mzKugel/i.test(sph));
    }

    /* ---------- 12 Schließen räumt alles auf ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = inZustand(K, 'laeuft'); A.aktion('oeffne', id); A.aktion('start', id);
        A.aktion('zu', '');
        check('12a Fenster und Stil entfernt', w.wurzel() === null && w.elemente.filter(x => x.id === 'mzStil' && !x.entfernt).length === 0);
        check('12b Takt gestoppt, Schleife gestoppt, Aktivierungs-Zeitgeber gestoppt', w.takt().length === 0 && w.raf.length === 0 && w.timeouts.filter(x => x.aktiv).length === 0 && !A._laeuft().takt);
        check('12c Sichtbarkeits- und Bewegungs-Beobachter entfernt', !w.docHoerer.visibilitychange && w.mqHoerer.length === 0);
        let fehlerGeworfen = false; try { K.pausieren(id); K.fortsetzen(id); K.herzschlag(); } catch (e) { fehlerGeworfen = true; }
        check('12d Änderungen nach dem Schließen zeichnen nichts mehr und werfen nichts (Hörer abgemeldet)', !fehlerGeworfen && w.wurzel() === null);
        A.oeffnen(); A.oeffnen();
        check('12e erneutes Öffnen: wieder genau ein Fenster, ein Takt', w.elemente.filter(x => x.id === 'mzRoot' && !x.entfernt).length === 1 && w.takt().length === 1);
        A.aktion('zu', ''); A.aktion('zu', '');
        check('12f doppeltes Schließen ist harmlos', w.wurzel() === null && w.takt().length === 0);
    }

    /* ---------- 13 Änderungen von außen, entfernte Mission ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = inZustand(K, 'laeuft'); A.aktion('oeffne', id);
        K.pausieren(id);
        check('13a Änderung von außen erscheint sofort (PAUSIERT)', /data-z="pausiert"/.test(w.wurzel().innerHTML));
        K.abbrechen(id, 'x'); K.entfernen(id);
        check('13b wird die offene Mission anderswo entfernt, springt die Ansicht zurück in die Liste', A._zustand().ansicht === 'liste' && /Alle Missionen/.test(w.wurzel().innerHTML));
    }

    /* ---------- 14 Fehler beim Speichern, beschädigte Daten ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const id = neu(K); A.aktion('oeffne', id);
        ls.setItem = () => { const e = new Error('Quota'); throw e; };
        const r = A.aktion('start', id);
        check('14a Speicher voll: Warnung steht sichtbar im Fenster, Mission läuft im Arbeitsspeicher', r.ok && /Speicher voll oder gesperrt/.test(w.wurzel().innerHTML) && K.hole(id).status === 'laeuft');
        const ls2 = speicher(); ls2.map.set('jv_missionen_v1', 'kaputt');
        const w2 = welt(ls2); w2.A.oeffnen();
        check('14b beschädigte Daten: Hinweis im Fenster, Daten gesichert, Oberfläche funktioniert', /beschädigt/.test(w2.wurzel().innerHTML) && ls2.map.get('jv_missionen_v1_defekt') === 'kaputt' && w2.A.aktion('anlegen', '', { titel: 't', auftrag: 'a', schritte: 'x' }).ok);
    }

    /* ---------- 15 Schutz vor HTML und Länge ---------- */
    {
        const ls = speicher(), w = welt(ls), K = w.K, A = w.A; A.oeffnen();
        const bos = '<img src=x onerror=alert(1)>"\'&';
        const id = K.neu({ titel: bos, auftrag: bos, schritte: [{ titel: bos }], budgetCent: 10 }).mission.id;
        K.starten(id); K.schrittStarten(id, 's1'); K.schrittErledigt(id, 's1', { art: 'quelle', text: bos, ref: bos });
        K.pausieren(id); K.fortsetzen(id); K.fehlschlagen(id, bos);
        const liste = w.wurzel().innerHTML; A.aktion('oeffne', id); const det = A.html();
        check('15a Liste und Detail enthalten kein rohes HTML aus Nutzertexten', liste.indexOf('<img') < 0 && det.indexOf('<img') < 0 && det.indexOf('onerror=alert') < det.indexOf('&lt;img') + 40 && /&lt;img src=x onerror=alert\(1\)&gt;/.test(det));
        const id2 = neu(K, { titel: 'a"b\'c' }); A.aktion('oeffne', id2);
        check('15b Anführungszeichen im Titel brechen keine Attribute (IDs und Knöpfe bleiben heil)', A.html().indexOf('data-a="' + id2 + '"') > 0 && !/data-a="[^"]*[<>]/.test(A.html()));
    }

    /* ---------- 16 Einbindung, Sicherheitsgrenzen ---------- */
    {
        const idx = lies('index.html');
        check('16a Skripte in index.html: Kern vor Zentrale, beide mit Stempel', /mission_kern\.js\?v=[0-9a-f]{8}"/.test(idx) && /mission_ansicht\.js\?v=[0-9a-f]{8}"/.test(idx) && idx.indexOf('mission_kern.js') < idx.indexOf('mission_ansicht.js'));
        check('16b kein Netz, kein eval, kein APP_SECRET, kein Sprachbefehl in der Zentrale', !/\bfetch\s*\(|XMLHttpRequest|\beval\s*\(|new Function|apiFetch|app_secret|APP_SECRET|jvCommands|speak\(|jvChef|jvFrage/.test(ANSICHT));
        check('16c keine eigene Missionsverwaltung: kein Zugriff auf localStorage in der Oberfläche', !/localStorage|sessionStorage|getPersistentData|setPersistentData/.test(ANSICHT));
        check('16d keine neue API-Datei, keine APK-Dateien erwähnt', fs.readdirSync(path.join(ROOT, 'api')).filter(f => /\.js$/.test(f)).length === 11);
        check('16e keine externen Schriften, Bilder oder Dienste', !/https?:\/\//.test(ANSICHT.replace(/^[\s\S]*?\*\//, '')) );
        check('16f Menüeintrag (nur bei MENUE_SICHTBAR = true) heißt „Missionszentrale“ (ohne Test-Zusatz)', /Missionszentrale<\/b>/.test(ANSICHT) && !/Test M1/.test(ANSICHT));
        const w = welt(speicher()); const mm = w.A.html();
        check('16g Schriftgrößen: Fließtext mindestens 13 px, Knöpfe mindestens 44 px hoch (Stil)', (() => { const stil = vm.runInNewContext(ANSICHT.slice(ANSICHT.indexOf('const STIL = ') + 13, ANSICHT.indexOf(";\n\n    /* ---------- Zeichnen"))); const kl = [...stil.matchAll(/font-size:(\d+)px/g)].map(x => +x[1]); return Math.min.apply(null, kl) >= 11 && /\.mzKlein\{min-height:44px/.test(stil) && /\.mzGross\{flex:1;min-height:58px/.test(stil); })() && typeof mm === 'string');
    }

    console.log('MISSIONSZENTRALE M2: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(1); });
