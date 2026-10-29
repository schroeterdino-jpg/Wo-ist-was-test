/* ============================================================
   Phase 7A: Prüfwelt für das lokale Gedächtnis (memoryItems) und seine Kopplungen.
   Lädt die GANZE App (tests/umgebung.js, alle Skripte aus index.html in echter Reihenfolge) und stellt dazu bereit:
   - ein Schreibprotokoll des Gerätespeichers (L = localStorage, S = sessionStorage, mit - = entfernt),
   - eine Server-Attrappe für den Datenabgleich: die ECHTE Datei api/sync.js, dahinter ein Redis aus dem Speicher (nur GET/SET),
     mit Fehlerarten (500, offline, leere Antwort, kaputte Antwort, verspätete Antwort),
   - einen Zähler für Aufrufe an /api/memory (Langzeitgedächtnis, Vektor) mit Attrappen-Antwort,
   - Hilfen für Referenzidentität (Referenz merken/vergleichen), Proxy-Erkennung, Neustart mit demselben Speicher.
   Kein Produktcode wird verändert. Gegenproben ändern den Quelltext nur im Speicher (quelleAendern).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path'), os = require('os'), url = require('url');
const { starte, lies } = require('./umgebung.js');

const MEMKEYS = ['helfer_memory', 'helfer_memory_zeit', 'helfer_sync_meta', 'helfer_reminders'];
const GEHEIM = 'geheim';
let syncHandler = null;
async function ladeSyncHandler() {
    if (syncHandler) return syncHandler;
    const tmp = path.join(os.tmpdir(), 'sync_7a_' + process.pid + '.mjs');
    fs.copyFileSync(path.join(__dirname, '..', 'api', 'sync.js'), tmp);
    try { syncHandler = (await import(url.pathToFileURL(tmp).href)).default; } finally { try { fs.unlinkSync(tmp); } catch (e) { } }
    return syncHandler;
}


/* Ruft die ECHTE api/sync.js auf. daten = Redis-Inhalt (Schlüssel -> Text). opt: ohneSecret (APP_SECRET fehlt), ohneSpeicher (KV-Variablen fehlen), redisWeg (Redis wirft), redis (Liste der Befehle) */
async function syncAufruf(daten, req, opt) {
    opt = opt || {};
    const handler = await ladeSyncHandler();
    async function redisFetch(u, o) {
        if (opt.redisWeg) throw new Error('Redis nicht erreichbar');
        const cmd = JSON.parse(o.body); if (opt.redis) opt.redis.push(cmd[0]);
        if (opt.verzahnt) await new Promise(r => setImmediate(r));   // gibt anderen gleichzeitigen Aufrufen die Chance, dazwischen zu laufen
        if (cmd[0] === 'GET') return { json: async () => ({ result: daten[cmd[1]] === undefined ? null : daten[cmd[1]] }) };
        if (cmd[0] === 'SET') { daten[cmd[1]] = cmd[2]; return { json: async () => ({ result: 'OK' }) }; }
        return { json: async () => ({ result: null }) };
    }
    const viele = Array.isArray(req);   // mehrere gleichzeitige Aufrufe unter EINER Umgebung (Konkurrenz-Messung)
    const einzel = () => { let status = 200, payload; const res = { status(c) { status = c; return this; }, json(p) { payload = p; return this; } }; return { res, ergebnis: () => ({ status, payload }) }; };
    const alt = { fetch: global.fetch, a: process.env.APP_SECRET, b: process.env.KV_REST_API_URL, c: process.env.KV_REST_API_TOKEN, d: process.env.UPSTASH_REDIS_REST_URL, e: process.env.UPSTASH_REDIS_REST_TOKEN };
    delete process.env.UPSTASH_REDIS_REST_URL; delete process.env.UPSTASH_REDIS_REST_TOKEN;
    if (opt.ohneSecret) delete process.env.APP_SECRET; else process.env.APP_SECRET = GEHEIM;
    if (opt.ohneSpeicher) { delete process.env.KV_REST_API_URL; delete process.env.KV_REST_API_TOKEN; } else { process.env.KV_REST_API_URL = 'https://kv.test'; process.env.KV_REST_API_TOKEN = 't'; }
    global.fetch = redisFetch;
    try {
        const lauf = (r) => { const e = einzel(); return handler(Object.assign({ query: {}, headers: {} }, r), e.res).then(() => e.ergebnis()); };
        return viele ? await Promise.all(req.map(lauf)) : await lauf(req);
    }
    finally { global.fetch = alt.fetch; for (const [k, v] of [['APP_SECRET', alt.a], ['KV_REST_API_URL', alt.b], ['KV_REST_API_TOKEN', alt.c], ['UPSTASH_REDIS_REST_URL', alt.d], ['UPSTASH_REDIS_REST_TOKEN', alt.e]]) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
}

/* Server-Attrappe: modus 'ok' | 'fehler500' | 'offline' | 'leer' | 'kaputt' | 'verspaetet'. Bei 'verspaetet' wartet die Antwort, bis freigeben() gerufen wird
   (nur für GET; verspaetetPost = auch für POST). daten = Inhalt des Redis (Schlüssel -> Text). */
function serverAttrappe(start) {
    const s = { modus: 'ok', daten: Object.assign({}, start || {}), anfragen: [], redis: [], wartet: null, loslassen: null, verspaetetPost: false };
    s.freigeben = function () { if (s.loslassen) { s.loslassen(); s.loslassen = null; } };
    s.setzeItems = function (items) { s.daten['alltags-helfer:data'] = JSON.stringify({ items }); };
    s.items = function () { try { return JSON.parse(s.daten['alltags-helfer:data'] || '{}').items || {}; } catch (e) { return null; } };
    s.antwort = async function (u, o) {
        o = o || {}; const methode = String(o.method || 'GET').toUpperCase();
        let body = null; try { body = o.body ? JSON.parse(o.body) : null; } catch (e) { }
        s.anfragen.push({ methode, ids: body && body.items ? Object.keys(body.items) : [] });
        if (s.modus === 'offline') throw new Error('offline (Attrappe)');
        if (s.modus === 'fehler500') return { ok: false, status: 500, json: async () => ({ error: 'Server kaputt' }) };
        if (s.modus === 'leer') return { ok: true, status: 200, json: async () => ({}) };
        if (s.modus === 'kaputt') return { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token < in JSON'); } };
        if (s.modus === 'verspaetet' && (methode === 'GET' || s.verspaetetPost)) await new Promise(res => { s.loslassen = res; });
        const r = await syncAufruf(s.daten, { method: methode, headers: { 'x-app-key': (o.headers || {})['x-app-key'] || '' }, query: {}, body }, { redis: s.redis });
        const status = r.status, payload = r.payload;
        return { ok: status < 400, status, json: async () => payload };
    };
    return s;
}

/* opt: speicher, sitzung (Vorbelegung), server (Server-Attrappe), quelleAendern(datei, text) (nur Gegenproben), memoryAntwort(body) (Antwort der /api/memory-Attrappe), versteckt (document.hidden = true) */
function welt(opt) {
    opt = opt || {};
    const log = [], memAufrufe = [], server = opt.server || serverAttrappe();
    const speicher = Object.assign({}, opt.speicher || {});
    if (opt.mitSync && speicher.app_secret === undefined) speicher.app_secret = GEHEIM;
    const routing = async (u, o) => {
        if (u.indexOf('/api/sync') === 0) return server.antwort(u, o);
        if (u.indexOf('/api/memory') === 0) {
            let b = null; try { b = JSON.parse(o.body); } catch (e) { }
            memAufrufe.push(b);
            const antwort = typeof opt.memoryAntwort === 'function' ? opt.memoryAntwort(b) : { ok: true };
            return { ok: true, status: 200, json: async () => antwort };
        }
        throw new Error('offline (Attrappe): ' + u);
    };
    const A = starte({ sekundenTakt: true, weitereTakte: [3000], echteTakte: true, festerZufall: true, speicherProtokoll: log, speicher, sitzung: opt.sitzung, fetch: routing, quelleAendern: opt.quelleAendern, jetzt: opt.jetzt });
    if (opt.versteckt) Object.defineProperty(A.sb.document, 'hidden', { get: () => true, configurable: true });
    const ev = expr => { try { return A.vm.runInContext(expr, A.sb); } catch (e) { return { fehler: String(e.message).slice(0, 120) }; } };
    const w = {
        A, log, server, memAufrufe, ev, ladefehler: A.ladefehler,
        markiere() { log.length = 0; memAufrufe.length = 0; },
        schreibzaehler(keys) {
            const out = {};
            for (const e of log) { const k = e[1]; if (!(keys || MEMKEYS).includes(k)) continue; const t = e[0]; out[k] = out[k] || {}; out[k][t] = (out[k][t] || 0) + 1; }
            return out;
        },
        json(k) { const v = A.store[k]; if (v === undefined) return undefined; try { return JSON.parse(v); } catch (e) { return 'KAPUTT:' + v; } },
        merke(n) { return ev('window.__ref_' + n + ' = memoryItems; true'); },
        gleich(n) { return ev('window.__ref_' + n + ' === memoryItems'); },
        proxy() { return ev('typeof memoryItems === "object" && memoryItems !== null && memoryItems.__jvZeitProxy === true'); },
        keys() { return ev('Object.keys(memoryItems)'); },
        timerNamen() { return A.timerListe().filter(t => t.name === 'ensureProxy').length; },
        async speichere(key, wert) { return A.ki('Merk dir ' + key, [{ type: 'memory_store', memory_key: key, memory_value: wert }]); },
        async listEdit(op, items, neu) { return A.ki('Gedächtnis ändern', [{ type: 'list_edit', list_name: 'gedaechtnis', list_op: op, list_items: items, list_new_value: neu || '' }]); },
        neustart(extra) {   // wie ein Neuladen der Seite: gleicher Gerätespeicher (und Sitzungsspeicher), frische App
            return welt(Object.assign({}, opt, { speicher: Object.assign({}, A.store), sitzung: Object.assign({}, A.sess), server }, extra || {}));
        }
    };
    return w;
}

module.exports = { welt, serverAttrappe, syncAufruf, MEMKEYS, GEHEIM, lies };
