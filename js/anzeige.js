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

    /* Die Anzeigegröße gilt nur, solange die Autoansicht offen ist. Die normale Jarvis-Ansicht bleibt immer bei 100 %. */
    function autoOffen() { try { return !!(window.jvAutoansicht && window.jvAutoansicht.offen()); } catch (e) { return false; } }
    function zoomJetzt() { return autoOffen() ? zoom : 100; }
    var zuletztAuto = false;
    function breitJetzt() {
        if (layout === 'breit') return true;
        if (layout === 'normal') return false;
        var zj = zoomJetzt(); var w = window.innerWidth / (zj / 100), h = window.innerHeight / (zj / 100);
        return w >= 1.6 * h && w >= 640;
    }
    var K_RAND = 'jv_anzeige_rand';
    function randHole() { try { var r = parseInt(localStorage.getItem(K_RAND), 10); return (r >= 0 && r <= 20) ? r : 0; } catch (e) { return 0; } }
    function randSetze(p) {
        p = Math.max(0, Math.min(20, Math.round(p)));
        try { localStorage.setItem(K_RAND, String(p)); } catch (e) { }
        randAnwenden(); return p;
    }
    function randAnwenden() {
        var p = randHole();
        document.documentElement.style.setProperty('--aa-rand-x', Math.round(p / 100 * window.innerWidth) + 'px');
        document.documentElement.style.setProperty('--aa-rand-y', Math.round(p / 100 * window.innerHeight) + 'px');
        var r = document.getElementById('randZoom'); if (r) r.value = String(p);
        var o = document.getElementById('randZoomOut'); if (o) o.textContent = p + ' %';
    }
    function anwenden() {
        randAnwenden();
        var root = document.documentElement;
        try { var zj = zoomJetzt(); root.style.zoom = zj === 100 ? '' : String(zj / 100); } catch (e) { }
        var sp = document.getElementById('recordBtn');
        if (sp && sp.parentElement) sp.parentElement.classList.add('jv-hauptspalte');
        root.classList.toggle('jv-breit', breitJetzt());
        var r = document.getElementById('anzeigeZoom'); if (r) r.value = String(zoom);
        var o = document.getElementById('anzeigeZoomOut'); if (o) o.textContent = zoom + ' %';
        var s = document.getElementById('anzeigeLayout'); if (s) s.value = layout;
    }
    function setZoom(z) { zoom = Math.max(50, Math.min(120, Math.round(z))); schreibe(); anwenden(); }
    function setLayout(l) { layout = l; schreibe(); anwenden(); }

    var K_MUND = 'jv_mund_delay';
    function mundHole() { try { var w = parseInt(localStorage.getItem(K_MUND), 10); return (w >= 0 && w <= 2000) ? w : 250; } catch (e) { return 250; } }
    function mundSetze(ms) {
        ms = Math.max(0, Math.min(2000, Math.round(ms / 50) * 50));
        try { localStorage.setItem(K_MUND, String(ms)); } catch (e) { }
        var r = document.getElementById('mundVerz'); if (r) r.value = String(ms);
        var o = document.getElementById('mundVerzOut'); if (o) o.textContent = ms + ' ms';
        return ms;
    }
    function audioText() {
        try {
            var z = window.ZaneNative;
            if (!z || typeof z.audioAusgang !== 'function') return 'Das geht nur in der neuen APK.';
            var t = z.audioAusgang();
            return 'Ich sehe diese Ausgänge: ' + (t || 'keine') + '. ' + (z.audioExtern() ? 'Der Ton läuft über etwas Externes, der Mund wird um ' + mundHole() + ' Millisekunden verzögert.' : 'Der Ton läuft über das Handy, keine Verzögerung.');
        } catch (e) { return 'Das konnte ich nicht prüfen.'; }
    }
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
        m = t.match(/^(?:bitte )?(?:den )?rand (groesser|kleiner|breiter|schmaler|aus)$/);
        if (m) { var rp = m[1] === 'aus' ? 0 : randHole() + ((m[1] === 'groesser' || m[1] === 'breiter') ? 2 : -2); sagen('Rand ' + randSetze(rp) + ' Prozent.'); return true; }
        /* Spracherkennung versteht "Mund später" oft falsch ("und später", "Mundspäter", "Mund spät"): deshalb viele Schreibweisen */
        m = t.match(/^(?:bitte )?(?:mach )?(?:den )?(?:mund|und|mundbewegung|lippen|verzoegerung|mund verzoegerung)(?: verzoegerung)? (viel |ganz |etwas |bisschen )?(spaeter|spaet|frueher|frueh|mehr|weniger|hoeher|niedriger|langsamer|schneller)$/) ||
            t.match(/^(?:bitte )?(mund)(spaeter|frueher)$/);
        if (m) {
            var wort = m[2] || '', gross = /viel|ganz/.test(m[1] || ''), kl = /bisschen|etwas/.test(m[1] || '');
            var schritt = gross ? 200 : (kl ? 50 : 100);
            var plus = /^(spaeter|spaet|mehr|hoeher|langsamer)$/.test(wort);
            var v = mundSetze(mundHole() + (plus ? schritt : -schritt));
            sagen('Mund-Verzögerung ' + v + ' Millisekunden.'); return true;
        }
        if (/^(audio ausgang|audioausgang|wohin geht der ton|wo laeuft der ton)$/.test(t)) { sagen(audioText()); return true; }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('anzeige', befehl, 6.5);

    function binde() {
        var r = document.getElementById('anzeigeZoom');
        if (r) r.addEventListener('input', function () { setZoom(parseInt(r.value, 10)); });
        var s = document.getElementById('anzeigeLayout');
        if (s) s.addEventListener('change', function () { setLayout(s.value); });
        var rz = document.getElementById('randZoom');
        if (rz) rz.addEventListener('input', function () { randSetze(parseInt(rz.value, 10)); });
        var mv = document.getElementById('mundVerz');
        if (mv) { mv.value = String(mundHole()); var mo = document.getElementById('mundVerzOut'); if (mo) mo.textContent = mundHole() + ' ms'; mv.addEventListener('input', function () { mundSetze(parseInt(mv.value, 10)); }); }
        var ab = document.getElementById('audioInfo');
        if (ab) ab.addEventListener('click', function () { sagen(audioText()); });
        var b = document.getElementById('anzeigeInfo');
        if (b) b.addEventListener('click', function () { sagen(groesseText()); });
    }
    /* Großer Schließen-Knopf unten in der Mitte für Lagebild und andere Fenster: oben am Rand kommt am Autobildschirm kein Tippen an.
       Nur im breiten Layout oder bei offener Autoansicht (Lagebild kann über ihr liegen). */
    function zuKnopf() {
        var b = document.createElement('button');
        b.type = 'button'; b.id = 'anzeigeZu'; b.textContent = '✕ Schließen';
        b.style.cssText = 'display:none;position:fixed;left:50%;bottom:10px;transform:translateX(-50%);z-index:99999;min-width:220px;min-height:56px;padding:12px 28px;font:700 20px ui-monospace,monospace;color:#ffd6d6;background:rgba(60,10,14,.95);border:2px solid #ff6b6b;border-radius:10px';
        b.addEventListener('click', function () {
            try { if (window.jvLage && window.jvLage.isOpen()) { window.jvLage.close(); return; } } catch (e) { }
            try { if (typeof closePanel === 'function') closePanel(); } catch (e) { }
        });
        document.body.appendChild(b);
        knopfTakt = function () {
            var offen = false;
            try {
                var fenster = (window.jvLage && window.jvLage.isOpen()) || (typeof isPanelOpen === 'function' && isPanelOpen());
                var auto = !!(window.jvAutoansicht && window.jvAutoansicht.offen());   // Lagebild liegt oft über der offenen Autoansicht
                offen = !!fenster && (auto || document.documentElement.classList.contains('jv-breit'));
            } catch (e) { }
            b.style.display = offen ? 'block' : 'none';
        };
        taktSteuern(false);
    }
    /* Phase 6B.1: Beide Anzeige-Takte (Autoansicht 300 ms, Schließen-Knopf 400 ms) nur bei sichtbarer Seite. Versteckt pausieren sie;
       beim Sichtbarwerden läuft jeder einmal sofort (Zustand stimmt gleich) und danach im alten Takt. Je Takt höchstens eine Kennung. */
    var knopfTakt = null, autoId = 0, knopfId = 0;
    function autoTakt() { var a = autoOffen(); if (a !== zuletztAuto) { zuletztAuto = a; anwenden(); } }
    function taktSteuern(sichtbarGeworden) {
        if (document.hidden) {
            if (autoId) { clearInterval(autoId); autoId = 0; }
            if (knopfId) { clearInterval(knopfId); knopfId = 0; }
            return;
        }
        if (knopfTakt && !knopfId) knopfId = setInterval(knopfTakt, 400);
        if (!autoId) autoId = setInterval(autoTakt, 300);
        if (sichtbarGeworden) { autoTakt(); if (knopfTakt) knopfTakt(); }
    }
    document.addEventListener('visibilitychange', function () { taktSteuern(true); });
    taktSteuern(false);
    window.addEventListener('resize', anwenden);
    window.addEventListener('orientationchange', function () { setTimeout(anwenden, 200); });

    lies();
    function start() { binde(); anwenden(); zuKnopf(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    window.jvAnzeige = { setZoom: setZoom, setLayout: setLayout, text: groesseText };
})();
