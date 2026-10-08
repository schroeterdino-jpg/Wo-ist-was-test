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

function makeRedis(base, token) {
  return async (...command) => {
    const r = await fetch(base, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(command)
    });
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    return j.result;
  };
}

export default async function handler(req, res) {
  // --- Zeitgeber (cron-job.org): eigener Schlüssel PUSH_CRON_KEY (nicht CRON_SECRET, den nutzt memory.js) statt App-Code; nur die Aktion push_due ---
  if (String((req.query && req.query.action) || '') === 'push_due') {
    const cs = process.env.PUSH_CRON_KEY;
    if (!cs) return res.status(500).json({ error: 'Server: PUSH_CRON_KEY fehlt' });
    const given = String((req.query && req.query.key) || req.headers['x-cron-key'] || '');
    if (given !== cs) return res.status(401).json({ error: 'Nicht erlaubt' });
    const b0 = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const t0 = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!b0 || !t0) return res.status(500).json({ error: 'Server: Speicher fehlt' });
    return handleDue(req, res, makeRedis(b0, t0));
  }
  // --- Schutz: nur die App mit dem richtigen Code darf hier lesen oder schreiben ---
  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  const base = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (!base || !token) {
    return res.status(500).json({ error: 'Server: Speicher fehlt (Upstash Redis mit dem Projekt verbinden)' });
  }

  const redis = makeRedis(base, token);

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

    if (action === 'push_items') {   // die App meldet ihre Erinnerungen und Termine (nur Titel, Zeit)
      const list = Array.isArray(body.items) ? body.items : [];
      const items = [];
      for (const it of list.slice(0, 200)) {
        if (!it || typeof it.id !== 'string' || typeof it.x !== 'string' || typeof it.at !== 'number' || !Number.isFinite(it.at)) continue;
        if (it.k !== 'r' && it.k !== 'e') continue;
        items.push({ id: it.id.slice(0, 40), k: it.k, x: it.x.slice(0, 140), at: Math.round(it.at) });
      }
      const st = await loadItems(redis);
      st.items = items;
      await redis('SET', ITEMS_KEY, JSON.stringify(st));
      return res.status(200).json({ ok: true, count: items.length });
    }
    if (action === 'push_alive' || action === 'push_gone') {   // alive: App offen und sichtbar, dann spricht sie selbst; gone: App wurde verlassen
      const st = await loadItems(redis);
      st.alive = action === 'push_alive' ? Date.now() : 0;
      await redis('SET', ITEMS_KEY, JSON.stringify(st));
      return res.status(200).json({ ok: true });
    }

    if (action === 'push_test') {
      if (!data.subs.length) return res.status(200).json({ ok: false, sent: 0, error: 'Kein Handy angemeldet' });
      const payload = { title: 'Jarvis', body: 'Test: Diese Nachricht kommt auch bei geschlossener App an.', url: './' };
      const { sent, failed } = await sendToAll(redis, data, payload);
      return res.status(200).json({ ok: sent > 0, sent, failed });
    }
    return res.status(400).json({ error: 'Unbekannte Aktion' });
  } catch (err) {
    return res.status(500).json({ error: 'Push-Fehler: ' + err.message });
  }
}

// ---------------------------------------------------------------------------------------------
// Schritt 2: fällige Erinnerungen und Termin-Vorwarnungen als Push. Aufruf jede Minute von außen (cron-job.org):
//   /api/sync?action=push_due&key=<PUSH_CRON_KEY>
// ---------------------------------------------------------------------------------------------
const ITEMS_KEY = 'alltags-helfer:pushitems';
const EVENT_LEAD_MIN = 15;          // Termin-Vorwarnung so viele Minuten vorher
const REMINDER_GRACE_MIN = 15;      // verpasste Erinnerung wird noch so lange nachgeholt
const ALIVE_MS = 270 * 1000;        // App gilt so lange als "offen" nach ihrem letzten Lebenszeichen

