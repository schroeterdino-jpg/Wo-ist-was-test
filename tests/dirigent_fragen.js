/* ============================================================
   TAGESMELDUNG: EINDEUTIGE RÜCKFRAGEN (Start: node tests/dirigent_fragen.js)
   Die KI schreibt den Haupttext der Tagesmeldung; die Frage am Ende kommt aus dem Code und sagt genau, was "Ja" tut:
   - ausflug        -> "Soll ich passende Ausflugsideen dafür suchen?"            (Ja = vorhandener Ausflugsweg)
   - preise:<Liste> -> "Soll ich nach den Preisen für die Wunschliste von X schauen?" (nur wenn die Liste da ist und offene Punkte hat)
   - besuch:<Name>  -> "Soll ich nach einem passenden freien Zeitpunkt für einen Besuch bei X suchen?" (Ja = 14-Tage-Terminsuche)
                       NUR wenn der Text keinen Tag nennt (heute, morgen, übermorgen, Wochentag, Datum). Mit Tagesbezug: keine Frage, kein Pending,
                       weil die Terminsuche den Tag nicht übernehmen kann (kommt später).
   - keine / unbekannt / nicht ausführbar -> keine Frage, kein Pending; auch Fragen der KI mitten im Text fallen weg.
   Maximal EINE Aktionsfrage. "Nein" löscht den Zustand, ein zweites "Ja" macht nichts, nach 10 Minuten läuft er ab.
   Gemessen mit der echten Skript-Reihenfolge (tests/umgebung.js) und einer festen KI-Attrappe; kein echtes Netz.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');

let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const gleich = (name, ist, soll) => check(name, JSON.stringify(ist) === JSON.stringify(soll), '\n      ist:  ' + JSON.stringify(ist) + '\n      soll: ' + JSON.stringify(soll));
const antwort = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });

const LISTE = JSON.stringify([{ name: 'Liam', items: [{ t: 'Lego Ritterburg', done: false, preis: null, shop: '', link: '', mehr: [] }, { t: 'Fußball', done: true, preis: null, shop: '', link: '', mehr: [] }] }]);
const LISTE_ERLEDIGT = JSON.stringify([{ name: 'Liam', items: [{ t: 'Fußball', done: true, preis: null, shop: '', link: '', mehr: [] }] }]);
const REFORMATION = 'Morgen ist Reformationstag, du hast frei und das Wetter ist trocken. Vielleicht wäre ein Besuch bei deiner Mutter eine schöne Idee.';

/* eine Tagesmeldung mit fester KI-Antwort erzeugen; liefert, was Jarvis gesagt hat */
async function melde(aktion, text, speicher) {
    const app = starte({
        festerZufall: true, speicher: speicher || {},
        fetch: async u => {
            if (/\/api\/groq/.test(u)) return antwort({ choices: [{ message: { content: JSON.stringify({ melden: true, thema: 'besuch', text, aktion, grund: 'Test' }) } }] });
            throw new Error('offline (Attrappe): ' + u);
        }
    });
    const g0 = app.gesagt.length;
    await app.lassLaufen(() => app.sb.jvDirigent.ansage('dirig|2026-10-28|m', true));
    return { app, gesagt: app.gesagt.slice(g0).join(' ') };
}
const fragen = t => (t.match(/\?/g) || []).length;
const nackt = t => /(^|\s)Soll ich\s*\?/.test(t);
const Q_AUSFLUG = 'Soll ich passende Ausflugsideen dafür suchen?';
const Q_PREISE = 'Soll ich nach den Preisen für die Wunschliste von Liam schauen?';
const Q_BESUCH = 'Soll ich nach einem passenden freien Zeitpunkt für einen Besuch bei Mutter suchen?';

