// js/briefing.js
/* ============================================================
   BRIEFING: Standort, Wetter, Tages-Briefing
   Braucht: storage.js, lists.js (parseMemoryValue), voice.js
   ============================================================ */

/* --- Standortermittlung mit Geocoding (inkl. Straße & Hausnummer) --- */
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
        const res = await fetch(`https://openstreetmap.org{lat}&lon=${lon}&zoom=18&addressdetails=1`);
        const data = await res.json();
        const addr = data.address || {};

        const ort = addr.city || addr.town || addr.village || addr.municipality || addr.county || "Unbekannter Ort";
        const land = addr.country || "Unbekanntes Land";

        const strasse = addr.road || addr.pedestrian || addr.footway || addr.path || "";
        const hausnummer = addr.house_number || "";

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
                const res = await fetch(`https://open-meteo.com{lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,precipitation,weather_code,wind_speed_10m,windgusts_10m,apparent_temperature&hourly=precipitation,weather_code`);
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
        const res = await fetch(`https://open-meteo.com{pos.coords.latitude}&longitude=${pos.coords.longitude}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max&timezone=Europe%2FBerlin&forecast_days=7`);
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

function normalizeKey(s) {
    return String(s).toLowerCase()
        .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
        .replace(/[^a-z0-9]/g, '');
}

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
