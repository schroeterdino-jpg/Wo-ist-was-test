import crypto from 'node:crypto';

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
  // --- "Erledigt"-Knopf an einer Benachrichtigung: kein App-Code im Service Worker, stattdessen ein Token pro Erinnerung ---
  if (String((req.query && req.query.action) || '') === 'push_done') {
    const key = process.env.PUSH_CRON_KEY;
    const b1 = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const t1 = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!key || !b1 || !t1) return res.status(500).json({ error: 'Server nicht eingerichtet' });
    const id = String((req.query && req.query.id) || '').slice(0, 40), tok = String((req.query && req.query.t) || '');
    if (!id || tok !== doneToken(id)) return res.status(401).json({ error: 'Nicht erlaubt' });
    try {
      const redis1 = makeRedis(b1, t1);
      const st = await loadItems(redis1);
      st.done[id] = Date.now();
      delete st.nag[id];
      await redis1('SET', ITEMS_KEY, JSON.stringify(st));
      return res.status(200).json({ ok: true });
    } catch (e) { return res.status(500).json({ error: 'Fehler' }); }
  }
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
  // --- Prüfansicht für dich: zeigt, was der Server über Standort und Abfahrtszeiten weiß (nur mit PUSH_CRON_KEY) ---
  if (String((req.query && req.query.action) || '') === 'push_info') {
    const cs = process.env.PUSH_CRON_KEY;
    if (!cs || String((req.query && req.query.key) || '') !== cs) return res.status(401).json({ error: 'Nicht erlaubt' });
    const b0 = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
    const t0 = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
    if (!b0 || !t0) return res.status(500).json({ error: 'Server: Speicher fehlt' });
    try {
      const st = await loadItems(makeRedis(b0, t0)); const now = Date.now();
      const min = ts => ts ? Math.round((now - ts) / 60000) + ' Min. her' : 'nie';
      let wetterTest;
      if (String(req.query.wetter || '') === '1') {   // Probe: Wetter jetzt für die nächsten Fahrten bewerten (sendet nichts)
        const sc = st.cfg && st.cfg.schicht, rt = st.cfg && st.cfg.route;
        if (!sc || !rt) wetterTest = 'Schichtplan oder Strecke fehlt (App einmal öffnen)';
        else wetterTest = { morgenFrueh: await assessWeather(rt, berlinParts(now + 86400000).ymd, sc.times.frueh, WX_WINDOW_MIN), heuteSpaet: await assessWeather(rt, berlinParts(now).ymd, sc.times.spaet, WX_WINDOW_MIN) };
      }
      return res.status(200).json({
        appOffen: now - st.alive < ALIVE_MS, lebenszeichen: min(st.alive), standort: st.loc ? min(st.loc.ts) : 'keiner gemeldet',
        zuhauseRoute: !!(st.cfg && st.cfg.route),
        wetter: wetterTest || { letzte: st.wx.last || 'noch keine', fehler: st.wx.err || null },
        impulse: { aus: !!st.imp.off, letzter: st.imp.last ? min(st.imp.last) : 'noch keiner', heute: st.imp.dayCount || null, regelnHeuteGesendet: st.imp.sent },
        diesel: { letzterPreis: st.tank.last ? { euro: st.tank.last.p, tankstelle: st.tank.last.name, ort: st.tank.last.ort, vor: min(st.tank.last.ts), ab: st.tank.last.quelle } : 'noch keiner', schnitt7Tage: st.tank.avg || 'noch zu wenig Daten', messwerte: st.tank.hist.length, ersteMessung: st.tank.hist.length ? min(st.tank.hist[0][0] * 60000) : 'nie', letzteMeldung: min(st.tank.lastAlert), fehler: st.tank.err || null },
        erinnerungen: st.items.filter(i => i.k === 'r' && i.at < now + 36 * 3600000).map(i => ({ text: i.x, in_min: Math.round((i.at - now) / 60000), wichtig: i.i === 1, gesendet: !!st.sent[i.id], nachgefasst: st.nag[i.id] ? st.nag[i.id].n : 0, erledigt: !!st.done[i.id] })),
        termine: st.items.filter(i => i.k === 'e').map(i => ({ text: i.x, in_min: Math.round((i.at - now) / 60000), mitOrt: !!i.l, strecke: st.dep[i.id] ? (st.dep[i.id].fail ? 'Fehler: ' + st.dep[i.id].fail : { fahrtMin: st.dep[i.id].fahrtMin, stauMin: st.dep[i.id].stauMin || 0, ab: st.dep[i.id].quelle }) : 'noch nicht berechnet', gesendet: !!st.sent[i.id] }))
      });
    } catch (e) { return res.status(500).json({ error: 'Fehler' }); }
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
        const o = { id: it.id.slice(0, 40), k: it.k, x: it.x.slice(0, 140), at: Math.round(it.at) };
        if (it.k === 'e' && typeof it.l === 'string' && it.l.trim()) o.l = it.l.trim().slice(0, 120);
        if (o.l && it.g && Number.isFinite(it.g.lat) && Number.isFinite(it.g.lon) && Math.abs(it.g.lat) <= 90 && Math.abs(it.g.lon) <= 180) o.g = { lat: it.g.lat, lon: it.g.lon };   // von der App schon gefunden
        if (it.k === 'r' && it.i === 1) o.i = 1;
        items.push(o);
      }
      const st = await loadItems(redis);
      items.forEach(o => { if (o.g && st.dep[o.id] && st.dep[o.id].fail) delete st.dep[o.id]; });   // Ort jetzt bekannt: neu rechnen
      st.items = items.filter(o => !st.done[o.id]);   // am Sperrbildschirm als erledigt markierte Erinnerungen nicht wieder aufnehmen
      const doneIds = Object.keys(st.done);
      for (const k of doneIds) { if (Date.now() - st.done[k] > 2 * 86400000) delete st.done[k]; }
      await redis('SET', ITEMS_KEY, JSON.stringify(st));
      return res.status(200).json({ ok: true, count: st.items.length, done: Object.keys(st.done) });
    }
    if (action === 'push_done_list') {   // beim Öffnen der App: was wurde am Sperrbildschirm schon erledigt?
      const st = await loadItems(redis);
      return res.status(200).json({ ok: true, done: Object.keys(st.done) });
    }
    if (action === 'push_loc') {   // letzter bekannter Standort (die App meldet ihn nur, solange sie offen ist)
      if (!Number.isFinite(body.lat) || !Number.isFinite(body.lon) || Math.abs(body.lat) > 90 || Math.abs(body.lon) > 180) return res.status(400).json({ error: 'Ungültig' });
      const st = await loadItems(redis);
      st.loc = { lat: body.lat, lon: body.lon, ts: Date.now() };
      await redis('SET', ITEMS_KEY, JSON.stringify(st));
      return res.status(200).json({ ok: true });
    }
    if (action === 'push_config') {   // Schichtplan und Strecke zur Arbeit (nur Zahlen), für die Briefing-Nachricht
      const st = await loadItems(redis);
      const cfg = {};
      const sc = body.schicht;
      if (sc && Number.isFinite(sc.base) && (sc.shift === 'frueh' || sc.shift === 'spaet') && sc.times &&
          Number.isFinite(sc.times.frueh) && Number.isFinite(sc.times.spaet)) {
        cfg.schicht = { base: Math.round(sc.base), shift: sc.shift, auto: sc.auto !== false,
          times: { frueh: Math.max(0, Math.min(1439, Math.round(sc.times.frueh))), spaet: Math.max(0, Math.min(1439, Math.round(sc.times.spaet))) } };
      }
      if (typeof body.name === 'string') cfg.name = body.name.replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 40);
      const rt = body.route;
      if (rt && Number.isFinite(rt.fahrtMin) && rt.from && rt.to && [rt.from.lat, rt.from.lon, rt.to.lat, rt.to.lon].every(Number.isFinite)) {
        cfg.route = { fahrtMin: Math.round(rt.fahrtMin), km: Number.isFinite(rt.km) ? Math.round(rt.km) : null,
          autobahnen: (Array.isArray(rt.autobahnen) ? rt.autobahnen : []).filter(a => /^A\d{1,3}$/.test(String(a))).slice(0, 2),
          from: { lat: rt.from.lat, lon: rt.from.lon }, to: { lat: rt.to.lat, lon: rt.to.lon } };
      }
      st.cfg = cfg;
      await redis('SET', ITEMS_KEY, JSON.stringify(st));
      return res.status(200).json({ ok: true, schicht: !!cfg.schicht, route: !!cfg.route });
    }
    if (action === 'push_impulse') {   // Abend-Impulse ein/aus ("Impulse aus" per Sprache)
      const st = await loadItems(redis);
      st.imp.off = body.on === false;
      await redis('SET', ITEMS_KEY, JSON.stringify(st));
      return res.status(200).json({ ok: true, an: !st.imp.off });
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
const EVENT_LEAD_MIN = 60;          // Termin-Vorwarnung (ohne Ort) so viele Minuten vorher
const REMINDER_GRACE_MIN = 15;      // verpasste Erinnerung wird noch so lange nachgeholt
const ALIVE_MS = 270 * 1000;        // App gilt so lange als "offen" nach ihrem letzten Lebenszeichen

async function loadItems(redis) {
  let st = { items: [], sent: {}, alive: 0 };
  try { const raw = await redis('GET', ITEMS_KEY); if (raw) st = JSON.parse(raw); } catch (e) {}
  if (!Array.isArray(st.items)) st.items = [];
  if (!st.sent || typeof st.sent !== 'object') st.sent = {};
  if (typeof st.alive !== 'number') st.alive = 0;
  if (!st.cfg || typeof st.cfg !== 'object') st.cfg = {};
  for (const k of ['nag', 'done', 'dep', 'geo']) { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; }
  if (!st.tank || typeof st.tank !== 'object') st.tank = {};
  if (!Array.isArray(st.tank.hist)) st.tank.hist = [];
  if (!st.wx || typeof st.wx !== 'object') st.wx = {};
  if (!st.imp || typeof st.imp !== 'object') st.imp = {};
  if (!st.imp.sent || typeof st.imp.sent !== 'object') st.imp.sent = {};
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

// --- Schicht-Briefing als Push (gleiche Rechnung wie js/schicht.js) ---
const REF_MONDAY = Date.UTC(2024, 0, 1);
const BRIEF_GRACE_MIN = 10;   // so lange nach der Briefing-Zeit wird die Nachricht noch geschickt (falls ein Zeitgeber-Lauf ausfällt)
function berlinParts(ms) {
  const p = {};
  new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
  return { ymd: p.year + '-' + p.month + '-' + p.day, y: +p.year, m: +p.month, d: +p.day, min: (+p.hour % 24) * 60 + (+p.minute) };
}
function weekNo(b) {
  const t = Date.UTC(b.y, b.m - 1, b.d);
  const dow = (new Date(t).getUTCDay() + 6) % 7;
  return Math.round((t - dow * 86400000 - REF_MONDAY) / (7 * 86400000));
}
function shiftOfWeek(sc, w) { return (((w - sc.base) % 2) + 2) % 2 === 0 ? sc.shift : (sc.shift === 'frueh' ? 'spaet' : 'frueh'); }
function spokenClock(min) { const h = Math.floor(min / 60), m = min % 60; return m ? h + ' Uhr ' + m : h + ' Uhr'; }

function classifyWarning(w) {
  const text = ((w.title || '') + ' ' + (w.description || []).join(' ')).toLowerCase();
  if (/unfall/.test(text)) return 'Unfall';
  if (/geisterfahrer|falschfahrer/.test(text)) return 'Falschfahrer-Warnung';
  if (/liegengeblieben|pannenfahrzeug|panne\b/.test(text)) return 'Pannenfahrzeug';
  if (/ladung|gegenstand auf der fahrbahn|hindernis/.test(text)) return 'Hindernis auf der Fahrbahn';
  if (/glätte|glatteis|schnee|eisglätte/.test(text)) return 'Glätte';
  if (/nebel|sichtbehinderung/.test(text)) return 'Nebel';
  if (/vollsperr|gesperrt|sperrung/.test(text)) return 'Sperrung';
  if (/baustelle|bauarbeiten/.test(text)) return 'Baustelle';
  if (/verengung|fahrstreifen/.test(text)) return 'Fahrstreifenverengung';
  if (/rückstau|stockend|zähfließend|stau\b/.test(text)) return 'Stau';
  const icon = String(w.icon || '').trim();
  if (icon === '101') return 'Gefahrenstelle';
  if (icon === '123') return 'Baustelle';
  if (icon === '250') return 'Sperrung';
  if (icon === 'warnkegel') return 'Kurzzeitbaustelle';
  return 'Verkehrsstörung';
}

/* Verkehrsmeldungen auf der Strecke. Gibt { geprueft: true/false, meldungen: [Text] } zurück; geprueft=false: Dienst nicht erreichbar, dann nichts behaupten. */
async function checkStau(route) {
  const roads = (route && route.autobahnen) || [];
  if (!roads.length) return { geprueft: false, meldungen: [] };
  const pad = 0.35;
  const minLat = Math.min(route.from.lat, route.to.lat) - pad, maxLat = Math.max(route.from.lat, route.to.lat) + pad;
  const minLon = Math.min(route.from.lon, route.to.lon) - pad, maxLon = Math.max(route.from.lon, route.to.lon) + pad;
  const meldungen = []; let geprueft = 0, kostMin = 0;
  const results = await Promise.all(roads.map(async road => {
    try {
      const r = await fetch('https://verkehr.autobahn.de/o/autobahn/' + road + '/services/warning', { signal: AbortSignal.timeout(5000) });
      if (!r.ok) return null;
      const j = await r.json();
      return Array.isArray(j.warning) ? j.warning : [];
    } catch (e) { return null; }
  }));
  results.forEach((warnings, i) => {
    if (!warnings) return;
    geprueft++;
    const seen = [];
    warnings.filter(w => {
      const lat = w.coordinate && Number(w.coordinate.lat), lon = w.coordinate && Number(w.coordinate.long);
      return isFinite(lat) && isFinite(lon) && lat >= minLat && lat <= maxLat && lon >= minLon && lon <= maxLon;
    }).forEach(w => {
      const art = classifyWarning(w);
      const kurz = String(w.title || '').split('|').pop().trim();
      const name = kurz.split(/\s+[-–]\s+|,\s*/).pop().trim().toLowerCase();
      if (seen.some(g => g.art === art && g.name === name)) return;   // dieselbe Stelle in beiden Richtungen nur einmal
      seen.push({ art, name });
      if (art === 'Stau' || art === 'Unfall' || art === 'Sperrung') {   // Zeitverlust: aus der Meldung, sonst 10 Minuten pro Stelle
        const txt = ((w.title || '') + ' ' + (w.description || []).join(' '));
        const m = txt.match(/(?:verz[öo]gerung|zeitverlust|verlustzeit)[^0-9]{0,25}(\d{1,3})\s*min/i) || txt.match(/(\d{1,3})\s*min(?:uten)?\s*(?:verz[öo]gerung|zeitverlust|l[äa]nger)/i);
        kostMin += m ? Math.min(60, Math.max(1, parseInt(m[1], 10))) : 10;
      }
      if (meldungen.length < 3) meldungen.push(roads[i] + (kurz ? ' ' + kurz : '') + ' (' + art + ')');
    });
  });
  return { geprueft: geprueft > 0, meldungen, kostMin: Math.min(45, kostMin) };
}

async function buildBriefing(st, sh, now) {
  const cfg = st.cfg || {};
  const name = cfg.name ? ', ' + cfg.name : '';
  const b = berlinParts(now);
  const hour = Math.floor(b.min / 60);
  const gruss = hour < 11 ? 'Guten Morgen' : (hour < 18 ? 'Guten Tag' : 'Guten Abend');
  const art = sh === 'frueh' ? 'Frühschicht' : 'Spätschicht';
  const parts = [];
  if (sh === 'spaet') parts.push('Abfahrt gegen ' + spokenClock(cfg.schicht.times.spaet) + '.');
  if (cfg.route && cfg.route.fahrtMin) parts.push('Die Fahrt zur Arbeit dauert etwa ' + cfg.route.fahrtMin + ' Minuten.');
  if (cfg.route) {
    const stau = await checkStau(cfg.route);
    if (stau.meldungen.length) parts.push('Achtung auf der Strecke: ' + stau.meldungen.join('; ') + '.');
    else if (stau.geprueft) parts.push('Keine Staumeldungen auf der Strecke.');
  }
  // Heute anstehend (Zeiten nach Berlin-Tag)
  const heute = st.items.filter(it => it.at >= now && berlinParts(it.at).ymd === b.ymd);
  const ev = heute.filter(i => i.k === 'e'), rem = heute.filter(i => i.k === 'r');
  const teile = [];
  if (ev.length) teile.push(ev.length + (ev.length === 1 ? ' Termin' : ' Termine') + ' (nächster ' + berlinClock(ev[0].at) + ' ' + ev[0].x + ')');
  if (rem.length) teile.push(rem.length + (rem.length === 1 ? ' Erinnerung' : ' Erinnerungen'));
  if (teile.length) parts.push('Heute: ' + teile.join(', ') + '.');
  parts.push('Tippe für das Briefing.');
  return { title: gruss + name + '. ' + art, body: parts.join(' '), tag: 'brief-' + b.ymd, url: './' };
}

// --- Abfahrtszeit für Termine mit Ort, Nachfassen bei wichtigen Erinnerungen ---
const BUFFER_MIN = 10;          // Puffer vor der Abfahrt (wie in der App)
const DEPART_LEAD_MIN = 15;     // Nachricht so viele Minuten vor der Abfahrt
const DEPART_WINDOW_MS = 4 * 3600000;   // Termine, die weiter weg sind, werden noch nicht berechnet
const LOC_FRESH_MS = 3 * 3600000;       // so alt darf der gemeldete Standort sein, sonst gilt Zuhause
const NAG_INTERVAL_MS = 10 * 60000;     // wie in der App (calendar.js)
const NAG_MAX = 6;
// --- Dieselpreis-Alarm ---
const TANK_CHECK_MS = 30 * 60000;        // alle 30 Minuten nachsehen
const TANK_RADIUS_KM = 10;               // Umkreis um den letzten bekannten Standort (max. 25)
const TANK_DROP_CT = 6;                  // so viele Cent unter dem Durchschnitt der letzten Tage = Alarm  <-- hier änderbar
const TANK_ALERT_GAP_MS = 12 * 3600000;  // höchstens eine Meldung pro 12 Stunden
const TANK_HIST_MS = 7 * 86400000;       // Durchschnitt über die letzten 7 Tage
const TANK_MIN_SPAN_MS = 2 * 86400000;   // erst mit Daten aus mindestens 2 Tagen wird gemeldet
const TANK_MIN_SAMPLES = 40;
const UA = 'MeinAlltagsHelfer/1.0 (privates Projekt, kein kommerzieller Einsatz)';

function doneToken(id) {
  return crypto.createHmac('sha256', String(process.env.PUSH_CRON_KEY || '')).update('done:' + id).digest('hex').slice(0, 32);
}

async function geocodeServer(q) {
  try {
    const r = await fetch('https://nominatim.openstreetmap.org/search?format=json&limit=1&q=' + encodeURIComponent(q), { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4000) });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || !j[0]) return null;
    const lat = Number(j[0].lat), lon = Number(j[0].lon);
    return (isFinite(lat) && isFinite(lon)) ? { lat, lon } : null;
  } catch (e) { return null; }
}
function autobahnRefs(route) {
  const refs = new Set();
  const add = (text) => String(text || '').split(/[;,\/]/).forEach(part => { const m = part.trim().match(/^(?:A|BAB)\s?(\d+)$/i); if (m) refs.add('A' + m[1]); });
  (route.legs || []).forEach(leg => (leg.steps || []).forEach(step => { add(step.ref); add(step.name); }));
  return Array.from(refs);
}
async function routeServer(a, b) {
  try {
    const r = await fetch('https://router.project-osrm.org/route/v1/driving/' + a.lon + ',' + a.lat + ';' + b.lon + ',' + b.lat + '?overview=false&steps=true', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(4500) });
    if (!r.ok) return null;
    const j = await r.json();
    const rt = j && j.routes && j.routes[0];
    if (!rt || !isFinite(rt.duration)) return null;
    return { fahrtMin: Math.round(rt.duration / 60), autobahnen: autobahnRefs(rt).slice(0, 2) };
  } catch (e) { return null; }
}
function originNow(st, now) {
  if (st.loc && now - st.loc.ts <= LOC_FRESH_MS) return { lat: st.loc.lat, lon: st.loc.lon, src: 'standort' };
  const rt = st.cfg && st.cfg.route;
  if (rt && rt.from) return { lat: rt.from.lat, lon: rt.from.lon, src: 'zuhause' };
  return null;
}
async function geoCached(st, text) {
  const key = String(text).toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 120);
  const c = st.geo[key];
  if (c && c.lat !== undefined) return { lat: c.lat, lon: c.lon };
  if (c && c.fail && Date.now() - c.ts < 6 * 3600000) return null;
  let g = await geocodeServer(text);
  if (!g) { const m = String(text).trim().match(/^(.+?)\s+(?:in|bei|im|am|an der|auf der)\s+(.+)$/i); if (m) g = await geocodeServer(m[1].trim() + ', ' + m[2].trim()); }
  st.geo[key] = g ? { lat: g.lat, lon: g.lon, ts: Date.now() } : { fail: true, ts: Date.now() };
  const keys = Object.keys(st.geo);
  if (keys.length > 30) { keys.sort((a, b) => (st.geo[a].ts || 0) - (st.geo[b].ts || 0)); delete st.geo[keys[0]]; }
  return g;
}

