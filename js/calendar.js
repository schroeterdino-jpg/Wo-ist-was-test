/* ============================================================
   CALENDAR: Erinnerungs-Timer, Google-Login, Termine, Erinnerungen
   Braucht: storage.js, render.js, voice.js (speak) zur Laufzeit
   ============================================================ */

function requestNotificationPermission() {
    if ('Notification' in window) {
        Notification.requestPermission().then(perm => {
            if (perm === 'granted') speak(`Sehr wohl, ${currentUserName}, Benachrichtigungen wurden erfolgreich aktiviert.`);
        });
    }
}

/* --- Erinnerungen: jede Sekunde prüfen, ob eine fällig ist --- */
setInterval(() => {
    if (reminderEntries.length === 0) return;
    const now = new Date();
    let updated = false;

    reminderEntries.forEach(rem => {
        const remTime = new Date(rem.time);
        if (!rem.triggered && remTime <= now) {
            rem.triggered = true;
            updated = true;

            if ('Notification' in window && Notification.permission === 'granted') {
                new Notification(`Erinnerung für ${currentUserName}`, { body: rem.text, icon: './dino.png' });
            }
            speak(`Zur Erinnerung: ${rem.text}`);
        }
    });

    if (updated) {
        setPersistentData('helfer_reminders', JSON.stringify(reminderEntries));
        renderAllLists();
    }
}, 1000);

/* --- Google Login --- */
let tokenClient = null;
let accessToken = getPersistentData('google_access_token', '');
let googleTokenExpiresAt = Number(getPersistentData('google_token_expires_at', '0')) || 0;
let pendingAction = null;
let pendingFail = null;
let lastSilentAuth = 0;

/* Ein Google-Token gilt nur etwa eine Stunde. Ohne gespeicherte Ablaufzeit (alte Sitzung) gilt er als abgelaufen. */
function isGoogleAuthorized() {
    return !!accessToken && Date.now() < googleTokenExpiresAt;
}

function updateGoogleStatus() {
    if (connectionStatus) {
        if (!accessToken) connectionStatus.textContent = "Nicht verbunden. Klicke auf Verbinden.";
        else if (!isGoogleAuthorized()) connectionStatus.textContent = "⚠️ Verbindung abgelaufen. Klicke auf Verbinden.";
        else connectionStatus.textContent = "✅ Verbunden";
    }
    if (typeof renderAssistantOverview === 'function') renderAssistantOverview();
}

function markGoogleExpired() {
    googleTokenExpiresAt = 0;
    updateGoogleStatus();
}

/* Karte "Google Kalender verbinden": Erst der Fingertipp darauf erlaubt dem Browser das Anmelde-Fenster. */
function googleReconnectCard() {
    return { icon: '📅', title: 'Google Kalender verbinden', subtitle: 'Tippen, um die Verbindung zu erneuern', onclick: 'loginWithGoogle(false)' };
}

function initTokenClient(callbackAction) {
    const clientId = getPersistentData('google_client_id', DEFAULT_CLIENT_ID);
    if (!clientId) return false;

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
        error_callback: (err) => {
            console.error("OAuth Fehler:", err);
            updateGoogleStatus();
            if (pendingFail) { const f = pendingFail; pendingFail = null; pendingAction = null; f(); }
        },
        callback: (response) => {
            if (response.error) {
                console.error("OAuth Fehler:", response);
                updateGoogleStatus();
                if (pendingFail) { const f = pendingFail; pendingFail = null; pendingAction = null; f(); }
                return;   // kein automatisches Nachfragen ohne Fingertipp (der Browser würde es blockieren)
            }
            if (response.access_token) {
                accessToken = response.access_token;
                googleTokenExpiresAt = Date.now() + Math.max(120, Number(response.expires_in) || 3600) * 1000 - 60000;
                setPersistentData('google_access_token', accessToken);
                setPersistentData('google_token_expires_at', String(googleTokenExpiresAt));
                updateGoogleStatus();

                pendingFail = null;
                if (pendingAction) {
                    const act = pendingAction;
                    pendingAction = null;
                    act();
                } else {
                    fetchGoogleCalendarEvents();
                }
            }
        }
    });
    return true;
}

