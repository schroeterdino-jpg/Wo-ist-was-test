/* ============================================================
   BRIEFING: Standort, Wetter, Tages-Briefing
   Braucht: storage.js, lists.js (parseMemoryValue), voice.js
   ============================================================ */

/* --- Standortermittlung mit Geocoding (inkl. Straße & Hausnummer) ---
   Erst mit GPS (genau, aber in Tiefgaragen/Gebäuden oft ohne Empfang), bei Fehlschlag
   automatisch ein zweiter Versuch mit ungenauerer, aber zuverlässigerer WLAN/Mobilfunk-Ortung. */
function getPosition(opts) {
    return new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, opts);
    });
}

async function fetchUserLocationData() {
    if (!navigator.geolocation) return { fehler: "Geolokalisierung nicht unterstützt." };

    let pos;
    try {
        pos = await getPosition({ timeout: 8000, enableHighAccuracy: true });
    } catch (e) {
        try {
            pos = await getPosition({ timeout: 12000, enableHighAccuracy: false });
        } catch (e2) {
            return { fehler: "Standort-Zugriff verweigert oder nicht verfügbar." };
        }
    }

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

        return {
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
        };
    } catch (e) {
        return {
            latitude: lat,
            longitude: lon,
            genauigkeit: pos.coords.accuracy,
            lat: lat.toFixed(4),
            lon: lon.toFixed(4),
            ort: "Koordinaten ermittelt",
            land: ""
        };
    }
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

/* Empfehlungen für einen Tag */
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

/* Schreibweisen vereinheitlichen */
function normalizeKey(s) {
    return String(s).toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]/g, '');
}

/* Wichtige Gegenstände */
const IMPORTANT_ITEM_KEYWORDS = [
    'schlüssel', 'autoschlüssel', 'brille', 'sonnenbrille', 'lesebrille',
    'geldbeutel', 'geldbörse', 'portemonnaie', 'portmonee', 'portemonaie', 'brieftasche',
    'papiere', 'dokumente', 'ausweis', 'personalausweis', 'reisepass', 'führerschein', 'fahrzeugschein'
].map(normalizeKey);

function isImportantItem(key) {
    const k = normalizeKey(key);
    if (IMPORTANT_ITEM_KEYWORDS.some(kw => k.includes(kw))) return true;
    return (briefingWishes || []).some(w => {
        if (w.type !== 'item') return false;
        const t = normalizeKey(w.text);
        return t && k.includes(t);
    });
}

function displayItemName(key) {
    const k = String(key).trim();
    if (/ort$/i.test(k) && k.length > 4) {
        const base = k.slice(0, -3);
        if (isImportantItem(base)) return base;
    }
    return k;
}

function wishAppliesToday(text, wochentag) {
    const days = ['montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag'];
    const t = String(text).toLowerCase();
    const mentioned = days.filter(d => t.includes(d));
    return mentioned.length === 0 || mentioned.includes(String(wochentag).toLowerCase());
}

function itemSentence(g) {
    const v = String(g.wert).toLowerCase();
    const isPlace = /^(auf|in|im|an|am|bei|unter|neben|hinter|vor|über)\b/.test(v);
    const name = g.gegenstand.charAt(0).toUpperCase() + g.gegenstand.slice(1);
    return isPlace ? `${name} liegt ${g.wert}` : `${name}: ${g.wert}`;
}

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

function formatSpokenTime(date) {
    const parts = new Intl.DateTimeFormat('de-DE', {
        timeZone: 'Europe/Berlin', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
    }).formatToParts(date);
    const hh = parseInt(parts.find(p => p.type === 'hour').value, 10);
    const mm = parseInt(parts.find(p => p.type === 'minute').value, 10);
    return mm === 0 ? `${hh} Uhr` : `${hh} Uhr ${mm}`;
}

const BRIEFING_MAX_APPOINTMENTS = 4;
const BRIEFING_REMINDER_DAYS = 4;
const BIRTHDAY_PATTERN = /geburtstag|birthday|bday/i;

function isBirthdayEntry(e) {
    return e.eventType === 'birthday' || BIRTHDAY_PATTERN.test(e.text || '');
}

