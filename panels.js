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
   HUD-KARTE: Vektorkarte mit leuchtenden Neon-Straßen im Jarvis-Look
   Zeigt deinen Standort, die Route zur Arbeit und Staumeldungen auf der Strecke.
   Kartendaten: OpenFreeMap / OpenStreetMap (kostenlos, ohne Schlüssel), Darstellung: MapLibre GL.
   Die Farben und Leuchtstärken stehen in HUD_THEME und HUD_ROAD_TIERS und lassen sich dort ändern.
   Braucht: travel.js (fetchRouteMapData), briefing.js (fetchUserLocationData)
   ============================================================ */

const MAPLIBRE_VERSION = '4.7.1';
const MAPLIBRE_JS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.js`;
const MAPLIBRE_CSS = `https://cdn.jsdelivr.net/npm/maplibre-gl@${MAPLIBRE_VERSION}/dist/maplibre-gl.css`;
const OFM_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';   // wird nur gelesen, um Schriften und Kachel-Adresse zu übernehmen
const OFM_TILES_URL = 'https://tiles.openfreemap.org/planet';
const OFM_GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';

const HUD_MAP_PULSE = true;    // sanft pulsierender Punkt für den eigenen Standort
const HUD_ROUTE_COLOR = '#49d7ff';
const HUD_WARN_COLOR = '#ff9a44';

const HUD_THEME = {
    background: '#020a12', backgroundOpacity: 0.9,          // Grundfläche (etwas durchsichtig)
    land: '#061421', park: '#041c22',
    water: '#04202e', waterLine: '#0d5573',
    building: '#062431', buildingLine: '#0e5a78',
    glow: '#00d9ff',            // Leuchten um die Straßen
    core: '#b4f6ff',            // helle Mitte der großen Straßen
    coreDim: '#3fb9d6',         // Mitte der kleinen Straßen
    label: '#8eeeff', labelHalo: '#020a12',
    routeGlow: '#00e5ff', routeCore: '#ffffff'
};

/* Straßenklassen: je Stufe ein Leuchten (breit, weich) und eine helle Linie darüber. Zahlen = [Zoomstufe, Breite in Pixel]. */
const HUD_ROAD_TIERS = [
    { key: 'minor', classes: ['tertiary', 'minor', 'service', 'busway', 'bus_guideway'], minzoom: 11,
      glow: [[11, 1.5], [14, 5], [17, 14]], core: [[11, 0.35], [14, 1], [17, 4.5]], glowOpacity: 0.16, color: 'coreDim' },
    { key: 'mid', classes: ['primary', 'secondary'], minzoom: 8,
      glow: [[8, 2], [12, 7], [17, 20]], core: [[8, 0.5], [12, 1.5], [17, 7]], glowOpacity: 0.26, color: 'core' },
    { key: 'major', classes: ['motorway', 'trunk'], minzoom: 4,
      glow: [[4, 2], [9, 7], [13, 15], [17, 32]], core: [[4, 0.5], [9, 1.4], [13, 3.4], [17, 10]], glowOpacity: 0.4, color: 'core' }
];

let hudMap = null;
let hudMapMe = null;                       // [Breite, Länge]
let hudMapMarkers = { route: [], stau: [] };
let hudMapRouteIds = [];
let hudMapVisible = { route: true, stau: true };
let hudMapBase = null;
let mapLibrePromise = null;

function ensureMapLibre() {
    if (window.maplibregl && window.maplibregl.Map) return Promise.resolve();
    if (mapLibrePromise) return mapLibrePromise;
    const cssReady = new Promise((resolve) => {
        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = MAPLIBRE_CSS;
        css.onload = () => resolve();
        css.onerror = () => resolve();
        document.head.appendChild(css);
    });
    const jsReady = new Promise((resolve, reject) => {
        const sc = document.createElement('script');
        sc.src = MAPLIBRE_JS;
        sc.onload = () => resolve();
        sc.onerror = () => reject(new Error('maplibre'));
        document.head.appendChild(sc);
    });
    mapLibrePromise = Promise.all([cssReady, jsReady]).catch(err => { mapLibrePromise = null; throw err; });
    return mapLibrePromise;
}

