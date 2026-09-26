/* ============================================================
   TRAVEL: "Wann muss ich losfahren?" - Route und Abfahrtszeit
   Nutzt kostenlose, schlüssellose Dienste: Nominatim (Adress-Suche) und OSRM (Routenzeit).
   Braucht: calendar.js (accessToken, isGoogleAuthorized, ensureGoogleAuth, markGoogleExpired),
            briefing.js (formatSpokenTime, fetchUserLocationData), places.js (buildMapsLink), lists.js (userError)
   ============================================================ */

const TRAVEL_BUFFER_MINUTES = 10;   // Puffer, damit man nicht auf die Minute genau losfahren muss

// Daten der zuletzt berechneten Route, damit die HUD-Karte sie ohne zweite Abfrage zeichnen kann
let lastStauWarnings = [];
let lastRouteMapData = null;
let lastWebcamCards = [];   // Webcam-Bildkarten der zuletzt berechneten Route (siehe describeAutobahnStau)

const geocodeCache = {};   // nur im Speicher: Adresse -> { lat, lon }

async function geocodeAddress(address) {
    const cacheKey = String(address || '').trim().toLowerCase();
    if (geocodeCache[cacheKey]) return geocodeCache[cacheKey];
    try {
        const res = await apiFetch('/api/geocode?q=' + encodeURIComponent(address));
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || !data[0]) return null;
        const found = { lat: Number(data[0].lat), lon: Number(data[0].lon) };
        if (cacheKey && isFinite(found.lat) && isFinite(found.lon)) geocodeCache[cacheKey] = found;
        return found;
    } catch (e) {
        if (e && e.auth) throw e;
        return null;
    }
}

/* Findet ein Ziel, das nicht unbedingt eine Straßenadresse ist (z.B. "Penny in Schwarzenbek", "Aldi Hamburg"):
   1) erst wörtlich versuchen, 2) "X in Y" -> "X, Y" (Komma statt "in" hilft Nominatim, Geschäft + Ort statt
   eine einzelne Adresse zu erkennen), 3) mit dem aktuellen Ort des Users ergänzen. Gibt null zurück, wenn
   wirklich nichts gefunden wurde. */
async function geocodeDestination(text, userPlace) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    let found = await geocodeAddress(raw);
    if (found) return found;

    const m = raw.match(/^(.+?)\s+(?:in|bei|im|am|an der|auf der)\s+(.+)$/i);
    if (m) {
        found = await geocodeAddress(`${m[1].trim()}, ${m[2].trim()}`);
        if (found) return found;
    }

    if (userPlace) {
        found = await geocodeAddress(`${raw}, ${userPlace}`);
        if (found) return found;
    }
    return null;
}

async function routeDurationSeconds(fromLat, fromLon, toLat, toLon) {
    try {
        const res = await apiFetch(`/api/route?fromLat=${fromLat}&fromLon=${fromLon}&toLat=${toLat}&toLon=${toLon}&geometry=1`);
        if (!res.ok) return null;
        const data = await res.json();
        const r = data && data.routes && data.routes[0];
        if (!r) return null;
        // Linienverlauf für die HUD-Karte: OSRM liefert [Länge, Breite], die Karte braucht [Breite, Länge]
        const coords = (r.geometry && Array.isArray(r.geometry.coordinates))
            ? r.geometry.coordinates.map(c => [c[1], c[0]])
            : null;
        return { seconds: r.duration, meters: r.distance, autobahnen: extractAutobahnRefs(r), coords };
    } catch (e) {
        if (e && e.auth) throw e;
        return null;
    }
}

/* Aus den Fahrspuren-Namen der Route ("A7", "BAB 1" usw.) die benutzten Autobahn-Nummern herausziehen */
function extractAutobahnRefs(route) {
    const refs = new Set();
    const addFrom = (text) => {
        String(text || '').split(/[;,\/]/).forEach(part => {
            const m = part.trim().match(/^(?:A|BAB)\s?(\d+)$/i);
            if (m) refs.add('A' + m[1]);
        });
    };
    (route.legs || []).forEach(leg => (leg.steps || []).forEach(step => {
        addFrom(step.ref);
        addFrom(step.name);
    }));
    return Array.from(refs);
}

