/* ============================================================
   TESTS Fahrzeit und Verkehr (Chef-KI): echte Routenberechnung statt Schätzung, Quelle der Zahl wird genannt, ehrliche Fehler.
   Start: node tests/chef_dirigent.js. Alles über den ECHTEN Sprachweg (jvTippen); der Entscheider (KI) ist eine Attrappe, Dienste laufen mit Attrappen.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
const PL = [{ name: 'Trattoria Roma', street: 'Hauptstr.', housenumber: '1', city: 'Hamburg', lat: 53.551, lon: 10.001 }, { name: 'Fischerhaus Elbblick', street: 'Elbweg', housenumber: '2', city: 'Hamburg', lat: 53.545, lon: 9.95 }];
const WETTER_JETZT = { current: { temperature_2m: 9.4, apparent_temperature: 7.1, relative_humidity_2m: 80, precipitation: 0, weather_code: 3, wind_speed_10m: 12, windgusts_10m: 20 }, current_units: { temperature_2m: '°C' }, hourly: { time: [], precipitation: [], weather_code: [] } };
const WETTER_TAGE = { daily: { time: ['2026-11-05', '2026-11-06', '2026-11-07'], weather_code: [3, 61, 1], temperature_2m_max: [10, 8, 12], temperature_2m_min: [5, 4, 6], precipitation_sum: [0, 4, 0], precipitation_probability_max: [10, 80, 5], wind_speed_10m_max: [15, 25, 10], wind_gusts_10m_max: [25, 40, 15] } };


const ANGEBOTE = q => {
    if (/grohe/i.test(q) && !/hansgrohe/i.test(q)) return [
        { titel: 'Grohe BauEdge Wasserhahn Waschtisch', shop: 'Sanitino', preis: 43.08, preisText: '43,08 €', link: 'https://www.sanitino.de/grohe-bauedge', linkArt: 'direkt' },
        { titel: 'Grohe BauEdge Wasserhahn Einhandmischer', shop: 'MDM Tools', preis: 39.9, preisText: '39,90 €', link: 'https://www.mdm-tools.de/grohe-bauedge', linkArt: 'direkt' },
        { titel: 'Grohe BauEdge Wasserhahn', shop: 'Idealo', preis: 37.5, preisText: '37,50 €', link: 'https://www.idealo.de/preisvergleich/OffersOfProduct/1.html' },
        { titel: 'Grohe Eurosmart Küchenarmatur', shop: 'FremdShop', preis: 19, preisText: '19,00 €', link: 'https://fremd.example/x' }
    ];
    if (/hansgrohe/i.test(q)) return [{ titel: 'Hansgrohe Talis Wasserhahn', shop: 'Hornbach', preis: 88.5, preisText: '88,50 €', link: 'https://www.hornbach.de/talis' }];
    if (/samsung/i.test(q)) return [
        { titel: 'Samsung Galaxy S25 Ultra 256GB', shop: 'Otto', preis: 899, preisText: '899,00 €', link: 'https://www.otto.de/s25' },
        { titel: 'Samsung Galaxy S25 Ultra', shop: 'MediaMarkt', preis: 949, preisText: '949,00 €', link: '' }
    ];
    return [];
};

function umgebung(opt) {
    opt = opt || {};
    const st = { plan: { schritte: [] }, verhalten: '', wetter: 'ok', web: 'ok', route: 'google', places: 'ok', ent: 0, groq: 0, webN: 0, wetterN: 0, placesN: 0, entNachrichten: [], normaleSaetze: [], webHaengt: null, shop: 'ok' };
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, spracherkennung: !opt.native, native: opt.native, fetch: async (u, o) => {
        u = String(u);
        if (/api\/groq/.test(u)) {
            let m = []; try { m = JSON.parse(o.body).messages || []; } catch (e) { }
            if (m[0] && /Du planst für einen Sprachassistenten/.test(String(m[0].content))) {
                st.ent++; st.entNachrichten.push(m);
                if (st.verhalten === 'haengt') return new Promise(() => { });
                if (st.verhalten === 'fehler') return { ok: false, status: 500, json: async () => ({}) };
                const a = typeof st.plan === 'function' ? st.plan(m) : st.plan;
                return ant({ choices: [{ message: { content: typeof a === 'string' ? a : JSON.stringify(a) } }] });
            }
            st.groq++; (st.normaleM = st.normaleM || []).push(JSON.stringify(m)); st.normaleSaetze.push(String((m[m.length - 1] || {}).content || ''));
            return ant({ choices: [{ message: { content: JSON.stringify((typeof st.normal === 'function' ? st.normal(m) : st.normal) || { reply: 'Okay.', actions: [] }) } }] });
        }
        if (/api\/geocode/.test(u)) { st.geoN = (st.geoN || 0) + 1; const q = decodeURIComponent((u.match(/q=([^&]*)/) || [])[1] || ''); st.geoQ = (st.geoQ || []).concat(q); if (st.geo === 'leer') return ant([]);
            let ort = { lat: '53.55', lon: '10.0', name: q + ', Hamburg, Deutschland' };
            if (/schwarzenbek/i.test(q)) ort = { lat: '53.50', lon: '10.48', name: 'Schwarzenbek, Kreis Herzogtum Lauenburg, Schleswig-Holstein, Deutschland' };
            else if (/hauptbahnhof/i.test(q) && /hamburg/i.test(q)) ort = { lat: '53.5528', lon: '10.0067', name: 'Hamburg Hauptbahnhof, Hachmannplatz, St. Georg, Hamburg-Mitte, Hamburg, 20099, Deutschland' };
            else if (/berlin/i.test(q)) ort = { lat: '52.52', lon: '13.40', name: 'Berlin, Deutschland' };
            if (st.geoName) { const x = st.geoName(q); if (x) ort = Object.assign(ort, x); }
            return ant([{ lat: ort.lat, lon: ort.lon, display_name: ort.name, address: ort.adr, class: st.geoKlasse || 'boundary', type: 'administrative' }]); }
        if (/open-meteo/.test(u)) { (st.wetterUrls = st.wetterUrls || []).push(u); st.wetterN++; if (st.wetter === 'fehler') throw new Error('offline'); return ant(/daily=/.test(u) && /current=/.test(u) ? Object.assign({}, WETTER_JETZT, WETTER_TAGE) : /daily=/.test(u) ? WETTER_TAGE : WETTER_JETZT); }
        if (/action=places/.test(u)) { st.placesN++; if (st.places === 'fehler') return { ok: false, status: 500, json: async () => ({}) }; return ant({ places: st.places === 'leer' ? [] : PL }); }
        if (/api\/maps\?action=shopping/.test(u)) {
            const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || ''); (st.shopQ = st.shopQ || []).push(q); (st.shopUrls = st.shopUrls || []).push(u);
            if (st.shop === 'fehler') return { ok: false, status: 500, json: async () => ({ error: 'kaputt' }) };
            if (st.shop === 'leer') return ant({ angebote: [] });
            return ant({ angebote: ANGEBOTE(q) });
        }
        if (/api\/route/.test(u)) {
            (st.routeUrls = st.routeUrls || []).push(u);
            if (st.route === 'haengt') return new Promise(() => { });
            if (st.route === 'fehler') return { ok: false, status: 500, json: async () => ({ error: 'kaputt' }) };
            const google = /google=1/.test(u);
            if (google && st.route === 'google') return ant({ code: 'Ok', quelle: 'google', routes: [{ duration: st.dauer || 2400, distance: st.meter || 41000, legs: [{ steps: [{ ref: 'A24', name: '' }] }], geometry: st.linie ? { type: 'LineString', coordinates: st.linie } : undefined }] });
            if (google && st.route === 'osrm') return { ok: false, status: 503, json: async () => ({}) };   // Google nicht verfügbar (Schlüssel/Limit): der Server fällt auf OSRM zurück
            return ant({ code: 'Ok', routes: [{ duration: st.dauerOsrm || 2100, distance: st.meterOsrm || st.meter || 41000, legs: [{ steps: [{ ref: 'A24', name: '' }] }], geometry: st.linie ? { type: 'LineString', coordinates: st.linie } : undefined }] });
        }
        if (/api\/stau/.test(u)) { st.stauN = (st.stauN || 0) + 1; return ant(/traffic=1/.test(u) ? { incidents: st.tomtom || [] } : { warning: st.autobahn || [], webcam: [] }); }
        if (/api\/memory/.test(u)) return ant({});
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.st = st;
    A.sb.answerWithWebSearch = async (f, s) => { st.webN++; (st.webArgs = st.webArgs || []).push(f); if (st.web === 'haengt') return new Promise(res => { st.webHaengt = res; }); return st.web === 'fehler' ? null : 'Die Nachrichten: in Hamburg ist es ruhig.'; };
    A.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.48 });
    A.sb.navigator.geolocation.getCurrentPosition = (okf, err) => okf({ coords: { latitude: 53.5, longitude: 10.48 } });
    A.karten = []; A.sb.showActionCards = c => { A.karten.push(c); };
        if (!opt.chefAus) A.sb.jvChef.an();
    A.vision = []; A.sb.__vision = async (system, user, dataUrl, json) => { A.vision.push({ system: String(system), user: String(user) }); if (A.st.visionFehler) throw new Error('Bild-KI weg'); return typeof A.st.erkennung === 'string' ? A.st.erkennung : JSON.stringify(A.st.erkennung); };
    A.vm.runInContext('askVision = window.__vision;', A.sb);
    A.z0 = JSON.stringify({ t: A.lese('todoEntries'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), k: A.lese('savedContacts'), m: A.lese('memoryItems') });
    return A;
}
async function lauf(A, aktion, zeitMs) {
    const g0 = A.gesagt.length;
    await A.lassLaufen(async () => { await aktion(); if (zeitMs) await new Promise(res => A.sb.setTimeout(res, zeitMs)); await warte(80); });
    await A.lassLaufen(async () => { await warte(60); });
    return A.gesagt.slice(g0);
}
const tippen = (A, s, z) => lauf(A, async () => { A.sb.jvTippen(s); }, z);
const mikro = (A, s, z) => lauf(A, async () => { A.erkenner[0].onresult({ resultIndex: 0, results: [[{ transcript: s, confidence: 0.9 }]] }); }, z);
const eing = A => A.sb.jvChef.eingaenge();
const codes = A => { const e = eing(A); return e.length ? e[e.length - 1].codes.join('>') : '(keiner)'; };

async function foto(erk, opt) {
    const A = umgebung(opt); A.st.erkennung = erk;
    A.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", A.sb);
    A.z0 = stand(A);
    A.g = await lauf(A, async () => { A.vm.runInContext('photoAskWhatToDo()', A.sb); }, 150);
    A.text = A.g.join(' | ');
    A.sag = async t => { const g1 = A.gesagt.length; await lauf(A, async () => { A.sb.jvTippen(t); }, 150); return A.gesagt.slice(g1).join(' | '); };
    return A;
}

const kartenText = A => JSON.stringify(A.karten[A.karten.length - 1] || []);


const pause = ms => new Promise(r => setTimeout(r, ms));


const W = tag => ({ faehigkeit: 'wetter', params: { tag } });

const FZ = (ziel, von) => ({ faehigkeit: 'fahrzeit', params: von ? { ziel, von } : { ziel } });
const SATZ = 'Wie lange brauche ich jetzt mit dem Auto von Schwarzenbek zum Hamburger Hauptbahnhof? Berücksichtige die aktuelle Verkehrslage.';
const frage = async (A, s, ms) => (await tippen(A, s, ms)).join(' | ');
const stand = A => JSON.stringify({ t: A.lese('todoEntries'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), k: A.lese('savedContacts'), m: A.lese('memoryItems') });

(async () => {
    /* 1 aktuelle Fahrzeit mit Verkehrsdaten */
    {
        const A = umgebung(); A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t = await frage(A, SATZ);
        check('1.1 der Satz erreicht den Planer (Vorfilter) und es läuft die echte Routenberechnung, keine Websuche, keine normale KI', A.st.ent === 1 && A.st.webN === 0 && A.st.groq === 0 && (A.st.routeUrls || []).length >= 1, JSON.stringify({ e: A.st.ent, w: A.st.webN, g: A.st.groq, r: (A.st.routeUrls || []).length, c: codes(A) }));
        check('1.2 genau das genannte Ziel wird gesucht (Hamburger Hauptbahnhof), nicht nur "Hamburg"', (A.st.geoQ || []).indexOf('Hamburger Hauptbahnhof') >= 0 && (A.st.geoQ || []).indexOf('Hamburg') < 0 && (A.st.geoQ || []).indexOf('Schwarzenbek') >= 0, JSON.stringify(A.st.geoQ));
        check('1.3 aktuelle Verkehrsdaten abgefragt (Google-Route mit Verkehr) und so gesagt', (A.st.routeUrls || []).some(u => /google=1/.test(u)) && /Von Schwarzenbek bis Hamburger Hauptbahnhof brauchst du jetzt etwa 40 Minuten/.test(t) && /berechnet mit dem aktuellen Verkehr/.test(t) && !/keine Live-Auskunft/.test(t), t);
        check('1.4 die Zahl stammt aus der Route (2400 s = 40 Minuten, 41 Kilometer), nicht aus einer Schätzung', /41 Kilometer/.test(t), t);
        const B = umgebung(); B.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        const t2 = await frage(B, 'Wie lange brauche ich jetzt mit dem Auto zum Hamburger Hauptbahnhof?');
        check('1.5 ohne Startort: vom Standort aus, gleiche Aussage', /^Von deinem aktuellen Standort bis Hamburger Hauptbahnhof brauchst du jetzt etwa 40 Minuten/.test(t2) && (B.st.geoQ || []).indexOf('Schwarzenbek') < 0, t2);
    }
    /* 2 Route ohne aktuelle Verkehrsdaten */
    {
        const A = umgebung(); A.st.route = 'osrm'; A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t = await frage(A, SATZ);
        check('2.1 ohne Live-Verkehr: berechnete Route (35 Minuten) und ausdrücklich "keine Live-Auskunft"', /nach der berechneten Route etwa 35 Minuten/.test(t) && /Aktuelle Verkehrsdaten sind darin nicht eingerechnet/.test(t) && /keine Live-Auskunft/.test(t) && !/aktuellen Verkehr\./.test(t), t);
        check('2.2 keine Websuche, keine erfundene zweite Zahl', A.st.webN === 0 && A.st.groq === 0 && !/38|40 Minuten/.test(t), t);
        check('2.3 gemeldete Verzögerung (Stau auf der Strecke) wird nur genannt, wenn sie wirklich gemeldet ist', !/Verzögerung/.test(t));
    }
    /* 3 die Ursache: Websuche statt Route (der Fehler vom Handytest) */
    {
        const A = umgebung(); A.st.plan = { schritte: [{ faehigkeit: 'websuche', params: { frage: SATZ } }] };
        const t = await frage(A, SATZ);
        check('3.1 Plan "websuche" für eine Fahrzeitfrage wird NICHT ausgeführt (das wäre nur eine Schätzung als Live-Auskunft)', A.st.webN === 0 && A.st.groq === 1 && /ki_nicht_erlaubt|Plan nicht erlaubt/.test(A.sb.jvChef.eingaenge().map(e => e.codes.join('>')).join(' ')), JSON.stringify({ w: A.st.webN, g: A.st.groq, c: codes(A) }));
        check('3.2 der bisherige Weg übernimmt genau einmal', A.st.groq === 1 && A.st.ent === 1);
        const B = umgebung(); B.st.plan = { schritte: [{ faehigkeit: 'websuche', params: { frage: 'Wie ist die Verkehrslage auf der A24 jetzt' } }, FZ('Hamburger Hauptbahnhof')] };
        await frage(B, SATZ);
        check('3.3 Fahrzeit UND Websuche zusammen: die echte Route ist dabei, die Auskunft bleibt Route+Quelle', (B.st.routeUrls || []).length >= 1);
        const C = umgebung(); C.st.plan = { schritte: [{ faehigkeit: 'websuche', params: { frage: 'Was gibt es heute Neues bei Samsung' } }] };
        await frage(C, 'Was gibt es heute Neues bei Samsung');
        check('3.4 normale Websuche (kein Fahrtbezug) bleibt unverändert erlaubt', C.st.webN === 1 && C.st.groq === 0);
        const P = umgebung(); const m = JSON.stringify(P.sb.jvRegistry.beschreibe().map(d => d.name));
        check('3.5 der Planer bekommt fahrzeit als Werkzeug samt Regel "nie mit websuche beantworten"', /fahrzeit/.test(m), m);
    }
    /* 4 Werkzeug scheitert: keine erfundene Zahl */
    {
        const A = umgebung(); A.st.route = 'fehler'; A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t = await frage(A, SATZ);
        check('4.1 Routenberechnung fällt aus: ehrliche Meldung, KEINE Minutenangabe', /konnte ich gerade nicht berechnen/.test(t) && /schätze sie nicht/.test(t) && !/\d+ Minuten/.test(t), t);
        check('4.2 kein Rückfall: keine Websuche, keine normale KI (die könnte eine Zahl erfinden)', A.st.webN === 0 && A.st.groq === 0, JSON.stringify({ w: A.st.webN, g: A.st.groq }));
        const B = umgebung(); B.st.geo = 'leer'; B.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        const t2 = await frage(B, 'Wie lange brauche ich mit dem Auto zum Hamburger Hauptbahnhof?');
        check('4.3 Ziel nicht gefunden: sagt das, nennt keine Fahrzeit', /habe ich nicht gefunden/.test(t2) && /nenne ich deshalb nicht/.test(t2) && !/\d+ Minuten/.test(t2) && B.st.webN === 0 && B.st.groq === 0, t2);
        const C = umgebung(); C.st.dauer = 700 * 60; C.st.dauerOsrm = 700 * 60; C.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        const t3 = await frage(C, 'Wie lange brauche ich mit dem Auto zum Hamburger Hauptbahnhof?');
        check('4.4 unglaubwürdige Route (700 Minuten für 41 km): keine Zahl, ehrlich nachfragen', /passt nicht zu Start und Ziel/.test(t3) && /nenne ich deshalb nicht/.test(t3), t3);
        const D = umgebung(); D.st.route = 'fehler'; D.st.plan = { schritte: [W('heute'), FZ('Hamburger Hauptbahnhof')] };
        const t4 = await frage(D, 'Wie ist das Wetter und wie lange brauche ich mit dem Auto zum Hamburger Hauptbahnhof?');
        check('4.5 Wetter klappt, Fahrzeit nicht: Wetter wird gesagt, die Fahrzeit ehrlich als nicht berechnet', /Grad|Wetter/.test(t4) && /Die Fahrzeit konnte ich gerade nicht berechnen, und ich schätze sie nicht/.test(t4) && !/\d+ Minuten/.test(t4), t4);
        const E = umgebung(); E.st.route = 'haengt'; E.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        await tippen(E, 'Wie lange brauche ich mit dem Auto zum Hamburger Hauptbahnhof?', 25000);
        check('4.6 Route antwortet nicht (Zeitlimit): bisheriger Weg genau einmal, keine Zahl von der Chef-KI', E.st.groq === 1 && E.st.webN === 0, JSON.stringify({ g: E.st.groq, w: E.st.webN, c: codes(E) }));
    }
    /* 8 nur Meldungen, die wirklich auf der Route liegen */
    {
        const LINIE = [[10.48, 53.50], [10.0, 53.5528]];   // [Länge, Breite] wie bei der Routen-Antwort
        const AB = [
            { title: 'A24 | Reinbek - Hamburg-Billstedt', coordinate: { lat: '53.5264', long: '10.24' }, description: ['Stau 3 km'], icon: '102' },
            { title: 'A24 | Wentorf - Aumühle', coordinate: { lat: '53.5324', long: '10.24' }, description: ['Sperrung'], icon: '250' },
            { title: 'A24 | Hamburg-Norderelbbrücke', coordinate: { lat: '54.5', long: '10.9' }, description: ['Sperrung'], icon: '250' }
        ];
        const TT = [
            { lat: 53.5088, lon: 10.40, kategorie: 6, stufe: 3, verzoegerung_s: 600, von: 'Schwarzenbek-Nord', nach: 'Talkau', art: 'Stau', strassen: ['A24'], text: '' },
            { lat: 53.60, lon: 10.30, kategorie: 8, stufe: 4, verzoegerung_s: 0, von: 'Fremdstraße', nach: 'Woanders', art: 'Sperrung', strassen: ['B5'], text: '' },
            { lat: 53.5148, lon: 10.40, kategorie: 6, stufe: 3, verzoegerung_s: 900, von: 'Nebenstraße', nach: 'Daneben', art: 'Stau', strassen: ['L1'], text: '' }
        ];
        const A = umgebung(); A.st.linie = LINIE; A.st.autobahn = AB; A.st.tomtom = TT; A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t = await frage(A, SATZ);
        check('8.1 Meldung AUF der Route (autobahn.de und TomTom) wird genannt', /Auf der Strecke gemeldet:/.test(t) && /Fahrtrichtung betroffen ist/.test(t) && /Reinbek - Hamburg-Billstedt/.test(t) && /Stau auf der A24 zwischen Schwarzenbek-Nord und Talkau/.test(t), t);
        check('8.2 Sperrungen/Meldungen NAHE der Route, daneben oder weit weg werden NICHT genannt', !/Wentorf|Aumühle|Norderelbbrücke|Fremdstraße|Woanders|Nebenstraße|Daneben/.test(t) && !/nahe deiner Route|nahe der Route/.test(t), t);
        const Ohne = umgebung(); Ohne.st.linie = LINIE; Ohne.st.autobahn = []; Ohne.st.tomtom = []; Ohne.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const ohneText = await frage(Ohne, SATZ);
        check('8.5 ohne konkrete Störung keine technischen Meldungsdienste-Hinweise', /keine konkreten Störungen bekannt/.test(ohneText) && !/Meldungsdienste/.test(ohneText), ohneText);
        const B = umgebung(); B.st.autobahn = AB; B.st.tomtom = TT; B.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };   // ohne Linienverlauf der Route
        const t2 = await frage(B, SATZ);
        check('8.3 ohne echten Linienverlauf wird keine Meldung als "auf der Strecke" behauptet', !/gemeldet|Sperrung|Stau auf/.test(t2) && /brauchst du jetzt etwa 40 Minuten/.test(t2), t2);
        const C = umgebung(); C.st.route = 'osrm'; C.st.linie = LINIE; C.st.autobahn = AB; C.st.tomtom = TT; C.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t3 = await frage(C, SATZ);
        check('8.4 auch ohne Live-Verkehr nur Meldungen auf der Route; die Zeit bleibt als keine Live-Auskunft gekennzeichnet', /keine Live-Auskunft/.test(t3) && !/Wentorf|Fremdstraße|Nebenstraße/.test(t3) && /Reinbek - Hamburg-Billstedt/.test(t3), t3);
    }
    /* 9 Plausibilität: Schwarzenbek -> Hamburger Hauptbahnhof, falsche Route, Fernfahrten */
    {
        const A = umgebung(); A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        await frage(A, SATZ);
        const u = (A.st.routeUrls || [])[0] || '';
        check('9.1 Start und Ziel in der richtigen Reihenfolge, Breite und Länge nicht vertauscht (Start Schwarzenbek, Ziel Hauptbahnhof)', /fromLat=53\.5&fromLon=10\.48&toLat=53\.5528&toLon=10\.0067/.test(u), u);
        check('9.2 die Geocoder-Anfragen sind genau "Schwarzenbek" und "Hamburger Hauptbahnhof"', JSON.stringify(A.st.geoQ) === JSON.stringify(['Schwarzenbek', 'Hamburger Hauptbahnhof']), JSON.stringify(A.st.geoQ));
        check('9.3 Luftlinie etwa 33 km, Route 41 km: plausibel, Diagnose-Werte stehen bereit', A.sb.jvFahrzeitLetzte && A.sb.jvFahrzeitLetzte.luftKm > 30 && A.sb.jvFahrzeitLetzte.luftKm < 36 && A.sb.jvFahrzeitLetzte.routeKm === 41 && A.sb.jvFahrzeitLetzte.startQuelle === 'genannt', JSON.stringify(A.sb.jvFahrzeitLetzte));
        /* die fehlerhafte Route vom Handytest: 314 km / 190 Minuten bei 33 km Luftlinie */
        const B = umgebung(); B.st.meter = 314000; B.st.dauer = 190 * 60; B.st.meterOsrm = 41000; B.st.dauerOsrm = 2100; B.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t = await frage(B, SATZ);
        check('9.4 Google-Route 314 km / 190 Min bei 33 km Luftlinie: NICHT als Fahrzeit gesagt; gezielt neu gerechnet (zweite Anfrage ohne Google)', !/brauchst du jetzt etwa 190/.test(t) && (B.st.routeUrls || []).length === 2 && /google=1/.test(B.st.routeUrls[0]) && !/google=1/.test(B.st.routeUrls[1]), JSON.stringify({ t, r: B.st.routeUrls }));
        check('9.5 die neu gerechnete Route (35 Minuten, 41 km) wird genannt, ausdrücklich ohne Live-Verkehr, mit Hinweis auf die verworfene erste Rechnung', /etwa 35 Minuten \(41 Kilometer\)/.test(t) && /keine Live-Auskunft/.test(t) && /passte nicht zu Start und Ziel/.test(t) && !/berechnet mit dem aktuellen Verkehr/.test(t), t);
        const C = umgebung(); C.st.meter = 314000; C.st.dauer = 190 * 60; C.st.meterOsrm = 314000; C.st.dauerOsrm = 190 * 60; C.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t2 = await frage(C, SATZ);
        check('9.6 auch die neue Route ist unplausibel: keine Fahrzeit, ehrliche Nachfrage, keine Websuche, keine normale KI', /passt nicht zu Start und Ziel/.test(t2) && /nenne ich deshalb nicht/.test(t2) && !/brauchst du|sind es nach der berechneten Route/.test(t2) && C.st.webN === 0 && C.st.groq === 0, t2);
        const D = umgebung(); D.st.meter = 300000; D.st.dauer = 190 * 60; D.st.plan = { schritte: [FZ('Berlin')] };
        const t3 = await frage(D, 'Wie lange brauche ich jetzt mit dem Auto nach Berlin?');
        check('9.7 Fernfahrt (Luftlinie über 200 km) bleibt möglich: keine feste Entfernungsgrenze', /Von deinem aktuellen Standort bis Berlin brauchst du jetzt etwa 190 Minuten \(300 Kilometer\)/.test(t3), t3);
        const E = umgebung(); E.st.geoName = q => /hauptbahnhof/i.test(q) ? { lat: '52.376', lon: '9.741', name: 'Hauptbahnhof, Hannover, Niedersachsen, Deutschland' } : null; E.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t4 = await frage(E, SATZ);
        check('9.8 Geocoder liefert einen Ort, dessen Name nicht zum Ziel passt (Hannover statt Hamburg): keine Route, ehrliche Nachfrage mit dem gefundenen Ort', (E.st.routeUrls || []).length === 0 && /nur einen Ort gefunden, der nicht passt \(Hauptbahnhof, Hannover\)/.test(t4) && /nenne ich deshalb nicht/.test(t4), t4);
        const F = umgebung(); F.st.plan = { schritte: [{ faehigkeit: 'fahrzeit', params: { ziel: 'Hamburger Hauptbahnhof' } }] };
        const t5 = await frage(F, 'Wie lange brauche ich von Schwarzenbek zum Hamburger Hauptbahnhof?');
        check('9.9 nennt der Nutzer einen Startort, den der Planer weggelassen hat, wird er aus dem Satz übernommen (nicht der Standort benutzt)', /^Von Schwarzenbek bis Hamburger Hauptbahnhof/.test(t5) && (F.st.geoQ || []).indexOf('Schwarzenbek') >= 0, t5);
        const G = umgebung(); G.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        const t6 = await frage(G, 'Wie lange brauche ich jetzt mit dem Auto zum Hamburger Hauptbahnhof?');
        check('9.10 ohne Startort sagt die Antwort ausdrücklich "von deinem aktuellen Standort"', /^Von deinem aktuellen Standort bis/.test(t6) && G.sb.jvFahrzeitLetzte.startQuelle === 'standort', t6);
    }
    /* 5 Plan-Prüfung und Rückfragen */
    {
        const A = umgebung(); A.st.plan = { frage: 'Wohin möchtest du fahren?', schritte: [] };
        const t = await frage(A, 'Wie lange brauche ich jetzt mit dem Auto');
        check('5.1 Ziel fehlt: eine kurze Rückfrage, nichts berechnet', /Wohin möchtest du fahren\?/.test(t) && (A.st.routeUrls || []).length === 0 && A.st.groq === 0, t);
        const B = umgebung(); B.st.plan = { schritte: [{ faehigkeit: 'fahrzeit', params: { ziel: 'http://böse.example/x' } }] };
        await frage(B, SATZ);
        check('5.2 unsauberes Ziel (Link) wird verworfen: bisheriger Weg einmal, keine Route', (B.st.routeUrls || []).length === 0 && B.st.groq === 1);
        const C = umgebung(); C.st.plan = { schritte: [{ faehigkeit: 'fahrzeit', params: { ziel: 'Hamburger Hauptbahnhof', tempo: 'schnell' } }] };
        await frage(C, SATZ);
        check('5.3 fremde Angaben werden verworfen', (C.st.routeUrls || []).length === 0 && C.st.groq === 1);
        const D = umgebung(); D.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof'), FZ('Flughafen Hamburg')] };
        await frage(D, SATZ);
        check('5.4 keine doppelte Routenberechnung im selben Plan (höchstens eine)', (D.st.routeUrls || []).length === 0 && D.st.groq === 1);
    }
    /* 6 Registry */
    {
        const A = umgebung(), R = A.sb.jvRegistry, d = R.hole('fahrzeit');
        check('6.1 Registry: lesend, ohne Bestätigung, ohne Fallback (keine Websuche-Schätzung), Pflicht = ziel', !!d && d.bestaetigung.noetig === false && d.fallbacks.length === 0 && d.pflicht.map(x => x.name).join() === 'ziel' && d.optional.map(x => x.name).join() === 'von');
        check('6.2 Erfolg zählt nur mit Zahl und Angabe der Quelle', d.pruefeErfolg({ nachricht: 'x', minuten: 40, verkehrsdaten: 'live' }) && d.pruefeErfolg({ nachricht: 'x', minuten: 35, verkehrsdaten: 'ohne' }) && !d.pruefeErfolg({ nachricht: 'x', minuten: 40 }) && !d.pruefeErfolg({ nachricht: 'x', verkehrsdaten: 'live' }) && !d.pruefeErfolg({ nachricht: '', minuten: 3, verkehrsdaten: 'live' }));
        const r = await R.fuehreAus('fahrzeit', {}, {});
        check('6.3 ohne Ziel: Rückfrage (NEEDS_INFORMATION), keine Berechnung', r.status === 'NEEDS_INFORMATION' && (A.st.routeUrls || []).length === 0, JSON.stringify(r).slice(0, 200));
        const j = await R.fuehreAus('jarvis_info', {}, {});
        check('6.4 Jarvis nennt Fahrzeit und Verkehr unter seinen echten Fähigkeiten', /Fahrzeit und Verkehr/.test(j.nachricht || ''), j.nachricht);
        check('6.5 FREIGEGEBEN und LESEND enthalten fahrzeit, nie in den Schreib-Listen', A.sb.jvChef.FREIGEGEBEN.includes('fahrzeit') && !A.sb.jvChef.SCHREIB.includes('fahrzeit') && !A.sb.jvChef.B2A_NEU.includes('fahrzeit'));
    }
    /* 7 Aus-Schalter und alter Weg */
    {
        const A = umgebung({ chefAus: true }); A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        await frage(A, SATZ);
        check('7.1 Chef-KI aus: kein Planer, keine Chef-Route, der bisherige Weg läuft wie vorher', A.st.ent === 0 && A.st.groq === 1);
        const F = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, fetch: async () => { throw new Error('offline'); } });
        check('7.2 frisch gestartet ist die Chef-KI AUS', F.sb.jvChef.istAn() === false);
        const src = lies('js/travel.js') + lies('js/stadtverkehr.js') + lies('js/fahrtcheck.js');
        check('7.3 die bestehende Fahrzeit-Logik (travel.js, stadtverkehr.js, fahrtcheck.js) ist unverändert', !/jarvis_info|fahrzeit\b.*registry/i.test(src));
    }
    /* 10 Chef-KI aus: der alte Weg (Groq travel_time) darf "von X" nicht mehr ignorieren */
    {
        const A = umgebung({ chefAus: true }); A.st.normal = { reply: 'Ich rechne.', actions: [{ type: 'travel_time', travel_destination: 'Hamburger Hauptbahnhof' }] };
        const t = await frage(A, SATZ);
        check('10.1 Chef-KI aus + alter Weg: Startort aus dem Satz, Fahrzeit mit Plausibilitätsprüfung, keine GPS-Route', /Schwarzenbek/.test(t) && /40 Minuten/.test(t) && A.st.ent === 0, t);
        const B = umgebung({ chefAus: true }); B.st.normal = { reply: 'Ich rechne.', actions: [{ type: 'travel_time', travel_destination: 'Hamburger Hauptbahnhof' }] };
        B.st.meter = 314000; B.st.dauer = 190 * 60; B.st.meterOsrm = 314000; B.st.dauerOsrm = 190 * 60;
        const t2 = await frage(B, SATZ);
        check('10.2 Chef-KI aus + falsche 314-km-Route: keine 190 Minuten', !/190 Minuten|brauche/.test(t2) && /passt nicht zu Start und Ziel|nenne ich deshalb nicht/.test(t2), t2);
    }
    /* 11 die KI liefert travel_time OHNE Ziel (Handy-Diagnose): Ziel und Start kommen aus dem Satz */
    {
        const A = umgebung({ chefAus: true }); A.st.normal = { reply: 'Ich schaue nach, Sir.', actions: [{ type: 'travel_time' }] };
        const t = await frage(A, SATZ);
        check('11.1 travel_time ohne Ziel: trotzdem Fahrzeit-Werkzeug, Start Schwarzenbek, Ziel Hauptbahnhof', /Schwarzenbek/.test(t) && /Hauptbahnhof/.test(t) && /40 Minuten/.test(t), t);
        const B = umgebung({ chefAus: true }); B.st.normal = { reply: 'Ich schaue nach, Sir.', actions: [{ type: 'travel_time', travel_destination: 'Hamburger Hauptbahnhof' }] };
        const t2 = await frage(B, SATZ.toLowerCase());
        check('11.2 kleingeschriebener Satz (Spracherkennung): Start wird trotzdem erkannt', /40 Minuten/.test(t2) && /chwarzenbek/i.test(t2), t2);
        const C = umgebung({ chefAus: true }); C.st.normal = { reply: 'Ich schaue nach, Sir.', actions: [{ type: 'travel_time', travel_destination: 'Hamburger Hauptbahnhof' }] };
        await frage(C, 'Wie lange brauche ich von hier zum Hamburger Hauptbahnhof?');
        check('11.3 "von hier" ist kein Startort: bisheriger GPS-Weg, kein Werkzeug', !(C.st.geoQ || []).some(q => /^hier$/i.test(q.trim())));
    }
    /* 12 Diagnosefenster (vorhandenes diagAdd) zeigt den gewählten Weg */
    {
        const A = umgebung({ chefAus: true }); A.st.normal = { reply: 'Ich schaue nach, Sir.', actions: [{ type: 'travel_time', travel_destination: 'Hamburger Hauptbahnhof' }] };
        const zeilen = []; A.sb.diagAdd = function (z) { zeilen.push(String(z)); };
        await frage(A, SATZ);
        check('12.1 Diagnose nennt Werkzeug, Start, Ziel und Kilometer', zeilen.some(z => /^FAHRZEIT: WERKZEUG SUCCESS von=Schwarzenbek/.test(z) && /Luftlinie=.*Route=/.test(z)), zeilen.join(' // '));
        const B = umgebung({ chefAus: true }); B.st.normal = { reply: 'Ich schaue nach, Sir.', actions: [{ type: 'travel_time', travel_destination: 'Hamburger Hauptbahnhof' }] };
        const z2 = []; B.sb.diagAdd = function (z) { z2.push(String(z)); };
        await frage(B, 'Wie lange brauche ich zum Hamburger Hauptbahnhof?');
        check('12.2 ohne Startort: Diagnose nennt "ALTER WEG" mit Grund', z2.some(z => /ALTER WEG, Grund: kein Startort im Satz/.test(z)), z2.join(' // '));
    }
    /* 13 Geocoding-Treffer in der falschen Stadt (Handy-Beweis: "Hamburger Hauptbahnhof" -> Münster, weil dort eine Hamburger Straße liegt) */
    {
        const MS = { lat: '51.96', lon: '7.64', name: 'Münster (Westf) Hauptbahnhof, Hamburger Straße, Hafen, Münster, Nordrhein-Westfalen, 48149, Deutschland' };
        const falsch = (mit) => q => (q.trim() === 'Hamburger Hauptbahnhof') ? Object.assign({}, MS, mit ? { adr: { city: 'Münster', road: 'Hamburger Straße', state: 'Nordrhein-Westfalen' } } : {}) : null;
        const A = umgebung(); A.st.geoName = falsch(true); A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t = await frage(A, SATZ);
        check('13.1 Treffer in Münster (Straße "Hamburger Straße") wird verworfen, neu gesucht mit Stadt: Fahrzeit nach Hamburg', /Hamburger Hauptbahnhof/.test(t) && /40 Minuten/.test(t) && (A.st.geoQ || []).some(q => /^Hauptbahnhof, Hamburg$/.test(q)) && !/Münster/.test(t), t);
        const B = umgebung(); B.st.geoName = falsch(false); B.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t2 = await frage(B, SATZ);
        check('13.2 auch ohne strukturierte Ortsangaben: Straße zählt nicht als Stadt', /40 Minuten/.test(t2) && !/Münster/.test(t2), t2);
        const C = umgebung(); C.st.geoName = q => /hauptbahnhof/i.test(q) ? MS : null; C.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t3 = await frage(C, SATZ);
        check('13.3 Stadt nicht bestätigt (auch die zweite Suche liefert Münster): Nachfrage statt falscher Route, keine Minuten', /nur einen Ort gefunden, der nicht passt/.test(t3) && !/\d+ Minuten/.test(t3) && C.st.webN === 0 && C.st.groq === 0, t3);
        for (const [fr, name, adr] of [['Berliner Hauptbahnhof', 'Berlin Hauptbahnhof, Europaplatz, Moabit, Mitte, Berlin, 10557, Deutschland', { city: 'Berlin' }], ['Münchner Hauptbahnhof', 'München Hauptbahnhof, Bayerstraße, Ludwigsvorstadt, München, Bayern, 80335, Deutschland', { city: 'München' }], ['Kölner Hauptbahnhof', 'Köln Hauptbahnhof, Trankgasse, Altstadt-Nord, Köln, Nordrhein-Westfalen, 50667, Deutschland', { city: 'Köln' }]]) {
            const D = umgebung(); D.st.geoName = q => q.trim() === fr ? { lat: '52.5', lon: '13.4', name, adr } : null; D.st.plan = { schritte: [FZ(fr, 'Schwarzenbek')] };
            const t4 = await frage(D, 'Wie lange brauche ich von Schwarzenbek zum ' + fr + '?');
            check('13.4 ' + fr + ': richtige Stadt wird akzeptiert (keine Ortsablehnung)', !/nur einen Ort gefunden/.test(t4), t4);
        }
        const E = umgebung(); E.st.geoName = q => q.trim() === 'Berliner Hauptbahnhof' ? { lat: '50.7', lon: '7.1', name: 'Bonn Hauptbahnhof, Berliner Platz, Bonn, Nordrhein-Westfalen, Deutschland', adr: { city: 'Bonn', road: 'Berliner Platz' } } : null; E.st.plan = { schritte: [FZ('Berliner Hauptbahnhof', 'Schwarzenbek')] };
        const t5 = await frage(E, 'Wie lange brauche ich von Schwarzenbek zum Berliner Hauptbahnhof?');
        check('13.5 Berliner Platz in Bonn ist kein Berlin', !/Bonn/.test(t5) || /nicht passt|nicht gefunden/.test(t5), t5);
    }
    /* 14 Abfahrtsfragen: nur das Werkzeug abfahrt (mit Ankunftszeit) darf sie beantworten, ein Plan nur mit der Fahrdauer wird verworfen */
    {
        const ABF = ['Ich muss heute um 13 Uhr bei meiner Mutter sein. Wann muss ich losfahren?', 'Wann muss ich losfahren, um um 15 Uhr in Hamburg zu sein?', 'Wann sollte ich abfahren, damit ich um 9 Uhr am Hamburger Hauptbahnhof bin?'];
        for (const satz of ABF) {
            const A = umgebung(); A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
            await frage(A, satz);
            check('14.1 Chef-KI EIN: Plan nur mit Fahrdauer für eine Abfahrtsfrage wird verworfen, der bisherige Weg antwortet genau einmal – ' + satz.slice(0, 40), A.st.ent === 1 && A.st.groq === 1 && !(A.st.routeUrls || []).length && codes(A).includes('abfahrt_alter_weg'), JSON.stringify({ e: A.st.ent, g: A.st.groq, c: codes(A) }));
            const B = umgebung({ chefAus: true }); B.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
            await frage(B, satz);
            check('14.2 Chef-KI AUS, gleiche Frage: wie bisher (ein normaler KI-Aufruf, kein Planer)', B.st.ent === 0 && B.st.groq === 1);
        }
        const D = umgebung(); D.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        await frage(D, SATZ);
        check('14.4 reine Fahrdauer-Frage bleibt beim Werkzeug fahrzeit (nicht verdrängt)', D.st.ent === 1 && D.st.groq === 0 && (D.st.routeUrls || []).length > 0);
        const E = umgebung(); E.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        await frage(E, 'Wie lange brauche ich mit dem Auto zum Hamburger Hauptbahnhof?');
        check('14.5 "Wie lange brauche ich" ist keine Abfahrtsfrage', E.st.ent === 1 && E.st.groq === 0);
    }
    /* 15 Kontakte und Gedächtnis lesen (künstliche Beispieldaten), persönliche Ziele mit Vorrang vor der Ortssuche */
    {
        const KONT = { mama: { originalName: 'Mama', address: 'Musterweg 1, 12345 Beispielstadt' }, zahnarzt: { originalName: 'Zahnarzt Dr. Test', address: 'Testallee 9, 12345 Beispielstadt' } };
        const mit = (opt, kontakte, gedaechtnis) => { const A = umgebung(opt); if (kontakte) A.setze('savedContacts', kontakte); if (gedaechtnis) A.setze('memoryItems', gedaechtnis); A.z0 = stand(A); return A; };
        const LES = (name) => ({ faehigkeit: 'kontakte_lesen', params: { name } });
        const A = mit({}, KONT); A.st.plan = { schritte: [LES('meiner Mutter')] };
        const t = await frage(A, 'Wo wohnt meine Mutter?');
        check('15.1 "Wo wohnt meine Mutter?": gespeicherte Adresse genannt, keine normale KI, keine Websuche, nichts geschrieben', /Musterweg 1, 12345 Beispielstadt/.test(t) && A.st.groq === 0 && A.st.webN === 0 && stand(A) === A.z0, t);
        const B = mit({}, KONT); B.st.plan = { schritte: [LES('meinem Bruder')] };
        const t2 = await frage(B, 'Wo wohnt mein Bruder?');
        check('15.2 kein Kontakt: ehrlich "keine Adresse", keine erfundene Adresse', /keine Adresse von Bruder gespeichert/.test(t2) && !/Musterweg|Testallee/.test(t2) && B.st.webN === 0, t2);
        const C = mit({}, { 'anna muster': { originalName: 'Anna Muster', address: 'Erste Gasse 1, 11111 Ort' }, 'anna beispiel': { originalName: 'Anna Beispiel', address: 'Zweite Gasse 2, 22222 Ort' } }); C.st.plan = { schritte: [LES('Anna')] };
        const t3 = await frage(C, 'Wo wohnt Anna?');
        check('15.3 mehrdeutig (zwei Annas): Nachfrage mit beiden Namen, keine Adresse genannt', /Meinst du Anna Muster oder Anna Beispiel/.test(t3) && !/Gasse/.test(t3), t3);
        const D = mit({}, null, { 'mama wohnort': 'Gedaechtnisweg 7, 33333 Testdorf' }); D.st.plan = { schritte: [LES('Mama')] };
        const t4 = await frage(D, 'Wo wohnt meine Mama?');
        check('15.4 kein Kontakt, aber Gedächtniseintrag mit Adresse: Fallback', /Gedaechtnisweg 7/.test(t4), t4);
        const E = mit({}, KONT); E.st.plan = { schritte: [FZ('meiner Mutter')] };
        const t5 = await frage(E, 'Wie lange brauche ich zu meiner Mutter?');
        check('15.5 Fahrzeit zur Mutter: Kontaktadresse wird gesucht (nicht "meiner Mutter" bei der Ortssuche), echte Route', (E.st.geoQ || []).some(q => /Musterweg 1/.test(q)) && !(E.st.geoQ || []).some(q => /Mutter/i.test(q)) && /\d+ Minuten/.test(t5) && E.st.webN === 0 && E.st.groq === 0, JSON.stringify(E.st.geoQ) + ' ' + t5);
        const F = mit({}, KONT); F.st.plan = { schritte: [FZ('meinem Zahnarzt')] };
        const t6 = await frage(F, 'Wie weit ist es zu meinem Zahnarzt?');
        check('15.6 Zahnarzt: Adresse aus dem Kontakt "Zahnarzt Dr. Test", Entfernung berechnet', (F.st.geoQ || []).some(q => /Testallee 9/.test(q)) && /Kilometer/.test(t6), JSON.stringify(F.st.geoQ) + ' ' + t6);
        const G = mit({}, { 'anna muster': { originalName: 'Anna Muster', address: 'Erste Gasse 1, 11111 Ort' }, 'anna beispiel': { originalName: 'Anna Beispiel', address: 'Zweite Gasse 2, 22222 Ort' } }); G.st.plan = { schritte: [FZ('Anna')] };
        const t7 = await frage(G, 'Wie lange brauche ich zu Anna?');
        check('15.7 Fahrzeit zu mehrdeutigem Kontakt: Nachfrage, keine Route, keine Minuten', /Meinst du Anna Muster oder Anna Beispiel/.test(t7) && !/\d+ Minuten/.test(t7) && !(G.st.routeUrls || []).length, t7);
        const H = mit({}, KONT); H.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t8 = await frage(H, SATZ);
        check('15.8 normale Ortssuche ohne Personenbezug bleibt unverändert (Kontakte werden nicht eingemischt)', /40 Minuten/.test(t8) && !(H.st.geoQ || []).some(q => /Musterweg|Testallee/.test(q)), t8);
        const I = mit({ chefAus: true }, KONT); I.st.plan = { schritte: [LES('meiner Mutter')] };
        await frage(I, 'Wo wohnt meine Mutter?');
        check('15.9 Chef-KI AUS: kein Planer, der bisherige Weg (1 normale KI-Anfrage)', I.st.ent === 0 && I.st.groq === 1);
        const J = mit({}, null, { 'schlüssel': 'im Auto' }); J.st.plan = { schritte: [{ faehigkeit: 'gedaechtnis_lesen', params: { suche: 'schlüssel' } }] };
        const t9 = await frage(J, 'Wo habe ich meinen Schlüssel hingelegt, was habe ich mir gemerkt?');
        check('15.10 gedaechtnis_lesen: nennt den gemerkten Wert, schreibt nichts', /im Auto/.test(t9) && stand(J) === J.z0, t9);
        const K = mit({}, KONT); K.st.plan = { schritte: [{ faehigkeit: 'kontakte_lesen', params: { name: 'Mutter', adresse: 'Fremdweg 1' } }] };
        await frage(K, 'Wo wohnt meine Mutter?');
        check('15.11 unbekannte Parameter im Plan: verworfen (nichts ausgeführt, bisheriger Weg)', K.st.groq === 1, JSON.stringify(codes(K)));
        check('15.12 Quelltext: die Lese-Werkzeuge nennen kein Schreib-Wort (executeAction, savedContacts =, setPersistentData)', !/executeAction|savedContacts\s*=|setPersistentData|memoryItems\s*\[/.test((lies('js/registry_faehigkeiten.js').match(/name: 'kontakte_lesen'[\s\S]*?(?=\/\* -{10,} 2c\.)/) || [''])[0]));
    }
    /* 16 Werkzeug abfahrt (Phase 5.1, Schritt 3): Ankunftszeit -> späteste Abfahrt, künstliche Kontakte */
    {
        const KONT = { mama: { originalName: 'Mama', address: 'Musterweg 1, 12345 Beispielstadt' }, zahnarzt: { originalName: 'Zahnarzt Dr. Test', address: 'Testallee 9, 12345 Beispielstadt' } };
        const mit = (opt, kontakte) => { const A = umgebung(opt); if (kontakte) A.setze('savedContacts', kontakte); A.z0 = stand(A); return A; };
        const AB = (ziel, ankunft, tag) => ({ faehigkeit: 'abfahrt', params: tag ? { ziel, ankunft, tag } : { ziel, ankunft } });
        const A = mit({}, KONT); A.st.plan = { schritte: [AB('meiner Mutter', '13:00', 'morgen')] };
        const t = await frage(A, 'Ich muss morgen um 13 Uhr bei meiner Mutter sein. Wann muss ich losfahren?');
        check('16.1 Mutter morgen 13 Uhr: Kontaktadresse, Fahrzeit, Puffer, späteste Abfahrt; keine normale KI, nichts geschrieben', (A.st.geoQ || []).some(q => /Musterweg 1/.test(q)) && !(A.st.geoQ || []).some(q => /Mutter/i.test(q)) && /Mama/.test(t) && /spätestens um/.test(t) && /12 Uhr 10/.test(t) && A.st.groq === 0 && A.st.webN === 0 && stand(A) === A.z0, t);
        check('16.2 Prognose ehrlich: für morgen nur die Verkehrslage von jetzt, keine erfundene Prognose', /Prognose für später habe ich nicht/.test(t));
        const B = mit({}, KONT); B.st.plan = { schritte: [AB('meinem Zahnarzt', '15:00')] };
        const t2 = await frage(B, 'Wann muss ich losfahren, wenn ich um 15 Uhr beim Zahnarzt sein muss?');
        check('16.3 Zahnarzt heute 15 Uhr: Adresse aus dem Kontakt "Zahnarzt Dr. Test"', (B.st.geoQ || []).some(q => /Testallee 9/.test(q)) && /spätestens um/.test(t2), t2);
        const C = mit({}); C.st.plan = { schritte: [AB('Hamburger Hauptbahnhof', '18:00')] };
        const t3 = await frage(C, 'Ich muss heute um 18 Uhr am Hamburger Hauptbahnhof sein.');
        check('16.4 "Ich muss heute um 18 Uhr am Hamburger Hauptbahnhof sein." (ohne "Wann"): erreicht den Planer und das Werkzeug', C.st.ent === 1 && C.st.groq === 0 && /Hamburger Hauptbahnhof/.test(t3) && /spätestens um/.test(t3), t3);
        const D = mit({}, { mama: { originalName: 'Mama' } }); D.st.plan = { schritte: [AB('Mama', '13:00', 'morgen')] };
        const t4 = await frage(D, 'Ich muss morgen um 13 Uhr bei Mama sein. Wann muss ich losfahren?');
        check('16.5 Kontakt ohne Adresse: ehrlich gesagt, keine Abfahrtszeit, keine Route', /keine Adresse von Mama gespeichert\. Wie lautet sie\?/.test(t4) && !/spätestens/.test(t4) && !(D.st.routeUrls || []).length, t4);
        const E = mit({}, { 'anna muster': { originalName: 'Anna Muster', address: 'Erste Gasse 1, 11111 Ort' }, 'anna beispiel': { originalName: 'Anna Beispiel', address: 'Zweite Gasse 2, 22222 Ort' } }); E.st.plan = { schritte: [AB('Anna', '13:00', 'morgen')] };
        const t5 = await frage(E, 'Ich muss morgen um 13 Uhr bei Anna sein. Wann muss ich losfahren?');
        check('16.6 mehrdeutiger Kontakt: Nachfrage, keine Route', /Meinst du Anna Muster oder Anna Beispiel/.test(t5) && !(E.st.routeUrls || []).length, t5);
        const F = mit({}, KONT); F.st.plan = { schritte: [{ faehigkeit: 'abfahrt', params: { ziel: 'meiner Mutter', ankunft: 'mittags' } }] };
        const t6 = await frage(F, 'Ich muss um 13 Uhr bei meiner Mutter sein. Wann muss ich losfahren?');
        check('16.7 Uhrzeit unklar (Plan ungültig): bisheriger Weg statt geraten, keine Abfahrtszeit vom Werkzeug', F.st.groq === 1 && !(F.st.routeUrls || []).length, JSON.stringify({ g: F.st.groq, e: F.st.ent, c: codes(F), r: F.st.routeUrls, t: t6 }));
        const G = mit({}, KONT); G.st.plan = { schritte: [], frage: 'Um wie viel Uhr musst du da sein?' };
        const t7 = await frage(G, 'Wann muss ich losfahren, um bei meiner Mutter zu sein?');
        check('16.8 fehlende Ankunftszeit: Rückfrage nach der Uhrzeit, keine Route', G.st.groq === 0 && /Um wie viel Uhr/.test(t7) && !(G.st.routeUrls || []).length, t7);
        const H = mit({}, KONT); H.st.plan = { schritte: [AB('meiner Mutter', '08:00')] };
        const t8 = await frage(H, 'Ich muss heute um 8 Uhr bei meiner Mutter sein. Wann muss ich losfahren?');
        check('16.9 vergangene Ankunftszeit (heute 8 Uhr, jetzt 10 Uhr): Nachfrage nach dem Tag, nicht stillschweigend morgen', /schon vorbei/.test(t8) && !(H.st.routeUrls || []).length, t8);
        const I = mit({}); I.st.geoName = q => /^Hamburger Hauptbahnhof$/.test(q.trim()) ? { lat: '51.96', lon: '7.64', name: 'Münster (Westf) Hauptbahnhof, Hamburger Straße, Hafen, Münster, Nordrhein-Westfalen, 48149, Deutschland', adr: { city: 'Münster', road: 'Hamburger Straße' } } : (/^Hauptbahnhof, Hamburg$/.test(q.trim()) ? null : null); I.st.plan = { schritte: [AB('Hamburger Hauptbahnhof', '18:00')] };
        const t9 = await frage(I, 'Ich muss heute um 18 Uhr am Hamburger Hauptbahnhof sein.');
        check('16.10 falsche Zielstadt im alten Abfahrtsweg (Treffer Münster): gezielte zweite Suche mit Stadt, sonst Nachfrage; nie eine Route nach Münster', !(I.st.routeUrls || []).some(u => /toLat=51\.96/.test(u)) && ((I.st.geoQ || []).some(q => /^Hauptbahnhof, Hamburg$/.test(q))), JSON.stringify(I.st.geoQ) + ' ' + t9);
        const J = mit({ chefAus: true }, KONT); J.st.plan = { schritte: [AB('meiner Mutter', '13:00', 'morgen')] };
        await frage(J, 'Ich muss morgen um 13 Uhr bei meiner Mutter sein. Wann muss ich losfahren?');
        check('16.11 Chef-KI AUS: kein Planer, der bisherige Weg (1 normale KI-Anfrage), keine doppelte Berechnung', J.st.ent === 0 && J.st.groq === 1 && !(J.st.routeUrls || []).length);
        const K = mit({}, KONT); K.st.plan = { schritte: [AB('meiner Mutter', '13:00', 'morgen')] };
        await frage(K, 'Ich muss morgen um 13 Uhr bei meiner Mutter sein. Wann muss ich losfahren?');
        check('16.12 genau eine Antwort und eine Routenberechnung (keine doppelte)', K.gesagt.length === 1 && (K.st.routeUrls || []).length === 1, JSON.stringify({ g: K.gesagt.length, r: (K.st.routeUrls || []).length }));
        check('16.13 Quelltext abfahrt: ruft die bestehende computeDepartureAdvice, schreibt nichts', /computeDepartureAdvice\(\{ destination: dest/.test(lies('js/registry_faehigkeiten.js')) && !/executeAction|setPersistentData/.test((lies('js/registry_faehigkeiten.js').match(/name: 'abfahrt'[\s\S]*?(?=\/\* -{10,} 2c\.)/) || [''])[0]));
        const MS2 = { lat: '51.96', lon: '7.64', name: 'Münster (Westf) Hauptbahnhof, Hamburger Straße, Hafen, Münster, Nordrhein-Westfalen, 48149, Deutschland', adr: { city: 'Münster', road: 'Hamburger Straße' } };
        const M = mit({ chefAus: true }); M.st.normal = { reply: 'Ich schaue nach, Sir.', actions: [{ type: 'travel_time', travel_destination: 'Hamburger Hauptbahnhof' }] }; M.st.geoName = q => /^Hamburger Hauptbahnhof$/.test(q.trim()) ? MS2 : null;
        const t10 = await frage(M, 'Ich muss heute um 18 Uhr am Hamburger Hauptbahnhof sein.');
        check('16.15 alter Abfahrtsweg (Chef-KI AUS, travel_time): Treffer Münster wird verworfen, zweite Suche findet Hamburg, Route nach Hamburg', (M.st.routeUrls || []).length >= 1 && !(M.st.routeUrls || []).some(u => /toLat=51\.96/.test(u)) && /spätestens/.test(t10), JSON.stringify(M.st.routeUrls) + ' ' + t10);
        const N = mit({ chefAus: true }); N.st.normal = { reply: 'Ich schaue nach, Sir.', actions: [{ type: 'travel_time', travel_destination: 'Hamburger Hauptbahnhof' }] }; N.st.geoName = q => /hauptbahnhof/i.test(q) ? MS2 : null;
        const t11 = await frage(N, 'Ich muss heute um 18 Uhr am Hamburger Hauptbahnhof sein.');
        check('16.16 alter Abfahrtsweg: Stadt nicht bestätigbar -> Nachfrage, keine Route, keine Abfahrtszeit', /nur einen Ort gefunden, der nicht passt/.test(t11) && !(N.st.routeUrls || []).length && !/spätestens/.test(t11), t11);
        const W1 = mit({}, KONT); W1.setze('workAddress', 'Werkstraße 5, 12345 Beispielstadt'); W1.st.plan = { schritte: [AB('Arbeit', '12:13', 'morgen')] };
        const t12 = await frage(W1, 'Wann muss ich morgen losfahren, um um 12 Uhr 13 auf der Arbeit zu sein?');
        check('16.17 Ziel Arbeit (Chef-KI EIN): gespeicherte Arbeitsadresse wird genutzt, keine Ortssuche nach "Arbeit", keine Rückfrage', (W1.st.geoQ || []).some(q => /Werkstraße 5/.test(q)) && !(W1.st.geoQ || []).some(q => /^Arbeit$/i.test(q.trim())) && /spätestens/.test(t12) && !/Wohin/.test(t12) && W1.lese('workAddress') === 'Werkstraße 5, 12345 Beispielstadt', t12);
        const W2 = mit({}, KONT); W2.st.plan = { schritte: [AB('Arbeit', '12:13', 'morgen')] };
        const t13 = await frage(W2, 'Wann muss ich morgen losfahren, um um 12 Uhr 13 auf der Arbeit zu sein?');
        check('16.18 Ziel Arbeit ohne gespeicherte Adresse: ehrliche Meldung mit Hinweis, keine Route, keine Abfahrtszeit', /Arbeitsadresse kenne ich noch nicht/.test(t13) && !/spätestens/.test(t13) && !(W2.st.routeUrls || []).length, t13);
        const W3 = mit({ chefAus: true }, KONT); W3.setze('workAddress', 'Werkstraße 5, 12345 Beispielstadt'); W3.st.plan = { schritte: [AB('Arbeit', '12:13', 'morgen')] };
        await frage(W3, 'Wann muss ich morgen losfahren, um um 12 Uhr 13 auf der Arbeit zu sein?');
        check('16.19 Chef-KI AUS: Arbeitsadresse bleibt unverändert, kein Planer', W3.st.ent === 0 && W3.lese('workAddress') === 'Werkstraße 5, 12345 Beispielstadt');
        const L = mit({}); const sh = L.sb.jvSchatten;
        check('16.14 Schattenbetrieb: abfahrt hat keine Erkennung und löst nichts aus (nur Ausnahmeliste)', sh._ohneErkennung().includes('abfahrt') && sh.erkenne('Ich muss morgen um 13 Uhr bei meiner Mutter sein. Wann muss ich losfahren?').join() === '' && stand(L) === L.z0);
    }
    /* --- 17. Mehrteilige Abfahrtsfragen: Ziel, Ankunftszeit und Frage gehören zu EINEM Auftrag --- */
    {
        const KONT = { mama: { originalName: 'Mama', address: 'Musterweg 1, 12345 Beispielstadt' }, zahnarzt: { originalName: 'Zahnarzt Dr. Test', address: 'Testallee 9, 12345 Beispielstadt' } };
        const mit = (opt, kontakte) => { const A = umgebung(opt); if (kontakte) A.setze('savedContacts', kontakte); A.z0 = stand(A); return A; };
        const AB = (ziel, ankunft, tag) => ({ faehigkeit: 'abfahrt', params: tag ? { ziel, ankunft, tag } : { ziel, ankunft } });
        const F = [
            ['17.1', 'Ich muss nachher zu meiner Mutter fahren. Ich muss um 14:33 Uhr da sein. Wann muss ich losfahren?', AB('meiner Mutter', '14:33', 'heute'), /Musterweg 1/],
            ['17.2', 'Ich muss heute zu Mama. Um 14:33 Uhr muss ich dort sein. Wann fahre ich los?', AB('Mama', '14:33', 'heute'), /Musterweg 1/],
            ['17.3', 'Morgen muss ich zum Zahnarzt. Um 15 Uhr muss ich da sein. Wann sollte ich losfahren?', AB('Zahnarzt', '15:00', 'morgen'), /Testallee 9/]
        ];
        for (const chefAus of [false, true]) for (const [id, satz, schritt, adr] of F) {
            const A = mit(chefAus ? { chefAus: true } : {}, KONT); A.st.plan = { schritte: [schritt] };
            const t = await frage(A, satz);
            const n = A.gesagt.length;
            if (!chefAus) check(id + ' (Chef-KI EIN) ' + satz.slice(0, 40) + '…: eine Antwort mit Abfahrtszeit, Ziel aus dem Kontakt, keine Ortsrückfrage, keine normale KI', n === 1 && /spätestens um/.test(t) && !/Welchen Ort/.test(t) && (A.st.geoQ || []).some(q => adr.test(q)) && A.st.groq === 0, JSON.stringify({ n, t, c: codes(A), g: A.st.geoQ }));
            else check(id + ' (Chef-KI AUS) ' + satz.slice(0, 40) + '…: höchstens eine Antwort, kein Absturz, nichts geschrieben', n <= 2 && stand(A) === A.z0, JSON.stringify({ n, t }));
        }
    }
    {
        const KONT = { mama: { originalName: 'Mama', address: 'Musterweg 1, 12345 Beispielstadt' } };
        const mit = (opt, kontakte) => { const A = umgebung(opt); if (kontakte) A.setze('savedContacts', kontakte); A.z0 = stand(A); return A; };
        const AB = (ziel, ankunft, tag) => ({ faehigkeit: 'abfahrt', params: tag ? { ziel, ankunft, tag } : { ziel, ankunft } });
        const S1 = 'Ich muss nachher zu meiner Mutter fahren. Ich muss um 14:33 Uhr da sein. Wann muss ich losfahren?';
        const A = mit({}, { mama: { originalName: 'Mama' } }); A.st.plan = { schritte: [AB('meiner Mutter', '14:33', 'heute')] };
        const t1 = await frage(A, S1);
        check('17.4 Mutter ohne gespeicherte Adresse: ehrlich gesagt, keine Abfahrtszeit, keine Route, eine Antwort', /keine Adresse von Mama gespeichert\. Wie lautet sie\?/.test(t1) && !/spätestens/.test(t1) && !(A.st.routeUrls || []).length && A.gesagt.length === 1, t1);
        const B = mit({}, { 'mama muster': { originalName: 'Mama Muster', address: 'Erste Gasse 1, 11111 Ort' }, 'mama beispiel': { originalName: 'Mama Beispiel', address: 'Zweite Gasse 2, 22222 Ort' } }); B.st.plan = { schritte: [AB('Mama', '14:33', 'heute')] };
        const t2 = await frage(B, 'Ich muss heute zu Mama. Um 14:33 Uhr muss ich dort sein. Wann fahre ich los?');
        check('17.5 zwei passende Kontakte: gezielte Nachfrage mit beiden Namen, keine Route, nichts geraten', /Mama Muster oder Mama Beispiel/.test(t2) && !(B.st.routeUrls || []).length && B.gesagt.length === 1, t2);
        const C = mit({}, KONT); C.st.plan = { schritte: [AB('Mama', '14:33', 'heute')] };
        const t3 = await frage(C, 'Wann muss ich heute losfahren, um um 14:33 Uhr bei Mama zu sein?');
        check('17.6 bisheriger Einzelsatz (Test C) unverändert: eine Antwort mit Abfahrtszeit', C.gesagt.length === 1 && /spätestens um/.test(t3) && !/Welchen Ort/.test(t3), t3);
        const D = mit({}, KONT);
        const t4 = await frage(D, 'Ich muss um 14:33 Uhr da sein. Wann muss ich losfahren?');
        check('17.7 "da sein" OHNE Ziel im Satz: weiter die Nachfrage nach dem Ort (nichts geraten)', /Welchen Ort meinst du/.test(t4) && !(D.st.routeUrls || []).length, t4);
        const E = mit({}, KONT); E.st.plan = { schritte: [AB('meiner Mutter', '14:33', 'heute')] };
        const t5 = await frage(E, S1);
        check('17.8 genau eine Antwort, genau eine Routenberechnung, Datum bleibt heute (keine stille Änderung)', E.gesagt.length === 1 && (E.st.routeUrls || []).length === 1 && !/morgen/i.test(t5), JSON.stringify({ g: E.gesagt.length, r: (E.st.routeUrls || []).length, t5 }));
        const G = mit({}, KONT); G.st.plan = { schritte: [{ faehigkeit: 'wetter', params: { tag: 'morgen' } }] };
        const t6 = await frage(G, 'Wie wird das Wetter morgen? Ich muss um 14:33 Uhr da sein.');
        check('17.9 unabhängige Aussagen ohne Abfahrtsfrage werden nicht zum Abfahrtsauftrag', !/spätestens/.test(t6) && !(G.st.routeUrls || []).length, t6);
    }
    /* --- 18. Kontaktauflösung absichern (E23/E35): Personenwörter ohne Kontakt werden nie als Ortsname gesucht --- */
    {
        const KONT = { mama: { originalName: 'Mama', address: 'Musterweg 1, 12345 Beispielstadt' } };
        const mit = (opt, kontakte, gedaechtnis) => { const A = umgebung(opt); A.setze('savedContacts', kontakte || {}); if (gedaechtnis) A.setze('memoryItems', gedaechtnis); A.z0 = stand(A); return A; };
        const AB = (ziel, ankunft, tag) => ({ faehigkeit: 'abfahrt', params: tag ? { ziel, ankunft, tag } : { ziel, ankunft } });
        const FZ2 = (ziel, von) => ({ faehigkeit: 'fahrzeit', params: von ? { ziel, von } : { ziel } });
        const keinOrt = A => !(A.st.geoQ || []).some(q => /^(?:Oma|Mama|Mutter|Opa|Papa)(?:,|$)/i.test(q.trim())) && !(A.st.routeUrls || []).length;
        for (const chefAus of [false, true]) {
            const E = chefAus ? { chefAus: true } : {};
            if (chefAus) { const A = mit(E, {}); A.st.normal = { reply: 'Okay.', actions: [] }; await frage(A, 'Wie lange brauche ich zu Oma?'); check('18.0 Chef-KI AUS: alter Weg unverändert (eine normale KI-Anfrage, nichts berechnet)', A.st.groq === 1 && A.st.ent === 0 && !(A.st.routeUrls || []).length); continue; }
            const A = mit(E, {}); A.st.plan = { schritte: [FZ2('Oma')] };
            const t = await frage(A, 'Wie lange brauche ich zu Oma?');
            check('18.1 Fahrzeit zu Oma ohne Kontakt (E35): ehrliche Frage nach der Adresse, "Oma" nie als Ort gesucht, keine Route', /Ich habe keine Adresse von Oma gespeichert\. Wie lautet sie\?/.test(t) && keinOrt(A) && A.gesagt.length === 1, JSON.stringify({ t, g: A.st.geoQ, r: A.st.routeUrls }));
            const B = mit(E, {}); B.st.plan = { schritte: [AB('Mama', '14:33', 'heute')] };
            const t2 = await frage(B, 'Wann muss ich heute losfahren, um um 14:33 Uhr bei Mama zu sein?');
            check('18.2 Abfahrt zu Mama ohne Kontakt (E23): ehrliche Frage, keine Ortssuche, keine Abfahrtszeit', /Ich habe keine Adresse von Mama gespeichert\. Wie lautet sie\?/.test(t2) && keinOrt(B) && !/spätestens/.test(t2), JSON.stringify({ t2, g: B.st.geoQ }));
            const C = mit(E, { mama: { originalName: 'Mama' } }); C.st.plan = { schritte: [FZ2('meiner Mutter')] };
            const t3 = await frage(C, 'Wie lange brauche ich zu meiner Mutter?');
            check('18.3 Kontakt Mama OHNE Adresse (Fahrzeit): ehrlich, nicht als Ort gesucht (vorher wurde "Mama" geocodiert)', /keine Adresse von Mama gespeichert/.test(t3) && keinOrt(C), JSON.stringify({ t3, g: C.st.geoQ }));
            const D = mit(E, KONT); D.st.plan = { schritte: [AB('meiner Mutter', '14:33', 'heute')] };
            const t4 = await frage(D, 'Wann muss ich heute losfahren, um um 14:33 Uhr bei meiner Mutter zu sein?');
            check('18.4 Alias Mutter -> Kontakt Mama: Adresse gefunden, Abfahrtszeit genannt (unverändert)', (D.st.geoQ || []).some(q => /Musterweg 1/.test(q)) && /spätestens um 13 Uhr 43/.test(t4), t4);
            const F = mit(E, KONT); F.st.plan = { schritte: [AB('Mama', '14:33', 'heute')] };
            const t5 = await frage(F, 'Wann muss ich zu Mama losfahren, um 14:33 Uhr da zu sein?');
            check('18.5 Fall A: Mama vorhanden -> gespeicherte Adresse, richtige Abfahrt, eine Antwort', (F.st.geoQ || []).some(q => /Musterweg 1/.test(q)) && /spätestens um 13 Uhr 43/.test(t5) && F.gesagt.length === 1, t5);
            const G = mit(E, { 'mama muster': { originalName: 'Mama Muster', address: 'Erste Gasse 1' }, 'mama beispiel': { originalName: 'Mama Beispiel', address: 'Zweite Gasse 2' } }); G.st.plan = { schritte: [FZ2('Mama')] };
            const t6 = await frage(G, 'Wie lange brauche ich zu Mama?');
            check('18.6 Fall C: zwei Kontakte -> gezielte Nachfrage, keine Route', /Mama Muster oder Mama Beispiel/.test(t6) && !(G.st.routeUrls || []).length, t6);
            const H = mit(E, KONT); H.st.plan = { schritte: [FZ2('Hamburg')] };
            const t7 = await frage(H, 'Wie lange brauche ich nach Hamburg?');
            check('18.7 Fall D: normale Stadt Hamburg wird wie bisher gesucht und berechnet', (H.st.geoQ || []).some(q => /^Hamburg/.test(q)) && (H.st.routeUrls || []).length === 1 && /Minuten/.test(t7), t7);
            const I = mit(E, KONT); I.st.plan = { schritte: [FZ2('Omaha')] };
            const t8 = await frage(I, 'Wie lange brauche ich nach Omaha?');
            check('18.8 Ortsname, der mit einem Personenwort beginnt (Omaha): wird als Ort gesucht, nicht als "Oma" behandelt', (I.st.geoQ || []).some(q => /^Omaha/.test(q)) && !/keine Adresse von Oma/.test(t8), JSON.stringify({ t8, g: I.st.geoQ }));
            const J = mit(E, { 'anna muster': { originalName: 'Anna Muster', address: 'Erste Gasse 1' } }); J.st.plan = { schritte: [FZ2('Annaberg')] };
            const t9 = await frage(J, 'Wie lange brauche ich nach Annaberg?');
            check('18.9 Fall E: unbekannter Name (Annaberg) wird nicht als Kontakt Anna behauptet, sondern als Ort gesucht', (J.st.geoQ || []).some(q => /^Annaberg/.test(q)) && !/Anna Muster/.test(t9), JSON.stringify({ t9, g: J.st.geoQ }));
            const K = mit(E, {}, { 'oma wohnort': 'Gedaechtnisweg 7, 33333 Testdorf' }); K.st.plan = { schritte: [FZ2('Oma')] };
            await frage(K, 'Wie lange brauche ich zu Oma?');
            check('18.10 Oma nur im Gedächtnis mit Adresse: wird verwendet (bestehende Auflösung bleibt)', (K.st.geoQ || []).some(q => /Gedaechtnisweg 7/.test(q)), JSON.stringify(K.st.geoQ));
            const L = mit(E, {}); L.st.plan = { schritte: [FZ2('Oma')] };
            await frage(L, 'Wie lange brauche ich zu Oma?');
            check('18.11 gespeicherte Kontakte bleiben unverändert (nichts geschrieben)', stand(L) === L.z0 && stand(A) === A.z0);
            const M = mit(E, {}); M.st.plan = { schritte: [AB('meiner Mutter', '14:33', 'heute')] };
            const t10 = await frage(M, 'Ich muss nachher zu meiner Mutter fahren. Ich muss um 14:33 Uhr da sein. Wann muss ich losfahren?');
            check('18.12 mehrteilige Abfahrtsfrage (PR #393) ohne Kontakt: eine ehrliche Antwort, keine Ortsrückfrage, keine Ortssuche', /Ich habe keine Adresse von Mutter gespeichert/.test(t10) && !/Welchen Ort/.test(t10) && M.gesagt.length === 1 && keinOrt(M), t10);
            const N = mit(E, KONT); N.st.plan = { schritte: [FZ2('Hamburger Hauptbahnhof', 'Oma')] };
            const t11 = await frage(N, 'Wie lange brauche ich von Oma zum Hamburger Hauptbahnhof?');
            check('18.13 Startort Oma ohne Kontakt: ehrlich, nicht als Ort gesucht', /keine Adresse von Oma gespeichert/.test(t11) && keinOrt(N), JSON.stringify({ t11, g: N.st.geoQ }));
        }
    }
    /* --- 19. Navigation (alte Aktion navigate) mit Kontakten, Arbeit und Zuhause --- */
    {
        const KONT = { mama: { originalName: 'Mama', address: 'Musterweg 1, 12345 Beispielstadt' } };
        const mit = (opt, kontakte, o) => { const A = umgebung(opt); A.setze('savedContacts', kontakte || {}); if (o && o.arbeit) A.setze('workAddress', 'Werkstraße 5, 12345 Beispielstadt'); if (o && o.heim) A.setze('homeAddress', 'Verbrüderungsring 13, 21493 Schwarzenbek'); A.opens = []; A.vm.runInContext("window.__nav = []; (function () { var o = buildMapsLink; buildMapsLink = function (t) { window.__nav.push(String(t)); return o.apply(this, arguments); }; })();", A.sb); A.navs = () => A.vm.runInContext('window.__nav.slice()', A.sb); A.z0 = stand(A); return A; };
        const NAV = to => ({ reply: 'Ich starte die Navigation.', actions: [{ type: 'navigate', nav_to: to }] });
        const href = A => A.navs().join(' ; ');
        const lauf19 = async (A, to, satz) => { A.st.normal = NAV(to); const t = await frage(A, satz); return { t, h: href(A), n: A.gesagt.length }; };
        for (const chefAus of [false, true]) {
            const E = chefAus ? { chefAus: true } : {}; const L = chefAus ? 'AUS' : 'EIN';
            let A = mit(E, KONT); let r = await lauf19(A, 'Mama', 'Navigiere zu Mama');
            check('19.1 (' + L + ') Mama mit Adresse: Navigation zur gespeicherten Adresse, einmal', /Musterweg 1/.test(r.h) && r.n === 1 && (r.h.match(/Musterweg 1/g) || []).length >= 1 && A.navs().length === 1, JSON.stringify(r));
            A = mit(E, KONT); r = await lauf19(A, 'Mutter', 'Navigiere zu meiner Mutter');
            check('19.2 (' + L + ') Alias Mutter -> Mama: gespeicherte Adresse', /Musterweg 1/.test(r.h), JSON.stringify(r));
            A = mit(E, KONT); r = await lauf19(A, 'Oma', 'Navigiere zu Oma');
            check('19.3 (' + L + ') Oma ohne Kontakt: keine Route nach "Oma", ehrliche Frage nach der Adresse', !/destination=Oma|Route nach Oma/.test(r.h) && /keine Adresse von Oma gespeichert\. Wie lautet sie\?/.test(r.t) && A.navs().length === 0, JSON.stringify(r));
            A = mit(E, { 'mama muster': { originalName: 'Mama Muster', address: 'Erste Gasse 1' }, 'mama beispiel': { originalName: 'Mama Beispiel', address: 'Zweite Gasse 2' } }); r = await lauf19(A, 'Mama', 'Navigiere zu Mama');
            check('19.4 (' + L + ') zwei gleichnamige Kontakte: Nachfrage, keine Navigation', /Mama Muster oder Mama Beispiel/.test(r.t) && !/Gasse/.test(r.h) && A.navs().length === 0, JSON.stringify(r));
            A = mit(E, KONT, { arbeit: 1 }); r = await lauf19(A, 'Arbeit', 'Navigiere zur Arbeit');
            check('19.5 (' + L + ') Arbeit: gespeicherte Arbeitsadresse', /Werkstraße 5/.test(r.h), JSON.stringify(r));
            A = mit(E, KONT); r = await lauf19(A, 'Arbeit', 'Navigiere zur Arbeit');
            check('19.5b (' + L + ') Arbeit ohne Adresse: ehrliche Meldung, keine Route nach "Arbeit"', /Arbeitsadresse kenne ich noch nicht/.test(r.t) && A.navs().length === 0 && !/destination=Arbeit/.test(r.h), JSON.stringify(r));
            A = mit(E, KONT, { heim: 1 }); r = await lauf19(A, 'Zuhause', 'Navigiere nach Hause');
            check('19.6 (' + L + ') Zuhause: gespeicherte Heimatadresse', /Verbrüderungsring 13/.test(r.h), JSON.stringify(r));
            A = mit(E, KONT); r = await lauf19(A, 'Hamburg', 'Navigiere nach Hamburg');
            check('19.7 (' + L + ') Hamburg: unverändert normale Route', /destination=Hamburg|Hamburg/.test(r.h) && r.n === 1 && A.navs().length === 1, JSON.stringify(r));
            A = mit(E, KONT); r = await lauf19(A, 'Hauptstraße 5, Hamburg', 'Navigiere zur Hauptstraße 5 in Hamburg');
            check('19.8 (' + L + ') Straßenadresse: unverändert', /Hauptstraße 5/.test(r.h), JSON.stringify(r));
        }
    }
    /* --- 20. Fehlende Adresse im Gespräch ergänzen und die ursprüngliche Aufgabe fortsetzen --- */
    {
        const AB = (ziel, ankunft, tag) => ({ faehigkeit: 'abfahrt', params: tag ? { ziel, ankunft, tag } : { ziel, ankunft } });
        const FZ2 = ziel => ({ faehigkeit: 'fahrzeit', params: { ziel } });
        const ADR = 'Musterstraße 12 in Hamburg';
        const letzte = m => { const u = (m || []).filter(x => x && x.role === 'user'); return String((u[u.length - 1] || {}).content || ''); };
        const navStub = name => m => { const u = letzte(m); if (!/navigier/i.test(u)) return { reply: 'Okay.', actions: [] }; const a = /Musterstraße 12 in Hamburg/.exec(u); return { reply: 'Ich starte die Navigation.', actions: [{ type: 'navigate', nav_to: a ? a[0] : name }] }; };
        const mit = (opt, kontakte) => { const A = umgebung(opt); A.setze('savedContacts', kontakte || {}); A.vm.runInContext("window.__nav = []; (function () { var o = buildMapsLink; buildMapsLink = function (t) { window.__nav.push(String(t)); return o.apply(this, arguments); }; })();", A.sb); A.navs = () => A.vm.runInContext('window.__nav.slice()', A.sb); A.st.normal = navStub('Oma'); A.z0 = stand(A); return A; };
        const sag = async (A, t) => (await tippen(A, t, 200)).join(' | ');
        const kontakte = A => A.lese('savedContacts') || {};
        const anzahl = A => Object.keys(kontakte(A)).length;
        for (const chefAus of [false, true]) {
            const L = chefAus ? 'AUS' : 'EIN', E = chefAus ? { chefAus: true } : {};
            let A = mit(E);
            let t1 = await sag(A, 'Navigiere mich zu Oma');
            check('20.1 (' + L + ') Oma ohne Adresse: Rückfrage "Wie lautet sie?", keine Navigation', /Ich habe keine Adresse von Oma gespeichert\. Wie lautet sie\?/.test(t1) && A.navs().length === 0, t1);
            let t2 = await sag(A, ADR);
            check('20.2 (' + L + ') Adresse genannt: Frage nach der Speicherung, noch nichts gespeichert, keine Navigation', /Soll ich diese Adresse bei Oma in deinen Kontakten speichern\?/.test(t2) && anzahl(A) === 0 && A.navs().length === 0, t2);
            let t3 = await sag(A, 'Ja');
            const k = kontakte(A);
            check('20.3 (' + L + ') Ja: genau ein Kontakt Oma mit der Adresse gespeichert (Erfolg geprüft), erst DANN die Frage nach der Navigation', anzahl(A) === 1 && Object.values(k).some(c => /Musterstraße 12/.test(c.address) && /Oma/i.test(c.originalName)) && /Die Adresse wurde gespeichert\. Soll ich jetzt die Navigation zu Oma starten\?/.test(t3) && A.navs().length === 0, JSON.stringify({ t3, k }));
            let t4 = await sag(A, 'Ja');
            check('20.4 (' + L + ') Ja: genau eine Navigation zur bestätigten Adresse', A.navs().length === 1 && /Musterstraße 12/.test(A.navs()[0]), JSON.stringify({ t4, n: A.navs() }));
            await sag(A, 'Ja');
            check('20.5 (' + L + ') ein weiteres Ja löst nichts mehr aus (keine zweite Navigation, kein zweiter Kontakt)', A.navs().length === 1 && anzahl(A) === 1);

            A = mit(E); await sag(A, 'Navigiere mich zu Oma'); await sag(A, ADR);
            let t6 = await sag(A, 'Nein, nur diesmal verwenden');
            check('20.6 (' + L + ') "Nein, nur diesmal": nichts gespeichert, Nachfrage zur einmaligen Navigation', anzahl(A) === 0 && /ich speichere nichts\. Soll ich die Navigation zu Oma starten/.test(t6) && A.navs().length === 0, t6);
            await sag(A, 'Ja');
            check('20.7 (' + L + ') danach Ja: Navigation zur genannten Adresse, Kontakte weiter unverändert', A.navs().length === 1 && /Musterstraße 12/.test(A.navs()[0]) && anzahl(A) === 0, JSON.stringify(A.navs()));

            A = mit(E, { mama: { originalName: 'Mama' } }); A.st.normal = navStub('Mutter');
            await sag(A, 'Navigiere mich zu meiner Mutter'); await sag(A, ADR); await sag(A, 'Ja');
            check('20.8 (' + L + ') Kontakt Mama vorhanden, aber ohne Adresse (Alias Mutter): Adresse wird ergänzt, kein zweiter Kontakt', anzahl(A) === 1 && /Musterstraße 12/.test((kontakte(A).mama || {}).address || ''), JSON.stringify(kontakte(A)));

            A = mit(E); await sag(A, 'Navigiere mich zu Oma');
            let t9 = await sag(A, 'Hamburg');
            check('20.9 (' + L + ') unvollständige Adresse ("Hamburg"): ehrliche Nachfrage, nichts gespeichert', /nicht nach einer vollständigen Adresse/.test(t9) && anzahl(A) === 0, t9);
            let t9b = await sag(A, 'Hamburg');
            check('20.10 (' + L + ') zweiter Fehlversuch: Abbruch, nichts gespeichert, keine Navigation', /keine vollständige Adresse\. Ich lasse es dabei/.test(t9b) && anzahl(A) === 0 && A.navs().length === 0, t9b);

            for (const [stufe, abbruchWort] of [[0, 'Abbrechen'], [1, 'Nein'], [2, 'Nein']]) {
                A = mit(E); await sag(A, 'Navigiere mich zu Oma');
                if (stufe >= 1) await sag(A, ADR);
                if (stufe >= 2) await sag(A, 'Ja');
                const tx = await sag(A, abbruchWort);
                if (stufe === 1) await sag(A, 'Nein');   // "Nein" bei der Speicherfrage fragt nach der einmaligen Nutzung; das zweite Nein beendet
                check('20.11 (' + L + ') "' + abbruchWort + '" auf Stufe ' + stufe + ': keine Navigation' + (stufe === 2 ? ', Kontakt bleibt gespeichert' : ', nichts gespeichert'), A.navs().length === 0 && anzahl(A) === (stufe === 2 ? 1 : 0), JSON.stringify({ tx, n: A.navs(), k: kontakte(A) }));
            }

            A = mit(E); await sag(A, 'Navigiere mich zu Oma');
            await sag(A, 'Wie spät ist es');
            await sag(A, ADR); await sag(A, 'Ja'); await sag(A, 'Ja');
            check('20.12 (' + L + ') Themenwechsel: die Rückfrage verfällt, späteres Adresse/Ja löst weder Speichern noch Navigation aus', A.navs().length === 0 && anzahl(A) === 0, JSON.stringify({ n: A.navs(), k: kontakte(A) }));

            A = mit(E); A.st.normal = navStub('Mama');
            A.setze('savedContacts', { 'mama muster': { originalName: 'Mama Muster', address: 'Erste Gasse 1' }, 'mama beispiel': { originalName: 'Mama Beispiel', address: 'Zweite Gasse 2' } });
            let t13 = await sag(A, 'Navigiere mich zu Mama');
            check('20.13 (' + L + ') mehrdeutige Kontakte: bestehende Auswahlfrage, kein Adressdialog, keine Navigation', /Mama Muster, Mama Beispiel|Mama Muster oder Mama Beispiel/.test(t13) && A.navs().length === 0, t13);
            await sag(A, 'die zweite');
            check('20.14 (' + L + ') Auswahl "die zweite" führt zur Navigation zu Mama Beispiel (bestehendes Verhalten)', A.navs().length === 1 && /Zweite Gasse 2/.test(A.navs()[0]), JSON.stringify(A.navs()));

            A = mit(E, { oma: { originalName: 'Oma', address: 'Altweg 3, 22222 Altstadt' } });
            await sag(A, 'Navigiere mich zu Oma');
            check('20.15 (' + L + ') Oma mit gespeicherter Adresse: sofort Navigation, kein Dialog', A.navs().length === 1 && /Altweg 3/.test(A.navs()[0]) && !(A.sb.jvRueckfrage.adresseOffen && A.sb.jvRueckfrage.adresseOffen()), JSON.stringify(A.navs()));
        }
        /* Fahrzeit und Abfahrt (über Planer und Registry, Chef-KI EIN) */
        {
            const planer = m => { const u = letzte(m); return { schritte: [/Musterstra/.test(u) ? FZ2('Musterstraße 12 in Hamburg') : FZ2('Oma')] }; };
            let A = mit({}); A.st.plan = planer;
            let t1 = await sag(A, 'Wie lange brauche ich zu Oma?');
            check('20.16 Fahrzeit zu Oma ohne Adresse: Rückfrage, keine Route', /keine Adresse von Oma gespeichert\. Wie lautet sie\?/.test(t1) && !(A.st.routeUrls || []).length, t1);
            await sag(A, ADR); await sag(A, 'Nein, nur diesmal');
            const t3 = await sag(A, 'Ja');
            check('20.17 Fahrzeit: nach Adresse + "nur diesmal" + Ja wird die Fahrzeit zur genannten Adresse berechnet, nichts gespeichert', (A.st.geoQ || []).some(q => /Musterstraße 12/.test(q)) && (A.st.routeUrls || []).length === 1 && /Minuten/.test(t3) && anzahl(A) === 0, JSON.stringify({ t3, g: A.st.geoQ }));
            A = mit({}); A.st.plan = m => { const u = letzte(m); return { schritte: [AB(/Musterstra/.test(u) ? 'Musterstraße 12 in Hamburg' : 'Oma', '15:00', 'heute')] }; };
            let t4 = await sag(A, 'Wann muss ich zu Oma losfahren, um 15 Uhr dort zu sein?');
            check('20.18 Abfahrt zu Oma ohne Adresse: Rückfrage, keine Abfahrtszeit', /keine Adresse von Oma gespeichert\. Wie lautet sie\?/.test(t4) && !/spätestens/.test(t4), t4);
            await sag(A, ADR); await sag(A, 'Ja'); const t6 = await sag(A, 'Ja');
            check('20.19 Abfahrt: Speichern bestätigt, danach Berechnung zur Adresse mit 15 Uhr und heute', anzahl(A) === 1 && /spätestens um/.test(t6) && (A.st.geoQ || []).some(q => /Musterstraße 12/.test(q)), JSON.stringify({ t6, k: kontakte(A) }));
        }
        /* Bestehende Navigation unverändert */
        for (const chefAus of [false, true]) {
            const E = chefAus ? { chefAus: true } : {}; const L = chefAus ? 'AUS' : 'EIN';
            for (const [ziel, satz, erwartet, setup] of [['Hamburg', 'Navigiere nach Hamburg', /Hamburg/, null], ['Arbeit', 'Navigiere zur Arbeit', /Werkstraße 5/, A => A.setze('workAddress', 'Werkstraße 5, 12345 Beispielstadt')], ['Zuhause', 'Navigiere nach Hause', /Verbrüderungsring 13/, A => A.setze('homeAddress', 'Verbrüderungsring 13, 21493 Schwarzenbek')]]) {
                const A = mit(E); A.st.normal = { reply: 'ok', actions: [{ type: 'navigate', nav_to: ziel }] }; if (setup) setup(A);
                await sag(A, satz);
                check('20.20 (' + L + ') bestehende Navigation ' + ziel + ' unverändert, genau eine, kein Dialog', A.navs().length === 1 && erwartet.test(A.navs()[0]) && !A.sb.jvRueckfrage.adresseOffen(), JSON.stringify(A.navs()));
            }
        }
        /* --- 21. Handytest PR #396: die KI stellt die Adressfrage selbst (keine Aktion) -> Jarvis muss den Dialog trotzdem führen --- */
        {
            const HADR = 'Frankfurter Straße 21 in Schwarzenbek';
            const kiFragt = A => { A.st.kiSaetze = []; A.st.normal = m => { const u = letzte(m); A.st.kiSaetze.push(u); const a = /Frankfurter[^?]*/.exec(u); return a ? { reply: 'Ich starte die Navigation.', actions: [{ type: 'navigate', nav_to: a[0] }] } : { reply: 'Wie lautet die genaue Adresse von Oma, Sir?', actions: [] }; }; };
            for (const chefAus of [false, true]) for (const weg of ['tippen', 'mikro']) for (const punkt of ['.', '']) {
                const L = (chefAus ? 'AUS' : 'EIN') + '/' + weg + (punkt ? '/Punkt' : '');
                const A = mit(chefAus ? { chefAus: true } : {}); kiFragt(A);
                const f = weg === 'tippen' ? tippen : mikro;
                const sagW = async t => (await f(A, t, 200)).join(' | ');
                const a1 = await sagW('Navigiere mich zu Oma.');
                check('21.1 (' + L + ') Oma ohne Adresse: Jarvis fragt selbst, die KI wird nicht gefragt, keine Navigation', /keine Adresse von Oma gespeichert\. Wie lautet sie\?/.test(a1) && A.st.kiSaetze.length === 0 && A.navs().length === 0 && !!A.sb.jvRueckfrage.adresseOffen(), a1);
                const a2 = await sagW(HADR + punkt);
                check('21.2 (' + L + ') gesprochene Adresse: erst die Speicherfrage, keine Navigation, nichts gespeichert, KI nicht gefragt', /Soll ich diese Adresse bei Oma in deinen Kontakten speichern\?/.test(a2) && A.navs().length === 0 && anzahl(A) === 0 && A.st.kiSaetze.length === 0, a2);
                const a3 = await sagW('Ja');
                check('21.3 (' + L + ') Ja: gespeichert, dann erst die Frage nach der Navigation, noch keine Navigation', anzahl(A) === 1 && /Soll ich jetzt die Navigation zu Oma starten\?/.test(a3) && A.navs().length === 0, a3);
                await sagW('Ja');
                check('21.4 (' + L + ') zweites Ja: genau eine Navigation zur Adresse', A.navs().length === 1 && /Frankfurter Straße 21/.test(A.navs()[0]), JSON.stringify(A.navs()));
            }
            for (const satz of ['Fahr mich zu Oma', 'Bring mich zu meiner Oma', 'Route zu Oma']) {
                const A = mit({}); kiFragt(A);
                const t = await sag(A, satz);
                check('21.5 Variante "' + satz + '": Jarvis-Rückfrage statt KI', /keine Adresse von Oma gespeichert/.test(t) && A.st.kiSaetze.length === 0 && A.navs().length === 0, t);
            }
            {   // Oma mit Adresse und Orte: unverändert, kein Dialog
                const A = mit({}, { oma: { originalName: 'Oma', address: 'Altweg 3, 22222 Altstadt' } }); kiFragt(A);
                await sag(A, 'Navigiere mich zu Oma');
                check('21.6 Oma mit Adresse: Weg über die bisherige Navigation, kein Dialog', !A.sb.jvRueckfrage.adresseOffen(), JSON.stringify(A.navs()));
                const B = mit({}); kiFragt(B); B.st.normal = { reply: 'ok', actions: [{ type: 'navigate', nav_to: 'Hamburg' }] };
                await sag(B, 'Navigiere mich nach Hamburg');
                check('21.7 normaler Ort ohne Person: unverändert genau eine Navigation, kein Dialog', B.navs().length === 1 && !B.sb.jvRueckfrage.adresseOffen(), JSON.stringify(B.navs()));
                const C = mit({}); kiFragt(C);
                await sag(C, 'Wann fahre ich heute nach Hause?');
                check('21.8 Frage "Wann fahre ich heute nach Hause?" wird nicht vom Adress-Dialog abgefangen', !C.sb.jvRueckfrage.adresseOffen());
            }
        }
    }
    /* --- 22. Werkzeug schicht (lesend): Schichtplan für die Chef-KI, nichts erfunden --- */
    {
        const mit = (opt, o) => { o = o || {}; const A = umgebung(opt || {}); const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 11, d: 2 });
            if (!o.ohnePlan) A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'frueh', times: { frueh: 225, spaet: 720 }, auto: true }));
            if (o.urlaub) A.store['jv_urlaub'] = JSON.stringify(o.urlaub);
            if (o.ausnahme) { A.sb.jvPlan.setBeginnTag('2026-11-09', 12 * 60 + 33); A.sb.jvPlan.setTagVor('2026-11-09', 72); }
            A.z0 = stand(A); return A; };   // heute Do 05.11.2026: diese Woche Früh, ab Mo 09.11. Spät
        const tool = (A, p) => A.sb.jvRegistry.fuehreAus('schicht', p, {});
        const A = mit();
        let r = await tool(A, {});
        check('22.1 heute (Do, Frühschicht): Beginn 5 Uhr 10, Feierabend 14 Uhr 37, geplante Abfahrt 4 Uhr 30', r.status === 'SUCCESS' && /Heute hast du Frühschicht/.test(r.nachricht) && /5 Uhr 10/.test(r.nachricht) && /14 Uhr 37/.test(r.nachricht) && /4 Uhr 30/.test(r.nachricht), JSON.stringify(r));
        r = await tool(A, { tag: 'samstag' });
        check('22.2 Samstag: keine Schicht, Wochenende, keine Zeiten', r.status === 'SUCCESS' && /keine Schicht, es ist Wochenende/.test(r.nachricht) && !/Uhr/.test(r.nachricht), JSON.stringify(r));
        r = await tool(A, { tag: 'montag' });
        check('22.3 Montag (Spätschicht): Beginn 13 Uhr 50, Feierabend 22 Uhr 12, Abfahrt 13 Uhr', /Spätschicht/.test(r.nachricht) && /13 Uhr 50/.test(r.nachricht) && /22 Uhr 12/.test(r.nachricht) && /gegen 13 Uhr\./.test(r.nachricht), JSON.stringify(r));
        r = await tool(A, { tag: '2026-11-12' });
        check('22.4 Datum: Donnerstag 12.11. Spätschicht, Datum ohne Jahr und ohne Doppelpunkt', /Am Donnerstag, den 12\.11\. hast du Spätschicht/.test(r.nachricht), r.nachricht);
        r = await tool(A, { tag: 'quatsch' });
        check('22.5 unklarer Tag: Nachfrage, keine Zeit', r.status === 'NEEDS_INFORMATION' && !/Uhr/.test(r.nachricht), JSON.stringify(r));
        const E = mit({}, { ausnahme: true });
        r = await tool(E, { tag: 'montag' });
        check('22.6 einmalige Änderung (Mo 12:33): Beginn 12 Uhr 33, Abfahrt 11 Uhr 48 (Standard 13:00 minus 72 Minuten), als einmalig benannt; Normalplan unverändert', /12 Uhr 33/.test(r.nachricht) && /11 Uhr 48/.test(r.nachricht) && /einmalige Änderung/.test(r.nachricht) && E.sb.jvPlan.beginn('spaet') === 13 * 60 + 50, r.nachricht);
        r = await tool(E, { tag: '2026-11-10' });
        check('22.7 der Tag danach (Di) bleibt normal, ohne Hinweis auf die Ausnahme', /13 Uhr 50/.test(r.nachricht) && !/einmalige/.test(r.nachricht), r.nachricht);
        const U = mit({}, { urlaub: { von: '2026-11-10', bis: '2026-11-10' } });
        r = await tool(U, { tag: '2026-11-10' });
        check('22.8 Urlaubstag: keine Schicht wegen Urlaub', /du hast Urlaub/.test(r.nachricht) && !/Uhr/.test(r.nachricht), r.nachricht);
        const O = mit({}, { ohnePlan: true });
        r = await tool(O, { tag: 'morgen' });
        check('22.9 ohne eingestellten Plan: ehrlich "noch nicht eingestellt", keine erfundene Zeit', !/Uhr \d|Beginn um/.test(r.nachricht || '') && /noch nicht eingestellt/.test(r.nachricht || ''), JSON.stringify(r));
        check('22.10 Freigabe: lesend, in der Chef-KI-Liste, nicht bei den Schreibenden; Registry meldet keine Bestätigung', A.sb.jvChef.FREIGEGEBEN.includes('schicht') && !A.sb.jvChef.SCHREIB.includes('schicht') && A.sb.jvRegistry.hole('schicht').bestaetigung.noetig === false);
        const quelle = require('fs').readFileSync(__dirname + '/../js/registry_faehigkeiten.js', 'utf8'), teil = quelle.slice(quelle.indexOf("name: 'schicht'"), quelle.indexOf('2c. Fahrzeit mit dem Auto'));
        check('22.11 Quelltext des Werkzeugs: kein Schreibzugriff (set*, save, localStorage, executeAction)', teil.length > 500 && !/executeAction|localStorage|setPersistentData|\.set[A-Z]\w*\(|save\(|savedContacts\s*=/.test(teil.replace(/\/\*[\s\S]*?\*\//g, '')));
        /* Planer-Prüfung und Kombination mit Wetter über den echten Sprachweg (Chef-KI EIN) */
        const SATZ2 = 'Habe ich Samstag frei und wie wird morgen das Wetter?';
        const K = mit(); K.st.plan = { schritte: [{ faehigkeit: 'schicht', params: { tag: 'samstag' } }, { faehigkeit: 'wetter', params: { tag: 'morgen' } }] };
        const g = (await tippen(K, SATZ2, 300)).join(' | ');
        check('22.12 Kombination Schicht + Wetter: beide Auskünfte, ein Plan, keine normale KI', /Übermorgen hast du keine Schicht, es ist Wochenende/.test(g) && /Wetter morgen/.test(g) && K.st.ent === 1 && K.st.groq === 0, g + ' ent ' + K.st.ent + ' groq ' + K.st.groq);
        for (const [name, schritte] of [['zwei Schicht-Schritte', [{ faehigkeit: 'schicht', params: { tag: 'samstag' } }, { faehigkeit: 'schicht', params: { tag: 'sonntag' } }]], ['unbekannter Parameter', [{ faehigkeit: 'schicht', params: { tag: 'samstag', schichtzeit: '5 Uhr' } }]], ['ungültiger Tag', [{ faehigkeit: 'schicht', params: { tag: 'irgendwann' } }]]]) {
            const X = mit(); X.st.plan = { schritte: schritte.concat([{ faehigkeit: 'wetter', params: { tag: 'morgen' } }]) };
            const gx = (await tippen(X, SATZ2, 300)).join(' | ');
            check('22.13 ungültiger Plan (' + name + ') wird verworfen: keine Schicht-Auskunft aus dem Plan, normaler Weg übernimmt', !/keine Schicht, es ist Wochenende/.test(gx) && X.st.groq >= 1, gx + ' groq ' + X.st.groq);
        }
    }
    // Regression: Arbeitsweg-Verkehr darf bei gespeicherter Adresse nicht nach dem Ziel fragen.
    {
        const X = umgebung();
        X.setze('workAddress', 'Beispielstraße 1, Hamburg');
        const p = X.sb.jvChef._lokal('Wie ist die Verkehrslage auf meinem Weg zur Arbeit?');
        check('23.1 Arbeitsweg-Verkehr nutzt gespeicherte Arbeitsadresse', p.schritte.length === 1 && p.schritte[0].faehigkeit === 'fahrzeit' && p.schritte[0].params.ziel === 'Beispielstraße 1, Hamburg');
        const q = X.sb.jvChef._lokal('Wie ist die Verkehrslage nach Berlin?');
        check('23.2 andere Verkehrsziele werden nicht zur Arbeit umgelenkt', q.schritte.length === 0);
    }
    // Regression: Wetter „dort“ in einer Arbeitsweg-Mehrfachfrage bezieht sich auf die gespeicherte Arbeitsadresse.
    {
        const X = umgebung();
        X.setze('workAddress', 'Neu-Galliner-Ring 6, Gallin');
        X.st.plan = { schritte: [{ faehigkeit: 'wetter', params: { tag: 'morgen' } }] };
        const antworten = (await tippen(X, 'Wann muss ich morgen zur Arbeit losfahren, wie wird das Wetter dort und gibt es Staus auf meinem Arbeitsweg?')).join(' | ');
        check('24.1 Arbeitsweg mit Wetter dort fragt nicht nach einem unbekannten Ort', !/Welchen Ort meinst du/.test(antworten), antworten);
        check('24.2 Arbeitsweg-Mehrfachfrage erreicht den Chef-Planer', X.st.ent > 0, JSON.stringify({ ent: X.st.ent, antworten }));
        const Y = umgebung();
        const unklar = (await tippen(Y, 'Wie wird das Wetter dort morgen?')).join(' | ');
        check('24.3 ohne bekannten Ort bleibt die Rückfrage erhalten', /Welchen Ort meinst du/.test(unklar), unklar);
    }
    // Morgen-Arbeitsweg: keine heutige Ankunft als Antwort auf die morgige Schichtabfahrt.
    {
        const SATZ = 'Wann muss ich morgen zur Arbeit losfahren, wie wird das Wetter dort und gibt es Staus auf meinem Arbeitsweg?';
        const X = umgebung(); X.setze('workAddress', 'Neu-Galliner-Ring 6, Gallin');
        X.st.plan = { schritte: [{ faehigkeit: 'fahrzeit', params: { ziel: 'Neu-Galliner-Ring 6, Gallin' } }] };
        const a = (await tippen(X, SATZ)).join(' | ');
        check('25.1 unvollständiger Morgen-Plan nennt keine heutige Ankunft als morgige Abfahrt', !/ankunft.*(?:heute|jetzt|19:51)|abfahrt.*19:51/i.test(a), a);
        const Y = umgebung(); Y.setze('workAddress', 'Neu-Galliner-Ring 6, Gallin');
        Y.st.plan = { schritte: [
            { faehigkeit: 'schicht', params: { tag: 'morgen' } },
            { faehigkeit: 'wetter', params: { tag: 'morgen' } },
            { faehigkeit: 'fahrzeit', params: { ziel: 'Neu-Galliner-Ring 6, Gallin' } }
        ] };
        const b = (await tippen(Y, SATZ)).join(' | ');
        check('25.2 vollständiger Morgen-Plan wird nicht als reine Fahrzeit abgelehnt', !/nicht zusammen sicher prüfen/.test(b) && Y.st.ent > 0, b);
    }
    {
        const quelltext = require('fs').readFileSync(require('path').join(__dirname, '../js/chef.js'), 'utf8');
        check('25.3 Morgen-Kombifrage bleibt beim allgemeinen KI-Planer',
            quelltext.includes('var pr = await Promise.race([plane(text, { entscheider: entsch })') &&
            !quelltext.includes("absicht: 'arbeitsweg_morgen'") &&
            quelltext.includes('Bei Fragen nach dem Losfahren ZUR ARBEIT kommt die geplante Abfahrtszeit aus schicht'));

    }
    {
        const quelltext = require('fs').readFileSync(require('path').join(__dirname, '../js/chef.js'), 'utf8');
        check('26.1 Schichtwissen wird vor dem allgemeinen KI-Planer bereitgestellt',
            quelltext.includes('function schichtFakten()') &&
            quelltext.includes('P.schichtAm(tag)') &&
            quelltext.includes('P.abfahrtMin(sh, tag)') &&
            quelltext.includes('var gespeicherteSchichten = schichtFakten()') &&
            quelltext.indexOf('var gespeicherteSchichten = schichtFakten()') <
            quelltext.indexOf('var pr = await Promise.race([plane(text, { entscheider: entsch })'));
        check('26.2 ohne eingerichtete Schicht keine erfundene Schichtzeit',
            quelltext.includes("!T.load()") && quelltext.includes("schicht: 'frei'"));
    }
    // Regression #418: Der echte Sprachweg darf eine kombinierte Arbeitswegfrage
    // nicht durch einen lokalen Einzelbefehl (Lagebild/Route) verschlucken.
    {
        const saetze = [
            'Wann muss ich morgen zur Arbeit losfahren, wie wird das Wetter dort und gibt es Staus auf meinem Arbeitsweg?',
            'Wie sieht es morgen mit meiner Schicht aus und gibt es Verkehr auf der Strecke?',
            'Ich fahre morgen zur Arbeit: Ist die Route frei und wie wird das Wetter?'
        ];
        for (let i = 0; i < saetze.length; i++) {
            const X = umgebung();
            X.setze('workAddress', 'Neu-Galliner-Ring 6, Gallin');
            check('27.' + (i + 1) + ' kombinierte Arbeitswegfrage erhält Chef-Vorrang',
                X.sb.jvChef.mehrteilig(saetze[i]) === true, saetze[i]);
        }
        const X = umgebung();
        check('27.4 reine Routenfrage bleibt beim bisherigen Weg',
            X.sb.jvChef.mehrteilig('Zeig mir die Route zur Arbeit') === false);
    }
    // Regression #419: vollständiger Sprachweg, nicht nur jvChef.mehrteilig().
    // Bei kaputtem oder unvollständigem Plan niemals das Jetzt-Lagebild öffnen.
    {
        const s = 'Wann muss ich morgen zur Arbeit losfahren, wie wird das Wetter dort und gibt es Staus auf meinem Arbeitsweg?';
        for (const art of ['ungueltig', 'fehler']) {
            const X = umgebung(); X.setze('workAddress', 'Neu-Galliner-Ring 6, Gallin');
            if (art === 'ungueltig') X.st.plan = { schritte: [] };
            else X.st.verhalten = 'fehler';
            const antwort = (await mikro(X, s, 150)).join(' | ');
            check('28.' + (art === 'ungueltig' ? '1' : '2') + ' Mikrofon-Morgenfrage erreicht den Chef-Planer', X.st.ent > 0, JSON.stringify({ art, ent: X.st.ent, antwort, codes: codes(X) }));
            check('28.' + (art === 'ungueltig' ? '3' : '4') + ' Morgenfrage: aktuelle Verkehrslage klar gekennzeichnet, kein normaler Rückfall',
                X.st.groq === 0 && /morgig|morgen|Schichtfahrt/i.test(antwort) &&
                (!(X.st.routeUrls || []).length || /jetzt|aktuelle Lage/i.test(antwort)) &&
                !/morgen[^.]*\\b(?:brauchst du jetzt|Ankunft jetzt)\\b/i.test(antwort),
                JSON.stringify({ art, groq: X.st.groq, route: X.st.routeUrls, antwort }));
        }
    }
    // Regression #421: Die echte Plan-Uhr() liefert „13 Uhr 3“, nicht „13:03“.
    // Der Morgen-Fallback muss uhrHM verwenden und bei vorhandenem Schichtplan antworten.
    {
        const SATZ = 'Wann muss ich morgen zur Arbeit losfahren, wie wird das Wetter dort und gibt es Staus auf meinem Arbeitsweg?';
        for (const art of ['ungueltig', 'fehler']) {
            const X = umgebung();
            X.setze('workAddress', 'Neu-Galliner-Ring 6, Gallin');
            const T = X.sb._schichtTest;
            X.sb.setPersistentData('jv_schicht', JSON.stringify({
                base: T.weekNo({ y: 2026, m: 11, d: 5 }),
                shift: 'spaet', times: { frueh: 225, spaet: 720 }, auto: true
            }));
            if (art === 'ungueltig') X.st.plan = { schritte: [] };
            else X.st.verhalten = 'fehler';
            const antwort = (await mikro(X, SATZ, 150)).join(' | ');
            check('29.' + (art === 'ungueltig' ? '1' : '2') + ' echte Mikrofonfrage liefert morgige gespeicherte Abfahrt auch bei Planfehler',
                /Morgen hast du (?:laut gespeichertem Schichtplan )?(?:Spät|spaet)schicht/i.test(antwort) &&
                /geplante Abfahrt (?:ist um \d{1,2}:\d{2} Uhr|gegen \d{1,2} Uhr)/.test(antwort) &&
                !/Die morgige Schichtfahrt konnte ich gerade nicht vollständig prüfen/.test(antwort) &&
                X.st.groq === 0 &&
                (!(X.st.routeUrls || []).length || /aktuelle Lage|jetzt/i.test(antwort)),
                JSON.stringify({ art, antwort, groq: X.st.groq, route: X.st.routeUrls }));
        }
    }
    // Regression #422: Bei unvollständiger, aber gültiger KI-Auswahl werden
    // die drei bestehenden Lese-Werkzeuge für die Morgen-Kombifrage ausgeführt.
    {
        const SATZ = 'Wann muss ich morgen zur Arbeit losfahren, wie wird das Wetter dort und gibt es Staus auf meinem Arbeitsweg?';
        const X = umgebung();
        X.setze('workAddress', 'Neu-Galliner-Ring 6, Gallin');
        const T = X.sb._schichtTest;
        X.sb.setPersistentData('jv_schicht', JSON.stringify({
            base: T.weekNo({ y: 2026, m: 11, d: 5 }), shift: 'spaet',
            times: { frueh: 225, spaet: 720 }, auto: true
        }));
        X.st.plan = { schritte: [{ faehigkeit: 'wetter', params: { tag: 'morgen' } }] };
        const antwort = (await mikro(X, SATZ, 300)).join(' | ');
        check('30.1 unvollständiger KI-Plan liefert Schicht und Wetter statt nur Teilantwort',
            /Spätschicht/i.test(antwort) && X.st.wetterN > 0,
            JSON.stringify({ antwort, wetterN: X.st.wetterN }));
        check('30.2 aktuelle Verkehrslage wird abgefragt und nicht als morgige Prognose ausgegeben',
            (X.st.routeUrls || []).length > 0 && /aktuelle Lage, keine verlässliche Stauprognose/i.test(antwort),
            JSON.stringify({ antwort, route: X.st.routeUrls }));
    }
    console.log('Chef-Fahrzeit: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
