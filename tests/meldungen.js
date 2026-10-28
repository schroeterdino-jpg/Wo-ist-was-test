/* ============================================================
   TESTS und MESSBERICHT für den Meldungs-Beobachter (C1a). Start: node tests/meldungen.js
   Bericht schreiben:  MELDUNGEN_BERICHT=tests/meldungen-bericht.md node tests/meldungen.js
   1) Der Beobachter (js/meldungen.js) ist rein beschreibend: nur Arbeitsspeicher, Ringpuffer 300, kein Speichern, kein Netz, nie ein Fehler nach außen.
   2) Unveränderlichkeit (Pflicht): derselbe simulierte Nachmittag läuft MIT Beobachter, OHNE Beobachter (Datei nicht geladen) und mit einem
      kaputten Beobachter (wirft bei jedem Aufruf Fehler). Sprachausgaben, Karten, Befehlskette, Speicher und Netzaufrufe müssen identisch sein.
   3) Einhängestellen (C1a): genau die zehn freigegebenen Dateien tragen Aufrufe, alle abgesichert.
   4) Messbericht aus der Simulation: Termin mit Ort + Vorbereitung + Vorwarnung + Abfahrt + Erinnerung + Schicht-Briefing im selben Zeitraum.
      Der Bericht zeigt nur Messwerte, keine Bewertung (kein "doppelt", kein "zu viel").
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const berlin = ms => new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' });

const C1A = ['wachter', 'proaktiv', 'vorbereitung', 'travel', 'smarttips', 'calendar', 'plan_ansagen', 'dirigent', 'zuvorkommend', 'schicht'];
const ERWARTET = { wachter: 1, proaktiv: 1, vorbereitung: 1, travel: 1, smarttips: 1, calendar: 2, plan_ansagen: 8, dirigent: 1, zuvorkommend: 2, schicht: 1 };

/* ---------- Simulation: Mittwoch 28.10.2026, Spätschicht, Termin 15:00 mit Ort, Erinnerung 14:30 ---------- */
function antwortFn(url) {
    const antwort = o => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
    if (/googleapis\.com\/calendar\/v3\/calendars\/primary\/events/.test(url)) return antwort({ items: [{ id: 'gcal_arzt_0815', summary: 'Arzt Hamburg', status: 'confirmed', start: { dateTime: '2026-10-28T15:00:00+01:00' }, location: 'Hamburg' }] });
    if (/nominatim\.openstreetmap\.org\/reverse/.test(url)) return antwort({ address: { city: 'Lüneburg', country: 'Deutschland', road: 'Am Markt', house_number: '1' } });
    if (/\/api\/geocode/.test(url)) return antwort([{ lat: '53.5511', lon: '9.9937', display_name: 'Hamburg, Deutschland' }]);
    if (/\/api\/route/.test(url)) return antwort({ routes: [{ duration: 2400, distance: 42000 }] });
    if (/open-meteo|weather|wetter/i.test(url)) return antwort({ current: { temperature_2m: 11, weather_code: 3, wind_speed_10m: 10 }, hourly: { time: [], precipitation: [] }, daily: { time: ['2026-10-28'], temperature_2m_max: [12], temperature_2m_min: [6], weather_code: [3], precipitation_sum: [0] } });
    return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
}