/* Ohne Angabe eines Termins: der nächste anstehende Termin mit einem hinterlegten Ort (Hauptkalender, nächste 36 Std.) */
async function fetchNextAppointmentWithLocation(withinHours = 36) {
    let authorized = isGoogleAuthorized();
    if (!authorized && accessToken) authorized = await ensureGoogleAuth(4000);
    if (!authorized) {
        const e = userError((accessToken ? 'Der Google-Zugang ist abgelaufen. ' : 'Google ist nicht verbunden. ') + 'Bitte auf die Karte unten tippen, um neu zu verbinden.');
        e.verbindung = 'getrennt';
        throw e;
    }
    const now = new Date();
    const max = new Date(now.getTime() + withinHours * 3600000);
    const headers = { 'Authorization': `Bearer ${accessToken}` };
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${max.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=15`;
    const res = await fetch(url, { headers });
    if (res.status === 401) {
        markGoogleExpired();
        const e = userError('Die Google-Anmeldung ist abgelaufen. Bitte auf die Karte unten tippen, um neu zu verbinden.');
        e.verbindung = 'getrennt';
        throw e;
    }
    if (!res.ok) throw userError('Der Kalender konnte gerade nicht abgefragt werden.');
    const data = await res.json();
    const item = (data.items || []).find(i => i.status !== 'cancelled' && i.location && i.location.trim() && i.start && i.start.dateTime);
    if (!item) throw userError('Für die nächsten anstehenden Termine ist kein Ort hinterlegt. Nenne mir den Termin, wenn er einen Ort hat, oder trag den Ort im Kalender ein.');
    return { titel: item.summary || 'Termin', ort: item.location.trim(), start: new Date(item.start.dateTime) };
}

/* Mit Stichwort: der nächste dazu passende Termin (mit Ort und Uhrzeit) im Hauptkalender, nächste 30 Tage */
async function findAppointmentByQuery(query) {
    let authorized = isGoogleAuthorized();
    if (!authorized && accessToken) authorized = await ensureGoogleAuth(4000);
    if (!authorized) {
        const e = userError((accessToken ? 'Der Google-Zugang ist abgelaufen. ' : 'Google ist nicht verbunden. ') + 'Bitte auf die Karte unten tippen, um neu zu verbinden.');
        e.verbindung = 'getrennt';
        throw e;
    }
    const now = new Date();
    const max = new Date(now.getTime() + 30 * 24 * 3600000);
    const headers = { 'Authorization': `Bearer ${accessToken}` };
    const url = `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now.toISOString()}&timeMax=${max.toISOString()}&singleEvents=true&orderBy=startTime&maxResults=10&q=${encodeURIComponent(query)}`;
    const res = await fetch(url, { headers });
    if (res.status === 401) {
        markGoogleExpired();
        const e = userError('Die Google-Anmeldung ist abgelaufen. Bitte auf die Karte unten tippen, um neu zu verbinden.');
        e.verbindung = 'getrennt';
        throw e;
    }
    if (!res.ok) throw userError('Der Kalender konnte gerade nicht abgefragt werden.');
    const data = await res.json();
    const items = (data.items || []).filter(i => i.status !== 'cancelled' && i.start && i.start.dateTime);
    if (items.length === 0) throw userError('Dazu habe ich keinen bevorstehenden Termin mit Uhrzeit gefunden.');
    const withLoc = items.find(i => i.location && i.location.trim());
    if (!withLoc) throw userError(`Für "${items[0].summary || query}" ist kein Ort hinterlegt, dafür kann ich die Fahrzeit nicht berechnen.`);
    return { titel: withLoc.summary || query, ort: withLoc.location.trim(), start: new Date(withLoc.start.dateTime) };
}

/* Erwartet "HH:MM" oder einen ISO-Zeitstempel. Liegt die Uhrzeit schon in der Vergangenheit, gilt sie für morgen. */
function parseArrivalTime(raw, now) {
    const r = String(raw || '').trim();
    if (!r) return null;
    const m = r.match(/^(\d{1,2}):(\d{2})$/);
    let d;
    if (m) {
        d = new Date(now);
        d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    } else {
        d = new Date(r);
        if (isNaN(d.getTime())) return undefined;   // erkennbar ungültig (nicht "nicht angegeben")
    }
    if (d.getTime() < now.getTime()) d.setDate(d.getDate() + 1);
    return d;
}

/* Ziel + Zeit ermitteln: entweder ein Kalendertermin (per Stichwort oder automatisch der nächste), oder ein frei genanntes Ziel */
async function resolveTravelTarget(opts) {
    if (opts.destination) {
        const now = new Date();
        const arrival = parseArrivalTime(opts.arrivalTime, now);
        if (arrival === undefined) throw userError('Die genannte Ankunftszeit konnte ich nicht verstehen.');
        return { titel: opts.destination, ort: opts.destination, start: arrival, keinFesterTermin: !arrival };
    }
    const appt = opts.query ? await findAppointmentByQuery(opts.query) : await fetchNextAppointmentWithLocation();
    return { ...appt, keinFesterTermin: false };
}

async function computeDepartureAdvice(opts) {
    if (typeof opts === 'string') opts = { query: opts };   // Rückwärtskompatibel
    const target = await resolveTravelTarget(opts);

    const loc = opts.loc || await fetchUserLocationData();
    if (!loc || loc.fehler || loc.latitude === undefined) throw userError('Ihren Standort konnte ich gerade nicht ermitteln. Ist der Standortzugriff erlaubt?');

    // Ziel kann eine Straßenadresse, aber auch ein Geschäft/eine Sehenswürdigkeit ohne Adresse sein
    // (z.B. "Penny in Schwarzenbek") - geocodeDestination probiert dafür mehrere Schreibweisen.
    const dest = await geocodeDestination(target.ort, loc.ort);
    if (!dest) throw userError(`Die Adresse "${target.ort}" konnte ich nicht finden.`);

    const route = await routeDurationSeconds(loc.latitude, loc.longitude, dest.lat, dest.lon);
    if (!route) throw userError('Die Fahrzeit konnte gerade nicht berechnet werden. Bitte versuchen Sie es gleich noch einmal.');

    const fahrtMin = Math.round(route.seconds / 60);
    const km = route.meters / 1000;
    const kmText = km >= 10 ? Math.round(km) + ' Kilometer' : km.toFixed(1).replace('.', ',') + ' Kilometer';
    const staumeldung = await describeAutobahnStau(route.autobahnen, loc.latitude, loc.longitude, dest.lat, dest.lon);

    let reply, subtitle;
    if (target.keinFesterTermin) {
        reply = `Bis ${target.ort} sind es etwa ${fahrtMin} Minuten, das sind ${kmText}.`;
        subtitle = `${fahrtMin} Min. Fahrt · ${kmText}`;
    } else {
        const losfahren = new Date(target.start.getTime() - (fahrtMin + TRAVEL_BUFFER_MINUTES) * 60000);
        const schonZuSpaet = losfahren.getTime() < Date.now();
        const zielSatz = target.titel === target.ort ? target.ort : `${target.titel} ist um ${formatSpokenTime(target.start)} in ${target.ort}`;
        reply = `${zielSatz}. Die Fahrt dauert etwa ${fahrtMin} Minuten, das sind ${kmText}. `;
        reply += schonZuSpaet
            ? 'Um pünktlich zu sein, hätten Sie eigentlich schon losfahren müssen.'
            : `Um pünktlich da zu sein, sollten Sie spätestens um ${formatSpokenTime(losfahren)} losfahren.`;
        subtitle = `${fahrtMin} Min. Fahrt · Abfahrt bis ${formatSpokenTime(losfahren)}`;
    }
    reply += staumeldung;

    const mapData = {
        from: { lat: loc.latitude, lon: loc.longitude },
        to: { lat: dest.lat, lon: dest.lon, label: target.titel },
        coords: route.coords,
        warnings: lastStauWarnings.slice(),
        autobahnen: route.autobahnen || [],
        fahrtMin, km
    };
    lastRouteMapData = mapData;

    return {
        reply,
        card: { icon: '🚗', title: 'Route zu ' + target.titel, subtitle, href: buildMapsLink(target.ort, '', 'driving') },
        map: mapData,
        webcamCards: lastWebcamCards.slice()
    };
}

/* Für die HUD-Karte: Route und Staumeldungen zu einem Ziel holen (null, wenn etwas nicht klappt) */
async function fetchRouteMapData(destText, loc) {
    lastRouteMapData = null;
    try { await computeDepartureAdvice({ destination: destText, loc: loc || null }); } catch (e) { return null; }
    return lastRouteMapData;
}

/* --- Live-Stau-/Baustellen-Meldungen der genutzten Autobahnen (offizielle, kostenlose Bund-API) --- */
/* --- Live-Stau-/Baustellen-Meldungen UND Webcams der genutzten Autobahnen (offizielle, kostenlose Bund-API) ---
   Alles kommt aus EINEM Aufruf an /api/stau (siehe api/stau.js) - spart eine eigene Datei/Funktion, die
   Vercel im kostenlosen Plan (max. 12 Serverless Functions) sonst nicht mehr zugelassen hätte. */
async function fetchAutobahnData(road) {
    try {
        const res = await apiFetch('/api/stau?road=' + encodeURIComponent(road));
        if (!res.ok) return null;
        const data = await res.json();
        return { warning: data.warning || [], webcam: data.webcam || [] };
    } catch (e) {
        return null;
    }
}

async function describeAutobahnStau(autobahnen, fromLat, fromLon, toLat, toLon) {
    lastStauWarnings = [];
    lastWebcamCards = [];
    if (!autobahnen || autobahnen.length === 0) return '';
    // Grober Fahrschlauch um Start und Ziel, mit etwas Puffer für Umwege - nur Meldungen darin sind wirklich relevant
    const padding = 0.35;   // ca. 30-35 km, verhindert genau den Fehler "A1 bei Köln" auf einer Fahrt in Schleswig-Holstein
    const minLat = Math.min(fromLat, toLat) - padding, maxLat = Math.max(fromLat, toLat) + padding;
    const minLon = Math.min(fromLon, toLon) - padding, maxLon = Math.max(fromLon, toLon) + padding;
    const relevanteMeldung = (w) => {
        const lat = w.coordinate && Number(w.coordinate.lat);
        const lon = w.coordinate && Number(w.coordinate.long);
        if (!isFinite(lat) || !isFinite(lon)) return false;
        return lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    };

    const relevant = autobahnen.slice(0, 2);   // nicht zu viele Abfragen bei langen Strecken mit vielen Autobahnen
    const meldungen = [];
    const geprueft = [];   // Autobahnen, deren Abfrage wirklich geklappt hat
    // Ein Aufruf pro Autobahn liefert Stau-/Baustellenmeldungen UND Webcams zusammen
    const alleDaten = await Promise.all(relevant.map(road => fetchAutobahnData(road)));
    for (let i = 0; i < relevant.length; i++) {
        const road = relevant[i];
        const data = alleDaten[i];
        if (!data) continue;   // Dienst gerade nicht erreichbar: nichts behaupten, kein Fehler-Lärm
        geprueft.push(road);
        const warnings = data.warning;
        const nahe = warnings.filter(relevanteMeldung);
        nahe.slice(0, 6).forEach(w => {
            const titel = (w.title || '').split('|').pop().trim() || 'Verkehrsmeldung';
            lastStauWarnings.push({
                lat: Number(w.coordinate.lat), lon: Number(w.coordinate.long), road, title: titel,
                text: (w.description || []).slice(0, 3).join(' · ')
            });
        });
        nahe.slice(0, 2).forEach(w => {
            const kurz = (w.title || '').split('|').pop().trim();
            const grund = (w.description || []).find(d => /stau|verengung|sperr|stockend|zähfließend/i.test(d));
            meldungen.push(`${road}${kurz ? ': ' + kurz : ''}${grund ? ' (' + grund + ')' : ''}`);
        });

        // Webcams auf derselben Autobahn, die im Fahrschlauch liegen - höchstens 2 pro Autobahn, damit es nicht zu viele werden
        (data.webcam || []).filter(relevanteMeldung).slice(0, 2).forEach(w => {
            if (!w.imageurl) return;   // ohne Bild-Link nichts anzubieten, das ins Leere führt
            lastWebcamCards.push({
                icon: '📷',
                title: `Webcam ${road}${w.subtitle ? ' · ' + w.subtitle : ''}`,
                subtitle: (w.title || '').replace(/^A\d+\s*\|\s*/, '') || 'Standbild antippen',
                href: w.imageurl
            });
        });
    }
    if (meldungen.length > 0) return ' Achtung, auf der Strecke aktuell gemeldet: ' + meldungen.join('; ') + '.';
    if (geprueft.length > 0) return ` Auf der ${geprueft.join(' und ')} sind aktuell keine Staumeldungen bekannt.`;
    return '';
}

/* ============================================================
   TANKSTELLEN ENTLANG DER STRECKE ("Wo tanke ich günstig auf meinem Weg zur Arbeit?")
   Tankerkönig kann nur im Kreis suchen, darum: EINE Anfrage im Kreis um die Streckenmitte (Tankerkönig erlaubt nur etwa eine Anfrage pro Minute),
   danach werden hier die Tankstellen behalten, die höchstens FUEL_ROUTE_MAX_OFF_KM von der Fahrstrecke entfernt liegen, und nach Preis sortiert.
   Braucht: api/tankroute.js, buildMapsLink (places.js)
   ============================================================ */
const FUEL_ROUTE_MAX_OFF_KM = 3;      // so weit darf eine Tankstelle von der Strecke entfernt sein
const FUEL_ROUTE_LABELS = { diesel: 'Diesel', e10: 'E10', e5: 'Super E5' };

function fuelKmBetween(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

/* Länge der Strecke bis zu jedem Punkt in km */
function fuelRouteCumKm(coords) {
    const cum = [0];
    for (let i = 1; i < coords.length; i++) cum.push(cum[i - 1] + fuelKmBetween(coords[i - 1][0], coords[i - 1][1], coords[i][0], coords[i][1]));
    return cum;
}

/* Punkt auf der Strecke nach "km" Kilometern */
function fuelPointAlongRoute(coords, cum, km) {
    if (km <= 0) return { lat: coords[0][0], lon: coords[0][1] };
    for (let i = 1; i < coords.length; i++) {
        if (cum[i] >= km) {
            const seg = cum[i] - cum[i - 1] || 1;
            const t = (km - cum[i - 1]) / seg;
            return { lat: coords[i - 1][0] + (coords[i][0] - coords[i - 1][0]) * t, lon: coords[i - 1][1] + (coords[i][1] - coords[i - 1][1]) * t };
        }
    }
    const last = coords[coords.length - 1];
    return { lat: last[0], lon: last[1] };
}

/* Wie weit ist ein Punkt von der Strecke entfernt (km), und bei welchem Streckenkilometer liegt die nächste Stelle? */
function fuelNearestOnRoute(coords, cum, lat, lon) {
    const kx = 111.32 * Math.cos(lat * Math.PI / 180), ky = 110.57;
    let best = { off: Infinity, along: 0 };
    for (let i = 1; i < coords.length; i++) {
        const ax = (coords[i - 1][1] - lon) * kx, ay = (coords[i - 1][0] - lat) * ky;
        const bx = (coords[i][1] - lon) * kx, by = (coords[i][0] - lat) * ky;
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        let t = len2 > 0 ? -(ax * dx + ay * dy) / len2 : 0;
        t = Math.max(0, Math.min(1, t));
        const off = Math.hypot(ax + dx * t, ay + dy * t);
        if (off < best.off) best = { off, along: cum[i - 1] + t * (cum[i] - cum[i - 1]) };
    }
    return best;
}

function fuelRoutePriceText(p) { return p.toFixed(3).replace('.', ',') + ' €'; }
function fuelRoutePriceSpoken(p) {
    let euro = Math.floor(p), cent = Math.round((p - euro) * 100);
    if (cent === 100) { euro += 1; cent = 0; }
    return cent === 0 ? `${euro} Euro` : `${euro} Euro ${cent}`;
}
function fuelRouteKmText(km) { return (km < 10 ? km.toFixed(1) : String(Math.round(km))).replace('.', ','); }

/* Ergebnis: { reply, cards, map, fuel, label }. Wirft userError mit verständlichem Text, wenn etwas nicht klappt. */
async function fuelAlongRouteAdvice(opts) {
    const fuelType = ['diesel', 'e10', 'e5'].includes(opts.fuelType) ? opts.fuelType : 'diesel';
    const label = FUEL_ROUTE_LABELS[fuelType];
    const destLabel = opts.destLabel || 'zum Ziel';
    if (!opts.destination) throw userError('Wohin fahren Sie? Nennen Sie mir das Ziel, zum Beispiel: Wo tanke ich günstig auf meinem Weg zur Arbeit?');

    const loc = await fetchUserLocationData();
    if (!loc || loc.fehler || loc.latitude === undefined) throw userError('Ihren Standort konnte ich gerade nicht ermitteln. Ist der Standortzugriff erlaubt?');
    const adv = await computeDepartureAdvice({ destination: opts.destination, loc });   // wirft verständliche Fehler (Adresse nicht gefunden usw.)
    const map = adv.map;
    if (!map || !map.coords || map.coords.length < 2) throw userError('Die Strecke konnte ich gerade nicht berechnen.');

    const coords = map.coords, cum = fuelRouteCumKm(coords), total = cum[cum.length - 1];
    // Ein Kreis (max. 25 km) um die Streckenmitte; bei langen Strecken um einen Punkt bei 22 km, dann deckt er den Anfang der Strecke ab
    const center = fuelPointAlongRoute(coords, cum, Math.min(total / 2, 22));
    let far = 0, coveredKm = total;
    for (let i = 0; i < coords.length; i++) {
        const d = fuelKmBetween(center.lat, center.lon, coords[i][0], coords[i][1]);
        if (d > 22 && coveredKm === total) coveredKm = cum[Math.max(0, i - 1)];   // ab hier reicht der Kreis nicht mehr
        far = Math.max(far, d);
    }
    const rad = Math.min(25, Math.max(6, Math.ceil(Math.min(far, 22) + 3)));

    let d;
    const r = await apiFetch(`/api/tankroute?lat=${center.lat.toFixed(5)}&lng=${center.lon.toFixed(5)}&rad=${rad}`);
    try { d = await r.json(); } catch (e) { d = {}; }
    if (!r.ok || d.error) throw userError('Die Spritpreise sind gerade nicht verfügbar: ' + (d.error || ('Status ' + r.status)));

    const found = [];
    for (const st of (d.stations || [])) {
        const price = st[fuelType];
        if (!(price > 0)) continue;
        const near = fuelNearestOnRoute(coords, cum, st.lat, st.lng);
        if (near.off > FUEL_ROUTE_MAX_OFF_KM) continue;
        found.push({ ...st, preis: price, off: near.off, along: near.along });
    }
    found.sort((a, b) => a.preis - b.preis || a.off - b.off);
    const top = found.slice(0, 3);
    const teil = coveredKm < total - 1 ? ` Hinweis: Ich konnte nur die ersten ${Math.round(coveredKm)} Kilometer der Strecke abdecken.` : '';

    if (top.length === 0) {
        return { reply: `Entlang der Strecke ${destLabel} habe ich keine geöffnete Tankstelle mit ${label}-Preis innerhalb von ${FUEL_ROUTE_MAX_OFF_KM} Kilometern gefunden.${teil}`, cards: [], map, fuel: [], label };
    }
    const offSpoken = (o) => o < 0.2 ? 'direkt an der Strecke' : `${fuelRouteKmText(o)} Kilometer abseits der Strecke`;
    const parts = top.map((st, i) => `${i === 0 ? `Auf dem Weg ${destLabel} ist ${label} am günstigsten bei` : (i === 1 ? 'Danach' : 'Und')} ${st.name}${st.strasse ? ', ' + st.strasse : ''}${st.ort ? ' in ' + st.ort : ''}, ${fuelRoutePriceSpoken(st.preis)}, ${offSpoken(st.off)}, nach etwa ${Math.round(st.along)} Kilometern.`);
    const cards = top.map(st => ({
        icon: '⛽',
        title: `${st.name} · ${fuelRoutePriceText(st.preis)}`,
        subtitle: `${st.strasse}${st.ort ? ', ' + st.ort : ''} · ${st.off < 0.2 ? 'direkt an der Strecke' : fuelRouteKmText(st.off) + ' km abseits'} · Streckenkm ${Math.round(st.along)}`,
        href: buildMapsLink(`${st.strasse}, ${st.ort}`.replace(/^, /, ''), '', 'driving')
    }));
    return { reply: parts.join(' ') + teil, cards, map, fuel: found.slice(0, 15), label };
}

/* ============================================================
   BAHN- UND BUS-AUSKUNFT: "Such mir die Bahnverbindung von A nach B raus" und
   "Meine Tochter soll um 16 Uhr hier sein - wann muss sie die Bahn nehmen?"
   Zeiten kommen über /api/bahn (freier Community-Dienst v6.db.transport.rest, nicht offiziell).
   Klappt die Abfrage nicht, bleibt ein Link zu Google Maps mit der Verbindung.
   ============================================================ */
function bahnHHMM(iso) {
    const d = new Date(iso);
    return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
}

/* Google-Maps-Link für Bus und Bahn MIT Uhrzeit ("Ankunft bis 16:00"). Die Zeit steckt im "data"-Teil des Links; das ist nicht offiziell
   dokumentiert, funktioniert aber in der Regel. Ohne Uhrzeit: der normale Link. */
function bahnMapsLink(to, from, when, isArrival) {
    if (!when || isNaN(when.getTime())) return buildMapsLink(to, from, 'transit');
    const enc = (t) => encodeURIComponent(String(t));
    return `https://www.google.com/maps/dir/${enc(from)}/${enc(to)}/data=!4m6!4m5!2m3!6e${isArrival ? 1 : 0}!7e2!8j${Math.floor(when.getTime() / 1000)}!3e3`;
}

