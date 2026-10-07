/* ============================================================
   LANGZEITGEDÄCHTNIS (Vektorgedächtnis, Upstash): Erlebnisse, Pläne, Vorlieben, Daten (Geburtstage), Stimmungen und Projekte.
   Strikt getrennt vom lokalen Gedächtnis (memoryItems = Gegenstände und Orte, Aktion memory_store).
   Was diese Datei macht:
   1) Aktion "episode_store": speichert einen Eintrag mit Datum, Kategorie und Status im Vektorgedächtnis, wartet auf die Antwort des Servers und
      zeigt danach die Karte "Im Langzeitgedächtnis gespeichert". Klappt es nicht, sagt Jarvis das ehrlich.
   2) Aktion "episode_asked": die KI meldet, dass sie die Nachfrage gestellt hat; dann wird sie vermerkt und es gibt heute keine weitere.
   3) Die Suche (searchSemanticMemory) liefert nur noch solche Einträge, mit Datum und Wochentag ("Wann war ich schwimmen?").
   4) Nachfragen: einmal am Tag höchstens EINE Nachfrage zu einem vergangenen Plan oder Geburtstag (Kontext "langzeit_nachfragen"); im Briefing nie.
   5) Einmaliges Aufräumen: alte Vektor-Einträge ohne Datum/Kategorie (Altlasten aus der Zeit vor der Trennung) werden gelöscht.
   Braucht: api/memory.js, actions.js (executeAction), assistant.js (searchSemanticMemory), prompt.js (buildSystemPrompt), apiFetch.
   Muss NACH assistant.js und gedaechtnis.js geladen werden.
   ============================================================ */
