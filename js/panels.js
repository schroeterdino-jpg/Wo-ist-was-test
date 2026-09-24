/* ============================================================
   PANELS: Fenster, die ins Bild fliegen
   Statt Reitern zeigt die App Termine, Erinnerungen, Listen usw. in einem
   Fenster, sobald du danach fragst ("Zeige meine Termine für nächste Woche")
   oder über das Menü-Symbol oben links.
   Braucht: render.js (escapeHtml), briefing.js (normalizeKey, parseEventDate),
            calendar.js (deleteCalendarEntry, deleteReminderEntry), audio.js (playPanelSound)
   ============================================================ */

const PANEL_TITLES = {
    termine: '📅 Termine',
    erinnerungen: '🔔 Erinnerungen',
    einkauf: '📝 Listen',
    aufgaben: '📝 Listen',
    gedaechtnis: '🧠 Gedächtnis',
    parkplatz: '🧠 Gedächtnis',
    briefing: '🧠 Gedächtnis',
    kontakte: '⚙️ Kontakte',
    planer: '📅 Planer',
    settings: '⚙️ Einstellungen',
    menu: '☰ Menü',
    karte: '🗺️ Karte'
};

/* Diese Fenster zeigen einen bestehenden Bereich der Seite (wird ins Fenster geschoben und danach zurückgelegt) */
const PANEL_SECTIONS = {
    einkauf: 'sec-lists', aufgaben: 'sec-lists',
    gedaechtnis: 'sec-memory', parkplatz: 'sec-memory', briefing: 'sec-memory',
    planer: 'sec-planner', settings: 'sec-settings', kontakte: 'sec-settings'
};
const PANEL_SCROLL_TARGETS = {
    einkauf: 'shoppingList', aufgaben: 'todoList', parkplatz: 'parkingBox', briefing: 'briefingList', gedaechtnis: 'categoryContainer'
};
const PANEL_DYNAMIC = ['termine', 'erinnerungen', 'menu', 'karte'];
const VALID_PANELS = Object.keys(PANEL_TITLES);

const PANEL_CLOSE_MS = 300;
const PANEL_MAX_STAGGER = 10;   // ab der elften Zeile laufen alle gleichzeitig ein (sonst dauert es bei langen Listen zu lange)
const PANEL_FLY_MS = 900;       // so lange dauert das Einfliegen ungefähr; erst danach wird nachgeladen und gescrollt
const PANEL_ANIM_MS = 2600;     // so lange gilt die Einlauf-Animation
const PANEL_HORIZON_DAYS = 93;   // so weit im Voraus lädt die App Termine aus dem Google Kalender

let currentPanel = null;      // { name, options } solange ein Fenster offen ist
let panelClosing = false;
let panelMounted = null;      // Bereich der Seite, der gerade im Fenster steckt
let panelLastHtml = '';
let panelCloseTimer = null;
let panelAnimTimer = null;

/* ---------- Zeiträume ---------- */
function panelAddDays(d, n) {
    const x = new Date(d);
    x.setDate(x.getDate() + n);
    return x;
}

function panelParseDateOnly(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '').trim());
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : null;
}

