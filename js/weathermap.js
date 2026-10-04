/* ============================================================
   WETTERKARTE zu jedem Ort: "Zeig mir das Wetter in Istanbul", "Wie ist das Wetter in Rom?", "Wetterkarte Hamburg",
   "Wie wird das Wetter morgen in Wien?", "Zeig mir die Wetterkarte" (ohne Ort = dein Standort).
   Jarvis sucht den Ort (Server: /api/geocode), holt aktuelle Werte und 7-Tage-Vorhersage (Open-Meteo), nennt kurz das Wichtigste und
   öffnet ein Fenster mit: aktuellem Wetter, 7 Tagen und einer Wetterkarte von Windy (umschaltbar: Temperatur, Regen, Wind, Wolken).
   Die Karte ist ein eingebettetes Fremd-Angebot (embed.windy.com) und braucht Internet.
   Fragen ohne Ort ("Wie wird das Wetter morgen?", "Wetter in der Nähe") bleiben bei der bisherigen Antwort für deinen Standort.
   Schließen: per Sprache ("Karte schließen", "Schließen", "Mach die Karte zu") oder mit dem Kreuz oben rechts.
   Braucht: voice.js (speak), briefing.js (weatherCodeText), apiFetch (Server-Zugriff). Wird von localcommands.js aufgerufen.
   ============================================================ */

const WX_ZOOM = 7;
const WX_LAYERS = [['temp', '🌡️ Temperatur'], ['rain', '🌧️ Regen'], ['wind', '💨 Wind'], ['clouds', '☁️ Wolken']];
let wxOverlayEl = null;
let wxLayerNow = 'temp';

function wxEmoji(code) {
    if (code === 0) return '☀️';
    if (code === 1) return '🌤️';
    if (code === 2) return '⛅';
    if (code === 3) return '☁️';
    if (code === 45 || code === 48) return '🌫️';
    if (code >= 51 && code <= 57) return '🌦️';
    if (code >= 61 && code <= 67) return '🌧️';
    if (code >= 71 && code <= 77) return '🌨️';
    if (code >= 80 && code <= 82) return '🌦️';
    if (code === 85 || code === 86) return '🌨️';
    if (code >= 95) return '⛈️';
    return '🌡️';
}

function windyEmbedUrl(lat, lon, layer) {
    const p = new URLSearchParams({
        lat: lat.toFixed(3), lon: lon.toFixed(3), detailLat: lat.toFixed(3), detailLon: lon.toFixed(3), width: '650', height: '450',
        zoom: String(WX_ZOOM), level: 'surface', overlay: layer, product: 'ecmwf', menu: '', message: 'true', marker: 'true', calendar: 'now',
        pressure: '', type: 'map', location: 'coordinates', detail: '', metricWind: 'km/h', metricTemp: '°C', radarRange: '-1'
    });
    return 'https://embed.windy.com/embed2.html?' + p.toString();
}

function windyOpenUrl(lat, lon, layer) {
    return `https://www.windy.com/${lat.toFixed(3)}/${lon.toFixed(3)}?${layer},${lat.toFixed(3)},${lon.toFixed(3)},${WX_ZOOM}`;
}

function wxTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms))]);
}

/* ---------- Satz verstehen ---------- */
const WX_NOT_A_PLACE = /^(?:der\s+nähe|meiner\s+nähe|nähe|hier|dieser\s+gegend|meinem\s+standort|meiner\s+umgebung|der\s+umgebung|umgebung|mir|uns|diesem\s+moment|diesem\s+jahr|den\s+nächsten\s+tagen|dieser\s+woche|der\s+woche|der\s+nacht|den\s+bergen|ordnung|ruhe|garten|haus|auto|büro|urlaub|freien|zimmer|keller|wald|schatten|sonne)$/;
const WX_TIME_WORD = /\b(minuten?|stunden?|tagen?|tage|wochen?|monat\w*|jahr\w*|nacht|abend|abends|früh|vormittag|nachmittag|mittag|morgens|heute|jetzt|später|bald)\b/;

