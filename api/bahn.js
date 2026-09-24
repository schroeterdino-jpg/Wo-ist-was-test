// Bus- und Bahn-Auskunft mit Abfahrts- und Ankunftszeiten.
// Quelle: Transitous (api.transitous.org, MOTIS 2) - ein offenes Gemeinschaftsprojekt, das die Fahrplandaten vieler Verkehrsunternehmen
// (Bahn, S-/U-Bahn, Straßenbahn, Bus) sammelt und nach Ankunftszeit rückwärts suchen kann. Ehrenamtlich betrieben, ohne Garantie.
// Nutzungsbedingungen von Transitous: nur für freie, nicht kommerzielle Projekte, wenig Anfragen, Zwischenspeicher, echter User-Agent mit Kontakt,
// Datenquellen sichtbar nennen (https://transitous.org/sources/). Adressen kommen von OpenStreetMap (Nominatim).
const TRANSITOUS = 'https://api.transitous.org';
const CONTACT = process.env.BAHN_CONTACT || 'https://github.com/schroeterdino-jpg/Wo-ist-was-test';
const UA = `AlltagsHelfer/1.0 (privates Hobbyprojekt, nicht kommerziell; Kontakt: ${CONTACT})`;

export const config = { maxDuration: 25 };

const planCache = new Map();
const geoCache = new Map();
const PLAN_CACHE_MS = 2 * 60 * 1000;
const GEO_CACHE_MS = 30 * 60 * 1000;
const STEP_TIMEOUT_MS = 6000;

async function getJson(url, timeoutMs = STEP_TIMEOUT_MS) {
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept': 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (r.status === 429) throw new Error('Die Auskunft ist gerade überlastet, bitte in einer Minute noch einmal.');
  if (!r.ok) {
    let m = '';
    try { m = (await r.text()).slice(0, 120).replace(/\s+/g, ' '); } catch (e) { /* keine Meldung */ }
    throw new Error('Die Auskunft antwortet mit Fehler ' + r.status + (m ? ': ' + m : ''));
  }
  return r.json();
}

function distKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

const COORD_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;
const STREETY_RE = /\d|(?:straße|strasse|str\.|weg|allee|ring|damm|chaussee|ufer|gasse|steig|pfad)\b/i;
const STATION_RE = /(hbf|hauptbahnhof|bahnhof|\bbf\b|haltestelle|\bzob\b|station)/i;

/* Ort -> { place: "lat,lon" oder Haltestellen-ID, name }. Bei mehrdeutigen Namen gewinnt ein Treffer in der Nähe von "near". */
async function resolvePlace(text, near) {
  const c = COORD_RE.exec(text);
  if (c) return { place: `${Number(c[1])},${Number(c[2])}`, name: 'Standort' };

  const key = text.toLowerCase() + '|' + (near ? near.lat.toFixed(1) + ',' + near.lng.toFixed(1) : '');
  const hit = geoCache.get(key);
  if (hit && Date.now() - hit.t < GEO_CACHE_MS) return hit.v;

  const variants = [text];
  if (/\s/.test(text) && !/[,-]/.test(text)) variants.push(text.trim().replace(/\s+/g, '-'));   // "Hans Dewitz Ring" -> "Hans-Dewitz-Ring"
  const addressLike = STREETY_RE.test(text) && !STATION_RE.test(text);
  let found = null;
  let geoErrors = 0;

  for (const q of variants) {
    const params = new URLSearchParams({ text: q, language: 'de' });
    if (near) params.set('place', `${near.lat},${near.lng}`);
    let list = [];
    try { list = await getJson(`${TRANSITOUS}/api/v1/geocode?${params}`); } catch (e) { list = []; geoErrors++; }
    list = (Array.isArray(list) ? list : []).filter(x => x && isFinite(x.lat) && isFinite(x.lon));
    if (!list.length) continue;
    const rank = (x) => (x.type === 'STOP' ? (addressLike ? 1 : 0) : x.type === 'ADDRESS' ? (addressLike ? 0 : 1) : 2);
    list.sort((a, b) => rank(a) - rank(b));
    let best = list[0];
    if (near) {
      const close = list.filter(x => rank(x) === rank(list[0])).find(x => distKm(near.lat, near.lng, x.lat, x.lon) <= 60);
      if (close) best = close;
    }
    found = best.type === 'STOP' && best.id ? { place: best.id, name: best.name } : { place: `${best.lat},${best.lon}`, name: best.name || text };
    break;
  }

  if (!found) {
    // Straßen und Adressen, die Transitous nicht kennt: OpenStreetMap
    try {
      const params = new URLSearchParams({ q: text, format: 'json', limit: '1', countrycodes: 'de,at,ch,nl,dk,pl,cz,fr,be,lu' });
      const arr = await getJson(`https://nominatim.openstreetmap.org/search?${params}`, 5000);
      if (Array.isArray(arr) && arr[0] && isFinite(arr[0].lat) && isFinite(arr[0].lon)) {
        found = { place: `${Number(arr[0].lat)},${Number(arr[0].lon)}`, name: String(arr[0].display_name || text).split(',').slice(0, 2).join(',').trim() };
      }
    } catch (e) { geoErrors++; }
  }
  if (!found && geoErrors > 0) throw new Error('Die Ortssuche der Auskunft antwortet gerade nicht, bitte gleich noch einmal versuchen.');
  if (found) geoCache.set(key, { t: Date.now(), v: found });
  return found;
}

