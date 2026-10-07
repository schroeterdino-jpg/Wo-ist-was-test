/* ============================================================
   GEHIRN-ANSICHT: Statt der Netz-Kugel zeigt der Startbildschirm ein Gehirn aus drei Bereichen im Dreieck:
   GEDÄCHTNIS (oben), AKTIONEN (rechts unten), STIMME (links unten). Jeder Bereich hat antippbare Knoten (Termine, Listen, Karte, Mail ...).
   Die Punkte auf den Dreiecks-Linien wandern im Uhrzeigersinn, das Ganze schwingt langsam und lässt sich mit dem Finger drehen.
   Antippen eines Knotens öffnet die jeweilige Funktion. Antippen einer leeren Stelle startet wie bisher das Zuhören.
   Zurück zur alten Kugel: kleiner Knopf oben rechts an der Ansicht, oder per Sprache "Zurück zur Kugel". "Zeig das Gehirn" schaltet wieder um.
   Die Wahl bleibt gespeichert (localStorage, Schlüssel jv_ansicht). Die Kugel (sphere.js) bleibt unverändert und läuft weiter im Hintergrund-Zustand "aus".
   Farben: ruhig und beim Zuhören blau-violett-orange; während Jarvis spricht pulsieren die Bereiche stärker.
   Braucht: index.html mit .holo-container und #recordBtn. Läuft ohne alle anderen Dateien, Aktionen rufen nur vorhandene Funktionen (openPanel, handleLocalCommand ...) auf, sofern sie existieren.
   ============================================================ */
