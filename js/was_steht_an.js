/* ============================================================
   WAS STEHT AN: "Was wollte ich heute noch machen?", "Hatte ich heute was vor?", "Was steht heute an?", "Ich hatte heute irgendwas vor ..."
   Jarvis liest direkt vor: Termine heute, Erinnerungen heute (und überfällige), offene Aufgaben (die mit "heute" zuerst) und die Einkaufsliste.
   Ist alles leer, sagt er das. Befehls-Order 0.35 (vor Rückfrage und Mehrfach-Befehlen). Braucht: commands.js (jvCommands), voice.js (speak),
   calendarEntries, reminderEntries, todoEntries, shoppingEntries (alle optional), briefing.js (formatSpokenTime, isBirthdayEntry).
   ============================================================ */
(function () {
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function tag(d) { return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function uhr(d) {
        try { if (typeof formatSpokenTime === 'function') return formatSpokenTime(d); } catch (e) { }
        return d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
    }
    function liste(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]; }
    function arr(x) { return Array.isArray(x) ? x : []; }
    function ohneHeute(t) { return String(t).replace(/\s*\b(noch\s+)?heute\b\s*/i, ' ').replace(/\s+/g, ' ').trim().replace(/^noch\s+/i, ''); }

    function sammeln() {
        const heute = tag(new Date());
        const out = { termine: [], erinnerungen: [], heuteAufg: [], aufgaben: [], einkauf: [] };
        try {
            arr(typeof calendarEntries !== 'undefined' ? calendarEntries : []).forEach(function (e) {
                if (!e || !e.isoDate) return;
                try { if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(e)) return; } catch (x) { }
                const ganz = /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate));
                const d = ganz ? new Date(e.isoDate + 'T12:00:00') : new Date(e.isoDate);
                if (isNaN(d.getTime()) || tag(d) !== heute) return;
                out.termine.push({ s: ganz ? 0 : d.getTime(), t: (ganz ? '' : 'um ' + uhr(d) + ' ') + String(e.text || 'Termin') });
            });
            out.termine.sort(function (a, b) { return a.s - b.s; });
            arr(typeof reminderEntries !== 'undefined' ? reminderEntries : []).forEach(function (r) {
                if (!r || !r.time || r.triggered) return;
                const d = new Date(r.time);
                if (isNaN(d.getTime())) return;
                const dt = tag(d);
                if (dt === heute) out.erinnerungen.push({ s: d.getTime(), t: 'um ' + uhr(d) + ' ' + String(r.text || 'Erinnerung') });
                else if (dt < heute && Date.now() - d.getTime() < 3 * 86400000) out.erinnerungen.push({ s: d.getTime(), t: 'überfällig: ' + String(r.text || 'Erinnerung') });
            });
            out.erinnerungen.sort(function (a, b) { return a.s - b.s; });
        } catch (e) { }
        arr(typeof todoEntries !== 'undefined' ? todoEntries : []).forEach(function (e) {
            if (!e || e.done || !String(e.text || '').trim()) return;
            const t = String(e.text).trim();
            if (e.due === heute || /\bheute\b|^noch\b/i.test(t)) { const k = ohneHeute(t); if (k) out.heuteAufg.push(k); } else out.aufgaben.push(t);
        });
        arr(typeof shoppingEntries !== 'undefined' ? shoppingEntries : []).forEach(function (e) {
            if (e && !e.done && String(e.text || '').trim()) out.einkauf.push(String(e.text).trim());
        });
        return out;
    }

    function text() {
        const o = sammeln(), teile = [];
        if (o.termine.length) teile.push('Heute ' + (o.termine.length === 1 ? 'steht ein Termin' : 'stehen ' + o.termine.length + ' Termine') + ' an: ' + liste(o.termine.slice(0, 4).map(function (x) { return x.t; })) + '.');
        if (o.erinnerungen.length) teile.push('Erinnerungen: ' + liste(o.erinnerungen.slice(0, 4).map(function (x) { return x.t; })) + '.');
        if (o.heuteAufg.length) teile.push('Du wolltest heute noch: ' + liste(o.heuteAufg.slice(0, 4)) + '.');
        if (o.aufgaben.length) teile.push((o.heuteAufg.length ? 'Außerdem steht auf deiner Aufgabenliste: ' : 'Auf deiner Aufgabenliste steht: ') + liste(o.aufgaben.slice(0, 4)) + (o.aufgaben.length > 4 ? ' und ' + (o.aufgaben.length - 4) + ' mehr.' : '.'));
        if (o.einkauf.length) teile.push('Auf der Einkaufsliste ' + (o.einkauf.length === 1 ? 'steht' : 'stehen') + ': ' + liste(o.einkauf.slice(0, 6)) + (o.einkauf.length > 6 ? ' und ' + (o.einkauf.length - 6) + ' mehr.' : '.'));
        return teile.length ? teile.join(' ') : 'Für heute habe ich nichts eingetragen. Aufgaben, Erinnerungen und Einkaufsliste sind leer.';
    }

    /* Fragen nach dem, was heute ansteht (nicht: Wetter, Essen ...) */
    function passt(t) {
        if (!t || t.split(' ').length > 18) return false;
        if (/\b(wetter|essen|kochen|fernsehen|film|fussball|spiel|gibt es|schicht|arbeit)\b/.test(t)) return false;
        if (/\bwas steht (heute )?(noch )?an\b/.test(t)) return true;
        if (!/\bheute\b/.test(t)) return false;
        if (/\bwas (wollte|wollt|hatte|hab|habe|muss|liegt|ist|soll|sollte)\b.*\b(vor|vorgehabt|machen|erledigen|tun|an|zu tun|zu erledigen|noch)\b/.test(t)) return true;
        if (/\b(irgendwas|irgend etwas|etwas|was)\b.*\bvor\b/.test(t) && /\b(weiss nicht|vergessen|faellt mir nicht|hatte|habe|hab)\b/.test(t)) return true;
        if (/\b(hatte|habe|hab) ich\b.*\b(was|etwas|irgendwas)\b.*\b(vor|zu tun|zu erledigen)\b/.test(t)) return true;
        if (/\bwas wollte ich\b/.test(t)) return true;
        return false;
    }

    function befehl(txt, next) {
        const t = norm(txt).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '').replace(/^bitte /, '');
        if (!passt(t)) return next(txt);
        sagen(text());
        return true;
    }
    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('was_steht_an', befehl, 0.35);
        return true;
    }
    if (!cmd()) { let n = 0; const iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }
    window.jvWasSteht = { text: text, passt: passt };
})();
