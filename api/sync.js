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
        if (it.k === 'r' && it.i === 1) o.i = 1;
        items.push(o);
      }
      const st = await loadItems(redis);
      st.items = items.filter(o => !st.done[o.id]);   // am Sperrbildschirm als erledigt markierte Erinnerungen nicht wieder aufnehmen
      const doneIds = Object.keys(st.done);
      for (const k of doneIds) { if (Date.now() - st.done[k] > 2 * 86400000) delete st.done[k]; }
      await redis('SET', ITEMS_KEY, JSON.stringify(st));
      return res.status(200).json({ ok: true, count: st.items.length, done: Object.keys(st.done) });
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
  if (!st.cfg || typeof st.cfg !== 'object') st.cfg = {};
  for (const k of ['nag', 'done', 'dep', 'geo']) { if (!st[k] || typeof st[k] !== 'object') st[k] = {}; }
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
  const meldungen = []; let geprueft = 0;
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
      if (meldungen.length < 3) meldungen.push(roads[i] + (kurz ? ' ' + kurz : '') + ' (' + art + ')');
    });
  });
  return { geprueft: geprueft > 0, meldungen };
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
  const g = await geocodeServer(text);
  st.geo[key] = g ? { lat: g.lat, lon: g.lon, ts: Date.now() } : { fail: true, ts: Date.now() };
  const keys = Object.keys(st.geo);
  if (keys.length > 30) { keys.sort((a, b) => (st.geo[a].ts || 0) - (st.geo[b].ts || 0)); delete st.geo[keys[0]]; }
  return g;
}

/* Termin ohne Ortsangabe oder mit nicht berechenbarer Strecke: einfache Vorwarnung 15 Minuten vorher */
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
  if (!d.fail && now >= it.at - (d.fahrtMin + BUFFER_MIN + DEPART_LEAD_MIN) * 60000) return true;
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
    if (!due.length && !brief && !depList.length && !nagList.length) return res.status(200).json({ ok: true, due: 0 });

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
        const g = origin ? await geoCached(st, it.l) : null;
        const r = (origin && g) ? await routeServer(origin, g) : null;
        if (!r) { st.dep[it.id] = dep && !dep.fail ? Object.assign({}, dep, { ts: now }) : { fail: origin ? (g ? 'route' : 'ort') : 'standort', ts: now }; dep = st.dep[it.id]; }
        else dep = st.dep[it.id] = { fahrtMin: r.fahrtMin, autobahnen: r.autobahnen, from: { lat: origin.lat, lon: origin.lon }, to: g, quelle: origin.src, ts: now };
      }
      if (!dep || dep.fail) continue;
      const leaveAt = it.at - (dep.fahrtMin + BUFFER_MIN) * 60000;
      if (now < leaveAt - DEPART_LEAD_MIN * 60000 || now >= it.at) continue;
      st.sent['d' + it.id] = now; st.sent[it.id] = now;
      if (appOpen) { skippedApp++; continue; }
      if (quietDep) { skippedQuiet++; continue; }
      if (!data.subs.length) continue;
      const stau = await checkStau({ autobahnen: dep.autobahnen, from: dep.from, to: dep.to });
      const mins = Math.round((leaveAt - now) / 60000);
      const wann = mins > 0 ? 'Du musst in ' + mins + ' Minuten losfahren (um ' + berlinClock(leaveAt) + ' Uhr)' : 'Du solltest jetzt losfahren';
      const teile = [wann + ' zu „' + it.x + '“ um ' + berlinClock(it.at) + ' Uhr. Fahrt etwa ' + dep.fahrtMin + ' Minuten' + (dep.quelle === 'zuhause' ? ' (ab Zuhause)' : '') + '.'];
      if (stau.meldungen.length) {
        teile.push('Auf der Strecke: ' + stau.meldungen.join('; ') + '.');
        if (stau.meldungen.some(m => /\((Stau|Unfall|Sperrung)\)/.test(m))) teile.push('Plane etwa 10 Minuten mehr ein.');
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
    return res.status(200).json({ ok: true, due: due.length, sent, skippedApp, skippedQuiet, briefing: briefSent, depart: departSent, nag: nagSent });
  } catch (err) {
    return res.status(500).json({ error: 'Push-Fehler: ' + err.message });
  }
}
