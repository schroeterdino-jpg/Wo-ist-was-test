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
    menu: '☰ Menü'
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
const PANEL_DYNAMIC = ['termine', 'erinnerungen', 'menu'];
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

    panelClosing = false;
    currentPanel = { name, options };
    panelLastHtml = '';
    body.innerHTML = '';
    body.classList.add('animate');
    layer.classList.remove('closing');

    if (PANEL_DYNAMIC.includes(name)) {
        const built = buildDynamicPanel(name, options);
        titleEl.textContent = built.title;
        body.innerHTML = built.html;
        panelLastHtml = built.html;
        // Google-Kalender im Hintergrund auffrischen; refreshOpenPanel() zeichnet dann ohne Animation neu
        // erst NACH dem Einfliegen, sonst ruckelt die Animation, wenn die Daten mitten drin ankommen
        if (name !== 'menu' && typeof accessToken !== 'undefined' && accessToken && typeof fetchGoogleCalendarEvents === 'function') {
            setTimeout(() => { if (isPanelOpen()) fetchGoogleCalendarEvents(); }, PANEL_FLY_MS);
        }
    } else {
        titleEl.textContent = PANEL_TITLES[name];
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
