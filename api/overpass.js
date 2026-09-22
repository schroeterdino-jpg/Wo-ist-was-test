// Restaurant-/Lokale-Suche über OpenStreetMap (Overpass API).
// Läuft über den Server, weil der öffentliche Overpass-Server Anfragen aus dem Browser oft per CORS blockiert.
export const config = { maxDuration: 30 };

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const query = req.body && req.body.query;
  if (!query) return res.status(400).json({ error: 'Keine Overpass-Abfrage angegeben' });

  try {
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': 'MeinAlltagsHelfer/1.0 (privates Projekt, kein kommerzieller Einsatz)'
      },
      body: 'data=' + encodeURIComponent(query)
    });
    const text = await response.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return res.status(502).json({ error: 'Overpass antwortete nicht mit JSON: ' + text.slice(0, 200) });
    }
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy-Fehler: ' + err.message });
  }
}
