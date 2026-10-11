/* ============================================================
   LANGZEIT-ERINNERN (Mitdenken): Sagt der User einen Termin mit Datum UND Uhrzeit ("übermorgen ist das Konzert um 20 Uhr"), merkt sich Jarvis
   ihn wie bisher im Langzeitgedächtnis (oder trägt ihn als Kalendertermin ein, Aktion 'calendar') und fragt danach: "Soll ich Sie drei Stunden vorher per Push erinnern?".
   "Ja" legt die Erinnerung an (Push über das bestehende Erinnerungssystem, KEIN doppeltes Klingeln im Google-Kalender), "Nein" lässt es.
   Ohne Uhrzeit oder liegt der Zeitpunkt (Termin minus 3 Stunden) schon in der Vergangenheit, wird nicht gefragt.
   Die KI liefert dafür zwei zusätzliche Felder in 'episode_store': episode_uhrzeit (HH:MM) und episode_erinnerung (kurzer Text).
   Aus- und einschalten per Sprache: "Termin-Erinnerung aus" / "Termin-Erinnerung an". Standard: an.
   Braucht: langzeit.js (executeAction-Hülle), calendar.js (addGoogleCalendarReminder), commands.js, prompt-Kette (jvChain). Muss NACH langzeit.js geladen werden.
   ============================================================ */
(function () {
    if (typeof window.executeAction !== 'function') return;

    const KEY = 'jv_termin_erinnern';
    const VORLAUF_H = 3;
    const PENDING_MS = 5 * 60000;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) !== '0';

    let pending = null;   // { text, start:Date, remind:Date, at }

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

    /* ---------- Aktion abfangen ---------- */
    const original = window.executeAction;
    if (!original._langzeitErinnern) {
        const wrapped = async function (action, text, ctx) {
            const res = await original.apply(this, arguments);
            try {
                if (isOn() && action) {
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
                        const remind = new Date(s.start.getTime() - VORLAUF_H * 3600000);
                        if (remind.getTime() > Date.now() + 60000) {
                            const mitZeit = /\buhr\b|\d{1,2}[:.]\d{2}/i.test(titel) ? titel : titel + ' um ' + uhrText(s.h, s.mi);
                            pending = { text: mitZeit, start: s.start, remind, at: Date.now() };
                            if (ctx && Array.isArray(ctx.notes)) {
                                ctx.notes.push(`Soll ich Sie ${tagWort(s.start) === 'heute' ? 'heute' : tagWort(remind) === 'heute' ? 'am selben Tag' : tagWort(remind)} um ${uhrText(remind.getHours(), remind.getMinutes())}, also ${VORLAUF_H} Stunden vorher, per Push erinnern?`);
                            }
                        }
                    }
                }
            } catch (e) { console.error('Termin-Erinnerung', e); }
            return res;
        };
        wrapped._langzeitErinnern = true;
        Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
        window.executeAction = wrapped;
    }

    /* ---------- Ja / Nein ---------- */
    const JA = /^(?:ja|jawohl|jo|gerne|bitte|okay|ok|klar|mach das|mach es|ja bitte|ja gerne|ja erinnere mich|erinnere mich|bitte erinnern|gern|sehr gerne|unbedingt)$/;
    const NEIN = /^(?:nein|nee|nö|nicht|lieber nicht|nein danke|brauche ich nicht|lass (?:es|das)|nicht nötig|vergiss es)$/;
    function say(m) { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    async function anlegen() {
        const p = pending; pending = null;
        if (!p) return;
        if (p.remind.getTime() <= Date.now()) { say('Der Zeitpunkt ist schon vorbei, die Erinnerung lege ich nicht mehr an.'); return; }
        try {
            if (typeof addGoogleCalendarReminder !== 'function') { say('Erinnerungen sind in dieser Version nicht erreichbar.'); return; }
            const r = await addGoogleCalendarReminder(p.text, p.remind.toISOString(), null, false);
            const wann = tagWort(p.remind) + ' um ' + uhrText(p.remind.getHours(), p.remind.getMinutes());
            if (r && r.synced === false) say(`Gut, ich erinnere Sie ${wann}. Der Kalender-Eintrag hat nicht geklappt, die Erinnerung ist aber in der App gespeichert.`);
            else say(`Gut, ich erinnere Sie ${wann}.`);
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
        if (JA.test(t)) { anlegen(); return true; }
        if (NEIN.test(t)) { pending = null; say('Gut, dann erinnere ich Sie nicht.'); return true; }
        return false;
    }
    if (window.jvCommands) {
        window.jvCommands.use('termin-erinnern', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Termin-Erinnerung', e); }
            return next(text);
        }, 96);
    }

    /* ---------- Hinweis für die KI ---------- */
    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'termin-erinnern', function (next) {
            let base = next();
            if (isOn()) base += '\n\nZUSATZ zu \'episode_store\': Nennt der User bei einem zukünftigen Termin eine UHRZEIT (z.B. "übermorgen ist das Konzert von Xavier Naidoo um 20 Uhr"), setze zusätzlich \'episode_uhrzeit\' = die Uhrzeit als HH:MM (24 Stunden, "20 Uhr" = "20:00", "halb acht abends" = "19:30") und \'episode_erinnerung\' = kurzer Titel für die Erinnerung (z.B. "Konzert von Xavier Naidoo", ohne Uhrzeit und ohne "Der User"). Ohne genannte Uhrzeit lasse beide Felder weg, erfinde nie eine Uhrzeit. Die Rückfrage "Soll ich Sie erinnern?" stellt die App selbst, stelle sie NICHT zusätzlich und lege dafür auch keine eigene Erinnerung an.';
            return base;
        }, 215);
    }

    window.jvTerminErinnern = { handle, isOn, startVon, tagWort, _pending: () => pending };
})();
