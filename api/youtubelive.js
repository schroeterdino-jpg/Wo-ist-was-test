// Live-Kameras zu einem Ort: sucht bei YouTube nach Live-Streams ("Rom live cam") und gibt die einbettbaren zurück.
// Braucht bei Vercel die Variable YOUTUBE_API_KEY (Google-Konsole, YouTube Data API v3).
// Google erlaubt in der kostenlosen Stufe nur etwa 100 Suchen pro Tag - darum werden Ergebnisse 6 Stunden zwischengespeichert.
const cache = new Map();
const CACHE_MS = 6 * 60 * 60 * 1000;

const GOOD = /cam|webcam|kamera|skyline|panorama|livestream|live ?stream|view|city|stadt|beach|strand|harbou?r|hafen|street|square|platz|bridge|brücke|airport|flughafen|port\b/i;
const BAD = /news|nachrichten|radio|music|musik|lofi|lo-fi|gaming|game|casino|slots|podcast|church|sermon|gottesdienst|reaction|tv\b/i;

function niceError(err) {
  const reason = (err.errors && err.errors[0] && err.errors[0].reason) || '';
  const status = String(err.status || '');
  const msg = String(err.message || '');
  if (reason === 'quotaExceeded' || reason === 'rateLimitExceeded' || /quota/i.test(msg)) return 'Das Tageslimit der YouTube-Suche ist erreicht. Morgen geht es wieder.';
  if (reason === 'accessNotConfigured' || /has not been used|is disabled|SERVICE_DISABLED/i.test(msg)) return 'Die YouTube Data API v3 ist im Google-Projekt noch nicht aktiviert.';
  if (reason === 'keyInvalid' || /API key not valid|API_KEY_INVALID/i.test(msg) || status === 'INVALID_ARGUMENT') return 'Der YouTube-Schlüssel ist ungültig.';
  if (/referer|referrer|IP address|restrict/i.test(msg)) return 'Der YouTube-Schlüssel ist eingeschränkt (Website oder IP) und darf vom Server nicht genutzt werden.';
  return 'YouTube meldet: ' + msg.slice(0, 160);
}

export default async function handler(req, res) {
  // --- Schutz: nur die App mit dem richtigen Code darf diese Schnittstelle nutzen ---
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
    const params = new URLSearchParams({
      part: 'snippet', type: 'video', eventType: 'live', videoEmbeddable: 'true', maxResults: '12',
      safeSearch: 'moderate', q: `${q} live cam`, key
    });
    const r = await fetch('https://www.googleapis.com/youtube/v3/search?' + params.toString(), { signal: AbortSignal.timeout(8000) });
    const d = await r.json();
    if (d.error) return res.status(502).json({ error: niceError(d.error) });

    const words = q.toLowerCase().split(' ').filter(w => w.length > 2);
    const items = (d.items || [])
      .filter(i => i.id && i.id.videoId && i.snippet && i.snippet.liveBroadcastContent === 'live')
      .map((i, idx) => {
        const title = String(i.snippet.title || '').replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
        const channel = String(i.snippet.channelTitle || '');
        const hay = `${title} ${channel}`;
        let score = 0;
        if (GOOD.test(hay)) score += 2;
        if (words.some(w => hay.toLowerCase().includes(w))) score += 1;
        if (BAD.test(hay)) score -= 3;
        const t = i.snippet.thumbnails || {};
        return { videoId: i.id.videoId, title, channel, thumb: (t.medium || t.default || {}).url || '', score, idx };
      })
      .sort((a, b) => b.score - a.score || a.idx - b.idx);
    // Nachrichten, Musik und Ähnliches nur zeigen, wenn es sonst gar nichts gibt
    const brauchbar = items.filter(i => i.score >= 0);
    const finale = (brauchbar.length ? brauchbar : items).slice(0, 8).map(({ videoId, title, channel, thumb }) => ({ videoId, title, channel, thumb }));

    if (finale.length) cache.set(cacheKey, { t: Date.now(), items: finale });
    res.status(200).json({ items: finale });
  } catch (e) {
    res.status(502).json({ error: 'YouTube nicht erreichbar: ' + e.message });
  }
}
