// js/assistant.js
/* ============================================================
   ASSISTANT: Sprachbefehl an die KI senden, Aktionen ausführen
   Braucht: alle anderen Dateien (muss als LETZTE geladen werden)
   ============================================================ */

function formatSpokenTime(date) {
    const parts = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    return `${parseInt(parts.find(p => p.type === 'hour').value, 10)} Uhr ${parts.find(p => p.type === 'minute').value}`;
}
function plainKey(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ''); }

async function executeAction(action, text, ctx) {
    if (action.type === 'shopping') {
        let items = Array.isArray(action.shopping_items) ? action.shopping_items : (action.shopping_item ? [action.shopping_item] : []);
        items.forEach(item => { if (item && !shoppingEntries.some(e => e.text.toLowerCase() === String(item).toLowerCase())) shoppingEntries.unshift({ id: Date.now() + ctx.counter++, text: String(item).trim() }); });
        setPersistentData('helfer_shopping', JSON.stringify(shoppingEntries));
    } else if (action.type === 'todo') {
        let items = action.todo_items || (action.todo_text ? [action.todo_text] : []);
        items.forEach(item => { if (item) todoEntries.unshift({ id: Date.now() + ctx.counter++, text: String(item).trim(), createdDate: 'Per Sprache' }); });
        setPersistentData('helfer_todo_entries', JSON.stringify(todoEntries));
    } else if (action.type === 'memory_store' && action.memory_key) {
        memoryItems[action.memory_key.toLowerCase().trim()] = String(action.memory_value || "gespeichert");
        setPersistentData('helfer_memory', JSON.stringify(memoryItems));
    } else if (action.type === 'parking_save') {
        if (typeof saveParkingSpot === 'function') await saveParkingSpot(String(action.parking_note || '').trim());
    } else if (action.type === 'show_panel' && typeof openPanel === 'function') {
        openPanel(String(action.panel).toLowerCase().trim());
    }
}

async function sendToGroqSmart(text, opts = {}) {
    isProcessing = true; clearActionCards(); startThinkingSound(); typeWriterStatus("Verarbeite Anweisung...");
    const ackTimer = setTimeout(() => { if (!opts.collect) speakAck(pickRandom(["Einen Moment.", "Ich denke nach.", "Sofort.", "Verstanden."])); }, ACK_DELAY_MS);

    let longTermMemories = [];
    try {
        const memRes = await apiFetch('/api/groq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'retrieve', text: text }) });
        if (memRes.ok) { longTermMemories = (await memRes.json()).memories || []; }
    } catch (e) { console.error(e); }

    let liveWeather = typeof currentWeatherData !== 'undefined' ? currentWeatherData : null;
    let liveLocation = typeof fetchUserLocationData === 'function' ? await fetchUserLocationData() : null;
    const now = new Date();

    const contextData = {
        heute_datum: now.toISOString(), uhrzeit_jetzt: formatSpokenTime(now),
        wetter: liveWeather, relevantes_gedaechnis: longTermMemories, standort: liveLocation,
        gedächtnis: memoryItems, einkauf: shoppingEntries.map(s => s.text), aufgaben_und_notizen: todoEntries.map(t => t.text)
    };

    const systemPrompt = "Du bist J.A.RV.I.S., Butler von " + currentUserName + ". Antworte frei und charmant in 1-2 kurzen Sätzen auf Deutsch. Kein Markdown. Wenn du Aktionen ausführen sollst, nenne sie im Text.\n\nKontext: " + JSON.stringify(contextData);
    chatHistory.push({ role: "user", content: text });

    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: "openai/gpt-oss-120b", messages: [{ role: "system", content: systemPrompt }, ...chatHistory.slice(-6)] })
        });
        const d = await res.json(); const msgContent = d.choices[0].message.content;
        
        let ai = { reply: msgContent.trim(), actions: [] };
        chatHistory.push({ role: "assistant", content: JSON.stringify(ai) });

        const ctx = { counter: 0, cards: [] };
        await executeAction(ai, text, ctx);

        if (opts.collect) { opts.collect(ai.reply, ctx.cards); } else { if (typeof showActionCards === 'function') showActionCards(ctx.cards); if (typeof renderAllLists === 'function') renderAllLists(); speak(ai.reply, continueConversation); }
    } catch (e) { console.error(e); if (opts.collect) opts.collect("Fehler", []); else speak("Es gab eine kleine Störung."); } finally { clearTimeout(ackTimer); stopThinkingSound(); isProcessing = false; }
}

const BAHN_WORDS_RE = /\b(bahn|zug|bus)\b/i;
function isBahnQuestion(text) { return false; }
function bahnFromText(text) { return {}; }
const FUEL_WORDS_RE = /tank\w*|sprit/i;
const ROUTE_WORDS_RE = /\b(weg|strecke)\b/i;
function isFuelRouteQuestion(text) { return false; }
function fuelTypeFromText(text) { return 'diesel'; }
function fuelDestFromText(text) { return {}; }
async function tankFuerFrage(text) { return null; }
function buildNearbyFuelCards(s, f) { return []; }
