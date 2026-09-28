// js/assistant.js
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
                        "\n\nBeantworte damit jetzt die Frage des Users im Feld 'reply': kurz, mit Wochentag, Tag und Monat, bei Terminen mit Uhrzeit (die Uhrzeit steht schon gesprochen im Feld 'zeit', übernimm sie wörtlich). Das Datum steht im Feld 'datum' with ausgeschriebenem Monat: Übernimm es wörtlich und schreibe keine Zahlen wie '11.04.'. 'kommende' sind die nächsten Termine, 'vergangene' die letzten davor. Nutze nur diese Ergebnisse und erfinde nichts. Gibt es keinen Treffer, sage das ehrlich, und wenn ein 'hinweis' vorhanden ist, erwähne ihn kurz. 'actions' bleibt leer." }
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

/* ---- Internet-Auskunft ---- */
function cleanWebAnswer(raw) {
    let t = String(raw || '')
        .replace(/【[^】]*】/g, '')
        .replace(/https?:\/\/\S+/g, '')
        .replace(/\[\d+\]/g, '')
        .replace(/[*_`#>|]+/g, ' ')
        .replace(/^\s*[-•]\s+/gm, '')
        .replace(/\s*\n+\s*/g, '. ')
        .replace(/\.\s*\./g, '.')
        .replace(/\s{2,}/g, ' ')
        .trim();
    if (t.length > 900) {
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
    const system = "Du bist J.A.R.V.I.S., ein belesener, hochintelligenter Butler von " + currentUserName + ". Antworte auf Deutsch, in deinem eigenen, lebendigen Ton. " +
        "Nutze die Websuche, um die Frage mit aktuellen, verlässlichen Informationen zu beantworten. Heute ist " + today + ". " +
        "Das Gedächtnis des Users: " + memory + ". " +
        "Schreibe ohne Markdown, ohne Aufzählungszeichen, ohne Links und ohne Quellenangaben.";
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
        return cleanWebAnswer(content) || null;
    } catch (e) {
        if (e && e.auth) throw e;
        console.error("Internet-Auskunft fehlgeschlagen", e);
        return null;
    }
}

async function diagnoseWebSearch(query, log) {
    const q = String(query || '').trim() || 'Was läuft heute Abend im Fernsehen?';
    log('Frage: ' + q);
    let res = await apiFetch('/api/groq', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildWebSearchBody(q, ''))
    });
    const raw = await res.text();
    log(`Status ${res.status}`);
}

async function runWebDiagnosis() {
    const out = document.getElementById('webDiagOutput');
    const input = document.getElementById('webDiagInput');
    const lines = [];
    const log = (t) => { lines.push(t); if (out) { out.textContent = lines.join('\n'); out.classList.remove('hidden'); } };
    try { await diagnoseWebSearch(input ? input.value : '', log); }
    catch (e) { log('❌ Fehler: ' + (e && e.message ? e.message : e)); }
}

function googleNotSynced(ctx, what) {
    ctx.notes.push(`Der Google Kalender ist nicht verbunden. ${what}.`);
    if (!ctx.cards.some(c => c.onclick === 'loginWithGoogle(false)')) ctx.cards.push(googleReconnectCard());
}

function openGoogleCalendarApp(isoTimeString) {
    let d = isoTimeString ? new Date(isoTimeString) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    const url = `https://google.com{d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    try { window.open(url, '_blank', 'noopener'); } catch (e) {}
}

const CALENDAR_LOOKUP_TRIGGER = /geburtstag|hochzeitstag|jubiläum/i;
const LOOKUP_STOPWORDS = new Set(('wann wer was wie wo welche welcher welchen welches hat haben hab habe hatte hatten ist sind war waren wird werden ' +
    'mein meine meiner meinem meinen meines dein deine unser unsere der die das dem den des ein eine einen einem einer von vom am im in an auf zu zum zur ' +
    'für mit bei nach mir mich uns dir sag sage sagen kannst kann du ich wir sie er es alt bald nächste nächsten nächster nächstes wieder schon noch mal ' +
    'bitte gleich eigentlich doch denn und oder jetzt heute morgen gestern übermorgen diese dieser diesen dieses woche monat jahr genau nochmal kennst ' +
