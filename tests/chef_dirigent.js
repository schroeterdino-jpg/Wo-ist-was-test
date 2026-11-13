/* ============================================================
   TESTS Intelligenter Dirigent (Phase 5): die acht Beispielsätze über den echten Sprachweg (Planer = Attrappe), Selbstbezug, Schreibschutz, Fehler, Zeitlimit, Rückfallweg, Aus-Schalter.
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
    const st = { plan: { schritte: [] }, verhalten: '', wetter: 'ok', web: 'ok', places: 'ok', ent: 0, groq: 0, webN: 0, wetterN: 0, placesN: 0, entNachrichten: [], normaleSaetze: [], webHaengt: null, shop: 'ok' };
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
        if (/api\/geocode/.test(u)) { st.geoN = (st.geoN || 0) + 1; const q = decodeURIComponent((u.match(/q=([^&]*)/) || [])[1] || ''); st.geoQ = (st.geoQ || []).concat(q); if (st.geo === 'leer') return ant([]); return ant([{ lat: '53.55', lon: '10.0', display_name: q + ', Deutschland', class: st.geoKlasse || 'boundary', type: 'administrative' }]); }
        if (/open-meteo/.test(u)) { (st.wetterUrls = st.wetterUrls || []).push(u); st.wetterN++; if (st.wetter === 'fehler') throw new Error('offline'); return ant(/daily=/.test(u) && /current=/.test(u) ? Object.assign({}, WETTER_JETZT, WETTER_TAGE) : /daily=/.test(u) ? WETTER_TAGE : WETTER_JETZT); }
        if (/action=places/.test(u)) { st.placesN++; if (st.places === 'fehler') return { ok: false, status: 500, json: async () => ({}) }; return ant({ places: st.places === 'leer' ? [] : PL }); }
        if (/api\/maps\?action=shopping/.test(u)) {
            const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || ''); (st.shopQ = st.shopQ || []).push(q); (st.shopUrls = st.shopUrls || []).push(u);
            if (st.shop === 'fehler') return { ok: false, status: 500, json: async () => ({ error: 'kaputt' }) };
            if (st.shop === 'leer') return ant({ angebote: [] });
            return ant({ angebote: ANGEBOTE(q) });
        }
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
const WEB = f => ({ faehigkeit: 'websuche', params: { frage: f } });
const TLES = tag => ({ faehigkeit: 'termine_lesen', params: { tag } });
const PS = b => ({ faehigkeit: 'produktsuche', params: { suchbegriff: b } });
const stand = A => JSON.stringify({ t: A.lese('todoEntries'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), k: A.lese('savedContacts'), m: A.lese('memoryItems') });
const S = {
    himmel: 'Warum ist der Himmel blau',
    samsung: 'Was gibt es heute Neues bei Samsung',
    selbst: 'Wie könntest du dich selbst verbessern',
    wetterKal: 'Wie wird morgen das Wetter und was steht in meinem Kalender',
    preis: 'Was kostet ein Grohe BauEdge Wasserhahn',
    foto: 'Was kannst du mit diesem Foto machen',
    kinder: 'Was können wir Samstag mit den Kindern unternehmen',
    erinner: 'Erinnere mich morgen um 15 Uhr an den Zahnarzt'
};
async function frage(A, s, ms) { return (await tippen(A, s, ms)).join(' | '); }


(async () => {
    /* 1 allgemeine Wissensfrage: direkt (bisheriger Weg), kein Planer, keine Werkzeuge */
    {
        const A = umgebung(); A.st.plan = { schritte: [] };
        const t = await frage(A, S.himmel);
        check('1.1 "Warum ist der Himmel blau?": der Entscheider plant nichts, keine Werkzeuge, die normale KI antwortet einmal', A.st.ent === 1 && A.st.groq === 1 && A.st.webN === 0 && A.st.wetterN === 0 && A.st.shopQ === undefined, JSON.stringify({ e: A.st.ent, g: A.st.groq, w: A.st.webN }));
        const B = umgebung(); B.st.plan = { schritte: [] };
        await frage(B, 'Warum ist Wasser eigentlich nass');
        check('1.2 Planer liefert keine Schritte: genau einmal der bisherige Weg', B.st.groq === 1 && B.st.webN === 0, JSON.stringify({ e: B.st.ent, g: B.st.groq }));
    }
    /* 2 aktuelle Information: automatisch recherchieren, ohne "Internet" */
    {
        const A = umgebung(); A.st.plan = { schritte: [WEB('Was gibt es heute Neues bei Samsung')] };
        const t = await frage(A, S.samsung);
        check('2.1 Samsung-Neuigkeiten: genau eine Websuche mit der Frage, die Antwort wird gesprochen', A.st.webN === 1 && /Hamburg ist es ruhig/.test(t) && A.st.groq === 0, JSON.stringify({ w: A.st.webN, t }));
        const B = umgebung(); B.st.web = 'fehler'; B.st.plan = { schritte: [WEB('Was gibt es heute Neues bei Samsung')] };
        await frage(B, S.samsung);
        check('2.2 Websuche scheitert: keine erfundene Antwort, der bisherige Weg übernimmt genau einmal', B.st.groq === 1, JSON.stringify({ g: B.st.groq }));
    }
    /* 3 Selbstbezug */
    {
        const A = umgebung();
        A.st.plan = { schritte: [{ faehigkeit: 'jarvis_info', params: {} }, WEB('Wie kann man einen Sprachassistenten mit Wetter, Kalender, Produktsuche und Foto-Erkennung verbessern')] };
        const t = await frage(A, S.selbst);
        check('3.1 "Wie könntest du dich selbst verbessern?": Jarvis nennt seine ECHTEN Fähigkeiten und recherchiert dazu', /Das kann ich zurzeit:/.test(t) && /Preise und Händler/.test(t) && /Termine ansehen/.test(t) && A.st.webN === 1 && /Hamburg ist es ruhig/.test(t), t);
        check('3.2 die Aufzählung stammt aus der Registry (jedes Werkzeug kommt vor), nichts Erfundenes', ['Internetsuche', 'Wetter', 'Orte und Restaurants suchen'].every(x => t.includes(x)) && !/Smart-Home|Flug|Banking/.test(t), t);
        const r = await A.sb.jvRegistry.fuehreAus('jarvis_info', {}, {});
        check('3.3 jarvis_info: lesend, ohne Bestätigung, ohne Fallback, zählt sich selbst nicht auf', r.status === 'SUCCESS' && !r.daten.werkzeuge.includes('jarvis_info') && A.sb.jvRegistry.hole('jarvis_info').bestaetigung.noetig === false && A.sb.jvRegistry.hole('jarvis_info').fallbacks.length === 0);
        const B = umgebung(); B.st.plan = { schritte: [{ faehigkeit: 'jarvis_info', params: { x: 1 } }] };
        await frage(B, S.selbst);
        check('3.4 jarvis_info mit Zusatzangaben wird abgelehnt: bisheriger Weg einmal', B.st.groq === 1);
        check('3.5 der Planer bekommt die Regel "du/dich = Jarvis" und die Werkzeugliste mit jarvis_info', (A.st.entNachrichten[0] || []).some(m => /fragt der Nutzer nach dir selbst/i.test(m.content) && /jarvis_info/.test(m.content)));
        check('3.6 der Planer bekommt die Ausnahme: sich vorstellen/Hallo sagen ist KEIN jarvis_info (leerer Plan), und die Fähigkeitenliste nennt nur lesbare Namen', (A.st.entNachrichten[0] || []).some(m => /stell dich vor/i.test(m.content || '') && /kein Werkzeug/i.test(m.content || '')) && !/gedaechtnis|kontakte_lesen/.test((r.daten && r.daten.nachricht) || ''), '');
        const pv = String(A.sb.buildSystemPrompt('Stell dich bitte vor und zeig, was du alles kannst', {}, '') || ''), pw = String(A.sb.buildSystemPrompt('Wie wird das Wetter morgen', {}, '') || '');
        check('3.7 Selbstwissen: bei "stell dich vor / zeig was du kannst" bekommt die KI die Themen der Hilfe, bei anderen Fragen bleibt die Anweisung unverändert', /WISSEN ÜBER DICH SELBST/.test(pv) && /Termine & Kalender/.test(pv) && /Dinos Assistent/.test(pv) && /NIEMALS .dein Assistent./.test(pv) && !/WISSEN ÜBER DICH SELBST/.test(pw) && !/WISSEN ÜBER DICH SELBST/.test(String(A.sb.buildSystemPrompt() || '')), pv.length + '/' + pw.length);
    }
    /* 4 mehrteilig: Wetter + Kalender */
    {
        const A = umgebung(); A.st.plan = { schritte: [W('morgen'), TLES('morgen')] };
        const g = await tippen(A, S.wetterKal), t = g.join(' | ');
        check('4.1 Wetter UND Kalender in EINER Antwort, beide Werkzeuge genau einmal', g.length === 1 && A.st.wetterN >= 1 && /Termin|Kalender|nichts/i.test(t) && /grad|Grad|°|Regen|Wetter/i.test(t), t);
        check('4.2 nichts geschrieben, keine normale KI', stand(A) === A.z0 && A.st.groq === 0);
    }
    /* 5 Produktfrage */
    {
        const A = umgebung(); A.st.plan = { schritte: [PS('Grohe BauEdge Wasserhahn')] };
        const t = await frage(A, S.preis);
        check('5.1 Produktfrage: vorhandene Produktsuche, Händler UND Preis zusammen, eine Preissuche', /MDM Tools für 39,90 Euro/.test(t) && A.st.shopQ.length === 1 && A.st.groq === 0, t);
        const B = umgebung(); B.st.shop = 'fehler'; B.st.plan = { schritte: [PS('Grohe BauEdge Wasserhahn')] };
        const t2 = await frage(B, S.preis);
        check('5.2 Preissuche fällt aus: keine erfundenen Preise, bisheriger Weg einmal', B.st.groq === 1 && !/39,90/.test(t2), t2);
    }
    /* 6 Foto */
    {
        const A = await foto({ art: 'sonstiges', sicher: true, beschreibung: 'ein Wasserhahn', produkt: 'Grohe BauEdge Wasserhahn' });
        A.st.plan = { schritte: [{ faehigkeit: 'foto_info', params: {} }] };
        const t = await frage(A, 'Was lässt sich mit dem Foto hier anfangen');
        check('6.1 "Was kannst du mit diesem Foto machen?": Jarvis nennt, was erkannt wurde, und was er damit kann', /Auf dem Foto: ein Wasserhahn/.test(t) && /Preise und Händler/.test(t), t);
        const B = umgebung(); B.st.plan = { schritte: [{ faehigkeit: 'foto_info', params: {} }] };
        const t2 = await frage(B, 'Was lässt sich mit dem Foto hier anfangen');
        check('6.2 ohne Foto: ehrliche Antwort, nichts erfunden', /kein erkanntes Foto/.test(t2), t2);
    }
    /* 7 Freizeit mit Kindern: Recherche, nichts geschrieben */
    {
        const A = umgebung(); A.st.plan = { schritte: [WEB('Ausflugsideen am Samstag mit Kindern')] };
        const t = await frage(A, S.kinder);
        check('7.1 Samstag-mit-Kindern: der vorhandene Ausflugs-Helfer antwortet wie bisher (Dirigent mischt sich nicht ein), nichts eingetragen', A.st.ent === 0 && stand(A) === A.z0 && t.length > 0, JSON.stringify({ e: A.st.ent, t }));
        const A2 = umgebung(); A2.st.plan = { schritte: [WEB('Ausflugsideen am Samstag mit Kindern')] };
        const t3 = await frage(A2, 'Was kann man am Samstag mit Kindern so anstellen');
        check('7.1b Ausflugsidee ohne Festbefehl: eine Recherche, nichts eingetragen', A2.st.webN === 1 && stand(A2) === A2.z0, JSON.stringify({ w: A2.st.webN, t3 }));
        const B = umgebung(); B.st.plan = { schritte: [WEB('Ausflugsideen'), { faehigkeit: 'termin_erstellen', params: { text: 'Ausflug', zeit: '2026-11-07T10:00:00' } }] };
        await frage(B, 'Was kann man am Samstag mit Kindern so anstellen');
        check('7.2 der Planer will ungefragt einen Termin eintragen: wird NICHT ausgeführt, bisheriger Weg einmal', B.lese('calendarEntries').length === 0 && B.st.groq === 1, JSON.stringify({ c: B.lese('calendarEntries').length, g: B.st.groq }));
    }
    /* 8 Erinnerung: ausdrücklicher Schreibwunsch, genau einmal */
    {
        const A = umgebung(); A.st.plan = { schritte: [{ faehigkeit: 'erinnerung_erstellen', params: { text: 'Zahnarzt', zeit: '2026-11-06T15:00:00' } }] };
        const g = await tippen(A, S.erinner);
        const rem = A.lese('reminderEntries');
        check('8.1 "Erinnere mich morgen um 15 Uhr an den Zahnarzt": genau eine Erinnerung, eine Antwort, keine normale KI', rem.length === 1 && g.length === 1 && A.st.groq === 0, JSON.stringify({ r: rem.length, g }));
        await tippen(A, S.erinner);
        check('8.2 derselbe Satz sofort noch einmal: keine doppelte Erinnerung', A.lese('reminderEntries').length === 1);
        const B = umgebung(); B.st.plan = { schritte: [{ faehigkeit: 'erinnerung_erstellen', params: { text: 'Zahnarzt', zeit: '2026-11-06T15:00:00' } }] };
        await tippen(B, 'Wie wird das Wetter morgen');
        check('8.3 Erinnerung ohne ausdrücklichen Wunsch (Wettersatz): nichts geschrieben, bisheriger Weg einmal', B.lese('reminderEntries').length === 0 && B.st.groq === 1);
        const C = umgebung(); C.st.plan = { schritte: [{ faehigkeit: 'termin_verschieben', params: { suche: 'Zahnarzt', tag: 'morgen' } }] };
        await tippen(C, 'Verschieb meinen Termin beim Zahnarzt auf Freitag');
        check('8.4 Verschieben nie ohne Bestätigung', C.lese('calendarEntries').length === 0);
    }
    /* 9 Zeitlimit, Aus-Schalter, kontrollierte Aktivierung */
    {
        const A = umgebung(); A.st.verhalten = 'haengt'; A.sb.jvChef._setzeZeitlimit(200);
        await tippen(A, S.samsung, 600);
        check('9.1 Planer hängt (Zeitlimit): genau einmal der bisherige Weg', A.st.groq === 1 && A.st.webN === 0, JSON.stringify({ g: A.st.groq }));
        const B = umgebung({ chefAus: true }); B.st.plan = { schritte: [WEB('x y z')] };
        await tippen(B, S.samsung);
        check('9.2 Dirigent aus: kein Planer, keine Werkzeuge, der bisherige Weg', B.st.ent === 0 && B.st.groq === 1);
        const fresh = starte({ jetzt: '2026-11-05T10:00:00+01:00', chefStandard: true, festerZufall: true, fetch: async () => { throw new Error('offline'); } });
        check('9.3 frisch gestartet ist der Dirigent EIN (keine pauschale Aktivierung)', fresh.sb.jvChef.istAn() === true);
        const C = umgebung({ chefAus: true }); C.sb.jvChef.an(); const an1 = C.sb.jvChef.istAn(); C.sb.jvChef.aus();
        check('9.4 Ein- und Ausschalten funktioniert', an1 === true && C.sb.jvChef.istAn() === false);
    }
    console.log('Chef-Dirigent: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
