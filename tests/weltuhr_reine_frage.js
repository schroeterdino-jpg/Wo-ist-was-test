/* ============================================================
   TEST: Weltuhr antwortet nur auf reine Uhrzeitfragen (Umbau: kein Satzteil geht verloren).
   "Wie spät ist es in Tokio und was kostet ein Fernseher" darf NICHT nur die Uhrzeit beantworten. Start: node tests/weltuhr_reine_frage.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
(async () => {
    const gespr = [], st = { planer: 0, normal: 0 };
    const plan = { absicht: 'x', schritte: [{ faehigkeit: 'uhrzeit_anderswo', params: { ort: 'Tokio' } }, { faehigkeit: 'produktsuche', params: { suchbegriff: 'Fernseher' } }] };
    const A = starte({ jetzt: '2026-11-12T11:13:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true,
        nachSkript: (f, sb) => { if (f === 'voice.js') sb.speak = function (t) { gespr.push(String(t)); return Promise.resolve(); }; },
        fetch: async (u, o) => {
            if (/api\/groq/.test(String(u))) {
                const b = JSON.parse(o.body), sys = (b.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
                if (/Du planst für einen Sprachassistenten/.test(sys)) { st.planer++; return ant({ choices: [{ message: { content: JSON.stringify(plan) } }] }); }
                st.normal++; return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Normale KI.', actions: [] }) } }] });
            }
            throw new Error('offline ' + u);
        } });
    A.vorspulen(2000);
    const W = A.sb.handleWeltzeitCommand;
    const gesagt = t => { gespr.length = 0; const r = W(t); return { r, gespr: gespr.slice() }; };
    let x = gesagt('Wie spät ist es in Tokio');
    check('1a reine Uhrzeitfrage wird beantwortet', x.r === true && /Tokio/.test(x.gespr.join(' ')), JSON.stringify(x));
    x = gesagt('Wie spät ist es in Tokio und wie spät ist es in New York');
    check('1b zwei Zeitfragen werden weiter zusammen beantwortet', x.r === true && /Tokio/.test(x.gespr.join(' ')) && /New York/.test(x.gespr.join(' ')), JSON.stringify(x));
    x = gesagt('Zeitunterschied nach Tokio');
    check('1c Zeitunterschied bleibt eine reine Frage', x.r === true, JSON.stringify(x));
    x = gesagt('Wie spät ist es in Tokio und was kostet ein Fernseher');
    check('2a Uhrzeit plus fremde Frage: Weltuhr antwortet NICHT allein', x.r === false && x.gespr.length === 0, JSON.stringify(x));
    x = gesagt('Wie spät ist es in Tokio und wie wird morgen das Wetter');
    check('2b Uhrzeit plus Wetter: Weltuhr lässt den Satz weiter', x.r === false, JSON.stringify(x));
    x = gesagt('Wie spät ist es in Tokio und wie spät ist es in New York und was kostet ein Fernseher');
    check('2c zwei Zeitfragen plus fremde Frage: nichts halb beantwortet', x.r === false && x.gespr.length === 0, JSON.stringify(x));
    // Ganzer Weg mit eingeschalteter Chef-KI: beide Teile werden beantwortet
    A.sb.jvChef.an(); gespr.length = 0;
    await A.lassLaufen(async () => { A.sb.jvTippen('Wie spät ist es in Tokio und was kostet ein Fernseher'); await warte(120); });
    await A.lassLaufen(async () => { await warte(120); });
    check('3a Chef-KI wird gefragt (Planer), nicht die Weltuhr allein', st.planer >= 1, JSON.stringify(st));
    check('3b Uhrzeit in Tokio UND der Preisteil kommen in der Antwort vor (im Test ohne Netz: ehrlich "Produktsuche hat nicht geklappt")', gespr.join(' ').includes('Tokio') && /Produktsuche|Fernseher|Preis/i.test(gespr.join(' ')), JSON.stringify(gespr));
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
