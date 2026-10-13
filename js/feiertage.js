/* ============================================================
   FEIERTAGE UND BRÜCKENTAGE: "Wann ist der nächste Feiertag?", "Ist morgen Feiertag?", "Wann ist Ostern?",
   "Welche Brückentage gibt es?".
   Alles wird in der App selbst berechnet (Ostern nach Gauß, alle anderen Feiertage daraus), es ist keine Schnittstelle nötig.
   Bundesland: Standard ist Schleswig-Holstein. "Mein Bundesland ist Bayern" wird von den Ferien (ferien.js) beantwortet; die Feiertage merken es sich
   dabei still mit. Steht ein Bundesland schon in den Ferien-Einstellungen, wird versucht, es von dort zu übernehmen.
   "Öffne Feiertage" und "Welche Brückentage gibt es?" öffnen ein Fenster mit Liste und Brückentagen (extrafenster.js; ohne diese Datei erscheinen Karten).
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

    /* ---------- Fenster: Feiertage und Brückentage ---------- */
    function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
    const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];

    /* Die Tage einer Brücke von der Lücke bis zum Ende des freien Blocks: [{ date, kind: 'h' (Feiertag) | 'u' (Urlaub) | 'w' (Wochenende) }] */
    function bridgeSpan(b, allHolidays) {
        const isHol = (d) => allHolidays.some(h => daysBetween(h.date, d) === 0);
        const isWe = (d) => d.getDay() === 0 || d.getDay() === 6;
        const isTake = (d) => b.take.some(x => daysBetween(x, d) === 0);
        const days = [b.holiday.date].concat(b.take).sort((x, y) => x - y);
        let first = days[0], last = days[days.length - 1];
        while (isWe(addDays(first, -1)) || isHol(addDays(first, -1))) first = addDays(first, -1);
        while (isWe(addDays(last, 1)) || isHol(addDays(last, 1))) last = addDays(last, 1);
        const out = [];
        for (let d = first; d <= last; d = addDays(d, 1)) out.push({ date: d, kind: isTake(d) ? 'u' : isHol(d) ? 'h' : 'w' });
        return out;
    }

    function dayBox(x) {
        const color = { h: ['#0b3b52', '#49d7ff', '#9fe7ff'], u: ['#4a3300', '#ffb700', '#ffd980'], w: ['#14202e', '#3b566b', '#7fa7bd'] }[x.kind];
        return `<div style="flex:1;min-width:0;text-align:center;padding:5px 0;border-radius:7px;background:${color[0]};border:1px solid ${color[1]}">` +
            `<div style="font-size:10px;color:${color[2]}">${WD[x.date.getDay()]}</div><div style="font-size:14px;font-weight:700;color:#fff">${x.date.getDate()}</div></div>`;
    }

    function openHolidayWindow() {
        const st = currentState(), t = today();
        const list = upcomingHolidays(t, 400).slice(0, 14);
        const bridges = bridgeDays(t, 430);
        const all = holidaysFor(t.getFullYear(), st).concat(holidaysFor(t.getFullYear() + 1, st), holidaysFor(t.getFullYear() + 2, st));
        if (typeof window.openExtraWindow !== 'function') {
            showCards(list.slice(0, 8).map(x => ({ icon: '🎉', title: x.name, subtitle: `${shortDay(x.date)} · ${untilText(daysBetween(t, x.date))}` })));
            return;
        }
        const sec = (title) => `<div style="margin:16px 0 8px;font-size:12px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#49d7ff">${title}</div>`;
        const rows = list.map(h => {
            const n = daysBetween(t, h.date), we = h.date.getDay() === 0 || h.date.getDay() === 6;
            const year = h.date.getFullYear() !== t.getFullYear() ? ' ' + h.date.getFullYear() : '';
            return `<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-top:1px solid rgba(93,209,255,.12)">` +
                `<div style="flex:0 0 46px;text-align:center;border:1px solid rgba(93,209,255,.35);border-radius:8px;padding:3px 0;background:#0a1621"><div style="font-size:16px;font-weight:700;color:#fff">${h.date.getDate()}</div>` +
                `<div style="font-size:10px;color:#49d7ff;text-transform:uppercase">${h.date.toLocaleDateString('de-DE', { month: 'short' }).replace('.', '')}</div></div>` +
                `<div style="flex:1;min-width:0"><div style="font-size:13px;color:#e2e8f0">${esc(h.name)}</div>` +
                `<div style="font-size:11px;color:#7fa7bd">${h.date.toLocaleDateString('de-DE', { weekday: 'long' })}${year}${we ? ' · fällt aufs Wochenende' : ''}</div></div>` +
                `<div style="flex:0 0 auto;font-size:11px;color:${n <= 1 ? '#00ff66' : '#9fd8ee'};text-align:right">${untilText(n)}</div></div>`;
        }).join('');
        const bridgeHtml = bridges.length ? bridges.map(b => {
            const span = bridgeSpan(b, all);
            const takeText = b.urlaub === 1 ? shortDay(b.take[0]) : `${shortDay(b.take[0])} und ${shortDay(b.take[1])}`;
            const alt = b.alt ? `<div style="font-size:11px;color:#7fa7bd;margin-top:4px">Oder: ${shortDay(b.alt[0])} und ${shortDay(b.alt[1])}</div>` : '';
            const year = b.holiday.date.getFullYear() !== t.getFullYear() ? ' ' + b.holiday.date.getFullYear() : '';
            return `<div style="margin:0 0 10px;padding:10px;border:1px solid rgba(255,183,0,.35);border-radius:10px;background:rgba(255,183,0,.05)">` +
                `<div style="font-size:13px;color:#fff">${esc(b.holiday.name)} <span style="color:#7fa7bd;font-size:11px">· ${shortDay(b.holiday.date)}${year}</span></div>` +
                `<div style="font-size:12px;color:#ffd980;margin:4px 0 8px">${b.urlaub} Urlaubstag${b.urlaub > 1 ? 'e' : ''}: ${esc(takeText)} <span style="color:#00ff66">→ ${span.length} Tage am Stück</span></div>` +
                `<div style="display:flex;gap:4px">${span.map(dayBox).join('')}</div>${alt}</div>`;
        }).join('') : `<div style="font-size:12px;color:#7fa7bd;padding:6px 0">In den nächsten Monaten gibt es keine lohnenden Brückentage.</div>`;
        const legend = `<div style="display:flex;gap:12px;font-size:10px;color:#7fa7bd;margin:2px 0 10px"><span><b style="color:#49d7ff">■</b> Feiertag</span><span><b style="color:#ffb700">■</b> Urlaubstag</span><span><b style="color:#3b566b">■</b> Wochenende</span></div>`;
        window.openExtraWindow('Feiertage', `<div style="font-size:12px;color:#9fd8ee;margin-top:-2px">${esc(STATE_LABEL[st])}</div>` + sec('Kommende Feiertage') + rows + sec('Brückentage') + legend + bridgeHtml +
            `<div style="font-size:10px;color:#5d7e91;margin-top:12px">Anderes Bundesland? Sag: „Mein Bundesland ist …“</div>`);
    }

    /* ---------- Sprachbefehle ---------- */
    function handleFeiertageCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 90) return false;

        // Bundesland: "Mein Bundesland ist Hamburg" gehört zu den Ferien (ferien.js) und wird dort beantwortet.
        // Hier wird es nur still mitgemerkt (return false), damit die Feiertage dasselbe Bundesland benutzen.
        if (/\bbundesland\b/.test(t)) {
            const st = stateFromText(t);
            if (st && /(mein|meins|stell|setz|änder|ändere|wechsel|merk|ist|auf)/.test(t) && !/\b(welches|was)\b/.test(t)) writeStore(STATE_KEY, st);
            return false;
        }

        // "Öffne Feiertage", "Zeig mir die Feiertage", "Feiertage anzeigen", "Feiertagskalender": Fenster mit Feiertagen und Brückentagen
        if (/\b(feiertage?|feiertagskalender|brückentage?)\b/.test(t) && /(?:^|\s)(?:öffne|öffnen|zeig|zeige|zeigen|anzeigen|ansicht|übersicht|kalender|liste)(?=\s|$)/.test(t)) {
            const next = upcomingHolidays(today(), 400)[0];
            openHolidayWindow();
            say(next ? `Hier sind die Feiertage und Brückentage für ${stateName()}. Der nächste Feiertag ist ${next.name}, am ${dayText(next.date)}, also ${untilText(daysBetween(today(), next.date))}.` : `Hier sind die Feiertage für ${stateName()}.`);
            return true;
        }

        // Brückentage
        if (/\bbrückentage?\b/.test(t)) {
            const list = bridgeDays(today(), 400);
            if (!list.length) { say(`Für ${stateName()} finde ich in den nächsten Monaten keine lohnenden Brückentage.`); return true; }
            openHolidayWindow();
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
            openHolidayWindow();
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
    window._feiertageTest = { easter, holidaysFor, bridgeDays, bridgeSpan };   // nur zum Testen
})();