(async () => {
    /* ---------- 1–4 Ausflug ---------- */
    {
        const m = await melde('ausflug', 'Das Wetter ist morgen trocken, ein Ausflug mit den Kindern wäre schön. Soll ich?');
        check('1 Ausflug: eindeutige Frage am Ende', m.gesagt.endsWith(Q_AUSFLUG), m.gesagt);
        check('2 Ausflug: kein nacktes "Soll ich?"', !nackt(m.gesagt), m.gesagt);
        check('21 Ausflug: genau eine Frage trotz KI-eigener Frage', fragen(m.gesagt) === 1, m.gesagt);
        check('Ausflug: Haupttext bleibt erhalten', /Das Wetter ist morgen trocken, ein Ausflug mit den Kindern wäre schön\./.test(m.gesagt), m.gesagt);
        const j = await m.app.satz('Ja');
        check('3 Ausflug + Ja: vorhandener Ausflugsweg startet', /ausflug/.test(j.modul || '') && /Wer kommt mit/.test(j.gesagt.join(' ')), j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const m = await melde('ausflug', 'Das Wetter bleibt trocken. Ein Ausflug wäre schön.');
        const n = await m.app.satz('Nein');
        gleich('4 Ausflug + Nein: nur "Okay.", keine Aktion', n.gesagt, ['Okay.']);
        const j = await m.app.satz('Ja');
        check('22/23 nach Nein macht ein zweites Ja nichts', j.modul === null && j.gesagt.length === 0, j.modul + ' | ' + j.gesagt.join(' '));
    }

    /* ---------- 5–6 Preise ---------- */
    {
        const m = await melde('preise:Liam', 'Bis Weihnachten sind es noch 57 Tage und es fehlen Preise. Soll ich?', { jv_wunschlisten: LISTE });
        check('5 Preise (ausführbar): eindeutige Frage', m.gesagt.endsWith(Q_PREISE), m.gesagt);
        check('5 Preise: kein nacktes "Soll ich?"', !nackt(m.gesagt) && fragen(m.gesagt) === 1, m.gesagt);
        const j = await m.app.satz('Ja');
        check('Preise + Ja: vorhandene Preissuche startet', /wunschliste/.test(j.modul || '') && /Ich suche Preise für 1 Punkt/.test(j.gesagt.join(' ')), j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const m = await melde('preise:Liam', 'Bis Weihnachten sind es noch 57 Tage. Soll ich?');   // keine Liste gespeichert
        check('6 Preise (keine Liste): keine falsche Frage', fragen(m.gesagt) === 0, m.gesagt);
        const j = await m.app.satz('Ja');
        check('6 Preise (keine Liste): Ja startet nichts (kein Pending)', j.modul === null && j.gesagt.length === 0, j.modul + ' | ' + j.gesagt.join(' '));
        const m2 = await melde('preise:Liam', 'Bis Weihnachten sind es noch 57 Tage.', { jv_wunschlisten: LISTE_ERLEDIGT });   // alles gekauft
        check('6 Preise (alles gekauft): keine Frage', fragen(m2.gesagt) === 0, m2.gesagt);
    }

    /* ---------- 7–8 Besuch ohne Tag ---------- */
    {
        const m = await melde('besuch:Mutter', 'Du hast Zeit und das Wetter ist gut, vielleicht ein Besuch bei deiner Mutter. Soll ich?');
        check('7 Besuch ohne Tag: ehrliche Suchfrage', m.gesagt.endsWith(Q_BESUCH), m.gesagt);
        check('5/6 Besuchsfrage verspricht keine Erinnerung und keine Route', !/erinner|route|navig|eintrag|fahrt/i.test(Q_BESUCH) && !/erinner|route|navig/i.test(m.gesagt.split('.').pop()), m.gesagt);
        check('7 Besuch: genau eine Frage', fragen(m.gesagt) === 1 && !nackt(m.gesagt), m.gesagt);
        const j = await m.app.satz('Ja');
        check('8 Besuch ohne Tag + Ja: bestehende 14-Tage-Suche', /terminfinder/.test(j.modul || '') && /Welche soll ich eintragen/.test(j.gesagt.join(' ')), j.modul + ' | ' + j.gesagt.join(' '));
    }

    /* ---------- 9–16 Besuch mit Tagesbezug: keine Frage, kein Pending ---------- */
    const TAGES = [
        ['9/10 morgen', 'Morgen hast du frei und das Wetter ist gut, ein Besuch bei deiner Mutter wäre schön. Soll ich?'],
        ['11 heute', 'Heute hast du frei, ein Besuch bei deiner Mutter wäre schön. Soll ich?'],
        ['12 übermorgen', 'Übermorgen hast du frei, ein Besuch bei deiner Mutter wäre schön. Soll ich?'],
        ['13 Wochentag', 'Am Samstag hast du frei, ein Besuch bei deiner Mutter wäre schön. Soll ich?'],
        ['13b Wochentag klein', 'Du hast am freitag nichts vor, ein Besuch bei deiner Mutter wäre schön.'],
        ['14 Datum ausgeschrieben', 'Am 31. Oktober hast du frei, ein Besuch bei deiner Mutter wäre schön. Soll ich?'],
        ['14b Datum kurz', 'Am 31.10. hast du frei, ein Besuch bei deiner Mutter wäre schön.'],
        ['Wochenende', 'Am Wochenende hast du frei, ein Besuch bei deiner Mutter wäre schön. Soll ich?']
    ];
    for (const [name, text] of TAGES) {
        const m = await melde('besuch:Mutter', text);
        check(name + ': keine Aktionsfrage', fragen(m.gesagt) === 0 && !/Soll ich/.test(m.gesagt), m.gesagt);
        check(name + ': Haupttext bleibt (Besuch bei der Mutter)', /Besuch bei deiner Mutter/.test(m.gesagt), m.gesagt);
        const j = await m.app.satz('Ja');
        check(name + ': Ja startet keine Terminsuche (kein Besuch-Pending)', j.modul === null && j.gesagt.length === 0, j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const m = await melde('besuch:Mutter', REFORMATION + ' Soll ich?');
        check('15 Reformationstag: keine "Soll ich?"-Frage', fragen(m.gesagt) === 0 && !/Soll ich/.test(m.gesagt), m.gesagt);
        gleich('15 Reformationstag: Text unverändert bis auf die Frage', m.gesagt, REFORMATION);
        const j = await m.app.satz('Ja');
        check('16 Reformationstag + Ja: startet NICHT die 14-Tage-Besuchssuche', j.modul === null && !/Welche soll ich eintragen|Samstag|freie/.test(j.gesagt.join(' ')), j.modul + ' | ' + j.gesagt.join(' '));
    }

    /* ---------- 17–19 Aktion "keine" ---------- */
    {
        const m = await melde('keine', 'Heute Abend gibt es Regen, nimm die Jacke mit.');
        gleich('17 keine: Text ohne Frage unverändert', m.gesagt, 'Heute Abend gibt es Regen, nimm die Jacke mit.');
        const j = await m.app.satz('Ja');
        check('keine: Ja wird nicht als Tagesmeldungs-Bestätigung verarbeitet', !/dirigent/.test(j.modul || ''), j.modul);
    }
    {
        const m = await melde('keine', 'Heute Abend gibt es Regen, nimm die Jacke mit. Soll ich?');
        gleich('18 keine + Frage am Ende: entfernt', m.gesagt, 'Heute Abend gibt es Regen, nimm die Jacke mit.');
        const m2 = await melde('keine', 'Heute Abend gibt es Regen. Soll ich dir das Wetter zeigen?');
        gleich('18 keine + ausformulierte Frage am Ende: entfernt', m2.gesagt, 'Heute Abend gibt es Regen.');
    }
    {
        const m = await melde('keine', 'Heute Abend gibt es Regen. Soll ich dir das Wetter zeigen? Nimm die Jacke mit.');
        gleich('19 keine + Frage mitten im Text: entfernt, Rest bleibt natürlich', m.gesagt, 'Heute Abend gibt es Regen. Nimm die Jacke mit.');
        const m2 = await melde('keine', 'Heute Abend gibt es Regen. Möchtest du die Jacke mitnehmen? Es bleibt kalt.');
        check('19 keine + "Möchtest du …?" mitten im Text: entfernt', fragen(m2.gesagt) === 0 && /Es bleibt kalt/.test(m2.gesagt), m2.gesagt);
        const m3 = await melde('keine', 'Soll ich?');
        check('19 keine + nur eine Frage: keine Meldung', m3.gesagt === '', m3.gesagt);
    }
    {
        // Eine Frage, die kein Angebot ist, bleibt, solange sie nicht am Ende steht (nicht aggressiv kürzen)
        const m = await melde('keine', 'Wusstest du, dass es morgen regnet? Nimm die Jacke mit.');
        gleich('Keine Kürzung beliebiger Sätze: Frage ohne Angebot mitten im Text bleibt', m.gesagt, 'Wusstest du, dass es morgen regnet? Nimm die Jacke mit.');
        const m2 = await melde('besuch:Mutter', 'Am 31. Oktober hast du frei. Soll ich am 31. Oktober einen Besuch suchen? Das Wetter ist gut.');
        gleich('Datum mit Punkt zerreißt den Satz nicht', m2.gesagt, 'Am 31. Oktober hast du frei. Das Wetter ist gut.');
    }

    /* ---------- 20 unbekannte Aktion ---------- */
    {
        for (const a of ['irgendwas', 'besuch:', 'preise:', '']) {
            const m = await melde(a, 'Das Wetter ist gut. Soll ich?');
            check('20 unbekannte Aktion "' + a + '": keine Frage', fragen(m.gesagt) === 0, m.gesagt);
            const j = await m.app.satz('Ja');
            check('20 unbekannte Aktion "' + a + '": kein Pending', j.modul === null && j.gesagt.length === 0, j.modul + ' | ' + j.gesagt.join(' '));
        }
    }

    /* ---------- 22–24 Nein, zweites Ja, Ablauf ---------- */
    {
        const m = await melde('besuch:Mutter', 'Du hast Zeit, vielleicht ein Besuch bei deiner Mutter. Soll ich?');
        const n = await m.app.satz('Nein');
        gleich('22 Besuch + Nein: "Okay."', n.gesagt, ['Okay.']);
        const j = await m.app.satz('Ja');
        check('23 zweites Ja nach Nein: keine Tagesmeldungsaktion', j.modul === null && j.gesagt.length === 0, j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const m = await melde('ausflug', 'Ein Ausflug wäre schön.');
        await m.app.vorspulen(9 * 60000);
        const noch = await m.app.satz('Ja');
        check('24 nach 9 Minuten gilt das Ja noch', /ausflug/.test(noch.modul || ''), noch.modul);
        const m2 = await melde('ausflug', 'Ein Ausflug wäre schön.');
        await m2.app.vorspulen(11 * 60000);
        const j = await m2.app.satz('Ja');
        check('24 nach 11 Minuten: keine Tagesmeldungsaktion', j.modul === null && j.gesagt.length === 0, j.modul + ' | ' + j.gesagt.join(' '));
    }

    /* ---------- 25 Bestehendes bleibt ---------- */
    {
        const m0 = await melde('keine', 'Heute Abend gibt es Regen, nimm die Jacke mit.');
        const n = await m0.app.satz('Nein');
        check('"Nein" nach einer Meldung ohne Frage wird nicht vom Dirigenten verschluckt', !/dirigent/.test(n.modul || '') && !n.gesagt.includes('Okay.'), n.modul + ' | ' + n.gesagt.join(' '));
        const m = await melde('keine', 'Heute Abend gibt es Regen, nimm die Jacke mit.');
        const s = await m.app.satz('Das interessiert mich nicht');
        check('"Das interessiert mich nicht" macht das Thema stumm (auch ohne Frage)', /dirigent/.test(s.modul || '') && /melde ich mich nicht mehr/.test(s.gesagt.join(' ')), s.modul + ' | ' + s.gesagt.join(' '));
        const stumm = JSON.parse(m.app.store['jv_dirig_stumm'] || '[]');
        check('Thema steht in jv_dirig_stumm', stumm.includes('besuch'), JSON.stringify(stumm));
    }
    {
        const m = await melde('ausflug', 'Ein Ausflug wäre schön.');
        const s = await m.app.satz('Das interessiert mich nicht');
        check('"Das interessiert mich nicht" bei offener Frage: stumm, danach kein Ja mehr', /melde ich mich nicht mehr/.test(s.gesagt.join(' ')), s.gesagt.join(' '));
        const j = await m.app.satz('Ja');
        check('nach "interessiert mich nicht" macht Ja nichts', j.modul === null && j.gesagt.length === 0, j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const m = await melde('ausflug', 'Ein Ausflug wäre schön.');
        const w = await m.app.satz('Warum hast du dich gemeldet');
        check('"Warum hast du dich gemeldet" nennt weiter den Grund', /Test/.test(w.gesagt.join(' ')), w.gesagt.join(' '));
        const log = JSON.parse(m.app.store['jv_dirig_log'] || '[]');
        check('Log enthält Thema und ausgesprochenen Text mit der Frage', log.length === 1 && log[0].thema === 'besuch' && log[0].text.endsWith(Q_AUSFLUG), JSON.stringify(log));
    }
    {
        // Ansage zum Plan-Zeitpunkt (nicht erzwungen): höchstens eine pro Tag, Datum wird gemerkt
        const app = starte({ festerZufall: true, fetch: async u => { if (/\/api\/groq/.test(u)) return antwort({ choices: [{ message: { content: JSON.stringify({ melden: true, thema: 'wetter', text: 'Es bleibt trocken.', aktion: 'keine', grund: 'x' }) } }] }); throw new Error('offline ' + u); } });
        const e1 = (await app.lassLaufen(() => app.sb.jvDirigent.ansage('dirig|2026-10-28|m', false))).wert;
        const e2 = (await app.lassLaufen(() => app.sb.jvDirigent.ansage('dirig|2026-10-28|m', false))).wert;
        check('geplante Ansage: erst ja, dann (am selben Tag) nein', e1 === true && e2 === false, e1 + ' / ' + e2);
        check('geplante Ansage merkt den Tag', app.store['jv_dirig_heute'] === '2026-10-28', app.store['jv_dirig_heute']);
    }
    {
        // KI-Antwort ohne Meldung bleibt still
        const app = starte({ festerZufall: true, fetch: async u => { if (/\/api\/groq/.test(u)) return antwort({ choices: [{ message: { content: JSON.stringify({ melden: false }) } }] }); throw new Error('offline ' + u); } });
        const g0 = app.gesagt.length;
        const e = (await app.lassLaufen(() => app.sb.jvDirigent.ansage('dirig|2026-10-28|m', false))).wert;
        check('melden=false: keine Meldung', e === false && app.gesagt.length === g0);
    }
    {
        // Ausflug am Abend fragt nach morgen
        const app = starte({ festerZufall: true, fetch: async u => { if (/\/api\/groq/.test(u)) return antwort({ choices: [{ message: { content: JSON.stringify({ melden: true, thema: 'ausflug', text: 'Morgen ist es trocken.', aktion: 'ausflug', grund: 'x' }) } }] }); throw new Error('offline ' + u); } });
        await app.lassLaufen(() => app.sb.jvDirigent.ansage('dirig|2026-10-28|a', true));
        const j = await app.satz('Ja');
        check('Abend-Ausflug + Ja: Ausflugsweg startet weiter', /ausflug/.test(j.modul || ''), j.modul + ' | ' + j.gesagt.join(' '));
    }

    console.log('\nDirigent-Rückfragen: ' + ok + ' Prüfungen gut, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Testlauf abgestürzt:', e); process.exit(2); });
