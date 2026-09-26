/* ============================================================
   JARVIS-KUGEL: Netzwerk aus Punkten und Verbindungslinien, dreht sich langsam.
   Reine Optik, per <canvas id="jarvisSphere"> in index.html, unabhängig von den anderen Skripten.
   Farbe: Blau in Ruhe/beim Zuhören, Grün während Jarvis spricht - liest dafür nur die vorhandenen
   CSS-Klassen "speaking"/"recording" am Element #recordBtn mit, die voice.js sowieso schon setzt.
   Pausiert außerdem, sobald ein Panel (z.B. die Weltkugel) offen ist - siehe pauseJarvisSphere()/
   resumeJarvisSphere() unten, aufgerufen von panels.js (openPanel/closePanel).
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

        // Fibonacci-Kugel als Grundgerüst (gleichmäßige Verteilung), aber mit etwas Unschärfe/Versatz je Punkt,
        // damit es wie ein organisches Punktenetz wirkt statt wie ein exaktes, geometrisches Gebilde.
        const JITTER = 16;
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
                phase: Math.random() * Math.PI * 2,     // eigener Versatz je Punkt fürs Sprechen-Pulsieren
                speedMul: 0.75 + Math.random() * 0.7    // eigenes Tempo je Punkt (nicht alle exakt synchron)
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

        // Welche Punkte verbunden werden, steht schon vorher fest (ändert sich durch Drehen/Atmen nicht,
        // weil beides die ganze Kugel gleichmäßig bewegt) - das spart auf jedem Bild ~4000 Abstandsberechnungen.
        const links = [];
        for (let i = 0; i < POINT_COUNT; i++) {
            for (let j = i + 1; j < POINT_COUNT; j++) {
                const dx = points[i].x - points[j].x, dy = points[i].y - points[j].y, dz = points[i].z - points[j].z;
                const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (d < LINK_DIST) links.push([i, j, 1 - d / LINK_DIST]);
            }
        }

        let angle = 0;
        let time = 0;
        let running = true;
        let panelPaused = false;   // true, solange ein Panel (Termine, Welt, Karte ...) offen ist
        const BREATHE_SPEED = 0.02;     // wie schnell sie "atmet" (auseinander- und wieder zusammenzieht)
        const BREATHE_AMOUNT = 0.04;    // wie stark - 0.04 = bis zu 4% größer/kleiner als die Grundgröße (dezentes Pulsieren statt starkem Pump)

        // Während Jarvis SPRICHT: zwei überlagerte Wellen mit unterschiedlicher Geschwindigkeit statt einer
        // einzelnen, sauberen Sinuskurve - das wirkt unregelmäßiger und organischer, eher wie echtes Sprechen,
        // statt wie ein gleichmäßiges Ein- und Ausatmen.
        const SPEAK_BREATHE_A = 0.10;
        const SPEAK_BREATHE_A_SPEED = 0.05;
        const SPEAK_BREATHE_B = 0.05;
        const SPEAK_BREATHE_B_SPEED = 0.13;

        // Zusätzlich zur Gesamt-Atmung bewegt sich beim SPRECHEN jeder Punkt für sich: er zieht sich einzeln
        // etwas zur Mitte oder nach außen, mit eigenem Tempo/Versatz (siehe phase/speedMul oben bei den Punkten).
        // Dadurch verändert sich die Netz-Struktur selbst (Verbindungslinien strecken/stauchen sich unregelmäßig),
        // statt dass nur die ganze Kugel gleichmäßig größer/kleiner wird.
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

        // Pausiert, sobald die Seite/Karte nicht sichtbar ist (Akku sparen) - reagiert dieselbe Grundidee wie die
        // anderen Animationen in der App, die bei ausgeblendeten Fenstern anhalten.
        document.addEventListener('visibilitychange', () => { running = !document.hidden; if (isRunning()) requestAnimationFrame(frame); });

        // Von panels.js aufgerufen: Panel offen -> Kugel anhalten (spart Rechenzeit, verhindert Ruckeln bei anderen
        // Animationen wie der Weltkugel), Panel geschlossen -> Kugel läuft weiter.
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
                return { sx: SIZE / 2 + x * scale, sy: SIZE / 2 + by * scale, z, scale };
            });

            // Weiches Neon-Schimmern um die ganze Kugel (CSS-Glow auf dem <canvas> selbst, güns­tiger als
            // ein Schatten je Linie/Punkt und zieht die Farbe automatisch mit, wenn sie zwischen Blau/Grün wechselt)
            canvas.style.filter = `drop-shadow(0 0 6px rgba(${rgb},.9)) drop-shadow(0 0 16px rgba(${rgb},.7)) drop-shadow(0 0 34px rgba(${rgb},.4))`;

            ctx.clearRect(0, 0, SIZE, SIZE);

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