function loginWithGoogle(silent = false, onComplete = null) {
    if (onComplete) pendingAction = onComplete;
    if (silent) lastSilentAuth = Date.now();

    if (!tokenClient) {
        const ok = initTokenClient();
        if (!ok) { alert('Client-ID fehlt!'); return; }
    }

    tokenClient.requestAccessToken({ prompt: silent ? 'none' : 'consent' });
}

/* Ein stiller Versuch, die Verbindung zu erneuern (ohne Fenster). Wartet kurz auf das Ergebnis. */
function ensureGoogleAuth(timeoutMs = 4000) {
    if (isGoogleAuthorized()) return Promise.resolve(true);
    return new Promise(resolve => {
        let done = false;
        const waiter = () => finish(true);
        const finish = ok => { if (!done) { done = true; clearTimeout(timer); resolve(ok); } };
        const timer = setTimeout(() => { if (pendingAction === waiter) { pendingAction = null; pendingFail = null; } finish(isGoogleAuthorized()); }, timeoutMs);
        pendingFail = () => finish(false);
        try { loginWithGoogle(true, waiter); } catch (e) { pendingFail = null; finish(false); }
    });
}

window.addEventListener('load', () => {
    updateGoogleStatus();
    if (isGoogleAuthorized()) {
        fetchGoogleCalendarEvents();
    } else if (accessToken) {
        try { loginWithGoogle(true); } catch (e) {}
    }
});

// Verbindung rechtzeitig erneuern, solange die App offen ist
setInterval(() => {
    if (accessToken) {
        try { loginWithGoogle(true); } catch (e) {}
    }
}, 50 * 60 * 1000);

// Beim Zurückkehren zur App: ist die Verbindung abgelaufen, einmal still erneuern (höchstens alle 2 Minuten)
document.addEventListener('visibilitychange', () => {
    if (!document.hidden && accessToken && !isGoogleAuthorized() && Date.now() - lastSilentAuth > 120000) {
        try { loginWithGoogle(true); } catch (e) {}
    }
});

// Termine nur laden, solange die Verbindung gültig ist (sonst hagelt es alle 30 Sekunden Fehler)
setInterval(() => {
    if (isGoogleAuthorized()) {
        fetchGoogleCalendarEvents();
    }
}, 30000);

/* --- Termine anlegen / ändern --- */
async function addGoogleCalendarEvent(text, isoStartString) {
    let eventDate = isoStartString ? new Date(isoStartString) : new Date();
    if (isNaN(eventDate.getTime())) eventDate = new Date();

    const endDate = new Date(eventDate.getTime() + 60 * 60000);
    const eventData = {
        summary: text,
        start: { dateTime: eventDate.toISOString() },
        end: { dateTime: endDate.toISOString() }
    };

    const createdId = 'local_' + Date.now();

    if (isGoogleAuthorized()) {
        try {
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(eventData)
            });
            if (res.status === 401) {
                markGoogleExpired();
            } else if (res.ok) {
                fetchGoogleCalendarEvents();
                return true;
            }
        } catch (e) {
            console.error("Google Sync Fehler", e);
        }
    }

    // Google nicht verbunden oder nicht erreichbar: der Termin wird nur in der App gemerkt
    calendarEntries.unshift({
        id: createdId,
        text: text,
        date: eventDate.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }),
        isoDate: eventDate.toISOString()
    });
    setPersistentData('helfer_calendar_entries', JSON.stringify(calendarEntries));
    renderAllLists();
    return false;
}

