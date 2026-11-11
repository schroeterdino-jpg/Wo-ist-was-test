/* ============================================================
   TESTS Chef-KI-Diagnose (nach Phase 6): Start: node tests/chef_diagnose.js
   Einstellungen > Chef-KI zeigt, WARUM die letzte Eingabe übernommen oder übersprungen wurde. Geprüft über den ECHTEN Mikrofonweg
   (Erkenner-Ereignis onresult und die Handy-Brücke __zaneRec) und über Texteingabe (jvTippen). Das DOM der Einstellungen ist eine kleine Attrappe.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ant = d => ({ ok: true, status: 200, json: async () => d });
const PL = [
    { name: 'Trattoria Roma', street: 'Hauptstr.', housenumber: '1', city: 'Hamburg', lat: 53.551, lon: 10.001 },
    { name: 'Fischerhaus Elbblick', street: 'Elbweg', housenumber: '2', city: 'Hamburg', lat: 53.545, lon: 9.95 }
];
const warte = async n => { for (let i = 0; i < (n || 30); i++) await new Promise(r => setImmediate(r)); };
function knoten() {
    const k = { children: [], listeners: {}, style: {}, checked: false, open: false, _t: '' };
    Object.defineProperty(k, 'textContent', { get() { return k._t; }, set(v) { k._t = String(v); k.children = []; } });
    k.appendChild = c => { k.children.push(c); return c; };
    k.addEventListener = (t, fn) => { (k.listeners[t] = k.listeners[t] || []).push(fn); };
    k.feuer = t => (k.listeners[t] || []).forEach(f => f());
    return k;
}
function umgebung(opt) {
    opt = opt || {};
    const st = { ent: 0, groq: 0, places: 0, verhalten: '', antwort: { schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Restaurant' } }] }, placesFehler: false, placesLeer: false, urls: [] };
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, spracherkennung: !opt.native, native: opt.native, fetch: async (u, o) => {
        st.urls.push(String(u).replace(/\?.*$/, ''));
        if (/api\/groq/.test(u)) {
            let m = []; try { m = JSON.parse(o.body).messages || []; } catch (e) { }
            if (m[0] && /Du planst für einen Sprachassistenten/.test(String(m[0].content))) {
                st.ent++;
                if (st.verhalten === 'haengt') return new Promise(() => { });
                if (st.verhalten === 'fehler') return { ok: false, status: 500, json: async () => ({}) };
                if (st.verhalten === 'netz') throw new Error('offline');
                const a = typeof st.antwort === 'function' ? st.antwort() : st.antwort;
                return ant({ choices: [{ message: { content: typeof a === 'string' ? a : JSON.stringify(a) } }] });
            }
            st.groq++; return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Okay.', actions: [] }) } }] });
        }
        if (/action=places/.test(u)) { st.places++; if (st.placesFehler) return { ok: false, status: 500, json: async () => ({}) }; return ant({ places: st.placesLeer ? [] : PL }); }
        if (/api\/geocode/.test(u)) return ant([{ lat: '53.55', lon: '10.0', class: 'place', display_name: 'Hamburg' }]);
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.st = st;
    A.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.1 });
    A.karten = []; A.sb.showActionCards = c => { A.karten.push(c); };
    A.dom = {}; ['chefSchalter', 'chefStatus', 'chefLetzte', 'chefListe', 'chefLoeschen', 'chefBox'].forEach(id => { A.dom[id] = knoten(); });
    A.sb.document.getElementById = id => A.dom[id] || null;
    A.sb.document.createElement = () => knoten();
    A.sb.jvChef.starte();
    return A;
}
/* Eingabeweg 1: echtes Mikrofon (Erkenner-Ereignis, wie es die Android-Erkennung auslöst) */
async function mikro(A, satz, lang) {
    const g0 = A.gesagt.length;
    const lauf = async () => { A.erkenner[0].onresult({ resultIndex: 0, results: [[{ transcript: satz, confidence: 0.9 }]] }); if (lang) await new Promise(res => A.sb.setTimeout(res, 9000)); await warte(60); };
    await A.lassLaufen(lauf); await A.lassLaufen(async () => { await warte(40); });
    return A.gesagt.slice(g0).join(' ');
}
/* Eingabeweg 2: getippter Text (derselbe Eingang wie das Mikrofon: handleRecognizedText) */
async function tippen(A, satz, lang) {
    const g0 = A.gesagt.length;
    const lauf = async () => { A.sb.jvTippen(satz); if (lang) await new Promise(res => A.sb.setTimeout(res, 9000)); await warte(60); };
    await A.lassLaufen(lauf); await A.lassLaufen(async () => { await warte(40); });
    return A.gesagt.slice(g0).join(' ');
}
const letzte = A => { const e = A.sb.jvChef.eingaenge(); return e.length ? e[e.length - 1] : null; };
const codes = A => { const l = letzte(A); return l ? l.codes.join('>') : '(keiner)'; };
const NAT = 'mir knurrt der magen wo gibt es hier was warmes';
const ortsplan = (b, o) => ({ schritte: [{ faehigkeit: 'ortssuche', params: o ? { suchbegriff: b, ort: o } : { suchbegriff: b } }] });

