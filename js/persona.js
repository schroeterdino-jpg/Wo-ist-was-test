/* ============================================================
   PERSONA: Charakter (frech, aber nie bei ernsten Themen), Zwischenansagen und Begrüßung
   Aus assistant.js herausgelöst, Code unverändert. Braucht: voice.js (speak, pickRandom) zur Laufzeit.
   ============================================================ */

/* ---------- Charakter: frech und schlagfertig, aber nie bei ernsten Themen ----------
   Nicht jede Antwort bekommt einen Spruch (sonst nutzt es sich ab): bei etwa 40 Prozent der Anfragen sagt die Stilvorgabe
   der KI, dass sie einen Spruch anbringen soll, sonst bleibt sie knapp und sachlich. Bei ernsten oder heiklen Themen
   gibt es nie einen Spruch - das entscheidet hier der Code, nicht die KI. */
const SERIOUS_TOPIC_RE = /(tablette|medikament|arzt|ärztin|krank|schmerz|notfall|krankenhaus|unfall|traurig|trauer|sorge|angst|stress|wichtig|dringend|hilfe|fehler|problem|funktioniert nicht|geht nicht|kaputt|verstorben|beerdigung|geld|konto|rechnung|mahnung|anwalt|polizei|e-?mail|\bmail\b|nachricht)/i;

/* Frechheitsgrad, einstellbar (Einstellungen > Charakter oder per Sprache "Sei frecher"): 0 höflich, 1 trocken, 2 frech (Standard), 3 sehr frech.
   Die Wahrscheinlichkeit sagt, bei wie vielen harmlosen Anfragen ein Spruch angebracht wird. */
const SASS_LEVELS = [
    { name: 'Höflich', chance: 0 },
    { name: 'Trocken', chance: 0.2 },
    { name: 'Frech', chance: 0.4 },
    { name: 'Sehr frech', chance: 0.7 }
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

function sassHintFor(text) {
    if (SERIOUS_TOPIC_RE.test(String(text || ''))) {
        return 'Kein Spruch. Das Thema ist ernst oder heikel: antworte klar, freundlich und knapp, ohne Witz.';
    }
    const level = sassLevel();
    if (level === 0) return 'Kein Spruch und kein Witz: antworte freundlich, höflich und sachlich.';
    if (Math.random() < sassChance()) {
        if (level === 1) return 'Bring diesmal höchstens einen ganz trockenen, feinen Zusatz an (ein Halbsatz), nach der eigentlichen Antwort.';
        if (level === 3) return 'Bring diesmal einen richtig spitzen, sarkastischen Spruch an (pointiert, nie verletzend, nie über Familie, Gesundheit oder Geld), nach der eigentlichen Antwort.';
        return 'Bring diesmal einen kurzen, frechen oder trockenen Spruch an (ein pointierter Zusatzsatz oder eine spitze Formulierung), nach der eigentlichen Antwort.';
    }
    return 'Antworte diesmal knapp und sachlich, ohne Spruch.';
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
