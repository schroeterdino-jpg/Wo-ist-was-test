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

   Braucht: localcommands.js (handleLocalCommand), prompt.js (buildSystemPrompt), panels.js (buildMenuPanel). Muss direkt nach localcommands.js geladen werden, vor allen Dateien, die sich eintragen.
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

    /* ============================================================
       jvChain – dasselbe für andere Funktionen, die mehrere Dateien ergänzen (KI-Anweisung buildSystemPrompt, ☰-Menü buildMenuPanel)

           jvChain.use('buildSystemPrompt', 'meinname', function (next, args) {
               let text = next();                 // Ergebnis der weiter innen stehenden Einträge (und zuletzt der ursprünglichen Funktion)
               return text + '\n\nMein Zusatz';   // eigene Ergänzung
           }, 300);

       Kleine Zahl = außen = wird zuletzt angehängt; große Zahl = innen = kommt zuerst. next() ohne Angaben gibt dieselben Argumente weiter,
       next(a, b) ersetzt sie. args = die ursprünglichen Argumente als Liste.
       ============================================================ */
    const chains = {};   // Funktionsname -> { base, entries }
    function chainInstall(fnName) {
        if (chains[fnName]) return chains[fnName];
        const f = window[fnName];
        if (typeof f !== 'function') return null;
        const c = { base: f, entries: [] };
        const disp = function () {
            const self = this, snap = c.entries.slice();
            const go = function (i, a) {
                if (i >= snap.length) return c.base.apply(self, a);
                const e = snap[i];
                let called = false, res;
                const next = function () { called = true; res = go(i + 1, arguments.length ? Array.prototype.slice.call(arguments) : a); return res; };
                try { return e.mw.call(self, next, a); }
                catch (err) {
                    console.error('Ergänzung "' + e.name + '" (' + fnName + ') fehlgeschlagen', err);
                    return called ? res : go(i + 1, a);
                }
            };
            return go(0, Array.prototype.slice.call(arguments));
        };
        disp._jvChain = true;
        chains[fnName] = c;
        window[fnName] = disp;
        return c;
    }
    function chainUse(fnName, name, mw, order) {
        if (typeof mw !== 'function') return false;
        const c = chainInstall(fnName);
        if (!c) return false;
        name = String(name || ''); order = Number(order); if (!isFinite(order)) order = 500;
        const i = c.entries.findIndex(e => e.name === name), e = { name, order, mw };
        if (i >= 0) c.entries[i] = e; else c.entries.push(e);
        c.entries.sort((a, b) => a.order - b.order);
        return true;
    }
    function chainList(fnName) { const c = chains[fnName]; return c ? c.entries.map(e => e.order + ' ' + e.name) : []; }
    ['buildSystemPrompt', 'buildMenuPanel'].forEach(chainInstall);   // gleich jetzt einhängen, ganz innen: alles, was später per Hand umhüllt, liegt außen wie bisher
    window.jvChain = { use: chainUse, list: chainList };
})();
