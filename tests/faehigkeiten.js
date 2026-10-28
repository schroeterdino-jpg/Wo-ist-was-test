/* ============================================================
   TESTS für das Fähigkeiten-Verzeichnis (B1). Start: node tests/faehigkeiten.js
   Prüft, dass js/faehigkeiten.js rein beschreibend ist und zur echten App passt:
   Dateien, Aktionsarten, Befehle der Kette und ZaneNative-Angaben müssen es wirklich geben,
   und jeder Intent hat genau einen Hauptbesitzer (andere Fähigkeiten verweisen nur als Abhängigkeit).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const alleJs = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).map(f => ({ f, t: lies('js/' + f) }));

(async () => {
    const A = starte({ native: true, jetzt: '2026-10-28T10:00:00+01:00' });
    /* Voraussetzungen für Beispielsätze: Schicht der Woche eingetragen, ein Gegenstand im Gedächtnis */
    const spaetschicht = () => { A.store['jv_schicht'] = JSON.stringify({ base: A.sb._schichtTest.weekNo({ y: 2026, m: 10, d: 28 }), shift: 'spaet', times: { frueh: 420, spaet: 765 }, auto: true }); };
    spaetschicht();
    await A.ki('Ich lege meinen Schlüssel unters Kopfkissen', [{ type: 'memory_store', memory_key: 'schlüssel', memory_value: 'unterm Kopfkissen' }]);
    A.vorspulen(2000);
    const F = A.sb.jvFaehigkeiten;
    check('Verzeichnis ist geladen', !!F && Array.isArray(F.liste));
    if (!F) { console.log('Abbruch'); process.exit(1); }
    const kette = A.kette().map(s => s.replace(/^\S+\s/, ''));
    const IDS = ['kalender', 'wetter', 'fahrzeit_navigation', 'erinnerungen', 'gedaechtnis', 'fotos', 'schicht', 'preissuche'];
    check('genau die acht Fähigkeiten', F.liste.map(f => f.id).join() === IDS.join(), F.liste.map(f => f.id).join());
    check('eingefroren (nur lesbar)', Object.isFrozen(F) && Object.isFrozen(F.liste) && Object.isFrozen(F.liste[0].intents[0]));

    const ARTEN = ['lesen', 'aendern', 'kritisch'], TYPEN = ['aktion', 'befehl', 'basis', 'ki'], JNT = ['ja', 'nein', 'teilweise'];
    const besitzer = {};
    for (const f of F.liste) {
        const n = f.id + ': ';
        check(n + 'Pflichtfelder', f.name && f.beschreibung && Array.isArray(f.intents) && f.intents.length && Array.isArray(f.abhaengigkeiten) && Array.isArray(f.module) && Array.isArray(f.bekannteGrenzen));
        check(n + 'Handy-App-Angabe', JNT.includes(f.handyApp) && !!f.handyAppDetail);
        check(n + 'proaktiv-Angabe', f.proaktiv && JNT.includes(f.proaktiv.wert) && Array.isArray(f.proaktiv.ausloeser));
        check(n + 'proaktiv "nein" hat keine Auslöser, sonst mindestens einen', (f.proaktiv.wert === 'nein') === (f.proaktiv.ausloeser.length === 0));
        for (const a of f.proaktiv.ausloeser) {
            check(n + 'Auslöser ' + a.modul + ': Datei da, Art gültig', fs.existsSync(path.join(ROOT, a.modul)) && a.wann && a.art.length && a.art.every(x => ['Sprache', 'Push', 'Karte', 'Hintergrundprüfung'].includes(x)));
        }
        for (const m of f.module) check(n + 'Modul ' + m + ' existiert', fs.existsSync(path.join(ROOT, m)));
        for (const it of f.intents) {
            const k = it.typ + ':' + it.bezug;
            check(n + 'Intent ' + k + ' gültig', TYPEN.includes(it.typ) && ARTEN.includes(it.art) && it.bezug && Array.isArray(it.vorgaenge) && it.vorgaenge.length);
            (besitzer[k] = besitzer[k] || []).push(f.id);
            if (it.typ === 'aktion') check(n + 'Aktionsart ' + it.bezug + ' kommt im Code vor', alleJs.some(d => new RegExp("['\"]" + it.bezug + "['\"]").test(d.t)));
            if (it.typ === 'befehl') check(n + 'Befehl ' + it.bezug + ' steht in der Befehlsliste', kette.includes(it.bezug), 'Kette: ' + kette.join(','));
            if (it.typ === 'basis') check(n + 'Grundfunktion ' + it.bezug + ' existiert', alleJs.some(d => d.t.includes('function ' + it.bezug)));
            if (it.typ === 'ki' && it.pruefung) check(n + 'KI-Weg: Stichwort "' + it.pruefung + '" steht in prompt.js', lies('js/prompt.js').includes(it.pruefung));
            for (const b of it.beispiele || []) {
                check(n + 'Beispiel hat Satz und Weg', b.satz && ['lokal', 'ki'].includes(b.weg));
                if (b.weg === 'lokal' && b.modul) check(n + 'Beispiel-Modul ' + b.modul + ' in Kette', kette.includes(b.modul));
            }
        }
        for (const d of f.abhaengigkeiten) {
            check(n + 'Abhängigkeit gültig', ['faehigkeit', 'kontext', 'bereich', 'dienst'].includes(d.typ) && d.ref);
            if (d.typ === 'faehigkeit') {
                check(n + 'Abhängigkeit ' + d.ref + ' ist eine echte Fähigkeit und nicht diese selbst', IDS.includes(d.ref) && d.ref !== f.id);
                check(n + 'Abhängigkeit ' + d.ref + ' hat Zweck und Pflicht-Angabe', !!d.wofuer && typeof d.pflicht === 'boolean');
            }
        }
    }
    /* Regel: jeder Intent hat genau einen Hauptbesitzer */
    for (const k of Object.keys(besitzer)) check('Intent ' + k + ' hat genau einen Hauptbesitzer', besitzer[k].length === 1, besitzer[k].join('+'));
    check('besitzerVon findet den Besitzer', F.besitzerVon('aktion', 'calendar_delete').id === 'kalender' && F.besitzerVon('befehl', 'preissuche').id === 'preissuche' && F.besitzerVon('aktion', 'gibtsnicht') === null);
    const kalenderTypen = F.nach('kalender').intents.filter(i => i.typ === 'aktion').map(i => i.bezug);
    check('Kalender besitzt calendar, _update, _delete, _search', ['calendar', 'calendar_update', 'calendar_delete', 'calendar_search'].every(x => kalenderTypen.includes(x)));

    /* Fahrzeit und Navigation: EINE Fähigkeit mit vier getrennt beschriebenen Vorgängen */
    const fz = F.nach('fahrzeit_navigation');
    const vorg = [].concat(...fz.intents.map(i => i.vorgaenge)).join(' | ');
    for (const v of ['Fahrzeit ermitteln', 'Abfahrtszeit bestimmen', 'Route berechnen', 'Navigation starten']) check('Fahrzeit/Navigation beschreibt "' + v + '"', vorg.includes(v));
    check('Navigation starten ist "ändern" (löst etwas aus), Fahrzeit ist "lesen"', F.besitzerVon('aktion', 'navigate') === fz && fz.intents.find(i => i.bezug === 'navigate').art === 'aendern' && fz.intents.find(i => i.bezug === 'travel_time').art === 'lesen');
    check('Löschen und Weiterschicken sind "kritisch"', F.nach('kalender').intents.find(i => i.bezug === 'calendar_delete').art === 'kritisch' && F.nach('erinnerungen').intents.find(i => i.bezug === 'reminder_delete').art === 'kritisch' && F.nach('fotos').intents.find(i => i.bezug === 'fotosenden').art === 'kritisch');
    check('Übergreifende Löschregel verweist auf eine echte Datei und Befehl', F.uebergreifend.every(u => fs.existsSync(path.join(ROOT, u.modul)) && kette.includes(u.befehl) && u.gilt_fuer.every(i => IDS.includes(i))));

    /* Handy-App: was als abhängig angegeben ist, muss ZaneNative wirklich benutzen */
    for (const f of F.liste) {
        const nutztNative = f.module.filter(m => m.startsWith('js/')).some(m => /ZaneNative/.test(lies(m)));
        if (f.handyApp !== 'nein') check(f.id + ': Handy-App-Abhängigkeit stimmt mit ZaneNative im Code überein', nutztNative);
    }
    check('Fotos: WhatsApp-Senden braucht die Handy-App (fotosenden.js)', /ZaneNative/.test(lies('js/fotosenden.js')));
    check('Schicht: Ansagen planen über ZaneNative.planAnsagen', /planAnsagen/.test(lies('js/plan_ansagen.js')));

    /* B2: Jeder lokale Beispielsatz mit Modul wird von genau diesem Modul übernommen (wie in der App) */
    for (const f of F.liste) for (const it of f.intents) for (const b of it.beispiele || []) {
        if (b.weg !== 'lokal' || !b.modul) continue;
        spaetschicht();
        const r = await A.satz(b.satz);
        check('Beispielsatz "' + b.satz + '" wird von ' + b.modul + ' übernommen', r.lokal && String(r.modul).split('+').includes(b.modul), 'war: ' + r.lokal + ' ' + r.modul);
        A.vorspulen(2000);
    }

    /* B2: Hilfe zeigt die Fähigkeiten zusätzlich zu den alten Themen */
    let karten = null; A.sb.showActionCards = c => { karten = c; }; A.sb.clearActionCards = () => { karten = null; };
    const helpTexte = lies('js/help.js');
    const alteThemen = (helpTexte.match(/^\s+\{ key: '/gm) || []).length;
    A.sb.showHelpOverview();
    check('Hilfe-Übersicht: acht Fähigkeiten-Karten plus alle alten Themen', karten && karten.length === 8 + alteThemen, karten && karten.length + ' statt ' + (8 + alteThemen));
    check('Hilfe-Übersicht: die ersten acht Karten sind die Fähigkeiten in dieser Reihenfolge', karten && F.liste.every((f, i) => karten[i].title === f.name && karten[i].onclick === "showFaehigkeitHelp('" + f.id + "')"));
    check('Hilfe-Übersicht: alte Themen unverändert dahinter (Termine & Kalender zuerst)', karten && karten[8].title === 'Termine & Kalender');
    for (const f of F.liste) {
        A.sb.showFaehigkeitHelp(f.id);
        const t = (karten || []).map(c => c.title);
        const bsp = [].concat(...f.intents.map(i => (i.beispiele || []).map(b => b.satz)));
        check('Hilfe ' + f.id + ': zeigt Beispielsätze (höchstens vier) und die Rückkehr-Karte', karten && bsp.slice(0, 4).every(x => t.includes(x)) && t[t.length - 1] === 'Alle Themen');
        check('Hilfe ' + f.id + ': Handy-App-Hinweis genau dann, wenn die Fähigkeit sie braucht', (f.handyApp !== 'nein') === t.some(x => /Handy-App/.test(x)));
        check('Hilfe ' + f.id + ': Hinweis "meldet sich von selbst" genau bei proaktiven Fähigkeiten', (f.proaktiv.wert !== 'nein') === t.some(x => /von selbst/.test(x)));
        check('Hilfe ' + f.id + ': Rückfrage-Hinweis genau bei Fähigkeiten mit kritischem Schritt', f.intents.some(i => i.art === 'kritisch') === t.some(x => /Fragt vor/.test(x)));
    }
    A.sb.showFaehigkeitHelp('gibtsnicht');
    check('Hilfe: unbekannte Fähigkeit führt zur Übersicht', karten && karten.length === 8 + alteThemen);

    /* Rein beschreibend: keine Einhängung, kein Speicher, keine Netzaufrufe (die Hilfe liest nur) */
    const quelle = lies('js/faehigkeiten.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/'(?:[^'\\\n]|\\.)*'/g, "''");   // ohne Kommentare und ohne Text in Anführungszeichen
    check('faehigkeiten.js hängt sich nirgends ein', !/jvCommands|jvChain|executeAction|localStorage|sessionStorage|fetch\(|ZaneNative|speechSynthesis/.test(quelle));
    check('keine jv_/nova_ Schlüssel in faehigkeiten.js', !/['"](jv_|nova_)/.test(quelle));
    const chain0 = A.kette().length;
    check('Befehlsliste unverändert (95 Einträge: 94 + mehrfachfrage aus B4)', chain0 === 95, String(chain0));

    console.log(fehler ? '\n' + fehler + ' Fähigkeiten-Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : 'Fähigkeiten-Verzeichnis in Ordnung (' + ok + ' Prüfungen).');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