/* Wörter der KI ("diese_woche", "nächste Woche" ...) in einen Zeitraum umrechnen. Ende ist exklusiv. */
function resolvePanelRange(range, from, to, now = new Date(), defaultRange = 'naechste7tage') {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sinceMonday = (todayStart.getDay() + 6) % 7;
    const nextMonday = panelAddDays(todayStart, 7 - sinceMonday);
    const fromD = panelParseDateOnly(from);
    const toD = panelParseDateOnly(to);

    let key = normalizeKey(range || '') || defaultRange;
    let start, end, title;

    if (fromD) {
        start = fromD;
        end = panelAddDays(toD && toD >= fromD ? toD : fromD, 1);
        title = 'Zeitraum';
    } else {
        const table = {
            heute:          [todayStart, panelAddDays(todayStart, 1), 'Heute'],
            morgen:         [panelAddDays(todayStart, 1), panelAddDays(todayStart, 2), 'Morgen'],
            diesewoche:     [todayStart, nextMonday, 'Diese Woche'],
            naechstewoche:  [nextMonday, panelAddDays(nextMonday, 7), 'Nächste Woche'],
            naechste7tage:  [todayStart, panelAddDays(todayStart, 7), 'Nächste 7 Tage'],
            naechste30tage: [todayStart, panelAddDays(todayStart, 30), 'Nächste 30 Tage'],
            alle:           [todayStart, panelAddDays(todayStart, PANEL_HORIZON_DAYS), 'Alle anstehenden']
        };
        const hit = table[key] || table[defaultRange];
        [start, end, title] = hit;
    }

    const short = d => d.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const subtitle = `${short(start)} bis ${short(panelAddDays(end, -1))}`;
    return { start, end, title, subtitle, beyondHorizon: end > panelAddDays(todayStart, PANEL_HORIZON_DAYS + 1) };
}

/* ---------- Inhalte der dynamischen Fenster ---------- */
function panelDayHeader(date, todayStart) {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = Math.round((dayStart - todayStart) / 86400000);
    const text = date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    const rel = diff === 0 ? 'Heute' : diff === 1 ? 'Morgen' : diff === 2 ? 'Übermorgen' : '';
    return rel ? `${rel} – ${text}` : text;
}

function panelTime(date, allDay) {
    return allDay ? 'ganztägig' : date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
}

function panelRowsGrouped(items, todayStart, renderRow) {
    let html = '';
    let lastKey = '';
    let i = 0;
    items.forEach(item => {
        const d = item.date;
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (key !== lastKey) {
            html += `<h3 class="panel-row text-xs font-bold text-[#5d7e91] uppercase tracking-wider mt-3 mb-1" style="--i:${Math.min(i++, PANEL_MAX_STAGGER)}">${escapeHtml(panelDayHeader(d, todayStart))}</h3>`;
            lastKey = key;
        }
        html += renderRow(item, Math.min(i++, PANEL_MAX_STAGGER));
    });
    return html;
}

function buildTerminePanel(options = {}, now = new Date()) {
    const r = resolvePanelRange(options.range, options.from, options.to, now, 'naechste7tage');
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const items = (calendarEntries || [])
        .filter(e => e.isoDate)
        .map(e => ({ id: e.id, text: e.text, recurring: !!e.recurring, birthday: isBirthdayEntry(e), ...parseEventDate(e.isoDate) }))
        .filter(e => !isNaN(e.date.getTime()) && e.date >= r.start && e.date < r.end)
        .sort((a, b) => a.date - b.date);

    const rows = panelRowsGrouped(items, todayStart, (e, i) => {
        const past = !e.allDay && e.date < now;
        const icon = e.birthday ? '🎂 ' : '';
        const repeat = e.recurring ? ' <span class="text-[#5d7e91]" title="wiederholt sich">↻</span>' : '';
        return `<div class="panel-row flex items-center gap-3 bg-black/60 border border-[rgba(93,209,255,.15)] rounded-lg p-3 mb-2 ${past ? 'opacity-50' : ''}" style="--i:${i}">` +
            `<span class="w-20 shrink-0 text-[#49d7ff] font-bold text-sm">${escapeHtml(panelTime(e.date, e.allDay))}</span>` +
            `<span class="flex-1 min-w-0 break-words text-slate-100">${icon}${escapeHtml(e.text)}${repeat}</span>` +
            `<button onclick="playUiBeep(); panelDeleteAppointment('${escapeHtml(String(e.id).replace(/'/g, ''))}')" class="text-[#49d7ff] font-bold text-xs uppercase">Löschen</button></div>`;
    });

    const count = items.length === 1 ? '1 Termin' : `${items.length} Termine`;
    const empty = `<div class="panel-row text-slate-500 italic mt-3" style="--i:1">Keine Termine in diesem Zeitraum.</div>`;
    const note = r.beyondHorizon ? `<p class="text-xs text-[#5d7e91] mt-3">Es sind nur die Termine der nächsten drei Monate geladen.</p>` : '';
    const html = `<div class="font-mono text-xs">` +
        `<p class="panel-row text-[#49d7ff] font-bold text-sm" style="--i:0">${escapeHtml(r.title)}</p>` +
        `<p class="text-[#5d7e91]">${escapeHtml(r.subtitle)}, ${count}</p>` +
        (items.length ? rows : empty) + note +
        `<p class="text-[#5d7e91] mt-4">Sag „Schließen", um das Fenster zu schließen.</p></div>`;
    return { title: `📅 Termine – ${r.title}`, html };
}

