/* ============================================================
   KONTO-MELDUNG: Ist die App offen, schaut sie alle paar Minuten nach neuen, ungelesenen Mails deiner Bank (Kontobewegung, Umsatz, Gutschrift,
   Lastschrift, Kontoauszug, Abbuchung ...) und sagt kurz an, was passiert ist:
   "Auf Ihrem Konto ist ein Eingang von 120 Euro. Betreff: ..." oder, wenn in der Mail nichts Genaues steht: "Ihre Bank hat Ihnen geschrieben. Betreff: ..."
   Jarvis liest nur; die Mail bleibt ungelesen im Postfach, nichts wird verschickt oder gelöscht. Es werden nur Mails der letzten zwei Tage beachtet.
   Erkennung: bekannte Bank-Namen im Absender (Sparkasse, Volksbank, ING, DKB, Commerzbank, Postbank, N26, comdirect, PayPal ...) oder Wörter wie Kontobewegung/Umsatz im Betreff.
   Eigene Bank hinzufügen per Sprache: "Meine Bank ist die Sparkasse Lauenburg" / "Füge Targobank als Bank hinzu". Anzeigen: "Welche Banken überwachst du?"
   Ein/Aus per Sprache: "Konto-Meldung aus" / "Konto-Meldung an". Standard: an.
   Läuft nur bei offener, sichtbarer App; nichts zwischen 22 und 7 Uhr; meldet sich nie, während Jarvis spricht, rechnet oder zuhört (wird nachgeholt).
   Ohne Google-Verbindung bleibt alles still. Braucht: mail.js (fetchEmailOverview, fetchEmailFullText), voice.js (speak). Nach mailwatch.js laden.
   ============================================================ */