async function updateGoogleCalendarEvent(eventId, newText, newIsoStartString) {
    let eventDate = newIsoStartString ? new Date(newIsoStartString) : new Date();
    if (isNaN(eventDate.getTime())) eventDate = new Date();
    const endDate = new Date(eventDate.getTime() + 60 * 60000);

    if (isGoogleAuthorized() && eventId && !String(eventId).startsWith('local_')) {
        try {
            const patchData = {
                start: { dateTime: eventDate.toISOString() },
                end: { dateTime: endDate.toISOString() }
            };
            if (newText) patchData.summary = newText;

            const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`, {
                method: 'PATCH',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(patchData)
            });
            if (res.status === 401) {
                markGoogleExpired();
            } else if (res.ok) {
                fetchGoogleCalendarEvents();
                return true;
            }
        } catch (e) {
            console.error("Google Update Fehler", e);
        }
    }

    const target = calendarEntries.find(e => e.id === eventId);
    if (target) {
        if (newText) target.text = newText;
        target.isoDate = eventDate.toISOString();
        target.date = eventDate.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' });
        setPersistentData('helfer_calendar_entries', JSON.stringify(calendarEntries));
        renderAllLists();
    }
    return false;
}

/* --- Erinnerungen anlegen --- */
async function addGoogleCalendarReminder(text, isoTimeString) {
    let remDate = isoTimeString ? new Date(isoTimeString) : new Date();
    if (isNaN(remDate.getTime())) remDate = new Date();

    let googleEventId = null;

    const eventData = {
        summary: `🔔 ${text}`,
        start: { dateTime: remDate.toISOString() },
        end: { dateTime: new Date(remDate.getTime() + 30 * 60000).toISOString() }
    };

    if (isGoogleAuthorized()) {
        try {
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
            if (res.status === 401) {
                markGoogleExpired();
            } else if (res.ok) {
                const data = await res.json();
                googleEventId = data.id;
            }
        } catch (e) {}
    }

    reminderEntries.unshift({ id: Date.now(), googleId: googleEventId, text, time: remDate.toISOString(), triggered: false });
    setPersistentData('helfer_reminders', JSON.stringify(reminderEntries));
    renderAllLists();
    fetchGoogleCalendarEvents();
    return googleEventId !== null;   // false = nur in der App gemerkt, das Handy klingelt dazu nicht
}

async function addManualReminder() {
    const textEl = document.getElementById('manualReminderText');
    const timeEl = document.getElementById('manualReminderTime');
    if (!textEl || !timeEl) return;
    const text = textEl.value.trim();
    const time = timeEl.value;
    if (text && time) {
        const isoTime = new Date(time).toISOString();
        const synced = await addGoogleCalendarReminder(text, isoTime);
        textEl.value = '';
        timeEl.value = '';
        speak(synced ? 'Erinnerung notiert.' : 'Erinnerung notiert, aber nur in der App: Der Google Kalender ist nicht verbunden.');
    }
}

/* --- Google Kalender abrufen --- */
async function fetchGoogleCalendarEvents() {
    if (!isGoogleAuthorized()) return;
    const nowIso = new Date().toISOString();

    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 3);
    const maxIso = futureDate.toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${nowIso}&timeMax=${maxIso}&singleEvents=true&orderBy=startTime`;

    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (res.status === 401) {
            markGoogleExpired();
            return;
        }
        if (res.ok) {
            const data = await res.json();
            if (data.items) {
                const validItems = data.items.filter(item => {
                    if (item.status === 'cancelled') return false;
                    return true;
                });

                const calItems = validItems.filter(item => {
                    const summary = (item.summary || '').toLowerCase();
                    return !summary.includes('🔔') && !summary.includes('erinnerung');
                });

                const localOnly = calendarEntries.filter(e => String(e.id).startsWith('local_'));   // nur in der App gemerkte Termine bleiben erhalten
                const mappedEntries = calItems.map(item => {
                    const d = new Date(item.start.dateTime || item.start.date);
                    return {
                        id: item.id,
                        text: item.summary || 'Termin',
                        date: d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: item.start.dateTime ? 'short' : undefined }),
                        isoDate: item.start.dateTime || item.start.date,
                        eventType: item.eventType || 'default',
                        recurring: !!item.recurringEventId
                    };
                });
                calendarEntries = [...localOnly, ...mappedEntries];
                setPersistentData('helfer_calendar_entries', JSON.stringify(calendarEntries));

                const googleReminders = validItems.filter(item => {
                    const summary = (item.summary || '').toLowerCase();
                    return summary.includes('🔔') || summary.includes('erinnerung');
                });

                const newReminderEntries = [];
                googleReminders.forEach(gItem => {
                    const cleanText = (gItem.summary || '').replace(/^🔔\s*/, '').trim();
                    const isoTime = gItem.start.dateTime || gItem.start.date;

                    const existing = reminderEntries.find(r => r.googleId === gItem.id || (r.text === cleanText && r.time === isoTime));

                    newReminderEntries.push({
                        id: existing ? existing.id : Date.now() + Math.floor(Math.random() * 1000),
                        googleId: gItem.id,
                        text: cleanText,
                        time: isoTime,
                        triggered: existing ? existing.triggered : false
                    });
                });

                reminderEntries.forEach(r => {
                    if (!r.googleId && !newReminderEntries.some(nr => nr.text === r.text && nr.time === r.time)) {
                        newReminderEntries.push(r);
                    }
                });

                reminderEntries = newReminderEntries;
                setPersistentData('helfer_reminders', JSON.stringify(reminderEntries));

                renderAllLists();
            }
        }
    } catch (e) {
        console.error("Fehler beim Abrufen der Google Kalender Events", e);
    }
}

