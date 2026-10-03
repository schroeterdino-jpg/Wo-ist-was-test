/* ============================================================
   JARVIS-KUGEL: Netzwerk aus Punkten und Verbindungslinien, dreht sich langsam.
   Reine Optik, per <canvas id="jarvisSphere"> in index.html, unabhängig von den anderen Skripten.
   Farbe je Zustand (blendet weich über): Blau in Ruhe, Cyan beim Zuhören, Orange beim Nachdenken,
   Grün während Jarvis spricht - liest dafür nur die vorhandenen CSS-Klassen "speaking"/"recording" am
   Element #recordBtn mit, die voice.js sowieso schon setzt, und die Variable isProcessing aus voice.js.
   Neu (lebendig.js und unwetter.js liefern die Signale):
   - Rot-Orange und langsames, stärkeres Atmen, solange eine Unwetterwarnung gilt (window.jvSphereAlert)
   - Beim Zuhören pulsiert sie leicht mit, sobald DU sprichst (window.jvUserSpeaking, aus den Sprach-Ereignissen der Spracherkennung)
   - Beim Sprechen folgt sie der echten Lautstärke der Cloud-Stimme (window.jvSphereConnectAudio, aufgerufen von lebendig.js)
   Nachtmodus: ab 21 Uhr wird die Kugel langsam dunkler und ruhiger, nachts am dunkelsten, ab 5 Uhr wieder heller
   (abschaltbar in den Einstellungen unter "Effekte"). Spricht oder hört Jarvis gerade, leuchtet sie auch nachts kräftiger.
   Pausiert außerdem, sobald ein Panel (z.B. die Weltkugel) offen ist - siehe pauseJarvisSphere()/
   resumeJarvisSphere() unten, aufgerufen von panels.js (openPanel/closePanel).
   ============================================================ */
