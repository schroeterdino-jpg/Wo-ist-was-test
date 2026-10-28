/* ============================================================
   FOTO-KETTE (Phase 3): die Erweiterungen der Foto-Funktionen, benannt und mit festem Rang
   ============================================================
   Früher legte jede Foto-Datei ihre Umhüllung selbst um die Funktionen aus photo.js (und lagebild/fotosenden um showActionCards); die Reihenfolge
   ergab sich nur aus der Lade-Reihenfolge in index.html. Jetzt melden sich die Dateien hier an:  window.jvFotoKette.anmelden(funktion, name, rang, fabrik)
     funktion  eine von: parsePhotoRequest, processPhoto, handlePhotoCommand, parseFollowupTask, showActionCards, photoAskWhatToDo, confirmPhotoPending
     name      eindeutig je Funktion (ein zweiter Aufruf mit demselben Namen ist ein Fehler und wird NICHT eingebaut)
     rang      kleiner = weiter außen (greift zuerst). Zwei Erweiterungen derselben Funktion mit demselben Rang sind ein Fehler.
     fabrik    function (innen) { return function (...) { ... innen.apply(this, arguments) ... }; }
               innen = die nächste Stufe weiter innen (zuletzt die ursprüngliche Funktion aus photo.js bzw. places.js). Wer nichts weiterreicht, ersetzt die Funktion
               an dieser Stelle (so war es bei foto_adresse/foto_brief mit photoAskWhatToDo).
   Die Kette ist unabhängig davon, in welcher Reihenfolge sich die Dateien anmelden: die Stufe "innen" wird bei jedem Aufruf nach Rang bestimmt.
   Jede Funktion hat ihre EIGENE Kette (nicht alle Dateien erweitern alle Funktionen). Ränge (außen -> innen), siehe ERWARTET unten:
     parsePhotoRequest, processPhoto, handlePhotoCommand : 10 foto_rezept, 30 foto_person, 40 wunschliste, 50 foto_urlaubsplan, 60 foto_essensplan, 70 foto_stundenplan, 80 foto_abtippen, 90 foto_brief, 100 foto_adresse
     parseFollowupTask                                   : wie oben, aber ohne foto_person
     photoAskWhatToDo                                    : 10 foto_rezept, 20 foto_erkennen, 40 wunschliste, 50 foto_urlaubsplan, 60 foto_essensplan, 70 foto_stundenplan, 80 foto_abtippen, 90 foto_brief, 100 foto_adresse
     confirmPhotoPending                                 : 90 foto_brief, 100 foto_adresse
     showActionCards (dauerhaft)                         : 10 fotosenden, 20 lagebild  (innerste Stufe: places.js)
   Die Ränge sind die HEUTIGE Reihenfolge (die zuletzt geladene Datei war außen). Sie wurden nicht verbessert. Wer sie ändert, ändert das Verhalten (tests/reihenfolge.js).
   NICHT Teil der Kette: runLastPhotoTask (nur foto_erkennen) und die vorübergehenden Eingriffe in showActionCards, die einige Dateien während eines
   photoAskWhatToDo-Aufrufs machen (stundenplan, essensplan, urlaubsplan, wunschliste, rezept): sie stecken im Code ihrer photoAskWhatToDo-Erweiterung und werden dort wieder zurückgenommen.

   Zusätzlich:
     jvFotoKette.liste()   { funktion: [{ name, rang }] } von außen nach innen
     jvFotoKette.text()    lesbar: "photoAskWhatToDo: foto_rezept(10) > foto_erkennen(20) > ..."
     jvFotoKette.pruefe()  { vollstaendig, fehlend[], unerwartet[], rangFalsch[], fehler[] } - ob genau die erwarteten Erweiterungen mit den erwarteten Rängen da sind
     Eine Erweiterung, deren fabrik einen Fehler wirft oder keine Funktion liefert, wird NICHT eingebaut, steht unter fehler und macht pruefe().vollstaendig falsch.
     Fehlt nach dem Laden eine erwartete Erweiterung, erscheint das in der Fehleranzeige der App (nichts läuft unbemerkt mit einer unvollständigen Kette weiter).
   Kein Rückfall auf die alte Art: Diese Datei steht fest in index.html (direkt nach places.js). Fehlt sie, schlägt die Anmeldung in den Foto-Dateien laut fehl
   (und tests/reihenfolge.js ist rot), statt dass es zwei verschiedene Wahrheiten über die Reihenfolge gibt.
   Diese Datei ändert nichts an den Foto-Funktionen selbst. Sie muss VOR lagebild.js und allen foto_*.js geladen werden (und nach places.js).
   ============================================================ */
