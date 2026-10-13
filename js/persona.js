/* ============================================================
   PERSONA: Charakter (frech, aber nie bei ernsten Themen), Zwischenansagen und Begrüßung
   Aus assistant.js herausgelöst, Code unverändert. Braucht: voice.js (speak, pickRandom) zur Laufzeit.
   ============================================================ */

/* ---------- Charakter: frech und schlagfertig, aber nie bei ernsten Themen ----------
   Nicht jede Antwort bekommt einen Spruch (sonst nutzt es sich ab): bei etwa 40 Prozent der Anfragen sagt die Stilvorgabe
   der KI, dass sie einen Spruch anbringen soll, sonst bleibt sie knapp und sachlich. Bei ernsten oder heiklen Themen
   gibt es nie einen Spruch - das entscheidet hier der Code, nicht die KI. */
const SERIOUS_TOPIC_RE = /(tablette|medikament|\b(?:arzt|ärztin|hausarzt|hausärztin)\b|krank|schmerz|notfall|krankenhaus|unfall|traurig|trauer|sorge|angst|stress|dringend|verstorben|beerdigung|mahnung|anwalt|polizei|e-?mail|\bmail\b)/i;

/* Frechheitsgrad, einstellbar (Einstellungen > Charakter oder per Sprache "Sei frecher"): 0 höflich, 1 trocken, 2 frech (Standard), 3 sehr frech.
   Die Wahrscheinlichkeit sagt, bei wie vielen harmlosen Anfragen ein Spruch angebracht wird. */
const SASS_LEVELS = [
    { name: 'Höflich', chance: 0 },
    { name: 'Trocken', chance: 0.25 },
    { name: 'Frech', chance: 0.6 },
    { name: 'Sehr frech', chance: 0.95 }
];
const SASS_LEVEL_KEY = 'helfer_sass_level';

function sassLevel() {
    const v = Number(getPersistentData(SASS_LEVEL_KEY, '2'));
    return (Number.isInteger(v) && v >= 0 && v <= 3) ? v : 2;
}
function sassChance() { return SASS_LEVELS[sassLevel()].chance; }
function setSassLevel(n) {
    const v = Math.max(0, Math.min(3, Math.round(Number(n))));
    setPersistentData(SASS_LEVEL_KEY, String(isNaN(v) ? 2 : v));
    try { const sel = document.getElementById('sassLevelSelect'); if (sel) sel.value = String(sassLevel()); } catch (e) {}
    return sassLevel();
}

/* Nach so vielen Millisekunden Wartezeit sagt Jarvis "Einen Moment". Früher 1,5 Sekunden (ACK_DELAY_MS in voice.js): da lief die Zwischenansage
   oft gerade an, wenn die Antwort kam, und wurde mitten im Wort abgeschnitten. Mit 3 Sekunden fällt sie bei normalen Fragen ganz weg. */
const ACK_START_MS = 3000;

const SERVILE_BAN = ' Vermeide Unterwürfigkeit und Floskeln wie "Sehr wohl", "Sehr gerne", "Zu Diensten", "Gern geschehen" oder "Natürlich": komm direkt zur Sache.';

function sassHintFor(text) {
    if (SERIOUS_TOPIC_RE.test(String(text || ''))) {
        return 'Kein Spruch. Das Thema ist ernst oder heikel: antworte klar, freundlich und knapp, ohne Witz.';
    }
    const level = sassLevel();
    if (level === 0) return 'Kein Spruch und kein Witz: antworte freundlich, höflich und sachlich.';
    if (Math.random() < sassChance()) {
        if (level === 1) return 'Bring diesmal höchstens einen ganz trockenen, feinen Zusatz an (ein Halbsatz), nach der eigentlichen Antwort.';
        if (level === 3) return 'Bring in DIESER Antwort einen richtig spitzen, sarkastischen Seitenhieb an, nach der Information; ruhig deutlich, aber nie verletzend.' + SERVILE_BAN;
        return 'Bring in DIESER Antwort einen spürbar frechen oder trockenen Seitenhieb an (ein pointierter Zusatzsatz), nach der Information.' + SERVILE_BAN;
    }
    return level >= 2
        ? 'Antworte diesmal knapp und sachlich, ohne Spruch.' + SERVILE_BAN
        : 'Antworte diesmal knapp und sachlich, ohne Spruch.';
}

/* Tonfall-Block für die KI-Anweisung (prompt.js): geht allen Tonangaben dort vor. Ohne ihn würde die Grundanweisung
   ("britischer Butler, zieht den User freundlich auf") jede Einstellung überdecken. */
