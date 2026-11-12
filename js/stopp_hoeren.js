/* ============================================================
   STOPP HÖREN (nur Handy-App, TEST): Während Jarvis spricht, genügt "Stopp", "Warte mal kurz", "Moment" oder "Hör auf" (ohne "Hey Jarvis").
   - Läuft NUR, solange Jarvis spricht, und nur mit Einstellung "Stopp-Hören an" (Standard AUS). Sonst bleibt das Mikrofon aus: kein Akkuverbrauch im Alltag.
   - Nutzt die deutsche Spracherkennung der Handy-App (ZaneNative.recStart), kurze Durchgänge. Die Erkennung läuft während der Sprachausgabe und pausiert Musik wie beim normalen Zuhören.
   - Gilt nur, wenn die GANZE Äußerung ein Stoppwort ist (höchstens 6 Wörter). Längere Sätze (auch Jarvis' eigene Stimme aus dem Lautsprecher) lösen nie etwas aus.
   - Treffer: Jarvis wird sofort still (interruptSpeaking) und hört dir zu (startListening), wie beim Tippen auf den Knopf.
   - Sicherheit: Ergebnisse der eigenen Erkennung gehen NIE an die normale Spracherkennung. Beginnt die normale Erkennung (Jarvis ist fertig), wird unsere zuerst beendet.
   - Takt: der vorhandene 300-ms-Takt in native_speech.js ruft jvStopp.tick() auf (kein eigener Zeitgeber).
   - Sprache: "Stopp-Hören an" / "Stopp-Hören aus". Merker jv_stopp_hoeren.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_stopp_hoeren', MAX_DURCHGAENGE = 40, MIN_SPRECHEN_MS = 1200;
    function pd(k, d) { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) || d); } catch (e) { return d; } }
    function sd(k, v) { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) { } }
    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function istAn() { return pd(KEY, '') === '1'; }
    const STOPP = /^(?:(?:ja|nein|ok|okay|jarvis|bitte)\s+)*(?:stopp?|stop|halt(?:\s+an)?|warte(?:\s+(?:mal|kurz|bitte|einen\s+moment|ein\s+moment|mal\s+kurz|einen\s+augenblick))*|moment(?:\s+(?:mal|kurz|bitte))*|einen\s+moment(?:\s+(?:mal|kurz|bitte))*|h[öo]r\s+(?:mal\s+|bitte\s+)?auf|sei\s+(?:mal\s+)?(?:still|ruhig)|ruhe|genug|das\s+reicht|nicht\s+weiter)(?:\s+(?:mal|kurz|bitte|jetzt|jarvis|zane|sofort))*$/;
    function istStopp(t) {
        const s = String(t || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();
        return !!s && s.split(' ').length <= 6 && STOPP.test(s);
    }

    let aktiv = false, schluckenBis = 0, pauseBis = 0, durchgaenge = 0, sprichtSeit = 0, verdrahtet = false;
    function nativ() { return window.ZaneNative && typeof window.ZaneNative.recStart === 'function' ? window.ZaneNative : null; }
    function spricht() { try { return typeof isSpeaking === 'function' && isSpeaking(); } catch (e) { return false; } }
    function beenden() {
        if (!aktiv) return;
        aktiv = false; schluckenBis = Date.now() + 800;
        try { const n = nativ(); if (n && typeof n.recAbort === 'function') n.recAbort(); } catch (e) { }
    }
    function treffer() {
        beenden();
        try { if (typeof interruptSpeaking === 'function') interruptSpeaking(); } catch (e) { }
        schluckenBis = 0;
        setTimeout(function () { try { startListening(false); } catch (e) { } }, 250);
    }
    function ereignis(type, data) {
        if (type === 'result') {
            const alt = Array.isArray(data) ? data : [];
            if (alt.some(a => istStopp(a && a.t))) { treffer(); return; }
            return;
        }
        if (type === 'end' || type === 'error') { aktiv = false; pauseBis = Date.now() + 400; }
    }
    function verdrahten() {
        if (verdrahtet) return; verdrahtet = true;
        const orig = window.__zaneRec;
        window.__zaneRec = function (type, data) {
            if (type === 'rms') return orig && orig.apply(this, arguments);
            if (aktiv) { ereignis(type, data); return; }
            if (Date.now() < schluckenBis && (type === 'end' || type === 'error' || type === 'result')) return;   // Reste unserer beendeten Erkennung: nicht an die normale weiterreichen
            return orig && orig.apply(this, arguments);
        };
        const sl = window.startListening;
        if (typeof sl === 'function') window.startListening = function () {
            const args = arguments, self = this;
            if (aktiv) { beenden(); setTimeout(function () { schluckenBis = 0; sl.apply(self, args); }, 350); return; }
            return sl.apply(self, args);
        };
    }
    function tick() {
        try {
            if (!istAn() || !nativ()) return;
            verdrahten();
            const s = spricht();
            if (!s) { sprichtSeit = 0; durchgaenge = 0; if (aktiv) beenden(); return; }
            if (!sprichtSeit) sprichtSeit = Date.now();
            if (aktiv || Date.now() - sprichtSeit < MIN_SPRECHEN_MS || Date.now() < pauseBis || durchgaenge >= MAX_DURCHGAENGE) return;
            if (typeof isRecording !== 'undefined' && isRecording) return;   // normale Erkennung läuft: nicht dazwischen funken
            durchgaenge++; aktiv = true;
            nativ().recStart('de-DE', false, 3);
        } catch (e) { aktiv = false; }
    }
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 70 || !/stopp?\s*h[öo]ren|auf\s+stopp\s+h[öo]ren/.test(t)) return false;
        const an = /\b(?:an|ein|einschalten|starten)\b/.test(t), aus = /\b(?:aus|ausschalten|beenden|stoppen)\b/.test(t);
        if (!an && !aus) return false;
        if (aus) { sd(KEY, ''); beenden(); sagen('Okay, ich höre beim Sprechen nicht mehr auf Stopp.'); return true; }
        if (!nativ()) { sagen('Das geht nur in der Jarvis-App auf dem Handy.'); return true; }
        sd(KEY, '1'); sagen('Okay. Wenn ich spreche, genügt ab jetzt „Stopp“, „Warte mal kurz“ oder „Hör auf“.'); return true;
    }
    window.jvStopp = { istStopp, handle, istAn, tick: tick, _aktiv: function () { return aktiv; } };
    if (window.jvCommands) {
        window.jvCommands.use('stopp_hoeren', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Stopp hören', e); }
            return next(text);
        }, 162);
    }
})();
