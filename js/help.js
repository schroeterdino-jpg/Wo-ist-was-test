/* ============================================================
   HILFE: "Hilfe", "Was kannst du?", "Was kannst du alles?" -> Zane nennt die Themen, unten erscheinen sie als Karten.
   Ein Tipp auf ein Thema (oder "Hilfe Fahrten") zeigt Beispielsätze dazu. Direkt in der App, ohne KI.
   Die Beispiele entsprechen dem, was Zane wirklich kann (siehe prompt.js); wird etwas Neues eingebaut, hier ergänzen.
   Braucht: voice.js (speak), showActionCards/clearActionCards. Wird von localcommands.js aufgerufen.
   ============================================================ */

const HELP_TOPICS = [
    { key: 'termine', icon: '📅', title: 'Termine & Kalender', words: /termin|kalender|geburtstag/, examples: [
        'Trag morgen um 15 Uhr Zahnarzt in Hamburg ein', 'Wann hat Schatz Geburtstag?', 'Verschieb den Zahnarzt auf Freitag',
        'Trag jeden Montag Mülltonne rausstellen ein', 'Zeig meine Termine der nächsten Woche',
        'Trag Alyssas Geburtstag am 30. Oktober ein (Geburtstage und Jahrestage kommen ganztägig und jedes Jahr, ohne Uhrzeit-Frage)',
        'Übermorgen ist das Konzert um 20 Uhr (Zane fragt danach: Wie viele Stunden vorher soll ich dich per Push erinnern? Antwort zum Beispiel: zwei Stunden, eine halbe Stunde, 30 Minuten, Ja = 3 Stunden, Nein = keine Erinnerung. Sagst du gleich dazu "und erinnere mich zwei Stunden vorher", fragt er nicht)', 'Termin-Erinnerung aus (auch: Termin-Erinnerung an)'] },
    { key: 'erinnerungen', icon: '🔔', title: 'Erinnerungen', words: /erinner/, examples: [
        'Erinnere mich morgen um 8 Uhr an den Arzt', 'Erinnere mich alle zwei Wochen an die Wäsche', 'Wichtige Erinnerung: Paket abholen (er fragt nach, bis du erledigt sagst)',
        'In zehn Minuten nochmal', 'Lösche alle Erinnerungen'] },
    { key: 'listen', icon: '📝', title: 'Listen & Notizen', words: /liste|einkauf|notiz|aufgabe/, examples: [
        'Setz Milch auf die Einkaufsliste', 'Was steht auf meiner Einkaufsliste?', 'Notiere, dass ich noch Kabelschuhe brauche', 'Lösche Milch von der Liste'] },
    { key: 'gedaechtnis', icon: '🧠', title: 'Gedächtnis', words: /gedächtnis|gedaechtnis|merk/, examples: [
        'Merk dir, der Ersatzschlüssel hängt am Klemmbrett', 'Wo ist mein Ersatzschlüssel?', 'Ich lege meinen Schlüssel unters Kopfkissen (Kurzzeitgedächtnis)', 'Wann habe ich den Schlüssel abgelegt?'] },
    { key: 'auto', icon: '🚗', title: 'Auto & Parkplatz', words: /parkplatz|geparkt|\bauto\b/, examples: [
        'Merk dir, wo ich geparkt habe', 'Wo ist mein Auto?', 'Bring mich zu meinem Auto'] },
    { key: 'fahrten', icon: '🗺️', title: 'Fahrten & Verkehr', words: /fahr|verkehr|stau|navig|route|weg\b|karte/, examples: [
        'Ich möchte heute zu Alyssa fahren', 'Wann muss ich zum Zahnarzt losfahren?', 'Ist Stau auf meiner Strecke zur Arbeit?', 'Bring mich nach Hause', 'Zeig mir die Karte', 'Schließ die Karte (schließt die offene Karte, auch die Wetterkarte)',
        'Die Fahrzeit kommt von Google Maps mit aktuellem Verkehr; bei der alten Route rechnet Zane gemeldete Staus (mit Minuten) zusätzlich ein, dazu immer 10 Minuten Puffer: "Abfahrt bis ..."',
        'Zane denkt voraus: Etwa eine Stunde vor einem Termin mit Ort sagt er von selbst "Ich habe mir erlaubt, deinen Termin vorzubereiten" mit Route, Abfahrtszeit, Wetter am Ziel, Tankstelle, passender Liste und fälligen Rechnungen (bei offener App gesprochen, bei geschlossener App als Nachricht aufs Handy mit Fahrzeit, Abfahrt, Staumeldungen, Wetter am Ziel und bei Supermärkten der Einkaufsliste; nachts nicht)',
        'Bereite meinen nächsten Termin vor (sofort) / Vorbereitung aus / Vorbereitung an',
        'Im Lagebild bei einer Route: Knöpfe 🍔 Restaurants, ⛽ Tankstellen, 🔨 Baumärkte, 🛒 Supermärkte, ☕ Cafés suchen entlang der Strecke (mit Umweg und offen/geschlossen, Tippen = Route mit Zwischenstopp); oder sagen: Gibt es einen McDonald\'s auf dem Weg?',
        'Steht im Termin kein Ort, aber ein gespeicherter Kontakt mit Adresse ("Besuch bei Mama", Mama und Mutter gelten gleich), nimmt Zane die Adresse aus den Kontakten; bei Anrufen nicht'] },
    { key: 'bahn', icon: '🚆', title: 'Bahn & Bus', words: /\bbahn|\bzug\b|\bzüge\b|\bbus\b|verbindung/, examples: [
        'Wann fährt der nächste Zug nach Hamburg?', 'Such mir die Bahnverbindung von Schwarzenbek nach Hamburg raus', 'Meine Tochter soll um 16 Uhr hier sein, wann muss sie los?',
        'Wann fährt die nächste Bahn von Bergedorf nach Hamburg? (Zane nennt die nächsten 3 Abfahrten, die Karten sehen aus wie eine Abfahrtstafel: Abfahrtszeit, Linie, Steig bei Bussen und Gleis bei Zügen, Haltestellen, Countdown, Verspätung in Orange)', 'Wann fährt der nächste Bus Richtung Innenstadt?'] },
    { key: 'orte', icon: '📍', title: 'Orte in der Nähe', words: /apothek|geldautomat|supermarkt|toilette|parkplatz|parkhaus|café|cafe|bäcker|drogerie|krankenhaus|ladestation|werkstatt|waschanlage|orte|nähe/, examples: [
        'Wo ist der nächste Penny? (auch Aldi, Lidl, Rewe, Rossmann, McDonald\'s, Baumarkt, Werkstatt, Tankstelle, Bäcker ... Zane nennt den nächsten mit Entfernung und Öffnungszeit; ein Tipp auf die Karte öffnet die Route)', 'Navigiere mich zum nächsten Rossmann', 'Gibt es hier einen Baumarkt?', 'Wo ist die nächste Apotheke?', 'Wo kann ich Geld abheben?', 'Wo gibt es einen Supermarkt, der noch offen hat?', 'Wo ist die nächste Toilette?', 'Wo kann ich parken?', 'Wo finde ich eine Ladestation?', 'Wo ist eine Autowerkstatt?', 'Apotheke in Hamburg'] },
    { key: 'tanken', icon: '⛽', title: 'Tanken & Essen', words: /tank|sprit|diesel|benzin|restaurant|essen|hunger|pizza/, examples: [
        'Wo tanke ich günstig auf meinem Weg zur Arbeit?', 'Was kostet Diesel in der Nähe?', 'Ich habe Lust auf Pizza, gibt es was in der Nähe?'] },
    { key: 'wetter', icon: '🌦️', title: 'Wetter & Unwetter', words: /wetter|regen|schirm|jacke|warnung/, examples: [
        'Wie wird das Wetter morgen?', 'Brauche ich einen Regenschirm?', 'Zeig mir das Wetter in Istanbul (mit Wetterkarte)', 'Wie wird das Wetter morgen in Wien?', 'Zeig das Regenradar',
        'Gibt es Unwetterwarnungen? (amtliche Warnungen des Deutschen Wetterdienstes; bei Warnungen meldet sich Zane auch von selbst)'] },
    { key: 'sonnemond', icon: '🌙', title: 'Sonne & Mond', words: /sonne|sonnen|mond|vollmond|neumond|dämmerung|daemmerung/, examples: [
        'Wann geht die Sonne unter?', 'Wann geht die Sonne auf?', 'Wie lange ist es noch hell?', 'Wann geht der Mond auf?', 'Wann ist Vollmond? (öffnet ein Fenster mit Mondbild)', 'Wann ist Neumond?', 'Wie ist der Mond heute?', 'Schließen (macht das Fenster zu)'] },
    { key: 'feiertage', icon: '🎉', title: 'Feiertage & Brückentage', words: /feiertag|brückentag|brueckentag|ostern|weihnacht|pfingst/, examples: [
        'Öffne Feiertage (Fenster mit Feiertagen und Brückentagen)', 'Wann ist der nächste Feiertag?', 'Ist morgen Feiertag?', 'Welche Brückentage gibt es?', 'Welche Feiertage gibt es noch dieses Jahr?', 'Wann ist Ostern?', 'Wann ist Muttertag?',
        'Gerechnet wird für dein Bundesland; es wird mit „Mein Bundesland ist ...“ eingestellt (gilt auch für die Ferien)'] },
    { key: 'weltzeit', icon: '🕒', title: 'Uhrzeit in anderen Ländern', words: /weltzeit|weltuhr|uhrzeit|zeitunterschied|zeitzone|zeitverschiebung|wie spät/, examples: [
        'Öffne die Weltuhr (mehrere Uhren nebeneinander, live)', 'Füge Bukarest zur Weltuhr hinzu', 'Entferne Sydney aus der Weltuhr', 'Wie spät ist es in Istanbul?', 'Wie viel Uhr ist es in Tokio?', 'Wie spät ist es in den USA?', 'Zeitunterschied zu Japan'] },
    { key: 'filme', icon: '🎬', title: 'Filmtipps & Kino', words: /film|kino|streaming|streamen|serie|netflix/, examples: [
        'Gib mir einen guten Horrorfilm (auch Action, Komödie, Thriller, Science-Fiction ...)', 'Hast du einen Filmtipp? (ohne Genre: Horror oder Action)', 'Was soll ich heute schauen?',
        'Was läuft im Kino? (bundesweit aktuelle Filme)', 'Wo kann ich Dune streamen?', 'Auf welchem Streamingdienst ist Squid Game?'] },
    { key: 'mail', icon: '📧', title: 'E-Mails (nur lesen)', words: /mail|post/, examples: [
        'Habe ich neue E-Mails?', 'Nur wichtige E-Mails, keine Werbung', 'Lies mir die erste vor'] },
    { key: 'kontakte', icon: '📞', title: 'Anrufen & WhatsApp', words: /kontakt|anruf|ruf\b|whatsapp|telefon/, examples: [
        'Ruf Mama an', 'Schick Schatz eine WhatsApp: Bin gleich da', '(Zane bereitet es vor, du tippst auf die Karte)'] },
    { key: 'welt', icon: '🌍', title: 'Welt, Nachrichten & Sport', words: /welt|nachricht|sport|bundesliga|iss\b|erdbeb|live/, examples: [
        'Was ist gerade in Spanien los?', 'Zeig mir, was in Hamburg los ist (die Kugel zoomt heran und blendet in die Neon-Karte über; „Zurück zur Kugel“ bringt dich wieder hoch)', 'Zeig mir die Nachrichten von heute', 'Wo ist die ISS?', 'Zeig mir New York live', 'Wie hat der HSV gespielt?', 'Wie ist die Tabelle?', 'Zeig mir die Bundesliga-Ergebnisse (Fenster mit dem aktuellen Spieltag, laufende Spiele sind markiert; mit Pfeilen und 1. / 2. Liga umschalten)', 'Ergebnisse vom letzten Spieltag (auch: vorletzten, nächsten, vom 5. Spieltag, 2. Bundesliga Ergebnisse)', 'Wie hat der HSV am letzten Spieltag gespielt? (auch: am 5. Spieltag)', 'Anflug aus (oder: Anflug an)',
        'Lokale Nachrichten (zwei Fenster mit Bildern: Schwarzenbek und Hamburg; kommen morgens beim ersten Öffnen auch von selbst)'] },
    { key: 'ferien', icon: '🏖️', title: 'Schulferien', words: /ferien|ferienkalender|schulferien|bundesland/, examples: [
        'Wann sind die Herbstferien in Hamburg?', 'Wann sind die nächsten Ferien?', 'Zeig mir den Ferienkalender', 'Sommerferien 2027 in allen Bundesländern', 'Wann sind die Osterferien in Bayern und Hessen?', 'Mein Bundesland ist Schleswig-Holstein'] },
    { key: 'ueberblick', icon: '🌅', title: 'Tagesüberblick', words: /überblick|ueberblick|tagesplan|morgen|mein tag/, examples: [
        'Tagesüberblick (zeigt Termine, Erinnerungen, Aufgaben und Einkaufsliste als Kacheln)', 'Zeig mir meinen Tag', 'Kommt morgens von selbst beim ersten Öffnen, einstellbar unter Einstellungen > Morgen-Überblick', 'Das Fenster kommt mit Kartenwurf: Die Figur wirft eine Karte, die zum Fenster wird'] },
    { key: 'charakter', icon: '🎭', title: 'Charakter & Mitdenken', words: /charakter|frech|witz|humor|anrede|sprüche|spruch|mitdenk|von selbst|meldung|fakt/, examples: [
        'Sei frecher (oder: Sei höflicher, Keine Sprüche mehr). Fast jede Antwort bekommt einen Spruch, auch Stau, Fahrzeit, Bahn, Sprit, Mond und Filmtipps; bei Warnungen, Fehlern, Erinnerungen und E-Mails gibt es nie einen', 'Nenn mich Boss', 'Wie ist deine Laune? (Zane hat jeden Tag eine eigene Laune: mal heiter, müde, schelmisch, auch genervt oder beleidigt, je nach Uhrzeit, deinem Ton und was los ist; sie zeigt sich in Stimme, Gesicht und Antworten)', 'Laune aus (auch: Laune an)', 'Erzähl einen Witz', 'Erzähl mir was Interessantes', 'Bist du da?',
        'Melde dich nicht mehr von selbst (Abfahrt, Regen, Unwetter, Geburtstage)', 'KI-Mitdenken aus (auch: KI-Mitdenken an; die KI macht sonst am Ende einer Antwort höchstens einen kurzen Vorschlag für den nächsten Schritt und merkt sich Dauerhaftes selbst)', 'Beim Termin eintragen prüft Zane Überschneidungen, Feiertage, Wetter und Fahrzeit'] },
    { key: 'waehrung', icon: '💶', title: 'Währung umrechnen', words: /währung|waehrung|lira|dollar|kurs|umrechn|euro/, examples: [
        'Was sind 100 Euro in Lira?', 'Wie viel sind 50 Dollar in Euro?', 'Wie viel Lira sind 200 Euro?', 'Wie ist der Kurs von Euro zu Pfund?'] },
    { key: 'foto', icon: '📷', title: 'Foto auswerten', words: /foto|bild|kamera|schild|warnleuchte|fotografier/, examples: [
        'Tippe auf 📷, mach das Foto und sag dann: Setz das auf die Einkaufsliste (oder: Trag das in den Kalender ein, Übersetze das, Lege einen Kontakt davon an)', 'Übersetze dieses Schild', 'Lies mir den Brief vor', 'Erkläre mir diese Warnleuchte',
        'Trag die Termine von diesem Foto in meinen Kalender ein', 'Trag den Termin von diesem Plakat ein', 'Lege diese Visitenkarte als Kontakt an', 'Setz den Einkaufszettel auf die Liste',
        'Navigiere zu der Adresse auf diesem Foto (Plakat, Flyer, Brief fotografieren; Zane liest die Adresse vor, mit Ja startet die Route)', 'Bring mich dorthin (nach dem Foto)', 'Darf ich hier parken? (Schild fotografieren)', 'Was kann ich damit kochen? (Zutaten fotografieren)', 'Zum Foto: Was kostet das?',
        'Tipp zum Foto: Tippe das Foto ab / Merk dir den Ratenplan (auch mehrere Seiten, Drucken, ins Langzeitgedächtnis)', 'Merk dir diesen Stundenplan (Name und Tage)', 'Foto-Erkennung aus (auch: Foto-Erkennung an; sonst erkennt Zane Plakate, Briefe usw. von selbst)'] },
    { key: 'person', icon: '👧', title: 'Aussehen merken (Personen)', words: /aussehen|julia|tochter|person|gesicht/, examples: [
        'Das ist meine Tochter Julia (nach einem Foto)', 'Merk dir, wie Julia aussieht', 'Vergiss, wie Julia aussieht', '(Zane beschreibt nur das äußere Aussehen und fragt vorher, ob er es merken soll. Das Foto selbst wird nicht gespeichert, ein Gesicht erkennt er später nicht wieder.)'] },
    { key: 'internet', icon: '🌐', title: 'Aus dem Internet', words: /internet|fernseh|paket|öffnungszeit|oeffnungszeit/, examples: [
        'Was läuft heute Abend im Fernsehen?', 'Wo ist mein Paket?', 'Wann hat der Baumarkt heute auf?', 'Was läuft heute Abend im Kino in Hamburg?'] },
    { key: 'briefing', icon: '🌅', title: 'Briefing & Protokolle', words: /briefing|protokoll/, examples: [
        'Erwähne im Briefing immer, wo mein Ladekabel ist', 'Starte Protokoll Feierabend', 'Lege ein Protokoll Morgen an: Wetter und Fahrzeit zur Arbeit'] },
    { key: 'schicht', icon: '🕒', title: 'Schicht und Briefing', words: /schicht|frühschicht|spätschicht|früh|spät|dienstplan|briefing/, examples: [
        'Diese Woche Frühschicht / Nächste Woche Spätschicht (danach wechselt Zane jeden Montag von selbst)', 'Welche Schicht habe ich? / Welche Schicht habe ich nächste Woche?',
        'Das Briefing kommt von selbst: Frühschicht ab 3 Uhr 30, Spätschicht ab 12 Uhr, nur bei offener App, einmal am Tag', 'Briefing in der Spätschicht um 11 Uhr (Zeit ändern) / Wann kommt mein Briefing?',
        'Starte mein Briefing / Briefing nochmal (spielt das Briefing jederzeit sofort ab)',
        'Schicht-Briefing aus / Schicht-Briefing an', 'In der Frühschicht ist Zane von 21 Uhr 30 bis zur Briefing-Zeit still',
        'Wann beginnt meine Spätschicht? / Wann fange ich an? / Schichtbeginn nächste Woche (Früh 5 Uhr 10, Spät 13 Uhr 45, änderbar mit: Meine Frühschicht beginnt um 5 Uhr 30)', 'Wann stehe ich auf? (Frühschicht: Aufstehzeit, Spätschicht: Briefing-Zeit)'] },
    { key: 'mitnehmen', icon: '🎒', title: 'Mitnehmen-Liste', words: /mitnehm|einpack|vergessen|mitnahme/, examples: [
        'Was muss ich mitnehmen? (Zane liest die Liste vor: Arbeitschip, Haustürschlüssel, Autoschlüssel, Portemonnaie, Zahnprovisorium, Arbeitsessen, dein Energy)', 'Pack Handy auf meine Mitnehmen-Liste', 'Streich das Energy von der Mitnehmen-Liste', 'Mitnehmen-Liste zurücksetzen',
        'Die Liste sagt Zane bei der Aufbruchsansage vor der Arbeit von selbst, 10 Minuten vor der Abfahrt'] },
    { key: 'push', icon: '🔔', title: 'Benachrichtigungen', words: /benachrichtig|push|nachricht aufs handy/, examples: [
        'Benachrichtigungen an (dann auf die Karte tippen und zulassen)', 'Sende eine Test-Nachricht (muss auch bei geschlossener App ankommen)', 'Benachrichtigungen aus / Status Benachrichtigungen',
        'Bei Terminen mit Ort sagt dir Zane aufs Handy, wann du losfahren musst (mit Stau, ab deinem letzten Standort oder Zuhause)', 'Wichtige Erinnerungen kommen alle 10 Minuten wieder, bis du am Sperrbildschirm auf Erledigt tippst',
        'Nach jedem HSV-Spiel kommt von selbst eine Nachricht mit dem Endstand (gewonnen, verloren oder unentschieden); nachts zwischen 22 und 7 Uhr erst morgens',
        'Der Wochenüberblick (Sonntag 18 Uhr) kommt als Nachricht mit dem ganzen Text und wird zusätzlich gesprochen, auch wenn die App gerade offen ist',
        'Meldungen nachlesen: "Meine Meldungen" / "Was hast du mir gesagt?" / "Was habe ich verpasst?" (Wochenüberblick, Aufbruchszeit, Stau-Hinweis der letzten Tage)',
        'Wochenüberblick, Aufbruchszeit und Stau-Hinweis öffnen beim Sprechen auch ein Fenster zum Nachlesen; "Zeig mir den Wochenüberblick" jederzeit'] },
    { key: 'routinen', icon: '🔁', title: 'Routinen', words: /routine|gelernt|gewohnheit/, examples: [
        'Welche Routinen kennst du? / Was hast du gelernt?', 'Zane merkt sich still nur Art und Uhrzeit (nie den Inhalt), was du wann tust, und fragt dich höchstens einmal am Tag, ob er eine Routine merken soll',
        'Antworte einfach Ja oder Nein', 'Vergiss die Routine Einkauf / Vergiss alle Routinen', 'Routinen aus / Routinen an'] },
    { key: 'brief', icon: '✉️', title: 'Brief fotografieren', words: /brief|rechnung|mahnung|bescheid|post|schreiben|amt|behörde|preiserhöhung|einladung/, examples: [
        'Brief fotografieren / Rechnung fotografieren / Ich habe Post bekommen (dann Karte antippen, Kamera öffnet sich)', 'Foto machen, dann "Werte den Brief aus" oder auf die Karte "Brief auswerten" tippen',
        'Rechnung oder Mahnung: Zane nennt Absender, Betrag und Zahlungsziel und fragt, ob er dich vorher erinnern soll',
        'Preiserhöhung oder Vertragsänderung: Hinweis auf das Sonderkündigungsrecht, auf Wunsch wird die Kündigung vorbereitet',
        'Bescheid vom Amt: Frist (z. B. Widerspruch) erkennen und Erinnerung anbieten; Einladung: Termin in den Kalender (immer erst nach deinem Ja)'] },
    { key: 'konto', icon: '🏦', title: 'Konto-Meldung', words: /konto|bank|überweisung|gutschrift|lastschrift|abbuchung|umsatz|eingang/, examples: [
        'Zane sagt von selbst an, wenn deine Bank dir eine Mail zu einer Kontobewegung schickt (Eingang, Abbuchung, Kontoauszug), nur bei offener App', 'Prüf mal mein Konto (schaut sofort nach neuen Bank-Mails)',
        'Meine Bank ist die Sparkasse Lauenburg (damit er deren Mails erkennt)', 'Welche Banken überwachst du?', 'Konto-Meldung aus / Konto-Meldung an'] },
    { key: 'kuendigung', icon: '✉️', title: 'Kündigung schreiben', words: /kündigung|kuendigung|kündigen|kuendigen|vertrag|abo\b|mitgliedschaft/, examples: [
        'Schreib mir eine Kündigung (Zane fragt: Anbieter, Vertrag, Kunden-/Vertragsnummer, Zeitpunkt, Name und Anschrift)', 'Kündigung für Vodafone aufsetzen', 'Ich möchte meinen Vertrag kündigen',
        'Zeig die letzte Kündigung', 'Zeig meine Kündigungen (die letzten 5 bleiben gespeichert, auch per Tipp auf Kündigung in der Kugel-Ansicht)', 'Im Fenster: Text ändern, PDF speichern, Drucken, Kopieren, Adresse suchen', 'Abbrechen (beendet die Fragen)'] },
    { key: 'ansicht', icon: '🧠', title: 'Kugel-Ansicht & Fokus', words: /fokus|kugel|ansicht|gehirn|zoom|markier|hervorheb/, examples: [
        'Fokus auf Briefing (der Begriff leuchtet auf und wird groß, damit du ihn antippen kannst; auch: Markiere Parkplatz, Fokussiere Wetter)', 'Fokus beenden (oder: Zoom raus)', 'Zeig das Gehirn / Zurück zur Kugel',
        'Die Bereiche: Gedächtnis (Mitte), Zeit, Hände, Unterwegs, Ohren'] },
    { key: 'figur', icon: '🪄', title: 'Figur-Animationen', words: /figur|animation|kartenwurf|karte|scarlett|wurf/, examples: [
        'Wetter, Termine, Listen, Kontakte, Tagesüberblick usw.: Die Figur wirft eine Karte, daraus wird das Fenster', 'Sie reagiert auch auf Antworten: Regenschirm bei Regen, Sonnenbrille bei Sonne, Frieren bei Kälte, Stau-Blick, Stempel, Häkchen, Partyhut mit Konfetti, Winken bei Gute Nacht / Tschüss, Kamera-Blitz beim Foto, Klopfen wenn es länger dauert',
        'Gut gemacht (die Figur verbeugt sich)', 'Montags und freitags hat sie eigene Gesten', 'Figur-Animationen aus (auch: Figur-Animationen an)', 'Figur Test (prüft, ob alles geladen ist, und wirft eine Testkarte)',
        'Realistischer Kopf an (auch: Realistischer Kopf aus, 3D-Kopf an/aus; ein echter 3D-Kopf mit Mimik, Blinzeln, Blick und Mundbewegung statt des gezeichneten. Braucht beim ersten Mal einen Moment zum Laden)',
        'Karte automatisch schließen aus (auch: an; die Karte schließt sich sonst nach dem Sprechen von selbst, ein Tippen darauf hält sie offen)'] },
    { key: 'spiele', icon: '🎲', title: 'Mini-Spiele', words: /spiel|münze|muenze|kopf oder zahl|schere|stein|papier|würfel/, examples: [
        'Münze werfen (oder: Kopf oder Zahl)', 'Schere Stein Papier (du sagst deine Wahl, die Figur antwortet mit einer geworfenen Karte)'] },
    { key: 'dolmetscher', icon: '🗣️', title: 'Dolmetscher', words: /dolmetsch|übersetz|uebersetz/, examples: [
        'Dolmetscher Türkisch (auch Englisch, Rumänisch, Polnisch, Russisch)', 'Übersetze Guten Tag ins Englische', 'Dolmetscher beenden'] },
    { key: 'einstellungen', icon: '⚙️', title: 'Stimme & Einstellungen', words: /einstellung|system|daten|stimme|tempo|aussprache|sicher/, examples: [
        'Töne aus (auch: Töne an, Töne leiser, Töne lauter; die Effekt-Töne für Bestätigung, Fehler und Warnung)', 'Menschliche Laute aus (auch: dezent, an; Zane seufzt bei Stau, kichert bei Sprüchen, atmet vor langen Antworten ein - nur mit Fish Audio)', 'Stimme: Einstellungen > Stimme & Gespräch > Sprachausgabe > Fish Audio (Stimmen-ID eintragen und „Fish-Stimme testen“)', 'Sprich langsamer', 'Sprich Alyssa so aus: Alischa', 'Wenn ich Hamlet sage, meine ich Hamiyet (Hör-Korrektur für falsch verstandene Namen)', 'Welche Hör-Korrekturen hast du?', 'Nenn mich Dino', 'Sichere meine Daten', 'Systemcheck'] }
];

