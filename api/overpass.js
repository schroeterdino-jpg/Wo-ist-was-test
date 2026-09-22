// Restaurant-/Lokale-Suche über OpenStreetMap (Overpass API).
// Läuft über den Server, weil der öffentliche Overpass-Server Anfragen aus dem Browser oft per CORS blockiert.
// Der Hauptserver (overpass-api.de) ist ein kostenloser, öffentlicher Dienst und manchmal überlastet oder langsam.
// Deshalb wird bei einem Fehler oder Zeitüberschreitung automatisch ein zweiter, unabhängiger Server probiert.
export const config = { maxDuration: 45 };

const SERVERS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.private.coffee/api/interpreter'
];
const PER_SERVER_TIMEOUT_MS = 13000;

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
    if (!response.ok) return { ok: false, reason: 'Status ' + response.status };
    let data;
    try {
      data = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'kein JSON (' + text.slice(0, 80).replace(/\s+/g, ' ') + ')' };
    }
    return { ok: true, data };
  } catch (err) {
    return { ok: false, reason: err.name === 'AbortError' ? 'Zeitüberschreitung' : err.message };
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

  const errors = [];
  for (const url of SERVERS) {
    const result = await tryServer(url, query);
    if (result.ok) return res.status(200).json(result.data);
    errors.push(new URL(url).hostname + ': ' + result.reason);
  }
  return res.status(502).json({ error: 'Alle Kartendienste haben gerade nicht geantwortet (' + errors.join('; ') + ').' });
}
