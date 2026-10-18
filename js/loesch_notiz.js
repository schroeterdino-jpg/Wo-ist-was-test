/* ============================================================
   LOESCH_NOTIZ: Löschst du einen Termin, eine Erinnerung, einen Einkauf oder eine Aufgabe von Hand in der App, erfuhr die KI davon nichts.
   Sie las im Gespräch noch "Erinnerung für 14:30 angelegt" und antwortete auf "Habe ich eine Erinnerung?" mit Ja, obwohl die Liste leer war.
   Jetzt trägt die App beim Löschen von Hand eine kurze Notiz in den Gesprächsverlauf ein ("... wurde gelöscht und existiert nicht mehr").
   Beim Löschen per Sprache passiert das schon über die Rückmeldung der Aktion; dort wird nichts doppelt eingetragen (nur wenn gerade nichts verarbeitet wird).
   Braucht: storage.js (chatHistory, Listen), calendar.js (deleteCalendarEntry, deleteReminderEntry), lists.js (deleteTodoEntry, deleteShoppingEntry).
   Muss nach diesen Dateien geladen werden.
   ============================================================ */
(function () {
    'use strict';
    function arbeitetGerade() { try { return typeof isProcessing !== 'undefined' && !!isProcessing; } catch (e) { return false; } }
    function notiz(art, text) {
        try {
            if (arbeitetGerade() || typeof chatHistory === 'undefined' || !Array.isArray(chatHistory)) return;
            const t = String(text || '').slice(0, 120);
            if (!t) return;
            // am Mitschreiber der Langzeit-Merkliste vorbei: das ist kein Gespräch
            Array.prototype.push.call(chatHistory,
                { role: 'user', content: '[Hinweis der App, kein Gespräch: ' + art + ' „' + t + '“ wurde soeben von Hand gelöscht und existiert nicht mehr. Frühere Nachrichten dazu gelten nicht mehr.]' },
                { role: 'assistant', content: JSON.stringify({ reply: 'Verstanden.', actions: [] }) });
        } catch (e) { }
    }
    function umhuellen(name, art, suche) {
        try {
            const orig = window[name];
            if (typeof orig !== 'function' || orig._loeschNotiz) return;
            const neu = function (id) {
                let text = '';
                try { const e = suche(id); text = e && e.text ? e.text : ''; } catch (x) { }
                const r = orig.apply(this, arguments);
                if (text) notiz(art, text);
                return r;
            };
            neu._loeschNotiz = true;
            window[name] = neu;
        } catch (e) { }
    }
    umhuellen('deleteReminderEntry', 'Die Erinnerung', id => reminderEntries.find(e => e.id === id));
    umhuellen('deleteCalendarEntry', 'Der Termin', id => calendarEntries.find(e => e.id === id));
    umhuellen('deleteTodoEntry', 'Die Aufgabe', id => todoEntries.find(e => e.id === id));
    umhuellen('deleteShoppingEntry', 'Der Einkaufseintrag', id => shoppingEntries.find(e => e.id === id));
})();
