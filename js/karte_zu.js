/* ============================================================
   KARTE ZU: Die Karte mit Route (Fahrzeit, Stau, Tanken) schließt sich von selbst, 8 Sekunden nachdem Zane fertig gesprochen hat.
   Antippen oder Wischen auf der Karte hält sie offen (dann bleibt sie bis zum Schließen). Per Hand (✕) oder "Schließen" geht es weiter wie bisher.
   Aus- und einschalten per Sprache: "Karte automatisch schließen aus" / "... an". Standard: an.
   Braucht: panels.js (openPanel, closePanel, currentPanel), voice.js (isSpeaking), commands.js. Muss NACH panels.js geladen werden.
   ============================================================ */
(function () {
    if (typeof window.openPanel !== 'function' || typeof window.closePanel !== 'function') return;
    const KEY = 'jv_karte_auto_zu';
    const WARTE_MS = 8000;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) !== '0';

    let timer = null, my = 0;
    function stop() { clearInterval(timer); timer = null; my++; }

    function watch() {
        stop();
        const id = my;
        const t0 = Date.now();
        let gesprochen = false, stillSeit = 0, angefasst = false;
        const layer = document.getElementById('panelLayer');
        const touch = () => { angefasst = true; };
        if (layer) { layer.addEventListener('pointerdown', touch, { once: true }); layer.addEventListener('touchstart', touch, { once: true, passive: true }); }
        timer = setInterval(() => {
            if (id !== my) { clearInterval(timer); return; }
            let offen = false;
            try { offen = typeof isPanelOpen === 'function' && isPanelOpen() && currentPanel && currentPanel.name === 'karte'; } catch (e) {}
            if (!offen || angefasst || !isOn()) { stop(); return; }
            let spricht = false;
            try { spricht = typeof isSpeaking === 'function' && isSpeaking(); } catch (e) {}
            if (spricht) { gesprochen = true; stillSeit = 0; return; }
            if (!gesprochen && Date.now() - t0 < 6000) return;   // Antwort kommt noch
            if (!stillSeit) stillSeit = Date.now();
            if (Date.now() - stillSeit >= WARTE_MS) { stop(); try { window.closePanel(); } catch (e) {} }
        }, 500);
    }

    const orig = window.openPanel;
    window.openPanel = function (name) {
        const r = orig.apply(this, arguments);
        try { if (name === 'karte' && r !== false && isOn()) watch(); else if (name !== 'karte') stop(); } catch (e) {}
        return r;
    };

    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60 || !/karte\s+(?:automatisch|von selbst|selbst)\s+(?:schlie\w*|zu)|automatisch\w*\s+karte/.test(t)) return false;
        const say = m => speak(m, typeof continueConversation === 'function' ? continueConversation : undefined);
        if (/\b(aus|ausschalten|deaktivier\w*|nicht|stopp?)\b/.test(t)) { lsSet(KEY, '0'); stop(); say('Die Karte bleibt jetzt offen, bis Sie sie schließen.'); return true; }
        if (/\b(an|ein|einschalten|aktivier\w*)\b/.test(t)) { lsSet(KEY, '1'); say('Die Karte schließt sich jetzt von selbst, kurz nachdem ich fertig bin.'); return true; }
        say('Das automatische Schließen der Karte ist ' + (isOn() ? 'an' : 'aus') + '.');
        return true;
    }
    if (window.jvCommands) {
        window.jvCommands.use('karte-zu', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Karte zu', e); }
            return next(text);
        }, 94);
    }
    window.jvKarteZu = { isOn, handle };
})();
