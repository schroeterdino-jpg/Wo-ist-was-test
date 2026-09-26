// Verkehrsmeldungen (Stau, Baustellen) UND Webcams über die offizielle, kostenlose Autobahn-API des Bundes.
// Alles in EINER Datei (statt einer eigenen webcam.js), weil Vercel im kostenlosen Hobby-Plan
// höchstens 12 Serverless Functions pro Deployment erlaubt - eine Datei mehr hätte das Limit gerissen.
// Kein API-Schlüssel nötig, läuft trotzdem über den Server, um CORS-Überraschungen zu vermeiden
// (siehe die Erfahrung mit Nominatim/Overpass) und den App-Code-Schutz konsistent zu halten.
export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

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
