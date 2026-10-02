/* ============================================================
   WÄHRUNGSRECHNER per Sprache, direkt in der App (ohne KI):
   "Was sind 100 Euro in Lira?" / "Wie viel sind 50 Dollar in Euro?" / "1000 Lira in Euro" / "Wie viel Lira sind 100 Euro?" /
   "Wie ist der Kurs von Euro zu Lira?" / "Was kostet ein Euro in Lira?"
   Kursquellen (kostenlos, ohne Schlüssel), der Reihe nach, bis eine antwortet: Frankfurter (Referenzkurse der Europäischen Zentralbank, 2 Adressen),
   danach open.er-api.com. Der Kurs ist ein Tageskurs; Banken und Wechselstuben rechnen mit Aufschlag.
   Braucht: voice.js (speak). Wird von localcommands.js aufgerufen.
   ============================================================ */

/* Währungen: Code, gesprochener Name und alle Schreibweisen, die man sagt (längere zuerst prüfen!) */
const CURRENCIES = [
    { code: 'EUR', name: 'Euro', words: ['euro', 'euros', 'eur', '€'] },
    { code: 'USD', name: 'US-Dollar', words: ['us dollar', 'us-dollar', 'amerikanische dollar', 'amerikanischen dollar', 'dollar', 'dollars', 'usd', '$'] },
    { code: 'TRY', name: 'Türkische Lira', words: ['türkische lira', 'türkischen lira', 'tuerkische lira', 'lira', 'try'] },
    { code: 'GBP', name: 'Pfund', words: ['britische pfund', 'britischen pfund', 'englische pfund', 'englischen pfund', 'pfund sterling', 'pfund', 'gbp'] },
    { code: 'EGP', name: 'Ägyptische Pfund', words: ['ägyptische pfund', 'ägyptischen pfund', 'egp'] },
    { code: 'CHF', name: 'Schweizer Franken', words: ['schweizer franken', 'franken', 'chf'] },
    { code: 'JPY', name: 'Yen', words: ['yen', 'jpy'] },
    { code: 'PLN', name: 'Zloty', words: ['polnische zloty', 'polnischen zloty', 'zloty', 'złoty', 'pln'] },
    { code: 'RON', name: 'Rumänische Leu', words: ['rumänische leu', 'rumänischen leu', 'leu', 'lei', 'ron'] },
    { code: 'RUB', name: 'Rubel', words: ['russische rubel', 'russischen rubel', 'rubel', 'rub'] },
    { code: 'CZK', name: 'Tschechische Kronen', words: ['tschechische kronen', 'tschechischen kronen', 'tschechische krone', 'czk'] },
    { code: 'SEK', name: 'Schwedische Kronen', words: ['schwedische kronen', 'schwedischen kronen', 'schwedische krone', 'sek'] },
    { code: 'NOK', name: 'Norwegische Kronen', words: ['norwegische kronen', 'norwegischen kronen', 'norwegische krone', 'nok'] },
    { code: 'DKK', name: 'Dänische Kronen', words: ['dänische kronen', 'dänischen kronen', 'dänische krone', 'dkk'] },
    { code: 'HUF', name: 'Forint', words: ['forint', 'huf'] },
    { code: 'BGN', name: 'Bulgarische Lew', words: ['bulgarische lew', 'bulgarischen lew', 'lew', 'bgn'] },
    { code: 'AED', name: 'Dirham', words: ['dirham', 'aed'] },
    { code: 'THB', name: 'Baht', words: ['baht', 'thb'] },
    { code: 'INR', name: 'Indische Rupien', words: ['indische rupien', 'indische rupie', 'rupien', 'rupie', 'inr'] },
    { code: 'CNY', name: 'Yuan', words: ['chinesische yuan', 'yuan', 'renminbi', 'cny'] },
    { code: 'BRL', name: 'Brasilianische Real', words: ['brasilianische real', 'brasilianischen real', 'brl'] },
    { code: 'CAD', name: 'Kanadische Dollar', words: ['kanadische dollar', 'kanadischen dollar', 'cad'] },
    { code: 'AUD', name: 'Australische Dollar', words: ['australische dollar', 'australischen dollar', 'aud'] }
];

