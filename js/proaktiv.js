/* ============================================================
   PROAKTIV: Jarvis macht von selbst Vorschläge zu Kalendereinträgen und Erinnerungen (als Karte auf dem Bildschirm, ohne Ton).
   - TERMIN (mit Uhrzeit): etwa 60 Minuten vorher erscheint eine Karte "In einer Stunde: Friseur bei Anja" mit den Knöpfen
       "Fahrzeit" (nur wenn der Termin einen Ort hat: Fahrzeit und Abfahrtszeit), "Weg zeigen" (öffnet die Route),
       "Notizen suchen" (Gedächtnis, Aufgaben, frühere Termine mit gleichem Stichwort), "Später" (in 15 Minuten wieder) und "Nein danke".
   - ERINNERUNG: etwa 30 Minuten vorher eine kurze Karte mit "Später" und "Okay".
   Ganztägige Termine und Geburtstage bleiben außen vor. Jede Karte kommt pro Eintrag nur einmal (außer "Später").
   Regeln wie beim Wächter (wachter.js): gleicher Ein-/Ausschalter ("Jarvis meldet sich von selbst"), nichts zwischen 22 und 7 Uhr, nur bei geöffneter App.
   Der Wächter spricht weiterhin kurz vor dem Termin (Abfahrt, "gleich"); diese Karte ist die frühe, ruhige Vorwarnung.
   Einstellbar über getPersistentData: proaktiv_termin_min (Standard 60), proaktiv_erinnerung_min (Standard 30), proaktiv_sprechen ('1' = kurzer Satz dazu, Standard aus).
   Braucht: calendarEntries, reminderEntries, wachter.js (wachterEnabled, wachterQuiet, wachterDriveMinutes), briefing.js (isBirthdayEntry), places.js (buildMapsLink),
   assistant.js (searchSemanticMemory), gedächtnis (searchMemory), todoEntries. Fehlt etwas, entfällt nur der jeweilige Knopf. Muss nach wachter.js geladen werden.
   ============================================================ */
