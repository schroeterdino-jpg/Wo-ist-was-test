// Tankstellen für die Strecken-Abfrage: liefert ALLE geöffneten Tankstellen im Umkreis mit Lage und Preisen.
// Die App filtert daraus die Tankstellen nahe an der Fahrstrecke (Tankerkönig kann nur im Kreis suchen, nicht entlang einer Linie).
// Wichtig: Tankerkönig erlaubt nur etwa eine Anfrage pro Minute und höchstens 25 km Radius - darum gibt es pro Frage genau EINE Anfrage
// und ein Zwischenspeicher, damit gleiche Fragen kurz hintereinander keine neue Anfrage auslösen.
// Preise: Tankerkönig.de (CC BY 4.0), Daten der Markttransparenzstelle für Kraftstoffe.
const cache = new Map();
const CACHE_MS = 5 * 60 * 1000;

const num = (v) => (typeof v === 'number' && isFinite(v) && v > 0 ? v : null);

export default async function handler(req, res) {
  // --- Schutz: nur die App mit dem richtigen Code darf diese Schnittstelle nutzen ---
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const key = process.env.TANKER_API_KEY || process.env.TANKERKOENIG_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server: Tankerkönig-Schlüssel fehlt (Variable TANKER_API_KEY)' });

  const lat = Number(req.query.lat), lng = Number(req.query.lng);
  let rad = Number(req.query.rad || 10);
  if (!isFinite(lat) || !isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return res.status(400).json({ error: 'Koordinaten fehlen oder sind ungültig' });
  if (!isFinite(rad)) rad = 10;
  rad = Math.min(25, Math.max(1, rad));

  const cacheKey = `${lat.toFixed(2)},${lng.toFixed(2)},${Math.round(rad)}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_MS) return res.status(200).json({ stations: hit.stations, zwischengespeichert: true });

  try {
    const url = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${lat}&lng=${lng}&rad=${rad}&sort=dist&type=all&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    if (d.ok === false) return res.status(502).json({ error: 'Tankerkönig meldet: ' + (d.message || 'unbekannter Fehler') });
    const stations = (d.stations || [])
      .filter(s => s.isOpen && isFinite(Number(s.lat)) && isFinite(Number(s.lng)))
      .map(s => ({
        id: s.id,
        name: s.brand || s.name,
        strasse: [s.street, s.houseNumber].filter(Boolean).join(' '),
        ort: s.place || '',
        lat: Number(s.lat),
        lng: Number(s.lng),
        diesel: num(s.diesel),
        e5: num(s.e5),
        e10: num(s.e10),
      }));
    cache.set(cacheKey, { t: Date.now(), stations });
    res.status(200).json({ stations });
  } catch (e) {
    res.status(502).json({ error: 'Tankerkönig nicht erreichbar: ' + e.message });
  }
}
