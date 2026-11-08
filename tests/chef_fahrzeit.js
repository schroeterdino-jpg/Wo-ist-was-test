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
            return ant({ choices: [{ message: { content: JSON.stringify(st.normal || { reply: 'Okay.', actions: [] }) } }] });
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
        check('8.1 Meldung AUF der Route (autobahn.de und TomTom) wird genannt', /Auf der Strecke gemeldet:/.test(t) && /Reinbek - Hamburg-Billstedt/.test(t) && /Stau auf der A24 zwischen Schwarzenbek-Nord und Talkau/.test(t), t);
        check('8.2 Sperrungen/Meldungen NAHE der Route, daneben oder weit weg werden NICHT genannt', !/Wentorf|Aumühle|Norderelbbrücke|Fremdstraße|Woanders|Nebenstraße|Daneben/.test(t) && !/nahe deiner Route|nahe der Route/.test(t), t);
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
        check('15.2 kein Kontakt: ehrlich "nicht gefunden", keine erfundene Adresse', /keinen Kontakt/.test(t2) && !/Musterweg|Testallee/.test(t2) && B.st.webN === 0, t2);
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
        check('16.5 Kontakt ohne Adresse: ehrlich gesagt, keine Abfahrtszeit, keine Route', /keine Adresse gespeichert/.test(t4) && !/spätestens/.test(t4) && !(D.st.routeUrls || []).length, t4);
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
    console.log('Chef-Fahrzeit: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
