/* ============================================================
   ANSCHLUSSFRAGEN (P1-Nachbesserung): verbindet js/gespraech.js mit Jarvis' freien Antworten.
     "Hast du zwei Wasserhähne-Empfehlungen?" -> Antwort -> "Wo kann ich die kaufen?" / "Was kosten die?" / "Welches ist besser?" / "Zeig mir das zweite"
   Der Handytest zeigte: Die Namen standen im Gesprächsverlauf, das Sprachmodell fragte trotzdem "Welches Produkt meinst du?". Darum bekommt das Modell den Bezug
   jetzt ausdrücklich (Systemanweisung), und fragt es trotzdem nach, wird es einmal mit dem Bezug erneut gefragt. Für Händler/Preise wird (bei eindeutigem Bezug)
   immer die Internetsuche benutzt, nie das Wissen des Modells: so entstehen keine erfundenen Händler oder Preise.

   Es gibt KEINE zweite Gesprächsspeicherung: die Antworten liegen in window.jvGespraech (.antwort / .antworten), nur im Arbeitsspeicher, 10 Minuten,
   max. 3 Stück à 700 Zeichen. Kein Langzeitgedächtnis, kein localStorage, kein Netz in diesem Skript.

   window.jvAnschlussAntwort.merke(art, frage, text, hinweis)   nach einer echten Antwort (assistant.js, kontext_lokal.js); Rückfragen, Fehlermeldungen und Zwischensätze ("Ich schaue nach.") werden NICHT gemerkt
   .anschluss(text)       true: kurzer Satz mit Bezugswort ("die", "das zweite", "welches", "besser" ...) - mögliche Anschlussfrage
   .hatBezug()            true: es gibt genau ein frisches Thema, auf das sich ein Bezugswort beziehen kann (preissuche.js lässt dann die KI den Bezug auflösen)
   .block(text)           Abschnitt für die Systemanweisung (leer, wenn keine Anschlussfrage oder nichts Frisches gemerkt)
   .nachfrageErsatz(text, ai)   falls die KI trotz Bezug zurückfragt: der Zusatz für einen zweiten Versuch, sonst ''
   .route(text)           Weg dieses Satzes VOR dem ersten KI-Aufruf: { pfad: 'direkt' (Internetsuche mit den zuletzt genannten Dingen) | 'nachfrage' (zwei Themen: Jarvis fragt selbst) | 'modell', query, text, ... }
   .haendlerFrage(text) / .ohneListenAktionen(text, actions)   eine Händler-/Preisfrage legt nie einen Einkaufslisten-/Aufgaben-Eintrag an (Aktionen werden entfernt)
   .diagnose(pfad)        eine Diagnose-Zeile (Dateiversion, Zahl der gemerkten Antworten, Pfad; keine Inhalte)
   Themenwechsel: eine neue Antwort wird zur jüngsten; ein Satz mit eigenem Gegenstand ("Wie wird das Wetter?") ist keine Anschlussfrage und bekommt keinen Zusatz.
   Mehrdeutig (zwei verschiedene frische Antworten): beide stehen im Zusatz, das Modell soll im Zweifel kurz nachfragen (nicht raten).
   ============================================================ */
