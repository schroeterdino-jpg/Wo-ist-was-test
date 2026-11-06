// Karten-Dienste in EINER Serverless Function (Vercel Hobby erlaubt höchstens 12 Functions).
// Ersetzt die früheren Dateien geocode.js, reverse.js, route.js und overpass.js; dazu kommt 'holidays' (Schulferien/Feiertage).
// Die alten Adressen /api/geocode, /api/reverse, /api/route und /api/overpass werden in vercel.json
// auf diese Datei umgeleitet (mit ?action=geocode|reverse|route|overpass), die App merkt davon nichts.
//
// Läuft alles über den Server, weil die öffentlichen Kartendienste Anfragen aus dem Browser oft per CORS blockieren.
export const config = { maxDuration: 45 };

/* ------------------------------------------------------------------
   geocode: Adress-Suche (Geocoding) über OpenStreetMap/Nominatim
   ------------------------------------------------------------------ */
async function geocode(req, res) {
  const q = req.query.q;
  if (!q) return res.status(400).json({ error: 'Kein Suchbegriff angegeben' });

  try {
    const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q);
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'MeinAlltagsHelfer/1.0 (privates Projekt, kein kommerzieller Einsatz)',
        'Accept-Language': 'de'
      }
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: 'Adress-Suche antwortete nicht mit JSON: ' + text.slice(0, 200) });
    }
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy-Fehler: ' + err.message });
  }
}

/* ------------------------------------------------------------------
   reverse: Koordinaten zu Adresse mit Hausnummer ("Reverse Geocoding"), vor allem für den Parkplatz.
   Quelle: OpenStreetMap Nominatim (kostenlos, ohne Schlüssel); verlangt einen eigenen User-Agent.
   ------------------------------------------------------------------ */
async function reverse(req, res) {
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'Koordinaten fehlen oder sind ungültig' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=de`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'AlltagsHelfer/1.0 (privates Hobbyprojekt, nicht kommerziell)' },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) return res.status(502).json({ error: 'Adress-Suche antwortet mit Status ' + r.status });
    const d = await r.json();
    const a = d.address || {};
    const strasseName = a.road || a.pedestrian || a.footway || a.path || '';
    const hausnummer = a.house_number || '';
    const ort = a.city || a.town || a.village || a.municipality || a.suburb || a.county || '';
    const strasse = strasseName ? (strasseName + (hausnummer ? ' ' + hausnummer : '')).trim() : '';
    const adresse = [strasse, ort].filter(Boolean).join(', ');
    return res.status(200).json({ adresse: adresse || null, strasse: strasse || null, hausnummer: !!hausnummer, ort: ort || null, bundesland: a.state || null });
  } catch (e) {
    return res.status(502).json({ error: 'Adress-Suche nicht erreichbar: ' + e.message });
  }
}


/* ------------------------------------------------------------------
   Google Routes API (nur auf Wunsch: ?google=1, derzeit für den Arbeitsweg).
   Liefert dieselbe Strecke wie die Google-Maps-App, inklusive aktuellem Verkehr, im selben Format wie OSRM
   (routes[0].duration/distance/geometry/legs[].steps[].ref), damit die App nichts anders machen muss.
   Schutz vor Kosten: Ergebnis 10 Minuten zwischengespeichert, höchstens GOOGLE_MONATSLIMIT Abfragen pro Monat (Zähler in Redis).
   Ohne GOOGLE_MAPS_API_KEY, ohne Redis, bei erreichtem Limit oder bei jedem Fehler wird einfach OSRM benutzt.
   ------------------------------------------------------------------ */
const GOOGLE_MONATSLIMIT = 4000;
const GOOGLE_CACHE_S = 600;

function redisCmd(command) {
  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!base || !token) return Promise.resolve(undefined);
  return fetch(base, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
    signal: AbortSignal.timeout(3000)
  }).then(r => r.json()).then(j => (j && j.error ? undefined : j.result)).catch(() => undefined);
}

function decodePolyline(str) {
  const pts = [];
  let i = 0, lat = 0, lon = 0;
  while (i < str.length) {
    for (const axis of [0, 1]) {
      let shift = 0, result = 0, b;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i <= str.length);
      const d = (result & 1) ? ~(result >> 1) : (result >> 1);
      if (axis === 0) lat += d; else lon += d;
    }
    pts.push([lon / 1e5, lat / 1e5]);   // wie OSRM/GeoJSON: [Länge, Breite]
  }
  return pts;
}

function ausdünnen(pts, max) {
  if (pts.length <= max) return pts;
  const step = Math.ceil(pts.length / max);
  return pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
}

function googleAutobahnen(route) {
  const refs = new Set();
  (route.legs || []).forEach(leg => (leg.steps || []).forEach(step => {
    const t = step && step.navigationInstruction && step.navigationInstruction.instructions;
    if (!t) return;
    const re = /(?:^|[^A-Za-zÄÖÜäöüß0-9])A ?(\d{1,3})(?![0-9A-Za-z])/g;
    let m;
    while ((m = re.exec(t))) refs.add('A' + m[1]);
  }));
  return Array.from(refs);
}

async function googleRoute(fromLat, fromLon, toLat, toLon, mitLinie) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return null;
  const f = n => Number(n).toFixed(3);
  const cacheKey = 'gmaps:route:' + [fromLat, fromLon, toLat, toLon].map(f).join(',') + (mitLinie ? ':g' : '');
  const cached = await redisCmd(['GET', cacheKey]);
  if (cached) { try { const o = JSON.parse(cached); o.quelle = 'google'; o.zwischengespeichert = true; return o; } catch (e) {} }

  // Monatszähler: ohne Redis kann das Limit nicht eingehalten werden, dann lieber gar nicht Google nutzen
  const monat = new Date().toISOString().slice(0, 7);
  const zaehler = await redisCmd(['INCR', 'gmaps:count:' + monat]);
  if (typeof zaehler !== 'number') return null;
  if (zaehler === 1) await redisCmd(['EXPIRE', 'gmaps:count:' + monat, 3456000]);
  if (zaehler > GOOGLE_MONATSLIMIT) return null;

  const body = {
    origin: { location: { latLng: { latitude: Number(fromLat), longitude: Number(fromLon) } } },
    destination: { location: { latLng: { latitude: Number(toLat), longitude: Number(toLon) } } },
    travelMode: 'DRIVE',
    routingPreference: 'TRAFFIC_AWARE',
    languageCode: 'de-DE',
    units: 'METRIC',
    polylineQuality: 'OVERVIEW'
  };
  const r = await fetch('https://routes.googleapis.com/directions/v2:computeRoutes', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask': 'routes.duration,routes.staticDuration,routes.distanceMeters,routes.polyline.encodedPolyline,routes.legs.steps.navigationInstruction.instructions'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(8000)
  });
  if (!r.ok) return null;
  const d = await r.json();
  const g = d && d.routes && d.routes[0];
  if (!g || !g.duration) return null;
  const sec = parseInt(String(g.duration), 10);
  if (!isFinite(sec)) return null;
  const out = {
    code: 'Ok',
    quelle: 'google',
    routes: [{
      duration: sec,
      distance: g.distanceMeters || 0,
      legs: [{ steps: googleAutobahnen(g).map(a => ({ ref: a, name: '' })) }]
    }]
  };
  if (mitLinie && g.polyline && g.polyline.encodedPolyline) {
    out.routes[0].geometry = { type: 'LineString', coordinates: ausdünnen(decodePolyline(g.polyline.encodedPolyline), 400) };
  }
  await redisCmd(['SET', cacheKey, JSON.stringify(out), 'EX', GOOGLE_CACHE_S]);
  return out;
}

/* ------------------------------------------------------------------
   route: Fahrzeit-Berechnung über OSRM (Open Source Routing Machine).
   Mit ?geometry=1 kommt zusätzlich der (vereinfachte) Linienverlauf der Route mit, den die HUD-Karte zeichnet.
   ------------------------------------------------------------------ */
async function route(req, res) {
  const { fromLat, fromLon, toLat, toLon, geometry, google } = req.query;
  if (!fromLat || !fromLon || !toLat || !toLon) return res.status(400).json({ error: 'Koordinaten fehlen' });

  if (google === '1') {
    try {
      const g = await googleRoute(fromLat, fromLon, toLat, toLon, geometry === '1');
      if (g) return res.status(200).json(g);
    } catch (e) { /* bei jedem Fehler weiter mit OSRM */ }
  }

  try {
    const overview = geometry === '1' ? 'simplified&geometries=geojson' : 'false';
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=${overview}&steps=true`;
    const response = await fetch(url);
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: 'Routendienst antwortete nicht mit JSON: ' + text.slice(0, 200) });
    }
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy-Fehler: ' + err.message });
  }
}

