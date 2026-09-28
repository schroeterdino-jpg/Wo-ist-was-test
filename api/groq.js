// api/groq.js
// Kombinierte API: Übernimmt die normale Groq-KI-Abfrage UND das Upstash Vector Langzeitgedächtnis
export const config = { maxDuration: 60 };

const VECTOR_URL = process.env.UPSTASH_VECTOR_REST_URL;
const VECTOR_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN;

async function vectorFetch(path, body) {
  const r = await fetch(`${VECTOR_URL}${path}`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${VECTOR_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error(`Upstash Vector Fehler: ${r.status}`);
  return r.json();
}

export default async function handler(req, res) {
  // 1. Schutz: nur deine App darf diese Schnittstelle nutzen
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- FALL A: Das Gedächtnis wird aufgerufen (action steht im Body) ---
  if (req.body && req.body.action) {
    const { action, text, id } = req.body;
    try {
      if (action === 'store') {
        if (!text) return res.status(400).json({ error: 'Kein Text zum Speichern angegeben' });
        const vectorId = id || 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await vectorFetch('/upsert', {
          id: vectorId,
          data: text,
          metadata: { text: text, timestamp: Date.now() }
        });
        return res.status(200).json({ success: true, id: vectorId });
      }

      if (action === 'retrieve') {
        if (!text) return res.status(400).json({ error: 'Kein Suchtext angegeben' });
        const result = await vectorFetch('/query', { data: text, topK: 4, includeMetadata: true });
        const memories = (result.result || [])
          .filter(match => match.score > 0.6 && match.metadata)
          .map(match => match.metadata.text);
        return res.status(200).json({ memories });
      }
      return res.status(400).json({ error: 'Ungültige Aktion' });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  // --- FALL B: Normale KI-Abfrage (Bestehende Groq-Logik) ---
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server: GROQ_API_KEY fehlt' });

  try {
    const response = await fetch('https://groq.com', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const text = await response.text();
    let data;
    try { data = JSON.parse(text); } catch (e) {
      return res.status(502).json({ error: 'Groq antwortete nicht mit JSON: ' + text.slice(0, 200) });
    }
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(500).json({ error: 'Proxy-Fehler: ' + err.message });
  }
}
