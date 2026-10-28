/* ============================================================
   MESSNETZ "Aktions-Kette" (Golden Master) - A5, Teil 1

   Was wird hier festgehalten?
   Jede Aktion der KI läuft durch executeAction. Davor hängen heute 8 Umhüllungen (formulierungen, routinen, lagebild, langzeit,
   langzeit_erinnern, geburtstag_ganztag, gedaechtnis, loeschen_fragen), in der Reihenfolge, in der die Dateien in index.html geladen werden.
   Dieses Programm spielt viele Aktionen durch die ECHTE Kette (ganze App, Attrappe für Uhr, Netz, Handy-Brücke) und schreibt für jedes Szenario
   einen "Fingerabdruck" auf: Fehler, ctx (Zähler, Karten, Notizen, Fenster), Rückgabewert, Gesprochenes, geänderte Speicher-Schlüssel (jv_*, helfer_* ...),
   Netzaufrufe in Reihenfolge, Handy-Brücke, Zeitgeber, window.open, Aufrufe der wichtigsten Hilfsfunktionen.
   tests/aktionen_soll.json ist der Fingerabdruck des Codes VOR dem Umbau. Ändert sich das Verhalten, schlägt der Test fehl.

   Das Programm ändert KEINEN App-Code. Aufruf:
     node tests/aktionen.js            prüft gegen tests/aktionen_soll.json (zweimal, Wiederholung muss identisch sein; dann Wächterprobe)
     node tests/aktionen.js --neu      schreibt tests/aktionen_soll.json NEU (nur bewusst, wenn sich das Verhalten gewollt ändert)
     node tests/aktionen.js --schnell  ohne Wächterprobe
     node tests/aktionen.js --bericht  zusätzlich Abdeckung als Text

   Zeit und Zufall sind fest (Uhr steht auf Mi 28.10.2026 10:00 Berlin, Math.random = 0.5); es wird NICHTS herausgerechnet,
   außer dass sehr lange Speicherwerte als Länge + Anfang + Prüfsumme stehen (gleicher Inhalt = gleiche Prüfsumme) und der Aufrufer-Name
   der Sprachausgabe fehlt (er hängt vom Stapel ab, nicht vom Verhalten).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';   // wie auf dem Handy: viele Stellen der App rechnen mit der Ortszeit des Geräts (sonst fällt der Lauf auf einem UTC-Rechner anders aus)
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { starte } = require('./umgebung.js');

const SOLL = path.join(__dirname, 'aktionen_soll.json');
const WRAPPER = ['formulierungen', 'routinen', 'lagebild', 'langzeit', 'langzeit_erinnern', 'geburtstag_ganztag', 'gedaechtnis', 'loeschen_fragen'];
const BASIS_TYPEN = ['name_change', 'shopping', 'todo', 'memory_store', 'memory_search', 'reminder', 'reminder_delete', 'calendar_delete', 'calendar_update', 'parking_save',
    'home_save', 'work_save', 'world_live', 'world_news', 'protocol_save', 'protocol_delete', 'backup_export', 'parking_clear', 'navigate', 'call', 'whatsapp', 'show_panel',
    'list_edit', 'calendar_search', 'briefing_add', 'briefing_delete', 'calendar'];
const WRAPPER_TYPEN = ['phrase_save', 'phrase_delete', 'episode_store', 'episode_asked', 'episode_forget', 'episode_nicht_fragen', 'calendar_allday'];

const kurz = s => String(s == null ? '' : s).replace(/\s+/g, ' ').slice(0, 90);
const hash = s => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);
function wert(v) {   // Speicherwert: kurz im Klartext, lang als Länge + Anfang + Prüfsumme
    v = String(v);
    return v.length <= 600 ? v : { laenge: v.length, anfang: v.slice(0, 200), sha: hash(v) };
}
function json(v) { try { const s = JSON.stringify(v); return s === undefined ? 'undefined' : s; } catch (e) { return '(nicht darstellbar)'; } }

/* ---------- Attrappe für Google und Gedächtnis-Server ---------- */
function antwort(status, body) { return { ok: status >= 200 && status < 300, status, json: async () => body, text: async () => JSON.stringify(body), headers: { get: () => null } }; }
function netz(modus) {   // modus: 'aus' (alles offline), 'ok' (Google + Gedächtnis antworten), 'google_fehler' (Google lehnt ab)
    let n = 0; const events = [];   // Google-Attrappe mit Gedächtnis: angelegte Termine kommen in der Liste wieder
    return async function (u, o) {
        o = o || {};
        const m = String(o.method || 'GET').toUpperCase();
        if (modus === 'aus') throw new Error('offline (Attrappe)');
        if (/googleapis\.com\/calendar/.test(u)) {
            if (modus === 'google_fehler') return antwort(500, { error: { message: 'Fehler (Attrappe)' } });
            const idm = /\/events\/([^/?]+)/.exec(u);
            if (m === 'POST') { const e = Object.assign({ id: 'g' + (++n), status: 'confirmed' }, JSON.parse(o.body || '{}')); events.push(e); return antwort(200, e); }
            if (m === 'DELETE') { const i = events.findIndex(e => idm && e.id === idm[1]); if (i >= 0) events.splice(i, 1); return antwort(204, {}); }
            if (m === 'PATCH' || m === 'PUT') { const e = events.find(x => idm && x.id === idm[1]); if (e) Object.assign(e, JSON.parse(o.body || '{}')); return antwort(200, e || { id: 'g0' }); }
            return antwort(200, { items: events.slice() });
        }
        if (/nominatim/.test(u)) return antwort(200, { address: { road: 'Teststraße', house_number: '7', city: 'Berlin', country: 'Deutschland' } });
        if (/\/api\//.test(u)) return antwort(200, { ok: true, items: [], results: [], due: [] });
        throw new Error('offline (Attrappe): ' + kurz(u));
    };
}

/* ---------- Ein Szenario ---------- */
const SPIONE = ['addGoogleCalendarEvent', 'addGoogleCalendarReminder', 'deleteReminderEntry', 'deleteCalendarEntry', 'updateGoogleCalendarEvent', 'storeSemanticMemory',
    'openGoogleCalendarApp', 'saveParkingSpot', 'clearParkingSpot', 'showActionCards', 'exportAllData', 'computeDepartureAdvice', 'resolveTravelDestination', 'googleNotSynced',
    'saveProtocol', 'deleteProtocol', 'executeListEdit', 'addBriefingWish', 'deleteBriefingWishesByQuery', 'saveHomeAddress', 'saveWorkAddress', 'speak'];

async function laufe(sz, optionen) {
    optionen = optionen || {};
    const modus = sz.netz || 'aus';
    const aufrufNetz = [];
    const netzFn = netz(modus);
    const app = starte({ festerZufall: true, native: sz.native ? true : false, fetch: async (u, o) => { aufrufNetz.push({ m: String((o && o.method) || 'GET').toUpperCase(), u: String(u).length > 90 ? String(u).slice(0, 90) + '#' + hash(u) : String(u), body: o && o.body ? wert(o.body) : undefined }); return netzFn(String(u), o || {}); }, ohneSkripte: optionen.ohneSkripte || [] });
    const sb = app.sb;
    if (app.ladefehler.length) throw new Error('Ladefehler: ' + app.ladefehler.join('; '));
    if (modus !== 'aus') app.vm.runInContext("accessToken = 'test-token'; googleTokenExpiresAt = Date.now() + 86400000 * 30;", sb);

    const log = [];     // alles, was Spione sehen, in Reihenfolge
    for (const f of SPIONE) {
        const o = sb[f]; if (typeof o !== 'function') continue;
        if (f === 'computeDepartureAdvice' && !sz.lage) continue;
        try {
            const spion = function () {
                const args = Array.from(arguments).map(a => typeof a === 'function' ? '(Funktion)' : kurz(json(a)));
                const r = o.apply(this, arguments);
                if (r && typeof r.then === 'function') return r.then(x => { log.push({ f, a: args, r: kurz(json(x)) }); return x; }, e => { log.push({ f, a: args, fehler: kurz(e && e.message) }); throw e; });
                log.push({ f, a: args, r: kurz(json(r)) }); return r;
            };
            Object.keys(o).forEach(k => { try { spion[k] = o[k]; } catch (e) { } });
            sb[f] = spion;
        } catch (e) { }
    }
    if (sz.lage) {   // Lagebild-Berechnung ersetzen (die echte braucht Karten und Verkehrsdaten): feste Antwort
        sb.computeDepartureAdvice = async function (p) { log.push({ f: 'computeDepartureAdvice', a: [kurz(json(p))] }); return sz.lage === 'leer' ? null : { reply: 'Lagebild: Fahrzeit 25 Minuten, Abfahrt 10:35 (Attrappe).' }; };
    }
    const timerLog = [];
    for (const f of ['setTimeout', 'setInterval']) {
        const o = sb[f];
        sb[f] = function (fn, ms) { timerLog.push({ art: f, ms: Number(ms) || 0, fn: kurz(typeof fn === 'function' ? Function.prototype.toString.call(fn) : String(fn)).slice(0, 70) }); return o.apply(this, arguments); };
    }
    const opens = [];
    sb.open = function () { opens.push(Array.from(arguments).map(a => kurz(a)).join(' | ')); return null; };

    if (sz.vorher) await sz.vorher(app);
    for (let i = 0; i < 5; i++) await new Promise(r => setImmediate(r));   // angestoßene Hintergrundarbeit (z. B. Kalender neu laden) fertig werden lassen
    // Ausgangslage: nach dem Vorbereiten festhalten, damit nur die Wirkung der Schritte zählt
    const start = { store: Object.assign({}, app.store), gesagt: app.gesagt.length, ereignisse: app.ereignisse.length };
    let storeVor = Object.assign({}, start.store);
    const schritte = [];
    const ctx = { counter: 0, cards: [], notes: [], panel: null };
    log.length = 0; aufrufNetz.length = 0; timerLog.length = 0; opens.length = 0;

    for (const s of sz.schritte) {
        const e0 = { l: log.length, n: aufrufNetz.length, t: timerLog.length, o: opens.length, g: app.gesagt.length, ev: app.ereignisse.length };
        const ctx0 = json(ctx);
        const rec = {};
        if (s.vor) { rec.vor = s.vor; await app.vorspulen(s.vor); }
        else if (s.satz != null || s.antworte != null || 'a' in s) {
            let fehler = null, ergebnis, haengt = false;
            try {
                let x;
                if ('a' in s) x = await app.lassLaufen(() => sb.executeAction(s.a, s.text, ctx));
                else if (s.satz != null) x = await app.lassLaufen(() => sb.handleLocalCommand(s.satz));
                else x = await app.lassLaufen(() => sb.jvLoeschFrage.antworte(s.antworte));
                if (x.haengt) haengt = true; else ergebnis = x.wert;
            } catch (e) { fehler = { name: String(e && e.name), text: String(e && (e.userMessage || e.message)), userMessage: e && e.userMessage ? true : false, auth: e && e.auth ? true : false }; }
            await new Promise(r => setImmediate(r));
            if ('a' in s) rec.aktion = json(s.a); if (s.text !== undefined) rec.text = s.text;
            if (s.satz != null) rec.satz = s.satz; if (s.antworte != null) rec.antworte = s.antworte;
            rec.fehler = fehler; if (haengt) rec.haengt = true;
            rec.rueckgabe = json(ergebnis);
        }
        // Wirkung
        const storeNach = Object.assign({}, app.store);
        const aend = {};
        for (const k of new Set([...Object.keys(storeVor), ...Object.keys(storeNach)])) if (storeVor[k] !== storeNach[k]) aend[k] = storeNach[k] === undefined ? '(gelöscht)' : wert(storeNach[k]);
        storeVor = storeNach;
        rec.ctxVorher = ctx0 === json(ctx) ? undefined : ctx0;
        rec.ctx = { counter: ctx.counter, karten: ctx.cards.map(json), notizen: ctx.notes.map(n => typeof n === 'string' ? n : json(n)), fenster: json(ctx.panel) };
        rec.gesagt = app.gesagt.slice(e0.g);
        rec.speicher = aend;
        rec.netz = aufrufNetz.slice(e0.n);
        rec.bruecke = app.ereignisse.slice(e0.ev).filter(e => e.art === 'brücke' || e.art === 'karte').map(e => e.art + ': ' + e.text);
        rec.zeitgeber = timerLog.slice(e0.t);
        rec.open = opens.slice(e0.o);
        rec.spione = log.slice(e0.l);
        rec.frageOffen = !!(sb.jvLoeschFrage && sb.jvLoeschFrage.offen());
        rec.uhr = new Date(app.uhr.ms).toISOString();
        schritte.push(rec);
    }
    const ex = sb.executeAction;
    return {
        schritte,
        ende: {
            ctx: { counter: ctx.counter, karten: ctx.cards.length, notizen: ctx.notes.length },
            merkmale: Object.keys(ex).filter(k => k[0] === '_').sort().concat([typeof ex, ex.constructor && ex.constructor.name]),
            speicherGesamt: Object.keys(app.store).sort().filter(k => !(k in start.store) || start.store[k] !== app.store[k]),
            offeneFrage: !!(sb.jvLoeschFrage && sb.jvLoeschFrage.offen())
        }
    };
}



/* ---------- Vergleich ---------- */
function unterschiede(soll, ist, pfad, aus) {
    aus = aus || [];
    if (aus.length >= 6) return aus;
    if (JSON.stringify(soll) === JSON.stringify(ist)) return aus;
    if (soll && ist && typeof soll === 'object' && typeof ist === 'object' && Array.isArray(soll) === Array.isArray(ist)) {
        const ks = new Set([...Object.keys(soll), ...Object.keys(ist)]);
        for (const k of ks) unterschiede(soll[k], ist[k], pfad + '.' + k, aus);
    } else aus.push(pfad + ': soll ' + kurz(json(soll)).slice(0, 90) + '  ist ' + kurz(json(ist)).slice(0, 90));
    return aus;
}

async function alle(szenarien, optionen) {
    const out = {};
    for (const s of szenarien) {
        try { out[s.name] = await laufe(s, optionen); }
        catch (e) { out[s.name] = { abbruch: String(e && e.message).slice(0, 200) }; }
    }
    return JSON.parse(JSON.stringify(out));   // gleiche Form wie aus der Datei
}

function abdeckung(szenarien) {
    const typen = new Set(), wrapper = {};
    for (const w of WRAPPER) wrapper[w] = [];
    for (const s of szenarien) {
        for (const st of s.schritte) if ('a' in st && st.a) {
            typen.add(st.a.type === undefined ? '(ohne Typ)' : st.a.type);
            if (st.a.calendar_text) typen.add('calendar_text');
            if (st.a.calendar_allday) typen.add('calendar_allday');
        } else if ('a' in st) typen.add('(null)');
        for (const w of s.wrapper) if (wrapper[w]) wrapper[w].push(s.name);
    }
    return { typen, wrapper };
}

async function haupt() {
    const args = process.argv.slice(2);
    const { SZENARIEN } = require('./aktionen_szenarien.js');
    const namen = SZENARIEN.map(s => s.name);
    let fehler = 0;
    const meld = (ok, text) => { console.log((ok ? '  ✓ ' : '  ✗ ') + text); if (!ok) fehler++; };

    console.log('Messnetz Aktions-Kette: ' + SZENARIEN.length + ' Szenarien');
    meld(new Set(namen).size === namen.length, 'Szenarien-Namen sind eindeutig');

    const ab = abdeckung(SZENARIEN);
    const fehlenBasis = BASIS_TYPEN.filter(t => !ab.typen.has(t)), fehlenW = WRAPPER_TYPEN.filter(t => !ab.typen.has(t));
    meld(!fehlenBasis.length, 'alle ' + BASIS_TYPEN.length + ' Grund-Aktionstypen kommen vor' + (fehlenBasis.length ? ' - es fehlen: ' + fehlenBasis.join(', ') : ''));
    meld(!fehlenW.length, 'alle ' + WRAPPER_TYPEN.length + ' Typen der Umhüllungen kommen vor' + (fehlenW.length ? ' - es fehlen: ' + fehlenW.join(', ') : ''));
    meld(['(ohne Typ)', '(null)'].every(t => ab.typen.has(t)) && [...ab.typen].some(t => !BASIS_TYPEN.includes(t) && !WRAPPER_TYPEN.includes(t) && t[0] !== '('), 'unbekannte Typen, Aktion ohne Typ und Aktion null kommen vor');
    for (const w of WRAPPER) meld(ab.wrapper[w].length >= 2, 'Umhüllung ' + w + ' ist in ' + ab.wrapper[w].length + ' Szenarien vorgesehen');

    const lauf1 = await alle(SZENARIEN);
    const abgebrochen = Object.keys(lauf1).filter(n => lauf1[n].abbruch);
    meld(!abgebrochen.length, 'alle Szenarien laufen durch' + (abgebrochen.length ? ': ' + abgebrochen.map(n => n + ' -> ' + lauf1[n].abbruch).join('; ') : ''));
    const haengt = Object.keys(lauf1).filter(n => (lauf1[n].schritte || []).some(x => x.haengt));
    meld(!haengt.length, 'kein Schritt hängt' + (haengt.length ? ': ' + haengt.join(', ') : ''));

    const lauf2 = await alle(SZENARIEN);
    const ungleich = namen.filter(n => JSON.stringify(lauf1[n]) !== JSON.stringify(lauf2[n]));
    meld(!ungleich.length, 'Wiederholung ist Bit für Bit identisch (' + (namen.length - ungleich.length) + ' von ' + namen.length + ')' + (ungleich.length ? ': ' + ungleich.join(', ') : ''));

    if (args.includes('--neu')) {
        if (fehler) { console.log('Soll-Datei NICHT geschrieben (oben stehen Fehler).'); process.exit(1); }
        fs.writeFileSync(SOLL, JSON.stringify({ hinweis: 'Fingerabdruck der Aktions-Kette. Erzeugt mit: node tests/aktionen.js --neu. Nur bewusst neu schreiben.', szenarien: lauf1 }, null, 1) + '\n');
        console.log('tests/aktionen_soll.json geschrieben (' + namen.length + ' Szenarien).');
        process.exit(0);
    }

    let soll;
    try { soll = JSON.parse(fs.readFileSync(SOLL, 'utf8')).szenarien; } catch (e) { meld(false, 'tests/aktionen_soll.json fehlt oder ist kaputt'); process.exit(1); }
    const abw = namen.filter(n => JSON.stringify(soll[n]) !== JSON.stringify(lauf1[n]));
    const extra = Object.keys(soll).filter(n => !namen.includes(n));
    meld(!abw.length && !extra.length, 'Fingerabdruck = Soll für alle Szenarien (' + (namen.length - abw.length) + ' von ' + namen.length + ' gleich)');
    for (const n of abw.slice(0, 8)) { console.log('      Abweichung in "' + n + '":'); unterschiede(soll[n], lauf1[n], '', []).forEach(u => console.log('        ' + u)); }
    if (extra.length) console.log('      in der Soll-Datei, aber ohne Szenario: ' + extra.join(', '));

    if (!args.includes('--schnell')) {
        // Wächterprobe: ohne eine Umhüllung muss sich der Fingerabdruck sichtbar ändern - sonst sähe das Messnetz diese Umhüllung nicht
        const probe = {};
        for (const w of WRAPPER) {
            const l = await alle(SZENARIEN, { ohneSkripte: [w + '.js'] });
            probe[w] = namen.filter(n => JSON.stringify((l[n] || {}).schritte) !== JSON.stringify((soll[n] || {}).schritte));   // nur das Verhalten der Schritte, nicht die Merkmale der Funktion
            meld(probe[w].length >= 2, 'Wächterprobe ' + w + ': ohne diese Datei ändern sich ' + probe[w].length + ' Szenarien (mindestens 2 nötig)');
        }
        if (args.includes('--bericht')) for (const w of WRAPPER) console.log('   ' + w + ' (' + probe[w].length + '): ' + probe[w].slice(0, 5).join(' | ') + (probe[w].length > 5 ? ' | ...' : ''));
    }
    if (args.includes('--bericht')) {
        console.log('Grund-Typen: ' + BASIS_TYPEN.join(', '));
        console.log('Typen der Umhüllungen: ' + WRAPPER_TYPEN.join(', '));
        console.log('Alle Typen in den Szenarien: ' + [...ab.typen].sort().join(', '));
    }
    console.log(fehler ? '\n' + fehler + ' Prüfung(en) FEHLGESCHLAGEN' : '\nalles in Ordnung');
    process.exit(fehler ? 1 : 0);
}

module.exports = { laufe, alle, WRAPPER, BASIS_TYPEN, WRAPPER_TYPEN, json };
if (require.main === module) haupt().catch(e => { console.error(e); process.exit(1); });
