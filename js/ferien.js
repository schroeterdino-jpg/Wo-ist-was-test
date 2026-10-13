/* ============================================================
   FERIENKALENDER: Schulferien aller 16 Bundesländer.
   Fragen per Sprache: "Wann sind die Herbstferien in Hamburg?", "Wann sind die nächsten Ferien?", "Sommerferien 2027 in Bayern",
   "Zeig mir den Ferienkalender", "Sommerferien in allen Bundesländern", "Mein Bundesland ist Schleswig-Holstein".
   Das Fenster "Ferienkalender" zeigt entweder alle Ferien EINES Bundeslandes oder (Vergleich) eine Ferienart in ALLEN Bundesländern nach Beginn sortiert.
   Datenquelle: OpenHolidays (openholidaysapi.org, offen und kostenlos), über deinen Server (/api/maps?action=holidays); klappt das nicht, direkt.
   Die Daten werden auf dem Handy zwischengespeichert (3 Tage). Angaben ohne Gewähr: bei der Schule nachfragen, besonders bei beweglichen Ferientagen.
   Dein Bundesland: gesagt ("Mein Bundesland ist ...") oder aus dem Standort abgeleitet (Server liefert es mit /api/reverse).
   Braucht: voice.js (speak), apiFetch, briefing.js nicht nötig. Wird von localcommands.js aufgerufen.
   ============================================================ */

const FERIEN_STATES = [
    { code: 'BW', name: 'Baden-Württemberg', alias: ['baden-württemberg', 'baden württemberg', 'baden-wuerttemberg', 'bawü'] },
    { code: 'BY', name: 'Bayern', alias: ['bayern'] },
    { code: 'BE', name: 'Berlin', alias: ['berlin'] },
    { code: 'BB', name: 'Brandenburg', alias: ['brandenburg'] },
    { code: 'HB', name: 'Bremen', alias: ['bremen'] },
    { code: 'HH', name: 'Hamburg', alias: ['hamburg'] },
    { code: 'HE', name: 'Hessen', alias: ['hessen'] },
    { code: 'MV', name: 'Mecklenburg-Vorpommern', alias: ['mecklenburg-vorpommern', 'mecklenburg vorpommern', 'meck-pomm', 'mecklenburg'] },
    { code: 'NI', name: 'Niedersachsen', alias: ['niedersachsen'] },
    { code: 'NW', name: 'Nordrhein-Westfalen', alias: ['nordrhein-westfalen', 'nordrhein westfalen', 'nrw'] },
    { code: 'RP', name: 'Rheinland-Pfalz', alias: ['rheinland-pfalz', 'rheinland pfalz'] },
    { code: 'SL', name: 'Saarland', alias: ['saarland'] },
    { code: 'SN', name: 'Sachsen', alias: ['sachsen'] },
    { code: 'ST', name: 'Sachsen-Anhalt', alias: ['sachsen-anhalt', 'sachsen anhalt'] },
    { code: 'SH', name: 'Schleswig-Holstein', alias: ['schleswig-holstein', 'schleswig holstein'] },
    { code: 'TH', name: 'Thüringen', alias: ['thüringen', 'thueringen'] }
];

/* Ferienarten; "weihnachten" muss vor "winter" geprüft werden */
const FERIEN_KINDS = [
    { key: 'sommer', label: 'Sommerferien', icon: '☀️', re: /sommer|summer/ },
    { key: 'herbst', label: 'Herbstferien', icon: '🍂', re: /herbst|autumn|fall/ },
    { key: 'weihnachten', label: 'Weihnachtsferien', icon: '🎄', re: /weihnacht|christmas/ },
    { key: 'winter', label: 'Winterferien', icon: '❄️', re: /winter/ },
    { key: 'ostern', label: 'Osterferien', icon: '🐣', re: /oster|easter/ },
    { key: 'pfingsten', label: 'Pfingstferien', icon: '🕊️', re: /pfingst|pentecost|whit/ }
];
const FERIEN_MAJOR = FERIEN_KINDS.map(k => k.key);