function bahnUmstiegeText(n) { return n <= 0 ? 'ohne Umstieg' : (n === 1 ? 'mit einem Umstieg' : `mit ${n} Umstiegen`); }

function bahnIsHere(raw) {
    const t = String(raw || '').trim();
    return !t || /^(hier|hierher|meinstandort|standort|vonhier|beimir|beiuns|hierbeimir)$/.test(t.toLowerCase().replace(/[^a-zäöüß]/g, ''));
}

/* Ort für die Abfrage: "hier" = aktueller Standort (als Koordinaten), "Zuhause"/"Arbeit" = gespeicherte Adresse, sonst der Text */
async function bahnPlaceText(raw) {
    const t = String(raw || '').trim();
    const k = t.toLowerCase().replace(/[^a-zäöüß]/g, '');
    if (!t || /^(hier|hierher|meinstandort|standort|vonhier|beimir|beiuns|hierbeimir)$/.test(k)) {
        const loc = await fetchUserLocationData();
        if (!loc || loc.fehler || loc.latitude === undefined) throw userError('Ihren Standort konnte ich gerade nicht ermitteln. Ist der Standortzugriff erlaubt?');
        return `${loc.latitude.toFixed(5)},${loc.longitude.toFixed(5)}`;
    }
    if (typeof resolvePersonalPlace === 'function') return resolvePersonalPlace(t);   // "Arbeit"/"Zuhause" -> gespeicherte Adresse
    return t;
}