/* Kachel-Adresse und Schriften von OpenFreeMap übernehmen; ohne Antwort gelten feste Ersatzwerte */
async function loadOfmBase() {
    if (hudMapBase) return hudMapBase;
    const base = { source: { type: 'vector', url: OFM_TILES_URL }, glyphs: OFM_GLYPHS, font: ['Noto Sans Regular'] };
    try {
        const res = await fetch(OFM_STYLE_URL);
        if (res.ok) {
            const st = await res.json();
            if (st.glyphs) base.glyphs = st.glyphs;
            const src = st.sources && (st.sources.openmaptiles || Object.values(st.sources).find(x => x && x.type === 'vector'));
            if (src && (src.url || src.tiles)) base.source = src;
            const exprWords = ['literal', 'get', 'case', 'match', 'step', 'interpolate', 'coalesce'];
            for (const l of (st.layers || [])) {
                const tf = l.layout && l.layout['text-font'];
                if (Array.isArray(tf) && tf.length && tf.every(x => typeof x === 'string') && !exprWords.includes(tf[0])) { base.font = tf; break; }
            }
        }
    } catch (e) { /* Ersatzwerte bleiben */ }
    hudMapBase = base;
    return base;
}

function hudZoomWidth(stops) {
    return ['interpolate', ['exponential', 1.4], ['zoom'], ...stops.flat()];
}

