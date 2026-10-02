/* ============================================================
   BEGRÜSSUNG BEIM ÖFFNEN: Beim Start der App sagt Jarvis kurz etwas wie "Guten Morgen, Sir. Alle Systeme sind bereit."
   - Passend zur Uhrzeit (Morgen / Tag / Abend; nachts "Noch wach?"), mit gelegentlich frechem Zusatz.
   - Nur beim echten Start der App (neu geladen), nicht beim Zurückwechseln von einer anderen App.
   - In den Einstellungen unter "Stimme & Gespräch" abschaltbar.
   - Chrome erlaubt Ton ohne vorheriges Antippen nur bei Apps, die auf dem Startbildschirm installiert sind. Blockiert dein Handy es, bleibt Jarvis
     still (der Gruß erscheint nur als Text unter der Kugel).
   Braucht: storage.js, voice.js (speak, pickRandom, isSpeaking). Läuft nach dem Laden der Seite selbst.
   ============================================================ */

const STARTUP_GREETING_KEY = 'helfer_startup_greeting';
const STARTUP_GREETING_DELAY_MS = 1500;   // kurz warten, bis die App und die Stimmen bereit sind

function isStartupGreetingEnabled() {
    return getPersistentData(STARTUP_GREETING_KEY, '1') !== '0';
}

function setStartupGreeting(on) {
    setPersistentData(STARTUP_GREETING_KEY, on ? '1' : '0');
}

/* Der Gruß als Text; 'hour' (0-23) und 'name' werden mitgegeben, damit sich das gut prüfen lässt */
function buildStartupGreeting(hour, name) {
    const who = name ? `, ${name}` : '';
    const closing = pickRandom([
        'Alle Systeme sind bereit.', 'Alle Systeme sind bereit.', 'Alle Systeme sind bereit.',
        'Sämtliche Systeme sind einsatzbereit.', 'Alle Systeme laufen.',
        'Alle Systeme sind bereit. Ich hoffe, Sie sind es auch.', 'Alle Systeme laufen. Beeindruckend, ich weiß.', 'Alle Systeme sind bereit. Ich habe schon gewartet.'
    ]);
    if (hour >= 5 && hour < 11) return `Guten Morgen${who}. ${closing}`;
    if (hour >= 11 && hour < 18) return `Guten Tag${who}. ${closing}`;
    if (hour >= 18 && hour < 23) return `Guten Abend${who}. ${closing}`;
    return pickRandom([`Noch wach${who}? ${closing}`, `Auch so spät noch auf${who}? ${closing}`]);
}

function runStartupGreeting() {
    try {
        if (!isStartupGreetingEnabled()) return;
        if (typeof document !== 'undefined' && document.hidden) return;   // App wurde im Hintergrund gestartet: nicht losreden
        if (typeof isProcessing !== 'undefined' && isProcessing) return;
        if (typeof isRecording !== 'undefined' && isRecording) return;
        if (typeof isSpeaking === 'function' && isSpeaking()) return;
        const hour = parseInt(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false }), 10);
        speak(buildStartupGreeting(isNaN(hour) ? new Date().getHours() : hour, (typeof currentUserName !== 'undefined') ? currentUserName : ''));
    } catch (e) { /* der Gruß ist Zugabe und darf den Start der App nie stören */ }
}

(function initStartupGreeting() {
    try {
        const toggle = document.getElementById('startupGreetingToggle');
        if (toggle) toggle.checked = isStartupGreetingEnabled();
        const go = () => setTimeout(runStartupGreeting, STARTUP_GREETING_DELAY_MS);
        if (document.readyState === 'complete') go();
        else window.addEventListener('load', go, { once: true });
    } catch (e) { /* der Gruß darf das Laden der App nie stören */ }
})();
