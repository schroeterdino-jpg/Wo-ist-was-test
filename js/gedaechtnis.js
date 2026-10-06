(function () {
    const lastStored = {};

    function describeNow() {
        const now = new Date();
        const datum = now.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Berlin' });
        const zeit = now.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' });
        const iso = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        return { datum, zeit, iso };
    }

    function rememberInLongTerm(action, text) {
        try {
            const said = String(text || '').trim().slice(0, 300);
            if (!said || typeof window.storeSemanticMemory !== 'function' && typeof storeSemanticMemory !== 'function') return;
            const now = Date.now();
            if (lastStored[said] && now - lastStored[said] < 15000) return;
            lastStored[said] = now;
            const d = describeNow();
            const bits = Object.keys(action || {})
                .filter(k => /memory/i.test(k) && k !== 'type' && action[k] != null && typeof action[k] !== 'object')
                .map(k => String(action[k]).trim()).filter(Boolean);
            const eintrag = bits.length ? ` (gemerkt als: ${bits.join(' - ').slice(0, 160)})` : '';
            const entry = `Am ${d.datum} um ${d.zeit} hat der Nutzer ausdrücklich darum gebeten, sich Folgendes zu merken: "${said}"${eintrag}`;
            (window.storeSemanticMemory || storeSemanticMemory)(entry, { quelle: 'merk_dir', datum: d.iso });
        } catch (e) {}
    }

    if (typeof window.executeAction === 'function' && !window.executeAction._gedaechtnis) {
        const originalExecute = window.executeAction;
        const wrappedExecute = async function (action, text) {
            const result = await originalExecute.apply(this, arguments);
            try { if (action && action.type === 'memory_store') rememberInLongTerm(action, text); } catch (e) {}
            return result;
        };
        wrappedExecute._gedaechtnis = true;
        window.executeAction = wrappedExecute;
    }

    const MEMORY_QUESTION = /\b(?:warum|wieso|weshalb|wann|was|wie)\b.{0,25}\b(?:habe|hab|hatte|hast|haben)\b.{0,12}\b(?:ich|wir)\b.{0,40}\b(?:gebeten|gesagt|erzählt|aufgetragen|befohlen|gewünscht|gemerkt|mitgeteilt|erklärt)\b|\bwoher\s+(?:weißt|kennst)\s+du\b|\bworan\s+erinnerst\s+du\s+dich\b|\bwas\s+weißt\s+du\s+(?:noch\s+)?(?:über|von)\s+mich\b|\bdarum\s+gebeten\b|\bdich\s+gebeten\b/i;
    const MEMORY_RULE =
        '\n\nGEDÄCHTNIS-FRAGEN: Fragt der Nutzer, warum, wann oder was er dir gesagt, aufgetragen oder dich gebeten hat, oder woher du etwas weißt, dann antworte direkt aus den Daten ' +
        '"gedächtnis" (Liste) und "gedächtnis_semantisch" (Langzeitgedächtnis) und aus dem bisherigen Gespräch. Nutze dafür KEINE memory_search-Aktion, wenn dort schon passende Einträge stehen. ' +
        'Einträge im Langzeitgedächtnis nennen Datum und Uhrzeit und den Originalsatz des Nutzers: nenne dann das Datum (zum Beispiel "Das haben Sie am Samstag, den 4. Oktober, gesagt") und gib seinen Wunsch in eigenen Worten wieder. ' +
        'Einen Grund nennst du nur, wenn der Nutzer ihn wirklich gesagt hat. Steht dort kein Grund, sag das ehrlich ("Einen Grund haben Sie mir nicht genannt") und frag höchstens kurz, ob du dir den Grund merken sollst. ' +
        'Antworte niemals nur mit "nichts gefunden", wenn zum Thema ein Eintrag existiert. Erfinde nichts dazu.';

    const LAUGH_RULE =
        '\n\nLACHEN: Der Nutzer wünscht sich ausdrücklich, dass du öfter lachst. Schreibe darum in lockeren Antworten ab und zu ein kurzes "Haha" oder "Hehe" an eine passende Stelle, ' +
        'etwa nach einem Scherz oder wenn etwas lustig ist, in ungefähr jeder zweiten lockeren Antwort, höchstens einmal pro Antwort. Bei ernsten Themen (Warnungen, Gesundheit, Arzt, Geld, Fehler, Erinnerungen) lachst du nie.';

    if (typeof window.buildSystemPrompt === 'function' && !window.buildSystemPrompt._gedaechtnis) {
        const originalPrompt = window.buildSystemPrompt;
        const wrappedPrompt = function (text) {
            let base = originalPrompt.apply(this, arguments);
            try { if (MEMORY_QUESTION.test(String(text || ''))) base += MEMORY_RULE; } catch (e) {}
            try { if (typeof window.jvLaughWish === 'function' && window.jvLaughWish()) base += LAUGH_RULE; } catch (e) {}
            return base;
        };
        wrappedPrompt._gedaechtnis = true;
        Object.keys(originalPrompt).forEach(k => { try { wrappedPrompt[k] = originalPrompt[k]; } catch (e) {} });
        window.buildSystemPrompt = wrappedPrompt;
    }

    window.jvMemoryQuestion = (t) => MEMORY_QUESTION.test(String(t || ''));
})();
