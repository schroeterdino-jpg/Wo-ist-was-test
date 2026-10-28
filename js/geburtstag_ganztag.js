/* ============================================================
   GEBURTSTAG GANZTAG: "Trag Alyssas Geburtstag am 30. Oktober ein" braucht keine Uhrzeit. Geburtstage und Jahrestage werden als GANZTÄGIGER Termin eingetragen
   und wiederholen sich jedes Jahr (Google Kalender: ganztägig, jährlich). Zane fragt dafür nicht mehr nach einer Uhrzeit.
   Dasselbe gilt, wenn die KI einen Termin ausdrücklich als ganztägig markiert ('calendar_allday'), dann ohne Wiederholung.
   Braucht: actions.js (executeAction), calendar.js (addGoogleCalendarEvent), reminders.js (buildRecurrenceRule), commands/jvChain. Muss NACH langzeit.js geladen werden.
   ============================================================ */
(function () {
    if (typeof window.executeAction !== 'function' || typeof window.addGoogleCalendarEvent !== 'function') return;

    const FEST = /geburtstag|jahrestag|hochzeitstag|namenstag/i;
    function isoDay(s) { const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2})/); return m ? m[1] : ''; }

    function normT(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
    /* Gibt es am selben Tag schon einen Eintrag mit demselben Titel? Fragt Google direkt (auch jährliche Wiederholungen werden aufgelöst), sonst die App-Liste. */
    async function schonDa(titel, tag) {
        const n = normT(titel);
        if (!n) return false;
        try {
            if (typeof isGoogleAuthorized === 'function' && isGoogleAuthorized() && typeof accessToken !== 'undefined' && accessToken) {
                const von = new Date(tag + 'T00:00:00').getTime() - 12 * 3600000, bis = new Date(tag + 'T00:00:00').getTime() + 36 * 3600000;
                const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events?singleEvents=true&maxResults=50&timeMin=' + encodeURIComponent(new Date(von).toISOString()) + '&timeMax=' + encodeURIComponent(new Date(bis).toISOString());
                const res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
                if (res.ok) {
                    const d = await res.json();
                    return (d.items || []).some(function (e) {
                        const st = e.start && (e.start.date || String(e.start.dateTime || '').slice(0, 10));
                        return st === tag && normT(e.summary) === n;
                    });
                }
            }
        } catch (e) { }
        try {
            return (typeof calendarEntries !== 'undefined' ? calendarEntries : []).some(function (e) { return e && isoDay(e.isoDate) === tag && normT(e.text) === n; });
        } catch (e) { return false; }
    }

    const original = window.executeAction;
    if (!original._geburtstagGanztag) {
        // A5: Die Umhüllung wird über die Aktions-Kette (aktionen_kette.js) angemeldet, Rang 30. Fehlt die Kette, legt die Datei sie wie früher selbst um window.executeAction.
        const baue = function (original) {
            const wrapped = async function (action, text, ctx) {
                try {
                    if (action && (action.type === 'calendar' || action.calendar_text)) {
                        const titel = String(action.calendar_text || '').replace(/\s+/g, ' ').trim();
                        const tag = isoDay(action.calendar_time);
                        const fest = FEST.test(titel);
                        const ganz = action.calendar_allday === true || action.calendar_allday === 'true';
                        if (titel && tag && (fest || ganz)) {
                            if (await schonDa(titel, tag)) {
                                if (ctx && Array.isArray(ctx.notes)) ctx.notes.push('"' + titel + '" steht am ' + tag.split('-').slice(1).reverse().join('.') + '. schon im Kalender, ich habe es nicht doppelt eingetragen.');
                                try { if (typeof openGoogleCalendarApp === 'function') openGoogleCalendarApp(tag + 'T12:00:00'); } catch (e) { }
                                return;
                            }
                            const rrule = fest && typeof buildRecurrenceRule === 'function' ? buildRecurrenceRule('JAHR', 1) : (typeof buildRecurrenceRule === 'function' ? buildRecurrenceRule(action.calendar_recurrence_unit, action.calendar_recurrence_interval) : null);
                            const done = await addGoogleCalendarEvent(titel, tag + 'T12:00:00', '', rrule, true);
                            if (done === false && typeof googleNotSynced === 'function') googleNotSynced(ctx, 'Der Eintrag ist nur in der App gespeichert, das Handy klingelt dazu nicht');
                            // wie bei normalen Terminen: den echten Google Kalender als sichtbare Bestätigung öffnen
                            if (done !== false) { try { if (typeof openGoogleCalendarApp === 'function') openGoogleCalendarApp(tag + 'T12:00:00'); } catch (e) { } }
                            try { updateTerminalStream('CALENDAR: ALLDAY_ADDED'); } catch (e) {}
                            return;
                        }
                    }
                } catch (e) { console.error('Geburtstag ganztägig', e); }
                return original.apply(this, arguments);
            };
            wrapped._geburtstagGanztag = true;
            Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
            return wrapped;
        };
        if (window.jvAktionen && typeof window.jvAktionen.huelle === 'function') window.jvAktionen.huelle('geburtstag_ganztag', 30, baue);
        else window.executeAction = baue(original);
    }

    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'geburtstag-ganztag', function (next) {
            return next() + '\n\nAUSNAHME bei neuen Terminen: Geburtstage, Jahrestage, Hochzeitstage und Namenstage brauchen KEINE Uhrzeit. Frage dafür NIE nach einer Uhrzeit. Lege sofort die Aktion "calendar" an mit "calendar_text" = z.B. "Alyssas Geburtstag" (Name im Genitiv, das Wort Geburtstag bleibt im Titel), "calendar_time" = der Tag als YYYY-MM-DDT12:00:00 (das nächste Vorkommen dieses Datums ab heute) und "calendar_allday" = true. Die Wiederholung jedes Jahr und die Ganztägigkeit setzt die App selbst. Sagt der User ausdrücklich "ganztägig" oder "den ganzen Tag" (Urlaub, Feiertag, Ausflug), setze ebenfalls "calendar_allday" = true und frage nicht nach einer Uhrzeit.';
        }, 216);
    }
    window.jvGeburtstagGanztag = { FEST };
})();
