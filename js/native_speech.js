/* ============================================================
   ZANE-APP (Android): Wenn Zane im eigenen App-Fenster läuft (window.ZaneNative gibt es nur dort),
   ersetzt dieser Teil die fehlende Web-Spracherkennung durch die Spracherkennung von Android
   und meldet der App, wann Zane spricht oder zuhört (dann pausiert das Weckwort).
   Im normalen Chrome passiert hier nichts. Muss VOR voice.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    if (!window.ZaneNative) return;

    let cur = null;

    function Rec() {
        this.lang = 'de-DE';
        this.continuous = false;
        this.interimResults = false;
        this.maxAlternatives = 1;
        this._ls = {};
    }
    Rec.prototype.start = function () {
        if (cur) { throw new DOMException('recognition has already started', 'InvalidStateError'); }
        cur = this;
        window.ZaneNative.recStart(String(this.lang || 'de-DE'), !!this.continuous, Number(this.maxAlternatives) || 1);
    };
    Rec.prototype.stop = function () { if (cur === this) window.ZaneNative.recStop(); };
    Rec.prototype.abort = function () { if (cur === this) window.ZaneNative.recAbort(); };
    Rec.prototype.addEventListener = function (t, f) { (this._ls[t] = this._ls[t] || []).push(f); };
    Rec.prototype.removeEventListener = function (t, f) { this._ls[t] = (this._ls[t] || []).filter(x => x !== f); };

    function fire(r, type, ev) {
        ev = ev || {};
        ev.type = type;
        const h = r['on' + type];
        try { if (typeof h === 'function') h.call(r, ev); } catch (e) { console.error(e); }
        (r._ls[type] || []).forEach(f => { try { f.call(r, ev); } catch (e) { console.error(e); } });
    }

    // Wird von der App aufgerufen
    window.__zaneRec = function (type, data) {
        const r = cur;
        if (!r) return;
        if (type === 'end') {
            cur = null;   // vorher freigeben: onend startet oft sofort eine neue Sitzung
            fire(r, 'end');
            return;
        }
        if (type === 'result') {
            const res = (data || []).map(a => ({ transcript: a.t, confidence: a.c }));
            res.isFinal = true;
            const results = [res];
            fire(r, 'result', { resultIndex: 0, results: results });
            return;
        }
        if (type === 'error') {
            fire(r, 'error', { error: data && data.error });
            return;
        }
        fire(r, type);
    };

    window.SpeechRecognition = Rec;
    window.webkitSpeechRecognition = Rec;

    // Zane meldet der App, ob er gerade spricht, zuhört oder nachdenkt
    setInterval(function () {
        try {
            const busy = (typeof isSpeaking === 'function' && isSpeaking()) ||
                (typeof isRecording !== 'undefined' && isRecording) ||
                (typeof isProcessing !== 'undefined' && isProcessing) ||
                (typeof ackActive !== 'undefined' && ackActive);
            window.ZaneNative.setBusy(!!busy);
        } catch (e) { }
    }, 300);

    // "Hey Zane" wurde erkannt: "Ja?" sagen und zuhören
    let waking = false;
    window.zaneWake = function () {
        if (waking) return;
        window.__zaneWakePending = false;
        waking = true;
        setTimeout(function () { waking = false; }, 3000);
        try {
            if (typeof isRecording !== 'undefined' && isRecording) return;
            speakAck('Ja?', function () { try { startListening(false); } catch (e) { } });
        } catch (e) {
            try { startListening(false); } catch (e2) { }
        }
    };

    // Falls die Seite beim Wecken noch lud
    window.addEventListener('load', function () {
        setTimeout(function () { if (window.__zaneWakePending) window.zaneWake(); }, 800);
    });
})();
