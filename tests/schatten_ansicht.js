/* ============================================================
   TESTS Phase 5 Teil 2 "Diagnoseansicht Schattenbetrieb": Start: node tests/schatten_ansicht.js
   Die Ansicht zeigt nur tatsächlich beobachtete Anfragen. Das DOM der Einstellungen ist hier eine kleine Attrappe.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ant = d => ({ ok: true, status: 200, json: async () => d });

function knoten() {
    const k = { children: [], listeners: {}, style: {}, checked: false, disabled: false, open: false, _t: '' };
    Object.defineProperty(k, 'textContent', { get() { return k._t; }, set(v) { k._t = String(v); k.children = []; } });
    k.appendChild = c => { k.children.push(c); return c; };
    k.addEventListener = (t, fn) => { (k.listeners[t] = k.listeners[t] || []).push(fn); };
    k.feuer = t => (k.listeners[t] || []).forEach(f => f());
    return k;
}
function umgebung(opt) {
    opt = opt || {};
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, speicher: opt.speicher, fetch: async (u) => {
        if (/\/api\/groq/.test(u)) return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Okay.', actions: opt.aktionen || [{ type: 'chat' }] }) } }] });
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.dom = {}; ['schattenSchalter', 'schattenStatus', 'schattenZahlen', 'schattenListe', 'schattenAktualisieren', 'schattenLoeschen', 'schattenBox'].forEach(id => { A.dom[id] = knoten(); });
    A.sb.document.getElementById = id => A.dom[id] || null;
    const mk = A.sb.document.createElement; A.sb.document.createElement = function () { const n = knoten(); return n; };
    A.exec = 0; const e0 = A.sb.executeAction; A.sb.executeAction = function () { A.exec++; return e0.apply(this, arguments); };
    A.sb.jvSchattenAnsicht.starte();
    return A;
}
const zeilen = A => A.dom.schattenListe.children.map(c => c.textContent);
async function anfrage(A, text) {
    const l = await A.lassLaufen(() => A.sb.handleLocalCommand(text));
    if (!l.wert) await A.lassLaufen(() => A.sb.sendToGroqSmart(text));
    await new Promise(r => setImmediate(r));
}

(async () => {
    let A = umgebung();
    check('0a keine Ladefehler, Ansicht vorhanden', A.ladefehler.length === 0 && typeof A.sb.jvSchattenAnsicht === 'object', A.ladefehler.join(';'));
    check('1a Standard: AUS (Schalter aus, Status "AUS", nichts beobachtet)', A.sb.jvSchatten.istAn() === false && A.dom.schattenSchalter.checked === false && A.dom.schattenStatus.textContent === 'AUS' && /nichts beobachtet/.test(A.dom.schattenZahlen.textContent) && zeilen(A).length === 0, A.dom.schattenZahlen.textContent);
    await anfrage(A, 'Erinner mich morgen an Kaffee'); A.sb.jvSchattenAnsicht.zeichne();
    check('1b solange AUS: Anfragen erscheinen nicht (keine Beobachtung, keine Platzhalter)', zeilen(A).length === 0 && /nichts beobachtet/.test(A.dom.schattenZahlen.textContent) && A.sb.jvSchatten.protokoll().length === 0);
    const html = lies('index.html');
    check('1c index.html: Schalter hat kein "checked" (Standard aus), Abschnitt liegt in den Einstellungen', /id="schattenSchalter"[^>]*>/.test(html) && !/id="schattenSchalter"[^>]*checked/.test(html) && html.indexOf('id="schattenBox"') > html.indexOf('⚙️ Einstellungen') && html.indexOf('id="schattenBox"') < html.indexOf('VERBINDUNGEN</div>'));

    /* Einschalten */
    A.dom.schattenSchalter.checked = true; A.dom.schattenSchalter.feuer('change');
    check('2a Schalter ein -> Schatten EIN, Status "EIN", Merker gesetzt', A.sb.jvSchatten.istAn() === true && A.dom.schattenStatus.textContent === 'EIN' && A.store.jv_schatten === '1', JSON.stringify(A.store.jv_schatten));
    check('2b eingeschaltet, noch keine Anfrage: "Noch keine Anfrage beobachtet", Zähler 0', /Beobachtete Anfragen: 0/.test(A.dom.schattenZahlen.textContent) && zeilen(A).join() === 'Noch keine Anfrage beobachtet.');

    /* Echte Beobachtungen */
    const aktionen = [];
    A = umgebung({ aktionen: [{ type: 'chat' }] }); A.dom.schattenSchalter.checked = true; A.dom.schattenSchalter.feuer('change');
    const SAETZE = ['Hallo', 'Erinner mich morgen an Kaffee', 'Zeig mir die Nachrichten von heute', 'Wie geht es dir heute'];
    for (const s of SAETZE) await anfrage(A, s);
    A.sb.jvSchattenAnsicht.zeichne();
    const z = A.sb.jvSchatten.zusammenfassung();
    check('3a Anzahl = tatsächlich gestellte Anfragen (4)', z.beobachtet === 4 && /Beobachtete Anfragen: 4/.test(A.dom.schattenZahlen.textContent), A.dom.schattenZahlen.textContent);
    check('3b Zeilen = echte Protokolleinträge, neueste zuerst', zeilen(A).length === 4 && zeilen(A)[0].startsWith('#4 ') && zeilen(A)[3].startsWith('#1 '), zeilen(A).join(' | '));
    const roh = A.sb.jvSchatten.protokoll();
    check('3c Weg stimmt mit dem Protokoll überein: fester Befehl vs. KI', roh.every((e, i) => zeilen(A)[roh.length - 1 - i].includes(e.weg === 'ki' ? '· KI ·' : '· fester Befehl ·')) && roh.some(e => e.weg === 'ki') && roh.some(e => e.weg === 'lokal'), zeilen(A).join(' | '));
    check('3d vorgeschlagene Fähigkeit wird gezeigt (Erinnerung bei der Erinnerungs-Anfrage), "keine" wo nichts passt', zeilen(A).some(t => /vorgeschlagen: Erinnerung/.test(t)) && zeilen(A).some(t => /vorgeschlagen: keine/.test(t)));
    check('3e Abweichung wird erkannt und gezählt (Erinnerung vermutet, KI antwortete nur / fester Befehl statt Fähigkeit)', z.abweichungen >= 1 && /Abweichung/.test(zeilen(A).join('|')) && z.abweichungen === roh.filter(e => z.abweichungsUrteile.includes(e.urteil)).length, JSON.stringify(z.je));
    check('3f gleiche Entscheidungen werden gezählt', z.uebereinstimmung === roh.filter(e => e.urteil === 'uebereinstimmung').length);
    check('3g Zahlen stimmen: gleich + Abweichung + ohne Fähigkeit = beobachtet', z.uebereinstimmung + z.abweichungen + z.keineFaehigkeit === z.beobachtet);
    const anzeige = A.dom.schattenZahlen.textContent + '|' + zeilen(A).join('|');
    check('3h Datenschutz: kein einziges Wort der gesprochenen Sätze in der Anzeige', !/Kaffee|Nachrichten|Hallo|geht es dir|morgen/i.test(anzeige), anzeige);

    /* UI: Grenzen */
    for (let i = 0; i < 70; i++) A.sb.jvSchatten.ki([{ type: 'chat' }], 'Satz ' + i, false);
    A.sb.jvSchattenAnsicht.zeichne();
    check('4a die Liste zeigt höchstens 10 Zeilen, das Protokoll hat höchstens 50 Einträge', zeilen(A).length === 10 && A.sb.jvSchatten.protokoll().length === 50);
    check('4b die Zahl zählt alle Beobachtungen seit dem Einschalten/Löschen (74), nicht nur die 50 im Protokoll', A.sb.jvSchatten.zusammenfassung().beobachtet === 74 && /Beobachtete Anfragen: 74/.test(A.dom.schattenZahlen.textContent));

    /* Löschen */
    A.dom.schattenLoeschen.feuer('click');
    check('5a "Einträge löschen" leert Protokoll, Zähler und Anzeige', A.sb.jvSchatten.protokoll().length === 0 && A.sb.jvSchatten.zusammenfassung().beobachtet === 0 && /Beobachtete Anfragen: 0/.test(A.dom.schattenZahlen.textContent) && zeilen(A).join() === 'Noch keine Anfrage beobachtet.');
    check('5b … der Schalter bleibt dabei unverändert EIN', A.sb.jvSchatten.istAn() === true && A.dom.schattenStatus.textContent === 'EIN');
    await anfrage(A, 'Hallo'); A.dom.schattenAktualisieren.feuer('click');
    check('5c "Aktualisieren" zeigt neue echte Beobachtungen', zeilen(A).length === 1 && A.sb.jvSchatten.zusammenfassung().beobachtet === 1);

    /* Ausschalten */
    A.dom.schattenSchalter.checked = false; A.dom.schattenSchalter.feuer('change');
    check('6a Schalter aus -> Schatten AUS, Merker entfernt, Original wiederhergestellt', A.sb.jvSchatten.istAn() === false && !('jv_schatten' in A.store) && !A.sb.handleLocalCommand._jvSchatten && A.dom.schattenStatus.textContent === 'AUS');
    const vorher = A.sb.jvSchatten.zusammenfassung().beobachtet; await anfrage(A, 'Erinner mich morgen'); 
    check('6b nach dem Ausschalten wird nichts mehr beobachtet', A.sb.jvSchatten.zusammenfassung().beobachtet === vorher);

    /* Neustart mit gesetztem Merker */
    const R = umgebung({ speicher: { jv_schatten: '1' } });
    check('7a mit gesetztem Merker startet der Schatten EIN und die Ansicht zeigt EIN', R.sb.jvSchatten.istAn() === true && R.dom.schattenStatus.textContent === 'EIN' && R.dom.schattenSchalter.checked === true);
    check('7b ohne Merker bleibt er AUS (Standard)', umgebung().sb.jvSchatten.istAn() === false);

    /* Keine Nebenwirkungen */
    const lauf = async (ansicht) => {
        const X = umgebung({ aktionen: [{ type: 'reminder', reminder_text: 'Kaffee', reminder_time: '2026-11-06T08:00:00' }] }); X.sb.jvSchatten.an();
        for (const s of ['Erinner mich morgen an Kaffee', 'Hallo']) { await anfrage(X, s); if (ansicht) { X.sb.jvSchattenAnsicht.zeichne(); X.dom.schattenAktualisieren.feuer('click'); } }
        return JSON.stringify({ g: X.gesagt, s: Object.assign({}, X.store, { jv_schatten: undefined }), n: X.aufrufe.length, e: X.exec, r: X.lese('reminderEntries') });
    };
    check('8a das Anzeigen/Aktualisieren löst keine Aktion, keinen Netzaufruf, keine Sprachausgabe und keinen Speicherzugriff aus', await lauf(false) === await lauf(true));
    check('8b Schatten EIN ändert die Anfragen nicht (gleich wie AUS): Sprache, Speicher, Aufrufe, Aktionen', await (async () => {
        const f = async (an) => { const X = umgebung({ aktionen: [{ type: 'reminder', reminder_text: 'Kaffee', reminder_time: '2026-11-06T08:00:00' }] }); if (an) X.sb.jvSchatten.an(); for (const s of ['Erinner mich morgen an Kaffee', 'Hallo']) await anfrage(X, s); return JSON.stringify({ g: X.gesagt, s: X.store, n: X.aufrufe.length, e: X.exec }); };
        return await f(false) === await f(true);
    })());

    /* Fehlerfestigkeit */
    A = umgebung(); A.sb.jvSchatten.zusammenfassung = () => { throw new Error('kaputt'); };
    let w = false; try { A.sb.jvSchattenAnsicht.zeichne(); } catch (e) { w = true; }
    check('9a kaputte Zusammenfassung wirft nicht aus der Ansicht heraus, es erscheint eine ehrliche Meldung', !w && A.dom.schattenStatus.textContent === 'Fehler' && zeilen(A).length === 0);
    A = umgebung(); A.sb.jvSchatten = undefined; try { A.sb.window.jvSchatten = undefined; } catch (e) { } w = false; try { A.sb.jvSchattenAnsicht.zeichne(); A.sb.jvSchattenAnsicht.schalten(true); A.sb.jvSchattenAnsicht.loeschen(); } catch (e) { w = true; }
    check('9b ohne jvSchatten: kein Absturz, Anzeige "nicht verfügbar"', !w && A.dom.schattenStatus.textContent === 'nicht verfügbar' && A.dom.schattenSchalter.disabled === true);
    A = umgebung(); A.sb.document.getElementById = () => null; w = false; try { A.sb.jvSchattenAnsicht.zeichne(); A.sb.jvSchattenAnsicht.starte(); } catch (e) { w = true; }
    check('9c ohne die Elemente in der Seite: kein Absturz', !w);

    /* Statisch */
    const code = lies('js/schatten_ansicht.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check('10a Ansicht: kein Netz, keine Sätze speichern, kein innerHTML, keine KI, keine Aktionen, keine Sprache', !/fetch\(|apiFetch|innerHTML|outerHTML|insertAdjacentHTML|eval\(|executeAction|sendToGroqSmart|speak\(|speakAck|setTimeout|setInterval|memoryItems|sendBeacon/.test(code), (code.match(/fetch\(|innerHTML|executeAction|speak\(|setTimeout/) || [])[0]);
    check('10b Ansicht schreibt nur den Merker jv_schatten', (code.match(/setItem\(([^,)]+)/g) || []).every(x => /'jv_schatten'/.test(x)) && (code.match(/removeItem\(([^)]+)/g) || []).every(x => /'jv_schatten'/.test(x)));
    check('10c Ansicht nutzt nur zusammenfassung/an/aus/vergiss von jvSchatten', (code.match(/S\.\w+/g) || []).every(x => /^S\.(zusammenfassung|an|aus|vergiss)$/.test(x)), (code.match(/S\.\w+/g) || []).join());
    const sc = lies('js/schatten.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    check('10d schatten.js bleibt rein (zusammenfassung eingerechnet): kein Netz, kein Speichern, keine Sprache, keine Zeitgeber', !/fetch\(|apiFetch|setPersistentData|setItem|removeItem|speak\(|setTimeout|setInterval|executeAction|sendToGroqSmart|document\./.test(sc));

    console.log(`SCHATTEN_ANSICHT: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABSTURZ', e && e.stack || e); process.exit(2); });
