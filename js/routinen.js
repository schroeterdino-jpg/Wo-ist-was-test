/* ============================================================
   ROUTINEN: Jarvis lernt aus dem, was du in der App tust, und unterstützt dich dabei
   ============================================================
   - Mitzählen (still): bei jedem Termin, jeder Erinnerung, Aufgabe, Einkaufsliste, jedem Foto, jeder Stau-/Wetter-Abfrage und jedem Parkplatz-Satz
     merkt sich Jarvis NUR Art, Wochentag und Uhrzeit. Keine Inhalte, kein Wortlaut. Alles bleibt auf dem Handy (Schlüssel jv_routinen, nicht synchronisiert).
   - Erkennen: gleiche Art, ähnliche Uhrzeit (±45 Minuten) an mindestens 3 verschiedenen Tagen innerhalb von 21 Tagen.
   - Vorschlagen: höchstens EIN Vorschlag am Tag, nur bei offener, ruhiger App, nie in der Ruhezeit. "Ja" = merken, "Nein" = nie wieder fragen.
   - Unterstützen: bei einer gemerkten Routine kommt kurz vor der Zeit ein kurzer Hinweis (Karte und gesprochen), einmal am Tag, nur wenn du es nicht schon getan hast.
   - Sprache: "Welche Routinen kennst du?", "Vergiss die Routine Einkauf", "Vergiss alle Routinen", "Routinen aus" / "Routinen an", "Was hast du gelernt?".
   - Das Schicht-Briefing (schicht.js, briefing.js) wird NICHT berührt. Die Ruhezeit (inkl. Frühschicht-Ruhezeit) hat immer Vorrang.
   Braucht: storage.js, commands.js, wachter.js (wachterQuiet, wachterIdle, wachterEnabled), voice.js (speak), places.js (showActionCards). Alles ist optional abgesichert;
   fehlt etwas, tut die Datei still nichts. Muss nach commands.js und schicht.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_routinen';
    const OFF_KEY = 'jv_routinen_aus';
    const MAX_LOG = 500;
    const DAYS_BACK = 21;
    const MIN_DATES = 3;
    const WINDOW_MIN = 45;      // Uhrzeiten, die höchstens so weit auseinander liegen, gelten als "gleiche Zeit"
    const HINT_BEFORE = 10;     // Hinweis so viele Minuten vor der gelernten Zeit
    const PENDING_MS = 3 * 60 * 1000;

    const KINDS = {
        termin: { label: 'Termine eintragen', v: 'Du trägst Termine ein', hint: 'Um diese Zeit trägst du sonst Termine ein.' },
        erinnerung: { label: 'Erinnerungen anlegen', v: 'Du legst Erinnerungen an', hint: 'Um diese Zeit legst du sonst Erinnerungen an.' },
        aufgabe: { label: 'Aufgaben notieren', v: 'Du schreibst Aufgaben auf', hint: 'Um diese Zeit schreibst du sonst deine Aufgaben auf.' },
        einkauf: { label: 'die Einkaufsliste', v: 'Du schaust auf die Einkaufsliste', hint: 'Um diese Zeit schaust du sonst auf die Einkaufsliste.' },
        foto: { label: 'Fotos machen', v: 'Du machst Fotos', hint: 'Um diese Zeit machst du sonst Fotos, zum Beispiel von Post.' },
        stau: { label: 'Stau und Route prüfen', v: 'Du prüfst Stau oder Route', hint: 'Um diese Zeit prüfst du sonst Stau oder Route.' },
        wetter: { label: 'das Wetter', v: 'Du fragst nach dem Wetter', hint: 'Um diese Zeit fragst du sonst nach dem Wetter.' },
        parken: { label: 'Parkplatz merken', v: 'Du merkst dir den Parkplatz', hint: 'Um diese Zeit gehst du sonst zum Auto oder merkst dir den Parkplatz.' }
    };
    const DAY_NAMES = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const DAY_PL = ['sonntags', 'montags', 'dienstags', 'mittwochs', 'donnerstags', 'freitags', 'samstags'];

    /* ---------- Zeit (Berlin) ---------- */
    function berlin(ms) {
        const d = new Date(ms === undefined ? Date.now() : ms);
        const p = {};
        try {
            new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short', hour12: false })
                .formatToParts(d).forEach(x => { p[x.type] = x.value; });
        } catch (e) { return { day: d.toISOString().slice(0, 10), wd: d.getDay(), min: d.getHours() * 60 + d.getMinutes() }; }
        const wd = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }[p.weekday];
        return { day: p.year + '-' + p.month + '-' + p.day, wd: wd === undefined ? 0 : wd, min: (parseInt(p.hour, 10) % 24) * 60 + parseInt(p.minute, 10) };
    }
    function hhmm(min) { const h = Math.floor(min / 60), m = min % 60; return h + ':' + (m < 10 ? '0' : '') + m; }
    function spokenTime(min) {
        const h = Math.floor(min / 60), m = Math.round(min % 60);
        return m === 0 ? h + ' Uhr' : h + ' Uhr ' + m;
    }
    function dayNum(s) { return Math.floor(Date.parse(s + 'T12:00:00Z') / 86400000); }

    /* ---------- Speicher ---------- */
    function load() {
        let o = null;
        try { o = JSON.parse(getPersistentData(KEY, '') || 'null'); } catch (e) {}
        if (!o || typeof o !== 'object') o = {};
        if (!Array.isArray(o.log)) o.log = [];
        if (!Array.isArray(o.routines)) o.routines = [];
        if (!o.state || typeof o.state !== 'object') o.state = {};
        return o;
    }
    function save(o) { try { setPersistentData(KEY, JSON.stringify(o)); } catch (e) {} }
    function enabled() { return getPersistentData(OFF_KEY, '') !== '1'; }

    /* ---------- Mitzählen ---------- */
    let lastRec = {};   // gleiche Art nicht mehrfach innerhalb von 2 Minuten zählen
    function record(kind) {
        try {
            if (!enabled() || !KINDS[kind]) return;
            const now = Date.now();
            if (lastRec[kind] && now - lastRec[kind] < 120000) return;
            lastRec[kind] = now;
            const b = berlin(now), o = load();
            o.log.push({ k: kind, d: b.day, w: b.wd, m: b.min });
            const lim = dayNum(b.day) - DAYS_BACK - 7;   // Alte Einträge verfallen
            o.log = o.log.filter(e => dayNum(e.d) >= lim).slice(-MAX_LOG);
            save(o);
        } catch (e) {}
    }
    function kindOfText(t) {
        if (/routine|gelernt/.test(t)) return null;
        if (/\btermin|kalender/.test(t)) return 'termin';
        if (/erinner/.test(t)) return 'erinnerung';
        if (/aufgabe|to-?do\b|todo/.test(t)) return 'aufgabe';
        if (/einkauf|auf die liste|setz\w* .* liste/.test(t)) return 'einkauf';
        if (/\bfoto|\bbild\b|fotografier/.test(t)) return 'foto';
        if (/\bstau|verkehr|\broute|fahrzeit|wie lange .*(fahr|brauch)/.test(t)) return 'stau';
        if (/wetter|regnet|\bregen\b|temperatur|schirm/.test(t)) return 'wetter';
        if (/\bpark/.test(t)) return 'parken';
        return null;
    }
    const ACTION_KIND = { shopping: 'einkauf', todo: 'aufgabe', reminder: 'erinnerung', calendar: 'termin', parking_save: 'parken' };

    /* ---------- Erkennen ---------- */
    function detect(log) {
        const today = dayNum(berlin().day);
        const out = [];
        Object.keys(KINDS).forEach(kind => {
            const es = log.filter(e => e.k === kind && today - dayNum(e.d) <= DAYS_BACK).sort((a, b) => a.m - b.m);
            // Gruppen nach Uhrzeit bilden: neuer Eintrag gehört zur Gruppe, wenn er höchstens WINDOW_MIN nach dem ersten der Gruppe liegt
            let i = 0;
            while (i < es.length) {
                let j = i;
                while (j + 1 < es.length && es[j + 1].m - es[i].m <= WINDOW_MIN * 2) j++;
                const grp = es.slice(i, j + 1);
                const days = {};
                grp.forEach(e => { days[e.d] = e; });
                const dk = Object.keys(days);
                if (dk.length >= MIN_DATES) {
                    const ms = grp.map(e => e.m).sort((a, b) => a - b);
                    const med = ms[Math.floor(ms.length / 2)];
                    const wds = Array.from(new Set(dk.map(d => days[d].w))).sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
                    out.push({ id: kind + '@' + Math.round(med / 60), k: kind, m: med, wd: wds, n: dk.length });
                }
                i = j + 1;
            }
        });
        return out;
    }
    function dayText(wds) {
        if (wds.length >= 6) return 'fast täglich';
        if (wds.length === 5 && [1, 2, 3, 4, 5].every(d => wds.indexOf(d) >= 0)) return 'montags bis freitags';
        return wds.map(d => DAY_PL[d]).join(', ');
    }

    /* ---------- Vorschlag ---------- */
    let pending = null;   // { id, until }
    function quiet() {
        try { return typeof wachterQuiet === 'function' ? !!wachterQuiet() : false; } catch (e) { return false; }
    }
    function idle() {
        try { return typeof wachterIdle === 'function' ? !!wachterIdle() : true; } catch (e) { return false; }
    }
    function sayCard(title, sub, text, withFollowUp) {
        try { if (typeof showActionCards === 'function') showActionCards([{ icon: '🔁', title, subtitle: sub }]); } catch (e) {}
        try {
            if (typeof speak === 'function') {
                if (withFollowUp && typeof continueConversation === 'function') speak(text, continueConversation); else speak(text);
            }
        } catch (e) {}
    }
    function offerText(r) {
        const w = dayText(r.wd);
        return 'Mir ist etwas aufgefallen: ' + KINDS[r.k].v + ' ' + w + ' gegen ' + spokenTime(r.m) +
            '. Soll ich mir das als Routine merken und dich dann kurz davor erinnern?';
    }
    function maybeOffer(o) {
        if (pending && pending.until > Date.now()) return false;
        const b = berlin();
        if (o.state.offerDay === b.day) return false;   // höchstens einer am Tag
        const known = {}; o.routines.forEach(r => { known[r.id] = true; });
        const cands = detect(o.log).filter(r => !known[r.id]).sort((a, b2) => b2.n - a.n);
        if (!cands.length) return false;
        const r = cands[0];
        o.state.offerDay = b.day;
        o.state.offerId = r.id;
        o.routines.push({ id: r.id, k: r.k, m: r.m, wd: r.wd, n: r.n, status: 'offen' });
        save(o);
        pending = { id: r.id, until: Date.now() + PENDING_MS };
        sayCard('Routine merken?', KINDS[r.k].label + ' · ' + dayText(r.wd) + ' · ' + hhmm(r.m) + ' · Sag Ja oder Nein', offerText(r), true);
        return true;
    }
    function answer(yes) {
        const o = load();
        const r = pending && o.routines.find(x => x.id === pending.id);
        pending = null;
        if (!r) return false;
        if (yes) {
            r.status = 'ja';
            save(o);
            const t = 'Gut, ich habe mir die Routine gemerkt: ' + KINDS[r.k].label + ' ' + dayText(r.wd) + ' gegen ' + spokenTime(r.m) + '. Du kannst sie jederzeit mit „Vergiss die Routine“ löschen.';
            sayCard('Routine gemerkt', KINDS[r.k].label + ' · ' + dayText(r.wd) + ' · ' + hhmm(r.m), t, false);
        } else {
            r.status = 'nein';
            save(o);
            sayCard('Okay', 'Danach frage ich nicht mehr.', 'Okay, danach frage ich nicht mehr.', false);
        }
        return true;
    }

    /* ---------- Unterstützen (Hinweis kurz vor der Zeit) ---------- */
    function maybeHint(o) {
        const b = berlin();
        for (const r of o.routines) {
            if (r.status !== 'ja' || r.wd.indexOf(b.wd) < 0) continue;
            if (r.hinted === b.day) continue;
            const diff = r.m - b.min;
            if (diff > HINT_BEFORE || diff < -5) continue;   // nur im Fenster [Zeit-10 min, Zeit+5 min]
            r.hinted = b.day;
            // schon getan? Dann kein Hinweis.
            const done = o.log.some(e => e.k === r.k && e.d === b.day && Math.abs(e.m - r.m) <= WINDOW_MIN * 2);
            save(o);
            if (done) continue;
            sayCard('Routine: ' + KINDS[r.k].label, 'Gegen ' + hhmm(r.m), 'Kleine Erinnerung: ' + KINDS[r.k].hint, false);
            return true;
        }
        return false;
    }

    /* ---------- Taktgeber ---------- */
    const STARTED = Date.now();
    function tick() {
        try {
            if (!enabled()) return;
            if (Date.now() - STARTED < 5 * 60 * 1000) return;   // nach dem Start erst nach 5 Minuten
            if (typeof wachterEnabled === 'function' && !wachterEnabled()) return;
            if (pending && pending.until < Date.now()) pending = null;   // unbeantwortet: später nicht erneut dieselbe Frage (steht als 'offen')
            if (quiet() || !idle() || pending) return;
            const o = load();
            if (maybeHint(o)) return;
            // 'offen' ohne Antwort verfällt nach einem Tag: wird später ggf. neu vorgeschlagen
            const b = berlin();
            o.routines = o.routines.filter(r => !(r.status === 'offen' && o.state.offerDay !== b.day));
            maybeOffer(o);
        } catch (e) {}
    }
    setInterval(tick, 60000);

    /* ---------- Beobachter in den Aktionen (Sprache und Tippen) ---------- */
    try {
        if (typeof window.executeAction === 'function' && !window.executeAction._routinen) {
            const original = window.executeAction;
            const wrapped = function (action) {
                try { const k = action && ACTION_KIND[action.type]; if (k) record(k); else if (action && action.calendar_text) record('termin'); } catch (e) {}
                return original.apply(this, arguments);
            };
            wrapped._routinen = true;
            Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
            window.executeAction = wrapped;
        }
    } catch (e) {}
    ['openPhotoCamera', 'openPhotoGallery'].forEach(fn => {
        try {
            const original = window[fn];
            if (typeof original !== 'function' || original._routinen) return;
            const wrapped = function () { record('foto'); return original.apply(this, arguments); };
            wrapped._routinen = true;
            window[fn] = wrapped;
        } catch (e) {}
    });

    /* ---------- Sprachbefehle ---------- */
    const norm = s => String(s || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();
    const YES = /^(?:ja|jo|jep|jawohl|gerne|gern|klar|okay|ok|mach das|bitte|ja bitte|ja gerne|ja gern|merk dir das|natürlich)$/;
    const NO = /^(?:nein|nö|nee|nein danke|danke nein|lieber nicht|nicht nötig|lass (?:es|das)|kein bedarf|nein bitte nicht)$/;

    function listText() {
        const o = load();
        const mine = o.routines.filter(r => r.status === 'ja');
        if (!mine.length) {
            return 'Ich habe noch keine Routine gemerkt. Ich beobachte, was du tust, und frage dich, sobald mir etwas dreimal ähnlich auffällt.';
        }
        const names = mine.map(r => KINDS[r.k].label + ' ' + dayText(r.wd) + ' gegen ' + spokenTime(r.m));
        return mine.length === 1 ? 'Ich kenne eine Routine: ' + names[0] + '.' : 'Ich kenne ' + mine.length + ' Routinen: ' + names.join('; ') + '.';
    }
    function learnedText() {
        const o = load();
        const cands = detect(o.log);
        const known = o.routines.filter(r => r.status === 'ja');
        if (!known.length && !cands.length) return 'Ich beobachte noch. Es sind ' + o.log.length + ' Vorgänge notiert, aber noch nichts, was sich an drei Tagen ähnlich wiederholt.';
        let t = listText();
        const fresh = cands.filter(c => !o.routines.some(r => r.id === c.id));
        if (fresh.length) t += ' Außerdem fällt mir auf: ' + fresh.slice(0, 2).map(c => KINDS[c.k].label + ' ' + dayText(c.wd) + ' gegen ' + spokenTime(c.m)).join('; ') + '. Danach frage ich dich bei Gelegenheit.';
        return t;
    }
    function forget(t) {
        const o = load();
        if (/alle routinen|alles/.test(t)) {
            const n = o.routines.filter(r => r.status === 'ja').length;
            o.routines = o.routines.filter(r => r.status === 'nein');   // abgelehnte bleiben, damit nicht neu gefragt wird
            o.log = [];
            save(o);
            return n ? 'Alle Routinen und die Aufzeichnung sind gelöscht.' : 'Die Aufzeichnung ist gelöscht. Gemerkte Routinen gab es nicht.';
        }
        const hit = o.routines.filter(r => r.status === 'ja' && (t.indexOf(r.k) >= 0 || norm(KINDS[r.k].label).split(' ').some(w => w.length > 4 && t.indexOf(w.slice(0, 5)) >= 0)));
        if (!hit.length) return 'Welche Routine soll ich vergessen? Du kannst fragen: „Welche Routinen kennst du?“';
        o.routines = o.routines.filter(r => hit.indexOf(r) < 0);
        o.log = o.log.filter(e => !hit.some(r => r.k === e.k));
        save(o);
        return hit.length === 1 ? 'Die Routine ' + KINDS[hit[0].k].label + ' ist vergessen.' : hit.length + ' Routinen sind vergessen.';
    }

    function handler(text, next) {
        const t = norm(text);
        // Antwort auf meine Frage
        if (pending && pending.until > Date.now()) {
            if (YES.test(t)) { if (answer(true)) return true; }
            else if (NO.test(t)) { if (answer(false)) return true; }
        }
        if (/routine|was hast du gelernt/.test(t) || /^was hast du (?:über mich )?gelernt$/.test(t)) {
            const say = s => { try { speak(s, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} return true; };
            if (/(?:vergiss|lösche|loesche|entferne|streich)\w*/.test(t) && /routine/.test(t)) return say(forget(t));
            if (/routinen? (?:aus|ab|stopp|aufhören)|keine routinen|hör auf.*routine|nicht mehr.*beobacht/.test(t)) {
                try { setPersistentData(OFF_KEY, '1'); } catch (e) {}
                return say('Okay, ich lerne keine Routinen mehr und merke mir nichts mehr dazu. Schon gemerkte bleiben, bis du sie löschst.');
            }
            if (/routinen? (?:an|ein|starten|wieder)|lerne.*routine/.test(t)) {
                try { setPersistentData(OFF_KEY, ''); } catch (e) {}
                return say('Gut, ich beobachte wieder, was sich bei dir wiederholt, und frage dich, bevor ich mir etwas merke.');
            }
            if (/welche|kennst|zeig|nenn|was fuer|was für|gelernt|liste|habe ich/.test(t)) return say(/gelernt/.test(t) ? learnedText() : listText());
        }
        if (/^was hast du gelernt/.test(t)) {
            try { speak(learnedText(), typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {}
            return true;
        }
        // Normaler Satz: mitzählen, dann unverändert weiter
        const k = kindOfText(t);
        if (k) record(k);
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('routinen', handler, 20);

    window._routinenTest = { pendingInfo: function () { return pending; }, load, detect, record, tick, handler, listText, berlin };
})();
