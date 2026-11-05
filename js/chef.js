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

    var FREIGEGEBEN = Object.freeze(['ortssuche', 'websuche', 'wetter']);                      // echte Ausführung nur hier (alles lesend)
    var SCHREIB = Object.freeze(['erinnerung_erstellen', 'termin_erstellen', 'gedaechtnis_speichern']);   // nur Testmodus
    var MAX_SCHRITTE = 3, MAX_PROTOKOLL = 20, FRAGE_MS = 2 * 60000, DOPPELT_MS = 4000;
    var GESAMT_MS = 20000, THEMA_MS = 10 * 60000;                                            // Gesamtzeitbudget je Eingabe im Sprachweg; wie lange ein Thema für Anschlussfragen gilt
    var KI_FAEHIGKEITEN = Object.freeze(['ortssuche', 'websuche', 'wetter']);                 // das darf der KI-Entscheider planen
    var PLAN_KEYS = ['absicht', 'schritte', 'frage', 'hinweis', 'benoetigt'];
    var SCHRITT_KEYS = ['faehigkeit', 'params'];
    var NAME_RX = /^[a-z][a-z0-9_]*$/;

    var istAn = false, nr = 0, protokollListe = [], offen = null, letzteAusfuehrung = {};
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
    function frageAnmelden() { try { if (window.jvFrage && typeof window.jvFrage.neu === 'function') window.jvFrage.neu('chef'); } catch (e) { } }
    function jungeFrageGehoertUns() { try { return !window.jvFrage || window.jvFrage.aktuell() === 'chef'; } catch (e) { return true; } }

    /* ---------- Plan prüfen ---------- */
    function einfach(v) {
        if (typeof v === 'string') return v.trim().slice(0, 200);
        if (typeof v === 'number' && isFinite(v)) return v;
        if (typeof v === 'boolean') return v;
        return undefined;
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
            plan.schritte.push({ faehigkeit: s.faehigkeit, params: pa });
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
    var RX_SCHREIB = /\b(erinner\w*|termin\w*|merk(?:e)? dir|speicher\w*|trag(?:e)? \w+ ein)\b/i;

    var RX_MEHRWUNSCH = /\b(wetter|regen\w*|regenschirm|temperatur|nachrichten|neuigkeiten|internet|google|recherchier\w*|fernseh\w*|kinoprogramm|spielstand|ergebnis\w*)\b/i;
    function ortAus(text) {
        if (/in der n[äa]he|hier in der|bei mir|um mich/i.test(text)) return '';
        var m = String(text).match(/\bin\s+([A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+(?:\s+[A-ZÄÖÜ][A-Za-zÄÖÜäöüß-]+)?)/);
        return m ? m[1] : '';
    }
    function begriffAus(text) { for (var i = 0; i < ESSEN.length; i++) if (ESSEN[i][0].test(text)) return ESSEN[i][1]; return ''; }
    function hatGemerkt() { try { var g = window.jvGespraech; return !!g && g.status().listen.length > 0; } catch (e) { return false; } }

    function lokalEntscheiden(text) {
        var t = String(text == null ? '' : text);
        if (!t.trim()) return { absicht: 'nichts', schritte: [] };
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
    function kiEntscheider(sende, nur, kontext) {
        return async function (text) {
            if (typeof sende !== 'function') throw new Error('Keine Sende-Funktion');
            var reg = R();
            var faehig = reg ? reg.beschreibe().filter(function (d) { return !Array.isArray(nur) || nur.indexOf(d.name) >= 0; }).map(function (d) { return { name: d.name, beschreibung: d.beschreibung, pflicht: d.pflicht.map(function (x) { return x.name; }), optional: d.optional.map(function (x) { return x.name; }) }; }) : [];
            var nachrichten = [
                { role: 'system', content: 'Du planst für einen Sprachassistenten. Antworte NUR mit JSON: {"absicht":"...","schritte":[{"faehigkeit":"name","params":{}}],"frage":"...","hinweis":"...","benoetigt":["name"]}. Nutze nur diese Fähigkeiten: ' + JSON.stringify(faehig) + '. Regeln: höchstens 3 Schritte, davon höchstens 1 websuche, 2 ortssuche und 1 wetter. wetter gilt nur für den Standort des Nutzers (params.tag: heute, morgen oder uebermorgen); wird das Wetter für einen anderen Ort gefragt, antworte {"schritte":[]}. websuche nur für aktuelle Auskünfte aus dem Internet (Nachrichten, Ergebnisse, Fernsehprogramm, Öffnungszeiten, Preise) mit der Frage des Nutzers im Wortlaut als params.frage. ortssuche für Orte, Läden und Lokale in der Nähe oder in einem genannten Ort. Sind mehrere Wünsche in einem Satz, plane sie der Reihe nach. Ist der Wunsch zu unklar, setze nur "frage" (eine kurze Rückfrage) und keine Schritte. Reines Gespräch, Smalltalk, Wissensfragen, Kalender, Erinnerungen, Listen und alles andere: antworte {"schritte":[]}. Erfinde keine Preise, Öffnungszeiten, Verfügbarkeiten oder Fahrzeiten.' }
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
        ki_kein_ortswunsch: 'KI: nichts zu koordinieren (normaler Ablauf)',
        ki_nicht_erlaubt: 'KI-Plan nicht erlaubt (nur Orte, Internet und Wetter, mit Obergrenzen)',
        ki_ungueltig: 'KI-Antwort ungültig',
        ki_zeitlimit: 'Zeitlimit der KI',
        ki_fehler: 'Fehler bei der KI-Anfrage',
        ki_ueberholt: 'Durch einen neueren Satz überholt',
        ausgeschaltet: 'Chef-KI inzwischen ausgeschaltet',
        ortssuche_ausgefuehrt: 'Gültige Ortssuche ausgeführt',
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
        budget_ueberschritten: 'Zeitbudget überschritten'
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
        var darfEcht = istAn && FREIGEGEBEN.indexOf(name) >= 0 && SCHREIB.indexOf(name) < 0 && !(d.bestaetigung && d.bestaetigung.noetig) && opts.trocken !== true;
        var trocken = !darfEcht;
        var schluessel = name + '|' + JSON.stringify(schritt.params);
        if (darfEcht) {
            var vor = letzteAusfuehrung[schluessel];
            if (vor && jetzt() - vor < DOPPELT_MS) { erg.status = 'TOOL_FAILED'; erg.grund = 'doppelt'; erg.nachricht = ''; return erg; }
            letzteAusfuehrung[schluessel] = jetzt();
        }
        var r;
        try { r = await reg.fuehreAus(name, schritt.params, { trocken: trocken, kontext: { text: String(text || '') } }); }   // bestaetigt wird NIE gesetzt
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
            if (e.status === 'NO_RESULTS') { res.status = 'NO_RESULTS'; res.frage = 'Dazu habe ich nichts gefunden. In welchem Ort soll ich suchen?'; res.offen = { schritt: i, parameter: 'ort', plan: plan, text: text }; break; }
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
    var KI_ZEITLIMIT_MS = 7000, kiGen = 0, kiLetzter = { text: '', at: 0 }, kiZaehler = { anfragen: 0, ortssuchen: 0, zurueck: 0, websuchen: 0, wetter: 0 }, sendeFunktion = null;
    var thema = null, offenKi = null;   // Thema der letzten Antwort (nur Art/Tag/Stichwort, 10 Minuten) und eine offene Rückfrage des KI-Weges (2 Minuten); nur Arbeitsspeicher
    /* Vorfilter NUR zur Kostenbegrenzung: reines Geplauder ("Wie geht's dir?") kostet keine zusätzliche KI-Anfrage. Entschieden wird NICHT hier, sondern von der KI. */
    var RX_KI_VORFILTER = /\b(wo|wohin|hier|in der n[äa]he|umgebung|gegend|ecke|unterwegs|auswärts|ausw[äa]rts|ausgehen|essen|speisen|trinken|hunger|durst|magen|lust auf|empfiehl\w*|tipp|find\w*|such\w*|gibt es|gibts|kennst du|abend|mittag|fr[üu]hst[üu]ck\w*|snack|happen|bissen|gemütlich|gem[üu]tlich|romantisch|date|feiern|laden|lokal|schmaus\w*|wetter|regen\w*|schirm|jacke|temperatur|grad|sonnig|schnee|gewitter|sturm|nachrichten|neuigkeiten|aktuell\w*|fernseh\w*|kino|programm|öffnungszeit\w*|ergebnis\w*|spielstand|tabelle|internet|google|recherchier\w*|nachschlagen|nachsehen)\b/i;
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
    function planErlaubt(plan, ohneFrage) {
        if (!plan || !Array.isArray(plan.schritte)) return false;
        var n = plan.schritte.length;
        if (n === 0) return !ohneFrage && frageSauber(plan.frage);   // nach einer Antwort auf eine Rückfrage gibt es keine zweite Rückfrage (keine Fragekette)
        if (n > MAX_SCHRITTE || plan.frage) return false;
        var zaehl = { ortssuche: 0, websuche: 0, wetter: 0 };
        for (var i = 0; i < n; i++) {
            var st = plan.schritte[i], p = st.params || {}, ks = Object.keys(p);
            if (KI_FAEHIGKEITEN.indexOf(st.faehigkeit) < 0) return false;
            zaehl[st.faehigkeit]++;
            if (st.faehigkeit === 'ortssuche') {
                if (!saubererBegriff(p.suchbegriff)) return false;
                if (p.ort !== undefined && !saubererBegriff(p.ort)) return false;
                if (!ks.every(function (k) { return k === 'suchbegriff' || k === 'ort'; })) return false;
            } else if (st.faehigkeit === 'websuche') {
                if (typeof p.frage !== 'string' || p.frage.trim().length < 3) return false;
                if (p.suchbegriff !== undefined && (typeof p.suchbegriff !== 'string' || p.suchbegriff.length > 100)) return false;
                if (!ks.every(function (k) { return k === 'frage' || k === 'suchbegriff'; })) return false;
            } else {
                if (p.tag !== undefined && ['heute', 'morgen', 'uebermorgen', 'übermorgen'].indexOf(String(p.tag).toLowerCase()) < 0) return false;
                if (!ks.every(function (k) { return k === 'tag'; })) return false;
            }
        }
        return zaehl.ortssuche <= 2 && zaehl.websuche <= 1 && zaehl.wetter <= 1;
    }

    /* Kontext für kurze Anschlussfragen: nur Art des letzten Themas (und Tag/Stichwort), nie ein Satz. */
    function themaFrisch() { return !!thema && jetzt() - thema.at <= THEMA_MS; }
    function kontextText() {
        if (!themaFrisch()) return '';
        return 'Nur zur Einordnung kurzer Anschlussfragen: das letzte Thema war ' + (thema.art === 'wetter' ? 'das Wetter (Tag: ' + (thema.tag || 'heute') + ')' : thema.art === 'orte' ? 'eine Ortssuche' + (thema.begriff ? ' (' + thema.begriff + ')' : '') : 'eine Internetauskunft') + '.';
    }
    function notiz(name) { return name === 'websuche' ? 'Bei der Internetsuche hat es leider nicht geklappt.' : name === 'wetter' ? 'Die Wetterdaten waren gerade nicht erreichbar.' : 'Bei der Ortssuche hat es leider nicht geklappt.'; }
    function mitRest(p, ende) {
        var rest = ende - jetzt();
        if (rest <= 0) return Promise.resolve({ zeit: true });
        var t;
        return Promise.race([p, new Promise(function (res) { t = setTimeout(function () { res({ zeit: true }); }, rest); })]).then(function (v) { clearTimeout(t); return v; }, function (e) { clearTimeout(t); throw e; });
    }

    /* Führt den geprüften Plan Schritt für Schritt aus und sammelt die Ergebnisse. Spricht NICHT selbst: das macht der Aufrufer EINMAL mit dem Gesamtergebnis.
       Nach dem Zeitbudget wird alles Weitere verworfen (nichts wird nachträglich gesprochen). */
    async function ausfuehrenKI(plan, text, gen, ende) {
        var einzel = plan.schritte.length === 1, teile = [], kartenListe = [], erfolge = [], fehl = [], schritte = [], ki = 0, frage = '', frageCode = '', offenNeu = null, ortsFehler = '', leer = 0, doppelt = 0;
        for (var i = 0; i < plan.schritte.length; i++) {
            var s = plan.schritte[i];
            if (s.faehigkeit === 'websuche') { kiZaehler.websuchen++; ki++; } else if (s.faehigkeit === 'wetter') kiZaehler.wetter++; else kiZaehler.ortssuchen++;
            var e = await mitRest(fuehreSchrittAus(s, text, {}), ende);
            if (e && e.zeit) return { art: 'zeit', ki: ki };
            schritte.push(e);
            if (e.grund === 'doppelt') { doppelt++; continue; }
            if (e.status === 'NEEDS_INFORMATION' && einzel) { frage = plan.frage || e.nachricht; frageCode = 'rueckfrage'; offenNeu = { schritt: i, parameter: e.fehlend[0], plan: plan, text: text }; break; }
            if (e.status === 'NO_RESULTS' && einzel && s.faehigkeit === 'ortssuche') { frage = 'Dazu habe ich nichts gefunden. In welchem Ort soll ich suchen?'; frageCode = 'keine_treffer'; offenNeu = { schritt: i, parameter: 'ort', plan: plan, text: text }; break; }
            if (e.status === 'NO_RESULTS') { leer++; teile.push(e.nachricht || 'Dazu habe ich nichts gefunden.'); continue; }
            if (e.status === 'SUCCESS' && e.ausgefuehrt && e.nachricht) {
                erfolge.push(s.faehigkeit); teile.push(e.nachricht);
                if (e.daten && Array.isArray(e.daten.cards)) kartenListe = kartenListe.concat(e.daten.cards);
                continue;
            }
            fehl.push(s.faehigkeit);
            if (s.faehigkeit === 'ortssuche' && e.nachricht) ortsFehler = e.nachricht;
        }
        if (gen !== kiGen) return { art: 'ueberholt', ki: ki };
        if (frage) return { art: 'frage', frage: frage, frageCode: frageCode, offenNeu: offenNeu, schritte: schritte, ki: ki };
        if (doppelt && doppelt === plan.schritte.length) return { art: 'still', ki: ki };
        if (teile.length) {
            var text2 = teile.join(' ') + (fehl.length ? ' ' + fehl.map(notiz).join(' ') : '');
            return { art: 'gesagt', text: text2, karten: kartenListe.slice(0, 5), erfolge: erfolge, fehl: fehl, leer: leer, schritte: schritte, ki: ki };
        }
        if (ortsFehler) return { art: 'gesagt', text: ortsFehler, karten: [], erfolge: [], fehl: fehl, leer: 0, schritte: schritte, ki: ki, ortsFehler: true };
        return { art: 'rueckfall', ki: ki };
    }

    async function kiEntscheideImSprachweg(text, gen, eingang, kontext, ohneFrage) {
        var zurueck = false, ctrl = null, timer = null, t0 = jetzt(), kiN = 1;   // 1 = die Entscheider-Anfrage selbst
        function zurueckInsNormale() {
            if (zurueck) return;                      // nur einmal
            if (gen !== kiGen) { vermerke(eingang, 'ki_ueberholt'); return; }   // und nur, wenn der Satz nicht überholt wurde
            zurueck = true; kiZaehler.zurueck++; kiN++; vermerke(eingang, 'rueckfall');
            try { if (typeof window.sendToGroqSmart === 'function') window.sendToGroqSmart(text); } catch (e) { }
        }
        try {
            try { ctrl = (typeof AbortController === 'function') ? new AbortController() : null; } catch (e) { ctrl = null; }
            var limit = new Promise(function (_, reject) { timer = setTimeout(function () { try { if (ctrl) ctrl.abort(); } catch (e) { } reject(new Error('Zeitlimit')); }, KI_ZEITLIMIT_MS); });
            var sende = sendeFunktion || sendeStandard;
            var entsch = kiEntscheider(function (m) { return Promise.race([Promise.resolve(sende(m, ctrl ? ctrl.signal : undefined)), limit]); }, KI_FAEHIGKEITEN, kontext);
            var pr = await Promise.race([plane(text, { entscheider: entsch }), limit.catch(function () { return { ok: false, zeitlimit: true }; })]);
            try { clearTimeout(timer); } catch (e) { }
            if (gen !== kiGen) { protokolliere('ki_ueberholt', [], 'VERWORFEN'); vermerke(eingang, 'ki_ueberholt'); return; }
            if (!pr || !pr.ok || !planErlaubt(pr.plan, ohneFrage)) {
                vermerke(eingang, !pr ? 'ki_fehler' : (pr.zeitlimit || pr.grund === 'Zeitlimit') ? 'ki_zeitlimit' : pr.fehler ? 'ki_fehler' : !pr.ok ? 'ki_ungueltig'
                    : (pr.plan.schritte.length === 0 && !pr.plan.frage) ? 'ki_kein_ortswunsch' : 'ki_nicht_erlaubt');
                protokolliere('ki_zurueck', [], pr && pr.zeitlimit ? 'ZEITLIMIT' : (pr && pr.ok ? 'KEIN_ORTSWUNSCH' : 'UNGUELTIG')); zurueckInsNormale(); return; }
            if (!istAn) { vermerke(eingang, 'ausgeschaltet'); zurueckInsNormale(); return; }                 // inzwischen ausgeschaltet: der Satz geht den bisherigen Weg
            var plan = pr.plan;
            if (!plan.schritte.length) {                                  // unklarer Wunsch: EINE kurze Rückfrage, sonst nichts
                vermerke(eingang, 'ki_nachfrage'); protokolliere('ki_nachfrage', [], 'FRAGE');
                frageAnmelden(); offenKi = { at: jetzt(), text: text, frage: plan.frage }; say(plan.frage); return;
            }
            var r = await ausfuehrenKI(plan, text, gen, t0 + GESAMT_MS);
            kiN += r.ki || 0;
            if (r.art === 'ueberholt') { protokolliere('ki_ueberholt', [], 'VERWORFEN'); vermerke(eingang, 'ki_ueberholt'); return; }
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
            if (letzter === 'wetter') { var ws = plan.schritte.filter(function (x) { return x.faehigkeit === 'wetter'; })[0]; thema = { art: 'wetter', tag: String((ws.params && ws.params.tag) || 'heute').toLowerCase().replace('ü', 'ue'), at: jetzt() }; }
            else if (letzter === 'websuche') thema = { art: 'web', at: jetzt() };
            else if (letzter === 'ortssuche') { var os = plan.schritte.filter(function (x) { return x.faehigkeit === 'ortssuche'; })[0]; thema = { art: 'orte', begriff: String(os.params.suchbegriff).slice(0, 40), at: jetzt() }; }
            if (r.karten && r.karten.length) karten(r.karten);
            say(r.text);                                                  // EINE zusammenhängende Antwort
            protokolliere('ki', plan.schritte.map(function (x) { return x.faehigkeit; }), 'SUCCESS');
        } catch (e) {
            try { clearTimeout(timer); } catch (x) { }
            vermerke(eingang, 'ki_fehler'); protokolliere('ki_zurueck', [], 'FEHLER'); zurueckInsNormale();
        } finally {
            setzeMessung(eingang, jetzt() - t0, kiN);
        }
    }

    /* Haken im echten Sprachweg: true = die Chef-KI hat den Satz übernommen (läuft asynchron weiter und fällt im Zweifel genau einmal auf den bisherigen Ablauf zurück). */
    function kiWeg(text) {
        if (!istAn) return false;                                              // AUS: nichts, kein Netz
        try {
            vomChefBehandelt = 0;
            if (typeof text !== 'string') return false;
            var t = text.trim(), woerter = t ? t.split(/\s+/).length : 0, kopf = '';
            /* offene Rückfrage des KI-Weges: die kurze Antwort gehört zur ursprünglichen Frage (beides zusammen geht an den Entscheider) */
            if (offenKi && jetzt() - offenKi.at <= FRAGE_MS && jungeFrageGehoertUns()) {
                var f = offenKi; offenKi = null;
                if (/^\s*(nein|nee|abbrechen|lass(?: es)?|vergiss es|egal)\b/i.test(t)) { neuerEingang('nachfrage_antwort'); vermerke(eingaenge[eingaenge.length - 1], 'abgebrochen'); say('Alles klar, ich lasse es.'); return true; }
                if (woerter >= 1 && woerter <= 8 && !RX_SCHREIB.test(t)) { t = f.text + ' ' + t; kopf = 'nachfrage_antwort'; }
            } else if (offenKi) offenKi = null;
            var anschluss = !kopf && themaFrisch() && woerter >= 1 && woerter <= 8 && RX_FOLGE.test(t) && !RX_SCHREIB.test(t);
            if (anschluss) kopf = 'anschluss';
            if (!kopf && (woerter < 3 || woerter > 30 || t.length > 240)) { neuerEingang('vorfilter_laenge'); return false; }
            if (RX_SCHREIB.test(t)) { neuerEingang('vorfilter_schreiben'); return false; }
            if (!kopf && !RX_KI_VORFILTER.test(t)) { neuerEingang('vorfilter_stichwort'); return false; }
            if (!R() || !R().hole('ortssuche')) { neuerEingang('faehigkeit_fehlt'); return false; }
            var n = jetzt();
            if (kiLetzter.text === t && n - kiLetzter.at < DOPPELT_MS) { neuerEingang('vorfilter_doppelt'); return false; }   // derselbe Satz kurz hintereinander: keine zweite Anfrage
            kiLetzter = { text: t, at: n };
            var gen = ++kiGen;                                                  // ein neuer Satz überholt einen noch laufenden
            kiZaehler.anfragen++;
            var eingang = neuerEingang(kopf || 'ki_aufgerufen');
            if (kopf) vermerke(eingang, 'ki_aufgerufen');
            try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Verarbeite Anweisung...'); } catch (e) { }
            kiEntscheideImSprachweg(t, gen, eingang, kontextText(), kopf === 'nachfrage_antwort').catch(function () { });
            return true;
        } catch (e) { return false; }
    }

    function schalten(an) { istAn = !!an; if (!istAn) { offen = null; offenKi = null; thema = null; } try { if (window.localStorage) { if (istAn) window.localStorage.setItem('jv_chef', '1'); else window.localStorage.removeItem('jv_chef'); } } catch (e) { } zeichne(); return istAn; }
    function vergiss() { protokollListe = []; eingaenge = []; offen = null; offenKi = null; thema = null; letzteAusfuehrung = {}; nr = 0; kiLetzter = { text: '', at: 0 }; zeichne(); return true; }

    /* ---------- Einstellungen: Schalter ---------- */
    function el(id) { return document.getElementById(id); }
    function uhrzeit(ms) { try { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); } catch (e) { return ''; } }
    function zeile(e) { return '#' + e.nr + ' · ' + uhrzeit(e.zeit) + ' · ' + e.codes.map(function (c) { return GRUND[c] || c; }).join(' → ') + (typeof e.ms === 'number' ? ' · ' + (e.ms / 1000).toFixed(1).replace('.', ',') + ' s · ' + e.ki + ' KI' : ''); }
    function zeichne() {
        try {
            var sw = el('chefSchalter'), st = el('chefStatus'), li = el('chefListe'), le = el('chefLetzte');
            if (!sw || !st) return;
            sw.checked = istAn; st.textContent = istAn ? 'EIN (Orte, Internet, Wetter)' : 'AUS'; st.style.color = istAn ? '#4cffb0' : '#5d7e91';
            if (le) le.textContent = !istAn ? 'Die Chef-KI ist aus: es wird nichts beobachtet.' : (eingaenge.length ? 'Letzte Eingabe: ' + eingaenge[eingaenge.length - 1].codes.map(function (c) { return GRUND[c] || c; }).join(' → ') : 'Noch keine Eingabe seit dem Einschalten.');
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
        behandle: behandle, kiWeg: kiWeg, befehlVorrang: befehlVorrang, uebergabeAlteSuche: uebergabeAlteSuche, eingaenge: eingaengeKopie, grundText: function (c) { return GRUND[c] || ''; }, GRUENDE: GRUND, plane: plane, verarbeite: verarbeite, pruefePlan: pruefePlan, kiEntscheider: kiEntscheider,
        protokoll: function () { return protokollListe.map(function (e) { return { nr: e.nr, zeit: e.zeit, weg: e.weg, faehigkeiten: e.faehigkeiten.slice(), status: e.status }; }); },
        vergiss: vergiss, kiZaehler: function () { return { anfragen: kiZaehler.anfragen, ortssuchen: kiZaehler.ortssuchen, zurueck: kiZaehler.zurueck, websuchen: kiZaehler.websuchen, wetter: kiZaehler.wetter }; }, GESAMT_MS: GESAMT_MS, thema: function () { return themaFrisch() ? { art: thema.art, tag: thema.tag || '', begriff: thema.begriff || '' } : null; }, planErlaubt: planErlaubt, FREIGEGEBEN: FREIGEGEBEN, SCHREIB: SCHREIB,
        _lokal: lokalEntscheiden, _setzeSende: function (f) { sendeFunktion = typeof f === 'function' ? f : null; }, _setzeZeitlimit: function (ms) { KI_ZEITLIMIT_MS = ms > 0 ? ms : 7000; }, _setzeEntscheider: function (f) { entscheider = typeof f === 'function' ? f : function (t) { return lokalEntscheiden(t); }; }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
