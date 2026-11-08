/* ============================================================
   CHEF-KI (Phase 6): zentrale Steuerung, die eine Anfrage in einen kleinen, GEPRÜFTEN Plan übersetzt und die passende Fähigkeit aus window.jvRegistry ausführt.
   Sie ersetzt nichts und ist kein zweiter Jarvis: Sie verbindet nur Vorhandenes (Registry, Sicherheit, Gesprächsgedächtnis, bestehende KI-Anbindung).
   STANDARDMÄSSIG AUS. Aus: jvChef.behandle() gibt sofort false zurück, alles läuft wie bisher.

   Entscheidung: ein ENTSCHEIDER liefert einen Plan { absicht, schritte:[{ faehigkeit, params }], frage?, hinweis?, benoetigt?:[Namen] }.
     - Standard: lokaler Entscheider (deutsche Muster, kostenlos, ohne Netz).
     - Optional: KI-Entscheider (jvChef.kiEntscheider(sende)); die Funktion `sende` wird von außen gegeben. Ohne sie gibt es keinen KI-Aufruf. Im Sprachweg (behandle) wird NUR der lokale Entscheider benutzt.
     Egal woher der Plan kommt (auch von der KI): pruefePlan() prüft ihn streng. Unbekannte Felder werden verworfen, "bestaetigt"/"trocken" aus einem Plan zählen nie.
   Vor jeder Ausführung: Fähigkeit registriert? Pflichtangaben da? Aktion erlaubt (freigegeben)? Bestätigung nötig? Fehler sicher behandelt?
   Ausführen (echt) darf die Chef-KI NUR die lesenden Fähigkeiten "ortssuche", "websuche" und "wetter", und nur wenn sie EIN ist. Alles andere (Erinnerung, Termin, Gedächtnis ...) läuft nur im Testmodus (trocken:true: es wird geprüft, nichts ausgeführt).
   KI-Weg (Paket "Chef-KI erweitern"): EIN Entscheider-Aufruf je Eingabe plant bis zu 3 Schritte (höchstens 1 Websuche, 2 Ortssuchen, 1 Wetter) oder stellt EINE kurze Rückfrage. Die Schritte laufen nacheinander, gesprochen wird EINMAL eine zusammengefasste Antwort.
   Gesamtzeitbudget 20 s (GESAMT_MS): danach wird alles Weitere verworfen und GENAU EINMAL der bisherige Ablauf genommen. Ein Anschluss-Thema (Wetter/Orte/Internet, nur Art und Tag, 10 Minuten) hilft bei kurzen Folgefragen ("und übermorgen?").
   Eine Chef-KI-Bestätigung gibt es in Phase 6 nicht: Schreib-Fähigkeiten werden nie mit bestaetigt:true aufgerufen. Keine automatische Wiederholung, keine erfundene Erfolgsmeldung, kein doppeltes Ausführen.
   Gesprächskontext kommt aus window.jvGespraech (über jvOrtGespraech, Phase 5); es gibt keine zweite Speicherung. Gemerkt wird hier nur: der Schalter, die letzten 20 Entscheidungen ohne Sätze (nur Arbeitsspeicher)
   und eine offene Rückfrage der Chef-KI (2 Minuten, ohne Satzinhalt außer den schon gewählten Parametern).

   window.jvChef.an() / aus() / istAn()            Schalter (nur diese Sitzung; Einstellungen > "Chef-KI"; der Merker localStorage jv_chef="1" schaltet beim Start ein)
   window.jvChef.behandle(text)                     Haken im Sprachweg (ortsuche.js, NACH allen festen Befehlen): true = übernommen. AUS -> false.
   window.jvChef.plane(text, opts)                  async: Plan erstellen und prüfen (führt nichts aus)
   window.jvChef.verarbeite(text, opts)             async: Plan, Prüfung, Ausführung (opts.entscheider, opts.trocken)
   window.jvChef.kiWeg(text)                        Haken im ECHTEN Sprachweg (voice.js, nach den festen Befehlen, vor dem normalen KI-Aufruf). AUS -> sofort false, KEIN Netz, KEIN KI-Aufruf.
                                                    EIN -> höchstens EINE zusätzliche KI-Anfrage (bestehender Weg /api/groq, Zeitlimit): Ist der Satz ein Ortswunsch, sucht die Chef-KI; sonst (kein Ortswunsch, ungültige Antwort,
                                                    Zeitüberschreitung, KI-Ausfall, Netzfehler) läuft GENAU EINMAL der bisherige Ablauf (sendToGroqSmart). Nie Schreibaktionen, nie eine andere Fähigkeit als ortssuche.
   window.jvChef.eingaenge()                        Diagnose (Einstellungen > Chef-KI): die letzten 10 Eingaben und WARUM die Chef-KI sie übernommen oder übersprungen hat (feste Statuscodes + deutscher Text).
                                                    Es werden NIE Sätze gespeichert (nur Nummer, Uhrzeit, Codes), nur im Arbeitsspeicher, nur wenn die Chef-KI EIN ist; löschbar. Keine zusätzliche KI-Anfrage.
   window.jvChef.befehlVorrang()                    Haken in voice.js: ein fester Befehl hat die Eingabe beantwortet (nur Vermerk, wenn EIN).
   window.jvChef.pruefePlan(plan)                   rein: { ok, plan, probleme[], fehlendeFaehigkeiten[] }
   window.jvChef.kiEntscheider(sende)               baut einen Entscheider, der `sende(nachrichten)` (Text zurück) benutzt
   window.jvChef.protokoll() / vergiss()            letzte 20 Entscheidungen / alles löschen
   ============================================================ */
