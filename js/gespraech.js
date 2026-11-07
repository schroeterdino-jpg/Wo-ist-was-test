/* ============================================================
   GESPRÄCHSGEDÄCHTNIS (Phase 4): merkt sich, worüber gerade gesprochen wird, damit Folgefragen verstanden werden können.
     "Suche drei Restaurants in Hamburg" -> Ergebnisse   |   "Das zweite gefällt mir" -> Auswahl   |   "Wie komme ich dahin?" -> das ausgewählte Restaurant
   Seit Phase 5 benutzt js/gespraech_ort.js es (Orte), js/gespraech_antwort.js die letzten Antworten (Anschlussfragen) (Ortssuche: Ergebnisse merken, Folgefragen beantworten). Sonst benutzt es keine App-Datei.
   Es ist etwas ANDERES als das Langzeitgedächtnis (Langzeit-Speicher, "Merk dir ..."): kein Zugriff darauf, kein localStorage, kein Netz, keine Zeitgeber.
   Alles liegt nur im Arbeitsspeicher und verfällt (siehe STANDARD). Gespeichert werden Ergebnisse (Name, Beschreibung, Link) und Jarvis' eigene Rückfragen,
   NIE die Sätze des Nutzers.

   window.jvGespraech.erzeuge(opt)       eine eigene Instanz (opt.jetzt = Uhr für Tests, opt.zeiten = andere Fristen); window.jvGespraech ist die gemeinsame Instanz
   .absicht(name?, daten?)               aktuelle Gesprächsabsicht setzen / lesen ({ name, seitMs })
   .ergebnisse(art, liste, quelle?)      letzte Ergebnisse merken (löscht die bisherige Auswahl), max. 10 je Liste, die letzten 3 Listen
   .verarbeite(registryErgebnis)         nimmt ein Ergebnis von der Registry (fuehreAus) (Fähigkeit ortssuche: Karten werden zu Ergebnissen), sonst nur die Absicht
   .waehle(bezug)                        Zahl (1 = erstes) oder Text ("das zweite", "Roma", "das letzte") -> Auswahl oder Rückfrage
   .liste()                              die jüngste Ergebnisliste { art, quelle, alterMs, veraltet, items } (Kopie), ohne etwas auszulösen; null, wenn keine da ist
   .ausgewaehlt()                        das gewählte Ergebnis (Kopie) oder null (auch null, wenn die Auswahl verfallen ist)
   .aufloesen(text)                      Folgesatz verstehen -> { art, ziel, thema, frage, optionen, grund, frageId }, art:
        auswahl        "Das zweite gefällt mir"      ziel = gewähltes Ergebnis (wird als Auswahl gemerkt)
        folgefrage     "Wie komme ich dahin?"        ziel + thema (route, adresse, zeiten, entfernung, telefon, info)
        rueckfrage     mehrdeutig/außerhalb         frage + optionen; wird als offene Rückfrage gemerkt, die nächste Antwort ("das zweite") beantwortet sie
        veraltet       Ergebnisse zu alt            frage: soll ich neu suchen? (es wird NICHT geraten)
        ohne_bezug     Bezugswort, aber nichts gemerkt
        antwort        Ja/Nein auf eine offene Ja/Nein-Frage
        abgebrochen    "nein, keins davon" auf eine offene Auswahl-Rückfrage
        kein_bezug     der Satz bezieht sich auf nichts Gemerktes: ganz normal weiterverarbeiten
   .frage({ text, optionen?, thema?, art? })   eigene offene Rückfrage anlegen (art: 'auswahl' | 'ja_nein'); .offeneFragen(); .beantworte(text); .schliesse(id)
   .fehlgeschlagen()                     eine Suche ist gescheitert: bisherige Ergebnisse und Auswahl verwerfen (kein alter Ort darf als neuer gelten)
   Ergebnisse dürfen zusätzlich lat, lon (Koordinaten), adresse und distanzKm tragen (nur gültige Zahlen/Texte werden übernommen).
   .antwort(art, frage, text, hinweis?)  Jarvis' letzte ECHTE Antwort merken (Internet, Fahrzeit, Umgebung, Tanken, Bahn, KI-Antwort), max. 3, je 700 Zeichen; getrennt von den Ergebnislisten
                                         (eine Antwort ersetzt weder Treffer noch Auswahl). Nur Arbeitsspeicher, verfällt nach ergebnisMs (10 Min.). Genutzt von js/gespraech_antwort.js
   .antworten()                          die frischen Antworten, jüngste zuerst: [{ art, frage, text, hinweis, alterMs }]
   .status()   Überblick ohne Inhalte (Anzahl, Alter, veraltet)   .vergiss()   alles löschen
   ============================================================ */
