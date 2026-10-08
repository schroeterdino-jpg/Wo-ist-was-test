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
                return original.apply(this, arguments);
            };
            wrapped._pushsync = true;
            window.onLocalDataChanged = wrapped;
        }
    } catch (e) {}

    setInterval(alive, 2 * 60 * 1000);          // Lebenszeichen alle 2 Minuten (Server rechnet 4,5 Minuten Toleranz)
    setInterval(() => send(false), 10 * 60 * 1000);   // Google-Termine ändern sich auch ohne Speicherung: regelmäßig vergleichen
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) { alive(); schedule(3000); }
        else { try { if (on()) post('push_gone', {}, true).catch(() => {}); } catch (e) {} }   // App verlassen: ab jetzt schickt der Server
    });
    setTimeout(() => { alive(); send(true); }, 20000);   // kurz nach dem Start

    window.jvPushSyncNow = () => send(true);
    window._pushsyncTest = { build, send, alive };
})();
