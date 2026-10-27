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
        document: { createElement: el, createTextNode: () => el(), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], addEventListener() { }, head: el(), body: el(), readyState: 'loading', hidden: false },
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
async function verhalten() {
    const u = umgebung();
    for (const f of ['preissuche.js', 'konto.js', 'haushalt.js', 'postfach.js', 'behoerdenbrief.js', 'antrag_pdf.js', 'antrag.js', 'kuendigung.js']) laden(u, f);
    const ROUTEN = [
        // [Satz, erwartete Stelle]
        ['Ich suche eine Toni-Figur, Weihnachtsmann und KKG, kannst du mir Preise heraussuchen', 'preissuche'],
        ['Ich suche eine Toni Figur, einen Weihnachtsmann und KKG. Kannst du mir dafür die Preise raussuchen?', 'preissuche'],
        ['Kannst du mir Preise für eine Toni-Figur und den Weihnachtsmann heraussuchen', 'preissuche'],
        ['Such mir Preise für Bosch Akkuschrauber raus', 'preissuche'],
        ['Such mir die Preise raus für eine Kaffeemaschine und einen Toaster', 'preissuche'],
        ['Öffne die Preissuche', 'preissuche'],
        ['Preissuche öffnen', 'preissuche'],
        ['Preissuche', 'preissuche'],
        ['Ich suche einen guten Elektriker', 'KI'],
        ['Wie entwickeln sich die Strompreise', 'KI'],
        ['Hilf mir beim Jobcenter-Antrag', 'antrag'],
        ['Antrag ausfüllen', 'antrag'],
        ['Füll den Antrag aus', 'antrag'],
        ['Jobcenter Formular ausfüllen', 'antrag'],
        ['Wie lange dauert ein Jobcenter Antrag', 'KI'],
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
    // Antrag ausfüllen: Prüfungen im Code
    const AN = u.sb.jvAntrag;
    if (AN) {
        const f = art => ({ art, pflicht: true, optionen: [] });
        check('Antrag: Datum 03.05.1980 gültig', AN.datumOk('03.05.1980'));
        check('Antrag: Datum 31.02.1980 ungültig', !AN.datumOk('31.02.1980'));
        check('Antrag: IBAN (Beispiel DE89 3704 0044 0532 0130 00) gültig', AN.ibanOk('DE89 3704 0044 0532 0130 00'));
        check('Antrag: IBAN mit Zahlendreher ungültig', !AN.ibanOk('DE89 3704 0044 0532 0130 01'));
        check('Antrag: PLZ 4 Ziffern ungültig', AN.pruefe(f('plz'), '2149') !== '');
        check('Antrag: PLZ 21493 gültig', AN.pruefe(f('plz'), '21493') === '');
        check('Antrag: leeres Pflichtfeld = offen', AN.pruefe(f('text'), '') === 'offen');
        check('Antrag: freiwilliges leeres Feld ist ok', AN.pruefe({ art: 'text', pflicht: false }, '') === '');
        check('Antrag: Betrag "450,00" gültig', AN.pruefe(f('betrag'), '450,00') === '');
        check('Antrag: Betrag "viel" ungültig', AN.pruefe(f('betrag'), 'viel') !== '');
        check('Antrag: gesprochenes Datum "3. Mai 1980" -> 03.05.1980', AN.sprachDatum('3. Mai 1980') === '03.05.1980', AN.sprachDatum('3. Mai 1980'));
        check('Antrag: Ja/Nein wird erkannt', AN.bereinigt(f('ja_nein'), 'ja genau') === 'Ja' && AN.bereinigt(f('ja_nein'), 'nee') === 'Nein');
        const pr = { vorname: 'Dino', nachname: 'Schroeter', geb: '01.02.1970', plz: '21493' };
        check('Antrag: Vorname wird vorbelegt', AN.vorbelegung({ bezeichnung: 'Vorname', art: 'text' }, pr) === 'Dino');
        const pa = { strasse: 'Verbrüderungsring 13' };
        check('Antrag: Feld "Straße" ohne Hausnummer', AN.vorbelegung({ bezeichnung: 'Straße', art: 'text' }, pa) === 'Verbrüderungsring', AN.vorbelegung({ bezeichnung: 'Straße', art: 'text' }, pa));
        check('Antrag: Feld "Hausnummer" nur die Nummer', AN.vorbelegung({ bezeichnung: 'Hausnummer', art: 'text' }, pa) === '13');
        check('Antrag: "Straße und Hausnummer" beides', AN.vorbelegung({ bezeichnung: 'Straße und Hausnummer', art: 'text' }, pa) === 'Verbrüderungsring 13');
        check('Antrag: Geburtsdatum des Partners wird NICHT vorbelegt', AN.vorbelegung({ bezeichnung: 'Geburtsdatum des Partners', art: 'datum' }, pr) === '');
        check('Antrag: Unterschrift wird nie vorbelegt', AN.vorbelegung({ bezeichnung: 'Name', art: 'unterschrift' }, pr) === '');
    }
    if (AN && AN._hilfe) {
        const z = AN._neu(); z.nachweise = ['Kopie Mietvertrag']; z.fristen = ['Abgabe bis 15.11.']; z.formular = 'Hauptantrag';
        z.felder = [{ id: 'a', nr: '1', bezeichnung: 'Familienname', art: 'text', pflicht: true, optionen: [], seite: 1 }, { id: 'b', nr: '2', bezeichnung: 'Geburtsdatum', art: 'datum', pflicht: true, optionen: [], seite: 1 }, { id: 'c', nr: '3', bezeichnung: 'Unterschrift', art: 'unterschrift', optionen: [], seite: 1 }];
        z.werte = { a: 'Schroeter', b: '31.02.1970' };
        const t = AN._hilfe(z);
        check('Antrag: Ausfüllhilfe nennt Eintrag', /Familienname →\s+Schroeter/.test(t), t);
        check('Antrag: Ausfüllhilfe warnt vor falschem Datum', /Geburtsdatum →\s+31\.02\.1970\s+⚠/.test(t), t);
        check('Antrag: Unterschrift bleibt beim Nutzer', /unterschreibst du selbst/.test(t));
        check('Antrag: Nachweis und Frist stehen drin', /Kopie Mietvertrag/.test(t) && /15\.11\./.test(t));
    }
    // Antrag-PDF: echtes Formular (Jobcenter-Hauptantrag 10/2026), Felder und Ja/Nein-Zuordnung aus tests/hauptantrag_ha.json
    const PD = u.sb.jvAntragPdf;
    if (PD) {
        const fx = JSON.parse(lies('tests/hauptantrag_ha.json'));
        const fl = PD.baue(fx.roh, fx.items);
        const art = a => fl.filter(f => f.art === a);
        check('Antrag-PDF: 116 Felder des Formulars werden zu 91 Angaben (Kästchengruppen zusammengefasst)', fl.length === 91, String(fl.length));
        check('Antrag-PDF: 31 Ja/Nein-Fragen erkannt', art('ja_nein').length === 31, String(art('ja_nein').length));
        check('Antrag-PDF: keine Auswahl bleibt unklar (manuell)', art('manuell').length === 0, art('manuell').map(f => f.nr).join(','));
        check('Antrag-PDF: bei jeder Ja/Nein-Frage steht "Ja" für Knopf 0 und "Nein" für Knopf 1 (vom Text neben dem Knopf gelesen)', art('ja_nein').every(f => f.acro.optionen.find(o => o.label === 'Ja').wert === '0' && f.acro.optionen.find(o => o.label === 'Nein').wert === '1'));
        check('Antrag-PDF: Familienstand ist eine Einzelwahl mit 7 Möglichkeiten', fl.some(f => f.nr === '32' && f.art === 'auswahl' && f.optionen.length === 7));
        check('Antrag-PDF: Leistungen sind eine Mehrfachwahl mit 9 Möglichkeiten', fl.some(f => f.nr === '43' && f.art === 'mehrfach' && f.optionen.length === 9));
        check('Antrag-PDF: Datum der Unterschrift bleibt leer (2 Stück)', art('unterschrift').length === 2);
        check('Antrag-PDF: IBAN-, Steuer-ID- und PLZ-Felder erkannt', art('iban').length === 1 && art('steuerid').length === 1 && art('plz').length === 3);
        check('Antrag-PDF: Felder 1 bis 84 vollständig außer 83 (Unterschrift)', [...Array(84)].map((_, i) => String(i + 1)).filter(n => !fl.some(f => f.nr === n)).join(',') === '83');
        // Vorbelegung gegen das echte Formular: nur Angaben der antragstellenden Person, nie Dritte
        const AN2 = u.sb.jvAntrag, pr2 = { vorname: 'Dino', nachname: 'Schroeter', geb: '01.02.1970', strasse: 'Verbrüderungsring 13', plz: '21493', ort: 'Schwarzenbek', telefon: '0123', geburtsort: 'Hamburg', staat: 'deutsch' };
        const vb = {}; fl.forEach(f => { const v = AN2.vorbelegung(f, pr2); if (v) vb[f.nr + (f.art === 'text' ? '' : '')] = v; });
        check('Antrag-PDF: Vorname, Nachname, Geburtsdatum, Geburtsort, Staatsangehörigkeit, Straße, Hausnummer, PLZ, Ort, Telefon vorbelegt', ['1', '2', '3', '5', '7', '9', '10', '11', '12', '14'].every(n => vb[n]), JSON.stringify(vb));
        check('Antrag-PDF: Straße = Verbrüderungsring, Hausnummer = 13', vb['9'] === 'Verbrüderungsring' && vb['10'] === '13', vb['9'] + '|' + vb['10']);
        check('Antrag-PDF: Leistungsträger, Arbeitgeber, Kontoinhaber werden NICHT mit deinen Daten gefüllt', ['17', '54', '55', '56', '57', '58', '62', '63', '64', '65', '66'].every(n => !vb[n]), JSON.stringify(vb));
        // Schreiben mit einer Attrappe von pdf-lib (prüft unsere Zuordnung, nicht die Bibliothek)
        const zustand = {}; const ladeFake = () => {
            const st = JSON.parse(JSON.stringify(zustand));
            const feld = n => { st[n] = st[n] || {}; return st[n]; };
            class Doc { getForm() { return { getTextField: n => ({ setText: t => { feld(n).t = t; }, getText: () => feld(n).t }), getRadioGroup: n => ({ select: v => { feld(n).r = v; }, getSelected: () => feld(n).r }), getCheckBox: n => ({ check: () => { feld(n).c = true; }, uncheck: () => { feld(n).c = false; }, isChecked: () => !!feld(n).c }), updateFieldAppearances() { }, acroForm: { dict: { set() { } } } }; }
                async embedFont() { return { encodeText: ch => { if (ch.charCodeAt(0) > 255) throw new Error('x'); return ch; } }; } async save() { Object.assign(zustand, st); return new TextEncoder().encode('FAKE'); } }
            return Doc; };
        const PDFLibFake = { PDFDocument: { load: async () => { const D = ladeFake(); return new D(); } }, StandardFonts: { Helvetica: 'H' }, PDFName: { of: x => x }, PDFBool: { True: true } };
        u.sb.PDFLib = PDFLibFake;
        const werte = {}; fl.forEach(f => { if (f.nr === '1') werte[f.id] = 'Dino'; if (f.nr === '3') werte[f.id] = '03.05.1980'; if (f.nr === '15') werte[f.id] = 'Nein'; if (f.nr === '24') werte[f.id] = 'Ja'; if (f.nr === '32') werte[f.id] = f.optionen[1]; if (f.nr === '43') werte[f.id] = [f.optionen[2], f.optionen[6]]; if (f.nr === '5') werte[f.id] = 'Győr'; if (f.art === 'unterschrift') werte[f.id] = '01.01.2026'; });
        const erg = await PD.fuellen(new Uint8Array(1), fl, werte);
        const id = nr => fl.find(f => f.nr === nr);
        check('Antrag-PDF: Text wird in das richtige Feld geschrieben (Vorname, Geburtsdatum)', zustand.txtfPersonVorname && zustand.txtfPersonVorname.t === 'Dino' && zustand.datePersonGebDatum.t === '03.05.1980', JSON.stringify(zustand).slice(0, 200));
        check('Antrag-PDF: "Nein" bei Frage 15 wählt Knopf 1, "Ja" bei Frage 24 wählt Knopf 0', zustand.rbtnWohnsitz.r === '1' && zustand.rbtnAsylbLG.r === '0', JSON.stringify([zustand.rbtnWohnsitz, zustand.rbtnAsylbLG]));
        check('Antrag-PDF: Familienstand (Einzelwahl) kreuzt genau ein Kästchen an', id('32').acro.boxen.filter(b => zustand[b.name] && zustand[b.name].c).length === 1 && zustand.chbxFamStandVerheiratet.c === true);
        check('Antrag-PDF: Leistungen (Mehrfachwahl) kreuzt genau Wohngeld und Kindergeld an', id('43').acro.boxen.filter(b => zustand[b.name] && zustand[b.name].c).map(b => b.name).sort().join(',') === 'chbxLeistungKG,chbxLeistungWohngeld', id('43').acro.boxen.filter(b => zustand[b.name] && zustand[b.name].c).map(b => b.name).join(','));
        check('Antrag-PDF: Datum der Unterschrift wird nie geschrieben', !zustand.dateUnterschriftPerson && !zustand.dateUnterschriftBetreuer);
        check('Antrag-PDF: Zeichen, die die PDF-Schrift nicht kann (ő), werden gemeldet und ersetzt', erg.warnungen.some(w => /ő/.test(w)) && zustand.txtfPersonGebOrt.t === 'Gy?r', JSON.stringify(erg.warnungen) + ' ' + (zustand.txtfPersonGebOrt || {}).t);
        check('Antrag-PDF: Kontrolle der gespeicherten Datei meldet keine Abweichung', erg.kontrolle.falsch.length === 0 && erg.kontrolle.anzahl >= 6, JSON.stringify(erg.kontrolle));
    }
    // Server: Gebrauchtes getrennt von Neupreisen (api/maps.js mit Attrappen, ohne Netz)
    {
        const mod = { exports: {} };
        const fakeFetch = async (url, o) => {
            if (/shopping/.test(url)) return { ok: true, json: async () => ({ shopping: [{ title: 'A', source: 'Shop A', price: '19,99 €', link: 'https://a.de/x' }, { title: 'B', source: 'Shop B', price: '22,50 €', link: 'https://b.de/x' }, { title: 'C', source: 'Shop C', price: '25,00 €', link: 'https://c.de/x' }, { title: 'Gebr', source: 'eBay', price: '14,50 €', link: 'https://ebay.de/itm/1' }, { title: '3D-Vorlage', source: 'Thangs 3D', price: '13,44 €', link: 'https://thangs.com/x' }] }) };
            return { ok: true, json: async () => ({ organic: [{ title: 'Toni 12 € VB - Kleinanzeigen', link: 'https://www.kleinanzeigen.de/s-anzeige/toni/123', snippet: 'Hamburg' }, { title: 'Toni verschenken', link: 'https://www.kleinanzeigen.de/s-anzeige/toni/9', snippet: 'Gratis' }, { title: 'Suche', link: 'https://www.kleinanzeigen.de/s-toni/k0', snippet: '5 €' }] }) };
        };
        new Function('module', 'process', 'fetch', 'AbortSignal', 'URL', lies('api/maps.js').replace(/^export const config/m, 'const config').replace(/^export default /m, 'module.exports = '))(mod, { env: { SERPER_API_KEY: 'x', APP_SECRET: 's' } }, fakeFetch, { timeout: () => undefined }, URL);
        const rufe = async query => { let out; await mod.exports({ method: 'GET', query, headers: { 'x-app-key': 's' } }, { status: c => ({ json: j => { out = j; }, end() { } }), setHeader() { }, json: j => { out = j; } }); return out; };
        const neu = await rufe({ action: 'shopping', q: 'Toni' }), mit = await rufe({ action: 'shopping', q: 'Toni', gebraucht: '1' });
        check('Server: ohne Gebraucht-Wunsch bleibt die Antwort wie bisher (nur Neupreise, kein eBay)', neu.angebote.length === 3 && !neu.gebraucht && !neu.angebote.some(x => /ebay/i.test(x.shop)), JSON.stringify(neu).slice(0, 200));
        check('Server: Vorlagen zum 3D-Drucken (Thangs) werden nie als Angebot gezeigt', !JSON.stringify(neu).includes('Thangs') && !JSON.stringify(mit).includes('Thangs'));
        check('Server: Gebrauchtes kommt getrennt (Kleinanzeigen mit Preis, eBay), Neupreise bleiben gleich', mit.angebote.length === 3 && mit.gebraucht.map(x => x.shop + ' ' + x.preis).join('|') === 'Kleinanzeigen 12|eBay 14.5', JSON.stringify(mit.gebraucht));
        const lang = await rufe({ action: 'shopping', q: 'Marvel Spidey Web-Quartier Spielset Action-Figur' });
        check('Server: lange Suche, kein Titel passt -> Ergebnis bleibt, aber als ungenau markiert', lang.ungenau === true && lang.angebote.length === 3, JSON.stringify(lang).slice(0, 160));
        const fake2 = async () => ({ ok: true, json: async () => ({ shopping: [{ title: 'Spidey Figur 7 cm', source: 'S1', price: '12,68 €', link: 'https://a.de/1' }, { title: 'Marvel Spidey Web-Quartier Spielset Fahrzeug', source: 'S2', price: '85,00 €', link: 'https://b.de/2' }, { title: 'Hasbro Spidey Friends', source: 'S3', price: '12,89 €', link: 'https://c.de/3' }] }) });
        const mod2 = { exports: {} };
        new Function('module', 'process', 'fetch', 'AbortSignal', 'URL', lies('api/maps.js').replace(/^export const config/m, 'const config').replace(/^export default /m, 'module.exports = '))(mod2, { env: { SERPER_API_KEY: 'x', APP_SECRET: 's' } }, fake2, { timeout: () => undefined }, URL);
        let o2; await mod2.exports({ method: 'GET', query: { action: 'shopping', q: 'Marvel Spidey Web-Quartier Spielset Action-Figur' }, headers: { 'x-app-key': 's' } }, { status: c => ({ json: j => { o2 = j; }, end() { } }), setHeader() { }, json: j => { o2 = j; } });
        const TITEL = 'Marvel Spidey und Seine Super-Freunde Web-Spinners Web-Quartier Spielset mit Spidey Action-Figur, Fahrzeug und Zubehör';
        const fake3 = async (url, o) => { const bq = JSON.parse(o.body).q; const kern = /^Spidey Super-Freunde/.test(bq); return { ok: true, json: async () => ({ shopping: kern ? [{ title: 'Marvel Spidey Super-Freunde Web-Spinners Web-Quartier Spielset', source: 'Amazon.de', price: '85,00 €', link: 'https://amazon.de/dp/1' }] : [{ title: 'Marvel Spidey und Seine Super-Freunde Water-Webs Spielzeug 7,6 cm', source: 'Amazon.de', price: '17,58 €', link: 'https://amazon.de/dp/2' }, { title: 'Marvel Spidey und Seine Super-Freunde Dino-Webs Spidey-Rex', source: 'Amazon.de', price: '17,99 €', link: 'https://amazon.de/dp/3' }, { title: 'Marvel Spidey und Seine Super-Freunde Figur Miles', source: 'S4', price: '12,89 €', link: 'https://s4.de/4' }] }) }; };
        const mod3 = { exports: {} };
        new Function('module', 'process', 'fetch', 'AbortSignal', 'URL', lies('api/maps.js').replace(/^export const config/m, 'const config').replace(/^export default /m, 'module.exports = '))(mod3, { env: { SERPER_API_KEY: 'x', APP_SECRET: 's' } }, fake3, { timeout: () => undefined }, URL);
        let o3; await mod3.exports({ method: 'GET', query: { action: 'shopping', q: TITEL }, headers: { 'x-app-key': 's' } }, { status: c => ({ json: j => { o3 = j; }, end() { } }), setHeader() { }, json: j => { o3 = j; } });
        check('Server: zweite, kürzere Suche findet das teure Set; die Kleinfiguren (17 €) fallen weg', o3 && !o3.ungenau && o3.angebote.length === 1 && o3.angebote[0].preis === 85, JSON.stringify(o3));
        const fake4 = async () => ({ ok: true, json: async () => ({ shopping: [{ title: 'Spielset Web-Quartier', source: 'OnBuy.com', price: '80,89 €', link: 'https://onbuy.com/1' }, { title: 'Spielset Web-Quartier', source: 'Spielzeug24', price: '89,00 €', link: 'https://sz24.de/2' }] }) });
        const mod4 = { exports: {} };
        new Function('module', 'process', 'fetch', 'AbortSignal', 'URL', lies('api/maps.js').replace(/^export const config/m, 'const config').replace(/^export default /m, 'module.exports = '))(mod4, { env: { SERPER_API_KEY: 'x', APP_SECRET: 's' } }, fake4, { timeout: () => undefined }, URL);
        let o4; await mod4.exports({ method: 'GET', query: { action: 'shopping', q: 'Spielset Web-Quartier' }, headers: { 'x-app-key': 's' } }, { status: c => ({ json: j => { o4 = j; }, end() { } }), setHeader() { }, json: j => { o4 = j; } });
        check('Server: Marktplätze (OnBuy) sind markiert und stehen hinter normalen Shops', o4 && o4.angebote[0].shop === 'Spielzeug24' && o4.angebote[1].markt === true, JSON.stringify(o4));
        check('Preissuche: Knopf "Bei Amazon suchen" vorhanden', /amazon\.de\/s\?k=/.test(lies('js/preissuche.js')) && /Bei Amazon suchen/.test(lies('js/preissuche.js')));
        const fake5 = async (url, o) => /shopping/.test(url) ? { ok: true, json: async () => ({ shopping: [{ title: 'Marvel Spidey und Seine Super-Freunde Dino-Webs Spidey-Rex', source: 'Amazon.de', price: '17,99 €', link: 'https://amazon.de/dp/3' }, { title: 'Marvel Spidey Figur Miles', source: 'S4', price: '12,89 €', link: 'https://s4.de/4' }] }) } : { ok: true, json: async () => ({ organic: [{ title: 'Marvel Spidey und Seine Super-Freunde Web-Spinners Web-Quartier Spielset ab 85,83 € | idealo', link: 'https://www.idealo.de/preisvergleich/OffersOfProduct/123_-spidey.html', snippet: 'Preise vergleichen' }, { title: 'Suche', link: 'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=x', snippet: 'ab 5,00 €' }] }) };
        const mod5 = { exports: {} };
        new Function('module', 'process', 'fetch', 'AbortSignal', 'URL', lies('api/maps.js').replace(/^export const config/m, 'const config').replace(/^export default /m, 'module.exports = '))(mod5, { env: { SERPER_API_KEY: 'x', APP_SECRET: 's' } }, fake5, { timeout: () => undefined }, URL);
        let o5; await mod5.exports({ method: 'GET', query: { action: 'shopping', q: TITEL }, headers: { 'x-app-key': 's' } }, { status: c => ({ json: j => { o5 = j; }, end() { } }), setHeader() { }, json: j => { o5 = j; } });
        check('Server: Idealo-Produktseite (ab 85,83 €) wird gefunden, direkter Link, Kleinfiguren fallen weg, Suchseite zählt nicht', o5 && !o5.ungenau && o5.angebote.length === 1 && o5.angebote[0].shop === 'Idealo' && o5.angebote[0].preis === 85.83 && /OffersOfProduct/.test(o5.angebote[0].link), JSON.stringify(o5));
        check('Server: passende Angebote bleiben, Zufallstreffer (12 € Figur) fallen weg', o2 && !o2.ungenau && o2.angebote.length === 1 && o2.angebote[0].preis === 85, JSON.stringify(o2));
        check('Server: Kleinanzeigen-Treffer ohne Preis und Suchseiten werden weggelassen', !mit.gebraucht.some(x => /\/k0$|\/9$/.test(x.link)));
    }
    // Links: nie "#" ins Link-Fenster (das lädt Jarvis selbst)
    for (const f of ['preissuche.js', 'wunschliste.js']) { const src = lies('js/' + f); check(f + ': Link ohne Ziel öffnet nie das Link-Fenster (kein "#")', /if \(!href\) \{ e\.preventDefault\(\); return; \}/.test(src) && /nie "#"/.test(src)); }
    // Preissuche: eingefügte Shop-Titel
    {
        const u4 = umgebung(); laden(u4, 'preissuche.js'); const T = u4.sb.jvPreisWaechter && u4.sb.jvPreisWaechter._teile;
        if (T) {
            const titel = 'Marvel Spidey und Seine Super-Freunde Web-Spinners Web-Quartier Spielset mit Spidey Action-Figur, Fahrzeug und Zubehör\nProduktbilder und -videos (KI-generierter Alternativtext)';
            const r = T(titel);
            check('Preissuche: ein eingefügter Amazon-Titel ist EIN Produkt (ganz, ohne Beiwerk)', r.length === 1 && r[0].startsWith('Marvel Spidey und Seine Super-Freunde Web-Spinners Web-Quartier Spielset mit Spidey Action-Figur') && !/Produktbilder|KI-generiert/.test(r[0]), JSON.stringify(r));
            check('Preissuche: kurze Liste mit Komma wird weiter getrennt', T('Toni-Figur, Weihnachtsmann, KKG').length === 3);
            check('Preissuche: "Weihnachtsmann und Co. KG" bleibt ein Produkt', T('Weihnachtsmann und Co. KG').length === 1);
        } else check('Preissuche: _teile vorhanden', false);
    }
    // Preissuche: welche Produkte werden aus dem Satz gesucht?
    {
        const u3 = umgebung(); laden(u3, 'preissuche.js');
        const q = []; 
        u3.sb.apiFetch = async url => { q.push(decodeURIComponent(String(url).split('&q=')[1] || '').replace(/&gebraucht=1$/, '')); return { ok: true, json: async () => ({ angebote: [] }) }; };
        let weiter = false;
        u3.eintraege[0].fn('Ich suche eine Toni-Figur, Weihnachtsmann und KKG, kannst du mir Preise heraussuchen', () => { weiter = true; });
        await new Promise(r => setTimeout(r, 200));
        check('Preissuche: "Toni-Figur, Weihnachtsmann und KKG" werden einzeln gesucht (Toni → Tonie)', !weiter && q.join('|') === 'Tonie Figur|Weihnachtsmann|KKG', q.join('|') + ' / ' + u3.gesagt.join(' ').slice(0, 120));

        q.length = 0; u3.sb.setTimeout = (f) => { f(); return 0; };
        u3.eintraege[0].fn('Ich suche eine Toni-Figur Weihnachtsmann und Co. KG, kannst du mir die Preise heraussuchen', () => { });
        await new Promise(r => setTimeout(r, 200));
        check('Preissuche: "Weihnachtsmann und Co. KG" bleibt ein Produkt (Tonie Figur Weihnachtsmann und Co. KG)', q.length === 1 && /^Tonie Figur Weihnachtsmann und Co\. KG$/i.test(q[0]), q.join('|'));
    }
    // Preisalarm-Schalter (Speicher)
    {
        const u2 = umgebung(); laden(u2, 'preissuche.js'); const PW = u2.sb.jvPreisWaechter;
        if (PW && PW.anlegen) {
            PW.anlegen('Sony WH-1000XM5', { preis: 279, shop: 'Shop', link: 'https://x' });
            const w = PW.finde('sony wh-1000xm5');
            check('Preisalarm: Anlegen merkt Produkt und Startpreis (Treffer erst bei 5 % darunter)', !!w && w.start === 279 && w.preis === 279 && w.grenze === 0, JSON.stringify(w));
            PW.anlegen('Sony WH-1000XM5', { preis: 250 });
            check('Preisalarm: zweimal Anlegen macht keinen doppelten Eintrag und überschreibt den Startpreis nicht', PW.laden().length === 1 && PW.finde('Sony WH-1000XM5').start === 279);
            // Falscher alter Preis wird ersetzt; unsichere Suche behält nie einen Preis
            PW.anlegen('Spidey Web-Quartier Spielset', { preis: 17.99, shop: 'Amazon.de' });
            u2.sb.apiFetch = async () => ({ ok: true, json: async () => ({ angebote: [{ titel: 'Spidey Web-Quartier Spielset', shop: 'Idealo', preis: 85.83, link: 'https://www.idealo.de/preisvergleich/OffersOfProduct/1.html' }] }) });
            await PW.pruefen(true, 'Spidey Web-Quartier Spielset');
            const w2 = PW.finde('Spidey Web-Quartier Spielset');
            check('Preisalarm: beim Prüfen ersetzt der sichere Preis (85,83) den falschen alten (17,99), Angebotsname wird gemerkt', w2.preis === 85.83 && w2.start === 85.83 && /Web-Quartier/.test(w2.titel), JSON.stringify(w2));
            u2.sb.apiFetch = async () => ({ ok: true, json: async () => ({ angebote: [{ titel: 'Anderes', shop: 'X', preis: 12, link: '' }], ungenau: true }) });
            await PW.pruefen(true, 'Spidey Web-Quartier Spielset');
            check('Preisalarm: unsichere Treffer löschen den Preis (lieber keiner als ein falscher)', PW.finde('Spidey Web-Quartier Spielset').preis === null, JSON.stringify(PW.finde('Spidey Web-Quartier Spielset')));
            PW.entfernen('Spidey Web-Quartier Spielset');
            PW.entfernen('Sony WH-1000XM5');
            check('Preisalarm: Ausschalten entfernt den Eintrag', PW.laden().length === 0 && !PW.finde('Sony WH-1000XM5'));
        } else check('Preisalarm: Schnittstelle vorhanden', false);
    }
    // Antrag: Erklärung
    if (u.sb.jvAntrag && u.sb.jvAntrag._erklaerAnfrage) {
        const q = u.sb.jvAntrag._erklaerAnfrage({ id: 'x', nr: '15', bezeichnung: 'Haben Sie keinen festen Wohnsitz?', art: 'ja_nein', optionen: [], hinweis: '' });
        const sys = q.messages[0].content, usr = JSON.parse(q.messages[1].content);
        check('Erklärung: Frage und Ja/Nein-Möglichkeiten gehen an die KI', usr.frage === 'Haben Sie keinen festen Wohnsitz?' && usr.moegliche_antworten.join() === 'Ja,Nein', q.messages[1].content);
        check('Erklärung: KI darf nichts erfinden und nicht für den Nutzer entscheiden', /Entscheide NIE/.test(sys) && /Erfinde nichts/.test(sys) && /doppelte Verneinung/.test(sys));
    }
    // PDF speichern (App-Brücke)
    if (typeof u.sb.jvPdfSpeichern === 'function') {
        const aufrufe = [];
        u.sb.btoa = x => Buffer.from(x, 'binary').toString('base64');
        u.sb.ZaneNative = { speicherePdf: (n, b) => { aufrufe.push([n, b]); return true; } };
        const bytes = new Uint8Array([37, 80, 68, 70, 45, 255, 0, 10]);
        const r1 = u.sb.jvPdfSpeichern(bytes, 'Test.pdf');
        check('PDF speichern: in der App geht die Datei an die Brücke (Name und Inhalt stimmen)', r1 === true && aufrufe.length === 1 && aufrufe[0][0] === 'Test.pdf' && aufrufe[0][1] === Buffer.from(bytes).toString('base64'), JSON.stringify(aufrufe));
        u.sb.ZaneNative = { speicherePdf: () => false };
        u.sb.Blob = function () { }; u.sb.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() { } };
        const r2 = u.sb.jvPdfSpeichern(bytes, 'Test.pdf');
        check('PDF speichern: klappt die Brücke nicht, gibt es den Browser-Weg als Ersatz (kein Absturz)', r2 === true || r2 === false);
    }
    // Briefarten
    const B = u.sb.jvBehoerdenbrief;
    if (B) {
        check('Brief: "Schreib mir eine Kündigung" gehört nicht dazu', B.erkenne('Schreib mir eine Kündigung') === '');
        check('Brief: Merk-dir-Satz startet keinen Brief', B.erkenne('Merk dir ich muss Widerspruch schreiben') === '');
    }
}

console.log('Jarvis-Tests …');
aufbau();
verhalten().then(() => {
    console.log(fehler ? '\n' + fehler + ' Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : '\nAlles in Ordnung (' + ok + ' Prüfungen).');
    process.exit(fehler ? 1 : 0);
}, e => { console.log('FEHLER im Test: ' + (e && e.stack || e)); process.exit(1); });