(function () {
    'use strict';
    if (window.jvGespraech) return;

    var STANDARD = { ergebnisMs: 10 * 60000, auswahlMs: 15 * 60000, frageMs: 2 * 60000, ruheMs: 30 * 60000, maxErgebnisse: 10, maxListen: 3, maxFragen: 3, maxAntworten: 3 };

    var W = '[A-Za-zÄÖÜäöüß]';
    var NR = { erste: 1, zweite: 2, dritte: 3, vierte: 4, fünfte: 5, fuenfte: 5, sechste: 6, siebte: 7, siebente: 7, achte: 8, neunte: 9, zehnte: 10 };
    var ZAHLWORT = { eins: 1, ein: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10 };
    var RX_ORD = new RegExp('(?:^|[^A-Za-zÄÖÜäöüß])(?:das|die|der|den|dem|des|zum|zur|vom|beim)\\s+(vorletzte|letzte|mittlere|' + Object.keys(NR).join('|') + ')(?:n|s|r|m)?(?![A-Za-zÄÖÜäöüß])(?!\\s+(?:mal|male|hilfe|klasse|liga|halbzeit|hälfte|haelfte|jahr|woche|monat|quartal|runde|zeit|nacht|stunde|minute|tag|reihe|seite|etage|stock|januar|februar|m[aä]rz|april|mai|juni|juli|august|september|oktober|november|dezember))', 'i');
    var RX_NUMMER = /(?:nummer|nr\.?|option|platz|ergebnis|punkt)\s*(\d{1,2}|eins|zwei|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn)(?![A-Za-zÄÖÜäöüß])/i;
    var RX_AUSWAHL = /gef[aä]llt|gefaellt|\bnehm(e|en)\b|\bnimm\b|w[aä]hl(e|en)?\b|entscheid|das ist es|\bich will\b|ich m[oö]chte|\blieber\b|\bmag ich\b|passt (mir|gut)|ist gut|nehmen wir/i;
    var THEMEN = [
        ['route', /wie komme ich|wegbeschreibung|navigier|\broute\b|f[aä]hr(e|st)? mich|\bweg (zu|nach|dahin)|bring mich|wie fahre ich|wie finde ich (hin|dahin)|\bhinkommen\b/i],
        ['oeffnungszeiten', /[oö]ffnungszeit|hat .* auf\b|wann (macht|[oö]ffnet|schlie[sß]t)|\bge[oö]ffnet\b|\boffen\b/i],
        ['entfernung', /wie weit|entfernung|wie lange (dauert|brauche|fahre)|wie viele kilometer/i],
        ['telefon', /telefon|\banrufen\b|ruf .* an\b|rufnummer/i],
        ['adresse', /adresse|\bwo (ist|liegt|finde)\b|in welcher stra[sß]e/i],
        ['parken', /parkpl[aä]tz|parkhaus|\bparken\b|parkm[oö]glichkeit/i],
        ['preise', /preis|kostet|teuer|g[uü]nstig/i]
    ];
    /* Bezugswörter ohne Zahl und Namen: bestimmte Ortswörter ("dahin"), Artikel + Ortsbegriff ("zum Restaurant") oder ein Fürwort am Satzende ("Wie weit ist das?").
       "Was kostet das Brot?" gehört bewusst NICHT dazu (das Fürwort steht nicht am Ende). */
    var RX_DEIKTISCH = /(?:^|[^A-Za-zÄÖÜäöüß])(?:dahin|dorthin|dort|davon|dazu|hierhin|(?:hat|ist|liegt)\s+(?:das|es)\s+(?:auf|offen|ge[oö]ffnet|weit|teuer|g[uü]nstig|entfernt|weg)|(?:das|der|die|dem|zum|zur|im)\s+(?:restaurant|lokal|caf[eé]|laden|ort|hotel|geschäft|geschaeft|kneipe|imbiss|pizzeria))(?![A-Za-zÄÖÜäöüß])|(?:^|[^A-Za-zÄÖÜäöüß])(?:das|es|dieses|diese[nrs]?)\s*[?.!]*\s*$/i;
    var RX_KORREKTUR = /ich meinte|meinte ich|\bnicht das\b|\bnicht dieses\b|das andere|die andere|ein anderes|doch nicht/i;
    var RX_AUSWAHL_DEIXIS = /^\s*(?:ja\W+)?(?:das|dieses|diese[nrs]?)\b/i;
    var RX_JA = /^\s*(ja|jo|jep|genau|okay|ok|klar|gern|gerne|mach das|bitte|stimmt|richtig)\b/i, RX_NEIN = /^\s*(nein|nee|nö|lieber nicht|abbrechen|vergiss es|keins|keines|keine|nichts davon|egal)\b/i;
    var GENERISCH = /^(restaurant|restaurants|pizzeria|cafe|café|bar|haus|zum|zur|zu|der|die|das|und|bei|am|im|an|gasthaus|gaststätte|imbiss|lokal|stube)$/i;

    function ohneUmlaut(s) { return String(s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss'); }
    function kopie(o) { return o ? JSON.parse(JSON.stringify(o)) : o; }
    function einfach(v, max) { return (typeof v === 'string') ? v.slice(0, max || 200) : ((typeof v === 'number' && isFinite(v)) || typeof v === 'boolean') ? v : undefined; }

    function erzeuge(opt) {
        opt = opt || {};
        var jetzt = typeof opt.jetzt === 'function' ? opt.jetzt : function () { return Date.now(); };
        var Z = {}; Object.keys(STANDARD).forEach(function (k) { Z[k] = (opt.zeiten && typeof opt.zeiten[k] === 'number') ? opt.zeiten[k] : STANDARD[k]; });
        var s, idZaehler = 0;
        function leer() { s = { absicht: null, listen: [], auswahl: null, fragen: [], antworten: [], zuletzt: jetzt() }; }
        leer();

        /* Verfall, immer beim Zugriff (kein Zeitgeber): lange Ruhe -> alles weg; Listen nach ruheMs weg; Auswahl und Fragen nach ihrer Frist weg. */
        function aufraeumen() {
            var t = jetzt();
            if (t - s.zuletzt > Z.ruheMs) { leer(); return; }
            s.listen = s.listen.filter(function (l) { return t - l.zeit <= Z.ruheMs; });
            if (s.auswahl && t - s.auswahl.zeit > Z.auswahlMs) s.auswahl = null;
            s.fragen = s.fragen.filter(function (f) { return t - f.zeit <= Z.frageMs; });
            if (s.absicht && t - s.absicht.zeit > Z.ruheMs) s.absicht = null;
            s.antworten = s.antworten.filter(function (a) { return t - a.zeit <= Z.ergebnisMs; });
        }
        function beruehre() { s.zuletzt = jetzt(); }
        function veraltet(l) { return jetzt() - l.zeit > Z.ergebnisMs; }
        function neueste() { return s.listen.length ? s.listen[0] : null; }

        function absicht(name, daten) {
            aufraeumen();
            if (name === undefined) return s.absicht ? { name: s.absicht.name, seitMs: jetzt() - s.absicht.zeit, daten: kopie(s.absicht.daten) } : null;
            var d = {}; if (daten && typeof daten === 'object') Object.keys(daten).slice(0, 10).forEach(function (k) { var v = einfach(daten[k], 80); if (v !== undefined) d[String(k).slice(0, 30)] = v; });
            s.absicht = { name: String(name).slice(0, 40), zeit: jetzt(), daten: d }; beruehre();
            return true;
        }

        function normalisiere(liste) {
            return (Array.isArray(liste) ? liste : []).slice(0, Z.maxErgebnisse).map(function (e, i) {
                var o = (e && typeof e === 'object') ? e : { name: e };
                var r = { nr: i + 1, name: String(o.name != null ? o.name : (o.title != null ? o.title : '')).slice(0, 120), beschreibung: String(o.beschreibung != null ? o.beschreibung : (o.subtitle != null ? o.subtitle : '')).slice(0, 200), link: String(o.link != null ? o.link : (o.href != null ? o.href : '')).slice(0, 400) };
                var la = Number(o.lat), lo = Number(o.lon);
                if (o.lat != null && o.lon != null && o.lat !== '' && o.lon !== '' && isFinite(la) && isFinite(lo) && Math.abs(la) <= 90 && Math.abs(lo) <= 180 && !(la === 0 && lo === 0)) { r.lat = la; r.lon = lo; }
                if (typeof o.adresse === 'string' && o.adresse.trim()) r.adresse = o.adresse.trim().slice(0, 200);
                if (typeof o.distanzKm === 'number' && isFinite(o.distanzKm) && o.distanzKm >= 0) r.distanzKm = o.distanzKm;
                /* Produkte (js/produktkarten.js): Bild, Link, Preis und bis zu 3 Angebote; nur geprüfte Formen werden übernommen */
                if (typeof o.bild === 'string' && /^https:\/\//i.test(o.bild)) r.bild = o.bild.slice(0, 400);
                if (typeof o.link === 'string' && /^https?:\/\//i.test(o.link)) r.link = o.link.slice(0, 400);
                if (typeof o.preis === 'number' && isFinite(o.preis) && o.preis > 0) r.preis = o.preis;
                if (typeof o.preisText === 'string') r.preisText = o.preisText.slice(0, 30);
                if (typeof o.shop === 'string') r.shop = o.shop.slice(0, 60);
                if (typeof o.hersteller === 'string') r.hersteller = o.hersteller.slice(0, 60);
                if (Array.isArray(o.angebote)) r.angebote = o.angebote.slice(0, 4).map(function (x) {
                    return { shop: String((x && x.shop) || '').slice(0, 60), preis: (x && typeof x.preis === 'number' && isFinite(x.preis)) ? x.preis : 0, preisText: String((x && x.preisText) || '').slice(0, 30), link: (x && typeof x.link === 'string' && /^https?:\/\//i.test(x.link)) ? x.link.slice(0, 400) : '', linkArt: (x && (x.linkArt === 'direkt' || x.linkArt === 'haendlerseite' || x.linkArt === 'kategorie')) ? x.linkArt : '' };
                });
                if (Array.isArray(o.vergleich)) r.vergleich = o.vergleich.slice(0, 2).map(function (x) {
                    return { shop: String((x && x.shop) || '').slice(0, 60), preis: (x && typeof x.preis === 'number' && isFinite(x.preis)) ? x.preis : 0, preisText: String((x && x.preisText) || '').slice(0, 30), link: (x && typeof x.link === 'string' && /^https?:\/\//i.test(x.link)) ? x.link.slice(0, 400) : '' };
                });
                return r;
            }).filter(function (e) { return e.name; }).map(function (e, i) { e.nr = i + 1; return e; });
        }
        function ergebnisse(art, liste, quelle) {
            aufraeumen();
            var items = normalisiere(liste);
            s.listen.unshift({ art: String(art || 'ergebnis').slice(0, 30), quelle: String(quelle || '').slice(0, 40), zeit: jetzt(), items: items });
            while (s.listen.length > Z.maxListen) s.listen.pop();
            s.auswahl = null;                 // die Auswahl gehörte zu den alten Ergebnissen
            s.fragen = [];                    // offene Rückfragen bezogen sich auf die alten Ergebnisse
            beruehre();
            return items.length;
        }
        function antwort(art, frage, text, hinweis) {
            aufraeumen();
            var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
            if (!t) return false;
            var fn = ohneUmlaut(String(frage == null ? '' : frage)).replace(/[^a-z0-9]+/g, ' ').trim();
            if (fn) s.antworten = s.antworten.filter(function (a) { return ohneUmlaut(a.frage).replace(/[^a-z0-9]+/g, ' ').trim() !== fn; });   // dieselbe Frage noch einmal: die neue Antwort ersetzt die alte (keine künstliche Mehrdeutigkeit)
            s.antworten.unshift({ art: String(art || 'antwort').slice(0, 20), frage: String(frage == null ? '' : frage).replace(/\s+/g, ' ').trim().slice(0, 200), text: t.slice(0, 700), hinweis: String(hinweis == null ? '' : hinweis).replace(/\s+/g, ' ').trim().slice(0, 450), zeit: jetzt() });
            while (s.antworten.length > Z.maxAntworten) s.antworten.pop();
            beruehre();
            return true;
        }
        function antworten() { aufraeumen(); return s.antworten.map(function (a) { return { art: a.art, frage: a.frage, text: a.text, hinweis: a.hinweis, alterMs: jetzt() - a.zeit }; }); }
        function fehlgeschlagen() { aufraeumen(); s.listen = []; s.auswahl = null; s.fragen = []; beruehre(); return true; }
        function verarbeite(r) {
            aufraeumen();
            if (!r || typeof r !== 'object' || typeof r.faehigkeit !== 'string') return false;
            if (r.faehigkeit === 'ortssuche' && !r.trocken && (r.status === 'SUCCESS' || r.status === 'NO_RESULTS')) {
                ergebnisse('ortssuche', (r.daten && Array.isArray(r.daten.cards)) ? r.daten.cards : [], 'ortssuche');
                absicht('ortssuche');
                return true;
            }
            if (r.status === 'SUCCESS' && !r.trocken) { absicht(r.faehigkeit); return true; }
            if (r.faehigkeit === 'ortssuche' && r.status === 'TOOL_FAILED' && !r.trocken) fehlgeschlagen();   // eine gescheiterte Suche lässt keinen alten Ort als aktuellen stehen
            return false;   // sonst ändern Fehler, Rückfragen, Trockenläufe das Gedächtnis nicht
        }

        /* ---- Bezüge ---- */
        function woerter(t) { return ohneUmlaut(t).split(/[^a-z0-9]+/).filter(Boolean); }
        function distinktiv(name) { return woerter(name).filter(function (w) { return w.length >= 4 && !GENERISCH.test(w); }); }
        function nachName(liste, text) {
            var tw = woerter(text), treffer = [];
            liste.items.forEach(function (it) {
                var d = distinktiv(it.name);
                if (d.length && d.some(function (w) { return tw.indexOf(w) >= 0; })) treffer.push(it);
            });
            return treffer;
        }
        function ordinal(text, anzahl) {
            var m = RX_NUMMER.exec(text);
            if (m) { var v = m[1].toLowerCase(); return { n: /^\d/.test(v) ? parseInt(v, 10) : ZAHLWORT[v], art: 'zahl' }; }
            m = RX_ORD.exec(text);
            if (!m) return null;
            var w = m[1].toLowerCase();
            if (w === 'letzte') return { n: anzahl, art: 'letzte' };
            if (w === 'vorletzte') return { n: anzahl - 1, art: 'vorletzte' };
            if (w === 'mittlere') return (anzahl >= 3 && anzahl % 2 === 1) ? { n: (anzahl + 1) / 2, art: 'mittlere' } : { n: -1, art: 'mittlere' };
            return { n: NR[w], art: 'zahl' };
        }
        function ordinalAmEnde(text) {
            var w = String(text).toLowerCase().replace(/[?.!,]+/g, ' ').split(/\s+/).filter(Boolean);
            while (w.length && /^(bitte|mal|doch|noch|auch)$/.test(w[w.length - 1])) w.pop();
            var letzt = w[w.length - 1] || '';
            return /^(vorletzte|letzte|mittlere|erste|zweite|dritte|vierte|fünfte|fuenfte|sechste|siebte|siebente|achte|neunte|zehnte)(n|s|r|m)?$/.test(letzt);
        }
        function thema(text) { for (var i = 0; i < THEMEN.length; i++) if (THEMEN[i][1].test(text)) return THEMEN[i][0]; return ''; }

        function ergebnisObj(art, extra) {
            var o = { art: art, ziel: null, thema: '', frage: '', optionen: [], grund: '', frageId: 0 };
            if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
            return o;
        }
        function namenListe(l) { return l.items.map(function (i) { return i.name; }); }
        function listeNachFrage(l) { return namenListe(l).map(function (n, i) { return (i + 1) + ': ' + n; }).join(', '); }

        function frageAnlegen(o) {
            aufraeumen();
            var f = { id: ++idZaehler, text: String(o.text || '').slice(0, 300), art: o.art === 'ja_nein' ? 'ja_nein' : 'auswahl', thema: String(o.thema || '').slice(0, 30), zeit: jetzt(), items: normalisiere(o.optionen), liste: o.liste || null };
            s.fragen.push(f);
            while (s.fragen.length > Z.maxFragen) s.fragen.shift();
            beruehre();
            return f.id;
        }
        function offeneFragen() { aufraeumen(); return s.fragen.map(function (f) { return { id: f.id, text: f.text, art: f.art, thema: f.thema, optionen: f.items.map(function (i) { return i.name; }), alterMs: jetzt() - f.zeit }; }); }
        function schliesse(id) { aufraeumen(); var n = s.fragen.length; s.fragen = s.fragen.filter(function (f) { return f.id !== id; }); return s.fragen.length < n; }

        function waehleAus(items, text) {
            /* -> { ziel } | { mehrdeutig: [items], grund } | { ausserhalb: n } | null (kein Bezug erkannt) */
            var o = ordinal(text, items.length);
            if (o) {
                if (o.n === -1) return { mehrdeutig: items, grund: 'mittlere' };
                if (!(o.n >= 1 && o.n <= items.length)) return { ausserhalb: o.n };
                return { ziel: items[o.n - 1] };
            }
            return null;
        }

        function waehle(bezug) {
            aufraeumen();
            var l = neueste();
            if (!l || !l.items.length) return ergebnisObj('ohne_bezug', { frage: 'Ich habe gerade keine Ergebnisse, auf die ich mich beziehen kann.' });
            if (veraltet(l)) return ergebnisObj('veraltet', { frage: 'Die Ergebnisse sind schon etwas älter. Soll ich noch einmal suchen?' });
            var text = (typeof bezug === 'number') ? 'nummer ' + bezug : String(bezug == null ? '' : bezug);
            var w = waehleAus(l.items, text);
            if (!w) { var nm = nachName(l, text); if (nm.length === 1) w = { ziel: nm[0] }; else if (nm.length > 1) w = { mehrdeutig: nm, grund: 'name' }; }
            if (!w) return ergebnisObj('kein_bezug');
            return abschluss(l, w, '', 'auswahl');
        }

        /* Auswahl übernehmen oder Rückfrage stellen (und als offene Rückfrage merken) */
        function abschluss(l, w, themaName, art, grund) {
            if (w.ziel) {
                s.auswahl = { item: w.ziel, art: l.art, zeit: jetzt() }; beruehre();
                return ergebnisObj(themaName ? 'folgefrage' : art, { ziel: kopie(w.ziel), thema: themaName, grund: grund || '' });
            }
            var opts = w.mehrdeutig || l.items;
            var frage = w.ausserhalb !== undefined
                ? 'Ich habe nur ' + l.items.length + ' Ergebnis' + (l.items.length === 1 ? '' : 'se') + '. Welches meinst du? ' + listeNachFrage(l)
                : 'Welches meinst du? ' + (w.mehrdeutig ? opts.map(function (i, k) { return (k + 1) + ': ' + i.name; }).join(', ') : listeNachFrage(l));
            var id = frageAnlegen({ text: frage, art: 'auswahl', thema: themaName, optionen: opts, liste: l });
            return ergebnisObj('rueckfrage', { frage: frage, optionen: opts.map(function (i) { return i.name; }), grund: w.ausserhalb !== undefined ? 'ausserhalb' : (w.grund || 'mehrdeutig'), thema: themaName, frageId: id });
        }

        /* Antwort auf eine offene Rückfrage (die jüngste zuerst) */
        function beantworte(text) {
            aufraeumen();
            var t = String(text == null ? '' : text);
            for (var i = s.fragen.length - 1; i >= 0; i--) {
                var f = s.fragen[i];
                if (f.art === 'ja_nein') {
                    if (RX_JA.test(t)) { s.fragen.splice(i, 1); beruehre(); return ergebnisObj('antwort', { grund: 'ja', frageId: f.id }); }
                    if (RX_NEIN.test(t)) { s.fragen.splice(i, 1); beruehre(); return ergebnisObj('antwort', { grund: 'nein', frageId: f.id }); }
                    continue;
                }
                if (RX_NEIN.test(t) && !ordinal(t, f.items.length)) { s.fragen.splice(i, 1); beruehre(); return ergebnisObj('abgebrochen', { frageId: f.id, thema: f.thema }); }
                var w = waehleAus(f.items, t);
                if (!w) { var fake = { items: f.items }; var nm = nachName(fake, t); if (nm.length === 1) w = { ziel: nm[0] }; else if (nm.length > 1) w = { mehrdeutig: nm, grund: 'name' }; }
                if (!w) continue;
                s.fragen.splice(i, 1);
                var r = abschluss(f.liste || { art: 'ergebnis', items: f.items }, w, f.thema, 'auswahl');
                r.frageId = r.frageId || f.id; r.beantwortet = f.id;
                return r;
            }
            return ergebnisObj('kein_bezug');
        }

        function aufloesen(text) {
            aufraeumen();
            var t = String(text == null ? '' : text).trim();
            if (!t) return ergebnisObj('kein_bezug');
            if (s.fragen.length) { var b = beantworte(t); if (b.art !== 'kein_bezug') return b; }

            var l = neueste(), th = thema(t);
            var hatAuswahlWort = RX_AUSWAHL.test(t);
            var ord = ordinal(t, l ? l.items.length : 0);
            var nameTreffer = (l && l.items.length) ? nachName(l, t) : [];
            var deiktisch = (RX_DEIKTISCH.test(t) && (th !== '' || hatAuswahlWort)) || (hatAuswahlWort && RX_AUSWAHL_DEIXIS.test(t));
            var korrektur = RX_KORREKTUR.test(t) && !ord && !nameTreffer.length;
            /* Eine bloße Ordnungszahl ohne Thema, Auswahlwort oder Ortswort zählt nur, wenn sie das letzte Wort ist ("Zeig mir das erste", "Und das letzte?") und der Satz kurz ist:
               sonst würde "Erinner mich an das dritte Treffen" eine Auswahl auslösen. */
            if (ord && th === '' && !hatAuswahlWort && !deiktisch && !nameTreffer.length && !RX_NUMMER.test(t) && !ordinalAmEnde(t)) ord = null;
            if (ord && t.split(/\s+/).length > 10) ord = null;
            var bezugGenannt = !!ord || nameTreffer.length > 0 || deiktisch || korrektur;
            if (!bezugGenannt) return ergebnisObj('kein_bezug');
            if (!ord && !nameTreffer.length && !deiktisch && !korrektur) return ergebnisObj('kein_bezug');

            if (!l || !l.items.length) {
                if (!ord && !deiktisch && !korrektur) return ergebnisObj('kein_bezug');
                return ergebnisObj('ohne_bezug', { thema: th, frage: 'Worauf bezieht sich das? Ich habe gerade keine Ergebnisse gemerkt.' });
            }
            /* Frist: eine frische Auswahl des Nutzers gilt auch dann, wenn die Liste selbst schon alt ist */
            if (veraltet(l) && !(deiktisch && !ord && !korrektur && s.auswahl)) {
                return ergebnisObj('veraltet', { thema: th, frage: 'Die Ergebnisse sind schon etwas älter. Soll ich noch einmal suchen?', grund: 'veraltet' });
            }
            /* "Nein, ich meinte das andere": das bisher gewählte ausschließen; bleibt genau eines übrig, ist es das gemeinte, sonst wird nachgefragt */
            if (korrektur) {
                var rest = l.items.filter(function (i) { return !(s.auswahl && s.auswahl.item.nr === i.nr); });
                if (rest.length === 1 && s.auswahl) return abschluss(l, { ziel: rest[0] }, th, 'auswahl', 'korrektur');
                return abschluss(l, { mehrdeutig: rest, grund: 'korrektur' }, th, 'auswahl');
            }
            /* Ordinal oder Name: aus der Liste wählen */
            if (ord || nameTreffer.length) {
                var w = ord ? waehleAus(l.items, t) : (nameTreffer.length === 1 ? { ziel: nameTreffer[0] } : { mehrdeutig: nameTreffer, grund: 'name' });
                var kurz = t.split(/\s+/).length <= 5;
                var themaName = th || ((hatAuswahlWort || kurz) ? '' : 'info');
                return abschluss(l, w, themaName, 'auswahl');
            }
            /* nur ein Bezugswort ("dahin", "das"): gewählte Auswahl, sonst das einzige Ergebnis, sonst nachfragen */
            if (s.auswahl) { beruehre(); return ergebnisObj('folgefrage', { ziel: kopie(s.auswahl.item), thema: th || 'info' }); }
            if (l.items.length === 1) { return ergebnisObj('folgefrage', { ziel: kopie(l.items[0]), thema: th || 'info', grund: 'einziges_ergebnis' }); }
            return abschluss(l, { mehrdeutig: null }, th || 'info', 'auswahl');
        }

        /* die jüngste Ergebnisliste (Kopie) samt Alter, ohne Auswahl oder Rückfrage auszulösen; null, wenn keine da ist */
        function liste() { aufraeumen(); var l = neueste(); return l ? { art: l.art, quelle: l.quelle, alterMs: jetzt() - l.zeit, veraltet: veraltet(l), items: kopie(l.items) } : null; }
        function ausgewaehlt() { aufraeumen(); return s.auswahl ? kopie(s.auswahl.item) : null; }
        function status() {
            aufraeumen();
            return { absicht: s.absicht ? s.absicht.name : null, listen: s.listen.map(function (l) { return { art: l.art, anzahl: l.items.length, alterMs: jetzt() - l.zeit, veraltet: veraltet(l) }; }),
                     auswahl: s.auswahl ? { alterMs: jetzt() - s.auswahl.zeit } : null, offeneFragen: s.fragen.length, antworten: s.antworten.length };
        }
        function vergiss() { leer(); return true; }

        return { absicht: absicht, ergebnisse: ergebnisse, verarbeite: verarbeite, waehle: waehle, ausgewaehlt: ausgewaehlt, liste: liste, aufloesen: aufloesen, frage: frageAnlegen, offeneFragen: offeneFragen,
                 beantworte: beantworte, schliesse: schliesse, status: status, vergiss: vergiss, fehlgeschlagen: fehlgeschlagen, antwort: antwort, antworten: antworten, erzeuge: erzeuge, ZEITEN: Object.freeze(Object.assign({}, Z)) };
    }

    window.jvGespraech = erzeuge();
})();
