/* ============================================================
   loeschen_fragen.js – Jarvis fragt nach, bevor sie etwas löscht
   ============================================================
   Gilt für: Einträge im Langzeitgedächtnis ("erledigt", "vergiss das"), Kalendertermine und Erinnerungen.
   Ablauf: Die KI will löschen -> Jarvis sagt "Soll ich ... wirklich löschen?" und löscht noch nichts.
           "Ja" (gesprochen oder auf den Knopf getippt) löscht, "Nein" lässt alles, wie es ist.
           Sagt der User etwas ganz anderes, gilt die Frage als erledigt und der Satz läuft normal weiter.
   Braucht: actions.js (executeAction), commands.js (jvCommands), voice.js (speak). Wird ganz am Ende der Skripte geladen.
   ============================================================ */
(function () {
    'use strict';
    if (typeof window.executeAction !== 'function' || window.executeAction._loeschFrage) return;

    const TYPEN = { episode_forget: 1, calendar_delete: 1, reminder_delete: 1 };
    const GUELTIG_MS = 120000;     // so lange wartet die Frage auf eine Antwort
    const GLEICHE_RUNDE_MS = 4000; // mehrere Löschwünsche aus einem Satz werden zusammen gefragt

    /* actions.js (googleNotSynced) setzt diesen Merker am ctx, wenn etwas bei Google nicht geklappt hat. Dann steht die ehrliche
       Notiz schon in ctx.notes und "…ist gelöscht." darf nicht zusätzlich angehängt werden. (Symbol: erscheint nicht in JSON/Logs.) */
    const GOOGLE_TEILFEHLER = Symbol.for('jv.googleTeilfehler');

    let pending = null;            // { items: [{ action, text, art }], at, timer }
    let box = null;

    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function fehler(msg) {
        if (typeof userError === 'function') return userError(msg);
        const e = new Error(msg); e.userMessage = msg; return e;
    }
    function norm(t) {
        return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function datum(iso) {
        try {
            if (!/^\d{4}-\d{2}-\d{2}/.test(String(iso || ''))) return '';
            return new Date(String(iso).slice(0, 10) + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
        } catch (e) { return ''; }
    }
    function liste(name) {
        try { return name === 'cal' ? (typeof calendarEntries !== 'undefined' && calendarEntries) || [] : (typeof reminderEntries !== 'undefined' && reminderEntries) || []; }
        catch (e) { return []; }
    }
    function passt(e, q) {
        const t = String((e && e.text) || '').toLowerCase();
        return !!t && (t.includes(q) || q.includes(t));
    }

    /* Was würde gelöscht? Null = nichts zu löschen, dann läuft die Aktion ganz normal weiter. */
    function beschreibe(action, text) {
        if (action.type === 'episode_forget') {
            const q = String(action.episode_query || '').trim();
            if (!q) return null;
            return { art: 'episode', frage: 'den Eintrag zu „' + q + '“ aus dem Langzeitgedächtnis' };
        }
        if (action.type === 'calendar_delete') {
            const l = liste('cal'); if (!l.length) return null;
            const q = String(action.calendar_query || text || '').toLowerCase();
            const c = l.find(x => passt(x, q)) || l[0];
            const d = datum(c.isoDate || c.date);
            return { art: 'termin', frage: 'den Termin „' + c.text + '“' + (d ? ' am ' + d : '') };
        }
        if (action.type === 'reminder_delete') {
            const l = liste('rem'); if (!l.length) return null;
            const q = String(action.reminder_query || '').toLowerCase().trim();
            const generisch = !q || /^(alle|alles|alle erinnerungen|erinnerungen|meine erinnerungen|alle meine erinnerungen)$/.test(q);
            const alle = action.reminder_delete_all === true || action.reminder_delete_all === 'true' || /\balle[nr]?\s+(?:meine\s+|die\s+)?erinnerungen?\b/i.test(String(text || ''));
            if (alle && generisch) return { art: 'erinnerung', frage: 'alle ' + l.length + ' Erinnerungen' };
            if (alle) {
                const n = l.filter(r => passt(r, q)).length;
                return { art: 'erinnerung', frage: 'alle ' + (n || '') + ' Erinnerungen zu „' + q + '“' };
            }
            const qq = (q || String(text || '')).toLowerCase();
            const r = l.find(x => passt(x, qq)) || l[0];
            return { art: 'erinnerung', frage: 'die Erinnerung „' + r.text + '“' };
        }
        return null;
    }

    /* ---------- Knöpfe zum Antippen ---------- */
    function zeigeKnoepfe(frageText) {
        wegKnoepfe();
        try {
            if (!document.getElementById('jvLoeschStyle')) {
                const st = document.createElement('style');
                st.id = 'jvLoeschStyle';
                st.textContent =
                    '#jvLoesch{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 96px);z-index:100000;width:min(92vw,420px);box-sizing:border-box;' +
                    'background:rgba(4,9,15,.96);border:1px solid rgba(255,107,107,.65);border-radius:12px;padding:12px 14px;color:#e8f3f9;font-family:"Rajdhani",sans-serif;box-shadow:0 0 22px rgba(255,107,107,.25)}' +
                    '#jvLoesch .t{font-size:16px;line-height:1.25;margin-bottom:10px;word-break:break-word}' +
                    '#jvLoesch .b{display:flex;gap:10px}' +
                    '#jvLoesch button{flex:1;padding:11px 8px;border-radius:10px;font:700 14px "IBM Plex Mono",monospace;letter-spacing:.06em;background:rgba(10,22,33,.95)}' +
                    '#jvLoesch .ja{border:1px solid rgba(255,107,107,.8);color:#ff8a8a}' +
                    '#jvLoesch .nein{border:1px solid rgba(93,209,255,.6);color:#49d7ff}';
                document.head.appendChild(st);
            }
            box = document.createElement('div');
            box.id = 'jvLoesch';
            const t = document.createElement('div'); t.className = 't'; t.textContent = frageText;
            const b = document.createElement('div'); b.className = 'b';
            const ja = document.createElement('button'); ja.className = 'ja'; ja.type = 'button'; ja.textContent = 'Ja, löschen';
            const nein = document.createElement('button'); nein.className = 'nein'; nein.type = 'button'; nein.textContent = 'Nein';
            ja.addEventListener('click', () => { antworte(true); });
            nein.addEventListener('click', () => { antworte(false); });
            b.appendChild(ja); b.appendChild(nein); box.appendChild(t); box.appendChild(b);
            document.body.appendChild(box);
        } catch (e) { box = null; }
    }
    function wegKnoepfe() {
        try { if (box && box.parentNode) box.parentNode.removeChild(box); } catch (e) { }
        box = null;
    }
    function verwirf() {
        if (pending && pending.timer) clearTimeout(pending.timer);
        pending = null;
        wegKnoepfe();
    }

    /* ---------- Antwort: ausführen oder lassen ---------- */
    async function antworte(ja) {
        const p = pending;
        if (!p) return;
        verwirf();
        if (!ja) { sagen('Okay, ich lasse es.'); return; }
        const ctx = { counter: 0, cards: [], notes: [], panel: null };
        const probleme = [];
        for (const it of p.items) {
            try {
                ctx[GOOGLE_TEILFEHLER] = false;
                await original(Object.assign({}, it.action, { _bestaetigt: true }), it.text, ctx);
                if (ctx[GOOGLE_TEILFEHLER]) continue;   // lokal gelöscht, bei Google nicht: die ehrliche Notiz steht schon da, keine widersprüchliche Erfolgsmeldung
                if (it.art === 'termin') ctx.notes.push('Der Termin ist gelöscht.');
                else if (it.art === 'erinnerung') ctx.notes.push('Die Erinnerung ist gelöscht.');
            } catch (e) {
                console.error('Löschen fehlgeschlagen', e);
                probleme.push((e && e.userMessage) || 'Das Löschen hat nicht geklappt.');
            }
        }
        try { if (ctx.cards.length && typeof showActionCards === 'function') showActionCards(ctx.cards); } catch (e) { }
        try { if (typeof renderAllLists === 'function') renderAllLists(); } catch (e) { }
        let reply = probleme.length ? probleme.join(' ') : (ctx.notes.join(' ') || 'Erledigt, es ist gelöscht.');
        if (probleme.length && ctx.notes.length) reply = ctx.notes.join(' ') + ' ' + reply;
        sagen(reply);
    }

    const WORT_NEIN = /\b(nein|nee|ne|noe|nicht|stopp|stop|abbrechen|abbruch|lass|lasse|laesst|behalt\w*|bleib\w*|doch nicht|bloss nicht|auf keinen fall)\b/;
    const WORT_JA = /^(ja|jawohl|jep|jo|joa|jup|klar|genau|sicher|gerne|gern|okay|ok|bitte|mach|machs|mach es|mach das|loesch|loesche|loeschen|richtig|stimmt|natuerlich|selbstverstaendlich)\b/;

    /* Sprachbefehl-Eintrag: nur aktiv, solange eine Frage offen ist */
    function sprache(text, next) {
        if (!pending) return next(text);
        if (Date.now() - pending.at > GUELTIG_MS) { verwirf(); return next(text); }
        const n = norm(text);
        const worte = n ? n.split(' ').length : 0;
        if (worte && worte <= 6) {
            if (WORT_NEIN.test(n)) { antworte(false); return true; }
            if (WORT_JA.test(n)) { antworte(true); return true; }
        }
        verwirf();          // etwas ganz anderes gesagt: die Frage ist erledigt
        return next(text);
    }

    /* ---------- Ausführen abfangen ---------- */
    // A5: Die Umhüllung wird über die Aktions-Kette (aktionen_kette.js) angemeldet, Rang 10 = ganz außen. Fehlt die Kette, legt die Datei sie wie früher selbst um window.executeAction.
    let original = null;
    function baue(innen) {
        original = innen;
        const wrapped = async function (action, text, ctx) {
            if (action && TYPEN[action.type] && !action._bestaetigt) {
                let b = null;
                try { b = beschreibe(action, text); } catch (e) { b = null; }
                if (b) {
                    const jetzt = Date.now();
                    const gleicheRunde = pending && (jetzt - pending.at) < GLEICHE_RUNDE_MS;
                    if (!gleicheRunde) { verwirf(); pending = { items: [], at: jetzt, timer: null }; }
                    pending.items.push({ action: Object.assign({}, action), text, art: b.art });
                    if (pending.timer) clearTimeout(pending.timer);
                    pending.timer = setTimeout(verwirf, GUELTIG_MS);
                    const satz = gleicheRunde ? 'Und ' + b.frage + '?' : 'Soll ich ' + b.frage + ' wirklich löschen?';
                    zeigeKnoepfe(pending.items.length > 1 ? 'Soll ich diese ' + pending.items.length + ' Einträge wirklich löschen?' : satz);
                    throw fehler(satz);
                }
            }
            return original.apply(this, arguments);
        };
        wrapped._loeschFrage = true;
        try { Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) { } }); } catch (e) { }
        return wrapped;
    }
    if (window.jvAktionen && typeof window.jvAktionen.huelle === 'function') window.jvAktionen.huelle('loeschen_fragen', 10, baue);
    else window.executeAction = baue(window.executeAction);

    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('loeschen_fragen', sprache, 5);
    window.jvLoeschFrage = { offen: () => !!pending, antworte };
})();
