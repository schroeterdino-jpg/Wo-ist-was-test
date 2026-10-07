/* ============================================================
   TAGESÜBERBLICK: Öffnest du die App morgens (Standard 7 bis 10 Uhr) zum ersten Mal am Tag, erscheint ein Fenster im HUD-Stil mit Kacheln:
   📅 Termine heute · 🔔 Erinnerungen (heute und überfällige) · ✅ Aufgaben & Notizen · 🛒 Einkaufsliste · 🎂 Geburtstage heute · 📍 Mein Standort.
   Der Tagesüberblick ersetzt das frühere Dashboard: "Dashboard" öffnet jetzt ebenfalls den Tagesüberblick.
   Es kommt ohne Ton (Chrome erlaubt beim Start keinen); der Knopf "Vorlesen" liest den Überblick vor. Ein Tipp auf eine Kachel öffnet das passende Fenster.
   Ist nichts offen, erscheint kurz "Heute ist nichts offen" und verschwindet von selbst.
   Einmal pro Tag: Wer es geschlossen hat, sieht es erst am nächsten Morgen wieder; per Sprache ("Tagesüberblick", "Zeig mir meinen Tag") jederzeit.
   Läuft die App über Nacht weiter (Wechsel von einer anderen App), erscheint der Überblick beim ersten Zurückkommen im Zeitfenster.
   Ein-/Ausschalten und Zeitfenster: Einstellungen > Morgen-Überblick. Braucht: calendarEntries, reminderEntries, todoEntries, shoppingEntries,
   briefing.js (isBirthdayEntry, formatSpokenTime), birthdays.js (fetchUpcomingBirthdays), voice.js (speak). Fehlt etwas, entfällt nur die jeweilige Kachel.
   ============================================================ */

const UEB_ON_KEY = 'helfer_morning_overview';
const UEB_FROM_KEY = 'helfer_morning_from';
const UEB_TO_KEY = 'helfer_morning_to';
const UEB_DAY_KEY = 'ueberblick_day';
const UEB_START_DELAY_MS = 1500;
const UEB_MAX_LINES = 4;

let uebEl = null;
let uebAutoCloseTimer = null;

function uebEnabled() { return getPersistentData(UEB_ON_KEY, '1') !== '0'; }
function uebFrom() { const v = Number(getPersistentData(UEB_FROM_KEY, '7')); return (v >= 0 && v <= 23) ? v : 7; }
function uebTo() { const v = Number(getPersistentData(UEB_TO_KEY, '10')); return (v >= 1 && v <= 24) ? v : 10; }
function uebHour() { const h = parseInt(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false }), 10); return isNaN(h) ? new Date().getHours() : h; }
function uebDayKey() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
function uebInWindow() { const h = uebHour(); return h >= uebFrom() && h < uebTo(); }
function uebShownToday() { try { return localStorage.getItem(UEB_DAY_KEY) === uebDayKey(); } catch (e) { return false; } }
function uebMarkShown() { try { localStorage.setItem(UEB_DAY_KEY, uebDayKey()); } catch (e) {} }
function uebAddress() { return (typeof charAddress === 'function') ? charAddress() : ((typeof currentUserName !== 'undefined' && currentUserName) || 'Sir'); }

function uebLocalDay(d) { return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
function uebClock(d) { return d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }); }
function uebTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }

