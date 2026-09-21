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

/* Effekt-Stufe: "calm" (Standard), "full" oder "off". Das Aussehen steuert style.css über html[data-fx]. */
function applyFxMode(mode) {
    const m = ['full', 'calm', 'off'].includes(mode) ? mode : 'calm';
    document.documentElement.dataset.fx = m;
    try { localStorage.setItem('fx_mode', m); } catch (e) {}
    if (typeof setBackgroundMode === 'function') setBackgroundMode(m);
}

/* Flacker-Test: einzelne Effekte ausschalten. Jeder Schalter setzt html.nofx-<name> (siehe style.css). */
const FX_FLAGS = ['gif', 'scan', 'glow', 'bg', 'pulse', 'motion'];

function readFxFlags() {
    try {
        const f = JSON.parse(localStorage.getItem('fx_flags') || '[]');
        return Array.isArray(f) ? f.filter(x => FX_FLAGS.includes(x)) : [];
    } catch (e) { return []; }
}

/* Friert das Ring-Bild auf dem aktuellen Bild ein (oder gibt es wieder frei) */
function freezeRingImage(freeze) {
    const img = document.getElementById('assistant-gif');
    if (!img) return;
    if (!img.dataset.orig) img.dataset.orig = img.getAttribute('src');
    if (!freeze) {
        if (img.dataset.frozen) { delete img.dataset.frozen; img.src = img.dataset.orig; }
        return;
    }
    if (img.dataset.frozen) return;
    const doFreeze = () => {
        try {
            const c = document.createElement('canvas');
            c.width = img.naturalWidth || 270;
            c.height = img.naturalHeight || 270;
            c.getContext('2d').drawImage(img, 0, 0);
            const url = c.toDataURL('image/png');
            img.dataset.frozen = '1';
            img.src = url;
        } catch (e) { /* Standbild nicht möglich: Bild läuft einfach weiter */ }
    };
    if (img.complete && img.naturalWidth) doFreeze();
    else img.addEventListener('load', doFreeze, { once: true });
}

function applyFxFlags() {
    const flags = readFxFlags();
    FX_FLAGS.forEach(f => document.documentElement.classList.toggle('nofx-' + f, flags.includes(f)));
    if (document.querySelectorAll) {
        document.querySelectorAll('[data-fxflag]').forEach(cb => { cb.checked = flags.includes(cb.dataset.fxflag); });
    }
    freezeRingImage(flags.includes('gif'));
    if (typeof setBackgroundMode === 'function') setBackgroundMode(document.documentElement.dataset.fx || 'calm');
}

function setFxFlag(flag, on) {
    if (!FX_FLAGS.includes(flag)) return;
    const flags = readFxFlags().filter(f => f !== flag);
    if (on) flags.push(flag);
    try { localStorage.setItem('fx_flags', JSON.stringify(flags)); } catch (e) {}
    applyFxFlags();
}

function setAllFxFlags(on) {
    try { localStorage.setItem('fx_flags', JSON.stringify(on ? FX_FLAGS : [])); } catch (e) {}
    applyFxFlags();
}

/* --- Start: Boot-Sound, Terminal-Meldung, erste Darstellung der Listen --- */
window.addEventListener('DOMContentLoaded', () => {
    playJarvisSound();
    updateTerminalStream("SYS_BOOT: COMPLETE", "ONLINE");
    applyFxFlags();
    const fxSelect = document.getElementById('fxSelect');
    if (fxSelect) fxSelect.value = document.documentElement.dataset.fx || 'calm';
    renderAllLists();
    renderContactList();
    // Die Übersichtszeile rückt weiter, wenn ein Termin vorbei ist
    setInterval(() => renderAssistantOverview(), 60000);
});
