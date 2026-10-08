/* ============================================================
   commands.js – EINE gemeinsame Liste für die festen Sprachbefehle
   ============================================================
   Früher hängte sich jede Datei mit eigenem Code vor handleLocalCommand (13 Stück hintereinander, drei davon mit Zeitschaltuhren,
   damit sie wieder "ganz außen" landen). Jetzt tragen sich die Dateien hier ein:

       jvCommands.use('weltuhr', function (text, next) {
           if (meinBefehl(text)) return true;      // erledigt: true
           return next(text);                      // nicht meiner: weiter an die nächste Stelle (und zuletzt an localcommands.js)
       }, 450);

   - Name: eindeutig. Trägt sich eine Datei zweimal ein, ersetzt der zweite Eintrag den ersten (kein Doppeln).
   - Zahl (order): Reihenfolge. KLEINE Zahl = ZUERST dran (außen), GROSSE Zahl = zuletzt (innen, direkt vor localcommands.js).
   - next(text) darf auch mit einem geänderten Text aufgerufen werden (Hör-Korrektur), oder später (Fristen), oder man schaut sich das Ergebnis an
     (Ortssuche: erst die festen Befehle, danach die eigene Suche).
   - Ein Fehler in einem Eintrag bricht NICHT alles ab: er wird gemeldet, dann geht der Satz an den nächsten Eintrag.
   - Fehlt diese Datei, melden das index.html (roter Streifen "FEHLT NACH DEM START") und der Selbsttest.

   Braucht: localcommands.js (handleLocalCommand). Muss direkt danach geladen werden, vor allen Dateien, die sich eintragen.
   ============================================================ */
(function () {
    'use strict';
    const entries = [];   // { name, order, mw }
    let base = null;      // die ursprüngliche handleLocalCommand aus localcommands.js

    function use(name, mw, order) {
        if (typeof mw !== 'function') return false;
        name = String(name || ''); order = Number(order); if (!isFinite(order)) order = 500;
        const i = entries.findIndex(e => e.name === name);
        const e = { name, order, mw };
        if (i >= 0) entries[i] = e; else entries.push(e);
        entries.sort((a, b) => a.order - b.order);   // stabil: bei gleicher Zahl bleibt die Eintragsreihenfolge
        return true;
    }
    function remove(name) { const i = entries.findIndex(e => e.name === name); if (i >= 0) entries.splice(i, 1); return i >= 0; }
    function list() { return entries.map(e => e.order + ' ' + e.name); }

    function run(text) {
        const snap = entries.slice();   // wer sich während des Laufs einträgt, ändert diesen Durchlauf nicht
        const go = function (i, t) {
            if (i >= snap.length) return base ? base(t) : false;
            const e = snap[i];
            let called = false, res = false;
            const next = function (t2) { called = true; res = go(i + 1, arguments.length ? t2 : t); return res; };
            try { return e.mw(t, next); }
            catch (err) {
                console.error('Sprachbefehl "' + e.name + '" fehlgeschlagen', err);
                return called ? res : go(i + 1, t);   // nicht doppelt weiterreichen, wenn der Eintrag schon weitergegeben hatte
            }
        };
        return go(0, text);
    }

    function dispatcher(text) {
        try { return run(text); }
        catch (e) { console.error('Fester Sprachbefehl fehlgeschlagen', e); return false; }
    }

    /* Einhängen: genau einmal, ganz innen (die Dateien, die noch den alten Weg nehmen, umhüllen es von außen wie bisher) */
    if (typeof window.handleLocalCommand === 'function' && !window.handleLocalCommand._jvCommands) {
        base = window.handleLocalCommand;
        dispatcher._jvCommands = true;
        window.handleLocalCommand = dispatcher;
    }
    window.jvCommands = { use, remove, list };
    window.jvCommandsUse = use;
})();
