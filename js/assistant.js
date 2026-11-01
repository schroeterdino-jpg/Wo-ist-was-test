/* ============================================================
   ASSISTANT: Ablauf einer Sprachanfrage (sendToGroqSmart): Kontext sammeln, KI fragen, Aktionen ausführen, antworten.
   Die Einzelteile liegen in eigenen Dateien: answers.js, actions.js, reminders.js, persona.js, prompt.js, routing.js,
   localcommands.js, systemcheck.js. Diese Datei muss NACH allen davon geladen werden.
   ============================================================ */

/* DIE Suche im semantischen Gedächtnis (api/memory.js -> Upstash Vector). Besitzer ist diese Datei; es gibt keine zweite Fassung.
   Alles, was Fragen zur aktuellen Frage passt, kommt aus EINER bedeutungsähnlichen Suche über ALLE Einträge (Merk-dir, Briefing-Fakten, Fristen,
   Erlebnisse ...): kein Filter nach Eintragsart. Zusätzlich dürfen Zusatzquellen (window.jvSuchQuellen, tragen sich selbst ein, egal in welcher
   Ladereihenfolge: langzeit.js = Pläne/Fristen für Datumsfragen, foto_stundenplan.js = Stundenplan) Zeilen beisteuern. Sie brauchen dafür dieselbe
   Gesamtliste: es gibt HÖCHSTENS EINE Gesamtliste-Abfrage pro Frage, und nur wenn eine Quelle sie wirklich braucht (quelle.braucht(frage)).
   Fehlerisolation: die Gesamtliste bekommt höchstens 1 Sekunde; ist sie langsam oder kaputt, bleiben die Treffer der normalen Suche erhalten
   (der Aufrufer in sendToGroqSmart wartet insgesamt höchstens 1,5 Sekunden). Kein Fehler-Popup: bei Problemen kommt einfach eine leere Liste,
   die App funktioniert auch ganz ohne semantisches Gedächtnis weiter. Rückgabe: Liste von Texten (Zeilen für den Prompt).
   Zusatzquelle: { name, rang, braucht(frage) -> bool, liefere(frage, gesamtliste) -> [{ id, text, zeile }], formatiere(treffer) -> Zeile oder null }. */
window.jvSuchQuellen = window.jvSuchQuellen || [];
const SUCH_TOPK = 5, SUCH_MAX_ZEILEN = 12, SUCH_ZUSATZ_MS = 1000;
async function suchePost(body) {
    try {
        const res = await apiFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (!res || !res.ok) return null;
        return await res.json();
    } catch (e) { return null; }
}
async function searchSemanticMemory(text) {
    const q = String(text || '').trim();
    if (!q || q.length < 4) return [];
    try {
        const quellen = (Array.isArray(window.jvSuchQuellen) ? window.jvSuchQuellen : []).filter(s => {
            try { return s && typeof s.liefere === 'function' && s.braucht(q); } catch (e) { return false; }
        }).sort((a, b) => (a.rang || 0) - (b.rang || 0));
        const basis = suchePost({ action: 'search', query: q, topK: SUCH_TOPK }).then(d => (d && Array.isArray(d.treffer)) ? d.treffer : null);
        let uhr = null;
        const zusatz = !quellen.length ? Promise.resolve(null) : Promise.race([
            suchePost({ action: 'listall' }).then(d => (d && Array.isArray(d.eintraege)) ? d.eintraege : null),
            new Promise(res => { uhr = setTimeout(() => res(null), SUCH_ZUSATZ_MS); })
        ]);
        const [treffer, gesamt] = await Promise.all([basis, zusatz]);
        if (uhr) clearTimeout(uhr);
        const zeilen = [], ids = new Set(), gesehen = new Set();
        const nimm = (id, roh, zeile) => {   // gleiche Id oder gleicher Text samt gleicher Zeile = dieselbe Erinnerung nur einmal
            const schluessel = String(roh).replace(/\s+/g, ' ').trim().toLowerCase() + '|' + zeile.toLowerCase();
            if ((id != null && ids.has(String(id))) || gesehen.has(schluessel)) return;
            if (id != null) ids.add(String(id));
            gesehen.add(schluessel);
            zeilen.push(zeile);
        };
        if (gesamt) quellen.forEach(s => {
            try { (s.liefere(q, gesamt) || []).forEach(z => { if (z && typeof z.zeile === 'string' && z.zeile) nimm(z.id, z.text == null ? z.zeile : z.text, z.zeile); }); } catch (e) { }
        });
        (treffer || []).forEach(t => {
            if (!t || typeof t.text !== 'string' || !t.text.trim()) return;
            let zeile = t.text;
            for (const s of window.jvSuchQuellen) {
                try { const f = typeof s.formatiere === 'function' ? s.formatiere(t) : null; if (typeof f === 'string' && f) { zeile = f; break; } } catch (e) { }
            }
            nimm(t.id, t.text, zeile);
        });
        return zeilen.slice(0, SUCH_MAX_ZEILEN);
    } catch (e) {
        return [];
    }
}

