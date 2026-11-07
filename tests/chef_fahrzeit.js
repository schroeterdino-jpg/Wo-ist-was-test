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
            return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Okay.', actions: [] }) } }] });
        }
        if (/api\/geocode/.test(u)) { st.geoN = (st.geoN || 0) + 1; const q = decodeURIComponent((u.match(/q=([^&]*)/) || [])[1] || ''); st.geoQ = (st.geoQ || []).concat(q); if (st.geo === 'leer') return ant([]); return ant([{ lat: /schwarzenbek/i.test(q) ? '53.50' : '53.55', lon: /schwarzenbek/i.test(q) ? '10.48' : '10.0', display_name: q + ', Deutschland', class: st.geoKlasse || 'boundary', type: 'administrative' }]); }
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
            if (google && st.route === 'google') return ant({ code: 'Ok', quelle: 'google', routes: [{ duration: st.dauer || 2400, distance: st.meter || 41000, legs: [{ steps: [{ ref: 'A24', name: '' }] }] }] });
            if (google && st.route === 'osrm') return { ok: false, status: 503, json: async () => ({}) };   // Google nicht verfügbar (Schlüssel/Limit): der Server fällt auf OSRM zurück
            return ant({ code: 'Ok', routes: [{ duration: st.dauerOsrm || 2100, distance: st.meter || 41000, legs: [{ steps: [{ ref: 'A24', name: '' }] }] }] });
        }
        if (/api\/stau/.test(u)) { st.stauN = (st.stauN || 0) + 1; return ant(/traffic=1/.test(u) ? { incidents: [] } : { warning: [], webcam: [] }); }
        if (/api\/memory/.test(u)) return ant({});
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.st = st;
    A.sb.answerWithWebSearch = async (f, s) => { st.webN++; (st.webArgs = st.webArgs || []).push(f); if (st.web === 'haengt') return new Promise(res => { st.webHaengt = res; }); return st.web === 'fehler' ? null : 'Die Nachrichten: in Hamburg ist es ruhig.'; };
    A.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.1 });
    A.sb.navigator.geolocation.getCurrentPosition = (okf, err) => okf({ coords: { latitude: 53.5, longitude: 10.1 } });
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
        check('1.5 ohne Startort: vom Standort aus, gleiche Aussage', /^Bis Hamburger Hauptbahnhof brauchst du jetzt etwa 40 Minuten/.test(t2) && (B.st.geoQ || []).indexOf('Schwarzenbek') < 0, t2);
    }
    /* 2 Route ohne aktuelle Verkehrsdaten */
    {
        const A = umgebung(); A.st.route = 'osrm'; A.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof', 'Schwarzenbek')] };
        const t = await frage(A, SATZ);
        check('2.1 ohne Live-Verkehr: berechnete Route (35 Minuten) und ausdrücklich "keine Live-Auskunft"', /nach der berechneten Route etwa 35 Minuten/.test(t) && /Aktuelle Verkehrsdaten sind darin nicht eingerechnet/.test(t) && /keine Live-Auskunft/.test(t) && !/aktuellen Verkehr\./.test(t), t);
        check('2.2 keine Websuche, keine erfundene zweite Zahl', A.st.webN === 0 && A.st.groq === 0 && !/38|40 Minuten/.test(t), t);
        check('2.3 gemeldete Verzögerung (Stau auf der Strecke) wird nur genannt, wenn sie wirklich gemeldet ist', !/Verzögerung/.test(t));
        const B = umgebung(); B.st.route = 'osrm'; B.sb.jvStauMin = 0; B.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        const orig = B.sb.describeAutobahnStau;
        B.sb.describeAutobahnStau = async function () { B.sb.jvStauMin = 12; return ' Achtung, auf der Strecke aktuell gemeldet: A24: Hamburg-Billstedt (Stau).'; };
        const t2 = await frage(B, 'Wie lange brauche ich mit dem Auto zum Hamburger Hauptbahnhof?');
        check('2.4 Staumeldung aus der echten Abfrage wird übernommen, Verzögerung ausgewiesen', /etwa 12 Minuten zusätzlich/.test(t2) && /A24: Hamburg-Billstedt \(Stau\)/.test(t2) && /keine Live-Auskunft/.test(t2), t2);
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
        check('4.4 unglaubwürdig weites Ziel: nachfragen statt eine Zahl zu nennen', /ungewöhnlich weit entfernt/.test(t3) && /nenne ich deshalb nicht/.test(t3), t3);
        const D = umgebung(); D.st.route = 'fehler'; D.st.plan = { schritte: [W('heute'), FZ('Hamburger Hauptbahnhof')] };
        const t4 = await frage(D, 'Wie ist das Wetter und wie lange brauche ich mit dem Auto zum Hamburger Hauptbahnhof?');
        check('4.5 Wetter klappt, Fahrzeit nicht: Wetter wird gesagt, die Fahrzeit ehrlich als nicht berechnet', /Grad|Wetter/.test(t4) && /Die Fahrzeit konnte ich gerade nicht berechnen, und ich schätze sie nicht/.test(t4) && !/\d+ Minuten/.test(t4), t4);
        const E = umgebung(); E.st.route = 'haengt'; E.st.plan = { schritte: [FZ('Hamburger Hauptbahnhof')] };
        await tippen(E, 'Wie lange brauche ich mit dem Auto zum Hamburger Hauptbahnhof?', 25000);
        check('4.6 Route antwortet nicht (Zeitlimit): bisheriger Weg genau einmal, keine Zahl von der Chef-KI', E.st.groq === 1 && E.st.webN === 0, JSON.stringify({ g: E.st.groq, w: E.st.webN, c: codes(E) }));
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
    console.log('Chef-Fahrzeit: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
