/* ============================================================
   TESTS für B3: Teilfehler sauber sagen. Start: node tests/antwort.js
   Teil 1: die reine Funktion js/antwort_bau.js (Antwort aus Erfolgen, Fehlern, Hinweisen, Sonderergebnissen, Ausfällen)
   Teil 2: js/mitdenken.js meldet Ausfälle von Wetter/Fahrzeit nur, wenn die Prüfung wirklich gestartet wurde (Fehler und Timeout)
   Teil 3: Integration über den echten Weg js/assistant.js (sendToGroqSmart) mit Attrappen-KI und Attrappen-Netz
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const gleich = (name, ist, soll) => check(name, ist === soll, 'ist:  ' + JSON.stringify(ist) + '\n      soll: ' + JSON.stringify(soll));

const W = 'Wetter konnte ich gerade nicht laden.', F = 'Fahrzeit konnte ich gerade nicht ermitteln.';

(async () => {
    /* ---------- Teil 1: reine Funktion ---------- */
    const sb0 = { window: {} }; vm.createContext(sb0);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/antwort_bau.js'), 'utf8'), sb0);
    const baue = e => sb0.window.jvAntwort.baue(e);
    check('antwort_bau.js: keine Seiteneffekte außer window.jvAntwort', Object.keys(sb0.window).join() === 'jvAntwort');
    const quelle = fs.readFileSync(path.join(ROOT, 'js/antwort_bau.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    check('antwort_bau.js: kein Speicher, kein Netz, keine Sprachausgabe', !/localStorage|sessionStorage|fetch\(|speak\(|executeAction|document\.|ZaneNative/.test(quelle));

    gleich('nur Erfolg: Text bleibt wie er ist', baue({ basis: 'Alles klar, Zahnarzt morgen um 15 Uhr.', erfolge: ['calendar'], okAnzahl: 1 }), 'Alles klar, Zahnarzt morgen um 15 Uhr.');
    gleich('nur Erfolg, nichts übergeben: leer', baue({}), '');
    gleich('Erfolg + Hinweis: Hinweis wird angehängt (wie bisher)', baue({ basis: 'Eingetragen.', erfolge: ['calendar'], okAnzahl: 1, hinweise: ['Der Termin ist nur in der App gespeichert.'] }), 'Eingetragen. Der Termin ist nur in der App gespeichert.');
    gleich('mehrere Hinweise: Reihenfolge bleibt, doppelte fallen weg', baue({ basis: 'Ok.', hinweise: ['Hinweis A.', 'Hinweis B.', 'Hinweis A.'] }), 'Ok. Hinweis A. Hinweis B.');
    gleich('nur Fehler: nur die Fehlermeldung', baue({ basis: 'Erledigt.', fehler: ['Das konnte ich nicht speichern.'], okAnzahl: 0 }), 'Das konnte ich nicht speichern.');
    gleich('nur Fehler (zwei): beide, Reihenfolge stabil', baue({ basis: 'x', fehler: ['Eins ging nicht.', 'Zwei ging nicht.'] }), 'Eins ging nicht. Zwei ging nicht.');
    gleich('Erfolg + Fehler: benennt, was geklappt hat, und was nicht', baue({ basis: 'Alles erledigt!', erfolge: ['calendar'], okAnzahl: 1, fehler: ['Die Erinnerung konnte ich nicht anlegen.'] }), 'Termin gespeichert. Die Erinnerung konnte ich nicht anlegen.');
    gleich('mehrere Erfolge + ein Fehler', baue({ basis: 'x', erfolge: ['calendar', 'shopping', 'reminder'], okAnzahl: 3, fehler: ['Das Telefonat konnte ich nicht starten.'] }), 'Termin gespeichert. Einkaufsliste ergänzt. Erinnerung gespeichert. Das Telefonat konnte ich nicht starten.');
    gleich('zwei gleiche Erfolge: Mehrzahl, nicht doppelt', baue({ basis: 'x', erfolge: ['calendar', 'calendar'], okAnzahl: 2, fehler: ['Fehler.'] }), 'Termine gespeichert. Fehler.');
    gleich('Erfolg + Fehler: Hinweis des erfolgreichen Teils bleibt erhalten', baue({ basis: 'x', erfolge: ['calendar'], okAnzahl: 1, fehler: ['Die Erinnerung ging nicht.'], hinweise: ['Wie viele Stunden vorher soll ich dich per Push erinnern?'] }), 'Termin gespeichert. Die Erinnerung ging nicht. Wie viele Stunden vorher soll ich dich per Push erinnern?');
    gleich('Erfolg ohne eigenen Satz + Fehler: alter Wortlaut', baue({ basis: 'x', erfolge: ['chat'], okAnzahl: 1, fehler: ['Das ging nicht.'] }), 'Das meiste ist erledigt, aber: Das ging nicht.');
    gleich('Löschen wird nicht als "gelöscht" gemeldet (kann nur eine Rückfrage sein)', baue({ basis: 'x', erfolge: ['calendar_delete'], okAnzahl: 1, fehler: ['Das ging nicht.'] }), 'Das meiste ist erledigt, aber: Das ging nicht.');
    gleich('Sonderergebnis + Fehler: Ergebnis bleibt vorn', baue({ basis: 'Route.', sonder: [{ ok: true, text: 'Du musst um 8 Uhr los.' }], fehler: ['Die Erinnerung ging nicht.'], okAnzahl: 0 }), 'Du musst um 8 Uhr los. Die Erinnerung ging nicht.');
    gleich('mehrere Sonderergebnisse: keines geht verloren', baue({ basis: 'Du musst um 8 Uhr los.', sonder: [{ ok: true, text: 'Du musst um 8 Uhr los.' }, { ok: true, text: 'Der Zug fährt um 9 Uhr.' }] }), 'Du musst um 8 Uhr los. Der Zug fährt um 9 Uhr.');
    gleich('ein Sonderergebnis: genau wie bisher', baue({ basis: 'Du musst um 8 Uhr los.', sonder: [{ ok: true, text: 'Du musst um 8 Uhr los.' }] }), 'Du musst um 8 Uhr los.');
    gleich('mehrere Sonderergebnisse + Hinweis', baue({ basis: 'A.', sonder: [{ ok: true, text: 'A.' }, { ok: true, text: 'B.' }], hinweise: ['H.'] }), 'A. B. H.');
    gleich('Sonderergebnis ok + Sonderergebnis fehlgeschlagen: beides, Erfolg zuerst', baue({ basis: 'A.', sonder: [{ ok: false, text: 'Die Bahn-Daten fehlen gerade.' }, { ok: true, text: 'A.' }] }), 'A. Die Bahn-Daten fehlen gerade.');
    gleich('nur Sonderfehler: wie bisher nur die Meldung', baue({ basis: 'Die Fahrzeit konnte gerade nicht berechnet werden.', sonder: [{ ok: false, text: 'Die Fahrzeit konnte gerade nicht berechnet werden.' }], okAnzahl: 1 }), 'Die Fahrzeit konnte gerade nicht berechnet werden.');
    gleich('Wetter-Ausfall: Termin ok + Satz', baue({ basis: 'Termin gespeichert.', erfolge: ['calendar'], okAnzahl: 1, ausfaelle: [{ art: 'wetter', grund: 'fehler' }] }), 'Termin gespeichert. ' + W);
    gleich('Fahrzeit-Ausfall', baue({ basis: 'Termin gespeichert.', erfolge: ['calendar'], okAnzahl: 1, ausfaelle: [{ art: 'fahrzeit', grund: 'fehler' }] }), 'Termin gespeichert. ' + F);
    gleich('Timeout zählt wie Ausfall', baue({ basis: 'Termin gespeichert.', ausfaelle: [{ art: 'wetter', grund: 'timeout' }] }), 'Termin gespeichert. ' + W);
    gleich('Wetter + Fahrzeit beide ausgefallen: feste Reihenfolge (Wetter zuerst) egal wie geliefert', baue({ basis: 'Termin gespeichert.', ausfaelle: [{ art: 'fahrzeit', grund: 'fehler' }, { art: 'wetter', grund: 'timeout' }] }), 'Termin gespeichert. ' + W + ' ' + F);
    gleich('Ausfall doppelt gemeldet: nur einmal genannt', baue({ basis: 'Termin gespeichert.', ausfaelle: [{ art: 'wetter', grund: 'fehler' }, { art: 'wetter', grund: 'timeout' }] }), 'Termin gespeichert. ' + W);
    gleich('Wetter ok, Fahrzeit ausgefallen: nur Fahrzeit genannt', baue({ basis: 'Termin gespeichert.', ausfaelle: [{ art: 'fahrzeit', grund: 'fehler' }], hinweise: ['Es regnet am Dienstag.'] }), 'Termin gespeichert. ' + F + ' Es regnet am Dienstag.');
    gleich('Fahrzeit ok (Hinweis), Wetter ausgefallen: Wetter genannt, Fahrzeit-Hinweis bleibt', baue({ basis: 'Termin gespeichert.', ausfaelle: [{ art: 'wetter', grund: 'fehler' }], hinweise: ['Von A nach B brauchst du 40 Minuten.'] }), 'Termin gespeichert. ' + W + ' Von A nach B brauchst du 40 Minuten.');
    gleich('Prüfung nicht erforderlich (kein Ausfall übergeben): keine Ausfallmeldung', baue({ basis: 'Termin gespeichert.', erfolge: ['calendar'], okAnzahl: 1, ausfaelle: [] }), 'Termin gespeichert.');
    gleich('unbekannte Ausfall-Art wird ignoriert', baue({ basis: 'Ok.', ausfaelle: [{ art: 'strom', grund: 'fehler' }] }), 'Ok.');
    gleich('Ausfall + Fehler anderer Aktion: alles konkret, Reihenfolge Fehler dann Ausfall', baue({ basis: 'x', erfolge: ['calendar'], okAnzahl: 1, fehler: ['Die Erinnerung ging nicht.'], ausfaelle: [{ art: 'wetter', grund: 'fehler' }, { art: 'fahrzeit', grund: 'fehler' }] }), 'Termin gespeichert. Die Erinnerung ging nicht. ' + W + ' ' + F);
    gleich('keine doppelten Aussagen (gleicher Fehler zweimal)', baue({ basis: 'x', erfolge: ['reminder'], okAnzahl: 1, fehler: ['Das ging nicht.', 'Das ging nicht.'] }), 'Erinnerung gespeichert. Das ging nicht.');
    gleich('keine doppelten Aussagen (Groß/Klein, Leerzeichen)', baue({ basis: 'Ok.', hinweise: ['ok.', 'OK.', ' ok. '] }), 'Ok.');
    const kompl = { basis: 'x', sonder: [{ ok: true, text: 'S1.' }, { ok: true, text: 'S2.' }], erfolge: ['todo', 'calendar'], okAnzahl: 2, fehler: ['Fehler 1.'], hinweise: ['Hinweis 1.'], ausfaelle: [{ art: 'fahrzeit', grund: 'fehler' }, { art: 'wetter', grund: 'fehler' }] };
    gleich('Reihenfolge stabil (Ergebnisse, Erfolge, Fehler, Ausfälle, Hinweise)', baue(kompl), 'S1. S2. Aufgabe gespeichert. Termin gespeichert. Fehler 1. ' + W + ' ' + F + ' Hinweis 1.');
    gleich('gleiche Eingabe = gleiche Antwort', baue(kompl), baue(JSON.parse(JSON.stringify(kompl))));
    check('Eingabe wird nicht verändert', (() => { const e = JSON.parse(JSON.stringify(kompl)); baue(e); return JSON.stringify(e) === JSON.stringify(kompl); })());
    check('keine Technik-Texte in der Ausgabe', !/fetch|HTTP|Abort|Error|undefined|null/.test(baue({ basis: 'x', fehler: ['Das ging nicht.'], ausfaelle: [{ art: 'wetter', grund: 'timeout' }, { art: 'fahrzeit', grund: 'fehler' }] })));

    /* ---------- Teil 2: mitdenken.js meldet Ausfälle ---------- */
    const JETZT = '2026-10-28T10:00:00+01:00', MORGEN_10 = '2026-10-29T10:00:00+01:00';
    const forecast = { daily: { time: ['2026-10-28', '2026-10-29', '2026-10-30'], precipitation_probability_max: [10, 10, 10], precipitation_sum: [0, 0, 0], wind_gusts_10m_max: [10, 10, 10] } };
    const ant = d => ({ ok: true, status: 200, json: async () => d });
    async function mitdenken(opt) {   // opt: wetter 'ok'|'fehler'|'leer'|'haengt', route 'ok'|'fehler'|'haengt', geocode 'ok'|'langsam'|'null'; text, ort, iso, vorher: Einträge
        const A = starte({ jetzt: JETZT, festerZufall: true, fetch: async (u) => {
            if (/open-meteo/.test(u)) { if (opt.wetter === 'fehler') throw new Error('fetch failed'); if (opt.wetter === 'leer') return ant({ error: true, reason: 'HTTP 500' }); if (opt.wetter === 'haengt') return new Promise(() => { }); return ant(forecast); }
            if (/\/api\/route/.test(u)) { if (opt.route === 'fehler') throw new Error('HTTP 500'); if (opt.route === 'haengt') return new Promise(() => { }); return ant({ routes: [{ duration: 3600 }] }); }
            throw new Error('offline ' + u);
        } });
        const g = opt.geocode || 'ok';
        A.sb.__geo = g; A.sb.__setTimeout = A.sb.setTimeout;
        A.setze('wxGeocode', async () => g === 'null' ? null : g === 'langsam' ? await new Promise(r => A.sb.setTimeout(() => r({ lat: 53.5, lon: 10 }), 5000)) : { lat: 53.5, lon: 10 });
        (opt.vorher || []).forEach(e => A.lese('calendarEntries').push(e));
        A.sb.jvMdAusfall = [];
        const r = await A.lassLaufen(() => A.sb.thoughtsForNewEvent(opt.text || 'Wandern im Wald', opt.iso || MORGEN_10, opt.ort === undefined ? 'Hamburg' : opt.ort));
        const aus = A.sb.jvMdAusfall.map(x => x.art + ':' + x.grund).sort().join(',');
        return { aus, haengt: !!r.haengt, notizen: r.wert };
    }
    const nachbar = [{ text: 'Zahnarzt', isoDate: '2026-10-29T08:30:00+01:00', location: 'Bergedorf' }];
    let m;
    m = await mitdenken({}); gleich('mitdenken: alles ok → kein Ausfall', m.aus, '');
    m = await mitdenken({ wetter: 'fehler' }); gleich('mitdenken: Wetterdienst scheitert (Termin draußen) → Wetter-Ausfall', m.aus, 'wetter:fehler');
    m = await mitdenken({ wetter: 'leer' }); gleich('mitdenken: Wetterdienst liefert Fehlerantwort ohne Vorhersage → Wetter-Ausfall', m.aus, 'wetter:fehler');
    m = await mitdenken({ wetter: 'haengt' }); check('mitdenken: Wetterdienst hängt → Wetter-Ausfall (Fehler nach 6,5 s oder Timeout)', /^wetter:(fehler|timeout)$/.test(m.aus), m.aus);
    m = await mitdenken({ wetter: 'fehler', text: 'Zahnarzt', ort: 'Hamburg' }); gleich('mitdenken: Termin nicht draußen → Wetter war nicht nötig → keine Meldung', m.aus, '');
    m = await mitdenken({ wetter: 'fehler', iso: '2026-11-20T10:00:00+01:00' }); gleich('mitdenken: Termin zu weit weg (kein Wetter-Check) → keine Meldung', m.aus, '');
    m = await mitdenken({ wetter: 'fehler', iso: '2026-10-29' }); gleich('mitdenken: ganztägiger Termin (kein Wetter-Check) → keine Meldung', m.aus, '');
    m = await mitdenken({ text: 'Zahnarzt', route: 'fehler', vorher: nachbar }); gleich('mitdenken: Fahrzeit nötig (Termin davor mit Ort) und Routendienst scheitert → Fahrzeit-Ausfall', m.aus, 'fahrzeit:fehler');
    m = await mitdenken({ text: 'Zahnarzt', geocode: 'null', vorher: nachbar }); gleich('mitdenken: Adresse nicht auffindbar → Fahrzeit-Ausfall', m.aus, 'fahrzeit:fehler');
    m = await mitdenken({ text: 'Zahnarzt', route: 'haengt', geocode: 'langsam', vorher: nachbar }); gleich('mitdenken: Fahrzeit dauert über die Zeitgrenze → Timeout zählt als Ausfall', m.aus, 'fahrzeit:timeout');
    m = await mitdenken({ text: 'Zahnarzt', route: 'fehler' }); gleich('mitdenken: kein Termin davor/danach → Fahrzeit nicht nötig → keine Meldung', m.aus, '');
    m = await mitdenken({ text: 'Zahnarzt', route: 'fehler', ort: '', vorher: nachbar }); gleich('mitdenken: Termin ohne Ort → Fahrzeit nicht nötig → keine Meldung', m.aus, '');
    m = await mitdenken({ text: 'Zahnarzt', route: 'fehler', vorher: [{ text: 'Zahnarzt', isoDate: '2026-10-29T05:00:00+01:00', location: 'Bergedorf' }] }); gleich('mitdenken: Lücke über 150 Minuten → Fahrzeit nicht nötig → keine Meldung', m.aus, '');
    m = await mitdenken({ wetter: 'fehler', route: 'fehler', vorher: nachbar }); gleich('mitdenken: Wetter und Fahrzeit beide ausgefallen', m.aus, 'fahrzeit:fehler,wetter:fehler');
    m = await mitdenken({ wetter: 'fehler', vorher: nachbar }); gleich('mitdenken: Wetter ausgefallen, Fahrzeit ok', m.aus, 'wetter:fehler');
    m = await mitdenken({ route: 'fehler', vorher: nachbar }); gleich('mitdenken: Wetter ok, Fahrzeit ausgefallen', m.aus, 'fahrzeit:fehler');
    {   /* ohne Sammelliste (zum Beispiel Mail-Beobachter) passiert nichts */
        const A = starte({ jetzt: JETZT, festerZufall: true, fetch: async () => { throw new Error('x'); } });
        A.setze('wxGeocode', async () => ({ lat: 1, lon: 1 }));
        const r = await A.lassLaufen(() => A.sb.thoughtsForNewEvent('Wandern', MORGEN_10, 'Hamburg'));
        check('mitdenken: ohne Sammelliste läuft alles wie vorher (kein Fehler, Liste bleibt leer)', !r.haengt && Array.isArray(r.wert) && !A.sb.jvMdAusfall);
    }

    /* ---------- Teil 3: Integration über assistant.js ---------- */
    async function lauf(satz, aktionen, reply, o) {
        o = o || {};
        const A = starte({ jetzt: JETZT, festerZufall: true, fetch: async (u, opts) => {
            if (/\/api\/groq/.test(u)) return ant({ choices: [{ message: { content: JSON.stringify({ reply, actions: aktionen }) } }] });
            if (/open-meteo/.test(u)) { if (o.wetter === 'fehler') throw new Error('fetch failed'); return ant(forecast); }
            if (/\/api\/route/.test(u)) { if (o.route === 'fehler') throw new Error('HTTP 500'); return ant({ routes: [{ duration: 3600 }] }); }
            throw new Error('offline ' + u);
        } });
        A.setze('wxGeocode', async () => ({ lat: 53.5, lon: 10 }));
        (o.vorher || []).forEach(e => A.lese('calendarEntries').push(e));
        if (o.vorbereiten) o.vorbereiten(A);
        const g0 = A.gesagt.length;
        const r = await A.lassLaufen(() => A.sb.sendToGroqSmart(satz));
        await new Promise(res => setImmediate(res));
        return { gesagt: A.gesagt.slice(g0).join(' | '), haengt: !!r.haengt, A };
    }
    const kal = (t, ort) => ({ type: 'calendar', calendar_text: t, calendar_time: MORGEN_10, calendar_location: ort });
    let r;
    r = await lauf('Trag morgen um 10 Uhr Zahnarzt in Hamburg ein', [kal('Zahnarzt', 'Hamburg')], 'Zahnarzt morgen um 10 Uhr ist eingetragen.');
    check('Integration: alles klappt (kein Draußen-Termin) → Antwort der KI unverändert und nicht länger', !r.haengt && /Zahnarzt morgen um 10 Uhr ist eingetragen\./.test(r.gesagt) && !/konnte ich/.test(r.gesagt), r.gesagt);
    r = await lauf('Trag morgen um 10 Uhr Wandern im Wald in Hamburg ein', [kal('Wandern im Wald', 'Hamburg')], 'Wandern morgen um 10 Uhr ist eingetragen.', { wetter: 'fehler' });
    check('Integration: Termin ok + Wetter fällt aus → "Wetter konnte ich gerade nicht laden." und Termin-Satz bleibt', !r.haengt && /eingetragen\./.test(r.gesagt) && r.gesagt.includes(W) && !r.gesagt.includes(F), r.gesagt);
    r = await lauf('Trag morgen um 10 Uhr Wandern im Wald in Hamburg ein', [kal('Wandern im Wald', 'Hamburg')], 'Wandern morgen um 10 Uhr ist eingetragen.', { wetter: 'fehler', route: 'fehler', vorher: nachbar });
    check('Integration: Wetter und Fahrzeit fallen aus → beide Sätze, ein Mal, feste Reihenfolge', !r.haengt && r.gesagt.indexOf(W) > 0 && r.gesagt.indexOf(F) > r.gesagt.indexOf(W) && r.gesagt.split(W).length === 2 && r.gesagt.split(F).length === 2, r.gesagt);
    r = await lauf('Trag morgen um 10 Uhr Wandern im Wald in Hamburg ein', [kal('Wandern im Wald', 'Hamburg')], 'Wandern morgen um 10 Uhr ist eingetragen.', { route: 'fehler', vorher: nachbar });
    check('Integration: nur Fahrzeit fällt aus, Wetter ok → nur Fahrzeit genannt', /Fahrzeit konnte ich/.test(r.gesagt) && !r.gesagt.includes(W), r.gesagt);
    r = await lauf('Trag morgen um 10 Uhr Wandern im Wald in Hamburg ein', [kal('Wandern im Wald', 'Hamburg')], 'Wandern morgen um 10 Uhr ist eingetragen.', { wetter: 'fehler', route: 'fehler' });
    check('Integration: Fahrzeit nicht nötig (kein Nachbartermin) → nur Wetter genannt', r.gesagt.includes(W) && !r.gesagt.includes(F), r.gesagt);
    r = await lauf('Trag morgen um 10 Uhr Zahnarzt in Hamburg ein', [kal('Zahnarzt', 'Hamburg')], 'Zahnarzt morgen um 10 Uhr ist eingetragen.', { wetter: 'fehler' });
    check('Integration: Wetter nicht nötig (Zahnarzt) → keine Wetter-Meldung', !r.gesagt.includes(W), r.gesagt);
    check('Integration: keine Technik-Texte', !/fetch failed|HTTP 500|offline|AbortError|undefined/.test(r.gesagt), r.gesagt);
    r = await lauf('Trag morgen Wandern ein und ruf Mama an', [kal('Wandern im Wald', 'Hamburg'), { type: 'call', contact_name: 'Mama' }], 'Alles erledigt!', { wetter: 'fehler' });
    check('Integration: Aktion ok + Ausfall: Antwort kommt genau einmal', r.gesagt.split(W).length === 2, r.gesagt);
    r = await lauf('Merk dir was und mach was Kaputtes', [{ type: 'memory_store', memory_key: 'schlüssel', memory_value: 'unterm Kopfkissen' }, { type: 'reminder', reminder_text: 'x', reminder_time: 'kaputt-kein-datum' }], 'Alles erledigt!', {
        vorbereiten: A => { const orig = A.sb.executeAction; A.sb.executeAction = async function (a) { if (a.type === 'reminder') { const e = new Error('HTTP 500 fetch failed'); e.userMessage = 'Die Erinnerung konnte ich nicht anlegen.'; throw e; } return orig.apply(this, arguments); }; } });
    check('Integration: Erfolg + Fehler → nennt "Gemerkt." und die Fehlermeldung, nicht "Alles erledigt!", keine Technik', !r.haengt && /Gemerkt\./.test(r.gesagt) && r.gesagt.includes('Die Erinnerung konnte ich nicht anlegen.') && !/Alles erledigt|HTTP 500|fetch failed/.test(r.gesagt), r.gesagt);
    {   /* Hinweis eines erfolgreichen Teils darf durch den Fehler eines anderen Teils nicht verschwinden */
        r = await lauf('Merk dir was und mach was Kaputtes', [{ type: 'memory_store', memory_key: 'a', memory_value: 'b' }, { type: 'reminder', reminder_text: 'x', reminder_time: 'kaputt-kein-datum' }], 'Alles erledigt!', {
            vorbereiten: A => { const orig = A.sb.executeAction; A.sb.executeAction = async function (a, t, c) { if (a.type === 'memory_store') c.notes.push('Hinweis vom erfolgreichen Teil.'); if (a.type === 'reminder') { c.notes.push('Hinweis vom fehlgeschlagenen Teil.'); const e = new Error('x'); e.userMessage = 'Die Erinnerung konnte ich nicht anlegen.'; throw e; } return orig.apply(this, arguments); }; }
        });
        check('Integration: Hinweis des erfolgreichen Teils bleibt, Hinweis des fehlgeschlagenen Teils fällt weg', /Gemerkt\./.test(r.gesagt) && r.gesagt.includes('Die Erinnerung konnte ich nicht anlegen.') && r.gesagt.includes('Hinweis vom erfolgreichen Teil.') && !r.gesagt.includes('Hinweis vom fehlgeschlagenen Teil.'), r.gesagt);
    }

    console.log(fehler ? '\n' + fehler + ' Antwort-Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : 'Teilfehler-Antworten in Ordnung (' + ok + ' Prüfungen).');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
