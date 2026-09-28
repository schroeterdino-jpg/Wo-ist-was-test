// api/memory.js
// Speicher und Abruf für das KI-Langzeitgedächtnis über Upstash Vector.
export const config = { maxDuration: 15 };

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

      const result = await vectorFetch('/query', {
        data: text,
        topK: 4,
        includeMetadata: true
      });

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
