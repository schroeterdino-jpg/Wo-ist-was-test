/* ============================================================
   LANGZEITGEDÄCHTNIS (Vektorgedächtnis, Upstash): Erlebnisse, Pläne, Vorlieben, Daten (Geburtstage), Stimmungen und Projekte.
   Strikt getrennt vom lokalen Gedächtnis (memoryItems = Gegenstände und Orte, Aktion memory_store).
   Was diese Datei macht:
   1) Aktion "episode_store": speichert einen Eintrag mit Datum, Kategorie und Status im Vektorgedächtnis, wartet auf die Antwort des Servers und
      zeigt danach die Karte "Im Langzeitgedächtnis gespeichert". Klappt es nicht, sagt Jarvis das ehrlich.
   2) Aktion "episode_asked": die KI meldet, dass sie die Nachfrage gestellt hat; dann wird sie vermerkt und es gibt heute keine weitere.
   3) Die Suche (searchSemanticMemory) liefert nur noch solche Einträge, mit Datum und Wochentag ("Wann war ich schwimmen?").
   4) Nachfragen: einmal am Tag höchstens EINE Nachfrage zu einem vergangenen Plan oder Geburtstag (Kontext "langzeit_nachfragen"); im Briefing nie.
      Dazu alle 2-3 Tage ein beiläufiger Anstoß zu einem undatierten Eintrag ("Wie geht es eigentlich Finja?"), pro Eintrag höchstens alle 10 Tage; abstellbar mit "Frag nicht mehr nach ...".
      "Was weißt du über mich?" lässt Jarvis die Einträge vorlesen (Kontext "langzeit_alles"); das Fenster öffnet "Zeig mir das Langzeitgedächtnis".
   5) Fenster "Langzeitgedächtnis" (Menü, oder per Sprache): alle Einträge ansehen und einzeln löschen. "Vergiss das mit dem Schwimmen" löscht per Sprache.
   7) Tageslog (lokal), Tagesrückblick um 21:30 (2-3 Sätze, Kategorie "Rückblick") und Plauder-Modus ("Lass uns plaudern" / "Okay, genug").
   6) Einmaliges Aufräumen: alte Vektor-Einträge ohne Datum/Kategorie (Altlasten aus der Zeit vor der Trennung) werden gelöscht.
   Braucht: api/memory.js, actions.js (executeAction), assistant.js (searchSemanticMemory), prompt.js (buildSystemPrompt), apiFetch.
   Muss NACH assistant.js und gedaechtnis.js geladen werden.
   ============================================================ */
