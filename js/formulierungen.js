/* ============================================================
   FORMULIERUNGS-WÜNSCHE: "Sag in Zukunft nicht 'Es ist 12 Uhr', sondern 'Hey mein Freund, es ist 12 Uhr'."
   Jarvis legt den Wunsch in einer Liste ab (bleibt dauerhaft gespeichert) und gibt ihn bei jeder Antwort im normalen Gespräch an die KI weiter.
   Die KI überträgt das Muster auf wechselnde Werte (14 Uhr 30 statt 12 Uhr). Im Briefing gelten die Wünsche nicht.
   Per Sprache: "Welche Formulierungen hast du dir gemerkt?" zeigt die Liste, "Vergiss die Formulierung mit dem Freund" löscht einen Wunsch.
   Braucht: actions.js (executeAction), prompt.js (buildSystemPrompt), getPersistentData/setPersistentData. Muss nach prompt.js geladen werden.
   ============================================================ */
(function () {
    const KEY = 'jv_formulierungen';
    const MAX_ITEMS = 30;

    function load() {
        try { const v = JSON.parse(getPersistentData(KEY, '[]')); return Array.isArray(v) ? v.filter(x => x && x.alt && x.neu) : []; } catch (e) { return []; }
    }
    function save(list) { try { setPersistentData(KEY, JSON.stringify(list.slice(0, MAX_ITEMS))); } catch (e) {} }
    const norm = s => String(s || '').toLowerCase().replace(/[^a-zäöüß0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

    /* ---------- Aktionen der KI ---------- */
    function saveWish(action, ctx) {
        const alt = String(action.phrase_old || '').trim().slice(0, 200);
        const neu = String(action.phrase_new || '').trim().slice(0, 300);
        if (!alt || !neu) throw userError('Mir fehlt die alte oder die neue Formulierung.');
        const list = load().filter(w => norm(w.alt) !== norm(alt));   // gleicher Wunsch ersetzt den alten
        list.unshift({ id: Date.now(), alt, neu });
        save(list);
        ctx.cards.push({ icon: '💬', title: 'Formulierung gemerkt', subtitle: `„${alt}“ → „${neu}“`.slice(0, 160) });
        try { updateTerminalStream('PHRASE_WISH: SAVED'); } catch (e) {}
    }
    function deleteWish(action, ctx) {
        const q = norm(action.phrase_query || '');
        const list = load();
        if (!list.length) throw userError('Ich habe mir keine Formulierungen gemerkt.');
        const all = action.phrase_delete_all === true || action.phrase_delete_all === 'true' || /^(alle|alles)$/.test(q);
        let rest;
        if (all) rest = [];
        else {
            const hit = list.find(w => q && (norm(w.alt).includes(q) || norm(w.neu).includes(q) || q.includes(norm(w.alt))));
            if (!hit) throw userError('Dazu habe ich keine Formulierung gefunden.');
            rest = list.filter(w => w !== hit);
        }
        save(rest);
        ctx.notes.push(all ? 'Alle Formulierungs-Wünsche sind gelöscht.' : 'Die Formulierung ist gelöscht.');
        try { updateTerminalStream('PHRASE_WISH: DELETED'); } catch (e) {}
    }

    const WISH_SAID = /(in zukunft|künftig|ab jetzt|ab sofort|von nun an|statt|anstatt|sondern|nicht mehr|formulier\w*|nenn(?:e)? mich|begrüß(?:e)? mich|merk dir)/i;

    if (typeof window.executeAction === 'function' && !window.executeAction._formulierungen) {
        const original = window.executeAction;
        const wrapped = async function (action, text, ctx) {
            // Nur speichern, wenn der User wirklich eine neue Formulierung wünscht (die KI hat sonst schon beim Aufzählen ihrer Fähigkeiten einen Wunsch "gespeichert")
            if (action && action.type === 'phrase_save') {
                if (typeof text === 'string' && !WISH_SAID.test(text)) return;
                return saveWish(action, ctx);
            }
            if (action && action.type === 'phrase_delete') return deleteWish(action, ctx);
            return original.apply(this, arguments);
        };
        wrapped._formulierungen = true;
        Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
        window.executeAction = wrapped;
    }

    /* ---------- Anweisung an die KI (nur im normalen Gespräch, das Briefing nutzt buildSystemPrompt nicht) ---------- */
    const RULES =
        '\n\nFORMULIERUNGS-WÜNSCHE: Sagt der User, wie du etwas künftig anders formulieren sollst (\'Sag in Zukunft nicht "Es ist 12 Uhr", sondern "Hey mein Freund, es ist 12 Uhr"\'), ' +
        'lege die Aktion \'phrase_save\' an mit \'phrase_old\' = die bisherige Formulierung und \'phrase_new\' = die gewünschte, beide so allgemein, dass sie auch bei anderen Werten passen ' +
        '(Uhrzeit, Zahl, Name durch das Beispiel ersetzbar lassen). Deine \'reply\' bestätigt kurz und gibt gleich ein Beispiel in der neuen Form. Will er einen Wunsch wieder loswerden, ' +
        'nutze \'phrase_delete\' mit \'phrase_query\' = Stichwort (oder \'phrase_delete_all\' = true für alle). Diese beiden Aktionen sind erlaubt, auch wenn sie in der Typenliste nicht stehen.';

    function wishBlock() {
        const list = load();
        if (!list.length) return '';
        return '\n\nDEINE FORMULIERUNGS-WÜNSCHE (der User möchte das so; wende sie bei jeder passenden Antwort an, auch wenn der Wert anders ist, zum Beispiel eine andere Uhrzeit; ' +
            'unpassende Wünsche ignorierst du, ernste Themen wie Warnungen, Gesundheit oder Fehler bleiben sachlich): ' +
            list.map(w => `statt "${w.alt}" sage "${w.neu}"`).join(' | ');
    }

    if (typeof window.buildSystemPrompt === 'function' && !window.buildSystemPrompt._formulierungen) {
        const originalPrompt = window.buildSystemPrompt;
        const wrappedPrompt = function () {
            let base = originalPrompt.apply(this, arguments);
            try { base += RULES + wishBlock(); } catch (e) {}
            return base;
        };
        wrappedPrompt._formulierungen = true;
        Object.keys(originalPrompt).forEach(k => { try { wrappedPrompt[k] = originalPrompt[k]; } catch (e) {} });
        window.buildSystemPrompt = wrappedPrompt;
    }

    /* ---------- Liste per Sprache ---------- */
    const LIST_RX = /^(?:was|welche)\s+(?:formulierungen|formulierungswünsche|sprachwünsche)|^(?:zeig(?:e)?(?:\s+mir)?|nenn(?:e)?(?:\s+mir)?|lies(?:\s+mir)?)\s+(?:mir\s+)?(?:meine\s+|die\s+|deine\s+)?(?:formulierungen|formulierungswünsche)|^welche\s+formulierungen/;
    function handleCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 80 || !LIST_RX.test(t)) return false;
        const list = load();
        const cards = list.slice(0, 8).map(w => ({ icon: '💬', title: `„${w.alt}“`, subtitle: `→ „${w.neu}“`.slice(0, 160) }));
        try { if (cards.length) { clearActionCards(); showActionCards(cards); } } catch (e) {}
        const msg = list.length ? `Ich habe mir ${list.length === 1 ? 'eine Formulierung' : list.length + ' Formulierungen'} gemerkt. Die Karten zeigen sie.` : 'Ich habe mir noch keine Formulierungen gemerkt.';
        try { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {}
        return true;
    }
    window.handleFormulierungCommand = handleCommand;
    if (typeof window.handleLocalCommand === 'function' && !window.handleLocalCommand._formulierungen) {
        const original = window.handleLocalCommand;
        const hooked = function (text) {
            try { if (handleCommand(text)) return true; } catch (e) {}
            return original.apply(this, arguments);
        };
        hooked._formulierungen = true;
        Object.keys(original).forEach(k => { try { hooked[k] = original[k]; } catch (e) {} });
        window.handleLocalCommand = hooked;
    }
})();
