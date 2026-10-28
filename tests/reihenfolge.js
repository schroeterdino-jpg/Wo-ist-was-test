/* ============================================================
   REIHENFOLGE-SICHERHEITSNETZ. Start: node tests/reihenfolge.js        (Soll-Zustand neu schreiben: node tests/reihenfolge.js --schreiben)
   Friert den HEUTIGEN, funktionierenden Zustand der impliziten Ketten ein, BEVOR jemand sie umbaut. Verändert kein Produktverhalten
   und keine Produktdatei. Der Soll-Zustand steht in tests/reihenfolge_soll.json.

   Gemessen wird auf zwei Arten:
   A. Protokoll: nach jedem geladenen Skript wird festgehalten, welche Datei welche Funktion ersetzt/umhüllt hat
      (parsePhotoRequest, processPhoto, handlePhotoCommand, parseFollowupTask, showActionCards, speak, handleLocalCommand, ...).
   B. Wirkung: dieselben Eingaben laufen durch die echten Ketten; festgehalten wird, was am unteren Ende ankommt
      (Foto-Erkennung, Folgeaufgabe, Foto-Befehl, Foto-Auswertung mit Karten, gesprochener Text, Befehls-Gewinner).
   C. Gegenproben: dieselbe App wird mit künstlich vertauschter Reihenfolge (oder im Speicher veränderter Quelle) geladen. Der Test
      verlangt, dass das Protokoll bzw. die Wirkung dann ABWEICHT. Produktdateien auf der Platte werden nie verändert.
   Phase 3: Die Foto-Funktionen (parsePhotoRequest, processPhoto, handlePhotoCommand, parseFollowupTask, photoAskWhatToDo, confirmPhotoPending, showActionCards)
      laufen jetzt über die explizite Kette window.jvFotoKette (js/foto_kette.js, Ränge statt Ladereihenfolge). Sie stehen deshalb NICHT mehr im Ladeprotokoll (A),
      sondern werden über die aktive Kette selbst (A2, Soll: fotoKette), ihre Wirkung (B), die Fehlerfälle der Anmeldung (A3) und Gleichproben mit anderer Ladereihenfolge (C) geschützt.
   D. native_speech.js: lädt vor commands.js und hat deshalb seinen Warte-/Wiederholungsweg (wird hier nur bewiesen, nicht repariert).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const { starte, lies } = require('./umgebung.js');

const SOLL_DATEI = path.join(__dirname, 'reihenfolge_soll.json');
const SCHREIBEN = process.argv.includes('--schreiben');
let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }
const JS = x => JSON.stringify(x);

/* Funktionen, deren Ersetzung/Umhüllung protokolliert wird */
const BEOBACHTET = ['speak', 'speakBrowser', 'speakAck',
    'handleLocalCommand', 'buildSystemPrompt', 'buildMenuPanel', 'executeAction', 'handleAvatarExpressionCommand'];
const html = lies('index.html');
const INLINE = (html.split('<script>').slice(1).map(x => x.split('</script>')[0]).filter(x => x.indexOf('handleAvatarExpressionCommand') >= 0)[0]) || '';

/* ---------- Welt mit Beobachtern ---------- */
function welt(extra) {
    const prot = [], letzte = {}, aufz = { sprechen: [], karten: [], kartenRoh: [], vision: [], toene: [], oeffnen: [] };
    function beobachte(name, sb) {
        for (const n of BEOBACHTET) {
            const v = sb[n];
            if (typeof v === 'function' && letzte[n] !== v) { prot.push(name + ' -> ' + n); letzte[n] = v; }
        }
    }
    const opt = Object.assign({
        festerZufall: true, echtesSpeak: true,
        nachSkript: (f, sb) => {
            beobachte(f, sb);
            if (f === 'places.js') {   // ganz unten in der Karten-Kette: Aufzeichner statt DOM
                sb.showActionCards = function (karten) { aufz.kartenRoh.push((karten || []).map(k => ({ icon: k && k.icon, title: k && k.title, onclick: k && k.onclick }))); aufz.karten.push((karten || []).map(k => String((k && k.title) || '') + (k && k.subtitle ? ' | ' + String(k.subtitle).slice(0, 40) : ''))); };
                letzte.showActionCards = sb.showActionCards;
            }
            if (f === 'voice.js') {     // ganz unten in der speak-Kette: Aufzeichner statt Stimme
                sb.speak = function (t, fertig) { aufz.sprechen.push(String(t == null ? '' : t)); };
                letzte.speak = sb.speak;
            }
            if (f === 'kopf.js' && INLINE) {   // das Inline-Skript aus index.html (Mimik-Befehle) steht an dieser Stelle
                try { require('vm').runInContext(INLINE, sb, { filename: 'index.html(inline)' }); } catch (e) { }
                beobachte('index.html(inline)', sb);
            }
        }
    }, extra || {});
    const w = starte(opt);
    w.prot = prot; w.aufz = aufz;
    w.sb.askVision = async function (sys, q) { aufz.vision.push(String(sys).slice(0, 48) + ' | ' + String(q).slice(0, 48)); return '{}'; };
    w.sb.playTone = undefined;
    w.sb.open = function (u) { aufz.oeffnen.push(String(u).slice(0, 60)); return null; };
    return w;
}
const tausche = (a, b) => l => { const x = l.indexOf(a), y = l.indexOf(b); if (x < 0 || y < 0) return l; l[x] = b; l[y] = a; return l; };

/* ---------- Messungen ---------- */
const THEMEN = ['brief', 'stundenplan', 'essensplan', 'urlaubsplan', 'rezept', 'adresse', 'wunschliste', 'person', 'visitenkarte', 'einkaufszettel', 'speisekarte', 'plakat', 'parkschild', 'tabelle'];
const TAETIGKEITEN = ['', 'fotografieren', 'abtippen', 'merken', 'übersetzen', 'vorlesen', 'eintragen', 'in die liste setzen'];
const VORSATZ = ['foto vom ', 'mach ein foto von meinem '];
const PARSE_PROBEN = [];
for (const t of THEMEN) for (const v of TAETIGKEITEN) for (const p of VORSATZ) PARSE_PROBEN.push((p + t + ' ' + v).trim());
['tipp das ab', 'Schreib mir die Tabelle ab', 'Speichere die Adresse vom Foto', 'Was kann ich damit kochen', 'Übersetze das Schild', 'Darf ich hier parken',
    'Was ist das für eine Pflanze', 'Rezept vom Foto', 'Rezept abtippen', 'Merk dir die Person auf dem Foto', 'Plakat Termin eintragen', 'Mach ein Foto', 'Wie spät ist es',
    'Lies mir den Brief vor', 'Warnleuchte erkennen'].forEach(x => PARSE_PROBEN.push(x));

