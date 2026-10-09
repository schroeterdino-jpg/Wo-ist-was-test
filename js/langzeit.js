/* ============================================================
   LANGZEITGEDÄCHTNIS (Vektorgedächtnis, Upstash): Erlebnisse, Pläne, Vorlieben, Daten (Geburtstage), Stimmungen und Projekte.
   Strikt getrennt vom lokalen Gedächtnis (memoryItems = Gegenstände und Orte, Aktion memory_store).
   Was diese Datei macht:
   1) Aktion "episode_store": speichert einen Eintrag mit Datum, Kategorie und Status im Vektorgedächtnis, wartet auf die Antwort des Servers und
      zeigt danach die Karte "Im Langzeitgedächtnis gespeichert". Klappt es nicht, sagt Jarvis das ehrlich.
   2) Aktion "episode_asked": die KI meldet, dass sie die Nachfrage gestellt hat; dann wird sie vermerkt und es gibt heute keine weitere.
   3) Die Suche (searchSemanticMemory) liefert nur noch solche Einträge, mit Datum und Wochentag ("Wann war ich schwimmen?").
   4) Nachfragen: einmal am Tag höchstens EINE Nachfrage zu einem vergangenen Plan oder Geburtstag (Kontext "langzeit_nachfragen"); im Briefing nie.
   5) Fenster "Langzeitgedächtnis" (Menü, oder per Sprache): alle Einträge ansehen und einzeln löschen. "Vergiss das mit dem Schwimmen" löscht per Sprache.
   6) Einmaliges Aufräumen: alte Vektor-Einträge ohne Datum/Kategorie (Altlasten aus der Zeit vor der Trennung) werden gelöscht.
   Braucht: api/memory.js, actions.js (executeAction), assistant.js (searchSemanticMemory), prompt.js (buildSystemPrompt), apiFetch.
   Muss NACH assistant.js und gedaechtnis.js geladen werden.
   ============================================================ */
