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
    // Schicht-Briefing fällig? (einmal pro Tag, in [Zeit, Zeit + 10 min])
    let brief = null;
    const sc = st.cfg && st.cfg.schicht;
    if (sc && sc.auto !== false) {
      const bp = berlinParts(now);
      const sh = shiftOfWeek(sc, weekNo(bp));
      const at = sc.times[sh];
      if (st.briefDay !== bp.ymd && bp.min >= at && bp.min <= at + BRIEF_GRACE_MIN) brief = { sh, ymd: bp.ymd };
    }
    if (!due.length && !brief) return res.status(200).json({ ok: true, due: 0 });

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
    let briefSent = false;
    if (brief) {
      st.briefDay = brief.ymd;   // auch wenn die App offen ist: dann macht sie das Briefing selbst
      if (!appOpen && data.subs.length) {
        const payload = await buildBriefing(st, brief.sh, now);
        const r = await sendToAll(redis, data, payload);
        briefSent = r.sent > 0;
      }
    }
    // Aufräumen: Gesendet-Liste nur für Einträge, die es noch gibt oder die jünger als 2 Tage sind
    const ids = new Set(st.items.map(i => i.id));
    for (const k of Object.keys(st.sent)) { if (!ids.has(k) && now - st.sent[k] > 2 * 86400000) delete st.sent[k]; }
    await redis('SET', ITEMS_KEY, JSON.stringify(st));
    return res.status(200).json({ ok: true, due: due.length, sent, skippedApp, skippedQuiet, briefing: briefSent });
  } catch (err) {
    return res.status(500).json({ error: 'Push-Fehler: ' + err.message });
  }
}
