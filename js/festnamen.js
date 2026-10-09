/* ============================================================
   FESTE NAMEN: korrigiert Wörter, die die Spracherkennung IMMER falsch schreibt, ganz am Anfang (vor allen Sprachbefehlen).
   Beispiel: "Route zu Alicia" -> "Route zu Alyssa". Ergänzt die lernbare Hör-Korrektur (hoerkorrektur.js), die weiter innen sitzt.
   Neue Einträge: unten in LISTE ergänzen: [Muster, richtige Schreibweise].
   ============================================================ */
(function () {
    'use strict';
    const W = '(^|[^A-Za-zÄÖÜäöüß0-9])', E = '(?![A-Za-zÄÖÜäöüß0-9])';
    const LISTE = [
        [/alicia|alycia|alisia|alissa|alyssia/, 'Alyssa'],
        [/alicias|alycias|alisias/, 'Alyssas'],
        [/neu[\s-]*g[aä]r?l+[iy]?n\w*[\s-]*ring/, 'Neu-Galliner-Ring'],
        [/schwarzenbeck/, 'Schwarzenbek'],
        [/schröter/, 'Schroeter']
    ].map(([re, r]) => [new RegExp(W + '(?:' + re.source + ')' + E, 'gi'), r]);

    function fest(text) {
        let t = String(text == null ? '' : text);
        LISTE.forEach(([re, r]) => { t = t.replace(re, (m, pre) => pre + r); });
        return t;
    }
    window.jvFestnamen = fest;

    if (window.jvCommands) {
        window.jvCommands.use('festnamen', function (text, next) {
            const t = fest(text);
            return next(t);
        }, 10);
    }
    if (typeof window.sendToGroqSmart === 'function' && !window.sendToGroqSmart._festnamen) {
        const original = window.sendToGroqSmart;
        const wrapped = function (text) {
            const args = Array.prototype.slice.call(arguments);
            if (typeof text === 'string') args[0] = fest(text);
            return original.apply(this, args);
        };
        wrapped._festnamen = true;
        Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
        window.sendToGroqSmart = wrapped;
    }
})();
