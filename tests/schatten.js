/* ============================================================
   TESTS Phase 3 "Schattenbetrieb": Start: node tests/schatten.js
   Teil 1: standardmäßig aus, hängt sich nicht ein, Datei ist rein (kein Netz, kein Speichern, keine Sprache, keine Zeitgeber)
   Teil 2: Erkennung (welche Registry-Fähigkeit passt?) und Urteile (Vergleich mit dem tatsächlichen Weg)
   Teil 3: Datenschutz des Protokolls (nie Sätze), Grenzen, Fehlerfestigkeit
   Teil 4: Beweis "verändert nichts": dieselben Anfragen mit Schatten AUS und AN geben gleiche Sprachausgabe, gleichen Speicher, gleiche Netzaufrufe, gleiche Aktionen
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const JETZT = '2026-11-05T10:00:00+01:00';
const ant = d => ({ ok: true, status: 200, json: async () => d });
const URTEILE = ['uebereinstimmung', 'lokal_statt_faehigkeit', 'ki_ohne_aktion', 'andere_faehigkeit', 'unerwartete_faehigkeit', 'keine_faehigkeit'];

function umgebung(opt) {
    opt = opt || {};
    const kiAntwort = opt.ki;   // () => { reply, actions } oder null (dann offline)
    const A = starte({ jetzt: JETZT, festerZufall: true, speicher: opt.speicher, fetch: async (u) => {
        if (/\/api\/groq/.test(u) && kiAntwort) return ant({ choices: [{ message: { content: JSON.stringify(kiAntwort()) } }] });
        if (opt.extra) { const q = await opt.extra(u); if (q) return q; }
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.zaehler = { exec: 0 };
    const e0 = A.sb.executeAction; A.sb.executeAction = function () { A.zaehler.exec++; return e0.apply(this, arguments); };
    return A;
}
/* so wie voice.js: erst feste Befehle, sonst die KI */
async function anfrage(A, text) {
    const g0 = A.gesagt.length;
    const l = await A.lassLaufen(() => A.sb.handleLocalCommand(text));
    if (!l.wert) await A.lassLaufen(() => A.sb.sendToGroqSmart(text));
    await new Promise(res => setImmediate(res));
    return A.gesagt.slice(g0);
}
const zustand = A => JSON.stringify({ s: A.store, m: A.lese('memoryItems'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), t: A.lese('todoEntries'), e: A.lese('shoppingEntries') });

