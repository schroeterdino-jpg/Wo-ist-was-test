/* ============================================================
   STORAGE: Speichern/Laden, Profil (Name), Client-ID, Daten-Listen
   Braucht: ui.js (DOM-Referenzen)
   ============================================================ */

function getPersistentData(key, defaultValue) {
    let val = localStorage.getItem(key);
    if (!val || val === "null" || val === "undefined") val = sessionStorage.getItem(key);
    return (!val || val === "null" || val === "undefined") ? defaultValue : val;
}

function setPersistentData(key, value) {
    try { localStorage.setItem(key, value); } catch (e) {}
    try { sessionStorage.setItem(key, value); } catch (e) {}
    // Für die Synchronisierung (sync.js): merkt sich, dass sich dieser Wert lokal geändert hat
    if (typeof onLocalDataChanged === 'function') onLocalDataChanged(key);
}

/* Alle Aufrufe an die eigenen Schnittstellen (/api/...) laufen hierüber.
   Schickt den App-Code mit; ohne den richtigen Code lässt der Server nichts zu. */
async function apiFetch(url, options = {}) {
    const headers = Object.assign({}, options.headers, { 'x-app-key': getPersistentData('app_secret', '') });
    const res = await fetch(url, Object.assign({}, options, { headers }));
    if (res.status === 401) {
        const err = new Error('Nicht erlaubt');
        err.auth = true;
        err.userMessage = 'Der App-Code fehlt oder stimmt nicht. Bitte trag ihn in den Einstellungen ein.';
        throw err;
    }
    return res;
}

/* --- Profil --- */
let currentUserName = getPersistentData('user_custom_name', 'Dino');
if (userNameInput) userNameInput.value = currentUserName;

/* Tageszeit-abhängige Anrede für die feste Begrüßung oben in der App ("Guten Morgen, Dino!" statt immer "Hallo, ...").
   Nutzt die Uhrzeit des Geräts in Berlin-Zeit, dieselbe Einteilung wie im KI-Prompt (assistant.js). */
function greetingForTime(now = new Date()) {
    // formatToParts statt toLocaleString: liefert die Stunde als reine Zahl, unabhängig davon, ob die
    // deutsche Formatierung "08" oder "08 Uhr" o.ä. ausgibt (das hatte Number() vorher zu NaN gemacht,
    // wodurch fälschlich immer "Gute Nacht" herauskam).
    const parts = new Intl.DateTimeFormat('de-DE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).formatToParts(now);
    const hourPart = parts.find(p => p.type === 'hour');
    const h = hourPart ? Number(hourPart.value) : now.getHours();
    if (h >= 5 && h < 11) return 'Guten Morgen';
    if (h >= 11 && h < 14) return 'Mahlzeit';
    if (h >= 14 && h < 18) return 'Guten Tag';
    if (h >= 18 && h < 22) return 'Guten Abend';
    return 'Gute Nacht';
}

function updateUserGreeting() {
    if (userNameDisplay) userNameDisplay.textContent = `${greetingForTime()}, ${currentUserName}!`;
}
updateUserGreeting();

if (userNameInput) {
    userNameInput.addEventListener('input', () => {
        currentUserName = userNameInput.value.trim() || "Dino";
        setPersistentData('user_custom_name', currentUserName);
        updateUserGreeting();
    });
}

/* --- Google Client-ID --- */
const DEFAULT_CLIENT_ID = '399573320370-qka01ghj0s88eoair7lla665cbj10o4g.apps.googleusercontent.com';
let savedClientId = getPersistentData('google_client_id', DEFAULT_CLIENT_ID);
if (!savedClientId || savedClientId === "null") {
    savedClientId = DEFAULT_CLIENT_ID;
    setPersistentData('google_client_id', savedClientId);
}
if (googleClientIdInput) googleClientIdInput.value = savedClientId;

if (googleClientIdInput) {
    googleClientIdInput.addEventListener('input', () => {
        const val = googleClientIdInput.value.trim() || DEFAULT_CLIENT_ID;
        setPersistentData('google_client_id', val);
        if (connectionStatus) connectionStatus.textContent = "Client-ID gespeichert.";
    });
}

/* --- Daten-Listen (werden von mehreren Dateien genutzt) --- */
let calendarEntries = JSON.parse(getPersistentData('helfer_calendar_entries', '[]')) || [];
let todoEntries = JSON.parse(getPersistentData('helfer_todo_entries', '[]')) || [];
let reminderEntries = JSON.parse(getPersistentData('helfer_reminders', '[]')) || [];
let shoppingEntries = JSON.parse(getPersistentData('helfer_shopping', '[]')) || [];
let memoryItems = (() => { try { return JSON.parse(getPersistentData('helfer_memory', '{}')) || {}; } catch (e) { console.warn('helfer_memory ist kein gültiges JSON: Gedächtnis startet leer, der gespeicherte Wert bleibt unverändert.'); return {}; } })();   // Lesefehler nur hier abfangen, damit Kontakte, Tageslog usw. weiterladen (nichts wird überschrieben)
let savedContacts = JSON.parse(getPersistentData('helfer_contacts', '{}')) || {};
/* Briefing-Wünsche: { id, type: 'text' (freier Hinweis) oder 'item' (Gedächtnis-Begriff), text } */
let briefingWishes = JSON.parse(getPersistentData('helfer_briefing_wishes', '[]')) || [];
/* Geparktes Auto: { lat, lon, adresse, notiz, gespeichert (ISO) } oder null */
let parkingSpot = JSON.parse(getPersistentData('helfer_parking', 'null')) || null;
let homeAddress = getPersistentData('helfer_home_address', '') || '';

/* --- Datensicherung: alles als Datei herunterladen bzw. wieder einlesen --- */
/* Zusätzlich zu den Listen unten wird jetzt ALLES gesichert, was die App sonst noch speichert
   (Urlaub, Schicht, Rechnungen, Kündigungen, Aussprache, Hörkorrektur, Routinen, Einstellungen ...).
   Nicht gesichert werden Zugangsdaten (Google-Anmeldung, App-Code) und gerätespezifische Push-Daten. */
const BACKUP_PREFIX_RX = /^(helfer_|jv_|tts_|fx_|wake_word|night_dim|conversation_mode|ueberblick_day|proaktiv_|google_client_id)/;
const BACKUP_SKIP_RX = /^(jv_push|helfer_sync_meta|helfer_diag|helfer_ferien_cache|jv_fish_init|jv_boot_last)/;
const BACKUP_HAUPT_KEYS = new Set(['helfer_calendar_entries', 'helfer_reminders', 'helfer_shopping', 'helfer_todo_entries', 'helfer_memory', 'helfer_contacts', 'helfer_briefing_wishes', 'helfer_parking', 'helfer_home_address']);

function backupWeitere() {
    const out = {};
    try {
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (!k || !BACKUP_PREFIX_RX.test(k) || BACKUP_SKIP_RX.test(k) || BACKUP_HAUPT_KEYS.has(k)) continue;
            const v = localStorage.getItem(k);
            if (v != null && v !== 'null' && v !== 'undefined') out[k] = v;
        }
    } catch (e) {}
    return out;
}

