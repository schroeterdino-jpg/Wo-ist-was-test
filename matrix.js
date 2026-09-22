/* ============================================================
   MATRIX-REGEN: fallende Zeichen hinter dem Ring, nur in der Effekt-Stufe "Voll".
   Bewusst gedimmt (niedrige Deckkraft), damit Text davor lesbar bleibt.
   Läuft mit niedriger Bildrate (15 fps) und pausiert wie der Partikel-Hintergrund
   bei offenem Fenster, im Hintergrund-Tab oder in den Stufen "Ruhig"/"Aus".
   ============================================================ */

(function () {
    const host = document.getElementById('grid-canvas');
    if (!host) return;

    const canvas = document.createElement('canvas');
    canvas.id = 'matrix-rain';
    host.insertBefore(canvas, host.firstChild);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
    const FONT_SIZE = 16;
    const FPS = 15;
    const SPEED_MIN = 0.12;   // Zeilen pro Bild, langsamste Spalte
    const SPEED_MAX = 0.32;   // schnellste Spalte
    const TRAIL_COLOR = 'rgba(2, 8, 14, 0.18)';   // löscht nicht sofort, das gibt den "Nachzieh"-Schweif
    const HEAD_COLOR = 'rgba(160, 255, 210, 0.75)';
    const BODY_COLOR = 'rgba(87, 224, 161, 0.4)';

    const reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let w = 0, h = 0, dpr = 1, columns = 0, drops = [], speeds = [];
    let rafId = null, lastDraw = 0;

    function resize() {
        dpr = Math.min(window.devicePixelRatio || 1, 2);
        w = window.innerWidth;
        h = window.innerHeight;
        canvas.width = Math.round(w * dpr);
        canvas.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        columns = Math.ceil(w / FONT_SIZE);
        drops = new Array(columns).fill(0).map(() => Math.random() * -60);
        speeds = new Array(columns).fill(0).map(() => SPEED_MIN + Math.random() * (SPEED_MAX - SPEED_MIN));
        ctx.clearRect(0, 0, w, h);
    }

    function draw() {
        ctx.fillStyle = TRAIL_COLOR;
        ctx.fillRect(0, 0, w, h);
        ctx.font = FONT_SIZE + 'px monospace';
        ctx.textBaseline = 'top';
        for (let i = 0; i < columns; i++) {
            const y = drops[i] * FONT_SIZE;
            if (y >= -FONT_SIZE && y < h + FONT_SIZE) {
                const ch = CHARS[Math.floor(Math.random() * CHARS.length)];
                const x = i * FONT_SIZE;
                ctx.fillStyle = HEAD_COLOR;
                ctx.fillText(ch, x, y);
                if (y > FONT_SIZE) {
                    ctx.fillStyle = BODY_COLOR;
                    ctx.fillText(CHARS[Math.floor(Math.random() * CHARS.length)], x, y - FONT_SIZE);
                }
            }
            drops[i] += speeds[i];
            if (drops[i] * FONT_SIZE > h && Math.random() > 0.99) drops[i] = Math.random() * -20;
        }
    }

    function isFullMode() {
        return (document.documentElement.dataset && document.documentElement.dataset.fx) === 'full';
    }

    function shouldRun() {
        if (!isFullMode() || reduceMotion) return false;
        const cl = document.documentElement.classList;
        if (cl && cl.contains('nofx-bg')) return false;
        if (document.hidden) return false;
        if (document.body && document.body.classList.contains('panel-open')) return false;
        return true;
    }

    function loop(time) {
        rafId = requestAnimationFrame(loop);
        if (time - lastDraw < (1000 / FPS) - 2) return;
        lastDraw = time;
        draw();
    }

    function updateRunState() {
        if (shouldRun()) {
            if (rafId === null) rafId = requestAnimationFrame(loop);
        } else if (rafId !== null) {
            cancelAnimationFrame(rafId);
            rafId = null;
            ctx.clearRect(0, 0, w, h);
        }
    }

    /* Von ui.js (applyFxMode) aufgerufen, wenn die Effekt-Stufe wechselt */
    window.setMatrixRainMode = function () {
        updateRunState();
    };

    document.addEventListener('visibilitychange', updateRunState);
    if (typeof MutationObserver !== 'undefined' && document.body) {
        new MutationObserver(updateRunState).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    let resizeTimer = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(resize, 150);
    });

    resize();
    updateRunState();
})();
