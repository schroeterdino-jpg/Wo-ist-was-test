/* ============================================================
   TRAVEL: "Wann muss ich losfahren?" - Route und Abfahrtszeit
   Nutzt kostenlose, schlüssellose Dienste: Nominatim (Adress-Suche) und OSRM (Routenzeit).
   Braucht: calendar.js (accessToken, isGoogleAuthorized, ensureGoogleAuth, markGoogleExpired),
            briefing.js (formatSpokenTime, fetchUserLocationData), places.js (buildMapsLink), lists.js (userError)
   ============================================================ */

const TRAVEL_BUFFER_MINUTES = 10;   // Puffer, damit man nicht auf die Minute genau losfahren muss

async function geocodeAddress(address) {
    try {
        const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(address);
        const res = await fetch(url, { headers: { 'Accept-Language': 'de' } });
        if (!res.ok) return null;
        const data = await res.json();
        if (!data || !data[0]) return null;
        return { lat: Number(data[0].lat), lon: Number(data[0].lon) };
    } catch (e) {
        return null;
    }
}

async function routeDurationSeconds(fromLat, fromLon, toLat, toLon) {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false`;
        const res = await fetch(url);
        if (!res.ok) return null;
        const data = await res.json();
        const r = data && data.routes && data.routes[0];
        if (!r) return null;
        return { seconds: r.duration, meters: r.distance };
    } catch (e) {
        return null;
    }
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

    const loc = await fetchUserLocationData();
    if (!loc || loc.fehler || loc.latitude === undefined) throw userError('Ihren Standort konnte ich gerade nicht ermitteln. Ist der Standortzugriff erlaubt?');

    let dest = await geocodeAddress(target.ort);
    if (!dest && loc.ort) dest = await geocodeAddress(target.ort + ', ' + loc.ort);   // ohne Ortsangabe: mit dem aktuellen Ort versuchen
    if (!dest) throw userError(`Die Adresse "${target.ort}" konnte ich nicht finden.`);

    const route = await routeDurationSeconds(loc.latitude, loc.longitude, dest.lat, dest.lon);
    if (!route) throw userError('Die Fahrzeit konnte gerade nicht berechnet werden. Bitte versuchen Sie es gleich noch einmal.');

    const fahrtMin = Math.round(route.seconds / 60);
    const km = route.meters / 1000;
    const kmText = km >= 10 ? Math.round(km) + ' Kilometer' : km.toFixed(1).replace('.', ',') + ' Kilometer';

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

    return {
        reply,
        card: { icon: '🚗', title: 'Route zu ' + target.titel, subtitle, href: buildMapsLink(target.ort, '', 'driving') }
    };
}
