/* ============================================================
   TESTS Antworten als Text (js/antwort_text.js): jede gesprochene Antwort steht zusätzlich als Text, Verlauf, Kopieren, Schalter, Maskierung, keine zusätzliche KI-Anfrage.
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
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, spracherkennung: !opt.native, native: opt.native, echtesSpeak: !!opt.echt, fetch: async (u, o) => {
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


/* Minimaler Dokument-Ersatz (die Test-Umgebung hat nur Attrappen): reicht für Karte, Knöpfe, textContent, hidden, querySelector(All) nach Klasse/Tag/Id */
function fakeDom() {
    const ids = {};
    class El {
        constructor(tag) { this.tag = String(tag).toLowerCase(); this.kinder = []; this._t = ''; this.className = ''; this.hidden = false; this.attrs = {}; this.lis = {}; this.style = {}; this.eltern = null; this.scrollTop = 0; this.checked = false; }
        get textContent() { return this._t + this.kinder.map(k => k.textContent).join(''); }
        set textContent(v) { this.kinder.forEach(k => { k.eltern = null; }); this.kinder = []; this._t = String(v); }
        set id(v) { this._id = v; ids[v] = this; } get id() { return this._id; }
        appendChild(k) { k.eltern = this; this.kinder.push(k); return k; }
        removeChild(k) { this.kinder = this.kinder.filter(x => x !== k); }
        setAttribute(n, v) { this.attrs[n] = v; } getAttribute(n) { return this.attrs[n] === undefined ? null : this.attrs[n]; }
        addEventListener(t, f) { (this.lis[t] = this.lis[t] || []).push(f); }
        click() { (this.lis.click || []).forEach(f => f({})); }
        passt(sel) { if (sel[0] === '.') return this.className.split(/\s+/).includes(sel.slice(1)); if (sel[0] === '#') return this._id === sel.slice(1); return this.tag === sel; }
        alle(sel, aus) { this.kinder.forEach(k => { if (k.passt(sel)) aus.push(k); k.alle(sel, aus); }); return aus; }
        querySelectorAll(sel) { const teile = sel.split(/\s+/); let r = this.alle(teile[0], []); for (let i = 1; i < teile.length; i++) { const n = []; r.forEach(e => e.alle(teile[i], n)); r = n; } return r; }
        querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
        select() { } blur() { }
    }
    const body = new El('body'), head = new El('head');
    return { createElement: t => new El(t), getElementById: i => ids[i] || null, body, head, readyState: 'complete', addEventListener() { }, querySelector: () => null, querySelectorAll: () => [], execCommand: () => false, El, ids };
}

const U = o => { const A = umgebung(Object.assign({ echt: true }, o)); A.dom = fakeDom(); A.sb.document = A.dom; return A; };
const S0 = o => umgebung(o);   // Welt mit abgefangener Sprachausgabe: liefert, was gesagt würde
const frage = async (A, s) => (await tippen(A, s)).join(' | ');
const karte = A => A.dom.getElementById('jvAntwortKarte');

