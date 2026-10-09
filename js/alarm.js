/* ============================================================
   ALARM-MODUS: Bei einer ernsten Warnung (Glatteis, Schnee, Starkregen auf der Strecke) färbt sich die Oberfläche rot oder orange und pulsiert,
   oben erscheint eine Warnbox mit Text und "VERSTANDEN", dazu ein kurzer Sirenenton und eine Ansage.
   Ausgelöst von:
   - der Push-Nachricht (sw.js leitet sie an die offene App weiter; beim Tippen auf die Nachricht öffnet sich die App mit ?alarm=...),
   - dem Sprachbefehl "Teste den Alarm" (zum Ausprobieren),
   - jeder anderen Stelle über window.jvAlarm({ stufe: 'rot' | 'orange', titel, text, sprechen: true }).
   Beenden: auf "VERSTANDEN" tippen oder sagen "Alarm aus" / "Verstanden". Ohne Antippen verschwindet er nach 10 Minuten von selbst.
   Ändert nichts an Briefing, Terminen, Erinnerungen oder Push. Braucht nur speak() (optional). Fehlt etwas, entfällt nur der Ton oder die Ansage.
   ============================================================ */
(function () {
    'use strict';
    let el = null, killTimer = 0, lastKey = '', lastAt = 0;

    function css() {
        if (document.getElementById('jvAlarmCss')) return;
        const s = document.createElement('style');
        s.id = 'jvAlarmCss';
        s.textContent =
            '#jvAlarm{position:fixed;inset:0;z-index:9000;pointer-events:none;--c:255,50,50;font-family:"Rajdhani",sans-serif}' +
            '#jvAlarm.orange{--c:255,150,40}' +
            '#jvAlarm .a-frame{position:absolute;inset:0;box-shadow:inset 0 0 70px 14px rgba(var(--c),.6);animation:jvAlarmPulse 1.1s ease-in-out infinite}' +
            '#jvAlarm .a-scan{position:absolute;left:0;right:0;height:90px;top:-90px;background:linear-gradient(180deg,rgba(var(--c),0),rgba(var(--c),.22),rgba(var(--c),0));animation:jvAlarmScan 3.2s linear infinite}' +
            '#jvAlarm .a-box{position:absolute;left:14px;right:14px;top:calc(env(safe-area-inset-top,0px) + 74px);pointer-events:auto;border:1.5px solid rgba(var(--c),.95);border-radius:12px;background:rgba(14,4,4,.9);color:#ffe9e4;padding:12px 14px;box-shadow:0 0 24px rgba(var(--c),.55);animation:jvAlarmIn .35s ease-out,jvAlarmFlicker 2.4s steps(1) infinite}' +
            '#jvAlarm.orange .a-box{background:rgba(18,10,2,.9);color:#fff0dc}' +
            '#jvAlarm .a-kopf{display:flex;align-items:center;gap:10px}' +
            '#jvAlarm .a-icon{font-size:26px;line-height:1;filter:drop-shadow(0 0 6px rgba(var(--c),.9));animation:jvAlarmBlink .9s steps(2) infinite}' +
            '#jvAlarm .a-titel{font:700 15px "Orbitron",sans-serif;letter-spacing:.12em;color:rgb(var(--c));text-transform:uppercase}' +
            '#jvAlarm .a-text{margin-top:6px;font-size:16px;line-height:1.25}' +
            '#jvAlarm .a-ok{margin-top:10px;width:100%;padding:10px 8px;border-radius:9px;border:1px solid rgba(var(--c),.9);background:rgba(var(--c),.16);color:rgb(var(--c));font:700 13px "IBM Plex Mono",monospace;letter-spacing:.14em}' +
            'body.jv-alarm #jarvisBrain,body.jv-alarm #jarvisSphere{filter:sepia(1) saturate(5) hue-rotate(-52deg) brightness(1.05)}' +
            'body.jv-alarm.jv-alarm-orange #jarvisBrain,body.jv-alarm.jv-alarm-orange #jarvisSphere{filter:sepia(1) saturate(4) hue-rotate(-8deg)}' +
            '@keyframes jvAlarmPulse{0%,100%{opacity:.45}50%{opacity:1}}' +
            '@keyframes jvAlarmScan{0%{top:-90px}100%{top:100%}}' +
            '@keyframes jvAlarmIn{0%{transform:translateY(-14px) scale(.96);opacity:0}100%{transform:none;opacity:1}}' +
            '@keyframes jvAlarmFlicker{0%,93%,100%{opacity:1}95%{opacity:.82}97%{opacity:1}}' +
            '@keyframes jvAlarmBlink{0%{opacity:1}50%{opacity:.35}}' +
            '@media (prefers-reduced-motion:reduce){#jvAlarm *{animation:none!important}}';
        document.head.appendChild(s);
    }

    function siren(stufe) {   // kurzer Sirenenton (zwei Töne, die rauf und runter gleiten); ohne Erlaubnis des Browsers bleibt er einfach stumm
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const c = new AC(), g = c.createGain(), o = c.createOscillator();
            const lo = stufe === 'orange' ? 520 : 600, hi = stufe === 'orange' ? 740 : 920, n = stufe === 'orange' ? 2 : 3, vol = stufe === 'orange' ? 0.07 : 0.1;
            o.type = 'sawtooth'; o.connect(g); g.connect(c.destination);
            const t0 = c.currentTime;
            o.frequency.setValueAtTime(lo, t0);
            for (let i = 0; i < n; i++) { o.frequency.linearRampToValueAtTime(hi, t0 + i * 0.9 + 0.45); o.frequency.linearRampToValueAtTime(lo, t0 + i * 0.9 + 0.9); }
            const end = t0 + n * 0.9;
            g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.06);
            g.gain.setValueAtTime(vol, end - 0.15); g.gain.exponentialRampToValueAtTime(0.0001, end);
            o.start(t0); o.stop(end + 0.05); o.onended = () => { try { c.close(); } catch (e) {} };
        } catch (e) {}
    }

    function close() {
        clearTimeout(killTimer);
        if (el) { try { el.remove(); } catch (e) {} el = null; }
        try { document.body.classList.remove('jv-alarm', 'jv-alarm-orange'); } catch (e) {}
    }

    function show(o) {
        o = o || {};
        const stufe = o.stufe === 'orange' ? 'orange' : 'rot';
        const titel = String(o.titel || 'Warnung').slice(0, 80), text = String(o.text || '').slice(0, 300);
        const key = titel + '|' + text;
        if (key === lastKey && Date.now() - lastAt < 60000) return;   // dieselbe Warnung nicht mehrfach hintereinander
        lastKey = key; lastAt = Date.now();
        close(); css();
        el = document.createElement('div');
        el.id = 'jvAlarm'; el.className = stufe; el.setAttribute('role', 'alert');
        const mk = (p, cls, t) => { const x = document.createElement('div'); x.className = cls; if (t !== undefined) x.textContent = t; p.appendChild(x); return x; };
        mk(el, 'a-frame'); mk(el, 'a-scan');
        const box = mk(el, 'a-box');
        const kopf = mk(box, 'a-kopf'); mk(kopf, 'a-icon', '⚠'); mk(kopf, 'a-titel', titel);
        if (text) mk(box, 'a-text', text);
        const ok = document.createElement('button'); ok.type = 'button'; ok.className = 'a-ok'; ok.textContent = 'VERSTANDEN';
        ok.addEventListener('click', close); box.appendChild(ok);
        document.body.appendChild(el);
        document.body.classList.add('jv-alarm'); document.body.classList.toggle('jv-alarm-orange', stufe === 'orange');
        killTimer = setTimeout(close, 10 * 60 * 1000);
        siren(stufe);
        if (o.sprechen !== false) setTimeout(() => { try { if (el && typeof speak === 'function') speak(titel + '. ' + text); } catch (e) {} }, 2200);
    }
    window.jvAlarm = show;
    window.jvAlarmClose = close;

    // Auslöser 1: Push-Nachricht bei offener App (sw.js schickt sie weiter)
    try {
        if ('serviceWorker' in navigator) navigator.serviceWorker.addEventListener('message', e => {
            const d = e && e.data;
            if (d && d.jvAlarm) show(d.jvAlarm);
        });
    } catch (e) {}

    // Auslöser 2: Tippen auf die Push-Nachricht öffnet die App mit ?alarm=rot&t=Titel&b=Text
    function fromUrl() {
        try {
            const u = new URL(location.href), a = u.searchParams.get('alarm');
            if (!a) return;
            show({ stufe: a === 'orange' ? 'orange' : 'rot', titel: u.searchParams.get('t') || 'Warnung', text: u.searchParams.get('b') || '' });
            ['alarm', 't', 'b'].forEach(k => u.searchParams.delete(k));
            history.replaceState(null, '', u.pathname + (u.search || '') + u.hash);
        } catch (e) {}
    }
    setTimeout(fromUrl, 1800);

    // Auslöser 3: Sprache
    const TEST_RX = /^(?:(?:teste?|zeig(?:e)?|starte?|mach)\s+(?:mir\s+)?(?:mal\s+)?(?:den\s+)?alarm(?:-?\s?modus)?(?:\s+test)?|alarm(?:-?\s?modus)?\s*test)$/;
    const OFF_RX = /^(?:(?:ok(?:ay)?|gut)\s+)?(?:alarm\s+(?:aus|beenden|stopp)|verstanden|alarm\s+verstanden)(?:\s+jarvis)?$/;
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 50) return false;
        if (TEST_RX.test(t)) { show({ stufe: 'rot', titel: 'Testalarm', text: 'So sieht eine Warnung aus: Glättegefahr auf Ihrer Strecke. Plan mehr Zeit ein.' }); return true; }
        if (el && OFF_RX.test(t)) { close(); try { if (typeof speak === 'function') speak('Alarm beendet.'); } catch (e) {} return true; }
        return false;
    }
    window.handleAlarmCommand = handle;
    if (window.jvCommands) {
        window.jvCommands.use('alarm', function (text, next) {
            try { if (handle(text)) return true; } catch (e) {}
            return next(text);
        }, 250);
    }
})();