function buildErinnerungenPanel(options = {}, now = new Date()) {
    const r = resolvePanelRange(options.range, options.from, options.to, now, 'alle');
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const items = (reminderEntries || [])
        .filter(e => e.time)
        .map(e => ({ id: e.id, text: e.text, triggered: !!e.triggered, ...parseEventDate(e.time) }))
        .filter(e => !isNaN(e.date.getTime()) && e.date >= r.start && e.date < r.end)
        .sort((a, b) => a.date - b.date);

    const rows = panelRowsGrouped(items, todayStart, (e, i) => {
        const done = e.triggered || e.date < now;
        return `<div class="panel-row flex items-center gap-3 bg-black/60 border border-[rgba(93,209,255,.15)] rounded-lg p-3 mb-2 ${done ? 'opacity-50' : ''}" style="--i:${i}">` +
            `<span class="w-20 shrink-0 text-[#ff9a44] font-bold text-sm">${escapeHtml(panelTime(e.date, e.allDay))}</span>` +
            `<span class="flex-1 min-w-0 break-words text-slate-100">🔔 ${escapeHtml(e.text)}${e.triggered ? ' ✓' : ''}</span>` +
            `<button onclick="playUiBeep(); panelDeleteReminder(${Number(e.id)})" class="text-[#49d7ff] font-bold text-xs uppercase">Löschen</button></div>`;
    });

    const count = items.length === 1 ? '1 Erinnerung' : `${items.length} Erinnerungen`;
    const empty = `<div class="panel-row text-slate-500 italic mt-3" style="--i:1">Keine Erinnerungen in diesem Zeitraum.</div>`;
    const html = `<div class="font-mono text-xs">` +
        `<p class="panel-row text-[#ff9a44] font-bold text-sm" style="--i:0">${escapeHtml(r.title)}</p>` +
        `<p class="text-[#5d7e91]">${escapeHtml(r.subtitle)}, ${count}</p>` +
        (items.length ? rows : empty) +
        `<p class="text-[#5d7e91] mt-4">Sag „Schließen", um das Fenster zu schließen.</p></div>`;
    return { title: `🔔 Erinnerungen – ${r.title}`, html };
}

function buildMenuPanel() {
    const entries = [
        ['📅', 'Termine', 'nächste 7 Tage', "openPanel('termine')"],
        ['🔔', 'Erinnerungen', 'alle anstehenden', "openPanel('erinnerungen')"],
        ['📝', 'Listen', 'Einkauf und Aufgaben', "openPanel('einkauf')"],
        ['🧠', 'Gedächtnis', 'mit Parkplatz und Briefing-Wünschen', "openPanel('gedaechtnis')"],
        ['🗺️', 'Karte', 'Standort, Route zur Arbeit, Stau', "openPanel('karte')"],
        ['🗓️', 'Planer', 'Erinnerung anlegen', "openPanel('planer')"],
        ['⚙️', 'Einstellungen', 'Konto, Stimme, Kontakte', "openPanel('settings')"]
    ];
    const html = '<div class="font-mono">' + entries.map(([icon, name, sub, action], i) =>
        `<button class="panel-row w-full flex items-center gap-3 text-left bg-black/60 border border-[rgba(93,209,255,.2)] rounded-lg p-3 mb-2" style="--i:${i}" onclick="playUiBeep(); ${action}">` +
        `<span class="text-2xl">${icon}</span><span class="flex-1"><b class="block text-[#49d7ff] text-sm">${name}</b><span class="text-xs text-slate-400">${sub}</span></span><span class="text-[#49d7ff]">›</span></button>`
    ).join('') + '</div>';
    return { title: PANEL_TITLES.menu, html };
}

