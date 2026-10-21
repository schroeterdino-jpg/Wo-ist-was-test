/* ============================================================
   START-ANIMATION: Beim Öffnen der App (einmal je Start, ca. 5 Sekunden) tippen sich Prüfzeilen ein
   (SPRACHE, STIMME, GEDÄCHTNIS, KALENDER, STANDORT, WETTER, VERKEHR, SCHICHTPLAN, SYNAPSEN), jede mit echtem Ergebnis: grünes OK
   oder orange AUS. Dann "ALLE SYSTEME ONLINE", ein Blitz, und die Oberfläche steht. Dazu ein kurzer Hochfahr-Ton (nur wenn der Browser
   Ton ohne vorherigen Tipp erlaubt, sonst bleibt es still). Ein Tipp auf den Bildschirm überspringt alles.
   Nicht bei: Öffnen über eine Benachrichtigung (?brief=1), "Bewegung reduzieren", "Startanimation aus".
   Ein/Aus per Sprache: "Startanimation aus" / "Startanimation an". Standard: an.
   Steht ganz oben im <body> (läuft sofort, damit die Oberfläche nicht kurz aufblitzt). Braucht nichts anderes; fehlt etwas, wird übersprungen.
   ============================================================ */
(function () {
    'use strict';
    var KEY = 'helfer_boot', DAUER = 5000;
    function ls(k, d) { try { var v = localStorage.getItem(k); return v === null || v === 'null' || v === 'undefined' ? d : v; } catch (e) { return d; } }
    function an() { return ls(KEY, 'an') !== 'aus'; }
    window.jvBootAn = an;
    window.jvBootSetzen = function (ein) { try { localStorage.setItem(KEY, ein ? 'an' : 'aus'); sessionStorage.setItem(KEY, ein ? 'an' : 'aus'); } catch (e) {} };
    function weniger() { try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } }
    /* Von "Hey Jarvis" geweckt: keine Startanimation, Jarvis soll sofort "Ja?" sagen und zuhören (native_speech.js setzt __zaneWakeAt) */
    try { if (window.__zaneWakePending || Date.now() - (window.__zaneWakeAt || 0) < 15000) return; } catch (e) {}
    if (!an() || weniger() || /[?&](brief|nostart)=/.test(location.search) || window.__jvBootGelaufen) return;
    window.__jvBootGelaufen = true;

    var ov = document.createElement('div');
    ov.id = 'jvBoot';
    ov.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:#03070d;color:#5ee7ff;font-family:ui-monospace,Menlo,Consolas,monospace;overflow:hidden;touch-action:manipulation;transition:opacity .45s ease';
    ov.innerHTML =
        '<style>#jvBoot .z{display:flex;justify-content:space-between;font-size:14px;letter-spacing:.08em;line-height:1;margin:0 0 17px;white-space:nowrap}' +
        '#jvBoot .ok{color:#7dffb0}#jvBoot .no{color:#ffb347}' +
        '#jvBoot .bar{height:12px;border:1px solid rgba(94,231,255,.5);margin-top:26px;padding:2px}#jvBoot .bar i{display:block;height:100%;width:0;background:rgba(94,231,255,.85)}' +
        '#jvBoot .fl{position:absolute;inset:0;background:radial-gradient(circle at 50% 45%,rgba(220,252,255,.95),rgba(94,231,255,.5) 40%,rgba(94,231,255,0) 75%);opacity:0;pointer-events:none}' +
        '@keyframes jvBootRuck{0%,100%{transform:none}20%{transform:translateX(-10px)}40%{transform:translateX(8px) skewX(2deg)}60%{transform:translateX(-5px)}80%{transform:translateX(3px)}}' +
        '.jvBootRuck{animation:jvBootRuck .35s steps(2,end)}' +
        '#jvBoot .tip{position:absolute;left:0;right:0;bottom:28px;text-align:center;font-size:10px;letter-spacing:.2em;color:rgba(94,231,255,.4)}</style>' +
        '<div style="position:absolute;left:22px;right:22px;top:15vh">' +
        '<div style="font-size:12px;letter-spacing:.3em;margin-bottom:26px;color:rgba(94,231,255,.7)">N O V A  ·  SYSTEMSTART</div>' +
        '<div id="jvBootZ"></div><div class="bar"><i id="jvBootB"></i></div>' +
        '<div id="jvBootEnde" style="margin-top:34px;text-align:center;font-size:19px;font-weight:700;letter-spacing:.18em;color:#7dffb0;opacity:0"></div></div>' +
        '<div class="tip">ANTIPPEN ZUM ÜBERSPRINGEN</div><div class="fl" id="jvBootFl"></div>';
    function einsetzen() { (document.body || document.documentElement).appendChild(ov); }
    if (document.body) einsetzen(); else document.addEventListener('DOMContentLoaded', einsetzen);

    var beendet = false, timers = [];
    function spaeter(fn, ms) { timers.push(setTimeout(fn, ms)); }

    /* ---------- Ton: aufsteigendes Sirren + Ping (nur wenn der Browser es ohne Tipp erlaubt) ---------- */
    var ac = null;
    function ton() {
        try {
            if (localStorage.getItem('helfer_bootton') !== 'an') return;   // Standard: still
            var AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
            ac = new AC(); if (ac.state !== 'running') { try { ac.close(); } catch (e) {} ac = null; return; }
            var t = ac.currentTime, o = ac.createOscillator(), g = ac.createGain();
            o.type = 'sawtooth'; o.frequency.setValueAtTime(90, t); o.frequency.exponentialRampToValueAtTime(900, t + 4.2);
            g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(.05, t + 1.5); g.gain.linearRampToValueAtTime(.08, t + 4.2); g.gain.linearRampToValueAtTime(0, t + 4.35);
            var f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.setValueAtTime(400, t); f.frequency.exponentialRampToValueAtTime(3500, t + 4.2);
            o.connect(f); f.connect(g); g.connect(ac.destination); o.start(t); o.stop(t + 4.4);
            var p = ac.createOscillator(), pg = ac.createGain(); p.type = 'sine'; p.frequency.setValueAtTime(1320, t + 4.35);
            pg.gain.setValueAtTime(0, t + 4.35); pg.gain.linearRampToValueAtTime(.12, t + 4.37); pg.gain.exponentialRampToValueAtTime(.001, t + 5.0);
            p.connect(pg); pg.connect(ac.destination); p.start(t + 4.35); p.stop(t + 5.05);
        } catch (e) {}
    }
    function tonAus() { try { if (ac) { ac.close(); ac = null; } } catch (e) {} }

    /* ---------- echte Prüfungen ---------- */
    function pruefen(fertig) {
        var r = {};
        try { r.sprache = !!(window.SpeechRecognition || window.webkitSpeechRecognition); } catch (e) { r.sprache = false; }
        try { r.stimme = ('speechSynthesis' in window) || !!window.Audio; } catch (e) { r.stimme = false; }
        try { r.gedaechtnis = (function () { localStorage.setItem('__jvb', '1'); localStorage.removeItem('__jvb'); return true; })(); } catch (e) { r.gedaechtnis = false; }
        r.kalender = ls('google_access_token', '') !== '' || ls('helfer_calendar_entries', '[]') !== '[]';
        r.wetter = navigator.onLine !== false;
        r.verkehr = navigator.onLine !== false && ls('helfer_work_address', '') !== '';
        r.schicht = ls('jv_schicht', '') !== '';
        r.synapsen = ls('helfer_synapsen', 'an') !== 'aus';
        r.standort = null;
        var fertigGerufen = false;
        function los() { if (fertigGerufen) return; fertigGerufen = true; fertig(r); }
        try {
            if (navigator.permissions && navigator.permissions.query) {
                navigator.permissions.query({ name: 'geolocation' }).then(function (s) { r.standort = s.state !== 'denied'; los(); }, function () { r.standort = !!navigator.geolocation; los(); });
                setTimeout(function () { if (r.standort === null) r.standort = !!navigator.geolocation; los(); }, 400);
            } else { r.standort = !!navigator.geolocation; los(); }
        } catch (e) { r.standort = !!navigator.geolocation; los(); }
    }

    function ende(schnell) {
        if (beendet) return; beendet = true;
        timers.forEach(clearTimeout); tonAus();
        var fl = document.getElementById('jvBootFl');
        function raus() {
            ov.style.opacity = 0; ov.style.pointerEvents = 'none';
            var sh = document.querySelector('.app-shell'); if (sh) { sh.classList.add('jvBootRuck'); setTimeout(function () { sh.classList.remove('jvBootRuck'); }, 400); }
            setTimeout(function () { try { ov.remove(); } catch (e) {} }, 600);
        }
        if (schnell) { raus(); return; }
        if (fl) { fl.style.transition = 'opacity .12s'; fl.style.opacity = 1; }
        setTimeout(function () { if (fl) { fl.style.transition = 'opacity .3s'; fl.style.opacity = 0; } raus(); }, 160);
    }
    ov.addEventListener('pointerdown', function () { ende(true); });
    window.jvBootBeenden = function () { try { ende(true); } catch (e) {} };
    document.addEventListener('visibilitychange', function () { if (document.hidden) ende(true); });
    spaeter(function () { ende(true); }, DAUER + 1500);   // Sicherung: bleibt nie hängen

    pruefen(function (r) {
        if (beendet) return;
        var Z = [['JARVIS KERNEL 5.1', true], ['SPRACHE', r.sprache], ['STIMME', r.stimme], ['GEDÄCHTNIS', r.gedaechtnis], ['KALENDER', r.kalender],
                 ['STANDORT', r.standort], ['WETTER', r.wetter], ['VERKEHR', r.verkehr], ['SCHICHTPLAN', r.schicht], ['SYNAPSEN', r.synapsen]];
        var box = document.getElementById('jvBootZ'), bar = document.getElementById('jvBootB'), end = document.getElementById('jvBootEnde');
        var start = 150, schritt = 300, breite = Math.max(24, Math.min(34, Math.floor((window.innerWidth - 44) / 8.7)));
        ton();
        Z.forEach(function (z, i) {
            spaeter(function () {
                var row = document.createElement('div'); row.className = 'z'; box.appendChild(row);
                var name = '> ' + z[0] + ' ', n = 0, rest = breite - name.length - 3;
                var dots = new Array(Math.max(3, rest) + 1).join('.');
                var voll = name + dots, step = Math.max(8, Math.floor(voll.length / 7));
                (function tippe() {
                    if (beendet) return; n = Math.min(voll.length, n + step);
                    row.innerHTML = '<span>' + voll.slice(0, n) + '</span><span></span>';
                    if (n < voll.length) { spaeter(tippe, 28); return; }
                    row.lastChild.className = z[1] ? 'ok' : 'no'; row.lastChild.textContent = z[1] ? 'OK' : 'AUS';
                })();
                bar.style.transition = 'width ' + schritt + 'ms linear'; bar.style.width = ((i + 1) / Z.length * 100) + '%';
            }, start + i * schritt);
        });
        spaeter(function () { end.textContent = 'ALLE SYSTEME ONLINE'; end.style.transition = 'opacity .3s'; end.style.opacity = 1; }, start + Z.length * schritt + 250);
        spaeter(function () { ende(false); }, DAUER - 200);
    });
})();
