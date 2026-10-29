/* ============================================================
   Hilfen für Tests des Langzeit-Vektorgedächtnisses (Phase 5D.1): die ECHTE Server-Datei api/memory.js mit einem Attrappen-Vektorspeicher
   (Upstash), eingehängt an apiFetch der Testwelt. Die Ähnlichkeit ist ein Stellvertreter (Stichwort-Treffer): gemessen wird, was der Code
   der App mit den Treffern macht, nicht wie gut ein Embedding ist. Ändert keine Produktdatei.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), os = require('os'), url = require('url'), vm = require('vm');
const UP = 'https://upstash.test';

async function ladeHandler() {
    const tmp = path.join(os.tmpdir(), 'memory_5d_' + process.pid + '.mjs');
    fs.copyFileSync(path.join(__dirname, '..', 'api', 'memory.js'), tmp);
    try { return (await import(url.pathToFileURL(tmp).href)).default; } finally { try { fs.unlinkSync(tmp); } catch (e) { } }
}
function envSetzen() {
    const env = { UPSTASH_VECTOR_REST_URL: UP, UPSTASH_VECTOR_REST_TOKEN: 't', APP_SECRET: 'geheim' }, alt = {}, fetchAlt = global.fetch;
    for (const k of Object.keys(env)) { alt[k] = process.env[k]; process.env[k] = env[k]; }
    return () => { for (const k of Object.keys(env)) { if (alt[k] === undefined) delete process.env[k]; else process.env[k] = alt[k]; } global.fetch = fetchAlt; };
}
const stamm = t => String(t).toLowerCase().replace(/[^a-zäöüß0-9 ]+/g, ' ').split(/\s+/).filter(x => x.length >= 4).map(x => x.slice(0, 5));
function bewerte(frage, v) {
    const txt = String(v.data).toLowerCase();
    return Math.min(0.95, 0.15 + 0.2 * stamm(frage).filter(s => txt.indexOf(s) >= 0).length);
}
function upstash(vektoren, log) {
    return async (u, o) => {
        const pfad = new url.URL(u).pathname, b = JSON.parse((o && o.body) || 'null');
        let payload = {};
        if (pfad.startsWith('/query-data')) {
            log.push('upstash:query topK=' + b.topK);
            payload = { result: vektoren.map(v => ({ id: v.id, data: v.data, metadata: v.metadata, score: bewerte(b.data, v) })).sort((x, y) => y.score - x.score).slice(0, b.topK) };
        } else if (pfad.startsWith('/range')) { log.push('upstash:range'); payload = { result: { vectors: vektoren.map(v => ({ id: v.id, data: v.data, metadata: v.metadata })), nextCursor: '0' } }; }
        else if (pfad.startsWith('/delete')) { log.push('upstash:delete ' + b.join(',')); b.forEach(id => { const i = vektoren.findIndex(v => v.id === id); if (i >= 0) vektoren.splice(i, 1); }); payload = { result: { deleted: b.length } }; }
        else if (pfad.startsWith('/upsert-data')) { vektoren.push({ id: b.id, data: b.data, metadata: b.metadata }); payload = { result: 'Success' }; }
        return { ok: true, status: 200, json: async () => payload };
    };
}
async function rufeApi(handler, bodyStr) {
    let status = 200, payload; const res = { status(c) { status = c; return this; }, json(p) { payload = p; return this; } };
    await handler({ method: 'POST', headers: { 'x-app-key': 'geheim' }, body: bodyStr }, res);
    return { status, payload };
}
/* opt.fehler: { search|listall|delete: 'wirft' | '502' | 'leer' | 'kaputt' }, opt.latenz: { search|listall: ms } */
function verbinde(w, handler, vektoren, opt) {
    opt = opt || {}; const log = [];
    global.fetch = upstash(vektoren, log);
    w.sb.apiFetch = async (u, o) => {
        if (String(u).indexOf('/api/memory') < 0) return { ok: false, status: 404, json: async () => ({}) };
        const b = JSON.parse(o.body), f = opt.fehler && opt.fehler[b.action];
        log.push('app:' + b.action + (b.topK ? ' topK=' + b.topK : ''));
        if (f === 'wirft') throw new Error('offline (Test)');
        if (f === '502') return { ok: false, status: 502, json: async () => ({ error: 'kaputt' }) };
        if (f === 'leer') return { ok: true, status: 200, json: async () => ({}) };
        if (f === 'kaputt') return { ok: true, status: 200, json: async () => ({ treffer: 'kein Array', eintraege: 'kein Array' }) };
        const wait = opt.latenz && opt.latenz[b.action];
        if (wait) await new Promise(r => w.sb.setTimeout(r, wait));
        const r = await rufeApi(handler, o.body);
        return { ok: r.status < 300, status: r.status, json: async () => r.payload };
    };
    return log;
}
const heuteIso = w => vm.runInContext("new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' })", w.sb);
const plusTage = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lesbar = iso => new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