/* ---------- Daten sammeln ---------- */
async function uebGather() {
    const today = uebLocalDay(new Date());
    const out = { termine: [], erinnerungen: [], aufgaben: [], einkauf: [], geburtstage: [] };

    (typeof calendarEntries !== 'undefined' ? calendarEntries : []).forEach(e => {
        if (!e || !e.isoDate) return;
        try { if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(e)) return; } catch (x) {}
        const allDay = /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate));
        const d = allDay ? new Date(e.isoDate + 'T12:00:00') : new Date(e.isoDate);
        if (isNaN(d.getTime()) || uebLocalDay(d) !== today) return;
        out.termine.push({ sort: allDay ? 0 : d.getTime(), time: allDay ? null : d, text: String(e.text || 'Termin') });
    });
    out.termine.sort((a, b) => a.sort - b.sort);

    const startOfToday = new Date(today + 'T00:00:00').getTime() - 6 * 3600000;   // grobe Untergrenze, genau wird unten per Tag verglichen
    (typeof reminderEntries !== 'undefined' ? reminderEntries : []).forEach(r => {
        if (!r || !r.time || r.triggered) return;
        const d = new Date(r.time);
        if (isNaN(d.getTime())) return;
        const day = uebLocalDay(d);
        if (day === today) out.erinnerungen.push({ sort: d.getTime(), time: d, text: String(r.text || 'Erinnerung'), overdue: false, important: !!r.important });
        else if (day < today && d.getTime() > startOfToday - 14 * 86400000) out.erinnerungen.push({ sort: d.getTime(), time: d, text: String(r.text || 'Erinnerung'), overdue: true, important: !!r.important });
    });
    out.erinnerungen.sort((a, b) => (b.overdue - a.overdue) || a.sort - b.sort);

    out.aufgaben = (typeof todoEntries !== 'undefined' ? todoEntries : []).map(t => String(t.text || '')).filter(Boolean);
    out.einkauf = (typeof shoppingEntries !== 'undefined' ? shoppingEntries : []).map(t => String(t.text || '')).filter(Boolean);

    if (typeof fetchUpcomingBirthdays === 'function') {
        try { out.geburtstage = (await uebTimeout(fetchUpcomingBirthdays(0), 6000)).filter(b => b.tag === 'heute').map(b => String(b.titel)); } catch (e) { out.geburtstage = []; }
    }
    return out;
}

/* Aktueller Standort (braucht GPS, darum erst nach dem Öffnen im Hintergrund); trägt sich in die Kachel und in d.standort ein */
async function uebFillLocation(d, el) {
    if (typeof fetchUserLocationData !== 'function') { el.textContent = 'nicht verfügbar'; return; }
    try {
        const r = await uebTimeout(fetchUserLocationData(), 25000);
        if (r && !r.fehler) {
            const addr = r.straßenAdresse ? `${r.straßenAdresse}, ${r.ort}` : r.ort;
            d.standort = addr;
            if (el.isConnected) el.textContent = addr;
        } else if (el.isConnected) el.textContent = (r && r.fehler) || 'nicht verfügbar';
    } catch (e) { if (el.isConnected) el.textContent = 'nicht verfügbar'; }
}

/* Kacheln, die ihren Inhalt erst nachladen: Parkplatz, Wetter, Spritpreis (früher im Dashboard). Fehler zeigen nur einen kurzen Hinweis in der Kachel. */
function uebFillLine(el, fn, onDone) {
    Promise.resolve().then(() => uebTimeout(fn(), 25000)).then(txt => { try { if (onDone) onDone(txt); } catch (e) {} if (el.isConnected) el.textContent = txt; })
        .catch(() => { if (el.isConnected) el.textContent = 'nicht verfügbar'; });
}
async function uebTextParkplatz() {
    const p = (typeof describeParking === 'function') ? describeParking() : null;
    if (!p) return 'Kein Parkplatz gespeichert.';
    return p.adresse + (p.gespeichert_vor ? ' · gespeichert ' + p.gespeichert_vor : '');
}
async function uebTextWetter() {
    const w = await fetchWeatherData();
    if (!w || w.fehler) return 'Wetterdaten gerade nicht verfügbar.';
    const text = (typeof weatherCodeText === 'function') ? weatherCodeText(w.wettercode) : '';
    return `${w.temperatur}° · gefühlt ${w.gefuehlteTemperatur}°` + (text ? ' · ' + text.charAt(0).toUpperCase() + text.slice(1) : '');
}
async function uebTextSprit() {
    const pos = await new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err, { timeout: 7000, maximumAge: 120000 }));
    const r = await apiFetch(`/api/tank?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&rad=5`);
    const d = await r.json();
    if (!r.ok || d.error) return 'Spritpreise gerade nicht verfügbar.';
    const rows = (d.stations || []).filter(s => typeof s.diesel === 'number' && s.diesel > 0).sort((a, b) => a.diesel - b.diesel);
    if (!rows.length) return 'Keine geöffneten Tankstellen gefunden.';
    const best = rows[0];
    return `Diesel ab ${best.diesel.toFixed(3).replace('.', ',')} € · ${best.name || ''}` + (best.strasse ? ' · ' + best.strasse : '');
}

