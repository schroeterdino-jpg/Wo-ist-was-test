/* ============================================================
   TEST: Langzeittermine ("Schulung vom 23. November bis 12. Dezember, jeden Werktag"): js/reminders.js (Zerlegung) und js/actions.js (Eintragen).
   Start: node tests/langtermin.js   Ganze App (echte Skripte); Google-Eintrag ist ersetzt, damit die Aufrufe sichtbar sind.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };

function neu(aktion) {
    const gespr = [], eintraege = [];
    const A = starte({ jetzt: '2026-11-11T10:00:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true, nachSkript: (f, sb) => { if (f === 'voice.js') sb.speak = function (t) { gespr.push(String(t)); }; }, fetch: async (u) => {
        if (/api\/groq/.test(String(u))) return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Erledigt.', actions: aktion ? [aktion] : [] }) } }] });
        throw new Error('offline ' + u);
    } });
    A.gespr = gespr; A.eintraege = eintraege; A.sb.jvChef.aus();
    A.sb.addGoogleCalendarEvent = async function () { eintraege.push(Array.from(arguments)); return true; };
    A.sb.openGoogleCalendarApp = function () { };
    A.frag = async s => { await A.lassLaufen(async () => { A.sb.jvTippen(s); await warte(80); }); await A.lassLaufen(async () => { await warte(60); }); };
    return A;
}
(async () => {
    const sb = neu().sb;
    const B = sb.langterminBloecke;
    const werk = B('2026-11-23', '2026-12-12', true).map(b => b.start + '..' + b.ende).join(' ');
    check('1a 23.11. bis 12.12. nur Werktage: drei Mo-Fr-Blöcke', werk === '2026-11-23..2026-11-27 2026-11-30..2026-12-04 2026-12-07..2026-12-11', werk);
    check('1b ohne Werktag-Wunsch: ein durchgehender Block', B('2026-11-23', '2026-12-12', false).length === 1);
    check('1c Start am Wochenende: Block beginnt erst Montag', B('2026-11-21', '2026-11-27', true)[0].start === '2026-11-23');
    const r1 = sb.langterminAusSatz('Schulung vom 23. November bis 12. Dezember jeden Tag', new Date('2026-11-11T10:00:00+01:00'));
    check('2a "vom 23. November bis 12. Dezember" wird erkannt', r1 && r1.start === '2026-11-23' && r1.ende === '2026-12-12', JSON.stringify(r1));
    const r2 = sb.langterminAusSatz('Urlaub vom 23. bis 27. November', new Date('2026-11-11T10:00:00+01:00'));
    check('2b "vom 23. bis 27. November": Monat gilt für beide', r2 && r2.start === '2026-11-23' && r2.ende === '2026-11-27', JSON.stringify(r2));
    const r3 = sb.langterminAusSatz('Kur von 28.12. bis 10.1.', new Date('2026-11-11T10:00:00+01:00'));
    check('2c Jahreswechsel: Ende liegt im Folgejahr', r3 && r3.start === '2026-12-28' && r3.ende === '2027-01-10', JSON.stringify(r3));
    check('2d Satz ohne Zeitraum: kein Treffer', sb.langterminAusSatz('Zahnarzt morgen um neun', new Date()) === null);
    check('3a "außer am Wochenende", "jeden Werktag", "Montag bis Freitag" zählen als Werktage', ['jeden Tag außer am Wochenende', 'jeden Werktag', 'von Montag bis Freitag', 'ohne Wochenende'].every(t => sb.langterminNurWerktage(t)) && !sb.langterminNurWerktage('jeden Tag'));
    {   /* KI liefert alles */
        const A = neu({ type: 'calendar', calendar_text: 'Schulung', calendar_time: '2026-11-23T09:00:00', calendar_end_date: '2026-12-12', calendar_weekdays_only: true });
        await A.frag('Trag eine Schulung vom 23. November bis 12. Dezember ein, jeden Tag außer am Wochenende');
        const e = A.eintraege;
        check('4a KI-Felder: drei ganztägige Blöcke an Google', e.length === 3 && e.every(x => x[4] === true && x[3] === null), JSON.stringify(e.map(x => [x[1], x[4], x[5]])));
        check('4b Blöcke enden Freitag', e.map(x => x[5]).join() === '2026-11-27,2026-12-04,2026-12-11', JSON.stringify(e.map(x => x[5])));
        check('4c Jarvis nennt, was er eingetragen hat', A.gespr.some(t => /drei|3 Blöcken/.test(t) && /ohne Wochenenden/.test(t)), JSON.stringify(A.gespr));
    }
    {   /* KI liefert kein Enddatum: Rückfall aus dem Satz */
        const A = neu({ type: 'calendar', calendar_text: 'Schulung', calendar_time: '2026-11-23T09:00:00' });
        await A.frag('Trag eine Schulung vom 23. November bis 12. Dezember ein, jeden Werktag');
        check('5a Rückfall aus dem Satz: drei Blöcke', A.eintraege.length === 3, JSON.stringify(A.eintraege.map(x => [x[1], x[5]])));
    }
    {   /* normaler Einzeltermin bleibt unverändert */
        const A = neu({ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: '2026-11-12T09:00:00' });
        await A.frag('Trag Zahnarzt morgen um neun ein');
        check('6a Einzeltermin: genau ein Eintrag, nicht ganztägig', A.eintraege.length === 1 && A.eintraege[0][4] !== true, JSON.stringify(A.eintraege));
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