/* Ist der Satz eine Hilfe-Frage? Gibt { topic } zurück ('' = Überblick) oder null */
function parseHelpRequest(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 60) return null;
    const overview = /^(?:(?:jarvis|zane)[, ]+)?(?:hilfe|hilf mir|was kannst du(?: alles)?(?: für mich)?(?: tun| machen)?|was kann ich (?:dich )?fragen|was kann ich sagen|welche befehle (?:gibt es|kennst du)|sprachbefehle|befehle|zeig(?:e)? (?:mir )?(?:was du kannst|die hilfe|hilfe))$/.test(t);
    if (overview) return { topic: '' };
    // Zu einem Thema nur, wenn der Satz wirklich mit "Hilfe/Was kannst du/Beispiele" beginnt oder "Hilfe zu/bei ..." sagt;
    // sonst würde "Ich brauche Hilfe beim Umzug" fälschlich als Hilfe zu einem Thema gelten
    const asksHelp = /^(?:(?:jarvis|zane)[, ]+)?(?:hilfe|was kannst du|beispiele?|befehle)\b/.test(t)
        || /\b(?:hilfe|beispiele?)\s+(?:zu|zum|zur|bei|für|über)\b/.test(t) || /\bwas kannst du\b/.test(t);
    if (asksHelp) {
        const hit = HELP_TOPICS.find(x => x.words.test(t));
        if (hit) return { topic: hit.key };
    }
    return null;
}

