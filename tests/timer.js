/* ============================================================
   TIMER-REGISTER-TEST. Start: node tests/timer.js
   Macht dauerhafte Hintergrundarbeit sichtbar, ohne etwas zu verbieten. Ändert keinen Timer und keine Produktdatei.
   Erfasst werden setInterval und setTimeout-Selbstaufrufer (tests/timer_scan.js). Einmalige setTimeout-Verzögerungen sind absichtlich nicht erfasst.
   Wer einen neuen dauerhaften Timer/Poller baut oder einen Takt ändert, bekommt hier einen roten Test mit dem Hinweis, den Eintrag in
   tests/timer_inventar.js zu ergänzen. Das ist gewollt: die Änderung wird dadurch bewusst gesehen.
   ============================================================ */
'use strict';
const sc = require('./timer_scan.js');
const inventar = require('./timer_inventar.js');
let ok = 0, fehler = 0;
function check(name, c, info) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }

function schluessel(funde) {   // id = Datei#laufende Nummer; Vergleichswert = Art + Takt-Ausdruck
    const z = {}, m = {};
    for (const x of funde) { z[x.datei] = (z[x.datei] || 0) + 1; m[x.datei + '#' + z[x.datei]] = x.art + ' | ' + x.ausdruck.replace(/\s+/g, ' ').slice(0, 60); }
    return m;
}
function vergleiche(funde, reg) {
    const ist = schluessel(funde), soll = {}; reg.forEach(e => { soll[e.id] = e.art + ' | ' + e.ausdruck; });
    const neu = Object.keys(ist).filter(k => !(k in soll)), weg = Object.keys(soll).filter(k => !(k in ist)), anders = Object.keys(ist).filter(k => k in soll && ist[k] !== soll[k]);
    return { neu, weg, anders, ok: !neu.length && !weg.length && !anders.length, ist };
}

const funde = sc.scanneAlle();
const dateien = sc.alleDateien();