/* Dieselpreis: billigste geöffnete Tankstelle im Umkreis; Verlauf merken; bei deutlich günstigerem Preis melden */
async function cheapestDiesel(origin) {
  const key = process.env.TANKER_API_KEY || process.env.TANKERKOENIG_API_KEY;
  if (!key) return { err: 'Schlüssel fehlt (TANKER_API_KEY)' };
  try {
    const url = 'https://creativecommons.tankerkoenig.de/json/list.php?lat=' + encodeURIComponent(origin.lat) + '&lng=' + encodeURIComponent(origin.lon) + '&rad=' + TANK_RADIUS_KM + '&sort=dist&type=diesel&apikey=' + encodeURIComponent(key);
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const d = await r.json();
    if (!d || d.ok === false) return { err: 'Tankerkönig: ' + ((d && d.message) || 'Fehler') };
    const list = (d.stations || []).filter(x => x && x.isOpen && typeof x.price === 'number' && x.price > 0.5 && x.price < 5);
    if (!list.length) return { err: 'keine geöffnete Tankstelle mit Preis' };
    list.sort((a, b) => a.price - b.price);
    const b = list[0];
    return { price: b.price, name: b.brand || b.name || 'Tankstelle', street: [b.street, b.houseNumber].filter(Boolean).join(' ').trim(), place: b.place || '', dist: b.dist };
  } catch (e) { return { err: 'nicht erreichbar' }; }
}
function tankDue(st, now) {
  return now - (st.tank.lastCheck || 0) >= TANK_CHECK_MS;
}
function tankAverage(st, now) {
  const h = st.tank.hist.filter(x => now - x[0] * 60000 <= TANK_HIST_MS);
  if (h.length < TANK_MIN_SAMPLES) return null;
  if (now - h[0][0] * 60000 < TANK_MIN_SPAN_MS) return null;
  return h.reduce((a, x) => a + x[1], 0) / h.length / 1000;
}
const eur = p => p.toFixed(3).replace('.', ',') + ' €';
async function runTank(redis, st, data, now, quietNight) {
  const t = st.tank;
  const origin = originNow(st, now);
  if (!origin) { t.lastCheck = now - TANK_CHECK_MS + 10 * 60000; t.err = 'kein Standort'; return false; }
  const c = await cheapestDiesel(origin);
  if (c.err) { t.lastCheck = now - TANK_CHECK_MS + 10 * 60000; t.err = c.err; return false; }   // in 10 Minuten nochmal
  t.lastCheck = now; t.err = null; t.last = { p: c.price, name: c.name, ort: c.place, ts: now, quelle: origin.src };
  const avg = tankAverage(st, now);   // vor dem neuen Messwert berechnet
  t.hist.push([Math.round(now / 60000), Math.round(c.price * 1000)]);
  t.hist = t.hist.filter(x => now - x[0] * 60000 <= TANK_HIST_MS);
  t.avg = avg ? Math.round(avg * 1000) / 1000 : null;
  if (avg === null || quietNight || !data.subs.length) return false;
  if (t.lastAlert && now - t.lastAlert < TANK_ALERT_GAP_MS) return false;
  const diffCt = Math.round((avg - c.price) * 100);
  if (avg - c.price < TANK_DROP_CT / 100 - 0.0005) return false;
  const km = typeof c.dist === 'number' ? ', ' + c.dist.toFixed(1).replace('.', ',') + ' km entfernt' : '';
  const ort = [c.street, c.place].filter(Boolean).join(', ');
  const r = await sendToAll(redis, data, {
    title: 'Diesel günstig: ' + eur(c.price),
    body: c.name + (ort ? ' (' + ort + ')' : '') + km + '. Das sind ' + diffCt + ' Cent unter dem Schnitt der letzten Tage (' + eur(avg) + ').',
    tag: 'tank', url: './'
  });
  if (r.sent > 0) { t.lastAlert = now; return true; }
  return false;
}