const CURRENCY_WORDS = CURRENCIES.flatMap(c => c.words.map(w => ({ w, c }))).sort((a, b) => b.w.length - a.w.length);
const CURRENCY_ALT = CURRENCY_WORDS.map(x => x.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');

function currencyFromWord(word) {
    const w = String(word || '').toLowerCase().trim();
    const hit = CURRENCY_WORDS.find(x => x.w === w);
    return hit ? hit.c : null;
}

/* ---------- Zahlen ---------- */
const WC_ONES = { ein: 1, eine: 1, einen: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
const WC_TENS = { zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };

/* "hundertfünfzig" -> 150, "zweitausend" -> 2000; null, wenn das Wort keine Zahl ist */
function germanWordsToNumber(str) {
    let s = String(str || '').toLowerCase().replace(/\s+/g, '');
    if (!s) return null;
    let total = 0;
    let m = s.match(/^(.*?)tausend(.*)$/);
    if (m) { const mult = m[1] ? germanWordsToNumber(m[1]) : 1; if (mult === null) return null; total += mult * 1000; s = m[2]; if (!s) return total; }
    m = s.match(/^(.*?)hundert(.*)$/);
    if (m) { const mult = m[1] ? germanWordsToNumber(m[1]) : 1; if (mult === null) return null; total += mult * 100; s = m[2]; if (!s) return total; }
    if (s in WC_ONES) return total + WC_ONES[s];
    if (s in WC_TENS) return total + WC_TENS[s];
    m = s.match(/^(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)und(zwanzig|dreißig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)$/);
    return m ? total + WC_ONES[m[1]] + WC_TENS[m[2]] : null;
}

/* "100", "1.250", "72,5", "tausend" -> Zahl; sonst null */
function parseAmount(tok) {
    const t = String(tok || '').trim();
    if (/^\d[\d.,]*$/.test(t)) {
        let v = t;
        if (/,\d{1,3}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
        const n = Number(v);
        return isNaN(n) ? null : n;
    }
    return germanWordsToNumber(t);
}

/* ---------- Satz verstehen ---------- */
/* { amount, from, to } oder null (dann ist es keine Währungsfrage und geht an die KI) */
function parseCurrencyRequest(text) {
    const t = String(text || '').toLowerCase().replace(/[?!]+/g, ' ').replace(/[.,;:]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 90) return null;
    const AMT = '(\\d[\\d.,]*|[a-zäöüß]+)';
    const CUR = '(' + CURRENCY_ALT + ')';
    const PREP = '(?:in|zu|zum|nach|auf|umgerechnet in|umgerechnet zu)';

    // "100 Euro in Lira" / "ein Euro in Lira"
    let m = t.match(new RegExp(AMT + '\\s*' + CUR + '\\s+' + PREP + '\\s+' + CUR + '(?![\\wäöüß])'));
    if (m) {
        const amount = parseAmount(m[1]), from = currencyFromWord(m[2]), to = currencyFromWord(m[3]);
        if (amount !== null && from && to) return { amount, from, to };
    }
    // "Wie viel Lira sind 100 Euro?" (Ziel zuerst)
    m = t.match(new RegExp('wie\\s*viel\\w*\\s+' + CUR + '\\s+(?:sind|ergeben|ist|bekomme ich für|kriege ich für|bekommt man für|gibt es für)\\s+' + AMT + '\\s*' + CUR + '(?![\\wäöüß])'));
    if (m) {
        const to = currencyFromWord(m[1]), amount = parseAmount(m[2]), from = currencyFromWord(m[3]);
        if (amount !== null && from && to) return { amount, from, to };
    }
    // "Wie ist der Kurs von Euro zu Lira?" / "Euro Lira Kurs"
    m = t.match(new RegExp('kurs\\s+(?:von\\s+|vom\\s+|zwischen\\s+)?' + CUR + '\\s+(?:zu|zum|auf|in|und|nach)\\s+' + CUR + '(?![\\wäöüß])'));
    if (m) {
        const from = currencyFromWord(m[1]), to = currencyFromWord(m[2]);
        if (from && to) return { amount: 1, from, to };
    }
    return null;
}

/* ---------- Kurse holen ---------- */
const rateCache = {};   // "EUR>TRY" -> { rate, date, at }
const RATE_CACHE_MS = 60 * 60000;

function fetchWithTimeout(url, ms) {
    return Promise.race([fetch(url), new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]);
}

async function fetchExchangeRate(from, to) {
    const key = from + '>' + to;
    const cached = rateCache[key];
    if (cached && Date.now() - cached.at < RATE_CACHE_MS) return cached;
    const sources = [
        async () => { const d = await (await fetchWithTimeout(`https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`, 6000)).json(); return d && d.rates && d.rates[to] ? { rate: d.rates[to], date: d.date } : null; },
        async () => { const d = await (await fetchWithTimeout(`https://api.frankfurter.app/latest?from=${from}&to=${to}`, 6000)).json(); return d && d.rates && d.rates[to] ? { rate: d.rates[to], date: d.date } : null; },
        async () => { const d = await (await fetchWithTimeout(`https://open.er-api.com/v6/latest/${from}`, 6000)).json(); return d && d.rates && d.rates[to] ? { rate: d.rates[to], date: String(d.time_last_update_utc || '') } : null; }
    ];
    for (const src of sources) {
        try {
            const r = await src();
            if (r && typeof r.rate === 'number' && r.rate > 0) { const out = { rate: r.rate, date: r.date, at: Date.now() }; rateCache[key] = out; return out; }
        } catch (e) { /* nächste Quelle */ }
    }
    return null;
}

/* ---------- Antwort ---------- */
function formatMoney(n) {
    const abs = Math.abs(n);
    const digits = abs >= 1000 ? 0 : 2;
    return n.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}

function formatRate(r) {
    return r.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: r < 1 ? 4 : 2 });
}

function rateDateText(date) {
    const d = new Date(String(date).slice(0, 10) + 'T12:00:00');
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('de-DE', { day: 'numeric', month: 'long' });
}

async function runCurrency(req) {
    const say = (msg) => speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    if (req.from.code === req.to.code) { say(`Das ist beides ${req.from.name}, da gibt es nichts umzurechnen.`); return; }
    const r = await fetchExchangeRate(req.from.code, req.to.code);
    if (!r) { say('Den aktuellen Kurs konnte ich gerade nicht abrufen. Versuchen Sie es bitte gleich noch einmal.'); return; }
    const result = req.amount * r.rate;
    const dt = rateDateText(r.date);
    const rateSentence = `${formatRate(r.rate)} ${req.to.name} pro ${req.from.name}`;
    if (req.amount === 1) {
        say(`Aktuell sind es ${rateSentence}${dt ? ', Stand ' + dt : ''}.`);
    } else {
        say(`${formatMoney(req.amount)} ${req.from.name} sind ${formatMoney(result)} ${req.to.name}. Der Kurs liegt bei ${rateSentence}${dt ? ', Stand ' + dt : ''}.`);
    }
}

function handleCurrencyCommand(text) {
    const req = parseCurrencyRequest(text);
    if (!req) return false;
    runCurrency(req).catch(() => { try { speak('Die Umrechnung hat gerade nicht geklappt.'); } catch (e) {} });
    return true;
}
