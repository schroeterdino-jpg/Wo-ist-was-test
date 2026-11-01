/* ============================================================
   TESTS: Tagesbriefing an freien Tagen. Start: node tests/schicht_freier_tag.js
   Vorher sagte Jarvis am Wochenende "Heute hast du Spätschicht" (schicht.info() meldet die Wochen-Schicht ohne Wochentag)
   und das Auto-Briefing (schicht.tick) kam auch an freien Tagen. Echte Module, Attrappen für Netz und Wetter.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const pause = ms => new Promise(r => setTimeout(r, ms));
const LISTE = ['Zahnprothese', 'Energy Drink', 'Brotdose'];

function neu(jetzt, o) {
    o = o || {};
    const A = starte({ jetzt, festerZufall: true, speicher: { jv_mitnehmen: JSON.stringify(LISTE) }, fetch: async u => { throw new Error('offline ' + u); } });
    const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 10, d: 26 });   // Woche ab Mo 26.10.2026 = Spätschicht, danach Frühschicht
    A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'spaet', times: { frueh: 210, spaet: 720 }, auto: true }));
    if (o.urlaub) A.store['jv_urlaub'] = JSON.stringify(o.urlaub);
    if (o.beginnTag) A.store['jv_plan_beginn_tag_' + o.beginnTag[0]] = String(o.beginnTag[1]);
    A.setze('fetchWeatherData', async () => null);
    return A;
}
async function briefing(jetzt, o) {
    const A = neu(jetzt, o), g0 = A.gesagt.length;
    await A.lassLaufen(() => A.sb.triggerDailyBriefing());
    await pause(150);
    return A.gesagt.slice(g0).join(' | ');
}
/* Auto-Trigger: zählt, ob tick() das Briefing von selbst startet */
async function autoTick(jetzt, o) {
    const A = neu(jetzt, o);
    A.vm.runInContext('window.__brief = 0; window.triggerDailyBriefing = function () { window.__brief++; };', A.sb);
    await A.lassLaufen(() => A.sb._schichtTest.tick());
    return +A.vm.runInContext('window.__brief', A.sb);
}
const URLAUB = { von: '2026-10-26', bis: '2026-10-30' };
const falsch = t => /Heute hast du (Früh|Spät)schicht/.test(t) || /(Früh|Spät)schicht/.test(t);