/* ------------------------------------------------------------------
   overpass: Restaurant-/Lokale-Suche über OpenStreetMap (Overpass API).
   Diese kostenlosen, öffentlichen Server sind manchmal überlastet oder langsam. Deshalb werden mehrere
   unabhängige Server GLEICHZEITIG angefragt, und der erste, der antwortet, gewinnt - das hält die Wartezeit
   kurz (statt sie bei mehreren Versuchen nacheinander aufzuaddieren).
   ------------------------------------------------------------------ */
const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const PER_SERVER_TIMEOUT_MS = 18000;

async function tryServer(url, query) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PER_SERVER_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'MeinAlltagsHelfer/1.0 (privates Projekt, kein kommerzieller Einsatz)'
      },
      body: 'data=' + encodeURIComponent(query),
      signal: controller.signal
    });
    const text = await response.text();
    if (!response.ok) throw new Error('Status ' + response.status);
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      throw new Error('kein JSON (' + text.slice(0, 80).replace(/\s+/g, ' ') + ')');
    }
    return data;
  } catch (err) {
    throw new Error(err.name === 'AbortError' ? 'Zeitüberschreitung' : err.message);
  } finally {
    clearTimeout(timer);
  }
}

async function overpass(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.body && req.body.query;
  if (!query) return res.status(400).json({ error: 'Keine Overpass-Abfrage angegeben' });

  try {
    const data = await Promise.any(SERVERS.map(url => tryServer(url, query)));
    return res.status(200).json(data);
  } catch (aggregateErr) {
    const reasons = (aggregateErr.errors || []).map((e, i) => new URL(SERVERS[i]).hostname + ': ' + e.message);
    return res.status(502).json({ error: 'Alle Kartendienste haben gerade nicht geantwortet (' + reasons.join('; ') + ').' });
  }
}

/* ------------------------------------------------------------------
   holidays: Schulferien (kind=school, Standard) oder Feiertage (kind=public) aller Bundesländer von OpenHolidays (openholidaysapi.org, offen und kostenlos).
   Läuft über den Server, damit der Browser nicht an Fremdserver-Regeln (CORS) scheitert; das Ergebnis darf einen Tag zwischengespeichert werden.
   Aufruf: /api/maps?action=holidays&kind=school&from=2026-09-01&to=2028-12-31
   ------------------------------------------------------------------ */
async function holidays(req, res) {
  const kind = req.query.kind === 'public' ? 'PublicHolidays' : 'SchoolHolidays';
  const from = String(req.query.from || ''), to = String(req.query.to || '');
  const isDay = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + 'T12:00:00Z').getTime());
  if (!isDay(from) || !isDay(to) || from > to) return res.status(400).json({ error: 'Zeitraum fehlt oder ist ungültig (from/to als JJJJ-MM-TT)' });
  try {
    const url = `https://openholidaysapi.org/${kind}?countryIsoCode=DE&languageIsoCode=DE&validFrom=${from}&validTo=${to}`;
    const r = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'MeinAlltagsHelfer/1.0 (privates Projekt, kein kommerzieller Einsatz)' },
      signal: AbortSignal.timeout(15000)
    });
    if (!r.ok) return res.status(502).json({ error: 'Ferien-Dienst antwortet mit Status ' + r.status });
    const data = await r.json();
    if (!Array.isArray(data)) return res.status(502).json({ error: 'Ferien-Dienst lieferte unerwartete Daten' });
    res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: 'Ferien-Dienst nicht erreichbar: ' + e.message });
  }
}

/* ------------------------------------------------------------------
   places: Orte-Suche über Google Places (neue API, "Text Search"): Name, Adresse, Öffnungszeiten (auch Feiertage, "jetzt geöffnet"),
   Bewertung, Telefon. Genauer und vollständiger als OpenStreetMap, besonders bei Öffnungszeiten.
   Aufruf: /api/maps?action=places&lat=..&lon=..&radius=5000&q=Penny
   Braucht in Vercel: GOOGLE_MAPS_API_KEY (derselbe wie für die Routes API) und in Google Cloud die aktivierte "Places API (New)".
   Schutz vor Kosten: Ergebnis 10 Minuten zwischengespeichert, höchstens PLACES_MONATSLIMIT Abfragen pro Monat (Zähler in Redis, wie bei der Route).
   Ohne Schlüssel, ohne Redis, bei erreichtem Limit oder bei jedem Fehler antwortet der Server mit einem Fehler, und die App nimmt wie bisher OpenStreetMap.
   ------------------------------------------------------------------ */
const PLACES_MONATSLIMIT = 900;
const PLACES_CACHE_S = 600;
const OSM_DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

function distM(lat1, lon1, lat2, lon2) {
  const R = 6371000, rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/* Google-Öffnungszeiten (periods) in die OpenStreetMap-Schreibweise ("Mo 08:00-20:00; Tu ...") umwandeln,
   damit die bisherige Auswertung in der App sie versteht */
function periodsToOsm(periods) {
  if (!Array.isArray(periods) || !periods.length) return '';
  if (periods.length === 1 && periods[0].open && !periods[0].close) return '24/7';
  const pad = n => String(n || 0).padStart(2, '0');
  const perDay = {};
  periods.forEach(p => {
    if (!p.open || !p.close) return;
    const d = p.open.day;
    const closeIsMidnight = p.close.day !== d && !p.close.hour && !p.close.minute;
    const end = closeIsMidnight ? '24:00' : pad(p.close.hour) + ':' + pad(p.close.minute);
    (perDay[d] = perDay[d] || []).push(pad(p.open.hour) + ':' + pad(p.open.minute) + '-' + end);
  });
  const rules = [];
  [1, 2, 3, 4, 5, 6, 0].forEach(d => {
    rules.push(perDay[d] ? OSM_DAYS[d] + ' ' + perDay[d].sort().join(',') : OSM_DAYS[d] + ' off');
  });
  return rules.join('; ');
}

function berlinTime(iso) {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    const hhmm = new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false }).format(d);
    const day = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d);
    const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date());
    return { hhmm, sameDay: day === today };
  } catch (e) { return null; }
}

