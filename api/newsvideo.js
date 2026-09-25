// Nachrichtenvideo zu einem Ort als Rückfall, wenn /api/news kein passendes Tagesschau-Video findet
// (das kommt oft vor: Tagesschau hat nur zu wenigen Themen ein Video). Sucht bei YouTube nach aktuellen
// Nachrichten-Clips zu dem Ort und gibt die einbettbaren zurück (gleiche Grundlage wie /api/youtubelive).
// Braucht bei Vercel die Variable YOUTUBE_API_KEY (dieselbe wie bei /api/youtubelive).
const cache = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;
const MAX_AGE_DAYS = 4;   // nur wirklich aktuelle Clips, sonst lieber keins

function niceError(err) {
  const reason = (err.errors && err.errors[0] && err.errors[0].reason) || '';
  const msg = String(err.message || '');
  if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded' || /quota/i.test(msg)) return 'Das Tageslimit der YouTube-Suche ist erreicht. Morgen geht es wieder.';
  if (reason === 'accessNotConfigured' || /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return 'Die YouTube Data API v3 ist im Google-Projekt noch nicht aktiviert.';
  if (reason === 'keyInvalid' || /API key not valid|API_KEY_INVALID/i.test(msg)) return 'Der YouTube-Schlüssel ist ungültig.';
  return 'YouTube meldet: ' + msg.slice(0, 160);
}

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return res.status(500).json({ error: 'Server: YouTube-Schlüssel fehlt (Variable YOUTUBE_API_KEY)' });

  const q = String(req.query.q || '').replace(/["()<>]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (q.length < 2) return res.status(400).json({ error: 'Ort fehlt' });

  const cacheKey = q.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_MS) return res.status(200).json({ items: hit.items, zwischengespeichert: true });

  try {
    const publishedAfter = new Date(Date.now() - MAX_AGE_DAYS * 86400000).toISOString();
    const params = new URLSearchParams({
      part: 'snippet', type: 'video', videoEmbeddable: 'true', order: 'date', maxResults: '10',
      relevanceLanguage: 'de', safeSearch: 'moderate', publishedAfter, q: `${q} Nachrichten aktuell`, key
    });
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + params.toString(), { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    if (d.error) return res.status(502).json({ error: niceError(d.error) });

    const items = (d.items || [])
      .filter(i => i.id && i.id.videoId && i.snippet)
      .map(i => {
        const title = String(i.snippet.title || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        const channel = String(i.snippet.channelTitle || '');
        const t = i.snippet.thumbnails || {};
        return { videoId: i.id.videoId, title, channel, thumb: (t.medium || t.default || {}).url || '', publishedAt: i.snippet.publishedAt || null };
      });

    if (items.length) cache.set(cacheKey, { t: Date.now(), items });
    res.status(200).json({ items });
  } catch (e) {
    res.status(502).json({ error: 'YouTube nicht erreichbar: ' + e.message });
  }
}