(async () => {
    const mo = await briefing('2026-11-02T03:35:00+01:00');
    check('1 Montag Frühschicht: korrektes Arbeitsbriefing', /Heute hast du Frühschicht/.test(mo), mo);
    const mi = await briefing('2026-10-28T12:05:00+01:00');
    check('2 Mittwoch Spätschicht: korrekt', /Heute hast du Spätschicht/.test(mi), mi);
    const sa = await briefing('2026-10-31T12:05:00+01:00');
    check('3 Samstag frei: keine Schichtaussage, Briefing selbst kommt', !falsch(sa) && sa.length > 0, sa);
    const so = await briefing('2026-11-01T12:05:00+01:00');
    check('4 Sonntag frei: keine Schichtaussage, Briefing selbst kommt', !falsch(so) && so.length > 0, so);
    check('5 Samstag frei: Auto-Trigger feuert nicht', await autoTick('2026-10-31T12:05:00+01:00') === 0);
    check('6 Sonntag frei: Auto-Trigger feuert nicht', await autoTick('2026-11-01T12:05:00+01:00') === 0);
    const sa2 = await briefing('2026-10-31T12:05:00+01:00', { beginnTag: ['2026-10-31', 13 * 60 + 15] });
    check('7a Sonderarbeit Samstag mit Beginn: Arbeitstag, Schichtaussage', /Heute hast du Spätschicht/.test(sa2) && /Nimm mit/.test(sa2), sa2);
    check('7b Sonderarbeit Samstag: Auto-Trigger feuert', await autoTick('2026-10-31T12:05:00+01:00', { beginnTag: ['2026-10-31', 13 * 60 + 15] }) === 1);
    const so2 = await briefing('2026-11-01T12:05:00+01:00', { beginnTag: ['2026-11-01', 13 * 60 + 15] });
    check('8a Sonderarbeit Sonntag mit Beginn: Arbeitstag, Schichtaussage', /Heute hast du Spätschicht/.test(so2) && /Nimm mit/.test(so2), so2);
    check('8b Sonderarbeit Sonntag: Auto-Trigger feuert', await autoTick('2026-11-01T12:05:00+01:00', { beginnTag: ['2026-11-01', 13 * 60 + 15] }) === 1);
    const ur = await briefing('2026-10-28T12:05:00+01:00', { urlaub: URLAUB });
    check('9 Urlaub: keine heutige Schichtaussage', !falsch(ur), ur);
    check('10 Urlaubshinweis bleibt erhalten', /Urlaub/.test(ur), ur);
    check('10b Urlaub: Auto-Briefing mit Urlaubshinweis kommt weiterhin', await autoTick('2026-10-28T12:05:00+01:00', { urlaub: URLAUB }) === 1);
    check('11 Manuell "Briefing" am freien Sonntag funktioniert', await (async () => {
        const A = neu('2026-11-01T12:05:00+01:00'), g0 = A.gesagt.length;
        A.vm.runInContext('window.__brief = 0; var __o = window.triggerDailyBriefing; window.triggerDailyBriefing = function () { window.__brief++; return __o.apply(this, arguments); };', A.sb);
        await A.satz('Starte mein Briefing'); await pause(250);
        return +A.vm.runInContext('window.__brief', A.sb) === 1 && A.gesagt.slice(g0).join(' ').length > 0;
    })());
    {
        const A = neu('2026-11-01T12:05:00+01:00');
        await A.satz('Welche Schicht habe ich diese Woche?');
        check('12 Frage nach der Wochen-Schicht (Sonntag): Wochen-Schicht wird genannt', /Diese Woche hast du Spätschicht/.test(A.gesagt.join(' ')), A.gesagt.join(' '));
    }
    check('13 Mitnehmen (PR #327): Arbeitstag Liste, Wochenende und Urlaub nicht', /Nimm mit: Zahnprothese, Energy Drink und Brotdose\./.test(mi) && !/Nimm mit/.test(sa + so + ur));
    {
        const A = neu('2026-11-01T12:30:00+01:00'), B = neu('2026-10-28T12:40:00+01:00');
        check('14 Aufbruchsansage: Sonntag keine Schicht, Mittwoch Schicht', A.sb.jvPlan.schichtAm('2026-11-01') === null && B.sb.jvPlan.schichtAm('2026-10-28') === 'spaet');
    }
    check('15a Arbeitstag Spät: Auto-Trigger feuert wie bisher', await autoTick('2026-10-28T12:05:00+01:00') === 1);
    check('15b Arbeitstag Früh: Auto-Trigger feuert wie bisher', await autoTick('2026-11-02T03:35:00+01:00') === 1);
    check('15c Arbeitstag vor der Briefing-Zeit: kein Trigger', await autoTick('2026-10-28T11:00:00+01:00') === 0);
    {   // ohne plan_ansagen.js bleibt alles wie bisher (Fail-open)
        const A = neu('2026-11-01T12:05:00+01:00');
        A.vm.runInContext('delete window.jvPlan.schichtAm', A.sb);
        A.vm.runInContext('window.__brief = 0; window.triggerDailyBriefing = function () { window.__brief++; };', A.sb);
        await A.lassLaufen(() => A.sb._schichtTest.tick());
        check('16 Fehlt die Schichtprüfung: altes Verhalten (Trigger feuert), kein Absturz', +A.vm.runInContext('window.__brief', A.sb) === 1);
    }
    console.log(`SCHICHT-FREIER-TAG: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})();
