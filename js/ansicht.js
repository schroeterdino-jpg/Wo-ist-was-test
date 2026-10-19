/* ANSICHT: nur noch der 3D-Kopf (Kugel und Gehirn wurden entfernt)
   - Die Knöpfe "3D" (links oben) und das Gehirn-Symbol (rechts oben) sind ausgeblendet.
   - Umschalten nur noch per Sprache ("Zeig den Kopf", "Zeig die Kugel", "Zeig das Gehirn")
     oder im ☰ Menü (Einträge Kopf / Kugel / Gehirn).
   - Beim Öffnen der App startet immer der Kopf.
   - Der Wechsel passiert still, Zane sagt dazu nichts.
   Nutzt nur die vorhandenen Schnittstellen: window.jvAvatar3D.setMode (avatar3d.js)
   . */
(function () {
    'use strict';

    var css = document.createElement('style');
    css.textContent = '#jv3dToggle,#brainToggle{display:none!important}';
    document.head.appendChild(css);

    var aktuell = 'kopf';

    function kopfAn(on) { try { if (window.jvAvatar3D && window.jvAvatar3D.setMode) window.jvAvatar3D.setMode(!!on); } catch (e) { console.error('Ansicht Kopf', e); } }

    function set(name) {
        name = String(name || '').toLowerCase();
        if (name === 'kopf') { kopfAn(true); }
        else return false;
        aktuell = name;
        return true;
    }
    window.jvAnsicht = { set: set, get: function () { return aktuell; } };

    /* ---------- Sprache ---------- */
    var VERB = '(?:bitte\\s+)?(?:(?:zeig(?:e)?|schalte?|wechsel(?:e)?|stell(?:e)?|geh(?:e)?|spring(?:e)?|nimm|nimm\\s+mal|öffne|mach)(?:\\s+mir)?(?:\\s+mal)?\\s+)?(?:bitte\\s+)?(?:(?:auf|zu|zum|zur|in|den|die|das|dem|der|deinen|deine|dein|ansicht|ansicht\\s+auf)\\s+)*';
    var RX_KOPF = new RegExp('^(?:zurück\\s+(?:zum|zu\\s+dem|zu)\\s+kopf|' + VERB + '(?:3d-?\\s*)?kopf)(?:\\s*-?\\s*ansicht)?(?:\\s+an)?$');

    function handle(text) {
        var t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 50) return false;
        if (RX_KOPF.test(t)) return set('kopf');
        return false;
    }
    window.handleAnsichtCommand = handle;

    function registerCommand() {
        if (!window.jvCommands) return false;
        window.jvCommands.use('ansicht', function (text, next) {
            try { if (handle(text)) return true; } catch (e) {}
            return next(text);
        }, 150);   // vor dem alten Gehirn-Befehl (200), damit nichts gesagt wird
        return true;
    }
    if (!registerCommand()) document.addEventListener('DOMContentLoaded', registerCommand);

    /* ---------- Start: immer der Kopf ---------- */
    function start() {
        set('kopf');
        setTimeout(function () { set('kopf'); }, 1500);   // zur Sicherheit
    }
    if (document.readyState === 'complete') start(); else window.addEventListener('load', start);
})();
