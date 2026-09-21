export default async function handler(req, res) {
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
