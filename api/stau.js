// Verkehrsmeldungen (Stau, Baustellen), Webcams UND Sprachausgabe (Edge-TTS) - alles in EINER Datei,
// weil Vercel im kostenlosen Hobby-Plan höchstens 12 Serverless Functions pro Deployment erlaubt.
// Kein API-Schlüssel nötig für Verkehr/Webcams. Die Sprachausgabe nutzt dieselben kostenlosen
// Microsoft-"Neural"-Stimmen wie die "Laut vorlesen"-Funktion im Edge-Browser (über das Community-
// Paket "msedge-tts", das dieselbe Verbindung nachbaut - keine offizielle Microsoft-API, kann sich
// also theoretisch mal ändern; die App fällt in dem Fall automatisch auf die Handy-eigene Stimme zurück).
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  // ---------- Sprachausgabe (Edge-TTS): ?tts=1&text=...&voice=de-DE-ConradNeural ----------
  if (req.query.tts) {
    const text = String(req.query.text || '').slice(0, 2000);
    if (!text) return res.status(400).json({ error: 'Text fehlt' });
    const voice = String(req.query.voice || 'de-DE-ConradNeural').replace(/[^a-zA-Z0-9-]/g, '');
    try {
      const tts = new MsEdgeTTS();
      await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
      const { audioStream } = await tts.toStream(text);
      const chunks = [];
      for await (const chunk of audioStream) chunks.push(chunk);
      const buffer = Buffer.concat(chunks);
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
