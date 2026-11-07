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
   .websuche(text, ai, actions) falls "wo kaufen / was kostet / Test" mit reinem Bezugswort ("die") gefragt wurde: die Suchanfrage für die Internetsuche, sonst ''
   Themenwechsel: eine neue Antwort wird zur jüngsten; ein Satz mit eigenem Gegenstand ("Wie wird das Wetter?") ist keine Anschlussfrage und bekommt keinen Zusatz.
   Mehrdeutig (zwei verschiedene frische Antworten): beide stehen im Zusatz, das Modell soll im Zweifel kurz nachfragen (nicht raten).
   ============================================================ */
(function () {
    'use strict';
    if (window.jvAnschlussAntwort) return;

    function G() { return window.jvGespraech || null; }

    var BEZUG = '(?:die|der|das|den|dem|dessen|sie|ihn|ihnen|dort|dahin|dorthin|davon|dafür|dazu|damit|diese[nrms]?|jene[nrms]?|welche[nrms]?|erste[nrms]?|zweite[nrms]?|dritte[nrms]?|vierte[nrms]?|letzte[nrms]?|beide[nrn]?|günstiger|besser|billiger|teurer|schöner|stärker)';
    var RX_BEZUG = new RegExp('(?:^|[^A-Za-zÄÖÜäöüß])' + BEZUG + '(?![A-Za-zÄÖÜäöüß])', 'i');
    var FUELL = /^(?:bitte|mal|denn|eigentlich|überhaupt|ueberhaupt|noch|auch|dann|jetzt|online|hier|dort|günstig|guenstig|billig|am|günstigsten|guenstigsten|billigsten|vor ort|bekommen|kriegen|haben|bestellen|kaufen|finden|von|dir|mir)$/i;
    var RX_REIN = new RegExp('^' + BEZUG + '$', 'i');
    var RX_KAUFEN = /\b(?:gibt|find\w*|kauf\w*|bestell\w*|bekomm\w*|krieg\w*|kost\w*|preis\w*|teuer\w*|billig\w*|günstig\w*|guenstig\w*|angebot\w*|h[aä]ndler\w*|shop\w*|lieferbar\w*|verf[uü]gbar\w*|test\w*|bewertung\w*|erfahrung\w*|vergleich\w*)\b/i;
    var RX_NACHFRAGE = /\?|\bmeinst du\b|\bgemeint\b|\bbezieht sich\b|\bwelche[sn]?\s+(?:produkt|modell|ding|artikel|sache|ort|lokal|restaurant|meinst)|\bkannst du (?:mir )?(?:das |es )?(?:näher|naeher|genauer|präzisier|praezisier)/i;
    var HINWEIS_NAME = { internet: 'Internet-Auskunft', antwort: 'deine Antwort', fahrzeit: 'Fahrzeit', umgebung: 'Suche in der Nähe', tanken: 'Tankstellen', bahn: 'Bahn-Auskunft', lokal: 'feste Auskunft' };

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
    function themen() { var n = 0; frisch().forEach(function (a) { if (!anschluss(a.frage)) n++; }); return n; }

    function merke(art, frage, text, hinweis) {
        try {
            var g = G(); if (!g || typeof g.antwort !== 'function') return false;
            var t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
            if (t.length < 25) return false;                                            // Zwischensätze und Kurzsätze ("Ich schaue nach.", "Okay.") sind kein Ergebnis
            if (RX_NACHFRAGE.test(t) && t.length < 160 && /\?\s*$/.test(t)) return false;   // eine kurze Rückfrage ersetzt keine gute Antwort
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
    function nurChat(actions) { return Array.isArray(actions) && actions.every(function (a) { return !a || !a.type || a.type === 'chat' || a.type === 'memory_search'; }); }

    function nachfrageErsatz(text, ai) {
        try {
            if (!ai || !istNachfrage(ai.reply) || !anschluss(text) || !nurChat(ai.actions)) return '';
            var l = frisch(); if (!l.length || themen() > 1) return '';   // zwei verschiedene Themen: die Rückfrage der KI ist richtig
            return 'Systemhinweis: Deine Rückfrage ist nicht nötig. Der Nutzer meint mit „' + String(text).slice(0, 120) + '“ deine letzte Antwort: „' + l[0].text + '“. ' +
                'Beantworte seine Frage jetzt direkt mit den dort genannten Namen. Für Händler, Preise oder Verfügbarkeit nutze „web_lookup“ mit den Namen in „web_query“. Erfinde keine Namen, Händler oder Preise. Antworte wieder im JSON-Format.';
        } catch (e) { return ''; }
    }

    function websuche(text, ai, actions) {
        try {
            if (!reinerBezug(text) || !RX_KAUFEN.test(String(text))) return '';
            var l = frisch(); if (!l.length || themen() > 1) return '';   // mehrdeutig: nicht raten, die KI fragt nach
            var a = l[0];
            if (a.art !== 'internet' && a.art !== 'antwort') return '';               // Händler/Preise nur zu Empfehlungen und Auskünften, nicht zu Fahrzeit, Bahn, Tanken
            if (!nurChat(actions)) return '';
            return String(text).trim() + ' (gemeint sind die zuletzt genannten Dinge: ' + a.text.slice(0, 400) + ')';
        } catch (e) { return ''; }
    }

    /* Die Systemanweisung bekommt block(text) direkt in assistant.js (keine neue Kette: die Reihenfolge der jvChain-Einträge bleibt unverändert) */
    window.jvAnschlussAntwort = { merke: merke, anschluss: anschluss, reinerBezug: reinerBezug, hatBezug: hatBezug, block: block, nachfrageErsatz: nachfrageErsatz, websuche: websuche };
})();
