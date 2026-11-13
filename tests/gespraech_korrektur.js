/* ============================================================
   TEST: Korrekturen im Gespräch (Umbau B3): "Nein, ich meinte morgen" bekommt den letzten Plan als Hinweis,
   damit die Chef-KI dieselben Schritte mit der korrigierten Angabe liefert. Nach Schreibaktionen wird nie wiederholt.
   Start: node tests/gespraech_korrektur.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
(async () => {
    const sys = [];
    let plan = null;
    const A = starte({ jetzt: '2026-11-12T11:13:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true,
        nachSkript: (f, sb) => { if (f === 'voice.js') sb.speak = function () { return Promise.resolve(); }; },
        fetch: async (u, o) => {
            if (/api\/groq/.test(String(u))) {
                const b = JSON.parse(o.body), s = (b.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
                if (/Du planst für einen Sprachassistenten/.test(s)) { sys.push(s); return ant({ choices: [{ message: { content: JSON.stringify(plan) } }] }); }
                return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Normale KI.', actions: [] }) } }] });
            }
            throw new Error('offline ' + u);
        } });
    A.vorspulen(2000);
    A.sb.answerWithWebSearch = async () => 'Der Eiffelturm ist 330 Meter hoch.';
    A.sb.jvChef.an();
    const sag = async satz => { sys.length = 0; await A.lassLaufen(async () => { A.sb.jvTippen(satz); await warte(120); }); await A.lassLaufen(async () => { await warte(120); }); return sys[sys.length - 1] || ''; };
    const WET = t => ({ absicht: 'wetter', schritte: [{ faehigkeit: 'wetter', params: { tag: t } }] });
    plan = WET('heute');
    let s = await sag('Wie wird das Wetter heute');
    check('1 erste Frage: noch kein Korrektur-Hinweis', s && !/Dein letzter Plan/.test(s), s.slice(-200));
    plan = WET('morgen');
    s = await sag('Nein, ich meinte morgen');
    check('2a Korrektur: der Planer bekommt den letzten Plan (wetter, tag heute)', /Dein letzter Plan zu "Wie wird das Wetter heute" war: wetter \{"tag":"heute"\}/.test(s), s.slice(-400));
    check('2b der Hinweis nennt die Regel "nur die korrigierte Angabe ändern"', /KORREKTUR/.test(s) && /NUR die korrigierte Angabe/.test(s));
    s = await sag('Nein, nicht morgen, sondern übermorgen');
    check('2c Korrektur nach Korrektur: der letzte Plan ist jetzt der von "morgen"', /Dein letzter Plan zu "Nein, ich meinte morgen" war: wetter \{"tag":"morgen"\}/.test(s), s.slice(-300));
    s = await sag('Wie wird das Wetter in Hamburg übermorgen und was kostet dort ein Hotel oder soll ich lieber nach Berlin fahren');
    check('3 langer Satz (mehr als 12 Wörter) bekommt keinen Korrektur-Hinweis', s && !/Dein letzter Plan/.test(s), s.slice(-200));
    // zu alt
    plan = WET('heute');
    await sag('Wie wird das Wetter heute');
    await A.vorspulen(11 * 60 * 1000);
    s = await sag('Nein, ich meinte morgen');
    check('4 nach mehr als 10 Minuten kein Korrektur-Hinweis mehr', s && !/Dein letzter Plan/.test(s), s.slice(-200));
    // Thema vor einer Schreibaktion (Handytest 13.11.: "ich meinte 9 Uhr" nach Wetter + Erinnerung wurde als Wetter von 9 Uhr gedeutet)
    plan = { absicht: 'web', schritte: [{ faehigkeit: 'websuche', params: { frage: 'Wie hoch ist der Eiffelturm' } }] };
    await sag('Wie hoch ist der Eiffelturm');
    check('4b Vorbereitung: nach der Suche gilt ein frisches Thema', !!A.sb.jvChef.thema(), JSON.stringify(A.sb.jvChef.thema()));
    plan = { absicht: 'erinnerung', schritte: [{ faehigkeit: 'erinnerung_erstellen', params: { text: 'Milch holen', zeit: '2026-11-13T09:00:00' } }] };
    await sag('Erinnere mich morgen um 9 Uhr Milch zu holen');
    check('4c nach einer Schreibaktion gilt das Thema davor nicht mehr', A.sb.jvChef.thema() === null, JSON.stringify(A.sb.jvChef.thema()));
    // Schreibaktion: nie wiederholen
    plan = { absicht: 'erinnerung', schritte: [{ faehigkeit: 'erinnerung_erstellen', params: { text: 'Brot kaufen', zeit: '2026-11-13T08:00:00' } }] };
    await sag('Erinnere mich morgen um 8 Uhr an Brot kaufen');
    const n0 = A.lese('reminderEntries').length;
    plan = { absicht: 'frage', schritte: [], frage: 'Was soll ich ändern?' };
    s = await sag('Nein, ich meinte um 9');
    check('5a nach einer Schreibaktion: Hinweis "nichts neu anlegen, nachfragen"', /lege NICHTS neu an/.test(s) && /erinnerung_erstellen/.test(s), s.slice(-400));
    check('5b es wurde nichts doppelt angelegt', A.lese('reminderEntries').length === n0, String(A.lese('reminderEntries').length) + ' vs ' + n0);
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
