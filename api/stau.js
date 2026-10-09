// Verkehrsmeldungen (Stau, Baustellen), Webcams UND Sprachausgabe (Fish Audio + OpenAI + Edge-TTS) - alles in EINER
// Datei, weil Vercel im kostenlosen Hobby-Plan höchstens 12 Serverless Functions pro Deployment erlaubt.
// Kein API-Schlüssel nötig für Autobahn-Verkehr/Webcams (Stadtverkehr über TomTom: Variable TOMTOM_API_KEY). Sprachausgabe, in dieser Reihenfolge:
//   1. Fish Audio (engine=fish; Schlüssel FISH_AUDIO_API_KEY, Stimme FISH_AUDIO_VOICE_ID oder ?fishVoice=..., Modell FISH_AUDIO_MODEL, Standard s2-pro)
//   2. OpenAI (gpt-4o-mini-tts, sehr natürlich, kostenpflichtig; Schlüssel OPENAI_API_KEY)
//   3. Edge-TTS (kostenlos, kein Schlüssel)
// Bei jedem Problem einer Stufe (kein Schlüssel, kein Guthaben, Ausfall, Zeitüberschreitung) geht es automatisch und sofort mit der nächsten weiter,
// ohne dass der Client das überhaupt merkt oder einen zweiten Versuch starten muss.
// Fish Audio bekommt den Text mit Tags in eckigen Klammern (z.B. [chuckle] für ein leichtes Kichern); für OpenAI und Edge werden sie entfernt.
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

  // ---------- Sprachausgabe: ?tts=1&text=...&voice=de-DE-ConradNeural&engine=fish|openai|edge&fishVoice=...&openaiVoice=alloy ----------
  if (req.query.tts) {
    const text = String(req.query.text || '').slice(0, 2400);
    if (!text) return res.status(400).json({ error: 'Text fehlt' });
    const voice = String(req.query.voice || 'de-DE-ConradNeural').replace(/[^a-zA-Z0-9-]/g, '');
    const engine = String(req.query.engine || 'edge');
    // Fish Audio versteht Anweisungen in eckigen Klammern (z.B. [chuckle]). OpenAI und Edge würden sie wörtlich vorlesen, darum dort ohne.
    const plainText = text.replace(/\[[A-Za-zÄÖÜäöüß ]{1,40}\]\s*/g, '').trim() || text;

    if (engine === 'fish') {
      const fishKey = process.env.FISH_AUDIO_API_KEY;
      const fdiag = req.query.diag === '1';
      if (!fishKey) {
        if (fdiag) return res.status(200).json({ engineUsed: 'none', error: 'Server: FISH_AUDIO_API_KEY fehlt - fällt normalerweise lautlos auf OpenAI/Edge-TTS zurück' });
      } else {
        const voiceId = String(req.query.fishVoice || process.env.FISH_AUDIO_VOICE_ID || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
        const model = String(process.env.FISH_AUDIO_MODEL || 's2-pro').replace(/[^a-zA-Z0-9._-]/g, '') || 's2-pro';
        try {
          const body = { text, format: 'mp3' };
          if (voiceId) body.reference_id = voiceId;
          const fRes = await fetch('https://api.fish.audio/v1/tts', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${fishKey}`, 'Content-Type': 'application/json', 'model': model },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000)   // das kostenlose Modell ist manchmal langsam: Fish Audio bekommt Zeit, statt dass mitten drin eine andere Stimme einspringt
          });
          if (fRes.ok) {
            const buf = Buffer.from(await fRes.arrayBuffer());
            if (buf.length) {
              if (fdiag) return res.status(200).json({ engineUsed: 'fish', ok: true, bytes: buf.length, model, voice: voiceId || '(Standardstimme, keine Stimmen-ID gesetzt)' });
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('X-Voice-Engine', 'fish');
              res.setHeader('Cache-Control', 'no-store');
              return res.status(200).send(buf);
            }
            if (fdiag) return res.status(200).json({ engineUsed: 'none', error: 'Fish Audio lieferte eine leere Antwort' });
          } else {
            const errText = await fRes.text().catch(() => '');
            if (fdiag) return res.status(200).json({ engineUsed: 'none', error: `Fish Audio meldet Status ${fRes.status}: ${errText.slice(0, 300)}`, model, voice: voiceId || '(Standardstimme)' });
          }
          // Antwort nicht ok oder leer -> unten automatisch auf OpenAI/Edge-TTS weiter (nur im Normalbetrieb, nicht im Diagnose-Modus)
        } catch (e) {
          if (fdiag) return res.status(200).json({ engineUsed: 'none', error: 'Fish Audio nicht erreichbar: ' + String(e && e.message || e) });
          /* Fish Audio nicht erreichbar/Timeout -> unten automatisch auf OpenAI/Edge-TTS weiter */
        }
      }
    }

    // fishOnly=1: Die App schickt lange Texte in Stücken und will für jedes Stück dieselbe Fish-Stimme. Klappt Fish Audio nicht, wird NICHT still mit einer
    // anderen Stimme geantwortet (das gäbe einen Stimmenwechsel mitten im Text), sondern ein Fehler gemeldet; die App entscheidet dann selbst.
    if (engine === 'fish' && req.query.fishOnly === '1') return res.status(503).json({ error: 'Fish Audio nicht verfügbar' });

    if (engine === 'openai' || engine === 'fish') {
      const openaiKey = process.env.OPENAI_API_KEY;
      const diag = engine === 'openai' && req.query.diag === '1';
      if (!openaiKey) {
        if (diag) return res.status(200).json({ engineUsed: 'none', error: 'Server: OPENAI_API_KEY fehlt - fällt normalerweise lautlos auf Edge-TTS zurück' });
      } else {
        try {
          const openaiVoice = String(req.query.openaiVoice || 'alloy').replace(/[^a-zA-Z]/g, '');
          const oaRes = await fetch('https://api.openai.com/v1/audio/speech', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gpt-4o-mini-tts', voice: openaiVoice, input: plainText, response_format: 'mp3' }),
            signal: AbortSignal.timeout(20000)
          });
          if (oaRes.ok) {
            const buf = Buffer.from(await oaRes.arrayBuffer());
            if (buf.length) {
              if (diag) return res.status(200).json({ engineUsed: 'openai', ok: true, bytes: buf.length });
              res.setHeader('Content-Type', 'audio/mpeg');
              res.setHeader('X-Voice-Engine', 'openai');
              res.setHeader('Cache-Control', 'no-store');
              return res.status(200).send(buf);
            }
            if (diag) return res.status(200).json({ engineUsed: 'none', error: 'OpenAI lieferte eine leere Antwort' });
          } else {
            const errText = await oaRes.text().catch(() => '');
            if (diag) return res.status(200).json({ engineUsed: 'none', error: `OpenAI meldet Status ${oaRes.status}: ${errText.slice(0, 300)}` });
          }
          // Antwort nicht ok oder leer -> unten automatisch auf Edge-TTS weiter (nur im Normalbetrieb, nicht im Diagnose-Modus)
        } catch (e) {
          if (diag) return res.status(200).json({ engineUsed: 'none', error: 'OpenAI nicht erreichbar: ' + String(e && e.message || e) });
          /* OpenAI nicht erreichbar/Timeout -> unten automatisch auf Edge-TTS weiter */
        }
      }
      // Kein Schlüssel gesetzt oder OpenAI fehlgeschlagen: fällt durch zu Edge-TTS unten, kein Fehler nach außen
    }

    try {
      const buffer = await edgeTtsBuffer(plainText, voice);
      if (!buffer.length) return res.status(502).json({ error: 'Keine Audiodaten erhalten' });
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('X-Voice-Engine', 'edge');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(buffer);
    } catch (err) {
      return res.status(502).json({ error: 'Edge-TTS fehlgeschlagen: ' + String(err && err.message || err) });
    }
  }

  // ---------- Stadtverkehr und Landstraßen (TomTom): ?traffic=1&bbox=minLon,minLat,maxLon,maxLat ----------
  // Braucht die Vercel-Variable TOMTOM_API_KEY (kostenloser Schlüssel von developer.tomtom.com). Ohne Schlüssel: Fehlermeldung, die App macht dann nur mit den Autobahn-Meldungen weiter.
  if (req.query.traffic) {
    const key = process.env.TOMTOM_API_KEY;
    if (!key) return res.status(501).json({ error: 'Server: TOMTOM_API_KEY fehlt', incidents: [] });
    const parts = String(req.query.bbox || '').split(',').map(Number);
    if (parts.length !== 4 || parts.some(n => !isFinite(n))) return res.status(400).json({ error: 'bbox ungültig', incidents: [] });
    let [minLon, minLat, maxLon, maxLat] = parts;
    // TomTom erlaubt höchstens 10.000 km² pro Abfrage: Fläche begrenzen (ca. 0,9° Breite x 0,6° Höhe in Norddeutschland)
    if (maxLon - minLon > 0.9) { const m = (maxLon + minLon) / 2; minLon = m - 0.45; maxLon = m + 0.45; }
    if (maxLat - minLat > 0.6) { const m = (maxLat + minLat) / 2; minLat = m - 0.3; maxLat = m + 0.3; }
    try {
      const url = 'https://api.tomtom.com/traffic/services/5/incidentDetails?key=' + encodeURIComponent(key) +
        '&bbox=' + [minLon, minLat, maxLon, maxLat].map(n => n.toFixed(5)).join(',') +
        '&language=de-DE&timeValidityFilter=present';
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) {
        const t = await r.text().catch(() => '');
        return res.status(502).json({ error: 'TomTom meldet Status ' + r.status + ': ' + t.slice(0, 200), incidents: [] });
      }
      const d = await r.json();
      const ART = { 1: 'Unfall', 2: 'Nebel', 3: 'Gefahrenstelle', 4: 'Regen', 5: 'Glätte', 6: 'Stau', 7: 'Fahrstreifen gesperrt', 8: 'Sperrung', 9: 'Baustelle', 10: 'Wind', 11: 'Überflutung', 14: 'Pannenfahrzeug' };
      const incidents = (d.incidents || []).map(it => {
        const p = it.properties || {}, g = it.geometry || {};
        // Position: erster Punkt der Linie (oder der Punkt selbst); TomTom liefert [Länge, Breite]
        let c = g.coordinates;
        while (Array.isArray(c) && Array.isArray(c[0])) c = c[0];
        if (!Array.isArray(c) || c.length < 2) return null;
        const ev = (p.events && p.events[0]) || {};
        return {
          lat: c[1], lon: c[0],
          art: ART[p.iconCategory] || 'Verkehrsstörung',
          kategorie: p.iconCategory || 0,
          stufe: p.magnitudeOfDelay || 0,          // 0 unbekannt, 1 gering, 2 mittel, 3 groß, 4 Sperrung
          verzoegerung_s: p.delay || 0,
          laenge_m: p.length || 0,
          von: p.from || '', nach: p.to || '',
          strassen: p.roadNumbers || [],
          text: ev.description || ''
        };
      }).filter(Boolean);
      res.setHeader('Cache-Control', 's-maxage=60');
      return res.status(200).json({ incidents });
    } catch (e) {
      return res.status(502).json({ error: 'TomTom nicht erreichbar: ' + String(e && e.message || e), incidents: [] });
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
