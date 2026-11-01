/* ============================================================
   TESTS für B4, Stufe 1: lesende Mehrfachfragen. Start: node tests/mehrfachfrage.js
   1. Beweis, dass jede in der Registry als "reine Auskunft" markierte Auskunft wirklich sicher ist (sonst darf sie nicht einzeln laufen)
   2. Erkennung (eng): was getrennt wird und was nicht
   3. Verhalten: die vier Ausgangsfälle, Paar-Tabelle, Teilfehler, nichts Schreibendes, höchstens eine Antwort, kein Rückfall in den Handler
   4. Unverändertes: Einzelfragen, reine KI-Kombinationen, bestehender Mehrfach-Befehlsweg (Vergleich mit abgeschaltetem Handler)
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const gleich = (name, ist, soll) => check(name, JSON.stringify(ist) === JSON.stringify(soll), '\n      ist:  ' + JSON.stringify(ist) + '\n      soll: ' + JSON.stringify(soll));
const JETZT = '2026-10-28T10:00:00+01:00', KI_ANTWORT = 'KI-Antwort: Morgen 12 Grad und leichter Regen.';
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ant = d => ({ ok: true, status: 200, json: async () => d });
const tick = n => new Promise(async res => { for (let i = 0; i < (n || 5); i++) await new Promise(r => setImmediate(r)); res(); });

function vorbereiten(A) {
    A.store['jv_schicht'] = JSON.stringify({ base: A.sb._schichtTest.weekNo({ y: 2026, m: 10, d: 28 }), shift: 'spaet', times: { frueh: 420, spaet: 765 }, auto: true });
}
async function neueApp(o) {
    o = o || {};
    const kiCalls = [];
    const A = starte({ jetzt: JETZT, festerZufall: true, fetch: async (u, opts) => {
        if (/\/api\/groq/.test(u)) {
            const b = JSON.parse(opts.body), letzte = String(b.messages[b.messages.length - 1].content); kiCalls.push(letzte);
            if (o.kiFehler) throw new Error('HTTP 500 fetch failed');
            return ant({ choices: [{ message: { content: JSON.stringify({ reply: o.kiReply === undefined ? KI_ANTWORT : o.kiReply, actions: o.kiAktionen || [] }) } }] });
        }
        throw new Error('offline (Attrappe): ' + u);
    } });
    vorbereiten(A);
    await A.ki('Ich lege meinen Schlüssel unters Kopfkissen', [{ type: 'memory_store', memory_key: 'schlüssel', memory_value: 'unterm Kopfkissen' }]);
    A.vorspulen(2000);
    if (o.umgehen) A.sb.jvMehrfachfrage.umgehen = true;
    return { A, kiCalls };
}
/* wie voice.js: erst die festen Befehle, sonst die KI */
async function lauf(satz, o) {
    const { A, kiCalls } = await neueApp(o);
    kiCalls.length = 0;
    const g0 = A.gesagt.length, e0 = A.ereignisse.length, z0 = JSON.stringify(A.zustand());
    let behandelt;
    await A.lassLaufen(async () => {
        behandelt = A.sb.handleLocalCommand(satz);
        if (!behandelt) await A.sb.sendToGroqSmart(satz);
        await tick(80);
    });
    return { A, kiCalls, behandelt, gesagt: A.gesagt.slice(g0), ereignisse: A.ereignisse.slice(e0).map(e => e.art + ':' + String(e.text).slice(0, 80)), zustand0: z0, zustand1: JSON.stringify(A.zustand()), geaendert: JSON.stringify({ t: A.zustand().termine, e: A.zustand().erinnerungen, g: A.zustand().gedaechtnis }) };
}