/* Schutzhülle: Ein Fehler VOR dem eigentlichen KI-Aufruf (zum Beispiel beim Zusammenbau der Anweisung, wenn eine js-Datei fehlt oder
   nicht zur anderen passt) darf die App nie auf "VERARBEITET" hängen lassen. Dann wird aufgeräumt, der Grund erscheint in der
   Fehleranzeige (roter Streifen) und Zane sagt, dass intern etwas nicht stimmt. */
async function sendToGroqSmart(text, opts = {}) {
    try {
        return await sendToGroqSmartCore(text, opts);
    } catch (e) {
        console.error('Ablauf vor dem KI-Aufruf fehlgeschlagen', e);
        try { clearTimeout(window.__groqAckTimer); } catch (x) {}
        try { stopThinkingSound(); } catch (x) {}
        isProcessing = false;
        try { renderAllLists(); } catch (x) {}
        try { if (typeof diagError === 'function') diagError(e); } catch (x) {}
        try { window.dispatchEvent(new ErrorEvent('error', { message: 'KI-Ablauf: ' + ((e && e.message) || e), filename: 'js/assistant.js', lineno: 0 })); } catch (x) {}
        const failText = 'Da ist bei mir intern etwas nicht in Ordnung, wahrscheinlich passt eine Programmdatei nicht zur anderen. Den Grund siehst du unten im Bild.';
        if (opts && opts.collect) opts.collect(failText, [], { fehler: true }); else speak(failText);
    }
}

/* Die KOPIE des Nutzertextes für die KI-Nachricht (Phase 5D.2): läuft durch die Kette jvKiText (commands.js; Festnamen u. a.). Der Originaltext
   bleibt überall sonst maßgeblich (Chat-Verlauf, jvLetzterText, Aktionen, Gedächtnis, Kalender, Erinnerungen). Jeder Fehler oder ein ungültiges
   Ergebnis ergibt den unveränderten Text: eine optionale Schreibkorrektur lässt nie eine Anfrage ausfallen. */
function jvKiTextFuer(text) {
    try {
        if (typeof text !== 'string' || typeof window.jvKiText !== 'function') return text;
        const r = window.jvKiText(text);
        return (typeof r === 'string' && r.trim()) ? r : text;
    } catch (e) { return text; }
}