(function () {
    'use strict';
    if (window.jvAnschlussAntwort) return;

    function G() { return window.jvGespraech || null; }
    var VERSION = 'unbekannt';   // Stempel aus dem Script-Tag (?v=...), nur für die Diagnose
    try { var q = document.currentScript && document.currentScript.src && /[?&]v=([\w.-]+)/.exec(document.currentScript.src); if (q) VERSION = q[1]; } catch (e) { }

    var BEZUG = '(?:die|der|das|den|dem|dessen|sie|ihn|ihnen|dort|dahin|dorthin|davon|dafür|dazu|damit|diese[nrms]?|jene[nrms]?|welche[nrms]?|erste[nrms]?|zweite[nrms]?|dritte[nrms]?|vierte[nrms]?|letzte[nrms]?|beide[nrn]?|günstiger|besser|billiger|teurer|schöner|stärker)';
    var RX_BEZUG = new RegExp('(?:^|[^A-Za-zÄÖÜäöüß])' + BEZUG + '(?![A-Za-zÄÖÜäöüß])', 'i');
    var FUELL = /^(?:bitte|mal|denn|eigentlich|überhaupt|ueberhaupt|noch|auch|dann|jetzt|online|hier|dort|günstig|guenstig|billig|am|günstigsten|guenstigsten|billigsten|vor ort|bekommen|kriegen|haben|bestellen|kaufen|finden|von|dir|mir)$/i;
    var RX_REIN = new RegExp('^' + BEZUG + '$', 'i');
    var RX_KAUFEN = /\b(?:gibt|find\w*|kauf\w*|bestell\w*|bekomm\w*|krieg\w*|kost\w*|preis\w*|teuer\w*|billig\w*|günstig\w*|guenstig\w*|angebot\w*|h[aä]ndler\w*|shop\w*|lieferbar\w*|verf[uü]gbar\w*|test\w*|bewertung\w*|erfahrung\w*|vergleich\w*)\b/i;
    var RX_NACHFRAGE = /\?|\bmeinst du\b|\bgemeint\b|\bbezieht sich\b|\bwelche[sn]?\s+(?:produkt|modell|ding|artikel|sache|ort|lokal|restaurant|meinst)|\bkannst du (?:mir )?(?:das |es )?(?:näher|naeher|genauer|präzisier|praezisier)/i;
    var HINWEIS_NAME = { internet: 'Internet-Auskunft', antwort: 'deine Antwort', fahrzeit: 'Fahrzeit', umgebung: 'Suche in der Nähe', tanken: 'Tankstellen', bahn: 'Bahn-Auskunft', foto: 'Foto-Auswertung', lokal: 'feste Auskunft' };

    function woerter(t) { return String(t == null ? '' : t).toLowerCase().replace(/[?.!,;:"„“]+/g, ' ').split(/\s+/).filter(Boolean); }

    function anschluss(text) {
        var t = String(text == null ? '' : text).trim();
        if (!t || woerter(t).length > 14) return false;
        return RX_BEZUG.test(t);
    }
    /* reiner Bezug: das Bezugswort steht am Satzende ("Wo kann ich die kaufen?", "Was kosten die?", "Zeig mir das zweite"), kein eigener Gegenstand danach ("Was kostet das Brot?" zählt nicht) */
    function reinerBezug(text) {
        var w = woerter(text);
        if (!w.length || w.length > 12) return false;
        while (w.length && FUELL.test(w[w.length - 1])) w.pop();
        return !!w.length && RX_REIN.test(w[w.length - 1]);
    }

    function frisch() { try { var g = G(); return g && typeof g.antworten === 'function' ? g.antworten() : []; } catch (e) { return []; } }

    /* Zahl der verschiedenen Themen unter den frischen Antworten: eine Antwort auf eine Anschlussfrage gehört zum Thema davor und zählt nicht extra */
    function themenListe() {
        var gesehen = {}, liste = [];
        frisch().forEach(function (a) {
            if (anschluss(a.frage)) return;
            var k = woerter(a.frage).join(' ');
            if (gesehen[k]) return; gesehen[k] = 1; liste.push(a);
        });
        return liste;
    }
    function themen() { return themenListe().length; }

    function merke(art, frage, text, hinweis) {
        try {
            var g = G(); if (!g || typeof g.antwort !== 'function') return false;
            var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
            if (t.length < 25) return false;                                            // Zwischensätze und Kurzsätze ("Ich schaue nach.", "Okay.") sind kein Ergebnis
            /* nur eine reine Rückfrage ("Welches Produkt meinst du?") wird nicht gemerkt; eine Antwort, die mit einer Frage endet ("… Soll ich Preise raussuchen?"), schon */
            if (/\?\s*$/.test(t) && t.replace(/[^.!?]*\?\s*$/, '').trim().length < 25) return false;
            return g.antwort(art, frage, t, hinweis);
        } catch (e) { return false; }
    }

    function hatBezug() { return frisch().length > 0 && themen() <= 1; }

    function alterText(ms) { var m = Math.round(ms / 60000); return m < 1 ? 'gerade eben' : 'vor ' + m + (m === 1 ? ' Minute' : ' Minuten'); }

    function block(text) {
        try {
            if (!anschluss(text)) return '';
            var l = frisch().slice(0, 2);
            if (!l.length) return '';
            var zeilen = l.map(function (a, i) {
                return (i + 1) + ') ' + alterText(a.alterMs) + ', ' + (HINWEIS_NAME[a.art] || 'Antwort') + (a.frage ? ', auf die Frage „' + a.frage + '“' : '') + ': „' + a.text + '“' + (a.hinweis ? ' [' + a.hinweis + ']' : '');
            });
            return '\n\nANSCHLUSSFRAGE – BEZUG (nur dieser Satz): Der Nutzer bezieht sich mit „die“, „das“, „das zweite“, „welches“, „besser“ o. Ä. sehr wahrscheinlich auf deine letzte Antwort:\n' + zeilen.join('\n') +
                '\n- Nimm die Namen und Modelle aus DIESER Antwort (Nr. 1 zuerst). Frage NICHT zurück, welches Produkt oder was gemeint ist, wenn die Antwort es nennt.' +
                '\n- Betrifft die Frage Händler, Preise, Verfügbarkeit oder Tests: nutze „web_lookup“ mit den genannten Namen in „web_query“ (z. B. „<Name> kaufen Preis“). Erfinde niemals Händler, Preise oder Namen.' +
                '\n- „das zweite“ / „das erste“ = die zweite / erste der dort aufgezählten Sachen. Passen mehrere gemerkte Antworten gleich gut oder wurde nichts aufgezählt, frage kurz nach (rate nicht).' +
                '\n- Ist der Satz in Wahrheit ein neues Thema ohne Bezug, ignoriere diesen Abschnitt.';
        } catch (e) { return ''; }
    }

    function istNachfrage(reply) { return typeof reply === 'string' && RX_NACHFRAGE.test(reply); }
    /* Aktionen, die eine Rückfrage der KI nicht "mitgebracht" haben darf (Einkaufsliste, Aufgabe, Gedächtnis ...): bei einem zweiten Versuch werden sie NICHT ausgeführt */
    var ZWEITVERSUCH_OK = { chat: 1, memory_search: 1, shopping: 1, todo: 1, memory_store: 1, list_edit: 1, web_lookup: 1 };
    function zweitversuchMoeglich(actions) { return !Array.isArray(actions) || actions.every(function (a) { return !a || !a.type || ZWEITVERSUCH_OK[a.type]; }); }
    function nurChat(actions) { return Array.isArray(actions) && actions.every(function (a) { return !a || !a.type || a.type === 'chat' || a.type === 'memory_search'; }); }

    function nachfrageErsatz(text, ai) {
        try {
            if (!ai || !istNachfrage(ai.reply) || !anschluss(text) || !zweitversuchMoeglich(ai.actions)) return '';
            var l = frisch(); if (!l.length || themen() > 1) return '';   // zwei verschiedene Themen: die Rückfrage der KI ist richtig
            return 'Systemhinweis: Deine Rückfrage ist nicht nötig. Der Nutzer meint mit „' + String(text).slice(0, 120) + '“ deine letzte Antwort: „' + l[0].text + '“. ' +
                'Beantworte seine Frage jetzt direkt mit den dort genannten Namen. Lege dabei KEINE Einträge auf Listen an. Für Händler, Preise oder Verfügbarkeit nutze „web_lookup“ mit den Namen in „web_query“. Erfinde keine Namen, Händler oder Preise. Antworte wieder im JSON-Format.';
        } catch (e) { return ''; }
    }

    /* ---- Händler-/Preisfrage ("Wo kann ich die kaufen?", "Wo gibt es Wasserhähne?", "Was kostet das?"): eine FRAGE, kein Auftrag für die Einkaufsliste ---- */
    var RX_FRAGE = /^\s*(?:jarvis[ ,]+)?(?:und |sag mal,? |kannst du mir sagen,? |weißt du,? |wei[sß]t du,? )?(?:wo|wie viel|wieviel|was|wer|bei wem|wann|wie teuer|wie kann ich|kann man|gibt es)\b/i;
    var RX_LISTENWORT = /\b(?:einkaufsliste|einkaufszettel|liste|setz\w*|pack\w*|f[uü]g\w*|schreib\w*|notier\w*|merk\w*|hinzu\w*|erinner\w*|aufgabe\w*|todo)\b/i;
    function haendlerFrage(text) {
        var t = String(text == null ? '' : text);
        return RX_FRAGE.test(t) && RX_KAUFEN.test(t) && !RX_LISTENWORT.test(t);
    }
    /* entfernt Einkaufslisten-/Aufgaben-Aktionen aus einer Antwort auf eine Händlerfrage; gibt die Zahl der entfernten Aktionen zurück */
    function ohneListenAktionen(text, actions) {
        try {
            if (!Array.isArray(actions) || !haendlerFrage(text)) return 0;
            var vorher = actions.length, behalten = actions.filter(function (a) {
                if (!a || typeof a !== 'object') return true;
                if (a.type === 'shopping' || a.type === 'todo') return false;
                if (a.type === 'list_edit' && /einkauf|aufgabe|todo/i.test(String(a.list_name || ''))) return false;
                return true;
            });
            actions.length = 0; behalten.forEach(function (a) { actions.push(a); });
            return vorher - actions.length;
        } catch (e) { return 0; }
    }

    function kurz(f) { return String(f || '').replace(/[?!.]+\s*$/, '').replace(/\s+/g, ' ').trim().slice(0, 70); }

    /* ROUTING (vor dem ersten KI-Aufruf): wohin geht dieser Satz?
         'direkt'    Händler-/Preisfrage mit reinem Bezugswort ("Wo kann ich die kaufen?") und genau EINEM frischen Thema (Empfehlung/Auskunft): sofort Internetsuche mit den zuletzt genannten Dingen;
                     die KI entscheidet hier nichts (sie könnte eine Einkaufslisten-Aktion daraus machen oder nach "welches Produkt" fragen)
         'nachfrage' dieselbe Frage, aber zwei verschiedene frische Themen: Jarvis fragt selbst nach, statt zu raten
         'modell'    alles andere: ganz normal zur KI (mit dem Bezug in der Anweisung) */
    function route(text) {
        var r = { pfad: 'modell', query: '', text: '', bezug: 0, themen: 0, art: '' };
        try {
            var l = frisch(); r.bezug = l.length; r.themen = themen(); r.art = l.length ? l[0].art : '';
            if (window.jvProdukte && window.jvProdukte.istFolgefrage(text)) { r.pfad = 'produkte'; return r; }   // Anschlussfrage zu den gezeigten Produktkarten: aus den gespeicherten Daten (js/produktkarten.js)
            if (window.jvProdukte && window.jvProdukte.produktsuche(text)) { r.pfad = 'produktsuche'; r.query = String(text).trim().slice(0, 400); return r; }   // Produktwunsch + Kauf-/Preisfrage in einem Satz: direkt Internetsuche, nie Ortsrückfrage oder Einkaufsliste
            if (!l.length || !reinerBezug(text) || !haendlerFrage(text)) return r;
            if (r.themen > 1) {
                var t = themenListe();
                r.pfad = 'nachfrage';
                r.text = 'Worauf bezieht sich das? Auf deine Frage „' + kurz(t[0].frage) + '“ oder auf „' + kurz(t[1].frage) + '“?';
                return r;
            }
            var a = l[0];
            if (a.art !== 'internet' && a.art !== 'antwort') return r;   // Händler/Preise nur zu Empfehlungen und Auskünften, nicht zu Fahrzeit, Bahn, Tanken
            r.pfad = 'direkt';
            r.query = String(text).trim() + ' (gemeint sind die zuletzt genannten Dinge, nicht das Wort im Satz: ' + a.text.slice(0, 400) + ')';
            return r;
        } catch (e) { return { pfad: 'modell', query: '', text: '', bezug: 0, themen: 0, art: '' }; }
    }

    /* Diagnose-Zeile (nur Zähler und Wörter, keine Inhalte, keine Schlüssel) */
    function diagnose(pfad, extra) {
        try {
            var b = frisch(), th = themen();
            var pl = null; try { pl = G().liste(); } catch (e2) { }
            return 'Anschluss: Datei ' + VERSION + ' | Bezug: ' + (b.length ? b.length + ' Antwort(en), ' + th + ' Thema/Themen, jüngste: ' + b[0].art + ', vor ' + Math.round(b[0].alterMs / 1000) + ' s' : 'keiner') + ' | Pfad: ' + pfad + ' | Produkte: ' + (pl && pl.art === 'produkte' ? pl.items.length + ' gemerkt (' + pl.items.filter(function (i) { return i.angebote && i.angebote.length; }).length + ' mit Angebot, ' + pl.items.filter(function (i) { return i.bild; }).length + ' mit Bild)' : 'keine') + (extra ? ' | ' + extra : '');
        } catch (e) { return 'Anschluss: Diagnose nicht verfügbar'; }
    }

    /* Die Systemanweisung bekommt block(text) direkt in assistant.js (keine neue Kette: die Reihenfolge der jvChain-Einträge bleibt unverändert) */
    window.jvAnschlussAntwort = { merke: merke, anschluss: anschluss, reinerBezug: reinerBezug, hatBezug: hatBezug, block: block, nachfrageErsatz: nachfrageErsatz, istNachfrage: istNachfrage,
        haendlerFrage: haendlerFrage, ohneListenAktionen: ohneListenAktionen, route: route, diagnose: diagnose, version: VERSION };
})();
