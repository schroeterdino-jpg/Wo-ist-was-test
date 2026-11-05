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
    const st = { overpass: 'ok', places: 'ok', nbGoogle: 'aus', ort: 'ok', calls: { overpass: 0, places: 0, public: 0, groq: 0, ent: 0, nb: 0 } };
    const A = starte({ jetzt: '2026-11-05T10:00:00+01:00', festerZufall: true, spracherkennung: !opt.native, native: opt.native, fetch: async (u, o) => {
        u = String(u);
        if (/api\/overpass/.test(u)) {
            st.calls.overpass++;
            if (st.overpass === 'fehler') return { ok: false, status: 502, json: async () => ({}) };
            return ant({ elements: st.overpass === 'leer' ? [] : EL });
        }
        if (/overpass/.test(u)) { st.calls.public++; if (st.overpass === 'fehler') throw new Error('offline'); return ant({ elements: st.overpass === 'leer' ? [] : EL }); }
        if (/action=places/.test(u) && /kanal=orte/.test(u)) {   // Google-Anfrage der alten Orte-Suche (nearbymore.js): Standard AUS, damit die Rückfall-Tests unten den Weg über die Kartendaten prüfen
            st.calls.nb++;
            if (st.nbGoogle === 'ok') return ant({ places: [{ name: 'Nah Google', street: 'Marktstr.', housenumber: '2', city: 'Schwarzenbek', lat: 53.502, lon: 10.1, openNow: true, until: '18:00' }, { name: 'Weit Google', street: 'Ringstr.', housenumber: '9', lat: 53.55, lon: 10.2, openNow: false, opensAt: '08:00' }] });
            if (st.nbGoogle === 'leer') return ant({ places: [] });
            if (st.nbGoogle === 'haengt') { await new Promise(r => { st.frei = r; }); return ant({ places: [{ name: 'Spaet Google', street: 'Lange Str.', housenumber: '1', lat: 53.503, lon: 10.1, openNow: true }] }); }
            return { ok: false, status: 500, json: async () => ({}) };
        }
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

    /* 12: Tempo (Google Places zuerst, Rückfall auf die Kartendaten, Zeitmessung, Zwischenansage, Standortfehler) */
    const APO = 'Wo ist die nächste Apotheke?';
    { const A = umgebung(); A.st.nbGoogle = 'ok'; const g = await tippen(A, APO);
      check('12a Apotheke: Google zuerst -> eine Antwort mit dem nächsten Treffer, keine Kartendaten-Anfrage, keine Ortssuche-Anfrage', g.length === 1 && /Die nächste Apotheke: Nah Google/.test(g[0]) && /geöffnet bis/.test(g[0]) && A.st.calls.nb === 1 && A.st.calls.overpass === 0 && A.st.calls.public === 0 && A.st.calls.places === 0, JSON.stringify({ g, c: A.st.calls }));
      check('12a2 genau EINE Google-Anfrage (ein Umkreis statt zwei Runden), Karten zeigen beide Treffer', A.karten.length >= 1 && A.karten[A.karten.length - 1].length === 2, JSON.stringify(A.karten.map(k => k.length))); }
    { const A = umgebung(); A.st.nbGoogle = 'leer'; const g = await tippen(A, APO);
      check('12b Google ohne Treffer -> bisheriger Weg über die Kartendaten antwortet, genau eine Antwort', g.length === 1 && /Kfz Meier/.test(g[0]) && A.st.calls.nb === 1 && A.st.calls.overpass >= 1, JSON.stringify({ g, c: A.st.calls })); }
    { const A = umgebung(); A.st.nbGoogle = 'aus'; const g = await tippen(A, APO);
      check('12c Google fällt aus (Fehler/Limit) -> Kartendaten wie bisher', g.length === 1 && /Kfz Meier/.test(g[0]) && A.st.calls.overpass >= 1, JSON.stringify({ g, c: A.st.calls })); }
    { const A = umgebung(); A.st.nbGoogle = 'ok'; const g = await tippen(A, 'Wo ist die nächste Toilette?');
      check('12d Toilette bleibt bei den Kartendaten (keine Google-Anfrage)', g.length === 1 && A.st.calls.nb === 0 && A.st.calls.overpass >= 1, JSON.stringify({ g, c: A.st.calls })); }
    { const A = umgebung(); A.st.nbGoogle = 'ok'; await tippen(A, APO);
      const z = A.sb.jvOrtZeiten.liste();
      check('12e Zeitmessung: ein Eintrag, nur Zahlen/Art, Quelle google, Ergebnis Treffer', z.length === 1 && z[0].quelle === 'google' && z[0].ergebnis === 'treffer' && typeof z[0].pos === 'number' && typeof z[0].google === 'number' && z[0].osm === null && typeof z[0].gesamt === 'number' && z[0].kat === 'Apotheke' && Object.keys(z[0]).sort().join() === ['ack', 'gesamt', 'google', 'kat', 'nr', 'osm', 'pos', 'quelle', 'runden', 'ergebnis', 'zeit'].sort().join(), JSON.stringify(z)); }
    { const A = umgebung({ keinStandort: true }); A.st.nbGoogle = 'ok'; const g = await tippen(A, APO);
      check('12f Standort nicht erlaubt: klare Meldung, keine Anfrage', g.length === 1 && /nicht erlaubt/.test(g[0]) && A.st.calls.nb === 0 && A.st.calls.overpass === 0 && A.sb.jvOrtZeiten.liste()[0].ergebnis === 'standort', JSON.stringify({ g, c: A.st.calls })); }
    { const A = umgebung(); A.st.nbGoogle = 'ok'; const acks = []; A.sb.speakAck = (t, cb) => { acks.push(t); if (cb) cb(); };
      await tippen(A, APO); await A.vorspulen(6000);
      check('12g schnelle Suche: keine Zwischenansage', acks.length === 0, JSON.stringify(acks)); }
    { const A = umgebung(); A.st.nbGoogle = 'haengt'; const acks = []; A.sb.speakAck = (t, cb) => { acks.push(t); if (cb) cb(); };
      A.sb.jvTippen(APO); await warte(40); await A.vorspulen(2000);
      check('12h lange Suche: nach 2 s weder Antwort noch Zwischenansage', A.gesagt.length === 0 && acks.length === 0, JSON.stringify({ g: A.gesagt, acks }));
      await A.vorspulen(2500);
      check('12h2 nach 4,5 s: genau EINE kurze Zwischenansage, noch keine Ergebnisantwort', acks.length === 1 && /ich suche noch/.test(acks[0]) && A.gesagt.filter(x => /Spaet Google/.test(String(x))).length === 0, JSON.stringify({ acks, g: A.gesagt }));
      const g0 = A.gesagt.length; A.st.frei && A.st.frei(); await warte(60); await A.vorspulen(100); await warte(60);
      const g2 = A.gesagt.slice(g0);
      check('12h3 danach genau EINE Ergebnisantwort (keine doppelte), Zwischenansage nicht wiederholt', g2.length === 1 && /Spaet Google/.test(g2[0]) && acks.length === 1, JSON.stringify({ g2, acks }));
      check('12h4 Messung vermerkt die Zwischenansage', A.sb.jvOrtZeiten.liste().length === 1 && A.sb.jvOrtZeiten.liste()[0].ack === true, JSON.stringify(A.sb.jvOrtZeiten.liste())); }

    /* Statisch: nur die freigegebenen Stellen */
    const nm = lies('js/nearbymore.js');
    check('11a nearbymore.js: genau zwei Übergabestellen (Fehler, kein Treffer), nicht beim Standortfehler', (nm.match(/plUebergabe\(originalText\)/g) || []).length === 2 && /M\.ergebnis = 'standort';\s*await say\(e && e\.code === 1/.test(nm) && !/M\.ergebnis = 'standort';[^}]*plUebergabe/.test(nm));
    check('11b Übergabe nur mit Chef-KI AN, nur über window.handleOrtsucheCommand, höchstens einmal je Anfrage', /istAn\(\)\)\) return false/.test(nm.replace(/\s+/g, ' ').replace('!window.jvChef.istAn()) return false', 'istAn())) return false')) && /window\.handleOrtsucheCommand\(text\)/.test(nm) && (nm.match(/!uebergeben && \(uebergeben = true\)/g) || []).length === 2);
    check('11c voice.js unverändert (kein Umbau)', (lies('js/voice.js').match(/befehlVorrang/g) || []).length === 1);

    console.log('WERKSTATT-RÜCKFALL: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(2); });
