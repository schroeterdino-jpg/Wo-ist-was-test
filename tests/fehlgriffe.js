/* ============================================================
   TEST: Fehlgriffe aus dem Verständnis-Check (tools/verstaendnis.js): feste Befehle greifen nicht mehr falsch zu.
   Start: node tests/fehlgriffe.js   Ganze App (echte Skripte), offline. Gegenproben: die gewollten Treffer funktionieren weiter.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
(async () => {
    const A = starte({ jetzt: '2026-11-11T10:00:00+01:00', festerZufall: true, spracherkennung: true, fetch: async () => ({ ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'KI', actions: [] }) } }] }) }) });
    try { A.sb.jvChef.aus(); } catch (e) { }
    const wer = async t => A.satz(t);
    /* 1 "los" in "fahre ich los" ist keine Weltnachricht (der Satz wurde still verschluckt) */
    for (const t of ['Um wie viel Uhr fahre ich heute los', 'Sag mal, um wie viel Uhr fahre ich heute los', 'Wann muss ich morgen los']) {
        const r = await wer(t);
        check('1 "' + t + '" wird nicht von der Weltnachrichten-Erkennung verschluckt', !(r.lokal && /Basis/.test(String(r.modul)) && !r.gesagt.length), JSON.stringify([r.lokal, r.modul, r.gesagt]));
    }
    check('1b Gegenprobe: "Was ist gerade in Spanien los" bleibt ein Weltbefehl', (await wer('Was ist gerade in Spanien los')).lokal === true);
    /* 2 WhatsApp-Nachricht ist kein "Teilen" */
    for (const t of ['Sag Isabel per WhatsApp gute Nacht', 'Schick Mama eine Nachricht per WhatsApp ich komme später']) {
        const r = await wer(t);
        check('2 "' + t + '" wird nicht als Weiterleiten behandelt', r.modul !== 'teilen', r.modul);
    }
    check('2b Gegenprobe: "Teile die Einkaufsliste per WhatsApp" bleibt Teilen', (await wer('Teile die Einkaufsliste per WhatsApp')).modul === 'teilen');
    /* 3 Lego ist kein "lege ab" */
    {
        const r = await wer('Setz ein Lego Set auf die Wunschliste');
        check('3 "Lego" löst nicht die Foto-Anleitung für Wunschzettel aus', !r.gesagt.some(t => /gut beleuchtet/.test(t)), JSON.stringify(r.gesagt));
        const g = await wer('Leg den Wunschzettel ab');
        check('3b Gegenprobe: "Leg den Wunschzettel ab" öffnet weiter die Foto-Anleitung', g.gesagt.some(t => /gut beleuchtet/.test(t)), JSON.stringify(g.gesagt));
    }
    /* 4 Einleitungen machen aus Fragen keinen Terminwunsch */
    for (const t of ['Ich wollte mal wissen: wann komme ich zu Hause an', 'Ich wollte mal wissen: gibt es hier in der Nähe eine Apotheke']) {
        const r = await wer(t);
        check('4 "' + t + '" greift der Terminfinder nicht ab', r.modul !== 'terminfinder', r.modul);
    }
    check('4b Gegenprobe: "Ich möchte mal meine Mutter besuchen" bleibt beim Terminfinder', (await wer('Ich möchte mal meine Mutter besuchen')).modul === 'terminfinder');
    /* 5 "Nachrichten" allein sind News, keine Post */
    check('5 "Was sind die Nachrichten von heute" sortiert nicht das Postfach', (await wer('Was sind die Nachrichten von heute')).modul !== 'postfach');
    check('5b Gegenprobe: "Habe ich neue Nachrichten" und "Gibt es neue Mails" gehen weiter zum Postfach', (await wer('Habe ich neue Nachrichten')).modul === 'postfach' && (await wer('Gibt es neue Mails')).modul === 'postfach');
    console.log(fehler ? '✗ ' + fehler + ' Fehler (' + ok + ' ok)' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
