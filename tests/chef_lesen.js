/* ============================================================
   TEST: Chef-KI Paket 1 "Chef-KI mit Werkzeugen": Essensplan, Erinnerungen und Einkaufsliste als lesende Werkzeuge.
   Start: node tests/chef_lesen.js   Ganze App (echte Skripte), Entscheider (KI) ist eine Attrappe. Über den echten Sprachweg (jvTippen).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
const PLAN = { gespeichert: '2026-11-09', tage: { Mittwoch: { veg: 'Kartoffelgratin', fleisch: 'Putengeschnetzeltes' }, Donnerstag: { veg: 'Linsensuppe', fleisch: 'Hacksteak' } } };

function neu(chef, zeit) {
    const st = { plan: { schritte: [] }, ent: 0, groq: 0 };
    const A = starte({ jetzt: zeit || '2026-11-11T10:00:00+01:00', festerZufall: true, spracherkennung: true, fetch: async (u, o) => {
        u = String(u);
        if (/api\/groq/.test(u)) {
            let m = []; try { m = JSON.parse(o.body).messages || []; } catch (e) { }
            if (m[0] && /Du planst für einen Sprachassistenten/.test(String(m[0].content))) { st.ent++; return ant({ choices: [{ message: { content: JSON.stringify(st.plan) } }] }); }
            st.groq++; return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'KI-ANTWORT', actions: [] }) } }] });
        }
        throw new Error('offline ' + u);
    } });
    A.st = st;
    if (chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
    A.store['jv_essensplan'] = JSON.stringify(PLAN);
    A.sage = async (s, p) => { if (p) st.plan = p; const g0 = A.gesagt.length; await A.lassLaufen(async () => { A.sb.jvTippen(s); await warte(80); }); await A.lassLaufen(async () => { await warte(60); }); return A.gesagt.slice(g0).join(' | '); };
    return A;
}
const R = A => A.sb.jvRegistry;
const schritt = (f, params) => ({ schritte: [{ faehigkeit: f, params: params || {} }] });

(async () => {
    /* ---- 1 Werkzeuge direkt ---- */
    {
        const A = neu(false);
        const e1 = await R(A).fuehreAus('essensplan', { tag: 'mittwoch' }, {});
        check('1a essensplan: Mittwoch nennt beide Gerichte', e1.status === 'SUCCESS' && /Kartoffelgratin/.test(e1.nachricht) && /Putengeschnetzeltes/.test(e1.nachricht), JSON.stringify(e1));
        const e2 = await R(A).fuehreAus('essensplan', {}, {});
        check('1b essensplan ohne Tag: heute (Mittwoch, 11.11.)', e2.status === 'SUCCESS' && /Kartoffelgratin/.test(e2.nachricht), JSON.stringify(e2));
        const e3 = await R(A).fuehreAus('essensplan', { tag: 'irgendwann' }, {});
        check('1c essensplan mit unklarem Tag fragt nach, rät nicht', e3.status === 'NEEDS_INFORMATION' && /Tag/.test(e3.nachricht), JSON.stringify(e3));
        A.store['jv_essensplan'] = '';
        const e4 = await R(A).fuehreAus('essensplan', { tag: 'heute' }, {});
        check('1d ohne gespeicherten Plan sagt sie das ehrlich (keine erfundenen Gerichte)', e4.status === 'NO_RESULTS' && /kein Essensplan/.test(e4.nachricht), JSON.stringify(e4));
    }
    {
        const A = neu(false);
        const r = A.lese('reminderEntries');
        r.push({ id: 1, text: 'Paket abholen', time: '2026-11-12T09:00:00+01:00' }, { id: 2, text: 'Zahnarzt anrufen', time: '2026-11-11T14:30:00+01:00' }, { id: 3, text: 'Schon erledigt', time: '2026-11-11T08:00:00+01:00', triggered: true });
        const e = await R(A).fuehreAus('erinnerungen_lesen', {}, {});
        check('2a erinnerungen_lesen: zwei offene, nächste zuerst, Erledigte fehlen', e.status === 'SUCCESS' && e.daten.anzahl === 2 && e.nachricht.indexOf('Zahnarzt') < e.nachricht.indexOf('Paket') && !/erledigt/.test(e.nachricht) && /heute um 14:30 Uhr/.test(e.nachricht) && /morgen um 9:00 Uhr/.test(e.nachricht), JSON.stringify(e));
        A.lese('reminderEntries').length = 0;
        const e0 = await R(A).fuehreAus('erinnerungen_lesen', {}, {});
        check('2b keine Erinnerung: sagt das', e0.status === 'SUCCESS' && /keine offene Erinnerung/.test(e0.nachricht), JSON.stringify(e0));
    }
    {
        const A = neu(false);
        A.lese('shoppingEntries').push({ id: 1, text: 'Milch' }, { id: 2, text: 'Brot' }, { id: 3, text: 'Butter', done: true });
        const e = await R(A).fuehreAus('einkauf_lesen', {}, {});
        check('3a einkauf_lesen: offene Einträge, Erledigtes fehlt', e.status === 'SUCCESS' && e.daten.anzahl === 2 && /Milch/.test(e.nachricht) && /Brot/.test(e.nachricht) && !/Butter/.test(e.nachricht), JSON.stringify(e));
        A.lese('shoppingEntries').length = 0;
        const e0 = await R(A).fuehreAus('einkauf_lesen', {}, {});
        check('3b leere Liste: sagt das', /leer/.test(e0.nachricht), JSON.stringify(e0));
    }
    /* ---- 4 über den echten Sprachweg mit der Chef-KI ---- */
    {
        const A = neu(true);
        const s = await A.sage('Was gibt es auf der Arbeit zu essen', schritt('essensplan', { tag: 'heute' }));
        check('4a Chef-KI EIN: Essensfrage in freier Form wird mit dem Werkzeug beantwortet', /Kartoffelgratin/.test(s) && A.st.ent >= 1, s + ' ent=' + A.st.ent);
        const B = neu(true);
        B.lese('shoppingEntries').push({ id: 1, text: 'Milch' });
        const s2 = await B.sage('Muss ich noch irgendwas besorgen', schritt('einkauf_lesen'));
        check('4b Chef-KI EIN: Einkaufsfrage in freier Form wird mit dem Werkzeug beantwortet', /Milch/.test(s2), s2);
        const C = neu(true);
        C.lese('reminderEntries').push({ id: 1, text: 'Paket abholen', time: '2026-11-12T09:00:00+01:00' });
        const s3 = await C.sage('Woran muss ich denken', schritt('erinnerungen_lesen'));
        check('4c Chef-KI EIN: Erinnerungsfrage in freier Form wird mit dem Werkzeug beantwortet', /Paket abholen/.test(s3), s3);
    }
    /* ---- 5 Schutz: Pläne mit Zusatzangaben werden abgelehnt, Werkzeuge schreiben nichts ---- */
    {
        const A = neu(true);
        const J = A.sb.jvChef;
        check('5a Plan mit fremder Angabe wird abgelehnt', !J.planErlaubt({ schritte: [{ faehigkeit: 'einkauf_lesen', params: { x: 1 } }] }) && !J.planErlaubt({ schritte: [{ faehigkeit: 'erinnerungen_lesen', params: { tag: 'heute' } }] }) && !J.planErlaubt({ schritte: [{ faehigkeit: 'essensplan', params: { ort: 'Hamburg' } }] }));
        check('5b gültige Pläne sind erlaubt, die Werkzeuge stehen nicht bei den Schreibenden', J.planErlaubt(schritt('essensplan', { tag: 'morgen' })) && J.planErlaubt(schritt('einkauf_lesen')) && J.planErlaubt(schritt('erinnerungen_lesen')) && !['essensplan', 'einkauf_lesen', 'erinnerungen_lesen'].some(n => J.SCHREIB.includes(n)));
        const vorher = JSON.stringify([A.lese('reminderEntries'), A.lese('shoppingEntries'), A.lese('calendarEntries'), A.lese('todoEntries')]);
        await R(A).fuehreAus('einkauf_lesen', {}, {}); await R(A).fuehreAus('erinnerungen_lesen', {}, {}); await R(A).fuehreAus('essensplan', {}, {});
        check('5c Lesen verändert keine Liste', vorher === JSON.stringify([A.lese('reminderEntries'), A.lese('shoppingEntries'), A.lese('calendarEntries'), A.lese('todoEntries')]));
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
