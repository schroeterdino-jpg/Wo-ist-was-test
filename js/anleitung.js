/* ============================================================
   GEFÜHRTE TOUR: Schritt für Schritt durch alles, was Jarvis kann.
   Aufruf: Einstellungen > "Geführte Tour" oder Sprache: "Tour", "Rundgang", "Führe mich durch die App".
   Jeder Schritt: Symbol, Titel, kurze Erklärung, Beispielsätze ("Sag zum Beispiel"), optional "Mehr Beispiele" (Hilfe-Thema h).
   Vorlesen per 🔊, Inhaltsverzeichnis per ☰, Wischen oder Zurück/Weiter.
   WICHTIG: Wird in Jarvis etwas Neues eingebaut, hier einen Schritt ergänzen. Der Abgleich mit der Hilfe (HELP_TOPICS) steht in ARCHITEKTUR.md.
   Nur Web-Seite. Bewusst getrennt von einfuehrung.js ("Anleitung": was zuerst einzurichten ist).
   ============================================================ */
(function () {
    'use strict';

    /* g = Gruppe, i = Symbol, t = Titel, d = Erklärung, s = Beispielsätze, h = Hilfe-Thema (HELP_TOPICS), n = Hinweis */
    var STEPS = [
        /* ---------- Los geht's ---------- */
        { g: "Los geht’s", i: "🎤", t: "So sprichst du mit Jarvis", h: "einstellungen",
          d: "Tippe auf den Kreis unten und sprich ganz normal, so wie mit einem Menschen. Du musst keine festen Befehle lernen. Jarvis antwortet laut und zeigt dazu Karten oder Fenster.",
          s: ["Wie wird das Wetter morgen?", "Erinnere mich morgen um 8 Uhr an den Arzt", "Hilfe"] },
        { g: "Los geht’s", i: "🧩", t: "Mehrere Wünsche in einem Satz",
          d: "Du kannst mehrere Dinge auf einmal sagen. Jarvis erledigt sie nacheinander.",
          s: ["Stell den Wecker auf 4 Uhr und setz Milch auf die Liste"] },
        { g: "Los geht’s", i: "☰", t: "Das Menü oben links", n: "Das ⚙️ oben rechts öffnet die Einstellungen",
          d: "Hinter dem Menü liegen die großen Bereiche zum Antippen: Termine, Erinnerungen, Listen (Einkauf und Aufgaben), Gedächtnis, Karte, Welt, Protokolle, Adressen, Dashboard und Planer. Alles geht auch per Sprache.",
          s: ["Zeig mir das Dashboard", "Zeig meine Termine", "Zeig mir die Karte"] },
        { g: "Los geht’s", i: "🔑", t: "Google-Konto verbinden", n: "Einstellungen > Schnittstellen & Konten",
          d: "Für Kalender und E-Mails verbindest du Jarvis einmal mit deinem Google-Konto. „Alles prüfen“ testet Kalender, Gmail, Wetter, Spritpreise, Karten und die KI auf einmal.",
          s: ["Systemcheck"] },
        { g: "Los geht’s", i: "👂", t: "Weckwort „Hey Jarvis“", h: "auto", n: "Nur in der Handy-App (APK)",
          d: "In der Handy-App hört Jarvis im Hintergrund auf „Hey Jarvis“. Du musst dann nicht tippen. Mit der Einstellung „Unterbrechen“ reicht „Hey Jarvis“ sogar, während er spricht. Nachts (Standard 23 bis 4 Uhr) schläft das Weckwort.",
          s: ["Hey Jarvis", "Lauschen ausschalten", "Weckwort aus"] },
        { g: "Los geht’s", i: "🧭", t: "Die ersten Einstellungen", n: "Die Einführung dazu öffnet „Anleitung“",
          d: "Damit Jarvis rechnen kann, braucht er deine Arbeitsadresse, deinen Standort und deine Schicht. Alles Weitere kommt danach von selbst. Die Einführung mit allen Schritten öffnet sich mit dem Wort „Anleitung“.",
          s: ["Merk dir meine Arbeitsadresse: Musterstraße 5, Musterstadt", "Anleitung"] },
        { g: "Los geht’s", i: "🕒", t: "Schicht und Abfahrt", h: "schicht",
          d: "Sag Jarvis, ob du Früh- oder Spätschicht hast. Er wechselt jeden Montag von selbst und rechnet daraus Aufstehzeit, Abfahrt und Briefing. Beginn, Ende und Abfahrt kannst du ändern. Musst du an einem Tag früher anfangen, sag zum Beispiel „Ich muss Donnerstag um 13:15 auf der Arbeit sein“: Jarvis zieht die Abfahrt an dem Tag vor und meldet sich vorher mit der Verkehrslage.",
          s: ["Diese Woche Frühschicht", "Welche Schicht habe ich?", "Meine Frühschicht beginnt um 5 Uhr 30", "Wann stehe ich auf?", "Ich muss Donnerstag um 13:15 auf der Arbeit sein"] },
        { g: "Los geht’s", i: "🌴", t: "Urlaub", n: "Während des Urlaubs meldet Jarvis nichts zum Arbeitsweg",
          d: "Trage deinen Urlaub ein, dann sind Arbeitsweg, Abfahrt und Schichtmeldungen in dieser Zeit still.",
          s: ["Ich habe Urlaub vom 20. Oktober bis 3. November", "Habe ich Urlaub eingetragen?", "Urlaub beenden"] },
        { g: "Los geht’s", i: "🎩", t: "Anrede und Ton", h: "charakter",
          d: "Jarvis kann dich nennen, wie du willst, und antworten, wie du es magst: frech, höflich oder mit „Sir“. Er hat jeden Tag eine eigene Laune.",
          s: ["Nenn mich Boss", "Sei frecher", "Sei höflicher", "Keine Sprüche mehr", "Wie ist deine Laune?"] },
        { g: "Los geht’s", i: "🔔", t: "Benachrichtigungen", h: "push",
          d: "Schalte Benachrichtigungen an, dann meldet sich Jarvis auch bei geschlossener App: Erinnerungen, Abfahrt, Unwetter, Wochenüberblick, HSV-Endstand. In der Handy-App kommen sie auch ohne Browser.",
          s: ["Benachrichtigungen an", "Sende eine Test-Nachricht", "Meine Meldungen", "Keine Dieselmeldungen mehr"] },
        { g: "Alltag", i: "👋", t: "Jarvis meldet sich von selbst", n: "Bei offener App spricht er, sonst kommt eine Meldung",
          d: "Er wacht mit: Er sagt, wann du zum Termin losmusst, dass ein Termin gleich beginnt, und gibt Tipps wie „Nimm eine Jacke mit“, wenn im Termin Schwimmen oder Wandern steht. Während eines Briefings ist Ruhe. Abstellen kannst du es jederzeit.",
          s: ["Melde dich nicht mehr von selbst", "Keine Mails mehr", "Wettermeldungen aus"] },

        /* ---------- Alltag ---------- */
        { g: "Alltag", i: "📅", t: "Termine und Kalender", h: "termine",
          d: "Jarvis trägt Termine in deinen Google-Kalender ein, verschiebt sie und liest sie vor. Er prüft Überschneidungen, Feiertage, Wetter und Fahrzeit. Geburtstage kommen ganztägig und jedes Jahr.",
          s: ["Trag morgen um 15 Uhr Zahnarzt in Hamburg ein", "Verschieb den Zahnarzt auf Freitag", "Zeig meine Termine der nächsten Woche", "Wann hat Schatz Geburtstag?"] },
        { g: "Alltag", i: "⏰", t: "Erinnerungen", h: "erinnerungen",
          d: "Einmalig oder wiederkehrend. Wichtige Erinnerungen kommen alle 10 Minuten wieder, bis du „Erledigt“ sagst oder tippst.",
          s: ["Erinnere mich morgen um 8 Uhr an den Arzt", "Erinnere mich alle zwei Wochen an die Wäsche", "Wichtige Erinnerung: Paket abholen", "In zehn Minuten nochmal"] },
        { g: "Alltag", i: "📝", t: "Listen und Notizen", h: "listen",
          d: "Einkaufsliste, Aufgaben und Notizen. Aufgaben mit „heute“ liest Jarvis dir am Tag zuerst vor. Du kannst Listen auch per WhatsApp verschicken.",
          s: ["Setz Milch auf die Einkaufsliste", "Was steht auf meiner Einkaufsliste?", "Notiere, dass ich noch Kabelschuhe brauche", "Lösche Milch von der Liste", "Schick die Einkaufsliste per WhatsApp an Schatz"] },
        { g: "Alltag", i: "🧭", t: "Jarvis meldet sich zu deinem Tag", h: "termine", n: "Höchstens eine Meldung pro Tag; Handy-App: auch bei gesperrtem Handy",
          d: "Morgens um 9 Uhr (bei Frühschicht nachmittags um 15:45) und abends um 19 Uhr schaut Jarvis auf alles zusammen: Termine, Geburtstage, Wetter, Schicht, Einkauf, Wunschliste, Ausflüge, Pakete, offene Rechnungen, Feiertage, Unwetterwarnungen und das Langzeitgedächtnis. Er meldet sich nur, wenn sich etwas Brauchbares ergibt. Mit Ja führt er den Vorschlag aus, mit „Das interessiert mich nicht“ kommt das Thema nicht mehr.",
          s: ["Was hast du für mich?", "Warum hast du dich gemeldet?", "Das interessiert mich nicht", "Keine Tagesmeldungen mehr", "Tagesmeldungen an", "Alle Themen wieder"] },
        { g: "Alltag", i: "⭐", t: "Was ich besser kann", h: "termine", n: "Feste Antwort, keine KI nötig",
          d: "Frag Jarvis, was ihn von anderen Assistenten unterscheidet. Er erzählt, was er für dich kann und andere nicht: dich und deinen Tag kennen, sich von selbst melden, mit dir planen.",
          s: ["Was unterscheidet dich von anderen KI-Assistenten?", "Was kannst du besser als ChatGPT?", "Warum bist du besser?"] },
        { g: "Alltag", i: "🏷️", t: "Günstigster Preis und Preiswächter", h: "listen", n: "Preise kommen von Google Shopping; dafür braucht der Server SERPER_API_KEY.",
          d: "Sag, welche Produkte du haben möchtest. Jarvis sucht das günstigste Angebot mit Shop, liest es vor und zeigt alle Angebote mit Links. Auch Geschenkideen: er nimmt, was er über die Person weiß, und sucht dazu echte Preise. Mit dem Preiswächter beobachtet er einen Preis und meldet sich, wenn er unter deinen Wunschpreis fällt. Im Fenster zeigt der Haken „Auch Gebrauchtes zeigen“ Treffer von Kleinanzeigen und eBay getrennt von den Neupreisen. Zum Eintippen öffnest du im Menü ☰ die „Preissuche“ oder sagst „Öffne die Preissuche“. Unter jedem Produkt (auch in der Wunschliste) gibt es dafür einen Schalter „Preisalarm“ ohne Sprache; optional trägst du einen Wunschpreis ein. Unter jedem Angebot steht ein eigener Preisalarm-Schalter: Er gilt genau für dieses Angebot, nicht für andere Produkte der Suche. Alle deine Preisalarme siehst du oben im Preissuche-Fenster (Menü ☰ „Preissuche“), dort kannst du sie auch löschen.",
          s: ["Such mir den günstigsten Preis für Bosch Akkuschrauber und eine Kaffeemaschine", "Was kostet die PlayStation 5 am günstigsten?", "Such ein paar Geschenke für Liam raus", "Beobachte den Preis von Sony WH-1000XM5 unter 250 Euro", "Welche Preise beobachtest du?", "Beende die Beobachtung von Sony WH-1000XM5"] },
        { g: "Alltag", i: "🎁", t: "Wunschliste mit Preisen", h: "listen", n: "Preise kommen von Google Shopping; dafür braucht der Server den Eintrag SERPER_API_KEY",
          d: "Fotografiere einen Wunschzettel oder sag die Wünsche an. Jarvis legt eine Liste an, sucht zu jedem Punkt Preise (Amazon, Otto, MediaMarkt und andere) und zeigt das günstigste Angebot mit Shop. Abhaken geht im Fenster. Den Suchbegriff kannst du dort ändern.",
          s: ["Wunschzettel fotografieren", "Merk dir das als Wunschliste von Liam", "Neue Wunschliste für Liam: McQueen, T-Rex, Hot Wheels Bahn", "Suche Preise für die Wunschliste von Liam", "Zeig die Wunschliste von Liam"] },
        { g: "Alltag", i: "🛡️", t: "Löschen nur mit Rückfrage", n: "Gilt für Termine, Erinnerungen und Gedächtnis",
          d: "Bevor Jarvis etwas Wichtiges löscht, fragt er „Soll ich … wirklich löschen?“. Mit Ja löscht er, mit Nein bleibt alles, wie es ist.",
          s: ["Ja", "Nein", "Lösche alle Erinnerungen"] },
        { g: "Alltag", i: "🧠", t: "Gedächtnis: wo liegt was?", h: "gedaechtnis",
          d: "Jarvis merkt sich Dinge und Orte, zum Beispiel wo der Ersatzschlüssel hängt. Was du nur kurz ablegst (Kurzzeitgedächtnis), weiß er auch.",
          s: ["Merk dir, der Ersatzschlüssel hängt am Klemmbrett", "Wo ist mein Ersatzschlüssel?", "Ich lege meinen Schlüssel unters Kopfkissen", "Wann habe ich den Schlüssel abgelegt?"] },
        { g: "Alltag", i: "🗄️", t: "Langzeitgedächtnis und Plaudern", n: "Hier landen Erlebnisse, Pläne, Vorlieben und Fristen",
          d: "Alles, was du Jarvis erzählst, kann er sich dauerhaft merken und später wiederfinden. Du kannst nachsehen, was er über dich weiß. Im Plaudermodus unterhaltet ihr euch einfach.",
          s: ["Was weißt du über mich?", "Zeig das Langzeitgedächtnis", "Lass uns plaudern", "Plaudermodus aus"] },
        { g: "Alltag", i: "🌅", t: "Tagesüberblick und „Was steht an?“", h: "ueberblick",
          d: "Jarvis zeigt deinen Tag als Kacheln: Termine, Erinnerungen, Aufgaben, Einkaufsliste. Am Morgen kommt das beim ersten Öffnen von selbst (einstellbar). Mit „Was steht heute an?“ oder „Was steht morgen an?“ (auch übermorgen oder „am Dienstag“) liest er alles vor, mit deiner Schicht und deren Beginn. Beim Öffnen der App begrüßt er dich kurz und sagt, was wichtig ist, und redet bei offener App öfter von selbst.",
          s: ["Tagesüberblick", "Zeig mir meinen Tag", "Was wollte ich heute noch machen?", "Zeig mir den Wochenüberblick"] },
        { g: "Alltag", i: "📱", t: "Zweite Startseite", h: "seite2",
          d: "Wische auf der Startseite nach links, dann siehst du Seite 2 mit großen Knöpfen: Foto, Bild aus Dateien, Briefing, Überblick, Einkauf, Preissuche, Karte und Parkplatz. Nach rechts wischen oder auf die zwei Punkte unten tippen bringt dich zurück zu Seite 1.",
          s: ["Nach links wischen", "Knopf antippen", "Nach rechts wischen"] },
        { g: "Alltag", i: "⌨", t: "Eintippen statt sprechen", h: "tippen",
          d: "Versteht Jarvis dich beim Sprechen nicht, tippst du den Satz einfach ein: Auf der Startseite unten rechts das Tastatur-Symbol antippen, Satz schreiben, Senden. Jarvis behandelt ihn genau wie einen gesprochenen Satz und antwortet auch so.",
          s: ["Tastatur-Symbol antippen", "Satz eintippen", "Senden antippen"] },
        { g: "Alltag", i: "🧩", t: "Startseite anpassen", h: "startseite",
          d: "Die Felder der Startseite stellst du selbst ein: Im Menü ☰ findest du „Startseite anpassen“. Dort schaltest du jedes Feld an oder aus und verschiebst es mit den Pfeilen nach oben oder unten. „Zurücksetzen“ stellt alles wie vorher. Alles per Tippen, es bleibt nur auf deinem Handy.",
          s: ["Menü ☰ öffnen", "Startseite anpassen antippen", "Feld ausschalten oder verschieben"] },
        { g: "Alltag", i: "☀️", t: "Briefing am Morgen", h: "briefing",
          d: "Jarvis erzählt dir morgens von selbst, was wichtig ist: Wetter, Fahrzeit, Termine, Mitnehmen-Liste. In der Frühschicht ab 3:30 Uhr, in der Spätschicht ab 12 Uhr. Er sagt nur das Wichtigste, den ganzen Text siehst du als Karte; mit „Ausführliches Briefing“ liest er alles vor. Eigene Wünsche kannst du dazusagen.",
          s: ["Starte mein Briefing", "Ausführliches Briefing", "Wann kommt mein Briefing?", "Briefing in der Spätschicht um 11 Uhr", "Erwähne im Briefing immer, wo mein Ladekabel ist"] },
        { g: "Alltag", i: "📋", t: "Protokolle", h: "briefing",
          d: "Ein Protokoll ist eine Abfolge von Dingen, die Jarvis auf Zuruf erledigt oder vorliest, zum Beispiel für den Feierabend.",
          s: ["Starte Protokoll Feierabend", "Lege ein Protokoll Morgen an: Wetter und Fahrzeit zur Arbeit"] },
        { g: "Alltag", i: "🎒", t: "Mitnehmen-Liste", h: "mitnehmen",
          d: "Die Sachen, die du zur Arbeit nicht vergessen darfst. Jarvis sagt sie dir 10 Minuten vor der Abfahrt vor.",
          s: ["Was muss ich mitnehmen?", "Pack Handy auf meine Mitnehmen-Liste", "Mitnehmen-Liste zurücksetzen"] },
        { g: "Alltag", i: "👁️", t: "Aufträge: „Sag Bescheid, wenn …“", h: "auftraege",
          d: "Jarvis beobachtet für dich Diesel, Regen und Temperatur und meldet sich, wenn es so weit ist. Höchstens fünf Aufträge gleichzeitig, nachts ist Ruhe.",
          s: ["Sag mir Bescheid, wenn der Diesel unter 1,65 fällt", "Sag Bescheid, wenn es aufhört zu regnen", "Meld dich, wenn es unter 0 Grad geht", "Welche Aufträge hast du?"] },
        { g: "Alltag", i: "🔁", t: "Routinen", h: "routinen",
          d: "Jarvis lernt still mit, was du wann tust (nur Art und Uhrzeit, nie den Inhalt) und fragt höchstens einmal am Tag, ob er eine Routine merken soll.",
          s: ["Welche Routinen kennst du?", "Vergiss die Routine Einkauf", "Routinen aus"] },
        { g: "Alltag", i: "💶", t: "Rechnungen und Fristen", n: "Fristen erkennt Jarvis auch in deinen E-Mails",
          d: "Offene Rechnungen und Fristen hat Jarvis im Blick und erinnert dich vorher. Du sagst ihm, wenn etwas erledigt ist.",
          s: ["Welche Rechnungen sind offen?", "Die Rechnung von Vodafone ist bezahlt", "Welche Fristen habe ich?", "Fristen-Prüfung aus"] },
        { g: "Alltag", i: "🎂", t: "Zuvorkommend: Geburtstage und Frost", h: "push",
          d: "Jarvis denkt mit: Er fragt fünf Tage vor einem Geburtstag nach dem Geschenk und macht am Geburtstag einen Glückwunsch-Entwurf für WhatsApp. Bei Frost am nächsten Morgen zieht er die Abfahrt vor. Rückgängig geht immer.",
          s: ["Mach rückgängig", "Teste den Glückwunsch für Alyssa", "Frag nicht mehr nach Geburtstagen"] },
        { g: "Alltag", i: "🤔", t: "Mitdenken und Kennenlernen", h: "charakter",
          d: "Jarvis macht am Ende einer Antwort höchstens einen kurzen Vorschlag. Mit kleinen Fragen lernt er dich besser kennen. Beides kannst du abstellen.",
          s: ["Stell mir eine Frage", "Kennenlern-Fragen aus", "KI-Mitdenken aus", "Melde dich nicht mehr von selbst"] },
        { g: "Alltag", i: "📬", t: "Meldungen nachlesen", h: "push",
          d: "Hast du eine Ansage verpasst? Jarvis liest sie dir nach: Wochenüberblick, Abfahrtshinweis, Staumeldung.",
          s: ["Meine Meldungen", "Was hast du mir gesagt?", "Was habe ich verpasst?"] },

        /* ---------- Unterwegs ---------- */
        { g: "Unterwegs", i: "🗺️", t: "Fahrten und Verkehr", h: "fahrten",
          d: "Jarvis rechnet Fahrzeit mit aktuellem Verkehr und sagt, wann du losmusst (mit 10 Minuten Puffer). Etwa eine Stunde vor einem Termin mit Ort bereitet er die Fahrt von selbst vor.",
          s: ["Wann muss ich zum Zahnarzt losfahren?", "Ist Stau auf meiner Strecke zur Arbeit?", "Bring mich nach Hause", "Bereite meinen nächsten Termin vor", "Gibt es einen McDonald’s auf dem Weg?"] },
        { g: "Unterwegs", i: "🧳", t: "Fahrt-Check und Foto vom Ziel", n: "Fahrt-Check aus / an",
          d: "Nach einer Routenfrage hängt Jarvis einen kurzen Tipp an: Wetter bei der Ankunft, günstige Tankstelle, passende Einträge von Einkaufsliste und Aufgaben, fällige Rechnungen. Am Ziel zeigt er ein Foto (Street View).",
          s: ["Fahrt-Check aus", "Fahrt-Check an"] },
        { g: "Unterwegs", i: "🏠", t: "Arbeitsweg und Heimweg", h: "push",
          d: "Kurz nach Schichtende sagt Jarvis, wie lange der Heimweg dauert und ob Stau ist, und nennt eine günstige Tankstelle auf dem Weg. Fährst du immer über denselben Ort, merkt er sich einen Zwischenpunkt.",
          s: ["Wie ist der Heimweg?", "Such den günstigsten Diesel auf dem Heimweg", "Ich fahre zur Arbeit über Lanken", "Arbeitsweg ohne Zwischenpunkt"] },
        { g: "Unterwegs", i: "🧩", t: "Startseite „Übersicht“", h: "charakter",
          d: "Die Startseite „Übersicht“ zeigt oben links die kleine Kugel (grüner Glow, wenn Jarvis spricht; Antippen der Kugel startet das Sprechen, einen eigenen Mikro-Knopf gibt es nicht mehr), Begrüßung, Schicht und Uhr. Darunter: Arbeitsweg mit Stau, Regen, Diesel, Schicht, die nächsten Termine mit Fahrzeit, Erinnerungen, Einkauf und das Wetter von morgen. Antippen öffnet die Details. Mit „Kacheln an“ kommen die alten Kacheln und „Blick auf einen Blick“ die nächste Schicht, die Abfahrt, den Wecker und den ersten Terminkonflikt. Antippen öffnet die Details.",
          s: ["Zeig mir den Wochenüberblick", "Kacheln an", "Kacheln aus"] },
        { g: "Unterwegs", i: "📡", t: "Lagebild und Radar", n: "Zeigt Route, Verkehr und Wetter in einer Karte",
          d: "Das Lagebild ist die große Karte zu deiner Strecke. Bei einer Route kannst du Restaurants, Tankstellen, Baumärkte, Supermärkte und Cafés entlang der Strecke suchen und mit Zwischenstopp losfahren.",
          s: ["Zeig das Lagebild", "Zeig mir die Karte", "Schließ die Karte"] },
        { g: "Unterwegs", i: "🚆", t: "Bahn und Bus", h: "bahn",
          d: "Abfahrten wie auf einer Abfahrtstafel: Zeit, Linie, Gleis oder Steig, Countdown und Verspätung in Orange. Auch ganze Verbindungen.",
          s: ["Wann fährt der nächste Zug nach Hamburg?", "Such mir die Bahnverbindung von Schwarzenbek nach Hamburg raus", "Wann fährt der nächste Bus Richtung Innenstadt?"] },
        { g: "Unterwegs", i: "📍", t: "Orte in der Nähe", h: "orte",
          d: "Der nächste Supermarkt, Apotheke, Geldautomat, Bäcker, Baumarkt, Werkstatt, Ladestation und vieles mehr, mit Entfernung und Öffnungszeit. Ein Tipp auf die Karte startet die Route.",
          s: ["Wo ist der nächste Penny?", "Wo ist die nächste Apotheke?", "Wo kann ich Geld abheben?", "Navigiere mich zum nächsten Rossmann"] },
        { g: "Unterwegs", i: "🗓️", t: "Freie Zeit für Besuch oder Erledigung finden", h: "termine", n: "Fahrzeit rechnet er nur mit, wenn der Kontakt eine Adresse hat",
          d: "Sag, was du vorhast, ohne Tag und Uhrzeit. Jarvis sucht freie Zeiten in den nächsten 14 Tagen (Kalender, Schicht, Urlaub, Wochenende zuerst), rechnet die Fahrzeit hin und zurück mit und fragt, welche er eintragen soll. Antworte mit eins, zwei, drei, andere oder nein.",
          s: ["Ich müsste mal zu meiner Mutter fahren", "Ich muss demnächst zum Friseur", "Wann habe ich Zeit, Anna zu besuchen?", "eins", "andere"] },
        { g: "Unterwegs", i: "🎡", t: "Ausflug planen", h: "orte", n: "Entfernung und Fahrzeit sind geschätzt, Eintrittspreise kennt Jarvis nicht",
          d: "Sag, dass ihr etwas unternehmen wollt. Jarvis fragt, wer mitkommt, schaut in den Kalender und aufs Wetter (Regen: drinnen, trocken: draußen) und zeigt drei Ziele im Umkreis als Karten mit Route. Sagst du „Da waren wir schon“, merkt er sich den Ort und schlägt ihn so schnell nicht wieder vor.",
          s: ["Was können wir Samstag mit den Kindern unternehmen?", "Hast du eine Idee fürs Wochenende?", "Da waren wir schon", "Wir waren gestern im Tierpark Hagenbeck, das war super", "Wo waren wir schon?"] },
        { g: "Unterwegs", i: "🥢", t: "Restaurant in einem bestimmten Ort", h: "tanken",
          d: "Nenne den Ort im Satz, dann sucht Jarvis dort statt rund um dich: mit Art des Essens, Adresse, Entfernung von dir und Route per Tipp. Ohne Ortsnamen sucht er erst 2 km, dann 5 km und zuletzt bis 15 km um dich.",
          s: ["Gibt es in Reinbek ein mongolisches Restaurant?", "Gibt es in Hamburg eine Pizzeria?", "Ich habe Lust auf Pizza, gibt es was in der Nähe?"] },
        { g: "Unterwegs", i: "🍽️", t: "Restaurants und Erlebnisse merken", h: "orte",
          d: "Erzähl nach dem Essen oder Ausflug, wie es war. Jarvis merkt sich Ort, Datum, wer dabei war und was gut oder schlecht war (Essen, Parkplatz, Preis). Später fragst du zum Beispiel, wo ihr essen wart und wo jemand das Essen gut fand.",
          s: ["Wir waren im Restaurant Zur Linde essen, das Essen war gut, der Parkplatz schlecht, Simone fand es super", "Wo waren wir essen?", "Wo waren wir essen, wo Simone das Essen so gut fand?", "Wie war es im Restaurant Zur Linde?"] },
        { g: "Unterwegs", i: "📌", t: "Adresse in den Kontakten speichern", n: "Gilt für den zuletzt gefundenen Ort oder das letzte Ziel (30 Minuten)",
          d: "Hast du einen Ort gesucht oder ein Ziel genannt, sag danach, dass Jarvis die Adresse speichern soll. Sie landet in deinen Kontakten, und später reicht „Ich möchte zu Edeka fahren“. Nichts wird doppelt angelegt.",
          s: ["Such mir einen Edeka in Bergedorf", "Kannst du bitte die Adresse speichern?", "Speichere die Adresse in meinen Kontakten"] },
        { g: "Unterwegs", i: "⛽", t: "Tanken und Essen", h: "tanken",
          d: "Günstige Tankstellen in der Nähe oder auf deinem Weg, und Restaurants, wenn du Hunger hast.",
          s: ["Wo tanke ich günstig auf meinem Weg zur Arbeit?", "Was kostet Diesel in der Nähe?", "Ich habe Lust auf Pizza, gibt es was in der Nähe?"] },
        { g: "Unterwegs", i: "🅿️", t: "Parkplatz merken", h: "auto",
          d: "Jarvis merkt sich, wo du geparkt hast, und bringt dich zurück. In der Handy-App geht das auch automatisch, sobald sich das Handy vom Auto trennt (nicht, wenn du zu Hause bist).",
          s: ["Merk dir, wo ich geparkt habe", "Wo ist mein Auto?", "Bring mich zu meinem Auto"] },
        { g: "Unterwegs", i: "🚗", t: "Autoansicht", h: "auto",
          d: "Ein Vollbild fürs Auto mit Heimweg-Zeit, Tanktipp und vier großen Knöpfen (Nach Hause, Anrufen, Tanken, Parkplatz). Auf breiten Displays mit Karte. Sie öffnet sich beim Einsteigen von selbst (Handy-App, Auto per Bluetooth gewählt) und schließt sich beim Aussteigen.",
          s: ["Autoansicht", "Autoansicht mit Kopf", "Autoansicht ohne Kopf", "Autoansicht beenden"] },
        { g: "Unterwegs", i: "🖥️", t: "Anzeige am Auto-Display", n: "Die Größe gilt nur in der Autoansicht",
          d: "Passt die Ansicht nicht auf den Bildschirm im Auto? Du kannst die Größe der Autoansicht, die Anordnung (breit oder normal) und einen sicheren Rand einstellen, falls das Display Ecken abschneidet. Auch der Mund des Kopfes lässt sich zum Ton verschieben.",
          s: ["Bildschirmgröße", "Anzeige kleiner", "Anzeige größer", "Anzeige breit", "Rand größer", "Mund später"] },
        { g: "Unterwegs", i: "📲", t: "WhatsApp im Auto vorlesen", n: "Nur in der Handy-App, nur in der Autoansicht",
          d: "Schreibt dir ein ausgewählter Kontakt, liest Jarvis es vor und fragt „Willst du antworten?“. Du sprichst die Antwort, er schickt sie ab und zeigt, was gesendet wurde.",
          s: ["Ja, bin gleich da", "Schreib ihm: Komme in 10 Minuten", "Fahrmodus aus", "Vorlesen aus"] },
        { g: "Unterwegs", i: "⏰", t: "Wecker ausschalten", h: "auto", n: "Nur in der Handy-App",
          d: "Jarvis bittet die Uhr-App, den nächsten Wecker zu löschen, und prüft danach, ob er wirklich weg ist. Weckern anderer Apps kann er nichts tun. Einen Wecker stellen geht auch.",
          s: ["Wecker aus", "Lösche den Wecker", "Stell mir einen Wecker um 3:30"] },

        /* ---------- Kommunikation ---------- */
        { g: "Kommunikation", i: "📞", t: "Anrufen und WhatsApp", h: "kontakte",
          d: "Jarvis wählt auf Zuruf. In der Handy-App ruft das Handy selbst an (beim ersten Mal fragt Android nach der Erlaubnis). WhatsApp bereitet er vor, du tippst auf die Karte zum Senden.",
          s: ["Ruf Mama an", "Schick Schatz eine WhatsApp: Bin gleich da"] },
        { g: "Kommunikation", i: "📇", t: "Kontakte", n: "Einstellungen > Kontakte",
          d: "Speichere Namen mit Adresse und Telefonnummer. Mit der Adresse findet Jarvis die Fahrzeit („Ich möchte zu Alyssa fahren“), mit der Nummer kann er anrufen oder WhatsApp vorbereiten. Mama und Mutter gelten gleich.",
          s: ["Ich möchte heute zu Alyssa fahren", "Ruf Schatz an", "Besuch bei Mama um 15 Uhr"] },
        { g: "Kommunikation", i: "😴", t: "Schlafmodus", h: "auto", n: "Nur in der Handy-App, braucht Benachrichtigungszugriff",
          d: "Wenn du schlafen gehst, antwortet Jarvis erlaubten Kontakten auf WhatsApp, kurz und vorsichtig, höchstens dreimal pro Person. Bei Notfallwörtern weckt er dich laut.",
          s: ["Ich gehe schlafen", "Ich bin wach"] },
        { g: "Kommunikation", i: "🤝", t: "Vertretung", h: "auto", n: "Nur in der Handy-App",
          d: "Antwortest du einem erlaubten Kontakt 10 Minuten lang nicht, springt Jarvis ein: Er beantwortet, was er sicher weiß, und leitet alles Persönliche an dich weiter. Entwürfe musst du mit Senden bestätigen.",
          s: ["Vertretung an", "Vertretung nach 15 Minuten", "Vertretung aus", "Was habe ich verpasst?"] },
        { g: "Kommunikation", i: "🗂️", t: "Postfach nach Wichtigkeit", h: "mail",
          d: "Statt nur zu sagen, wie viele Mails du hast, sortiert Jarvis das Postfach: Er nennt, was wichtig ist (Rechnungen, Fristen, Termine, Mails mit Frage), legt für Antworten Entwürfe in Gmail an und sagt, wie viel Werbung er überspringt. Verschickt wird nie etwas.",
          s: ["Habe ich neue E-Mails?", "Was ist im Postfach wichtig?", "Gibt es wichtige Mails?"] },
        { g: "Kommunikation", i: "📧", t: "E-Mails lesen", h: "mail",
          d: "Jarvis liest dir neue E-Mails vor, auf Wunsch nur die wichtigen ohne Werbung. Er kann Antworten entwerfen und Mails in den Papierkorb legen (immer erst nach deinem Ja).",
          s: ["Habe ich neue E-Mails?", "Nur wichtige E-Mails, keine Werbung", "Lies mir die erste vor", "Schreib eine Antwort darauf"] },
        { g: "Kommunikation", i: "📨", t: "Mail-Meldungen", n: "Mail Push muss einmal eingerichtet werden",
          d: "Jarvis meldet sich von selbst, wenn wichtige Mails kommen, auch bei geschlossener App. Du kannst die Meldungen ein- und ausschalten.",
          s: ["E-Mail Push einrichten", "E-Mail-Meldung aus", "E-Mail-Meldung an", "Mail Push Status"] },
        { g: "Kommunikation", i: "🏦", t: "Konto-Meldung", h: "konto",
          d: "Schickt deine Bank eine Mail zu einer Kontobewegung, sagt Jarvis es an: Eingang, Abbuchung, Kontoauszug. Nur bei offener App.",
          s: ["Prüf mal mein Konto", "Meine Bank ist die Sparkasse Lauenburg", "Welche Banken überwachst du?", "Konto-Meldung aus"] },
        { g: "Kommunikation", i: "📝", t: "Antrag ausfüllen (Jobcenter)", h: "antrag",
          d: "Wähle die PDF des Antrags (zum Beispiel den Jobcenter-Hauptantrag von arbeitsagentur.de). Hat sie Eingabefelder, liest Jarvis sie direkt aus der Datei, füllt deine Stammdaten vor und fragt Feld für Feld. Am Ende erzeugt er das ausgefüllte PDF und prüft jede Angabe in der gespeicherten Datei. Datum, PLZ, IBAN und Steuer-ID prüft er selbst auf Fehler. Bei Fotos oder PDFs ohne Felder gibt es eine Ausfüllhilfe zum Abtippen. Verstehst du eine Frage nicht, tippe auf „Erklär mir das“ oder sag es beim Sprach-Ausfüllen: Jarvis erklärt sie in einfachen Worten, ohne für dich zu entscheiden. Unterschrift und Datum der Unterschrift bleiben leer. Er schickt nichts ab. Prüfe das fertige PDF Seite für Seite.",
          s: ["Hilf mir beim Jobcenter-Antrag", "Antrag ausfüllen", "Formular ausfüllen"] },
        { g: "Kommunikation", i: "🏛️", t: "Behördenbriefe", h: "behoerdenbrief",
          d: "Jarvis schreibt dir Widerspruch, Beschwerde, Antrag oder einen freien Brief. Fotografiere vorher den Bescheid, dann übernimmt er Absender, Aktenzeichen und Datum und fragt nur, was fehlt. Der Brief steht im Fenster: ändern, als PDF speichern, drucken, kopieren oder als Gmail-Entwurf anlegen. Bei einem Widerspruch nennt er die Frist. Verschickt wird nie etwas, und es ist keine Rechtsberatung.",
          s: ["Schreib einen Widerspruch", "Beschwerde an die Hausverwaltung schreiben", "Schreib einen Antrag auf Ratenzahlung", "Schreib einen Brief an das Finanzamt"] },
        { g: "Kommunikation", i: "📒", t: "Haushaltsbuch", h: "haushalt",
          d: "Jarvis merkt sich Eingänge und Ausgaben aus den Mails deiner Bank und sagt dir, wie dein Monat war, welche Abos regelmäßig abgehen und wo du sparen kannst. Er sieht dein Konto nicht und kann nichts überweisen. Es zählt nur, was die Bank per Mail meldet.",
          s: ["Haushaltsbuch einlesen", "Wie war mein Monat?", "Welche Abos habe ich?", "Wo kann ich sparen?"] },
        { g: "Kommunikation", i: "📦", t: "Pakete verfolgen (DHL)", n: "Zustellung wird angesagt, abgelieferte Pakete verschwinden nach 30 Tagen",
          d: "Gib Jarvis eine DHL-Paketnummer, dann schaut er alle 30 Minuten nach und sagt dir Bescheid, wenn das Paket unterwegs ist oder zugestellt wurde.",
          s: ["Paket 00340434161094042557", "Wo ist mein Paket?", "Meine Pakete", "Vergiss das Paket"] },

        /* ---------- Wissen ---------- */
        { g: "Wissen", i: "🌦️", t: "Wetter und Unwetter", h: "wetter",
          d: "Das Wetter für jeden Ort, mit Wetterkarte und Regenradar. Bei amtlichen Unwetterwarnungen meldet sich Jarvis von selbst. Passend dazu fällt im Hintergrund Regen, Schnee oder Nebel (abschaltbar).",
          s: ["Wie wird das Wetter morgen?", "Brauche ich einen Regenschirm?", "Zeig das Regenradar", "Gibt es Unwetterwarnungen?", "Wetter-Effekt aus"] },
        { g: "Wissen", i: "🧊", t: "Glätte-Alarm", n: "Rotes Warnfenster mit Ton",
          d: "Droht Glätte oder Gefahr auf deiner Strecke, zeigt Jarvis ein rotes Warnfenster. Du kannst es zum Ansehen testen.",
          s: ["Teste den Alarm", "Alarm aus"] },
        { g: "Wissen", i: "🌙", t: "Sonne und Mond", h: "sonnemond",
          d: "Wann Sonne auf- und untergeht, wie lange es hell ist, wann Voll- und Neumond ist, mit Mondbild.",
          s: ["Wann geht die Sonne unter?", "Wie lange ist es noch hell?", "Wann ist Vollmond?"] },
        { g: "Wissen", i: "🎉", t: "Feiertage und Brückentage", h: "feiertage",
          d: "Gerechnet für dein Bundesland: nächster Feiertag, Brückentage, Ostern, Muttertag. Das Bundesland stellst du per Sprache ein.",
          s: ["Wann ist der nächste Feiertag?", "Welche Brückentage gibt es?", "Wann ist Ostern?", "Mein Bundesland ist Schleswig-Holstein"] },
        { g: "Wissen", i: "🏖️", t: "Schulferien", h: "ferien",
          d: "Ferientermine für jedes Bundesland, auch mehrere auf einmal, und ein Ferienkalender.",
          s: ["Wann sind die Herbstferien in Hamburg?", "Wann sind die nächsten Ferien?", "Zeig mir den Ferienkalender"] },
        { g: "Wissen", i: "🕒", t: "Uhrzeit in anderen Ländern", h: "weltzeit",
          d: "Wie spät es woanders ist, Zeitunterschied und eine Weltuhr mit mehreren Städten, die du selbst zusammenstellst.",
          s: ["Wie spät ist es in Istanbul?", "Öffne die Weltuhr", "Füge Bukarest zur Weltuhr hinzu", "Zeitunterschied zu Japan"] },
        { g: "Wissen", i: "💱", t: "Währung umrechnen", h: "waehrung",
          d: "Aktuelle Kurse für Euro, Dollar, Lira, Pfund und andere.",
          s: ["Was sind 100 Euro in Lira?", "Wie viel sind 50 Dollar in Euro?", "Wie ist der Kurs von Euro zu Pfund?"] },
        { g: "Wissen", i: "🌍", t: "Nachrichten, Welt und Sport", h: "welt",
          d: "Nachrichten von heute, lokale Nachrichten für Schwarzenbek und Hamburg (kommen morgens auch von selbst), Live-Kameras, die ISS und was gerade in einem Land los ist. Dazu Bundesliga mit Tabelle, Spieltag und HSV.",
          s: ["Zeig mir die Nachrichten von heute", "Wo ist die ISS?", "Zeig mir New York live", "Wie hat der HSV gespielt?", "Öffne die Bundesliga-Tabelle"] },
        { g: "Wissen", i: "🌐", t: "Weltkugel und Anflug", n: "Einstellung: „Anflug aus“ / „Anflug an“",
          d: "Die Kugel zeigt die Welt. Fragst du nach einer Stadt oder Region, zoomt sie heran und blendet in die Neon-Karte über. „Zurück zur Kugel“ bringt dich wieder nach oben.",
          s: ["Zeig mir, was in Hamburg los ist", "Was ist gerade in Spanien los?", "Zurück zur Kugel", "Anflug aus"] },
        { g: "Wissen", i: "🎬", t: "Filmtipps und Kino", h: "filme",
          d: "Filmtipps nach Genre, was im Kino läuft und auf welchem Streamingdienst ein Film oder eine Serie zu sehen ist.",
          s: ["Gib mir einen guten Horrorfilm", "Was soll ich heute schauen?", "Was läuft im Kino?", "Wo kann ich Dune streamen?"] },
        { g: "Wissen", i: "🌐", t: "Aus dem Internet", h: "internet",
          d: "Fernsehprogramm, Öffnungszeiten und alles, was Jarvis im Netz nachschlagen kann.",
          s: ["Was läuft heute Abend im Fernsehen?", "Wann hat der Baumarkt heute auf?"] },
        { g: "Wissen", i: "🗣️", t: "Dolmetscher", h: "dolmetscher",
          d: "Jarvis übersetzt zwischen dir und einem Gegenüber, hin und zurück: Türkisch, Englisch, Rumänisch, Polnisch, Russisch.",
          s: ["Dolmetscher Türkisch", "Übersetze Guten Tag ins Englische", "Dolmetscher beenden"] },

        /* ---------- Foto und Papier ---------- */
        { g: "Foto und Papier", i: "📷", t: "Foto auswerten", h: "foto",
          d: "Tippe auf 📷, mach ein Foto und sag, was Jarvis damit tun soll: übersetzen, auf die Einkaufsliste setzen, in den Kalender eintragen, eine Adresse anfahren, abtippen. Plakate, Briefe und Schilder erkennt er auch von selbst.",
          s: ["Übersetze dieses Schild", "Erkläre mir diese Warnleuchte", "Trag den Termin von diesem Plakat ein", "Darf ich hier parken?", "Tippe das Foto ab"] },
        { g: "Foto und Papier", i: "💬", t: "Foto per WhatsApp verschicken",
          d: "Nach jedem Foto gibt es eine Karte „Per WhatsApp senden“. In der Handy-App suchst du in WhatsApp die Person aus.",
          s: ["Schick das Foto per WhatsApp"] },
        { g: "Foto und Papier", i: "✉️", t: "Briefe und Rechnungen fotografieren", h: "brief",
          d: "Foto vom Brief, dann nennt Jarvis Absender, Betrag und Frist und fragt, ob er dich erinnern soll. Bei Preiserhöhungen weist er auf das Sonderkündigungsrecht hin.",
          s: ["Brief fotografieren", "Werte den Brief aus", "Ich habe Post bekommen"] },
        { g: "Foto und Papier", i: "🍳", t: "Rezepte aus Zutaten", h: "foto",
          d: "Fotografiere, was du zu Hause hast, und Jarvis schlägt vor, was du damit kochen kannst.",
          s: ["Was kann ich damit kochen?"] },
        { g: "Foto und Papier", i: "🌴", t: "Urlaubszettel fotografieren", h: "foto",
          d: "Fotografiere deinen Jahres-Urlaubszettel. Jarvis liest alle Zeiträume, zählt die Tage (verplant, nötig, Anspruch) und markiert Stellen, die nicht passen. Nach deinem Tipp auf Eintragen stehen alle Urlaube in Jarvis (still beim Arbeitsweg) und im Google Kalender.",
          s: ["Urlaubsplan fotografieren", "Wie viele Urlaubstage habe ich verplant?", "Zeig meinen Urlaubsplan", "Urlaubsplan löschen"] },
        { g: "Foto und Papier", i: "🏫", t: "Stundenplan und Essensplan", h: "foto",
          d: "Fotografiere den Stundenplan eines Kindes oder den Wochenplan der Kantine. Jarvis merkt ihn sich und sagt dir, was ansteht oder was es morgen gibt.",
          s: ["Merk dir diesen Stundenplan", "Was gibt es morgen?", "Lies den Essensplan vor"] },
        { g: "Foto und Papier", i: "👧", t: "Aussehen merken (Personen)", h: "person",
          d: "Jarvis beschreibt nur das äußere Aussehen und fragt vorher, ob er es merken darf. Das Foto selbst wird nicht gespeichert, und ein Gesicht erkennt er später nicht wieder.",
          s: ["Das ist meine Tochter Julia", "Merk dir, wie Julia aussieht", "Vergiss, wie Julia aussieht"] },
        { g: "Foto und Papier", i: "📄", t: "Kündigung schreiben", h: "kuendigung",
          d: "Jarvis fragt Anbieter, Vertrag, Nummer und Zeitpunkt und schreibt dir die Kündigung. Du kannst sie ändern, als PDF speichern, drucken oder kopieren.",
          s: ["Schreib mir eine Kündigung", "Zeig die letzte Kündigung", "Zeig meine Kündigungen"] },

        /* ---------- Musik ---------- */
        { g: "Musik", i: "🎵", t: "Spotify: Musik abspielen", n: "Einmal „Spotify verbinden“, braucht Spotify Premium",
          d: "Jarvis spielt Lieder, Alben, Künstler und deine Playlists. Das Wort „Spotify“ darf mitten im Satz stehen. Nach dem Start kommt Jarvis wieder nach vorn, und ein kleiner Player erscheint unter dem Kopf.",
          s: ["Spotify verbinden", "Spiel Atemlos von Helene Fischer auf Spotify", "Spiel meine Playlist Autofahrt", "Pause", "Nächstes Lied", "Was läuft?", "Lauter", "Musik aus"] },
        { g: "Musik", i: "📚", t: "Spotify-Fenster und Bibliothek", n: "Für die Bibliothek einmal neu „Spotify verbinden“",
          d: "Ein Fenster mit deinen Playlists, gespeicherten Alben (Cover-Raster) und Lieblingssongs. Suchen kannst du per Sprache (🎤) oder Tippen, nach Liedern, Alben, Künstlern und Playlists. Ein Tipp auf ▶ startet und schließt das Fenster.",
          s: ["Öffne Spotify", "Zeig mir meine Alben", "Zeig mir meine Lieblingssongs", "Zeig mir Helene Fischer auf Spotify"] },
        { g: "Musik", i: "🚘", t: "Musik im Auto", n: "Fragt höchstens alle 20 Minuten",
          d: "Öffnet sich die Autoansicht, fragt Jarvis „Soll ich Musik spielen?“ und startet auf Ja deine Auto-Playlist. Wischst du Jarvis weg, hört die Musik auf.",
          s: ["Ja", "Meine Auto-Playlist ist Autofahrt", "Musik beim Einsteigen aus", "Auto-Playlist ändern"] },

        /* ---------- Besonderes ---------- */
        { g: "Besonderes", i: "🪄", t: "Figur", h: "figur",
          d: "Bei Wetter, Terminen und Listen wirft eine Figur eine Karte, aus der das Fenster wird. Sie reagiert auch mit Regenschirm, Partyhut und mehr.",
          s: ["Figur-Animationen aus", "Synapsen aus", "Figur Test"] },
        { g: "Besonderes", i: "✨", t: "Effekte, Töne und Flackern", n: "Einstellungen > Effekte, Töne und Flacker-Test",
          d: "Flackert die Anzeige auf deinem Handy, wähle bei Effekte „Ruhig“ oder „Aus“. Nachts wird die Kugel dunkler. Der Flacker-Test schaltet Effekte einzeln ab, damit du siehst, welcher der Übeltäter ist.",
          s: ["Töne leiser", "Töne lauter", "Wetter-Effekt aus"] },
        { g: "Besonderes", i: "🎲", t: "Mini-Spiele", h: "spiele",
          d: "Zum Zeitvertreib: Münze werfen oder Schere, Stein, Papier gegen Jarvis.",
          s: ["Münze werfen", "Schere Stein Papier"] },
        { g: "Besonderes", i: "🔊", t: "Stimme, Töne und Tempo", h: "einstellungen",
          d: "Jarvis spricht mit der Stimme von Fish Audio (einstellbar). Du kannst Tempo, Töne und menschliche Laute regeln und Aussprachen und Schreibweisen beibringen, wenn er etwas falsch sagt oder schreibt.",
          s: ["Sprich langsamer", "Töne aus", "Menschliche Laute aus", "Wenn ich Neu Galina Ring sage, meine ich Neu-Galliner-Ring", "Welche Aussprachen kennst du?"] },
        { g: "Besonderes", i: "🚀", t: "Start und Ansicht", h: "charakter",
          d: "Wie Jarvis beim Öffnen auftritt: mit oder ohne Startanimation, Start-Ansage, Startton, Untertitel und Vibration. Alles per Sprache an- und abschaltbar.",
          s: ["Startanimation aus", "Start-Ansage aus", "Vibration aus", "Untertitel aus", "Jarvis-Ton aus"] },
        { g: "Besonderes", i: "💾", t: "Sicherung und Daten", h: "mitnehmen",
          d: "Arbeitsadresse, Schicht, Urlaub, Korrekturen, Aussprachen, Mitnehmen-Liste und Einstellungen werden automatisch gesichert und kommen nach einer Neuinstallation zurück, sobald du den App-Code einträgst. Passwörter und Anmeldungen werden nicht gesichert.",
          s: ["Status Benachrichtigungen"] },
        { g: "Besonderes", i: "🛠️", t: "Prüfen, wenn etwas klemmt", n: "Für Fehlersuche",
          d: "Funktioniert etwas nicht, kannst du Jarvis sich selbst prüfen lassen. Die Diagnose zeigt, was er gerade tut.",
          s: ["Diagnose an", "Diagnose aus"] },
        { g: "Besonderes", i: "🪟", t: "Fenster schließen", n: "Gilt für Karten, Fenster und Ansichten",
          d: "Mit einem Wort schließt du, was gerade offen ist. Am Auto-Display gibt es unten zusätzlich einen großen Schließen-Knopf.",
          s: ["Schließen", "Zurück", "Danke"] },
        { g: "Besonderes", i: "⚙️", t: "Einstellungen im Überblick", n: "Das ⚙️ oben rechts",
          d: "Persönlich: Profil und Anrede, Charakter und Mitdenken, Kontakte. Tagesablauf: Morgen-Überblick. Anzeige: Größe, Anordnung und Rand fürs Auto-Display. Stimme und Klang: Kopf, Stimme, Töne, Effekte. Technik: Weltkugel, Flacker-Test. Verbindungen: Google, Systemcheck und Diagnose. Ganz oben findest du diese Tour.",
          s: [] },
        { g: "Besonderes", i: "❓", t: "Hilfe jederzeit", h: "einstellungen",
          d: "Zu jedem Thema gibt es Beispielsätze. Und wenn du diese Tour noch einmal sehen willst, sag „Tour“.",
          s: ["Hilfe", "Hilfe Fahrten", "Was kannst du alles?", "Tour"] }
    ];

    var KEY_POS = 'jv_tour_pos';
    var L = null, idx = 0, index = false;

    function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function norm(t) { return String(t || '').toLowerCase().replace(/[.,!?;:"„“”]/g, ' ').replace(/\s+/g, ' ').trim(); }

    function css() {
        if (document.getElementById('al-style')) return;
        var st = document.createElement('style'); st.id = 'al-style';
        st.textContent =
            '#al-layer{position:fixed;inset:0;z-index:8700;background:#04090f;color:#e8f3f9;font-family:"DejaVu Sans Mono",ui-monospace,monospace;display:flex;flex-direction:column;box-sizing:border-box;padding:var(--aa-rand-y,0px) var(--aa-rand-x,0px)}' +
            '#al-layer .al-kopf{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #1b3a4a}#al-layer .al-ti{color:#4cffb0;letter-spacing:.14em;font-size:13px}' +
            '#al-layer .al-x{width:52px;height:44px;border:1px solid rgba(93,209,255,.6);border-radius:10px;background:transparent;color:#49d7ff;font-size:22px}' +
            '#al-layer .al-fort{padding:10px 14px 6px;font-size:12px;color:#8fb4c8}#al-layer .al-bar{height:6px;margin:0 14px;background:#0e2230;border-radius:3px}#al-layer .al-bar i{display:block;height:6px;background:#4cffb0;border-radius:3px}' +
            '#al-layer .al-body{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:18px 14px}#al-layer .al-ic{font-size:54px;line-height:1}#al-layer .al-t{font-size:22px;color:#4cffb0;margin:8px 0 10px}' +
            '#al-layer .al-d{font-size:15px;line-height:1.5;color:#cfe4ef}#al-layer .al-n{margin-top:12px;font-size:12px;color:#ffb347}' +
            '#al-layer .al-lab{margin-top:18px;font-size:11px;letter-spacing:.14em;color:#49d7ff}#al-layer .al-s{margin-top:8px;border:1px solid #1b3a4a;border-radius:10px;padding:11px;background:#071521;font-size:14px;line-height:1.35}' +
            '#al-layer .al-mehr{margin-top:14px;padding:11px 14px;border-radius:10px;border:1px solid #49d7ff;color:#49d7ff;background:transparent;font:700 13px "DejaVu Sans Mono",monospace}' +
            '#al-layer .al-fuss{display:flex;gap:8px;padding:12px 14px calc(12px + env(safe-area-inset-bottom,0px));border-top:1px solid #4cffb0;background:#071521}' +
            '#al-layer .al-fuss button{height:52px;border-radius:10px;border:1px solid #1b3a4a;background:transparent;color:#49d7ff;font:15px "DejaVu Sans Mono",monospace}' +
            '#al-layer .al-zu{flex:1;color:#8fb4c8!important}#al-layer .al-ink{width:52px}#al-layer .al-vor{flex:1.4;border-color:#4cffb0!important;color:#4cffb0!important;background:rgba(76,255,176,.12)!important}#al-layer .al-fuss button:disabled{opacity:.35}' +
            '#al-layer .al-gr{padding:14px 14px 4px;font-size:11px;letter-spacing:.14em;color:#4cffb0}#al-layer .al-z{display:flex;gap:12px;align-items:center;width:100%;text-align:left;padding:11px 14px;border:0;border-bottom:1px solid #0e2230;background:transparent;color:#e8f3f9;font:14px "DejaVu Sans Mono",monospace}#al-layer .al-z.an{background:rgba(76,255,176,.1)}#al-layer .al-z span{font-size:22px;width:30px;flex:none}';
        document.head.appendChild(st);
    }

    function speakText(t) {
        try { if (typeof speak === 'function') speak(t); } catch (e) { }
    }
    function stopSpeak() { try { if (typeof stopSpeech === 'function') stopSpeech(); } catch (e) { } }

    function stepText(s) {
        return s.t + '. ' + s.d + (s.s && s.s.length ? ' Sag zum Beispiel: ' + s.s.slice(0, 2).join('. Oder: ') + '.' : '');
    }

    function render() {
        if (!L) return;
        var s = STEPS[idx];
        var prozent = Math.round((idx + 1) / STEPS.length * 100);
        var h;
        if (index) {
            var letzte = '';
            h = '<div class="al-body" style="padding:0">' + STEPS.map(function (x, k) {
                var kopf = x.g !== letzte ? '<div class="al-gr">' + esc(x.g.toUpperCase()) + '</div>' : ''; letzte = x.g;
                return kopf + '<button type="button" class="al-z' + (k === idx ? ' an' : '') + '" data-k="' + k + '"><span>' + x.i + '</span>' + esc(x.t) + '</button>';
            }).join('') + '</div>';
        } else {
            h = '<div class="al-body"><div class="al-ic">' + s.i + '</div><div class="al-t">' + esc(s.t) + '</div><div class="al-d">' + esc(s.d) + '</div>' +
                (s.n ? '<div class="al-n">ℹ️ ' + esc(s.n) + '</div>' : '') +
                (s.s && s.s.length ? '<div class="al-lab">SAG ZUM BEISPIEL</div>' + s.s.map(function (e) { return '<div class="al-s">„' + esc(e) + '“</div>'; }).join('') : '') +
                (s.h && typeof showHelpTopic === 'function' ? '<button type="button" class="al-mehr" id="al-mehr">Mehr Beispiele zu diesem Thema</button>' : '') + '</div>';
        }
        L.innerHTML = '<div class="al-kopf"><span class="al-ti">' + (index ? 'INHALT' : 'GEFÜHRTE TOUR') + '</span><button type="button" class="al-x" id="al-x" aria-label="Schließen">✕</button></div>' +
            '<div class="al-fort">' + (index ? STEPS.length + ' Schritte' : 'Schritt ' + (idx + 1) + ' von ' + STEPS.length + ' · ' + esc(s.g)) + '</div>' +
            '<div class="al-bar"><i style="width:' + prozent + '%"></i></div>' + h +
            '<div class="al-fuss"><button type="button" class="al-zu" id="al-zu"' + (idx === 0 && !index ? ' disabled' : '') + '>◀ Zurück</button>' +
            '<button type="button" class="al-ink" id="al-ind" aria-label="Inhalt">☰</button><button type="button" class="al-ink" id="al-vl" aria-label="Vorlesen">🔊</button>' +
            '<button type="button" class="al-vor" id="al-vor">' + (idx === STEPS.length - 1 && !index ? 'Fertig ✓' : 'Weiter ▶') + '</button></div>';
        L.querySelector('#al-x').onclick = zu;
        L.querySelector('#al-zu').onclick = function () { index = false; if (idx > 0) idx--; stopSpeak(); render(); };
        L.querySelector('#al-vor').onclick = function () { if (index) { index = false; render(); return; } if (idx >= STEPS.length - 1) { zu(); return; } idx++; stopSpeak(); render(); };
        L.querySelector('#al-ind').onclick = function () { index = !index; render(); if (index) { var a = L.querySelector('.al-z.an'); if (a && a.scrollIntoView) a.scrollIntoView({ block: 'center' }); } };
        L.querySelector('#al-vl').onclick = function () { speakText(stepText(STEPS[idx])); };
        var m = L.querySelector('#al-mehr'); if (m) m.onclick = function () { var k = STEPS[idx].h; zu(); try { showHelpTopic(k); } catch (e) { } };
        L.querySelectorAll('.al-z').forEach(function (b) { b.onclick = function () { idx = parseInt(b.getAttribute('data-k'), 10) || 0; index = false; stopSpeak(); render(); }; });
        var body = L.querySelector('.al-body'); if (body && !index) body.scrollTop = 0;
        try { localStorage.setItem(KEY_POS, String(idx)); } catch (e) { }
    }

    function zu() {
        stopSpeak();
        try { if (L && L.parentNode) L.parentNode.removeChild(L); } catch (e) { }
        L = null; index = false;
    }

    function auf(start) {
        css(); if (L) zu();
        idx = (typeof start === 'number' && start >= 0 && start < STEPS.length) ? start : 0; index = false;
        L = document.createElement('div'); L.id = 'al-layer';
        document.body.appendChild(L);
        var x0 = null;
        L.addEventListener('touchstart', function (e) { x0 = e.touches[0].clientX; }, { passive: true });
        L.addEventListener('touchend', function (e) {
            if (x0 == null || index) return; var d = e.changedTouches[0].clientX - x0; x0 = null;
            if (d < -70 && idx < STEPS.length - 1) { idx++; stopSpeak(); render(); } else if (d > 70 && idx > 0) { idx--; stopSpeak(); render(); }
        }, { passive: true });
        render();
    }

    var RX = /^(?:(?:jarvis|zane|nova)[, ]+)?(?:(?:bitte )?(?:starte |öffne |zeig(?:e)? mir |zeig |mach )?(?:die |den |eine |meine )?(?:geführte |gefuehrte )?(?:tour|rundgang|app[- ]?tour|app[- ]?rundgang)(?: bitte| starten| öffnen| an)?|führ(?:e)? mich durch (?:die |deine )?app|fuehr(?:e)? mich durch (?:die |deine )?app|zeig mir (?:alles|die app) (?:in ruhe|der reihe nach)|geh(?:e)? mit mir durch (?:die |deine )?app)$/;

    function register() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('tour', function (text, next) {
            var t = norm(text);
            if (t.length <= 60 && RX.test(t)) { auf(0); speakText('Los geht’s. Wische oder tippe auf Weiter. Mit dem Lautsprecher lese ich dir jeden Schritt vor.'); return true; }
            return next(text);
        }, 3.9);
        return true;
    }
    var n = 0; (function r() { if (!register() && n++ < 40) setTimeout(r, 500); })();

    function knopf() {
        var b = document.getElementById('tourStart');
        if (b) b.addEventListener('click', function () { auf(0); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', knopf); else knopf();

    window.jvTour = { auf: auf, zu: zu, schritte: STEPS, test: function (t) { return RX.test(norm(t)); } };
})();
