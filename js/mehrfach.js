/* ============================================================
   mehrfach.js – mehrere Wünsche in einem Satz ("Stell den Wecker auf 4 Uhr und setz Milch auf die Liste")
   ============================================================
   Problem: Ein fester Sprachbefehl (Wecker, Heimweg, Planer, Aufträge ...) fängt den ganzen Satz ab und erledigt nur seinen Teil;
   der Rest ging verloren. Die KI kann zwar mehrere Aktionen in einem Satz, sieht den Satz aber gar nicht, wenn ein fester Befehl zuerst zugreift.
   Lösung: Dieser Eintrag steht ganz außen in der Befehlsliste (commands.js). Er trennt den Satz an eindeutigen Stellen
   ("und dann", "danach", "außerdem", oder "und" + Befehlswort wie stell/setz/trag/erinnere ...) und probiert die Teile der Reihe nach:
     - Ist ein Teil ein fester Befehl, führt Jarvis ihn aus; danach (wenn er fertig gesprochen hat) kommt der nächste Teil.
     - Teile, die kein fester Befehl sind, gehen gesammelt an die KI.
     - Ist keiner der Teile ein fester Befehl, bleibt alles wie bisher (der ganze Satz geht unverändert weiter).
   Nicht getrennt wird: "wenn ... dann ..." (Bedingungen), Protokolle, Fragen mit "und" ("Wie wird das Wetter und wie ...").
   Braucht: commands.js (jvCommands), voice.js (isSpeaking, isProcessing, sendToGroqSmart). Fehlt etwas, tut die Datei still nichts.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvMehrfach) return;

    const START = '(?:stell|stelle|setz|setze|trag|trage|erinner|erinnere|schreib|schreibe|sag|sage|zeig|zeige|ruf|rufe|mach|mache|l(?:ö|oe)sch|l(?:ö|oe)sche|such|suche|find|finde|schalt|schalte|starte|start|spiel|spiele|lies|lese|speicher|speichere|merk|merke|leg|lege|(?:ö|oe)ffne|schick|schicke|gib|lass|bring|navigier|navigiere|pr(?:ü|ue)f|pr(?:ü|ue)fe|beobacht\\w*|wecke?|weck)\\b';
    const TRENNER = new RegExp('\\s*[,;]?\\s+(?:(?:und\\s+(?:dann|danach|anschlie(?:ß|ss)end|au(?:ß|ss)erdem|noch)|danach|anschlie(?:ß|ss)end|au(?:ß|ss)erdem)\\b\\s*|und\\s+(?=' + START + '))', 'i');
    const MAX_TEILE = 4;

    function teile(text) {
        const t = String(text || '').trim();
        if (!t || t.split(/\s+/).length > 40) return [t];
        if (/\b(wenn|falls|sobald|protokoll)\b/i.test(t)) return [t];   // Bedingungen und Protokolle bleiben ganz
        let a = t.split(TRENNER).map(x => x.replace(/^[\s,;.]+|[\s,;.]+$/g, '').replace(/\s+bitte$/i, '')).filter(Boolean);
        if (a.length < 2 || a.length > MAX_TEILE) return [t];
        if (a.some(x => x.split(/\s+/).length < 2 || x.length < 5)) return [t];   // zu kurze Stücke: wahrscheinlich keine echte Trennung
        return a;
    }

    function bereit() {
        try {
            if (typeof isProcessing !== 'undefined' && isProcessing) return false;
            if (typeof isSpeaking === 'function' && isSpeaking()) return false;
        } catch (e) { }
        return true;
    }
    function warte(maxMs) {
        return new Promise(res => {
            const t0 = Date.now();
            setTimeout(function schau() { if (bereit() || Date.now() - t0 > maxMs) res(); else setTimeout(schau, 500); }, 700);
        });
    }
    function anKI(t) {
        try { if (typeof sendToGroqSmart === 'function') sendToGroqSmart(t); } catch (e) { console.error('Mehrfach: KI', e && e.message); }
    }
    function fest(t) {   // ganzer Befehlsweg (auch für den Rest eines Satzes); false = kein fester Befehl
        try { return typeof window.handleLocalCommand === 'function' ? !!window.handleLocalCommand(t) : false; } catch (e) { return false; }
    }

    function befehl(text, next) {
        const p = teile(text);
        if (p.length < 2) return next(text);
        const ki = [];
        let i = 0, erledigt = false;
        for (; i < p.length; i++) {   // bis zum ersten festen Befehl: sofort probieren (nichts ist gesprochen worden)
            let ok = false;
            try { ok = !!next(p[i]); } catch (e) { ok = false; }
            if (ok) { erledigt = true; i++; break; }
            ki.push(p[i]);
        }
        if (!erledigt) return next(text);   // kein Teil ist ein fester Befehl: alles wie bisher, die KI bekommt den ganzen Satz
        const rest = p.slice(i);
        (async () => {
            for (const t of rest) {
                await warte(25000);
                if (!fest(t)) ki.push(t);
            }
            if (ki.length) { await warte(25000); anKI(ki.join(' und ')); }
        })();
        return true;
    }

    window.jvMehrfach = { teile };
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('mehrfach', befehl, 0.5);
})();
