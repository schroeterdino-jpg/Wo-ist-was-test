/* ============================================================
   KARTEN WEG: Wenn du Jarvis etwas Neues fragst, verschwinden die Karten der letzten Antwort unten auf dem Bildschirm.
   Ausnahme: kurze Antworten auf eine Rückfrage ("ja", "nein", "1", "das erste", "weiter", "mehr" ...) - dann bleiben die Karten stehen,
   weil du dich gerade auf sie beziehst. Neue Antworten zeigen ihre eigenen Karten, wie bisher.
   Befehlsliste: ganz vorn (Reihenfolge 0), räumt nur auf und gibt den Satz unverändert weiter.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvKartenWeg) return;
    const BEZUG = /^(?:ja|jo|jep|jawohl|nein|nee|ok|okay|bitte|genau|klar|gerne|weiter|mehr|zurueck|abbrechen|stopp|stop|danke|speichern|loeschen|nochmal|wiederholen|eins|zwei|drei|vier|fuenf|sechs|\d{1,2}|(?:das |die |den |der )?(?:erste|zweite|dritte|vierte|fuenfte|sechste|letzte|naechste)n?s?|(?:ja|nein) (?:bitte|danke|gerne)|nummer (?:eins|zwei|drei|vier|fuenf|\d{1,2}))$/;
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function aufraeumen(text) {
        try {
            const t = norm(text);
            if (!t || BEZUG.test(t)) return false;
            if (typeof clearActionCards === 'function') { clearActionCards(); return true; }
        } catch (e) { }
        return false;
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') {
        window.jvCommands.use('karten-weg', function (text, next) { aufraeumen(text); return next(text); }, 0);
    }
    window.jvKartenWeg = { aufraeumen };
})();