/* Ergebnis: { reply, cards }. opts: { from, to, time ("HH:MM" oder ISO), timeType ('ankunft' | 'abfahrt') } */
async function bahnAuskunft(opts) {
    if (!String(opts.to || '').trim()) throw userError('Wohin soll die Reise gehen?');
    if (bahnIsHere(opts.from) && bahnIsHere(opts.to)) throw userError('Von wo startet die Reise? Nennen Sie mir den Startort, zum Beispiel: von Hamburg Hauptbahnhof.');
    const fromText = await bahnPlaceText(opts.from);
    const toText = await bahnPlaceText(opts.to);
    const now = new Date();
    let when = null;
    if (opts.time) {
        when = parseArrivalTime(opts.time, now);
        if (when === undefined || when === null) throw userError('Die genannte Uhrzeit konnte ich nicht verstehen.');
    }
    const isArrival = when && String(opts.timeType || '').toLowerCase().startsWith('ank');
    const params = new URLSearchParams({ from: fromText, to: toText });
    if (when) params.set(isArrival ? 'arrival' : 'departure', when.toISOString());

    // Für erfolgreiche Verbindungen: ein normaler, offiziell unterstützter Maps-Link ohne Uhrzeit.
    // Der Zeit-Trick (data=...!8j...) ist von Google nicht dokumentiert und wird von manchen Maps-Versionen
    // ignoriert - Maps zeigt dann seine eigenen, aktuellen Verbindungen statt der hier gefundenen Zeit.
    // Das sorgt für Verwirrung ("Jarvis sagt andere Zeiten als Maps"), darum hier bewusst ohne Zeitangabe:
    // die Karte dient nur zum Ansehen der Route, die Zeit sagt allein Jarvis.
    const mapsLink = () => buildMapsLink(toText, fromText, 'transit');
    const timeNote = when ? (isArrival ? `Ankunft bis ${bahnHHMM(when.toISOString())}` : `Abfahrt ab ${bahnHHMM(when.toISOString())}`) : 'mit aktuellen Zeiten';
    const fallbackCard = { icon: '🚆', title: 'Verbindung in Google Maps öffnen', subtitle: `Bus und Bahn, ${timeNote}`, href: mapsLink() };
    let d;
    try {
        const r = await apiFetch('/api/bahn?' + params.toString());
        try { d = await r.json(); } catch (e) { d = {}; }
        if (!r.ok || d.error) throw new Error(d.error || ('Status ' + r.status));
    } catch (e) {
        if (e && e.auth) throw e;
        const err = userError(`Die Bahn-Auskunft hat gerade nicht geantwortet (${String(e.message || e).slice(0, 90)}). Ich habe Ihnen die Verbindung in Google Maps bereitgelegt${when ? ' (' + timeNote + ')' : ''}.`);
        err.fallbackCard = fallbackCard;
        throw err;
    }

    const list = Array.isArray(d.journeys) ? d.journeys : [];
    const nach = d.nach || String(opts.to);
    if (!list.length) {
        return { reply: isArrival
            ? `Ich habe keine Verbindung gefunden, die bis ${formatSpokenTime(when)} in ${nach} ankommt. Ich habe Ihnen Google Maps bereitgelegt.`
            : `Ich habe gerade keine Verbindung nach ${nach} gefunden. Ich habe Ihnen Google Maps bereitgelegt.`, cards: [fallbackCard] };
    }

    const say = (j) => {
        let t = '';
        const walk = (new Date(j.abfahrt) - new Date(j.start)) / 60000;
        if (walk >= 4) t += `Losgehen um ${formatSpokenTime(new Date(j.start))}, `;
        t += `Abfahrt ab ${j.haltVon || 'der ersten Haltestelle'}${j.gleis ? ', Gleis ' + j.gleis : ''} um ${formatSpokenTime(new Date(j.abfahrt))} mit ${j.linien.join(', dann ')}, Ankunft um ${formatSpokenTime(new Date(j.ankunft))} in ${j.haltNach || nach}, ${bahnUmstiegeText(j.umstiege)}.`;
        if (j.faelltAus) t += ' Achtung, diese Verbindung fällt aus.';
        else if (j.verspaetungMin >= 3) t += ` Aktuell ${j.verspaetungMin} Minuten Verspätung.`;
        return t;
    };
    let reply;
    if (isArrival) {
        reply = `Um ${formatSpokenTime(when)} in ${nach} zu sein: ${say(list[0])}`;
        if (list[1]) reply += ` Eine frühere Möglichkeit: Abfahrt um ${formatSpokenTime(new Date(list[1].abfahrt))}, Ankunft um ${formatSpokenTime(new Date(list[1].ankunft))}.`;
    } else {
        reply = `Die nächste Verbindung nach ${nach}: ${say(list[0])}`;
        if (list[1]) reply += ` Danach um ${formatSpokenTime(new Date(list[1].abfahrt))}.`;
    }
    const cards = list.slice(0, 3).map(j => ({
        icon: '🚆',
        title: `${bahnHHMM(j.abfahrt)} → ${bahnHHMM(j.ankunft)} · ${j.linien.join(' › ')}`,
        subtitle: `${j.haltVon || ''}${j.gleis ? ' · Gl. ' + j.gleis : ''} · ${bahnUmstiegeText(j.umstiege)} · ${j.dauerMin} Min.${j.faelltAus ? ' · fällt aus' : (j.verspaetungMin >= 3 ? ' · +' + j.verspaetungMin + ' Min.' : '')}`,
        href: mapsLink()
    }));
    if (d.quelle) cards.push({ icon: 'ℹ️', title: `Fahrplandaten: ${d.quelle}`, subtitle: 'Quellen und Lizenzen der Daten', href: 'https://transitous.org/sources/' });   // Transitous verlangt die sichtbare Nennung
    return { reply, cards };
}

