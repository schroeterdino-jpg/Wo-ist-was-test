/* ============================================================
   JARVIS-FENSTER: ein gemeinsamer Stil für alle kleinen Fenster und Karten.
   Gilt für: Hinweis-Karten rechts am Rand (hud_fenster.js), Extrafenster (Mond, Feiertage ...), Lagebild, Weltuhr.
   Nicht betroffen: die großen Termin- und Listenfenster (panels.js).
   Aussehen: abgeschrägte Ecken, leuchtender Cyan-Rand, feine Scan-Linien, Titelzeile mit Leuchtpunkt, Segment-Balken,
   Strichskala und kleine Fußzeile. Warnungen (Glatteis, Unwetter, Fehler) leuchten orange.
   Diese Datei ändert nur das AUSSEHEN, an der Funktion der anderen Dateien ändert sich nichts.
   Aus- und einschalten: "Jarvis Fenster aus" / "Jarvis Fenster an" (dann sehen alle Fenster wieder so aus wie früher).
   Braucht: nichts. Wird in index.html nach den Fenster-Dateien geladen.
   ============================================================ */
(function () {
    'use strict';
    if (window.__jvFenster) return;
    window.__jvFenster = true;

    var KEY = 'jv_fenster_stil';
    function lsGet() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
    function lsSet(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }
    var an = lsGet() !== 'aus';

    var CH = '22px';   // Größe der abgeschrägten Ecke
    var ECKE = 'polygon(0 0,calc(100% - ' + CH + ') 0,100% ' + CH + ',100% 100%,' + CH + ' 100%,0 calc(100% - ' + CH + '))';
    var ECKE_KLEIN = 'polygon(0 0,calc(100% - 8px) 0,100% 8px,100% 100%,8px 100%,0 calc(100% - 8px))';
    var GLAS = 'linear-gradient(160deg,rgba(7,28,44,.86),rgba(3,10,18,.92))';
    var RAND = 'linear-gradient(135deg,rgba(var(--jc),.95),rgba(var(--jc),.25) 38%,rgba(var(--jc),.8) 62%,rgba(var(--jc),.3))';
    var SCAN = 'repeating-linear-gradient(0deg,rgba(var(--jc),.05) 0 1px,transparent 1px 4px)';
    var DIAG_O = 'linear-gradient(45deg,transparent calc(50% - 1px),rgba(var(--jc),.95) calc(50% - 1px),rgba(var(--jc),.95) calc(50% + .5px),transparent calc(50% + .5px))';
    var DIAG_U = 'linear-gradient(225deg,transparent calc(50% - 1px),rgba(var(--jc),.95) calc(50% - 1px),rgba(var(--jc),.95) calc(50% + .5px),transparent calc(50% + .5px))';

    /* Gemeinsamer Fensterrahmen (Rand über "border-box"-Hintergrund, Ecken über clip-path, Diagonalen über :before/:after) */
    function rahmen(sel, extra) {
        return sel + '{--jc:73,215,255;position:relative;border:1.5px solid transparent!important;border-radius:0!important;' +
            'background:' + GLAS + ' padding-box,' + RAND + ' border-box!important;' +
            'clip-path:' + ECKE + '!important;box-shadow:none!important;' + (extra || '') + '}' +
            sel + ':before{content:"";position:absolute;right:0;top:0;width:' + CH + ';height:' + CH + ';background:' + DIAG_O + ';pointer-events:none;border:0!important;left:auto!important;bottom:auto!important}' +
            sel + ':after{content:"";position:absolute;left:0;bottom:0;width:' + CH + ';height:' + CH + ';background:' + DIAG_U + ';pointer-events:none;border:0!important;right:auto!important;top:auto!important}';
    }

    var CSS = '';
    /* ---------- 1) Hinweis-Karten rechts am Rand ---------- */
    CSS += 'html body #jvPan .jvP{padding:10px 13px 11px;filter:drop-shadow(0 0 8px rgba(var(--jc),.35))}';
    CSS += rahmen('html body #jvPan .jvP', 'backdrop-filter:blur(6px);');
    CSS += 'html body #jvPan .jvP.warn{--jc:255,176,64}';
    CSS += 'html body #jvPan .jvP .k{font-size:10px;letter-spacing:3px;color:#aeeeff;text-shadow:0 0 8px rgba(var(--jc),.9);align-items:center}' +
        'html body #jvPan .jvP .k span:first-child:before{content:"";display:inline-block;width:6px;height:6px;margin-right:8px;background:rgb(var(--jc));box-shadow:0 0 8px rgb(var(--jc));transform:rotate(45deg);vertical-align:1px}' +
        'html body #jvPan .jvP .k span:last-child{color:rgba(var(--jc),.85);letter-spacing:2px}' +
        'html body #jvPan .jvP .g{text-shadow:0 0 12px rgb(var(--jc))}' +
        'html body #jvPan .jvP .bar{background:rgba(var(--jc),.18)}html body #jvPan .jvP .bar i{background:rgb(var(--jc));box-shadow:0 0 8px rgb(var(--jc))}';

    /* ---------- 2) Extrafenster (Mond, Feiertage ...) ---------- */
    CSS += rahmen('html body #extraFenster', 'overflow-y:auto;filter:none;');
    CSS += 'html body #extraFensterLayer{background:rgba(2,8,14,.7)!important}';
    CSS += 'html body #extraFenster{filter:drop-shadow(0 0 12px rgba(73,215,255,.3));animation:xwIn .28s ease-out}';
    CSS += 'html body #extraFenster>div:first-child{background:transparent!important;border-bottom:0!important;padding:12px 14px 6px!important;position:sticky;top:0}' +
        'html body #extraFenster>div:first-child>span:first-child{font-size:13px!important;letter-spacing:4px!important;color:#aeeeff!important;font-weight:600!important;text-shadow:0 0 10px rgba(73,215,255,.9)}' +
        'html body #extraFenster>div:first-child>span:first-child:before{content:"";display:inline-block;width:7px;height:7px;margin-right:9px;background:#49d7ff;box-shadow:0 0 10px #49d7ff;transform:rotate(45deg);vertical-align:1px}' +
        'html body #extraFenster>div:first-child button{width:30px;height:30px;padding:0!important;border:1px solid rgba(73,215,255,.7)!important;border-radius:0!important;background:rgba(73,215,255,.1)!important;color:#49d7ff!important;clip-path:' + ECKE_KLEIN + '}' +
        'html body #extraFensterBody{position:relative}' +
        'html body #extraFensterBody:before{content:"";display:block;height:9px;margin:-4px 0 8px;background:repeating-linear-gradient(90deg,rgba(73,215,255,.7) 0 1px,transparent 1px 7px);-webkit-mask:linear-gradient(90deg,#000,transparent);mask:linear-gradient(90deg,#000,transparent);opacity:.7}';

    /* ---------- 3) Lagebild ---------- */
    CSS += 'html body #jvLage .kopf b{font-size:15px;letter-spacing:4px;color:#aeeeff;text-shadow:0 0 10px rgba(73,215,255,.9);font-weight:600}' +
        'html body #jvLage .kopf b:before{content:"";display:inline-block;width:7px;height:7px;margin-right:9px;background:#49d7ff;box-shadow:0 0 10px #49d7ff;transform:rotate(45deg);vertical-align:2px}' +
        'html body #jvLage .x,html body #jvLage .knoepfe button{border-radius:0!important;border:1px solid rgba(73,215,255,.7)!important;background:rgba(73,215,255,.1)!important;clip-path:' + ECKE_KLEIN + '}' +
        'html body #jvLage .knoepfe button.p{background:#49d7ff!important;color:#02070d!important}';
    CSS += rahmen('html body #jvLage .k', 'padding:10px 14px 11px;margin-bottom:12px;');
    CSS += 'html body #jvLage .k .t{letter-spacing:3px;color:rgba(73,215,255,.9)}' +
        'html body #jvLage .k .t span:first-child{color:#aeeeff;text-shadow:0 0 8px rgba(73,215,255,.8)}';
    CSS += 'html body #jvLage .k.tap:active{background:rgba(20,60,80,.8) padding-box,' + RAND + ' border-box!important}';

    /* ---------- 4) Weltuhr ---------- */
    CSS += 'html body #jvWeltuhr .wu-title{letter-spacing:.3em;color:#aeeeff;text-shadow:0 0 10px rgba(73,215,255,.9)}' +
        'html body #jvWeltuhr .wu-title:before{content:"";display:inline-block;width:7px;height:7px;margin-right:12px;background:#49d7ff;box-shadow:0 0 10px #49d7ff;transform:rotate(45deg);vertical-align:3px}';
    CSS += rahmen('html body #jvWeltuhr .wu-tile', 'padding:11px 14px 12px;');
    CSS += 'html body #jvWeltuhr .wu-tile.home{--jc:94,231,255}' +
        'html body #jvWeltuhr .wu-t{text-shadow:0 0 12px rgba(73,215,255,.8)}' +
        'html body #jvWeltuhr .wu-btn{border-radius:0!important;border:1px solid rgba(73,215,255,.7)!important;background:rgba(73,215,255,.1)!important;clip-path:' + ECKE_KLEIN + '}' +
        'html body #jvWeltuhr .wu-btn.primary{background:rgba(73,215,255,.3)!important}';

    /* ---------- Segment-Balken und Fußzeile (kommen per Skript dazu) ---------- */
    CSS += '.jvseg{display:inline-flex;gap:3px;margin-left:10px;vertical-align:middle}.jvseg i{width:16px;height:4px;background:rgba(73,215,255,.85)}.jvseg i:nth-child(2){opacity:.55}.jvseg i:nth-child(3){opacity:.3}' +
        '.jvfuss{display:flex;justify-content:space-between;padding:6px 16px 10px;font:9px ui-monospace,Menlo,monospace;letter-spacing:2px;color:rgba(73,215,255,.65)}';

    var styleEl = null;
    function stilSetzen() {
        if (!an) { if (styleEl) { try { styleEl.remove(); } catch (e) {} styleEl = null; } document.body && document.body.classList.remove('jv-fenster'); return; }
        if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'jvFensterCss'; styleEl.textContent = CSS; document.head.appendChild(styleEl); }
    }

    /* ---------- Schmuck einbauen, sobald ein Fenster auftaucht ---------- */
    function seg() { var s = document.createElement('span'); s.className = 'jvseg'; s.innerHTML = '<i></i><i></i><i></i>'; return s; }
    function fuss(txt) { var f = document.createElement('div'); f.className = 'jvfuss'; var a = document.createElement('span'); a.textContent = txt; var b = document.createElement('span'); b.textContent = '● ONLINE'; f.appendChild(a); f.appendChild(b); return f; }
    function schmuecken(n) {
        if (!an || !n || n.nodeType !== 1 || n.__jvs) return;
        try {
            if (n.id === 'extraFensterLayer') {
                n.__jvs = 1;
                var fw = n.querySelector('#extraFenster'), t = fw && fw.querySelector('span');
                if (t) t.parentNode.insertBefore(seg(), t.nextSibling), (t.parentNode.style.justifyContent = 'flex-start'), (fw.querySelector('button').style.marginLeft = 'auto');
                if (fw) fw.appendChild(fuss('NOVA // ' + ((t && t.textContent) || 'HUD').toUpperCase()));
            } else if (n.id === 'jvLage') {
                n.__jvs = 1;
                var b = n.querySelector('.kopf b'); if (b) b.appendChild(seg());
                var inn = n.querySelector('.in'); if (inn) inn.appendChild(fuss('NOVA // LAGE'));
            } else if (n.id === 'jvWeltuhr') {
                n.__jvs = 1;
                var tt = n.querySelector('.wu-title'); if (tt) tt.appendChild(seg());
            }
        } catch (e) {}
    }
    function beobachten() {
        if (!document.body) return;
        new MutationObserver(function (list) {
            list.forEach(function (m) { m.addedNodes && m.addedNodes.forEach(schmuecken); });
        }).observe(document.body, { childList: true });
        ['extraFensterLayer', 'jvLage', 'jvWeltuhr'].forEach(function (id) { schmuecken(document.getElementById(id)); });
    }

    /* ---------- Warnungen orange ---------- */
    function warnungPruefen() {
        var jp = window.jvPanel;
        if (!jp || typeof jp.zeigen !== 'function' || jp.__jvw) return;
        var orig = jp.zeigen; jp.__jvw = true;
        jp.zeigen = function (o) {
            var r = orig.apply(this, arguments);
            try {
                var warn = o && (/warn|unwetter|glatteis|achtung|alarm|fehler|problem/i.test(String(o.titel || '') + ' ' + String(o.zeit || '')) ||
                    (Array.isArray(o.zeilen) && o.zeilen.length && o.zeilen.every(function (z) { return z && z.ok === false; })));
                if (warn) { var box = document.getElementById('jvPan'); var l = box && box.lastElementChild; if (l) l.classList.add('warn'); }
            } catch (e) {}
            return r;
        };
    }

    /* ---------- Sprache ---------- */
    function sagen(t) { try { if (typeof speak === 'function') speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') {
        window.jvCommands.use('jvfenster', function (text, next) {
            var t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            var m = t.match(/^(?:(?:jarvis|zane|nova) )?(?:(?:schalte? |mach )?(?:den )?)?(?:jarvis[- ]?(?:stil|fenster|look)|fenster[- ]?(?:stil|look)) (an|aus|ein)(?:schalten)?$/);
            if (!m) return next(text);
            an = m[1] !== 'aus'; lsSet(an ? 'an' : 'aus'); stilSetzen();
            sagen(an ? 'Die Fenster haben wieder den Jarvis-Stil.' : 'Die Fenster sehen wieder aus wie früher.');
            return true;
        }, 160);
    }

    function start() { stilSetzen(); beobachten(); warnungPruefen(); setTimeout(warnungPruefen, 1500); setTimeout(warnungPruefen, 5000); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
