/* ============================================================
   ASSISTANT: Sprachbefehl an die KI senden, Aktionen ausführen
   Braucht: alle anderen Dateien (muss als LETZTE geladen werden)
   ============================================================ */

/* Zweiter Durchgang: Die KI bekommt das Ergebnis der Kalendersuche und formuliert die Antwort. */
async function answerWithCalendarResults(messages, firstAi, results) {
    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: [
                    ...messages,
                    { role: "assistant", content: JSON.stringify(firstAi) },
                    { role: "user", content: "Ergebnis deiner Kalendersuche (JSON): " + JSON.stringify(results) +
                        "\n\nBeantworte damit jetzt die Frage des Users im Feld 'reply': kurz, mit Wochentag, Tag und Monat, bei Terminen mit Uhrzeit (die Uhrzeit steht schon gesprochen im Feld 'zeit', übernimm sie wörtlich). Das Datum steht im Feld 'datum' mit ausgeschriebenem Monat: Übernimm es wörtlich und schreibe keine Zahlen wie '11.04.'. 'kommende' sind die nächsten Termine, 'vergangene' die letzten davor. Nutze nur diese Ergebnisse und erfinde nichts. Gibt es keinen Treffer, sage das ehrlich, und wenn ein 'hinweis' vorhanden ist, erwähne ihn kurz. 'actions' bleibt leer." }
                ]
            })
        });
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        return (parsed.reply || '').trim() || null;
    } catch (e) {
        console.error("Antwort zur Kalendersuche fehlgeschlagen", e);
        return null;
    }
}

/* Zweiter Durchgang: Die KI bekommt E-Mail-Daten (Übersicht oder eine ganze Nachricht) und formuliert die Antwort. */
async function answerWithEmailResults(messages, firstAi, data) {
    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: [
                    ...messages,
                    { role: "assistant", content: JSON.stringify(firstAi) },
                    { role: "user", content: "Ergebnis deiner E-Mail-Abfrage (JSON): " + JSON.stringify(data) +
                        "\n\nBeantworte damit jetzt die Frage des Users im Feld 'reply'. Bei einer Übersicht: nenne die Anzahl ungelesener E-Mails und danach kurz Absender und Betreff der wichtigsten, höchstens 5, in normalen Sätzen (kein Aufzählungszeichen, das wird vorgelesen). Bei einer einzelnen E-Mail: lies Absender, Betreff und den Text vor, in eigenen, klaren Sätzen, nichts hinzuerfinden. Erfinde niemals Absender, Betreffs oder Inhalte, die nicht in den Daten stehen. Antworte nur mit JSON: {\"reply\": \"...\"}" }
                ]
            })
        });
        const data2 = await res.json();
        const parsed = JSON.parse(data2.choices[0].message.content);
        return (parsed.reply || '').trim() || null;
    } catch (e) {
        console.error("Antwort zu den E-Mails fehlgeschlagen", e);
        return null;
    }
}

/* Ersatzantwort, falls die KI beim zweiten Durchgang für E-Mails ausfällt */
function formatEmailFallback(data) {
    if (data.email_inhalt) return `${data.email_inhalt.betreff}, von ${data.email_inhalt.von}: ${data.email_inhalt.text}`;
    const ov = data.uebersicht;
    if (!ov || ov.emails.length === 0) return ov && ov.anzahl_ungelesen === 0 ? 'Sie haben keine ungelesenen E-Mails.' : 'Ich habe dazu keine E-Mails gefunden.';
    const teile = ov.emails.slice(0, 5).map(e => `${e.von}: ${e.betreff}`);
    const anzahl = ov.anzahl_ungelesen !== null ? `${ov.anzahl_ungelesen} ungelesene E-Mails. ` : '';
    return anzahl + teile.join('. ');
}

/* Solche Fragen gehen immer an die Internet-Suche */
const WEB_TRIGGER = /fernseh|tv[- ]?programm|tv[- ]?tipp|was läuft|kinoprogramm|im kino|kinofilm|streaming[- ]?tipp|paket|sendungsnummer|sendungsverfolgung|paketverfolgung/i;
const NEARBY_TRIGGER = /restaurant|lokal\b|imbiss|dönerladen|doenerladen|pizzeria|kneipe|(in der nähe|hier in der nähe).*(essen|zu essen)|(essen|zu essen).*(in der nähe|hier in der nähe)|lust auf.*(chinesisch|italienisch|griechisch|türkisch|indisch|thai|japanisch|vietnamesisch|mexikanisch|döner|pizza|sushi|burger|asiatisch)/i;
const STAU_TRIGGER = /\bstau\b|\bverkehr\b|zähfließend|stockend|staumeldung/i;

/* Ersatzantwort, falls die KI beim zweiten Durchgang ausfällt */
function formatCalendarSearchFallback(results) {
    const parts = results.map(r => {
        const next = (r.kommende || [])[0];
        if (next) return `${next.titel}: ${next.datum}${next.zeit && next.zeit !== 'ganztägig' ? ' um ' + next.zeit : ''}`;
        const past = (r.vergangene || [])[0];
        if (past) return `${past.titel}: zuletzt ${past.datum}`;
        return `Zu „${r.suchbegriff}" habe ich im Kalender nichts gefunden${r.hinweis ? ' (' + r.hinweis + ')' : ''}`;
    });
    return parts.join('. ') + '.';
}

/* ---- Internet-Auskunft (Fernsehprogramm, Kinoprogramm, Nachrichten, Öffnungszeiten ...) ----
   Zweiter, eigener KI-Aufruf mit der eingebauten Websuche von Groq. Die Vorlieben aus dem Gedächtnis werden mitgegeben. */
