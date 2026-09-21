/* ============================================================
   BRIEFING: Standort, Wetter, Tages-Briefing
   Braucht: storage.js, lists.js (parseMemoryValue), voice.js
   ============================================================ */

/* --- Standortermittlung mit Geocoding (inkl. Straße & Hausnummer) --- */
async function fetchUserLocationData() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ fehler: "Geolokalisierung nicht unterstützt." });
            return;
        }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const lat = pos.coords.latitude;
                const lon = pos.coords.longitude;
                try {
                    // Zoom 18 erzwingt die genaue Auflösung bis auf Gebäudeebene
                    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
                    const data = await res.json();
                    const addr = data.address || {};

                    const ort = addr.city || addr.town || addr.village || addr.municipality || addr.county || "Unbekannter Ort";
                    const land = addr.country || "Unbekanntes Land";

                    // Straße & Hausnummer ermitteln
                    const strasse = addr.road || addr.pedestrian || addr.footway || addr.path || "";
                    const hausnummer = addr.house_number || "";

                    // Exakten Adress-String zusammensetzen
                    let straßenAdresse = "";
                    if (strasse) {
                        straßenAdresse = hausnummer ? `${strasse} ${hausnummer}` : strasse;
                    }

                    resolve({
                        lat: lat.toFixed(4),
                        lon: lon.toFixed(4),
                        ort: ort,
                        land: land,
                        strasse: strasse,
                        hausnummer: hausnummer,
                        straßenAdresse: straßenAdresse,
                        volstaendigeAdresse: data.display_name || `${straßenAdresse}, ${ort}`
                    });
                } catch (e) {
                    resolve({
                        lat: lat.toFixed(4),
                        lon: lon.toFixed(4),
                        ort: "Koordinaten ermittelt",
                        land: ""
                    });
                }
            },
            (err) => {
                resolve({ fehler: "Standort-Zugriff verweigert oder nicht verfügbar." });
            },
            { timeout: 7000, enableHighAccuracy: true }
        );
    });
}

