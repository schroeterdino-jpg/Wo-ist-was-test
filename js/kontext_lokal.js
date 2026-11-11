/* ============================================================
   KONTEXT FÜR FESTE BEFEHLE: Wenn Zane eine Frage selbst beantwortet (Weltzeit, Feiertage, Sonne und Mond, Orte-Suche ...) und nicht die KI,
   wusste die KI bei der Anschlussfrage nichts davon ("Wie spät ist es in Istanbul?" ... "Und in New York?" -> "Worauf bezieht sich das?").
   1) Frage und gesprochene Antwort werden jetzt in den Gesprächsverlauf (chatHistory) eingetragen, damit die KI bei der nächsten Frage den Zusammenhang kennt.
   2) Uhrzeit-Anschlussfragen ("Und in New York?", "Und in Tokio?", "Was ist mit Dubai?") werden direkt zur Weltzeit umgeschrieben ("Wie spät ist es in New York?"),
      solange die letzte Zeitfrage höchstens 4 Minuten zurückliegt.
   3) GESPRÄCHSFADEN FÜR FRÜH BEANTWORTENDE BEFEHLE (window.jvKontext): Befehle mit kleiner Rangzahl (Schicht, Plan, Was steht an ...) antworten, bevor dieser Eintrag (Rang 900) sie sieht.
      Sie tragen ihre fertige Antwort deshalb selbst ein: jvKontext.merke(frage, antwort, { name: 'arbeit' | 'tag' | ..., daten: {...} }).
      Es wird nur eingetragen, was ein Befehl ausdrücklich meldet (keine Mails, Bankdaten oder andere private Antworten) und nie eine Rückfrage (Antwort endet mit "?").
      Eingetragen wird in den vorhandenen Verlauf (chatHistory) und als Gesprächsabsicht in jvGespraech; keine neue Ablage.
      jvKontext.thema(maxMs) liefert das Thema nur für den unmittelbar nächsten Satz (voice.js meldet jeden Nutzersatz mit jvKontext.eingang()) und nur, wenn seitdem nichts anderes in den Verlauf kam.
   Braucht: voice.js (speak), localcommands.js (handleLocalCommand), assistant.js (chatHistory). Muss ganz am Ende der Skripte geladen werden.
   ============================================================ */
