/* ============================================================
   BACKGROUND: langsam treibende Lichtpunkte
   Reagiert auf den Zustand des Rings (zuhören / sprechen).
   Braucht das Element #grid-canvas aus index.html.

   Effekt-Stufen (Einstellungen → Effekte, siehe ui.js applyFxMode):
     full = 60 Punkte mit Linien, volle Bildrate
     calm = 24 Punkte ohne Linien, 24 Bilder pro Sekunde, pausiert bei offenem Fenster (Standard)
     off  = nichts
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
    const CONFIG = {
        full: { count: 60, links: true,  fps: 60, pauseWithPanel: false },
        calm: { count: 24, links: false, fps: 24, pauseWithPanel: true },
        off:  { count: 0,  links: false, fps: 0,  pauseWithPanel: true }
    };
    const AREA_PER_PARTICLE = 24000;  // größer = weniger Punkte
    const LINK_DISTANCE = 120;        // ab welcher Entfernung Linien entstehen (nur "full")
    const BASE_SPEED = 0.12;          // Grundtempo
    const COLOR_IDLE = '73, 215, 255';    // Cyan
    const COLOR_LISTEN = '73, 215, 255';  // Cyan, heller
    const COLOR_SPEAK = '87, 224, 161';   // Grün

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ringEl = document.getElementById('recordBtn');

    let mode = (document.documentElement.dataset && document.documentElement.dataset.fx) || 'calm';
    if (!CONFIG[mode]) mode = 'calm';
    const cfg = () => CONFIG[mode];

    let w = 0, h = 0, dpr = 1;
    let particles = [];
    let rafId = null;
    let lastDraw = 0;

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        const count = Math.min(cfg().count, Math.round((w * h) / AREA_PER_PARTICLE));
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

    function getState() {
        if (!ringEl) return 'idle';
        if (ringEl.classList.contains('speaking')) return 'speak';
        if (ringEl.classList.contains('recording')) return 'listen';
        return 'idle';
    }

    let speedFactor = 1;
    let boost = 1;
    let colorRgb = COLOR_IDLE;

    function draw(time) {
        const state = getState();
        const targetSpeed = state === 'speak' ? 2.2 : state === 'listen' ? 1.6 : 1;
        const targetBoost = state === 'idle' ? 1 : 1.6;
        speedFactor += (targetSpeed - speedFactor) * 0.05;
        boost += (targetBoost - boost) * 0.05;
        colorRgb = state === 'speak' ? COLOR_SPEAK : state === 'listen' ? COLOR_LISTEN : COLOR_IDLE;

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

        /* Linien zwischen nahen Punkten (nur in der Stufe "full") */
        if (cfg().links) {
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
        rafId = requestAnimationFrame(loop);
        const gap = 1000 / cfg().fps;
        if (time - lastDraw < gap - 2) return;   // Bildrate begrenzen
        lastDraw = time;
        draw(time);
    }

    /* Läuft die Animation gerade? Nicht, wenn die App unsichtbar ist, ein Fenster offen ist (außer "full") oder die Stufe "off" gilt */
    function shouldRun() {
        if (cfg().fps === 0 || reduceMotion) return false;
        if (document.hidden) return false;
        if (cfg().pauseWithPanel && document.body && document.body.classList.contains('panel-open')) return false;
        return true;
    }

    function updateRunState() {
        if (shouldRun()) {
            if (rafId === null) rafId = requestAnimationFrame(loop);
        } else if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    /* Wird von applyFxMode() (ui.js) aufgerufen, wenn du die Stufe änderst */
    window.setBackgroundMode = function (m) {
        mode = CONFIG[m] ? m : 'calm';
        resize();
        if (cfg().count === 0) ctx.clearRect(0, 0, w, h);
        else if (reduceMotion) draw(0);
        updateRunState();
    };

    document.addEventListener('visibilitychange', updateRunState);
    if (typeof MutationObserver !== 'undefined' && document.body) {
        new MutationObserver(updateRunState).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
            resize();
            if (reduceMotion) draw(0);
        }, 150);
    });

    resize();
    if (reduceMotion && cfg().count > 0) draw(0);
    updateRunState();
})();
