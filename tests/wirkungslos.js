/* ============================================================
   WIRKUNGSLOSE FUNKTIONEN (Phase 5C, nur Analyse und Sicherheitsnetz). Start: node tests/wirkungslos.js      (Soll neu schreiben: --schreiben)
   Ändert kein Produktverhalten und keine Produktdatei. Alles Eingeschaltete passiert NUR in der Testwelt (Ladereihenfolge im Test verändert).
   Soll-Zustand: tests/wirkungslos_soll.json. Beschreibung und Empfehlungen: tests/wirkungslos-analyse.md.

   Gemessen wird (Teile A–C der Phase 5C, die tote Langzeit-Suche, das Aufräumen und die foto_stundenplan-Hülle, sind seit Phase 5D.1 umgebaut:
   ihre Messung steht jetzt in tests/suche.js; der damalige Befund bleibt in tests/wirkungslos-analyse.md nachlesbar):
   D. festnamen.js / hoerkorrektur.js: jede Regel einzeln (positive und negative Fälle), dann 35 Eingaben durch den echten Sprechweg
      (voice.js: fixKnownMishearings -> handleLocalCommand -> sendToGroqSmart) in vier Testwelten: A heute, B +festnamen, C +hoerkorrektur, D beide.
   E. Wohin der (korrigierte) Text läuft: Chat-Verlauf, Gedächtnis-Text, Aktionen.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { starte, lies } = require('./umgebung.js');

const SOLL_DATEI = path.join(__dirname, 'wirkungslos_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);
const kurz = (s, n) => { s = String(s).replace(/\s+/g, ' '); return s.length > (n || 90) ? s.slice(0, n || 90) + '…' : s; };

/* ---------- Ladereihenfolge nur im Test ---------- */
const hinterAssistant = dateien => l => { dateien.forEach(f => { const i = l.indexOf(f); if (i >= 0) l.splice(i, 1); }); const j = l.indexOf('assistant.js'); l.splice(j + 1, 0, ...dateien); return l; };
const welt = opt => starte(Object.assign({ festerZufall: true, echtesSpeak: true }, opt || {}));

const enthaelt = (liste, teil) => Array.isArray(liste) && liste.some(x => String(x).indexOf(teil) >= 0);

/* ---------- D: Korrektur-Regeln und Eingaben ---------- */
const MIS_QUELLE = (lies('js/voice.js').match(/function fixKnownMishearings\(text\) \{[\s\S]*?\n    \}/) || [''])[0];
const fixKnownMishearings = MIS_QUELLE ? vm.runInNewContext('(' + MIS_QUELLE.replace(/^function fixKnownMishearings/, 'function') + ')') : null;