async function sendToGroqSmartCore(text, opts = {}) {
    const jvFrageVorher = (window.jvFrage && window.jvFrage.zaehler) ? window.jvFrage.zaehler() : 0;   // js/fragen_reihenfolge.js: hat in diesem Durchlauf ein Modul gefragt?
    window.jvLetzterText = text;   // für das Zurückfragen (rueckfrage.js): der Satz, der nach der Antwort noch einmal ausgeführt wird
    isProcessing = true;
    try { if (typeof diagStart === 'function') diagStart(text); } catch (e) {}   // Diagnose-Fenster (nur wenn eingeschaltet)
    clearActionCards();
    startThinkingSound();
    typeWriterStatus("Verarbeite Anweisung...");
    updateTerminalStream("CPU_LOAD: PROCESSING_NLP...", "PROCESSING");

    if (recordBtn) recordBtn.classList.remove('recording');
    if (recordText) recordText.textContent = "ZANE / VERARBEITET...";

    // Zwischenbescheid während der Wartezeit auf die KI: bewusst NEUTRALE Formulierungen, die sowohl zu
    // einem Befehl ("Termin eintragen") als auch zu einer normalen Gesprächsfrage ("Wie geht's dir?") passen.
    // Früher standen hier Sätze wie "Wird erledigt." oder "Gebe ich sofort ein." - die klangen bei einer reinen
    // Unterhaltungsfrage unpassend, weil sie eine Aktion ankündigten, die es dort gar nicht gibt.
    // Bei reinem Smalltalk/einer kurzen Höflichkeitsfrage ("Wie geht's dir?", "Alles klar bei dir?") ist selbst
    // die neutrale Zwischenansage noch unpassend - niemand braucht "einen Moment", um sowas zu beantworten.
    // Dafür komplett weggelassen, auch wenn die Antwort mal etwas länger braucht (z.B. durch die
    // Gedächtnis-Suche im Hintergrund) - dann wartet man eben kurz in Stille statt eine seltsame Floskel zu hören.
    const SMALLTALK_NO_ACK = /^(?:(?:na|hey|hi|hallo|moin|servus)[,\s]*)?(?:(?:guten (?:morgen|tag|abend)|gute nacht)[,\s]*)?(?:(?:jarvis|zane)[,\s]*)?(?:wie geht(?:'?s| es)(?: dir| ihnen)?|alles (?:klar|gut|ok|okay)(?: bei dir| bei ihnen)?|was machst du(?: gerade| so)?|wie läuft'?s(?: bei dir)?)?[?!.\s]*$/i;
    const ackTimer = SMALLTALK_NO_ACK.test(text.trim()) ? null : setTimeout(() => {
        if (opts.collect) return;   // im Protokoll wird nicht zwischendurch gesprochen
        speakAck(ackPhraseNow(text));
    }, ACK_START_MS);
    window.__groqAckTimer = ackTimer;   // damit die Schutzhülle (sendToGroqSmart) ihn bei einem frühen Fehler stoppen kann

    let liveWeather = null;
    let liveForecast = null;
    if (/wetter|regen|regn|nieselt|nieseln|regenschirm|schirm|temperatur|grad|jacke|kalt|kuehl|kühl|warm|heiss|heiß|hitze|frost|sonne|sonnig|wolk|bewoelkt|bewölkt|wind|schnee|schneit|schneien|gewitter|donner|sturm|unwetter|trocken|vorhersage/i.test(text)) {
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
    typeWriterStatus("Gleiche mit dem Gedächtnis ab...");
    // Spritpreise (nur bei Tankfragen) und Gedächtnis-Suche laufen gleichzeitig statt nacheinander. Die Gedächtnis-Suche bekommt höchstens
    // 1,5 Sekunden: lieber ohne bedeutungsähnliche Erinnerungen antworten als jede Frage ausbremsen.
    const [nearbyFuelData, semanticMemoryHits] = await Promise.all([
        tankFuerFrage(text),   // auch für die HUD-Karten unten genutzt
        Promise.race([searchSemanticMemory(text), new Promise(res => setTimeout(() => res([]), 1500))])   // bedeutungsähnliche Erinnerungen zur aktuellen Frage
    ]);

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
        // die nächsten 40 Termine (mit sich wiederholenden Terminen wären es sonst zu viele)
        termine: [...calendarEntries].sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate)).slice(0, 40).map(c => ({ id: c.id, text: c.text, ...describeEventDate(c.isoDate), isoDate: c.isoDate, ...(c.location ? { ort: c.location } : {}) })),
        erinnerungen: reminderEntries.map(r => ({ id: r.id, text: r.text, ...describeEventDate(r.time), iso: r.time })),
        einkauf: shoppingEntries.map(s => s.text),
        aufgaben_und_notizen: todoEntries.map(t => t.text),
        briefing_wuensche: briefingWishes.map(w => ({ id: w.id, art: w.type === 'item' ? 'gegenstand' : 'hinweis', text: w.text })),
        schicht: (typeof window.jvSchichtWissen === 'function' ? window.jvSchichtWissen() : null)
    };

    const systemPrompt = buildSystemPrompt(text, contextData, nowGermanIso);
    try { if (typeof diagPromptSize === 'function') diagPromptSize(systemPrompt); } catch (e) {}

    // Der Chat-Verlauf behält den ORIGINALtext; die KI bekommt (falls ein Normalisierer etwas korrigiert hat) die Kopie, auch bei späteren Anfragen im Verlauf.
    const nutzerNachricht = { role: "user", content: text };
    const kiText = jvKiTextFuer(text);
    if (kiText !== text) Object.defineProperty(nutzerNachricht, 'jvKi', { value: kiText });   // nicht aufzählbar: erscheint in keinem Speicherabzug
    chatHistory.push(nutzerNachricht);

    let messagesPayload = [
        { role: "system", content: systemPrompt },
        ...chatHistory.slice(-16).map(m => (m && typeof m.jvKi === 'string') ? { role: m.role, content: m.jvKi } : m)
    ];

    typeWriterStatus("Formuliere die Antwort...");
    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                reasoning_effort: "low",   // weniger Grübeln = schnellere Antwort
                response_format: { type: "json_object" },
                messages: messagesPayload
            })
        });

        const data = await res.json();
        try { if (typeof diagApi === 'function') diagApi(res, data); } catch (e) {}
        const ai = JSON.parse(data.choices[0].message.content);
        try { if (typeof diagShow === 'function') diagShow(text, ai); } catch (e) {}

        chatHistory.push({ role: "assistant", content: JSON.stringify(ai) });

        // Neues Format: ai.actions ist eine Liste. Altes Format (type auf oberster Ebene) geht weiterhin.
        const actions = Array.isArray(ai.actions)
            ? ai.actions.filter(a => a && typeof a === 'object')
            : [ai];

        // Fahrziele, die ein gespeicherter Kontakt sind ("zu Anna", "zu meiner Tochter"), werden durch dessen Adresse ersetzt
        resolveContactsInActions(actions, text);
        if (actions._rueckfrage) { ai.reply = actions._rueckfrage; actions.length = 0; }   // mehrere Kontakte passen: Jarvis fragt nach (rueckfrage.js)

        // Wünsche und Sorgen: immer ins Langzeitgedächtnis (langzeit.js), auch wenn die KI es vergessen hat
        try { if (typeof window.jvWunschAktion === 'function') window.jvWunschAktion(text, actions); } catch (e) { }

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

        // B4: Mehrfachfragen (js/mehrfach.js) laufen nur lesend: alles, was etwas speichert, ändert oder öffnet, wird hier verworfen
        if (opts.nurLesen) {
            const LESEND = ['chat', 'memory_search', 'calendar_search', 'web_lookup', 'email_check', 'email_read', 'travel_time', 'nearby_places', 'fuel_route', 'bahn'];
            const behalten = actions.filter(a => LESEND.includes(a.type));
            actions.length = 0; behalten.forEach(a => actions.push(a));
        }

        // Alle Aktionen nacheinander ausführen; eine kaputte Aktion stoppt die anderen nicht
        const ctx = { counter: 0, cards: [], notes: [], panel: null };
        if (calendarLookup && calendarLookup.verbindung === 'getrennt') ctx.cards.push(googleReconnectCard());
        let okCount = 0;
        const errors = [];
        const nichtsSaetze = [];           // G.1: Aktionen, die ohne Fehler bewusst nichts verändert haben (Eintrag schon da, kein Treffer)
        const erfolgTypen = [];            // B3: welche Aktionsarten geklappt haben (für "Termin gespeichert." usw.)
        const verworfeneHinweise = new Set();   // B3: Hinweise von Aktionen, die dann doch fehlgeschlagen sind
        const sonderFehler = {};           // B3: welche Sonderaufgabe (Fahrzeit, Bahn ...) statt eines Ergebnisses eine Fehlermeldung geliefert hat
        window.jvMdAusfall = [];           // B3: mitdenken.js trägt hier Zusatzprüfungen ein, die gestartet wurden und ausgefallen sind
        for (const action of actions) {
            if (action.type === 'calendar_search' || action.type === 'web_lookup' || action.type === 'email_check' || action.type === 'email_read' || action.type === 'travel_time' || action.type === 'nearby_places' || action.type === 'fuel_route' || action.type === 'bahn') continue; // kommen gleich
            const hinweiseVorher = ctx.notes.length;
            try {
                const nichtsVorher = (ctx[Symbol.for('jv.nichtsGetan')] || []).length;
                await executeAction(action, text, ctx);
                const nichtsNachher = ctx[Symbol.for('jv.nichtsGetan')] || [];
                if (nichtsNachher.length > nichtsVorher) {   // G.1: nichts verändert -> nicht als erledigt zählen, aber auch kein Fehler
                    for (let i = nichtsVorher; i < nichtsNachher.length; i++) nichtsSaetze.push(nichtsNachher[i]);
                } else {
                    okCount++;
                    erfolgTypen.push(action.type);
                }
            } catch (err) {
                console.error("Aktion fehlgeschlagen:", action, err);
                errors.push(err.userMessage || "Einen Teil davon konnte ich leider nicht ausführen.");
                for (let i = hinweiseVorher; i < ctx.notes.length; i++) verworfeneHinweise.add(i);
            }
        }
        const mdAusfall = Array.isArray(window.jvMdAusfall) ? window.jvMdAusfall.slice() : [];
        window.jvMdAusfall = null;

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
                    if (!id) throw userError("Ich weiß nicht genau, welche E-Mail du meinst. Frag mich zuerst, ob du E-Mails hast.");
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
                sonderFehler.email = true;
            }
        }

        /* Nennt der User die Uhrzeit selbst ("um 20 Uhr", "um 19:30"), gilt genau diese als Ankunftszeit (nicht die der KI, die sich dabei schon verrechnet hat).
           "morgen" / "übermorgen" wird mitgenommen, sonst gilt der nächste Zeitpunkt mit dieser Uhrzeit. Gibt "" zurück, wenn der Satz keine Uhrzeit nennt. */
        function zeitenImSatz(l) {
            const out = [], rx = /\b(um|gegen|bis|ab)\s+(\d{1,2})(?:[:.](\d{2}))?\s*uhr(?:\s+(\d{2}))?\b|\b(um|gegen|bis|ab)\s+(\d{1,2})[:.](\d{2})\b/g;
            let m;
            while ((m = rx.exec(l))) {
                const hh = +(m[2] || m[6]), mi = +(m[3] || m[4] || m[7] || 0);
                if (hh <= 23 && mi <= 59) out.push({ hh, mi, i: m.index, e: m.index + m[0].length, ab: (m[1] || m[5]) === 'ab' });
            }
            return out;
        }
        /* Gehört die Uhrzeit zum Einlass / zur Ankunft? ("Einlass um 19 Uhr", "um 19 Uhr da sein") */
        function istEinlassZeit(l, z) {
            return /(?:einlass|ankunft)[^,.;]{0,16}$/.test(l.slice(0, z.i + 3)) || /^\s*(?:\w+\s+){0,2}(?:da sein|dort sein|ankommen|vor ort sein|da zu sein|dort zu sein)/.test(l.slice(z.e));
        }
        /* Nennt der User die Uhrzeit selbst, gilt genau diese als Ankunftszeit (nicht die der KI, die sich dabei schon verrechnet hat).
           Gibt es einen Einlass ("Einlass um 19 Uhr", "ich will um 19 Uhr da sein"), zählt diese Zeit, nicht der Beginn. "morgen"/"übermorgen" wird mitgenommen.
           Gibt "" zurück, wenn der Satz keine Uhrzeit nennt. */
        function arrivalFromUserText(t) {
            try {
                const l = String(t || '').toLowerCase();
                const zs = zeitenImSatz(l).filter(z => !z.ab);
                if (!zs.length) return '';
                const nahe = zs.filter(z => istEinlassZeit(l, z));
                const z = nahe.length ? nahe[0] : zs[0];
                const d = new Date(); d.setHours(z.hh, z.mi, 0, 0);
                if (/übermorgen/.test(l)) d.setDate(d.getDate() + 2);
                else if (/\bmorgen\b/.test(l) && !/morgens|heute morgen/.test(l)) d.setDate(d.getDate() + 1);
                else if (d.getTime() < Date.now()) d.setDate(d.getDate() + 1);
                const zz = n => String(n).padStart(2, '0');
                return d.getFullYear() + '-' + zz(d.getMonth() + 1) + '-' + zz(d.getDate()) + 'T' + zz(z.hh) + ':' + zz(z.mi) + ':00';
            } catch (e) { return ''; }
        }
        /* "Einlass ist vorher" ohne Uhrzeit für den Einlass: lieber nachfragen, als mit dem Beginn zu rechnen */
        function einlassOhneZeit(t) {
            try {
                const l = String(t || '').toLowerCase();
                if (!/einlass/.test(l)) return false;
                return !zeitenImSatz(l).some(z => !z.ab && istEinlassZeit(l, z));
            } catch (e) { return false; }
        }

        // Abfahrtszeit berechnen ("Wann muss ich losfahren?")
        let travelReply = null;
        const travelAction = actions.find(a => a.type === 'travel_time');
        if (travelAction && einlassOhneZeit(text)) {
            travelReply = 'Wann ist der Einlass? Sag mir zum Beispiel: Ich will um 19 Uhr da sein, wann muss ich losfahren?';
        } else if (travelAction) {
            typeWriterStatus("Berechne Fahrzeit...");
            updateTerminalStream("API_FETCH: ROUTE", "FETCHING");
            try {
                const res = await computeDepartureAdvice({
                    query: travelAction.travel_query || '',
                    destination: resolveTravelDestination(text, travelAction.travel_destination || ''),
                    arrivalTime: arrivalFromUserText(text) || travelAction.travel_arrival_time || '',
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
                sonderFehler.travel = true;
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
                sonderFehler.nearby = true;
            }
        }

        // Spritpreise in der Nähe als HUD-Karten (nicht entlang einer Strecke): die drei günstigsten der erfragten Sorte, günstigste grün markiert
        let nearbyFuelReply = null;   // gesprochener Satz direkt aus denselben Daten wie die Karten (die KI hat Preise vorher falsch gerundet)
        if (nearbyFuelData && Array.isArray(nearbyFuelData.stationen) && nearbyFuelData.stationen.length) {
            buildNearbyFuelCards(nearbyFuelData.stationen, fuelTypeFromText(text)).forEach(c => ctx.cards.push(c));
            try {
                if (/benzin|diesel|sprit|tank|\be10\b|\be5\b|kraftstoff|\bsuper\b|zapfs/i.test(text) && !actions.some(a => a.type === 'fuel_route')) {
                    const ft = fuelTypeFromText(text), lab = NEARBY_FUEL_LABELS[ft] || 'Diesel';
                    const top = nearbyFuelData.stationen.map(s => ({ n: s.name || 'Tankstelle', st: s.strasse || '', p: s[ft] })).filter(r => typeof r.p === 'number' && r.p > 0).sort((a, b) => a.p - b.p).slice(0, 3);
                    const pr = r => r.p.toFixed(3).replace('.', ',') + ' Euro';
                    if (top.length) nearbyFuelReply = 'Am günstigsten ist ' + lab + ' bei ' + top[0].n + (top[0].st ? ', ' + top[0].st : '') + ', ' + pr(top[0]) + ' pro Liter.'
                        + top.slice(1).map((r, i) => (i === 0 ? ' Danach ' : ' Dann ') + r.n + (r.st ? ', ' + r.st : '') + ', ' + pr(r) + '.').join('') + ' Die Karten zeigen die Preise genau so.';
                }
            } catch (e) { nearbyFuelReply = null; }
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
                sonderFehler.fuel = true;
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
                if (!/^(Von wo|Wohin)/.test(bahnReply)) sonderFehler.bahn = true;   // eine Rückfrage ("Von wo?") ist kein Ausfall
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
            if (!webReply) { webReply = "Die Suche im Internet hat gerade nicht geklappt. Versuch es bitte gleich noch einmal."; sonderFehler.web = true; }
        }

        let replyText = searchReply || webReply || emailReply || travelReply || nearbyReply || fuelReply || nearbyFuelReply || bahnReply || ai.reply;
        // 3D-Kopf: Gesichtsausdruck pro Satz, den die KI selbst gewählt hat (nur wenn genau ihre Antwort gesprochen wird)
        try { window.__jvMimikKI = (replyText === ai.reply && Array.isArray(ai.mimik) && ai.mimik.length) ? { reply: String(ai.reply), list: ai.mimik.map(String), at: Date.now() } : null; } catch (e) { }
        if (!replyText) {
            if (wantsSearch) {
                const results = searchMemory((searchAction && searchAction.memory_search_query) || text);
                if (results.length === 0) {
                    replyText = `Dazu konnte ich in meinen Datenbanken leider keinen Eintrag finden.`;
                } else if (results[0].unscharf) {
                    replyText = `Meintest du vielleicht "${results[0].key}"? Dazu habe ich: ${results[0].value}`;
                } else {
                    replyText = `Ich habe Folgendes in meinen Registern gefunden: ${results.map(r => `${r.key}:${r.value}`).join(', ')}`;
                }
            } else {
                replyText = sassLevel() >= 3 ? pickRandom([`Erledigt, ${currentUserName}. Du darfst jetzt klatschen.`, `Ist passiert. Deine Dankbarkeit nehme ich bar entgegen.`, `Fertig. Das war leichter als dein Gesichtsausdruck vermuten ließ.`])
                    : sassLevel() >= 2 ? pickRandom([`Erledigt, ${currentUserName}. Applaus ist optional.`, `Ist passiert. Du musst nichts weiter tun.`, `Fertig. Das ging schneller als dein Gedanke dazu.`])
                    : `Zu deinen Diensten, ${currentUserName}. Es ist erledigt.`;
            }
        }

        // Ehrlich bleiben: Was geklappt hat und was nicht, sagt Jarvis konkret (js/antwort_bau.js, B3). Hinweise erfolgreicher Teile bleiben erhalten.
        const hinweiseOk = ctx.notes.filter((n, i) => !verworfeneHinweise.has(i));
        if (window.jvAntwort && typeof window.jvAntwort.baue === 'function') {
            const sonder = [['search', searchReply], ['web', webReply], ['email', emailReply], ['travel', travelReply], ['nearby', nearbyReply], ['fuel', fuelReply], ['nearbyFuel', nearbyFuelReply], ['bahn', bahnReply]]
                .filter(x => x[1]).map(x => ({ ok: !sonderFehler[x[0]], text: x[1] }));
            const kalenderOk = erfolgTypen.some(t => t === 'calendar' || t === 'calendar_update');
            replyText = window.jvAntwort.baue({ basis: replyText, sonder, erfolge: erfolgTypen, okAnzahl: okCount, fehler: errors, nichts: nichtsSaetze, hinweise: hinweiseOk, ausfaelle: kalenderOk ? mdAusfall : [] });
        } else {   // Rückfall (antwort_bau.js fehlt): Verhalten wie früher
            if (errors.length > 0) {
                if (searchReply) replyText = `${searchReply} ${errors.join(' ')}`;
                else if (okCount > 0) replyText = `Das meiste ist erledigt, aber: ${errors.join(' ')}`;
                else replyText = errors.join(' ');
            }
            if (ctx.notes.length > 0 && errors.length === 0) replyText += ' ' + ctx.notes.join(' ');
            if (nichtsSaetze.length > 0) replyText = okCount > 0 ? replyText + ' ' + nichtsSaetze.join(' ') : nichtsSaetze.join(' ');
        }
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
        try { if (typeof window.jvFristHinweis === 'function') replyText = window.jvFristHinweis(replyText, text) || replyText; } catch (e) {}   // nahende Frist beiläufig anhängen (js/langzeit.js)
        try { if (window.jvFrage) window.jvFrage.kiFrage(jvFrageVorher, replyText); } catch (e) {}   // freie Frage der KI: jüngste Frage (überholt ältere Modul-Fragen)
        speak(replyText, continueConversation);
    } catch (e) {
        renderAllLists();
        stopThinkingSound();
        updateTerminalStream("SYS_ERR: COMMS_FAILURE", "ERROR");
        try { if (typeof diagError === 'function') diagError(e); } catch (x) {}
        const failText = (e && e.auth) ? e.userMessage : pickRandom([
            `Verzeih, ${currentUserName}, meine Sensoren scheinen gerade blockiert zu sein.`,
            `Da hakt es gerade irgendwo in der Leitung, ${currentUserName}. Nochmal, bitte.`,
            `Entschuldigung, die Verbindung ist mir kurz weggebrochen. Versuch es noch einmal.`,
            `Hm, da war wohl gerade niemand zu Hause am anderen Ende. Einen Moment, und nochmal bitte.`
        ]);
        clearTimeout(ackTimer);
        if (opts.collect) opts.collect(failText, [], { fehler: true }); else speak(failText);
    } finally {
        clearTimeout(ackTimer);
        stopThinkingSound();
        isProcessing = false;
    }
}

