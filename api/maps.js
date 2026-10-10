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
   Verteiler: prüft zuerst den App-Code (wie bisher in jeder der vier Dateien) und ruft dann die passende Funktion auf
   ------------------------------------------------------------------ */
const ACTIONS = { geocode, reverse, route, overpass, holidays, places };

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const action = String(req.query.action || '');
  const fn = ACTIONS[action];
  if (!fn) return res.status(400).json({ error: 'Unbekannte Aktion: ' + action });
  return fn(req, res);
}