const FEST_REGELN = [   // [Eingabe, erwartet (so wie gemeint), Art]
    ['Route zu Alicia', 'Route zu Alyssa', 'pos'], ['Alycia kommt', 'Alyssa kommt', 'pos'], ['Alisia', 'Alyssa', 'pos'], ['Alissa', 'Alyssa', 'pos'], ['Alyssia', 'Alyssa', 'pos'], ['Alicias Geburtstag', 'Alyssas Geburtstag', 'pos'],
    ['Alyssa', 'Alyssa', 'neg'], ['Alissandro kommt', 'Alissandro kommt', 'neg'], ['Alicante im Urlaub', 'Alicante im Urlaub', 'neg'],
    ['Fahr zum Neu Galina Ring', 'Fahr zum Neu-Galliner-Ring', 'pos'], ['Neu Gallin Ring', 'Neu-Galliner-Ring', 'pos'], ['neugalliner ring', 'Neu-Galliner-Ring', 'pos'], ['Neu-Galliner-Ring', 'Neu-Galliner-Ring', 'neg'], ['Neu Kalliner Ring', 'Neu-Galliner-Ring', 'luecke'],
    ['Wie komme ich nach Schwarzenbeck', 'Wie komme ich nach Schwarzenbek', 'pos'], ['Schwarzenbek', 'Schwarzenbek', 'neg'],
    ['Mein Name ist Schröter', 'Mein Name ist Schroeter', 'pos'], ['Ich bin Schroeter', 'Ich bin Schroeter', 'neg'], ['Ruf Herrn Schröter von der Bank an', 'Ruf Herrn Schröter von der Bank an', 'mehrdeutig'],
    ['Zum Verbrüderungs Ring', 'Zum Verbrüderungsring', 'pos'], ['Verbrüderungsring 13', 'Verbrüderungsring 13', 'neg'],
    ['Zain wie spät ist es', 'Zane wie spät ist es', 'pos'], ['Zayn bitte', 'Zane bitte', 'pos'], ['Sane sag mal', 'Zane sag mal', 'pos'], ['Zaino Kaffee', 'Zaino Kaffee', 'neg'], ['Sanierung am Haus', 'Sanierung am Haus', 'neg'], ['Zane', 'Zane', 'neg'],
    ['Hey Sein was gibt es Neues', 'Hey Zane was gibt es Neues', 'pos'], ['Hallo zehn Euro sind zu wenig', 'Hallo zehn Euro sind zu wenig', 'falsch'], ['Hey sehn wir uns morgen', 'Hey sehn wir uns morgen', 'falsch'], ['Um zehn Uhr Termin', 'Um zehn Uhr Termin', 'neg'],
    ['Ein Zein Protein', 'Ein Zein Protein', 'falsch']
];
function hoerRegeln(sb, store) {   // vom Nutzer gelernt (so wie "Wenn ich X sage, meine ich Y" es ablegt)
    store['jv_hoerkorrektur'] = JSON.stringify({ 'Matthes': 'Matze', 'haben jetzt': { r: 'Hamiyet', c: 1 } });
}
const HOER_REGELN = [
    ['Wann hat Hamlet Feierabend', 'Wann hat Hamiyet Feierabend', 'pos'], ['hamlet', 'Hamiyet', 'pos'], ['Wer hat Hamlet von Shakespeare geschrieben', 'Wer hat Hamlet von Shakespeare geschrieben', 'falsch'], ['Hamlets Monolog', 'Hamlets Monolog', 'neg'],
    ['Ruf Matthes an', 'Ruf Matze an', 'pos'], ['Matthes Tisch', 'Matthes Tisch', 'mehrdeutig'],
    ['Ruf haben jetzt an', 'Ruf Hamiyet an', 'pos'], ['Wir haben jetzt Zeit', 'Wir haben jetzt Zeit', 'neg'], ['Schreib mit haben jetzt', 'Schreib mit Hamiyet', 'pos'],
    ['Wann haben jetzt Pause', 'Wann haben jetzt Pause', 'neg']
];

