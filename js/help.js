/* ============================================================
   HILFE: "Hilfe", "Was kannst du?", "Was kannst du alles?" -> Jarvis nennt die Themen, unten erscheinen sie als Karten.
   Ein Tipp auf ein Thema (oder "Hilfe Fahrten") zeigt Beispielsätze dazu. Direkt in der App, ohne KI.
   Die Beispiele entsprechen dem, was Jarvis wirklich kann (siehe prompt.js); wird etwas Neues eingebaut, hier ergänzen.
   Braucht: voice.js (speak), showActionCards/clearActionCards. Wird von localcommands.js aufgerufen.
   ============================================================ */

const HELP_TOPICS = [
    { key: 'termine', icon: '📅', title: 'Termine & Kalender', words: /termin|kalender|geburtstag/, examples: [
        'Trag morgen um 15 Uhr Zahnarzt in Hamburg ein', 'Wann hat Schatz Geburtstag?', 'Verschieb den Zahnarzt auf Freitag',
        'Trag jeden Montag Mülltonne rausstellen ein', 'Zeig meine Termine der nächsten Woche'] },
    { key: 'erinnerungen', icon: '🔔', title: 'Erinnerungen', words: /erinner/, examples: [
        'Erinnere mich morgen um 8 Uhr an den Arzt', 'Erinnere mich alle zwei Wochen an die Wäsche', 'Wichtige Erinnerung: Paket abholen (er fragt nach, bis du erledigt sagst)',
        'In zehn Minuten nochmal', 'Lösche alle Erinnerungen'] },
    { key: 'listen', icon: '📝', title: 'Listen & Notizen', words: /liste|einkauf|notiz|aufgabe/, examples: [
        'Setz Milch auf die Einkaufsliste', 'Was steht auf meiner Einkaufsliste?', 'Notiere, dass ich noch Kabelschuhe brauche', 'Lösche Milch von der Liste'] },
    { key: 'gedaechtnis', icon: '🧠', title: 'Gedächtnis', words: /gedächtnis|gedaechtnis|merk/, examples: [
        'Merk dir, der Ersatzschlüssel hängt am Klemmbrett', 'Wo ist mein Ersatzschlüssel?'] },
    { key: 'auto', icon: '🚗', title: 'Auto & Parkplatz', words: /parkplatz|geparkt|\bauto\b/, examples: [
        'Merk dir, wo ich geparkt habe', 'Wo ist mein Auto?', 'Bring mich zu meinem Auto'] },
    { key: 'fahrten', icon: '🗺️', title: 'Fahrten & Verkehr', words: /fahr|verkehr|stau|navig|route|weg\b|karte/, examples: [
        'Ich möchte heute zu Alyssa fahren', 'Wann muss ich zum Zahnarzt losfahren?', 'Ist Stau auf meiner Strecke zur Arbeit?', 'Bring mich nach Hause', 'Zeig mir die Karte'] },
    { key: 'bahn', icon: '🚆', title: 'Bahn & Bus', words: /\bbahn|\bzug\b|\bzüge\b|\bbus\b|verbindung/, examples: [
        'Wann fährt der nächste Zug nach Hamburg?', 'Such mir die Bahnverbindung von Schwarzenbek nach Hamburg raus', 'Meine Tochter soll um 16 Uhr hier sein, wann muss sie los?'] },
    { key: 'orte', icon: '📍', title: 'Orte in der Nähe', words: /apothek|geldautomat|supermarkt|toilette|parkplatz|parkhaus|café|cafe|bäcker|drogerie|krankenhaus|ladestation|werkstatt|waschanlage|orte|nähe/, examples: [
        'Wo ist der nächste Penny? (auch Aldi, Lidl, Rewe, Rossmann, McDonald\'s, Baumarkt, Werkstatt, Tankstelle, Bäcker ... Jarvis nennt den nächsten mit Entfernung und Öffnungszeit; ein Tipp auf die Karte öffnet die Route)', 'Navigiere mich zum nächsten Rossmann', 'Gibt es hier einen Baumarkt?', 'Wo ist die nächste Apotheke?', 'Wo kann ich Geld abheben?', 'Wo gibt es einen Supermarkt, der noch offen hat?', 'Wo ist die nächste Toilette?', 'Wo kann ich parken?', 'Wo finde ich eine Ladestation?', 'Wo ist eine Autowerkstatt?', 'Apotheke in Hamburg'] },
    { key: 'tanken', icon: '⛽', title: 'Tanken & Essen', words: /tank|sprit|diesel|benzin|restaurant|essen|hunger|pizza/, examples: [
        'Wo tanke ich günstig auf meinem Weg zur Arbeit?', 'Was kostet Diesel in der Nähe?', 'Ich habe Lust auf Pizza, gibt es was in der Nähe?'] },
    { key: 'wetter', icon: '🌦️', title: 'Wetter & Unwetter', words: /wetter|regen|schirm|jacke|warnung/, examples: [
        'Wie wird das Wetter morgen?', 'Brauche ich einen Regenschirm?', 'Zeig mir das Wetter in Istanbul (mit Wetterkarte)', 'Wie wird das Wetter morgen in Wien?', 'Zeig das Regenradar',
        'Gibt es Unwetterwarnungen? (amtliche Warnungen des Deutschen Wetterdienstes; bei Warnungen meldet sich Jarvis auch von selbst)'] },
    { key: 'sonnemond', icon: '🌙', title: 'Sonne & Mond', words: /sonne|sonnen|mond|vollmond|neumond|dämmerung|daemmerung/, examples: [
        'Wann geht die Sonne unter?', 'Wann geht die Sonne auf?', 'Wie lange ist es noch hell?', 'Wann geht der Mond auf?', 'Wann ist Vollmond? (öffnet ein Fenster mit Mondbild)', 'Wann ist Neumond?', 'Wie ist der Mond heute?', 'Schließen (macht das Fenster zu)'] },
    { key: 'feiertage', icon: '🎉', title: 'Feiertage & Brückentage', words: /feiertag|brückentag|brueckentag|ostern|weihnacht|pfingst/, examples: [
        'Öffne Feiertage (Fenster mit Feiertagen und Brückentagen)', 'Wann ist der nächste Feiertag?', 'Ist morgen Feiertag?', 'Welche Brückentage gibt es?', 'Welche Feiertage gibt es noch dieses Jahr?', 'Wann ist Ostern?', 'Wann ist Muttertag?',
        'Gerechnet wird für dein Bundesland; es wird mit „Mein Bundesland ist ...“ eingestellt (gilt auch für die Ferien)'] },
    { key: 'weltzeit', icon: '🕒', title: 'Uhrzeit in anderen Ländern', words: /weltzeit|uhrzeit|zeitunterschied|zeitzone|zeitverschiebung|wie spät/, examples: [
        'Wie spät ist es in Istanbul?', 'Wie viel Uhr ist es in Tokio?', 'Wie spät ist es in den USA?', 'Zeitunterschied zu Japan'] },
    { key: 'filme', icon: '🎬', title: 'Filmtipps & Kino', words: /film|kino|streaming|streamen|serie|netflix/, examples: [
        'Gib mir einen guten Horrorfilm (auch Action, Komödie, Thriller, Science-Fiction ...)', 'Hast du einen Filmtipp? (ohne Genre: Horror oder Action)', 'Was soll ich heute schauen?',
        'Was läuft im Kino? (bundesweit aktuelle Filme)', 'Wo kann ich Dune streamen?', 'Auf welchem Streamingdienst ist Squid Game?'] },
    { key: 'mail', icon: '📧', title: 'E-Mails (nur lesen)', words: /mail|post/, examples: [
        'Habe ich neue E-Mails?', 'Nur wichtige E-Mails, keine Werbung', 'Lies mir die erste vor'] },
    { key: 'kontakte', icon: '📞', title: 'Anrufen & WhatsApp', words: /kontakt|anruf|ruf\b|whatsapp|telefon/, examples: [
        'Ruf Mama an', 'Schick Schatz eine WhatsApp: Bin gleich da', '(Jarvis bereitet es vor, du tippst auf die Karte)'] },
    { key: 'welt', icon: '🌍', title: 'Welt, Nachrichten & Sport', words: /welt|nachricht|sport|bundesliga|iss\b|erdbeb|live/, examples: [
        'Was ist gerade in Spanien los?', 'Zeig mir, was in Hamburg los ist (die Kugel zoomt heran und blendet in die Neon-Karte über; „Zurück zur Kugel“ bringt dich wieder hoch)', 'Zeig mir die Nachrichten von heute', 'Wo ist die ISS?', 'Zeig mir New York live', 'Wie hat der HSV gespielt?', 'Wie ist die Tabelle?', 'Anflug aus (oder: Anflug an)'] },
    { key: 'ferien', icon: '🏖️', title: 'Schulferien', words: /ferien|ferienkalender|schulferien|bundesland/, examples: [
        'Wann sind die Herbstferien in Hamburg?', 'Wann sind die nächsten Ferien?', 'Zeig mir den Ferienkalender', 'Sommerferien 2027 in allen Bundesländern', 'Wann sind die Osterferien in Bayern und Hessen?', 'Mein Bundesland ist Schleswig-Holstein'] },
    { key: 'ueberblick', icon: '🌅', title: 'Tagesüberblick', words: /überblick|ueberblick|tagesplan|morgen|mein tag/, examples: [
        'Tagesüberblick (zeigt Termine, Erinnerungen, Aufgaben und Einkaufsliste als Kacheln)', 'Zeig mir meinen Tag', 'Kommt morgens von selbst beim ersten Öffnen, einstellbar unter Einstellungen > Morgen-Überblick'] },
    { key: 'charakter', icon: '🎭', title: 'Charakter & Mitdenken', words: /charakter|frech|witz|humor|anrede|sprüche|spruch|mitdenk|von selbst|meldung|fakt/, examples: [
        'Sei frecher (oder: Sei höflicher, Keine Sprüche mehr). Fast jede Antwort bekommt einen Spruch, auch Stau, Fahrzeit, Bahn, Sprit, Mond und Filmtipps; bei Warnungen, Fehlern, Erinnerungen und E-Mails gibt es nie einen', 'Nenn mich Boss', 'Erzähl einen Witz', 'Erzähl mir was Interessantes', 'Bist du da?',
        'Melde dich nicht mehr von selbst (Abfahrt, Regen, Unwetter, Geburtstage)', 'Beim Termin eintragen prüft Jarvis Überschneidungen, Feiertage, Wetter und Fahrzeit'] },
    { key: 'waehrung', icon: '💶', title: 'Währung umrechnen', words: /währung|waehrung|lira|dollar|kurs|umrechn|euro/, examples: [
        'Was sind 100 Euro in Lira?', 'Wie viel sind 50 Dollar in Euro?', 'Wie viel Lira sind 200 Euro?', 'Wie ist der Kurs von Euro zu Pfund?'] },
    { key: 'foto', icon: '📷', title: 'Foto auswerten', words: /foto|bild|kamera|schild|warnleuchte|fotografier/, examples: [
        'Tippe auf 📷, mach das Foto und sag dann: Setz das auf die Einkaufsliste (oder: Trag das in den Kalender ein, Übersetze das, Lege einen Kontakt davon an)', 'Übersetze dieses Schild', 'Lies mir den Brief vor', 'Erkläre mir diese Warnleuchte',
        'Trag die Termine von diesem Foto in meinen Kalender ein', 'Trag den Termin von diesem Plakat ein', 'Lege diese Visitenkarte als Kontakt an', 'Setz den Einkaufszettel auf die Liste',
        'Navigiere zu der Adresse auf diesem Foto (Plakat, Flyer, Brief fotografieren; Jarvis liest die Adresse vor, mit Ja startet die Route)', 'Bring mich dorthin (nach dem Foto)', 'Darf ich hier parken? (Schild fotografieren)', 'Was kann ich damit kochen? (Zutaten fotografieren)', 'Zum Foto: Was kostet das?'] },
    { key: 'internet', icon: '🌐', title: 'Aus dem Internet', words: /internet|fernseh|paket|öffnungszeit|oeffnungszeit/, examples: [
        'Was läuft heute Abend im Fernsehen?', 'Wo ist mein Paket?', 'Wann hat der Baumarkt heute auf?', 'Was läuft heute Abend im Kino in Hamburg?'] },
    { key: 'briefing', icon: '🌅', title: 'Briefing & Protokolle', words: /briefing|protokoll/, examples: [
        'Erwähne im Briefing immer, wo mein Ladekabel ist', 'Starte Protokoll Feierabend', 'Lege ein Protokoll Morgen an: Wetter und Fahrzeit zur Arbeit'] },
    { key: 'dolmetscher', icon: '🗣️', title: 'Dolmetscher', words: /dolmetsch|übersetz|uebersetz/, examples: [
        'Dolmetscher Türkisch (auch Englisch, Rumänisch, Polnisch, Russisch)', 'Übersetze Guten Tag ins Englische', 'Dolmetscher beenden'] },
    { key: 'einstellungen', icon: '⚙️', title: 'Stimme & Einstellungen', words: /einstellung|system|daten|stimme|tempo|aussprache|sicher/, examples: [
        'Töne aus (auch: Töne an, Töne leiser, Töne lauter; die Effekt-Töne für Bestätigung, Fehler und Warnung)', 'Menschliche Laute aus (auch: dezent, an; Jarvis seufzt bei Stau, kichert bei Sprüchen, atmet vor langen Antworten ein - nur mit Fish Audio)', 'Stimme: Einstellungen > Stimme & Gespräch > Sprachausgabe > Fish Audio (Stimmen-ID eintragen und „Fish-Stimme testen“)', 'Sprich langsamer', 'Sprich Alyssa so aus: Alischa', 'Nenn mich Dino', 'Sichere meine Daten', 'Systemcheck'] }
];

