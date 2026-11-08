/* ============================================================
   SCHATTENBETRIEB (Phase 3): beobachtet, wie Jarvis eine Anfrage wirklich bearbeitet, und vergleicht das mit den Fähigkeiten der Registry.
   Er verändert NICHTS: keine Aktion, keine zweite KI-Anfrage, keine Schreibvorgänge, keine Netzaufrufe, keine Sprachausgabe, keine Zeitgeber.
   STANDARDMÄSSIG AUS. Solange er aus ist, hängt er sich nirgends ein (handleLocalCommand bleibt exakt das Original).

   window.jvSchatten.an()            einschalten (nur diese Sitzung). Von Hand: localStorage "jv_schatten" = "1" schaltet ihn beim Start ein (wird hier nur GELESEN).
   window.jvSchatten.aus()           ausschalten, Original wiederherstellen
   window.jvSchatten.istAn()
   window.jvSchatten.erkenne(text)   reine Funktion: welche Registry-Fähigkeiten passen vermutlich? -> Namen
   window.jvSchatten.protokoll()     die letzten 50 Vorgänge (Kopie), nur im Arbeitsspeicher
   window.jvSchatten.zaehler()       Anzahl je Urteil
   window.jvSchatten.vergiss()       Protokoll und Zähler löschen
   window.jvSchatten.zusammenfassung()  Zahlen und letzte Vorgänge für die Diagnoseansicht (Einstellungen), nur echte Beobachtungen
   window.jvSchatten.ki(aktionen, text, nurLesen)   wird von sendToGroqSmart (assistant.js) aufgerufen, nachdem die KI-Aktionen feststehen; ist der Schatten aus, tut es nichts.

   Beobachtungswege: (1) handleLocalCommand (fester Sprachbefehl erledigt die Anfrage: Weg "lokal"; der Name des Befehls ist von außen nicht sichtbar),
   (2) der Aufruf ki() aus assistant.js (Weg "ki" mit den Aktionsarten der KI).

   Urteil je Vorgang:
     uebereinstimmung    eine vermutete Fähigkeit wurde auch benutzt
     lokal_statt_faehigkeit   Fähigkeit passt vermutlich, aber ein fester Befehl hat die Anfrage erledigt
     ki_ohne_aktion      Fähigkeit passt vermutlich, die KI hat aber nur geantwortet (keine passende Aktion)
     andere_faehigkeit   vermutet X, benutzt wurde Y
     unerwartete_faehigkeit   eine Fähigkeit wurde benutzt, die der Schatten nicht vermutet hatte (Erkennung zu eng)
     keine_faehigkeit    weder vermutet noch benutzt (normales Gespräch, sonstige Befehle)

   DATENSCHUTZ: Gespeichert wird NIE der Satz des Nutzers, nur Nummer, Zeit, Weg, Namen der Fähigkeiten, Aktionsarten, Urteil und eine grobe Längenklasse.
   Der Satz wird nur zum Erkennen kurz gelesen und nicht aufbewahrt (für die Zuordnung zum laufenden Vorgang bleibt nur eine Kurzprüfsumme).
   Fehler im Schatten werden geschluckt und nur gezählt (zaehler().eigeneFehler); die normale App läuft immer unverändert weiter.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvSchatten) return;

    var MAX_PROTOKOLL = 50, VORGANG_MAX_MS = 60000;

    /* Woran der Schatten eine Fähigkeit erkennt. Eine NEUE Fähigkeit der Registry braucht hier einen Eintrag (tests/schatten.js prüft das). Reine Muster, keine KI. */
    var HINWEISE = {
        ortssuche: [/\b(restaurant|restaurants|pizzeria|lokal|lokale|imbiss|cafe|café|bar|kneipe|döner|sushi|essen gehen|zum essen)\b/i, /\bin der nähe\b/i],
        websuche: [/\b(fernsehprogramm|tv-programm|was läuft|läuft heute|nachrichten|aktuell(e|en|er)?|öffnungszeiten|im internet|google|recherchier\w*|such(e)? (mir )?(im )?(internet|netz))\b/i],
        erinnerung_erstellen: [/\berinner(e|n|ung)?\b/i, /\bweck(e|st)? mich\b/i],
        termin_erstellen: [/\btermin\b/i, /\b(trag|trage|leg)\b.*\b(ein|an)\b.*\b(kalender|termin)\b/i, /\bkalender\b.*\b(ein|eintragen)\b/i],
        gedaechtnis_speichern: [/\bmerk(e)? (dir|dir bitte)\b/i, /\bspeicher(e|n)?\b.*\b(ab|dir)\b/i, /\bvergiss nicht\b/i]
    };
    /* Fähigkeiten ohne Erkennungsmuster dürfen hier ausdrücklich stehen (dann meldet der Test nichts). */
    var OHNE_ERKENNUNG = ['wetter', 'produktsuche', 'foto_info', 'jarvis_info', 'fahrzeit', 'kontakte_lesen', 'gedaechtnis_lesen', 'aufgabe_erstellen', 'aufgaben_lesen', 'termine_lesen', 'termin_verschieben', 'kontakt_speichern'];   // ausdrücklich: nur für die Chef-KI (Paket Orte/Internet/Wetter); der Schattenbetrieb beobachtet kein Wetter und (Paket B1) die neuen Schreibkern-Fähigkeiten nicht und ändert sich dadurch nicht

    var an = false, nr = 0, offen = null, protokoll = [], zaehlerObj = { eigeneFehler: 0 };
    var original = null, huelle = null;

    function R() { return window.jvRegistry || null; }
    function laenge(t) { var n = String(t || '').length; return n <= 20 ? 'kurz' : (n <= 80 ? 'mittel' : 'lang'); }

    /* Aktionsart -> Fähigkeit: aus den Angaben der Registry (verbindung.aktion), keine zweite Liste. */
    function aktionZuFaehigkeit() {
        var map = {};
        try { var reg = R(); if (reg) reg.beschreibe().forEach(function (b) { if (b.verbindung && b.verbindung.aktion) map[b.verbindung.aktion] = b.name; }); } catch (e) { }
        return map;
    }

    function erkenne(text) {
        var t = String(text == null ? '' : text), namen = [];
        try {
            var reg = R(); if (!reg) return [];
            reg.namen().forEach(function (n) {
                var muster = HINWEISE[n];
                if (muster && muster.some(function (rx) { return rx.test(t); })) namen.push(n);
            });
        } catch (e) { zaehlerObj.eigeneFehler++; }
        return namen;
    }

    function urteilen(kandidaten, benutzt, weg) {
        if (kandidaten.length && benutzt.length) return kandidaten.some(function (k) { return benutzt.indexOf(k) >= 0; }) ? 'uebereinstimmung' : 'andere_faehigkeit';
        if (kandidaten.length) return weg === 'lokal' ? 'lokal_statt_faehigkeit' : 'ki_ohne_aktion';
        if (benutzt.length) return 'unerwartete_faehigkeit';
        return 'keine_faehigkeit';
    }

    function abschliessen(v, weg, aktionen) {
        try {
            var typen = [], map = aktionZuFaehigkeit(), benutzt = [];
            (Array.isArray(aktionen) ? aktionen : []).forEach(function (a) {
                if (a && typeof a === 'object' && typeof (a.type) === 'string' && a.type) {
                    if (typen.indexOf(a.type) < 0) typen.push(a.type);
                    if (map[a.type] && benutzt.indexOf(map[a.type]) < 0) benutzt.push(map[a.type]);
                }
            });
            var urteil = urteilen(v.kandidaten, benutzt, weg);
            zaehlerObj[urteil] = (zaehlerObj[urteil] || 0) + 1;
            protokoll.push({ nr: v.nr, zeit: Date.now(), weg: weg, kandidaten: v.kandidaten.slice(), aktionen: typen, faehigkeiten: benutzt, urteil: urteil, laenge: v.laenge });
            while (protokoll.length > MAX_PROTOKOLL) protokoll.shift();
        } catch (e) { zaehlerObj.eigeneFehler++; }
    }

    /* Der Satz selbst wird nicht aufbewahrt: nur eine Zahl (Kurzprüfsumme), damit ki() den Vorgang von handleLocalCommand wiedererkennt. */
    function summe(t) { var s = String(t == null ? '' : t), h = 5381; for (var i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return h; }
    function beginne(text) {
        var v = { nr: ++nr, start: Date.now(), kandidaten: erkenne(text), laenge: laenge(text), summe: summe(text) };
        offen = v; return v;
    }
    function offenFuer(text) {
        if (!offen) return null;
        if (Date.now() - offen.start > VORGANG_MAX_MS) { offen = null; return null; }
        return offen.summe === summe(text) ? offen : null;
    }
    function schliesse() { offen = null; }

    /* Aufruf aus assistant.js, sobald die Aktionen der KI feststehen. Aus: sofort zurück. */
    function ki(aktionen, text, nurLesen) {
        if (!an) return;
        try {
            var v = offenFuer(text) || beginne(text);
            abschliessen(v, 'ki', aktionen);
            schliesse();
        } catch (e) { zaehlerObj.eigeneFehler++; offen = null; }
    }

    /* Hülle um handleLocalCommand: ruft das Original mit denselben Werten auf und gibt dessen Ergebnis unverändert zurück. */
    function bauHuelle(orig) {
        var h = function (text) {
            var v = null;
            try { v = beginne(text); } catch (e) { zaehlerObj.eigeneFehler++; }
            var res = orig.apply(this, arguments);
            try { if (v && res) { abschliessen(v, 'lokal', []); schliesse(); } } catch (e) { zaehlerObj.eigeneFehler++; }
            return res;
        };
        try { Object.keys(orig).forEach(function (k) { h[k] = orig[k]; }); } catch (e) { }
        return h;
    }

    function einschalten() {
        if (an) return true;
        an = true;
        try {
            if (typeof window.handleLocalCommand === 'function' && !window.handleLocalCommand._jvSchatten) {
                original = window.handleLocalCommand; huelle = bauHuelle(original); huelle._jvSchatten = true;
                window.handleLocalCommand = huelle;
            }
        } catch (e) { zaehlerObj.eigeneFehler++; }
        return true;
    }
    function ausschalten() {
        an = false; offen = null;
        try { if (huelle && window.handleLocalCommand === huelle && original) window.handleLocalCommand = original; } catch (e) { }
        original = null; huelle = null;
        return true;
    }
    /* Für die Diagnoseansicht (js/schatten_ansicht.js): nur tatsächlich beobachtete Vorgänge, nichts Erfundenes. Zahlen = seit Einschalten/Löschen; "letzte" = höchstens die letzten 10 aus dem Protokoll. */
    var ABWEICHUNG = ['lokal_statt_faehigkeit', 'ki_ohne_aktion', 'andere_faehigkeit', 'unerwartete_faehigkeit'];
    function zusammenfassung() {
        var z = JSON.parse(JSON.stringify(zaehlerObj)), beobachtet = 0, abw = 0;
        ['uebereinstimmung', 'lokal_statt_faehigkeit', 'ki_ohne_aktion', 'andere_faehigkeit', 'unerwartete_faehigkeit', 'keine_faehigkeit'].forEach(function (u) { beobachtet += z[u] || 0; if (ABWEICHUNG.indexOf(u) >= 0) abw += z[u] || 0; });
        return { an: an, beobachtet: beobachtet, uebereinstimmung: z.uebereinstimmung || 0, abweichungen: abw, keineFaehigkeit: z.keine_faehigkeit || 0, eigeneFehler: z.eigeneFehler || 0, je: z,
                 letzte: protokoll.slice(-10).reverse().map(function (e) { return JSON.parse(JSON.stringify(e)); }), abweichungsUrteile: ABWEICHUNG.slice() };
    }
    function vergiss() { protokoll = []; zaehlerObj = { eigeneFehler: 0 }; nr = 0; offen = null; }

    window.jvSchatten = {
        an: einschalten, aus: ausschalten, istAn: function () { return an; }, erkenne: erkenne, ki: ki,
        protokoll: function () { return protokoll.map(function (e) { return JSON.parse(JSON.stringify(e)); }); },
        zaehler: function () { return JSON.parse(JSON.stringify(zaehlerObj)); },
        vergiss: vergiss, zusammenfassung: zusammenfassung,
        _hinweise: function () { return Object.keys(HINWEISE); }, _ohneErkennung: function () { return OHNE_ERKENNUNG.slice(); }
    };

    /* Einzige Stelle, an der der Schalter gelesen wird (nur lesen, nie schreiben). */
    try { if (window.localStorage && window.localStorage.getItem('jv_schatten') === '1') einschalten(); } catch (e) { }
})();
