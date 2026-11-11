/* ============================================================
   TEST: Schritt B1 "Natürliche Gespräche 2.0": Antworten früher lokaler Befehle (Schicht, Plan, Was steht an) landen im
   vorhandenen Gesprächsverlauf (chatHistory) und als Thema in jvGespraech. Start: node tests/gespraech_lokal.js
   Ganze App (echte Skripte), Attrappe für Netz und Groq. Geprüft mit getrennten Eingaben, Chef-KI EIN und AUS.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const pause = ms => new Promise(r => setTimeout(r, ms));

function neu(chef, jetzt) {
    const groq = [];   // alle Nachrichtenlisten, die an die KI gingen
    const A = starte({
        jetzt: jetzt || '2026-11-11T09:30:00+01:00', native: { planAnsagen: () => true, holeAnsage: () => '', naechsterWecker: () => 0 }, festerZufall: true, sprechenBeendet: true,
        fetch: async (u, init) => {
            if (/api\/groq/.test(String(u))) {
                let m = []; try { m = JSON.parse(init.body).messages; } catch (e) { }
                groq.push(m.map(x => String(x.content || '')));
                const last = String((m[m.length - 1] || {}).content || '');
                return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'KI-ANTWORT: ' + last.slice(0, 40), actions: [] }) } }] }) };
            }
            throw new Error('offline ' + u);
        }
    });
    const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 11, d: 9 });
    A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'spaet', times: { frueh: 225, spaet: 720 }, auto: true }));
    A.sb.jvPlan.setBeginn('spaet', 13 * 60 + 45);
    A.store['jv_plan_fahrt'] = JSON.stringify([{ min: 22, at: Date.now() }]);
    A.setze('workAddress', 'Neu-Galliner-Ring 6, 21493 Schwarzenbek');
    if (chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
    A.groq = groq;
    A.sage = async s => { const g0 = A.gesagt.length; A.sb.jvTippen(s); await pause(250); for (let i = 0; i < 15; i++) { if (A.lassLaufen) await A.lassLaufen(100); await pause(15); } return A.gesagt.slice(g0).join(' | '); };
    A.verlauf = () => A.lese('chatHistory');
    return A;
}
const text = v => v.map(x => String(x.content)).join('\n');

(async () => {
    for (const chef of [false, true]) {
        const k = chef ? 'Chef EIN: ' : 'Chef AUS: ';
        {   // 1. Schicht-Fall mit getrennten Eingaben
            const A = neu(chef);
            const n0 = A.verlauf().length;
            const a1 = await A.sage('Welche Schicht habe ich morgen?');
            check(k + '1a lokale Schichtantwort kommt (ohne KI)', /Schicht|Spät|Früh/i.test(a1) && A.groq.length === 0, a1 + ' groq=' + A.groq.length);
            const v1 = A.verlauf();
            check(k + '1b genau ein Frage-Antwort-Paar im Verlauf', v1.length === n0 + 2 && v1[n0].role === 'user' && /Welche Schicht habe ich morgen/.test(v1[n0].content) && v1[n0 + 1].role === 'assistant', JSON.stringify(v1.slice(n0)));
            check(k + '1c Antwort im Verlauf ist die gesprochene', v1[n0 + 1] && JSON.parse(v1[n0 + 1].content).reply.length > 5 && a1.indexOf(JSON.parse(v1[n0 + 1].content).reply.slice(0, 20)) >= 0, v1[n0 + 1] && v1[n0 + 1].content);
            const th = A.sb.jvKontext && A.sb.jvKontext.thema();
            check(k + '1d Thema "arbeit" für die nächste Frage', th && th.name === 'arbeit', JSON.stringify(th));
            const a2 = await A.sage('Wann sollte ich losfahren?');
            const alles = A.groq.length ? A.groq[A.groq.length - 1].join('\n') : '';
            if (A.groq.length) check(k + '1e geht die Folgefrage an die KI, sieht sie die Schicht-Antwort im Verlauf', /Welche Schicht habe ich morgen/.test(alles) && /Wann sollte ich losfahren/.test(alles), alles.slice(0, 300));
            else check(k + '1e Folgefrage wird lokal beantwortet', a2.length > 3, a2);
            check(k + '1f keine doppelten Einträge der ersten Runde', text(A.verlauf()).split('Welche Schicht habe ich morgen?').length - 1 === 1);
        }
        {   // 2. Themenwechsel
            const A = neu(chef);
            await A.sage('Welche Schicht habe ich morgen?');
            check(k + '2a Thema arbeit gesetzt', (A.sb.jvKontext.thema() || {}).name === 'arbeit');
            await A.sage('Erzähl mir einen Witz über Katzen');
            check(k + '2b nach Themenwechsel gilt arbeit nicht mehr', A.sb.jvKontext.thema() === null, JSON.stringify(A.sb.jvKontext.thema()));
        }
        {   // 3. Zwischensatz ohne Antwort in den Verlauf: altes Thema gilt nur für den unmittelbar nächsten Satz
            const A = neu(chef);
            await A.sage('Welche Schicht habe ich morgen?');
            A.sb.jvKontext.eingang(); A.sb.jvKontext.eingang();
            check(k + '3 nach zwei weiteren Sätzen ist das Thema abgelaufen', A.sb.jvKontext.thema() === null);
        }
    }
    {   // 4. Aufbruchszeit (Arbeit) trägt Tag ein; Was steht an → Thema "tag"
        const A = neu(false);
        const n0 = A.verlauf().length;
        const a = await A.sage('Wann muss ich zur Arbeit losfahren?');
        const th = A.sb.jvKontext.thema();
        check('4a Aufbruchszeit wird beantwortet', a.length > 5, a);
        check('4b Aufbruchszeit: ein Paar im Verlauf, Thema arbeit mit Tag', A.verlauf().length === n0 + 2 && th && th.name === 'arbeit' && /^\d{4}-\d\d-\d\d$/.test(String(th.daten.tag)), JSON.stringify(th) + ' ' + (A.verlauf().length - n0));
        const B = neu(false);
        B.lese('calendarEntries').push({ id: 1, text: 'Zahnarzt', date: '11.11.2026', isoDate: '2026-11-11', location: '' });
        const b0 = B.verlauf().length;
        const b = await B.sage('Was steht heute an?');
        check('4c Was steht an: Antwort im Verlauf, Thema tag', B.verlauf().length === b0 + 2 && (B.sb.jvKontext.thema() || {}).name === 'tag' && /Zahnarzt/.test(b), b + ' ' + JSON.stringify(B.sb.jvKontext.thema()));
    }
    {   // 5. Schutz: Rückfragen, Sprechen ohne Anfrage, leere Antworten, Wiederholung
        const A = neu(false);
        const n0 = A.verlauf().length, K = A.sb.jvKontext;
        check('5a Rückfrage wird nicht eingetragen', K.merke('Wetter', 'Für welchen Ort?', { name: 'arbeit' }) === false && A.verlauf().length === n0);
        check('5b leere Antwort wird nicht eingetragen', K.merke('Frage', '  ') === false && A.verlauf().length === n0);
        try { A.sb.speak('Erinnerung: Zahnarzt in einer Stunde.'); } catch (e) { }
        await pause(50);
        check('5c Ansage von selbst (speak) landet nicht im Verlauf', A.verlauf().length === n0, JSON.stringify(A.verlauf().slice(n0)));
        check('5d gültiger Eintrag wird genau einmal eingetragen', K.merke('Was ist los', 'Alles ruhig.', { name: 'tag' }) === true && A.verlauf().length === n0 + 2);
        K.merke('Was ist los', 'Alles ruhig.', { name: 'tag' });
        check('5e identische Wiederholung direkt danach doppelt nicht', A.verlauf().length === n0 + 2, String(A.verlauf().length - n0));
        const th = K.thema();
        check('5f Thema enthält nur einfache Werte (kein Verlaufstext)', th && Object.keys(th.daten).every(x => ['string', 'number', 'boolean'].includes(typeof th.daten[x])), JSON.stringify(th));
    }
    {   // 6. Bestehende Wege: normale KI-Frage ohne lokalen Befehl bleibt unverändert (ein Paar, kein Thema)
        const A = neu(false);
        const n0 = A.verlauf().length;
        await A.sage('Erzähl mir einen Witz über Katzen');
        check('6 Frage ohne lokalen Treffer: KI-Weg unverändert (kein Thema arbeit)', A.sb.jvKontext.thema() === null && A.verlauf().length >= n0 + 2, String(A.verlauf().length - n0));
    }
    {   // 7. Ansagen von selbst (Briefing, Wächter, Aufbruchszeit) warten, solange du mit Jarvis sprichst
        const A = neu(false, '2026-11-11T11:59:20+01:00');
        let briefings = 0;
        A.sb.triggerDailyBriefing = function () { briefings++; };
        const K = A.sb.jvKontext;
        check('7a ohne Gespräch ist niemand "aktiv"', K.aktiv() === false);
        await A.sage('Welche Schicht habe ich morgen?');
        check('7b direkt nach einem Satz ist das Gespräch aktiv', K.aktiv() === true);
        check('7c Wächter und Planer gelten dann nicht als frei (wachterIdle)', A.sb.wachterIdle() === false);
        await A.vorspulen(60000);   // 12:00:xx: Briefing-Zeit der Spätschicht, aber der letzte Satz ist erst rund eine Minute her
        check('7d um 12:00 kommt das Briefing nicht mitten ins Gespräch', briefings === 0, String(briefings));
        await A.vorspulen(150000);
        check('7e danach kommt es nach (nicht verloren), genau einmal', briefings === 1 && K.aktiv() === false, String(briefings));
        const B = neu(false, '2026-11-11T11:59:20+01:00');
        let b2 = 0; B.sb.triggerDailyBriefing = function () { b2++; };
        await B.vorspulen(70000);
        check('7f ohne Gespräch kommt das Briefing wie bisher pünktlich', b2 === 1, String(b2));
    }
    console.log(fehler ? 'FEHLER: ' + fehler + ' (ok ' + ok + ')' : 'alles ok (' + ok + ' Prüfungen)');
    process.exit(fehler ? 1 : 0);
})();