const EINGABEN = [   // [Kategorie, Eingabe wie vom Handy erkannt, erwartet für die KI (gemeint), mehrdeutig?]
    ['Unterhaltung', 'Hallo Jarvis wie geht es dir', 'Hallo Zane wie geht es dir'], ['Unterhaltung', 'Erzähl mir einen Witz', 'Erzähl mir einen Witz'], ['Unterhaltung', 'Hey sein was machst du so', 'Hey Zane was machst du so'],
    ['Unterhaltung', 'Hallo zehn Minuten Pause bitte', 'Hallo zehn Minuten Pause bitte'],
    ['Namen', 'Ruf Alicia an', 'Ruf Alyssa an'], ['Namen', 'Schreib Alycia eine Nachricht', 'Schreib Alyssa eine Nachricht'], ['Namen', 'Wann hat Alissa Geburtstag', 'Wann hat Alyssa Geburtstag'],
    ['Namen', 'Ist Herr Schröter heute da', 'Ist Herr Schröter heute da', true], ['Namen', 'Wer hat Hamlet geschrieben', 'Wer hat Hamlet geschrieben'], ['Namen', 'Wann hat Hamlet Feierabend', 'Wann hat Hamiyet Feierabend'], ['Namen', 'Zayn wie spät ist es', 'Zane wie spät ist es'],
    ['Orte', 'Fahr zum Neu Galina Ring', 'Fahr zum Neu-Galliner-Ring'], ['Orte', 'Wie komme ich nach Schwarzenbeck', 'Wie komme ich nach Schwarzenbek'], ['Orte', 'Navigier mich zum Verbrüderungs Ring', 'Navigier mich zum Verbrüderungsring'], ['Orte', 'Wo ist der Neugalliner Ring Parkplatz', 'Wo ist der Neu-Galliner-Ring Parkplatz'],
    ['Navigation', 'Wie lange brauche ich zur Arbeit', 'Wie lange brauche ich zur Arbeit'], ['Navigation', 'Route nach Alicia', 'Route nach Alyssa'], ['Navigation', 'Navigier mich nach Schwarzenbeck bei Hamburg', 'Navigier mich nach Schwarzenbek bei Hamburg'],
    ['Termine', 'Trag morgen um zehn Uhr einen Termin ein', 'Trag morgen um zehn Uhr einen Termin ein'], ['Termine', 'Termin mit Alicia am Freitag um 15 Uhr', 'Termin mit Alyssa am Freitag um 15 Uhr'], ['Termine', 'Termin mit Herrn Schröter am Montag', 'Termin mit Herrn Schröter am Montag', true],
    ['Erinnerungen', 'Erinner mich morgen an den Arzt', 'Erinner mich morgen an den Arzt'], ['Erinnerungen', 'Erinner mich an den Anruf bei Hamlet', 'Erinner mich an den Anruf bei Hamiyet'],
    ['Wetter', 'Wird es in Schwarzenbeck morgen regnen', 'Wird es in Schwarzenbek morgen regnen'], ['Wetter', 'Brauche ich heute einen Schirm', 'Brauche ich heute einen Schirm'],
    ['Schicht', 'Wann habe ich nächste Woche Frühschicht', 'Wann habe ich nächste Woche Frühschicht'], ['Schicht', 'Habe ich am Wochenende Spätschicht', 'Habe ich am Wochenende Spätschicht'],
    ['Gedächtnis', 'Merk dir dass Alicia am Samstag kommt', 'Merk dir dass Alyssa am Samstag kommt'], ['Gedächtnis', 'Merk dir mein Nachname ist Schröter', 'Merk dir mein Nachname ist Schroeter'], ['Gedächtnis', 'Was weißt du über mich', 'Was weißt du über mich'], ['Gedächtnis', 'Was habe ich mir über Hamlet gemerkt', 'Was habe ich mir über Hamiyet gemerkt'],
    ['Foto', 'Mach ein Foto vom Brief an Schröter', 'Mach ein Foto vom Brief an Schröter', true], ['Foto', 'Stundenplan von Alycia fotografieren', 'Stundenplan von Alyssa fotografieren'],
    ['Mehrfachfrage', 'Wie wird das Wetter in Schwarzenbeck und ruf Alicia an', 'Wie wird das Wetter in Schwarzenbek und ruf Alyssa an'], ['Mehrfachfrage', 'Was habe ich heute vor und wie kalt ist es in Schwarzenbeck', 'Was habe ich heute vor und wie kalt ist es in Schwarzenbek']
];

