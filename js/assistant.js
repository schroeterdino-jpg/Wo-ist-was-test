/* ============================================================
   ASSISTANT: Ablauf einer Sprachanfrage (sendToGroqSmart): Kontext sammeln, KI fragen, Aktionen ausführen, antworten.
   Die Einzelteile liegen in eigenen Dateien: answers.js, actions.js, reminders.js, persona.js, prompt.js, routing.js,
   localcommands.js, systemcheck.js. Diese Datei muss NACH allen davon geladen werden.
   ============================================================ */

/* Durchsucht das semantische Gedächtnis (api/memory.js -> Upstash Vector) nach Erinnerungen, die
   inhaltlich zur aktuellen Frage passen - findet auch Umschreibungen, nicht nur ähnliche Wörter wie das
   normale Gedächtnis (searchMemory). Kein Fehler-Popup bei Problemen: liefert dann einfach eine leere
   Liste, die App funktioniert auch ganz ohne semantisches Gedächtnis weiter. */
async function searchSemanticMemory(text) {
    const q = String(text || '').trim();
    if (!q || q.length < 4) return [];
    try {
        const res = await apiFetch('/api/memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'search', query: q, topK: 5 })
        });
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data.treffer) ? data.treffer.map(t => t.text) : [];
    } catch (e) {
        return [];
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
    // Bei reinem Smalltalk/einer kurzen Höflichkeitsfrage ("Wie geht's dir?", "Alles klar bei dir?") ist selbst
    // die neutrale Zwischenansage noch unpassend - niemand braucht "einen Moment", um sowas zu beantworten.
    // Dafür komplett weggelassen, auch wenn die Antwort mal etwas länger braucht (z.B. durch die
    // Gedächtnis-Suche im Hintergrund) - dann wartet man eben kurz in Stille statt eine seltsame Floskel zu hören.
    const SMALLTALK_NO_ACK = /^(?:(?:na|hey|hi|hallo|moin|servus)[,\s]*)?(?:(?:guten (?:morgen|tag|abend)|gute nacht)[,\s]*)?(?:jarvis[,\s]*)?(?:wie geht(?:'?s| es)(?: dir| ihnen)?|alles (?:klar|gut|ok|okay)(?: bei dir| bei ihnen)?|was machst du(?: gerade| so)?|wie läuft'?s(?: bei dir)?)?[?!.\s]*$/i;
    const ackTimer = SMALLTALK_NO_ACK.test(text.trim()) ? null : setTimeout(() => {
        if (opts.collect) return;   // im Protokoll wird nicht zwischendurch gesprochen
        speakAck(pickRandom(ackPhrasesFor(text)));
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
    const semanticMemoryHits = await searchSemanticMemory(text);   // bedeutungsähnliche Erinnerungen zur aktuellen Frage

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
        gedächtnis_semantisch: semanticMemoryHits,
        kontakte: savedContacts,
        // die nächsten 60 Termine (mit sich wiederholenden Terminen wären es sonst zu viele)
        termine: [...calendarEntries].sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate)).slice(0, 60).map(c => ({ id: c.id, text: c.text, ...describeEventDate(c.isoDate), isoDate: c.isoDate })),
        erinnerungen: reminderEntries.map(r => ({ id: r.id, text: r.text, ...describeEventDate(r.time), iso: r.time })),
        einkauf: shoppingEntries.map(s => s.text),
        aufgaben_und_notizen: todoEntries.map(t => t.text),
        briefing_wuensche: briefingWishes.map(w => ({ id: w.id, art: w.type === 'item' ? 'gegenstand' : 'hinweis', text: w.text }))
    };

    const systemPrompt = buildSystemPrompt(text, contextData, nowGermanIso);

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
                    arrivalTime: travelAction.travel_arrival_time || '',
                    wantFuel: true
                });
                travelReply = res.reply;
                if (res.sprit) {
                    const s = res.sprit;
                    travelReply += ` Übrigens, der günstigste Diesel auf der Strecke kostet gerade ${s.preis.toFixed(3).replace('.', ',')} Euro bei ${s.name || 'einer Tankstelle unterwegs'}.`;
                }
                ctx.cards.push(res.card);
                (res.stauCards || []).forEach(c => ctx.cards.push(c));
                (res.webcamCards || []).forEach(c => ctx.cards.push(c));
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
                bahnReply = e.userMessage || pickRandom(['Die Bahn-Daten wollen gerade nicht zu mir durchdringen.', 'Da streikt gerade die Verbindung, nicht die Bahn selbst.']);
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
        clearTimeout(ackTimer);   // VOR speak(), nicht erst im finally-Block - schließt das Zeitfenster für eine überlappende Zwischenansage ganz
        speak(replyText, continueConversation);
    } catch (e) {
        renderAllLists();
        stopThinkingSound();
        updateTerminalStream("SYS_ERR: COMMS_FAILURE", "ERROR");
        const failText = (e && e.auth) ? e.userMessage : pickRandom([
            `Verzeihen Sie, ${currentUserName}, meine Sensoren scheinen gerade blockiert zu sein.`,
            `Da hakt es gerade irgendwo in der Leitung, ${currentUserName}. Nochmal, bitte.`,
            `Entschuldigung, die Verbindung ist mir kurz weggebrochen. Versuchen Sie es noch einmal.`,
            `Hm, da war wohl gerade niemand zu Hause am anderen Ende. Einen Moment, und nochmal bitte.`
        ]);
        clearTimeout(ackTimer);
        if (opts.collect) opts.collect(failText, []); else speak(failText);
    } finally {
        clearTimeout(ackTimer);
        stopThinkingSound();
        isProcessing = false;
    }
}