function buildDynamicPanel(name, options) {
    if (name === 'termine') return buildTerminePanel(options);
    if (name === 'erinnerungen') return buildErinnerungenPanel(options);
    if (name === 'karte') return buildKartePanel(options);
    return buildMenuPanel();
}

/* ---------- Öffnen, Schließen ---------- */
function isPanelOpen() {
    return !!currentPanel && !panelClosing;
}

function panelRestoreSection() {
    if (panelMounted) {
        panelMounted.classList.add('hidden');
        const main = document.querySelector('main');
        if (main) main.appendChild(panelMounted);
        panelMounted = null;
    }
}

function openPanel(name, options = {}) {
    if (!VALID_PANELS.includes(name)) return false;
    const layer = document.getElementById('panelLayer');
    const body = document.getElementById('panelBody');
    const titleEl = document.getElementById('panelTitle');
    if (!layer || !body || !titleEl) return false;

    clearTimeout(panelCloseTimer);
    clearTimeout(panelAnimTimer);
    panelRestoreSection();
    hudMapDestroy();

    panelClosing = false;
    currentPanel = { name, options };
    panelLastHtml = '';
    body.innerHTML = '';
    body.classList.add('animate');
    layer.classList.remove('closing');

    if (PANEL_DYNAMIC.includes(name)) {
        const built = buildDynamicPanel(name, options);
        if (typeof typeWriterInto === 'function') typeWriterInto(titleEl, built.title); else titleEl.textContent = built.title;
        body.innerHTML = built.html;
        panelLastHtml = built.html;
        // Die Karte wird erst nach dem Einfliegen aufgebaut (sonst ruckelt die Animation)
        if (name === 'karte') setTimeout(() => initHudMap(options), PANEL_FLY_MS);
        // Google-Kalender im Hintergrund auffrischen; refreshOpenPanel() zeichnet dann ohne Animation neu
        // erst NACH dem Einfliegen, sonst ruckelt die Animation, wenn die Daten mitten drin ankommen
        if (name !== 'menu' && name !== 'karte' && typeof accessToken !== 'undefined' && accessToken && typeof fetchGoogleCalendarEvents === 'function') {
            setTimeout(() => { if (isPanelOpen()) fetchGoogleCalendarEvents(); }, PANEL_FLY_MS);
        }
    } else {
        if (typeof typeWriterInto === 'function') typeWriterInto(titleEl, PANEL_TITLES[name]); else titleEl.textContent = PANEL_TITLES[name];
        const section = document.getElementById(PANEL_SECTIONS[name]);
        if (section) {
            section.classList.remove('hidden');
            body.appendChild(section);
            panelMounted = section;
        }
        if (name === 'kontakte') {
            const det = document.getElementById('contactsDetails');
            if (det) det.open = true;
        }
        const target = document.getElementById(name === 'kontakte' ? 'contactsDetails' : PANEL_SCROLL_TARGETS[name]);
        if (target && name !== 'settings') {
            setTimeout(() => {
                const card = (target.closest && (target.closest('.hud-panel') || target.closest('details'))) || target;
                if (card && card.scrollIntoView) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, PANEL_FLY_MS);
        }
    }

    // Animation neu starten (auch wenn schon ein anderes Fenster offen war)
    layer.classList.remove('hidden', 'open');
    void layer.offsetWidth;
    layer.classList.add('open');
    layer.setAttribute('aria-hidden', 'false');
    document.body.classList.add('panel-open');
    if (typeof playPanelSound === 'function') playPanelSound(true);
    if (typeof updateTerminalStream === 'function') updateTerminalStream(`PANEL_OPEN: ${name.toUpperCase()}`);

    // Nach dem Einlaufen läuft nichts mehr an, damit spätere Aktualisierungen nicht flackern
    panelAnimTimer = setTimeout(() => body.classList.remove('animate'), PANEL_ANIM_MS);
    return true;
}

function closePanel() {
    if (!isPanelOpen()) return false;
    const layer = document.getElementById('panelLayer');
    const body = document.getElementById('panelBody');
    if (!layer || !body) return false;

    panelClosing = true;
    clearTimeout(panelAnimTimer);
    layer.classList.add('closing');
    if (typeof playPanelSound === 'function') playPanelSound(false);

    panelCloseTimer = setTimeout(() => {
        layer.classList.add('hidden');
        layer.classList.remove('open', 'closing');
        layer.setAttribute('aria-hidden', 'true');
        panelRestoreSection();
        hudMapDestroy();
        body.innerHTML = '';
        body.classList.remove('animate');
        currentPanel = null;
        panelClosing = false;
        panelLastHtml = '';
        document.body.classList.remove('panel-open');
        if (typeof updateTerminalStream === 'function') updateTerminalStream('PANEL_CLOSED');
    }, PANEL_CLOSE_MS);
    return true;
}

/* Wird von renderAllLists() aufgerufen: aktualisiert ein offenes Termine- oder Erinnerungen-Fenster,
   ohne die Animation noch einmal abzuspielen (und nur, wenn sich wirklich etwas geändert hat). */
function refreshOpenPanel() {
    if (!isPanelOpen() || !['termine', 'erinnerungen'].includes(currentPanel.name)) return;
    const body = document.getElementById('panelBody');
    if (!body) return;
    const built = buildDynamicPanel(currentPanel.name, currentPanel.options);
    if (built.html === panelLastHtml) return;
    const scroll = body.scrollTop;
    // Neue Zeilen sofort zeigen: Sonst würde die Einlauf-Animation mitten drin noch einmal starten und flackern
    body.classList.remove('animate');
    body.innerHTML = built.html;
    body.scrollTop = scroll;
    panelLastHtml = built.html;
}

/* ---------- Löschen im Fenster ---------- */
async function panelDeleteAppointment(id) {
    await deleteCalendarEntry(id);    // zeichnet danach alles neu, das offene Fenster inklusive
}

async function panelDeleteReminder(id) {
    await deleteReminderEntry(id);
}

/* ---------- Sprachbefehl zum Schließen ("Schließe das Fenster", "zurück", "das reicht") ----------
   Gilt nur, wenn die ganze Äußerung ein Schließbefehl ist, damit normale Sätze nicht versehentlich das Fenster zumachen. */
function isCloseCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, '').trim();
    if (!t || t.length > 40) return false;
    return /^(bitte )?(schlie(ß|ss)\w*|zurück|zumachen|zu machen|mach\w*( das| die| es)?( fenster| liste| anzeige)?( zu)?|blende\w*( das| die| es)?( fenster| liste| anzeige)?( aus)?|das reicht( mir)?|weg damit|verschwinde\w*)( das| die| es| den)?( fenster| liste| anzeige| ansicht)?( bitte| zu| weg| wieder)?$/.test(t);
}