function helpTopicCard(topic) {
    return { icon: topic.icon, title: topic.title, subtitle: topic.examples[0], onclick: `showHelpTopic('${topic.key}')` };
}

function showHelpOverview() {
    if (typeof clearActionCards === 'function') clearActionCards();
    if (typeof showActionCards === 'function') showActionCards(HELP_TOPICS.map(helpTopicCard));
    speak('Ich kann dir bei vielen Dingen helfen: Termine und Erinnerungen, Listen, Fahrten und Verkehr, Bahn, Tanken, Wetter und Unwetterwarnungen, Feiertage, Sonne und Mond, Filmtipps, E-Mails, Anrufe, Nachrichten und mehr. Die Themen stehen unten. Tippe auf eines, oder sag zum Beispiel: Hilfe Fahrten.',
        typeof continueConversation === 'function' ? continueConversation : undefined);
}

function showHelpTopic(key) {
    const topic = HELP_TOPICS.find(x => x.key === key);
    if (!topic) { showHelpOverview(); return; }
    const cards = topic.examples.map(e => ({ icon: '💬', title: e, subtitle: topic.title }));
    cards.push({ icon: '↩️', title: 'Alle Themen', subtitle: 'Zurück zur Übersicht', onclick: 'showHelpOverview()' });
    if (typeof clearActionCards === 'function') clearActionCards();
    if (typeof showActionCards === 'function') showActionCards(cards);
    const first = topic.examples.filter(e => !e.startsWith('(')).slice(0, 2);
    speak(`${topic.title}: Sag zum Beispiel: ${first[0]}.${first[1] ? ' Oder: ' + first[1] + '.' : ''} Weitere Beispiele stehen unten.`,
        typeof continueConversation === 'function' ? continueConversation : undefined);
}

function handleHelpCommand(text) {
    const req = parseHelpRequest(text);
    if (!req) return false;
    if (req.topic) showHelpTopic(req.topic); else showHelpOverview();
    return true;
}