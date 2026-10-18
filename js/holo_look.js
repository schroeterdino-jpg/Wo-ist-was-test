/* HOLO-LOOK: Der 3D-Kopf wird zum durchsichtigen Cyan-Hologramm, dahinter ein Iron-Man-HUD:
   drehende Ringe mit Strichskala, Eckklammern, Hologramm-Boden mit Raster und Lichtstrahl, Staubpartikel.
   - Kopf: nur per CSS (Farbfilter, Durchsichtigkeit, heller Rand, feine Scanlinien) - der Kopf selbst bleibt unverändert.
   - Hintergrund: zwei eigene Canvas hinter dem Kopf (eine ruhende Ebene, eine bewegte).
   - Reagiert auf Zane: beim Sprechen drehen die Ringe schneller und leuchten stärker, beim Zuhören etwas.
   - Die alte Glaskugel samt Scan-Strahl ("Puls" übers Auge) sitzt in avatar3d.js und ist dort abgeschaltet.
   - Nur sichtbar, solange die Ansicht "Kopf" aktiv ist (Kugel und Gehirn bleiben unberührt).
   - Effekt-Stufen aus den Einstellungen werden beachtet: "Aus" und "Hintergrund aus" zeichnen nur ein ruhiges Bild.
   - Per Sprache abschaltbar: "Hologramm aus" / "Hologramm an" (gespeichert unter jv_holo). */