/* Tipp auf die Übersichtszeile oben: Ist der Google Kalender nicht (mehr) verbunden, startet er die Anmeldung
   (der Tipp ist die Bedienung, die der Browser dafür verlangt). Sonst öffnet er die Termine. */
function overviewTap() {
    if (typeof isGoogleAuthorized === 'function' && !isGoogleAuthorized()) {
        loginWithGoogle(false);
        return;
    }
    openPanel('termine', { range: 'alle' });
}


/* ============================================================
   HUD-KARTE: dunkle, leicht durchsichtige Karte im Jarvis-Look
   Zeigt deinen Standort, die Route zur Arbeit und Staumeldungen auf der Strecke.
   Kartenmaterial: OpenStreetMap über CARTO (kostenlos, ohne Schlüssel), Darstellung: Leaflet.
   Braucht: travel.js (fetchRouteMapData), briefing.js (fetchUserLocationData)
   ============================================================ */

const HUD_MAP_TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
// Färbt die dunklen Straßen leuchtend cyan. Gefällt dir die Farbe nicht: hier ändern (leer lassen = Originalfarben).
const HUD_MAP_TILE_FILTER = 'sepia(1) hue-rotate(150deg) saturate(3.2) brightness(1.55) contrast(1.15)';
const HUD_MAP_TILE_OPACITY = 0.9;
const HUD_MAP_PULSE = true;    // sanft pulsierender Punkt für den eigenen Standort
const HUD_ROUTE_COLOR = '#49d7ff';
const HUD_WARN_COLOR = '#ff9a44';
const LEAFLET_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
const LEAFLET_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';

