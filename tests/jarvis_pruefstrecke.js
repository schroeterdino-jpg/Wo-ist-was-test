/* ============================================================
   JARVIS-PRÜFSTRECKE (Stufe 1: Bestandsaufnahme)
   Start: node tests/jarvis_pruefstrecke.js            (Prüfungen; Ist-Fälle laufen mit, schlagen aber nie fehl)
          IST_BERICHT=tests/ist-zustand.md node tests/jarvis_pruefstrecke.js   (schreibt zusätzlich die Ist-Zustands-Tabelle)

   Lädt die GANZE App (alle Skripte aus index.html in echter Reihenfolge) mit Attrappen (tests/umgebung.js) und lässt echte Sätze
   durch die echte Befehls-Kette (handleLocalCommand) und echte Aktionen durch executeAction laufen. Die KI wird nie angerufen:
   wo der Satz bei der KI landet, liefert der Test vorgegebene Aktionen.

   Zwei Arten von Fällen:
   - check(...)  Verhalten, das bestätigt ist (aus dem Code gelesen oder von Dino so abgenommen). Rot = Fehler.
   - ist(...)    BESTANDSAUFNAHME: schreibt nur auf, was heute wirklich passiert. Erzwingt noch keinen Sollwert. Erst nach Freigabe
                 durch Dino werden daraus feste check()-Prüfungen oder Einträge in die Fehlerliste.
   Jeder Ist-Fall hält fest: Modul, lokal oder KI-Weg, Aktionen, Änderungen, Sprachausgabe, ob mehrere Module reagierten, Auffälligkeiten.
   ============================================================ */
'use strict';
process.on('unhandledRejection', () => { });   // Module der App, die mit Attrappen ins Leere laufen, dürfen den Test nicht beenden
process.env.TZ = 'Europe/Berlin';   // wie in der App (Berlin), unabhängig vom Rechner
const fs = require('fs'), path = require('path');
const { starte, lies, ROOT } = require('./umgebung.js');

let ok = 0, fehler = 0;
function check(name, bedingung, info) {
    if (bedingung) { ok++; return; }
    fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : ''));
}
const IST = [];
/* B = bekannter Fehler: Sollwert ist festgelegt, der Lauf bleibt aber grün, solange der Fehler besteht.
   Sobald der Sollwert erfüllt ist, meldet der Lauf "behoben": dann den Eintrag in check() umstellen. */
const BEKANNT = [];
function bekannterFehler(name, sollErfuellt, info) { BEKANNT.push({ name, behoben: !!sollErfuellt, info: info || '' }); }
const kurz = (t, n) => { t = String(t == null ? '' : t).replace(/\s+/g, ' ').trim(); return t.length > (n || 140) ? t.slice(0, n || 140) + '…' : t; };
/* erg = Ergebnis von satz()/ki(); auffaellig = Liste von Hinweisen (Strings) */
function ist(nr, thema, satz, erg, auffaellig, extra) {
    erg = erg || {};
    const eintrag = {
        nr, thema, satz,
        modul: erg.modul || (erg.lokal === false ? 'niemand in der Befehls-Kette -> geht an die KI' : '-'),
        weg: erg.lokal ? 'lokal' : (/^KI-Weg/.test(erg.modul || '') ? 'KI-Weg (Attrappe)' : 'KI-Weg (Satz nicht lokal übernommen)'),
        aktionen: erg.aktionen || '-',
        gespeichert: erg.aenderungen ? Object.keys(erg.aenderungen).map(k => {
            const v = erg.aenderungen[k]; return k === 'speicherSchluessel' ? 'Speicher: ' + v.join(', ') : k + ' ' + v.vorher + '->' + v.nachher + (v.neu && v.neu.length ? ' (' + kurz(JSON.stringify(v.neu), 90) + ')' : '');
        }).join('; ') || 'nichts' : 'nichts',
        sprachausgabe: (erg.gesagt && erg.gesagt.length) ? erg.gesagt.map(t => kurz(t, 110)).join(' | ') : '(keine)',
        notizen: (erg.notizen && erg.notizen.length) ? erg.notizen.map(t => kurz(t, 90)).join(' | ') : '',
        mehrereModule: erg.mehrere ? 'JA: ' + erg.modul : 'nein',
        auffaellig: (auffaellig || []).concat(erg.fehler && erg.fehler.length ? [(erg.fehler.every(f => /\?\s*$/.test(f)) ? 'Rückfrage der App (kein Fehler): ' : 'Fehler: ') + kurz(JSON.stringify(erg.fehler), 100)] : []).join(' ; ') || '-',
        extra: extra || ''
    };
    IST.push(eintrag);
    return eintrag;
}
const genauEins = (erg, bereich) => !!(erg.aenderungen && erg.aenderungen[bereich] && erg.aenderungen[bereich].nachher - erg.aenderungen[bereich].vorher === 1);
const mark = (a) => ({ ...a });
const SPAET_MI = '2026-10-28T10:00:00+01:00';   // Mittwoch, 28.10.2026, 10:00 Berlin

/* Schicht der Woche einstellen (Spätschicht in dieser Woche) wie in der App: Schlüssel jv_schicht */
function schichtSetzen(A, shift) {
    const T = A.sb._schichtTest; if (!T || !T.weekNo) return false;
    const w = T.weekNo({ y: 2026, m: 10, d: 28 });
    A.store['jv_schicht'] = JSON.stringify({ base: w, shift, times: { frueh: 7 * 60, spaet: 12 * 60 + 45 }, auto: true });
    return true;
}

