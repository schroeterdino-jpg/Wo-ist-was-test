/* ============================================================
   KI-TEXT (Phase 5D.2). Start: node tests/kitext.js
     --vorher       misst den Zustand VOR dem Umbau (tests/kitext_vorher.json, nur zum Nachlesen)
     --schreiben    schreibt den Soll-Zustand tests/kitext_soll.json neu
   Grundregel: Der ORIGINALTEXT bleibt überall original (Chat-Verlauf, jvLetzterText, Aktionen, Gedächtnis, Kalender, Erinnerungen).
   Nur die KOPIE, die als Nachricht an die KI geht, darf vorher durch die Normalisierer laufen (jvKiText, commands.js-Kette).
   Gemessen wird der echte Ablauf (voice.js-Korrektur -> feste Befehle -> sendToGroqSmart) mit vorgetäuschter KI (/api/groq) und Speicher (/api/memory).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { starte, lies } = require('./umgebung.js');

const DATEI = n => path.join(__dirname, n);
const VORHER = process.argv.includes('--vorher'), SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);

const MIS_QUELLE = (lies('js/voice.js').match(/function fixKnownMishearings\(text\) \{[\s\S]*?\n    \}/) || [''])[0];
const fixKnownMishearings = MIS_QUELLE ? vm.runInNewContext('(' + MIS_QUELLE.replace(/^function fixKnownMishearings/, 'function') + ')') : null;

/* [Kategorie, Eingabe wie vom Handy erkannt, gewünschte KI-Nachricht NACH dem Umbau (nach voice.js), Besonderheit]
   Besonderheit: 'bewusst' = soll ausdrücklich NICHT korrigiert werden; 'direkt' = geht ohne feste Befehle an die KI (mit Merk-dir-Aktion der KI) */
const EINGABEN = [
    ['Unterhaltung', 'Hallo Jarvis wie geht es dir', 'Hallo Zane wie geht es dir'],
    ['Unterhaltung', 'Erzähl mir einen Witz', 'Erzähl mir einen Witz'],
    ['Unterhaltung', 'Sag mal, wie wird das Wetter?', 'Sag mal, wie wird das Wetter?', 'bewusst'],
    ['Unterhaltung', 'Am Ende der Straße gibt es einen Laden', 'Am Ende der Straße gibt es einen Laden', 'bewusst'],
    ['Unterhaltung', 'Hallo zehn Minuten Pause bitte', 'Hallo Zane Minuten Pause bitte', 'bewusst'],
    ['Festnamen', 'Zain erzähl mir etwas über Segelschiffe', 'Zane erzähl mir etwas über Segelschiffe'],
    ['Festnamen', 'Zaine was gibt es Neues', 'Zane was gibt es Neues'],
    ['Festnamen', 'Ein Zaino Kaffee bitte', 'Ein Zaino Kaffee bitte'],
    ['Festnamen', 'Sanierung am Haus planen', 'Sanierung am Haus planen'],
    ['Personen', 'Ruf Alicia an', 'Ruf Alyssa an'],
    ['Personen', 'Schreib Alycia eine Nachricht', 'Schreib Alyssa eine Nachricht'],
    ['Personen', 'Erzähl mir etwas über Alicias Schule', 'Erzähl mir etwas über Alyssas Schule'],
    ['Personen', 'Wann hat Alissa Geburtstag', 'Wann hat Alyssa Geburtstag'],
    ['Personen', 'Ist Herr Schröter heute da', 'Ist Herr Schröter heute da', 'bewusst'],
    ['Personen', 'Erzähl mir etwas über Herrn Schröter von der Bank', 'Erzähl mir etwas über Herrn Schröter von der Bank', 'bewusst'],
    ['Hamiyet/Hamlet', 'Wer hat Hamlet geschrieben', 'Wer hat Hamlet geschrieben', 'bewusst'],
    ['Hamiyet/Hamlet', 'Worum geht es in Hamlet', 'Worum geht es in Hamlet', 'bewusst'],
    ['Hamiyet/Hamlet', 'Wann hat Hamlet Feierabend', 'Wann hat Hamlet Feierabend', 'bewusst'],
    ['Hamiyet/Hamlet', 'Hamlet kommt morgen zu Besuch', 'Hamlet kommt morgen zu Besuch', 'bewusst'],
    ['Orte', 'Erzähl mir etwas über den Neu Galina Ring', 'Erzähl mir etwas über den Neu-Galliner-Ring'],
    ['Orte', 'Wo ist der Neu Galliner Ring', 'Wo ist der Neu-Galliner-Ring'],
    ['Orte', 'Neu Gallin Ring ist weit weg', 'Neu-Galliner-Ring ist weit weg'],
    ['Orte', 'Erzähl mir etwas über den Neu-Galliner-Ring', 'Erzähl mir etwas über den Neu-Galliner-Ring'],
    ['Orte', 'Wie viele Einwohner hat Schwarzenbeck', 'Wie viele Einwohner hat Schwarzenbek'],
    ['Orte', 'Erzähl mir etwas über den Verbrüderungs Ring', 'Erzähl mir etwas über den Verbrüderungsring'],
    ['Orte', 'Ist Schwarzenbek schön', 'Ist Schwarzenbek schön'],
    ['Orte', 'Neu Kalliner Ring', 'Neu Kalliner Ring', 'bewusst'],
    ['Navigation', 'Fahr zum Neu Galina Ring', 'Fahr zum Neu-Galliner-Ring'],
    ['Navigation', 'Navigier mich nach Schwarzenbeck bei Hamburg', 'Navigier mich nach Schwarzenbek bei Hamburg'],
    ['Navigation', 'Wie lange brauche ich zur Arbeit', 'Wie lange brauche ich zur Arbeit'],
    ['Wetter', 'Wird es in Schwarzenbeck morgen regnen', 'Wird es in Schwarzenbek morgen regnen'],
    ['Wetter', 'Brauche ich heute einen Schirm', 'Brauche ich heute einen Schirm'],
    ['Kalender', 'Trag morgen um zehn Uhr einen Termin ein', 'Trag morgen um zehn Uhr einen Termin ein'],
    ['Kalender', 'Termin mit Alicia am Freitag um 15 Uhr', 'Termin mit Alyssa am Freitag um 15 Uhr'],
    ['Kalender', 'Termin mit Herrn Schröter am Montag', 'Termin mit Herrn Schröter am Montag', 'bewusst'],
    ['Erinnerungen', 'Erinner mich morgen an den Arzt', 'Erinner mich morgen an den Arzt'],
    ['Erinnerungen', 'Erinner mich an den Anruf bei Alicia', 'Erinner mich an den Anruf bei Alyssa'],
    ['Memory', 'Merk dir dass Alicia am Samstag kommt', 'Merk dir dass Alyssa am Samstag kommt'],
    ['Memory', 'Merk dir mein Nachname ist Schröter', 'Merk dir mein Nachname ist Schröter', 'bewusst'],
    ['Memory', 'Das Auto steht am Neu Galina Ring merk dir das', 'Das Auto steht am Neu-Galliner-Ring merk dir das', 'direkt'],
    ['Memory', 'Was weißt du über mich', 'Was weißt du über mich'],
    ['Schicht', 'Wann habe ich nächste Woche Frühschicht', 'Wann habe ich nächste Woche Frühschicht'],
    ['Schicht', 'Habe ich am Wochenende Spätschicht', 'Habe ich am Wochenende Spätschicht'],
    ['Foto', 'Stundenplan von Alycia fotografieren', 'Stundenplan von Alyssa fotografieren'],
    ['Foto', 'Mach ein Foto vom Brief an Schröter', 'Mach ein Foto vom Brief an Schröter', 'bewusst'],
    ['Mehrfachfragen', 'Wie wird das Wetter in Schwarzenbeck und ruf Alicia an', 'Wie wird das Wetter in Schwarzenbek und ruf Alyssa an'],
    ['Mehrfachfragen', 'Was habe ich heute vor und wie kalt ist es in Schwarzenbeck', 'Was habe ich heute vor und wie kalt ist es in Schwarzenbek'],
    ['Mehrfachfragen', 'Fahr zum Neu Galina Ring und wie wird das Wetter', 'Fahr zum Neu-Galliner-Ring und wie wird das Wetter']
];

