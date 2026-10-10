// api/groq.js
// Einfache, saubere Weiterleitung an die echte Groq-Schnittstelle. Der System-Prompt kommt komplett von
// der App selbst (assistant.js) und wird hier NICHT verändert - das Gedächtnis (Upstash Vector) läuft
// separat und korrekt über api/memory.js, dafür ist diese Datei nicht mehr zuständig.
export const config = { maxDuration: 60 };

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_STT_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server: GROQ_API_KEY fehlt' });

  // Spracherkennung mit Groq Whisper: die App schickt eine kurze Aufnahme (Base64) und bekommt den Text zurück.
  // Läuft über diese Datei mit, damit im Vercel-Ordner api/ keine zusätzliche Function nötig ist (Hobby: höchstens 12).
  if (req.body && req.body.stt) {
    try {
      const b = req.body;
      const buf = Buffer.from(String(b.audio || ''), 'base64');
      if (buf.length < 1000) return res.status(400).json({ error: 'Aufnahme zu kurz oder leer' });
      if (buf.length > 3500000) return res.status(413).json({ error: 'Aufnahme zu lang' });
      const mime = String(b.mime || 'audio/webm').split(';')[0];
      const ext = /mp4|m4a|aac/.test(mime) ? 'm4a' : /ogg/.test(mime) ? 'ogg' : /wav/.test(mime) ? 'wav' : 'webm';
      const form = new FormData();
      form.append('file', new Blob([buf], { type: mime }), 'audio.' + ext);
      form.append('model', process.env.WHISPER_MODEL || 'whisper-large-v3-turbo');
      if (/^[a-z]{2}$/.test(String(b.language || ''))) form.append('language', b.language);
      if (b.prompt) form.append('prompt', String(b.prompt).slice(0, 700));
      form.append('response_format', 'json');
      form.append('temperature', '0');
      const r = await fetch(GROQ_STT_URL, { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}` }, body: form });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status).json({ error: (d && d.error && (d.error.message || d.error)) || ('Whisper Status ' + r.status) });
      return res.status(200).json({ text: String(d.text || '').trim() });
    } catch (err) {
      return res.status(502).json({ error: 'Whisper nicht erreichbar: ' + err.message });
    }
  }

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
