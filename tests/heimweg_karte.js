/* TESTS Heimweg-Karte: Start: node tests/heimweg_karte.js
   Automatische Karte (Wecker/angetippt) zeigt nichts, wenn schon zu Hause oder Standort unbekannt.
   Ausdrückliche Frage (Sprachbefehl) antwortet immer, ohne Standort ehrlich. */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(n, b, i) { if (b) { ok++; return; } fehler++; console.log('✗ ' + n + (i ? '  →  ' + i : '')); }
const melde = A => { try { return JSON.parse(A.store['jv_meldungen'] || '[]'); } catch (e) { return []; } };

async function lauf(route, aufruf) {
    const A = starte({ native: true, jetzt: '2026-11-05T14:41:00+01:00' });
    A.setze('homeAddress', 'Teststr. 1, Teststadt');
    A.sb.fetchRouteMapData = async () => route;
    A.sb.wachterDriveMinutes = async () => null;
    A.sb.getPosition = async () => { throw new Error('kein Standort'); };
    A.sb.openExtraWindow = function () { A.fenster = (A.fenster || 0) + 1; };
    A.fenster = 0;
    const g0 = A.gesagt.length;
    const wert = await aufruf(A);
    await A.vorspulen(1000);
    return { A, wert, gesagt: A.gesagt.slice(g0) };
}
(async () => {
    const ID = 'heim|2026-11-05';
    const auto = A => A.lassLaufen(() => A.sb.jvPlan.ansage(ID, false, true)).then(q => q.wert);
    const neu = async (route, fn) => lauf(route, async A => { const T = A.sb._schichtTest; A.store['jv_schicht'] = JSON.stringify({ base: T.weekNo({ y: 2026, m: 10, d: 5 }), shift: 'frueh', times: { frueh: 7 * 60, spaet: 12 * 60 + 45 }, auto: true }); return fn(A); });

    let r = await neu({ fahrtMin: 2, stauMin: 0 }, auto);
    check('1 schon zu Hause: keine automatische Karte', r.wert === false && r.A.fenster === 0 && melde(r.A).length === 0, JSON.stringify([r.wert, r.A.fenster, melde(r.A).length]));
    check('1b nichts gesprochen', r.gesagt.length === 0);

    r = await neu({ fahrtMin: 25, stauMin: 0 }, auto);
    check('2 unterwegs: Karte wie bisher, genau eine Meldung, nichts gesprochen', r.wert === true && r.A.fenster === 1 && melde(r.A).length === 1 && /Heimweg dauert rund 25 Minuten/.test(melde(r.A)[0].x) && r.gesagt.length === 0, JSON.stringify([r.wert, r.A.fenster, melde(r.A)]));

    r = await neu(null, auto);
    check('3 Standort unbekannt: keine Karte, keine Meldung, kein "Feierabend!"', r.wert === false && r.A.fenster === 0 && melde(r.A).length === 0 && r.gesagt.length === 0);

    r = await neu(null, A => A.lassLaufen(() => A.sb.jvPlan.ansage(ID, false, false)).then(q => q.wert));
    check('3b Wecker ohne angetippt: ebenfalls still', r.wert === false && r.A.fenster === 0 && melde(r.A).length === 0);

    r = await neu(null, async A => { await A.satz('Wie ist mein Heimweg'); return 1; });
    check('4a Sprachbefehl ohne Standort: ehrliche Antwort, kein "Feierabend!"', r.gesagt.length === 1 && /nicht berechnen/.test(r.gesagt.join(' ')) && /Standort/.test(r.gesagt.join(' ')) && !/Feierabend!/.test(r.gesagt.join(' ')), JSON.stringify(r.gesagt));
    r = await neu({ fahrtMin: 2, stauMin: 0 }, async A => { await A.satz('Heimweg'); return 1; });
    check('4b Sprachbefehl zu Hause: antwortet trotzdem', r.gesagt.length === 1 && /Heimweg dauert/.test(r.gesagt.join(' ')), JSON.stringify(r.gesagt));
    r = await neu({ fahrtMin: 25, stauMin: 0 }, async A => { await A.satz('Heimweg'); return 1; });
    check('4c Sprachbefehl unterwegs: antwortet', /25 Minuten/.test(r.gesagt.join(' ')), JSON.stringify(r.gesagt));

    r = await neu({ fahrtMin: 25, stauMin: 0 }, async A => { await auto(A); return auto(A); });
    check('5 keine doppelte Meldung bei zweitem Aufruf mit denselben Daten (je Antippen höchstens eine neue Karte, nie zwei Meldungen pro Aufruf)', melde(r.A).length <= 2 && r.A.fenster <= 2, String(melde(r.A).length));
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ Heimweg-Karte: alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
