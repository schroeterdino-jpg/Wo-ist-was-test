/* ============================================================
   EFFEKTE: Kino-Animationen, wenn Jarvis länger arbeitet (Radar, Route, Globus, Regen, Kalender, Schritt-Kette, Neuronen-Netz, Nachrichten).
   - Springt an, wenn Jarvis länger als etwa 2 Sekunden "arbeitet" (isProcessing) oder eine begleitete Aufgabe so lange läuft. Kurze Antworten bleiben ohne Show.
   - Der Effekt passt zur Aufgabe: Chef-KI meldet das Werkzeug (window.jvEffekt.werkzeug(name)), Nachrichten melden sich selbst (begleite). Sonst Neuronen-Netz.
   - Der Countdown ist eine Schätzung. Jarvis bremst nie künstlich; ist er früher fertig, springt der Zähler auf Haken. Dauert es länger, steht "···".
   - Tippen schließt den Effekt. "Effekte aus" / "Effekte an" (Sprache) und der Schalter in den Einstellungen (Speicher jv_effekte = "aus").
   - Nur ein Zeichen-Fenster (canvas) in einer festen Ebene unter den HUD-Fenstern; nichts davon ändert Antworten, Sprache oder Speicher.
   Zugriff: window.jvEffekt = { hinweis(art), werkzeug(name), begleite(art, promise), zeige(art), ende(ok), an(), aus(), istAn(), zustand(), pruefe(jetzt), ARTEN }.
   Braucht (alles optional): isProcessing (assistant.js), getPersistentData/setPersistentData, speak(), jvCommands. Jede Funktion fängt ihre Fehler ab.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvEffekt) return;
    var W = 680, H = 560, CX = 340, CY = 270, VERZOEGERUNG = 500, MINDEST_MS = 2800, HINWEIS_MS = 25000, ENDE_MS = 1200, NEWS_LESEN_MS = 6500;
    var CY1 = '#49d7ff', GR = '#4cffb0', DIM = '#12384a', TXT = '#9fd8ea';
    var PAL = ['73,215,255', '255,90,200', '160,110,255', '255,200,70', '76,255,176', '255,120,80'];
    var cv = null, x = null, box = null, raf = 0, an = true;
    var z = { laufend: false, art: null, t0: 0, ok: true, endeAt: 0, busySince: 0, nutzerWeg: false, hint: null, hintParams: null, startNun: 0, hintAt: 0, begleit: 0, news: null, begleitArt: null, begleitSeit: 0, sichtbar: false };
    var seed = 7;
    function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
    function jetzt() { return Date.now(); }
    function line(a, b, cc, w) { x.strokeStyle = cc; x.lineWidth = w || 2; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
    function ring(r, cc, w, a0, a1) { x.strokeStyle = cc; x.lineWidth = w; x.beginPath(); x.arc(CX, CY, r, a0 || 0, a1 === undefined ? 6.2832 : a1); x.stroke(); }
    function ease(q) { return 1 - Math.pow(1 - q, 3); }

    /* ---------- Effekt: Radar (Orte, Adressen) ---------- */
    var bl = [];
    function radarInit() { seed = 3; bl = []; for (var i = 0; i < 9; i++) bl.push({ a: rnd() * 6.28, r: 30 + rnd() * 95 }); }
    function radar(t) {
        for (var i = 1; i <= 4; i++) ring(i * 62, DIM, 2);
        line([CX - 250, CY], [CX + 250, CY], DIM, 1); line([CX, CY - 250], [CX, CY + 250], DIM, 1);
        var a = t * 2.2;
        for (var k = 0; k < 40; k++) { x.strokeStyle = 'rgba(73,215,255,' + (0.5 - k * 0.0125) + ')'; x.lineWidth = 3; x.beginPath(); x.moveTo(CX, CY); x.lineTo(CX + Math.cos(a - k * 0.03) * 250, CY + Math.sin(a - k * 0.03) * 250); x.stroke(); }
        bl.forEach(function (b) {
            var d = ((a - b.a) % 6.2832 + 6.2832) % 6.2832, al = Math.max(0, 1 - d / 4);
            if (al > 0) { x.fillStyle = 'rgba(76,255,176,' + al + ')'; x.beginPath(); x.arc(CX + Math.cos(b.a) * b.r * 2, CY + Math.sin(b.a) * b.r * 2, 6 + al * 4, 0, 6.28); x.fill(); }
        });
    }

    /* ---------- Effekt: Route (Fahrzeit, Abfahrt) ---------- */
    var nd = [[90, 420], [200, 330], [170, 200], [330, 240], [470, 150], [590, 110]];
    function route(t, fin) {
        for (var i = 0; i < W; i += 40) line([i, 0], [i, H], '#0d2a38', 1);
        for (var j = 0; j < H; j += 40) line([0, j], [W, j], '#0d2a38', 1);
        var p = fin > 0 ? 1 : ((t * 0.22) % 1.25), tot = nd.length - 1, f = Math.min(p, 1) * tot, k = Math.floor(f), fr = f - k, hx = nd[0][0], hy = nd[0][1];
        x.lineCap = 'round';
        for (var q = 0; q < tot; q++) {
            if (q < k || p >= 1) line(nd[q], nd[q + 1], CY1, 5);
            else if (q === k) { hx = nd[q][0] + (nd[q + 1][0] - nd[q][0]) * fr; hy = nd[q][1] + (nd[q + 1][1] - nd[q][1]) * fr; line(nd[q], [hx, hy], CY1, 5); }
        }
        if (p >= 1) { hx = nd[tot][0]; hy = nd[tot][1]; }
        nd.forEach(function (n, i) { var on = p >= 1 || i <= k; x.strokeStyle = on ? GR : DIM; x.lineWidth = 3; x.beginPath(); x.arc(n[0], n[1], 10 + Math.sin(t * 4 + i) * 2, 0, 6.28); x.stroke(); });
        x.fillStyle = '#fff'; x.beginPath(); x.arc(hx, hy, 8, 0, 6.28); x.fill();
        x.strokeStyle = 'rgba(73,215,255,.5)'; x.lineWidth = 2; x.beginPath(); x.arc(hx, hy, 18 + Math.sin(t * 8) * 4, 0, 6.28); x.stroke();
    }

    /* ---------- Effekt: Globus (Internet, Preise, Weltzeit) ---------- */
    /* ---------- Effekt: Regen (Wetter) ---------- */
    var rain = [];
    function regenInit() { seed = 9; rain = []; for (var i = 0; i < 160; i++) rain.push({ x: rnd() * W, y: rnd() * H, l: 10 + rnd() * 22, v: 6 + rnd() * 9 }); }
    function regen(t) {
        rain.forEach(function (r) {
            r.y += r.v; r.x -= r.v * 0.25; if (r.y > H) { r.y = -30; r.x = rnd() * W + 80; }
            x.strokeStyle = 'rgba(73,215,255,' + (0.25 + r.v / 30) + ')'; x.lineWidth = 2; x.beginPath(); x.moveTo(r.x, r.y); x.lineTo(r.x + r.l * 0.25, r.y - r.l); x.stroke();
        });
        for (var i = 0; i < 3; i++) { var rr = ((t * 60 + i * 60) % 180); x.strokeStyle = 'rgba(73,215,255,' + (1 - rr / 180) + ')'; x.lineWidth = 3; x.beginPath(); x.ellipse(CX, CY + 90, rr * 1.4, rr * 0.4, 0, 0, 6.28); x.stroke(); }
        x.fillStyle = '#e6f9ff'; x.font = '500 64px monospace'; x.textAlign = 'center'; x.fillText('☁', CX, CY + 10); x.textAlign = 'left';
    }

    /* ---------- Hologramm-Bühne: alle Zeichnungen unten laufen in einem Raum von 380 x 460, hier in die Mitte der Zeichenfläche gelegt ---------- */
    var K_ = 0.98, OX_ = 154, OY_ = 62;
    function buehne(fn) { return function (t, fin) { x.save(); x.translate(OX_, OY_); x.scale(K_, K_); try { fn(t, fin); } finally { x.restore(); } }; }
    function hcl(v) { return Math.max(0, Math.min(1, v)); }
    function heo(v) { v = hcl(v); return 1 - Math.pow(1 - v, 3); }
    function hob(v) { v = hcl(v); return 1 + 2.7 * Math.pow(v - 1, 3) + 1.7 * Math.pow(v - 1, 2); }
    function hG(col, b) { x.shadowColor = 'rgba(' + col + ',.9)'; x.shadowBlur = b || 12; }
    function hNG() { x.shadowBlur = 0; x.shadowColor = 'transparent'; }
    function hlife(t, fin, ems) { return fin > 0 ? 1 - heo((fin - (ems / 1000 - 0.9)) / 0.9) : heo(t / 1.3); }
    var hParts = [], hSterne = [];
    function holoInit() { seed = 7; hParts = []; for (var i = 0; i < 46; i++) hParts.push({ a: rnd() * 6.283, r: 60 + rnd() * 120, s: 0.6 + rnd() * 0.8, o: rnd() }); }

    /* ---------- Effekt: Hologramm-Kalender (Termine lesen, Termin anlegen) ---------- */
    var TAGE_K = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'], KAL = { jahr: 0, monat: 0, offset: 0, tage: 30, heute: 0, ev: {}, neu: 0, neuTitel: '', anzahl: 0 }, TL_, TR_, BR_, BL_;
    var FARBEN_K = ['176,130,255', '255,205,90', '90,255,185', '255,120,170', '90,200,255'];
    function kalInit(neu) {
        holoInit();
        var n = new Date(jetzt()), pr = z.hintParams || {}, ziel = null;
        try { var m = /(\d{4})-(\d{2})-(\d{2})/.exec(String(pr.zeit || pr.neue_zeit || pr.tag || '')); if (neu && m) ziel = { j: +m[1], m: +m[2] - 1, d: +m[3] }; } catch (e) { }
        var jahr = ziel ? ziel.j : n.getFullYear(), monat = ziel ? ziel.m : n.getMonth(), erster = new Date(jahr, monat, 1);
        KAL.jahr = jahr; KAL.monat = monat; KAL.offset = (erster.getDay() + 6) % 7; KAL.tage = new Date(jahr, monat + 1, 0).getDate();
        KAL.heute = (n.getFullYear() === jahr && n.getMonth() === monat) ? n.getDate() : 0; KAL.ev = {}; KAL.anzahl = 0;
        try {
            var liste = typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries) ? calendarEntries : [];
            liste.forEach(function (e) {
                var d = e && e.isoDate ? new Date(String(e.isoDate).length === 10 ? e.isoDate + 'T12:00:00' : e.isoDate) : null;
                if (!d || isNaN(d.getTime()) || d.getFullYear() !== jahr || d.getMonth() !== monat) return;
                KAL.anzahl++; var dd = d.getDate(); if (!KAL.ev[dd]) KAL.ev[dd] = String(e.text || '').replace(/\s+/g, ' ').trim().slice(0, 5);
            });
        } catch (e) { }
        KAL.neu = neu ? (ziel ? ziel.d : Math.min(KAL.tage, (KAL.heute || 1) + 1)) : 0;
        KAL.neuTitel = neu ? String(pr.text || 'Neu').slice(0, 5) : '';
    }
    function hP(u, v) { var a = [TL_[0] + (TR_[0] - TL_[0]) * u, TL_[1] + (TR_[1] - TL_[1]) * u], b = [BL_[0] + (BR_[0] - BL_[0]) * u, BL_[1] + (BR_[1] - BL_[1]) * u]; return [a[0] + (b[0] - a[0]) * v, a[1] + (b[1] - a[1]) * v]; }
    function hquad(u0, v0, u1, v1) { var a = hP(u0, v0), b = hP(u1, v0), c = hP(u1, v1), e = hP(u0, v1); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.lineTo(c[0], c[1]); x.lineTo(e[0], e[1]); x.closePath(); }
    function holoBoden(t, life) {
        var cx = 190, cy = 410; x.save(); x.globalAlpha = Math.max(0.2, life);
        var f = x.createRadialGradient(cx, cy, 0, cx, cy, 150); f.addColorStop(0, 'rgba(140,170,255,.35)'); f.addColorStop(1, 'rgba(140,170,255,0)'); x.fillStyle = f; x.beginPath(); x.ellipse(cx, cy, 170, 34, 0, 0, 6.283); x.fill();
        hG('150,190,255', 10);
        for (var i = 0; i < 3; i++) { var rr = (34 + i * 24 + ((t * 14) % 24)) % 90 + 20, al = 1 - rr / 115; x.strokeStyle = 'rgba(160,200,255,' + Math.max(0, al) + ')'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(cx, cy, rr * 1.7, rr * 0.3, 0, 0, 6.283); x.stroke(); }
        x.fillStyle = '#e6f0ff'; x.beginPath(); x.ellipse(cx, cy, 16, 4.5, 0, 0, 6.283); x.fill(); hNG();
        var bm = x.createLinearGradient(0, cy, 0, 300); bm.addColorStop(0, 'rgba(150,190,255,.5)'); bm.addColorStop(1, 'rgba(150,190,255,0)');
        x.fillStyle = bm; x.beginPath(); x.moveTo(cx - 20, cy); x.lineTo(cx + 20, cy); x.lineTo(300, 312); x.lineTo(80, 312); x.closePath(); x.fill();
        hParts.forEach(function (p) { var yy = cy - ((t * 30 * p.s + p.o * 100) % (cy - 312)), k = (cy - yy) / (cy - 312), xx = cx + Math.sin(p.o * 20 + t * p.s) * (20 + k * 110); x.fillStyle = 'rgba(225,238,255,' + (0.8 * (1 - k)) + ')'; x.fillRect(xx, yy, 1.8, 1.8); });
        x.restore();
    }
    function holoKarte(xx, yy, w, h, col, bg, sym, titel, zeile, a, t) {
        x.save(); x.globalAlpha = Math.min(1, a); hG(col, 16); x.fillStyle = bg; x.fillRect(xx, yy, w, h); x.strokeStyle = 'rgba(' + col + ',1)'; x.lineWidth = 1.6; x.strokeRect(xx, yy, w, h); hNG();
        x.strokeStyle = 'rgb(' + col + ')'; x.lineWidth = 2.6;
        if (sym === 'dreh') { x.save(); x.translate(xx + w / 2, yy + 34); x.rotate(t * 2); x.beginPath(); x.arc(0, 0, 13, 0.5, 5.3); x.stroke(); x.restore(); }
        else { x.beginPath(); x.arc(xx + w / 2, yy + 34, 15, 0, 6.283); x.stroke(); x.beginPath(); x.moveTo(xx + w / 2 - 7, yy + 35); x.lineTo(xx + w / 2 - 1, yy + 41); x.lineTo(xx + w / 2 + 8, yy + 28); x.stroke(); }
        x.fillStyle = '#f2ecff'; x.font = '500 12px monospace'; x.fillText(titel, xx + 8, yy + 80); x.fillStyle = 'rgba(215,215,255,.92)'; x.font = '11px monospace'; x.fillText(zeile, xx + 8, yy + 98); x.restore();
    }
    function holoKalender(neu) {
        return buehne(function (t, fin) {
            var sw = Math.sin(t * 0.7) * 7, sw2 = Math.cos(t * 0.5) * 4, ems = E[z.art].ende || ENDE_MS;
            TL_ = [40, 100 + sw2]; TR_ = [340, 84 - sw + sw2]; BR_ = [344, 312 - sw]; BL_ = [36, 328 + sw2];
            var life = hlife(t, fin, ems);
            holoBoden(t, life);
            if (life <= 0.01) return;
            var rv = heo(t / 1.5); x.save(); x.beginPath(); x.rect(-40, 0, 460, TL_[1] - 20 + (BL_[1] - TL_[1] + 40) * rv); x.clip(); x.globalAlpha = life;
            hquad(0, 0, 1, 1); var gf = x.createLinearGradient(0, TL_[1], 0, BL_[1]); gf.addColorStop(0, 'rgba(90,80,210,.5)'); gf.addColorStop(1, 'rgba(50,70,190,.35)'); x.fillStyle = gf; x.fill();
            x.save(); hquad(0, 0, 1, 1); x.clip();
            if (t > 2.4) { var sh = (t * 0.28) % 1.6 - 0.3, sx = TL_[0] + sh * (TR_[0] - TL_[0]), g2 = x.createLinearGradient(sx - 50, 0, sx + 50, 0); g2.addColorStop(0, 'rgba(255,255,255,0)'); g2.addColorStop(0.5, 'rgba(255,255,255,.14)'); g2.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g2; x.fillRect(sx - 50, TL_[1] - 20, 100, BL_[1] - TL_[1] + 60); }
            x.restore();
            hG('185,150,255', 16); x.strokeStyle = 'rgba(200,170,255,.95)'; x.lineWidth = 2.2; hquad(0, 0, 1, 1); x.stroke(); hNG();
            x.setLineDash([40, 300]); x.lineDashOffset = -t * 160; hG('255,255,255', 10); x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 2.6; hquad(0, 0, 1, 1); x.stroke(); x.setLineDash([]); hNG();
            var MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'], tp = hP(0.04, 0.085);
            hG('200,180,255', 6); x.fillStyle = '#efe8ff'; x.font = '500 14px monospace'; x.fillText(MON[KAL.monat] + ' ' + KAL.jahr, tp[0], tp[1]); hNG();
            var line = hcl((t - 0.5) / 1.2); x.strokeStyle = 'rgba(160,170,255,.32)'; x.lineWidth = 1;
            for (var i = 0; i <= 7; i++) { var a = hP(i / 7, 0.14), b = hP(i / 7, 0.14 + 0.86 * line); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); }
            for (var j = 0; j <= 6; j++) { var vv = 0.14 + j * (0.86 / 6), a2 = hP(0, vv), b2 = hP(line, vv); x.beginPath(); x.moveTo(a2[0], a2[1]); x.lineTo(b2[0], b2[1]); x.stroke(); }
            x.font = '11px monospace';
            for (var c = 0; c < 7; c++) { var p = hP((c + 0.5) / 7, 0.135); x.fillStyle = 'rgba(190,200,255,' + hcl((t - 1 - c * 0.1) / 0.4) + ')'; x.fillText(TAGE_K[c], p[0] - 7, p[1] - 5); }
            var farbe = 0;
            for (var dd = 1; dd <= KAL.tage; dd++) {
                var idx = dd - 1 + KAL.offset, cc = idx % 7, rr = Math.floor(idx / 7), p2 = hP((cc + 0.5) / 7, 0.14 + (rr + 0.42) * (0.86 / 6)), al = hcl((t - 1.2 - dd * 0.03) / 0.35); if (al <= 0) continue;
                x.globalAlpha = life * al; x.fillStyle = dd === KAL.heute ? '#ffffff' : 'rgba(220,225,255,.92)'; x.font = (dd === KAL.heute ? '500 ' : '') + '11px monospace'; x.fillText(String(dd), p2[0] - 6, p2[1] - 4); x.globalAlpha = life;
                if (KAL.ev[dd] && dd !== KAL.neu) {
                    var col = FARBEN_K[(farbe++) % FARBEN_K.length], pop = hob((t - 1.8 - farbe * 0.18) / 0.5); if (pop > 0) {
                        var pc = hP((cc + 0.5) / 7, 0.14 + (rr + 0.75) * (0.86 / 6)), w = 36 * pop, h = 12 * pop; hG(col, 10); x.fillStyle = 'rgba(' + col + ',.28)'; x.fillRect(pc[0] - w / 2, pc[1] - h / 2, w, h); x.strokeStyle = 'rgba(' + col + ',.95)'; x.lineWidth = 1.2; x.strokeRect(pc[0] - w / 2, pc[1] - h / 2, w, h); hNG();
                        if (pop > 0.8) { x.fillStyle = '#fff'; x.font = '10px monospace'; x.fillText(KAL.ev[dd], pc[0] - w / 2 + 4, pc[1] + 3.5); }
                    }
                }
            }
            var np = null;
            if (neu && KAL.neu) {
                var n = KAL.neu, ni = n - 1 + KAL.offset, nc = ni % 7, nr = Math.floor(ni / 7), nm = fin > 0 ? 1 : hcl((t - 1.6) / 1.2);
                np = hP((nc + 0.5) / 7, 0.14 + (nr + 0.5) * (0.86 / 6));
                if (nm > 0 && nm < 1) hParts.forEach(function (p) { var k = heo(nm * 1.15 - p.o * 0.15), sx = np[0] + Math.cos(p.a) * p.r * (1 - k), sy = np[1] + Math.sin(p.a) * p.r * 0.7 * (1 - k); hG('130,200,255', 8); x.fillStyle = 'rgba(150,215,255,' + (0.4 + 0.6 * k) + ')'; x.fillRect(sx - 1.5, sy - 1.5, 3, 3); });
                hNG();
                if (nm > 0.55) {
                    var f = hcl((nm - 0.55) / 0.45), fl = nm < 1 ? (Math.sin(t * 45) > -0.3 ? 1 : 0.4) : 1; x.globalAlpha = life * f * fl;
                    hquad(nc / 7, 0.14 + nr * (0.86 / 6), (nc + 1) / 7, 0.14 + (nr + 1) * (0.86 / 6)); hG('100,180,255', 20); x.fillStyle = 'rgba(60,140,255,.5)'; x.fill(); x.strokeStyle = 'rgba(150,215,255,1)'; x.lineWidth = 2; x.stroke(); hNG();
                    x.fillStyle = '#fff'; x.font = '500 11px monospace'; x.fillText(String(n), np[0] - 6, np[1] - 6); x.font = '10px monospace'; x.fillStyle = '#d6ecff'; x.fillText(KAL.neuTitel, np[0] - 13, np[1] + 9); x.globalAlpha = life;
                }
                if (fin > 0 && fin < 2.2) {
                    var p3 = hcl(fin / 2.0);
                    for (var r = 0; r < 3; r++) { var q = hcl(p3 - r * 0.12); if (q <= 0) continue; hG('130,255,200', 14); x.strokeStyle = 'rgba(130,255,200,' + (0.9 * (1 - q)) + ')'; x.lineWidth = 3 - r; x.beginPath(); x.ellipse(np[0], np[1], 10 + q * 230, (10 + q * 230) * 0.55, 0, 0, 6.283); x.stroke(); }
                    hNG();
                    for (var s = 0; s < 12; s++) { var an = s / 12 * 6.283, r2 = 10 + p3 * 60; x.fillStyle = 'rgba(200,255,230,' + (1 - p3) + ')'; x.fillRect(np[0] + Math.cos(an) * r2, np[1] + Math.sin(an) * r2 * 0.6, 2.4, 2.4); }
                }
            }
            x.restore();
            var lk = hob((t - 1.3) / 0.8) * life, rk = fin > 0 ? hob((fin - 0.3) / 0.8) * life : 0;
            if (lk > 0.02) holoKarte(-10 - (1 - Math.min(1, lk)) * 100, 170 + Math.sin(t * 1.2) * 3, 98, 112, '190,160,255', 'rgba(34,28,96,.92)', 'dreh', 'Termine', KAL.anzahl + ' im Monat', lk, t);
            if (rk > 0.02) holoKarte(380 - 96 + (1 - Math.min(1, rk)) * 100, 150 + Math.sin(t * 1.1 + 1) * 3, 98, 112, '130,255,205', 'rgba(16,56,70,.92)', 'haken', neu ? 'Gespeichert' : 'Gelesen', neu && KAL.neu ? KAL.neu + '. ' + (KAL.monat + 1) + '.' : 'Fertig', rk, t);
        });
    }

    /* ---------- Effekt: Hologramm-Globus (Internet, Preise) ---------- */
    var hSp = [];
    function globusInit() { holoInit(); seed = 5; hSp = []; for (var i = 0; i < 40; i++) hSp.push([Math.asin(rnd() * 2 - 1), rnd() * 6.283]); }
    function hp(la, lo, rot, r, cx, cy) { var X = Math.cos(la) * Math.sin(lo + rot), Y = Math.sin(la), Zz = Math.cos(la) * Math.cos(lo + rot); return { x: cx + X * r, y: cy - Y * r, z: Zz }; }
    var globus = buehne(function (t, fin) {
        var ems = E.globus.ende, life = hlife(t, fin, ems), cx = 190, cy = 150, r = 76 * heo(t / 1.5), rot = t * 0.6, FARB = ['255,200,70', '76,255,176', '255,90,200', '73,215,255', '255,120,80', '160,110,255'];
        hParts.forEach(function (p) { var yy = 440 - ((t * 24 * p.s + p.o * 300) % 440); x.fillStyle = 'rgba(160,200,255,' + (0.35 * p.s) + ')'; x.fillRect(p.o * 380, yy, 1.6, 1.6); });
        if (r > 1) {
            x.globalAlpha = Math.max(0.3, life); x.lineWidth = 1; hG('73,215,255', 6);
            for (var la = -60; la <= 60; la += 30) { x.strokeStyle = 'rgba(73,215,255,.5)'; x.beginPath(); var st = false; for (var lo = 0; lo <= 6.3; lo += 0.14) { var q = hp(la * 0.01745, lo, rot, r, cx, cy); if (q.z < 0) { st = false; continue; } if (!st) { x.moveTo(q.x, q.y); st = true; } else x.lineTo(q.x, q.y); } x.stroke(); }
            for (var m = 0; m < 12; m++) { x.strokeStyle = 'rgba(73,215,255,.5)'; x.beginPath(); var s2 = false; for (var l2 = -1.57; l2 <= 1.58; l2 += 0.14) { var q2 = hp(l2, m * 0.5236, rot, r, cx, cy); if (q2.z < 0) { s2 = false; continue; } if (!s2) { x.moveTo(q2.x, q2.y); s2 = true; } else x.lineTo(q2.x, q2.y); } x.stroke(); }
            hG('160,110,255', 14); x.strokeStyle = 'rgba(160,110,255,.85)'; x.lineWidth = 1.6; x.beginPath(); x.arc(cx, cy, r, 0, 6.283); x.stroke(); hNG();
            hSp.forEach(function (s, i) { var q3 = hp(s[0], s[1], rot, r, cx, cy); if (q3.z > 0) { var pu = 0.5 + 0.5 * Math.sin(t * 4 + i), col = FARB[i % 6]; hG(col, 8); x.fillStyle = 'rgba(' + col + ',' + (0.4 + 0.5 * pu) + ')'; x.beginPath(); x.arc(q3.x, q3.y, 2.2 + 1.8 * pu, 0, 6.283); x.fill(); } });
            hNG();
            for (var a = 0; a < 4; a++) {
                var A = hSp[a * 5], B = hSp[a * 5 + 9], pt = (t * 0.5 + a * 0.25) % 1; x.strokeStyle = 'rgba(120,220,255,.4)'; x.lineWidth = 1.5; x.beginPath(); var go = false;
                for (var s3 = 0; s3 <= 1.001; s3 += 0.05) { var qq = hp(A[0] + (B[0] - A[0]) * s3, A[1] + (B[1] - A[1]) * s3, rot, r * (1 + 0.3 * Math.sin(Math.PI * s3)), cx, cy); if (qq.z > -0.2) { if (!go) { x.moveTo(qq.x, qq.y); go = true; } else x.lineTo(qq.x, qq.y); } else go = false; }
                x.stroke();
                var q4 = hp(A[0] + (B[0] - A[0]) * pt, A[1] + (B[1] - A[1]) * pt, rot, r * (1 + 0.3 * Math.sin(Math.PI * pt)), cx, cy); hG('255,255,255', 10); x.fillStyle = '#fff'; x.beginPath(); x.arc(q4.x, q4.y, 2.4, 0, 6.283); x.fill(); hNG();
            }
            x.globalAlpha = 1;
        }
        var win = (heo((t - 1.2) / 1) * (fin > 0 ? 1 - heo((fin - 1.4) / 1) : 1)) * (life > 0 ? 1 : 0);
        if (win > 0.01) {
            var namen = ['QUELLE 1', 'QUELLE 2', 'QUELLE 3', 'QUELLE 4'];
            for (var i = 0; i < 4; i++) {
                var left = i % 2 === 0, w = 104, h = 52, yy = 60 + Math.floor(i / 2) * 108 + (i % 2) * 28, off = (1 - win) * 140, xx = left ? 4 - off : 380 - w - 4 + off;
                hG('73,215,255', 12); x.fillStyle = 'rgba(8,24,34,.9)'; x.fillRect(xx, yy, w, h); x.strokeStyle = 'rgba(73,215,255,.9)'; x.lineWidth = 1.5; x.strokeRect(xx, yy, w, h); hNG();
                x.fillStyle = 'rgba(73,215,255,.9)'; x.fillRect(xx, yy, w, 15); x.fillStyle = '#04121a'; x.font = '500 11px monospace'; x.fillText(namen[i], xx + 6, yy + 11);
                for (var l = 0; l < 3; l++) { var lw = (w - 14) * (0.45 + 0.5 * Math.abs(Math.sin(t * 1.3 + i + l))) * (fin > 0 ? 1 : 1); x.fillStyle = 'rgba(191,239,255,' + (0.8 - l * 0.2) + ')'; x.fillRect(xx + 7, yy + 24 + l * 8, lw, 3); }
                var gx = left ? xx + w : xx, gx2 = left ? cx - r * 0.85 : cx + r * 0.85; x.strokeStyle = 'rgba(73,215,255,.35)'; x.lineWidth = 1; x.setLineDash([3, 4]); x.beginPath(); x.moveTo(gx, yy + h / 2); x.lineTo(gx2, cy + (i - 1.5) * 16); x.stroke(); x.setLineDash([]);
                if (!left) continue;
            }
        }
        if (fin > 0) {
            var Ck = [['ERGEBNIS 1', '73,215,255'], ['ERGEBNIS 2', '76,255,176'], ['ERGEBNIS 3', '255,200,70']];
            for (var c = 0; c < 3; c++) {
                var e = hob((fin - 0.1 - c * 0.25) / 0.6) * (1 - heo((fin - (ems / 1000 - 0.8)) / 0.8)); if (e <= 0.02) continue;
                var cw = 112, ch = 86, cx2 = 8 + c * (cw + 10), cy2 = 288 + (1 - Math.min(1, e)) * 50; x.save(); x.globalAlpha = Math.min(1, e);
                hG(Ck[c][1], 14); x.fillStyle = 'rgba(8,24,34,.92)'; x.fillRect(cx2, cy2, cw, ch); x.strokeStyle = 'rgba(' + Ck[c][1] + ',.95)'; x.lineWidth = 1.6; x.strokeRect(cx2, cy2, cw, ch); hNG();
                x.fillStyle = 'rgba(' + Ck[c][1] + ',.9)'; x.fillRect(cx2, cy2, cw, 18); x.fillStyle = '#04121a'; x.font = '500 11px monospace'; x.fillText(Ck[c][0], cx2 + 6, cy2 + 13);
                x.fillStyle = '#bfefff'; x.font = '11px monospace'; x.fillText('Quelle geprüft', cx2 + 6, cy2 + 40); x.fillText('Treffer gefunden', cx2 + 6, cy2 + 58);
                x.strokeStyle = '#7dffc8'; x.lineWidth = 2; x.beginPath(); x.moveTo(cx2 + cw - 24, cy2 + 66); x.lineTo(cx2 + cw - 18, cy2 + 72); x.lineTo(cx2 + cw - 9, cy2 + 60); x.stroke(); x.restore();
            }
        }
    });

    /* ---------- Effekt: Schritt-Kette (mehrere Schritte nacheinander) ---------- */
    var ST = [[110, 420, 'Schritt 1'], [270, 300, 'Schritt 2'], [430, 380, 'Schritt 3'], [570, 230, 'Schritt 4']];
    function kette(t, fin) {
        var p = fin > 0 ? 1.4 : (t * 0.3) % 1.4, tot = ST.length - 1, f = Math.min(p * 1.1, 1) * tot, k = Math.floor(f), fr = f - k;
        for (var i = 0; i < tot; i++) {
            line(ST[i], ST[i + 1], DIM, 3);
            if (i < k || p * 1.1 >= 1) line(ST[i], ST[i + 1], CY1, 4);
            else if (i === k) {
                var hx = ST[i][0] + (ST[i + 1][0] - ST[i][0]) * fr, hy = ST[i][1] + (ST[i + 1][1] - ST[i][1]) * fr;
                line(ST[i], [hx, hy], CY1, 4); x.fillStyle = '#fff'; x.beginPath(); x.arc(hx, hy, 7, 0, 6.28); x.fill();
                x.strokeStyle = 'rgba(73,215,255,.5)'; x.lineWidth = 2; x.beginPath(); x.arc(hx, hy, 16 + Math.sin(t * 9) * 3, 0, 6.28); x.stroke();
            }
        }
        ST.forEach(function (s, i) {
            var reach = i <= k || p * 1.1 >= 1, ok = (i < k) || p * 1.1 >= 1;
            x.strokeStyle = ok ? GR : (reach ? CY1 : DIM); x.lineWidth = 4; x.beginPath(); x.arc(s[0], s[1], 30, 0, 6.28); x.stroke();
            x.fillStyle = ok ? GR : TXT; x.font = '500 26px monospace'; x.textAlign = 'center'; x.fillText(ok ? '✓' : String(i + 1), s[0], s[1] + 9);
            x.font = '16px monospace'; x.fillStyle = '#e6f9ff'; x.fillText(s[2], s[0], s[1] + 58); x.textAlign = 'left';
        });
    }

    /* ---------- Effekt: Neuronen-Netz (Nachdenken, freie Fragen) ---------- */
    var NN = 120, nn = [], ne = [], na = [], pul = [], lastSp = 0, seedN = 0, nnZeit = 0;
    function neuroInit() {
        seed = 5; nn = []; ne = []; na = []; pul = []; lastSp = 0; seedN = 0; nnZeit = 0;
        for (var i = 0; i < NN; i++) { var u, v, w, s; do { u = rnd() * 2 - 1; v = rnd() * 2 - 1; w = rnd() * 2 - 1; s = u * u + v * v + w * w; } while (s > 1 || s < 0.08); nn.push({ x: u * 215, y: v * 135, z: w * 135, f: 0, c: 0 }); na.push([]); }
        for (var a = 0; a < NN; a++) {
            var ds = []; for (var b = 0; b < NN; b++) if (b !== a) { var dx = nn[a].x - nn[b].x, dy = nn[a].y - nn[b].y, dz = nn[a].z - nn[b].z; ds.push([dx * dx + dy * dy + dz * dz, b]); }
            ds.sort(function (p, q) { return p[0] - q[0]; });
            for (var k = 0; k < 3; k++) { var j2 = ds[k][1], ex = false; for (var q = 0; q < ne.length; q++) if ((ne[q][0] === a && ne[q][1] === j2) || (ne[q][0] === j2 && ne[q][1] === a)) ex = true; if (!ex) { ne.push([a, j2]); na[a].push(ne.length - 1); na[j2].push(ne.length - 1); } }
        }
    }
    function proj(n, ry, rx) { var X = n.x * Math.cos(ry) + n.z * Math.sin(ry), Zz = -n.x * Math.sin(ry) + n.z * Math.cos(ry), Y = n.y * Math.cos(rx) - Zz * Math.sin(rx), Z2 = n.y * Math.sin(rx) + Zz * Math.cos(rx), f = 620 / (620 + Z2); return [CX + X * f, CY + Y * f, Z2, f]; }
    function spawn(i, from, col) { na[i].forEach(function (e) { if (e !== from && pul.length < 170 && rnd() < 0.7) pul.push({ e: e, s: 0, dir: ne[e][0] === i ? 1 : -1, v: 0.9 + rnd() * 0.7, c: col }); }); }
    function neuro(t, fin) {
        var dt = Math.max(0.001, Math.min(0.05, t - nnZeit)); nnZeit = t;
        var ry = t * 0.32, rx = -0.28 + Math.sin(t * 0.2) * 0.1, P = nn.map(function (n) { return proj(n, ry, rx); }), burst = fin > 0;
        if (!burst && t - lastSp > 0.3) { lastSp = t; var i0 = Math.floor(rnd() * NN), cc = seedN++ % PAL.length; nn[i0].f = 1; nn[i0].c = cc; spawn(i0, -1, cc); }
        ne.forEach(function (e) { var a = P[e[0]], b = P[e[1]], al = 0.07 + 0.13 * ((a[3] + b[3]) / 2 - 0.7); x.strokeStyle = 'rgba(' + PAL[nn[e[0]].c] + ',' + Math.max(0.05, al) + ')'; x.lineWidth = 1; x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.stroke(); });
        var np = [];
        pul.forEach(function (p) {
            p.s += p.v * dt * 2.2; var e = ne[p.e], a = P[e[0]], b = P[e[1]], s = p.dir === 1 ? p.s : 1 - p.s, col = PAL[p.c];
            if (p.s >= 1) { var to = p.dir === 1 ? e[1] : e[0]; nn[to].f = 1; nn[to].c = p.c; if (!burst) spawn(to, p.e, p.c); return; }
            var px = a[0] + (b[0] - a[0]) * s, py = a[1] + (b[1] - a[1]) * s;
            for (var k = 1; k <= 6; k++) { var s2 = p.dir === 1 ? Math.max(0, s - k * 0.05) : Math.min(1, s + k * 0.05); x.fillStyle = 'rgba(' + col + ',' + (0.6 - k * 0.09) + ')'; x.beginPath(); x.arc(a[0] + (b[0] - a[0]) * s2, a[1] + (b[1] - a[1]) * s2, 3.6 - k * 0.45, 0, 6.28); x.fill(); }
            x.fillStyle = 'rgba(' + col + ',0.35)'; x.beginPath(); x.arc(px, py, 8, 0, 6.28); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(px, py, 3.6, 0, 6.28); x.fill(); np.push(p);
        });
        pul = np;
        P.map(function (p, i) { return i; }).sort(function (a, b) { return P[b][2] - P[a][2]; }).forEach(function (i) {
            var p = P[i], n = nn[i]; n.f = Math.max(0, n.f - dt * 1.5);
            var r = 2 + 2.4 * p[3] + n.f * 7, col = burst ? PAL[(i + Math.floor(t * 4)) % PAL.length] : PAL[n.c];
            if (n.f > 0.02) { x.fillStyle = 'rgba(' + col + ',' + (n.f * 0.28) + ')'; x.beginPath(); x.arc(p[0], p[1], r * 2.6, 0, 6.28); x.fill(); }
            x.fillStyle = 'rgba(' + col + ',' + (0.5 + 0.5 * Math.min(1, n.f + (p[3] - 0.7))) + ')'; x.beginPath(); x.arc(p[0], p[1], r, 0, 6.28); x.fill();
        });
        if (burst) { nn.forEach(function (n) { n.f = Math.max(n.f, 0.6); }); for (var k2 = 0; k2 < 5; k2++) { var rr = Math.max(0, fin - k2 * 0.12) * 320; x.strokeStyle = 'rgba(' + PAL[k2] + ',' + Math.max(0, 1 - fin / 1.5) + ')'; x.lineWidth = 4; x.beginPath(); x.arc(CX, CY, rr, 0, 6.28); x.stroke(); } }
    }

    /* ---------- Effekt: Nachrichten (Tafeln fliegen heran) ---------- */
    var KAT = [['WELT', '73,215,255'], ['SPORT', '76,255,176'], ['WIRTSCHAFT', '255,200,70'], ['TECHNIK', '160,110,255'], ['WETTER', '255,120,80'], ['REGION', '255,90,200']];
    var NTX = [-190, 0, 190, -190, 0, 190], NTY = [-95, -95, -95, 60, 60, 60], cards = [], stars = [];
    function umbruch(t, n) { var w = String(t || '').replace(/\s+/g, ' ').trim().slice(0, 110).split(' '), z2 = [], l = ''; w.forEach(function (a) { if ((l + ' ' + a).trim().length > n && l) { z2.push(l); l = a; } else l = (l + ' ' + a).trim(); }); if (l) z2.push(l); return z2.slice(0, 6); }
    function newsInit() {
        seed = 9;
        var echt = z.news && z.news.length ? z.news.slice(0, 6) : null;
        cards = (echt || KAT).map(function (k, i) { var c = echt ? '73,215,255' : k[1]; if (echt) c = ['73,215,255', '255,200,70', '76,255,176', '255,90,200', '160,110,255', '255,120,80'][i % 6]; return { n: echt ? k.ort : k[0], c: c, lines: echt ? umbruch(k.titel, 24) : null, tx: NTX[i], ty: NTY[i], sx: (rnd() - 0.5) * 900, sy: (rnd() - 0.5) * 700, sz: 1500 + rnd() * 500, rot: (rnd() < 0.5 ? -1 : 1) * (1.3 + rnd() * 0.6), d: i * 0.38, ln: [0.9, 0.7, 0.5].map(function (a) { return a * (0.7 + rnd() * 0.3); }), img: rnd() }; });
        stars = []; for (var i = 0; i < 90; i++) stars.push({ a: rnd() * 6.28, r: rnd(), v: 0.4 + rnd() * 0.9 });
    }
    function news(t, fin) {
        var ph = fin > 0 ? 9 : t % 9;
        stars.forEach(function (s) { s.r += s.v * 0.012; if (s.r > 1) s.r = 0.02; var rr = s.r * s.r * 520; x.fillStyle = 'rgba(73,215,255,' + (0.15 + s.r * 0.5) + ')'; x.fillRect(CX + Math.cos(s.a) * rr, CY + Math.sin(s.a) * rr * 0.8, 1 + s.r * 2.5, 1 + s.r * 2.5); });
        var out = fin > 0, qo = out ? Math.min(1, fin / 1.1) : 0;
        cards.forEach(function (cd, i) {
            var q = Math.min(1, Math.max(0, (ph - cd.d) / 1.6)), e = ease(q), zz = cd.sz * (1 - e), px = cd.sx * (1 - e) + cd.tx * e, py = cd.sy * (1 - e) + cd.ty * e, rot = cd.rot * (1 - e) + (i % 3 - 1) * 0.16 * e;
            if (out) { zz = -400 * qo * qo; px = cd.tx * (1 + qo * 1.4); py = cd.ty * (1 + qo * 1.4); }
            var f = 520 / (520 + zz); if (f <= 0) return;
            var al = out ? Math.max(0, 1 - qo) : Math.min(1, q * 2.2); if (al <= 0.01) return;
            var bob = (q >= 1 && !out) ? Math.sin(t * 1.6 + i) * 4 : 0;
            x.save(); x.translate(CX + px * f, CY + (py + bob) * f); x.scale(Math.max(0.05, Math.cos(rot)) * f, f); x.globalAlpha = al;
            var w = 176, h = 116;
            x.fillStyle = 'rgba(8,24,34,.88)'; x.fillRect(-w / 2, -h / 2, w, h); x.strokeStyle = 'rgba(' + cd.c + ',1)'; x.lineWidth = 2.5 / f; x.strokeRect(-w / 2, -h / 2, w, h);
            x.fillStyle = 'rgba(' + cd.c + ',.9)'; x.fillRect(-w / 2, -h / 2, w, 22); x.fillStyle = '#04121a'; x.font = '500 14px monospace'; x.fillText(cd.n, -w / 2 + 8, -h / 2 + 16);
            var show = Math.min(1, Math.max(0, (ph - cd.d - 1.2) / 1.2));
            if (cd.lines) { x.fillStyle = 'rgba(191,239,255,.95)'; x.font = '11px monospace'; cd.lines.forEach(function (ln, k) { if (show * 6 > k) x.fillText(ln, -w / 2 + 8, -h / 2 + 40 + k * 14); }); }
            else {
            x.fillStyle = 'rgba(' + cd.c + ',.25)'; x.fillRect(-w / 2 + 8, -h / 2 + 30, 52, 40); x.fillStyle = 'rgba(' + cd.c + ',.6)'; x.fillRect(-w / 2 + 8, -h / 2 + 30 + 40 * (1 - cd.img * 0.6), 52, 40 * cd.img * 0.6);
            for (var l = 0; l < 3; l++) { var lw = (l === 0 ? (w - 84) : (w - 20)) * cd.ln[l] * Math.min(1, Math.max(0, show * 3 - l)); x.fillStyle = 'rgba(191,239,255,.8)'; x.fillRect(l === 0 ? -w / 2 + 68 : -w / 2 + 8, -h / 2 + (l === 0 ? 34 : 80) + (l > 0 ? (l - 1) * 14 : 0), lw, 6); }
            }
            if (q >= 1 && !out) { var sc = ((t * 0.8 + i * 0.4) % 1.6); if (sc < 1) { x.fillStyle = 'rgba(' + cd.c + ',.22)'; x.fillRect(-w / 2, -h / 2 + sc * h, w, 10); } }
            x.restore();
        });
        var tk = 'WELT  ·  SPORT  ·  WIRTSCHAFT  ·  TECHNIK  ·  WETTER  ·  REGION  ·  ', off = (t * 90) % 520;
        x.fillStyle = 'rgba(73,215,255,.12)'; x.fillRect(80, H - 70, W - 160, 26); x.save(); x.beginPath(); x.rect(80, H - 70, W - 160, 26); x.clip(); x.fillStyle = TXT; x.font = '15px monospace'; x.fillText(tk + tk + tk, 88 - off, H - 51); x.restore();
    }

    /* ---------- Effekte: Titel, Statuszeile, geschätzte Dauer ---------- */
    var E = {
        radar: { titel: 'ORTE WERDEN GESCANNT', zeile: '> Umgebung wird abgesucht …', fertig: '> Treffer gefunden', schaetz: 8, init: radarInit, draw: radar },
        route: { titel: 'ROUTE WIRD BERECHNET', zeile: '> Strecke und Verkehr werden geprüft …', fertig: '> Route steht', schaetz: 8, init: function () { }, draw: route },
        globus: { titel: 'INTERNET WIRD DURCHSUCHT', zeile: '> Quellen werden verglichen …', fertig: '> Quellen ausgewertet', schaetz: 12, init: globusInit, draw: globus, klar: true, ohneHaken: true, ende: 2800 },
        regen: { titel: 'WETTER WIRD ABGERUFEN', zeile: '> Vorhersage wird geladen …', fertig: '> Vorhersage da', schaetz: 6, init: regenInit, draw: regen },
        kalender: { titel: 'KALENDER WIRD GELESEN', zeile: '> Termine werden abgeglichen …', fertig: '> Kalender gelesen', schaetz: 6, init: function () { kalInit(false); }, draw: holoKalender(false), klar: true, ohneHaken: true, ende: 2000 },
        kalender_neu: { titel: 'TERMIN WIRD ANGELEGT', zeile: '> Neuer Termin entsteht …', fertig: '> Termin gespeichert', schaetz: 6, init: function () { kalInit(true); }, draw: holoKalender(true), klar: true, ohneHaken: true, ende: 3000 },
        kette: { titel: 'SCHRITTE WERDEN ERLEDIGT', zeile: '> Aufgaben laufen nacheinander …', fertig: '> Alle Schritte erledigt', schaetz: 10, init: function () { }, draw: kette },
        neuro: { titel: 'JARVIS DENKT NACH', zeile: '> Informationen werden verknüpft …', fertig: '> Antwort bereit', schaetz: 12, init: neuroInit, draw: neuro },
        news: { titel: 'SCHLAGZEILEN EMPFANGEN', zeile: '> Nachrichten für dich …', fertig: '> Schlagzeilen bereit', schaetz: 8, init: newsInit, draw: news }
    };
    var ARTEN = Object.keys(E);
    var WERK = { ortssuche: 'radar', adresse: 'radar', fahrzeit: 'route', abfahrt: 'route', ankunft: 'route', dauer_minuten: 'route', websuche: 'globus', produktsuche: 'globus', uhrzeit_anderswo: 'globus', wetter: 'regen', termin_erstellen: 'kalender_neu', termine_lesen: 'kalender', termin_verschieben: 'kalender_neu', schicht: 'kalender', __kette: 'kette' };

    /* ---------- Anzeige ---------- */
    function bauen() {
        if (box) return !!x;
        if (typeof document === 'undefined' || !document.createElement) return false;
        try {
            box = document.createElement('div'); box.id = 'jvEffekt';
            box.style.cssText = 'position:fixed;inset:0;z-index:8500;display:none;align-items:center;justify-content:center;background:rgba(3,10,16,.55);transition:opacity .35s;';
            cv = document.createElement('canvas'); cv.width = W; cv.height = H; cv.setAttribute('aria-hidden', 'true');
            cv.style.cssText = 'width:min(96vw,720px);height:auto;border-radius:12px;background:#050d14;border:1px solid #1d4458;display:block;';
            box.appendChild(cv); box.onclick = function () { z.nutzerWeg = true; verbergen(); };
            document.body.appendChild(box); x = cv.getContext && cv.getContext('2d');
            return !!x;
        } catch (e) { box = null; return false; }
    }
    function verbergen() {
        z.laufend = false; z.sichtbar = false; z.news = null; warterFrei();
        try { if (box) { box.style.opacity = '0'; setTimeout(function () { if (!z.sichtbar && box) box.style.display = 'none'; }, 380); } } catch (e) { }
    }
    function rahmen(t, fin) {
        var def = E[z.art], gl = (Math.floor(t * 10) % 23 === 0) ? 3 : 0, L = 40, len = 34;
        x.strokeStyle = CY1; x.lineWidth = 3;
        [[L, L, 1, 1], [W - L, L, -1, 1], [L, H - L, 1, -1], [W - L, H - L, -1, -1]].forEach(function (q) { x.beginPath(); x.moveTo(q[0], q[1] + q[3] * len); x.lineTo(q[0], q[1]); x.lineTo(q[0] + q[2] * len, q[1]); x.stroke(); });
        x.fillStyle = '#e6f9ff'; x.font = '500 20px monospace'; x.fillText(fin > 0 ? (z.ok ? def.fertig.slice(2).toUpperCase() : 'DAS HAT NICHT GEKLAPPT') : def.titel, L + gl, L + 34);
        var rest = Math.max(0, Math.ceil(def.schaetz - t)), zahl = fin > 0 ? (z.ok ? '✓' : '✗') : (rest > 0 ? '00:' + ('0' + rest).slice(-2) : (Math.floor(t * 2) % 2 ? '···' : '   '));
        x.fillStyle = fin > 0 ? (z.ok ? GR : '#ff8a6b') : CY1; x.font = '500 34px monospace'; x.textAlign = 'right'; x.fillText(zahl, W - L, L + 36); x.textAlign = 'left';
        var s = fin > 0 ? def.fertig : def.zeile, vis = Math.min(s.length, Math.floor((fin > 0 ? 99 : (t % 6)) * 18));
        x.fillStyle = TXT; x.font = '17px monospace'; x.fillText(s.slice(0, vis) + ((t * 2) % 1 < 0.5 ? '_' : ''), L, H - L - 14);
        x.fillStyle = 'rgba(73,215,255,.1)'; x.fillRect(0, (t * 140) % H, W, 3);
        if (fin > 0 && !def.ohneHaken) {
            var c = z.ok ? '76,255,176' : '255,138,107';
            x.strokeStyle = 'rgba(' + c + ',' + Math.max(0, 1 - fin / 1.2) + ')'; x.lineWidth = 5; x.beginPath(); x.arc(CX, CY, Math.min(1, fin) * 320, 0, 6.28); x.stroke();
            x.fillStyle = 'rgba(' + c + ',' + Math.min(1, fin * 3) + ')'; x.font = '500 110px monospace'; x.textAlign = 'center'; x.fillText(z.ok ? '✓' : '✗', CX, CY + 36); x.textAlign = 'left';
        }
    }
    function bild() {
        raf = 0;
        if (!z.laufend && !z.endeAt) return;
        try {
            var t = (jetzt() - z.t0) / 1000, fin = z.endeAt ? (jetzt() - z.endeAt) / 1000 : 0;
            if (z.endeAt && jetzt() - z.endeAt > (E[z.art].ende || ENDE_MS)) { z.endeAt = 0; verbergen(); return; }
            if (typeof document !== 'undefined' && document.hidden) { raf = requestAnimationFrame(bild); return; }
            x.fillStyle = E[z.art].klar ? '#050d14' : 'rgba(5,13,20,.34)'; x.fillRect(0, 0, W, H);
            E[z.art].draw(t, fin); rahmen(t, fin);
            raf = requestAnimationFrame(bild);
        } catch (e) { verbergen(); }
    }
    function zeige(art) {
        try {
            if (!an || z.nutzerWeg) return false;
            art = E[art] ? art : 'neuro';
            if (!bauen()) return false;
            z.art = art; z.t0 = jetzt(); z.endeAt = 0; z.ok = true; z.laufend = true; z.sichtbar = true; z.startNun = 0;
            E[art].init();
            box.style.display = 'flex'; box.style.opacity = '1';
            x.fillStyle = '#050d14'; x.fillRect(0, 0, W, H);
            if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(bild);
            return true;
        } catch (e) { return false; }
    }
    function ende(ok) {
        try {
            if (!z.laufend) return false;
            z.ok = ok !== false; z.laufend = false; z.endeAt = jetzt();
            if (!raf && typeof requestAnimationFrame === 'function') raf = requestAnimationFrame(bild);
            return true;
        } catch (e) { return false; }
    }

    /* ---------- Steuerung: Hinweise und Takt ---------- */
    function hinweis(art) { try { if (E[art]) { z.hint = art; z.hintAt = jetzt(); if (z.laufend && z.art !== art && !z.begleitArt) wechsle(art); } } catch (e) { } }
    function wechsle(art) { try { if (z.laufend && E[art] && z.art !== art) { z.art = art; z.t0 = jetzt(); E[art].init(); } } catch (e) { } }
    function werkzeug(name, params) {
        var a = WERK[name]; if (a) { z.hintParams = params && typeof params === 'object' ? params : null; hinweis(a); }
    }
    function begleite(art, p, orte) {
        try {
            if (!p || typeof p.then !== 'function' || !E[art]) return p;
            var anz = art === 'news' ? 'globus' : art;   // Nachrichten: erst Globus beim Laden, dann fliegen die echten Schlagzeilen ein
            z.begleit++; z.begleitArt = anz; if (!z.begleitSeit) z.begleitSeit = jetzt();
            var fertig = function () { z.begleit = Math.max(0, z.begleit - 1); if (!z.begleit) { z.begleitArt = null; z.begleitSeit = 0; } };
            p.then(function (res) {
                try {
                    if (art === 'news' && z.laufend && res && res.length) {
                        var t = [];
                        res.forEach(function (a, i) { (a || []).forEach(function (n) { if (n && n.title) t.push({ ort: String((orte && orte[i]) || 'NEWS').toUpperCase(), titel: String(n.title) }); }); });
                        if (t.length) { z.news = t.slice(0, 6); z.t0 = jetzt(); z.art = 'news'; z.begleitArt = 'news'; E.news.init(); setTimeout(fertig, NEWS_LESEN_MS); return; }
                    }
                } catch (e) { }
                fertig();
            }, fertig);
        } catch (e) { }
        return p;
    }
    function arbeit(p) {   // allgemeine Arbeit (z. B. Chef-KI): Effekt läuft, bis sie fertig ist; die Art bestimmen Hinweise, sonst Neuronen-Netz
        try {
            if (!p || typeof p.then !== 'function') return p;
            z.begleit++;
            var fertig = function () { z.begleit = Math.max(0, z.begleit - 1); if (!z.begleit) { z.begleitArt = null; z.begleitSeit = 0; } };
            p.then(fertig, fertig);
        } catch (e) { }
        return p;
    }
    var warter = [];
    function warteBisFertig(maxMs) {   // Nachrichten-Karten warten, bis der Effekt zu Ende ist (nichts überlagert sich)
        return new Promise(function (res) {
            try {
                if (!(z.laufend && z.art === 'news')) { res(false); return; }
                var einmal = function () { var k = warter.indexOf(einmal); if (k >= 0) warter.splice(k, 1); res(true); };
                warter.push(einmal); setTimeout(einmal, maxMs || 12000);   // Sicherheit: nie ewig warten
            } catch (e) { res(false); }
        });
    }
    function warterFrei() { var a = warter.slice(); warter = []; a.forEach(function (f) { try { f(); } catch (e) { } }); }
    function busy() { try { return typeof isProcessing !== 'undefined' && !!isProcessing; } catch (e) { return false; } }
    function pruefe(nun) {
        try {
            nun = typeof nun === 'number' ? nun : jetzt();
            var arbeitet = busy() || z.begleit > 0;
            if (arbeitet) {
                if (!z.busySince) z.busySince = nun;
                if (!z.laufend && !z.endeAt && an && !z.nutzerWeg && nun - z.busySince >= VERZOEGERUNG) {
                    var art = z.begleitArt || (z.hint && nun - z.hintAt < HINWEIS_MS ? z.hint : 'neuro');
                    if (zeige(art)) z.startNun = nun;
                } else if (z.laufend && !z.begleitArt && z.hint && nun - z.hintAt < HINWEIS_MS && z.hint !== z.art) wechsle(z.hint);
            } else {
                z.busySince = 0; z.nutzerWeg = false;
                if (z.laufend && !(z.startNun && nun - z.startNun < MINDEST_MS)) ende(true);
            }
        } catch (e) { }
    }
    function lesen() { try { return typeof getPersistentData === 'function' ? getPersistentData('jv_effekte', 'an') !== 'aus' : true; } catch (e) { return true; } }
    function schalten(ein) {
        an = !!ein;
        try { if (typeof setPersistentData === 'function') setPersistentData('jv_effekte', an ? 'an' : 'aus'); } catch (e) { }
        if (!an && z.laufend) { z.laufend = false; z.endeAt = 0; verbergen(); }
        try { var sw = document.getElementById && document.getElementById('effekteSchalter'); if (sw) sw.checked = an; } catch (e) { }
        return an;
    }
    function sage(txt) { try { speak(txt, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }

    window.jvEffekt = {
        hinweis: hinweis, werkzeug: werkzeug, begleite: begleite, arbeit: arbeit, warteBisFertig: warteBisFertig, zeige: zeige, ende: ende, pruefe: pruefe,
        an: function () { return schalten(true); }, aus: function () { return schalten(false); }, istAn: function () { return an; },
        zustand: function () { return { laufend: z.laufend, art: z.art, sichtbar: z.sichtbar, ok: z.ok, endeAt: z.endeAt, busySince: z.busySince, nutzerWeg: z.nutzerWeg, news: z.news ? z.news.length : 0 }; },
        ARTEN: ARTEN, WERKZEUG: WERK
    };

    function start() {
        an = lesen();
        try { var sw = document.getElementById && document.getElementById('effekteSchalter'); if (sw) { sw.checked = an; sw.addEventListener('change', function () { schalten(!!sw.checked); }); } } catch (e) { }
        try { setInterval(function () { pruefe(); }, 250); } catch (e) { }
    }
    if (window.jvCommands) {
        window.jvCommands.use('effekte', function (text, next) {
            try {
                var t = String(text || '').toLowerCase().replace(/[,!?.;]+/g, ' ').replace(/\s+/g, ' ').trim();
                var m = t.match(/^(?:bitte\s+)?(?:(?:schalte|mach|stell)\s+(?:die\s+|alle\s+)?(?:effekte|animationen)\s+(aus|an|ein|ab)|(?:effekte|animationen)\s+(aus|an|ein|ab)(?:schalten)?)(?:\s+bitte)?$/);
                if (m) {
                    var w = m[1] || m[2], ein = w === 'an' || w === 'ein';
                    schalten(ein);
                    sage(ein ? 'Alles klar, die Effekte sind wieder an.' : 'Okay, die Effekte sind aus. Ich arbeite ab jetzt ohne Show.');
                    return true;
                }
            } catch (e) { console.error('Effekte', e); }
            return next(text);
        }, 119);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