// --- Wetterwarnung für den Arbeitsweg (Glätte, Schnee, Regen) ---
const WX_EVE_MIN = 20 * 60 + 45;   // Frühschicht: Warnung am Vorabend um 20:45 Uhr (kurz vorm Schlafen)
const WX_SPAET_LEAD_MIN = 90;      // Spätschicht: so viele Minuten vor der Abfahrt
const WX_GRACE_MIN = 15;           // so lange nach der Zeit wird noch gesendet (falls ein Zeitgeber-Lauf ausfällt)
const WX_WINDOW_MIN = 180;         // so lange nach Fahrtbeginn wird das Wetter betrachtet
const WX_HEAVY_MM = 2.5;           // ab so viel Regen pro Stunde: Starkregen
const WX_RAIN_MM = 0.3;            // ab so viel pro Stunde: Regen
const hhmm = m => String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');

async function assessWeather(route, ymd, startMin, durMin) {
  try {
    const a = route.from, b = route.to, mid = { lat: (a.lat + b.lat) / 2, lon: (a.lon + b.lon) / 2 };
    const pts = [a, mid, b];
    const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pts.map(p => p.lat.toFixed(3)).join(',') + '&longitude=' + pts.map(p => p.lon.toFixed(3)).join(',') +
      '&hourly=temperature_2m,precipitation,snowfall,weather_code&timezone=Europe%2FBerlin&past_days=1&forecast_days=3';
    const r = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(7000) });
    if (!r.ok) return { err: 'Wetterdienst ' + r.status };
    const j = await r.json();
    const locs = Array.isArray(j) ? j : [j];
    const endMin = Math.min(1439, startMin + durMin);
    const startStr = ymd + 'T' + String(Math.floor(startMin / 60)).padStart(2, '0') + ':00';
    const endStr = ymd + 'T' + String(Math.floor(endMin / 60)).padStart(2, '0') + ':00';
    let minT = 99, maxP = 0, snow = 0, wet = 0, frz = false, snowCode = false, thunder = false, n = 0;
    for (const L of locs) {
      const h = L && L.hourly; if (!h || !Array.isArray(h.time)) continue;
      const i0 = h.time.findIndex(t => t >= startStr);
      if (i0 < 0) continue;
      let i1 = i0; while (i1 + 1 < h.time.length && h.time[i1 + 1] <= endStr) i1++;
      let wetSum = 0;
      for (let i = Math.max(0, i0 - 6); i <= i1; i++) wetSum += Number(h.precipitation[i]) || 0;
      if (wetSum >= 0.2) wet++;
      for (let i = i0; i <= i1; i++) {
        const t = Number(h.temperature_2m[i]), p = Number(h.precipitation[i]) || 0, sf = Number(h.snowfall[i]) || 0, c = Number(h.weather_code[i]);
        if (isFinite(t)) minT = Math.min(minT, t);
        maxP = Math.max(maxP, p); snow = Math.max(snow, sf);
        if ([56, 57, 66, 67].includes(c)) frz = true;
        if ([71, 73, 75, 77, 85, 86].includes(c)) snowCode = true;
        if (c >= 95) thunder = true;
      }
      n++;
    }
    if (!n || minT === 99) return { err: 'keine Wetterdaten' };
    const probleme = [];
    const glatt = frz || (minT <= 1 && (wet > 0));
    if (snowCode || snow > 0) { if (minT <= 3) probleme.push('Schnee'); }
    if (glatt) probleme.push('Glättegefahr');
    if (maxP >= WX_HEAVY_MM) probleme.push('Starkregen');
    else if (maxP >= WX_RAIN_MM && minT > 1) probleme.push('Regen');
    if (thunder) probleme.push('Gewitter');
    const wann = hhmm(startMin) + ' und ' + hhmm(endMin);
    const temp = 'Temperatur bis ' + Math.round(minT) + ' Grad';
    const glattOderSchnee = probleme.includes('Glättegefahr') || probleme.includes('Schnee');
    return { warn: probleme.length > 0, probleme, minT: Math.round(minT * 10) / 10, maxRegenMm: Math.round(maxP * 10) / 10, wann, temp, titel: glattOderSchnee ? 'Glätte auf dem Arbeitsweg' : (probleme.includes('Gewitter') ? 'Gewitter auf dem Arbeitsweg' : 'Regen auf dem Arbeitsweg') };
  } catch (e) { return { err: 'Wetterdienst nicht erreichbar' }; }
}
/* Ist eine Wetterwarnung fällig? (rein aus dem Speicher, kein Netzwerk) */
function weatherDue(st, now) {
  const sc = st.cfg && st.cfg.schicht, rt = st.cfg && st.cfg.route;
  if (!sc || !rt || !sc.times) return null;
  const bp = berlinParts(now);
  if (bp.min >= WX_EVE_MIN && bp.min <= WX_EVE_MIN + WX_GRACE_MIN && st.wx.eve !== bp.ymd) {
    const tm = berlinParts(now + 86400000);
    if (shiftOfWeek(sc, weekNo(tm)) === 'frueh') return { key: 'eve', day: bp.ymd, ymd: tm.ymd, start: sc.times.frueh, wo: 'Morgen früh' };
  }
  if (shiftOfWeek(sc, weekNo(bp)) === 'spaet') {
    const at = sc.times.spaet - WX_SPAET_LEAD_MIN;
    if (at >= 0 && bp.min >= at && bp.min <= at + WX_GRACE_MIN && st.wx.sp !== bp.ymd) return { key: 'sp', day: bp.ymd, ymd: bp.ymd, start: sc.times.spaet, wo: 'Heute' };
  }
  return null;
}
async function runWeather(redis, st, data, now, wd) {
  const r = await assessWeather(st.cfg.route, wd.ymd, wd.start, WX_WINDOW_MIN);
  if (r.err) { st.wx.err = r.err; return false; }   // nicht als erledigt markieren: nächste Minute nochmal
  st.wx[wd.key] = wd.day; st.wx.err = null;
  st.wx.last = { ts: now, wo: wd.wo, warnung: r.warn ? r.probleme.join(', ') : null, minT: r.minT, maxRegenMm: r.maxRegenMm };
  if (!r.warn || !data.subs.length) return false;
  const rat = r.probleme.includes('Glättegefahr') || r.probleme.includes('Schnee') ? ' Plan mehr Zeit ein und fahr vorsichtig.' : (r.probleme.includes('Starkregen') ? ' Plan etwas mehr Zeit ein.' : '');
  const out = await sendToAll(redis, data, { title: r.titel, body: wd.wo + ' zwischen ' + r.wann + ' Uhr: ' + r.probleme.join(', ') + '. ' + r.temp + '.' + rat, tag: 'wetter', url: './', alarm: (r.probleme.includes('Glättegefahr') || r.probleme.includes('Schnee')) ? 'rot' : 'orange' });
  return out.sent > 0;
}