const FERIEN_HOME_KEY = 'helfer_home_state';
const FERIEN_CACHE_KEY = 'helfer_ferien_cache';
const FERIEN_CACHE_MS = 3 * 86400000;

let ferienData = null;       // normalisiert: [{ start, end, name, kind, states:Set }]
let ferienOverlayEl = null;
let ferienUi = { mode: 'one', state: '', kind: 'sommer', year: 0 };

/* ---------- Hilfen: Daten, Namen ---------- */
function ferienIso(d) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function ferienDay(iso) { return new Date(iso + 'T12:00:00'); }
function ferienToday() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12); }
function ferienDiffDays(a, b) { return Math.round((b - a) / 86400000); }
function ferienStateByCode(code) { return FERIEN_STATES.find(s => s.code === code) || null; }

function ferienKindOf(name) {
    const n = String(name || '').toLowerCase();
    const k = FERIEN_KINDS.find(x => x.re.test(n));
    return k ? k.key : 'sonstige';
}
function ferienKindInfo(key) { return FERIEN_KINDS.find(k => k.key === key) || { key: 'sonstige', label: 'Ferientag', icon: '📌' }; }

/* Bundesländer im Satz finden (längere Namen zuerst, damit "Sachsen-Anhalt" nicht als "Sachsen" zählt) */
function ferienFindStates(text) {
    let t = ' ' + String(text || '').toLowerCase() + ' ';
    const all = [];
    FERIEN_STATES.forEach(s => s.alias.forEach(a => all.push({ a, s })));
    all.sort((x, y) => y.a.length - x.a.length);
    const found = [];
    all.forEach(({ a, s }) => {
        const re = new RegExp('(?<![\\wäöüß-])' + a.replace(/[-.]/g, '\\$&') + '(?![\\wäöüß-])', 'g');
        if (re.test(t)) {
            if (!found.includes(s.code)) found.push(s.code);
            t = t.replace(re, ' ');
        }
    });
    return found;
}

/* ---------- Daten normalisieren, holen, zwischenspeichern ---------- */
function ferienNormalize(raw) {
    const map = new Map();
    (Array.isArray(raw) ? raw : []).forEach(e => {
        if (!e || !e.startDate || !e.endDate) return;
        const names = Array.isArray(e.name) ? e.name : [];
        const nm = (names.find(n => n && String(n.language).toUpperCase() === 'DE') || names[0] || {}).text || '';
        const kind = ferienKindOf(nm);
        const states = new Set();
        if (e.nationwide || !Array.isArray(e.subdivisions) || !e.subdivisions.length) FERIEN_STATES.forEach(s => states.add(s.code));
        else e.subdivisions.forEach(sd => { const m = String((sd && sd.code) || '').match(/^DE-([A-Z]{2})/); if (m) states.add(m[1]); });
        if (!states.size) return;
        const key = `${e.startDate}|${e.endDate}|${nm}`;
        if (map.has(key)) states.forEach(s => map.get(key).states.add(s));
        else map.set(key, { start: e.startDate, end: e.endDate, name: nm || ferienKindInfo(kind).label, kind, states });
    });
    return [...map.values()].sort((a, b) => a.start.localeCompare(b.start));
}

function ferienTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }

async function ferienFetchRaw(from, to) {
    // 1) über deinen Server (kein Ärger mit Fremdserver-Regeln)
    try {
        const r = await ferienTimeout(apiFetch(`/api/maps?action=holidays&kind=school&from=${from}&to=${to}`), 18000);
        if (r.ok) { const d = await r.json(); if (Array.isArray(d)) return d; }
    } catch (e) { /* weiter mit direktem Abruf */ }
    // 2) direkt bei OpenHolidays (klappt nur, wenn der Dienst Browser-Zugriffe zulässt)
    try {
        const r = await ferienTimeout(fetch(`https://openholidaysapi.org/SchoolHolidays?countryIsoCode=DE&languageIsoCode=DE&validFrom=${from}&validTo=${to}`, { headers: { Accept: 'application/json' } }), 18000);
        if (r.ok) { const d = await r.json(); if (Array.isArray(d)) return d; }
    } catch (e) {}
    return null;
}

