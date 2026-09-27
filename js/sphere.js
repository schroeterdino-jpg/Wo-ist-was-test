/* ============================================================
   JARVIS-KUGEL: dichte Wolke aus weichen Leuchtpunkten (Grün-Gold-Stil).
   ============================================================ */
(function () {
    function start() {
        const canvas = document.getElementById('jarvisSphere');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');

        const SIZE = 290;                 // passt exakt zum Container in der index.html
        const POINT_COUNT = 450;          // feiner Partikel-Sprenkel-Effekt
        const SPHERE_RADIUS = 125;        // etwas größer, damit sie voll und mächtig wirkt
        const FOCAL = 340;                 
        const ROTATE_SPEED = 0.0055;       

        const DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = SIZE * DPR;
        canvas.height = SIZE * DPR;
        canvas.style.width = SIZE + 'px';
        canvas.style.height = SIZE + 'px';
        ctx.scale(DPR, DPR);

        const points = [];
        for (let i = 0; i < POINT_COUNT; i++) {
            const u = Math.random(), v = Math.random();
            const theta = u * Math.PI * 2;
            const phi = Math.acos(2 * v - 1);
            const r = SPHERE_RADIUS * Math.cbrt(Math.random());
            points.push({
                x: r * Math.sin(phi) * Math.cos(theta),
                y: r * Math.cos(phi),
                z: r * Math.sin(phi) * Math.sin(theta),
                size: 0.4 + Math.random() * 1.1,        
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.02 + Math.random() * 0.035,
                phase: Math.random() * Math.PI * 2,     
                speedMul: 0.75 + Math.random() * 0.7    
            });
        }

        // ANGEPASSTE FARBEN: Grün mit goldenen Akzenten
        const COLORS = {
            speaking: '76,255,130',   // Frisches, helleres Grün beim Sprechen
            recording: '255,183,0',   // Edles Gold beim Zuhören / Aufnahme
            idle: '0,255,102'         // Sattes, starkes Grün im Ruhemodus
        };

        function currentColorKey() {
            const btn = document.getElementById('recordBtn');
            if (btn && btn.classList.contains('speaking')) return 'speaking';
            if (btn && btn.classList.contains('recording')) return 'recording';
            return 'idle';
        }

        let angle = 0;
        let time = 0;
        let running = true;
        let panelPaused = false;   
        const BREATHE_SPEED = 0.02;     
        const BREATHE_AMOUNT = 0.04;    

        const SPEAK_BREATHE_A = 0.10;
        const SPEAK_BREATHE_A_SPEED = 0.05;
        const SPEAK_BREATHE_B = 0.05;
        const SPEAK_BREATHE_B_SPEED = 0.13;

        const SPEAK_POINT_AMOUNT = 0.16;
        const SPEAK_POINT_SPEED = 0.09;

        function pointPulse(p, t, speaking) {
            if (!speaking) return 1;
            return 1 + SPEAK_POINT_AMOUNT * Math.sin(t * SPEAK_POINT_SPEED * p.speedMul + p.phase);
        }

        function currentBreathe(t, speaking) {
            if (speaking) {
                return 1 + SPEAK_BREATHE_A * Math.sin(t * SPEAK_BREATHE_A_SPEED) + SPEAK_BREATHE_B * Math.sin(t * SPEAK_BREATHE_B_SPEED);
            }
            return 1 + BREATHE_AMOUNT * Math.sin(t * BREATHE_SPEED);
        }

        function isRunning() {
            return running && !panelPaused;
        }

        document.addEventListener('visibilitychange', () => { running = !document.hidden; if (isRunning()) requestAnimationFrame(frame); });

        window.pauseJarvisSphere = function () { panelPaused = true; };
        window.resumeJarvisSphere = function () { const was = panelPaused; panelPaused = false; if (was) requestAnimationFrame(frame); };

        function frame() {
            if (!isRunning()) return;
            angle += ROTATE_SPEED;
            time += 1;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const colorKey = currentColorKey();
            const breathe = currentBreathe(time, colorKey === 'speaking');
            const rgb = COLORS[colorKey];
            const speaking = colorKey === 'speaking';

            const projected = points.map(p => {
                const total = breathe * pointPulse(p, time, speaking);
                const bx = p.x * total, by = p.y * total, bz = p.z * total;
                const x = bx * cosA - bz * sinA;
                const z = bx * sinA + bz * cosA;
                const scale = FOCAL / (FOCAL + z + SPHERE_RADIUS);
                const twinkle = 0.65 + 0.35 * Math.sin(time * p.twinkleSpeed + p.twinklePhase);
                return { sx: SIZE / 2 + x * scale, sy: SIZE / 2 + by * scale, scale, size: p.size, twinkle };
            });
            projected.sort((a, b) => a.scale - b.scale);

            canvas.style.filter = `drop-shadow(0 0 8px rgba(${rgb},.9)) drop-shadow(0 0 20px rgba(${rgb},.6)) drop-shadow(0 0 40px rgba(${rgb},.3))`;

            ctx.clearRect(0, 0, SIZE, SIZE);

            const coreRadius = SPHERE_RADIUS * breathe * (FOCAL / (FOCAL + SPHERE_RADIUS));
            const coreGrad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, coreRadius * 1.15);
            coreGrad.addColorStop(0, `rgba(${rgb},.35)`);
            coreGrad.addColorStop(0.4, `rgba(${rgb},.18)`);
            coreGrad.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(SIZE / 2, SIZE / 2, coreRadius * 1.15, 0, Math.PI * 2);
            ctx.fill();

            projected.forEach(p => {
                const rad = Math.max(0.3, p.size * p.scale * 1.4);
                const op = Math.min(1, p.scale * p.twinkle);
                const grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rad * 1.8);
                grad.addColorStop(0, `rgba(${rgb},${op.toFixed(3)})`);
                grad.addColorStop(0.5, `rgba(${rgb},${(op * 0.35).toFixed(3)})`);
                grad.addColorStop(1, `rgba(${rgb},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rad * 1.8, 0, Math.PI * 2);
                ctx.fill();
                
                ctx.fillStyle = `rgba(255,255,255,${(op * 0.7).toFixed(3)})`;
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
