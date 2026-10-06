// Semantisches Langzeit-Gedächtnis (Upstash Vector, mit eingebautem Embedding-Modell - kein zusätzlicher 
// Embedding-Anbieter wie OpenAI nötig, Upstash übernimmt das serverseitig).
// Aktionen über denselben Endpunkt (spart eine der 12 möglichen Serverless Functions):
// POST { action: 'store', text, metadata? } -> legt einen neuen Fakt ab
// POST { action: 'search', query, topK?, minScore? } -> findet die bedeutungsähnlichsten gespeicherten Fakten
// POST { action: 'list', limit?, prefix? } -> listet Fakten direkt auf, ohne Ähnlichkeits-Vergleich
// GET ?action=reflect -> NUR vom täglichen Cronjob aufgerufen (vercel.json), 
// nicht vom Client - Jarvis' "Unterbewusstsein"

export default async function handler(req, res) {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;

  if (!url || !token) return res.status(500).json({ error: 'Server: UPSTASH_VECTOR_REST_URL/TOKEN fehlen' });

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // Der tägliche Cronjob ruft diese Route per GET auf
  if (req.method === 'GET' && req.query && req.query.action === 'reflect') {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return res.status(500).json({ error: 'Server: CRON_SECRET fehlt' });
    if ((req.headers['authorization'] || '') !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Nicht erlaubt' });
    return reflectAndStore(url, headers, res);
  }

  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const action = String(body.action || '').toLowerCase();

  try {
    if (action === 'store') {
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return res.status(400).json({ error: 'Text fehlt' });

      const id = body.id ? String(body.id) : `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const metadata = Object.assign({ datum: new Date().toISOString() }, body.metadata || {});

      const r = await fetch(`${url}/upsert-data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, data: text, metadata }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });

      return res.status(200).json({ ok: true, id });
    }

    if (action === 'list') {
      const limit = Math.min(30, Math.max(1, Number(body.limit) || 15));
      const rangeBody = { cursor: '0', limit: Math.max(limit, 60), includeMetadata: true, includeData: true };
      if (body.prefix) rangeBody.prefix = String(body.prefix);

      const r = await fetch(`${url}/range`, {
        method: 'POST',
        headers,
        body: JSON.stringify(rangeBody),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });

      const treffer = ((d.result && d.result.vectors) || [])
        .map(v => ({ text: v.data, metadata: v.metadata || {} }))
        .sort((a, b) => new Date(b.metadata.datum || 0) - new Date(a.metadata.datum || 0))
        .slice(0, limit);

      return res.status(200).json({ treffer });
    }

    if (action === 'search') {
      const query = String(body.query || '').trim().slice(0, 500);
      if (!query) return res.status(400).json({ error: 'Suchtext fehlt' });

      const topK = Math.min(20, Math.max(1, Number(body.topK) || 5));
      const minScore = Number(body.minScore) || 0.0; // Optionaler Schwellenwert für Relevanz

      const r = await fetch(`${url}/query-data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ 
          data: query, 
          topK: topK, 
          includeMetadata: true, 
          includeData: true 
        }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });

      // Ergebnisse filtern und formatieren
      const treffer = ((d.result) || [])
        .filter(v => v.score >= minScore)
        .map(v => ({
          text: v.data,
          score: v.score,
          metadata: v.metadata || {}
        }));

      return res.status(200).json({ treffer });
    }

    return res.status(400).json({ error: `Unbekannte Aktion: ${action}` });

  } catch (error) {
    return res.status(500).json({ error: 'Interner Serverfehler: ' + error.message });
  }
}

// Hilfsfunktion für das "Unterbewusstsein" (Cronjob-Reflektion)
async function reflectAndStore(url, headers, res) {
  try {
    // 1. Hole die letzten 50 Einträge aus der Datenbank
    const r = await fetch(`${url}/range`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cursor: '0', limit: 50, includeMetadata: true, includeData: true }),
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    if (!r.ok) return res.status(502).json({ error: 'Cron: Upstash-Fehler beim Laden: ' + JSON.stringify(d) });

    const eintraege = ((d.result && d.result.vectors) || []).map(v => v.data);
    
    if (eintraege.length === 0) {
      return res.status(200).json({ ok: true, message: 'Keine Daten zum Reflektieren vorhanden.' });
    }

    // 2. Hier wird die eigentliche LLM-Reflektion angestoßen. 
    // Da kein externer LLM-Anbieter im Code definiert ist, erstellen wir eine strukturierte Übersicht.
    const insightText = `Tägliche Reflektion vom ${new Date().toLocaleDateString('de-DE')}. Analysierte Fakten: ${eintraege.length}.`;
    
    // 3. Speichere die neue Erkenntnis mit dem Präfix 'insight_' ab
    const insightId = `insight_${Date.now()}`;
    const storeResponse = await fetch(`${url}/upsert-data`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        id: insightId,
        data: insightText,
        metadata: { datum: new Date().toISOString(), typ: 'cron_reflection' }
      }),
      signal: AbortSignal.timeout(8000)
    });

    if (!storeResponse.ok) return res.status(502).json({ error: 'Cron: Fehler beim Speichern der Erkenntnis.' });

    return res.status(200).json({ ok: true, message: 'Reflektion erfolgreich durchgeführt und gespeichert.', id: insightId });
  } catch (error) {
    return res.status(500).json({ error: 'Fehler in reflectAndStore: ' + error.message });
  }
}