(function () {
    const FOLLOW_KEY = 'jv_langzeit_nachfrage_tag';
    const ANSTOSS_KEY = 'jv_langzeit_anstoss_tag';
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
        const a0 = String(action.episode_art || '').toLowerCase();
        const art = a0.startsWith('heute') ? 'heute' : a0.startsWith('anst') ? 'anstoss' : 'nachfragen';
        if (art === 'anstoss') lsSet(ANSTOSS_KEY, todayIso());   // Anstöße höchstens alle 2-3 Tage
        try { await post({ action: 'mark', id, art, year: new Date().getFullYear(), today: todayIso() }); } catch (e) { console.error('Nachfrage-Vermerk fehlgeschlagen', e); }
        dueCache = null;
    }

    if (typeof window.executeAction === 'function' && !window.executeAction._langzeit) {
        const original = window.executeAction;
        const wrapped = async function (action, text, ctx) {
            if (action && action.type === 'episode_store') return storeEpisode(action, ctx);
            if (action && action.type === 'episode_asked') { markAsked(action); return; }
            if (action && action.type === 'episode_forget') return forgetEpisode(action, ctx);
            if (action && action.type === 'episode_nicht_fragen') return noAnstoss(action, ctx);
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

    function anstossErlaubt() {   // frühestens alle 2 Tage ein beiläufiger Anstoß
        const last = lsGet(ANSTOSS_KEY);
        if (!isIsoDay(last)) return true;
        return (new Date(todayIso() + 'T12:00:00Z') - new Date(last + 'T12:00:00Z')) / 86400000 >= 2;
    }

    function refreshDue() {
        const heute = todayIso();
        if (dueLoading || (dueCache && dueCache.tag === heute)) return;
        dueLoading = true;
        post({ action: 'due', today: heute, anstoss: anstossErlaubt() })
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
        const eintrag = e.art === 'anstoss'
            ? { id: e.id, art: 'anstoss', inhalt: String(e.text || '').replace(/\s*\([^)]*\d{4}\)\s*$/, ''), kategorie: m.kategorie }
            : e.art === 'heute'
            ? { id: e.id, art: 'heute', hinweis: m.hinweis, inhalt: e.text }
            : { id: e.id, art: 'nachfragen', frage: (m.frage && m.frage !== AUTO_FRAGE) ? m.frage : 'Frage beiläufig, wie es war (zum Eintrag passend, z.B. "Wie war es beim Schwimmen?")', inhalt: e.text, ereignis: isIsoDay(m.ereignis_datum) ? lesbar(m.ereignis_datum) : '' };
        if (e.art === 'anstoss') return '\n\nlangzeit_nachfragen (heute noch nicht gefragt; kein fester Anlass, nur ein beiläufiger Anstoß in einem ruhigen Moment; stelle ihn genau einmal und melde es mit der Aktion episode_asked, episode_art "anstoss"): ' + JSON.stringify(eintrag);
        return '\n\nlangzeit_nachfragen (heute noch nicht gefragt; stelle sie genau einmal, ganz beiläufig und locker nebenbei in einem passenden Moment des Gesprächs, nicht als steife Pflichtfrage, und melde es mit der Aktion episode_asked): ' + JSON.stringify(eintrag);
    }

    if (window.jvChain) {   // Ergänzungs-Liste (commands.js)
        window.jvChain.use('buildSystemPrompt', 'langzeit', function (next) {
            let base = next();
            try { base += (alleBlock() || dueBlock()); } catch (e) {}
            try { base += rueckblickBlock() + plauderBlock(); } catch (e) {}
            return base;
        }, 200);
    }


    /* "Was weißt du über mich?": Jarvis liest vor, was er weiß. Alle Einträge werden einmal geholt und der KI für diese Antwort mitgegeben. */
    let alleCache = null;   // { t, liste }
    const WISSEN_RXS = [
        /\bwas\s+(?:\S+\s+){0,3}?wei(?:ß|ss)t\s+du\s+(?:\S+\s+){0,3}?(?:über|von)\s+(?:mich|mir)(?:\s|$)/,
        /(?:^|\s)(?:über|von)\s+(?:mich|mir)\s+(?:\S+\s+){0,3}?(?:wei(?:ß|ss)t|gemerkt)(?:\s|$)/,
        /\bwas\s+hast\s+du\s+(?:\S+\s+){0,3}?gemerkt(?:\s|$)/
    ];

    function alleFrisch() { return !!alleCache && Date.now() - alleCache.t < 45000; }
    function alleBlock() {
        if (!alleFrisch()) return '';
        return '\n\nlangzeit_alles (der User fragt gerade, was du über ihn weißt; erzähle es ihm in wenigen natürlichen Sätzen): ' + JSON.stringify(alleCache.liste);
    }
    async function loadAlle() {
        const d = await post({ action: 'listall' });
        const liste = (d.eintraege || []).filter(e => e.metadata && e.metadata.typ === 'episode')
            .sort((a, b) => String(b.metadata.datum_gesagt || '').localeCompare(String(a.metadata.datum_gesagt || '')))
            .slice(0, 80)
            .map(e => ({ kategorie: e.metadata.kategorie || 'Eintrag', inhalt: String(e.text || ''), erzaehlt: e.metadata.datum_gesagt || '' }));
        alleCache = { t: Date.now(), liste };
    }

    /* "Frag nicht mehr nach Finja": nimmt den Eintrag aus den beiläufigen Nachfragen, ohne ihn zu löschen */
    async function noAnstoss(action, ctx) {
        const q = String(action.episode_query || '').trim();
        if (!q) throw userError('Ich weiß nicht, zu welchem Eintrag ich nicht mehr nachfragen soll.');
        let data;
        try { data = await post({ action: 'search', query: q, topK: 5 }); }
        catch (e) { throw userError('Das Langzeitgedächtnis konnte ich gerade nicht erreichen.'); }
        const hit = (data.treffer || []).find(t => t && t.id && t.metadata && t.metadata.typ === 'episode');
        if (!hit) throw userError('Dazu habe ich im Langzeitgedächtnis nichts gefunden.');
        try { await post({ action: 'mark', id: hit.id, art: 'anstoss_aus' }); }
        catch (e) { throw userError('Das hat nicht geklappt.'); }
        dueCache = null;
        ctx.notes.push('Ich frage dazu nicht mehr von mir aus nach: ' + String(hit.text).replace(/\s*\([^)]*\d{4}\)\s*$/, '').slice(0, 120));
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
    function handleLangzeitCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t) return false;
        if (t.length <= 90 && WISSEN_RXS.some(r => r.test(t))) {
            if (alleFrisch()) return false;   // Einträge sind schon geladen: Satz geht an die KI
            loadAlle().catch(() => { alleCache = { t: Date.now(), liste: [] }; }).then(() => {
                try { if (typeof window.sendToGroqSmart === 'function') window.sendToGroqSmart(String(text)); } catch (e) { console.error('Langzeit', e); }
            });
            return true;
        }
        if (t.length > 60) return false;
        if (OPEN_RX.test(t)) { showLangzeit(); return true; }
        if (PLAUDER_ON_RXS.some(r => r.test(t))) { setPlauder(true); sagen('Gern. Worüber wollen wir plaudern?'); return true; }
        if (plauderAktiv() && PLAUDER_OFF_RXS.some(r => r.test(t))) { setPlauder(false); sagen('Gut, dann bin ich wieder ganz der Butler.'); return true; }
        if (/^plauder(?:-| )?modus (?:aus|beenden)$/.test(t)) { setPlauder(false); sagen('Plaudermodus aus.'); return true; }
        return false;
    }
    window.handleLangzeitCommand = handleLangzeitCommand;
    if (window.jvCommands) {   // Befehlsliste (commands.js)
        window.jvCommands.use('langzeit', function (text, next) {
            try { if (handleLangzeitCommand(text)) return true; } catch (e) {}
            return next(text);
        }, 800);
    }

    /* ---------- 7) Gespräch merken, Tagesrückblick, Plauder-Modus ---------- */
    const LOG_KEY = 'jv_tageslog', RUECK_KEY = 'jv_rueckblicke', RUECK_TAG = 'jv_rueckblick_tag', PLAUDER_KEY = 'jv_plauder_bis';
    const RUECK_ZEIT = '21:30';   // ab dieser Uhrzeit (Berlin) fasst Jarvis den Tag zusammen; verpasste Tage werden beim nächsten Start nachgeholt
    function jget(k, def) { try { const v = JSON.parse(lsGet(k)); return v === null || v === undefined ? def : v; } catch (e) { return def; } }
    function addDaysIso(iso, n) { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    // 7a) Tageslog: jede Frage und Antwort wird (gekürzt) auf dem Gerät mitgeschrieben, damit Jarvis nach einem App-Neustart den Faden des Tages hat
    //     und abends zusammenfassen kann. Nur die letzten 3 Tage, nur lokal.
    let tageslog = jget(LOG_KEY, []);
    if (!Array.isArray(tageslog)) tageslog = [];
    function msgText(m) {
        let c = m && m.content;
        if (typeof c !== 'string') return '';
        try { const j = JSON.parse(c); if (j && typeof j.reply === 'string') c = j.reply; } catch (e) {}
        return String(c).replace(/\s+/g, ' ').trim().slice(0, 300);
    }
    function logMsg(m) {
        try {
            if (!m || (m.role !== 'user' && m.role !== 'assistant')) return;
            const t = msgText(m);
            if (!t) return;
            tageslog.push({ d: todayIso(), r: m.role === 'user' ? 'u' : 'j', t });
            const grenze = addDaysIso(todayIso(), -2);
            tageslog = tageslog.filter(e => e.d >= grenze).slice(-200);
            lsSet(LOG_KEY, JSON.stringify(tageslog));
        } catch (e) {}
    }
    try {
        if (typeof chatHistory !== 'undefined' && Array.isArray(chatHistory) && !chatHistory._jvLog) {
            if (!chatHistory.length) {   // Neustart am selben Tag: die letzten Nachrichten wieder einsetzen
                tageslog.filter(e => e.d === todayIso()).slice(-12).forEach(e => {
                    chatHistory.push(e.r === 'u' ? { role: 'user', content: e.t } : { role: 'assistant', content: JSON.stringify({ reply: e.t, actions: [] }) });
                });
            }
            const origPush = chatHistory.push;
            chatHistory.push = function () { Array.prototype.forEach.call(arguments, logMsg); return origPush.apply(this, arguments); };
            chatHistory._jvLog = true;
        }
    } catch (e) { console.error('Tageslog', e); }

    // 7b) Tagesrückblick: 2-3 Sätze zum Tag, im Langzeitgedächtnis (Kategorie "Rückblick", im Fenster ansehbar und löschbar)
    function berlinHM() { return new Date().toLocaleTimeString('sv-SE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }); }
    let rueckLaeuft = false;
    async function rueckblickFuer(d) {
        const zeilen = tageslog.filter(e => e.d === d);
        const nutzer = zeilen.filter(e => e.r === 'u').length;
        if (nutzer < 2) return 'leer';
        const verlauf = zeilen.map(e => (e.r === 'u' ? 'User: ' : 'Jarvis: ') + e.t).join('\n').slice(-6000);
        const res = await apiFetch('/api/groq', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b',
                response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: 'Du fasst für den persönlichen Assistenten J.A.R.V.I.S. den Tag des Users zusammen. Du bekommst das Gespräch des Tages. Schreibe 2 bis 3 kurze Sätze in der dritten Person ("Der User ...") über das, was PERSÖNLICH und für spätere Gespräche merkenswert ist: worüber er gesprochen hat, Pläne, Erlebnisse, Sorgen, Stimmung, Familie, Freunde. Keine Befehle (Licht, Timer, Einkaufslisten-Einträge, Wetter, Uhrzeit, Navigation), nichts erfinden, keine Adressen, Nummern oder Passwörter. Ist nichts Persönliches dabei, gib einen leeren Text zurück. Antworte NUR mit JSON: {"text": "..."}' },
                    { role: 'user', content: 'Gespräch vom ' + lesbar(d) + ':\n' + verlauf }
                ]
            })
        });
        if (!res.ok) throw new Error('Groq ' + res.status);
        const data = await res.json();
        const parsed = JSON.parse(data.choices[0].message.content);
        const text = String(parsed.text || '').trim().slice(0, 500);
        if (text.length < 15) return 'leer';
        await post({ action: 'store', text: 'Rückblick ' + lesbar(d) + ': ' + text, metadata: { typ: 'episode', kategorie: 'Rückblick', datum_gesagt: d, quelle: 'tagesrueckblick', status: 'ohne_nachfrage' } });
        const lokal = jget(RUECK_KEY, []);
        lokal.push({ d, text });
        lsSet(RUECK_KEY, JSON.stringify(lokal.slice(-5)));
        dueCache = null;
        return 'ok';
    }
    async function rueckblickJob() {
        if (rueckLaeuft) return;
        rueckLaeuft = true;
        try {
            const heute = todayIso(), erledigt = lsGet(RUECK_TAG) || '';
            const tage = [addDaysIso(heute, -1)];
            if (berlinHM() >= RUECK_ZEIT) tage.push(heute);
            for (const d of tage) {
                if (d <= erledigt) continue;
                const erg = await rueckblickFuer(d);
                if (erg === 'leer' && d === heute) continue;   // heute noch zu wenig gesagt: später erneut prüfen
                lsSet(RUECK_TAG, d);
                break;
            }
        } catch (e) { console.error('Tagesrückblick fehlgeschlagen (wird später erneut versucht)', e); }
        rueckLaeuft = false;
    }
    window.jvRueckblickJob = rueckblickJob;
    function rueckblickBlock() {
        const l = jget(RUECK_KEY, []).filter(e => e && e.text && e.d < todayIso() && e.d >= addDaysIso(todayIso(), -4)).slice(-3);
        if (!l.length) return '';
        return '\n\ntagesrueckblick (kurze Zusammenfassungen der letzten Tage, nur zum beiläufigen Anknüpfen, nie aufzählen): ' + JSON.stringify(l.map(e => ({ tag: lesbar(e.d), inhalt: e.text })));
    }

    // 7c) Plauder-Modus: "Lass uns plaudern" -> ausführlicher, persönlicher, mit Gegenfragen; "Okay, genug" beendet ihn. Läuft nach 2 Stunden ohne Gespräch von selbst aus.
    const PLAUDER_ON_RXS = [
        /^(?:ok(?:ay)? |na |so |jarvis )?(?:lass uns|komm|wollen wir|können wir|wir können) (?:mal |jetzt |ein bisschen |etwas |noch |einfach |bisschen )*(?:plaudern|quatschen|klönen|schnacken|reden|unterhalten)(?: jarvis| bitte)?$/,
        /^plauder(?:-| )?modus(?: an| ein| starten)?$/
    ];
    const PLAUDER_OFF_RXS = [
        /^(?:ok(?:ay)? |gut |so |jarvis )?(?:genug|schluss|ende|fertig)(?: (?:mit dem |mit )?(?:plaudern|quatschen|plauder-?modus))?(?: jarvis| bitte)?$/,
        /^(?:zurück|wieder) (?:zum|in den) (?:butler|normalen?(?: modus)?)$/
    ];
    function plauderAktiv() { return Number(lsGet(PLAUDER_KEY) || 0) > Date.now(); }
    function setPlauder(an) { lsSet(PLAUDER_KEY, an ? String(Date.now() + 2 * 3600 * 1000) : '0'); }
    function plauderBlock() {
        if (!plauderAktiv()) return '';
        setPlauder(true);   // jede Anfrage verlängert um 2 Stunden
        return '\n\nplauder_modus (AKTIV: der User möchte sich gerade einfach unterhalten wie mit einem guten Bekannten): Du darfst jetzt bis zu 4 oder 5 Sätze antworten, persönlicher, neugieriger und lockerer, mit eigener Meinung, kleinem Witz und manchmal einer Gegenfrage am Ende (nicht jedes Mal). Knüpfe an Erinnerungen an (\'gedächtnis_semantisch\', \'tagesrueckblick\'), wenn es passt, zum Beispiel "Wie war es eigentlich gestern ...?". Lege keine Aktionen an, außer der User will ausdrücklich etwas erledigt haben. Bei Aufträgen antworte wie gewohnt knapp. Das Beenden übernimmt die App.';
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
    setTimeout(() => { try { rueckblickJob(); } catch (e) {} }, 8000);
    setInterval(() => { try { rueckblickJob(); } catch (e) {} }, 10 * 60 * 1000);
})();