function uebIsEmpty(d) { return !d.termine.length && !d.erinnerungen.length && !d.aufgaben.length && !d.einkauf.length && !d.geburtstage.length; }

/* ---------- Aufgaben nach Wichtigkeit ordnen ---------- */
const UEB_PRIO_RE = [
    [/dringend|sofort|unbedingt|wichtig|heute|asap|eilig|notfall/i, 5],
    [/frist|rechnung|bezahl|überweis|steuer|mahnung|versicherung|miete|vertrag|kündig|antrag|formular|behörde|amt|finanzamt|gericht/i, 4],
    [/arzt|zahnarzt|termin|rezept|apotheke|krank|werkstatt|tüv|hu/i, 3],
    [/morgen|diese woche|bis (montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)/i, 3],
    [/anrufen|zurückrufen|mail|antworten|abholen|abgeben|bestellen/i, 1],
    [/irgendwann|vielleicht|idee|mal wieder|eventuell/i, -2]
];
function uebPrioScore(t) { return UEB_PRIO_RE.reduce((s, [rx, w]) => s + (rx.test(String(t)) ? w : 0), 0); }
function uebSortByHeuristic(list) { return list.map((t, i) => ({ t, i, s: uebPrioScore(t) })).sort((a, b) => (b.s - a.s) || (a.i - b.i)).map(x => x.t); }
let uebSortCache = { key: '', list: null };
/* Erst die KI (bis 6 Sekunden), sonst die Stichwort-Regel oben. Die Liste selbst bleibt unverändert, nur das Vorlesen ist sortiert. */
async function uebSortTasks(list) {
    if (!Array.isArray(list) || list.length < 2) return list || [];
    const key = list.join('\u0001');
    if (uebSortCache.key === key && uebSortCache.list) return uebSortCache.list;
    let result = null;
    try {
        if (typeof apiFetch === 'function') {
            const heute = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const termine = (typeof calendarEntries !== 'undefined' ? calendarEntries : []).slice(0, 40).map(e => `${e.isoDate}: ${e.text}`).join('; ').slice(0, 1200);
            const res = await uebTimeout(apiFetch('/api/groq', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model: 'openai/gpt-oss-120b', response_format: { type: 'json_object' }, messages: [
                    { role: 'system', content: `Du sortierst eine To-Do-Liste nach Wichtigkeit (wichtigste zuerst). Wichtig: Fristen, Rechnungen, Zahlungen, Behörden, Arzt, Dringendes, Anstehendes (heute ist ${heute}); weniger wichtig: lose Ideen und Besorgungen ohne Zeitdruck. Termine zur Orientierung: ${termine}. Antworte NUR mit JSON der Form {"reihenfolge":[Nummern]} mit allen Nummern von 0 bis ${list.length - 1} genau einmal.` },
                    { role: 'user', content: list.map((t, i) => `${i}: ${t}`).join('\n') }
                ] })
            }), 6000);
            const data = await res.json();
            const ord = JSON.parse(data.choices[0].message.content).reihenfolge;
            if (Array.isArray(ord) && ord.length === list.length && new Set(ord).size === list.length && ord.every(n => Number.isInteger(n) && n >= 0 && n < list.length)) result = ord.map(n => list[n]);
        }
    } catch (e) { result = null; }
    if (!result) result = uebSortByHeuristic(list);
    uebSortCache = { key, list: result };
    return result;
}

