/* ============================================================
   TESTS Phase 5 Teil 1 "Gesprächsgedächtnis mit der Ortssuche": Start: node tests/gespraech_ort.js
   Echte Wege: KI-Suche (assistant.js -> nearby.js) und Folgesätze über handleLocalCommand (wie voice.js). Netz, Standort, Karten sind Attrappen.
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
    const st = { places: opt.places || PL, kiAktionen: opt.kiAktionen || [{ type: 'nearby_places', places_query: 'Restaurant' }], placesFehler: false, groq: 0, ki: [] };
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, speicher: opt.speicher, fetch: async (u, o) => {
        if (/\/api\/groq/.test(u)) { st.groq++; try { st.ki.push(JSON.parse(o.body)); } catch (e) { } return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Ich suche.', actions: st.kiAktionen }) } }] }); }
        if (/action=places/.test(u)) return st.placesFehler ? { ok: false, status: 500, json: async () => ({}) } : ant({ places: st.places });
        if (/api\/geocode/.test(u)) return ant([{ lat: '53.55', lon: '10.0', class: 'place', display_name: 'Hamburg, Deutschland' }]);
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.st = st;
    A.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.1 });
    A.karten = []; A.sb.showActionCards = c => { A.karten.push(JSON.parse(JSON.stringify(c))); };
    A.opened = []; A.sb.open = (u) => { A.opened.push(u); return {}; };
    A.exec = 0; const e0 = A.sb.executeAction; A.sb.executeAction = function () { A.exec++; return e0.apply(this, arguments); };
    A.kiAufrufe = []; A.kiAttrappe = false;
    return A;
}
async function sucheKI(A, satz) { await A.lassLaufen(() => A.sb.sendToGroqSmart(satz || 'Suche drei Restaurants in Hamburg')); await new Promise(r => setImmediate(r)); }
async function sag(A, satz) {   // wie voice.js: erst feste Befehle
    const g0 = A.gesagt.length, k0 = A.karten.length;
    const l = await A.lassLaufen(() => A.sb.handleLocalCommand(satz));
    return { lokal: !!l.wert, gesagt: A.gesagt.slice(g0), karten: A.karten.slice(k0).filter(c => c.length) };
}
const G = A => A.sb.jvGespraech;
const merkTreffer = A => G(A).status().listen.length ? G(A).waehle(1) : null;

(async () => {
    /* ---------- Grundweg ---------- */
    let A = umgebung();
    check('0a keine Ladefehler, Anbindung vorhanden', A.ladefehler.length === 0 && typeof A.sb.jvOrtGespraech === 'object' && A.sb.handleLocalCommand._ortsuche === true, A.ladefehler.join(';'));
    await sucheKI(A);
    const st = G(A).status();
    check('1a nach einer erfolgreichen Suche sind genau die 3 Treffer gemerkt', st.listen.length === 1 && st.listen[0].anzahl === 3 && st.absicht === 'ortssuche', JSON.stringify(st));
    const erwartet = (await A.lassLaufen(() => A.sb.findNearbyRestaurants('Restaurant', 'Hamburg'))).wert.orte;   // dieselbe Reihenfolge wie gesprochen und auf den Karten
    check('1b Treffer tragen Name, Adresse, Koordinaten und Entfernung', erwartet.length === 3 && erwartet.every(o => o.name && o.adresse && isFinite(o.lat) && isFinite(o.lon) && o.distanzKm > 0 && /^https:\/\/www\.google/.test(o.link)));
    G(A).vergiss(); A.sb.jvOrtGespraech.merke(erwartet, 'test');
    const k = A.sb.jvCommands.list().length;
    let r = await sag(A, 'Das zweite gefällt mir');
    check('1c "Das zweite gefällt mir" -> das zweite Ergebnis, bestätigt mit Namen', r.lokal && r.gesagt.join(' ').includes(erwartet[1].name) && G(A).ausgewaehlt().name === erwartet[1].name, JSON.stringify(r.gesagt));
    check('1d … ohne KI-Aufruf, ohne Aktion', A.st.groq === 1 && A.exec === 0);
    r = await sag(A, 'Wie komme ich dahin?');
    const route = r.karten[0] && r.karten[0][0];
    check('1e "Wie komme ich dahin?" -> Navigationskarte zum gewählten Ort mit dessen Koordinaten', r.lokal && route && route.href.includes(erwartet[1].lat.toFixed(6) + ',' + erwartet[1].lon.toFixed(6)) && /^https:\/\/www\.google\.com\/maps\/dir\//.test(route.href), JSON.stringify(r.karten));
    check('1f … nichts öffnet sich von selbst', A.opened.length === 0);
    r = await sag(A, 'Wie weit ist das entfernt?');
    check('1g Entfernung aus den gemerkten Daten (Luftlinie), keine erfundene Fahrzeit', r.lokal && /Kilometer|Meter/.test(r.gesagt.join(' ')) && /Luftlinie/.test(r.gesagt.join(' ')) && !/Minuten|Stunden/.test(r.gesagt.join(' ').replace('Fahrzeit kenne ich nicht', '')), r.gesagt.join(' '));
    for (const [satz, n] of [['Zeig mir das erste.', 0], ['Was ist mit dem dritten?', 2], ['Das letzte', 2]]) {
        r = await sag(A, satz);
        check('1h "' + satz + '" -> ' + erwartet[n].name, r.lokal && G(A).ausgewaehlt().name === erwartet[n].name, JSON.stringify(r.gesagt));
    }
    r = await sag(A, 'Nein, ich meinte das andere');
    check('1i "Nein, ich meinte das andere" bei 3 Treffern: Rückfrage mit den zwei übrigen, kein Raten', r.lokal && /Welches/.test(r.gesagt.join(' ')) && r.gesagt.join(' ').includes(erwartet[0].name) && r.gesagt.join(' ').includes(erwartet[1].name) && !r.gesagt.join(' ').includes(erwartet[2].name + ','), r.gesagt.join(' '));
    r = await sag(A, 'das zweite');
    check('1j … die Antwort darauf wählt aus den angezeigten Optionen', r.lokal && G(A).ausgewaehlt().name === erwartet[1].name, JSON.stringify(r.gesagt));
    const B = umgebung(); B.sb.jvOrtGespraech.merke(erwartet.slice(0, 2), 'test'); await sag(B, 'Zeig mir das erste.');
    r = await sag(B, 'Nein, ich meinte das andere');
    check('1k bei genau zwei Treffern ist "das andere" eindeutig', r.lokal && G(B).ausgewaehlt().name === erwartet[1].name, JSON.stringify(r.gesagt));

    /* ---------- Rückfragen statt Raten ---------- */
    A = umgebung(); A.sb.jvOrtGespraech.merke(erwartet, 'test');
    r = await sag(A, 'Wie komme ich dahin?');
    check('2a ohne Auswahl bei mehreren Treffern: Rückfrage, keine Navigation', r.lokal && /Welches/.test(r.gesagt.join(' ')) && r.karten.length === 0 && G(A).ausgewaehlt() === null);
    r = await sag(A, 'das zweite');
    check('2b "das zweite" beantwortet die Rückfrage -> Navigation zum zweiten', r.lokal && r.karten[0] && r.karten[0][0].href.includes(erwartet[1].lat.toFixed(6)), JSON.stringify(r));
    A = umgebung(); A.sb.jvOrtGespraech.merke([{ name: 'Pizzeria Roma Nord', lat: 53.5, lon: 10.1 }, { name: 'Roma Süd', lat: 53.4, lon: 10 }, { name: 'Café Blau', lat: 53.3, lon: 10 }], 'test');
    r = await sag(A, 'Roma gefällt mir');
    check('2c Name passt auf zwei Treffer: Rückfrage, nichts gewählt', r.lokal && /Welches/.test(r.gesagt.join(' ')) && G(A).ausgewaehlt() === null && !r.gesagt.join(' ').includes('Café Blau'), r.gesagt.join(' '));
    A = umgebung(); A.sb.jvOrtGespraech.merke(erwartet, 'test');
    r = await sag(A, 'Das fünfte gefällt mir');
    check('2d Nummer außerhalb der Liste: Rückfrage, nichts geraten', r.lokal && /Welches/.test(r.gesagt.join(' ')) && G(A).ausgewaehlt() === null);
    A = umgebung(); A.sb.jvOrtGespraech.merke([{ name: 'Ohne Lage Bistro' }, { name: 'Zweites Lokal' }], 'test');
    await sag(A, 'Das erste');
    r = await sag(A, 'Wie komme ich dahin?');
    check('2e Ziel ohne Koordinaten und ohne Link: keine Navigation angeboten, ehrliche Auskunft', r.lokal && r.karten.length === 0 && /keine genaue Adresse/.test(r.gesagt.join(' ')), JSON.stringify(r));
    A = umgebung(); A.sb.jvOrtGespraech.merke([{ name: 'Link Bistro', link: 'https://www.google.com/maps/dir/?api=1&destination=Link%20Bistro' }, { name: 'Zweites Lokal', lat: 53.5, lon: 10 }], 'test');
    await sag(A, 'Das erste'); r = await sag(A, 'Wie komme ich dahin?');
    check('2f Ziel mit Link (ohne Koordinaten): Navigation über den Link', r.karten[0] && r.karten[0][0].href.includes('Link%20Bistro'));
    A = umgebung(); A.sb.jvOrtGespraech.merke([{ name: 'Nur Name' }, { name: 'Zweites Lokal', lat: 53.5, lon: 10, distanzKm: 3 }], 'test');
    await sag(A, 'Das zweite'); r = await sag(A, 'Wie komme ich dahin?'); const r2 = await sag(A, 'Wie weit ist das entfernt?');
    check('2g Koordinaten ohne Entfernung werden nicht zu einer erfundenen Entfernung', r2.lokal && /Kilometer|Meter/.test(r2.gesagt.join(' ')));
    A = umgebung(); A.sb.jvOrtGespraech.merke([{ name: 'Nur Name' }, { name: 'Zweites Lokal' }], 'test'); await sag(A, 'Das erste');
    const spy = []; A.sb.sendToGroqSmart = t => { spy.push(t); };
    r = await sag(A, 'Wie weit ist das entfernt?');
    check('2h Entfernung unbekannt: nichts erfunden, Frage geht mit Ortskontext an die KI', r.lokal && spy.length === 1 && /Nur Name/.test(spy[0]) && r.gesagt.length === 0);

    /* ---------- Ablauf ---------- */
    A = umgebung(); A.sb.jvOrtGespraech.merke(erwartet, 'test'); await sag(A, 'Das zweite gefällt mir');
    A.uhr.ms += 11 * MIN;
    r = await sag(A, 'Das dritte gefällt mir');
    check('3a Ergebnisse abgelaufen: bittet um neue Suche, wählt nichts', r.lokal && /noch einmal/.test(r.gesagt.join(' ')) && r.karten.length === 0 && !/Okay/.test(r.gesagt.join(' ')), r.gesagt.join(' '));
    A.uhr.ms += 6 * MIN;
    r = await sag(A, 'Wie komme ich dahin?');
    check('3b auch die Auswahl ist nach 15 Minuten verfallen: keine alte Navigation', r.lokal && r.karten.length === 0 && /noch einmal/.test(r.gesagt.join(' ')));
    A.uhr.ms += 40 * MIN;
    r = await sag(A, 'Wie komme ich dahin?');
    check('3c nach langer Ruhe ist alles vergessen: der Satz läuft wie bisher weiter (Hook greift nicht)', r.lokal === false || !r.karten.length);
    check('3c2 … und es ist nichts mehr gemerkt', G(A).status().listen.length === 0 && G(A).ausgewaehlt() === null);

    /* ---------- Neue Suche ersetzt, Fehler erzeugt keinen Kontext ---------- */
    A = umgebung({ places: PL });
    await sucheKI(A); const erste = G(A).waehle(1).ziel.name;
    A.st.places = [{ name: 'Café Neuanfang', street: 'Neustr.', housenumber: '9', city: 'Hamburg', lat: 53.56, lon: 10.02 }, { name: 'Bar Zweitens', street: 'Altstr.', housenumber: '1', city: 'Hamburg', lat: 53.57, lon: 10.03 }];
    await sucheKI(A);
    r = await sag(A, 'Das erste gefällt mir');
    check('4a eine neue Suche ersetzt den bisherigen Bezug vollständig', r.lokal && G(A).ausgewaehlt().name !== erste && /Neuanfang|Zweitens/.test(G(A).ausgewaehlt().name) && G(A).status().listen.length === 1, JSON.stringify(G(A).status()));
    A.st.places = []; await sucheKI(A);
    check('4b eine Suche ohne Treffer ersetzt den Bezug durch "nichts" (keine alten Orte)', G(A).status().listen.length === 1 && G(A).status().listen[0].anzahl === 0 && G(A).ausgewaehlt() === null);
    r = await sag(A, 'Das zweite gefällt mir');
    check('4c … Folgesätze beziehen sich dann auf keinen alten Ort', r.karten.length === 0 && !/Okay/.test(r.gesagt.join(' ')));
    A = umgebung(); await sucheKI(A); await sag(A, 'Das zweite gefällt mir');
    A.st.placesFehler = true; A.sb.overpassSearch = async () => { throw new Error('aus'); };
    await sucheKI(A);
    check('4d eine gescheiterte Suche verwirft den alten Bezug (kein alter Ort als aktueller)', G(A).status().listen.length === 0 && G(A).ausgewaehlt() === null, JSON.stringify(G(A).status()));
    r = await sag(A, 'Wie komme ich dahin?');
    check('4e … "Wie komme ich dahin?" navigiert danach nirgends hin', r.karten.length === 0);
    check('4f ohne Suche (nichts gemerkt) gibt es nichts zu verwerfen und nichts wird erfunden', (() => { const X = umgebung(); X.sb.jvOrtGespraech.fehler(); return G(X).status().listen.length === 0; })());
    check('4g andere KI-Aktionen als Ortssuche erzeugen keinen Ortsbezug', await (async () => { const X = umgebung({ kiAktionen: [{ type: 'chat' }] }); await sucheKI(X, 'Wie geht es dir'); return G(X).status().listen.length === 0; })());

    /* ---------- Falsche Auslöser ---------- */
    const SAETZE = ['Wie spät ist es', 'Erinner mich morgen an das dritte Treffen', 'Was kostet das Brot?', 'Wie wird das Wetter morgen', 'Hallo', 'Zum ersten Mal in Hamburg', 'Das letzte Mal war ich krank', 'Mach das Licht an',
        'Wie komme ich nach Hause', 'Erste Hilfe Kurs', 'Setz Milch auf die Einkaufsliste', 'Wie geht es dir', 'Was ist das', 'Am dritten Oktober habe ich Urlaub', 'Das zweite Frühstück', 'Wie lange dauert der Film'];
    for (const satz of SAETZE) {
        const X = umgebung(), Y = umgebung(); X.sb.jvOrtGespraech.merke(erwartet, 'test');
        const a = await sag(X, satz), b = await sag(Y, satz);
        check('5 anderes Thema löst keine Ortsauswahl aus: "' + satz + '"', G(X).ausgewaehlt() === null && JSON.stringify(a.gesagt) === JSON.stringify(b.gesagt) && a.lokal === b.lokal && JSON.stringify(X.store) === JSON.stringify(Y.store), JSON.stringify([a.gesagt, b.gesagt]));
    }

    /* ---------- Weiterleitung an die KI ---------- */
    A = umgebung(); A.sb.jvOrtGespraech.merke(erwartet, 'test'); await sag(A, 'Das zweite gefällt mir');
    const sp = []; A.sb.sendToGroqSmart = t => { sp.push(t); };
    for (const satz of ['Gibt es dort Parkplätze?', 'Wann hat das auf?', 'Wie ist die Telefonnummer von dem Restaurant?', 'Was kostet es dort?']) {
        sp.length = 0; const x = await sag(A, satz);
        check('6a "' + satz + '" -> an die bestehende KI mit eindeutigem Ortskontext, lokal nichts erfunden', x.lokal && sp.length === 1 && sp[0].startsWith(satz) && sp[0].includes(erwartet[1].name) && sp[0].includes(erwartet[1].adresse) && /Erfinde keine/.test(sp[0]) && x.gesagt.length === 0, JSON.stringify([x.lokal, sp, x.gesagt]));
    }

    /* ---------- Bestehendes bleibt ---------- */
    A = umgebung(); const ref = umgebung(); ref.sb.handleLocalCommand = ref.sb.handleLocalCommand;
    check('7a ohne gemerkte Treffer verhält sich jeder Satz wie vorher (Stichprobe aus bestehenden Befehlen)', await (async () => {
        for (const satz of ['Wie spät ist es', 'Hallo', 'Wie komme ich dahin?', 'Das zweite gefällt mir', 'Zeig mir das erste', 'Gibt es dort Parkplätze?']) {
            const X = umgebung(); const a = await sag(X, satz);
            const Y = umgebung(); const orig = Object.getPrototypeOf(Y.sb) && Y.sb.handleLocalCommand; // gleiche Umgebung, Hook per Zustand "leer" -> darf nichts tun
            const b = await sag(Y, satz);
            if (JSON.stringify(a) !== JSON.stringify(b)) return false;
        }
        return true;
    })());
    check('7b die Befehlsliste (jvCommands) ist unverändert und enthält nichts vom Gesprächsgedächtnis', !/gespraech|ort_gespraech/i.test(JSON.stringify(A.sb.jvCommands.list())) && A.sb.jvCommands.list().length === k);
    check('7c keine neue Hülle um handleLocalCommand: die äußerste bleibt die der Ortssuche (Reihenfolge der Hüllen unverändert)', A.sb.handleLocalCommand._ortsuche === true && !A.sb.handleLocalCommand._jvOrtGespraech && A.sb.handleLocalCommand._jvCommands === umgebung().sb.handleLocalCommand._jvCommands);
    const cardsOld = (await A.lassLaufen(() => A.sb.findNearbyRestaurants('Restaurant', 'Hamburg'))).wert;
    check('7d die Karten der bestehenden Ortssuche sind unverändert (nur title/subtitle/icon/href), zusätzlich nur "orte"', cardsOld.cards.every(c => Object.keys(c).sort().join() === 'href,icon,subtitle,title') && Object.keys(cardsOld).sort().join() === 'cards,orte,reply');
    A = umgebung(); await sucheKI(A);
    check('7e die Suche selbst erzeugt weder Aktion noch Termin noch Erinnerung noch Speicherzugriff', A.exec === 0 && !(A.lese('reminderEntries') || []).length && !(A.lese('calendarEntries') || []).length);
    A = umgebung(); await sucheKI(A); const ms0 = JSON.stringify(A.lese('memoryItems'));
    await sag(A, 'Das zweite gefällt mir'); await sag(A, 'Wie komme ich dahin?'); await sag(A, 'Nein, ich meinte das andere'); await sag(A, 'Gibt es dort Parkplätze?');
    check('7f Folgefragen verändern das Langzeitgedächtnis nicht und lösen keine Aktionen aus', JSON.stringify(A.lese('memoryItems')) === ms0 && A.exec === 0);

    /* ---------- Adresse-speichern-Frage der Ortssuche ---------- */
    A = umgebung(); await sucheKI(A);   // die Suche bietet "Adresse speichern? 1, 2, 3 oder Nein" an
    check('8a die Speichern-Frage der Ortssuche ist nach der Suche offen (ortsuche.js unverändert)', /Adressen in Ihren App-Kontakten speichern/.test(A.gesagt.join(' ')));
    r = await sag(A, 'Das zweite gefällt mir');
    check('8b "Das zweite gefällt mir" wird trotz offener Speichern-Frage vom Gesprächsgedächtnis beantwortet', r.lokal && G(A).ausgewaehlt() !== null);
    A = umgebung(); await sucheKI(A);
    r = await sag(A, 'die zweite');
    check('8c ein bloßes "die zweite" bleibt bei der Speichern-Frage (bisheriges Verhalten): das Gedächtnis wählt nichts', G(A).ausgewaehlt() === null, JSON.stringify(r.gesagt));
    A = umgebung(); await sucheKI(A); await sag(A, 'Nein');
    check('8d "Nein" schließt die Speichern-Frage wie bisher (Antwort der Ortssuche, kein Gedächtnis-Eingriff)', A.gesagt.slice(-1)[0] === 'Alles klar, ich speichere keine Adresse.' && G(A).ausgewaehlt() === null, A.gesagt.slice(-1)[0]);

    /* ---------- Fehlerfestigkeit ---------- */
    A = umgebung(); A.sb.jvOrtGespraech.merke(erwartet, 'test'); G(A).aufloesen = () => { throw new Error('kaputt'); };
    let w = false; try { await sag(A, 'Wie spät ist es'); } catch (e) { w = true; }
    check('9a ein Fehler im Gesprächsgedächtnis stört die Befehle nicht (Satz läuft wie vorher weiter)', !w);
    A = umgebung(); delete A.sb.jvGespraech; w = false; try { await sag(A, 'Wie spät ist es'); A.sb.jvOrtGespraech.merke([{ name: 'x' }]); A.sb.jvOrtGespraech.fehler(); } catch (e) { w = true; }
    check('9b ohne jvGespraech: kein Absturz', !w);
    A = umgebung(); w = false; try { for (const x of [null, undefined, 5, {}, 'x'.repeat(5000)]) { A.sb.jvOrtGespraech.merke(x); A.sb.jvOrtGespraech.behandle(x); } } catch (e) { w = true; }
    check('9c Müll als Eingabe: kein Absturz', !w);

    /* ---------- Schattenbetrieb dazu ---------- */
    const lauf = async (schatten) => {
        const X = umgebung(); if (schatten) X.sb.jvSchatten.an();
        await sucheKI(X); const gs = [];
        for (const s of ['Das zweite gefällt mir', 'Wie komme ich dahin?', 'Wie weit ist das entfernt?', 'Hallo']) { const q = await sag(X, s); gs.push([q.lokal, q.gesagt, q.karten]); }
        return JSON.stringify({ gs, store: X.store, exec: X.exec, groq: X.st.groq, aufrufe: X.aufrufe.length });
    };
    check('10 Schattenbetrieb EIN verändert nichts: gleiche Antworten, gleicher Speicher, keine zusätzlichen Aktionen/Aufrufe', await lauf(false) === await lauf(true));

    /* ---------- Mehrere Rückfragen gleichzeitig offen: Letzte Frage gewinnt ---------- */
    const terminKI = [{ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: '2026-11-06T10:00:00' }];
    const JF = A => A.sb.jvFrage;
    async function terminFrage(X) {   // echte Termin-Erinnerungsfrage: "Wie viele Stunden vorher soll ich dich per Push erinnern?"
        const alt = X.st.kiAktionen; X.st.kiAktionen = terminKI; await sucheKI(X, 'Trag morgen um zehn Zahnarzt ein'); X.st.kiAktionen = alt;
        return JF(X).aktuell() === 'termin-erinnern';
    }
    /* a) Ortsauswahl UND "Adresse speichern?" offen, die Ortsfrage ist die jüngste */
    A = umgebung(); await sucheKI(A);
    check('12a Ausgangslage: Treffer gemerkt und "Adresse speichern?" offen', G(A).status().listen[0].anzahl === 3 && A.sb.jvSpeichernOffen() === true && JF(A).aktuell() === 'ortsuche');
    r = await sag(A, 'Wie komme ich dahin?');
    check('12b Rückfrage "Welches meinst du?" ist offen und die jüngste Frage; "Adresse speichern?" bleibt offen', /Welches/.test(r.gesagt.join(' ')) && G(A).offeneFragen().length === 1 && JF(A).aktuell() === 'gespraech_ort' && A.sb.jvSpeichernOffen() === true);
    const storeVor = JSON.stringify(A.store);
    r = await sag(A, 'nein');
    check('12c "nein" beantwortet die jüngste Frage (Ortsauswahl), NICHT "Adresse speichern?"', r.lokal && /lasse es/.test(r.gesagt.join(' ')) && !/speichere keine Adresse/.test(r.gesagt.join(' ')) && A.sb.jvSpeichernOffen() === true && G(A).offeneFragen().length === 0, r.gesagt.join(' '));
    A = umgebung(); await sucheKI(A); await sag(A, 'Wie komme ich dahin?');
    const s0 = JSON.stringify(A.store);
    r = await sag(A, 'die zweite');
    check('12d "die zweite" wählt das Lokal (jüngste Frage) und speichert KEINE Adresse', r.lokal && G(A).ausgewaehlt() && G(A).ausgewaehlt().nr === 2 && r.karten[0] && /Route zu/.test(r.karten[0][0].title) && !/gespeichert|Kontakt/i.test(r.gesagt.join(' ')) && JSON.stringify(A.store) === s0, r.gesagt.join(' '));
    /* b) nur "Adresse speichern?" offen */
    A = umgebung(); await sucheKI(A);
    r = await sag(A, 'die zweite');
    check('12e bloßes "die zweite" gehört der offenen Frage "Adresse speichern?" (bisheriges Verhalten), das Gedächtnis wählt nichts', G(A).ausgewaehlt() === null && !/Okay,|Route zu/.test(r.gesagt.join(' ')), r.gesagt.join(' '));
    A = umgebung(); await sucheKI(A);
    r = await sag(A, 'Nein');
    check('12f "Nein" schließt "Adresse speichern?" wie bisher', /speichere keine Adresse/.test(r.gesagt.join(' ')) && G(A).ausgewaehlt() === null);
    A = umgebung(); await sucheKI(A);
    r = await sag(A, 'Das zweite');
    check('12g mehrdeutiges "Das zweite" bei offener Speichern-Frage und ohne Auswahl: es wird nachgefragt, nichts gewählt, nichts gespeichert', r.lokal && /Adresse speichern oder ein Lokal auswählen/.test(r.gesagt.join(' ')) && G(A).ausgewaehlt() === null && G(A).offeneFragen().length === 0 && !/gespeichert/.test(r.gesagt.join(' ')), r.gesagt.join(' '));
    r = await sag(A, 'Das zweite gefällt mir');
    check('12h eindeutiger Satz "Das zweite gefällt mir" wird trotz offener Speichern-Frage beantwortet', r.lokal && G(A).ausgewaehlt() && G(A).ausgewaehlt().nr === 2);
    r = await sag(A, 'Das erste');
    check('12i nach einer ausdrücklichen Auswahl ist der Ortsdialog der jüngste: "Das erste" wählt das erste Lokal', r.lokal && G(A).ausgewaehlt().nr === 1, r.gesagt.join(' '));
    /* c) echte Termin-Erinnerungsfrage ist jünger als die Ortsergebnisse */
    A = umgebung(); await sucheKI(A);
    check('12j echte Termin-Erinnerungsfrage wird nach der Ortssuche gestellt und ist die jüngste', await terminFrage(A) && /Stunden vorher/.test((A.gesagt.concat(A.ereignisse.map(e => e.text || ''))).join(' ')) || JF(A).aktuell() === 'termin-erinnern');
    r = await sag(A, 'nein');
    check('12k "nein" gehört der Termin-Erinnerungsfrage ("dann erinnere ich dich nicht"), nicht dem Ort', r.lokal && /erinnere ich dich nicht/.test(r.gesagt.join(' ')) && G(A).ausgewaehlt() === null && G(A).offeneFragen().length === 0, r.gesagt.join(' '));
    A = umgebung(); await sucheKI(A); await terminFrage(A);
    r = await sag(A, 'das zweite');
    check('12l bloßes "das zweite" wird bei jüngerer Termin-Erinnerungsfrage NICHT als Ortsauswahl gewertet', G(A).ausgewaehlt() === null && !/Okay,/.test(r.gesagt.join(' ')) && G(A).offeneFragen().length === 0, r.gesagt.join(' '));
    r = await sag(A, 'das andere');
    check('12m "das andere" ebenso', G(A).ausgewaehlt() === null && G(A).offeneFragen().length === 0);
    r = await sag(A, 'Zeig mir das erste und wie komme ich dahin');
    check('12n ein ausdrücklicher Ortssatz wird trotzdem beantwortet, und die Termin-Frage gerät nicht durcheinander', r.lokal && G(A).ausgewaehlt() !== null);
    r = await sag(A, 'nein');
    check('12o die Termin-Erinnerungsfrage ist weiter unbeantwortet und die jüngste Frage: ein späteres "nein" gehört ihr (richtig zugeordnet), nicht dem Ort', r.lokal && /erinnere ich dich nicht/.test(r.gesagt.join(' ')) && G(A).ausgewaehlt() !== null, r.gesagt.join(' '));
    /* d) Ortsfrage ist jünger als eine Termin-Erinnerungsfrage */
    A = umgebung(); await terminFrage(A); await sucheKI(A);
    r = await sag(A, 'Wie komme ich dahin?');
    check('12p Termin-Erinnerungsfrage ist älter, die Ortsfrage jünger: "Welches meinst du?" ist offen und die jüngste', /Welches/.test(r.gesagt.join(' ')) && JF(A).aktuell() === 'gespraech_ort');
    r = await sag(A, 'nein');
    check('12q "nein" beantwortet die jüngere Ortsfrage; die ältere Termin-Frage bleibt unberührt (nicht abgesagt)', r.lokal && /lasse es/.test(r.gesagt.join(' ')) && !/erinnere ich dich nicht/.test(r.gesagt.join(' ')));
    A = umgebung(); await terminFrage(A); await sucheKI(A); await sag(A, 'Wie komme ich dahin?');
    r = await sag(A, 'ja');
    check('12r "ja" bei jüngster Ortsfrage geht an niemanden (nicht an die ältere Termin-Frage): keine Erinnerung angelegt', !r.lokal && !/erinnere|Erinnerung/.test(r.gesagt.join(' ')) && (A.lese('reminderEntries') || []).length === 0, r.gesagt.join(' '));
    /* e) Kontakt-Rückfrage ("Welchen meinst du: Anna Müller oder Anna Schmidt?") jünger */
    A = umgebung(); await sucheKI(A);
    A.sb.jvRueckfrage.vorbereiten('Anna', ['Anna Müller', 'Anna Schmidt'], 'Ruf Anna an', false);
    r = await sag(A, 'das zweite');
    check('12s "das zweite" beantwortet die jüngere Kontakt-Rückfrage, nicht die Ortsauswahl', G(A).ausgewaehlt() === null && A.sb.jvRueckfrage.offen() === null && G(A).offeneFragen().length === 0, r.gesagt.join(' '));
    /* f) weitere Module, die ein Modul "zuletzt gefragt" haben: kurze Antworten bleiben bei ihnen */
    for (const modul of ['plan_wecker', 'dirigent', 'zuvorkommend', 'terminfinder', 'mailaktionen', 'ausflug']) {
        const X = umgebung(); X.sb.jvOrtGespraech.merke(erwartet, 'test');
        X.sb.jvFrage.neu(modul);
        const res = [];
        for (const satz of ['das zweite', 'das andere', 'nein', 'ja', 'die erste', 'Nummer 2']) { const q = await sag(X, satz); res.push(G(X).ausgewaehlt() === null && G(X).offeneFragen().length === 0); }
        check('12t kurze Antworten bleiben bei der jüngeren Frage von "' + modul + '" (6 Sätze, nichts gewählt)', res.every(Boolean), JSON.stringify(res));
        const e = await sag(X, 'Wie komme ich dahin?');
        check('12u … ein ausdrücklicher Ortssatz wird weiter beantwortet (' + modul + ')', e.lokal && /Welches/.test(e.gesagt.join(' ')));
    }
    /* g) die Fristen: eine abgelaufene Ortsfrage blockiert niemanden */
    A = umgebung(); await sucheKI(A); await sag(A, 'Wie komme ich dahin?');
    A.uhr.ms += 3 * MIN;
    check('12v nach 3 Minuten ist die Ortsfrage verfallen (kein offener Zustand mehr)', G(A).offeneFragen().length === 0);
    /* h) Schutztests unverändert vorhanden */
    check('12w die Schutztests der Fragen-Reihenfolge laufen weiter (Datei vorhanden, nichts abgeschwächt)', fs.existsSync(path.join(ROOT, 'tests/pending_reihenfolge.js')) && fs.existsSync(path.join(ROOT, 'tests/pending_zweite_stufe.js')) && fs.existsSync(path.join(ROOT, 'tests/dirigent_fragen.js')));

    /* ---------- Statisch ---------- */
    const code = lies('js/gespraech_ort.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check('11a Klebstoff-Datei: kein Netz, kein Speichern, keine Zeitgeber, kein Langzeitgedächtnis, kein Kalender, keine Erinnerung, keine Aktionen', !/fetch\(|apiFetch|localStorage|sessionStorage|setPersistentData|setItem|setTimeout|setInterval|memoryItems|searchMemory|addMemory|calendarEntries|reminderEntries|executeAction|window\.open|location\./.test(code), (code.match(/fetch\(|apiFetch|localStorage|setItem|setTimeout|memoryItems|calendarEntries|reminderEntries|executeAction|window\.open/) || [])[0]);
    const nutzer = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !/^(gespraech|gespraech_ort|chef)\.js$/.test(f)).filter(f => /jvGespraech\b/.test(lies('js/' + f)));
    check('11b nur gespraech_ort.js (und die Chef-KI, Phase 6) benutzt window.jvGespraech (keine zweite Gesprächsspeicherung)', nutzer.length === 0, nutzer.join());
    const aufr = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'gespraech_ort.js' && f !== 'chef.js').filter(f => /jvOrtGespraech/.test(lies('js/' + f)));
    check('11c die Ortssuche meldet nur über abgesicherte Einzeiler (assistant.js, ortsuche.js)', aufr.sort().join() === 'assistant.js,ortsuche.js' && (lies('js/assistant.js').match(/jvOrtGespraech/g) || []).length === 4 && (lies("js/ortsuche.js").match(/jvOrtGespraech/g) || []).length === 13 && !/jvOrtGespraech\.(?!merke|fehler|behandle|hatFrage)/.test(lies('js/assistant.js') + lies('js/ortsuche.js')), aufr.join());
    check('11d weckruf-src unberührt (kein neuer APK-Bau nötig)', !fs.existsSync(path.join(ROOT, 'weckruf-src')) || !/gespraech|jvOrt/.test(require('child_process').execSync('git status --short weckruf-src || true', { cwd: ROOT }).toString()));

    console.log(`GESPRÄCH_ORT: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABSTURZ', e && e.stack || e); process.exit(2); });
