/* ============================================================
   MAIL-MELDUNG: Ist die App offen, schaut sie alle paar Minuten nach neuen, wichtigen E-Mails (ohne Werbung) und meldet sich:
   "Sie haben eine E-Mail von Anna. Betreff: ... Soll ich sie vorlesen?" -> "Ja" -> Jarvis liest sie vor und fragt "Wollen Sie antworten?" -> "Ja" -> Gmail öffnet sich mit einer Antwort.
   Jarvis liest nur und verschickt nie etwas; die E-Mail bleibt im Postfach ungelesen, die App merkt sich aber, dass sie sie gemeldet hat.
   Meldet sich nicht, solange Jarvis spricht, verarbeitet oder zuhört; dann wird es später nachgeholt. Läuft nur bei offener, sichtbarer App.
   Ohne Google-Verbindung bleibt alles still. Per Sprache: "E-Mail-Meldung aus" / "E-Mail-Meldung an".
   Braucht: mail.js (fetchEmailOverview, fetchEmailFullText, gmailFetch), calendar.js (accessToken), voice.js (speak). Muss nach mail.js und localcommands.js geladen werden.
   ============================================================ */
(function () {
    const CHECK_EVERY_MS = 3 * 60 * 1000;
    const FIRST_CHECK_MS = 25 * 1000;
    const RETRY_BUSY_MS = 20 * 1000;
    const ANSWER_WINDOW_MS = 90 * 1000;
    const SEEN_KEY = 'jv_mailwatch_seen';
    const ON_KEY = 'jv_mailwatch_on';

    let queue = [];                 // gemeldete, noch nicht behandelte Mails
    let state = null;               // { step: 'read' | 'reply', mail, until }
    let timer = null;
    let checking = false;

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function enabled() { return lsGet(ON_KEY) !== '0'; }
    function loadSeen() { try { const v = JSON.parse(lsGet(SEEN_KEY) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
    function saveSeen(list) { lsSet(SEEN_KEY, JSON.stringify(list.slice(-200))); }

    function say(text) {
        try { speak(text, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { console.error('Mail-Meldung', e); }
    }
    function busy() {
        try {
            if (typeof document !== 'undefined' && document.hidden) return true;
            if (typeof isProcessing !== 'undefined' && isProcessing) return true;
            if (typeof isSpeaking === 'function' && isSpeaking()) return true;
            if (typeof recordBtn !== 'undefined' && recordBtn && recordBtn.classList && recordBtn.classList.contains('recording')) return true;
            if (state) return true;
        } catch (e) {}
        return false;
    }

    /* ---------- Nachsehen ---------- */
    async function check() {
        if (checking || !enabled()) return;
        if (typeof accessToken === 'undefined' || !accessToken) return;          // Google nie verbunden: still bleiben
        if (typeof fetchEmailOverview !== 'function') return;
        checking = true;
        try {
            const ov = await fetchEmailOverview({ onlyUnread: true, max: 8, importantOnly: true, query: 'newer_than:2d' });
            if (!ov || ov.verbindung === 'getrennt' || ov.hinweis || !Array.isArray(ov.emails)) return;
            const seen = loadSeen();
            const ids = ov.emails.map(m => m.id);
            if (seen === null) { saveSeen(ids); return; }                          // allererster Lauf: nur merken, nichts melden
            const fresh = ov.emails.filter(m => !seen.includes(m.id));
            if (!fresh.length) return;
            saveSeen(seen.concat(fresh.map(m => m.id)));
            queue = queue.concat(fresh.reverse());                                 // älteste zuerst
        } catch (e) {
            console.error('Mail-Meldung: Nachsehen fehlgeschlagen', e);
        } finally {
            checking = false;
        }
        announceNext();
    }

    function announceNext(prefix) {
        if (state || !queue.length) return;
        if (busy()) { setTimeout(() => announceNext(prefix), RETRY_BUSY_MS); return; }
        const mail = queue.shift();
        const more = queue.length;
        state = { step: 'read', mail, until: Date.now() + ANSWER_WINDOW_MS };
        let text = (prefix || '') + `Sie haben eine E-Mail von ${mail.von}. Betreff: ${mail.betreff}. Soll ich sie vorlesen?`;
        if (more && !prefix) text = `Sie haben ${more + 1} neue E-Mails. Die erste ist von ${mail.von}. Betreff: ${mail.betreff}. Soll ich sie vorlesen?`;
        say(text);
    }

    /* ---------- Antworten des Users ---------- */
    const YES = /^\s*(?:ja|jo|jup|jep|jawohl|gerne|klar|okay|ok|bitte|na klar|mach das|mach|los|lies|vorlesen|lies vor|lies sie vor|lies es vor)\b/i;
    const NO = /^\s*(?:nein|nö|nee|ne|nicht|später|lass|lass es|danke nein|nein danke|kein|keine|abbrechen|stopp|stop)\b/i;

    function addressOf(headerValue) {
        const m = String(headerValue || '').match(/<([^>]+)>/);
        return (m ? m[1] : String(headerValue || '')).trim();
    }
    async function replyTarget(id) {
        try {
            const r = await gmailFetch(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Reply-To&metadataHeaders=Subject`, { 'Authorization': `Bearer ${accessToken}` });
            const h = r.data && r.data.payload && r.data.payload.headers;
            if (!h) return null;
            const to = addressOf(headerValue(h, 'Reply-To') || headerValue(h, 'From'));
            let su = headerValue(h, 'Subject') || '';
            if (!/^(re|aw):/i.test(su)) su = 'Re: ' + su;
            return to ? { to, subject: su } : null;
        } catch (e) { return null; }
    }
    function openReply(mail, target) {
        const url = `mailto:${encodeURIComponent(target.to).replace(/%40/g, '@')}?subject=${encodeURIComponent(target.subject)}`;
        try { if (typeof clearActionCards === 'function') clearActionCards(); if (typeof showActionCards === 'function') showActionCards([{ icon: '✉️', title: `Antwort an ${mail.von}`, subtitle: 'Tippen, falls Gmail sich nicht von selbst öffnet', href: url }]); } catch (e) {}
        try { window.open(url, '_blank', 'noopener'); } catch (e) {}
    }

    async function handleAnswer(text) {
        if (!state) return false;
        if (Date.now() > state.until) { state = null; announceNext(); return false; }   // zu spät: Satz ganz normal behandeln
        const raw = String(text || '');
        const yes = YES.test(raw), no = NO.test(raw);
        if (!yes && !no) { state = null; queue = []; return false; }                    // etwas anderes gesagt: Meldung vergessen, Satz normal behandeln
        const { step, mail } = state;
        state = null;
        if (step === 'read') {
            if (no) { say('Gut, ich lasse sie ungelesen.'); setTimeout(() => announceNext(), 4000); return true; }
            try {
                const full = await fetchEmailFullText(mail.id);
                state = { step: 'reply', mail, until: Date.now() + ANSWER_WINDOW_MS };
                say(`E-Mail von ${full.von}. Betreff: ${full.betreff}. ${full.text} Wollen Sie antworten?`);
            } catch (e) {
                say((e && e.userMessage) || 'Die E-Mail konnte ich gerade nicht laden.');
            }
            return true;
        }
        // step === 'reply'
        if (no) { say('Verstanden.'); setTimeout(() => announceNext('Die nächste: '), 4000); return true; }
        const target = await replyTarget(mail.id);
        if (!target) { say('Die Adresse des Absenders konnte ich nicht ermitteln. Antworten Sie bitte direkt in Gmail.'); return true; }
        openReply(mail, target);
        say('Gmail ist geöffnet, die Antwort an ' + mail.von + ' wartet auf Sie.');
        return true;
    }

    function handleToggle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (t.length > 60 || !/e-?mails?[- ]?(?:meldung|ansage|benachrichtigung|hinweis)/.test(t)) return false;
        if (/\b(aus|ausschalten|deaktivier\w*|abschalten|stopp?)\b/.test(t)) { lsSet(ON_KEY, '0'); say('Die E-Mail-Meldung ist ausgeschaltet.'); return true; }
        if (/\b(an|ein|einschalten|aktivier\w*|anschalten)\b/.test(t)) { lsSet(ON_KEY, '1'); say('Die E-Mail-Meldung ist eingeschaltet.'); schedule(FIRST_CHECK_MS); return true; }
        return false;
    }

    /* ---------- Takt ---------- */
    function schedule(ms) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => {
            if (!busy()) await check();
            schedule(CHECK_EVERY_MS);
        }, ms);
    }
    function start() {
        schedule(FIRST_CHECK_MS);
        try { document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(4000); }); } catch (e) {}
    }

    window.jvMailWatch = { check, handleAnswer, handleToggle, waiting: () => !!state || queue.length > 0 };
    if (typeof window.handleLocalCommand === 'function' && !window.handleLocalCommand._mailwatch) {
        const original = window.handleLocalCommand;
        const hooked = function (text) {
            try { if (handleToggle(text)) return true; } catch (e) {}
            if (state) {
                // Antwort auf die Meldung; der Rest passiert asynchron, hier nur "behandelt" melden
                const s = state, raw = String(text || '');
                if (Date.now() <= s.until && (YES.test(raw) || NO.test(raw))) { handleAnswer(raw).catch(() => {}); return true; }
                state = null; queue = [];
            }
            return original.apply(this, arguments);
        };
        hooked._mailwatch = true;
        Object.keys(original).forEach(k => { try { hooked[k] = original[k]; } catch (e) {} });
        window.handleLocalCommand = hooked;
    }
    try { if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true }); } catch (e) {}
})();
