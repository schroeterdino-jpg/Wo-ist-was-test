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
            speak(`Sir, ich darf Sie daran erinnern: ${rem.text}`);
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
let pendingAction = null;

function initTokenClient(callbackAction) {
    const clientId = getPersistentData('google_client_id', DEFAULT_CLIENT_ID);
    if (!clientId) return false;

    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: 'https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly',
        callback: (response) => {
            if (response.error) {
                console.error("OAuth Fehler:", response);
                if (response.error === 'interaction_required' || response.error === 'login_required') {
                    tokenClient.requestAccessToken({ prompt: 'consent' });
                }
                return;
            }
            if (response.access_token) {
                accessToken = response.access_token;
                setPersistentData('google_access_token', accessToken);
                if (connectionStatus) connectionStatus.textContent = "✅ Verbunden (Token erneuert)";

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

    if (!tokenClient) {
        const ok = initTokenClient();
        if (!ok) { alert('Client-ID fehlt!'); return; }
    }

    tokenClient.requestAccessToken({ prompt: silent ? 'none' : 'consent' });
}

window.addEventListener('load', () => {
    if (accessToken) {
        if (connectionStatus) connectionStatus.textContent = "✅ Verbunden (Sitzung aktiv)";
        fetchGoogleCalendarEvents();
    } else {
        if (connectionStatus) connectionStatus.textContent = "Nicht verbunden. Klicke auf Verbinden.";
    }
});

setInterval(() => {
    if (accessToken) {
        loginWithGoogle(true);
    }
}, 50 * 60 * 1000);

setInterval(() => {
    if (accessToken) {
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

    let createdId = 'local_' + Date.now();

    if (accessToken) {
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
                loginWithGoogle(true, () => addGoogleCalendarEvent(text, isoStartString));
                return;
            }
            if (res.ok) {
                fetchGoogleCalendarEvents();
                return;
            }
        } catch (e) {
            console.error("Google Sync Fehler", e);
        }
    }

    calendarEntries.unshift({
        id: createdId,
        text: text,
        date: eventDate.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: 'short' }),
        isoDate: eventDate.toISOString()
    });
    setPersistentData('helfer_calendar_entries', JSON.stringify(calendarEntries));
    renderAllLists();
}

async function updateGoogleCalendarEvent(eventId, newText, newIsoStartString) {
    let eventDate = newIsoStartString ? new Date(newIsoStartString) : new Date();
    if (isNaN(eventDate.getTime())) eventDate = new Date();
    const endDate = new Date(eventDate.getTime() + 60 * 60000);

    if (accessToken && eventId && !eventId.startsWith('local_')) {
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
                loginWithGoogle(true, () => updateGoogleCalendarEvent(eventId, newText, newIsoStartString));
                return;
            }
            if (res.ok) {
                fetchGoogleCalendarEvents();
                return;
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

    if (accessToken) {
        try {
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
                body: JSON.stringify(eventData)
            });
            if (res.status === 401) {
                loginWithGoogle(true, () => addGoogleCalendarReminder(text, isoTimeString));
                return;
            }
            if (res.ok) {
                const data = await res.json();
                googleEventId = data.id;
            }
        } catch (e) {}
    }

    reminderEntries.unshift({ id: Date.now(), googleId: googleEventId, text, time: remDate.toISOString(), triggered: false });
    setPersistentData('helfer_reminders', JSON.stringify(reminderEntries));
    renderAllLists();
    fetchGoogleCalendarEvents();
}

async function addManualReminder() {
    const textEl = document.getElementById('manualReminderText');
    const timeEl = document.getElementById('manualReminderTime');
    if (!textEl || !timeEl) return;
    const text = textEl.value.trim();
    const time = timeEl.value;
    if (text && time) {
        const isoTime = new Date(time).toISOString();
        await addGoogleCalendarReminder(text, isoTime);
        textEl.value = '';
        timeEl.value = '';
        speak(`Sehr wohl, ${currentUserName}, ich habe mir diese Erinnerung notiert.`);
    }
}

/* --- Google Kalender abrufen --- */
async function fetchGoogleCalendarEvents() {
    if (!accessToken) return;
    const nowIso = new Date().toISOString();

    const futureDate = new Date();
    futureDate.setMonth(futureDate.getMonth() + 3);
    const maxIso = futureDate.toISOString();

    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${nowIso}&timeMax=${maxIso}&singleEvents=true&orderBy=startTime`;

    try {
        const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
        if (res.status === 401) {
            loginWithGoogle(true, fetchGoogleCalendarEvents);
            return;
        }
        if (res.ok) {
            const data = await res.json();
            if (data.items) {
                const validItems = data.items.filter(item => {
                    if (item.status === 'cancelled') return false;
                    const id = (item.id || '');
                    if (id.includes('_R') || item.recurringEventId) return false;
                    return true;
                });

                const calItems = validItems.filter(item => {
                    const summary = (item.summary || '').toLowerCase();
                    return !summary.includes('🔔') && !summary.includes('erinnerung');
                });

                calendarEntries = calItems.map(item => {
                    const d = new Date(item.start.dateTime || item.start.date);
                    return {
                        id: item.id,
                        text: item.summary || 'Termin',
                        date: d.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'medium', timeStyle: item.start.dateTime ? 'short' : undefined }),
                        isoDate: item.start.dateTime || item.start.date
                    };
                });
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

/* --- Löschen --- */
async function deleteCalendarEntry(id) {
    if (accessToken && id && typeof id === 'string' && !id.startsWith('local_')) {
        const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(id)}`;
        try {
            const res = await fetch(url, {
                method: 'DELETE',
                headers: { 'Authorization': `Bearer ${accessToken}` }
            });
            if (res.status === 401) {
                loginWithGoogle(true, () => deleteCalendarEntry(id));
                return;
            }
        } catch (e) {
            console.error("Fehler beim Löschen im Google Kalender", e);
        }
    }

    calendarEntries = calendarEntries.filter(e => e.id !== id);
    setPersistentData('helfer_calendar_entries', JSON.stringify(calendarEntries));
    renderAllLists();
}

async function deleteReminderEntry(id) {
    const rem = reminderEntries.find(e => e.id === id);

    reminderEntries = reminderEntries.filter(e => e.id !== id);
    setPersistentData('helfer_reminders', JSON.stringify(reminderEntries));
    renderAllLists();

    if (rem && accessToken) {
        let targetGoogleId = rem.googleId;

        if (!targetGoogleId) {
            try {
                const nowIso = new Date().toISOString();
                const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${nowIso}&singleEvents=true`;
                const res = await fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } });
                if (res.status === 401) {
                    loginWithGoogle(true, () => deleteReminderEntry(id));
                    return;
                }
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
                await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(targetGoogleId)}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Bearer ${accessToken}` }
                });
            } catch (e) {
                console.error("Fehler beim Löschen der Erinnerung aus Google", e);
            }
        }
    }
}
