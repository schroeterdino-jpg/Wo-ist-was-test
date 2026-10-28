/* ============================================================
   FÄHIGKEITEN-VERZEICHNIS (B1): beschreibt, was Jarvis kann. Rein beschreibend: diese Datei verändert kein Verhalten,
   hängt sich nirgends ein und wird von keiner anderen Datei benutzt (die Hilfe folgt später, B2). Die Tests in
   tests/jarvis_pruefstrecke.js prüfen, dass die Angaben hier zur echten App passen (Dateien, Aktionen, Befehle, ZaneNative).

   Zugriff:  window.jvFaehigkeiten.liste            alle Fähigkeiten (eingefroren, nur lesbar)
             window.jvFaehigkeiten.nach('kalender') eine Fähigkeit
             window.jvFaehigkeiten.besitzerVon('aktion', 'calendar_delete')  -> Fähigkeit, die diesen Intent besitzt
             window.jvFaehigkeiten.uebergreifend    Regeln, die für mehrere Fähigkeiten gelten (z. B. Rückfrage vor dem Löschen)

   Felder je Fähigkeit:
     id, name, beschreibung
     intents        EIGENE Intents (hier ist diese Fähigkeit der eindeutige Hauptbesitzer). Je Intent:
                      typ    'aktion' = Aktionsart der KI (action.type), 'befehl' = Name in der Befehlsliste (jvCommands),
                             'basis' = Funktion im Grundstock (localcommands.js), 'ki' = die KI antwortet aus dem Kontext (kein eigener Befehl)
                      bezug  der Name, zum Beispiel 'calendar_delete' oder 'was_steht_an'
                      art    'lesen' = nur Auskunft; 'aendern' = ändert Daten/Einstellungen oder löst etwas aus (zum Beispiel startet die Navigation);
                             'kritisch' = löscht, schickt etwas an andere oder lässt sich nicht einfach rückgängig machen
                      vorgaenge, beispiele [{ satz, weg: 'lokal'|'ki', modul (nur bei lokal: Name in der Befehlsliste) }]
     abhaengigkeiten  was diese Fähigkeit verwendet, OHNE es zu besitzen:
                      { typ: 'faehigkeit', ref, wofuer, pflicht } | { typ: 'kontext', ref, wofuer, pflicht } | { typ: 'bereich', ref, wofuer }
                      ('bereich' = Teil der App, der noch keine eigene Fähigkeit ist, zum Beispiel Kontakte)
     handyApp         'nein' | 'ja' | 'teilweise' (braucht ZaneNative bzw. die Jarvis-Handy-App), handyAppDetail
     proaktiv         { wert: 'ja'|'nein'|'teilweise', ausloeser: [{ modul, art: ['Sprache'|'Push'|'Karte'|'Hintergrundprüfung'], wann }] }
     module           beteiligte Dateien (relativ zum Projekt)
     bekannteGrenzen  Hinweise auf bekannte Fehler/Lücken (nur vermerkt, nicht behoben; siehe tests/ist-zustand.md)
   Muss nicht an einer bestimmten Stelle geladen werden.
   ============================================================ */
