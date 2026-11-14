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
    /* ---------- Kalender: Eintrag anlegen, merken, wieder löschen ---------- */
    const pause = ms => new Promise(r => setTimeout(r, ms));
    async function kal(sc) {
        const A = starte({ jetzt: JETZT, festerZufall: true, chefStandard: true, fetch: async u => { throw new Error('offline ' + u); } });
        const neu = [], weg = []; let n = 0;
        A.sb.__neu = neu; A.sb.__weg = weg; A.sb.__sc = sc;
        A.vm.runInContext("addGoogleCalendarEvent = async function () { __neu.push(Array.from(arguments)); if (__sc.google === false) return false; window.jvLetzterGoogleTermin = { id: 'g' + __neu.length, text: arguments[0] }; return true; }; deleteCalendarEntry = async function (id) { __weg.push(id); return __sc.loeschOk !== false; };", A.sb);
        const sag = async t => { const g0 = A.gesagt.length; await A.lassLaufen(() => A.sb.handleLocalCommand(t)); await pause(80); return A.gesagt.slice(g0).join(' | '); };
        return { A, neu, weg, sag };
    }
    {
        const K = await kal({});
        const t1 = await K.sag('Ich habe nächste Woche Urlaub');
        check('Kalender 1: ganztägiger Termin Urlaub 🌴 vom 16. bis 20.11.', K.neu.length === 1 && K.neu[0][0] === 'Urlaub 🌴' && /^2026-11-16/.test(K.neu[0][1]) && K.neu[0][4] === true && K.neu[0][5] === '2026-11-20', JSON.stringify(K.neu));
        check('Kalender 2: Antwort nennt den Kalender, ID gemerkt', /Kalender/.test(t1) && /g1/.test(K.A.store['jv_urlaub_kal'] || ''), t1 + ' / ' + K.A.store['jv_urlaub_kal']);
        await K.sag('Ich habe übernächste Woche Urlaub');
        check('Kalender 3: neuer Urlaub löscht zuerst den alten Eintrag, gemerkt wird der neue', K.weg.join() === 'g1' && /g2/.test(K.A.store['jv_urlaub_kal'] || ''), K.weg.join() + ' / ' + K.A.store['jv_urlaub_kal']);
        const t2 = await K.sag('Urlaub beenden');
        check('Kalender 4: Urlaub beenden löscht genau den gemerkten Eintrag und sagt es', K.weg.join() === 'g1,g2' && !K.A.store['jv_urlaub_kal'] && /Kalender/.test(t2) && !K.A.store['jv_urlaub'], K.weg.join() + ' / ' + t2);
        const t3 = await K.sag('Urlaub beenden');
        check('Kalender 5: nochmal beenden löscht nichts mehr', K.weg.length === 2 && /kein Urlaub/.test(t3), t3);
    }
    {
        const K = await kal({ google: false });
        const t = await K.sag('Ich habe nächste Woche Urlaub');
        check('Kalender 6: Google nicht erreichbar: Urlaub gilt trotzdem, Antwort sagt ehrlich "nur in Jarvis", keine ID gemerkt', /nur in Jarvis/.test(t) && !K.A.store['jv_urlaub_kal'] && !!K.A.store['jv_urlaub'], t);
    }
    {
        const K = await kal({ loeschOk: false });
        await K.sag('Ich habe nächste Woche Urlaub');
        const t = await K.sag('Urlaub beenden');
        check('Kalender 7: Löschen bei Google scheitert: Urlaub in Jarvis weg, Antwort sagt, dass der Kalendereintrag selbst gelöscht werden muss', !K.A.store['jv_urlaub'] && /selbst entfernen/.test(t) && !!K.A.store['jv_urlaub_kal'], t);
    }
    console.log('Urlaub Woche: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})();