async function places(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY fehlt' });
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  const radius = Math.min(50000, Math.max(500, Number(req.query.radius) || 5000));
  const q = String(req.query.q || '').trim().slice(0, 60);
  if (!q || !isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return res.status(400).json({ error: 'Suchbegriff oder Koordinaten fehlen' });

  const cacheKey = 'gmaps:places:' + q.toLowerCase() + ':' + lat.toFixed(3) + ',' + lon.toFixed(3) + ':' + Math.round(radius / 1000);
  const cached = await redisCmd(['GET', cacheKey]);
  if (cached) { try { const o = JSON.parse(cached); o.zwischengespeichert = true; return res.status(200).json(o); } catch (e) {} }

  const monat = new Date().toISOString().slice(0, 7);
  const zaehler = await redisCmd(['INCR', 'gmaps:placescount:' + monat]);
  if (typeof zaehler !== 'number') return res.status(503).json({ error: 'Zähler (Redis) nicht erreichbar' });
  if (zaehler === 1) await redisCmd(['EXPIRE', 'gmaps:placescount:' + monat, 3456000]);
  if (zaehler > PLACES_MONATSLIMIT) return res.status(429).json({ error: 'Monatslimit für Google Places erreicht' });

  try {
    const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'places.displayName,places.addressComponents,places.location,places.regularOpeningHours,places.currentOpeningHours,places.rating,places.userRatingCount,places.nationalPhoneNumber,places.businessStatus'
      },
      body: JSON.stringify({
        textQuery: q,
        languageCode: 'de',
        regionCode: 'DE',
        rankPreference: 'DISTANCE',
        maxResultCount: 10,
        locationBias: { circle: { center: { latitude: lat, longitude: lon }, radius } }
      }),
      signal: AbortSignal.timeout(9000)
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'Google Places: ' + ((d && d.error && d.error.message) || ('Status ' + r.status)).slice(0, 160) });
    const out = [];
    (d.places || []).forEach(p => {
      if (!p.location || p.businessStatus === 'CLOSED_PERMANENTLY') return;
      const plat = p.location.latitude, plon = p.location.longitude;
      if (distM(lat, lon, plat, plon) > radius * 1.1) return;
      const comp = t => { const c = (p.addressComponents || []).find(x => (x.types || []).indexOf(t) >= 0); return c ? c.longText : ''; };
      const cur = p.currentOpeningHours || null;
      const o = { name: (p.displayName && p.displayName.text) || '', lat: plat, lon: plon, street: comp('route'), housenumber: comp('street_number'), city: comp('locality') || comp('postal_town') || comp('sublocality'), postcode: comp('postal_code') };
      o.hours = periodsToOsm(p.regularOpeningHours && p.regularOpeningHours.periods);
      o.openNow = cur && typeof cur.openNow === 'boolean' ? cur.openNow : null;
      if (o.openNow === true && cur.nextCloseTime) { const t = berlinTime(cur.nextCloseTime); if (t && t.sameDay) o.until = t.hhmm; }
      if (o.openNow === false && cur && cur.nextOpenTime) { const t = berlinTime(cur.nextOpenTime); if (t && t.sameDay) o.opensAt = t.hhmm; }
      if (typeof p.rating === 'number') { o.rating = p.rating; o.ratingCount = p.userRatingCount || 0; }
      if (p.nationalPhoneNumber) o.phone = p.nationalPhoneNumber;
      out.push(o);
    });
    const result = { quelle: 'google', places: out };
    await redisCmd(['SET', cacheKey, JSON.stringify(result), 'EX', PLACES_CACHE_S]);
    return res.status(200).json(result);
  } catch (e) {
    return res.status(502).json({ error: 'Google Places nicht erreichbar: ' + e.message });
  }
}

/* ------------------------------------------------------------------
   streetview: Foto der Straße vor einem Ziel (Google Street View Static API). Die App schickt q (Adresse/Name) oder lat+lon und
   optional drehen (Grad, relativ zur Blickrichtung aufs Ziel). Antwort: JPEG; Header X-Blick = Grundrichtung.
   Die Vorab-Abfrage (metadata) kostet nichts und sagt, ob es dort Bilder gibt. Höchstens SV_MONATSLIMIT Bilder pro Monat (Zähler in Redis).
   ------------------------------------------------------------------ */
const SV_MONATSLIMIT = 3000;
async function streetview(req, res) {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) return res.status(503).json({ error: 'GOOGLE_MAPS_API_KEY fehlt' });
  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  const q = String(req.query.q || '').trim().slice(0, 120);
  const ort = (isFinite(lat) && isFinite(lon) && req.query.lat !== undefined && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) ? lat + ',' + lon : q;
  if (!ort) return res.status(400).json({ error: 'Kein Ziel angegeben' });
  const drehen = Number(req.query.drehen) || 0;
  try {
    const meta = await fetch('https://maps.googleapis.com/maps/api/streetview/metadata?source=outdoor&radius=250&location=' + encodeURIComponent(ort) + '&key=' + key, { signal: AbortSignal.timeout(8000) }).then(r => r.json());
    if (!meta || meta.status !== 'OK') return res.status(404).json({ error: 'Kein Street View', status: meta && meta.status });
    // Grundrichtung: von der Kamera-Position zum Ziel (Ziel-Koordinate über Nominatim; ohne sie bleibt die Richtung der Standard von Google)
    let blick = null;
    try {
      let tlat = null, tlon = null;
      if (ort.includes(',') && /^-?[\d.]+,-?[\d.]+$/.test(ort)) { const p = ort.split(','); tlat = Number(p[0]); tlon = Number(p[1]); }
      else {
        const g = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(ort), { headers: { 'User-Agent': 'MeinAlltagsHelfer/1.0 (privates Projekt)', 'Accept-Language': 'de' }, signal: AbortSignal.timeout(5000) }).then(r => r.json());
        if (Array.isArray(g) && g[0]) { tlat = Number(g[0].lat); tlon = Number(g[0].lon); }
      }
      if (tlat !== null && meta.location && isFinite(tlat) && isFinite(tlon)) {
        const rad = d => d * Math.PI / 180, a1 = rad(meta.location.lat), a2 = rad(tlat), dl = rad(tlon - meta.location.lng);
        const y = Math.sin(dl) * Math.cos(a2), x = Math.cos(a1) * Math.sin(a2) - Math.sin(a1) * Math.cos(a2) * Math.cos(dl);
        blick = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
      }
    } catch (e) {}
    const monat = new Date().toISOString().slice(0, 7);
    const zaehler = await redisCmd(['INCR', 'gmaps:sv:' + monat]);
    if (typeof zaehler !== 'number') return res.status(503).json({ error: 'Zähler nicht verfügbar' });
    if (zaehler === 1) await redisCmd(['EXPIRE', 'gmaps:sv:' + monat, 3456000]);
    if (zaehler > SV_MONATSLIMIT) return res.status(429).json({ error: 'Monatslimit erreicht' });
    let url = 'https://maps.googleapis.com/maps/api/streetview?size=640x320&fov=90&source=outdoor&pano=' + encodeURIComponent(meta.pano_id) + '&key=' + key;
    if (blick !== null) url += '&heading=' + Math.round(((blick + drehen) % 360 + 360) % 360);
    const img = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!img.ok) return res.status(502).json({ error: 'Street View nicht erreichbar' });
    const buf = Buffer.from(await img.arrayBuffer());
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'private, max-age=3600');
    res.setHeader('X-Blick', blick === null ? '' : String(Math.round(blick)));
    res.setHeader('Access-Control-Expose-Headers', 'X-Blick');
    return res.status(200).send(buf);
  } catch (e) {
    return res.status(502).json({ error: 'Street View nicht erreichbar: ' + e.message });
  }
}