let hudMap = null;
let hudMapLayers = {};
let hudMapMe = null;
let leafletPromise = null;

function ensureLeaflet() {
    if (window.L && window.L.map) return Promise.resolve();
    if (leafletPromise) return leafletPromise;
    const cssReady = new Promise((resolve) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = LEAFLET_CSS;
        css.onload = () => resolve();
        css.onerror = () => resolve();   // ohne Stylesheet sieht es nur schlechter aus, geht aber
        document.head.appendChild(css);
    });
    const jsReady = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = LEAFLET_JS;
        sc.onload = () => resolve();
        sc.onerror = () => reject(new Error('leaflet'));
        document.head.appendChild(sc);
    });
    leafletPromise = Promise.all([cssReady, jsReady]).catch(err => { leafletPromise = null; throw err; });
    return leafletPromise;
}

function injectHudMapStyles() {
    if (document.getElementById('hudMapStyles')) return;
    const st = document.createElement('style');
    st.id = 'hudMapStyles';
    st.textContent = `
.hud-map-wrap{position:relative;border:1px solid rgba(73,215,255,.4);border-radius:14px;overflow:hidden;background:rgba(0,10,20,.45);box-shadow:0 0 22px rgba(73,215,255,.18),inset 0 0 30px rgba(73,215,255,.08)}
.hud-map-wrap::after{content:'';position:absolute;inset:0;z-index:900;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(73,215,255,.04) 0,rgba(73,215,255,.04) 1px,transparent 1px,transparent 3px),radial-gradient(ellipse at center,transparent 55%,rgba(0,8,16,.55) 100%)}
#hudMap{height:58vh;min-height:300px;background:transparent}
#hudMap.leaflet-container{background:transparent;font-family:inherit}
#hudMap .leaflet-tile-pane{${HUD_MAP_TILE_FILTER ? 'filter:' + HUD_MAP_TILE_FILTER + ';' : ''}opacity:${HUD_MAP_TILE_OPACITY}}
#hudMap .leaflet-control-attribution{background:rgba(0,0,0,.55);color:#5d7e91;font-size:9px}
#hudMap .leaflet-control-attribution a{color:#5d7e91}
#hudMap .leaflet-popup-content-wrapper,#hudMap .leaflet-popup-tip{background:rgba(0,12,24,.94);color:#cfefff;border:1px solid rgba(73,215,255,.5)}
#hudMap .leaflet-popup-content{margin:8px 12px;font-size:12px;line-height:1.4}
.hud-me{position:relative;width:16px;height:16px;border-radius:50%;background:${HUD_ROUTE_COLOR};border:2px solid #fff;box-shadow:0 0 0 4px rgba(73,215,255,.25),0 0 14px 4px rgba(73,215,255,.9)}
${HUD_MAP_PULSE ? `@media (prefers-reduced-motion:no-preference){.hud-me::after{content:'';position:absolute;inset:-12px;border-radius:50%;border:2px solid rgba(73,215,255,.7);animation:hudPulse 2.6s ease-out infinite}}
@keyframes hudPulse{0%{transform:scale(.5);opacity:.9}100%{transform:scale(1.5);opacity:0}}` : ''}
.hud-dest{width:22px;height:22px;border-radius:50%;border:2px solid ${HUD_ROUTE_COLOR};background:rgba(73,215,255,.18);box-shadow:0 0 12px 2px rgba(73,215,255,.8);display:flex;align-items:center;justify-content:center;font-size:11px;color:#fff}
.hud-warn{width:26px;height:26px;border-radius:50%;border:2px solid ${HUD_WARN_COLOR};background:rgba(255,154,68,.22);box-shadow:0 0 12px 3px rgba(255,154,68,.85);display:flex;align-items:center;justify-content:center;font-size:14px}
.hud-map-chips{display:flex;flex-wrap:wrap;gap:8px;margin:10px 0 6px}
.hud-chip{border:1px solid rgba(73,215,255,.55);color:#49d7ff;border-radius:999px;padding:5px 13px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(0,0,0,.55)}
.hud-chip.off{opacity:.4}
`;
    document.head.appendChild(st);
}

