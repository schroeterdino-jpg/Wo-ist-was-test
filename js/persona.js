/* ============================================================
   PERSONA: Charakter (frech, aber nie bei ernsten Themen), Zwischenansagen und Begrüßung
   Aus assistant.js herausgelöst, Code unverändert. Braucht: voice.js (speak, pickRandom) zur Laufzeit.
   ============================================================ */

/* ---------- Charakter: frech und schlagfertig, aber nie bei ernsten Themen ----------
   Nicht jede Antwort bekommt einen Spruch (sonst nutzt es sich ab): bei etwa 40 Prozent der Anfragen sagt die Stilvorgabe
   der KI, dass sie einen Spruch anbringen soll, sonst bleibt sie knapp und sachlich. Bei ernsten oder heiklen Themen
   gibt es nie einen Spruch - das entscheidet hier der Code, nicht die KI. */
const SERIOUS_TOPIC_RE = /(tablette|medikament|arzt|ärztin|krank|schmerz|notfall|krankenhaus|unfall|traurig|trauer|sorge|angst|stress|wichtig|dringend|hilfe|fehler|problem|funktioniert nicht|geht nicht|kaputt|verstorben|beerdigung|geld|konto|rechnung|mahnung|anwalt|polizei|e-?mail|\bmail\b|nachricht)/i;
const SASS_CHANCE = 0.4;

/* Nach so vielen Millisekunden Wartezeit sagt Jarvis "Einen Moment". Früher 1,5 Sekunden (ACK_DELAY_MS in voice.js): da lief die Zwischenansage
   oft gerade an, wenn die Antwort kam, und wurde mitten im Wort abgeschnitten. Mit 3 Sekunden fällt sie bei normalen Fragen ganz weg. */
const ACK_START_MS = 3000;

function sassHintFor(text) {
    if (SERIOUS_TOPIC_RE.test(String(text || ''))) {
        return 'Kein Spruch. Das Thema ist ernst oder heikel: antworte klar, freundlich und knapp, ohne Witz.';
    }
    if (Math.random() < SASS_CHANCE) {
        return 'Bring diesmal einen kurzen, frechen oder trockenen Spruch an (ein pointierter Zusatzsatz oder eine spitze Formulierung), nach der eigentlichen Antwort.';
    }
    return 'Antworte diesmal knapp und sachlich, ohne Spruch.';
}

/* Zwischenansagen ("Einen Moment"): meist neutral, bei harmlosen Anfragen gelegentlich frech */
function ackPhrasesFor(text) {
    const neutral = ["Einen Moment.", "Einen Augenblick.", "Ich denke nach.", "Moment.", "Sofort.", "Verstanden."];
    const cheeky = ["Gleich. Ein Butler hetzt nicht.", "Moment, Genialität braucht Zeit.", "Ich arbeite daran, bitte staunen Sie leise.", "Einen Augenblick, ich will es ja richtig machen."];
    if (!SERIOUS_TOPIC_RE.test(String(text || '')) && Math.random() < SASS_CHANCE) return cheeky;
    return neutral;
}

/* ---------- Begrüßung: "Hallo Jarvis", "Guten Abend", "Na Jarvis" ----------
   Beantwortet J.A.R.V.I.S. selbst, ohne Umweg über die KI: sofort, ohne "Einen Moment" und mit der Anrede,
   die wirklich zur Uhrzeit passt (die KI hat nachts manchmal "Guten Tag" gesagt). */
function isGreetingOnly(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 30) return false;
    return /^(?:(?:na|hey|hi|hallo|moin|servus|guten morgen|guten tag|guten abend|gute nacht)\s*)+(?:jarvis)?$/.test(t) || t === 'jarvis';
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
    const closing = pickRandom(['Wie kann ich helfen?', 'Was kann ich für Sie tun?', 'Ich höre.', 'Womit kann ich dienen?', 'Womit darf ich Ihren Tag verbessern?', 'Na, wieder Sehnsucht nach meinem Charme?', 'Schön, dass Sie an mich denken.', 'Ich war schon fast eingeschlafen. Also, was gibt es?']);
    const named = Math.random() < 0.33 && !/[?]$/.test(greet);
    speak(`${greet}${named ? ', ' + currentUserName : ''}. ${closing}`.replace('?.', '?'), continueConversation);
    return true;
}
