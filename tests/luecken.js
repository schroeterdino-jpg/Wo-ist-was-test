/* ============================================================
   TEST: Lückenbuch (js/luecken.js): Jarvis schreibt auf, was er nicht weiß oder nicht kann, und liest es auf Wunsch vor.
   Start: node tests/luecken.js   Ganze App (echte Skripte); die echte Sprech-Kette (echtesSpeak) nimmt die Antworten auf.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };

function neu(antwort) {
    const st = { reply: antwort || 'KI-ANTWORT' };
    const gespr = [];
    const A = starte({ jetzt: '2026-11-11T10:00:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true, nachSkript: (f, sb) => { if (f === 'voice.js') sb.speak = function (t) { gespr.push(String(t == null ? '' : t)); }; }, fetch: async (u, o) => {
        if (/api\/groq/.test(String(u))) return ant({ choices: [{ message: { content: JSON.stringify({ reply: st.reply, actions: [], kann_nicht: st.kann || undefined }) } }] });
        throw new Error('offline ' + u);
    } });
    A.st = st; A.gespr = gespr; A.sb.jvChef.aus();
    A.frag = async s => { await A.lassLaufen(async () => { A.sb.jvTippen(s); await warte(80); }); await A.lassLaufen(async () => { await warte(60); }); };
    return A;
}
(async () => {
    const L = neu().sb.jvLuecken;
    check('1a Erkennung: "Das weiß ich nicht" und "Das kann ich leider nicht" sind Lücken', L.luecke('Das weiß ich leider nicht.') && L.luecke('Das kann ich leider noch nicht.') && L.luecke('Dazu habe ich keine Informationen.'));
    check('1b normale Antworten sind keine Lücke', !L.luecke('Morgen wird es sonnig bei 8 Grad.') && !L.luecke('Der nächste Vollmond ist am 24. November.'));
    check('1c technische Aussetzer sind keine Lücke', !L.luecke('Die Fahrzeit konnte ich gerade nicht berechnen.') && !L.luecke('Ich komme gerade nicht ans Internet, das weiß ich nicht.'));
    check('1d lange Antworten: nur der Anfang zählt, spätes "kann ich nicht" mitten in einer Auskunft ist keine Lücke', !L.luecke('Der Vollmond ist am 24. November und dauert etwa eine Nacht. ' + 'x'.repeat(200) + ' Das weiß ich nicht genau.'));
    check('1e Pizza-Fall: "Leider kann ich keine Bestellung ausführen, aber ..." ist eine Lücke, auch lang', L.luecke('Leider kann ich keine Bestellung für dich ausführen, aber ich kann dir schnell ein paar gute Pizzerien in deiner Nähe heraussuchen oder die Telefonnummern bereitstellen, damit du gleich anrufen kannst.') && L.luecke('Ich kann leider nicht telefonieren.') && L.luecke('Dafür bin ich nicht in der Lage.'));
    check('1e2 Waschmaschinen-Fall: "Ich habe keinen Zugriff auf aktuelle Stromdaten deiner Waschmaschine." ist eine Lücke', L.luecke('Ich habe keinen Zugriff auf aktuelle Stromdaten deiner Waschmaschine.') && L.luecke('Dazu habe ich leider keine Informationen.') && L.luecke('Ich habe darauf keinen Zugriff.'));
    check('1f normale Sätze mit "kann ich" bleiben ohne Eintrag', !L.luecke('Gern, das kann ich für dich tun.') && !L.luecke('Klar, ich kann dir den Weg zeigen.'));
    {   /* über den echten Sprachweg */
        const A = neu('Das weiß ich leider nicht.');
        await A.frag('Wie viele Sterne hat der Himmel über Schwarzenbek');
        const l = A.sb.jvLuecken.laden();
        check('2a die Frage wird aufgeschrieben', l.length === 1 && /Sterne/.test(l[0].f) && /weiß ich/.test(l[0].a) && l[0].am === '2026-11-11', JSON.stringify(l));
        check('2b Jarvis sagt dazu, dass er es aufgeschrieben hat (in derselben Äußerung)', A.gespr.some(t => /^Das weiß ich leider nicht\. Das habe ich mir für den Ausbau aufgeschrieben\.$/.test(t)), JSON.stringify(A.gespr));
        await A.frag('Wie viele Sterne hat der Himmel über Schwarzenbek');
        check('2c dieselbe Frage wird nicht doppelt aufgeschrieben, Jarvis sagt es', A.sb.jvLuecken.laden().length === 1 && A.gespr.some(t => /schon aufgeschrieben/.test(t)), JSON.stringify(A.gespr));
        A.gespr.length = 0;
        await A.frag('Was kannst du noch nicht');
        check('2d1 die Liste wird vorgelesen', A.gespr.some(t => /aufgeschrieben/.test(t) && /Sterne/.test(t)), JSON.stringify(A.gespr));
        check('2d "Was kannst du noch nicht?" liest die Liste vor, schreibt sich selbst nicht auf', A.sb.jvLuecken.laden().length === 1);
        const kopie = A.sb.jvLuecken.kopierText();
        check('2e die Kopie enthält Frage und Antwort', /Sterne/.test(kopie) && /weiß ich/.test(kopie) && /1\./.test(kopie), kopie);
        await A.frag('Lückenbuch leeren');
        check('2f "Lückenbuch leeren" löscht die Liste', A.sb.jvLuecken.laden().length === 0);
    }
    {
        const B = neu('Morgen wird es sonnig.');
        await B.frag('Wie wird das Wetter morgen im Garten');
        check('3b keine Zusatzsätze bei normalen Antworten', B.gespr.every(t => !/Ausbau/.test(t)) && B.gespr.length >= 1, JSON.stringify(B.gespr));
        check('3a eine normale Antwort schreibt nichts auf', B.sb.jvLuecken.laden().length === 0);
    }
    {   /* KI meldet selbst "kann_nicht": gilt unabhängig von der Wortwahl */
        const C = neu('Da bin ich leider ratlos, das übersteigt meine Fähigkeiten.');
        C.st.kann = true;
        await C.frag('Wie viel Strom verbraucht meine Waschmaschine gerade');
        check('4a kann_nicht=true: aufgeschrieben, obwohl der Satz kein bekanntes Muster hat', C.sb.jvLuecken.laden().length === 1 && /Waschmaschine/.test(C.sb.jvLuecken.laden()[0].f), JSON.stringify(C.sb.jvLuecken.laden()));
        check('4b Jarvis sagt dazu, dass er es aufgeschrieben hat', C.gespr.some(t => /aufgeschrieben/.test(t)), JSON.stringify(C.gespr));
        const D = neu('Da bin ich leider ratlos, das übersteigt meine Fähigkeiten.');
        await D.frag('Wie viel Strom verbraucht meine Waschmaschine gerade');
        check('4c ohne kann_nicht und ohne bekanntes Muster: nichts aufgeschrieben', D.sb.jvLuecken.laden().length === 0);
        const E = neu('Morgen wird es sonnig.');
        E.st.kann = 'true';
        await E.frag('Wie wird das Wetter morgen im Garten');
        check('4d kann_nicht="true" (Text) zählt ebenfalls', E.sb.jvLuecken.laden().length === 1);
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
