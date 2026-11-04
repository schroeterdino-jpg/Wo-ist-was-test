/* ============================================================
   TESTS Phase 4 "Gesprächsgedächtnis": Start: node tests/gespraech.js
   Szenario Hamburg, Bezüge (Ordnungszahl, Nummer, Name), keine Raterei, Rückfragen, Verfall, Datenschutz, Isolation
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const MIN = 60000;

(async () => {
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, fetch: async () => { throw new Error('offline (Attrappe)'); } });
    check('0a keine Ladefehler, Instanz vorhanden', A.ladefehler.length === 0 && typeof A.sb.jvGespraech === 'object' && typeof A.sb.jvGespraech.erzeuge === 'function', A.ladefehler.join(';'));
    const G = A.sb.jvGespraech;
    let t = 0; const neu = z => G.erzeuge({ jetzt: () => t, zeiten: z });
    const RESTS = [
        { name: 'Trattoria Roma', beschreibung: 'Italienisch, Altona', link: 'https://x.example/roma' },
        { name: 'Fischerhaus Elbblick', beschreibung: 'Fisch, Övelgönne', link: 'https://x.example/elb' },
        { name: 'Zum Alten Hafen', beschreibung: 'Deutsch, Hafen', link: 'https://x.example/hafen' }
    ];

    /* ---------- Szenario aus dem Auftrag ---------- */
    t = 0; let g = neu();
    check('1a Ergebnisse merken: 3 Treffer', g.ergebnisse('ortssuche', RESTS) === 3 && g.status().listen[0].anzahl === 3);
    let r = g.aufloesen('Das zweite gefällt mir');
    check('1b "Das zweite gefällt mir" → Auswahl: Fischerhaus', r.art === 'auswahl' && r.ziel.name === 'Fischerhaus Elbblick' && g.ausgewaehlt().name === 'Fischerhaus Elbblick', JSON.stringify(r));
    r = g.aufloesen('Wie komme ich dahin?');
    check('1c "Wie komme ich dahin?" → Folgefrage Route zum ausgewählten Restaurant', r.art === 'folgefrage' && r.thema === 'route' && r.ziel.name === 'Fischerhaus Elbblick' && r.ziel.link === 'https://x.example/elb', JSON.stringify(r));
    r = g.aufloesen('Wann hat das auf?');
    check('1d "Wann hat das auf?" → Öffnungszeiten zum selben Restaurant', r.art === 'folgefrage' && r.thema === 'oeffnungszeiten' && r.ziel.nr === 2, JSON.stringify(r));
    check('1e Absicht gemerkt', (g.absicht('ortssuche', { stadt: 'Hamburg' }), g.absicht().name === 'ortssuche' && g.absicht().daten.stadt === 'Hamburg'));

    /* Ohne vorherige Auswahl: nicht raten */
    g = neu(); g.ergebnisse('ortssuche', RESTS);
    r = g.aufloesen('Wie komme ich dahin?');
    check('2a ohne Auswahl bei 3 Ergebnissen: Rückfrage statt Raten, mit allen drei Optionen', r.art === 'rueckfrage' && r.optionen.length === 3 && r.thema === 'route' && /Welches/.test(r.frage) && !r.ziel, JSON.stringify(r));
    check('2b die Rückfrage ist als offene Frage gemerkt', g.offeneFragen().length === 1 && g.ausgewaehlt() === null);
    r = g.aufloesen('das zweite');
    check('2c "das zweite" beantwortet die Rückfrage → Route zu Nr. 2', r.art === 'folgefrage' && r.thema === 'route' && r.ziel.nr === 2 && r.beantwortet > 0 && g.offeneFragen().length === 0 && g.ausgewaehlt().nr === 2, JSON.stringify(r));
    g = neu(); g.ergebnisse('ortssuche', RESTS); g.aufloesen('Wie komme ich dahin?');
    r = g.aufloesen('nein, keins davon');
    check('2d "nein, keins davon" bricht die Rückfrage ab, wählt nichts', r.art === 'abgebrochen' && g.offeneFragen().length === 0 && g.ausgewaehlt() === null, JSON.stringify(r));
    g = neu(); g.ergebnisse('ortssuche', [RESTS[0]]);
    r = g.aufloesen('Wie komme ich dahin?');
    check('2e genau ein Ergebnis: eindeutig (kein Raten nötig)', r.art === 'folgefrage' && r.ziel.name === 'Trattoria Roma' && r.grund === 'einziges_ergebnis', JSON.stringify(r));

    /* ---------- Bezüge ---------- */
    g = neu(); g.ergebnisse('ortssuche', RESTS);
    const ORD = [['Das erste', 1], ['das dritte gefällt mir', 3], ['Ich nehme das zweite', 2], ['Nummer 3', 3], ['Nr. 1 gefällt mir', 1], ['Option zwei', 2], ['das letzte', 3], ['die vorletzte nehme ich', 2], ['Ich nehme die mittlere', 2]];
    for (const [satz, n] of ORD) { g.ergebnisse('ortssuche', RESTS); const x = g.aufloesen(satz); check('3a "' + satz + '" → Nr. ' + n, x.ziel && x.ziel.nr === n, JSON.stringify(x)); }
    g.ergebnisse('ortssuche', RESTS.slice(0, 2));
    r = g.aufloesen('die mittlere nehme ich');
    check('3b "mittlere" bei 2 Ergebnissen ist mehrdeutig → Rückfrage', r.art === 'rueckfrage' && r.grund === 'mittlere', JSON.stringify(r));
    g.ergebnisse('ortssuche', RESTS);
    r = g.aufloesen('Das fünfte gefällt mir');
    check('3c Ordnungszahl außerhalb: Rückfrage "ausserhalb" statt irgendeins', r.art === 'rueckfrage' && r.grund === 'ausserhalb' && g.ausgewaehlt() === null, JSON.stringify(r));
    g.ergebnisse('ortssuche', RESTS);
    r = g.aufloesen('Nummer 0 bitte'); const r2 = g.aufloesen('Nummer 12 bitte');
    check('3d Nummer 0 und 12: nie ein Ergebnis geraten', !r.ziel && !r2.ziel);
    g.ergebnisse('ortssuche', RESTS);
    r = g.aufloesen('Roma gefällt mir');
    check('3e Name (eindeutig): Trattoria Roma', r.art === 'auswahl' && r.ziel.nr === 1, JSON.stringify(r));
    r = g.aufloesen('Wie komme ich zum Elbblick?');
    check('3f Name + Thema: Route zum Fischerhaus', r.art === 'folgefrage' && r.thema === 'route' && r.ziel.nr === 2, JSON.stringify(r));
    g.ergebnisse('ortssuche', [{ name: 'Pizzeria Roma Nord' }, { name: 'Roma Süd' }, { name: 'Café Blau' }]);
    r = g.aufloesen('Roma gefällt mir');
    check('3g Name passt zu zwei Ergebnissen: Rückfrage mit genau diesen zwei', r.art === 'rueckfrage' && r.optionen.length === 2 && r.grund === 'name', JSON.stringify(r));
    g.ergebnisse('ortssuche', [{ name: 'Restaurant Roma' }, { name: 'Pizzeria Bella' }]);
    r = g.aufloesen('Das Restaurant gefällt mir');
    check('3h allgemeines Wort ("Restaurant") zählt nicht als Name, kein Raten', !(r.ziel && r.art === 'auswahl' && r.grund === 'name'), JSON.stringify(r));

    /* Falsche Treffer vermeiden */
    g = neu(); g.ergebnisse('ortssuche', RESTS);
    for (const satz of ['Was kostet das Brot?', 'Zum ersten Mal in Hamburg', 'Das letzte Mal war ich krank', 'Wie spät ist es', 'Erinner mich morgen an Kaffee', 'Hallo', 'Das erste Mal', 'Erste Hilfe Kurs', 'Es regnet', 'Mach das Licht an']) {
        const x = g.aufloesen(satz);
        check('4a kein Bezug: "' + satz + '"', x.art === 'kein_bezug' && !x.ziel && g.offeneFragen().length === 0, JSON.stringify(x));
    }
    for (const x of [null, undefined, '', '   ', 5, {}, [], 'x'.repeat(50000)]) { let w = false, res; try { res = g.aufloesen(x); } catch (e) { w = true; } check('4b aufloesen wirft nicht (' + String(x).slice(0, 10) + ')', !w && res && res.art); }
    g = neu();
    r = g.aufloesen('Wie komme ich dahin?');
    check('4c nichts gemerkt: "ohne_bezug" mit Rückfrage-Text', r.art === 'ohne_bezug' && !!r.frage && !r.ziel, JSON.stringify(r));
    r = g.aufloesen('Das zweite gefällt mir');
    check('4d nichts gemerkt + Ordnungszahl: ohne_bezug', r.art === 'ohne_bezug');
    check('4e waehle() ohne Ergebnisse: ohne_bezug; mit Zahl/Text funktioniert', g.waehle(1).art === 'ohne_bezug' && (g.ergebnisse('x', RESTS), g.waehle(3).ziel.nr === 3) && g.waehle('Roma').ziel.nr === 1 && g.waehle(9).art === 'rueckfrage' && g.waehle('blabla').art === 'kein_bezug');

    /* ---------- Verfall ---------- */
    t = 0; g = neu(); g.ergebnisse('ortssuche', RESTS); g.aufloesen('das zweite');
    t = 9 * MIN; check('5a nach 9 min: Ergebnisse und Auswahl gelten', g.aufloesen('Wie komme ich dahin?').art === 'folgefrage');
    t = 10 * MIN + 1000; r = g.aufloesen('Das dritte gefällt mir');
    check('5b nach > 10 min: Ergebnisse veraltet → keine Wahl, Rückfrage "neu suchen"', r.art === 'veraltet' && !r.ziel && /noch einmal/.test(r.frage), JSON.stringify(r));
    check('5c … status zeigt veraltet', g.status().listen[0].veraltet === true);
    t = 11 * MIN; r = g.aufloesen('Wie komme ich dahin?');
    check('5d frische Auswahl gilt auch bei alter Liste für reines "dahin" (Auswahl < 15 min)', r.art === 'folgefrage' && r.ziel.nr === 2, JSON.stringify(r));
    t = 16 * MIN; r = g.aufloesen('Wie komme ich dahin?');
    check('5e Auswahl nach 15 min verfallen → veraltet, nicht raten', r.art === 'veraltet' && g.ausgewaehlt() === null, JSON.stringify(r));
    t = 31 * MIN; check('5f nach 30 min Ruhe ist alles vergessen', (g.status().listen.length === 0 && g.status().absicht === null && g.aufloesen('Wie komme ich dahin?').art === 'ohne_bezug'));
    t = 0; g = neu({ frageMs: 2 * MIN }); g.ergebnisse('ortssuche', RESTS); g.aufloesen('Wie komme ich dahin?');
    t = 2 * MIN + 1; check('5g offene Rückfrage verfällt nach 2 min; "das zweite" wird dann nicht mehr als Antwort gewertet', g.offeneFragen().length === 0);
    t = 0; g = neu({ ergebnisMs: 1000, auswahlMs: 500, ruheMs: 5000, frageMs: 100 });
    check('5h Fristen sind einstellbar (nur Tests)', g.ZEITEN.ergebnisMs === 1000 && g.ZEITEN.frageMs === 100 && neu().ZEITEN.ruheMs === 30 * MIN);
    t = 0; g = neu(); g.ergebnisse('a', RESTS); t = 5 * MIN; g.ergebnisse('b', [{ name: 'Neu Lokal' }]);
    check('5i neue Ergebnisse ersetzen die Auswahl und offene Fragen', g.ausgewaehlt() === null && g.offeneFragen().length === 0 && g.status().listen.length === 2);
    t = 0; g = neu(); g.ergebnisse('ortssuche', RESTS); g.aufloesen('das zweite'); t = MIN; g.ergebnisse('ortssuche', [{ name: 'Andere Bar' }, { name: 'Dritte Stube' }]);
    check('5j Auswahl aus alter Liste wird bei neuer Suche nicht weitergereicht', g.ausgewaehlt() === null && g.aufloesen('Wie komme ich dahin?').art === 'rueckfrage');

    /* ---------- Offene Fragen ---------- */
    t = 0; g = neu();
    const id = g.frage({ text: 'Soll ich die Route starten?', art: 'ja_nein', thema: 'route' });
    check('6a eigene Ja/Nein-Frage', g.offeneFragen().length === 1 && g.offeneFragen()[0].art === 'ja_nein');
    check('6b "Ja" beantwortet sie', g.aufloesen('Ja, bitte').art === 'antwort' && g.offeneFragen().length === 0);
    g.frage({ text: 'Soll ich?', art: 'ja_nein' }); r = g.aufloesen('Nein danke');
    check('6c "Nein" beantwortet sie als nein', r.art === 'antwort' && r.grund === 'nein');
    g.frage({ text: 'Soll ich?', art: 'ja_nein' }); r = g.aufloesen('Wie spät ist es');
    check('6d fremder Satz lässt die Frage offen und ist kein Bezug', r.art === 'kein_bezug' && g.offeneFragen().length === 1);
    check('6e schliesse() entfernt gezielt', g.schliesse(g.offeneFragen()[0].id) === true && g.offeneFragen().length === 0 && g.schliesse(99999) === false);
    for (let i = 0; i < 6; i++) g.frage({ text: 'F' + i, art: 'ja_nein' });
    check('6f höchstens 3 offene Fragen', g.offeneFragen().length === 3 && g.offeneFragen()[2].text === 'F5');
    check('6g mehrere Anfragen "Welches meinst du?" nacheinander häufen sich nicht unbegrenzt', (() => { const h = neu(); h.ergebnisse('o', RESTS); for (let i = 0; i < 8; i++) h.aufloesen('Wie komme ich dahin?'); return h.offeneFragen().length <= 3; })());

    /* ---------- Grenzen ---------- */
    t = 0; g = neu();
    const viele = Array.from({ length: 40 }, (_, i) => ({ name: 'Lokal Nummer' + i + ' Eins', beschreibung: 'b'.repeat(900), link: 'l'.repeat(2000) }));
    check('7a höchstens 10 Ergebnisse je Liste', g.ergebnisse('x', viele) === 10);
    r = g.waehle(10); check('7b Längen werden gekappt (Name 120, Beschreibung 200, Link 400)', r.ziel.beschreibung.length === 200 && r.ziel.link.length === 400);
    for (let i = 0; i < 6; i++) g.ergebnisse('liste' + i, RESTS);
    check('7c höchstens 3 Listen', g.status().listen.length === 3);
    check('7d Müll als Liste/Einträge: kein Absturz, nichts gemerkt', (() => { const h = neu(); let w = false; try { h.ergebnisse('x', null); h.ergebnisse('x', 'abc'); h.ergebnisse('x', [null, undefined, 5, {}, { name: '' }, []]); } catch (e) { w = true; } return !w && h.status().listen.every(l => l.anzahl <= 1); })());
    const kp = neu(); kp.ergebnisse('o', RESTS); kp.aufloesen('das zweite'); const sel = kp.ausgewaehlt(); sel.name = 'MANIPULIERT'; const ab = kp.absicht('x', { a: 1 }) && kp.absicht(); ab.daten.a = 99;
    check('7e Rückgaben sind Kopien', kp.ausgewaehlt().name === 'Fischerhaus Elbblick' && kp.absicht().daten.a === 1);
    const eingefroren = Object.freeze([Object.freeze({ name: 'Eis' })]); check('7f eingefrorene Eingaben: kein Absturz', (() => { try { neu().ergebnisse('x', eingefroren); return true; } catch (e) { return false; } })());
    check('7g Absicht: nur einfache Werte, höchstens 10 Felder', (() => { const h = neu(); h.absicht('n', { a: { tief: 1 }, f: function () { }, ok: 'ja', zahl: 3 }); const d = h.absicht().daten; return d.ok === 'ja' && d.zahl === 3 && d.a === undefined && d.f === undefined; })());
    check('7h vergiss() löscht alles', (() => { const h = neu(); h.ergebnisse('o', RESTS); h.aufloesen('das zweite'); h.frage({ text: 'x' }); h.absicht('o'); h.vergiss(); const s = h.status(); return s.listen.length === 0 && s.auswahl === null && s.offeneFragen === 0 && s.absicht === null; })());

    /* ---------- Mit echter Registry (ortssuche) ---------- */
    {
        const B = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, fetch: async () => { throw new Error('offline'); } });
        B.sb.findNearbyRestaurants = async function (q) {
            B.sb.__q = q; B.sb.addMessage && 0;
            B.sb.jvLetzteKarten = null;
            return true;
        };
        // die Registry liest die Karten aus dem Kartenbereich; hier reicht ein fertiges Registry-Ergebnis
        const reg = {
            status: 'SUCCESS', faehigkeit: 'ortssuche', ausgefuehrt: true, trocken: false, nachricht: '', fehlend: [], alternativen: [], grund: '',
            daten: { cards: [{ title: 'Trattoria Roma', subtitle: 'Italienisch', href: 'https://x.example/roma' }, { title: 'Fischerhaus Elbblick', subtitle: 'Fisch', href: 'https://x.example/elb' }, { title: 'Zum Alten Hafen', subtitle: 'Deutsch', href: 'https://x.example/hafen' }] }
        };
        const h = B.sb.jvGespraech.erzeuge();
        check('8a Registry-Ergebnis "ortssuche" wird zu 3 Ergebnissen + Absicht', h.verarbeite(reg) === true && h.status().listen[0].anzahl === 3 && h.status().absicht === 'ortssuche');
        check('8b Folgesatz greift auf das Registry-Ergebnis zu', h.aufloesen('Das zweite gefällt mir').ziel.link === 'https://x.example/elb' && h.aufloesen('Wie komme ich dahin?').ziel.name === 'Fischerhaus Elbblick');
        const h2 = B.sb.jvGespraech.erzeuge();
        check('8c NO_RESULTS: leere Liste, Folgesatz → ohne_bezug', h2.verarbeite(Object.assign({}, reg, { status: 'NO_RESULTS', daten: { cards: [] } })) === true && h2.aufloesen('Das zweite gefällt mir').art === 'ohne_bezug');
        const h3 = B.sb.jvGespraech.erzeuge();
        check('8d Fehler/Rückfrage/Trockenlauf/Müll verändern das Gedächtnis nicht', ['TOOL_FAILED', 'NEEDS_INFORMATION', 'NEEDS_CONFIRMATION', 'CAPABILITY_MISSING'].every(s => h3.verarbeite(Object.assign({}, reg, { status: s })) === false) && h3.verarbeite(Object.assign({}, reg, { trocken: true })) === false && [null, undefined, 5, 'x', {}, { faehigkeit: 5 }].every(x => h3.verarbeite(x) === false) && h3.status().listen.length === 0 && h3.status().absicht === null);
        check('8e andere erfolgreiche Fähigkeit setzt nur die Absicht', (() => { const k = B.sb.jvGespraech.erzeuge(); return k.verarbeite({ status: 'SUCCESS', faehigkeit: 'websuche', trocken: false, daten: {} }) === true && k.status().absicht === 'websuche' && k.status().listen.length === 0; })());
        /* echter Aufruf der Registry mit Attrappe der Ortssuche */
        const echt = B.sb.jvRegistry.hole('ortssuche');
        check('8f echte Registry kennt die Ortssuche (Quelle der Karten)', !!echt);
    }

    /* ---------- Datenschutz ---------- */
    {
        const h = neu(); h.ergebnisse('ortssuche', RESTS);
        const geheim = 'Pfefferminz Geheimwort Zahnarzt';
        h.aufloesen('Das zweite gefällt mir, mein ' + geheim); h.aufloesen('Wie komme ich dahin? ' + geheim); h.aufloesen('Das fünfte ' + geheim); h.aufloesen('Hallo ' + geheim);
        const alles = JSON.stringify([h.status(), h.offeneFragen(), h.ausgewaehlt(), h.absicht(), h.aufloesen('Nummer 2 ' + geheim)]);
        check('9a Sätze des Nutzers tauchen nirgends im Gedächtnis auf (Status, Fragen, Auswahl, Ergebnisse)', !/Pfefferminz|Geheimwort|Zahnarzt/.test(alles), alles.slice(0, 200));
        check('9b status() enthält keine Inhalte der Ergebnisse (nur Anzahl/Alter)', !/Roma|Elbblick|Hafen/.test(JSON.stringify(h.status())));
    }

    /* ---------- Isolation ---------- */
    const quelle = lies('js/gespraech.js');
    const code = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check('10a Datei: kein Netz, kein Speichern, keine Sprache, keine Zeitgeber, keine Aktionen, kein DOM, kein Langzeitgedächtnis', !/fetch\(|apiFetch|XMLHttpRequest|localStorage|sessionStorage|setPersistentData|setItem|speak\(|speakAck|setTimeout|setInterval|executeAction|sendToGroqSmart|document\.|memoryItems|searchMemory|addMemory|jvRegistry|handleLocalCommand/.test(code), (code.match(/fetch\(|localStorage|setItem|speak\(|setTimeout|setInterval|executeAction|document\.|memoryItems|searchMemory|jvRegistry|handleLocalCommand/) || [])[0]);
    const nutzer = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'gespraech.js').filter(f => /jvGespraech\b/.test(lies('js/' + f)));
    check('10b nur gespraech_ort.js (Phase 5, Ortssuche) und chef.js (Phase 6, Chef-KI) benutzen das Gesprächsgedächtnis, sonst keine App-Datei', nutzer.join() === 'chef.js,gespraech_ort.js', nutzer.join());
    const C = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, fetch: async () => { throw new Error('offline'); } });
    const vorher = JSON.stringify(C.store) + JSON.stringify(C.lese('memoryItems')) + C.aufrufe.length + C.gesagt.length;
    const gg = C.sb.jvGespraech; gg.ergebnisse('o', RESTS); gg.aufloesen('Das zweite gefällt mir'); gg.aufloesen('Wie komme ich dahin?'); gg.frage({ text: 'x', art: 'ja_nein' }); gg.absicht('o');
    check('10c Benutzung ändert nichts: Speicher, Langzeitgedächtnis, Netz, Sprache unverändert', vorher === JSON.stringify(C.store) + JSON.stringify(C.lese('memoryItems')) + C.aufrufe.length + C.gesagt.length);
    gg.vergiss();
    check('10d kein Einfluss auf Phase 1/2: Sicherheit und Registry unverändert vorhanden', typeof C.sb.jvSicher === 'object' && typeof C.sb.jvRegistry.fuehreAus === 'function' && C.sb.jvRegistry.namen().length === 5);
    const arch = lies('ARCHITEKTUR.md');
    check('10e Doku nennt das Gesprächsgedächtnis und die Datei', /Gesprächsgedächtnis/.test(arch) && /js\/gespraech\.js/.test(arch));

    console.log(`GESPRÄCH: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABSTURZ', e && e.stack || e); process.exit(2); });
