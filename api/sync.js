// Speicher für den Datenabgleich zwischen deinen Geräten.
// GET  /api/sync -> liefert alle gespeicherten Bereiche
// POST /api/sync -> speichert Bereiche; pro Bereich gewinnt der neuere Zeitstempel
//
// Braucht bei Vercel diese Umgebungsvariablen:
//   APP_SECRET                              (dein App-Code)
//   KV_REST_API_URL, KV_REST_API_TOKEN      (kommen automatisch, wenn du die Upstash-Redis-Datenbank mit dem Projekt verbindest)

const ALLOWED_KEYS = [
  'helfer_shopping',
  'helfer_todo_entries',
  'helfer_memory',
  'helfer_contacts',
  'helfer_briefing_wishes',
  'helfer_parking',
  'user_custom_name'
];
const STORE_KEY = 'alltags-helfer:data';
const MAX_VALUE_LENGTH = 200000;

export default async function handler(req, res) {
  // --- Schutz: nur die App mit dem richtigen Code darf hier lesen oder schreiben ---
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!base || !token) {
    return res.status(500).json({ error: 'Server: Speicher fehlt (Upstash Redis mit dem Projekt verbinden)' });
  }

  const redis = async (...command) => {
    const r = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  };

  // --- Push-Nachrichten (Handy meldet sich an, Test-Nachricht). Eigener Speicherplatz, berührt den Datenabgleich unten nicht. ---
  const pushAction = String((req.query && req.query.action) || '');
  if (pushAction.indexOf('push_') === 0) return handlePush(pushAction, req, res, redis);

  try {
    const raw = await redis('GET', STORE_KEY);
    let stored = { items: {} };
    if (raw) {
      try { stored = JSON.parse(raw); } catch (e) { stored = { items: {} }; }
    }
    if (!stored.items || typeof stored.items !== 'object') stored.items = {};

    if (req.method === 'GET') {
      return res.status(200).json(stored);
    }

    if (req.method === 'POST') {
      const incoming = (req.body && req.body.items) || {};
      for (const key of Object.keys(incoming)) {
        if (!ALLOWED_KEYS.includes(key)) continue;
        const { v, ts } = incoming[key] || {};
        if (typeof v !== 'string' || v.length > MAX_VALUE_LENGTH) continue;
        if (typeof ts !== 'number' || !Number.isFinite(ts)) continue;
        const current = stored.items[key];
        if (!current || ts >= current.ts) stored.items[key] = { v, ts };
      }
      const out = JSON.stringify(stored);
      if (out.length > 900000) return res.status(413).json({ error: 'Zu viele Daten' });
      await redis('SET', STORE_KEY, out);
      return res.status(200).json(stored);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    return res.status(500).json({ error: 'Sync-Fehler: ' + err.message });
  }
}

// ---------------------------------------------------------------------------------------------
// Push: Umgebungsvariablen VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY (optional VAPID_SUBJECT, sonst die App-Adresse)
// Aktionen: push_key (GET) · push_subscribe (POST {subscription}) · push_unsubscribe (POST {endpoint}) · push_test (POST)
// ---------------------------------------------------------------------------------------------
const PUSH_KEY = 'alltags-helfer:push';
const MAX_SUBS = 5;

async function handlePush(action, req, res, redis) {
  try {
    const pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
    if (!pub || !priv) return res.status(500).json({ error: 'Server: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY fehlen' });
    if (action === 'push_key') return res.status(200).json({ publicKey: pub });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    let data = { subs: [] };
    try { const raw = await redis('GET', PUSH_KEY); if (raw) data = JSON.parse(raw); } catch (e) {}
    if (!Array.isArray(data.subs)) data.subs = [];
    const body = req.body || {};

    if (action === 'push_subscribe') {
      const sub = body.subscription || {};
      if (typeof sub.endpoint !== 'string' || sub.endpoint.indexOf('https://') !== 0 || sub.endpoint.length > 1000 ||
          !sub.keys || typeof sub.keys.p256dh !== 'string' || typeof sub.keys.auth !== 'string') {
        return res.status(400).json({ error: 'Ungültige Anmeldung' });
      }
      data.subs = data.subs.filter(x => x.endpoint !== sub.endpoint);
      data.subs.push({ endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth }, ts: Date.now() });
      data.subs = data.subs.slice(-MAX_SUBS);
      await redis('SET', PUSH_KEY, JSON.stringify(data));
      return res.status(200).json({ ok: true, count: data.subs.length });
    }

    if (action === 'push_unsubscribe') {
      const before = data.subs.length;
      data.subs = data.subs.filter(x => x.endpoint !== body.endpoint);
      if (data.subs.length !== before) await redis('SET', PUSH_KEY, JSON.stringify(data));
      return res.status(200).json({ ok: true, count: data.subs.length });
    }

    if (action === 'push_test') {
      if (!data.subs.length) return res.status(200).json({ ok: false, sent: 0, error: 'Kein Handy angemeldet' });
      const mod = await import('web-push');
      const webpush = mod.default || mod;
      webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://wo-ist-was-test.vercel.app/', pub, priv);
      const payload = JSON.stringify({ title: 'Jarvis', body: 'Test: Diese Nachricht kommt auch bei geschlossener App an.', url: './' });
      let sent = 0, failed = 0; const keep = [];
      for (const sub of data.subs) {
        try { await webpush.sendNotification(sub, payload, { TTL: 300 }); sent++; keep.push(sub); }
        catch (e) {
          failed++;
          if (e && (e.statusCode === 404 || e.statusCode === 410)) continue;   // Anmeldung ist abgelaufen: entfernen
          keep.push(sub);
        }
      }
      if (keep.length !== data.subs.length) { data.subs = keep; await redis('SET', PUSH_KEY, JSON.stringify(data)); }
      return res.status(200).json({ ok: sent > 0, sent, failed });
    }
    return res.status(400).json({ error: 'Unbekannte Aktion' });
  } catch (err) {
    return res.status(500).json({ error: 'Push-Fehler: ' + err.message });
  }
}