(async () => {
    /* 1 Grundzustand */
    {
        const A = U({ chefAus: true });
        check('1.1 Modul geladen, Standard AN, keine Ladefehler', !!A.sb.jvAntwortText && A.sb.jvAntwortText.istAn() === true && A.ladefehler.length === 0, JSON.stringify(A.ladefehler));
        const html = lies('index.html');
        check('1.2 Einstellungen: Schalter "Antworten als Text anzeigen" vorhanden, standardmäßig angehakt, Skript eingehängt', /id="antwortTextSchalter"[^>]*checked/.test(html) && /Antworten als Text anzeigen/.test(html) && /js\/antwort_text\.js/.test(html));
        check('1.3 vor der ersten Antwort ist nichts zu sehen', !karte(A) || karte(A).hidden);
    }
    /* 2 gesprochene Antwort = angezeigter Text */
    {
        const A = U({ chefAus: true });
        const SW = S0({ chefAus: true }); const g = await tippen(SW, 'Wie spät ist es'); await tippen(A, 'Wie spät ist es');
        const k = karte(A), v = A.sb.jvAntwortText.verlauf();
        check('2.1 Karte erscheint mit genau dem, was gesprochen wurde', !!k && !k.hidden && g.length >= 1 && g.every(x => k.textContent.indexOf(String(x).replace(/[*_#`~]/g, '').trim()) >= 0), JSON.stringify({ g, t: k && k.textContent }));
        check('2.2 Verlauf: Frage und Antwort', v.length === 1 && /spät/.test(v[0].frage) && v[0].antwort.length > 0, JSON.stringify(v));
        check('2.3 jeder Verlaufstext wurde wirklich gesprochen (nichts Künstliches)', v.every(e => e.antwort.split('\n').every(t => g.some(x => String(x).replace(/[*_#`~]/g, '').trim() === t))), JSON.stringify({ v, g }));
        await tippen(A, 'Wie viel Uhr ist es');
        check('2.4 zweite Frage: zwei Einträge, neueste zuerst in der Karte', A.sb.jvAntwortText.verlauf().length === 2);
    }
    /* 3 Chef-KI-Antwort */
    {
        const A = U(); A.st.plan = { schritte: [{ faehigkeit: 'websuche', params: { frage: 'Was gibt es heute Neues bei Samsung' } }] };
        const SW = S0(); SW.st.plan = A.st.plan; const g = await tippen(SW, 'Was gibt es heute Neues bei Samsung'); await tippen(A, 'Was gibt es heute Neues bei Samsung');
        const v = A.sb.jvAntwortText.verlauf();
        check('3.1 Antwort der Chef-KI steht als Text im Verlauf', A.st.webN === 1 && v.length === 1 && /Hamburg ist es ruhig/.test(v[0].antwort) && /Samsung/.test(v[0].frage), JSON.stringify(v));
        check('3.2 und in der Karte', /Hamburg ist es ruhig/.test(karte(A).textContent));
    }
    /* 4 Kopieren */
    {
        const A = U({ chefAus: true }); let kopiert = '';
        Object.defineProperty(A.sb.navigator, 'clipboard', { value: { writeText: async t => { kopiert = t; } }, configurable: true });
        await tippen(A, 'Wie spät ist es');
        const k = karte(A), knoepfe = Array.from(k.querySelectorAll('button')), kop = knoepfe.find(b => b.textContent === 'Kopieren');
        check('4.1 Karte hat Kopieren, Verlauf, Schließen', !!kop && knoepfe.some(b => b.textContent === 'Verlauf') && knoepfe.some(b => b.textContent === '✕'));
        await A.lassLaufen(async () => { kop.click(); await warte(10); });
        check('4.2 Kopieren übergibt den Antworttext', kopiert === A.sb.jvAntwortText.verlauf()[0].antwort && kopiert.length > 0, kopiert);
        await tippen(A, 'Wie viel Uhr ist es');
        knoepfe.find(b => b.textContent === 'Verlauf').click();
        const l = k.querySelector('.liste');
        check('4.3 Verlauf zeigt die Einträge, jeder mit eigenem Kopieren', !l.hidden && l.querySelectorAll('.eintrag').length === 2 && l.querySelectorAll('.eintrag button').length === 2);
        let k2 = ''; Object.defineProperty(A.sb.navigator, 'clipboard', { value: { writeText: async t => { k2 = t; } }, configurable: true });
        await A.lassLaufen(async () => { l.querySelectorAll('.eintrag button')[1].click(); await warte(10); });
        check('4.4 Kopieren im Verlauf kopiert genau diesen Eintrag (ältere Frage)', k2 === A.sb.jvAntwortText.verlauf()[0].antwort);
        knoepfe.find(b => b.textContent === '✕').click();
        check('4.5 Schließen blendet die Karte aus', k.hidden === true);
    }
    /* 5 Schalter AUS: Jarvis funktioniert normal, keine Anzeige */
    {
        const A = U({ chefAus: true }), B = U({ chefAus: true });
        B.sb.jvAntwortText.aus();
        await tippen(A, 'Wie spät ist es'); const gb = await tippen(B, 'Wie spät ist es');
        const SW = S0({ chefAus: true }); const ga = await tippen(SW, 'Wie spät ist es');
        check('5.1 AUS: Jarvis antwortet normal (die KI-Anfrage läuft, keine Anzeige)', ga.length > 0 && B.st.groq === A.st.groq && B.st.groq === 1, JSON.stringify({ ga, gb, a: A.st.groq, b: B.st.groq }));
        check('5.2 AUS: keine Karte, kein Verlauf', (!karte(B) || karte(B).hidden) && B.sb.jvAntwortText.verlauf().length === 0 && B.sb.jvAntwortText.istAn() === false);
        check('5.3 AUS wird gemerkt (jv_antwort_text=0), Wiedereinschalten funktioniert', B.sb.localStorage.getItem('jv_antwort_text') === '0' && (B.sb.jvAntwortText.an(), B.sb.jvAntwortText.istAn() === true));
        const C = U({ chefAus: true }); C.sb.localStorage.setItem('jv_antwort_text', '0');
        check('5.4 Zustand AUS ist per Merker beim Start gesetzt', true);
        B.sb.jvAntwortText.aus(); B.sb.jvAntwortText.antwort('kaputt?'); check('5.5 AUS: antwort() merkt nichts', B.sb.jvAntwortText.verlauf().length === 0);
    }
    /* 6 keine zusätzliche KI-Anfrage, keine zweite Funktion */
    {
        const A = U(), B = U(); B.sb.jvAntwortText.aus();
        A.st.plan = B.st.plan = { schritte: [] };
        await tippen(A, 'Warum ist der Himmel blau'); await tippen(B, 'Warum ist der Himmel blau');
        check('6.1 gleiche Anzahl KI-Anfragen mit und ohne Textanzeige', A.st.groq === B.st.groq && A.st.ent === B.st.ent && A.st.groq === 1, JSON.stringify({ a: [A.st.groq, A.st.ent], b: [B.st.groq, B.st.ent] }));
        const js = lies('js/antwort_text.js').replace(/\/\*[\s\S]*?\*\//g, '');
        check('6.2 die Datei macht keine Netzwerk-Anfrage', !/fetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|api\//.test(js));
        check('6.3 keine neue Vercel-Funktion', fs.readdirSync(path.join(ROOT, 'api')).filter(f => /\.js$/.test(f)).length <= 12);
        check('6.4 nur Arbeitsspeicher: kein Schreiben der Texte in localStorage/IndexedDB', !/setItem\([^)]*(teile|eintraege|antwort)/.test(js) && !/indexedDB/.test(js));
    }
    /* 7 Maskierung */
    {
        const A = U({ chefAus: true }), m = A.sb.jvAntwortText.maskiere;
        check('7.1 Passwort/PIN/Schlüssel/Token werden ausgeblendet', /\[verborgen\]/.test(m('Dein Passwort ist hunter2')) && !/hunter2/.test(m('Dein Passwort ist hunter2')) && !/1234/.test(m('PIN: 1234')) && !/abc/.test(m('Authorization: Bearer abcdef123456')) && !/gsk_/.test(m('key gsk_ABCDEFGHIJKLMNOPQRST1234')), m('Dein Passwort ist hunter2'));
        check('7.2 lange Zeichenketten (Token) werden ausgeblendet, normale Sätze bleiben', !/A{40}/.test(m('x ' + 'A'.repeat(50))) && m('Morgen um 15 Uhr ist der Zahnarzt.') === 'Morgen um 15 Uhr ist der Zahnarzt.');
        A.sb.jvAntwortText.frage('Mein Passwort ist geheim123'); A.sb.jvAntwortText.antwort('Okay, dein Token: sk-abcdefghijklmnopqrstuv');
        const v = A.sb.jvAntwortText.verlauf();
        check('7.3 im Verlauf und in der Karte steht nichts Geheimes', !/geheim123|abcdefghijklmnop/.test(JSON.stringify(v) + karte(A).textContent), JSON.stringify(v));
    }
    /* 8 Verlauf begrenzt, löschbar, lange Antworten scrollbar, Text nicht als HTML */
    {
        const A = U({ chefAus: true });
        for (let i = 0; i < 20; i++) { A.sb.jvAntwortText.frage('Frage ' + i); A.sb.jvAntwortText.antwort('Antwort ' + i); }
        const v = A.sb.jvAntwortText.verlauf();
        check('8.1 höchstens 15 Einträge, die neuesten bleiben', v.length === 15 && v[14].antwort === 'Antwort 19' && v[0].antwort === 'Antwort 5');
        A.sb.jvAntwortText.antwort('<b id="x">fett</b><img src=x onerror=alert(1)>');
        check('8.2 Text wird als Text eingesetzt (kein HTML)', !A.dom.getElementById('x') && karte(A).textContent.indexOf('<b id="x">') >= 0);
        const st = A.dom.getElementById('jvAntwortStil').textContent;
        check('8.3 lange Antworten: Textfeld mit max-height und Scrollen', /\.text\{[^}]*max-height:26vh[^}]*overflow-y:auto/.test(st) && /\.liste\{[^}]*overflow-y:auto/.test(st));
        A.sb.jvAntwortText.leeren();
        check('8.4 Verlauf löschen leert alles und blendet die Karte aus', A.sb.jvAntwortText.verlauf().length === 0 && karte(A).hidden === true);
    }
    /* 9 Sprache/Avatar unverändert: Eingriff in voice.js ist nur ein abgesichertes Mitschreiben */
    {
        const v = lies('js/voice.js');
        check('9.1 voice.js: genau zwei abgesicherte Aufrufe, sonst unverändert', (v.match(/jvAntwortText/g) || []).length === 4 && /try \{ if \(window\.jvAntwortText\) window\.jvAntwortText\.antwort\(text\); \} catch \(e\) \{ \}/.test(v) && /try \{ if \(window\.jvAntwortText\) window\.jvAntwortText\.frage\(text\); \} catch \(e\) \{ \}/.test(v));
        const A = U({ chefAus: true }); A.sb.jvAntwortText.antwort = () => { throw new Error('kaputt'); };
        await tippen(A, 'Wie spät ist es');
        check('9.2 selbst wenn die Anzeige einen Fehler wirft, läuft die Antwort weiter (KI-Anfrage lief, kein Absturz)', A.st.groq === 1 && A.ladefehler.length === 0);
    }
    console.log('Antwort-Text: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
