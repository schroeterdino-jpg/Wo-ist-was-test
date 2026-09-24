// Bahn- und ÖPNV-Auskunft mit Abfahrts- und Ankunftszeiten.
// Quelle: v6.db.transport.rest - ein freier Dienst der Community (nicht offiziell, ohne Schlüssel), der die Daten der Deutschen Bahn
// (Fern-, Regional- und viele Nahverkehrszüge, teils Busse) mit Verspätungen liefert. Er kann überlastet oder zeitweise nicht erreichbar sein.
// Läuft über den Server, damit der Browser keine Probleme mit fremden Adressen bekommt und die Antwort schlank bleibt.
const BASE = 'https://v6.db.transport.rest';
const cache = new Map();
const CACHE_MS = 2 * 60 * 1000;

async function getJson(path, params, timeoutMs = 8000) {
  const url = BASE + path + '?' + new URLSearchParams(params).toString();
  const r = await fetch(url, { headers: { 'User-Agent': 'AlltagsHelfer/1.0 (privat)', 'Accept': 'application/json' }, signal: AbortSignal.timeout(timeoutMs) });
  if (r.status === 429) throw new Error('Die Bahn-Auskunft ist gerade überlastet, bitte in einer Minute noch einmal.');
  if (!r.ok) {
    let m = '';
    try { m = (await r.json()).message || ''; } catch (e) { /* keine Meldung */ }
    throw new Error('Die Bahn-Auskunft antwortet mit Fehler ' + r.status + (m ? ': ' + m : ''));
  }
  return r.json();
}

function distKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(a));
}

function toPlace(item) {
  if (item.type === 'stop') return { id: item.id, name: item.name };
  const loc = item.location || item;
  const name = item.address || item.name || 'Ort';
  return { latitude: loc.latitude, longitude: loc.longitude, address: name, name };
}

/* Ortsname -> Haltestelle oder Adresse. Bei mehrdeutigen Namen gewinnt ein Treffer in der Nähe von "near" (dem Standort des Users). */
async function resolvePlace(text, near) {
  const variants = [text];
  if (/\s/.test(text) && !/[,-]/.test(text)) variants.push(text.trim().replace(/\s+/g, '-'));   // "Hans Dewitz Ring" -> "Hans-Dewitz-Ring"
  for (const q of variants) {
    const list = await getJson('/locations', { query: q, results: '5', stops: 'true', addresses: 'true', poi: 'false', language: 'de' });
    const items = (Array.isArray(list) ? list : []).filter(x => x && (x.type === 'stop' || x.type === 'location'));
    if (!items.length) continue;
    let best = items[0];
    if (near) {
      const close = items.find(it => {
        const loc = it.location || it;
        return isFinite(loc.latitude) && isFinite(loc.longitude) && distKm(near.lat, near.lng, loc.latitude, loc.longitude) <= 50;
      });
      if (close) best = close;
    }
    return toPlace(best);
  }
  return null;
}

function placeParams(prefix, p) {
  if (p.id) return { [prefix]: p.id };
  return { [prefix + '.latitude']: String(p.latitude), [prefix + '.longitude']: String(p.longitude), [prefix + '.address']: p.address || p.name || 'Ort' };
}

/* Eine Verbindung in die Form, die die App braucht: Losgehen (start), Abfahrt an der ersten Haltestelle, Ankunft, Linien, Umstiege ... */
function mapJourney(j) {
  const legs = j.legs || [];
  const ride = legs.filter(l => !l.walking && !l.transfer && l.line);
  const firstRide = ride[0] || legs[0] || {};
  const lastRide = ride[ride.length - 1] || legs[legs.length - 1] || {};
  const first = legs[0] || {}, last = legs[legs.length - 1] || {};
  const start = first.departure || first.plannedDeparture;
  const abfahrt = firstRide.departure || firstRide.plannedDeparture || start;
  const ankunft = last.arrival || last.plannedArrival;
  return {
    start,
    abfahrt,
    ankunft,
    haltVon: (firstRide.origin && firstRide.origin.name) || '',
    haltNach: (lastRide.destination && lastRide.destination.name) || '',
    gleis: firstRide.departurePlatform || firstRide.plannedDeparturePlatform || null,
    linien: ride.map(l => l.line.name || l.line.fahrtNr || '').filter(Boolean),
    umstiege: Math.max(0, ride.length - 1),
    dauerMin: Math.round((new Date(ankunft) - new Date(start)) / 60000),
    verspaetungMin: firstRide.departureDelay != null ? Math.round(firstRide.departureDelay / 60) : null,
    faelltAus: ride.some(l => l.cancelled === true),
  };
}

const COORD_RE = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

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

  // Ein Ort mit Koordinaten ("hier") ist zugleich die Bezugsposition für mehrdeutige Namen des anderen Endes
  const coord = (raw) => { const m = COORD_RE.exec(raw); return m ? { lat: Number(m[1]), lng: Number(m[2]) } : null; };
  const near = coord(fromRaw) || coord(toRaw);

  const cacheKey = JSON.stringify([fromRaw, toRaw, isArrival, when.toISOString().slice(0, 16)]);
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_MS) return res.status(200).json(hit.data);

  try {
    const [from, to] = await Promise.all([fromRaw, toRaw].map(async raw => {
      const c = coord(raw);
      if (c) return { latitude: c.lat, longitude: c.lng, address: 'Standort', name: 'Standort' };
      const p = await resolvePlace(raw, near);
      if (!p) { const e = new Error(`Den Ort "${raw}" habe ich bei der Bahn-Auskunft nicht gefunden. Nennen Sie Straße und Ort oder eine Haltestelle.`); e.notFound = true; throw e; }
      return p;
    }));

    const base = { ...placeParams('from', from), ...placeParams('to', to), results: '4', stopovers: 'false', remarks: 'false', language: 'de' };
    let journeys = [];
    if (isArrival) {
      try {
        const d = await getJson('/journeys', { ...base, arrival: when.toISOString() });
        journeys = (d.journeys || []).map(mapJourney).filter(j => j.ankunft && new Date(j.ankunft) <= new Date(when.getTime() + 60000));
      } catch (e) { journeys = []; }
      if (!journeys.length) {
        // Manche Zugriffswege können nicht "rückwärts" suchen: dann ab 3 Stunden vorher suchen und die rechtzeitigen herausfiltern
        const d2 = await getJson('/journeys', { ...base, results: '8', departure: new Date(when.getTime() - 3 * 3600000).toISOString() });
        journeys = (d2.journeys || []).map(mapJourney).filter(j => j.ankunft && new Date(j.ankunft) <= new Date(when.getTime() + 60000));
      }
      journeys.sort((a, b) => new Date(b.abfahrt) - new Date(a.abfahrt));   // die späteste Abfahrt, die noch rechtzeitig ankommt, zuerst
    } else {
      const d = await getJson('/journeys', { ...base, departure: when.toISOString() });
      journeys = (d.journeys || []).map(mapJourney).filter(j => j.abfahrt && j.ankunft);
    }
    const data = { von: from.name, nach: to.name, journeys: journeys.slice(0, 3) };
    if (data.journeys.length) cache.set(cacheKey, { t: Date.now(), data });
    return res.status(200).json(data);
  } catch (e) {
    return res.status(e.notFound ? 404 : 502).json({ error: e.message });
  }
}
