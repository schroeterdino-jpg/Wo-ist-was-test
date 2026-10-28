/* ============================================================
   TESTS für B6: Befehle, die es nur in der Jarvis-Handy-App gibt (Schlafmodus/Vertretung/Wissensblatt ...).
   Start: node tests/handyapp.js
   - Im Browser (ohne ZaneNative) kommt eine klare Antwort, der Satz geht NICHT still an die KI.
   - Mit Handy-App bleibt das Verhalten wie vorher (keine Browser-Meldung, der Befehl wird wie früher bearbeitet).
   - Ähnliche normale Sätze werden nicht abgefangen.
   - Das Verzeichnis (js/faehigkeiten.js, nurHandyApp) stimmt mit dem Code überein.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const HINWEIS = 'Diese Funktion geht nur in der Jarvis-Handy-App.';
const JETZT = '2026-10-28T10:00:00+01:00';

/* Sätze, die ohne Handy-App den Hinweis bekommen müssen */
const APP_SAETZE = [
    'Vertretung an', 'Vertretung aus', 'Vertretung nach 5 Minuten', 'Spring ein, wenn ich nicht antworte', 'Vertretung Protokoll',
    'Warum hast du nicht geantwortet?', 'Wer hat für mich geantwortet?', 'Verpasste Anrufe an', 'Verpasste Anrufe aus',
    'Merk dir fürs Wissensblatt: Dino meldet sich nach der Fahrt', 'Was steht auf dem Wissensblatt?', 'Lies mir das Wissensblatt vor',
    'Schreib auf das Wissensblatt Dino ist da', 'Streich Milch vom Wissensblatt',
    'Erlaube Mama im Schlafmodus', 'Verbiete Mama im Schlafmodus', 'Wem antwortest du?', 'Wer darf antworten?',
    'Schlafmodus Kontakte auswählen', 'Schlafmodus mit festem Text', 'Schlafmodus mit freier Antwort', 'Meine Schlafantwort ist ich melde mich später'
];
/* Ähnliche normale Sätze: dürfen NICHT als App-Befehl abgefangen werden */
const NORMALE_SAETZE = [
    'Wer hat mir geschrieben?', 'Was habe ich verpasst?', 'Warum hat der Kunde nicht geantwortet?', 'Warum hast du das nicht gemacht?',
    'Erlaube mir einen freien Tag', 'Ich habe nach 5 Minuten geantwortet', 'Wie lange schlafe ich nach der Frühschicht?',
    'Was ist ein Wissensblatt in der Schule?', 'Schreib auf den Einkaufszettel Milch', 'Rufe meine Kontakte an',
    'Spring bitte nicht so hoch', 'Wie ist das Wetter morgen?', 'Was steht morgen in meinem Kalender?', 'Ich bin gleich zurück',
    'Wann ist der Schlafmodus meines Handys aus?', 'Wem gehört das Auto?'
];
/* Bestehende klare Meldungen im Browser bleiben, wie sie sind */
const ALT_KLAR = [['Schlafmodus an', /nur in der Jarvis-App/], ['Ich gehe schlafen', /nur in der Jarvis-App/], ['Schlafmodus aus', /nur in der Jarvis-App/], ['Stell einen Wecker auf 6 Uhr', /nur in der Jarvis-App/], ['Ortserinnerungen aus', /./]];

