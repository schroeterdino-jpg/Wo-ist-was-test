/* ============================================================
   REMINDERS: Wiederholungen, Wochentage, wichtige Erinnerungen, "erledigt" und "in zehn Minuten nochmal"
   Aus assistant.js herausgelöst, Code unverändert. Braucht: calendar.js zur Laufzeit.
   ============================================================ */

/* Baut aus einer KI-erkannten Wiederholungsangabe eine Google-Kalender-RRULE. 'unit' ist 'TAG'/'WOCHE'/
   'MONAT'/'JAHR' (von der KI als action.reminder_recurrence_unit bzw. calendar_recurrence_unit gesetzt),
   'interval' die Zahl davor (z.B. 2 bei "alle 2 Wochen", Standard 1 bei "jede Woche"/"täglich"). Gibt null
   zurück, wenn keine Wiederholung gewünscht ist (unit fehlt). */
function buildRecurrenceRule(unit, interval) {
    const map = { TAG: 'DAILY', WOCHE: 'WEEKLY', MONAT: 'MONTHLY', JAHR: 'YEARLY' };
    const freq = map[String(unit || '').toUpperCase()];
    if (!freq) return null;
    const n = Math.max(1, Math.min(52, Number(interval) || 1));
    return `RRULE:FREQ=${freq}${n > 1 ? ';INTERVAL=' + n : ''}`;
}

/* Feste Rückfall-Erkennung für Wiederholungen direkt im gesagten Satz ("alle zwei Wochen", "jede Woche",
   "jeden Monat" ...), falls die KI die Wiederholungs-Felder mal nicht ausfüllt. Gibt eine RRULE oder null zurück. */
function recurrenceFromText(text) {
    const t = String(text || '').toLowerCase();
    const nums = { ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6 };
    const m = t.match(/\balle[nr]?\s+(\d{1,2}|ein|eine|zwei|drei|vier|fünf|sechs)\s+(tag|woche|monat|jahr)/);
    if (m) {
        const n = /^\d/.test(m[1]) ? Number(m[1]) : nums[m[1]];
        const unit = { tag: 'TAG', woche: 'WOCHE', monat: 'MONAT', jahr: 'JAHR' }[m[2]];
        return buildRecurrenceRule(unit, n);
    }
    if (/zweiwöchentlich|vierzehntägig|alle vierzehn tage/.test(t)) return buildRecurrenceRule('WOCHE', 2);
    if (/jede woche|wöchentlich/.test(t)) return buildRecurrenceRule('WOCHE', 1);
    if (/jeden tag|täglich/.test(t)) return buildRecurrenceRule('TAG', 1);
    if (/jeden monat|monatlich/.test(t)) return buildRecurrenceRule('MONAT', 1);
    if (/jedes jahr|jährlich/.test(t)) return buildRecurrenceRule('JAHR', 1);
    return null;
}

/* Zahlen als Wort oder Ziffer ("zehn", "10", "eine") -> Zahl; sonst null */
function parseGermanNumber(w) {
    const word = String(w || '').toLowerCase().trim();
    if (/^\d{1,3}$/.test(word)) return Number(word);
    const map = { ein: 1, eine: 1, einer: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10,
        elf: 11, zwölf: 12, fünfzehn: 15, zwanzig: 20, dreißig: 30, vierzig: 40, fünfundvierzig: 45, sechzig: 60 };
    return map[word] || null;
}

/* Wiederholung mit Wochentag direkt aus dem Satz: "jeden Montag", "dienstags und donnerstags", "alle zwei Wochen
   freitags", "jeden ersten Freitag im Monat", "jeden letzten Freitag im Monat", "werktags", "jedes Wochenende".
   Gibt eine RRULE oder null zurück. Hat Vorrang vor den allgemeinen Wiederholungen ("jede Woche"). */
function weekdayRuleFromText(text) {
    const t = String(text || '').toLowerCase();
    const wd = { montag: 'MO', dienstag: 'DI', mittwoch: 'MI', donnerstag: 'DO', freitag: 'FR', samstag: 'SA', sonnabend: 'SA', sonntag: 'SO' };
    const code = { MO: 'MO', DI: 'TU', MI: 'WE', DO: 'TH', FR: 'FR', SA: 'SA', SO: 'SU' };
    const nums = { ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4 };
    const dayWords = 'montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag';

    // jeden ersten/zweiten/dritten/vierten/letzten <Wochentag> im Monat
    const nth = { ersten: '1', zweiten: '2', dritten: '3', vierten: '4', letzten: '-1' };
    let m = t.match(new RegExp('\\b(?:jeden|jeder|an jedem)\\s+(ersten|zweiten|dritten|vierten|letzten)\\s+(' + dayWords + ')\\s+(?:im|des)\\s+monat'));
    if (m) return `RRULE:FREQ=MONTHLY;BYDAY=${nth[m[1]]}${code[wd[m[2]]]}`;

    if (/\b(werktags|jeden werktag|montags? bis freitags?|von montag bis freitag)\b/.test(t)) return 'RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    if (/\bjedes wochenende\b/.test(t)) return 'RRULE:FREQ=WEEKLY;BYDAY=SA,SU';

    const days = [];
    const re = new RegExp('\\b(' + dayWords + ')s?\\b', 'g');
    let dm;
    while ((dm = re.exec(t)) !== null) {
        const c = code[wd[dm[1]]];
        if (!days.includes(c)) days.push(c);
    }
    if (days.length === 0) return null;

    const im = t.match(/\balle[nr]?\s+(\d{1,2}|ein|eine|zwei|drei|vier)\s+wochen\b/);
    const interval = im ? (/^\d/.test(im[1]) ? Number(im[1]) : nums[im[1]]) : (/zweiwöchentlich|vierzehntägig/.test(t) ? 2 : 1);
    const signal = !!im || /\b(jeden|jede|jedes|wöchentlich|zweiwöchentlich|vierzehntägig)\b/.test(t)
        || new RegExp('\\b(' + dayWords + ')s\\b').test(t);   // "montags" = jeden Montag
    if (!signal) return null;
    return `RRULE:FREQ=WEEKLY${interval > 1 ? ';INTERVAL=' + interval : ''};BYDAY=${days.join(',')}`;
}

