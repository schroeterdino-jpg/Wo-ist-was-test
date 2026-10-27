/* ============================================================
   AUTOMATISCHE TESTS für die Jarvis-App. Start: node tests/lauf.js   (ohne Zusatzpakete, nur Node)
   Teil 1 (Aufbau): Syntax aller Dateien, index.html verweist nur auf vorhandene Dateien, höchstens 12 Server-Funktionen,
                    Tour (anleitung.js) und Hilfe (help.js) passen zusammen, Sync-Schlüssel stehen in api/sync.js.
   Teil 2 (Verhalten): Dateien werden mit einer Attrappe von Browser und Sprachausgabe geladen; geprüft wird, welcher Sprachbefehl
                    einen Satz übernimmt (so wie später in der App) und ob einzelne Rechnungen/Erkennungen stimmen.
   Neue Prüfung: unten in "verhalten()" einen Satz in ROUTEN oder eine Zeile bei check() ergänzen. Läuft auch bei jedem Pull Request (GitHub Actions).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let fehler = 0, ok = 0;
function check(name, bedingung, info) {
    if (bedingung) { ok++; return; }
    fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : ''));
}
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const dateien = d => fs.readdirSync(path.join(ROOT, d)).filter(f => f.endsWith('.js')).sort();

/* ---------------- Teil 1: Aufbau ---------------- */
function aufbau() {
    // Syntax
    for (const d of ['js', 'api']) for (const f of dateien(d)) {
        const r = cp.spawnSync(process.execPath, ['--check', path.join(ROOT, d, f)], { encoding: 'utf8' });
        check('Syntax ' + d + '/' + f, r.status === 0, (r.stderr || '').split('\n').slice(0, 3).join(' '));
    }
    // index.html
    const html = lies('index.html');
    const tags = [...html.matchAll(/<script[^>]+src="\.\/js\/([^"?]+)(?:\?v=([^"]*))?"/g)].map(m => ({ datei: m[1], v: m[2] }));
    const gesehen = new Set();
    for (const t of tags) {
        check('index.html: ' + t.datei + ' existiert', fs.existsSync(path.join(ROOT, 'js', t.datei)));
        check('index.html: ' + t.datei + ' nur einmal eingebunden', !gesehen.has(t.datei)); gesehen.add(t.datei);
    }
    const ausnahmen = new Set(['diagnose.js']);   // wird ggf. anders geladen
    for (const f of dateien('js')) if (!gesehen.has(f) && !ausnahmen.has(f)) check('js/' + f + ' ist in index.html eingebunden (sonst löschen oder einhängen)', false);
    // Funktionen
    const anzahl = dateien('api').length;
    check('höchstens 12 Server-Funktionen in api/ (Vercel Hobby), jetzt ' + anzahl, anzahl <= 12);
    // Tour und Hilfe
    const hilfe = lies('js/help.js'), tour = lies('js/anleitung.js');
    const hKeys = new Set([...hilfe.matchAll(/^\s*\{\s*key:\s*'([^']+)'/gm)].map(m => m[1]));
    for (const m of tour.matchAll(/\bh:\s*"([^"]+)"/g)) check('Tour verweist auf Hilfe-Gruppe "' + m[1] + '"', hKeys.has(m[1]));
    const titel = [...tour.matchAll(/\bt:\s*"([^"]+)"/g)].map(m => m[1]);
    check('Tour hat keine doppelten Titel', new Set(titel).size === titel.length, titel.filter((t, i) => titel.indexOf(t) !== i).join(', '));
    // Sync-Schlüssel
    const sync = lies('api/sync.js');
    for (const k of ['jv_haushalt', 'jv_preiswaechter', 'jv_wunschlisten']) check('api/sync.js sichert ' + k, sync.includes("'" + k + "'"));
    // Schutz: umbenannte Schlüssel
    for (const f of dateien('js')) { const s = lies('js/' + f); check(f + ': keine Schlüssel mit "jarvis_" statt "jv_"/"nova_" neu angelegt', !/localStorage\.(?:get|set)Item\(\s*'jarvis_/.test(s)); }
}

/* ---------------- Teil 2: Verhalten ---------------- */
function umgebung() {
    const gesagt = [], store = {}, eintraege = [];
    const el = () => new Proxy(function () { }, { get: (t, k) => k === 'style' ? {} : k === 'classList' ? { add() { }, remove() { }, contains() { return false; } } : k === 'children' ? [] : (k === 'appendChild' || k === 'addEventListener' || k === 'remove' || k === 'setAttribute' || k === 'removeChild') ? () => { } : k === 'querySelector' || k === 'getElementById' ? () => null : k === 'querySelectorAll' ? () => [] : '', set: () => true, apply: () => el() });
    const sb = {
        console, setTimeout: () => 0, clearTimeout() { }, setInterval: () => 0, clearInterval() { }, Promise, JSON, Math, Date, Array, Object, String, Number, RegExp, Set, Map, Error, parseFloat, parseInt, isFinite, encodeURIComponent, decodeURIComponent, TextEncoder, URL, AbortController, btoa: s => Buffer.from(s, 'binary').toString('base64'), atob: s => Buffer.from(s, 'base64').toString('binary'),
        localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
        document: { createElement: el, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() { }, head: el(), body: el(), readyState: 'loading', hidden: false },
        navigator: { userAgent: 'test', language: 'de-DE' }, location: { href: 'http://test/', search: '', hash: '' },
        fetch: async () => { throw new Error('offline'); }, apiFetch: async () => { throw new Error('offline'); },
        speak: m => { gesagt.push(String(m)); }, continueConversation: undefined, accessToken: '', isProcessing: false
    };
    sb.window = sb; sb.globalThis = sb;
    sb.addEventListener = () => { };
    sb.jvCommands = { use(name, fn, order) { const i = eintraege.findIndex(e => e.name === name), e = { name, order: Number(order), fn }; if (i >= 0) eintraege[i] = e; else eintraege.push(e); eintraege.sort((a, b) => a.order - b.order); return true; } };
    vm.createContext(sb);
    return { sb, gesagt, store, eintraege };
}
function laden(u, datei) {
    try { vm.runInContext(lies('js/' + datei), u.sb, { filename: datei }); return true; }
    catch (e) { console.log('  (Hinweis: ' + datei + ' konnte in der Attrappe nicht geladen werden: ' + String(e.message).slice(0, 80) + ')'); return false; }
}
// Welche Stelle übernimmt den Satz? ('KI' = niemand, geht an die normale Antwort)
function route(u, satz) {
    let wer = 'KI';
    const lauf = (i, t) => {
        if (i >= u.eintraege.length) return false;
        const e = u.eintraege[i];
        let weitergereicht = false;
        const r = e.fn(t, tt => { weitergereicht = true; return lauf(i + 1, tt === undefined ? t : tt); });
        if (r === true && !weitergereicht) { wer = e.name; return true; }
        return r;
    };
    try { lauf(0, satz); } catch (e) { return 'FEHLER ' + e.message; }
    return wer;
}
function verhalten() {
    const u = umgebung();
    for (const f of ['konto.js', 'haushalt.js', 'postfach.js', 'behoerdenbrief.js', 'kuendigung.js']) laden(u, f);
    const ROUTEN = [
        // [Satz, erwartete Stelle]
        ['Schreib einen Widerspruch', 'behoerdenbrief'],
        ['Beschwerde an die Hausverwaltung schreiben', 'behoerdenbrief'],
        ['Schreib einen Antrag auf Ratenzahlung', 'behoerdenbrief'],
        ['Schreib einen Brief an das Finanzamt', 'behoerdenbrief'],
        ['Schreib mir eine Kündigung', 'kuendigung'],
        ['Wie lege ich Widerspruch ein', 'KI'],
        ['Schreib einen Brief an Julia', 'KI'],
        ['Wie war mein Monat', 'haushalt'],
        ['Wie war der letzte Monat', 'haushalt'],
        ['Welche Abos habe ich', 'haushalt'],
        ['Wo kann ich sparen', 'haushalt'],
        ['Haushaltsbuch einlesen', 'haushalt'],
        ['Wie kann ich Strom sparen', 'KI'],
        ['Ich will mein Netflix Abo kündigen', 'kuendigung'],
        ['Habe ich neue E-Mails', 'postfach'],
        ['Was ist im Postfach wichtig', 'postfach'],
        ['Lies mir die erste vor', 'KI'],
        ['Prüf mal mein Konto', 'konto'],
        ['Konto-Meldung aus', 'konto']
    ];
    const kopie = u.gesagt.length;
    for (const [satz, soll] of ROUTEN) { const ist = route(u, satz); check('Befehl "' + satz + '" → ' + soll, ist === soll, 'war: ' + ist); route(u, 'abbrechen'); route(u, 'abbrechen'); }   // laufendes Gespräch beenden, damit der nächste Satz frisch startet
    u.gesagt.length = kopie;

    // Konto-Erkennung
    const K = u.sb.jvKonto;
    if (K) {
        check('Konto: Gutschrift = Eingang', K.direction('Gutschrift auf Ihrem Konto 120,00 EUR') === 'ein');
        check('Konto: Lastschrift = Ausgang', K.direction('Lastschrift von Ihrem Konto 54,90 EUR') === 'aus');
        check('Konto: 54,90 Euro gesprochen', /54 Euro 90/.test(K.euro('Betrag 54,90 EUR')), K.euro('Betrag 54,90 EUR'));
        check('Konto: Sparkasse ist Bank-Mail', K.isBankMail({ von: 'Sparkasse Lauenburg', betreff: 'Info' }));
        check('Konto: Newsletter ist keine Bank-Mail', !K.isBankMail({ von: 'Zalando', betreff: 'Neue Schuhe' }));
    }
    // Haushaltsbuch
    const H = u.sb.jvHaushalt;
    if (H) {
        check('Haushalt: Eingang wird eingetragen', H.erfassen({ id: 'a1', betreff: 'Gutschrift', _ms: Date.now() }, 'Gutschrift Gehalt 2.345,67 EUR Auftraggeber: Firma Muster'));
        check('Haushalt: gleiche Mail nicht doppelt', !H.erfassen({ id: 'a1', betreff: 'Gutschrift' }, 'Gutschrift Gehalt 2.345,67 EUR'));
        check('Haushalt: ohne klare Richtung nichts eingetragen', !H.erfassen({ id: 'a2', betreff: 'Info' }, 'Neue Nachricht 10,00 EUR'));
        check('Haushalt: Ausgabe wird eingetragen', H.erfassen({ id: 'a3', betreff: 'Lastschrift Netflix', _ms: Date.now() }, 'Lastschrift Netflix 13,99 EUR'));
        const l = H.laden();
        check('Haushalt: Betrag richtig gelesen (2345,67)', l.some(e => e.dir === 'ein' && Math.abs(e.betrag - 2345.67) < 0.001), JSON.stringify(l));
        check('Haushalt: Netflix als Streaming einsortiert', l.some(e => e.dir === 'aus' && /Streaming/.test(e.kat)), JSON.stringify(l));
        // Abos: gleiche Abbuchung in zwei Monaten
        const d1 = Date.now(), d2 = d1 - 35 * 86400000;
        H.erfassen({ id: 'b1', betreff: 'Lastschrift Spotify', _ms: d1 }, 'Lastschrift Spotify 10,99 EUR');
        H.erfassen({ id: 'b2', betreff: 'Lastschrift Spotify', _ms: d2 }, 'Lastschrift Spotify 10,99 EUR');
        check('Haushalt: Abo (zwei Monate gleicher Betrag) erkannt', H.abos().some(a => /spotify/i.test(a.name)), JSON.stringify(H.abos()));
    }
    // Wochenüberblick: doppeltes "Geburtstag"
    laden(u, 'plan_ansagen.js');
    const P = u.sb.jvPlan;
    if (P && P.terminText) {
        check('Wochenüberblick: "Geburtstag von Alyssa Geburtstag" wird "Geburtstag von Alyssa"', P.terminText('Geburtstag von Alyssa Geburtstag') === 'Geburtstag von Alyssa', P.terminText('Geburtstag von Alyssa Geburtstag'));
        check('Wochenüberblick: "Alyssa Geburtstag" bleibt', P.terminText('Alyssa Geburtstag') === 'Alyssa Geburtstag');
        check('Wochenüberblick: normaler Termin bleibt', P.terminText('Friseurtermin bei Anja') === 'Friseurtermin bei Anja');
    } else check('Wochenüberblick: jvPlan.terminText vorhanden', false);
    // Briefarten
    const B = u.sb.jvBehoerdenbrief;
    if (B) {
        check('Brief: "Schreib mir eine Kündigung" gehört nicht dazu', B.erkenne('Schreib mir eine Kündigung') === '');
        check('Brief: Merk-dir-Satz startet keinen Brief', B.erkenne('Merk dir ich muss Widerspruch schreiben') === '');
    }
}

console.log('Jarvis-Tests …');
aufbau();
verhalten();
console.log(fehler ? '\n' + fehler + ' Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : '\nAlles in Ordnung (' + ok + ' Prüfungen).');
process.exit(fehler ? 1 : 0);
