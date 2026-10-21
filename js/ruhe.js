/* ============================================================
   RUHE WÄHREND DES BRIEFINGS: Meldungen von selbst (Bank, E-Mail, Fristen, Wächter) warten, solange Jarvis ein Briefing erzählt oder gerade
   gesprochen/gerechnet hat. Vorher konnte eine Bank-Meldung in die Lücke zwischen zwei Sätzen oder vor den Beginn des Briefings fallen.
   - Nach jedem Sprechen/Rechnen bleibt es noch 9 Sekunden ruhig.
   - Ab dem Start eines Briefings (Knopf, Sprache, Schichtzeit) bleibt es 4 Minuten ruhig; die Meldungen kommen danach und gehen nicht verloren.
   Die Meldungs-Dateien fragen window.jvRuhe(): fehlt diese Datei, verhalten sie sich wie bisher.
   ============================================================ */
(function () {
    'use strict';
    var zuletzt = 0, bis = 0;
    function aktiv() {
        try {
            if (typeof isProcessing !== 'undefined' && isProcessing) return true;
            if (typeof isSpeaking === 'function' && isSpeaking()) return true;
        } catch (e) {}
        return false;
    }
    setInterval(function () { if (aktiv()) zuletzt = Date.now(); }, 400);
    window.jvRuhe = function () { var n = Date.now(); return n < bis || n - zuletzt < 9000; };
    window.jvRuheFuer = function (ms) { bis = Math.max(bis, Date.now() + ms); };
    function einhaengen() {
        var o = window.triggerDailyBriefing;
        if (typeof o !== 'function' || o._ruhe) return typeof o === 'function';
        var w = function () { window.jvRuheFuer(240000); return o.apply(this, arguments); };
        w._ruhe = true; window.triggerDailyBriefing = w;
        return true;
    }
    function start() { if (!einhaengen()) { var n = 0, iv = setInterval(function () { if (einhaengen() || ++n > 40) clearInterval(iv); }, 250); } }
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
