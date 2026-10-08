/* ============================================================
   PUSH: Benachrichtigungen aufs Handy, auch bei geschlossener App (Schritt 1: anmelden und testen)
   ============================================================
   - "Benachrichtigungen an": zeigt eine Karte "Erlauben" (der Tipp ist nötig, Android verlangt ihn). Danach ist das Handy angemeldet.
   - "Sende eine Test-Nachricht": der Server schickt eine Nachricht; sie muss auch bei geschlossener App ankommen.
   - "Benachrichtigungen aus": meldet das Handy wieder ab. "Status Benachrichtigungen": sagt, ob sie an sind.
   Braucht: storage.js (apiFetch), commands.js, places.js (showActionCards), voice.js (speak); serverseitig api/sync.js (Aktionen push_*),
   sw.js im Hauptordner, Umgebungsvariablen VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY. Fehlt etwas davon, sagt Jarvis es ehrlich.
   Ändert nichts an Briefing, Terminen oder Erinnerungen.
   ============================================================ */
(function () {
    'use strict';
    const FLAG = 'jv_push';   // '1' = angemeldet

    function say(t) { try { if (typeof speak === 'function') speak(t); } catch (e) {} }
    function card(title, sub, onclick) {
        try { if (typeof showActionCards === 'function') showActionCards([{ icon: '🔔', title, subtitle: sub || '', onclick }]); } catch (e) {}
    }
    function supported() { return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
    function b64ToBytes(s) {
        const pad = '='.repeat((4 - s.length % 4) % 4);
        const raw = atob((s + pad).replace(/-/g, '+').replace(/_/g, '/'));
        const out = new Uint8Array(raw.length);
        for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
        return out;
    }
    async function registration() {
        const reg = await Promise.race([navigator.serviceWorker.ready, new Promise((_, rej) => setTimeout(() => rej(new Error('sw')), 8000))]);
        return reg;
    }
    async function api(action, opts) {
        const res = await apiFetch('/api/sync?action=' + action, opts || {});
        let j = {}; try { j = await res.json(); } catch (e) {}
        if (!res.ok) { const err = new Error(j.error || ('Fehler ' + res.status)); err.server = true; throw err; }
        return j;
    }
    function postJson(obj) { return { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(obj || {}) }; }

    async function enable() {
        try {
            if (!supported()) { say('Dieses Gerät oder dieser Browser kann keine Benachrichtigungen bekommen. Auf dem Handy bitte die installierte App in Chrome öffnen.'); return false; }
            const perm = await Notification.requestPermission();
            if (perm !== 'granted') { say('Ohne Erlaubnis kann ich dir keine Nachrichten schicken. Du kannst sie in den Handy-Einstellungen unter Apps, Jarvis, Benachrichtigungen erlauben.'); return false; }
            const key = (await api('push_key')).publicKey;
            const reg = await registration();
            let sub = await reg.pushManager.getSubscription();
            if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) });
            await api('push_subscribe', postJson({ subscription: sub.toJSON() }));
            try { setPersistentData(FLAG, '1'); } catch (e) {}
            say('Fertig, dein Handy ist für Benachrichtigungen angemeldet. Sag „Sende eine Test-Nachricht“, um es auszuprobieren.');
            return true;
        } catch (e) {
            console.error('Push anmelden', e);
            say(e && e.message === 'sw' ? 'Die Hintergrund-Datei der App ist noch nicht bereit. Bitte lade die App einmal neu und versuche es noch einmal.'
                : e && e.server ? 'Das hat der Server abgelehnt: ' + e.message : 'Das Anmelden hat nicht geklappt. Bitte versuche es später noch einmal.');
            return false;
        }
    }
    async function disable() {
        try {
            if (supported()) {
                const reg = await registration();
                const sub = await reg.pushManager.getSubscription();
                if (sub) { try { await api('push_unsubscribe', postJson({ endpoint: sub.endpoint })); } catch (e) {} await sub.unsubscribe(); }
            }
        } catch (e) {}
        try { setPersistentData(FLAG, ''); } catch (e) {}
        say('Okay, Benachrichtigungen sind aus. Dein Handy ist abgemeldet.');
    }
    async function test() {
        try {
            if (getPersistentData(FLAG, '') !== '1') { say('Dein Handy ist noch nicht angemeldet. Sag „Benachrichtigungen an“.'); return; }
            const r = await api('push_test', postJson({}));
            if (r.ok) say('Die Test-Nachricht ist unterwegs. Schließe die App und warte ein paar Sekunden.');
            else say(r.error ? r.error + '. Sag „Benachrichtigungen an“, um dich neu anzumelden.' : 'Die Nachricht konnte nicht zugestellt werden.');
        } catch (e) {
            say(e && e.server ? 'Das hat der Server abgelehnt: ' + e.message : 'Die Test-Nachricht konnte nicht gesendet werden.');
        }
    }
    function status() {
        const on = getPersistentData(FLAG, '') === '1';
        const perm = (typeof Notification !== 'undefined') ? Notification.permission : 'nicht möglich';
        say(on ? 'Benachrichtigungen sind an.' : 'Benachrichtigungen sind aus.' + (perm === 'denied' ? ' Sie sind in den Handy-Einstellungen gesperrt.' : ''));
    }

    window.jvPushEnable = enable; window.jvPushDisable = disable; window.jvPushTest = test; window.jvPushStatus = status;

    const norm = s => String(s || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();
    function handler(text, next) {
        const t = norm(text);
        if (/(?:test|probe).{0,12}(?:nachricht|benachrichtigung|push)|(?:sende|schick)\w* .{0,12}(?:test|push)/.test(t)) { test(); return true; }
        if (/(?:benachrichtigung|push)\w*/.test(t)) {
            if (/status|sind .*an|an oder aus|eingeschaltet/.test(t) && !/schalt\w* .*(?:an|ein)\b/.test(t)) { status(); return true; }
            if (/\b(?:aus|ab|deaktivier\w*|abmeld\w*|stopp?|nicht mehr)\b/.test(t)) { disable(); return true; }
            if (/\b(?:an|ein|aktivier\w*|erlaub\w*|anmeld\w*|einricht\w*|starten?)\b/.test(t)) {
                card('Benachrichtigungen erlauben', 'Hier tippen, dann auf „Zulassen“', 'jvPushEnable()');
                say('Tippe unten auf die Karte und erlaube die Benachrichtigungen.');
                return true;
            }
        }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('push', handler, 30);
    window._pushTest = { handler, b64ToBytes };
})();
