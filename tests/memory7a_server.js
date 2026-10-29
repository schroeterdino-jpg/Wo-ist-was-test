/* ============================================================
   Phase 7A: Server-Befunde (nur Messen, kein Servercode geändert).
   - api/sync.js (Datenabgleich, enthält das lokale Gedächtnis helfer_memory) und
   - api/memory.js (Langzeitgedächtnis, Upstash Vector)
   werden als ECHTE Dateien mit Attrappen für Redis/Upstash aufgerufen. Gemessen wird: Methoden, Auth, Eingabe, Ausgabe, Fehlerverhalten, leere Antworten,
   Konkurrenz (letzter Schreiber), und welche Funktionen der App die Endpunkte tatsächlich aufrufen (statisch).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), url = require('url');
const { syncAufruf, GEHEIM } = require('./memory7a_welt.js');
const ROOT = path.join(__dirname, '..');

let memHandler = null;
async function ladeMem() {
    if (memHandler) return memHandler;
    const tmp = path.join(os.tmpdir(), 'memory_7a_' + process.pid + '.mjs');
    fs.copyFileSync(path.join(ROOT, 'api', 'memory.js'), tmp);
    try { memHandler = (await import(url.pathToFileURL(tmp).href)).default; } finally { try { fs.unlinkSync(tmp); } catch (e) { } }
    return memHandler;
}
/* Upstash-Attrappe: vektoren = Liste { id, data, metadata }; opt.fehler = 'upstash502' | 'netz' | 'leer' */
async function memAufruf(vektoren, req, opt) {
    opt = opt || {};
    const handler = await ladeMem(), log = [];
    const upstash = async (u, o) => {
        if (opt.verzahnt) await new Promise(r => setImmediate(r));
        if (opt.fehler === 'netz') throw new Error('Upstash nicht erreichbar');
        const pfad = new url.URL(u).pathname, b = JSON.parse((o && o.body) || 'null'); log.push(pfad);
        if (opt.fehler === 'upstash502') return { ok: false, status: 500, json: async () => ({ error: 'kaputt' }) };
        if (opt.fehler === 'leer') return { ok: true, status: 200, json: async () => ({}) };
        let payload = {};
        if (pfad.startsWith('/query-data')) payload = { result: vektoren.map(v => ({ id: v.id, data: v.data, metadata: v.metadata, score: 0.5 })).slice(0, b.topK) };
        else if (pfad.startsWith('/range')) payload = { result: { vectors: vektoren.map(v => ({ id: v.id, data: v.data, metadata: v.metadata })), nextCursor: '0' } };
        else if (pfad.startsWith('/delete')) { let n = 0; b.forEach(id => { const i = vektoren.findIndex(v => v.id === id); if (i >= 0) { vektoren.splice(i, 1); n++; } }); payload = { result: { deleted: n } }; }
        else if (pfad.startsWith('/fetch')) payload = { result: b.ids.map(id => vektoren.find(v => v.id === id) || null) };
        else if (pfad.startsWith('/upsert-data')) { const i = vektoren.findIndex(v => v.id === b.id); const e = { id: b.id, data: b.data, metadata: b.metadata }; if (i >= 0) vektoren[i] = e; else vektoren.push(e); payload = { result: 'Success' }; }
        return { ok: true, status: 200, json: async () => payload };
    };
    const viele = Array.isArray(req);
    const einzel = () => { let status = 200, payload; const res = { status(c) { status = c; return this; }, json(p) { payload = p; return this; } }; return { res, ergebnis: () => ({ status, payload, pfade: log }) }; };
    const alt = { fetch: global.fetch, u: process.env.UPSTASH_VECTOR_REST_URL, t: process.env.UPSTASH_VECTOR_REST_TOKEN, a: process.env.APP_SECRET, p: process.env.PROFILE_CODES };
    if (opt.ohneEnv) { delete process.env.UPSTASH_VECTOR_REST_URL; delete process.env.UPSTASH_VECTOR_REST_TOKEN; } else { process.env.UPSTASH_VECTOR_REST_URL = 'https://up.test'; process.env.UPSTASH_VECTOR_REST_TOKEN = 't'; }
    process.env.APP_SECRET = GEHEIM; if (opt.profile) process.env.PROFILE_CODES = opt.profile; else delete process.env.PROFILE_CODES;
    global.fetch = upstash;
    try {
        const lauf = r => { const e = einzel(); return handler(Object.assign({ query: {}, headers: { 'x-app-key': GEHEIM } }, r), e.res).then(() => e.ergebnis()); };
        return viele ? await Promise.all(req.map(lauf)) : await lauf(req);
    }
    finally { global.fetch = alt.fetch; for (const [k, v] of [['UPSTASH_VECTOR_REST_URL', alt.u], ['UPSTASH_VECTOR_REST_TOKEN', alt.t], ['APP_SECRET', alt.a], ['PROFILE_CODES', alt.p]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}
const kurz = p => p && typeof p === 'object' ? JSON.stringify(p).slice(0, 80) : p;

async function syncBefunde() {
    const o = {};
    const items = (daten) => { try { return JSON.parse(daten['alltags-helfer:data']).items; } catch (e) { return null; } };
    const post = (daten, bodyItems, opt) => syncAufruf(daten, { method: 'POST', headers: { 'x-app-key': GEHEIM }, body: { items: bodyItems } }, opt);
    const get = (daten, opt, key) => syncAufruf(daten, { method: 'GET', headers: { 'x-app-key': key === undefined ? GEHEIM : key } }, opt);
    let d = {};
    o.ohneKey = (await get(d, {}, '')).status; o.falscherKey = (await get(d, {}, 'falsch')).status;
    o.ohneSecret = (await get(d, { ohneSecret: true })).status; o.ohneSpeicher = (await get(d, { ohneSpeicher: true })).status;
    o.methodePut = (await syncAufruf(d, { method: 'PUT', headers: { 'x-app-key': GEHEIM } })).status;
    d = {}; let r = await post(d, { helfer_memory: { v: JSON.stringify({ a: '1' }), ts: 1000 } });
    o.postLiefertAlles = { status: r.status, schluessel: Object.keys(r.payload.items) };
    r = await post(d, { helfer_memory: { v: JSON.stringify({ a: '2' }), ts: 500 } }); o.aelterZeitstempel = { gespeichert: JSON.parse(items(d).helfer_memory.v).a };
    r = await post(d, { helfer_memory: { v: JSON.stringify({ a: '3' }), ts: 1000 } }); o.gleicherZeitstempel = { gespeichert: JSON.parse(items(d).helfer_memory.v).a };
    r = await post(d, { helfer_memory: { v: JSON.stringify({ a: '4' }), ts: 2000 } }); o.neuererZeitstempel = { gespeichert: JSON.parse(items(d).helfer_memory.v).a };
    r = await post(d, { unbekannt: { v: 'x', ts: 1 }, helfer_contacts: { v: 5, ts: 1 }, helfer_shopping: { v: '[]', ts: 'jetzt' }, helfer_todo_entries: { v: 'x'.repeat(200001), ts: 1 } });
    o.ungueltigeEingaben = { status: r.status, schluesselDanach: Object.keys(items(d)).sort() };
    o.kaputtesJsonAlsWert = (await post(d, { helfer_memory: { v: '{kaputt', ts: 3000 } })).status; o.kaputtesJsonAlsWertWirdGespeichert = items(d).helfer_memory.v === '{kaputt';
    d = { 'alltags-helfer:data': '{abgeschnitten' }; r = await post(d, { helfer_memory: { v: JSON.stringify({ neu: '1' }), ts: 1 } });
    o.beschaedigterGesamtwert = { status: r.status, danach: Object.keys(items(d)) };   // alte Daten werden stillschweigend ersetzt
    d = {}; r = await syncAufruf(d, { method: 'POST', headers: { 'x-app-key': GEHEIM }, body: { items: { helfer_memory: { v: JSON.stringify({ a: 'x'.repeat(190000) }), ts: 1 }, helfer_contacts: { v: 'y'.repeat(190000), ts: 1 }, helfer_shopping: { v: 'z'.repeat(190000), ts: 1 }, helfer_todo_entries: { v: 'q'.repeat(190000), ts: 1 }, helfer_rezepte: { v: 'w'.repeat(190000), ts: 1 } } } });
    o.zuGross = { status: r.status };
    o.redisWeg = (await get({}, { redisWeg: true })).status; o.redisWegFehlertext = String((await get({}, { redisWeg: true })).payload.error).slice(0, 40);
    o.getLeerLiefert = kurz((await get({}, {})).payload);
    // Konkurrenz: zwei Geräte laden gleichzeitig, beide laden hoch (jeder POST liest und schreibt den Gesamtstand neu)
    d = {};
    await syncAufruf(d, [{ method: 'POST', headers: { 'x-app-key': GEHEIM }, body: { items: { helfer_memory: { v: JSON.stringify({ vonA: '1' }), ts: 10 } } } }, { method: 'POST', headers: { 'x-app-key': GEHEIM }, body: { items: { helfer_contacts: { v: '{}', ts: 11 } } } }], { verzahnt: true });
    o.gleichzeitigeBereiche = { gespeichert: Object.keys(items(d) || {}).sort(), hinweis: 'Zwei gleichzeitige POSTs lesen beide den alten Gesamtstand; der zuletzt schreibende ersetzt den anderen (ein Gerät lädt beim nächsten Abgleich erneut hoch)' };
    return o;
}

async function memBefunde() {
    const o = {};
    const V = () => [{ id: 'a', data: 'Eintrag A', metadata: { typ: 'episode', datum: '2026-10-01T00:00:00Z' } }];
    const post = (v, body, opt) => memAufruf(v, { method: 'POST', body }, opt);
    o.ohneKey = (await memAufruf(V(), { method: 'POST', headers: {}, body: { action: 'search', query: 'x' } })).status;
    o.falscherKey = (await memAufruf(V(), { method: 'POST', headers: { 'x-app-key': 'falsch' }, body: { action: 'search', query: 'x' } })).status;
    o.ohneUmgebung = (await post(V(), { action: 'search', query: 'x' }, { ohneEnv: true })).status;
    o.getStattPost = (await memAufruf(V(), { method: 'GET' })).status;
    o.optionen = (await memAufruf(V(), { method: 'OPTIONS' })).status;
    o.unbekannteAktion = (await post(V(), { action: 'xyz' })).status;
    o.storeOhneText = (await post(V(), { action: 'store', text: '   ' })).status;
    o.deleteOhneIds = (await post(V(), { action: 'delete' })).status;
    o.searchOhneText = (await post(V(), { action: 'search', query: '' })).status;
    let v = V(); let r = await post(v, { action: 'store', text: 'x'.repeat(3000), id: 'neu' }); o.storeKuerztAuf = { status: r.status, laenge: v.find(e => e.id === 'neu').data.length };
    v = V(); await post(v, { action: 'store', text: 'erste Fassung', id: 'gleich' }); await post(v, { action: 'store', text: 'zweite Fassung', id: 'gleich' });
    o.gleicheIdUeberschreibt = { anzahl: v.filter(e => e.id === 'gleich').length, text: v.find(e => e.id === 'gleich').data };
    o.upstashFehler = (await post(V(), { action: 'search', query: 'abc' }, { fehler: 'upstash502' })).status;
    o.upstashNetz = (await post(V(), { action: 'search', query: 'abc' }, { fehler: 'netz' })).status;
    r = await post(V(), { action: 'search', query: 'abc' }, { fehler: 'leer' }); o.leereAntwortSearch = { status: r.status, treffer: (r.payload.treffer || []).length };
    r = await post(V(), { action: 'list' }, { fehler: 'leer' }); o.leereAntwortList = { status: r.status, treffer: (r.payload.treffer || []).length };
    r = await post(V(), { action: 'listall' }, { fehler: 'leer' }); o.leereAntwortListall = { status: r.status, eintraege: (r.payload.eintraege || []).length };
    o.topKbegrenzt = (await post(V(), { action: 'search', query: 'abc', topK: 999 })).status;
    o.reflectOhneCron = (await memAufruf(V(), { method: 'GET', query: { action: 'reflect' } })).status;
    // Konkurrenz: mark liest und schreibt ohne Sperre – zwei gleichzeitige Markierungen verlieren eine
    v = [{ id: 'e1', data: 'Termin', metadata: { typ: 'episode', ereignis_datum: '2026-10-01', status: 'offen', frage: 'wie war es?', jaehrlich: false } }];
    await memAufruf(v, [{ method: 'POST', body: { action: 'mark', id: 'e1', art: 'anstoss', today: '2026-10-29' } }, { method: 'POST', body: { action: 'mark', id: 'e1', art: 'anstoss_aus' } }], { verzahnt: true });
    o.gleichzeitigeMarkierungen = { anstoss_tag: !!v[0].metadata.anstoss_tag, anstoss_aus: !!v[0].metadata.anstoss_aus };
    o.markUnbekannteId = (await post(V(), { action: 'mark', id: 'gibtsnicht', art: 'heute' })).status;
    // Profile: eigener Namensraum je Code
    r = await memAufruf(V(), { method: 'POST', headers: { 'x-app-key': 'gast1' }, body: { action: 'list' } }, { profile: 'gast1, gast2' });
    o.profilCode = { status: r.status, namensraum: r.pfade[0] };
    r = await memAufruf(V(), { method: 'POST', headers: { 'x-app-key': 'gast3' }, body: { action: 'list' } }, { profile: 'gast1, gast2' }); o.profilCodeUnbekannt = r.status;
    return o;
}

/* Wer ruft die Endpunkte tatsächlich auf? (statisch; Dateien mit apiFetch('/api/memory') und die dort vorkommenden Aktionen) */
function aufrufer() {
    const dir = path.join(ROOT, 'js'), out = { memory: {}, sync: [] };
    for (const f of fs.readdirSync(dir).filter(x => /\.js$/.test(x))) {
        const q = fs.readFileSync(path.join(dir, f), 'utf8');
        if (/['"`]\/api\/memory/.test(q)) { const a = new Set(); (q.match(/action:\s*['"](\w+)['"]/g) || []).forEach(m => a.add(m.replace(/action:\s*['"]/, '').replace(/['"]/, ''))); (q.match(/body\.action\s*=\s*['"](\w+)['"]/g) || []).forEach(m => a.add(m.replace(/.*=\s*['"]/, '').replace(/['"]/, ''))); out.memory[f] = Array.from(a).sort(); }
        if (/['"`]\/api\/sync['"`?]/.test(q) && !/^(systemcheck|diagnose)/.test(f)) out.sync.push(f);
    }
    out.sync.sort();
    return out;
}

async function alle() { return { sync: await syncBefunde(), memory: await memBefunde(), aufrufer: aufrufer() }; }
module.exports = { alle };
if (require.main === module) { process.on('unhandledRejection', () => { }); alle().then(r => console.log(JSON.stringify(r, null, 1))); }
