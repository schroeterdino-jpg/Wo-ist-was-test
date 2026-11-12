/* ============================================================
   TEST: Chef-KI Paket 2 "Chef-KI mit Werkzeugen": Urlaub, Rechnungen, Vollmond, Wunschliste, Pakete, Uhrzeit anderswo (alle nur lesend).
   Start: node tests/chef_lesen2.js   Ganze App (echte Skripte), Entscheider (KI) ist eine Attrappe. Über den echten Sprachweg (jvTippen).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };

function neu(chef, echt) {
    const st = { plan: { schritte: [] }, ent: 0, prompts: [] };
    const A = starte({ jetzt: '2026-11-11T10:00:00+01:00', festerZufall: true, echtesSpeak: !!echt, spracherkennung: true, fetch: async (u, o) => {
        u = String(u);
        if (/api\/groq/.test(u)) {
            let m = []; try { m = JSON.parse(o.body).messages || []; } catch (e) { }
            if (m[0] && /Du planst für einen Sprachassistenten/.test(String(m[0].content))) { st.ent++; st.prompts.push(m.map(x => String(x.content)).join('\n')); return ant({ choices: [{ message: { content: JSON.stringify(st.plan) } }] }); }
            return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'KI-ANTWORT', actions: [] }) } }] });
        }
        throw new Error('offline ' + u);
    } });
    A.st = st;
    if (chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
    A.sage = async (s, p) => { if (p) st.plan = p; const g0 = A.gesagt.length; await A.lassLaufen(async () => { A.sb.jvTippen(s); await warte(80); }); await A.lassLaufen(async () => { await warte(60); }); return A.gesagt.slice(g0).join(' | '); };
    return A;
}
const R = A => A.sb.jvRegistry;
const schritt = (f, params) => ({ schritte: [{ faehigkeit: f, params: params || {} }] });

(async () => {
    const NEU = ['urlaub_lesen', 'rechnungen_lesen', 'vollmond', 'wunschliste_lesen', 'pakete_lesen', 'parkplatz_lesen', 'uhrzeit_anderswo'];
    {
        const A = neu(false);
        check('1a alle sechs Werkzeuge sind registriert', NEU.every(n => R(A).namen().indexOf(n) >= 0), JSON.stringify(R(A).namen()));
        const J = A.sb.jvChef;
        check('1b Parameter-Prüfung: keine Zusatzangaben, Uhrzeit braucht einen Ort', ['urlaub_lesen', 'rechnungen_lesen', 'vollmond', 'wunschliste_lesen', 'pakete_lesen'].every(n => J.planErlaubt(schritt(n)) && !J.planErlaubt(schritt(n, { x: 1 }))) && J.planErlaubt(schritt('uhrzeit_anderswo', { ort: 'New York' })) && !J.planErlaubt(schritt('uhrzeit_anderswo')) && !J.planErlaubt(schritt('uhrzeit_anderswo', { ort: 'Tokio', x: 1 })));
    }
    {   /* Werkzeuge direkt */
        const A = neu(false);
        const u0 = await R(A).fuehreAus('urlaub_lesen', {}, {});
        check('2a kein Urlaub: sagt das', u0.status === 'SUCCESS' && /keinen Urlaub/.test(u0.nachricht), JSON.stringify(u0));
        A.store['jv_urlaub'] = JSON.stringify({ von: '2026-12-20', bis: '2027-01-03' });
        const u1 = await R(A).fuehreAus('urlaub_lesen', {}, {});
        check('2b Urlaub eingetragen: nennt von und bis', /20\. Dezember/.test(u1.nachricht) && /3\. Januar/.test(u1.nachricht), JSON.stringify(u1));
        const r0 = await R(A).fuehreAus('rechnungen_lesen', {}, {});
        check('3a keine Rechnung: sagt das, erfindet nichts', r0.status === 'SUCCESS' && /keine offenen Rechnungen/.test(r0.nachricht), JSON.stringify(r0));
        A.store['jv_rechnungen'] = JSON.stringify([{ id: 'rg_1', key: 'a', absender: 'Vodafone', betrag: 39.99, ziel: '2026-11-15', typ: 'rechnung', gesehen: '2026-11-01', bezahlt: false }, { id: 'rg_2', key: 'b', absender: 'Strom', betrag: 80, ziel: '2026-11-05', typ: 'rechnung', gesehen: '2026-11-01', bezahlt: false }, { id: 'rg_3', key: 'c', absender: 'Alt', betrag: 5, ziel: '2026-11-01', typ: 'rechnung', gesehen: '2026-10-01', bezahlt: '2026-11-02' }]);
        const r1 = await R(A).fuehreAus('rechnungen_lesen', {}, {});
        check('3b zwei offene Rechnungen, bezahlte fehlt, Überfälliges genannt', r1.daten.anzahl === 2 && /Strom/.test(r1.nachricht) && !/Alt/.test(r1.nachricht) && /überfällig/.test(r1.nachricht), JSON.stringify(r1));
        const v = await R(A).fuehreAus('vollmond', {}, {});
        check('4a Vollmond: ein Satz mit Datum', v.status === 'SUCCESS' && /Vollmond/.test(v.nachricht), JSON.stringify(v));
        const w0 = await R(A).fuehreAus('wunschliste_lesen', {}, {});
        check('5a keine Wunschliste: sagt das', /noch keine Wunschliste/.test(w0.nachricht), JSON.stringify(w0));
        A.store['jv_wunschlisten'] = JSON.stringify([{ name: 'Liam', items: [{ t: 'Lego Feuerwehr', done: false }, { t: 'Ball', done: true }] }]);
        const w1 = await R(A).fuehreAus('wunschliste_lesen', {}, {});
        check('5b Wunschliste: offene Wünsche, Erledigtes fehlt', /Lego Feuerwehr/.test(w1.nachricht) && !/Ball/.test(w1.nachricht), JSON.stringify(w1));
        const p0 = await R(A).fuehreAus('pakete_lesen', {}, {});
        check('6a kein Paket: sagt das', /kein Paket/.test(p0.nachricht), JSON.stringify(p0));
        A.store['jv_pakete'] = JSON.stringify([{ nr: '1234567890', name: 'von Amazon', code: 'transit', status: 'unterwegs', beschr: 'Das Paket ist in der Zustellung', geprueft: Date.now() }]);
        const p1 = await R(A).fuehreAus('pakete_lesen', {}, {});
        check('6b Paket: nennt den gespeicherten Stand', p1.status === 'SUCCESS' && /Amazon/.test(p1.nachricht), JSON.stringify(p1));
        const z = await R(A).fuehreAus('uhrzeit_anderswo', { ort: 'New York' }, {});
        check('7a New York: 4 Uhr früher (6 Uhr morgens bei 10 Uhr bei uns)', z.status === 'SUCCESS' && /New York/.test(z.nachricht) && /4 Uhr/.test(z.nachricht), JSON.stringify(z));
        const z2 = await R(A).fuehreAus('uhrzeit_anderswo', { ort: 'Japan' }, {});
        check('7b Land statt Stadt wird verstanden (Japan → Tokio)', z2.status === 'SUCCESS' && /Tokio/.test(z2.nachricht), JSON.stringify(z2));
        const z3 = await R(A).fuehreAus('uhrzeit_anderswo', { ort: 'Schwarzenbek' }, {});
        check('7c unbekannter Ort: ehrlich, keine erfundene Uhrzeit', z3.status === 'NO_RESULTS', JSON.stringify(z3));
        const vorher = JSON.stringify(A.store);
        for (const n of NEU) await R(A).fuehreAus(n, n === 'uhrzeit_anderswo' ? { ort: 'Tokio' } : {}, {});
        check('8a Lesen verändert keinen Speicher', vorher === JSON.stringify(A.store));
    }
    {   /* echter Sprachweg */
        const A = neu(true);
        A.store['jv_urlaub'] = JSON.stringify({ von: '2026-12-20', bis: '2027-01-03' });
        const s = await A.sage('Weißt du, ob ich über Weihnachten frei habe', schritt('urlaub_lesen'));
        check('9a Urlaubsfrage in freier Form: Werkzeug antwortet', /20\. Dezember/.test(s) && A.st.ent >= 1, s);
        const B = neu(true);
        const s2 = await B.sage('Was haben die in Tokio gerade für eine Uhrzeit', schritt('uhrzeit_anderswo', { ort: 'Tokio' }));
        check('9b Uhrzeit in Tokio: Werkzeug antwortet', /Tokio/.test(s2), s2);
        const C = neu(true);
        const s3 = await C.sage('Wann ist denn der nächste Vollmond', schritt('vollmond'));
        check('9c Vollmond: Antwort kommt (lokaler Befehl oder Werkzeug)', /Vollmond/.test(s3), s3);
    }
    {   /* Anschlussfrage: die letzte Frage und Antwort gehen an den Entscheider (echte Sprech-Kette, dort merkt sich die Gesprächshilfe die Antwort) */
        const A = neu(true, true);
        const lauf = async (satz, plan) => { if (plan) A.st.plan = plan; await A.lassLaufen(async () => { A.sb.jvTippen(satz); await warte(80); }); await A.lassLaufen(async () => { await warte(60); }); return A.sb.jvKontext.letzter(); };
        const l1 = await lauf('Wann ist der nächste Vollmond');
        check('10a die Antwort auf die Vollmond-Frage wird als letzte Antwort gemerkt', !!l1 && /Vollmond/.test(l1.antwort) && /Vollmond/.test(l1.frage), JSON.stringify(l1));
        const n0 = A.st.prompts.length;
        const l2 = await lauf('Und wie viele Tage sind es noch', schritt('vollmond'));
        const p = A.st.prompts.slice(n0).join('\n');
        check('10b der Entscheider bekommt Frage und Antwort der letzten Runde mit', /Letzte Frage des Nutzers: "Wann ist der nächste Vollmond"/.test(p) && /Deine letzte Antwort: "[^"]*Vollmond/.test(p), p.slice(-300));
        check('10c die Anschlussfrage wird mit dem Werkzeug beantwortet, keine Rückfrage', !!l2 && /Und wie viele Tage/.test(l2.frage) && /Vollmond/.test(l2.antwort) && !/beziehst/.test(l2.antwort), JSON.stringify(l2));
        const B = neu(true, true);
        await B.lassLaufen(async () => { B.sb.jvTippen('Und wie viele Tage sind es noch'); await warte(80); });
        check('10d ohne vorherige Runde steht kein altes Gespräch im Auftrag', B.st.prompts.length >= 1 && !/Letzte Frage des Nutzers/.test(B.st.prompts.join('\n')), String(B.st.prompts.length));
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