async function szenario(opt) {
    opt = opt || {};
    const M = starte({ native: true, jetzt: '2026-10-28T12:00:00+01:00', sekundenTakt: true, festerZufall: true, sprechenBeendet: true, fetch: async (u) => antwortFn(u), ohneSkripte: opt.ohne ? ['meldungen.js'] : [] });
    M.sb.navigator.geolocation.getCurrentPosition = (okFn) => okFn({ coords: { latitude: 53.4, longitude: 10.2 } });   // Standort bekannt
    if (opt.kaputt) M.sb.jvMeldungen = { beobachte() { throw new Error('Beobachter kaputt'); }, bezugTermin() { throw new Error('x'); }, bezugTerminId() { throw new Error('x'); }, bezugErinnerung() { throw new Error('x'); }, bezugErinnerungTextZeit() { throw new Error('x'); }, bezugTag() { throw new Error('x'); }, bezugAusWaechterId() { throw new Error('x'); }, herkunftApp() { throw new Error('x'); } };
    M.vm.runInContext("accessToken = 'test-token'; googleTokenExpiresAt = Date.now() + 86400000 * 30;", M.sb);   // Google-Kalender verbunden (Attrappe)
    const T = M.sb._schichtTest;
    M.store['jv_schicht'] = JSON.stringify({ base: T.weekNo({ y: 2026, m: 10, d: 28 }), shift: 'spaet', times: { frueh: 420, spaet: 765 }, auto: true });   // Spätschicht, Briefing ab 12:45
    /* Termin wie aus dem Google Kalender (echte ID, mit Ort) */
    M.vm.runInContext("calendarEntries = [{ id: 'gcal_arzt_0815', text: 'Arzt Hamburg', date: '', isoDate: '2026-10-28T15:00:00+01:00', eventType: 'default', recurring: false, location: 'Hamburg' }]", M.sb);
    await M.ki('Erinnere mich um 14:30 an die Unterlagen für den Arzt', [{ type: 'reminder', reminder_text: 'Unterlagen für den Arzt', reminder_time: '2026-10-28T14:30:00' }]);
    await M.vorspulen(2000);
    M.ereignisse.length = 0;
    await M.vorspulen(60 * 60000);                                                                            // bis 13:00
    try { await M.sb.jvPlan.ansage('aufbruch|2026-10-28', false, true); } catch (e) { }                      // so, wie die Handy-App die Aufbruchs-Ansage abholt
    await M.vorspulen(130 * 60000);                                                                           // bis 15:10
    return M;
}
const schnappschuss = M => JSON.stringify({
    ausgaben: M.ereignisse.filter(e => e.art !== 'brücke').map(e => [e.zeit, e.art, e.modul, e.text]),
    bruecke: M.ereignisse.filter(e => e.art === 'brücke').map(e => [e.zeit, e.modul, e.text]),
    gesagt: M.gesagt, kette: M.kette(), zustand: M.zustand(), speicher: M.store, netz: M.aufrufe
});

/* Erster Unterschied zweier Schnappschüsse (für die Fehlermeldung) */
function unterschied(a, b) {
    const x = JSON.parse(a), y = JSON.parse(b);
    for (const k of Object.keys(x)) {
        if (JSON.stringify(x[k]) === JSON.stringify(y[k])) continue;
        if (Array.isArray(x[k])) { for (let i = 0; i < Math.max(x[k].length, y[k].length); i++) if (JSON.stringify(x[k][i]) !== JSON.stringify(y[k][i])) return k + '[' + i + ']: ' + JSON.stringify(x[k][i]).slice(0, 160) + '  <->  ' + JSON.stringify(y[k][i]).slice(0, 160); }
        for (const kk of Object.keys(Object.assign({}, x[k], y[k]))) if (JSON.stringify(x[k][kk]) !== JSON.stringify(y[k][kk])) return k + '.' + kk + ': ' + JSON.stringify(x[k][kk]).slice(0, 160) + '  <->  ' + JSON.stringify(y[k][kk]).slice(0, 160);
    }
    return 'unbekannt';
}

