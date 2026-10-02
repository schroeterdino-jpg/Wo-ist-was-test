/* ============================================================
   GEBURTSTAGE FÜRS BRIEFING: Das Tages-Briefing nennt die Geburtstage der nächsten 7 Tage ("Morgen hat Julia Geburtstag").
   Quellen: (1) der Geburtstags-Kalender von Google (Geburtstage aus den Kontakten), (2) Termine im Hauptkalender, die "Geburtstag" im Titel haben
   (die stehen schon im Zwischenspeicher). Ist Google nicht verbunden, zählen nur die zwischengespeicherten Termine, ohne dass das Briefing etwas dazu sagt.
   Braucht: calendar.js (fetchCalendarItems, expandYearlyItem, BIRTHDAY_CALENDAR_ID, isGoogleAuthorized, ensureGoogleAuth, accessToken),
   briefing.js (isBirthdayEntry, parseEventDate, relativeDayLabel, normalizeKey). Wird von briefing.js (triggerDailyBriefing) aufgerufen.
   ============================================================ */

const BIRTHDAY_LOOKAHEAD_DAYS = 7;
const BIRTHDAY_MAX_LISTED = 5;

/* Geburtstage von heute bis in 'days' Tagen: [{ titel: "Julias Geburtstag", tag: "morgen" }], nach Datum sortiert; bei jedem Fehler eine (ggf. kleinere) Liste statt eines Abbruchs */
async function fetchUpcomingBirthdays(days) {
    const span = days || BIRTHDAY_LOOKAHEAD_DAYS;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const until = new Date(todayStart);
    until.setDate(until.getDate() + span + 1);   // heute plus die nächsten 'span' Tage (Obergrenze nicht eingeschlossen)

    const found = new Map();
    const add = (title, date) => {
        const t = String(title || '').trim();
        if (!t) return;
        const key = normalizeKey(t) + '|' + date.getFullYear() + '-' + date.getMonth() + '-' + date.getDate();
        if (!found.has(key)) found.set(key, { title: t, date });
    };
    const inRange = (d) => !isNaN(d.getTime()) && d >= todayStart && d < until;

    // 1) Hauptkalender (Zwischenspeicher): Termine mit "Geburtstag" im Titel
    try {
        (calendarEntries || []).forEach(e => {
            if (!e.isoDate || !isBirthdayEntry(e)) return;
            const p = parseEventDate(e.isoDate);
            if (inRange(p.date)) add(e.text, p.date);
        });
    } catch (e) { /* weiter mit dem Geburtstags-Kalender */ }

    // 2) Geburtstags-Kalender von Google
    try {
        let ok = (typeof isGoogleAuthorized === 'function') && isGoogleAuthorized();
        if (!ok && typeof accessToken !== 'undefined' && accessToken && typeof ensureGoogleAuth === 'function') ok = await ensureGoogleAuth(2500);
        if (ok && typeof fetchCalendarItems === 'function') {
            const headers = { 'Authorization': `Bearer ${accessToken}` };
            const r = await fetchCalendarItems(BIRTHDAY_CALENDAR_ID, todayStart, until, headers, null, 2);
            if (!r.unauthorized && !r.error) {
                (r.items || []).forEach(item => {
                    const occurrences = r.expanded ? [item] : (typeof expandYearlyItem === 'function' ? expandYearlyItem(item, todayStart, until) : [item]);
                    occurrences.forEach(o => {
                        if (!o || o.status === 'cancelled' || !o.start) return;
                        const p = parseEventDate(o.start.date || o.start.dateTime);
                        if (inRange(p.date)) add(o.summary, p.date);
                    });
                });
            }
        }
    } catch (e) { /* Briefing läuft ohne die Geburtstage aus Google weiter */ }

    return [...found.values()]
        .sort((a, b) => a.date - b.date)
        .slice(0, BIRTHDAY_MAX_LISTED)
        .map(x => ({ titel: x.title, tag: relativeDayLabel(x.date, todayStart) }));
}

/* Vorname/Kern aus dem Titel ("Julias Geburtstag" -> "julia"), um zu prüfen, ob der Briefing-Text ihn schon nennt */
function birthdayNameCore(title) {
    const words = String(title || '').replace(/['’`´]s\b/gi, '').split(/\s+/)
        .filter(w => w && !/^(geburtstag|geburtstags|birthday|bday|von|vom|der|die|das|des|zum|alles|gute)$/i.test(w));
    const first = normalizeKey(words[0] || '');
    return first.length > 5 ? first.slice(0, 5) : first;   // "Julias" und "Julia" sollen beide passen
}

/* Hat die KI einen Geburtstag nicht erwähnt, wird er hier ergänzt (wie bei den wichtigen Gegenständen) */
function ensureBirthdaysMentioned(text, data) {
    const list = (data && data.geburtstage) || [];
    if (!list.length) return text;
    const norm = normalizeKey(text);
    const missing = list.filter(b => { const core = birthdayNameCore(b.titel); return !core || !norm.includes(core); });
    if (!missing.length) return text;
    return text.trim() + ' Noch ein Hinweis: ' + missing.map(birthdayPhrase).join(', ') + '.';
}

/* "morgen Julias Geburtstag" / "am Freitag hat Peter Müller Geburtstag" für den Ersatztext */
function birthdayPhrase(b) {
    return /geburtstag|birthday|bday/i.test(b.titel) ? `${b.tag} ${b.titel}` : `${b.tag} hat ${b.titel} Geburtstag`;
}
