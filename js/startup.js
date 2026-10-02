/* ============================================================
   BEGRÜSSUNG BEIM ÖFFNEN: Beim Start der App sagt Jarvis kurz etwas wie "Guten Morgen, Sir. Alle Systeme sind bereit."
   - Passend zur Uhrzeit (Morgen / Tag / Abend; nachts "Noch wach?"), mit gelegentlich frechem Zusatz.
   - Nur beim echten Start der App (neu geladen), nicht beim Zurückwechseln von einer anderen App.
   - In den Einstellungen unter "Stimme & Gespräch" abschaltbar.
   - Chrome erlaubt Ton ohne vorheriges Antippen oft nicht. Darum prüft die App beim Start, ob Ton erlaubt ist: wenn ja, grüßt Jarvis sofort;
     wenn nein, erscheint ein Startbildschirm "Tippen zum Starten", und der Gruß wird beim Antippen gesprochen (das schaltet den Ton auch für den Rest der Sitzung frei).
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

/* Darf die Seite jetzt schon Ton abspielen? Chrome startet den Audio-Kontext nur dann "running", wenn Ton ohne Antippen erlaubt ist
   (oder man schon etwas angetippt hat); sonst bleibt er "suspended". */
function autoplayLooksAllowed() {
    try {
        if (navigator.userActivation && navigator.userActivation.hasBeenActive) return true;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        const ctx = new AC();
        const running = ctx.state === 'running';
        try { if (ctx.close) ctx.close(); } catch (e) {}
        return running;
    } catch (e) {
        return false;
    }
}

/* Dezenter Startbildschirm: ein Tipp irgendwo spricht den Gruß und schaltet den Ton frei */
function showStartOverlay() {
    try {
        if (document.getElementById('startOverlay')) return;
        const style = document.createElement('style');
        style.id = 'startOverlayStyle';
        style.textContent = '#startOverlay{position:fixed;inset:0;z-index:120;display:flex;align-items:flex-end;justify-content:center;padding-bottom:16vh;' +
            'background:rgba(2,5,10,.35);color:#49d7ff;font:600 14px "IBM Plex Mono",monospace;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;' +
            '-webkit-tap-highlight-color:transparent;transition:opacity .35s ease}#startOverlay.out{opacity:0}' +
            '#startOverlay span{padding:10px 22px;border:1px solid rgba(73,215,255,.45);border-radius:999px;background:rgba(10,22,33,.85);text-shadow:0 0 8px rgba(73,215,255,.6)}' +
            '@media (prefers-reduced-motion:no-preference){#startOverlay span{animation:startPulse 2.2s ease-in-out infinite}}' +
            '@keyframes startPulse{0%,100%{opacity:.55}50%{opacity:1}}';
        document.head.appendChild(style);
        const el = document.createElement('div');
        el.id = 'startOverlay';
        el.setAttribute('role', 'button');
        el.setAttribute('aria-label', 'Tippen zum Starten');
        el.innerHTML = '<span>J.A.R.V.I.S. · Tippen zum Starten</span>';
        let used = false;
        el.addEventListener('click', () => {
            if (used) return;
            used = true;
            el.classList.add('out');
            setTimeout(() => { try { el.remove(); style.remove(); } catch (e) {} }, 400);
            runStartupGreeting();   // direkt im Fingertipp: jetzt darf Chrome den Ton abspielen
        });
        document.body.appendChild(el);
    } catch (e) { /* ohne Startbildschirm läuft die App ganz normal weiter */ }
}

function startupGreetingOrOverlay() {
    try {
        if (!isStartupGreetingEnabled()) return;
        if (typeof document !== 'undefined' && document.hidden) return;
        if (autoplayLooksAllowed()) runStartupGreeting();
        else showStartOverlay();
    } catch (e) {}
}

(function initStartupGreeting() {
    try {
        const toggle = document.getElementById('startupGreetingToggle');
        if (toggle) toggle.checked = isStartupGreetingEnabled();
        const go = () => setTimeout(startupGreetingOrOverlay, STARTUP_GREETING_DELAY_MS);
        if (document.readyState === 'complete') go();
        else window.addEventListener('load', go, { once: true });
    } catch (e) { /* der Gruß darf das Laden der App nie stören */ }
})();
