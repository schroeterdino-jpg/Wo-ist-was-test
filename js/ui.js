/* ============================================================
   UI: DOM-Referenzen, Terminal-Zeile, HUD-Untertitel, Navigation
   Muss als ERSTE Datei geladen werden.
   ============================================================ */

if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(err => console.log('SW Fehler:', err));
    });
}

const recordBtn = document.getElementById('recordBtn');
const recordText = document.getElementById('recordText');
const statusMessage = document.getElementById('statusMessage');
const calendarList = document.getElementById('calendarList');
const todoList = document.getElementById('todoList');
const reminderList = document.getElementById('reminderList');
const shoppingList = document.getElementById('shoppingList');
const categoryContainer = document.getElementById('categoryContainer');

const googleClientIdInput = document.getElementById('googleClientIdInput');
const userNameInput = document.getElementById('userNameInput');
const userNameDisplay = document.getElementById('userNameDisplay');
const connectionStatus = document.getElementById('connectionStatus');

const contactNameInput = document.getElementById('contactNameInput');
const contactPhoneInput = document.getElementById('contactPhoneInput');
const contactListDisplay = document.getElementById('contactListDisplay');

/* --- Helper für Terminal Log Upgrade --- */
function updateTerminalStream(logMsg, statusMsg = null) {
    const logEl = document.getElementById('terminalLog');
    const statusEl = document.getElementById('terminalStatus');
    if (logEl && logMsg) logEl.textContent = logMsg;
    if (statusEl && statusMsg) statusEl.textContent = statusMsg;
}

/* --- Helper für Typewriter HUD Subtitle Upgrade --- */
let subtitleTypewriterTimeout = null;
function setHudSubtitle(text) {
    const el = document.getElementById('hudSubtitleText');
    if (!el) return;
    if (subtitleTypewriterTimeout) clearTimeout(subtitleTypewriterTimeout);

    el.textContent = '';
    let i = 0;

    function type() {
        if (i < text.length) {
            el.textContent += text.charAt(i);
            i++;
            subtitleTypewriterTimeout = setTimeout(type, 25);
        }
    }
    type();
}

let typewriterTimeout = null;
function typeWriterStatus(text) {
    const el = document.getElementById('statusMessage');
    if (!el) return;
    if (typewriterTimeout) clearTimeout(typewriterTimeout);

    el.textContent = '';
    let i = 0;

    function type() {
        if (i < text.length) {
            el.textContent += text.charAt(i);
            i++;
            typewriterTimeout = setTimeout(type, 20);
        }
    }
    type();
}

/* Die Reiter gibt es nicht mehr. Alles, was früher ein Reiter war, öffnet jetzt als Fenster (panels.js). */
function switchSection(sectionId) {
    const map = { speak: null, planner: 'planer', lists: 'einkauf', memory: 'gedaechtnis', settings: 'settings' };
    const panel = sectionId in map ? map[sectionId] : sectionId;
    if (!panel) { closePanel(); return; }
    openPanel(panel);
}

function toggleOverviewDetails() {
    const details = document.getElementById('overviewDetails');
    const icon = document.getElementById('overviewToggleIcon');
    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        icon.textContent = "▼ Klappen";
    } else {
        details.classList.add('hidden');
        icon.textContent = "▲ Zeigen";
    }
}

/* --- Start: Boot-Sound, Terminal-Meldung, erste Darstellung der Listen --- */
window.addEventListener('DOMContentLoaded', () => {
    playJarvisSound();
    updateTerminalStream("SYS_BOOT: COMPLETE", "ONLINE");
    renderAllLists();
    renderContactList();
});
