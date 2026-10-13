/* BOOT-SEQUENZ: kurzer Start-Effekt beim Öffnen von Jarvis (Scan-Linie, Statuszeilen, Ring, Power-up-Ton). Antippen überspringt. */
(function () {
    'use strict';
    if (window.jvBoot) return;
    const ZEILEN = ['SYSTEME ONLINE', 'SENSOREN AKTIV', 'GEDÄCHTNIS GELADEN', 'VERBINDUNG STABIL'];
    function ton() {
        try {
            const A = new (window.AudioContext || window.webkitAudioContext)(), t = A.currentTime;
            const o = A.createOscillator(), g = A.createGain();
            o.type = 'sine'; o.frequency.setValueAtTime(110, t); o.frequency.exponentialRampToValueAtTime(880, t + 1.4);
            g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12, t + 0.3); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.8);
            o.connect(g); g.connect(A.destination); o.start(t); o.stop(t + 1.9);
        } catch (e) {}
    }
    function start(opt) {
        opt = opt || {};
        const st = document.createElement('style');
        st.textContent = '#jvBoot{position:fixed;inset:0;z-index:99999;background:#02060d;color:#5ee7ff;font-family:ui-monospace,Menlo,monospace;display:flex;flex-direction:column;align-items:center;justify-content:center;transition:opacity .7s}' +
            '#jvBoot .ring{width:150px;height:150px;border-radius:50%;border:2px solid rgba(94,231,255,.25);border-top-color:#5ee7ff;border-bottom-color:#5ee7ff;animation:jvr 1.6s linear infinite;position:relative;box-shadow:0 0 30px rgba(94,231,255,.35)}' +
            '#jvBoot .ring:after{content:"";position:absolute;inset:18px;border-radius:50%;border:1px dashed rgba(94,231,255,.5);animation:jvr 3s linear infinite reverse}' +
            '#jvBoot .core{position:absolute;width:34px;height:34px;border-radius:50%;background:radial-gradient(#fff,#5ee7ff 60%,transparent);animation:jvp 1.2s ease-in-out infinite}' +
            '#jvBoot .scan{position:absolute;left:0;right:0;height:3px;background:linear-gradient(90deg,transparent,#5ee7ff,transparent);box-shadow:0 0 18px #5ee7ff;top:0;animation:jvs 2.4s ease-in-out infinite}' +
            '#jvBoot .t{margin-top:34px;font-size:13px;letter-spacing:3px;min-height:92px;text-align:left}' +
            '#jvBoot .t div{opacity:0;animation:jvf .3s forwards}#jvBoot .t b{color:#7dffb0}' +
            '#jvBoot .h{font-size:20px;letter-spacing:8px;margin-bottom:30px;text-shadow:0 0 12px #5ee7ff}' +
            '@keyframes jvr{to{transform:rotate(360deg)}}@keyframes jvp{50%{transform:scale(1.5);opacity:.6}}@keyframes jvs{0%{top:0}50%{top:100%}100%{top:0}}@keyframes jvf{to{opacity:1}}';
        document.head.appendChild(st);
        const el = document.createElement('div'); el.id = 'jvBoot';
        el.innerHTML = '<div class="scan"></div><div class="h">J.A.R.V.I.S.</div><div class="ring"><div class="core" style="top:58px;left:58px"></div></div><div class="t"></div>';
        document.body.appendChild(el);
        const box = el.querySelector('.t'); let weg = false;
        function ende() { if (weg) return; weg = true; el.style.opacity = 0; setTimeout(() => { el.remove(); st.remove(); if (opt.fertig) opt.fertig(); }, 750); }
        el.addEventListener('click', ende);
        if (!opt.stumm) ton();
        ZEILEN.forEach((z, i) => setTimeout(() => { if (weg) return; const d = document.createElement('div'); d.innerHTML = '&gt; ' + z + ' <b>OK</b>'; box.appendChild(d); }, 500 + i * 550));
        setTimeout(ende, opt.dauer || 3400);
    }
    window.jvBoot = { start };
    /* Automatisch beim Öffnen: nicht bei Alarm-Links, nicht öfter als alle 10 Minuten (Zurückwechseln in die App zählt nicht) */
    try {
        const q = location.search || '', K = 'jv_boot_last', jetzt = Date.now();
        const zuletzt = +(localStorage.getItem(K) || 0);
        if (!/alarm=|nobootseq/.test(q) && jetzt - zuletzt > 600000) {
            localStorage.setItem(K, String(jetzt));
            const go = () => start({});
            if (document.body) go(); else document.addEventListener('DOMContentLoaded', go);
        }
    } catch (e) {}
})();
