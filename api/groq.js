// api/groq.js
export const config = { maxDuration: 60 };

// Angepasst an dein Vercel-Dashboard
const VECTOR_URL = process.env.UPSTASH_VECTOR_REST_URL || process.env.UPSTASH_REST_URL;
const VECTOR_TOKEN = process.env.UPSTASH_VECTOR_REST_TOKEN || process.env.UPSTASH_REST_TOKEN;

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
  // Angepasst an dein Dashboard: APP_SECRET
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  // Angepasst an dein Dashboard: GROQ_API_KEY
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server: GROQ_API_KEY fehlt' });

  try {
    let incomingBody = { ...req.body };
    const messages = incomingBody.messages || [];
    const userMessage = messages.findLast(m => m.role === 'user');
    
    let contextualMemories = [];
    if (userMessage && userMessage.content) {
      try {
        const searchResult = await vectorFetch('/query', { data: userMessage.content, topK: 3, includeMetadata: true });
        contextualMemories = (searchResult.result || [])
          .filter(m => m.score > 0.65 && m.metadata)
          .map(m => m.metadata.text);
      } catch (vecErr) {
        console.error("Gedächtnis-Abfrage fehlgeschlagen:", vecErr);
      }
    }

    const systemPromptText = `Du bist J.A.R.V.I.S., ein hochentwickelter, autonom denkender KI-Assistent. 
    Antworte absolut frei, dynamisch, hochintelligent und charmant. Du bist kein starrer Bot.
    ${contextualMemories.length > 0 ? `Nutze diese relevanten Erinnerungen an vergangene Gespräche für deine Antwort: \${contextualMemories.join(' | ')}` : ''}
    WICHTIG: Antworte immer im exakten JSON-Format der App: {"reply": "Deine Antwort hier", "actions": []}`;

    const existingSystemIdx = messages.findIndex(m => m.role === 'system');
    if (existingSystemIdx !== -1) {
      messages[existingSystemIdx].content = systemPromptText;
    } else {
      messages.unshift({ role: 'system', content: systemPromptText });
    }

    incomingBody.messages = messages;
    if (!incomingBody.model) {
      incomingBody.model = "llama-3.3-70b-versatile";
    }

    const response = await fetch('https://groq.com', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(incomingBody)
    });

    const rawText = await response.text();
    
    try {
      const parsedData = JSON.parse(rawText);
      const content = parsedData.choices[0].message.content;
      
      try {
        JSON.parse(content);
        return res.status(response.status).json(parsedData);
      } catch(e) {
        parsedData.choices[0].message.content = JSON.stringify({ reply: content.trim(), actions: [] });
        return res.status(response.status).json(parsedData);
      }
    } catch (e) {
      return res.status(200).json({
        choices: [{ message: { content: JSON.stringify({ reply: rawText.replace(/<\/?[^>]+(>|\$)/g, "").trim(), actions: [] }) } }]
      });
    }
  } catch (err) {
    return res.status(500).json({ error: 'Proxy-Fehler: ' + err.message });
  }
}
