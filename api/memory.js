// Semantisches Langzeit-Gedächtnis (Upstash Vector, mit eingebautem Embedding-Modell - kein zusätzlicher
// Embedding-Anbieter wie OpenAI nötig, Upstash übernimmt das serverseitig).
// Zwei Aktionen über denselben Endpunkt (spart eine der 12 möglichen Serverless Functions):
//   POST { action: 'store',  text, metadata? }        -> legt einen neuen Fakt ab
//   POST { action: 'search', query, topK? }            -> findet die bedeutungsähnlichsten gespeicherten Fakten
// Ersetzt den bisherigen Dummy, der hier stand (war ungenutzt, kein Aufrufer im Code gefunden).
export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return res.status(500).json({ error: 'Server: UPSTASH_VECTOR_REST_URL/TOKEN fehlen' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const action = String(body.action || '').toLowerCase();
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  try {
    if (action === 'store') {
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return res.status(400).json({ error: 'Text fehlt' });
      const id = body.id ? String(body.id) : `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const metadata = Object.assign({ datum: new Date().toISOString() }, body.metadata || {});

      const r = await fetch(`${url}/upsert-data`, {
        method: 'POST', headers,
        body: JSON.stringify({ id, data: text, metadata }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });
      return res.status(200).json({ ok: true, id });
    }

    if (action === 'search') {
      const query = String(body.query || '').trim().slice(0, 500);
      if (!query) return res.status(400).json({ error: 'Suchtext fehlt' });
      const topK = Math.min(20, Math.max(1, Number(body.topK) || 5));
      // Normalerweise nur eng passende Treffer (0.75) - bei pauschalen Fragen ("Was weißt du über mich?")
      // kann der Aufrufer per 'minScore' eine niedrigere Schwelle verlangen, um mehr/alles zu bekommen.
      const minScore = Math.min(0.95, Math.max(0, typeof body.minScore === 'number' ? body.minScore : 0.75));

      const r = await fetch(`${url}/query-data`, {
        method: 'POST', headers,
        body: JSON.stringify({ data: query, topK, includeMetadata: true, includeData: true }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });

      const treffer = (d.result || [])
        .filter(x => typeof x.score === 'number' && x.score >= minScore)
        .map(x => ({ text: x.data, score: x.score, metadata: x.metadata || {} }));
      return res.status(200).json({ treffer });
    }

    return res.status(400).json({ error: 'Unbekannte Aktion (erwartet: store oder search)' });
  } catch (e) {
    return res.status(502).json({ error: 'Upstash nicht erreichbar: ' + e.message });
  }
}