(function () {
    'use strict';
    if (window.jvChef) return;

    var FREIGEGEBEN = Object.freeze(['ortssuche', 'websuche', 'wetter', 'produktsuche', 'foto_info', 'jarvis_info', 'fahrzeit', 'kontakte_lesen', 'gedaechtnis_lesen', 'abfahrt', 'schicht']);                      // echte Ausführung nur hier (alles lesend)
    var SCHREIB = Object.freeze(['erinnerung_erstellen', 'termin_erstellen', 'gedaechtnis_speichern', 'aufgabe_erstellen', 'termin_verschieben', 'kontakt_speichern']);   // nur Testmodus
    /* Paket B2a: nur im echten Sprachweg (KI-Weg, Chef-KI EIN) darf die Chef-KI diese Fähigkeiten wirklich ausführen. Verschieben, Löschen und alles, was eine Bestätigung braucht, bleibt gesperrt (kommt erst in B2b). */
    var B2A_NEU = Object.freeze(['termine_lesen', 'aufgaben_lesen', 'aufgabe_erstellen', 'erinnerung_erstellen', 'termin_erstellen', 'kontakt_speichern', 'gedaechtnis_speichern']);
    var B2A_SCHREIBT = Object.freeze(['aufgabe_erstellen', 'erinnerung_erstellen', 'termin_erstellen', 'kontakt_speichern', 'gedaechtnis_speichern']);
    var B2B_NAMEN = Object.freeze(['termin_verschieben']);   // Paket B2b-1: Verschieben nur nach ausdrücklicher Bestätigung (nie Löschen)
    var KI_PLAN = Object.freeze(['ortssuche', 'websuche', 'wetter', 'produktsuche', 'foto_info', 'jarvis_info', 'fahrzeit', 'kontakte_lesen', 'gedaechtnis_lesen', 'abfahrt', 'schicht'].concat(B2A_NEU, B2B_NAMEN));        // das darf der KI-Entscheider im Sprachweg planen
    var LESBAR = { termine_lesen: 'Termine ansehen', aufgaben_lesen: 'Aufgaben ansehen', aufgabe_erstellen: 'Aufgabe anlegen', erinnerung_erstellen: 'Erinnerung anlegen', termin_erstellen: 'Termin eintragen', kontakt_speichern: 'Kontakt speichern', gedaechtnis_speichern: 'Merken', termin_verschieben: 'Termin verschieben', ortssuche: 'Ortssuche', websuche: 'Internetsuche', wetter: 'Wetter' };
    var MAX_SCHRITTE = 3, MAX_PROTOKOLL = 20, FRAGE_MS = 2 * 60000, DOPPELT_MS = 4000, PAUSE_MS = 2 * 60000;
    var GESAMT_MS = 20000, THEMA_MS = 10 * 60000;                                            // Gesamtzeitbudget je Eingabe im Sprachweg; wie lange ein Thema für Anschlussfragen gilt
    var KI_FAEHIGKEITEN = Object.freeze(['ortssuche', 'websuche', 'wetter', 'produktsuche', 'foto_info', 'jarvis_info', 'fahrzeit', 'kontakte_lesen', 'gedaechtnis_lesen', 'abfahrt', 'schicht']);                 // das darf der KI-Entscheider planen
    var PLAN_KEYS = ['absicht', 'schritte', 'frage', 'hinweis', 'benoetigt'];
    var SCHRITT_KEYS = ['faehigkeit', 'params', 'aus'];
    var NAME_RX = /^[a-z][a-z0-9_]*$/;

    var istAn = false, nr = 0, protokollListe = [], offen = null, letzteAusfuehrung = {};
    var pause = null;   // Paket B2b-1: EINE offene Rückfrage/Bestätigung zu genau einem Schritt eines Plans (2 Minuten, nur Arbeitsspeicher)
    var entscheider = null;

    function R() { return window.jvRegistry || null; }
    function jetzt() { return Date.now(); }
    function say(msg) { try { if (typeof window.speak === 'function') window.speak(msg, typeof window.continueConversation === 'function' ? window.continueConversation : undefined); } catch (e) { } }
    function karten(liste) {
        try {
            if (typeof window.clearActionCards === 'function') window.clearActionCards();
            if (typeof window.showActionCards === 'function') window.showActionCards(liste);
        } catch (e) { }
    }
    function frageAnmelden(behalten) { if (behalten !== true) pause = null; try { if (window.jvFrage && typeof window.jvFrage.neu === 'function') window.jvFrage.neu('chef'); } catch (e) { } }
    function jungeFrageGehoertUns() { try { return !window.jvFrage || window.jvFrage.aktuell() === 'chef'; } catch (e) { return true; } }

    /* ---------- Plan prüfen ---------- */
    function einfach(v) {
        if (typeof v === 'string') return v.trim().slice(0, 200);
        if (typeof v === 'number' && isFinite(v)) return v;
        if (typeof v === 'boolean') return v;
        return undefined;
    }
    /* ---------- Kette (Phase 2): Ergebnisse eines lesenden Schrittes an einen späteren weitergeben ----------
       Ein Schritt darf "aus":{"ort":{"schritt":1,"feld":"orte"}} tragen: der Wert kommt NICHT vom Modell, sondern aus dem tatsächlichen, geprüften Ergebnis (daten) von Schritt 1.
       Erlaubt nur: lesende Schritte, Ziel-Angaben ort | suchbegriff | frage, Quellschritt davor, Feld aus der Rückgabe-Beschreibung der Registry. Der übernommene Wert wird wie jede Angabe geprüft (saubererBegriff / frageSauber). */
    var AUS_ZIELE = Object.freeze(['ort', 'suchbegriff', 'frage']);
    var LESEND = Object.freeze(['ortssuche', 'websuche', 'wetter', 'produktsuche', 'foto_info', 'jarvis_info', 'fahrzeit', 'kontakte_lesen', 'gedaechtnis_lesen', 'abfahrt', 'schicht']);
    function ausPruefen(aus, index, schritte) {   // undefined = keine; false = ungültig; sonst bereinigte Kopie
        if (aus === undefined) return undefined;
        if (!aus || typeof aus !== 'object' || Array.isArray(aus)) return false;
        var ks = Object.keys(aus), out = {}, reg = R();
        if (!ks.length || ks.length > 2 || index < 1) return false;
        var selbst = schritte[index] && schritte[index].faehigkeit;
        if (LESEND.indexOf(selbst) < 0) return false;
        for (var i = 0; i < ks.length; i++) {
            var k = ks[i], q = aus[k];
            if (AUS_ZIELE.indexOf(k) < 0 || !q || typeof q !== 'object' || Array.isArray(q)) return false;
            if (!(typeof q.schritt === 'number' && q.schritt >= 1 && q.schritt <= index && Math.floor(q.schritt) === q.schritt)) return false;
            var quelle = schritte[q.schritt - 1], qn = quelle && quelle.faehigkeit;
            if (LESEND.indexOf(qn) < 0 || typeof q.feld !== 'string') return false;
            var d = reg && reg.hole(qn), felder = d && d.rueckgabe && d.rueckgabe.felder;
            if (!Array.isArray(felder) || felder.indexOf(q.feld) < 0) return false;
            out[k] = { schritt: q.schritt, feld: q.feld };
        }
        return out;
    }
    function ausWert(v) {   // erster brauchbarer Text aus einem Ergebnisfeld (Text, Liste von Texten oder Objekten mit name/titel)
        if (Array.isArray(v)) v = v[0];
        if (v && typeof v === 'object') v = v.name != null ? v.name : v.titel;
        return typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
    }
    function loeseAus(schritt, ergebnisse) {   // -> { params } | { fehler }
        var pa = {}, k;
        for (k in schritt.params) pa[k] = schritt.params[k];
        var ks = Object.keys(schritt.aus || {});
        for (var i = 0; i < ks.length; i++) {
            var q = schritt.aus[ks[i]], quelle = ergebnisse[q.schritt - 1];
            if (!quelle || quelle.status !== 'SUCCESS' || !quelle.ausgefuehrt || !quelle.daten) return { fehler: 'Quelle ohne geprüftes Ergebnis' };
            var w = ausWert(quelle.daten[q.feld]);
            if (ks[i] === 'frage') { w = w.slice(0, 200); if (!frageSauber(w)) return { fehler: 'Wert nicht brauchbar' }; }
            else if (!saubererBegriff(w)) return { fehler: 'Wert nicht brauchbar' };
            pa[ks[i]] = w;
        }
        return { params: pa };
    }
    /* Fallback nur für lesende Schritte und nur auf eine lesende, freigegebene Fähigkeit aus der Registry-Beschreibung (fallbacks). Die Angaben kommen aus dem Wortlaut des Nutzers. */
    function fallbackFuer(name, text, schonDa) {
        var reg = R(), d = reg && reg.hole(name);
        if (!d || LESEND.indexOf(name) < 0 || !Array.isArray(d.fallbacks)) return null;
        for (var i = 0; i < d.fallbacks.length; i++) {
            var f = d.fallbacks[i];
            if (f === 'websuche' && LESEND.indexOf(f) >= 0 && FREIGEGEBEN.indexOf(f) >= 0 && schonDa.indexOf(f) < 0 && frageSauber(String(text || '').slice(0, 200)))
                return { faehigkeit: 'websuche', params: { frage: String(text).slice(0, 200) } };
        }
        return null;
    }

    function pruefePlan(roh) {
        var probleme = [], plan = { absicht: '', schritte: [], frage: '', hinweis: '', benoetigt: [] }, fehlendeF = [];
        var p = roh;
        if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { return { ok: false, plan: null, probleme: ['Plan ist kein gültiges JSON'], fehlendeFaehigkeiten: [] }; } }
        if (!p || typeof p !== 'object' || Array.isArray(p)) return { ok: false, plan: null, probleme: ['Plan ist kein Objekt'], fehlendeFaehigkeiten: [] };
        Object.keys(p).forEach(function (k) { if (PLAN_KEYS.indexOf(k) < 0) probleme.push('Unbekanntes Feld verworfen: ' + k); });
        if (typeof p.absicht === 'string') plan.absicht = p.absicht.trim().slice(0, 60).replace(/[^a-z0-9_äöüß ]/gi, '');
        if (typeof p.frage === 'string') plan.frage = p.frage.trim().slice(0, 300);
        if (typeof p.hinweis === 'string') plan.hinweis = p.hinweis.trim().slice(0, 400);
        var reg = R();
        if (Array.isArray(p.benoetigt)) {
            p.benoetigt.slice(0, 5).forEach(function (n) {
                if (typeof n !== 'string' || !NAME_RX.test(n)) return;
                plan.benoetigt.push(n);
                if (!reg || !reg.hole(n)) fehlendeF.push(n);
            });
        }
        if (p.schritte === undefined) p.schritte = [];
        if (!Array.isArray(p.schritte)) { probleme.push('schritte ist keine Liste'); return { ok: false, plan: null, probleme: probleme, fehlendeFaehigkeiten: fehlendeF }; }
        if (p.schritte.length > MAX_SCHRITTE) { probleme.push('Zu viele Schritte (höchstens ' + MAX_SCHRITTE + ')'); return { ok: false, plan: null, probleme: probleme, fehlendeFaehigkeiten: fehlendeF }; }
        for (var i = 0; i < p.schritte.length; i++) {
            var s = p.schritte[i];
            if (!s || typeof s !== 'object' || Array.isArray(s)) { probleme.push('Schritt ' + (i + 1) + ' ist kein Objekt'); return { ok: false, plan: null, probleme: probleme, fehlendeFaehigkeiten: fehlendeF }; }
            Object.keys(s).forEach(function (k) { if (SCHRITT_KEYS.indexOf(k) < 0) probleme.push('Schritt ' + (i + 1) + ': unbekanntes Feld verworfen: ' + k); });
            if (typeof s.faehigkeit !== 'string' || !NAME_RX.test(s.faehigkeit)) { probleme.push('Schritt ' + (i + 1) + ': Fähigkeit fehlt oder ist ungültig'); return { ok: false, plan: null, probleme: probleme, fehlendeFaehigkeiten: fehlendeF }; }
            var pa = {};
            if (s.params !== undefined && (s.params === null || typeof s.params !== 'object' || Array.isArray(s.params))) { probleme.push('Schritt ' + (i + 1) + ': params ist kein Objekt'); return { ok: false, plan: null, probleme: probleme, fehlendeFaehigkeiten: fehlendeF }; }
            var ks = Object.keys(s.params || {});
            if (ks.length > 8) { probleme.push('Schritt ' + (i + 1) + ': zu viele Angaben'); return { ok: false, plan: null, probleme: probleme, fehlendeFaehigkeiten: fehlendeF }; }
            ks.forEach(function (k) {
                var v = einfach(s.params[k]);
                if (v === undefined) probleme.push('Schritt ' + (i + 1) + ': Angabe "' + k + '" verworfen (nur Text, Zahl, Ja/Nein)'); else if (v !== '') pa[k] = v;
            });
            if (!reg || !reg.hole(s.faehigkeit)) { if (fehlendeF.indexOf(s.faehigkeit) < 0) fehlendeF.push(s.faehigkeit); }
            var st2 = { faehigkeit: s.faehigkeit, params: pa };
            var aus = ausPruefen(s.aus, i, p.schritte);   // Kette: Angaben aus einem früheren (lesenden) Schritt übernehmen; ungültig = der ganze Plan ist ungültig
            if (aus === false) { probleme.push('Schritt ' + (i + 1) + ': ungültige Übernahme (aus)'); return { ok: false, plan: null, probleme: probleme, fehlendeFaehigkeiten: fehlendeF }; }
            if (aus) st2.aus = aus;
            plan.schritte.push(st2);
        }
        return { ok: true, plan: plan, probleme: probleme, fehlendeFaehigkeiten: fehlendeF };
    }

    /* ---------- Lokaler Entscheider (kostenlos, ohne Netz) ---------- */
    var ESSEN = [
        [/italiener|pizz|pasta/i, 'Italiener'], [/grieche|griechisch/i, 'Grieche'], [/chines/i, 'Chinese'], [/\binder\b|indisch/i, 'Inder'],
        [/d[öo]ner|t[üu]rk/i, 'Döner'], [/burger/i, 'Burger'], [/sushi/i, 'Sushi'], [/caf[ée]|kaffee/i, 'Café'], [/eis(?:dielle|\s*essen)?\b/i, 'Eisdiele'],
        [/b[äa]cker|br[öo]tchen|fr[üu]hst[üu]ck/i, 'Bäckerei'], [/biergarten/i, 'Biergarten'], [/imbiss|currywurst|pommes/i, 'Imbiss'],
        [/hunger|essen gehen|zum essen|restaurant|lokal|gasthaus|mittagessen|abendessen|bistro/i, 'Restaurant']
    ];
    var RX_ORTSWUNSCH = /\b(hunger|durst|essen gehen|zum essen|restaurant|italiener|grieche|griechisch|chines|inder|indisch|d[öo]ner|burger|sushi|pizz|caf[ée]|kaffee|eisdiele|b[äa]cker|biergarten|imbiss|bistro|lokal|gasthaus)\w*/i;
    var RX_SUCHE = /\b(such|suche|zeig|gibt es|gibts|wo (?:kann|gibt|finde)|in der n[äa]he|hier|habe hunger|hab hunger|will|m[öo]chte|lust auf|empfiehl)/i;
    var RX_UNBESTIMMT = /\b(such(?:e)? (?:mir )?(?:was|etwas|irgendwas|einen ort|ein ziel)|etwas sch[öo]nes|was sch[öo]nes)\b/i;
    var RX_PREIS = /g[üu]nstig|billig|preiswert|teuer|g[üu]nstiger/i;
    var RX_UNTERNEHMEN = /\b(unternehmen|ausflug|wochenende|etwas machen|was machen|was unternehmen)\b/i;
    var RX_WOCHENTAG = /\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|wochenende|morgen|heute)\b/i;
    var RX_FRAGEWORT = /^(wie|was|wer|wann|wo|woher|wohin|warum|wieso|weshalb|welche[rsmn]?|kannst|kann|ist|sind|hast|hat|gibt|ruf|schalt\w*|stell\w*|mach\w*|zeig\w*|such\w*|erinner\w*|sag\w*)\b/i;
    var RX_VERSCHIEBEN = /\b(verschieb\w*|verleg\w*|umbuch\w*|umleg\w*|vorverleg\w*|nachverleg\w*)\b/i;   // B2a: Verschieben ist bei EINGESCHALTETER Chef-KI gesperrt (kommt mit Bestätigung in B2b), auch kein Rückfall auf den alten KI-Weg
    var TEXT_VERSCHIEBEN = 'Ich konnte nicht sicher erkennen, welchen Termin du wohin verschieben möchtest. Ich habe nichts geändert. Sag es bitte noch einmal, zum Beispiel: Verschiebe den Zahnarzt auf Freitag um 15 Uhr.';
    /* Mehrteilige Anfragen: mindestens zwei AUSDRÜCKLICH verschiedene Aktionen, verbunden durch "und/dann/…". Nur dann fragt voice.js die Chef-KI VOR den festen Befehlen
       (sonst fängt ein fester Befehl wie "Ortssuche" oder "was steht an" den ganzen Satz ab und der Rest geht verloren). Einfache Sätze bleiben beim bisherigen Weg. */
    var MEHR_GRUPPEN = [
        /\btermin\w*|\b(?:in|im)\s+(?:den\s+|meinen\s+|meinem\s+)?kalender\b|\bkalender\s+ein\b/,                                   // Termin eintragen / Termine
        /\berinner\w*/,                                                                                                            // Erinnerung
        /\baufgabe\w*|\bto-?do\w*|\baufgabenliste\w*/,                                                                           // Aufgabe
        /\bkontakt\w*|\badresse\b.*\bspeicher\w*|\bspeicher\w*.*\badresse\b/,                                                       // Kontakt / Adresse speichern
        /\bmerk(?:e)?\s+dir\b/,                                                                                                  // Gedächtnis
        /\b(?:was|welche)\b.*\b(?:steht|stehen|habe ich|hab ich)\b.*\b(?:kalender|termine?|aufgaben)\b|\b(?:sag|zeig|lies)\w*\b.*\b(?:kalender|termine|aufgaben)\b|\bvorles\w*/   // Kalender/Aufgaben vorlesen
    ];
    var RX_VERBINDER = /\b(?:und|dann|danach|außerdem|ausserdem|sowie|gleichzeitig|zusätzlich|zusaetzlich)\b/;
    var MEHR_NAMEN = ['Termin', 'Erinnerung', 'Aufgabe', 'Kontakt oder Adresse', 'Merken', 'Vorlesen'];
    var MEHR_FAEHIG = [['termin_erstellen', 'termine_lesen', 'termin_verschieben'], ['erinnerung_erstellen'], ['aufgabe_erstellen', 'aufgaben_lesen'], ['kontakt_speichern'], ['gedaechtnis_speichern'], ['termine_lesen', 'aufgaben_lesen']];   // welche Schritte eine verlangte Aktion erfüllen
    function mehrGruppen(text) {   // Nummern der ausdrücklich verlangten, verschiedenen Aktionen (leer = nicht mehrteilig)
        if (typeof text !== 'string') return [];
        var t = text.toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 240 || t.split(' ').length > 30 || !RX_VERBINDER.test(t)) return [];
        var t0 = t.replace(/\ban\s+(?:den|meinen|die|das|unseren|diesen)\s+termin\w*/g, ' ');   // "erinnere mich an den Termin" ist KEIN Termin eintragen
        var g = []; MEHR_GRUPPEN.forEach(function (rx, i) { if (rx.test(i === 0 ? t0 : t)) g.push(i); });
        return g.length >= 2 ? g : [];
    }
    function mehrteilig(text) { return istAn && mehrGruppen(text).length >= 2; }
    var RX_B2A = /\b(erinner\w*|termin\w*|merk(?:e)? dir|speicher\w*|trag(?:e)? \w+ ein|aufgabe\w*|to-?do\w*|kontakt\w*|notier\w*|adresse\w*|kalender)\b/i;   // B2a: Wünsche, die die Chef-KI jetzt selbst ausführen darf
    var RX_SCHREIB = /\b(erinner\w*|termin\w*|merk(?:e)? dir|speicher\w*|trag(?:e)? \w+ ein)\b/i;

    var RX_MEHRWUNSCH = /\b(wetter|regen\w*|regenschirm|temperatur|nachrichten|neuigkeiten|internet|google|recherchier\w*|fernseh\w*|kinoprogramm|spielstand|ergebnis\w*)\b/i;
    function ortAus(text) {
        if (/in der n[äa]he|hier in der|bei mir|um mich/i.test(text)) return '';
        var m = String(text).match(/\bin\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)?)/);
        return m ? m[1] : '';
    }
    function begriffAus(text) { for (var i = 0; i < ESSEN.length; i++) if (ESSEN[i][0].test(text)) return ESSEN[i][1]; return ''; }
    function hatGemerkt() { try { var g = window.jvGespraech; return !!g && g.status().listen.some(function (x) { return x && x.art !== 'produkte'; }); } catch (e) { return false; } }   // Produktlisten (Produktkarten) sind keine Orte: Preisfragen dazu beantwortet js/produktkarten.js

    function lokalEntscheiden(text) {
        var t = String(text == null ? '' : text);
        if (!t.trim()) return { absicht: 'nichts', schritte: [] };
        // Arbeitsweg ist ein bekanntes Ziel: bei reinen Verkehrsfragen nicht erneut nachfragen.
        // Die vorhandene Fahrzeit-Fähigkeit prüft Route und Verkehr; kein neues Verkehrssystem.
        if (/\b(?:verkehr\w*|stau\w*|sperrung\w*)\b/i.test(t) &&
            /\b(?:weg\s+zur\s+arbeit|arbeitsweg|fahrt\s+zur\s+arbeit|zur\s+arbeit)\b/i.test(t) &&
            !/\b(?:und|außerdem|ausserdem)\b/i.test(t)) {
            var arbeit = (typeof workAddress === 'string' ? workAddress : '').trim();
            if (arbeit) return { absicht: 'verkehr_arbeitsweg', schritte: [{ faehigkeit: 'fahrzeit', params: { ziel: arbeit } }] };
        }
        if (RX_SCHREIB.test(t)) return { absicht: 'schreiben', schritte: [] };   // Erinnerung/Termin/Gedächtnis: bleibt beim bisherigen Weg
        if (RX_PREIS.test(t) && hatGemerkt()) return { absicht: 'preisfrage', schritte: [], hinweis: 'Preise kenne ich nicht, deshalb kann ich die Treffer nicht nach Preis ordnen. Ich kann stattdessen nach etwas anderem suchen, zum Beispiel einem Imbiss oder einer Bäckerei. Sag einfach, wonach.' };
        if (RX_UNTERNEHMEN.test(t) && RX_WOCHENTAG.test(t)) {
            return {
                absicht: 'unternehmen', benoetigt: ['kalender_lesen', 'wetter_lesen', 'ausflug_vorschlagen'],
                schritte: [{ faehigkeit: 'ortssuche', params: {} }],
                frage: 'Wonach soll ich in der Nähe suchen, zum Beispiel ein Restaurant, ein Café oder eine Eisdiele?'
            };
        }
        var begriff = begriffAus(t);
        if (begriff && (RX_ORTSWUNSCH.test(t) && RX_SUCHE.test(t))) {
            var ort = ortAus(t), pa = { suchbegriff: begriff };
            if (ort) pa.ort = ort;
            return { absicht: 'ortssuche', schritte: [{ faehigkeit: 'ortssuche', params: pa }] };
        }
        if (RX_UNBESTIMMT.test(t)) {
            return { absicht: 'ortssuche', schritte: [{ faehigkeit: 'ortssuche', params: {} }], frage: 'Wonach soll ich suchen, zum Beispiel ein Restaurant, ein Café oder eine Eisdiele?' };
        }
        return { absicht: 'nichts', schritte: [] };
    }
    entscheider = function (text) { return lokalEntscheiden(text); };

    /* ---------- KI-Entscheider (nur mit von außen gegebener Sende-Funktion) ---------- */
    function b2aRegeln(faehig) {
        if (!faehig.some(function (f) { return B2A_NEU.indexOf(f.name) >= 0 || B2B_NAMEN.indexOf(f.name) >= 0; })) return '';
        var d = new Date(Date.now()), tage = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
        function z2(n) { return ('0' + n).slice(-2); }
        return ' Kalender, Erinnerungen, Aufgaben, Kontakte und Gedächtnis: Heute ist ' + tage[d.getDay()] + ', ' + d.getFullYear() + '-' + z2(d.getMonth() + 1) + '-' + z2(d.getDate()) + ', ' + z2(d.getHours()) + ':' + z2(d.getMinutes()) + ' Uhr. Schreibende Fähigkeiten (termin_erstellen, erinnerung_erstellen, aufgabe_erstellen, kontakt_speichern, gedaechtnis_speichern) nur, wenn der Nutzer die Aktion eindeutig verlangt und alle nötigen Angaben genannt hat. Zeiten immer als ISO-Zeit JJJJ-MM-TTTHH:MM:00 in der Zukunft. Fehlt eine Angabe, setze nur "frage" und keine Schritte. Genau ein Schritt je Wunsch, dieselbe Aktion nie zweimal; ein späterer Schritt darf von einem früheren abhängen (zum Beispiel erst ortssuche, dann kontakt_speichern). termin_verschieben, wenn der Nutzer einen bestehenden Termin auf eine andere Zeit legen will, auch ohne das Wort verschieben (zum Beispiel \"passt mir nicht mehr\", \"auf morgen legen\", \"später machen\", \"eine Stunde früher\"): params.suche ist ein Stichwort aus dem Titel des Termins, aber NUR wenn der Nutzer den Termin nennt (sonst lass params leer {}), optional params.tag (der BISHERIGE Tag: heute, morgen, uebermorgen oder JJJJ-MM-TT); die neue Zeit gibst du NIE an, sie wird aus dem Satz gelesen. Ändern, Löschen und Wiederholungen planst du NICHT: antworte dann {"schritte":[]}.';
    }
    function kiEntscheider(sende, nur, kontext) {
        return async function (text) {
            if (typeof sende !== 'function') throw new Error('Keine Sende-Funktion');
            var reg = R();
            var faehig = reg ? reg.beschreibe().filter(function (d) { return !Array.isArray(nur) || nur.indexOf(d.name) >= 0; }).map(function (d) { return { name: d.name, beschreibung: d.beschreibung, pflicht: d.pflicht.map(function (x) { return x.name; }), optional: d.optional.map(function (x) { return x.name; }) }; }) : [];
            var nachrichten = [
                { role: 'system', content: 'Du planst für einen Sprachassistenten. Antworte NUR mit JSON: {"absicht":"...","schritte":[{"faehigkeit":"name","params":{}}],"frage":"...","hinweis":"...","benoetigt":["name"]}. Nutze nur diese Fähigkeiten: ' + JSON.stringify(faehig) + '. Regeln: höchstens 3 Schritte, davon höchstens 1 websuche, 2 ortssuche, 1 wetter und 2 produktsuche. wetter gilt für den Standort des Nutzers (params.tag: heute, morgen oder uebermorgen); wird ein bestimmter Ort genannt, setze params.ort auf den Ortsnamen (nur der Name). Mit "dort", "da" oder "in dieser Stadt" ist nur dann ein Ort gemeint, wenn er im Kontext steht; steht dort keiner, setze nur "frage" ("Welchen Ort meinst du?") und keine Schritte. websuche nur für aktuelle Auskünfte aus dem Internet (Nachrichten, Ergebnisse, Fernsehprogramm, Öffnungszeiten, Preise) mit der Frage des Nutzers im Wortlaut als params.frage. ortssuche für Orte, Läden und Lokale in der Nähe oder in einem genannten Ort. produktsuche für Preise, Händler und Kauflinks zu einem Produkt im Internet (je Produkt ein Schritt, höchstens 2; params.suchbegriff nur mit Namen, die der Nutzer genannt hat; fehlt der Produktname, setze nur "frage"). Bei Produkten nie selbst Preise oder Händler nennen. fahrzeit für Fahrzeit, Entfernung, Route und die aktuelle Verkehrslage mit dem Auto: params.ziel ist genau das genannte Ziel (zum Beispiel "Hamburger Hauptbahnhof", nicht nur "Hamburg"); params.von nur, wenn der Nutzer einen Startort nennt; fehlt das Ziel, setze nur "frage" ("Wohin möchtest du fahren?"). Fahrten zu einer gespeicherten Person oder Stelle (\"zu meiner Mutter\", \"zu meinem Zahnarzt\") planst du direkt als fahrzeit mit ziel = die Person wie genannt: fahrzeit schlägt die Adresse selbst nach (Kontakte vor der Ortssuche). kontakte_lesen (params.name = Person oder Stelle wie genannt) nur für Fragen nach der gespeicherten Adresse (\"Wo wohnt meine Mutter?\"); gedaechtnis_lesen (params.suche = Stichwort) nur für Fragen, was sich Jarvis gemerkt hat. abfahrt, wenn der Nutzer zu einer Uhrzeit irgendwo sein muss und wissen will, wann er losfahren muss (\"Ich muss morgen um 13 Uhr bei meiner Mutter sein. Wann muss ich losfahren?\"): params.ziel wie genannt, params.ankunft als HH:MM (24 Stunden), params.tag nur bei morgen oder übermorgen (sonst weglassen); ist die Uhrzeit unklar, setze nur \"frage\" und rate nie. schicht für Fragen zum eigenen Schichtplan (arbeiten oder frei, welche Schicht, Beginn, Feierabend, geplante Abfahrt zur Arbeit): params.tag nur heute, morgen, uebermorgen, ein Wochentag wie samstag oder ein Datum als JJJJ-MM-TT, sonst weglassen; Schichtzeiten NIE selbst nennen oder schätzen, dafür gibt es nur schicht. Fahrzeiten, Entfernungen, Staus und Verkehrsmeldungen NIE mit websuche beantworten und nie selbst schätzen: dafür gibt es nur fahrzeit. Entscheide so: Allgemeine Wissens- und Erklärfragen (\"Warum ist der Himmel blau?\"), Smalltalk und Rechenfragen beantwortest du NICHT mit Werkzeugen: {\"schritte\":[]}. Aktuelles (Nachrichten, heute/gestern, Ergebnisse, Preise, Öffnungszeiten, Neues von einer Firma) braucht websuche, auch wenn der Nutzer nicht \"Internet\" sagt. Fragt der Nutzer nach dir selbst (\"du\", \"dich\", \"deine Funktionen\", \"wie könntest du dich verbessern\"), ist Jarvis gemeint: plane jarvis_info (ohne params) und danach bei Bedarf eine websuche mit einer eigenen Frage dazu, was man an einem Sprachassistenten mit diesen Fähigkeiten verbessern kann. Eine Frage mit mehreren Teilen (Wetter UND Kalender) plane der Reihe nach mit je einem Werkzeug. Termine und Kalender nur mit termine_lesen; schreibe nur, wenn der Nutzer es ausdrücklich verlangt. foto_info (ohne params) liefert die Einordnung des zuletzt gemachten Fotos; nur nutzen, wenn der Nutzer das Foto meint, und danach mit "aus" weiterverwenden, zum Beispiel produktsuche mit "aus":{"suchbegriff":{"schritt":1,"feld":"produkt"}} oder websuche mit "aus":{"frage":{"schritt":1,"feld":"beschreibung"}}. Sind mehrere Wünsche in einem Satz, plane sie der Reihe nach. Ein späterer lesender Schritt darf Angaben aus einem früheren übernehmen: "aus":{"ort":{"schritt":1,"feld":"orte"}} (nur ort, suchbegriff oder frage; Felder: orte, antwort, nachricht, produkte, produkt, beschreibung). Ist der Wunsch zu unklar, setze nur "frage" (eine kurze Rückfrage) und keine Schritte. Reines Gespräch, Smalltalk, Wissensfragen und alles andere: antworte {"schritte":[]}. Erfinde keine Preise, Öffnungszeiten, Verfügbarkeiten oder Fahrzeiten.' + b2aRegeln(faehig) }
            ];
            if (typeof kontext === 'string' && kontext) nachrichten.push({ role: 'system', content: kontext });
            nachrichten.push({ role: 'user', content: String(text) });
            var antwort = await sende(nachrichten);
            return antwort;
        };
    }

    /* ---------- Protokoll (ohne Sätze) ---------- */
    function protokolliere(weg, faehigkeiten, status) {
        nr++;
        protokollListe.push({ nr: nr, zeit: jetzt(), weg: weg, faehigkeiten: faehigkeiten.slice(0, 3), status: status });
        if (protokollListe.length > MAX_PROTOKOLL) protokollListe.shift();
    }

    /* ---------- Eingangsdiagnose (nur Codes, keine Sätze) ---------- */
    var MAX_EINGAENGE = 10, MAX_CODES = 8, eingaenge = [], eingangNr = 0, vomChefBehandelt = 0;
    var GRUND = Object.freeze({
        befehl_vorrang: 'Bestehender Befehl hatte Vorrang',
        lokal_uebernommen: 'Chef-KI hat übernommen (lokales Muster)',
        rueckfrage_antwort: 'Antwort auf eine Rückfrage der Chef-KI',
        vorfilter_laenge: 'Vorfilter: übersprungen (Satz zu kurz oder zu lang)',
        vorfilter_schreiben: 'Vorfilter: übersprungen (Schreibwunsch wie Erinnerung oder Termin)',
        vorfilter_stichwort: 'Vorfilter: übersprungen (kein Hinweis auf einen Ortswunsch)',
        vorfilter_doppelt: 'Vorfilter: übersprungen (derselbe Satz eben schon)',
        ki_aufgerufen: 'KI-Entscheider aufgerufen',
        abfahrtsfrage: 'Abfahrtsfrage: der vorhandene Abfahrtsweg antwortet (Werkzeug abfahrt nicht verfügbar)',
        abfahrt_alter_weg: 'Abfahrtsfrage: Plan nur mit Fahrdauer verworfen (statt abfahrt), vorhandener Abfahrtsweg',
        ki_kein_ortswunsch: 'KI: nichts zu koordinieren (normaler Ablauf)',
        ki_nicht_erlaubt: 'KI-Plan nicht erlaubt (nur Orte, Internet und Wetter, mit Obergrenzen)',
        ki_ungueltig: 'KI-Antwort ungültig',
        ki_zeitlimit: 'Zeitlimit der KI',
        ki_fehler: 'Fehler bei der KI-Anfrage',
        ki_ueberholt: 'Durch einen neueren Satz überholt',
        ausgeschaltet: 'Chef-KI inzwischen ausgeschaltet',
        ortssuche_ausgefuehrt: 'Gültige Ortssuche ausgeführt',
        produktsuche_ausgefuehrt: 'Gültige Produktsuche ausgeführt',
        keine_treffer: 'Ortssuche ohne Treffer (Nachfrage nach dem Ort)',
        rueckfrage: 'Rückfrage gestellt (Angabe fehlt)',
        fehler_suche: 'Fehler bei der Ortssuche',
        faehigkeit_fehlt: 'Fähigkeit nicht vorhanden',
        nur_geplant: 'Nur geplant (Testmodus), nichts ausgeführt',
        doppelt_verhindert: 'Doppelte Ausführung verhindert',
        hinweis: 'Hinweis gegeben, nichts ausgeführt',
        abgebrochen: 'Rückfrage abgebrochen',
        rueckfall: 'Rückfall auf den bisherigen Ablauf',
        alte_suche_uebergabe: 'Alte Orte-Suche ohne Ergebnis, Ortssuche hat übernommen',
        ki_nachfrage: 'Rückfrage der Chef-KI gestellt (Wunsch unklar)',
        nachfrage_antwort: 'Antwort auf eine Rückfrage der Chef-KI (KI-Weg)',
        anschluss: 'Anschlussfrage zum letzten Thema',
        websuche_ausgefuehrt: 'Internetsuche ausgeführt',
        wetter_ausgefuehrt: 'Wetter gesagt (aus den Wetterdaten)',
        mehrere_schritte: 'Mehrere Schritte, eine zusammengefasste Antwort',
        schritt_fehler: 'Ein Schritt hat nicht geklappt',
        budget_ueberschritten: 'Zeitbudget überschritten',
        ort_unklar: 'Ort unklar ("dort"/"da"): Rückfrage statt eigener Standort',
        auftrag_unvollstaendig: 'Auftrag nicht vollständig erkannt: vor dem Schreiben angehalten, nichts ausgeführt',
        verschieben_gesperrt: 'Verschieben angehalten: nichts geändert',
        verschieben_unklar: 'Verschieben: Wunsch nicht sicher erkannt, nichts geändert, kein Rückfall auf den alten Weg',
        pause_frage: 'Rückfrage beim Verschieben gestellt (Angabe fehlt oder mehrere Termine)',
        bestaetigung_gefragt: 'Bestätigung eingeholt: nichts geändert, bis du Ja sagst',
        bestaetigung_ja: 'Bestätigung Ja: genau diese eine Aktion ausgeführt',
        bestaetigung_nein: 'Bestätigung Nein: nichts geändert',
        bestaetigung_unklar: 'Antwort unklar: einmal nachgefragt',
        bestaetigung_abgelaufen: 'Bestätigung abgelaufen (2 Minuten): nichts geändert',
        bestaetigung_ersetzt: 'Neuer Befehl hat die offene Rückfrage beendet',
        ort_bezug: '"dort"/"da" auf den zuletzt genannten Ort bezogen',
        schreiben_ausgefuehrt: 'Schreib-/Lese-Aktion ausgeführt (Termin, Erinnerung, Aufgabe, Kontakt, Gedächtnis)',
        schreiben_gestoppt: 'Mehrschritt-Anfrage angehalten (Rückfrage, Fehler oder Bestätigung nötig)',
        schreiben_bestaetigung: 'Bestätigung nötig, aber nicht möglich: nichts geändert'
    });
    function neuerEingang(code) {
        eingangNr++;
        var e = { nr: eingangNr, zeit: jetzt(), codes: [] };
        if (code) e.codes.push(code);
        eingaenge.push(e); if (eingaenge.length > MAX_EINGAENGE) eingaenge.shift();
        zeichne();
        return e;
    }
    function vermerke(e, code) { if (!e || e.codes.length >= MAX_CODES || !GRUND[code]) return; e.codes.push(code); zeichne(); }
    /* Messwerte je Eingabe: nur Zahlen (Dauer in ms, Anzahl KI-Anfragen), nie Text. */
    function setzeMessung(e, ms, ki) { if (!e) return; e.ms = Math.max(0, Math.round(ms)); e.ki = ki; zeichne(); }
    function eingaengeKopie() { return eingaenge.map(function (e) { var k = { nr: e.nr, zeit: e.zeit, codes: e.codes.slice(), text: e.codes.map(function (c) { return GRUND[c] || c; }) }; if (typeof e.ms === 'number') { k.ms = e.ms; k.ki = e.ki; } return k; }); }
    /* Haken in voice.js: ein fester Befehl hat die Eingabe beantwortet. Hat die Chef-KI sie selbst übernommen (lokales Muster), steht das schon im Eintrag. */
    function befehlVorrang() {
        if (!istAn) return false;
        try {
            if (vomChefBehandelt && jetzt() - vomChefBehandelt < 2000) { vomChefBehandelt = 0; return true; }
            vomChefBehandelt = 0; neuerEingang('befehl_vorrang');
        } catch (e) { }
        return true;
    }

    /* Haken in nearbymore.js: die alte Orte-Suche fand nichts (Kartendaten nicht erreichbar / kein Treffer) und hat die Anfrage an die Ortssuche übergeben.
       Vermerkt wird nur der Statuscode, am jüngsten Eintrag "Befehl hatte Vorrang" (sonst neuer Eintrag). */
    function uebergabeAlteSuche() {
        if (!istAn) return false;
        try {
            var e = null;
            for (var i = eingaenge.length - 1; i >= 0; i--) { if (eingaenge[i].codes.indexOf('befehl_vorrang') >= 0 && eingaenge[i].codes.indexOf('alte_suche_uebergabe') < 0) { e = eingaenge[i]; break; } }
            if (e) vermerke(e, 'alte_suche_uebergabe'); else neuerEingang('alte_suche_uebergabe');
        } catch (x) { }
        return true;
    }

    /* ---------- Ausführung ---------- */
    function frageNach(parameter) {
        if (parameter === 'suchbegriff') return 'Wonach soll ich suchen, zum Beispiel ein Restaurant, ein Café oder eine Eisdiele?';
        if (parameter === 'ort') return 'In welchem Ort soll ich suchen?';
        if (parameter === 'ziel') return 'Wohin möchtest du fahren?';
        if (parameter === 'text') return 'Was genau soll ich notieren?';
        if (parameter === 'zeit') return 'Für wann soll das sein?';
        if (parameter === 'schluessel') return 'Unter welchem Stichwort soll ich mir das merken?';
        if (parameter === 'name') return 'Wie heißt der Kontakt?';
        return 'Mir fehlt noch eine Angabe: ' + parameter + '. Kannst du die nennen?';
    }

    async function fuehreSchrittAus(schritt, text, opts) {
        var reg = R(), name = schritt.faehigkeit;
        var erg = { faehigkeit: name, status: 'CAPABILITY_MISSING', ausgefuehrt: false, trocken: false, nachricht: '', fehlend: [], nurGeplant: false, grund: '' };
        if (!reg || !reg.hole(name)) { erg.nachricht = 'Dafür habe ich noch keine Fähigkeit („' + name.replace(/_/g, ' ') + '“), deshalb tue ich nichts.'; erg.grund = 'nicht registriert'; return erg; }
        var d = reg.hole(name);
        var pp = reg.pruefeParameter(name, schritt.params);
        if (pp.status !== 'SUCCESS') {
            erg.status = 'NEEDS_INFORMATION'; erg.fehlend = pp.fehlend.concat(pp.ungueltig); erg.grund = 'Angabe fehlt';
            erg.nachricht = frageNach(erg.fehlend[0]); return erg;
        }
        var b2a = opts.schreiben === true && B2A_NEU.indexOf(name) >= 0;   // nur der KI-Sprachweg setzt das (B2a)
        var b2b = opts.schreiben === true && opts.bestaetigt === true && B2B_NAMEN.indexOf(name) >= 0;   // B2b-1: Verschieben wirklich nur, wenn der Nutzer GENAU diese Änderung bestätigt hat
        var darfEcht = istAn && ((FREIGEGEBEN.indexOf(name) >= 0 && SCHREIB.indexOf(name) < 0) || b2a || b2b) && (!(d.bestaetigung && d.bestaetigung.noetig) || b2b) && opts.trocken !== true;
        var trocken = !darfEcht;
        var schluessel = name + '|' + JSON.stringify(schritt.params);
        if (darfEcht) {
            var vor = letzteAusfuehrung[schluessel];
            if (vor && jetzt() - vor < DOPPELT_MS) { erg.status = 'TOOL_FAILED'; erg.grund = 'doppelt'; erg.nachricht = ''; return erg; }
            letzteAusfuehrung[schluessel] = jetzt();
        }
        var r;
        try { r = await reg.fuehreAus(name, schritt.params, { trocken: trocken, bestaetigt: b2b ? true : undefined, frage: typeof opts.frage === 'string' ? opts.frage : undefined, kontext: { text: String(text || ''), bestaetigt: opts.bestaetigt === true } }); }   // bestaetigt nur nach der ausdrücklichen Zustimmung des Nutzers zu genau diesem Schritt
        catch (e) { erg.status = 'TOOL_FAILED'; erg.grund = 'Ausnahme'; erg.nachricht = 'Dabei ist technisch etwas schiefgelaufen.'; return erg; }
        erg.status = r.status; erg.ausgefuehrt = !!r.ausgefuehrt; erg.trocken = !!r.trocken; erg.nachricht = r.nachricht || ''; erg.fehlend = r.fehlend || []; erg.grund = r.grund || '';
        erg.nurGeplant = trocken && r.status === 'SUCCESS';
        erg.daten = r.daten;
        return erg;
    }

    /* Plan -> Ausführung -> Ergebnis. Spricht NICHT selbst; verarbeite/behandle geben das Ergebnis aus. */
    async function fuehrePlanAus(plan, text, opts) {
        var res = { status: 'SUCCESS', schritte: [], gesagt: '', karten: null, frage: '', offen: null };
        if (plan.benoetigt.length) {
            var reg = R(), fehlt = plan.benoetigt.filter(function (n) { return !reg || !reg.hole(n); });
            if (fehlt.length) res.fehlendeFaehigkeiten = fehlt;
        }
        for (var i = 0; i < plan.schritte.length; i++) {
            var s = plan.schritte[i];
            var e = await fuehreSchrittAus(s, text, opts);
            res.schritte.push(e);
            if (e.status === 'NEEDS_INFORMATION') { res.status = 'NEEDS_INFORMATION'; res.frage = plan.frage || e.nachricht; res.offen = { schritt: i, parameter: e.fehlend[0], plan: plan, text: text }; break; }
            if (e.status === 'NO_RESULTS' && e.faehigkeit === 'ortssuche') { res.status = 'NO_RESULTS'; res.frage = 'Dazu habe ich nichts gefunden. In welchem Ort soll ich suchen?'; res.offen = { schritt: i, parameter: 'ort', plan: plan, text: text }; break; }
            if (e.status === 'CAPABILITY_MISSING') { res.status = 'CAPABILITY_MISSING'; res.gesagt = e.nachricht; break; }
            if (e.status !== 'SUCCESS') { res.status = e.status; res.gesagt = e.grund === 'doppelt' ? '' : (e.nachricht || 'Dabei ist technisch etwas schiefgelaufen.'); break; }
            if (e.nurGeplant) { res.status = 'NUR_GEPLANT'; continue; }
            if (e.daten && Array.isArray(e.daten.cards)) res.karten = e.daten.cards;
            res.gesagt = e.nachricht || '';
        }
        return res;
    }

    function gespraechMerken(res) {
        try {
            var o = window.jvOrtGespraech; if (!o) return;
            var e = res.schritte.filter(function (x) { return x.faehigkeit === 'ortssuche' && x.ausgefuehrt; })[0];
            if (!e) return;
            if (e.status === 'SUCCESS' && e.daten && Array.isArray(e.daten.orte)) o.merke(e.daten.orte, 'chef');
            else if (e.status !== 'SUCCESS') o.fehler();
        } catch (er) { }
    }

    function ausgeben(res, plan) {
        if (res.karten && res.karten.length) karten(res.karten);
        if (res.status === 'NEEDS_INFORMATION' || res.status === 'NO_RESULTS') { frageAnmelden(); offen = { at: jetzt(), parameter: res.offen.parameter, plan: res.offen.plan, text: res.offen.text }; say(res.frage); return; }
        if (res.gesagt) { say(res.gesagt); return; }
        if (plan && plan.hinweis) { say(plan.hinweis); return; }
    }

    /* ---------- Öffentliche Abläufe ---------- */
    async function plane(text, opts) {
        var o = opts || {}, ent = typeof o.entscheider === 'function' ? o.entscheider : entscheider;
        var roh;
        try { roh = await ent(String(text == null ? '' : text), {}); }
        catch (e) { return { ok: false, plan: null, probleme: ['Entscheider fehlgeschlagen'], fehlendeFaehigkeiten: [], fehler: true, grund: String((e && e.message) || '') }; }
        return pruefePlan(roh);
    }

    async function verarbeite(text, opts) {
        var o = opts || {};
        var aus = { weg: 'nichts', status: 'OK', plan: null, probleme: [], schritte: [], gesagt: [], frage: '' };
        /* 1. Folgefrage zu gemerkten Treffern ("Das zweite gefällt mir", "Wie komme ich dahin?") */
        try { if (o.gespraech !== false && window.jvOrtGespraech && window.jvOrtGespraech.behandle(String(text)) === true) { aus.weg = 'gespraech'; protokolliere('gespraech', [], 'OK'); return aus; } } catch (e) { }
        /* 2. offene Rückfrage der Chef-KI */
        if (offen && jetzt() - offen.at <= FRAGE_MS && jungeFrageGehoertUns()) {
            var f = offen; offen = null;
            if (/^\s*(nein|nee|abbrechen|lass(?: es)?|vergiss es|egal)\b/i.test(text)) { say('Alles klar, ich lasse es.'); vermerke(o.eingang, 'abgebrochen'); aus.weg = 'abgebrochen'; protokolliere('abgebrochen', [], 'OK'); return aus; }
            var antwort = String(text).trim().replace(/[.!?]+$/, '').slice(0, 80);
            if (antwort && antwort.split(/\s+/).length <= 3 && !RX_FRAGEWORT.test(antwort)) {   // nur eine kurze Antwort, kein neuer Satz/keine neue Frage
                var plan0 = JSON.parse(JSON.stringify(f.plan)), st = plan0.schritte[0];
                if (st) {
                    if (f.parameter === 'ort') st.params.ort = antwort.replace(/^in\s+/i, ''); else st.params[f.parameter] = antwort;
                    var pr0 = pruefePlan(plan0);
                    if (pr0.ok) { aus.weg = 'rueckfrage'; return await ausfuehrenUndAusgeben(pr0.plan, f.text, o, aus); }
                }
            }
        } else if (offen) { offen = null; }
        /* 3. Plan */
        var pr = await plane(text, o);
        aus.probleme = pr.probleme;
        if (!pr.ok) { aus.weg = 'plan_ungueltig'; aus.status = 'PLAN_UNGUELTIG'; protokolliere('plan_ungueltig', [], 'PLAN_UNGUELTIG'); return aus; }   // sicher: nichts tun, nichts sagen, alles läuft wie bisher
        aus.plan = pr.plan;
        if (!pr.plan.schritte.length && !pr.plan.hinweis && !pr.plan.frage) { aus.weg = 'nichts'; protokolliere('nichts', [], 'OK'); return aus; }
        aus.weg = 'plan';
        return await ausfuehrenUndAusgeben(pr.plan, text, o, aus);
    }

    async function ausfuehrenUndAusgeben(plan, text, o, aus) {
        aus.plan = plan;
        if (!plan.schritte.length) { if (plan.hinweis) say(plan.hinweis); vermerke(o.eingang, 'hinweis'); protokolliere(aus.weg, [], 'HINWEIS'); aus.status = 'HINWEIS'; aus.gesagt.push(plan.hinweis); return aus; }
        var res = await fuehrePlanAus(plan, text, o);
        vermerke(o.eingang, res.schritte.some(function (x) { return x.grund === 'doppelt'; }) ? 'doppelt_verhindert'
            : res.status === 'SUCCESS' ? (res.schritte.some(function (x) { return x.ausgefuehrt && x.status === 'SUCCESS'; }) ? 'ortssuche_ausgefuehrt' : 'nur_geplant')
            : res.status === 'NUR_GEPLANT' ? 'nur_geplant' : res.status === 'NO_RESULTS' ? 'keine_treffer' : res.status === 'NEEDS_INFORMATION' ? 'rueckfrage'
            : res.status === 'CAPABILITY_MISSING' ? 'faehigkeit_fehlt' : 'fehler_suche');
        aus.schritte = res.schritte; aus.status = res.status; aus.frage = res.frage;
        if (res.fehlendeFaehigkeiten) aus.fehlendeFaehigkeiten = res.fehlendeFaehigkeiten;
        gespraechMerken(res);
        var vorher = res.frage;
        if (res.status === 'NEEDS_INFORMATION' && res.fehlendeFaehigkeiten && res.fehlendeFaehigkeiten.length) {
            say('Dafür fehlen mir noch Fähigkeiten: ' + res.fehlendeFaehigkeiten.map(function (n) { return n.replace(/_/g, ' '); }).join(', ') + '. Ich kann aber schon in der Nähe etwas für dich suchen. ' + (res.frage || ''));
            frageAnmelden(); offen = { at: jetzt(), parameter: res.offen.parameter, plan: res.offen.plan, text: res.offen.text };
        } else ausgeben(res, plan);
        if (res.gesagt) aus.gesagt.push(res.gesagt);
        if (vorher) aus.gesagt.push(vorher);
        protokolliere(aus.weg, res.schritte.map(function (s) { return s.faehigkeit; }), res.status);
        return aus;
    }

    /* Haken im Sprachweg: nur lokaler Entscheider, nur wenn EIN. true = übernommen (die Ausführung läuft asynchron weiter). */
    function behandle(text) {
        if (!istAn || typeof text !== 'string' || !text.trim()) return false;
        try {
            if (offen && jetzt() - offen.at <= FRAGE_MS && jungeFrageGehoertUns()) {
                var e1 = neuerEingang('rueckfrage_antwort'); vomChefBehandelt = jetzt() || 1;
                verarbeite(text, { gespraech: false, eingang: e1 }).catch(function () { });
                return true;
            }
            offen = null;
            if (RX_MEHRWUNSCH.test(text)) return false;   // Wetter/Internet im selben Satz: der KI-Weg plant ALLE Teile, das lokale Muster würde nur den Ortsteil erledigen und den Rest verschlucken
            var pr = pruefePlan(lokalEntscheiden(text));
            if (!pr.ok) return false;
            var p = pr.plan;
            var hatEchtesZiel = p.schritte.some(function (s) { return FREIGEGEBEN.indexOf(s.faehigkeit) >= 0; });
            if (!hatEchtesZiel && !(p.hinweis && !p.schritte.length)) return false;      // Schreibaktionen und Unbekanntes: weiter wie bisher (feste Befehle / KI)
            var e2 = neuerEingang('lokal_uebernommen'); vomChefBehandelt = jetzt() || 1;
            verarbeite(text, { gespraech: false, eingang: e2 }).catch(function () { });
            return true;
        } catch (e) { return false; }
    }

    /* ---------- KI-Weg im echten Sprachweg (voice.js) ---------- */
    var KI_ZEITLIMIT_MS = 7000, kiGen = 0, kiLetzter = { text: '', at: 0 }, kiZaehler = { anfragen: 0, ortssuchen: 0, zurueck: 0, websuchen: 0, wetter: 0, produktsuchen: 0 }, sendeFunktion = null;
    /* Gesprächsort: der zuletzt EINDEUTIG genannte Ort (nur der Name, nur Arbeitsspeicher, 10 Minuten). Er wird nur für "dort", "da", "in dieser Stadt" gebraucht.
       Gemerkt wird nur bei eingeschalteter Chef-KI; ein Satz mit mehreren Orten löscht ihn (nie raten). Vor der Benutzung wird er einmal beim Kartendienst geprüft (Ort, nicht irgendein Hauptwort). */
    var ORT_MS = 10 * 60000, ortMerker = null, ortPruefer = null;
    var RX_DA_SEIN = /(?<![\wäöüß])(?:da|dort)\s+(?:sein|ankommen|stehen)(?![\wäöüß])/i, RX_ZIEL_IM_SATZ = /(?<![\wäöüß])(?:zu|zum|zur|bei|beim|nach)\s+(?:meiner?|meinem|meinen|dem|der|den)?\s*[A-Za-zÄÖÜäöüß]{3,}/i;   // Ziel im selben Satz: zu/zum/zur/bei/nach + Name
    var RX_ORTSBEZUG = /(?<![\wäöüß])(?:dort|dorthin|dortige[nrms]?|in dieser stadt|in diesem ort|in dieser gegend|in diesem dorf|in dieser region|da(?!\s+(?:es|ich|du|wir|ihr|man|er|sie|vielleicht|eigentlich|mal|noch|auch|schon|wohl|denn|doch|gerade|zufällig|zufaellig|irgendwas|irgendwelche\w*|etwas|was|so)(?![\wäöüß])))(?![\wäöüß])/i;
    var RX_ORTSBEZUG_G = new RegExp(RX_ORTSBEZUG.source, 'gi');
    var ORT_KEIN = /^(?:Urlaub|Betrieb|Arbeit|Ordnung|Ruhe|Eile|Bezug|Zukunft|Gefahr|Betracht|Frage|Not|Kürze|Vergangenheit|Wahrheit|Hause|Haus|Mitte|Zeit|Folge|Wahl|Anfang|Ende|Fall|Sicht|Ordnung)$/;
    function ortFrisch() { return !!ortMerker && jetzt() - ortMerker.at <= ORT_MS; }
    function ortMerken(name, geprueft) {
        if (!istAn) return false;
        var n = typeof name === 'string' ? name.trim() : '';
        if (!saubererBegriff(n) || RX_ORTSBEZUG.test(n)) return false;
        ortMerker = { name: n, at: jetzt(), geprueft: geprueft === true };
        return true;
    }
    /* Orte im Satz: großgeschriebenes Wort nach in/nach/aus/bei/über/von/zu/für/um (Spracherkennung schreibt Namen groß). [] = keiner, 1 Name = eindeutig, mehrere = mehrdeutig. */
    function ortKandidaten(text) {
        var rx = /(?:^|[\s,])(?:in|nach|aus|bei|über|ueber|von|zu|für|fuer|um)\s+((?:(?:Bad|Sankt|St\.?|New|Los|Las|San|Santa)\s+)?[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]{2,})/g, m, namen = [];
        var t = String(text || '');
        while ((m = rx.exec(t)) !== null) {
            var n = m[1].trim();
            if (ORT_KEIN.test(n)) continue;
            if (namen.indexOf(n) < 0) namen.push(n);
        }
        return namen;
    }
    function ortAusAntwort(t) {
        var s = String(t || '').replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        for (var i = 0; i < 2; i++) s = s.replace(/^(?:ich\s+meine|meine|in|nach|von|für|fuer|aus|bei|die\s+stadt|den\s+ort)\s+/i, '');
        if (!s || s.split(' ').length > 3) return '';
        var name = s.split(' ').map(function (w) { return w.charAt(0).toUpperCase() + w.slice(1); }).join(' ');
        return saubererBegriff(name) && !RX_ORTSBEZUG.test(name) ? name : '';
    }
    /* Ist der Name ein Ort? Kartendienst (/api/geocode) liefert Klasse place/boundary für Städte und Dörfer; sonst false. */
    function ortPruefen(name) {
        if (typeof ortPruefer === 'function') { try { return Promise.resolve(ortPruefer(name)).then(function (v) { return v === true; }, function () { return false; }); } catch (e) { return Promise.resolve(false); } }
        return Promise.resolve().then(function () {
            var f = (typeof apiFetch === 'function') ? apiFetch : (typeof window.apiFetch === 'function' ? window.apiFetch : null);
            if (!f) return false;
            var t; var limit = new Promise(function (res) { t = setTimeout(function () { res(false); }, 6000); });
            var arbeit = f('/api/geocode?q=' + encodeURIComponent(name)).then(function (r) { return r && r.ok ? r.json() : null; }).then(function (d) {
                var h = Array.isArray(d) ? d[0] : null; return !!h && /^(?:place|boundary)$/.test(String(h.class || ''));
            });
            return Promise.race([arbeit, limit]).then(function (v) { clearTimeout(t); return v === true; }, function () { clearTimeout(t); return false; });
        }).catch(function () { return false; });
    }
    /* Setzt den gemeinten Ort in einen geprüften Plan ein (nie dem Modell überlassen): Wetter/Ortssuche ohne Ort bekommen ihn, "dort" in der Internetfrage wird ersetzt. */
    function ortEinsetzen(plan, ort) {
        try {
            if (!plan || !Array.isArray(plan.schritte)) return;
            plan.schritte.forEach(function (st) {
                if (!st) return;
                if (!st.params || typeof st.params !== 'object') st.params = {};
                if (st.faehigkeit === 'wetter' || st.faehigkeit === 'ortssuche') {
                    if (st.params.ort === undefined || st.params.ort === '' || (typeof st.params.ort === 'string' && RX_ORTSBEZUG.test(st.params.ort))) st.params.ort = ort;
                } else if (st.faehigkeit === 'websuche' && typeof st.params.frage === 'string') st.params.frage = st.params.frage.replace(RX_ORTSBEZUG_G, 'in ' + ort);
            });
        } catch (e) { }
    }
    var thema = null, offenKi = null;   // Thema der letzten Antwort (nur Art/Tag/Stichwort, 10 Minuten) und eine offene Rückfrage des KI-Weges (2 Minuten); nur Arbeitsspeicher
    /* Vorfilter NUR zur Kostenbegrenzung: reines Geplauder ("Wie geht's dir?") kostet keine zusätzliche KI-Anfrage. Entschieden wird NICHT hier, sondern von der KI. */
    var RX_VON = /\bvon\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß.-]*(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß.-]*){0,2})\s+(?:zum|zur|nach|bis|zu|ins|an|in)\b/;
    /* Abfahrtsfragen ("Wann muss ich losfahren?", "Wann muss ich bei Mutter los, um 13 Uhr da zu sein?"): die Chef-KI rechnet keine Abfahrtszeit (das Werkzeug fahrzeit kennt keine Ankunftszeit und keinen Puffer). Sie bleiben beim vorhandenen Abfahrtsweg (travel_time, computeDepartureAdvice). */
    var RX_ABFAHRT = /\b(?:wann|wie\s+(?:fr(?:ü|ue)h|sp(?:ä|ae)t))\b[^?.!]*\b(?:los\s*fahren|losfahren|los\s*m(?:ü|ue)ss\w*|losmuss\w*|los\s*muss\w*|abfahren|aufbrechen|losgehen|loskomm\w*|starten|fahren)\b|\babfahr\w*|\bmuss\s+ich\s+(?:\w+\s+){0,4}(?:los|weg)\b/i;
    /* "Ich muss um 18 Uhr am Hamburger Hauptbahnhof sein." (ohne "Wann ...?"): ebenfalls eine Abfahrtsfrage für das Werkzeug abfahrt */
    var RX_ANKUNFT = /\b(?:muss|soll|will|m(?:ö|oe)chte)\b[^?.!]*\b(?:um|gegen|bis)\s+\d{1,2}(?::\d{2})?\s*(?:uhr)?(?=\s|[.!?,]|$)[^?.!]*\b(?:sein|ankommen)\b/i;
    var RX_FAHRT = /\b(fahrzeit|fahrt|fahre|fahren|fahr|brauche ich|dauert|route|verkehr\w*|stau\w*|autobahn|entfernung|kilometer|anfahrt|hinkomm\w*|hinfahr\w*)\b/i;
    var RX_KI_VORFILTER = /\b(wo|wohin|hier|in der n[äa]he|umgebung|gegend|ecke|unterwegs|auswärts|ausw[äa]rts|ausgehen|essen|speisen|trinken|hunger|durst|magen|lust auf|empfiehl\w*|tipp|find\w*|such\w*|gibt es|gibts|kennst du|abend|mittag|fr[üu]hst[üu]ck\w*|snack|happen|bissen|gemütlich|gem[üu]tlich|romantisch|date|feiern|laden|lokal|schmaus\w*|wetter|regen\w*|schirm|jacke|temperatur|grad|sonnig|schnee|gewitter|sturm|nachrichten|neuigkeiten|aktuell\w*|fernseh\w*|kino|programm|öffnungszeit\w*|ergebnis\w*|spielstand|tabelle|internet|google|recherchier\w*|nachschlagen|nachsehen|kost\w*|preis\w*|kaufen|vergleich\w*|h[aä]ndler\w*|foto\w*|selbst|verbesser\w*|unternehm\w*|anstell\w*|kinder|fahrzeit|fahr\w*|route|stau\w*|verkehr\w*|autobahn|dauert|brauche ich|wie lange|wie weit|entfernt|entfernung|mit dem auto|jarvis|neues|neuigkeit\w*)\b/i;
    var RX_FOLGE = /^(?:und|aber|dann|auch|noch|wie (?:sieht|ist) es|was ist (?:denn )?mit)\b|\b(?:morgen|übermorgen|uebermorgen|dort|dann)\b/i;   // kurze Anschlussfrage zum letzten Thema ("und morgen?")

    function sendeStandard(nachrichten, signal) {   // bestehende KI-Anbindung (apiFetch -> /api/groq), kein neuer Server
        var f = (typeof apiFetch === 'function') ? apiFetch : (typeof window.apiFetch === 'function' ? window.apiFetch : null);
        if (!f) return Promise.reject(new Error('Keine KI-Anbindung'));
        return f('/api/groq', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: signal,
            body: JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', response_format: { type: 'json_object' }, messages: nachrichten })
        }).then(function (res) { return res.json(); }).then(function (d) {
            var c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
            if (typeof c !== 'string' || !c.trim()) throw new Error('Leere KI-Antwort');
            return c;
        });
    }
    function saubererBegriff(v) { return typeof v === 'string' && v.trim().length > 0 && v.length <= 60 && /^[A-Za-zÄÖÜäöüß0-9 .,&'’-]+$/.test(v) && /[A-Za-zÄÖÜäöüß]/.test(v); }
    /* Was der KI-Entscheider im Sprachweg planen darf: höchstens 3 Schritte (1 Websuche, 2 Ortssuchen, 1 Wetter) mit sauberen Angaben, ODER nur eine kurze Rückfrage ohne Schritte.
       Alles andere (Schreibaktionen, unbekannte Fähigkeiten, fremde Angaben, Frage zusammen mit Schritten) geht zurück in den bisherigen Ablauf. */
    function frageSauber(v) { return typeof v === 'string' && v.trim().length >= 3 && v.length <= 200 && !/[<>{}\[\]]|https?:/i.test(v); }
    function textOk(v, max) { return typeof v === 'string' && v.trim().length >= 2 && v.trim().length <= (max || 120) && !/[<>{}\[\]]|https?:/i.test(v); }
    function zeitOk(v) {
        if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(v)) return false;
        var t = new Date(v).getTime(); return !isNaN(t) && t >= Date.now() - 60000 && t <= Date.now() + 800 * 86400000;   // nicht in der Vergangenheit (dann fragt der bisherige Weg), höchstens gut zwei Jahre voraus
    }
    function nurKeys(ks, erlaubt) { return ks.every(function (k) { return erlaubt.indexOf(k) >= 0; }); }
    function b2aParamsOk(name, p, ks) {   // Paket B2a: strenge Prüfung der Angaben je Fähigkeit (Wiederholungen, Verschieben usw. gibt es hier nicht)
        if (name === 'termin_verschieben') return nurKeys(ks, ['suche', 'tag']) && (p.suche === undefined || textOk(p.suche, 60)) && (p.tag === undefined || textOk(p.tag, 40));   // Bugfix Termin verschieben: ein ungewöhnlicher Tag ("Freitag") macht den Plan nicht mehr ungültig, er wird unten bereinigt. Die neue Zeit liest die Chef-KI selbst aus dem Satz (nie vom Planer)
        if (name === 'aufgaben_lesen') return ks.length === 0;
        if (name === 'termine_lesen') return nurKeys(ks, ['tag']) && (p.tag === undefined || ['heute', 'morgen', 'uebermorgen', 'übermorgen'].indexOf(String(p.tag).toLowerCase()) >= 0 || /^\d{4}-\d{2}-\d{2}$/.test(String(p.tag)));
        if (name === 'aufgabe_erstellen') return nurKeys(ks, ['text']) && textOk(p.text);
        if (name === 'erinnerung_erstellen') return nurKeys(ks, ['text', 'zeit', 'wichtig']) && textOk(p.text) && (p.zeit === undefined || zeitOk(p.zeit)) && (p.wichtig === undefined || typeof p.wichtig === 'boolean');
        if (name === 'termin_erstellen') return nurKeys(ks, ['text', 'zeit', 'ort', 'dauer_minuten']) && textOk(p.text) && zeitOk(p.zeit) && (p.ort === undefined || textOk(p.ort)) && (p.dauer_minuten === undefined || (typeof p.dauer_minuten === 'number' && p.dauer_minuten >= 5 && p.dauer_minuten <= 1440));
        if (name === 'gedaechtnis_speichern') return nurKeys(ks, ['schluessel', 'wert']) && textOk(p.schluessel, 60) && (p.wert === undefined || textOk(p.wert));
        if (name === 'kontakt_speichern') return nurKeys(ks, ['ort', 'nummer', 'name', 'adresse', 'telefon']) && (p.ort === undefined || textOk(p.ort, 60)) && (p.nummer === undefined || (typeof p.nummer === 'number' && p.nummer >= 1 && p.nummer <= 9 && p.nummer === Math.floor(p.nummer))) && (p.name === undefined || textOk(p.name, 60)) && (p.adresse === undefined || textOk(p.adresse)) && (p.telefon === undefined || /^[0-9+()\/ .-]{5,25}$/.test(String(p.telefon)));
        return false;
    }
    function planErlaubt(plan, ohneFrage) {
        if (!plan || !Array.isArray(plan.schritte)) return false;
        var n = plan.schritte.length;
        if (n === 0) return !ohneFrage && frageSauber(plan.frage);   // nach einer Antwort auf eine Rückfrage gibt es keine zweite Rückfrage (keine Fragekette)
        if (n > MAX_SCHRITTE || plan.frage) return false;
        var zaehl = { ortssuche: 0, websuche: 0, wetter: 0, produktsuche: 0, foto_info: 0, jarvis_info: 0, fahrzeit: 0, kontakte_lesen: 0, gedaechtnis_lesen: 0, abfahrt: 0, schicht: 0 };
        if (plan.schritte.some(function (v) { return v.aus !== undefined; }) && plan.schritte.some(function (v) { return B2A_NEU.indexOf(v.faehigkeit) >= 0 || B2B_NAMEN.indexOf(v.faehigkeit) >= 0; })) return false;   // Kette nur mit rein lesenden Plänen
        for (var i = 0; i < n; i++) {
            var st = plan.schritte[i], p = st.params || {}, ks = Object.keys(p);
            if (KI_PLAN.indexOf(st.faehigkeit) < 0) return false;
            if (st.aus !== undefined && (LESEND.indexOf(st.faehigkeit) < 0 || ausPruefen(st.aus, i, plan.schritte) === false)) return false;
            if (B2A_NEU.indexOf(st.faehigkeit) >= 0 || B2B_NAMEN.indexOf(st.faehigkeit) >= 0) { if (!b2aParamsOk(st.faehigkeit, p, ks)) return false; if (plan.schritte.slice(0, i).some(function (v) { return v.faehigkeit === st.faehigkeit && JSON.stringify(v.params || {}) === JSON.stringify(p); })) return false; continue; }
            zaehl[st.faehigkeit]++;
            if (st.faehigkeit === 'ortssuche') {
                if (!saubererBegriff(p.suchbegriff)) return false;
                if (p.ort !== undefined && !saubererBegriff(p.ort)) return false;
                if (!ks.every(function (k) { return k === 'suchbegriff' || k === 'ort'; })) return false;
            } else if (st.faehigkeit === 'foto_info' || st.faehigkeit === 'jarvis_info') {
                if (ks.length) return false;
            } else if (st.faehigkeit === 'fahrzeit') {
                if (!saubererBegriff(p.ziel) || (p.von !== undefined && !saubererBegriff(p.von)) || !ks.every(function (k) { return k === 'ziel' || k === 'von'; })) return false;
            } else if (st.faehigkeit === 'abfahrt') {
                if (!saubererBegriff(p.ziel) || typeof p.ankunft !== 'string' || !/^\d{1,2}(:\d{2})?$/.test(p.ankunft.trim()) || (p.tag !== undefined && !/^(heute|morgen|uebermorgen|übermorgen|\d{4}-\d{2}-\d{2})$/i.test(String(p.tag))) || !ks.every(function (k) { return k === 'ziel' || k === 'ankunft' || k === 'tag'; })) return false;
            } else if (st.faehigkeit === 'schicht') {
                if ((p.tag !== undefined && !/^(heute|morgen|uebermorgen|übermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|\d{4}-\d{2}-\d{2})$/i.test(String(p.tag))) || !ks.every(function (k) { return k === 'tag'; })) return false;
            } else if (st.faehigkeit === 'kontakte_lesen') {
                if (!saubererBegriff(p.name) || !ks.every(function (k) { return k === 'name'; })) return false;
            } else if (st.faehigkeit === 'gedaechtnis_lesen') {
                if (!saubererBegriff(p.suche) || !ks.every(function (k) { return k === 'suche'; })) return false;
            } else if (st.faehigkeit === 'produktsuche') {
                if (!saubererBegriff(p.suchbegriff) || !ks.every(function (k) { return k === 'suchbegriff'; })) return false;
            } else if (st.faehigkeit === 'websuche') {
                if (typeof p.frage !== 'string' || p.frage.trim().length < 3) return false;
                if (p.suchbegriff !== undefined && (typeof p.suchbegriff !== 'string' || p.suchbegriff.length > 100)) return false;
                if (!ks.every(function (k) { return k === 'frage' || k === 'suchbegriff'; })) return false;
            } else {
                if (p.tag !== undefined && ['heute', 'morgen', 'uebermorgen', 'übermorgen'].indexOf(String(p.tag).toLowerCase()) < 0) return false;
                if (p.ort !== undefined && !saubererBegriff(p.ort)) return false;
                if (!ks.every(function (k) { return k === 'tag' || k === 'ort'; })) return false;
            }
        }
        return zaehl.ortssuche <= 2 && zaehl.websuche <= 1 && zaehl.wetter <= 1 && zaehl.produktsuche <= 2 && zaehl.foto_info <= 1 && zaehl.jarvis_info <= 1 && zaehl.fahrzeit <= 1 && zaehl.kontakte_lesen <= 1 && zaehl.gedaechtnis_lesen <= 1 && zaehl.abfahrt <= 1 && zaehl.schicht <= 1;
    }

    /* Kontext für kurze Anschlussfragen: nur Art des letzten Themas (und Tag/Stichwort), nie ein Satz. */
    function themaFrisch() { return !!thema && jetzt() - thema.at <= THEMA_MS; }
    function kontextText() {
        if (!themaFrisch()) return '';
        return 'Nur zur Einordnung kurzer Anschlussfragen: das letzte Thema war ' + (thema.art === 'wetter' ? 'das Wetter (Tag: ' + (thema.tag || 'heute') + (thema.ort ? ', Ort: ' + thema.ort : '') + ')' : thema.art === 'orte' ? 'eine Ortssuche' + (thema.begriff ? ' (' + thema.begriff + ')' : '') : 'eine Internetauskunft') + '.';
    }
    function notiz(name) { return name === 'fahrzeit' ? 'Die Fahrzeit konnte ich gerade nicht berechnen, und ich schätze sie nicht.' : name === 'abfahrt' ? 'Die Abfahrtszeit konnte ich gerade nicht berechnen, und ich schätze sie nicht.' : name === 'schicht' ? 'Im Schichtplan konnte ich gerade nichts nachsehen, und ich rate keine Zeiten.' : name === 'kontakte_lesen' ? 'Die Adresse konnte ich gerade nicht nachsehen.' : name === 'gedaechtnis_lesen' ? 'Im Gedächtnis konnte ich gerade nichts nachsehen.' : name === 'jarvis_info' ? 'Zu meinen eigenen Fähigkeiten konnte ich nichts sagen.' : name === 'foto_info' ? 'Zum Foto konnte ich nichts sagen.' : name === 'produktsuche' ? 'Bei der Produktsuche hat es leider nicht geklappt.' : name === 'websuche' ? 'Bei der Internetsuche hat es leider nicht geklappt.' : name === 'wetter' ? 'Die Wetterdaten waren gerade nicht erreichbar.' : 'Bei der Ortssuche hat es leider nicht geklappt.'; }
    function mitRest(p, ende) {
        var rest = ende - jetzt();
        if (rest <= 0) return Promise.resolve({ zeit: true });
        var t;
        return Promise.race([p, new Promise(function (res) { t = setTimeout(function () { res({ zeit: true }); }, rest); })]).then(function (v) { clearTimeout(t); return v; }, function (e) { clearTimeout(t); throw e; });
    }

    /* Führt den geprüften Plan Schritt für Schritt aus und sammelt die Ergebnisse. Spricht NICHT selbst: das macht der Aufrufer EINMAL mit dem Gesamtergebnis.
       Nach dem Zeitbudget wird alles Weitere verworfen (nichts wird nachträglich gesprochen). */
    /* Paket B2a: Plan mit Kalender-/Erinnerungs-/Aufgaben-/Kontakt-/Gedächtnis-Schritten. Strikt der Reihe nach; beim ersten Problem wird SOFORT gestoppt (spätere Schritte hängen oft vom früheren ab).
       Nichts wird wiederholt, nichts wird um eine Bestätigung herumgeführt. st.begonnen = es wurde schon (versucht) zu schreiben: dann gibt es keinen Rückfall auf den alten KI-Weg. */
    function ueberschreibtGedaechtnis(p) {   // gibt den ALTEN Wert zurück, wenn der Eintrag mit einem anderen Wert überschrieben würde, sonst null
        try {
            var key = String(p.schluessel || '').toLowerCase().trim();
            if (!key || typeof searchMemory !== 'function') return null;
            var t = searchMemory(key) || [];
            for (var n = 0; n < t.length; n++) if (t[n] && String(t[n].key).toLowerCase() === key && typeof t[n].value === 'string' && t[n].value.trim() !== '') return String(p.wert == null ? '' : p.wert).trim().toLowerCase() !== t[n].value.trim().toLowerCase() ? t[n].value.trim() : null;
        } catch (e) { }
        return null;
    }

    /* ---------- Paket B2b-1: Termine verschieben (nur nach ausdrücklicher Bestätigung) ---------- */
    function nz(t) { return String(t == null ? '' : t).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[?!,;]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    var WTAG = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6 };
    var ZAHLW = { ein: 1, eine: 1, einen: 1, einem: 1, eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwoelf: 12 };
    function tagIso(d) { return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function zeitIso(d) { return d.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).replace(' ', 'T').slice(0, 16) + ':00'; }
    function mittag(iso) { return new Date(iso + 'T12:00:00'); }
    function tagAusWort(n, heuteOk) {   // "morgen", "Freitag", "15.11." -> JJJJ-MM-TT oder ''
        var h0 = tagIso(new Date()), h = mittag(h0), d;
        if (/\buebermorgen\b/.test(n)) { d = mittag(h0); d.setDate(d.getDate() + 2); return tagIso(d); }
        if (/\bmorgen\b/.test(n)) { d = mittag(h0); d.setDate(d.getDate() + 1); return tagIso(d); }
        if (/\bheute\b/.test(n)) return h0;
        var m = n.match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/);
        if (m) { var diff = (WTAG[m[1]] - h.getDay() + 7) % 7; if (diff === 0 && heuteOk !== true) diff = 7; d = mittag(h0); d.setDate(d.getDate() + diff); return tagIso(d); }
        m = n.match(/\b(\d{1,2})\.(\d{1,2})\.(?:(\d{4}))?/);
        if (m && +m[1] >= 1 && +m[1] <= 31 && +m[2] >= 1 && +m[2] <= 12) {
            var jahr = m[3] ? +m[3] : h.getFullYear(); d = new Date(jahr, +m[2] - 1, +m[1], 12);
            if (!m[3] && tagIso(d) < h0) d = new Date(jahr + 1, +m[2] - 1, +m[1], 12);
            return tagIso(d);
        }
        return '';
    }
    function uhrAus(n) {   // "15 Uhr", "um 15:30", "halb vier"-Zahl ("halb 4") -> { h, m } oder null
        var m = n.match(/(?:^|[^\d.])(\d{1,2}):(\d{2})\b/) || n.match(/(?:^|[^\d.])(\d{1,2})\.(\d{2})\s*uhr\b/); if (m && +m[1] <= 23 && +m[2] <= 59) return { h: +m[1], m: +m[2] };
        m = n.match(/\bhalb (\d{1,2})\b/); if (m && +m[1] >= 1 && +m[1] <= 24) return { h: (+m[1] + 23) % 24, m: 30 };
        m = n.match(/\b(\d{1,2})\s*uhr\b/); if (m && +m[1] <= 23) return { h: +m[1], m: 0 };
        m = n.match(/\bum (\d{1,2})\b(?!\s*(?:stunde|stunden|minute|minuten|tag|tage|tagen|woche|wochen))/); if (m && +m[1] <= 23) return { h: +m[1], m: 0 };
        return null;
    }
    function relativAus(n) {   // "eine Stunde später", "einen Tag nach hinten", "30 Minuten früher" -> { min, tage } oder null
        var m = n.match(/\b(?:um\s+)?(\d+(?:[.,]\d+)?|eine halbe|halbe|anderthalb|eineinhalb|ein|eine|einen|einem|zwei|drei|vier|fuenf|sechs|sieben|acht|neun|zehn|zwoelf)\s*(stunden?|std|minuten?|min|viertelstunde|tage?n?|wochen?)\s+(spaeter|frueher|nach hinten|nach vorne|nach vorn|vorher|nachher)\b/);
        if (!m) return null;
        var zahl = /^\d/.test(m[1]) ? parseFloat(m[1].replace(',', '.')) : (m[1] === 'eine halbe' || m[1] === 'halbe') ? 0.5 : (m[1] === 'anderthalb' || m[1] === 'eineinhalb') ? 1.5 : ZAHLW[m[1]];
        if (!zahl || zahl <= 0) return null;
        var einheit = m[2].charAt(0) === 's' && m[2] !== 'std' ? 'h' : m[2] === 'std' ? 'h' : m[2].indexOf('viertel') === 0 ? 'v' : m[2].charAt(0) === 'm' ? 'm' : m[2].charAt(0) === 't' ? 't' : 'w';
        var vor = /^(frueher|nach vorne|nach vorn|vorher)$/.test(m[3]), vz = vor ? -1 : 1, min = 0, tage = 0;
        if (einheit === 'h') min = zahl * 60; else if (einheit === 'm') min = zahl; else if (einheit === 'v') min = zahl * 15; else if (einheit === 't') tage = zahl; else tage = zahl * 7;
        if (tage !== Math.floor(tage) || min > 7 * 1440 || tage > 60) return null;
        return { min: vz * Math.round(min), tage: vz * tage };
    }
    function leseZiel(text, antwort) {   // Wohin soll verschoben werden? { rel } oder { tag, uhr } oder null. Der BISHERIGE Tag steht vor "auf" und zählt hier nicht.
        var n = nz(text), rel = relativAus(n);
        if (rel) return { rel: rel };
        var teile = n.split(/\bauf\b/), ziel = teile.length > 1 ? teile[teile.length - 1] : n;
        var tag = tagAusWort(ziel, false), uhr = uhrAus(ziel);
        return (tag || uhr) ? { tag: tag, uhr: uhr } : null;
    }
    function altTag(text) {   // "den Zahnarzt am Freitag auf Montag verschieben" / "morgen eine Stunde später": der Tag VOR dem Ziel gehört zum bestehenden Termin
        var n = nz(text), vor;
        if (relativAus(n)) vor = n; else { var t = n.split(/\bauf\b/); if (t.length < 2) return ''; vor = t.slice(0, -1).join(' auf '); }
        return tagAusWort(vor, true);
    }
    function ordinalAus(n, antwort) {   // "den zweiten" -> 2, "den letzten" -> -1, in der Antwort auch "zwei", "Nummer 2", "2"
        var m = n.match(/\b(erste|zweite|dritte|vierte|fuenfte)[nrms]?\b/);
        if (m) return { erste: 1, zweite: 2, dritte: 3, vierte: 4, fuenfte: 5 }[m[1]];
        if (/\bletzte[nrms]?\b/.test(n)) return -1;
        if (antwort) {
            m = n.match(/^(?:die |der |den |das )?(?:nummer |nr |termin )?(\d|eins|zwei|drei|vier|fuenf)$/);
            if (m) return /^\d$/.test(m[1]) ? +m[1] : { eins: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5 }[m[1]];
        }
        return 0;
    }
    function terminText(e) {
        try {
            if (/^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate))) return mittag(e.isoDate).toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' }) + ', ganztägig';
            var d = new Date(e.isoDate);
            return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' }) + ' um ' + d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', minute: '2-digit' }).replace(/:00$/, '') + ' Uhr';
        } catch (x) { return ''; }
    }
    /* Findet den EINEN Termin und rechnet die neue Zeit aus. Ergebnis: { art:'frage', was, frage } | { art:'fehler', nachricht } | { art:'bestaetigen', params, vorher, titel } */
    function saubereSuche(v) {   // "Meinen Termin beim Zahnarzt" -> "zahnarzt"; nur "Termin" -> '' (dann wird gefragt, nie geraten)
        var w = nz(v).replace(/[.]+$/, '').split(' ').filter(function (x) { return x && !/^(mein\w*|dein\w*|unser\w*|der|die|das|den|dem|des|ein\w*|beim|bei|vom|von|zum|zur|zu|am|im|um|wegen|termin\w*|gern\w*|bitte|dann|doch|ich|also|aeh|aehm|naja)$/.test(x); }).map(function (x) { return x.replace(/termine?$/, ''); }).filter(function (x) { return x.length >= 2; });
        return w.join(' ');
    }
    function klausel(text) {   // bei mehreren Wünschen in einem Satz zählt nur der Teil mit dem Verschieben ("... und erinnere mich eine Stunde vorher" gehört nicht dazu)
        var teile = String(text).split(/\s+(?:und|dann|danach|außerdem|ausserdem|sowie|zusätzlich|zusaetzlich)\s+/i);
        for (var i = 0; i < teile.length; i++) if (RX_VERSCHIEBEN.test(teile[i])) return teile[i];
        return String(text);
    }
    function loeseVerschiebung(s, text0, zus) {
        zus = zus || {};
        var text = klausel(text0), sk = window.jvSchreibkern, n = nz(text);
        if (!sk || typeof sk.kandidatenTermine !== 'function') return { art: 'fehler', nachricht: 'Der Kalender ist gerade nicht erreichbar, deshalb habe ich nichts verschoben.' };
        var p0 = { suche: saubereSuche(zus.suche || (s.params && s.params.suche) || '') };
        if (!p0.suche) return { art: 'frage', was: 'suche', frage: 'Welchen Termin möchtest du verschieben?', zus: { tag: zus.tag || '' } };
        var tag = (s.params && s.params.tag) || zus.tag || altTag(text);
        if (tag) p0.tag = tag;
        var k = sk.kandidatenTermine(p0);
        /* Bugfix: Der Tag vom Planer ist nur ein Hinweis (die KI setzt gern "heute"). Findet sich damit nichts, wird ohne Tag gesucht, und ein falscher Tag wird NIE in die Rückfrage mitgenommen (sonst läuft sie endlos im Kreis). */
        if (!k.length && p0.tag) { var p1 = { suche: p0.suche }; var k1 = sk.kandidatenTermine(p1); if (k1.length) { k = k1; tag = ''; delete p0.tag; } }
        if (!k.length) return { art: 'frage', was: 'suche', frage: 'Ich habe keinen passenden Termin gefunden. Wie heißt der Termin genau?', zus: { tag: '' } };
        if (k.length > 5) return { art: 'frage', was: 'suche', frage: 'Ich finde mehr als fünf passende Termine. Nenne mir bitte den genauen Namen des Termins.', zus: { tag: tag || '' } };
        var zusNeu = { suche: p0.suche, tag: tag || '' };
        if (k.length > 1) {
            var nr = zus.nummer != null ? zus.nummer : ordinalAus(n, false), idx = nr === -1 ? k.length - 1 : nr - 1;
            if (!nr) return { art: 'frage', was: 'wahl', frage: 'Ich finde mehrere passende Termine. ' + k.map(function (e, i) { return (i + 1) + ': ' + e.text + ', ' + terminText(e); }).join('. ') + '. Welchen meinst du?', zus: zusNeu };
            if (idx < 0 || idx >= k.length) return { art: 'frage', was: 'wahl', frage: 'Die Nummer ' + nr + ' gibt es nicht. ' + k.map(function (e, i) { return (i + 1) + ': ' + e.text + ', ' + terminText(e); }).join('. ') + '. Welchen meinst du?', zus: zusNeu };
            k = [k[idx]]; zusNeu.nummer = nr;   // Bugfix: die getroffene Wahl bleibt bei der nächsten Rückfrage (Zeit) erhalten, sonst wird nach der Zeit noch einmal "welchen meinst du?" gefragt
        }
        var e = k[0], ganz = /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate));
        var spec = zus.ziel || leseZiel(text, false);
        if (!spec) return { art: 'frage', was: 'zeit', frage: 'Auf wann soll ich „' + e.text + '“ (' + terminText(e) + ') verschieben? Du kannst zum Beispiel sagen: Freitag um 15 Uhr, oder: eine Stunde später.', zus: zusNeu };
        var neu;
        if (spec.rel) {
            if (ganz && spec.rel.min) return { art: 'frage', was: 'zeit', frage: '„' + e.text + '“ ist ganztägig, ich kann ihn nicht um Stunden verschieben. Auf welchen Tag soll ich ihn legen?', zus: zusNeu };
            var d = ganz ? mittag(e.isoDate) : new Date(e.isoDate);
            if (isNaN(d.getTime())) return { art: 'fehler', nachricht: 'Die Zeit des Termins ist unklar, deshalb habe ich nichts verschoben.' };
            if (spec.rel.tage) d.setDate(d.getDate() + spec.rel.tage);
            if (spec.rel.min) d.setMinutes(d.getMinutes() + spec.rel.min);
            neu = ganz ? tagIso(d) + 'T00:00:00' : zeitIso(d);
        } else {
            var alt = ganz ? null : new Date(e.isoDate);
            if (!ganz && isNaN(alt.getTime())) return { art: 'fehler', nachricht: 'Die Zeit des Termins ist unklar, deshalb habe ich nichts verschoben.' };
            var tagNeu = spec.tag || (ganz ? e.isoDate : tagIso(alt));
            if (!spec.uhr && !ganz) { var hm = zeitIso(alt).slice(11, 16); neu = tagNeu + 'T' + hm + ':00'; }
            else if (!spec.uhr) neu = tagNeu + 'T00:00:00';
            else neu = tagNeu + 'T' + ('0' + spec.uhr.h).slice(-2) + ':' + ('0' + spec.uhr.m).slice(-2) + ':00';
        }
        if (ganz ? neu.slice(0, 10) === e.isoDate : Math.abs(new Date(neu).getTime() - new Date(e.isoDate).getTime()) < 60000) return { art: 'fehler', nachricht: '„' + e.text + '“ liegt schon genau dann. Ich habe nichts geändert.' };
        return { art: 'bestaetigen', params: { suche: e.text, termin_id: String(e.id), neue_zeit: neu }, vorher: e.isoDate, titel: e.text, zus: zusNeu };
    }
    /* Für den alten KI-Weg (B2b-2): sagt der Nutzer "eine Stunde später" / "einen Tag nach hinten", rechnet das hier deterministisch ab der ALTEN Terminzeit aus (nicht ab jetzt). Kein relativer Satz: null. */
    function relativeNeueZeit(e, text) {
        try {
            var rel = relativAus(nz(klausel(text))); if (!rel || !e) return null;
            var ganz = /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate));
            if (ganz && rel.min) return null;
            var d = ganz ? mittag(e.isoDate) : new Date(e.isoDate); if (isNaN(d.getTime())) return null;
            if (rel.tage) d.setDate(d.getDate() + rel.tage);
            if (rel.min) d.setMinutes(d.getMinutes() + rel.min);
            return ganz ? tagIso(d) + 'T00:00:00' : zeitIso(d);
        } catch (x) { return null; }
    }
    function pruefeAktuell(res) {   // direkt vor dem Verschieben: gibt es den Termin noch genau so, wie bestätigt wurde?
        var sk = window.jvSchreibkern, k = sk ? sk.kandidatenTermine({ suche: res.params.suche, termin_id: res.params.termin_id }) : [];
        if (k.length !== 1 || String(k[0].isoDate) !== String(res.vorher)) return { art: 'fehler', nachricht: 'Der Termin hat sich inzwischen geändert oder ist nicht mehr da, deshalb habe ich nichts verschoben. Sag es bitte noch einmal.' };
        return { art: 'los', params: res.params };
    }

    async function ausfuehrenSchreibend(plan, text, gen, ende, st, fort) {
        fort = fort || {};
        var start = fort.ab || 0, keinFall = fort.ab !== undefined || plan.schritte.some(function (x) { return B2B_NAMEN.indexOf(x.faehigkeit) >= 0; });   // beim Verschieben und nach einer Rückfrage gibt es nie einen Rückfall auf den alten Weg
        var erledigt = (fort.erledigt || []).slice(), kartenListe = [], schritte = [], stopp = null, doppelt = 0, versucht = start;
        for (var i = start; i < plan.schritte.length; i++) {
            var s = plan.schritte[i], name = s.faehigkeit, schreibt = B2A_SCHREIBT.indexOf(name) >= 0 || B2B_NAMEN.indexOf(name) >= 0;
            var istFort = fort.ab !== undefined && i === fort.ab, ja = istFort && fort.bestaetigt === true;
            if (gen !== kiGen) { if (st.begonnen && erledigt.length) { stopp = { art: 'ueberholt' }; break; } return { art: 'ueberholt', geschrieben: st.begonnen }; }   // schon Geschriebenes wird trotzdem ehrlich genannt
            if (jetzt() > ende) { stopp = { art: 'zeit' }; break; }
            if (name === 'websuche') kiZaehler.websuchen++; else if (name === 'wetter') kiZaehler.wetter++; else if (name === 'ortssuche') kiZaehler.ortssuchen++; else if (name === 'produktsuche') kiZaehler.produktsuchen++;
            var e;
            if (name === 'termin_verschieben') {
                var lv = ja && fort.resolved ? pruefeAktuell(fort.resolved) : loeseVerschiebung(s, text, istFort ? fort.zusatz : null);
                if (lv.art === 'frage') { versucht++; stopp = { art: 'pause', pausenArt: 'info', was: lv.was, name: name, frage: lv.frage, zusatz: lv.zus || {}, index: i }; break; }
                if (lv.art === 'fehler') { versucht++; stopp = { art: 'fehler', name: name, nachricht: lv.nachricht, ausgefuehrt: false, status: 'TOOL_FAILED' }; break; }
                if (lv.art === 'bestaetigen') {   // erst fragen: der Registry-Lauf prüft alles (Trockenlauf) und liefert die genaue Frage; geändert wird nichts
                    e = await fuehreSchrittAus({ faehigkeit: name, params: lv.params }, text, { schreiben: true, frage: window.jvSchreibkern.frageVerschieben(lv.params) });
                    versucht++; schritte.push(e);
                    if (e.status === 'NEEDS_CONFIRMATION') { stopp = { art: 'pause', pausenArt: 'bestaetigung', was: 'ja', name: name, frage: e.nachricht, resolved: { params: lv.params, vorher: lv.vorher }, zusatz: lv.zus || {}, index: i }; break; }
                    if (e.status === 'NEEDS_INFORMATION') { stopp = { art: 'pause', pausenArt: 'info', was: 'zeit', name: name, frage: e.nachricht, zusatz: lv.zus || {}, index: i }; break; }
                    stopp = { art: 'fehler', name: name, nachricht: e.nachricht || '', ausgefuehrt: false, status: e.status }; break;
                }
                e = await fuehreSchrittAus({ faehigkeit: name, params: lv.params }, text, { schreiben: true, bestaetigt: true });
                if (e.ausgefuehrt) st.begonnen = true;
            } else {
                if (name === 'gedaechtnis_speichern' && !(ja && fort.ueberschreibenOk)) {   // überschreiben: nur mit Bestätigung für genau diesen Eintrag
                    var alt = ueberschreibtGedaechtnis(s.params);
                    if (alt !== null) { versucht++; stopp = { art: 'pause', pausenArt: 'bestaetigung', was: 'ja', name: name, frage: 'Unter „' + String(s.params.schluessel).trim() + '“ steht schon „' + alt + '“. Soll ich es durch „' + String(s.params.wert == null ? '' : s.params.wert).trim() + '“ ersetzen?', ueberschreiben: true, index: i }; break; }
                }
                if (schreibt) { e = await fuehreSchrittAus(s, text, { schreiben: true, bestaetigt: ja }); if (e.ausgefuehrt) st.begonnen = true; }
                else if (B2A_NEU.indexOf(name) >= 0) e = await fuehreSchrittAus(s, text, { schreiben: true });   // lesend
                else { e = await mitRest(fuehreSchrittAus(s, text, {}), ende); if (e && e.zeit) { stopp = { art: 'zeit' }; break; } }
                versucht++; schritte.push(e);
            }
            if (name === 'termin_verschieben') { versucht++; schritte.push(e); }
            if (e.grund === 'doppelt') { doppelt++; continue; }
            if (e.status === 'SUCCESS' && e.ausgefuehrt) {
                erledigt.push(e.nachricht || ('Erledigt: ' + LESBAR[name] + '.'));
                if (name === 'ortssuche') { if (e.daten && Array.isArray(e.daten.cards)) kartenListe = kartenListe.concat(e.daten.cards); gespraechMerken({ schritte: [e] }); }   // sofort merken: ein späterer Schritt (Kontakt speichern) braucht den gefundenen Ort
                if (name === 'produktsuche' && e.daten && Array.isArray(e.daten.cards)) kartenListe = kartenListe.concat(e.daten.cards);
                continue;
            }
            if (e.status === 'NEEDS_INFORMATION') { stopp = { art: 'info', name: name, frage: e.nachricht || frageNach((e.fehlend || [])[0]) }; break; }
            if (e.status === 'NEEDS_CONFIRMATION' && !ja) { stopp = { art: 'pause', pausenArt: 'bestaetigung', was: 'ja', name: name, frage: e.nachricht, index: i }; break; }
            stopp = { art: 'fehler', name: name, nachricht: e.nachricht || '', ausgefuehrt: !!e.ausgefuehrt, status: e.status }; break;
        }
        if (gen !== kiGen && !(st.begonnen && erledigt.length)) return { art: 'ueberholt', geschrieben: st.begonnen };
        var rest = stopp && plan.schritte.length > versucht;
        if (!stopp && doppelt && doppelt === plan.schritte.length) return { art: 'still' };
        if (stopp && !keinFall && !st.begonnen && !erledigt.length && (stopp.art === 'zeit' || (stopp.art === 'fehler' && !stopp.ausgefuehrt))) return { art: 'rueckfall' };   // noch nichts geschrieben: der bisherige Weg darf übernehmen
        var teile = [], offenKiNeu = null, codes = [], pauseNeu = null;
        if (erledigt.length) teile.push((stopp ? 'Erledigt: ' : '') + erledigt.join(' ')), codes.push('schreiben_ausgefuehrt');
        if (stopp && stopp.art === 'pause') {
            codes.push(stopp.pausenArt === 'bestaetigung' ? 'bestaetigung_gefragt' : 'pause_frage');
            teile.push(stopp.frage + (stopp.pausenArt === 'bestaetigung' ? ' Sag Ja oder Nein.' : ''));
            pauseNeu = { at: jetzt(), art: stopp.pausenArt, was: stopp.was, plan: plan, index: stopp.index, text: text, erledigt: erledigt.slice(), zusatz: stopp.zusatz || {}, frage: stopp.frage, nochmal: false, resolved: stopp.resolved || null, ueberschreiben: stopp.ueberschreiben === true, begonnen: st.begonnen === true };
        } else if (stopp) {
            codes.push('schreiben_gestoppt');
            if (stopp.art === 'info') {
                teile.push(stopp.frage);
                if (!erledigt.length && !st.begonnen) offenKiNeu = { at: jetzt(), text: text, frage: stopp.frage, schreibend: true };
                else teile.push('Sag den Rest bitte noch einmal neu, dann mache ich weiter.');
            } else if (stopp.art === 'bestaetigung') {
                codes.push('schreiben_bestaetigung');
                teile.push('Dafür bräuchte ich deine ausdrückliche Bestätigung, die ich auf diesem Weg noch nicht einholen kann. Dort habe ich nichts geändert.' + (rest ? ' Die weiteren Schritte habe ich nicht ausgeführt.' : ''));
            } else if (stopp.art === 'ueberholt') teile.push('Wegen deines neuen Satzes habe ich die weiteren Schritte nicht mehr ausgeführt.');
            else if (stopp.art === 'zeit') teile.push('Das hat zu lange gedauert, deshalb habe ich die weiteren Schritte nicht mehr ausgeführt.');
            else teile.push('Bei „' + (LESBAR[stopp.name] || stopp.name.replace(/_/g, ' ')) + '“ hat es nicht geklappt.' + (stopp.nachricht ? ' ' + stopp.nachricht : '') + ' Ich habe nichts wiederholt' + (rest ? ' und die weiteren Schritte nicht mehr ausgeführt' : '') + '.');
        }
        return { art: 'schreib', text: teile.join(' '), karten: kartenListe.slice(0, 5), offenKi: offenKiNeu, pause: pauseNeu, codes: codes, ok: !stopp || !!pauseNeu, teilerfolg: !!stopp && !pauseNeu && erledigt.length > 0, schritte: schritte };
    }

    async function ausfuehrenKI(plan, text, gen, ende, st) {
        if (plan.schritte.some(function (x) { return B2A_NEU.indexOf(x.faehigkeit) >= 0 || B2B_NAMEN.indexOf(x.faehigkeit) >= 0; })) return ausfuehrenSchreibend(plan, text, gen, ende, st || { begonnen: false });
        var einzel = plan.schritte.length === 1, teile = [], kartenListe = [], erfolge = [], fehl = [], schritte = [], ki = 0, frage = '', frageCode = '', offenNeu = null, ortsFehler = '', leer = 0, doppelt = 0, fahrFehler = '';
        for (var i = 0; i < plan.schritte.length; i++) {
            var s = plan.schritte[i];
            if (s.faehigkeit === 'websuche') { kiZaehler.websuchen++; ki++; } else if (s.faehigkeit === 'wetter') kiZaehler.wetter++; else if (s.faehigkeit === 'produktsuche') kiZaehler.produktsuchen++; else if (s.faehigkeit === 'ortssuche') kiZaehler.ortssuchen++;
            var sa = s;
            if (s.aus) {   // Kette: Angaben aus dem geprüften Ergebnis eines früheren Schritts
                var la = loeseAus(s, schritte);
                if (la.fehler) { var ea = { faehigkeit: s.faehigkeit, status: 'TOOL_FAILED', ausgefuehrt: false, trocken: false, nachricht: '', fehlend: [], nurGeplant: false, grund: 'uebernahme' }; schritte.push(ea); fehl.push(s.faehigkeit); continue; }
                sa = { faehigkeit: s.faehigkeit, params: la.params };
            }
            var e = await mitRest(fuehreSchrittAus(sa, text, {}), ende);
            if (e && e.zeit) return { art: 'zeit', ki: ki };
            if (e && (e.status === 'TOOL_FAILED' || e.status === 'CAPABILITY_MISSING') && e.grund !== 'doppelt') {   // sicherer, lesender Fallback aus der Registry (höchstens einer je Schritt)
                var fb = fallbackFuer(s.faehigkeit, text, plan.schritte.map(function (x) { return x.faehigkeit; }));
                if (fb) {
                    kiZaehler.websuchen++; ki++;
                    var e2 = await mitRest(fuehreSchrittAus(fb, text, {}), ende);
                    if (e2 && e2.zeit) return { art: 'zeit', ki: ki };
                    if (e2 && e2.status === 'SUCCESS' && e2.ausgefuehrt && e2.nachricht) { e2.fallbackVon = s.faehigkeit; e = e2; }
                }
            }
            schritte.push(e);
            if (e.grund === 'doppelt') { doppelt++; continue; }
            if (e.status === 'NEEDS_INFORMATION' && einzel) { frage = plan.frage || e.nachricht; frageCode = 'rueckfrage'; offenNeu = { schritt: i, parameter: e.fehlend[0], plan: plan, text: text }; break; }
            if (e.status === 'NO_RESULTS' && einzel && s.faehigkeit === 'ortssuche') { frage = 'Dazu habe ich nichts gefunden. In welchem Ort soll ich suchen?'; frageCode = 'keine_treffer'; offenNeu = { schritt: i, parameter: 'ort', plan: plan, text: text }; break; }
            if (e.status === 'NO_RESULTS') { leer++; teile.push(e.nachricht || 'Dazu habe ich nichts gefunden.'); continue; }
            if (e.status === 'SUCCESS' && e.ausgefuehrt && e.nachricht) {
                erfolge.push(e.fallbackVon ? e.faehigkeit : s.faehigkeit); teile.push(e.nachricht);
                if (e.daten && Array.isArray(e.daten.cards)) kartenListe = kartenListe.concat(e.daten.cards);
                continue;
            }
            fehl.push(s.faehigkeit);
            if (s.faehigkeit === 'ortssuche' && e.nachricht) ortsFehler = e.nachricht;
            if (s.faehigkeit === 'fahrzeit' || s.faehigkeit === 'abfahrt') fahrFehler = e.nachricht || notiz(s.faehigkeit);   // Fahrzeit: die ehrliche Meldung des Werkzeugs sagen, nie eine Schätzung (kein Rückfall in den KI-Weg)
        }
        if (gen !== kiGen) return { art: 'ueberholt', ki: ki };
        if (frage) return { art: 'frage', frage: frage, frageCode: frageCode, offenNeu: offenNeu, schritte: schritte, ki: ki };
        if (doppelt && doppelt === plan.schritte.length) return { art: 'still', ki: ki };
        if (teile.length) {
            var text2 = teile.join(' ') + (fehl.length ? ' ' + fehl.map(notiz).join(' ') : '');
            return { art: 'gesagt', text: text2, karten: kartenListe.slice(0, 5), erfolge: erfolge, fehl: fehl, leer: leer, schritte: schritte, ki: ki };
        }
        if (fahrFehler) return { art: 'gesagt', text: fahrFehler, karten: [], erfolge: [], fehl: fehl, leer: 0, schritte: schritte, ki: ki, fahrFehler: true };
        if (ortsFehler) return { art: 'gesagt', text: ortsFehler, karten: [], erfolge: [], fehl: fehl, leer: 0, schritte: schritte, ki: ki, ortsFehler: true };
        return { art: 'rueckfall', ki: ki };
    }


    /* ---------- Paket B2b-1: Antworten auf eine offene Rückfrage/Bestätigung ---------- */
    var RX_NEIN = /^(?:nein|nee|ne|noe|nicht|abbrechen|abbruch|stopp|stop|lass(?: es)?|vergiss es|auf keinen fall|bloss nicht|doch nicht)\b/;
    var RX_JA = /^(?:ja|jawohl|jep|jo|joa|jup|klar|genau|okay|ok|gerne|gern|natuerlich|sicher|bitte|passt|stimmt|richtig|mach das|mach es|machs|mach|verschieb(?:e)? (?:es|ihn)|ersetz\w*|speicher\w*)\b/;
    var RX_ABER = /\b(aber|nicht|lieber|statt|sondern|doch|vielleicht|eigentlich|oder|und)\b/;
    function jaNein(text) {   // 'ja' | 'nein' | 'unklar' (kurz, aber nicht eindeutig) | 'neu' (ein neuer Satz)
        var n = nz(text).replace(/[.]+$/, ''), w = n ? n.split(' ').length : 0;
        if (!n || w > 5) return 'neu';
        if (RX_NEIN.test(n) && !RX_JA.test(n)) return 'nein';
        if (RX_JA.test(n) && w <= 4 && !RX_ABER.test(n)) return 'ja';
        if (w <= 3 && !RX_B2A.test(n) && !RX_VERSCHIEBEN.test(n) && !RX_KI_VORFILTER.test(n)) return 'unklar';
        return 'neu';
    }
    function ausgabeSchreib(r, plan, eingang) {
        r.codes.forEach(function (c) { vermerke(eingang, c); });
        if (plan.schritte.length > 1) vermerke(eingang, 'mehrere_schritte');
        if (r.karten && r.karten.length) karten(r.karten);
        if (r.offenKi) { frageAnmelden(); offenKi = r.offenKi; }
        if (r.pause) { frageAnmelden(); offenKi = null; offen = null; pause = r.pause; frageAnmelden(true); }
        say(r.text); protokolliere('ki', plan.schritte.map(function (x) { return x.faehigkeit; }), r.pause ? 'PAUSE' : r.ok ? 'SUCCESS' : (r.teilerfolg ? 'TEILERFOLG' : 'GESTOPPT'));
    }
    async function pauseFortsetzen(p, zus, gen, eingang) {
        var st = { begonnen: p.begonnen === true }, t0 = jetzt();
        try {
            var r = await ausfuehrenSchreibend(p.plan, p.text, gen, t0 + GESAMT_MS, st, { ab: p.index, erledigt: p.erledigt, zusatz: Object.assign({}, p.zusatz, zus || {}), bestaetigt: p.art === 'bestaetigung', resolved: p.resolved, ueberschreibenOk: p.ueberschreiben === true });
            if (r.art === 'schreib') ausgabeSchreib(r, p.plan, eingang);
            else if (r.art === 'ueberholt') { vermerke(eingang, 'ki_ueberholt'); protokolliere('ki_ueberholt', [], 'VERWORFEN'); }
            else if (r.art === 'still') { vermerke(eingang, 'doppelt_verhindert'); }
            else { vermerke(eingang, 'schritt_fehler'); say('Das hat nicht geklappt. ' + (st.begonnen ? 'Bitte prüfe, was davon schon gespeichert wurde. ' : 'Ich habe nichts geändert. ') + 'Ich habe nichts wiederholt.'); }
        } catch (e) {
            vermerke(eingang, 'ki_fehler'); protokolliere('ki_zurueck', [], 'FEHLER');
            say('Dabei ist etwas schiefgelaufen. Bitte prüfe im Kalender und in deinen Listen, ob schon etwas geändert wurde. Ich habe nichts wiederholt.');
        }
    }
    function pauseAbbruch(p, code) {
        var rest = p.plan.schritte.length - p.index - 1, was = p.plan.schritte[p.index] && p.plan.schritte[p.index].faehigkeit === 'termin_verschieben' ? 'verschoben' : 'geändert';
        say('Alles klar, ich habe nichts ' + was + '.' + (p.erledigt.length ? ' Schon erledigt war: ' + p.erledigt.join(' ') : '') + (rest > 0 ? ' Die weiteren Schritte habe ich nicht ausgeführt.' : ''));
        vermerke(neuerEingang('rueckfrage_antwort'), code);
    }
    /* true = die Antwort gehörte zur offenen Rückfrage und ist erledigt; false = nicht unsere Sache (die Rückfrage ist dann beendet) */
    function pauseAntwort(text) {
        var p = pause; if (!p) return false;
        var antwort = jaNein(text), frisch = jetzt() - p.at <= PAUSE_MS, unsere = jungeFrageGehoertUns();
        if (!frisch || !unsere) {
            pause = null;
            if (!frisch && unsere && p.art === 'bestaetigung' && (antwort === 'ja' || antwort === 'nein')) { say('Die Rückfrage ist abgelaufen, ich habe nichts geändert. Sag es bitte noch einmal.'); vermerke(neuerEingang('rueckfrage_antwort'), 'bestaetigung_abgelaufen'); return true; }
            return false;
        }
        function nochmal(zusatz) {
            if (!p.nochmal) { p.nochmal = true; frageAnmelden(true); say('Das habe ich nicht eindeutig verstanden. ' + p.frage + (p.art === 'bestaetigung' ? ' Bitte sag Ja oder Nein.' : '')); vermerke(neuerEingang('rueckfrage_antwort'), 'bestaetigung_unklar'); return true; }
            pause = null; say('Ich habe dich nicht eindeutig verstanden, deshalb habe ich nichts geändert. Sag es bitte noch einmal.'); vermerke(neuerEingang('rueckfrage_antwort'), 'abgebrochen'); return true;
        }
        if (antwort === 'nein') { pause = null; kiGen++; pauseAbbruch(p, p.art === 'bestaetigung' ? 'bestaetigung_nein' : 'abgebrochen'); return true; }
        if (p.art === 'bestaetigung') {
            if (antwort === 'ja') { pause = null; var gen = ++kiGen, eing = neuerEingang('rueckfrage_antwort'); vermerke(eing, 'bestaetigung_ja'); pauseFortsetzen(p, {}, gen, eing); return true; }   // pause ist VOR dem Ausführen leer: ein zweites "Ja" kann nichts doppelt auslösen
            if (antwort === 'unklar') return nochmal();
            pause = null; vermerke(neuerEingang('bestaetigung_ersetzt'), 'bestaetigung_ersetzt'); return false;   // ein neuer, unabhängiger Befehl beendet die Bestätigung; er läuft normal weiter
        }
        var zus = null;
        if (p.was === 'zeit') { var z = leseZiel(text, true); if (z) zus = { ziel: z }; }
        else if (p.was === 'wahl') { var o = ordinalAus(nz(text), true); if (o) zus = { nummer: o }; }
        else if (p.was === 'suche') { var sn = String(text).trim().replace(/[.!?]+$/, ''); if (sn && sn.split(/\s+/).length <= 6 && !RX_VERSCHIEBEN.test(sn) && antwort !== 'ja' && saubereSuche(sn)) zus = { suche: sn }; }
        if (zus) { pause = null; var g2 = ++kiGen, e2 = neuerEingang('rueckfrage_antwort'); pauseFortsetzen(p, zus, g2, e2); return true; }
        if (antwort === 'unklar' || antwort === 'ja') return nochmal();
        pause = null; vermerke(neuerEingang('bestaetigung_ersetzt'), 'bestaetigung_ersetzt'); return false;
    }

    async function kiEntscheideImSprachweg(text, gen, eingang, kontext, ohneFrage, ortBezug, mehr, versch) {
        var zurueck = false, ctrl = null, timer = null, t0 = jetzt(), kiN = 1, st = { begonnen: false }, keinRueck = versch === true;   // 1 = die Entscheider-Anfrage selbst; st.begonnen = es wurde schon geschrieben; keinRueck = Verschieben: nie zurück zum alten KI-Weg (er würde ohne Bestätigung verschieben)
        function zurueckInsNormale() {
            if (zurueck) return;                      // nur einmal
            if (st.begonnen) return;                  // B2a: nach einer Schreibaktion NIE zurück zum alten KI-Weg (er könnte dasselbe noch einmal schreiben)
            if (gen !== kiGen) { vermerke(eingang, 'ki_ueberholt'); return; }   // und nur, wenn der Satz nicht überholt wurde
            if (keinRueck) { zurueck = true; vermerke(eingang, 'verschieben_unklar'); say(st.begonnen ? 'Dabei ist etwas schiefgelaufen. Ich habe nichts wiederholt.' : TEXT_VERSCHIEBEN); return; }
            zurueck = true; kiZaehler.zurueck++; kiN++; vermerke(eingang, 'rueckfall');
            if (mehr) {   // mehrteiliger Satz, nichts geschrieben: erst darf der feste Befehl, den wir vorgezogen haben, wie bisher antworten
                try { if (typeof handleLocalCommand === 'function' && handleLocalCommand(text)) { vermerke(eingang, 'befehl_vorrang'); return; } } catch (e) { }
            }
            try { if (typeof window.sendToGroqSmart === 'function') window.sendToGroqSmart(text); } catch (e) { }
        }
        try {
            try { ctrl = (typeof AbortController === 'function') ? new AbortController() : null; } catch (e) { ctrl = null; }
            var limit = new Promise(function (_, reject) { timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) { } reject(new Error('Zeitlimit')); }, KI_ZEITLIMIT_MS); });
            if (ortBezug) {   // "dort"/"da": erst prüfen, ob der gemerkte Name wirklich ein Ort ist; sonst fragen, nie den eigenen Standort einsetzen
                var ortOk = (/\\b(?:arbeitsweg|weg\\s+zur\\s+arbeit|zur\\s+arbeit)\\b/i.test(text) && (typeof workAddress === 'string' ? workAddress : '').trim() === ortBezug) || ((ortMerker && ortMerker.name === ortBezug && ortMerker.geprueft === true) ? true : await ortPruefen(ortBezug));
                if (gen !== kiGen) { try { clearTimeout(timer); } catch (e) { } protokolliere('ki_ueberholt', [], 'VERWORFEN'); vermerke(eingang, 'ki_ueberholt'); return; }
                if (!ortOk) {
                    try { clearTimeout(timer); } catch (e) { }
                    ortMerker = null; vermerke(eingang, 'ort_unklar'); protokolliere('ki_nachfrage', [], 'FRAGE');
                    frageAnmelden(); offenKi = { at: jetzt(), text: text, frage: 'Welchen Ort meinst du?', bezug: true }; say('Welchen Ort meinst du?'); return;
                }
                if (ortMerker && ortMerker.name === ortBezug) ortMerker.geprueft = true;
                vermerke(eingang, 'ort_bezug');
                kontext = (kontext ? kontext + ' ' : '') + 'Mit „dort“, „da“ oder „in dieser Stadt“ ist ' + ortBezug + ' gemeint (params.ort = "' + ortBezug + '").';
            }
            // Der KI-Planer muss den gespeicherten Arbeitsort ebenfalls kennen.
            // Nur bei einer ausdrücklichen Verkehrsfrage zum Arbeitsweg, niemals als allgemeines Reiseziel.
            if (/\b(?:verkehr\w*|stau\w*|sperrung\w*)\b/i.test(text) &&
                /\b(?:weg\s+zur\s+arbeit|arbeitsweg|fahrt\s+zur\s+arbeit|zur\s+arbeit)\b/i.test(text)) {
                var arbeitsziel = (typeof workAddress === 'string' ? workAddress : '').trim();
                if (arbeitsziel) kontext = (kontext ? kontext + ' ' : '') + 'Für diese Verkehrsfrage ist das gespeicherte Ziel Arbeit: ' + JSON.stringify(arbeitsziel) + '. Nutze fahrzeit mit params.ziel gleich dieser Adresse; frage nicht erneut nach dem Ziel.';
            }
            var sende = sendeFunktion || sendeStandard;
            var entsch = kiEntscheider(function (m) { return Promise.race([Promise.resolve(sende(m, ctrl ? ctrl.signal : undefined)), limit]); }, KI_PLAN, kontext);
            var pr = await Promise.race([plane(text, { entscheider: entsch }), limit.catch(function () { return { ok: false, zeitlimit: true }; })]);
            try { clearTimeout(timer); } catch (e) { }
            if (gen !== kiGen) { protokolliere('ki_ueberholt', [], 'VERWORFEN'); vermerke(eingang, 'ki_ueberholt'); return; }
            if (ortBezug && pr && pr.ok && pr.plan) ortEinsetzen(pr.plan, ortBezug);
            if (pr && pr.ok && pr.plan) pr.plan.schritte.forEach(function (x) { if (x.faehigkeit === 'termin_verschieben' && x.params) { var np = {}; ['suche', 'tag'].forEach(function (k) { if (x.params[k] !== undefined) np[k] = x.params[k]; }); if (np.tag !== undefined && !/^(?:heute|morgen|uebermorgen|übermorgen|\d{4}-\d{2}-\d{2})$/i.test(String(np.tag).trim())) delete np.tag; x.params = np; } });   // die neue Zeit kommt nie vom Planer
            var hatV = !!(pr && pr.ok && pr.plan && pr.plan.schritte.some(function (x) { return x.faehigkeit === 'termin_verschieben'; }));
            if (hatV) keinRueck = true;
            if (versch && !hatV && !(pr && pr.ok && pr.plan && pr.plan.schritte.length > 0)) {   // Wunsch klar, Planer hat aber nichts geliefert: gezielt nach dem Termin fragen (nichts wird geraten oder geändert)
                pr = { ok: true, plan: { absicht: '', schritte: [{ faehigkeit: 'termin_verschieben', params: {} }], frage: '', hinweis: '', benoetigt: [] } }; hatV = true; keinRueck = true;
            }
            if (versch && !hatV && !(pr && pr.ok && pr.plan && pr.plan.schritte.length === 0 && pr.plan.frage && planErlaubt(pr.plan, ohneFrage))) {   // Verschiebe-Wunsch nicht sicher erkannt: nichts tun, KEIN Rückfall auf den alten Weg
                vermerke(eingang, 'verschieben_unklar'); protokolliere('verschieben_gesperrt', [], 'UNKLAR'); say(TEXT_VERSCHIEBEN); return;
            }
            if (pr && pr.ok && pr.plan) pr.plan.schritte.forEach(function (x) {   // "von Schwarzenbek zum ...": nennt der Nutzer einen Startort, den der Planer weggelassen hat, wird er aus dem Satz übernommen (sonst würde der Standort als Start benutzt)
                if (x.faehigkeit === 'fahrzeit' && x.params && x.params.von === undefined) { var mv = String(text).match(RX_VON); if (mv && saubererBegriff(mv[1].trim())) x.params.von = mv[1].trim(); }
            });
            var schreibOhneWunsch = !!(pr && pr.ok && pr.plan && !RX_B2A.test(text) && pr.plan.schritte.some(function (x) { return B2A_SCHREIBT.indexOf(x.faehigkeit) >= 0; }));   // Phase 5: schreiben nur, wenn der Nutzer es ausdrücklich verlangt hat (Erinnerung, Termin, Aufgabe, Kontakt, Merken); sonst übernimmt der bisherige Weg
            var fahrtOhneWerkzeug = !!(pr && pr.ok && pr.plan && RX_FAHRT.test(text) && pr.plan.schritte.some(function (x) { return x.faehigkeit === 'websuche'; }) && !pr.plan.schritte.some(function (x) { return x.faehigkeit === 'fahrzeit'; }));   // Fahrzeit/Verkehr nie per Websuche (das wäre nur eine Schätzung): der bisherige Weg hat die echte Routenberechnung
            var abfahrtMitFahrzeit = !!(pr && pr.ok && pr.plan && (RX_ABFAHRT.test(text) || RX_ANKUNFT.test(text)) && pr.plan.schritte.some(function (x) { return x.faehigkeit === 'fahrzeit'; }));   // ein Plan, der eine Abfahrtsfrage nur mit der Fahrdauer beantworten würde
            if (!pr || !pr.ok || schreibOhneWunsch || fahrtOhneWerkzeug || abfahrtMitFahrzeit || !planErlaubt(pr.plan, ohneFrage)) {
                vermerke(eingang, !pr ? 'ki_fehler' : (pr.zeitlimit || pr.grund === 'Zeitlimit') ? 'ki_zeitlimit' : pr.fehler ? 'ki_fehler' : !pr.ok ? 'ki_ungueltig'
                    : (pr.plan.schritte.length === 0 && !pr.plan.frage) ? 'ki_kein_ortswunsch' : abfahrtMitFahrzeit ? 'abfahrt_alter_weg' : 'ki_nicht_erlaubt');
                protokolliere('ki_zurueck', [], pr && pr.zeitlimit ? 'ZEITLIMIT' : (pr && pr.ok ? 'KEIN_ORTSWUNSCH' : 'UNGUELTIG')); zurueckInsNormale(); return; }
            if (mehr && pr.plan.schritte.length) {   // der Planer muss ALLE ausdrücklich verlangten Aktionen erkannt haben, sonst wird VOR dem Schreiben angehalten und erklärt (nichts halb erledigt)
                var fehlt = mehrGruppen(text).filter(function (gi) { return !pr.plan.schritte.some(function (x) { return MEHR_FAEHIG[gi].indexOf(x.faehigkeit) >= 0; }); });
                if (fehlt.length) {
                    vermerke(eingang, 'auftrag_unvollstaendig'); protokolliere('ki_gestoppt', pr.plan.schritte.map(function (x) { return x.faehigkeit; }), 'UNVOLLSTAENDIG');
                    say('Ich konnte nicht alles aus deinem Auftrag sicher erkennen (' + fehlt.map(function (gi) { return MEHR_NAMEN[gi]; }).join(', ') + ' fehlt). Deshalb habe ich nichts ausgeführt. Sag es bitte noch einmal, am besten Schritt für Schritt.'); return;
                }
            }
            if (!istAn) { vermerke(eingang, 'ausgeschaltet'); zurueckInsNormale(); return; }                 // inzwischen ausgeschaltet: der Satz geht den bisherigen Weg
            var plan = pr.plan;
            if (!plan.schritte.length) {                                  // unklarer Wunsch: EINE kurze Rückfrage, sonst nichts
                vermerke(eingang, 'ki_nachfrage'); protokolliere('ki_nachfrage', [], 'FRAGE');
                frageAnmelden(); offenKi = { at: jetzt(), text: text, frage: plan.frage }; say(plan.frage); return;
            }
            var r = await ausfuehrenKI(plan, text, gen, t0 + GESAMT_MS, st);
            kiN += r.ki || 0;
            if (r.art === 'ueberholt') { protokolliere('ki_ueberholt', [], r.geschrieben ? 'VERWORFEN_NACH_SCHREIBEN' : 'VERWORFEN'); vermerke(eingang, 'ki_ueberholt'); return; }
            if (r.art === 'schreib') { ausgabeSchreib(r, plan, eingang); return; }   // B2a/B2b-1: EINE zusammenfassende Antwort, ehrlich auch bei Teilerfolg; ggf. mit offener Bestätigung
            if (r.art === 'zeit') { vermerke(eingang, 'budget_ueberschritten'); protokolliere('ki_zurueck', [], 'ZEITBUDGET'); zurueckInsNormale(); return; }
            if (r.art === 'still') { vermerke(eingang, 'doppelt_verhindert'); protokolliere('ki', [], 'DOPPELT'); return; }
            if (r.art === 'rueckfall') { vermerke(eingang, 'schritt_fehler'); protokolliere('ki_zurueck', plan.schritte.map(function (x) { return x.faehigkeit; }), 'FEHLER'); zurueckInsNormale(); return; }
            if (plan.schritte.length > 1) vermerke(eingang, 'mehrere_schritte');
            if (r.art === 'frage') {
                vermerke(eingang, r.frageCode); frageAnmelden();
                offen = { at: jetzt(), parameter: r.offenNeu.parameter, plan: r.offenNeu.plan, text: r.offenNeu.text };
                say(r.frage); protokolliere('ki', plan.schritte.map(function (x) { return x.faehigkeit; }), 'FRAGE'); return;
            }
            r.erfolge.filter(function (n, k, a) { return a.indexOf(n) === k; }).forEach(function (n) { vermerke(eingang, n + '_ausgefuehrt'); });
            if (!r.erfolge.length) vermerke(eingang, r.leer ? 'keine_treffer' : 'fehler_suche');
            if (r.fehl.length && !r.ortsFehler) vermerke(eingang, 'schritt_fehler');
            gespraechMerken({ schritte: r.schritte });
            var letzter = r.erfolge.length ? r.erfolge[r.erfolge.length - 1] : '';
            if (letzter === 'wetter') { var ws = plan.schritte.filter(function (x) { return x.faehigkeit === 'wetter'; })[0]; thema = { art: 'wetter', tag: String((ws.params && ws.params.tag) || 'heute').toLowerCase().replace('ü', 'ue'), ort: String((ws.params && ws.params.ort) || '').slice(0, 40), at: jetzt() }; if (ws.params && ws.params.ort) ortMerken(String(ws.params.ort), true); }
            else if (letzter === 'websuche') thema = { art: 'web', at: jetzt() };
            else if (letzter === 'produktsuche') thema = { art: 'web', at: jetzt() };
            else if (letzter === 'ortssuche') { var os = plan.schritte.filter(function (x) { return x.faehigkeit === 'ortssuche'; })[0]; thema = { art: 'orte', begriff: String(os.params.suchbegriff).slice(0, 40), at: jetzt() }; if (os.params.ort) ortMerken(String(os.params.ort), true); }
            if (r.karten && r.karten.length) karten(r.karten);
            say(r.text);                                                  // EINE zusammenhängende Antwort
            protokolliere('ki', plan.schritte.map(function (x) { return x.faehigkeit; }), 'SUCCESS');
        } catch (e) {
            try { clearTimeout(timer); } catch (x) { }
            vermerke(eingang, 'ki_fehler'); protokolliere('ki_zurueck', [], 'FEHLER');
            if (st.begonnen) say('Dabei ist etwas schiefgelaufen. Bitte prüfe, was davon schon gespeichert wurde. Ich habe nichts wiederholt.'); else zurueckInsNormale();
        } finally {
            setzeMessung(eingang, jetzt() - t0, kiN);
        }
    }

    /* Haken im echten Sprachweg: true = die Chef-KI hat den Satz übernommen (läuft asynchron weiter und fällt im Zweifel genau einmal auf den bisherigen Ablauf zurück). */
    function kiWeg(text, mehr) {
        if (!istAn) return false;                                              // AUS: nichts, kein Netz
        try {
            vomChefBehandelt = 0;
            if (typeof text !== 'string') return false;
            if (pause && pauseAntwort(text)) return true;   // B2b-1: Antwort auf eine offene Rückfrage/Bestätigung (Ja/Nein, Zeit, "den zweiten", ...)
            var ortNeu = '';
            var ks = ortKandidaten(text);   // Gesprächsort: genau ein Ort im Satz = merken, mehrere = keinen annehmen
            if (ks.length === 1) ortMerken(ks[0], false); else if (ks.length > 1) ortMerker = null;
            var t = text.trim(), woerter = t ? t.split(/\s+/).length : 0, kopf = '';
            /* offene Rückfrage des KI-Weges: die kurze Antwort gehört zur ursprünglichen Frage (beides zusammen geht an den Entscheider) */
            if (offenKi && jetzt() - offenKi.at <= FRAGE_MS && jungeFrageGehoertUns()) {
                var f = offenKi; offenKi = null;
                if (/^\s*(nein|nee|abbrechen|lass(?: es)?|vergiss es|egal)\b/i.test(t)) { neuerEingang('nachfrage_antwort'); vermerke(eingaenge[eingaenge.length - 1], 'abgebrochen'); say('Alles klar, ich lasse es.'); return true; }
                if (woerter >= 1 && woerter <= 8 && (!RX_SCHREIB.test(t) || f.schreibend)) {
                    if (f.bezug) {   // Antwort auf "Welchen Ort meinst du?": der Ort ersetzt "dort" im ursprünglichen Satz
                        var on = ortAusAntwort(t);
                        if (!on) { neuerEingang('nachfrage_antwort'); vermerke(eingaenge[eingaenge.length - 1], 'abgebrochen'); say('Den Ort habe ich nicht verstanden. Nenne mir bitte den Namen der Stadt.'); return true; }
                        ortMerken(on, false); ortNeu = on;
                        t = f.text.replace(RX_ORTSBEZUG_G, 'in ' + on); kopf = 'nachfrage_antwort';
                    } else { t = f.text + ' ' + t; kopf = 'nachfrage_antwort'; }
                }
            } else if (offenKi) offenKi = null;
            if (RX_VERSCHIEBEN.test(t)) {   // B2b-1: Verschieben immer über die Chef-KI mit Bestätigung; NIE zum alten KI-Weg (er verschiebt ohne Rückfrage)
                var nV = jetzt();
                if (kiLetzter.text === t && nV - kiLetzter.at < DOPPELT_MS) { neuerEingang('vorfilter_doppelt'); return true; }
                kiLetzter = { text: t, at: nV };
                var genV = ++kiGen; kiZaehler.anfragen++;
                var eingV = neuerEingang(kopf || 'ki_aufgerufen'); if (kopf) vermerke(eingV, 'ki_aufgerufen');
                try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Verarbeite Anweisung...'); } catch (e) { }
                kiEntscheideImSprachweg(t, genV, eingV, kontextText(), kopf === 'nachfrage_antwort', '', mehr === true, true).catch(function () { });
                return true;
            }
            if (window.jvProdukte && (window.jvProdukte.produktsuche(t) || window.jvProdukte.istFolgefrage(t))) { neuerEingang('produktsuche'); return false; }   // Produktwunsch mit Kauf-/Preisfrage: kein Ortsplan, die Internetsuche mit Produktkarten übernimmt
            var anschluss = !kopf && themaFrisch() && woerter >= 1 && woerter <= 8 && RX_FOLGE.test(t) && !RX_SCHREIB.test(t);
            if (anschluss) kopf = 'anschluss';
            if (kopf !== 'nachfrage_antwort' && RX_ABFAHRT.test(t) && !RX_B2A.test(t) && !(R() && R().hole('abfahrt'))) { neuerEingang('abfahrtsfrage'); return false; }   // ohne das Werkzeug abfahrt: kein Planer-Aufruf, der bisherige Abfahrtsweg antwortet
            if (!kopf && (woerter < 3 || woerter > 30 || t.length > 240)) { neuerEingang('vorfilter_laenge'); return false; }
            if (!kopf && !RX_B2A.test(t) && !RX_KI_VORFILTER.test(t) && !RX_ABFAHRT.test(t) && !RX_ANKUNFT.test(t)) { neuerEingang('vorfilter_stichwort'); return false; }
            if (!R() || !R().hole('ortssuche')) { neuerEingang('faehigkeit_fehlt'); return false; }
            /* "dort"/"da"/"in dieser Stadt" ohne genannten Ort im Satz: gemerkten Ort nehmen, sonst FRAGEN (nie still den eigenen Standort) */
            var ortBezug = ortNeu;   // Antwort auf "Welchen Ort meinst du?": der genannte Ort wird (nach Prüfung) fest in den Plan eingesetzt
            if (kopf !== 'nachfrage_antwort' && ks.length === 0) {
                if (RX_ORTSBEZUG.test(t) && !(RX_DA_SEIN.test(t) && RX_ZIEL_IM_SATZ.test(t) && (RX_ABFAHRT.test(t) || RX_ANKUNFT.test(t)) && R() && R().hole('abfahrt'))) {   // "Ich muss zu meiner Mutter. Um 14:33 Uhr da sein. Wann losfahren?": "da" ist das genannte Ziel, keine Ortsrückfrage
                    // Ein ausdrücklicher Arbeitsweg im selben Satz macht „dort“ eindeutig.
                    // Die gespeicherte Arbeitsadresse ist kein allgemeiner Gesprächsort.
                    var arbeitsBezug = /\\b(?:arbeitsweg|weg\\s+zur\\s+arbeit|zur\\s+arbeit)\\b/i.test(t) &&
                        /\\b(?:wetter|regen|temperatur)\\b/i.test(t) &&
                        (typeof workAddress === 'string' ? workAddress : '').trim();
                    if (arbeitsBezug) ortBezug = arbeitsBezug;
                    else if (ortFrisch()) ortBezug = ortMerker.name;
                    else {
                        neuerEingang('ort_unklar'); frageAnmelden();
                        offenKi = { at: jetzt(), text: t, frage: 'Welchen Ort meinst du?', bezug: true };
                        say('Welchen Ort meinst du?'); return true;
                    }
                } else if (kopf === 'anschluss' && thema && thema.art === 'wetter' && thema.ort) ortBezug = thema.ort;   // "und morgen?" nach Wetter für einen Ort
            }
            var n = jetzt();
            if (kiLetzter.text === t && n - kiLetzter.at < DOPPELT_MS) { neuerEingang('vorfilter_doppelt'); return false; }   // derselbe Satz kurz hintereinander: keine zweite Anfrage
            kiLetzter = { text: t, at: n };
            var gen = ++kiGen;                                                  // ein neuer Satz überholt einen noch laufenden
            kiZaehler.anfragen++;
            var eingang = neuerEingang(kopf || 'ki_aufgerufen');
            if (kopf) vermerke(eingang, 'ki_aufgerufen');
            try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Verarbeite Anweisung...'); } catch (e) { }
            kiEntscheideImSprachweg(t, gen, eingang, kontextText(), kopf === 'nachfrage_antwort', ortBezug, mehr === true).catch(function () { });
            return true;
        } catch (e) { return false; }
    }

    function schalten(an) { istAn = !!an; if (!istAn) { pause = null; offen = null; offenKi = null; thema = null; ortMerker = null; } try { if (window.localStorage) { if (istAn) window.localStorage.setItem('jv_chef', '1'); else window.localStorage.removeItem('jv_chef'); } } catch (e) { } zeichne(); return istAn; }
    function vergiss() { protokollListe = []; eingaenge = []; pause = null; offen = null; offenKi = null; thema = null; ortMerker = null; letzteAusfuehrung = {}; nr = 0; kiLetzter = { text: '', at: 0 }; zeichne(); return true; }

    /* ---------- Einstellungen: Schalter ---------- */
    function el(id) { return document.getElementById(id); }
    function uhrzeit(ms) { try { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); } catch (e) { return ''; } }
    function zeile(e) { return '#' + e.nr + ' · ' + uhrzeit(e.zeit) + ' · ' + e.codes.map(function (c) { return GRUND[c] || c; }).join(' → ') + (typeof e.ms === 'number' ? ' · ' + (e.ms / 1000).toFixed(1).replace('.', ',') + ' s · ' + e.ki + ' KI' : ''); }
    function zeichne() {
        try {
            var sw = el('chefSchalter'), st = el('chefStatus'), li = el('chefListe'), le = el('chefLetzte');
            if (!sw || !st) return;
            sw.checked = istAn; st.textContent = istAn ? 'EIN (Orte, Internet, Wetter, Kalender, Aufgaben, Notizen, Termine verschieben nach Bestätigung)' : 'AUS'; st.style.color = istAn ? '#4cffb0' : '#5d7e91';
            if (le) le.textContent = !istAn ? 'Die Chef-KI ist aus: es wird nichts beobachtet.' : (eingaenge.length ? 'Letzte Eingabe: ' + eingaenge[eingaenge.length - 1].codes.map(function (c) { return GRUND[c] || c; }).join(' → ') : 'Noch keine Eingabe seit dem Einschalten.');
            try { if (window.jvOrtZeiten) window.jvOrtZeiten.zeichne(); } catch (e) { }
            if (li) {
                li.textContent = '';
                eingaenge.slice().reverse().forEach(function (e) { var d = document.createElement('div'); d.textContent = zeile(e); li.appendChild(d); });
            }
        } catch (e) { }
    }
    function start() {
        try {
            if (window.localStorage && window.localStorage.getItem('jv_chef') === '1') istAn = true;
        } catch (e) { }
        try {
            var sw = el('chefSchalter'), del = el('chefLoeschen'), box = el('chefBox');
            if (sw) sw.addEventListener('change', function () { schalten(!!sw.checked); });
            if (del) del.addEventListener('click', vergiss);
            if (box) box.addEventListener('toggle', function () { if (box.open) zeichne(); });
            zeichne();
        } catch (e) { }
    }

    window.jvChef = {
        starte: start,
        an: function () { return schalten(true); }, aus: function () { return schalten(false); }, istAn: function () { return istAn; },
        behandle: behandle, kiWeg: kiWeg, mehrteilig: mehrteilig, befehlVorrang: befehlVorrang, uebergabeAlteSuche: uebergabeAlteSuche, eingaenge: eingaengeKopie, grundText: function (c) { return GRUND[c] || ''; }, GRUENDE: GRUND, plane: plane, verarbeite: verarbeite, pruefePlan: pruefePlan, kiEntscheider: kiEntscheider,
        protokoll: function () { return protokollListe.map(function (e) { return { nr: e.nr, zeit: e.zeit, weg: e.weg, faehigkeiten: e.faehigkeiten.slice(), status: e.status }; }); },
        vergiss: vergiss, kiZaehler: function () { return { anfragen: kiZaehler.anfragen, ortssuchen: kiZaehler.ortssuchen, zurueck: kiZaehler.zurueck, websuchen: kiZaehler.websuchen, wetter: kiZaehler.wetter, produktsuchen: kiZaehler.produktsuchen }; }, GESAMT_MS: GESAMT_MS, thema: function () { return themaFrisch() ? { art: thema.art, tag: thema.tag || '', begriff: thema.begriff || '' } : null; }, planErlaubt: planErlaubt, FREIGEGEBEN: FREIGEGEBEN, SCHREIB: SCHREIB, B2A_NEU: B2A_NEU, B2A_SCHREIBT: B2A_SCHREIBT, B2B_NAMEN: B2B_NAMEN, relativeNeueZeit: relativeNeueZeit, pauseOffen: function () { return pause ? { art: pause.art, was: pause.was, naechsterSchritt: pause.index } : null; }, PAUSE_MS: PAUSE_MS,
        ortMerken: ortMerken, ort: function () { return ortFrisch() ? ortMerker.name : null; }, _setzeOrtPruefer: function (f) { ortPruefer = typeof f === 'function' ? f : null; }, ORT_MS: ORT_MS,
        _lokal: lokalEntscheiden, _setzeSende: function (f) { sendeFunktion = typeof f === 'function' ? f : null; }, _setzeZeitlimit: function (ms) { KI_ZEITLIMIT_MS = ms > 0 ? ms : 7000; }, _setzeEntscheider: function (f) { entscheider = typeof f === 'function' ? f : function (t) { return lokalEntscheiden(t); }; }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
