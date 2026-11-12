/* ============================================================
   TEST: Stopp-Hören (js/stopp_hoeren.js): nur Handy-App, nur während Jarvis spricht, nur ganze Stoppwort-Äußerungen.
   Start: node tests/stopp_hoeren.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
(async () => {
    const aufrufe = [];
    const nat = new Proxy({}, { get: (t, k) => (...a) => { aufrufe.push(k + (a.length ? ':' + a.join(',') : '')); return k === 'schlafStand' ? JSON.stringify({ an: false }) : (k === 'wissenListe' ? '' : (k === 'vertretungStand' ? JSON.stringify({ an: false, minuten: 5 }) : '')); } });
    const A = starte({ jetzt: '2026-11-12T10:00:00+01:00', festerZufall: true, native: nat, echtesSpeak: true, fetch: async u => { throw new Error('offline ' + u); } });
    const J = A.sb.jvStopp;
    check('1a Modul da', !!J);
    for (const s of ['Stopp', 'Stopp!', 'Warte mal kurz', 'Moment', 'Moment mal kurz', 'Hör auf', 'Hör bitte auf', 'Halt', 'Sei still', 'Das reicht', 'Ja warte']) check('2 Stoppwort: ' + s, J.istStopp(s) === true);
    for (const s of ['Wie wird das Wetter morgen', 'Warte, ich muss noch Milch kaufen und dann zur Arbeit fahren', 'Der Moment ist gekommen, dass ich dir etwas sage', 'Ich höre auf dich', '', 'Stopp die Zeit und mach alles aus was du kannst']) check('3 kein Stoppwort: ' + s, J.istStopp(s) === false);
    check('4a Standard AUS', J.istAn() === false);
    aufrufe.length = 0;
    J.tick(); await warte(5);
    check('4b aus: Erkennung wird nicht gestartet', !aufrufe.some(x => /^recStart/.test(x)), JSON.stringify(aufrufe));
    await A.lassLaufen(async () => { A.sb.jvTippen('Stopp-Hören an'); await warte(80); });
    check('5a Schalter an', J.istAn() === true);
    /* Jarvis spricht: Erkennung startet erst nach der Mindestdauer */
    A.sb.isSpeaking = () => true;
    aufrufe.length = 0;
    J.tick(); await warte(3);
    check('5b nicht sofort (Mindestdauer)', !aufrufe.some(x => /^recStart/.test(x)), JSON.stringify(aufrufe));
    await A.vorspulen(1500); J.tick(); await warte(3);
    check('5c nach der Mindestdauer: Deutsch, ein Durchgang', aufrufe.filter(x => /^recStart:de-DE/.test(x)).length === 1, JSON.stringify(aufrufe));
    check('5d aktiv', J._aktiv() === true);
    /* langer Satz (zum Beispiel Jarvis' eigene Stimme): nichts passiert */
    let unterbrochen = 0; A.sb.interruptSpeaking = () => { unterbrochen++; };
    A.sb.__zaneRec('result', [{ t: 'Das Wetter morgen wird ziemlich sonnig und warm', c: 0.9 }]);
    check('6a langer Satz löst nichts aus', unterbrochen === 0);
    A.sb.__zaneRec('result', [{ t: 'Warte mal kurz', c: 0.9 }]);
    check('6b Stoppwort unterbricht Jarvis', unterbrochen === 1);
    check('6c Erkennung beendet', J._aktiv() === false && aufrufe.includes('recAbort'), JSON.stringify(aufrufe));
    /* Jarvis fertig: unsere Erkennung wird beendet */
    await A.vorspulen(600);
    A.sb.isSpeaking = () => false; J.tick();
    check('7 nach dem Sprechen nicht aktiv', J._aktiv() === false);
    /* aus */
    await A.lassLaufen(async () => { A.sb.jvTippen('Stopp-Hören aus'); await warte(80); });
    check('8 aus', J.istAn() === false);
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
