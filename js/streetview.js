/* ============================================================
   STREET-VIEW-ZIELKARTE: Bei "Navigiere mich zu ..." zeigt die Karte zusätzlich ein Street-View-Foto der Straße vor dem Ziel.
   Mit ‹ › lässt sich die Blickrichtung drehen; ein Tipp auf die Karte öffnet die Route. Gibt es dort kein Street View (oder fehlt der
   Google-Schlüssel, ist das Monatslimit erreicht ...), bleibt die Karte wie bisher ohne Bild.
   Das Foto kommt über den eigenen Server (/api/maps?action=streetview), der Google-Schlüssel bleibt dort.
   Braucht: places.js (buildNavigationCard, showActionCards), storage.js (apiFetch). Fehlt diese Datei, bleibt alles wie vorher.
   ============================================================ */
(function () {
    'use strict';
    var seq = 0;

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

    /* Karte mit Bildbereich (zunächst versteckt, bis das Foto da ist) */
    window.jvStreetViewCard = function (ziel, c) {
        var id = 'jvsv' + (++seq);
        var btn = 'position:absolute;top:50%;margin-top:-17px;width:34px;height:34px;border-radius:50%;background:rgba(10,22,33,.8);border:1px solid #49d7ff;color:#49d7ff;font-size:18px;line-height:30px;text-align:center;cursor:pointer';
        c.html =
            '<div data-svbox="' + id + '" data-svziel="' + esc(ziel) + '" style="display:none;position:relative;height:190px;margin:-12px -12px 10px;border-radius:12px 12px 0 0;overflow:hidden;background:#06121c">' +
            '<img data-svimg alt="Street View" style="width:100%;height:100%;object-fit:cover;display:block">' +
            '<div style="position:absolute;left:0;right:0;top:0;padding:5px 10px;font-size:10px;letter-spacing:.1em;background:linear-gradient(180deg,rgba(0,0,0,.55),transparent);color:#cfefff">📷 STREET VIEW</div>' +
            '<span data-svdreh="-60" style="' + btn + ';left:8px">‹</span><span data-svdreh="60" style="' + btn + ';right:8px">›</span></div>' +
            '<div style="display:flex;align-items:center;gap:10px"><span class="text-2xl">' + esc(c.icon) + '</span>' +
            '<span class="flex-1 min-w-0"><b class="block text-[#49d7ff] text-sm">' + esc(c.title) + '</b><span class="block text-xs text-slate-400">' + esc(c.subtitle || '') + '</span></span>' +
            '<span style="border:1px solid #49d7ff;border-radius:8px;padding:6px 9px;color:#49d7ff;font-size:12px">ROUTE ›</span></div>';
        return c;
    };

    function laden(box, drehen) {
        if (typeof apiFetch !== 'function') return;
        var ziel = box.getAttribute('data-svziel'), img = box.querySelector('[data-svimg]');
        var m = /^\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*$/.exec(ziel);
        var url = '/api/maps?action=streetview&' + (m ? 'lat=' + m[1] + '&lon=' + m[2] : 'q=' + encodeURIComponent(ziel)) + '&drehen=' + (drehen || 0);
        apiFetch(url).then(function (r) {
            if (!r.ok) throw new Error('kein Bild');
            return r.blob();
        }).then(function (b) {
            if (!box.isConnected) return;
            var alt = img.getAttribute('src'); img.src = URL.createObjectURL(b);
            if (alt && alt.indexOf('blob:') === 0) { try { URL.revokeObjectURL(alt); } catch (e) {} }
            box.style.display = 'block';
        }).catch(function () { /* ohne Bild: Karte bleibt wie gehabt */ });
    }

    function pruefen() {
        var boxes = document.querySelectorAll('[data-svbox]:not([data-svfertig])');
        for (var i = 0; i < boxes.length; i++) {
            (function (box) {
                box.setAttribute('data-svfertig', '1');
                var winkel = 0;
                box.querySelectorAll('[data-svdreh]').forEach(function (b) {
                    b.addEventListener('click', function (e) {
                        e.preventDefault(); e.stopPropagation();
                        winkel = (winkel + Number(b.getAttribute('data-svdreh')) + 360) % 360;
                        laden(box, winkel);
                    });
                });
                laden(box, 0);
            })(boxes[i]);
        }
    }

    function start() {
        var cont = document.getElementById('actionCards');
        if (!cont || typeof MutationObserver !== 'function') return;
        new MutationObserver(pruefen).observe(cont, { childList: true, subtree: true });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