(async () => {
    const sag = async (satz, native) => {
        const A = starte({ native, jetzt: JETZT, festerZufall: true });
        const r = await A.satz(satz);
        return { lokal: r.lokal, modul: String(r.modul || ''), text: (r.gesagt || []).join(' | '), fehler: r.fehler };
    };

    /* 1. Browser: klare Antwort, kein KI-Weg */
    for (const s of APP_SAETZE) {
        const b = await sag(s, false);
        check('Browser "' + s + '": klare Antwort, lokal von schlaf_antwort', b.lokal === true && b.modul.split('+').includes('schlaf_antwort') && b.text.includes(HINWEIS), JSON.stringify(b));
        check('Browser "' + s + '": nicht still an die KI', b.lokal === true);
    }

    /* 2. Mit Handy-App: keine Browser-Meldung, Satz wird von der App-Logik bearbeitet (wie vorher) */
    for (const s of APP_SAETZE) {
        const m = await sag(s, true);
        check('Handy-App "' + s + '": keine Browser-Meldung', !m.text.includes(HINWEIS), m.text);
    }
    /* Bisheriges Verhalten mit Handy-App, Wortlaut unverändert (Stichproben) */
    const mit = async s => (await sag(s, true)).text;
    check('Handy-App: "Vertretung nach 5 Minuten" wie früher', (await mit('Vertretung nach 5 Minuten')) === 'Ich springe jetzt nach 5 Minuten ein.');
    check('Handy-App: Wissensblatt merken wie früher', /^Gemerkt fürs Wissensblatt: Dino meldet sich nach der Fahrt\./.test(await mit('Merk dir fürs Wissensblatt: Dino meldet sich nach der Fahrt')));
    check('Handy-App: Wissensblatt vorlesen wie früher', /Wissensblatt/.test(await mit('Was steht auf dem Wissensblatt?')));
    check('Handy-App: Protokoll wie früher', /Im Protokoll steht noch nichts/.test(await mit('Warum hast du nicht geantwortet?')));

    /* 3. Ähnliche normale Sätze werden nicht abgefangen (Browser und App) */
    for (const s of NORMALE_SAETZE) {
        const b = await sag(s, false), m = await sag(s, true);
        check('Normaler Satz "' + s + '": im Browser nicht als App-Befehl abgefangen', !b.text.includes(HINWEIS), b.text);
        check('Normaler Satz "' + s + '": mit Handy-App nicht als App-Befehl abgefangen', !m.text.includes(HINWEIS), m.text);
    }
    {   /* auch die Erkennung selbst */
        const A = starte({ native: false, jetzt: JETZT });
        const S = A.sb.jvSchlaf;
        check('jvSchlaf.nurAppBefehl ist da', !!S && typeof S.nurAppBefehl === 'function');
        if (S) for (const s of NORMALE_SAETZE) check('Erkennung: "' + s + '" ist kein App-Befehl', S.nurAppBefehl(s) === false);
        if (S) for (const s of APP_SAETZE) check('Erkennung: "' + s + '" ist ein App-Befehl', S.nurAppBefehl(s) === true);
    }

    /* 4. Bereits klare Browser-Meldungen bleiben unverändert */
    for (const [s, re] of ALT_KLAR) {
        const b = await sag(s, false);
        check('Browser "' + s + '": bestehende Meldung bleibt', b.lokal === true && re.test(b.text), JSON.stringify(b));
    }

    /* 5. Verzeichnis: nurHandyApp stimmt mit dem Code überein */
    {
        const A = starte({ native: false, jetzt: JETZT });
        const F = A.sb.jvFaehigkeiten, L = F && F.nurHandyApp;
        check('nurHandyApp ist da, eingefroren, vier Einträge', Array.isArray(L) && Object.isFrozen(L) && L.length === 4, L && L.length);
        check('acht Fähigkeiten bleiben acht (keine neue Hilfe-Karte)', F && F.liste.length === 8);
        const NAMEN = ['schlafmodus_vertretung', 'wecker', 'ortserinnerungen', 'fahrmodus'];
        check('nurHandyApp: die vier erwarteten Einträge', L && L.map(x => x.id).join() === NAMEN.join(), L && L.map(x => x.id).join());
        for (const e of L || []) {
            check(e.id + ': Angabe ja/teilweise mit Erklärung', ['ja', 'teilweise'].includes(e.handyApp) && !!e.handyAppDetail);
            check(e.id + ': Dateien existieren und nutzen ZaneNative', e.module.length > 0 && e.module.every(m => fs.existsSync(path.join(ROOT, m))) && e.module.some(m => /ZaneNative/.test(lies(m))));
            for (const s of e.beispiele) {
                const b = await sag(s, false);
                check(e.id + ' Beispiel "' + s + '": im Browser lokal beantwortet mit Hinweis auf die Jarvis-App', b.lokal === true && /Jarvis-(Handy-)?App/.test(b.text), JSON.stringify(b));
            }
        }
        check('Schicht-Eintrag nennt den Wecker als Handy-App-Teil', /Wecker/.test(F.nach('schicht').handyAppDetail));
        check('Schicht: alte Lücke "fällt still an die KI" nicht mehr vermerkt', !F.nach('schicht').bekannteGrenzen.some(g => /still an die KI/.test(g)));
    }

    console.log(fehler ? '\n' + fehler + ' Handy-App-Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : 'Handy-App-Hinweise in Ordnung (' + ok + ' Prüfungen).');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