(function () {
    'use strict';

    var KEY = 'jv_holo';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    var an = lsGet(KEY) !== 'aus';
    var holder = null, cBack = null, cFront = null, xBack = null, xFront = null, scan = null;
    var W = 400, DPR = 1, t0 = performance.now(), lastDraw = 0, speak = 0, listen = 0, think = 0, raf = 0, running = false;

    var CYAN = '38,209,255', ICE = '153,247,255', DEEP = '10,110,200';
    var STRAHL = false;   /* true = Lichtstrahl von der Plattform nach oben wieder an */

    /* ---------- CSS ---------- */
    var css = document.createElement('style');
    css.textContent =
        /* Kopf: durchsichtig, Cyan, heller Rand */
        'body.jv-holo #jarvisAvatar3D{opacity:.5;' +
        'filter:grayscale(1) brightness(.92) contrast(1.6) sepia(1) hue-rotate(160deg) saturate(7) ' +
        'drop-shadow(0 0 2px rgba(170,250,255,.95)) drop-shadow(0 0 9px rgba(0,190,255,.75));' +
        '-webkit-mask-image:none;mask-image:none}' +
        /* feine Scanlinien über dem Kopf (ruhend, kein Flackern) */
        '.jv-holo-scan{position:absolute;left:0;top:0;width:100%;height:100%;z-index:5;pointer-events:none;display:none;' +
        'background:repeating-linear-gradient(to bottom,rgba(0,0,0,0) 0,rgba(0,0,0,0) 2px,rgba(0,12,24,.13) 2px,rgba(0,12,24,.13) 3px);' +
        '-webkit-mask-image:radial-gradient(closest-side,#000 62%,transparent 92%);mask-image:radial-gradient(closest-side,#000 62%,transparent 92%)}' +
        'body.jv-holo.jv-holo-head .jv-holo-scan{display:block}' +
        '.jv-holo-bg{position:absolute;left:50%;top:50%;pointer-events:none;z-index:3;display:none}' +
        'body.jv-holo.jv-holo-head .jv-holo-bg{display:block}';
    document.head.appendChild(css);

    /* ---------- Aufbau ---------- */
    function mount() {
        holder = document.querySelector('.holo-container');
        if (!holder) return false;
        cBack = document.createElement('canvas'); cBack.className = 'jv-holo-bg'; cBack.id = 'jvHoloBack';
        cFront = document.createElement('canvas'); cFront.className = 'jv-holo-bg'; cFront.id = 'jvHoloFront';
        scan = document.createElement('div'); scan.className = 'jv-holo-scan';
        holder.insertBefore(cBack, holder.firstChild);
        holder.insertBefore(cFront, cBack.nextSibling);
        holder.appendChild(scan);
        xBack = cBack.getContext('2d'); xFront = cFront.getContext('2d');
        resize();
        window.addEventListener('resize', resize);
        document.addEventListener('visibilitychange', kick);
        return true;
    }

    function resize() {
        W = Math.max(280, Math.min(window.innerWidth || 412, 520));
        DPR = Math.min(window.devicePixelRatio || 1, 2);
        [cBack, cFront].forEach(function (c) {
            c.width = Math.round(W * DPR); c.height = Math.round(W * DPR);
            c.style.width = W + 'px'; c.style.height = W + 'px';
            c.style.marginLeft = (-W / 2) + 'px'; c.style.marginTop = (-W / 2) + 'px';
        });
        drawBack();
        drawFront(performance.now());
    }

    /* ---------- Ruhende Ebene: Schein, Boden, Raster, Strahl, Eckklammern ---------- */
    function drawBack() {
        var c = xBack; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, W);
        var cx = W / 2, cy = W / 2, fy = cy + W * 0.385;
        c.globalCompositeOperation = 'lighter';

        /* weicher Schein hinter dem Kopf */
        var g = c.createRadialGradient(cx, cy, 0, cx, cy, W * 0.46);
        g.addColorStop(0, 'rgba(' + DEEP + ',.34)'); g.addColorStop(.55, 'rgba(10,70,150,.14)'); g.addColorStop(1, 'rgba(0,30,80,0)');
        c.fillStyle = g; c.fillRect(0, 0, W, W);

        if (STRAHL) {
        /* Lichtstrahl von der Boden-Plattform nach oben */
        var bw = W * 0.175, tw = W * 0.28, top = cy - W * 0.32;
        var bg = c.createLinearGradient(0, fy, 0, top);
        bg.addColorStop(0, 'rgba(' + CYAN + ',.34)'); bg.addColorStop(.6, 'rgba(' + CYAN + ',.10)'); bg.addColorStop(1, 'rgba(' + CYAN + ',0)');
        c.fillStyle = bg;
        c.beginPath(); c.moveTo(cx - bw, fy); c.lineTo(cx + bw, fy); c.lineTo(cx + tw, top); c.lineTo(cx - tw, top); c.closePath(); c.fill();
        /* feine senkrechte Streifen im Strahl */
        c.strokeStyle = 'rgba(' + CYAN + ',.10)'; c.lineWidth = 1;
        for (var i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(cx + i * bw / 6.5, fy); c.lineTo(cx + i * tw / 6.5, top); c.stroke(); }

        }

        /* Boden-Raster (Perspektive) */
        c.save();
        c.beginPath(); c.ellipse(cx, fy + W * 0.02, W * 0.5, W * 0.15, 0, 0, Math.PI * 2); c.clip();
        c.strokeStyle = 'rgba(' + CYAN + ',.34)'; c.lineWidth = 1;
        for (var k = 0; k < 9; k++) {
            var y = fy - W * 0.03 + W * 0.0085 * Math.pow(k, 1.55);
            c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke();
        }
        for (var j = -14; j <= 14; j++) {
            c.beginPath(); c.moveTo(cx + j * W * 0.0285, fy - W * 0.05); c.lineTo(cx + j * W * 0.109, fy + W * 0.28); c.stroke();
        }
        c.restore();

        /* Boden-Ringe mit Leuchten */
        [[.16, 1, 2.2], [.244, .8, 1.6], [.345, .6, 1.4], [.454, .42, 1.2]].forEach(function (r) {
            var rx = r[0] * W, ry = rx * 0.24;
            c.save(); c.shadowColor = 'rgba(' + CYAN + ',.9)'; c.shadowBlur = 10;
            c.strokeStyle = 'rgba(' + CYAN + ',' + r[1] + ')'; c.lineWidth = r[2];
            c.beginPath(); c.ellipse(cx, fy, rx, ry, 0, 0, Math.PI * 2); c.stroke(); c.restore();
        });

        /* Eckklammern */
        c.save(); c.strokeStyle = 'rgba(' + ICE + ',.85)'; c.lineWidth = 2; c.shadowColor = 'rgba(' + CYAN + ',.9)'; c.shadowBlur = 6;
        var bx = W * 0.395, by = W * 0.47, bl = W * 0.06;
        [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (s) {
            var x = cx + s[0] * bx, y = cy + s[1] * by;
            c.beginPath(); c.moveTo(x - s[0] * bl, y); c.lineTo(x, y); c.lineTo(x, y - s[1] * bl); c.stroke();
        });
        c.restore();

        /* feines Fadenkreuz */
        c.strokeStyle = 'rgba(' + CYAN + ',.22)'; c.lineWidth = 1;
        [0, 90, 180, 270].forEach(function (a) {
            var t = a * Math.PI / 180;
            c.beginPath(); c.moveTo(cx + Math.cos(t) * W * 0.25, cy + Math.sin(t) * W * 0.25); c.lineTo(cx + Math.cos(t) * W * 0.5, cy + Math.sin(t) * W * 0.5); c.stroke();
        });
        c.globalCompositeOperation = 'source-over';
    }

    /* ---------- Bewegte Ebene: Ringe, Skala, Partikel, Sprech-Leuchten ---------- */
    var RINGS = [  /* Radius (Anteil an W), Start, Ende (Grad), Dicke, Stärke, Tempo (Grad pro Sekunde) */
        [.31, 0, 360, 1, .30, 5], [.335, 20, 150, 3.2, .9, -24], [.335, 200, 330, 1.8, .55, -24], [.365, -30, 70, 1.4, .8, 16],
        [.365, 100, 250, 1.4, .5, 16], [.40, 0, 360, .8, .40, 0], [.43, 60, 200, 3.6, .85, 10], [.43, 230, 350, 1.4, .55, 10],
        [.468, -20, 110, 2, .7, -7], [.468, 150, 300, 1.2, .45, -7]
    ];
    var parts = [];
    for (var pi = 0; pi < 34; pi++) parts.push({ x: Math.random(), y: Math.random(), v: .01 + Math.random() * .03, r: .6 + Math.random() * 1.4, a: .3 + Math.random() * .6 });

    function ticks(c, cx, cy, r, n, len, rot, alpha) {
        c.strokeStyle = 'rgba(' + ICE + ',' + alpha + ')'; c.lineWidth = 1; c.beginPath();
        for (var i = 0; i < n; i++) {
            var a = i / n * Math.PI * 2 + rot, l = (i % 5 === 0) ? len * 1.8 : len;
            c.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); c.lineTo(cx + Math.cos(a) * (r + l), cy + Math.sin(a) * (r + l));
        }
        c.stroke();
    }

    function drawFront(now) {
        var c = xFront; c.setTransform(DPR, 0, 0, DPR, 0, 0); c.clearRect(0, 0, W, W);
        var t = (now - t0) / 1000, cx = W / 2, cy = W / 2;
        var boost = 1 + speak * 1.6 + listen * .6 + think * 1.5, lum = 1 + speak * .55 + listen * .25 + think * .45;
        /* Farbe nach Zustand: Ruhe cyan, Denken orange, Sprechen violett */
        function mix(a, b, k) { return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]; }
        var cc = mix(mix([38, 209, 255], [255, 160, 40], think), [185, 105, 255], speak);
        var ic = mix(mix([153, 247, 255], [255, 225, 140], think), [255, 170, 245], speak);
        var CYAN = Math.round(cc[0]) + ',' + Math.round(cc[1]) + ',' + Math.round(cc[2]);
        var ICE = Math.round(ic[0]) + ',' + Math.round(ic[1]) + ',' + Math.round(ic[2]);
        var wk = Math.min(1, think + speak), fy = cy + W * 0.385;
        c.globalCompositeOperation = 'lighter';

        /* pulsierendes Leuchten hinter dem Kopf beim Sprechen */
        if (speak > .02 || listen > .02) {
            var p = speak * (.55 + .2 * Math.sin(now * .012)) + listen * .25;
            var g = c.createRadialGradient(cx, cy, W * .1, cx, cy, W * .42);
            g.addColorStop(0, 'rgba(' + CYAN + ',' + (.30 * p) + ')'); g.addColorStop(1, 'rgba(' + CYAN + ',0)');
            c.fillStyle = g; c.fillRect(0, 0, W, W);
        }

        /* Ringe: erst breit und blass (Leuchten), dann scharf */
        RINGS.forEach(function (r) {
            var rot = (t * r[5] * boost) * Math.PI / 180, rad = r[0] * W;
            var a0 = r[1] * Math.PI / 180 + rot, a1 = r[2] * Math.PI / 180 + rot;
            c.lineCap = 'round';
            c.strokeStyle = 'rgba(' + CYAN + ',' + Math.min(1, r[4] * .22 * lum) + ')'; c.lineWidth = r[3] * 4.2;
            c.beginPath(); c.arc(cx, cy, rad, a0, a1); c.stroke();
            c.strokeStyle = 'rgba(' + CYAN + ',' + Math.min(1, r[4] * lum) + ')'; c.lineWidth = r[3];
            c.beginPath(); c.arc(cx, cy, rad, a0, a1); c.stroke();
        });
        /* Skalen */
        ticks(c, cx, cy, W * .385, 120, W * .011, t * .02 * boost, .5 * Math.min(1.3, lum));
        ticks(c, cx, cy, W * .445, 180, W * .0065, -t * .015 * boost, .34 * Math.min(1.3, lum));

        /* Plattform: Ringe in Zustandsfarbe, Equalizer, aufsteigende Funken (nur beim Denken und Sprechen) */
        if (wk > .02) {
            [[.16, 1, 2.2], [.244, .8, 1.6], [.345, .6, 1.4], [.454, .42, 1.2]].forEach(function (r) {
                var rx = r[0] * W;
                c.save(); c.shadowColor = 'rgba(' + CYAN + ',.9)'; c.shadowBlur = 10;
                c.strokeStyle = 'rgba(' + CYAN + ',' + (r[1] * wk) + ')'; c.lineWidth = r[2];
                c.beginPath(); c.ellipse(cx, fy, rx, rx * 0.24, 0, 0, Math.PI * 2); c.stroke(); c.restore();
            });
            var NB = 17, bx0 = cx - W * .40, bstep = W * .80 / (NB - 1);
            c.save(); c.shadowColor = 'rgba(' + CYAN + ',.95)'; c.shadowBlur = 8; c.fillStyle = 'rgba(' + ICE + ',' + (.9 * wk) + ')';
            for (var bi = 0; bi < NB; bi++) {
                var lvS = Math.abs(Math.sin(now * .011 + bi * 1.37)) * (.35 + .65 * Math.abs(Math.sin(now * .0043 + bi * .71)));
                var lvT = .12 + .5 * Math.max(0, Math.sin(now * .0035 - bi * .45));
                var lv = lvS * speak + lvT * think * (1 - speak);
                var bh = Math.max(2, W * .13 * lv * Math.sin(Math.PI * (.15 + .7 * bi / (NB - 1))));
                c.fillRect(bx0 + bi * bstep - 2.2, fy - bh, 4.4, bh);
            }
            c.restore();
            c.fillStyle = 'rgba(' + ICE + ',1)';
            for (var ei = 0; ei < 46; ei++) {
                var ph = (ei * 0.6180339) % 1, vv = .10 + ((ei * 0.37) % 1) * .16;
                var ey = fy - ((ph + t * vv * (1 + think)) % 1) * W * .66, ex = cx + (((ei * 0.7548) % 1) - .5) * W * .86 + Math.sin(t * 1.3 + ei) * 6;
                c.globalAlpha = wk * (.25 + .65 * (1 - (fy - ey) / (W * .66))); c.beginPath(); c.arc(ex, ey, .8 + ((ei * 0.29) % 1) * 1.8, 0, Math.PI * 2); c.fill();
            }
            c.globalAlpha = 1;
        }

        /* Staub */
        c.fillStyle = 'rgba(' + ICE + ',1)';
        parts.forEach(function (p) {
            var y = ((p.y - t * p.v * boost) % 1 + 1) % 1;
            c.globalAlpha = p.a * .8; c.beginPath(); c.arc(p.x * W, y * W, p.r, 0, Math.PI * 2); c.fill();
        });
        c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
    }

    /* ---------- Takt ---------- */
    function headActive() { return !!(window.jvAvatar3D && window.jvAvatar3D.active); }
    function fxStatic() {
        var h = document.documentElement;
        return h.dataset.fx === 'off' || h.classList.contains('nofx-bg') || h.classList.contains('nofx-motion');
    }
    function applyBody() {
        var b = document.body; if (!b) return;
        b.classList.toggle('jv-holo', an);
        b.classList.toggle('jv-holo-head', an && headActive());
    }
    function frame(now) {
        raf = 0;
        applyBody();
        var show = an && headActive();
        if (!show || document.hidden) { running = false; return; }
        if (document.body.classList.contains('panel-open') || fxStatic()) { running = false; drawFront(now); return; }
        var st = window.jvAvatar3D.state;
        speak += ((st === 'speaking' ? 1 : 0) - speak) * .12;
        listen += ((st === 'listening' ? 1 : 0) - listen) * .12;
        think += ((st === 'thinking' ? 1 : 0) - think) * .10;
        var fps = document.documentElement.dataset.fx === 'full' ? 30 : 24;
        if (now - lastDraw >= 1000 / fps - 2) { lastDraw = now; drawFront(now); }
        raf = requestAnimationFrame(frame);
    }
    function kick() { applyBody(); if (!raf && an && headActive() && !document.hidden) { running = true; raf = requestAnimationFrame(frame); } }

    /* Zustandswechsel (Ansicht, Fenster auf/zu) bemerken, ohne den Takt dauernd laufen zu lassen */
    setInterval(function () { applyBody(); if (!raf) kick(); }, 700);

    /* ---------- Sprache ---------- */
    var RX_AUS = /^(?:bitte\s+)?(?:hologramm(?:\s*-?\s*(?:look|effekt|modus))?\s+(?:aus|ausschalten|abschalten)|kein\s+hologramm|(?:schalte|mach)\s+(?:das\s+)?hologramm\s+aus)$/;
    var RX_AN = /^(?:bitte\s+)?(?:hologramm(?:\s*-?\s*(?:look|effekt|modus))?\s+(?:an|einschalten|anschalten)|(?:schalte|mach)\s+(?:das\s+)?hologramm\s+an)$/;
    function handle(text) {
        var t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 50) return false;
        if (RX_AUS.test(t)) { an = false; lsSet(KEY, 'aus'); applyBody(); return true; }
        if (RX_AN.test(t)) { an = true; lsSet(KEY, 'an'); applyBody(); kick(); return true; }
        return false;
    }
    window.handleHoloCommand = handle;
    window.jvHolo = { set: function (on) { an = !!on; lsSet(KEY, an ? 'an' : 'aus'); applyBody(); kick(); }, get on() { return an; }, redraw: function () { resize(); } };
    function registerCommand() {
        if (!window.jvCommands) return false;
        window.jvCommands.use('holo', function (text, next) { try { if (handle(text)) return true; } catch (e) {} return next(text); }, 150);
        return true;
    }
    if (!registerCommand()) document.addEventListener('DOMContentLoaded', registerCommand);

    function start() { if (mount()) kick(); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