function ferienReadCache() { try { return JSON.parse(localStorage.getItem(FERIEN_CACHE_KEY) || 'null'); } catch (e) { return null; } }
function ferienWriteCache(obj) { try { localStorage.setItem(FERIEN_CACHE_KEY, JSON.stringify(obj)); } catch (e) {} }

/* Lädt (oder nimmt aus dem Zwischenspeicher) die Ferien von vor 45 Tagen bis ~2,2 Jahre voraus (oder bis 'needYear' Ende) */
async function ferienLoad(needYear) {
    const today = ferienToday();
    const fromD = new Date(today); fromD.setDate(fromD.getDate() - 45);
    const toD = new Date(today); toD.setDate(toD.getDate() + 800);
    let to = ferienIso(toD);
    if (needYear && `${needYear}-12-31` > to) to = `${needYear}-12-31`;
    const from = ferienIso(fromD);
    if (ferienData && ferienData._from <= from && ferienData._to >= to) return ferienData;
    const c = ferienReadCache();
    if (c && c.raw && Date.now() - c.at < FERIEN_CACHE_MS && c.from <= from && c.to >= to) {
        ferienData = ferienNormalize(c.raw); ferienData._from = c.from; ferienData._to = c.to; return ferienData;
    }
    const raw = await ferienFetchRaw(from, to);
    if (raw) {
        ferienWriteCache({ at: Date.now(), from, to, raw });
        ferienData = ferienNormalize(raw); ferienData._from = from; ferienData._to = to; return ferienData;
    }
    if (c && c.raw) { ferienData = ferienNormalize(c.raw); ferienData._from = c.from; ferienData._to = c.to; return ferienData; }   // lieber alte Daten als keine
    throw new Error('Ferientermine nicht ladbar');
}

/* ---------- Dein Bundesland ---------- */
function ferienSavedHome() { const v = String(getPersistentData(FERIEN_HOME_KEY, '') || ''); return ferienStateByCode(v) ? v : ''; }
function ferienSetHome(code) { setPersistentData(FERIEN_HOME_KEY, code); }

async function ferienHomeState() {
    const saved = ferienSavedHome();
    if (saved) return saved;
    try {
        const pos = await new Promise((ok, err) => navigator.geolocation.getCurrentPosition(p => ok(p.coords), err, { timeout: 8000, maximumAge: 600000 }));
        const r = await ferienTimeout(apiFetch(`/api/reverse?lat=${pos.latitude}&lon=${pos.longitude}`), 9000);
        const d = await r.json();
        const found = ferienFindStates(d && d.bundesland);
        if (found.length === 1) return found[0];
    } catch (e) {}
    return '';
}

/* ---------- Abfragen auf den Daten ---------- */
function ferienPeriodsFor(code) { return (ferienData || []).filter(p => p.states.has(code)); }

/* Eine Ferienart eines Bundeslandes: mit Jahr = die, die in diesem Jahr beginnt; sonst die laufende oder nächste */
function ferienFindKind(code, kind, year) {
    const today = ferienIso(ferienToday());
    const list = ferienPeriodsFor(code).filter(p => p.kind === kind);
    if (year) return list.find(p => Number(p.start.slice(0, 4)) === Number(year)) || null;
    return list.find(p => p.end >= today) || null;
}

