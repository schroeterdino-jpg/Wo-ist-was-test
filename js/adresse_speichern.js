/* ============================================================
   ADRESSE SPEICHERN: "Speichere die Adresse (in meinen Kontakten)" nach einer Ortssuche oder Route.
   Beispiel: "Such mir einen Edeka in Bergedorf" oder "Ich möchte zum Edeka in Bergedorf fahren" -> danach "Kannst du bitte die Adresse speichern?"
   Quelle: der zuletzt gefundene Ort (ortsuche.js, window.jvLetzteOrte) oder das zuletzt berechnete Routenziel (travel.js, window.jvLetzteRoute),
   je nachdem, was neuer ist (höchstens 30 Minuten alt). Gespeichert wird über ortsuche.js (window.jvSavePlace): nichts doppelt, Adresse bei
   gleichnamigem Kontakt ohne Adresse ergänzt. Bei einer Route wird die Adresse über /api/reverse aus den Koordinaten geholt.
   Befehlsliste: Order 0.55.
   ============================================================ */
(function () {
    'use strict';
    var MAX_ALTER = 30 * 60 * 1000;
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[.,!?;:"„“”]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function sag(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }

    function istBefehl(t) {
        if (t.length > 90) return false;
        if (!/\bspeicher/.test(t)) return false;
        if (!/\b(adresse|anschrift|standort|ort|laden|ziel|markt)\b/.test(t)) return false;
        if (/\b(foto|bild|brief|visitenkarte|termin|erinnerung|liste|parkplatz|rezept|nachricht|mail|einkauf|notiz|stundenplan)\b/.test(t)) return false;
        return true;
    }

    async function ausRoute(r) {
        if (typeof apiFetch !== 'function') return false;
        var adresse = '';
        try {
            var res = await apiFetch('/api/reverse?lat=' + encodeURIComponent(r.lat) + '&lon=' + encodeURIComponent(r.lon));
            var d = await res.json().catch(function () { return {}; });
            adresse = (d && (d.adresse || d.strasse)) || '';
        } catch (e) { }
        if (!adresse) { sag('Die Adresse zu ' + r.label + ' konnte ich gerade nicht ermitteln.'); return true; }
        var name = String(r.label || '').trim(); if (name) name = name.charAt(0).toUpperCase() + name.slice(1);
        window.jvSavePlace({ name: name, street: adresse });
        return true;
    }

    function handle(text) {
        var t = norm(text);
        if (!istBefehl(t)) return false;
        var orte = null, route = window.jvLetzteRoute || null, jetzt = Date.now();
        try { orte = window.jvLetzteOrte ? window.jvLetzteOrte() : null; } catch (e) { }
        var orteOk = orte && orte.places && orte.places.length && jetzt - orte.at < MAX_ALTER;
        var routeOk = route && route.label && isFinite(route.lat) && isFinite(route.lon) && jetzt - route.at < MAX_ALTER;
        if (typeof window.jvSavePlace !== 'function' || (!orteOk && !routeOk)) {
            sag('Ich habe gerade keine Adresse, die ich speichern könnte. Frag mich zuerst nach einem Ort, zum Beispiel: Such mir einen Edeka in Bergedorf.');
            return true;
        }
        if (orteOk && (!routeOk || orte.at >= route.at)) { window.jvSavePlace(orte.places[0]); return true; }
        ausRoute(route);
        return true;
    }

    function register() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('adresse-speichern', function (text, next) { return handle(text) ? true : next(text); }, 0.55);
        return true;
    }
    var n = 0; (function r() { if (!register() && n++ < 40) setTimeout(r, 500); })();
    window.jvAdresseSpeichern = { test: function (t) { return istBefehl(norm(t)); } };
})();