/* ---------- Vorlesen ---------- */
function uebSpeechText(d) {
    const a = uebAddress();
    const t = (x) => (typeof formatSpokenTime === 'function') ? formatSpokenTime(x) : uebClock(x);
    if (uebIsEmpty(d)) return `Guten Morgen, ${a}. Heute ist nichts offen.` + (d.standort ? ` Sie befinden sich in ${d.standort}.` : '');
    const parts = [`Guten Morgen, ${a}.`];
    if (d.termine.length) parts.push(`Heute ${d.termine.length === 1 ? 'steht ein Termin' : 'stehen ' + d.termine.length + ' Termine'} an: ` + d.termine.slice(0, 10).map(e => e.time ? `${e.text} um ${t(e.time)}` : `${e.text}, ganztägig`).join('; ') + '.');
    if (d.erinnerungen.length) parts.push(`Erinnerungen: ` + d.erinnerungen.slice(0, 10).map(r => r.overdue ? `${r.text}, überfällig` : `${r.text} um ${t(r.time)}`).join('; ') + '.');
    if (d.aufgaben.length) {
        if (d.aufgaben.length === 1) parts.push(`Eine Aufgabe ist offen: ${d.aufgaben[0]}.`);
        else {   // Liste ist (wenn möglich) schon nach Wichtigkeit sortiert: die wichtigste zuerst nennen
            const rest = d.aufgaben.slice(1, 10);
            parts.push(`${d.aufgaben.length} Aufgaben sind offen. Am wichtigsten ist: ${d.aufgaben[0]}.` + (rest.length ? ' Danach: ' + rest.join(', ') + (d.aufgaben.length > 10 ? ' und weitere' : '') + '.' : ''));
        }
    }
    if (d.einkauf.length) parts.push(`Auf der Einkaufsliste ${d.einkauf.length === 1 ? 'steht ein Artikel' : 'stehen ' + d.einkauf.length + ' Artikel'}: ` + d.einkauf.slice(0, 12).join(', ') + (d.einkauf.length > 12 ? ' und weitere' : '') + '.');
    if (d.geburtstage.length) parts.push(`Heute ${d.geburtstage.length === 1 ? (/geburtstag/i.test(d.geburtstage[0]) ? 'ist ' + d.geburtstage[0] : 'hat ' + d.geburtstage[0] + ' Geburtstag') : 'haben mehrere Geburtstag'}.`);
    // Kacheln, die ihren Inhalt nachladen: nur vorlesen, was schon da ist und eine echte Angabe ist
    const okTxt = (x) => x && !/nicht verfügbar|gerade nicht|wird geladen|Kein Parkplatz|Keine geöffneten/i.test(x);
    if (okTxt(d.wetter)) parts.push('Das Wetter: ' + d.wetter.replace(/\s*·\s*gefühlt\s*/i, ', gefühlt ').replace(/\s*·\s*/g, ', ').replace(/(-?\d+(?:[.,]\d+)?)°/g, '$1 Grad') + '.');
    if (okTxt(d.parkplatz)) parts.push('Ihr Auto steht: ' + d.parkplatz.replace(/\s*·\s*/g, ', ') + '.');
    if (okTxt(d.sprit)) parts.push('Spritpreis: ' + d.sprit.replace(/\s*€\s*/g, ' Euro ').replace(/\s*·\s*/, ' bei ').replace(/\s*·\s*/g, ', ').replace(/\s+/g, ' ').trim() + '.');
    if (d.standort) parts.push(`Sie befinden sich in ${d.standort}.`);
    return parts.join(' ');
}

