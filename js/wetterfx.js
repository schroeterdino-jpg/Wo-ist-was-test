/* ============================================================
   WETTER IM HINTERGRUND: Hinter dem Kopf fällt Regen, Schnee, es zieht Nebel auf oder es blitzt leise bei Gewitter,
   passend zum echten Wetter am Standort. Bei Sonne/Wolken bleibt alles wie es ist. Der Kopf selbst bleibt unverändert.
   Die Ebene liegt hinter allem (z-index 0), reagiert nicht auf Berührung und pausiert, wenn die Seite im Hintergrund ist.
   Bei "Bewegung reduzieren" im Handy bleibt sie aus.
   Sprache: "Wetter-Effekt an/aus", "Wetter-Effekt Regen/Schnee/Nebel/Gewitter" (Vorschau, bis "Wetter-Effekt echt").
   Braucht: briefing.js (fetchWeatherData), storage.js, commands.js. Fehlt etwas, passiert einfach nichts.
   ============================================================ */
(function () {
    'use strict';
    var KEY = 'helfer_wetterfx';
    var cv = null, ctx = null, raf = 0, W = 0, H = 0, art = '', stark = 1, wind = 0, vorschau = '', last = 0, wxAt = 0, wxBusy = false;
    var tropfen = [], flocken = [], nebel = [], blitz = 0, naechsterBlitz = 0;

    function pd(k, d) { try { return getPersistentData(k, d); } catch (e) { return d; } }
    function sd(k, v) { try { setPersistentData(k, v); } catch (e) {} }
    function an() { return pd(KEY, 'an') !== 'aus'; }
    function weniger() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }

    function artAusCode(c, mm) {
        c = Number(c);
        if (c === 45 || c === 48) return 'nebel';
        if (c >= 95) return 'gewitter';
        if ((c >= 71 && c <= 77) || c === 85 || c === 86) return 'schnee';
        if ((c >= 51 && c <= 67) || (c >= 80 && c <= 82)) return 'regen';
        if (mm > 0.1) return 'regen';
        return '';
    }

    function anlegen() {
        if (cv) return true;
        if (!document.body) return false;
        cv = document.createElement('canvas'); cv.id = 'jvWetterFx';
        cv.style.cssText = 'position:fixed;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0;transition:opacity 1.2s';
        document.body.insertBefore(cv, document.body.firstChild);
        ctx = cv.getContext('2d');
        return true;
    }

    function messen() {
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        var w = window.innerWidth, h = window.innerHeight;
        if (w === W && h === H) return;
        W = w; H = h; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function fuellen() {
        tropfen = []; flocken = []; nebel = [];
        var n = art === 'gewitter' ? 140 : Math.round(120 * stark);
        for (var i = 0; i < n; i++) tropfen.push({ x: Math.random() * 1.3 - .15, y: Math.random(), l: 10 + Math.random() * 16, v: .7 + Math.random() * .6, a: .2 + Math.random() * .4 });
        for (var j = 0; j < Math.round(70 * stark); j++) flocken.push({ x: Math.random(), y: Math.random(), r: 1 + Math.random() * 2.4, v: .05 + Math.random() * .09, p: Math.random() * 6.28, a: .35 + Math.random() * .5 });
        for (var k = 0; k < 6; k++) nebel.push({ x: Math.random(), y: .15 + Math.random() * .7, r: .35 + Math.random() * .3, v: (Math.random() < .5 ? -1 : 1) * (.006 + Math.random() * .01), a: .07 + Math.random() * .06 });
    }

    function zeichnen(dt, t) {
        ctx.clearRect(0, 0, W, H);
        if (art === 'regen' || art === 'gewitter') {
            var kipp = Math.max(-.5, Math.min(.5, wind / 60)) + .12;
            ctx.lineWidth = 1.4; ctx.lineCap = 'round';
            tropfen.forEach(function (d) {
                d.y += d.v * dt * .9; d.x += kipp * d.v * dt * .9 * (H / W);
                if (d.y > 1.05) { d.y = -.05; d.x = Math.random() * 1.3 - .15; }
                var x = d.x * W, y = d.y * H;
                ctx.strokeStyle = 'rgba(150,215,255,' + d.a + ')';
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + kipp * d.l, y + d.l); ctx.stroke();
            });
        }
        if (art === 'schnee') {
            flocken.forEach(function (f) {
                f.y += f.v * dt; f.p += dt * 1.1;
                if (f.y > 1.03) { f.y = -.03; f.x = Math.random(); }
                var x = (f.x + Math.sin(f.p) * .018 + wind / 900 * f.y) * W, y = f.y * H;
                ctx.fillStyle = 'rgba(235,248,255,' + f.a + ')'; ctx.beginPath(); ctx.arc(x, y, f.r, 0, 7); ctx.fill();
            });
        }
        if (art === 'nebel') {
            nebel.forEach(function (b) {
                b.x += b.v * dt; if (b.x < -.4) b.x = 1.4; if (b.x > 1.4) b.x = -.4;
                var x = b.x * W, y = b.y * H, r = b.r * Math.max(W, H) * .7;
                var g = ctx.createRadialGradient(x, y, 0, x, y, r);
                g.addColorStop(0, 'rgba(190,215,225,' + b.a + ')'); g.addColorStop(1, 'rgba(190,215,225,0)');
                ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2);
            });
        }
        if (art === 'gewitter') {
            if (t > naechsterBlitz) { blitz = .16; naechsterBlitz = t + 6 + Math.random() * 8; }   // sanft und selten (kein Flackern)
            if (blitz > 0) { ctx.fillStyle = 'rgba(200,225,255,' + blitz + ')'; ctx.fillRect(0, 0, W, H); blitz = Math.max(0, blitz - dt * .5); }
        }
    }

    function schleife(now) {
        raf = 0;
        if (!art || document.hidden) return;
        if (!last) last = now;
        var dt = Math.min(.05, (now - last) / 1000); last = now;
        messen(); zeichnen(dt, now / 1000);
        raf = requestAnimationFrame(schleife);
    }

    function setzen(neu, s, w) {
        if (neu === art && s === stark) { wind = w || 0; return; }
        art = neu; stark = s || 1; wind = w || 0;
        if (!anlegen()) { art = ''; return; }
        if (!art || !an() || weniger()) { art = ''; cv.style.opacity = 0; return; }
        messen(); fuellen(); last = 0; naechsterBlitz = 0;
        cv.style.opacity = 1;
        if (!raf) raf = requestAnimationFrame(schleife);
    }

    function aktualisieren() {
        if (vorschau) { setzen(vorschau, 1, 10); return; }
        if (!an()) { setzen('', 1, 0); return; }
        if (wxBusy || Date.now() - wxAt < 15 * 60000 || typeof fetchWeatherData !== 'function') return;
        wxBusy = true;
        fetchWeatherData().then(function (d) {
            wxAt = Date.now();
            if (!d || d.fehler) return;
            var mm = Number(d.niederschlag) || 0;
            setzen(artAusCode(d.wettercode, mm), mm > 2 ? 1.5 : 1, Number(d.windstaerke) || 0);
        }).catch(function () {}).then(function () { wxBusy = false; });
    }

    function befehl(text, next) {
        var t = String(text || '').toLowerCase().replace(/[.!?,]/g, '').trim();
        if (!/wetter[- ]?(?:effekt|animation|hintergrund)/.test(t)) return next();
        var spr = window.speak || function () {};
        if (/\baus|abschalten|ausstellen/.test(t)) { sd(KEY, 'aus'); vorschau = ''; setzen('', 1, 0); spr('Wetter-Effekt ausgeschaltet.'); return true; }
        var m = t.match(/regen|schnee|nebel|gewitter/);
        if (m) { sd(KEY, 'an'); vorschau = m[0]; setzen(vorschau, 1, 10); spr('Vorschau: ' + vorschau + '. Mit "Wetter-Effekt echt" gilt wieder das echte Wetter.'); return true; }
        if (/echt|normal|zurück/.test(t)) { vorschau = ''; wxAt = 0; setzen('', 1, 0); aktualisieren(); spr('Der Hintergrund folgt wieder dem echten Wetter.'); return true; }
        sd(KEY, 'an'); wxAt = 0; aktualisieren(); spr('Wetter-Effekt eingeschaltet.'); return true;
    }

    function start() {
        window.jvWetterFx = { zeige: function (a) { vorschau = a || ''; setzen(vorschau, 1, 10); } };
        try { if (window.jvCommands) window.jvCommands.use('wetterfx', befehl, 37); } catch (e) {}
        aktualisieren();
        setInterval(aktualisieren, 5 * 60000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden && art && !raf) { last = 0; raf = requestAnimationFrame(schleife); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