(function () {
    const FOLLOW_KEY = 'jv_langzeit_nachfrage_tag';
    const CLEAN_KEY = 'jv_langzeit_aufgeraeumt_v1';
    const KATEGORIEN = ['Event', 'Vorliebe', 'Projekt', 'Stimmung', 'Geburtstag'];

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    function todayIso() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function isIsoDay(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')); }
    function lesbar(iso) {
        try {
            const d = new Date(String(iso).slice(0, 10) + 'T12:00:00');
            return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
        } catch (e) { return String(iso || ''); }
    }

    async function post(body) {
        const res = await apiFetch('/api/memory', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        let data = null;
        try { data = await res.json(); } catch (e) {}
        if (!res.ok) throw new Error((data && data.error) || ('Fehler ' + res.status));
        return data || {};
    }

    /* ---------- 1) + 2) Aktionen ---------- */
    async function storeEpisode(action, ctx) {
        const text = String(action.episode_text || '').trim().slice(0, 600);
        if (!text) throw userError('Zum Merken im Langzeitgedächtnis fehlt mir der Inhalt.');
        let kat = String(action.episode_kategorie || '').trim();
        kat = KATEGORIEN.find(k => k.toLowerCase() === kat.toLowerCase()) || 'Event';
        const datum = isIsoDay(action.episode_datum) ? String(action.episode_datum) : '';
        const frage = String(action.episode_frage || '').trim().slice(0, 200);
        const hinweis = String(action.episode_hinweis || '').trim().slice(0, 200);
        const jaehrlich = action.episode_jaehrlich === true || action.episode_jaehrlich === 'true' || kat === 'Geburtstag';

        const heute = todayIso();
        const metadata = { typ: 'episode', kategorie: kat, datum_gesagt: heute, quelle: 'gespraech' };
        if (datum) metadata.ereignis_datum = datum;
        if (frage) metadata.frage = frage;
        if (hinweis) metadata.hinweis = hinweis;
        if (jaehrlich) metadata.jaehrlich = true;
        // Status: ein Plan in der Zukunft mit Nachfrage ist "offen"; alles andere braucht keine Nachfrage
        metadata.status = (datum && frage) ? 'offen' : 'ohne_nachfrage';

        const fullText = datum ? `${text} (${lesbar(datum)})` : text;
        try {
            await post({ action: 'store', text: fullText, metadata });
        } catch (e) {
            console.error('Langzeitgedächtnis: Speichern fehlgeschlagen', e);
            throw userError('Im Langzeitgedächtnis konnte ich das gerade nicht speichern.');
        }
        ctx.cards.push({
            icon: '🧠',
            title: 'Im Langzeitgedächtnis gespeichert',
            subtitle: `${kat}${datum ? ' · ' + lesbar(datum) : ''} · ${text}`.slice(0, 160)
        });
        ctx.notes.push('Im Langzeitgedächtnis gespeichert.');
        try { updateTerminalStream('LONGTERM_MEMORY: EPISODE_STORED'); } catch (e) {}
        dueCache = null;   // Nachfragen beim nächsten Mal neu holen
    }

    async function markAsked(action) {
        const id = String(action.episode_id || '').trim();
        lsSet(FOLLOW_KEY, todayIso());   // heute keine weitere Nachfrage
        if (!id) return;
        const art = String(action.episode_art || '').toLowerCase().startsWith('heute') ? 'heute' : 'nachfragen';
        try { await post({ action: 'mark', id, art, year: new Date().getFullYear() }); } catch (e) { console.error('Nachfrage-Vermerk fehlgeschlagen', e); }
        dueCache = null;
    }

    if (typeof window.executeAction === 'function' && !window.executeAction._langzeit) {
        const original = window.executeAction;
        const wrapped = async function (action, text, ctx) {
            if (action && action.type === 'episode_store') return storeEpisode(action, ctx);
            if (action && action.type === 'episode_asked') { markAsked(action); return; }
            return original.apply(this, arguments);
        };
        wrapped._langzeit = true;
        Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
        window.executeAction = wrapped;
    }

    /* ---------- 3) Suche: nur Einträge der neuen Art, mit Datum und Wochentag ---------- */
    window.searchSemanticMemory = async function (text) {
        const q = String(text || '').trim();
        if (!q || q.length < 4) return [];
        try {
            const data = await post({ action: 'search', query: q, topK: 8 });
            return (Array.isArray(data.treffer) ? data.treffer : [])
                .filter(t => t && t.text && t.metadata && t.metadata.typ === 'episode')
                .map(t => {
                    const m = t.metadata;
                    const gesagt = isIsoDay(m.datum_gesagt) ? ` (erzählt am ${lesbar(m.datum_gesagt)})` : '';
                    return `${m.kategorie || 'Eintrag'}: ${t.text}${gesagt}`;   // das Datum des Ereignisses steht schon im Text
                });
        } catch (e) {
            return [];
        }
    };

    /* ---------- 4) Nachfragen, höchstens eine pro Tag, nie im Briefing (das Briefing nutzt buildSystemPrompt nicht) ---------- */
    let dueCache = null;        // { tag, liste }
    let dueLoading = false;

    function refreshDue() {
        const heute = todayIso();
        if (dueLoading || (dueCache && dueCache.tag === heute)) return;
        dueLoading = true;
        post({ action: 'due', today: heute })
            .then(d => { dueCache = { tag: heute, liste: Array.isArray(d.due) ? d.due : [] }; })
            .catch(() => { dueCache = { tag: heute, liste: [] }; })
            .finally(() => { dueLoading = false; });
    }

    function dueBlock() {
        const heute = todayIso();
        if (lsGet(FOLLOW_KEY) === heute) return '';
        refreshDue();
        if (!dueCache || dueCache.tag !== heute || !dueCache.liste.length) return '';
        const e = dueCache.liste[0];
        const m = e.metadata || {};
        const eintrag = e.art === 'heute'
            ? { id: e.id, art: 'heute', hinweis: m.hinweis, inhalt: e.text }
            : { id: e.id, art: 'nachfragen', frage: m.frage, inhalt: e.text, ereignis: isIsoDay(m.ereignis_datum) ? lesbar(m.ereignis_datum) : '' };
        return '\n\nlangzeit_nachfragen (heute noch nicht gefragt; stelle sie genau einmal und melde es mit der Aktion episode_asked): ' + JSON.stringify(eintrag);
    }

    if (typeof window.buildSystemPrompt === 'function' && !window.buildSystemPrompt._langzeit) {
        const originalPrompt = window.buildSystemPrompt;
        const wrappedPrompt = function () {
            let base = originalPrompt.apply(this, arguments);
            try { base += dueBlock(); } catch (e) {}
            return base;
        };
        wrappedPrompt._langzeit = true;
        Object.keys(originalPrompt).forEach(k => { try { wrappedPrompt[k] = originalPrompt[k]; } catch (e) {} });
        window.buildSystemPrompt = wrappedPrompt;
    }

    /* ---------- 5) Einmaliges Aufräumen der Altlasten ---------- */
    async function cleanupOnce() {
        if (lsGet(CLEAN_KEY)) return;
        try {
            const d = await post({ action: 'listall' });
            const alt = (d.eintraege || []).filter(e => !(e.metadata && e.metadata.typ === 'episode')).map(e => e.id);
            for (let i = 0; i < alt.length; i += 100) await post({ action: 'delete', ids: alt.slice(i, i + 100) });
            lsSet(CLEAN_KEY, new Date().toISOString());
            console.log('Langzeitgedächtnis aufgeräumt, gelöscht: ' + alt.length);
        } catch (e) {
            console.error('Aufräumen des Langzeitgedächtnisses fehlgeschlagen (wird später erneut versucht)', e);
        }
    }

    setTimeout(() => { try { refreshDue(); cleanupOnce(); } catch (e) {} }, 4000);
})();
