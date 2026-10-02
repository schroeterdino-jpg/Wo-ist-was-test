/* ============================================================
   SPRECHTEMPO: Wie schnell Jarvis spricht, einstellbar in den Einstellungen (Regler "Sprechtempo")
   oder per Sprache: "Sprich langsamer", "Sprich schneller", "Sprich normal".
   Wirkt auf beide Stimmen, ohne voice.js anzufassen:
   - Cloud-Stimme (OpenAI/Edge): Das <audio>-Element der Sprachausgabe wird mit angepasster Abspielgeschwindigkeit angelegt
     (die Tonhöhe bleibt gleich, die Stimme klingt also nicht verzerrt).
   - Handy-Stimme: speechSynthesis.speak() bekommt vor dem Sprechen das Tempo aufgerechnet.
   Braucht: storage.js (getPersistentData/setPersistentData), voice.js (speak). Wird von localcommands.js aufgerufen.
   ============================================================ */

const SPEECH_RATE_KEY = 'helfer_speech_rate';
const SPEECH_RATE_MIN = 0.7;
const SPEECH_RATE_MAX = 1.4;
const SPEECH_RATE_STEP = 0.15;   // so viel ändert "langsamer"/"schneller" pro Sprachbefehl

function getSpeechRateFactor() {
    const v = Number(getPersistentData(SPEECH_RATE_KEY, '1'));
    return (v >= SPEECH_RATE_MIN && v <= SPEECH_RATE_MAX) ? v : 1;
}

function speechRateLabel(v) {
    const word = v < 0.9 ? 'langsam' : v > 1.1 ? 'schnell' : 'normal';
    return `${word} (${String(v.toFixed(2)).replace('.', ',')}×)`;
}

/* Wert setzen (aus dem Regler oder dem Sprachbefehl); gibt den gespeicherten Wert zurück */
function setSpeechRate(value) {
    let v = Number(value);
    if (isNaN(v)) v = 1;
    v = Math.min(SPEECH_RATE_MAX, Math.max(SPEECH_RATE_MIN, Math.round(v * 20) / 20));   // auf 0,05 genau
    setPersistentData(SPEECH_RATE_KEY, String(v));
    updateSpeechRateUi();
    return v;
}

function updateSpeechRateUi() {
    const v = getSpeechRateFactor();
    const slider = document.getElementById('speechRateSlider');
    const label = document.getElementById('speechRateValue');
    if (slider && Number(slider.value) !== v) slider.value = String(v);
    if (label) label.textContent = speechRateLabel(v);
}

function testSpeechRate() {
    speak('So spreche ich jetzt. Ganz gemütlich, oder wie es Ihnen gefällt.');
}

/* "Sprich langsamer" / "Sprich schneller" / "Etwas langsamer bitte" / "Nicht so schnell" / "Sprich normal" / "Sprechtempo normal".
   Gibt true zurück, wenn der Satz hier behandelt wurde. */
function handleSpeechRateCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 50) return false;
    const aboutSpeech = /\b(spr(?:ich|ech)\w*|rede|reden|red|sag|sprechtempo|tempo|sprechgeschwindigkeit)\b/.test(t);
    const bare = /^(?:bitte\s+)?(?:etwas\s+|ein bisschen\s+|ein wenig\s+)?(?:langsamer|schneller)(?:\s+bitte)?$/.test(t) || /^nicht so (?:schnell|langsam)(?:\s+bitte)?$/.test(t);
    if (!aboutSpeech && !bare) return false;

    const current = getSpeechRateFactor();
    let next = null;
    if (/\bnicht so langsam\b/.test(t)) next = current + SPEECH_RATE_STEP;
    else if (/\bnicht so schnell\b/.test(t) || /\blangsamer\b/.test(t) || /\blangsam\b/.test(t)) next = current - SPEECH_RATE_STEP;
    else if (/\bschneller\b/.test(t) || /\bschnell\b/.test(t)) next = current + SPEECH_RATE_STEP;
    else if (/\bnormal\w*\b|\bstandard\b|\bzurücksetzen\b/.test(t)) next = 1;
    if (next === null) return false;
    // "Sprich nicht so langsam/schnell" und Tempo-Wörter müssen eindeutig sein, sonst lieber die KI fragen lassen
    if (/\blangsamer\b/.test(t) && /\bschneller\b/.test(t)) return false;

    const was = current;
    const now = setSpeechRate(next);
    let msg;
    if (now === was) msg = next < was ? 'Langsamer geht es nicht, das ist mein Minimum.' : 'Schneller geht es nicht, das ist mein Maximum.';
    else if (next === 1) msg = 'Wieder im normalen Tempo.';
    else msg = now < was ? 'Gerne, ich spreche jetzt langsamer. So besser?' : 'Gerne, ich spreche jetzt schneller. So besser?';
    speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    return true;
}

/* ---------- Einklinken in die beiden Stimmen ---------- */
(function hookSpeechRate() {
    // Handy-Stimme: Tempo vor dem Sprechen aufrechnen
    try {
        if ('speechSynthesis' in window && window.speechSynthesis && typeof window.speechSynthesis.speak === 'function') {
            const synth = window.speechSynthesis;
            const origSpeak = synth.speak.bind(synth);
            synth.speak = function (utterance) {
                try { if (utterance) utterance.rate = Math.min(2, Math.max(0.5, (utterance.rate || 1) * getSpeechRateFactor())); } catch (e) {}
                return origSpeak(utterance);
            };
        }
    } catch (e) { /* ohne diese Anpassung spricht die Handy-Stimme einfach im normalen Tempo */ }

    // Cloud-Stimme: nur die aus dem Server geholten Sprach-Dateien (blob:), nicht andere Töne
    try {
        if (typeof window.Audio === 'function') {
            const NativeAudio = window.Audio;
            const WrappedAudio = function (src) {
                const a = arguments.length ? new NativeAudio(src) : new NativeAudio();
                try {
                    if (typeof src === 'string' && src.indexOf('blob:') === 0) {
                        const rate = getSpeechRateFactor();
                        a.defaultPlaybackRate = rate;   // bleibt auch beim Laden der Datei erhalten
                        a.playbackRate = rate;
                        a.preservesPitch = true;        // Tonhöhe bleibt, nur das Tempo ändert sich
                        a.webkitPreservesPitch = true;
                    }
                } catch (e) {}
                return a;
            };
            WrappedAudio.prototype = NativeAudio.prototype;
            window.Audio = WrappedAudio;
        }
    } catch (e) { /* dito: dann gilt das normale Tempo */ }
})();

try { updateSpeechRateUi(); } catch (e) {}
