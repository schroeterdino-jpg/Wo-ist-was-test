// Semantisches Langzeit-Gedächtnis (Upstash Vector, mit eingebautem Embedding-Modell - kein zusätzlicher
// Embedding-Anbieter wie OpenAI nötig, Upstash übernimmt das serverseitig).
// Hier liegen NUR Erlebnisse, Pläne, Daten, Vorlieben und Kontext. Gegenstände mit Ablageort gehören ins lokale Gedächtnis der App.
// Aktionen über denselben Endpunkt (spart eine der 12 möglichen Serverless Functions):
// POST { action: 'store', text, id?, metadata? } -> legt einen neuen Eintrag ab (gleiche id = überschreiben)
// POST { action: 'search', query, topK?, minScore? } -> findet die bedeutungsähnlichsten gespeicherten Einträge
// POST { action: 'list', limit?, prefix? } -> listet Einträge direkt auf, ohne Ähnlichkeits-Vergleich
// POST { action: 'listall' } -> alle Einträge mit id (fürs Aufräumen)
// POST { action: 'delete', ids } -> löscht Einträge
// POST { action: 'due', today } -> Einträge, zu denen heute nachgefragt oder an die heute erinnert werden soll
// POST { action: 'mark', id, art, year } -> merkt sich, dass nachgefragt bzw. erinnert wurde
// POST { action: 'fristen', today, all? } -> Fristen aus E-Mails (typ 'frist'): fällige Erinnerungen, oder mit all:true alle offenen
// POST { action: 'mark', id, art:'frist_vor'|'frist_heute'|'frist_ueber'|'frist_erledigt' } -> Frist-Erinnerung vermerken bzw. erledigt
// GET ?action=reflect -> vom täglichen Cronjob (vercel.json) aufgerufen; macht jetzt nichts mehr (siehe unten)

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// Liest ALLE Einträge seitenweise (range liefert immer nur einen Teil)
async function rangeAll(url, headers, maxItems = 2000) {
  const out = [];
  let cursor = '0';
  for (let i = 0; i < 40 && out.length < maxItems; i++) {
    const r = await fetch(`${url}/range`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ cursor, limit: 100, includeMetadata: true, includeData: true }),
      signal: AbortSignal.timeout(8000)
    });
    const d = await r.json();
    if (!r.ok) throw new Error('Upstash meldet: ' + (d.error || JSON.stringify(d)));
    const result = d.result || {};
    (result.vectors || []).forEach(v => out.push({ id: v.id, text: v.data, metadata: v.metadata || {} }));
    cursor = result.nextCursor;
    if (!cursor || cursor === '0') break;
  }
  return out;
}

