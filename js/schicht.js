/* ============================================================
   SCHICHT: Frühschicht / Spätschicht im Wochenwechsel, Briefing zur richtigen Zeit, Ruhezeit je Schicht
   ============================================================
   Einmal sagen: "Diese Woche Frühschicht" (oder "Nächste Woche Spätschicht"). Jarvis rechnet den Wechsel jede Woche selbst weiter
   (Frühschicht, Spätschicht, Frühschicht ...). Der Wechsel ist immer am Montag.

   Briefing von selbst (nur bei offener, sichtbarer App; höchstens einmal pro Tag, nur wenn "Jarvis meldet sich von selbst" an ist):
     Frühschicht: ab 3:30 Uhr (Aufstehen) · Spätschicht: ab 12:00 Uhr (kurz vor der Abfahrt).
     Wird die App später geöffnet, kommt das Briefing sofort, solange seit der Zeit höchstens 4 Stunden vergangen sind.
   Ruhezeit: an Frühschicht-Tagen still von 21:30 bis zur Briefing-Zeit (sonst 22 bis 7 Uhr wie bisher).
   Das Briefing selbst (briefing.js) bekommt die Schicht und die Fahrzeit zur Arbeit mit (jvSchichtInfo) und endet ohne Rückfrage.

   Sprachbefehle (Befehlsliste commands.js):
     "Diese Woche Frühschicht" / "Nächste Woche Spätschicht" · "Welche Schicht habe ich?" / "... nächste Woche?" ·
     "Briefing in der Spätschicht um 11 Uhr" · "Wann kommt mein Briefing?" · "Schicht-Briefing aus" / "Schicht-Briefing an"

   Braucht: storage.js, commands.js, voice.js (speak, continueConversation), briefing.js (triggerDailyBriefing), wachter.js (wachterIdle,
   wachterEnabled, wachterDriveMinutes; alles zur Laufzeit, fehlt etwas, bleibt die Funktion einfach stumm).
   ============================================================ */
