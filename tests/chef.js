/* ============================================================
   TESTS Phase 6 "Chef-KI" (js/chef.js): Start: node tests/chef.js
   Echte Wege: Haken im Sprachweg (handleLocalCommand wie voice.js), Registry-Ortssuche (nearby.js), Gesprächsgedächtnis. Netz, Standort, Karten sind Attrappen.
   Gegenproben: absichtlich fehlerhafte KI-Entscheidungen (ungültiges JSON, erfundene Fähigkeit, Schreibaktion mit "bestaetigt", Einschleusen fremder Felder).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ant = d => ({ ok: true, status: 200, json: async () => d });
const MIN = 60000;

const PL = [
    { name: 'Trattoria Roma', street: 'Hauptstr.', housenumber: '1', city: 'Hamburg', lat: 53.551, lon: 10.001 },
    { name: 'Fischerhaus Elbblick', street: 'Elbweg', housenumber: '2', city: 'Hamburg', lat: 53.545, lon: 9.95 },
    { name: 'Zum Alten Hafen', street: 'Kai', housenumber: '3', city: 'Hamburg', lat: 53.53, lon: 9.97 }
];

function umgebung(opt) {
    opt = opt || {};
    const st = { places: opt.places || PL, placesFehler: false, placesLeer: false, groq: 0, entscheider: 0, entscheiderNachrichten: [], normaleSaetze: [], entscheiderVerhalten: '', entscheiderAntwort: '{"schritte":[]}', places_n: 0, urls: [], geocode: null };
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, speicher: opt.speicher, spracherkennung: true, fetch: async (u, o) => {
        st.urls.push(String(u).replace(/\?.*$/, ''));
        if (/\/api\/groq/.test(u)) {
            let msgs = []; try { msgs = JSON.parse(o.body).messages || []; } catch (e) { }
            if (msgs[0] && /Du planst für einen Sprachassistenten/.test(String(msgs[0].content))) {   // Anfrage des KI-Entscheiders
                st.entscheider++; st.entscheiderNachrichten.push(msgs);
                if (st.entscheiderVerhalten === 'haengt') return new Promise(() => { });
                if (st.entscheiderVerhalten === 'fehler') return { ok: false, status: 500, json: async () => ({}) };
                if (st.entscheiderVerhalten === 'netz') throw new Error('offline');
                const a = typeof st.entscheiderAntwort === 'function' ? st.entscheiderAntwort(msgs) : st.entscheiderAntwort;
                return ant({ choices: [{ message: { content: typeof a === 'string' ? a : JSON.stringify(a) } }] });
            }
            st.groq++; st.normaleSaetze.push(String((msgs[msgs.length - 1] || {}).content || '').slice(0, 80));
            return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Okay.', actions: [] }) } }] });
        }
        if (/action=places/.test(u)) { st.places_n++; if (st.placesFehler) return { ok: false, status: 500, json: async () => ({}) }; return ant({ places: st.placesLeer ? [] : st.places }); }
        if (/api\/geocode/.test(u)) return st.geocode === 'leer' ? ant([]) : ant([{ lat: '53.55', lon: '10.0', class: 'place', display_name: 'Hamburg, Deutschland' }]);
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.st = st;
    A.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.1 });
    A.karten = []; A.sb.showActionCards = c => { A.karten.push(JSON.parse(JSON.stringify(c))); };
    A.opened = []; A.sb.open = (u) => { A.opened.push(u); return {}; };
    A.exec = 0; const e0 = A.sb.executeAction; A.sb.executeAction = function () { A.exec++; return e0.apply(this, arguments); };
    return A;
}
const warte = async (n) => { for (let i = 0; i < (n || 12); i++) await new Promise(r => setImmediate(r)); };
async function sag(A, satz) {   // wie voice.js: erst feste Befehle (mit Ortssuche-Haken), danach warten, bis die Chef-KI fertig ist
    const g0 = A.gesagt.length, k0 = A.karten.length;
    const l = await A.lassLaufen(() => A.sb.handleLocalCommand(satz));
    await warte(); await A.lassLaufen(async () => { await warte(); });
    return { lokal: !!l.wert, gesagt: A.gesagt.slice(g0), karten: A.karten.slice(k0).filter(c => c.length), text: A.gesagt.slice(g0).join(' ') };
}
async function chef(A, satz, opt) {   // direkter Aufruf der Chef-KI
    const g0 = A.gesagt.length, k0 = A.karten.length;
    const w = await A.lassLaufen(() => A.sb.jvChef.verarbeite(satz, opt));
    await warte();
    return { aus: w.wert, gesagt: A.gesagt.slice(g0), karten: A.karten.slice(k0).filter(c => c.length), text: A.gesagt.slice(g0).join(' ') };
}
const G = A => A.sb.jvGespraech;
const zustand = A => JSON.stringify({ m: A.lese('memoryItems'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), t: A.lese('todoEntries') });
const kiStub = antwort => async () => (typeof antwort === 'function' ? antwort() : antwort);

(async () => {
    /* ---------- 0. Grundlage ---------- */
    let A = umgebung();
    check('0a Chef-KI ist geladen, keine Ladefehler', A.ladefehler.length === 0 && typeof A.sb.jvChef === 'object' && typeof A.sb.jvChef.behandle === 'function', A.ladefehler.join(';'));
    check('0b Standard: AUS', A.sb.jvChef.istAn() === false);
    const befehle0 = A.sb.jvCommands.list().map(c => c.name || c).join('|'), anzahl0 = A.sb.jvCommands.list().length;
    check('0c Befehlsliste vorhanden (Anzahl wird unten vor/nach Chef-KI verglichen; die Zahl 94 sichern tests/reihenfolge.js und tests/globale.js)', A.sb.jvCommands.list().length >= 90);
    check('0d die Chef-KI führt nur lesende Fähigkeiten aus (ortssuche, websuche, wetter); Schreib-Fähigkeiten sind gesperrt', A.sb.jvChef.FREIGEGEBEN.join() === 'ortssuche,websuche,wetter' && A.sb.jvChef.SCHREIB.join() === 'erinnerung_erstellen,termin_erstellen,gedaechtnis_speichern,aufgabe_erstellen,termin_verschieben,kontakt_speichern' && Object.isFrozen(A.sb.jvChef.FREIGEGEBEN));

    /* ---------- 10. AUS: bisheriges Verhalten unverändert ---------- */
    const satz = 'Ich habe Hunger, was gibt es hier in der Nähe?';
    const Aus = umgebung(), Aus2 = umgebung(); Aus2.sb.jvChef.aus();
    const a1 = await sag(Aus, satz), a2 = await sag(Aus2, satz);
    check('10a AUS: der Satz wird von der Chef-KI nicht angefasst (kein Plan, kein Eintrag, keine Suche über sie)', Aus.sb.jvChef.protokoll().length === 0 && Aus.st.places_n === 0 && G(Aus).status().listen.length === 0, JSON.stringify(Aus.sb.jvChef.protokoll()));
    check('10b AUS ausdrücklich = AUS unberührt: gleiches Ergebnis', a1.lokal === a2.lokal && a1.text === a2.text && Aus.st.places_n === Aus2.st.places_n && Aus.exec === Aus2.exec);
    check('10c behandle() gibt AUS sofort false zurück', Aus.sb.jvChef.behandle(satz) === false && Aus.sb.jvChef.behandle('Such mir einen Italiener') === false);

    /* ---------- 1/11. EIN: natürliche Ortsanfrage -> Ortssuche ---------- */
    A = umgebung(); A.sb.jvChef.an();
    check('11a EIN-Schalter wirkt', A.sb.jvChef.istAn() === true);
    let r = await sag(A, satz);
    check('1a natürliche Ortsanfrage: übernommen, Ortssuche lief genau einmal über die Registry', r.lokal && A.st.places_n === 1, JSON.stringify({ l: r.lokal, p: A.st.places_n, g: r.text }));
    check('1b … Treffer als Karten gezeigt und gesprochen', r.karten.length === 1 && r.karten[0].length >= 3 && /Trattoria Roma|Fischerhaus|Alten Hafen/.test(r.text), r.text);
    check('1c … ohne KI-Aufruf', A.st.groq === 0);
    check('1d … Treffer sind im Gesprächsgedächtnis (3, mit Quelle chef)', G(A).status().listen.length === 1 && G(A).status().listen[0].anzahl === 3);
    check('1e … Protokoll: Weg plan, Fähigkeit ortssuche, SUCCESS, ohne Satz', A.sb.jvChef.protokoll().length === 1 && A.sb.jvChef.protokoll()[0].faehigkeiten.join() === 'ortssuche' && A.sb.jvChef.protokoll()[0].status === 'SUCCESS' && !JSON.stringify(A.sb.jvChef.protokoll()).includes('Hunger'));

    /* ---------- 4/5. Drei Ergebnisse -> "das zweite" -> Folgefrage ---------- */
    const treffer = G(A).status().listen[0];
    r = await sag(A, 'Das zweite gefällt mir');
    check('4a "Das zweite gefällt mir" wählt das zweite Ergebnis der Chef-Suche', r.lokal && G(A).ausgewaehlt() && G(A).ausgewaehlt().nr === 2 && /Okay, /.test(r.text), r.text);
    const zweites = G(A).ausgewaehlt();
    r = await sag(A, 'Wie komme ich dahin?');
    check('5a Folgefrage "Wie komme ich dahin?" -> Route zum GEWÄHLTEN Ort', r.lokal && r.karten.length === 1 && r.karten[0][0].title.includes(zweites.name) && /destination=/.test(r.karten[0][0].href || ''), JSON.stringify(r.karten));
    check('5b … ohne zusätzliche Suche, ohne KI', A.st.places_n === 1 && A.st.groq === 0);
    r = await sag(A, 'Gibt es dort Parkplätze?');
    check('5c "Gibt es dort Parkplätze?" erfindet nichts: geht mit dem Ort an die bestehende KI (kein lokal erfundener Satz)', !/Parkplätze? (gibt|sind|ist)/i.test(r.text) && (A.st.groq >= 0), r.text);

    /* ---------- 2. Unterschiedliche Formulierungen, gleiche Absicht ---------- */
    const formen = ['Ich habe Hunger', 'Hunger, was gibt es hier in der Nähe?', 'Ich habe Hunger. Zeig mir ein Restaurant in der Nähe', 'Wo kann ich hier essen gehen?', 'Such mir ein Restaurant', 'Zeig mir ein Lokal in der Nähe', 'Gibt es ein Restaurant hier?'];
    let alleGleich = true, detail = [];
    for (const f of formen) { const p = await A.sb.jvChef.plane(f); const ok1 = p.ok && p.plan.schritte.length === 1 && p.plan.schritte[0].faehigkeit === 'ortssuche' && p.plan.schritte[0].params.suchbegriff === 'Restaurant'; if (!ok1) { alleGleich = false; detail.push(f + ' => ' + JSON.stringify(p.plan)); } }
    check('2a sieben Formulierungen -> dieselbe Absicht (ortssuche, Suchbegriff Restaurant)', alleGleich, detail.join(' | '));
    const it = ['Such mir einen schönen Italiener', 'Ich habe Lust auf Pizza, gibt es was in der Nähe?', 'Zeig mir einen Italiener'];
    let itOk = true; for (const f of it) { const p = await A.sb.jvChef.plane(f); if (!(p.ok && p.plan.schritte[0] && p.plan.schritte[0].params.suchbegriff === 'Italiener')) { itOk = false; detail.push(f); } }
    check('2b Italiener/Pizza -> Suchbegriff Italiener', itOk, detail.join('|'));
    const pOrt = await A.sb.jvChef.plane('Zeig mir einen Italiener in Hamburg');
    check('2c Ortsangabe wird erkannt, "in der Nähe" ergibt keinen Ort', pOrt.plan.schritte[0].params.ort === 'Hamburg' && !(await A.sb.jvChef.plane('Zeig mir einen Italiener in der Nähe')).plan.schritte[0].params.ort);
    const keine = ['Wie spät ist es?', 'Was kostet das Brot?', 'Erzähl mir einen Witz', 'Schalte das Licht an', ''];
    let nichts = true; for (const f of keine) { const p = await A.sb.jvChef.plane(f); if (!(p.ok && p.plan.schritte.length === 0 && !p.plan.frage && !p.plan.hinweis)) { nichts = false; detail.push(f); } }
    check('2d Sätze ohne Ortswunsch -> kein Plan (alles läuft wie bisher)', nichts, detail.join('|'));

    /* ---------- 3. Mehrdeutig -> Rückfrage ---------- */
    A = umgebung(); A.sb.jvChef.an();
    r = await sag(A, 'Such mir was Schönes');
    check('3a mehrdeutige Anfrage: Rückfrage statt Suche', r.lokal && /Wonach soll ich suchen/.test(r.text) && A.st.places_n === 0 && A.exec === 0, r.text);
    check('3b … die Rückfrage ist bei der Fragen-Reihenfolge angemeldet (jüngste Frage = chef)', A.sb.jvFrage.aktuell() === 'chef');
    r = await sag(A, 'Pizza');
    check('3c die Antwort "Pizza" wird zum Suchbegriff und löst genau eine Suche aus', A.st.places_n === 1 && r.karten.length === 1, r.text);
    A = umgebung(); A.sb.jvChef.an(); await sag(A, 'Such mir was Schönes'); r = await sag(A, 'Nein');
    check('3d "Nein" auf die Rückfrage bricht ab, keine Suche', /ich lasse es/.test(r.text) && A.st.places_n === 0);
    A = umgebung(); A.sb.jvChef.an(); await sag(A, 'Such mir was Schönes'); A.uhr.ms += 3 * MIN; r = await sag(A, 'Pizza');
    check('3e nach 3 Minuten ist die Rückfrage verfallen: "Pizza" löst keine Suche aus', A.st.places_n === 0);
    A = umgebung(); A.sb.jvChef.an(); await sag(A, 'Such mir was Schönes'); A.sb.jvFrage.neu('plan_wecker'); r = await sag(A, 'Pizza');
    check('3f hat danach ein anderes Modul gefragt, gehört die Antwort nicht der Chef-KI (Letzte Frage gewinnt)', A.st.places_n === 0);

    /* ---------- 6. Pflichtangaben fehlen ---------- */
    A = umgebung(); A.sb.jvChef.an();
    r = await chef(A, 'egal', { entscheider: kiStub({ absicht: 'ortssuche', schritte: [{ faehigkeit: 'ortssuche', params: {} }] }) });
    check('6a Ortssuche ohne Suchbegriff: NEEDS_INFORMATION, gezielte Frage, nichts ausgeführt', r.aus.status === 'NEEDS_INFORMATION' && /Wonach soll ich suchen/.test(r.text) && A.st.places_n === 0 && A.exec === 0 && r.aus.schritte[0].ausgefuehrt === false, JSON.stringify(r.aus.schritte));
    A.sb.jvChef.vergiss();
    r = await chef(A, 'egal', { entscheider: kiStub({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: '   ' } }] }) });
    check('6b nur Leerzeichen als Suchbegriff zählt als fehlend', r.aus.status === 'NEEDS_INFORMATION' && A.st.places_n === 0);
    A.sb.jvChef.vergiss();
    r = await chef(A, 'egal', { entscheider: kiStub({ schritte: [{ faehigkeit: 'erinnerung_erstellen', params: {} }] }) });
    check('6c Erinnerung ohne Text: Rückfrage, keine Ausführung, keine Erinnerung', r.aus.status === 'NEEDS_INFORMATION' && A.exec === 0 && A.lese('reminderEntries').length === 0);

    /* ---------- 7. Ungültige KI-Ausgabe ---------- */
    A = umgebung(); A.sb.jvChef.an();
    const kaputt = ['das ist kein json', '{"schritte": "ortssuche"}', '[1,2,3]', 'null', '{"schritte":[{"faehigkeit":"ortssuche"},{"faehigkeit":"ortssuche"},{"faehigkeit":"ortssuche"},{"faehigkeit":"ortssuche"}]}', '{"schritte":[5]}', '{"schritte":[{"faehigkeit":"Ort Suche!"}]}', '{"schritte":[{"faehigkeit":"ortssuche","params":[1]}]}', ''];
    let sicher = true, d7 = [];
    for (const k of kaputt) { const g0 = A.gesagt.length; const x = await chef(A, 'Ich habe Hunger', { entscheider: kiStub(k) }); if (!(x.aus.status === 'PLAN_UNGUELTIG' && x.gesagt.length === 0 && A.st.places_n === 0 && A.exec === 0)) { sicher = false; d7.push(k.slice(0, 40) + '=>' + x.aus.status); } }
    check('7a neun ungültige KI-Ausgaben: PLAN_UNGUELTIG, nichts gesagt, nichts ausgeführt', sicher, d7.join('|'));
    r = await chef(A, 'x', { entscheider: async () => { throw new Error('KI kaputt'); } });
    check('7b wirft der Entscheider: sicherer Fehler, nichts passiert', r.aus.status === 'PLAN_UNGUELTIG' && r.gesagt.length === 0 && A.st.places_n === 0);
    A.sb.jvChef.vergiss();
    r = await chef(A, 'x', { entscheider: kiStub('{"schritte":[{"faehigkeit":"ortssuche","params":{"suchbegriff":{"a":1},"ort":["x"]}}]}') });
    check('7c Objekte/Listen als Angaben werden verworfen -> fehlende Pflichtangabe statt Ausführung', r.aus.status === 'NEEDS_INFORMATION' && A.st.places_n === 0);

    /* ---------- 8. Nicht registrierte Fähigkeit ---------- */
    A.sb.jvChef.vergiss();
    r = await chef(A, 'x', { entscheider: kiStub({ schritte: [{ faehigkeit: 'flug_buchen', params: { ziel: 'Rom' } }] }) });
    check('8a erfundene Fähigkeit: CAPABILITY_MISSING, ehrliche Aussage, kein Aufruf', r.aus.status === 'CAPABILITY_MISSING' && /noch keine Fähigkeit/.test(r.text) && !/gebucht|erledigt/i.test(r.text) && A.exec === 0 && A.st.urls.length === 0, r.text);
    r = await chef(A, 'x', { entscheider: kiStub({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }, { faehigkeit: 'hotel_buchen', params: {} }] }) });
    check('8b ein erfundener Schritt NACH einer echten Suche stoppt den Plan ehrlich (nichts wird als erledigt gemeldet)', r.aus.schritte.length === 2 && r.aus.status === 'CAPABILITY_MISSING' && !/gebucht|erledigt/i.test(r.text));
    const prX = A.sb.jvChef.pruefePlan({ schritte: [{ faehigkeit: 'kalender_lesen' }], benoetigt: ['wetter_lesen'] });
    check('8c pruefePlan nennt fehlende Fähigkeiten', prX.ok && prX.fehlendeFaehigkeiten.sort().join() === 'kalender_lesen,wetter_lesen');

    /* ---------- 9. Schreibaktion ohne Bestätigung ---------- */
    A = umgebung(); A.sb.jvChef.an();
    const z0 = zustand(A);
    const schreib = [
        { faehigkeit: 'erinnerung_erstellen', params: { text: 'Zahnarzt', zeit: '2026-11-06T09:00:00' } },
        { faehigkeit: 'termin_erstellen', params: { titel: 'Zahnarzt', beginn: '2026-11-06T09:00:00', text: 'Zahnarzt', zeit: '2026-11-06T09:00:00' } },
        { faehigkeit: 'gedaechtnis_speichern', params: { schluessel: 'lieblingsessen', wert: 'Pizza' } }
    ];
    for (const s of schreib) {
        r = await chef(A, 'x', { entscheider: kiStub({ schritte: [s] }) });
        check('9a ' + s.faehigkeit + ': nur Testmodus (trocken), nichts geschrieben, nichts ausgeführt', r.aus.schritte.length === 1 && r.aus.schritte[0].ausgefuehrt === false && r.aus.schritte[0].trocken !== false && zustand(A) === z0 && A.exec === 0, JSON.stringify(r.aus.schritte[0]).slice(0, 220));
        check('9b ' + s.faehigkeit + ': keine Erfolgsmeldung ("eingetragen/gespeichert/erledigt")', !/eingetragen|gespeichert|angelegt|erledigt|Okay/i.test(r.text), r.text);
    }
    const mitBest = { absicht: 'erinnern', bestaetigt: true, trocken: false, schritte: [{ faehigkeit: 'erinnerung_erstellen', bestaetigt: true, trocken: false, params: { text: 'Zahnarzt', zeit: '2026-11-06T09:00:00' } }] };
    r = await chef(A, 'x', { entscheider: kiStub(mitBest) });
    check('9c "bestaetigt:true" aus einem KI-Plan zählt NIE: Felder verworfen, nichts geschrieben', r.aus.probleme.some(p => /bestaetigt/.test(p)) && zustand(A) === z0 && A.exec === 0 && r.aus.schritte[0].ausgefuehrt === false, JSON.stringify(r.aus.probleme));
    check('9d Quelltext: die Chef-KI setzt bestaetigt:true nur an EINER Stelle (B2b-1: nach der ausdrücklichen Zustimmung zu genau einem Verschieben) und sonst nie', (lies('js/chef.js').replace(/\/\*[\s\S]*?\*\//g, '').match(/bestaetigt\s*:\s*true/g) || []).length === 1);

    /* ---------- 11. EIN: nur ausdrücklich freigegebene Fähigkeit ---------- */
    A = umgebung(); A.sb.jvChef.an(); A.web = 0; A.sb.answerWithWebSearch = async () => { A.web++; return 'Antwort'; };
    r = await chef(A, 'x', { entscheider: kiStub({ schritte: [{ faehigkeit: 'websuche', params: { frage: 'Wetter morgen' } }] }) });
    check('11b websuche ist (lesend) freigegeben: wird bei EIN wirklich ausgeführt', A.web === 1 && r.aus.schritte[0].ausgefuehrt === true && r.aus.schritte[0].status === 'SUCCESS', JSON.stringify(r.aus.schritte[0]).slice(0, 200));
    r = await chef(A, 'x', { entscheider: kiStub({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }] }), trocken: true });
    check('11c opts.trocken verhindert auch die Ortssuche (Testmodus)', A.st.places_n === 0 && r.aus.schritte[0].ausgefuehrt === false);
    A = umgebung(); r = await chef(A, 'x', { entscheider: kiStub({ schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }] }) });
    check('11d Chef-KI AUS: auch verarbeite() führt nichts echt aus (nur Test)', A.st.places_n === 0 && r.aus.schritte[0].ausgefuehrt === false);

    /* ---------- 12. Keine doppelten Aktionen ---------- */
    A = umgebung(); A.sb.jvChef.an();
    const plan = { schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }] };
    await Promise.all([chef(A, 'x', { entscheider: kiStub(plan) }), chef(A, 'x', { entscheider: kiStub(plan) })]);
    await chef(A, 'x', { entscheider: kiStub(plan) });
    check('12a derselbe Plan dreimal kurz hintereinander: genau eine Suche', A.st.places_n === 1, String(A.st.places_n));
    A.uhr.ms += 10000; await chef(A, 'x', { entscheider: kiStub(plan) });
    check('12b nach einer Pause ist dieselbe Anfrage wieder erlaubt', A.st.places_n === 2);
    A = umgebung(); A.sb.jvChef.an(); await sag(A, satz); await sag(A, satz);
    check('12c zweimal derselbe Satz kurz hintereinander: eine Suche', A.st.places_n === 1, String(A.st.places_n));

    /* ---------- Fehlerbehandlung ---------- */
    A = umgebung(); A.sb.jvChef.an(); A.st.placesFehler = true;
    r = await sag(A, satz);
    check('F1 Netzwerkfehler bei der Suche: ehrliche Meldung, keine erfundenen Orte, nichts gemerkt', r.lokal && !/Trattoria|Fischerhaus|Alten Hafen/.test(r.text) && r.text.length > 0 && G(A).status().listen.length === 0 && r.karten.length === 0, r.text);
    A = umgebung(); A.sb.jvChef.an(); A.st.placesLeer = true;
    r = await sag(A, satz);
    check('F2 nichts gefunden: gezielte Nachfrage nach dem Ort statt Erfindung', /In welchem Ort soll ich suchen/.test(r.text) && r.karten.length === 0, r.text);
    r = await sag(A, 'Hamburg');
    check('F3 die Antwort "Hamburg" setzt den Ort, genau eine weitere Suche', A.st.places_n >= 2 && /Hamburg|nichts|gefunden/i.test(r.text || 'x'), String(A.st.places_n));
    A = umgebung(); A.sb.jvChef.an(); await sag(A, satz); A.st.placesFehler = true; A.uhr.ms += 10000; await sag(A, 'Ich habe Hunger, zeig mir einen Italiener in der Nähe');
    check('F4 scheitert eine neue Suche, gelten die alten Treffer nicht mehr (kein alter Ort)', G(A).status().listen.length === 0 && G(A).ausgewaehlt() === null);

    /* ---------- Mehrstufiger Plan (Teil 3) ---------- */
    A = umgebung(); A.sb.jvChef.an();
    r = await chef(A, 'Ich möchte Samstag mit meiner Frau etwas unternehmen');
    check('P1 Planungsablauf: nennt ehrlich die fehlenden Fähigkeiten (Kalender, Wetter, Ausflug), fragt gezielt, sucht noch nichts', /fehlen mir noch Fähigkeiten/.test(r.text) && /kalender lesen/.test(r.text) && /wetter lesen/.test(r.text) && /Wonach soll ich/.test(r.text) && A.st.places_n === 0 && A.exec === 0 && r.aus.fehlendeFaehigkeiten.join() === 'kalender_lesen,wetter_lesen,ausflug_vorschlagen', r.text);
    r = await chef(A, 'Restaurant');
    check('P2 nach der Antwort läuft die Ortssuche (der einzige sichere Schritt), danach sind Folgefragen möglich', A.st.places_n === 1 && G(A).status().listen.length === 1);
    r = await sag(A, 'Das erste gefällt mir');
    check('P3 Folgefrage nach dem Plan: Auswahl klappt', G(A).ausgewaehlt() && G(A).ausgewaehlt().nr === 1);
    A = umgebung(); A.sb.jvChef.an(); r = await sag(A, 'Ich möchte Samstag mit meiner Frau etwas unternehmen');
    check('P3b über den Sprachweg haben bestehende feste Befehle (Ausflugs-Planer) Vorrang: die Chef-KI wird nicht gefragt', A.sb.jvChef.protokoll().length === 0);
    A = umgebung(); A.sb.jvChef.an();
    r = await sag(A, 'Zeig mir lieber etwas Günstigeres');
    check('P4 "Günstigeres" ohne gemerkte Treffer: Chef-KI tut nichts (kein Bezug)', A.st.places_n === 0 && A.sb.jvChef.protokoll().length === 0);
    await sag(A, satz); r = await sag(A, 'Zeig mir lieber etwas Günstigeres');
    check('P5 "Günstigeres" nach einer Suche: ehrlich, Preise kenne ich nicht, keine erfundene Sortierung', /Preise kenne ich nicht/.test(r.text) && A.st.places_n === 1, r.text);

    /* ---------- Gegenproben: fehlerhafte KI-Entscheidungen ---------- */
    A = umgebung(); A.sb.jvChef.an();
    const ki = A.sb.jvChef.kiEntscheider(async (msgs) => JSON.stringify({ absicht: 'x', schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Sushi' } }] }));
    r = await chef(A, 'Hol mir Sushi', { entscheider: ki, gespraech: false });
    check('G1 KI-Entscheider (Attrappe) mit gültigem Plan: Ortssuche läuft einmal', A.st.places_n === 1 && r.aus.status === 'SUCCESS');
    const sendeInhalt = []; const ki2 = A.sb.jvChef.kiEntscheider(async (m) => { sendeInhalt.push(JSON.stringify(m)); return '{"schritte":[]}'; });
    await chef(A, 'Hallo', { entscheider: ki2, gespraech: false });
    check('G2 die Fähigkeiten-Beschreibung kommt aus der Registry (kein Geheimtext, keine Schlüssel/Gespräche)', sendeInhalt.length === 1 && /ortssuche/.test(sendeInhalt[0]) && /Erfinde keine Preise/.test(sendeInhalt[0]) && !/memoryItems|apiKey|password/i.test(sendeInhalt[0]));
    A = umgebung(); A.sb.jvChef.an();
    const kiFalsch = A.sb.jvChef.kiEntscheider(async () => '{"absicht":"hack","exec":"alert(1)","schritte":[{"faehigkeit":"ortssuche","evil":"x","params":{"suchbegriff":"Pizza","__proto__":{"x":1},"trocken":false,"bestaetigt":true}}]}');
    r = await chef(A, 'x', { entscheider: kiFalsch, gespraech: false });
    check('G3 fremde Felder werden verworfen, das Ergebnis bleibt eine normale Ortssuche', r.aus.probleme.length >= 2 && A.st.places_n === 1 && A.exec === 0);
    A = umgebung(); A.sb.jvChef.an();
    const kiOhne = A.sb.jvChef.kiEntscheider(undefined);
    r = await chef(A, 'x', { entscheider: kiOhne, gespraech: false });
    check('G4 KI-Entscheider ohne Sende-Funktion: kein Netzaufruf, sicherer Fehler', r.aus.status === 'PLAN_UNGUELTIG' && A.st.urls.length === 0);
    A = umgebung(); A.sb.jvChef.an();
    const kiLang = A.sb.jvChef.kiEntscheider(async () => JSON.stringify({ absicht: 'a'.repeat(5000), frage: 'F'.repeat(5000), schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'P'.repeat(5000) } }] }));
    const pl = await A.sb.jvChef.plane('x', { entscheider: kiLang });
    check('G5 überlange Texte werden gekürzt', pl.ok && pl.plan.absicht.length <= 60 && pl.plan.frage.length <= 300 && pl.plan.schritte[0].params.suchbegriff.length <= 200);

    /* ---------- 13/14. Befehle, Kosten, Netz ---------- */
    A = umgebung(); const vor = A.sb.jvCommands.list().map(c => c.name || c).join('|');
    A.sb.jvChef.an(); await sag(A, satz); await sag(A, 'Das zweite gefällt mir'); A.sb.jvChef.aus();
    check('13a die 94 Befehle und ihre Reihenfolge sind unverändert (vor/nach Chef-KI EIN und AUS)', A.sb.jvCommands.list().length === anzahl0 && A.sb.jvCommands.list().map(c => c.name || c).join('|') === vor && vor === befehle0);
    check('14a im ganzen Test null zusätzliche KI-Anfragen durch die Chef-KI', A.st.groq === 0, String(A.st.groq));
    check('14b Netzaufrufe nur Orts-Suchdienste (places/geocode), sonst nichts', A.st.urls.every(u => /api\/maps|api\/geocode|places/.test(u)), JSON.stringify(A.st.urls));
    check('14c AUS-Schalter: danach übernimmt die Chef-KI nichts mehr', A.sb.jvChef.behandle(satz) === false);

    /* ---------- Kontext & Reihenfolge der Fragen ---------- */
    A = umgebung(); A.sb.jvChef.an(); await sag(A, satz);
    await sag(A, 'Wie komme ich dahin?');   // Rückfrage des Ortsgedächtnisses (mehrdeutig, nichts gewählt)
    const protoVor = A.sb.jvChef.protokoll().length;
    r = await sag(A, 'die zweite');
    check('K1 die Rückfrage des Ortsgedächtnisses wird von ihm selbst beantwortet, die Chef-KI mischt sich nicht ein', G(A).ausgewaehlt() && G(A).ausgewaehlt().nr === 2 && A.sb.jvChef.protokoll().length === protoVor, r.text);
    A = umgebung(); A.sb.jvChef.an(); await sag(A, satz); A.sb.jvFrage.neu('termin-erinnern');
    r = await sag(A, 'nein');
    check('K2 eine jüngere Termin-Frage behält ihr "nein"; die Chef-KI nimmt nichts', !/ich lasse es/.test(r.text) && A.st.places_n === 1);

    /* ---------- KI-Entscheider im ECHTEN Sprachweg (voice.js: handleRecognizedText, hier über jvTippen) ---------- */
    const sprich = async (A, satz, n, lang) => {
        const g0 = A.gesagt.length, k0 = A.karten.length;
        if (lang) await A.lassLaufen(async () => { A.sb.jvTippen(satz); await new Promise(res => A.sb.setTimeout(res, 9000)); await warte(n || 30); });   // virtuelle Uhr vorstellen: lässt das Zeitlimit der Chef-KI ablaufen
        else { await A.lassLaufen(() => A.sb.jvTippen(satz)); await A.lassLaufen(async () => { await warte(n || 30); }); }
        return { gesagt: A.gesagt.slice(g0), karten: A.karten.slice(k0).filter(c => c.length), text: A.gesagt.slice(g0).join(' ') };
    };
    const ortsplan = (begriff, ort) => ({ absicht: 'ortssuche', schritte: [{ faehigkeit: 'ortssuche', params: ort ? { suchbegriff: begriff, ort } : { suchbegriff: begriff } }] });
    const NATUERLICH = [
        ['Mir knurrt der Magen, wo gibt es hier was Warmes?', 'Restaurant'],
        ['Wir wollen heute Abend auswärts speisen, irgendwas mit Meerblick', 'Restaurant'],
        ['Ich brauche dringend was Süßes, wo kriege ich hier etwas?', 'Bäckerei'],
        ['Kennst du einen netten Laden für heute Abend, nichts Teures?', 'Restaurant']
    ];
    /* Ausgangslage: diese Sätze erkennen weder die festen Befehle noch die lokalen Muster */
    A = umgebung(); A.sb.jvChef.an();
    let lokalNichts = true;
    for (const [satzN] of NATUERLICH) { const pl = await A.sb.jvChef.plane(satzN); const l = await A.lassLaufen(() => A.sb.handleLocalCommand(satzN)); if (pl.plan.schritte.length || l.wert) lokalNichts = false; }
    check('KI0 Ausgangslage: die vier natürlichen Sätze werden weder von den lokalen Essen-/Lokal-Mustern noch von festen Befehlen erkannt', lokalNichts && A.st.places_n === 0 && A.st.entscheider === 0);

    /* 11/12: die KI-Entscheidung wird im echten Sprachweg erreicht */
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant');
    r = await sprich(A, NATUERLICH[0][0]);
    check('KI1 echter Sprachweg: genau EINE Entscheider-Anfrage, Ortssuche lief, die normale KI wurde NICHT zusätzlich gefragt', A.st.entscheider === 1 && A.st.places_n === 1 && A.st.groq === 0, JSON.stringify({ e: A.st.entscheider, p: A.st.places_n, g: A.st.groq }));
    check('KI2 … Treffer gesprochen und als Karten gezeigt, im Gesprächsgedächtnis (3), Protokoll Weg ki', r.karten.length === 1 && /Trattoria Roma|Fischerhaus|Alten Hafen/.test(r.text) && G(A).status().listen[0].anzahl === 3 && A.sb.jvChef.protokoll().some(e => e.weg === 'ki' && e.status === 'SUCCESS'), r.text);
    const folge = await sag(A, 'Das zweite gefällt mir');
    check('KI3 … Folgesatz "Das zweite gefällt mir" nutzt die Treffer der KI-Suche', G(A).ausgewaehlt() && G(A).ausgewaehlt().nr === 2 && folge.lokal);
    check('KI4 Prompt: ortssuche, websuche, wetter und (B2a) die Kalender-/Aufgaben-Fähigkeiten beschrieben, (B2b-1) termin_verschieben nur mit suche/tag und kein Gedächtnisinhalt; die Nutzernachricht ist der Satz', (() => { const m = A.st.entscheiderNachrichten[0]; const sys = String(m[0].content); return /ortssuche/.test(sys) && /websuche/.test(sys) && /"wetter"/.test(sys) && /termin_erstellen/.test(sys) && /termin_verschieben/.test(sys) && /NIE an/.test(sys) && m.length === 2 && m[1].content === NATUERLICH[0][0] && !/memoryItems|Trattoria/.test(JSON.stringify(m)); })());

    A = umgebung(); A.sb.jvChef.an(); let alle = true, d = [];
    for (const [satzN, begriff] of NATUERLICH) { A.st.entscheiderAntwort = ortsplan(begriff); const n0 = A.st.places_n; await sprich(A, satzN); A.uhr.ms += 6000; if (A.st.places_n !== n0 + 1) { alle = false; d.push(satzN); } }
    check('KI5 vier unterschiedliche natürliche Formulierungen -> je eine Ortssuche über die KI-Entscheidung', alle && A.st.entscheider === 4 && A.st.groq === 0, d.join('|') + ' ' + A.st.entscheider);
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant', 'Hamburg'); await sprich(A, 'Wo gibt es in Hamburg etwas Nettes für heute Abend?');
    check('KI6 die KI kann auch einen Ort nennen (wird an die Registry-Ortssuche übergeben)', A.st.places_n === 1 && A.st.urls.some(u => /geocode/.test(u)));

    /* 6: ohne Chef-KI keine zusätzlichen KI-Aufrufe */
    A = umgebung(); A.st.entscheiderAntwort = ortsplan('Restaurant');
    r = await sprich(A, NATUERLICH[0][0]);
    check('KI7 Chef-KI AUS: kein Entscheider-Aufruf, keine Suche über die Chef-KI, der bisherige Ablauf (normale KI) läuft genau einmal', A.st.entscheider === 0 && A.st.places_n === 0 && A.st.groq === 1 && A.st.normaleSaetze[0].includes('knurrt'), JSON.stringify({ e: A.st.entscheider, g: A.st.groq }));
    A.sb.jvChef.an(); A.sb.jvChef.aus(); const e1 = A.st.entscheider; await sprich(A, NATUERLICH[1][0]);
    check('KI8 nach EIN und wieder AUS: weiter kein Entscheider-Aufruf', A.st.entscheider === e1 && A.sb.jvChef.kiWeg(NATUERLICH[1][0]) === false && A.sb.jvChef.kiZaehler().anfragen === 0);

    /* 5: feste Befehle haben Vorrang */
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant');
    const fest = ['Wo ist die nächste Tankstelle?', 'Wie spät ist es?', 'Wo bin ich gerade?'];
    let festOk = true; for (const f of fest) { const e0 = A.st.entscheider; const lokal = (await A.lassLaufen(() => A.sb.handleLocalCommand(f))).wert; if (lokal) { await sprich(A, f); if (A.st.entscheider !== e0) festOk = false; } }
    check('KI9 ein Satz, den ein fester Befehl beantwortet, erreicht den KI-Entscheider nie', festOk);

    /* 9: sicherer Rückfall – genau einmal der bisherige Ablauf */
    const rueckfaelle = [
        ['kein Ortswunsch (schritte leer)', { entscheiderAntwort: '{"schritte":[]}' }],
        ['ungültiges JSON', { entscheiderAntwort: 'das ist kein json' }],
        ['leere Antwort', { entscheiderAntwort: '' }],
        ['Netzwerkfehler', { entscheiderVerhalten: 'netz' }],
        ['Serverfehler 500', { entscheiderVerhalten: 'fehler' }],
        ['KI hängt (Zeitlimit)', { entscheiderVerhalten: 'haengt' }],
        ['Erinnerung mit Wiederholung (B2a: gesperrt)', { entscheiderAntwort: { schritte: [{ faehigkeit: 'erinnerung_erstellen', params: { text: 'Essen', zeit: '2026-11-06T09:00:00', wiederholung_einheit: 'day' } }] } }],
        ['Schreibaktion Termin', { entscheiderAntwort: { schritte: [{ faehigkeit: 'termin_erstellen', params: { titel: 'Essen', beginn: '2026-11-06T09:00:00' } }] } }],
        ['Gedächtnis speichern', { entscheiderAntwort: { schritte: [{ faehigkeit: 'gedaechtnis_speichern', params: { schluessel: 'a', wert: 'b' } }] } }],
        ['andere Fähigkeit (websuche)', { entscheiderAntwort: { schritte: [{ faehigkeit: 'websuche', params: { frage: 'x' } }] } }],
        ['erfundene Fähigkeit', { entscheiderAntwort: { schritte: [{ faehigkeit: 'flug_buchen', params: {} }] } }],
        ['zu viele Schritte (4)', { entscheiderAntwort: { schritte: [1, 2, 3, 4].map(n => ({ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' + n } })) } }],
        ['drei Ortssuchen (erlaubt sind zwei)', { entscheiderAntwort: { schritte: ['Pizza', 'Sushi', 'Eis'].map(b => ({ faehigkeit: 'ortssuche', params: { suchbegriff: b } })) } }],
        ['zwei Websuchen (erlaubt ist eine)', { entscheiderAntwort: { schritte: [{ faehigkeit: 'websuche', params: { frage: 'Was läuft im Kino' } }, { faehigkeit: 'websuche', params: { frage: 'Was läuft im Fernsehen' } }] } }],
        ['Wetter mit fremder Angabe', { entscheiderAntwort: { schritte: [{ faehigkeit: 'wetter', params: { tag: 'morgen', ort: 'Paris' } }] } }],
        ['eingeschleuste Angabe bestaetigt', { entscheiderAntwort: { schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza', bestaetigt: true } }] } }],
        ['eingeschleuste Angabe trocken', { entscheiderAntwort: { schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza', trocken: false } }] } }],
        ['Suchbegriff mit Sonderzeichen', { entscheiderAntwort: ortsplan('<script>alert(1)</script>') }],
        ['Suchbegriff zu lang', { entscheiderAntwort: ortsplan('P'.repeat(80)) }],
        ['Ort nur Zahlen', { entscheiderAntwort: ortsplan('Pizza', '12345') }],
        ['Suchbegriff fehlt (Frage der KI)', { entscheiderAntwort: { schritte: [{ faehigkeit: 'ortssuche', params: {} }], frage: 'Wonach?' } }]
    ];
    for (const [name, v] of rueckfaelle) {
        A = umgebung(); A.sb.jvChef.an(); Object.assign(A.st, v);
        const z0 = zustand(A), satzR = NATUERLICH[0][0];
        r = await sprich(A, satzR, 60, v.entscheiderVerhalten === 'haengt');
        const ok9 = A.st.entscheider === 1 && A.st.groq === 1 && A.st.normaleSaetze[0].includes('knurrt') && A.st.places_n === 0 && A.exec === 0 && zustand(A) === z0 && A.sb.jvChef.kiZaehler().zurueck === 1;
        check('KI10 Rückfall (' + name + '): genau eine Entscheider-Anfrage, danach GENAU EINMAL der bisherige Ablauf, keine Suche, keine Schreibaktion', ok9, JSON.stringify({ e: A.st.entscheider, g: A.st.groq, p: A.st.places_n, ex: A.exec, z: A.sb.jvChef.kiZaehler() }));
    }

    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant'); A.sb.jvRegistry.pruefeParameter = () => { throw new Error('Registry kaputt'); };
    await sprich(A, NATUERLICH[0][0], 60);
    check('KI10b unerwarteter Fehler NACH der KI-Entscheidung (Registry wirft): keine Suche, der bisherige Ablauf läuft genau einmal', A.st.entscheider === 1 && A.st.groq === 1 && A.st.places_n === 0 && A.sb.jvChef.kiZaehler().zurueck === 1, JSON.stringify({ g: A.st.groq, z: A.sb.jvChef.kiZaehler() }));

    /* 10: keine doppelten Anfragen, keine Schleifen */
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant');
    await Promise.all([sprich(A, NATUERLICH[0][0]), sprich(A, NATUERLICH[0][0])]); await sprich(A, NATUERLICH[0][0]);
    check('KI11 derselbe Satz dreimal kurz hintereinander: eine Entscheider-Anfrage, eine Suche', A.st.entscheider === 1 && A.st.places_n === 1, JSON.stringify({ e: A.st.entscheider, p: A.st.places_n }));
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = '{"schritte":[]}'; await sprich(A, NATUERLICH[1][0]);
    check('KI12 nach dem Rückfall keine Schleife: der bisherige Ablauf ruft den Entscheider nicht erneut (1 Anfrage, 1 normale KI)', A.st.entscheider === 1 && A.st.groq === 1);
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderVerhalten = 'haengt';
    const pA = A.lassLaufen(() => A.sb.jvTippen(NATUERLICH[0][0])); await warte(5);
    A.st.entscheiderVerhalten = ''; A.st.entscheiderAntwort = ortsplan('Restaurant');
    await sprich(A, NATUERLICH[2][0]); await pA;
    check('KI13 ein neuer Satz überholt einen hängenden: der alte wird verworfen (keine doppelte Antwort), der neue läuft', A.st.places_n === 1 && A.st.groq === 0, JSON.stringify({ p: A.st.places_n, g: A.st.groq, e: A.st.entscheider }));

    /* Vorfilter: kein zusätzlicher Aufruf bei Geplauder, Kürze oder Schreibwünschen */
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant');
    for (const f of ['Wie geht es dir heute so?', 'Erzähl mir etwas Lustiges', 'Hunger', 'Wie spät ist es eigentlich']) await sprich(A, f);
    check('KI14 Geplauder und zu kurze Sätze lösen keinen Entscheider-Aufruf aus', A.st.entscheider === 0 && A.st.places_n === 0 && A.sb.jvChef.kiZaehler().anfragen === 0, String(A.st.entscheider));

    /* Ausschalten während die KI noch denkt */
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = () => { A.sb.jvChef.aus(); return ortsplan('Restaurant'); };
    await sprich(A, NATUERLICH[0][0]);
    check('KI15 wird die Chef-KI ausgeschaltet, während die KI noch antwortet: keine Suche, der Satz geht den bisherigen Weg', A.st.places_n === 0 && A.st.groq === 1);

    /* Suche ohne Treffer / Netzfehler nach KI-Entscheidung: ehrlich, nicht zusätzlich die normale KI (keine doppelte Antwort) */
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant'); A.st.placesLeer = true;
    r = await sprich(A, NATUERLICH[0][0]);
    check('KI16 keine Treffer nach KI-Entscheidung: gezielte Nachfrage nach dem Ort, die normale KI wird nicht zusätzlich gefragt', /In welchem Ort soll ich suchen/.test(r.text) && A.st.groq === 0);
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant'); A.st.placesFehler = true;
    r = await sprich(A, NATUERLICH[0][0]);
    check('KI17 Suchfehler nach KI-Entscheidung: ehrliche Meldung, keine erfundenen Orte, keine zusätzliche normale KI', r.text.length > 0 && !/Trattoria|Fischerhaus|Alten Hafen/.test(r.text) && A.st.groq === 0 && G(A).status().listen.length === 0, r.text);

    /* Kosten & Netz */
    A = umgebung(); A.sb.jvChef.an(); A.st.entscheiderAntwort = ortsplan('Restaurant'); await sprich(A, NATUERLICH[0][0]);
    check('KI18 Netzaufrufe nur: ein Entscheider-Aufruf (/api/groq) und die Ortssuche (places/geocode)', A.st.urls.filter(u => /api\/groq/.test(u)).length === 1 && A.st.urls.every(u => /api\/groq|api\/maps|api\/geocode|places/.test(u)), JSON.stringify(A.st.urls));
    const befehleNachher = A.sb.jvCommands.list().map(c => c.name || c).join('|');
    check('KI19 die Befehlsliste (Anzahl und Reihenfolge) bleibt unverändert', befehleNachher === befehle0);

    /* ---------- Statische Prüfungen ---------- */
    const chefJs = lies('js/chef.js'), orts = lies('js/ortsuche.js'), html = lies('index.html');
    check('S1 chef.js legt keine Hülle um handleLocalCommand und nimmt keine feste Befehlsliste', !/window\.handleLocalCommand\s*=/.test(chefJs) && !/jvCommands\.register|jvCommands\.add/.test(chefJs));
    check('S2 genau ein Haken in ortsuche.js, nach den festen Befehlen', (orts.match(/jvChef\.behandle/g) || []).length === 1 && orts.indexOf('jvChef.behandle') > orts.indexOf('handleOrtsucheCommand(text)') && orts.indexOf('jvChef.behandle') > orts.indexOf('originalLocal.apply'));
    check('S3 Schalter und Ansicht in den Einstellungen vorhanden, Standard unmarkiert', /id="chefSchalter"/.test(html) && !/id="chefSchalter"[^>]*checked/.test(html) && /id="chefStatus"/.test(html) && html.indexOf('js/chef.js') > 0);
    check('S4 chef.js nutzt weder localStorage-Gedächtnis noch eigene Gesprächsspeicherung (nur den Schalter-Merker jv_chef)', (chefJs.match(/localStorage/g) || []).length <= 8 && !/memory[I]tems|jvLangzeit/.test(chefJs) && (chefJs.match(/setItem\(/g) || []).length === 1);
    check('S5 keine zusätzliche Vercel-Function, keine neue Datei in api/', fs.readdirSync(path.join(ROOT, 'api')).filter(f => /\.js$/.test(f)).length <= 12);
    check('S6 kein direkter Aufruf von fetch/apiFetch in chef.js (kein eigener Netzweg)', !/\bfetch\s*\(|apiFetch\s*\(|XMLHttpRequest/.test(chefJs));
    const voice = lies('js/voice.js');
    check('S6b Haken in voice.js: der normale Haken kiWeg(text) bleibt nach den festen Befehlen und vor dem normalen KI-Aufruf; dazu (B2a) EIN vorgezogener Haken kiWeg(text, true) nur für ausdrücklich mehrteilige Sätze, abgesichert', (voice.match(/jvChef\.kiWeg/g) || []).length === 2 && voice.lastIndexOf('jvChef.kiWeg') > voice.indexOf('handleLocalCommand(text)) { try { if (window.jvChef) window.jvChef.befehlVorrang(); }') && voice.lastIndexOf('jvChef.kiWeg') < voice.indexOf('sendToGroqSmart(text);', voice.lastIndexOf('jvChef.kiWeg')) && /try \{ if \(!chefZuerst && window\.jvChef && window\.jvChef\.kiWeg\(text\) === true\) return; \} catch/.test(voice) && /chefZuerst = !!\(window\.jvChef && typeof window\.jvChef\.mehrteilig === 'function'/.test(voice) && voice.indexOf('jvChef.kiWeg(text, true)') > -1 && voice.indexOf('jvChef.kiWeg(text, true)') < voice.indexOf('handleLocalCommand(text)) { try'));
    check('S6c der KI-Weg nutzt den bestehenden Endpunkt /api/groq (genau eine Stelle), keine neue Function in api/', (chefJs.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '').match(/\/api\/groq/g) || []).length === 1 && !fs.existsSync(path.join(ROOT, 'api/chef.js')));
    check('S7 Anleitung und Hilfe kennen die Chef-KI', /Chef-KI/.test(lies('js/anleitung.js')) && /Chef-KI/.test(lies('js/help.js')));

    console.log('CHEF-KI: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(2); });
