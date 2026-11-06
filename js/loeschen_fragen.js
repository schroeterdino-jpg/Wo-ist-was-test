/* ============================================================
   loeschen_fragen.js – Jarvis fragt nach, bevor sie etwas löscht
   ============================================================
   Gilt für: Einträge im Langzeitgedächtnis ("erledigt", "vergiss das"), Kalendertermine und Erinnerungen.
   Ablauf: Die KI will löschen -> Jarvis sagt "Soll ich ... wirklich löschen?" und löscht noch nichts.
           "Ja" (gesprochen oder auf den Knopf getippt) löscht, "Nein" lässt alles, wie es ist.
           Sagt der User etwas ganz anderes, gilt die Frage als erledigt und der Satz läuft normal weiter.
   NEU (B2b-2): Dieselbe Frage gilt für Terminänderungen des alten KI-Wegs (calendar_update, auch bei ausgeschalteter Chef-KI): Jarvis nennt den Termin, die alte und die NEUE
   Zeit (bzw. neuen Titel/Ort) und ändert erst nach einem eindeutigen "Ja". Eine Frage gilt für genau EINE Änderung, nie mehrere zugleich. "Nein", unklare Antworten ("Ja, aber ..."),
   Ablauf (2 Minuten) und ein zwischenzeitlich geänderter Termin ändern nichts. Relative Angaben ("eine Stunde später") rechnet jvChef.relativeNeueZeit ab der ALTEN Terminzeit aus.
   Nach dem Ändern wird der Kalender geprüft. Die Chef-KI (registry_schreibkern.js) holt ihre eigene Bestätigung ein und ruft mit _bestaetigt auf.
   Braucht: actions.js (executeAction), commands.js (jvCommands), voice.js (speak). Wird ganz am Ende der Skripte geladen.
   ============================================================ */
