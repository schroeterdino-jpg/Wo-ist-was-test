/* ============================================================
   GEDÄCHTNIS-FRAGEN: "Warum / Wann habe ich dir gesagt ...?" richtig beantworten, plus der Lach-Wunsch.
   Die frühere Brücke "Merk dir" -> Langzeitgedächtnis ist ABGESCHAFFT: Das lokale Gedächtnis (Gegenstände und Orte) und das Langzeitgedächtnis
   (Erlebnisse, Pläne, Vorlieben, Daten; siehe langzeit.js) bleiben strikt getrennt. memory_store schreibt nur noch lokal.
   Braucht: prompt.js (buildSystemPrompt). Muss nach prompt.js geladen werden.
   ============================================================ */
(function () {
    /* ---------- 2) Fragen nach dem Gedächtnis richtig beantworten ---------- */
    const MEMORY_QUESTION = /\b(?:warum|wieso|weshalb|wann|was|wie)\b.{0,25}\b(?:habe|hab|hatte|hast|haben)\b.{0,12}\b(?:ich|wir)\b.{0,40}\b(?:gebeten|gesagt|erzählt|aufgetragen|befohlen|gewünscht|gemerkt|mitgeteilt|erklärt)\b|\bwoher\s+(?:weißt|kennst)\s+du\b|\bworan\s+erinnerst\s+du\s+dich\b|\bwas\s+weißt\s+du\s+(?:noch\s+)?(?:über|von)\s+mich\b|\bdarum\s+gebeten\b|\bdich\s+gebeten\b/i;
    const MEMORY_RULE =
        '\n\nGEDÄCHTNIS-FRAGEN: Fragt der Nutzer, warum, wann oder was er dir gesagt, aufgetragen oder dich gebeten hat, oder woher du etwas weißt, dann antworte direkt aus den Daten ' +
        '"gedächtnis" (Liste) und "gedächtnis_semantisch" (Langzeitgedächtnis) und aus dem bisherigen Gespräch. Nutze dafür KEINE memory_search-Aktion, wenn dort schon passende Einträge stehen. ' +
        'Einträge im Langzeitgedächtnis nennen Datum und Wochentag: nenne dann das Datum (zum Beispiel "Das war am Samstag, den 4. Oktober") und gib den Inhalt in eigenen Worten wieder. ' +
        'Einen Grund nennst du nur, wenn der Nutzer ihn wirklich gesagt hat. Steht dort kein Grund, sag das ehrlich ("Einen Grund haben Sie mir nicht genannt") und frag höchstens kurz, ob du dir den Grund merken sollst. ' +
        'Antworte niemals nur mit "nichts gefunden", wenn zum Thema ein Eintrag existiert. Erfinde nichts dazu.';

    // Der Nutzer wünscht sich, dass Jarvis öfter lacht (Eintrag im Gedächtnis). Die KI schreibt das Lachen selbst in die Antwort; die Stimme macht daraus ein echtes Lachen.
    const LAUGH_RULE =
        '\n\nLACHEN: Der Nutzer wünscht sich ausdrücklich, dass du öfter lachst. Schreibe darum in lockeren Antworten ab und zu ein kurzes "Haha" oder "Hehe" an eine passende Stelle, ' +
        'etwa nach einem Scherz oder wenn etwas lustig ist, in ungefähr jeder zweiten lockeren Antwort, höchstens einmal pro Antwort. Bei ernsten Themen (Warnungen, Gesundheit, Arzt, Geld, Fehler, Erinnerungen) lachst du nie.';

    if (window.jvChain) {   // Ergänzungs-Liste (commands.js)
        window.jvChain.use('buildSystemPrompt', 'gedaechtnis', function (next, args) {
            const text = args[0];
            let base = next();
            try { if (MEMORY_QUESTION.test(String(text || ''))) base += MEMORY_RULE; } catch (e) {}
            try { if (typeof window.jvLaughWish === 'function' && window.jvLaughWish()) base += LAUGH_RULE; } catch (e) {}
            return base;
        }, 300);
    }

    window.jvMemoryQuestion = (t) => MEMORY_QUESTION.test(String(t || ''));
})();