/* ============================================================
   WELTUHR: "Öffne die Weltuhr" zeigt mehrere Uhren nebeneinander (zwei Spalten), live mit Sekunden, Tag/Nacht, Datum und dem Unterschied zu deiner Zeit.
   - Voreingestellt: Istanbul (Türkei), London, New York, Tokio, Dubai, Sydney. Bis zu 12 Orte, die Liste bleibt gespeichert.
   - Sprache: "Öffne die Weltuhr" / "Zeig mir die Weltzeit" / "Weltuhren", "Füge Bukarest zur Weltuhr hinzu", "Entferne Sydney aus der Weltuhr", "Setze die Weltuhr zurück".
   - Der Knopf "Vorlesen" nennt die Zeiten. Die Weltzeit-Abfrage "Wie spät ist es in Istanbul?" (weltzeit.js) bleibt unverändert.
   Eigenständig (kein anderes Skript nötig außer storage.js und voice.js); die Ortsliste steht hier unten in WU_CITIES. Muss nach localcommands.js geladen werden.
   ============================================================ */
(function () {
    const KEY = 'jv_weltuhr';
    const MAX = 12;
    const HOME = { id: 'hier', name: 'Hier', sub: 'Deutschland', tz: 'Europe/Berlin' };
    const norm = s => String(s || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();

    /* id, Anzeigename, Zusatz, Zeitzone, Suchwörter (kleingeschrieben) */
    const CITIES = [
        ['istanbul', 'Istanbul', 'Türkei', 'Europe/Istanbul', ['istanbul', 'türkei', 'tuerkei', 'ankara', 'antalya', 'izmir', 'turkey']],
        ['london', 'London', 'Großbritannien', 'Europe/London', ['london', 'england', 'großbritannien', 'grossbritannien', 'uk', 'britannien']],
        ['newyork', 'New York', 'USA Ostküste', 'America/New_York', ['new york', 'newyork', 'ostküste', 'ostkueste', 'washington', 'miami', 'boston']],
        ['tokio', 'Tokio', 'Japan', 'Asia/Tokyo', ['tokio', 'tokyo', 'japan']],
        ['dubai', 'Dubai', 'Emirate', 'Asia/Dubai', ['dubai', 'emirate', 'abu dhabi', 'vereinigte arabische emirate']],
        ['sydney', 'Sydney', 'Australien', 'Australia/Sydney', ['sydney', 'australien', 'melbourne', 'canberra']],
        ['losangeles', 'Los Angeles', 'USA Westküste', 'America/Los_Angeles', ['los angeles', 'losangeles', 'kalifornien', 'westküste', 'westkueste', 'san francisco', 'las vegas']],
        ['chicago', 'Chicago', 'USA Mitte', 'America/Chicago', ['chicago', 'texas', 'houston', 'dallas']],
        ['toronto', 'Toronto', 'Kanada', 'America/Toronto', ['toronto', 'kanada', 'montreal', 'ottawa']],
        ['mexiko', 'Mexiko-Stadt', 'Mexiko', 'America/Mexico_City', ['mexiko', 'mexico', 'mexiko stadt', 'mexico city']],
        ['saopaulo', 'São Paulo', 'Brasilien', 'America/Sao_Paulo', ['sao paulo', 'são paulo', 'brasilien', 'rio', 'rio de janeiro', 'brasilia']],
        ['buenosaires', 'Buenos Aires', 'Argentinien', 'America/Argentina/Buenos_Aires', ['buenos aires', 'argentinien']],
        ['lissabon', 'Lissabon', 'Portugal', 'Europe/Lisbon', ['lissabon', 'portugal']],
        ['athen', 'Athen', 'Griechenland', 'Europe/Athens', ['athen', 'griechenland']],
        ['bukarest', 'Bukarest', 'Rumänien', 'Europe/Bucharest', ['bukarest', 'rumänien', 'ruemaenien', 'rumaenien']],
        ['kiew', 'Kiew', 'Ukraine', 'Europe/Kyiv', ['kiew', 'kyiv', 'ukraine']],
        ['moskau', 'Moskau', 'Russland', 'Europe/Moscow', ['moskau', 'russland', 'sankt petersburg']],
        ['kairo', 'Kairo', 'Ägypten', 'Africa/Cairo', ['kairo', 'ägypten', 'aegypten']],
        ['johannesburg', 'Johannesburg', 'Südafrika', 'Africa/Johannesburg', ['johannesburg', 'südafrika', 'suedafrika', 'kapstadt']],
        ['lagos', 'Lagos', 'Nigeria', 'Africa/Lagos', ['lagos', 'nigeria']],
        ['teheran', 'Teheran', 'Iran', 'Asia/Tehran', ['teheran', 'iran']],
        ['riad', 'Riad', 'Saudi-Arabien', 'Asia/Riyadh', ['riad', 'saudi arabien', 'saudi-arabien', 'mekka']],
        ['mumbai', 'Mumbai', 'Indien', 'Asia/Kolkata', ['mumbai', 'indien', 'delhi', 'neu delhi', 'kalkutta', 'bombay']],
        ['bangkok', 'Bangkok', 'Thailand', 'Asia/Bangkok', ['bangkok', 'thailand']],
        ['singapur', 'Singapur', 'Singapur', 'Asia/Singapore', ['singapur', 'singapore']],
        ['hongkong', 'Hongkong', 'China', 'Asia/Hong_Kong', ['hongkong', 'hong kong']],
        ['peking', 'Peking', 'China', 'Asia/Shanghai', ['peking', 'beijing', 'shanghai', 'china']],
        ['seoul', 'Seoul', 'Südkorea', 'Asia/Seoul', ['seoul', 'südkorea', 'suedkorea', 'korea']],
        ['auckland', 'Auckland', 'Neuseeland', 'Pacific/Auckland', ['auckland', 'neuseeland', 'wellington']],
        ['honolulu', 'Honolulu', 'Hawaii', 'Pacific/Honolulu', ['honolulu', 'hawaii']]
    ].map(([id, name, sub, tz, words]) => ({ id, name, sub, tz, words }));
    const DEFAULTS = ['istanbul', 'london', 'newyork', 'tokio', 'dubai', 'sydney'];

    function loadIds() {
        try { const v = JSON.parse(getPersistentData(KEY, 'null')); if (Array.isArray(v)) return v.filter(id => CITIES.some(c => c.id === id)).slice(0, MAX); } catch (e) {}
        return DEFAULTS.slice();
    }
    function saveIds(ids) { try { setPersistentData(KEY, JSON.stringify(ids.slice(0, MAX))); } catch (e) {} }
    const cityById = id => CITIES.find(c => c.id === id);
    function findCity(text) {
        const t = norm(text).replace(/^(?:die|der|das|den|nach|in|von)\s+/, '');
        if (!t) return null;
        return CITIES.find(c => c.words.includes(t)) || CITIES.find(c => c.words.some(w => w.length > 3 && (t.includes(w) || w.includes(t)) && t.length > 3)) || null;
    }

    /* ---------- Zeit-Hilfen ---------- */
    function fmtParts(tz, d) {
        const p = {};
        new Intl.DateTimeFormat('de-DE', { timeZone: tz, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', weekday: 'short', day: 'numeric', month: 'short' })
            .formatToParts(d).forEach(x => { p[x.type] = x.value; });
        return p;
    }
    function offsetMin(tz, d) {   // Versatz der Zeitzone zu UTC in Minuten
        const s = d.toLocaleString('sv-SE', { timeZone: tz }).replace(' ', 'T') + 'Z';
        return Math.round((Date.parse(s) - Math.floor(d.getTime() / 1000) * 1000) / 60000);
    }
    function diffText(tz, d) {
        const m = offsetMin(tz, d) - offsetMin(HOME.tz, d);
        if (m === 0) return 'gleiche Zeit';
        const h = Math.abs(m) / 60;
        const hs = Number.isInteger(h) ? String(h) : String(h).replace('.', ',');
        return (m > 0 ? '+' : '−') + hs + (h === 1 ? ' Stunde' : ' Stunden');
    }
    function dayWord(tz, d) {
        const day = z => d.toLocaleDateString('sv-SE', { timeZone: z });
        const diff = Math.round((Date.parse(day(tz) + 'T12:00:00Z') - Date.parse(day(HOME.tz) + 'T12:00:00Z')) / 86400000);
        return diff === 0 ? 'heute' : diff === 1 ? 'morgen' : diff === -1 ? 'gestern' : '';
    }
    function isDay(tz, d) { const h = Number(fmtParts(tz, d).hour); return h >= 6 && h < 20; }
    function spoken(tz, d) { const p = fmtParts(tz, d); const h = Number(p.hour), m = Number(p.minute); return m === 0 ? `${h} Uhr` : `${h} Uhr ${m}`; }

    /* ---------- Fenster ---------- */
    let el = null, timer = null;
    function ensureStyle() {
        if (document.getElementById('wuStyle')) return;
        const st = document.createElement('style');
        st.id = 'wuStyle';
        st.textContent =
            '#jvWeltuhr{position:fixed;inset:0;z-index:92;background:rgba(4,9,15,.97);color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
            '#jvWeltuhr .wu-head{padding:18px 18px 6px;text-align:center}' +
            '#jvWeltuhr .wu-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.14em;color:#49d7ff}' +
            '#jvWeltuhr .wu-sub{font:500 12px "IBM Plex Mono",monospace;color:#7fb8cf;margin-top:4px}' +
            '#jvWeltuhr .wu-grid{flex:1 1 auto;overflow-y:auto;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:10px 14px;align-content:start}' +
            '#jvWeltuhr .wu-tile{border:1px solid rgba(93,209,255,.3);border-radius:10px;background:rgba(10,22,33,.88);padding:10px 11px;min-width:0}' +
            '#jvWeltuhr .wu-tile.home{grid-column:1 / -1;border-color:#49d7ff;background:rgba(14,34,50,.92)}' +
            '#jvWeltuhr .wu-n{display:flex;justify-content:space-between;gap:6px;font:700 12px "IBM Plex Mono",monospace;letter-spacing:.06em;color:#49d7ff;text-transform:uppercase}' +
            '#jvWeltuhr .wu-t{font:700 30px "IBM Plex Mono",monospace;color:#fff;margin:4px 0 2px;letter-spacing:.02em}' +
            '#jvWeltuhr .wu-t small{font-size:15px;color:#7fb8cf;margin-left:3px}' +
            '#jvWeltuhr .wu-d{font-size:13px;color:#cfe6f1}' +
            '#jvWeltuhr .wu-o{font:600 12px "IBM Plex Mono",monospace;color:#ffb347;margin-top:2px}' +
            '#jvWeltuhr .wu-bar{display:flex;gap:10px;padding:8px 14px 14px}' +
            '#jvWeltuhr .wu-btn{flex:1;padding:11px 8px;border-radius:10px;border:1px solid rgba(93,209,255,.4);background:rgba(10,22,33,.95);color:#49d7ff;font:700 13px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase}' +
            '#jvWeltuhr .wu-btn.primary{background:rgba(73,215,255,.2);color:#fff}';
        document.head.appendChild(st);
    }
    function entries() { return [HOME].concat(loadIds().map(cityById).filter(Boolean)); }

    function paint() {
        if (!el) return;
        const d = new Date();
        el.querySelectorAll('[data-tz]').forEach(t => {
            const tz = t.getAttribute('data-tz'), p = fmtParts(tz, d);
            t.querySelector('.wu-t').firstChild.nodeValue = `${p.hour}:${p.minute}`;
            t.querySelector('.wu-t small').textContent = p.second;
            t.querySelector('.wu-i').textContent = isDay(tz, d) ? '☀️' : '🌙';
            const w = dayWord(tz, d);
            t.querySelector('.wu-d').textContent = `${p.weekday} ${p.day}. ${p.month}` + (w && tz !== HOME.tz ? ' · ' + w : '');
            if (tz !== HOME.tz) t.querySelector('.wu-o').textContent = diffText(tz, d);
        });
    }

    function close() {
        if (timer) { clearInterval(timer); timer = null; }
        if (el) { try { el.remove(); } catch (e) {} el = null; }
        try { document.body.classList.remove('panel-open'); } catch (e) {}
        try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) {}
    }
    function open() {
        ensureStyle();
        close();
        const mk = (p, tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; p.appendChild(x); return x; };
        el = document.createElement('div');
        el.id = 'jvWeltuhr';
        const head = mk(el, 'div', 'wu-head');
        mk(head, 'div', 'wu-title', 'WELTUHR');
        mk(head, 'div', 'wu-sub', 'Uhrzeiten rund um die Welt, live');
        const grid = mk(el, 'div', 'wu-grid');
        entries().forEach(c => {
            const t = mk(grid, 'div', 'wu-tile' + (c.id === 'hier' ? ' home' : ''));
            t.setAttribute('data-tz', c.tz);
            const n = mk(t, 'div', 'wu-n');
            mk(n, 'span', '', c.name + (c.sub && c.id !== 'hier' ? ' · ' + c.sub : (c.id === 'hier' ? ' · ' + c.sub : '')));
            mk(n, 'span', 'wu-i', '');
            const tm = mk(t, 'div', 'wu-t', '--:--'); mk(tm, 'small', '', '--');
            mk(t, 'div', 'wu-d', '');
            mk(t, 'div', 'wu-o', c.id === 'hier' ? 'deine Zeit' : '');
        });
        const bar = mk(el, 'div', 'wu-bar');
        mk(bar, 'button', 'wu-btn primary', '🔊 Vorlesen').addEventListener('click', () => { try { speak(readText()); } catch (e) {} });
        mk(bar, 'button', 'wu-btn', 'Schließen').addEventListener('click', close);
        document.body.appendChild(el);
        try { document.body.classList.add('panel-open'); } catch (e) {}
        try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) {}
        paint();
        timer = setInterval(paint, 1000);
    }
    function readText() {
        const d = new Date();
        const list = entries().filter(c => c.id !== 'hier');
        if (!list.length) return 'Die Weltuhr ist leer. Sagen Sie zum Beispiel: Füge Istanbul zur Weltuhr hinzu.';
        return 'Bei uns ist es ' + spoken(HOME.tz, d) + '. ' + list.map(c => {
            const w = dayWord(c.tz, d);
            return `In ${c.name} ist es ${spoken(c.tz, d)}${w && w !== 'heute' ? ' (' + w + ')' : ''}`;
        }).join('. ') + '.';
    }

    /* ---------- Sprachbefehle ---------- */
    const OPEN_RE = /^(?:(?:bitte|jarvis)\s+)?(?:(?:öffne|oeffne|zeig|zeige|starte|mach|mache|stell|stelle)(?:\s+mir)?(?:\s+(?:bitte|mal))?\s+)?(?:(?:die|meine|mir die|mir meine)\s+)?(?:weltuhr(?:en)?|welt uhr(?:en)?|weltzeituhr(?:en)?|weltzeit(?:en)?|uhren der welt)(?:\s+(?:auf|an|bitte|mal))?$|^(?:wie spät ist es|wie viel uhr ist es|wieviel uhr ist es)\s+(?:auf der welt|überall|in der welt|in aller welt)$/;
    const ADD_RE = /^(?:(?:bitte|jarvis)\s+)?(?:füge|füg|fuege|fueg|setz|setze|nimm|nehm|tu|tue|pack|packe|mach|mache|stell)\s+(.+?)\s+(?:zur|zu der|in die|auf die|bei der|der)\s+(?:weltuhr|weltzeit|welt uhr|weltzeituhr)(?:\s+(?:hinzu|dazu|auf|rein|drauf))?$/;
    const DEL_RE = /^(?:(?:bitte|jarvis)\s+)?(?:entferne|entfern|lösche|loesche|lösch|loesch|nimm|nehm|streiche|streich|werf|wirf)\s+(.+?)\s+(?:aus der|von der|aus|von)\s+(?:weltuhr|weltzeit|welt uhr|weltzeituhr)(?:\s+(?:raus|heraus|weg|runter))?$/;
    const RESET_RE = /^(?:(?:bitte|jarvis)\s+)?(?:setz|setze|stell|stelle)\s+(?:die\s+)?(?:weltuhr|weltzeit)\s+(?:zurück|zurueck|auf standard|auf die standardorte)$/;

    function say(m) { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    const known = () => CITIES.slice(0, 12).map(c => c.name).join(', ');

    function handle(text) {
        const t = norm(text);
        if (!t || t.length > 90) return false;
        if (OPEN_RE.test(t)) { open(); say('Hier ist die Weltuhr.'); return true; }
        let m = t.match(ADD_RE);
        if (m) {
            const c = findCity(m[1]);
            if (!c) { say(`Den Ort ${m[1]} kenne ich für die Weltuhr noch nicht. Bekannt sind zum Beispiel ${known()}.`); return true; }
            const ids = loadIds();
            if (ids.includes(c.id)) { say(`${c.name} ist schon in der Weltuhr.`); return true; }
            if (ids.length >= MAX) { say(`Die Weltuhr ist mit ${MAX} Orten voll. Entfernen Sie zuerst einen.`); return true; }
            ids.push(c.id); saveIds(ids);
            if (el) open();
            say(`${c.name} steht jetzt in der Weltuhr.`);
            return true;
        }
        m = t.match(DEL_RE);
        if (m) {
            const c = findCity(m[1]);
            const ids = loadIds();
            if (!c || !ids.includes(c.id)) { say(`${c ? c.name : m[1]} ist nicht in der Weltuhr.`); return true; }
            saveIds(ids.filter(id => id !== c.id));
            if (el) open();
            say(`${c.name} ist aus der Weltuhr entfernt.`);
            return true;
        }
        if (RESET_RE.test(t)) { saveIds(DEFAULTS.slice()); if (el) open(); say('Die Weltuhr zeigt wieder die Standardorte.'); return true; }
        return false;
    }

    window.openWeltuhr = open;
    window.closeWeltuhr = close;
    window.handleWeltuhrCommand = handle;
    window.__weltuhrTest = { findCity, offsetMin, diffText, dayWord, readText, loadIds, entries };

    if (window.jvCommands) {   // Befehlsliste (commands.js)
        window.jvCommands.use('weltuhr', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Weltuhr', e); }
            return next(text);
        }, 1000);
    }
})();