console.log('A. Register gegen den echten Code');
const v = vergleiche(funde, inventar);
check('Keine neue dauerhafte Hintergrundarbeit ohne Eintrag in tests/timer_inventar.js', v.neu.length === 0, 'NEU: ' + v.neu.map(k => k + ' (' + v.ist[k] + ')').join('; '));
check('Kein Eintrag im Register ohne Entsprechung im Code', v.weg.length === 0, 'FEHLT IM CODE: ' + v.weg.join('; '));
check('Kein Takt/keine Art geändert', v.anders.length === 0, 'GEÄNDERT: ' + v.anders.map(k => k + ' → ' + v.ist[k]).join('; '));
check('Jede Registereintrags-id ist eindeutig', new Set(inventar.map(e => e.id)).size === inventar.length);
const KL = ['dauerlauf', 'bedingt', 'warte-poller', 'planer', 'animation'], JNM = ['ja', 'nein', 'möglich'];
inventar.forEach(e => {
    check('Eintrag ' + e.id + ' vollständig und gültig', e.datei && e.zweck && e.zweck.length > 8 && KL.indexOf(e.klasse) >= 0 && JNM.indexOf(e.netz) >= 0 && JNM.indexOf(e.native) >= 0 && JNM.indexOf(e.ui) >= 0 && ['intervall', 'selbstansetzend'].indexOf(e.art) >= 0);
    check('Eintrag ' + e.id + ': Datei existiert', dateien.indexOf(e.datei) >= 0);
});
{   // Vollständigkeit des Scanners: jedes setInterval( im bereinigten Text wurde als Fund erfasst
    let roh = 0; for (const d of dateien) { const m = sc.maskiere(require('fs').readFileSync(require('path').join(sc.ROOT, 'js', d), 'utf8')); roh += (m.match(/\bsetInterval\s*\(/g) || []).length; }
    check('Scanner-Vollständigkeit: alle ' + roh + ' setInterval-Aufrufe sind erfasst', roh === funde.filter(x => x.art === 'intervall').length, roh + ' im Text, ' + funde.filter(x => x.art === 'intervall').length + ' erfasst');
}

console.log('B. Warte-Poller sind wirklich Warte-Poller');
const nach = {}; { const z = {}; funde.forEach(x => { z[x.datei] = (z[x.datei] || 0) + 1; nach[x.datei + '#' + z[x.datei]] = x; }); }
inventar.filter(e => e.klasse === 'warte-poller' && e.art === 'intervall').forEach(e => {
    const f = nach[e.id];
    const gesamt = require('fs').readFileSync(require('path').join(sc.ROOT, 'js', e.datei), 'utf8');
    check('Warte-Poller ' + e.id + ' beendet sich selbst (clearInterval im Aufruf oder in derselben Datei, dazu Versuchsgrenze oder Bedingung)', f && (/clearInterval/.test(f.text) || /clearInterval/.test(gesamt)) && (/\+\+\w+\s*>\s*\d+/.test(f.text) || /\b(?:if|while)\b/.test(f.text)));
});
inventar.filter(e => e.klasse === 'warte-poller' && e.art === 'selbstansetzend').forEach(e => {
    const f = nach[e.id];
    check('Warte-Poller ' + e.id + ' (Selbstaufruf) hat eine Abbruch-/Erfolgsbedingung im Körper', f && /\b(?:if|return|while)\b/.test(f.text));
});

console.log('C. Einordnung nach Takt (nur Ausgabe und Eckwerte)');
const idOf = (() => { const z = {}; return x => { z[x.datei] = (z[x.datei] || 0) + 1; return x.datei + '#' + z[x.datei]; }; })();
const reg = {}; inventar.forEach(e => { reg[e.id] = e; });
const zeilen = funde.map(x => { const e = reg[idOf(x)]; return Object.assign({}, x, { e }); });
const mark = {
    'unter 1 s': zeilen.filter(x => x.ms != null && x.ms < 1000),
    'unter 10 s': zeilen.filter(x => x.ms != null && x.ms < 10000),
    'höchstens 1 min': zeilen.filter(x => x.ms != null && x.ms <= 60000),
    'Takt nicht als Zahl lesbar (dynamisch)': zeilen.filter(x => x.ms == null),
    'Netzwerk-Poller (ja/möglich)': zeilen.filter(x => x.e && x.e.netz !== 'nein' && x.e.klasse !== 'animation'),
    'Netzwerk sicher (ja)': zeilen.filter(x => x.e && x.e.netz === 'ja' && x.e.klasse !== 'animation'),
    'Native-Poller (ja/möglich)': zeilen.filter(x => x.e && x.e.native !== 'nein'),
    'reine Init-/Warte-Poller': zeilen.filter(x => x.e && x.e.klasse === 'warte-poller'),
    'dauerhaft (dauerlauf)': zeilen.filter(x => x.e && x.e.klasse === 'dauerlauf'),
    'bedingt': zeilen.filter(x => x.e && x.e.klasse === 'bedingt'),
    'Planer (setzen sich selbst an)': zeilen.filter(x => x.e && x.e.klasse === 'planer'),
    'Animationen': zeilen.filter(x => x.e && x.e.klasse === 'animation')
};
console.log('  Gesamt: ' + funde.length + ' Konstrukte in ' + new Set(funde.map(x => x.datei)).size + ' Dateien (' + funde.filter(x => x.art === 'intervall').length + ' setInterval, ' + funde.filter(x => x.art === 'selbstansetzend').length + ' selbstansetzende setTimeout)');
for (const k of Object.keys(mark)) console.log('  ' + k + ': ' + mark[k].length);
console.log('  Dauerläufer unter 1 s: ' + mark['unter 1 s'].filter(x => x.e && x.e.klasse === 'dauerlauf').map(x => x.datei + ' ' + x.ms + ' ms').join(', '));
check('Jede Takt-Kategorie ist belegt (Einordnung funktioniert)', mark['unter 1 s'].length > 0 && mark['höchstens 1 min'].length > mark['unter 10 s'].length && mark['reine Init-/Warte-Poller'].length > 20);
check('Alle bekannten Warte-Poller (Phase-1-Befund: mindestens 25 Konstrukte) sind als solche markiert', mark['reine Init-/Warte-Poller'].length >= 25, String(mark['reine Init-/Warte-Poller'].length));
const BEKANNT_UNTER_1S = ['anzeige.js 300', 'anzeige.js 400', 'native_speech.js 300', 'ruhe.js 400', 'synapsen.js 200', 'uebersicht.js 250'];
check('Dauerläufer unter 1 s sind genau die sechs bekannten (ein neuer fällt hier gezielt auf)', JSON.stringify(mark['unter 1 s'].filter(x => x.e && x.e.klasse === 'dauerlauf').map(x => x.datei + ' ' + x.ms).sort()) === JSON.stringify(BEKANNT_UNTER_1S), mark['unter 1 s'].filter(x => x.e && x.e.klasse === 'dauerlauf').map(x => x.datei + ' ' + x.ms).join(', '));

console.log('D. Gegenproben (der Test muss neue Hintergrundarbeit erkennen, aber nicht jede Verzögerung)');
{
    const dat = 'calendar.js';
    const orig = require('fs').readFileSync(require('path').join(sc.ROOT, 'js', dat), 'utf8');
    const ersetze = (q) => funde.filter(x => x.datei !== dat).concat(sc.scanne(dat, q));
    // 1) neuer setInterval
    const f1 = ersetze(orig + '\nsetInterval(function () { fetch("/x"); }, 2000);\n');
    const v1 = vergleiche(f1, inventar);
    check('Gegenprobe: ein neuer setInterval wird erkannt', !v1.ok && v1.neu.length === 1, JSON.stringify(v1.neu));
    // 2) geänderter Takt
    const q2 = orig.replace('}, 30000)', '}, 500)');
    check('Gegenprobe: (die Ersetzung hat gegriffen)', q2 !== orig);
    const v2 = vergleiche(ersetze(q2), inventar);
    check('Gegenprobe: ein geänderter Takt (30000 → 500) wird erkannt', !v2.ok && v2.anders.length === 1, JSON.stringify(v2.anders));
    // 3) neuer selbstansetzender Poller
    const f3 = ersetze(orig + '\nfunction pollEwig() { fetch("/y"); setTimeout(pollEwig, 1000); }\npollEwig();\n');
    const v3 = vergleiche(f3, inventar);
    check('Gegenprobe: ein neuer selbstansetzender setTimeout-Poller wird erkannt', !v3.ok && v3.neu.length === 1, JSON.stringify(v3.neu));
    // 3b) Selbstaufruf über benannte Funktionsform
    const f3b = ersetze(orig + '\n(function schleife() { tu(); setTimeout(function () { schleife(); }, 700); })();\n');
    check('Gegenprobe: Selbstaufruf mit Rückruf-Funktion wird erkannt', !vergleiche(f3b, inventar).ok);
    // 4) einmalige Verzögerungen bleiben erlaubt
    const f4 = ersetze(orig + '\nsetTimeout(function () { eineSache(); }, 800);\nsetTimeout(() => zwei(), 50);\nfunction einmal() { setTimeout(fertig, 300); }\n');
    check('Gegenprobe: neue EINMALIGE setTimeout-Verzögerungen sind erlaubt (kein Pauschalverbot)', vergleiche(f4, inventar).ok);
    // 5) Kommentare, Strings, Regex sind keine Timer
    const f5 = ersetze(orig + '\n// setInterval(x, 10)\n/* setInterval(y, 20) */\nconst s1 = "setInterval(z, 30)";\nconst r1 = /setInterval\\(a, 1\\)/;\nconst t1 = `setInterval(b, 2)`;\n');
    check('Gegenprobe: setInterval in Kommentar/Text/Regex zählt nicht', vergleiche(f5, inventar).ok);
    // 6) Eintrag aus dem Register entfernt
    const kurz = inventar.filter(e => e.id !== 'calendar.js#2');
    check('Gegenprobe: fehlt ein Registereintrag, wird der Code-Timer als NEU erkannt', vergleiche(funde, kurz).neu.join() === 'calendar.js#2');
    // 7) Eintrag ohne Code
    const extra = inventar.concat([{ id: 'calendar.js#9', datei: 'calendar.js', art: 'intervall', ausdruck: '1' }]);
    check('Gegenprobe: ein Registereintrag ohne Code wird erkannt', vergleiche(funde, extra).weg.join() === 'calendar.js#9');
}

console.log('TIMER: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
