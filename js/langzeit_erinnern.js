/* ============================================================
   LANGZEIT-ERINNERN (Mitdenken): Sagt der User einen Termin mit Datum UND Uhrzeit ("übermorgen ist das Konzert um 20 Uhr"), merkt sich Zane
   ihn wie bisher im Langzeitgedächtnis (oder trägt ihn als Kalendertermin ein, Aktion 'calendar') und fragt danach: "Wie viele Stunden vorher soll ich Sie per Push erinnern?".
   Der User nennt die Zeit ("zwei Stunden", "2", "eine halbe Stunde", "anderthalb Stunden", "30 Minuten"); "Ja" heißt 3 Stunden, "Nein"/"keine" lässt es.
   Die Erinnerung ist ein Push über das bestehende Erinnerungssystem, KEIN doppeltes Klingeln im Google-Kalender.
   Hat der User die Erinnerung schon im selben Satz verlangt ("... und erinnere mich zwei Stunden vorher"), wird nicht gefragt.
   Ohne Uhrzeit oder liegt der Termin in weniger als 30 Minuten, wird nicht gefragt.
   MITWANDERN: Die Erinnerung merkt sich ihren Kalendertermin (Titel, Startzeit, Stunden vorher, localStorage 'jv_termin_links').
   Wird der Termin verschoben (calendar_update), rutscht die Erinnerung im selben Abstand mit; wird er gelöscht (calendar_delete), verschwindet sie auch.
   Gilt für Erinnerungen, die über diese Rückfrage für einen Kalendertermin entstanden sind; ältere Erinnerungen und reine Gedächtnis-Einträge bleiben unberührt.
   Die KI liefert dafür zwei zusätzliche Felder in 'episode_store': episode_uhrzeit (HH:MM) und episode_erinnerung (kurzer Text).
   Aus- und einschalten per Sprache: "Termin-Erinnerung aus" / "Termin-Erinnerung an". Standard: an.
   Braucht: langzeit.js (executeAction-Hülle), calendar.js (addGoogleCalendarReminder), commands.js, prompt-Kette (jvChain). Muss NACH langzeit.js geladen werden.
   ============================================================ */