/* Baut den kompletten Kartenstil: dunkle Fläche, leuchtende Straßen, cyanfarbene Beschriftung */
function buildHudStyle(base) {
    const T = HUD_THEME;
    const font = base.font;
    const src = 'openmaptiles';
    const layers = [
        { id: 'hud-bg', type: 'background', paint: { 'background-color': T.background, 'background-opacity': T.backgroundOpacity } },
        { id: 'hud-landuse', type: 'fill', source: src, 'source-layer': 'landuse', paint: { 'fill-color': T.land, 'fill-opacity': 0.6 } },
        { id: 'hud-landcover', type: 'fill', source: src, 'source-layer': 'landcover', paint: { 'fill-color': T.park, 'fill-opacity': 0.8 } },
        { id: 'hud-park', type: 'fill', source: src, 'source-layer': 'park', paint: { 'fill-color': T.park, 'fill-opacity': 0.7 } },
        { id: 'hud-water', type: 'fill', source: src, 'source-layer': 'water', paint: { 'fill-color': T.water } },
        { id: 'hud-water-line', type: 'line', source: src, 'source-layer': 'water', paint: { 'line-color': T.waterLine, 'line-width': 0.8, 'line-opacity': 0.8 } },
        { id: 'hud-waterway', type: 'line', source: src, 'source-layer': 'waterway', paint: { 'line-color': T.waterLine, 'line-width': hudZoomWidth([[8, 0.4], [14, 1.6]]), 'line-opacity': 0.8 } },
        { id: 'hud-building', type: 'fill', source: src, 'source-layer': 'building', minzoom: 14, paint: { 'fill-color': T.building, 'fill-outline-color': T.buildingLine, 'fill-opacity': 0.75 } },
        { id: 'hud-boundary', type: 'line', source: src, 'source-layer': 'boundary', filter: ['<=', ['get', 'admin_level'], 4],
          paint: { 'line-color': T.waterLine, 'line-width': 0.9, 'line-dasharray': [3, 2], 'line-opacity': 0.6 } },
        { id: 'hud-rail', type: 'line', source: src, 'source-layer': 'transportation', minzoom: 8,
          filter: ['==', ['get', 'class'], 'rail'], paint: { 'line-color': T.waterLine, 'line-width': 1, 'line-dasharray': [3, 3], 'line-opacity': 0.8 } }
    ];

    const tierFilter = (t) => ['match', ['get', 'class'], t.classes, true, false];
    // erst alle Leucht-Schichten, dann alle hellen Linien, damit kein Leuchten eine Straße überdeckt
    HUD_ROAD_TIERS.forEach(t => layers.push({
        id: `hud-road-glow-${t.key}`, type: 'line', source: src, 'source-layer': 'transportation', minzoom: t.minzoom, filter: tierFilter(t),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': T.glow, 'line-width': hudZoomWidth(t.glow), 'line-blur': hudZoomWidth(t.glow.map(([z, w]) => [z, w * 0.7])), 'line-opacity': t.glowOpacity }
    }));
    HUD_ROAD_TIERS.forEach(t => layers.push({
        id: `hud-road-core-${t.key}`, type: 'line', source: src, 'source-layer': 'transportation', minzoom: t.minzoom, filter: tierFilter(t),
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': T[t.color], 'line-width': hudZoomWidth(t.core), 'line-opacity': 1 }
    }));
    layers.push({
        id: 'hud-road-path', type: 'line', source: src, 'source-layer': 'transportation', minzoom: 15,
        filter: ['match', ['get', 'class'], ['path', 'track'], true, false],
        paint: { 'line-color': T.coreDim, 'line-width': hudZoomWidth([[15, 0.5], [17, 1.5]]), 'line-dasharray': [2, 2], 'line-opacity': 0.6 }
    });

    const nameField = ['coalesce', ['get', 'name:de'], ['get', 'name']];
    const labelPaint = { 'text-color': T.label, 'text-halo-color': T.labelHalo, 'text-halo-width': 1.6 };
    layers.push({
        id: 'hud-labels-road', type: 'symbol', source: src, 'source-layer': 'transportation_name', minzoom: 12,
        layout: { 'symbol-placement': 'line', 'text-field': ['coalesce', ['get', 'name:de'], ['get', 'name'], ['get', 'ref']], 'text-font': font,
                  'text-size': ['interpolate', ['linear'], ['zoom'], 12, 9, 17, 13], 'text-max-angle': 30 },
        paint: labelPaint
    });
    const place = (id, cls, minzoom, sizeStops, upper) => layers.push({
        id, type: 'symbol', source: src, 'source-layer': 'place', minzoom, filter: ['==', ['get', 'class'], cls],
        layout: { 'text-field': nameField, 'text-font': font, 'text-size': ['interpolate', ['linear'], ['zoom'], ...sizeStops.flat()],
                  'text-transform': upper ? 'uppercase' : 'none', 'text-letter-spacing': upper ? 0.12 : 0, 'text-max-width': 8 },
        paint: labelPaint
    });
    place('hud-place-city', 'city', 4, [[4, 11], [12, 20]], true);
    place('hud-place-town', 'town', 8, [[8, 10], [14, 16]], false);
    place('hud-place-village', 'village', 10, [[10, 9], [15, 13]], false);
    place('hud-place-suburb', 'suburb', 11, [[11, 9], [15, 12]], false);

    return { version: 8, name: 'hud-neon', glyphs: base.glyphs, sources: { [src]: base.source }, layers };
}

