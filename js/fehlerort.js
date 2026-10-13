/* ============================================================
   FEHLERORT: Hilfe gegen "Cannot read properties of null (reading 'name')" im KI-Ablauf (assistant.js), ohne assistant.js zu verändern.
   1) Aufräumen: Ein leerer (null) Eintrag in der Protokoll-Liste würde im KI-Ablauf genau diesen Fehler auslösen, weil dort von jedem Protokoll der Name gelesen
      wird (assistant.js, "protokolle: Object.values(protocols).map(p => ...)"). Solche leeren Einträge werden vor jedem KI-Aufruf entfernt.
   2) Genauere Fehlermeldung: Tritt im KI-Ablauf trotzdem ein Fehler auf, steht im roten Streifen zusätzlich, in welcher Datei und Funktion er passiert ist
      (hinter dem @-Zeichen), damit er sich gezielt beheben lässt.
   Muss nach assistant.js und localcommands.js geladen werden.
   ============================================================ */
(function () {
    function cleanProtocols() {
        try {
            if (typeof protocols === 'undefined' || !protocols || typeof protocols !== 'object') return;
            let changed = false;
            Object.keys(protocols).forEach(k => {
                const p = protocols[k];
                if (!p || typeof p !== 'object') { delete protocols[k]; changed = true; }
            });
            if (changed && typeof setPersistentData === 'function') setPersistentData('helfer_protocols', JSON.stringify(protocols));
        } catch (e) { /* Aufräumen darf nie etwas stören */ }
    }
    cleanProtocols();

    function shortFrames(e) {
        try {
            return String(e.stack || '').split('\n').slice(1)
                .map(s => s.trim().replace(/^at\s+/, '').replace(/https?:\/\/[^\/\s)]+\//g, '').replace(/\?[^:)\s]*/g, ''))
                .filter(Boolean).slice(0, 2);
        } catch (x) { return []; }
    }

    if (typeof window.sendToGroqSmartCore === 'function' && !window.sendToGroqSmartCore._ort) {
        const original = window.sendToGroqSmartCore;
        const wrapped = async function () {
            cleanProtocols();
            try {
                return await original.apply(this, arguments);
            } catch (e) {
                try {
                    if (e && typeof e === 'object' && !e._ortAdded) {
                        e._ortAdded = true;
                        const frames = shortFrames(e);
                        if (frames.length) e.message = String(e.message) + ' @ ' + frames.join(' <- ');
                    }
                } catch (x) {}
                throw e;
            }
        };
        wrapped._ort = true;
        window.sendToGroqSmartCore = wrapped;
    }
})();
