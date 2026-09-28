// js/assistant.js
/* ============================================================
   ASSISTANT: Sprachbefehl an die KI senden, Aktionen ausführen
   Braucht: alle anderen Dateien (muss als LETZTE geladen werden)
   ============================================================ */

function formatSpokenTime(date) {
    const parts = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(date);
    const hh = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const mm = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return mm === 0 ? `${hh} Uhr` : `${hh} Uhr ${mm}`;
}
function plainKey(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, ''); }

async function executeAction(action, text, ctx) {
    if (action.type === 'shopping') {
        let items = Array.isArray(action.shopping_items) ? action.shopping_items : (action.shopping_item ? [action.shopping_item] : []);
        if (items.length === 0) items = [text.replace(/bitte|füge|hinzu|auf|die|einkaufsliste/gi, '').trim()];
        items.forEach(item => {
            let cleanItem = String(item || '').trim();
            if (cleanItem && !shoppingEntries.some(e => e.text.toLowerCase() === cleanItem.toLowerCase())) {
                shoppingEntries.unshift({ id: Date.now() + ctx.counter++, text: cleanItem });
            }
        });
        setPersistentData('helfer_shopping', JSON.stringify(shoppingEntries));
    } else if (action.type === 'todo') {
        const items = action.todo_items || (action.todo_text ? [action.todo_text] : []);
        items.forEach(item => {
            if (item && item.trim()) todoEntries.unshift({ id: Date.now() + ctx.counter++, text: item.trim(), createdDate: 'Per Sprache' });
        });
        setPersistentData('helfer_todo_entries', JSON.stringify(todoEntries));
    } else if (action.type === 'memory_store' && action.memory_key) {
        removeKeyVariants(action.memory_key);
        memoryItems[action.memory_key.toLowerCase().trim()] = String(parseMemoryValue(action.memory_value || "gespeichert"));
        setPersistentData('helfer_memory', JSON.stringify(memoryItems));
    } else if (action.type === 'parking_save') {
        await saveParkingSpot(String(action.parking_note || '').trim());
    } else if (action.type === 'show_panel') {
        ctx.panel = { name: String(action.panel).toLowerCase().trim() };
    } else if (action.type === 'navigate') {
        const navCard = buildNavigationCard(action);
        ctx.cards.push(navCard);
        if (navCard && navCard.href) window.open(navCard.href, '_blank', 'noopener');
    }
}

async function sendToGroqSmart(text, opts = {}) {
    isProcessing = true;
    clearActionCards();
    startThinkingSound();
    typeWriterStatus("Verarbeite Anweisung...");

    const ackTimer = setTimeout(() => {
        if (opts.collect) return;
        speakAck(pickRandom(["Einen Moment.", "Ich denke nach.", "Sofort.", "Verstanden."]));
    }, ACK_DELAY_MS);

    // --- LANGZEITGEDÄCHTNIS (UPSTASH VECTOR ÜBER api/groq) ABFRAGEN ---
    let longTermMemories = [];
    try {
        const memRes = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'retrieve', text: text })
        });
        if (memRes.ok) {
            const memData = await memRes.json();
            longTermMemories = memData.memories || [];
        }
    } catch (e) {
        console.error("Gedächtnis Abruf fehlgeschlagen", e);
    }

    let liveWeather = null;
    let liveForecast = null;
    if (/wetter|regen|temperatur|grad|vorhersage/i.test(text)) {
        const [rawWeather, forecast] = await Promise.all([fetchWeatherData(), fetchWeatherForecast()]);
        liveForecast = forecast;
        if (rawWeather && !rawWeather.fehler) {
            const advice = getWeatherAdvice(rawWeather);
            liveWeather = { temperatur_grad: rawWeather.temperatur, gefuehlt_grad: rawWeather.gefuehlteTemperatur, regenschirm_empfehlung: advice.schirm, jacken_empfehlung: advice.jacke };
        }
    }

    let liveLocation = null;
    if (/standort|wo bin ich/i.test(text)) liveLocation = await fetchUserLocationData();

    const now = new Date();
    const nowGermanIso = now.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T');

    const contextData = {
        heute_datum: nowGermanIso,
        heute_lesbar: now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' }),
        uhrzeit_jetzt: formatSpokenTime(now),
        wetter: liveWeather,
        wettervorhersage: liveForecast,
        parkplatz: typeof describeParking === 'function' ? describeParking() : null,
        relevante_langzeit_erinnerungen: longTermMemories,
        zuhause: typeof homeAddress !== 'undefined' ? homeAddress : null,
        standort: liveLocation,
        gedächtnis: memoryItems,
        kontakte: typeof savedContacts !== 'undefined' ? savedContacts : [],
        termine: Array.isArray(calendarEntries) ? [...calendarEntries].sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate)).slice(0, 60).map(c => ({ id: c.id, text: c.text, isoDate: c.isoDate })) : [],
        erinnerungen: Array.isArray(reminderEntries) ? reminderEntries.map(r => ({ id: r.id, text: r.text, iso: r.time })) : [],
        einkauf: Array.isArray(shoppingEntries) ? shoppingEntries.map(s => s.text) : [],
        aufgaben_und_notizen: Array.isArray(todoEntries) ? todoEntries.map(t => t.text) : []
    };

    const systemPrompt = "Du bist J.A.R.V.I.S., der Butler von " + currentUserName + ". Antworte kurz in 1-2 Sätzen ohne Markdown.\n\n" +
    "Aktueller Kontext: " + JSON.stringify(contextData) + "\n\n" +
    "Nutze das Feld 'relevante_langzeit_erinnerungen', um dich an Vorlieben des Users zu erinnern.";

    chatHistory.push({ role: "user", content: text });

    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: [{ role: "system", content: systemPrompt }, ...chatHistory.slice(-6)]
            })
        });

        const data = await res.json();
        const ai = JSON.parse(data.choices.message.content);
        chatHistory.push({ role: "assistant", content: JSON.stringify(ai) });

        const actions = Array.isArray(ai.actions) ? ai.actions : [ai];
        const ctx = { counter: 0, cards: [], notes: [], panel: null };

        for (const action of actions) {
            await executeAction(action, text, ctx);
        }

        let replyText = ai.reply || `Zu Ihren Diensten, ${currentUserName}.`;
        if (opts.collect) {
            opts.collect(replyText, ctx.cards);
        } else {
            showActionCards(ctx.cards);
            if (ctx.panel) openPanel(ctx.panel.name, ctx.panel);
            renderAllLists();
            speak(replyText, continueConversation);
        }
    } catch (e) {
        console.error(e);
        if (opts.collect) opts.collect("Fehler", []); else speak("Es gab eine Störung.");
    } finally { // HIER GEFIXT: Endlich richtig geschrieben!
        clearTimeout(ackTimer);
        stopThinkingSound();
        isProcessing = false;
    }
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
