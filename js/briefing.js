// js/briefing.js
/* ============================================================
   BRIEFING: Standort, Wetter, Tages-Briefing & KI-Lernen
   ============================================================ */

function getPosition(opts) { 
    return new Promise((ok, err) => navigator.geolocation.getCurrentPosition(ok, err, opts)); 
}

async function fetchUserLocationData() {
    if (!navigator.geolocation) return { fehler: "Geolokalisierung nicht unterstützt." };
    let pos;
    try {
        pos = await getPosition({ timeout: 8000, enableHighAccuracy: true });
    } catch (e) {
        try { pos = await getPosition({ timeout: 12000, enableHighAccuracy: false }); } 
        catch (e2) { return { fehler: "Standort-Zugriff verweigert." }; }
    }
    try {
        const res = await fetch(`https://openstreetmap.org{pos.coords.latitude}&lon=${pos.coords.longitude}&zoom=18&addressdetails=1`);
        const data = await res.json();
        const addr = data.address || {};
        const ort = addr.city || addr.town || addr.village || addr.municipality || "Unbekannter Ort";
        const strasse = addr.road || addr.pedestrian || "";
        const hausnummer = addr.house_number || "";
        let straßenAdresse = strasse ? (hausnummer ? `${strasse} ${hausnummer}` : strasse) : "";
        return {
            latitude: pos.coords.latitude, longitude: pos.coords.longitude, genauigkeit: pos.coords.accuracy,
            lat: pos.coords.latitude.toFixed(4), lon: pos.coords.longitude.toFixed(4),
            ort: ort, land: addr.country || "", strasse: strasse, hausnummer: hausnummer,
            straßenAdresse: straßenAdresse, volstaendigeAdresse: data.display_name || ort
        };
    } catch (e) {
        return { latitude: pos.coords.latitude, longitude: pos.coords.longitude, ort: "Koordinaten ermittelt" };
    }
}

// HIER KORRIGIERT: Liefert wieder das vollständige Wetter-Objekt für deine UI-Temperaturanzeige oben
async function fetchWeatherData() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) return resolve({ fehler: "Kein GPS" });
        navigator.geolocation.getCurrentPosition(async (pos) => {
            try {
                const res = await fetch(`https://open-meteo.com{pos.coords.latitude}&longitude=${pos.coords.longitude}&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,precipitation,wind_speed_10m`);
                const d = await res.json();
                
                // Dieses Objekt befüllt deine visuelle Temperaturanzeige in der App
                const weatherObj = { 
                    temperatur: Math.round(d.current.temperature_2m), 
                    gefuehlteTemperatur: Math.round(d.current.apparent_temperature), 
                    wettercode: d.current.weather_code,
                    niederschlag: d.current.precipitation,
                    windstaerke: d.current.wind_speed_10m,
                    einheit: "°C",
                    baldRegen: d.current.precipitation > 0
                };
                
                // Falls in deiner App eine globale Variable oder ein Update-Event existiert, wird es hier bedient
                if (typeof currentWeatherData !== 'undefined') currentWeatherData = weatherObj;
                
                resolve(weatherObj);
            } catch (e) { resolve({ fehler: "Wetter-API Fehler" }); }
        }, () => resolve({ fehler: "Kein GPS-Signal" }), { timeout: 5000 });
    });
}

async function fetchWeatherForecast() { return { tage: [] }; }
function normalizeKey(s) { return String(s || '').toLowerCase().replace(/[äöüß]/g, m => ({'ä':'ae','ö':'oe','ü':'ue','ß':'ss'}[m])).replace(/[^a-z0-9]/g, ''); }
function isImportantItem(k) { return ['schlüssel', 'geldbeutel', 'brille', 'ausweis'].some(w => normalizeKey(k).includes(w)); }
function displayItemName(k) { return String(k).trim(); }
function getWeatherAdvice(w) { return { rain: w.wettercode > 50, schirm: w.wettercode > 50 ? "Schirm mitnehmen" : "Kein Schirm", jacke: w.temperatur < 12 ? "Warme Jacke" : "Leichte Jacke" }; }

function buildBriefingData(now, weather) {
    let hour = now.getHours();
    let begruessung = hour < 12 ? "Guten Morgen" : (hour < 18 ? "Guten Tag" : "Guten Abend");
    let gegenstaende = Object.keys(memoryItems || {}).filter(isImportantItem).map(k => ({ gegenstand: displayItemName(k), wert: parseMemoryValue(memoryItems[k]) }));
    return { 
        name: currentUserName, 
        begruessung, 
        uhrzeit_gesprochen: now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }), 
        wetter: weather && !weather.fehler ? { temperatur_grad: weather.temperatur, regen_erwartet: weather.baldRegen, regenschirm_empfehlung: weather.temperatur < 15 ? "Schirm einpacken" : "Kein Schirm", jacken_empfehlung: weather.temperatur < 12 ? "Warme Jacke" : "Leichte Jacke" } : null, 
        naechste_termine: [], erinnerungen_naechste_tage: [], zusaetzliche_wuensche: [], wichtige_gegenstaende: gegenstaende 
    };
}

async function composeBriefingWithModel(data) {
    try {
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: "Du bist J.A.R.V.I.S., Butler von " + data.name + ". Sprich ein flüssiges Tagesbriefing ohne Markdown." },
                    { role: "user", content: "Daten: " + JSON.stringify(data) }
                ]
            })
        });
        const text = await res.text();
        let d = JSON.parse(text);
        return d.choices[0].message.content.trim();
    } catch (e) { return null; }
}

function buildFallbackBriefing(data) { return `${data.begruessung}, ${data.name}. Es ist ${data.uhrzeit_gesprochen}.`; }

async function learnFromConversations() {
    if (!chatHistory || chatHistory.length < 4) return;
    try {
        const verlauf = chatHistory.slice(-40).map(m => `${m.role === 'user' ? 'User' : 'Jarvis'}: ${m.content}`).join('\n');
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                messages: [
                    { role: "system", content: "Suche nach neuen Fakten über den User. Antworte kurz als Begriff: wert." },
                    { role: "user", content: "Verlauf:\n" + verlauf }
                ]
            })
        });
        const txt = await res.text();
        let d = JSON.parse(txt);
        let content = d.choices[0].message.content;
        if (content && content.includes(":")) {
            let parts = content.split(":");
            let k = parts[0].trim().toLowerCase();
            let v = parts[1].trim();
            if (k && v) {
                await apiFetch('/api/groq', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'store', text: `${k}: ${v}` })
                }).catch(console.error);
                updateTerminalStream(`MEMORY_VECTOR_WRITE: ${k.toUpperCase()}`);
            }
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
        
        // Aktualisiert die Anzeige direkt nach dem Briefing auf dem Screen
        if (typeof renderAllLists === 'function') renderAllLists();
        
        learnFromConversations();
    } finally {
        stopThinkingSound();
        isProcessing = false;
    }
}
