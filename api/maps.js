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
   route: Fahrzeit-Berechnung über OSRM (Open Source Routing Machine).
   Mit ?geometry=1 kommt zusätzlich der (vereinfachte) Linienverlauf der Route mit, den die HUD-Karte zeichnet.
   ------------------------------------------------------------------ */
async function route(req, res) {
  const { fromLat, fromLon, toLat, toLon, geometry } = req.query;
  if (!fromLat || !fromLon || !toLat || !toLon) return res.status(400).json({ error: 'Koordinaten fehlen' });

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
   Verteiler: prüft zuerst den App-Code (wie bisher in jeder der vier Dateien) und ruft dann die passende Funktion auf
   ------------------------------------------------------------------ */
const ACTIONS = { geocode, reverse, route, overpass, holidays };

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const action = String(req.query.action || '');
  const fn = ACTIONS[action];
  if (!fn) return res.status(400).json({ error: 'Unbekannte Aktion: ' + action });
  return fn(req, res);
}
