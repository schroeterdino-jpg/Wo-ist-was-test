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
                (typeof ackActive !== 'undefined' && ackActive) ||
                window.__zaneAckBusy === true;
            window.ZaneNative.setBusy(!!busy);
        } catch (e) { }
    }, 300);

    // "Hey Zane" wurde erkannt: "Ja?" sagen und zuhören.
    // Das "Ja?" kommt IMMER in der Fish-Audio-Stimme und wird einmal geholt und dann gespeichert,
    // so ist es beim nächsten Mal sofort da (kein Warten auf Fish, keine Ersatzstimme).
    let waking = false;
    let jaBlob = null;
    function jaKey() {
        let v = '';
        try { v = (typeof getFishVoice === 'function') ? getFishVoice() : ''; } catch (e) { }
        return 'zane_ja_cache_' + v;
    }
    function jaLaden() {
        try {
            const d = localStorage.getItem(jaKey());
            if (!d) return null;
            const parts = d.split(',');
            const mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'audio/mpeg';
            const bin = atob(parts[1]);
            const arr = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
            return new Blob([arr], { type: mime });
        } catch (e) { return null; }
    }
    function jaSpeichern(blob) {
        try {
            const fr = new FileReader();
            fr.onload = function () { try { localStorage.setItem(jaKey(), String(fr.result)); } catch (e) { } };
            fr.readAsDataURL(blob);
        } catch (e) { }
    }
    function jaHolen() {   // nur Fish Audio; bei Fehlschlag null (dann bleibt es still)
        try {
            if (typeof getTtsEngine === 'function' && getTtsEngine() !== 'fish') return Promise.resolve(null);
            window.__jvAck = true;   // fish.js: nur Fish Audio, viel Zeit, niemals Ersatzstimme
            let p;
            try { p = fetchCloudSpeechBlob('Ja?', (typeof getEdgeVoice === 'function') ? getEdgeVoice() : undefined); }
            finally { window.__jvAck = false; }
            return Promise.resolve(p).then(function (b) {
                if (b && b.size > 3000) { jaBlob = b; jaSpeichern(b); return b; }   // kurze Stille (Fehlschlag) nicht merken
                return null;
            }).catch(function () { return null; });
        } catch (e) { return Promise.resolve(null); }
    }
    // Schon beim Start vorbereiten
    window.addEventListener('load', function () {
        setTimeout(function () {
            if (!jaBlob) jaBlob = jaLaden();
            if (!jaBlob) jaHolen();
        }, 3000);
    });

    window.zaneWake = function () {
        if (waking) return;
        window.__zaneWakePending = false;
        waking = true;
        setTimeout(function () { waking = false; }, 3000);
        let weiter = function () { try { startListening(false); } catch (e) { } };
        try {
            if (typeof isRecording !== 'undefined' && isRecording) return;
            if (typeof getTtsEngine === 'function' && getTtsEngine() !== 'fish') {
                speakAck('Ja?', weiter);
                return;
            }
            if (!jaBlob) jaBlob = jaLaden();
            const spielen = function (blob) {
                if (!blob) { weiter(); return; }   // lieber still als mit fremder Stimme
                window.__zaneAckBusy = true;
                const url = URL.createObjectURL(blob);
                const au = new Audio(url);
                const fertig = function () { window.__zaneAckBusy = false; try { URL.revokeObjectURL(url); } catch (e) { } weiter(); };
                au.onended = fertig;
                au.onerror = fertig;
                au.play().catch(fertig);
            };
            if (jaBlob) spielen(jaBlob);
            else jaHolen().then(spielen);
        } catch (e) {
            weiter();
        }
    };

    // Falls die Seite beim Wecken noch lud
    window.addEventListener('load', function () {
        setTimeout(function () { if (window.__zaneWakePending) window.zaneWake(); }, 800);
    });
})();