async function weltMitKern(opt) {
    const w = welt(opt), aufruf = [];
    w.sb.sendToGroqSmartCore = async function (t) { aufruf.push(String(t)); return 'KERN'; };
    w.aufruf = aufruf; hoerRegeln(w.sb, w.store);
    return w;
}
async function sprechweg(w, roh) {   // wie voice.js handleRecognizedText: erst fixKnownMishearings, dann feste Befehle, sonst KI
    const m = fixKnownMishearings(roh), alt = { speak: w.sb.speak, speakAck: w.sb.speakAck };
    w.sb.speak = function () { }; w.sb.speakAck = function () { };
    w.aufruf.length = 0;
    const x = await w.satz(m);
    if (!x.lokal) await w.sb.sendToGroqSmart(m);   // sonst ging der Satz (oder ein Teilsatz bei Mehrfachfragen) schon im lokalen Weg an die KI-Kappe
    const ki = w.aufruf.length ? w.aufruf.slice() : null;
    w.sb.speak = alt.speak; w.sb.speakAck = alt.speakAck;
    return { lokal: x.lokal, modul: x.modul, ki };
}

(async () => {
    const soll = fs.existsSync(SOLL_DATEI) ? JSON.parse(fs.readFileSync(SOLL_DATEI, 'utf8')) : {};
    const ist = {};
    /* ===== D. Korrektur-Regeln ===== */
    check('D0. fixKnownMishearings lässt sich aus js/voice.js lesen (Testwerkzeug)', typeof fixKnownMishearings === 'function');
    const wR = await weltMitKern();
    ist.regeln = { festnamen: FEST_REGELN.map(([e, erw, art]) => { const a = wR.sb.jvFestnamen(e); return [e, a, art, a === erw ? 'wie gemeint' : 'ANDERS']; }), hoerkorrektur: HOER_REGELN.map(([e, erw, art]) => { const a = wR.sb.jvHoerKorrektur(e); return [e, a, art, a === erw ? 'wie gemeint' : 'ANDERS']; }) };
    {   // kurze, allgemeine Wörter: der Lernbefehl prüft nur eine kleine Liste
        const w = await weltMitKern(); w.store['jv_hoerkorrektur'] = '{}';
        const lernen = [];
        for (const s of ['Wenn ich Mal sage, meine ich Malte', 'Wenn ich Ende sage, meine ich Enne', 'Wenn ich der sage, meine ich den', 'Wenn ich Hamlet sage, meine ich Hamiyet']) { w.sb.handleHoerKorrekturCommand(s); }
        const map = JSON.parse(w.store['jv_hoerkorrektur'] || '{}');
        ist.lernen = { gespeichert: Object.keys(map), danach: ['Sag mal wie spät es ist', 'Am Ende der Straße', 'Wer ist der Mann'].map(t => [t, w.sb.jvHoerKorrektur(t)]) };
    }
    /* vier Welten */
    const WELTEN = {
        'A heute': {},
        'B +festnamen': { skriptReihenfolge: hinterAssistant(['festnamen.js']) },
        'C +hoerkorrektur': { skriptReihenfolge: hinterAssistant(['hoerkorrektur.js']) },
        'D beide': { skriptReihenfolge: hinterAssistant(['festnamen.js', 'hoerkorrektur.js']) }
    };
    const wk = {};
    for (const n of Object.keys(WELTEN)) { wk[n] = await weltMitKern(WELTEN[n]); check('D0. Welt ' + n + ' lädt ohne Ladefehler', wk[n].ladefehler.length === 0, JS(wk[n].ladefehler)); }
    ist.eingaben = [];
    for (const [kat, roh, erw, mehr] of EINGABEN) {
        const z = { kat, roh, erwartet: erw, mehrdeutig: !!mehr };
        for (const n of Object.keys(WELTEN)) z[n] = await sprechweg(wk[n], roh);
        const A = z['A heute'];
        z.heuteWieGemeint = !A.lokal && (A.ki || [])[0] === erw;   // false = schon die heutige Verarbeitung weicht vom Gemeinten ab
        z.urteil = {};
        for (const n of ['B +festnamen', 'C +hoerkorrektur', 'D beide']) {
            const r = z[n];
            if (A.lokal || r.lokal) { z.urteil[n] = A.lokal !== r.lokal ? 'ANDERER WEG' : JS(A.ki) === JS(r.ki) ? 'unverändert (lokaler Weg)' : 'KI-Teilsatz geändert'; continue; }
            const heuteT = (A.ki || [])[0], neuT = (r.ki || [])[0];
            if (neuT === heuteT) z.urteil[n] = 'unverändert';
            else if (z.mehrdeutig) z.urteil[n] = 'fragwürdig';
            else if (neuT === erw) z.urteil[n] = 'verbessert';
            else if (heuteT === erw) z.urteil[n] = 'verschlechtert';
            else z.urteil[n] = 'fragwürdig';
        }
        ist.eingaben.push(z);
    }

    /* Der lokale Weg: festnamen (Rang 10) und hoerkorrektur (Rang 400) sind als Befehls-Einträge AKTIV. Was bekommt ein spätes Glied der Kette? */
    {
        const w = await weltMitKern(), gesehen = [];
        w.sb.jvCommands.use('zz_test_spaetes_glied', function (text, next) { gesehen.push(text); return false; }, 5000);
        w.sb.speak = function () { }; w.sb.speakAck = function () { };
        ist.lokalerText = [];
        for (const t of ['Termin mit Herrn Schröter am Montag', 'Erinner mich an den Anruf bei Hamlet', 'Schreib Alycia eine Nachricht', 'Fahr zum Neu Galina Ring', 'Wie komme ich nach Schwarzenbeck', 'Hey sehn wir uns morgen', 'Wer hat Hamlet geschrieben']) {
            gesehen.length = 0; await w.satz(t); ist.lokalerText.push(t + ' => ' + JS(gesehen.slice()));
        }
    }

    /* ===== E. wohin der Text läuft (Quelltext-Fakten) ===== */
    const ass = lies('js/assistant.js');
    ist.textfluss = {
        chatVerlauf: /chatHistory\.push\(\{ role: "user", content: text \}\)/.test(ass),
        letzterText: /window\.jvLetzterText = text/.test(ass),
        aktionenBekommenText: /await executeAction\(action, text, ctx\)/.test(ass),
        merkDirTextKommtAusText: /const said = String\(text \|\| ''\)/.test(lies('js/gedaechtnis.js')),
        festnamenBeimSpeichern: /jvFestnamen\(memoryItems\[newKey\]\)/.test(lies('js/actions.js')) && /body\.text = window\.jvFestnamen\(body\.text\)/.test(lies('js/langzeit.js')),
        hoerenNutztFestnamenNurZumBewerten: /const score = t => \{ const f = fest\(t\)/.test(lies('js/hoeren.js')) && !/window\.jvFestnamen\(/.test(lies('js/hoeren.js').replace(/const fest = [^\n]*/, ''))
    };


    if (SCHREIBEN) { fs.writeFileSync(SOLL_DATEI, JSON.stringify(ist, null, 1) + '\n'); console.log('Soll-Zustand geschrieben: ' + SOLL_DATEI); process.exit(0); }

    /* ---------- Vergleich mit dem Soll ---------- */
    check('D. Regeln festnamen/hoerkorrektur wie eingefroren', JS(ist.regeln) === JS(soll.regeln));
    check('D. Lernbefehl (kurze/allgemeine Wörter) wie eingefroren', JS(ist.lernen) === JS(soll.lernen));
    ist.eingaben.forEach((z, i) => check('D. Eingabe ' + (i + 1) + ' (' + z.kat + '): ' + kurz(z.roh, 40) + ' in allen vier Welten wie eingefroren', JS(z) === JS(soll.eingaben && soll.eingaben[i])));
    check('D. Text, den spätere Glieder der lokalen Befehlskette heute bekommen, wie eingefroren', JS(ist.lokalerText) === JS(soll.lokalerText), JS(ist.lokalerText));
    check('E. Textfluss (Quelltext-Fakten) wie eingefroren', JS(ist.textfluss) === JS(soll.textfluss), JS(ist.textfluss));
    for (const k of Object.keys(soll)) check('Soll-Schlüssel ' + k + ' wird noch gemessen', k in ist);

    /* ---------- Sachaussagen (Befunde), unabhängig von der Soll-Datei ---------- */
    const F = ist.eingaben;
    check('Befund Korrektur: die Welten B/C/D ändern den lokalen Weg nicht (gleiches Ergebnis wie heute)', F.every(z => ['B +festnamen', 'C +hoerkorrektur', 'D beide'].every(n => z.urteil[n] !== 'ANDERER WEG')));
    check('Befund Korrektur: 35 Eingaben, alle vier Welten gemessen', F.length === 35 && F.every(z => 'A heute' in z && 'D beide' in z));
    check('Befund Korrektur: es gibt echte Verbesserungen UND echte Verschlechterungen (Hamlet-Frage, "Hallo zehn ..."/Schröter mehrdeutig)', F.some(z => Object.values(z.urteil).includes('verbessert')) && F.some(z => Object.values(z.urteil).includes('verschlechtert') || Object.values(z.urteil).includes('fragwürdig')));
    check('Befund Textfluss: die korrigierte Fassung (nicht das Original) landet im Chat-Verlauf, in jvLetzterText, im Aktionskontext und im Merk-dir-Text', ist.textfluss.chatVerlauf && ist.textfluss.letzterText && ist.textfluss.aktionenBekommenText && ist.textfluss.merkDirTextKommtAusText);

    check('Befund lokaler Weg: festnamen/hoerkorrektur wirken HEUTE schon auf alle lokalen Befehle (Schröter -> Schroeter, Hamlet -> Hamiyet, Alycia -> Alyssa, Neu Galina Ring -> Neu-Galliner-Ring)', /Schroeter/.test(ist.lokalerText[0]) && /Hamiyet/.test(ist.lokalerText[1]) && /Alyssa/.test(ist.lokalerText[2]) && /Neu-Galliner-Ring/.test(ist.lokalerText[3]) && /Schwarzenbek/.test(ist.lokalerText[4]), JS(ist.lokalerText));
    check('Befund Doppelkorrektur: Alicia/Alissa/Alisha und Zain/Zayn/Zein/Zeyn/Sane/Jarvis und "Hey sein/sain/zehn/seyn" korrigiert schon voice.js (fixKnownMishearings); die Welten B/C/D ändern diese Namen nicht', ist.eingaben.filter(z => /Alicia|Alissa|Zayn|Hey sein/.test(z.roh) && !z['A heute'].lokal).every(z => z.urteil['D beide'] === 'unverändert'));
    check('Befund heutige Fehlkorrektur: "Hallo zehn Minuten Pause bitte" wird schon HEUTE (voice.js) zu "Hallo Zane Minuten ..."', ist.eingaben.find(z => z.roh === 'Hallo zehn Minuten Pause bitte').heuteWieGemeint === false);
    check('Befund Lernbefehl: "Wenn ich Mal sage, meine ich Malte" und "... Ende ..." werden angenommen und verändern danach normale Sätze', JS(ist.lernen.gespeichert) === JS(['Mal', 'Ende', 'Hamlet']) && /Sag Malte/.test(ist.lernen.danach[0][1]) && /Enne/.test(ist.lernen.danach[1][1]));

    /* Gegenproben */
    {
        const wz = await weltMitKern({ skriptReihenfolge: hinterAssistant(['festnamen.js']), quelleAendern: (f, q) => f === 'festnamen.js' ? q.replace("[/schwarzenbeck/, 'Schwarzenbek'],", '') : q });
        const r = await sprechweg(wz, 'Wie komme ich nach Schwarzenbeck');
        check('Gegenprobe: ohne die Schwarzenbek-Regel bleibt der Ortsname unkorrigiert (der Test misst die Regel wirklich)', r.ki && /Schwarzenbeck/.test(r.ki[0]));
    }

    console.log('\nWirkungslose Funktionen (Phase 5C): ' + ok + ' Prüfungen ok, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
