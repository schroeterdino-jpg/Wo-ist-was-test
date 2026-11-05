/* ============================================================
   REGISTRY-FÄHIGKEITEN (Phase 2): meldet die ersten fünf bestehenden Fähigkeiten bei window.jvRegistry (js/registry.js) an:
     ortssuche, websuche, erinnerung_erstellen, termin_erstellen, gedaechtnis_speichern
   Jede Fähigkeit RUFT DEN BESTEHENDEN CODE AUF (findNearbyRestaurants, answerWithWebSearch, executeAction mit der Aktion reminder / calendar / memory_store).
   Es gibt keine zweite Implementierung. NICHT PRODUKTIV: Nichts in der App ruft die Registry auf, nur die Tests.

   Neue Fähigkeit später: in eine NEUE Datei window.jvRegistry.registriere({...}) schreiben und in index.html einhängen. Der Kern (registry.js) und
   die KI-Steuerung müssen dafür nicht geändert werden. Wirkt die Fähigkeit auf Daten, MUSS pruefeErfolg die Wirkung nachweisen (siehe registry.js).

   Zugriff auf den Zustand der App (Listen, Gedächtnis über die bestehende Suche searchMemory) nur lesend und nur für die Erfolgsprüfung; geschrieben wird ausschließlich von der bestehenden Funktion.
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
    function gemerkt(key) {   // liest über die bestehende Suche (nur lesend) und nimmt nur den Treffer mit genau diesem Stichwort
        try {
            if (typeof searchMemory !== 'function') return '';
            var t = searchMemory(key) || [];
            for (var n = 0; n < t.length; n++) if (t[n] && String(t[n].key).toLowerCase() === key && typeof t[n].value === 'string') return t[n].value;
        } catch (e) { }
        return '';
    }
    /* Welcher Wert nach dem Speichern UNTER DEM STICHWORT stehen muss: dieselben bestehenden Funktionen wie in executeAction (parseMemoryValue, jvFestnamen),
       danach so, wie searchMemory ihn zurückgibt. */
    function erwarteterWert(a) {
        try {
            var s = String(parseMemoryValue(a.memory_value || 'gespeichert'));
            try { if (typeof window.jvFestnamen === 'function') s = window.jvFestnamen(s); } catch (e) { }
            return String(parseMemoryValue(s));
        } catch (e) { return ''; }
    }
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

    /* ---- Erfolgsnachweis der Schreib-Fähigkeiten: nicht "es sind mehr Einträge", sondern "genau der gewünschte neue Eintrag ist da" ---- */
    var BERLIN = 'Europe/Berlin';
    function gleicherText(a, b) { return String(a == null ? '' : a).trim().toLowerCase() === String(b == null ? '' : b).trim().toLowerCase(); }
    function tagVon(d) { return d.toLocaleDateString('sv-SE', { timeZone: BERLIN }); }
    function uhrVon(d) { return d.toLocaleTimeString('sv-SE', { timeZone: BERLIN, hour: '2-digit', minute: '2-digit' }); }
    /* Bei einer Wiederholung verschiebt die bestehende Funktion den ersten Termin auf den passenden Wochentag: dann zählt nur die Uhrzeit. */
    function wiederholungMoeglich(p, kontext) {
        return !!(p.wiederholung_einheit || p.wiederholung_intervall || /\bjede[nrms]?\b|täglich|wöchentlich|monatlich|jährlich|\balle\s+\d|werktags/i.test(String((kontext && kontext.text) || '')));
    }
    function zeitPasst(eintragZeit, gewuenscht, locker) {
        var b = new Date(gewuenscht);
        if (isNaN(b.getTime())) return false;
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(eintragZeit))) return String(eintragZeit) === tagVon(b);   // ganztägiger Eintrag: nur der Tag
        var a = new Date(eintragZeit);
        if (isNaN(a.getTime())) return false;
        return locker ? uhrVon(a) === uhrVon(b) : Math.abs(a.getTime() - b.getTime()) < 60000;
    }
    function erinnerungPasst(e, p, kontext) {
        return !!e && gleicherText(e.text, p.text) && zeitPasst(e.time, p.zeit || e.time, wiederholungMoeglich(p, kontext) || !p.zeit)
            && (p.wichtig !== true && p.wichtig !== 'true' || e.important === true);
    }
    function terminPasst(e, p, kontext) {
        return !!e && gleicherText(e.text, p.text) && zeitPasst(e.isoDate, p.zeit, wiederholungMoeglich(p, kontext))
            && (!p.ort || gleicherText(e.location, p.ort));
    }

    /* Gemeinsamer Ablauf der zwei Listen-Fähigkeiten (Erinnerung, Termin): bestehende executeAction aufrufen und danach prüfen, welche Einträge NEU sind
       (Vergleich der Einträge selbst, nicht der Anzahl) und ob einer davon genau der gewünschte ist. */
    async function schreibe(aktion, text, kontext, welche, passt, p) {
        var ctx = ctxNeu(kontext), SYM_N = Symbol.for('jv.nichtsGetan'), SYM_G = Symbol.for('jv.googleTerminId');
        var vorherListe = (liste(welche) || []).slice();
        /* Doppelschutz (B1): gibt es genau diesen Eintrag (gleicher Text, gleiche Minute) schon, wird nichts angelegt. Bei Wiederholungen entscheidet nur die Uhrzeit, dort kein Vorab-Urteil. */
        if (p.zeit && !wiederholungMoeglich(p, kontext) && vorherListe.some(function (e) { return passt(e, p, kontext); })) {
            return { vorher: vorherListe.length, nachher: vorherListe.length, neu: 0, passend: 0, unerwartet: 0, googleBestaetigt: false, schonVorhanden: true, hinweise: [], nichtsGetan: [],
                     nachricht: 'Das gibt es schon, ich habe nichts doppelt angelegt.' };
        }
        var nichtsVorher = (ctx[SYM_N] || []).length, googleVorher = ctx[SYM_G];
        await executeAction(aktion, text, ctx);
        var nachherListe = liste(welche) || [];
        var neu = nachherListe.filter(function (e) { return vorherListe.indexOf(e) < 0; });
        var passend = neu.filter(function (e) { return passt(e, p, kontext); });
        var nichts = (ctx[SYM_N] || []).slice(nichtsVorher);
        /* Google hat den Termin angenommen und eine echte Termin-ID geliefert (die App lädt die Liste erst danach neu): gilt als Nachweis, wenn der Titel stimmt. */
        var gId = ctx[SYM_G];
        var googleBestaetigt = welche === 'calendarEntries' && !!gId && gId !== googleVorher && !!window.jvLetzterGoogleTermin && gleicherText(window.jvLetzterGoogleTermin.text, p.text);
        return { vorher: vorherListe.length, nachher: nachherListe.length, neu: neu.length, passend: passend.length, unerwartet: neu.length - passend.length,
                 googleBestaetigt: googleBestaetigt, hinweise: ctx.notes.slice(), nichtsGetan: nichts, nachricht: nichts[0] || ctx.notes.join(' ') };
    }
    function listeBelegt(d) { return !!d && (d.schonVorhanden === true || d.passend >= 1 || d.googleBestaetigt === true) && (!d.nichtsGetan || d.nichtsGetan.length === 0); }

    var STAND = 'Wie bisher legt Jarvis das ohne Rückfrage an; die Registry ändert daran in dieser Phase nichts.';

    /* ---------------- 1. Ortssuche ---------------- */
    R.registriere({
        name: 'ortssuche',
        beschreibung: 'Sucht Restaurants und Lokale in der Nähe oder in einem genannten Ort und liefert die nächsten Treffer mit Entfernung und Kartenlink.',
        pflicht: [{ name: 'suchbegriff', typ: 'text', beschreibung: 'Was gesucht wird, zum Beispiel "Pizzeria" oder "Restaurant".' }],
        optional: [{ name: 'ort', typ: 'text', beschreibung: 'Ort, in dem gesucht wird. Ohne Angabe wird um den Standort des Nutzers gesucht.' }],
        rueckgabe: { beschreibung: 'Gesprochener Satz plus Karten der bis zu fünf nächsten Treffer.', felder: ['reply', 'cards', 'orte', 'nachricht'] },
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
            /* Der Ort wird der bestehenden Funktion als zweiter Wert übergeben ('' = um den Nutzer herum). window.jvLetzterText wird dabei weder gelesen noch verändert,
               darum können parallele Suchen und der normale Sprachablauf einander nicht stören. */
            var res = await findNearbyRestaurants(String(p.suchbegriff), p.ort ? String(p.ort).trim() : '');
            return { reply: res.reply, cards: res.cards, orte: Array.isArray(res.orte) ? res.orte : [], nachricht: res.reply };
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

    /* ---------------- 2b. Wetter (lesend, ohne KI-Kosten) ---------------- */
    R.registriere({
        name: 'wetter',
        beschreibung: 'Sagt das Wetter am Standort des Nutzers oder, mit Ortsangabe, für einen genannten Ort: jetzt/heute, morgen oder übermorgen, mit Temperatur und Regen (am Standort zusätzlich Kleidungstipp).',
        pflicht: [],
        optional: [{ name: 'tag', typ: 'text', beschreibung: 'heute (Standard), morgen oder uebermorgen.' }, { name: 'ort', typ: 'text', beschreibung: 'Ortsname, wenn nicht der Standort des Nutzers gemeint ist (z. B. Hamburg).' }],
        rueckgabe: { beschreibung: 'Der gesprochene Wettersatz, lokal aus den Wetterdaten gebaut (keine KI-Anfrage).', felder: ['nachricht'] },
        fehler: [
            { status: 'TOOL_FAILED', wann: 'Standort oder Wetterdaten nicht verfügbar.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Wetterdaten sind in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: ['websuche'],
        bestaetigung: { noetig: false, grund: 'Reine Auskunft ohne Änderung von Daten.' },
        pruefeErfolg: function (d) { return !!d && typeof d.nachricht === 'string' && !!d.nachricht.trim(); },
        verbindung: { datei: 'js/briefing.js', funktion: 'fetchWeatherData' },
        verfuegbar: function () { return typeof fetchWeatherData === 'function' && typeof fetchWeatherForecast === 'function' && typeof getWeatherAdvice === 'function' && typeof weatherCodeText === 'function'; },
        ausfuehren: async function (p) {
            var tag = String(p.tag || 'heute').toLowerCase().replace('ü', 'ue');
            if (tag !== 'heute' && tag !== 'morgen' && tag !== 'uebermorgen') tag = 'heute';
            function fehlschlag(m) { var e = new Error(m); e.userMessage = m; throw e; }
            var ortName = typeof p.ort === 'string' ? p.ort.trim() : '';
            if (ortName) {   // anderer Ort: Ortsauflösung und Wetterdaten der Wetterkarte (weathermap.js); nie der eigene Standort, nie erfundene Werte
                if (typeof wxGeocode !== 'function' || typeof wxFetchWeather !== 'function' || typeof wxSummary !== 'function') fehlschlag('Das Wetter für andere Orte ist gerade nicht verfügbar.');
                var geo = await wxGeocode(ortName);
                if (!geo) fehlschlag('Den Ort ' + ortName + ' habe ich nicht gefunden.');
                var wd = await wxFetchWeather(geo.lat, geo.lon);
                if (!wd) fehlschlag('Die Wetterdaten für ' + geo.short + ' sind gerade nicht verfügbar.');
                var off = tag === 'morgen' ? 1 : tag === 'uebermorgen' ? 2 : 0;
                if (off > 0 && !(wd.days && wd.days[off])) fehlschlag('Die Vorhersage für ' + geo.short + ' ist gerade nicht verfügbar.');
                return { nachricht: wxSummary(geo.short, wd, off, false) };
            }
            var teile = await Promise.all([tag === 'heute' ? fetchWeatherData() : Promise.resolve(null), fetchWeatherForecast()]);
            var jetztD = teile[0], vor = teile[1];
            var tage = vor && Array.isArray(vor.tage) ? vor.tage : [];
            function g(n) { return String(n).replace('.', ','); }
            var satz = '';
            if (tag === 'heute') {
                if (!jetztD || jetztD.fehler) fehlschlag('Die Wetterdaten sind gerade nicht verfügbar.');
                var rat = getWeatherAdvice(jetztD);
                satz = 'Aktuell sind es ' + g(jetztD.temperatur) + ' Grad, gefühlt ' + g(jetztD.gefuehlteTemperatur) + ', ' + weatherCodeText(jetztD.aktuellerCode !== undefined ? jetztD.aktuellerCode : jetztD.wettercode) + '.';
                var heute = tage.filter(function (t) { return t.tag === 'heute'; })[0];
                if (heute) satz += ' Heute werden es zwischen ' + g(heute.tiefstwert_grad) + ' und ' + g(heute.hoechstwert_grad) + ' Grad, die Regenwahrscheinlichkeit liegt bei ' + g(heute.regenwahrscheinlichkeit_prozent) + ' Prozent.';
                satz += ' ' + rat.schirm + '. ' + rat.jacke + '.';
                if (rat.sturm) satz += ' ' + rat.sturm + '.';
            } else {
                var t = tage.filter(function (x) { return String(x.tag).replace('ü', 'ue') === tag; })[0];   // die Vorhersage nennt den Tag mit ü (übermorgen)
                if (!t) fehlschlag('Die Vorhersage ist gerade nicht verfügbar.');
                satz = 'Das Wetter ' + (tag === 'morgen' ? 'morgen' : 'übermorgen') + ': ' + t.wetter + ', zwischen ' + g(t.tiefstwert_grad) + ' und ' + g(t.hoechstwert_grad) + ' Grad. Die Regenwahrscheinlichkeit liegt bei ' + g(t.regenwahrscheinlichkeit_prozent) + ' Prozent. ' + t.regenschirm_empfehlung + '. ' + t.jacken_empfehlung + '.';
            }
            return { nachricht: satz };
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
        rueckgabe: { beschreibung: 'Anzahl der Erinnerungen vorher/nachher, wie viele Einträge neu und wie viele davon genau die gewünschten sind, Hinweise (zum Beispiel "nur in der App gespeichert").', felder: ['vorher', 'nachher', 'neu', 'passend', 'unerwartet', 'hinweise', 'nichtsGetan', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Kein Erinnerungstext angegeben.' },
            { status: 'TOOL_FAILED', wann: 'Es gibt keinen neuen Eintrag mit dem gewünschten Text und der gewünschten Zeit, oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Aktionsausführung ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: ['termin_erstellen'],
        bestaetigung: { noetig: false, grund: STAND },
        pruefeErfolg: listeBelegt,
        verbindung: { datei: 'js/actions.js', funktion: 'executeAction', aktion: 'reminder' },
        verfuegbar: function () { return actionsDa() && !!liste('reminderEntries'); },
        vorpruefung: function (p) { return sicherheit(erinnerungAktion(p)); },
        ausfuehren: function (p, kontext) {
            return schreibe(erinnerungAktion(p), satzDesNutzers(kontext, p, 'text'), kontext, 'reminderEntries', erinnerungPasst, p);
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
        rueckgabe: { beschreibung: 'Anzahl der Termine vorher/nachher, wie viele Einträge neu und wie viele davon genau die gewünschten sind (oder von Google bestätigt), Hinweise (zum Beispiel "nur in der App gespeichert").', felder: ['vorher', 'nachher', 'neu', 'passend', 'unerwartet', 'googleBestaetigt', 'hinweise', 'nichtsGetan', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Titel oder Zeit fehlen.' },
            { status: 'TOOL_FAILED', wann: 'Es gibt keinen neuen Eintrag mit dem gewünschten Titel und der gewünschten Zeit (und Google hat ihn auch nicht bestätigt), oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Aktionsausführung ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: ['erinnerung_erstellen'],
        bestaetigung: { noetig: false, grund: STAND },
        pruefeErfolg: listeBelegt,
        verbindung: { datei: 'js/actions.js', funktion: 'executeAction', aktion: 'calendar' },
        verfuegbar: function () { return actionsDa() && !!liste('calendarEntries'); },
        vorpruefung: function (p) { return sicherheit(terminAktion(p)); },
        ausfuehren: function (p, kontext) {
            return schreibe(terminAktion(p), satzDesNutzers(kontext, p, 'text'), kontext, 'calendarEntries', terminPasst, p);
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
        rueckgabe: { beschreibung: 'Stichwort, der Wert vorher, der erwartete und der tatsächlich gespeicherte Wert (erfolgreich nur, wenn gespeichert = erwartet).', felder: ['schluessel', 'vorher', 'erwartet', 'gespeichert', 'ueberschrieben', 'unveraendert', 'hinweise', 'nichtsGetan', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Kein Stichwort angegeben.' },
            { status: 'TOOL_FAILED', wann: 'Unter dem Stichwort steht danach nicht der gewünschte Wert (zum Beispiel noch der alte), oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Aktionsausführung ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: STAND },
        pruefeErfolg: function (d) { return !!d && typeof d.gespeichert === 'string' && d.gespeichert.length > 0 && d.gespeichert === d.erwartet && (!d.nichtsGetan || d.nichtsGetan.length === 0); },
        verbindung: { datei: 'js/actions.js', funktion: 'executeAction', aktion: 'memory_store' },
        verfuegbar: function () { return actionsDa() && typeof searchMemory === 'function'; },
        vorpruefung: function (p, kontext) {
            var s = sicherheit(gedaechtnisAktion(p));
            if (s) return s;
            /* B1: eine feste Schichtregel, die dem wöchentlich wechselnden Schichtplan widerspricht, wird erst nach Rückfrage gemerkt */
            return (window.jvSchreibkern && typeof window.jvSchreibkern.schichtPruefung === 'function') ? window.jvSchreibkern.schichtPruefung(p, kontext) : null;
        },
        ausfuehren: async function (p, kontext) {
            var a = gedaechtnisAktion(p), ctx = ctxNeu(kontext), key = a.memory_key.toLowerCase().trim();
            var nichtsVorher = (ctx[Symbol.for('jv.nichtsGetan')] || []).length;
            var vorher = gemerkt(key);
            await executeAction(a, satzDesNutzers(kontext, p, 'schluessel'), ctx);
            var nichts = (ctx[Symbol.for('jv.nichtsGetan')] || []).slice(nichtsVorher);
            var gespeichert = gemerkt(key);
            return { schluessel: key, vorher: vorher, erwartet: erwarteterWert(a), gespeichert: gespeichert, ueberschrieben: vorher !== '' && vorher !== gespeichert, unveraendert: vorher !== '' && vorher === gespeichert,
                     hinweise: ctx.notes.slice(), nichtsGetan: nichts, nachricht: nichts[0] || ctx.notes.join(' ') };
        }
    });

    var lose = R.pruefeVerweise();
    if (lose.length) { try { console.warn('Jarvis-Registry: Fallback nicht angemeldet', JSON.stringify(lose)); } catch (e) { } }
})();