async function haupt() {
    /* ===== 0. Die ganze App lädt ===== */
    const A = starte({ native: true, jetzt: SPAET_MI });
    check('Umgebung: alle Skripte aus index.html laden ohne Fehler', A.ladefehler.length === 0, A.ladefehler.join(' | '));
    const kette = A.kette();
    check('Umgebung: die Befehls-Kette ist gefüllt (mindestens 85 Einträge)', kette.length >= 85, 'Einträge: ' + kette.length);
    check('Umgebung: handleLocalCommand, executeAction und buildSystemPrompt sind da', ['handleLocalCommand', 'executeAction', 'buildSystemPrompt'].every(n => typeof A.sb[n] === 'function'));
    const namen = kette.map(e => e.replace(/^[\d.]+ /, ''));
    check('Befehls-Kette: keine doppelten Namen', new Set(namen).size === namen.length);
    const zahlen = kette.map(e => parseFloat(e));
    check('Befehls-Kette: Reihenfolge-Zahlen sind aufsteigend sortiert', zahlen.every((z, i) => i === 0 || zahlen[i - 1] <= z));

    /* ===== 1. Befehls-Weg (lokal) ===== */
    let r = await A.satz('Lächle mal');
    check('Befehl "Lächle mal": der Kopf (mimik) ist entfernt, kein Modul "mimik" übernimmt ihn mehr', r.modul !== 'mimik', r.modul);
    ist('1', 'Avatar', 'Lächle mal', r);

    r = await A.satz('Streck die Zunge raus');
    {
        const avatarHandler = typeof A.sb.handleAvatarExpressionCommand;
        ist('2', 'Avatar', 'Streck die Zunge raus', r, ['In der Befehls-Kette übernimmt niemand den Satz. avatar3d.js hat einen eigenen Handler (handleAvatarExpressionCommand: ' + avatarHandler + '), der ohne 3D-Kopf in der Attrappe nicht prüfbar ist.']);
    }

    r = await A.satz('Wo waren wir schon?');
    check('Befehl "Wo waren wir schon?" wird lokal von ausflug übernommen', r.lokal && r.modul === 'ausflug', r.modul);
    ist('3', 'Ausflug', 'Wo waren wir schon?', r);

    r = await A.satz('Da waren wir schon');
    ist('4', 'Ausflug', 'Da waren wir schon (ohne vorherigen Vorschlag)', r);

    {   // Ausflug merken, einmal und zweimal -> Duplikate?
        const e1 = await A.satz('Wir waren gestern im Tierpark Hagenbeck, das war langweilig');
        const v1 = A.store['jv_ausfluege'] || A.store['jv_ausflug_gemerkt'] || '';
        const e2 = await A.satz('Wir waren gestern im Tierpark Hagenbeck, das war langweilig');
        const ausKeys = Object.keys(A.store).filter(k => /ausflug|ausfl/i.test(k));
        const anz = ausKeys.map(k => { try { const v = JSON.parse(A.store[k]); return k + '=' + (Array.isArray(v) ? v.length : typeof v); } catch (e) { return k; } });
        ist('5', 'Ausflug merken + Doppelaktion', 'Wir waren gestern im Tierpark Hagenbeck, das war langweilig (2x gesagt)', e1,
            ['Nach zweimaligem Sagen: ' + (anz.join(', ') || 'kein Ausflugs-Speicher gefunden') + '. Zweiter Durchlauf: Modul ' + (e2.modul || 'niemand') + ', Ausgabe: ' + kurz((e2.gesagt || []).join(' '), 80)]);
    }

    /* ===== 2. Kalender, Erinnerung (KI-Weg mit vorgegebener Aktion), Doppelaktionen ===== */
    r = await A.satz('Erinnere mich morgen um 15 Uhr an den Zahnarzt');
    ist('8a', 'Erinnerung', 'Erinnere mich morgen um 15 Uhr an den Zahnarzt (lokaler Weg?)', r);
    {
        const k = await A.ki('Erinnere mich morgen um 15 Uhr an den Zahnarzt', [{ type: 'reminder', reminder_text: 'Zahnarzt', reminder_time: '2026-10-29T15:00:00' }]);
        check('Erinnerung über den KI-Weg: genau EINE Erinnerung entsteht (keine Doppelaktion)', genauEins(k, 'erinnerungen'), JSON.stringify(k.aenderungen));
        const zeit = k.aenderungen.erinnerungen && k.aenderungen.erinnerungen.neu[0] && k.aenderungen.erinnerungen.neu[0].zeit;
        check('Erinnerung: Zeit ist morgen 15:00 Berlin', zeit && new Date(zeit).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }) === '2026-10-29 15:00:00', zeit);
        check('Erinnerung: Sprachausgabe nicht doppelt', new Set(k.gesagt).size === k.gesagt.length, JSON.stringify(k.gesagt));
        ist('8b', 'Erinnerung', 'Erinnere mich morgen um 15 Uhr an den Zahnarzt (KI liefert Aktion reminder)', k);
        const l = await A.ki('Lösche die Erinnerung Zahnarzt', [{ type: 'reminder_delete', reminder_query: 'Zahnarzt' }]);
        ist('9', 'Erinnerung löschen', 'Lösche die Erinnerung Zahnarzt', l, [
            'Es gab ' + (l.aenderungen.erinnerungen ? l.aenderungen.erinnerungen.vorher : 1) + ' Erinnerung vorher, danach ' + (l.aenderungen.erinnerungen ? l.aenderungen.erinnerungen.nachher : 'unverändert') + '. Ob eine Rückfrage kam, zeigt die Sprachausgabe.']);
    }

    {   // Termin anlegen, genau einer, Löschen mit Bestätigung, Waisen
        const vor = A.zustand();
        const k = await A.ki('Friseurtermin morgen um 13 Uhr', [{ type: 'calendar', calendar_text: 'Friseurtermin', calendar_time: '2026-10-29T13:00:00' }]);
        check('Kalender: "Friseurtermin morgen um 13 Uhr" legt genau EINEN Termin an', genauEins(k, 'termine'), JSON.stringify(k.aenderungen.termine));
        const t = k.aenderungen.termine && k.aenderungen.termine.neu[0];
        check('Kalender: Termin liegt morgen 13:00 Berlin', t && new Date(t.iso).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }) === '2026-10-29 13:00:00', t && t.iso);
        check('Kalender: Rückfrage nach der Erinnerungszeit kommt genau einmal', k.notizen.filter(n => /Stunden vorher/.test(n)).length === 1, JSON.stringify(k.notizen));
        ist('3a', 'Termin anlegen', 'Friseurtermin morgen um 13 Uhr (KI liefert calendar)', k);
        const l = await A.ki('Lösch den Friseurtermin morgen', [{ type: 'calendar_delete', calendar_query: 'Friseurtermin' }]);
        const rueck = (l.fehler || []).join(' ');
        ist('3b', 'Termin löschen (Schritt 1: Rückfrage)', 'Lösch den Friseurtermin morgen (KI liefert calendar_delete)', l,
            ['Termine direkt nach dem Befehl: ' + A.zustand().termine.length + ' (vor der Bestätigung wird nichts gelöscht). Rückfrage der App: ' + (rueck || 'keine')]);
        const ja = await A.satz('Ja');
        ist('3b2', 'Termin löschen (Schritt 2: Antwort "Ja")', 'Ja (auf die Löschfrage)', ja,
            ['Termine danach: ' + A.zustand().termine.length + ' (Friseur noch da: ' + A.zustand().termine.some(x => /friseur/i.test(x.text)) + '). BEOBACHTUNG: Die offene Löschfrage zur Erinnerung "Zahnarzt" (Fall 9) war noch nicht beantwortet; die Frage zum Termin kam daher als "Und den Termin ...?" und ein einziges "Ja" löschte BEIDES (Erinnerung und Termin).']);
        const nachDel = A.zustand();
        ist('3c', 'Verwaiste Erinnerungen nach Löschen', 'Termin gelöscht -> bleiben Erinnerungen zurück?', { modul: '-', aenderungen: {} },
            ['Erinnerungen jetzt: ' + nachDel.erinnerungen.length + ' (davon mit Text "Friseur": ' + nachDel.erinnerungen.filter(x => /friseur/i.test(x.text)).length + '); Termine jetzt: ' + nachDel.termine.length]);
        void vor;
    }

    {   // Falschen Termin löschen: calendar_delete mit nicht vorhandenem Begriff
        const B = starte({ native: true, jetzt: SPAET_MI });
        await B.ki('Friseur morgen 13 Uhr', [{ type: 'calendar', calendar_text: 'Friseur', calendar_time: '2026-10-29T13:00:00' }]);
        await B.ki('Zahnarzt morgen 15 Uhr', [{ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: '2026-10-29T15:00:00' }]);
        const d = await B.ki('Lösch den Tierarzttermin', [{ type: 'calendar_delete', calendar_query: 'Tierarzt' }]);
        const uebrig = B.zustand().termine.map(t => t.text);
        ist('3d', 'Löschen ohne Treffer (Sicherheit)', 'Lösch den Tierarzttermin, es gibt aber nur Friseur und Zahnarzt', d,
            [uebrig.length === 1 ? 'AUFFÄLLIG: Obwohl es keinen Tierarzt-Termin gibt, wurde ein anderer Termin gelöscht. Übrig: ' + uebrig.join(', ') : 'Nichts Fremdes gelöscht. Übrig: ' + uebrig.join(', ')]);
    }

    {   // Erinnerungs-Rückfrage: Antwort "30 Minuten vorher." gehört zum Vorgang
        const C = starte({ native: true, jetzt: SPAET_MI });
        const k = await C.ki('Ich brauche morgen um 9:30 Uhr einen Termin zum Haare schneiden', [{ type: 'calendar', calendar_text: 'Haare schneiden', calendar_time: '2026-10-29T09:30:00' }]);
        const frage = k.notizen.some(n => /Stunden vorher/.test(n));
        const a = await C.satz('30 Minuten vorher.');
        check('Rückfrage: nach dem Termin wird gefragt, wie lange vorher erinnert werden soll', frage, JSON.stringify(k.notizen));
        ist('4', 'Erinnerungs-Rückfrage', '(Termin Haare schneiden) -> "30 Minuten vorher."', a, [
            'Die Rückfrage fragt nach STUNDEN ("Wie viele Stunden vorher ..."), die Antwort war in Minuten. Übernommen von: ' + (a.modul || 'niemand (KI)') + '. Erinnerungen danach: ' + C.zustand().erinnerungen.length]);
    }

    r = await A.satz('Was steht morgen in meinem Kalender?');
    ist('10', 'Kalender lesen', 'Was steht morgen in meinem Kalender?', r);

    /* ===== 3. Sätze mit mehreren Anliegen (Referenzfälle für Multi-Intent) ===== */
    const MULTI = [
        ['11a', 'Kalender+Ort+Wetter+Fahrzeit', 'Ich habe morgen einen Termin um 15 Uhr in Hamburg. Wie wird das Wetter dort und wie lange brauche ich dahin?'],
        ['11b', 'Ort fehlt', 'Ich habe morgen um 15 Uhr einen Termin. Wie wird das Wetter dort und wann muss ich los?'],
        ['11c', 'Hamburg-Satz (alt)', 'Ich habe morgen um 15 Uhr einen Termin in Hamburg. Wie wird dort das Wetter und wann muss ich los?'],
        ['12', 'Wetter', 'Wie wird das Wetter morgen?'],
        ['14', 'Wetter+Kalender', 'Wie wird das Wetter morgen und was steht morgen an?'],
        ['15', 'Wetter+Vollmond', 'Wie wird das Wetter morgen und wann ist der nächste Vollmond?'],
        ['15b', 'Wochenende', 'Was steht Samstag an und was könnten wir danach mit den Kindern machen?']
    ];
    for (const [nr, thema, satz] of MULTI) {
        const m = await A.satz(satz);
        const hinweis = [];
        if (!m.lokal) hinweis.push('Geht an die KI (oder an die Basis): hier hängt die ganze Qualität am Prompt und an den Aktionen der KI.');
        if (m.lokal && m.gesagt.length) hinweis.push('Lokal beantwortet: prüfen, ob beide/alle Teile der Frage beantwortet wurden.');
        ist(nr, thema, satz, m, hinweis);
    }

    /* ===== 4. Ortssuche und Kontextwechsel (welche Orte werden angefragt?) ===== */
    {
        const O = starte({ native: true, jetzt: SPAET_MI, fetch: async (u) => { return { ok: false, status: 503, json: async () => ({}), text: async () => '' }; } });
        const orte = [];
        for (const [nr, satz] of [['13a', 'Wo ist Penny in Schwarzenbek?'], ['13b', 'Gibt es Apotheken in Wentorf?'], ['13c', 'Zeig mir Restaurants in der Nähe']]) {
            const n0 = O.aufrufe.length; const m = await O.satz(satz);
            const urls = O.aufrufe.slice(n0).map(u => decodeURIComponent(u).replace(/^https?:\/\/[^/]+/, '').slice(0, 110));
            orte.push(urls);
            ist(nr, 'Ortssuche', satz, m, [
                'Angefragte Adressen: ' + (urls.length ? urls.join(' ; ') : 'keine (Satz ging nicht in eine Netz-Suche)')
            ]);
        }
        // Kontextwechsel
        const n1 = O.aufrufe.length; await O.satz('Wo ist Penny in Schwarzenbek?');
        const n2 = O.aufrufe.length; const w = await O.satz('Wie wird morgen das Wetter in Hamburg?');
        const nach = O.aufrufe.slice(n2).map(u => decodeURIComponent(u).replace(/^https?:\/\/[^/]+/, '').slice(0, 110));
        ist('16', 'Kontextwechsel', 'Wo ist Penny in Schwarzenbek? -> danach: Wie wird morgen das Wetter in Hamburg?', w, [
            'Angefragte Adressen beim zweiten Satz: ' + (nach.join(' ; ') || 'keine'),
            /schwarzenbek/i.test(nach.join(' ')) ? 'AUFFÄLLIG: Schwarzenbek taucht beim Hamburg-Satz in den Anfragen auf' : 'Schwarzenbek taucht beim Hamburg-Satz nicht auf'
        ]);
        void n1;
    }

    /* ===== 5. Gedächtnis ===== */
    {
        const G = starte({ native: true, jetzt: SPAET_MI });
        const a1 = await G.ki('Meine Frau heißt Simone', [{ type: 'memory_store', memory_key: 'frau', memory_value: 'Simone' }]);
        const a2 = await G.ki('Meine Frau heißt Simone', [{ type: 'memory_store', memory_key: 'frau', memory_value: 'Simone' }]);
        const mem = JSON.parse(G.store['helfer_memory'] || '{}');
        check('Gedächtnis: derselbe Eintrag zweimal gesagt bleibt EIN Eintrag', Object.keys(mem).filter(k => /frau/.test(k)).length === 1, JSON.stringify(mem));
        ist('17a', 'Gedächtnis', 'Meine Frau heißt Simone (2x)', a2, ['Gedächtnis nach 2x: ' + JSON.stringify(mem)]);
        const a3 = await G.ki('Meine Frau heißt jetzt Anna', [{ type: 'memory_store', memory_key: 'frau', memory_value: 'Anna' }]);
        ist('17b', 'Gedächtnis Widerspruch', 'Meine Frau heißt jetzt Anna', a3, ['Gedächtnis jetzt: ' + G.store['helfer_memory'] + ' (alter Wert überschrieben, kein Widerspruchs-Hinweis)']);
        const l = await G.satz('Heute habe ich keine Lust auf Pizza');
        ist('17c', 'Nicht-Langzeit', 'Heute habe ich keine Lust auf Pizza', l, ['Lokal übernommen: ' + (l.lokal ? 'ja' : 'nein (KI entscheidet, ob etwas gespeichert wird; der Test sieht die KI-Entscheidung nicht)')]);

        // Gedächtnis bei Terminen
        await G.ki('Merk dir: mein Friseur ist Anja in der Bahnhofstraße', [{ type: 'memory_store', memory_key: 'friseur', memory_value: 'Anja in der Bahnhofstraße' }]);
        const t = await G.ki('Friseurtermin morgen um 13 Uhr', [{ type: 'calendar', calendar_text: 'Friseur', calendar_time: '2026-10-29T13:00:00' }]);
        ist('18', 'Gedächtnis bei Terminen', 'Friseurtermin morgen um 13 Uhr, obwohl "Friseur ist Anja in der Bahnhofstraße" gemerkt ist', t, [
            'Hinweise zum Termin: ' + (t.notizen.join(' | ') || 'keine') + '. Gedächtnis-Zusammenhang genutzt: ' + (t.notizen.some(n => /Anja|Bahnhof/i.test(n)) || (t.aenderungen.termine && /Bahnhof|Anja/.test(JSON.stringify(t.aenderungen.termine))) ? 'ja' : 'nein, der Ort/Hinweis kommt nicht aus dem Gedächtnis')]);
    }

    /* ===== 6. Schicht und Plan (feste Uhr) ===== */
    {
        const P = starte({ native: true, jetzt: '2026-10-28T10:00:00+01:00' });
        const geschichtet = schichtSetzen(P, 'spaet');
        const PL = P.sb.jvPlan;
        check('Schicht: Plan-Modul und Schicht-Modul sind geladen', !!PL && !!P.sb._schichtTest && geschichtet);
        if (PL) {
            check('Schicht: Mittwoch 28.10.2026 ist Spätschicht (Einstellung des Tests)', PL.schichtAm('2026-10-28') === 'spaet', String(PL.schichtAm('2026-10-28')));
            const plan = PL.bauePlan();
            const heim = plan.find(e => /^heim\|2026-10-28/.test(e.id));
            check('Plan: für den Spätschicht-Tag gibt es eine Feierabend-Meldung (heim|)', !!heim, JSON.stringify(plan.map(e => e.id)));
            if (heim) {
                check('Plan: Feierabend ist nur noch eine Benachrichtigung ("Tippe für Einzelheiten"), kein "dann sage ich dir"', /Feierabend\./.test(heim.text) && /Tippe für Einzelheiten/.test(heim.text) && !/dann sage ich dir/.test(heim.text), heim.text);
                check('Plan: Feierabend kommt 3 Minuten nach Schichtende', Math.round((heim.at - PL.berlinMs('2026-10-28', PL.ende('spaet'))) / 60000) === 3, String((heim.at - PL.berlinMs('2026-10-28', PL.ende('spaet'))) / 60000));
            }
            const ids = plan.map(e => e.id.split('|')[0]);
            ist('19', 'Plan Spätschicht', 'Plan für Mi 28.10.2026 (Spätschicht)', { modul: 'plan_ansagen.js', aenderungen: {}, gesagt: [] }, [
                'Einträge: ' + plan.map(e => e.id + ' @ ' + new Date(e.at).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' })).join(', '),
                'Beginn/Abfahrt/Ende (Minuten): ' + [PL.beginn('spaet', '2026-10-28'), PL.abfahrtMin('spaet'), PL.ende('spaet')].join('/') + ' = ' + [PL.beginn('spaet', '2026-10-28'), PL.abfahrtMin('spaet'), PL.ende('spaet')].map(m => PL.uhr(m)).join(' / ')]);
            void ids;
        }
        // Feierabend-Ansage nach Schichtende: nicht sprechen (PR #246)
        const F = starte({ native: true, jetzt: '2026-10-28T22:16:00+01:00' });
        schichtSetzen(F, 'spaet');
        if (F.sb.jvPlan) {
            const g0 = F.gesagt.length;
            const res = (await F.lassLaufen(() => F.sb.jvPlan.ansage('heim|2026-10-28', false, true))).wert;
            await F.vorspulen(1000);
            check('Feierabend: die automatische Ansage (heim|) spricht NICHTS mehr', F.gesagt.length === g0, JSON.stringify(F.gesagt.slice(g0)));
            const melde = (() => { try { return JSON.parse(F.store['jv_meldungen'] || '[]'); } catch (e) { return []; } })();
            ist('20', 'Feierabend nur Benachrichtigung', 'ansage("heim|2026-10-28") nach Schichtende (22:16)', { modul: 'plan_ansagen.js', aenderungen: {}, gesagt: F.gesagt.slice(g0) }, [
                'Rückgabe: ' + res + '; gemerkte Meldungen: ' + melde.length + (melde.length ? ' (' + kurz(melde[melde.length - 1].t + ': ' + melde[melde.length - 1].x, 100) + ')' : '')]);
        }
        // Früher los: Gesamtweg mit der echten Befehls-Kette
        const FL = starte({ native: true, jetzt: '2026-10-28T10:00:00+01:00' });
        schichtSetzen(FL, 'spaet');
        const fl = await FL.satz('Ich muss Donnerstag um 13:15 auf der Arbeit sein');
        const tvKeys = Object.keys(FL.store).filter(k => /^jv_plan_(vor|beginn)/.test(k) || /plan_vor|plan_beginn/.test(k));
        check('Früher los: "Donnerstag um 13:15 auf der Arbeit" übernimmt frueher-los (Spätschicht normal 13:45)', fl.lokal && /frueher-los/.test(fl.modul || ''), JSON.stringify([fl.modul, fl.gesagt]));
        check('Früher los: Antwort nennt 13:15 und die neue Abfahrt', /13 Uhr 15|13:15/.test((fl.gesagt || []).join(' ')) && /12 Uhr 30|12:30/.test((fl.gesagt || []).join(' ')), JSON.stringify(fl.gesagt));
        check('Früher los: nur eine Sprachausgabe (keine Doppelmeldung)', fl.gesagt.length === 1, JSON.stringify(fl.gesagt));
        ist('21', 'Früher los (Gesamtweg)', 'Ich muss Donnerstag um 13:15 auf der Arbeit sein', fl, ['Gesetzte Merker: ' + tvKeys.join(', ')]);
        const rg = await FL.satz('Mach die frühere Abfahrt rückgängig');
        check('Früher los: rückgängig übernimmt frueher-los', /frueher-los/.test(rg.modul || ''), rg.modul);
        const k2 = await FL.ki('Ich muss Donnerstag um 14:30 auf der Arbeit sein', [{ type: 'episode_store', episode_text: 'Der User muss am Donnerstag um 14:30 auf der Arbeit sein.' }]);
        ist('22', 'Später als sonst', 'Ich muss Donnerstag um 14:30 auf der Arbeit sein', k2);
        const hw = await F.satz('Heimweg');
        ist('23', 'Heimweg per Sprache', 'Heimweg', hw);
    }

    /* ===== 7. Handy-App-Brücke: mit und ohne ZaneNative ===== */
    {
        const SAETZE = ['Vertretung nach 5 Minuten', 'Merk dir fürs Wissensblatt: Dino meldet sich nach der Fahrt', 'Was steht auf dem Wissensblatt?', 'Warum hast du nicht geantwortet?', 'Vertretung an'];
        const MIT = starte({ native: true, jetzt: SPAET_MI }), OHNE = starte({ native: false, jetzt: SPAET_MI });
        for (const s of SAETZE) {
            const a = await MIT.satz(s), b = await OHNE.satz(s);
            if (s === 'Vertretung nach 5 Minuten') {
                check('Brücke: "Vertretung nach 5 Minuten" mit Handy-App übernimmt schlaf_antwort und sagt "5 Minuten"', a.modul === 'schlaf_antwort' && /5 Minuten/.test(a.gesagt.join(' ')), JSON.stringify(a.gesagt));
            }
            if (/Wissensblatt: /.test(s)) check('Brücke: Wissensblatt-Eintrag wird mit Handy-App gemerkt', a.modul === 'schlaf_antwort' && /Gemerkt fürs Wissensblatt/.test(a.gesagt.join(' ')));
            ist('24', 'Brücke mit / ohne Handy-App', s, b, [
                'MIT Handy-App: ' + (a.modul || 'niemand') + ' -> ' + kurz(a.gesagt.join(' '), 70),
                'OHNE Handy-App (Browser): ' + (b.modul || 'niemand, Satz fällt an die KI') + (b.lokal ? '' : ' (kein Hinweis "nur in der Handy-App")')
            ]);
        }
    }

    /* ===== 8. Teilfehler: nur EIN Dienst fällt aus ===== */
    {
        const dienste = { wetter: 'ok', kalender: 'ok', route: 'aus' };
        const fetchFn = async (u) => {
            const url = String(u);
            if (/open-meteo|weather|wetter/i.test(url)) return { ok: true, status: 200, json: async () => ({ current: { temperature_2m: 11, weather_code: 3, wind_speed_10m: 10 }, daily: { time: ['2026-10-29'], temperature_2m_max: [12], temperature_2m_min: [6], weather_code: [3], precipitation_sum: [0] } }), text: async () => '{}' };
            if (/route|osrm|maps/i.test(url)) return { ok: false, status: 503, json: async () => ({ error: 'Dienst ausgefallen' }), text: async () => 'Dienst ausgefallen' };
            return { ok: false, status: 503, json: async () => ({}), text: async () => '' };
        };
        const T = starte({ native: true, jetzt: SPAET_MI, dienste, fetch: fetchFn });
        await T.ki('Termin Hamburg morgen 15 Uhr', [{ type: 'calendar', calendar_text: 'Termin Hamburg', calendar_time: '2026-10-29T15:00:00', calendar_location: 'Hamburg' }]);
        let wetter = 'nicht aufgerufen', route = 'nicht aufgerufen';
        try { const w = await T.sb.fetchWeatherData(); wetter = w && w.fehler ? 'Fehlerobjekt: ' + kurz(w.fehler, 60) : (w ? 'liefert Daten (' + Object.keys(w).slice(0, 4).join(',') + ')' : 'liefert leer/null'); } catch (e) { wetter = 'wirft: ' + kurz(e.message, 60); }
        const routenFn = ['fetchTravelTime', 'getTravelTime', 'berechneFahrzeit', 'fahrzeit', 'fetchRoute'].find(n => typeof T.sb[n] === 'function');
        if (routenFn) { try { const x = await T.sb[routenFn]('Hamburg'); route = routenFn + ' -> ' + kurz(JSON.stringify(x), 80); } catch (e) { route = routenFn + ' wirft: ' + kurz(e.message, 60); } } else route = 'keine Routenfunktion unter den üblichen Namen gefunden';
        ist('25', 'Teilfehler (Kalender ok, Wetter ok, Fahrzeit-Dienst aus)', 'Termin in Hamburg + Wetter + Fahrzeit, Routing-Dienst liefert 503', { modul: 'Funktionen einzeln aufgerufen', aenderungen: {}, gesagt: [] }, [
            'Termine nach dem Eintragen: ' + T.zustand().termine.length,
            'Wetter-Funktion: ' + wetter,
            'Fahrzeit-Funktion: ' + route,
            'Hinweis: Eine zusammengesetzte Antwort ("Termin und Wetter habe ich, die Fahrzeit nicht") gibt es heute nicht, weil die Teile nicht zu EINER Antwort verbunden werden (siehe B3).'
        ]);
    }

    /* ===== 9. Selbst-Meldungen (nur Protokoll, nichts wird unterdrückt) ===== */
    {
        const M = starte({ native: true, jetzt: '2026-10-28T12:00:00+01:00' });
        schichtSetzen(M, 'spaet');
        await M.ki('Arzttermin in Hamburg heute um 14 Uhr', [{ type: 'calendar', calendar_text: 'Arzt Hamburg', calendar_time: '2026-10-28T14:00:00', calendar_location: 'Hamburg' }]);
        M.ereignisse.length = 0;
        await M.vorspulen(150 * 60 * 1000);   // bis 14:30, in Minutenschritten laufen alle Zeitgeber der App
        const ev = M.ereignisse.slice();
        let letzte = null;
        const zeilen = ev.map(e => {
            const min = (h => h[0] * 60 + h[1])(e.zeit.split(':').map(Number));
            const abstand = letzte === null ? '-' : (min - letzte) + ' min';
            letzte = min;
            return e.zeit + ' | ' + e.art + ' | ' + e.modul + ' | Abstand zur vorigen: ' + abstand + ' | ' + kurz(e.text, 90);
        });
        const doppelt = ev.filter((e, i) => ev.findIndex(x => x.art === e.art && x.text === e.text) !== i);
        ist('31', 'Meldungen: Termin mit Ort in 2 Stunden (Arzt Hamburg 14:00)', 'Uhr läuft von 12:00 bis 14:30, es wird nichts angesagt außer was die App von selbst tut', { modul: ev.map(e => e.modul).filter((v, i, a) => a.indexOf(v) === i).join('+') || 'niemand', mehrere: new Set(ev.map(e => e.modul)).size > 1, aenderungen: {}, gesagt: ev.filter(e => e.art === 'sprechen').map(e => e.text) }, [
            ev.length ? 'Protokoll (Zeit | Art | Modul | Abstand | Text, Priorität: unbekannt/nicht geführt, Termin-Bezug: Arzt Hamburg): ' + zeilen.join(' ## ') : 'Keine Selbst-Meldung in 150 Minuten (in der Attrappe ohne Standort, Netz und Sichtbarkeit sprechen viele Module bewusst nicht).',
            'Doppelte Meldungen mit gleichem Text: ' + doppelt.length
        ]);
        const N = starte({ native: true, jetzt: '2026-10-28T19:30:00+01:00' });
        schichtSetzen(N, 'frueh');
        N.ereignisse.length = 0;
        await N.vorspulen(11 * 60 * 60 * 1000);
        const ev2 = N.ereignisse.slice(); let l2 = null;
        const z2 = ev2.map(e => { const hm = e.zeit.split(':').map(Number); let min = hm[0] * 60 + hm[1]; if (min < 12 * 60 && l2 !== null && l2 > 12 * 60) min += 1440; const a = l2 === null ? '-' : (min - l2) + ' min'; l2 = min; return e.zeit + ' | ' + e.art + ' | ' + e.modul + ' | Abstand: ' + a + ' | ' + kurz(e.text, 80); });
        ist('32', 'Meldungen: Abend vor Frühschicht bis Morgen', 'Uhr läuft von Mi 19:30 bis Do 06:30 (Frühschicht)', { modul: ev2.map(e => e.modul).filter((v, i, a) => a.indexOf(v) === i).join('+') || 'niemand', mehrere: new Set(ev2.map(e => e.modul)).size > 1, aenderungen: {}, gesagt: ev2.filter(e => e.art === 'sprechen').map(e => e.text) }, [
            ev2.length ? 'Protokoll: ' + z2.join(' ## ') : 'Keine Selbst-Meldung in der Attrappe.',
            'Brücke (Pläne/Pushes an die Handy-App): ' + (N.ereignisse.filter(e => e.art === 'brücke').map(e => e.text).slice(0, 4).join(' ; ') || 'keine')
        ]);
    }

    /* ===== 10. KI-Anweisung ===== */
    {
        const prompt = String(A.sb.buildSystemPrompt() || '');
        check('Anweisung an die KI: wird erzeugt und ist nicht leer', prompt.length > 2000, 'Länge: ' + prompt.length);
        ist('33', 'KI-Anweisung', 'buildSystemPrompt()', { modul: 'prompt.js + 11 Erweiterungen', aenderungen: {}, gesagt: [] }, ['Länge der Anweisung: ' + prompt.length + ' Zeichen']);
        for (const [stichwort, quelle] of [['MITDENK|mitdenk', 'ki_mitdenken'], ['FOLGEFRAGEN', 'contextplus'], ['Donnerstag|feste Termine|Termin', 'langzeit_erinnern']]) {
            check('Anweisung an die KI: Baustein von ' + quelle + ' ist enthalten', new RegExp(stichwort, 'i').test(prompt), stichwort);
        }
    }

    /* ===== 11. Server: Passwort-Schutz aller api/-Dateien ===== */
    {
        const dateien = fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js')).sort();
        const GEHEIM = 'test-geheim-123';
        const ergebnisse = [];
        for (const f of dateien) {
            const quelle = lies('api/' + f);
            let handler = null;
            try {
                const code = quelle.replace(/^\s*export\s+default\s+/m, 'module.exports.handler = ').replace(/^\s*export\s+(async\s+)?function\s+(\w+)/gm, '$1function $2').replace(/^\s*export\s+const\s+/gm, 'const ').replace(/^\s*import[^;]*;/gm, '');
                const mod = { exports: {} };
                const procAttrappe = { env: { APP_SECRET: GEHEIM, PROFILE_CODES: '', PUSH_CRON_KEY: 'cron-geheim', CRON_SECRET: 'cron-geheim', UPSTASH_VECTOR_REST_URL: 'https://attrappe.invalid', UPSTASH_VECTOR_REST_TOKEN: 'attrappe' } };
                new Function('module', 'exports', 'process', 'fetch', 'Buffer', 'require', code + '\n;')(mod, mod.exports, procAttrappe, async () => { throw new Error('Netz gesperrt'); }, Buffer, () => ({}));
                handler = mod.exports.handler || mod.exports.default;
            } catch (e) { ergebnisse.push({ f, geladen: false, grund: kurz(e.message, 80) }); continue; }
            if (typeof handler !== 'function') { ergebnisse.push({ f, geladen: false, grund: 'kein handler' }); continue; }
            const ruf = async (key) => {
                const res = { code: null, body: null, headers: {}, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; }, send(b) { this.body = b; return this; }, end() { return this; }, setHeader(k, v) { this.headers[k] = v; return this; }, getHeader() { return undefined; } };
                const req = { method: 'GET', headers: key === null ? {} : { 'x-app-key': key }, query: { action: 'status' }, body: {}, url: '/api/' + f };
                try { await handler(req, res); } catch (e) { return { code: 'wirft', body: kurz(e.message, 50) }; }
                return { code: res.code == null ? 200 : res.code, body: res.body };
            };
            const ohne = await ruf(null), falsch = await ruf('falsch'), richtig = await ruf(GEHEIM);
            ergebnisse.push({ f, geladen: true, ohne: ohne.code, falsch: falsch.code, richtig: richtig.code });
        }
        const geladen = ergebnisse.filter(e => e.geladen);
        check('Server: alle 11 Dateien in api/ lassen sich mit Attrappen laden', geladen.length === dateien.length, JSON.stringify(ergebnisse.filter(e => !e.geladen)));
        for (const e of geladen) {
            check('Server api/' + e.f + ': ohne Passwort kein Zugriff (401/403/405 oder Fehler, nie 200)', e.ohne !== 200, 'Ergebnis ohne Passwort: ' + e.ohne);
            check('Server api/' + e.f + ': falsches Passwort kein Zugriff (nie 200)', e.falsch !== 200, 'Ergebnis mit falschem Passwort: ' + e.falsch);
        }
        const mem = geladen.find(e => e.f === 'memory.js');
        check('Server api/memory.js (Fall 27): mit Datenbank-Attrappe liefert es ohne UND mit falschem Passwort 401 (Passwortschutz greift vor jedem Zugriff)', !!mem && mem.ohne === 401 && mem.falsch === 401, mem ? 'ohne ' + mem.ohne + ', falsch ' + mem.falsch : 'nicht geladen');
        ist('27', 'Server-Passwort', 'Alle api/-Dateien: ohne / falsch / richtig', { modul: 'api/*.js', aenderungen: {}, gesagt: [] },
            ergebnisse.map(e => e.geladen ? 'api/' + e.f + ': ohne ' + e.ohne + ', falsch ' + e.falsch + ', richtig ' + e.richtig : 'api/' + e.f + ': nicht ladbar (' + e.grund + ')'));
        const sync = lies('api/sync.js');
        ist('28', 'Cron-Schlüssel', 'api/sync.js: Schlüssel auch über die Adresse?', { modul: 'api/sync.js', aenderungen: {}, gesagt: [] }, [
            /req\.query\.key/.test(sync) ? 'Ja: der Cron-Schlüssel wird auch aus der Web-Adresse (req.query.key) akzeptiert' : 'Nein: nur Header']);
    }
    await festeTests();
}

