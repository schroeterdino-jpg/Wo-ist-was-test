/* ============================================================
   CAPABILITY REGISTRY (Phase 2): Jarvis kennt seine Fähigkeiten an EINER Stelle und kann sie einheitlich aufrufen.
   KERN, ohne eigene Fähigkeiten. Die fünf ersten Fähigkeiten stehen in js/registry_faehigkeiten.js.
   NICHT PRODUKTIV: Weder assistant.js noch actions.js, commands.js oder eine andere Datei benutzt die Registry. Sie wird nur von Tests aufgerufen.
   Kein Speicher, kein Netz, keine Sprachausgabe, keine Zeitgeber, kein Zugriff auf die Seite: dieser Kern ruft nur das auf, was eine Fähigkeit ihm gibt.
   (Das beschreibende "Fähigkeiten-Verzeichnis" window.jvFaehigkeiten in js/faehigkeiten.js ist etwas anderes und bleibt unverändert.)

   window.jvRegistry.registriere(def)        meldet eine Fähigkeit an. Gibt { ok:true } oder { ok:false, fehler:[...] } zurück (wirft nie). Doppelte Namen werden abgelehnt.
   window.jvRegistry.fuehreAus(name, params, opts)   führt sie aus und liefert IMMER ein Ergebnis im Einheitsformat (wirft nie), siehe unten.
   window.jvRegistry.hole(name) / namen() / beschreibe(name?)   nachschlagen; beschreibe() liefert nur Daten (keine Funktionen), später für die Chef-KI.
   window.jvRegistry.pruefeParameter(name, params)   nur die Parameterprüfung, ohne etwas auszuführen.
   window.jvRegistry.pruefeVerweise()        Fallbacks, die nicht angemeldet sind.
   window.jvRegistry.erzeuge()               eine NEUE, leere Registry (für Tests oder Sonderfälle; die globale bleibt unberührt).

   Eine Fähigkeit (def):
     name           eindeutig, Kleinbuchstaben/Ziffern/Unterstrich, beginnt mit Buchstabe
     beschreibung   was sie kann (ein Satz, für Menschen und später für die Chef-KI)
     pflicht        [{ name, typ, beschreibung }]   erforderliche Parameter; typ: text | zahl | ja_nein | zeit | liste
     optional       [{ name, typ, beschreibung }]   optionale Parameter
     rueckgabe      { beschreibung, felder: [..] }  Format von `daten` bei SUCCESS
     fehler         [{ status, wann }]              mögliche Fehlerzustände (status aus STATUS, nicht SUCCESS)
     fallbacks      [namen]                         Fähigkeiten, die es stattdessen versuchen könnten (die Registry führt sie NICHT selbst aus)
     bestaetigung   { noetig: true|false, grund }   noetig:true -> ohne opts.bestaetigt===true wird nichts ausgeführt (NEEDS_CONFIRMATION)
     pruefeErfolg   function(daten, params, kontext) -> true NUR wenn die Wirkung nachweisbar eingetreten ist; sonst gilt es als TOOL_FAILED
     verbindung     { datei, funktion, aktion? }    die bestehende Implementierung, die verwendet wird (kein zweiter Code)
     ausfuehren     function(params, kontext) -> daten (darf async sein, darf werfen)
     leer           optional: function(daten) -> true heißt NO_RESULTS
     vorpruefung    optional: function(params, kontext) -> null | { status, nachricht, fehlend? } (zum Beispiel die Sicherheitsprüfung aus Phase 1)
     verfuegbar     optional: function() -> false heißt CAPABILITY_MISSING (zum Beispiel: die Implementierung fehlt in dieser Umgebung)

   Ergebnis von fuehreAus (immer genau diese Felder):
     { status, faehigkeit, ausgefuehrt, trocken, daten, nachricht, fehlend, alternativen, grund }
     status        SUCCESS | NO_RESULTS | TOOL_FAILED | CAPABILITY_MISSING | NEEDS_INFORMATION | NEEDS_CONFIRMATION
     ausgefuehrt   true, sobald die Implementierung aufgerufen wurde (auch wenn sie dann scheiterte)
     trocken       true bei opts.trocken: Parameter, Sicherheit und Bestätigung werden geprüft, die Implementierung wird NICHT aufgerufen
     fehlend       Namen fehlender oder ungültiger Pflichtparameter (bei NEEDS_INFORMATION)
     alternativen  angemeldete Fallbacks (bei allen Status außer SUCCESS)
   ============================================================ */
