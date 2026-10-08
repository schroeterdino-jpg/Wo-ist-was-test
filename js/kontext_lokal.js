/* ============================================================
   KONTEXT FÜR FESTE BEFEHLE: Wenn Jarvis eine Frage selbst beantwortet (Weltzeit, Feiertage, Sonne und Mond, Orte-Suche ...) und nicht die KI,
   wusste die KI bei der Anschlussfrage nichts davon ("Wie spät ist es in Istanbul?" ... "Und in New York?" -> "Worauf bezieht sich das?").
   1) Frage und gesprochene Antwort werden jetzt in den Gesprächsverlauf (chatHistory) eingetragen, damit die KI bei der nächsten Frage den Zusammenhang kennt.
   2) Uhrzeit-Anschlussfragen ("Und in New York?", "Und in Tokio?", "Was ist mit Dubai?") werden direkt zur Weltzeit umgeschrieben ("Wie spät ist es in New York?"),
      solange die letzte Zeitfrage höchstens 4 Minuten zurückliegt.
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

    function remember(userText, spoken) {
        try {
            if (typeof chatHistory === 'undefined' || !Array.isArray(chatHistory)) return;
            chatHistory.push({ role: 'user', content: String(userText) });
            chatHistory.push({ role: 'assistant', content: JSON.stringify({ reply: String(spoken), actions: [] }) });
        } catch (e) {}
    }

    /* Die erste gesprochene Antwort nach einem festen Befehl wandert in den Verlauf */
    if (typeof window.speak === 'function' && !window.speak._kl) {
        const prevSpeak = window.speak;
        const wrapped = function (text) {
            try {
                if (pending && Date.now() - pending.at < REPLY_WAIT_MS && typeof text === 'string' && text.trim()) {
                    remember(pending.text, text);
                    pending = null;
                }
            } catch (e) {}
            return prevSpeak.apply(this, arguments);
        };
        wrapped._kl = true;
        window.speak = wrapped;
    }

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