/* --- Löschen (liefern false, wenn nur die App-Kopie gelöscht werden konnte und der Eintrag bei Google bleibt) --- */
async function deleteCalendarEntry(id) {
    let googleDone = true;
    if (id && typeof id === 'string' && !id.startsWith('local_')) {
        googleDone = false;
        if (isGoogleAuthorized()) {
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`;
            try {
                const res = await fetch(url, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
                if (res.status === 401) markGoogleExpired();
                else googleDone = res.ok || res.status === 404 || res.status === 410;
            } catch (e) {
                console.error("Fehler beim Löschen im Google Kalender", e);
            }
        }
    }

    calendarEntries = calendarEntries.filter(e => e.id !== id);
    setPersistentData('helfer_calendar_entries', JSON.stringify(calendarEntries));
    renderAllLists();
    return googleDone;
}

async function deleteReminderEntry(id) {
    const rem = reminderEntries.find(e => e.id === id);

    reminderEntries = reminderEntries.filter(e => e.id !== id);
    setPersistentData('helfer_reminders', JSON.stringify(reminderEntries));
    renderAllLists();

    if (!rem) return true;
    if (!isGoogleAuthorized()) return !rem.googleId;   // war die Erinnerung schon bei Google, bleibt sie dort bestehen

    let targetGoogleId = rem.googleId;

    if (!targetGoogleId) {
        try {
            const nowIso = new Date().toISOString();
            const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${nowIso}&singleEvents=true`;
            const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
            if (res.status === 401) { markGoogleExpired(); return false; }
            if (res.ok) {
                const data = await res.json();
                if (data.items) {
                    const match = data.items.find(item => item.summary && item.summary.includes(rem.text));
                    if (match) targetGoogleId = match.id;
                }
            }
        } catch (e) {}
    }

    if (targetGoogleId) {
        try {
            const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(targetGoogleId)}`, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (res.status === 401) { markGoogleExpired(); return false; }
            return true;
        } catch (e) {
            console.error("Fehler beim Löschen der Erinnerung aus Google", e);
            return false;
        }
    }
    return true;
}

/* --- Kalender durchsuchen (für Fragen wie "Wann hat Victoria Geburtstag?") ---
   Durchsucht alle sichtbaren Google-Kalender (auch den Geburtstags-Kalender), 1 Jahr zurück bis 14 Monate voraus. */
const BIRTHDAY_CALENDAR_ID = 'addressbook#contacts@group.v.calendar.google.com';

/* Welche Kalender werden durchsucht: alle sichtbaren (bis 25), der Geburtstags-Kalender immer dabei */
function pickCalendars(listItems) {
    const cals = (listItems || []).filter(c => c.selected !== false || c.primary || c.id === BIRTHDAY_CALENDAR_ID).slice(0, 25);
    if (!cals.some(c => c.id === BIRTHDAY_CALENDAR_ID)) cals.push({ id: BIRTHDAY_CALENDAR_ID, summary: 'Geburtstage', _optional: true });
    return cals;
}

/* Holt die Termine eines Kalenders. Manche Kalender (z. B. "Geburtstage") lehnen einzelne Parameter ab.
   Deshalb werden nacheinander drei Varianten probiert. Ein Fehler wird gemeldet statt verschluckt. */
async function fetchCalendarItems(calId, from, to, headers, q, maxPages) {
    const range = `timeMin=${encodeURIComponent(from.toISOString())}&timeMax=${encodeURIComponent(to.toISOString())}`;
    const variants = [
        { expanded: true, params: 'singleEvents=true&orderBy=startTime&maxResults=250' },
        { expanded: true, params: 'singleEvents=true&maxResults=250' },
        { expanded: false, params: 'maxResults=250' }
    ];
    let lastError = null;
    for (let vi = 0; vi < variants.length; vi++) {
        const v = variants[vi];
        const items = [];
        let pageToken = null, failed = false;
        for (let page = 0; page < maxPages; page++) {
            let res;
            try {
                res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/events?${range}&${v.params}` +
                    `${q ? '&q=' + encodeURIComponent(q) : ''}${pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : ''}`, { headers });
            } catch (e) { lastError = 'keine Verbindung'; failed = true; break; }
            if (res.status === 401) return { unauthorized: true, items: [], error: 'abgelaufen' };
            if (!res.ok) { lastError = 'Fehler ' + res.status; failed = true; break; }
            const d = await res.json();
            (d.items || []).forEach(i => items.push(i));
            pageToken = d.nextPageToken;
            if (!pageToken) break;
        }
        if (!failed) return { items, expanded: v.expanded, variant: vi + 1, error: null };
        if (lastError === 'keine Verbindung') break;
    }
    return { items: [], error: lastError };
}

