export default async function handler(req, res) {
  // --- Schutz: nur die App mit dem richtigen Code darf diese Schnittstelle nutzen ---
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
  const { lat, lng, rad = 5 } = req.query;
  const key = process.env.TANKERKOENIG_API_KEY;
  const url = `https://creativecommons.tankerkoenig.de/json/list.php?lat=${lat}&lng=${lng}&rad=${rad}&sort=dist&type=all&apikey=${key}`;
  const r = await fetch(url);
  const d = await r.json();
  const stations = (d.stations || [])
    .filter(s => s.isOpen)
    .slice(0, 5)
    .map(s => ({
      name: s.brand || s.name,
      strasse: s.street,
      entfernung_km: s.dist,
      diesel: s.diesel,
      e5: s.e5,
      e10: s.e10,
    }));
  res.status(200).json({ stations });
}
