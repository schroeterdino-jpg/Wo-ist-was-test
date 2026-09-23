// Fahrzeit-Berechnung über OSRM (Open Source Routing Machine).
// Läuft über den Server, weil der Browser direkte Anfragen an den öffentlichen OSRM-Server oft per CORS blockiert.
export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const { fromLat, fromLon, toLat, toLon } = req.query;
  if (!fromLat || !fromLon || !toLat || !toLon) return res.status(400).json({ error: 'Koordinaten fehlen' });

  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${fromLon},${fromLat};${toLon},${toLat}?overview=false&steps=true`;
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
