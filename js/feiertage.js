/* ============================================================
   FEIERTAGE UND BRÜCKENTAGE: "Wann ist der nächste Feiertag?", "Ist morgen Feiertag?", "Wann ist Ostern?",
   "Welche Brückentage gibt es?", "Mein Bundesland ist Hamburg".
   Alles wird in der App selbst berechnet (Ostern nach Gauß, alle anderen Feiertage daraus), es ist keine Schnittstelle nötig.
   Bundesland: Standard ist Schleswig-Holstein. Per Sprache änderbar ("Mein Bundesland ist Bayern"); steht ein Bundesland schon
   bei den Ferien-Einstellungen, wird versucht, es von dort zu übernehmen.
   Wird von erweiterungen.js in die festen Sprachbefehle eingehängt. Braucht: speak (voice.js), showActionCards/clearActionCards.
   ============================================================ */
(function () {
    const STATE_KEY = 'helfer_bundesland';
    const DEFAULT_STATE = 'SH';
    const STATE_NAMES = {
        'baden-württemberg': 'BW', 'baden württemberg': 'BW', 'baden-wuerttemberg': 'BW', 'bayern': 'BY', 'berlin': 'BE', 'brandenburg': 'BB',
        'bremen': 'HB', 'hamburg': 'HH', 'hessen': 'HE', 'mecklenburg-vorpommern': 'MV', 'mecklenburg vorpommern': 'MV',
        'niedersachsen': 'NI', 'nordrhein-westfalen': 'NW', 'nordrhein westfalen': 'NW', 'nrw': 'NW', 'rheinland-pfalz': 'RP', 'rheinland pfalz': 'RP',
        'saarland': 'SL', 'sachsen-anhalt': 'ST', 'sachsen anhalt': 'ST', 'sachsen': 'SN', 'schleswig-holstein': 'SH', 'schleswig holstein': 'SH',
        'thüringen': 'TH', 'thueringen': 'TH'
    };
    const STATE_LABEL = {
        BW: 'Baden-Württemberg', BY: 'Bayern', BE: 'Berlin', BB: 'Brandenburg', HB: 'Bremen', HH: 'Hamburg', HE: 'Hessen', MV: 'Mecklenburg-Vorpommern',
        NI: 'Niedersachsen', NW: 'Nordrhein-Westfalen', RP: 'Rheinland-Pfalz', SL: 'Saarland', SN: 'Sachsen', ST: 'Sachsen-Anhalt', SH: 'Schleswig-Holstein', TH: 'Thüringen'
    };

    function say(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }
    function showCards(cards) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(cards);
        } catch (e) {}
    }
    function readStore(key) {
        try { return typeof getPersistentData === 'function' ? String(getPersistentData(key, '') || '') : (localStorage.getItem(key) || ''); } catch (e) { return ''; }
    }
    function writeStore(key, val) {
        try { if (typeof setPersistentData === 'function') setPersistentData(key, val); else localStorage.setItem(key, val); } catch (e) {}
    }

    /* ---------- Bundesland ---------- */
    function stateFromText(text) {
        const s = String(text || '').toLowerCase();
        const keys = Object.keys(STATE_NAMES).sort((a, b) => b.length - a.length);   // "sachsen-anhalt" vor "sachsen", "niedersachsen" vor "sachsen"
        for (const k of keys) if (s.includes(k)) return STATE_NAMES[k];
        const up = s.trim().toUpperCase();
        return STATE_LABEL[up] ? up : null;
    }
    function detectStateFromOtherSettings() {
        try {
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (!/bundesland/i.test(k) && !/ferien.*(land|state|region)/i.test(k)) continue;
                const v = String(localStorage.getItem(k) || '');
                if (v.length > 40) continue;   // lange Werte sind Zwischenspeicher mit vielen Ländern, die sagen nichts über dein Land
                const st = stateFromText(v.replace(/^"|"$/g, ''));
                if (st) return st;
            }
        } catch (e) {}
        return null;
    }
    function currentState() {
        return stateFromText(readStore(STATE_KEY)) || detectStateFromOtherSettings() || DEFAULT_STATE;
    }

    /* ---------- Berechnung ---------- */
    function easter(y) {
        const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3);
        const h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
        const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
        return new Date(y, month - 1, day, 12);
    }
    function addDays(d, n) { const x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }
    function fixed(y, m, d) { return new Date(y, m - 1, d, 12); }
    function today() { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate(), 12); }
    function daysBetween(a, b) { return Math.round((b.getTime() - a.getTime()) / 86400000); }

    /* Buß- und Bettag: der Mittwoch vor dem 23. November */
    function bussUndBettag(y) {
        const d = fixed(y, 11, 22);
        while (d.getDay() !== 3) d.setDate(d.getDate() - 1);
        return d;
    }

    function holidaysFor(y, st) {
        const E = easter(y), out = [];
        const add = (name, date, only) => { if (!only || only.indexOf(st) !== -1) out.push({ name, date }); };
        add('Neujahr', fixed(y, 1, 1));
        add('Heilige Drei Könige', fixed(y, 1, 6), ['BW', 'BY', 'ST']);
        add('Internationaler Frauentag', fixed(y, 3, 8), ['BE', 'MV']);
        add('Karfreitag', addDays(E, -2));
        add('Ostersonntag', E, ['BB']);
        add('Ostermontag', addDays(E, 1));
        add('Tag der Arbeit', fixed(y, 5, 1));
        add('Christi Himmelfahrt', addDays(E, 39));
        add('Pfingstsonntag', addDays(E, 49), ['BB']);
        add('Pfingstmontag', addDays(E, 50));
        add('Fronleichnam', addDays(E, 60), ['BW', 'BY', 'HE', 'NW', 'RP', 'SL']);
        add('Mariä Himmelfahrt', fixed(y, 8, 15), ['SL']);
        add('Weltkindertag', fixed(y, 9, 20), ['TH']);
        add('Tag der Deutschen Einheit', fixed(y, 10, 3));
        add('Reformationstag', fixed(y, 10, 31), ['BB', 'HB', 'HH', 'MV', 'NI', 'SN', 'ST', 'SH', 'TH']);
        add('Allerheiligen', fixed(y, 11, 1), ['BW', 'BY', 'NW', 'RP', 'SL']);
        add('Buß- und Bettag', bussUndBettag(y), ['SN']);
        add('1. Weihnachtstag', fixed(y, 12, 25));
        add('2. Weihnachtstag', fixed(y, 12, 26));
        return out.sort((a, b) => a.date - b.date);
    }

    function upcomingHolidays(fromDate, days) {
        const st = currentState(), y = fromDate.getFullYear(), end = addDays(fromDate, days);
        const all = holidaysFor(y, st).concat(holidaysFor(y + 1, st), holidaysFor(y + 2, st));
        return all.filter(h => h.date >= fromDate && h.date <= end);
    }

    /* Brückentage: Feiertag am Dienstag/Donnerstag (1 Urlaubstag) oder Mittwoch (2 Urlaubstage) */
    function bridgeDays(fromDate, days) {
        const st = currentState(), y = fromDate.getFullYear();
        const all = holidaysFor(y, st).concat(holidaysFor(y + 1, st), holidaysFor(y + 2, st));
        const isHoliday = (d) => all.some(h => daysBetween(h.date, d) === 0);
        const end = addDays(fromDate, days), out = [];
        all.forEach(h => {
            if (h.date < fromDate || h.date > end) return;
            const wd = h.date.getDay();
            if (wd === 2) {
                const mo = addDays(h.date, -1);
                if (!isHoliday(mo)) out.push({ holiday: h, take: [mo], urlaub: 1, frei: 4 });
            } else if (wd === 4) {
                const fr = addDays(h.date, 1);
                if (!isHoliday(fr)) out.push({ holiday: h, take: [fr], urlaub: 1, frei: 4 });
            } else if (wd === 3) {
                const mo = addDays(h.date, -2), tu = addDays(h.date, -1), th = addDays(h.date, 1), fr = addDays(h.date, 2);
                if (!isHoliday(mo) && !isHoliday(tu) && !isHoliday(th) && !isHoliday(fr)) out.push({ holiday: h, take: [mo, tu], alt: [th, fr], urlaub: 2, frei: 5 });
            }
        });
        return out;
    }

    /* ---------- Text ---------- */
    function dayText(d, forceYear) {
        const opts = { weekday: 'long', day: 'numeric', month: 'long' };
        if (forceYear || d.getFullYear() !== today().getFullYear()) opts.year = 'numeric';
        return d.toLocaleDateString('de-DE', opts);
    }
    function shortDay(d) { return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }); }
    function untilText(n) { return n === 0 ? 'heute' : n === 1 ? 'morgen' : n === 2 ? 'übermorgen' : `in ${n} Tagen`; }
    function joinList(a) { return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]; }
    function stateName() { return STATE_LABEL[currentState()]; }

    /* Benannte Tage (auch solche, die kein gesetzlicher Feiertag sind): nächster Termin ab heute */
    const NAMED = [
        { re: /\bostermontag\b/, name: 'Ostermontag', fn: y => addDays(easter(y), 1) },
        { re: /\bkarfreitag\b/, name: 'Karfreitag', fn: y => addDays(easter(y), -2) },
        { re: /\bosterwochenende\b|\bostern\b|\bostersonntag\b/, name: 'Ostersonntag', fn: easter },
        { re: /\bpfingstmontag\b/, name: 'Pfingstmontag', fn: y => addDays(easter(y), 50) },
        { re: /\bpfingsten\b|\bpfingstsonntag\b/, name: 'Pfingstsonntag', fn: y => addDays(easter(y), 49) },
        { re: /\bhimmelfahrt\b|\bvatertag\b|\bherrentag\b/, name: 'Christi Himmelfahrt (Vatertag)', fn: y => addDays(easter(y), 39) },
        { re: /\bfronleichnam\b/, name: 'Fronleichnam', fn: y => addDays(easter(y), 60) },
        { re: /\bmuttertag\b/, name: 'Muttertag', fn: y => { const d = fixed(y, 5, 1); while (d.getDay() !== 0) d.setDate(d.getDate() + 1); d.setDate(d.getDate() + 7); return d; } },
        { re: /\bheiligabend\b/, name: 'Heiligabend', fn: y => fixed(y, 12, 24) },
        { re: /\bweihnachten\b|\berster weihnachtstag\b|\b1\.? weihnachtstag\b/, name: 'Weihnachten', fn: y => fixed(y, 12, 25) },
        { re: /\bsilvester\b/, name: 'Silvester', fn: y => fixed(y, 12, 31) },
        { re: /\bneujahr\b/, name: 'Neujahr', fn: y => fixed(y, 1, 1) },
        { re: /\breformationstag\b/, name: 'Reformationstag', fn: y => fixed(y, 10, 31) },
        { re: /\bhalloween\b/, name: 'Halloween', fn: y => fixed(y, 10, 31) },
        { re: /\bnikolaus\b|\bnikolaustag\b/, name: 'Nikolaustag', fn: y => fixed(y, 12, 6) },
        { re: /\bvalentinstag\b/, name: 'Valentinstag', fn: y => fixed(y, 2, 14) },
        { re: /\ballerheiligen\b/, name: 'Allerheiligen', fn: y => fixed(y, 11, 1) },
        { re: /tag der deutschen einheit|\bnationalfeiertag\b|\b3\.? oktober\b/, name: 'Tag der Deutschen Einheit', fn: y => fixed(y, 10, 3) },
        { re: /\btag der arbeit\b|\berster mai\b|\b1\.? mai\b/, name: 'Tag der Arbeit', fn: y => fixed(y, 5, 1) }
    ];
    function nextOccurrence(fn) {
        const t = today();
        for (let y = t.getFullYear(); y <= t.getFullYear() + 1; y++) { const d = fn(y); if (d >= t) return d; }
        return null;
    }

    /* ---------- Sprachbefehle ---------- */
    function handleFeiertageCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 90) return false;

        // Bundesland festlegen oder abfragen
        if (/\bbundesland\b/.test(t)) {
            const st = stateFromText(t);
            if (st && /(mein|meins|stell|setz|änder|ändere|wechsel|merk|ist|auf)/.test(t) && !/\b(welches|was)\b/.test(t)) {
                writeStore(STATE_KEY, st);
                say(`Gut, ich rechne die Feiertage jetzt für ${STATE_LABEL[st]}.`);
                return true;
            }
            if (/(welches|was|für welches)/.test(t)) { say(`Ich rechne die Feiertage für ${stateName()}. Sagen Sie „Mein Bundesland ist“ und den Namen, wenn das nicht stimmt.`); return true; }
            return false;
        }

        // Brückentage
        if (/\bbrückentage?\b/.test(t)) {
            const list = bridgeDays(today(), 400);
            if (!list.length) { say(`Für ${stateName()} finde ich in den nächsten Monaten keine lohnenden Brückentage.`); return true; }
            showCards(list.slice(0, 8).map(b => ({
                icon: '🌉',
                title: `${b.holiday.name}: ${b.urlaub} Urlaubstag${b.urlaub > 1 ? 'e' : ''}`,
                subtitle: `${shortDay(b.holiday.date)}${b.holiday.date.getFullYear() !== today().getFullYear() ? ' ' + b.holiday.date.getFullYear() : ''} · ${b.frei} Tage am Stück`
            })));
            const first = list.slice(0, 2).map(b => {
                const nimm = b.urlaub === 1 ? `Nehmen Sie ${shortDay(b.take[0])} frei` : `Nehmen Sie ${shortDay(b.take[0])} und ${shortDay(b.take[1])} frei, oder ${shortDay(b.alt[0])} und ${shortDay(b.alt[1])}`;
                return `${b.holiday.name} ist am ${dayText(b.holiday.date)}. ${nimm}, dann haben Sie ${b.frei} Tage am Stück.`;
            });
            say(`In ${stateName()} gibt es als Nächstes diese Brückentage. ${first.join(' ')} Weitere stehen unten.`);
            return true;
        }

        // "Ist heute / morgen Feiertag?"
        let m = t.match(/\bist\s+(heute|morgen|übermorgen)\s+(?:ein\s+)?feiertag\b/);
        if (m) {
            const off = { heute: 0, morgen: 1, übermorgen: 2 }[m[1]];
            const d = addDays(today(), off);
            const hit = holidaysFor(d.getFullYear(), currentState()).find(h => daysBetween(h.date, d) === 0);
            say(hit ? `Ja, ${m[1]} ist ${hit.name}.` : `Nein, ${m[1]} ist kein Feiertag in ${stateName()}.`);
            return true;
        }

        // Nächster Feiertag
        if (/\bn(?:ä|ae)chste[rnms]?\s+feiertag\b/.test(t) || /\bfeiertag\b.*\b(als nächstes|nächstes)\b/.test(t)) {
            const next = upcomingHolidays(today(), 400);
            if (!next.length) { say('Ich finde gerade keinen Feiertag.'); return true; }
            const h = next[0], n = daysBetween(today(), h.date);
            showCards(next.slice(0, 5).map(x => ({ icon: '🎉', title: x.name, subtitle: `${shortDay(x.date)} · ${untilText(daysBetween(today(), x.date))}` })));
            say(`Der nächste Feiertag ist ${h.name}, am ${dayText(h.date)}, also ${untilText(n)}.`);
            return true;
        }

        // Alle Feiertage (dieses Jahr / noch / im Monat)
        if (/\bfeiertage\b/.test(t) && /(welche|alle|gibt es|kommen|noch|dieses jahr|nächstes jahr|nächsten)/.test(t)) {
            const nextYear = /nächstes jahr/.test(t);
            const from = nextYear ? fixed(today().getFullYear() + 1, 1, 1) : today();
            const to = fixed(from.getFullYear(), 12, 31);
            const list = upcomingHolidays(from, 800).filter(h => h.date <= to);
            if (!list.length) { say(`In ${nextYear ? 'dem Jahr' : 'diesem Jahr'} stehen keine Feiertage mehr an.`); return true; }
            showCards(list.slice(0, 12).map(x => ({ icon: '🎉', title: x.name, subtitle: `${shortDay(x.date)} · ${untilText(daysBetween(today(), x.date))}` })));
            say(`${nextYear ? 'Im nächsten Jahr' : 'In diesem Jahr'} gibt es in ${stateName()} noch ${list.length} ${list.length === 1 ? 'Feiertag' : 'Feiertage'}. Als Nächstes: ${joinList(list.slice(0, 3).map(x => `${x.name}, ${shortDay(x.date)}`))}.`);
            return true;
        }

        // "Wann ist Ostern / Weihnachten / Pfingsten ...?"
        m = t.match(/^(?:wann (?:ist|sind|war|kommt)|an welchem tag (?:ist|fällt)|welcher tag ist)\s+(.+)$/);
        if (m) {
            const hit = NAMED.find(n => n.re.test(m[1]));
            if (hit) {
                const d = nextOccurrence(hit.fn);
                if (!d) return false;
                const n = daysBetween(today(), d);
                showCards([{ icon: '📅', title: hit.name, subtitle: `${dayText(d)} · ${untilText(n)}` }]);
                say(`${hit.name} ist am ${dayText(d)}, also ${untilText(n)}.`);
                return true;
            }
        }
        return false;
    }

    window.handleFeiertageCommand = handleFeiertageCommand;
    window._feiertageTest = { easter, holidaysFor, bridgeDays };   // nur zum Testen
})();