/* --- Wetter --- */
async function fetchWeatherData() {
    return new Promise((resolve) => {
        const getMeteo = async (lat, lon) => {
            try {
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,windgusts_10m,apparent_temperature&hourly=precipitation,weather_code`);
                const data = await res.json();

                let upcomingRain = false;
                let upcomingWeatherCode = data.current.weather_code;
                let maxUpcomingPrecipitation = data.current.precipitation;

                if (data.hourly && data.hourly.precipitation && data.hourly.time) {
                    const nowHourIndex = data.hourly.time.findIndex(t => new Date(t) >= new Date());
                    if (nowHourIndex !== -1) {
                        for (let i = 0; i <= 3; i++) {
                            const idx = nowHourIndex + i;
                            if (idx < data.hourly.precipitation.length) {
                                const precip = data.hourly.precipitation[idx];
                                const code = data.hourly.weather_code[idx];
                                if (precip > 0 || (code >= 51 && code <= 67) || (code >= 80 && code <= 99)) {
                                    upcomingRain = true;
                                    if (precip > maxUpcomingPrecipitation) maxUpcomingPrecipitation = precip;
                                    upcomingWeatherCode = code;
                                }
                            }
                        }
                    }
                }

                resolve({
                    temperatur: Math.round(data.current.temperature_2m),
                    gefuehlteTemperatur: Math.round(data.current.apparent_temperature),
                    einheit: data.current_units.temperature_2m,
                    niederschlag: data.current.precipitation,
                    forecastNiederschlag: maxUpcomingPrecipitation,
                    baldRegen: upcomingRain,
                    windstaerke: data.current.wind_speed_10m,
                    boeen: data.current.windgusts_10m,
                    wettercode: upcomingWeatherCode,
                    koordinaten: { lat, lon }
                });
            } catch (e) {
                resolve({ fehler: "Wetterdaten konnten nicht geladen werden." });
            }
        };

        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => getMeteo(pos.coords.latitude, pos.coords.longitude),
                () => resolve({ fehler: "Standort für Wetterabfrage nicht verfügbar." }),
                { timeout: 5000, enableHighAccuracy: true }
            );
        } else {
            resolve({ fehler: "Geolokalisierung nicht unterstützt." });
        }
    });
}

const IMPORTANT_ITEM_KEYWORDS = ['schlüssel', 'brille', 'sonnenbrille', 'geldbeutel', 'portemonnaie', 'papiere', 'ausweis'];

function getWeatherAdvice(weather) {
    const feels = weather.gefuehlteTemperatur;
    const wind = Math.max(weather.windstaerke || 0, weather.boeen || 0);
    const code = weather.wettercode;
    const rain = (weather.niederschlag > 0) || weather.baldRegen || (code >= 51 && code <= 67) || (code >= 80 && code <= 99);

    let jacke;
    if (feels < 5) jacke = 'Dicke Winterjacke anziehen';
    else if (feels < 12) jacke = 'Warme Jacke anziehen';
    else if (feels < 18) jacke = 'Leichte Jacke mitnehmen';
    else if (wind > 35) jacke = 'Windjacke anziehen';
    else if (feels < 21) jacke = 'Leichte Jacke zur Sicherheit mitnehmen';
    else jacke = 'Keine Jacke nötig';

    return {
        rain,
        schirm: rain ? 'Regenschirm mitnehmen' : 'Kein Regenschirm nötig',
        jacke,
        sturm: wind > 35 ? `Kräftige Windböen bis ${Math.round(wind)} Kilometer pro Stunde` : null,
        wind: Math.round(wind)
    };
}

/* --- Tages-Briefing --- */
function parseEventDate(iso) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
        const [y, m, d] = iso.split('-').map(Number);
        return { date: new Date(y, m - 1, d), allDay: true };
    }
    return { date: new Date(iso), allDay: false };
}

function buildBriefingData(now, weather) {
    const hour = parseInt(now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }), 10);
    const uhrzeit = now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

    let begruessung = "Guten Morgen";
    if (hour >= 12 && hour < 18) begruessung = "Guten Tag";
    if (hour >= 18) begruessung = "Guten Abend";

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const limitDate = new Date(todayStart);
    limitDate.setDate(todayStart.getDate() + 2);

    const dayLabel = (date) => {
        const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        return Math.round((dayStart - todayStart) / 86400000) === 0 ? 'heute' : 'morgen';
    };
    const timeLabel = (date, allDay) => allDay ? 'ganztägig' : date.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

    const termine = (calendarEntries || [])
        .filter(e => e.isoDate)
        .map(e => ({ text: e.text, ...parseEventDate(e.isoDate) }))
        .filter(e => !isNaN(e.date.getTime()) && e.date < limitDate && (e.allDay ? e.date >= todayStart : e.date >= now))
        .sort((a, b) => a.date - b.date)
        .map(e => ({ text: e.text, tag: dayLabel(e.date), uhrzeit: timeLabel(e.date, e.allDay) }));

    const erinnerungen = (reminderEntries || [])
        .filter(r => r.time && !r.triggered)
        .map(r => ({ text: r.text, ...parseEventDate(r.time) }))
        .filter(r => !isNaN(r.date.getTime()) && r.date >= todayStart && r.date < limitDate)
        .sort((a, b) => a.date - b.date)
        .map(r => ({ text: r.text, tag: dayLabel(r.date), uhrzeit: timeLabel(r.date, r.allDay) }));

    const gegenstaende = Object.keys(memoryItems || {})
        .filter(k => IMPORTANT_ITEM_KEYWORDS.some(kw => k.toLowerCase().includes(kw)))
        .map(k => ({ gegenstand: k, wert: parseMemoryValue(memoryItems[k]) }));

    let wetter = null;
    if (weather && !weather.fehler) {
        const advice = getWeatherAdvice(weather);
        wetter = {
            temperatur_grad: weather.temperatur,
            gefuehlt_grad: weather.gefuehlteTemperatur,
            wind_kmh: advice.wind,
            regen_erwartet: advice.rain,
            regenschirm_empfehlung: advice.schirm,
            jacken_empfehlung: advice.jacke,
            sturm_hinweis: advice.sturm
        };
    }

    return {
        name: currentUserName,
        begruessung,
        uhrzeit,
        wetter,
        termine_heute_und_morgen: termine,
        erinnerungen_heute_und_morgen: erinnerungen,
        wichtige_gegenstaende: gegenstaende
    };
}

async function composeBriefingWithModel(data) {
    const systemPrompt = "Du bist J.A.R.V.I.S., der persönliche Butler von " + data.name + ". Formuliere ein gesprochenes Tages-Briefing auf Deutsch: höflich, ruhig, trocken im Stil eines britischen Butlers, ohne Markdown, ohne Aufzählungszeichen, in fließenden Sätzen. Es wird laut vorgelesen und soll etwa 60 bis 90 Wörter lang sein.\n\n" +
    "Reihenfolge: 1. kurze Begrüßung mit Uhrzeit (natürlich gesprochen, z.B. 'kurz nach sieben'), 2. Wetter mit klarer Aussage zu Regenschirm und Jacke, 3. Termine, 4. Erinnerungen, 5. wichtige Gegenstände.\n\n" +
    "Regeln:\n" +
    "- Wetter: Übernimm 'regenschirm_empfehlung' und 'jacken_empfehlung' inhaltlich exakt und widersprich ihnen nie. Nenne die Temperatur nur knapp. Gibt es einen 'sturm_hinweis', erwähne ihn. Ist 'wetter' null, sage in einem Halbsatz, dass keine Wetterdaten vorliegen.\n" +
    "- Termine und Erinnerungen: Nenne Text, Tag (heute oder morgen) und Uhrzeit natürlich ('um 14 Uhr 30'). Ganztägige nur mit Tag. Gibt es keine Termine, genügt ein Halbsatz wie 'Ihr Kalender ist frei'. Gibt es keine Erinnerungen, lass sie weg.\n" +
    "- Wichtige Gegenstände: Formuliere jeden als natürlichen Satz mit korrektem Artikel und Präposition ('Ihr Schlüssel liegt unter der Fußmatte'). Verwende niemals das Wort 'Ort' und wiederhole den Begriff nicht doppelt. Gibt es keine, lass den Teil weg.\n" +
    "- Erfinde nichts, was nicht in den Daten steht. Sprich den User sparsam mit 'Sir' oder seinem Namen an.\n\n" +
    "Antworte ausschließlich mit einem JSON-Objekt der Form {\"briefing\": \"...\"}.";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await fetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            signal: controller.signal,
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: "Daten für das Briefing: " + JSON.stringify(data) }
                ]
            })
        });
        const json = await res.json();
        const parsed = JSON.parse(json.choices[0].message.content);
        const text = (parsed.briefing || '').trim();
        return text.length > 0 ? text : null;
    } catch (e) {
        console.error("Briefing-Formulierung fehlgeschlagen", e);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function buildFallbackBriefing(data) {
    let text = `${data.begruessung}, ${data.name}. Es ist ${data.uhrzeit} Uhr. `;

    if (data.wetter) {
        const w = data.wetter;
        text += `Draußen sind es ${w.temperatur_grad} Grad, gefühlt ${w.gefuehlt_grad}. `;
        if (w.sturm_hinweis) text += `${w.sturm_hinweis}. `;
        text += `${w.regenschirm_empfehlung}. ${w.jacken_empfehlung}. `;
    } else {
        text += "Wetterdaten liegen leider nicht vor. ";
    }

    if (data.termine_heute_und_morgen.length > 0) {
        text += "Ihre Termine: " + data.termine_heute_und_morgen.map(t => `${t.tag} ${t.uhrzeit === 'ganztägig' ? 'ganztägig' : 'um ' + t.uhrzeit + ' Uhr'} ${t.text}`).join(', ') + ". ";
    } else {
        text += "Ihr Kalender ist für heute und morgen frei. ";
    }

    if (data.erinnerungen_heute_und_morgen.length > 0) {
        text += "Erinnerungen: " + data.erinnerungen_heute_und_morgen.map(r => `${r.text} ${r.tag}${r.uhrzeit === 'ganztägig' ? '' : ' um ' + r.uhrzeit + ' Uhr'}`).join(' sowie ') + ". ";
    }

    if (data.wichtige_gegenstaende.length > 0) {
        text += data.wichtige_gegenstaende.map(g => {
            const v = String(g.wert).toLowerCase();
            const isPlace = /^(auf|in|im|an|am|bei|unter|neben|hinter|vor|über)\b/.test(v);
            return isPlace ? `${g.gegenstand} liegt ${g.wert}` : `${g.gegenstand}: ${g.wert}`;
        }).join('. ') + ". ";
    }

    return text;
}

async function triggerDailyBriefing() {
    if (isProcessing) return;
    if (isSpeaking()) interruptSpeaking();

    isProcessing = true;
    startThinkingSound();
    if (recordBtn) recordBtn.classList.remove('recording');
    if (recordText) recordText.textContent = "J.A.R.V.I.S. / VERARBEITET...";
    updateTerminalStream("EXECUTE: DAILY_BRIEFING", "PROCESSING");

    try {
        typeWriterStatus("Analysiere Wetterdaten...");
        setHudSubtitle("Lade Wetterdaten & Termine...");
        const weather = await fetchWeatherData();
        const data = buildBriefingData(new Date(), weather);

        typeWriterStatus("Stelle Briefing zusammen...");
        let text = await composeBriefingWithModel(data);
        if (!text) text = buildFallbackBriefing(data);

        chatHistory.push({ role: "assistant", content: JSON.stringify({ type: "chat", reply: text }) });

        typeWriterStatus("Klicken zum Sprechen...");
        speak(text, continueConversation);
    } finally {
        stopThinkingSound();
        isProcessing = false;
    }
}
