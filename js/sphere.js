/* ============================================================
   JARVIS-KUGEL: ruhiges Netzwerk aus Punkten und Verbindungslinien.
   Reine Optik, per <canvas id="jarvisSphere"> in index.html.
   Zustände bleiben sichtbar, Bewegungen sind bewusst weich und ruhig.
   ============================================================ */
(function () {
    function start() {
        const canvas = document.getElementById('jarvisSphere');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');

        const K = 1.2;
        const SIZE = Math.round(290 * K);
        const POINT_COUNT = 150;
        const SPHERE_RADIUS = 110 * K;
        const LINK_DIST = 46 * K;
        const FOCAL = 340 * K;
        // Deutlich ruhiger als vorher (0.0055). Die Kugel soll schweben, nicht hektisch rotieren.
        const ROTATE_SPEED = 0.0022;

        const DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = SIZE * DPR;
        canvas.height = SIZE * DPR;
        canvas.style.width = SIZE + 'px';
        canvas.style.height = SIZE + 'px';
        ctx.scale(DPR, DPR);

        const JITTER = 16 * K;
        const points = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < POINT_COUNT; i++) {
            const y = 1 - (i / (POINT_COUNT - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            points.push({
                x: Math.cos(theta) * r * SPHERE_RADIUS + (Math.random() - 0.5) * JITTER,
                y: y * SPHERE_RADIUS + (Math.random() - 0.5) * JITTER,
                z: Math.sin(theta) * r * SPHERE_RADIUS + (Math.random() - 0.5) * JITTER,
                phase: Math.random() * Math.PI * 2,
                speedMul: 0.75 + Math.random() * 0.7
            });
        }

        const COLORS = {
            idle: [58, 140, 255],
            recording: [60, 225, 235],
            thinking: [255, 154, 68],
            speaking: [87, 224, 161],
            alert: [255, 92, 60]
        };
        const colorCur = COLORS.idle.slice();
        const COLOR_BLEND = 0.045;

        function currentColorKey() {
            const btn = document.getElementById('recordBtn');
            if (btn && btn.classList.contains('speaking')) return 'speaking';
            if (btn && btn.classList.contains('recording')) return 'recording';
            if (typeof isProcessing !== 'undefined' && isProcessing) return 'thinking';
            if (window.jvSphereAlert) return 'alert';
            return 'idle';
        }

        let nightDimEnabled = true;
        try { nightDimEnabled = localStorage.getItem('night_dim') !== '0'; } catch (e) {}
        window.setNightDim = function (on) {
            nightDimEnabled = !!on;
            try { localStorage.setItem('night_dim', nightDimEnabled ? '1' : '0'); } catch (e) {}
        };
        const nightToggle = document.getElementById('nightDimToggle');
        if (nightToggle) nightToggle.checked = nightDimEnabled;

        let levelCache = 1, levelCheckedAt = 0;
        function timeLevel() {
            if (!nightDimEnabled) return 1;
            const nowMs = Date.now();
            if (nowMs - levelCheckedAt < 30000) return levelCache;
            levelCheckedAt = nowMs;
            const d = new Date();
            const h = d.getHours() + d.getMinutes() / 60;
            let lvl = 1;
            if (h >= 23 || h < 5) lvl = 0.5;
            else if (h >= 21) lvl = 1 - 0.5 * ((h - 21) / 2);
            else if (h < 7) lvl = 0.5 + 0.5 * ((h - 5) / 2);
            levelCache = lvl;
            return lvl;
        }
        let levelCur = 1;

        let audioCtx = null, analyser = null, analyserData = null, analyserSource = null;
        let liveLevelCur = 0;
        function ensureAnalyser() {
            if (analyser) return;
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 128;
                analyser.smoothingTimeConstant = 0.82;
                analyserData = new Uint8Array(analyser.frequencyBinCount);
                analyser.connect(audioCtx.destination);
            } catch (e) { analyser = null; }
        }
        function unlockAudio() {
            try {
                ensureAnalyser();
                if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            } catch (e) {}
        }
        ['pointerdown', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { once: true, passive: true }));

        window.jvSphereConnectAudio = function (audioEl) {
            try {
                ensureAnalyser();
                if (!analyser) return;
                if (audioCtx.state === 'suspended') { audioCtx.resume().catch(() => {}); return; }
                if (audioCtx.state !== 'running') return;
                if (analyserSource) { try { analyserSource.disconnect(); } catch (e) {} }
                analyserSource = audioCtx.createMediaElementSource(audioEl);
                analyserSource.connect(analyser);
            } catch (e) {}
        };
        window.jvSphereLevel = function () { try { return liveVoiceLevel(); } catch (e) { return null; } };
        function liveVoiceLevel() {
            if (!analyser || !analyserData) return null;
            analyser.getByteFrequencyData(analyserData);
            let sum = 0;
            for (let i = 0; i < analyserData.length; i++) sum += analyserData[i];
            const raw = Math.min(1, (sum / analyserData.length) / 90);
            // Lautstärkespitzen glätten: keine nervösen Sprünge der Kugel bei einzelnen Silben.
            liveLevelCur += (raw - liveLevelCur) * 0.10;
            return liveLevelCur;
        }

        const links = [];
        for (let i = 0; i < POINT_COUNT; i++) {
            for (let j = i + 1; j < POINT_COUNT; j++) {
                const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y, dz = points[i].z - points[j].z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d < LINK_DIST) links.push([i, j, 1 - d / LINK_DIST]);
            }
        }

        const DUST_COUNT = 90;
        const dust = [];
        for (let i = 0; i < DUST_COUNT; i++) {
            const u = Math.random(), v = Math.random();
            const theta = u * Math.PI * 2;
            const phi = Math.acos(2 * v - 1);
            const r = SPHERE_RADIUS * (1.05 + Math.random() * 0.55);
            dust.push({
                x: r * Math.sin(phi) * Math.cos(theta),
                y: r * Math.cos(phi),
                z: r * Math.sin(phi) * Math.sin(theta),
                size: 1.2 + Math.random() * 2.6,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.010 + Math.random() * 0.018
            });
        }
        const GOLD = '214,168,92';

        let angle = 0;
        let time = 0;
        let running = true;
        let panelPaused = false;
        const BREATHE_SPEED = 0.014;
        const BREATHE_AMOUNT = 0.025;

        // Sprechen: sichtbar lebendig, aber nur sanft. Vorher waren Atmung und Einzelpunkte sehr stark/unregelmäßig.
        const SPEAK_BREATHE_A = 0.035;
        const SPEAK_BREATHE_A_SPEED = 0.025;
        const SPEAK_BREATHE_B = 0.018;
        const SPEAK_BREATHE_B_SPEED = 0.055;
        const SPEAK_POINT_AMOUNT = 0.045;
        const SPEAK_POINT_SPEED = 0.035;

        function pointPulse(p, t, mode, liveLevel) {
            if (mode === 'hearing') return 1 + 0.022 * Math.sin(t * 0.035 * p.speedMul + p.phase);
            if (mode !== 'speaking') return 1;
            const liveBoost = liveLevel !== null ? liveLevel * 0.08 : 0;
            return 1 + SPEAK_POINT_AMOUNT * Math.sin(t * SPEAK_POINT_SPEED * p.speedMul + p.phase) + liveBoost;
        }

        function currentBreathe(t, mode, liveLevel) {
            if (mode === 'speaking') {
                const liveBoost = liveLevel !== null ? liveLevel * 0.05 : 0;
                return 1 + SPEAK_BREATHE_A * Math.sin(t * SPEAK_BREATHE_A_SPEED) + SPEAK_BREATHE_B * Math.sin(t * SPEAK_BREATHE_B_SPEED) + liveBoost;
            }
            if (mode === 'hearing') return 1 + 0.022 * Math.sin(t * 0.045) + 0.010 * Math.sin(t * 0.09);
            if (mode === 'alert') return 1 + 0.055 * Math.sin(t * 0.026);
            return 1 + BREATHE_AMOUNT * Math.sin(t * BREATHE_SPEED);
        }

        function isRunning() { return running && !panelPaused; }
        document.addEventListener('visibilitychange', () => { running = !document.hidden; if (isRunning()) requestAnimationFrame(frame); });
        window.pauseJarvisSphere = function () { panelPaused = true; };
        window.resumeJarvisSphere = function () { const was = panelPaused; panelPaused = false; if (was) requestAnimationFrame(frame); };

        function frame() {
            if (!isRunning()) return;
            const colorKey = currentColorKey();
            const active = colorKey !== 'idle';
            const levelTarget = active ? Math.max(timeLevel(), 0.85) : timeLevel();
            levelCur += (levelTarget - levelCur) * 0.035;
            const lvl = levelCur;

            // Kein hektisches Hochdrehen mehr. Denken bleibt leicht aktiver, Hören/Sprechen sogar etwas ruhiger.
            let stateRotate = 1;
            if (colorKey === 'thinking') stateRotate = 1.15;
            else if (colorKey === 'recording' || colorKey === 'speaking') stateRotate = 0.82;
            const rotateMul = (0.55 + 0.45 * lvl) * stateRotate;
            angle += ROTATE_SPEED * rotateMul;
            time += 1;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const liveLevel = liveVoiceLevel();
            const mode = colorKey === 'speaking' ? 'speaking' : (colorKey === 'recording' && window.jvUserSpeaking === true) ? 'hearing' : colorKey === 'alert' ? 'alert' : 'none';
            const breathe = currentBreathe(time, mode, liveLevel);

            const target = COLORS[colorKey];
            for (let c = 0; c < 3; c++) colorCur[c] += (target[c] - colorCur[c]) * COLOR_BLEND;
            const rgb = `${Math.round(colorCur[0])},${Math.round(colorCur[1])},${Math.round(colorCur[2])}`;

            const projected = points.map(p => {
                const total = breathe * pointPulse(p, time, mode, liveLevel);
                const bx = p.x * total, by = p.y * total, bz = p.z * total;
                const x = bx * cosA - bz * sinA;
                const z = bx * sinA + bz * cosA;
                const scale = FOCAL / (FOCAL + z + SPHERE_RADIUS);
                return { sx: SIZE / 2 + x * scale, sy: SIZE / 2 + by * scale, z, scale };
            });

            const safeLive = liveLevel === null ? 0 : liveLevel;
            const sprechGlow = colorKey === 'speaking' ? 0.25 + 0.25 * Math.min(1, safeLive * 1.4) : 0;
            canvas.style.filter = `drop-shadow(0 0 6px rgba(${rgb},${(0.9 * lvl).toFixed(2)})) drop-shadow(0 0 16px rgba(${rgb},${(0.7 * lvl).toFixed(2)})) drop-shadow(0 0 34px rgba(${rgb},${(0.4 * lvl).toFixed(2)}))` + (sprechGlow ? ` drop-shadow(0 0 ${Math.round(9 + 10 * sprechGlow)}px rgba(87,224,161,${sprechGlow.toFixed(2)}))` : '');

            ctx.globalAlpha = 1;
            ctx.clearRect(0, 0, SIZE, SIZE);
            ctx.globalAlpha = lvl;

            const coreRadius = SPHERE_RADIUS * breathe * (FOCAL / (FOCAL + SPHERE_RADIUS));
            const coreGrad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, coreRadius * 1.15);
            coreGrad.addColorStop(0, `rgba(${rgb},.32)`);
            coreGrad.addColorStop(0.4, `rgba(${rgb},.16)`);
            coreGrad.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(SIZE / 2, SIZE / 2, coreRadius * 1.15, 0, Math.PI * 2);
            ctx.fill();

            const dustAngle = angle * 0.6;
            const dCosA = Math.cos(dustAngle), dSinA = Math.sin(dustAngle);
            dust.forEach(p => {
                const x = p.x * dCosA - p.z * dSinA;
                const z = p.x * dSinA + p.z * dCosA;
                const scale = FOCAL / (FOCAL + z + SPHERE_RADIUS);
                const sx = SIZE / 2 + x * scale, sy = SIZE / 2 + p.y * scale;
                const twinkle = 0.5 + 0.5 * Math.sin(time * p.twinkleSpeed + p.twinklePhase);
                const op = Math.min(1, scale * twinkle * 0.8);
                const rad = p.size * scale * K;
                const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, rad * 2);
                grad.addColorStop(0, `rgba(${GOLD},${op.toFixed(3)})`);
                grad.addColorStop(1, `rgba(${GOLD},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(sx, sy, rad * 2, 0, Math.PI * 2);
                ctx.fill();
            });

            ctx.lineWidth = 1;
            for (let k = 0; k < links.length; k++) {
                const [i, j, closeness] = links[k];
                const a = projected[i], b = projected[j];
                const opacity = closeness * 0.5 * ((a.scale + b.scale) / 2);
                ctx.strokeStyle = `rgba(${rgb},${opacity.toFixed(3)})`;
                ctx.beginPath();
                ctx.moveTo(a.sx, a.sy);
                ctx.lineTo(b.sx, b.sy);
                ctx.stroke();
            }

            projected.forEach(p => {
                const rad = Math.max(0.6, (1.3 * p.scale + 0.4) * K);
                const op = Math.min(1, p.scale * 0.95);
                const grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rad * 2.2);
                grad.addColorStop(0, `rgba(${rgb},${op.toFixed(3)})`);
                grad.addColorStop(0.5, `rgba(${rgb},${(op * 0.4).toFixed(3)})`);
                grad.addColorStop(1, `rgba(${rgb},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rad * 2.2, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = `rgba(255,255,255,${(op * 0.55).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rad * 0.4, 0, Math.PI * 2);
                ctx.fill();
            });

            requestAnimationFrame(frame);
        }

        if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
            frame();
            running = false;
        } else {
            requestAnimationFrame(frame);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();
})();
