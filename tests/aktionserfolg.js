/* ============================================================
   TESTS für G.1: Ehrliche "nichts verändert"-Meldung und echte Google-Termin-ID. Start: node tests/aktionserfolg.js
   Teil 1: reine Funktion js/antwort_bau.js (Zustände: verändert / nichts verändert / kein Treffer / Fehler)
   Teil 2: executeAction meldet "nichts getan" über ctx (Symbol), ohne Rückgabewert oder Fehler zu ändern
   Teil 3: Integration über js/assistant.js (sendToGroqSmart): was Jarvis wirklich sagt
   Teil 4: Hüllen um executeAction reichen ctx und Rückgabewert unverändert weiter
   Teil 5: echte Google-ID aus der Antwort beim Anlegen
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const gleich = (name, ist, soll) => check(name, ist === soll, 'ist:  ' + JSON.stringify(ist) + '\n      soll: ' + JSON.stringify(soll));
const NICHTS = Symbol.for('jv.nichtsGetan');
const JETZT = '2026-10-28T10:00:00+01:00', MORGEN_10 = '2026-10-29T10:00:00+01:00';
const ant = d => ({ ok: true, status: 200, json: async () => d });

(async () => {
    /* ---------- Teil 1: antwort_bau ---------- */
    const sb0 = { window: {} }; vm.createContext(sb0);
    vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/antwort_bau.js'), 'utf8'), sb0);
    const baue = e => sb0.window.jvAntwort.baue(e);
    const MILCH = 'Milch steht bereits auf deiner Einkaufsliste.', KEIN_T = 'Ich habe keinen passenden Termin gefunden, deshalb wurde nichts geändert.';
    gleich('1a nur "nichts verändert": die falsche Erfolgsmeldung der KI fällt weg', baue({ basis: 'Milch ist auf der Liste.', nichts: [MILCH], okAnzahl: 0 }), MILCH);
    gleich('1b kein Termin: ein Satz, kein "Termin geändert."', baue({ basis: 'Termin geändert.', nichts: [KEIN_T], okAnzahl: 0 }), KEIN_T);
    gleich('1c Erfolg + nichts verändert: erst Erfolg, dann der ehrliche Satz', baue({ basis: 'Alles erledigt!', erfolge: ['calendar'], okAnzahl: 1, nichts: [MILCH] }), 'Termin gespeichert. ' + MILCH);
    gleich('1d nichts verändert + echter Fehler: Fehler und Satz, keine doppelte Aussage', baue({ basis: 'x', fehler: ['Die Erinnerung konnte ich nicht anlegen.'], nichts: [MILCH], okAnzahl: 0 }), MILCH + ' Die Erinnerung konnte ich nicht anlegen.');
    gleich('1e nichts verändert + Antwort ohne eigenen Satz (zum Beispiel Frage): Antwort bleibt', baue({ basis: 'Es ist sonnig.', erfolge: ['chat'], okAnzahl: 1, nichts: [MILCH] }), 'Es ist sonnig. ' + MILCH);
    gleich('1f gleicher Satz doppelt: nur einmal', baue({ basis: 'x', nichts: [MILCH, MILCH] }), MILCH);
    gleich('1g ohne "nichts" bleibt alles wie vorher', baue({ basis: 'Eingetragen.', erfolge: ['calendar'], okAnzahl: 1 }), 'Eingetragen.');
    gleich('1h nichts verändert + Hinweis eines anderen Teils: Hinweis bleibt', baue({ basis: 'x', nichts: [MILCH], hinweise: ['Hinweis.'] }), MILCH + ' Hinweis.');

    /* ---------- Hilfen für Teil 2 und 3 ---------- */
    function kopf(extra) {
        return starte(Object.assign({ jetzt: JETZT, festerZufall: true, fetch: async (u) => { throw new Error('offline ' + u); } }, extra || {}));
    }
    async function aktion(A, a, text, ctx) {
        let wert, fehl = null;
        try { const x = await A.lassLaufen(() => A.sb.executeAction(a, text, ctx)); wert = x.wert; } catch (e) { fehl = e; }
        return { wert, fehl };
    }
    const neuerCtx = () => ({ counter: 0, cards: [], notes: [], panel: null });
    const nichtsListe = ctx => (ctx[NICHTS] || []).slice();

    /* ---------- Teil 2: executeAction und ctx ---------- */
    {   // 2a Einkauf neu
        const A = kopf(); const ctx = neuerCtx();
        const r = await aktion(A, { type: 'shopping', shopping_items: ['Milch'] }, 'Setz Milch auf die Einkaufsliste', ctx);
        check('Einkauf neu: eingetragen, nichts-getan nicht gesetzt', !r.fehl && A.lese('shoppingEntries').some(e => e.text === 'Milch') && nichtsListe(ctx).length === 0, JSON.stringify(nichtsListe(ctx)));
        // 2b Einkauf schon vorhanden
        const ctx2 = neuerCtx();
        const r2 = await aktion(A, { type: 'shopping', shopping_items: ['milch'] }, 'Setz Milch auf die Einkaufsliste', ctx2);
        check('Einkauf vorhanden: kein neuer Eintrag, nichts-getan gesetzt, kein Fehler', !r2.fehl && A.lese('shoppingEntries').filter(e => e.text.toLowerCase() === 'milch').length === 1 && nichtsListe(ctx2).join() === 'milch steht bereits auf deiner Einkaufsliste.'.replace(/^m/, 'm'), JSON.stringify(nichtsListe(ctx2)));
        // 2c Einkauf gemischt: ein neuer, ein alter Eintrag -> zählt als verändert
        const ctx3 = neuerCtx();
        await aktion(A, { type: 'shopping', shopping_items: ['Milch', 'Brot'] }, 'Setz Milch und Brot auf die Einkaufsliste', ctx3);
        check('Einkauf gemischt (Brot neu, Milch alt): gilt als geändert, nichts-getan nicht gesetzt', nichtsListe(ctx3).length === 0 && A.lese('shoppingEntries').some(e => e.text === 'Brot'), JSON.stringify(nichtsListe(ctx3)));
        // 2d Kalender ändern ohne Treffer
        const ctx4 = neuerCtx();
        const r4 = await aktion(A, { type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: MORGEN_10 }, 'Ändere meinen Zahnarzttermin auf 16 Uhr', ctx4);
        check('Kalender ändern ohne Treffer: nichts-getan gesetzt, keine Notiz, kein Fehler', !r4.fehl && nichtsListe(ctx4).join() === 'Ich habe keinen passenden Termin gefunden, deshalb wurde nichts geändert.' && ctx4.notes.length === 0, JSON.stringify([nichtsListe(ctx4), ctx4.notes]));
        // 2e Kalender ändern mit Treffer
        A.lese('calendarEntries').push({ id: 'local_1', text: 'Zahnarzt', date: 'x', isoDate: '2026-10-29T08:00:00.000Z', location: '' });
        const ctx5 = neuerCtx();
        const r5 = await aktion(A, { type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: MORGEN_10 }, 'Ändere meinen Zahnarzttermin auf 16 Uhr', ctx5);
        check('Kalender ändern mit Treffer: nichts-getan nicht gesetzt', !r5.fehl && nichtsListe(ctx5).length === 0, JSON.stringify(nichtsListe(ctx5)));
        // 2f Löschen ohne Eintrag
        const B = kopf(); const ctx6 = neuerCtx();
        await aktion(B, { type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt', ctx6);
        check('Termin löschen bei leerem Kalender: nichts-getan gesetzt', nichtsListe(ctx6).join() === 'Ich habe keinen Termin gefunden, deshalb wurde nichts gelöscht.', JSON.stringify(nichtsListe(ctx6)));
        const ctx7 = neuerCtx();
        await aktion(B, { type: 'reminder_delete', reminder_query: 'tabletten' }, 'Lösche die Erinnerung Tabletten', ctx7);
        check('Erinnerung löschen ohne Erinnerungen: nichts-getan gesetzt', nichtsListe(ctx7).join() === 'Ich habe keine Erinnerung gefunden, deshalb wurde nichts gelöscht.', JSON.stringify(nichtsListe(ctx7)));
        // 2g Rückgabewert unverändert
        check('Rückgabewert von executeAction bleibt undefined (Vertrag unverändert)', r.wert === undefined && r2.wert === undefined && r4.wert === undefined, JSON.stringify([r.wert, r2.wert, r4.wert]));
        // 2h Symbol ist unsichtbar für JSON (Fingerabdruck-Tests)
        check('ctx sieht von außen unverändert aus (Symbol-Schlüssel)', JSON.stringify(ctx2) === JSON.stringify(neuerCtx()) || JSON.stringify(ctx2) === JSON.stringify({ counter: 0, cards: [], notes: [], panel: null }), JSON.stringify(ctx2));
    }

    /* ---------- Teil 3: Integration über assistant.js ---------- */
    async function lauf(satz, aktionen, reply, o) {
        o = o || {};
        const A = kopf({ fetch: async (u) => {
            if (/\/api\/groq/.test(u)) return ant({ choices: [{ message: { content: JSON.stringify({ reply, actions: aktionen }) } }] });
            throw new Error('offline ' + u);
        } });
        A.setze('wxGeocode', async () => ({ lat: 53.5, lon: 10 }));
        (o.einkauf || []).forEach(t => A.lese('shoppingEntries').push({ id: Math.random(), text: t }));
        (o.termine || []).forEach(e => A.lese('calendarEntries').push(e));
        if (o.vorbereiten) o.vorbereiten(A);
        const g0 = A.gesagt.length;
        const r = await A.lassLaufen(() => A.sb.sendToGroqSmart(satz));
        await new Promise(res => setImmediate(res));
        return { gesagt: A.gesagt.slice(g0).join(' | '), haengt: !!r.haengt, A };
    }
    let r;
    r = await lauf('Setz Milch auf die Einkaufsliste', [{ type: 'shopping', shopping_items: ['Milch'] }], 'Milch ist auf der Einkaufsliste.');
    check('3-1 Einkauf erfolgreich: Antwort der KI bleibt wie bisher', !r.haengt && /Milch ist auf der Einkaufsliste\./.test(r.gesagt) && !/bereits/.test(r.gesagt), r.gesagt);
    r = await lauf('Setz Milch auf die Einkaufsliste', [{ type: 'shopping', shopping_items: ['Milch'] }], 'Milch ist auf der Einkaufsliste.', { einkauf: ['Milch'] });
    check('3-2 Einkauf vorhanden: "Milch steht bereits ...", nicht "hinzugefügt"', !r.haengt && r.gesagt.includes('Milch steht bereits auf deiner Einkaufsliste.') && !/ist auf der Einkaufsliste\./.test(r.gesagt.replace('steht bereits auf deiner Einkaufsliste.', '')) && !/ergänzt|hinzugefügt/.test(r.gesagt), r.gesagt);
    const zahn = { id: 'local_9', text: 'Zahnarzt', date: 'x', isoDate: '2026-10-29T08:00:00.000Z', location: '' };
    r = await lauf('Ändere meinen Zahnarzttermin auf 16 Uhr', [{ type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: '2026-10-29T16:00:00+01:00' }], 'Termin geändert.', { termine: [zahn] });
    check('3-3 Kalender ändern erfolgreich: Antwort wie bisher, kein "nichts geändert"', !r.haengt && /Termin geändert\./.test(r.gesagt) && !/nichts geändert/.test(r.gesagt), r.gesagt);
    r = await lauf('Ändere meinen Zahnarzttermin auf 16 Uhr', [{ type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: '2026-10-29T16:00:00+01:00' }], 'Termin geändert.');
    check('3-4 Kalender ändern ohne Treffer: genau ein ehrlicher Satz, nie "Termin geändert."', !r.haengt && r.gesagt.includes('Ich habe keinen passenden Termin gefunden, deshalb wurde nichts geändert.') && !/Termin geändert\./.test(r.gesagt) && r.gesagt.split('nichts geändert').length === 2, r.gesagt);
    r = await lauf('Merk dir was und mach was Kaputtes', [{ type: 'reminder', reminder_text: 'x', reminder_time: 'kaputt' }], 'Alles erledigt!', {
        vorbereiten: A => { const orig = A.sb.executeAction; A.sb.executeAction = async function (a, t, c) { if (a.type === 'reminder') { const e = new Error('HTTP 500 fetch failed'); e.userMessage = 'Die Erinnerung konnte ich nicht anlegen.'; throw e; } return orig.apply(this, arguments); }; } });
    check('3-5 echter Fehler: Fehlermeldung statt "Alles erledigt!", keine Technik, nicht als "nichts getan"', !r.haengt && r.gesagt.includes('Die Erinnerung konnte ich nicht anlegen.') && !/Alles erledigt|HTTP 500|bereits|wurde nichts/.test(r.gesagt), r.gesagt);
    r = await lauf('Setz Milch auf die Liste und ändere den Zahnarzt', [{ type: 'shopping', shopping_items: ['Milch'] }, { type: 'todo', todo_items: ['Müll rausbringen'] }, { type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: MORGEN_10 }], 'Alles erledigt!', { einkauf: ['Milch'] });
    check('3-6 mehrere Aktionen gemischt: Aufgabe ok, Milch schon da, kein Termin – jede Aussage wahr, einmal', !r.haengt && r.gesagt.includes('Aufgabe gespeichert.') && r.gesagt.includes('Milch steht bereits auf deiner Einkaufsliste.') && r.gesagt.includes('Ich habe keinen passenden Termin gefunden') && !/Alles erledigt|Termin geändert|Einkaufsliste ergänzt/.test(r.gesagt) && r.gesagt.split('Aufgabe gespeichert.').length === 2, r.gesagt);
    check('3-6b die unabhängige Aufgabe wurde trotz wirkungsloser Aktionen wirklich angelegt', r.A.lese('todoEntries').some(e => e.text === 'Müll rausbringen'), JSON.stringify(r.A.lese('todoEntries')));
    r = await lauf('Notier Brot und ruf was Kaputtes auf', [{ type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: MORGEN_10 }, { type: 'reminder', reminder_text: 'x', reminder_time: 'kaputt' }, { type: 'shopping', shopping_items: ['Brot'] }], 'Alles erledigt!', {
        vorbereiten: A => { const orig = A.sb.executeAction; A.sb.executeAction = async function (a, t, c) { if (a.type === 'reminder') { const e = new Error('HTTP 500'); e.userMessage = 'Die Erinnerung konnte ich nicht anlegen.'; throw e; } return orig.apply(this, arguments); }; } });
    check('3-7 Teilfehlerlogik: kein Treffer + Fehler + Erfolg – alle drei Aussagen, Reihenfolge Erfolg, nichts, Fehler', !r.haengt && (() => { const g = r.gesagt, a = g.indexOf('Einkaufsliste ergänzt.'), b = g.indexOf('keinen passenden Termin'), c = g.indexOf('Die Erinnerung konnte ich nicht anlegen.'); return a >= 0 && b > a && c > b && !/Alles erledigt|Termin geändert/.test(g); })(), r.gesagt);
    check('3-7b Brot wurde trotz Fehler davor und danach eingetragen', r.A.lese('shoppingEntries').some(e => e.text === 'Brot'));

    /* ---------- Teil 4: Hüllen reichen Rückgabewert und ctx durch ---------- */
    {
        const A = kopf(); const hs = A.lese('window.jvAktionen');
        check('4-0 Hüllen-Register vorhanden', !!hs && typeof hs.huelle === 'function');
        const ctx = neuerCtx();
        const r1 = await aktion(A, { type: 'shopping', shopping_items: ['Milch'] }, 'Setz Milch auf die Einkaufsliste', ctx);
        const ctx2 = neuerCtx();
        await aktion(A, { type: 'shopping', shopping_items: ['Milch'] }, 'Setz Milch auf die Einkaufsliste', ctx2);
        check('4-1 durch alle echten Hüllen hindurch kommt das nichts-getan beim Aufrufer an (selbes ctx-Objekt)', nichtsListe(ctx2).length === 1 && nichtsListe(ctx).length === 0);
        // Die echte Kette mit einer Attrappen-Basis: Rückgabewert, Fehler und das ctx-Objekt samt nichts-getan-Symbol laufen unverändert durch alle Stufen
        const sbx = { window: null, console, setTimeout() { return 0; }, Symbol, Error }; sbx.window = sbx; vm.createContext(sbx);
        sbx.executeAction = async function (a, t, c) { if (a.type === 'boom') throw new Error('Basis-Fehler'); (c[NICHTS] = c[NICHTS] || []).push('nichts'); return a.type === 'wert' ? 'RUECK' : undefined; };
        vm.runInContext(fs.readFileSync(path.join(ROOT, 'js/aktionen_kette.js'), 'utf8'), sbx);
        const k = sbx.window.jvAktionen;
        check('4-2 Kette lässt sich mit Attrappen-Basis laden', !!k && typeof k.huelle === 'function');
        let sahCtx = null;
        k.huelle('g1_aussen', 1, innen => async function (a, t, c) { sahCtx = c; return innen.apply(this, arguments); });
        k.huelle('g1_mitte', 55, innen => async function (a, t, c) { const x = await innen.apply(this, arguments); return x; });
        k.huelle('g1_innen', 99, innen => async function (a, t, c) { return innen.apply(this, arguments); });
        const cx = neuerCtx();
        const wert = await sbx.window.executeAction({ type: 'wert' }, 'text', cx);
        check('4-3 Rückgabewert kommt durch drei Hüllen unverändert an', wert === 'RUECK', String(wert));
        check('4-4 dasselbe ctx-Objekt bei allen Hüllen, nichts-getan-Satz kommt beim Aufrufer an', sahCtx === cx && (cx[NICHTS] || []).join() === 'nichts');
        let fehlText = null;
        try { await sbx.window.executeAction({ type: 'boom' }, 'text', neuerCtx()); } catch (e) { fehlText = e.message; }
        check('4-5 Fehler der Basis kommt unverändert beim Aufrufer an', fehlText === 'Basis-Fehler', String(fehlText));
        // In der echten App: alle Hüllen angemeldet und ohne Fehlermeldung
        const pr = hs.pruefe();
        check('4-6 echte Kette: alle Hüllen angemeldet, keine Meldung', pr && pr.vollstaendig === true, JSON.stringify(pr));
    }

    /* ---------- Teil 5: Google-ID ---------- */
    {
        let aufrufe = 0;
        const A = kopf({ fetch: async (u, o) => {
            if (/googleapis\.com\/calendar\/v3\/calendars\/primary\/events$/.test(u) && o && o.method === 'POST') { aufrufe++; return ant({ id: 'abc123googleid', status: 'confirmed' }); }
            if (/googleapis\.com\/calendar/.test(u)) return ant({ items: [] });
            throw new Error('offline ' + u);
        } });
        A.setze('accessToken', 'tok'); A.setze('googleTokenExpiresAt', Date.now() + 3600e3 * 24 * 365 * 5);
        const ctx = neuerCtx();
        const x = await aktion(A, { type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN_10 }, 'Trag Zahnarzt ein', ctx);
        const gid = ctx[Symbol.for('jv.googleTerminId')];
        check('5-1 echte Google-ID aus der Antwort landet intern im ctx', !x.fehl && gid === 'abc123googleid', String(gid) + ' ' + (x.fehl && x.fehl.message));
        check('5-2 genau ein Google-POST, kein zusätzlicher Prüf-Aufruf zum Anlegen', aufrufe === 1, String(aufrufe));
        check('5-3 ID wird nicht vorgelesen oder in Notizen geschrieben', !JSON.stringify(ctx.notes).includes('abc123') && !JSON.stringify(ctx.cards).includes('abc123'));
        // Antwort ohne lesbaren Inhalt: Termin gilt trotzdem als angelegt, keine ID
        const B = kopf({ fetch: async (u, o) => {
            if (/calendars\/primary\/events$/.test(u) && o && o.method === 'POST') return { ok: true, status: 200, json: async () => { throw new Error('leer'); } };
            return ant({ items: [] });
        } });
        B.setze('accessToken', 'tok'); B.setze('googleTokenExpiresAt', Date.now() + 3600e3 * 24 * 365 * 5);
        const ctxB = neuerCtx();
        const y = await aktion(B, { type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: MORGEN_10 }, 'Trag Zahnarzt ein', ctxB);
        check('5-4 Antwort ohne lesbaren Inhalt: kein Fehler, kein Hinweis "nur in der App", keine ID', !y.fehl && !ctxB.notes.some(n => /nur in der App/.test(n)) && !ctxB[Symbol.for('jv.googleTerminId')], JSON.stringify(ctxB.notes) + (y.fehl && y.fehl.message));
    }

    console.log(`AKTIONSERFOLG: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})();