/* Wiederkehrende Termine, die Google nicht aufgeklappt hat (Variante 3): jährliche (Geburtstage) auf die Jahre im Zeitraum verteilen */
function expandYearlyItem(item, from, to) {
    const startDate = item.start && item.start.date;
    const yearly = item.eventType === 'birthday' || (Array.isArray(item.recurrence) && item.recurrence.some(r => /FREQ=YEARLY/i.test(r)));
    if (!startDate || !yearly) return [item];
    const [, mm, dd] = startDate.split('-');
    const out = [];
    for (let y = from.getFullYear(); y <= to.getFullYear(); y++) {
        const d = `${y}-${mm}-${dd}`;
        const t = new Date(d + 'T12:00:00').getTime();
        if (t >= from.getTime() && t <= to.getTime()) out.push({ ...item, id: (item.id || item.summary) + '_' + y, start: { date: d } });
    }
    return out;
}

async function searchGoogleCalendar(query) {
    const q = String(query || '').trim();
    if (!q) return { fehler: 'Kein Suchbegriff angegeben.' };

    const now = new Date();
    const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
    const to = new Date(now); to.setMonth(to.getMonth() + 14);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const nq = normalizeKey(q);

    const describe = (summary, startRaw, calName, location, recurring) => {
        const parsed = parseEventDate(startRaw);
        const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
        if (!parsed.allDay) opts.timeZone = 'Europe/Berlin';
        return {
            titel: summary || 'Ohne Titel',
            kalender: calName || undefined,
            datum: parsed.date.toLocaleDateString('de-DE', opts),
            zeit: parsed.allDay ? 'ganztägig' : formatSpokenTime(parsed.date),
            ort: location || undefined,
            wiederkehrend: recurring || undefined,
            _ts: parsed.date.getTime()
        };
    };

    const found = [];
    const seen = new Set();
    const addOne = (item, calName) => {
        if (!item || item.status === 'cancelled' || !item.start) return;
        const startRaw = item.start.dateTime || item.start.date;
        const key = (item.id || item.summary) + '|' + startRaw;
        if (seen.has(key)) return;
        seen.add(key);
        found.push(describe(item.summary, startRaw, calName, item.location, !!item.recurringEventId || !!item.recurrence || item.eventType === 'birthday'));
    };
    const add = (item, calName, expanded = true) => {
        (expanded ? [item] : expandYearlyItem(item, from, to)).forEach(o => addOne(o, calName));
    };

    let hinweis = null;
    let verbindung = 'ok';
    const probleme = [];

    // Erst einmal still versuchen, eine abgelaufene Verbindung zu erneuern, bevor wir aufgeben
    let authorized = isGoogleAuthorized();
    if (!authorized && accessToken) authorized = await ensureGoogleAuth(4000);

    if (!authorized) {
        verbindung = 'getrennt';
        hinweis = (accessToken ? 'Der Google Kalender ist nicht mehr verbunden (die Anmeldung ist abgelaufen). ' : 'Der Google Kalender ist nicht verbunden. ') +
            'Es wurden nur zwischengespeicherte Termine der nächsten drei Monate durchsucht. Bitte auf die Karte unten tippen, um neu zu verbinden.';
    } else {
        try {
            const headers = { 'Authorization': `Bearer ${accessToken}` };
            const listRes = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', { headers });
            if (listRes.status === 401) {
                markGoogleExpired();
                verbindung = 'getrennt';
                hinweis = 'Die Google-Anmeldung ist abgelaufen. Es wurden nur zwischengespeicherte Termine der nächsten drei Monate durchsucht. Bitte auf die Karte unten tippen, um neu zu verbinden.';
            } else {
                let listItems;
                if (listRes.ok) {
                    listItems = (await listRes.json()).items || [];
                } else {
                    // Kalenderliste nicht lesbar: trotzdem den Hauptkalender und die Geburtstage durchsuchen
                    listItems = [{ id: 'primary', summary: 'Hauptkalender', primary: true }];
                    probleme.push(`die Kalenderliste (Fehler ${listRes.status})`);
                }
                const cals = pickCalendars(listItems);
                const calName = (cal) => cal.summaryOverride || cal.summary || cal.id;
                let expired = false;

                await Promise.all(cals.map(async cal => {
                    const name = calName(cal);
                    try {
                        // 1) Suche über Google (schnell)
                        const r1 = await fetchCalendarItems(cal.id, from, to, headers, q, 1);
                        if (r1.unauthorized) { expired = true; return; }
                        r1.items.forEach(item => add(item, name, r1.expanded));
                        // 2) Immer zusätzlich: Google sucht nur nach ganzen Wörtern ("Helmut" findet "Helmuts" nicht).
                        //    Deshalb werden die Termine geholt und hier nach Wortteilen gefiltert.
                        const r2 = await fetchCalendarItems(cal.id, from, to, headers, null, 4);
                        if (r2.unauthorized) { expired = true; return; }
                        r2.items.forEach(item => {
                            const hay = normalizeKey((item.summary || '') + ' ' + (item.location || ''));
                            if (hay.includes(nq)) add(item, name, r2.expanded);
                        });
                        const err = r1.error && r2.error ? r2.error : null;
                        if (err && !(cal._optional && /404|403/.test(err))) probleme.push(`${name} (${err})`);
                    } catch (e) {
                        probleme.push(`${name} (unbekannter Fehler)`);
                    }
                }));

                if (expired) {
                    markGoogleExpired();
                    verbindung = 'getrennt';
                    hinweis = 'Die Google-Anmeldung ist abgelaufen. Es wurden nur zwischengespeicherte Termine der nächsten drei Monate durchsucht. Bitte auf die Karte unten tippen, um neu zu verbinden.';
                } else if (probleme.length > 0) {
                    hinweis = 'Nicht lesbar waren: ' + probleme.join(', ') + '.';
                }
            }
        } catch (e) {
            hinweis = 'Der Google Kalender konnte nicht abgefragt werden. Es wurden nur zwischengespeicherte Termine durchsucht.';
        }
    }

    // Zwischengespeicherte Termine ergänzen, falls online nichts gefunden wurde
    if (found.length === 0) {
        (calendarEntries || []).forEach(e => {
            if (!e.isoDate || !normalizeKey(e.text).includes(nq)) return;
            add({ id: e.id, summary: e.text, start: /^\d{4}-\d{2}-\d{2}$/.test(e.isoDate) ? { date: e.isoDate } : { dateTime: e.isoDate } }, 'zwischengespeichert');
        });
    }

    const strip = ({ _ts, ...rest }) => rest;
    const kommende = found.filter(t => t._ts >= todayStart).sort((a, b) => a._ts - b._ts).slice(0, 6).map(strip);
    const vergangene = found.filter(t => t._ts < todayStart).sort((a, b) => b._ts - a._ts).slice(0, 3).map(strip);

    const result = { anzahl_treffer: found.length, kommende, vergangene };
    if (hinweis) result.hinweis = hinweis;
    if (verbindung === 'getrennt') result.verbindung = 'getrennt';
    return result;
}