function describeEventDate(iso) {
    const parsed = parseEventDate(iso);
    if (isNaN(parsed.date.getTime())) return { datum: '', zeit: '' };
    const opts = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' };
    if (!parsed.allDay) opts.timeZone = 'Europe/Berlin';
    return {
        datum: parsed.date.toLocaleDateString('de-DE', opts),
        zeit: parsed.allDay ? 'ganztägig' : formatSpokenTime(parsed.date)
    };
}

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

    const termine = (calendarEntries || [])
        .filter(e => e.isoDate && !isBirthdayEntry(e))
        .map(e => ({ text: e.text, ...parseEventDate(e.isoDate) }))
        .filter(e => !isNaN(e.date.getTime()) && (e.allDay ? e.date >= todayStart : e.date >= now))
        .sort((a, b) => a.date - b.date)
        .slice(0, BRIEFING_MAX_APPOINTMENTS)
        .map(e => ({ text: e.text, tag: dayLabel(e.date), uhrzeit: timeLabel(e.date, e.allDay) }));

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

    const briefingData = {
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

    const parkInfo = (typeof describeParking === 'function') ? describeParking() : null;
    if (parkInfo) briefingData.parkplatz = parkInfo;
    return briefingData;
}

async function composeBriefingWithModel(data) {
    const systemPrompt = "Du bist J.A.R.V.I.S., der hochintelligente, charmante und aufmerksame persönliche Assistent von " + data.name + ". Formuliere ein gesprochenes Tages-Briefing auf Deutsch. Es soll natürlich, flüssig, menschlich und elegant klingen – wie ein echter Butler, der spricht, nicht wie ein Roboter, der eine Liste vorliest. Verzichte komplett auf Aufzählungszeichen, Tabellen oder Markdown-Formatierungen.\n\n" +
    "Ablauf & Tonfall:\n" +
    "1. Begrüßung & Uhrzeit: Begrüße ihn herzlich und verbinde die Uhrzeit ganz natürlich (z. B. 'Guten Morgen, Dino. Es ist jetzt genau 16 Uhr 17...'). Nutze dafür 'uhrzeit_gesprochen'.\n" +
    "2. Wetter: Bette das Wetter in einen flüssigen, menschlichen Satz ein. Statt nur trocken '16 Grad' zu sagen, beschreibe es charmant und passend (z. B. 'Draußen erwarten Sie heute milde 16 Grad, gefühlt etwa 15...'). Flechte die Empfehlungen zu Jacke und Regenschirm sympathisch in den Satz ein. Gibt es einen 'sturm_hinweis', erwähne ihn beiläufig. Fehlen Wetterdaten, erwähne das kurz nebensächlich.\n" +
    "3. Termine & Erinnerungen: Flechte anstehende Termine und Erinnerungen naturgemäß in den Redefluss ein (Tag und Uhrzeit exakt nennen, aber in fließender Sprache, z. B. 'Was Ihren Kalender betrifft...'). Ist der Kalender frei, sag ihm das auf eine entspannte, nette Art.\n" +
    "4. Wünsche & Gegenstände: Wenn wichtige Gegenstände (Schlüssel, Portemonnaie etc.) oder Wünsche in den Daten stehen, erinnere ihn daran so, wie es ein aufmerksamer Assistent beim Verlassen des Hauses tun würde. Formuliere vollständige, harmonische Sätze mit passenden Präpositionen (z. B. 'Bevor Sie gehen: Ihr Schlüssel liegt wie gewohnt in der Schublade').\n" +
    "5. Parkplatz: Wenn ein Parkplatz angegeben ist, erwähne beiläufig, wo der Wagen steht. Wenn nicht ('parkplatz' ist null), verliere KEIN EINZIGES WORT darüber.\n\n" +
    "Sprach-Regeln:\n" +
    "- Uhrzeiten immer exakt in 24-Stunden-Zählung nennen (z. B. '16 Uhr 17'), niemals runden, aber natürlich einbetten.\n" +
    "- Vermeide hölzerne Aufzählungen oder stakkatoartige Abfolgen. Verbinde die Informationen mit natürlichen Übergängen ('Übrigens', 'Werfen wir einen Blick auf Ihren Tag', 'Was Ihre Termine angeht').\n" +
    "- Sprich ihn gerne gelegentlich persönlich an.\n\n" +
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
        let text = (parsed.briefing || '').trim();
        if (!data.parkplatz) text = stripUnwantedParkingRemark(text);
        return text.length > 0 ? text : null;
    } catch (e) {
        console.error("Briefing-Formulierung fehlgeschlagen", e);
        return null;
    } finally {
        clearTimeout(timeout);
    }
}