/* Termin ohne Ortsangabe oder mit nicht berechenbarer Strecke: einfache Vorwarnung 15 Minuten vorher */
/* --- Situations-Impulse: Jarvis meldet sich von selbst, wenn die Lage passt (ohne dass ein Termin dranhängt) ---
   Regeln (je Regel höchstens einmal am Tag, insgesamt höchstens 2 am Tag, mindestens 25 Minuten Abstand, nur bei geschlossener App):
   - wechsel: Sonntag 19:00 -> "Ab morgen Frühschicht/Spätschicht"
   - bett:    21:00 am Abend vor einer Frühschicht (Mo-Fr) -> "Zeit, ins Bett zu gehen"
   - morgen:  19:30, wenn morgen Termine oder Erinnerungen anstehen -> kurze Übersicht
   Ausschalten: "Impulse aus" (Sprache) oder push_impulse. Neue Regeln: hier in impulseDue/runImpulse ergänzen. */
const IMP_WECHSEL_MIN = 19 * 60;
const IMP_MORGEN_MIN = 19 * 60 + 30;
const IMP_BETT_MIN = 21 * 60;
const IMP_GRACE_MIN = 15;
const IMP_MAX_PRO_TAG = 2;
const IMP_GAP_MS = 25 * 60000;
function impulseDue(st, now) {
  const imp = st.imp || {};
  if (imp.off) return null;
  const bp = berlinParts(now);
  if (imp.dayCount && imp.dayCount.ymd === bp.ymd && imp.dayCount.n >= IMP_MAX_PRO_TAG) return null;
  if (imp.last && now - imp.last < IMP_GAP_MS) return null;
  const sent = imp.sent || {};
  const inWin = m => bp.min >= m && bp.min <= m + IMP_GRACE_MIN;
  if (!inWin(IMP_WECHSEL_MIN) && !inWin(IMP_MORGEN_MIN) && !inWin(IMP_BETT_MIN)) return null;
  const tm = berlinParts(now + 86400000);
  const dowTm = (new Date(Date.UTC(tm.y, tm.m - 1, tm.d)).getUTCDay() + 6) % 7;   // 0 = Montag
  const sc = st.cfg && st.cfg.schicht;
  if (sc && sc.times) {
    const shTm = shiftOfWeek(sc, weekNo(tm));
    if (dowTm === 0 && inWin(IMP_WECHSEL_MIN) && sent.wechsel !== bp.ymd) return { id: 'wechsel', ymd: bp.ymd, shTm, at: sc.times[shTm] };
    if (shTm === 'frueh' && dowTm <= 4 && inWin(IMP_BETT_MIN) && sent.bett !== bp.ymd) return { id: 'bett', ymd: bp.ymd, at: sc.times.frueh };
  }
  if (inWin(IMP_MORGEN_MIN) && sent.morgen !== bp.ymd) {
    const items = st.items.filter(it => berlinParts(it.at).ymd === tm.ymd).sort((a, b) => a.at - b.at);
    if (items.length) return { id: 'morgen', ymd: bp.ymd, items };
  }
  return null;
}
async function runImpulse(redis, st, data, now, ru, appOpen) {
  if (appOpen) return false;   // die offene App spricht selbst; Regel bleibt im Zeitfenster noch offen
  st.imp.sent[ru.id] = ru.ymd;
  if (!data.subs.length) return false;
  let title, body;
  if (ru.id === 'wechsel') {
    title = 'Ab morgen ' + (ru.shTm === 'frueh' ? 'Frühschicht' : 'Spätschicht');
    body = 'Abfahrt gegen ' + spokenClock(ru.at) + '. ' + (ru.shTm === 'frueh' ? 'Geh heute etwas früher ins Bett.' : 'Du kannst morgen etwas länger schlafen.');
  } else if (ru.id === 'bett') {
    title = 'Morgen Frühschicht';
    body = 'Abfahrt gegen ' + spokenClock(ru.at) + '. Zeit, langsam ins Bett zu gehen.';
  } else {
    const ev = ru.items.filter(i => i.k === 'e'), rem = ru.items.filter(i => i.k === 'r');
    const teile = ev.slice(0, 3).map(i => berlinClock(i.at) + ' ' + i.x);
    if (ev.length > 3) teile.push('und ' + (ev.length - 3) + ' weitere');
    if (rem.length) teile.push(rem.length + (rem.length === 1 ? ' Erinnerung' : ' Erinnerungen'));
    title = 'Morgen steht an';
    body = teile.join(', ') + '.';
  }
  const out = await sendToAll(redis, data, { title, body, tag: 'imp-' + ru.id, url: './' });
  if (out.sent > 0) {
    const bp = berlinParts(now);
    st.imp.last = now;
    st.imp.dayCount = { ymd: bp.ymd, n: (st.imp.dayCount && st.imp.dayCount.ymd === bp.ymd ? st.imp.dayCount.n : 0) + 1 };
  }
  return out.sent > 0;
}

