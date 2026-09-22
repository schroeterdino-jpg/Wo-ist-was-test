// Restaurant-/Lokale-Suche über OpenStreetMap (Overpass API).
// Läuft über den Server, weil der öffentliche Overpass-Server Anfragen aus dem Browser oft per CORS blockiert.
// Diese kostenlosen, öffentlichen Server sind manchmal überlastet oder langsam. Deshalb werden mehrere
// unabhängige Server GLEICHZEITIG angefragt, und der erste, der antwortet, gewinnt - das hält die Wartezeit
// kurz (statt sie bei mehreren Versuchen nacheinander aufzuaddieren).
export const config = { maxDuration: 45 };

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

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
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
