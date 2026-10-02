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
        'Wo ist die nächste Apotheke?', 'Wo kann ich Geld abheben?', 'Wo gibt es einen Supermarkt, der noch offen hat?', 'Wo ist die nächste Toilette?', 'Wo kann ich parken?', 'Wo finde ich eine Ladestation?', 'Wo ist eine Autowerkstatt?', 'Apotheke in Hamburg'] },
    { key: 'tanken', icon: '⛽', title: 'Tanken & Essen', words: /tank|sprit|diesel|benzin|restaurant|essen|hunger|pizza/, examples: [
        'Wo tanke ich günstig auf meinem Weg zur Arbeit?', 'Was kostet Diesel in der Nähe?', 'Ich habe Lust auf Pizza, gibt es was in der Nähe?'] },
    { key: 'wetter', icon: '🌦️', title: 'Wetter', words: /wetter|regen|schirm|jacke/, examples: [
        'Wie wird das Wetter morgen?', 'Brauche ich einen Regenschirm?', 'Zeig mir das Wetter in Istanbul (mit Wetterkarte)', 'Wie wird das Wetter morgen in Wien?', 'Zeig das Regenradar'] },
    { key: 'mail', icon: '📧', title: 'E-Mails (nur lesen)', words: /mail|post/, examples: [
        'Habe ich neue E-Mails?', 'Nur wichtige E-Mails, keine Werbung', 'Lies mir die erste vor'] },
    { key: 'kontakte', icon: '📞', title: 'Anrufen & WhatsApp', words: /kontakt|anruf|ruf\b|whatsapp|telefon/, examples: [
        'Ruf Mama an', 'Schick Schatz eine WhatsApp: Bin gleich da', '(Jarvis bereitet es vor, du tippst auf die Karte)'] },
    { key: 'welt', icon: '🌍', title: 'Welt, Nachrichten & Sport', words: /welt|nachricht|sport|bundesliga|iss\b|erdbeb|live/, examples: [
        'Was ist gerade in Spanien los?', 'Zeig mir die Nachrichten von heute', 'Wo ist die ISS?', 'Zeig mir New York live', 'Wie hat der HSV gespielt?', 'Wie ist die Tabelle?'] },
    { key: 'waehrung', icon: '💶', title: 'Währung umrechnen', words: /währung|waehrung|lira|dollar|kurs|umrechn|euro/, examples: [
        'Was sind 100 Euro in Lira?', 'Wie viel sind 50 Dollar in Euro?', 'Wie viel Lira sind 200 Euro?', 'Wie ist der Kurs von Euro zu Pfund?'] },
    { key: 'foto', icon: '📷', title: 'Foto auswerten', words: /foto|bild|kamera|schild|warnleuchte|fotografier/, examples: [
        'Mach ein Foto (oder tippe auf 📷)', 'Übersetze dieses Schild', 'Lies mir den Brief vor', 'Erkläre mir diese Warnleuchte',
        'Trag die Termine von diesem Foto in meinen Kalender ein', 'Trag den Termin von diesem Plakat ein', 'Lege diese Visitenkarte als Kontakt an', 'Setz den Einkaufszettel auf die Liste',
        'Darf ich hier parken? (Schild fotografieren)', 'Was kann ich damit kochen? (Zutaten fotografieren)', 'Zum Foto: Was kostet das?'] },
    { key: 'internet', icon: '🌐', title: 'Aus dem Internet', words: /internet|fernseh|kino|paket|öffnungszeit|oeffnungszeit/, examples: [
        'Was läuft heute Abend im Fernsehen?', 'Wo ist mein Paket?', 'Wann hat der Baumarkt heute auf?'] },
    { key: 'briefing', icon: '🌅', title: 'Briefing & Protokolle', words: /briefing|protokoll/, examples: [
        'Erwähne im Briefing immer, wo mein Ladekabel ist', 'Starte Protokoll Feierabend', 'Lege ein Protokoll Morgen an: Wetter und Fahrzeit zur Arbeit'] },
    { key: 'dolmetscher', icon: '🗣️', title: 'Dolmetscher', words: /dolmetsch|übersetz|uebersetz/, examples: [
        'Dolmetscher Türkisch (auch Englisch, Rumänisch, Polnisch, Russisch)', 'Übersetze Guten Tag ins Englische', 'Dolmetscher beenden'] },
    { key: 'einstellungen', icon: '⚙️', title: 'Stimme & Einstellungen', words: /einstellung|system|daten|stimme|tempo|aussprache|sicher/, examples: [
        'Sprich langsamer', 'Sprich Alyssa so aus: Alischa', 'Nenn mich Dino', 'Sichere meine Daten', 'Systemcheck'] }
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
    speak('Ich kann Ihnen bei vielen Dingen helfen: Termine und Erinnerungen, Listen, Fahrten und Verkehr, Bahn, Tanken, Wetter, E-Mails, Anrufe, Nachrichten und mehr. Die Themen stehen unten. Tippen Sie auf eines, oder sagen Sie zum Beispiel: Hilfe Fahrten.',
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
