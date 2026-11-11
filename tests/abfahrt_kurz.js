/* ============================================================
   TEST: Schritt B2 "Natürliche Gespräche 2.0": kurze Abfahrtsfrage ohne Ziel ("Wann sollte ich losfahren?") nutzt das Thema der Antwort davor.
   Start: node tests/abfahrt_kurz.js   Ganze App (echte Skripte), Attrappe für Netz, Groq und die Fähigkeit "abfahrt". Chef-KI EIN und AUS.
   Arbeit -> Aufbruchszeit (Tag aus der Antwort davor), Termin -> Fähigkeit "abfahrt" (Ort/Name, Uhrzeit, Tag), kein frisches Thema -> unverändert der bisherige Weg (KI mit dem Verlauf).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const pause = ms => new Promise(r => setTimeout(r, ms));

function neu(chef, termine) {
    const groq = [];
    const A = starte({
        jetzt: '2026-11-11T09:30:00+01:00', native: { planAnsagen: () => true, holeAnsage: () => '', naechsterWecker: () => 0 }, festerZufall: true, sprechenBeendet: true,
        fetch: async (u, init) => {
            if (/api\/groq/.test(String(u))) {
                let m = []; try { m = JSON.parse(init.body).messages; } catch (e) { }
                groq.push(m.map(x => String(x.content || '')));
                return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'KI-ANTWORT: Welches Ziel meinst du?', actions: [] }) } }] }) };
            }
            throw new Error('offline ' + u);
        }
    });
    const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 11, d: 9 });
    A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'spaet', times: { frueh: 225, spaet: 720 }, auto: true }));
    A.sb.jvPlan.setBeginn('spaet', 13 * 60 + 45);
    A.store['jv_plan_fahrt'] = JSON.stringify([{ min: 22, at: Date.now() }]);
    A.setze('workAddress', 'Neu-Galliner-Ring 6, 21493 Schwarzenbek');
    (termine || []).forEach(t => A.lese('calendarEntries').push(t));
    if (chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
    A.groq = groq; A.abfahrtAufrufe = [];
    const orig = A.sb.jvRegistry.fuehreAus;
    A.sb.jvRegistry.fuehreAus = async function (name, p) {
        if (name === 'abfahrt') { A.abfahrtAufrufe.push(p); return { status: 'SUCCESS', nachricht: 'Du musst um 13 Uhr 05 losfahren, um um ' + p.ankunft + ' bei ' + p.ziel + ' zu sein.' }; }
        return orig.apply(this, arguments);
    };
    A.sage = async s => { const g0 = A.gesagt.length; A.sb.jvTippen(s); await pause(250); for (let i = 0; i < 15; i++) { if (A.lassLaufen) await A.lassLaufen(100); await pause(15); } return A.gesagt.slice(g0).join(' | '); };
    A.verlauf = () => A.lese('chatHistory');
    return A;
}
const ZAHNARZT = { id: 7, text: 'Zahnarzt', date: '11.11.2026', isoDate: '2026-11-11T14:30:00+01:00', location: 'Hauptstraße 5, Schwarzenbek' };

(async () => {
    for (const chef of [false, true]) {
        const k = chef ? 'Chef EIN: ' : 'Chef AUS: ';
        {   // 1. Arbeit: Schicht morgen -> losfahren
            const A = neu(chef);
            const a1 = await A.sage('Welche Schicht habe ich morgen?');
            check(k + '1a Schicht-Antwort kommt', /Spät/.test(a1), a1);
            const a2 = await A.sage('Wann sollte ich losfahren?');
            check(k + '1b Folgefrage wird lokal beantwortet (keine KI, keine Ziel-Rückfrage)', A.groq.length === 0 && !/Welches Ziel|Wohin/.test(a2) && /\d/.test(a2), a2 + ' groq=' + A.groq.length);
            check(k + '1c die Antwort gilt für MORGEN (nicht heute)', /morgen|Donnerstag/i.test(a2) || (A.abfahrtAufrufe.length === 0 && /Spät|13|12/.test(a2)), a2);
            const v = A.verlauf();
            check(k + '1d beide Paare im Verlauf, kein Doppelter', v.filter(m => m.role === 'user' && /Wann sollte ich losfahren/.test(m.content)).length === 1, JSON.stringify(v.slice(-4)));
        }
        {   // 2. Termin: Zahnarzt -> losfahren
            const A = neu(chef, [ZAHNARZT]);
            const a1 = await A.sage('Was steht heute an?');
            check(k + '2a Termin wird genannt', /Zahnarzt/.test(a1), a1);
            const a2 = await A.sage('Wann sollte ich losfahren?');
            check(k + '2b Fähigkeit "abfahrt" mit Ort, Uhrzeit und Tag des Termins', A.abfahrtAufrufe.length === 1 && A.abfahrtAufrufe[0].ankunft === '14:30' && /Hauptstraße 5/.test(A.abfahrtAufrufe[0].ziel) && A.abfahrtAufrufe[0].tag === '2026-11-11', JSON.stringify(A.abfahrtAufrufe));
            check(k + '2c gesprochen wird die Abfahrtsantwort, keine KI', /losfahren/.test(a2) && A.groq.length === 0, a2);
        }
        {   // 3. Kein frisches Thema -> bisheriger Weg (KI), nichts wird geraten
            const A = neu(chef);
            const a = await A.sage('Wann sollte ich losfahren?');
            check(k + '3 ohne Thema geht die Frage unverändert an die KI (nichts wird geraten)', A.groq.length >= 1 && A.abfahrtAufrufe.length === 0 && !/Spätschicht|Fahr gegen/.test(a), a + ' groq=' + A.groq.length);
        }
        {   // 4. Themenwechsel dazwischen -> altes Thema gilt nicht mehr
            const A = neu(chef);
            await A.sage('Welche Schicht habe ich morgen?');
            await A.sage('Erzähl mir einen Witz über Katzen');
            const g0 = A.groq.length;
            const a = await A.sage('Wann sollte ich losfahren?');
            check(k + '4 nach Themenwechsel wird nicht mehr die Arbeit angenommen (Frage geht an die KI)', A.groq.length > g0 && !/Spätschicht|Fahr gegen/.test(a), a);
        }
    }
    {   // 5. Varianten der Frage
        for (const satz of ['Und wann muss ich dann los?', 'Wann fahre ich los?', 'Wann soll ich aufbrechen?', 'Wann sollte ich losfahren']) {
            const A = neu(false, [ZAHNARZT]);
            await A.sage('Was steht heute an?');
            await A.sage(satz);
            check('5 Variante "' + satz + '" nutzt den Termin', A.abfahrtAufrufe.length === 1, JSON.stringify(A.abfahrtAufrufe));
        }
        for (const satz of ['Wann kommt der Bus?', 'Wann sollte ich schlafen gehen?', 'Wann soll ich losfahren nach Hamburg?']) {
            const A = neu(false, [ZAHNARZT]);
            await A.sage('Was steht heute an?');
            await A.sage(satz);
            check('5 "' + satz + '" ist KEINE kurze Abfahrtsfrage ohne Ziel', A.abfahrtAufrufe.length === 0);
        }
    }
    {   // 6. Termin schon vorbei / ohne Uhrzeit: nicht raten
        const A = neu(false, [{ id: 8, text: 'Frühstück', date: '11.11.2026', isoDate: '2026-11-11T08:00:00+01:00', location: '' }]);
        await A.sage('Was steht heute an?');
        await A.sage('Wann sollte ich losfahren?');
        check('6 vorbeigegangener Termin wird nicht für die Abfahrt benutzt', A.abfahrtAufrufe.length === 0);
    }
    {   // 7. Termin ohne Ort: Name als Ziel (Zahnarzt wird von der Fähigkeit nachgeschlagen)
        const A = neu(false, [{ id: 9, text: 'Zahnarzt', date: '11.11.2026', isoDate: '2026-11-11T15:00:00+01:00', location: '' }]);
        await A.sage('Was steht heute an?');
        await A.sage('Wann sollte ich losfahren?');
        check('7 ohne Ort wird der Name des Termins als Ziel genommen', A.abfahrtAufrufe.length === 1 && A.abfahrtAufrufe[0].ziel === 'Zahnarzt' && A.abfahrtAufrufe[0].ankunft === '15:00', JSON.stringify(A.abfahrtAufrufe));
    }
    console.log(fehler ? 'FEHLER: ' + fehler + ' (ok ' + ok + ')' : 'alles ok (' + ok + ' Prüfungen)');
    process.exit(fehler ? 1 : 0);
})();