async function loadItems(redis) {
  let st = { items: [], sent: {}, alive: 0 };
  try { const raw = await redis('GET', ITEMS_KEY); if (raw) st = JSON.parse(raw); } catch (e) {}
  if (!Array.isArray(st.items)) st.items = [];
  if (!st.sent || typeof st.sent !== 'object') st.sent = {};
  if (typeof st.alive !== 'number') st.alive = 0;
  return st;
}

async function sendToAll(redis, data, payloadObj) {
  const mod = await import('web-push');
  const webpush = mod.default || mod;
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'https://wo-ist-was-test.vercel.app/', process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  const payload = JSON.stringify(payloadObj);
  let sent = 0, failed = 0; const keep = [];
  for (const sub of data.subs) {
    try { await webpush.sendNotification(sub, payload, { TTL: 600 }); sent++; keep.push(sub); }
    catch (e) {
      failed++;
      if (e && (e.statusCode === 404 || e.statusCode === 410)) continue;   // Anmeldung ist abgelaufen: entfernen
      keep.push(sub);
    }
  }
  if (keep.length !== data.subs.length) { data.subs = keep; await redis('SET', PUSH_KEY, JSON.stringify(data)); }
  return { sent, failed };
}

function berlinHour(ms) {
  const h = parseInt(new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false }), 10);
  return isNaN(h) ? 12 : h % 24;
}
function berlinClock(ms) {
  return new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
}

async function handleDue(req, res, redis) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'Server: VAPID-Schlüssel fehlen' });
    const now = Date.now();
    const st = await loadItems(redis);   // nur ein Datenbank-Zugriff pro Minute, solange nichts fällig ist

    const appOpen = now - st.alive < ALIVE_MS;
    const quiet = berlinHour(now) >= 22 || berlinHour(now) < 7;
    const due = [];
    for (const it of st.items) {
      if (st.sent[it.id]) continue;
      if (it.k === 'r') {
        if (it.at <= now && now - it.at <= REMINDER_GRACE_MIN * 60000) due.push(it);
      } else {
        const lead = it.at - EVENT_LEAD_MIN * 60000;
        if (now >= lead && now < it.at) due.push(it);
      }
    }
    if (!due.length) return res.status(200).json({ ok: true, due: 0 });

    // Sperre: nie zwei Läufe gleichzeitig (sonst käme alles doppelt)
    const lock = await redis('SET', 'alltags-helfer:pushlock', '1', 'NX', 'EX', '40');
    if (!lock) return res.status(200).json({ ok: true, skipped: 'läuft schon' });
    let data = { subs: [] };
    try { const raw = await redis('GET', PUSH_KEY); if (raw) data = JSON.parse(raw); } catch (e) {}
    if (!Array.isArray(data.subs)) data.subs = [];

    let sent = 0, skippedApp = 0, skippedQuiet = 0;
    for (const it of due) {
      st.sent[it.id] = now;
      if (appOpen) { skippedApp++; continue; }                    // die offene App spricht selbst
      if (it.k === 'e' && quiet) { skippedQuiet++; continue; }    // Vorwarnungen schweigen nachts; eigene Erinnerungen immer
      if (!data.subs.length) continue;
      const mins = Math.max(1, Math.round((it.at - now) / 60000));
      const payload = it.k === 'r'
        ? { title: 'Erinnerung', body: it.x, tag: 'r-' + it.id, url: './' }
        : { title: 'Termin in ' + mins + ' Minuten', body: it.x + ' um ' + berlinClock(it.at) + ' Uhr', tag: 'e-' + it.id, url: './' };
      const r = await sendToAll(redis, data, payload);
      if (r.sent > 0) sent++;
    }
    // Aufräumen: Gesendet-Liste nur für Einträge, die es noch gibt oder die jünger als 2 Tage sind
    const ids = new Set(st.items.map(i => i.id));
    for (const k of Object.keys(st.sent)) { if (!ids.has(k) && now - st.sent[k] > 2 * 86400000) delete st.sent[k]; }
    await redis('SET', ITEMS_KEY, JSON.stringify(st));
    return res.status(200).json({ ok: true, due: due.length, sent, skippedApp, skippedQuiet });
  } catch (err) {
    return res.status(500).json({ error: 'Push-Fehler: ' + err.message });
  }
}