(function () {
    'use strict';
    if (window.jvRegistry) return;

    var STATUS = Object.freeze({
        SUCCESS: 'SUCCESS', NO_RESULTS: 'NO_RESULTS', TOOL_FAILED: 'TOOL_FAILED',
        CAPABILITY_MISSING: 'CAPABILITY_MISSING', NEEDS_INFORMATION: 'NEEDS_INFORMATION', NEEDS_CONFIRMATION: 'NEEDS_CONFIRMATION'
    });
    var TYPEN = ['text', 'zahl', 'ja_nein', 'zeit', 'liste'];
    var NAME_RX = /^[a-z][a-z0-9_]*$/;

    /* Verständliche Sätze; die Sätze für Technikfehler und fehlende Fähigkeit kommen, wenn vorhanden, aus js/sicherheit.js (Phase 1), damit Jarvis überall gleich klingt. */
    function satz(art, fallback) {
        try { var t = window.jvSicher && window.jvSicher.texte; if (t && typeof t[art] === 'string') return t[art]; } catch (e) { }
        return fallback;
    }

    function leereErgebnis(status, name) {
        return { status: status, faehigkeit: String(name == null ? '' : name), ausgefuehrt: false, trocken: false, daten: null, nachricht: '', fehlend: [], alternativen: [], grund: '' };
    }

    function istLeer(v) {
        if (v === undefined || v === null) return true;
        if (typeof v === 'string') return !v.trim();
        if (Array.isArray(v)) return !v.some(function (x) { return !istLeer(x); });
        return false;
    }
    function typOk(typ, v) {
        if (typ === 'text') return typeof v === 'string' || typeof v === 'number';
        if (typ === 'zahl') return typeof v === 'number' ? isFinite(v) : (typeof v === 'string' && v.trim() !== '' && isFinite(+v));
        if (typ === 'ja_nein') return typeof v === 'boolean' || v === 'true' || v === 'false';
        if (typ === 'zeit') return (typeof v === 'string' || typeof v === 'number') && !isNaN(new Date(v).getTime());
        if (typ === 'liste') return Array.isArray(v);
        return false;
    }

    function pruefeDefinition(def) {
        var f = [];
        if (!def || typeof def !== 'object') return ['Die Fähigkeit ist kein Objekt.'];
        if (typeof def.name !== 'string' || !NAME_RX.test(def.name)) f.push('name fehlt oder ist ungültig (Kleinbuchstaben, Ziffern, Unterstrich)');
        if (typeof def.beschreibung !== 'string' || !def.beschreibung.trim()) f.push('beschreibung fehlt');
        ['pflicht', 'optional'].forEach(function (k) {
            if (!Array.isArray(def[k])) { f.push(k + ' muss eine Liste sein (auch leer)'); return; }
            var gesehen = {};
            def[k].forEach(function (p, i) {
                if (!p || typeof p.name !== 'string' || !p.name.trim()) f.push(k + '[' + i + '].name fehlt');
                else if (gesehen[p.name]) f.push(k + ': Parameter doppelt: ' + p.name); else gesehen[p.name] = true;
                if (!p || TYPEN.indexOf(p.typ) < 0) f.push(k + '[' + i + '].typ muss einer von ' + TYPEN.join('/') + ' sein');
                if (!p || typeof p.beschreibung !== 'string' || !p.beschreibung.trim()) f.push(k + '[' + i + '].beschreibung fehlt');
            });
        });
        if (Array.isArray(def.pflicht) && Array.isArray(def.optional)) {
            def.pflicht.forEach(function (p) { if (p && def.optional.some(function (o) { return o && o.name === p.name; })) f.push('Parameter steht in pflicht UND optional: ' + p.name); });
        }
        if (!def.rueckgabe || typeof def.rueckgabe.beschreibung !== 'string' || !def.rueckgabe.beschreibung.trim() || !Array.isArray(def.rueckgabe.felder)) f.push('rueckgabe braucht beschreibung und felder[]');
        if (!Array.isArray(def.fehler) || !def.fehler.length) f.push('fehler: mindestens ein möglicher Fehlerzustand nötig');
        else def.fehler.forEach(function (e, i) {
            if (!e || !STATUS[e.status] || e.status === STATUS.SUCCESS) f.push('fehler[' + i + '].status ungültig');
            if (!e || typeof e.wann !== 'string' || !e.wann.trim()) f.push('fehler[' + i + '].wann fehlt');
        });
        if (!Array.isArray(def.fallbacks) || def.fallbacks.some(function (n) { return typeof n !== 'string' || !n; })) f.push('fallbacks muss eine Liste von Namen sein (auch leer)');
        else if (def.fallbacks.indexOf(def.name) >= 0) f.push('eine Fähigkeit kann nicht ihr eigener Fallback sein');
        if (!def.bestaetigung || typeof def.bestaetigung.noetig !== 'boolean' || typeof def.bestaetigung.grund !== 'string' || !def.bestaetigung.grund.trim()) f.push('bestaetigung braucht noetig (true/false) und grund');
        if (typeof def.pruefeErfolg !== 'function') f.push('pruefeErfolg (Erfolgsprüfung) fehlt');
        if (!def.verbindung || typeof def.verbindung.datei !== 'string' || !def.verbindung.datei || typeof def.verbindung.funktion !== 'string' || !def.verbindung.funktion) f.push('verbindung braucht datei und funktion der bestehenden Implementierung');
        if (typeof def.ausfuehren !== 'function') f.push('ausfuehren fehlt');
        ['leer', 'vorpruefung', 'verfuegbar'].forEach(function (k) { if (def[k] !== undefined && typeof def[k] !== 'function') f.push(k + ' muss eine Funktion sein'); });
        return f;
    }

    function erzeuge() {
        var verz = {};   // name -> eingefrorene Kopie der Definition (die Funktionen bleiben dieselben)

        function registriere(def) {
            var fehler;
            try { fehler = pruefeDefinition(def); } catch (e) { fehler = ['Definition nicht lesbar']; }
            if (!fehler.length && Object.prototype.hasOwnProperty.call(verz, def.name)) fehler.push('Name schon vergeben: ' + def.name);
            if (fehler.length) return { ok: false, fehler: fehler };
            var kopie = {};
            Object.keys(def).forEach(function (k) { kopie[k] = def[k]; });
            kopie.pflicht = def.pflicht.map(function (p) { return Object.freeze({ name: p.name, typ: p.typ, beschreibung: p.beschreibung }); });
            kopie.optional = def.optional.map(function (p) { return Object.freeze({ name: p.name, typ: p.typ, beschreibung: p.beschreibung }); });
            verz[def.name] = Object.freeze(kopie);
            return { ok: true, fehler: [] };
        }

        function hole(name) { return Object.prototype.hasOwnProperty.call(verz, name) ? verz[name] : null; }
        function namen() { return Object.keys(verz); }

        function alternativenVon(def) { return (def && def.fallbacks ? def.fallbacks : []).filter(function (n) { return hole(n); }); }

        function beschreibeEine(d) {
            return {
                name: d.name, beschreibung: d.beschreibung,
                pflicht: d.pflicht.map(function (p) { return { name: p.name, typ: p.typ, beschreibung: p.beschreibung }; }),
                optional: d.optional.map(function (p) { return { name: p.name, typ: p.typ, beschreibung: p.beschreibung }; }),
                rueckgabe: { beschreibung: d.rueckgabe.beschreibung, felder: d.rueckgabe.felder.slice() },
                fehler: d.fehler.map(function (e) { return { status: e.status, wann: e.wann }; }),
                fallbacks: d.fallbacks.slice(),
                bestaetigung: { noetig: d.bestaetigung.noetig, grund: d.bestaetigung.grund },
                verbindung: { datei: d.verbindung.datei, funktion: d.verbindung.funktion, aktion: d.verbindung.aktion || '' }
            };
        }
        function beschreibe(name) {
            if (name !== undefined) { var d = hole(name); return d ? beschreibeEine(d) : null; }
            return namen().map(function (n) { return beschreibeEine(verz[n]); });
        }

        function pruefeVerweise() {
            var lose = [];
            namen().forEach(function (n) { verz[n].fallbacks.forEach(function (fb) { if (!hole(fb)) lose.push({ faehigkeit: n, fallback: fb }); }); });
            return lose;
        }

        /* Nur die Parameter: fehlend = nicht vorhanden/leer, ungueltig = vorhanden, aber falscher Typ (auch bei optionalen). */
        function pruefeParameter(name, params) {
            var d = hole(name);
            if (!d) return { status: STATUS.CAPABILITY_MISSING, fehlend: [], ungueltig: [] };
            var p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
            var fehlend = [], ungueltig = [];
            d.pflicht.forEach(function (x) {
                if (istLeer(p[x.name])) fehlend.push(x.name);
                else if (!typOk(x.typ, p[x.name])) ungueltig.push(x.name);
            });
            d.optional.forEach(function (x) { if (!istLeer(p[x.name]) && !typOk(x.typ, p[x.name])) ungueltig.push(x.name); });
            return { status: (fehlend.length || ungueltig.length) ? STATUS.NEEDS_INFORMATION : STATUS.SUCCESS, fehlend: fehlend, ungueltig: ungueltig };
        }

        async function fuehreAus(name, params, opts) {
            var o = (opts && typeof opts === 'object') ? opts : {};
            var d = null, r = leereErgebnis(STATUS.CAPABILITY_MISSING, name);
            try {
                d = hole(name);
                if (!d) {
                    r.nachricht = satz('fehlt', 'Dafür fehlt mir noch die passende Fähigkeit.');
                    r.grund = 'nicht angemeldet';
                    return r;
                }
                r.alternativen = alternativenVon(d);
                if (typeof d.verfuegbar === 'function' && d.verfuegbar() === false) {
                    r.nachricht = satz('fehlt', 'Dafür fehlt mir noch die passende Fähigkeit.');
                    r.grund = 'Implementierung nicht verfügbar';
                    return r;
                }
                var p = (params && typeof params === 'object' && !Array.isArray(params)) ? params : {};
                var pp = pruefeParameter(name, p);
                if (pp.status !== STATUS.SUCCESS) {
                    r.status = STATUS.NEEDS_INFORMATION; r.fehlend = pp.fehlend.concat(pp.ungueltig);
                    r.nachricht = satz('unvollstaendig', 'Dazu waren die Angaben unvollständig.');
                    r.grund = pp.fehlend.length ? 'Pflichtangabe fehlt' : 'Angabe ungültig';
                    return r;
                }
                if (typeof d.vorpruefung === 'function') {
                    var v = d.vorpruefung(p, o.kontext);
                    if (v && v.status && STATUS[v.status] && v.status !== STATUS.SUCCESS) {
                        r.status = v.status; r.nachricht = String(v.nachricht || ''); r.fehlend = Array.isArray(v.fehlend) ? v.fehlend.slice() : [];
                        r.grund = 'Vorprüfung';
                        return r;
                    }
                }
                if (d.bestaetigung.noetig && o.bestaetigt !== true) {
                    r.status = STATUS.NEEDS_CONFIRMATION;
                    r.nachricht = (typeof o.frage === 'string' && o.frage) ? o.frage : 'Soll ich das wirklich tun? ' + d.bestaetigung.grund;
                    r.grund = 'Bestätigung nötig';
                    return r;
                }
                if (o.trocken === true) {
                    r.status = STATUS.SUCCESS; r.trocken = true; r.nachricht = 'Trockenlauf: alles geprüft, nichts ausgeführt.'; r.alternativen = [];
                    return r;
                }
                r.ausgefuehrt = true;
                var daten;
                try { daten = await d.ausfuehren(p, o.kontext); }
                catch (e) {
                    r.status = STATUS.TOOL_FAILED; r.grund = 'Ausnahme';
                    r.nachricht = (e && typeof e.userMessage === 'string' && e.userMessage) ? e.userMessage : satz('technik', 'Dabei ist technisch etwas schiefgelaufen.');
                    return r;
                }
                r.daten = daten === undefined ? null : daten;
                if (typeof d.leer === 'function' && d.leer(daten) === true) {
                    r.status = STATUS.NO_RESULTS; r.grund = 'keine Treffer';
                    r.nachricht = (daten && typeof daten.reply === 'string') ? daten.reply : '';
                    return r;
                }
                var belegt = false;
                try { belegt = d.pruefeErfolg(daten, p, o.kontext) === true; } catch (e) { belegt = false; }
                if (!belegt) {
                    r.status = STATUS.TOOL_FAILED; r.grund = 'Erfolg nicht nachgewiesen';
                    r.nachricht = (daten && typeof daten.nachricht === 'string' && daten.nachricht) ? daten.nachricht : satz('technik', 'Dabei ist technisch etwas schiefgelaufen.');
                    return r;
                }
                r.status = STATUS.SUCCESS; r.alternativen = [];
                r.nachricht = (daten && typeof daten.nachricht === 'string') ? daten.nachricht : '';
                return r;
            } catch (e) {
                /* Letzte Absicherung: auch ein Fehler in der Registry selbst wirft nie nach außen. */
                var x = leereErgebnis(STATUS.TOOL_FAILED, name);
                x.ausgefuehrt = r.ausgefuehrt; x.grund = 'Fehler in der Registry'; x.nachricht = satz('technik', 'Dabei ist technisch etwas schiefgelaufen.');
                return x;
            }
        }

        return { STATUS: STATUS, registriere: registriere, hole: hole, namen: namen, beschreibe: beschreibe, pruefeParameter: pruefeParameter, pruefeVerweise: pruefeVerweise, fuehreAus: fuehreAus, erzeuge: erzeuge };
    }

    window.jvRegistry = erzeuge();
})();
