/* ============================================================
   ANZEIGE: Größe und Anordnung der normalen Ansicht, vor allem für breite Auto-Displays (gespiegeltes Handy).
   - Regler "Anzeigegröße" (50 bis 120 Prozent), gespeichert.
   - Anordnung: Automatisch (breit, wenn das Bild sehr breit ist), Breit (immer) oder Normal (immer die schmale Spalte).
   - Breit: Kugel links, Knöpfe und Textfeld rechts daneben.
   - Sprache: "Bildschirmgröße" (sagt, was Jarvis sieht), "Anzeige kleiner / größer", "Anzeige breit / normal / automatisch".
   Braucht: voice.js (speak), commands.js (jvCommands). Einstellungen im Fenster ⚙️ unter "Anzeige".
   ============================================================ */
(function () {
    'use strict';
    if (window.jvAnzeige) return;
    var K_ZOOM = 'jv_anzeige_zoom', K_LAY = 'jv_anzeige_layout';
    var zoom = 100, layout = 'auto';

    function lies() {
        try { var z = parseInt(localStorage.getItem(K_ZOOM), 10); if (z >= 50 && z <= 120) zoom = z; } catch (e) { }
        try { var l = localStorage.getItem(K_LAY); if (l === 'auto' || l === 'breit' || l === 'normal') layout = l; } catch (e) { }
    }
    function schreibe() {
        try { localStorage.setItem(K_ZOOM, String(zoom)); localStorage.setItem(K_LAY, layout); } catch (e) { }
    }

    var css = document.createElement('style');
    css.textContent =
        'html.jv-breit main.container{max-width:none!important}' +
        'html.jv-breit header>div{max-width:none!important}' +
        'html.jv-breit .jv-hauptspalte{display:grid!important;grid-template-columns:auto minmax(0,1fr);column-gap:24px;align-items:center;justify-items:stretch;padding:0 8px}' +
        'html.jv-breit .jv-hauptspalte>#recordBtn{grid-column:1;grid-row:1 / span 5;justify-self:center}' +
        'html.jv-breit .jv-hauptspalte>*:not(#recordBtn){grid-column:2}' +
        'html.jv-breit #sec-speak{padding:0}' +
        'html.jv-breit .app-shell{min-height:0!important}';
    document.head.appendChild(css);

    function breitJetzt() {
        if (layout === 'breit') return true;
        if (layout === 'normal') return false;
        var w = window.innerWidth / (zoom / 100), h = window.innerHeight / (zoom / 100);
        return w >= 1.6 * h && w >= 640;
    }
    function anwenden() {
        var root = document.documentElement;
        try { root.style.zoom = zoom === 100 ? '' : String(zoom / 100); } catch (e) { }
        var sp = document.getElementById('recordBtn');
        if (sp && sp.parentElement) sp.parentElement.classList.add('jv-hauptspalte');
        root.classList.toggle('jv-breit', breitJetzt());
        var r = document.getElementById('anzeigeZoom'); if (r) r.value = String(zoom);
        var o = document.getElementById('anzeigeZoomOut'); if (o) o.textContent = zoom + ' %';
        var s = document.getElementById('anzeigeLayout'); if (s) s.value = layout;
    }
    function setZoom(z) { zoom = Math.max(50, Math.min(120, Math.round(z))); schreibe(); anwenden(); }
    function setLayout(l) { layout = l; schreibe(); anwenden(); }

    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function groesseText() {
        var w = Math.round(window.innerWidth), h = Math.round(window.innerHeight);
        return 'Ich sehe ' + w + ' mal ' + h + ' Punkte, das Verhältnis ist ' + (w / h).toFixed(1).replace('.', ',') +
            ' zu 1. Anzeigegröße ' + zoom + ' Prozent, Anordnung ' + (breitJetzt() ? 'breit' : 'normal') + '.';
    }

    function norm(t) {
        return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function befehl(text, next) {
        var t = norm(text);
        if (!t || t.split(' ').length > 8) return next(text);
        if (/^(wie gross ist (der|dein) bildschirm|bildschirm ?groesse|anzeige ?groesse|wie gross ist die anzeige)$/.test(t)) { sagen(groesseText()); return true; }
        var m = t.match(/^(?:mach )?(?:die )?(?:anzeige|ansicht|bildschirm) (kleiner|groesser)$/);
        if (m) { setZoom(zoom + (m[1] === 'kleiner' ? -10 : 10)); sagen('Anzeige ' + zoom + ' Prozent.'); return true; }
        m = t.match(/^(?:anzeige|ansicht|anordnung) (breit|normal|automatisch)$/);
        if (m) { setLayout(m[1] === 'automatisch' ? 'auto' : m[1]); sagen('Anordnung ' + m[1] + '.'); return true; }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('anzeige', befehl, 6.5);

    function binde() {
        var r = document.getElementById('anzeigeZoom');
        if (r) r.addEventListener('input', function () { setZoom(parseInt(r.value, 10)); });
        var s = document.getElementById('anzeigeLayout');
        if (s) s.addEventListener('change', function () { setLayout(s.value); });
        var b = document.getElementById('anzeigeInfo');
        if (b) b.addEventListener('click', function () { sagen(groesseText()); });
    }
    window.addEventListener('resize', anwenden);
    window.addEventListener('orientationchange', function () { setTimeout(anwenden, 200); });

    lies();
    function start() { binde(); anwenden(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    window.jvAnzeige = { setZoom: setZoom, setLayout: setLayout, text: groesseText };
})();