function wxCleanPlace(raw) {
    let p = String(raw || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    p = p.replace(/^(?:der|die|das|den|dem|des)\s+/, '');
    for (let i = 0; i < 4; i++) p = p.replace(/\s+(?:heute|morgen|übermorgen|jetzt|gerade|bitte|mal|eigentlich|denn|nochmal|noch einmal|an|aus|auch)$/, '').trim();
    if (!p || p.length > 40 || p.split(' ').length > 4) return '';
    if (WX_NOT_A_PLACE.test(p) || /\d/.test(p)) return '';
    // "Wetter in zwei Stunden", "Wetter in der Nacht" ... sind Zeitangaben, kein Ort
    if (WX_TIME_WORD.test(p) && !/\b(?:tage|tagen)\b.*(?:stadt|dorf)/.test(p)) return '';
    return p.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

/* { place, dayOffset } oder null. place '' = dein Standort ("Zeig mir die Wetterkarte") */
function parseWeatherMapRequest(text) {
    const t = String(text || '').toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
    if (!t || t.length > 100) return null;
    // Achtung: \b erkennt Wörter mit ü am Anfang nicht, darum hier eigene Wortgrenzen
    const dayOffset = /(?<![\wäöüß])übermorgen(?![\wäöüß])/.test(t) ? 2 : (/(?<![\wäöüß])morgen(?![\wäöüß])/.test(t) && !/\bguten morgen\b/.test(t)) ? 1 : 0;

    // ohne Ort: "Zeig mir die Wetterkarte" / "Wetterkarte"
    if (/^(?:(?:zeig\w*|öffne\w*|mach\w*)\s+(?:mir\s+)?(?:bitte\s+)?(?:mal\s+)?(?:die\s+|eine\s+)?)?wetterkarte(?:\s+bitte)?$/.test(t)) return { place: '', dayOffset };

    // mit Ort: alles nach "Wetter..." und "in/für/von/auf/bei/im"
    const m = t.match(/\b(?:wetterkarte|wettervorhersage|wetterlage|wetter)\b.*?(?<![\wäöüß])(?:in|für|von|auf|bei|im|über)\s+(.+)$/)
        || t.match(/\bwetterkarte\s+([a-zäöüß][a-zäöüß .'-]*)$/);   // "Wetterkarte Istanbul" ohne "in"
    if (!m) return null;
    const place = wxCleanPlace(m[1]);
    return place ? { place, dayOffset } : null;
}

/* "Karte schließen", "Schließen", "Mach die Karte zu", "Wetterkarte weg" - nur wenn die Wetterkarte offen ist */
function wxIsCloseRequest(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 40) return false;
    if (/(?<![\wäöüß])(?:termin\w*|erinnerung\w*|liste\w*|einkauf\w*|aufgabe\w*|protokoll\w*|gedächtnis|notiz\w*)(?![\wäöüß])/.test(t)) return false;   // das meint etwas anderes
    if (/(?<![\wäöüß])(?:schlie(?:ß|ss)\w*|zumachen|ausblenden|wegmachen|beend\w*)(?![\wäöüß])/.test(t)) return true;
    if (/^(?:bitte\s+)?(?:mach\w*\s+)?(?:(?:die|das|den)\s+)?(?:wetter\s*)?(?:karte|wetterkarte|fenster|ansicht)\s+(?:zu|weg|aus)(?:\s+bitte)?$/.test(t)) return true;
    return false;
}

/* ---------- Daten holen ---------- */
async function wxGeocode(name) {
    try {
        const r = await wxTimeout(apiFetch('/api/geocode?q=' + encodeURIComponent(name)), 10000);
        if (!r.ok) return null;
        const d = await r.json();
        const hit = Array.isArray(d) ? d[0] : null;
        if (!hit) return null;
        const lat = Number(hit.lat), lon = Number(hit.lon);
        if (isNaN(lat) || isNaN(lon)) return null;
        const full = String(hit.display_name || name);
        return { lat, lon, short: (full.split(',')[0] || name).trim(), full };
    } catch (e) { return null; }
}

function wxCurrentPosition() {
    return new Promise((ok, err) => {
        if (!navigator.geolocation) return err(new Error('keine Ortung'));
        navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), err, { timeout: 8000, maximumAge: 300000 });
    });
}

async function wxFetchWeather(lat, lon) {
    try {
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
            `&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m` +
            `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum&timezone=auto&forecast_days=7`;
        const res = await wxTimeout(fetch(url), 10000);
        const d = await res.json();
        if (!d || !d.current || !d.daily || !d.daily.time) return null;
        const days = d.daily.time.map((iso, i) => ({
            iso, code: d.daily.weather_code[i],
            max: Math.round(d.daily.temperature_2m_max[i]), min: Math.round(d.daily.temperature_2m_min[i]),
            rain: d.daily.precipitation_probability_max ? (d.daily.precipitation_probability_max[i] || 0) : 0,
            mm: Math.round((d.daily.precipitation_sum[i] || 0) * 10) / 10
        }));
        return {
            now: { temp: Math.round(d.current.temperature_2m), feels: Math.round(d.current.apparent_temperature), code: d.current.weather_code,
                   humidity: d.current.relative_humidity_2m, wind: Math.round(d.current.wind_speed_10m), mm: d.current.precipitation },
            days, localTime: String(d.current.time || '').slice(11, 16)
        };
    } catch (e) { return null; }
}

/* ---------- Gesprochene Zusammenfassung ---------- */
function wxSummary(label, data, dayOffset, isLocal) {
    const where = isLocal ? 'bei Ihnen' : `in ${label}`;
    if (dayOffset > 0 && data.days[dayOffset]) {
        const d = data.days[dayOffset];
        const day = dayOffset === 1 ? 'Morgen' : 'Übermorgen';
        return `${day} ${where}: ${weatherCodeText(d.code)}, ${d.min} bis ${d.max} Grad, Regenwahrscheinlichkeit ${d.rain} Prozent.`;
    }
    const n = data.now, today = data.days[0];
    return `Aktuell ${where}: ${n.temp} Grad, ${weatherCodeText(n.code)}, gefühlt ${n.feels}. ` +
        (today ? `Heute bis zu ${today.max} Grad, Regenwahrscheinlichkeit ${today.rain} Prozent.` : '');
}

/* ---------- Fenster ---------- */
function wxEnsureStyle() {
    if (document.getElementById('wxMapStyle')) return;
    const st = document.createElement('style');
    st.id = 'wxMapStyle';
    st.textContent =
        '#wxMap{position:fixed;inset:0;z-index:90;background:#050a10;color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
        '#wxMap .wx-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border-bottom:1px solid rgba(93,209,255,.18)}' +
        '#wxMap .wx-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.06em;color:#49d7ff;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '#wxMap .wx-close{flex:none;width:42px;height:42px;border:1px solid rgba(93,209,255,.3);border-radius:10px;background:rgba(0,0,0,.4);color:#49d7ff;font-size:18px}' +
        '#wxMap .wx-now{display:flex;align-items:center;gap:14px;padding:10px 14px}' +
        '#wxMap .wx-big{font-size:44px;line-height:1}#wxMap .wx-temp{font:700 32px "Orbitron",sans-serif;color:#fff}' +
        '#wxMap .wx-info{font-size:15px;color:#9fd8ee;line-height:1.25}' +
        '#wxMap .wx-frame{flex:1 1 auto;min-height:200px;position:relative;margin:0 10px;border:1px solid rgba(93,209,255,.25);border-radius:12px;overflow:hidden;background:#0a1621}' +
        '#wxMap iframe{position:absolute;inset:0;width:100%;height:100%;border:0}' +
        '#wxMap .wx-layers{display:flex;gap:8px;padding:8px 10px;overflow-x:auto}' +
        '#wxMap .wx-layer{flex:none;padding:6px 12px;border-radius:999px;border:1px solid rgba(93,209,255,.3);background:rgba(10,22,33,.9);color:#9fd8ee;font-size:14px}' +
        '#wxMap .wx-layer.on{background:rgba(73,215,255,.2);border-color:#49d7ff;color:#fff}' +
        '#wxMap .wx-days{display:flex;gap:8px;padding:2px 10px 8px;overflow-x:auto}' +
        '#wxMap .wx-day{flex:none;min-width:68px;text-align:center;padding:8px 6px;border:1px solid rgba(93,209,255,.2);border-radius:10px;background:rgba(10,22,33,.85);font-size:13px}' +
        '#wxMap .wx-day b{display:block;color:#49d7ff;font-size:13px}#wxMap .wx-day i{display:block;font-style:normal;font-size:22px;margin:2px 0}' +
        '#wxMap .wx-link{display:block;text-align:center;padding:2px 0 8px;font-size:13px;color:#5d7e91}#wxMap .wx-link a{color:#49d7ff}';
    document.head.appendChild(st);
}

function wxDayLabel(iso, i) {
    if (i === 0) return 'Heute';
    if (i === 1) return 'Morgen';
    try { return new Date(`${iso}T12:00:00`).toLocaleDateString('de-DE', { weekday: 'short' }); } catch (e) { return iso; }
}

function closeWeatherMap() {
    if (!wxOverlayEl) return false;
    try { wxOverlayEl.remove(); } catch (e) {}
    wxOverlayEl = null;
    try { document.body.classList.remove('panel-open'); } catch (e) {}
    try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) {}
    return true;
}

function showWeatherMap(label, lat, lon, data) {
    wxEnsureStyle();
    closeWeatherMap();
    wxLayerNow = 'temp';
    const el = document.createElement('div');
    el.id = 'wxMap';
    const add = (parent, tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; parent.appendChild(x); return x; };

    const head = add(el, 'div', 'wx-head');
    add(head, 'div', 'wx-title', `🌦️ ${label}`);
    const close = add(head, 'button', 'wx-close', '✕');
    close.setAttribute('aria-label', 'Schließen');
    close.addEventListener('click', () => closeWeatherMap());

    const now = add(el, 'div', 'wx-now');
    add(now, 'div', 'wx-big', wxEmoji(data.now.code));
    add(now, 'div', 'wx-temp', `${data.now.temp}°`);
    const info = add(now, 'div', 'wx-info');
    add(info, 'div', '', `${weatherCodeText(data.now.code)}, gefühlt ${data.now.feels}°`);
    add(info, 'div', '', `Wind ${data.now.wind} km/h · Luftfeuchte ${data.now.humidity} %${data.localTime ? ' · Ortszeit ' + data.localTime : ''}`);

    const frameBox = add(el, 'div', 'wx-frame');
    const frame = document.createElement('iframe');
    frame.setAttribute('title', 'Wetterkarte');
    frame.setAttribute('loading', 'lazy');
    frame.src = windyEmbedUrl(lat, lon, 'temp');
    frameBox.appendChild(frame);

    const layers = add(el, 'div', 'wx-layers');
    const link = document.createElement('a');
    WX_LAYERS.forEach(([key, name]) => {
        const b = add(layers, 'button', 'wx-layer' + (key === 'temp' ? ' on' : ''), name);
        b.addEventListener('click', () => {
            wxLayerNow = key;
            frame.src = windyEmbedUrl(lat, lon, key);
            link.href = windyOpenUrl(lat, lon, key);
            Array.from(layers.children).forEach(c => { if (c.classList) { if (c === b) c.classList.add('on'); else c.classList.remove('on'); } });
        });
    });

    const days = add(el, 'div', 'wx-days');
    data.days.forEach((d, i) => {
        const card = add(days, 'div', 'wx-day');
        add(card, 'b', '', wxDayLabel(d.iso, i));
        add(card, 'i', '', wxEmoji(d.code));
        add(card, 'span', '', `${d.max}° / ${d.min}°`);
        add(card, 'div', '', `💧 ${d.rain} %`);
    });

    const linkBox = add(el, 'div', 'wx-link');
    link.href = windyOpenUrl(lat, lon, 'temp');
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Karte in Windy öffnen';
    linkBox.appendChild(link);

    document.body.appendChild(el);
    wxOverlayEl = el;
    try { document.body.classList.add('panel-open'); } catch (e) {}
    try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) {}
}