function ferienMonth(d) { return d.toLocaleDateString('de-DE', { month: 'long' }); }
function ferienRangeText(start, end) {
    const s = ferienDay(start), e = ferienDay(end), thisYear = ferienToday().getFullYear();
    const yr = (s.getFullYear() !== thisYear || e.getFullYear() !== thisYear) ? ` ${e.getFullYear()}` : '';
    if (start === end) return `am ${s.getDate()}. ${ferienMonth(s)}${yr}`;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear()) return `vom ${s.getDate()}. bis ${e.getDate()}. ${ferienMonth(e)}${yr}`;
    return `vom ${s.getDate()}. ${ferienMonth(s)}${s.getFullYear() !== e.getFullYear() ? ' ' + s.getFullYear() : ''} bis ${e.getDate()}. ${ferienMonth(e)}${yr}`;
}
function ferienShortRange(start, end) {
    const f = iso => { const d = ferienDay(iso); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.`; };
    return start === end ? f(start) : `${f(start)}–${f(end)}`;
}
function ferienLongDate(iso) { const d = ferienDay(iso); return `${d.getDate()}. ${ferienMonth(d)}`; }
function ferienRelative(p) {
    const today = ferienToday(), s = ferienDay(p.start), e = ferienDay(p.end);
    if (today >= s && today <= e) { const left = ferienDiffDays(today, e); return left <= 0 ? 'läuft noch heute' : `läuft gerade, noch ${left} ${left === 1 ? 'Tag' : 'Tage'}`; }
    const n = ferienDiffDays(today, s);
    if (n < 0) return 'vorbei';
    if (n === 0) return 'beginnt heute';
    if (n === 1) return 'beginnt morgen';
    if (n < 14) return `in ${n} Tagen`;
    if (n < 70) return `in ${Math.round(n / 7)} Wochen`;
    return `in ${Math.round(n / 30)} Monaten`;
}
function ferienDays(p) { return ferienDiffDays(ferienDay(p.start), ferienDay(p.end)) + 1; }

/* ---------- Satz verstehen ---------- */
function parseFerienRequest(text) {
    const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 130) return null;

    // Bundesland festlegen
    const set = t.match(/\bmein bundesland (?:ist|heißt|lautet|ist jetzt)\s+(.+)$/) || t.match(/\bbundesland (?:auf|ändern auf|einstellen auf|festlegen auf)\s+(.+)$/);
    if (set) { const f = ferienFindStates(set[1]); return f.length === 1 ? { setHome: f[0] } : { setHome: '?' }; }

    if (/ferienwohnung|ferienhaus|ferienjob|ferienpark|ferienlager|ferienspaß|ferienbetreuung|ferienprogramm|ferienhof|ferienclub/.test(t)) return null;
    if (!/ferien/.test(t)) return null;
    const states = ferienFindStates(t);
    let kind = null;
    if (/weihnacht/.test(t)) kind = 'weihnachten'; else if (/sommer/.test(t)) kind = 'sommer'; else if (/herbst/.test(t)) kind = 'herbst';
    else if (/winter/.test(t)) kind = 'winter'; else if (/oster/.test(t)) kind = 'ostern'; else if (/pfingst/.test(t)) kind = 'pfingsten';
    const ym = t.match(/\b(20\d\d)\b/);
    const thisYear = ferienToday().getFullYear();
    const year = ym ? Number(ym[1]) : /\bnächstes jahr\b|\bnächsten jahr\b/.test(t) ? thisYear + 1 : /\bdieses jahr\b|\bdiesem jahr\b/.test(t) ? thisYear : 0;
    const all = /\balle (?:\w+ )?(?:bundesländer|länder)\b|\bin allen (?:\w+ )?(?:bundesländern|ländern)\b|\bbundesweit\b|\bim vergleich\b|\bvergleich\b|\bbundesländer\b/.test(t);
    const show = /\b(zeig\w*|öffne\w*|ferienkalender|übersicht|liste|tabelle|vergleich)\b/.test(t) || /(?<![\wäöüß])öffne/.test(t);
    return { states, kind, year, all, show };
}

/* ---------- Antworten ---------- */
function ferienSay(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }

function ferienCards(periods, code, extra) {
    const st = ferienStateByCode(code);
    const cards = periods.slice(0, 3).map(p => ({ icon: ferienKindInfo(p.kind).icon, title: `${p.name}${st ? ' · ' + st.name : ''}`, subtitle: `${ferienShortRange(p.start, p.end)} · ${ferienDays(p)} Tage · ${ferienRelative(p)}` }));
    cards.push({ icon: '🏖️', title: 'Ferienkalender öffnen', subtitle: 'Alle Ferien, auch aller Bundesländer', onclick: `openFerienkalender('${code || ''}')` });
    return cards;
}

function ferienShowCards(cards) { try { if (typeof clearActionCards === 'function') clearActionCards(); if (typeof showActionCards === 'function') showActionCards(cards); } catch (e) {} }

/* Frühester/spätester Beginn einer Ferienart in allen Bundesländern */
function ferienAllStates(kind, year) {
    const rows = [];
    FERIEN_STATES.forEach(s => {
        const p = ferienFindKind(s.code, kind, year);
        if (p) rows.push({ state: s, p });
    });
    rows.sort((a, b) => a.p.start.localeCompare(b.p.start) || a.state.name.localeCompare(b.state.name, 'de'));
    return rows;
}

/* Die Ferienart, die als Nächstes (oder gerade) irgendwo beginnt */
function ferienNextKind() {
    const today = ferienIso(ferienToday());
    const cand = (ferienData || []).filter(p => FERIEN_MAJOR.includes(p.kind) && p.end >= today).sort((a, b) => a.start.localeCompare(b.start));
    return cand.length ? cand[0].kind : 'sommer';
}
function ferienYearsOf(kind) {
    const ys = new Set();
    (ferienData || []).forEach(p => { if (p.kind === kind) ys.add(Number(p.start.slice(0, 4))); });
    return [...ys].sort();
}
function ferienDefaultYear(kind) {
    const today = ferienIso(ferienToday());
    const p = (ferienData || []).filter(x => x.kind === kind && x.end >= today).sort((a, b) => a.start.localeCompare(b.start))[0];
    return p ? Number(p.start.slice(0, 4)) : (ferienYearsOf(kind).pop() || ferienToday().getFullYear());
}

async function runFerien(req) {
    try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Hole Ferientermine...'); } catch (e) {}
    try { await ferienLoad(req.year || 0); }
    catch (e) { ferienSay('Die Ferientermine kann ich gerade nicht laden. Versuchen Sie es bitte gleich noch einmal.'); return; }

    // Vergleich aller Bundesländer
    if (req.all) {
        const kind = req.kind || ferienNextKind();
        const year = req.year || ferienDefaultYear(kind);
        const rows = ferienAllStates(kind, year);
        const label = ferienKindInfo(kind).label;
        if (!rows.length) { ferienSay(`Für die ${label} ${year} habe ich noch keine Termine gefunden.`); return; }
        const first = rows[0], last = rows[rows.length - 1];
        showFerienkalender({ mode: 'all', kind, year });
        ferienSay(`Die ${label} ${year} beginnen am frühesten in ${first.state.name} am ${ferienLongDate(first.p.start)} und am spätesten in ${last.state.name} am ${ferienLongDate(last.p.start)}. Die Liste aller Bundesländer steht auf dem Bildschirm.`);
        return;
    }

    // Bundesland bestimmen
    let codes = req.states.slice(0, 3);
    if (!codes.length) {
        const home = await ferienHomeState();
        if (!home) { ferienSay('Für welches Bundesland? Sagen Sie zum Beispiel: Wann sind die Herbstferien in Hamburg? Oder legen Sie Ihres fest: Mein Bundesland ist Schleswig-Holstein.'); return; }
        codes = [home];
    }

    // Nur das Fenster zeigen
    if (req.show && !req.kind) {
        showFerienkalender({ mode: 'one', state: codes[0] });
        ferienSay(`Hier ist der Ferienkalender für ${ferienStateByCode(codes[0]).name}.`);
        return;
    }

    // Eine bestimmte Ferienart
    if (req.kind) {
        const label = ferienKindInfo(req.kind).label;
        const parts = [], cards = [];
        codes.forEach(code => {
            const st = ferienStateByCode(code), p = ferienFindKind(code, req.kind, req.year);
            if (!p) { parts.push(`Für ${st.name} habe ich ${req.year ? 'für ' + req.year : 'dazu'} noch keine Termine.`); return; }
            parts.push(`Die ${label}${req.year ? ' ' + req.year : ''} in ${st.name}: ${ferienRangeText(p.start, p.end)}, ${ferienDays(p)} Tage${ferienRelative(p) !== 'vorbei' ? ', ' + ferienRelative(p) : ''}.`);
            cards.push({ icon: ferienKindInfo(p.kind).icon, title: `${p.name} · ${st.name}`, subtitle: `${ferienShortRange(p.start, p.end)} · ${ferienDays(p)} Tage · ${ferienRelative(p)}` });
        });
        cards.push({ icon: '🏖️', title: 'Ferienkalender öffnen', subtitle: 'Alle Ferien, auch aller Bundesländer', onclick: `openFerienkalender('${codes[0]}')` });
        ferienShowCards(cards);
        if (req.show) showFerienkalender({ mode: 'one', state: codes[0] });
        ferienSay(parts.join(' '));
        return;
    }

    // Nächste Ferien
    const code = codes[0], st = ferienStateByCode(code), today = ferienIso(ferienToday());
    const list = ferienPeriodsFor(code).filter(p => p.end >= today && FERIEN_MAJOR.includes(p.kind));
    if (!list.length) { ferienSay(`Für ${st.name} habe ich gerade keine kommenden Ferien in den Daten.`); return; }
    const now = list.find(p => p.start <= today), next = list.filter(p => p.start > today);
    let msg = '';
    if (now) msg += `Gerade sind Ferien in ${st.name}: ${now.name}, noch bis zum ${ferienLongDate(now.end)}. `;
    if (next[0]) msg += `${now ? 'Danach' : 'Die nächsten Ferien in ' + st.name}: ${next[0].name}, ${ferienRangeText(next[0].start, next[0].end)}, ${ferienRelative(next[0])}.`;
    if (next[1]) msg += ` Dann: ${next[1].name}, ${ferienRangeText(next[1].start, next[1].end)}.`;
    ferienShowCards(ferienCards([now, next[0], next[1]].filter(Boolean), code));
    ferienSay(msg.trim());
}

function handleFerienCommand(text) {
    const req = parseFerienRequest(text);
    if (!req) return false;
    if (req.setHome !== undefined) {
        if (req.setHome === '?') { ferienSay('Welches Bundesland meinen Sie? Sagen Sie zum Beispiel: Mein Bundesland ist Schleswig-Holstein.'); return true; }
        ferienSetHome(req.setHome);
        ferienSay(`Gut, Ihr Bundesland ist ${ferienStateByCode(req.setHome).name}.`);
        return true;
    }
    runFerien(req).catch(() => { try { speak('Der Ferienkalender hat gerade nicht geklappt.'); } catch (e) {} });
    return true;
}

/* ---------- Fenster ---------- */
function ferienEnsureStyle() {
    if (document.getElementById('ferienStyle')) return;
    const st = document.createElement('style');
    st.id = 'ferienStyle';
    st.textContent =
        '#ferienMap{position:fixed;inset:0;z-index:91;background:#050a10;color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
        '#ferienMap .fk-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(93,209,255,.18)}' +
        '#ferienMap .fk-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.06em;color:#49d7ff}' +
        '#ferienMap .fk-close{flex:none;width:42px;height:42px;border:1px solid rgba(93,209,255,.3);border-radius:10px;background:rgba(0,0,0,.4);color:#49d7ff;font-size:18px}' +
        '#ferienMap .fk-tabs{display:flex;gap:8px;padding:10px 12px 4px}' +
        '#ferienMap .fk-tab{flex:1;padding:8px 6px;border-radius:10px;border:1px solid rgba(93,209,255,.3);background:rgba(10,22,33,.9);color:#9fd8ee;font-size:14px}' +
        '#ferienMap .fk-tab.on{background:rgba(73,215,255,.2);border-color:#49d7ff;color:#fff}' +
        '#ferienMap .fk-ctl{display:flex;gap:8px;padding:6px 12px}' +
        '#ferienMap select{flex:1;min-width:0;padding:8px;border-radius:10px;border:1px solid rgba(93,209,255,.3);background:#0a1621;color:#fff;font-size:15px}' +
        '#ferienMap .fk-list{flex:1 1 auto;overflow-y:auto;padding:4px 12px 8px}' +
        '#ferienMap .fk-row{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:9px 10px;margin:6px 0;border:1px solid rgba(93,209,255,.2);border-radius:10px;background:rgba(10,22,33,.85)}' +
        '#ferienMap .fk-row.now{border-color:#49d7ff;background:rgba(73,215,255,.14)}#ferienMap .fk-row.home{border-color:#ffb347}' +
        '#ferienMap .fk-l{min-width:0}#ferienMap .fk-n{font-weight:700;color:#fff;font-size:15px}#ferienMap .fk-s{font-size:12px;color:#7fb8cf}' +
        '#ferienMap .fk-r{text-align:right;flex:none}#ferienMap .fk-d{font:600 13px "IBM Plex Mono",monospace;color:#49d7ff}#ferienMap .fk-t{font-size:12px;color:#9fd8ee}' +
        '#ferienMap .fk-note{padding:6px 14px 10px;font-size:12px;color:#5d7e91;text-align:center}';
    document.head.appendChild(st);
}

function closeFerienkalender() {
    if (!ferienOverlayEl) return false;
    try { ferienOverlayEl.remove(); } catch (e) {}
    ferienOverlayEl = null;
    try { document.body.classList.remove('panel-open'); } catch (e) {}
    try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) {}
    return true;
}

function ferienRender() {
    const el = ferienOverlayEl;
    if (!el) return;
    const mk = (parent, tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; parent.appendChild(x); return x; };
    el.innerHTML = '';
    const home = ferienSavedHome();

    const head = mk(el, 'div', 'fk-head');
    mk(head, 'div', 'fk-title', '🏖️ Ferienkalender');
    const close = mk(head, 'button', 'fk-close', '✕'); close.setAttribute('aria-label', 'Schließen'); close.addEventListener('click', () => closeFerienkalender());

    const tabs = mk(el, 'div', 'fk-tabs');
    [['one', 'Ein Bundesland'], ['all', 'Alle Bundesländer']].forEach(([m, label]) => {
        const b = mk(tabs, 'button', 'fk-tab' + (ferienUi.mode === m ? ' on' : ''), label);
        b.addEventListener('click', () => {
            ferienUi.mode = m;
            if (m === 'all') { if (!ferienUi.kind) ferienUi.kind = ferienNextKind(); if (!ferienUi.year) ferienUi.year = ferienDefaultYear(ferienUi.kind); }
            ferienRender();
        });
    });

    const ctl = mk(el, 'div', 'fk-ctl');
    const addSelect = (options, value, onChange) => {
        const sel = mk(ctl, 'select');
        options.forEach(([v, label]) => { const o = document.createElement('option'); o.value = String(v); o.textContent = label; if (String(v) === String(value)) o.selected = true; sel.appendChild(o); });
        sel.addEventListener('change', () => onChange(sel.value));
        return sel;
    };
    if (ferienUi.mode === 'one') {
        addSelect(FERIEN_STATES.map(s => [s.code, s.name]), ferienUi.state, v => { ferienUi.state = v; ferienRender(); });
    } else {
        addSelect(FERIEN_KINDS.map(k => [k.key, k.label]), ferienUi.kind, v => { ferienUi.kind = v; ferienUi.year = ferienDefaultYear(v); ferienRender(); });
        const years = ferienYearsOf(ferienUi.kind);
        if (ferienUi.year && !years.includes(ferienUi.year)) years.push(ferienUi.year);
        addSelect(years.sort().map(y => [y, String(y)]), ferienUi.year, v => { ferienUi.year = Number(v); ferienRender(); });
    }

    const list = mk(el, 'div', 'fk-list');
    const today = ferienIso(ferienToday());
    if (ferienUi.mode === 'one') {
        const lim = new Date(ferienToday()); lim.setMonth(lim.getMonth() + 16);
        const periods = ferienPeriodsFor(ferienUi.state).filter(p => p.end >= today && p.start <= ferienIso(lim));
        if (!periods.length) mk(list, 'div', 'fk-s', 'Für dieses Bundesland habe ich keine kommenden Ferien in den Daten.');
        periods.forEach(p => {
            const info = ferienKindInfo(p.kind);
            const active = p.start <= today && p.end >= today;
            const row = mk(list, 'div', 'fk-row' + (active ? ' now' : ''));
            const l = mk(row, 'div', 'fk-l'); mk(l, 'div', 'fk-n', `${info.icon} ${p.name}`); mk(l, 'div', 'fk-s', `${ferienDays(p)} ${ferienDays(p) === 1 ? 'Tag' : 'Tage'}`);
            const r = mk(row, 'div', 'fk-r'); mk(r, 'div', 'fk-d', ferienShortRange(p.start, p.end)); mk(r, 'div', 'fk-t', ferienRelative(p));
        });
    } else {
        const rows = ferienAllStates(ferienUi.kind, ferienUi.year);
        if (!rows.length) mk(list, 'div', 'fk-s', `Für die ${ferienKindInfo(ferienUi.kind).label} ${ferienUi.year} habe ich noch keine Termine.`);
        rows.forEach((r0, i) => {
            const row = mk(list, 'div', 'fk-row' + (r0.state.code === home ? ' home' : ''));
            const l = mk(row, 'div', 'fk-l'); mk(l, 'div', 'fk-n', r0.state.name + (r0.state.code === home ? ' ★' : ''));
            mk(l, 'div', 'fk-s', `${ferienDays(r0.p)} Tage${i === 0 ? ' · beginnt als Erstes' : i === rows.length - 1 ? ' · beginnt als Letztes' : ''}`);
            const r = mk(row, 'div', 'fk-r'); mk(r, 'div', 'fk-d', ferienShortRange(r0.p.start, r0.p.end)); mk(r, 'div', 'fk-t', ferienRelative(r0.p));
        });
    }
    mk(el, 'div', 'fk-note', 'Quelle: OpenHolidays · Angaben ohne Gewähr, bewegliche Ferientage bitte bei der Schule prüfen');
}

function showFerienkalender(opts) {
    if (!ferienData) return;
    ferienEnsureStyle();
    closeFerienkalender();
    try { if (typeof closeWeatherMap === 'function') closeWeatherMap(); } catch (e) {}
    const o = opts || {};
    ferienUi.mode = o.mode === 'all' ? 'all' : 'one';
    ferienUi.state = o.state || ferienUi.state || ferienSavedHome() || 'SH';
    ferienUi.kind = o.kind || ferienUi.kind || ferienNextKind();
    ferienUi.year = o.year || ferienDefaultYear(ferienUi.kind);
    const el = document.createElement('div');
    el.id = 'ferienMap';
    document.body.appendChild(el);
    ferienOverlayEl = el;
    ferienRender();
    try { document.body.classList.add('panel-open'); } catch (e) {}
    try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) {}
}

/* Von Karten aus aufrufbar (onclick) */
async function openFerienkalender(code) {
    try { await ferienLoad(0); } catch (e) { ferienSay('Die Ferientermine kann ich gerade nicht laden.'); return; }
    const home = code || ferienSavedHome() || await ferienHomeState() || 'SH';
    showFerienkalender({ mode: 'one', state: home });
}

/* ---------- Einklinken: "Schließen" und andere Fenster ---------- */
(function hookFerienPanels() {
    try {
        if (typeof isPanelOpen === 'function') { const o = isPanelOpen; isPanelOpen = function () { return !!ferienOverlayEl || o.apply(this, arguments); }; }
        if (typeof closePanel === 'function') { const o = closePanel; closePanel = function () { closeFerienkalender(); return o.apply(this, arguments); }; }
        if (typeof openPanel === 'function') { const o = openPanel; openPanel = function () { closeFerienkalender(); return o.apply(this, arguments); }; }
    } catch (e) {}
})();
