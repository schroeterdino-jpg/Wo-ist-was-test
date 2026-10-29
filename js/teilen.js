/* ============================================================
   teilen.js – "Schick das per WhatsApp": die letzte Antwort von Jarvis (Brief, Rechnung, Zettel, Übersetzung, Stundenplan ...),
   die Einkaufsliste oder die Aufgabenliste als Text verschicken.
   ============================================================
   Beispiele:  "Schick das per WhatsApp"  /  "Schick mir die Einkaufsliste per WhatsApp"  /  "Verschick die Aufgabenliste über WhatsApp"
   Gesendet wird Text. Bilder selbst lassen sich über diesen Weg nicht anhängen.
   Rezepte haben ihren eigenen Knopf (foto_rezept.js) und gehen vor, solange ein Rezept offen ist oder "Rezept" gesagt wird.
   Braucht: voice.js (speak), commands.js (jvCommands). Wird ganz am Ende der Skripte geladen.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvTeilen) return;

    const FRISCH_MS = 30 * 60 * 1000;   // so lange gilt "das" für die letzte Antwort
    let lastReply = '';
    let lastAt = 0;
    let eigenesSagen = false;

    function norm(t) {
        return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function sagen(t) {
        eigenesSagen = true;
        try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { }
        eigenesSagen = false;
    }

    /* Jede längere Antwort von Jarvis merken (kurze Bestätigungen wie "Okay." nicht) */
    // Phase 4B: Stufe 10 (ganz außen) der Speak-Kette (js/speak_kette.js); "orig" ist die nächste Stufe weiter innen
    window.jvSpeakKette.anmelden('teilen', 10, function (orig) {
        return function (text) {
            try {
                const t = String(text == null ? '' : text).trim();
                if (!eigenesSagen && t.length >= 40) { lastReply = t; lastAt = Date.now(); }
            } catch (e) { }
            return orig.apply(this, arguments);
        };
    });

    function listeAlsText(titel, eintraege) {
        const zeilen = (eintraege || []).map(e => (e && e.text) ? '• ' + String(e.text).trim() : '').filter(Boolean);
        return zeilen.length ? '*' + titel + '*\n' + zeilen.join('\n') : '';
    }

    function schicken(text) {
        const url = 'https://wa.me/?text=' + encodeURIComponent(text);
        try {
            const w = window.open(url, '_blank');
            if (!w && !window.ZaneNative) window.location.href = url;
            sagen('WhatsApp öffnet sich. Such dort die Person aus, der du es schicken willst.');
        } catch (e) { sagen('Das Senden hat nicht geklappt.'); }
    }

    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 14) return next(text);
        const whats = /\bwhats ?app\b|\bwhatsapp\b/.test(t);
        const verb = /\b(schick\w*|send\w*|verschick\w*|teil\w*|weiterleit\w*|leite\w*)\b/.test(t);
        if (!(whats && verb) && !/\bper whats ?app\b/.test(t)) return next(text);

        // Rezepte haben ihren eigenen Weg
        try { if (/\brezept\w*\b/.test(t) || (window.jvRezept && typeof window.jvRezept.hatEntwurf === 'function' && window.jvRezept.hatEntwurf())) return next(text); } catch (e) { }

        if (/\beinkauf\w*\b/.test(t)) {
            const s = listeAlsText('Einkaufsliste', typeof shoppingEntries !== 'undefined' ? shoppingEntries : []);
            if (!s) { sagen('Die Einkaufsliste ist leer, da gibt es nichts zu schicken.'); return true; }
            schicken(s); return true;
        }
        if (/\b(aufgabe\w*|todo\w*|to do)\b/.test(t)) {
            const s = listeAlsText('Aufgaben', typeof todoEntries !== 'undefined' ? todoEntries : []);
            if (!s) { sagen('Die Aufgabenliste ist leer, da gibt es nichts zu schicken.'); return true; }
            schicken(s); return true;
        }
        if (lastReply && Date.now() - lastAt < FRISCH_MS) { schicken(lastReply); return true; }
        sagen('Ich habe gerade nichts, das ich verschicken könnte. Lass mich zuerst etwas vorlesen oder auswerten, dann schick ich es dir.');
        return true;
    }

    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('teilen', befehl, 6);
    window.jvTeilen = { schicken, letzte: () => lastReply };
})();
