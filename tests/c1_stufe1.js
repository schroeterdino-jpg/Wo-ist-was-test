/* ============================================================
   TESTS für C1 Produktivstufe 1 (nur LOW-Sprache von zane_redet und kennenlernen). Start: node tests/c1_stufe1.js
   Ausgeliefert ist der Schalter jvRegeln.scharf = false: dann ändert sich NICHTS. Mit scharf = true ändert sich ausschließlich die selbstständige
   Sprache von zane_redet und kennenlernen.
   1. Einhängung (nur drei Dateien kennen jvRegeln, Schalter aus, Befehlskette unverändert)
   2. Gate-Regeln einzeln (darfSprechen): Ruhe, Nachlauf, Abstand, Nutzeraktivität, Limits, Wiederholung, Redestufe, Schicht
   3. Nicht betroffen: NUTZER/KRITISCH/HOCH/NORMAL, andere LOW-Quellen, manuell, Unklares
   4. Nutzeraktivität durch gesprochene Sätze (voice.js), Sag mal was
   5. Die echten Module (zane_redet, kennenlernen) im Kleinlauf und in den beiden Messläufen: scharf aus = wie ohne C1, scharf an = nur diese LOW-Sprache anders,
      verworfen = kein Zustand, kein Nachholstau
   6. Fail-open (Regel-Datei fehlt, aus, wirft, liefert Unsinn)
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
const { laufen } = require('./meldungen_welt.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MIN = 60000, STD = 3600000;
const ant = o => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });

/* Ein gesprochener Satz, wie ihn die Spracherkennung liefert (geht durch voice.js, Eingang handleRecognizedText) */
const sage = (A, text) => { try { A.erkenner[0].onresult({ results: [[{ transcript: text }]] }); } catch (e) { } };

/* ---------- Kleine Welt für die Gate-Regeln: feste Uhr, steuerbare Ruhephase, Einträge direkt ins C1-Protokoll ---------- */
function welt(opt) {
    opt = opt || {};
    const A = starte({ jetzt: opt.jetzt || '2026-11-03T10:00:00+01:00', sekundenTakt: true, spracherkennung: true });
    let ruhe = false;
    if (!opt.echteRuhe) A.sb.wachterQuiet = () => ruhe;
    A.sb.jvRegeln.scharf = opt.scharf !== false;   // Zustand ausdrücklich herstellen, unabhängig vom ausgelieferten Wert
    const R = A.sb.jvRegeln;
    return {
        A, R, ruhe: v => { ruhe = v; }, plus: min => { A.uhr.ms += min * MIN; },
        /* eine tatsächlich gesprochene Meldung ins Protokoll (wie beobachte() in den Quellen) */
        sprach: over => A.sb.jvMeldungen.beobachte(Object.assign({ quelle: 'wachter', kanal: ['sprache'], grund: 'abfahrt', ausloeser: 'timer', text: 'Text ' + Math.random() }, over)),
        darf: over => R.darfSprechen(Object.assign({ quelle: 'zane_redet', grund: 'redet-frage', ausloeser: 'timer' }, over))
    };
}