/* ------------------------------------------------------------------
   shopping: Preise zu einem Suchbegriff (Google Shopping über serper.dev), z. B. für die Wunschliste.
   ?action=shopping&q=Lightning McQueen Spielzeug  ->  { angebote: [{ titel, shop, preis, preisText, link }] } (günstigste zuerst); mit &gebraucht=1 zusätzlich { gebraucht: [...] } (Kleinanzeigen/eBay u. a., getrennt von den Neupreisen)
   Braucht die Variable SERPER_API_KEY in Vercel. Zu billige Ausreißer (Zubehör, Aufkleber) werden anhand des mittleren Preises entfernt.
   ------------------------------------------------------------------ */
function preisZahl(t) {
  const x = String(t || '').replace(/\s/g, '');
  let m = x.match(/(\d{1,3}(?:\.\d{3})*|\d+),(\d{1,2})(?!\d)/);          // 15,99 oder 1.019,00
  if (m) return parseFloat(m[1].replace(/\./g, '') + '.' + m[2]);
  m = x.match(/(\d+)\.(\d{2})(?!\d)/);                                      // 17.50
  if (m) return parseFloat(m[1] + '.' + m[2]);
  m = x.match(/(\d{1,3}(?:\.\d{3})+|\d+)/);                                 // 15 oder 1.019
  return m ? parseFloat(m[1].replace(/\./g, '')) : null;
}
/* Passt der Angebotstitel zur Suche? Google Shopping liefert auch ähnliche, kleinere oder fremde Produkte (nach Preis sortiert). */
const STOPP = new Set(['und', 'mit', 'fuer', 'der', 'die', 'das', 'ein', 'eine', 'einen', 'seine', 'seiner', 'and', 'his', 'with', 'for', 'the', 'von', 'bei', 'inkl', 'cm']);
function woerter(t) {
  return Array.from(new Set(String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').split(/[^a-z0-9]+/).filter(w => w.length >= 3 && !STOPP.has(w) && !/^\d+$/.test(w))));
}
function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss'); }
/* Gewicht je Suchwort: Wörter, die fast alle Treffer haben (Marke, Serie), zählen wenig; seltene (Web-Quartier, Spielset) zählen viel. */
/* Kern des Produktnamens: bis "mit", "für", "inkl." oder Komma; der Rest (Zubehör, Beiwerk) steht in Shop-Titeln oft nicht */
function kernText(q) {
  const ws = []; for (const x of String(q).split(/\s+/)) { if (/^(mit|für|fuer|inkl\.?)$/i.test(x)) break; ws.push(x.replace(/,$/, '')); if (/,$/.test(x)) break; }
  return ws.length >= 3 ? ws.join(' ') : String(q);
}
function gewichte(frage, titel) {
  frage = kernText(frage);
  const fw = woerter(frage), tts = titel.map(t => norm(t).replace(/[^a-z0-9]+/g, '')), n = Math.max(titel.length, 1), g = {};
  fw.forEach(w => { const df = tts.filter(t => t.includes(w)).length; g[w] = df === 0 ? 1 : 0.3 + 2 * (1 - df / n); });
  return g;
}
function passung(frage, titel, gew) {
  const fw = woerter(kernText(frage)); if (!fw.length) return 1;
  const tt = norm(titel).replace(/[^a-z0-9]+/g, '');
  const tw = new Set(woerter(titel)); let summe = 0, treffer = 0;
  fw.forEach(w => { const g = gew && gew[w] != null ? gew[w] : 1; summe += g; if (tw.has(w) || (w.length >= 5 && tt.includes(w))) treffer += g; });
  return summe ? treffer / summe : 1;
}
/* Zweite, kürzere Suche ohne Marke und Beiwerk: "Spidey Super-Freunde Web-Spinners Web-Quartier Spielset" */
function kernSuche(q) {
  const w = String(q).split(/[\s,;]+/).filter(Boolean);
  if (w.length < 6) return '';
  const kurz = []; for (const x of w.slice(1)) { if (/^(mit|für|fuer|inkl\.?|ab|zum|zur)$/i.test(x)) break; if (!STOPP.has(norm(x))) kurz.push(x); }
  const k = kurz.slice(0, 6).join(' ');
  return k && norm(k) !== norm(q) ? k : '';
}
const AUSSCHLUSS_RX = /thangs|printables|thingiverse|cults3d|myminifactory/i;   // Vorlagen zum 3D-Drucken, keine Waren
const MARKTPLATZ_RX = /onbuy|easyshop|temu|aliexpress|wish\.com|joom|dhgate|banggood|shein/i;   // Marktplätze mit Importware: Preis oft unzuverlässig
const GEBRAUCHT_RX = /kleinanzeigen|ebay|vinted|willhaben|momox|rebuy|mobile\.de|shpock/i;
/* Kleinanzeigen hat keine offene Schnittstelle: Treffer kommen aus der Google-Suche (nur Anzeigen-Seiten, Preis aus Titel oder Beschreibung, sonst weglassen). */
function kleinanzeigenTreffer(d) {
  const out = [];
  (Array.isArray(d && d.organic) ? d.organic : []).forEach(x => {
    try {
      const u = new URL(String(x.link || ''));
      if (!/(^|\.)kleinanzeigen\.de$/i.test(u.hostname) || !/\/s-anzeige\//.test(u.pathname)) return;
      const text = String(x.title || '') + ' ' + String(x.snippet || '');
      const m = text.match(/(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|EUR\b|Euro\b)/i);
      if (!m) return;
      const preis = parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] || '0'));
      if (!(preis > 0)) return;
      out.push({ titel: String(x.title || '').replace(/\s*[-–|]\s*Kleinanzeigen.*$/i, '').slice(0, 120), shop: 'Kleinanzeigen', preisText: m[0].trim(), preis, link: u.href });
    } catch (e) { }
  });
  return out;
}
/* Idealo-Produktseite aus der Google-Suche (site:idealo.de): Titel + "ab 85,83 €" aus dem Textauszug; nur direkte Idealo-Produktlinks. */
function idealoTreffer(d) {
  const out = [];
  (Array.isArray(d && d.organic) ? d.organic : []).forEach(x => {
    try {
      const u = new URL(String(x.link || ''));
      if (!/(^|\.)idealo\.de$/i.test(u.hostname) || !/\/preisvergleich\/OffersOfProduct\//i.test(u.pathname)) return;
      const text = String(x.title || '') + ' ' + String(x.snippet || '');
      const m = text.match(/(?:ab|Preise?\s+ab|ab\s+nur)\s*(\d{1,3}(?:\.\d{3})+|\d+)(?:,(\d{1,2}))?\s*(?:€|EUR\b|Euro\b)/i) || text.match(/(\d{1,3}(?:\.\d{3})+|\d+),(\d{2})\s*(?:€|EUR\b)/);
      if (!m) return;
      const preis = parseFloat(m[1].replace(/\./g, '') + '.' + (m[2] || '0'));
      if (!(preis > 0)) return;
      out.push({ titel: String(x.title || '').replace(/\s*[-–|]\s*(?:Preisvergleich|idealo).*$/i, '').replace(/\s*(?:ab|Preise ab)\s*[\d.,]+\s*€.*$/i, '').slice(0, 120), shop: 'Idealo', preisText: m[0].trim(), preis, link: u.href });
    } catch (e) { }
  });
  return out.slice(0, 2);
}
/* Idealos eigene Suchseite (liefert genau, was man dort im Browser sieht). Kann von Idealo geblockt werden: dann bleibt es still bei der Google-Suche, die Diagnose nennt den Status. */
function idealoSeite(html) {
  const out = [], sehen = new Set();
  const re = /<a\b[^>]*href="((?:https?:\/\/www\.idealo\.de)?\/preisvergleich\/OffersOfProduct\/[^"#?]+?\.html)[^"]*"[^>]*>/gi; let m;
  while ((m = re.exec(html)) && out.length < 6) {
    const href = m[1].startsWith('http') ? m[1] : 'https://www.idealo.de' + m[1]; if (sehen.has(href)) continue;
    const rest = html.slice(m.index, m.index + 2500), text = rest.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, '\n').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').split('\n').map(x => x.trim()).filter(Boolean);
    const pi = text.findIndex(x => /\d{1,3}(?:\.\d{3})*,\d{2}\s*€/.test(x)); if (pi < 0) continue;
    const titel = text.slice(0, pi).filter(x => x.length >= 12 && !/^(Anzeige|Neu|Testsieger|Sponsored)/i.test(x))[0] || (m[0].match(/title="([^"]+)"/i) || [])[1] || '';
    const pm = text[pi].match(/(\d{1,3}(?:\.\d{3})*),(\d{2})\s*€/), preis = parseFloat(pm[1].replace(/\./g, '') + '.' + pm[2]);
    if (!titel || !(preis > 0)) continue;
    sehen.add(href); out.push({ titel: titel.slice(0, 120), shop: 'Idealo', preisText: 'ab ' + pm[0], preis, link: href });
  }
  return out;
}
/* Zusammengesetzte Wörter des Produktnamens (Web-Quartier, Super-Freunde): sie unterscheiden ähnliche Sets. Mindestens die Hälfte davon müssen im Angebot stehen. */
function bindeWoerter(q) {
  const core = []; for (const x of String(q).split(/\s+/)) { if (/,$/.test(x) || /^(mit|für|fuer|inkl\.?)$/i.test(x)) { if (/,$/.test(x)) core.push(x.replace(/,$/, '')); break; } core.push(x); }
  return Array.from(new Set(core.filter(x => x.indexOf('-') > 0).map(x => norm(x).replace(/[^a-z0-9]+/g, '')).filter(x => x.length >= 7)));
}
function kernOk(comps, titel) {
  const tt = norm(titel).replace(/[^a-z0-9]+/g, ''); let n = 0;
  comps.forEach(c => { if (tt.includes(c) || tt.includes(c.replace(/e$/, ''))) n++; });
  return n >= Math.ceil(comps.length * 0.5);
}
async function shopping(req, res) {
  const q = String(req.query.q || '').trim().slice(0, 120);
  if (!q) return res.status(400).json({ error: 'Kein Suchbegriff angegeben' });
  const key = process.env.SERPER_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server: SERPER_API_KEY fehlt' });
  try {
    const hole = async qq => {
      const r = await fetch('https://google.serper.dev/shopping', {
        method: 'POST',
        headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ q: qq, gl: 'de', hl: 'de', num: 40 }),
        signal: AbortSignal.timeout(9000)
      });
      if (!r.ok) { const e = new Error('Preis-Dienst antwortet mit ' + r.status); e.status = r.status; throw e; }
      const j = await r.json(); return Array.isArray(j.shopping) ? j.shopping : [];
    };
    const kern = kernSuche(q);
    const extra = kern ? [kern, kern + ' amazon'] : (woerter(q).length >= 3 ? [q + ' amazon'] : []);
    const ergs = await Promise.all([hole(q)].concat(extra.map(e => hole(e).catch(() => []))).map((p, i) => i === 0 ? p.catch(e => e) : p));
    if (ergs[0] instanceof Error) return res.status(502).json({ error: ergs[0].message });
    const d = { shopping: [] }, gesehen = new Set();
    ergs.forEach(arr => arr.forEach(x => { const k = String(x.link || '') + '|' + String(x.title || '') + '|' + String(x.price || ''); if (!gesehen.has(k)) { gesehen.add(k); d.shopping.push(x); } }));
    let ka = [];
    if (String(req.query.gebraucht || '') === '1') {
      try {
        const r2 = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: q + ' site:kleinanzeigen.de', gl: 'de', hl: 'de', num: 10 }), signal: AbortSignal.timeout(7000) });
        if (r2.ok) ka = kleinanzeigenTreffer(await r2.json());
      } catch (e) { }
    }
    const alle = (Array.isArray(d.shopping) ? d.shopping : []).map(x => ({
      titel: String(x.title || '').slice(0, 120), shop: String(x.source || ''), preisText: String(x.price || ''),
      preis: preisZahl(x.price), link: String(x.link || '')
    })).filter(x => x.preis && x.preis > 0 && !AUSSCHLUSS_RX.test(x.shop + ' ' + x.link));
    let idl = [], diagI = { roh: 0, seiten: 0 };
    if (woerter(q).length >= 2) {   // Idealo kennt oft genau das Produkt, das Google Shopping nicht liefert
      // Kurze Abfrage (ohne Marke und Beiwerk): mit dem ganzen Titel findet der Suchdienst bei Idealo nichts
      let basis = kern; if (!basis) { const ws = []; for (const x of q.split(/\s+/)) { if (/^(mit|für|fuer|inkl\.?)$/i.test(x)) break; ws.push(x.replace(/,$/, '')); if (/,$/.test(x) || ws.length >= 8) break; } basis = ws.join(' '); }
      const frage = async qq => { try { const r3 = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q: qq, gl: 'de', hl: 'de', num: 10 }), signal: AbortSignal.timeout(7000) }); return r3.ok ? (await r3.json()) : null; } catch (e) { return null; } };
      const js = await Promise.all(['site:idealo.de ' + basis, basis + ' idealo Preisvergleich'].map(frage));
      const orgs = [], sehen = new Set();
      js.forEach(j3 => (Array.isArray(j3 && j3.organic) ? j3.organic : []).forEach(x => { const k = String(x.link || ''); if (!sehen.has(k)) { sehen.add(k); orgs.push(x); } }));
      diagI.roh = orgs.length; diagI.seiten = orgs.filter(x => /idealo\.de\/preisvergleich\/OffersOfProduct\//i.test(String(x.link || ''))).length;
      idl = idealoTreffer({ organic: orgs });
      try {   // Idealos eigene Suche, genau wie im Browser
        const rs = await fetch('https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=' + encodeURIComponent(basis), { headers: { 'User-Agent': 'Mozilla/5.0 (Linux; Android 14; SM-S931B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Mobile Safari/537.36', 'Accept-Language': 'de-DE,de;q=0.9', 'Accept': 'text/html' }, signal: AbortSignal.timeout(7000) });
        if (!rs.ok) diagI.seite = 'HTTP ' + rs.status;
        else { const eg = idealoSeite(await rs.text()); diagI.seite = eg.length + ' Treffer'; const bekannt = new Set(idl.map(x => x.link)); idl = eg.filter(x => !bekannt.has(x.link)).concat(idl).slice(0, 4); }
      } catch (e) { diagI.seite = 'Fehler'; }
    }
    let l = alle.filter(x => !GEBRAUCHT_RX.test(x.shop + ' ' + x.link));
    l = l.concat(idl);   // Gebrauchtes zeigt keine Neupreise und sein Link startet in der APK Jarvis neu
    let ungenau = false;
    if (woerter(q).length >= 3 && l.length) {   // nur bei längeren Suchen prüfen; kurze ("Bosch Akkuschrauber") bleiben wie sie sind
      const gew = gewichte(q, l.map(x => x.titel)), sc = l.map(x => passung(q, x.titel, gew)), best = Math.max.apply(null, sc);
      if (best >= 0.4) {
        l = l.filter((x, i) => sc[i] >= Math.max(best * 0.6, 0.5));
        const comps = bindeWoerter(q);
        if (comps.length >= 2) { const strikt = l.filter(x => kernOk(comps, x.titel)); if (strikt.length) l = strikt; else ungenau = true; }   // streng: Unterscheidendes (Web-Quartier) muss im Angebot stehen
      } else ungenau = true;   // nichts passt wirklich: Ergebnis behalten, aber als ungenau melden
    }
    if (l.length >= 3) {   // Preis-Ausreißer erst NACH der Namensprüfung, sonst fliegt das teure, richtige Produkt raus
      const sorted = l.map(x => x.preis).sort((a, b) => a - b), med = sorted[Math.floor(sorted.length / 2)];
      l = l.filter(x => x.preis >= med * 0.4 && x.preis <= med * 4);
    }
    // Google-Links führen auf eine Einwilligungs-/Anmeldeseite von Google: nur direkte Shop-Links durchreichen, sonst leer (die App nimmt dann eine Preisvergleichs-Suche)
    l.forEach(x => { try { if (/(^|\.)google\./i.test(new URL(x.link).hostname)) x.link = ''; } catch (e) { x.link = ''; } });
    l.forEach(x => { if (MARKTPLATZ_RX.test(x.shop + ' ' + x.link)) x.markt = true; });
    l.sort((a, b) => (a.markt ? 1 : 0) - (b.markt ? 1 : 0) || a.preis - b.preis);   // Marktplätze nie vor normalen Shops
    const normal = l.filter(x => !x.markt), markt = l.filter(x => x.markt);
    const out = { angebote: normal.length ? l.slice(0, 5) : [] };   // nur Marktplätze (OnBuy, easyShop ...): kein "ab"-Preis, sie kommen klein getrennt
    if (!normal.length && markt.length) out.marktplatz = markt.slice(0, 2).map(x => ({ shop: x.shop, preisText: x.preisText, preis: x.preis, titel: x.titel }));
    if (ungenau) out.ungenau = true;
    out.diag = { g: d.shopping.length, k: kern || '', ir: diagI.roh, is: diagI.seiten, ip: idl.length, p: l.length, ih: diagI.seite || '', in: idl.map(x => String(x.titel).slice(0, 45) + ' ' + x.preis) };
    if (ungenau || !normal.length) { const vs = idl.filter(x => !l.some(y => y.link === x.link)); if (vs.length) out.vorschlaege = vs.slice(0, 2).map(x => ({ shop: 'Idealo', titel: x.titel, preis: x.preis, link: x.link })); }
    if (String(req.query.gebraucht || '') === '1') {   // Gebrauchtes getrennt von den Neupreisen (zählt nie für Summe oder Preisalarm)
      const med = l.length ? l.map(x => x.preis).sort((a, b) => a - b)[Math.floor(l.length / 2)] : 0;
      const seen = new Set();
      out.gebraucht = alle.filter(x => GEBRAUCHT_RX.test(x.shop + ' ' + x.link)).concat(ka)
        .filter(x => { try { return !/(^|\.)google\./i.test(new URL(x.link).hostname); } catch (e) { return false; } })   // nur direkte Links (Google-Weiterleitungen führen auf eine Einwilligungsseite)
        .filter(x => !(med && l.length >= 3 && x.preis < med * 0.15))
        .filter(x => { const k = x.link || x.titel; if (seen.has(k)) return false; seen.add(k); return true; })
        .sort((a, b) => a.preis - b.preis).slice(0, 3);
    }
    return res.status(200).json(out);
  } catch (e) {
    return res.status(502).json({ error: 'Preissuche nicht erreichbar' });
  }
}

