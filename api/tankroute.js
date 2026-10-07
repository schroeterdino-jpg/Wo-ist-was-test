export default async function handler(req, res) {
  // --- Schutz: nur die App mit dem richtigen Code darf diese Schnittstelle nutzen (wie bei tank.js) ---
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
  const { lat, lng } = req.query;
  // Tankerkönig erlaubt höchstens 25 km Umkreis
  const rad = Math.min(25, Math.max(1, parseFloat(req.query.rad) || 10));
  const key = process.env.TANKER_API_KEY || process.env.TANKERKOENIG_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server: Tankerkönig-Schlüssel fehlt (Variable TANKER_API_KEY)' });
  if (!lat || !lng) return res.status(400).json({ error: 'Koordinaten fehlen' });
  try {
    const url = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${encodeURIComponent(lat)}&lng=${encodeURIComponent(lng)}&rad=${encodeURIComponent(rad)}&sort=dist&type=all&apikey=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    const d = await r.json();
    if (d.ok === false) return res.status(502).json({ error: 'Tankerkönig meldet: ' + (d.message || 'unbekannter Fehler') });
    // Anders als tank.js: ALLE geöffneten Tankstellen im Kreis, mit Koordinaten (die App filtert danach die an der Strecke)
    const stations = (d.stations || [])
      .filter(s => s.isOpen && typeof s.lat === 'number' && typeof s.lng === 'number')
      .map(s => ({
        name: s.brand || s.name,
        strasse: [s.street, s.houseNumber].filter(Boolean).join(' ').trim(),
        ort: s.place || '',
        lat: s.lat,
        lng: s.lng,
        entfernung_km: s.dist,
        diesel: s.diesel,
        e5: s.e5,
        e10: s.e10,
      }));
    res.status(200).json({ stations });
  } catch (e) {
    res.status(502).json({ error: 'Tankerkönig nicht erreichbar: ' + e.message });
  }
}
