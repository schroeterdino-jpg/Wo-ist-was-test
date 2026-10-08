/* ============================================================
   PUSHSYNC: meldet dem Server deine Erinnerungen und Termine, damit er dich auch bei geschlossener App benachrichtigen kann
   ============================================================
   - Schickt (nur wenn "Benachrichtigungen an" gemacht wurde, Schlüssel jv_push = 1) eine kleine Liste: Titel und Zeit der nächsten 14 Tage.
     Erinnerungen (noch nicht ausgelöst) und Termine mit Uhrzeit (keine Geburtstage, keine ganztägigen). Keine Orte, keine Notizen.
   - Schickt jede Minute ein Lebenszeichen, solange die App offen UND sichtbar ist. Dann spricht Jarvis wie bisher selbst und der Server
     schickt nichts (kein Doppeltes). Ist die App zu, übernimmt der Server (api/sync.js, Aktion push_due, jede Minute von cron-job.org).
   - Serverseitig: Erinnerung zur eingestellten Zeit; Termine 15 Minuten vorher (nachts 22-7 Uhr nicht).
   Braucht: storage.js (apiFetch), push.js (Anmeldung), calendar.js (reminderEntries, calendarEntries), briefing.js (isBirthdayEntry), sync.js (onLocalDataChanged).
   Fehlt etwas, tut die Datei still nichts. Muss nach push.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    const HORIZON_MS = 14 * 86400000;
    const MAX_ITEMS = 150;
    let lastHash = '';
    let timer = null;
    let cfgTimer = null;

    function on() { try { return getPersistentData('jv_push', '') === '1'; } catch (e) { return false; } }

    function build() {
        const now = Date.now(), items = [];
        try {
            (typeof reminderEntries !== 'undefined' ? reminderEntries : []).forEach(r => {
                if (!r || r.triggered || !r.time) return;
                const at = new Date(r.time).getTime();
                if (isNaN(at) || at < now - 15 * 60000 || at > now + HORIZON_MS) return;
                items.push({ id: 'r' + r.id, k: 'r', x: String(r.text || 'Erinnerung').slice(0, 140), at });
            });
        } catch (e) {}
        try {
            (typeof calendarEntries !== 'undefined' ? calendarEntries : []).forEach(c => {
                if (!c || !c.isoDate || !/T/.test(c.isoDate)) return;   // nur mit Uhrzeit
                if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(c)) return;
                const at = new Date(c.isoDate).getTime();
                if (isNaN(at) || at < now || at > now + HORIZON_MS) return;
                items.push({ id: 'e' + c.id, k: 'e', x: String(c.text || 'Termin').slice(0, 140), at });
            });
        } catch (e) {}
        items.sort((a, b) => a.at - b.at);
        return items.slice(0, MAX_ITEMS);
    }

    async function post(action, body, keepalive) {
        const res = await apiFetch('/api/sync?action=' + action, { method: 'POST', keepalive: !!keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        return res.ok;
    }

    async function send(force) {
        try {
            if (!on() || typeof apiFetch !== 'function') return;
            const items = build();
            const hash = JSON.stringify(items.map(i => [i.id, i.at, i.x]));
            if (!force && hash === lastHash) return;
            if (await post('push_items', { items })) lastHash = hash;
        } catch (e) {}
    }
    function schedule(ms) { clearTimeout(timer); timer = setTimeout(() => send(false), ms); }

    /* ---------- Schichtplan und Strecke zur Arbeit (für die Briefing-Nachricht des Servers) ---------- */
    const ROUTE_KEY = 'jv_push_route';   // { day, home, work, data } - einmal pro Tag und Adresspaar
    let lastCfgHash = '';
    function today() { try { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); } catch (e) { return ''; } }

    async function routeToWork() {
        try {
            const home = (typeof homeAddress === 'string') ? homeAddress : '', work = (typeof workAddress === 'string') ? workAddress : '';
            if (!home || !work || typeof geocodeAddress !== 'function' || typeof routeDurationSeconds !== 'function') return null;
            let c = null;
            try { c = JSON.parse(getPersistentData(ROUTE_KEY, '') || 'null'); } catch (e) {}
            if (c && c.day === today() && c.home === home && c.work === work && c.data) return c.data;
            const a = await geocodeAddress(home), b = await geocodeAddress(work);
            if (!a || !b) return (c && c.home === home && c.work === work) ? c.data : null;
            const r = await routeDurationSeconds(a.lat, a.lon, b.lat, b.lon);
            if (!r) return (c && c.home === home && c.work === work) ? c.data : null;
            const data = { fahrtMin: Math.round(r.seconds / 60), km: Math.round(r.meters / 1000), autobahnen: (r.autobahnen || []).slice(0, 2), from: { lat: a.lat, lon: a.lon }, to: { lat: b.lat, lon: b.lon } };
            try { setPersistentData(ROUTE_KEY, JSON.stringify({ day: today(), home, work, data })); } catch (e) {}
            return data;
        } catch (e) { return null; }
    }
    async function sendConfig(force) {
        try {
            if (!on() || typeof apiFetch !== 'function') return;
            let schicht = null;
            try { const o = JSON.parse(getPersistentData('jv_schicht', '') || 'null'); if (o && typeof o.base === 'number') schicht = o; } catch (e) {}
            const route = await routeToWork();
            const body = { schicht, route, name: (typeof currentUserName === 'string') ? currentUserName : '' };
            const hash = JSON.stringify(body);
            if (!force && hash === lastCfgHash) return;
            if (await post('push_config', body)) lastCfgHash = hash;
        } catch (e) {}
    }

    async function alive() {
        try {
            if (!on() || document.hidden || typeof apiFetch !== 'function') return;
            await post('push_alive', {});
        } catch (e) {}
    }

    /* Änderungen an Erinnerungen und Terminen bemerken (sync.js ruft onLocalDataChanged bei jeder Speicherung) */
    try {
        const original = window.onLocalDataChanged;
        if (typeof original === 'function' && !original._pushsync) {
            const wrapped = function (key) {
                try { if (key === 'helfer_reminders' || key === 'helfer_calendar_entries') schedule(4000); } catch (e) {}
                try { if (key === 'jv_schicht' || key === 'helfer_work_address' || key === 'helfer_home_address') { clearTimeout(cfgTimer); cfgTimer = setTimeout(() => sendConfig(false), 4000); } } catch (e) {}
                return original.apply(this, arguments);
            };
            wrapped._pushsync = true;
            window.onLocalDataChanged = wrapped;
        }
    } catch (e) {}

    setInterval(alive, 2 * 60 * 1000);          // Lebenszeichen alle 2 Minuten (Server rechnet 4,5 Minuten Toleranz)
    setInterval(() => { send(false); sendConfig(false); }, 10 * 60 * 1000);   // Google-Termine ändern sich auch ohne Speicherung: regelmäßig vergleichen
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { alive(); schedule(3000); }
        else { try { if (on()) post('push_gone', {}, true).catch(() => {}); } catch (e) {} }   // App verlassen: ab jetzt schickt der Server
    });
    setTimeout(() => { alive(); send(true); sendConfig(true); }, 20000);   // kurz nach dem Start

    window.jvPushSyncNow = () => { send(true); sendConfig(true); };
    window._pushsyncTest = { build, send, alive, sendConfig, routeToWork };
})();