(function () {
    const FOLLOW_KEY = 'jv_langzeit_nachfrage_tag';
    const CLEAN_KEY = 'jv_langzeit_aufgeraeumt_v1';
    const AUTO_FRAGE = 'Frage beiläufig, wie es war.';
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
        // Status: ein Plan mit Nachfrage ist "offen"; alles andere braucht keine Nachfrage.
        // Hat die KI bei einem Event von heute oder später keine Frage mitgeschickt, wird trotzdem nachgefragt (beiläufig, wie es war).
        if (!frage && kat === 'Event' && datum && datum >= heute) metadata.frage = AUTO_FRAGE;
        metadata.status = (datum && metadata.frage) ? 'offen' : 'ohne_nachfrage';

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
            if (action && action.type === 'episode_forget') return forgetEpisode(action, ctx);
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
            : { id: e.id, art: 'nachfragen', frage: (m.frage && m.frage !== AUTO_FRAGE) ? m.frage : 'Frage beiläufig, wie es war (zum Eintrag passend, z.B. "Wie war es beim Schwimmen?")', inhalt: e.text, ereignis: isIsoDay(m.ereignis_datum) ? lesbar(m.ereignis_datum) : '' };
        return '\n\nlangzeit_nachfragen (heute noch nicht gefragt; stelle sie genau einmal, ganz beiläufig und locker nebenbei in einem passenden Moment des Gesprächs, nicht als steife Pflichtfrage, und melde es mit der Aktion episode_asked): ' + JSON.stringify(eintrag);
    }

    if (window.jvChain) {   // Ergänzungs-Liste (commands.js)
        window.jvChain.use('buildSystemPrompt', 'langzeit', function (next) {
            let base = next();
            try { base += dueBlock(); } catch (e) {}
            return base;
        }, 200);
    }


    /* "Vergiss das mit dem Schwimmen": den passendsten Eintrag suchen und löschen; Jarvis nennt, was gelöscht wurde */
    async function forgetEpisode(action, ctx) {
        const q = String(action.episode_query || '').trim();
        if (!q) throw userError('Ich weiß nicht, welchen Eintrag ich vergessen soll.');
        let data;
        try { data = await post({ action: 'search', query: q, topK: 5 }); }
        catch (e) { throw userError('Das Langzeitgedächtnis konnte ich gerade nicht erreichen.'); }
        const hit = (data.treffer || []).find(t => t && t.id && t.metadata && t.metadata.typ === 'episode');
        if (!hit) throw userError('Dazu habe ich im Langzeitgedächtnis nichts gefunden.');
        try { await post({ action: 'delete', ids: [hit.id] }); }
        catch (e) { throw userError('Das Löschen im Langzeitgedächtnis hat nicht geklappt.'); }
        dueCache = null;
        ctx.notes.push('Gelöscht: ' + String(hit.text).replace(/\s*\([^)]*\d{4}\)\s*$/, '').slice(0, 120));
        try { if (ltEl) showLangzeit(); } catch (e) {}
    }

    /* ---------- Fenster ---------- */
    let ltEl = null;
    function ltStyle() {
        if (document.getElementById('ltStyle')) return;
        const st = document.createElement('style');
        st.id = 'ltStyle';
        st.textContent =
            '#ltMap{position:fixed;inset:0;z-index:93;background:rgba(4,9,15,.97);color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
            '#ltMap .lt-head{padding:18px 18px 8px;text-align:center}#ltMap .lt-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.14em;color:#49d7ff}' +
            '#ltMap .lt-sub{font:500 12px "IBM Plex Mono",monospace;color:#7fb8cf;margin-top:4px}' +
            '#ltMap .lt-list{flex:1 1 auto;overflow-y:auto;padding:8px 16px}' +
            '#ltMap .lt-item{display:flex;gap:10px;align-items:flex-start;border:1px solid rgba(93,209,255,.3);border-radius:10px;background:rgba(10,22,33,.88);padding:10px 11px;margin-bottom:8px}' +
            '#ltMap .lt-body{flex:1 1 auto;min-width:0}#ltMap .lt-meta{font:600 11px "IBM Plex Mono",monospace;color:#ffb347;letter-spacing:.06em;text-transform:uppercase;margin-bottom:3px}' +
            '#ltMap .lt-text{font-size:15px;line-height:1.25;color:#e8f3f9;word-break:break-word}' +
            '#ltMap .lt-del{flex:0 0 auto;border:1px solid rgba(255,107,107,.6);color:#ff8a8a;background:rgba(0,0,0,.5);border-radius:8px;padding:6px 9px;font:700 12px "IBM Plex Mono",monospace}' +
            '#ltMap .lt-note{font-size:14px;color:#7fb8cf;text-align:center;padding:24px 8px}' +
            '#ltMap .lt-bar{display:flex;gap:10px;padding:8px 16px 14px}' +
            '#ltMap .lt-btn{flex:1;padding:11px 8px;border-radius:10px;border:1px solid rgba(93,209,255,.4);background:rgba(10,22,33,.95);color:#49d7ff;font:700 13px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase}';
        document.head.appendChild(st);
    }
    function closeLangzeit() {
        if (!ltEl) return false;
        try { ltEl.remove(); } catch (e) {}
        ltEl = null;
        try { document.body.classList.remove('panel-open'); } catch (e) {}
        try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) {}
        return true;
    }
    async function showLangzeit() {
        ltStyle();
        try { if (typeof closePanel === 'function') closePanel(); } catch (e) {}
        const fresh = !ltEl;
        if (ltEl) { try { ltEl.remove(); } catch (e) {} }
        const mk = (parent, tag, cls, text) => { const x = document.createElement(tag); if (cls) x.className = cls; if (text !== undefined) x.textContent = text; parent.appendChild(x); return x; };
        const el = document.createElement('div');
        el.id = 'ltMap';
        const head = mk(el, 'div', 'lt-head');
        mk(head, 'div', 'lt-title', '🧠 LANGZEITGEDÄCHTNIS');
        const sub = mk(head, 'div', 'lt-sub', 'wird geladen ...');
        const list = mk(el, 'div', 'lt-list');
        const bar = mk(el, 'div', 'lt-bar');
        const refresh = mk(bar, 'button', 'lt-btn', 'Aktualisieren');
        refresh.addEventListener('click', () => showLangzeit());
        mk(bar, 'button', 'lt-btn', 'Schließen').addEventListener('click', closeLangzeit);
        document.body.appendChild(el);
        ltEl = el;
        if (fresh) { try { document.body.classList.add('panel-open'); } catch (e) {} try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) {} }

        let eintraege = [];
        try {
            const d = await post({ action: 'listall' });
            eintraege = (d.eintraege || []).filter(e => e.metadata && (e.metadata.typ === 'episode' || e.metadata.typ === 'frist'));
        } catch (e) {
            sub.textContent = 'Nicht erreichbar';
            mk(list, 'div', 'lt-note', 'Das Langzeitgedächtnis kann gerade nicht geladen werden. Prüfen Sie die Internetverbindung.');
            return;
        }
        // neueste Ereignisse zuerst; Einträge ohne Ereignisdatum nach dem Tag, an dem sie erzählt wurden
        const key = e => String(e.metadata.ereignis_datum || e.metadata.datum_gesagt || '');
        eintraege.sort((a, b) => key(b).localeCompare(key(a)));
        sub.textContent = eintraege.length === 1 ? '1 Eintrag' : eintraege.length + ' Einträge';
        if (!eintraege.length) mk(list, 'div', 'lt-note', 'Noch nichts gespeichert. Erzählen Sie mir etwas, zum Beispiel „Ich gehe morgen schwimmen“.');
        eintraege.forEach(e => {
            const m = e.metadata;
            const row = mk(list, 'div', 'lt-item');
            const body = mk(row, 'div', 'lt-body');
            const datum = isIsoDay(m.ereignis_datum) ? lesbar(m.ereignis_datum) : (isIsoDay(m.datum_gesagt) ? 'erzählt am ' + lesbar(m.datum_gesagt) : '');
            mk(body, 'div', 'lt-meta', [m.kategorie || 'Eintrag', datum, (m.jaehrlich === true || m.jaehrlich === 'true') ? 'jährlich' : ''].filter(Boolean).join(' · '));
            mk(body, 'div', 'lt-text', String(e.text || '').replace(/\s*\([^)]*\d{4}\)\s*$/, ''));
            const del = mk(row, 'button', 'lt-del', 'Löschen');
            del.addEventListener('click', async () => {
                if (del.dataset.sure !== '1') { del.dataset.sure = '1'; del.textContent = 'Sicher?'; setTimeout(() => { if (del.isConnected) { del.dataset.sure = ''; del.textContent = 'Löschen'; } }, 4000); return; }
                del.disabled = true; del.textContent = '...';
                try { await post({ action: 'delete', ids: [e.id] }); row.remove(); dueCache = null; sub.textContent = list.querySelectorAll('.lt-item').length + ' Einträge'; }
                catch (err) { del.disabled = false; del.textContent = 'Fehler'; }
            });
        });
    }
    window.showLangzeit = showLangzeit;
    window.closeLangzeit = closeLangzeit;

    // "Schließen" per Sprache und andere Fenster arbeiten mit dem Langzeit-Fenster zusammen
    try {
        if (typeof isPanelOpen === 'function') { const o = isPanelOpen; window.isPanelOpen = isPanelOpen = function () { return !!ltEl || o.apply(this, arguments); }; }
        if (typeof closePanel === 'function') { const o = closePanel; window.closePanel = closePanel = function () { closeLangzeit(); return o.apply(this, arguments); }; }
    } catch (e) {}

    // Sprachbefehle zum Öffnen
    const OPEN_RX = /^(?:zeig(?:e)?(?: mir)?|öffne|mach|was steht in)?\s*(?:mir\s+)?(?:bitte\s+)?(?:mal\s+)?(?:(?:den|das|die|mein|meinen|meine|dein|deinen|deine)\s+)*(?:langzeit[\s-]?gedächtnis|vektor[\s-]?gedächtnis|langzeit[\s-]?speicher)(?:\s+bitte)?$/;
    const WHAT_RX = /^(?:was\s+weißt\s+du\s+(?:alles\s+)?(?:so\s+)?(?:über|von)\s+mich|was\s+hast\s+du\s+dir\s+(?:alles\s+)?(?:über\s+mich\s+)?gemerkt)$/;
    function handleLangzeitCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60) return false;
        if (OPEN_RX.test(t) || WHAT_RX.test(t)) { showLangzeit(); return true; }
        return false;
    }
    window.handleLangzeitCommand = handleLangzeitCommand;
    if (window.jvCommands) {   // Befehlsliste (commands.js)
        window.jvCommands.use('langzeit', function (text, next) {
            try { if (handleLangzeitCommand(text)) return true; } catch (e) {}
            return next(text);
        }, 800);
    }

    /* ---------- 6) Einmaliges Aufräumen der Altlasten ---------- */
    async function cleanupOnce() {
        if (lsGet(CLEAN_KEY)) return;
        try {
            const d = await post({ action: 'listall' });
            const alt = (d.eintraege || []).filter(e => !(e.metadata && (e.metadata.typ === 'episode' || e.metadata.typ === 'frist'))).map(e => e.id);
            for (let i = 0; i < alt.length; i += 100) await post({ action: 'delete', ids: alt.slice(i, i + 100) });
            lsSet(CLEAN_KEY, new Date().toISOString());
            console.log('Langzeitgedächtnis aufgeräumt, gelöscht: ' + alt.length);
        } catch (e) {
            console.error('Aufräumen des Langzeitgedächtnisses fehlgeschlagen (wird später erneut versucht)', e);
        }
    }

    setTimeout(() => { try { refreshDue(); } catch (e) {} }, 1500);
    setTimeout(() => { try { cleanupOnce(); } catch (e) {} }, 4000);
})();
