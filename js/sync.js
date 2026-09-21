/* ============================================================
   SYNC: Daten auf mehreren Geräten und dauerhaft speichern
   Speicher: /api/sync (Upstash Redis über Vercel). Braucht den App-Code.

   Regel: Jeder Datenbereich (Einkauf, Aufgaben, Gedächtnis, Kontakte,
   Briefing-Wünsche, Parkplatz, Name) hat einen Zeitstempel. Die neuere
   Änderung gewinnt. Wurde ein Gerät noch nie abgeglichen, hat aber Daten,
   werden seine Einträge mit denen vom Server zusammengeführt (nichts geht verloren).
   Braucht: storage.js, lists.js, briefing.js (normalizeKey), render.js
   ============================================================ */

const SYNC_KEYS = [
    'helfer_shopping',
    'helfer_todo_entries',
    'helfer_memory',
    'helfer_contacts',
    'helfer_briefing_wishes',
    'helfer_parking',
    'user_custom_name'
];
const SYNC_META_KEY = 'helfer_sync_meta';

let syncMeta = {};
try { syncMeta = JSON.parse(localStorage.getItem(SYNC_META_KEY) || '{}') || {}; } catch (e) { syncMeta = {}; }

let applyingRemote = false;
let syncTimer = null;
let syncing = false;
let syncQueued = false;
let lastSyncAt = 0;

function saveSyncMeta() {
    try { localStorage.setItem(SYNC_META_KEY, JSON.stringify(syncMeta)); } catch (e) {}
}

function setSyncStatus(text) {
    const el = document.getElementById('syncStatus');
    if (el) el.textContent = 'Synchronisierung: ' + text;
}

/* Wird von setPersistentData() aufgerufen, sobald sich lokal etwas ändert */
function onLocalDataChanged(key) {
    if (applyingRemote || !SYNC_KEYS.includes(key)) return;
    syncMeta[key] = Date.now();
    saveSyncMeta();
    scheduleSync(2500);
}

function scheduleSync(delay) {
    clearTimeout(syncTimer);
    syncTimer = setTimeout(() => syncNow(), delay);
}

/* Schreibt einen Wert vom Server ins Gerät (ohne selbst wieder einen Abgleich auszulösen) */
function applyRemoteValue(key, valueString) {
    applyingRemote = true;
    try {
        setPersistentData(key, valueString);
        try {
            switch (key) {
                case 'helfer_shopping': shoppingEntries = JSON.parse(valueString) || []; break;
                case 'helfer_todo_entries': todoEntries = JSON.parse(valueString) || []; break;
                case 'helfer_memory': memoryItems = JSON.parse(valueString) || {}; break;
                case 'helfer_contacts': savedContacts = JSON.parse(valueString) || {}; break;
                case 'helfer_briefing_wishes': briefingWishes = JSON.parse(valueString) || []; break;
                case 'helfer_parking': parkingSpot = JSON.parse(valueString) || null; break;
                case 'user_custom_name':
                    currentUserName = valueString || 'Dino';
                    if (userNameInput) userNameInput.value = currentUserName;
                    updateUserGreeting();
                    break;
            }
        } catch (e) {
            console.error('Sync: Wert konnte nicht gelesen werden', key, e);
        }
    } finally {
        applyingRemote = false;
    }
}

/* Führt zwei Stände zusammen, wenn beide Geräte vorher nie abgeglichen wurden */
function unionMerge(remoteStr, localStr) {
    try {
        const r = JSON.parse(remoteStr);
        const l = JSON.parse(localStr);
        if (Array.isArray(r) && Array.isArray(l)) {
            const seen = new Set(r.map(e => normalizeKey(e.text)));
            return JSON.stringify([...r, ...l.filter(e => !seen.has(normalizeKey(e.text)))]);
        }
        if (r && l && typeof r === 'object' && typeof l === 'object' && !Array.isArray(r) && !Array.isArray(l)) {
            return JSON.stringify({ ...l, ...r });
        }
    } catch (e) {}
    return remoteStr; // Einzelwerte (Name, Parkplatz): der Stand vom Server gilt
}

async function readSyncResponse(res) {
    let data = null;
    try { data = await res.json(); } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || `Server-Fehler ${res.status}`);
    return data || {};
}

async function syncNow(manual = false) {
    if (!getPersistentData('app_secret', '')) {
        setSyncStatus('Bitte zuerst den App-Code eintragen.');
        return;
    }
    if (syncing) { syncQueued = true; return; }
    syncing = true;
    setSyncStatus('läuft...');

    try {
        const remote = (await readSyncResponse(await apiFetch('/api/sync', { method: 'GET' }))).items || {};
        const upload = {};
        let changed = false;

        for (const key of SYNC_KEYS) {
            const localVal = getPersistentData(key, null);
            const localTs = syncMeta[key] || 0;
            const r = remote[key];

            if (!r) {                                    // Server kennt den Bereich noch nicht
                if (localVal !== null) {
                    const ts = localTs || Date.now();
                    syncMeta[key] = ts;
                    upload[key] = { v: localVal, ts };
                }
                continue;
            }
            if (localVal === null) {                     // Gerät ist leer, Server hat Daten
                applyRemoteValue(key, r.v);
                syncMeta[key] = r.ts;
                changed = true;
                continue;
            }
            if (localTs === 0) {                         // Gerät nie abgeglichen: zusammenführen
                const merged = unionMerge(r.v, localVal);
                const ts = Date.now();
                applyRemoteValue(key, merged);
                syncMeta[key] = ts;
                upload[key] = { v: merged, ts };
                changed = true;
                continue;
            }
            if (r.ts > localTs) {                        // Server ist neuer
                applyRemoteValue(key, r.v);
                syncMeta[key] = r.ts;
                changed = true;
            } else if (localTs > r.ts) {                 // Gerät ist neuer
                upload[key] = { v: localVal, ts: localTs };
            }
        }
        saveSyncMeta();

        if (Object.keys(upload).length > 0) {
            await readSyncResponse(await apiFetch('/api/sync', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ items: upload })
            }));
        }

        if (changed) {
            renderAllLists();
            renderContactList();
        }
        lastSyncAt = Date.now();
        setSyncStatus('zuletzt um ' + new Date().toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr');
    } catch (e) {
        console.error('Sync-Fehler', e);
        setSyncStatus(e.auth ? 'App-Code fehlt oder stimmt nicht.' : 'Fehler: ' + (e.message || e));
    } finally {
        syncing = false;
        if (syncQueued) { syncQueued = false; scheduleSync(500); }
    }
}

/* Wann synchronisiert wird: beim Start, beim Zurückkehren zur App, nach Änderungen und alle 3 Minuten */
window.addEventListener('DOMContentLoaded', () => scheduleSync(1500));
window.addEventListener('online', () => scheduleSync(500));
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && Date.now() - lastSyncAt > 30000) scheduleSync(300);
});
setInterval(() => { if (!document.hidden) syncNow(); }, 180000);
