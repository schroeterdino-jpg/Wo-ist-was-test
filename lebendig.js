/* ============================================================
   LEBENDIGE KUGEL: verbindet die Kugel (sphere.js) mit Jarvis' Stimme und mit deiner Stimme, ohne voice.js zu verändern.
   1) Cloud-Stimme (OpenAI/Edge): Sobald ein Audio mit einer blob:-Adresse zu spielen beginnt, wird es an die Kugel gemeldet.
      Die Kugel misst dann die echte Lautstärke und pulsiert im Rhythmus der Stimme. Bei der Handy-Stimme (Browser) gibt es keinen Zugriff
      auf die Lautstärke, dort pulsiert sie nach dem gleichmäßigen Rhythmus, den sie schon vorher hatte.
   2) Beim Zuhören: Sprichst DU, pulsiert die Kugel leicht mit (window.jvUserSpeaking, aus den Sprach-Ereignissen der Spracherkennung).
   Muss nach voice.js geladen werden (siehe index.html).
   ============================================================ */
(function () {
    // 1) Audio an die Kugel melden
    try {
        const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
        if (proto && !proto._jvPlayPatched) {
            const originalPlay = proto.play;
            proto.play = function () {
                try {
                    if (!this.__jvSphere && typeof window.jvSphereConnectAudio === 'function') {
                        const src = this.currentSrc || this.src || '';
                        if (/^blob:/.test(src)) { this.__jvSphere = true; window.jvSphereConnectAudio(this); }
                    }
                } catch (e) { /* die Kugel darf die Stimme nie stören */ }
                return originalPlay.apply(this, arguments);
            };
            proto._jvPlayPatched = true;
        }
    } catch (e) {}

    // 2) Wann spricht der Nutzer? (voice.js ruft jvHearing(true/false) bei Sprach-Ereignissen auf)
    try {
        if (typeof window.jvHearing === 'function' && !window.jvHearing._jv) {
            const originalHearing = window.jvHearing;
            const wrappedHearing = function (on) { window.jvUserSpeaking = !!on; return originalHearing.apply(this, arguments); };
            wrappedHearing._jv = true;
            window.jvHearing = wrappedHearing;
        }
        if (typeof window.jvListenIndicator === 'function' && !window.jvListenIndicator._jv) {
            const originalIndicator = window.jvListenIndicator;
            const wrappedIndicator = function (on) { window.jvUserSpeaking = false; return originalIndicator.apply(this, arguments); };   // neue Zuhör-Runde: noch nicht gesprochen
            wrappedIndicator._jv = true;
            window.jvListenIndicator = wrappedIndicator;
        }
    } catch (e) {}
})();
