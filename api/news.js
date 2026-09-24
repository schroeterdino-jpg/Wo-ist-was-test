// Aktuelle Nachrichten zu einem Land, einer Region oder einer Stadt (für die Weltkugel).
// Quellen (beide kostenlos, ohne Schlüssel, gleichzeitig abgefragt):
//   1. tagesschau.de (offizielle Such-API der ARD): Schlagzeilen MIT Bild
//   2. Google News (RSS): breitere Abdeckung, Schlagzeile und Quelle, aber ohne Bild
// GDELT wird nicht mehr genutzt: Der Dienst blockt Anfragen von gemeinsam genutzten Servern (Vercel) sehr oft mit "429 Please limit requests".
// Läuft über den Server, damit der Browser keine Probleme mit fremden Adressen (CORS) bekommt.

const NAMED_ENTITIES = { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ', auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß', ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»', eacute: 'é', egrave: 'è' };
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&([a-zA-Z]+);/g, (m, name) => (name in NAMED_ENTITIES ? NAMED_ENTITIES[name] : m))
    .replace(/\s+/g, ' ').trim();
}

const MAX_AGE_DAYS = 7;          // ältere Meldungen nur, wenn es sonst kaum etwas gibt
const CACHE_MS = 10 * 60 * 1000; // gleiche Frage innerhalb von 10 Minuten wird nicht neu abgefragt (schont die Dienste)
const cache = new Map();

/* ---------- tagesschau.de ---------- */
async function fetchTagesschau(q) {
  const url = 'https://www.tagesschau.de/api2u/search/?searchText=' + encodeURIComponent(q) + '&pageSize=12&resultPage=0';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlltagsHelfer/1.0)', 'Accept': 'application/json' }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('tagesschau Status ' + r.status);
  const data = await r.json();
  const out = [];
  for (const it of (data.searchResults || [])) {
    if (!['story', 'webview', 'video'].includes(it.type)) continue;
    const title = decodeEntities(it.title);
    const link = it.shareURL || it.detailsweb;
    if (!title || !/^https?:\/\//i.test(link || '')) continue;
    const variants = (it.teaserImage && it.teaserImage.imageVariants) || {};
    const image = variants['16x9-384'] || variants['16x9-256'] || variants['16x9-512'] || Object.values(variants).find(v => /^https:\/\//.test(v)) || '';
    const d = it.date ? new Date(it.date) : null;
    out.push({ title, url: link, domain: 'tagesschau.de', date: d && !isNaN(d) ? d.toISOString() : null, image: /^https:\/\//.test(image) ? image : '' });
  }
  return out;
}

/* ---------- Google News (RSS) ---------- */
function tagContent(block, name) {
  const m = new RegExp('<' + name + '(?:\\s[^>]*)?>([\\s\\S]*?)</' + name + '>').exec(block);
  return m ? m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1') : '';
}

async function fetchGoogleNews(q) {
  const url = 'https://news.google.com/rss/search?q=' + encodeURIComponent(q + ' when:2d') + '&hl=de&gl=DE&ceid=DE:de';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AlltagsHelfer/1.0)' }, signal: AbortSignal.timeout(6000) });
  if (!r.ok) throw new Error('Google News Status ' + r.status);
  const xml = await r.text();
  const out = [];
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  for (const block of items.slice(0, 20)) {
    let title = decodeEntities(tagContent(block, 'title'));
    const link = decodeEntities(tagContent(block, 'link'));
    const source = decodeEntities(tagContent(block, 'source'));
    if (source && title.endsWith(' - ' + source)) title = title.slice(0, -(source.length + 3)).trim();
    if (!title || !/^https?:\/\//i.test(link)) continue;
    const d = new Date(tagContent(block, 'pubDate'));
    out.push({ title, url: link, domain: source || 'news.google.com', date: isNaN(d) ? null : d.toISOString(), image: '' });
  }
  return out;
}

/* Beide Quellen zusammenführen: doppelte Titel raus, Meldungen mit Bild zuerst (bis zu drei), der Rest nach Datum */
function merge(lists) {
  const seen = new Set();
  const all = [];
  for (const it of lists.flat()) {
    const key = it.title.toLowerCase().replace(/[^a-zäöüß0-9]/g, '').slice(0, 40);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(it);
  }
  const ts = (x) => (x.date ? new Date(x.date).getTime() : 0);
  const limit = Date.now() - MAX_AGE_DAYS * 86400000;
  let fresh = all.filter(x => ts(x) >= limit);
  if (fresh.length < 3) fresh = all;            // sonst lieber ältere zeigen als nichts
  fresh.sort((a, b) => ts(b) - ts(a));
  const withImage = fresh.filter(x => x.image).slice(0, 3);
  const rest = fresh.filter(x => !withImage.includes(x));
  return [...withImage, ...rest].slice(0, 10);
}

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const q = String(req.query.q || '').replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
  if (q.length < 3) return res.status(400).json({ error: 'Suchbegriff fehlt' });

  const cacheKey = q.toLowerCase();
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.t < CACHE_MS) return res.status(200).json(hit.data);

  const [ts, gn] = await Promise.allSettled([fetchTagesschau(q), fetchGoogleNews(q)]);
  const articles = merge([ts.status === 'fulfilled' ? ts.value : [], gn.status === 'fulfilled' ? gn.value : []]);
  const problems = [];
  if (ts.status === 'rejected') problems.push(String(ts.reason && ts.reason.message || ts.reason));
  if (gn.status === 'rejected') problems.push(String(gn.reason && gn.reason.message || gn.reason));

  const data = { articles, fehler: articles.length ? null : (problems.join('; ') || null), quellen: { tagesschau: ts.status === 'fulfilled' ? ts.value.length : -1, google: gn.status === 'fulfilled' ? gn.value.length : -1 } };
  if (articles.length) cache.set(cacheKey, { t: Date.now(), data });   // Fehler und leere Ergebnisse werden nicht gemerkt
  return res.status(200).json(data);
}