/* Hat der User gesagt, dass die Erinnerung WICHTIG ist bzw. dass Jarvis nachhaken soll? (Rückfall, falls die KI das Feld vergisst) */
function importantFromText(text) {
    return /\b(wichtig\w*|unbedingt|nachhak\w*|nachfass\w*|frag\w*\s+(?:mich\s+)?(?:so lange\s+)?nach|bis ich (?:es |das )?(?:bestätig\w*|erledigt|abhak\w*))\b/i.test(String(text || ''));
}

/* "Erledigt", "habe ich genommen" ... beendet das Nachfassen bei wichtigen Erinnerungen. Gibt true zurück, wenn behandelt. */
function handleAcknowledgeCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 60) return false;
    if (!/\b(erledigt|gemacht|genommen|getan|abgehakt)\b/.test(t)) return false;
    if (/\b(nicht|kein|keine|nie|wie|wann|was|warum|wo|welche)\b/.test(t)) return false;
    const active = reminderEntries.filter(r => r.important && r.triggered && !r.done);
    if (active.length === 0) return false;

    const ignore = new Set(['erledigt', 'gemacht', 'genommen', 'getan', 'abgehakt', 'danke', 'habe', 'schon', 'bereits', 'jetzt']);
    const words = t.split(' ').filter(w => w.length >= 4 && !ignore.has(w));
    let targets = words.length ? active.filter(r => words.some(w => r.text.toLowerCase().includes(w))) : [];
    if (targets.length === 0) targets = active;

    targets.forEach(r => { r.done = true; });
    setPersistentData('helfer_reminders', JSON.stringify(reminderEntries));
    renderAllLists();
    speak(pickRandom(['Sehr gut, ich frage nicht mehr nach.', 'Notiert, ich lasse Sie in Ruhe.', 'Wunderbar, abgehakt.']), continueConversation);
    return true;
}

/* "Erinnere mich in zehn Minuten nochmal" / "in einer halben Stunde wieder" / "später nochmal erinnern":
   legt die zuletzt ausgelöste Erinnerung neu an. Gibt true zurück, wenn behandelt. */
function handleSnoozeCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 70) return false;
    if (!lastFiredReminder || Date.now() - lastFiredReminderAt > 2 * 3600000) return false;
    if (!/(nochmal|noch einmal|erneut|wieder)/.test(t) && !/erinner/.test(t)) return false;

    let minutes = null;
    if (/halbe[nr]? stunde/.test(t)) minutes = 30;
    const m = t.match(/\b(?:in|nach)\s+(\d{1,3}|[a-zäöüß]+)\s*(minuten|minute|min|stunden|stunde|std)\b/);
    if (m) {
        const n = parseGermanNumber(m[1]);
        if (n) minutes = /^(stunde|stunden|std)$/.test(m[2]) ? n * 60 : n;
    }
    if (minutes === null && /(später|spaeter)/.test(t) && /erinner/.test(t)) minutes = 10;
    if (minutes === null) return false;
    // Nur, wenn "nochmal"/"wieder" oder "später" dabei steht - "Erinnere mich in 10 Minuten an die Wäsche" ist eine neue Erinnerung
    if (!/(nochmal|noch einmal|erneut|wieder|später|spaeter)/.test(t)) return false;

    const rem = lastFiredReminder;
    rem.done = true;
    setPersistentData('helfer_reminders', JSON.stringify(reminderEntries));
    const when = minutes % 60 === 0 ? (minutes === 60 ? 'einer Stunde' : (minutes / 60) + ' Stunden') : minutes + ' Minuten';
    addGoogleCalendarReminder(rem.text, new Date(Date.now() + minutes * 60000).toISOString(), null, !!rem.important).then(res => {
        speak(res.synced
            ? `Gut, ich erinnere Sie in ${when} noch einmal.`
            : `Ich erinnere Sie in ${when} noch einmal, aber nur in der App. ${googleProblemText(lastGoogleProblem)}`, continueConversation);
    }).catch(() => speak('Das Verschieben hat leider nicht geklappt.'));
    return true;
}