function baue(opt) {
    opt = opt || {};
    const w = starte(Object.assign({ festerZufall: true, echtesSpeak: true }, opt.welt || {}));
    const rec = { ki: [], store: [], aktionen: [] };
    w.rec = rec;
    w.sb.apiFetch = async (u, o) => {
        const b = o && o.body ? JSON.parse(o.body) : null;
        if (String(u).indexOf('/api/groq') >= 0) {
            rec.ki.push(b.messages[b.messages.length - 1].content);
            const aktionen = w.naechsteAktionen || [];
            return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Okay.', actions: aktionen }) } }] }) };
        }
        if (String(u).indexOf('/api/memory') >= 0 && b && b.action === 'store') { rec.store.push(b.text); return { ok: true, status: 200, json: async () => ({ ok: true }) }; }
        return { ok: false, status: 404, json: async () => ({}) };
    };
    const origExec = w.sb.executeAction;
    w.sb.executeAction = function (a, t, c) { rec.aktionen.push({ typ: a && a.type, text: t }); return origExec.apply(this, arguments); };
    w.store['jv_hoerkorrektur'] = JSON.stringify({ 'Matthes': 'Matze', 'Mal': 'Malte', 'Ende': 'Enne', 'haben jetzt': { r: 'Hamiyet', c: 1 } });   // gelernte Hörkorrekturen sind im Speicher, aber NICHT aktiv für die KI
    w.store[opt.cleanKey || 'jv_langzeit_aufgeraeumt_v1'] = '2026-10-07T00:00:00.000Z';
    return w;
}
const histUser = w => { try { return w.lese('chatHistory').filter(m => m && m.role === 'user').map(m => m.content); } catch (e) { return []; } };
async function sprechweg(w, e) {
    const roh = e[1], m = fixKnownMishearings(roh);
    const alt = { speak: w.sb.speak, speakAck: w.sb.speakAck };
    w.sb.speak = function () { }; w.sb.speakAck = function () { };
    w.rec.ki.length = 0; w.rec.store.length = 0; w.rec.aktionen.length = 0;
    const h0 = histUser(w).length, z0 = w.zustand();
    w.naechsteAktionen = e[3] === 'direkt' ? [{ type: 'memory_store', memory_key: 'auto', memory_value: 'am Ring' }] : [];
    let lokal = false;
    if (e[3] !== 'direkt') { const x = await w.satz(m); lokal = x.lokal; }
    if (!lokal) await w.lassLaufen(() => w.sb.sendToGroqSmart(m));
    await w.vorspulen(e[0] === "Mehrfachfragen" ? 20000 : 3000);
    const z1 = w.zustand(), d = {};
    for (const k of ['termine', 'erinnerungen', 'gedaechtnis']) { const a = JS(z0[k]), b = JS(z1[k]); if (a !== b) d[k] = z1[k]; }
    const r = {
        roh, nachVoice: m, weg: lokal ? 'lokal' : 'KI',
        kiNachrichten: w.rec.ki.slice(), historyUser: histUser(w).slice(h0), letzterText: w.lese('window.jvLetzterText') || null,
        aktionen: w.rec.aktionen.slice(), gespeichert: w.rec.store.slice(), aenderungen: d
    };
    w.sb.speak = alt.speak; w.sb.speakAck = alt.speakAck;
    return r;
}

