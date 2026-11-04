/* ============================================================
   REGISTRY-FÄHIGKEITEN (Phase 2): meldet die ersten fünf bestehenden Fähigkeiten bei window.jvRegistry (js/registry.js) an:
     ortssuche, websuche, erinnerung_erstellen, termin_erstellen, gedaechtnis_speichern
   Jede Fähigkeit RUFT DEN BESTEHENDEN CODE AUF (findNearbyRestaurants, answerWithWebSearch, executeAction mit der Aktion reminder / calendar / memory_store).
   Es gibt keine zweite Implementierung. NICHT PRODUKTIV: Nichts in der App ruft die Registry auf, nur die Tests.

   Neue Fähigkeit später: in eine NEUE Datei window.jvRegistry.registriere({...}) schreiben und in index.html einhängen. Der Kern (registry.js) und
   die KI-Steuerung müssen dafür nicht geändert werden. Wirkt die Fähigkeit auf Daten, MUSS pruefeErfolg die Wirkung nachweisen (siehe registry.js).

   Zugriff auf den Zustand der App (Listen) nur lesend und nur für die Erfolgsprüfung; geschrieben wird ausschließlich von der bestehenden Funktion.
   ============================================================ */
(function () {
    'use strict';
    var R = window.jvRegistry;
    if (!R || R.namen().indexOf('ortssuche') >= 0) return;

    /* ---- Hilfen ---- */
    function liste(name) {   // Listen der App (let-Variablen anderer Skripte sind mit dem bloßen Namen erreichbar, nicht über window)
        try {
            if (name === 'reminderEntries') return typeof reminderEntries !== 'undefined' && Array.isArray(reminderEntries) ? reminderEntries : null;
            if (name === 'calendarEntries') return typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries) ? calendarEntries : null;
        } catch (e) { }
        return null;
    }
    function speicher() { try { return typeof memoryItems !== 'undefined' && memoryItems && typeof memoryItems === 'object' ? memoryItems : null; } catch (e) { return null; } }
    function ctxNeu(kontext) {
        var c = kontext && kontext.ctx;
        if (c && Array.isArray(c.cards) && Array.isArray(c.notes)) return c;
        return { counter: 0, cards: [], notes: [], panel: null };
    }
    function satzDesNutzers(kontext, params, feld) { return String((kontext && kontext.text) || params[feld] || ''); }
    function setze(a, k, v) { if (v !== undefined && v !== null && v !== '') a[k] = v; }

    /* Phase-1-Sicherheit: dieselbe Prüfung wie in assistant.js, bevor eine Schreib-Aktion gebaut wird. */
    function sicherheit(aktion) {
        try {
            if (!window.jvSicher || typeof window.jvSicher.pruefe !== 'function') return null;
            var art = window.jvSicher.pruefe(aktion);
            if (art === 'unvollstaendig') return { status: 'NEEDS_INFORMATION', nachricht: window.jvSicher.texte.unvollstaendig };
            if (art) return { status: 'CAPABILITY_MISSING', nachricht: window.jvSicher.texte.fehlt };
        } catch (e) { }
        return null;
    }
    function actionsDa() { return typeof executeAction === 'function'; }

    /* Gemeinsamer Ablauf der drei Schreib-Fähigkeiten: bestehende executeAction aufrufen, vorher/nachher messen. */
    async function schreibe(aktion, text, kontext, zaehler) {
        var ctx = ctxNeu(kontext);
        var vorher = zaehler();
        var nichtsVorher = (ctx[Symbol.for('jv.nichtsGetan')] || []).length;
        await executeAction(aktion, text, ctx);
        var nachher = zaehler();
        var nichts = (ctx[Symbol.for('jv.nichtsGetan')] || []).slice(nichtsVorher);
        return { vorher: vorher, nachher: nachher, hinweise: ctx.notes.slice(), nichtsGetan: nichts, nachricht: nichts[0] || ctx.notes.join(' ') };
    }

    var STAND = 'Wie bisher legt Jarvis das ohne Rückfrage an; die Registry ändert daran in dieser Phase nichts.';

    /* ---------------- 1. Ortssuche ---------------- */
    R.registriere({
        name: 'ortssuche',
        beschreibung: 'Sucht Restaurants und Lokale in der Nähe oder in einem genannten Ort und liefert die nächsten Treffer mit Entfernung und Kartenlink.',
        pflicht: [{ name: 'suchbegriff', typ: 'text', beschreibung: 'Was gesucht wird, zum Beispiel "Pizzeria" oder "Restaurant".' }],
        optional: [{ name: 'ort', typ: 'text', beschreibung: 'Ort, in dem gesucht wird. Ohne Angabe wird um den Standort des Nutzers gesucht.' }],
        rueckgabe: { beschreibung: 'Gesprochener Satz plus Karten der bis zu fünf nächsten Treffer.', felder: ['reply', 'cards', 'nachricht'] },
        fehler: [
            { status: 'NO_RESULTS', wann: 'Im Umkreis wurde nichts gefunden.' },
            { status: 'TOOL_FAILED', wann: 'Standort nicht verfügbar oder Suchdienst nicht erreichbar.' },
            { status: 'NEEDS_INFORMATION', wann: 'Kein Suchbegriff angegeben.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Ortssuche ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: ['websuche'],
        bestaetigung: { noetig: false, grund: 'Reine Auskunft ohne Änderung von Daten.' },
        pruefeErfolg: function (d) { return !!d && typeof d.reply === 'string' && !!d.reply.trim() && Array.isArray(d.cards) && d.cards.length > 0; },
        verbindung: { datei: 'js/nearby.js', funktion: 'findNearbyRestaurants', aktion: 'nearby_places' },
        verfuegbar: function () { return typeof findNearbyRestaurants === 'function'; },
        leer: function (d) { return !!d && Array.isArray(d.cards) && d.cards.length === 0; },
        ausfuehren: async function (p) {
            /* Die bestehende Funktion liest den Ort aus window.jvLetzterText. Für den Aufruf setzen wir ihn auf den gewünschten Ort (oder leer = um den Nutzer herum)
               und stellen ihn danach sofort wieder her. */
            var alt = window.jvLetzterText;
            window.jvLetzterText = p.ort ? 'in ' + String(p.ort).trim() : '';
            try {
                var res = await findNearbyRestaurants(String(p.suchbegriff));
                return { reply: res.reply, cards: res.cards, nachricht: res.reply };
            } finally { window.jvLetzterText = alt; }
        }
    });

    /* ---------------- 2. Websuche ---------------- */
    R.registriere({
        name: 'websuche',
        beschreibung: 'Beantwortet eine Frage mit aktuellen Informationen aus dem Internet (Nachrichten, Fernsehprogramm, Öffnungszeiten ...).',
        pflicht: [{ name: 'frage', typ: 'text', beschreibung: 'Die Frage des Nutzers im Wortlaut.' }],
        optional: [{ name: 'suchbegriff', typ: 'text', beschreibung: 'Verdichtete Suchanfrage, wenn sie sich von der Frage unterscheidet.' }],
        rueckgabe: { beschreibung: 'Die fertige, gesprochene Antwort als Text.', felder: ['antwort', 'nachricht'] },
        fehler: [
            { status: 'TOOL_FAILED', wann: 'Der Suchdienst antwortet nicht oder liefert nichts Brauchbares.' },
            { status: 'NEEDS_INFORMATION', wann: 'Keine Frage angegeben.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Websuche ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: 'Reine Auskunft ohne Änderung von Daten.' },
        pruefeErfolg: function (d) { return !!d && typeof d.antwort === 'string' && !!d.antwort.trim(); },
        verbindung: { datei: 'js/answers.js', funktion: 'answerWithWebSearch', aktion: 'web_lookup' },
        verfuegbar: function () { return typeof answerWithWebSearch === 'function'; },
        ausfuehren: async function (p) {
            var antwort = await answerWithWebSearch(String(p.frage), p.suchbegriff ? String(p.suchbegriff) : '');
            if (!antwort) { var e = new Error('Websuche ohne Antwort'); e.userMessage = 'Die Suche im Internet hat gerade nicht geklappt. Versuch es bitte gleich noch einmal.'; throw e; }
            return { antwort: antwort, nachricht: antwort };
        }
    });

    /* ---------------- 3. Erinnerung erstellen ---------------- */
    function erinnerungAktion(p) {
        var a = { type: 'reminder', reminder_text: String(p.text).trim() };
        setze(a, 'reminder_time', p.zeit);
        if (p.wichtig !== undefined && p.wichtig !== '') a.reminder_important = (p.wichtig === true || p.wichtig === 'true');
        setze(a, 'reminder_recurrence_unit', p.wiederholung_einheit);
        setze(a, 'reminder_recurrence_interval', p.wiederholung_intervall);
        return a;
    }
    R.registriere({
        name: 'erinnerung_erstellen',
        beschreibung: 'Legt eine Erinnerung an, die zur gewünschten Zeit klingelt, auf Wunsch wiederkehrend und als wichtig markiert.',
        pflicht: [{ name: 'text', typ: 'text', beschreibung: 'Woran erinnert werden soll.' }],
        optional: [
            { name: 'zeit', typ: 'zeit', beschreibung: 'Zeitpunkt als ISO-Zeit, zum Beispiel 2026-11-05T08:00:00. Ohne Angabe gilt die Regel der bestehenden Funktion.' },
            { name: 'wichtig', typ: 'ja_nein', beschreibung: 'Wichtige Erinnerung (klingelt eindringlicher).' },
            { name: 'wiederholung_einheit', typ: 'text', beschreibung: 'Einheit der Wiederholung (zum Beispiel day, week).' },
            { name: 'wiederholung_intervall', typ: 'zahl', beschreibung: 'Alle wie viele Einheiten die Erinnerung wiederkehrt.' }
        ],
        rueckgabe: { beschreibung: 'Anzahl der Erinnerungen vorher und nachher, Hinweise (zum Beispiel "nur in der App gespeichert").', felder: ['vorher', 'nachher', 'hinweise', 'nichtsGetan', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Kein Erinnerungstext angegeben.' },
            { status: 'TOOL_FAILED', wann: 'Es wurde keine Erinnerung nachweisbar angelegt, oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Aktionsausführung ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: ['termin_erstellen'],
        bestaetigung: { noetig: false, grund: STAND },
        pruefeErfolg: function (d) { return !!d && d.nachher > d.vorher && (!d.nichtsGetan || d.nichtsGetan.length === 0); },
        verbindung: { datei: 'js/actions.js', funktion: 'executeAction', aktion: 'reminder' },
        verfuegbar: function () { return actionsDa() && !!liste('reminderEntries'); },
        vorpruefung: function (p) { return sicherheit(erinnerungAktion(p)); },
        ausfuehren: function (p, kontext) {
            return schreibe(erinnerungAktion(p), satzDesNutzers(kontext, p, 'text'), kontext, function () { var l = liste('reminderEntries'); return l ? l.length : 0; });
        }
    });

    /* ---------------- 4. Kalendertermin erstellen ---------------- */
    function terminAktion(p) {
        var a = { type: 'calendar', calendar_text: String(p.text).trim(), calendar_time: p.zeit };
        setze(a, 'calendar_location', p.ort);
        if (p.dauer_minuten !== undefined && p.dauer_minuten !== '') a.calendar_duration = +p.dauer_minuten;
        setze(a, 'calendar_recurrence_unit', p.wiederholung_einheit);
        setze(a, 'calendar_recurrence_interval', p.wiederholung_intervall);
        return a;
    }
    R.registriere({
        name: 'termin_erstellen',
        beschreibung: 'Trägt einen Termin in den Kalender ein (auch bei Google, wenn verbunden), auf Wunsch mit Ort, Dauer und Wiederholung.',
        pflicht: [
            { name: 'text', typ: 'text', beschreibung: 'Titel des Termins.' },
            { name: 'zeit', typ: 'zeit', beschreibung: 'Beginn als ISO-Zeit, zum Beispiel 2026-11-05T10:00:00.' }
        ],
        optional: [
            { name: 'ort', typ: 'text', beschreibung: 'Ort des Termins.' },
            { name: 'dauer_minuten', typ: 'zahl', beschreibung: 'Länge in Minuten (Standard der bestehenden Funktion: 60).' },
            { name: 'wiederholung_einheit', typ: 'text', beschreibung: 'Einheit der Wiederholung (zum Beispiel day, week).' },
            { name: 'wiederholung_intervall', typ: 'zahl', beschreibung: 'Alle wie viele Einheiten der Termin wiederkehrt.' }
        ],
        rueckgabe: { beschreibung: 'Anzahl der Termine vorher und nachher, Hinweise (zum Beispiel "nur in der App gespeichert").', felder: ['vorher', 'nachher', 'hinweise', 'nichtsGetan', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Titel oder Zeit fehlen.' },
            { status: 'TOOL_FAILED', wann: 'Es wurde kein Termin nachweisbar angelegt, oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Aktionsausführung ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: ['erinnerung_erstellen'],
        bestaetigung: { noetig: false, grund: STAND },
        pruefeErfolg: function (d) { return !!d && d.nachher > d.vorher && (!d.nichtsGetan || d.nichtsGetan.length === 0); },
        verbindung: { datei: 'js/actions.js', funktion: 'executeAction', aktion: 'calendar' },
        verfuegbar: function () { return actionsDa() && !!liste('calendarEntries'); },
        vorpruefung: function (p) { return sicherheit(terminAktion(p)); },
        ausfuehren: function (p, kontext) {
            return schreibe(terminAktion(p), satzDesNutzers(kontext, p, 'text'), kontext, function () { var l = liste('calendarEntries'); return l ? l.length : 0; });
        }
    });

    /* ---------------- 5. Gedächtniseintrag speichern ---------------- */
    function gedaechtnisAktion(p) {
        var a = { type: 'memory_store', memory_key: String(p.schluessel).trim() };
        setze(a, 'memory_value', p.wert);
        return a;
    }
    R.registriere({
        name: 'gedaechtnis_speichern',
        beschreibung: 'Merkt sich eine Information unter einem Stichwort, damit Jarvis sie später wiederfindet.',
        pflicht: [{ name: 'schluessel', typ: 'text', beschreibung: 'Stichwort, unter dem gemerkt wird, zum Beispiel "schlüssel".' }],
        optional: [{ name: 'wert', typ: 'text', beschreibung: 'Was gemerkt wird, zum Beispiel "im Auto". Ohne Angabe speichert die bestehende Funktion "gespeichert".' }],
        rueckgabe: { beschreibung: 'Stichwort und der tatsächlich gespeicherte Wert.', felder: ['schluessel', 'gespeichert', 'hinweise', 'nichtsGetan', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Kein Stichwort angegeben.' },
            { status: 'TOOL_FAILED', wann: 'Der Eintrag ist danach nicht im Gedächtnis zu finden, oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Aktionsausführung ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: STAND },
        pruefeErfolg: function (d) { return !!d && typeof d.gespeichert === 'string' && d.gespeichert.length > 0 && (!d.nichtsGetan || d.nichtsGetan.length === 0); },
        verbindung: { datei: 'js/actions.js', funktion: 'executeAction', aktion: 'memory_store' },
        verfuegbar: function () { return actionsDa() && !!speicher(); },
        vorpruefung: function (p) { return sicherheit(gedaechtnisAktion(p)); },
        ausfuehren: async function (p, kontext) {
            var a = gedaechtnisAktion(p), ctx = ctxNeu(kontext);
            var nichtsVorher = (ctx[Symbol.for('jv.nichtsGetan')] || []).length;
            await executeAction(a, satzDesNutzers(kontext, p, 'schluessel'), ctx);
            var m = speicher(), key = a.memory_key.toLowerCase().trim();
            var nichts = (ctx[Symbol.for('jv.nichtsGetan')] || []).slice(nichtsVorher);
            return { schluessel: key, gespeichert: (m && typeof m[key] === 'string') ? m[key] : '', hinweise: ctx.notes.slice(), nichtsGetan: nichts, nachricht: nichts[0] || ctx.notes.join(' ') };
        }
    });

    var lose = R.pruefeVerweise();
    if (lose.length) { try { console.warn('Jarvis-Registry: Fallback nicht angemeldet', JSON.stringify(lose)); } catch (e) { } }
})();