(function () {
    const WINDOW_MS = 4 * 60000;      // so lange gilt "Und in ...?" als Anschluss an die letzte Zeitfrage
    const REPLY_WAIT_MS = 20000;      // so lange wird auf die gesprochene Antwort zum festen Befehl gewartet
    let pending = null;               // { text, at }: ein fester Befehl wurde behandelt, seine Antwort fehlt noch im Verlauf
    let lastTime = 0;                 // Zeitpunkt der letzten Zeitfrage mit Ortsangabe
    const norm = s => String(s || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();

    const TIME_Q = /\b(?:wie spät|wie viel uhr|wieviel uhr|wie viel zeit|uhrzeit|zeitunterschied)\b.*\bin\b\s+\S+/;
    const FOLLOW = /^(?:und\s+)?(?:wie spät ist es\s+|wie viel uhr ist es\s+|wie ist es\s+|was ist mit\s+|wie sieht es aus\s+)?(?:in|bei|auf|für)\s+(.+)$|^(?:und\s+)?(?:was ist mit|wie ist es mit)\s+(.+)$/;

    let eingangNr = 0;                // Zähler der Nutzersätze (voice.js meldet jeden mit jvKontext.eingang())
    const THEMA_MS = 10 * 60000;      // so lange gilt ein Gesprächsthema höchstens für eine Anschlussfrage

    /* Frage + Antwort in den vorhandenen Verlauf und das Thema ins Gesprächsgedächtnis (jvGespraech). Gibt true zurück, wenn eingetragen wurde. */
    function eintragen(userText, spoken, thema, mitAnschluss) {
        try {
            if (typeof chatHistory === 'undefined' || !Array.isArray(chatHistory)) return false;
            const f = String(userText || '').trim(), a = String(spoken || '').trim().slice(0, 700);
            if (!f || !a) return false;
            const l = chatHistory.length, vorher = l >= 2 ? chatHistory[l - 2] : null, antw = JSON.stringify({ reply: a, actions: [] });
            const doppelt = !!(vorher && vorher.role === 'user' && vorher.content === f && chatHistory[l - 1] && chatHistory[l - 1].content === antw);   // dieselbe Frage mit derselben Antwort liegt schon hinten im Verlauf
            if (!doppelt) {
                chatHistory.push({ role: 'user', content: f });
                chatHistory.push({ role: 'assistant', content: antw });
            }
            if (mitAnschluss && window.jvAnschlussAntwort) window.jvAnschlussAntwort.merke('lokal', f, a, '');   // Anschlussfragen (js/gespraech_antwort.js)
            if (window.jvGespraech && typeof window.jvGespraech.absicht === 'function') {
                const d = Object.assign({}, thema && thema.daten, { eingang: eingangNr, n: chatHistory.length });
                window.jvGespraech.absicht(thema && thema.name ? thema.name : 'lokal', d);   // ohne Thema: "lokal" = anderes Thema, ein früheres (z. B. Arbeit) gilt nicht mehr
            }
            return true;
        } catch (e) { return false; }
    }
    function remember(userText, spoken) { eintragen(userText, spoken, null, true); }

    window.jvKontext = {
        eingang: function () { eingangNr++; },
        merke: function (frage, antwort, thema) {
            const a = String(antwort == null ? '' : antwort).trim();
            if (!a || /\?\s*$/.test(a)) return false;   // keine Rückfragen: die verwaltet der jeweilige Befehl selbst
            if (pending && pending.text === String(frage)) pending = null;   // nicht zusätzlich über die Sprachausgabe eintragen
            return eintragen(frage, a, thema, false);
        },
        thema: function (maxMs) {
            try {
                const g = window.jvGespraech; if (!g || typeof g.absicht !== 'function') return null;
                const x = g.absicht(); if (!x || !x.daten || x.name === 'lokal') return null;
                if (x.seitMs > (maxMs > 0 ? maxMs : THEMA_MS)) return null;
                if (eingangNr - Number(x.daten.eingang) > 1) return null;   // zwischendurch wurde etwas anderes gesagt
                if (typeof chatHistory === 'undefined' || !Array.isArray(chatHistory) || chatHistory.length !== Number(x.daten.n)) return null;   // und nichts anderes beantwortet
                const d = Object.assign({}, x.daten); delete d.eingang; delete d.n;
                return { name: x.name, daten: d };
            } catch (e) { return null; }
        }
    };

    /* Die erste gesprochene Antwort nach einem festen Befehl wandert in den Verlauf */
    // Phase 4B: Stufe 20 der Speak-Kette (js/speak_kette.js); "prevSpeak" ist die nächste Stufe weiter innen
    window.jvSpeakKette.anmelden('kontext_lokal', 20, function (prevSpeak) {
        return function (text) {
            try {
                if (pending && Date.now() - pending.at < REPLY_WAIT_MS && typeof text === 'string' && text.trim()) {
                    remember(pending.text, text);
                    pending = null;
                }
            } catch (e) {}
            return prevSpeak.apply(this, arguments);
        };
    });

    if (window.jvCommands) {   // Befehlsliste (commands.js)
        window.jvCommands.use('kontext_lokal', function (text, next) {
            let t = norm(text);
            // Anschlussfrage zur Uhrzeit: "Und in New York?" -> "Wie spät ist es in New York?"
            if (lastTime && Date.now() - lastTime < WINDOW_MS && t && t.length <= 60 && !/\b(?:wetter|regen|temperatur|feiertag|termin|zug|bahn)\b/.test(t)) {
                const m = t.match(FOLLOW);
                const place = m && (m[1] || m[2]);
                if (place && place.split(' ').length <= 4 && !/\b(?:mein\w*|dein\w*|unser\w*|mir|mich|dir|auto|haus|arbeit|zuhause|hause|parkplatz|termin\w*|aufgabe\w*|liste\w*)\b/.test(place)) {
                    const rewritten = 'Wie spät ist es in ' + place.replace(/^(?:der|die|das|dem)\s+/, '');
                    let handled = false;
                    pending = { text: String(text), at: Date.now() };   // vor dem Aufruf: die Antwort kommt schon währenddessen
                    try { handled = next(rewritten); } catch (e) { handled = false; }
                    if (handled) { lastTime = Date.now(); return true; }
                    pending = null;
                }
            }
            pending = { text: String(text), at: Date.now() };   // vor dem Aufruf: feste Befehle antworten oft sofort
            let handled = false;
            try { handled = next(text); } catch (e) { pending = null; throw e; }
            if (handled) { if (TIME_Q.test(t)) lastTime = Date.now(); }
            else pending = null;
            return handled;
        }, 900);
    }
})();