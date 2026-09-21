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

function switchSection(sectionId) {
    const sections = ['speak', 'planner', 'lists', 'memory', 'settings'];
    sections.forEach(s => {
        const el = document.getElementById(`sec-${s}`);
        if (el) el.classList.add('hidden');
        const navBtn = document.getElementById(`nav${s.charAt(0).toUpperCase() + s.slice(1)}`);
        if (navBtn) navBtn.className = "flex-1 py-2.5 px-1 rounded-lg text-[#5d7e91] hover:bg-[#0a1621] hover:text-[#49d7ff] transition text-center border border-transparent";
    });

    const targetSec = document.getElementById(`sec-${sectionId}`);
    if (targetSec) targetSec.classList.remove('hidden');
    const activeNav = document.getElementById(`nav${sectionId.charAt(0).toUpperCase() + sectionId.slice(1)}`);
    if (activeNav) activeNav.className = "flex-1 py-2.5 px-1 rounded-lg bg-[#49d7ff] text-[#050a10] shadow-lg border border-[#49d7ff] transition text-center font-bold";

    updateTerminalStream(`NAV_CHANGE: ${sectionId.toUpperCase()}`);
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
