/* ============================================================
   SYNAPSEN: Während Jarvis nachdenkt (nach deiner Frage, vor der Antwort), blitzt um den Kopf ein Netz aus Punkten und Linien auf.
   Lichtimpulse laufen an den Linien entlang, dazu blitzen Stichworte, was er gerade abruft (KALENDER, WETTER, VERKEHR ...),
   und unter dem Kopf steht "SYSTEME WERDEN DURCHSUCHT...". Der Kopf selbst bleibt unverändert.
   Läuft nur, solange isProcessing wahr ist; sonst wird nichts gezeichnet (Akku). Bei "Bewegung reduzieren" bleibt nur der Text.
   Ein/Aus per Sprache: "Synapsen aus" / "Synapsen an". Standard: an.
   Braucht: voice.js (isProcessing), storage.js, commands.js (jvCommands). Fehlt etwas, passiert einfach nichts.
   ============================================================ */
(function () {
    'use strict';
    var KEY = 'helfer_synapsen';
    var WORTE = [
        [/wetter|regen|temperatur|sonne|schnee|wind|warm|kalt/i, 'WETTER'],
        [/termin|kalender|verabredung|geburtstag|ferien|feiertag/i, 'KALENDER'],
        [/route|stau|fahr|navig|verkehr|weg|autobahn|bahn|zug|parkplatz|tanken|sprit/i, 'VERKEHR'],
        [/erinner|wecker|timer/i, 'ERINNERUNGEN'],
        [/einkauf|aufgabe|liste/i, 'LISTEN'],
        [/mail|nachricht|post/i, 'POSTEINGANG'],
        [/ruf |anruf|kontakt|nummer|adresse/i, 'KONTAKTE'],
        [/merk|gedächtnis|weißt du|erinnerst/i, 'GEDÄCHTNIS'],
        [/schicht|dienst|arbeit/i, 'SCHICHTPLAN'],
        [/bundesliga|fußball|spiel|tabelle|ergebnis/i, 'SPORT'],
        [/nachrichten|news|aktuell/i, 'NACHRICHTEN']
    ];
    var cv = null, ctx = null, txt = null, raf = 0, aktiv = false, alpha = 0, t0 = 0, worte = [], nodes = [], edges = [], R = 150, cx = 0, cy = 0, W = 0, H = 0, letzterText = '';

    function pd(k, d) { try { return getPersistentData(k, d); } catch (e) { return d; } }
    function sd(k, v) { try { setPersistentData(k, v); } catch (e) {} }
    function an() { return pd(KEY, 'an') !== 'aus'; }
    function weniger() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
    function denkt() { try { return typeof isProcessing !== 'undefined' && !!isProcessing; } catch (e) { return false; } }

    function stichworte(text) {
        var o = [];
        WORTE.forEach(function (w) { if (w[0].test(text) && o.indexOf(w[1]) < 0) o.push(w[1]); });
        return o.length ? o.slice(0, 4) : ['WISSEN'];
    }

    function bauen() {
        var seed = 7; function rnd() { seed = (seed * 16807) % 2147483647; return seed / 2147483647; }
        nodes = []; edges = [];
        while (nodes.length < 24) { var a = rnd() * Math.PI * 2, r = .58 + rnd() * .44; nodes.push({ x: Math.cos(a) * r, y: Math.sin(a) * r * .95 }); }
        nodes.forEach(function (n, i) {
            nodes.map(function (m, j) { return { j: j, d: Math.hypot(n.x - m.x, n.y - m.y) }; }).filter(function (o) { return o.j !== i; })
                .sort(function (a, b) { return a.d - b.d; }).slice(0, 2).forEach(function (o) { if (!edges.some(function (e) { return e[0] === o.j && e[1] === i; })) edges.push([i, o.j]); });
        });
    }

    function anlegen() {
        if (cv) return true;
        var host = document.querySelector('.holo-container');
        if (!host) return false;
        cv = document.createElement('canvas'); cv.id = 'jvSynapsen';
        cv.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none;z-index:5;opacity:0;transition:opacity .35s';
        document.body.appendChild(cv); ctx = cv.getContext('2d');
        txt = document.createElement('div'); txt.id = 'jvSynText';
        txt.style.cssText = 'position:fixed;left:0;right:0;text-align:center;pointer-events:none;z-index:5;opacity:0;transition:opacity .35s;font:700 11px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.16em;color:#5ee7ff';
        document.body.appendChild(txt);
        bauen();
        return true;
    }

    function messen() {
        var host = document.querySelector('.holo-container'); if (!host) return false;
        var r = host.getBoundingClientRect(); if (!r.width) return false;
        var dpr = Math.min(window.devicePixelRatio || 1, 2);
        R = r.width * .56; cx = r.left + r.width / 2; cy = r.top + r.height / 2;
        W = window.innerWidth; H = window.innerHeight;
        if (cv.width !== Math.round(W * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        cv.style.width = W + 'px'; cv.style.height = H + 'px'; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        txt.style.top = Math.round(r.bottom + R * .12) + 'px';
        return true;
    }

    function glow(px, py, rad, a) {
        var g = ctx.createRadialGradient(px, py, 0, px, py, rad);
        g.addColorStop(0, 'rgba(180,245,255,' + a + ')'); g.addColorStop(.4, 'rgba(94,231,255,' + (a * .5) + ')'); g.addColorStop(1, 'rgba(94,231,255,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(px, py, rad, 0, 7); ctx.fill();
    }

    function zeichnen(t) {
        ctx.clearRect(0, 0, W, H);
        ctx.globalCompositeOperation = 'lighter';
        var s = R / 430;   // Maße der Vorschau (Ringradius 430) auf die echte Größe umrechnen
        ctx.lineWidth = 1.2;
        edges.forEach(function (e, k) {
            var a = nodes[e[0]], b = nodes[e[1]], ax = cx + a.x * R, ay = cy + a.y * R, bx = cx + b.x * R, by = cy + b.y * R;
            ctx.strokeStyle = 'rgba(94,231,255,.16)'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
            var ph = (t * 2 + k * .137) % 1;
            if (ph < .5) { var q = ph * 2, px = ax + (bx - ax) * q, py = ay + (by - ay) * q; ctx.strokeStyle = 'rgba(150,240,255,.5)'; ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(px, py); ctx.stroke(); glow(px, py, 16 * s, .9); }
        });
        nodes.forEach(function (n, i) {
            var f = .5 + .5 * Math.sin(t * Math.PI * 4 + i * 1.7), px = cx + n.x * R, py = cy + n.y * R;
            glow(px, py, (10 + f * 10) * s, .35 + f * .5); ctx.fillStyle = '#bff6ff'; ctx.beginPath(); ctx.arc(px, py, 3 * s + .5, 0, 7); ctx.fill();
        });
        ctx.globalCompositeOperation = 'source-over';
        ctx.font = '700 ' + Math.max(9, Math.round(21 * s)) + 'px ui-monospace,Menlo,Consolas,monospace'; ctx.textAlign = 'center';
        worte.forEach(function (w, k) {
            var f = (t * 1.2 + k / worte.length) % 1;
            if (f < .45) {
                var n = nodes[(k * 7 + 3) % nodes.length], al = Math.sin(f / .45 * Math.PI);
                var px = Math.min(W - 60, Math.max(60, cx + n.x * R)), py = cy + n.y * R - 20 * s;
                ctx.fillStyle = 'rgba(190,248,255,' + al + ')'; ctx.fillText(w, px, py);
            }
        });
        txt.textContent = '● SYSTEME WERDEN DURCHSUCHT' + '...'.slice(0, 1 + Math.floor(t * 4) % 3);
    }

    function schleife(now) {
        raf = 0;
        if (!aktiv && alpha <= 0) { cv.style.opacity = 0; txt.style.opacity = 0; ctx.clearRect(0, 0, W, H); return; }
        if (document.hidden) return;
        if (messen() && !weniger()) zeichnen(((now - t0) / 3000) % 1);
        raf = requestAnimationFrame(schleife);
    }

    function start() {
        if (aktiv || !an() || !anlegen()) return;
        aktiv = true; alpha = 1; t0 = performance.now(); worte = stichworte(letzterText);
        if (!messen()) { aktiv = false; return; }
        cv.style.opacity = 1; txt.style.opacity = 1;
        if (weniger()) txt.textContent = '● SYSTEME WERDEN DURCHSUCHT...';
        if (!raf) raf = requestAnimationFrame(schleife);
    }
    function stop() {
        if (!aktiv) return;
        aktiv = false; cv.style.opacity = 0; txt.style.opacity = 0;
        setTimeout(function () { alpha = 0; if (!aktiv && ctx) ctx.clearRect(0, 0, W, H); }, 450);
    }

    function einhaengen() {
        // Fragetext merken (für die Stichworte)
        try {
            if (typeof sendToGroqSmart === 'function' && !sendToGroqSmart._jvSyn) {
                var orig = sendToGroqSmart;
                sendToGroqSmart = function (text) { letzterText = String(text || ''); return orig.apply(this, arguments); };
                sendToGroqSmart._jvSyn = true;
            }
        } catch (e) {}
        setInterval(function () { if (document.hidden) return; if (denkt()) start(); else stop(); }, 200);
    }

    function befehl(text, next) {
        var t = String(text || '').toLowerCase().replace(/[.!?,]/g, '').trim();
        var m = t.match(/^(?:(?:jarvis|zane|nova)[ ]+)?(?:die )?synapsen(?: ?(aus|an|ausschalten|einschalten))?$/);
        if (m && m[1]) {
            var aus = /^(aus|ausschalten)$/.test(m[1]);
            sd(KEY, aus ? 'aus' : 'an'); if (aus) stop();
            speak(aus ? 'Synapsen ausgeschaltet.' : 'Synapsen eingeschaltet.');
            return true;
        }
        return next();
    }
    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('synapsen', befehl, 37);
        return true;
    }
    if (!cmd()) { var n = 0, iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', einhaengen); else einhaengen();
})();
