/* ============================================================
   ANTWORT-BAU (B3): setzt die gesprochene Antwort zusammen, wenn mehrere Teile einer Anfrage erledigt wurden.
   Reine Funktion: nimmt nur Daten, liest und schreibt nichts anderes (kein Speicher, kein Netz, keine Sprachausgabe).
   Benutzt von js/assistant.js (sendToGroqSmart); getestet in tests/antwort.js.

   window.jvAntwort.baue({
       basis      der Text, der ohne jeden Fehler gesprochen würde (wie bisher: erste Sonderantwort, sonst Antwort der KI, sonst Standardsatz)
       sonder     [{ ok: true|false, text }]  Ergebnisse der Sonderaufgaben (Kalendersuche, Web, Mail, Fahrzeit, Umgebung, Tanken, Bahn) in fester Reihenfolge
       erfolge    ['calendar', 'reminder', ...]  Aktionsarten, die geklappt haben
       okAnzahl   Zahl der geklappten Aktionen (auch solche ohne Satz, zum Beispiel reine Antworten)
       fehler     [Text]  Meldungen der Aktionen, die nicht geklappt haben (schon in Alltagssprache)
       nichts     [Text]  Sätze von Aktionen, die ohne Fehler bewusst nichts verändert haben ("Milch steht bereits ...", "kein passender Termin ..."); sie zählen nicht als geklappt
       hinweise   [Text]  Hinweise der geklappten Aktionen (zum Beispiel "bei Google nicht abgeglichen" oder eine Rückfrage)
       ausfaelle  [{ art: 'wetter'|'fahrzeit', grund: 'fehler'|'timeout' }]  Zusatzprüfungen, die gestartet wurden und ausgefallen sind
   })  ->  Text

   Regeln:
   - Alles klappt, nichts ist ausgefallen: wie bisher (basis plus Hinweise). Nur mehrere erfolgreiche Sonderergebnisse werden zusammengesetzt statt "erstes gewinnt".
   - Etwas hat nicht geklappt: zuerst die Ergebnisse, dann was geklappt hat (kurz), dann was nicht geklappt hat. Hinweise erfolgreicher Teile bleiben.
   - Ausfall einer Zusatzprüfung (Wetter, Fahrzeit) wird in einem kurzen Satz genannt, auch wenn sonst alles geklappt hat. Timeout zählt als Ausfall.
   - Nichts verändert (nichts): Der Satz steht anstelle der Erfolgsmeldung der KI. Ist sonst nichts Benanntes geklappt, wird nur dieser Satz gesprochen. Klappt daneben etwas, steht erst der Erfolg, dann der Satz.
   - Keine Technik-Texte: es werden nur die übergebenen Alltagssätze und die festen Sätze unten verwendet.
   - Keine doppelten Aussagen, die Reihenfolge ist fest.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvAntwort) return;

    var ERLEDIGT = {   // nur Aktionen, bei denen "geklappt" wirklich heißt, dass etwas gespeichert/geändert wurde (Löschen bewusst nicht: dort kann nur eine Rückfrage kommen)
        calendar: ['Termin gespeichert.', 'Termine gespeichert.'],
        calendar_update: ['Termin geändert.', 'Termine geändert.'],
        reminder: ['Erinnerung gespeichert.', 'Erinnerungen gespeichert.'],
        todo: ['Aufgabe gespeichert.', 'Aufgaben gespeichert.'],
        shopping: ['Einkaufsliste ergänzt.', 'Einkaufsliste ergänzt.'],
        list_edit: ['Liste geändert.', 'Listen geändert.'],
        memory_store: ['Gemerkt.', 'Gemerkt.'],
        parking_save: ['Parkplatz gespeichert.', 'Parkplatz gespeichert.'],
        home_save: ['Heimatadresse gespeichert.', 'Heimatadresse gespeichert.'],
        work_save: ['Arbeitsadresse gespeichert.', 'Arbeitsadresse gespeichert.'],
        briefing_add: ['Zum Briefing hinzugefügt.', 'Zum Briefing hinzugefügt.']
    };
    var AUSFALL = { wetter: 'Wetter konnte ich gerade nicht laden.', fahrzeit: 'Fahrzeit konnte ich gerade nicht ermitteln.' };
    var AUSFALL_REIHE = ['wetter', 'fahrzeit'];

    function sauber(a) { return (a || []).map(function (x) { return String(x == null ? '' : x).trim(); }).filter(Boolean); }
    function ohneDoppelte(teile) {
        var gesehen = {}, aus = [];
        teile.forEach(function (t) { var k = t.toLowerCase().replace(/\s+/g, ' '); if (!gesehen[k]) { gesehen[k] = 1; aus.push(t); } });
        return aus;
    }
    function erfolgsSaetze(erfolge) {
        var zahl = {}, reihe = [];
        (erfolge || []).forEach(function (t) { if (ERLEDIGT[t]) { if (!zahl[t]) { zahl[t] = 0; reihe.push(t); } zahl[t]++; } });
        return reihe.map(function (t) { return ERLEDIGT[t][zahl[t] > 1 ? 1 : 0]; });
    }
    function ausfallSaetze(ausfaelle) {
        var da = {};
        (ausfaelle || []).forEach(function (a) { if (a && AUSFALL[a.art]) da[a.art] = true; });
        return AUSFALL_REIHE.filter(function (k) { return da[k]; }).map(function (k) { return AUSFALL[k]; });
    }

    function baue(e) {
        e = e || {};
        var sonder = (e.sonder || []).filter(function (s) { return s && String(s.text || '').trim(); });
        var sonderOk = sauber(sonder.filter(function (s) { return s.ok !== false; }).map(function (s) { return s.text; }));
        var sonderFehl = sauber(sonder.filter(function (s) { return s.ok === false; }).map(function (s) { return s.text; }));
        var fehler = sauber(e.fehler), hinweise = ohneDoppelte(sauber(e.hinweise)), ausfall = ausfallSaetze(e.ausfaelle);
        var basis = String(e.basis == null ? '' : e.basis).trim();
        var nichts = ohneDoppelte(sauber(e.nichts));
        var teile;
        if (!fehler.length && !sonderFehl.length && !nichts.length) {
            teile = [sonderOk.length > 1 ? sonderOk.join(' ') : basis].concat(ausfall, hinweise);
        } else if (!fehler.length && !sonderFehl.length) {
            // Nur "nichts verändert": die Erfolgsmeldung der KI (basis) kann falsch sein, darum nur wahre Sätze verwenden
            var erfolgN = erfolgsSaetze(e.erfolge);
            var benannt = sonderOk.length || erfolgN.length;
            var vorn = sonderOk.length ? sonderOk : erfolgN;
            if (!benannt && (e.okAnzahl || 0) > 0 && basis) vorn = [basis];   // geklappt hat etwas ohne eigenen Satz (zum Beispiel eine reine Antwort)
            teile = vorn.concat(nichts, ausfall, hinweise);
        } else {
            var erfolg = erfolgsSaetze(e.erfolge), schlecht = fehler.concat(sonderFehl, ausfall);
            var nichtsBenannt = !sonderOk.length && !erfolg.length && !nichts.length;
            if (nichtsBenannt && (e.okAnzahl || 0) > 0 && fehler.length) schlecht = ['Das meiste ist erledigt, aber: ' + schlecht.join(' ')];
            teile = sonderOk.concat(erfolg, nichts, schlecht, hinweise);
        }
        return ohneDoppelte(teile.map(function (t) { return String(t).trim(); }).filter(Boolean)).join(' ');
    }

    window.jvAntwort = { baue: baue };
})();
