/* ============================================================
   JARVIS-KUGEL: dichte Wolke aus weichen Leuchtpunkten (Partikel-Stil), dreht sich langsam.
   Reine Optik, per <canvas id="jarvisSphere"> in index.html, unabhängig von den anderen Skripten.
   Farbe: Blau in Ruhe/beim Zuhören, Grün während Jarvis spricht - liest dafür nur die vorhandenen
   CSS-Klassen "speaking"/"recording" am Element #recordBtn mit, die voice.js sowieso schon setzt.
   Pausiert außerdem, sobald ein Panel (z.B. die Weltkugel) offen ist - siehe pauseJarvisSphere()/
   resumeJarvisSphere() unten, aufgerufen von panels.js (openPanel/closePanel).

   Auf Wunsch umgebaut: früher ein Punkte-Netz MIT Verbindungslinien, jetzt eine reine Partikelwolke
   ohne Linien - viele weiche, unterschiedlich große Leuchtpunkte, im Kugelvolumen verteilt (nicht nur
   auf der Oberfläche), damit die Mitte dichter/heller wirkt als der Rand.
   ============================================================ */
(function () {
    function start() {
        const canvas = document.getElementById('jarvisSphere');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');

        const SIZE = 290;                 // muss zur width/height des <canvas> in index.html passen
        const POINT_COUNT = 420;          // sehr viele, aber kleine Partikel für einen feinen Sprenkel-Effekt
        const SPHERE_RADIUS = 116;
        const FOCAL = 340;                 // größer = flachere, kleiner = stärkere Perspektive
        const ROTATE_SPEED = 0.0055;       // Bogenmaß pro Bild

        const DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = SIZE * DPR;
        canvas.height = SIZE * DPR;
        canvas.style.width = SIZE + 'px';
        canvas.style.height = SIZE + 'px';
        ctx.scale(DPR, DPR);

        // Punkte im GESAMTEN Kugelvolumen verteilen (nicht nur auf der Oberfläche wie beim alten Netz):
        // zufällige Richtung + eine mit Kubikwurzel gestauchte Zufallslänge füllt eine Kugel gleichmäßig
        // nach Volumen, wodurch die Mitte spürbar dichter wirkt als der Rand - wie eine Partikelwolke.
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
                size: 0.35 + Math.random() * 1.0,        // klein und fein, wie Sternenstaub statt einzelner Blobs
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.02 + Math.random() * 0.035,
                phase: Math.random() * Math.PI * 2,     // eigener Versatz je Punkt fürs Sprechen-Pulsieren
                speedMul: 0.75 + Math.random() * 0.7    // eigenes Tempo je Punkt (nicht alle exakt synchron)
            });
        }

        // Farben je Zustand - dieselben Grundfarben wie der Rest der App (--cyan, --good)
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

        // Zusätzlich zur Gesamt-Atmung bewegt sich beim SPRECHEN jeder Partikel für sich: er zieht sich
        // einzeln etwas zur Mitte oder nach außen, mit eigenem Tempo/Versatz - dadurch wirkt die Wolke
        // beim Sprechen lebendig/brodelnd statt nur gleichmäßig zu pulsieren.
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
                const twinkle = 0.65 + 0.35 * Math.sin(time * p.twinkleSpeed + p.twinklePhase);
                return { sx: SIZE / 2 + x * scale, sy: SIZE / 2 + by * scale, scale, size: p.size, twinkle };
            });
            // Von hinten nach vorne zeichnen (weiter weg zuerst), damit nähere Partikel vorne sichtbar bleiben
            projected.sort((a, b) => a.scale - b.scale);

            // Weiches Neon-Schimmern um die ganze Kugel (CSS-Glow auf dem <canvas> selbst)
            canvas.style.filter = `drop-shadow(0 0 6px rgba(${rgb},.9)) drop-shadow(0 0 16px rgba(${rgb},.7)) drop-shadow(0 0 34px rgba(${rgb},.4))`;

            ctx.clearRect(0, 0, SIZE, SIZE);

            // Weicher Grundschimmer: eine große, sehr weiche Leuchtkugel im Hintergrund, VOR den einzelnen
            // Partikeln gezeichnet - das ist der "glühende Kern", der im Referenzbild die Mitte der Wolke
            // hell und massiv wirken lässt, statt dass es nur einzelne Punkte ohne Zusammenhalt sind.
            const coreRadius = SPHERE_RADIUS * breathe * (FOCAL / (FOCAL + SPHERE_RADIUS));
            const coreGrad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, coreRadius * 1.15);
            coreGrad.addColorStop(0, `rgba(${rgb},.32)`);
            coreGrad.addColorStop(0.4, `rgba(${rgb},.16)`);
            coreGrad.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(SIZE / 2, SIZE / 2, coreRadius * 1.15, 0, Math.PI * 2);
            ctx.fill();

            projected.forEach(p => {
                const rad = Math.max(0.3, p.size * p.scale * 1.4);
                const op = Math.min(1, p.scale * p.twinkle);
                // Weicher Glow-Punkt statt scharfem Kreis: Farbe in der Mitte, transparent am Rand
                const grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rad * 1.8);
                grad.addColorStop(0, `rgba(${rgb},${op.toFixed(3)})`);
                grad.addColorStop(0.5, `rgba(${rgb},${(op * 0.35).toFixed(3)})`);
                grad.addColorStop(1, `rgba(${rgb},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rad * 1.8, 0, Math.PI * 2);
                ctx.fill();
                // Heller, kleiner Kern in der Mitte jedes Partikels (macht die Wolke funkelnder)
                ctx.fillStyle = `rgba(255,255,255,${(op * 0.6).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rad * 0.35, 0, Math.PI * 2);
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
