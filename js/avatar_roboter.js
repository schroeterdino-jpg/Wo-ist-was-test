/* ============================================================
   ROBOTER-AVATAR (ersetzt die Kugel auf der Startseite): silberner Roboter mit blauen Augen und Brustreaktor.
   - Bild: models/roboter.webp (Mund zu) und zwei Mund-Bilder models/mund1.webp (wenig offen) und mund2.webp (halb offen), schon an das Gesicht angeglichen.
   - KEINE eigene Animationsschleife: sphere.js ruft jvRoboter.frame(modus, pegel) in seiner einen vorhandenen Schleife auf (pausiert mit der Seite, läuft nur sichtbar).
     Solange der Roboter aktiv ist, zeichnet sphere.js die Kugel nicht mehr (kein doppelter Aufwand).
   - Mund: folgt dem Pegel der echten Stimme (jvSphereLevel/liveVoiceLevel aus sphere.js, gleiche Quelle wie die Tonbalken). Ohne Pegel: gleichmäßiges Sprechmuster.
     Nach dem Sprechen (oder bei Unterbrechung, weil dann kein "speaking" mehr gilt) schließt sich der Mund sofort ohne Nachlauf.
   - Augen und Reaktor pulsieren beim Sprechen, im Ruhezustand atmet der Roboter minimal. Bildrate gedrosselt: sprechen ca. 30 pro Sekunde, Ruhe ca. 10.
   - Rückfall: lädt ein Bild nicht, bleibt die Kugel (aktiv bleibt false). Merker localStorage jv_avatar = "kugel" erzwingt die Kugel.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvRoboter) return;
    const BASIS = 'models/roboter.webp', M1 = 'models/mund1.webp', M2 = 'models/mund2.webp';
    const S = 0.5;                                  // Bilder sind auf die Hälfte von 1024 x 1536 verkleinert
    const W = 512, H = 768;
    const BOX = [440, 262];                         // Ecke der Mund-Bilder in 1024er Koordinaten
    const AUGEN = [[462, 204], [582, 201]], REAKTOR = [517, 686];
    const st = { aktiv: false, ctx: null, canvas: null, img: null, m1: null, m2: null, a1: 0, a2: 0, zaehler: 0, vorher: null, teile: [] };

    function laden(src) { return new Promise((ok, fehl) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fehl(new Error('Bild fehlt: ' + src)); i.src = src; }); }
    function merkerKugel() { try { return window.localStorage && window.localStorage.getItem('jv_avatar') === 'kugel'; } catch (e) { return false; } }

    function aufbauen() {
        const holo = document.querySelector('#uebKopf .holo-container');
        const kugel = document.getElementById('jarvisSphere');
        if (!holo || !kugel) return false;
        const c = document.createElement('canvas');
        c.id = 'jarvisRoboter'; c.width = W; c.height = H; c.setAttribute('aria-hidden', 'true');
        holo.appendChild(c);
        st.canvas = c; st.ctx = c.getContext('2d');
        return !!st.ctx;
    }
    function glow(ctx, x, y, r, a, farbe) {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, 'rgba(' + farbe + ',' + a.toFixed(3) + ')'); g.addColorStop(1, 'rgba(' + farbe + ',0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    }
    /* Pegel -> Öffnung 0..1; ohne Pegel (null) ein gleichmäßiges Sprechmuster */
    function oeffnung(modus, pegel, t) {
        if (modus !== 'speaking') return 0;
        if (pegel === null || pegel === undefined) return Math.max(0, 0.55 + 0.45 * Math.sin(t * 0.33) * Math.sin(t * 0.11));
        return Math.max(0, Math.min(1, (pegel - 0.06) / 0.38));
    }
    function frame(modus, pegel, t) {
        if (!st.aktiv || !st.ctx) return;
        const sprechen = modus === 'speaking';
        st.zaehler++;
        if (st.zaehler % (sprechen ? 2 : 3) !== 0 && !(st.a1 > 0.02 || st.a2 > 0.02)) return;   // Ruhe: nur alle 3 Bilder; Mund noch offen: sofort zu Ende zeichnen
        let p = pegel;
        if (typeof p === 'number') { const v = st.vorher; st.vorher = p; p = p + 2.2 * (p - (typeof v === 'number' ? v : p)); }   // der Pegel ist geglättet und läuft der Stimme nach: Anstieg verstärken, damit der Mund nicht hinterherhinkt
        const o = oeffnung(modus, p, t || st.zaehler);
        const z1 = Math.max(0, Math.min(1, (o - 0.12) / 0.25)), z2 = Math.max(0, Math.min(1, (o - 0.5) / 0.25));
        const k = sprechen ? 0.55 : 1;                                         // beim Schließen sofort (kein Nachlauf), beim Sprechen weich
        st.a1 += (z1 - st.a1) * k; st.a2 += (z2 - st.a2) * k;
        if (!sprechen && st.a1 < 0.03) st.a1 = 0; if (!sprechen && st.a2 < 0.03) st.a2 = 0;
        const ctx = st.ctx, tt = st.zaehler;
        ctx.clearRect(0, 0, W, H);
        const schweben = Math.sin(tt * 0.022) * 9 + Math.sin(tt * 0.0137) * 4;       // sanftes Schweben (Bildpunkte, ca. 3 px auf dem Handy), dazu ganz leichtes Wiegen
        const wiegen = Math.sin(tt * 0.011) * 0.012;
        ctx.save(); ctx.translate(W / 2, H * 0.45 + schweben); ctx.rotate(wiegen); ctx.translate(-W / 2, -H * 0.45);
        ctx.drawImage(st.img, 0, 0, W, H);
        if (st.a1 > 0.01) { ctx.globalAlpha = st.a1; ctx.drawImage(st.m1, BOX[0] * S, BOX[1] * S); }
        if (st.a2 > 0.01) { ctx.globalAlpha = st.a2; ctx.drawImage(st.m2, BOX[0] * S, BOX[1] * S); }
        ctx.globalAlpha = 1;
        /* Augen und Reaktor: beim Sprechen pulsierend, sonst ruhiger Schein */
        const puls = sprechen ? 0.22 + 0.18 * Math.sin(tt * 0.25) + 0.25 * (pegel || 0) : 0.07 + 0.04 * Math.sin(tt * 0.04);
        ctx.globalCompositeOperation = 'lighter';
        AUGEN.forEach(a => glow(ctx, a[0] * S, a[1] * S, 26 * S + 10 * puls, puls * 0.9, '90,170,255'));
        glow(ctx, REAKTOR[0] * S, REAKTOR[1] * S, 70 * S + 24 * puls, puls * 0.8, '70,160,255');
        ctx.globalCompositeOperation = 'source-over';
        ctx.restore();
        funken(ctx, tt, sprechen);
    }
    /* Leuchtpunkte unten am Schweif: steigen langsam auf, werden kleiner und verlöschen; beim Sprechen etwas lebhafter */
    function funken(ctx, tt, sprechen) {
        const T = st.teile, ZIEL = 26;
        while (T.length < ZIEL) T.push(neuerFunke(true));
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < T.length; i++) {
            const f = T[i];
            f.y -= f.v * (sprechen ? 1.5 : 1) * 3;                 // ein Schritt pro gezeichnetem Bild
            f.x += Math.sin(tt * 0.03 + f.ph) * 0.35;
            f.l += 1;
            if (f.l >= f.max || f.y < 520) { T[i] = neuerFunke(false); continue; }
            const k = f.l / f.max, a = Math.sin(Math.PI * k) * (sprechen ? 0.95 : 0.75);
            glow(ctx, f.x, f.y, f.r * (1.2 - 0.5 * k), a, f.farbe);
        }
        ctx.globalCompositeOperation = 'source-over';
    }
    function neuerFunke(zufaelligAlt) {
        const max = 50 + Math.random() * 60, f = { x: W / 2 + (Math.random() - 0.5) * 110, y: 745 - Math.random() * 40, v: 0.45 + Math.random() * 0.6, r: 3 + Math.random() * 4, ph: Math.random() * 6.28, l: 0, max: max, farbe: Math.random() < 0.7 ? '110,190,255' : '180,230,255' };
        if (zufaelligAlt) { f.l = Math.floor(Math.random() * max); f.y -= f.v * 3 * f.l; if (f.y < 540) f.y = 540 + Math.random() * 180; }
        return f;
    }
    function einschalten() {
        st.aktiv = true;
        const k = document.getElementById('jarvisSphere'); if (k) k.style.display = 'none';
        const u = document.getElementById('uebKopf'); if (u) u.classList.add('ueb-roboter');
        st.zaehler = 5; frame('idle', 0, 0);
    }
    function start() {
        if (merkerKugel()) return;
        Promise.all([laden(BASIS), laden(M1), laden(M2)]).then(function (b) {
            st.img = b[0]; st.m1 = b[1]; st.m2 = b[2];
            if (aufbauen()) { window.jvRoboter.aktiv = true; einschalten(); }
        }).catch(function () { window.jvRoboter.aktiv = false; });   // Rückfall: die Kugel bleibt
    }
    window.jvRoboter = { aktiv: false, frame: frame, _st: st, _oeffnung: oeffnung };
    Object.defineProperty(window.jvRoboter, 'aktiv', { get: function () { return st.aktiv; }, set: function (v) { st.aktiv = !!v; if (!v) { const k = document.getElementById('jarvisSphere'); if (k) k.style.display = ''; if (st.canvas) st.canvas.style.display = 'none'; const u = document.getElementById('uebKopf'); if (u) u.classList.remove('ueb-roboter'); } }, enumerable: true });
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
