/* Erzeugt die Tabellen für tests/hintergrund-analyse.md aus Statik (hintergrund_analyse.js), Register (timer_inventar.js) und Messstand
   (hintergrund_laufzeit.json). Start: node tests/hintergrund_doku.js > tests/hintergrund-tabelle.md   (rein lesend) */
'use strict';
const an = require('./hintergrund_analyse.js'), aw = require('./hintergrund_auswertung.js'), inventar = require('./timer_inventar.js');
const lauf = aw.laden(), LZ = lauf ? aw.auswerten(lauf) : null;

/* Kategorie A (kritisch) NUR mit Codebeleg; B funktional; C Oberfläche/Animation; D Polling/Netzwerk; E Retry/Warten; F verdächtig/unklar */
const A_BELEG = {
    'calendar.js#1': 'löst fällige Erinnerungen aus (Benachrichtigung/Sprache), jede Sekunde',
    'native_speech.js#1': 'meldet der Handy-App alle 0,3 s, ob Jarvis spricht/zuhört/rechnet (setBusy)',
    'voice.js#2': 'startet das Weckwort-Hören neu (Wake-Kette)',
    'voice.js#3': 'Selbstheilung des Weckwort-Modus alle 20 s',
    'auftraege.js#2': 'holt Aufträge für die Android-App (abholen, 60 s)',
    'wachter.js#1': 'Wächter: Abfahrt, Termin gleich, Regen (Kopfkommentar wachter.js)',
    'pushsync.js#1': 'Lebenszeichen alle 2 min: verhindert doppelte/fehlende Server-Benachrichtigung (pushsync.js Kopf)',
    'pushsync.js#2': 'gleicht Erinnerungen mit dem Server ab, damit er bei geschlossener App benachrichtigen kann',
    'plan_ansagen.js#2': 'schickt die geplanten Ansagen (Aufbruch, Wecker) alle 10 min an die Android-App'
};
const F_GRUND = {
    'gedaechtnis_zeit.js#1': 'ensureProxy alle 3 s: Zweck (Schutz gegen Überschreiben von memoryItems?) und Stopbedingung nicht belegt',
    'kacheln.js#2': 'Wetter-Kachel alle 60 s ohne Stop; nur sinnvoll, solange die Kachel sichtbar ist (nicht belegt, ob geprüft)',
    'blick.js#1': '15 s Intervall in aufbauen ohne gespeicherte Kennung'
};
/* Phase 6B.1: anzeige.js#1 (400 ms) war in 6A "F" (Zweck unklar); beim Lesen geklärt: blendet den Schließen-Knopf ein/aus, rein Darstellung → C */
const UI = new Set(['mimik.js#1', 'holo_look.js#1', 'synapsen.js#1', 'anzeige.js#1', 'anzeige.js#2', 'laune.js#2', 'laune.js#4', 'wetterfx.js#1', 'ui.js#1', 'ui.js#2', 'ui.js#3', 'ui.js#4', 'panels.js#1']);
function kategorie(a) {
    if (A_BELEG[a.id]) return 'A';
    if (F_GRUND[a.id]) return 'F';
    if (a.klasse === 'warte-poller') return 'E';
    if (a.klasse === 'animation' || UI.has(a.id)) return 'C';
    const e = inventar.find(x => x.id === a.id);
    if (e && e.netz === 'ja') return 'D';
    if (a.netz && a.klasse !== 'bedingt') return 'D';
    return 'B';
}
const frequenz = ms => ms == null ? 'dynamisch' : ms < 1000 ? ms + ' ms' : ms < 60000 ? (ms / 1000) + ' s' : ms < 3600000 ? (ms / 60000) + ' min' : (ms / 3600000) + ' h';
const risiko = k => k === 'A' ? 'ROT' : (k === 'B' || k === 'D' || k === 'F') ? 'GELB' : 'GRÜN';

const alle = an.analysiere();
const rt = {};   // Laufzeit je Stelle: sichtbar/versteckt
if (LZ) { for (const [s, v] of Object.entries(LZ.versteckt)) rt[s.replace(/·[tr]$/, '')] = v; }
function hid(a) {
    const k = a.datei + ':' + a.zeile, r = rt[k];
    if (r) return r.verhalten;
    return 'Wächter ' + a.guard.replace(/ \(.*/, '') + ' (nicht gemessen)';
}
const io = a => [a.netz || a.netzInventar === 'ja' ? 'N' : (a.netzInventar === 'möglich' ? 'n?' : ''), a.nativ || a.nativInventar === 'ja' ? 'A' : '', a.speicher ? 'S' : '', a.oberflaeche ? 'D' : '', a.sprache ? 'V' : '', a.benachrichtigung ? 'B' : ''].filter(Boolean).join(' ');
const startTxt = a => a.anfang + (a.art === 'selbstansetzend' ? ' (' + a.start.replace('selbst:', 'Schleife ') + ')' : /^(funktion|ereignis|rueckruf)/.test(a.start) ? ' (' + a.start.replace('funktion:', 'in ').replace('ereignis:', 'bei ').replace('rueckruf:', 'in Rückruf ') + ')' : '');
const stopTxt = a => a.stop.replace('Bedingung im Körper (setzt sich nur bei Bedarf neu an)', 'Bedingung im Körper').replace('nie gestoppt (Kennung nicht gespeichert)', 'nie gestoppt');

console.log('| Prozess | Datei:Zeile | Frequenz | Start | Stop | hidden | I/O | Kat | Risiko |\n|---|---|---|---|---|---|---|---|---|');
for (const a of alle) {
    const k = kategorie(a);
    console.log('| ' + a.id + (a.funktion ? ' (' + a.funktion + ')' : '') + ' | ' + a.datei + ':' + a.zeile + ' | ' + frequenz(a.ms) + ' | ' + startTxt(a) + ' | ' + stopTxt(a) + ' | ' + hid(a) + ' | ' + io(a) + ' | ' + k + ' | ' + risiko(k) + ' |');
}
module.exports = { kategorie, risiko, A_BELEG, F_GRUND };
