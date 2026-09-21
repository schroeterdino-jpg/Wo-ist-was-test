/* ============================================================
   BACKGROUND: langsam treibende Lichtpunkte mit feinen Linien
   Reagiert auf den Zustand des Rings (zuhören / sprechen).
   Braucht nur das Element #grid-canvas aus index.html.
   ============================================================ */

(function () {
    const host = document.getElementById('grid-canvas');
    if (!host) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'bg-particles';
    host.appendChild(canvas);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    /* --- Einstellungen: hier kannst du am Look drehen --- */
    const AREA_PER_PARTICLE = 24000;  // größer = weniger Punkte
    const MAX_PARTICLES = 60;
    const LINK_DISTANCE = 120;        // ab welcher Entfernung Linien entstehen
    const BASE_SPEED = 0.12;          // Grundtempo
    const COLOR_IDLE = '73, 215, 255';    // Cyan
    const COLOR_LISTEN = '73, 215, 255';  // Cyan, heller
    const COLOR_SPEAK = '87, 224, 161';   // Grün

    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ringEl = document.getElementById('recordBtn');

    let w = 0, h = 0, dpr = 1;
    let particles = [];
    let rafId = null;

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const count = Math.min(MAX_PARTICLES, Math.round((w * h) / AREA_PER_PARTICLE));
        particles = [];
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = BASE_SPEED * (0.4 + Math.random() * 0.9);
            particles.push({
                x: Math.random() * w,
                y: Math.random() * h,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                r: 0.8 + Math.random() * 1.4,
                a: 0.25 + Math.random() * 0.45,
                phase: Math.random() * Math.PI * 2
            });
        }
    }

    function getMode() {
        if (!ringEl) return 'idle';
        if (ringEl.classList.contains('speaking')) return 'speak';
        if (ringEl.classList.contains('recording')) return 'listen';
        return 'idle';
    }

    let speedFactor = 1;
    let boost = 1;
    let colorRgb = COLOR_IDLE;

    function draw(time) {
        const mode = getMode();
        const targetSpeed = mode === 'speak' ? 2.2 : mode === 'listen' ? 1.6 : 1;
        const targetBoost = mode === 'idle' ? 1 : 1.6;
        speedFactor += (targetSpeed - speedFactor) * 0.05;
        boost += (targetBoost - boost) * 0.05;
        colorRgb = mode === 'speak' ? COLOR_SPEAK : mode === 'listen' ? COLOR_LISTEN : COLOR_IDLE;

        ctx.clearRect(0, 0, w, h);

        for (const p of particles) {
            if (!reduceMotion) {
                p.x += p.vx * speedFactor;
                p.y += p.vy * speedFactor;
                if (p.x < -10) p.x = w + 10;
                if (p.x > w + 10) p.x = -10;
                if (p.y < -10) p.y = h + 10;
                if (p.y > h + 10) p.y = -10;
            }
        }

        /* Linien zwischen nahen Punkten */
        ctx.lineWidth = 1;
        for (let i = 0; i < particles.length; i++) {
            const a = particles[i];
            for (let j = i + 1; j < particles.length; j++) {
                const b = particles[j];
                const dx = a.x - b.x;
                const dy = a.y - b.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < LINK_DISTANCE) {
                    const alpha = (1 - dist / LINK_DISTANCE) * 0.22 * boost;
                    ctx.strokeStyle = `rgba(${colorRgb}, ${alpha})`;
                    ctx.beginPath();
                    ctx.moveTo(a.x, a.y);
                    ctx.lineTo(b.x, b.y);
                    ctx.stroke();
                }
            }
        }

        /* Punkte mit sanftem Pulsieren */
        for (const p of particles) {
            const pulse = reduceMotion ? 1 : 0.75 + 0.25 * Math.sin(time / 900 + p.phase);
            const alpha = Math.min(1, p.a * pulse * boost);
            ctx.fillStyle = `rgba(${colorRgb}, ${alpha})`;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    function loop(time) {
        draw(time);
        rafId = requestAnimationFrame(loop);
    }

    function start() {
        if (rafId === null && !reduceMotion) rafId = requestAnimationFrame(loop);
    }

    function stop() {
        if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    /* Spart Akku: pausiert, wenn die App nicht sichtbar ist */
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stop(); else start();
    });

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resize();
            if (reduceMotion) draw(0);
        }, 150);
    });

    resize();
    if (reduceMotion) draw(0); else start();
})();
