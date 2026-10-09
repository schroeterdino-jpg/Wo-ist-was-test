/* ============================================================
   HUD-FENSTER: kleine durchsichtige Info-Panels rechts am Rand (Eck-Klammern, Balken mit Restzeit), die von selbst verschwinden (Antippen schließt sofort).
   Dazu:
   - Ansage beim Öffnen: Jarvis nennt einmal (höchstens alle 3 Stunden, nicht zwischen 22 und 7 Uhr) Termine heute, Wetter und bald fällige Rechnungen und zeigt sie als Fenster.
     "Ansagen aus" / "Ansagen an" schaltet das ab (nur die gesprochene Ansage: "Ansagen leise" lässt die Fenster ohne Stimme).
   - Systemcheck: "Systemcheck" zeigt jede Prüfung als Fenster-Zeile mit grünem Haken oder rotem Kreuz (zusätzlich Benachrichtigungen und Netz).
   - "Zeig Rechnungen" bleibt in rechnungen.js; Aufruf window.jvPanel.zeigen({titel, zeit, gross, text, zeilen:[{ok,text}], sek}) von überall möglich.
   Braucht (alles optional): calendarEntries, fetchWeatherData/weatherCodeText (briefing.js), window.jvRechnungen, speak(), collectSystemChecks (systemcheck.js), getPersistentData/setPersistentData, wachterQuiet.
   Darf nie etwas stören: jede Funktion fängt ihre Fehler ab.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvPanel) return;
    const st = document.createElement('style');
    st.textContent = '#jvPan{position:fixed;top:64px;right:10px;width:min(250px,64vw);z-index:9000;display:flex;flex-direction:column;gap:10px;pointer-events:none}' +
        '.jvP{pointer-events:auto;background:rgba(6,20,34,.62);backdrop-filter:blur(6px);border:1px solid rgba(94,231,255,.45);border-radius:6px;padding:9px 11px 10px;color:#d8f6ff;font:12px ui-monospace,Menlo,monospace;box-shadow:0 0 18px rgba(94,231,255,.18);position:relative;animation:jvPin .5s cubic-bezier(.2,.9,.3,1) both}' +
        '.jvP:before,.jvP:after{content:"";position:absolute;width:9px;height:9px;border:2px solid #5ee7ff}.jvP:before{top:-2px;left:-2px;border-right:0;border-bottom:0}.jvP:after{bottom:-2px;right:-2px;border-left:0;border-top:0}' +
        '.jvP .k{font-size:10px;letter-spacing:2px;color:#5ee7ff;margin-bottom:5px;display:flex;justify-content:space-between}' +
        '.jvP .g{font-size:22px;font-weight:600;color:#fff;text-shadow:0 0 10px #5ee7ff}.jvP .s{opacity:.8;margin-top:2px;line-height:1.35}' +
        '.jvP .bar{height:2px;background:rgba(94,231,255,.2);margin-top:8px}.jvP .bar i{display:block;height:100%;background:#5ee7ff;animation:jvPb linear forwards}' +
        '.jvP.aus{animation:jvPout .5s ease-in forwards}' +
        '@keyframes jvPin{from{opacity:0;transform:translateX(40px) scale(.96);filter:blur(4px)}}@keyframes jvPout{to{opacity:0;transform:translateX(40px)}}@keyframes jvPb{from{width:100%}to{width:0}}';
    document.head.appendChild(st);
    const box = document.createElement('div'); box.id = 'jvPan'; (document.body || document.documentElement).appendChild(box);
    function zeigen(o) {
        const s = (o.sek || 7) * 1000, p = document.createElement('div'); p.className = 'jvP';
        p.innerHTML = '<div class="k"><span></span><span>' + (o.zeit || '') + '</span></div><div class="g"></div><div class="s"></div><div class="z"></div><div class="bar"><i style="animation-duration:' + s + 'ms"></i></div>';
        p.querySelector('.k span').textContent = o.titel || ''; p.querySelector('.g').textContent = o.gross || ''; p.querySelector('.s').textContent = o.text || '';
        if (!o.gross) p.querySelector('.g').remove();
        if (!o.text) p.querySelector('.s').remove();
        const zb = p.querySelector('.z');
        (o.zeilen || []).forEach(z => { const d = document.createElement('div'); d.style.cssText = 'margin-top:4px;line-height:1.3;color:' + (z.ok ? '#7dffb0' : '#ff7a7a'); d.textContent = (z.ok ? '✓ ' : '✗ ') + z.text; zb.appendChild(d); });
        const weg = () => { p.classList.add('aus'); setTimeout(() => p.remove(), 500); };
        p.addEventListener('click', weg); box.appendChild(p); setTimeout(weg, s);
        while (box.children.length > 3) box.firstChild.remove();
    }
    window.jvPanel = { zeigen };

    /* ---------- Hilfen ---------- */
    const pd = (k, d) => { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) ?? d); } catch (e) { return d; } };
    const sd = (k, v) => { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) {} };
    const sagen = t => { try { if (typeof speak === 'function') speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} };
    const heuteIso = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    const uhr = d => d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
    const stunde = () => +new Date().toLocaleString('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', hour12: false });

    /* ---------- Ansage beim Öffnen ---------- */
    const G_KEY = 'jv_ansage_zuletzt';
    async function ansage() {
        try {
            if (pd('jv_ansagen', 'an') === 'aus' || document.hidden) return;
            const h = stunde();
            if (h >= 22 || h < 5) return;
            if (/alarm=/.test(location.search)) return;
            const last = +(localStorage.getItem(G_KEY) || 0);
            if (Date.now() - last < 3 * 3600000) return;
            localStorage.setItem(G_KEY, String(Date.now()));
            const teile = [];
            const gruss = h < 11 ? 'Guten Morgen.' : h < 17 ? 'Hallo.' : 'Guten Abend.';
            // Termine heute (mit Uhrzeit, noch nicht vorbei)
            try {
                const jetzt = Date.now(), heute = heuteIso();
                const ev = (typeof calendarEntries !== 'undefined' ? calendarEntries : []).filter(e => e && e.isoDate && String(e.isoDate).length > 10 && new Date(e.isoDate).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) === heute && new Date(e.isoDate).getTime() > jetzt - 600000)
                    .sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate));
                if (ev.length) {
                    const n = ev[0], z = uhr(new Date(n.isoDate));
                    teile.push(ev.length === 1 ? 'Heute steht ein Termin an: ' + n.text + ' um ' + z.replace(':00', '') + ' Uhr.' : 'Heute stehen ' + ev.length + ' Termine an, der nächste um ' + z.replace(':00', '') + ' Uhr: ' + n.text + '.');
                    zeigen({ titel: 'TERMINE HEUTE', zeit: ev.length + '×', gross: z, text: n.text, sek: 9 });
                }
            } catch (e) {}
            // Wetter
            try {
                if (typeof fetchWeatherData === 'function') {
                    const w = await Promise.race([fetchWeatherData(), new Promise(r => setTimeout(() => r(null), 7000))]);
                    if (w && !w.fehler) {
                        const was = typeof weatherCodeText === 'function' ? weatherCodeText(w.wettercode) : '';
                        teile.push('Draußen sind es ' + w.temperatur + ' Grad' + (w.baldRegen ? ', bald Regen' : '') + '.');
                        zeigen({ titel: 'WETTER', zeit: 'JETZT', gross: w.temperatur + '° ' + (w.baldRegen ? '☂' : ''), text: (was || '') + (w.baldRegen ? ' · Regen in den nächsten Stunden' : ''), sek: 9 });
                    }
                }
            } catch (e) {}
            // Rechnungen, die in 3 Tagen fällig oder überfällig sind
            try {
                const r = window.jvRechnungen ? window.jvRechnungen.offen().filter(x => x.ziel && Math.round((new Date(x.ziel + 'T12:00:00Z') - new Date(heuteIso() + 'T12:00:00Z')) / 86400000) <= 3) : [];
                if (r.length) {
                    const x = r[0], d = Math.round((new Date(x.ziel + 'T12:00:00Z') - new Date(heuteIso() + 'T12:00:00Z')) / 86400000);
                    teile.push(r.length === 1 ? 'Die Rechnung von ' + x.absender + ' ist ' + (d < 0 ? 'überfällig.' : d === 0 ? 'heute fällig.' : 'bald fällig.') : r.length + ' Rechnungen sind bald fällig oder überfällig.');
                    zeigen({ titel: 'RECHNUNG', zeit: d < 0 ? 'ÜBERFÄLLIG' : d === 0 ? 'HEUTE' : 'IN ' + d + ' TAGEN', gross: x.betrag ? x.betrag.toFixed(2).replace('.', ',') + ' €' : x.absender, text: x.absender, sek: 9 });
                }
            } catch (e) {}
            if (!teile.length) return;
            if (pd('jv_ansagen', 'an') === 'leise') return;
            if ((typeof isSpeaking === 'function' && isSpeaking()) || (typeof isRecording !== 'undefined' && isRecording)) return;
            sagen(gruss + ' ' + teile.join(' '));
        } catch (e) { console.error('Ansage', e); }
    }
    window.jvAnsage = ansage;
    setTimeout(ansage, 7500);

    /* ---------- Systemcheck als Fenster ---------- */
    const origCheck = window.runSystemCheckSpoken;
    if (typeof origCheck === 'function' && typeof window.collectSystemChecks === 'function') {
        window.runSystemCheckSpoken = async function () {
            try {
                if (typeof speakAck === 'function') speakAck('Ich prüfe alle Verbindungen.');
                const res = await window.collectSystemChecks();
                try {
                    const push = typeof Notification !== 'undefined' ? Notification.permission : 'denied';
                    res.push({ name: 'Benachrichtigungen', ok: push === 'granted', text: push === 'granted' ? 'erlaubt' : 'nicht erlaubt' });
                    res.push({ name: 'Netz', ok: navigator.onLine !== false, text: navigator.onLine !== false ? 'online' : 'offline' });
                } catch (e) {}
                const bad = res.filter(r => !r.ok);
                zeigen({ titel: 'SYSTEMCHECK', zeit: bad.length ? bad.length + ' PROBLEM' + (bad.length > 1 ? 'E' : '') : 'ALLES OK', zeilen: res.map(r => ({ ok: r.ok, text: r.name + (r.ok ? '' : ': ' + r.text) })), sek: 20 });
                if (typeof clearActionCards === 'function') clearActionCards();
                if (!bad.length) sagen('Systemcheck abgeschlossen. Alle ' + res.length + ' Systeme laufen einwandfrei.');
                else sagen('Systemcheck abgeschlossen. ' + (bad.length === 1 ? 'Ein Problem' : bad.length + ' Probleme') + ': ' + bad.map(r => r.name).join(', ') + '.');
            } catch (e) { return origCheck(); }
        };
    }

    /* ---------- Sprache: Ansagen an/aus/leise ---------- */
    if (window.jvCommands) {
        window.jvCommands.use('ansagen', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            const m = t.match(/^(?:jarvis )?(?:ansagen|ansage beim öffnen|begrüßung)\s+(aus|an|ein|leise)$/) || t.match(/^(?:schalte? )?(?:die )?(?:ansagen|begrüßung) (aus|an|ein|leise)(?:schalten)?$/);
            if (!m) return next(text);
            const v = m[1] === 'aus' ? 'aus' : m[1] === 'leise' ? 'leise' : 'an';
            sd('jv_ansagen', v);
            sagen(v === 'aus' ? 'Die Ansagen beim Öffnen sind aus.' : v === 'leise' ? 'Beim Öffnen zeige ich nur noch Fenster, ohne zu sprechen.' : 'Die Ansagen beim Öffnen sind an.');
            return true;
        }, 160);
    }
})();