(async () => {
    /* ================= Teil 1: aus, rein ================= */
    const quelle = lies('js/schatten.js');
    const code = quelle.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check('1a Datei: kein Netz, kein Speichern, keine Sprache, keine Zeitgeber, keine Aktionsausführung, keine KI', !/fetch\(|apiFetch|XMLHttpRequest|setPersistentData|setItem|removeItem|speak\(|speakAck|setTimeout|setInterval|executeAction|sendToGroqSmart|document\.|sendBeacon/.test(code), (code.match(/fetch\(|apiFetch|XMLHttpRequest|setPersistentData|setItem|removeItem|speak\(|speakAck|setTimeout|setInterval|executeAction|sendToGroqSmart|document\.|sendBeacon/) || [])[0]);
    check('1b Datei: localStorage wird nur GELESEN (getItem "jv_schatten")', (code.match(/localStorage/g) || []).length === 2 && /getItem\('jv_schatten'\)/.test(code));
    check('1c Datei: im Protokoll steht kein Feld für den Satz (nur Kurzprüfsumme im offenen Vorgang)', !/\btext:/.test(code.replace(/function laenge[\s\S]*?\}/, '')) );

    let A = umgebung();
    check('2a keine Ladefehler, Schatten vorhanden', A.ladefehler.length === 0 && typeof A.sb.jvSchatten === 'object', A.ladefehler.join(';'));
    check('2b STANDARD: aus', A.sb.jvSchatten.istAn() === false);
    check('2c aus: handleLocalCommand ist nicht umhüllt', !A.sb.handleLocalCommand._jvSchatten);
    const befehle = JSON.stringify(A.sb.jvCommands.list()), ref = JSON.stringify(umgebung().sb.jvCommands.list());
    check('2d die Befehlsliste ist unverändert (gleich wie ohne Schatten), kein Schatten darunter', befehle === ref && !/schatten/i.test(befehle));
    const orig = A.sb.handleLocalCommand;
    await anfrage(A, 'Hallo');
    await A.lassLaufen(() => A.sb.sendToGroqSmart('Wie geht es dir'));
    check('2e aus: nach Anfragen nichts protokolliert, nichts gezählt', A.sb.jvSchatten.protokoll().length === 0 && JSON.stringify(A.sb.jvSchatten.zaehler()) === '{"eigeneFehler":0}');
    check('2f aus: ki() tut nichts und wirft nicht', (A.sb.jvSchatten.ki([{ type: 'reminder' }], 'x', false), A.sb.jvSchatten.protokoll().length === 0));

    /* Schalter */
    A.sb.jvSchatten.an();
    check('3a an: schaltet ein, handleLocalCommand ist umhüllt, die Eigenschaften des Originals bleiben', A.sb.jvSchatten.istAn() && A.sb.handleLocalCommand._jvSchatten === true && Object.keys(orig).every(k => A.sb.handleLocalCommand[k] === orig[k]) && A.sb.handleLocalCommand !== orig && JSON.stringify(A.sb.jvCommands.list()) === befehle);
    A.sb.jvSchatten.an();
    check('3b zweimal an: wird nicht doppelt umhüllt', (() => { const h = A.sb.handleLocalCommand; A.sb.jvSchatten.an(); return h === A.sb.handleLocalCommand; })());
    A.sb.jvSchatten.aus();
    check('3c aus: das Original ist wieder da (dieselbe Funktion)', A.sb.handleLocalCommand === orig && !A.sb.jvSchatten.istAn());
    A.sb.jvSchatten.an(); const fremd = function () { return false; }; A.sb.handleLocalCommand = fremd; A.sb.jvSchatten.aus();
    check('3d aus: hat sich zwischendurch jemand anders eingehängt, bleibt dessen Funktion unberührt', A.sb.handleLocalCommand === fremd);
    const B = umgebung({ speicher: { jv_schatten: '1' } });
    check('3e der Schalter "jv_schatten" = "1" im Speicher schaltet beim Start ein', B.sb.jvSchatten.istAn() === true && B.sb.handleLocalCommand._jvSchatten === true, JSON.stringify(Object.keys(B.store)));
    check('3f ohne den Schalter oder bei anderem Wert bleibt er aus', umgebung({ speicher: { jv_schatten: '0' } }).sb.jvSchatten.istAn() === false);

    /* ================= Teil 2: Erkennung und Urteile ================= */
    A = umgebung(); const S = A.sb.jvSchatten;
    const E = [
        ['Gibt es ein Restaurant in der Nähe', 'ortssuche'], ['Ich suche eine Pizzeria in Reinbek', 'ortssuche'], ['Wo kann ich Sushi essen gehen', 'ortssuche'],
        ['Was läuft heute im Fernsehen', 'websuche'], ['Was sind die aktuellen Nachrichten', 'websuche'], ['Such mir das im Internet', 'websuche'],
        ['Erinner mich morgen an Kaffee', 'erinnerung_erstellen'], ['Weck mich um sieben', 'wecker_stellen'], ['Setz eine Erinnerung für Freitag', 'erinnerung_erstellen'],
        ['Trag morgen einen Termin beim Zahnarzt ein', 'termin_erstellen'], ['Leg einen Termin an', 'termin_erstellen'],
        ['Merk dir, dass der Schlüssel im Auto liegt', 'gedaechtnis_speichern'], ['Vergiss nicht, dass Mama Geburtstag hat', 'gedaechtnis_speichern'],
        ['Wie geht es dir', ''], ['Erzähl mir einen Witz', ''], ['Wie spät ist es', ''], ['Hallo', ''], ['', ''], ['   ', '']
    ];
    for (const [t, soll] of E) check('4a erkenne("' + t + '") = ' + (soll || 'nichts'), S.erkenne(t).join() === soll, S.erkenne(t).join());
    for (const x of [null, undefined, 5, {}, [], 'x'.repeat(100000), 'ß'.repeat(1000)]) { let r, w = false; try { r = S.erkenne(x); } catch (e) { w = true; } check('4b erkenne wirft nicht bei ' + String(x).slice(0, 12), !w && Array.isArray(r)); }
    check('4c Erkennung ändert nichts an der Eingabe und ist wiederholbar', S.erkenne('Erinner mich morgen') .join() === S.erkenne('Erinner mich morgen').join());
    const reg = A.sb.jvRegistry.namen(), hin = S._hinweise(), ohne = S._ohneErkennung();
    check('4d jede angemeldete Fähigkeit hat Erkennungsmuster oder steht ausdrücklich in der Ausnahmeliste', reg.every(n => hin.includes(n) || ohne.includes(n)), reg.filter(n => !hin.includes(n) && !ohne.includes(n)).join());
    check('4e die Muster gelten nur für angemeldete Fähigkeiten (kein toter Eintrag)', hin.every(n => reg.includes(n)), hin.filter(n => !reg.includes(n)).join());

    /* Urteile über ki() */
    S.an();
    const urteil = (text, aktionen) => { S.vergiss(); S.ki(aktionen, text, false); const p = S.protokoll(); return p.length === 1 ? p[0].urteil : 'PROTOKOLL ' + p.length; };
    check('5a Fähigkeit vermutet und benutzt → uebereinstimmung', urteil('Gibt es ein Restaurant in der Nähe', [{ type: 'nearby_places' }]) === 'uebereinstimmung');
    check('5b Erinnerung vermutet, KI antwortet nur (chat) → ki_ohne_aktion', urteil('Erinner mich morgen an Kaffee', [{ type: 'chat' }]) === 'ki_ohne_aktion');
    check('5c Erinnerung vermutet, KI liefert gar keine Aktion → ki_ohne_aktion', urteil('Erinner mich morgen an Kaffee', []) === 'ki_ohne_aktion');
    check('5d Restaurant vermutet, KI sucht im Internet → andere_faehigkeit', urteil('Gibt es ein Restaurant in der Nähe', [{ type: 'web_lookup' }]) === 'andere_faehigkeit');
    check('5e nichts vermutet, KI legt Erinnerung an → unerwartete_faehigkeit', urteil('Mach das bitte', [{ type: 'reminder' }]) === 'unerwartete_faehigkeit');
    check('5f normales Gespräch → keine_faehigkeit', urteil('Wie geht es dir', [{ type: 'chat' }]) === 'keine_faehigkeit');
    check('5g Aktionen ohne Registry-Fähigkeit (Einkauf) bei nichts vermutet → keine_faehigkeit, Aktionsart steht im Protokoll', (S.vergiss(), S.ki([{ type: 'shopping', shopping_items: ['Milch'] }], 'Setz Milch auf die Liste', false), S.protokoll()[0].urteil === 'keine_faehigkeit' && S.protokoll()[0].aktionen.join() === 'shopping'));
    check('5h mehrere Aktionen: eine passt → uebereinstimmung', urteil('Erinner mich morgen und trag einen Termin ein', [{ type: 'chat' }, { type: 'calendar' }]) === 'uebereinstimmung');
    check('5i alle fünf Fähigkeiten werden über ihre Aktionsart zugeordnet (aus der Registry)', (() => { S.vergiss(); S.ki([{ type: 'nearby_places' }, { type: 'web_lookup' }, { type: 'reminder' }, { type: 'calendar' }, { type: 'memory_store' }], 'x', false); return S.protokoll()[0].faehigkeiten.join() === 'ortssuche,websuche,erinnerung_erstellen,termin_erstellen,gedaechtnis_speichern'; })());
    for (const muell of [[null], [''], [5], [{}], [{ type: 5 }], [{ type: null }], 'kein array', null, undefined, [[]], [{ type: {} }]]) {
        let w = false; try { S.ki(muell, 'Wie geht es dir', false); } catch (e) { w = true; }
        check('5j Müll in den Aktionen (' + JSON.stringify(muell) + '): kein Absturz', !w);
    }
    check('5k alle Urteile gehören zur festen Liste', S.protokoll().every(e => URTEILE.includes(e.urteil)));
    const akt = [{ type: 'reminder', reminder_text: 'Kaffee' }]; const kopie = JSON.stringify(akt); S.ki(akt, 'Erinner mich', false);
    check('5l ki() verändert die übergebenen Aktionen nicht', JSON.stringify(akt) === kopie);
    const fr = Object.freeze([Object.freeze({ type: 'reminder' })]); let wf = false; try { S.ki(fr, 'x', false); } catch (e) { wf = true; }
    check('5m eingefrorene Aktionen (nicht schreibbar): kein Absturz', !wf);

    /* Weg über handleLocalCommand */
    A = umgebung(); A.sb.jvSchatten.an();
    let g = await anfrage(A, 'Zeig mir die Nachrichten von heute');
    let p = A.sb.jvSchatten.protokoll();
    check('6a fester Befehl erledigt eine Anfrage, zu der eine Fähigkeit passt → lokal_statt_faehigkeit', p.length === 1 && p[0].weg === 'lokal' && p[0].urteil === 'lokal_statt_faehigkeit' && p[0].kandidaten.join() === 'websuche', JSON.stringify(p));
    A.sb.jvSchatten.vergiss(); await anfrage(A, 'Hallo');
    check('6b fester Befehl ohne passende Fähigkeit → keine_faehigkeit, Weg lokal', A.sb.jvSchatten.protokoll().length === 1 && A.sb.jvSchatten.protokoll()[0].weg === 'lokal' && A.sb.jvSchatten.protokoll()[0].urteil === 'keine_faehigkeit');
    const B2 = umgebung({ ki: () => ({ reply: 'Ich habe nachgeschaut.', actions: [{ type: 'chat' }] }) }); B2.sb.jvSchatten.an();
    await anfrage(B2, 'Erinner mich morgen an Kaffee');
    p = B2.sb.jvSchatten.protokoll();
    check('6c unbekannt für feste Befehle → KI: EIN Vorgang (nicht zwei), Weg ki, Urteil ki_ohne_aktion', p.length === 1 && p[0].weg === 'ki' && p[0].urteil === 'ki_ohne_aktion' && p[0].kandidaten.join() === 'erinnerung_erstellen', JSON.stringify(p));
    const B3 = umgebung({ ki: () => ({ reply: 'Okay, ich erinnere dich.', actions: [{ type: 'reminder', reminder_text: 'Kaffee', reminder_time: '2026-11-06T08:00:00' }] }) }); B3.sb.jvSchatten.an();
    await anfrage(B3, 'Erinner mich morgen an Kaffee');
    p = B3.sb.jvSchatten.protokoll();
    check('6d KI wählt die passende Aktion → uebereinstimmung (und die Erinnerung wurde in der Attrappe wirklich angelegt)', p.length === 1 && p[0].urteil === 'uebereinstimmung' && B3.lese('reminderEntries').length === 1, JSON.stringify(p));
    /* KI direkt (ohne vorherigen festen Befehl), Mehrfachfrage-Modus */
    const B4 = umgebung({ ki: () => ({ reply: 'x', actions: [{ type: 'web_lookup', web_query: 'tv' }] }) }); B4.sb.jvSchatten.an();
    await B4.lassLaufen(() => B4.sb.sendToGroqSmart('Was läuft heute im Fernsehen', { nurLesen: true }));
    check('6e direkter KI-Aufruf ohne festen Befehl wird auch erfasst', B4.sb.jvSchatten.protokoll().length === 1 && B4.sb.jvSchatten.protokoll()[0].urteil === 'uebereinstimmung', JSON.stringify(B4.sb.jvSchatten.protokoll()));
    const B5 = umgebung({ ki: () => ({ reply: 'x', actions: [] }) }); B5.sb.jvSchatten.an();
    await B5.lassLaufen(() => B5.sb.handleLocalCommand('Wie spät genau ist es auf dem Mond'));
    await B5.lassLaufen(() => B5.sb.sendToGroqSmart('Etwas ganz anderes'));
    check('6f ein offener Vorgang mit anderem Satz wird nicht mit der KI-Anfrage verwechselt (zwei getrennte Vorgänge: lokal, ki)', B5.sb.jvSchatten.protokoll().length === 2 && B5.sb.jvSchatten.protokoll().map(e => e.weg).join() === 'lokal,ki');

    /* ================= Teil 3: Datenschutz, Grenzen, Fehlerfestigkeit ================= */
    const P = umgebung({ ki: () => ({ reply: 'Alles klar.', actions: [{ type: 'chat' }] }) }); P.sb.jvSchatten.an();
    const geheim = ['Zahnarzt Dr. Müller', 'Schlüsselbund Geheimwort Pfefferminz', 'Mama Geburtstag Hamburg Lieblingsrestaurant Roma'];
    await anfrage(P, 'Erinner mich morgen an den Zahnarzt Dr. Müller');
    await anfrage(P, 'Merk dir Schlüsselbund Geheimwort Pfefferminz');
    await anfrage(P, 'Gibt es ein Restaurant in Hamburg für Mama Geburtstag, Lieblingsrestaurant Roma');
    const roh = JSON.stringify(P.sb.jvSchatten.protokoll()) + JSON.stringify(P.sb.jvSchatten.zaehler());
    check('7a das Protokoll enthält kein einziges Wort der Sätze', !/Zahnarzt|Müller|Schlüsselbund|Geheimwort|Pfefferminz|Hamburg|Roma|Mama|Geburtstag|morgen/i.test(roh), roh.slice(0, 300));
    check('7b jeder Eintrag hat genau die erlaubten Felder', P.sb.jvSchatten.protokoll().every(e => Object.keys(e).sort().join() === 'aktionen,faehigkeiten,kandidaten,laenge,nr,urteil,weg,zeit'));
    check('7c Längenklassen statt Länge: kurz/mittel/lang', P.sb.jvSchatten.protokoll().every(e => ['kurz', 'mittel', 'lang'].includes(e.laenge)));
    check('7d der Schatten schreibt NICHTS in den Speicher (weder Protokoll noch Zähler)', !Object.keys(P.store).some(k => /schatten|protokoll/i.test(k)), Object.keys(P.store).join());
    const kopieP = P.sb.jvSchatten.protokoll(); kopieP[0].urteil = 'MANIPULIERT'; kopieP.length = 0;
    check('7e protokoll() liefert Kopien: Änderungen von außen wirken nicht zurück', P.sb.jvSchatten.protokoll().length >= 1 && P.sb.jvSchatten.protokoll()[0].urteil !== 'MANIPULIERT');
    for (let i = 0; i < 80; i++) P.sb.jvSchatten.ki([{ type: 'chat' }], 'Satz ' + i, false);
    check('7f das Protokoll ist auf 50 Einträge begrenzt, die neuesten bleiben', P.sb.jvSchatten.protokoll().length === 50 && P.sb.jvSchatten.protokoll().slice(-1)[0].nr > 50);
    P.sb.jvSchatten.vergiss();
    check('7g vergiss() löscht Protokoll und Zähler', P.sb.jvSchatten.protokoll().length === 0 && JSON.stringify(P.sb.jvSchatten.zaehler()) === '{"eigeneFehler":0}');

    /* Fehler im Schatten dürfen die App nicht stören */
    const F = umgebung({ ki: () => ({ reply: 'Okay.', actions: [{ type: 'chat' }] }) }); F.sb.jvSchatten.an();
    F.sb.jvRegistry.beschreibe = function () { throw new Error('Registry kaputt'); }; F.sb.jvRegistry.namen = function () { throw new Error('Registry kaputt'); };
    const gF = await anfrage(F, 'Erinner mich morgen an Kaffee'); const gH = await anfrage(F, 'Hallo');
    check('8a Registry kaputt: Anfragen laufen trotzdem normal (Antwort kommt, feste Befehle gehen)', gF.length >= 1 && /Okay/.test(gF.join(' ')) && gH.length >= 1, JSON.stringify([gF, gH]));
    check('8b … und die Fehler werden nur gezählt', F.sb.jvSchatten.zaehler().eigeneFehler >= 1);
    const F2 = umgebung({ ki: () => ({ reply: 'Okay.', actions: [{ type: 'chat' }] }) }); delete F2.sb.jvRegistry; F2.sb.jvSchatten.an();
    const gF2 = await anfrage(F2, 'Erinner mich morgen an Kaffee');
    check('8c ganz ohne Registry: App läuft normal', /Okay/.test(gF2.join(' ')));
    const F3 = umgebung({ ki: () => ({ reply: 'Okay.', actions: [{ type: 'chat' }] }) }); F3.sb.jvSchatten.an(); F3.sb.Date = class extends Date { static now() { throw new Error('Uhr kaputt'); } };
    let wF3 = false; try { await anfrage(F3, 'Wie geht es dir'); } catch (e) { wF3 = true; }
    check('8d Zeitfehler im Schatten (Date.now wirft nur für den Sandkasten-Date): kein Absturz der Anfrage', !wF3);
    const F4 = umgebung({ ki: () => ({ reply: 'Okay.', actions: [{ type: 'chat' }] }) }); F4.sb.jvSchatten.an();
    const huelle = F4.sb.handleLocalCommand; let werfend = false;
    F4.sb.jvCommands.use('wirft', () => { throw new Error('Befehl kaputt'); }, 1);
    try { await anfrage(F4, 'Hallo'); } catch (e) { werfend = true; }
    check('8e wirft ein Befehl, verhält sich die Hülle wie das Original (kein zusätzlicher Absturz)', !werfend);
    check('8f die Hülle gibt Rückgabewert und Argumente unverändert durch', (() => { const A9 = umgebung(); const seen = []; A9.sb.handleLocalCommand = function (t, extra) { seen.push([t, extra]); return 'irgendwas'; }; A9.sb.jvSchatten.an(); const r = A9.sb.handleLocalCommand('Hallo', 42); return r === 'irgendwas' && seen[0][0] === 'Hallo' && seen[0][1] === 42; })());

    /* ================= Teil 4: verändert nichts ================= */
    const SZENARIEN = [
        ['Erinner mich morgen um acht an Kaffee kaufen', { reply: 'Okay, ich erinnere dich.', actions: [{ type: 'reminder', reminder_text: 'Kaffee kaufen', reminder_time: '2026-11-06T08:00:00' }] }],
        ['Trag morgen um zehn Zahnarzt ein', { reply: 'Eingetragen.', actions: [{ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: '2026-11-06T10:00:00' }] }],
        ['Merk dir Schlüssel im Auto', { reply: 'Gemerkt.', actions: [{ type: 'memory_store', memory_key: 'Schlüssel', memory_value: 'im Auto' }] }],
        ['Setz Milch auf die Einkaufsliste', { reply: 'Milch steht drauf.', actions: [{ type: 'shopping', shopping_items: ['Milch'] }] }],
        ['Erinner mich morgen an Kaffee', { reply: 'Ich habe die Erinnerung gespeichert.', actions: [{ type: 'chat' }] }],
        ['Buch mir ein Hotel in Rom', { reply: 'Ich habe das Hotel gebucht.', actions: [{ type: 'hotel_buchen' }] }],
        ['Hm', { reply: '', actions: [] }],
        ['Wie geht es dir heute', { reply: 'Gut, danke.', actions: [{ type: 'chat' }] }],
        ['Hallo', { reply: 'Hallo!', actions: [{ type: 'chat' }] }],
        ['Zeig mir die Nachrichten von heute', { reply: 'Hier die Nachrichten.', actions: [{ type: 'chat' }] }],
        ['Trag Zahnarzt ein', { reply: 'Okay.', actions: [{ todo: 'x', shopping_items: ['Milch'] }] }],
        ['Sag mir etwas', null]   // KI offline
    ];
    for (const [satz, kiA] of SZENARIEN) {
        const lauf = async (schatten) => {
            const X = umgebung({ ki: kiA ? () => kiA : null }); if (schatten) X.sb.jvSchatten.an();
            const gesagt = await anfrage(X, satz);
            return { gesagt: gesagt.join(' | '), zustand: zustand(X), netz: X.aufrufe.join(','), exec: X.zaehler.exec, karten: JSON.stringify(X.ereignisse.filter(e => e.art !== 'sprechen').map(e => e.text)).length };
        };
        const aus = await lauf(false), an = await lauf(true);
        check('9 identisch mit und ohne Schatten: "' + satz + '"', aus.gesagt === an.gesagt && aus.zustand === an.zustand && aus.netz === an.netz && aus.exec === an.exec && aus.karten === an.karten,
            JSON.stringify([aus.gesagt === an.gesagt, aus.zustand === an.zustand, aus.netz === an.netz, aus.exec === an.exec, aus.karten === an.karten]) + ' | ' + aus.gesagt + ' || ' + an.gesagt);
    }
    {
        const X = umgebung({ ki: () => ({ reply: 'Okay.', actions: [{ type: 'chat' }] }) }); X.sb.jvSchatten.an();
        const n0 = X.aufrufe.length; await anfrage(X, 'Erinner mich morgen an Kaffee'); const mit = X.aufrufe.length - n0;
        const Y = umgebung({ ki: () => ({ reply: 'Okay.', actions: [{ type: 'chat' }] }) }); const m0 = Y.aufrufe.length; await anfrage(Y, 'Erinner mich morgen an Kaffee'); const ohneS = Y.aufrufe.length - m0;
        check('10a der Schatten löst keinen einzigen zusätzlichen Netzaufruf und keine zweite KI-Anfrage aus', mit === ohneS && X.aufrufe.filter(u => /\/api\/groq/.test(u)).length === Y.aufrufe.filter(u => /\/api\/groq/.test(u)).length, mit + ' / ' + ohneS);
        check('10b … und führt keine zusätzliche Aktion aus', X.zaehler.exec === Y.zaehler.exec);
        const Z = umgebung(); Z.sb.jvSchatten.an(); const z0 = JSON.stringify(Z.store);
        for (const t of ['Erinner mich morgen', 'Hallo', 'Gibt es ein Restaurant in der Nähe', 'Merk dir x']) await A.lassLaufen(() => Z.sb.handleLocalCommand(t));
        check('10c reine Beobachtung (nur feste Befehle laufen lassen): der Schatten schreibt selbst nichts in den Speicher', Object.keys(Z.store).every(k => !/schatten|protokoll/i.test(k)));
    }

    /* Einbindung */
    const asst = lies('js/assistant.js');
    check('11a assistant.js ruft den Schatten nur lesend und abgesichert auf (try/catch, nur ki())', /try \{ if \(window\.jvSchatten && window\.jvSchatten\.ki\) window\.jvSchatten\.ki\(actions, text, !!opts\.nurLesen\); \} catch \(e\) \{ \}/.test(asst) && (asst.match(/jvSchatten/g) || []).length === 3);
    const andere = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && !/^(schatten|assistant|schatten_ansicht)\.js$/.test(f)).filter(f => /jvSchatten/.test(lies('js/' + f)));
    check('11b keine andere App-Datei kennt den Schatten (außer der Diagnoseansicht der Einstellungen, Phase 5)', andere.length === 0, andere.join());
    const arch = lies('ARCHITEKTUR.md'), karte = lies('LANDKARTE.md');
    check('11c Doku nennt den Schattenbetrieb und die Datei', /Schattenbetrieb/.test(arch) && /js\/schatten\.js/.test(arch) && /schatten\.js/.test(karte));

    console.log(`SCHATTEN: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABSTURZ', e && e.stack || e); process.exit(2); });
