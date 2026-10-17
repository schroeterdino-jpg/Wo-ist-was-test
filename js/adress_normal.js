/* ============================================================
   ADRESSEN SPEICHERN: Schreibweise glätten und selbst auf der Karte suchen.
   - Heimat- und Arbeitsadresse werden so gespeichert, wie du sie sagst (Straße, Hausnummer, Ort reichen; eine Postleitzahl ist nicht nötig).
   - Typische Verhörer der Spracherkennung werden korrigiert: Schwarzenbeck -> Schwarzenbek, Neugalien/Neu Galina Ring -> Neu-Galliner-Ring, Galin -> Gallin,
     Verbrüderung Ring -> Verbrüderungsring.
   - Danach sucht die App die Adresse selbst auf der Karte (geocodeAddress). Nur wenn sie sie dort nicht findet, sagt Zane es.
   Umhüllt saveHomeAddress (places.js) und saveWorkAddress (routing.js); wird nach routing.js geladen.
   ============================================================ */
(function () {
    'use strict';
    function glaetten(a) {
        let t = String(a || '').trim().replace(/\s+/g, ' ');
        t = t.replace(/Schwarzenbeck/gi, 'Schwarzenbek');
        t = t.replace(/\bneu[\s-]*gal+i?(?:e|i)?n(?:er|a)?[\s-]*ring\b/gi, 'Neu-Galliner-Ring');
        t = t.replace(/\bneu[\s-]*gal+i?(?:e|i)?n(?:er|a)?\b(?![\s-]*ring)/gi, 'Neu-Galliner-Ring');
        t = t.replace(/\bVerbr(?:ü|ue)derung(?:s)?[\s-]*ring\b/gi, 'Verbrüderungsring');
        t = t.replace(/\b(in|,)\s*Galin\b/gi, (m, p) => p + ' Gallin').replace(/,\s*Galin\b/gi, ', Gallin');
        return t;
    }
    function pruefen(addr, was) {
        try {
            if (typeof geocodeAddress !== 'function') return;
            const tries = [addr];
            const m = addr.match(/^(.+?)\s+in\s+(.+)$/i);
            if (m) tries.push(m[1] + ', ' + m[2]);
            (async () => {
                for (const t of tries) { try { if (await geocodeAddress(t)) return; } catch (e) { } }
                try { if (typeof speak === 'function') speak('Die ' + was + ' habe ich gespeichert, aber auf der Karte nicht gefunden. Prüfe bitte die Schreibweise im Adress-Fenster.'); } catch (e) { }
            })();
        } catch (e) { }
    }
    function install() {
        if (window.__adressGlatt) return; window.__adressGlatt = true;
        if (typeof saveHomeAddress === 'function') {
            const o = saveHomeAddress;
            saveHomeAddress = function (addr) { const g = glaetten(addr); const r = o.call(this, g); if (g) pruefen(g, 'Heimatadresse'); return r; };
        }
        if (typeof saveWorkAddress === 'function') {
            const o = saveWorkAddress;
            saveWorkAddress = function (addr) { const g = glaetten(addr); const r = o.call(this, g); if (g) pruefen(g, 'Arbeitsadresse'); return r; };
        }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();
