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

    const original = window.executeAction;
    if (!original._geburtstagGanztag) {
        const wrapped = async function (action, text, ctx) {
            try {
                if (action && (action.type === 'calendar' || action.calendar_text)) {
                    const titel = String(action.calendar_text || '').replace(/\s+/g, ' ').trim();
                    const tag = isoDay(action.calendar_time);
                    const fest = FEST.test(titel);
                    const ganz = action.calendar_allday === true || action.calendar_allday === 'true';
                    if (titel && tag && (fest || ganz)) {
                        const rrule = fest && typeof buildRecurrenceRule === 'function' ? buildRecurrenceRule('JAHR', 1) : (typeof buildRecurrenceRule === 'function' ? buildRecurrenceRule(action.calendar_recurrence_unit, action.calendar_recurrence_interval) : null);
                        const done = await addGoogleCalendarEvent(titel, tag + 'T12:00:00', '', rrule, true);
                        if (done === false && typeof googleNotSynced === 'function') googleNotSynced(ctx, 'Der Eintrag ist nur in der App gespeichert, das Handy klingelt dazu nicht');
                        try { updateTerminalStream('CALENDAR: ALLDAY_ADDED'); } catch (e) {}
                        return;
                    }
                }
            } catch (e) { console.error('Geburtstag ganztägig', e); }
            return original.apply(this, arguments);
        };
        wrapped._geburtstagGanztag = true;
        Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
        window.executeAction = wrapped;
    }

    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'geburtstag-ganztag', function (next) {
            return next() + '\n\nAUSNAHME bei neuen Terminen: Geburtstage, Jahrestage, Hochzeitstage und Namenstage brauchen KEINE Uhrzeit. Frage dafür NIE nach einer Uhrzeit. Lege sofort die Aktion "calendar" an mit "calendar_text" = z.B. "Alyssas Geburtstag" (Name im Genitiv, das Wort Geburtstag bleibt im Titel), "calendar_time" = der Tag als YYYY-MM-DDT12:00:00 (das nächste Vorkommen dieses Datums ab heute) und "calendar_allday" = true. Die Wiederholung jedes Jahr und die Ganztägigkeit setzt die App selbst. Sagt der User ausdrücklich "ganztägig" oder "den ganzen Tag" (Urlaub, Feiertag, Ausflug), setze ebenfalls "calendar_allday" = true und frage nicht nach einer Uhrzeit.';
        }, 216);
    }
    window.jvGeburtstagGanztag = { FEST };
})();