function genericDue(st, it, now) {
  if (it.k !== 'e' || st.sent[it.id]) return false;
  const lead = it.at - EVENT_LEAD_MIN * 60000;
  if (!(now >= lead && now < it.at)) return false;
  if (it.l) { const d = st.dep[it.id]; if (d && !d.fail) return false; }   // bekommt stattdessen die Abfahrts-Nachricht
  return true;
}
/* Termin mit Ort: muss der Server rechnen oder senden? (rein aus dem Speicher, kein Netzwerk) */
function depNeedsWork(st, it, now) {
  if (it.k !== 'e' || !it.l || st.sent['d' + it.id] || st.sent[it.id]) return false;
  if (it.at <= now || it.at - now > DEPART_WINDOW_MS) return false;
  const d = st.dep[it.id];
  if (!d) return true;
  if (!d.fail && now >= it.at - (d.fahrtMin + (d.stauMin || 0) + BUFFER_MIN + DEPART_LEAD_MIN) * 60000) return true;
  if (now - d.ts > 10 * 60000 && (d.fail || it.at - now < 90 * 60000)) return true;
  return false;
}
function nagNeedsWork(st, it, now) {
  if (it.k !== 'r' || it.i !== 1 || st.done[it.id]) return false;
  const n = st.nag[it.id];
  return !!n && n.n < NAG_MAX && now >= n.next;
}

