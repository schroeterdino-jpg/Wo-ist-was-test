/* ============================================================
   TEST: Korrektur (js/korrektur.js): Jarvis wird verbessert ("Das ist falsch, ...") und merkt es sich.
   Start: node tests/korrektur.js   Ganze App (echte Skripte).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };

function neu(antwort) {
    const st = { reply: antwort || 'Der erste Bundeskanzler war Willy Brandt.', prompts: [] };
    const gespr = [];
    const A = starte({ jetzt: '2026-11-11T10:00:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true, nachSkript: (f, sb) => { if (f === 'voice.js') sb.speak = function (t) { gespr.push(String(t)); }; }, fetch: async (u, o) => {
        if (/api\/groq/.test(String(u))) {
            try { const b = JSON.parse(o.body); const sys = (b.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n'); st.prompts.push(sys); } catch (e) { }
            return ant({ choices: [{ message: { content: JSON.stringify({ reply: st.reply, actions: [] }) } }] });
        }
        throw new Error('offline ' + u);
    } });
    A.st = st; A.gespr = gespr; A.sb.jvChef.aus();
    A.frag = async s => { await A.lassLaufen(async () => { A.sb.jvTippen(s); await warte(80); }); await A.lassLaufen(async () => { await warte(60); }); };
    return A;
}
(async () => {
    {   /* Korrektur mit Inhalt, direkt nach einer falschen Antwort */
        const A = neu();
        await A.frag('Wer war der erste Bundeskanzler der Bundesrepublik');
        A.gespr.length = 0;
        await A.frag('Das ist falsch, der erste Bundeskanzler war Konrad Adenauer');
        const l = A.sb.jvKorrektur.laden();
        check('1a Korrektur wird gemerkt', l.length === 1 && /Adenauer/.test(l[0].k), JSON.stringify(l));
        check('1b Frage und falsche Antwort stehen dabei', /Bundeskanzler/.test(l[0].f) && /Willy Brandt/.test(l[0].a), JSON.stringify(l));
        check('1c Jarvis bestätigt', A.gespr.some(t => /Verstanden, ich merke mir: der erste Bundeskanzler war Konrad Adenauer/.test(t)), JSON.stringify(A.gespr));
        const n0 = A.st.prompts.length;
        await A.frag('Wer war der zweite Bundeskanzler der Bundesrepublik');
        const p = A.st.prompts.slice(n0).join('\n');
        check('1d die nächste KI-Anfrage enthält die Korrektur mit Vorrang', /KORREKTUREN DES NUTZERS/.test(p) && /Adenauer/.test(p), p.slice(-300));
    }
    {   /* nur "Das ist falsch": Rückfrage, nächster Satz ist die Korrektur */
        const A = neu();
        await A.frag('Wer war der erste Bundeskanzler der Bundesrepublik');
        A.gespr.length = 0;
        await A.frag('Das ist falsch');
        check('2a Rückfrage "Was ist richtig?"', A.gespr.some(t => /Was ist richtig\?/.test(t)) && A.sb.jvKorrektur.laden().length === 0, JSON.stringify(A.gespr));
        await A.frag('Der erste Bundeskanzler war Konrad Adenauer');
        check('2b der nächste Satz wird als Korrektur gemerkt', A.sb.jvKorrektur.laden().length === 1 && /Adenauer/.test(A.sb.jvKorrektur.laden()[0].k), JSON.stringify(A.sb.jvKorrektur.laden()));
    }
    {   /* "vergiss es" nach der Rückfrage */
        const A = neu();
        await A.frag('Wer war der erste Bundeskanzler der Bundesrepublik');
        await A.frag('Stimmt nicht');
        await A.frag('lass es');
        check('3a "lass es" nach der Rückfrage: nichts gemerkt', A.sb.jvKorrektur.laden().length === 0);
    }
    {   /* Liste und Löschen */
        const A = neu();
        A.sb.jvKorrektur.merken('Hamburg liegt im Norden', 'Wo liegt Hamburg', 'im Süden');
        A.sb.jvKorrektur.merken('Mein Schichtbeginn ist 13:45', '', '');
        A.gespr.length = 0;
        await A.frag('Welche Korrekturen hast du');
        check('4a Liste wird vorgelesen', A.gespr.some(t => /2 Korrekturen/.test(t) && /13:45/.test(t)), JSON.stringify(A.gespr));
        await A.frag('Vergiss die letzte Korrektur');
        check('4b letzte Korrektur gelöscht', A.sb.jvKorrektur.laden().length === 1 && /Hamburg/.test(A.sb.jvKorrektur.laden()[0].k));
        await A.frag('Lösche alle Korrekturen');
        check('4c alle gelöscht', A.sb.jvKorrektur.laden().length === 0);
    }
    {   /* normale Sätze und fremde Befehle bleiben unberührt */
        const A = neu();
        check('5a "Das Wetter ist schön" ist keine Korrektur', A.sb.jvKorrektur.handle('Das Wetter ist heute schön') === false);
        check('5b "Falsche Antwort gegeben" (Wort falsch mitten im Satz) ist keine Korrektur', A.sb.jvKorrektur.handle('Ich habe gestern die falsche Tasche mitgenommen') === false);
        check('5c Hör-Korrektur-Befehl bleibt unberührt', A.sb.jvKorrektur.handle('Korrigiere Hamlet zu Hamiyet') === false);
        check('5d ohne Korrekturen enthält die KI-Anweisung keinen Zusatz', A.sb.jvKorrektur.promptText() === '');
    }
    {   /* Chef-KI AN (wie im echten Betrieb): die Korrektur kommt trotzdem an */
        const A = neu();
        A.sb.jvChef.an();
        await A.frag('Wer war der erste Bundeskanzler der Bundesrepublik');
        await A.frag('Das ist falsch, der erste Bundeskanzler war Konrad Adenauer und nicht Willy Brandt');
        check('6a Chef-KI an: Korrektur wird trotzdem gemerkt', A.sb.jvKorrektur.laden().length === 1, JSON.stringify([A.sb.jvKorrektur.laden(), A.gespr]));
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