/* ---------- Fenster ---------- */
function uebEnsureStyle() {
    if (document.getElementById('uebStyle')) return;
    const st = document.createElement('style');
    st.id = 'uebStyle';
    st.textContent =
        '#uebMap{position:fixed;inset:0;z-index:92;background:rgba(4,9,15,.97);color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px);animation:uebIn .35s ease-out}' +
        '@keyframes uebIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}' +
        '#uebMap .ub-frame{position:absolute;inset:8px;pointer-events:none;border:1px solid rgba(93,209,255,.12)}' +
        '#uebMap .ub-frame i{position:absolute;width:22px;height:22px;border:2px solid #49d7ff;opacity:.85}' +
        '#uebMap .ub-frame i:nth-child(1){left:-1px;top:-1px;border-right:0;border-bottom:0}#uebMap .ub-frame i:nth-child(2){right:-1px;top:-1px;border-left:0;border-bottom:0}' +
        '#uebMap .ub-frame i:nth-child(3){left:-1px;bottom:-1px;border-right:0;border-top:0}#uebMap .ub-frame i:nth-child(4){right:-1px;bottom:-1px;border-left:0;border-top:0}' +
        '#uebMap .ub-head{padding:18px 18px 8px;text-align:center}' +
        '#uebMap .ub-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.14em;color:#49d7ff}' +
        '#uebMap .ub-date{font:500 13px "IBM Plex Mono",monospace;color:#7fb8cf;margin-top:4px;letter-spacing:.08em}' +
        '#uebMap .ub-grid{flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:8px 16px;align-content:start}' +
        '#uebMap .ub-tile{border:1px solid rgba(93,209,255,.3);border-radius:10px;background:rgba(10,22,33,.88);padding:10px 11px;min-height:96px;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
        '#uebMap .ub-tile.wide{grid-column:1 / -1;min-height:0}#uebMap .ub-tile.empty{opacity:.45}' +
        '#uebMap .ub-th{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:6px}' +
        '#uebMap .ub-tt{font:700 12px "IBM Plex Mono",monospace;letter-spacing:.08em;color:#49d7ff;text-transform:uppercase}' +
        '#uebMap .ub-badge{min-width:22px;text-align:center;padding:1px 7px;border-radius:999px;background:rgba(73,215,255,.18);border:1px solid rgba(73,215,255,.5);font:700 12px "IBM Plex Mono",monospace;color:#fff}' +
        '#uebMap .ub-line{font-size:14px;line-height:1.25;color:#e8f3f9;margin:3px 0;word-break:break-word}#uebMap .ub-line b{font:600 12px "IBM Plex Mono",monospace;color:#ffb347;margin-right:5px}' +
        '#uebMap .ub-line.od b{color:#ff6b6b}#uebMap .ub-more{font:500 12px "IBM Plex Mono",monospace;color:#7fb8cf;margin-top:4px}#uebMap .ub-none{font-size:13px;color:#7fb8cf}' +
        '#uebMap .ub-bar{display:flex;gap:10px;padding:8px 16px 14px}' +
        '#uebMap .ub-btn{flex:1;padding:11px 8px;border-radius:10px;border:1px solid rgba(93,209,255,.4);background:rgba(10,22,33,.95);color:#49d7ff;font:700 13px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase}' +
        '#uebMap .ub-btn.primary{background:rgba(73,215,255,.2);color:#fff}';
    document.head.appendChild(st);
}

function closeUeberblick() {
    if (uebAutoCloseTimer) { clearTimeout(uebAutoCloseTimer); uebAutoCloseTimer = null; }
    if (!uebEl) return false;
    try { uebEl.remove(); } catch (e) {}
    uebEl = null;
    try { document.body.classList.remove('panel-open'); } catch (e) {}
    try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) {}
    return true;
}

/* Tipp auf eine Kachel öffnet das passende Fenster (nur, wenn die App ein Fenster dieses Namens kennt) */
function uebOpenPanelFor(candidates) {
    closeUeberblick();
    try {
        const valid = (typeof VALID_PANELS !== 'undefined') ? VALID_PANELS : null;
        const name = candidates.find(c => !valid || valid.includes(c));
        if (name && typeof openPanel === 'function') openPanel(name);
    } catch (e) {}
}

