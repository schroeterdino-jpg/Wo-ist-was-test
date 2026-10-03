/* ============================================================
   WELTZEIT: "Wie spät ist es in Istanbul?", "Uhrzeit in Tokio", "Zeitunterschied zu Japan".
   Rechnet mit den Zeitzonen des Handys (Intl), es ist keine Schnittstelle nötig. Sommer- und Winterzeit stimmen dadurch automatisch.
   Bezugspunkt ist immer Deutschland (Europe/Berlin).
   Wird von erweiterungen.js in die festen Sprachbefehle eingehängt. Braucht: speak (voice.js), showActionCards/clearActionCards.
   ============================================================ */
(function () {
    const HOME = 'Europe/Berlin';

    /* Name (so wie man ihn sagt) -> { label, zone }. Mehrere Namen pro Ort sind erlaubt. */
    const PLACES = [
        { names: ['istanbul', 'türkei', 'antalya', 'ankara', 'izmir', 'bodrum', 'alanya'], label: 'Istanbul', zone: 'Europe/Istanbul' },
        { names: ['new york', 'newyork', 'florida', 'miami', 'orlando', 'boston', 'washington', 'atlanta', 'ostküste'], label: 'New York', zone: 'America/New_York' },
        { names: ['chicago', 'texas', 'houston', 'dallas', 'new orleans'], label: 'Chicago', zone: 'America/Chicago' },
        { names: ['denver', 'colorado'], label: 'Denver', zone: 'America/Denver' },
        { names: ['los angeles', 'las vegas', 'kalifornien', 'san francisco', 'seattle', 'westküste', 'san diego'], label: 'Los Angeles', zone: 'America/Los_Angeles' },
        { names: ['hawaii', 'honolulu'], label: 'Honolulu', zone: 'Pacific/Honolulu' },
        { names: ['toronto', 'montreal', 'ottawa'], label: 'Toronto', zone: 'America/Toronto' },
        { names: ['vancouver'], label: 'Vancouver', zone: 'America/Vancouver' },
        { names: ['mexiko', 'mexico', 'mexiko-stadt', 'mexico city'], label: 'Mexiko-Stadt', zone: 'America/Mexico_City' },
        { names: ['kuba', 'havanna'], label: 'Havanna', zone: 'America/Havana' },
        { names: ['são paulo', 'sao paulo', 'brasilien', 'rio', 'rio de janeiro'], label: 'São Paulo', zone: 'America/Sao_Paulo' },
        { names: ['buenos aires', 'argentinien'], label: 'Buenos Aires', zone: 'America/Argentina/Buenos_Aires' },
        { names: ['london', 'england', 'großbritannien', 'schottland', 'manchester', 'liverpool'], label: 'London', zone: 'Europe/London' },
        { names: ['dublin', 'irland'], label: 'Dublin', zone: 'Europe/Dublin' },
        { names: ['lissabon', 'portugal', 'porto', 'madeira', 'algarve'], label: 'Lissabon', zone: 'Europe/Lisbon' },
        { names: ['kanaren', 'teneriffa', 'gran canaria', 'lanzarote', 'fuerteventura'], label: 'auf den Kanaren', zone: 'Atlantic/Canary' },
        { names: ['reykjavik', 'island'], label: 'Reykjavik', zone: 'Atlantic/Reykjavik' },
        { names: ['paris', 'frankreich', 'nizza', 'lyon', 'marseille'], label: 'Paris', zone: 'Europe/Paris' },
        { names: ['madrid', 'spanien', 'mallorca', 'barcelona', 'ibiza', 'valencia', 'sevilla'], label: 'Madrid', zone: 'Europe/Madrid' },
        { names: ['rom', 'italien', 'mailand', 'venedig', 'neapel', 'florenz', 'sizilien', 'sardinien'], label: 'Rom', zone: 'Europe/Rome' },
        { names: ['wien', 'österreich'], label: 'Wien', zone: 'Europe/Vienna' },
        { names: ['zürich', 'schweiz', 'bern', 'genf'], label: 'Zürich', zone: 'Europe/Zurich' },
        { names: ['amsterdam', 'niederlande', 'holland'], label: 'Amsterdam', zone: 'Europe/Amsterdam' },
        { names: ['brüssel', 'belgien'], label: 'Brüssel', zone: 'Europe/Brussels' },
        { names: ['kopenhagen', 'dänemark'], label: 'Kopenhagen', zone: 'Europe/Copenhagen' },
        { names: ['stockholm', 'schweden'], label: 'Stockholm', zone: 'Europe/Stockholm' },
        { names: ['oslo', 'norwegen'], label: 'Oslo', zone: 'Europe/Oslo' },
        { names: ['helsinki', 'finnland'], label: 'Helsinki', zone: 'Europe/Helsinki' },
        { names: ['warschau', 'polen', 'krakau', 'danzig'], label: 'Warschau', zone: 'Europe/Warsaw' },
        { names: ['prag', 'tschechien'], label: 'Prag', zone: 'Europe/Prague' },
        { names: ['budapest', 'ungarn'], label: 'Budapest', zone: 'Europe/Budapest' },
        { names: ['athen', 'griechenland', 'kreta', 'rhodos', 'korfu'], label: 'Athen', zone: 'Europe/Athens' },
        { names: ['kroatien', 'zagreb', 'split', 'dubrovnik'], label: 'Kroatien', zone: 'Europe/Zagreb' },
        { names: ['bukarest', 'rumänien'], label: 'Bukarest', zone: 'Europe/Bucharest' },
        { names: ['kiew', 'ukraine'], label: 'Kiew', zone: 'Europe/Kyiv' },
        { names: ['moskau', 'russland'], label: 'Moskau', zone: 'Europe/Moscow' },
        { names: ['kairo', 'ägypten', 'hurghada', 'sharm el sheikh'], label: 'Kairo', zone: 'Africa/Cairo' },
        { names: ['tel aviv', 'jerusalem', 'israel'], label: 'Tel Aviv', zone: 'Asia/Jerusalem' },
        { names: ['dubai', 'abu dhabi', 'emirate', 'emiraten'], label: 'Dubai', zone: 'Asia/Dubai' },
        { names: ['teheran', 'iran'], label: 'Teheran', zone: 'Asia/Tehran' },
        { names: ['karatschi', 'pakistan', 'islamabad'], label: 'Karatschi', zone: 'Asia/Karachi' },
        { names: ['mumbai', 'delhi', 'neu delhi', 'indien', 'kalkutta', 'bangalore'], label: 'Indien', zone: 'Asia/Kolkata' },
        { names: ['bangkok', 'thailand', 'phuket', 'pattaya', 'koh samui'], label: 'Bangkok', zone: 'Asia/Bangkok' },
        { names: ['hanoi', 'vietnam', 'ho chi minh'], label: 'Vietnam', zone: 'Asia/Ho_Chi_Minh' },
        { names: ['jakarta'], label: 'Jakarta', zone: 'Asia/Jakarta' },
        { names: ['bali'], label: 'Bali', zone: 'Asia/Makassar' },
        { names: ['singapur'], label: 'Singapur', zone: 'Asia/Singapore' },
        { names: ['malaysia', 'kuala lumpur'], label: 'Kuala Lumpur', zone: 'Asia/Kuala_Lumpur' },
        { names: ['manila', 'philippinen'], label: 'Manila', zone: 'Asia/Manila' },
        { names: ['hongkong', 'hong kong'], label: 'Hongkong', zone: 'Asia/Hong_Kong' },
        { names: ['peking', 'beijing', 'shanghai', 'china'], label: 'Peking', zone: 'Asia/Shanghai' },
        { names: ['seoul', 'südkorea', 'korea'], label: 'Seoul', zone: 'Asia/Seoul' },
        { names: ['tokio', 'tokyo', 'japan', 'osaka', 'kyoto'], label: 'Tokio', zone: 'Asia/Tokyo' },
        { names: ['sydney', 'melbourne', 'canberra', 'australien'], label: 'Sydney', zone: 'Australia/Sydney' },
        { names: ['perth'], label: 'Perth', zone: 'Australia/Perth' },
        { names: ['auckland', 'neuseeland', 'wellington'], label: 'Auckland', zone: 'Pacific/Auckland' },
        { names: ['kapstadt', 'johannesburg', 'südafrika'], label: 'Südafrika', zone: 'Africa/Johannesburg' },
        { names: ['nairobi', 'kenia'], label: 'Nairobi', zone: 'Africa/Nairobi' },
        { names: ['marrakesch', 'marokko', 'casablanca'], label: 'Marokko', zone: 'Africa/Casablanca' },
        { names: ['tunesien', 'tunis'], label: 'Tunis', zone: 'Africa/Tunis' }
    ];
    /* Länder mit mehreren Zeitzonen: es werden mehrere Städte genannt */
    const MULTI = [
        { names: ['usa', 'amerika', 'vereinigte staaten', 'vereinigten staaten'], label: 'in den USA', zones: [['New York', 'America/New_York'], ['Chicago', 'America/Chicago'], ['Los Angeles', 'America/Los_Angeles']] },
        { names: ['kanada'], label: 'in Kanada', zones: [['Toronto', 'America/Toronto'], ['Vancouver', 'America/Vancouver']] }
    ];

    function say(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }
    function showCards(cards) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(cards);
        } catch (e) {}
    }

    /* Minuten, die die Zeitzone zum Zeitpunkt "date" gegenüber UTC vorgeht */
    function offsetMin(zone, date) {
        const p = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }).formatToParts(date);
        const g = type => Number(p.find(x => x.type === type).value);
        const asUtc = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'), g('second'));
        return Math.round((asUtc - Math.floor(date.getTime() / 1000) * 1000) / 60000);
    }
    function clock(zone, date) {
        const s = date.toLocaleTimeString('de-DE', { timeZone: zone, hour: '2-digit', minute: '2-digit', hour12: false });
        const [h, m] = s.split(':');
        return { h: parseInt(h, 10), m, short: `${String(parseInt(h, 10)).padStart(2, '0')}:${m}` };
    }
    function spokenClock(c) { return c.m === '00' ? `${c.h} Uhr` : `${c.h} Uhr ${c.m}`; }
    function dayKey(zone, date) { return date.toLocaleDateString('sv-SE', { timeZone: zone }); }
    function dayNote(zone, date) {
        const a = dayKey(HOME, date), b = dayKey(zone, date);
        if (a === b) return '';
        return b > a ? ', schon am nächsten Tag' : ', noch am Vortag';
    }
    function diffText(diffMin) {
        if (diffMin === 0) return 'Das ist dieselbe Zeit wie bei Ihnen.';
        const abs = Math.abs(diffMin), h = Math.floor(abs / 60), m = abs % 60;
        const dur = h === 0 ? `${m} Minuten` : `${h} ${h === 1 ? 'Stunde' : 'Stunden'}${m ? ' und ' + m + ' Minuten' : ''}`;
        return `Das sind ${dur} ${diffMin > 0 ? 'mehr' : 'weniger'} als bei Ihnen.`;
    }

    function findPlace(t) {
        const esc = n => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
        const test = n => new RegExp('(?:^|[^a-zäöüß])' + esc(n) + '(?![a-zäöüß])').test(t);
        // längste Namen zuerst, damit "new york" vor "york" und "neu delhi" vor "delhi" greift
        const flat = [];
        PLACES.forEach(p => p.names.forEach(n => flat.push({ n, p, multi: false })));
        MULTI.forEach(p => p.names.forEach(n => flat.push({ n, p, multi: true })));
        flat.sort((a, b) => b.n.length - a.n.length);
        for (const f of flat) if (test(f.n)) return f;
        return null;
    }

    function handleWeltzeitCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 90) return false;
        const wantsTime = /\b(wie spät|wie viel uhr|wieviel uhr|wie viele uhr|uhrzeit|zeitunterschied|zeitverschiebung|zeitdifferenz)\b/.test(t);
        if (!wantsTime) return false;
        if (/\b(termin|erinner|wecker|timer|alarm)\b/.test(t)) return false;
        const hit = findPlace(t);
        if (!hit) return false;
        const now = new Date();
        const homeOff = offsetMin(HOME, now);

        if (hit.multi) {
            const lines = hit.p.zones.map(([name, zone]) => {
                const c = clock(zone, now), diff = offsetMin(zone, now) - homeOff;
                return { name, c, diff, zone };
            });
            showCards(lines.map(l => ({ icon: '🕒', title: `${l.name}: ${l.c.short} Uhr`, subtitle: diffText(l.diff).replace('Das sind ', '').replace(' als bei Ihnen.', ' zu Deutschland') })));
            say(`${hit.p.label.charAt(0).toUpperCase() + hit.p.label.slice(1)} gibt es mehrere Zeitzonen. ` + lines.map((l, i) => `${i === 0 ? 'In' : 'in'} ${l.name} ist es ${spokenClock(l.c)}`).join(', ') + '.');
            return true;
        }

        const zone = hit.p.zone, c = clock(zone, now), diff = offsetMin(zone, now) - homeOff;
        const prep = /^auf den/.test(hit.p.label) ? '' : 'In ';
        const name = hit.p.label.replace(/^auf den /, 'auf den ');
        showCards([{ icon: '🕒', title: `${hit.p.label}: ${c.short} Uhr`, subtitle: diffText(diff).replace('Das sind ', '').replace(' als bei Ihnen.', ' zu Deutschland').replace('Das ist dieselbe Zeit wie bei Ihnen.', 'gleiche Zeit wie in Deutschland') }]);
        const only = /\b(zeitunterschied|zeitverschiebung|zeitdifferenz)\b/.test(t);
        if (only) say(`${hit.p.label.charAt(0).toUpperCase() + hit.p.label.slice(1)}: ${diffText(diff)} Dort ist es gerade ${spokenClock(c)}.`);
        else say(`${prep ? 'In ' + name : name.charAt(0).toUpperCase() + name.slice(1)} ist es jetzt ${spokenClock(c)}${dayNote(zone, now)}. ${diffText(diff)}`);
        return true;
    }

    window.handleWeltzeitCommand = handleWeltzeitCommand;
    window._weltzeitTest = { offsetMin, clock, findPlace };   // nur zum Testen
})();