/* --- Fahrzeit-Test für die Einstellungen: zeigt Schritt für Schritt, woran es liegt --- */
async function diagnoseTravel(destination, log) {
    const dest = String(destination || '').trim() || 'Hans-Dewitz-Ring';
    log('Ziel: ' + dest);

    log('Standort wird ermittelt ...');
    const loc = await fetchUserLocationData();
    if (!loc || loc.fehler || loc.latitude === undefined) {
        log('❌ Standort nicht verfügbar: ' + (loc && loc.fehler ? loc.fehler : 'unbekannter Fehler') + '. Ist der Standortzugriff im Browser erlaubt?');
        return;
    }
    log(`✅ Standort: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}${loc.ort ? ' (' + loc.ort + ')' : ''}`);

    log('Adress-Suche wird aufgerufen (/api/geocode) ...');
    let res;
    try {
        res = await apiFetch('/api/geocode?q=' + encodeURIComponent(dest));
    } catch (e) {
        log('❌ ' + (e && e.userMessage ? e.userMessage : 'Keine Verbindung zum Server.'));
        return;
    }
    const rawGeo = await res.text();
    log(`Antwort: Status ${res.status}`);
    let geoData;
    try { geoData = JSON.parse(rawGeo); } catch (e) {
        log('❌ Die Antwort war kein JSON: ' + rawGeo.slice(0, 200).replace(/\s+/g, ' '));
        return;
    }
    if (!res.ok) { log('❌ Fehler: ' + (geoData.error || JSON.stringify(geoData)).toString().slice(0, 250)); return; }
    if (!geoData[0]) { log('❌ Keine Adresse gefunden für "' + dest + '".'); return; }
    const dLat = Number(geoData[0].lat), dLon = Number(geoData[0].lon);
    log(`✅ Adresse gefunden: ${dLat}, ${dLon}`);

    log('Fahrzeit wird berechnet (/api/route) ...');
    let res2;
    try {
        res2 = await apiFetch(`/api/route?fromLat=${loc.latitude}&fromLon=${loc.longitude}&toLat=${dLat}&toLon=${dLon}`);
    } catch (e) {
        log('❌ ' + (e && e.userMessage ? e.userMessage : 'Keine Verbindung zum Server.'));
        return;
    }
    const rawRoute = await res2.text();
    log(`Antwort: Status ${res2.status}`);
    let routeData;
    try { routeData = JSON.parse(rawRoute); } catch (e) {
        log('❌ Die Antwort war kein JSON: ' + rawRoute.slice(0, 200).replace(/\s+/g, ' '));
        return;
    }
    if (!res2.ok) { log('❌ Fehler: ' + (routeData.error || JSON.stringify(routeData)).toString().slice(0, 250)); return; }
    const r = routeData.routes && routeData.routes[0];
    if (!r) { log('❌ Keine Route gefunden. Antwort: ' + JSON.stringify(routeData).slice(0, 250)); return; }
    log(`✅ Fahrzeit: ${Math.round(r.duration / 60)} Minuten, ${(r.distance / 1000).toFixed(1)} km`);

    const autobahnen = extractAutobahnRefs(r);
    log(autobahnen.length ? `Genutzte Autobahnen: ${autobahnen.join(', ')}` : 'Keine Autobahn auf der Strecke erkannt.');
    const padding = 0.35;
    const minLat = Math.min(loc.latitude, dLat) - padding, maxLat = Math.max(loc.latitude, dLat) + padding;
    const minLon = Math.min(loc.longitude, dLon) - padding, maxLon = Math.max(loc.longitude, dLon) + padding;
    for (const road of autobahnen.slice(0, 2)) {
        log(`Stau-Abfrage für ${road} (/api/stau) ...`);
        try {
            const res3 = await apiFetch('/api/stau?road=' + encodeURIComponent(road));
            const raw3 = await res3.text();
            let d3;
            try { d3 = JSON.parse(raw3); } catch (e) { log('❌ Antwort war kein JSON: ' + raw3.slice(0, 150)); continue; }
            if (!res3.ok) { log('❌ Fehler: ' + (d3.error || JSON.stringify(d3)).toString().slice(0, 200)); continue; }
            const alle = d3.warning || [];
            const relevant = alle.filter(w => {
                const wl = w.coordinate && Number(w.coordinate.lat), wo = w.coordinate && Number(w.coordinate.long);
                return isFinite(wl) && isFinite(wo) && wl >= minLat && wl <= maxLat && wo >= minLon && wo <= maxLon;
            });
            log(`✅ ${road}: ${alle.length} Meldungen insgesamt, davon ${relevant.length} in der Nähe der Strecke, ${(d3.roadworks || []).length} Baustellen`);
            relevant.slice(0, 2).forEach(w => log('  • ' + (w.title || '(ohne Titel)')));

            // Webcam-Diagnose: zeigt, ob es überhaupt Webcams auf dieser Autobahn gibt, und ob sie im
            // geprüften Streckenbereich liegen - hilft zu unterscheiden zwischen "keine Kamera vorhanden"
            // und "Kamera liegt außerhalb des geprüften Umkreises".
            const allCams = d3.webcam || [];
            const camsNearby = allCams.filter(w => {
                const wl = w.coordinate && Number(w.coordinate.lat), wo = w.coordinate && Number(w.coordinate.long);
                return isFinite(wl) && isFinite(wo) && wl >= minLat && wl <= maxLat && wo >= minLon && wo <= maxLon;
            });
            log(`📷 ${road}: ${allCams.length} Webcams auf der ganzen Autobahn, davon ${camsNearby.length} im geprüften Streckenbereich`);
            allCams.slice(0, 5).forEach(w => {
                const lat = w.coordinate ? w.coordinate.lat : '?', lon = w.coordinate ? w.coordinate.long : '?';
                log(`  📷 ${w.title || '(ohne Titel)'} · ${lat}, ${lon} · Bild: ${w.imageurl ? 'ja' : 'NEIN'}`);
            });
        } catch (e) {
            log('❌ ' + (e && e.userMessage ? e.userMessage : 'Keine Verbindung zum Server.'));
        }
    }
    log('Fertig.');
}