function uebRender(d) {
    uebEnsureStyle();
    closeUeberblick();
    const mk = (parent, tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; parent.appendChild(x); return x; };
    const el = document.createElement('div');
    el.id = 'uebMap';
    const frame = mk(el, 'div', 'ub-frame'); for (let i = 0; i < 4; i++) frame.appendChild(document.createElement('i'));

    const head = mk(el, 'div', 'ub-head');
    mk(head, 'div', 'ub-title', 'TAGESÜBERBLICK');
    mk(head, 'div', 'ub-date', new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));

    const grid = mk(el, 'div', 'ub-grid');
    const tile = (icon, title, items, opts) => {
        const o = opts || {};
        const t = mk(grid, 'div', 'ub-tile' + (o.wide ? ' wide' : '') + (items.length ? '' : ' empty'));
        const th = mk(t, 'div', 'ub-th'); mk(th, 'div', 'ub-tt', `${icon} ${title}`); mk(th, 'div', 'ub-badge', String(items.length));
        if (!items.length) mk(t, 'div', 'ub-none', o.none || 'nichts offen');
        items.slice(0, o.max || UEB_MAX_LINES).forEach(it => {
            const line = mk(t, 'div', 'ub-line' + (it.od ? ' od' : ''));
            if (it.lead) mk(line, 'b', '', it.lead);
            line.appendChild(document.createTextNode(it.text));
        });
        if (items.length > (o.max || UEB_MAX_LINES)) mk(t, 'div', 'ub-more', `+ ${items.length - (o.max || UEB_MAX_LINES)} weitere`);
        if (o.panel) t.addEventListener('click', () => uebOpenPanelFor(o.panel));
        return t;
    };
    tile('📅', 'Termine heute', d.termine.map(e => ({ lead: e.time ? uebClock(e.time) : 'ganztägig', text: e.text })), { panel: ['termine', 'kalender'], none: 'heute frei' });
    tile('🔔', 'Erinnerungen', d.erinnerungen.map(r => ({ lead: r.overdue ? 'überfällig' : uebClock(r.time), text: r.text, od: r.overdue })), { panel: ['erinnerungen'] });
    tile('✅', 'Aufgaben & Notizen', d.aufgaben.map(t => ({ text: t })), { panel: ['aufgaben', 'todo', 'notizen'] });
    tile('🛒', 'Einkauf', d.einkauf.map(t => ({ text: t })), { panel: ['einkauf', 'einkaufsliste'], max: 5 });
    if (d.geburtstage.length) tile('🎂', 'Geburtstage heute', d.geburtstage.map(t => ({ text: t })), { wide: true });

    // Parkplatz, Wetter, Spritpreis: Kacheln sofort, der Inhalt kommt nach
    [['🅿️', 'Parkplatz', uebTextParkplatz, ['parkplatz'], 'parkplatz'], ['🌤️', 'Wetter', uebTextWetter, null, 'wetter'], ['⛽', 'Spritpreis', uebTextSprit, null, 'sprit']].forEach(([ic, ti, fn, pn, key]) => {
        const t = mk(grid, 'div', 'ub-tile wide');
        mk(mk(t, 'div', 'ub-th'), 'div', 'ub-tt', `${ic} ${ti}`);
        const line = mk(t, 'div', 'ub-line', 'wird geladen ...');
        if (pn) t.addEventListener('click', () => uebOpenPanelFor(pn));
        uebFillLine(line, fn, txt => { d[key] = String(txt || ''); });
    });

    // Standort: Kachel sofort, die Adresse kommt, sobald das GPS antwortet
    const loc = mk(grid, 'div', 'ub-tile wide');
    mk(mk(loc, 'div', 'ub-th'), 'div', 'ub-tt', '📍 Mein Standort');
    const locLine = mk(loc, 'div', 'ub-line', 'wird ermittelt ...');
    loc.addEventListener('click', () => uebOpenPanelFor(['karte']));
    uebFillLocation(d, locLine);

    const bar = mk(el, 'div', 'ub-bar');
    const speakBtn = mk(bar, 'button', 'ub-btn primary', '🔊 Vorlesen');
    speakBtn.addEventListener('click', async () => {
        try {
            let d2 = d;
            try { d2 = Object.assign({}, d, { aufgaben: await uebSortTasks(d.aufgaben) }); } catch (e) { d2 = d; }   // Aufgaben nach Wichtigkeit
            speak(uebSpeechText(d2));
        } catch (e) {}
    });
    const closeBtn = mk(bar, 'button', 'ub-btn', 'Schließen');
    closeBtn.addEventListener('click', () => closeUeberblick());

    document.body.appendChild(el);
    uebEl = el;
    try { document.body.classList.add('panel-open'); } catch (e) {}
    try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) {}
}