(function () {
    const CHECK_EVERY_MS = 4 * 60 * 1000;
    const FIRST_CHECK_MS = 40 * 1000;
    const RETRY_BUSY_MS = 25 * 1000;
    const SEEN_KEY = 'jv_konto_gesehen', ON_KEY = 'jv_konto_an', BANKS_KEY = 'jv_konto_banken', LOG_KEY = 'jv_konto_verlauf';
    const QUIET_FROM = 22, QUIET_TO = 7;
    const BASE_BANKS = ['sparkasse', 'volksbank', 'raiffeisen', 'ing', 'diba', 'dkb', 'commerzbank', 'postbank', 'deutsche bank', 'n26', 'comdirect', 'targobank', 'hypovereinsbank', 'consorsbank', 'norisbank', 'santander', 'paypal', 'sparda', 'psd', 'gls bank', 'revolut', 'wise', 'klarna', 'bank'];
    const WORDS = /kontobewegung|kontoumsatz|umsatz|gutschrift|lastschrift|kontoauszug|abbuchung|zahlungseingang|geldeingang|überweisung|ueberweisung|buchung|kontostand|dauerauftrag|kartenzahlung|zahlung/i;

    let queue = [], timer = null, checking = false;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const enabled = () => lsGet(ON_KEY) !== '0';
    function loadSeen() { try { const v = JSON.parse(lsGet(SEEN_KEY) || 'null'); return Array.isArray(v) ? v : null; } catch (e) { return null; } }
    function saveSeen(a) { lsSet(SEEN_KEY, JSON.stringify(a.slice(-200))); }
    function ownBanks() { try { const v = JSON.parse(lsGet(BANKS_KEY) || '[]'); return Array.isArray(v) ? v.filter(x => typeof x === 'string' && x) : []; } catch (e) { return []; } }
    function loadLog() { try { const v = JSON.parse(lsGet(LOG_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
    function addLog(entry) { const l = loadLog(); l.unshift(entry); lsSet(LOG_KEY, JSON.stringify(l.slice(0, 5))); }
    const allBanks = () => BASE_BANKS.concat(ownBanks());
    function say(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { console.error('Konto-Meldung', e); } }
    function quiet() { const h = new Date().getHours(); return h >= QUIET_FROM || h < QUIET_TO; }
    function busy() {
        try {
            if (typeof document !== 'undefined' && document.hidden) return true;
            if (typeof isProcessing !== 'undefined' && isProcessing) return true;
            if (typeof isSpeaking === 'function' && isSpeaking()) return true;
            if (typeof recordBtn !== 'undefined' && recordBtn && recordBtn.classList && recordBtn.classList.contains('recording')) return true;
            if (window.jvMailWatch && typeof window.jvMailWatch.waiting === 'function' && window.jvMailWatch.waiting()) return true;
        } catch (e) {}
        return quiet();
    }

    /* ---------- Erkennen ---------- */
    function isBankMail(m) {
        const von = String((m && m.von) || '').toLowerCase(), bet = String((m && m.betreff) || '');
        if (allBanks().some(b => b.length >= 3 ? von.includes(b.toLowerCase()) : new RegExp('(?:^|[^a-zäöü])' + b.toLowerCase() + '(?:[^a-zäöü]|$)').test(von))) return true;
        return WORDS.test(bet);
    }
    function gmailQuery() {
        const from = ownBanks().concat(BASE_BANKS.filter(b => b !== 'bank')).map(b => 'from:' + b.replace(/\s+/g, '')).join(' OR ');
        return `newer_than:2d (${from} OR subject:Kontobewegung OR subject:Umsatz OR subject:Gutschrift OR subject:Lastschrift OR subject:Kontoauszug OR subject:Abbuchung OR subject:Zahlungseingang)`;
    }
    function euro(text) {
        const m = String(text || '').match(/(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+(?:\.\d{2}))\s*(?:€|eur\b|euro)/i) || String(text || '').match(/(?:€|eur\b)\s*(-?\d{1,3}(?:\.\d{3})*,\d{2}|-?\d+,\d{2}|-?\d+(?:\.\d{2}))/i);
        if (!m) return '';
        let v = m[1].replace(/^-/, '');
        if (/,\d{2}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
        const n = parseFloat(v); if (!isFinite(n)) return '';
        const eur = Math.floor(n + 1e-9), cent = Math.round((n - eur) * 100);
        return cent ? (cent < 10 ? `${eur} Euro und ${cent} Cent` : `${eur} Euro ${cent}`) : `${eur} Euro`;
    }
    function direction(text) {
        const t = String(text || '').toLowerCase();
        const ein = /gutschrift|gutgeschrieben|zahlungseingang|geldeingang|eingang|erhalten|erhaltene|eingegangen/.test(t);
        const aus = /lastschrift|abbuchung|abgebucht|belastet|belastung|abgang|kartenzahlung|überweisung ausgeführt|ueberweisung ausgefuehrt|zahlung an|dauerauftrag/.test(t);
        if (ein && !aus) return 'ein';
        if (aus && !ein) return 'aus';
        return '';
    }
    async function describe(m) {
        let body = '';
        try { if (typeof fetchEmailFullText === 'function') { const f = await fetchEmailFullText(m.id); body = String((f && f.text) || ''); } } catch (e) {}
        const all = (m.betreff || '') + ' ' + body;
        const betrag = euro(all), dir = direction(all);
        const bet = String(m.betreff || '').trim();
        if (betrag && dir === 'ein') return `Auf Ihrem Konto ist ein Eingang von ${betrag}. Betreff: ${bet}.`;
        if (betrag && dir === 'aus') return `Von Ihrem Konto wurden ${betrag} abgebucht. Betreff: ${bet}.`;
        if (betrag) return `Es gibt eine Kontobewegung über ${betrag}. Betreff: ${bet}.`;
        return `Ihre Bank hat Ihnen geschrieben. Betreff: ${bet}.`;
    }

    /* ---------- Nachsehen ---------- */
    async function check() {
        if (checking || !enabled()) return;
        if (typeof accessToken === 'undefined' || !accessToken) return;
        if (typeof fetchEmailOverview !== 'function') return;
        checking = true;
        try {
            const ov = await fetchEmailOverview({ onlyUnread: true, max: 12, importantOnly: false, query: gmailQuery() });
            if (!ov || ov.verbindung === 'getrennt' || ov.hinweis || !Array.isArray(ov.emails)) return;
            const hits = ov.emails.filter(isBankMail);
            const seen = loadSeen();
            if (seen === null) { saveSeen(hits.map(m => m.id)); return; }           // erster Lauf: nur merken
            const fresh = hits.filter(m => !seen.includes(m.id));
            if (!fresh.length) return;
            saveSeen(seen.concat(fresh.map(m => m.id)));
            queue = queue.concat(fresh.reverse());
        } catch (e) { console.error('Konto-Meldung: Nachsehen fehlgeschlagen', e); }
        finally { checking = false; }
        announceNext();
    }
    async function announceNext() {
        if (!queue.length) return;
        if (busy()) { setTimeout(announceNext, RETRY_BUSY_MS); return; }
        const m = queue.shift();
        const text = await describe(m);
        if (busy()) { queue.unshift(m); setTimeout(announceNext, RETRY_BUSY_MS); return; }
        addLog({ at: Date.now(), von: String(m.von || '').replace(/<.*>/, '').trim(), betreff: String(m.betreff || ''), text: text });
        say(text);
        if (queue.length) setTimeout(announceNext, 12000);
    }

    /* ---------- Fenster (Menü ☰ oder Kugel-Ansicht) ---------- */
    let win = null;
    function ensureStyle() {
        if (document.getElementById('kmStyle')) return;
        const st = document.createElement('style'); st.id = 'kmStyle';
        st.textContent =
            '#jvKonto{position:fixed;inset:0;z-index:92;background:rgba(4,9,15,.98);color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
            '#jvKonto .km-head{padding:16px 18px 6px;text-align:center}#jvKonto .km-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.14em;color:#49d7ff}' +
            '#jvKonto .km-sub{font:500 12px "IBM Plex Mono",monospace;color:#7fb8cf;margin-top:4px}' +
            '#jvKonto .km-body{flex:1 1 auto;overflow:auto;padding:8px 14px;display:flex;flex-direction:column;gap:12px;min-height:0}' +
            '#jvKonto .km-card{border:1px solid rgba(93,209,255,.25);border-radius:10px;padding:10px 12px;background:rgba(10,22,33,.9)}' +
            '#jvKonto .km-h{font:700 12px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#49d7ff;margin-bottom:6px}' +
            '#jvKonto .km-row{display:flex;gap:8px;align-items:center;margin:4px 0;font-size:15px}#jvKonto .km-row span{flex:1 1 auto}' +
            '#jvKonto .km-btn{padding:10px 8px;border-radius:10px;border:1px solid rgba(93,209,255,.4);background:rgba(10,22,33,.95);color:#49d7ff;font:700 12px "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase}' +
            '#jvKonto .km-btn.primary{background:rgba(73,215,255,.2);color:#fff}' +
            '#jvKonto input{flex:1 1 auto;min-width:0;padding:10px;border-radius:10px;border:1px solid rgba(93,209,255,.3);background:#fff;color:#111;font:15px "Rajdhani",Arial,sans-serif}' +
            '#jvKonto .km-log{font-size:14px;margin:6px 0;border-bottom:1px solid rgba(93,209,255,.12);padding-bottom:6px}#jvKonto .km-log small{color:#7fb8cf;font-family:"IBM Plex Mono",monospace}' +
            '#jvKonto .km-bar{padding:6px 14px 14px}';
        document.head.appendChild(st);
    }
    function closeWin() {
        if (win) { try { win.remove(); } catch (e) {} win = null; }
        try { document.body.classList.remove('panel-open'); } catch (e) {}
        try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) {}
    }
    function fmtAt(t) { const d = new Date(t); const p = n => String(n).padStart(2, '0'); return `${p(d.getDate())}.${p(d.getMonth() + 1)}. ${p(d.getHours())}:${p(d.getMinutes())}`; }
    function openWin(note) {
        ensureStyle(); closeWin();
        const mk = (par, tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; par.appendChild(x); return x; };
        win = document.createElement('div'); win.id = 'jvKonto';
        const head = mk(win, 'div', 'km-head'); mk(head, 'div', 'km-title', 'KONTO-MELDUNG');
        mk(head, 'div', 'km-sub', enabled() ? 'an · meldet neue Bank-Mails bei offener App' : 'aus');
        const body = mk(win, 'div', 'km-body');
        if (note) mk(body, 'div', 'km-sub', note);
        // Schalter
        const c1 = mk(body, 'div', 'km-card'); mk(c1, 'div', 'km-h', 'Meldung');
        const r1 = mk(c1, 'div', 'km-row'); mk(r1, 'span', '', enabled() ? 'Eingeschaltet' : 'Ausgeschaltet');
        mk(r1, 'button', 'km-btn primary', enabled() ? 'Ausschalten' : 'Einschalten').addEventListener('click', () => { lsSet(ON_KEY, enabled() ? '0' : '1'); if (enabled()) schedule(FIRST_CHECK_MS); openWin(); });
        // Jetzt prüfen
        const c2 = mk(body, 'div', 'km-card'); mk(c2, 'div', 'km-h', 'Jetzt prüfen');
        const pr = mk(c2, 'div', 'km-row'); mk(pr, 'span', '', 'Neue Bank-Mails der letzten zwei Tage');
        mk(pr, 'button', 'km-btn primary', 'Prüfen').addEventListener('click', () => { closeWin(); handle('prüf mal mein konto'); });
        // Banken
        const c3 = mk(body, 'div', 'km-card'); mk(c3, 'div', 'km-h', 'Meine Banken');
        const mine = ownBanks();
        if (!mine.length) mk(c3, 'div', 'km-sub', 'Bekannte Banken wie Sparkasse, Volksbank, ING, DKB, Commerzbank, PayPal sind schon dabei.');
        mine.forEach(b => { const r = mk(c3, 'div', 'km-row'); mk(r, 'span', '', b); mk(r, 'button', 'km-btn', '✕').addEventListener('click', () => { lsSet(BANKS_KEY, JSON.stringify(ownBanks().filter(x => x !== b))); openWin(); }); });
        const add = mk(c3, 'div', 'km-row'); const inp = mk(add, 'input'); inp.placeholder = 'Bank hinzufügen, z. B. Sparkasse Lauenburg'; inp.setAttribute('autocomplete', 'off');
        const doAdd = () => { const v = inp.value.trim().toLowerCase(); if (v.length < 3) return; const l = ownBanks(); if (!l.includes(v)) l.push(v); lsSet(BANKS_KEY, JSON.stringify(l.slice(-10))); openWin('Hinzugefügt: ' + v); };
        mk(add, 'button', 'km-btn primary', '＋').addEventListener('click', doAdd); inp.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });
        // Letzte Meldungen
        const c4 = mk(body, 'div', 'km-card'); mk(c4, 'div', 'km-h', 'Letzte Meldungen');
        const log = loadLog();
        if (!log.length) mk(c4, 'div', 'km-sub', 'Noch keine gemeldet.');
        log.forEach(e => { const d = mk(c4, 'div', 'km-log'); mk(d, 'small', '', fmtAt(e.at) + (e.von ? ' · ' + e.von : '')); mk(d, 'div', '', e.text || e.betreff); });
        const bar = mk(win, 'div', 'km-bar'); const cb = mk(bar, 'button', 'km-btn', 'Schließen'); cb.style.width = '100%'; cb.addEventListener('click', closeWin);
        document.body.appendChild(win);
        try { document.body.classList.add('panel-open'); } catch (e) {}
        try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) {}
    }
    window.kontoMenu = openWin;

    /* Eintrag im ☰-Menü, ohne panels.js zu ändern */
    function hookMenu() {
        try {
            if (typeof window.buildMenuPanel !== 'function' || window.buildMenuPanel.__km) return;
            const orig = window.buildMenuPanel;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try {
                    if (r && typeof r.html === 'string' && r.html.indexOf('kontoMenu') < 0) {
                        const btn = '<button class="panel-row w-full flex items-center gap-3 text-left bg-black/60 border border-[rgba(73,215,255,.2)] rounded-lg p-3 mb-2" style="--i:12" onclick="playUiBeep(); closePanel(); window.kontoMenu()">' +
                            '<span class="text-2xl">🏦</span><span class="flex-1"><b class="block text-[#49d7ff] text-sm">Konto-Meldung</b><span class="text-xs text-slate-400">Bank-Mails, Banken, letzte Meldungen</span></span><span class="text-[#49d7ff]">›</span></button>';
                        const m = r.html.match(/<button[^>]*openPanel\('planer'\)/);
                        r.html = m ? r.html.replace(m[0], btn + m[0]) : r.html.replace(/<\/div>\s*$/, btn + '</div>');
                    }
                } catch (e) { console.error('Konto Menü', e); }
                return r;
            };
            wrapped.__km = true;
            // Falls kuendigung.js schon umwickelt hat: unsere Hülle darum legen (beide bleiben aktiv)
            window.buildMenuPanel = wrapped;
        } catch (e) {}
    }
    hookMenu(); [800, 3000].forEach(ms => setTimeout(hookMenu, ms));

    /* ---------- Sprachbefehle ---------- */
    const norm = s => String(s || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();
    function handle(text) {
        const t = norm(text);
        if (!t || t.length > 80) return false;
        if (/^(?:zeig\w*|öffne|oeffne)\s+(?:mir\s+)?(?:die\s+|meine\s+)?konto[- ]?(?:meldung|meldungen|mails?)$/.test(t) || /^konto[- ]?meldungen?$/.test(t)) { openWin(); return true; }
        if (/konto[- ]?(?:meldung|ansage|benachrichtigung|hinweis)/.test(t)) {
            if (/\b(aus|ausschalten|deaktivier\w*|abschalten|stopp?)\b/.test(t)) { lsSet(ON_KEY, '0'); say('Die Konto-Meldung ist ausgeschaltet.'); return true; }
            if (/\b(an|ein|einschalten|aktivier\w*|anschalten)\b/.test(t)) { lsSet(ON_KEY, '1'); say('Die Konto-Meldung ist eingeschaltet.'); schedule(FIRST_CHECK_MS); return true; }
            return false;
        }
        let m = t.match(/^(?:meine bank ist|meine banken sind)\s+(?:die |der |das )?(.{3,40})$/) || t.match(/^(?:füge|fuege|nimm|setz\w*)\s+(?:die |der |das )?(.{3,40}?)\s+(?:als bank|zu den banken|zur konto[- ]?meldung)\b/);
        if (m) {
            const bank = m[1].trim();
            const list = ownBanks(); if (!list.includes(bank)) list.push(bank);
            lsSet(BANKS_KEY, JSON.stringify(list.slice(-10)));
            say(`In Ordnung. Ich achte jetzt auch auf Mails von ${bank}.`); schedule(8000); return true;
        }
        if (/^(?:welche banken|welche bank)\b.*(?:überwach\w*|beobacht\w*|kennst|achtest|meldest)/.test(t)) {
            const l = ownBanks();
            say(l.length ? `Zusätzlich zu den bekannten Banken achte ich auf: ${l.join(', ')}.` : 'Ich kenne die gängigen Banken, zum Beispiel Sparkasse, Volksbank, ING, DKB und Commerzbank. Eigene fügen Sie mit „Meine Bank ist …“ hinzu.');
            return true;
        }
        if (/^(?:prüf\w*|pruef\w*|check\w*|schau\w*)\s+(?:mal\s+)?(?:mein\s+|meine\s+)?(?:konto|bank)\b/.test(t) || /^(?:gibt es |habe ich )?(?:neue\s+)?(?:konto|bank)[- ]?(?:mails?|nachrichten|bewegungen)\??$/.test(t)) {
            if (typeof accessToken === 'undefined' || !accessToken) { say('Dafür muss das Google-Konto verbunden sein.'); return true; }
            const seen0 = loadSeen(); lsSet(SEEN_KEY, JSON.stringify([]));       // alles Ungelesene der letzten zwei Tage zählt als neu
            check().then(() => { if (!queue.length) say('Keine neuen Bank-Mails in den letzten zwei Tagen.'); });
            return true;
        }
        return false;
    }

    function schedule(ms) {
        if (timer) clearTimeout(timer);
        timer = setTimeout(async () => { if (!busy()) await check(); schedule(CHECK_EVERY_MS); }, ms);
    }
    function start() {
        schedule(FIRST_CHECK_MS);
        try { document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(6000); }); } catch (e) {}
    }

    window.jvKonto = { check, handle, isBankMail, euro, direction, queue: () => queue.slice(), describe };
    let lastHooked = null;
    function hook() {
        const prev = window.handleLocalCommand;
        if (typeof prev !== 'function' || prev === lastHooked) return;
        const hooked = function (text) {
            try { if (handle(text)) return true; } catch (e) { console.error('Konto-Meldung', e); }
            return prev.apply(this, arguments);
        };
        Object.keys(prev).forEach(k => { try { hooked[k] = prev[k]; } catch (e) {} });
        lastHooked = hooked; window.handleLocalCommand = hooked;
    }
    hook(); [1500, 4000, 9000].forEach(ms => setTimeout(hook, ms));
    try { if (document.readyState === 'complete') start(); else window.addEventListener('load', start, { once: true }); } catch (e) {}
})();