/* --- Kalender-Test für die Einstellungen: zeigt Schritt für Schritt, was Google liefert --- */
async function diagnoseGoogleCalendar(query, log) {
    const q = String(query || '').trim() || 'Geburtstag';
    const nq = normalizeKey(q);
    const now = new Date();
    const from = new Date(now); from.setFullYear(from.getFullYear() - 1);
    const to = new Date(now); to.setMonth(to.getMonth() + 14);

    log(`Suchbegriff: ${q}`);
    let ok = isGoogleAuthorized();
    if (!ok && accessToken) { log('Verbindung abgelaufen, erneuere still ...'); ok = await ensureGoogleAuth(4000); }
    if (!ok) { log(accessToken ? '❌ Verbindung abgelaufen. Oben auf "Mit Google Kalender verbinden" tippen.' : '❌ Nicht verbunden. Oben auf "Mit Google Kalender verbinden" tippen.'); return; }
    log('✅ Verbindung gültig');

    const headers = { 'Authorization': `Bearer ${accessToken}` };
    try {
        const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken));
        const d = await r.json();
        const scopes = String(d.scope || '').split(' ');
        const canRead = scopes.some(x => /\/auth\/calendar(\.readonly)?$/.test(x));
        log(canRead ? '✅ Berechtigung "Kalender lesen" vorhanden' : '❌ Berechtigung "Kalender lesen" FEHLT. Bitte neu verbinden und alle Häkchen setzen.');
    } catch (e) { log('Berechtigungen: nicht prüfbar'); }

    let listItems = [];
    try {
        const r = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader', { headers });
        if (r.ok) {
            listItems = (await r.json()).items || [];
            log(`Kalender in deinem Konto: ${listItems.length}`);
            listItems.forEach(c => log(`  • ${c.summaryOverride || c.summary}${c.selected === false ? ' (ausgeblendet)' : ''}`));
        } else log(`❌ Kalenderliste: Fehler ${r.status}`);
    } catch (e) { log('❌ Kalenderliste: keine Verbindung'); }

    const cals = pickCalendars(listItems.length ? listItems : [{ id: 'primary', summary: 'Hauptkalender', primary: true }]);
    log(`Durchsucht werden ${cals.length} Kalender:`);
    for (const cal of cals) {
        const name = cal.summaryOverride || cal.summary || cal.id;
        const r = await fetchCalendarItems(cal.id, from, to, headers, null, 4);
        if (r.error) { log(`❌ ${name}: ${r.error}${cal._optional ? ' (gibt es bei dir evtl. nicht)' : ''}`); continue; }
        const hits = r.items.filter(i => normalizeKey((i.summary || '') + ' ' + (i.location || '')).includes(nq));
        log(`${hits.length > 0 ? '✅' : '–'} ${name}: ${r.items.length} Termine gelesen (Weg ${r.variant}), ${hits.length} Treffer`);
        hits.slice(0, 4).forEach(i => log(`     → ${i.summary} · ${(i.start && (i.start.date || i.start.dateTime) || '').slice(0, 10)}`));
    }
    const cached = (calendarEntries || []).filter(e => normalizeKey(e.text).includes(nq));
    log(`Zwischenspeicher (nächste 3 Monate): ${cached.length} Treffer`);
    log('Fertig.');
}

async function runCalendarDiagnosis() {
    const out = document.getElementById('calendarDiagOutput');
    const input = document.getElementById('calendarDiagInput');
    const lines = [];
    const log = (t) => { lines.push(t); if (out) { out.textContent = lines.join('\n'); out.classList.remove('hidden'); } };
    try { await diagnoseGoogleCalendar(input ? input.value : '', log); }
    catch (e) { log('❌ Unerwarteter Fehler: ' + (e && e.message ? e.message : e)); }
}