const NON_TRANSIT = new Set(['WALK', 'BIKE', 'RENTAL', 'CAR', 'CAR_PARKING', 'CAR_DROPOFF', 'ODM', 'FLEX']);

function lineName(leg) {
  const n = String(leg.routeShortName || leg.displayName || leg.routeLongName || '').trim();
  if (!n) return '';
  if (/^\d+[A-Za-z]?$/.test(n)) return (leg.mode === 'TRAM' ? 'Tram ' : leg.mode === 'BUS' ? 'Bus ' : '') + n;   // reine Nummern: "Bus 7"
  return n;
}

/* Eine Verbindung in die Form, die die App braucht: Losgehen (start), Abfahrt an der ersten Haltestelle, Ankunft, Linien, Umstiege ... */
function mapItinerary(it) {
  const legs = it.legs || [];
  const ride = legs.filter(l => !NON_TRANSIT.has(l.mode));
  const first = ride[0] || legs[0] || {}, last = ride[ride.length - 1] || legs[legs.length - 1] || {};
  const start = it.startTime || (legs[0] && legs[0].startTime);
  const abfahrt = first.startTime || (first.from && first.from.departure) || start;
  const ankunft = it.endTime || (legs[legs.length - 1] && legs[legs.length - 1].endTime);
  const sched = first.scheduledStartTime || (first.from && first.from.scheduledDeparture);
  const delay = (first.startTime && sched) ? Math.round((new Date(first.startTime) - new Date(sched)) / 60000) : null;
  return {
    start,
    abfahrt,
    ankunft,
    haltVon: (first.from && first.from.name) || '',
    haltNach: (last.to && last.to.name) || '',
    gleis: (first.from && (first.from.track || first.from.scheduledTrack)) || null,
    linien: ride.map(lineName).filter(Boolean),
    umstiege: Number.isFinite(it.transfers) ? it.transfers : Math.max(0, ride.length - 1),
    dauerMin: Math.round((new Date(ankunft) - new Date(start)) / 60000),
    verspaetungMin: delay,
    faelltAus: ride.some(l => l.cancelled === true),
  };
}

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const q = req.query;
  const fromRaw = String(q.from || '').trim().slice(0, 100), toRaw = String(q.to || '').trim().slice(0, 100);
  if (!fromRaw) return res.status(400).json({ error: 'Der Startort fehlt.' });
  if (!toRaw) return res.status(400).json({ error: 'Das Ziel fehlt.' });
  const isArrival = !!q.arrival;
  const when = new Date(q.arrival || q.departure || Date.now());
  if (isNaN(when.getTime())) return res.status(400).json({ error: 'Die Uhrzeit ist ungültig.' });

  // Ein Ort mit Koordinaten ("hier") ist zugleich die Bezugsposition für mehrdeutige Namen am anderen Ende
  const coord = (raw) => { const m = COORD_RE.exec(raw); return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null; };
  const near = coord(fromRaw) || coord(toRaw);

  const cacheKey = JSON.stringify([fromRaw, toRaw, isArrival, when.toISOString().slice(0, 16)]);
  const hit = planCache.get(cacheKey);
  if (hit && Date.now() - hit.t < PLAN_CACHE_MS) return res.status(200).json(hit.data);

  try {
    const [from, to] = await Promise.all([fromRaw, toRaw].map(async raw => {
      const p = await resolvePlace(raw, near);
      if (!p) { const e = new Error(`Den Ort "${raw}" habe ich nicht gefunden. Nennen Sie Straße und Ort oder eine Haltestelle.`); e.notFound = true; throw e; }
      return p;
    }));

    const params = new URLSearchParams({ fromPlace: from.place, toPlace: to.place, time: when.toISOString(), arriveBy: String(isArrival), numItineraries: '4', language: 'de' });
    const d = await getJson(`${TRANSITOUS}/api/v5/plan?${params}`, 9000);
    let journeys = (d.itineraries || []).map(mapItinerary).filter(j => j.abfahrt && j.ankunft);
    if (isArrival) {
      journeys = journeys.filter(j => new Date(j.ankunft) <= new Date(when.getTime() + 60000));
      journeys.sort((a, b) => new Date(b.abfahrt) - new Date(a.abfahrt));   // die späteste Abfahrt, die noch rechtzeitig ankommt, zuerst
    } else {
      journeys.sort((a, b) => new Date(a.abfahrt) - new Date(b.abfahrt));
    }
    const data = { von: from.name, nach: to.name, journeys: journeys.slice(0, 3), quelle: 'Transitous.org' };
    if (data.journeys.length) planCache.set(cacheKey, { t: Date.now(), data });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.notFound ? 404 : 502).json({ error: e.message });
  }
}