(async () => {
    /* ===== 1. Der Beobachter selbst ===== */
    {
        const A = starte({});
        const J = A.sb.jvMeldungen;
        check('Beobachter ist geladen und eingefroren', !!J && Object.isFrozen(J));
        const vorher = JSON.stringify(A.store), netz0 = A.aufrufe.length;
        const r = J.beobachte({ quelle: 'test', kanal: ['sprache', 'karte'], grund: 'probe', ausloeser: 'manuell', ereignis: 'e1', bezug: { art: 'termin', schluessel: 'T1', herkunft: 'id' }, text: 'x'.repeat(200) });
        check('beobachte gibt nichts zurück', r === undefined);
        const l = J.liste();
        check('Eintrag hat alle Felder (nr, zeit, quelle, kanal, grund, ausloeser, ereignis, bezug, text)', l.length === 1 && ['nr', 'zeit', 'quelle', 'kanal', 'grund', 'ausloeser', 'ereignis', 'bezug', 'text'].every(k => k in l[0]), JSON.stringify(l[0]));
        check('Text wird auf 80 Zeichen gekürzt', l[0].text.length === 80);
        check('mehrere Kanäle bleiben EIN Eintrag', l[0].kanal.length === 2);
        check('Eintrag ist eingefroren', Object.isFrozen(l[0]) && Object.isFrozen(l[0].kanal) && Object.isFrozen(l[0].bezug));
        check('Speicher und Netz bleiben unberührt', JSON.stringify(A.store) === vorher && A.aufrufe.length === netz0);
        J.beobachte(null); J.beobachte('text'); J.beobachte(42); J.beobachte({ get quelle() { throw new Error('böse'); } });
        let zirkel = { quelle: 'z' }; zirkel.bezug = zirkel; J.beobachte(zirkel);
        check('Unsinn und Fehler beim Lesen werfen nie nach außen', true);
        J.leeren();
        for (let i = 0; i < 350; i++) J.beobachte({ quelle: 'ring', grund: String(i) });
        const ring = J.liste();
        check('Ringpuffer hält höchstens 300 Einträge, die ältesten fallen weg', ring.length === 300 && ring[0].grund === '50' && ring[299].grund === '349', ring.length + ' / ' + (ring[0] && ring[0].grund));
        const q = lies('js/meldungen.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        check('meldungen.js: kein Speichern, kein Netz, keine Ausgabe, kein bestehender Schlüssel', !/localStorage|sessionStorage|indexedDB|cookie|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|console\.|speak\(|showActionCards|jv_meldungen/.test(q));
        const kette = A.kette();
        check('Befehlskette unverändert (96 Einträge: 94 + mehrfachfrage (B4) + vollmond_auskunft (B4.1b), Beobachter hängt sich nicht ein)', kette.length === 96, String(kette.length));
    }

    /* ===== 2. Einhängestellen genau in den zehn freigegebenen Dateien ===== */
    {
        const alle = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''));
        const mit = alle.filter(f => /jvMeldungen/.test(lies('js/' + f + '.js')) && f !== 'meldungen').sort();
        check('Nur die zehn Quellen der Stufe C1a rufen den Beobachter auf', mit.join() === C1A.slice().sort().join(), mit.join());
        for (const f of C1A) {
            const q = lies('js/' + f + '.js');
            const n = (q.match(/window\.jvMeldungen\.beobachte\(/g) || []).length;
            const abgesichert = (q.match(/try \{ if \(window\.jvMeldungen\) window\.jvMeldungen\.beobachte\([\s\S]*?\) \} catch \(e\) \{ \}/g) || []).length;
            check(f + ': ' + ERWARTET[f] + ' Aufruf(e), alle in try/catch', n === ERWARTET[f] && abgesichert === n, n + ' Aufrufe, ' + abgesichert + ' abgesichert');
        }
        const html = lies('index.html');
        check('index.html lädt meldungen.js (mit Stempel)', /<script src="\.\/js\/meldungen\.js\?v=[0-9a-f]{8}"><\/script>/.test(html));
    }

    /* ===== 3. Unveränderlichkeit: mit, ohne und mit kaputtem Beobachter ===== */
    const mit = await szenario({});
    const ohne = await szenario({ ohne: true });
    const kaputt = await szenario({ ohne: true, kaputt: true });
    const sMit = schnappschuss(mit), sOhne = schnappschuss(ohne), sKaputt = schnappschuss(kaputt);
    check('Simulation läuft und es gibt Ausgaben (sonst wäre der Vergleich leer)', mit.ereignisse.filter(e => e.art === 'sprechen').length >= 4, String(mit.ereignisse.length));
    check('MIT und OHNE Beobachter: Sprachausgaben, Karten, Befehlskette, Speicher, Netzaufrufe identisch', sMit === sOhne, sMit === sOhne ? '' : unterschied(sMit, sOhne));
    check('MIT KAPUTTEM Beobachter (wirft immer Fehler): alles identisch zu OHNE', sKaputt === sOhne, sKaputt === sOhne ? '' : unterschied(sKaputt, sOhne));
    check('OHNE Beobachter gibt es keinen Eintrag (Datei nicht geladen)', ohne.sb.jvMeldungen === undefined);

    /* ===== 4. Messbericht ===== */
    const liste = mit.sb.jvMeldungen.liste();
    const ERLAUBT = ['timer', 'app-start', 'app-rueckkehr', 'apk', 'push', 'plan', 'manuell'], KANAL = ['sprache', 'karte', 'fenster', 'benachrichtigung', 'push'];
    check('Messung: jeder Eintrag hat gültigen Auslöser und gültige Kanäle', liste.length > 0 && liste.every(e => ERLAUBT.includes(e.ausloeser) && e.kanal.length > 0 && e.kanal.every(k => KANAL.includes(k))), JSON.stringify(liste.filter(e => !ERLAUBT.includes(e.ausloeser)).slice(0, 2)));
    check('Messung: Einträge kommen nur von den zehn Quellen', liste.every(e => C1A.includes(e.quelle)), [...new Set(liste.map(e => e.quelle))].join());
    const spricht = mit.ereignisse.filter(e => e.art === 'sprechen');
    const nah = (e, t) => Math.abs(Date.parse('2026-10-28T' + t + ':00+01:00') - Date.parse('2026-10-28T' + berlin(e.zeit).slice(0, 5) + ':00+01:00')) <= 60000;
    const passt = (ei, s) => ei.text && (ei.kanal.includes('sprache')) && String(s.text).startsWith(ei.text.slice(0, 40)) && nah(ei, s.zeit);
    const ohneAusgabe = liste.filter(ei => ei.kanal.includes('sprache') && ei.text && !spricht.some(s => passt(ei, s)));
    check('Messung: kein Eintrag mit Sprache ohne tatsächlich gesprochenen Text (Beobachter meldet nur echte Ausgaben)', ohneAusgabe.length === 0, ohneAusgabe.map(e => e.quelle + ':' + e.grund).join());
    const QUELLDATEIEN = C1A.map(f => f + '.js');
    const sprechOhneEintrag = spricht.filter(s => QUELLDATEIEN.some(f => String(s.modul).startsWith(f)) && !liste.some(ei => passt(ei, s)));
    check('Messung: jede Sprachausgabe der zehn Quellen hat einen Eintrag', sprechOhneEintrag.length === 0, sprechOhneEintrag.map(s => s.zeit + ' ' + s.modul + ' ' + String(s.text).slice(0, 40)).join(' | '));

    if (process.env.MELDUNGEN_BERICHT) {
        const z = [];
        z.push('# C1a Messbericht: simulierter Nachmittag (nur Messwerte, keine Bewertung)\n');
        z.push('**Szenario (virtuelle Uhr, Mittwoch 28.10.2026, Berlin):** Spätschicht (Briefing ab 12:45). Termin „Arzt Hamburg“ um 15:00 mit Ort (Kalender-ID `gcal_arzt_0815`). Erinnerung „Unterlagen für den Arzt“ um 14:30. Fahrzeit-Attrappe 40 Minuten. Android-App angeschlossen (die Aufbruchs-Ansage um 13:00 wird so ausgelöst, wie die App sie abholt). Der Lauf geht von 12:00 bis 15:10.\n');
        z.push('Die Attrappen für Netz und Standort sind fest; Zufallszahlen sind festgesetzt. Ein Eintrag entsteht nur, wenn tatsächlich eine Ausgabe ausgelöst wird (keine Prüfungen/Polls).\n');
        z.push('## 1. Alle Einträge in zeitlicher Reihenfolge\n');
        z.push('| Nr | Uhrzeit | Quelle | Kanal | Grund | Auslöser | Ereignis | Bezug (Art: Schlüssel, Herkunft) | Text (80 Zeichen) |');
        z.push('|---|---|---|---|---|---|---|---|---|');
        for (const e of liste) z.push(`| ${e.nr} | ${berlin(e.zeit)} | ${e.quelle} | ${e.kanal.join('+')} | ${e.grund} | ${e.ausloeser} | \`${e.ereignis}\` | ${e.bezug ? e.bezug.art + ': `' + e.bezug.schluessel + '`, ' + e.bezug.herkunft : '-'} | ${e.text.replace(/\|/g, '/')} |`);
        z.push('\n## 2. Einträge mit demselben Bezug (Gruppen), mit zeitlichen Abständen\n');
        const gr = new Map();
        for (const e of liste) { if (!e.bezug) continue; const k = e.bezug.art + ': ' + e.bezug.schluessel; if (!gr.has(k)) gr.set(k, []); gr.get(k).push(e); }
        for (const [k, arr] of gr) {
            const quellen = [...new Set(arr.map(e => e.quelle))];
            z.push(`**${k}** (Herkunft: ${[...new Set(arr.map(e => e.bezug.herkunft))].join('/')}), ${arr.length} Eintrag/Einträge von ${quellen.length} Quelle(n): ${quellen.join(', ')}`);
            let letzte = null;
            for (const e of arr) { const abst = letzte === null ? '-' : Math.round((e.zeit - letzte) / 1000) + ' s'; z.push(`- ${berlin(e.zeit)} | ${e.quelle} | ${e.kanal.join('+')} | ${e.grund} | Abstand zur vorigen: ${abst}`); letzte = e.zeit; }
            z.push('');
        }
        z.push('## 3. Zusammenfassung der Messwerte\n');
        const nachQuelle = {}; liste.forEach(e => { nachQuelle[e.quelle] = (nachQuelle[e.quelle] || 0) + 1; });
        z.push('- Einträge insgesamt: ' + liste.length + ' (' + Object.keys(nachQuelle).map(k => k + ' ' + nachQuelle[k]).join(', ') + ')');
        const nachKanal = {}; liste.forEach(e => e.kanal.forEach(k => { nachKanal[k] = (nachKanal[k] || 0) + 1; }));
        z.push('- Kanäle: ' + Object.keys(nachKanal).map(k => k + ' ' + nachKanal[k]).join(', '));
        const nachAusl = {}; liste.forEach(e => { nachAusl[e.ausloeser] = (nachAusl[e.ausloeser] || 0) + 1; });
        z.push('- Auslöser: ' + Object.keys(nachAusl).map(k => k + ' ' + nachAusl[k]).join(', '));
        const terminBezug = liste.filter(e => e.bezug && e.bezug.art === 'termin');
        z.push('- Einträge mit Termin-Bezug: ' + terminBezug.length + ', davon mit stabiler ID: ' + terminBezug.filter(e => e.bezug.herkunft === 'id').length + ', mit Rückfall Text+Zeit: ' + terminBezug.filter(e => e.bezug.herkunft === 'text+zeit').length);
        const sp = liste.filter(e => e.kanal.includes('sprache')).sort((a, b) => a.zeit - b.zeit);
        const abst = sp.slice(1).map((e, i) => Math.round((e.zeit - sp[i].zeit) / 1000));
        z.push('- Gesprochene Meldungen der zehn Quellen: ' + sp.length + '; kleinster Abstand zwischen zwei gesprochenen Meldungen: ' + (abst.length ? Math.min(...abst) + ' s' : '-') + ', größter: ' + (abst.length ? Math.max(...abst) + ' s' : '-'));
        z.push('\n## 4. Ausgaben im selben Zeitraum, die NICHT zu den zehn Quellen von C1a gehören (nur zur Einordnung, nicht gezählt)\n');
        const eigene = spricht.filter(s => liste.some(ei => passt(ei, s)));   // Zuordnung über Text und Uhrzeit (der Aufrufer-Stapel ist bei asynchronen Aufrufen unzuverlässig)
        const fremd = spricht.filter(s => !eigene.includes(s));
        z.push('| Uhrzeit | Modul | Text |'); z.push('|---|---|---|');
        for (const s of fremd) z.push(`| ${s.zeit} | ${s.modul} | ${String(s.text).replace(/\|/g, '/').slice(0, 90)} |`);
        z.push('\n## 5. Kontrolle gegen die tatsächlichen Ausgaben der Attrappe (Sprache)\n');
        z.push('Von ' + spricht.length + ' Sprachausgaben im Messlauf lassen sich ' + eigene.length + ' einem Eintrag der zehn Quellen zuordnen (gleicher Text, gleiche Minute); ' + fremd.length + ' stammen von anderen Modulen. Meldungen mit Karte oder Fenster ohne Sprache stehen nur in Abschnitt 1. Beim Eintrag von schicht.js (12:45) ist der Text leer, weil das Tagesbriefing selbst von briefing.js gesprochen wird (steht deshalb in Abschnitt 4).');
        fs.writeFileSync(path.join(ROOT, process.env.MELDUNGEN_BERICHT), z.join('\n') + '\n');
        console.log('Messbericht geschrieben: ' + process.env.MELDUNGEN_BERICHT);
    }

    console.log(fehler ? '\n' + fehler + ' Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : 'Meldungs-Beobachter in Ordnung (' + ok + ' Prüfungen, ' + liste.length + ' Einträge im Messlauf).');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