function buildKartePanel(options = {}) {
    const html = `<div class="font-mono text-xs">` +
        `<div class="hud-map-wrap"><div id="hudMap"></div></div>` +
        `<div id="hudMapChips" class="hud-map-chips"></div>` +
        `<p id="hudMapStatus" class="text-[#5d7e91]">Karte wird geladen ...</p>` +
        `<p class="text-[#5d7e91] mt-4">Sag „Schließen", um das Fenster zu schließen.</p></div>`;
    return { title: PANEL_TITLES.karte, html };
}

function hudMapStatus(text) {
    const el = document.getElementById('hudMapStatus');
    if (el) el.textContent = text;
}

function hudMapDestroy() {
    if (hudMap) { try { hudMap.remove(); } catch (e) {} }
    hudMap = null;
    hudMapLayers = {};
    hudMapMe = null;
}

function hudMapRenderChips() {
    const el = document.getElementById('hudMapChips');
    if (!el || !hudMap) return;
    const chip = (label, action, off) => `<button class="hud-chip${off ? ' off' : ''}" onclick="playUiBeep(); ${action}">${label}</button>`;
    const on = (name) => hudMapLayers[name] && hudMap.hasLayer(hudMapLayers[name]);
    el.innerHTML = chip('Route', "hudMapToggle('route')", !on('route')) +
        chip('Stau', "hudMapToggle('stau')", !on('stau')) +
        chip('Mein Standort', 'hudMapCenter()', false);
}

function hudMapToggle(name) {
    const layer = hudMapLayers[name];
    if (!hudMap || !layer) return;
    if (hudMap.hasLayer(layer)) hudMap.removeLayer(layer); else hudMap.addLayer(layer);
    hudMapRenderChips();
}

function hudMapCenter() {
    if (hudMap && hudMapMe) hudMap.setView(hudMapMe, Math.max(hudMap.getZoom(), 13));
}

