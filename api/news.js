// Aktuelle Nachrichten zu einem Land, einer Region oder einer Stadt (für die Weltkugel).
// Quelle: GDELT (kostenlos, ohne Schlüssel). Liefert deutschsprachige Artikel der letzten Stunden mit Titel, Link und - wenn vorhanden - Bild.
// Läuft über den Server, damit der Browser keine Probleme mit fremden Adressen (CORS) bekommt.
const NAMED_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è' };
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m))
    .replace(/\s+/g, ' ').trim();
}

// GDELT schreibt Zeiten als 20260924T053000Z
function gdeltDate(s) {
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(String(s || ''));
  return m ? `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z` : null;
}

async function fetchGdelt(term, span, timeoutMs) {
  const query = `${term} sourcelang:german`;
  const url = 'https://api.gdeltproject.org/api/v2/doc/doc?query=' + encodeURIComponent(query) +
    `&mode=artlist&maxrecords=25&format=json&sort=hybridrel&timespan=${span}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'AlltagsHelfer/1.0' }, signal: AbortSignal.timeout(timeoutMs) });
  const text = await r.text();
  try {
    const data = JSON.parse(text);
    return { articles: Array.isArray(data.articles) ? data.articles : [] };
  } catch (e) {
    // GDELT antwortet bei Überlastung oder zu vielen Anfragen mit einem Klartext statt JSON
    return { articles: [], error: text.slice(0, 120).replace(/\s+/g, ' ') };
  }
}

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const q = String(req.query.q || '').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (q.length < 3) return res.status(400).json({ error: 'Suchbegriff fehlt' });
  const term = /\s/.test(q) ? `"${q}"` : q;

  const started = Date.now();
  let articles = [];
  let fehler = null;
  try {
    let result = await fetchGdelt(term, '24h', 6000);
    articles = result.articles;
    fehler = result.error || null;
    // Zu wenig in den letzten 24 Stunden: die letzten drei Tage nehmen (nur, wenn noch Zeit übrig ist)
    if (articles.length < 3 && Date.now() - started < 4000) {
      result = await fetchGdelt(term, '72h', 9000 - (Date.now() - started));
      if (result.articles.length > articles.length) articles = result.articles;
      fehler = result.error || fehler;
    }
  } catch (err) {
    fehler = 'Nachrichtendienst nicht erreichbar: ' + err.message;
  }

  // Aufräumen: doppelte Titel raus, Bilder nur über https
  const seen = new Set();
  const cleaned = [];
  for (const a of articles) {
    const title = decodeEntities(a.title);
    if (!title || !/^https?:\/\//i.test(a.url || '')) continue;
    const key = title.toLowerCase().slice(0, 50);
    if (seen.has(key)) continue;
    seen.add(key);
    let image = String(a.socialimage || '').trim();
    if (image.startsWith('http://')) image = 'https://' + image.slice(7);
    if (!/^https:\/\//i.test(image)) image = '';
    cleaned.push({ title, url: a.url, domain: String(a.domain || ''), date: gdeltDate(a.seendate), image });
  }

  return res.status(200).json({ articles: cleaned.slice(0, 10), fehler: cleaned.length ? null : fehler });
}
