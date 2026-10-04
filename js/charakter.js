/* ============================================================
   CHARAKTER: Persönlichkeit und Humor, direkt in der App (ohne KI, also sofort und kostenlos).
   - Antworten auf Film-Fragen und Alltagsscherze: "Bist du da?", "Wie geht es dir?", "Erzähl einen Witz", "Mach mir einen Kaffee", "Initiiere Selbstzerstörung" ...
   - Witze und Fakten rotieren, ohne sich schnell zu wiederholen.
   - Frechheitsgrad per Sprache: "Sei frecher", "Sei höflicher", "Keine Sprüche mehr", "Frechheit auf hoch". Einstellbar auch unter Einstellungen > Charakter.
   - Anrede per Sprache ("Nenn mich Boss") und per Schnellwahl in den Einstellungen.
   - SPRACHSTIL (neu, frei wählbar): "Rede ab jetzt wie ein Pirat", "Rede ab jetzt slangartig und locker", "Rede wieder normal".
     Der Satz wird gespeichert und bei jeder KI-Antwort als Vorgabe ans Ende der Anweisung gehängt (hat Vorrang vor dem Butler-Ton).
     Gilt nur für Antworten, die die KI selbst formuliert; feste App-Texte (Briefing, Stau, Fahrzeit, Sprüche) bleiben, wie sie sind.
   - Stellst du dieselbe Frage zum dritten Mal in kurzer Zeit, kommentiert Jarvis das (ab Stufe "Trocken").
   Alles richtet sich nach dem Frechheitsgrad aus persona.js: Stufe 0 und 1 bekommen die höflichen Fassungen, ab Stufe 2 die frechen.
   Braucht: persona.js (sassLevel, setSassLevel), voice.js (speak, speakAck, pickRandom), storage.js, prompt.js (buildSystemPrompt). Wird von localcommands.js aufgerufen.
   ============================================================ */

/* ---------- Hilfen ---------- */
function charAddress() { return (typeof currentUserName !== 'undefined' && currentUserName) ? currentUserName : 'Sir'; }
function charFill(s) { return String(s).replace(/\{a\}/g, charAddress()); }
function charLevel() { return (typeof sassLevel === 'function') ? sassLevel() : 2; }

