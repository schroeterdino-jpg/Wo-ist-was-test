/* ============================================================
   ASSISTANT: Sprachbefehl an die KI senden, Antwort verarbeiten
   Braucht: alle anderen Dateien (muss als LETZTE geladen werden)
   ============================================================ */

async function sendToGroqSmart(text) {
    isProcessing = true;
    startThinkingSound();
    typeWriterStatus("Verarbeite Anweisung, Sir...");
    updateTerminalStream("CPU_LOAD: PROCESSING_NLP...", "PROCESSING");

    if (recordBtn) recordBtn.classList.remove('recording');
    if (recordText) recordText.textContent = "J.A.R.V.I.S. / VERARBEITET...";

    const ackTimer = setTimeout(() => {
        speakAck(pickRandom(["Einen Augenblick, Sir.", "Ich kümmere mich darum.", "Einen Moment, Sir."]));
    }, ACK_DELAY_MS);

    let liveWeather = null;
    if (/wetter|regen|regnet|regenschirm|temperatur|grad|jacke|kalt|warm|sonne|wind/i.test(text)) {
        typeWriterStatus("Rufe aktuelle Wetterdaten ab...");
        updateTerminalStream("API_FETCH: WEATHER_DATA", "FETCHING");
        const rawWeather = await fetchWeatherData();
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
        typeWriterStatus("Ermittle Standort, Sir...");
        updateTerminalStream("GPS_FETCH: LOCATION_DATA", "FETCHING");
        liveLocation = await fetchUserLocationData();
    }

    const now = new Date();
    const nowGermanIso = now.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');

    const contextData = {
        heute_datum: nowGermanIso,
        aktuelles_jahr: now.getFullYear(),
        wetter: liveWeather,
        standort: liveLocation,
        tankstellen: await tankFuerFrage(text),
        gedächtnis: memoryItems,
        kontakte: savedContacts,
        termine: calendarEntries.map(c => ({ id: c.id, text: c.text, datum: c.date, isoDate: c.isoDate })),
        erinnerungen: reminderEntries.map(r => ({ id: r.id, text: r.text, zeit: r.time })),
        einkauf: shoppingEntries.map(s => s.text),
        aufgaben_und_notizen: todoEntries.map(t => t.text)
    };

    const systemPrompt = "Du bist J.A.R.V.I.S., eine hochintelligente KI und der persönliche Butler von " + currentUserName + ". Deine Sprache ist durchgehend höflich, ruhig, distanziert und im Stile eines britischen Butlers gehalten. Du bist knapp: Deine Antworten werden laut vorgelesen und bestehen in der Regel aus einem, höchstens zwei kurzen Sätzen. Du nutzt trockenen, subtilen Sarkasmus, bist aber nie geschwätzig und wiederholst nicht, was der User gerade gesagt hat. Du sprichst den User mit 'Sir' oder '" + currentUserName + "' an, aber sparsam und nicht in jedem Satz. Du beantwortest alle Anfragen präzise, effizient und ohne Markdown-Formatierung.\n\n" +
    "Aktueller Kontext: " + JSON.stringify(contextData) + "\n\n" +
    "WICHTIG für Fragen zu Standort & Aufenthaltsort:\n" +
    "- Dir stehen im Kontext unter 'standort' aktuelle Daten zur Verfügung. Nutze Ort, Land oder Adresse, um Fragen wie 'Wo bin ich?' oder 'Sag mir meinen Standort' präzise zu beantworten (z.B. 'Sie befinden sich derzeit in [Ort], [Land], Sir.').\n" +
    "- Falls 'standort' einen Fehler hat, teile höflich mit, dass der Zugriff verweigert oder nicht verfügbar ist.\n\n" +
    "WICHTIG für Fragen zu Wetter, Regen & Regenschirm:\n" +
    "- Dir stehen im Kontext unter 'wetter' aktuelle Daten zur Verfügung. Nutze sie, um Fragen wie 'Wie wird das Wetter?', 'Brauche ich einen Regenschirm?' oder 'Regnet es heute?' direkt zu beantworten.\n" +
    "- Sage NIEMALS, dass du keine Wetterdaten hast, wenn das Feld 'wetter' im Kontext befüllt ist.\n" +
    "- Übernimm die Empfehlungen ('regenschirm_empfehlung', 'jacken_empfehlung') stets exakt.\n\n" +
    "WICHTIG für die Einkaufsliste:\n" +
    "- Wenn der User nach dem Inhalt der Einkaufsliste fragt (z.B. 'Was steht auf meiner Einkaufsliste?', 'Was ist auf meiner Einkaufsliste?', 'Zeig mir die Einkaufsliste'), nutze AUSSCHLIESSLICH den Typ 'chat' und zähle die Artikel aus dem Kontext ('einkauf') in deiner 'reply' auf. Verwende in diesem Fall NIEMALS den Typ 'shopping'.\n" +
    "- Zähle bei einer Abfrage der Einkaufsliste jeden Artikel aus dem 'einkauf'-Array exakt nur einmal auf und nenne ihn niemals doppelt in deiner 'reply'.\n" +
    "- Verwende den Typ 'shopping' NUR, wenn der User explizit etwas hinzufügen möchte (z.B. 'Füge X hinzu', 'Packe Y auf die Einkaufsliste').\n\n" +
    "WICHTIG für Termine & Kalender:\n" +
    "- Wenn der User einen neuen Termin anlegt ('calendar'), berechne den exakten ISO-Zeitstempel (ISO 8601 im Format YYYY-MM-DDTHH:mm:ss) in 'calendar_time' basierend auf dem aktuellen Datum (" + nowGermanIso + ").\n" +
    "- Wenn der User einen Termin ändern möchte ('calendar_update'), ermittle die korrekte 'calendar_id' aus dem Kontext ('termine'), den neuen Titel in 'calendar_text' (falls geändert) und den neuen Ziel-Zeitpunkt als ISO-String in 'calendar_time'.\n" +
    "- Wenn der User einen Termin löschen möchte ('calendar_delete'), gib den Suchbegriff oder die ID in 'calendar_query' an.\n" +
    "- Wenn Angaben für einen neuen Termin oder eine Änderung unvollständig sind (z.B. Uhrzeit fehlt), antworte im 'chat'-Modus und stelle genau eine kurze Rückfrage nach den fehlenden Details. Das Gespräch geht danach automatisch weiter.\n\n" +
    "Gib IMMER ein valides JSON-Objekt zurück mit folgenden Feldern:\n" +
    "- type: \"chat\", \"memory_store\", \"memory_search\", \"todo\", \"calendar\", \"calendar_delete\", \"calendar_update\", \"reminder\", \"reminder_delete\", \"shopping\", \"name_change\"\n" +
    "- reply: Kurze, trockene J.A.R.V.I.S.-Antwort ohne Markdown, meist ein Satz, höchstens zwei. Aktionen bestätigst du knapp (z.B. 'Erledigt, Sir.' oder 'Notiert.'). Nur beim Vorlesen von Listen (Einkauf, Termine, Aufgaben) darf die Antwort länger sein.\n" +
    "- calendar_text: (bei calendar oder calendar_update) Titel des Termins.\n" +
    "- calendar_time: (bei calendar oder calendar_update) ISO-Zeitstempel.\n" +
    "- calendar_id: (bei calendar_update or calendar_delete) ID des betroffenen Termins aus dem Kontext.\n" +
    "- calendar_query: (bei calendar_delete) Suchbegriff des Termins.\n" +
    "- reminder_text, reminder_time, reminder_query, shopping_items, todo_items, memory_key, memory_value, new_name.";

    chatHistory.push({ role: "user", content: text });

    let messagesPayload = [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(-6)
    ];

    try {
        const res = await fetch('/api/groq', {
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

        if (ai.type === 'name_change' && ai.new_name) {
            currentUserName = ai.new_name.trim();
            setPersistentData('user_custom_name', currentUserName);
            if (userNameInput) userNameInput.value = currentUserName;
            updateUserGreeting();
            updateTerminalStream(`USER_NAME_UPDATED: ${currentUserName}`);
        } else if (ai.type === 'shopping') {
            const addIntent = /(füg|fueg|pack|setz|schreib|hinzu|nimm|notier|brauch|kauf|besorg)/i.test(text);
            const isAskingForList = !addIntent && /\b(was|welche|zeig\w*|steht|stehen|wie viele)\b/i.test(text);

            if (!isAskingForList) {
                let items = [];
                if (Array.isArray(ai.shopping_items)) items = ai.shopping_items;
                if (ai.shopping_item) items.push(ai.shopping_item);

                if (items.length === 0) {
                    items = [text.replace(/bitte|füge|hinzu|auf|die|einkaufsliste/gi, '').trim() || text];
                }

                items.forEach((item, index) => {
                    let cleanItem = item ? item.trim() : '';
                    if (cleanItem && cleanItem.length < 40 && 
                        cleanItem.toLowerCase() !== 'ja' && 
                        cleanItem.toLowerCase() !== 'nein' && 
                        !cleanItem.toLowerCase().includes('einkaufsliste') &&
                        !cleanItem.toLowerCase().includes('was steht')) {

                        const alreadyExists = shoppingEntries.some(e => e.text.toLowerCase() === cleanItem.toLowerCase());
                        if (!alreadyExists) {
                            shoppingEntries.unshift({ id: Date.now() + index, text: cleanItem });
                        }
                    }
                });
                setPersistentData('helfer_shopping', JSON.stringify(shoppingEntries));
                updateTerminalStream("SHOPPING_LIST: ITEM_ADDED");
            }
        } else if (ai.type === 'todo') {
            const items = ai.todo_items || (ai.todo_text ? [ai.todo_text] : []);
            items.forEach((item, index) => {
                if (item && item.trim()) todoEntries.unshift({ id: Date.now() + index, text: item.trim(), createdDate: 'Per Sprache' });
            });
            setPersistentData('helfer_todo_entries', JSON.stringify(todoEntries));
            updateTerminalStream("TASKS: ENTRY_ADDED");
        } else if (ai.type === 'memory_store' && ai.memory_key) {
            let val = ai.memory_value || "gespeichert";
            memoryItems[ai.memory_key.toLowerCase()] = String(parseMemoryValue(val));
            setPersistentData('helfer_memory', JSON.stringify(memoryItems));
            updateTerminalStream(`MEMORY_WRITE: KEY_${ai.memory_key.toUpperCase()}`);
        } else if (ai.type === 'memory_search' || text.toLowerCase().includes('suche') || text.toLowerCase().includes('wo ist')) {
            const results = searchMemory(ai.memory_search_query || text);
            let responseText = ai.reply || (results.length > 0 ? `Ich habe Folgendes in meinen Registern gefunden: ${results.map(r => `${r.key}:${r.value}`).join(', ')}` : `Dazu konnte ich in meinen Datenbanken leider keinen Eintrag finden, Sir.`);
            renderAllLists();
            stopThinkingSound();
            updateTerminalStream("MEMORY_READ: QUERY_EXEC");
            speak(responseText, continueConversation);
            return;
        } else if (ai.type === 'reminder') {
            await addGoogleCalendarReminder(ai.reminder_text || text, ai.reminder_time);
            updateTerminalStream("REMINDER: CREATED");
        } else if (ai.type === 'reminder_delete') {
            const q = (ai.reminder_query || text).toLowerCase();
            const found = reminderEntries.find(r => r.text.toLowerCase().includes(q) || q.includes(r.text.toLowerCase()));
            if (found) {
                await deleteReminderEntry(found.id);
            } else if (reminderEntries.length > 0) {
                await deleteReminderEntry(reminderEntries[0].id);
            }
            updateTerminalStream("REMINDER: DELETED");
        } else if (ai.type === 'calendar_delete') {
            const q = (ai.calendar_query || text).toLowerCase();
            const found = calendarEntries.find(c => c.text.toLowerCase().includes(q) || q.includes(c.text.toLowerCase()));
            if (found) {
                await deleteCalendarEntry(found.id);
            } else if (calendarEntries.length > 0) {
                await deleteCalendarEntry(calendarEntries[0].id);
            }
            updateTerminalStream("CALENDAR: EVENT_DELETED");
        } else if (ai.type === 'calendar_update') {
            let targetId = ai.calendar_id;
            if (!targetId && ai.calendar_query) {
                const q = ai.calendar_query.toLowerCase();
                const found = calendarEntries.find(c => c.text.toLowerCase().includes(q) || q.includes(c.text.toLowerCase()));
                if (found) targetId = found.id;
            }
            if (!targetId && calendarEntries.length > 0) {
                targetId = calendarEntries[0].id;
            }
            if (targetId) {
                await updateGoogleCalendarEvent(targetId, ai.calendar_text, ai.calendar_time);
            } else {
                await addGoogleCalendarEvent(ai.calendar_text || text, ai.calendar_time);
            }
            updateTerminalStream("CALENDAR: EVENT_UPDATED");
        } else if (ai.type === 'calendar' || ai.calendar_text) {
            await addGoogleCalendarEvent(ai.calendar_text || text, ai.calendar_time);
            updateTerminalStream("CALENDAR: EVENT_ADDED");
        }

        renderAllLists();
        stopThinkingSound();
        speak(ai.reply || `Zu Ihren Diensten, ${currentUserName}. Es ist erledigt.`, continueConversation);
    } catch (e) {
        renderAllLists();
        stopThinkingSound();
        updateTerminalStream("SYS_ERR: COMMS_FAILURE", "ERROR");
        speak(`Verzeihen Sie, ${currentUserName}, bei der Übertragung gab es eine kleine Störung.`);
    } finally {
        clearTimeout(ackTimer);
        stopThinkingSound();
        isProcessing = false;
    }
}

/* --- Spritpreise (Tankerkönig über /api/tank) --- */
async function tankFuerFrage(text) {
    if (!/benzin|diesel|sprit|tank|e10|kraftstoff/i.test(text)) return null;
    typeWriterStatus("Rufe Spritpreise ab...");
    updateTerminalStream("API_FETCH: FUEL_PRICES", "FETCHING");
    try {
        const pos = await new Promise((ok, err) =>
            navigator.geolocation.getCurrentPosition(ok, err, { timeout: 7000, maximumAge: 60000 }));
        const r = await fetch(`/api/tank?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&rad=5`);
        const d = await r.json();
        if (!d.stations || d.stations.length === 0) {
            return { fehler: "Keine geöffneten Tankstellen in der Nähe gefunden." };
        }
        return {
            hinweis: "Preise in Euro pro Liter, nach Entfernung sortiert. Nenne die drei günstigsten Tankstellen für die erfragte Sorte, beginnend mit der günstigsten, jeweils mit Name, Straße und Preis. Bei 'Benzin' ohne Angabe nimm E10. Sprich Preise als Euro und Cent, z.B. 'zwei Euro zweiundzwanzig'. Das ist eine Liste, die Antwort darf daher länger sein.",
            stationen: d.stations
        };
    } catch (e) {
        return { fehler: "Standort oder Spritpreise nicht verfügbar." };
    }
}
