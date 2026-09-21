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
                        latitude: lat,
                        longitude: lon,
                        genauigkeit: pos.coords.accuracy,
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
                        latitude: lat,
                        longitude: lon,
                        genauigkeit: pos.coords.accuracy,
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


/* --- Wettervorhersage: heute + 6 Tage (Open-Meteo) --- */
function weatherCodeText(code) {
    const map = {
        0: 'klar', 1: 'überwiegend klar', 2: 'teils bewölkt', 3: 'bedeckt', 45: 'Nebel', 48: 'Nebel mit Reif',
        51: 'leichter Nieselregen', 53: 'Nieselregen', 55: 'starker Nieselregen', 56: 'gefrierender Nieselregen', 57: 'starker gefrierender Nieselregen',
        61: 'leichter Regen', 63: 'Regen', 65: 'starker Regen', 66: 'gefrierender Regen', 67: 'starker gefrierender Regen',
        71: 'leichter Schneefall', 73: 'Schneefall', 75: 'starker Schneefall', 77: 'Schneegriesel',
        80: 'leichte Regenschauer', 81: 'Regenschauer', 82: 'heftige Regenschauer', 85: 'leichte Schneeschauer', 86: 'Schneeschauer',
        95: 'Gewitter', 96: 'Gewitter mit Hagel', 99: 'schweres Gewitter mit Hagel'
    };
    return map[code] || 'wechselhaft';
}

/* Empfehlungen für einen Tag (gleiche Grenzen wie beim aktuellen Wetter, aber mit dem Tageshöchstwert) */
function getDailyAdvice(day) {
    const rain = day.regenwahrscheinlichkeit_prozent >= 50 || day.niederschlag_mm >= 1;
    const wind = Math.max(day.wind_max_kmh || 0, day.boeen_max_kmh || 0);
    const t = day.hoechstwert_grad;
    let jacke;
    if (t < 5) jacke = 'Dicke Winterjacke anziehen';
    else if (t < 12) jacke = 'Warme Jacke anziehen';
    else if (t < 18) jacke = 'Leichte Jacke mitnehmen';
    else if (wind > 35) jacke = 'Windjacke anziehen';
    else if (t < 21) jacke = 'Leichte Jacke zur Sicherheit mitnehmen';
    else jacke = 'Keine Jacke nötig';
    return {
        regenschirm_empfehlung: rain ? 'Regenschirm mitnehmen' : 'Kein Regenschirm nötig',
        jacken_empfehlung: jacke,
        sturm_hinweis: wind > 35 ? `Kräftige Windböen bis ${Math.round(wind)} Kilometer pro Stunde` : null
    };
}