async function runTravelDiagnosis() {
    const out = document.getElementById('travelDiagOutput');
    const input = document.getElementById('travelDiagInput');
    const lines = [];
    const log = (t) => { lines.push(t); if (out) { out.textContent = lines.join('\n'); out.classList.remove('hidden'); } };
    try { await diagnoseTravel(input ? input.value : '', log); }
    catch (e) { log('❌ Unerwarteter Fehler: ' + (e && e.message ? e.message : e)); }
}

/* ============================================================
   ABFAHRTS-WARNUNG: "Sie sollten jetzt losfahren" - prüft automatisch, ob ein Termin
   mit hinterlegtem Ort bevorsteht und die Zeit zum Losfahren gekommen ist.
   Läuft wie die Termin-Tipps: nur während die App offen ist, alle 60s geprüft,
   die eigentliche Fahrzeit-Berechnung aber nur EINMAL pro Termin (nicht bei jedem Tick).
   ============================================================ */

const DEPARTURE_WARN_BUFFER_MIN = 5;    // Puffer, damit man nicht auf die Minute losfahren muss
const DEPARTURE_CHECK_WINDOW_MIN = 150; // erst ab 2,5 Std. vorher wird überhaupt gerechnet
const departureCache = {};              // eventId -> { deadline, titel, zeit } oder { skip: true }, nur im Speicher (nicht dauerhaft)

