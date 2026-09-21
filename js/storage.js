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
        err.userMessage = 'Der App-Code fehlt oder stimmt nicht, Sir. Bitte tragen Sie ihn in den Einstellungen ein.';
        throw err;
    }
    return res;
}

/* --- Profil --- */
let currentUserName = getPersistentData('user_custom_name', 'Dino');
if (userNameInput) userNameInput.value = currentUserName;
updateUserGreeting();

function updateUserGreeting() {
    if (userNameDisplay) userNameDisplay.textContent = `Hallo, ${currentUserName}!`;
}

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
let memoryItems = JSON.parse(getPersistentData('helfer_memory', '{}')) || {};
let savedContacts = JSON.parse(getPersistentData('helfer_contacts', '{}')) || {};
/* Briefing-Wünsche: { id, type: 'text' (freier Hinweis) oder 'item' (Gedächtnis-Begriff), text } */
let briefingWishes = JSON.parse(getPersistentData('helfer_briefing_wishes', '[]')) || [];
/* Geparktes Auto: { lat, lon, adresse, notiz, gespeichert (ISO) } oder null */
let parkingSpot = JSON.parse(getPersistentData('helfer_parking', 'null')) || null;

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
