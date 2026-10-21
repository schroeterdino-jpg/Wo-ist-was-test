/* ============================================================
   VIBRATION: Das Handy vibriert kurz beim Antippen von Knöpfen und Kacheln und etwas deutlicher, wenn Jarvis anfängt zuzuhören.
   Sprache: "Vibration aus" / "Vibration an". Standard: an. Geräte ohne Vibration (z. B. iPhone) merken nichts davon.
   Braucht: storage.js, commands.js (optional). Fehlt etwas, passiert einfach nichts.
   ============================================================ */
(function () {
    'use strict';
    var KEY = 'helfer_vibration';
    function pd(k, d) { try { return getPersistentData(k, d); } catch (e) { return d; } }
    function sd(k, v) { try { setPersistentData(k, v); } catch (e) {} }
    function an() { return pd(KEY, 'an') !== 'aus'; }
    function brr(ms) { try { if (an() && navigator.vibrate) navigator.vibrate(ms); } catch (e) {} }

    function start() {
        // Antippen: Knöpfe, Kacheln, Hauptfläche (Jarvis antippen)
        document.addEventListener('pointerdown', function (e) {
            if (e.pointerType === 'mouse') return;
            var t = e.target && e.target.closest ? e.target.closest('button, .jvk, #recordBtn, [role=button], a') : null;
            if (t) brr(12);
        }, { passive: true, capture: true });
        // Zuhören beginnt: Der Aufnahme-Knopf bekommt die Klasse "recording"
        var rb = document.getElementById('recordBtn'), war = false;
        if (rb && window.MutationObserver) {
            new MutationObserver(function () {
                var jetzt = rb.classList.contains('recording');
                if (jetzt && !war) brr([30, 40, 30]);
                war = jetzt;
            }).observe(rb, { attributes: true, attributeFilter: ['class'] });
        }
        try {
            if (window.jvCommands) window.jvCommands.use('vibration', function (text, next) {
                var t = String(text || '').toLowerCase().replace(/[.!?,]/g, '').trim();
                if (!/^(?:(?:jarvis|zane|nova) )?vibration(?:en|s)?(?:[- ]?(?:modus|feedback))?(?: ?(aus|an|ausschalten|einschalten|ein))?$/.test(t)) return next();
                var aus = /\b(aus|ausschalten)$/.test(t);
                sd(KEY, aus ? 'aus' : 'an');
                if (!aus) brr(40);
                try { speak(aus ? 'Vibration ausgeschaltet.' : 'Vibration eingeschaltet.'); } catch (e) {}
                return true;
            }, 38);
        } catch (e) {}
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