function loadWarnedEventIds() {
    try { return new Set(JSON.parse(getPersistentData('helfer_departure_warned', '[]'))); }
    catch (e) { return new Set(); }
}
function saveWarnedEventIds(set) {
    setPersistentData('helfer_departure_warned', JSON.stringify(Array.from(set).slice(-100)));
}

async function checkDepartureWarning() {
    if (!calendarEntries || calendarEntries.length === 0) return;
    const now = new Date();
    const warned = loadWarnedEventIds();

    const upcoming = calendarEntries
        .filter(e => e.isoDate && !warned.has(String(e.id)))
        .map(e => ({ id: e.id, text: e.text, _t: new Date(e.isoDate) }))
        .filter(e => !isNaN(e._t.getTime()) && e._t > now && (e._t - now) / 60000 <= DEPARTURE_CHECK_WINDOW_MIN)
        .sort((a, b) => a._t - b._t)[0];
    if (!upcoming) return;

    const key = String(upcoming.id);
    let cached = departureCache[key];

    if (!cached) {
        let appt;
        try { appt = await findAppointmentByQuery(upcoming.text); }
        catch (e) { return; }   // z.B. Google nicht verbunden - kein Fehler-Lärm, einfach beim nächsten Mal wieder versuchen
        if (!appt || Math.abs(appt.start.getTime() - upcoming._t.getTime()) > 5 * 60000 || !appt.ort) {
            departureCache[key] = { skip: true };   // kein Ort oder falscher Treffer -> für diesen Termin nichts weiter tun
            return;
        }

        let loc;
        try { loc = await fetchUserLocationData(); } catch (e) { return; }
        if (!loc || loc.fehler) return;   // Standort mal nicht verfügbar: beim nächsten Tick nochmal versuchen

        const dest = await geocodeDestination(appt.ort, loc.ort);
        if (!dest) { departureCache[key] = { skip: true }; return; }

        const route = await routeDurationSeconds(loc.latitude, loc.longitude, dest.lat, dest.lon);
        if (!route) return;

        const fahrtMin = Math.round(route.seconds / 60);
        const deadline = new Date(appt.start.getTime() - (fahrtMin + DEPARTURE_WARN_BUFFER_MIN) * 60000);
        cached = { deadline, titel: appt.titel, zeit: appt.start };
        departureCache[key] = cached;
    }

    if (cached.skip) return;
    if (now.getTime() >= cached.deadline.getTime()) {
        warned.add(key);
        saveWarnedEventIds(warned);
        speak(`Sie sollten jetzt losfahren, sonst schaffen Sie es nicht rechtzeitig zu ${cached.titel} um ${formatSpokenTime(cached.zeit)}.`);
    }
}

setInterval(() => { checkDepartureWarning(); }, 60000);