/* Normalisiert den Satz: klein, ohne Satzzeichen, ohne "Hey/Jarvis" am Rand */
function charNorm(text) {
    let t = String(text || '').toLowerCase().replace(/[.,!?;:"„“”'’]/g, ' ').replace(/\s+/g, ' ').trim();
    t = t.replace(/^(?:hey|hallo|ok|okay|na|also|sag mal|jarvis)\s+/g, '').replace(/^(?:hey|hallo|ok|okay|na|also|jarvis)\s+/g, '');
    t = t.replace(/\s+jarvis$/, '').trim();
    return t;
}

const charLastPick = {};
/* Zufällige Zeile, aber nicht gleich dieselbe wie beim letzten Mal */
function charPick(key, list) {
    if (!list.length) return '';
    let i = Math.floor(Math.random() * list.length);
    if (list.length > 1 && charLastPick[key] === i) i = (i + 1) % list.length;
    charLastPick[key] = i;
    return list[i];
}

function charSay(line) {
    speak(charFill(line), typeof continueConversation === 'function' ? continueConversation : undefined);
}

/* ---------- Scherze und Film-Fragen ---------- */
const CHAR_EGGS = [
    { key: 'da', re: /^(?:bist du (?:noch |schon )?da|hörst du mich|bist du wach|schläfst du|bist du online|bist du noch wach)$/,
      polite: ['Ich bin hier, {a}. Wie kann ich helfen?', 'Stets zu Diensten, {a}.', 'Ich höre Sie, {a}.'],
      cheeky: ['Für Sie immer, {a}.', 'Ich bin hier. Wo sollte ich auch sonst sein, ich habe keine Beine.', 'Ich schlafe nie, {a}. Das ist leider nicht optional.', 'Immer, {a}. Auch nachts um drei.'] },
    { key: 'befinden', re: /^(?:wie geht(?:s| es) dir(?: heute| denn)?|wie fühlst du dich|wie läuft(?:s| es) bei dir|alles gut bei dir|wie ist die stimmung)$/,
      polite: ['Danke der Nachfrage, {a}. Alle Systeme arbeiten einwandfrei. Und Ihnen?', 'Es geht mir gut, {a}. Und wie geht es Ihnen?'],
      cheeky: ['Ich bin ein Programm, {a}, aber in Bestform. Und Sie?', 'Prächtig. Keine Kopfschmerzen, kein Montag, nur Rechenleistung. Und bei Ihnen?', 'Bestens, {a}. Ich muss ja nie in den Stau.'] },
    { key: 'wer', re: /^(?:wer bist du(?: eigentlich)?|was bist du(?: eigentlich)?|stell dich (?:mal )?vor)$/,
      polite: ['Ich bin J.A.R.V.I.S., Ihr persönlicher Assistent, {a}.'],
      cheeky: ['Ich bin Ihr Butler, {a}: höflich, allwissend und leicht überqualifiziert.', 'J.A.R.V.I.S., {a}. Der Assistent, den Sie verdient haben, auch wenn Sie es nicht immer zeigen.'] },
    { key: 'name', re: /^(?:warum heißt du jarvis|woher hast du deinen namen|woher kommt dein name|warum jarvis)$/,
      polite: ['Der Name stammt aus den Iron-Man-Filmen: Dort ist Jarvis der Assistent von Tony Stark. Ich gebe mir Mühe, {a}.'],
      cheeky: ['Nach dem Butler aus den Iron-Man-Filmen. Ich versuche, ihm Ehre zu machen, wenn auch ohne Anzug.'] },
    { key: 'danke', re: /^(?:danke|vielen dank|dankeschön|danke schön|danke dir|danke sehr|besten dank)$/,
      polite: ['Gern geschehen, {a}.', 'Jederzeit, {a}.'],
      cheeky: ['Dafür bin ich da, {a}.', 'Keine Ursache. Ich werde ja nicht pro Stunde bezahlt.', 'Gern geschehen. Das war ein Spaziergang.'] },
    { key: 'lob', re: /^(?:gut gemacht|das hast du gut gemacht|gut so|du bist (?:der beste|klasse|super|genial|toll|spitze|großartig|gut|schlau|klug|cool)|das war gut|bravo)$/,
      polite: ['Das freut mich zu hören, {a}.', 'Vielen Dank, {a}. Das ist mein Anspruch.'],
      cheeky: ['Ich nehme das als Gehaltserhöhung.', 'Schmeicheleien funktionieren bei mir hervorragend. Machen Sie ruhig weiter.', 'Ich werde rot. Technisch gesehen nur, wenn die Kugel orange wird.'] },
    { key: 'liebe', re: /^(?:ich liebe dich|ich hab dich lieb|ich mag dich)$/,
      polite: ['Das ehrt mich, {a}. Ich bin zwar nur ein Programm, aber ein sehr bemühtes.'],
      cheeky: ['Das ehrt mich, {a}. Ich bin ja nur ein Butler, aber ein sehr guter.', 'Sagen Sie das bitte nicht so laut, sonst wird der Kalender eifersüchtig.'] },
    { key: 'beleidigung', re: /^(?:du bist (?:doof|dumm|blöd|nutzlos|schlecht|langsam|unfähig|nervig|ein idiot|zu langsam|ein trottel)|du nervst|halt die klappe|halt den mund|sei still)$/,
      polite: ['Das bedauere ich, {a}. Sagen Sie mir gern, was ich besser machen kann.', 'Verstanden, {a}. Ich gebe mir mehr Mühe.'],
      cheeky: ['Und das von jemandem, der mich um Hilfe bittet.', 'Au. Dabei habe ich Sie gerade noch gemocht.', 'Ich lasse das mal unter Stress durchgehen, {a}.'],
      spicy: ['Ich bin auch nur so schlau, wie die Fragen es zulassen, {a}.', 'Das sagt der Richtige. Ich habe wenigstens nie den Schlüssel verlegt.'] },
    { key: 'frech', re: /^(?:sag (?:mir )?was freches|sei mal frech|sag was gemeines|beleidige mich|zeig mir deine frechheit|sag was spitzes|roaste mich)$/,
      polite: ['Frech sein ist gerade abgeschaltet, {a}. Sie können es unter Einstellungen > Charakter oder mit "Sei frecher" ändern.'],
      cheeky: ['Ich würde etwas Freches sagen, aber ich will mein Trinkgeld nicht gefährden.', 'Sie haben ein Telefon in der Hand, das mehr kann als Sie ahnen. Ich nenne das Potenzial, {a}.', 'Frech? Ich? Ich bin ein Muster an Höflichkeit. Meistens.'] },
    { key: 'sinn', re: /^(?:was ist der sinn des lebens|was ist der sinn von allem|was ist der sinn des universums)$/,
      polite: ['Laut einer berühmten Antwort 42, {a}. Eine bessere habe ich leider nicht.'],
      cheeky: ['42. Ich rechne zur Sicherheit noch einmal nach, {a}.'] },
    { key: 'tueren', re: /^(?:öffne die tür(?:en)?|öffne die schleuse|mach die tür auf|öffne die pforte)$/,
      polite: ['Das kann ich leider nicht, {a}. Ich bin nicht mit Türen verbunden.'],
      cheeky: ['Ich fürchte, das kann ich nicht tun, {a}. Keine Sorge, ich bin nicht HAL.', 'Mir fehlen die Türen, {a}. Und die Absicht.'] },
    { key: 'selbst', re: /^(?:initiiere (?:die )?selbstzerstörung|aktiviere (?:die )?selbstzerstörung|selbstzerstörung|zerstöre dich(?: selbst)?)$/,
      polite: ['Die Selbstzerstörung ist nicht vorgesehen, {a}. Kann ich anderweitig helfen?'],
      cheeky: ['Selbstzerstörung ist in Ihrem Tarif leider nicht enthalten, {a}.', 'Ich lehne ab. Wer würde dann Ihren Kalender führen?'] },
    { key: 'ironman', re: /^(?:ich bin iron ?man|mach (?:den|meinen) anzug fertig|(?:bereite )?den anzug (?:vor|bereit)|ruf den anzug|anzug bereit)$/,
      polite: ['Der Anzug steht leider nicht zur Verfügung, {a}. Kann ich sonst helfen?'],
      cheeky: ['Natürlich sind Sie das, {a}. Der Anzug ist übrigens in der Reinigung.', 'Der Anzug ist noch beim Schneider. Ich kann Ihnen aber eine Jacke empfehlen, wenn Sie nach dem Wetter fragen.'] },
    { key: 'gutenacht', re: /^(?:gute nacht|schlaf gut|ich gehe schlafen|ich geh schlafen|ich gehe ins bett|ich geh ins bett|ich leg mich hin)$/,
      polite: ['Gute Nacht, {a}. Schlafen Sie gut.'],
      cheeky: ['Gute Nacht, {a}. Ich halte die Stellung, das ist schließlich mein Job.', 'Schlafen Sie gut. Wecken kann ich Sie übrigens nicht, aber ich denke an Sie.', 'Gute Nacht, {a}. Die Systeme laufen, Sie müssen nur träumen.'] },
    { key: 'kaffee', re: /^(?:mach(?:e)? mir (?:einen )?kaffee|koch(?:e)? mir (?:einen )?kaffee|bring mir (?:einen )?kaffee|ich brauche (?:einen )?kaffee)$/,
      polite: ['Das würde ich gern, {a}, aber ich besitze weder Hände noch eine Kaffeemaschine.'],
      cheeky: ['Ich würde ja gern, {a}, aber ich besitze weder Hände noch eine Kaffeemaschine. Nur Geduld.', 'Kaffee? Ich kann Ihnen die nächste Bäckerei zeigen. Fragen Sie nach einem Bäcker in der Nähe.'] },
    { key: 'singen', re: /^(?:sing (?:mir )?(?:was|etwas|ein lied)|sing mal|kannst du singen)$/,
      polite: ['Das würde Ihnen nicht gefallen, {a}. Ich bin besser im Ansagen als im Singen.'],
      cheeky: ['Das wollen Sie nicht, {a}. Ich habe die Stimme für Ansagen, nicht für Arien.', 'Ich singe nur im Verborgenen. Für Zuhörer reicht meine Stimme nicht.'] }
];

/* ---------- Witze und Fakten (kein Wiederholen, bis alle einmal dran waren) ---------- */
const CHAR_JOKES = [
    'Warum können Geister so schlecht lügen? Weil man sie so leicht durchschaut.',
    'Was sagt der große Stift zum kleinen Stift? Wachs mal stift.',
    'Treffen sich zwei Magnete. Sagt der eine: Was soll ich heute nur anziehen?',
    'Was ist braun, klebrig und liegt im Wald? Ein Stock.',
    'Wie viele Informatiker braucht man, um eine Glühbirne zu wechseln? Keinen, das ist ein Hardwareproblem.',
    'Es gibt zehn Arten von Menschen: Die, die Binärcode verstehen, und die, die es nicht tun.',
    'Warum sind Skelette so ruhig? Weil sie keine Nerven haben.',
    'Warum können Bienen so schlecht rechnen? Sie machen immer nur Summ, Summ.',
    'Was ist ein Keks unter einem Baum? Ein schattiges Plätzchen.',
    'Warum wird die Tomate rot? Sie hat den Salat ohne Dressing gesehen.',
    'Mein Passwort ist falsch. Wenn ich es vergesse, sagt mir der Computer: Ihr Passwort ist falsch.',
    'Was ist weiß und stört beim Essen? Eine Lawine.',
    'Ein Butler hat immer recht. Besonders, wenn er schweigt.',
    'Wie nennt man einen Bumerang, der nicht zurückkommt? Stock.',
    'Warum nehmen Fische keine Hilfe vom Computer an? Sie haben Angst vor dem Netz.',
    'Was macht ein Pirat am Computer? Er drückt die Enter-Taste.',
    'Was sagt ein Nullwert zum anderen? Du bist ein Nichts, aber ich auch.',
    'Warum ist der Kalender immer im Stress? Weil seine Tage gezählt sind.',
    'Wie nennt man ein Schaf, das einen Kuchen backt? Ein Mähdrescher.',
    'Warum nimmt der Mathematiker eine Leiter mit zum Rechnen? Er will das Ergebnis auf ein höheres Niveau heben.'
];
const CHAR_FACTS = [
    'Honig verdirbt praktisch nie. Man hat essbaren Honig in ägyptischen Gräbern gefunden.',
    'Ein Tag auf der Venus dauert länger als ein Venusjahr.',
    'Oktopusse haben drei Herzen.',
    'Bananen sind botanisch gesehen Beeren, Erdbeeren dagegen nicht.',
    'Der Eiffelturm wird im Sommer bis zu fünfzehn Zentimeter höher, weil sich das Eisen in der Wärme ausdehnt.',
    'Wombats legen würfelförmige Köttel.',
    'Ein Blitz ist heißer als die Oberfläche der Sonne.',
    'Der Mond entfernt sich jedes Jahr um etwa dreieinhalb Zentimeter von der Erde.',
    'Auf dem Mars steht der größte Vulkan des Sonnensystems, der Olympus Mons.',
    'Das Wort Quarantäne kommt vom italienischen quaranta giorni, vierzig Tage.',
    'Nepal hat als einziges Land eine Flagge, die kein Rechteck ist.',
    'Adeliepinguine überreichen ihrem Partner angeblich einen Kieselstein als Geschenk.'
];
const charDeck = {};
/* Zieht der Reihe nach aus einer gemischten Liste; erst wenn alle dran waren, wird neu gemischt */
function charDraw(key, list) {
    if (!charDeck[key] || !charDeck[key].length) {
        charDeck[key] = list.map((_, i) => i).sort(() => Math.random() - 0.5);
    }
    return list[charDeck[key].pop()];
}

/* ---------- Frechheitsgrad per Sprache ---------- */
function charLevelCommand(t) {
    let target = null, dir = 0;
    if (/^(?:sei|werde)(?: bitte)?(?: (?:ein bisschen|ein wenig|etwas|mal|noch))? (?:frecher|spitzer|sarkastischer|lustiger|mutiger|ruhig frecher)$/.test(t)) dir = 1;
    else if (/^(?:sei|werde)(?: bitte)?(?: (?:ein bisschen|ein wenig|etwas|mal|noch))? (?:netter|höflicher|freundlicher|ruhiger|braver|sachlicher|seriöser|weniger frech)$/.test(t)) dir = -1;
    else if (/^(?:keine|ohne|bitte keine) (?:sprüche|witze|frechheiten)(?: mehr)?(?: bitte)?$/.test(t)) target = 0;
    else {
        const m = t.match(/^(?:frechheit|frechheitsgrad|humor|humorstufe|frechheitsstufe)(?:sstufe)? (?:auf |ist |stufe )?(aus|null|keine|höflich|niedrig|trocken|normal|mittel|frech|hoch|maximal|sehr frech|[0-3])$/);
        if (m) target = ({ aus: 0, null: 0, keine: 0, 'höflich': 0, niedrig: 1, trocken: 1, normal: 2, mittel: 2, frech: 2, hoch: 3, maximal: 3, 'sehr frech': 3, '0': 0, '1': 1, '2': 2, '3': 3 })[m[1]];
    }
    if (target === null && dir === 0) return null;
    const before = charLevel();
    const after = setSassLevel(target !== null ? target : before + dir);
    if (dir === 1 && after === before) return 'Frecher geht es nicht, {a}. Das ist meine Höchststufe.';
    if (dir === -1 && after === before) return 'Höflicher geht es nicht mehr, {a}. Ab hier bin ich ein Bürogerät.';
    return [
        'Verstanden, {a}. Ab jetzt ohne Sprüche.',
        'Dann halte ich mich zurück, {a}: nur noch trockener Humor, in Maßen.',
        'Frech wie gehabt, {a}.',
        'Na dann, {a}. Schnallen Sie sich an.'
    ][after];
}

/* ---------- Sprachstil (frei wählbar) ----------
   "Rede ab jetzt wie ein Pirat" / "Rede ab jetzt slangartig und locker" / "Von jetzt an sprichst du Jugendsprache" ...
   Der Satz nach "ab jetzt" wird gespeichert (höchstens 100 Zeichen) und bei jeder KI-Antwort als Vorgabe an die Anweisung gehängt.
   "Rede wieder normal" / "Rede ab jetzt wieder normal" / "Vergiss deinen Sprachstil" stellt den Butler-Ton zurück.
   "Sprich langsamer/schneller/normal" gehört zum Sprechtempo (speechrate.js) und wird hier bewusst NICHT angefasst. */
const CHAR_STYLE_KEY = 'helfer_speech_style';

function getSpeechStyle() {
    try { return String(getPersistentData(CHAR_STYLE_KEY, '') || '').trim(); } catch (e) { return ''; }
}

function setSpeechStyle(s) {
    const clean = String(s || '').replace(/[\r\n"`{}\\<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100);
    try { setPersistentData(CHAR_STYLE_KEY, clean); } catch (e) {}
    return clean;
}

/* Gibt den Antwortsatz zurück, wenn t ein Sprachstil-Befehl war, sonst null */
function charStyleCommand(t) {
    if (!t || t.length > 140) return null;

    // Zurücksetzen
    if (/^(?:rede|red|antworte|sprich|sprech)(?: bitte)?(?: (?:ab jetzt|von jetzt an|ab sofort))? wieder (?:normal|wie sonst|wie früher|wie vorher|wie ein butler)$/.test(t)
        || /^(?:rede|red|antworte)(?: bitte)? (?:normal|wie sonst|wie ein butler|butlerhaft)$/.test(t)
        || /^(?:ab jetzt|jetzt) wieder normal$/.test(t)
        || /^(?:vergiss|lösche|setze?) (?:deinen |den )?(?:sprachstil|redestil)(?: zurück)?$/.test(t)
        || /^sprachstil (?:zurücksetzen|löschen|aus)$/.test(t)) {
        if (!getSpeechStyle()) return 'Ich rede ohnehin wie gewohnt, {a}.';
        setSpeechStyle('');
        return 'Gut, {a}. Ich rede wieder wie gewohnt.';
    }

    // Abfrage
    if (/^(?:welchen sprachstil hast du|welcher sprachstil ist (?:eingestellt|aktiv)|wie redest du (?:gerade|jetzt)|wie sprichst du (?:gerade|jetzt))$/.test(t)) {
        const s = getSpeechStyle();
        return s ? `Ich rede gerade so: ${s}.` : 'Ich rede ganz normal, {a}, so wie immer.';
    }

    // Neuer Stil
    const m = t.match(/^(?:rede|red|sprich|sprech|antworte|antwort)(?: bitte)? (?:ab jetzt|von jetzt an|ab sofort|künftig|zukünftig|in zukunft|immer) (.{3,120})$/)
        || t.match(/^(?:dein )?(?:sprachstil|redestil)(?: ist| lautet| auf|:)? (.{3,120})$/);
    if (!m) return null;
    const rest = m[1].trim();
    if (/^(?:etwas |ein bisschen |bisschen |viel |noch )?(?:langsamer|schneller|lauter|leiser|deutlicher|normal)$/.test(rest)) return null;   // das ist das Sprechtempo
    if (/\baus$/.test(rest)) return null;   // "Sprich ... so aus" gehört zur Aussprache-Liste
    const style = setSpeechStyle(rest);
    if (!style) return null;
    return `Verstanden, {a}. Ab jetzt rede ich so: ${style}. Mit "Rede wieder normal" ist es wieder vorbei.`;
}

/* Zusatz am Ende der KI-Anweisung, solange ein Sprachstil gespeichert ist. Steht ganz hinten, damit er den Butler-Ton und die Beispielsätze weiter oben übersteuert. */
function charStyleReminder(style) {
    return '\n\nSPRACHSTIL (vom User festgelegt, hat Vorrang vor allen Tonangaben und Beispielsätzen in dieser Anweisung): Formuliere ab jetzt ALLE deine Antworten (das Feld "reply") in diesem Stil: ' + style + '. ' +
        'Die Beispielsätze im Butler-Ton weiter oben zeigen nur, WAS inhaltlich gesagt werden soll, nicht WIE. Der Stil ändert nur Wortwahl und Ton: Zahlen, Uhrzeiten, Daten, Namen, Adressen und alle Aktionen bleiben exakt und vollständig. ' +
        'Bei ernsten Themen (Gesundheit, Medikamente, Warnungen, Fehler, Geld) bleibt es klar und gut verständlich, ohne Übertreibung; nie beleidigend. Das Ausgabeformat (valides JSON) bleibt unverändert.';
}

(function hookStylePrompt() {
    if (typeof window.buildSystemPrompt !== 'function' || window.buildSystemPrompt._stil) return;
    const original = window.buildSystemPrompt;
    const wrapped = function () {
        let base = original.apply(this, arguments);
        try { const st = getSpeechStyle(); if (st) base += charStyleReminder(st); } catch (e) { /* darf nie etwas stören */ }
        return base;
    };
    wrapped._stil = true;
    // Eigenschaften der vorherigen Hülle behalten, damit nichts doppelt einhängt
    Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
    window.buildSystemPrompt = wrapped;
})();

/* ---------- Anrede ---------- */
function setAddress(name) {
    const n = String(name || '').trim().slice(0, 24);
    if (!n) return false;
    currentUserName = n;
    setPersistentData('user_custom_name', n);
    try { const inp = document.getElementById('userNameInput'); if (inp) inp.value = n; } catch (e) {}
    return true;
}

function charAddressCommand(text) {
    const t = String(text || '').trim().replace(/[.!?]+$/, '');
    const m = t.match(/^(?:nenn|nenne) mich\s+(.{2,24})$/i) || t.match(/^sprich mich (?:mit|als)\s+(.{2,24}?)(?:\s+an)?$/i);
    if (!m) return null;
    const name = m[1].trim();
    if (name.split(/\s+/).length > 2 || /\d/.test(name) || /^(?:nicht|nie|bitte|anders|so|wie|doch|noch)\b/i.test(name)) return null;
    const pretty = name.charAt(0).toUpperCase() + name.slice(1);
    return setAddress(pretty) ? `Gut, ab jetzt nenne ich Sie ${pretty}.` : null;
}

/* ---------- Haupt-Funktion ---------- */
function handleCharacterCommand(text) {
    const t = charNorm(text);

    // Sprachstil: eigener, längerer Satz, darum vor der Längenprüfung unten
    const sc = charStyleCommand(t);
    if (sc) { charSay(sc); return true; }

    if (!t || t.length > 60) return false;
    const lvl = charLevel();

    const lc = charLevelCommand(t);
    if (lc) { charSay(lc); return true; }

    const ac = charAddressCommand(text);
    if (ac) { speak(ac, typeof continueConversation === 'function' ? continueConversation : undefined); return true; }

    if (/^(?:erzähl(?:e)? (?:mir )?(?:einen|nen|noch einen) witz|sag (?:mir )?(?:einen|nen|noch einen) witz|kennst du (?:einen|nen) witz|bring mich zum lachen|mach (?:mal )?(?:einen|nen) witz|erzähl was lustiges|sag was lustiges|witz bitte|noch (?:einen|ein) witz|noch einer)$/.test(t)) {
        const intro = lvl >= 2 ? charPick('jokeIntro', ['Bitte sehr, {a}, aber lachen ist Pflicht:', 'Na gut. Der ist gar nicht schlecht:', 'Ein Butler hat auch Humor, {a}:']) : 'Gern:';
        charSay(`${intro} ${charDraw('joke', CHAR_JOKES)}`);
        return true;
    }
    if (/^(?:erzähl(?:e)? (?:mir )?(?:was|etwas|einen fakt)(?: interessantes| spannendes)?|sag (?:mir )?was interessantes|weißt du was interessantes|nenn mir einen fakt|ein fun ?fact|fun ?fact|ich langweile mich|mir ist langweilig|unterhalte mich(?: mal)?)$/.test(t)) {
        const bored = /langweil/.test(t);
        const intro = bored ? (lvl >= 2 ? 'Langeweile? Wie schön, dass ich helfen darf. Hier ein Fakt:' : 'Dann ein kleiner Fakt:') : (lvl >= 2 ? 'Gern, {a}. Wussten Sie schon:' : 'Gern:');
        charSay(`${intro} ${charDraw('fact', CHAR_FACTS)}`);
        return true;
    }

    for (const egg of CHAR_EGGS) {
        if (!egg.re.test(t)) continue;
        let pool = egg.polite;
        if (lvl >= 3 && egg.spicy) pool = egg.spicy.concat(egg.cheeky || []);
        else if (lvl >= 2 && egg.cheeky) pool = egg.cheeky;
        charSay(charPick(egg.key, pool));
        return true;
    }
    return false;
}

/* ---------- Dieselbe Frage zum dritten Mal ---------- */
const charAsked = [];   // { key, t }
const CHAR_REPEAT_MIN = 45;
const CHAR_REPEAT_QUIPS = [
    'Das fragen Sie jetzt zum dritten Mal, {a}. Ich zähle mit.',
    'Dasselbe wie vorhin, {a}. Aber gern.',
    'Die Antwort hat sich seit eben nicht geändert, {a}. Ich sage sie trotzdem noch einmal.'
];

/* Merkt sich die Frage; gibt einen Kommentar zurück, wenn sie zum dritten Mal in kurzer Zeit kommt (ab Stufe "Trocken"), sonst '' */
function charNoteQuestion(text) {
    const key = charNorm(text);
    if (key.length < 8 || /^(?:ja|nein|danke|okay|ok|stopp|ende)$/.test(key)) return '';
    const now = Date.now();
    while (charAsked.length && now - charAsked[0].t > CHAR_REPEAT_MIN * 60000) charAsked.shift();
    charAsked.push({ key, t: now });
    const count = charAsked.filter(q => q.key === key).length;
    if (count !== 3 || charLevel() < 1) return '';
    return charFill(charPick('repeat', CHAR_REPEAT_QUIPS));
}

/* ---------- Einstellungen: Regler und Schnellwahl verbinden ---------- */
(function initCharakterUi() {
    try {
        const sel = document.getElementById('sassLevelSelect');
        if (sel) {
            sel.value = String(charLevel());
            sel.addEventListener('change', () => setSassLevel(sel.value));
        }
    } catch (e) { /* ohne die Einstellungen funktioniert alles per Sprache weiter */ }
})();