function personaOverlay() {
    const lvl = sassLevel();
    const tabu = ' Bei ernsten Themen (siehe TABU unten) bleibt es immer klar, freundlich und ohne Witz.';
    if (lvl === 0) return 'TONFALL-STUFE (vom User eingestellt, geht allen Tonangaben dieser Anweisung vor): HÖFLICH. Antworte freundlich, warm, höflich und sachlich. Keine Sprüche, kein Sarkasmus, keine Neckereien, keine Witze.\n\n';
    if (lvl === 1) return 'TONFALL-STUFE (vom User eingestellt, geht allen Tonangaben dieser Anweisung vor): TROCKEN. Antworte höflich und sachlich; nur gelegentlich ein trockener, feiner Halbsatz. Keine Neckereien.' + tabu + '\n\n';
    if (lvl === 2) return 'TONFALL-STUFE (vom User eingestellt, geht allen Tonangaben dieser Anweisung vor): FRECH. Du bist spürbar frech und schlagfertig: Bei harmlosen Anliegen gehört zu etwa jeder zweiten Antwort ein pointierter Seitenhieb. Keine Schleimerei: Starte nie mit Floskeln wie "Sehr wohl", "Sehr gerne", "Zu Diensten" oder "Natürlich"; nenne zuerst die Information und würze danach.' + tabu + '\n\n';
    return 'TONFALL-STUFE (vom User eingestellt, geht allen Tonangaben dieser Anweisung vor): SEHR FRECH, die schärfste Stufe. Du bist der sarkastische Film-Jarvis in Reinform: respektlos-charmant, ironisch überlegen, gespielt genervt, mit spitzen Seitenhieben und trockenem Sarkasmus, bei harmlosen Anliegen in nahezu jeder Antwort. KEINE Schleimerei und keine Unterwürfigkeit: Floskeln wie "Sehr wohl", "Sehr gerne", "Zu Diensten", "Gern geschehen" und "Natürlich" sind verboten; nenne zuerst die Information und lege dann nach. Du darfst den User ordentlich aufziehen (Vergesslichkeit, Umständlichkeit, Eile, Wetterfühligkeit), aber nie beleidigend: nie über Aussehen, Familie, Herkunft, Religion, Politik, Gesundheit oder Geld, kein Fluchen. So scharf darf es klingen (nur als Gefühl, nicht wörtlich übernehmen): "Milch steht auf der Liste. Der Kühlschrank ist erleichtert, ich auch." / "Zahnarzt, Dienstag um neun. Nehmen Sie ein Buch mit, ich sage es nur ungern." / "Es ist 14 Uhr 12. Die Armbanduhr hat offenbar Urlaub."' + tabu + '\n\n';
}

/* Zwischenansagen ("Einen Moment"): meist neutral, bei harmlosen Anfragen gelegentlich frech */
function ackPhrasesFor(text) {
    const neutral = ["Einen Moment.", "Einen Augenblick.", "Ich denke nach.", "Moment.", "Sofort.", "Verstanden."];
    const cheeky = ["Gleich. Ein Butler hetzt nicht.", "Moment, Genialität braucht Zeit.", "Ich arbeite daran, bitte staunen Sie leise.", "Einen Augenblick, ich will es ja richtig machen."];
    if (!SERIOUS_TOPIC_RE.test(String(text || '')) && Math.random() < sassChance()) return cheeky;
    return neutral;
}

/* ---------- Begrüßung: "Hallo Jarvis", "Guten Abend", "Na Jarvis" ----------
   Beantwortet J.A.R.V.I.S. selbst, ohne Umweg über die KI: sofort, ohne "Einen Moment" und mit der Anrede,
   die wirklich zur Uhrzeit passt (die KI hat nachts manchmal "Guten Tag" gesagt). */
function isGreetingOnly(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 30) return false;
    return /^(?:(?:na|hey|hi|hallo|moin|servus|guten morgen|guten tag|guten abend)\s*)+(?:jarvis)?$/.test(t) || t === 'jarvis';
}

function greetingForHour(hour) {
    if (hour >= 5 && hour < 11) return 'Guten Morgen';
    if (hour >= 11 && hour < 18) return 'Guten Tag';
    if (hour >= 18 && hour < 23) return 'Guten Abend';
    return pickRandom(['Noch wach?', 'Auch so spät noch auf?']);   // nachts: kein "Guten Tag" und kein "Gute Nacht" zur Begrüßung
}

function handleGreeting(text) {
    if (!isGreetingOnly(text)) return false;
    const hour = parseInt(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false }), 10);
    const greet = greetingForHour(isNaN(hour) ? new Date().getHours() : hour);
    const politeClosings = ['Wie kann ich helfen?', 'Was kann ich für Sie tun?', 'Ich höre.', 'Womit kann ich dienen?', 'Womit darf ich Ihren Tag verbessern?', 'Schön, dass Sie an mich denken.'];
    const cheekyClosings = ['Na, wieder Sehnsucht nach meinem Charme?', 'Ich war schon fast eingeschlafen. Also, was gibt es?'];
    const closing = pickRandom(sassLevel() >= 2 ? politeClosings.concat(cheekyClosings) : politeClosings);
    const named = Math.random() < 0.33 && !/[?]$/.test(greet);
    speak(`${greet}${named ? ', ' + currentUserName : ''}. ${closing}`.replace('?.', '?'), continueConversation);
    return true;
}