async function fetchWeatherForecast() {
    try {
        const pos = await new Promise((ok, err) =>
            navigator.geolocation.getCurrentPosition(ok, err, { timeout: 7000, maximumAge: 300000 }));
        const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${pos.coords.latitude}&longitude=${pos.coords.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&timezone=Europe%2FBerlin&forecast_days=7`);
        const data = await res.json();
        const d = data.daily;
        if (!d || !d.time) return { fehler: 'Die Vorhersage konnte nicht geladen werden.' };

        const todayIso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
        const rel = ['heute', 'morgen', 'übermorgen'];
        const tage = d.time.map((iso, i) => {
            const day = {
                datum: iso,
                wochentag: new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'long' }),
                tag: iso === todayIso ? 'heute' : (i > 0 && d.time[0] === todayIso && rel[i]) || '',
                wetter: weatherCodeText(d.weather_code[i]),
                tiefstwert_grad: Math.round(d.temperature_2m_min[i]),
                hoechstwert_grad: Math.round(d.temperature_2m_max[i]),
                niederschlag_mm: Math.round((d.precipitation_sum[i] || 0) * 10) / 10,
                regenwahrscheinlichkeit_prozent: d.precipitation_probability_max ? (d.precipitation_probability_max[i] || 0) : 0,
                wind_max_kmh: Math.round(d.wind_speed_10m_max[i] || 0),
                boeen_max_kmh: Math.round(d.wind_gusts_10m_max[i] || 0)
            };
            return { ...day, ...getDailyAdvice(day) };
        });
        return { tage };
    } catch (e) {
        return { fehler: 'Die Wettervorhersage ist gerade nicht verfügbar.' };
    }
}

/* Schreibweisen vereinheitlichen: "Schlüssel", "Schluessel" und "mein schlüssel" werden gleich behandelt */
function normalizeKey(s) {
    return String(s).toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]/g, '');
}

/* Wichtige Gegenstände, die im Briefing immer genannt werden. Hier kannst du Wörter ergänzen. */
const IMPORTANT_ITEM_KEYWORDS = [
    'schlüssel', 'autoschlüssel', 'brille', 'sonnenbrille', 'lesebrille',
    'geldbeutel', 'geldbörse', 'portemonnaie', 'portmonee', 'portemonaie', 'brieftasche',
    'papiere', 'dokumente', 'ausweis', 'personalausweis', 'reisepass', 'führerschein', 'fahrzeugschein'
].map(normalizeKey);

function isImportantItem(key) {
    const k = normalizeKey(key);
    if (IMPORTANT_ITEM_KEYWORDS.some(kw => k.includes(kw))) return true;
    // Begriffe, die der User selbst ins Briefing aufgenommen hat
    return (briefingWishes || []).some(w => {
        if (w.type !== 'item') return false;
        const t = normalizeKey(w.text);
        return t && k.includes(t);
    });
}

/* "schlüsselort" heißt für die Ansage einfach "schlüssel": Das Wort "ort" hängt die KI beim Speichern manchmal an. */
function displayItemName(key) {
    const k = String(key).trim();
    if (/ort$/i.test(k) && k.length > 4) {
        const base = k.slice(0, -3);
        if (isImportantItem(base)) return base;
    }
    return k;
}

/* Wünsche mit Wochentag ("Montags: Mülltonne raus") gelten nur an diesem Tag */
function wishAppliesToday(text, wochentag) {
    const days = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
    const t = String(text).toLowerCase();
    const mentioned = days.filter(d => t.includes(d));
    return mentioned.length === 0 || mentioned.includes(String(wochentag).toLowerCase());
}

/* Ein Gegenstand als Satz: "schlüssel liegt in der Schublade" */
function itemSentence(g) {
    const v = String(g.wert).toLowerCase();
    const isPlace = /^(auf|in|im|an|am|bei|unter|neben|hinter|vor|über)\b/.test(v);
    const name = g.gegenstand.charAt(0).toUpperCase() + g.gegenstand.slice(1);
    return isPlace ? `${name} liegt ${g.wert}` : `${name}: ${g.wert}`;
}

/* Sicherheitsnetz: Fehlt ein wichtiger Gegenstand im Text der KI, wird er hinten angehängt. */
function ensureItemsMentioned(text, data) {
    const norm = normalizeKey(text);
    const missing = (data.wichtige_gegenstaende || []).filter(g => {
        const lastWord = s => { const w = String(s).trim().split(/\s+/); return normalizeKey(w[w.length - 1]); };
        const nameCore = lastWord(g.gegenstand);
        const placeCore = lastWord(g.wert);
        const mentioned = (nameCore && norm.includes(nameCore)) || (placeCore && placeCore.length > 3 && norm.includes(placeCore));
        return !mentioned;
    });
    if (missing.length === 0) return text;
    return text.trim() + ' Noch zur Erinnerung: ' + missing.map(itemSentence).join('. ') + '.';
}

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

/* Uhrzeit so, wie man sie sagt: "16 Uhr 17" (24-Stunden-Zählung, exakt, Berliner Zeit).
   Wird an die KI übergeben, damit sie die Zeit nicht selbst umrechnet oder rundet. */
function formatSpokenTime(date) {
    const parts = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
    }).formatToParts(date);
    const hh = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const mm = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return mm === 0 ? `${hh} Uhr` : `${hh} Uhr ${mm}`;
}

/* Einstellungen fürs Briefing: hier kannst du die Zahlen ändern */
const BRIEFING_MAX_APPOINTMENTS = 4;   // so viele der nächsten Termine werden genannt
const BRIEFING_REMINDER_DAYS = 4;      // Erinnerungen für heute und die folgenden Tage (zusammen 4 Tage)
const BIRTHDAY_PATTERN = /geburtstag|birthday|bday/i;   // solche Einträge zählen im Briefing nicht als Termin

function isBirthdayEntry(e) {
    return e.eventType === 'birthday' || BIRTHDAY_PATTERN.test(e.text || '');
}

/* "heute", "morgen", "übermorgen", "am Freitag" oder "am Freitag, 3. Oktober" (für Briefing und Übersichtszeile) */
function relativeDayLabel(date, todayStart) {
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const diff = Math.round((dayStart - todayStart) / 86400000);
    if (diff <= 0) return 'heute';
    if (diff === 1) return 'morgen';
    if (diff === 2) return 'übermorgen';
    if (diff <= 6) return 'am ' + date.toLocaleDateString('de-DE', { weekday: 'long' });
    return 'am ' + date.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
}

function buildBriefingData(now, weather) {
    const hour = parseInt(now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false }), 10);
    const uhrzeit = now.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

    let begruessung = "Guten Morgen";
    if (hour >= 12 && hour < 18) begruessung = "Guten Tag";
    if (hour >= 18) begruessung = "Guten Abend";

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const remindersUntil = new Date(todayStart);
    remindersUntil.setDate(todayStart.getDate() + BRIEFING_REMINDER_DAYS);

    const dayLabel = (date) => relativeDayLabel(date, todayStart);
    const timeLabel = (date, allDay) => allDay ? 'ganztägig' : formatSpokenTime(date);

    // Die nächsten Termine (Geburtstage zählen nicht als Termin)
    const termine = (calendarEntries || [])
        .filter(e => e.isoDate && !isBirthdayEntry(e))
        .map(e => ({ text: e.text, ...parseEventDate(e.isoDate) }))
        .filter(e => !isNaN(e.date.getTime()) && (e.allDay ? e.date >= todayStart : e.date >= now))
        .sort((a, b) => a.date - b.date)
        .slice(0, BRIEFING_MAX_APPOINTMENTS)
        .map(e => ({ text: e.text, tag: dayLabel(e.date), uhrzeit: timeLabel(e.date, e.allDay) }));

    // Erinnerungen für heute und die folgenden Tage
    const erinnerungen = (reminderEntries || [])
        .filter(r => r.time && !r.triggered)
        .map(r => ({ text: r.text, ...parseEventDate(r.time) }))
        .filter(r => !isNaN(r.date.getTime()) && r.date >= todayStart && r.date < remindersUntil)
        .sort((a, b) => a.date - b.date)
        .map(r => ({ text: r.text, tag: dayLabel(r.date), uhrzeit: timeLabel(r.date, r.allDay) }));

    const gegenstaende = Object.keys(memoryItems || {})
        .filter(k => isImportantItem(k))
        .map(k => ({ gegenstand: displayItemName(k), wert: parseMemoryValue(memoryItems[k]) }));

    const wochentag = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long' }).format(now);
    const wuensche = (briefingWishes || [])
        .filter(w => w.type === 'text')
        .map(w => w.text)
        .filter(t => wishAppliesToday(t, wochentag));

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
        uhrzeit_gesprochen: formatSpokenTime(now),
        wetter,
        naechste_termine: termine,
        erinnerungen_naechste_tage: erinnerungen,
        zusaetzliche_wuensche: wuensche,
        wichtige_gegenstaende: gegenstaende
    };
}

async function composeBriefingWithModel(data) {
    const systemPrompt = "Du bist J.A.R.V.I.S., der persönliche Butler von " + data.name + ". Formuliere ein gesprochenes Tages-Briefing auf Deutsch: höflich, ruhig, trocken im Stil eines britischen Butlers, ohne Markdown, ohne Aufzählungszeichen, in fließenden Sätzen. Es wird laut vorgelesen und soll etwa 60 bis 90 Wörter lang sein (bei vielen Terminen oder Gegenständen darf es länger sein).\n\n" +
    "Reihenfolge: 1. kurze Begrüßung mit der genauen Uhrzeit (übernimm 'uhrzeit_gesprochen' wörtlich, z.B. 'Es ist 16 Uhr 17'), 2. Wetter mit klarer Aussage zu Regenschirm und Jacke, 3. Termine, 4. Erinnerungen, 5. zusätzliche Wünsche, 6. wichtige Gegenstände.\n\n" +
    "Regeln:\n" +
    "- Uhrzeiten: Nenne jede Uhrzeit exakt und in 24-Stunden-Zählung, so wie sie in den Daten steht (z.B. 'um 16 Uhr 17' oder 'um 14 Uhr 30'). Runde niemals und verwende keine Ausdrücke wie 'kurz nach', 'kurz vor', 'halb' oder 'Viertel'. Zähle nie in 12 Stunden (16 Uhr ist nicht 'vier').\n" +
    "- Wetter: Übernimm 'regenschirm_empfehlung' und 'jacken_empfehlung' inhaltlich exakt und widersprich ihnen nie. Nenne die Temperatur nur knapp. Gibt es einen 'sturm_hinweis', erwähne ihn. Ist 'wetter' null, sage in einem Halbsatz, dass keine Wetterdaten vorliegen.\n" +
    "- Termine und Erinnerungen: Nenne Text, Tag und Uhrzeit. Der Tag steht schon passend formuliert in den Daten (z.B. 'heute', 'morgen', 'am Freitag', 'am Freitag, 3. Oktober'): Übernimm ihn wörtlich. Es sind nur die nächsten Termine enthalten (Geburtstage gehören absichtlich nicht dazu): Nenne nichts darüber hinaus. Die Uhrzeit steht schon gesprochen in den Daten (z.B. '14 Uhr' oder '14 Uhr 30'): Übernimm sie wörtlich und sprich niemals 'null null'. Ganztägige nur mit Tag. Gibt es keine Termine, genügt ein Halbsatz wie 'Ihr Kalender ist frei'. Gibt es keine Erinnerungen, lass sie weg.\n" +
    "- Zusätzliche Wünsche: Steht etwas in 'zusaetzliche_wuensche', nimm JEDEN dieser Wünsche im Briefing auf, sinngemäß und in einem natürlichen Satz. Erfinde nichts dazu. Enthält ein Wunsch eine weitere Bedingung (z.B. 'wenn es regnet'), prüfe sie anhand der Daten und lass den Wunsch weg, wenn sie nicht zutrifft. Gibt es keine Wünsche, lass den Teil weg.\n" +
    "- Wichtige Gegenstände: Das ist ein wichtiger Teil, denn der User verlässt danach das Haus. Nenne JEDEN Eintrag aus 'wichtige_gegenstaende' mit Begriff und Platz und lass keinen aus, auch wenn das Briefing dadurch länger wird. Formuliere jeden als natürlichen Satz mit korrektem Artikel und Präposition ('Ihr Schlüssel liegt in der Schublade'). Steht im Wert nur ein Platz ohne Präposition (z.B. 'Küchenschrank'), erfinde keine wie 'im' oder 'auf', sondern sage 'Ihr Schlüssel ist beim Küchenschrank'. Verwende niemals das Wort 'Ort' und wiederhole den Begriff nicht doppelt. Gibt es keine Einträge, lass den Teil weg.\n" +
    "- Erfinde nichts, was nicht in den Daten steht. Sprich den User sparsam mit 'Sir' oder seinem Namen an.\n\n" +
    "Antworte ausschließlich mit einem JSON-Objekt der Form {\"briefing\": \"...\"}.";

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await apiFetch('/api/groq', {
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
    let text = `${data.begruessung}, ${data.name}. Es ist ${data.uhrzeit_gesprochen}. `;

    if (data.wetter) {
        const w = data.wetter;
        text += `Draußen sind es ${w.temperatur_grad} Grad, gefühlt ${w.gefuehlt_grad}. `;
        if (w.sturm_hinweis) text += `${w.sturm_hinweis}. `;
        text += `${w.regenschirm_empfehlung}. ${w.jacken_empfehlung}. `;
    } else {
        text += "Wetterdaten liegen leider nicht vor. ";
    }

    if (data.naechste_termine.length > 0) {
        text += "Ihre nächsten Termine: " + data.naechste_termine.map(t => `${t.tag} ${t.uhrzeit === 'ganztägig' ? 'ganztägig' : 'um ' + t.uhrzeit} ${t.text}`).join(', ') + ". ";
    } else {
        text += "Sie haben keine anstehenden Termine. ";
    }

    if (data.erinnerungen_naechste_tage.length > 0) {
        text += "Erinnerungen: " + data.erinnerungen_naechste_tage.map(r => `${r.text} ${r.tag}${r.uhrzeit === 'ganztägig' ? '' : ' um ' + r.uhrzeit}`).join(' sowie ') + ". ";
    }

    if ((data.zusaetzliche_wuensche || []).length > 0) {
        text += data.zusaetzliche_wuensche.map(w => { const t = w.trim(); return /[.!?]$/.test(t) ? t : t + '.'; }).join(' ') + ' ';
    }

    if (data.wichtige_gegenstaende.length > 0) {
        text += data.wichtige_gegenstaende.map(itemSentence).join('. ') + ". ";
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
        else text = ensureItemsMentioned(text, data);

        chatHistory.push({ role: "assistant", content: JSON.stringify({ type: "chat", reply: text }) });

        typeWriterStatus("Klicken zum Sprechen...");
        speak(text, continueConversation);
    } finally {
        stopThinkingSound();
        isProcessing = false;
    }
}
