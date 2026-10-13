/* ============================================================
   ERWEITERUNGEN: hängt die neuen Funktionen in die bestehende App ein, ohne localcommands.js und wachter.js zu verändern.
   Neu: Feiertage und Brückentage (feiertage.js), Sonne und Mond (sonnemond.js), gemeinsames Fenster dafür (extrafenster.js), Weltzeit (weltzeit.js),
        Unwetterwarnungen (unwetter.js), Filmtipps (filme.js). Die Ortssuche (ortsuche.js) hängt sich selbst ein.
   1) Sprachbefehle: Der Satz wird zuerst diesen Funktionen angeboten; erkennt keine ihn, geht er unverändert an die bisherigen festen Befehle
      (localcommands.js) und danach an die KI. Ein Fehler in einer neuen Funktion kann nichts anderes lahmlegen.
   2) Wächter: Unwetterwarnungen werden zu den Meldungen des Wächters (wachter.js) hinzugefügt.
   Muss NACH localcommands.js, wachter.js und den fünf Funktionsdateien geladen werden (siehe index.html).
   ============================================================ */
(function () {
    const HANDLERS = ['handleToeneCommand', 'handleKichernCommand', 'handleExtraWindowCommand', 'handleUnwetterCommand', 'handleFeiertageCommand', 'handleSonneMondCommand', 'handleWeltzeitCommand', 'handleFilmCommand'];
    // Diese kommen erst dran, wenn die bisherigen festen Befehle (localcommands.js, nearbymore.js ...) den Satz nicht erkannt haben, vor der KI
    const AFTER_HANDLERS = [];   // (Die Ortssuche hängt sich in ortsuche.js selbst hinter die bisherigen Befehle.)

    // 1) Sprachbefehle
    if (window.jvCommands) {   // Befehlsliste (commands.js)
        window.jvCommands.use('erweiterungen', function (text, next) {
            try {
                for (const name of HANDLERS) {
                    if (typeof window[name] === 'function' && window[name](text)) return true;
                }
            } catch (e) { console.error('Erweiterung fehlgeschlagen', e); }
            const handled = next(text);
            if (handled) return handled;
            try {
                for (const name of AFTER_HANDLERS) {
                    if (typeof window[name] === 'function' && window[name](text)) return true;
                }
            } catch (e) { console.error('Erweiterung fehlgeschlagen', e); }
            return handled;
        }, 1200);
    }

    // 2) Wächter: Unwetterwarnungen dazunehmen
    if (typeof window.wachterCollect === 'function') {
        const originalCollect = window.wachterCollect;
        window.wachterCollect = async function () {
            const out = await originalCollect.apply(this, arguments);
            try {
                if (typeof window.unwetterWachterItems === 'function') {
                    const extra = await Promise.race([window.unwetterWachterItems(), new Promise(res => setTimeout(() => res([]), 9000))]);
                    (extra || []).forEach(x => out.push(x));
                }
            } catch (e) { /* ohne Ortung oder Netz entfällt nur diese Meldung */ }
            return out;
        };
    }
})();