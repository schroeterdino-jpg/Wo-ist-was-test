/* ============================================================
   AKTIONS-KETTE (A5): die Umhüllungen von executeAction, benannt und mit festem Rang
   ============================================================
   Früher legte jede Datei ihre Umhüllung selbst um window.executeAction; die Reihenfolge ergab sich nur aus der Lade-Reihenfolge in index.html.
   Jetzt melden sich die Dateien hier an:  window.jvAktionen.huelle(name, rang, fabrik)
     name    eindeutiger Name der Hülle (ein zweiter Aufruf mit demselben Namen wird ignoriert, es gibt nie zwei Hüllen gleichen Namens)
     rang    kleiner = weiter außen (sieht die Aktion zuerst). Zwei Hüllen mit demselben Rang sind ein Fehler.
     fabrik  function (innen) { ... return wrapped; }   innen = die nächste Stufe der Kette (eine Hülle weiter innen, zuletzt die Basis aus actions.js)
   Die Kette ist unabhängig davon, in welcher Reihenfolge sich die Dateien anmelden: sie wird immer nach Rang geordnet.
   Ränge (außen -> innen): 10 loeschen_fragen, 20 gedaechtnis, 30 geburtstag_ganztag, 40 langzeit_erinnern, 50 langzeit, 60 lagebild, 70 routinen, 80 formulierungen, dann actions.js.
   Die Reihenfolge ist Absicht und hat Folgen (siehe ARCHITEKTUR.md, "A5"): zum Beispiel muss die Löschfrage außerhalb von langzeit liegen.

   Zusätzlich:
     jvAktionen.liste()    [{ name, rang }] von außen nach innen
     jvAktionen.pruefe()   { vollstaendig, fehlend[], unerwartet[], rangFalsch[], fehler[] }  - ob genau die acht erwarteten Hüllen mit den erwarteten Rängen da sind
     Eine Hülle, deren fabrik einen Fehler wirft oder keine Funktion liefert, wird NICHT eingebaut, steht unter fehler und macht pruefe().vollstaendig falsch.
     Fehlt nach dem Laden eine erwartete Hülle, erscheint das in der Fehleranzeige der App (nichts läuft unbemerkt mit einer unvollständigen Kette weiter).
   Rückfall: Fehlt diese Datei ganz (window.jvAktionen gibt es nicht), legen die acht Dateien ihre Umhüllung wie früher selbst um window.executeAction.
   Diese Datei ändert nichts an den Aktionen selbst. Sie muss direkt nach actions.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvAktionen || typeof window.executeAction !== 'function') return;

    const ERWARTET = [
        { name: 'loeschen_fragen', rang: 10 }, { name: 'gedaechtnis', rang: 20 }, { name: 'geburtstag_ganztag', rang: 30 }, { name: 'langzeit_erinnern', rang: 40 },
        { name: 'langzeit', rang: 50 }, { name: 'lagebild', rang: 60 }, { name: 'routinen', rang: 70 }, { name: 'formulierungen', rang: 80 }
    ];
    const BASIS = window.executeAction;   // actions.js
    const huellen = [];                   // nach Rang sortiert, außen zuerst: { name, rang, wrapper, merkmale, erbt }
    const fehler = [];                    // Texte: was bei der Anmeldung schiefging
    let letzteAussen = BASIS;             // die Funktion, die wir selbst zuletzt als window.executeAction gesetzt haben
    let zugefuegt = [];                   // Merkmale, die diese Datei selbst auf die äußerste Funktion gesetzt hat

    function melde(text) { fehler.push(text); try { console.error('Aktions-Kette: ' + text); } catch (e) { } }

    function stufeNach(h) {   // die nächste Stufe weiter innen (wird bei jedem Aufruf neu bestimmt, deshalb ist die Anmelde-Reihenfolge egal)
        const i = huellen.indexOf(h);
        return i >= 0 && i + 1 < huellen.length ? huellen[i + 1].wrapper : BASIS;
    }

    /* Die Funktion, die window.executeAction ist, trägt dieselben Merkmale (_loeschFrage, _gedaechtnis ...) wie früher: Früher gaben die meisten Umhüllungen
       die Merkmale der inneren Funktion weiter (Object.keys(original) kopiert), gedaechtnis und lagebild nicht. erbt:false bildet das nach. */
    function zusammenbauen() {
        zugefuegt.forEach(z => { try { delete z.fn[z.key]; } catch (e) { } });
        zugefuegt = [];
        const aussen = huellen.length ? huellen[0].wrapper : BASIS;
        for (const h of huellen) {
            for (const k of h.merkmale) if (!(k in aussen)) { try { aussen[k] = true; zugefuegt.push({ fn: aussen, key: k }); } catch (e) { } }
            if (h.erbt === false) break;
        }
        window.executeAction = letzteAussen = aussen;
    }

    function huelle(name, rang, fabrik, optionen) {
        if (typeof name !== 'string' || !name) { melde('Hülle ohne Namen abgelehnt'); return false; }
        if (huellen.some(h => h.name === name)) return false;   // doppelte Anmeldung: ignorieren, es gibt nie zwei Hüllen gleichen Namens
        if (typeof rang !== 'number' || !isFinite(rang)) { melde('Hülle ' + name + ': kein gültiger Rang'); return false; }
        const gleich = huellen.find(h => h.rang === rang);
        if (gleich) { melde('Hülle ' + name + ': Rang ' + rang + ' ist schon von ' + gleich.name + ' belegt'); return false; }
        if (typeof fabrik !== 'function') { melde('Hülle ' + name + ': fabrik ist keine Funktion'); return false; }
        if (window.executeAction !== letzteAussen) { melde('Hülle ' + name + ': window.executeAction wurde außerhalb der Kette verändert (eine Datei legt ihre Umhüllung noch auf die alte Art um), die Hülle ist NICHT eingebaut'); return false; }
        const h = { name, rang, wrapper: null, merkmale: [], erbt: !(optionen && optionen.erbt === false) };
        const innen = function () { return stufeNach(h).apply(this, arguments); };   // reicht Argumente, Rückgabe und Fehler unverändert weiter
        let w;
        try { w = fabrik(innen); } catch (e) { melde('Hülle ' + name + ': fabrik hat einen Fehler geworfen (' + String(e && e.message).slice(0, 120) + '), die Hülle ist NICHT eingebaut'); return false; }
        if (typeof w !== 'function') { melde('Hülle ' + name + ': fabrik hat keine Funktion geliefert, die Hülle ist NICHT eingebaut'); return false; }
        h.wrapper = w;
        h.merkmale = Object.keys(w).filter(k => k[0] === '_');
        huellen.push(h);
        huellen.sort((a, b) => a.rang - b.rang);
        zusammenbauen();
        return true;
    }

    function liste() { return huellen.map(h => ({ name: h.name, rang: h.rang })); }

    function pruefe() {
        const da = liste(), erwartet = ERWARTET;
        const fehlend = erwartet.filter(e => !da.some(d => d.name === e.name)).map(e => e.name);
        const unerwartet = da.filter(d => !erwartet.some(e => e.name === d.name)).map(d => d.name);
        const rangFalsch = da.filter(d => erwartet.some(e => e.name === d.name && e.rang !== d.rang)).map(d => d.name);
        return { vollstaendig: !fehlend.length && !unerwartet.length && !rangFalsch.length && !fehler.length, fehlend, unerwartet, rangFalsch, fehler: fehler.slice() };
    }

    window.jvAktionen = { huelle, liste, pruefe, erwartet: ERWARTET.map(e => ({ name: e.name, rang: e.rang })) };

    // Nach dem Start: ist die Kette vollständig? Wenn nicht, erscheint es in der Fehleranzeige (index.html fängt den Fehler).
    try {
        window.addEventListener('load', function () {
            setTimeout(function () {
                const p = pruefe();
                if (p.vollstaendig) return;
                const t = 'Aktions-Kette unvollständig. Fehlend: ' + (p.fehlend.join(', ') || '-') + '. Falscher Rang: ' + (p.rangFalsch.join(', ') || '-') + '. Unerwartet: ' + (p.unerwartet.join(', ') || '-') + '. Fehler: ' + (p.fehler.join(' | ') || '-');
                setTimeout(function () { throw new Error(t); }, 0);
            }, 3000);
        });
    } catch (e) { }
})();