(function () {
    const KEY = 'jv_ansicht';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    /* ---------- Inhalt: Bereiche und Knoten ---------- */
    function say(text) {
        try {
            const h = window.handleLocalCommand;
            if (typeof h === 'function' && h(text)) return;
            if (typeof window.sendToGroqSmart === 'function') window.sendToGroqSmart(text);
        } catch (e) { console.error('Gehirn', e); }
    }
    const panel = id => () => { try { window.openPanel(id); } catch (e) { console.error('Gehirn', e); } };
    const HUBS = [
        { label: 'GEDÄCHTNIS', color: [73, 215, 255], pos: [0, -0.56, 0], leaves: [
            ['Langzeit', () => window.showLangzeit && window.showLangzeit()],
            ['Gedächtnis', panel('gedaechtnis')],
            ['Listen', panel('einkauf')],
            ['Termine', panel('termine')],
            ['Erinnerungen', panel('erinnerungen')],
            ['Fristen', () => say('Welche Fristen habe ich?')],
            ['Protokolle', panel('protokolle')],
            ['Adressen', panel('adressen')]
        ] },
        { label: 'AKTIONEN', color: [255, 154, 68], pos: [0.62, 0.46, 0], leaves: [
            ['Karte', panel('karte')],
            ['Welt', panel('welt')],
            ['Planer', panel('planer')],
            ['Mail', () => say('Welche E-Mails habe ich?')],
            ['Wetter', () => say('Wie wird das Wetter?')],
            ['Foto', () => { try { window.openPhotoCamera(true); } catch (e) {} }],
            ['Überblick', () => { try { window.showUeberblick(false); } catch (e) {} }]
        ] },
        { label: 'STIMME', color: [190, 125, 255], pos: [-0.62, 0.46, 0], leaves: [
            ['Briefing', () => { try { window.triggerDailyBriefing(); } catch (e) {} }],
            ['Einstellungen', panel('settings')],
            ['Formulierungen', () => say('Welche Formulierungen habe ich?')],
            ['Hör-Korrektur', () => say('Welche Hör-Korrekturen hast du?')],
            ['Hilfe', () => say('Hilfe')]
        ] }
    ];

    /* ---------- 3D-Aufbau ---------- */
    const LEAF_R = 0.34;
    const nodes = [];       // alle Knoten: { hub, label, action, base:[x,y,z], r }
    HUBS.forEach((h, hi) => {
        h.index = hi;
        h.node = { hub: h, label: h.label, isHub: true, base: h.pos.slice(), r: 11 };
        nodes.push(h.node);
        const n = h.leaves.length;
        h.leafNodes = h.leaves.map((l, i) => {
            const y = 1 - (i + 0.5) / n * 2, rad = Math.sqrt(1 - y * y), th = i * 2.399963;   // Fibonacci-Kugel
            const k = 0.78 + 0.22 * ((i * 37) % 5) / 4;
            return { hub: h, label: l[0], action: l[1], dir: [Math.cos(th) * rad * k, y * k, Math.sin(th) * rad * k], r: 5.5 };
        });
        h.leafNodes.forEach(l => nodes.push(l));
    });
    const STARS = [];
    for (let i = 0; i < 70; i++) {
        const a = Math.random() * 6.283, b = Math.acos(2 * Math.random() - 1), R = 0.85 + Math.random() * 0.5;
        STARS.push({ p: [R * Math.sin(b) * Math.cos(a), R * Math.cos(b) * 0.9, R * Math.sin(b) * Math.sin(a)], s: 0.6 + Math.random() * 1.4, ph: Math.random() * 6.283 });
    }
    const EDGES = [[0, 1], [1, 2], [2, 0]];   // oben -> rechts unten -> links unten -> oben = im Uhrzeigersinn

    /* ---------- Zeichnen ---------- */
    let canvas = null, ctx = null, btn = null, W = 0, H = 0, dpr = 1;
    let yawDrag = 0, pitchDrag = 0, vYaw = 0, vPitch = 0, dragging = false, moved = false, lastX = 0, lastY = 0, downX = 0, downY = 0;
    let projected = [], pulse = null, raf = 0, t0 = performance.now();

    function state() {
        try { if (btn.classList.contains('speaking')) return 'speaking'; if (btn.classList.contains('recording')) return 'recording'; } catch (e) {}
        return 'idle';
    }
    function rgba(c, a) { return `rgba(${c[0]},${c[1]},${c[2]},${Math.max(0, Math.min(1, a)).toFixed(3)})`; }

    function resize() {
        if (!canvas) return;
        const r = canvas.getBoundingClientRect();
        dpr = Math.min(2, window.devicePixelRatio || 1);
        W = Math.max(50, r.width); H = Math.max(50, r.height);
        canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    }

    function frame(now) {
        raf = 0;
        if (!document.body.classList.contains('jv-brain') || document.hidden || !canvas) return;
        raf = requestAnimationFrame(frame);
        const t = (now - t0) / 1000, st = state();
        const energy = st === 'speaking' ? 1 : st === 'recording' ? 0.6 : 0.25;
        // Schwung durch Ziehen klingt ab, Ansicht pendelt langsam zurück
        if (!dragging) { yawDrag += vYaw; pitchDrag += vPitch; vYaw *= 0.94; vPitch *= 0.94; yawDrag *= 0.985; pitchDrag *= 0.985; }
        const yaw = Math.sin(t * 0.22) * 0.42 + yawDrag, pitch = 0.16 + Math.sin(t * 0.17 + 1) * 0.06 + pitchDrag;
        const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
        const scale = Math.min(W, H) * 0.43, cx = W / 2, cyy = H / 2 + H * 0.02;
        function proj(p) {
            const x1 = p[0] * cy + p[2] * sy, z1 = -p[0] * sy + p[2] * cy;
            const y2 = p[1] * cp - z1 * sp, z2 = p[1] * sp + z1 * cp;
            const s = 1 / (1 - z2 * 0.38);
            return { x: cx + x1 * scale * s, y: cyy + y2 * scale * s, z: z2, s };
        }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.lineJoin = 'round'; ctx.miterLimit = 2;
        ctx.clearRect(0, 0, W, H);

        // Positionen
        projected = [];
        HUBS.forEach(h => {
            h.P = proj(h.pos);
            const spin = t * (0.25 + h.index * 0.05);
            const cs = Math.cos(spin), sn = Math.sin(spin);
            h.leafNodes.forEach(l => {
                const d = l.dir, x = d[0] * cs + d[2] * sn, z = -d[0] * sn + d[2] * cs;
                l.world = [h.pos[0] + x * LEAF_R, h.pos[1] + d[1] * LEAF_R, h.pos[2] + z * LEAF_R];
                l.P = proj(l.world);
            });
        });

        // Sterne
        STARS.forEach(s => {
            const P = proj(s.p), a = (0.15 + 0.2 * Math.sin(t * 0.8 + s.ph)) * (0.6 + P.z * 0.4);
            ctx.fillStyle = `rgba(255,214,170,${Math.max(0.03, a).toFixed(3)})`;
            ctx.beginPath(); ctx.arc(P.x, P.y, s.s * P.s, 0, 6.283); ctx.fill();
        });

        // Dreieck-Linien + wandernde Punkte (Uhrzeigersinn)
        EDGES.forEach(([a, b], ei) => {
            const A = HUBS[a].P, B = HUBS[b].P;
            const g = ctx.createLinearGradient(A.x, A.y, B.x, B.y);
            g.addColorStop(0, rgba(HUBS[a].color, 0.55)); g.addColorStop(1, rgba(HUBS[b].color, 0.55));
            ctx.strokeStyle = g; ctx.lineWidth = 1.3; ctx.beginPath(); ctx.moveTo(A.x, A.y); ctx.lineTo(B.x, B.y); ctx.stroke();
            for (let k = 0; k < 3; k++) {
                const u = ((t * (0.07 + 0.05 * energy) + k / 3 + ei * 0.11) % 1);
                const px = A.x + (B.x - A.x) * u, py = A.y + (B.y - A.y) * u;
                const c = [Math.round(HUBS[a].color[0] * (1 - u) + HUBS[b].color[0] * u), Math.round(HUBS[a].color[1] * (1 - u) + HUBS[b].color[1] * u), Math.round(HUBS[a].color[2] * (1 - u) + HUBS[b].color[2] * u)];
                const rg = ctx.createRadialGradient(px, py, 0, px, py, 9);
                rg.addColorStop(0, rgba([255, 240, 220], 0.95)); rg.addColorStop(0.25, rgba(c, 0.8)); rg.addColorStop(1, rgba(c, 0));
                ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, 9, 0, 6.283); ctx.fill();
            }
        });

        // Bereiche: Verbindungen, Glühen, Knoten
        HUBS.forEach(h => {
            const c = h.color, H0 = h.P;
            // Leaf-Verbindungen
            h.leafNodes.forEach((l, i) => {
                const a = 0.22 + 0.16 * (l.P.z + 1) / 2;
                ctx.strokeStyle = rgba(c, a); ctx.lineWidth = 0.9;
                ctx.beginPath(); ctx.moveTo(H0.x, H0.y); ctx.lineTo(l.P.x, l.P.y); ctx.stroke();
                const nb = h.leafNodes[(i + 1) % h.leafNodes.length];
                ctx.strokeStyle = rgba(c, a * 0.45);
                ctx.beginPath(); ctx.moveTo(l.P.x, l.P.y); ctx.lineTo(nb.P.x, nb.P.y); ctx.stroke();
            });
            // Glühen
            const gr = (62 + 10 * Math.sin(t * 1.6 + h.index) * (0.5 + energy)) * H0.s * (scale / 150);
            const gg = ctx.createRadialGradient(H0.x, H0.y, 0, H0.x, H0.y, gr);
            gg.addColorStop(0, rgba(c, 0.28 + 0.18 * energy)); gg.addColorStop(1, rgba(c, 0));
            ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(H0.x, H0.y, gr, 0, 6.283); ctx.fill();
        });

        // Knoten nach Tiefe sortiert
        const drawn = [];
        HUBS.forEach(h => { drawn.push({ n: h.node, P: h.P, c: h.color }); h.leafNodes.forEach(l => drawn.push({ n: l, P: l.P, c: h.color })); });
        drawn.sort((a, b) => a.P.z - b.P.z);
        drawn.forEach(({ n, P, c }) => {
            const depth = (P.z + 1) / 2, rr = n.r * P.s * (scale / 150);
            if (n.isHub) {
                ctx.fillStyle = rgba([255, 255, 255], 0.95); ctx.beginPath(); ctx.arc(P.x, P.y, rr * 0.55, 0, 6.283); ctx.fill();
                ctx.strokeStyle = rgba(c, 0.9); ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(P.x, P.y, rr, 0, 6.283); ctx.stroke();
                ctx.strokeStyle = rgba(c, 0.35 + 0.25 * Math.sin(t * 2 + n.hub.index)); ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(P.x, P.y, rr * (1.5 + 0.2 * Math.sin(t * 2 + n.hub.index)), 0, 6.283); ctx.stroke();
                ctx.font = `700 ${Math.round(10.5 * Math.min(1.25, scale / 150))}px ui-monospace, Menlo, Consolas, monospace`;
                const ly = P.y + (n.hub.index === 0 ? -1 : 1) * (LEAF_R * scale * P.s + 20); ctx.textAlign = 'center'; ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,10,16,.9)'; ctx.strokeText(n.label, P.x, ly); ctx.fillStyle = rgba(c, 0.95); ctx.fillText(n.label, P.x, ly);
            } else {
                const glow = ctx.createRadialGradient(P.x, P.y, 0, P.x, P.y, rr * 3);
                glow.addColorStop(0, rgba(c, 0.5 * (0.4 + depth))); glow.addColorStop(1, rgba(c, 0));
                ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(P.x, P.y, rr * 3, 0, 6.283); ctx.fill();
                ctx.fillStyle = rgba([255, 255, 255], 0.55 + 0.4 * depth); ctx.beginPath(); ctx.arc(P.x, P.y, rr, 0, 6.283); ctx.fill();
                if (depth > 0.42) {
                    ctx.font = `${Math.round(9.5 * Math.min(1.25, scale / 150))}px ui-monospace, Menlo, Consolas, monospace`;
                    ctx.textAlign = 'center'; ctx.fillStyle = rgba([225, 240, 250], Math.min(0.95, (depth - 0.3) * 1.5));
                    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(5,10,16,.85)'; ctx.strokeText(n.label, P.x, P.y - rr - 6); ctx.fillText(n.label, P.x, P.y - rr - 6);
                }
            }
            n.sx = P.x; n.sy = P.y; n.sr = rr;
        });

        // Antipp-Welle
        if (pulse) {
            const age = (now - pulse.t) / 450;
            if (age >= 1) pulse = null;
            else { ctx.strokeStyle = rgba(pulse.c, 1 - age); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(pulse.x, pulse.y, 8 + age * 40, 0, 6.283); ctx.stroke(); }
        }
    }

    /* ---------- Bedienung ---------- */
    function hit(x, y) {
        let best = null, bd = 1e9;
        nodes.forEach(n => {
            if (n.sx === undefined) return;
            const d = Math.hypot(n.sx - x, n.sy - y), lim = Math.max(n.sr + 12, 24);
            if (d < lim && d < bd) { bd = d; best = n; }
        });
        return best;
    }
    function localXY(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }

    function onDown(e) { dragging = true; moved = false; const p = localXY(e); lastX = downX = p.x; lastY = downY = p.y; vYaw = vPitch = 0; try { canvas.setPointerCapture(e.pointerId); } catch (x) {} }
    function onMove(e) {
        if (!dragging) return;
        const p = localXY(e);
        if (!moved && Math.hypot(p.x - downX, p.y - downY) > 7) moved = true;
        if (moved) { vYaw = (p.x - lastX) * 0.006; vPitch = (p.y - lastY) * 0.004; yawDrag += vYaw; pitchDrag = Math.max(-0.6, Math.min(0.6, pitchDrag + vPitch)); }
        lastX = p.x; lastY = p.y;
    }
    function onUp() { dragging = false; }
    function onClick(e) {
        if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; return; }   // war ein Ziehen: Zuhören nicht starten
        const p = localXY(e), n = hit(p.x, p.y);
        if (!n) return;                      // leere Stelle: Klick geht weiter, Zuhören startet wie bei der Kugel
        e.stopPropagation(); e.preventDefault();
        pulse = { x: n.sx, y: n.sy, t: performance.now(), c: n.hub.color };
        try { if (typeof window.playUiBeep === 'function') window.playUiBeep(); } catch (x) {}
        if (n.isHub) return;
        setTimeout(() => { try { n.action(); } catch (x) { console.error('Gehirn', x); } }, 160);
    }

    /* ---------- Einbau in die Seite ---------- */
    function setMode(on, speakIt) {
        lsSet(KEY, on ? 'gehirn' : 'kugel');
        document.body.classList.toggle('jv-brain', !!on);
        const tg = document.getElementById('brainToggle');
        if (tg) { tg.textContent = on ? '◯' : '🧠'; tg.setAttribute('aria-label', on ? 'Zurück zur Kugel' : 'Gehirn-Ansicht'); tg.title = on ? 'Zurück zur Kugel' : 'Gehirn-Ansicht'; }
        if (on) { setTimeout(() => { resize(); if (!raf) raf = requestAnimationFrame(frame); }, 30); }
        if (speakIt) { try { speak(on ? 'Die Gehirn-Ansicht ist an.' : 'Die Kugel ist wieder da.', typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    }

    function mount() {
        const holder = document.querySelector('.holo-container');
        btn = document.getElementById('recordBtn');
        if (!holder || !btn) return;
        const css = document.createElement('style');
        css.textContent =
            '.holo-container{position:relative}' +
            '#jarvisBrain{position:absolute;left:0;top:0;width:100%;height:100%;display:none;touch-action:none;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
            'body.jv-brain #jarvisBrain{display:block}' +
            'body.jv-brain #jarvisSphere{display:none!important}' +
            'body.jv-brain .holo-container{width:min(98vw,56vh)!important;height:min(98vw,56vh)!important}' +
            'body.jv-brain #reactor-wrap{overflow:visible!important}' +
            '#brainToggle{position:absolute;right:2px;top:2px;z-index:5;width:30px;height:30px;border-radius:50%;border:1px solid rgba(93,209,255,.35);background:rgba(10,22,33,.75);color:#49d7ff;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}';
        document.head.appendChild(css);
        canvas = document.createElement('canvas');
        canvas.id = 'jarvisBrain'; canvas.setAttribute('aria-hidden', 'true');
        holder.appendChild(canvas);
        ctx = canvas.getContext('2d');
        const tg = document.createElement('button');
        tg.id = 'brainToggle'; tg.type = 'button';
        tg.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); setMode(!document.body.classList.contains('jv-brain'), false); });
        holder.appendChild(tg);
        canvas.addEventListener('pointerdown', onDown);
        canvas.addEventListener('pointermove', onMove);
        canvas.addEventListener('pointerup', onUp);
        canvas.addEventListener('pointercancel', onUp);
        canvas.addEventListener('click', onClick);
        window.addEventListener('resize', () => { resize(); });
        document.addEventListener('visibilitychange', () => { if (!document.hidden && document.body.classList.contains('jv-brain') && !raf) raf = requestAnimationFrame(frame); });
        setMode(lsGet(KEY) !== 'kugel', false);   // erste Nutzung: Gehirn; danach, was zuletzt gewählt wurde
    }

    /* ---------- Sprache ---------- */
    const ON_RX = /^(?:bitte\s+)?(?:zeig(?:e)?(?:\s+mir)?|schalte?|wechsel(?:e)?|stell(?:e)?)\s+(?:bitte\s+)?(?:(?:das|die|den|auf|zum|zur|zu)\s+)*(?:gehirn|gehirn-?ansicht|neuen?\s+ansicht)\b|^gehirn-?ansicht(?:\s+an)?$|^gehirn$/;
    const OFF_RX = /^(?:bitte\s+)?(?:zurück\s+(?:zur|zu der|zum)\s+(?:kugel|alten\s+ansicht|alten\s+kugel)|(?:zeig(?:e)?(?:\s+mir)?|schalte?|wechsel(?:e)?)\s+(?:bitte\s+)?(?:(?:die|den|auf|zur|zum)\s+)*(?:kugel|alte\s+ansicht)|kugel-?ansicht(?:\s+an)?|gehirn-?ansicht\s+aus)$/;
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60) return false;
        if (OFF_RX.test(t)) { setMode(false, true); return true; }
        if (ON_RX.test(t)) { setMode(true, true); return true; }
        return false;
    }
    window.handleGehirnCommand = handle;
    if (typeof window.handleLocalCommand === 'function' && !window.handleLocalCommand._gehirn) {
        const original = window.handleLocalCommand;
        const hooked = function (text) {
            try { if (handle(text)) return true; } catch (e) {}
            return original.apply(this, arguments);
        };
        hooked._gehirn = true;
        Object.keys(original).forEach(k => { try { hooked[k] = original[k]; } catch (e) {} });
        window.handleLocalCommand = hooked;
    }

    function start() { try { mount(); } catch (e) { console.error('Gehirn-Ansicht', e); } }
    if (document.readyState === 'complete' || document.readyState === 'interactive') start(); else document.addEventListener('DOMContentLoaded', start);
})();
