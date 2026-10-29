/* ============================================================
   SPEAK-KETTE (Phase 4B): die sechs dauerhaften Umhüllungen von speak(), benannt und mit festem Rang
   ============================================================
   Früher legte jede Datei ihre Umhüllung selbst um window.speak; die Reihenfolge ergab sich nur aus der Lade-Reihenfolge in index.html.
   Jetzt melden sich die Dateien hier an:  window.jvSpeakKette.anmelden(name, rang, fabrik)
     name      eindeutig (ein zweiter Aufruf mit demselben Namen ist ein Fehler und wird NICHT eingebaut)
     rang      kleiner = weiter außen (greift zuerst). Zwei Stufen mit demselben Rang sind ein Fehler.
     fabrik    function (innen) { return function (text, onComplete, langCode) { ... innen.apply(this, arguments) ... }; }
               innen = die nächste Stufe weiter innen (zuletzt speak() aus voice.js). Die Stufe "innen" wird bei JEDEM Aufruf neu bestimmt.
   Ränge (außen -> innen), das ist die HEUTIGE Reihenfolge, nicht verbessert:
     10 teilen  >  20 kontext_lokal  >  30 fish._dash  >  40 toene  >  50 sprueche  >  60 voicefix.speak  >  Basis voice.js
   window.speak bleibt die öffentliche Schnittstelle: Alle Aufrufer rufen weiter speak(...) bzw. window.speak(...). Die Kette setzt window.speak auf die äußerste Stufe.
   mehrfach.js bleibt bewusst AUSSERHALB: Es ersetzt window.speak nur kurz (Fang) und stellt es danach wieder her. Die Kette hält window.speak nirgends fest
   (nur die Basis aus voice.js und ihre eigenen Stufen), der Fang umgeht also die ganze Kette, genau wie vorher.
   NICHT Teil der Kette (bewusst unverändert): speakAck, speakBrowser, speakAckBrowser, fetchCloudSpeechBlob, getTtsEngine/setTtsEngine, startThinkingSound,
   die Tempo- und Aussprache-Eingriffe (speechrate, tempo, pronunciation), native_speech.

   Zusätzlich:
     jvSpeakKette.liste()   [{ name, rang }] von außen nach innen
     jvSpeakKette.text()    lesbar: "teilen(10) > kontext_lokal(20) > ... > [Basis voice.js]"
     jvSpeakKette.pruefe()  { vollstaendig, fehlend[], unerwartet[], rangFalsch[], fehler[] }
     Eine Stufe, deren fabrik einen Fehler wirft oder keine Funktion liefert, wird NICHT eingebaut, steht unter fehler und macht pruefe().vollstaendig falsch.
     Fehlt nach dem Laden eine erwartete Stufe (oder die Basis speak aus voice.js), erscheint das in der Fehleranzeige der App; gesprochen wird dazu nichts.
   Kein Rückfall auf die alte Art: Diese Datei steht fest in index.html (direkt nach voice.js). Fehlt sie, schlägt die Anmeldung in den sechs Dateien laut fehl.
   Muss NACH voice.js und VOR voicefix.js, sprueche.js, toene.js, fish.js, kontext_lokal.js und teilen.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvSpeakKette) return;

    const ERWARTET = [
        { name: 'teilen', rang: 10 }, { name: 'kontext_lokal', rang: 20 }, { name: 'fish._dash', rang: 30 },
        { name: 'toene', rang: 40 }, { name: 'sprueche', rang: 50 }, { name: 'voicefix.speak', rang: 60 }
    ];

    const stufen = [];     // [{ name, rang, wrapper }] nach Rang sortiert, außen zuerst
    let basis = null;      // die ursprüngliche speak() aus voice.js (innerste Stufe)
    let letzte = null;     // die Funktion, die wir selbst zuletzt als window.speak gesetzt haben
    const fehler = [];     // Texte: was bei der Anmeldung schiefging

    function melde(text) { fehler.push(text); try { console.error('Speak-Kette: ' + text); } catch (e) { } }

    function stufeNach(s) {   // die nächste Stufe weiter innen (bei jedem Aufruf neu bestimmt, deshalb ist die Anmelde-Reihenfolge egal)
        const i = stufen.indexOf(s);
        return i >= 0 && i + 1 < stufen.length ? stufen[i + 1].wrapper : basis;
    }

    function anmelden(name, rang, fabrik) {
        const wo = String(name);
        if (typeof name !== 'string' || !name) { melde('Stufe ohne Namen abgelehnt'); return false; }
        if (stufen.some(s => s.name === name)) { melde(wo + ': Name ist schon angemeldet, die zweite Anmeldung ist NICHT eingebaut'); return false; }
        if (typeof rang !== 'number' || !isFinite(rang)) { melde(wo + ': kein gültiger Rang'); return false; }
        const gleich = stufen.find(s => s.rang === rang);
        if (gleich) { melde(wo + ': Rang ' + rang + ' ist schon von ' + gleich.name + ' belegt'); return false; }
        if (typeof fabrik !== 'function') { melde(wo + ': fabrik ist keine Funktion'); return false; }
        if (!basis) {
            if (typeof window.speak !== 'function') { melde(wo + ': die Basis window.speak (voice.js) gibt es (noch) nicht, die Stufe ist NICHT eingebaut'); return false; }
            basis = letzte = window.speak;
        }
        if (window.speak !== letzte) { melde(wo + ': window.speak wurde außerhalb der Kette verändert (eine Datei legt ihre Umhüllung noch auf die alte Art um), die Stufe ist NICHT eingebaut'); return false; }
        const s = { name, rang, wrapper: null };
        const innen = function () { return stufeNach(s).apply(this, arguments); };   // reicht Argumente, Rückgabe und Fehler unverändert weiter
        let w;
        try { w = fabrik(innen); } catch (e) { melde(wo + ': fabrik hat einen Fehler geworfen (' + String(e && e.message).slice(0, 120) + '), die Stufe ist NICHT eingebaut'); return false; }
        if (typeof w !== 'function') { melde(wo + ': fabrik hat keine Funktion geliefert, die Stufe ist NICHT eingebaut'); return false; }
        s.wrapper = w;
        stufen.push(s);
        stufen.sort((a, b) => a.rang - b.rang);
        window.speak = letzte = stufen[0].wrapper;
        return true;
    }

    function liste() { return stufen.map(s => ({ name: s.name, rang: s.rang })); }
    function text() { return stufen.map(s => s.name + '(' + s.rang + ')').join(' > ') + (stufen.length ? ' > ' : '') + '[Basis voice.js]'; }

    function pruefe() {
        const da = liste(), fehlend = [], unerwartet = [], rangFalsch = [];
        ERWARTET.forEach(e => { if (!da.some(d => d.name === e.name)) fehlend.push(e.name); });
        da.forEach(d => {
            const e = ERWARTET.find(x => x.name === d.name);
            if (!e) unerwartet.push(d.name); else if (e.rang !== d.rang) rangFalsch.push(d.name);
        });
        if (typeof basis !== 'function' && typeof window.speak !== 'function') fehlend.push('Basis window.speak (voice.js)');
        return { vollstaendig: !fehlend.length && !unerwartet.length && !rangFalsch.length && !fehler.length, fehlend, unerwartet, rangFalsch, fehler: fehler.slice() };
    }

    window.jvSpeakKette = { anmelden, liste, text, pruefe, erwartet: JSON.parse(JSON.stringify(ERWARTET)) };

    // Nach dem Start: ist die Kette vollständig? Wenn nicht, erscheint es in der Fehleranzeige (index.html fängt den Fehler). Kein Dauer-Timer, keine Sprache, keine Karte.
    try {
        window.addEventListener('load', function () {
            setTimeout(function () {
                const p = pruefe();
                if (p.vollstaendig) return;
                const t = 'Speak-Kette unvollständig. Fehlend: ' + (p.fehlend.join(', ') || '-') + '. Falscher Rang: ' + (p.rangFalsch.join(', ') || '-') + '. Unerwartet: ' + (p.unerwartet.join(', ') || '-') + '. Fehler: ' + (p.fehler.join(' | ') || '-');
                setTimeout(function () { throw new Error(t); }, 0);
            }, 3000);
        });
    } catch (e) { }
})();
