/* ============================================================
   SCHLIESSEN: "Karte schließen", "Fenster zu", "Mondbild weg", "Alles schließen" ...
   Macht alles zu, was gerade offen ist: großes Fenster, Extra-Fenster (Mond usw.), Lagebild und die Karten-Kacheln unten.
   Ein einzelnes "Schließen" macht nur zu, wenn wirklich etwas offen ist (sonst geht der Satz normal weiter).
   Braucht: commands.js (jvCommands). Muss NACH extrafenster.js und lagebild.js geladen werden.
   ============================================================ */
(function () {
    const FUELL = new Set(['bitte', 'nova', 'zane', 'jarvis', 'die', 'das', 'den', 'dem', 'alle', 'alles', 'diese', 'dieses', 'diesen', 'mal', 'jetzt', 'doch', 'wieder', 'auch', 'mir', 'und', 'noch', 'bitte.', 'mehr', 'sofort']);
    const NOMEN = new Set(['karte', 'karten', 'kartenansicht', 'route', 'routenkarte', 'fenster', 'ansicht', 'anzeige', 'bild', 'mondbild', 'liste', 'ergebnis', 'ergebnisse', 'vorschläge', 'vorschlag', 'treffer', 'lagebild', 'radar', 'weltkugel', 'kacheln', 'kachel', 'panel', 'übersicht', 'sonne', 'mond', 'meldung', 'meldungen', 'infos', 'info', 'kamera', 'kameras', 'weltkarte', 'globus']);
    const VERB = /^(?:schlie(?:ß|ss)\w*|zumachen|zu|weg|ausblenden|blende|blend|verschwind\w*|verschwinde|löschen|lösch\w*|mach|mache|machst|schluss|raus|aus|entfern\w*)$/;
    const MACHT_ZU = /^(?:mach\w*|zumachen)$/;

    function offen() {
        const o = [];
        try { if (typeof isPanelOpen === 'function' && isPanelOpen()) o.push('panel'); } catch (e) {}
        try { if (window.jvLage && window.jvLage.isOpen()) o.push('lage'); } catch (e) {}
        try { const l = document.getElementById('extraFenster'); if (l) o.push('extra'); } catch (e) {}
        try { const b = document.getElementById('actionCards'); if (b && b.children.length) o.push('karten'); } catch (e) {}
        try { if (document.getElementById('wxMap')) o.push('wetterkarte'); } catch (e) {}   // die Wetterkarte ist kein Fenster aus panels.js
        return o;
    }

    function alleZu() {
        try { if (window.closeExtraWindow) window.closeExtraWindow(); } catch (e) {}
        try { if (window.jvLage && window.jvLage.isOpen()) window.jvLage.close(); } catch (e) {}
        try { if (typeof isPanelOpen === 'function' && isPanelOpen() && typeof closePanel === 'function') closePanel(); } catch (e) {}
        try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) {}
        try { if (typeof closeWeatherMap === 'function') closeWeatherMap(); } catch (e) {}
    }

    /* Ist die ganze Äußerung ein Schließbefehl? Gibt { nomen } zurück oder null. */
    function erkenne(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 50) return null;
        const w = t.split(' ').filter(x => x && !FUELL.has(x));
        if (!w.length || w.length > 4) return null;
        let verb = false, nomen = false;
        for (const x of w) {
            if (NOMEN.has(x)) nomen = true;
            else if (VERB.test(x)) verb = true;
            else return null;
        }
        if (!verb) return null;
        /* "aus"/"weg"/"zu" allein ohne Nomen ist zu vage */
        if (!nomen && w.every(x => /^(?:aus|weg|zu|raus|löschen|mach|mache|machst)$/.test(x))) {
            if (!w.some(x => MACHT_ZU.test(x)) || !w.includes('zu')) return null;
        }
        return { nomen };
    }

    function handle(text) {
        const e = erkenne(text);
        if (!e) return false;
        const o = offen();
        if (!o.length && !e.nomen) return false;   // nichts offen und kein Hauptwort: normal weiterreichen
        alleZu();
        const say = m => { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (er) {} };
        say(o.length ? ['Sehr wohl.', 'Ist zu.', 'Erledigt.', 'Gerne.'][Math.floor(Math.random() * 4)] : 'Es ist gerade nichts offen.');
        return true;
    }

    if (window.jvCommands) {
        window.jvCommands.use('schliessen', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Schließen', e); }
            return next(text);
        }, 2);
    }
    window.jvSchliessen = { handle, erkenne, offen, alleZu };
})();