function injectHudMapStyles() {
    if (document.getElementById('hudMapStyles')) return;
    const st = document.createElement('style');
    st.id = 'hudMapStyles';
    st.textContent = `
.hud-map-wrap{position:relative;border:1px solid rgba(73,215,255,.4);border-radius:14px;overflow:hidden;background:rgba(0,10,20,.45);box-shadow:0 0 22px rgba(73,215,255,.18),inset 0 0 30px rgba(73,215,255,.08)}
.hud-map-wrap::after{content:'';position:absolute;inset:0;z-index:1;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(73,215,255,.035) 0,rgba(73,215,255,.035) 1px,transparent 1px,transparent 3px),radial-gradient(ellipse at center,transparent 60%,rgba(0,8,16,.5) 100%)}
#hudMap{height:58vh;min-height:300px;background:transparent}
#hudMap .maplibregl-canvas{outline:none}
#hudMap .maplibregl-ctrl-attrib{background:rgba(0,0,0,.55);color:#5d7e91;font-size:9px}
#hudMap .maplibregl-ctrl-attrib a{color:#5d7e91}
#hudMap .maplibregl-popup-content{background:rgba(0,12,24,.94);color:#cfefff;border:1px solid rgba(73,215,255,.5);border-radius:8px;padding:8px 12px;font-size:12px;line-height:1.4}
#hudMap .maplibregl-popup-tip{border-top-color:rgba(0,12,24,.94)!important;border-bottom-color:rgba(0,12,24,.94)!important}
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
    hudMapMe = null;
    hudMapMarkers = { route: [], stau: [] };
    hudMapRouteIds = [];
    hudMapVisible = { route: true, stau: true };
}

function hudMapRenderChips() {
    const el = document.getElementById('hudMapChips');
    if (!el || !hudMap) return;
    const chip = (label, action, off) => `<button class="hud-chip${off ? ' off' : ''}" onclick="playUiBeep(); ${action}">${label}</button>`;
    el.innerHTML = chip('Route', "hudMapToggle('route')", !hudMapVisible.route) +
        chip('Stau', "hudMapToggle('stau')", !hudMapVisible.stau) +
        chip('Mein Standort', 'hudMapCenter()', false);
}

function hudMapToggle(name) {
    if (!hudMap || !(name in hudMapVisible)) return;
    hudMapVisible[name] = !hudMapVisible[name];
    if (name === 'route') {
        hudMapRouteIds.forEach(id => { if (hudMap.getLayer(id)) hudMap.setLayoutProperty(id, 'visibility', hudMapVisible.route ? 'visible' : 'none'); });
    }
    (hudMapMarkers[name] || []).forEach(m => { m.getElement().style.display = hudMapVisible[name] ? '' : 'none'; });
    hudMapRenderChips();
}

function hudMapCenter() {
    if (hudMap && hudMapMe) hudMap.easeTo({ center: [hudMapMe[1], hudMapMe[0]], zoom: Math.max(hudMap.getZoom(), 13) });
}

/* Punkt auf der Karte; der äußere Kasten gehört MapLibre (Position), der innere ist das Leucht-Symbol */
function hudAddMarker(cls, inner, lat, lon, popupHtml, group) {
    const el = document.createElement('div');
    const dot = document.createElement('div');
    dot.className = cls;
    dot.innerHTML = inner;
    el.appendChild(dot);
    const m = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lon, lat]);
    if (popupHtml) m.setPopup(new maplibregl.Popup({ offset: 16, closeButton: false }).setHTML(popupHtml));
    m.addTo(hudMap);
    if (group) hudMapMarkers[group].push(m);
    return m;
}

async function initHudMap(options = {}) {
    if (!document.getElementById('hudMap') || !isPanelOpen() || currentPanel.name !== 'karte') return;
    hudMapDestroy();
    hudMapStatus('Lade Karte ...');
    try {
        await ensureMapLibre();
    } catch (e) {
        hudMapStatus('Das Kartenprogramm konnte nicht geladen werden. Besteht eine Internetverbindung?');
        return;
    }
    const base = await loadOfmBase();
    const el = document.getElementById('hudMap');
    if (!el || !isPanelOpen() || currentPanel.name !== 'karte') return;
    injectHudMapStyles();

    let map;
    try {
        map = new maplibregl.Map({
            container: el, style: buildHudStyle(base), center: [10.0, 53.55], zoom: 10,
            attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0
        });
        map.addControl(new maplibregl.AttributionControl({ compact: true }));
        map.touchZoomRotate.disableRotation();
    } catch (e) {
        console.error('Karte konnte nicht gestartet werden', e);
        hudMapStatus('Die Karte konnte nicht aufgebaut werden. Unterstützt der Browser WebGL?');
        return;
    }
    hudMap = map;
    hudMapRenderChips();
    let ready = false;
    const loaded = new Promise(resolve => map.once('load', () => { ready = true; resolve(); }));
    setTimeout(() => { if (hudMap === map && !ready) hudMapStatus('Die Karte lädt nur langsam. Besteht eine Internetverbindung?'); }, 12000);

    // 1) Standort
    let loc = null;
    try { loc = await fetchUserLocationData(); } catch (e) {}
    if (hudMap !== map) return;
    if (loc && !loc.fehler && loc.latitude !== undefined) {
        hudMapMe = [loc.latitude, loc.longitude];
        hudAddMarker('hud-me', '', loc.latitude, loc.longitude, null, null);
        map.jumpTo({ center: [loc.longitude, loc.latitude], zoom: 13 });
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

    await Promise.race([loaded, new Promise(r => setTimeout(r, 15000))]);
    if (hudMap !== map) return;
    if (!ready) { hudMapStatus('Die Karte konnte nicht geladen werden. Besteht eine Internetverbindung?'); return; }

    // Route: breites weiches Leuchten, engere Glut und eine weiße Mitte - wie ein Neonrohr
    const line = data.coords.map(c => [c[1], c[0]]);   // Karte will [Länge, Breite]
    try {
        map.addSource('hud-route', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'LineString', coordinates: line } } });
        const before = map.getLayer('hud-labels-road') ? 'hud-labels-road' : undefined;
        [['hud-route-glow', 20, 12, 0.5, HUD_THEME.routeGlow], ['hud-route-mid', 8, 3, 0.85, HUD_THEME.routeGlow], ['hud-route-core', 3.2, 0, 1, HUD_THEME.routeCore]]
            .forEach(([id, w, b, o, c]) => {
                map.addLayer({ id, type: 'line', source: 'hud-route', layout: { 'line-cap': 'round', 'line-join': 'round' },
                               paint: { 'line-color': c, 'line-width': w, 'line-blur': b, 'line-opacity': o } }, before);
                hudMapRouteIds.push(id);
            });
    } catch (e) {
        console.error('Route konnte nicht gezeichnet werden', e);
        hudMapStatus('Die Route konnte nicht gezeichnet werden.');
        return;
    }
    if (data.to) hudAddMarker('hud-dest', '◎', data.to.lat, data.to.lon, escapeHtml(String(data.to.label || 'Ziel')), 'route');
    (data.warnings || []).forEach(w => {
        const txt = `<b>${escapeHtml(w.road || '')}</b> ${escapeHtml(w.title || '')}` + (w.text ? `<br>${escapeHtml(w.text)}` : '');
        hudAddMarker('hud-warn', '⚠', w.lat, w.lon, txt, 'stau');
    });

    const bounds = new maplibregl.LngLatBounds(line[0], line[0]);
    line.forEach(pt => bounds.extend(pt));
    if (hudMapMe) bounds.extend([hudMapMe[1], hudMapMe[0]]);
    (data.warnings || []).forEach(w => bounds.extend([w.lon, w.lat]));
    map.fitBounds(bounds, { padding: 32, maxZoom: 15, duration: 0 });

    const km = data.km >= 10 ? Math.round(data.km) : Number(data.km).toFixed(1).replace('.', ',');
    const road = (data.autobahnen && data.autobahnen.length) ? ' · ' + data.autobahnen.join(', ') : '';
    const n = (data.warnings || []).length;
    const stau = !(data.autobahnen && data.autobahnen.length) ? 'Keine Autobahn auf der Strecke.'
        : n === 0 ? 'Keine Staumeldungen auf der Strecke.'
        : n === 1 ? '1 Verkehrsmeldung an der Strecke, tippe auf das Warnsymbol.'
        : `${n} Verkehrsmeldungen an der Strecke, tippe auf die Warnsymbole.`;
    hudMapStatus(`${data.fahrtMin} Min. · ${km} km${road} — ${stau}`);
}
