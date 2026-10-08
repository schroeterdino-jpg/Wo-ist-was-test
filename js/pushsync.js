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
                if (r.done) return;
                const imp = r.important ? 1 : 0;
                if (isNaN(at) || at < now - (imp ? 70 : 15) * 60000 || at > now + HORIZON_MS) return;   // wichtige: Server fragt bis zu 60 Min. nach
                const o = { id: 'r' + r.id, k: 'r', x: String(r.text || 'Erinnerung').slice(0, 140), at };
                if (imp) o.i = 1;
                items.push(o);
            });
        } catch (e) {}
        try {
            (typeof calendarEntries !== 'undefined' ? calendarEntries : []).forEach(c => {
                if (!c || !c.isoDate || !/T/.test(c.isoDate)) return;   // nur mit Uhrzeit
                if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(c)) return;
                const at = new Date(c.isoDate).getTime();
                if (isNaN(at) || at < now || at > now + HORIZON_MS) return;
                const o = { id: 'e' + c.id, k: 'e', x: String(c.text || 'Termin').slice(0, 140), at };
                if (c.location && String(c.location).trim()) o.l = String(c.location).trim().slice(0, 120);   // nur für die Abfahrtszeit
                items.push(o);
            });
        } catch (e) {}
        items.sort((a, b) => a.at - b.at);
        return items.slice(0, MAX_ITEMS);
    }

    async function post(action, body, keepalive) {
        const res = await apiFetch('/api/sync?action=' + action, { method: 'POST', keepalive: !!keepalive, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        return res.ok;
    }

    /* Orte der Termine mit der App-eigenen Ortssuche finden (gleiche wie bei Fahrzeit) und dem Server mitgeben */
    const GEO_KEY = 'jv_push_geo';
    async function addGeo(items) {
        try {
            if (typeof geocodeDestination !== 'function') return;
            let cache = {}; try { cache = JSON.parse(getPersistentData(GEO_KEY, '') || '{}') || {}; } catch (e) {}
            let lookups = 0, changed = false;
            for (const it of items) {
                if (!it.l) continue;
                const key = it.l.toLowerCase();
                let g = cache[key];
                if (!g && lookups < 4) {
                    lookups++;
                    try { const f = await geocodeDestination(it.l, ''); if (f && isFinite(f.lat) && isFinite(f.lon)) { g = cache[key] = { lat: Math.round(f.lat * 1e5) / 1e5, lon: Math.round(f.lon * 1e5) / 1e5 }; changed = true; } } catch (e) {}
                }
                if (g) it.g = g;
            }
            if (changed) { const keys = Object.keys(cache); if (keys.length > 40) keys.slice(0, keys.length - 40).forEach(k => delete cache[k]); try { setPersistentData(GEO_KEY, JSON.stringify(cache)); } catch (e) {} }
        } catch (e) {}
    }

    async function send(force) {
        try {
            if (!on() || typeof apiFetch !== 'function') return;
            const items = build();
            await addGeo(items);
            const hash = JSON.stringify(items.map(i => [i.id, i.at, i.x, i.l || '', i.i || 0, i.g ? 1 : 0]));
            if (!force && hash === lastHash) return;
            const res = await apiFetch('/api/sync?action=push_items', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) });
            if (res.ok) {
                lastHash = hash;
                try { applyDone((await res.json()).done); } catch (e) {}
            }
        } catch (e) {}
    }
    /* Am Sperrbildschirm auf "Erledigt" getippt: Erinnerung hier auch als erledigt markieren */
    function applyDone(ids) {
        if (!Array.isArray(ids) || !ids.length || typeof reminderEntries === 'undefined') return;
        let changed = false;
        reminderEntries.forEach(r => {
            if (r && !r.done && ids.indexOf('r' + r.id) >= 0) { r.done = true; r.triggered = true; r.nextNagAt = null; changed = true; }
        });
        if (changed) { try { if (typeof saveReminders === 'function') saveReminders(); else if (typeof setPersistentData === 'function') setPersistentData('helfer_reminders', JSON.stringify(reminderEntries)); } catch (e) {} }
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

    /* Standort für die Abfahrtszeit: nur solange die App offen ist; der Server nimmt den letzten Wert (höchstens 3 Stunden alt) */
    let lastLocAt = 0;
    async function reportLocation() {
        try {
            if (!on() || document.hidden || typeof apiFetch !== 'function' || !navigator.geolocation) return;
            if (Date.now() - lastLocAt < 4 * 60000) return;
            lastLocAt = Date.now();
            let pos;
            try { pos = await getPosition({ timeout: 10000, enableHighAccuracy: false, maximumAge: 120000 }); } catch (e) { return; }
            await post('push_loc', { lat: pos.coords.latitude, lon: pos.coords.longitude });
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

    setInterval(() => { alive(); reportLocation(); }, 2 * 60 * 1000);          // Lebenszeichen alle 2 Minuten (Server rechnet 4,5 Minuten Toleranz)
    setInterval(() => { send(false); sendConfig(false); }, 10 * 60 * 1000);   // Google-Termine ändern sich auch ohne Speicherung: regelmäßig vergleichen
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { alive(); reportLocation(); schedule(3000); }
        else { try { if (on()) post('push_gone', {}, true).catch(() => {}); } catch (e) {} }   // App verlassen: ab jetzt schickt der Server
    });
    setTimeout(() => { alive(); reportLocation(); send(true); sendConfig(true); }, 20000);   // kurz nach dem Start

    window.jvPushSyncNow = () => { send(true); sendConfig(true); };
    window._pushsyncTest = { applyDone, reportLocation, build, send, alive, sendConfig, routeToWork };
})();
