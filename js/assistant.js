/* Hauptfunktion zum Verarbeiten der Benutzereingabe */
async function processUserCommand(textInput) {
    if (!textInput || (typeof isProcessing !== 'undefined' && isProcessing)) return;
    if (typeof isProcessing !== 'undefined') isProcessing = true;

    try {
        const userText = textInput.trim();

        // 1. Prüfen auf direkte Internet-Suche (Web-Trigger)
        const needsWebSearch = WEB_TRIGGER.test(userText) || 
                               NEARBY_TRIGGER.test(userText) || 
                               STAU_TRIGGER.test(userText);

        if (needsWebSearch) {
            const body = buildWebSearchBody(userText, userText);
            const res = await apiFetch('/api/groq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            const rawText = data?.choices?.[0]?.message?.content || "Dazu konnte ich leider keine aktuellen Informationen finden.";
            return cleanWebAnswer(rawText);
        }

        // 2. Erster Durchgang: KI analysiert die Absicht (Intent / KI-Aktion)
        const systemPrompt = "Du bist ein KI-Assistent. reagiere angemessen auf die Anfragen des Nutzers.";
        const messages = [
            { role: "system", content: systemPrompt },
            { role: "user", content: userText }
        ];

        const firstRes = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: messages
            })
        });

        const firstData = await firstRes.json();
        const firstAiContent = firstData?.choices?.[0]?.message?.content;
        let parsedAi;

        try {
            parsedAi = JSON.parse(firstAiContent);
        } catch (e) {
            // Falls keine JSON-Aktion zurückkam, direkten Text ausgeben
            return cleanWebAnswer(firstAiContent);
        }

        // 3. Verzweigung je nach geforderter Aktion (Kalender, E-Mail, etc.)
        if (parsedAi.action === 'calendar_search' && parsedAi.results) {
            return await answerWithCalendarResults(messages, parsedAi, parsedAi.results);
        } else if (parsedAi.action === 'email_fetch' && parsedAi.data) {
            return await answerWithEmailResults(messages, parsedAi, parsedAi.data);
        } else if (parsedAi.reply) {
            return parsedAi.reply;
        }

        return cleanWebAnswer(firstAiContent);

    } catch (error) {
        console.error("Fehler bei der Verarbeitung des Sprachbefehls:", error);
        return "Entschuldigung, Dino. Es gab einen Fehler bei der Verarbeitung deiner Anfrage.";
    } finally {
        if (typeof isProcessing !== 'undefined') isProcessing = false;
    }
}