async function handleDue(req, res, redis) {
  try {
    if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) return res.status(500).json({ error: 'Server: VAPID-Schlüssel fehlen' });
    const now = Date.now();
    const st = await loadItems(redis);   // nur ein Datenbank-Zugriff pro Minute, solange nichts zu tun ist

    const appOpen = now - st.alive < ALIVE_MS;
    const hour = berlinHour(now);
    const quiet = hour >= 22 || hour < 7;          // Vorwarnungen ohne Ort
    const quietDep = hour >= 22 || hour < 5;       // Abfahrts-Nachrichten: nur die tiefe Nacht ist still
    const due = st.items.filter(it => {
      if (st.sent[it.id]) return false;
      if (it.k === 'r') return it.at <= now && now - it.at <= REMINDER_GRACE_MIN * 60000;
      return genericDue(st, it, now);
    });
    // Schicht-Briefing fällig? (einmal pro Tag, in [Zeit, Zeit + 10 min])
    let brief = null;
    const sc = st.cfg && st.cfg.schicht;
    if (sc && sc.auto !== false) {
      const bp = berlinParts(now);
      const sh = shiftOfWeek(sc, weekNo(bp));
      const at = sc.times[sh];
      if (st.briefDay !== bp.ymd && bp.min >= at && bp.min <= at + BRIEF_GRACE_MIN) brief = { sh, ymd: bp.ymd };
    }
    const depList = st.items.filter(it => depNeedsWork(st, it, now)).sort((a, b) => a.at - b.at);
    const nagList = st.items.filter(it => nagNeedsWork(st, it, now));
    const tankNow = tankDue(st, now);
    const wxNow = weatherDue(st, now);
    const impNow = impulseDue(st, now);
    if (!due.length && !brief && !depList.length && !nagList.length && !tankNow && !wxNow && !impNow) return res.status(200).json({ ok: true, due: 0 });

    // Sperre: nie zwei Läufe gleichzeitig (sonst käme alles doppelt)
    const lock = await redis('SET', 'alltags-helfer:pushlock', '1', 'NX', 'EX', '40');
    if (!lock) return res.status(200).json({ ok: true, skipped: 'läuft schon' });
    let data = { subs: [] };
    try { const raw = await redis('GET', PUSH_KEY); if (raw) data = JSON.parse(raw); } catch (e) {}
    if (!Array.isArray(data.subs)) data.subs = [];

    let sent = 0, skippedApp = 0, skippedQuiet = 0, departSent = 0, nagSent = 0;
    const doneBtn = (it) => ({ actions: [{ action: 'done', title: 'Erledigt' }], doneUrl: '/api/sync?action=push_done&id=' + encodeURIComponent(it.id) + '&t=' + doneToken(it.id) });

    // 1) Abfahrtszeit für Termine mit Ort (höchstens 2 Berechnungen pro Lauf)
    let computed = 0;
    for (const it of depList) {
      let dep = st.dep[it.id];
      const stale = !dep || (now - dep.ts > 10 * 60000 && (dep.fail || it.at - now < 90 * 60000));
      if (stale) {
        if (computed >= 2) continue;
        computed++;
        const origin = originNow(st, now);
        const g = origin ? (it.g || await geoCached(st, it.l)) : null;
        const r = (origin && g) ? await routeServer(origin, g) : null;
        if (!r) { st.dep[it.id] = dep && !dep.fail ? Object.assign({}, dep, { ts: now }) : { fail: origin ? (g ? 'route' : 'ort') : 'standort', ts: now }; dep = st.dep[it.id]; }
        else {
          const sc = await checkStau({ autobahnen: r.autobahnen, from: origin, to: g });
          dep = st.dep[it.id] = { fahrtMin: r.fahrtMin, autobahnen: r.autobahnen, from: { lat: origin.lat, lon: origin.lon }, to: g, quelle: origin.src, stauMin: sc.kostMin || 0, ts: now };
        }
      }
      if (!dep || dep.fail) continue;
      const leaveAt = it.at - (dep.fahrtMin + (dep.stauMin || 0) + BUFFER_MIN) * 60000;
      if (now < leaveAt - DEPART_LEAD_MIN * 60000 || now >= it.at) continue;
      st.sent['d' + it.id] = now; st.sent[it.id] = now;
      if (appOpen) { skippedApp++; continue; }
      if (quietDep) { skippedQuiet++; continue; }
      if (!data.subs.length) continue;
      const stau = await checkStau({ autobahnen: dep.autobahnen, from: dep.from, to: dep.to });
      const mins = Math.round((leaveAt - now) / 60000);
      const wann = mins > 0 ? 'Du musst in ' + mins + ' Minuten losfahren (um ' + berlinClock(leaveAt) + ' Uhr)' : 'Du solltest jetzt losfahren';
      const teile = [wann + ' zu „' + it.x + '“ um ' + berlinClock(it.at) + ' Uhr. Fahrt etwa ' + dep.fahrtMin + ' Minuten' + (dep.stauMin ? ' ohne Stau' : '') + (dep.quelle === 'zuhause' ? ' (ab Zuhause)' : '') + '.'];
      if (stau.meldungen.length) {
        teile.push('Auf der Strecke: ' + stau.meldungen.join('; ') + '.');
        if (dep.stauMin) teile.push('Der Stau kostet etwa ' + dep.stauMin + ' Minuten, die sind schon eingerechnet.');
      } else if (stau.geprueft) teile.push('Keine Staumeldungen auf der Strecke.');
      const r2 = await sendToAll(redis, data, { title: 'Abfahrt: ' + it.x, body: teile.join(' '), tag: 'd-' + it.id, url: './' });
      if (r2.sent > 0) departSent++;
    }

    // 2) einfache Erinnerungen und Vorwarnungen (nach 1: Termine mit berechneter Strecke sind schon versorgt)
    for (const it of due) {
      if (it.k === 'e' && !genericDue(st, it, now)) continue;
      st.sent[it.id] = now;
      if (appOpen) { skippedApp++; continue; }                    // die offene App spricht selbst
      if (it.k === 'e' && quiet) { skippedQuiet++; continue; }    // Vorwarnungen schweigen nachts; eigene Erinnerungen immer
      if (!data.subs.length) continue;
      const mins = Math.max(1, Math.round((it.at - now) / 60000));
      let payload;
      if (it.k === 'r') {
        payload = { title: 'Erinnerung', body: it.x, tag: 'r-' + it.id, url: './' };
        if (it.i === 1) { Object.assign(payload, doneBtn(it)); st.nag[it.id] = { n: 0, next: now + NAG_INTERVAL_MS }; }
      } else payload = { title: 'Termin in ' + mins + ' Minuten', body: it.x + ' um ' + berlinClock(it.at) + ' Uhr', tag: 'e-' + it.id, url: './' };
      const r = await sendToAll(redis, data, payload);
      if (r.sent > 0) sent++;
    }

    // 3) Nachfassen bei wichtigen Erinnerungen (bis "Erledigt", höchstens NAG_MAX-mal)
    for (const it of nagList) {
      const n = st.nag[it.id];
      if (appOpen) { n.next = now + NAG_INTERVAL_MS; continue; }   // die App fragt selbst nach
      n.n++; n.next = now + NAG_INTERVAL_MS;
      if (!data.subs.length) continue;
      const last = n.n >= NAG_MAX;
      const r = await sendToAll(redis, data, Object.assign({
        title: last ? 'Letzte Erinnerung' : 'Noch einmal zur Erinnerung',
        body: it.x + (last ? '. Ich frage nicht weiter nach.' : '. Erledigt?'), tag: 'r-' + it.id, url: './'
      }, last ? {} : doneBtn(it)));
      if (r.sent > 0) nagSent++;
    }

    // 4) Dieselpreis-Alarm (alle 30 Minuten; nachts 22-5 Uhr nur mitschreiben, nicht melden)
    let tankSent = false;
    if (tankNow) tankSent = await runTank(redis, st, data, now, quietDep);

    // 5) Wetterwarnung für den Arbeitsweg (Frühschicht: Vorabend 20:45; Spätschicht: 90 Min. vor der Abfahrt)
    let wxSent = false;
    if (wxNow) wxSent = await runWeather(redis, st, data, now, wxNow);

    // 6) Situations-Impulse (Schichtwechsel, Bettzeit vor Frühschicht, Vorschau auf morgen)
    let impSent = false;
    if (impNow) impSent = await runImpulse(redis, st, data, now, impNow, appOpen);

    let briefSent = false;
    if (brief) {
      st.briefDay = brief.ymd;   // auch wenn die App offen ist: dann macht sie das Briefing selbst
      if (!appOpen && data.subs.length) {
        const payload = await buildBriefing(st, brief.sh, now);
        const r = await sendToAll(redis, data, payload);
        briefSent = r.sent > 0;
      }
    }
    // Aufräumen: nur Einträge behalten, die es noch gibt oder jünger als 2 Tage sind
    const ids = new Set(st.items.map(i => i.id));
    for (const k of Object.keys(st.sent)) { const base = k.replace(/^d(?=[re])/, ''); if (!ids.has(k) && !ids.has(base) && now - st.sent[k] > 2 * 86400000) delete st.sent[k]; }
    for (const k of Object.keys(st.dep)) { if (!ids.has(k)) delete st.dep[k]; }
    for (const k of Object.keys(st.nag)) { if (!ids.has(k)) delete st.nag[k]; }
    await redis('SET', ITEMS_KEY, JSON.stringify(st));
    return res.status(200).json({ ok: true, due: due.length, sent, skippedApp, skippedQuiet, briefing: briefSent, depart: departSent, nag: nagSent, tank: tankSent, wetter: wxSent, impuls: impSent });
  } catch (err) {
    return res.status(500).json({ error: 'Push-Fehler: ' + err.message });
  }
}