function exportAllData() {
    const data = {
        version: 2,
        exportiert_am: new Date().toISOString(),
        currentUserName, calendarEntries, reminderEntries, shoppingEntries, todoEntries,
        memoryItems, savedContacts, briefingWishes, parkingSpot, homeAddress,
        weitere: backupWeitere()
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `alltags-helfer-sicherung-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function importAllData(jsonText) {
    let data;
    try { data = JSON.parse(jsonText); } catch (e) { throw userError('Die Datei ist keine gültige Sicherung (kein lesbares JSON).'); }
    if (!data || typeof data !== 'object') throw userError('Die Datei ist keine gültige Sicherung.');

    if (Array.isArray(data.calendarEntries)) { calendarEntries = data.calendarEntries; setPersistentData('helfer_calendar_entries', JSON.stringify(calendarEntries)); }
    if (Array.isArray(data.reminderEntries)) { reminderEntries = data.reminderEntries; setPersistentData('helfer_reminders', JSON.stringify(reminderEntries)); }
    if (Array.isArray(data.shoppingEntries)) { shoppingEntries = data.shoppingEntries; setPersistentData('helfer_shopping', JSON.stringify(shoppingEntries)); }
    if (Array.isArray(data.todoEntries)) { todoEntries = data.todoEntries; setPersistentData('helfer_todo_entries', JSON.stringify(todoEntries)); }
    if (data.memoryItems && typeof data.memoryItems === 'object') { memoryItems = data.memoryItems; setPersistentData('helfer_memory', JSON.stringify(memoryItems)); }
    if (data.savedContacts && typeof data.savedContacts === 'object') { savedContacts = data.savedContacts; setPersistentData('helfer_contacts', JSON.stringify(savedContacts)); }
    if (Array.isArray(data.briefingWishes)) { briefingWishes = data.briefingWishes; setPersistentData('helfer_briefing_wishes', JSON.stringify(briefingWishes)); }
    if (data.parkingSpot && typeof data.parkingSpot === 'object') { parkingSpot = data.parkingSpot; setPersistentData('helfer_parking', JSON.stringify(parkingSpot)); }
    if (typeof data.homeAddress === 'string') { homeAddress = data.homeAddress; setPersistentData('helfer_home_address', homeAddress); }
    if (typeof data.currentUserName === 'string' && data.currentUserName.trim()) { currentUserName = data.currentUserName; setPersistentData('user_custom_name', currentUserName); }

    /* Alles Übrige (ab Version 2): Urlaub, Schicht, Rechnungen, Einstellungen ... */
    let weitere = 0;
    if (data.weitere && typeof data.weitere === 'object') {
        Object.keys(data.weitere).forEach(k => {
            if (!BACKUP_PREFIX_RX.test(k) || BACKUP_SKIP_RX.test(k) || BACKUP_HAUPT_KEYS.has(k)) return;
            if (typeof data.weitere[k] !== 'string') return;
            setPersistentData(k, data.weitere[k]);
            weitere++;
        });
    }
    importAllData._weitere = weitere;

    if (typeof renderAllLists === 'function') renderAllLists();
}

async function handleImportFile(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    try {
        const text = await file.text();
        importAllData(text);
        alert('Die Sicherung wurde wiederhergestellt' + (importAllData._weitere ? ' (inklusive Urlaub, Schicht, Rechnungen und Einstellungen). Die App lädt jetzt neu.' : '.'));
        if (importAllData._weitere) setTimeout(() => location.reload(), 300);
    } catch (e) {
        alert(e.userMessage || 'Die Sicherung konnte nicht eingelesen werden.');
    } finally {
        input.value = '';
    }
}

/* --- Gesprächsverlauf (nur für die laufende Sitzung; von briefing.js und assistant.js genutzt) --- */
let chatHistory = [];

/* --- App-Code (schützt deine Schnittstellen; steht nur hier auf dem Gerät und bei Vercel, nie im Code) --- */
const appSecretInput = document.getElementById('appSecretInput');
if (appSecretInput) {
    appSecretInput.value = getPersistentData('app_secret', '');
    appSecretInput.addEventListener('input', () => {
        setPersistentData('app_secret', appSecretInput.value.trim());
    });
}
