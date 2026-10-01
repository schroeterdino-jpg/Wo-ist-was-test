/* ============================================================
   STIMM-KORREKTUR gegen doppelte Stimmen.
   Problem vorher: Startete eine neue Ansage (speak), während eine ältere noch lief - zum Beispiel die kurze
   Zwischenansage "Einen Moment" mit der Handy-Stimme - liefen beide gleichzeitig, sobald die neue Ansage die
   Cloud-Stimme nutzte (die Cloud-Stimme stoppte die Handy-Stimme nie).
   Jetzt: Jede neue Ansage beendet zuerst sofort jede laufende Handy-Stimme und jede laufende Cloud-Stimme.
   Außerdem gibt es keine Zwischenansage mehr, während Jarvis gerade selbst spricht.
   Braucht: voice.js (muss davor geladen sein). voice.js selbst bleibt unverändert.
   ============================================================ */
/* --- Grammatik bei Straßennamen ---
   Straßennamen auf -ring, -weg, -platz ... sind männlich/sächlich ("der Hans-Dewitz-Ring"): richtig ist "im Hans-Dewitz-Ring",
   nicht "in der Hans-Dewitz-Ring". Das passiert der KI manchmal; diese Korrektur greift, bevor etwas gesprochen oder angezeigt wird.
   Namen auf -straße, -allee, -gasse ... sind weiblich ("in der Hauptstraße") und bleiben unberührt. */
const MASCULINE_STREET_END = /(ring|weg|platz|damm|markt|steig|stieg|pfad|hof|garten|park|berg|kamp|bogen|graben|wall|deich|ufer)$/i;

function fixStreetGrammar(text) {
    const re = /\b([Ii]n|[Aa]n|[Aa]uf|[Bb]ei|[Zz]u|[Vv]on)\s+([Dd]er|[Dd]ie)\s+((?:[A-ZÄÖÜ][\wäöüßÄÖÜ-]*\s+){0,2}[A-ZÄÖÜ][\wäöüßÄÖÜ-]*)/g;
    return String(text).replace(re, (m, prep, art, rest) => {
        const tokens = rest.split(/\s+/);
        if (!tokens.some(tk => MASCULINE_STREET_END.test(tk.replace(/[.,;:!?]+$/, '')))) return m;   // kein Straßenname dieser Art
        const p = prep.toLowerCase();
        let fixed = null;
        if (art.toLowerCase() === 'der') {          // falscher Dativ: "in der Ring" -> "im Ring"
            fixed = { in: 'im', an: 'am', bei: 'beim', zu: 'zum', von: 'vom', auf: 'auf dem' }[p];
        } else {                                    // falscher Akkusativ: "in die Ring" -> "in den Ring"
            fixed = { in: 'in den', an: 'an den', auf: 'auf den' }[p];
        }
        if (!fixed) return m;
        if (prep[0] === prep[0].toUpperCase()) fixed = fixed[0].toUpperCase() + fixed.slice(1);
        return `${fixed} ${rest}`;
    });
}

(function hookVoiceFix() {
    if (typeof speak === 'function') {
        const origSpeak = speak;
        speak = function (text, onComplete, langCode) {
            if (typeof text === 'string') text = fixStreetGrammar(text);
            try {
                if (typeof currentAudio !== 'undefined' && currentAudio) {
                    try { currentAudio.pause(); } catch (e) {}
                    currentAudio = null;
                }
                if ('speechSynthesis' in window && (
                    (typeof currentUtterance !== 'undefined' && currentUtterance) ||
                    window.speechSynthesis.speaking || window.speechSynthesis.pending)) {
                    // Erst vergessen, dann abbrechen: so räumt der alte Abbruch die Anzeige nicht zwischendurch auf
                    if (typeof currentUtterance !== 'undefined') currentUtterance = null;
                    window.speechSynthesis.cancel();
                }
            } catch (e) { /* die Korrektur darf das Sprechen nie verhindern */ }
            return origSpeak.call(this, text, onComplete, langCode);
        };
    }
    if (typeof speakAck === 'function') {
        const origAck = speakAck;
        speakAck = function (text, onComplete) {
            if (typeof isSpeaking === 'function' && isSpeaking()) { if (onComplete) onComplete(); return; }
            return origAck.call(this, text, onComplete);
        };
    }
})();