function uebRenderEmpty() {
    uebEnsureStyle();
    closeUeberblick();
    const el = document.createElement('div');
    el.id = 'uebMap';
    const head = document.createElement('div'); head.className = 'ub-head'; head.style.margin = 'auto 0';
    const t = document.createElement('div'); t.className = 'ub-title'; t.textContent = 'TAGESÜBERBLICK'; head.appendChild(t);
    const m = document.createElement('div'); m.className = 'ub-date'; m.style.fontSize = '15px'; m.textContent = 'Heute ist nichts offen. ✓'; head.appendChild(m);
    el.appendChild(head);
    el.addEventListener('click', () => closeUeberblick());
    document.body.appendChild(el);
    uebEl = el;
    uebAutoCloseTimer = setTimeout(() => closeUeberblick(), 6000);
}

/* ---------- Ablauf ---------- */
async function showUeberblick(markShown) {
    try { if (uebEl) closeUeberblick(); } catch (e) {}
    const d = await uebGather();
    if (markShown) uebMarkShown();
    // Morgens automatisch und nichts offen: kurzer Hinweis. Von Hand geöffnet (auch als Ersatz fürs Dashboard): immer die volle Ansicht mit Standort.
    if (markShown && uebIsEmpty(d)) { uebRenderEmpty(); return; }
    uebRender(d);
}

function uebMaybeShow() {
    try {
        if (!uebEnabled() || uebShownToday() || !uebInWindow()) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        if (typeof isProcessing !== 'undefined' && isProcessing) return;
        showUeberblick(true).catch(() => {});
    } catch (e) { /* der Überblick ist Zugabe und darf den Start der App nie stören */ }
}

function handleUeberblickCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 50) return false;
    if (/^(?:zeig(?:e)?(?: mir)?|öffne|mach)?\s*(?:mir\s+)?(?:bitte\s+)?(?:den |das |die |meinen |meine |mal )*(?:tagesüberblick|tagesplan|tagesübersicht|morgenüberblick|überblick|übersicht|dashboard|mein tag|meinen tag|tagesablauf)(?: bitte)?$/.test(t)
        || /^(?:zeig|zeige) mir (?:mal )?meinen tag$/.test(t) || /^was liegt heute an$/.test(t)) {
        showUeberblick(false).catch(() => {});
        return true;
    }
    return false;
}

/* ---------- Einstellungen und Start ---------- */
(function initUeberblick() {
    try {
        const on = document.getElementById('ueberblickToggle');
        if (on) { on.checked = uebEnabled(); on.addEventListener('change', () => setPersistentData(UEB_ON_KEY, on.checked ? '1' : '0')); }
        const from = document.getElementById('ueberblickFrom'), to = document.getElementById('ueberblickTo');
        if (from) { from.value = String(uebFrom()); from.addEventListener('change', () => setPersistentData(UEB_FROM_KEY, from.value)); }
        if (to) { to.value = String(uebTo()); to.addEventListener('change', () => setPersistentData(UEB_TO_KEY, to.value)); }
    } catch (e) {}
    try {
        // "Schließen" per Sprache und andere Fenster arbeiten mit dem Überblick zusammen
        if (typeof isPanelOpen === 'function') { const o = isPanelOpen; isPanelOpen = function () { return !!uebEl || o.apply(this, arguments); }; }
        if (typeof closePanel === 'function') { const o = closePanel; closePanel = function () { closeUeberblick(); return o.apply(this, arguments); }; }
        // Das Dashboard gibt es nicht mehr: Wer es öffnet (Menü oder KI), bekommt den Tagesüberblick
        if (typeof openPanel === 'function') {
            const o = openPanel;
            openPanel = function (name) {
                if (/^(?:dashboard|uebersicht|übersicht|start|home)$/i.test(String(name || ''))) { showUeberblick(false).catch(() => {}); return; }
                closeUeberblick();
                return o.apply(this, arguments);
            };
        }
    } catch (e) {}
    try {
        const go = () => setTimeout(uebMaybeShow, UEB_START_DELAY_MS);
        if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
        document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(uebMaybeShow, 800); });
    } catch (e) {}
})();