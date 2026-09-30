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
                    { role: "assistant", content: typeof firstAi === 'object' ? JSON.stringify(firstAi) : String(firstAi) },
                    { role: "user", content: "Ergebnis deiner Kalendersuche (JSON): " + JSON.stringify(results) +
                        "\n\nBeantworte damit jetzt die Frage des Users im Feld 'reply': kurz, mit Wochentag, Tag und Monat, bei Terminen mit Uhrzeit (die Uhrzeit steht schon gesprochen im Feld 'zeit', übernimm sie wörtlich). Das Datum steht im Feld 'datum' mit ausgeschriebenem Monat: Übernimm es wörtlich und schreibe keine Zahlen wie '11.04.'. 'kommende' sind die nächsten Termine, 'vergangene' die letzten davor. Nutze nur diese Ergebnisse und erfinde nichts. Gibt es keinen Treffer, sage das ehrlich, und wenn ein 'hinweis' vorhanden ist, erwähne ihn kurz. Antworte zwingend im JSON-Format: {\"reply\": \"Deine Antwort hier\"}" }
                ]
            })
        });
        const data = await res.json();
        
        // --- KUGELSICHERES PARSING ---
        if (!data || !data.choices || !data.choices[0] || !data.choices[0].message) {
            throw new Error("Ungültige Struktur von API erhalten");
        }
        
        const rawContent = data.choices[0].message.content;
        try {
            const parsed = JSON.parse(rawContent);
            return (parsed.reply || rawContent).trim() || formatCalendarSearchFallback(results);
        } catch (e) {
            // Falls das Modell reinen Text statt JSON zurückgibt, nutzen wir einfach den Text direkt
            return rawContent.trim() || formatCalendarSearchFallback(results);
        }
    } catch (e) {
        console.error("Antwort zur Kalendersuche fehlgeschlagen, nutze Fallback-Daten", e);
        return formatCalendarSearchFallback(results);
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
                    { role: "assistant", content: typeof firstAi === 'object' ? JSON.stringify(firstAi) : String(firstAi) },
                    { role: "user", content: "Ergebnis deiner E-Mail-Abfrage (JSON): " + JSON.stringify(data) +
                        "\n\nBeantworte damit jetzt die Frage des Users im Feld 'reply'. Bei einer Übersicht: nenne die Anzahl ungelesener E-Mails und danach kurz Absender und Betreff der wichtigsten, höchstens 5, in normalen Sätzen (kein Aufzählungszeichen, das wird vorgelesen). Bei einer einzelnen E-Mail: lies Absender, Betreff und den Text vor, in eigenen, klaren Sätzen, nichts hinzuerfinden. Erfinde niemals Absender, Betreffs oder Inhalte, die nicht in den Daten stehen. Antworte zwingend im JSON-Format: {\"reply\": \"Deine Antwort hier\"}" }
                ]
            })
        });
        const data2 = await res.json();
        
        // --- KUGELSICHERES PARSING ---
        if (!data2 || !data2.choices || !data2.choices[0] || !data2.choices[0].message) {
            throw new Error("Ungültige Struktur von API erhalten");
        }
        
        const rawContent2 = data2.choices[0].message.content;
        try {
            const parsed = JSON.parse(rawContent2);
            return (parsed.reply || rawContent2).trim() || formatEmailFallback(data);
        } catch (e) {
            return rawContent2.trim() || formatEmailFallback(data);
        }
    } catch (e) {
        console.error("Antwort zu den E-Mails fehlgeschlagen, nutze Fallback-Daten", e);
        return formatEmailFallback(data);
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
    if (!Array.isArray(results)) return 'Ich konnte keine Kalendereinträge laden.';
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
    const memory = JSON.stringify(typeof memoryItems !== 'undefined' ? memoryItems : {});
    const system = "Du bist J.A.R.V.I.S., ein belesener, hochintelligenter Butler von " + (typeof currentUserName !== 'undefined' ? currentUserName : 'Master') + ". Antworte auf Deutsch, in deinem eigenen, lebendigen Ton - wie in einem echten Gespräch, nicht wie eine auswendig gelernte Standardantwort. Formuliere jedes Mal neu, auch bei ähnlichen Fragen: keine Textbausteine, keine feste Einleitungsfloskel, die du immer wiederholst. Zeig, dass du das Thema wirklich verstehst: ordne die Information kurz ein, statt nur Fakten aufzuzählen, wenn das dem User weiterhilft. " +
        "Nutze die Websuche, um die Frage mit aktuellen, verlässlichen Informationen zu beantworten. Heute ist " + today + ". " +
        "Das Gedächtnis des Users (seine Vorlieben und Notizen, als JSON): " + memory + ". " +
        "Bei Fragen nach Fernsehprogramm, Filmen, Serien oder Kino wählst du nur Sendungen aus, die zu seinen Vorlieben im Gedächtnis passen (zum Beispiel Genres), und nennst höchstens drei mit Sender und Uhrzeit. " +
        "Steht nichts Passendes im Gedächtnis, nenne die Highlights des Abends. " +
        "Schreibe Uhrzeiten ausgeschrieben, zum Beispiel '20 Uhr 15'. Schreibe ohne Markdown, ohne Aufzählungszeichen, ohne Links und ohne Quellenangaben, weil deine Antwort laut vorgelesen wird - meist reichen zwei bis vier Sätze, bei einer Frage, die wirklich mehr Tiefe verdient, darf es auch etwas mehr sein. " +
        "Erfinde nichts. Findest du nichts Verlässliches, sage das ehrlich, aber genauso natürlich formuliert wie der Rest deiner Antworten.";
    return {
        model: "openai/gpt-oss-120b",
        messages: [{ role: "system", content: system }, { role: "user", content: userText }]
    };
}

/* Hauptfunktion zum Verarbeiten der Benutzereingabe */
async function processUserCommand(textInput) {
    if (!textInput || (typeof isProcessing !== 'undefined' && isProcessing)) return;
    if (typeof isProcessing !== 'undefined') isProcessing = true;
    