(function () {
    const DONE_KEY = 'proaktiv_done';
    const TICK_MS = 60000, FIRST_TICK_MS = 30000;
    const SNOOZE_MS = 15 * 60000;
    const snooze = {};          // id -> Zeitpunkt, ab dem die Karte wieder kommen darf
    let current = null;         // { id, el, timer }
    let busy = false;

    const num = (k, d) => { try { const v = Number(getPersistentData(k, String(d))); return v >= 5 && v <= 600 ? v : d; } catch (e) { return d; } };
    const leadEvent = () => num('proaktiv_termin_min', 60);
    const leadReminder = () => num('proaktiv_erinnerung_min', 30);
    const speakOn = () => { try { return getPersistentData('proaktiv_sprechen', '0') === '1'; } catch (e) { return false; } };
    const norm = s => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    const timeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]);
    const clock = d => d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

    function enabled() { try { return typeof wachterEnabled === 'function' ? wachterEnabled() : true; } catch (e) { return true; } }
    function quiet() { try { return typeof wachterQuiet === 'function' ? wachterQuiet() : false; } catch (e) { return false; } }

    function loadDone() {
        try { const o = JSON.parse(localStorage.getItem(DONE_KEY) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; }
    }
    function markDone(id) {
        try {
            const o = loadDone(), cut = Date.now() - 2 * 86400000;
            Object.keys(o).forEach(k => { if (o[k] < cut) delete o[k]; });
            o[id] = Date.now();
            localStorage.setItem(DONE_KEY, JSON.stringify(o));
        } catch (e) {}
    }
    const isDone = id => !!loadDone()[id];

    /* ---------- Karte ---------- */
    function ensureStyle() {
        if (document.getElementById('proaktivStyle')) return;
        const st = document.createElement('style');
        st.id = 'proaktivStyle';
        st.textContent =
            '#jvProaktiv{position:fixed;left:50%;transform:translateX(-50%);top:calc(64px + env(safe-area-inset-top,0px));width:min(92vw,440px);z-index:2147482500;box-sizing:border-box;padding:12px 14px;border-radius:12px;border:1.5px solid #49d7ff;background:rgba(6,16,26,.96);color:#e8f3f9;box-shadow:0 0 18px rgba(73,215,255,.35);font-family:"Rajdhani",sans-serif}' +
            '#jvProaktiv .pa-t{font:700 11px "IBM Plex Mono",monospace;letter-spacing:.1em;color:#49d7ff;text-transform:uppercase;margin-bottom:4px}' +
            '#jvProaktiv .pa-m{font-size:16px;line-height:1.25;font-weight:600;word-break:break-word}' +
            '#jvProaktiv .pa-x{font-size:14px;line-height:1.3;color:#cfe6f1;margin-top:6px;word-break:break-word}' +
            '#jvProaktiv .pa-x div{margin:3px 0}' +
            '#jvProaktiv .pa-b{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}' +
            '#jvProaktiv button{flex:1 1 auto;padding:9px 10px;border-radius:9px;border:1px solid rgba(93,209,255,.45);background:rgba(10,22,33,.95);color:#49d7ff;font:700 12px "IBM Plex Mono",monospace;letter-spacing:.05em}' +
            '#jvProaktiv button.pa-no{color:#8fa7b5;border-color:rgba(143,167,181,.35)}';
        document.head.appendChild(st);
    }

    function hideCard() {
        if (!current) return;
        try { clearTimeout(current.timer); } catch (e) {}
        try { current.el.remove(); } catch (e) {}
        current = null;
    }

    function showCard(o) {
        // o: { id, title, msg, buttons: [{label, cls, fn(ctx)}], endsAt }
        ensureStyle();
        hideCard();
        const el = document.createElement('div');
        el.id = 'jvProaktiv';
        const mk = (p, tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; p.appendChild(x); return x; };
        mk(el, 'div', 'pa-t', o.title);
        mk(el, 'div', 'pa-m', o.msg);
        const extra = mk(el, 'div', 'pa-x'); extra.style.display = 'none';
        const bar = mk(el, 'div', 'pa-b');
        const ctx = {
            show(lines) { extra.innerHTML = ''; (Array.isArray(lines) ? lines : [lines]).forEach(l => mk(extra, 'div', '', l)); extra.style.display = lines && lines.length ? 'block' : 'none'; },
            close: hideCard
        };
        o.buttons.forEach(b => {
            const btn = mk(bar, 'button', b.cls || '', b.label);
            btn.addEventListener('click', () => { try { b.fn(ctx); } catch (e) { ctx.show('Das hat gerade nicht geklappt.'); } });
        });
        document.body.appendChild(el);
        // verschwindet von selbst: beim Beginn des Termins, spätestens nach 30 Minuten
        const ms = Math.max(60000, Math.min(30 * 60000, (o.endsAt || (Date.now() + 30 * 60000)) - Date.now()));
        current = { id: o.id, el, timer: setTimeout(hideCard, ms) };
        markDone(o.id);
        if (speakOn() && typeof speak === 'function') { try { if (!(typeof isSpeaking === 'function' && isSpeaking())) speak(o.spoken || o.msg); } catch (e) {} }
    }

    const laterBtn = (id) => ({ label: 'Später', fn: (c) => { snooze[id] = Date.now() + SNOOZE_MS; try { const o = loadDone(); delete o[id]; localStorage.setItem(DONE_KEY, JSON.stringify(o)); } catch (e) {} c.close(); } });
    const noBtn = () => ({ label: 'Nein danke', cls: 'pa-no', fn: (c) => c.close() });

    /* ---------- Notizen zum Termin suchen ---------- */
    const STOP = new Set(['termin', 'treffen', 'meeting', 'besprechung', 'bei', 'beim', 'mit', 'der', 'die', 'das', 'dem', 'den', 'und', 'zum', 'zur', 'zu', 'im', 'in', 'am', 'um', 'für', 'von', 'vom', 'ein', 'eine', 'einen', 'mein', 'meine', 'uhr', 'nach']);
    function keywords(title) { return norm(title).split(' ').filter(w => w.length >= 3 && !STOP.has(w)); }

    async function findNotes(title, startMs) {
        const kws = keywords(title);
        const lines = [];
        if (!kws.length) return lines;
        // 1. Gedächtnis
        try {
            if (typeof searchMemory === 'function') {
                let res = searchMemory(kws.join(' ')) || [];
                if (!res.length) for (const k of kws) { res = searchMemory(k) || []; if (res.length) break; }
                res.slice(0, 3).forEach(r => lines.push('🧠 ' + (r.key ? r.key + ': ' : '') + String(r.value || '').slice(0, 140)));
            }
        } catch (e) {}
        // 2. Aufgaben und Notizen
        try {
            (typeof todoEntries !== 'undefined' ? todoEntries : []).filter(t => { const n = norm(t.text); return kws.some(k => n.includes(k)); }).slice(0, 3).forEach(t => lines.push('📝 ' + String(t.text).slice(0, 140)));
        } catch (e) {}
        // 3. Frühere Termine mit gleichem Stichwort (der letzte)
        try {
            const past = (typeof calendarEntries !== 'undefined' ? calendarEntries : []).map(e => ({ e, d: new Date(e.isoDate) }))
                .filter(x => x.e && x.e.isoDate && !isNaN(x.d.getTime()) && x.d.getTime() < startMs - 3600000 && kws.some(k => norm(x.e.text).includes(k)))
                .sort((a, b) => b.d - a.d)[0];
            if (past) lines.push('📅 Zuletzt: ' + past.e.text + ', ' + past.d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'long', year: 'numeric' }));
        } catch (e) {}
        // 4. Bedeutungssuche im Langzeitgedächtnis
        if (!lines.length) {
            try {
                if (typeof searchSemanticMemory === 'function') {
                    const hits = await timeout(searchSemanticMemory(title), 4500);
                    (hits || []).slice(0, 3).forEach(t => lines.push('🧠 ' + String(t).slice(0, 140)));
                }
            } catch (e) {}
        }
        return lines;
    }

    /* ---------- Karten für Termine und Erinnerungen ---------- */
    function eventCard(e, start, mins) {
        const id = 'ev|' + e.text + '|' + e.isoDate;
        const title = String(e.text || 'Termin');
        const loc = e.location ? String(e.location) : '';
        const when = mins >= 55 && mins <= 65 ? 'In einer Stunde' : 'In ' + mins + ' Minuten';
        const buttons = [];
        if (loc && typeof wachterDriveMinutes === 'function') {
            buttons.push({ label: '🚗 Fahrzeit', fn: async (c) => {
                c.show('Ich rechne …');
                const drive = await wachterDriveMinutes(loc);
                if (drive == null) { c.show('Die Fahrzeit konnte ich gerade nicht ermitteln.'); return; }
                if (drive > 360) { c.show('Den Ort „' + loc + '“ habe ich nicht sicher gefunden (die Fahrt wäre über 6 Stunden lang). Vielleicht ist das gar keine Adresse.'); return; }
                const leave = new Date(start - (drive + 10) * 60000);
                c.show(['Die Fahrt dauert rund ' + drive + ' Minuten (ohne Verkehr).', 'Losfahren am besten um ' + clock(leave) + ' Uhr (10 Minuten Puffer).']);
            } });
        }
        if (loc && typeof buildMapsLink === 'function') {
            buttons.push({ label: '🗺️ Weg zeigen', fn: () => { const url = buildMapsLink(loc, '', 'driving'); if (url) window.open(url, '_blank'); } });
        }
        buttons.push({ label: '📝 Notizen suchen', fn: async (c) => {
            c.show('Ich suche …');
            const lines = await findNotes(title, start);
            c.show(lines.length ? lines : 'Dazu habe ich nichts gespeichert.');
        } });
        buttons.push(laterBtn(id), noBtn());
        return { id, title: '📅 Termin um ' + clock(new Date(start)) + ' Uhr', msg: when + ': ' + title + (loc ? ' · ' + loc : ''), spoken: when + ' hast du: ' + title + '.', buttons, endsAt: start };
    }

    function reminderCard(r, start, mins) {
        const id = 'rem|' + r.text + '|' + r.time;
        const title = String(r.text || 'Erinnerung');
        return { id, title: '🔔 Erinnerung um ' + clock(new Date(start)) + ' Uhr', msg: 'In ' + mins + ' Minuten: ' + title, spoken: 'In ' + mins + ' Minuten: ' + title + '.', buttons: [laterBtn(id), { label: 'Okay', cls: 'pa-no', fn: (c) => c.close() }], endsAt: start };
    }

    function collect() {
        const now = Date.now(), out = [];
        const evLead = leadEvent(), remLead = leadReminder();
        (typeof calendarEntries !== 'undefined' ? calendarEntries : []).forEach(e => {
            if (!e || !e.isoDate || /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate))) return;
            try { if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(e)) return; } catch (x) {}
            const start = new Date(e.isoDate).getTime();
            if (isNaN(start)) return;
            const mins = Math.round((start - now) / 60000);
            if (mins < 3 || mins > evLead) return;
            const card = eventCard(e, start, mins);
            if (isDone(card.id) || (snooze[card.id] && now < snooze[card.id])) return;
            out.push({ start, card });
        });
        (typeof reminderEntries !== 'undefined' ? reminderEntries : []).forEach(r => {
            if (!r || !r.time || r.triggered) return;
            const start = new Date(r.time).getTime();
            if (isNaN(start)) return;
            const mins = Math.round((start - now) / 60000);
            if (mins < 3 || mins > remLead) return;
            const card = reminderCard(r, start, mins);
            if (isDone(card.id) || (snooze[card.id] && now < snooze[card.id])) return;
            out.push({ start, card });
        });
        return out.sort((a, b) => a.start - b.start);
    }

    function tick() {
        if (busy || current) return;
        if (!enabled() || quiet()) return;
        if (typeof document === 'undefined' || document.hidden) return;
        busy = true;
        try {
            const list = collect();
            if (list.length) showCard(list[0].card);
        } catch (e) { /* darf nie etwas stören */ }
        finally { busy = false; }
    }

    // zum Testen von außen
    window.jvProaktivTick = tick;
    window.jvProaktivCollect = collect;
    try { setTimeout(() => { tick(); setInterval(tick, TICK_MS); }, FIRST_TICK_MS); } catch (e) {}
})();