(function () {
    function start() {
        const canvas = document.getElementById('jarvisSphere');
        if (!canvas || !canvas.getContext) return;
        const ctx = canvas.getContext('2d');

        const K = 1.2;                    // Vergrößerung gegenüber der ursprünglichen Kugel (290 Pixel)
        const SIZE = Math.round(290 * K); // Größe des Bildes in Pixeln (die Seite passt die Darstellung an kleine Bildschirme an)
        const POINT_COUNT = 150;          // dichteres Netz als vorher (war 90)
        const SPHERE_RADIUS = 110 * K;
        const LINK_DIST = 46 * K;         // etwas enger als vorher, sonst wird's bei mehr Punkten zu unübersichtlich
        const FOCAL = 340 * K;            // größer = flachere, kleiner = stärkere Perspektive
        const ROTATE_SPEED = 0.0055;      // Bogenmaß pro Bild

        const DPR = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = SIZE * DPR;
        canvas.height = SIZE * DPR;
        canvas.style.width = SIZE + 'px';
        canvas.style.height = SIZE + 'px';
        ctx.scale(DPR, DPR);

        // Fibonacci-Kugel als Grundgerüst (gleichmäßige Verteilung), aber mit etwas Unschärfe/Versatz je Punkt,
        // damit es wie ein organisches Punktenetz wirkt statt wie ein exaktes, geometrisches Gebilde.
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
                phase: Math.random() * Math.PI * 2,     // eigener Versatz je Punkt fürs Sprechen-Pulsieren
                speedMul: 0.75 + Math.random() * 0.7    // eigenes Tempo je Punkt (nicht alle exakt synchron)
            });
        }

        // Farben (Linie/Punkt) je Zustand als Zahlen, damit sie weich ineinander übergehen können
        const COLORS = {
            idle: [58, 140, 255],       // Blau: bereit
            recording: [60, 225, 235],  // Cyan/Türkis: Jarvis hört zu
            thinking: [255, 154, 68],   // Orange: Jarvis denkt nach (isProcessing)
            speaking: [87, 224, 161],   // Grün: Jarvis spricht, siehe --good in style.css
            alert: [255, 92, 60]        // Rot-Orange: eine Unwetterwarnung gilt (window.jvSphereAlert)
        };
        const colorCur = COLORS.idle.slice();   // aktuelle (überblendete) Farbe
        const COLOR_BLEND = 0.07;               // wie schnell die Farbe zum neuen Zustand wechselt (pro Bild)

        function currentColorKey() {
            const btn = document.getElementById('recordBtn');
            if (btn && btn.classList.contains('speaking')) return 'speaking';
            if (btn && btn.classList.contains('recording')) return 'recording';
            if (typeof isProcessing !== 'undefined' && isProcessing) return 'thinking';
            if (window.jvSphereAlert) return 'alert';
            return 'idle';
        }

        // Nachtmodus: Einstellung merkt sich das Gerät selbst (wie die anderen Effekt-Einstellungen)
        let nightDimEnabled = true;
        try { nightDimEnabled = localStorage.getItem('night_dim') !== '0'; } catch (e) {}
        window.setNightDim = function (on) {
            nightDimEnabled = !!on;
            try { localStorage.setItem('night_dim', nightDimEnabled ? '1' : '0'); } catch (e) {}
        };
        const nightToggle = document.getElementById('nightDimToggle');
        if (nightToggle) nightToggle.checked = nightDimEnabled;

        // Helligkeit nach Tageszeit: 1 = voll, 0.5 = nachts. 21-23 Uhr wird sie dunkler, 5-7 Uhr wieder heller.
        let levelCache = 1, levelCheckedAt = 0;
        function timeLevel() {
            if (!nightDimEnabled) return 1;
            const nowMs = Date.now();
            if (nowMs - levelCheckedAt < 30000) return levelCache;   // nur alle 30 Sekunden neu rechnen
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
        let levelCur = 1;   // aktuelle Helligkeit, blendet weich zum Zielwert

        // Echte Audio-Reaktion (Web Audio API/AnalyserNode): spielt gerade die Cloud-Stimme (Edge/OpenAI),
        // wird deren Lautstärke in Echtzeit gemessen und fließt mit in die Pulsierung ein. Bei der
        // Handy-eigenen Stimme (SpeechSynthesis) gibt der Browser keinen Zugriff auf die rohen Audiodaten -
        // dafür bleibt es bei der simulierten Atmung, das ist eine Browser-Grenze, keine Lücke hier.
        let audioCtx = null, analyser = null, analyserData = null, analyserSource = null;
        function ensureAnalyser() {
            if (analyser) return;
            try {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
                analyser = audioCtx.createAnalyser();
                analyser.fftSize = 128;
                analyser.smoothingTimeConstant = 0.6;
                analyserData = new Uint8Array(analyser.frequencyBinCount);
                analyser.connect(audioCtx.destination);
            } catch (e) { analyser = null; }
        }
        // Beim ersten Fingertipp den Audio-Kontext vorbereiten und starten. Ein Audio-Kontext, der vor einem Fingertipp erzeugt wurde,
        // bleibt vom Browser angehalten; die Stimme würde dann stumm bleiben, wenn man sie über ihn leitet.
        function unlockAudio() {
            try {
                ensureAnalyser();
                if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
            } catch (e) {}
        }
        ['pointerdown', 'touchstart', 'keydown'].forEach(ev => document.addEventListener(ev, unlockAudio, { once: true, passive: true }));

        // Von lebendig.js aufgerufen, sobald ein neues <audio>-Element mit der Cloud-Stimme zu spielen beginnt.
        // Sicherheitsregel: Nur wenn der Audio-Kontext wirklich läuft, wird die Stimme durch ihn geleitet. Sonst bleibt die Stimme
        // unverändert hörbar (die Kugel pulsiert dann nach dem simulierten Rhythmus), statt dass sie verstummt.
        window.jvSphereConnectAudio = function (audioEl) {
            try {
                ensureAnalyser();
                if (!analyser) return;
                if (audioCtx.state === 'suspended') { audioCtx.resume().catch(() => {}); return; }
                if (audioCtx.state !== 'running') return;
                if (analyserSource) { try { analyserSource.disconnect(); } catch (e) {} }
                analyserSource = audioCtx.createMediaElementSource(audioEl);
                analyserSource.connect(analyser);
            } catch (e) { /* z.B. Browser ohne Unterstützung - die simulierte Atmung läuft einfach weiter */ }
        };
        function liveVoiceLevel() {
            if (!analyser || !analyserData) return null;
            analyser.getByteFrequencyData(analyserData);
            let sum = 0;
            for (let i = 0; i < analyserData.length; i++) sum += analyserData[i];
            return Math.min(1, (sum / analyserData.length) / 90);
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

        // Goldener Staub-Schwarm um das Netz herum - eigene Teilchen, unabhängig von den Netz-Punkten,
        // bleiben immer warmgolden (ändern die Farbe NICHT mit, wenn Jarvis spricht/zuhört), damit das
        // Netz selbst (das die Zustandsfarbe trägt) klar als das "lebendige" Element erkennbar bleibt.
        const DUST_COUNT = 90;
        const dust = [];
        for (let i = 0; i < DUST_COUNT; i++) {
            const u = Math.random(), v = Math.random();
            const theta = u * Math.PI * 2;
            const phi = Math.acos(2 * v - 1);
            const r = SPHERE_RADIUS * (1.05 + Math.random() * 0.55);   // außerhalb der Netz-Kugel verteilt
            dust.push({
                x: r * Math.sin(phi) * Math.cos(theta),
                y: r * Math.cos(phi),
                z: r * Math.sin(phi) * Math.sin(theta),
                size: 1.2 + Math.random() * 2.6,
                twinklePhase: Math.random() * Math.PI * 2,
                twinkleSpeed: 0.015 + Math.random() * 0.03
            });
        }
        const GOLD = '214,168,92';

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

        // mode: 'speaking' (Jarvis spricht), 'hearing' (du sprichst, dezenter), sonst keine Einzelbewegung
        function pointPulse(p, t, mode, liveLevel) {
            if (mode === 'hearing') return 1 + 0.07 * Math.sin(t * 0.07 * p.speedMul + p.phase);
            if (mode !== 'speaking') return 1;
            const liveBoost = liveLevel !== null ? liveLevel * 0.34 : 0;
            return 1 + SPEAK_POINT_AMOUNT * Math.sin(t * SPEAK_POINT_SPEED * p.speedMul + p.phase) + liveBoost;
        }

        function currentBreathe(t, mode, liveLevel) {
            if (mode === 'speaking') {
                const liveBoost = liveLevel !== null ? liveLevel * 0.18 : 0;
                return 1 + SPEAK_BREATHE_A * Math.sin(t * SPEAK_BREATHE_A_SPEED) + SPEAK_BREATHE_B * Math.sin(t * SPEAK_BREATHE_B_SPEED) + liveBoost;
            }
            if (mode === 'hearing') return 1 + 0.05 * Math.sin(t * 0.11) + 0.03 * Math.sin(t * 0.29);   // du sprichst: leichtes, unregelmäßiges Mitatmen
            if (mode === 'alert') return 1 + 0.075 * Math.sin(t * 0.032);                              // Warnung: langsames, deutlicheres Atmen
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
            const colorKey = currentColorKey();
            const active = colorKey !== 'idle';

            // Helligkeit: nachts gedimmt, aber sobald Jarvis hört, denkt oder spricht, auch nachts kräftig
            const levelTarget = active ? Math.max(timeLevel(), 0.85) : timeLevel();
            levelCur += (levelTarget - levelCur) * 0.05;
            const lvl = levelCur;

            // Nachts dreht sie sich ruhiger, beim Nachdenken etwas schneller
            const rotateMul = (0.55 + 0.45 * lvl) * (colorKey === 'thinking' ? 1.8 : 1);
            angle += ROTATE_SPEED * rotateMul;
            time += 1;
            const cosA = Math.cos(angle), sinA = Math.sin(angle);
            const liveLevel = liveVoiceLevel();   // einmal pro Bild messen, nicht pro Punkt (Leistung)
            const mode = colorKey === 'speaking' ? 'speaking' : (colorKey === 'recording' && window.jvUserSpeaking === true) ? 'hearing' : colorKey === 'alert' ? 'alert' : 'none';
            const breathe = currentBreathe(time, mode, liveLevel);

            // Farbe weich zum Ziel des aktuellen Zustands überblenden
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

            // Weiches Neon-Schimmern um die ganze Kugel (CSS-Glow auf dem <canvas> selbst, günstiger als
            // ein Schatten je Linie/Punkt und zieht die Farbe automatisch mit, wenn sie wechselt)
            canvas.style.filter = `drop-shadow(0 0 6px rgba(${rgb},${(0.9 * lvl).toFixed(2)})) drop-shadow(0 0 16px rgba(${rgb},${(0.7 * lvl).toFixed(2)})) drop-shadow(0 0 34px rgba(${rgb},${(0.4 * lvl).toFixed(2)}))`;

            ctx.globalAlpha = 1;
            ctx.clearRect(0, 0, SIZE, SIZE);
            ctx.globalAlpha = lvl;   // dunkler bei Nacht: alles, was jetzt gezeichnet wird, wird entsprechend schwächer

            // Weicher Grundschimmer in der Mitte - der "glühende Kern", der im Vorbild die Mitte hell und
            // massiv wirken lässt, statt dass es nur Linien und einzelne Punkte ohne Zusammenhalt sind.
            const coreRadius = SPHERE_RADIUS * breathe * (FOCAL / (FOCAL + SPHERE_RADIUS));
            const coreGrad = ctx.createRadialGradient(SIZE / 2, SIZE / 2, 0, SIZE / 2, SIZE / 2, coreRadius * 1.15);
            coreGrad.addColorStop(0, `rgba(${rgb},.32)`);
            coreGrad.addColorStop(0.4, `rgba(${rgb},.16)`);
            coreGrad.addColorStop(1, `rgba(${rgb},0)`);
            ctx.fillStyle = coreGrad;
            ctx.beginPath();
            ctx.arc(SIZE / 2, SIZE / 2, coreRadius * 1.15, 0, Math.PI * 2);
            ctx.fill();

            // Goldener Staub zuerst (liegt optisch hinter/um das Netz herum) - dreht sich etwas langsamer
            // als das Netz selbst, damit beide Schichten nicht starr zusammenkleben
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
                // Weicher Glow-Punkt statt scharfem Kreis: Farbe in der Mitte, transparent am Rand
                const grad = ctx.createRadialGradient(p.sx, p.sy, 0, p.sx, p.sy, rad * 2.2);
                grad.addColorStop(0, `rgba(${rgb},${op.toFixed(3)})`);
                grad.addColorStop(0.5, `rgba(${rgb},${(op * 0.4).toFixed(3)})`);
                grad.addColorStop(1, `rgba(${rgb},0)`);
                ctx.fillStyle = grad;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rad * 2.2, 0, Math.PI * 2);
                ctx.fill();
                // Heller, kleiner Kern in der Mitte jedes Punktes (macht das Netz funkelnder)
                ctx.fillStyle = `rgba(255,255,255,${(op * 0.55).toFixed(3)})`;
                ctx.beginPath();
                ctx.arc(p.sx, p.sy, rad * 0.4, 0, Math.PI * 2);
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
