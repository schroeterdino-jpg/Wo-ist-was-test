/* ============================================================
   J.A.R.V.I.S. KUGEL v2 — Grün-Gold-Edition für js/sphere.js
   ============================================================ */
(function () {
    'use strict';
    var TAU = Math.PI * 2;
    var FOCAL = 620;
    
    // HIER ANGEPASST: Die Kernfarben auf Grün & Gold getrimmt
    var STATE_PARAMS = {
        idle: { core: [0, 205, 100], rotSpeed: 0.22, deformBase: 0.012, deformGain: 0.06, waveSpeed: 0.35, breatheFreq: 0.30, breatheAmount: 0.05, radiusBoost: 0.02, dustSpread: 0.10, swirlBoost: 0.2 },
        listening: { core: [245, 176, 66], rotSpeed: 0.32, deformBase: 0.02, deformGain: 0.26, waveSpeed: 0.80, breatheFreq: 0.50, breatheAmount: 0.03, radiusBoost: 0.09, dustSpread: 0.30, swirlBoost: 0.7 }, // Gold beim Zuhören!
        thinking: { core: [0, 230, 140], rotSpeed: 1.10, deformBase: 0.05, deformGain: 0.12, waveSpeed: 1.70, breatheFreq: 0.85, breatheAmount: 0.06, radiusBoost: 0.00, dustSpread: 0.18, swirlBoost: 2.6 },
        speaking: { core: [16, 185, 129], rotSpeed: 0.38, deformBase: 0.05, deformGain: 0.32, waveSpeed: 2.00, breatheFreq: 0.00, breatheAmount: 0.00, radiusBoost: 0.11, dustSpread: 0.36, swirlBoost: 1.2 }
    };
    
    var GOLD = [245, 176, 66];
    var GOLD_BRIGHT = [253, 227, 152];

    function rgba(rgb, a) {
        return 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a.toFixed(3) + ')';
    }

    function makeGlowSprite(rgb) {
        var s = 64, c = document.createElement('canvas');
        c.width = s; c.height = s;
        var g = c.getContext('2d');
        var grad = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(0.22, 'rgba(' + rgb + ',0.9)');
        grad.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, s, s);
        return c;
    }

    function createJarvisOrb(canvas, opts) {
        opts = opts || {};
        if (!canvas || !canvas.getContext) return null;
        var ctx = canvas.getContext('2d');
        if (!ctx) return null;
        var reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        var w = 0, h = 0, cx = 0, cy = 0, R = 0, dpr = 1, bg = null;
        var filaments = [], dust = [], lines = [], rings = [];
        var spriteCache = {};
        var params = JSON.parse(JSON.stringify(STATE_PARAMS.idle));
        var core = STATE_PARAMS.idle.core.slice();
        var state = 'idle', amp = 0, prevAmp = 0, eruption = 0, ringCooldown = 0;
        var angle = 0, time = 0, density = 1, intensity = 1;
        var running = false, raf = 0, lastNow = 0, observer = null;
        var analyser = null, micData = null;

        function resize() {
            var rect = canvas.getBoundingClientRect();
            w = Math.max(1, rect.width || canvas.width);
            h = Math.max(1, rect.height || canvas.height);
            if (Math.abs(w - h) > 4) h = w;
            dpr = Math.min(window.devicePixelRatio || 1, 2);
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            canvas.style.width = w + 'px';
            canvas.style.height = h + 'px';
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
            cx = w / 2; cy = h / 2;
            R = Math.min(w, h) * 0.30;
            buildBackground();
        }

        function buildParticles() {
            var sizeScale = Math.min(1.25, Math.max(0.45, Math.min(w, h) / 520));
            var fCount = Math.max(60, Math.round(300 * density * sizeScale));
            var ga = Math.PI * (3 - Math.sqrt(5));
            filaments = [];
            for (var i = 0; i < fCount; i++) {
                var y = 1 - (i / (fCount - 1)) * 2;
                var rad = Math.sqrt(Math.max(0, 1 - y * y));
                var th = ga * i;
                filaments.push({
                    x: Math.cos(th) * rad,
                    y: y,
                    z: Math.sin(th) * rad,
                    size: 1.0 + Math.random() * 1.2,
                    twinklePhase: Math.random() * TAU,
                    twinkleSpeed: 0.6 + Math.random() * 1.4
                });
            }
            lines = [];
            var minDot = Math.cos(0.38), maxLines = Math.round(720 * Math.max(0.5, sizeScale));
            for (var a = 0; a < filaments.length && lines.length < maxLines; a++) {
                for (var b = a + 1; b < filaments.length; b++) {
                    if (filaments[a].x * filaments[b].x + filaments[a].y * filaments[b].y + filaments[a].z * filaments[b].z > minDot) {
                        lines.push([a, b]);
                        if (lines.length >= maxLines) break;
                    }
                }
            }
            var dCount = Math.max(90, Math.round(460 * density * sizeScale));
            dust = [];
            for (var j = 0; j < dCount; j++) {
                dust.push({
                    lon: Math.random() * TAU,
                    lat: Math.asin(2 * Math.random() - 1),
                    rBase: 1.03 + 0.55 * Math.pow(Math.random(), 1.6),
                    orbit: (0.04 + Math.random() * 0.16) * (Math.random() < 0.5 ? 1 : -1),
                    size: 0.9 + Math.random() * 1.7,
                    twinklePhase: Math.random() * TAU,
                    twinkleSpeed: 0.5 + Math.random() * 1.6,
                    bright: Math.random() < 0.4,
                    kick: 0
                });
            }
        }

        function buildBackground() {
            bg = document.createElement('canvas');
            bg.width = Math.round(w * dpr);
            bg.height = Math.round(h * dpr);
            var g = bg.getContext('2d');
            g.setTransform(dpr, 0, 0, dpr, 0, 0);
            for (var i = 0; i < 110; i++) {
                g.fillStyle = 'rgba(76,255,150,' + (0.03 + Math.random() * 0.15).toFixed(3) + ')';
                g.beginPath();
                g.arc(Math.random() * w, Math.random() * h, 0.3 + Math.random(), 0, TAU);
                g.fill();
            }
            var vig = g.createRadialGradient(cx, cy, Math.min(w, h) * 0.35, cx, cy, Math.max(w, h) * 0.75);
            vig.addColorStop(0, 'rgba(0,0,0,0)');
            vig.addColorStop(1, 'rgba(0,0,0,0.6)');
            g.fillStyle = vig;
            g.fillRect(0, 0, w, h);
        }

        function currentColorKey() {
            var btn = document.getElementById('recordBtn');
            if (btn) {
                if (btn.classList.contains('speaking')) return 'speaking';
                if (btn.classList.contains('thinking')) return 'thinking';
                if (btn.classList.contains('recording')) return 'listening';
            }
            return 'idle';
        }

        function targetAmplitude(t) {
            if (state === 'speaking') {
                var base = 0.30 + 0.34 * Math.abs(Math.sin(t * TAU * 1.1)) * (0.55 + 0.45 * Math.abs(Math.sin(t * 0.7 + 1.3)));
                return Math.min(1, base);
            }
            if (state === 'listening') {
                if (analyser && micData) {
                    analyser.getByteFrequencyData(micData);
                    var bass = 0, treble = 0;
                    for (var i = 1; i <= 7; i++) bass += micData[i];
                    for (var k = 24; k < 80; k++) treble += micData[k];
                    bass /= 7 * 255; treble /= 56 * 255;
                    return Math.min(1, bass * 0.9 + treble * 0.55);
                }
                return 0.10 + 0.07 * Math.abs(Math.sin(t * 0.9));
            }
            if (state === 'thinking') return 0.16 + 0.10 * Math.abs(Math.sin(t * 2.4));
            return 0.05 + 0.03 * Math.abs(Math.sin(t * 0.35));
        }

        function enableMic() {
            if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
            navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
                var AC = window.AudioContext || window.webkitAudioContext;
                if (!AC) return;
                var actx = new AC();
                var an = actx.createAnalyser();
                an.fftSize = 256;
                an.smoothingTimeConstant = 0.75;
                actx.createMediaStreamSource(stream).connect(an);
                analyser = an;
                micData = new Uint8Array(an.frequencyBinCount);
            }).catch(function () {});
        }

        function spriteFor(key, rgb) {
            if (!spriteCache[key]) spriteCache[key] = makeGlowSprite(rgb);
            return spriteCache[key];
        }

        function render(dt) {
            var p = params, c = core;
            ctx.globalCompositeOperation = 'source-over';
            ctx.clearRect(0, 0, w, h);
            if (bg) ctx.drawImage(bg, 0, 0, w, h);
            ctx.globalCompositeOperation = 'lighter';

            var breathe = 1 + p.breatheAmount * Math.sin(TAU * p.breatheFreq * time);
            var radiusMul = breathe * (1 + p.radiusBoost * amp);

            var aura = ctx.createRadialGradient(cx, cy, R * 0.2, cx, cy, R * 1.8);
            aura.addColorStop(0, rgba(c, 0.18));
            aura.addColorStop(0.5, rgba(c, 0.06));
            aura.addColorStop(1, rgba(c, 0));
            ctx.fillStyle = aura;
            ctx.fillRect(0, 0, w, h);

            var cosA = Math.cos(angle), sinA = Math.sin(angle);
            var tilt = 0.3 + 0.1 * Math.sin(time * 0.1);
            var cosT = Math.cos(tilt), sinT = Math.sin(tilt);
            var deformAmp = (p.deformBase + p.deformGain * amp) * intensity;

            function project(px, py, pz) {
                var x1 = px * cosA - pz * sinA;
                var z1 = px * sinA + pz * cosA;
                var y2 = py * cosT - z1 * sinT;
                var z2 = py * sinT + z1 * cosT;
                var scale = FOCAL / (FOCAL + z2 + R);
                return { sx: cx + x1 * scale, sy: cy + y2 * scale, scale: scale, near: Math.max(0, Math.min(1, 1 - (z2 / R + 1) / 2)) };
            }

            function deform(lon, lat) {
                return deformAmp * (
                    0.55 * Math.sin(3 * lon + time * p.waveSpeed) +
                    0.30 * Math.sin(5 * lon - time * p.waveSpeed * 0.63 + lat * 2) +
                    0.15 * Math.sin(2 * lon + 3 * lat + time * p.waveSpeed * 1.37)
                );
            }

            var proj = new Array(filaments.length);
            for (var i = 0; i < filaments.length; i++) {
                var f = filaments[i];
                var lon0 = Math.atan2(f.z, f.x), lat0 = Math.asin(f.y);
                var r0 = R * radiusMul * (1 + deform(lon0, lat0));
                proj[i] = project(f.x * r0, f.y * r0, f.z * r0);
            }

            ctx.lineWidth = 0.7;
            ctx.strokeStyle = rgba(c, 0.16);
            ctx.beginPath();
            for (var l = 0; l < lines.length; l++) {
                var pa = proj[lines[l][0]], pb = proj[lines[l][1]];
                var nearMin = Math.min(pa.near, pb.near);
                if (nearMin < 0.12) continue;
                ctx.globalAlpha = nearMin;
                ctx.moveTo(pa.sx, pa.sy);
                ctx.lineTo(pb.sx, pb.sy);
            }
            ctx.globalAlpha = 1;
            ctx.stroke();

            var coreKey = Math.round(c[0] / 10) * 10 + ',' + Math.round(c[1] / 10) * 10 + ',' + Math.round(c[2] / 10) * 10;
            var coreSprite = spriteFor(coreKey, coreKey);
            for (var m = 0; m < filaments.length; m++) {
                var fp = filaments[m], q = proj[m];
                var tw = 0.55 + 0.45 * Math.sin(time * fp.twinkleSpeed + fp.twinklePhase);
                var size = fp.size * q.scale * 5.2;
                ctx.globalAlpha = tw * (0.3 + 0.7 * q.near);
                ctx.drawImage(coreSprite, q.sx - size / 2, q.sy - size / 2, size, size);
            }

            // Goldstaub-Halo (bleibt immer wunderschön golden)
            var goldSprite = spriteFor('gold', '245,176,66');
            var goldBrightSprite = spriteFor('goldB', '253,227,152');
            for (var d = 0; d < dust.length; d++) {
                var dp = dust[d];
                dp.lon += dp.orbit * dt * (1 + p.swirlBoost);
                dp.kick *= Math.exp(-dt * 3.2);
                var sinLat = Math.sin(dp.lat);
                var rr = R * dp.rBase * radiusMul * (1 + p.dustSpread * amp + 0.4 * dp.kick * eruption);
                var qq = project(Math.cos(dp.lat) * Math.cos(dp.lon) * rr, sinLat * rr, Math.cos(dp.lat) * Math.sin(dp.lon) * rr);
                var tw2 = 0.5 + 0.5 * Math.sin(time * dp.twinkleSpeed + dp.twinklePhase);
                var size2 = dp.size * qq.scale * 5.6;
                ctx.globalAlpha = Math.min(1, (0.22 + 0.6 * tw2) * (0.35 + 0.65 * qq.near));
                ctx.drawImage(dp.bright ? goldBrightSprite : goldSprite, qq.sx - size2 / 2, qq.sy - size2 / 2, size2, size2);
            }

            var nucR = R * 0.52 * radiusMul * (1 + 0.18 * amp);
            var nuc = ctx.createRadialGradient(cx, cy, 0, cx, cy, nucR * 1.9);
            nuc.addColorStop(0, 'rgba(255,255,255,' + (0.85 + 0.1 * Math.sin(time * 3)).toFixed(3) + ')');
            nuc.addColorStop(0.18, rgba(c, 0.75));
            nuc.addColorStop(0.45, rgba(c, 0.3));
            nuc.addColorStop(1, rgba(c, 0));
            ctx.fillStyle = nuc;
            ctx.globalAlpha = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, nucR * 1.9, 0, TAU);
            ctx.fill();

            for (var rg = 0; rg < rings.length; rg++) {
                ctx.strokeStyle = rgba(c, rings[rg].alpha);
                ctx.lineWidth = rings[rg].width;
                ctx.beginPath();
                ctx.arc(cx, cy, rings[rg].r, 0, TAU);
                ctx.stroke();
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        }

        function spawnRing() {
            rings.push({ r: R * 0.5, alpha: 0.35, width: 1.6 });
        }

        function frame(now) {
            if (!running) return;
            var dtMs = Math.min(64, Math.max(1, now - lastNow));
            lastNow = now;
            var dt = dtMs / 1000;
            time += dt;
            state = currentColorKey();
            var tgt = STATE_PARAMS[state];
            var k = 1 - Math.exp(-dt * 6.5);
            for (var key in params) {
                if (key === 'core') continue;
                params[key] += (tgt[key] - params[key]) * k;
            }
            for (var ci = 0; ci < 3; ci++) core[ci] += (tgt.core[ci] - core[ci]) * k;

            var ampTarget = targetAmplitude(time);
            amp += (ampTarget - amp) * (ampTarget > amp ? 0.35 : 0.10);
            if (amp - prevAmp > 0.14) eruption = Math.min(1, eruption + 0.55);
            prevAmp = amp;
            eruption *= Math.exp(-dt * 4.2);

            ringCooldown -= dt;
            if ((state === 'speaking' && amp > 0.55) || (state === 'listening' && amp > 0.6)) {
                if (ringCooldown <= 0) { spawnRing(); ringCooldown = 0.24; }
            } else if (state === 'thinking' && ringCooldown <= 0) {
                spawnRing(); ringCooldown = 0.7;
            }

            for (var ri = 0; ri < rings.length; ri++) {
                rings[ri].r += R * 1.5 * dt;
                rings[ri].alpha *= Math.exp(-dt * 2.1);
            }
            rings = rings.filter(function (r) { return r.alpha > 0.015; });

            angle += params.rotSpeed * dt;
            render(dt);
            raf = requestAnimationFrame(frame);
        }

        function onVisibility() {
            if (document.hidden) {
                running = false;
                cancelAnimationFrame(raf);
            } else if (!reducedMotion) {
                running = true;
                lastNow = performance.now();
                raf = requestAnimationFrame(frame);
            }
        }

        function start() {
            if (running || reducedMotion) {
                if (reducedMotion) render(0);
                return;
            }
            running = true;
            if (window.ResizeObserver) {
                observer = new ResizeObserver(function () { resize(); buildParticles(); });
                observer.observe(canvas);
            }
            document.addEventListener('visibilitychange', onVisibility);
            lastNow = performance.now();
            raf = requestAnimationFrame(frame);
        }

        function stop() {
            running = false;
            cancelAnimationFrame(raf);
            if (observer) { observer.disconnect(); observer = null; }
            document.removeEventListener('visibilitychange', onVisibility);
        }

        resize();
        buildParticles();

        return {
            start: start,
            stop: stop,
            destroy: stop,
            setState: function (s) { state = s; },
            setDensity: function (v) { density = Math.min(1.6, Math.max(0.25, v)); buildParticles(); },
            setIntensity: function (v) { intensity = Math.min(2, Math.max(0.3, v)); },
            enableMic: enableMic,
            pause: function () { running = false; cancelAnimationFrame(raf); },
            resume: function () {
                if (!reducedMotion && !running) {
                    running = true;
                    lastNow = performance.now();
                    raf = requestAnimationFrame(frame);
                }
            }
        };
    }

    window.createJarvisOrb = createJarvisOrb;

    function start() {
        var canvas = document.getElementById('jarvisSphere');
        var orb = createJarvisOrb(canvas);
        if (!orb) return;
        window.jarvisOrb = orb;
        orb.start();

        window.pauseJarvisSphere = function () { orb.pause(); };
        window.resumeJarvisSphere = function () { orb.resume(); };
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
