/* ============================================================
   TESTS Chef-KI "produktsuche" (Phase 3): Werkzeug der Registry über die vorhandene Preissuche (/api/maps?action=shopping), Händler/Preis/Link zusammen, Fehler, Kette, Rückfall.
   Start: node tests/chef_produkt.js. Alles über den ECHTEN Sprachweg (jvTippen); der Entscheider (KI) ist eine Attrappe, Dienste laufen mit Attrappen.
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
            st.groq++; st.normaleSaetze.push(String((m[m.length - 1] || {}).content || ''));
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
    A.sb.jvChef.an();
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
const plan = (...s) => ({ schritte: s });
const PS = b => ({ faehigkeit: 'produktsuche', params: { suchbegriff: b } });
const WEB = f => ({ faehigkeit: 'websuche', params: { frage: f } });
const S1 = 'Such mir einen Grohe BauEdge Wasserhahn';
const S2 = 'Was kostet ein Samsung Galaxy S25 Ultra';
const S3 = 'Vergleiche den Grohe BauEdge Wasserhahn mit dem Hansgrohe Talis Wasserhahn';
const S4 = 'Vergleiche zwei Wasserhähne';
const kartenText = A => JSON.stringify(A.karten[A.karten.length - 1] || []);

(async () => {
    /* 1 Grohe: Händler/Preis/Link bleiben zusammen, Idealo nie Händler, nichts Fremdes */
    {
        const A = umgebung(); A.st.plan = plan(PS('Grohe BauEdge Wasserhahn'));
        const g = await tippen(A, S1), t = g.join(' ');
        check('1.1 gesprochen: günstigster passender Händler MIT seinem Preis (MDM Tools, 39,90 Euro)', /MDM Tools für 39,90 Euro/.test(t) && /Danach Sanitino für 43,08 Euro/.test(t), t);
        check('1.2 kein Idealo-Preis (37,50) und kein Fremdprodukt (19,00) als Angebot', !/37,50|19,00|Idealo|FremdShop/.test(t), t);
        const k = kartenText(A);
        check('1.3 Karte: MDM-Link beim MDM-Preis, Sanitino-Link beim Sanitino-Preis, kein Idealo-Link als Händlerlink', /mdm-tools\.de[^]*MDM Tools[^]*39,90/.test(k.replace(/\\"/g, '"')) && /sanitino\.de[^]*Sanitino[^]*43,08/.test(k.replace(/\\"/g, '"')) && !/href=\\"https:\/\/www\.idealo[^"]*\\"[^>]*>[^<]*(MDM|Sanitino)/.test(k), k.slice(0, 600));
        check('1.4 vorhandene Preissuche, mit Händlerlink-Suche, genau eine Anfrage; keine normale KI, ein Entscheider', A.st.shopQ.length === 1 && /haendler=1/.test(A.st.shopUrls[0]) && A.st.groq === 0 && A.st.ent === 1, JSON.stringify({ q: A.st.shopQ, g: A.st.groq }));
        check('1.5 Zähler und Vermerk', A.sb.jvChef.kiZaehler().produktsuchen === 1 && /produktsuche_ausgefuehrt/.test(codes(A)), codes(A));
        const l = A.sb.jvGespraech && A.sb.jvGespraech.liste();
        check('1.6 die Produkte sind für Anschlussfragen gemerkt', !!l && l.art === 'produkte' && l.items.length === 1 && l.items[0].angebote[0].shop === 'MDM Tools', JSON.stringify(l && l.art));
    }
    /* 2 Samsung: Angebot ohne Link ehrlich */
    {
        const A = umgebung(); A.st.plan = plan(PS('Samsung Galaxy S25 Ultra'));
        const g = await tippen(A, S2), t = g.join(' ');
        check('2.1 Otto mit 899,00 Euro, danach MediaMarkt 949,00 Euro', /Otto für 899,00 Euro/.test(t) && /MediaMarkt für 949,00 Euro/.test(t), t + ' ent=' + A.st.ent + ' c=' + codes(A));
        check('2.2 Karte: Otto mit Link, MediaMarkt ausdrücklich ohne direkten Link', /otto\.de/.test(kartenText(A)) && /kein direkter Link gefunden/.test(kartenText(A)), kartenText(A).slice(0, 300));
    }
    /* 3 Vergleich */
    {
        const A = umgebung(); A.st.plan = plan(PS('Grohe BauEdge Wasserhahn'), PS('Hansgrohe Talis Wasserhahn'));
        const g = await tippen(A, S3), t = g.join(' ');
        check('3.1 beide Produkte mit eigenem Händler und eigenem Preis', /Grohe BauEdge Wasserhahn: am günstigsten bei MDM Tools für 39,90 Euro/.test(t) && /Hansgrohe Talis Wasserhahn: am günstigsten bei Hornbach für 88,50 Euro/.test(t), t);
        check('3.2 keine Vermischung: Hornbach nicht beim Grohe, MDM nicht beim Hansgrohe', !/Grohe BauEdge Wasserhahn:[^.]*Hornbach/.test(t) && !/Hansgrohe Talis Wasserhahn:[^.]*MDM/.test(t), t);
        check('3.3 zwei Suchanfragen, zwei Karten, eine zusammenhängende Antwort', A.st.shopQ.length === 2 && (A.karten[A.karten.length - 1] || []).length === 2 && g.length === 1, JSON.stringify({ q: A.st.shopQ, k: (A.karten[A.karten.length - 1] || []).length, g: g.length }));
        const A2 = umgebung(); A2.st.plan = { schritte: [], frage: 'Welche Wasserhähne soll ich vergleichen?' };
        const g2 = await tippen(A2, S4);
        check('3.4 "Vergleiche zwei Wasserhähne" ohne Namen: Rückfrage, nichts erfunden, keine Suche', A2.st.shopQ === undefined && g2.join(' ') === 'Welche Wasserhähne soll ich vergleichen?' && A2.st.groq === 0, g2.join(' '));
        const A3 = umgebung(); A3.st.plan = plan(PS('Grohe BauEdge Wasserhahn'), PS('Hansgrohe Talis Wasserhahn'), PS('Samsung Galaxy S25 Ultra'));
        await tippen(A3, S3);
        check('3.5 drei Produktsuchen sind nicht erlaubt: bisheriger Weg genau einmal, keine Suche', A3.st.shopQ === undefined && A3.st.groq === 1, JSON.stringify({ q: A3.st.shopQ, g: A3.st.groq }));
    }
    /* 4 keine Ergebnisse */
    {
        const A = umgebung(); A.st.shop = 'leer'; A.st.plan = plan(PS('Grohe BauEdge Wasserhahn'));
        const g = await tippen(A, S1), t = g.join(' ');
        check('4.1 ehrliche Meldung ohne erfundenen Preis oder Händler', /kein verlässliches Angebot/.test(t) && !/\d|Euro|€/.test(t.replace('BauEdge', '')) , t);
        check('4.2 keine zusätzliche normale KI (keine doppelte Antwort)', A.st.groq === 0 && g.length === 1, 'groq=' + A.st.groq);
    }
    /* 5 Fehler beim Werkzeugaufruf */
    {
        const A = umgebung(); A.st.shop = 'fehler'; A.st.plan = plan(PS('Grohe BauEdge Wasserhahn'));
        const g = await tippen(A, S1);
        check('5.1 Preissuche fällt aus: der bisherige Weg antwortet genau einmal, keine Websuche als Preisquelle', A.st.groq === 1 && A.st.webN === 0 && g.length === 1 && !/Euro/.test(g.join(' ')), JSON.stringify({ g: A.st.groq, w: A.st.webN, t: g }));
        check('5.2 Vermerk', /schritt_fehler/.test(codes(A)), codes(A));
        const A2 = umgebung(); A2.sb.jvPreisAngebote = async () => { throw new Error('boom'); };
        A2.st.plan = plan(PS('Grohe BauEdge Wasserhahn'));
        await tippen(A2, S1);
        check('5.3 Ausnahme in der Preissuche: kein Absturz, Rückfall einmal', A2.st.groq === 1);
        const A3 = umgebung(); A3.sb.jvProdukte.chefSuche = async () => { throw new Error('boom'); };
        A3.st.plan = plan(PS('Grohe BauEdge Wasserhahn'));
        await tippen(A3, S1);
        check('5.4 Ausnahme im Werkzeug selbst: kein Absturz, Rückfall einmal', A3.st.groq === 1);
    }
    /* 6 Registry-Ebene: Zuordnung und Erfolgsprüfung */
    {
        const A = umgebung(); const R = A.sb.jvRegistry;
        const r = await R.fuehreAus('produktsuche', { suchbegriff: 'Grohe BauEdge Wasserhahn' }, {});
        const ang = r.daten && r.daten.produkte[0].angebote;
        check('6.1 Registry liefert SUCCESS, geprüft, günstigstes zuerst, jedes Angebot mit eigenem Link', r.status === 'SUCCESS' && ang.length === 2 && ang[0].shop === 'MDM Tools' && ang[0].preis === 39.9 && /mdm-tools/.test(ang[0].link) && ang[1].shop === 'Sanitino' && /sanitino/.test(ang[1].link), JSON.stringify(r.daten && r.daten.produkte));
        const d = R.hole('produktsuche');
        const falsch = JSON.parse(JSON.stringify(r.daten)); falsch.nachricht = falsch.nachricht.replace('39,90', '12,00');
        check('6.2 pruefeErfolg lehnt einen Satz ab, dessen Preis nicht zum Händler gehört', d.pruefeErfolg(r.daten) === true && d.pruefeErfolg(falsch) === false && d.pruefeErfolg({ produkte: [], nachricht: 'x' }) === false && d.pruefeErfolg(null) === false);
        const leer = await R.fuehreAus('produktsuche', {}, {});
        check('6.3 ohne Produkt: NEEDS_INFORMATION, nichts gesucht', leer.status === 'NEEDS_INFORMATION' && A.st.shopQ.length === 1, leer.status);
        check('6.4 lesend ohne Bestätigung, keine Fallbacks, nicht in der Schreibliste', d.bestaetigung.noetig === false && d.fallbacks.length === 0);
        const tr = await R.fuehreAus('produktsuche', { suchbegriff: 'Grohe BauEdge Wasserhahn' }, { trocken: true });
        check('6.5 Trockenlauf sucht nicht', tr.status === 'SUCCESS' && tr.ausgefuehrt === false && A.st.shopQ.length === 1, tr.status);
    }
    /* 7 Kette: Ergebnis des Produktsuche-Schritts an einen späteren Schritt */
    {
        const A = umgebung();
        A.st.plan = plan(PS('Grohe BauEdge Wasserhahn'), { faehigkeit: 'websuche', params: { frage: 'Test' }, aus: { frage: { schritt: 1, feld: 'produkte' } } });
        const g = await tippen(A, 'Such mir einen Grohe BauEdge Wasserhahn und such im Internet nach Erfahrungen');
        check('7.1 die Websuche bekommt den GEPRÜFTEN Produktnamen aus Schritt 1 (nicht das, was das Modell hingeschrieben hat)', (A.st.webArgs || [])[0] === 'Grohe BauEdge Wasserhahn', JSON.stringify(A.st.webArgs));
        check('7.2 eine gemeinsame Antwort mit Preis UND Websuche', g.length === 1 && /39,90 Euro/.test(g[0]) && /Hamburg ist es ruhig/.test(g[0]), g.join('|'));
        const B = umgebung(); B.st.shop = 'leer';
        B.st.plan = plan(PS('Grohe BauEdge Wasserhahn'), { faehigkeit: 'websuche', params: { frage: 'Test' }, aus: { frage: { schritt: 1, feld: 'produkte' } } });
        await tippen(B, 'Such mir einen Grohe BauEdge Wasserhahn und such im Internet nach Erfahrungen');
        check('7.3 ohne belegtes Ergebnis wird nichts übernommen: die Websuche läuft nicht mit einem Namen aus dem Nichts', !(B.st.webArgs || []).includes('Grohe BauEdge Wasserhahn'), JSON.stringify(B.st.webArgs));
        const C = umgebung();
        C.st.plan = plan(PS('Grohe BauEdge Wasserhahn'), { faehigkeit: 'termin_erstellen', params: { text: 'x', zeit: '2026-11-06T15:00:00' }, aus: { frage: { schritt: 1, feld: 'produkte' } } });
        await tippen(C, S1);
        check('7.4 Kette mit Schreibschritt wird abgelehnt: nichts geschrieben, Rückfall einmal', C.lese('calendarEntries').length === 0 && C.st.groq === 1);
    }
    /* 8 Sicherheit */
    {
        const A = umgebung(); A.sb.jvChef.aus(); A.st.plan = plan(PS('Grohe BauEdge Wasserhahn'));
        await tippen(A, S1);
        check('8.1 Chef-KI AUS: kein Entscheider, keine Werkzeug-Suche; der normale Weg antwortet', A.st.ent === 0 && A.st.shopQ === undefined && A.st.groq === 1);
        const fresh = starte({ jetzt: '2026-11-05T10:00:00+01:00', chefStandard: true, festerZufall: true, fetch: async () => { throw new Error('offline'); } });
        check('8.2 frisch gestartet ist die Chef-KI EIN', fresh.sb.jvChef.istAn() === true);
        const B = umgebung(); B.st.plan = plan({ faehigkeit: 'produktsuche', params: { suchbegriff: '<b>Grohe</b>' } });
        await tippen(B, S1);
        check('8.3 Suchbegriff mit Sonderzeichen: Plan abgelehnt, keine Suche, Rückfall einmal', B.st.shopQ === undefined && B.st.groq === 1);
        const C = umgebung(); C.st.plan = plan({ faehigkeit: 'produktsuche', params: { suchbegriff: 'Grohe BauEdge', bestaetigt: true } });
        await tippen(C, S1);
        check('8.4 eingeschleuste Zusatzangabe: Plan abgelehnt', C.st.shopQ === undefined && C.st.groq === 1);
    }
    console.log('Chef-Produkt: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
