/* ============================================================
   GESPRÄCHSGEDÄCHTNIS FÜR ORTE (Phase 5): verbindet js/gespraech.js mit der Ortssuche.
     "Suche drei Restaurants in Hamburg" -> Treffer werden gemerkt | "Das zweite gefällt mir" -> Auswahl | "Wie komme ich dahin?" -> Route zum gewählten Ort
   Es gibt KEINE zweite Gesprächsspeicherung: alles liegt in window.jvGespraech (nur Arbeitsspeicher, verfällt, siehe gespraech.js).

   window.jvOrtGespraech.merke(orte, quelle)   nach einer ERFOLGREICHEN Ortssuche (nearby.js über assistant.js, ortsuche.js); orte = [{ name, adresse, lat, lon, distanzKm, link }]
                                               eine leere Liste ersetzt den alten Bezug (die neue Suche fand nichts, alte Orte gelten nicht mehr)
   window.jvOrtGespraech.fehler()              nach einer GESCHEITERTEN Suche: alter Bezug wird verworfen (kein alter oder fremder Ort)
   window.jvOrtGespraech.behandle(text)        wird vom bestehenden Haken der Ortssuche (ortsuche.js, im Sprachbefehl-Einstieg) vor den festen Befehlen gefragt; true = beantwortet, false = alles läuft wie bisher.
                                               KEIN eigener neuer Umhüller um handleLocalCommand und kein 95. Befehl: die Reihenfolge der Hüllen und die 94 Befehle bleiben unverändert.

   Verhalten:
   - Ist nichts gemerkt oder bezieht sich der Satz auf nichts Gemerktes, tut dieses Skript NICHTS (alles läuft wie vorher: feste Befehle, dann KI).
   - Mehrdeutig -> Rückfrage ("Welches meinst du?"), abgelaufen -> bitte neu suchen. Es wird nie geraten.
   - Route nur für eindeutig gewählte Orte mit Koordinaten oder Link; sie wird als Karte angeboten (Tippen öffnet die Navigation), nichts öffnet sich von selbst.
   - Entfernung und Adresse kommen aus den gemerkten Daten (Entfernung = Luftlinie). Fragen, die lokal nicht zu beantworten sind (Öffnungszeiten, Parkplätze, Telefon, Preise),
     gehen an die bestehende KI, mit dem Ort als Zusatz im Satz und dem Hinweis, nichts zu erfinden.
   - Eine bloße Antwort auf die offene Frage "Adresse speichern?" der Ortssuche ("die zweite", "Nein") erledigt weiter ortsuche.js (läuft im Haken VOR diesem Aufruf); längere Sätze wie "Das zweite gefällt mir" beantwortet das Gedächtnis.
   - LETZTE FRAGE GEWINNT (js/fragen_reihenfolge.js): Kurze Antworten ("ja", "nein", "das zweite", "das andere") gehören der Rückfrage, die Jarvis zuletzt gestellt hat.
     Hat nach unserem letzten Stand ein anderes Modul gefragt (Termin-/Erinnerungsfrage, Kontakt-Rückfrage ...), geben wir kurze Antworten NICHT an uns, sondern lassen sie weiterlaufen.
     Stellen wir selbst eine Rückfrage ("Welches meinst du?"), melden wir sie dort an (jvFrage.neu('gespraech_ort')) und werden mit unserer Antwort vor "Adresse speichern?" gefragt.
     Eine kurze Ordnungszahl, die nicht eindeutig ist, solange "Adresse speichern?" offen ist ("das zweite": Lokal wählen oder Adresse speichern?), wird nachgefragt, nicht geraten.
   - Kein Kalender, keine Erinnerung, kein Langzeitgedächtnis, kein Netz.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvOrtGespraech) return;

    function G() { return window.jvGespraech || null; }
    function say(msg) { try { if (typeof window.speak === 'function') window.speak(msg, typeof window.continueConversation === 'function' ? window.continueConversation : undefined); } catch (e) { } }
    function karten(liste) {
        try {
            if (typeof window.clearActionCards === 'function') window.clearActionCards();
            if (typeof window.showActionCards === 'function') window.showActionCards(liste);
        } catch (e) { }
    }

    /* ---- Letzte Frage gewinnt ---- */
    var stand = 0;   // Zähler von jvFrage zu dem Zeitpunkt, als wir zuletzt dran waren
    function fz() { try { return window.jvFrage && typeof window.jvFrage.zaehler === 'function' ? window.jvFrage.zaehler() : 0; } catch (e) { return 0; } }
    function fremdJuenger() { return fz() !== stand; }   // seit unserem Stand hat ein anderes Modul eine Frage gestellt
    function setzeStand() { stand = fz(); }
    function speichernOffen() { try { return typeof window.jvSpeichernOffen === 'function' && window.jvSpeichernOffen() === true; } catch (e) { return false; } }
    /* nur eine Zahl/Reihenfolge oder "das andere" (evtl. mit "nein, ich meinte ..."), sonst nichts */
    var RX_KURZ = /^\s*(?:(?:nein|nee|ne|doch)\W+)?(?:(?:ich meinte|meinte ich)\s+)?(?:(?:das|die|den|der|dem)\s+)?(?:erste[ns]?|zweite[ns]?|dritte[ns]?|vierte[ns]?|f(?:ü|ue)nfte[ns]?|letzte[ns]?|mittlere[ns]?|vorletzte[ns]?|andere[ns]?|(?:nummer|nr\.?)\s*\d{1,2}|\d{1,2})\s*[.!?]*\s*$/i;
    var RX_JANEIN = /^\s*(?:ja|jo|jep|jawohl|doch|nein|nee|ne|noe|okay|ok|klar|gern|gerne|bitte|keins|keines|keine|nichts|egal|abbrechen)\b/i;
    function kurzeAntwort(t) { t = String(t == null ? '' : t); return RX_KURZ.test(t) || (t.trim().split(/\s+/).length <= 4 && RX_JANEIN.test(t)); }

    function merke(orte, quelle) {
        try {
            var g = G(); if (!g) return false;
            g.fehlgeschlagen();   // eine neue Suche ersetzt den bisherigen Bezug vollständig: ältere Treffer bleiben nicht übrig
            g.ergebnisse('ortssuche', Array.isArray(orte) ? orte : [], quelle || 'ortssuche');
            g.absicht('ortssuche');
            setzeStand();
            return true;
        } catch (e) { return false; }
    }
    function fehler() { try { var g = G(); setzeStand(); return g ? g.fehlgeschlagen() : false; } catch (e) { return false; } }

    function hatKoordinaten(z) { return !!z && typeof z.lat === 'number' && typeof z.lon === 'number' && isFinite(z.lat) && isFinite(z.lon); }
    function eindeutig(z) { return !!z && !!z.name && (hatKoordinaten(z) || !!z.link); }
    function routeUrl(z) {
        if (hatKoordinaten(z)) return 'https://www.google.com/maps/dir/?api=1&travelmode=' + ((typeof z.distanzKm === 'number' && z.distanzKm < 0.9) ? 'walking' : 'driving') + '&destination=' + z.lat.toFixed(6) + ',' + z.lon.toFixed(6);
        return z.link || '';
    }
    function entfernungText(km) {
        if (km < 0.95) return 'etwa ' + Math.max(10, Math.round(km * 100) * 10) + ' Meter';
        return 'etwa ' + (Math.round(km * 10) / 10).toFixed(1).replace('.', ',') + ' Kilometer';
    }
    function nameMitAdresse(z) { return z.name + (z.adresse ? ', ' + z.adresse : ''); }

    function beantworte(r, text) {
        var z = r.ziel;
        switch (r.art) {
            case 'rueckfrage':
                try { if (window.jvFrage && typeof window.jvFrage.neu === 'function') window.jvFrage.neu('gespraech_ort'); } catch (e) { }   // wir haben gerade gefragt: unsere Frage ist die jüngste
                say(r.frage); return true;
            case 'veraltet':
                say('Die Ergebnisse sind schon etwas älter, ich nehme lieber keinen alten Ort. Such bitte noch einmal, dann beziehe ich mich auf die neuen Treffer.'); return true;
            case 'abgebrochen':
                say('Alles klar, ich lasse es.'); return true;
            case 'auswahl':
                say('Okay, ' + z.name + (r.grund === 'korrektur' ? ' ist es dann.' : '.') + ' Sag „Wie komme ich dahin“, dann zeige ich dir die Route.');
                karten([{ icon: '📍', title: z.name, subtitle: z.adresse || z.beschreibung || '' }]);
                return true;
            case 'folgefrage':
                break;
            default:
                return false;   // kein_bezug, ohne_bezug, antwort: alles wie bisher
        }
        /* Folgefrage zu einem eindeutig gewählten Ort */
        switch (r.thema) {
            case 'route':
                if (!eindeutig(z)) { say('Zu ' + z.name + ' habe ich keine genaue Adresse, deshalb biete ich dir dafür keine Navigation an.'); return true; }
                say('Hier ist die Route zu ' + z.name + '. Tippe auf die Karte, dann öffnet sich die Navigation.');
                karten([{ icon: '🧭', title: 'Route zu ' + z.name, subtitle: z.adresse || 'Tippen: Navigation öffnen', href: routeUrl(z) }]);
                return true;
            case 'entfernung':
                if (typeof z.distanzKm === 'number') { say(z.name + ' ist ' + entfernungText(z.distanzKm) + ' Luftlinie von dir entfernt. Die Fahrzeit kenne ich nicht, die zeigt dir die Navigation.'); return true; }
                break;
            case 'adresse':
                if (z.adresse) { say(z.name + ' ist hier: ' + z.adresse + '.'); return true; }
                break;
            default: break;
        }
        /* Rest geht an die bestehende KI, mit dem eindeutigen Ort als Zusatz */
        if (typeof window.sendToGroqSmart === 'function') {
            window.sendToGroqSmart(text + ' (Gemeint ist ' + nameMitAdresse(z) + '. Erfinde keine Angaben zu Öffnungszeiten, Parkplätzen, Preisen oder Fahrzeiten; sage ehrlich, wenn du etwas nicht sicher weißt.)');
            return true;
        }
        return false;
    }

    function hatFrage() { try { var g = G(); return !!g && g.offeneFragen().length > 0 && !fremdJuenger(); } catch (e) { return false; } }

    function behandle(text) {
        var g = G(); if (!g || typeof text !== 'string') return false;
        var st = g.status();
        if (!st.listen.length && !st.offeneFragen) return false;                         // nichts gemerkt: alles wie bisher
        var kurz = kurzeAntwort(text), eigeneFrage = g.offeneFragen().length > 0;
        if (kurz && fremdJuenger()) return false;                                        // ein anderes Modul hat nach uns gefragt: kurze Antworten gehören ihm
        if (kurz && !eigeneFrage && RX_KURZ.test(text) && speichernOffen() && !g.ausgewaehlt()) {           // "das zweite" bei offener Frage "Adresse speichern?" und noch keiner Auswahl: Lokal wählen oder Adresse speichern? Nicht raten.
            say('Meinst du eine Adresse speichern oder ein Lokal auswählen? Zum Speichern sag „die zweite“ oder „Nein“, zum Auswählen „Das zweite gefällt mir“.');
            setzeStand();
            return true;
        }
        var r = g.aufloesen(text);
        if (!r || r.art === 'kein_bezug') return false;
        var erledigt = beantworte(r, text);
        if (erledigt) setzeStand();                                                      // wir waren zuletzt dran (bei einer Rückfrage ist die Anmeldung oben schon erfolgt)
        return erledigt;
    }

    window.jvOrtGespraech = { merke: merke, fehler: fehler, behandle: behandle, hatFrage: hatFrage };
})();