const FOLGE_PROBEN = ['tipp es ab', 'abtippen', 'merk dir das', 'speicher das im gedächtnis', 'setz das auf die einkaufsliste', 'übersetze das', 'was ist das', 'schreib die adresse ab',
    'speicher die adresse', 'das ist ein brief', 'fass den brief zusammen', 'das ist der stundenplan', 'trag den stundenplan ein', 'das ist der essensplan', 'das ist der urlaubsplan',
    'setz das auf die wunschliste', 'merk dir die person', 'lies es vor', 'trag das in den kalender ein', 'danke'];

const BEFEHL_PROBEN = ['foto vom brief', 'foto vom stundenplan', 'mach ein foto', 'rezept vom foto', 'merk dir die person auf dem foto', 'tipp das ab', 'ich möchte ein bild aus meinem dateiordner hinzufügen',
    'zum foto was kostet das', 'ja', 'nein', 'wie spät ist es', 'foto vom essensplan', 'foto vom urlaubsplan', 'foto von der wunschliste', 'speichere die adresse vom foto'];

const AUSWERTUNG_AUFGABEN = ['describe', 'abtippen', 'address', 'letter', 'stundenplan', 'essensplan', 'urlaubsplan', 'wunschliste', 'person', 'rezept', 'translate', 'contact', 'shopping', 'events', 'parking', 'zzz-unbekannt'];

const SPEAK_PROBEN = ['Okay.', 'Das kostet 12,99 € – ein günstiger Preis, wirklich sehr günstig für diese Qualität.', 'Okay.', 'Der Termin ist morgen um 10 Uhr bei Frau Meier im Rathaus am Marktplatz.',
    'Das hat geklappt!', 'Das hat leider nicht geklappt.', 'Es regnet heute den ganzen Tag, nimm besser einen Schirm mit.', 'Guten Morgen!', 'Alles klar, ich habe es eingetragen.'];

