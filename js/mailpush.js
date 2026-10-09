/* ============================================================
   MAIL-PUSH EINRICHTEN: damit Jarvis dich auch bei GESCHLOSSENER App über neue wichtige E-Mails informiert.
   Sagen: "Mail Push einrichten" -> es erscheint ein Knopf, den du einmal antippst und bei Google bestätigst (nur Mails lesen).
   Sagen: "Mail Push Status" -> Jarvis sagt, ob die Verbindung steht und wann zuletzt nachgesehen wurde.
   Der Server (api/sync.js) braucht bei Vercel GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET. Jarvis liest nur, verändert nichts.
   Braucht: storage.js (getPersistentData), voice.js (speak), das Google-Skript (accounts.google.com/gsi/client) aus index.html.
   ============================================================ */
(function () {
    'use strict';
    const SCOPE = 'https://www.googleapis.com/auth/gmail.readonly';
    const say = t => { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} };
    const zeigen = o => { try { if (window.jvPanel) window.jvPanel.zeigen(o); } catch (e) {} };
    const clientId = () => { try { return getPersistentData('google_client_id', typeof DEFAULT_CLIENT_ID !== 'undefined' ? DEFAULT_CLIENT_ID : ''); } catch (e) { return ''; } };
    let box = null;

    function weg() { if (box) { try { box.remove(); } catch (e) {} box = null; } }

    async function senden(code) {
        try {
            const r = await apiFetch('/api/sync?action=push_mail_connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }) });
            const d = await r.json().catch(() => ({}));
            if (r.ok && d.ok) { zeigen({ titel: 'MAIL-PUSH', zeit: 'VERBUNDEN', text: 'Neue wichtige E-Mails melden sich jetzt auch bei geschlossener App.', sek: 10 }); say('Die Mail-Meldung ist eingerichtet. Ich melde mich jetzt auch bei geschlossener App.'); }
            else { zeigen({ titel: 'MAIL-PUSH', zeit: 'FEHLER', text: String(d.error || ('Status ' + r.status)), sek: 15 }); say('Das Einrichten hat nicht geklappt. Der Grund steht im Fenster.'); }
        } catch (e) { zeigen({ titel: 'MAIL-PUSH', zeit: 'FEHLER', text: (e && e.userMessage) || 'keine Verbindung', sek: 12 }); }
    }

    async function verbinden() {
        try {
            let cid = clientId();
            try { const r0 = await apiFetch('/api/sync?action=push_mail_status'); const d0 = await r0.json(); if (d0 && d0.clientId) cid = d0.clientId; } catch (e) {}
            if (!window.google || !google.accounts || !google.accounts.oauth2 || !google.accounts.oauth2.initCodeClient) { zeigen({ titel: 'MAIL-PUSH', zeit: 'FEHLER', text: 'Google-Anmeldung ist nicht geladen. Bitte kurz warten und noch einmal versuchen.', sek: 10 }); return; }
            const c = google.accounts.oauth2.initCodeClient({
                client_id: cid, scope: SCOPE, ux_mode: 'popup',
                callback: resp => { weg(); if (resp && resp.code) senden(resp.code); else zeigen({ titel: 'MAIL-PUSH', zeit: 'ABGEBROCHEN', text: (resp && resp.error) || 'Keine Freigabe erhalten.', sek: 10 }); },
                error_callback: () => { zeigen({ titel: 'MAIL-PUSH', zeit: 'ABGEBROCHEN', text: 'Die Google-Anmeldung wurde nicht abgeschlossen.', sek: 10 }); }
            });
            c.requestCode();
        } catch (e) { zeigen({ titel: 'MAIL-PUSH', zeit: 'FEHLER', text: String(e && e.message || e), sek: 10 }); }
    }

    function knopf() {
        weg();
        box = document.createElement('div');
        box.style.cssText = 'position:fixed;left:12px;right:12px;bottom:90px;z-index:2147483000;background:rgba(6,20,34,.96);border:1px solid #5ee7ff;border-radius:10px;padding:14px;color:#d8f6ff;font:14px ui-monospace,Menlo,monospace;text-align:center';
        const t = document.createElement('div'); t.textContent = 'Jarvis darf deine Mails lesen (nur lesen), damit er dich bei neuen wichtigen Mails auch bei geschlossener App meldet.'; t.style.marginBottom = '10px';
        const b = document.createElement('button'); b.textContent = 'MIT GOOGLE VERBINDEN';
        b.style.cssText = 'background:#0b3a4a;color:#5ee7ff;border:1px solid #5ee7ff;border-radius:8px;padding:12px 16px;font:700 14px ui-monospace,monospace;width:100%';
        b.addEventListener('click', verbinden);
        const x = document.createElement('button'); x.textContent = 'Abbrechen'; x.style.cssText = 'margin-top:8px;background:none;border:0;color:#8fb4c2;font:13px ui-monospace,monospace';
        x.addEventListener('click', weg);
        box.appendChild(t); box.appendChild(b); box.appendChild(x); document.body.appendChild(box);
    }

    async function status() {
        try {
            const r = await apiFetch('/api/sync?action=push_mail_status');
            const d = await r.json().catch(() => ({}));
            if (!r.ok) { say('Der Status ist nicht abrufbar.'); zeigen({ titel: 'MAIL-PUSH', zeit: 'FEHLER', text: String(d.error || ('Status ' + r.status)), sek: 10 }); return; }
            const min = d.letztePruefung ? Math.round((Date.now() - d.letztePruefung) / 60000) : null;
            const z = [
                { ok: !!d.secretOk, text: 'Server-Zugangsdaten bei Vercel' },
                { ok: !!d.verbunden, text: d.verbunden ? 'Mit Google verbunden' : 'Noch nicht verbunden' },
                { ok: min !== null && min < 15 && !d.fehler, text: min === null ? 'Noch nie geprüft' : 'Zuletzt geprüft vor ' + min + ' Min.' }
            ];
            if (d.fehler) z.push({ ok: false, text: d.fehler });
            const ok = z.every(x => x.ok);
            zeigen({ titel: 'MAIL-PUSH', zeit: ok ? 'ALLES OK' : 'PRÜFEN', zeilen: z, sek: 15 });
            say(ok ? 'Die Mail-Meldung läuft.' : (!d.verbunden ? 'Die Mail-Meldung ist noch nicht eingerichtet.' : 'Bei der Mail-Meldung gibt es ein Problem. Die Einzelheiten stehen im Fenster.'));
        } catch (e) { say('Der Status ist nicht abrufbar.'); }
    }

    window.jvMailPush = { einrichten: knopf, status };
    if (window.jvCommands) {
        window.jvCommands.use('mailpush', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (t.length < 50) {
                if (/^(?:jarvis )?(?:(?:richte|richt) )?(?:die )?(?:e ?mail|mail|gmail)(?: ?(?:push|meldung|benachrichtigung))?(?: einrichten| verbinden| aktivieren)$|^(?:jarvis )?(?:e ?mail|mail) ?push (?:einrichten|verbinden)$/.test(t) || /^(?:jarvis )?mail ?push (?:einrichten|verbinden|aktivieren)$/.test(t)) { knopf(); say('Tippe unten auf den Knopf und bestätige bei Google.'); return true; }
                if (/^(?:jarvis )?(?:(?:e ?)?mail ?push|mail meldung) (?:status|prüfen|test)$/.test(t)) { status(); return true; }
            }
            return next(text);
        }, 30);
    }
})();