async function initHudMap(options = {}) {
    if (!document.getElementById('hudMap') || !isPanelOpen() || currentPanel.name !== 'karte') return;
    hudMapDestroy();
    hudMapStatus('Lade Karte ...');
    try {
        await ensureLeaflet();
    } catch (e) {
        hudMapStatus('Das Kartenmaterial konnte nicht geladen werden. Besteht eine Internetverbindung?');
        return;
    }
    const el = document.getElementById('hudMap');
    if (!el || !isPanelOpen() || currentPanel.name !== 'karte') return;
    injectHudMapStyles();

    const map = L.map(el, { zoomControl: false, zoomSnap: 0.5 }).setView([53.55, 10.0], 11);
    hudMap = map;
    L.tileLayer(HUD_MAP_TILE_URL, { subdomains: 'abcd', maxZoom: 19, attribution: '© OpenStreetMap · © CARTO' }).addTo(map);
    hudMapLayers = { route: L.layerGroup().addTo(map), stau: L.layerGroup().addTo(map) };
    hudMapRenderChips();
    setTimeout(() => { if (hudMap === map) map.invalidateSize(); }, 250);

    // 1) Standort
    let loc = null;
    try { loc = await fetchUserLocationData(); } catch (e) {}
    if (hudMap !== map) return;
    if (loc && !loc.fehler && loc.latitude !== undefined) {
        hudMapMe = [loc.latitude, loc.longitude];
        L.marker(hudMapMe, { interactive: false, icon: L.divIcon({ className: '', html: '<div class="hud-me"></div>', iconSize: [16, 16], iconAnchor: [8, 8] }) }).addTo(map);
        map.setView(hudMapMe, 13);
    }

    // 2) Route und Staumeldungen: entweder von der Fahrzeit-Berechnung mitgeliefert oder die Route zur Arbeit
    let data = options.mapData || null;
    if (!data) {
        const work = (typeof workAddress === 'string') ? workAddress : '';
        if (!work) {
            hudMapStatus(hudMapMe
                ? 'Das ist dein Standort. Für die Route zur Arbeit sag: „Merk dir meine Arbeitsadresse" und dann die Adresse.'
                : 'Standort nicht verfügbar. Ist der Standortzugriff erlaubt?');
            return;
        }
        hudMapStatus('Berechne Route zur Arbeit ...');
        data = await fetchRouteMapData(work);
        if (hudMap !== map) return;
    }
    if (!data || !data.coords || data.coords.length < 2) {
        hudMapStatus(hudMapMe ? 'Die Route konnte gerade nicht berechnet werden.' : 'Standort nicht verfügbar. Ist der Standortzugriff erlaubt?');
        return;
    }

    // Route: breite, blasse Linie darunter und schmale, helle darüber - das wirkt wie ein Leuchten
    L.polyline(data.coords, { color: HUD_ROUTE_COLOR, weight: 11, opacity: 0.16, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(hudMapLayers.route);
    L.polyline(data.coords, { color: HUD_ROUTE_COLOR, weight: 3.5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(hudMapLayers.route);
    if (data.to) {
        L.marker([data.to.lat, data.to.lon], { icon: L.divIcon({ className: '', html: '<div class="hud-dest">◎</div>', iconSize: [22, 22], iconAnchor: [11, 11] }) })
            .bindPopup(escapeHtml(String(data.to.label || 'Ziel'))).addTo(hudMapLayers.route);
    }
    (data.warnings || []).forEach(w => {
        const txt = `<b>${escapeHtml(w.road || '')}</b> ${escapeHtml(w.title || '')}` + (w.text ? `<br>${escapeHtml(w.text)}` : '');
        L.marker([w.lat, w.lon], { icon: L.divIcon({ className: '', html: '<div class="hud-warn">⚠</div>', iconSize: [26, 26], iconAnchor: [13, 13] }) })
            .bindPopup(txt).addTo(hudMapLayers.stau);
    });

    const bounds = L.latLngBounds(data.coords);
    if (hudMapMe) bounds.extend(hudMapMe);
    (data.warnings || []).forEach(w => bounds.extend([w.lat, w.lon]));
    map.fitBounds(bounds, { padding: [28, 28], maxZoom: 15 });

    const km = data.km >= 10 ? Math.round(data.km) : Number(data.km).toFixed(1).replace('.', ',');
    const road = (data.autobahnen && data.autobahnen.length) ? ' · ' + data.autobahnen.join(', ') : '';
    const n = (data.warnings || []).length;
    const stau = !(data.autobahnen && data.autobahnen.length) ? 'Keine Autobahn auf der Strecke.'
        : n === 0 ? 'Keine Staumeldungen auf der Strecke.'
        : n === 1 ? '1 Verkehrsmeldung an der Strecke, tippe auf das Warnsymbol.'
        : `${n} Verkehrsmeldungen an der Strecke, tippe auf die Warnsymbole.`;
    hudMapStatus(`${data.fahrtMin} Min. · ${km} km${road} — ${stau}`);
}