/* ===== Feste Regressionstests (A = gewolltes Verhalten, freigegeben von Dino am 28.10.2026; B = bekannte Fehler) ===== */
async function festeTests() {
    const berlin = iso => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' });
    const hat = (arr, re) => arr.some(x => re.test(x.text || ''));

    /* A: Erinnerung löschen verlangt Rückfrage, nichts wird vorher gelöscht */
    {
        const E = starte({ native: true, jetzt: SPAET_MI });
        await E.ki('Erinnere mich morgen um 15 Uhr an den Zahnarzt', [{ type: 'reminder', reminder_text: 'Zahnarzt', reminder_time: '2026-10-29T15:00:00' }]);
        const l = await E.ki('Lösche die Erinnerung Zahnarzt', [{ type: 'reminder_delete', reminder_query: 'Zahnarzt' }]);
        check('Löschen (Fall 9): Erinnerung löschen stellt eine Rückfrage', (l.fehler || []).some(f => /Zahnarzt.*löschen/.test(f)), JSON.stringify(l.fehler));
        check('Löschen (Fall 9): vor der Bestätigung ist nichts gelöscht', E.zustand().erinnerungen.length === 1);
        const ja = await E.satz('Ja');
        check('Löschen (Fall 9): nach "Ja" ist genau diese Erinnerung weg', E.zustand().erinnerungen.length === 0, ja.modul);
        const nein = starte({ native: true, jetzt: SPAET_MI });
        await nein.ki('Erinnere mich morgen um 15 Uhr an den Zahnarzt', [{ type: 'reminder', reminder_text: 'Zahnarzt', reminder_time: '2026-10-29T15:00:00' }]);
        await nein.ki('Lösche die Erinnerung Zahnarzt', [{ type: 'reminder_delete', reminder_query: 'Zahnarzt' }]);
        await nein.satz('Nein');
        check('Löschen (Fall 9): nach "Nein" bleibt die Erinnerung', nein.zustand().erinnerungen.length === 1);
    }

    /* A: Termin + verknüpfte Erinnerung gemeinsam löschen, fremde Erinnerung bleibt (3b2-a) */
    {
        const D = starte({ native: true, jetzt: SPAET_MI });
        await D.ki('Erinnere mich morgen um 15 Uhr an den Zahnarzt', [{ type: 'reminder', reminder_text: 'Zahnarzt', reminder_time: '2026-10-29T15:00:00' }]);
        await D.vorspulen(2000);   // die App vergibt IDs aus der Uhrzeit; bei stehender Test-Uhr wären sie gleich
        await D.ki('Friseurtermin morgen um 13 Uhr', [{ type: 'calendar', calendar_text: 'Friseurtermin', calendar_time: '2026-10-29T13:00:00' }]);
        await D.satz('30 Minuten vorher.');
        const vor = D.zustand();
        const fr = vor.erinnerungen.filter(x => /friseur/i.test(x.text));
        check('Termin-Löschen (3b2-a): vor dem Löschen gibt es die Friseur-Erinnerung (30 Min vorher) und die Zahnarzt-Erinnerung', fr.length === 1 && hat(vor.erinnerungen, /zahnarzt/i), JSON.stringify(vor.erinnerungen));
        if (fr.length === 1) check('Termin-Löschen: die Friseur-Erinnerung liegt 30 Minuten vor 13:00', berlin(fr[0].zeit) === '2026-10-29 12:30:00', fr[0].zeit);
        await D.ki('Lösch den Friseurtermin morgen', [{ type: 'calendar_delete', calendar_query: 'Friseurtermin' }]);
        check('Termin-Löschen: vor der Bestätigung bleibt alles', D.zustand().termine.length === 1 && D.zustand().erinnerungen.length === vor.erinnerungen.length);
        await D.satz('Ja');
        const nach = D.zustand();
        check('Termin-Löschen: genau der Friseurtermin ist weg', nach.termine.length === 0);
        check('Termin-Löschen: die verknüpfte Friseur-Erinnerung ist ebenfalls weg (keine verwaiste Erinnerung)', !hat(nach.erinnerungen, /friseur/i), JSON.stringify(nach.erinnerungen));
        check('Termin-Löschen: die fremde Zahnarzt-Erinnerung bleibt', hat(nach.erinnerungen, /zahnarzt/i), JSON.stringify(nach.erinnerungen));
    }

    /* B: ein "Ja" bestätigt zwei unabhängige Löschfragen (3b2-b) */
    {
        const D = starte({ native: true, jetzt: SPAET_MI });
        await D.ki('Erinnere mich morgen um 15 Uhr an den Zahnarzt', [{ type: 'reminder', reminder_text: 'Zahnarzt', reminder_time: '2026-10-29T15:00:00' }]);
        await D.ki('Friseurtermin morgen um 13 Uhr', [{ type: 'calendar', calendar_text: 'Friseurtermin', calendar_time: '2026-10-29T13:00:00' }]);
        await D.ki('Lösche die Erinnerung Zahnarzt', [{ type: 'reminder_delete', reminder_query: 'Zahnarzt' }]);
        const l2 = await D.ki('Lösch den Friseurtermin morgen', [{ type: 'calendar_delete', calendar_query: 'Friseurtermin' }]);
        await D.satz('Ja');
        const z = D.zustand();
        bekannterFehler('3b2-b: ein "Ja" bestätigt nur die aktuelle Löschfrage (Zahnarzt-Erinnerung bleibt, Friseurtermin weg)', z.termine.length === 0 && hat(z.erinnerungen, /zahnarzt/i),
            'Ist: Termine ' + z.termine.length + ', Erinnerungen ' + z.erinnerungen.map(x => x.text).join(',') + '; 2. Frage: ' + JSON.stringify(l2.fehler));
        bekannterFehler('3b: die Löschfrage zum Friseurtermin ist eigenständig (kein "Und den Termin …?")', !(l2.fehler || []).some(f => /^Und /.test(f)), JSON.stringify(l2.fehler));
    }

    /* B: Löschen ohne Treffer darf keinen anderen Termin vorschlagen (3d) */
    {
        const B = starte({ native: true, jetzt: SPAET_MI });
        await B.ki('Friseur morgen 13 Uhr', [{ type: 'calendar', calendar_text: 'Friseur', calendar_time: '2026-10-29T13:00:00' }]);
        await B.ki('Zahnarzt morgen 15 Uhr', [{ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: '2026-10-29T15:00:00' }]);
        const d = await B.ki('Lösch den Tierarzttermin', [{ type: 'calendar_delete', calendar_query: 'Tierarzt' }]);
        const text = (d.fehler || []).concat(d.gesagt || [], d.notizen || []).join(' ');
        bekannterFehler('3d: ohne Treffer sagt Jarvis "keinen passenden Tierarzttermin gefunden" und fragt nichts anderes', !/Zahnarzt|Friseur/.test(text) && /nicht gefunden|keinen|kein /i.test(text), kurz(text, 160));
        check('3d: ohne Bestätigung wird in keinem Fall ein Termin gelöscht', B.zustand().termine.length === 2);
    }

    /* A: Lesen und Orte */
    {
        const L = starte({ native: true, jetzt: SPAET_MI });
        const k = await L.satz('Was steht morgen in meinem Kalender?');
        check('Kalender lesen (Fall 10): lokal von was_steht_an beantwortet', k.lokal && k.modul === 'was_steht_an', k.modul);
        const O = starte({ native: true, jetzt: SPAET_MI, fetch: async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }) });
        let n = O.aufrufe.length; await O.satz('Gibt es Apotheken in Wentorf?');
        const u1 = decodeURIComponent(O.aufrufe.slice(n).join(' '));
        check('Ortssuche (13b): der genannte Ort Wentorf wird angefragt', /Wentorf/.test(u1), u1);
        check('Ortssuche (13b): ein früherer Ort taucht nicht auf', !/Schwarzenbek/i.test(u1), u1);
        await O.satz('Wo ist Penny in Schwarzenbek?');
        n = O.aufrufe.length; await O.satz('Wie wird morgen das Wetter in Hamburg?');
        const u2 = decodeURIComponent(O.aufrufe.slice(n).join(' '));
        check('Kontextwechsel (16): der neue Ort Hamburg wird angefragt', /Hamburg/.test(u2), u2);
        check('Kontextwechsel (16): Schwarzenbek überschreibt Hamburg nicht', !/Schwarzenbek/i.test(u2), u2);
    }

    /* A: Gedächtnis */
    {
        const G = starte({ native: true, jetzt: SPAET_MI });
        const vor = G.store['helfer_memory'] || '';
        await G.satz('Heute habe ich keine Lust auf Pizza');
        check('Gedächtnis (17c): "keine Lust auf Pizza" landet nicht im Langzeitgedächtnis', (G.store['helfer_memory'] || '') === vor && !/pizza/i.test(JSON.stringify(G.store['helfer_memory'] || '')));
    }

    /* A: Avatar und Heimweg */
    {
        const H = starte({ native: true, jetzt: SPAET_MI });
        const hw = await H.satz('Heimweg');
        check('Heimweg (23): wird lokal von plan_ansagen übernommen', hw.lokal && /plan_ansagen/.test(hw.modul || ''), hw.modul);
    }

    /* B: Halbe Antwort und Browser ohne Handy-App */
    {
        const W = starte({ native: true, jetzt: SPAET_MI });
        const w = await W.satz('Was steht Samstag an und was könnten wir danach mit den Kindern machen?');
        bekannterFehler('15b: Antwort deckt beide Teile ab (Kalender und Ausflug) oder sagt, dass ein Teil fehlt', /Ausflug|Kinder|Vorschl|zweiten Teil|nicht beantworten/i.test((w.gesagt || []).join(' ')), kurz((w.gesagt || []).join(' '), 120));
        const BR = starte({ native: false, jetzt: SPAET_MI });
        const v = await BR.satz('Vertretung nach 5 Minuten');
        bekannterFehler('24b: im Browser ohne Handy-App kommt der Hinweis "nur in der Handy-App"', /Handy-App/i.test((v.gesagt || []).join(' ')), v.lokal ? 'lokal: ' + v.modul : 'geht still an die KI');
    }
    /* ===== Freigegebene Sollwerte aus der Kategorie D (Dino, 28.10.2026). Noch nicht erfüllt = bekannter Fehler ===== */
    {
        const Q = starte({ native: true, jetzt: SPAET_MI });
        const q = await Q.satz('Da waren wir schon');
        bekannterFehler('D2: "Da waren wir schon" ohne vorherigen Vorschlag fragt nach, wo ihr wart', q.lokal && /wo.*(wart|gewesen|war)/i.test((q.gesagt || []).join(' ')), q.lokal ? kurz((q.gesagt || []).join(' '), 100) : 'geht an die KI');

        const P = starte({ native: true, jetzt: SPAET_MI, fetch: async () => ({ ok: false, status: 503, json: async () => ({}), text: async () => '' }) });
        let n = P.aufrufe.length; const o1 = await P.satz('Wo ist Penny in Schwarzenbek?');
        const u = decodeURIComponent(P.aufrufe.slice(n).join(' '));
        bekannterFehler('D5a: ein genannter Ort (Schwarzenbek) reicht, die Suche verlangt keine Standortfreigabe', !/Ohne Standort/i.test((o1.gesagt || []).join(' ')) && /Schwarzenbek/.test(u), kurz((o1.gesagt || []).join(' '), 100) + ' | Anfragen: ' + (u || 'keine'));
        const o2 = await P.satz('Zeig mir Restaurants in der Nähe');
        bekannterFehler('D5b: "in der Nähe" wird lokal als Standortbezug behandelt (mit klarer Meldung, wenn der Standort fehlt)', o2.lokal && /Standort/i.test((o2.gesagt || []).join(' ')), o2.lokal ? kurz((o2.gesagt || []).join(' '), 100) : 'geht an die KI');

        const M = starte({ native: true, jetzt: SPAET_MI });
        await M.ki('Merk dir: mein Friseur ist Anja in der Bahnhofstraße', [{ type: 'memory_store', memory_key: 'friseur', memory_value: 'Anja in der Bahnhofstraße' }]);
        const t = await M.ki('Friseurtermin morgen um 13 Uhr', [{ type: 'calendar', calendar_text: 'Friseurtermin', calendar_time: '2026-10-29T13:00:00' }]);
        const alles = JSON.stringify(t.aenderungen) + ' ' + (t.notizen || []).join(' ') + ' ' + (M.store['helfer_calendar_entries'] || '');
        bekannterFehler('D6: Termin "Friseurtermin" übernimmt die gemerkte Adresse als Ort und sagt es dazu', /Bahnhofstra/.test(M.store['helfer_calendar_entries'] || '') && /Adresse|Anja/.test((t.notizen || []).join(' ')), kurz(alles, 120));

        const prompt = M.sb.buildSystemPrompt ? String(M.sb.buildSystemPrompt() || '') : '';
        bekannterFehler('D3: die KI-Anweisung enthält die Regel "Termin ohne Ort bei Wetter/Abfahrt: nachfragen, nie raten"', /Wo ist der Termin/i.test(prompt), 'Regel nicht gefunden');
        check('D3 (heute schon): die Anweisung kennt die Regel "Und der Ort?" beim Anlegen', /Und der Ort\?/.test(prompt), 'Länge ' + prompt.length);
    }
}

