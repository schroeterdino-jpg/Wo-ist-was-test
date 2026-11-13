/* ============================================================
   TESTS: Urlaub mit Wochen und Wochentagen setzen (js/urlaub.js). Start: node tests/urlaub_woche.js
   Heute = Samstag 14.11.2026. Läuft mit und ohne Chef-KI (der feste Befehl hat Vorrang).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const JETZT = '2026-11-14T10:00:00+01:00';
async function sage(text, chef) {
    const A = starte({ jetzt: JETZT, festerZufall: true, chefStandard: true, fetch: async u => { throw new Error('offline ' + u); } });
    if (chef === false) A.sb.jvChef.aus();
    const g0 = A.gesagt.length;
    const x = await A.lassLaufen(() => A.sb.handleLocalCommand(text));
    let u = null; try { u = JSON.parse(A.store['jv_urlaub'] || 'null'); } catch (e) { }
    return { behandelt: x.wert === true, u, text: A.gesagt.slice(g0).join(' | ') };
}
const FAELLE = [
    ['Ich habe nächste Woche Urlaub', '2026-11-16', '2026-11-20'],
    ['Ich habe übernächste Woche Urlaub', '2026-11-23', '2026-11-27'],
    ['Ich habe diese Woche noch Urlaub', '2026-11-14', '2026-11-14'],
    ['Ich habe Urlaub von Montag bis Freitag', '2026-11-16', '2026-11-20'],
    ['Ich habe Urlaub bis Freitag', '2026-11-14', '2026-11-20'],
    ['Ich habe ab nächster Woche zwei Wochen Urlaub', '2026-11-16', '2026-11-29'],
    ['Ich habe ab Montag eine Woche Urlaub', '2026-11-16', '2026-11-22'],
    ['Ich bin nächste Woche im Urlaub', '2026-11-16', '2026-11-20'],
    ['Ich nehme nächsten Montag bis Mittwoch Urlaub', '2026-11-16', '2026-11-18'],
    ['Ich habe Urlaub vom 20. Dezember bis 3. Januar', '2026-12-20', '2027-01-03']
];
(async () => {
    for (const chef of [false, true]) {
        for (const [satz, von, bis] of FAELLE) {
            const r = await sage(satz, chef);
            check((chef ? 'Chef an: ' : 'Chef aus: ') + satz, r.behandelt && r.u && r.u.von === von && r.u.bis === bis, JSON.stringify(r));
        }
    }
    const k = await sage('Urlaub ist toll', false);
    check('Satz ohne Datum wird nicht als Urlaub eingetragen', !k.u, JSON.stringify(k));
    const f = await sage('Wann habe ich Urlaub', false);
    check('Frage ändert nichts', !f.u, JSON.stringify(f));
    console.log('Urlaub Woche: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})();