(function () {
    'use strict';
    if (window.jvFotoKette) return;

    const R = (name, rang) => ({ name, rang });
    const PLAN = [R('foto_rezept', 10), R('foto_person', 30), R('wunschliste', 40), R('foto_urlaubsplan', 50), R('foto_essensplan', 60), R('foto_stundenplan', 70), R('foto_abtippen', 80), R('foto_brief', 90), R('foto_adresse', 100)];
    const ERWARTET = {
        parsePhotoRequest: PLAN,
        processPhoto: PLAN,
        handlePhotoCommand: PLAN,
        parseFollowupTask: PLAN.filter(e => e.name !== 'foto_person'),
        photoAskWhatToDo: [R('foto_rezept', 10), R('foto_erkennen', 20), R('wunschliste', 40), R('foto_urlaubsplan', 50), R('foto_essensplan', 60), R('foto_stundenplan', 70), R('foto_abtippen', 80), R('foto_brief', 90), R('foto_adresse', 100)],
        confirmPhotoPending: [R('foto_brief', 90), R('foto_adresse', 100)],
        showActionCards: [R('fotosenden', 10), R('lagebild', 20)]
    };
    const FUNKTIONEN = Object.keys(ERWARTET);

    const stufen = {};     // funktion -> [{ name, rang, wrapper }] nach Rang sortiert, außen zuerst
    const basis = {};      // funktion -> die ursprüngliche Funktion (innerste Stufe)
    const letzte = {};     // funktion -> die Funktion, die wir selbst zuletzt als window[funktion] gesetzt haben
    const fehler = [];     // Texte: was bei der Anmeldung schiefging
    FUNKTIONEN.forEach(f => { stufen[f] = []; });

    function melde(text) { fehler.push(text); try { console.error('Foto-Kette: ' + text); } catch (e) { } }

    function stufeNach(funktion, s) {   // die nächste Stufe weiter innen (wird bei jedem Aufruf neu bestimmt, deshalb ist die Anmelde-Reihenfolge egal)
        const l = stufen[funktion], i = l.indexOf(s);
        return i >= 0 && i + 1 < l.length ? l[i + 1].wrapper : basis[funktion];
    }

    function anmelden(funktion, name, rang, fabrik) {
        if (FUNKTIONEN.indexOf(funktion) < 0) { melde('Unbekannte Funktion "' + funktion + '" (Anmeldung von ' + name + ') abgelehnt'); return false; }
        const l = stufen[funktion], wo = funktion + '/' + name;
        if (typeof name !== 'string' || !name) { melde(funktion + ': Erweiterung ohne Namen abgelehnt'); return false; }
        if (l.some(s => s.name === name)) { melde(wo + ': Name ist schon angemeldet, die zweite Anmeldung ist NICHT eingebaut'); return false; }
        if (typeof rang !== 'number' || !isFinite(rang)) { melde(wo + ': kein gültiger Rang'); return false; }
        const gleich = l.find(s => s.rang === rang);
        if (gleich) { melde(wo + ': Rang ' + rang + ' ist schon von ' + gleich.name + ' belegt'); return false; }
        if (typeof fabrik !== 'function') { melde(wo + ': fabrik ist keine Funktion'); return false; }
        if (!basis[funktion]) {
            if (typeof window[funktion] !== 'function') { melde(wo + ': die Funktion window.' + funktion + ' gibt es (noch) nicht, die Erweiterung ist NICHT eingebaut'); return false; }
            basis[funktion] = letzte[funktion] = window[funktion];
        }
        if (window[funktion] !== letzte[funktion]) { melde(wo + ': window.' + funktion + ' wurde außerhalb der Kette verändert (eine Datei legt ihre Umhüllung noch auf die alte Art um), die Erweiterung ist NICHT eingebaut'); return false; }
        const s = { name, rang, wrapper: null };
        const innen = function () { return stufeNach(funktion, s).apply(this, arguments); };   // reicht Argumente, Rückgabe und Fehler unverändert weiter
        let w;
        try { w = fabrik(innen); } catch (e) { melde(wo + ': fabrik hat einen Fehler geworfen (' + String(e && e.message).slice(0, 120) + '), die Erweiterung ist NICHT eingebaut'); return false; }
        if (typeof w !== 'function') { melde(wo + ': fabrik hat keine Funktion geliefert, die Erweiterung ist NICHT eingebaut'); return false; }
        s.wrapper = w;
        l.push(s);
        l.sort((a, b) => a.rang - b.rang);
        window[funktion] = letzte[funktion] = l[0].wrapper;
        return true;
    }

    function liste() {
        const o = {};
        FUNKTIONEN.forEach(f => { o[f] = stufen[f].map(s => ({ name: s.name, rang: s.rang })); });
        return o;
    }
    function text() { const l = liste(); return FUNKTIONEN.map(f => f + ': ' + (l[f].map(s => s.name + '(' + s.rang + ')').join(' > ') || '(leer)')).join('\n'); }

    function pruefe() {
        const da = liste(), fehlend = [], unerwartet = [], rangFalsch = [];
        FUNKTIONEN.forEach(f => {
            ERWARTET[f].forEach(e => { if (!da[f].some(d => d.name === e.name)) fehlend.push(f + '/' + e.name); });
            da[f].forEach(d => {
                const e = ERWARTET[f].find(x => x.name === d.name);
                if (!e) unerwartet.push(f + '/' + d.name); else if (e.rang !== d.rang) rangFalsch.push(f + '/' + d.name);
            });
        });
        return { vollstaendig: !fehlend.length && !unerwartet.length && !rangFalsch.length && !fehler.length, fehlend, unerwartet, rangFalsch, fehler: fehler.slice() };
    }

    window.jvFotoKette = { anmelden, liste, text, pruefe, funktionen: FUNKTIONEN.slice(), erwartet: JSON.parse(JSON.stringify(ERWARTET)) };

    // Nach dem Start: ist die Kette vollständig? Wenn nicht, erscheint es in der Fehleranzeige (index.html fängt den Fehler).
    try {
        window.addEventListener('load', function () {
            setTimeout(function () {
                const p = pruefe();
                if (p.vollstaendig) return;
                const t = 'Foto-Kette unvollständig. Fehlend: ' + (p.fehlend.join(', ') || '-') + '. Falscher Rang: ' + (p.rangFalsch.join(', ') || '-') + '. Unerwartet: ' + (p.unerwartet.join(', ') || '-') + '. Fehler: ' + (p.fehler.join(' | ') || '-');
                setTimeout(function () { throw new Error(t); }, 0);
            }, 3000);
        });
    } catch (e) { }
})();
