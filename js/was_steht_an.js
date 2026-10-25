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

    function sammeln(ziel) {
        const heute = ziel || tag(new Date()), istHeute = heute === tag(new Date());
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
                else if (istHeute && dt < heute && Date.now() - d.getTime() < 3 * 86400000) out.erinnerungen.push({ s: d.getTime(), t: 'überfällig: ' + String(r.text || 'Erinnerung') });
            });
            out.erinnerungen.sort(function (a, b) { return a.s - b.s; });
        } catch (e) { }
        arr(typeof todoEntries !== 'undefined' ? todoEntries : []).forEach(function (e) {
            if (!e || e.done || !String(e.text || '').trim()) return;
            const t = String(e.text).trim();
            if (e.due === heute || (istHeute && /\bheute\b|^noch\b/i.test(t))) { const k = ohneHeute(t); if (k) out.heuteAufg.push(k); } else if (istHeute) out.aufgaben.push(t);
        });
        arr(typeof shoppingEntries !== 'undefined' ? shoppingEntries : []).forEach(function (e) {
            if (istHeute && e && !e.done && String(e.text || '').trim()) out.einkauf.push(String(e.text).trim());
        });
        return out;
    }

    const WT = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    function plus(ymd, n) { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
    function wochentag(ymd) { return new Date(ymd + 'T12:00:00Z').getUTCDay(); }
    /* Welcher Tag ist gemeint? heute (Standard), morgen, übermorgen, "am Dienstag" */
    function tagVon(t) {
        const h = tag(new Date());
        if (/\bubermorgen\b|\buebermorgen\b/.test(t)) return { iso: plus(h, 2), wort: 'Übermorgen' };
        if (/\bmorgen\b/.test(t)) return { iso: plus(h, 1), wort: 'Morgen' };
        const m = t.match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/);
        if (m) {
            const wd = ['sonntag', 'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag'].indexOf(m[1]);
            const n = (wd - wochentag(h) + 7) % 7;
            return { iso: plus(h, n), wort: n === 0 ? 'Heute' : n === 1 ? 'Morgen' : n === 2 ? 'Übermorgen' : 'Am ' + WT[wd] };
        }
        return { iso: h, wort: 'Heute' };
    }
    /* Schicht an dem Tag: "Du hast Spätschicht, Beginn 13 Uhr 45." */
    function schichtSatz(iso) {
        try {
            const p = window.jvPlan;
            if (!p || typeof p.schichtAm !== 'function') return '';
            const sh = p.schichtAm(iso), wd = wochentag(iso);
            if (!sh) return wd === 0 || wd === 6 ? '' : 'Du hast keine Schicht, also frei.';
            let name = /fr/i.test(sh) ? 'Frühschicht' : 'Spätschicht', b = '';
            try { const w = window.jvSchichtWissen && window.jvSchichtWissen(); if (w && w.schichtbeginn && w.schichtbeginn[name]) b = ', Beginn ' + w.schichtbeginn[name]; } catch (e) { }
            return 'Du hast ' + name + b + '.';
        } catch (e) { return ''; }
    }

    function text(ziel) {
        const z = ziel || { iso: tag(new Date()), wort: 'Heute' };
        const heuteTag = z.wort === 'Heute';
        const o = sammeln(z.iso), teile = [], sc = schichtSatz(z.iso);
        if (sc) teile.push((heuteTag ? '' : z.wort + ': ') + sc);
        if (o.termine.length) teile.push(z.wort + ' ' + (o.termine.length === 1 ? 'steht ein Termin' : 'stehen ' + o.termine.length + ' Termine') + ' an: ' + liste(o.termine.slice(0, 4).map(function (x) { return x.t; })) + '.');
        if (o.erinnerungen.length) teile.push('Erinnerungen: ' + liste(o.erinnerungen.slice(0, 4).map(function (x) { return x.t; })) + '.');
        if (o.heuteAufg.length) teile.push((heuteTag ? 'Du wolltest heute noch: ' : 'Auf deiner Liste für den Tag: ') + liste(o.heuteAufg.slice(0, 4)) + '.');
        if (o.aufgaben.length) teile.push((o.heuteAufg.length ? 'Außerdem steht auf deiner Aufgabenliste: ' : 'Auf deiner Aufgabenliste steht: ') + liste(o.aufgaben.slice(0, 4)) + (o.aufgaben.length > 4 ? ' und ' + (o.aufgaben.length - 4) + ' mehr.' : '.'));
        if (o.einkauf.length) teile.push('Auf der Einkaufsliste ' + (o.einkauf.length === 1 ? 'steht' : 'stehen') + ': ' + liste(o.einkauf.slice(0, 6)) + (o.einkauf.length > 6 ? ' und ' + (o.einkauf.length - 6) + ' mehr.' : '.'));
        return teile.length ? teile.join(' ') : (heuteTag ? 'Für heute habe ich nichts eingetragen. Aufgaben, Erinnerungen und Einkaufsliste sind leer.' : z.wort + ' habe ich nichts eingetragen.');
    }

    /* Fragen nach dem, was heute ansteht (nicht: Wetter, Essen ...) */
    function passt(t) {
        if (!t || t.split(' ').length > 18) return false;
        if (/\b(wetter|essen|kochen|fernsehen|film|fussball|spiel|gibt es|schicht|arbeit)\b/.test(t)) return false;
        const TAGW = '(?:heute|morgen|uebermorgen|(?:am )?(?:montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag))';
        if (new RegExp('\\bwas (?:steht|liegt|ist|haben wir|habe ich|hab ich) (?:' + TAGW + ' )?(?:noch )?(?:an|los|alles an)\\b').test(t) && (/\b(an|los)\b/.test(t))) return true;
        if (new RegExp('\\bwas (?:steht|liegt) ' + TAGW + '\\b').test(t)) return true;
        if (new RegExp('\\bwas (?:habe|hab) ich ' + TAGW + '\\b.*\\b(?:vor|zu tun|an)\\b').test(t)) return true;
        if (!/\b(?:heute|morgen|uebermorgen)\b/.test(t)) return false;
        if (/\bwas (wollte|wollt|hatte|hab|habe|muss|liegt|ist|soll|sollte)\b.*\b(vor|vorgehabt|machen|erledigen|tun|an|zu tun|zu erledigen|noch)\b/.test(t)) return true;
        if (/\b(irgendwas|irgend etwas|etwas|was)\b.*\bvor\b/.test(t) && /\b(weiss nicht|vergessen|faellt mir nicht|hatte|habe|hab)\b/.test(t)) return true;
        if (/\b(hatte|habe|hab) ich\b.*\b(was|etwas|irgendwas)\b.*\b(vor|zu tun|zu erledigen)\b/.test(t)) return true;
        if (/\bwas wollte ich\b/.test(t)) return true;
        return false;
    }

    function befehl(txt, next) {
        const t = norm(txt).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '').replace(/^bitte /, '');
        if (!passt(t)) return next(txt);
        sagen(text(tagVon(t)));
        return true;
    }
    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('was_steht_an', befehl, 0.35);
        return true;
    }
    if (!cmd()) { let n = 0; const iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }
    window.jvWasSteht = { text: text, passt: passt, tagVon: tagVon };
})();