async function messeFoto(w) {
    const sb = w.sb, a = w.aufz;
    const r = {};
    r.parse = PARSE_PROBEN.map(p => { try { const x = sb.parsePhotoRequest(p); return p + ' = ' + (x ? x.task : '-'); } catch (e) { return p + ' = FEHLER'; } });
    r.folge = FOLGE_PROBEN.map(p => { try { const x = sb.parseFollowupTask(p); return p + ' = ' + (x ? x.task : '-'); } catch (e) { return p + ' = FEHLER'; } });
    r.befehl = [];
    for (const p of BEFEHL_PROBEN) {
        a.sprechen.length = 0; a.karten.length = 0;
        let ret; try { ret = sb.handlePhotoCommand(p); } catch (e) { ret = 'FEHLER'; }
        await new Promise(res => setImmediate(res));
        r.befehl.push(p + ' = ' + ret + ' | ' + a.sprechen.join(' / ').slice(0, 90) + ' | ' + a.karten.map(k => k.join('; ')).join(' // ').slice(0, 90));
    }
    r.auswertung = [];
    for (const t of AUSWERTUNG_AUFGABEN) {
        a.sprechen.length = 0; a.karten.length = 0; a.vision.length = 0;
        let fehl = '';
        try { const x = await w.lassLaufen(() => sb.processPhoto({ task: t, question: 'test ' + t, at: w.uhr.ms }, 'data:image/jpeg;base64,AAAA')); if (x.haengt) fehl = 'HÄNGT'; } catch (e) { fehl = 'FEHLER ' + String(e.message).slice(0, 30); }
        r.auswertung.push(t + ' = ' + fehl + ' | vision: ' + a.vision.join(' ## ').slice(0, 130) + ' | sagt: ' + a.sprechen.join(' / ').slice(0, 90) + ' | karten: ' + a.karten.map(k => k.join('; ')).join(' // ').slice(0, 110));
    }
    a.karten.length = 0;
    sb.showActionCards([{ title: 'Probe-Karte', subtitle: 'x' }]);
    r.kartenKette = a.karten.map(k => k.join('; '));

    /* ---- Phase 3: photoAskWhatToDo (Auswahlkarten nach einem Foto ohne Befehl), confirmPhotoPending, showActionCards-Kette ---- */
    const kurz = k => (k || []).map(c => (c.icon || '') + ' ' + c.title + ' → ' + c.onclick);
    const FOTO = { dataUrl: 'data:image/jpeg;base64,AAAA', at: w.uhr.ms };
    const zurueck = () => { a.sprechen.length = 0; a.karten.length = 0; a.kartenRoh.length = 0; a.vision.length = 0; a.oeffnen.length = 0; };
    const warteKurz = async () => { for (let i = 0; i < 4; i++) await new Promise(res => setImmediate(res)); };
    r.fragenOhneFoto = []; r.fragenMitFoto = []; r.folgeaktion = [];
    for (const [name, foto] of [['ohne lastPhoto', null], ['mit lastPhoto (Erkennung läuft)', FOTO]]) {
        w.setze('lastPhoto', foto); w.setze('photoIntent', null);
        zurueck();
        const idVor = sb.showActionCards;
        let fehl = '';
        try { sb.photoAskWhatToDo(); } catch (e) { fehl = 'FEHLER ' + e.message; }
        await warteKurz();
        const ziel = foto ? r.fragenMitFoto : r.fragenOhneFoto;
        ziel.push(name + ' | ' + fehl + ' | sagt: ' + a.sprechen.join(' / ').slice(0, 100) + ' | Aufrufe: ' + a.kartenRoh.length + ' | vision: ' + a.vision.join(' ## ').slice(0, 120));
        a.kartenRoh.forEach((k, i) => kurz(k).forEach(z => ziel.push('  Aufruf ' + (i + 1) + ': ' + z)));
        ziel.push('showActionCards nach dem Aufruf unverändert (vorübergehende Eingriffe zurückgenommen): ' + (sb.showActionCards === idVor));
    }
    /* Folgeaktion: jede Karte der Auswahl führt zu runLastPhotoTask(aufgabe); die Aufgabe läuft mit dem Foto bis zum unteren Ende */
    {
        w.setze('lastPhoto', FOTO); zurueck();
        const aufgaben = [];
        sb.photoAskWhatToDo(); await warteKurz();
        a.kartenRoh.forEach(k => k.forEach(c => { const m = /runLastPhotoTask\('(\w+)'/.exec(String(c.onclick || '')); if (m && aufgaben.indexOf(m[1]) < 0) aufgaben.push(m[1]); }));
        for (const t of aufgaben) {
            w.setze('lastPhoto', FOTO); zurueck();
            let fehl = '';
            try { const x = await w.lassLaufen(() => sb.runLastPhotoTask(t, 'test ' + t)); if (x.haengt) fehl = 'HÄNGT'; } catch (e) { fehl = 'FEHLER ' + String(e.message).slice(0, 30); }
            r.folgeaktion.push(t + ' = ' + fehl + ' | vision: ' + a.vision.join(' ## ').slice(0, 110) + ' | sagt: ' + a.sprechen.join(' / ').slice(0, 80) + ' | karten: ' + a.karten.map(k => k.join('; ')).join(' // ').slice(0, 100));
        }
        r.folgeaktion.unshift('Aufgaben der Karten: ' + aufgaben.join(','));
    }
    /* confirmPhotoPending: Wirkung je Art der wartenden Sache */
    r.bestaetigen = [];
    const PENDS = [['keine', null], ['Adresse', { type: 'address', at: w.uhr.ms, data: [{ dest: 'Teststraße 1, 12345 Teststadt', label: 'Teststraße 1' }] }],
        ['Adresse abgelaufen', { type: 'address', at: w.uhr.ms - 99 * 60000, data: [{ dest: 'x' }] }],
        ['Brief ohne Plan', { type: 'letter', at: w.uhr.ms, data: { plan: [] } }], ['Brief abgelaufen', { type: 'letter', at: w.uhr.ms - 99 * 60000, data: { plan: [] } }],
        ['Kontakt', { type: 'contact', at: w.uhr.ms, data: { name: 'Max Muster', telefon: '', adresse: '' } }], ['Einkauf', { type: 'shopping', at: w.uhr.ms, data: ['Milch'] }]];
    for (const [name, pend] of PENDS) {
        w.setze('photoPending', pend); zurueck();
        let fehl = '';
        try { const x = await w.lassLaufen(() => sb.confirmPhotoPending()); if (x.haengt) fehl = 'HÄNGT'; } catch (e) { fehl = 'FEHLER ' + String(e.message).slice(0, 40); }
        r.bestaetigen.push(name + ' = ' + fehl + ' | sagt: ' + a.sprechen.join(' / ').slice(0, 100) + ' | öffnet: ' + a.oeffnen.join(',') + ' | Karten: ' + a.kartenRoh.map(k => k.length).join(',') + ' | danach wartend: ' + JS(w.lese('photoPending') && w.lese('photoPending').type || null));
    }
    w.setze('photoPending', null);
    /* handlePhotoCommand mit wartender Adresse: zusätzliche Ja-Wörter aus foto_adresse */
    for (const t of ['navigier los', 'ja', 'fahr los', 'nein']) {
        w.setze('photoPending', { type: 'address', at: w.uhr.ms, data: [{ dest: 'Teststraße 1' }] }); zurueck();
        let ret; try { ret = sb.handlePhotoCommand(t); } catch (e) { ret = 'FEHLER'; }
        await warteKurz();
        r.bestaetigen.push('Befehl "' + t + '" bei wartender Adresse = ' + ret + ' | sagt: ' + a.sprechen.join(' / ').slice(0, 80) + ' | öffnet: ' + a.oeffnen.join(','));
    }
    w.setze('photoPending', null); w.setze('lastPhoto', null);
    /* showActionCards-Kette (dauerhafte Erweiterungen): Foto-Auswahlkarten bekommen die WhatsApp-Karte, andere Listen nicht */
    r.kartenKetteLang = [];
    for (const [name, liste] of [['Foto-Auswahl', [{ icon: 'x', title: 'A', onclick: "runLastPhotoTask('read')" }]], ['normale Karten', [{ icon: 'y', title: 'B', onclick: 'foo()' }]],
        ['Foto-Auswahl mit schon vorhandener Sende-Karte', [{ title: 'A', onclick: "runLastPhotoTask('read')" }, { title: 'S', onclick: 'jvFotoSenden.senden()' }]], ['leer', []]]) {
        zurueck();
        try { sb.showActionCards(liste.map(c => Object.assign({}, c))); } catch (e) { a.kartenRoh.push([{ title: 'FEHLER ' + e.message }]); }
        r.kartenKetteLang.push(name + ' => ' + a.kartenRoh.map(k => kurz(k).join(' ; ')).join(' // '));
    }
    return r;
}

async function messeSpeak(w) {
    const sb = w.sb, a = w.aufz, r = {};
    r.kette = [];
    r.endet = a.sprechen.length;
    for (const t of SPEAK_PROBEN) {
        a.sprechen.length = 0;
        try { sb.speak(t); } catch (e) { a.sprechen.push('FEHLER ' + e.message); }
        r.kette.push(t.slice(0, 40) + ' => ' + a.sprechen.join(' / ') + ' | teilen merkt: ' + (sb.jvTeilen && sb.jvTeilen.letzte ? String(sb.jvTeilen.letzte()).slice(0, 70) : '-'));
        w.uhr.ms += 50;
    }
    // gleicher Text kurz nach sich selbst (Sprüche-Wrapper lässt Wiederholungen unverändert)
    a.sprechen.length = 0; sb.speak('Das ist ein längerer Satz für die Wiederholung, bitte genau so sagen.'); sb.speak('Das ist ein längerer Satz für die Wiederholung, bitte genau so sagen.');
    r.wiederholung = a.sprechen.slice();
    r.teilenLetzte = sb.jvTeilen && typeof sb.jvTeilen.letzte === 'function' ? String(sb.jvTeilen.letzte()).slice(0, 80) : '(fehlt)';
    // temporärer Fang in mehrfach.js: window.speak wird nur während der Teilfrage ersetzt und danach exakt wieder hergestellt
    const vor = sb.speak;
    a.sprechen.length = 0;
    let ret; try { ret = await w.lassLaufen(() => sb.handleLocalCommand('Wie wird morgen das Wetter und wann ist der nächste Vollmond?')); } catch (e) { ret = { fehler: e.message }; }
    r.mehrfach = { speakDanachGleich: sb.speak === vor, gesprochen: a.sprechen.slice(0, 4).map(x => x.slice(0, 80)), ret: ret && ret.wert === true };
    return r;
}

function befehlsKette(w) {
    const L = w.sb.jvCommands.list();
    const gruppen = {}; L.forEach(e => { const m = /^(\S+) (.+)$/.exec(e); (gruppen[m[1]] = gruppen[m[1]] || []).push(m[2]); });
    return { liste: L, gleichrang: Object.keys(gruppen).filter(k => gruppen[k].length > 1).map(k => k + ': ' + gruppen[k].join(' > ')) };
}

const SAETZE = (() => {   // fester Satzkorpus: Gewinner je Satz wird eingefroren
    const t = fs.readFileSync(path.join(__dirname, 'lauf.js'), 'utf8');
    const von = t.indexOf('const ROUTEN = ['), bis = t.indexOf('];', von);
    const aus = []; const re = /\[\s*'((?:[^'\\]|\\.)*)'\s*,\s*'((?:[^'\\]|\\.)*)'\s*\]/g; let m;
    const block = t.slice(von, bis);
    while ((m = re.exec(block))) aus.push(m[1].replace(/\\'/g, "'"));
    ['Wie ist das Wetter', 'Was steht heute an', 'Wann habe ich Schicht', 'Stell einen Wecker auf 7 Uhr', 'Hilfe', 'Starte die Tour', 'Wie komme ich zur Arbeit', 'Zeig mir die Rechnungen',
        'Wann ist Vollmond', 'Wie spät ist es in Tokio', 'Spiel Musik', 'Wie steht die Bundesliga', 'Wann ist der nächste Feiertag', 'Zeig die Kacheln', 'Zeig mir die Wunschliste', 'Ich brauche Urlaub',
        'Zeig mir mein Konto', 'Welche Fristen habe ich', 'Wo ist das nächste Restaurant', 'Mach einen Ausflug mit mir', 'Erinner mich morgen an den Zahnarzt', 'Lösche den Termin morgen',
        'Merk dir dass mein Auto grün ist', 'Teile die letzte Antwort', 'Schließen', 'Sei fröhlich', 'Lauschen ausschalten', 'Hey Jarvis ausschalten', 'Foto vom Brief', 'Mach ein Foto vom Stundenplan',
        'Wie ist die Lage', 'Was gibt es Neues', 'Zeig mir die Karte zum Rathaus', 'Ich habe Hunger', 'Wer bist du', 'Sag mal was', 'Hast du Post', 'Wann kommt mein Paket', 'Rechne 12 Euro in Dollar um',
        'Was kostet ein Flug nach Rom', 'Erzähl mir einen Witz', 'Frühere Schicht', 'Plan für morgen'].forEach(x => aus.push(x));
    return aus;
})();

async function messeGewinner(w) {
    const r = [];
    for (const s of SAETZE) {
        let x; try { x = await w.satz(s); } catch (e) { x = { modul: 'FEHLER' }; }
        r.push(s.slice(0, 70) + ' => ' + (x.modul || (x.lokal ? 'lokal' : 'KI')));
        try { await w.satz('abbrechen'); await w.satz('abbrechen'); } catch (e) { }
    }
    return r;
}

async function messeAlles() {
    const w = welt();
    const m = { protokoll: w.prot.slice(), ladefehler: w.ladefehler.slice() };
    m.fotoKette = { liste: w.sb.jvFotoKette.liste(), text: w.sb.jvFotoKette.text(), pruefe: w.sb.jvFotoKette.pruefe() };   // vor messeFoto: Zustand direkt nach dem Laden
    m.foto = await messeFoto(w);
    const w2 = welt();
    m.speak = await messeSpeak(w2);
    const w3 = welt();
    m.befehle = befehlsKette(w3);
    m.gewinner = await messeGewinner(w3);
    return m;
}

/* ---------- Hilfen für den Vergleich ---------- */
function unterschied(a, b) { return JS(a) === JS(b) ? 0 : 1; }
function anzahlAbweichungen(a, b) { const x = Array.isArray(a) ? a : [], y = Array.isArray(b) ? b : []; let n = Math.abs(x.length - y.length); for (let i = 0; i < Math.min(x.length, y.length); i++) if (x[i] !== y[i]) n++; return n; }

(async () => {
    const ist = await messeAlles();

    if (SCHREIBEN) {
        fs.writeFileSync(SOLL_DATEI, JSON.stringify(ist, null, 1) + '\n');
        console.log('Soll-Zustand geschrieben: ' + SOLL_DATEI);
    }
    const soll = JSON.parse(fs.readFileSync(SOLL_DATEI, 'utf8'));

    console.log('A. Ladeprotokoll und Ketten (heutiger Zustand eingefroren)');
    check('Keine Ladefehler beim Aufbau der Messwelt', ist.ladefehler.length === 0, ist.ladefehler.join('; '));
    check('Protokoll: wer welche Funktion ersetzt/umhüllt, in genau dieser Reihenfolge (' + soll.protokoll.length + ' Einträge)', JS(ist.protokoll) === JS(soll.protokoll),
        'erste Abweichung: ' + (ist.protokoll.find((x, i) => x !== soll.protokoll[i]) || '(Länge)'));
    const fuer = n => ist.protokoll.filter(x => x.endsWith(' -> ' + n)).map(x => x.split(' ')[0]);
    const kette = n => fuer(n).join(' > ');
    /* A2. Foto-Kette: explizit. Die Soll-Reihenfolge unten (außen -> innen) ist die HEUTIGE (vor Phase 3 gemessene) Reihenfolge der Ladung, umgedreht: zuletzt geladen = außen. */
    const kt = ist.fotoKette;
    const AUSSEN_INNEN = ['foto_rezept', 'foto_person', 'wunschliste', 'foto_urlaubsplan', 'foto_essensplan', 'foto_stundenplan', 'foto_abtippen', 'foto_brief', 'foto_adresse'];
    const namen = f => kt.liste[f].map(e => e.name).join(' > ');
    check('Foto-Kette parsePhotoRequest (außen -> innen): ' + AUSSEN_INNEN.join(' > '), namen('parsePhotoRequest') === AUSSEN_INNEN.join(' > '), namen('parsePhotoRequest'));
    check('Foto-Kette processPhoto hat dieselbe Reihenfolge', namen('processPhoto') === namen('parsePhotoRequest'), namen('processPhoto'));
    check('Foto-Kette handlePhotoCommand hat dieselbe Reihenfolge', namen('handlePhotoCommand') === namen('parsePhotoRequest'), namen('handlePhotoCommand'));
    check('Foto-Kette parseFollowupTask: wie parsePhotoRequest, nur ohne foto_person', namen('parseFollowupTask') === AUSSEN_INNEN.filter(x => x !== 'foto_person').join(' > '), namen('parseFollowupTask'));
    check('Foto-Kette photoAskWhatToDo: rezept > erkennen > wunschliste > urlaubsplan > essensplan > stundenplan > abtippen > brief > adresse (foto_person hat keine Auswahlkarten)',
        namen('photoAskWhatToDo') === 'foto_rezept > foto_erkennen > wunschliste > foto_urlaubsplan > foto_essensplan > foto_stundenplan > foto_abtippen > foto_brief > foto_adresse', namen('photoAskWhatToDo'));
    check('Foto-Kette confirmPhotoPending: foto_brief > foto_adresse', namen('confirmPhotoPending') === 'foto_brief > foto_adresse', namen('confirmPhotoPending'));
    check('showActionCards-Kette (dauerhaft): fotosenden (ganz außen) > lagebild > places.js; die vorübergehenden Eingriffe der Plan-Dateien gehören nicht dazu', namen('showActionCards') === 'fotosenden > lagebild', namen('showActionCards'));
    check('Aktive Foto-Kette (Namen + Ränge, alle 7 Funktionen) wie eingefroren', JS(kt.liste) === JS(soll.fotoKette.liste), JS(kt.liste).slice(0, 200));
    check('Aktive Foto-Kette als Text wie eingefroren', kt.text === soll.fotoKette.text, kt.text);
    check('Foto-Kette: pruefe() meldet "vollständig" (nichts fehlt, nichts Unerwartetes, kein Rang falsch, keine Anmeldefehler)', kt.pruefe.vollstaendig === true, JS(kt.pruefe));
    check('Foto-Kette: pruefe() ohne Fehlermeldungen', kt.pruefe.fehler.length === 0, kt.pruefe.fehler.join(' | '));
    check('Foto-Kette: jede Funktion hat nur eindeutige Namen und streng aufsteigende, gültige Ränge', Object.keys(kt.liste).every(f => {
        const l = kt.liste[f]; return new Set(l.map(e => e.name)).size === l.length && l.every((e, i) => typeof e.name === 'string' && e.name && Number.isFinite(e.rang) && (i === 0 || l[i - 1].rang < e.rang));
    }), JS(kt.liste).slice(0, 200));
    check('Foto-Kette: genau diese 7 Funktionen, runLastPhotoTask gehört ausdrücklich NICHT dazu', JS(Object.keys(kt.liste).sort()) === JS(['parsePhotoRequest', 'processPhoto', 'handlePhotoCommand', 'parseFollowupTask', 'showActionCards', 'photoAskWhatToDo', 'confirmPhotoPending'].sort()) && !('runLastPhotoTask' in kt.liste), Object.keys(kt.liste).join(','));

    check('speak-Kette (innen nach außen): voice > voicefix > sprueche > toene > fish > kontext_lokal > teilen', kette('speak') === 'voice.js > voicefix.js > sprueche.js > toene.js > fish.js > kontext_lokal.js > teilen.js', kette('speak'));
    check('handleLocalCommand (innen nach außen): localcommands > commands (Verteiler) > mailpush > worldqueryfix > Inline-Skript in index.html > ortsuche (ortsuche ganz außen)',
        kette('handleLocalCommand') === 'localcommands.js > commands.js > mailpush.js > worldqueryfix.js > index.html(inline) > ortsuche.js', kette('handleLocalCommand'));
    check('Außen-Wrapper um den Verteiler: genau 3 Dateien + das Inline-Skript (erweiterungen.js nimmt zur Laufzeit den jvCommands-Weg, sein Wrapper-Zweig bleibt unbenutzt)',
        fuer('handleLocalCommand').filter(f => !/^(localcommands|commands)\.js$/.test(f)).length === 4 && fuer('handleLocalCommand').indexOf('erweiterungen.js') < 0);
    check('Reihenfolge der Skripte in index.html: places < foto_kette < lagebild und foto_kette < photo < alle Foto-Dateien (die Kette steht vor allen, die sich bei ihr anmelden)',
        (() => { const r = starte({ festerZufall: true }).reihenfolge; const p = n => r.indexOf(n); return p('places.js') >= 0 && p('places.js') < p('foto_kette.js') && p('foto_kette.js') < p('lagebild.js') && p('foto_kette.js') < p('photo.js') && ['foto_adresse', 'foto_brief', 'foto_abtippen', 'foto_stundenplan', 'foto_essensplan', 'foto_urlaubsplan', 'wunschliste', 'foto_person', 'foto_erkennen', 'foto_rezept', 'fotosenden'].every(n => p('photo.js') < p(n + '.js')); })());
    check('Reihenfolge der Skripte in index.html: native_speech < commands < photo < foto_rezept < sprueche < teilen < fotosenden',
        (() => { const r = starte({ festerZufall: true }).reihenfolge; const p = n => r.indexOf(n); return p('native_speech.js') < p('commands.js') && p('commands.js') < p('photo.js') && p('photo.js') < p('foto_rezept.js') && p('foto_rezept.js') < p('sprueche.js') && p('sprueche.js') < p('teilen.js') && p('teilen.js') < p('fotosenden.js'); })());

    console.log('A3. Fehlerfälle der Foto-Kette: doppelte und ungültige Anmeldungen werden erkannt und NICHT eingebaut');
    {
        const w = welt(), K = w.sb.jvFotoKette, nop = innen => innen;
        const vor = JS(K.liste()), vorFn = w.sb.parsePhotoRequest;
        const faelle = [
            ['doppelter Name (foto_adresse nochmal, anderer Rang)', () => K.anmelden('parsePhotoRequest', 'foto_adresse', 101, nop)],
            ['Rang schon von einer anderen Erweiterung belegt', () => K.anmelden('parsePhotoRequest', 'zusatz', 100, nop)],
            ['Rang ist Text statt Zahl', () => K.anmelden('parsePhotoRequest', 'zusatz', '5', nop)],
            ['Rang ist NaN', () => K.anmelden('parsePhotoRequest', 'zusatz', NaN, nop)],
            ['Name fehlt', () => K.anmelden('parsePhotoRequest', '', 5, nop)],
            ['unbekannte Funktion', () => K.anmelden('speak', 'zusatz', 5, nop)],
            ['runLastPhotoTask gehört nicht zur Kette', () => K.anmelden('runLastPhotoTask', 'zusatz', 5, nop)],
            ['fabrik ist keine Funktion', () => K.anmelden('parsePhotoRequest', 'zusatz', 5, 'x')],
            ['fabrik wirft einen Fehler', () => K.anmelden('parsePhotoRequest', 'zusatz', 5, () => { throw new Error('kaputt'); })],
            ['fabrik liefert keine Funktion', () => K.anmelden('parsePhotoRequest', 'zusatz', 5, () => 42)]
        ];
        let n = 0;
        for (const [name, tu] of faelle) {
            const r = tu(); n++;
            const p = K.pruefe();
            check('Ungültige Anmeldung abgelehnt: ' + name, r === false);
            check('  ... nichts eingebaut (Liste und window-Funktion unverändert): ' + name, JS(K.liste()) === vor && w.sb.parsePhotoRequest === vorFn);
            check('  ... Fehler gemeldet (' + n + ' bisher), pruefe() nicht mehr vollständig: ' + name, p.fehler.length === n && p.vollstaendig === false, JS(p.fehler));
        }
        const w2 = welt(), K2 = w2.sb.jvFotoKette, fremd = function () { return null; };
        w2.sb.parsePhotoRequest = fremd;
        check('Von außen ersetzte window.parsePhotoRequest (alte Art zu umhüllen) wird erkannt: Anmeldung abgelehnt', K2.anmelden('parsePhotoRequest', 'zusatz', 5, nop) === false && w2.sb.parsePhotoRequest === fremd && K2.pruefe().vollstaendig === false);
        const w3 = welt(), K3 = w3.sb.jvFotoKette;
        check('Gültige, aber unerwartete Zusatz-Erweiterung wird eingebaut, steht außen, und pruefe() meldet sie als unerwartet', K3.anmelden('parsePhotoRequest', 'zusatz', 5, nop) === true && K3.liste().parsePhotoRequest[0].name === 'zusatz' && K3.pruefe().unerwartet.indexOf('parsePhotoRequest/zusatz') >= 0 && K3.pruefe().vollstaendig === false);
        const w4 = welt(), K4 = w4.sb.jvFotoKette;
        K4.anmelden('parsePhotoRequest', 'zusatz', 150, innen => function (t) { return String(t) === 'zz test' ? { task: 'zz' } : innen.apply(this, arguments); });
        check('Eine Erweiterung mit höherem Rang (weiter innen) wird nach den bisherigen erreicht und gibt weiter', JS(w4.sb.parsePhotoRequest('zz test')) === JS({ task: 'zz' }) && JS(w4.sb.parsePhotoRequest('navigier dorthin')) === JS(w.sb.parsePhotoRequest('navigier dorthin')));
    }

    console.log('B. Wirkung der Ketten (Foto, speak, Befehle)');
    for (const k of ['parse', 'folge', 'befehl', 'auswertung', 'kartenKette', 'fragenOhneFoto', 'fragenMitFoto', 'folgeaktion', 'bestaetigen', 'kartenKetteLang']) {
        const abw = anzahlAbweichungen(ist.foto[k], soll.foto[k]);
        check('Foto-Wirkung "' + k + '": ' + (soll.foto[k] || []).length + ' Proben wie eingefroren', abw === 0, abw + ' Abweichung(en), z. B. ' + (ist.foto[k].find((x, i) => x !== soll.foto[k][i]) || '').slice(0, 160));
    }
    check('speak-Kette: Wirkung der Proben wie eingefroren (' + soll.speak.kette.length + ' Texte)', anzahlAbweichungen(ist.speak.kette, soll.speak.kette) === 0, (ist.speak.kette.find((x, i) => x !== soll.speak.kette[i]) || ''));
    check('speak-Kette: Wiederholung desselben Textes wie eingefroren', JS(ist.speak.wiederholung) === JS(soll.speak.wiederholung));
    check('speak-Kette: teilen merkt die letzte lange Antwort wie eingefroren', ist.speak.teilenLetzte === soll.speak.teilenLetzte, ist.speak.teilenLetzte);
    check('mehrfach.js: window.speak wird nach dem Fang exakt wieder hergestellt', ist.speak.mehrfach.speakDanachGleich === true);
    check('mehrfach.js: Fang und Ausgabe wie eingefroren', JS(ist.speak.mehrfach) === JS(soll.speak.mehrfach), JS(ist.speak.mehrfach).slice(0, 200));
    check('jvCommands: Rangliste (' + soll.befehle.liste.length + ' Einträge, Rang + Name in Reihenfolge) wie eingefroren', JS(ist.befehle.liste) === JS(soll.befehle.liste),
        'erste Abweichung: ' + (ist.befehle.liste.find((x, i) => x !== soll.befehle.liste[i]) || '(Länge)'));
    check('jvCommands: alle Gleichrang-Gruppen (' + soll.befehle.gleichrang.length + ') mit Registrierungs-Reihenfolge wie eingefroren', JS(ist.befehle.gleichrang) === JS(soll.befehle.gleichrang),
        ist.befehle.gleichrang.filter(x => soll.befehle.gleichrang.indexOf(x) < 0).join(' | '));
    check('jvCommands: Gewinner für ' + soll.gewinner.length + ' Sätze wie eingefroren', anzahlAbweichungen(ist.gewinner, soll.gewinner) === 0, (ist.gewinner.find((x, i) => x !== soll.gewinner[i]) || ''));
    check('Satzkorpus nicht leer (' + SAETZE.length + ' Sätze)', SAETZE.length >= 60);

    console.log('C. Gegenproben (künstlich vertauschte Reihenfolge muss erkannt werden)');
    async function gegenprobe(name, extra, erwarte) {
        const w = welt(extra);
        const m = { protokoll: w.prot.slice() };
        const abweichungen = [];
        if (JS(m.protokoll) !== JS(soll.protokoll)) abweichungen.push('Protokoll');
        if (erwarte.foto) { m.foto = await messeFoto(w); if (['parse', 'folge', 'befehl', 'auswertung'].some(k => anzahlAbweichungen(m.foto[k], soll.foto[k]) > 0)) abweichungen.push('Foto-Wirkung'); }
        if (erwarte.speak) { m.speak = await messeSpeak(welt(extra)); if (anzahlAbweichungen(m.speak.kette, soll.speak.kette) + anzahlAbweichungen(m.speak.wiederholung, soll.speak.wiederholung) + unterschied(m.speak.mehrfach, soll.speak.mehrfach) > 0) abweichungen.push('speak-Wirkung'); }
        if (erwarte.befehle) { m.befehle = befehlsKette(welt(extra)); if (JS(m.befehle) !== JS(soll.befehle)) abweichungen.push('Befehls-Reihenfolge'); }
        check('Gegenprobe "' + name + '": wird erkannt (Test würde rot) durch: ' + (abweichungen.join(' + ') || 'NICHTS'), abweichungen.length > 0);
        for (const k of erwarte.mussAbweichen || []) check('Gegenprobe "' + name + '": ' + k + ' muss abweichen', abweichungen.indexOf(k) >= 0, abweichungen.join(','));
        console.log('  · ' + name + ' → erkannt durch: ' + abweichungen.join(' + '));
    }
    /* Foto: seit Phase 3 bestimmt NICHT mehr die Ladereihenfolge, wer außen greift. Andere Ladereihenfolge muss deshalb die aktive Kette UND die gesamte Wirkung
       (Karteninhalt, Kartenreihenfolge, erkannte Aufgabe, Folgeaktion, Befehle, Bestätigen, Sende-Karte) unverändert lassen. */
    const FOTO_DATEIEN = ['foto_adresse.js', 'foto_brief.js', 'foto_abtippen.js', 'foto_stundenplan.js', 'foto_essensplan.js', 'foto_urlaubsplan.js', 'wunschliste.js', 'foto_person.js', 'foto_erkennen.js', 'foto_rezept.js'];
    const FOTO_MESSUNGEN = ['parse', 'folge', 'befehl', 'auswertung', 'kartenKette', 'fragenOhneFoto', 'fragenMitFoto', 'folgeaktion', 'bestaetigen', 'kartenKetteLang'];
    const neuOrdnen = (namen, ordnung) => l => { const pos = namen.map(n => l.indexOf(n)).sort((a, b) => a - b); ordnung.forEach((n, i) => { l[pos[i]] = n; }); return l; };
    function mischen(liste, saat) { const l = liste.slice(); let z = saat; for (let i = l.length - 1; i > 0; i--) { z = (z * 1103515245 + 12345) % 2147483648; const j = z % (i + 1); const t = l[i]; l[i] = l[j]; l[j] = t; } return l; }
    async function gleichprobe(name, extra) {
        const w = welt(extra);
        const k = w.sb.jvFotoKette, p = k.pruefe();
        const m = await messeFoto(w);
        const abw = FOTO_MESSUNGEN.filter(key => anzahlAbweichungen(m[key], soll.foto[key]) > 0);
        check('Gleichprobe "' + name + '": Ladefehler leer, Kette vollständig, keine Anmeldefehler', w.ladefehler.length === 0 && p.vollstaendig === true && p.fehler.length === 0, w.ladefehler.join('; ') + JS(p));
        check('Gleichprobe "' + name + '": aktive Foto-Kette (Namen + Ränge) identisch zum Soll', JS(k.liste()) === JS(soll.fotoKette.liste) && k.text() === soll.fotoKette.text);
        check('Gleichprobe "' + name + '": Wirkung identisch zum Golden Master (' + FOTO_MESSUNGEN.length + ' Messreihen: Erkennung, Folgeaufgabe, Befehle, Auswertung, Karteninhalt + -reihenfolge, Folgeaktion, Bestätigen)', abw.length === 0, abw.join(','));
        const ohneLage = x => x.filter(e => !/^(lagebild|fotosenden)\.js -> /.test(e));   // lagebild.js umhüllt auch executeAction (eigene Kette), sein Platz im Protokoll hängt an seiner Ladeposition
        check('Gleichprobe "' + name + '": Protokoll der übrigen Ketten (speak, Befehle, ...) unverändert', JS(ohneLage(w.prot)) === JS(ohneLage(soll.protokoll)));
        console.log('  · ' + name + ' → Kette und Wirkung identisch: ' + (abw.length === 0 && p.vollstaendig));
    }
    {
        const nachLadung = (a, b) => ({ skriptReihenfolge: tausche(a, b) });
        await gleichprobe('foto_abtippen und foto_essensplan vertauscht', nachLadung('foto_abtippen.js', 'foto_essensplan.js'));
        await gleichprobe('foto_stundenplan und foto_essensplan vertauscht (änderte früher die Kartenreihenfolge)', nachLadung('foto_stundenplan.js', 'foto_essensplan.js'));
        await gleichprobe('foto_abtippen und foto_rezept vertauscht (änderte früher den Karteninhalt)', nachLadung('foto_abtippen.js', 'foto_rezept.js'));
        await gleichprobe('foto_brief und foto_abtippen vertauscht', nachLadung('foto_brief.js', 'foto_abtippen.js'));
        await gleichprobe('foto_adresse und foto_rezept vertauscht', nachLadung('foto_adresse.js', 'foto_rezept.js'));
        await gleichprobe('wunschliste und foto_person vertauscht', nachLadung('wunschliste.js', 'foto_person.js'));
        await gleichprobe('foto_erkennen und foto_urlaubsplan vertauscht', nachLadung('foto_erkennen.js', 'foto_urlaubsplan.js'));
        await gleichprobe('fotosenden und lagebild vertauscht (showActionCards-Kette)', nachLadung('fotosenden.js', 'lagebild.js'));
        await gleichprobe('alle 10 Foto-Dateien in umgekehrter Reihenfolge', { skriptReihenfolge: neuOrdnen(FOTO_DATEIEN, FOTO_DATEIEN.slice().reverse()) });
        for (const saat of [1, 7, 42]) await gleichprobe('alle 10 Foto-Dateien gemischt (Saat ' + saat + ')', { skriptReihenfolge: neuOrdnen(FOTO_DATEIEN, mischen(FOTO_DATEIEN, saat)) });
        await gleichprobe('fotosenden und lagebild vor die anderen Foto-Dateien gemischt + Foto-Dateien umgekehrt', { skriptReihenfolge: l => neuOrdnen(FOTO_DATEIEN, FOTO_DATEIEN.slice().reverse())(tausche('fotosenden.js', 'lagebild.js')(l)) });
        /* Gegenprobe: ohne die Kette (photo.js vor die Foto-Dateien gestellt ist Pflicht): steht photo.js NACH einer Foto-Datei, gibt es die Basis noch nicht -> laut erkannt */
        const w = welt({ skriptReihenfolge: tausche('photo.js', 'foto_brief.js') });
        const p = w.sb.jvFotoKette.pruefe();
        check('Gegenprobe "photo.js und foto_brief vertauscht (Basis fehlt bei der Anmeldung)": die Kette ist NICHT vollständig und meldet es', p.vollstaendig === false && (p.fehlend.length > 0 || p.fehler.length > 0), JS(p).slice(0, 200));
        console.log('  · photo.js und foto_brief vertauscht (Basis nicht mehr innen) → erkannt durch: Kette unvollständig/Anmeldefehler');
    }
    await gegenprobe('speak: fish und teilen vertauscht (teilen sieht dann den bereinigten Text)', { skriptReihenfolge: tausche('fish.js', 'teilen.js') }, { speak: true, mussAbweichen: ['Protokoll', 'speak-Wirkung'] });
    await gegenprobe('speak: sprueche und fish vertauscht', { skriptReihenfolge: tausche('sprueche.js', 'fish.js') }, { speak: true, mussAbweichen: ['Protokoll'] });
    await gegenprobe('speak: teilen und kontext_lokal vertauscht', { skriptReihenfolge: tausche('teilen.js', 'kontext_lokal.js') }, { speak: true, mussAbweichen: ['Protokoll'] });
    await gegenprobe('speak: toene und sprueche vertauscht', { skriptReihenfolge: tausche('toene.js', 'sprueche.js') }, { speak: true, mussAbweichen: ['Protokoll'] });
    await gegenprobe('Befehle: mailpush und ortsuche vertauscht (Außen-Wrapper)', { skriptReihenfolge: tausche('mailpush.js', 'ortsuche.js') }, { befehle: true, mussAbweichen: ['Protokoll'] });
    await gegenprobe('Befehle: urlaub und mailaktionen vertauscht (Gleichrang 120)', { skriptReihenfolge: tausche('urlaub.js', 'mailaktionen.js') }, { befehle: true, mussAbweichen: ['Befehls-Reihenfolge'] });
    await gegenprobe('Befehle: einfuehrung und plan_ansagen vertauscht (Gleichrang 4)', { skriptReihenfolge: tausche('einfuehrung.js', 'plan_ansagen.js') }, { befehle: true, mussAbweichen: ['Befehls-Reihenfolge'] });

    /* Gegenprobe mehrfach.js: wird der Rückbau des temporären Fangs im Speicher entfernt, erkennt der Test den Fehler */
    {
        const w = welt({ quelleAendern: (f, q) => f === 'mehrfach.js' ? q.replace('finally { window.speak = orig; }', 'finally { }') : q });
        const m = await messeSpeak(w);
        check('Gegenprobe "mehrfach.js ohne Rückbau des Fangs": der Test erkennt, dass window.speak nicht wiederhergestellt wird', m.mehrfach.speakDanachGleich === false);
        check('Gegenprobe "mehrfach.js": die Quell-Ersetzung hat wirklich gegriffen', lies('js/mehrfach.js').indexOf('finally { window.speak = orig; }') >= 0);
    }

    console.log('D. native_speech.js lädt vor commands.js (Warte-/Wiederholungsweg)');
    {
        const stand = {};
        const w = starte({
            festerZufall: true, native: true, sekundenTakt: true, weitereTakte: [250],
            nachSkript: (f, sb) => { if (f === 'native_speech.js') stand.commandsBeimLaden = typeof sb.jvCommands; }
        });
        const r = w.reihenfolge;
        check('native_speech.js steht in index.html VOR commands.js (Position ' + r.indexOf('native_speech.js') + ' < ' + r.indexOf('commands.js') + ')', r.indexOf('native_speech.js') < r.indexOf('commands.js'));
        check('Beim Laden von native_speech.js gibt es jvCommands noch nicht', stand.commandsBeimLaden === 'undefined', stand.commandsBeimLaden);
        const vor = w.sb.jvCommands.list().some(x => / lauschen_aus$/.test(x));
        check('Direkt nach dem Laden ist "lauschen_aus" noch NICHT registriert (der erste Versuch ging ins Leere)', vor === false);
        await w.vorspulen(300);
        const nach = w.sb.jvCommands.list().filter(x => / lauschen_aus$/.test(x));
        check('Nach dem ersten 250-ms-Wiederholungsversuch ist "lauschen_aus" genau einmal registriert (der Warteweg wird gebraucht)', nach.length === 1, nach.join(','));
        await w.vorspulen(60000);
        check('Weitere Wiederholungen registrieren nichts doppelt', w.sb.jvCommands.list().filter(x => / lauschen_aus$/.test(x)).length === 1);
        const ohne = starte({ festerZufall: true, native: true, sekundenTakt: true, weitereTakte: [250], ohneSkripte: ['commands.js'] });
        await ohne.vorspulen(30000);
        check('Gibt es nie jvCommands, bleibt es still: keine Registrierung, kein Fehler (der Warteweg gibt nach 40 Versuchen leise auf)', ohne.sb.jvCommands === undefined);
        const gegen = starte({ festerZufall: true, native: true, skriptReihenfolge: l => { l.splice(l.indexOf('native_speech.js'), 1); l.splice(l.indexOf('commands.js') + 1, 0, 'native_speech.js'); return l; } });
        check('Gegenprobe: lädt native_speech.js NACH commands.js, ist "lauschen_aus" sofort da (kein Warteweg nötig) – der Sonderfall ist also reihenfolgeabhängig und messbar',
            gegen.sb.jvCommands.list().some(x => / lauschen_aus$/.test(x)));
    }

    console.log('REIHENFOLGE: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH: ' + (e && e.stack || e)); process.exit(2); });
