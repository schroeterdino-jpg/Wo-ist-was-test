/* ============================================================
   TESTS: Mitnehmen-Liste im Tagesbriefing nur an einem echten Arbeitstag. Start: node tests/mitnehmen_briefing.js
   Vorher las Jarvis die Liste auch am Wochenende und im Urlaub vor (briefing.js prüfte nur, ob irgendeine Schichtangabe da ist).
   Echte Module (briefing.js, schicht.js, plan_ansagen.js, mitnehmen.js, urlaub.js), Attrappen für Netz und Wetter.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const pause = ms => new Promise(r => setTimeout(r, ms));
const LISTE = ['Zahnprothese', 'Energy Drink', 'Brotdose'];

/* jetzt: Zeitpunkt; urlaub: {von,bis}|null; beginnTag: ymd -> Minute|null; kaputt: jvPlan.schichtAm wirft */
async function briefing(jetzt, o) {
    o = o || {};
    const A = starte({ jetzt, festerZufall: true, speicher: { jv_mitnehmen: JSON.stringify(LISTE) }, fetch: async u => { throw new Error('offline ' + u); } });
    const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 10, d: 26 });   // Woche ab Montag 26.10.2026 = Spätschicht, danach Frühschicht
    A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'spaet', times: { frueh: 210, spaet: 720 }, auto: true }));
    if (o.urlaub) A.store['jv_urlaub'] = JSON.stringify(o.urlaub);
    if (o.beginnTag) A.store['jv_plan_beginn_tag_' + o.beginnTag[0]] = String(o.beginnTag[1]);
    if (o.ohnePlan) A.vm.runInContext('delete window.jvPlan.schichtAm', A.sb);
    if (o.kaputt) A.vm.runInContext('window.jvPlan.schichtAm = function () { throw new Error("kaputt"); }', A.sb);
    A.setze('fetchWeatherData', async () => null);
    const g0 = A.gesagt.length;
    await A.lassLaufen(() => A.sb.triggerDailyBriefing());
    await pause(150);
    return A.gesagt.slice(g0).join(' | ');
}
const mit = t => /Nimm mit: Zahnprothese, Energy Drink und Brotdose\./.test(t);

(async () => {
    check('1 Arbeitstag Spätschicht (Mi 28.10., 12:05): Liste wird vorgelesen', mit(await briefing('2026-10-28T12:05:00+01:00')));
    check('2 Arbeitstag Frühschicht (Mo 2.11., 3:35): Liste wird vorgelesen', mit(await briefing('2026-11-02T03:35:00+01:00')));
    const so = await briefing('2026-11-01T12:05:00+01:00');
    check('3 Sonntag in der Schichtwoche: keine Liste', !/Nimm mit/.test(so) && so.length > 0, so);
    const sa = await briefing('2026-10-31T12:05:00+01:00');
    check('4 Samstag: keine Liste', !/Nimm mit/.test(sa) && sa.length > 0, sa);
    const ur = await briefing('2026-10-28T12:05:00+01:00', { urlaub: { von: '2026-10-26', bis: '2026-10-30' } });
    check('5 Urlaubstag unter der Woche: keine Liste', !/Nimm mit/.test(ur) && ur.length > 0, ur);
    check('6 Sonderarbeit: Sonntag mit gesetztem Arbeitsbeginn → Liste wird vorgelesen', mit(await briefing('2026-11-01T12:05:00+01:00', { beginnTag: ['2026-11-01', 13 * 60 + 15] })));
    check('7 nach 15 Uhr wie bisher keine Liste (Arbeitstag)', !/Nimm mit/.test(await briefing('2026-10-28T15:30:00+01:00')));
    check('8 Fehlt die Schichtprüfung (plan_ansagen.js), bleibt das bisherige Verhalten (Liste)', mit(await briefing('2026-10-28T12:05:00+01:00', { ohnePlan: true })));
    check('9 Wirft die Schichtprüfung, bleibt das bisherige Verhalten (Liste), kein Absturz', mit(await briefing('2026-10-28T12:05:00+01:00', { kaputt: true })));
    /* manuelle Nachfrage bleibt jederzeit möglich, auch am Sonntag und im Urlaub */
    for (const [n, o] of [['Sonntag', {}], ['Urlaub', { urlaub: { von: '2026-10-26', bis: '2026-10-30' } }]]) {
        const A = starte({ jetzt: n === 'Sonntag' ? '2026-11-01T12:05:00+01:00' : '2026-10-28T12:05:00+01:00', festerZufall: true, speicher: { jv_mitnehmen: JSON.stringify(LISTE) } });
        if (o.urlaub) A.store['jv_urlaub'] = JSON.stringify(o.urlaub);
        const x = await A.satz('Was muss ich mitnehmen?');
        check('10 manuell "Was muss ich mitnehmen?" (' + n + '): Liste wird genannt', /mitnehmen/.test(x.modul || '') && mit(A.gesagt.join(' ')), x.modul + ' | ' + A.gesagt.join(' '));
    }
    /* Aufbruchsansage: unverändert, Wochenende schweigt, Arbeitstag nennt die Liste */
    {
        const A = starte({ jetzt: '2026-11-01T12:30:00+01:00', festerZufall: true, speicher: { jv_mitnehmen: JSON.stringify(LISTE) } });
        const T = A.sb._schichtTest; A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: T.weekNo({ y: 2026, m: 10, d: 26 }), shift: 'spaet', times: { frueh: 210, spaet: 720 }, auto: true }));
        check('11 Aufbruchsansage am Sonntag: keine Schicht, kein Text', A.sb.jvPlan.schichtAm('2026-11-01') === null);
        const B = starte({ jetzt: '2026-10-28T12:40:00+01:00', festerZufall: true, speicher: { jv_mitnehmen: JSON.stringify(LISTE) } });
        const T2 = B.sb._schichtTest; B.sb.setPersistentData('jv_schicht', JSON.stringify({ base: T2.weekNo({ y: 2026, m: 10, d: 26 }), shift: 'spaet', times: { frueh: 210, spaet: 720 }, auto: true }));
        check('11 Aufbruchsansage am Mittwoch: Schicht da', B.sb.jvPlan.schichtAm('2026-10-28') === 'spaet');
    }
    console.log(`MITNEHMEN-BRIEFING: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})();
