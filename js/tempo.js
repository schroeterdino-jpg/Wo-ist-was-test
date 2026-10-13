/* ============================================================
   TEMPO-SICHERUNG: Das Sprechtempo (speechrate.js) soll nach dem Öffnen der App sofort wieder stimmen.
   Problem: Das Tempo steckt im Hauptspeicher der App (getPersistentData). Wird der erst NACH dem ersten Sprechen vollständig geladen, spricht Jarvis den ersten Satz
   nach dem Öffnen im Normaltempo, also schneller als eingestellt, und der Regler in den Einstellungen zeigt "normal".
   Lösung: Das Tempo wird zusätzlich direkt im Handy gesichert (localStorage) und von dort sofort gelesen. Der Hauptspeicher bleibt wie er ist.
   Muss nach speechrate.js geladen werden. Fehlt speechrate.js, passiert nichts.
   ============================================================ */
(function () {
    if (typeof window.getSpeechRateFactor !== 'function' || typeof window.setSpeechRate !== 'function') return;
    const LS = 'jv_speech_rate_local';
    const MIN = 0.7, MAX = 1.4;
    const nativeGet = window.getSpeechRateFactor;
    const nativeSet = window.setSpeechRate;

    function localRate() {
        try {
            const raw = localStorage.getItem(LS);
            if (raw === null) return null;
            const v = Number(raw);
            return (v >= MIN && v <= MAX) ? v : null;
        } catch (e) { return null; }
    }
    function saveLocal(v) { try { localStorage.setItem(LS, String(v)); } catch (e) {} }

    window.getSpeechRateFactor = function () {
        const l = localRate();
        if (l !== null) return l;
        const v = nativeGet.apply(this, arguments);
        if (v !== 1) saveLocal(v);      // einen aus dem Hauptspeicher geladenen Wert ab jetzt auch direkt im Handy halten
        return v;
    };

    window.setSpeechRate = function () {
        const v = nativeSet.apply(this, arguments);
        saveLocal(v);
        return v;
    };

    function refreshUi() { try { if (typeof window.updateSpeechRateUi === 'function') window.updateSpeechRateUi(); } catch (e) {} }
    refreshUi();
    // Regler in den Einstellungen nach jedem Antippen neu setzen (z.B. beim Öffnen der Einstellungen, auch wenn die Daten erst spät geladen wurden)
    document.addEventListener('click', () => setTimeout(refreshUi, 80), true);
    setTimeout(refreshUi, 1500);
    setTimeout(refreshUi, 5000);
})();
