/* ============================================================
   JARVIS-KUGEL: Netzwerk aus Punkten und Verbindungslinien, dreht sich langsam.
   Reine Optik, per <canvas id="jarvisSphere"> in index.html, unabhängig von den anderen Skripten.
   Farbe: Blau in Ruhe/beim Zuhören, Grün während Jarvis spricht - liest dafür nur die vorhandenen
   CSS-Klassen "speaking"/"recording" am Element #recordBtn mit, die voice.js sowieso schon setzt.
   ============================================================ */
(function () {
    function start() {
        const canvas = document.getElementById('jarvisSphere');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');

        const SIZE = 290;                 // muss zur width/height des <canvas> in index.html passen
        const POINT_COUNT = 90;
        const SPHERE_RADIUS = 108;
        const LINK_DIST = 52;             // höchstens dieser 3D-Abstand zwischen zwei Punkten -> Linie dazwischen
        const FOCAL = 340;                 // größer = flachere, kleiner = stärkere Perspektive
        const ROTATE_SPEED = 0.0055;       // Bogenmaß pro Bild

        const DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = SIZE * DPR;
        canvas.height = SIZE * DPR;
        canvas.style.width = SIZE + 'px';
        canvas.style.height = SIZE + 'px';
        ctx.scale(DPR, DPR);

        // Fibonacci-Kugel: verteilt die Punkte gleichmäßig über die Kugeloberfläche, ohne Häufung an den Polen
        const points = [];
        const golden = Math.PI * (3 - Math.sqrt(5));
        for (let i = 0; i < POINT_COUNT; i++) {
            const y = 1 - (i / (POINT_COUNT - 1)) * 2;
            const r = Math.sqrt(Math.max(0, 1 - y * y));
            const theta = golden * i;
            points.push({
                x: Math.cos(theta) * r * SPHERE_RADIUS,
                y: y * SPHERE_RADIUS,
                z: Math.sin(theta) * r * SPHERE_RADIUS
            });
        }

        // Farbpaare (Linie/Punkt) je Zustand - dieselben Grundfarben wie der Rest der App (--cyan, --good)
        const COLORS = {
            speaking: '87,224,161',   // Grün, siehe --good in style.css
            recording: '73,215,255',  // Cyan, siehe --cyan in style.css
            idle: '58,140,255'        // Blau
        };

        function currentColorKey() {
            const btn = document.getElementById('recordBtn');
            if (btn && btn.classList.contains('speaking')) return 'speaking';
            if (btn && btn.classList.contains('recording')) return 'recording';
            return 'idle';
        }

        let angle = 0;
        let running = true;

        // Pausiert, sobald die Seite/Karte nicht sichtbar ist (Akku sparen) - reagiert dieselbe Grundidee wie die
        // anderen Animationen in der App, die bei ausgeblendeten Fenstern anhalten.
        document.addEventListener('visibilitychange', () => { running = !document.hidden; if (running) requestAnimationFrame(frame); });

        function frame() {
            if (!running) return;
            angle += ROTATE_SPEED;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const rgb = COLORS[currentColorKey()];

            const projected = points.map(p => {
                const x = p.x * cosA - p.z * sinA;
                const z = p.x * sinA + p.z * cosA;
                const scale = FOCAL / (FOCAL + z + SPHERE_RADIUS);
                return { sx: SIZE / 2 + x * scale, sy: SIZE / 2 + p.y * scale, z, scale };
            });

            ctx.clearRect(0, 0, SIZE, SIZE);

            ctx.lineWidth = 1;
            for (let i = 0; i < POINT_COUNT; i++) {
                for (let j = i + 1; j < POINT_COUNT; j++) {
                    const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y, dz = points[i].z - points[j].z;
                    const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                    if (d < LINK_DIST) {
                        const a = projected[i], b = projected[j];
                        const opacity = (1 - d / LINK_DIST) * 0.5 * ((a.scale + b.scale) / 2);
                        ctx.strokeStyle = `rgba(${rgb},${opacity.toFixed(3)})`;
                        ctx.beginPath();
                        ctx.moveTo(a.sx, a.sy);
                        ctx.lineTo(b.sx, b.sy);
                        ctx.stroke();
                    }
                }
            }

            projected.forEach(p => {
                const rad = 1.1 * p.scale + 0.4;
                const op = Math.min(1, p.scale * 0.9);
                ctx.fillStyle = `rgba(${rgb},${op.toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rad, 0, Math.PI * 2);
                ctx.fill();
            });

            requestAnimationFrame(frame);
        }

        // Nutzer, die keine Bewegung wollen: ein einziges, stehendes Bild statt Dauerbewegung
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
