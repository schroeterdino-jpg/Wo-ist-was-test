// Adress-Suche (Geocoding) über OpenStreetMap/Nominatim.
// Läuft über den Server, weil der Browser direkte Anfragen an Nominatim oft per CORS blockiert.
export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

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
