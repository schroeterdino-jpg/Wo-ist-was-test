/* ============================================================
   STIMM-KORREKTUR gegen doppelte Stimmen.
   Problem vorher: Startete eine neue Ansage (speak), während eine ältere noch lief - zum Beispiel die kurze
   Zwischenansage "Einen Moment" mit der Handy-Stimme - liefen beide gleichzeitig, sobald die neue Ansage die
   Cloud-Stimme nutzte (die Cloud-Stimme stoppte die Handy-Stimme nie).
   Jetzt: Jede neue Ansage beendet zuerst sofort jede laufende Handy-Stimme und jede laufende Cloud-Stimme.
   Außerdem gibt es keine Zwischenansage mehr, während Jarvis gerade selbst spricht.
   Braucht: voice.js (muss davor geladen sein). voice.js selbst bleibt unverändert.
   ============================================================ */
(function hookVoiceFix() {
    if (typeof speak === 'function') {
        const origSpeak = speak;
        speak = function (text, onComplete, langCode) {
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