(async () => {
    /* ---------- 1. Beweis: reine Auskunft ---------- */
    const { A: A0 } = await neueApp();
    const F = A0.sb.jvFaehigkeiten;
    gleich('Registry: genau diese drei Befehle sind als reine Auskunft markiert', F.reineAuskuenfte().slice().sort(), ['gedaechtnis_zeit', 'schicht_auskunft', 'vollmond_auskunft', 'was_steht_an']);
    for (const f of F.liste) for (const it of f.intents) if (it.reineAuskunft) check(f.id + '/' + it.bezug + ': Markierung nur bei Befehl + lesen', it.typ === 'befehl' && it.art === 'lesen');
    check('Registry bleibt eingefroren', Object.isFrozen(F) && Object.isFrozen(F.liste[0].intents[0]));
    const SAETZE = {
        was_steht_an: ['Was steht heute an?', 'Was steht morgen an?', 'Was steht Samstag an?', 'Was steht morgen in meinem Kalender?'],
        schicht_auskunft: ['Wann beginnt meine Spätschicht?', 'Wann beginnt meine Frühschicht?'],
        gedaechtnis_zeit: ['Wann habe ich den Schlüssel abgelegt?'],
        vollmond_auskunft: ['Wann ist der nächste Vollmond?', 'Wann ist Vollmond?', 'Wann kommt der nächste Vollmond?']
    };
    for (const f of F.liste) for (const it of f.intents) if (it.reineAuskunft) for (const b of it.beispiele || []) if (b.weg === 'lokal' && b.modul === it.bezug && !SAETZE[it.bezug].includes(b.satz)) SAETZE[it.bezug].push(b.satz);

    /* Beweis: zwei gleiche Apps; in der einen läuft der Befehl (mit abgefangener Sprache), in der Kontrolle nicht. Danach muss alles gleich sein. */
    async function beweisLauf(name, satz, mitBefehl) {
        const { A } = await neueApp();
        const sb = A.sb, zaehl = { executeAction: 0, openPanel: 0, cards: 0, open: 0 };
        const oe = sb.executeAction, op = sb.openPanel, oc = sb.showActionCards;
        sb.executeAction = function () { zaehl.executeAction++; return oe.apply(this, arguments); };
        sb.openPanel = function () { zaehl.openPanel++; return op && op.apply(this, arguments); };
        sb.showActionCards = function (c) { if (c && c.length) zaehl.cards++; return oc && oc.apply(this, arguments); };
        sb.open = function () { zaehl.open++; return null; };
        const href0 = String(sb.location && sb.location.href);
        const fang = []; let ergebnis = null, wirft = null, direkt = 0, unmittelbar = null;
        const z0 = JSON.stringify(A.zustand()), netz0 = A.aufrufe.length, ev0 = A.ereignisse.length, g0 = A.gesagt.length;
        if (mitBefehl) {
            const orig = sb.speak; sb.speak = function (t) { fang.push(String(t)); };
            try { ergebnis = !!sb.jvCommands.nur([name], satz); } catch (e) { wirft = e; }
            direkt = fang.length; sb.speak = orig;
            unmittelbar = { zustand: JSON.stringify(A.zustand()) === z0, netz: A.aufrufe.length === netz0, ereignisse: A.ereignisse.slice(ev0).filter(e => e.art !== 'sprechen').length, gesagt: A.gesagt.length === g0 };
        }
        await A.vorspulen(10000); await tick(20);
        return { zaehl, fang, ergebnis, wirft, direkt, unmittelbar, href0, href1: String(sb.location && sb.location.href), spaeter: { zustand: JSON.stringify(A.zustand()), netz: A.aufrufe.slice(), ereignisse: A.ereignisse.slice(ev0).filter(e => e.art !== 'sprechen').map(e => e.art + e.text), gesagt: A.gesagt.slice(g0) } };
    }
    async function beweis(name, satz) {   // gibt die Liste der verletzten Eigenschaften zurück
        const t = await beweisLauf(name, satz, true), k = await beweisLauf(name, satz, false), v = [];
        if (t.wirft || !t.ergebnis) v.push('wird nicht übernommen');
        if (t.direkt < 1 || !t.fang.join('').trim()) v.push('kein sofortiger Text');
        if (!t.unmittelbar || !t.unmittelbar.zustand || t.spaeter.zustand !== k.spaeter.zustand) v.push('Speicher geändert');
        if (!t.unmittelbar || !t.unmittelbar.netz || JSON.stringify(t.spaeter.netz) !== JSON.stringify(k.spaeter.netz)) v.push('Netzwerk');
        if (!t.unmittelbar || t.unmittelbar.ereignisse || JSON.stringify(t.spaeter.ereignisse) !== JSON.stringify(k.spaeter.ereignisse) || t.zaehl.openPanel || t.zaehl.cards) v.push('Fenster/Karte/Brücke');
        if (t.zaehl.open || t.href1 !== t.href0) v.push('Navigation');
        if (t.zaehl.executeAction !== k.zaehl.executeAction) v.push('Aktion ausgeführt');
        if (!t.unmittelbar || !t.unmittelbar.gesagt || JSON.stringify(t.spaeter.gesagt) !== JSON.stringify(k.spaeter.gesagt) || t.fang.length !== t.direkt) v.push('eigene Sprachausgabe (später oder an der Abfangstelle vorbei)');
        return v;
    }
    for (const name of F.reineAuskuenfte()) for (const satz of SAETZE[name] || []) {
        const v = await beweis(name, satz);
        check('Beweis reine Auskunft ' + name + ' "' + satz + '": synchron, ohne Speicher/Netz/Fenster/Navigation/Aktion/späteres Sprechen', v.length === 0, v.join(', '));
    }
    check('Beweis hat Zähne: Vollmond (öffnet ein Fenster) fällt durch', (await beweis('erweiterungen', 'Wann ist der nächste Vollmond?')).includes('Fenster/Karte/Brücke'));
    check('Beweis hat Zähne: Sonnenuntergang (spricht später) fällt durch', (await beweis('erweiterungen', 'Wann geht morgen die Sonne unter?')).length > 0);
    check('Beweis hat Zähne: Lagebild fällt durch', (await beweis('lagebild', 'Zeig mir das Lagebild')).length > 0);

    /* jvCommands.nur */
    {
        const J = A0.sb.jvCommands; const g0 = A0.gesagt.length;
        check('jvCommands.nur ist da', typeof J.nur === 'function');
        check('nur: unbekannter Name übernimmt nichts', J.nur(['gibtsnicht'], 'Was steht heute an?') === false);
        check('nur: nur der genannte Eintrag läuft, nicht localcommands.js und nicht die anderen', J.nur(['schicht_auskunft'], 'Was steht heute an?') === false);
        check('nur: nimmt kein Befehlswort außerhalb der Liste', J.nur(['was_steht_an'], 'Schalte das Licht an') === false);
        A0.gesagt.length = g0;
    }

    /* ---------- 2. Erkennung ---------- */
    const an = A0.sb.jvMehrfachfrage.analyse;
    const T = (satz, teile, abhaengig) => { const r = an(satz); gleich('Erkennung "' + satz + '"', r && { n: r.teile.length, a: r.abhaengig }, teile === null ? null : { n: teile, a: !!abhaengig }); };
    T('Was steht morgen im Kalender und wie wird das Wetter?', 2);
    T('Wie wird morgen das Wetter und wann ist der nächste Vollmond?', 2);
    T('Was steht Samstag an und was könnten wir danach mit den Kindern machen?', 2, true);
    T('Was steht morgen an? Wie wird das Wetter?', 2);
    T('Was steht morgen an und wann beginnt meine Spätschicht und wie wird das Wetter?', 3);
    T('Was steht morgen an und wann beginnt meine Spätschicht und wie wird das Wetter und wer hat Geburtstag?', null);
    T('Ich habe morgen um 15 Uhr einen Termin in Hamburg. Wie wird dort das Wetter und wann muss ich los?', null);
    T('Wann beginnt und endet meine Spätschicht?', null);
    T('Was steht morgen und übermorgen im Kalender?', null);
    T('Wer kommt morgen und wann gehen wir los?', 2);
    T('Wie warm und wie windig wird es morgen?', null);
    T('Wann und wo ist das Treffen?', null);
    T('Was kostet Brot und Milch zusammen?', null);
    T('Wenn es regnet, was steht morgen an und wie wird das Wetter?', null);
    T('Was steht morgen an und wie wird das Wetter falls es regnet?', null);
    T('Was steht morgen an und setz Milch auf die Einkaufsliste', null);
    T('Stell den Wecker auf 4 Uhr und wie wird das Wetter?', null);
    T('Was steht an und Wetter?', null);
    T('Protokoll Feierabend: was steht an und wie wird das Wetter', null);
    T('Wie wird das Wetter?', null);
    T('', null);
    T('Wie spät ist es und wann ist Sonnenuntergang dort?', 2, true);

    /* ---------- 3. Verhalten ---------- */
    let r;
    /* Fall 1: Kalender + Wetter */
    r = await lauf('Was steht morgen im Kalender und wie wird das Wetter?');
    check('Fall 1: vom neuen Weg übernommen', r.behandelt === true);
    check('Fall 1: genau ein KI-Aufruf, nur mit der Wetterfrage', r.kiCalls.length === 1 && /^Wie wird das Wetter\?/.test(r.kiCalls[0]) && !/Kalender/.test(r.kiCalls[0]), JSON.stringify(r.kiCalls));
    check('Fall 1: genau eine gesprochene Antwort', r.gesagt.length === 1, JSON.stringify(r.gesagt));
    check('Fall 1: Kalender (lokal, mit Schicht) und Wetter (KI) in der Reihenfolge der Fragen', r.gesagt.length === 1 && r.gesagt[0].indexOf('Morgen: Du hast Spätschicht, Beginn 13 Uhr 45.') === 0 && r.gesagt[0].indexOf(KI_ANTWORT) > 30, r.gesagt[0]);
    check('Fall 1: nichts gespeichert oder geändert (Termine, Erinnerungen)', JSON.parse(r.geaendert).t.length === 0 && JSON.parse(r.geaendert).e.length === 0);
    /* Fall 1 mit Teilfehler: KI fällt aus */
    r = await lauf('Was steht morgen im Kalender und wie wird das Wetter?', { kiFehler: true });
    check('Fall 1, Wetter fällt aus: Kalender bleibt, Wetter konkret genannt, nicht "Das meiste ist erledigt"', r.gesagt.length === 1 && r.gesagt[0].startsWith('Morgen: Du hast Spätschicht, Beginn 13 Uhr 45.') && r.gesagt[0].endsWith('Wetter konnte ich gerade nicht laden.') && !/Das meiste|Verzeih|Verbindung|HTTP|fetch/.test(r.gesagt[0]), JSON.stringify(r.gesagt));
    r = await lauf('Was steht morgen an und wie wird die Lage am Himmel?', { kiFehler: true });
    check('Teilfehler ohne Wetterwort: allgemeiner Satz, Kalender bleibt', r.gesagt.length === 1 && r.gesagt[0].endsWith('Dazu konnte ich gerade keine Antwort holen.') && r.gesagt[0].startsWith('Morgen:'), JSON.stringify(r.gesagt));

    /* Fall 2 (B4.1b: Wetter + Vollmond wird unten getrennt behandelt) und Fall 4: wie bisher, nicht halb aufgeteilt */
    for (const satz of ['Ich habe morgen um 15 Uhr einen Termin in Hamburg. Wie wird dort das Wetter und wann muss ich los?']) {
        const neu = await lauf(satz), alt = await lauf(satz, { umgehen: true });
        gleich('Regression "' + satz.slice(0, 45) + '…": Verhalten identisch zum abgeschalteten Handler (gesprochen, KI-Aufrufe, Änderungen)', { g: neu.gesagt, k: neu.kiCalls, b: neu.behandelt, z: neu.geaendert }, { g: alt.gesagt, k: alt.kiCalls, b: alt.behandelt, z: alt.geaendert });
        check('Regression "' + satz.slice(0, 45) + '…": ganzer Satz in einem KI-Aufruf, nicht aufgeteilt', neu.kiCalls.length === 1 && neu.kiCalls[0].includes(satz), JSON.stringify(neu.kiCalls));
    }

    /* Fall 3: Kalender + "danach": nicht zerlegt, was_steht_an verschluckt den Satz nicht mehr */
    const f3 = 'Was steht Samstag an und was könnten wir danach mit den Kindern machen?';
    r = await lauf(f3);
    check('Fall 3: ganzer Satz in EINEM KI-Aufruf', r.kiCalls.length === 1 && r.kiCalls[0].includes('Was steht Samstag an und was könnten wir danach mit den Kindern machen?'), JSON.stringify(r.kiCalls));
    check('Fall 3: was_steht_an hat nicht allein geantwortet ("nichts eingetragen" wird nicht gesprochen)', !r.gesagt.some(x => /nichts eingetragen/.test(x)) && r.gesagt.length === 1 && r.gesagt[0] === KI_ANTWORT, JSON.stringify(r.gesagt));
    const f3alt = await lauf(f3, { umgehen: true });
    check('Fall 3: ohne den neuen Weg (Abschaltflag) verschluckt was_steht_an den Satz wie früher; der Flag-Pfad funktioniert', f3alt.kiCalls.length === 0 && f3alt.gesagt.length === 1 && /nichts eingetragen/.test(f3alt.gesagt[0]), JSON.stringify(f3alt.gesagt));
    check('Fall 3: kein Rückfall in den Handler (genau ein KI-Aufruf, genau eine Antwort)', r.kiCalls.length === 1 && r.gesagt.length === 1);
    check('Fall 3: alle sieben Bezugswörter lösen den Bypass aus', await (async () => { for (const w of ['danach', 'dort', 'dann', 'dabei', 'damit', 'davor', 'dazu']) { const x = await lauf('Was steht morgen an und was machen wir ' + w + ' hier?'); if (!(x.kiCalls.length === 1 && x.gesagt.length === 1 && x.gesagt[0] === KI_ANTWORT)) return false; } return true; })());

    /* Fall 4: wie bisher (siehe oben) */

    /* Paar-Tabelle */
    const SICHER = { steht: 'Was steht morgen an', schicht: 'Wann beginnt meine Spätschicht', schluessel: 'Wann habe ich den Schlüssel abgelegt' };
    const KIQ = { wetter: 'Wie wird morgen das Wetter', zug: 'Wann fährt der nächste Zug nach Hamburg' };
    const einzel = {};
    for (const k of Object.keys(SICHER)) { const x = await lauf(SICHER[k] + '?'); einzel[k] = x.gesagt.join(' '); check('Einzelfrage ' + k + ': lokal, eine Antwort, keine KI', x.behandelt === true && x.gesagt.length === 1 && x.kiCalls.length === 0, JSON.stringify(x.gesagt)); }
    for (const a of Object.keys(SICHER)) for (const b of Object.keys(SICHER)) {
        if (a === b) continue;
        const x = await lauf(SICHER[a] + ' und ' + SICHER[b].charAt(0).toLowerCase() + SICHER[b].slice(1) + '?');
        check('Paar sicher+sicher ' + a + '+' + b + ': beide beantwortet in Reihenfolge, eine Antwort, keine KI', x.kiCalls.length === 0 && x.gesagt.length === 1 && x.gesagt[0].includes(einzel[a]) && x.gesagt[0].includes(einzel[b]) && x.gesagt[0].indexOf(einzel[a]) < x.gesagt[0].indexOf(einzel[b]), JSON.stringify(x.gesagt));
    }
    const einzelKI = {};
    for (const b of Object.keys(KIQ)) { const x = await lauf(KIQ[b] + '?'); einzelKI[b] = x.gesagt.join(' '); check('Einzelfrage KI ' + b + ': eine Antwort, ein KI-Aufruf', x.gesagt.length === 1 && x.kiCalls.length === 1, JSON.stringify(x.gesagt)); }
    for (const a of Object.keys(SICHER)) for (const b of Object.keys(KIQ)) for (const rev of [false, true]) {
        const s = rev ? KIQ[b] + ' und ' + SICHER[a].charAt(0).toLowerCase() + SICHER[a].slice(1) + '?' : SICHER[a] + ' und ' + KIQ[b].charAt(0).toLowerCase() + KIQ[b].slice(1) + '?';
        const x = await lauf(s);
        const pos = x.gesagt.length === 1 ? [x.gesagt[0].indexOf(einzel[a]), x.gesagt[0].indexOf(einzelKI[b])] : [-1, -1];
        check('Paar ' + (rev ? 'KI+sicher ' : 'sicher+KI ') + a + '+' + b + ': eine Antwort, ein KI-Aufruf nur mit der KI-Frage, Reihenfolge der Fragen', x.gesagt.length === 1 && x.kiCalls.length === 1 && x.kiCalls[0].startsWith(KIQ[b]) && !x.kiCalls[0].includes(SICHER[a]) && pos[0] >= 0 && pos[1] >= 0 && (rev ? pos[1] < pos[0] : pos[0] < pos[1]), JSON.stringify({ g: x.gesagt, k: x.kiCalls }));
    }
    {   /* drei Fragen: zwei sicher + eine KI: genau ein KI-Aufruf, eine Antwort */
        const x = await lauf('Was steht morgen an und wann beginnt meine Spätschicht und wie wird das Wetter?');
        check('Drei Fragen (2 sicher + 1 KI): ein KI-Aufruf, eine Antwort, alles drin', x.kiCalls.length === 1 && x.gesagt.length === 1 && x.gesagt[0].includes(einzel.steht) && x.gesagt[0].includes(einzel.schicht) && x.gesagt[0].includes(KI_ANTWORT) && !x.kiCalls[0].includes('Spätschicht') && !x.kiCalls[0].includes('steht'), JSON.stringify(x.gesagt));
        const y = await lauf('Wie wird das Wetter und was steht morgen an und wann fährt der nächste Zug nach Hamburg?');
        check('Drei Fragen (2 KI + 1 sicher): die zwei KI-Fragen in EINEM Aufruf', y.kiCalls.length === 1 && /Wetter/.test(y.kiCalls[0]) && /Zug/.test(y.kiCalls[0]) && !/steht/.test(y.kiCalls[0]) && y.gesagt.length === 1 && y.gesagt[0].includes(einzel.steht), JSON.stringify({ g: y.gesagt, k: y.kiCalls }));
    }
    /* Nichts Schreibendes über den neuen Weg */
    r = await lauf('Was steht morgen im Kalender und wie wird das Wetter?', { kiAktionen: [{ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: '2026-10-29T10:00:00+01:00' }, { type: 'reminder', reminder_text: 'x', reminder_time: '2026-10-29T09:00:00+01:00' }, { type: 'memory_store', memory_key: 'a', memory_value: 'b' }, { type: 'list_edit', list_name: 'einkauf', list_op: 'add', list_items: ['Milch'] }] });
    check('Schreibende Aktionen der KI werden über den Lese-Weg verworfen (Termine, Erinnerungen, Gedächtnis, Listen unverändert)', JSON.parse(r.geaendert).t.length === 0 && JSON.parse(r.geaendert).e.length === 0 && JSON.stringify(JSON.parse(r.geaendert).g) === JSON.stringify(JSON.parse((await lauf('Hallo wie geht es dir heute abend')).geaendert).g), r.geaendert);
    check('Lese-Weg: weiterhin genau eine Antwort', r.gesagt.length === 1, JSON.stringify(r.gesagt));
    r = await lauf('Wie wird morgen das Wetter?', { kiAktionen: [{ type: 'calendar', calendar_text: 'Zahnarzt', calendar_time: '2026-10-29T10:00:00+01:00' }] });
    check('Gewöhnlicher KI-Weg (ohne Lese-Flag) schreibt weiterhin (keine Verhaltensänderung für Einzelfragen)', JSON.parse(r.geaendert).t.length === 1, r.geaendert);

    /* ---------- 4. Unverändert ---------- */
    async function wieBisher(name, satz, o) {
        const neu = await lauf(satz, o), alt = await lauf(satz, Object.assign({}, o, { umgehen: true }));
        gleich(name + ': "' + satz.slice(0, 60) + '" unverändert', { g: neu.gesagt, k: neu.kiCalls, b: neu.behandelt, z: neu.zustand1 }, { g: alt.gesagt, k: alt.kiCalls, b: alt.behandelt, z: alt.zustand1 });
    }
    for (const s of ['Was steht morgen an?', 'Wann beginnt meine Spätschicht?', 'Wann habe ich den Schlüssel abgelegt?', 'Wie wird das Wetter?', 'Wann ist der nächste Vollmond?', 'Wie spät ist es?', 'Wann beginnt und endet meine Spätschicht?', 'Was steht morgen und übermorgen im Kalender?', 'Wer kommt morgen und wann gehen wir los?', 'Wie warm und wie windig wird es morgen?'])
        await wieBisher('Einzelfrage', s);
    for (const s of ['Wie wird das Wetter und wann fährt der nächste Zug nach Hamburg?', 'Wie wird morgen das Wetter und wann muss ich zum Zahnarzt losfahren?', 'Wann muss ich los und wie wird das Wetter dort?'])
        await wieBisher('Reine KI-Kombination', s);
    for (const s of ['Stell den Wecker auf 4 Uhr und setz Milch auf die Liste', 'Setz Milch auf die Liste und was steht morgen an', 'Was steht morgen an und setz Milch auf die Liste', 'Erinner mich morgen um 8 Uhr an den Arzt und danach trag Brot auf die Einkaufsliste'])
        await wieBisher('Bestehender Mehrfach-Befehlsweg', s);
    check('Mehrfach-Befehlsweg: jvMehrfach.teile unverändert', JSON.stringify(A0.sb.jvMehrfach.teile('Stell den Wecker auf 4 Uhr und setz Milch auf die Liste')) === JSON.stringify(['Stell den Wecker auf 4 Uhr', 'setz Milch auf die Liste']));
    /* Reihenfolge in der Befehlsliste */
    {
        const kette = A0.kette();
        const iM = kette.findIndex(x => /mehrfachfrage$/.test(x)), iW = kette.findIndex(x => /was_steht_an$/.test(x)), iMe = kette.findIndex(x => / mehrfach$/.test(x));
        check('Befehlsliste: mehrfachfrage steht vor was_steht_an und vor mehrfach', iM >= 0 && iM < iW && iM < iMe, kette.slice(0, 8).join(' | '));
        check('Befehlsliste: mehrfachfrage (B4) und vollmond_auskunft (B4.1b) sind neu (93, mit webbau)', kette.length === 93 && kette.some(x => / vollmond_auskunft$/.test(x)), String(kette.length));
    }
    {   /* Fehlt die Registry oder nur(), tut der Handler nichts */
        const { A } = await neueApp(); A.sb.jvFaehigkeiten = undefined;
        const g0 = A.gesagt.length; const h = A.sb.handleLocalCommand('Was steht morgen im Kalender und wie wird das Wetter?');
        check('Ohne Registry: Handler tut nichts (Satz geht wie früher weiter)', h === false || (A.gesagt.length === g0 && true));
    }


    /* ---------- 5. B4.1b: Vollmond als reine Auskunft ---------- */
    const VM = 'Der nächste Vollmond ist am Dienstag, 24. November, also in 27 Tagen.';
    const QUIP = 'Heulen ist erlaubt, bitte aber leise, wegen der Nachbarn.';
    /* Messung VOR dem Umbau (Stand main nach #262): Einzelfrage "Wann ist der nächste Vollmond?" -> Text VM, Mondfenster, genau eine Sprachausgabe, Spruch (Kategorie vollmond) */
    for (const satz of ['Wann ist der nächste Vollmond?', 'Wann ist Vollmond?']) {
        const r = await lauf(satz);
        gleich('B4.1b Einzelfrage "' + satz + '": wie vor dem Umbau (erst Mondfenster, dann genau eine Sprachausgabe, kein KI-Aufruf)', { e: r.ereignisse, k: r.kiCalls }, { e: ['karte:openExtraWindow: Mond', 'sprechen:' + VM], k: [] });
        check('B4.1b Einzelfrage "' + satz + '": Text wie vor dem Umbau', r.gesagt[0] === VM, r.gesagt[0]);
    }
    {
        const { A } = await neueApp(); A.sb.sassLevel = () => 3; A.sb.Math.random = () => 0;
        const q = A.sb.jarvisQuip(VM);
        check('B4.1b Einzelfrage: der Spruch der Kategorie "vollmond" wird wie vorher angehängt (sprueche.js unverändert, hängt in speak)', typeof q === 'string' && q.startsWith(VM) && q.endsWith(QUIP), q);
        const sp = A.sb.jarvisQuip('Der nächste Neumond ist am Montag, 9. November, also in 12 Tagen.');
        check('B4.1b Neumond-Spruch unverändert', /Stockdunkel dann/.test(sp), sp);
    }
    {   /* reine Textfunktion */
        const { A } = await neueApp(); const T0 = A.sb._sonneMondTest;
        check('vollmondText und vollmondFrage sind da', typeof T0.vollmondText === 'function' && typeof T0.vollmondFrage === 'function');
        check('vollmondText(now) liefert denselben Satz wie die Einzelfrage', T0.vollmondText(new Date(JETZT)) === VM, T0.vollmondText(new Date(JETZT)));
        for (const jetzt of ['2026-11-24T05:00:00+01:00', '2026-11-24T20:00:00+01:00', '2026-11-25T12:00:00+01:00', '2026-12-20T10:00:00+01:00']) {
            const B = starte({ jetzt, festerZufall: true, fetch: async () => { throw new Error('x'); } });
            const g0 = B.gesagt.length; await B.lassLaufen(async () => { B.sb.handleLocalCommand('Wann ist der nächste Vollmond?'); });
            check('vollmondText = gesprochener Satz der Einzelfrage zur Zeit ' + jetzt, B.gesagt.slice(g0).length === 1 && B.sb._sonneMondTest.vollmondText(new Date(jetzt)) === B.gesagt[g0], B.gesagt.slice(g0).join('|') + ' <> ' + B.sb._sonneMondTest.vollmondText(new Date(jetzt)));
        }
        /* keine Nebenwirkung: weder Sprache, noch Fenster, noch Speicher, noch Netz */
        const g0 = A.gesagt.length, e0 = A.ereignisse.length, z0 = JSON.stringify(A.zustand()), n0 = A.aufrufe.length;
        T0.vollmondText(new Date(JETZT)); T0.vollmondFrage('Wann ist Vollmond?');
        check('vollmondText/vollmondFrage: keine Sprache, kein Fenster, kein Speicher, kein Netz', A.gesagt.length === g0 && A.ereignisse.length === e0 && JSON.stringify(A.zustand()) === z0 && A.aufrufe.length === n0);
        const quelle = lies('js/sonnemond.js'), kopf = quelle.slice(quelle.indexOf('function vollmondErgebnis'), quelle.indexOf('function answerPhase'));
        check('vollmondErgebnis/vollmondText enthalten keinen Aufruf von say, speak, Fenster, Karten, Standort, Netz', !/\b(say|speak|openMoonWindow|showCards|showActionCards|position|navigator|fetch|localStorage|openExtraWindow)\s*\(/.test(kopf));
    }
    {   /* Erkennung: nicht breiter als heute */
        const { A } = await neueApp(); const f = A.sb._sonneMondTest.vollmondFrage;
        for (const s of ['Wann ist der nächste Vollmond?', 'Wann ist Vollmond?', 'Wann kommt der nächste Vollmond?', 'Wann haben wir Vollmond?']) check('vollmondFrage erkennt "' + s + '"', f(s) === true);
        for (const s of ['Wann ist der nächste Neumond?', 'Wann ist Neumond und wann Vollmond?', 'Wann geht die Sonne unter?', 'Wann geht der Mond auf?', 'Wie ist der Mond heute?', 'Wetter bei Vollmond?', 'Wie wird das Wetter und wann ist Vollmond', 'Vollmond', 'Erzähl mir etwas über den Vollmond', 'Wann ist Vollmond ' + 'und so weiter '.repeat(10)])
            check('vollmondFrage erkennt NICHT "' + s.slice(0, 50) + '"', f(s) === false);
        /* dieselbe Regel wie der Befehl: sobald eine Wetterwort drin ist, erkennt keiner von beiden */
        const g0 = A.gesagt.length; A.sb.handleLocalCommand('Wetter bei Vollmond?'); check('Befehl und Erkennung stimmen überein (Wetterwort sperrt beide)', !A.gesagt.slice(g0).some(x => /nächste Vollmond/.test(x)));
    }
    {   /* der Ketteneintrag */
        const { A } = await neueApp(); const J = A.sb.jvCommands;
        check('Merkflag nurAktiv ist im Normalzustand aus', J.nurAktiv() === false);
        let drin = null, normal = null; J.use('probe_nur', (t, next) => { if (t === 'x') drin = J.nurAktiv(); return true; }, 5000); J.use('probe_normal', (t, next) => { if (t === 'Hallo zusammen') normal = J.nurAktiv(); return next(t); }, -5);
        J.nur(['probe_nur'], 'x'); A.sb.handleLocalCommand('Hallo zusammen'); 
        check('Merkflag: während nur() an, im normalen Durchlauf aus, danach aus', drin === true && normal === false && J.nurAktiv() === false, JSON.stringify({ drin, normal }));
        J.remove('probe_nur'); J.remove('probe_normal');
        const bad = []; bad.indexOf = () => { throw new Error('boom'); };
        let geworfen = false; try { J.nur(bad, 'x'); } catch (e) { geworfen = true; }
        check('Merkflag wird auch nach einem Fehler (Ausnahme in nur) zurückgesetzt', geworfen && J.nurAktiv() === false);
        J.use('wirft', () => { throw new Error('kaputt'); }, 5000);
        const e1 = console.error; console.error = () => {}; try { J.nur(['wirft'], 'x'); } finally { console.error = e1; }
        check('Merkflag nach einem Fehler in einem Eintrag aus', J.nurAktiv() === false); J.remove('wirft');
        check('commands.js setzt das Merkflag im finally zurück, keine zweite Zustandsvariable', /finally \{ nurFlag = vorher; \}/.test(lies('js/commands.js')) && (lies('js/commands.js').match(/\blet nurFlag\b/g) || []).length === 1);
        /* im normalen Durchlauf antwortet vollmond_auskunft nie: die Einzelfrage läuft über 'erweiterungen' mit Fenster */
        const g0 = A.gesagt.length, e0 = A.ereignisse.length; A.sb.handleLocalCommand('Wann ist der nächste Vollmond?');
        const ev = A.ereignisse.slice(e0).map(e => e.art);
        check('Normaler Durchlauf: Einzelfrage kommt mit Mondfenster und Sprache (vollmond_auskunft hat nicht geantwortet)', ev.includes('karte') && A.gesagt.length === g0 + 1, JSON.stringify(ev));
        check('gezielter Aufruf: nur(["vollmond_auskunft"]) antwortet, ohne Fenster', (() => { const g = A.gesagt.length, e = A.ereignisse.length; const r = J.nur(['vollmond_auskunft'], 'Wann ist der nächste Vollmond?'); return r === true && A.gesagt.length === g + 1 && !A.ereignisse.slice(e).some(x => x.art === 'karte'); })());
        check('gezielter Aufruf: Neumond, Sonne, Mondauf-/untergang, Mond heute werden NICHT beantwortet', ['Wann ist der nächste Neumond?', 'Wann geht die Sonne unter?', 'Wann geht der Mond auf?', 'Wann geht der Mond unter?', 'Wie ist der Mond heute?'].every(s => J.nur(['vollmond_auskunft'], s) === false));
    }
    /* Registry: nur Vollmond neu, die Sammel-Einträge bleiben draußen */
    {
        const R = A0.sb.jvFaehigkeiten.reineAuskuenfte();
        for (const n of ['erweiterungen', 'lagebild', 'feiertage', 'weltzeit', 'sonne', 'sonnemond', 'mondzeiten', 'neumond']) check('Registry: ' + n + ' ist keine reine Auskunft', !R.includes(n));
        check('Registry: erweiterungen wird nicht über Beispiele oder Intents als sicher geführt', !A0.sb.jvFaehigkeiten.liste.some(f => f.intents.some(i => i.bezug === 'erweiterungen' && i.reineAuskunft)));
    }
    /* Haupttest: Wetter + Vollmond */
    {
        let r = await lauf('Wie wird morgen das Wetter und wann ist der nächste Vollmond?');
        check('Haupttest: vom neuen Weg übernommen', r.behandelt === true);
        check('Haupttest: genau ein KI-Aufruf, nur mit der Wetterfrage, die KI bekommt keine Vollmondfrage zum Schätzen', r.kiCalls.length === 1 && /Wetter/.test(r.kiCalls[0]) && !/vollmond/i.test(r.kiCalls[0]), JSON.stringify(r.kiCalls));
        gleich('Haupttest: genau eine gemeinsame Sprachausgabe: Wetter, dann Vollmond (Reihenfolge der Fragen)', r.gesagt, [KI_ANTWORT + ' ' + VM]);
        check('Haupttest: kein Mondfenster, keine Karte', !r.ereignisse.some(x => /^karte:/.test(x)), JSON.stringify(r.ereignisse));
        check('Haupttest: nichts geändert (Termine, Erinnerungen, Gedächtnis)', r.geaendert === (await lauf('Hallo')).geaendert);
        r = await lauf('Wann ist der nächste Vollmond und wie wird morgen das Wetter?');
        gleich('Vollmond + Wetter: eine gemeinsame Antwort in der Reihenfolge der Fragen', r.gesagt, [VM + ' ' + KI_ANTWORT]);
        check('Vollmond + Wetter: ein KI-Aufruf nur mit dem Wetter', r.kiCalls.length === 1 && !/vollmond/i.test(r.kiCalls[0]), JSON.stringify(r.kiCalls));
        r = await lauf('Wie wird morgen das Wetter und wann ist der nächste Vollmond?', { kiFehler: true });
        check('Wetter fällt aus: Vollmond bleibt, Wetterausfall konkret genannt, genau eine Antwort', r.gesagt.length === 1 && r.gesagt[0].includes(VM) && r.gesagt[0].includes('Wetter konnte ich gerade nicht laden.') && !/Das meiste|Verzeih|HTTP|fetch/.test(r.gesagt[0]), JSON.stringify(r.gesagt));
        r = await lauf('Wann ist der nächste Vollmond und wie wird morgen das Wetter?', { kiFehler: true });
        check('Vollmond zuerst, Wetter fällt aus: Vollmond bleibt, Wetterausfall genannt', r.gesagt.length === 1 && r.gesagt[0].includes(VM) && r.gesagt[0].includes('Wetter konnte ich gerade nicht laden.'), JSON.stringify(r.gesagt));
        r = await lauf('Was steht morgen an und wann ist der nächste Vollmond?');
        check('Kalender + Vollmond: beides lokal, kein KI-Aufruf, eine Antwort, kein Fenster', r.kiCalls.length === 0 && r.gesagt.length === 1 && r.gesagt[0].includes(VM) && !r.ereignisse.some(x => /^karte:/.test(x)), JSON.stringify(r.gesagt));
        r = await lauf('Wann beginnt meine Spätschicht und wann ist der nächste Vollmond und wie wird morgen das Wetter?');
        check('Dreierfrage Schicht + Vollmond + Wetter: eine Antwort, ein KI-Aufruf nur mit dem Wetter', r.gesagt.length === 1 && r.gesagt[0].includes(VM) && r.gesagt[0].includes(KI_ANTWORT) && r.kiCalls.length === 1 && !/vollmond|schicht/i.test(r.kiCalls[0]), JSON.stringify([r.gesagt, r.kiCalls]));
        check('Wetter + Vollmond: höchstens eine gesprochene Antwort', r.gesagt.length <= 1);
        /* Bezugswort: nicht zerlegen, ganzer Satz an die KI */
        r = await lauf('Wann ist der nächste Vollmond und was machen wir danach?');
        check('Vollmond + Bezugswort: ganzer Satz an die KI, Vollmond spricht nicht allein', r.kiCalls.length === 1 && r.gesagt.length === 1 && r.gesagt[0] === KI_ANTWORT, JSON.stringify([r.kiCalls, r.gesagt]));
    }
    /* Unverändert: Neumond, Sonne, Mondauf-/untergang, Mond heute, Lagebild; auch in Kombination mit Wetter (alles an die KI wie bisher) */
    for (const s of ['Wann ist der nächste Neumond?', 'Wann geht die Sonne unter?', 'Wann geht heute der Mond auf?', 'Wann geht der Mond unter?', 'Wie ist der Mond heute?', 'Zeig mir das Lagebild'])
        await wieBisher('B4.1b Einzelfrage', s);
    for (const s of ['Wie wird morgen das Wetter und wann ist der nächste Neumond?', 'Wie wird morgen das Wetter und wann geht die Sonne unter?', 'Wie wird morgen das Wetter und wann geht der Mond auf?'])
        await wieBisher('B4.1b Kombination ohne Vollmond', s);
    {
        const r = await lauf('Wie wird morgen das Wetter und wann ist der nächste Neumond?');
        check('Wetter + Neumond bleibt ganz bei der KI (ein Aufruf mit dem ganzen Satz)', r.kiCalls.length === 1 && /Neumond/.test(r.kiCalls[0]), JSON.stringify(r.kiCalls));
    }

    console.log(fehler ? '\n' + fehler + ' Mehrfachfragen-Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : 'Mehrfachfragen in Ordnung (' + ok + ' Prüfungen).');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
