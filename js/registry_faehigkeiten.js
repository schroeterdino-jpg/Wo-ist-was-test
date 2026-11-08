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

    /* ---------------- 2a. Jarvis über sich selbst (lesend, ohne KI-Kosten) ---------------- */
    var SELBST_NAMEN = { ortssuche: 'Orte und Restaurants suchen', websuche: 'Internetsuche', wetter: 'Wetter', fahrzeit: 'Fahrzeit und Verkehr mit dem Auto', produktsuche: 'Preise und Händler zu Produkten', foto_info: 'Fotos erkennen und auswerten',
        termine_lesen: 'Termine ansehen', aufgaben_lesen: 'Aufgaben ansehen', aufgabe_erstellen: 'Aufgaben anlegen', erinnerung_erstellen: 'Erinnerungen anlegen', termin_erstellen: 'Termine eintragen',
        termin_verschieben: 'Termine verschieben', kontakt_speichern: 'Kontakte speichern', gedaechtnis_speichern: 'Dinge merken' };
    R.registriere({
        name: 'jarvis_info',
        beschreibung: 'Zählt auf, welche Werkzeuge und Fähigkeiten Jarvis selbst hat. Nur nutzen, wenn der Nutzer Jarvis selbst meint ("du", "dich", "deine Funktionen", "wie könntest du dich verbessern").',
        pflicht: [], optional: [],
        rueckgabe: { beschreibung: 'Liste der vorhandenen Fähigkeiten in einem gesprochenen Satz.', felder: ['werkzeuge', 'nachricht'] },
        fehler: [
            { status: 'TOOL_FAILED', wann: 'Die Registry kann die Fähigkeiten nicht aufzählen.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Registry ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: 'Reine Auskunft aus der Registry, ändert nichts.' },
        pruefeErfolg: function (d) { return !!d && Array.isArray(d.werkzeuge) && d.werkzeuge.length > 0 && typeof d.nachricht === 'string' && d.nachricht.trim() !== ''; },
        verbindung: { datei: 'js/registry.js', funktion: 'beschreibe' },
        verfuegbar: function () { return typeof R.beschreibe === 'function'; },
        ausfuehren: async function () {
            var namen = R.beschreibe().map(function (d) { return d.name; }).filter(function (n) { return n !== 'jarvis_info'; });
            var texte = namen.map(function (n) { return SELBST_NAMEN[n] || n.replace(/_/g, ' '); });
            return { werkzeuge: namen, nachricht: 'Das kann ich zurzeit: ' + texte.join(', ') + '.' };
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

    /* ---------------- 2b+. Persönliche Ziele: Kontakte und Gedächtnis (nur lesend, bestehende Funktionen) ----------------
       Wiederverwendet: contactList/contactKey (routing.js), findMemoryAddressFor (travel.js), searchMemory (lists.js). Es wird immer nur der eine passende Eintrag gelesen, nie eine Liste.
       Reihenfolge: gespeicherter Kontakt MIT Adresse, dann Gedächtniseintrag, der wie eine Adresse aussieht. Mehrere Kontakte passen -> mehrdeutig (nachfragen). */
    function kontaktListe() { try { return (typeof contactList === 'function' && typeof contactKey === 'function') ? contactList() : []; } catch (e) { return []; } }
    function kontaktSchluessel(n) { try { return contactKey(n); } catch (e) { return ''; } }
    function kontaktNamen(name) {   // Kontakte, die zum genannten Namen passen (ganzer Name gleich, sonst Vorname gleich); ohne Teilstring-Treffer
        var k = kontaktSchluessel(name), out = [];
        if (!k) return out;
        var alle = kontaktListe().filter(function (c) { return c && c.name && kontaktSchluessel(c.name); });
        var genau = alle.filter(function (c) { return kontaktSchluessel(c.name) === k; });
        if (genau.length) return genau;
        return alle.filter(function (c) { var w = String(c.name).trim().split(/\s+/); return w.length > 1 && typeof plainKey === 'function' && plainKey(w[0]) === k; });
    }
    function sieht_aus_wie_adresse(t) { return typeof t === 'string' && /\d/.test(t) && t.trim().length >= 6; }
    /* Wörter, die eindeutig eine Person aus dem Umfeld meinen (keinen Ort): ohne Kontakt und ohne Gedächtnis-Adresse wird NICHT als Ortsname gesucht, sondern ehrlich gesagt, dass die Adresse fehlt */
    var PERSONENWOERTER = ['mama', 'papa', 'oma', 'opa', 'bruder', 'schwester', 'tochter', 'sohn', 'tante', 'onkel', 'enkel', 'enkelin', 'freund', 'freundin', 'ehefrau', 'ehemann'];
    function personenwort(name) {   // -> null | Anzeigename ("Oma", "Mutter") wenn der Name nur ein solches Wort ist
        var k = kontaktSchluessel(name);
        if (!k || PERSONENWOERTER.indexOf(k) < 0) return null;
        var w = String(name).trim().split(/\s+/).filter(Boolean);
        while (w.length > 1 && /^(?:zu|zur|zum|nach|bei|von|vom|meiner|meinem|meinen|meine|mein|der|dem|die|den)$/i.test(w[0])) w.shift();
        var n = w.join(' '); return n.charAt(0).toUpperCase() + n.slice(1);
    }
    function keineAdresseText(r) { return r.hinweis || ('Ich habe keine Adresse von ' + r.name + ' gespeichert. Möchtest du mir die Adresse nennen?'); }
    function persoenlicheAdresse(name) {   // -> null | { mehrdeutig:[Namen] } | { name, adresse, quelle:'kontakt'|'gedaechtnis'|'gespeichert', ohneAdresse?, hinweis? }
        /* Arbeit und Zuhause: die gespeicherten Adressen der App (resolvePersonalPlace, routing.js), nie die Ortssuche; fehlt die Adresse, sagt die App das selbst */
        try {
            if (typeof resolvePersonalPlace === 'function') {
                var rp = resolvePersonalPlace(String(name || '').trim());
                if (rp && rp !== String(name || '').trim()) return { name: /arbeit|firma|buro|buero/i.test(name) ? 'Arbeit' : 'Zuhause', adresse: String(rp), quelle: 'gespeichert' };
            }
        } catch (e) { return { name: String(name), adresse: '', quelle: 'gespeichert', ohneAdresse: true, hinweis: (e && e.userMessage) || 'Dazu ist keine Adresse gespeichert.' }; }
        var tr = kontaktNamen(name), mit = tr.filter(function (c) { return c.address; });
        if (mit.length > 1) { var namen = []; mit.forEach(function (c) { if (namen.indexOf(c.name) < 0) namen.push(c.name); }); if (namen.length > 1) return { mehrdeutig: namen }; }
        if (mit.length) return { name: mit[0].name, adresse: String(mit[0].address), quelle: 'kontakt' };
        try {
            if (typeof findMemoryAddressFor === 'function') {
                var k = String(name || '').toLowerCase().replace(/^(?:zu|zur|zum|nach|bei|von|vom|meiner|meinem|meinen|meine|mein|der|dem|die|den)\s+/g, '').trim();
                var g = (k && !/\s/.test(k)) ? findMemoryAddressFor(k) : null;   // nur einzelne Wörter ("mutter", "zahnarzt"): mehrteilige Ortsnamen wie "Hamburger Hauptbahnhof" nie mit dem Gedächtnis verwechseln
                if (sieht_aus_wie_adresse(g)) return { name: String(name), adresse: g, quelle: 'gedaechtnis' };
            }
        } catch (e) { }
        if (tr.length) return { name: tr[0].name, adresse: '', quelle: 'kontakt', ohneAdresse: true };
        var pw = personenwort(name); return pw ? { name: pw, adresse: '', quelle: 'kontakt', ohneAdresse: true } : null;
    }
    try { window.jvPersoenlicheAdresse = { finde: persoenlicheAdresse, text: keineAdresseText }; } catch (e) { }   // dieselbe Auflösung für die Navigation (routing.js resolveContactsInActions)
    function mitRegion(a) { try { return typeof withDefaultRegion === 'function' ? withDefaultRegion(a) : a; } catch (e) { return a; } }

    R.registriere({
        name: 'kontakte_lesen',
        beschreibung: 'Nennt die gespeicherte Adresse einer Person oder Stelle aus den Kontakten (zum Beispiel "Wo wohnt meine Mutter?", Zahnarzt), ersatzweise aus einem Gedächtniseintrag. Nur lesend; nennt nur diesen einen Eintrag.',
        pflicht: [{ name: 'name', typ: 'text', beschreibung: 'Name oder Bezeichnung wie genannt, zum Beispiel Mutter, Matze oder Zahnarzt.' }],
        optional: [],
        rueckgabe: { beschreibung: 'Name, Adresse und woher sie stammt (kontakt oder gedaechtnis).', felder: ['name', 'adresse', 'quelle', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Mehrere Kontakte passen oder kein Name genannt.' },
            { status: 'NO_RESULTS', wann: 'Kein Kontakt und kein Gedächtniseintrag mit Adresse gefunden.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Kontakte sind nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: 'Nur lesend.' },
        leer: function (d) { return !!d && d.leer === true; },
        pruefeErfolg: function (d) { return !!d && typeof d.adresse === 'string' && d.adresse.length > 0 && typeof d.nachricht === 'string' && d.nachricht.length > 0; },
        verbindung: { datei: 'js/routing.js', funktion: 'contactList', aktion: 'lesen' },
        verfuegbar: function () { return typeof contactList === 'function' && typeof contactKey === 'function'; },
        vorpruefung: function (p) {
            var n = String((p && p.name) || '').trim();
            if (!n) return { status: 'NEEDS_INFORMATION', nachricht: 'Wessen Adresse soll ich nachsehen?', fehlend: ['name'] };
            var r = persoenlicheAdresse(n);
            if (r && r.mehrdeutig) return { status: 'NEEDS_INFORMATION', nachricht: 'Meinst du ' + r.mehrdeutig.join(' oder ') + '?', fehlend: ['name'] };
            return null;
        },
        ausfuehren: async function (p) {
            var n = String(p.name || '').trim(), r = persoenlicheAdresse(n);
            if (!r) return { leer: true, reply: 'Zu ' + n + ' habe ich keinen Kontakt und keinen Gedächtniseintrag mit Adresse gefunden.' };
            if (r.ohneAdresse) return { leer: true, reply: keineAdresseText(r) };
            return { name: r.name, adresse: r.adresse, quelle: r.quelle, nachricht: 'Die gespeicherte Adresse von ' + r.name + ' ist ' + r.adresse + '.' };
        }
    });

    R.registriere({
        name: 'gedaechtnis_lesen',
        beschreibung: 'Liest, was sich Jarvis unter einem Stichwort gemerkt hat (zum Beispiel "Wo steht mein Auto?", "Was habe ich mir zu Schlüssel gemerkt?"). Nur lesend; nennt nur den passenden Eintrag.',
        pflicht: [{ name: 'suche', typ: 'text', beschreibung: 'Stichwort wie genannt, zum Beispiel schlüssel.' }],
        optional: [],
        rueckgabe: { beschreibung: 'Stichwort und der gemerkte Wert (höchstens 200 Zeichen).', felder: ['stichwort', 'wert', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Mehrere Einträge passen oder kein Stichwort genannt.' },
            { status: 'NO_RESULTS', wann: 'Dazu ist nichts gemerkt.' },
            { status: 'CAPABILITY_MISSING', wann: 'Das Gedächtnis ist nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: 'Nur lesend.' },
        leer: function (d) { return !!d && d.leer === true; },
        pruefeErfolg: function (d) { return !!d && typeof d.wert === 'string' && d.wert.length > 0 && typeof d.nachricht === 'string' && d.nachricht.length > 0; },
        verbindung: { datei: 'js/lists.js', funktion: 'searchMemory', aktion: 'lesen' },
        verfuegbar: function () { return typeof searchMemory === 'function'; },
        vorpruefung: function (p) {
            var n = String((p && p.suche) || '').trim();
            if (!n) return { status: 'NEEDS_INFORMATION', nachricht: 'Woran soll ich mich erinnern?', fehlend: ['suche'] };
            var t = (searchMemory(n) || []).filter(function (x) { return x && !x.unscharf; });
            if (t.length > 1 && !t.some(function (x) { return String(x.key).toLowerCase() === n.toLowerCase(); })) return { status: 'NEEDS_INFORMATION', nachricht: 'Meinst du ' + t.slice(0, 3).map(function (x) { return x.key; }).join(' oder ') + '?', fehlend: ['suche'] };
            return null;
        },
        ausfuehren: async function (p) {
            var n = String(p.suche || '').trim(), t = (searchMemory(n) || []).filter(function (x) { return x && !x.unscharf; });
            var e = t.filter(function (x) { return String(x.key).toLowerCase() === n.toLowerCase(); })[0] || t[0];
            if (!e || typeof e.value !== 'string' || !e.value.trim()) return { leer: true, reply: 'Dazu habe ich mir nichts gemerkt.' };
            var w = e.value.trim().slice(0, 200);
            return { stichwort: String(e.key), wert: w, nachricht: 'Zu ' + e.key + ' habe ich mir gemerkt: ' + w + '.' };
        }
    });

    /* ---------------- 2d. Abfahrtszeit für eine gewünschte Ankunft (nur lesend; ruft die bestehende Abfahrtsplanung computeDepartureAdvice auf, keine zweite Logik) ---------------- */
    function ankunftAus(p) {   // -> { iso, ms, tag } | { fehler: 'zeit' | 'vorbei' }
        var m = String((p && p.ankunft) || '').trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
        if (!m || +m[1] > 23 || (m[2] !== undefined && +m[2] > 59)) return { fehler: 'zeit' };
        var t = String((p && p.tag) || 'heute').toLowerCase().replace('ü', 'ue'), d = new Date();
        if (t === 'morgen') d.setDate(d.getDate() + 1); else if (t === 'uebermorgen') d.setDate(d.getDate() + 2);
        else if (/^\d{4}-\d{2}-\d{2}$/.test(t)) { var x = new Date(t + 'T12:00:00'); if (isNaN(x.getTime())) return { fehler: 'zeit' }; d = x; }
        else if (t !== 'heute') return { fehler: 'zeit' };
        d.setHours(+m[1], m[2] === undefined ? 0 : +m[2], 0, 0);
        if (d.getTime() <= Date.now()) return { fehler: 'vorbei' };
        var z = function (n) { return String(n).padStart(2, '0'); };
        return { iso: d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()) + 'T' + z(d.getHours()) + ':' + z(d.getMinutes()) + ':00', ms: d.getTime(), tag: t };
    }
    R.registriere({
        name: 'abfahrt',
        beschreibung: 'Berechnet, wann der Nutzer losfahren muss, um zu einer bestimmten Uhrzeit an einem Ziel zu sein (Fahrzeit mit dem Auto vom Standort, gemeldete Staus und der übliche Zeitpuffer). Gespeicherte Personen und Stellen (Mutter, Zahnarzt) werden über die Kontakte aufgelöst. Nur lesend.',
        pflicht: [
            { name: 'ziel', typ: 'text', beschreibung: 'Das genaue Ziel wie genannt, zum Beispiel meiner Mutter, Zahnarzt oder Hamburger Hauptbahnhof (nicht nur Hamburg).' },
            { name: 'ankunft', typ: 'text', beschreibung: 'Uhrzeit der gewünschten Ankunft als HH:MM, zum Beispiel 13:00.' }
        ],
        optional: [{ name: 'tag', typ: 'text', beschreibung: 'heute (Standard), morgen, uebermorgen oder ein Datum wie 2026-11-09.' }],
        rueckgabe: { beschreibung: 'Ein Satz mit Fahrzeit, Entfernung und der spätestens empfohlenen Abfahrtszeit inklusive Puffer; sagt ausdrücklich, wenn die Verkehrslage nur die von jetzt ist.', felder: ['nachricht', 'minuten', 'km', 'ankunft', 'verkehrsdaten'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Ziel oder Uhrzeit fehlt oder ist unklar, die Uhrzeit ist schon vorbei, oder mehrere Kontakte passen.' },
            { status: 'TOOL_FAILED', wann: 'Standort, Ziel oder Route nicht verfügbar, oder das Ziel liegt in einer anderen Stadt als genannt. Dann nennt die Fähigkeit keine Abfahrtszeit.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Abfahrtsplanung ist nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: 'Reine Auskunft ohne Änderung von Daten.' },
        leer: function (d) { return !!d && d.leer === true; },
        pruefeErfolg: function (d) { return !!d && typeof d.nachricht === 'string' && !!d.nachricht.trim() && typeof d.minuten === 'number' && d.minuten > 0 && typeof d.ankunft === 'string' && (d.verkehrsdaten === 'jetzt' || d.verkehrsdaten === 'ohne'); },
        verbindung: { datei: 'js/travel.js', funktion: 'computeDepartureAdvice', aktion: 'lesen' },
        verfuegbar: function () { return typeof computeDepartureAdvice === 'function' && typeof fetchFreshTravelLocation === 'function'; },
        vorpruefung: function (p) {
            var ziel = String((p && p.ziel) || '').trim();
            if (!ziel) return { status: 'NEEDS_INFORMATION', nachricht: 'Wohin musst du?', fehlend: ['ziel'] };
            var z = ankunftAus(p);
            if (z.fehler === 'zeit') return { status: 'NEEDS_INFORMATION', nachricht: 'Um wie viel Uhr musst du da sein?', fehlend: ['ankunft'] };
            if (z.fehler === 'vorbei') return { status: 'NEEDS_INFORMATION', nachricht: 'Diese Uhrzeit ist schon vorbei. Für welchen Tag meinst du es, zum Beispiel morgen?', fehlend: ['tag'] };
            var pz = persoenlicheAdresse(ziel);
            if (pz && pz.mehrdeutig) return { status: 'NEEDS_INFORMATION', nachricht: 'Meinst du ' + pz.mehrdeutig.join(' oder ') + '?', fehlend: ['ziel'] };
            return null;
        },
        ausfuehren: async function (p) {
            function fehlschlag(m) { var e = new Error(m); e.userMessage = m; throw e; }
            var ziel = String(p.ziel).trim(), z = ankunftAus(p), pz = persoenlicheAdresse(ziel);
            if (pz && pz.ohneAdresse) return { leer: true, reply: pz.hinweis ? pz.hinweis + ' Deshalb nenne ich keine Abfahrtszeit.' : keineAdresseText(pz) };
            var dest = (pz && pz.adresse) ? mitRegion(pz.adresse) : ziel;
            var loc = await fetchFreshTravelLocation();
            if (!loc || loc.fehler || loc.latitude === undefined) fehlschlag('Deinen Standort konnte ich gerade nicht ermitteln, deshalb nenne ich keine Abfahrtszeit. Ist der Standortzugriff erlaubt?');
            var res = await computeDepartureAdvice({ destination: dest, arrivalTime: z.iso, wantFuel: false, loc: loc });   // wirft verständliche Fehler (Ort nicht gefunden, falsche Stadt ...)
            var text = String(res.reply || '');
            if (pz && pz.adresse) text = text.split(dest).join(String(pz.name));   // gesprochen wird der Name, nicht die Adresse
            var jetzt = /mit aktuellem Verkehr/.test(text), spaeter = z.ms - Date.now() > 90 * 60000;
            if (spaeter) text += jetzt ? ' Das ist die Fahrzeit nach der Verkehrslage von jetzt; eine Prognose für später habe ich nicht.' : ' Aktuelle Verkehrsdaten sind darin nicht eingerechnet.';
            var mp = res.map || {};
            return { nachricht: text, minuten: Number(mp.fahrtMin) || 0, km: Math.round((Number(mp.km) || 0) * 10) / 10, ankunft: z.iso, verkehrsdaten: jetzt ? 'jetzt' : 'ohne', cards: [res.card].concat(res.stauCards || [], res.webcamCards || []).filter(Boolean) };
        }
    });

    /* ---------------- 2c. Fahrzeit mit dem Auto (nur lesend; baut auf travel.js / stadtverkehr.js auf, keine zweite Routenberechnung) ---------------- */
    R.registriere({
        name: 'fahrzeit',
        beschreibung: 'Berechnet Fahrzeit und Entfernung mit dem Auto zu einem genannten Ziel (vom Standort oder von einem genannten Startort) und sagt ausdrücklich, ob aktuelle Verkehrsdaten eingerechnet sind. Staumeldungen nennt sie nur, wenn sie wirklich abgefragt wurden; geschätzt oder erfunden wird nichts.',
        pflicht: [{ name: 'ziel', typ: 'text', beschreibung: 'Das genaue Ziel wie genannt, zum Beispiel Hamburger Hauptbahnhof (nicht nur Hamburg).' }],
        optional: [{ name: 'von', typ: 'text', beschreibung: 'Startort, nur wenn der Nutzer einen anderen Startort nennt als seinen Standort.' }],
        rueckgabe: { beschreibung: 'Ein Satz mit Fahrzeit, Entfernung und der Angabe, ob aktuelle Verkehrsdaten eingerechnet sind (verkehrsdaten: live oder ohne).', felder: ['nachricht', 'minuten', 'km', 'ziel', 'verkehrsdaten'] },
        fehler: [
            { status: 'TOOL_FAILED', wann: 'Standort, Ziel oder Route nicht verfügbar; dann gibt es keine Zahl.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Routenberechnung ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: [],   // bewusst keiner: eine Websuche würde nur eine Schätzung liefern
        bestaetigung: { noetig: false, grund: 'Reine Auskunft ohne Änderung von Daten.' },
        pruefeErfolg: function (d) { return !!d && typeof d.nachricht === 'string' && !!d.nachricht.trim() && typeof d.minuten === 'number' && d.minuten > 0 && (d.verkehrsdaten === 'live' || d.verkehrsdaten === 'ohne'); },
        verbindung: { datei: 'js/travel.js', funktion: 'routeDurationSeconds' },
        verfuegbar: function () { return typeof geocodeDestination === 'function' && typeof routeDurationSeconds === 'function' && typeof describeAutobahnStau === 'function' && typeof fetchFreshTravelLocation === 'function'; },
        ausfuehren: async function (p) {
            function fehlschlag(m) { var e = new Error(m); e.userMessage = m; throw e; }
            var ziel = String(p.ziel || '').trim(), von = typeof p.von === 'string' ? p.von.trim() : '';
            function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'); }
            /* Passt der gefundene Ort zum genannten Namen? Das erste längere Wort ("Hamburger" -> Stamm "hamburg", "Münchner" -> "muench") muss im ORT des Treffers vorkommen, nicht in einer Straße ("Münster ... Hamburger Straße" ist kein Treffer für Hamburg). Genauste Quelle: die strukturierten Ortsangaben des Geocoders (adr); fehlen sie, zählen nur die Teile des Namens, die keine Straße sind. Fehlt der Name der Antwort, wird nichts behauptet. */
            /* Zielstadt-Prüfung: gemeinsam mit dem alten Abfahrtsweg in travel.js (ortStimmt, geocodeDestinationPruefen; PR #387) */
            function nameOk(gefragt, gefunden, adr) { return typeof ortStimmt === 'function' ? ortStimmt(gefragt, gefunden, adr) : true; }
            async function ortsTreffer(text) { return typeof geocodeDestinationPruefen === 'function' ? geocodeDestinationPruefen(text) : geocodeDestination(text, ''); }
            /* Plausibilität: Route gegen Luftlinie. Eine Straße kann nicht (nennenswert) kürzer sein als die Luftlinie und ist selten mehr als 2,5-mal so lang (großzügiger Umwegfaktor, dazu 10 km Spielraum für kurze Wege); die Durchschnittsgeschwindigkeit muss möglich sein. Keine feste Entfernungsgrenze: Fernfahrten bleiben möglich. */
            function plausibel(luft, km, min) {
                if (!(km > 0) || !(min > 0)) return false;
                if (km < luft * 0.9 - 0.5) return false;
                if (km > luft * 2.5 + 10) return false;
                var v = km / (min / 60);
                return km < 5 || (v >= 8 && v <= 160);
            }
            var start, startText;
            if (von) {
                var pv = persoenlicheAdresse(von);
                if (pv && pv.ohneAdresse) fehlschlag(pv.hinweis ? pv.hinweis + ' Eine Fahrzeit nenne ich deshalb nicht.' : keineAdresseText(pv));
                if (pv && pv.mehrdeutig) fehlschlag('Meinst du als Startort ' + pv.mehrdeutig.join(' oder ') + '? Eine Fahrzeit nenne ich erst, wenn der Start klar ist.');
                var vg = (pv && pv.adresse) ? await geocodeDestination(mitRegion(pv.adresse), '') : await ortsTreffer(von);
                if (pv && pv.adresse && !vg) fehlschlag('Die gespeicherte Adresse von ' + von + ' konnte ich nicht auf der Karte finden. Eine Fahrzeit nenne ich deshalb nicht.');
                if (!vg) fehlschlag('Den Startort ' + von + ' habe ich nicht gefunden. Eine Fahrzeit nenne ich deshalb nicht.');
                if (!(pv && pv.adresse) && !nameOk(von, vg.name, vg.adr)) fehlschlag('Für den Startort ' + von + ' habe ich nur einen Ort gefunden, der nicht passt (' + String(vg.name).split(',').slice(0, 2).join(',').trim() + '). Eine Fahrzeit nenne ich deshalb nicht. Wie genau heißt der Startort?');
                start = { lat: vg.lat, lon: vg.lon }; startText = von;
            } else {
                var loc = await fetchFreshTravelLocation();
                if (!loc || loc.fehler || loc.latitude === undefined) fehlschlag('Deinen Standort konnte ich gerade nicht ermitteln, deshalb nenne ich keine Fahrzeit. Ist der Standortzugriff erlaubt?');
                start = { lat: loc.latitude, lon: loc.longitude }; startText = 'deinem aktuellen Standort';
            }
            var pz = persoenlicheAdresse(ziel);   // Kontakt (dann Gedächtnis) hat Vorrang vor der allgemeinen Ortssuche
            if (pz && pz.ohneAdresse) fehlschlag(pz.hinweis ? pz.hinweis + ' Eine Fahrzeit nenne ich deshalb nicht.' : keineAdresseText(pz));
            if (pz && pz.mehrdeutig) fehlschlag('Meinst du ' + pz.mehrdeutig.join(' oder ') + '? Eine Fahrzeit nenne ich erst, wenn das Ziel klar ist.');
            var dest = (pz && pz.adresse) ? await geocodeDestination(mitRegion(pz.adresse), '') : await ortsTreffer(ziel);
            if (pz && pz.adresse && !dest) fehlschlag('Die gespeicherte Adresse von ' + ziel + ' konnte ich nicht auf der Karte finden. Eine Fahrzeit nenne ich deshalb nicht.');   // zuerst genau das genannte Ziel (nie nur der Ortsname)
            if (dest && !(pz && pz.adresse) && !nameOk(ziel, dest.name, dest.adr)) fehlschlag('Für ' + ziel + ' habe ich nur einen Ort gefunden, der nicht passt (' + String(dest.name).split(',').slice(0, 2).join(',').trim() + '). Eine Fahrzeit nenne ich deshalb nicht. Wie genau heißt das Ziel?');
            if (!dest) {
                var adr = (typeof findContactAddressFor === 'function' && findContactAddressFor(ziel)) || (typeof findMemoryAddressFor === 'function' && findMemoryAddressFor(ziel)) || '';
                if (adr) dest = await geocodeDestination(adr, '');
            }
            if (!dest) fehlschlag('Das Ziel ' + ziel + ' habe ich nicht gefunden. Eine Fahrzeit nenne ich deshalb nicht.');
            var luft = typeof haversineKm === 'function' ? haversineKm(start.lat, start.lon, dest.lat, dest.lon) : 0;
            var route = await routeDurationSeconds(start.lat, start.lon, dest.lat, dest.lon), hinweis = '';
            function werte(r) { return r && isFinite(r.seconds) && r.seconds > 0 ? { min: Math.max(1, Math.round(r.seconds / 60)), km: (r.meters || 0) / 1000 } : null; }
            var w = werte(route);
            if (!w) fehlschlag('Die Fahrzeit konnte ich gerade nicht berechnen. Ich schätze sie nicht, versuch es bitte gleich noch einmal.');
            if (!plausibel(luft, w.km, w.min)) {   // Route passt nicht zu Start und Ziel: einmal gezielt neu rechnen (ohne Google, nur die normale Route), sonst ehrlich nachfragen
                var erste = Math.round(w.km) + ' Kilometer in ' + w.min + ' Minuten';
                var altAus = window.__jvGoogleAus, zweite = null;
                try { window.__jvGoogleAus = true; zweite = await routeDurationSeconds(start.lat, start.lon, dest.lat, dest.lon); } finally { window.__jvGoogleAus = altAus; }
                var w2 = werte(zweite);
                if (w2 && plausibel(luft, w2.km, w2.min)) { route = zweite; w = w2; hinweis = ' Die erste Routenberechnung passte nicht zu Start und Ziel (' + erste + '), darum habe ich neu gerechnet.'; }
                else fehlschlag('Die berechnete Route passt nicht zu Start und Ziel: von ' + startText + ' bis ' + ziel + ' sind es Luftlinie nur etwa ' + Math.round(luft) + ' Kilometer, die Route wäre aber ' + Math.round((w2 || w).km) + ' Kilometer lang. Eine Fahrzeit nenne ich deshalb nicht. Meinst du den richtigen Start und das richtige Ziel?');
            }
            var min = w.min, km = w.km;
            if (min > 600 && luft < 150) fehlschlag('Das Ziel ' + ziel + ' liegt ungewöhnlich weit entfernt (' + Math.round(km) + ' Kilometer). Meinst du den richtigen Ort? Eine Fahrzeit nenne ich deshalb nicht.');
            var kmText = km >= 10 ? Math.round(km) + ' Kilometer' : km.toFixed(1).replace('.', ',') + ' Kilometer';
            var meldungen = '';
            try {
                await describeAutobahnStau(route.autobahnen, start.lat, start.lon, dest.lat, dest.lon, route.coords);
                /* nur Meldungen, deren Lage zum echten Linienverlauf der Route passt (Klasse "auf"); "nahe der Route", "im Gebiet" und fremde Meldungen werden nicht genannt */
                var echt = Array.isArray(route.coords) && route.coords.length > 1;
                var auf = echt && typeof lastStauWarnings !== 'undefined' ? lastStauWarnings.filter(function (x) { return x && x.klasse === 'auf' && x.title; }) : [];
                if (auf.length) meldungen = ' Auf der Strecke gemeldet: ' + auf.slice(0, 3).map(function (x) { return x.title; }).join('; ') + '.';
            } catch (e) { if (e && e.auth) throw e; meldungen = ''; }
            var live = route.quelle === 'google';   // nur die Google-Route enthält den aktuellen Verkehr (stadtverkehr.js); OSRM rechnet ohne
            var stauMin = live || !meldungen ? 0 : Math.max(0, Math.round(Number(window.jvStauMin) || 0));
            var davor = 'Von ' + startText + ' bis ' + ziel;
            var satz = live
                ? davor + ' brauchst du jetzt etwa ' + min + ' Minuten (' + kmText + '), berechnet mit dem aktuellen Verkehr.'
                : davor + ' sind es nach der berechneten Route etwa ' + min + ' Minuten (' + kmText + '). Aktuelle Verkehrsdaten sind darin nicht eingerechnet, das ist also keine Live-Auskunft zur Verkehrslage.' + (stauMin ? ' Gemeldete Verzögerungen auf der Strecke: etwa ' + stauMin + ' Minuten zusätzlich.' : '');
            try { window.jvFahrzeitLetzte = { start: start, ziel: dest, luftKm: Math.round(luft * 10) / 10, routeKm: Math.round(km * 10) / 10, minuten: min, verkehrsdaten: live ? 'live' : 'ohne', startQuelle: von ? 'genannt' : 'standort' }; } catch (e) { }   // nur zum Nachprüfen (keine Texte, kein Netzwerk)
            return { nachricht: satz + hinweis + meldungen, minuten: min, km: Math.round(km * 10) / 10, ziel: ziel, verkehrsdaten: live ? 'live' : 'ohne' };
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
