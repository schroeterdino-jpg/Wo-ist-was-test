// Verkehrsmeldungen (Stau, Baustellen), Webcams UND Sprachausgabe (OpenAI + Edge-TTS) - alles in EINER
// Datei, weil Vercel im kostenlosen Hobby-Plan höchstens 12 Serverless Functions pro Deployment erlaubt.
// Kein API-Schlüssel nötig für Verkehr/Webcams. Sprachausgabe: OpenAI (gpt-4o-mini-tts, sehr natürlich,
// kostenpflichtig) ist die bevorzugte Stimme, fällt bei jedem Problem (kein Guthaben, Ausfall, kein
// Schlüssel gesetzt) automatisch und sofort auf die kostenlose Edge-TTS-Stimme zurück - ohne dass der
// Client das überhaupt merkt oder einen zweiten Versuch starten muss.
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

async function edgeTtsBuffer(text, voice) {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
  const { audioStream } = await tts.toStream(text);
  const chunks = [];
  for await (const chunk of audioStream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  // ---------- Sprachausgabe: ?tts=1&text=...&voice=de-DE-ConradNeural&engine=openai&openaiVoice=alloy ----------
  if (req.query.tts) {
    const text = String(req.query.text || '').slice(0, 2000);
    if (!text) return res.status(400).json({ error: 'Text fehlt' });
    const voice = String(req.query.voice || 'de-DE-ConradNeural').replace(/[^a-zA-Z0-9-]/g, '');
    const engine = String(req.query.engine || 'edge');

    if (engine === 'openai') {
      const openaiKey = process.env.OPENAI_API_KEY;
      if (openaiKey) {
        try {
          const openaiVoice = String(req.query.openaiVoice || 'alloy').replace(/[^a-zA-Z]/g, '');
          const oaRes = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: openaiVoice, input: text, response_format: 'mp3' }),
            signal: AbortSignal.timeout(20000)
          });
          if (oaRes.ok) {
            const buf = Buffer.from(await oaRes.arrayBuffer());
            if (buf.length) {
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('Cache-Control', 'no-store');
              return res.status(200).send(buf);
            }
          }
          // Antwort nicht ok oder leer -> unten automatisch auf Edge-TTS weiter
        } catch (e) { /* OpenAI nicht erreichbar/Timeout -> unten automatisch auf Edge-TTS weiter */ }
      }
      // Kein Schlüssel gesetzt oder OpenAI fehlgeschlagen: fällt durch zu Edge-TTS unten, kein Fehler nach außen
    }

    try {
      const buffer = await edgeTtsBuffer(text, voice);
      if (!buffer.length) return res.status(502).json({ error: 'Keine Audiodaten erhalten' });
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(buffer);
    } catch (err) {
      return res.status(502).json({ error: 'Edge-TTS fehlgeschlagen: ' + String(err && err.message || err) });
    }
  }

  // ---------- Verkehr/Webcams: ?road=A1 ----------
  const road = String(req.query.road || '').trim().toUpperCase();
  if (!/^A\d{1,3}$/.test(road)) return res.status(400).json({ error: 'Ungültige Autobahn-Nummer' });

  try {
    const [warningsRes, roadworksRes, webcamRes] = await Promise.all([
      fetch(`https://verkehr.autobahn.de/o/autobahn/${road}/services/warning`),
      fetch(`https://verkehr.autobahn.de/o/autobahn/${road}/services/roadworks`),
      fetch(`https://verkehr.autobahn.de/o/autobahn/${road}/services/webcam`)
    ]);
    const warnings = warningsRes.ok ? await warningsRes.json() : { warning: [] };
    const roadworks = roadworksRes.ok ? await roadworksRes.json() : { roadworks: [] };
    const webcams = webcamRes.ok ? await webcamRes.json() : { webcam: [] };
    return res.status(200).json({
      warning: warnings.warning || [],
      roadworks: roadworks.roadworks || [],
      webcam: webcams.webcam || []
    });
  } catch (err) {
    return res.status(500).json({ error: 'Proxy-Fehler: ' + err.message });
  }
}