(function () {
    'use strict';

    const KEY = 'jv_schicht';            // { base: Wochennummer, shift: 'frueh'|'spaet', times: { frueh, spaet } in Minuten seit Mitternacht, auto: true|false }
    const LAST_KEY = 'jv_schicht_last';  // Tag (JJJJ-MM-TT), an dem das Briefing von selbst kam
    const DEFAULT_TIMES = { frueh: 3 * 60 + 30, spaet: 12 * 60 };
    const WINDOW_MIN = 4 * 60;           // so lange nach der Briefing-Zeit kommt es noch, wenn die App erst später geöffnet wird
    const QUIET_FROM_FRUEH = 21 * 60 + 30;
    const REF_MONDAY = Date.UTC(2024, 0, 1);   // ein Montag, Bezug für die Wochennummer
    const WEEK_MS = 7 * 86400000;

    /* ---------- Zeit in Berlin ---------- */
    function berlin(date) {
        const d = date || new Date();
        const p = {};
        try {
            new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
                .formatToParts(d).forEach(x => { p[x.type] = x.value; });
        } catch (e) { return { ymd: '', y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), min: d.getHours() * 60 + d.getMinutes() }; }
        const y = +p.year, m = +p.month, day = +p.day;
        return { ymd: `${p.year}-${p.month}-${p.day}`, y, m, d: day, min: (+p.hour % 24) * 60 + (+p.minute) };
    }
    /* Nummer der Woche (Montag bis Sonntag) für ein Datum { y, m, d } */
    function weekNo(b) {
        const t = Date.UTC(b.y, b.m - 1, b.d);
        const dow = (new Date(t).getUTCDay() + 6) % 7;   // Montag = 0
        return Math.round((t - dow * 86400000 - REF_MONDAY) / WEEK_MS);
    }
    function clock(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
    function spoken(min) { const h = Math.floor(min / 60), m = min % 60; return m ? `${h} Uhr ${m}` : `${h} Uhr`; }

    /* ---------- Speicher ---------- */
    function load() {
        try {
            const o = JSON.parse(getPersistentData(KEY, '') || 'null');
            if (!o || typeof o.base !== 'number' || (o.shift !== 'frueh' && o.shift !== 'spaet')) return null;
            const t = o.times || {};
            o.times = {
                frueh: Number.isFinite(t.frueh) ? t.frueh : DEFAULT_TIMES.frueh,
                spaet: Number.isFinite(t.spaet) ? t.spaet : DEFAULT_TIMES.spaet
            };
            o.auto = o.auto !== false;
            return o;
        } catch (e) { return null; }
    }
    function save(o) { try { setPersistentData(KEY, JSON.stringify(o)); } catch (e) {} }

    /* Schicht in der Woche mit der Nummer w */
    function shiftOfWeek(st, w) { return (((w - st.base) % 2) + 2) % 2 === 0 ? st.shift : (st.shift === 'frueh' ? 'spaet' : 'frueh'); }
    function shiftToday(st, now) { return shiftOfWeek(st, weekNo(berlin(now))); }
    const NAME = { frueh: 'Frühschicht', spaet: 'Spätschicht' };

    /* ---------- Ruhezeit ---------- */
    /* true = still, false = nicht still, undefined = normale Ruhezeit (22 bis 7 Uhr) gilt */
    function quietNow() {
        const st = load();
        if (!st) return undefined;
        const b = berlin();
        if (shiftOfWeek(st, weekNo(b)) !== 'frueh') return undefined;
        return b.min >= QUIET_FROM_FRUEH || b.min < st.times.frueh;
    }
    window.jvSchichtQuiet = quietNow;

    /* ---------- Angaben fürs Briefing ---------- */
    async function info() {
        const st = load();
        if (!st) return null;
        const sh = shiftToday(st);
        const o = { art: NAME[sh] };
        if (sh === 'spaet') o.abfahrt = 'gegen ' + spoken(st.times.spaet);
        window.__schichtStauCards = null;
        try {
            if (typeof workAddress === 'string' && workAddress) {
                // Route zur Arbeit samt Verkehrslage auf den Autobahnen (travel.js); höchstens 14 Sekunden warten
                let d = null;
                if (typeof fetchRouteMapData === 'function') {
                    d = await Promise.race([fetchRouteMapData(workAddress), new Promise(r => setTimeout(() => r(null), 14000))]);
                }
                if (d && d.fahrtMin) {
                    o.fahrzeit_zur_arbeit_minuten = d.fahrtMin;
                    const satz = (typeof lastStauText === 'string') ? lastStauText.trim() : '';
                    if (satz) o.stau_auf_der_strecke = satz;
                    if (typeof lastStauCards !== 'undefined' && lastStauCards.length) window.__schichtStauCards = lastStauCards.slice();
                } else if (typeof wachterDriveMinutes === 'function') {
                    const m = await Promise.race([wachterDriveMinutes(workAddress), new Promise(r => setTimeout(() => r(null), 6000))]);
                    if (m) o.fahrzeit_zur_arbeit_minuten = m;
                }
            }
        } catch (e) {}
        return o;
    }
    window.jvSchichtInfo = info;

    /* ---------- Briefing von selbst ---------- */
    function idle() { try { return typeof wachterIdle === 'function' ? wachterIdle() : !document.hidden; } catch (e) { return false; } }
    function allowed() { try { return typeof wachterEnabled === 'function' ? wachterEnabled() : true; } catch (e) { return false; } }
    function tick() {
        try {
            const st = load();
            if (!st || !st.auto || !allowed()) return;
            const b = berlin();
            if (getPersistentData(LAST_KEY, '') === b.ymd) return;
            const at = st.times[shiftOfWeek(st, weekNo(b))];
            if (b.min < at || b.min > at + WINDOW_MIN) return;
            if (!idle() || typeof window.triggerDailyBriefing !== 'function') return;   // später noch einmal versuchen
            setPersistentData(LAST_KEY, b.ymd);
            window.triggerDailyBriefing();
        } catch (e) { console.error('Schicht-Briefing', e); }
    }
    setInterval(tick, 30000);
    setTimeout(tick, 5000);
    try { document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(tick, 1500); }); } catch (e) {}


    /* ---------- Schichten in den Google Kalender ---------- */
    /* Ganztägige Einträge Mo-Fr für die nächsten Wochen, ohne Erinnerung (kein doppeltes Klingeln, kein Jarvis-Push, pushsync ignoriert Ganztags-Termine).
       Feste Kennung je Tag: erneutes Eintragen aktualisiert statt zu verdoppeln. */
    const CAL_WEEKS = 8;
    function ymdAdd(b, n) { const t = new Date(Date.UTC(b.y, b.m - 1, b.d + n)); return t.toISOString().slice(0, 10); }
    function shiftDays(st) {
        const b = berlin(), out = [];
        const dow = (new Date(Date.UTC(b.y, b.m - 1, b.d)).getUTCDay() + 6) % 7;
        for (let i = 0; i < CAL_WEEKS * 7; i++) {
            const off = i - dow;                 // ab Montag dieser Woche
            if ((i % 7) > 4) continue;           // nur Mo-Fr
            const day = ymdAdd(b, off);
            const p = day.split('-');
            const wn = weekNo({ y: +p[0], m: +p[1], d: +p[2] });
            if (off < 0) continue;               // Vergangenes auslassen
            out.push({ day, next: ymdAdd(b, off + 1), shift: shiftOfWeek(st, wn) });
        }
        return out;
    }
    async function calCall(method, path, body) {
        const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events' + path, {
            method, headers: { 'Authorization': 'Bearer ' + accessToken, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined
        });
        if (r.status === 401 && typeof markGoogleExpired === 'function') markGoogleExpired();
        return r;
    }
    async function writeShifts(st, remove) {
        const days = shiftDays(st);
        let ok = 0;
        for (const d of days) {
            const id = 'jvschicht' + d.day.replace(/-/g, '');
            const ev = { id, summary: NAME[d.shift], start: { date: d.day }, end: { date: d.next }, reminders: { useDefault: false, overrides: [] }, colorId: d.shift === 'frueh' ? '5' : '9', extendedProperties: { private: { jarvisSchicht: '1' } } };
            let r;
            if (remove) { r = await calCall('DELETE', '/' + id); if (r.ok || r.status === 404 || r.status === 410) ok++; continue; }
            r = await calCall('POST', '', ev);
            if (r.status === 409) r = await calCall('PUT', '/' + id, Object.assign({}, ev, { status: 'confirmed' }));
            if (r.ok) ok++;
            if (r.status === 401) break;
        }
        return { ok, total: days.length };
    }
    const CAL_RX = /(?:schicht\w*.*kalender|kalender.*schicht)/;
    const CAL_DEL_RX = /(?:lösch|entfern|nimm)/;
    async function calendarCommand(remove) {
        try {
            const st = load();
            if (!st) return say('Sagen Sie mir zuerst Ihre Schicht, zum Beispiel: Diese Woche Frühschicht.');
            if (typeof isGoogleAuthorized !== 'function' || !isGoogleAuthorized()) return say('Dafür muss der Google Kalender verbunden sein.');
            say(remove ? 'Ich entferne die Schichten aus dem Kalender.' : 'Ich trage die Schichten der nächsten acht Wochen in den Kalender ein.');
            const r = await writeShifts(st, remove);
            if (!r.ok) return say('Das hat leider nicht geklappt. Bitte den Google-Zugriff prüfen.');
            if (!remove && typeof fetchGoogleCalendarEvents === 'function') fetchGoogleCalendarEvents();
            return say(remove ? 'Die Schichten sind aus dem Kalender entfernt.' : `Fertig, ${r.ok} Schichttage stehen im Kalender, ohne Erinnerung.`);
        } catch (e) { console.error('Schicht-Kalender', e); return say('Das hat leider nicht geklappt.'); }
    }

    /* ---------- Sprachbefehle ---------- */
    function say(msg) { try { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} return true; }
    function norm(text) {
        return String(text || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ')
            .replace(/fr(?:ü|ue|u)h[\s-]*schicht/g, 'frühschicht').replace(/sp(?:ä|ae|a)t[\s-]*schicht/g, 'spätschicht')
            .replace(/n(?:ä|ae)chste/g, 'nächste').replace(/\s+/g, ' ').trim();
    }
    const SHIFT_RX = /(?<![a-zäöüß])(frühschicht|spätschicht)(?![a-zäöüß])/;
    const THIS_WEEK = /(?<![a-zäöüß])(?:diese|dieser|aktuelle|laufende)\s+woche(?![a-zäöüß])/;
    const NEXT_WEEK = /(?<![a-zäöüß])(?:nächste|kommende|folgende)\s+woche(?![a-zäöüß])/;
    const QUERY_RX = /(?:welche[rn]?|was für (?:eine|ne))\s+schicht|schicht\b.*\b(?:habe|hab) ich\b|^(?:habe|hab) ich\b.*schicht|in welcher schicht|schichtplan|meine schichten|^(?:ist|sind)\b.*schicht\b|wechsel(?:t)? (?:die |meine )?schicht/;
    const WHEN_RX = /wann (?:kommt|ist|gibt es|sagst du)\b.*\bbriefing|wann\b.*\bmein briefing|um wie viel uhr.*briefing/;
    const AUTO_RX = /^(?:das |mein |automatische[sn]? )?(?:schicht[- ]?briefing|automatisches briefing)\s+(aus|ausschalten|an|ein|einschalten)$/;

    function parseTime(t) {
        const m = t.match(/(?:um|ab|auf)\s+(\d{1,2})(?:\s*(?:uhr|:|\.)\s*(\d{1,2}))?(?:\s*uhr)?(?:\s+(\d{1,2}))?(?![\d])/);
        if (!m) return null;
        const h = +m[1], mi = +(m[2] || m[3] || 0);
        if (h > 23 || mi > 59) return null;
        return h * 60 + mi;
    }

    function describeWeek(st, w) { return NAME[shiftOfWeek(st, weekNo(berlin()) + w)]; }

    function handle(text) {
        const raw = String(text || '');
        if (raw.length > 90) return false;
        const t = norm(raw);
        if (!t) return false;
        const hasShift = SHIFT_RX.exec(t);
        const st = load();

        // Schichten in den Google Kalender eintragen / entfernen
        if (CAL_RX.test(t) && /eintrag|trag |übertrag|schreib|lösch|entfern|nimm|setz/.test(t) && !/^(?:welche|was|wann|wie)\b/.test(t)) {
            calendarCommand(CAL_DEL_RX.test(t));
            return true;
        }

        // Automatik an/aus
        const au = t.match(AUTO_RX);
        if (au) {
            if (!st) return say('Sagen Sie mir zuerst Ihre Schicht, zum Beispiel: Diese Woche Frühschicht.');
            st.auto = /^(?:an|ein|einschalten)$/.test(au[1]);
            save(st);
            return say(st.auto ? 'In Ordnung, das Briefing kommt wieder zur Schicht von selbst.' : 'In Ordnung, das Briefing kommt nicht mehr von selbst.');
        }

        // Briefing-Zeit ändern: "Briefing in der Spätschicht um 11 Uhr"
        if (hasShift && /briefing/.test(t) && !QUERY_RX.test(t) && !WHEN_RX.test(t)) {
            const min = parseTime(t);
            if (min === null) return say('Zu welcher Uhrzeit? Sagen Sie zum Beispiel: Briefing in der Spätschicht um 11 Uhr.');
            const key = hasShift[1] === 'frühschicht' ? 'frueh' : 'spaet';
            const s = st || { base: weekNo(berlin()), shift: key, times: Object.assign({}, DEFAULT_TIMES), auto: true };
            s.times[key] = min;
            save(s);
            return say(`Gut, in der ${NAME[key]} kommt das Briefing ab ${spoken(min)}.`);
        }

        // Wann kommt das Briefing?
        if (WHEN_RX.test(t)) {
            if (!st) return say('Sagen Sie mir zuerst Ihre Schicht, zum Beispiel: Diese Woche Frühschicht. Dann kommt das Briefing zur passenden Zeit.');
            return say(`In der Frühschicht kommt das Briefing ab ${spoken(st.times.frueh)}, in der Spätschicht ab ${spoken(st.times.spaet)}.${st.auto ? '' : ' Es ist aber gerade ausgeschaltet.'}`);
        }

        // Frage nach der Schicht
        if (QUERY_RX.test(t) && (/schicht/.test(t))) {
            if (!st) return say('Ihre Schicht kenne ich noch nicht. Sagen Sie zum Beispiel: Diese Woche Frühschicht.');
            if (NEXT_WEEK.test(t)) return say(`Nächste Woche haben Sie ${describeWeek(st, 1)}.`);
            if (/übernächste/.test(t)) return say(`In zwei Wochen haben Sie ${describeWeek(st, 2)}.`);
            return say(`Diese Woche haben Sie ${describeWeek(st, 0)}, nächste Woche ${describeWeek(st, 1)}.`);
        }

        // Schicht festlegen: "Diese Woche Frühschicht", "Nächste Woche habe ich Spätschicht"
        if (hasShift && (THIS_WEEK.test(t) || NEXT_WEEK.test(t)) && !/^(?:wie|wann|wo|was|wer|warum|wieso|kann|kannst|soll)\b/.test(t) && !/briefing/.test(t)) {
            const key = hasShift[1] === 'frühschicht' ? 'frueh' : 'spaet';
            const nextWeek = NEXT_WEEK.test(t) && !THIS_WEEK.test(t);
            const s = st || { times: Object.assign({}, DEFAULT_TIMES), auto: true };
            s.base = weekNo(berlin()) + (nextWeek ? 1 : 0);
            s.shift = key;
            save(s);
            const other = key === 'frueh' ? 'spaet' : 'frueh';
            return say(`Verstanden. ${nextWeek ? 'Nächste Woche' : 'Diese Woche'} ${NAME[key]}, ${nextWeek ? 'danach' : 'nächste Woche'} ${NAME[other]}, und so im Wechsel. Das Briefing kommt ${key === 'frueh' ? 'in der Frühschicht ab ' + spoken(s.times.frueh) : 'in der Spätschicht ab ' + spoken(s.times.spaet)}, wenn die App offen ist.`);
        }
        return false;
    }
    window.handleSchichtCommand = handle;
    if (window.jvCommands) {   // Befehlsliste (commands.js): innen von der Hör-Korrektur (400), außen von den Fristen (500)
        window.jvCommands.use('schicht', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Schicht', e); }
            return next(text);
        }, 450);
    }

    window._schichtTest = { berlin, weekNo, shiftOfWeek, load, save, tick, norm, handle, parseTime, quietNow, info };
})();