/* ------------------------------------------------------------------
   Jarvis Studio (Server-Teil, vier Aktionen in dieser Datei, weil Vercel Hobby höchstens 12 Functions erlaubt)
   studio_suche  : Websuche über Serper (SERPER_API_KEY), liefert Titel, Adresse, Kurztext
   studio_seite  : lädt EINE öffentliche Webseite und gibt den lesbaren Text zurück (Schutz gegen Zugriffe auf interne Adressen)
   studio_bau    : legt ein geprüftes Web-Projekt als Branch "studio/<id>" im Bau-Repository ab; dort baut GitHub Actions eine Debug-APK
   studio_status : fragt den Stand dieses Baus ab (Lauf, Fehlerschritt, Download-Adresse der APK)
   Das GitHub-Token (STUDIO_GITHUB_TOKEN) liegt NUR hier als Server-Variable, nie im Browser. Ohne Token antwortet studio_bau ehrlich mit "nicht eingerichtet".
   ------------------------------------------------------------------ */
const STUDIO_ERLAUBT = ['html', 'css', 'js', 'json', 'svg', 'txt', 'md'];
const STUDIO_PFAD_RX = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;
let studioBauLaeuft = false;   // verhindert gleichzeitige Anfragen innerhalb einer Instanz
const studioBauZeiten = [];   // nur Arbeitsspeicher dieser Instanz: weiche Grenze gegen Dauerbau (5 pro Stunde)

