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

    /* ============================================================
       B4, Stufe 1: MEHRFACHFRAGEN (nur lesend). "Was steht morgen im Kalender und wie wird das Wetter?"
       Ein früher fester Auskunftsbefehl (zum Beispiel "Was steht an") nahm den ganzen Satz und beantwortete nur seinen Teil.
       Jetzt: erkennt dieser Eintrag (steht VOR den Auskunftsbefehlen) mehrere eigenständige Fragen und
         - führt die Teile, die eine "reine Auskunft" sind (Markierung in js/faehigkeiten.js, jvFaehigkeiten.reineAuskuenfte()), einzeln aus
           (ihre Sprachausgabe wird aufgefangen, nicht gesprochen),
         - schickt alle anderen Fragen gebündelt in EINEM KI-Aufruf (Sammelmodus "collect", wie die Protokolle),
         - setzt alles mit js/antwort_bau.js (B3) zu EINER gesprochenen Antwort zusammen; Teilfehler werden genannt, erfolgreiche Teile bleiben.
       Geändert wird nichts: nur Teile, die als reine Auskunft markiert sind, laufen lokal. Schreibende Aktionen gehen nie über diesen Weg.
       Greift nur, wenn mindestens ein Teil eine reine Auskunft ist; sonst läuft alles wie bisher (Fragen nur für die KI bleiben bei der KI).
       Abhängige Teile ("danach", "dort", "dann", "dabei", "damit", "davor", "dazu"): werden NICHT zerlegt; der ganze Satz geht direkt an die KI,
       die frühen lokalen Einzelbefehle werden übersprungen (kein Schleifenrisiko: der Satz läuft nicht noch einmal durch diesen Eintrag).
       Erkennung (eng): Satz beginnt mit Fragewort; Trennung nur bei "und"/"?" + weiterem Fragewort; höchstens 3 Fragen; jeder Teil mindestens 3 Wörter;
       nicht bei wenn/falls/sobald/Protokoll. Ein normales "und" in einer einzelnen Frage trennt nicht.
       ============================================================ */
    const FW = '(?:wann|wie|was|wo|wer|wem|wen|welche|welcher|welches|welchen|welchem|woher|wohin|warum|wieso|weshalb|wieviel|wieviele)';
    const FRAGE_TRENNER = new RegExp('\\s*(?:\\?\\s*|,?\\s+und\\s+)(?=' + FW + '\\b)', 'i');
    const FRAGE_START = new RegExp('^' + FW + '\\b', 'i');
    const BEZUG = /\b(?:danach|dort|dann|dabei|damit|davor|dazu)\b/i;
    const MAX_FRAGEN = 3, KI_GRENZE_MS = 45000;
    let sperre = false;   // Schutz gegen erneutes Durchlaufen desselben Handlers (Bypass-Flag)

    function frageAnalyse(text) {
        const t = String(text || '').trim().replace(/[?!.\s]+$/, '');
        if (!t || t.split(/\s+/).length > 40) return null;
        if (/\b(wenn|falls|sobald|protokoll)\b/i.test(t)) return null;
        if (!FRAGE_START.test(t)) return null;
        const p = t.split(FRAGE_TRENNER).map(x => x.replace(/^[\s,;.]+|[\s,;.]+$/g, '')).filter(Boolean);
        if (p.length < 2 || p.length > MAX_FRAGEN) return null;
        if (p.some(x => x.split(/\s+/).length < 3 || !FRAGE_START.test(x))) return null;
        return { teile: p.map(x => x.charAt(0).toUpperCase() + x.slice(1) + '?'), abhaengig: BEZUG.test(t) };
    }
    function sichereNamen() {
        try { const F = window.jvFaehigkeiten; return F && typeof F.reineAuskuenfte === 'function' ? F.reineAuskuenfte() : []; } catch (e) { return []; }
    }
    /* Führt einen Teil als reine Auskunft aus, falls einer der markierten Befehle ihn übernimmt. Die Sprachausgabe wird aufgefangen. null = kein sicherer Befehl. */
    function sichererTeil(teil, namen) {
        const J = window.jvCommands;
        if (!J || typeof J.nur !== 'function' || !namen.length) return null;
        const fang = [], orig = window.speak;
        window.speak = function (t) { fang.push(String(t == null ? '' : t)); };
        let ok = false;
        try { ok = !!J.nur(namen, teil); } catch (e) { ok = false; } finally { window.speak = orig; }
        return ok ? { text: fang.join(' ').trim() } : null;
    }
    function ausfallText(kiTeile) {
        return kiTeile.length && kiTeile.every(x => /wetter|regen|schirm|temperatur|\bgrad\b/i.test(x)) ? 'Wetter konnte ich gerade nicht laden.' : 'Dazu konnte ich gerade keine Antwort holen.';
    }
    function mitTimeout(p, ms) { return Promise.race([p, new Promise(res => setTimeout(() => res({ zeit: true }), ms))]); }

    async function frageAusfuehren(a, erg) {
        const plaetze = [], kiTeile = [];
        let kiPlatz = -1;
        a.teile.forEach((t, i) => {
            if (erg[i]) plaetze.push({ ok: !!erg[i].text, text: erg[i].text || 'Dazu konnte ich gerade nichts ermitteln.' });
            else { kiTeile.push(t); if (kiPlatz < 0) { kiPlatz = plaetze.length; plaetze.push(null); } }
        });
        let karten = [];
        if (kiTeile.length) {
            let antwort = '', fehler = false, fertig = false;
            try {
                const r = await mitTimeout(Promise.resolve(window.sendToGroqSmart(kiTeile.map((x, i) => (i ? x.charAt(0).toLowerCase() + x.slice(1) : x).replace(/\?$/, '')).join(' und ') + '?', { nurLesen: true, collect: (r, c, meta) => { fertig = true; antwort = String(r || ''); karten = c || []; if (meta && meta.fehler) fehler = true; } })), KI_GRENZE_MS);
                if (r && r.zeit) fehler = true;
            } catch (e) { fehler = true; }
            if (!fertig || !antwort.trim()) fehler = true;
            plaetze[kiPlatz] = fehler ? { ok: false, text: ausfallText(kiTeile) } : { ok: true, text: antwort };
        }
        const teile = plaetze.filter(Boolean);
        const oks = teile.filter(x => x.ok).map(x => x.text);
        let text;
        try { text = window.jvAntwort && typeof window.jvAntwort.baue === 'function' ? window.jvAntwort.baue({ basis: oks.join(' '), sonder: teile, okAnzahl: oks.length }) : teile.map(x => x.text).join(' '); }
        catch (e) { text = teile.map(x => x.text).join(' '); }
        try { if (karten.length && typeof window.showActionCards === 'function') window.showActionCards(karten); } catch (e) { }
        try { window.speak(text, typeof window.continueConversation === 'function' ? window.continueConversation : undefined); } catch (e) { }
    }

    function frageBefehl(text, next) {
        if (sperre || (window.jvMehrfachfrage && window.jvMehrfachfrage.umgehen === true)) return next(text);
        const a = frageAnalyse(text);
        if (!a) return next(text);
        const namen = sichereNamen();
        if (!namen.length || !window.jvCommands || typeof window.jvCommands.nur !== 'function') return next(text);
        const erg = a.teile.map(t => sichererTeil(t, namen));
        if (!erg.some(Boolean)) return next(text);   // keine sichere lokale Auskunft dabei: alles wie bisher
        if (a.abhaengig) {   // Teile hängen voneinander ab: nicht zerlegen, ganzer Satz direkt an die KI (lokale Einzelbefehle übersprungen)
            sperre = true;
            try { anKI(String(text)); } finally { sperre = false; }
            return true;
        }
        frageAusfuehren(a, erg).catch(e => { console.error('Mehrfachfrage', e && e.message); });
        return true;
    }
    window.jvMehrfachfrage = { analyse: frageAnalyse, umgehen: false };
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('mehrfachfrage', frageBefehl, 0.05);

    window.jvMehrfach = { teile };
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('mehrfach', befehl, 0.5);
})();
