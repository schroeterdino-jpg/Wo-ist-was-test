/* ============================================================
   TESTS Werkstattsuche-Rückfall: Start: node tests/werkstatt_fallback.js
   Die alte Orte-Suche (nearbymore.js) bleibt der erste Weg. Nur bei eingeschalteter Chef-KI und nur bei "Kartendaten nicht erreichbar" oder
   "kein Treffer" übernimmt die neuere Ortssuche (window.handleOrtsucheCommand) mit dem Originalsatz. Standortfehler werden nicht übergeben.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
const EL = [
    { type: 'node', id: 1, lat: 53.505, lon: 10.101, tags: { name: 'Kfz Meier', shop: 'car_repair', 'addr:street': 'Dorfstr.', 'addr:housenumber': '4', 'addr:city': 'Schwarzenbek' } },
    { type: 'node', id: 2, lat: 53.52, lon: 10.12, tags: { name: 'Auto Nord', shop: 'car_repair' } }
];
const PL = [{ name: 'Werkstatt Google Treffer', street: 'Hauptstr.', housenumber: '1', city: 'Hamburg', lat: 53.51, lon: 10.11 }];

function umgebung(opt) {
    opt = opt || {};
    const st = { overpass: 'ok', places: 'ok', ort: 'ok', calls: { overpass: 0, places: 0, public: 0, groq: 0, ent: 0 } };
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, spracherkennung: !opt.native, native: opt.native, fetch: async (u, o) => {
        u = String(u);
        if (/api\/overpass/.test(u)) {
            st.calls.overpass++;
            if (st.overpass === 'fehler') return { ok: false, status: 502, json: async () => ({}) };
            return ant({ elements: st.overpass === 'leer' ? [] : EL });
        }
        if (/overpass/.test(u)) { st.calls.public++; if (st.overpass === 'fehler') throw new Error('offline'); return ant({ elements: st.overpass === 'leer' ? [] : EL }); }
        if (/action=places/.test(u)) { st.calls.places++; if (st.places === 'fehler') return { ok: false, status: 500, json: async () => ({}) }; return ant({ places: st.places === 'leer' ? [] : PL }); }
        if (/api\/groq/.test(u)) { let m = []; try { m = JSON.parse(o.body).messages || []; } catch (e) { } if (m[0] && /Du planst für einen Sprachassistenten/.test(String(m[0].content))) st.calls.ent++; else st.calls.groq++; return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Okay.', actions: [] }) } }] }); }
        if (/api\/memory/.test(u)) return ant({});
        throw new Error('offline (Attrappe) ' + u);
    } });
    A.st = st;
    A.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.1 });
    A.sb.navigator.geolocation.getCurrentPosition = (okf, err) => { if (opt.keinStandort) err && err({ code: 1 }); else okf({ coords: { latitude: 53.5, longitude: 10.1 } }); };
    A.karten = []; A.sb.showActionCards = c => { A.karten.push(c); };
    return A;
}
async function lauf(A, aktion) {
    const g0 = A.gesagt.length;
    await A.lassLaufen(async () => { await aktion(); await warte(80); }); await A.lassLaufen(async () => { await warte(60); });
    return A.gesagt.slice(g0);
}
const tippen = (A, s) => lauf(A, async () => { A.sb.jvTippen(s); });
const mikro = (A, s) => lauf(A, async () => { A.erkenner[0].onresult({ resultIndex: 0, results: [[{ transcript: s, confidence: 0.9 }]] }); });
const codes = A => A.sb.jvChef.eingaenge().map(e => e.codes.join('>'));
const SATZ = 'Suche eine Werkstatt in der Nähe';
const ALTFEHLER = /Kartendaten sind gerade nicht erreichbar/, ALTLEER = /keinen Treffer für Autowerkstatt/;

(async () => {
    /* 1: Overpass liefert -> alter Weg, keine Übergabe */
    for (const weg of ['tippen', 'mikro']) {
        const A = umgebung(); A.sb.jvChef.an();
        const g = await (weg === 'mikro' ? mikro : tippen)(A, SATZ);
        check('1 ' + weg + ': Overpass-Treffer -> alte Antwort, die Ortssuche wird nicht gefragt', g.length === 1 && /Kfz Meier/.test(g[0]) && A.st.calls.places === 0 && codes(A).join() === 'befehl_vorrang', JSON.stringify({ g, c: codes(A), p: A.st.calls.places }));
    }
    /* 2/3: Overpass-Fehler oder ohne Treffer -> Ortssuche übernimmt, genau EINE Antwort */
    for (const [name, ov, alt] of [['Overpass-Fehler', 'fehler', ALTFEHLER], ['ohne Treffer', 'leer', ALTLEER]]) {
        for (const weg of ['tippen', 'mikro']) {
            const A = umgebung(); A.sb.jvChef.an(); A.st.overpass = ov;
            const g = await (weg === 'mikro' ? mikro : tippen)(A, SATZ);
            check('2 ' + name + ' (' + weg + '): Ortssuche (Google Places) antwortet, genau eine Antwort, keine alte Fehlermeldung', g.length === 1 && /Werkstatt Google Treffer/.test(g[0]) && !alt.test(g.join(' ')), JSON.stringify(g));
            check('2b ' + name + ' (' + weg + '): Diagnose "befehl_vorrang>alte_suche_uebergabe", eine Ortssuche-Anfrage', codes(A).join() === 'befehl_vorrang>alte_suche_uebergabe' && A.st.calls.places === 1 && A.st.calls.ent === 0 && A.st.calls.groq === 0, JSON.stringify({ c: codes(A), p: A.st.calls.places, ent: A.st.calls.ent, groq: A.st.calls.groq }));
        }
    }
    /* 4: beide Wege scheitern -> verständliche Meldung (die der Ortssuche), nur eine, kein Dauerlauf */
    for (const [name, ov, pl, soll] of [['Fehler + Fehler', 'fehler', 'fehler', /Ortssuche antwortet gerade nicht/], ['leer + leer', 'leer', 'leer', /keinen Eintrag für/]]) {
        const A = umgebung(); A.sb.jvChef.an(); A.st.overpass = ov; A.st.places = pl;
        const g = await tippen(A, SATZ);
        const n0 = JSON.stringify(A.st.calls); await lauf(A, async () => { await warte(100); });
        check('4 beide scheitern (' + name + '): genau eine verständliche Meldung', g.length === 1 && soll.test(g[0]) && !ALTFEHLER.test(g[0]), JSON.stringify(g));
        check('4b … und danach keine weiteren Anfragen (keine Schleife)', JSON.stringify(A.st.calls) === n0 && A.st.calls.places <= 3, n0);
    }
    /* 5: Ortssuche übernimmt nicht -> alte, verständliche Meldung */
    for (const [ov, alt] of [['fehler', ALTFEHLER], ['leer', ALTLEER]]) {
        const A = umgebung(); A.sb.jvChef.an(); A.st.overpass = ov; A.sb.handleOrtsucheCommand = () => false;
        const g = await tippen(A, SATZ);
        check('5 Ortssuche übernimmt nicht (' + ov + ') -> alte Meldung, nichts übergeben', g.length === 1 && alt.test(g[0]) && A.st.calls.places === 0 && codes(A).join() === 'befehl_vorrang', JSON.stringify({ g, c: codes(A) }));
    }
    /* 6: Standort fehlt -> nicht übergeben */
    { const A = umgebung({ keinStandort: true }); A.sb.jvChef.an(); A.st.overpass = 'fehler';
      const g = await tippen(A, SATZ);
      check('6 Standort fehlt: alte Standort-Meldung, keine Übergabe, keine Ortssuche-Anfrage', g.length === 1 && /Standort/.test(g[0]) && A.st.calls.places === 0 && A.st.calls.overpass === 0 && !codes(A).join().includes('alte_suche'), JSON.stringify({ g, c: codes(A) })); }
    /* 7: Chef-KI AUS -> alles wie bisher */
    for (const [ov, alt] of [['fehler', ALTFEHLER], ['leer', ALTLEER]]) {
        const A = umgebung(); A.st.overpass = ov;
        const g = await tippen(A, SATZ);
        check('7 Chef-KI AUS (' + ov + '): alte Meldung, keine Übergabe, keine Aufzeichnung', g.length === 1 && alt.test(g[0]) && A.st.calls.places === 0 && A.sb.jvChef.eingaenge().length === 0, JSON.stringify(g));
    }
    /* 8: Handy-Brücke (Android): __zaneRec */
    { const A = umgebung({ native: { recStart() { }, recStop() { }, recAbort() { } } }); A.sb.jvChef.an(); A.st.overpass = 'fehler';
      const rec = A.lese('recognition'); const g0 = A.gesagt.length;
      await A.lassLaufen(async () => { try { rec.start(); } catch (e) { } await warte(5); });
      await A.lassLaufen(async () => { A.sb.__zaneRec('result', [{ t: SATZ, c: 0.9 }]); await warte(100); }); await A.lassLaufen(async () => { await warte(60); });
      const g = A.gesagt.slice(g0);
      check('8 Handy-Brücke: Overpass-Fehler -> Ortssuche antwortet einmal, Diagnose vermerkt die Übergabe', g.length === 1 && /Werkstatt Google Treffer/.test(g[0]) && codes(A).join() === 'befehl_vorrang>alte_suche_uebergabe', JSON.stringify({ g, c: codes(A) })); }
    /* 9: keine Nutzersätze in der Diagnose */
    { const A = umgebung(); A.sb.jvChef.an(); A.st.overpass = 'fehler'; await tippen(A, SATZ);
      const roh = JSON.stringify(A.sb.jvChef.eingaenge());
      check('9 Diagnose enthält keinen Satz', !/werkstatt|suche eine|in der nähe/i.test(roh), roh); }
    /* 10: keine Regression bei anderen Ortssuchen */
    { const A = umgebung(); A.sb.jvChef.an();
      const g = await tippen(A, 'Wo ist die nächste Apotheke');
      check('10a Apotheke (alter Weg, Overpass ok): unverändert, keine Übergabe', g.length >= 1 && A.st.calls.places === 0 && !codes(A).join().includes('alte_suche'), JSON.stringify({ g, c: codes(A) })); }
    { const A = umgebung(); A.sb.jvChef.an();
      const g = await tippen(A, 'Wo ist der nächste Penny');
      check('10b Penny (Ortssuche selbst): unverändert, keine Übergabe-Meldung', g.length >= 1 && !codes(A).join().includes('alte_suche'), JSON.stringify({ g, c: codes(A) })); }
    { const A = umgebung(); A.sb.jvChef.an();
      const g = await tippen(A, 'Ich habe Hunger, was gibt es hier in der Nähe');
      check('10c Restaurant-Wunsch: Chef-KI-Weg wie vorher, keine Übergabe', g.length >= 1 && !codes(A).join().includes('alte_suche') && /lokal_uebernommen/.test(codes(A).join()), JSON.stringify({ g, c: codes(A) })); }
    { const A = umgebung(); A.sb.jvChef.an(); const befehle = A.sb.jvCommands.list().length; const B = umgebung();
      check('10d Befehlsliste unverändert', befehle === B.sb.jvCommands.list().length && befehle >= 92); }

    /* Statisch: nur die freigegebenen Stellen */
    const nm = lies('js/nearbymore.js');
    check('11a nearbymore.js: genau zwei Übergabestellen (Fehler, kein Treffer), nicht beim Standortfehler', (nm.match(/plUebergabe\(originalText\)/g) || []).length === 2 && /catch \(e\) \{ say\('Ihren Standort kann ich gerade nicht ermitteln\.'\); return; \}/.test(nm));
    check('11b Übergabe nur mit Chef-KI AN, nur über window.handleOrtsucheCommand, höchstens einmal je Anfrage', /istAn\(\)\)\) return false/.test(nm.replace(/\s+/g, ' ').replace('!window.jvChef.istAn()) return false', 'istAn())) return false')) && /window\.handleOrtsucheCommand\(text\)/.test(nm) && (nm.match(/!uebergeben && \(uebergeben = true\)/g) || []).length === 2);
    check('11c voice.js unverändert (kein Umbau)', (lies('js/voice.js').match(/befehlVorrang/g) || []).length === 1);

    console.log('WERKSTATT-RÜCKFALL: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(2); });
