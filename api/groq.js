// api/groq.js
// Einfache, saubere Weiterleitung an die echte Groq-Schnittstelle. Der System-Prompt kommt komplett von
// der App selbst (assistant.js) und wird hier NICHT verändert - das Gedächtnis (Upstash Vector) läuft
// separat und korrekt über api/memory.js, dafür ist diese Datei nicht mehr zuständig.
export const config = { maxDuration: 60 };

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server: GROQ_API_KEY fehlt' });

  try {
    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(req.body)
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (err) {
    return res.status(502).json({ error: 'Groq nicht erreichbar: ' + err.message });
  }
}