(async () => {
    /* ---------- AUS: nichts wird beobachtet, nichts kostet etwas ---------- */
    let A = umgebung();
    check('0a keine Ladefehler, Diagnose vorhanden', A.ladefehler.length === 0 && typeof A.sb.jvChef.eingaenge === 'function' && typeof A.sb.jvChef.befehlVorrang === 'function', A.ladefehler.join(';'));
    const befehle0 = A.sb.jvCommands.list().map(c => c.name || c).join('|');
    await mikro(A, NAT); await tippen(A, 'was kannst du'); await mikro(A, 'ich habe hunger was gibt es hier in der nähe');
    check('1a Chef-KI AUS: keine Einträge, auch bei Mikrofon und Text', A.sb.jvChef.eingaenge().length === 0);
    check('1b AUS: die Anzeige sagt es, kein Entscheider-Aufruf, keine Ortssuche über die Chef-KI', /ist aus/.test(A.dom.chefLetzte.textContent) && A.st.ent === 0 && A.st.places === 0 && A.dom.chefListe.children.length === 0, A.dom.chefLetzte.textContent);
    check('1c AUS: befehlVorrang() und kiWeg() tun nichts', A.sb.jvChef.befehlVorrang() === false && A.sb.jvChef.kiWeg(NAT) === false && A.sb.jvChef.eingaenge().length === 0);

    /* ---------- Bestehender Befehl hatte Vorrang ---------- */
    A = umgebung(); A.sb.jvChef.an();
    await mikro(A, 'was kannst du');
    check('2a Mikrofon: ein fester Befehl beantwortet den Satz -> "Bestehender Befehl hatte Vorrang"', codes(A) === 'befehl_vorrang' && A.st.ent === 0 && A.st.groq === 0, codes(A));
    await tippen(A, 'wer bist du'); const c2 = codes(A);
    check('2b Text: dasselbe', c2 === 'befehl_vorrang' && A.sb.jvChef.eingaenge().length === 2, c2 + ' n=' + A.sb.jvChef.eingaenge().length);
    check('2c die Anzeige nennt den Grund in Klartext', /Bestehender Befehl hatte Vorrang/.test(A.dom.chefLetzte.textContent) && A.dom.chefListe.children.length === 2, A.dom.chefLetzte.textContent);

    /* ---------- Chef-KI übernimmt (lokales Muster) und führt die Ortssuche aus ---------- */
    A = umgebung(); A.sb.jvChef.an();
    await mikro(A, 'ich habe hunger was gibt es hier in der nähe');
    check('3a Mikrofon: lokales Muster + gültige Ortssuche, EIN Eintrag (kein zusätzliches "Befehl hatte Vorrang")', codes(A) === 'lokal_uebernommen>ortssuche_ausgefuehrt' && A.sb.jvChef.eingaenge().length === 1 && A.st.places === 1 && A.st.ent === 0, codes(A));
    A.uhr.ms += 6000;
    await tippen(A, 'such mir einen schönen italiener');
    check('3b Text: dasselbe', codes(A) === 'lokal_uebernommen>ortssuche_ausgefuehrt' && A.sb.jvChef.eingaenge().length === 2, codes(A));

    /* ---------- Vorfilter ---------- */
    A = umgebung(); A.sb.jvChef.an();
    await mikro(A, 'hallo du');
    check('4a zu kurz -> "Vorfilter: übersprungen (zu kurz oder zu lang)"', codes(A) === 'vorfilter_laenge', codes(A));
    A.st.antwort = { schritte: [] };
    await tippen(A, 'erzähl mir bitte etwas über die geschichte von rom');
    check('4b kein Ortsstichwort -> der Entscheider wird trotzdem gefragt (ohne Stichwort-Filter), plant nichts, der bisherige Ablauf (normale KI) lief', /ki_aufgerufen/.test(codes(A)) && !/ortssuche_ausgefuehrt/.test(codes(A)) && A.st.ent === 1 && A.st.groq === 2, codes(A) + ' groq ' + A.st.groq);
    check('4c Schreibwunsch (B2a): kein Vorfilter mehr, die Chef-KI prüft den Satz (ein Entscheider-Aufruf)', A.sb.jvChef.kiWeg('erinnere mich heute abend zu essen in der nähe') === true && /ki_aufgerufen/.test(codes(A)), codes(A));
    check('4d zu lang -> Vorfilter', A.sb.jvChef.kiWeg(Array(40).fill('hier').join(' ')) === false && codes(A) === 'vorfilter_laenge');
    A.st.antwort = ortsplan('Restaurant');
    await mikro(A, NAT); const n0 = A.st.ent; await mikro(A, NAT);
    check('4e derselbe Satz kurz danach noch einmal -> "derselbe Satz eben schon", keine zweite Anfrage', codes(A) === 'vorfilter_doppelt' && A.st.ent === n0, codes(A));

    /* ---------- KI-Entscheider ---------- */
    A = umgebung(); A.sb.jvChef.an(); A.st.antwort = ortsplan('Restaurant');
    await mikro(A, NAT);
    check('5a KI-Entscheider aufgerufen und gültige Ortssuche ausgeführt (Mikrofon)', codes(A) === 'ki_aufgerufen>ortssuche_ausgefuehrt' && A.st.ent === 1 && A.st.places === 1 && A.st.groq === 0, codes(A));
    const KI = [
        ['KI sagt: kein Ortswunsch', { antwort: '{"schritte":[]}' }, 'ki_aufgerufen>ki_kein_ortswunsch>rueckfall'],
        ['ungültiges JSON', { antwort: 'kein json' }, 'ki_aufgerufen>ki_ungueltig>rueckfall'],
        ['leere Antwort', { antwort: '' }, 'ki_aufgerufen>ki_fehler>rueckfall'],
        ['nicht erlaubter Plan (Erinnerung)', { antwort: { schritte: [{ faehigkeit: 'erinnerung_erstellen', params: { text: 'x' } }] } }, 'ki_aufgerufen>ki_nicht_erlaubt>rueckfall'],
        ['nicht erlaubter Plan (eingeschleustes bestaetigt)', { antwort: { schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza', bestaetigt: true } }] } }, 'ki_aufgerufen>ki_nicht_erlaubt>rueckfall'],
        ['Netzwerkfehler', { verhalten: 'netz' }, 'ki_aufgerufen>ki_fehler>rueckfall'],
        ['Serverfehler', { verhalten: 'fehler' }, 'ki_aufgerufen>ki_fehler>rueckfall'],
        ['Zeitlimit', { verhalten: 'haengt' }, 'ki_aufgerufen>ki_zeitlimit>rueckfall']
    ];
    for (const [name, v, soll] of KI) {
        for (const weg of ['mikro', 'tippen']) {
            A = umgebung(); A.sb.jvChef.an(); Object.assign(A.st, v);
            await (weg === 'mikro' ? mikro : tippen)(A, NAT, v.verhalten === 'haengt');
            check('5b ' + name + ' (' + weg + '): ' + soll, codes(A) === soll && A.st.ent === 1 && A.st.groq === 1 && A.st.places === 0, codes(A) + ' ent ' + A.st.ent + ' groq ' + A.st.groq);
        }
    }
    A = umgebung(); A.sb.jvChef.an(); A.st.antwort = () => { A.sb.jvChef.aus(); return ortsplan('Restaurant'); }; A.sb.jvChef.an();
    A.st.antwort = () => { A.sb.jvChef.aus(); return ortsplan('Restaurant'); };
    await mikro(A, NAT);
    check('5c während der KI-Antwort ausgeschaltet -> "inzwischen ausgeschaltet" und Rückfall', A.sb.jvChef.eingaenge().length === 1 && codes(A) === 'ki_aufgerufen>ausgeschaltet>rueckfall' && A.st.places === 0, codes(A));
    A = umgebung(); A.sb.jvChef.an(); A.st.verhalten = 'haengt';
    const pA = A.lassLaufen(async () => { A.sb.jvTippen(NAT); await warte(10); });
    await pA; A.st.verhalten = ''; A.st.antwort = ortsplan('Restaurant');
    await mikro(A, 'wir wollen heute abend auswärts speisen irgendwas mit meerblick');
    const alle = A.sb.jvChef.eingaenge().map(e => e.codes.join('>'));
    check('5d ein neuer Satz überholt einen hängenden: der alte steht als "überholt" (kein Rückfall), der neue läuft', alle.length === 2 && /ki_aufgerufen/.test(alle[1]) && alle[1].endsWith('ortssuche_ausgefuehrt'), JSON.stringify(alle));

    /* ---------- Ergebnisse der Ortssuche ---------- */
    A = umgebung(); A.sb.jvChef.an(); A.st.placesLeer = true;
    await mikro(A, 'ich habe hunger was gibt es hier in der nähe');
    check('6a keine Treffer -> Nachfrage nach dem Ort', codes(A) === 'lokal_uebernommen>keine_treffer', codes(A));
    A = umgebung(); A.sb.jvChef.an(); A.st.placesFehler = true;
    await mikro(A, 'ich habe hunger was gibt es hier in der nähe');
    check('6b Suchfehler -> "Fehler bei der Ortssuche"', codes(A) === 'lokal_uebernommen>fehler_suche', codes(A));
    A = umgebung(); A.sb.jvChef.an();
    await mikro(A, 'such mir was schönes');
    check('6c fehlende Angabe -> Rückfrage gestellt', codes(A) === 'lokal_uebernommen>rueckfrage', codes(A));
    await mikro(A, 'pizza');
    check('6d die Antwort auf die Rückfrage ist ein eigener Eintrag mit gültiger Ortssuche', codes(A) === 'rueckfrage_antwort>ortssuche_ausgefuehrt' && A.sb.jvChef.eingaenge().length === 2, codes(A));
    A = umgebung(); A.sb.jvChef.an(); await mikro(A, 'such mir was schönes'); await mikro(A, 'nein');
    check('6e "nein" auf die Rückfrage -> "Rückfrage abgebrochen"', codes(A) === 'rueckfrage_antwort>abgebrochen', codes(A));

    /* ---------- Handy-Brücke (App): Android-Erkennung -> __zaneRec ---------- */
    const native = { recStart() { }, recStop() { }, recAbort() { } };
    A = umgebung({ native }); A.sb.jvChef.an(); A.st.antwort = ortsplan('Restaurant');
    const rec = A.lese('recognition');
    await A.lassLaufen(async () => { try { rec.start(); } catch (e) { } await warte(5); });
    await A.lassLaufen(async () => { A.sb.__zaneRec('result', [{ t: NAT, c: 0.9 }]); await warte(60); }); await A.lassLaufen(async () => { await warte(40); });
    check('7a Handy-Brücke (__zaneRec -> native_speech.js -> hoeren.js -> voice.js): dieselbe Diagnose', codes(A) === 'ki_aufgerufen>ortssuche_ausgefuehrt' && A.st.ent === 1, codes(A));

    /* ---------- Datenschutz: keine Sätze ---------- */
    A = umgebung(); A.sb.jvChef.an(); A.st.antwort = ortsplan('Restaurant');
    const geheim = ['knurrt', 'magen', 'meerblick', 'schönen italiener', 'hunger'];
    await mikro(A, NAT); await tippen(A, 'wir wollen heute abend auswärts speisen irgendwas mit meerblick'); A.uhr.ms += 6000; await mikro(A, 'ich habe hunger was gibt es hier in der nähe'); await tippen(A, 'was kannst du');
    const roh = JSON.stringify(A.sb.jvChef.eingaenge()) + JSON.stringify(A.sb.jvChef.protokoll()) + A.dom.chefLetzte.textContent + A.dom.chefListe.children.map(c => c.textContent).join('|') + JSON.stringify(A.store);
    check('8a keine Nutzersätze in Diagnose, Anzeige oder Speicher', !geheim.some(w => roh.includes(w)) && !/Erinner|ich habe/.test(roh.replace(/Gültige Ortssuche[^"]*/g, '')), roh.slice(0, 300));
    check('8b ein Eintrag hat nur Nummer, Zeit, Statuscodes und (KI-Weg) zwei Zahlen: Dauer und Anzahl KI-Anfragen', A.sb.jvChef.eingaenge().every(e => Object.keys(e).filter(k => k !== 'ms' && k !== 'ki').sort().join() === 'codes,nr,text,zeit' && (e.ms === undefined || (typeof e.ms === 'number' && typeof e.ki === 'number')) && e.codes.every(c => /^[a-z_]+$/.test(c))));
    const chefJs = lies('js/chef.js').replace(/\/\*[\s\S]*?\*\//g, '');
    check('8c Quelltext: Einträge entstehen nur aus Statuscodes (neuerEingang/vermerke bekommen keinen Text), kein localStorage-Zugriff dafür', /function neuerEingang\(code\)/.test(chefJs) && /function vermerke\(e, code\)/.test(chefJs) && !/vermerke\([^)]*text[^)]*\)/.test(chefJs));

    /* ---------- Anzeige: Reihenfolge, Grenzen, Löschen, Schalter ---------- */
    A = umgebung(); A.sb.jvChef.an();
    for (let i = 0; i < 13; i++) { await tippen(A, 'was kannst du'); }
    check('9a höchstens 10 Einträge, neueste zuerst in der Liste', A.sb.jvChef.eingaenge().length === 10 && A.dom.chefListe.children.length === 10 && /^#13 /.test(A.dom.chefListe.children[0].textContent) && /^#4 /.test(A.dom.chefListe.children[9].textContent), A.dom.chefListe.children.map(c => c.textContent.slice(0, 4)).join());
    check('9b "Letzte Eingabe:" nennt den jüngsten Grund', /^Letzte Eingabe: Bestehender Befehl hatte Vorrang/.test(A.dom.chefLetzte.textContent));
    A.dom.chefLoeschen.feuer('click');
    check('9c Löschen leert Diagnose und Anzeige', A.sb.jvChef.eingaenge().length === 0 && A.dom.chefListe.children.length === 0 && /Noch keine Eingabe/.test(A.dom.chefLetzte.textContent), A.dom.chefLetzte.textContent);
    A = umgebung(); A.dom.chefSchalter.checked = true; A.dom.chefSchalter.feuer('change');
    check('9d Schalter in den Einstellungen schaltet EIN, Status sichtbar', A.sb.jvChef.istAn() === true && A.dom.chefStatus.textContent === 'EIN (Orte, Internet, Wetter, Kalender, Aufgaben, Notizen, Termine verschieben nach Bestätigung)' && /Noch keine Eingabe/.test(A.dom.chefLetzte.textContent));
    A.dom.chefSchalter.checked = false; A.dom.chefSchalter.feuer('change');
    check('9e … und AUS; danach wird nichts mehr beobachtet', A.sb.jvChef.istAn() === false && A.dom.chefStatus.textContent === 'AUS' && (await tippen(A, 'was kannst du'), A.sb.jvChef.eingaenge().length === 0));
    const html = lies('index.html');
    check('9f index.html: Anzeige "chefLetzte" und Liste "chefListe" in den Einstellungen, Schalter nicht vorbelegt', /id="chefLetzte"/.test(html) && /id="chefListe"/.test(html) && !/id="chefSchalter"[^>]*checked/.test(html));

    /* ---------- Keine zusätzlichen KI-Anfragen, Befehle unverändert, Schatten unabhängig ---------- */
    A = umgebung(); A.sb.jvChef.an(); A.st.antwort = { schritte: [] };
    for (const s of ['was kannst du', 'hallo du', NAT, 'erzähl mir bitte etwas über die geschichte von rom', 'ich habe hunger was gibt es hier in der nähe']) { await mikro(A, s); A.uhr.ms += 6000; }
    const z = A.sb.jvChef.kiZaehler();
    check('10a die Diagnose löst keine KI-Anfrage aus: Entscheider-Anfragen = KI-Weg-Anfragen, jede Eingabe höchstens eine', A.st.ent === z.anfragen && A.st.ent === 2, JSON.stringify({ ent: A.st.ent, z }));
    check('10b die Befehlsliste bleibt unverändert (Anzahl und Reihenfolge)', A.sb.jvCommands.list().map(c => c.name || c).join('|') === befehle0);
    check('10c Netzaufrufe nur /api/groq und Ortssuche', A.st.urls.every(u => /api\/groq|api\/maps|api\/geocode|api\/memory|places/.test(u)), JSON.stringify([...new Set(A.st.urls)]));
    A = umgebung(); const s0 = A.sb.jvSchatten.istAn(); A.sb.jvChef.an(); await mikro(A, 'was kannst du'); A.sb.jvChef.aus();
    check('10d der Schattenbetrieb bleibt unabhängig: Chef-KI ein/aus schaltet ihn nicht, chef.js kennt ihn nicht', A.sb.jvSchatten.istAn() === s0 && !/jvSchatten/.test(lies('js/chef.js')));
    A = umgebung(); A.sb.jvSchatten.an(); A.sb.jvChef.an(); await mikro(A, 'was kannst du');
    check('10e … und umgekehrt: bei laufendem Schattenbetrieb entsteht der Diagnoseeintrag normal', codes(A) === 'befehl_vorrang' && A.sb.jvSchatten.istAn() === true);

    /* ---------- Statisch ---------- */
    const voice = lies('js/voice.js');
    check('11a voice.js: genau ein Haken befehlVorrang, in derselben Zeile wie der feste Befehl, abgesichert', (voice.match(/befehlVorrang/g) || []).length === 1 && /handleLocalCommand\(text\)\) \{ try \{ if \(window\.jvChef\) window\.jvChef\.befehlVorrang\(\); \} catch \(e\) \{ \} return; \}/.test(voice));
    check('11b Anleitung und Hilfe erwähnen die Diagnose', /Letzte Eingabe/.test(lies('js/anleitung.js')) && /Letzte Eingabe/.test(lies('js/help.js')) );

    console.log('CHEF-DIAGNOSE: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(2); });