export default async function handler(req, res) {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;

  if (!url || !token) return res.status(500).json({ error: 'Server: UPSTASH_VECTOR_REST_URL/TOKEN fehlen' });

  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  };

  // Der tägliche Cronjob ruft diese Route per GET auf
  if (req.method === 'GET' && req.query && req.query.action === 'reflect') {
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) return res.status(500).json({ error: 'Server: CRON_SECRET fehlt' });
    if ((req.headers['authorization'] || '') !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Nicht erlaubt' });
    return reflectAndStore(url, headers, res);
  }

  const expected = process.env.APP_SECRET;
  if (!expected) return res.status(500).json({ error: 'Server: APP_SECRET fehlt' });
  if ((req.headers['x-app-key'] || '') !== expected) return res.status(401).json({ error: 'Nicht erlaubt' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Nur POST erlaubt' });

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};
  const action = String(body.action || '').toLowerCase();

  try {
    if (action === 'store') {
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return res.status(400).json({ error: 'Text fehlt' });

      const id = body.id ? String(body.id) : `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const metadata = Object.assign({ datum: new Date().toISOString() }, body.metadata || {});

      const r = await fetch(`${url}/upsert-data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, data: text, metadata }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });

      return res.status(200).json({ ok: true, id });
    }

    if (action === 'list') {
      const limit = Math.min(30, Math.max(1, Number(body.limit) || 15));
      const rangeBody = { cursor: '0', limit: Math.max(limit, 60), includeMetadata: true, includeData: true };
      if (body.prefix) rangeBody.prefix = String(body.prefix);

      const r = await fetch(`${url}/range`, {
        method: 'POST',
        headers,
        body: JSON.stringify(rangeBody),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });

      const treffer = ((d.result && d.result.vectors) || [])
        .map(v => ({ text: v.data, metadata: v.metadata || {} }))
        .sort((a, b) => new Date(b.metadata.datum || 0) - new Date(a.metadata.datum || 0))
        .slice(0, limit);

      return res.status(200).json({ treffer });
    }

    if (action === 'listall') {
      const eintraege = await rangeAll(url, headers);
      return res.status(200).json({ eintraege });
    }

    if (action === 'delete') {
      const ids = (Array.isArray(body.ids) ? body.ids : []).map(String).filter(Boolean).slice(0, 200);
      if (!ids.length) return res.status(400).json({ error: 'Keine IDs angegeben' });
      const r = await fetch(`${url}/delete`, {
        method: 'POST',
        headers,
        body: JSON.stringify(ids),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });
      return res.status(200).json({ ok: true, deleted: (d.result && d.result.deleted) !== undefined ? d.result.deleted : ids.length });
    }

    // Einträge, bei denen die App heute nachfragen ("Wie war es beim Schwimmen?") oder erinnern ("Heute hat ... Geburtstag") soll
    if (action === 'due') {
      const today = ISO_DAY.test(String(body.today || '')) ? String(body.today) : new Date().toISOString().slice(0, 10);
      const year = Number(today.slice(0, 4));
      const from = addDays(today, -14);   // Nachfragen verfallen nach zwei Wochen
      const all = await rangeAll(url, headers);
      const due = [];
      for (const e of all) {
        const m = e.metadata || {};
        if (m.typ !== 'episode' || !ISO_DAY.test(String(m.ereignis_datum || ''))) continue;
        const yearly = m.jaehrlich === true || m.jaehrlich === 'true';
        if (yearly) {
          const occ = `${year}${String(m.ereignis_datum).slice(4)}`;   // dieses Jahr am selben Tag
          if (occ === today && Number(m.hinweis_jahr) !== year && m.hinweis) due.push({ art: 'heute', id: e.id, text: e.text, metadata: m });
          else if (occ < today && occ >= from && Number(m.nachgefragt_jahr) !== year && m.frage) due.push({ art: 'nachfragen', id: e.id, text: e.text, metadata: m });
        } else if (m.status === 'offen' && m.ereignis_datum < today && m.ereignis_datum >= from && m.frage) {
          due.push({ art: 'nachfragen', id: e.id, text: e.text, metadata: m });
        }
      }
      // Hinweise für heute zuerst, dann das älteste Ereignis
      due.sort((a, b) => (a.art === 'heute' ? 0 : 1) - (b.art === 'heute' ? 0 : 1) || String(a.metadata.ereignis_datum).localeCompare(String(b.metadata.ereignis_datum)));
      return res.status(200).json({ due: due.slice(0, 3) });
    }

    // Fristen aus E-Mails: Erinnerung 2 Tage vorher, am Tag selbst, einmal wenn überfällig
    if (action === 'fristen') {
      const today = ISO_DAY.test(String(body.today || '')) ? String(body.today) : new Date().toISOString().slice(0, 10);
      const all = await rangeAll(url, headers);
      const diffDays = d => Math.round((new Date(d + 'T12:00:00Z') - new Date(today + 'T12:00:00Z')) / 86400000);
      const out = [];
      for (const e of all) {
        const m = e.metadata || {};
        if (m.typ !== 'frist' || m.status === 'erledigt') continue;
        const hasDate = ISO_DAY.test(String(m.ereignis_datum || ''));
        const diff = hasDate ? diffDays(m.ereignis_datum) : null;
        if (body.all) { out.push({ id: e.id, text: e.text, metadata: m, tage: diff }); continue; }
        if (!hasDate) continue;
        if (diff === 0 && !m.erinnert_heute) out.push({ stufe: 'heute', id: e.id, text: e.text, metadata: m, tage: diff });
        else if (diff > 0 && diff <= 2 && !m.erinnert_vor) out.push({ stufe: 'vor', id: e.id, text: e.text, metadata: m, tage: diff });
        else if (diff < 0 && diff >= -7 && !m.erinnert_ueber) out.push({ stufe: 'ueber', id: e.id, text: e.text, metadata: m, tage: diff });
      }
      out.sort((a, b) => (a.tage === null) - (b.tage === null) || a.tage - b.tage);
      return res.status(200).json({ fristen: body.all ? out.slice(0, 50) : out.slice(0, 3) });
    }

    // Vermerkt, dass zu einem Eintrag nachgefragt bzw. erinnert wurde (damit es nur einmal passiert)
    if (action === 'mark') {
      const id = String(body.id || '');
      if (!id) return res.status(400).json({ error: 'ID fehlt' });
      const fr = await fetch(`${url}/fetch`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ ids: [id], includeMetadata: true, includeData: true }),
        signal: AbortSignal.timeout(8000)
      });
      const fd = await fr.json();
      const v = fr.ok && Array.isArray(fd.result) ? fd.result[0] : null;
      if (!v) return res.status(404).json({ error: 'Eintrag nicht gefunden' });
      const meta = Object.assign({}, v.metadata || {});
      const year = Number(body.year) || new Date().getFullYear();
      const yearly = meta.jaehrlich === true || meta.jaehrlich === 'true';
      if (String(body.art).startsWith('frist_')) {
        const a = String(body.art).slice(6);
        if (a === 'erledigt') meta.status = 'erledigt';
        else if (a === 'vor' || a === 'heute' || a === 'ueber') meta['erinnert_' + a] = true;
      }
      else if (String(body.art) === 'heute') meta.hinweis_jahr = year;
      else { meta.nachgefragt_jahr = year; if (!yearly) meta.status = 'nachgefragt'; }
      const ur = await fetch(`${url}/upsert-data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, data: v.data, metadata: meta }),
        signal: AbortSignal.timeout(8000)
      });
      const ud = await ur.json();
      if (!ur.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (ud.error || JSON.stringify(ud)) });
      return res.status(200).json({ ok: true });
    }

    if (action === 'search') {
      const query = String(body.query || '').trim().slice(0, 500);
      if (!query) return res.status(400).json({ error: 'Suchtext fehlt' });

      const topK = Math.min(20, Math.max(1, Number(body.topK) || 5));
      const minScore = Number(body.minScore) || 0.0; // Optionaler Schwellenwert für Relevanz

      const r = await fetch(`${url}/query-data`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          data: query,
          topK: topK,
          includeMetadata: true,
          includeData: true
        }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });

      // Ergebnisse filtern und formatieren
      const treffer = ((d.result) || [])
        .filter(v => v.score >= minScore)
        .map(v => ({
          id: v.id,
          text: v.data,
          score: v.score,
          metadata: v.metadata || {}
        }));

      return res.status(200).json({ treffer });
    }

    return res.status(400).json({ error: `Unbekannte Aktion: ${action}` });

  } catch (error) {
    return res.status(500).json({ error: 'Interner Serverfehler: ' + error.message });
  }
}

// Früher legte der Cronjob jeden Tag einen inhaltslosen Eintrag ("Tägliche Reflektion ... Analysierte Fakten: 50") im Gedächtnis ab.
// Der verschmutzte die Suche. Der Cronjob bleibt bestehen (vercel.json muss nicht angefasst werden), speichert aber nichts mehr.
async function reflectAndStore(url, headers, res) {
  return res.status(200).json({ ok: true, message: 'Nichts zu tun: Die tägliche Reflektion speichert keine Einträge mehr.' });
}
