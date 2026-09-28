// js/briefing.js
/* ============================================================
   BRIEFING: Standort, Wetter, Tages-Briefing & KI-Lernen
   ============================================================ */

function getPosition(opts) { return new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err, opts)); }

async function fetchUserLocationData() {
    if (!navigator.geolocation) return { fehler: "Geolokalisierung nicht unterstützt." };
    try {
        let pos = await getPosition({ timeout: 8000, enableHighAccuracy: true }).catch(() => getPosition({ timeout: 12000, enableHighAccuracy: false }));
        const res = await fetch(`https://openstreetmap.org{pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=18&addressdetails=1`);
        const d = await res.json();
        const a = d.address || {};
        const ort = a.city || a.town || a.village || "Unbekannter Ort";
        const str = a.road || "";
        const nr = a.house_number || "";
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, ort, strasse: str, hausnummer: nr, volstaendigeAdresse: d.display_name || ort };
    } catch (e) { return { fehler: "Standort nicht verfügbar." }; }
}

async function fetchWeatherData() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve({ fehler: "Kein GPS" });
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const res = await fetch(`https://open-meteo.com{pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,weather_code,apparent_temperature`);
                const d = await res.json();
                resolve({ temperatur: Math.round(d.current.temperature_2m), gefuehlteTemperatur: Math.round(d.current.apparent_temperature), wettercode: d.current.weather_code });
            } catch (e) { resolve({ fehler: "Fehler" }); }
        }, () => resolve({ fehler: "Kein GPS-Signal" }), { timeout: 5000 });
    });
}

async function fetchWeatherForecast() { return { tage: [] }; }
function normalizeKey(s) { return String(s || '').toLowerCase().replace(/[äöüß]/g, m => ({'ä':'ae','ö':'oe','ü':'ue','ß':'ss'}[m])).replace(/[^a-z0-9]/g, ''); }
function isImportantItem(k) { return ['schlüssel', 'geldbeutel', 'brille', 'ausweis'].some(w => normalizeKey(k).includes(w)); }
function displayItemName(k) { return String(k).trim(); }
function getWeatherAdvice(w) { return { rain: w.wettercode > 50, schirm: w.wettercode > 50 ? "Schirm mitnehmen" : "Kein Schirm nötig", jacke: w.temperatur < 12 ? "Warme Jacke" : "Leichte Jacke" }; }

function buildBriefingData(now, weather) {
    let hour = now.getHours();
    let begruessung = hour < 12 ? "Guten Morgen" : (hour < 18 ? "Guten Tag" : "Guten Abend");
    let gegenstaende = Object.keys(memoryItems || {}).filter(isImportantItem).map(k => ({ gegenstand: displayItemName(k), wert: parseMemoryValue(memoryItems[k]) }));
    return { name: currentUserName, begruessung, uhrzeit_gesprochen: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), wetter: weather ? { temperatur_grad: weather.temperatur, regen_erwartet: weather.wettercode > 50, regenschirm_empfehlung: weather.wettercode > 50 ? "Schirm mitnehmen" : "Kein Schirm", jacken_empfehlung: weather.temperatur < 12 ? "Warme Jacke" : "Leichte Jacke" } : null, naechste_termine: [], erinnerungen_naechste_tage: [], zusaetzliche_wuensche: [], wichtige_gegenstaende: gegenstaende };
}

async function composeBriefingWithModel(data) {
    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: "Du bist J.A.R.V.I.S., der Butler von " + data.name + ". Sprich ein flüssiges Tagesbriefing ohne Markdown als JSON: {\"briefing\": \"...\"}." },
                    { role: "user", content: "Daten: " + JSON.stringify(data) }
                ]
            })
        });
        const json = await res.json();
        return JSON.parse(json.choices.message.content).briefing || null;
    } catch (e) { return null; }
}

function buildFallbackBriefing(data) { return `${data.begruessung}, ${data.name}. Es ist ${data.uhrzeit_gesprochen}.`; }

/* --- AUTOMATISCHES LERNEN: SPEICHERT JETZT ALS VEKTOR ÜBER api/groq --- */
async function learnFromConversations() {
    if (!chatHistory || chatHistory.length < 4) return;
    try {
        const verlauf = chatHistory.slice(-40).map(m => `${m.role === 'user' ? 'User' : 'Jarvis'}: ${m.content}`).join('\n');
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: "Suche im Gespräch nach neuen, dauerhaften Fakten über den User. Antworte NUR als JSON: {\"fakten\": [{\"schluessel\": \"begriff\", \"wert\": \"inhalt\"}]}" },
                    { role: "user", content: "Verlauf:\n" + verlauf }
                ]
            })
        });
        if (!res.ok) return;
        const d = await res.json();
        const fakten = JSON.parse(d.choices.message.content).fakten || [];
        
        for (const f of fakten) {
            const k = String(f.schluessel || '').trim().toLowerCase();
            const v = String(f.wert || '').trim();
            if (!k || !v) continue;

            try {
                // Funkt direkt an /api/groq mit der action "store" für Upstash
                await apiFetch('/api/groq', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'store', text: `${k}: ${v}` })
                });
                updateTerminalStream(`MEMORY_VECTOR_WRITE: ${k.toUpperCase()}`);
            } catch (err) { console.error(err); }
        }
    } catch (e) { console.error(e); }
}

async function triggerDailyBriefing() {
    if (isProcessing) return;
    isProcessing = true;
    startThinkingSound();
    try {
        const weather = await fetchWeatherData();
        const data = buildBriefingData(new Date(), weather);
        let text = await composeBriefingWithModel(data) || buildFallbackBriefing(data);
        chatHistory.push({ role: "assistant", content: JSON.stringify({ type: "chat", reply: text }) });
        speak(text, continueConversation);
        learnFromConversations();
    } finally {
        stopThinkingSound();
        isProcessing = false;
    }
}