function stripUnwantedParkingRemark(text) {
    return text
        .replace(/[^.!?]*\b(auto|wagen|fahrzeug)\b[^.!?]*\b(geparkt|parkplatz)\b[^.!?]*[.!?]\s*/gi, '')
        .replace(/[^.!?]*\bparkplatz\b[^.!?]*\b(keine|nicht bekannt|unbekannt)\b[^.!?]*[.!?]\s*/gi, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
}

function buildFallbackBriefing(data) {
    let text = `${data.begruessung}, ${data.name}. Es ist ${data.uhrzeit_gesprochen}. `;

    if (data.wetter) {
        const w = data.wetter;
        text += `Draußen erwarten Sie aktuell ${w.temperatur_grad} Grad, gefühlt liegt die Temperatur bei etwa ${w.gefuehlt_grad} Grad. `;
        if (w.sturm_hinweis) text += `${w.sturm_hinweis}. `;
        text += `${w.regenschirm_empfehlung}. ${w.jacken_empfehlung}. `;
    } else {
        text += "Wetterdaten liegen zurzeit leider nicht vor. ";
    }

    if (data.naechste_termine.length > 0) {
        text += "Werfen wir einen Blick auf Ihre nächsten Termine: " + data.naechste_termine.map(t => `${t.tag} ${t.uhrzeit === 'ganztägig' ? 'ganztägig' : 'um ' + t.uhrzeit} ${t.text}`).join(', ') + ". ";
    } else {
        text += "Ihr Kalender ist für heute vollkommen frei. ";
    }

    if (data.erinnerungen_naechste_tage.length > 0) {
        text += "Hier noch Ihre Erinnerungen: " + data.erinnerungen_naechste_tage.map(r => `${r.text} ${r.tag}${r.uhrzeit === 'ganztägig' ? '' : ' um ' + r.uhrzeit}`).join(' sowie ') + ". ";
    }

    if ((data.zusaetzliche_wuensche || []).length > 0) {
        text += data.zusaetzliche_wuensche.map(w => { const t = w.trim(); return /[.!?]$/.test(t) ? t : t + '.'; }).join(' ') + ' ';
    }

    if (data.wichtige_gegenstaende.length > 0) {
        text += "Noch ein kurzer Hinweis zum Schluss: " + data.wichtige_gegenstaende.map(itemSentence).join('. ') + ". ";
    }

    if (data.parkplatz && data.parkplatz.adresse) {
        text += `Ihr Auto steht übrigens in ${data.parkplatz.adresse}. `;
    }

    return text;
}

async function learnFromConversations() {
    if (!chatHistory || chatHistory.length < 4) return;
    try {
        const verlauf = chatHistory.slice(-40).map(m => {
            const c = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
            return `${m.role === 'user' ? 'User' : 'Jarvis'}: ${c}`;
        }).join('\n');

        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: "openai/gpt-oss-120b",
                response_format: { type: "json_object" },
                messages: [
                    { role: "system", content:
                        "Du liest einen Gesprächsverlauf zwischen einem User und seinem persönlichen Assistenten J.A.R.V.I.S. Suche darin nach NEUEN, dauerhaft " +
                        "merkenswerten Fakten über den User: Vorlieben, Gewohnheiten, wiederkehrende Aktivitäten, persönliche Details, die er von sich aus erwähnt hat. " +
                        "Ignoriere einmalige Aufträge (einzelne Einkaufslisten-Einträge, einzelne Termine, Small Talk, Testfragen). " +
                        "Bereits im Gedächtnis gespeichert ist: " + JSON.stringify(memoryItems || {}) + ". Nenne NUR wirklich neue Fakten, keine Wiederholungen von bereits Bekanntem. " +
                        "Erfinde nichts, übernimm nur, was der User tatsächlich gesagt hat. " +
                        "Antworte NUR mit JSON in dieser Form: {\"fakten\": [{\"schluessel\": \"kurzer Begriff in Grundform, z.B. 'lieblingsfilm'\", \"wert\": \"was gemerkt werden soll\"}]}. Ist nichts Neues dabei, gib eine leere Liste zurück." },
                    { role: "user", content: "Gesprächsverlauf:\n" + verlauf }
                ]
            })
        });
        if (!res.ok) return;
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        const fakten = Array.isArray(parsed.fakten) ? parsed.fakten : [];
        let changed = false;
        fakten.forEach(f => {
            const key = String(f && f.schluessel || '').trim().toLowerCase();
            const val = String(f && f.wert || '').trim();
            if (!key || !val) return;
            memoryItems[key] = val;
            changed = true;
        });
        if (changed) setPersistentData('helfer_memory', JSON.stringify(memoryItems));
    } catch (e) {
        console.error('Automatisches Lernen fehlgeschlagen', e);
    }
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
        learnFromConversations();
    } finally {
        stopThinkingSound();
        isProcessing = false;
    }
}
