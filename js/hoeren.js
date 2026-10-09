/* ============================================================
   BESSER HÖREN (Bluetooth-Freisprechanlage im Auto): Die Freisprechanlage überträgt nur schmale Tonqualität,
   und das Mikrofon geht erst einen Moment nach dem Start auf. Zwei Hilfen:
   1. Die Spracherkennung liefert bis zu 5 Lesarten. Ist die erste nicht die beste, nimmt die App die Lesart,
      die bekannte Wörter enthält (Alyssa, Lagebild, Route, Penny, tanken, Neu-Galliner-Ring ...).
   2. Sobald das Mikrofon WIRKLICH aufnimmt, steht "Sprich jetzt ..." im Bild: erst dann sprechen, dann gehen keine ersten Wörter verloren.
   Fehler stören nie: bei jedem Problem läuft alles wie vorher. Braucht: voice.js/assistant.js (recognition). Nach diesen laden.
   ============================================================ */
(function () {
    'use strict';
    let rec = null;
    try { rec = (typeof recognition !== 'undefined') ? recognition : null; } catch (e) { rec = null; }
    if (!rec || rec._jvHoeren) return;
    rec._jvHoeren = true;

    const BEKANNT = /alyssa|neu-galliner|schwarzenbek|schroeter|lagebild|\broute\b|penny|tank|diesel|losfahren|nächste|arbeit|zuhause|jarvis|termin|einkauf|erinner|wetter|kalender/i;
    const fest = t => (typeof window.jvFestnamen === 'function' ? window.jvFestnamen(t) : t);

    function beste(result) {
        try {
            if (!result || result.length < 2) return null;
            const alt = [];
            for (let i = 0; i < result.length; i++) alt.push(String(result[i].transcript || ''));
            const score = t => { const f = fest(t); const m = f.match(new RegExp(BEKANNT.source, 'gi')); return m ? m.length : 0; };
            let b = 0, bs = score(alt[0]);
            for (let i = 1; i < alt.length; i++) { const s = score(alt[i]); if (s > bs) { b = i; bs = s; } }
            return b === 0 ? null : alt[b];
        } catch (e) { return null; }
    }

    try { rec.maxAlternatives = 5; } catch (e) {}

    const origResult = rec.onresult;
    if (typeof origResult === 'function') {
        rec.onresult = function (event) {
            try {
                const last = event.results[event.results.length - 1];
                const b = beste(last);
                if (b) {
                    const fake = { resultIndex: event.resultIndex, results: Array.prototype.slice.call(event.results, 0, event.results.length - 1).concat([[{ transcript: b, confidence: 1 }]]) };
                    return origResult.call(this, fake);
                }
            } catch (e) {}
            return origResult.apply(this, arguments);
        };
    }

    const origAudio = rec.onaudiostart;
    rec.onaudiostart = function () {
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Sprich jetzt ...'); } catch (e) {}
        if (typeof origAudio === 'function') return origAudio.apply(this, arguments);
    };
})();