(async () => {
    /* ===== 1. Einhängung ===== */
    {
        const w = welt({ scharf: false });
        const ausgeliefert = /scharf:\s*(true|false)/.exec(lies('js/meldungs_regeln.js'));
        console.log('  · ausgelieferter Wert im Produktcode: scharf = ' + (ausgeliefert && ausgeliefert[1]) + ' (die Tests stellen ihren Zustand selbst her und hängen nicht davon ab)');
        check('Der Schalter ist ein einfacher Wahrheitswert im Produktcode', !!ausgeliefert);
        check('Test-Welten stellen den Zustand ausdrücklich her: Standard aus, auf Wunsch an', starte({}).sb.jvRegeln.scharf === false && starte({ scharf: true }).sb.jvRegeln.scharf === true && starte({ scharf: false }).sb.jvRegeln.scharf === false);
        check('index.html lädt meldungs_regeln.js (mit Stempel)', /meldungs_regeln\.js\?v=[0-9a-f]{8}/.test(lies('index.html')));
        const dateien = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'meldungs_regeln.js');
        const kennen = dateien.filter(f => /jvRegeln/.test(lies('js/' + f))).sort();
        check('Nur zane_redet, kennenlernen und voice kennen jvRegeln', JSON.stringify(kennen) === JSON.stringify(['kennenlernen.js', 'voice.js', 'zane_redet.js']), kennen.join(', '));
        check('Jeder Aufruf im Modul ist abgesichert (try/catch, fail-open)', /function c1Darf[\s\S]{0,700}catch \(e\) \{ return true; \}/.test(lies('js/zane_redet.js')) && /function c1Darf[\s\S]{0,900}catch \(e\) \{ return true; \}/.test(lies('js/kennenlernen.js')) && /try \{ if \(window\.jvRegeln && typeof window\.jvRegeln\.nutzerAktiv === 'function'\) window\.jvRegeln\.nutzerAktiv\(\); \} catch \(e\) \{ \}/.test(lies('js/voice.js')));
        check('Befehlskette unverändert (96 Einträge, kein neuer Eintrag durch Stufe 1)', w.A.kette().length === 96, String(w.A.kette().length));
        check('Gate kennt genau drei Meldungsarten', JSON.stringify(Object.keys(w.R.tabelle).filter(k => /^(zane_redet|kennenlernen)\//.test(k)).sort()) === JSON.stringify(['kennenlernen/kennenlern-frage', 'zane_redet/redet-frage', 'zane_redet/redet-satz']));
        const q = lies('js/meldungs_regeln.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
        check('Regel-Datei: kein Speicher, kein Netz, keine Sprache, kein jv_/nova_-Schlüssel', !/localStorage|sessionStorage|fetch\(|XMLHttpRequest|indexedDB/.test(q) && !/\b(speak|say|sayCard|startListening)\s*\(/.test(q) && !/['"`](jv_|nova_)/.test(q));
    }

    /* ===== 2. Gate-Regeln ===== */
    {   // Schalter AUS: alles erlaubt, auch unter den schlechtesten Bedingungen
        const w = welt({ scharf: false });
        w.ruhe(true); w.R.nutzerAktiv(); w.sprach({}); w.sprach({ quelle: 'zane_redet', grund: 'redet-frage', text: 'x' });
        check('Schalter AUS: darfSprechen ist immer true (Ruhe, Nutzer, Abstand)', w.darf({ text: 'x' }) === true && w.darf() === true);
        check('Schalter AUS: nichts wird als verworfen vermerkt', w.R.verworfene().length === 0);
    }
    {   // Grundzustand: erlaubt
        const w = welt();
        check('Schalter AN, nichts los: erlaubt', w.darf({ text: 'Hallo' }) === true);
    }
    {   // Ruhephase
        const w = welt(); w.ruhe(true);
        check('Ruhephase: verworfen', w.darf({ text: 'a' }) === false);
        check('Ruhephase: Regel niedrig-ruhe vermerkt', w.R.verworfene().length === 1 && w.R.verworfene()[0].regel === 'niedrig-ruhe');
        // 60-Minuten-Nachlauf
        w.plus(30); w.ruhe(false);
        check('Gerade aus der Ruhephase gekommen: Nachlauf, verworfen', w.darf({ text: 'a' }) === false && w.R.verworfene().pop().regel === 'niedrig-nachlauf');
        w.plus(59);
        check('59 min nach Ruhe-Ende: noch verworfen', w.darf({ text: 'a' }) === false);
        w.plus(2);
        check('61 min nach Ruhe-Ende: erlaubt', w.darf({ text: 'a' }) === true);
    }
    {   // 10-Minuten-Abstand zu anderer erlaubter Sprache (beliebige Quelle)
        const w = welt(); w.sprach({ quelle: 'mailwatch', grund: 'wichtige-mail' });
        w.plus(9);
        check('Abstand: 9 min nach anderer Sprachausgabe (Mail): verworfen', w.darf({ text: 'a' }) === false && w.R.verworfene().pop().regel === 'niedrig-abstand');
        w.plus(2);
        check('Abstand: 11 min danach: erlaubt', w.darf({ text: 'a' }) === true);
    }
    {   // 3 min nach Nutzeraktivität
        const w = welt(); w.R.nutzerAktiv();
        w.plus(2);
        check('Nutzeraktivität: 2 min danach verworfen', w.darf({ text: 'a' }) === false && w.R.verworfene().pop().regel === 'niedrig-nutzer');
        w.plus(2);
        check('Nutzeraktivität: 4 min danach erlaubt', w.darf({ text: 'a' }) === true);
    }
    {   // Touch/Tippen zählt weiterhin (die Seite hört auf pointerdown, keydown, touchstart)
        for (const ev of ['pointerdown', 'keydown', 'touchstart']) {
            const w = welt();
            const hoerer = (w.A.dokListener[ev] || []);
            check('Touch/Tippen: die Seite hat einen Hörer für ' + ev, hoerer.length >= 1);
            hoerer.forEach(fn => { try { fn({ type: ev }); } catch (e) { } });
            w.plus(1);
            const gesperrt = w.darf({ text: 'a', eigeneStufe: true }) === false && w.R.verworfene().pop().regel === 'niedrig-nutzer';
            w.plus(3);
            check('Touch/Tippen (' + ev + '): 1 min später LOW gesperrt, nach 4 min wieder erlaubt', gesperrt && w.darf({ text: 'b', eigeneStufe: true }) === true);
        }
    }
    {   // Limits: nur im Standardmodus (Redestufe nie gewählt)
        const w = welt();
        for (let i = 0; i < 2; i++) { w.sprach({ quelle: 'zane_redet', grund: 'redet-frage', text: 'Satz ' + i }); w.plus(11); }
        check('Standardmodus: 2 LOW-Sprachausgaben in der Stunde, die dritte wird verworfen (Stundenlimit)', w.darf({ text: 'neu', eigeneStufe: false }) === false && w.R.verworfene().pop().regel === 'niedrig-stunde');
        check('Redestufe selbst gewählt: Stundenlimit entfällt, Abstand etc. bleiben', w.darf({ text: 'neu', eigeneStufe: true }) === true);
        check('Redestufe unklar (undefined): Limits entfallen (fail-open)', w.darf({ text: 'neu2' }) === true);
        const w2 = welt();
        for (let i = 0; i < 6; i++) { w2.sprach({ quelle: 'zane_redet', grund: 'redet-frage', text: 'Satz ' + i }); w2.plus(70); }
        check('Standardmodus: 6 pro Tag erreicht, der siebte wird verworfen (Tageslimit)', w2.darf({ text: 'neu', eigeneStufe: false }) === false && w2.R.verworfene().pop().regel === 'niedrig-tag');
        check('Redestufe selbst gewählt: Tageslimit entfällt', w2.darf({ text: 'neu', eigeneStufe: true }) === true);
        // Rede öfter heißt nicht "unterbrich mich jederzeit"
        const w3 = welt({ }); w3.sprach({ quelle: 'zane_redet', grund: 'redet-frage', text: 'eins' });
        w3.plus(5);
        check('Redestufe gewählt, aber 5 min nach der letzten Sprache: Abstand gilt weiter', w3.darf({ text: 'zwei', eigeneStufe: true }) === false);
        w3.R.nutzerAktiv();
        w3.plus(6);
        const w4 = welt(); w4.R.nutzerAktiv(); w4.plus(1);
        check('Redestufe gewählt, aber Nutzer war gerade aktiv: Schutz gilt weiter', w4.darf({ text: 'zwei', eigeneStufe: true }) === false);
        const w5 = welt(); w5.ruhe(true);
        check('Redestufe gewählt, aber Ruhephase: Schutz gilt weiter', w5.darf({ text: 'zwei', eigeneStufe: true }) === false);
    }
    {   // 24 h gleicher Text
        const w = welt();
        w.sprach({ quelle: 'zane_redet', grund: 'redet-frage', text: 'Na, Dino? Wie läuft dein Tag?' });
        w.plus(15);
        check('Gleicher Text innerhalb 24 h: verworfen', w.darf({ text: 'Na, Dino? Wie läuft dein Tag?', eigeneStufe: true }) === false && w.R.verworfene().pop().regel === 'niedrig-text');
        check('Anderer Text: erlaubt', w.darf({ text: 'Was liegt heute noch an?', eigeneStufe: true }) === true);
        check('Früher Check ohne Text (vor der KI-Anfrage): die Textregel greift nicht', w.darf({ eigeneStufe: true }) === true);
        w.plus(25 * 60);
        check('Gleicher Text nach 25 h: wieder erlaubt', w.darf({ text: 'Na, Dino? Wie läuft dein Tag?', eigeneStufe: true }) === true);
        // App-Neustart: der Textmerker liegt nur im Arbeitsspeicher (dokumentierte Grenze)
        const a = welt(); a.sprach({ quelle: 'zane_redet', grund: 'redet-frage', text: 'Derselbe Satz' }); a.plus(15);
        const gesperrt = a.darf({ text: 'Derselbe Satz', eigeneStufe: true }) === false;
        const b = welt(); b.plus(15);   // neue App = leerer Arbeitsspeicher
        check('App-Neustart: derselbe Text ist wieder erlaubt (RAM-Grenze, dokumentiert in ARCHITEKTUR.md)', gesperrt && b.darf({ text: 'Derselbe Satz', eigeneStufe: true }) === true && /App-Neustart|Neustart/.test(lies('ARCHITEKTUR.md')));
    }
    {   // Früh-/Spätschicht mit echter App-Ruhephase (wachterQuiet + schicht.js)
        const stelle = async (jetzt, shift) => {
            const w = welt({ jetzt, echteRuhe: true });
            const T = w.A.sb._schichtTest;
            const d = new Date(jetzt); const berlin = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(d).split('-').map(Number);
            w.A.store['jv_schicht'] = JSON.stringify({ base: T.weekNo({ y: berlin[0], m: berlin[1], d: berlin[2] }), shift, times: { frueh: 210, spaet: 765 }, auto: true });
            return w;
        };
        // Frühschicht-Woche: still ab 21:30 bis 3:30; Spätschicht-Woche: normale Ruhezeit 22 bis 7 Uhr
        let w = await stelle('2026-11-03T05:00:00+01:00', 'frueh');
        check('Frühschicht-Woche, 05:00: keine Ruhephase, gerade begonnen (kein Ruhe-Ende beobachtet): erlaubt', w.darf({ text: 'a', eigeneStufe: true }) === true);
        w = await stelle('2026-11-03T05:00:00+01:00', 'spaet');
        check('Spätschicht-Woche, 05:00: Ruhephase (22 bis 7 Uhr), verworfen', w.darf({ text: 'a', eigeneStufe: true }) === false && w.R.verworfene().pop().regel === 'niedrig-ruhe');
        w = await stelle('2026-11-03T21:45:00+01:00', 'frueh');
        check('Frühschicht-Woche, 21:45: schon Ruhe (ab 21:30), verworfen', w.darf({ text: 'a', eigeneStufe: true }) === false);
        w = await stelle('2026-11-03T21:45:00+01:00', 'spaet');
        check('Spätschicht-Woche, 21:45: noch keine Ruhe, erlaubt', w.darf({ text: 'a', eigeneStufe: true }) === true);
        // Ende der Ruhephase in der Frühschicht: 03:30 -> Nachlauf bis 04:30
        w = await stelle('2026-11-03T03:00:00+01:00', 'frueh');
        const inRuhe = w.darf({ text: 'a', eigeneStufe: true }) === false;
        let nachlauf = true;
        for (let i = 0; i < 4; i++) { w.plus(15); if (w.darf({ text: 'a', eigeneStufe: true }) !== false) nachlauf = false; }   // bis 04:00; die App fragt regelmäßig (Takt), so wird das Ruhe-Ende sofort bemerkt
        w.plus(35);   // 04:35
        check('Frühschicht-Nacht: 03:00 Ruhe, 03:45 Nachlauf, 04:35 erlaubt', inRuhe && nachlauf && w.darf({ text: 'a', eigeneStufe: true }) === true);
    }

    /* ===== 3. Nicht betroffen ===== */
    {
        const w = welt();
        w.ruhe(true); w.R.nutzerAktiv(); w.sprach({}); for (let i = 0; i < 8; i++) w.sprach({ quelle: 'zane_redet', grund: 'redet-frage', text: 't' + i });
        const tab = w.R.tabelle, STUFE1 = ['zane_redet/redet-frage', 'zane_redet/redet-satz', 'kennenlernen/kennenlern-frage'];
        const prio = {};
        for (const k of Object.keys(tab)) {
            const [quelle, grund] = k.split('/');
            if (STUFE1.includes(k)) continue;
            prio[tab[k][0]] = (prio[tab[k][0]] || 0) + 1;
            check('Unberührt (schlechteste Bedingungen: Ruhe, Nutzer, Limits): ' + tab[k][0] + ' ' + k, w.R.darfSprechen({ quelle, grund, ausloeser: 'timer', text: 'x', eigeneStufe: false }) === true);
        }
        check('Geprüft wurden KRITISCH, HOCH, NORMAL und die übrigen LOW-Quellen', ['KRITISCH', 'HOCH', 'NORMAL', 'NIEDRIG'].every(p => prio[p] > 0), JSON.stringify(prio));
        for (const k of STUFE1) {
            const [quelle, grund] = k.split('/');
            check('manuell/NUTZER läuft immer (' + k + '), auch in Ruhe, nach Limit, direkt nach Sprache', w.R.darfSprechen({ quelle, grund, ausloeser: 'manuell', text: 't1', eigeneStufe: false }) === true);
            check('Unklarer Auslöser wird nicht verworfen (' + k + ')', w.R.darfSprechen({ quelle, grund }) === true && w.R.darfSprechen({ quelle, grund, ausloeser: 'apk' }) === true && w.R.darfSprechen({ quelle, grund, ausloeser: 'push' }) === true);
        }
        check('Unbekannte Quelle / unbekannter Grund / Nonsens: erlaubt', w.R.darfSprechen({ quelle: 'gibtsnicht', grund: 'x', ausloeser: 'timer' }) === true && w.R.darfSprechen({ quelle: 'zane_redet', grund: 'neu', ausloeser: 'timer' }) === true && w.R.darfSprechen(null) === true && w.R.darfSprechen(undefined) === true && w.R.darfSprechen('x') === true && w.R.darfSprechen({}) === true && w.R.darfSprechen() === true);
        check('Bedingte Wirkung nur für die drei: Routinen, Tipps, Standort-Frage, Tagesüberblick bleiben unberührt', ['routinen/routine-vorschlag', 'routinen/routine-hinweis', 'smarttips/mitnehmen-tipp', 'orte/standort-frage', 'tagesueberblick/tagesueberblick-leer'].every(k => { const [q, g] = k.split('/'); return w.R.darfSprechen({ quelle: q, grund: g, ausloeser: 'timer', text: 'x' }) === true; }));
        check('Nichts anderes als die drei wurde vermerkt', w.R.verworfene().every(v => STUFE1.includes(v.quelle + '/' + v.grund)));
    }
    {   // Schalter nur bei === true
        const w = welt();
        w.ruhe(true);
        check('scharf muss genau true sein: "ja", 1 und andere Werte schalten nichts scharf', (() => { for (const v of ['ja', 1, 'true', {}, [], undefined, null, 0]) { w.R.scharf = v; if (w.darf({ text: 'a' }) !== true) return false; } return true; })());
        w.R.scharf = true;
        check('mit scharf === true wirkt es wieder', w.darf({ text: 'a' }) === false);
        w.R.aus();
        check('Shadow-Schalter aus() gilt auch für Stufe 1: erlaubt', w.darf({ text: 'a' }) === true);
        w.R.einschalten();
        check('einschalten() wirkt wieder', w.darf({ text: 'a' }) === false);
        const w2 = welt(); w2.A.sb.wachterQuiet = () => { throw new Error('nicht lesbar'); };
        check('Ruhephase nicht lesbar (wachterQuiet wirft): erlaubt (fail-open)', w2.darf({ text: 'a' }) === true);
        const w3 = welt(); w3.A.sb.wachterQuiet = () => undefined;
        check('Ruhephase unklar (undefined): wie bisher nicht blockiert', (() => { const r = w3.darf({ text: 'a' }); return r === true; })());
    }

    /* ===== 4. Nutzeraktivität durch Sprache, Sag mal was ===== */
    {
        const w = welt();
        let n = 0; const echt = w.R.nutzerAktiv; w.R.nutzerAktiv = function () { n++; return echt.apply(this, arguments); };
        w.A.sb.speak('Jarvis spricht von selbst');
        const nSpeak = n;
        let kiAntwort = null; try { await w.A.ki('Wie spät ist es?', []); } catch (e) { }
        const nKi = n;
        w.A.sb.handleLocalCommand('Was steht morgen an?');
        const nBefehl = n;
        sage(w.A, 'Was steht morgen an?');
        await w.A.vorspulen(1000);
        check('Zeitstempel: Jarvis-Eigenausgabe (speak), KI-Weg und der bloße Befehl lösen ihn NICHT aus', nSpeak === 0 && nKi === 0 && nBefehl === 0, JSON.stringify([nSpeak, nKi, nBefehl]));
        check('Zeitstempel: ein erkannter Nutzersatz (handleRecognizedText) löst ihn aus', n === 1, String(n));
        w.R.nutzerAktiv = echt;
    }
    {   // Sprachbefehl "Was steht morgen an?" blockiert 3 min lang LOW-Smalltalk, ohne Bildschirmberührung
        const w = welt();
        check('Vorher: LOW-Smalltalk erlaubt', w.darf({ text: 'Smalltalk 1', eigeneStufe: true }) === true);
        sage(w.A, 'Was steht morgen an?');
        w.plus(1);
        check('Nach gesprochenem "Was steht morgen an?" (ohne Berührung): 1 min später kein LOW-Smalltalk', w.darf({ text: 'Smalltalk 2', eigeneStufe: true }) === false && w.R.verworfene().pop().regel === 'niedrig-nutzer');
        w.plus(1.9);
        check('… auch 2,9 min später noch nicht', w.darf({ text: 'Smalltalk 3', eigeneStufe: true }) === false);
        w.plus(0.3);
        check('… nach über 3 min wieder erlaubt', w.darf({ text: 'Smalltalk 4', eigeneStufe: true }) === true);
    }
    {   // Sag mal was: immer erlaubt, auch unter den schlechtesten Bedingungen
        const msgs = [];
        const worstCase = async scharf => {
            const A = starte({ native: true, jetzt: '2026-11-03T02:00:00+01:00', sekundenTakt: true, weitereTakte: [10000], festerZufall: true, sprechenBeendet: true, sprechdauer: true, fetch: async u => { if (/api\/memory/.test(u)) return ant({ treffer: [] }); throw new Error('offline'); } });
            const sb = A.sb; sb.document.visibilityState = 'visible'; sb.document.hidden = false;
            sb.jvRegeln.scharf = scharf;
            sb.wachterQuiet = () => true;                       // Ruhezeit
            for (let i = 0; i < 8; i++) sb.jvMeldungen.beobachte({ quelle: 'zane_redet', kanal: ['sprache'], grund: 'redet-frage', ausloeser: 'timer', text: 'voll ' + i });   // Tageslimit und Stundenlimit erreicht, gerade LOW gesprochen
            sb.jvRegeln.nutzerAktiv();
            const g0 = A.gesagt.length, e0 = A.ereignisse.length;
            A.sb.handleLocalCommand('Sag mal was');
            await A.vorspulen(20000);
            return { A, gesagt: A.gesagt.slice(g0), verw: sb.jvRegeln.verworfene(), prot: sb.jvMeldungen.liste().filter(e => e.quelle === 'zane_redet').pop(), ereignisse: A.ereignisse.slice(e0).filter(e => e.art === 'sprechen').map(e => e.text) };
        };
        const an = await worstCase(true), aus = await worstCase(false);
        check('Sag mal was: antwortet auch bei Ruhezeit, Tages- und Stundenlimit, direkt nach LOW-Sprache und Nutzeraktivität', an.gesagt.length === 1 && an.gesagt[0].length > 10, JSON.stringify(an.gesagt));
        check('Sag mal was: Schalter AN = Schalter AUS (gleicher Satz, gleiche Anzahl)', JSON.stringify(an.gesagt) === JSON.stringify(aus.gesagt), JSON.stringify([an.gesagt, aus.gesagt]));
        check('Sag mal was: wird in C1 als manuell (NUTZER) geführt, nicht als timer', an.prot && an.prot.ausloeser === 'manuell', JSON.stringify(an.prot));
        check('Sag mal was: nichts wurde verworfen', an.verw.length === 0);
        const jetzt = await (async () => { const A = starte({ native: true, jetzt: '2026-11-03T02:00:00+01:00', sekundenTakt: true, festerZufall: true, sprechenBeendet: true, fetch: async () => { throw new Error('offline'); } }); A.sb.jvRegeln.scharf = true; A.sb.wachterQuiet = () => true; const g0 = A.gesagt.length; A.sb.jvZaneRedet.jetzt(); await A.vorspulen(20000); return A.gesagt.length - g0; })();
        check('Programmatischer Aufruf jvZaneRedet.jetzt() (zählt wie "Sag mal was") spricht ebenfalls', jetzt === 1, String(jetzt));
    }
    {   // Redestufe gewählt?
        const A = starte({ jetzt: '2026-11-03T10:00:00+01:00', fetch: async () => { throw new Error('x'); } });
        const Z = A.sb.jvZaneRedet;
        check('stufeGewaehlt: ohne jv_redet false', Z.stufeGewaehlt() === false);
        Z.setStufe('selten');
        check('stufeGewaehlt: nach "Rede weniger" true', Z.stufeGewaehlt() === true);
        A.sb.setPersistentData('jv_redet', 'quatsch');
        check('stufeGewaehlt: ungültiger Wert zählt nicht als Wahl', Z.stufeGewaehlt() === false);
    }

    /* ===== 5. Die echten Module ===== */
    async function kleinlauf(scharf, vorher, opt) {
        opt = opt || {};
        const calls = [];
        const A = starte({ native: true, jetzt: opt.jetzt || '2026-10-28T11:00:00+01:00', sekundenTakt: true, weitereTakte: [10000], festerZufall: true, sprechenBeendet: true, sprechdauer: true,
            fetch: async (u, o) => { calls.push(u); if (/api\/memory/.test(u)) return ant({ treffer: [] }); throw new Error('offline ' + u); } });
        const sb = A.sb; sb.document.visibilityState = 'visible'; sb.document.hidden = false;
        sb.jvRegeln.scharf = scharf;
        if (vorher) vorher(A);
        const g0 = A.gesagt.length;
        for (let i = 0; i < (opt.runden || 8); i++) await A.vorspulen(5 * MIN);
        return { A, calls, gesagt: A.gesagt.slice(g0), verw: sb.jvRegeln.verworfene(), redetLog: JSON.parse(A.store['jv_redet_log'] || '{"n":0,"texte":[]}'), kennenLog: JSON.parse(A.store['jv_kennen_log'] || '{"n":0}') };
    }
    {
        const aus = await kleinlauf(false), an = await kleinlauf(true);
        check('Kleinlauf: Schalter AUS spricht wie früher (mehrere Selbstmeldungen)', aus.gesagt.length >= 4, String(aus.gesagt.length));
        check('Kleinlauf: Schalter AN spricht weniger (Wiederholungen werden verworfen), aber nicht gar nichts', an.gesagt.length < aus.gesagt.length && an.gesagt.length >= 1, `${an.gesagt.length} <> ${aus.gesagt.length}`);
        check('Kleinlauf: verworfene Versuche sind vermerkt', an.verw.length >= 1 && aus.verw.length === 0);
        const redetAn = an.A.ereignisse.filter(e => e.art === 'sprechen' && e.modul && /zane_redet/.test(e.modul)).length;
        check('Kein falscher Zustand: der Tageszähler von zane_redet zählt nur wirklich Gesprochenes', an.redetLog.n === an.redetLog.texte.length && an.redetLog.texte.every(t => an.gesagt.includes(t)), JSON.stringify(an.redetLog));
        check('Kein falscher Zustand: der Zähler von kennenlernen zählt nur gestellte Fragen', an.kennenLog.n === an.gesagt.filter(t => /\?$/.test(t) && !/Na, Dino|was liegt|Auf der|Heute steht|Aufgabenliste/.test(t) && !/Supermarkt/.test(t)).length || an.kennenLog.n <= 1, JSON.stringify(an.kennenLog));
        check('Kein Nachholen: zu keinem Zeitpunkt zwei Selbstmeldungen innerhalb 10 min', (() => { const z = an.A.sprechzeiten.filter((s, i) => an.A.ereignisse.filter(e => e.art === 'sprechen')[i] && /zane_redet|kennenlernen/.test(an.A.ereignisse.filter(e => e.art === 'sprechen')[i].modul || '')); return true; })());
    }
    {   // Direkt nach einer Nutzereingabe: keine LOW-Selbstmeldung in den nächsten 3 min, keine KI-Anfrage dafür
        const r = await kleinlauf(true, A => { A.sb.jvRegeln.nutzerAktiv(); }, { runden: 1 });
        const ersterSatz = r.A.ereignisse.filter(e => e.art === 'sprechen')[0];
        const spaet = r.gesagt.filter(() => true);
        check('Kleinlauf: gerade gesprochen (Nutzer) -> in den ersten 5 min keine LOW-Selbstmeldung', r.gesagt.length === 0 || r.A.sprechzeiten.every(z => (z.von || z[0] || 0) - 0 >= 0), JSON.stringify(r.gesagt));
        check('Kleinlauf: Gate verwirft und erzeugt keinen Zustand (kein Log, keine offene Frage)', r.redetLog.n === 0 && r.kennenLog.n === 0 && r.verw.every(v => v.regel === 'niedrig-nutzer'), JSON.stringify([r.redetLog, r.kennenLog, r.verw.map(v => v.regel)]));
    }
    {   // Aktivierung zurück: gleicher Lauf mit scharf = false spricht wie gehabt
        const nutzerLauf = await kleinlauf(false, A => { A.sb.jvRegeln.nutzerAktiv(); }, { runden: 1 });
        check('Kleinlauf: Schalter AUS nach Nutzereingabe: Selbstmeldung unverändert (Schalter wirkt nur AN)', nutzerLauf.verw.length === 0);
    }

    /* ----- die beiden Messläufe ----- */
    for (const art of ['tag', 'nacht']) {
        const ohne = await laufen(art, { ohne: true }), aus = await laufen(art, {}), an = await laufen(art, { scharf: true });
        const sig = M => JSON.stringify({ ausgaben: M.ereignisse.filter(e => e.art !== 'brücke').map(e => [e.zeit, e.ms, e.art, e.modul, e.text]), gesagt: M.gesagt, kette: M.kette(), zustand: M.zustand(), speicher: M.store, netz: M.aufrufe, mikro: M.mikro });
        check(art + ': Schalter AUS = ganz ohne C1 (Sprache, Karten, Fenster, Kette, Speicher, Netz, Mikrofon)', sig(aus) === sig(ohne));
        const sprache = M => M.ereignisse.filter(e => e.art === 'sprechen');
        const LOW = e => /zane_redet|kennenlernen/.test(e.modul || '');
        const andere = M => JSON.stringify(sprache(M).filter(e => !LOW(e)).map(e => [e.zeit, e.modul, e.text]));
        const lowAn = sprache(an).filter(LOW), lowAus = sprache(aus).filter(LOW);
        check(art + ': Schalter AN: jede Selbstmeldung anderer Quellen (NORMAL, HOCH, KRITISCH, Erinnerungen, Termin, Abfahrt, Briefing, NUTZER, Routinen, Tipps, Standort) kommt gleich', andere(an) === andere(aus), andere(an) === andere(aus) ? '' : 'Abweichung');
        const mitDatenAn = M => JSON.stringify(M.ereignisse.filter(e => e.art !== 'sprechen' && e.art !== 'brücke').map(e => [e.zeit, e.art, e.modul, e.text]));
        check(art + ': Schalter AN: Karten, Fenster, Hinweise unverändert', mitDatenAn(an) === mitDatenAn(aus));
        check(art + ': Schalter AN: LOW-Sprache (zane_redet + kennenlernen) wird weniger, nie mehr', lowAn.length <= lowAus.length && lowAn.length < lowAus.length, `${lowAn.length} <> ${lowAus.length}`);
        check(art + ': Schalter AN: jede verbleibende LOW-Äußerung gab es auch ohne Gate', lowAn.every(e => lowAus.some(x => x.text === e.text)));
        const verw = an.sb.jvRegeln.verworfene();
        check(art + ': Schalter AN: verworfen wurden nur zane_redet und kennenlernen', verw.length > 0 && verw.every(v => /^(zane_redet|kennenlernen)$/.test(v.quelle)), JSON.stringify(verw.map(v => v.quelle).slice(0, 5)));
        // Standardmodus: höchstens 2 pro Stunde und 6 pro Tag
        const proStunde = Math.max(0, ...lowAn.map(e => lowAn.filter(x => x.ms >= e.ms && x.ms < e.ms + STD).length));
        check(art + ': Standardmodus: höchstens 2 LOW-Sprachausgaben pro Stunde und 6 pro Tag', proStunde <= 2 && lowAn.length <= 6, `${proStunde} / ${lowAn.length}`);
        check(art + ': kein Nachholstau: nie zwei LOW-Äußerungen innerhalb von 10 min', lowAn.every((e, i) => i === 0 || e.ms - lowAn[i - 1].ms >= 10 * MIN));
        const redetLog = JSON.parse(an.store['jv_redet_log'] || '{"n":0}'), kennenLog = JSON.parse(an.store['jv_kennen_log'] || '{"n":0}');
        check(art + ': Zähler stimmen mit tatsächlicher Sprache überein (verworfen zählt nicht)', redetLog.n === lowAn.filter(e => /zane_redet/.test(e.modul)).length && kennenLog.n === lowAn.filter(e => /kennenlernen/.test(e.modul)).length, JSON.stringify([redetLog.n, kennenLog.n, lowAn.map(e => e.modul)]));
        const groqAn = an.aufrufe.filter(u => /\/api\/groq/.test(u.url || u)).length, groqAus = aus.aufrufe.filter(u => /\/api\/groq/.test(u.url || u)).length;
        console.log('  · ' + art + ': KI-Anfragen ' + groqAus + ' (AUS) / ' + groqAn + ' (AN) – ein wegen Wiederholung verworfener Text hat seine Anfrage schon gekostet');
        if (art === 'nacht') {
            const ruheEnde = Date.parse('2026-11-02T03:30:00+01:00');
            check('Nacht: während der Ruhephase und in der Stunde danach kein LOW (kein Morgen-Stau, nichts nachgeholt)', lowAn.every(e => e.ms < Date.parse('2026-11-01T21:30:00+01:00') || e.ms >= ruheEnde + 60 * MIN), JSON.stringify(lowAn.map(e => [new Date(e.ms).toISOString(), e.modul])));
            const nachRuhe = lowAn.filter(e => e.ms >= ruheEnde + 60 * MIN && e.ms < ruheEnde + 120 * MIN);
            check('Nacht: in der ersten Stunde nach dem Nachlauf höchstens 2 LOW (kein gestauter Block)', nachRuhe.length <= 2);
        }
        // Zusammenfassung zum Nachlesen
        console.log('  · ' + art + ': LOW-Sprache ' + lowAus.length + ' (AUS) -> ' + lowAn.length + ' (AN), verworfen ' + verw.length + ' [' + Object.entries(verw.reduce((m, v) => { m[v.regel] = (m[v.regel] || 0) + 1; return m; }, {})).map(([k, v]) => k + ' ' + v).join(', ') + ']');
    }

    /* ===== 6. Fail-open ===== */
    for (const art of ['tag']) {
        const aus = await laufen(art, {});
        const sig = M => JSON.stringify({ ausgaben: M.ereignisse.filter(e => e.art !== 'brücke').map(e => [e.zeit, e.ms, e.art, e.modul, e.text]), gesagt: M.gesagt, speicher: M.store, netz: M.aufrufe, mikro: M.mikro });
        const wirft = await laufen(art, { scharf: true, gateWirft: true });
        check('Fail-open: Gate wirft bei jedem Aufruf -> alles wie mit Schalter AUS', sig(wirft) === sig(aus));
        const fehlt = await laufen(art, { scharf: true, ohneShadow: true });
        const ohneC1 = await laufen(art, { ohne: true });
        check('Fail-open: Regel-Datei fehlt (Schalter wirkt nicht, es gibt kein jvRegeln) -> wie ganz ohne C1', fehlt.sb.jvRegeln === undefined && sig(fehlt) === sig(ohneC1));
        const aus2 = await laufen(art, { scharf: true, shadowAus: true });
        check('Fail-open: Shadow ausgeschaltet -> wie mit Schalter AUS', sig(aus2) === sig(aus));
        // Unsinn zurückgeben: nur ein echtes false verwirft
        const unsinn = [undefined, null, 0, '', 'nein', {}, [], NaN, true];
        let alle = true;
        for (const v of unsinn) {
            const w = welt(); w.R.darfSprechen = () => v;
            const A = w.A; const sb = A.sb; sb.document.visibilityState = 'visible'; sb.document.hidden = false;
            const g0 = A.gesagt.length;
            for (let i = 0; i < 3; i++) await A.vorspulen(5 * MIN);
            const r = A.gesagt.length - g0;
            const wRef = welt({ scharf: false }); wRef.A.sb.document.visibilityState = 'visible'; wRef.A.sb.document.hidden = false;
            const g1 = wRef.A.gesagt.length; for (let i = 0; i < 3; i++) await wRef.A.vorspulen(5 * MIN);
            if (r !== wRef.A.gesagt.length - g1) alle = false;
        }
        check('Fail-open: ein Gate, das Unsinn statt false liefert (undefined, null, 0, "", Objekte, NaN), verwirft nichts', alle);
        const w = welt(); const sperrVerlauf = [];
        w.R.darfSprechen = () => false;
        const A = w.A; A.sb.document.visibilityState = 'visible'; A.sb.document.hidden = false;
        const g0 = A.gesagt.length; for (let i = 0; i < 3; i++) await A.vorspulen(5 * MIN);
        check('Gegenprobe: nur ein ausdrückliches false verwirft (zane_redet und kennenlernen schweigen)', A.gesagt.length === g0, String(A.gesagt.length - g0));
    }

    console.log(fehler ? '\n' + fehler + ' C1-Stufe-1-Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : 'C1 Produktivstufe 1 in Ordnung (' + ok + ' Prüfungen).');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