(function () {
    if (typeof window.executeAction !== 'function') return;

    const KEY = 'jv_termin_erinnern';
        const PENDING_MS = 5 * 60000;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) !== '0';

    let pending = null;   // { text, start:Date, at }

    function todayIso() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function parseUhr(s) {
        const m = String(s || '').trim().match(/^(\d{1,2})(?:[:.](\d{2}))?$/);
        if (!m) return null;
        const h = +m[1], mi = m[2] ? +m[2] : 0;
        return (h > 23 || mi > 59) ? null : { h, mi };
    }
    function uhrText(h, mi) { return h + (mi ? ':' + String(mi).padStart(2, '0') : '') + ' Uhr'; }

    /* Termin-Zeitpunkt aus Datum + Uhrzeit (Ortszeit des Geräts, wie im Rest der App) */
    function startVon(datum, uhr) {
        const u = parseUhr(uhr);
        if (!u || !/^\d{4}-\d{2}-\d{2}$/.test(String(datum || ''))) return null;
        const d = new Date(datum + 'T00:00:00');
        if (isNaN(d.getTime())) return null;
        d.setHours(u.h, u.mi, 0, 0);
        return { start: d, h: u.h, mi: u.mi };
    }

    function tagWort(start) {
        const heute = new Date(todayIso() + 'T00:00:00').getTime();
        const tage = Math.round((new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime() - heute) / 86400000);
        if (tage === 0) return 'heute';
        if (tage === 1) return 'morgen';
        if (tage === 2) return 'übermorgen';
        return 'am ' + start.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    }

    function hatSerie(a) { return !!(a.calendar_recurrence_unit || a.calendar_recurrence_interval); }

    /* ---------- Verknüpfung Termin <-> Erinnerung ---------- */
    const LINKS = 'jv_termin_links';
    function linksLesen() { try { const l = JSON.parse(lsGet(LINKS) || '[]'); return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    function linksSchreiben(l) {
        const grenze = Date.now() - 2 * 86400000;
        lsSet(LINKS, JSON.stringify(l.filter(x => x && new Date(x.start).getTime() > grenze).slice(-60)));
    }
    const norm = t => String(t || '').toLowerCase().replace(/[^a-zäöüß0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    function gleicherTitel(a, b) { a = norm(a); b = norm(b); return !!a && !!b && (a === b || a.includes(b) || b.includes(a)); }
    /* Den Kalendereintrag finden, den die Aktion meint (dieselbe Suche wie in actions.js) */
    function eintragZu(a, text) {
        try {
            if (typeof calendarEntries === 'undefined' || !Array.isArray(calendarEntries)) return null;
            if (a.calendar_id) { const e = calendarEntries.find(c => c.id === a.calendar_id); if (e) return e; }
            const q = String(a.calendar_query || (a.type === 'calendar_delete' ? text : '') || '').toLowerCase();
            if (q) { const e = calendarEntries.find(c => String(c.text || '').toLowerCase().includes(q) || q.includes(String(c.text || '').toLowerCase())); if (e) return e; }
            return calendarEntries[0] || null;
        } catch (e) { return null; }
    }
    function linkZu(eintrag) {
        if (!eintrag || !eintrag.isoDate) return null;
        const t = new Date(eintrag.isoDate).getTime();
        return linksLesen().find(l => Math.abs(new Date(l.start).getTime() - t) < 90000 && gleicherTitel(l.titel, eintrag.text)) || null;
    }
    function erinnerungDa(link) { try { return reminderEntries.find(r => r.id === link.reminderId) || null; } catch (e) { return null; } }

    /* Fallback für ältere/ungekoppelte Zusatz-Erinnerungen:
       Frühere Versionen haben den Link Termin <-> Erinnerung nicht immer zuverlässig gespeichert.
       Beim Löschen eines Termins suchen wir deshalb zusätzlich nach einer passenden Erinnerung,
       aber nur wenn Titel UND zeitliche Nähe zum Termin passen. */
    function erinnerungZumTermin(eintrag) {
        try {
            if (!eintrag || !eintrag.isoDate || !Array.isArray(reminderEntries)) return null;
            const start = new Date(eintrag.isoDate).getTime();
            if (!isFinite(start)) return null;
            const titel = norm(eintrag.text);
            if (!titel) return null;
            return reminderEntries.find(r => {
                const rt = norm(r && r.text);
                if (!rt || !(rt.includes(titel) || titel.includes(rt.replace(/\\b(?:um\\s+)?\\d{1,2}(?::\\d{2})?\\s*uhr\\b/g, '').trim()))) return false;
                const when = new Date(r.isoDate || r.time || r.date || r.datetime || 0).getTime();
                return isFinite(when) && when < start && (start - when) <= 48 * 3600000;
            }) || null;
        } catch (e) { return null; }
    }

    async function erinnerungMitnehmen(link, neuerStart, ctx) {
        const rem = erinnerungDa(link);
        const rest = linksLesen().filter(l => l !== link && !(l.reminderId === link.reminderId));
        if (!rem) { linksSchreiben(rest); return; }   // der User hat sie selbst gelöscht: nicht wieder anlegen
        try { await deleteReminderEntry(rem.id); } catch (e) {}
        const remind = new Date(neuerStart.getTime() - link.stunden * 3600000);
        if (remind.getTime() <= Date.now() + 30000) {
            linksSchreiben(rest);
            if (ctx && Array.isArray(ctx.notes)) ctx.notes.push('Die Erinnerung zu diesem Termin habe ich gelöscht, weil der neue Zeitpunkt schon zu nah ist.');
            return;
        }
        try {
            const txt = /\buhr\b|\d{1,2}[:.]\d{2}/i.test(link.titel) ? link.titel : link.titel + ' um ' + uhrText(neuerStart.getHours(), neuerStart.getMinutes());
            await addGoogleCalendarReminder(txt, remind.toISOString(), null, !!rem.important);
            const neu = reminderEntries[0];
            rest.push({ titel: link.titel, start: neuerStart.toISOString(), stunden: link.stunden, reminderId: neu ? neu.id : null });
            linksSchreiben(rest);
            if (ctx && Array.isArray(ctx.notes)) ctx.notes.push(`Die Erinnerung ist mitgewandert: ${tagWort(remind)} um ${uhrText(remind.getHours(), remind.getMinutes())}.`);
        } catch (e) { console.error('Erinnerung mitnehmen', e); }
    }

    /* ---------- Kalender erst nach der Antwort öffnen ----------
       Beim Eintragen springt der Google Kalender in den Vordergrund, dann steht in Zane das Mikrofon still und die Antwort auf die
       Rückfrage geht verloren. Darum wartet das Öffnen, bis die Frage beantwortet ist (oder 5 Minuten vergangen sind). */
    let halten = false, offen = null, haltTimer = null;
    const origOpen = (typeof window.openGoogleCalendarApp === 'function') ? window.openGoogleCalendarApp : null;
    if (origOpen && !origOpen._termin) {
        const w = function (iso) { if (halten) { offen = { a: iso }; return; } return origOpen.apply(this, arguments); };
        w._termin = true;
        window.openGoogleCalendarApp = w;
    }
    function freigeben(verzoegerung) {
        halten = false; clearTimeout(haltTimer);
        const o = offen; offen = null;
        if (o && origOpen) setTimeout(function () { try { origOpen(o.a); } catch (e) {} }, verzoegerung || 0);
    }

    /* ---------- Aktion abfangen ---------- */
    const original = window.executeAction;
    if (!original._langzeitErinnern) {
        const wrapped = async function (action, text, ctx) {
            let altEintrag = null, altLink = null;
            try {
                if (action && (action.type === 'calendar_update' || action.type === 'calendar_delete')) { altEintrag = eintragZu(action, text); altLink = linkZu(altEintrag); }
            } catch (e) {}
            try { if (isOn() && origOpen && action && action.type !== 'calendar_update' && action.type !== 'calendar_delete' && (action.type === 'calendar' || action.calendar_text) && action.calendar_time) { halten = true; offen = null; } } catch (e) {}
            let res;
            try { res = await original.apply(this, arguments); } catch (e) { freigeben(0); throw e; }
            try {
                if (action.type === 'calendar_delete' && altEintrag) {
                    // Zuerst die sauber verknüpfte Erinnerung, bei älteren Terminen notfalls
                    // eine eindeutig passende Zusatz-Erinnerung über Titel + Zeit finden.
                    const rem = altLink ? erinnerungDa(altLink) : erinnerungZumTermin(altEintrag);
                    if (altLink) linksSchreiben(linksLesen().filter(l => l.reminderId !== altLink.reminderId));
                    if (rem) {
                        const remDone = await deleteReminderEntry(rem.id);
                        if (ctx && Array.isArray(ctx.notes)) {
                            ctx.notes.push(remDone === false
                                ? 'Den Termin habe ich gelöscht. Die zusätzliche Erinnerung konnte ich bei Google gerade nicht löschen.'
                                : 'Die zusätzliche Erinnerung dazu habe ich ebenfalls gelöscht.');
                        }
                    }
                } else if (altLink && action.type === 'calendar_update' && action.calendar_time) {
                    const neu = new Date(action.calendar_time);
                    if (!isNaN(neu.getTime()) && Math.abs(neu.getTime() - new Date(altLink.start).getTime()) > 60000) await erinnerungMitnehmen(altLink, neu, ctx);
                }
            } catch (e) { console.error('Termin-Erinnerung mitnehmen', e); }
            try {
                // Hat der User die Erinnerung selbst verlangt ("... und erinnere mich zwei Stunden vorher"), wird nicht noch einmal gefragt
                const selbstErinnert = /\berinner\w*|\bbescheid\b|\bsag mir (?:\S+\s+){0,4}vorher\b/i.test(String(text || ''));
                if (selbstErinnert && action && action.type === 'reminder') pending = null;
                if (isOn() && action && !selbstErinnert && action.type !== 'calendar_update' && action.type !== 'calendar_delete') {
                    let s = null, titel = '';
                    if (action.type === 'episode_store' && action.episode_uhrzeit && action.episode_datum) {
                        s = startVon(action.episode_datum, action.episode_uhrzeit);
                        titel = String(action.episode_erinnerung || '').trim().slice(0, 120) ||
                            String(action.episode_text || '').replace(/^Der User\s+/i, '').replace(/[.!]+$/, '').slice(0, 120);
                    } else if ((action.type === 'calendar' || action.calendar_text) && action.calendar_time && !hatSerie(action)) {
                        // Kalendertermin mit Uhrzeit (kein Ganztag, keine Wiederholung)
                        const m = String(action.calendar_time).match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})/);
                        if (m && !(m[2] === '00' && m[3] === '00')) {
                            s = startVon(m[1], m[2] + ':' + m[3]);
                            titel = String(action.calendar_text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
                        }
                    }
                    if (s && titel) {
                        if (s.start.getTime() > Date.now() + 30 * 60000) {
                            const mitZeit = /\buhr\b|\d{1,2}[:.]\d{2}/i.test(titel) ? titel : titel + ' um ' + uhrText(s.h, s.mi);
                            pending = { text: mitZeit, start: s.start, at: Date.now(), kal: action.type !== 'episode_store' ? titel : '' };
                            if (ctx && Array.isArray(ctx.notes)) ctx.notes.push('Wie viele Stunden vorher soll ich Sie per Push erinnern?');
                        }
                    }
                }
            } catch (e) { console.error('Termin-Erinnerung', e); }
            if (halten) { if (pending) { clearTimeout(haltTimer); haltTimer = setTimeout(function () { freigeben(0); }, PENDING_MS); } else freigeben(0); }
            return res;
        };
        wrapped._langzeitErinnern = true;
        Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
        window.executeAction = wrapped;
    }

    /* ---------- Antwort: wie viele Stunden vorher ---------- */
    const JA = /^(?:ja|jawohl|jo|gerne|bitte|okay|ok|klar|mach das|mach es|ja bitte|ja gerne|gern|sehr gerne|unbedingt|ja erinnere mich|erinnere mich)$/;
    const NEIN = /^(?:nein|nee|nö|nicht|keine|keine erinnerung|lieber nicht|nein danke|brauche ich nicht|lass (?:es|das)|nicht nötig|vergiss es|gar nicht|egal)$/;
    const ZAHL = { ein: 1, eine: 1, einen: 1, einer: 1, eins: 1, zwei: 2, zwo: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12 };
    function say(m) { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    /* "zwei Stunden", "2", "eine halbe Stunde", "anderthalb Stunden", "30 Minuten", "eine Viertelstunde" -> Stunden (Zahl) oder null */
    function stundenAus(t) {
        let m;
        if (/\b(?:anderthalb|eineinhalb)\b/.test(t)) return 1.5;
        if (/\bviertel\s*stunde\b/.test(t)) return 0.25;
        if (/\bdreiviertel\s*stunde\b/.test(t)) return 0.75;
        if (/\bhalbe?\s+stunde\b/.test(t) || /^halbe?$/.test(t)) return 0.5;
        if ((m = t.match(/\b(\d+(?:[.,]\d+)?)\s*(?:min|minute|minuten)\b/))) return parseFloat(m[1].replace(',', '.')) / 60;
        if ((m = t.match(/\b(\d+(?:[.,]\d+)?)\s*(?:std|stunde|stunden|h)?\b/))) return parseFloat(m[1].replace(',', '.'));
        if ((m = t.match(/\b(ein|eine|einen|einer|eins|zwei|zwo|drei|vier|fünf|fuenf|sechs|sieben|acht|neun|zehn|elf|zwölf|zwoelf)\s*(?:stunde|stunden|std)?\b/))) return ZAHL[m[1]];
        if (/\bstunde\b/.test(t)) return 1;
        return null;
    }
    function dauerText(h) {
        if (h === 0.25) return 'eine Viertelstunde';
        if (h === 0.5) return 'eine halbe Stunde';
        if (h === 1) return 'eine Stunde';
        if (h === 1.5) return 'anderthalb Stunden';
        if (h < 1) return Math.round(h * 60) + ' Minuten';
        return (Number.isInteger(h) ? h : String(h).replace('.', ',')) + ' Stunden';
    }

    async function anlegen(stunden) {
        const p = pending; pending = null;
        if (!p) return;
        const remind = new Date(p.start.getTime() - stunden * 3600000);
        if (remind.getTime() <= Date.now() + 30000) { say('Dann wäre der Zeitpunkt schon vorbei. Nennen Sie mir bitte eine kürzere Zeit.'); pending = p; pending.at = Date.now(); return; }
        try {
            if (typeof addGoogleCalendarReminder !== 'function') { say('Erinnerungen sind in dieser Version nicht erreichbar.'); return; }
            const r = await addGoogleCalendarReminder(p.text, remind.toISOString(), null, false);
            try {
                if (p.kal) {   // Erinnerung merkt sich ihren Kalendertermin, damit sie beim Verschieben mitwandert
                    const neu = reminderEntries[0];
                    if (neu && neu.text === p.text) { const l = linksLesen(); l.push({ titel: p.kal, start: p.start.toISOString(), stunden: stunden, reminderId: neu.id }); linksSchreiben(l); }
                }
            } catch (e) {}
            const wann = tagWort(remind) + ' um ' + uhrText(remind.getHours(), remind.getMinutes());
            if (r && r.synced === false) say(`Gut, ich erinnere Sie ${wann}, also ${dauerText(stunden)} vorher. Der Kalender-Eintrag hat nicht geklappt, die Erinnerung ist aber in der App gespeichert.`);
            else say(`Gut, ich erinnere Sie ${wann}, also ${dauerText(stunden)} vorher.`);
        } catch (e) { console.error('Termin-Erinnerung anlegen', e); say('Die Erinnerung konnte ich gerade nicht anlegen.'); }
    }

    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t) return false;
        // Ein-/Ausschalten
        if (t.length <= 60 && /termin\s*erinnerung|mitdenk\w*\s*erinnerung|automatische erinnerung/.test(t)) {
            if (/\b(aus|ausschalten|deaktivier\w*|stopp?)\b/.test(t)) { lsSet(KEY, '0'); pending = null; say('Ich frage bei Terminen nicht mehr nach einer Erinnerung.'); return true; }
            if (/\b(an|ein|einschalten|aktivier\w*)\b/.test(t)) { lsSet(KEY, '1'); say('Bei Terminen mit Uhrzeit frage ich wieder, ob ich Sie erinnern soll.'); return true; }
            say('Die Termin-Erinnerung ist ' + (isOn() ? 'an' : 'aus') + '.');
            return true;
        }
        if (!pending) return false;
        if (Date.now() - pending.at > PENDING_MS) { pending = null; return false; }
        if (NEIN.test(t)) { pending = null; say('Gut, dann erinnere ich Sie nicht.'); return true; }
        if (JA.test(t)) { anlegen(3); return true; }
        if (t.length <= 40) {
            const h = stundenAus(t);
            if (h && h > 0 && h <= 72) { anlegen(h); return true; }
        }
        return false;
    }
    /* Der Kalender springt beim Eintragen in den Vordergrund, Zane ist dann im Hintergrund: Mikrofon und Zuhören stehen still.
       Kommt der User zurück und die Frage ist noch offen, stellt Zane sie kurz noch einmal und hört danach wieder zu. */
    let zuletztVersteckt = 0;
    try {
        document.addEventListener('visibilitychange', function () {
            if (document.hidden) { zuletztVersteckt = Date.now(); return; }
            if (!pending || !zuletztVersteckt || zuletztVersteckt < pending.at - 20000) return;
            if (Date.now() - pending.at > PENDING_MS) return;
            const p = pending; zuletztVersteckt = 0;
            setTimeout(function () {
                try {
                    if (pending !== p || (typeof isRecording !== 'undefined' && isRecording)) return;
                    say('Wie viele Stunden vorher soll ich Sie erinnern?');
                } catch (e) {}
            }, 900);
        });
    } catch (e) {}

    if (window.jvCommands) {
        window.jvCommands.use('termin-erinnern', function (text, next) {
            try {
                const war = !!pending, r = handle(text);
                if (war && !pending) freigeben(4500);   // beantwortet: erst die Bestätigung sprechen lassen, dann den Kalender zeigen
                else if (war && !r) freigeben(0);       // etwas anderes gesagt: Frage bleibt, der Kalender öffnet sich trotzdem
                if (r) return true;
            } catch (e) { console.error('Termin-Erinnerung', e); }
            return next(text);
        }, 96);
    }

    /* ---------- Hinweis für die KI ---------- */
    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'termin-erinnern', function (next) {
            let base = next();
            if (isOn()) base += '\n\nZUSATZ zu \'episode_store\': Nennt der User bei einem zukünftigen Termin eine UHRZEIT (z.B. "übermorgen ist das Konzert von Xavier Naidoo um 20 Uhr"), setze zusätzlich \'episode_uhrzeit\' = die Uhrzeit als HH:MM (24 Stunden, "20 Uhr" = "20:00", "halb acht abends" = "19:30") und \'episode_erinnerung\' = kurzer Titel für die Erinnerung (z.B. "Konzert von Xavier Naidoo", ohne Uhrzeit und ohne "Der User"). Ohne genannte Uhrzeit lasse beide Felder weg, erfinde nie eine Uhrzeit. Die Rückfrage "Wie viele Stunden vorher soll ich Sie erinnern?" stellt die App selbst, stelle sie NICHT zusätzlich und lege dafür auch keine eigene Erinnerung an.';
            return base;
        }, 215);
    }

    window.jvTerminErinnern = { handle, isOn, startVon, tagWort, _pending: () => pending };
})();