(function () {
    'use strict';
    if (typeof window.executeAction !== 'function' || window.executeAction._loeschFrage) return;

    const TYPEN = { episode_forget: 1, calendar_delete: 1, reminder_delete: 1, calendar_update: 1 };
    const GUELTIG_MS = 120000;     // so lange wartet die Frage auf eine Antwort
    const GLEICHE_RUNDE_MS = 4000; // mehrere Löschwünsche aus einem Satz werden zusammen gefragt

    /* actions.js (googleNotSynced) setzt diesen Merker am ctx, wenn etwas bei Google nicht geklappt hat. Dann steht die ehrliche
       Notiz schon in ctx.notes und "…ist gelöscht." darf nicht zusätzlich angehängt werden. (Symbol: erscheint nicht in JSON/Logs.) */
    const GOOGLE_TEILFEHLER = Symbol.for('jv.googleTeilfehler');

    let pending = null;            // { items: [{ action, text, art }], at, timer, update?: true }  (update: genau EINE Terminänderung)
    let abgelaufenUpdate = 0;      // wann eine unbeantwortete Änderungsfrage abgelaufen ist (für den ehrlichen Hinweis bei einem späten "Ja")
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


    /* ---------- B2b-2: Terminänderung (calendar_update) ---------- */
    const BERLIN = 'Europe/Berlin';
    const istGanz = c => /^\d{4}-\d{2}-\d{2}$/.test(String((c && c.isoDate) || ''));
    const tagBerlin = d => d.toLocaleDateString('sv-SE', { timeZone: BERLIN });
    function tagWort(d) {
        const t = tagBerlin(d), h = tagBerlin(new Date());
        if (t === h) return 'heute';
        if (t === tagBerlin(new Date(Date.now() + 86400000))) return 'morgen';
        if (t === tagBerlin(new Date(Date.now() + 2 * 86400000))) return 'übermorgen';
        return d.toLocaleDateString('de-DE', { timeZone: BERLIN, weekday: 'long', day: 'numeric', month: 'long' });
    }
    function uhrWort(d) { return d.toLocaleTimeString('de-DE', { timeZone: BERLIN, hour: 'numeric', minute: '2-digit' }).replace(/:00$/, '') + ' Uhr'; }
    function zeitWort(iso, ganz) {
        if (ganz) { const d = new Date(String(iso).slice(0, 10) + 'T12:00:00'); return isNaN(d.getTime()) ? '' : tagWort(d) + ', ganztägig'; }
        const d = new Date(iso); return isNaN(d.getTime()) ? '' : tagWort(d) + ' um ' + uhrWort(d);
    }
    /* Welcher Termin ist gemeint? Genau wie in actions.js: erfundene ID ignorieren, sonst über den Suchbegriff. Keiner gefunden = null (dann ändert die Aktion ohnehin nichts). */
    function zielTermin(action) {
        const l = liste('cal');
        if (action.calendar_id != null && action.calendar_id !== '') { const c = l.find(x => String(x.id) === String(action.calendar_id)); if (c) return c; }
        if (action.calendar_query) { const q = String(action.calendar_query).toLowerCase(); return l.find(x => passt(x, q)) || null; }
        return null;
    }
    /* Was würde sich WIRKLICH ändern? null = nichts (dann läuft die Aktion wie bisher, sie ändert dann auch nichts Sichtbares). */
    function aenderung(action, text) {
        const c = zielTermin(action); if (!c) return null;
        const ganz = istGanz(c);
        let neuIso = null, neuD = null;
        if (action.calendar_time) { const d = new Date(action.calendar_time); if (!isNaN(d.getTime())) { neuD = d; neuIso = action.calendar_time; } }
        let rel = null;   // "eine Stunde später" / "einen Tag nach hinten": ab der ALTEN Terminzeit rechnen, nicht dem Rechenergebnis der KI trauen
        try { rel = window.jvChef && typeof window.jvChef.relativeNeueZeit === 'function' ? window.jvChef.relativeNeueZeit(c, text) : null; } catch (e) { rel = null; }
        if (rel) { const rd = new Date(rel); if (!isNaN(rd.getTime()) && (!neuD || Math.abs(rd.getTime() - neuD.getTime()) >= 60000)) { neuIso = rel; neuD = rd; } }
        let zeit = false, mitUhrGlobal = false;
        if (neuD) {
            const mitUhr = ganz && /(\d{1,2}[:.]\d{2}|\buhr\b|\bum \d)/i.test(String(window.jvLetzterText || '')) && neuD.toLocaleTimeString('sv-SE', { timeZone: BERLIN }) !== '00:00:00';
            if (mitUhr) { zeit = true; mitUhrGlobal = true; }
            else if (ganz) zeit = tagBerlin(neuD) !== c.isoDate;
            else { const alt = new Date(c.isoDate); zeit = isNaN(alt.getTime()) || Math.abs(neuD.getTime() - alt.getTime()) >= 60000; }
        }
        const titel = action.calendar_text && String(action.calendar_text).trim() && String(action.calendar_text).trim() !== String(c.text).trim() ? String(action.calendar_text).trim() : '';
        const ort = action.calendar_location && String(action.calendar_location).trim() && String(action.calendar_location).trim().toLowerCase() !== String(c.location || '').trim().toLowerCase() ? String(action.calendar_location).trim() : '';
        if (!zeit && !titel && !ort) return null;
        const teile = [];
        const neuGanz = ganz && !(zeit && mitUhrGlobal);
        if (zeit) teile.push('auf ' + zeitWort(neuIso, neuGanz) + ' verschieben');
        if (titel) teile.push('in „' + titel + '“ umbenennen');
        if (ort) teile.push('den Ort „' + ort + '“ eintragen');
        const alt = zeit ? ' (' + zeitWort(c.isoDate, ganz) + ')' : '';
        const satz = 'Soll ich „' + c.text + '“' + alt + ' ' + (teile.length > 1 ? teile.slice(0, -1).join(', ') + ' und ' + teile[teile.length - 1] : teile[0]) + '?';
        return { art: 'aendern', c: { id: c.id, text: c.text, isoDate: c.isoDate, location: c.location || '' }, zeit: zeit ? neuIso : null, titel, ort, satz, frage: satz };
    }
    const RX_JA_KLAR = /^(?:ja|jawohl|jep|jo|joa|jup|klar|genau|okay|ok|gerne|gern|natuerlich|sicher|bitte|passt|stimmt|richtig|mach das|mach es|machs|mach|aendere|verschieb\w*)\b/;
    const RX_VORBEHALT = /\b(aber|nicht|lieber|statt|sondern|doch|vielleicht|eigentlich|oder|und|erst|spaeter|frueher|anders)\b/;
    function jaNeinUnklar(text) {   // 'ja' | 'nein' | 'unklar' (kurz, aber nicht eindeutig) | 'neu' (ein ganz anderer Satz)
        const n = norm(text), w = n ? n.split(' ').length : 0;
        if (!w || w > 6) return 'neu';
        if (WORT_NEIN.test(n)) return 'nein';
        if (RX_JA_KLAR.test(n) && w <= 4 && !RX_VORBEHALT.test(n)) return 'ja';
        if (w <= 3) return 'unklar';
        return 'neu';
    }

    /* Was würde gelöscht? Null = nichts zu löschen, dann läuft die Aktion ganz normal weiter. */
    function beschreibe(action, text) {
        if (action.type === 'calendar_update') return aenderung(action, text);
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
    function zeigeKnoepfe(frageText, jaText) {
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
            const ja = document.createElement('button'); ja.className = 'ja'; ja.type = 'button'; ja.textContent = jaText || 'Ja, löschen';
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
    function verfall() { if (pending && pending.update) abgelaufenUpdate = Date.now(); verwirf(); }
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
        if (!ja) { sagen(p.update ? 'Okay, ich habe nichts geändert.' : 'Okay, ich lasse es.'); return; }
        if (p.update) return fuehreAenderungAus(p);
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


    /* ---------- B2b-2: bestätigte Terminänderung ausführen und prüfen ---------- */
    const warte = ms => new Promise(r => setTimeout(r, ms));
    function stand(id) { return liste('cal').find(x => String(x.id) === String(id)) || null; }
    function zeitGleich(a, b, ganz) {
        if (ganz) return String(a).slice(0, 10) === String(b).slice(0, 10);
        const x = new Date(a).getTime(), y = new Date(b).getTime();
        return !isNaN(x) && !isNaN(y) && Math.abs(x - y) < 60000;
    }
    async function fuehreAenderungAus(p) {
        const it = p.items[0], b = p.update;
        const jetzt = stand(b.c.id);
        // Der Termin darf sich seit der Frage nicht verändert haben (gelöscht, umbenannt, schon verschoben ...)
        if (!jetzt || String(jetzt.text) !== String(b.c.text) || String(jetzt.isoDate) !== String(b.c.isoDate)) {
            sagen('Der Termin „' + b.c.text + '“ hat sich inzwischen geändert. Ich habe deshalb nichts geändert. Sag mir bitte noch einmal, was ich tun soll.');
            return;
        }
        const ctx = { counter: 0, cards: [], notes: [], panel: null };
        const act = Object.assign({}, it.action, { calendar_id: b.c.id, _bestaetigt: true });
        if (b.zeit) act.calendar_time = b.zeit; else delete act.calendar_time;
        let problem = '';
        try { await original(act, it.text, ctx); }
        catch (e) { console.error('Termin ändern fehlgeschlagen', e); problem = (e && e.userMessage) || 'Das Ändern hat nicht geklappt.'; }
        try { if (ctx.cards.length && typeof showActionCards === 'function') showActionCards(ctx.cards); } catch (e) { }
        try { if (typeof renderAllLists === 'function') renderAllLists(); } catch (e) { }
        // Kalender wirklich prüfen (Google meldet die Änderung manchmal erst nach einem Moment). Kein zweiter Schreibversuch.
        let ok = !b.zeit && !b.titel && !b.ort;
        if (!problem) {
            for (let i = 0; i < 4 && !ok; i++) {
                const n = stand(b.c.id);
                if (n) {
                    const zOk = !b.zeit || zeitGleich(n.isoDate, b.zeit, istGanz(n) && !/T(?!00:00:00)/.test(String(b.zeit)));
                    const tOk = !b.titel || String(n.text).trim() === b.titel;
                    const oOk = !b.ort || String(n.location || '').trim().toLowerCase() === b.ort.toLowerCase();
                    ok = zOk && tOk && oOk;
                }
                if (!ok && i < 3) await warte(600);
            }
        }
        const notiz = ctx.notes.join(' ');
        if (problem) sagen(problem);
        else if (ok) sagen((notiz && /ge(?:ändert|aendert|schoben|legt)|verschoben/i.test(notiz) ? notiz : 'Erledigt, ich habe „' + b.c.text + '“ geändert.'));
        else sagen('Ich konnte nicht sicher bestätigen, dass der Termin geändert ist. Bitte schau kurz im Kalender nach. Ich versuche es nicht noch einmal von selbst.' + (notiz ? ' ' + notiz : ''));
    }

    const WORT_NEIN = /\b(nein|nee|ne|noe|nicht|stopp|stop|abbrechen|abbruch|lass|lasse|laesst|behalt\w*|bleib\w*|doch nicht|bloss nicht|auf keinen fall)\b/;
    const WORT_JA = /^(ja|jawohl|jep|jo|joa|jup|klar|genau|sicher|gerne|gern|okay|ok|bitte|mach|machs|mach es|mach das|loesch|loesche|loeschen|richtig|stimmt|natuerlich|selbstverstaendlich)\b/;

    /* Sprachbefehl-Eintrag: nur aktiv, solange eine Frage offen ist */
    function sprache(text, next) {
        if (!pending) {
            // Ein spätes "Ja" auf eine abgelaufene Änderungsfrage darf nichts ändern und soll nicht ins Leere laufen
            if (abgelaufenUpdate && Date.now() - abgelaufenUpdate < 300000) {
                const a = (() => { try { return window.jvFrage && window.jvFrage.aktuell && window.jvFrage.aktuell(); } catch (e) { return null; } })();
                const k = jaNeinUnklar(text);
                if ((k === 'ja' || k === 'nein') && (!a || a === 'loeschen_fragen')) {
                    abgelaufenUpdate = 0;
                    sagen(k === 'ja' ? 'Die Frage ist abgelaufen. Ich habe nichts geändert. Sag mir bitte noch einmal, was ich verschieben soll.' : 'Okay, ich habe nichts geändert.');
                    return true;
                }
            }
            return next(text);
        }
        if (Date.now() - pending.at > GUELTIG_MS) { verfall(); return sprache(text, next); }
        if (pending.update) {
            const k = jaNeinUnklar(text);
            if (k === 'ja') { antworte(true); return true; }
            if (k === 'nein') { antworte(false); return true; }
            if (k === 'unklar') {
                if (!pending.nachgefragt) { pending.nachgefragt = true; sagen('Das war nicht eindeutig. ' + pending.update.satz + ' Bitte sag Ja oder Nein.'); return true; }
                verwirf(); sagen('Das war wieder nicht eindeutig. Ich habe nichts geändert.'); return true;
            }
            verwirf(); return next(text);
        }
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
                    // Eine Änderungsfrage gilt für genau EINE Änderung: ein zweiter Wunsch in derselben Runde (oder neben einer Löschfrage) wird nicht gemischt, ein "Ja" bestätigt nie mehrere Aktionen.
                    if (gleicheRunde && (b.art === 'aendern' || pending.update)) {
                        throw fehler('Ich mache das immer einzeln. Zuerst die offene Frage: ' + (pending.update ? pending.update.satz : 'Soll ich löschen?') + ' Danach sag mir bitte das Nächste.');
                    }
                    if (!gleicheRunde) { verwirf(); pending = { items: [], at: jetzt, timer: null }; }
                    if (b.art === 'aendern') pending.update = b;
                    pending.items.push({ action: Object.assign({}, action), text, art: b.art });
                    if (pending.timer) clearTimeout(pending.timer);
                    pending.timer = setTimeout(verfall, GUELTIG_MS);
                    try { window.jvFrage && window.jvFrage.neu('loeschen_fragen'); } catch (e) { }
                    if (b.art === 'aendern') { zeigeKnoepfe(b.satz, 'Ja, ändern'); throw fehler(b.satz); }
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
