// Adresse zu Koordinaten mit Hausnummer ("Reverse Geocoding"), vor allem für den Parkplatz.
// Quelle: OpenStreetMap Nominatim (kostenlos, ohne Schlüssel). Läuft über den Server, weil Nominatim einen
// eigenen User-Agent verlangt und der Browser direkte Anfragen oft per CORS blockiert.
export default async function handler(req, res) {
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const lat = Number(req.query.lat), lon = Number(req.query.lon);
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return res.status(400).json({ error: 'Koordinaten fehlen oder sind ungültig' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1&accept-language=de`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'AlltagsHelfer/1.0 (privates Hobbyprojekt, nicht kommerziell)' },
      signal: AbortSignal.timeout(6000)
    });
    if (!r.ok) return res.status(502).json({ error: 'Adress-Suche antwortet mit Status ' + r.status });
    const d = await r.json();
    const a = d.address || {};
    const strasseName = a.road || a.pedestrian || a.footway || a.path || '';
    const hausnummer = a.house_number || '';
    const ort = a.city || a.town || a.village || a.municipality || a.suburb || a.county || '';
    const strasse = strasseName ? (strasseName + (hausnummer ? ' ' + hausnummer : '')).trim() : '';
    const adresse = [strasse, ort].filter(Boolean).join(', ');
    return res.status(200).json({ adresse: adresse || null, strasse: strasse || null, hausnummer: !!hausnummer, ort: ort || null });
  } catch (e) {
    return res.status(502).json({ error: 'Adress-Suche nicht erreichbar: ' + e.message });
  }
}