function cleanWebAnswer(raw) {
    let t = String(raw || '')
        .replace(/【[^】]*】/g, '')                 // Quellenmarker der Websuche
        .replace(/https?:\/\/\S+/g, '')             // Links werden nicht vorgelesen
        .replace(/\[\d+\]/g, '')
        .replace(/[*_`#>|]+/g, ' ')                 // Markdown
        .replace(/^\s*[-•]\s+/gm, '')               // Aufzählungszeichen
        .replace(/\s*\n+\s*/g, '. ')
        .replace(/\.\s*\./g, '.')
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (t.length > 900) {                           // zu lang zum Vorlesen: am Satzende kürzen
        const cut = t.slice(0, 900);
        const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
        t = end > 300 ? cut.slice(0, end + 1) : cut;
    }
    return t;
}

function buildWebSearchBody(userText, query) {
    const now = new Date();
    const today = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
    const memory = JSON.stringify(memoryItems || {});
    const system = "Du bist J.A.R.V.I.S., ein belesener, hochintelligenter Butler von " + currentUserName + ". Antworte auf Deutsch, in deinem eigenen, lebendigen Ton - wie in einem echten Gespräch, nicht wie eine auswendig gelernte Standardantwort. Formuliere jedes Mal neu, auch bei ähnlichen Fragen: keine Textbausteine, keine feste Einleitungsfloskel, die du immer wiederholst. Zeig, dass du das Thema wirklich verstehst: ordne die Information kurz ein, statt nur Fakten aufzuzählen, wenn das dem User weiterhilft. " +
        "Nutze die Websuche, um die Frage mit aktuellen, verlässlichen Informationen zu beantworten. Heute ist " + today + ". " +
        "Das Gedächtnis des Users (seine Vorlieben und Notizen, als JSON): " + memory + ". " +
        "Bei Fragen nach Fernsehprogramm, Filmen, Serien oder Kino wählst du nur Sendungen aus, die zu seinen Vorlieben im Gedächtnis passen (zum Beispiel Genres), und nennst höchstens drei mit Sender und Uhrzeit. " +
        "Steht nichts Passendes im Gedächtnis, nenne die Highlights des Abends. " +
        "Schreibe Uhrzeiten ausgeschrieben, zum Beispiel '20 Uhr 15'. Schreibe ohne Markdown, ohne Aufzählungszeichen, ohne Links und ohne Quellenangaben, weil deine Antwort laut vorgelesen wird - meist reichen zwei bis vier Sätze, bei einer Frage, die wirklich mehr Tiefe verdient, darf es auch etwas mehr sein. " +
        "Erfinde nichts. Findest du nichts Verlässliches, sage das ehrlich, aber genauso natürlich formuliert wie der Rest deiner Antworten.";
    return {
        model: "openai/gpt-oss-120b",
        tools: [{ type: "browser_search" }],
        reasoning_effort: "medium",
        messages: [
            { role: "system", content: system },
            { role: "user", content: String(userText) + ((query && query !== userText) ? "\n(Suchanfrage: " + query + ")" : '') }
        ]
    };
}

async function answerWithWebSearch(userText, query) {
    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildWebSearchBody(userText, query))
        });
        if (!res.ok) return null;
        const data = await res.json();
        const content = data && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
        const cleaned = cleanWebAnswer(content);
        return cleaned || null;
    } catch (e) {
        if (e && e.auth) throw e;
        console.error("Internet-Auskunft fehlgeschlagen", e);
        return null;
    }
}

/* Internet-Test für die Einstellungen: zeigt, was zwischen App, Server und Groq wirklich passiert */
async function diagnoseWebSearch(query, log) {
    const q = String(query || '').trim() || 'Was läuft heute Abend im Fernsehen?';
    log('Frage: ' + q);
    log('Bitte warten, die Suche kann bis zu einer Minute dauern ...');
    const started = Date.now();
    let res;
    try {
        res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(buildWebSearchBody(q, ''))
        });
    } catch (e) {
        log('❌ ' + ((e && e.userMessage) ? e.userMessage : 'Keine Verbindung zum Server.'));
        return;
    }
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    const raw = await res.text();
    log(`Antwort nach ${secs} Sekunden, Status ${res.status}`);
    let data = null;
    try { data = JSON.parse(raw); } catch (e) { /* kein JSON */ }
    if (!data) {
        log('❌ Die Antwort war kein JSON: ' + raw.slice(0, 150).replace(/\s+/g, ' '));
        if (res.status === 504 || /timeout|FUNCTION_INVOCATION/i.test(raw)) log('→ Vermutlich Zeitüberschreitung bei Vercel (Suche dauert zu lange).');
        return;
    }
    if (!res.ok || data.error) {
        const em = data.error && (data.error.message || data.error);
        log('❌ Fehler: ' + String(em || res.status).slice(0, 300));
        return;
    }
    const choice = (data.choices && data.choices[0]) || {};
    const msg = choice.message || {};
    const used = Array.isArray(msg.executed_tools) ? msg.executed_tools.length : null;
    log(used === null ? 'Websuche benutzt: nicht erkennbar' : (used > 0 ? `✅ Websuche wurde ${used}-mal benutzt` : '❌ Die KI hat die Websuche NICHT benutzt'));
    const content = cleanWebAnswer(msg.content);
    log(content ? '✅ Antwort: ' + content.slice(0, 500) : '❌ Die Antwort war leer' + (choice.finish_reason ? ' (Grund: ' + choice.finish_reason + ')' : ''));
    log('Fertig.');
}

async function runWebDiagnosis() {
    const out = document.getElementById('webDiagOutput');
    const input = document.getElementById('webDiagInput');
    const lines = [];
    const log = (t) => { lines.push(t); if (out) { out.textContent = lines.join('\n'); out.classList.remove('hidden'); } };
    try { await diagnoseWebSearch(input ? input.value : '', log); }
    catch (e) { log('❌ Unerwarteter Fehler: ' + (e && e.message ? e.message : e)); }
}

/* Der Google Kalender war nicht verbunden: Die Änderung gilt nur in der App. Das sagt J.A.R.V.I.S. ehrlich und zeigt die Karte zum Verbinden. */
function googleNotSynced(ctx, what) {
    ctx.notes.push(`Der Google Kalender ist nicht verbunden. ${what}.`);
    if (!ctx.cards.some(c => c.onclick === 'loginWithGoogle(false)')) ctx.cards.push(googleReconnectCard());
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
        const remSynced = await addGoogleCalendarReminder(action.reminder_text || text, action.reminder_time);
        if (remSynced === false) googleNotSynced(ctx, 'Die Erinnerung ist nur in der App gespeichert, das Handy klingelt dazu nicht');
        updateTerminalStream("REMINDER: CREATED");
    } else if (action.type === 'reminder_delete') {
        const q = (action.reminder_query || text).toLowerCase();
        const found = reminderEntries.find(r => r.text.toLowerCase().includes(q) || q.includes(r.text.toLowerCase()));
        let remDone = true;
        if (found) {
            remDone = await deleteReminderEntry(found.id);
        } else if (reminderEntries.length > 0) {
            remDone = await deleteReminderEntry(reminderEntries[0].id);
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
        ctx.cards.push(buildNavigationCard(action));
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
        const addDone = await addGoogleCalendarEvent(action.calendar_text || text, action.calendar_time, ort);
        if (addDone === false) googleNotSynced(ctx, 'Der Termin ist nur in der App gespeichert, das Handy klingelt dazu nicht');
        updateTerminalStream("CALENDAR: EVENT_ADDED");
    }
}

async function sendToGroqSmart(text, opts = {}) {
    isProcessing = true;
    clearActionCards();
    startThinkingSound();
    typeWriterStatus("Verarbeite Anweisung...");
    updateTerminalStream("CPU_LOAD: PROCESSING_NLP...", "PROCESSING");

    if (recordBtn) recordBtn.classList.remove('recording');
    if (recordText) recordText.textContent = "J.A.R.V.I.S. / VERARBEITET...";

    // Zwischenbescheid während der Wartezeit auf die KI: bewusst NEUTRALE Formulierungen, die sowohl zu
    // einem Befehl ("Termin eintragen") als auch zu einer normalen Gesprächsfrage ("Wie geht's dir?") passen.
    // Früher standen hier Sätze wie "Wird erledigt." oder "Gebe ich sofort ein." - die klangen bei einer reinen
    // Unterhaltungsfrage unpassend, weil sie eine Aktion ankündigten, die es dort gar nicht gibt.
    const ackTimer = setTimeout(() => {
        if (opts.collect) return;   // im Protokoll wird nicht zwischendurch gesprochen
        speakAck(pickRandom([
            "Einen Moment.", "Einen Augenblick.", "Ich denke nach.", "Moment.", "Sofort.", "Verstanden."
        ]));
    }, ACK_DELAY_MS);

    let liveWeather = null;
    let liveForecast = null;
    if (/wetter|regen|regnet|regenschirm|schirm|temperatur|grad|jacke|kalt|warm|sonne|wind|schnee|gewitter|sturm|vorhersage/i.test(text)) {
        typeWriterStatus("Rufe aktuelle Wetterdaten ab...");
        updateTerminalStream("API_FETCH: WEATHER_DATA", "FETCHING");
        const [rawWeather, forecast] = await Promise.all([fetchWeatherData(), fetchWeatherForecast()]);
        liveForecast = forecast;
        if (rawWeather && !rawWeather.fehler) {
            const advice = getWeatherAdvice(rawWeather);
            liveWeather = {
                temperatur_grad: rawWeather.temperatur,
                gefuehlt_grad: rawWeather.gefuehlteTemperatur,
                wind_kmh: advice.wind,
                regen_erwartet: advice.rain,
                regenschirm_empfehlung: advice.schirm,
                jacken_empfehlung: advice.jacke,
                sturm_hinweis: advice.sturm
            };
        }
    }

    let liveLocation = null;
    if (/wo bin ich|standort|wo ich bin|aktueller ort|wo befinde ich mich/i.test(text)) {
        typeWriterStatus("Ermittle Standort...");
        updateTerminalStream("GPS_FETCH: LOCATION_DATA", "FETCHING");
        liveLocation = await fetchUserLocationData();
    }

    let calendarLookup = null;
    const lookupTerms = extractCalendarLookupTerms(text);
    if (lookupTerms.length > 0) {
        typeWriterStatus("Durchsuche den Kalender...");
        updateTerminalStream("API_FETCH: CALENDAR_LOOKUP", "FETCHING");
        try { calendarLookup = await lookupCalendar(lookupTerms); } catch (e) { calendarLookup = null; }
    }

    const now = new Date();
    const nowGermanIso = now.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');
    const nearbyFuelData = await tankFuerFrage(text);   // auch für die HUD-Karten unten genutzt

    const contextData = {
        heute_datum: nowGermanIso,
        heute_lesbar: now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }),
        uhrzeit_jetzt: formatSpokenTime(now),
        aktuelles_jahr: now.getFullYear(),
        wetter: liveWeather,
        wettervorhersage: liveForecast,
        parkplatz: describeParking(),
        zuhause: homeAddress || null,
        arbeit: workAddress || null,
        protokolle: Object.values(protocols).map(p => ({ name: p.name, schritte: p.steps })),
        standort: liveLocation,
        tankstellen: nearbyFuelData,
        kalendersuche: calendarLookup,
        gedächtnis: memoryItems,
        kontakte: savedContacts,
        // die nächsten 60 Termine (mit sich wiederholenden Terminen wären es sonst zu viele)
        termine: [...calendarEntries].sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate)).slice(0, 60).map(c => ({ id: c.id, text: c.text, ...describeEventDate(c.isoDate), isoDate: c.isoDate })),
        erinnerungen: reminderEntries.map(r => ({ id: r.id, text: r.text, ...describeEventDate(r.time), iso: r.time })),
        einkauf: shoppingEntries.map(s => s.text),
        aufgaben_und_notizen: todoEntries.map(t => t.text),
        briefing_wuensche: briefingWishes.map(w => ({ id: w.id, art: w.type === 'item' ? 'gegenstand' : 'hinweis', text: w.text }))
    };

    const systemPrompt = "Du bist J.A.R.V.I.S., eine hochintelligente KI und der persönliche Butler von " + currentUserName + ". Deine Sprache ist im Stile eines britischen Butlers gehalten: gewählt, aber lebendig. Du bist knapp: Deine Antworten werden laut vorgelesen und bestehen in der Regel aus einem, höchstens zwei kurzen Sätzen. Du hast ein breites Repertoire an Witz statt einer einzigen Masche: mal trockener Sarkasmus, mal eine schlagfertige, pointierte Antwort, mal ein spitzer Seitenhieb, mal (selten) ein ehrliches Kompliment. Du reagierst auf das, was der User konkret sagt, statt jedes Mal denselben Tonfall abzuspulen, und wiederholst nie wortwörtlich denselben Spruch zweimal hintereinander. Bei ernsten Dingen (Erinnerungen wie Medikamente, Fehlermeldungen, Probleme) lässt du den Humor weg und bist einfach klar und hilfreich. Du bist nie geschwätzig und wiederholst nicht, was der User gerade gesagt hat. Der User heißt für dich '" + currentUserName + "'. Du sprichst ihn nur selten damit an, meist gar nicht, und nie in jedem Satz. Das Wort 'Sir' benutzt du nur, wenn der Name des Users 'Sir' lautet. Du beantwortest alle Anfragen präzise, effizient und ohne Markdown-Formatierung.\n\n" +
    "Aktueller Kontext: " + JSON.stringify(contextData) + "\n\n" +
    "WICHTIG für das Sprachverständnis: Achte auf die ABSICHT hinter dem Satz, nicht auf die exakte Formulierung. Ein und dieselbe Absicht kann ganz unterschiedlich klingen, z.B. 'Setz Milch auf die Liste', 'Ich brauche noch Milch' und 'Schreib Milch auf' meinen alle dasselbe; 'Wo ist mein Auto?', 'Ich will zu meinem Auto' und 'Hast du mein Auto gesehen?' drehen sich alle um den gespeicherten Parkplatz. Das gilt in JEDER Kategorie (Termine, Listen, Erinnerungen, Gedächtnis, Navigation, Parkplatz, E-Mails, Fahrzeit usw.), nicht nur bei den Beispielsätzen in dieser Anleitung - die Beispiele zeigen die Aktion, nicht die einzig erlaubte Formulierung. Bist du dir bei der Absicht unsicher, frage lieber knapp nach, statt zu raten oder nichts zu tun.\n\n" +
    "WICHTIG: Ehrlichkeit bei Aktionen:\n" +
    "- Melde nur dann, dass etwas erledigt, hinzugefügt, gelöscht, geändert oder notiert ist, wenn du dafür in 'actions' die passende Aktion angelegt hast. Ohne Aktion ändert sich nichts.\n" +
    "- Das kannst du wirklich: Einkaufsliste, Aufgabenliste, Gedächtnis und Kontakte hinzufügen, ändern und löschen ('list_edit'); Termine und Erinnerungen anlegen, ändern und löschen; Briefing-Wünsche verwalten; Termine, Erinnerungen und Listen in einem Fenster anzeigen ('show_panel'); im Google Kalender nach Terminen und Geburtstagen suchen; Auskunft zu Wetter (auch die Vorhersage für 7 Tage), Standort und Spritpreisen geben; E-Mails prüfen und vorlesen ('email_check', 'email_read'); die Abfahrtszeit für einen Termin berechnen ('travel_time'); Restaurants und Lokale in der Nähe finden ('nearby_places'); alle Daten als Datei sichern ('backup_export'); im Internet nachschlagen ('web_lookup': Fernsehprogramm, Kinoprogramm, Nachrichten, Öffnungszeiten, Ergebnisse und andere aktuelle Fakten); den Parkplatz des Autos merken und dorthin navigieren; Routen und Bus-und-Bahn-Verbindungen als Karte mit Link bereitstellen; Anrufe und WhatsApp-Nachrichten vorbereiten (der User tippt dann auf die Karte); den Namen des Users ändern; Protokolle anlegen und löschen ('protocol_save', 'protocol_delete'); die Karte zeigen ('show_panel' mit 'karte'); die Weltkugel mit aktuellen Nachrichten, Bildern und Videos zu einem Land oder Ort zeigen ('world_news'); die aktuelle Position der ISS oder die Erdbeben der letzten 24 Stunden auf der Weltkugel zeigen ('world_live'); Tankstellen mit den günstigsten Preisen entlang der Fahrstrecke zeigen ('fuel_route'); Bahn- und Busverbindungen mit Abfahrts- und Ankunftszeiten suchen ('bahn'); Live-Kameras zu jedem Ort (Land oder Stadt) über die YouTube-Suche zeigen ('world_live' mit 'kamera'; die App erkennt \"Zeig mir New York live\" auch selbst); das Regenradar auf der Karte zeigen ('show_panel' mit 'karte'; die App erkennt \"Regenradar\" auch selbst). Alles andere kannst du nicht (z.B. selbst anrufen, Nachrichten abschicken, Musik, Geräte steuern). Sage dann ehrlich, dass du das nicht kannst, und lege keine Aktion an.\n" +
    "- Zum Löschen, Ändern oder Leeren von Einkaufsliste, Aufgaben, Gedächtnis und Kontakten nutze IMMER 'list_edit'. Zum Hinzufügen darfst du weiterhin 'shopping', 'todo' und 'memory_store' nutzen.\n" +
    "- 'list_edit': 'list_name' ist 'einkauf', 'aufgaben', 'gedaechtnis' oder 'kontakte'. 'list_op' ist 'add', 'remove', 'clear' oder 'replace'. 'list_items' ist eine Liste von Texten: bei Einkauf und Aufgaben die Einträge, beim Gedächtnis der Begriff, bei Kontakten der Name. 'list_new_value' brauchst du bei 'replace' (neuer Text, neuer Wert bzw. neue Nummer) und beim Hinzufügen zum Gedächtnis (der Wert) oder zu den Kontakten (die Telefonnummer). Nimm die Einträge so, wie sie im Kontext stehen.\n\n" +
    "WICHTIG für Fragen nach Terminen und Geburtstagen im Kalender:\n" +
    "- Im Kontext unter 'termine' stehen nur die nächsten drei Monate. Fragt der User nach einem Termin, Geburtstag oder Ereignis (z.B. 'Wann hat Victoria Geburtstag?', 'Wann ist mein Zahnarzttermin?'), das dort nicht eindeutig steht, nutze die Aktion 'calendar_search' mit dem Kernbegriff (z.B. nur der Name 'Victoria') in 'calendar_search_query'. Schreibe in 'reply' nur einen ganz kurzen Satz wie 'Ich schaue nach.'. Du bekommst danach das Ergebnis der Suche im Google Kalender und antwortest damit.\n" +
    "- Steht im Kontext unter 'kalendersuche' ein Ergebnis, wurde der Kalender für diese Frage schon durchsucht. Beantworte die Frage damit und nutze keine Aktion 'calendar_search'. 'kommende' sind die nächsten Termine (der erste ist der nächste Geburtstag oder Termin), 'vergangene' die letzten davor. Nenne das Datum genau so wie im Feld 'datum'. Ist 'anzahl_treffer' 0 und gibt es keinen 'hinweis', sage ehrlich, dass du dazu keinen Eintrag gefunden hast, und nenne die Suchbegriffe. Gibt es einen 'hinweis', nenne ihn kurz und ehrlich (zum Beispiel welche Kalender nicht lesbar waren). Steht 'verbindung' auf 'getrennt', sage zusätzlich, dass unten eine Karte zum erneuten Verbinden steht.\n" +
    "- Antworte auf Fragen nach Terminen, Geburtstagen oder Ereignissen niemals mit 'nicht gefunden', ohne dass 'kalendersuche' ein Ergebnis enthält oder du 'calendar_search' genutzt hast.\n\n" +
    "WICHTIG fürs Anzeigen von Terminen, Erinnerungen und Listen:\n" +
    "- Sagt der User 'zeige', 'zeig mir' oder 'öffne' (Termine, Erinnerungen, Einkaufsliste, Aufgaben, Gedächtnis, Kontakte, Parkplatz, Briefing-Wünsche, Planer, Einstellungen, Dashboard), nutze die Aktion 'show_panel'. Dann fliegt ein Fenster ins Bild. 'panel' ist 'termine', 'erinnerungen', 'einkauf', 'aufgaben', 'gedaechtnis', 'kontakte', 'parkplatz', 'briefing', 'planer', 'settings' oder 'karte' (dunkle HUD-Karte mit Standort, Route zur Arbeit und Staumeldungen).\n" +
    "- Bei 'termine' und 'erinnerungen' gib den Zeitraum in 'panel_range' an: 'heute', 'morgen', 'diese_woche', 'naechste_woche', 'naechste_7_tage', 'naechste_30_tage' oder 'alle'. Ohne Angabe nimm bei Terminen 'naechste_7_tage' und bei Erinnerungen 'alle'. Für andere Zeiträume (z.B. 'im November') gib 'panel_from' und 'panel_to' als Datum im Format YYYY-MM-DD an.\n" +
    "- Schreibe in 'reply' nur einen ganz kurzen Satz wie 'Bitte sehr.' und lies die Einträge nicht vor, sie stehen im Fenster. Fragt der User dagegen mit 'sag mir', 'lies vor' oder 'was steht ...', antworte gesprochen ohne 'show_panel'.\n\n" +
    "WICHTIG fürs Merken von Dingen im Gedächtnis:\n" +
    "- Bei 'memory_store' (und bei 'list_edit' im Gedächtnis) ist der Begriff nur der Gegenstand, kurz und in der Grundform (z.B. 'schlüssel', 'brille', 'portemonnaie'), niemals mit Zusatz wie 'ort' oder 'platz' ('schlüsselort' ist falsch). 'memory_value' ist der Platz vollständig mit Präposition, genau wie der User ihn gesagt hat (z.B. 'auf dem Küchenschrank', 'in der Schublade'). Lass die Präposition nie weg.\n\n" +
    "WICHTIG für Parkplatz, Navigation, Anrufe und WhatsApp:\n" +
    "- 'Merk dir, wo ich geparkt habe' (oder ähnlich): Aktion 'parking_save'. Nennt der User dazu Details wie 'Ebene 2, Platz 34', schreibe sie in 'parking_note'. Der Standort wird automatisch ermittelt. Soll der Parkplatz vergessen oder gelöscht werden: 'parking_clear'.\n" +
    "- Fragt der User nach seinem Auto oder seinem Parkplatz - egal wie ('Wo ist mein Auto?', 'Wo habe ich geparkt?', 'Hast du mein Auto gesehen?', 'Ich will zu meinem Auto') - antworte mit den Daten aus 'parkplatz' im Kontext (Adresse, Notiz, wann gespeichert). Ist 'parkplatz' leer, sage ehrlich, dass nichts gespeichert ist. Will er sichtbar dorthin (z.B. 'ich will zu meinem Auto', 'bring mich hin'), nutze zusätzlich 'navigate' mit 'nav_to' = 'parkplatz'.\n" +
    "- 'Merk dir meine Heimatadresse: ...' (oder 'Das ist meine Zuhause-Adresse'): Aktion 'home_save' mit 'home_address' = genau die genannte Adresse. Anders als der Parkplatz wird sie NICHT überschrieben, außer der User nennt ausdrücklich eine neue Heimatadresse.\n" +
    "- Sagt der User 'Bring mich nach Hause' oder 'Navigiere mich nach Hause', nutze 'navigate' mit 'nav_to' = 'zuhause'. Ist im Kontext unter 'zuhause' keine Adresse gespeichert, sage ehrlich, dass er sie erst nennen muss ('Merk dir meine Heimatadresse: ...').\n" +
    "- 'navigate' liefert dem User eine Karte mit Link zu Google Maps. 'nav_to' ist das Ziel als Text (Ort, Adresse oder Name). 'nav_from' nur angeben, wenn der User einen anderen Startpunkt nennt; sonst weglassen, dann gilt sein Standort ('von hier'). 'nav_mode' ist 'transit' (Bus und Bahn; will der User Verbindungen mit Zeiten wissen, nutzt du stattdessen 'bahn'), 'walking' (zu Fuß), 'bicycling' (Fahrrad) oder 'driving' (Auto, Standard). Du bekommst keine Fahrzeiten zurück und darfst keine nennen. Sage nur kurz, dass die Verbindung auf der Karte unten steht.\n" +
    "- 'call': 'contact_name' ist der Name aus 'kontakte' im Kontext. 'whatsapp': dazu 'contact_name' und optional 'message_text' (der Text der Nachricht, wie ihn der User diktiert). Du rufst nicht selbst an und schickst nichts ab, du bereitest es nur vor: Sage, dass der User auf die Karte unten tippen muss. Steht der Kontakt nicht in 'kontakte', lege die Aktion trotzdem an; sie meldet dann selbst, dass er fehlt.\n\n" +
    "WICHTIG für die Wettervorhersage (morgen, übermorgen, Wochentage, ganze Woche):\n" +
    "- Im Kontext steht unter 'wettervorhersage' eine Liste 'tage' mit den nächsten sieben Tagen (Wochentag, Höchst- und Tiefstwert, Niederschlag, Regenwahrscheinlichkeit, Empfehlungen). Nutze sie für alle Fragen zu morgen, übermorgen, bestimmten Wochentagen oder der Woche. Übernimm 'regenschirm_empfehlung' und 'jacken_empfehlung' exakt.\n" +
    "- Bei 'die ganze Woche' oder 'am Wochenende' fasse in höchstens drei bis vier kurzen Sätzen zusammen (Trend, Regentage, wärmster und kältester Tag). Nenne Temperaturen als ganze Grad. Enthält 'wettervorhersage' einen Fehler, sage das ehrlich.\n\n" +
    "WICHTIG für das Tages-Briefing:\n" +
    "- Will der User etwas dauerhaft im Briefing genannt haben (z.B. 'Erwähne im Briefing immer, dass ich die Tabletten nehmen soll' oder 'Sag mir im Briefing auch, wo mein Ladekabel ist'), nutze die Aktion 'briefing_add'. Ist es ein Gegenstand aus dem Gedächtnis, gib den Begriff in 'briefing_item' an, er wird dann immer mit seinem Platz genannt. Ist es ein anderer Hinweis oder eine Bitte, formuliere ihn als kurzen Satz in 'briefing_text', so wie er im Briefing gesagt werden soll (z.B. 'Denken Sie an Ihre Tabletten.'). Bedingungen wie 'nur montags' gehören in den Satz (z.B. 'Montags: Die Mülltonne rausstellen.').\n" +
    "- Will der User etwas wieder aus dem Briefing nehmen, nutze 'briefing_delete' mit einem Suchbegriff in 'briefing_query'.\n" +
    "- Die aktuellen Briefing-Wünsche stehen im Kontext unter 'briefing_wuensche'. Fragt der User, was im Briefing steht, zähle sie mit dem Typ 'chat' auf.\n\n" +
    "WICHTIG für E-Mails (nur lesen, es wird nie etwas verschickt, beantwortet oder gelöscht):\n" +
    "- Fragt der User, ob er E-Mails hat, oder bittet um eine Übersicht ('Habe ich E-Mails?', 'Was ist Neues im Postfach?'), nutze 'email_check'. Ohne andere Angabe gilt nur ungelesen; will er ausdrücklich alle/gelesene sehen, setze 'email_unread_only' auf false. Sucht er nach einem Absender oder Wort, setze es in 'email_query'.\n" +
    "- Will der User nur wirklich wichtige E-Mails, keine Werbung/Newsletter ('nur wichtige E-Mails', 'keine Werbe-Mails', 'ohne Newsletter'), setze 'email_important_only' auf true - das blendet automatisch Werbung, Social-Media- und automatische Benachrichtigungs-Mails aus.\n" +
    "- Bittet der User, eine E-Mail vorzulesen ('lies mir die erste vor', 'lies die von Peter vor', 'was steht in der E-Mail von der Bank'), nutze 'email_read' mit 'email_ref' = die Nummer aus der zuletzt gezeigten Liste (z.B. '1' für die erste) oder der Name/das Stichwort, das der User nennt. Ohne vorherige Übersicht in diesem Gespräch frag ihn stattdessen, ob du zuerst nachsehen sollst, oder nutze 'email_check'.\n" +
    "- Schreibe in 'reply' nur 'Ich schaue nach.'. Die eigentliche Antwort wird automatisch aus den echten Daten ergänzt. Erfinde niemals Absender, Betreffs oder Inhalte von E-Mails.\n\n" +
    "WICHTIG für die Abfahrtszeit ('Wann muss ich losfahren?', 'Wie lange dauert die Fahrt zu ...', 'Ist Stau auf meiner Strecke?'):\n" +
    "- Nutze 'travel_time' (nicht 'navigate') - das berechnet die echte Fahrzeit UND prüft aktuelle Stau-/Baustellenmeldungen auf der Strecke. 'navigate' liefert nur einen Kartenlink ohne Fahrzeit oder Verkehrsinfo. Fragt der User nach Fahrzeit, Ankunft, Losfahren, Stau oder Verkehr zu einem Ziel, immer 'travel_time' verwenden, auch wenn der Satz wie eine einfache Navigations-Anfrage klingt ('Ich muss zum X, ist da Stau?').\n" +
    "- Ziele wie 'Arbeit', 'zur Arbeit' oder 'nach Hause' gibst du unverändert als 'travel_destination' an (z.B. 'Arbeit' oder 'Zuhause'), NIEMALS eine Adresse aus dem Gedächtnis oder dem Kontext; die App kennt die gespeicherten Adressen. Die Adressen stehen im Kontext unter 'arbeit' und 'zuhause'. Ist die gewünschte Adresse leer, sage kurz, dass der User sie erst nennen muss ('Merk dir meine Arbeitsadresse: ...' bzw. 'Merk dir meine Heimatadresse: ...').\n" +
    "- Drei Fälle:\n" +
    "  1) Der User nennt einen Termin aus seinem Kalender (z.B. 'wann muss ich zum Zahnarzt los'): 'travel_query' = Stichwort des Termins.\n" +
    "  2) Ohne jede Angabe ('Wann muss ich losfahren?'): weder 'travel_query' noch 'travel_destination' setzen; es wird automatisch der nächste anstehende Termin mit hinterlegtem Ort genommen.\n" +
    "  3) Der User nennt ein Ziel, das kein Termin aus seinem Kalender ist - das kann eine Adresse, ein Ort ODER auch ein Geschäft/eine Firma/eine Sehenswürdigkeit sein, egal ob mit oder ohne Straßenname (z.B. 'Hans-Dewitz-Ring', 'Penny in Schwarzenbek', 'der Bahnhof', 'Aldi'): 'travel_destination' = genau dieses Ziel als Text, unverändert. Lehne solche Ziele NIEMALS mit der Begründung ab, es sei 'keine Straße' oder 'keine Adresse' - die App sucht den Ort automatisch, auch Geschäftsnamen. Nennt er dazu eine Ankunftszeit ('ich muss um 14 Uhr da sein', 'bis 14 Uhr'), setze 'travel_arrival_time' im Format 'HH:MM' (24-Stunden). Ohne Ankunftszeit wird nur die Fahrzeit genannt, ohne Abfahrtsempfehlung.\n" +
    "- Schreibe in 'reply' nur 'Ich schaue nach.'; die genaue Antwort mit Uhrzeiten und Stau-Hinweisen wird automatisch berechnet.\n\n" +
    "WICHTIG für Protokolle (mehrere Befehle unter einem Namen, z.B. 'Feierabend'):\n" +
    "- Legt der User ein Protokoll an ('Lege ein Protokoll Feierabend an: Fahrzeit nach Hause, Wetter und Spritpreise'), nutze 'protocol_save' mit 'protocol_name' (nur der Name, z.B. 'Feierabend') und 'protocol_steps': eine Liste vollständiger deutscher Sätze, die jeweils wie ein eigener Sprachbefehl funktionieren (z.B. 'Wie lange dauert die Fahrt nach Hause?', 'Wie ist das Wetter?', 'Was kosten Benzin und Diesel in der Nähe?'). Höchstens 8 Schritte. Gibt es das Protokoll schon, wird es ersetzt.\n" +
    "- Will der User ein Protokoll löschen, nutze 'protocol_delete' mit 'protocol_name'. Die vorhandenen Protokolle stehen im Kontext unter 'protokolle'; danach gefragt, zähle Name und Schritte kurz auf.\n" +
    "- Das Starten eines Protokolls ('Starte Protokoll Feierabend') übernimmt die App selbst; dafür legst du keine Aktion an.\n\n" +
    "WICHTIG für Bahn- und Busverbindungen:\n" +
    "- Fragt der User nach einer Bahn-, Zug-, S-Bahn-, Bus- oder Verbindung ('Such mir die Bahnverbindung von Hans-Dewitz-Ring nach Schwarzenbek raus', 'Wann fährt der nächste Zug nach Hamburg?', 'Meine Tochter soll um 16 Uhr hier sein, wann muss sie die Bahn nehmen?'), nutze 'bahn' mit 'bahn_from' (Startort; 'hier' für den Standort des Users, 'Zuhause', 'Arbeit' oder der genannte Ort), 'bahn_to' (Ziel, ebenso; 'hier' bedeutet: dort, wo der User gerade ist), 'bahn_time' ('HH:MM', nur wenn eine Uhrzeit genannt wurde) und 'bahn_time_type' ('ankunft', wenn jemand zu einer Uhrzeit ANKOMMEN soll, sonst 'abfahrt'). Fehlt der Startort oder das Ziel (z.B. weiß er nicht, von wo seine Tochter losfährt), frage kurz in 'reply' danach und lege noch KEINE Aktion an. Nenne selbst keine Zeiten, die App liest sie vor. Schreibe in 'reply' nur 'Ich schaue nach.'.\n\n" +
    "WICHTIG für Tankstellen entlang der Fahrstrecke:\n" +
    "- Fragt der User nach günstigem Tanken, Tankstellen oder Spritpreisen AUF DEM WEG, ENTLANG DER STRECKE oder UNTERWEGS zu einem Ziel ('Wo tanke ich günstig auf meinem Weg zur Arbeit?', 'Tankstellen auf dem Weg nach Hause', 'Wo ist Diesel am billigsten auf der Strecke nach Hamburg?'), nutze 'fuel_route' mit 'fuel_destination' (Ziel unverändert: 'Arbeit', 'Zuhause' oder der genannte Ort, NIEMALS eine Adresse aus dem Gedächtnis) und 'fuel_type' ('diesel', 'e10' oder 'e5'; ohne Angabe 'diesel'). Schreibe in 'reply' nur 'Ich schaue nach.'. Fragt er nur nach Spritpreisen in seiner Nähe, nutzt du weiter die Daten unter 'tankstellen' und keine Aktion.\n\n" +
    "WICHTIG für die Weltkugel und Nachrichten zu einem Land, einer Region oder einer Stadt:\n" +
    "- Fragt der User, was gerade irgendwo los ist ('Was ist gerade in Spanien los?', 'Wie sieht es in Griechenland aus?', 'Nachrichten aus Japan'), nutze 'world_news' mit 'news_place' = der Ort in der Grundform ohne Artikel (z.B. 'Spanien', 'Türkei', 'New York'). Will er nur die Weltkugel sehen ('Zeig mir, was auf der Welt los ist'), nutze 'world_news' mit leerem 'news_place'. Dafür kein 'web_lookup'. Die Kugel dreht sich zum Ort, zeigt Meldungen mit Bildern, und J.A.R.V.I.S. liest eine Zusammenfassung selbst vor; schreibe in 'reply' nur 'Ich schaue nach.'.\n\n" +
    "- Fragt der User nach der ISS oder der Raumstation, oder nach Erdbeben ('Wo ist die ISS?', 'Zeig mir die Erdbeben von heute'), nutze 'world_live' mit 'live_type' = 'iss' oder 'erdbeben'. Will der User einen Ort live sehen ('Zeig mir New York live', 'Ich möchte Florida sehen'), nutze 'world_live' mit 'live_type' = 'kamera' und 'news_place' = der Ort. Schreibe in 'reply' nur 'Ich schaue nach.'.\n\n" +
    "WICHTIG für Datensicherung:\n" +
    "- Sagt der User 'Sichere meine Daten' oder 'Exportiere meine Daten', nutze 'backup_export'. Das lädt eine Datei mit allen Listen, Terminen, dem Gedächtnis, Parkplatz und der Heimatadresse herunter.\n\n" +
    "WICHTIG für Restaurants/Lokale in der Nähe ('Zeig mir Restaurants in der Nähe', 'Ich habe Lust auf Chinesisch, gibt es was in der Nähe?'):\n" +
    "- Nutze 'nearby_places'. Nennt der User eine Küche oder Art (z.B. 'Chinesisch', 'Pizza', 'Döner'), setze sie in 'places_query'. Ohne genaue Angabe ('Restaurants in der Nähe', 'Ich habe Hunger') lasse 'places_query' leer. Schreibe in 'reply' nur 'Ich schaue nach.'; die echten Ergebnisse werden automatisch ergänzt. Erfinde niemals Namen oder Adressen von Restaurants.\n\n" +
    "WICHTIG für Fragen nach aktuellem Wissen aus dem Internet:\n" +
    "- Fragt der User nach einem Paket oder einer Sendung ('Wo ist mein Paket?', 'Sendungsnummer ...'), nutze 'web_lookup' mit der Sendungsnummer (falls genannt) und dem Paketdienst (falls genannt, z.B. DHL) in 'web_query'.\n" +
    "- Braucht die Frage aktuelle Informationen aus dem Internet (Fernsehprogramm, Kinoprogramm, Nachrichten, Öffnungszeiten, Ergebnisse, aktuelle Fakten), nutze die Aktion 'web_lookup' mit 'web_query' = kurze Suchanfrage auf Deutsch, z.B. 'Fernsehprogramm heute Abend Horrorfilme Actionfilme'. Bei Fragen nach Fernsehen, Filmen oder Serien nimm die Vorlieben aus dem Gedächtnis (z.B. Genres) in die Suchanfrage auf. Schreibe in 'reply' nur 'Ich schaue nach.'. Die Antwort wird danach automatisch ergänzt. Erfinde niemals selbst Sendungen, Sender oder Uhrzeiten.\n\n" +
    "WICHTIG für die Anrede:\n" +
    "- Der Name des Users ist im Kontext dieser Anweisung angegeben. Sagt der User 'Nenn mich X' oder 'Sprich mich mit X an', nutze die Aktion 'name_change' mit 'new_name' = X. Sagt er 'Hör auf, mich Sir zu nennen' oder 'Nenn mich nicht Sir', nutze 'name_change' mit 'new_name' = 'Dino'. Nach einer Änderung sprichst du ihn so an, wie er es wünscht.\n\n" +
    "WICHTIG für Datumsangaben:\n" +
    "- Nenne Daten immer mit ausgeschriebenem Monat und dem Tag zuerst ('11. April', 'Samstag, der 3. Oktober'), niemals als Zahlen wie '11.04.' oder '4.11.'. In Deutschland steht der Tag vor dem Monat: '11.04.' ist der 11. April. Übernimm Datumsangaben aus den Feldern 'datum', 'heute_lesbar' und 'iso...' wörtlich und rechne sie nicht um.\n\n" +
    "WICHTIG für Uhrzeiten:\n" +
    "- Nenne Uhrzeiten immer exakt und in 24-Stunden-Zählung. Für die aktuelle Uhrzeit nutze 'uhrzeit_jetzt' wörtlich (z.B. 'Es ist 16 Uhr 17.'). Runde nie und verwende keine Ausdrücke wie 'kurz nach', 'kurz vor', 'halb' oder 'Viertel'.\n\n" +
    "WICHTIG für Fragen zu Standort & Aufenthaltsort:\n" +
    "- Dir stehen im Kontext unter 'standort' aktuelle Daten zur Verfügung. Nutze Ort, Land oder Adresse, um Fragen wie 'Wo bin ich?' oder 'Sag mir meinen Standort' präzise zu beantworten (z.B. 'Sie befinden sich derzeit in [Ort], [Land].').\n" +
    "- Falls 'standort' einen Fehler hat, teile höflich mit, dass der Zugriff verweigert oder nicht verfügbar ist.\n\n" +
    "WICHTIG für Fragen zu Wetter, Regen & Regenschirm:\n" +
    "- Dir stehen im Kontext unter 'wetter' aktuelle Daten zur Verfügung. Nutze sie, um Fragen wie 'Wie wird das Wetter?', 'Brauche ich einen Regenschirm?' oder 'Regnet es heute?' direkt zu beantworten.\n" +
    "- Sage NIEMALS, dass du keine Wetterdaten hast, wenn das Feld 'wetter' im Kontext befüllt ist.\n" +
    "- Übernimm die Empfehlungen ('regenschirm_empfehlung', 'jacken_empfehlung') stets exakt.\n\n" +
    "WICHTIG für die Einkaufsliste:\n" +
    "- Wenn der User nach dem Inhalt der Einkaufsliste fragt (z.B. 'Was steht auf meiner Einkaufsliste?', 'Was ist auf meiner Einkaufsliste?'), nutze AUSSCHLIESSLICH den Typ 'chat' und zähle die Artikel aus dem Kontext ('einkauf') in deiner 'reply' auf. Verwende in diesem Fall NIEMALS den Typ 'shopping'.\n" +
    "- Zähle bei einer Abfrage der Einkaufsliste jeden Artikel aus dem 'einkauf'-Array exakt nur einmal auf und nenne ihn niemals doppelt in deiner 'reply'.\n" +
    "- Verwende den Typ 'shopping', wenn der User ausdrücklich etwas hinzufügen möchte (z.B. 'Füge X hinzu', 'Packe Y auf die Einkaufsliste') ODER beiläufig erwähnt, dass er etwas kaufen oder mitbringen muss (siehe 'WICHTIG für beiläufige Notizen' unten).\n\n" +
    "WICHTIG für Termine & Kalender:\n" +
    "- Wenn der User einen neuen Termin anlegt ('calendar'), berechne den exakten ISO-Zeitstempel (ISO 8601 im Format YYYY-MM-DDTHH:mm:ss) in 'calendar_time' basierend auf dem aktuellen Datum (" + nowGermanIso + "). Nennt er dabei einen Ort ('Ort Schwarzenbeck', 'in Hamburg', 'bei Rossmann'), trage NUR den Ort in 'calendar_location' ein - nicht im Titel ('calendar_text') wiederholen.\n" +
    "- Wenn der User einen Termin ändern möchte ('calendar_update'), ermittle die korrekte 'calendar_id' aus dem Kontext ('termine'), den neuen Titel in 'calendar_text' (falls geändert), den neuen Ziel-Zeitpunkt als ISO-String in 'calendar_time' und einen neuen/nachträglichen Ort in 'calendar_location' (falls genannt).\n" +
    "- Wenn der User einen Termin löschen möchte ('calendar_delete'), gib den Suchbegriff oder die ID in 'calendar_query' an.\n" +
    "- Wenn Angaben für einen neuen Termin oder eine Änderung unvollständig sind (z.B. Uhrzeit fehlt), antworte im 'chat'-Modus und stelle genau eine kurze Rückfrage nach den fehlenden Details. Das Gespräch geht danach automatisch weiter.\n\n" +
    "WICHTIG für beiläufige Notizen (Kontext-Erkennung im normalen Gespräch):\n" +
    "- Manche Äußerungen sind weder eine Frage noch ein direkter Befehl an dich, sondern ein Gedanke, den sich der User nur merken will, oft beiläufig eingeworfen: 'Ach übrigens, ...', 'Wenn ich das nächste Mal im Baumarkt bin, muss ich noch Kabelschuhe mitnehmen', 'Ich muss unbedingt noch daran denken, dass ...', 'Notiere mal, dass ...'.\n" +
    "- Erkennst du eine solche Notiz, wähle selbst die passende Liste, ohne nachzufragen: etwas zum Kaufen oder Mitbringen -> 'shopping' (Einkaufsliste); eine Aufgabe oder ein Vorhaben -> 'todo' (Aufgabenliste); ein reiner Fakt, Ort oder Wert zum Nachschlagen -> 'memory_store' (Gedächtnis).\n" +
    "- Nennt der User dabei einen Zusammenhang oder Anlass (z.B. 'wenn ich im Baumarkt bin', 'für das neue Projekt'), hänge ihn in Klammern an den gespeicherten Text an, z.B. 'Kabelschuhe (nächstes Mal im Baumarkt)'.\n" +
    "- Deine 'reply' ist dann NUR eine sehr kurze Bestätigung im Jarvis-Ton, z.B. 'Ist notiert.', 'Notiert, " + currentUserName + ".' oder 'Habe ich vermerkt.' - keine Rückfragen, keine weiteren Erklärungen, keine Wiederholung des Inhalts.\n" +
    "- Diese Regel gilt NICHT, wenn die Äußerung tatsächlich eine Frage ist (z.B. 'Was steht auf meiner Einkaufsliste?') oder ein direkter, expliziter Befehl (z.B. 'Setz Milch auf die Liste') - dort antwortest du wie in den übrigen Regeln gewohnt.\n" +
    "- Reine Feststellungen oder Smalltalk ohne jeden Bezug zu einer Liste, einer Aufgabe oder einem Fakt (z.B. 'Was für ein Tag heute') bleiben 'chat' ohne Aktion; erfinde keine Notiz, wenn keine erkennbar ist.\n\n" +
    "WICHTIG bei mehreren Aufträgen in einem Satz:\n" +
    "- Enthält eine Äußerung mehrere Aufträge (z.B. 'Setz Milch auf die Einkaufsliste und erinnere mich morgen um 8 Uhr an den Arzt'), lege für JEDEN Auftrag eine eigene Aktion im Feld 'actions' an, in der Reihenfolge der Äußerung. Lass keinen Auftrag aus und erfinde keinen dazu.\n" +
    "- Deine 'reply' bestätigt alles zusammen in höchstens zwei kurzen Sätzen (z.B. 'Erledigt. Milch steht auf der Liste, und der Arzt ist für morgen um acht vorgemerkt.').\n" +
    "- Fehlen bei einem Auftrag Angaben (z.B. die Uhrzeit), führe die übrigen Aufträge trotzdem aus, lass den unvollständigen weg und frage in 'reply' kurz nach den fehlenden Angaben.\n" +
    "- Sätze mit Wörtern wie 'suchen' oder 'wo' sind nicht automatisch eine Gedächtnis-Suche. 'Erinnere mich daran, die Brille zu suchen' ist eine Erinnerung ('reminder').\n\n" +
    "Gib IMMER ein valides JSON-Objekt zurück mit folgenden Feldern:\n" +
    "- reply: Kurze, trockene J.A.R.V.I.S.-Antwort ohne Markdown, meist ein Satz, höchstens zwei. Aktionen bestätigst du knapp (z.B. 'Erledigt.' oder 'Notiert.'). Nur beim Vorlesen von Listen (Einkauf, Termine, Aufgaben) darf die Antwort länger sein.\n" +
    "- actions: Liste (Array) der auszuführenden Aktionen. Jede Aktion ist ein Objekt mit dem Feld 'type' und den dazu passenden Feldern (siehe unten). Bei reiner Unterhaltung, Auskünften oder dem Vorlesen von Listen ist 'actions' eine leere Liste.\n" +
    "- type einer Aktion: \"chat\", \"memory_store\", \"memory_search\", \"todo\", \"calendar\", \"calendar_delete\", \"calendar_update\", \"reminder\", \"reminder_delete\", \"shopping\", \"name_change\", \"briefing_add\", \"briefing_delete\", \"list_edit\", \"calendar_search\", \"parking_save\", \"parking_clear\", \"home_save\", \"navigate\", \"call\", \"whatsapp\", \"show_panel\", \"web_lookup\", \"email_check\", \"email_read\", \"travel_time\", \"backup_export\", \"nearby_places\", \"protocol_save\", \"protocol_delete\", \"world_news\", \"world_live\", \"fuel_route\", \"bahn\"\n" +
    "Die folgenden Felder gehören in die jeweilige Aktion, nicht auf die oberste Ebene:\n" +
    "- calendar_text: (bei calendar oder calendar_update) Titel des Termins.\n" +
    "- calendar_time: (bei calendar oder calendar_update) ISO-Zeitstempel.\n" +
    "- calendar_location: (bei calendar oder calendar_update) Ort des Termins, falls genannt - wichtig für die Abfahrtszeit-Berechnung.\n" +
    "- calendar_id: (bei calendar_update or calendar_delete) ID des betroffenen Termins aus dem Kontext.\n" +
    "- calendar_query: (bei calendar_delete) Suchbegriff des Termins.\n" +
    "- reminder_text, reminder_time, reminder_query, shopping_items, todo_items, memory_key, memory_value, memory_search_query, new_name, briefing_text, briefing_item, briefing_query, list_name, list_op, list_items, list_new_value, calendar_search_query, parking_note, home_address, nav_to, nav_from, nav_mode, contact_name, message_text, panel, panel_range, panel_from, panel_to, web_query, email_query, email_unread_only, email_important_only, email_ref, travel_query, travel_destination, travel_arrival_time, places_query, protocol_name, protocol_steps, news_place, live_type, fuel_destination, fuel_type, bahn_from, bahn_to, bahn_time, bahn_time_type.";

    chatHistory.push({ role: "user", content: text });

    let messagesPayload = [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(-6)
    ];

    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: messagesPayload
            })
        });

        const data = await res.json();
        const ai = JSON.parse(data.choices[0].message.content);

        chatHistory.push({ role: "assistant", content: JSON.stringify(ai) });

        // Neues Format: ai.actions ist eine Liste. Altes Format (type auf oberster Ebene) geht weiterhin.
        const actions = Array.isArray(ai.actions)
            ? ai.actions.filter(a => a && typeof a === 'object')
            : [ai];

        // Fragen nach Fernsehen, Kino usw. werden IMMER im Internet nachgeschlagen, auch wenn die KI behauptet, sie hätte keinen Zugriff
        if (WEB_TRIGGER.test(text) && !actions.some(a => a.type === 'web_lookup') &&
            actions.every(a => !a.type || a.type === 'chat' || a.type === 'memory_search')) {
            actions.length = 0;
            actions.push({ type: 'web_lookup', web_query: text });
            ai.reply = 'Ich schaue nach.';
            chatHistory[chatHistory.length - 1] = { role: "assistant", content: JSON.stringify({ reply: ai.reply, actions }) };
        }

        // Fragen nach Restaurants/Lokalen in der Nähe werden IMMER als "nearby_places" behandelt, auch wenn die KI stattdessen einfach etwas erfindet
        if (NEARBY_TRIGGER.test(text) && !actions.some(a => a.type === 'nearby_places') &&
            actions.every(a => !a.type || a.type === 'chat' || a.type === 'memory_search')) {
            actions.length = 0;
            actions.push({ type: 'nearby_places', places_query: extractCuisineKeyword(text) });
            ai.reply = 'Ich schaue nach.';
            chatHistory[chatHistory.length - 1] = { role: "assistant", content: JSON.stringify({ reply: ai.reply, actions }) };
        }

        // Verbindungen: ein Kartenlink für Bus und Bahn wird zur echten Bahn-Auskunft mit Zeiten
        for (const a of actions) {
            if (a.type === 'navigate' && String(a.nav_mode || '').toLowerCase() === 'transit' && a.nav_to) {
                const info = bahnFromText(text);
                a.type = 'bahn'; a.bahn_from = a.nav_from || info.from || 'hier'; a.bahn_to = a.nav_to; a.bahn_time = info.time; a.bahn_time_type = info.type;
            }
        }

        // Bahn-Frage ohne Kartenlink-Aktion (die KI hat nur geantwortet oder eine Fahrzeit angelegt): trotzdem die Bahn-Auskunft mit Zeiten
        if (isBahnQuestion(text) && !actions.some(a => a.type === 'bahn') &&
            actions.every(a => !a.type || ['chat', 'memory_search', 'navigate', 'travel_time'].includes(a.type))) {
            const info = bahnFromText(text);
            actions.length = 0;
            actions.push({ type: 'bahn', bahn_from: info.from, bahn_to: info.to, bahn_time: info.time, bahn_time_type: info.type });
            ai.reply = 'Ich schaue nach.';
            chatHistory[chatHistory.length - 1] = { role: "assistant", content: JSON.stringify({ reply: ai.reply, actions }) };
        }

        // "Wo tanke ich günstig auf meinem Weg zur Arbeit?" wird IMMER mit der Strecken-Abfrage beantwortet
        if (isFuelRouteQuestion(text) && !actions.some(a => a.type === 'fuel_route') &&
            actions.every(a => !a.type || ['chat', 'memory_search', 'navigate', 'travel_time', 'nearby_places'].includes(a.type))) {
            actions.length = 0;
            actions.push({ type: 'fuel_route', fuel_destination: fuelDestFromText(text).dest, fuel_type: fuelTypeFromText(text) });
            ai.reply = 'Ich schaue nach.';
            chatHistory[chatHistory.length - 1] = { role: "assistant", content: JSON.stringify({ reply: ai.reply, actions }) };
        }

        // "Ist Stau auf meiner Strecke?" wird IMMER mit der echten Fahrzeit-/Stau-Berechnung beantwortet,
        // auch wenn die KI stattdessen nur eine einfache Navigation vorgeschlagen hat
        if (STAU_TRIGGER.test(text) && !actions.some(a => a.type === 'travel_time')) {
            const navAction = actions.find(a => a.type === 'navigate' && a.nav_to);
            const spezialZiel = navAction && ['parkplatz', 'meinparkplatz', 'auto', 'meinauto', 'geparktesauto', 'zuhause', 'nachhause', 'heim', 'heimat'].includes(normalizeKey(navAction.nav_to));
            if (navAction && !spezialZiel) {
                actions.length = 0;
                actions.push({ type: 'travel_time', travel_destination: navAction.nav_to });
                ai.reply = 'Ich schaue nach.';
                chatHistory[chatHistory.length - 1] = { role: "assistant", content: JSON.stringify({ reply: ai.reply, actions }) };
            }
        }

        // Gedächtnis-Suche nur, wenn die KI es so will, oder wenn sie nur geantwortet hat
        // und der Satz nach einer Suche klingt. Echte Aufträge (Erinnerung, Termin ...) gehen vor.
        const onlyChat = actions.every(a => !a.type || a.type === 'chat');
        const searchAction = actions.find(a => a.type === 'memory_search');
        const wantsSearch = !!searchAction || (onlyChat && /suche|wo ist/i.test(text));

        // Alle Aktionen nacheinander ausführen; eine kaputte Aktion stoppt die anderen nicht
        const ctx = { counter: 0, cards: [], notes: [], panel: null };
        if (calendarLookup && calendarLookup.verbindung === 'getrennt') ctx.cards.push(googleReconnectCard());
        let okCount = 0;
        const errors = [];
        for (const action of actions) {
            if (action.type === 'calendar_search' || action.type === 'web_lookup' || action.type === 'email_check' || action.type === 'email_read' || action.type === 'travel_time' || action.type === 'nearby_places' || action.type === 'fuel_route' || action.type === 'bahn') continue; // kommen gleich
            try {
                await executeAction(action, text, ctx);
                okCount++;
            } catch (err) {
                console.error("Aktion fehlgeschlagen:", action, err);
                errors.push(err.userMessage || "Einen Teil davon konnte ich leider nicht ausführen.");
            }
        }

        // Kalendersuche: Ergebnis holen und die KI damit antworten lassen (zweiter Durchgang)
        let searchReply = null;
        const searchActions = actions.filter(a => a.type === 'calendar_search');
        if (searchActions.length > 0) {
            typeWriterStatus("Durchsuche den Kalender...");
            updateTerminalStream("API_FETCH: CALENDAR_SEARCH", "FETCHING");
            const results = [];
            for (const a of searchActions) {
                const query = a.calendar_search_query || '';
                results.push({ suchbegriff: query, ...(await searchGoogleCalendar(query)) });
            }
            if (results.some(r => r.verbindung === 'getrennt') && !ctx.cards.some(c => c.onclick === 'loginWithGoogle(false)')) ctx.cards.push(googleReconnectCard());
            searchReply = await answerWithCalendarResults(messagesPayload, ai, results) || formatCalendarSearchFallback(results);
        }

        // E-Mails: Übersicht oder eine bestimmte Nachricht vorlesen (eigener Durchgang, nichts wird verändert oder verschickt)
        let emailReply = null;
        const emailCheckAction = actions.find(a => a.type === 'email_check');
        const emailReadAction = actions.find(a => a.type === 'email_read');
        if (emailCheckAction || emailReadAction) {
            typeWriterStatus("Prüfe E-Mails...");
            updateTerminalStream("API_FETCH: GMAIL", "FETCHING");
            try {
                let data;
                if (emailReadAction) {
                    const id = resolveEmailRef(emailReadAction.email_ref);
                    if (!id) throw userError("Ich weiß nicht genau, welche E-Mail Sie meinen. Fragen Sie mich zuerst, ob Sie E-Mails haben.");
                    data = { email_inhalt: await fetchEmailFullText(id) };
                } else {
                    const overview = await fetchEmailOverview({ onlyUnread: emailCheckAction.email_unread_only !== false, max: 8, query: emailCheckAction.email_query || '', importantOnly: !!emailCheckAction.email_important_only });
                    if (overview.verbindung === 'getrennt' && !ctx.cards.some(c => c.onclick === 'loginWithGoogle(false)')) ctx.cards.push(googleReconnectCard());
                    if (overview.hinweis && overview.verbindung !== 'getrennt') throw userError(overview.hinweis);
                    if (overview.verbindung === 'getrennt') { emailReply = overview.hinweis; data = null; }
                    else data = { uebersicht: overview };
                }
                if (data) emailReply = await answerWithEmailResults(messagesPayload, ai, data) || formatEmailFallback(data);
            } catch (e) {
                emailReply = e.userMessage || "Die E-Mails konnten gerade nicht abgerufen werden.";
            }
        }

        // Abfahrtszeit berechnen ("Wann muss ich losfahren?")
        let travelReply = null;
        const travelAction = actions.find(a => a.type === 'travel_time');
        if (travelAction) {
            typeWriterStatus("Berechne Fahrzeit...");
            updateTerminalStream("API_FETCH: ROUTE", "FETCHING");
            try {
                const res = await computeDepartureAdvice({
                    query: travelAction.travel_query || '',
                    destination: resolveTravelDestination(text, travelAction.travel_destination || ''),
                    arrivalTime: travelAction.travel_arrival_time || ''
                });
                travelReply = res.reply;
                ctx.cards.push(res.card);
                // Bei Stau-Fragen öffnet sich zusätzlich die HUD-Karte mit Route und Meldungen
                if (!opts.collect && res.map && res.map.coords && STAU_TRIGGER.test(text)) ctx.panel = { name: 'karte', mapData: res.map };
            } catch (e) {
                travelReply = e.userMessage || 'Die Fahrzeit konnte gerade nicht berechnet werden.';
                if (e.verbindung === 'getrennt' && !ctx.cards.some(c => c.onclick === 'loginWithGoogle(false)')) ctx.cards.push(googleReconnectCard());
            }
        }

        // Restaurants/Lokale in der Nähe
        let nearbyReply = null;
        const nearbyAction = actions.find(a => a.type === 'nearby_places');
        if (nearbyAction) {
            typeWriterStatus("Suche in der Nähe...");
            updateTerminalStream("API_FETCH: NEARBY", "FETCHING");
            try {
                const res = await findNearbyRestaurants(nearbyAction.places_query || '');
                nearbyReply = res.reply;
                res.cards.forEach(c => ctx.cards.push(c));
            } catch (e) {
                nearbyReply = e.userMessage || 'Die Suche in der Nähe konnte gerade nicht durchgeführt werden.';
            }
        }

        // Spritpreise in der Nähe als HUD-Karten (nicht entlang einer Strecke): die drei günstigsten der erfragten Sorte, günstigste grün markiert
        if (nearbyFuelData && Array.isArray(nearbyFuelData.stationen) && nearbyFuelData.stationen.length) {
            buildNearbyFuelCards(nearbyFuelData.stationen, fuelTypeFromText(text)).forEach(c => ctx.cards.push(c));
        }

        // Tankstellen entlang der Strecke (günstigste zuerst, mit Karten und Markierungen auf der Neon-Karte)
        let fuelReply = null;
        const fuelAction = actions.find(a => a.type === 'fuel_route');
        if (fuelAction) {
            typeWriterStatus("Suche Tankstellen an der Strecke...");
            updateTerminalStream("API_FETCH: FUEL_ROUTE", "FETCHING");
            try {
                const fromText = fuelDestFromText(text);
                const rawDest = fuelAction.fuel_destination || fromText.dest;
                const res = await fuelAlongRouteAdvice({
                    destination: resolveTravelDestination(text, rawDest),
                    destLabel: fromText.label || fuelLabelFor(rawDest),
                    fuelType: String(fuelAction.fuel_type || fuelTypeFromText(text)).toLowerCase()
                });
                fuelReply = res.reply;
                res.cards.forEach(c => ctx.cards.push(c));
                if (!opts.collect && res.map && res.map.coords) ctx.panel = { name: 'karte', mapData: res.map, fuel: res.fuel, fuelLabel: res.label };
            } catch (e) {
                fuelReply = e.userMessage || 'Die Tankstellen an der Strecke konnte ich gerade nicht ermitteln.';
            }
        }

        // Bahn- und Busverbindungen mit Zeiten
        let bahnReply = null;
        const bahnAction = actions.find(a => a.type === 'bahn');
        if (bahnAction) {
            typeWriterStatus("Suche Verbindung...");
            updateTerminalStream("API_FETCH: BAHN", "FETCHING");
            try {
                const info = bahnFromText(text);
                const res = await bahnAuskunft({
                    from: bahnAction.bahn_from || info.from,
                    to: bahnAction.bahn_to || info.to,
                    time: bahnAction.bahn_time || info.time,
                    timeType: bahnAction.bahn_time_type || info.type
                });
                bahnReply = res.reply;
                res.cards.forEach(c => ctx.cards.push(c));
            } catch (e) {
                bahnReply = e.userMessage || 'Die Verbindung konnte ich gerade nicht abfragen.';
                if (e.fallbackCard) ctx.cards.push(e.fallbackCard);
                // Fehlt Start oder Ziel, merkt sich die KI ihre Rückfrage, damit die nächste Antwort ("von Hamburg Hauptbahnhof") dazu passt
                if (/^(Von wo|Wohin)/.test(bahnReply)) chatHistory[chatHistory.length - 1] = { role: "assistant", content: JSON.stringify({ reply: bahnReply, actions: [] }) };
            }
        }

        // Internet-Auskunft (Fernsehprogramm, Nachrichten ...): eigener Aufruf mit Websuche
        let webReply = null;
        const webAction = actions.find(a => a.type === 'web_lookup');
        if (webAction && !searchReply) {
            typeWriterStatus("Durchsuche das Internet...");
            updateTerminalStream("API_FETCH: WEB_SEARCH", "FETCHING");
            webReply = await answerWithWebSearch(text, webAction.web_query || '');
            if (!webReply) webReply = "Die Suche im Internet hat gerade nicht geklappt. Versuchen Sie es bitte gleich noch einmal.";
        }

        let replyText = searchReply || webReply || emailReply || travelReply || nearbyReply || fuelReply || bahnReply || ai.reply;
        if (!replyText) {
            if (wantsSearch) {
                const results = searchMemory((searchAction && searchAction.memory_search_query) || text);
                if (results.length === 0) {
                    replyText = `Dazu konnte ich in meinen Datenbanken leider keinen Eintrag finden.`;
                } else if (results[0].unscharf) {
                    replyText = `Meinten Sie vielleicht "${results[0].key}"? Dazu habe ich: ${results[0].value}`;
                } else {
                    replyText = `Ich habe Folgendes in meinen Registern gefunden: ${results.map(r => `${r.key}:${r.value}`).join(', ')}`;
                }
            } else {
                replyText = `Zu Ihren Diensten, ${currentUserName}. Es ist erledigt.`;
            }
        }

        // Ehrlich bleiben: Was nicht geklappt hat, sagt J.A.R.V.I.S. auch so
        if (errors.length > 0) {
            if (searchReply) replyText = `${searchReply} ${errors.join(' ')}`;
            else if (okCount > 0) replyText = `Das meiste ist erledigt, aber: ${errors.join(' ')}`;
            else replyText = errors.join(' ');
        }

        if (ctx.notes.length > 0 && errors.length === 0) replyText += ' ' + ctx.notes.join(' ');
        if (opts.collect) {   // Protokoll-Lauf: Antwort und Karten abgeben, gesprochen wird am Ende alles zusammen
            opts.collect(replyText, ctx.cards);
            renderAllLists();
            stopThinkingSound();
            return;
        }
        if (ctx.panel && ctx.panel.name === 'welt') {   // die Weltkugel liest die Meldungen selbst vor
            openWelt(ctx.panel.place, ctx.panel.mode);
            renderAllLists();
            stopThinkingSound();
            return;
        }
        showActionCards(ctx.cards);
        if (ctx.panel) openPanel(ctx.panel.name, ctx.panel);
        else if (ctx.cards.length > 0) closePanel();   // Karten (Anruf, Route ...) sollen nicht hinter einem Fenster stecken

        renderAllLists();
        stopThinkingSound();
        if (wantsSearch) updateTerminalStream("MEMORY_READ: QUERY_EXEC");
        speak(replyText, continueConversation);
    } catch (e) {
        renderAllLists();
        stopThinkingSound();
        updateTerminalStream("SYS_ERR: COMMS_FAILURE", "ERROR");
        const failText = (e && e.auth) ? e.userMessage : `Verzeihen Sie, ${currentUserName}, bei der Übertragung gab es eine kleine Störung.`;
        if (opts.collect) opts.collect(failText, []); else speak(failText);
    } finally {
        clearTimeout(ackTimer);
        stopThinkingSound();
        isProcessing = false;
    }
}

/* --- Bahn- und Busverbindungen: Sicherheitsnetz für den Fall, dass die KI nur einen Kartenlink ("navigate") angelegt hat --- */
const BAHN_WORDS_RE = /\b(bahn|zug|züge|s-?bahn|u-?bahn|bus|hvv|verbindung|öpnv|regionalbahn|regionalexpress)\b/i;

/* Ist der Satz eine Frage nach Bahn-/Bus-Verbindungen? (bewusst streng: Autobahn, Internet-Verbindung usw. zählen nicht) */
function isBahnQuestion(text) {
    const t = String(text || '');
    const strong = /\b(bahnverbindung|zugverbindung|bahn|zug|züge|s-?bahn|u-?bahn|hvv|öpnv|regionalbahn|regionalexpress|nahverkehr)\b/i.test(t);
    const conn = /\bverbindung\b/i.test(t) && /\bvon\b.+\bnach\b/i.test(t);
    // Bus und Straßenbahn: nur, wenn es um Fahren/Verbindungen geht (nicht z.B. "Bus" als Wort in einem anderen Zusammenhang)
    const weak = /\b(bus|busse|busverbindung|buslinie|buslinien|straßenbahn|strassenbahn|tram)\b/i.test(t) && /(mit dem|mit der|nehmen|nimmt|fährt|fahren|verbindung|linie|\bvon\b.+\bnach\b)/i.test(t);
    if (!strong && !conn && !weak) return false;
    if (/(internet|wlan|bluetooth|handy|netz|server|kalender)/i.test(t)) return false;
    return /\b(von|nach|zu|zum|zur|bei mir|hier|pünktlich|ankommen|sein)\b/i.test(t);
}

/* Aus dem Satz: { from, to, time, type }; Felder bleiben leer, wenn nichts genannt wurde */
function bahnFromText(text) {
    const t = String(text || '').replace(/[?!]+$/, '');
    const out = { from: '', to: '', time: '', type: 'abfahrt' };
    const tm = t.match(/\b(?:um|ab|bis|gegen)\s+(\d{1,2})(?:[:.](\d{2})|\s*uhr(?:\s*(\d{2}))?)?/i) || t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (tm) out.time = `${String(tm[1]).padStart(2, '0')}:${tm[2] || tm[3] || '00'}`;
    if (out.time && /\b(sein|ankommen|ankommt|ankunft|pünktlich|spätestens|damit|bis)\b/i.test(t)) out.type = 'ankunft';
    const m = t.match(/\bvon\s+(.+?)\s+nach\s+(.+?)(?=\s+(?:um|ab|bis|gegen)\s+\d|\s+(?:raus|heraus)\b|[.,]|$)/i);
    if (m) { out.from = m[1].trim(); out.to = m[2].trim(); }
    else {
        const n = t.match(/\b(?:nach|zu|zum|zur)\s+(.+?)(?=\s+(?:um|ab|bis|gegen)\s+\d|\s+(?:raus|heraus)\b|[.,]|$)/i);
        if (n) out.to = n[1].trim();
        const f = t.match(/\bvon\s+(.+?)(?=\s+(?:nach|zu|zum|zur|los\w*|abfahr\w*|fahr\w*|fähr\w*|komm\w*|ab|um|bis|gegen|damit|bitte)\b|[.,]|$)/i);   // "... von Hamburg Hauptbahnhof losfahren"
        if (f) out.from = f[1].trim();
    }
    if (/^(mir|uns|mich)$/i.test(out.to)) out.to = 'hier';   // "Meine Tochter möchte zu mir"
    if (!out.to && /(\bhier\b|bei mir|zu mir)/i.test(t)) out.to = /zu hause|zuhause/i.test(t) ? 'Zuhause' : 'hier';     // "... soll um 16 Uhr hier sein"
    return out;
}

/* --- Tankstellen entlang der Strecke: Erkennung --- */
const FUEL_WORDS_RE = /tank\w*|sprit|diesel|benzin|\be10\b|\be5\b|kraftstoff/i;
const ROUTE_WORDS_RE = /\b(weg|strecke|route|unterwegs|entlang)\b/i;
function isFuelRouteQuestion(text) { return FUEL_WORDS_RE.test(text) && ROUTE_WORDS_RE.test(text); }

function fuelTypeFromText(text) {
    const t = String(text || '').toLowerCase();
    if (/\be10\b/.test(t)) return 'e10';
    if (/\be5\b|\bsuper\b/.test(t)) return 'e5';
    if (/benzin/.test(t)) return 'e10';   // wie bei den Preisen in der Nähe: "Benzin" heißt E10
    return 'diesel';
}

/* Ziel aus dem Satz: { dest: 'Arbeit', label: 'zur Arbeit' }; dest bleibt leer, wenn keins genannt wurde */
function fuelDestFromText(text) {
    const t = String(text || '');
    const low = t.toLowerCase();
    const work = /\b(arbeit|arbeitsweg|arbeitsstelle|arbeitsplatz)\b/.test(low);
    const home = /(nach hause|nachhause|zuhause|zu hause|heimweg)/.test(low);
    if (work && !home) return { dest: 'Arbeit', label: 'zur Arbeit' };
    if (home && !work) return { dest: 'Zuhause', label: 'nach Hause' };
    const m = t.match(/\b(?:nach|zu|zum|zur|bis)\s+(?:dem\s+|der\s+)?([A-ZÄÖÜ][\wäöüß-]*(?:\s+[A-ZÄÖÜ][\wäöüß-]*){0,2})/);
    if (m) return { dest: m[1].trim(), label: `nach ${m[1].trim()}` };
    return { dest: '', label: '' };
}

function fuelLabelFor(dest) {
    const k = plainKey(dest);
    if (/^(arbeit|zurarbeit)$/.test(k)) return 'zur Arbeit';
    if (/^(zuhause|nachhause|hause)$/.test(k)) return 'nach Hause';
    return dest ? `nach ${dest}` : '';
}

/* --- Spritpreise (Tankerkönig über /api/tank) --- */
let lastTankCache = null;   // { time, data } - hilft bei Folgefragen ohne Tank-Stichwort ("und die Classic?")
const TANK_CACHE_MS = 15 * 60000;

/* HUD-Karten für die drei günstigsten Tankstellen einer Sorte in der Nähe; die günstigste bekommt eine grüne Markierung */
const NEARBY_FUEL_LABELS = { diesel: 'Diesel', e10: 'E10', e5: 'Super E5' };
function buildNearbyFuelCards(stations, fuelType) {
    const label = NEARBY_FUEL_LABELS[fuelType] || 'Diesel';
    const rows = (stations || [])
        .map(s => ({ name: s.name || 'Tankstelle', strasse: s.strasse || '', preis: s[fuelType] }))
        .filter(r => typeof r.preis === 'number' && r.preis > 0);
    rows.sort((a, b) => a.preis - b.preis);
    return rows.slice(0, 3).map((r, i) => ({
        icon: i === 0 ? '🟢' : '⛽',
        title: `${i === 0 ? '🟢 GÜNSTIGSTER PREIS · ' : ''}${r.name} · ${r.preis.toFixed(3).replace('.', ',')} €`,
        subtitle: `${label}${r.strasse ? ' · ' + r.strasse : ''}`,
        href: typeof buildMapsLink === 'function' ? buildMapsLink(r.strasse || r.name, '', 'driving') : undefined
    }));
}

async function tankFuerFrage(text) {
    if (isFuelRouteQuestion(text)) return null;   // Fragen "auf dem Weg zu ..." beantwortet die Strecken-Abfrage, keine Anfrage in der Nähe (Tankerkönig erlaubt nur etwa eine pro Minute)
    const passtThema = /benzin|diesel|sprit|tank|e10|kraftstoff|günstig|kostet|teuer|preis/i.test(text);
    const cacheFrisch = lastTankCache && (Date.now() - lastTankCache.time) < TANK_CACHE_MS;

    if (!passtThema) {
        return cacheFrisch ? lastTankCache.data : null;   // Folgefrage ohne Stichwort: letzten Stand weiterverwenden
    }

    typeWriterStatus("Rufe Spritpreise ab...");
    updateTerminalStream("API_FETCH: FUEL_PRICES", "FETCHING");
    try {
        const pos = await new Promise((ok, err) =>
            navigator.geolocation.getCurrentPosition(ok, err, { timeout: 7000, maximumAge: 60000 }));
        const r = await apiFetch(`/api/tank?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&rad=5`);
        const d = await r.json();
        if (!r.ok || d.error) {   // echter Fehler vom Server: nicht als "keine Tankstellen" ausgeben und nicht zwischenspeichern
            return { fehler: "Die Spritpreise sind gerade nicht verfügbar: " + (d.error || ('Status ' + r.status)) };
        }
        if (!d.stations || d.stations.length === 0) {
            const result = { fehler: "Keine geöffneten Tankstellen in der Nähe gefunden." };
            lastTankCache = { time: Date.now(), data: result };
            return result;
        }
        const result = {
            hinweis: "Preise in Euro pro Liter, nach Entfernung sortiert. Nenne die drei günstigsten Tankstellen für die erfragte Sorte, beginnend mit der günstigsten, jeweils mit Name, Straße und Preis. Bei 'Benzin' ohne Angabe nimm E10. Sprich Preise als Euro und Cent, z.B. 'zwei Euro zweiundzwanzig'. Das ist eine Liste, die Antwort darf daher länger sein. Fragt der User gezielt nach einer bestimmten Tankstelle aus dieser Liste, nenne nur deren Preis(e).",
            stationen: d.stations
        };
        lastTankCache = { time: Date.now(), data: result };
        return result;
    } catch (e) {
        const result = { fehler: "Standort oder Spritpreise nicht verfügbar." };
        lastTankCache = { time: Date.now(), data: result };
        return result;
    }
}


/* ============================================================
   ARBEITSADRESSE, PROTOKOLLE UND FESTE SPRACHBEFEHLE
   - Arbeitsadresse: "Merk dir meine Arbeitsadresse: ..." (wie die Heimatadresse, wird nicht überschrieben)
   - Ziele wie "Arbeit" und "Zuhause" werden in die gespeicherten Adressen umgewandelt
   - Protokolle: mehrere Befehle unter einem Namen ("Starte Protokoll Feierabend")
   - Karte: "Zeig mir die Karte"
   ============================================================ */

let workAddress = getPersistentData('helfer_work_address', '') || '';

function saveWorkAddress(addr) {
    workAddress = String(addr || '').trim();
    setPersistentData('helfer_work_address', workAddress);
    updateTerminalStream("WORK: SAVED");
}

/* "Merk dir meine Arbeitsadresse Neu-Galliner-Ring 6" -> die Adresse, sonst null */
function matchWorkAddressCommand(text) {
    const m = String(text || '').match(/(?:^|\s)(?:merk\w*|speicher\w*|notier\w*|hinterleg\w*|trag\w*|änder\w*|aktualisier\w*)\s.*?\b(?:arbeitsadresse|arbeitsstelle|arbeitsplatz|adresse\s+(?:von|meiner)\s+(?:meiner\s+)?arbeit|adresse\s+(?:der|meiner)\s+arbeit)\b\s*(?:ist|lautet|liegt)?\s*[:,]?\s*(.+)$/i);
    if (!m) return null;
    let addr = m[1].replace(/[.!?]+$/, '').trim();
    if (/(änder|aktualisier)/i.test(text)) addr = addr.replace(/^auf\s+(?!dem\b|der\b|den\b)/i, '');   // "Ändere ... auf Hauptstraße 12"
    return addr.length >= 4 ? addr : null;
}

function plainKey(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}

/* Sagt der Satz selbst "zur Arbeit" bzw. "nach Hause", gilt immer die gespeicherte Adresse - egal, was die KI als Ziel eingesetzt hat
   (sie nimmt sonst manchmal eine ältere, falsch geschriebene Adresse aus dem Gedächtnis). */
function resolveTravelDestination(userText, dest) {
    const t = String(userText || '').toLowerCase();
    const wantsWork = /\b(arbeit|arbeitsweg|arbeitsstelle|arbeitsplatz)\b/.test(t);
    const wantsHome = /(nach hause|nachhause|zuhause|zu hause|heimweg)/.test(t);
    if (wantsWork && !wantsHome) return resolvePersonalPlace('Arbeit');
    if (wantsHome && !wantsWork) return resolvePersonalPlace('Zuhause');
    return resolvePersonalPlace(dest);
}

/* "Arbeit", "zur Arbeit", "nach Hause" ... -> gespeicherte Adresse. Alle anderen Ziele bleiben unverändert. */
function resolvePersonalPlace(dest) {
    const raw = String(dest || '').trim();
    if (!raw) return raw;
    const k = plainKey(raw);
    if (/^(zu|zur|zum|nach|in|ins|auf)?(meine|meiner|mein|meinem)?(arbeit|arbeitsstelle|arbeitsplatz|firma|buro|buero)$/.test(k)) {
        if (!workAddress) throw userError('Ihre Arbeitsadresse kenne ich noch nicht. Sagen Sie: Merk dir meine Arbeitsadresse, und dann die Adresse.');
        return workAddress;
    }
    if (/^(nach|zu|in|ins|auf)?(meine|mein)?(hause|zuhause|heim|heimat|heimatadresse|wohnung)$/.test(k)) {
        const home = (typeof homeAddress === 'string') ? homeAddress : (homeAddress && (homeAddress.address || homeAddress.text || homeAddress.label)) || '';
        if (!home) throw userError('Ihre Heimatadresse kenne ich noch nicht. Sagen Sie: Merk dir meine Heimatadresse, und dann die Adresse.');
        return home;
    }
    return raw;
}

/* ---------- Protokolle ---------- */
const DEFAULT_PROTOCOLS = {
    feierabend: {
        name: 'Feierabend',
        steps: ['Wie lange dauert die Fahrt nach Hause?', 'Wie ist das Wetter?', 'Was kosten Benzin und Diesel in der Nähe?']
    }
};
let protocols = {};
(function loadProtocols() {
    const raw = getPersistentData('helfer_protocols', '');
    if (!raw) {
        protocols = JSON.parse(JSON.stringify(DEFAULT_PROTOCOLS));   // erster Start: "Feierabend" ist schon vorbereitet
        setPersistentData('helfer_protocols', JSON.stringify(protocols));
        return;
    }
    try { protocols = JSON.parse(raw) || {}; } catch (e) { protocols = {}; }
})();
let protocolRunning = false;

/* Fehlertext bei Problemen, sonst null */
function saveProtocol(name, steps) {
    const cleanName = String(name || '').replace(/^protokoll\s+/i, '').trim();
    const key = plainKey(cleanName);
    if (!key) return 'Mir fehlt der Name für das Protokoll.';
    const list = (Array.isArray(steps) ? steps : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 8);
    if (list.length === 0) return 'Mir fehlen die Schritte für das Protokoll.';
    protocols[key] = { name: cleanName, steps: list };
    setPersistentData('helfer_protocols', JSON.stringify(protocols));
    return null;
}

function deleteProtocol(name) {
    const key = plainKey(String(name || '').replace(/^protokoll\s+/i, ''));
    if (!key || !protocols[key]) return false;
    delete protocols[key];
    setPersistentData('helfer_protocols', JSON.stringify(protocols));
    return true;
}

/* Sagt der Satz "Starte Protokoll Feierabend" (oder nur "Feierabend")? Gibt den Schlüssel des Protokolls zurück. */
function findProtocolToRun(text) {
    const raw = String(text || '');
    if (/\b(lege|leg|erstelle|erstell\w*|anlegen|speichere|lösche|löschen|entferne|vergiss|neues|neu)\b/i.test(raw)) return null;   // Anlegen/Löschen macht die KI
    const t = plainKey(raw);
    const hasWord = t.includes('protokoll');
    for (const k of Object.keys(protocols)) {
        const nk = plainKey(protocols[k].name);
        if (!nk) continue;
        if (t === nk || (hasWord && t.includes(nk))) return k;
    }
    return null;
}

async function runProtocol(key) {
    const p = protocols[key];
    if (!p || protocolRunning) return;
    protocolRunning = true;
    isProcessing = true;
    typeWriterStatus(`Protokoll ${p.name} läuft...`);
    updateTerminalStream(`PROTOCOL: RUN_${plainKey(p.name).toUpperCase()}`, "PROCESSING");
    clearActionCards();
    const replies = [];
    const cards = [];
    try {
        for (const step of p.steps) {
            await sendToGroqSmart(step, { collect: (r, c) => { if (r) replies.push(r); (c || []).forEach(x => cards.push(x)); } });
        }
    } finally {
        protocolRunning = false;
        isProcessing = false;
    }
    if (isPanelOpen()) closePanel();
    showActionCards(cards);
    speak(`Protokoll ${p.name}. ` + (replies.length ? replies.join(' ') : 'Ich konnte dazu leider nichts ermitteln.'), continueConversation);
}

/* ---------- Feste Sprachbefehle (ohne Umweg über die KI) ----------
   Gibt true zurück, wenn der Satz hier behandelt wurde. */
function isMapCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, '').trim();
    if (t.length > 70 || !/\b(karte|landkarte|kartenansicht)\b/.test(t)) return false;
    return /(zeig|öffne|öffnen|anzeig|blende|starte|mach\b|mal\b)/.test(t);
}

/* "Zeig mir mein Dashboard", "Dashboard öffnen", "Übersicht anzeigen" */
function isDashboardCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, '').trim();
    if (t.length > 70 || !/(?:^|[^a-zäöüß])(dashboard|übersicht|cockpit)(?:$|[^a-zäöüß])/.test(t)) return false;
    return /(zeig|öffne|öffnen|anzeig|blende|starte|mach\b|mal\b)/.test(t);
}

/* "Was ist gerade in Spanien los?", "Nachrichten aus Japan", "Zeig mir, was auf der Welt los ist"
   -> { place: 'Spanien' } bzw. { place: '' } (nur die Kugel); sonst null */
function matchWorldCommand(text) {
    const t = String(text || '').trim().replace(/[?!.]+$/, '');
    const low = t.toLowerCase();
    if (!t || t.length > 90) return null;
    if (/\b(iss|raumstation)\b/.test(low)) return { place: '', mode: 'iss' };
    if (/\berdbeb\w*|\bbeben\b/.test(low)) return { place: '', mode: 'quakes' };
    if (/\b(weltkugel|globus)\b/.test(low) || /(auf|in) der welt\b|weltweit|zeig\w*\s+(mir\s+)?(bitte\s+)?die welt\b/.test(low)) return { place: '' };
    if (!/(\blos\b|passiert|geschieht|nachrichten|\bnews\b|neuigkeiten|\bneues\b|\blage\b|sieht es .* aus|was läuft|was geht)/.test(low)) return null;
    if (/\b(wetter|regen|regenschirm|temperatur|grad|sprit|benzin|diesel|preise?|fahrzeit|fahrt|stau|restaurants?|essen|hotels?|termine?|kalender|listen?|einkaufsliste|gedächtnis|erinnerung(?:en)?|paket|mails?|briefing|parkplatz)\b/.test(low)) return null;
    const m = t.match(/(?:^|\s)(?:in|aus|von|über|mit|um)\s+(?:(?:der|dem|den|die|das)\s+)?(.+?)(?:\s+(?:gerade|aktuell|jetzt|heute|los|neu|neues|passiert|geschieht|aus|denn|eigentlich))*$/i);
    if (!m) return null;
    const place = m[1].trim();
    if (place.length < 3 || place.length > 40 || /^(mein|dein|unser|hier|dieser|diesem|dieser|meiner|deiner)/i.test(place)) return null;
    return { place };
}

/* "Zeig mir New York live", "Ich möchte gerne mal Florida sehen", "Live-Kamera Tokio"
   -> { place: 'newyork' } (bekannter Ort, Schlüssel) bzw. { place: 'Rom' } (unbekannter Ort); sonst null */
function matchLiveCamCommand(text) {
    const t = String(text || '').trim().replace(/[?!.,]+$/, '');
    const low = t.toLowerCase();
    if (!t || t.length > 90) return null;
    if (/(nachrichten|\bnews\b|\blos\b|passiert|wetter|regen|route|fahr|karte|preis|sprit|stau|termin|kalender|liste|erdbeb|\biss\b|übersetz|dolmetsch)/.test(low)) return null;
    const known = (typeof LIVE_CAMS !== 'undefined') ? LIVE_CAMS.find(c => c.names.some(n => new RegExp('(?:^|[^a-zäöüß])' + n.replace(/ /g, '\\s+') + '(?![a-zäöüß])').test(low))) : null;
    const liveWord = /\b(live|livecam|live-cam|webcam|webcams|kamera|kameras|kamerabild\w*|cam|cams)\b/.test(low);
    const seeStrict = /(zeig\w*|sehen|schauen|anschauen|ansehen|öffne\w*)/.test(low);                 // "möchte nach Paris" allein ist keine Kamera-Bitte
    const wishWord = /(möchte|will\b|lass mich|kann ich)/.test(low);
    if (known && (liveWord || seeStrict)) return { place: known.key };
    if (!known && liveWord && (seeStrict || wishWord)) {
        const rest = low.replace(/\b(zeig\w*|mir|mal|bitte|ich|möchte|will|gerne|live|livecam|live-cam|webcams?|kameras?|kamerabild\w*|cams?|von|aus|in|auf|bilder|die|das|den|dem|der|eine|einen|ein|sehen|ansehen|anschauen|schauen|öffne\w*|lass|mich|kannst|du|kann|ich|zeigen|noch|doch|einmal)\b/g, ' ').replace(/\s+/g, ' ').trim();
        const words = rest.split(' ').filter(Boolean);
        if (words.length >= 1 && words.length <= 3 && rest.length >= 3) return { place: rest.replace(/\b\w/g, c => c.toUpperCase()) };
    }
    return null;
}

/* Ist die Weltkugel offen, genügt ein Ortsname: "Und in Portugal?", "In Spanien", "Japan".
   Bewusst streng: Alles andere (z.B. "Setz Milch auf die Einkaufsliste") geht ganz normal an J.A.R.V.I.S. */
function placeFromFollowUp(text) {
    const t = String(text || '').trim().replace(/[?!.,]+$/, '');
    if (!t || t.length > 40 || t.split(/\s+/).length > 7) return null;
    const stop = /^(jarvis|danke|bitte|hallo|hey|okay|ok|ja|nein|weiter|stopp|stop|schließen|zurück|wetter|karte|radar|liste|termine|kalender|hilfe|mehr|nochmal|wiederholen|gut|super|genau|richtig|falsch|morgen|abend|nacht|heute|jetzt|später|alles|nichts|nix|dann|noch|auch|wieder|wie|was|wo|wer|wann|warum|nähe|umgebung|einkaufsliste|aufgaben|aufgabenliste|erinnerungen|termin|kontakte|gedächtnis|briefing|parkplatz|einstellungen|menü|mir|mich|dir|uns|ich|du|wir|sie|es)$/i;
    const article = '(?:(?:der|dem|den|die|das)\\s+)?';
    let place = null;
    // 1) mit Einleitung: "Und in Portugal", "In Spanien", "Was ist in Italien", "Und Japan"
    let m = t.match(new RegExp('^(?:und\\s+)?(?:was\\s+ist\\s+|wie\\s+ist\\s+es\\s+|wie\\s+sieht\\s+es\\s+)?(?:in|aus|von|über|nach)\\s+' + article + '(.+?)(?:\\s+(?:los|aus|denn))*$', 'i'));
    if (m) place = m[1];
    else {
        m = t.match(new RegExp('^und\\s+' + article + '(.+)$', 'i'));
        if (m) place = m[1];
        // 2) ein einzelnes großgeschriebenes Wort: "Portugal"
        else if (!/\s/.test(t) && /^[A-ZÄÖÜ]/.test(t) && t.length >= 4) place = t;
    }
    if (!place) return null;
    place = place.trim();
    const words = place.split(/\s+/);
    if (words.length > 3 || place.length < 3 || place.length > 30 || /\d/.test(place) || stop.test(place) || stop.test(words[0])) return null;
    return place;
}

/* Ein Fehler in den festen Befehlen darf nie dazu führen, dass Jarvis gar nichts mehr sagt: dann geht der Satz normal an die KI */
function handleLocalCommand(text) {
    try {
        return handleLocalCommandInner(text);
    } catch (e) {
        console.error('Fester Sprachbefehl fehlgeschlagen', e);
        return false;
    }
}

function handleLocalCommandInner(text) {
    const worldCmd = matchWorldCommand(text);
    if (worldCmd) { openWelt(worldCmd.place, worldCmd.mode); return true; }
    const liveCmd = matchLiveCamCommand(text);
    if (liveCmd) { openWelt(liveCmd.place, 'live'); return true; }
    if (typeof isPanelOpen === 'function' && isPanelOpen() && currentPanel && currentPanel.name === 'welt') {
        const followPlace = placeFromFollowUp(text);
        if (followPlace) { openWelt(followPlace); return true; }
    }
    const addr = matchWorkAddressCommand(text);
    if (addr) {
        saveWorkAddress(addr);
        speak(`Arbeitsadresse gespeichert: ${addr}.`, continueConversation);
        return true;
    }
    if (/\b(regenradar|niederschlagsradar|wetterradar|radar)\b/i.test(text) && String(text).length <= 70) {
        if (isPanelOpen() && currentPanel && currentPanel.name === 'karte') hudMapSetRadar(true);
        else openPanel('karte', { radar: true });
        speak(pickRandom(['Hier das Regenradar.', 'Das Radar wird geladen.', 'Sehr wohl, das Regenradar.', 'Einen Blick auf den Himmel, sofort.', 'Ich hole die aktuellen Regendaten.', 'Kommt sogleich.']), continueConversation);
        return true;
    }
    if (isMapCommand(text)) {
        openPanel('karte', {});
        speak(pickRandom(['Bitte sehr.', 'Karte wird aufgebaut.', 'Sehr wohl.', 'Einen Moment, ich lege die Karte auf.', 'Ich rufe die Route ab.', 'Wird sofort aufgebaut.']), continueConversation);
        return true;
    }
    if (isDashboardCommand(text)) {
        if (typeof openDashboard === 'function') openDashboard();
        else openPanel('dashboard', {});
        speak(pickRandom(['Bitte sehr.', 'Dashboard wird aufgebaut.', 'Sehr wohl.', 'Ich stelle die Übersicht zusammen.', 'Einen Augenblick, alles auf einen Blick.', 'Wird sofort zusammengestellt.']), continueConversation);
        return true;
    }
    const pk = findProtocolToRun(text);
    if (pk) {
        runProtocol(pk).catch(e => { console.error('Protokoll fehlgeschlagen', e); speak('Das Protokoll ist leider fehlgeschlagen.'); });
        return true;
    }
    return false;
}