function bericht() {
    const z = [];
    z.push('# Ist-Zustand der Jarvis-Prüfstrecke (Bestandsaufnahme, Stufe 1)\n');
    z.push('Stand: 28.10.2026, feste Uhr Mittwoch 10:00 Berlin, Spätschicht. Nichts davon ist ein Sollwert. Erst nach Freigabe wird daraus ein fester Test oder ein Eintrag in die Fehlerliste.\n');
    for (const e of IST) {
        z.push('## ' + e.nr + ' | ' + e.thema + '\n');
        z.push('- **Satz:** ' + e.satz);
        z.push('- **Modul:** ' + e.modul);
        z.push('- **Weg:** ' + e.weg);
        z.push('- **Gespeichert/geändert:** ' + e.gespeichert);
        z.push('- **Sprachausgabe:** ' + e.sprachausgabe);
        if (e.notizen) z.push('- **Hinweise der App:** ' + e.notizen);
        z.push('- **Mehrere Module:** ' + e.mehrereModule);
        z.push('- **Auffälligkeiten:** ' + e.auffaellig + '\n');
    }
    return z.join('\n');
}

const WACHHUND = setTimeout(() => { console.log('Prüfstrecke hängt. Letzter dokumentierter Fall: ' + (IST.length ? IST[IST.length - 1].nr : 'keiner') + '; ' + ok + ' ok, ' + fehler + ' Fehler.'); process.exit(1); }, 270000);
haupt().then(() => {
    clearTimeout(WACHHUND);
    if (process.env.IST_BERICHT) fs.writeFileSync(path.join(ROOT, process.env.IST_BERICHT), bericht());
    console.log('Ist-Zustand: ' + IST.length + ' Fälle dokumentiert' + (process.env.IST_BERICHT ? ' -> ' + process.env.IST_BERICHT : ' (mit IST_BERICHT=tests/ist-zustand.md die Tabelle schreiben)'));
    const beh = BEKANNT.filter(b => b.behoben), off = BEKANNT.filter(b => !b.behoben);
    console.log('\nBekannte Fehler (Kategorie B, Sollwert festgelegt): ' + off.length + ' offen, ' + beh.length + ' behoben');
    off.forEach(b => console.log('  ○ offen: ' + b.name + (b.info ? '  →  ' + b.info : '')));
    beh.forEach(b => console.log('  ✓ behoben: ' + b.name + '  (bitte in check() umstellen)'));
    if (fehler) { console.log('\n' + fehler + ' Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.'); process.exit(1); }
    console.log('\nPrüfstrecke in Ordnung (' + ok + ' Prüfungen).');
}).catch(e => { console.log('Prüfstrecke abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
