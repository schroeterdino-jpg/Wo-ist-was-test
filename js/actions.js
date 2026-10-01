/* ============================================================
   ACTIONS: Aktionen der KI ausführen (Einkauf, Termin, Erinnerung, Navigation ...) und Kalender nachschlagen
   Aus assistant.js herausgelöst, Code unverändert. Braucht: calendar.js, lists.js, panels.js zur Laufzeit.
   ============================================================ */

/* Etwas hat bei Google nicht geklappt: Die Änderung gilt nur in der App. J.A.R.V.I.S. nennt den ECHTEN Grund
   (siehe lastGoogleProblem in calendar.js) und zeigt die Karte zum erneuten Verbinden nur, wenn das wirklich hilft. */
function googleNotSynced(ctx, what) {
    const problem = (typeof lastGoogleProblem !== 'undefined' && lastGoogleProblem) || null;
    ctx.notes.push(`${googleProblemText(problem)} ${what}.`);
    if (googleNeedsReconnect(problem) && !ctx.cards.some(c => c.onclick === 'loginWithGoogle(false)')) ctx.cards.push(googleReconnectCard());
}

/* Öffnet den ECHTEN Google Kalender (App oder Web) am Tag des gerade angelegten/geänderten Termins, als
   sichtbare Bestätigung, dass er wirklich eingetragen wurde. Normaler https-Link über window.open() -
   genau der Weg, der sich beim Maps-Öffnen als zuverlässig herausgestellt hat (im Gegensatz zu
   Spezial-Befehlen wie "google.navigation:", die das Mikrofon zerschossen bzw. gar nicht ausgelöst haben). */
