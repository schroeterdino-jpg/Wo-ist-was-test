/* ============================================================
   TESTS und MESSBERICHT für den Meldungs-Beobachter (C1a + C1b). Start: node tests/meldungen.js
   Bericht schreiben:  MELDUNGEN_BERICHT=tests/meldungen-bericht.md node tests/meldungen.js
   1) Der Beobachter (js/meldungen.js) ist rein beschreibend: nur Arbeitsspeicher, Ringpuffer 300, kein Speichern, kein Netz, nie ein Fehler nach außen.
   2) Einhängestellen: genau die freigegebenen Dateien tragen Aufrufe, alle abgesichert.
   3) Unveränderlichkeit (Pflicht): zwei simulierte Läufe (Nachmittag, Nacht) laufen MIT Beobachter, OHNE Beobachter (Datei nicht geladen) und
      mit einem kaputten Beobachter (wirft bei jedem Aufruf Fehler). Sprachausgaben, Karten, Befehlskette, Speicher, Netzaufrufe, Zeit der
      Mikrofon-Aufrufe und Zustand müssen identisch sein.
   4) Messung: Einträge sind gültig; jede Sprach-Ausgabe eines Eintrags wurde wirklich gesprochen; ausgelöste Vorgänge werden nicht doppelt als
      Nutzer-Meldung gezählt; alle instrumentierten Quellen kommen in den Läufen vor. Danach der Bericht (nur Messwerte, keine Bewertung).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
const { laufen } = require('./meldungen_welt.js');
const { analyse, bericht } = require('./meldungen_auswertung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const C1A = ['wachter', 'proaktiv', 'vorbereitung', 'travel', 'smarttips', 'calendar', 'plan_ansagen', 'dirigent', 'zuvorkommend', 'schicht'];
const C1B = ['konto', 'mailwatch', 'fristen', 'mail_nacht', 'pakete', 'preissuche', 'auftraege', 'routinen', 'kennenlernen', 'zane_redet', 'jarvis', 'alarm', 'fahr_whatsapp', 'parkplatz_auto', 'schlaf_antwort', 'autoansicht', 'tagesueberblick', 'orte'];
const HILFE = ['briefing'];   // sprechende Stelle des Tagesbriefings (Status 'ausgegeben'); schicht.js und plan_ansagen 'brief' stoßen es nur an ('ausgeloest')
const ALLE = C1A.concat(C1B, HILFE);
const ERWARTET = { wachter: 1, proaktiv: 1, vorbereitung: 1, travel: 1, smarttips: 1, calendar: 2, plan_ansagen: 8, dirigent: 1, zuvorkommend: 2, schicht: 1,
    konto: 1, mailwatch: 1, fristen: 2, mail_nacht: 1, pakete: 2, preissuche: 1, auftraege: 1, routinen: 2, kennenlernen: 1, zane_redet: 1, jarvis: 3, alarm: 3,
    fahr_whatsapp: 2, parkplatz_auto: 1, schlaf_antwort: 2, autoansicht: 1, tagesueberblick: 2, orte: 2, briefing: 1 };

const schnappschuss = M => JSON.stringify({
    ausgaben: M.ereignisse.filter(e => e.art !== 'brücke').map(e => [e.zeit, e.ms, e.art, e.modul, e.text]),
    bruecke: M.ereignisse.filter(e => e.art === 'brücke').map(e => [e.zeit, e.modul, e.text]),
    gesagt: M.gesagt, kette: M.kette(), zustand: M.zustand(), speicher: M.store, netz: M.aufrufe, mikro: M.mikro, sprechzeiten: M.sprechzeiten
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
        check('Eintrag hat alle Felder (nr, zeit, quelle, kanal, grund, status, ausloeser, frage, mikro, ereignis, bezug, text)', l.length === 1 && ['nr', 'zeit', 'quelle', 'kanal', 'grund', 'status', 'ausloeser', 'frage', 'mikro', 'ereignis', 'bezug', 'text'].every(k => k in l[0]), JSON.stringify(l[0]));
        check('Status ist ohne Angabe "ausgegeben", Frage false, Mikrofon "nein"', l[0].status === 'ausgegeben' && l[0].frage === false && l[0].mikro === 'nein');
        check('Text wird auf 80 Zeichen gekürzt', l[0].text.length === 80);
        check('mehrere Kanäle bleiben EIN Eintrag', l[0].kanal.length === 2);
        check('Eintrag ist eingefroren', Object.isFrozen(l[0]) && Object.isFrozen(l[0].kanal) && Object.isFrozen(l[0].bezug));
        check('Speicher und Netz bleiben unberührt', JSON.stringify(A.store) === vorher && A.aufrufe.length === netz0);
        J.beobachte({ quelle: 'test2', status: 'ausgeloest', kanal: [], grund: 'briefing-probe', frage: true, mikro: 'ja' });
        J.beobachte({ quelle: 'test3', status: 'quatsch', mikro: 'vielleicht', frage: 'ja' });
        const l2 = J.liste();
        check('Status "ausgeloest" bleibt, Kanal darf leer sein; Frage/Mikro werden übernommen', l2[1].status === 'ausgeloest' && l2[1].kanal.length === 0 && l2[1].frage === true && l2[1].mikro === 'ja');
        check('Unbekannter Status, Mikro und Frage fallen auf die Standardwerte zurück', l2[2].status === 'ausgegeben' && l2[2].mikro === 'nein' && l2[2].frage === false);
        check('folgeAusloeser: "folge" nur nach einem "ausgeloest"-Eintrag mit passendem Grund, sonst "manuell"', J.folgeAusloeser('briefing', 120000) === 'folge' && J.folgeAusloeser('gibtesnicht', 120000) === 'manuell');
        const bi = J.bezugId('mail', 'm1');
        check('bezugId liefert Art, Schlüssel und Herkunft "id"', bi.art === 'mail' && bi.schluessel === 'm1' && bi.herkunft === 'id');
        J.beobachte(null); J.beobachte('text'); J.beobachte(42); J.beobachte({ get quelle() { throw new Error('böse'); } });
        let zirkel = { quelle: 'z' }; zirkel.bezug = zirkel; J.beobachte(zirkel);
        check('Unsinn und Fehler beim Lesen werfen nie nach außen', true);
        J.leeren();
        for (let i = 0; i < 350; i++) J.beobachte({ quelle: 'ring', grund: String(i) });
        const ring = J.liste();
        check('Ringpuffer hält höchstens 300 Einträge, die ältesten fallen weg', ring.length === 300 && ring[0].grund === '50' && ring[299].grund === '349', ring.length + ' / ' + (ring[0] && ring[0].grund));
        const q = lies('js/meldungen.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        check('meldungen.js: kein Speichern, kein Netz, keine Ausgabe, kein bestehender Schlüssel', !/localStorage|sessionStorage|indexedDB|cookie|fetch\(|XMLHttpRequest|sendBeacon|WebSocket|console\.|jv_meldungen|setPersistentData|getPersistentData/.test(q));
        const kette = A.kette();
        check('Befehlskette unverändert (92 Einträge: 90 + mehrfachfrage (B4) + vollmond_auskunft (B4.1b), Beobachter hängt sich nicht ein)', kette.length === 92, String(kette.length));
    }

    /* ===== 2. Einhängestellen genau in den freigegebenen Dateien ===== */
    {
        const alle = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => f.replace(/\.js$/, ''));
        const mit = alle.filter(f => /jvMeldungen/.test(lies('js/' + f + '.js')) && f !== 'meldungen' && f !== 'meldungs_regeln').sort();
        check('Nur die freigegebenen Quellen (C1a: 10, C1b: 18 + briefing) rufen den Beobachter auf', mit.join() === ALLE.slice().sort().join(), mit.join());
        for (const f of ALLE) {
            const q = lies('js/' + f + '.js');
            const n = (q.match(/window\.jvMeldungen\.beobachte\(/g) || []).length;
            const abgesichert = (q.match(/try \{ if \([^)]*window\.jvMeldungen\) window\.jvMeldungen\.beobachte\([\s\S]*?\) \} catch \(e\) \{ \}/g) || []).length;
            check(f + ': ' + ERWARTET[f] + ' Aufruf(e), alle in try/catch', n === ERWARTET[f] && abgesichert === n, n + ' Aufrufe, ' + abgesichert + ' abgesichert');
        }
        check('api/sync.js (Server-Push) ist nicht angefasst', !/jvMeldungen/.test(lies('api/sync.js')));
        const html = lies('index.html');
        check('index.html lädt meldungen.js (mit Stempel)', /<script src="\.\/js\/meldungen\.js\?v=[0-9a-f]{8}"><\/script>/.test(html));
    }

    /* ===== 3. Unveränderlichkeit: mit, ohne und mit kaputtem Beobachter, in beiden Läufen ===== */
    const gemessen = [];
    for (const art of ['tag', 'nacht']) {
        const mit = await laufen(art, {});
        const ohne = await laufen(art, { ohne: true });
        const kaputt = await laufen(art, { ohne: true, kaputt: true });
        const sMit = schnappschuss(mit), sOhne = schnappschuss(ohne), sKaputt = schnappschuss(kaputt);
        check(art + ': Simulation läuft und es gibt viele Ausgaben (sonst wäre der Vergleich leer)', mit.ereignisse.filter(e => e.art === 'sprechen').length >= 20, String(mit.ereignisse.length));
        check(art + ': MIT und OHNE Beobachter: Sprachausgaben, Karten, Befehlskette, Speicher, Netzaufrufe, Mikrofon, Zustand identisch', sMit === sOhne, sMit === sOhne ? '' : unterschied(sMit, sOhne));
        check(art + ': MIT KAPUTTEM Beobachter (wirft immer Fehler): alles identisch zu OHNE', sKaputt === sOhne, sKaputt === sOhne ? '' : unterschied(sKaputt, sOhne));
        check(art + ': OHNE Beobachter gibt es keinen Eintrag (Datei nicht geladen)', ohne.sb.jvMeldungen === undefined);
        check(art + ': Ladefehler gibt es nicht', mit.ladefehler.length === 0, mit.ladefehler.join('; '));
        gemessen.push(analyse(mit));
    }

    /* ===== 4. Messung ===== */
    const ERLAUBT = ['timer', 'app-start', 'app-rueckkehr', 'apk', 'push', 'plan', 'manuell', 'folge'], KANAL = ['sprache', 'karte', 'fenster', 'hinweis', 'benachrichtigung', 'push'];
    const MIKRO = ['nein', 'bedingt', 'ja'];
    const eintragOk = e => ['ausgegeben', 'ausgeloest'].includes(e.status) && ERLAUBT.includes(e.ausloeser) && MIKRO.includes(e.mikro) && e.kanal.every(k => KANAL.includes(k)) && (e.status === 'ausgegeben' ? e.kanal.length > 0 : e.kanal.length === 0);
    for (const r of gemessen) {
        const n = r.def.name.split(' ')[0];
        check(n + ': jeder Eintrag hat gültigen Status, Auslöser, Mikro-Wert und gültige Kanäle (Ausgabe: mindestens einer, ausgelöst: keiner)', r.liste.length > 0 && r.liste.every(eintragOk), JSON.stringify(r.liste.find(e => !eintragOk(e))));
        check(n + ': Einträge kommen nur von den instrumentierten Quellen', r.liste.every(e => ALLE.includes(e.quelle)), [...new Set(r.liste.map(e => e.quelle))].join());
        const ohneAusgabe = r.liste.filter(e => e.status === 'ausgegeben' && e.kanal.includes('sprache') && e.text && !r.zuordnung.has(e.nr));
        check(n + ': kein Eintrag mit Sprache ohne tatsächlich gesprochenen Text (Beobachter meldet nur echte Ausgaben)', ohneAusgabe.length === 0, ohneAusgabe.map(e => e.quelle + ':' + e.grund + ':' + e.text.slice(0, 30)).join(' | '));
        /* Briefing: nur eine Nutzer-Meldung, auch wenn schicht.js (und evtl. plan_ansagen) es anstoßen */
        const gesprochen = r.sprechen.filter(s => /^(Guten (Tag|Morgen|Abend)|Hallo), \w+\. Es ist \d/.test(s.text)).length;
        const gezaehlt = r.aus.filter(e => e.grund === 'tagesbriefing').length;
        check(n + ': Tagesbriefing wird genau so oft als Nutzer-Meldung gezählt, wie es gesprochen wurde (' + gezaehlt + ' = ' + gesprochen + ')', gezaehlt === gesprochen);
        check(n + ': Anstöße ("ausgeloest") zählen nie als Nutzer-Meldung', r.aus.every(e => e.status === 'ausgegeben') && r.ausgeloest.every(e => e.kanal.length === 0));
        for (const a of r.ausgeloest.filter(e => e.grund === 'schicht-briefing')) {
            const folge = r.aus.find(e => e.quelle === 'briefing' && e.zeit >= a.zeit && e.zeit - a.zeit <= 180000);
            check(n + ': auf das angestoßene Schicht-Briefing folgt die gesprochene Ausgabe von briefing.js (Ausloeser "folge")', !!folge && folge.ausloeser === 'folge', folge ? folge.ausloeser : 'keine');
        }
    }
    const gesehen = new Set(); gemessen.forEach(r => r.liste.forEach(e => gesehen.add(e.quelle)));
    const fehlen = ALLE.filter(q => !gesehen.has(q));
    check('Messabdeckung: alle instrumentierten Quellen kommen in mindestens einem Lauf vor', fehlen.length === 0, 'fehlt: ' + fehlen.join(', '));

    if (process.env.MELDUNGEN_BERICHT) {
        gemessen[0].def.nachtlauf = false; gemessen[1].def.nachtlauf = true;
        const reihenfolge = q => C1A.includes(q) ? 0 : C1B.includes(q) ? 1 : 2;
        fs.writeFileSync(path.join(ROOT, process.env.MELDUNGEN_BERICHT), bericht(gemessen, ALLE.slice().sort((a, b) => reihenfolge(a) - reihenfolge(b) || a.localeCompare(b)), HILFE));
        console.log('Messbericht geschrieben: ' + process.env.MELDUNGEN_BERICHT);
    }

    console.log(fehler ? '\n' + fehler + ' Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : 'Meldungs-Beobachter in Ordnung (' + ok + ' Prüfungen; Einträge: ' + gemessen.map(r => r.liste.length).join(' + ') + ' in den Messläufen).');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