/* ---------- Ablauf ---------- */
async function runWeatherMap(req) {
    const say = (msg) => speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Hole Wetterdaten...'); } catch (e) {}
    let label, lat, lon;
    const isLocal = !req.place;
    if (isLocal) {
        try { const p = await wxCurrentPosition(); lat = p.lat; lon = p.lon; label = 'Hier'; }
        catch (e) { say('Ihren Standort kann ich gerade nicht ermitteln.'); return; }
    } else {
        const geo = await wxGeocode(req.place);
        if (!geo) { say(`Den Ort ${req.place} habe ich nicht gefunden.`); return; }
        lat = geo.lat; lon = geo.lon; label = geo.short;
    }
    const data = await wxFetchWeather(lat, lon);
    if (!data) { say(`Die Wetterdaten für ${isLocal ? 'Ihren Standort' : label} konnte ich gerade nicht laden.`); return; }
    try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) {}
    showWeatherMap(label, lat, lon, data);
    say(wxSummary(label, data, req.dayOffset, isLocal) + ' Die Karte ist offen.');
}

function handleWeatherMapCommand(text) {
    // Ist die Wetterkarte offen, wird "Karte schließen" hier erledigt (und nicht an die KI weitergereicht)
    if (wxOverlayEl && wxIsCloseRequest(text)) {
        closeWeatherMap();
        try { speak('Die Karte ist geschlossen.', typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {}
        return true;
    }
    const req = parseWeatherMapRequest(text);
    if (!req) return false;
    runWeatherMap(req).catch(() => { try { speak('Die Wetterkarte hat gerade nicht geklappt.'); } catch (e) {} });
    return true;
}

/* ---------- Einklinken: andere Fenster arbeiten mit der Wetterkarte zusammen ---------- */
/* WICHTIG: isPanelOpen() wird NICHT verändert. Die Wetterkarte ist kein "Panel" aus panels.js; würde isPanelOpen() bei offener Karte "ja" melden, liest
   refreshOpenPanel() (panels.js) den Namen eines nicht vorhandenen Panels und bricht mit "Cannot read properties of null (reading 'name')" ab,
   sobald irgendein Befehl renderAllLists() auslöst. */
(function hookPanels() {
    try {
        if (typeof closePanel === 'function') {
            const origClose = closePanel;
            closePanel = function () { closeWeatherMap(); return origClose.apply(this, arguments); };   // Karten (Anruf, Route ...) sollen nicht hinter der Wetterkarte stecken
        }
        if (typeof openPanel === 'function') {
            const origOpen = openPanel;
            openPanel = function () { closeWeatherMap(); return origOpen.apply(this, arguments); };   // ein anderes Fenster ersetzt die Wetterkarte
        }
        if (typeof refreshOpenPanel === 'function') {
            const origRefresh = refreshOpenPanel;
            refreshOpenPanel = function () { if (wxOverlayEl) return; return origRefresh.apply(this, arguments); };   // bei offener Wetterkarte gibt es kein anderes Fenster zu aktualisieren
        }
    } catch (e) { /* ohne diese Anbindung funktioniert die Wetterkarte trotzdem */ }
})();

/* Zusätzliche Absicherung: Kommt ein "Karte schließen" doch bis zur KI durch (weil eine andere Stelle es vorher nicht abfängt), wird es hier erledigt, ohne die KI zu fragen. */
window.addEventListener('load', function () {
    try {
        if (typeof sendToGroqSmart === 'function' && !sendToGroqSmart._wx) {
            const originalSend = sendToGroqSmart;
            sendToGroqSmart = function (text) {
                try {
                    if (wxOverlayEl && wxIsCloseRequest(text)) {
                        closeWeatherMap();
                        speak('Die Karte ist geschlossen.', typeof continueConversation === 'function' ? continueConversation : undefined);
                        return Promise.resolve();
                    }
                } catch (e) { /* dann ganz normal weiter */ }
                return originalSend.apply(this, arguments);
            };
            sendToGroqSmart._wx = true;
        }
    } catch (e) { /* ohne diese Absicherung bleibt alles wie vorher */ }
});