/* Einträge, so wie die App sie ablegt */
function fixture(d0) {
    const ep = (id, text, kat, extra) => ({ id, data: text, metadata: Object.assign({ typ: 'episode', kategorie: kat, datum_gesagt: plusTage(d0, -1), quelle: 'gespraech', status: 'ohne_nachfrage' }, extra || {}) });
    const mitDatum = (text, iso) => text + ' (' + lesbar(iso) + ')';
    const plan = tag => ({ id: 'stundenplan_isabel_' + tag.toLowerCase(), data: 'Stundenplan von Isabel, ' + tag + ': 1. Mathe, 2. Deutsch, 3. Sport, 4. Englisch', metadata: { typ: 'episode', kategorie: 'Stundenplan', person: 'Isabel', wochentag: tag, quelle: 'foto', datum_gesagt: plusTage(d0, -5), status: 'ohne_nachfrage', anstoss_aus: true } });
    return {
        d0, ep, mitDatum, plan,
        schwimmen: ep('e1', mitDatum('Der User geht mit Finja schwimmen.', plusTage(d0, 1)), 'Event', { ereignis_datum: plusTage(d0, 1), frage: 'Frage beiläufig, wie es war.', status: 'offen' }),
        zahnarzt: ep('e12', mitDatum('Der User hat einen Zahnarzttermin.', plusTage(d0, 4)), 'Event', { ereignis_datum: plusTage(d0, 4) }),
        naechsteWoche: ep('e13', mitDatum('Der User besucht seine Mutter.', plusTage(d0, 6)), 'Event', { ereignis_datum: plusTage(d0, 6) }),
        kaffee: ep('e2', 'Der User trinkt Kaffee ohne Zucker und mag zum Frühstück Brötchen mit Marmelade.', 'Vorliebe'),
        liam: ep('e3', mitDatum('Liam hat Geburtstag.', plusTage(d0, 3)), 'Geburtstag', { ereignis_datum: plusTage(d0, 3), jaehrlich: true }),
        liam2: ep('e4', 'Liam, der Enkel, mag Dinosaurier und Lego.', 'Vorliebe'),
        sylt: ep('e5', mitDatum('Der User fährt mit seiner Frau nach Sylt.', plusTage(d0, 30)), 'Event', { ereignis_datum: plusTage(d0, 30) }),
        krimi1: ep('e8', 'Der User liest gern Krimis.', 'Vorliebe'),
        krimi2: ep('e9', 'Der User liest gern Krimis.', 'Vorliebe'),
        umlaut: ep('e11', 'Der User mag Müsli mit Äpfeln, Zimt & Süßem und sagt „Prost“ (ß, ü, ö).', 'Vorliebe'),
        stimmungMitDatum: ep('e14', 'Der User war am Wochenende gestresst wegen der Spätschicht.', 'Stimmung', { ereignis_datum: plusTage(d0, 2) }),
        vorliebeMitDatum: ep('e15', 'Der User mag Eis im Sommer.', 'Vorliebe', { ereignis_datum: plusTage(d0, 2) }),
        merkdir: { id: 'm1', data: 'Am 12.10.2026 um 18:00 hat der Nutzer ausdrücklich darum gebeten, sich Folgendes zu merken: "Der Zweitschlüssel liegt bei der Nachbarin" (gemerkt als: Zweitschlüssel - bei der Nachbarin)', metadata: { quelle: 'merk_dir', datum: plusTage(d0, -16) + 'T18:00:00.000Z' } },
        auto: { id: 'm2', data: 'lieblingsessen: Pizza Margherita', metadata: { datum: plusTage(d0, -20) + 'T10:00:00.000Z' } },
        ohneMeta: { id: 'm3', data: 'Die Waschmaschine steht im Keller', metadata: {} },
        fristTyp: { id: 'f1', data: 'Vertrag kündigen', metadata: { typ: 'frist', status: 'offen', ereignis_datum: plusTage(d0, 3) } },
        fristEpisode: ep('f2', mitDatum('Der User muss den Handyvertrag kündigen.', plusTage(d0, 3)), 'Event', { ereignis_datum: plusTage(d0, 3), frist: true }),
        fueller: n => Array.from({ length: n }, (_, i) => ep('x' + i, 'Der User hat die Notiz Nummer ' + (i + 1) + ' zum Thema Haushalt aufgeschrieben.', 'Event'))
    };
}
module.exports = { UP, ladeHandler, envSetzen, verbinde, heuteIso, plusTage, lesbar, fixture, rufeApi };