function openGoogleCalendarApp(isoTimeString) {
    let d = isoTimeString ? new Date(isoTimeString) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    const url = `https://calendar.google.com/calendar/u/0/r/day/${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    try { window.open(url, '_blank', 'noopener'); } catch (e) {}
}

/* ---- Fragen wie "Wann hat Schatz Geburtstag?" werden sofort im Kalender nachgeschlagen, ohne dass die KI die Suche erst anfordern muss ---- */
const CALENDAR_LOOKUP_TRIGGER = /geburtstag|hochzeitstag|jubiläum/i;
const LOOKUP_STOPWORDS = new Set(('wann wer was wie wo welche welcher welchen welches hat haben hab habe hatte hatten ist sind war waren wird werden ' +
    'mein meine meiner meinem meinen meines dein deine unser unsere der die das dem den des ein eine einen einem einer von vom am im in an auf zu zum zur ' +
    'für mit bei nach mir mich uns dir sag sage sagen kannst kann du ich wir sie er es alt bald nächste nächsten nächster nächstes wieder schon noch mal ' +
    'bitte gleich eigentlich doch denn und oder jetzt heute morgen gestern übermorgen diese dieser diesen dieses woche monat jahr genau nochmal kennst ' +
    'weißt weisst frag frage nenn nenne nennen suche such suchen finde finden ob dass damit falls dann also so sehr ganz gerade').split(' '));

function extractCalendarLookupTerms(text) {
    if (!CALENDAR_LOOKUP_TRIGGER.test(text)) return [];
    // Anzeigen ("Zeige meine Geburtstage") und Änderungen ("Lösche ...") laufen über eigene Aktionen
    if (/^\s*(zeig|öffne|lösch|entfern|streich|änder|verschieb|leg|erstell|trag)/i.test(text)) return [];
    const words = String(text).toLowerCase().replace(/[^a-zäöüß\s-]/g, ' ').split(/\s+/).filter(Boolean);
    const terms = words.filter(w => w.length >= 3 && !LOOKUP_STOPWORDS.has(w) && !/^(geburtstag|hochzeitstag|jubiläum)/.test(w));
    return [...new Set(terms)].slice(0, 3);
}

async function lookupCalendar(terms) {
    const phrase = terms.join(' ');
    const queries = [phrase, ...terms].filter((q, i, arr) => q.length >= 3 && arr.indexOf(q) === i).slice(0, 4);
    const combined = { suchbegriffe: [], anzahl_treffer: 0, kommende: [], vergangene: [] };
    const seen = new Set();
    for (const q of queries) {
        const r = await searchGoogleCalendar(q);
        combined.suchbegriffe.push(q);
        if (r.hinweis) combined.hinweis = r.hinweis;
        if (r.verbindung) combined.verbindung = r.verbindung;
        ['kommende', 'vergangene'].forEach(k => (r[k] || []).forEach(t => {
            const key = t.titel + '|' + t.datum;
            if (!seen.has(key)) { seen.add(key); combined[k].push(t); }
        }));
        combined.anzahl_treffer = combined.kommende.length + combined.vergangene.length;
        if (combined.anzahl_treffer > 0 || r.verbindung === 'getrennt') break;   // Gesamtsuche oder erster Treffer genügt
    }
    return combined;
}

/* Führt EINE Aktion der KI aus (Einkauf, Termin, Erinnerung ...).
   ctx.counter sorgt dafür, dass mehrere neue Einträge aus einer Äußerung eindeutige IDs bekommen. */
/* Feste Rückfall-Erkennung für den Ort eines Termins, falls die KI ihn trotz Anweisung mal nicht in
   'calendar_location' einträgt: sucht im Originalsatz nach "in/bei/im/Ort <Ort>". Nicht perfekt, aber
   besser als gar kein Ort. */
const LOCATION_STOPWORDS = new Set(['ordnung', 'ordner', 'kürze', 'zukunft', 'wirklich', 'ruhe']);
function extractLocationFallback(text) {
    const matches = [...String(text || '').matchAll(/\b(?:in|bei|im|Ort)\s+([A-ZÄÖÜ][a-zA-Zäöüß\-]+(?:\s+[A-ZÄÖÜ][a-zA-Zäöüß\-]+){0,2})/g)];
    for (const m of matches) {
        const candidate = m[1].trim();
        if (!LOCATION_STOPWORDS.has(candidate.toLowerCase())) return candidate;
    }
    return '';
}

async function executeAction(action, text, ctx) {
    if (action.type === 'name_change' && action.new_name) {
        currentUserName = action.new_name.trim();
        setPersistentData('user_custom_name', currentUserName);
        if (userNameInput) userNameInput.value = currentUserName;
        updateUserGreeting();
        updateTerminalStream(`USER_NAME_UPDATED: ${currentUserName}`);
    } else if (action.type === 'shopping') {
        const addIntent = /(füg|fueg|pack|setz|schreib|hinzu|nimm|notier|brauch|kauf|besorg)/i.test(text);
        const isAskingForList = !addIntent && /\b(was|welche|zeig\w*|steht|stehen|wie viele)\b/i.test(text);

        if (!isAskingForList) {
            let items = [];
            if (Array.isArray(action.shopping_items)) items = action.shopping_items;
            if (action.shopping_item) items.push(action.shopping_item);

            if (items.length === 0) {
                items = [text.replace(/bitte|füge|hinzu|auf|die|einkaufsliste/gi, '').trim() || text];
            }

            items.forEach((item) => {
                let cleanItem = item ? String(item).trim() : '';
                if (cleanItem && cleanItem.length < 40 && 
                    cleanItem.toLowerCase() !== 'ja' && 
                    cleanItem.toLowerCase() !== 'nein' && 
                    !cleanItem.toLowerCase().includes('einkaufsliste') &&
                    !cleanItem.toLowerCase().includes('was steht')) {

                    const alreadyExists = shoppingEntries.some(e => e.text.toLowerCase() === cleanItem.toLowerCase());
                    if (!alreadyExists) {
                        shoppingEntries.unshift({ id: Date.now() + ctx.counter++, text: cleanItem });
                    }
                }
            });
            setPersistentData('helfer_shopping', JSON.stringify(shoppingEntries));
            updateTerminalStream("SHOPPING_LIST: ITEM_ADDED");
        }
    } else if (action.type === 'todo') {
        const items = action.todo_items || (action.todo_text ? [action.todo_text] : []);
        items.forEach((item) => {
            if (item && item.trim()) todoEntries.unshift({ id: Date.now() + ctx.counter++, text: item.trim(), createdDate: 'Per Sprache' });
        });
        setPersistentData('helfer_todo_entries', JSON.stringify(todoEntries));
        updateTerminalStream("TASKS: ENTRY_ADDED");
    } else if (action.type === 'memory_store' && action.memory_key) {
        let val = action.memory_value || "gespeichert";
        const newKey = action.memory_key.toLowerCase().trim();
        removeKeyVariants(newKey);
        memoryItems[newKey] = String(parseMemoryValue(val));
        setPersistentData('helfer_memory', JSON.stringify(memoryItems));
        updateTerminalStream(`MEMORY_WRITE: KEY_${action.memory_key.toUpperCase()}`);
    } else if (action.type === 'memory_search') {
        // Die Suche selbst und die Antwort dazu passieren in sendToGroqSmart
    } else if (action.type === 'reminder') {
        const rrule = weekdayRuleFromText(text) || buildRecurrenceRule(action.reminder_recurrence_unit, action.reminder_recurrence_interval) || recurrenceFromText(text);
        const important = action.reminder_important === true || action.reminder_important === 'true' || importantFromText(text);
        const remResult = await addGoogleCalendarReminder(action.reminder_text || text, action.reminder_time, rrule, important);
        if (!remResult.synced) googleNotSynced(ctx, 'Die Erinnerung ist nur in der App gespeichert, das Handy klingelt dazu nicht');
        updateTerminalStream("REMINDER: CREATED");
    } else if (action.type === 'reminder_delete') {
        const q = String(action.reminder_query || '').toLowerCase().trim();
        const genericQuery = !q || /^(alle|alles|alle erinnerungen|erinnerungen|meine erinnerungen|alle meine erinnerungen)$/.test(q);
        const wantsAll = action.reminder_delete_all === true || action.reminder_delete_all === 'true' ||
            /\balle[nr]?\s+(?:meine\s+|die\s+)?erinnerungen?\b/i.test(text);
        let targets = [];
        if (wantsAll && genericQuery) {
            targets = [...reminderEntries];                       // wirklich alle
        } else if (wantsAll) {
            targets = reminderEntries.filter(r => r.text.toLowerCase().includes(q) || q.includes(r.text.toLowerCase()));   // alle mit diesem Namen
        } else {
            const qq = (q || text).toLowerCase();
            const found = reminderEntries.find(r => r.text.toLowerCase().includes(qq) || qq.includes(r.text.toLowerCase()));
            if (found) targets = [found];
            else if (reminderEntries.length > 0) targets = [reminderEntries[0]];
        }
        let remDone = true;
        for (const t of targets) {   // eine Serie wird beim ersten Treffer komplett gelöscht, die übrigen Termine daraus sind dann schon weg
            if (!reminderEntries.some(r => r.id === t.id)) continue;
            if ((await deleteReminderEntry(t.id)) === false) remDone = false;
        }
        if (remDone === false) googleNotSynced(ctx, 'Die Erinnerung ist in der App gelöscht, bei Google steht sie noch');
        updateTerminalStream("REMINDER: DELETED");
    } else if (action.type === 'calendar_delete') {
        const q = (action.calendar_query || text).toLowerCase();
        const found = calendarEntries.find(c => c.text.toLowerCase().includes(q) || q.includes(c.text.toLowerCase()));
        let calDone = true;
        if (found) {
            calDone = await deleteCalendarEntry(found.id);
        } else if (calendarEntries.length > 0) {
            calDone = await deleteCalendarEntry(calendarEntries[0].id);
        }
        if (calDone === false) googleNotSynced(ctx, 'Der Termin ist in der App gelöscht, bei Google steht er noch');
        updateTerminalStream("CALENDAR: EVENT_DELETED");
    } else if (action.type === 'calendar_update') {
        let targetId = action.calendar_id;
        if (!targetId && action.calendar_query) {
            const q = action.calendar_query.toLowerCase();
            const found = calendarEntries.find(c => c.text.toLowerCase().includes(q) || q.includes(c.text.toLowerCase()));
            if (found) targetId = found.id;
        }
        if (!targetId && calendarEntries.length > 0) {
            targetId = calendarEntries[0].id;
        }
        let updDone;
        if (targetId) {
            updDone = await updateGoogleCalendarEvent(targetId, action.calendar_text, action.calendar_time, action.calendar_location);
        } else {
            updDone = await addGoogleCalendarEvent(action.calendar_text || text, action.calendar_time, action.calendar_location || extractLocationFallback(text));
        }
        if (updDone === false) googleNotSynced(ctx, 'Die Änderung gilt nur in der App');
        if (updDone !== false) openGoogleCalendarApp(action.calendar_time);
        updateTerminalStream("CALENDAR: EVENT_UPDATED");
    } else if (action.type === 'parking_save') {
        const accuracy = await saveParkingSpot(String(action.parking_note || '').trim());
        if (accuracy && accuracy > 60) ctx.notes.push(`Der Standort ist nur auf etwa ${Math.round(accuracy)} Meter genau.`);
        updateTerminalStream("PARKING: SAVED");
    } else if (action.type === 'home_save') {
        saveHomeAddress(String(action.home_address || '').trim());
        updateTerminalStream("HOME: SAVED");
    } else if (action.type === 'world_live') {
        const kind = String(action.live_type || '').toLowerCase();
        if (kind.startsWith('kam') || kind.startsWith('cam') || kind.startsWith('live')) ctx.panel = { name: 'welt', place: String(action.news_place || '').trim(), mode: 'live' };
        else ctx.panel = { name: 'welt', place: '', mode: kind.startsWith('erd') || kind.startsWith('quake') || kind.startsWith('beben') ? 'quakes' : 'iss' };
        updateTerminalStream("WORLD: LIVE_REQUESTED");
    } else if (action.type === 'world_news') {
        ctx.panel = { name: 'welt', place: String(action.news_place || '').trim() };
        updateTerminalStream("WORLD: NEWS_REQUESTED");
    } else if (action.type === 'protocol_save') {
        const err = saveProtocol(action.protocol_name, action.protocol_steps);
        if (err) throw userError(err);
        updateTerminalStream("PROTOCOL: SAVED");
    } else if (action.type === 'protocol_delete') {
        if (!deleteProtocol(action.protocol_name)) throw userError('Ein Protokoll mit diesem Namen habe ich nicht gefunden.');
        updateTerminalStream("PROTOCOL: DELETED");
    } else if (action.type === 'backup_export') {
        exportAllData();
        updateTerminalStream("BACKUP: EXPORTED");
    } else if (action.type === 'parking_clear') {
        if (!parkingSpot) throw userError('Es ist kein Parkplatz gespeichert.');
        clearParkingSpot(false);
        updateTerminalStream("PARKING: CLEARED");
    } else if (action.type === 'navigate') {
        const navCard = buildNavigationCard(action);
        ctx.cards.push(navCard);
        // Versucht, Maps direkt zu öffnen. Der Spezial-Befehl "google.navigation:" wurde wieder entfernt:
        // per window.open() löst er gar keinen App-Sprung aus (nur eine leere Fehlerseite), per location.href
        // hat er die laufende Mikrofon-Sitzung zerstört - keine der beiden Varianten war brauchbar. Der
        // normale Maps-Link über window.open() ist der einzige Weg, der bei beidem zuverlässig funktioniert
        // hat, auch wenn dabei einmal die Google-Zwischenfrage "Weiter zu Maps?" erscheint.
        if (navCard && navCard.href) {
            try { window.open(navCard.href, '_blank', 'noopener'); } catch (e) {}
        }
        updateTerminalStream("NAVIGATION: LINK_READY");
    } else if (action.type === 'call') {
        ctx.cards.push(buildCallCard(action));
        updateTerminalStream("CALL: LINK_READY");
    } else if (action.type === 'whatsapp') {
        ctx.cards.push(buildWhatsAppCard(action));
        updateTerminalStream("WHATSAPP: LINK_READY");
    } else if (action.type === 'show_panel') {
        const name = String(action.panel || '').toLowerCase().trim();
        if (!VALID_PANELS.includes(name) || name === 'menu') throw userError('Dieses Fenster kenne ich nicht.');
        ctx.panel = { range: action.panel_range, from: action.panel_from, to: action.panel_to, name };
        updateTerminalStream("PANEL: REQUESTED");
    } else if (action.type === 'list_edit') {
        executeListEdit(action, ctx);
        updateTerminalStream("LISTS: EDITED");
    } else if (action.type === 'calendar_search') {
        // Die Suche selbst und die Antwort dazu passieren in sendToGroqSmart
    } else if (action.type === 'briefing_add') {
        const item = String(action.briefing_item || '').trim();
        const wish = String(action.briefing_text || '').trim();
        if (!item && !wish) throw userError('Für das Briefing fehlt mir dazu ein Inhalt.');
        if (item) {
            const ni = normalizeKey(item);
            const inMemory = Object.keys(memoryItems).some(k => {
                const nk = normalizeKey(k);
                return nk && ni && (nk.includes(ni) || ni.includes(nk));
            });
            // Steht der Gegenstand im Gedächtnis, wird er mit Platz genannt; sonst als einfacher Hinweis
            if (inMemory) addBriefingWish('item', item, Date.now() + ctx.counter++);
            else addBriefingWish('text', `Denken Sie an: ${item}.`, Date.now() + ctx.counter++);
        }
        if (wish) addBriefingWish('text', wish, Date.now() + ctx.counter++);
        updateTerminalStream("BRIEFING: WISH_ADDED");
    } else if (action.type === 'briefing_delete') {
        const removed = deleteBriefingWishesByQuery(action.briefing_query || '');
        if (removed === 0) throw userError('Im Briefing habe ich dazu keinen passenden Eintrag gefunden.');
        updateTerminalStream("BRIEFING: WISH_DELETED");
    } else if (action.type === 'calendar' || action.calendar_text) {
        const ort = action.calendar_location || extractLocationFallback(text);
        const rrule = weekdayRuleFromText(text) || buildRecurrenceRule(action.calendar_recurrence_unit, action.calendar_recurrence_interval) || recurrenceFromText(text);
        const addDone = await addGoogleCalendarEvent(action.calendar_text || text, action.calendar_time, ort, rrule);
        if (addDone === false) googleNotSynced(ctx, 'Der Termin ist nur in der App gespeichert, das Handy klingelt dazu nicht');
        // Den ECHTEN Google Kalender öffnen (nicht das eigene Termine-Fenster), als sichtbare Bestätigung,
        // dass der Termin wirklich eingetragen wurde. Nur wenn er tatsächlich bei Google gelandet ist -
        // bei einem rein lokalen Termin (addDone === false) gibt es dort ja nichts zu sehen.
        if (addDone !== false) openGoogleCalendarApp(action.calendar_time);
        updateTerminalStream("CALENDAR: EVENT_ADDED");
    }
}