(function () {
    'use strict';

    function frieren(o) {
        if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); Object.keys(o).forEach(function (k) { frieren(o[k]); }); }
        return o;
    }

    var LISTE = [

        /* ---------- 1. Kalender ---------- */
        {
            id: 'kalender', name: 'Kalender',
            beschreibung: 'Termine anlegen, ändern, löschen und abfragen (App-Kalender, mit Google Kalender, wenn verbunden). Findet auf Wunsch freie Zeiten und liest vor, was ansteht.',
            intents: [
                { typ: 'aktion', bezug: 'calendar', art: 'aendern', vorgaenge: ['Termin anlegen', 'Geburtstag ganztägig anlegen'],
                  beispiele: [{ satz: 'Trag morgen um 15 Uhr Zahnarzt in Hamburg ein', weg: 'ki' }, { satz: 'Trag Alyssas Geburtstag am 30. Oktober ein', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'calendar_update', art: 'aendern', vorgaenge: ['Termin verschieben oder umbenennen'],
                  beispiele: [{ satz: 'Verschieb den Zahnarzt auf Freitag', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'calendar_delete', art: 'kritisch', vorgaenge: ['Termin löschen (mit Rückfrage)'],
                  beispiele: [{ satz: 'Lösch den Friseurtermin morgen', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'calendar_search', art: 'lesen', vorgaenge: ['Im Google Kalender nach Terminen und Geburtstagen suchen'],
                  beispiele: [{ satz: 'Wann hat Schatz Geburtstag?', weg: 'ki' }] },
                { typ: 'befehl', bezug: 'was_steht_an', art: 'lesen', vorgaenge: ['Termine, Erinnerungen, Aufgaben und Einkaufsliste vorlesen'],
                  beispiele: [{ satz: 'Was steht morgen in meinem Kalender?', weg: 'lokal', modul: 'was_steht_an' }, { satz: 'Was steht heute an?', weg: 'lokal', modul: 'was_steht_an' }] },
                { typ: 'befehl', bezug: 'terminfinder', art: 'aendern', vorgaenge: ['Freie Zeiten finden und nach Auswahl eintragen'],
                  beispiele: [{ satz: 'Ich müsste mal zu meiner Mutter fahren', weg: 'lokal', modul: 'terminfinder' }] }
            ],
            abhaengigkeiten: [
                { typ: 'faehigkeit', ref: 'schicht', wofuer: 'Terminfinder berücksichtigt Schicht und Urlaub bei freien Zeiten', pflicht: false },
                { typ: 'faehigkeit', ref: 'fahrzeit_navigation', wofuer: 'Terminfinder rechnet bei Besuchen mit Adresse die Fahrzeit mit', pflicht: false },
                { typ: 'kontext', ref: 'Google Kalender verbunden', wofuer: 'ohne Verbindung steht ein Termin nur in der App', pflicht: false },
                { typ: 'bereich', ref: 'kontakte', wofuer: 'ein Ort kann aus einem Kontakt mit Adresse kommen' }
            ],
            handyApp: 'nein', handyAppDetail: 'Der Kalender läuft auch im Browser. Die Handy-App wird nur für Meldungen bei gesperrtem Handy gebraucht.',
            proaktiv: { wert: 'teilweise', ausloeser: [
                { modul: 'js/briefing.js', art: ['Sprache'], wann: 'Tagesbriefing nennt Termine des Tages' },
                { modul: 'js/plan_ansagen.js', art: ['Sprache', 'Push'], wann: 'Wochenüberblick am Sonntag 18:00 mit den Terminen der kommenden Woche' },
                { modul: 'js/dirigent.js', art: ['Sprache', 'Push'], wann: 'schaut selbst auf den Tag (Termine, Erinnerungen, Schicht, Wetter) und meldet sich nur bei Brauchbarem' },
                { modul: 'js/pushsync.js', art: ['Push'], wann: 'Termine mit Uhrzeit und Ort gehen an den Server für die Abfahrtsmeldung (auch bei geschlossener App)' }
            ] },
            module: ['js/calendar.js', 'js/geburtstag_ganztag.js', 'js/terminfinder.js', 'js/was_steht_an.js', 'js/actions.js', 'js/loeschen_fragen.js'],
            bekannteGrenzen: ['Löschfrage hängt sich an eine noch offene Löschfrage an (3b, B)', '"Lösch den Tierarzttermin" ohne Treffer fragt nach dem ersten Termin (3d, B)', 'Termin ohne Ort: Nachfrage bei Wetter/Abfahrt fehlt noch (D3)']
        },

        /* ---------- 2. Wetter ---------- */
        {
            id: 'wetter', name: 'Wetter',
            beschreibung: 'Wetter jetzt und die Vorhersage für 7 Tage, Wetterkarte zu jedem Ort, amtliche Unwetterwarnungen und Wetter-Effekt im Hintergrund.',
            intents: [
                { typ: 'ki', bezug: 'wetter_frage', art: 'lesen', pruefung: 'wettervorhersage', vorgaenge: ['Wetter heute/morgen/Woche aus den Wetterdaten im Kontext beantworten'],
                  beispiele: [{ satz: 'Wie wird das Wetter morgen?', weg: 'ki' }, { satz: 'Brauche ich einen Regenschirm?', weg: 'ki' }] },
                { typ: 'basis', bezug: 'handleWeatherMapCommand', art: 'lesen', vorgaenge: ['Wetterkarte und 7 Tage zu einem genannten Ort anzeigen'],
                  beispiele: [{ satz: 'Zeig mir das Wetter in Istanbul', weg: 'lokal' }, { satz: 'Wetterkarte Hamburg', weg: 'lokal' }] },
                { typ: 'befehl', bezug: 'wetterfx', art: 'aendern', vorgaenge: ['Wetter-Effekt im Hintergrund an/aus oder als Vorschau'],
                  beispiele: [{ satz: 'Wetter-Effekt aus', weg: 'lokal', modul: 'wetterfx' }] }
            ],
            abhaengigkeiten: [
                { typ: 'kontext', ref: 'Ort (genannt oder Standort)', wofuer: 'ohne Ortsnamen nutzt Jarvis den Standort', pflicht: false },
                { typ: 'dienst', ref: 'Open-Meteo, Bright Sky (DWD), Windy-Karte', wofuer: 'Wetterdaten, Warnungen, Karte', pflicht: true }
            ],
            handyApp: 'nein', handyAppDetail: 'Alles läuft auch im Browser.',
            proaktiv: { wert: 'teilweise', ausloeser: [
                { modul: 'js/unwetter.js', art: ['Sprache'], wann: 'Wächter meldet DWD-Warnungen ab Stufe markant (nur bei offener App, nie 22 bis 7 Uhr, jede Warnung einmal am Tag)' },
                { modul: 'js/briefing.js', art: ['Sprache'], wann: 'Tagesbriefing nennt das Wetter' },
                { modul: 'js/zuvorkommend.js', art: ['Sprache'], wann: 'Frost am Abend vor der Frühschicht: Abfahrt wird vorgezogen' }
            ] },
            module: ['js/weathermap.js', 'js/unwetter.js', 'js/wetterfx.js', 'js/briefing.js', 'js/prompt.js'],
            bekannteGrenzen: ['Wetter plus anderes in einem Satz (Kalender, Vollmond) geht an die KI, keine gemeinsame Antwort (14, 15, C)']
        },

        /* ---------- 3. Fahrzeit / Navigation ---------- */
        {
            id: 'fahrzeit_navigation', name: 'Fahrzeit und Navigation',
            beschreibung: 'Fahrzeit und Abfahrtszeit zu einem Ziel oder Termin, Route (auch mit Tankstopp oder mit Bus und Bahn), Navigation starten, Lagebild mit Arbeitsweg und Verkehr.',
            intents: [
                { typ: 'aktion', bezug: 'travel_time', art: 'lesen', vorgaenge: ['Fahrzeit ermitteln', 'Abfahrtszeit bestimmen', 'Route berechnen'],
                  beispiele: [{ satz: 'Wann muss ich zum Zahnarzt losfahren?', weg: 'ki' }, { satz: 'Wie lange dauert die Fahrt nach Hamburg?', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'fuel_route', art: 'lesen', vorgaenge: ['Route mit günstigster Tankstelle auf dem Weg'],
                  beispiele: [{ satz: 'Wo tanke ich auf dem Weg nach Hamburg am günstigsten?', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'bahn', art: 'lesen', vorgaenge: ['Verbindung mit Bus und Bahn suchen'],
                  beispiele: [{ satz: 'Wann fährt der nächste Zug nach Hamburg?', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'navigate', art: 'aendern', vorgaenge: ['Navigation starten (öffnet Google Maps)'],
                  beispiele: [{ satz: 'Navigiere zum Edeka in Bergedorf', weg: 'ki' }] },
                { typ: 'befehl', bezug: 'lagebild', art: 'lesen', vorgaenge: ['Lagebild öffnen: Arbeitsweg, Regen, Diesel, Verkehr in der Nähe'],
                  beispiele: [{ satz: 'Zeig mir das Lagebild', weg: 'lokal', modul: 'lagebild' }] },
                { typ: 'befehl', bezug: 'fahrtcheck', art: 'lesen', vorgaenge: ['Tipp zur Fahrt: Wetter am Ziel, Tankstelle, passende Listen'] }
            ],
            abhaengigkeiten: [
                { typ: 'kontext', ref: 'Standort oder genanntes Ziel', wofuer: 'Start ist der Standort, ohne Standort braucht die Route einen Startort', pflicht: true },
                { typ: 'faehigkeit', ref: 'kalender', wofuer: 'Abfahrt zu einem Termin mit Ort', pflicht: false },
                { typ: 'faehigkeit', ref: 'wetter', wofuer: 'Fahrt-Check nennt Wetter am Ziel zur Ankunft', pflicht: false },
                { typ: 'bereich', ref: 'kontakte', wofuer: 'Ziel kann ein Kontakt mit Adresse sein' },
                { typ: 'dienst', ref: 'OSRM, Nominatim, TomTom, autobahn.de', wofuer: 'Routenzeit, Adresssuche, Staumeldungen', pflicht: true }
            ],
            handyApp: 'nein', handyAppDetail: 'Route und Navigationslink laufen im Browser. Parkplatz-Funktionen über Bluetooth gehören nicht zu dieser Fähigkeit.',
            proaktiv: { wert: 'ja', ausloeser: [
                { modul: 'js/wachter.js', art: ['Sprache'], wann: 'Termin mit Ort: "Es wird Zeit loszufahren" (nur bei offener App)' },
                { modul: 'js/vorbereitung.js', art: ['Sprache', 'Karte'], wann: '90 bis 45 Minuten vor einem Termin mit Ort: Route, Abfahrt, Wetter am Ziel, Tankstelle' },
                { modul: 'js/plan_ansagen.js', art: ['Sprache', 'Push'], wann: 'Aufbruchszeit und Verkehrslage vor der Abfahrt zur Arbeit' }
            ] },
            module: ['js/travel.js', 'js/lagebild.js', 'js/fahrtcheck.js', 'js/stadtverkehr.js', 'js/karte_zu.js', 'js/assistant.js', 'js/actions.js'],
            bekannteGrenzen: ['Termin, Wetter, Fahrzeit in einem Satz: keine gemeinsame Antwort, bei einem ausgefallenen Dienst keine Teilantwort (11a, 25, C)']
        },

        /* ---------- 4. Erinnerungen ---------- */
        {
            id: 'erinnerungen', name: 'Erinnerungen',
            beschreibung: 'Erinnerungen anlegen, wiederholen, abhaken und löschen. Zu einem Termin kann Jarvis nach der Vorlaufzeit fragen und eine Erinnerung dazu anlegen.',
            intents: [
                { typ: 'aktion', bezug: 'reminder', art: 'aendern', vorgaenge: ['Erinnerung anlegen', 'Wiederholung und wichtige Erinnerung'],
                  beispiele: [{ satz: 'Erinnere mich morgen um 8 Uhr an den Arzt', weg: 'ki' }, { satz: 'Erinnere mich alle zwei Wochen an die Wäsche', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'reminder_delete', art: 'kritisch', vorgaenge: ['Erinnerung löschen (mit Rückfrage)', 'alle Erinnerungen löschen'],
                  beispiele: [{ satz: 'Lösche die Erinnerung Zahnarzt', weg: 'ki' }] },
                { typ: 'befehl', bezug: 'termin-erinnern', art: 'aendern', vorgaenge: ['Nach einem Termin fragen "Wie viele Stunden vorher?" und Erinnerung mit dem Termin verknüpfen'],
                  beispiele: [{ satz: '30 Minuten vorher.', weg: 'lokal', modul: 'termin-erinnern' }] }
            ],
            abhaengigkeiten: [
                { typ: 'faehigkeit', ref: 'kalender', wofuer: 'die Termin-Erinnerung gehört zu einem Termin und wandert mit, wenn der Termin verschoben wird', pflicht: false },
                { typ: 'kontext', ref: 'Benachrichtigungen erlaubt', wofuer: 'Push bei geschlossener App', pflicht: false }
            ],
            handyApp: 'nein', handyAppDetail: 'Push bei geschlossener App läuft über den Server (api/sync.js), nicht über ZaneNative.',
            proaktiv: { wert: 'ja', ausloeser: [
                { modul: 'js/calendar.js', art: ['Sprache', 'Hintergrundprüfung'], wann: 'Erinnerungs-Timer löst zur eingestellten Zeit aus (App offen)' },
                { modul: 'js/pushsync.js', art: ['Push'], wann: 'Erinnerungen gehen an den Server, der auch bei geschlossener App benachrichtigt' },
                { modul: 'js/reminders.js', art: ['Sprache'], wann: 'wichtige Erinnerungen: fragt nach, bis du "erledigt" sagst' }
            ] },
            module: ['js/reminders.js', 'js/calendar.js', 'js/langzeit_erinnern.js', 'js/pushsync.js', 'js/loeschen_fragen.js', 'api/sync.js'],
            bekannteGrenzen: ['Rückfrage fragt nach Stunden, die Antwort kommt oft in Minuten (4b, C)', 'Ein "Ja" bestätigt mehrere offene Löschfragen (3b2-b, B)']
        },

        /* ---------- 5. Gedächtnis ---------- */
        {
            id: 'gedaechtnis', name: 'Gedächtnis',
            beschreibung: 'Merkt sich Gegenstände und Orte (lokal) sowie Erlebnisse, Pläne und Vorlieben (Langzeitgedächtnis) und beantwortet Fragen dazu.',
            intents: [
                { typ: 'aktion', bezug: 'memory_store', art: 'aendern', vorgaenge: ['Gegenstand oder Ort im lokalen Gedächtnis merken (überschreibt gleichen Schlüssel)'],
                  beispiele: [{ satz: 'Merk dir, der Ersatzschlüssel hängt am Klemmbrett', weg: 'ki' }, { satz: 'Meine Frau heißt Simone', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'memory_search', art: 'lesen', vorgaenge: ['Im lokalen Gedächtnis suchen'],
                  beispiele: [{ satz: 'Wo ist mein Ersatzschlüssel?', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'episode_store', art: 'aendern', vorgaenge: ['Erlebnis, Plan oder Vorliebe im Langzeitgedächtnis speichern'],
                  beispiele: [{ satz: 'Wir waren gestern im Tierpark Hagenbeck', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'episode_forget', art: 'kritisch', vorgaenge: ['Eintrag im Langzeitgedächtnis vergessen (mit Rückfrage)'],
                  beispiele: [{ satz: 'Vergiss das mit dem Konzert', weg: 'ki' }] },
                { typ: 'aktion', bezug: 'episode_asked', art: 'aendern', vorgaenge: ['Vermerken, dass nachgefragt wurde'] },
                { typ: 'aktion', bezug: 'episode_nicht_fragen', art: 'aendern', vorgaenge: ['Zu einem Eintrag nicht mehr nachfragen'] },
                { typ: 'befehl', bezug: 'gedaechtnis_zeit', art: 'lesen', vorgaenge: ['Wann wurde ein Gegenstand abgelegt?'],
                  beispiele: [{ satz: 'Wann habe ich den Schlüssel abgelegt?', weg: 'lokal', modul: 'gedaechtnis_zeit' }] }
            ],
            abhaengigkeiten: [
                { typ: 'dienst', ref: 'Upstash Vektor-Datenbank (api/memory.js)', wofuer: 'Langzeitgedächtnis', pflicht: false },
                { typ: 'faehigkeit', ref: 'kalender', wofuer: 'ein Termin mit Datum und Uhrzeit kann im Gedächtnis oder als Kalendertermin landen', pflicht: false }
            ],
            handyApp: 'nein', handyAppDetail: 'Läuft auch im Browser.',
            proaktiv: { wert: 'teilweise', ausloeser: [
                { modul: 'js/langzeit.js', art: ['Sprache'], wann: 'Nachfragen zu gemerkten Plänen und Erlebnissen (Server-Aktion "due" wählt aus)' },
                { modul: 'js/dirigent.js', art: ['Sprache', 'Push'], wann: 'bezieht das Langzeitgedächtnis in die Wahl der einen Tagesmeldung ein' }
            ] },
            module: ['js/gedaechtnis.js', 'js/gedaechtnis_zeit.js', 'js/langzeit.js', 'js/briefing.js', 'js/actions.js', 'js/loeschen_fragen.js', 'api/memory.js'],
            bekannteGrenzen: ['Neuer Wert überschreibt den alten ohne Widerspruchs-Hinweis (17b, C)', 'Gemerkte Adresse wird bei Terminen nicht benutzt (D6)', 'Ein "Ja" bestätigt mehrere offene Löschfragen (3b2-b, B)']
        },

        /* ---------- 6. Fotos ---------- */
        {
            id: 'fotos', name: 'Fotos',
            beschreibung: 'Foto auswerten: erkennt Einkaufszettel, Rechnung, Brief, Plakat, Visitenkarte, Stundenplan, Parkschild, Warnleuchte, Rezept, Essensplan und Adressen. Jede Funktion fragt vor dem Speichern nach.',
            intents: [
                { typ: 'befehl', bezug: 'foto-erkennung', art: 'aendern', vorgaenge: ['Foto erkennen und die passende Funktion starten'],
                  beispiele: [{ satz: 'Mach ein Foto', weg: 'lokal' }] },
                { typ: 'befehl', bezug: 'foto-person', art: 'aendern', vorgaenge: ['Aussehen einer Person merken'] },
                { typ: 'befehl', bezug: 'rezepte', art: 'aendern', vorgaenge: ['Rezept vom Foto übernehmen'] },
                { typ: 'befehl', bezug: 'essensplan', art: 'aendern', vorgaenge: ['Essensplan vom Foto übernehmen'] },
                { typ: 'befehl', bezug: 'urlaubsplan', art: 'aendern', vorgaenge: ['Urlaubsplan vom Foto übernehmen'] },
                { typ: 'befehl', bezug: 'fotosenden', art: 'kritisch', vorgaenge: ['Foto per WhatsApp verschicken (an andere)'],
                  beispiele: [{ satz: 'Schick das Foto per WhatsApp', weg: 'lokal' }] }
            ],
            abhaengigkeiten: [
                { typ: 'faehigkeit', ref: 'fahrzeit_navigation', wofuer: 'Adresse auf einem Foto kann direkt als Navigationsziel dienen (foto_adresse.js)', pflicht: false },
                { typ: 'faehigkeit', ref: 'kalender', wofuer: 'Termine von Plakat, Einladung oder Foto eintragen', pflicht: false },
                { typ: 'faehigkeit', ref: 'erinnerungen', wofuer: 'Erinnerung zu einer fotografierten Rechnung', pflicht: false },
                { typ: 'bereich', ref: 'kontakte', wofuer: 'Visitenkarte legt einen Kontakt an, Adresse kann gespeichert werden' },
                { typ: 'bereich', ref: 'listen', wofuer: 'Einkaufszettel-Foto füllt die Einkaufsliste' },
                { typ: 'kontext', ref: 'Kamera oder Bild', wofuer: 'ohne Bild keine Auswertung', pflicht: true }
            ],
            handyApp: 'teilweise', handyAppDetail: 'Auswertung läuft im Browser. Das Foto per WhatsApp senden braucht die Handy-App.',
            proaktiv: { wert: 'nein', ausloeser: [] },
            module: ['js/photo.js', 'js/foto_erkennen.js', 'js/foto_adresse.js', 'js/foto_abtippen.js', 'js/foto_brief.js', 'js/foto_person.js', 'js/foto_rezept.js', 'js/foto_essensplan.js', 'js/foto_urlaubsplan.js', 'js/foto_stundenplan.js', 'js/fotosenden.js'],
            bekannteGrenzen: []
        },

        /* ---------- 7. Schicht ---------- */
        {
            id: 'schicht', name: 'Schicht',
            beschreibung: 'Früh-/Spätschicht im Wochenwechsel, Beginn, Abfahrt und Ende, Briefing zur richtigen Zeit, Urlaub, früherer Beginn an einzelnen Tagen und Meldungen zur Abfahrt und zum Feierabend.',
            intents: [
                { typ: 'befehl', bezug: 'schicht', art: 'aendern', vorgaenge: ['Schicht der Woche setzen'],
                  beispiele: [{ satz: 'Diese Woche Frühschicht', weg: 'lokal', modul: 'schicht' }] },
                { typ: 'befehl', bezug: 'schicht_auskunft', art: 'lesen', vorgaenge: ['Schichtzeiten und Aufstehzeit nennen'],
                  beispiele: [{ satz: 'Wann beginnt meine Spätschicht?', weg: 'lokal', modul: 'schicht_auskunft' }] },
                { typ: 'befehl', bezug: 'frueher-los', art: 'aendern', vorgaenge: ['Abfahrt und Briefing an einem Tag vorziehen (höchstens 60 Minuten)'],
                  beispiele: [{ satz: 'Ich muss Donnerstag um 13:15 auf der Arbeit sein', weg: 'lokal', modul: 'frueher-los' }] },
                { typ: 'befehl', bezug: 'urlaub', art: 'aendern', vorgaenge: ['Urlaub eintragen: keine Arbeitswegmeldungen in dieser Zeit'],
                  beispiele: [{ satz: 'Ich habe Urlaub vom 20. Oktober bis 3. November', weg: 'lokal', modul: 'urlaub' }] },
                { typ: 'befehl', bezug: 'plan_ansagen', art: 'lesen', vorgaenge: ['Heimweg und Plan-Ansagen auf Zuruf'],
                  beispiele: [{ satz: 'Heimweg', weg: 'lokal', modul: 'plan_ansagen' }] },
                { typ: 'befehl', bezug: 'plan_wecker', art: 'aendern', vorgaenge: ['Wecker zur Schicht'] }
            ],
            abhaengigkeiten: [
                { typ: 'faehigkeit', ref: 'fahrzeit_navigation', wofuer: 'Abfahrt = Schichtbeginn minus Fahrzeit (aktueller Verkehr) minus Puffer', pflicht: false },
                { typ: 'faehigkeit', ref: 'kalender', wofuer: 'Wochenüberblick nennt Termine der kommenden Woche', pflicht: false },
                { typ: 'faehigkeit', ref: 'wetter', wofuer: 'Briefing und Frost-Hinweis nutzen das Wetter', pflicht: false },
                { typ: 'kontext', ref: 'Schicht der Woche eingetragen', wofuer: 'ohne Schicht keine Zeiten und Ansagen', pflicht: true },
                { typ: 'kontext', ref: 'Heimatadresse', wofuer: 'Heimweg-Meldung braucht sie', pflicht: false }
            ],
            handyApp: 'teilweise', handyAppDetail: 'Schichtplan und Auskunft laufen im Browser. Ansagen bei gesperrtem Handy planen nur über die Handy-App (ZaneNative.planAnsagen).',
            proaktiv: { wert: 'ja', ausloeser: [
                { modul: 'js/plan_ansagen.js', art: ['Sprache', 'Push'], wann: 'Wochenüberblick So 18:00, Aufbruch 10 Minuten vor Abfahrt, Briefing, Wecker-Frage, Feierabend nur als Benachrichtigung' },
                { modul: 'js/zuvorkommend.js', art: ['Sprache'], wann: 'Frost vor der Frühschicht: Abfahrt wird vorgezogen' },
                { modul: 'js/dirigent.js', art: ['Sprache', 'Push'], wann: 'Tagesmeldung unter Einbezug von Schicht und Urlaub' }
            ] },
            module: ['js/schicht.js', 'js/schichtauskunft.js', 'js/plan_ansagen.js', 'js/frueher_los.js', 'js/urlaub.js', 'js/zuvorkommend.js'],
            bekannteGrenzen: ['Im Browser ohne Handy-App fällt "Vertretung nach 5 Minuten" still an die KI, kein Hinweis (24b, B)', 'Feierabend/Heimweg ist nur Benachrichtigung, Sprachausgabe nur auf Zuruf']
        },

        /* ---------- 8. Preissuche ---------- */
        {
            id: 'preissuche', name: 'Preissuche',
            beschreibung: 'Günstigste Preise bei Google Shopping suchen, Geschenkideen mit echten Preisen, und Preiswächter, der meldet, wenn ein Preis unter die Grenze fällt.',
            intents: [
                { typ: 'befehl', bezug: 'preissuche', art: 'aendern', vorgaenge: ['Preis suchen (nur lesen)', 'Geschenkideen mit Preisen', 'Preiswächter anlegen', 'Beobachtung beenden', 'Wächter sofort prüfen'],
                  beispiele: [{ satz: 'Such mir den günstigsten Preis für Bosch Akkuschrauber', weg: 'lokal', modul: 'preissuche' }, { satz: 'Welche Preise beobachtest du?', weg: 'lokal', modul: 'preissuche' }] }
            ],
            abhaengigkeiten: [
                { typ: 'dienst', ref: 'Google Shopping über /api/maps?action=shopping (SERPER_API_KEY auf dem Server)', wofuer: 'Preise', pflicht: true },
                { typ: 'bereich', ref: 'wunschliste', wofuer: 'Geschenkideen nutzen die Wunschliste einer Person' },
                { typ: 'faehigkeit', ref: 'gedaechtnis', wofuer: 'Geschenkideen nutzen, was Jarvis über die Person weiß', pflicht: false }
            ],
            handyApp: 'teilweise', handyAppDetail: 'Suche läuft im Browser. Links im Browser oder Fenster öffnen nutzt in der Handy-App ZaneNative.oeffneImBrowser.',
            proaktiv: { wert: 'ja', ausloeser: [
                { modul: 'js/preissuche.js', art: ['Sprache', 'Hintergrundprüfung'], wann: 'Preiswächter prüft beim App-Start (nach etwa 45 Sekunden) und beim Zurückkommen, je Produkt höchstens alle 20 Stunden, und meldet nur einen neuen Preis unter der Grenze oder bei 5 Prozent Fall' }
            ] },
            module: ['js/preissuche.js'],
            bekannteGrenzen: ['Ohne SERPER_API_KEY in Vercel sagt Jarvis nur, dass der Schlüssel fehlt']
        }
    ];

    /* Übergreifende Regeln, die zu keiner einzelnen Fähigkeit gehören */
    var UEBERGREIFEND = [
        { befehl: 'loeschen_fragen', modul: 'js/loeschen_fragen.js', art: 'kritisch', gilt_fuer: ['kalender', 'erinnerungen', 'gedaechtnis'],
          beschreibung: 'Rückfrage "Soll ich ... wirklich löschen?" vor jedem Löschen von Terminen, Erinnerungen und Langzeit-Einträgen; erst ein "Ja" löscht.' }
    ];

    frieren(LISTE); frieren(UEBERGREIFEND);

    function nach(id) { for (var i = 0; i < LISTE.length; i++) if (LISTE[i].id === id) return LISTE[i]; return null; }
    function besitzerVon(typ, bezug) {
        for (var i = 0; i < LISTE.length; i++) for (var j = 0; j < LISTE[i].intents.length; j++) {
            var it = LISTE[i].intents[j]; if (it.typ === typ && it.bezug === bezug) return LISTE[i];
        }
        return null;
    }
    window.jvFaehigkeiten = Object.freeze({ liste: LISTE, uebergreifend: UEBERGREIFEND, nach: nach, besitzerVon: besitzerVon });
})();
