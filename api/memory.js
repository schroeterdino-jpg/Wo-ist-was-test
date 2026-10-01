// Semantisches Langzeit-Gedächtnis (Upstash Vector, mit eingebautem Embedding-Modell - kein zusätzlicher
// Embedding-Anbieter wie OpenAI nötig, Upstash übernimmt das serverseitig).
// Aktionen über denselben Endpunkt (spart eine der 12 möglichen Serverless Functions):
//   POST { action: 'store',  text, metadata? }   -> legt einen neuen Fakt ab
//   POST { action: 'search', query, topK?, minScore? } -> findet die bedeutungsähnlichsten gespeicherten Fakten
//   POST { action: 'list', limit?, prefix? }      -> listet Fakten direkt auf, ohne Ähnlichkeits-Vergleich
//   GET  ?action=reflect                          -> NUR vom täglichen Cronjob aufgerufen (vercel.json),
//                                                     nicht vom Client - Jarvis' "Unterbewusstsein"
// Ersetzt den bisherigen Dummy, der hier stand (war ungenutzt, kein Aufrufer im Code gefunden).
export default async function handler(req, res) {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return res.status(500).json({ error: 'Server: UPSTASH_VECTOR_REST_URL/TOKEN fehlen' });
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

  // Der tägliche Cronjob ruft diese Route per GET auf (Vercel kann Cronjobs nur per GET auslösen) - abgesichert
  // über CRON_SECRET, das Vercel bei gesetzter Umgebungsvariable automatisch im Authorization-Header mitschickt.
  // Komplett getrennt von der normalen App-Absicherung (APP_SECRET/x-app-key) weiter unten.
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
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const action = String(body.action || '').toLowerCase();

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

    if (action === 'list') {
      // Listet gespeicherte Fakten direkt auf, OHNE Ähnlichkeits-Vergleich - für pauschale Fragen
      // ("Was weißt du über mich?"), bei denen es keinen inhaltlichen Anhaltspunkt zum Vergleichen gibt.
      // Optional 'prefix': nur Einträge mit diesem ID-Präfix (z.B. 'insight_' für die täglichen Erkenntnisse).
      const limit = Math.min(30, Math.max(1, Number(body.limit) || 15));
      // Großzügiger abfragen als angefordert (range liefert nicht zwingend die neuesten zuerst), dann nach
      // Datum sortiert die gewünschte Anzahl zurückgeben - sonst würden mit der Zeit ältere Fakten die
      // neueren aus der Liste verdrängen.
      const rangeBody = { cursor: '0', limit: Math.max(limit, 60), includeMetadata: true, includeData: true };
      if (body.prefix) rangeBody.prefix = String(body.prefix);
      const r = await fetch(`${url}/range`, {
        method: 'POST', headers,
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

    return res.status(400).json({ error: 'Unbekannte Aktion (erwartet: store, search oder list)' });
  } catch (e) {
    return res.status(502).json({ error: 'Upstash nicht erreichbar: ' + e.message });
  }
}

/* --- "Unterbewusstsein": läuft einmal täglich übern Cronjob (vercel.json), nicht vom Client aufgerufen.
   Holt die gespeicherten Fakten, lässt Groq nach auffälligen Mustern/offenen Themen suchen, und ersetzt die
   bisherigen "Erkenntnisse" (id-Präfix 'insight_') durch die neuen - nie mehr als die vom aktuellen Tag,
   damit sich nichts anhäuft und nichts veraltet im Gespräch auftaucht. --- */
async function reflectAndStore(url, headers, res) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return res.status(500).json({ error: 'Server: GROQ_API_KEY fehlt' });

  try {
    const rangeRes = await fetch(`${url}/range`, {
      method: 'POST', headers,
      body: JSON.stringify({ cursor: '0', limit: 40, includeMetadata: true, includeData: true }),
      signal: AbortSignal.timeout(8000)
    });
    const rangeData = await rangeRes.json();
    if (!rangeRes.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (rangeData.error || JSON.stringify(rangeData)) });

    const alleVektoren = (rangeData.result && rangeData.result.vectors) || [];
    const fakten = alleVektoren.filter(v => !String(v.id).startsWith('insight_')).map(v => v.data).filter(Boolean);

    // Alte Erkenntnisse IMMER zuerst löschen (ersetzen statt anhäufen) - auch wenn heute nichts Neues gefunden wird
    await fetch(`${url}/delete`, { method: 'DELETE', headers, body: JSON.stringify({ prefix: 'insight_' }) }).catch(() => {});

    if (fakten.length < 3) return res.status(200).json({ ok: true, erkenntnis: null, grund: 'zu wenige Fakten gespeichert' });

    const reflexionsPrompt =
      "Du bist das Unterbewusstsein von Jarvis, dem persönlichen Assistenten des Users. Hier sind gesammelte Fakten und Erinnerungen über ihn:\n" +
      fakten.map(f => '- ' + f).join('\n') + "\n\n" +
      "Analysiere diese Daten. Gibt es unerledigte Themen, auffällige Muster oder etwas, das sich für ein beiläufiges, warmherziges Nachfragen im nächsten Gespräch eignet? " +
      "Erfinde NICHTS dazu, bleib strikt bei dem, was oben tatsächlich steht - keine Vermutungen, die nicht durch die Fakten gedeckt sind. " +
      "Falls ja: Antworte NUR mit maximal 2 kurzen, natürlich formulierten Sätzen (je ein Satz pro Zeile), die Jarvis beiläufig ins nächste Gespräch einbauen könnte - keine Einleitung, keine Anführungszeichen, keine Nummerierung. " +
      "Falls nichts Sinnvolles auffällt: Antworte NUR mit dem einzelnen Wort KEINE_ERKENNTNIS.";

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'openai/gpt-oss-120b', messages: [{ role: 'user', content: reflexionsPrompt }] }),
      signal: AbortSignal.timeout(30000)
    });
    const groqData = await groqRes.json();
    if (!groqRes.ok) return res.status(502).json({ error: 'Groq meldet: ' + JSON.stringify(groqData).slice(0, 300) });

    const antwort = ((groqData.choices && groqData.choices[0] && groqData.choices[0].message.content) || '').trim();
    if (!antwort || antwort.toUpperCase().includes('KEINE_ERKENNTNIS')) {
      return res.status(200).json({ ok: true, erkenntnis: null });
    }

    const zeilen = antwort.split('\n').map(s => s.trim()).filter(Boolean).slice(0, 2);
    for (let i = 0; i < zeilen.length; i++) {
      await fetch(`${url}/upsert-data`, {
        method: 'POST', headers,
        body: JSON.stringify({ id: `insight_${Date.now()}_${i}`, data: zeilen[i], metadata: { datum: new Date().toISOString(), typ: 'insight' } }),
        signal: AbortSignal.timeout(8000)
      }).catch(() => {});
    }
    return res.status(200).json({ ok: true, erkenntnisse: zeilen });
  } catch (e) {
    return res.status(502).json({ error: 'Reflexion fehlgeschlagen: ' + e.message });
  }
}