(async () => {
    const soll = fs.existsSync(DATEI('kitext_soll.json')) ? JSON.parse(fs.readFileSync(DATEI('kitext_soll.json'), 'utf8')) : {};
    const ist = {};
    check('voice.js: fixKnownMishearings lässt sich lesen (Testwerkzeug)', typeof fixKnownMishearings === 'function');
    const w = baue();
    check('Testwelt lädt ohne Ladefehler', w.ladefehler.length === 0, JS(w.ladefehler));
    ist.eingaben = [];
    for (const e of EINGABEN) ist.eingaben.push(Object.assign({ kat: e[0] }, await sprechweg(w, e)));
    ist.kette = { sendToGroqSmartDirekteHuellen: Object.keys(w.sb.sendToGroqSmart || {}).filter(k => /^_/.test(k)).sort() };

    if (VORHER) { fs.writeFileSync(DATEI('kitext_vorher.json'), JSON.stringify(ist, null, 1) + '\n'); console.log('Zustand VOR dem Umbau geschrieben: tests/kitext_vorher.json'); return; }

    const vorher = JSON.parse(fs.readFileSync(DATEI('kitext_vorher.json'), 'utf8'));

    /* ---------- 1. Eingaben: Original bleibt, nur die KI-Kopie ändert sich ---------- */
    const EINGABE_KI = {   // Mehrfachfragen: was die KI-Teilsätze sein sollen (die lokalen Teile gehen gar nicht an die KI)
        'Wie wird das Wetter in Schwarzenbeck und ruf Alicia an': ['ruf Alyssa an'],
        'Was habe ich heute vor und wie kalt ist es in Schwarzenbeck': ['Wie kalt ist es in Schwarzenbek?']
    };
    const erwKi = (e, v) => EINGABE_KI[e[1]] || (v.kiNachrichten.length ? [e[2]].concat(v.kiNachrichten.slice(1)) : []);
    const ORIGINAL_FELDER = ['roh', 'nachVoice', 'weg', 'historyUser', 'letzterText', 'aktionen', 'gespeichert', 'aenderungen'];
    const originalVerletzt = (r, v) => ORIGINAL_FELDER.filter(k => JS(r[k]) !== JS(v[k]));   // [] = alle Originale unverändert gegenüber dem Zustand vor dem Umbau
    const kiAbweichung = (e, r, v, nurErste) => { const a = nurErste ? r.kiNachrichten.slice(0, 1) : r.kiNachrichten, b = nurErste ? erwKi(e, v).slice(0, 1) : erwKi(e, v); return JS(a) === JS(b) ? '' : 'KI-Nachricht ' + JS(a) + ' statt ' + JS(b); };   // nurErste: frische Zusatzwelten rufen die KI intern nicht immer ein zweites Mal
    const urteilFuer = (e, r, v) => {
        if (originalVerletzt(r, v).length || kiAbweichung(e, r, v)) return 'problematisch';
        if (JS(r.kiNachrichten) !== JS(v.kiNachrichten)) return 'verbessert';
        return e[3] === 'bewusst' ? 'bewusst nicht korrigiert' : 'unverändert';
    };
    const matrix = [];
    EINGABEN.forEach((e, i) => {
        const r = ist.eingaben[i], v = vorher.eingaben[i];
        check('Eingabe ' + (i + 1) + ' (' + e[0] + '): "' + e[1] + '" – Referenz stimmt (gleiche Eingabe wie im Golden Master)', v && v.roh === e[1]);
        const ov = originalVerletzt(r, v);
        check('Eingabe ' + (i + 1) + ' (' + e[0] + '): "' + e[1] + '" – Originaltext überall unverändert (Weg, Chat-Verlauf, jvLetzterText, Aktionen, Gedächtnis, Kalender, Erinnerungen)', ov.length === 0, JS(ov));
        const ka = kiAbweichung(e, r, v);
        check('Eingabe ' + (i + 1) + ' (' + e[0] + '): "' + e[1] + '" – KI bekommt die erwartete Kopie', ka === '', ka);
        const u = urteilFuer(e, r, v);
        check('Eingabe ' + (i + 1) + ': kein problematischer Fall', u !== 'problematisch');
        matrix.push([e[0], e[1], r.historyUser.length ? r.historyUser.join(' | ') : (r.weg === 'lokal' ? '(lokal, nicht im KI-Verlauf)' : '-'), r.kiNachrichten.length ? r.kiNachrichten.join(' | ') : '(keine)', u]);
    });
    ist.urteile = matrix.map(m => m[4]);
    check('Testmatrix: mindestens 40 Eingaben in 13 Kategorien', EINGABEN.length >= 40 && new Set(EINGABEN.map(e => e[0])).size >= 13, EINGABEN.length + ' / ' + new Set(EINGABEN.map(e => e[0])).size);
    check('Testmatrix: es gibt verbesserte, unveränderte und bewusst nicht korrigierte Fälle, aber keinen problematischen', ['verbessert', 'unverändert', 'bewusst nicht korrigiert'].every(k => ist.urteile.includes(k)) && !ist.urteile.includes('problematisch'));
    if (process.argv.includes('--matrix')) { console.log('| Kategorie | Eingabe | Chat-Verlauf (Original) | Nachricht an die KI | Urteil |\n|---|---|---|---|---|'); matrix.forEach(m => console.log('| ' + m.map(x => String(x).replace(/\|/g, '/')).join(' | ') + ' |')); }

    /* ---------- 2. Aufbau: eine Kette, einmal registriert, keine versteckten Hüllen ---------- */
    const liste = w.sb.jvChain.list('jvKiText');
    ist.kette.jvKiText = liste;
    check('Kette jvKiText: genau ein Eintrag "festnamen" (Rang 100), hoerkorrektur ist NICHT eingetragen', JS(liste) === JS(['100 festnamen']), JS(liste));
    const quellen = fs.readdirSync(path.join(__dirname, '..', 'js')).filter(f => /\.js$/.test(f));
    const huellen = quellen.filter(f => /(?:window\.)?sendToGroqSmart\s*=\s*(?:async\s+)?function/.test(lies('js/' + f)) && f !== 'assistant.js').sort();
    check('sendToGroqSmart wird nur noch von synapsen.js und weathermap.js umhüllt (nicht mehr von festnamen.js/hoerkorrektur.js)', JS(huellen) === JS(['synapsen.js', 'weathermap.js']), JS(huellen));
    check('festnamen.js und hoerkorrektur.js enthalten keine Umhüllung von sendToGroqSmart mehr', !/sendToGroqSmart\s*=/.test(lies('js/festnamen.js')) && !/sendToGroqSmart\s*=/.test(lies('js/hoerkorrektur.js')) && !/sendToGroqSmart\._(festnamen|hoerkorrektur)/.test(lies('js/festnamen.js') + lies('js/hoerkorrektur.js')));
    check('Direkte Hüllen am Aufrufer sendToGroqSmart tragen keine Marker _festnamen/_hoerkorrektur', ist.kette.sendToGroqSmartDirekteHuellen.every(k => !/festnamen|hoerkorrektur/.test(k)), JS(ist.kette.sendToGroqSmartDirekteHuellen));
    check('Die Normalisierer ändern nur die KI-Kopie: in assistant.js sind chatHistory, jvLetzterText und executeAction weiter mit "text" (Original) versorgt', /const nutzerNachricht = \{ role: "user", content: text \}/.test(lies('js/assistant.js')) && /window\.jvLetzterText = text/.test(lies('js/assistant.js')) && /await executeAction\(action, text, ctx\)/.test(lies('js/assistant.js')));
    check('Die Kopie hängt nicht aufzählbar am Verlaufseintrag (taucht in Speichern/JSON nicht auf)', (() => { const o = { role: 'user', content: 'a' }; Object.defineProperty(o, 'jvKi', { value: 'b' }); return JS(o) === '{"role":"user","content":"a"}'; })());
    {
        const h = w.lese('chatHistory').filter(m => m && m.role === 'user');
        check('Chat-Verlauf im Speicher: kein Eintrag trägt die KI-Kopie als sichtbares Feld', h.length > 5 && h.every(m => JS(Object.keys(m)) === JS(['role', 'content'])) && !JS(h).includes('jvKi'));
    }
    check('Idempotent: die Kopie nochmals normalisiert bleibt gleich (kein Doppelkorrektur-Schaden)', EINGABEN.every(e => { const k = w.sb.jvFestnamenKi(e[1]); return w.sb.jvFestnamenKi(k) === k; }));
    check('Doppelkorrektur Adressen: die Festnamen-Kopie ist schon so geschrieben, wie adress_normal.js sie ergibt (Neu-Galliner-Ring / Schwarzenbek)', w.sb.jvFestnamenKi('Fahr zum Neu Galina Ring nach Schwarzenbeck') === 'Fahr zum Neu-Galliner-Ring nach Schwarzenbek');

    /* ---------- 3. Hilfen für Zusatzwelten ---------- */
    const KURZ = ['Schreib Alycia eine Nachricht', 'Fahr zum Neu Galina Ring', 'Wie viele Einwohner hat Schwarzenbeck', 'Ist Herr Schröter heute da', 'Wer hat Hamlet geschrieben', 'Sag mal, wie wird das Wetter?', 'Erzähl mir etwas über den Verbrüderungs Ring', 'Zaine was gibt es Neues'];
    const eingabe = roh => EINGABEN.find(e => e[1] === roh);
    async function probe(opt, rohListe) {
        const wx = baue(opt), aus = [];
        for (const roh of rohListe || KURZ) aus.push(await sprechweg(wx, eingabe(roh)));
        return { w: wx, aus };
    }
    const normal = await probe();
    const bewertung = (aus, rohListe) => (rohListe || KURZ).map((roh, i) => { const e = eingabe(roh), v = vorher.eingaben[EINGABEN.indexOf(e)]; return { roh, original: originalVerletzt(aus[i], v), ki: kiAbweichung(e, aus[i], v, true) }; });
    const sauber = b => b.every(x => x.original.length === 0 && x.ki === '');
    check('Ausgangswelt (8 Proben) ist sauber', sauber(bewertung(normal.aus)), JS(bewertung(normal.aus).filter(x => x.original.length || x.ki)));

    /* ---------- 4. Reihenfolge: gleiche Wirkung bei anderer Ladereihenfolge ---------- */
    const verschiebe = (datei, hinter) => l => { const i = l.indexOf(datei); if (i >= 0) l.splice(i, 1); if (hinter === 'ENDE') l.push(datei); else l.splice(l.indexOf(hinter) + 1, 0, datei); return l; };
    const ORDNUNGEN = {
        'festnamen.js direkt nach commands.js': verschiebe('festnamen.js', 'commands.js'),
        'festnamen.js nach assistant.js': verschiebe('festnamen.js', 'assistant.js'),
        'festnamen.js ganz am Ende': verschiebe('festnamen.js', 'ENDE'),
        'hoerkorrektur.js direkt nach commands.js': verschiebe('hoerkorrektur.js', 'commands.js'),
        'festnamen.js + hoerkorrektur.js ganz am Ende': l => verschiebe('hoerkorrektur.js', 'ENDE')(verschiebe('festnamen.js', 'ENDE')(l)),
        'festnamen.js doppelt geladen': l => { l.splice(l.indexOf('festnamen.js') + 1, 0, 'festnamen.js'); return l; }
    };
    for (const n of Object.keys(ORDNUNGEN)) {
        const x = await probe({ welt: { skriptReihenfolge: ORDNUNGEN[n] } });
        check('Reihenfolge "' + n + '": lädt ohne Ladefehler', x.w.ladefehler.length === 0, JS(x.w.ladefehler));
        check('Reihenfolge "' + n + '": Original und KI-Kopie wie in der Ausgangswelt', JS(x.aus) === JS(normal.aus), JS(bewertung(x.aus).filter(b => b.original.length || b.ki)));
        check('Reihenfolge "' + n + '": genau ein Eintrag in jvKiText', JS(x.w.sb.jvChain.list('jvKiText')) === JS(['100 festnamen']), JS(x.w.sb.jvChain.list('jvKiText')));
    }
    ist.reihenfolgen = Object.keys(ORDNUNGEN);

    /* ---------- 5. Fehlerisolation ---------- */
    const mitEintrag = (name, mw, order) => ({ welt: { nachSkript: (f, sb) => { if (f === 'festnamen.js') sb.jvChain.use('jvKiText', name, mw, order); } } });
    {
        const stumm = console.error; console.error = function () { };
        try {
            const kurz = ['Schreib Alycia eine Nachricht', 'Ist Herr Schröter heute da'];
            const v0 = vorher.eingaben[EINGABEN.indexOf(eingabe(kurz[0]))];
            const f1 = await probe(mitEintrag('zz_aussen_wirft', function () { throw new Error('boom'); }, 50), kurz);
            check('Fehler F1: ein äußerer Normalisierer wirft -> die Festnamen-Kopie kommt trotzdem an', f1.aus[0].kiNachrichten[0] === 'Schreib Alyssa eine Nachricht' && originalVerletzt(f1.aus[0], v0).length === 0, JS(f1.aus[0].kiNachrichten));
            const f2 = await probe(mitEintrag('festnamen', function () { throw new Error('boom'); }, 100), kurz);
            check('Fehler F2: der Festnamen-Normalisierer selbst wirft -> die KI bekommt den unveränderten Text und antwortet', f2.aus[0].kiNachrichten[0] === 'Schreib Alycia eine Nachricht' && f2.aus[0].historyUser[0] === 'Schreib Alycia eine Nachricht', JS(f2.aus[0].kiNachrichten));
            const f3 = await probe(mitEintrag('festnamen', function () { return 42; }, 100), kurz);
            check('Fehler F3: ein Normalisierer liefert keinen Text (Zahl) -> unveränderter Text', f3.aus[0].kiNachrichten[0] === 'Schreib Alycia eine Nachricht', JS(f3.aus[0].kiNachrichten));
            const f4 = await probe(mitEintrag('festnamen', function () { return '   '; }, 100), kurz);
            check('Fehler F4: ein Normalisierer liefert leeren Text -> unveränderter Text', f4.aus[0].kiNachrichten[0] === 'Schreib Alycia eine Nachricht', JS(f4.aus[0].kiNachrichten));
            const f5 = await probe(mitEintrag('festnamen', function () { return undefined; }, 100), kurz);
            check('Fehler F5: ein Normalisierer liefert nichts (undefined) -> unveränderter Text', f5.aus[0].kiNachrichten[0] === 'Schreib Alycia eine Nachricht', JS(f5.aus[0].kiNachrichten));
            const f6 = await probe({ welt: { ohneSkripte: ['festnamen.js'] } }, kurz);
            check('Fehler F6: festnamen.js ist gar nicht geladen -> unveränderter Text, keine Ladefehler', f6.aus[0].kiNachrichten[0] === 'Schreib Alycia eine Nachricht' && f6.w.ladefehler.length === 0, JS(f6.w.ladefehler));
            const f7 = await probe(mitEintrag('zz_mitte_junk', function (next) { next(); return null; }, 50), kurz);
            check('Fehler F7: ein äußerer Normalisierer verwirft das Ergebnis der inneren -> unveränderter Text (nie halb kaputter Text)', f7.aus[0].kiNachrichten[0] === 'Schreib Alycia eine Nachricht', JS(f7.aus[0].kiNachrichten));
            const f8 = await probe({ welt: { nachSkript: (f, sb) => { if (f === 'commands.js') sb.jvKiText = undefined; } } }, kurz);
            check('Fehler F8: jvKiText fehlt ganz -> unveränderter Text, die KI wird trotzdem gefragt', f8.aus[0].kiNachrichten[0] === 'Schreib Alycia eine Nachricht', JS(f8.aus[0].kiNachrichten));
        } finally { console.error = stumm; }
    }

    /* ---------- 6. Hörkorrektur: nicht aktiv, getrennter Platz, Zukunftsfälle ---------- */
    const FUTURE = [   // [Satz, später gewünscht, Begründung]
        ['Wer hat Hamlet geschrieben', 'Wer hat Hamlet geschrieben', 'Sachfrage über das Theaterstück: Hamlet MUSS bleiben'],
        ['Worum geht es in Hamlet', 'Worum geht es in Hamlet', 'Frage zu einem Werk: Hamlet MUSS bleiben'],
        ['Hamlet kommt morgen zu Besuch', 'Hamlet kommt morgen zu Besuch', 'mehrdeutig (Person oder Stück?): keine automatische Korrektur'],
        ['Wann hat Hamlet Feierabend', 'Wann hat Hamlet Feierabend', 'mehrdeutig ohne Kontaktbezug: keine automatische Korrektur']
    ];
    const FUTURE_PERSOENLICH = [['Ruf Hamlet an', 'Ruf Hamiyet an'], ['Schreib Hamlet eine Nachricht', 'Schreib Hamiyet eine Nachricht']];   // erst mit Kontaktbezug und Befehlsart später sinnvoll
    {
        const fw = baue(), antworten = [];
        for (const f of FUTURE.concat(FUTURE_PERSOENLICH.map(x => [x[0], x[1], 'persönlicher Satz mit klarem Kontaktbezug: später Hamiyet']))) {
            const r = await sprechweg(fw, ['Hamiyet/Hamlet', f[0], f[1], 'bewusst']);
            antworten.push({ satz: f[0], heute: r.weg === 'KI' ? r.kiNachrichten[0] : '(lokal)', spaeter: f[1], grund: f[2], weg: r.weg });
        }
        ist.hamletZukunft = antworten;
        check('Hamlet-Sachfragen bleiben heute unverändert ("Wer hat Hamlet geschrieben", "Worum geht es in Hamlet")', antworten.slice(0, 2).every(a => a.weg === 'KI' && a.heute === a.satz), JS(antworten.slice(0, 2)));
        check('Mehrdeutige Hamlet-Sätze bleiben heute unverändert (keine automatische Korrektur)', antworten.slice(2, 4).every(a => a.weg === 'KI' && a.heute === a.satz), JS(antworten.slice(2, 4)));
        check('Persönliche Sätze mit Hamlet bleiben heute ebenfalls unverändert (spätere Korrektur braucht Kontext und ist nicht eingebaut)', antworten.slice(4).every(a => a.weg !== 'KI' || a.heute === a.satz), JS(antworten.slice(4)));
        const blind = s => s.replace(/\bHamlet\b/g, 'Hamiyet');
        check('Der Test ist nicht durch pauschales Ersetzen grün zu machen: eine blinde Regel würde die "muss bleiben"-Fälle zerstören', FUTURE.slice(0, 2).every(f => blind(f[0]) !== f[1]) && FUTURE_PERSOENLICH.every(f => blind(f[0]) === f[1]));
        check('Zukunft: kein Satz steht in beiden Listen ("muss bleiben" / "persönlich")', FUTURE.every(f => FUTURE_PERSOENLICH.every(g => g[0] !== f[0])));
    }
    {   // der getrennte Platz: ein Eintrag bei Rang 200 sieht den Text VOR festnamen
        let gesehen = null;
        const sl = await probe(mitEintrag('hoerkorrektur_probe', function (next, args) { gesehen = args[0]; return next(); }, 200), ['Schreib Alycia eine Nachricht']);
        check('Platz 200 ist frei und getrennt: ein Eintrag dort bekommt den Originaltext, danach laufen die Festnamen', gesehen === 'Schreib Alycia eine Nachricht' && sl.aus[0].kiNachrichten[0] === 'Schreib Alyssa eine Nachricht', JS([gesehen, sl.aus[0].kiNachrichten]));
        check('Platz 200: ein Eintrag dort lässt den Chat-Verlauf unberührt', sl.aus[0].historyUser[0] === 'Schreib Alycia eine Nachricht');
        check('Platz 200: ohne eigenen Eintrag bleibt die Kette bei einem Eintrag (hoerkorrektur ist nicht aktiv)', JS(sl.w.sb.jvChain.list('jvKiText')) === JS(['100 festnamen', '200 hoerkorrektur_probe'].reverse().sort((a, b) => parseInt(a) - parseInt(b))) && JS(normal.w.sb.jvChain.list('jvKiText')) === JS(['100 festnamen']));
    }
    {   // gelernte Korrekturen (Mal -> Malte, Ende -> Enne) wirken in der KI-Kopie NICHT
        const lern = EINGABEN.filter(e => /Sag mal|Am Ende/.test(e[1]));
        check('Gelernte Hörkorrekturen (Mal->Malte, Ende->Enne) sind im Speicher, ändern die KI-Kopie aber nicht ("Sag mal, wie wird das Wetter?", "Am Ende der Straße ...")', lern.length === 2 && lern.every(e => { const r = ist.eingaben[EINGABEN.indexOf(e)]; return r.kiNachrichten[0] === e[1] && r.historyUser[0] === e[1]; }));
        check('Lernspeicher unverändert: Mal, Ende, Matthes, haben jetzt sind gespeichert wie vorher', JS(JSON.parse(w.store['jv_hoerkorrektur'])) === JS({ 'Matthes': 'Matze', 'Mal': 'Malte', 'Ende': 'Enne', 'haben jetzt': { r: 'Hamiyet', c: 1 } }));
    }

    /* ---------- 7. Gegenproben A–L: der Test muss den Fehler erkennen ---------- */
    const FA = 'Schreib Alycia eine Nachricht', FS = 'Ist Herr Schröter heute da', FH = 'Wer hat Hamlet geschrieben', FM = 'Sag mal, wie wird das Wetter?', FD = 'Das Auto steht am Neu Galina Ring merk dir das', FN = 'Fahr zum Neu Galina Ring';
    const urteilProbe = async (opt, roh) => { const x = await probe(opt, [roh]); const b = bewertung(x.aus, [roh])[0]; return Object.assign({ listen: x.w.sb.jvChain.list('jvKiText'), r: x.aus[0], w: x.w }, b); };
    const quelle = (datei, von, nach) => ({ welt: { quelleAendern: (f, q) => { if (f !== datei) return q; if (q.indexOf(von) < 0) throw new Error('Gegenprobe: Textstelle fehlt in ' + datei + ': ' + von); return q.replace(von, nach); } } });
    const ROT = (name, ergebnis, info) => check('Gegenprobe ' + name, ergebnis, info);
    const stumm2 = console.error; console.error = function () { };
    try {
        {   // A: der alte direkte Wrapper ist (nach assistant.js geladen) wieder aktiv
            const alt = "\n;(function () { const _orig = window.sendToGroqSmart; if (typeof _orig !== 'function') return; window.sendToGroqSmart = function (t) { return _orig.call(this, window.jvFestnamen ? window.jvFestnamen(t) : t); }; })();\n";
            const o = { welt: { skriptReihenfolge: verschiebe('festnamen.js', 'assistant.js'), quelleAendern: (f, q) => f === 'festnamen.js' ? q + alt : q } };
            const a = await urteilProbe(o, FA);
            ROT('A: ein wieder aktiver alter sendToGroqSmart-Wrapper verändert den Verlauf -> der Test wird rot', a.original.length > 0, JS(a.original));
            const a2 = await urteilProbe(o, FS);
            ROT('A2: derselbe alte Wrapper macht aus Schröter Schroeter -> der Test wird rot', a2.original.length > 0 || a2.ki !== '');
        }
        {   // B: Schröter -> Schroeter allgemein in der KI-Kopie
            const b = await urteilProbe(quelle('festnamen.js', "[/schr(?:ö|oe)ter/, 'Schroeter', false]", "[/schr(?:ö|oe)ter/, 'Schroeter']"), FS);
            ROT('B: Schröter->Schroeter allgemein für die KI-Kopie -> der Test wird rot', b.ki !== '');
        }
        {   // C: die Kopie verändert den sichtbaren Originaltext
            const c = await urteilProbe(quelle('assistant.js', 'const nutzerNachricht = { role: "user", content: text };', 'const nutzerNachricht = { role: "user", content: jvKiTextFuer(text) };'), FA);
            ROT('C: die KI-Kopie landet im sichtbaren Chat-Verlauf -> der Test wird rot', c.original.includes('historyUser'), JS(c.original));
            const c2 = await urteilProbe(quelle('assistant.js', 'window.jvLetzterText = text', 'window.jvLetzterText = jvKiTextFuer(text)'), FA);
            ROT('C2: die KI-Kopie landet in jvLetzterText -> der Test wird rot', c2.original.includes('letzterText'), JS(c2.original));
        }
        {   // D: Merk-dir-Speicher bekommt die Kopie
            const d = await urteilProbe(quelle('gedaechtnis.js', "const said = String(text || '')", "const said = window.jvFestnamenKi(String(text || ''))"), FD);
            ROT('D: der Merk-dir-Text im Gedächtnis wird korrigiert statt original gespeichert -> der Test wird rot', d.original.includes('gespeichert'), JS(d.original));
        }
        {   // E: Aktionsargumente bekommen die Kopie
            const e = await urteilProbe(quelle('assistant.js', 'await executeAction(action, text, ctx)', 'await executeAction(action, jvKiTextFuer(text), ctx)'), FD);
            ROT('E: Aktionen bekommen den korrigierten statt den Originaltext -> der Test wird rot', e.original.includes('aktionen'), JS(e.original));
        }
        {   // F: ohne Schutz in jvKiTextFuer rettet der Test das Original nicht mehr
            const o = mitEintrag('festnamen', function () { throw new Error('boom'); }, 100);
            o.welt.quelleAendern = (fn, q) => fn === 'assistant.js' ? q.replace('} catch (e) { return text; }', '} catch (e) { throw e; }') : q;
            const f0 = await urteilProbe(o, FA);
            ROT('F: ohne Schutz in jvKiTextFuer reicht ein werfender Normalisierer nicht mehr durch -> der Test wird rot', f0.ki !== '' || f0.original.length > 0 || f0.r.kiNachrichten.length === 0);
        }
        {   // G: doppelte Registrierung
            const g = await urteilProbe(quelle('festnamen.js', "}, 100);", "}, 100);\n        window.jvChain.use('jvKiText', 'festnamen_zwei', function (next, args) { const t = next(); return festKi(typeof t === 'string' ? t : args[0]); }, 110);"), FA);
            ROT('G: eine doppelte Registrierung unter anderem Namen wird erkannt (zwei Einträge in jvKiText)', g.listen.length !== 1, JS(g.listen));
            const g2 = await probe({ welt: { skriptReihenfolge: ORDNUNGEN['festnamen.js doppelt geladen'] } }, [FA]);
            ROT('G2: dasselbe Skript doppelt geladen bleibt EIN Eintrag (Name-Ersatz in jvChain)', g2.w.sb.jvChain.list('jvKiText').length === 1);
        }
        {   // H: Ladereihenfolge verändert das Ergebnis -> der Reihenfolgetest muss es erkennen (festnamen.js VOR commands.js)
            const h = await probe({ welt: { skriptReihenfolge: l => { const i = l.indexOf('festnamen.js'); l.splice(i, 1); l.splice(l.indexOf('localcommands.js'), 0, 'festnamen.js'); return l; } } }, [FA]);
            const hv = bewertung(h.aus, [FA])[0];
            ROT('H: wird festnamen.js VOR commands.js geladen, fehlt die Registrierung -> der Reihenfolgetest erkennt das (Ergebnis weicht ab)', hv.ki !== '' || h.w.sb.jvChain.list('jvKiText').length !== 1);
        }
        {   // I: Hamlet -> Hamiyet blind
            const blindH = mitEintrag('blind_hamlet', function (next) { const t = next(); return typeof t === 'string' ? t.replace(/\bHamlet\b/g, 'Hamiyet') : t; }, 200);
            const i = await urteilProbe(blindH, FH);
            ROT('I: pauschal Hamlet->Hamiyet in der KI-Kopie -> der Test wird rot', i.ki !== '');
            const i2 = await urteilProbe(blindH, 'Worum geht es in Hamlet');
            ROT('I2: pauschal Hamlet->Hamiyet bei "Worum geht es in Hamlet" -> der Test wird rot', i2.ki !== '');
        }
        {   // J: Mal -> Malte blind
            const j = await urteilProbe(mitEintrag('blind_mal', function (next) { const t = next(); return typeof t === 'string' ? t.replace(/\bmal\b/gi, 'Malte') : t; }, 200), FM);
            ROT('J: pauschal Mal->Malte in der KI-Kopie ("Sag Malte, wie wird das Wetter?") -> der Test wird rot', j.ki !== '');
            const j2 = await urteilProbe(mitEintrag('blind_ende', function (next) { const t = next(); return typeof t === 'string' ? t.replace(/\bEnde\b/g, 'Enne') : t; }, 200), 'Am Ende der Straße gibt es einen Laden');
            ROT('J2: pauschal Ende->Enne ("Am Enne der Straße") -> der Test wird rot', j2.ki !== '');
        }
        {   // K, L
            const k = ist.eingaben[EINGABEN.indexOf(eingabe(FM))], l = ist.eingaben[EINGABEN.indexOf(eingabe(FH))];
            check('Gegenprobe K: "Sag mal, wie wird das Wetter?" bleibt unverändert (Verlauf und KI-Kopie)', k.kiNachrichten[0] === FM && k.historyUser[0] === FM);
            check('Gegenprobe L: "Wer hat Hamlet geschrieben?" bleibt unverändert (Verlauf und KI-Kopie)', l.kiNachrichten[0] === FH && l.historyUser[0] === FH);
        }
        check('Gegenprobe: die Messung ist scharf (ohne Festnamen-Eintrag kommt die Schreibweise unkorrigiert an)', (await urteilProbe({ welt: { ohneSkripte: ['festnamen.js'] } }, FN)).ki !== '');
    } finally { console.error = stumm2; }

    /* ---------- 8. Soll-Zustand ---------- */
    if (SCHREIBEN) { fs.writeFileSync(DATEI('kitext_soll.json'), JSON.stringify(ist, null, 1) + '\n'); console.log('Soll-Zustand geschrieben: tests/kitext_soll.json'); }
    else {
        check('Soll-Zustand vorhanden', !!soll.eingaben);
        ist.eingaben.forEach((z, i) => check('Soll Eingabe ' + (i + 1) + ' (' + z.kat + '): "' + z.roh + '" wie eingefroren', JS(z) === JS(soll.eingaben && soll.eingaben[i])));
        check('Soll Kette jvKiText wie eingefroren', JS(ist.kette) === JS(soll.kette), JS(ist.kette));
        check('Soll Hamlet-Zukunftsfälle wie eingefroren', JS(ist.hamletZukunft) === JS(soll.hamletZukunft));
        check('Soll Reihenfolge-Welten wie eingefroren', JS(ist.reihenfolgen) === JS(soll.reihenfolgen));
        check('Soll Urteile wie eingefroren', JS(ist.urteile) === JS(soll.urteile));
    }
    check('Keine Hauptwelt hatte Ladefehler', w.ladefehler.length === 0);
    console.log('KI-Text (Phase 5D.2): ' + ok + ' Prüfungen ok, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