function studioPrivat(ip) {
  const a = String(ip || '').toLowerCase();
  if (a.includes(':')) {
    if (a === '::1' || a === '::' || /^f[cd]/.test(a) || /^fe[89ab]/.test(a)) return true;
    const m = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(a);
    if (m) return studioPrivat(m[1]);
    const h = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(a);   // Node schreibt IPv4-in-IPv6 hexadezimal (::ffff:7f00:1)
    if (h) { const hi = parseInt(h[1], 16), lo = parseInt(h[2], 16); return studioPrivat([hi >> 8, hi & 255, lo >> 8, lo & 255].join('.')); }
    return false;
  }
  const t = a.split('.').map(Number);
  if (t.length !== 4 || t.some(n => !(n >= 0 && n <= 255))) return true;
  const [x, y] = t;
  return x === 0 || x === 10 || x === 127 || (x === 169 && y === 254) || (x === 172 && y >= 16 && y <= 31) || (x === 192 && y === 168) || (x === 100 && y >= 64 && y <= 127) || x >= 224;
}
async function studioOeffentlich(u) {
  if (u.protocol !== 'https:') throw new Error('Nur https-Adressen sind erlaubt.');
  if (u.username || u.password) throw new Error('Adressen mit Zugangsdaten sind nicht erlaubt.');
  if (u.port && u.port !== '443') throw new Error('Nur der Standard-Port ist erlaubt.');
  const h = u.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!h || h === 'localhost' || /\.(local|localhost|internal|localdomain|lan|home|corp)$/.test(h)) throw new Error('Interne Adressen sind nicht erlaubt.');
  const istIp = /^[\d.]+$/.test(h) || h.includes(':');
  if (istIp) { if (studioPrivat(h)) throw new Error('Interne Adressen sind nicht erlaubt.'); return; }
  if (!h.includes('.')) throw new Error('Interne Adressen sind nicht erlaubt.');
  const dns = await import('node:dns/promises');
  const adr = await dns.lookup(h, { all: true });
  if (!adr.length || adr.some(x => studioPrivat(x.address))) throw new Error('Interne Adressen sind nicht erlaubt.');
}
function studioText(html) {
  const titel = (/<title[^>]*>([\s\S]*?)<\/title>/i.exec(html) || [])[1] || '';
  const meta = (/<meta[^>]+name=["']description["'][^>]*content=["']([^"']*)["']/i.exec(html) || [])[1] || '';
  let t = html.replace(/<(script|style|noscript|svg|template|iframe|head)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|section|article|br)\s*>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, ' ');
  const ent = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß' };
  const dek = x => x.replace(/&#(\d+);/g, (m, n) => String.fromCharCode(+n)).replace(/&([a-zA-Z]+);/g, (m, n) => (n in ent ? ent[n] : m));
  t = dek(t).replace(/[ \t\f\v ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { titel: dek(titel).replace(/\s+/g, ' ').trim().slice(0, 200), beschreibung: dek(meta).trim().slice(0, 300), text: t };
}
async function studio_suche(req, res) {
  const q = String(req.query.q || '').replace(/\s+/g, ' ').trim().slice(0, 200);
  if (q.length < 3) return res.status(400).json({ error: 'Suchbegriff fehlt' });
  const key = process.env.SERPER_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server: SERPER_API_KEY fehlt' });
  try {
    const r = await fetch('https://google.serper.dev/search', { method: 'POST', headers: { 'X-API-KEY': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ q, gl: 'de', hl: 'de', num: 8 }), signal: AbortSignal.timeout(9000) });
    if (!r.ok) return res.status(502).json({ error: 'Suchdienst antwortet mit ' + r.status });
    const j = await r.json();
    const treffer = (Array.isArray(j.organic) ? j.organic : []).filter(x => /^https:\/\//i.test(String(x.link || ''))).slice(0, 8).map(x => {
      let domain = ''; try { domain = new URL(x.link).hostname.replace(/^www\./, ''); } catch (e) { }
      return { titel: String(x.title || '').slice(0, 160), url: String(x.link), snippet: String(x.snippet || '').slice(0, 300), domain, datum: String(x.date || '') };
    });
    return res.status(200).json({ treffer, abgerufen: new Date().toISOString() });
  } catch (e) { return res.status(502).json({ error: 'Suchdienst nicht erreichbar' }); }
}
async function studio_seite(req, res) {
  let u;
  try { u = new URL(String(req.query.url || '')); } catch (e) { return res.status(400).json({ error: 'Ungültige Adresse' }); }
  try {
    let aktuell = u, r = null;
    for (let i = 0; i < 4; i++) {
      await studioOeffentlich(aktuell);
      r = await fetch(aktuell.href, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0 (compatible; JarvisStudio/1.0)', 'Accept': 'text/html,text/plain,application/xhtml+xml,application/xml;q=0.8' }, signal: AbortSignal.timeout(8000) });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { aktuell = new URL(r.headers.get('location'), aktuell); r = null; continue; }
      break;
    }
    if (!r) return res.status(502).json({ error: 'Zu viele Weiterleitungen' });
    if (!r.ok) return res.status(502).json({ error: 'Seite antwortet mit Status ' + r.status });
    const typ = String(r.headers.get('content-type') || '').toLowerCase();
    if (!/text\/(html|plain|xml)|application\/(xhtml\+xml|xml|json)/.test(typ)) return res.status(415).json({ error: 'Dieser Seitentyp wird nicht gelesen' });
    const MAX = 1500000; let roh = '';
    if (r.body && typeof r.body.getReader === 'function') {
      const rd = r.body.getReader(), dec = new TextDecoder(); let n = 0;
      for (;;) { const { done, value } = await rd.read(); if (done) break; n += value.length; roh += dec.decode(value, { stream: true }); if (n > MAX) { try { await rd.cancel(); } catch (e) { } break; } }
    } else roh = String(await r.text()).slice(0, MAX);
    const x = /html/.test(typ) ? studioText(roh) : { titel: '', beschreibung: '', text: roh.replace(/\s+/g, ' ').trim() };
    const text = x.text.slice(0, 8000);
    const crypto = await import('node:crypto');
    return res.status(200).json({ url: u.href, endadresse: aktuell.href, titel: x.titel, beschreibung: x.beschreibung, text, zeichen: text.length, hash: crypto.createHash('sha256').update(text).digest('hex').slice(0, 16), abgerufen: new Date().toISOString() });
  } catch (e) { return res.status(502).json({ error: String(e && e.message || 'Seite nicht lesbar').slice(0, 160) }); }
}
function studioPruefe(b) {
  const d = b && b.dateien, f = [];
  if (!Array.isArray(d) || !d.length || d.length > 40) return ['Dateiliste fehlt oder hat mehr als 40 Dateien'];
  let sum = 0; const seen = new Set();
  for (const x of d) {
    const p = x && x.pfad, c = x && x.inhalt;
    if (typeof p !== 'string' || !STUDIO_PFAD_RX.test(p) || p.length > 80 || p.includes('..')) { f.push('Ungültiger Dateiname'); continue; }
    if (seen.has(p)) { f.push('Doppelte Datei'); continue; } seen.add(p);
    if (!STUDIO_ERLAUBT.includes(p.split('.').pop())) f.push('Dateityp nicht erlaubt: ' + p);
    if (typeof c !== 'string') { f.push('Inhalt fehlt: ' + p); continue; }
    const n = Buffer.byteLength(c, 'utf8'); sum += n; if (n > 400000) f.push('Datei zu groß: ' + p);
  }
  if (sum > 1200000) f.push('Projekt zu groß');
  if (!seen.has('index.html')) f.push('index.html fehlt');
  return f;
}
async function studioGh(pfad, token, opt) {
  const r = await fetch('https://api.github.com' + pfad, Object.assign({ headers: { 'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', 'User-Agent': 'jarvis-studio', 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(15000) }, opt || {}));
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error('GitHub ' + r.status + ': ' + String(j.message || '').slice(0, 120)); e.status = r.status; throw e; }
  return j;
}
function studioRepo() { const r = String(process.env.STUDIO_BUILD_REPO || 'schroeterdino-jpg/Wo-ist-was-test'); return /^[\w.-]+\/[\w.-]+$/.test(r) ? r : null; }
async function studio_bau(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const token = process.env.STUDIO_GITHUB_TOKEN, repo = studioRepo();
  if (!token || !repo) return res.status(501).json({ fehlt: 'STUDIO_GITHUB_TOKEN', error: 'Der APK-Bau ist auf dem Server noch nicht eingerichtet (Variable STUDIO_GITHUB_TOKEN fehlt).' });
  const b = req.body || {};
  if (b.freigabe !== true) return res.status(400).json({ error: 'Ohne ausdrückliche Freigabe wird nichts gebaut.' });
  const probleme = studioPruefe(b);
  if (probleme.length) return res.status(400).json({ error: 'Projekt abgelehnt: ' + probleme.slice(0, 3).join('; ') });
  const jetzt = Date.now(); while (studioBauZeiten.length && jetzt - studioBauZeiten[0] > 3600000) studioBauZeiten.shift();
  if (studioBauZeiten.length >= 5) return res.status(429).json({ error: 'Höchstens 5 Builds pro Stunde.' });
  if (studioBauLaeuft) return res.status(429).json({ error: 'Es wird gerade ein Bau vorbereitet. Bitte kurz warten.' });
  studioBauLaeuft = true;
  try {
  /* Dauerhafte Grenzen aus GitHub selbst (gelten über alle Server-Instanzen): höchstens 1 offener Bau, höchstens 5 Läufe pro Stunde; prüft zugleich, ob der Workflow auf dem Standard-Branch liegt */
  try {
    const wl = await studioGh('/repos/' + repo + '/actions/workflows/studio-apk.yml/runs?per_page=30', token);
    const laeufe = wl.workflow_runs || [], t0 = Date.now();
    if (laeufe.some(x => x.status !== 'completed')) return res.status(429).json({ error: 'Es läuft oder wartet bereits ein Bau. Erst danach kann der nächste starten.' });
    if (laeufe.filter(x => t0 - Date.parse(x.created_at) < 3600000).length >= 5) return res.status(429).json({ error: 'Höchstens 5 Builds pro Stunde.' });
  } catch (e) {
    if (e && e.status === 404) return res.status(409).json({ error: 'Der Bau-Workflow studio-apk.yml liegt noch nicht auf dem Standard-Branch des Bau-Repositories (nach dem Merge vorhanden).' });
    return res.status(502).json({ error: String(e && e.message || 'GitHub nicht erreichbar').slice(0, 200) });
  }
  const name = String(b.name || 'Jarvis App').replace(/[^A-Za-z0-9ÄÖÜäöüß .-]/g, '').trim().slice(0, 30) || 'Jarvis App';
  const id = 'p' + jetzt.toString(36) + Math.floor(Math.random() * 1296).toString(36).padStart(2, '0');
  const basis = /^[\w./-]{1,60}$/.test(String(process.env.STUDIO_BASE_REF || 'main')) ? String(process.env.STUDIO_BASE_REF || 'main') : 'main';
  try {
    const ref = await studioGh('/repos/' + repo + '/git/ref/heads/' + basis.split('/').map(encodeURIComponent).join('/'), token);
    const c0 = await studioGh('/repos/' + repo + '/git/commits/' + ref.object.sha, token);
    const eintraege = b.dateien.map(x => ({ path: 'studio-projekt/www/' + x.pfad, mode: '100644', type: 'blob', content: x.inhalt }))
      .concat([{ path: 'studio-projekt/meta.json', mode: '100644', type: 'blob', content: JSON.stringify({ id, name, erstellt: new Date(jetzt).toISOString() }) }]);
    const tree = await studioGh('/repos/' + repo + '/git/trees', token, { method: 'POST', body: JSON.stringify({ base_tree: c0.tree.sha, tree: eintraege }) });
    const commit = await studioGh('/repos/' + repo + '/git/commits', token, { method: 'POST', body: JSON.stringify({ message: 'Jarvis Studio: Projekt ' + id + ' (' + name + ')', tree: tree.sha, parents: [ref.object.sha] }) });
    await studioGh('/repos/' + repo + '/git/refs', token, { method: 'POST', body: JSON.stringify({ ref: 'refs/heads/studio/' + id, sha: commit.sha }) });
    studioBauZeiten.push(jetzt);
    return res.status(200).json({ branch: 'studio/' + id, id, commit: commit.sha, repo, basis });
  } catch (e) { return res.status(502).json({ error: String(e && e.message || 'GitHub nicht erreichbar').slice(0, 200) }); }
  } finally { studioBauLaeuft = false; }
}
async function studio_status(req, res) {
  const token = process.env.STUDIO_GITHUB_TOKEN, repo = studioRepo();
  if (!token || !repo) return res.status(501).json({ fehlt: 'STUDIO_GITHUB_TOKEN', error: 'Der APK-Bau ist auf dem Server noch nicht eingerichtet.' });
  const branch = String(req.query.branch || '');
  if (!/^studio\/p[a-z0-9]{6,20}$/.test(branch)) return res.status(400).json({ error: 'Ungültiger Branch' });
  try {
    const l = await studioGh('/repos/' + repo + '/actions/runs?event=push&per_page=5&branch=' + encodeURIComponent(branch), token);
    const lauf = (l.workflow_runs || [])[0];
    if (!lauf) return res.status(200).json({ zustand: 'wartet', hinweis: 'Der Bau ist noch nicht gestartet.' });
    const aus = { run: lauf.id, run_url: lauf.html_url, status: lauf.status, ergebnis: lauf.conclusion || '' };
    if (lauf.status !== 'completed') return res.status(200).json(Object.assign({ zustand: 'laeuft' }, aus));
    if (lauf.conclusion !== 'success') {
      let schritt = '';
      try { const jobs = await studioGh('/repos/' + repo + '/actions/runs/' + lauf.id + '/jobs', token); const st = ((jobs.jobs || [])[0] || {}).steps || []; const bad = st.find(x => x.conclusion === 'failure'); schritt = bad ? String(bad.name) : ''; } catch (e) { }
      return res.status(200).json(Object.assign({ zustand: 'fehlgeschlagen', fehlerSchritt: schritt }, aus));
    }
    const rel = await studioGh('/repos/' + repo + '/releases/tags/studio-' + branch.slice(7), token).catch(() => null);
    const apk = rel && (rel.assets || []).find(x => /\.apk$/.test(x.name));
    if (!apk) return res.status(200).json(Object.assign({ zustand: 'laeuft', hinweis: 'Gebaut, APK wird bereitgestellt.' }, aus));
    return res.status(200).json(Object.assign({ zustand: 'fertig', apk_url: apk.browser_download_url, apk_bytes: apk.size, apk_name: apk.name }, aus));
  } catch (e) { return res.status(502).json({ error: String(e && e.message || 'GitHub nicht erreichbar').slice(0, 200) }); }
}

/* ------------------------------------------------------------------
   Verteiler: prüft zuerst den App-Code (wie bisher in jeder der vier Dateien) und ruft dann die passende Funktion auf
   ------------------------------------------------------------------ */
const ACTIONS = { geocode, reverse, route, overpass, holidays, places, streetview, shopping, studio_suche, studio_seite, studio_bau, studio_status };

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const action = String(req.query.action || '');
  const fn = ACTIONS[action];
  if (!fn) return res.status(400).json({ error: 'Unbekannte Aktion: ' + action });
  return fn(req, res);
}
