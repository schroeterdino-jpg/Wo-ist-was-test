// api/groq.js
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
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // --- Gedächtnis-Aktionen (store / retrieve) ---
  if (req.body && req.body.action) {
    const { action, text, id } = req.body;
    try {
      if (action === 'store') {
        if (!text) return res.status(400).json({ error: 'Kein Text' });
        const vectorId = id || 'mem_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        await vectorFetch('/upsert', { id: vectorId, data: text, metadata: { text: text, timestamp: Date.now() } });
        return res.status(200).json({ success: true, id: vectorId });
      }
      if (action === 'retrieve') {
        if (!text) return res.status(400).json({ error: 'Kein Suchtext' });
        const result = await vectorFetch('/query', { data: text, topK: 4, includeMetadata: true });
        const memories = (result.result || []).filter(m => m.score > 0.6 && m.metadata).map(m => m.metadata.text);
        return res.status(200).json({ memories });
      }
      return res.status(400).json({ error: 'Ungültige Aktion' });
    } catch (e) {
      return res.status(502).json({ error: e.message });
    }
  }

  // --- Normale KI-Abfrage an Groq ---
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server: GROQ_API_KEY fehlt' });

  try {
    const response = await fetch('https://groq.com', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });

    const rawText = await response.text();
    
    // Falls Groq direkt JSON liefert, leiten wir es einfach weiter
    try {
      const parsedData = JSON.parse(rawText);
      return res.status(response.status).json(parsedData);
    } catch (e) {
      // Sicherheitsnetz: Falls Groq rohen Text statt JSON gesendet hat, verpacken wir ihn sauber
      return res.status(200).json({
        choices: [{
          message: {
            content: JSON.stringify({ reply: rawText.trim(), actions: [] })
          }
        }]
      });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Proxy-Fehler: ' + err.message });
  }
}
