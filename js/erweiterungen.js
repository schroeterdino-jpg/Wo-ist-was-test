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

    // V9: Mehrfachfragen Wetter + Sonne/Mond getrennt ausführen.
    // Dadurch wird z.B. "Wie wird das Wetter morgen in Schwarzenbek und wann ist der nächste Vollmond?"
    // nicht mehr als ein einziger Wetter-Ortsname missverstanden.
    function handleWeatherMoonMulti(text) {
        const raw = String(text || '').trim();
        if (!raw || raw.length > 220) return false;
        const low = raw.toLowerCase();
        const hasWeather = /\b(wetter|wetterkarte|wettervorhersage|temperatur|regen)\b/.test(low);
        const hasMoonSun = /\b(vollmond|neumond|mond|mondphase|sonnenaufgang|sonnenuntergang)\b/.test(low);
        if (!hasWeather || !hasMoonSun) return false;

        // An Konjunktionen/Satzgrenzen trennen; nur übernehmen, wenn danach beide Themen als eigene Teile vorliegen.
        const parts = raw.split(/\s+(?:und|außerdem|sowie)\s+|[?;]+\s*/i).map(x => x.trim()).filter(Boolean);
        const weatherParts = parts.filter(x => /\b(wetter|wetterkarte|wettervorhersage|temperatur|regen)\b/i.test(x));
        const moonParts = parts.filter(x => /\b(vollmond|neumond|mond|mondphase|sonnenaufgang|sonnenuntergang)\b/i.test(x));
        if (!weatherParts.length || !moonParts.length) return false;

        let handled = false;
        // Wetter zuerst anstoßen; die Daten werden asynchron geladen.
        try {
            if (typeof window.handleWeatherMapCommand === 'function') {
                handled = !!window.handleWeatherMapCommand(weatherParts[0]) || handled;
            }
        } catch (e) { console.error('Mehrfachfrage Wetter fehlgeschlagen', e); }
        // Mond/Sonne separat ausführen. Das Mondfenster liegt sichtbar oben; nach dem Schließen bleibt die Wetteransicht darunter.
        try {
            if (typeof window.handleSonneMondCommand === 'function') {
                handled = !!window.handleSonneMondCommand(moonParts[0]) || handled;
            }
        } catch (e) { console.error('Mehrfachfrage Mond/Sonne fehlgeschlagen', e); }
        return handled;
    }

    // 1) Sprachbefehle
    if (window.jvCommands) {   // Befehlsliste (commands.js)
        window.jvCommands.use('erweiterungen', function (text, next) {
            try {
                if (handleWeatherMoonMulti(text)) return true;
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