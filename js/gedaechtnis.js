export default async function handler(req, res) {
  const url = process.env.UPSTASH_VECTOR_REST_URL;
  const token = process.env.UPSTASH_VECTOR_REST_TOKEN;
  if (!url || !token) return res.status(500).json({ error: 'Server: UPSTASH_VECTOR_REST_URL/TOKEN fehlen' });
  const headers = { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };

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
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (e) { body = {}; } }
  body = body || {};
  const action = String(body.action || '').toLowerCase();

  try {
    if (action === 'store') {
      const text = String(body.text || '').trim().slice(0, 2000);
      if (!text) return res.status(400).json({ error: 'Text fehlt' });
      const id = body.id ? String(body.id) : `f_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const metadata = Object.assign({ datum: new Date().toISOString() }, body.metadata || {});

      const r = await fetch(`${url}/upsert-data`, {
        method: 'POST', headers,
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
        method: 'POST', headers,
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

    if (action === 'search') {
      const query = String(body.query || '').trim().slice(0, 500);
      if (!query) return res.status(400).json({ error: 'Suchtext fehlt' });
      const topK = Math.min(20, Math.max(1, Number(body.topK) || 5));
      const minScore = Number(body.minScore) || 0.0;

      const r = await fetch(`${url}/query-data`, {
        method: 'POST', headers,
        body: JSON.stringify({ data: query, topK, includeMetadata: true, includeData: true }),
        signal: AbortSignal.timeout(8000)
      });
      const d = await r.json();
      if (!r.ok) return res.status(502).json({ error: 'Upstash meldet: ' + (d.error || JSON.stringify(d)) });

      const treffer = ((d.result) || [])
        .filter(v => (v.score || 0) >= minScore)
        .map(v => ({ text: v.data, score: v.score, metadata: v.metadata || {} }));

      return res.status(200).json({ treffer });
    }

    return res.status(400).json({ error: `Unbekannte Aktion: ${action}` });

  } catch (error) {
    return res.status(500).json({ error: `Server-Fehler: ${error.message}` });
  }
}

(function () {
    const lastStored = {};

    function describeNow() {
        const now = new Date();
        const datum = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
        const zeit = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        const iso = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        return { datum, zeit, iso };
    }

    function rememberInLongTerm(action, text) {
        try {
            const said = String(text || '').trim().slice(0, 300);
            if (!said || typeof window.storeSemanticMemory !== 'function' && typeof storeSemanticMemory !== 'function') return;
            const now = Date.now();
            if (lastStored[said] && now - lastStored[said] < 15000) return;
            lastStored[said] = now;
            const d = describeNow();
            const bits = Object.keys(action || {})
                .filter(k => /memory/i.test(k) && k !== 'type' && action[k] != null && typeof action[k] !== 'object')
                .map(k => String(action[k]).trim()).filter(Boolean);
            const eintrag = bits.length ? ` (gemerkt als: ${bits.join(' - ').slice(0, 160)})` : '';
            const entry = `Am ${d.datum} um ${d.zeit} hat der Nutzer ausdrücklich darum gebeten, sich Folgendes zu merken: "${said}"${eintrag}`;
            (window.storeSemanticMemory || storeSemanticMemory)(entry, { quelle: 'merk_dir', datum: d.iso });
        } catch (e) {}
    }

    if (typeof window.executeAction === 'function' && !window.executeAction._gedaechtnis) {
        const originalExecute = window.executeAction;
        const wrappedExecute = async function (action, text) {
            const result = await originalExecute.apply(this, arguments);
            try { if (action && action.type === 'memory_store') rememberInLongTerm(action, text); } catch (e) {}
            return result;
        };
        wrappedExecute._gedaechtnis = true;
        window.executeAction = wrappedExecute;
    }

    const MEMORY_QUESTION = /\b(?:warum|wieso|weshalb|wann|was|wie)\b.{0,25}\b(?:habe|hab|hatte|hast|haben)\b.{0,12}\b(?:ich|wir)\b.{0,40}\b(?:gebeten|gesagt|erzählt|aufgetragen|befohlen|gewünscht|gemerkt|mitgeteilt|erklärt)\b|\bwoher\s+(?:weißt|kennst)\s+du\b|\bworan\s+erinnerst\s+du\s+dich\b|\bwas\s+weißt\s+du\s+(?:noch\s+)?(?:über|von)\s+mich\b|\bdarum\s+gebeten\b|\bdich\s+gebeten\b/i;
    const MEMORY_RULE =
        '\n\nGEDÄCHTNIS-FRAGEN: Fragt der Nutzer, warum, wann oder was er dir gesagt, aufgetragen oder dich gebeten hat, oder woher du etwas weißt, dann antworte direkt aus den Daten ' +
        '"gedächtnis" (Liste) und "gedächtnis_semantisch" (Langzeitgedächtnis) und aus dem bisherigen Gespräch. Nutze dafür KEINE memory_search-Aktion, wenn dort schon passende Einträge stehen. ' +
        'Einträge im Langzeitgedächtnis nennen Datum und Uhrzeit und den Originalsatz des Nutzers: nenne dann das Datum (zum Beispiel "Das haben Sie am Samstag, den 4. Oktober, gesagt") und gib seinen Wunsch in eigenen Worten wieder. ' +
        'Einen Grund nennst du nur, wenn der Nutzer ihn wirklich gesagt hat. Steht dort kein Grund, sag das ehrlich ("Einen Grund haben Sie mir nicht genannt") and frag höchstens kurz, ob du dir den Grund merken sollst. ' +
        'Antworte niemals nur mit "nichts gefunden", wenn zum Thema ein Eintrag existiert. Erfinde nichts dazu.';

    const LAUGH_RULE =
        '\n\nLACHEN: Der Nutzer wünscht sich ausdrücklich, dass du öfter lachst. Schreibe darum in lockeren Antworten ab und zu ein kurzes "Haha" oder "Hehe" an eine passende Stelle, ' +
        'etwa nach einem Scherz oder wenn etwas lustig ist, in ungefähr jeder zweiten lockeren Antwort, höchstens einmal pro Antwort. Bei ernsten Themen (Warnungen, Gesundheit, Arzt, Geld, Fehler, Erinnerungen) lachst du nie.';

    if (typeof window.buildSystemPrompt === 'function' && !window.buildSystemPrompt._gedaechtnis) {
        const originalPrompt = window.buildSystemPrompt;
        const wrappedPrompt = function (text) {
            let base = originalPrompt.apply(this, arguments);
            try { if (MEMORY_QUESTION.test(String(text || ''))) base += MEMORY_RULE; } catch (e) {}
            try { if (typeof window.jvLaughWish === 'function' && window.jvLaughWish()) base += LAUGH_RULE; } catch (e) {}
            return base;
        };
        wrappedPrompt._gedaechtnis = true;
        Object.keys(originalPrompt).forEach(k => { try { wrappedPrompt[k] = originalPrompt[k]; } catch (e) {} });
        window.buildSystemPrompt = wrappedPrompt;
    }

    window.jvMemoryQuestion = (t) => MEMORY_QUESTION.test(String(t || ''));
})();
