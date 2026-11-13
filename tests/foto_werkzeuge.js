/* ============================================================
   TESTS Foto -> Werkzeuge (Phase 4): Produktfoto -> Produktsuche, Gerät/Fehlercode -> Recherche, Textfoto -> Angebot, Rechnung/Visitenkarte -> vorhandene Foto-Funktionen, unklar -> Rückfrage, Anschlussfragen, Chef-KI-Kette foto_info -> produktsuche.
   Start: node tests/foto_werkzeuge.js. Alles über den ECHTEN Sprachweg (jvTippen); der Entscheider (KI) ist eine Attrappe, Dienste laufen mit Attrappen.
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

const kartenText = A => JSON.stringify(A.karten[A.karten.length - 1] || []);

const PRODUKT = { art: 'sonstiges', sicher: true, beschreibung: 'ein Wasserhahn im Badezimmer', produkt: 'Grohe BauEdge Wasserhahn', laden: 'Baumarkt' };
const GERAET = c => ({ art: 'geraet', sicher: true, beschreibung: 'eine Waschmaschine mit Fehleranzeige', geraet: 'Bosch Waschmaschine', code: c });
const TEXT = { art: 'text', sicher: true, beschreibung: 'ein Schild mit einem längeren Text' };
const stand = A => JSON.stringify({ t: A.lese('todoEntries'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), k: A.lese('savedContacts'), m: A.lese('memoryItems') });
const pause = ms => new Promise(r => setTimeout(r, ms));

async function foto(erk, opt) {
    const A = umgebung(opt); A.st.erkennung = erk;
    A.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", A.sb);
    A.z0 = stand(A);
    A.g = await lauf(A, async () => { A.vm.runInContext('photoAskWhatToDo()', A.sb); }, 150);
    A.text = A.g.join(' | ');
    A.sag = async t => { const g1 = A.gesagt.length; await lauf(A, async () => { A.sb.jvTippen(t); }, 150); return A.gesagt.slice(g1).join(' | '); };
    return A;
}

(async () => {
    /* 1 Produktfoto -> Produktsuche */
    {
        const A = await foto(PRODUKT, { chefAus: true });
        check('1.1 Produktfoto: Jarvis sagt, was er sieht, und nennt Händler UND Preis aus der Produktsuche', /Ich sehe: ein Wasserhahn im Badezimmer\./.test(A.text) && /MDM Tools für 39,90 Euro/.test(A.text), A.text);
        check('1.2 genau eine Bild-Anfrage, genau eine Preissuche mit dem Namen vom Foto, keine normale KI, kein Entscheider', A.vision.length === 1 && A.st.shopQ.length === 1 && A.st.shopQ[0] === 'Grohe BauEdge Wasserhahn' && A.st.groq === 0 && A.st.ent === 0, JSON.stringify({ v: A.vision.length, q: A.st.shopQ, g: A.st.groq, e: A.st.ent }));
        check('1.3 Karten mit dem MDM-Link; kein Idealo-Preis, kein Fremdprodukt', /mdm-tools\.de/.test(kartenText(A)) && !/37,50|19,00/.test(A.text), kartenText(A).slice(0, 200));
        check('1.4 reine Recherche: nichts gespeichert, nichts nachgefragt', stand(A) === A.z0);
        const an = A.sb.jvGespraech.antworten();
        check('1.5 Anschluss: Auswertung als Antwort gemerkt, Produkte als Produktliste', an.length >= 1 && an[0].art === 'foto' && /MDM Tools/.test(an[0].text) && A.sb.jvGespraech.liste().art === 'produkte');
        const f = await A.sag('Wo kann ich die kaufen?');
        check('1.6 Anschlussfrage "Wo kann ich die kaufen?": die Auswertung des Fotos (Händler, Preis) steht der Antwort zur Verfügung, nichts wird neu gesucht', (/MDM Tools/.test(f) || (A.st.normaleM || []).some(m => /Foto-Auswertung/.test(m) && /MDM Tools/.test(m))) && A.st.shopQ.length === 1, f + ' groq=' + A.st.groq);
    }
    /* 2 unsicher / unklar / keine Ergebnisse */
    {
        const A = await foto(Object.assign({}, PRODUKT, { sicher: false }));
        check('2.1 unsicheres Produkt: keine Preissuche, gezielte Rückfrage "Was soll ich damit tun?"', A.st.shopQ === undefined && /Was soll ich damit tun\?/.test(A.text), A.text);
        const B = await foto({ art: 'sonstiges', sicher: false, beschreibung: 'etwas Verschwommenes', produkt: '' });
        check('2.2 unklares Foto: Rückfrage, nichts gesucht, nichts gespeichert', /Was soll ich damit tun\?/.test(B.text) && B.st.shopQ === undefined && B.st.webN === 0 && stand(B) === B.z0, B.text);
        const C = await foto(PRODUKT, {}); // Suche ohne Treffer
        const D = umgebung(); D.st.shop = 'leer'; D.st.erkennung = PRODUKT; D.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", D.sb);
        const g = await lauf(D, async () => { D.vm.runInContext('photoAskWhatToDo()', D.sb); }, 150);
        check('2.3 Suche ohne Ergebnis: kein erfundener Preis, stattdessen wie bisher die Rückfrage', !/Euro|€/.test(g.join(' ')) && /Was soll ich damit tun\?/.test(g.join(' ')), g.join(' | '));
        const E = umgebung(); E.sb.jvProdukte.chefSuche = async () => { throw new Error('boom'); }; E.st.erkennung = PRODUKT; E.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", E.sb);
        const g2 = await lauf(E, async () => { E.vm.runInContext('photoAskWhatToDo()', E.sb); }, 150);
        check('2.4 Fehler im Werkzeug: kein Absturz, Rückfrage statt Schweigen', /Was soll ich damit tun\?/.test(g2.join(' ')), g2.join(' | '));
        const F = umgebung(); F.st.visionFehler = true; F.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", F.sb);
        const g3 = await lauf(F, async () => { F.vm.runInContext('photoAskWhatToDo()', F.sb); }, 150);
        check('2.5 Bild-KI fällt aus: wie bisher "Das Foto ist da. Was soll ich damit tun?", keine Werkzeuge', /Das Foto ist da\. Was soll ich damit tun\?/.test(g3.join(' ')) && F.st.shopQ === undefined && F.st.webN === 0, g3.join(' | '));
    }
    /* 3 Gerät / Fehlercode */
    {
        const A = await foto(GERAET('E18'));
        check('3.1 Fehlercode lesbar: automatische Recherche mit Gerät UND Code, Antwort der Websuche', (A.st.webArgs || []).length === 1 && /Bosch Waschmaschine/.test(A.st.webArgs[0]) && /E18/.test(A.st.webArgs[0]) && /Fehlercode E18/.test(A.text) && /Hamburg ist es ruhig/.test(A.text), JSON.stringify(A.st.webArgs) + ' | ' + A.text);
        check('3.2 eine Bild-Anfrage, keine normale KI, nichts gespeichert', A.vision.length === 1 && A.st.groq === 0 && stand(A) === A.z0);
        check('3.3 Ergebnis für Anschlussfragen gemerkt', A.sb.jvGespraech.antworten().some(a => a.art === 'foto' && /Hamburg/.test(a.text)));
        const B = await foto(GERAET(''));
        check('3.4 Code nicht lesbar: Jarvis fragt nach dem Code, sucht noch nicht', /Wie lautet er\?/.test(B.text) && B.st.webN === 0, B.text);
        const r = await B.sag('F21');
        check('3.5 Antwort "F21" startet die Recherche mit genau diesem Code', (B.st.webArgs || []).length === 1 && /F21/.test(B.st.webArgs[0]) && /Fehlercode F21/.test(r), JSON.stringify(B.st.webArgs) + ' | ' + r);
        const C = await foto(GERAET(''));
        await C.sag('Wie wird das Wetter morgen');
        check('3.6 ein ganz anderer Satz wird nicht als Code gelesen', !(C.st.webArgs || []).some(a => /Fehlercode/.test(a)));
        const D = await foto(GERAET('<script>1</script>'));
        check('3.7 unbrauchbarer Code (Sonderzeichen) wird nicht gesucht, Jarvis fragt nach', D.st.webN === 0 && /Wie lautet er\?/.test(D.text), D.text);
        const E = await foto(GERAET('E18'), {}); E.st.web = 'fehler';
        const F = umgebung(); F.st.web = 'fehler'; F.st.erkennung = GERAET('E18'); F.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", F.sb);
        const g = await lauf(F, async () => { F.vm.runInContext('photoAskWhatToDo()', F.sb); }, 150);
        check('3.8 Suche scheitert: ehrliche Meldung ohne erfundene Bedeutung', /nicht geklappt/.test(g.join(' ')) && !/Hamburg/.test(g.join(' ')), g.join(' | '));
    }
    /* 4 Textfoto */
    {
        const A = await foto(TEXT);
        check('4.1 Textfoto: Jarvis bietet vorlesen, übersetzen, erklären, zusammenfassen an (keine Auswertung ohne Wunsch)', /vorlesen, übersetzen, erklären oder zusammenfassen/.test(A.text) && A.vision.length === 1, A.text + ' v=' + A.vision.length);
        await A.sag('Erkläre das');
        check('4.2 "Erkläre das" wertet das Foto mit dieser Aufgabe aus (zweite Bild-Anfrage)', A.vision.length === 2 && /Erkläre mir den Text/.test(A.vision[1].user), JSON.stringify(A.vision.map(v => v.user)));
        await A.sag('Fasse das zusammen');
        check('4.3 "Fasse das zusammen" ebenso', A.vision.length === 3 && /Fasse den Text/.test(A.vision[2].user), JSON.stringify(A.vision.map(v => v.user)));
        /* Kurzantworten auf die Frage "vorlesen, übersetzen, erklären oder zusammenfassen?" (Fund 13.11.2026: "übersetzen" allein fragte "Was soll ich übersetzen?") */
        const K = await foto(TEXT); const n0 = K.vision.length;
        await K.sag('Übersetzen');
        check('4.4 Kurzantwort "Übersetzen" nach dem Textfoto: Jarvis fragt, in welche Sprache (keine Gegenfrage "Was soll ich übersetzen")', K.vision.length === n0 && /In welche Sprache/.test(K.gesagt.join(' ')) && !/Was soll ich übersetzen/.test(K.gesagt.join(' ')), JSON.stringify(K.gesagt));
        await K.sag('Rumänisch');
        check('4.4b Antwort "Rumänisch" übersetzt das Foto ins Rumänische', K.vision.length === n0 + 1 && /Rum(?:ä|ae)nisch/.test(JSON.stringify(K.vision[n0])), JSON.stringify(K.vision[n0]));
        const n1 = K.vision.length;
        await K.sag('Erklären');
        check('4.5 Kurzantwort "Erklären" wertet das Foto aus', K.vision.length === n1 + 1 && /Erkläre mir den Text/.test(K.vision[n1].user), JSON.stringify(K.vision.map(v => v.user)));
        await K.sag('Zusammenfassen');
        check('4.6 Kurzantwort "Zusammenfassen" wertet das Foto aus', K.vision.length === n1 + 2 && /Fasse den Text/.test(K.vision[n1 + 1].user));
        await K.sag('Vorlesen');
        check('4.7 Kurzantwort "Vorlesen" wertet das Foto aus', K.vision.length === n1 + 3, 'v=' + K.vision.length);
        const R = await foto(TEXT); const r0 = R.vision.length;
        await R.sag('Übersetze das ins Rumänische');
        check('4.8 "Übersetze das ins Rumänische" nach dem Textfoto übersetzt ins Rumänische', R.vision.length === r0 + 1 && /Rum(?:ä|ae)nisch/.test(R.vision[r0].system || R.vision[r0].user || JSON.stringify(R.vision[r0])), JSON.stringify(R.vision[r0]));
        for (const v of ['Übersetze ins Rumänische', 'Übersetze den Text ins Rumänische', 'Ins Rumänische übersetzen']) {
            const R2 = await foto(TEXT); const q0 = R2.vision.length;
            await R2.sag(v);
            check('4.9 "' + v + '" nach dem Textfoto übersetzt ins Rumänische', R2.vision.length === q0 + 1 && /Rum(?:ä|ae)nisch/.test(JSON.stringify(R2.vision[q0])), JSON.stringify(R2.gesagt) + ' v=' + R2.vision.length + '/' + q0);
        }
        const B = umgebung(); B.st.erkennung = TEXT;
        const g = await lauf(B, async () => { B.sb.jvTippen('Erkläre das'); }, 150);
        check('4.4 ohne Foto wird "Erkläre das" nicht abgefangen (normaler Weg)', B.vision.length === 0, JSON.stringify(g));
        check('4.5 nichts gespeichert', stand(A) === A.z0);
    }
    /* 5 Rechnung / Visitenkarte -> vorhandene Funktionen, mit eigener Bestätigung */
    {
        const A = await foto({ art: 'brief', sicher: true, beschreibung: 'eine Rechnung' });
        check('5.1 Rechnung: vorhandene Rechnungs-/Brieffunktion läuft (zweite Bild-Anfrage), keine Produktsuche, keine Recherche', A.vision.length >= 2 && /Brief|Rechnung|Schreiben/i.test(A.vision[1].system) && A.st.shopQ === undefined && A.st.webN === 0, JSON.stringify(A.vision.map(v => v.system.slice(0, 50))));
        check('5.2 es wird nichts ohne "Ja" gespeichert', stand(A) === A.z0);
        const B = await foto({ art: 'visitenkarte', sicher: true, beschreibung: 'eine Visitenkarte' });
        check('5.3 Visitenkarte: vorhandene Kontakterkennung läuft, nichts gespeichert', B.vision.length >= 2 && /Kontaktdaten/.test(B.vision[1].system) && stand(B) === B.z0 && B.st.shopQ === undefined, JSON.stringify(B.vision.map(v => v.system.slice(0, 50))));
    }
    /* 6 Registry foto_info und Chef-KI-Kette */
    {
        const A = await foto(PRODUKT);
        const R = A.sb.jvRegistry, d = R.hole('foto_info');
        const r = await R.fuehreAus('foto_info', {}, {});
        check('6.1 foto_info: lesend, ohne Bestätigung, ohne Fallback; liefert die Einordnung des Fotos', d.bestaetigung.noetig === false && d.fallbacks.length === 0 && r.status === 'SUCCESS' && r.daten.produkt === 'Grohe BauEdge Wasserhahn', JSON.stringify(r.daten));
        const B = umgebung();
        const r2 = await B.sb.jvRegistry.fuehreAus('foto_info', {}, {});
        check('6.2 ohne Foto: NO_RESULTS, ehrliche Meldung', r2.status === 'NO_RESULTS' && /kein erkanntes Foto/.test(r2.nachricht), r2.status);
        /* Chef-KI: foto_info -> produktsuche, Name kommt aus der Foto-Einordnung, nicht vom Modell */
        const C = umgebung(); C.st.erkennung = PRODUKT; C.st.shop = 'leer';
        C.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", C.sb);
        await lauf(C, async () => { C.vm.runInContext('photoAskWhatToDo()', C.sb); }, 150);
        C.st.shop = 'ok'; C.st.shopQ = [];
        C.st.plan = { schritte: [{ faehigkeit: 'foto_info', params: {} }, { faehigkeit: 'produktsuche', params: { suchbegriff: 'Erfundenes Modell X' }, aus: { suchbegriff: { schritt: 1, feld: 'produkt' } } }] };
        const g = await lauf(C, async () => { C.sb.jvTippen('Schau mal nach, wo ich das Ding vom Foto günstig bekomme'); }, 150);
        check('6.3 Chef-KI-Kette: die Suche läuft mit dem Namen vom Foto (nicht mit dem Namen aus dem Plan)', C.st.shopQ.length === 1 && C.st.shopQ[0] === 'Grohe BauEdge Wasserhahn' && /MDM Tools/.test(g.join(' ')), JSON.stringify({ q: C.st.shopQ, g }));
        const D = umgebung({ chefAus: true }); D.st.erkennung = PRODUKT; D.st.shop = 'leer';
        D.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", D.sb);
        await lauf(D, async () => { D.vm.runInContext('photoAskWhatToDo()', D.sb); }, 150);
        D.st.shop = 'ok'; D.st.shopQ = [];
        D.st.plan = { schritte: [{ faehigkeit: 'foto_info', params: {} }] };
        await lauf(D, async () => { D.sb.jvTippen('Schau mal nach, wo ich das Ding vom Foto günstig bekomme'); }, 150);
        check('6.4 Chef-KI aus: kein Entscheider, die Kette läuft nicht', D.st.ent === 0 && D.st.shopQ.length === 0);
        const E = umgebung(); E.st.plan = { schritte: [{ faehigkeit: 'foto_info', params: { x: 1 } }] };
        await lauf(E, async () => { E.sb.jvTippen('Schau mal nach, wo ich das Ding vom Foto günstig bekomme'); }, 150);
        check('6.5 foto_info mit Zusatzangaben wird abgelehnt (bisheriger Weg einmal)', E.st.groq === 1);
    }
    console.log('Foto-Werkzeuge: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