/* Ist der Satz eine Hilfe-Frage? Gibt { topic } zurück ('' = Überblick) oder null */
function parseHelpRequest(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 60) return null;
    const overview = /^(?:jarvis[, ]+)?(?:hilfe|hilf mir|was kannst du(?: alles)?(?: für mich)?(?: tun| machen)?|was kann ich (?:dich )?fragen|was kann ich sagen|welche befehle (?:gibt es|kennst du)|sprachbefehle|befehle|zeig(?:e)? (?:mir )?(?:was du kannst|die hilfe|hilfe))$/.test(t);
    if (overview) return { topic: '' };
    // Zu einem Thema nur, wenn der Satz wirklich mit "Hilfe/Was kannst du/Beispiele" beginnt oder "Hilfe zu/bei ..." sagt;
    // sonst würde "Ich brauche Hilfe beim Umzug" fälschlich als Hilfe zu einem Thema gelten
    const asksHelp = /^(?:jarvis[, ]+)?(?:hilfe|was kannst du|beispiele?|befehle)\b/.test(t)
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
    speak('Ich kann Ihnen bei vielen Dingen helfen: Termine und Erinnerungen, Listen, Fahrten und Verkehr, Bahn, Tanken, Wetter und Unwetterwarnungen, Feiertage, Sonne und Mond, Filmtipps, E-Mails, Anrufe, Nachrichten und mehr. Die Themen stehen unten. Tippen Sie auf eines, oder sagen Sie zum Beispiel: Hilfe Fahrten.',
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
    speak(`${topic.title}: Sagen Sie zum Beispiel: ${first[0]}.${first[1] ? ' Oder: ' + first[1] + '.' : ''} Weitere Beispiele stehen unten.`,
        typeof continueConversation === 'function' ? continueConversation : undefined);
}

function handleHelpCommand(text) {
    const req = parseHelpRequest(text);
    if (!req) return false;
    if (req.topic) showHelpTopic(req.topic); else showHelpOverview();
    return true;
}
