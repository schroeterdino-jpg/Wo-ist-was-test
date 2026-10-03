/* ============================================================
   ORTSSUCHE: "Wo ist der nächste Penny?", "Wo ist die nächste Werkstatt?", "Wo ist der nächste McDonald's?", "Wo finde ich einen Baumarkt?",
   "Zeig mir den nächsten Supermarkt", "Navigiere mich zum nächsten Rossmann", "Gibt es hier einen Bäcker?", "Tankstelle in der Nähe".
   Sucht Läden, Ketten und Einrichtungen rund um deinen Standort in der freien Kartendatenbank OpenStreetMap (Overpass-Dienst, kein Schlüssel nötig),
   nennt den nächsten mit Entfernung, Adresse und (falls hinterlegt) ob er gerade geöffnet hat, und zeigt bis zu drei Treffer als Karten.
   Ein Tipp auf eine Karte öffnet die Route (echter Link wie bei den Orten aus nearbymore.js; zu Fuß bei unter 900 Metern, sonst mit dem Auto). Bei "Navigiere mich zum nächsten ..." wird die Route
   zusätzlich selbst geöffnet, sofern der Browser das ohne Fingertipp erlaubt.
   Läuft NACH den bisherigen festen Befehlen (nearbymore.js usw.): Was dort schon klappt, bleibt, und alles, was dort nicht erkannt wird, landet hier,
   statt bei der KI und der Restaurantsuche. Bewusst NICHT hier: Tankstellen mit Spritpreisen, Restaurants, Pizza, Döner, Imbiss und Fragen wie
   "Was kostet Diesel in der Nähe?"; die bleiben bei der KI und den bisherigen Funktionen. Wird von erweiterungen.js eingehängt.
   Braucht: speak (voice.js), showActionCards/clearActionCards. Grenzen: OpenStreetMap kennt nicht jedes Geschäft, Öffnungszeiten sind nicht überall eingetragen.
   ============================================================ */
(function () {
    const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
    const RADII = [3000, 10000, 30000];

    function say(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }
    function showCards(cards) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(cards);
        } catch (e) {}
    }
    function esc(t) { return String(t).replace(/[.*+?^${}()|[\]\\"]/g, '\\$&'); }

    /* ---------- Was wird gesucht? ---------- */
    /* Arten von Orten: names = so sagt man es, filters = OpenStreetMap-Merkmale (eines davon muss zutreffen) */
    const CATS = [
        { names: ['autowerkstatt', 'kfz werkstatt', 'kfz-werkstatt', 'reparaturwerkstatt', 'werkstatt', 'autoreparatur', 'kfz'], label: 'Autowerkstatt', icon: '🔧', f: ['["shop"="car_repair"]'] },
        { names: ['supermarkt', 'supermärkte', 'einkaufsmarkt', 'einkaufsgeschäft', 'einkaufsgeschäfte', 'einkaufsladen', 'lebensmittelgeschäft', 'lebensmittelladen', 'discounter', 'einkaufsmöglichkeit', 'einkaufszentrum'], label: 'Supermarkt', icon: '🛒', f: ['["shop"~"^(supermarket|convenience|discount)$"]'] },
        { names: ['bäckerei', 'bäcker', 'backshop'], label: 'Bäckerei', icon: '🥖', f: ['["shop"="bakery"]'] },
        { names: ['metzgerei', 'metzger', 'fleischerei', 'fleischer'], label: 'Metzgerei', icon: '🥩', f: ['["shop"="butcher"]'] },
        { names: ['drogerie', 'drogeriemarkt'], label: 'Drogerie', icon: '🧴', f: ['["shop"="chemist"]'] },
        { names: ['apotheke', 'apotheken'], label: 'Apotheke', icon: '💊', f: ['["amenity"="pharmacy"]'] },
        { names: ['geldautomat', 'geldautomaten', 'bankautomat', 'atm'], label: 'Geldautomat', icon: '🏧', f: ['["amenity"="atm"]'] },
        { names: ['bank', 'sparkasse', 'volksbank', 'bankfiliale'], label: 'Bank', icon: '🏦', f: ['["amenity"="bank"]'] },
        { names: ['postfiliale', 'postamt', 'post', 'paketshop', 'paketannahme'], label: 'Post', icon: '📮', f: ['["amenity"="post_office"]', '["shop"="parcel_locker"]'] },
        { names: ['briefkasten'], label: 'Briefkasten', icon: '📮', f: ['["amenity"="post_box"]'] },
        { names: ['friseursalon', 'friseur', 'frisör', 'barbier', 'barbershop'], label: 'Friseur', icon: '💈', f: ['["shop"="hairdresser"]'] },
        { names: ['baumarkt', 'heimwerkermarkt', 'eisenwarenhandlung'], label: 'Baumarkt', icon: '🔨', f: ['["shop"~"^(doityourself|hardware)$"]'] },
        { names: ['blumenladen', 'blumengeschäft', 'florist', 'blumen'], label: 'Blumenladen', icon: '💐', f: ['["shop"="florist"]'] },
        { names: ['zahnarzt', 'zahnärztin', 'zahnarztpraxis'], label: 'Zahnarzt', icon: '🦷', f: ['["amenity"="dentist"]'] },
        { names: ['tierarzt', 'tierärztin', 'tierarztpraxis'], label: 'Tierarzt', icon: '🐾', f: ['["amenity"="veterinary"]'] },
        { names: ['krankenhaus', 'klinik'], label: 'Krankenhaus', icon: '🏥', f: ['["amenity"~"^(hospital|clinic)$"]'] },
        { names: ['hausarzt', 'arztpraxis', 'ärztin', 'arzt'], label: 'Arzt', icon: '🩺', f: ['["amenity"="doctors"]'] },
        { names: ['kino'], label: 'Kino', icon: '🎬', f: ['["amenity"="cinema"]'] },
        { names: ['theater'], label: 'Theater', icon: '🎭', f: ['["amenity"="theatre"]'] },
        { names: ['schwimmbad', 'freibad', 'hallenbad', 'badeanstalt'], label: 'Schwimmbad', icon: '🏊', f: ['["leisure"~"^(swimming_pool|water_park)$"]'] },
        { names: ['fitnessstudio', 'fitness studio', 'fitnesscenter'], label: 'Fitnessstudio', icon: '🏋️', f: ['["leisure"="fitness_centre"]'] },
        { names: ['spielplatz'], label: 'Spielplatz', icon: '🛝', f: ['["leisure"="playground"]'] },
        { names: ['autowaschanlage', 'waschanlage', 'autowäsche'], label: 'Waschanlage', icon: '🚿', f: ['["amenity"="car_wash"]'] },
        { names: ['reifenhändler', 'reifenservice', 'reifen'], label: 'Reifenhändler', icon: '🛞', f: ['["shop"="tyres"]'] },
        { names: ['fahrradladen', 'fahrradgeschäft', 'fahrradhändler'], label: 'Fahrradladen', icon: '🚲', f: ['["shop"="bicycle"]'] },
        { names: ['eisdiele', 'eiscafé', 'eisladen'], label: 'Eisdiele', icon: '🍦', f: ['["amenity"="ice_cream"]'] },
        { names: ['café', 'cafe', 'kaffeehaus'], label: 'Café', icon: '☕', f: ['["amenity"="cafe"]'] },
        { names: ['hotel'], label: 'Hotel', icon: '🏨', f: ['["tourism"="hotel"]'] },
        { names: ['toilette', 'toiletten', 'wc', 'klo'], label: 'Toilette', icon: '🚻', f: ['["amenity"="toilets"]'] },
        { names: ['ladestation', 'ladesäule', 'e-ladestation', 'elektro ladestation'], label: 'Ladestation', icon: '🔌', f: ['["amenity"="charging_station"]'] },
        { names: ['parkhaus'], label: 'Parkhaus', icon: '🅿️', f: ['["amenity"="parking"]["parking"="multi-storey"]'] },
        { names: ['parkplatz'], label: 'Parkplatz', icon: '🅿️', f: ['["amenity"="parking"]'] },
        { names: ['bahnhof'], label: 'Bahnhof', icon: '🚉', f: ['["railway"="station"]'] },
        { names: ['bushaltestelle', 'haltestelle'], label: 'Haltestelle', icon: '🚏', f: ['["highway"="bus_stop"]'] },
        { names: ['polizei', 'polizeiwache'], label: 'Polizei', icon: '🚓', f: ['["amenity"="police"]'] },
        { names: ['feuerwehr'], label: 'Feuerwehr', icon: '🚒', f: ['["amenity"="fire_station"]'] },
        { names: ['bibliothek', 'bücherei'], label: 'Bibliothek', icon: '📚', f: ['["amenity"="library"]'] },
        { names: ['rathaus'], label: 'Rathaus', icon: '🏛️', f: ['["amenity"="townhall"]'] },
        { names: ['elektrogeschäft', 'elektronikmarkt', 'elektromarkt'], label: 'Elektromarkt', icon: '📺', f: ['["shop"="electronics"]'] },
        { names: ['handyladen', 'handyshop'], label: 'Handyladen', icon: '📱', f: ['["shop"="mobile_phone"]'] },
        { names: ['schuhgeschäft', 'schuhladen'], label: 'Schuhgeschäft', icon: '👟', f: ['["shop"="shoes"]'] },
        { names: ['kleidungsgeschäft', 'kleiderladen', 'modegeschäft', 'bekleidungsgeschäft'], label: 'Bekleidungsgeschäft', icon: '👕', f: ['["shop"="clothes"]'] },
        { names: ['buchhandlung', 'buchladen'], label: 'Buchhandlung', icon: '📖', f: ['["shop"="books"]'] },
        { names: ['optiker', 'brillengeschäft'], label: 'Optiker', icon: '👓', f: ['["shop"="optician"]'] },
        { names: ['spielwarengeschäft', 'spielwarenladen'], label: 'Spielwarengeschäft', icon: '🧸', f: ['["shop"="toys"]'] },
        { names: ['zoohandlung', 'tierbedarf', 'tierhandlung'], label: 'Zoohandlung', icon: '🐶', f: ['["shop"="pet"]'] },
        { names: ['waschsalon'], label: 'Waschsalon', icon: '🧺', f: ['["shop"="laundry"]'] },
        { names: ['reinigung', 'textilreinigung'], label: 'Reinigung', icon: '👔', f: ['["shop"="dry_cleaning"]'] },
        { names: ['schlüsseldienst'], label: 'Schlüsseldienst', icon: '🔑', f: ['["shop"="locksmith"]', '["craft"="locksmith"]'] },
        { names: ['kiosk', 'späti', 'spätkauf'], label: 'Kiosk', icon: '🏪', f: ['["shop"="kiosk"]'] },
        { names: ['getränkemarkt', 'getränkehandel'], label: 'Getränkemarkt', icon: '🥤', f: ['["shop"="beverages"]'] },
        { names: ['möbelhaus', 'möbelgeschäft'], label: 'Möbelhaus', icon: '🛋️', f: ['["shop"="furniture"]'] },
        { names: ['schreibwarenladen', 'schreibwaren'], label: 'Schreibwaren', icon: '✏️', f: ['["shop"="stationery"]'] }
    ];

    /* Ketten und Marken: Suche über den Namen. rx = Suchmuster (ohne Beachtung der Groß-/Kleinschreibung) */
    const BRANDS = [
        ['penny', 'Penny', '🛒'], ['aldi', 'Aldi', '🛒'], ['lidl', 'Lidl', '🛒'], ['rewe', 'Rewe', '🛒'], ['edeka', 'Edeka', '🛒'], ['netto', 'Netto', '🛒'],
        ['kaufland', 'Kaufland', '🛒'], ['norma', 'Norma', '🛒'], ['famila', 'Famila', '🛒'], ['marktkauf', 'Marktkauf', '🛒'], ['nah und gut', 'nahkauf|nah und gut', '🛒'], ['nahkauf', 'nahkauf', '🛒'],
        ['rossmann', 'Rossmann', '🧴'], ['dm', '^dm([- ]|$)', '🧴'], ['müller', '^müller', '🧴'], ['budni', 'budni', '🧴'],
        ['mcdonalds', 'mc ?donald', '🍔'], ['mc donalds', 'mc ?donald', '🍔'], ['macdonalds', 'mc ?donald', '🍔'], ['mcdonald', 'mc ?donald', '🍔'], ['burger king', 'burger king', '🍔'], ['kfc', 'kfc|kentucky', '🍗'],
        ['subway', 'subway', '🥪'], ['starbucks', 'starbucks', '☕'], ['nordsee', 'nordsee', '🐟'], ['dunkin', 'dunkin', '🍩'], ['l osteria', 'osteria', '🍕'], ['pizza hut', 'pizza hut', '🍕'], ['dominos', 'domino', '🍕'],
        ['hornbach', 'hornbach', '🔨'], ['obi', '^obi([- ]|$)', '🔨'], ['bauhaus', 'bauhaus', '🔨'], ['toom', 'toom', '🔨'], ['hagebau', 'hagebau', '🔨'], ['ikea', 'ikea', '🛋️'], ['poco', '^poco', '🛋️'], ['roller', '^roller', '🛋️'],
        ['mediamarkt', 'media ?markt', '📺'], ['media markt', 'media ?markt', '📺'], ['saturn', 'saturn', '📺'], ['euronics', 'euronics', '📺'], ['expert', '^expert', '📺'],
        ['decathlon', 'decathlon', '⚽'], ['action', '^action', '🏷️'], ['tedi', '^tedi', '🏷️'], ['kik', '^kik', '👕'], ['woolworth', 'woolworth', '🏷️'], ['jysk', 'jysk', '🛏️'], ['tchibo', 'tchibo', '☕'],
        ['deichmann', 'deichmann', '👟'], ['h und m', 'h ?& ?m', '👕'], ['primark', 'primark', '👕'], ['fielmann', 'fielmann', '👓'], ['apollo', 'apollo', '👓'], ['douglas', 'douglas', '💄'],
        ['thalia', 'thalia', '📖'], ['fressnapf', 'fressnapf', '🐾'], ['maxi zoo', 'maxi ?zoo', '🐾'], ['hermes', 'hermes', '📦'], ['dhl', 'dhl', '📦'], ['ups', '^ups', '📦'],
        ['aral', 'aral', '⛽'], ['shell', 'shell', '⛽'], ['esso', 'esso', '⛽'], ['jet', '^jet', '⛽'], ['hem', '^hem', '⛽'], ['total', '^total', '⛽'], ['star', '^star', '⛽'],
        ['sparkasse', 'sparkasse', '🏦'], ['volksbank', 'volksbank|raiffeisen', '🏦'], ['commerzbank', 'commerzbank', '🏦'], ['deutsche bank', 'deutsche bank', '🏦'], ['postbank', 'postbank', '🏦'],
        ['takko', 'takko', '👕'], ['c und a', 'c ?& ?a', '👕'], ['ernstings', 'ernsting', '👕'], ['zeeman', 'zeeman', '👕'], ['pepco', 'pepco', '🏷️'], ['mäc geiz', 'mäc geiz', '🏷️'],
        ['hit', '^hit([- ]|$)', '🛒'], ['globus', 'globus', '🛒'], ['real', '^real([- ]|$)', '🛒'], ['bio company', 'bio company', '🛒'], ['denn s', 'denn.?s', '🛒'], ['alnatura', 'alnatura', '🛒']
    ].map(b => ({ names: [b[0]], rx: b[1], icon: b[2], brand: true }));
    // Beschriftung der Ketten: schöner Name (siehe LABELS), sonst der gesagte Name mit großem Anfangsbuchstaben
    const LABELS = { dm: 'dm', 'mc donalds': 'McDonald\'s', mcdonalds: 'McDonald\'s', macdonalds: 'McDonald\'s', mcdonald: 'McDonald\'s', 'burger king': 'Burger King', kfc: 'KFC', 'h und m': 'H&M', 'c und a': 'C&A', 'l osteria': 'L\'Osteria', obi: 'OBI', 'media markt': 'MediaMarkt', mediamarkt: 'MediaMarkt', ikea: 'IKEA', dhl: 'DHL', ups: 'UPS', 'nah und gut': 'Nah und Gut', 'denn s': 'denn\'s', 'maxi zoo': 'Maxi Zoo', 'pizza hut': 'Pizza Hut' };
    BRANDS.forEach(b => { const n = b.names[0]; b.label = LABELS[n] || n.replace(/\b\w/g, c => c.toUpperCase()); });

    const ALL = [];
    CATS.forEach(c => c.names.forEach(n => ALL.push({ name: n, entry: c, type: 'cat' })));
    BRANDS.forEach(b => b.names.forEach(n => ALL.push({ name: n, entry: b, type: 'brand' })));
    ALL.sort((a, b) => b.name.length - a.name.length);

    const ADJ = /\b(günstige[rnms]?|billige[rnms]?|gute[rnms]?|beste[rnms]?|kleine[rnms]?|große[rnms]?|offene[rnms]?|geöffnete[rnms]?|nächste[rnms]?|nächstgelegene[rnms]?|nahegelegene[rnms]?|naheliegende[rnms]?|richtige[rnms]?|normale[rnms]?|hier|bitte|mal|eigentlich)\b/g;
    const BLACK = /\b(was|wie|wer|wann|warum|wieso|welche\w*|wieviel\w*|kostet|kosten|preis\w*|sprit|diesel|benzin|e10|tank\w*|restaurant\w*|essen|hunger|pizza\w*|pizzeria\w*|imbiss\w*|kneipe\w*|gaststätte\w*|gasthaus|gasthof|lokal\w*|bistro|burger\w*|pub|bar|biergarten|döner\w*|termin\w*|feiertag\w*|zug|züge|bus|bahn|verbindung\w*|vollmond|neumond|urlaub\w*|ferien|geburtstag\w*|erinnerung\w*|aufgabe\w*|mail\w*|nachricht\w*|film\w*|stau|staus|auto|schlüssel|handy|brille|portemonnaie|iss|mond|sonne|wetter)\b/;
    const OWN = /\b(mein\w*|dein\w*|unser\w*|sein\w*|ihr\w*)\b/;

    function norm(text) {
        return String(text || '').toLowerCase().replace(/['’`´]/g, '').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function wordRe(name) { return new RegExp('(?:^|[^a-zäöüß])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+') + '(?![a-zäöüß])'); }

    /* Aus "wo ist der nächste penny" wird { what: 'penny', explicit: true, navigate: false } */
    function extract(t) {
        let m, navigate = false, explicit = false, what = null;
        const near = '(?:nächste[rnms]?|nächstgelegene[rnms]?|nahegelegene[rnms]?)';
        if ((m = t.match(new RegExp('^(?:navigier\\w*|bring|fahr|führ|führe|lotse|leite)\\w*\\s+mich\\s+(?:bitte\\s+)?(?:zum|zur|zu dem|zu der|zu einem|zu einer)\\s+' + near + '\\s+(.+)$')))
            || (m = t.match(new RegExp('^(?:weg|route|wegbeschreibung)\\s+(?:zum|zur|zu dem|zu der)\\s+' + near + '\\s+(.+)$')))
            || (m = t.match(new RegExp('^wie komme ich\\s+(?:am schnellsten\\s+)?(?:zum|zur|zu dem|zu der)\\s+' + near + '\\s+(.+)$')))) { what = m[1]; navigate = true; explicit = true; }
        else if ((m = t.match(new RegExp('^(?:wo|wohin)\\s+(?:ist|sind|liegt|liegen)\\s+(?:hier\\s+)?(?:der|die|das|ein|eine|einer|einen)?\\s*' + near + '\\s+(.+)$')))
            || (m = t.match(new RegExp('^(?:zeig|zeige)(?: mir)?\\s+(?:bitte\\s+)?(?:den|die|das)\\s+' + near + '\\s+(.+)$')))
            || (m = t.match(new RegExp('^(?:wo|wohin)\\s+(?:finde ich|gibt es|bekomme ich|kriege ich|kann ich)\\s+(?:hier\\s+)?(?:in der nähe\\s+)?(?:den|die|das|einen|eine|ein)?\\s*' + near + '\\s+(.+)$')))) { what = m[1]; explicit = true; }
        else if ((m = t.match(/^(?:wo|wohin)\s+(?:finde ich|gibt es|bekomme ich|kriege ich|ist|sind|liegt)\s+(?:hier\s+)?(?:in der nähe\s+)?(?:den|die|das|einen|eine|ein|einer)?\s*(.+)$/))
            || (m = t.match(/^(?:gibt es|ist|sind)\s+(?:hier|in der nähe|hier in der nähe|in meiner nähe)\s+(?:in der nähe\s+)?(?:den|die|das|einen|eine|ein|einer)?\s*(.+)$/))
            || (m = t.match(/^(?:zeig|zeige)(?: mir)?\s+(?:bitte\s+)?(.+?)\s+in der nähe$/))
            || (m = t.match(/^(.+?)\s+(?:in der nähe|in meiner nähe|hier in der nähe|in meiner umgebung|in der umgebung)$/))) { what = m[1]; }
        if (!what) return null;
        what = what.replace(/\s+(?:in der nähe|in meiner nähe|hier in der nähe|in meiner umgebung|in der umgebung|von hier|von mir aus|bitte|jetzt|gerade)\s*$/g, '').replace(ADJ, ' ').replace(/\s+/g, ' ').trim();
        if (!what || what.split(' ').length > 4 || OWN.test(what)) return null;
        if (/^(?:was|wie|wer|wann|warum|wieso|welche\w*|wieviel\w*|ob)\b/.test(what)) return null;
        return { what, explicit: explicit || /in der nähe|in meiner nähe|in der umgebung/.test(t), nearest: explicit, navigate };
    }

    /* Sucht den Eintrag (Art oder Kette), sonst bei ausdrücklichem "nächste ..." eine reine Namenssuche */
    function resolve(what, nearest) {
        for (const a of ALL) if (wordRe(a.name).test(what)) return { kind: a.type, entry: a.entry, query: what };
        if (nearest && !BLACK.test(what) && what.split(' ').length <= 3 && /^[a-zäöüß0-9&\- ]{3,}$/.test(what)) {
            const label = what.replace(/\b\w/g, c => c.toUpperCase());
            return { kind: 'brand', entry: { rx: esc(what).replace(/\s+/g, '\\s*'), label, icon: '📍', brand: true }, query: what, guessed: true };
        }
        return null;
    }

    /* ---------- Suche ---------- */
    function buildQuery(res, lat, lon, radius) {
        const around = `(around:${radius},${lat.toFixed(5)},${lon.toFixed(5)})`;
        let body;
        if (res.entry.brand) {
            const rx = res.entry.rx.replace(/"/g, '\\"');
            body = `nwr${around}["name"~"${rx}",i];nwr${around}["brand"~"${rx}",i];`;
        } else body = res.entry.f.map(f => `nwr${around}${f};`).join('');
        return `[out:json][timeout:25];(${body});out center 120;`;
    }

    function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }

    async function overpass(query) {
        // 1) über den Server der App (/api/overpass, wie die bisherige Orte-Suche in nearbymore.js)
        if (typeof apiFetch === 'function') {
            try {
                const res = await withTimeout(apiFetch('/api/overpass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }), 35000);
                if (res.ok) { const d = await res.json(); if (d && Array.isArray(d.elements)) return d.elements; }
            } catch (e) { /* dann direkt versuchen */ }
        }
        // 2) direkt bei den Kartenservern
        let lastErr = null;
        for (const url of ENDPOINTS) {
            try {
                const ctl = typeof AbortController === 'function' ? new AbortController() : null;
                const timer = setTimeout(() => { if (ctl) ctl.abort(); }, 22000);
                const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: ctl ? ctl.signal : undefined });
                clearTimeout(timer);
                if (!r.ok) { lastErr = new Error('Status ' + r.status); continue; }
                const d = await r.json();
                return d.elements || [];
            } catch (e) { lastErr = e; }
        }
        throw lastErr || new Error('keine Antwort');
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000, rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    function toPlaces(elements, res, lat, lon) {
        const out = [], seen = [];
        elements.forEach(el => {
            const tags = el.tags || {};
            const plat = el.lat !== undefined ? el.lat : el.center && el.center.lat, plon = el.lon !== undefined ? el.lon : el.center && el.center.lon;
            if (plat === undefined || plon === undefined) return;
            if (res.entry.brand && !(tags.shop || tags.amenity || tags.tourism || tags.leisure || tags.craft || tags.office)) return;   // z.B. Straßen oder Gebäude mit gleichem Namen
            const name = tags.name || tags.brand || tags.operator || '';
            const dist = haversine(lat, lon, plat, plon);
            if (seen.some(s => s.name === name && haversine(s.lat, s.lon, plat, plon) < 80)) return;   // Gebäude und Eingang desselben Ladens
            seen.push({ name, lat: plat, lon: plon });
            const street = tags['addr:street'] ? tags['addr:street'] + (tags['addr:housenumber'] ? ' ' + tags['addr:housenumber'] : '') : '';
            const city = tags['addr:city'] || tags['addr:suburb'] || tags['addr:village'] || '';
            out.push({ name: name || res.entry.label, lat: plat, lon: plon, dist, street, city, hours: tags.opening_hours || '', unnamed: !name });
        });
        return out.sort((a, b) => a.dist - b.dist).slice(0, 3);
    }

    /* ---------- Öffnungszeiten (einfache Fälle der OpenStreetMap-Schreibweise) ---------- */
    const DAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
    function parseDays(spec) {
        const set = new Set();
        spec.split(',').forEach(part => {
            const m = part.trim().match(/^(Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(Mo|Tu|We|Th|Fr|Sa|Su))?$/);
            if (!m) return;
            const a = DAYS.indexOf(m[1]), b = m[2] ? DAYS.indexOf(m[2]) : a;
            let i = a;
            for (let k = 0; k < 7; k++) { set.add(i); if (i === b) break; i = (i + 1) % 7; }
        });
        return set;
    }
    function mins(hhmm) { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; }

    /* Gibt { open: true|false, until: 'HH:MM' | null } zurück, oder null, wenn sich die Angabe nicht auswerten lässt */
    function openNow(str, now) {
        const s = String(str || '').trim();
        if (!s) return null;
        if (/^24\/7$/.test(s)) return { open: true, until: null };
        const state = {}; let any = false;
        s.split(';').forEach(rule => {
            rule = rule.trim();
            if (!rule || /\b(PH|SH)\b|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b|week|\[|\+/.test(rule)) return;   // Feiertage, Monate, Wochen: nicht auswertbar
            const m = rule.match(/^((?:(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:\s*-\s*(?:Mo|Tu|We|Th|Fr|Sa|Su))?\s*,?\s*)+)?\s*(off|closed|\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2}(?:\s*,\s*\d{1,2}:\d{2}\s*-\s*\d{1,2}:\d{2})*)$/);
            if (!m) return;
            const days = m[1] ? parseDays(m[1]) : new Set([0, 1, 2, 3, 4, 5, 6]);
            const val = /off|closed/.test(m[2]) ? 'off' : m[2].split(',').map(r => { const [a, b] = r.split('-').map(x => x.trim()); return [mins(a), mins(b)]; });
            days.forEach(d => { state[d] = val; });
            any = true;
        });
        if (!any) return null;
        const day = now.getDay(), cur = now.getHours() * 60 + now.getMinutes();
        const hhmm = (n) => `${String(Math.floor((n % 1440) / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;
        // Öffnung über Mitternacht von gestern
        const prev = state[(day + 6) % 7];
        if (Array.isArray(prev)) for (const [a, b] of prev) if (b <= a && cur < b) return { open: true, until: hhmm(b) };
        const today = state[day];
        if (Array.isArray(today)) {
            for (const [a, b] of today) {
                const end = b <= a ? b + 1440 : b;
                if (cur >= a && cur < end) return { open: true, until: hhmm(end) };
            }
        }
        return { open: false, until: null };
    }
    function hoursInfo(p) {
        if (!p.hours) return null;
        try {
            if (typeof osmOpenStatus === 'function') {   // genauere Auswertung aus nearbymore.js (Mitternacht, Pausen, rund um die Uhr)
                const st = osmOpenStatus(p.hours, new Date());
                return st && st.open !== null ? { open: st.open, until: st.until, opensAt: st.opensAt } : null;
            }
            const o = openNow(p.hours, new Date());
            return o ? { open: o.open, until: o.until, opensAt: null } : null;
        } catch (e) { return null; }
    }
    function hoursSpoken(o) {
        if (!o) return '';
        if (o.open) return o.until ? ` Geöffnet bis ${spokenTime(o.until)}.` : ' Durchgehend geöffnet.';
        return o.opensAt ? ` Laut Eintrag ist dort gerade geschlossen, geöffnet wird um ${spokenTime(o.opensAt)}.` : ' Laut Eintrag ist dort gerade geschlossen.';
    }
    function spokenTime(hhmm) { const [h, m] = String(hhmm).split(':').map(Number); return m ? `${h} Uhr ${String(m).padStart(2, '0')}` : `${h} Uhr`; }

    /* ---------- Antwort ---------- */
    function distSpoken(m) {
        if (m < 950) { const r = m < 100 ? Math.round(m / 10) * 10 : Math.round(m / 50) * 50; return `rund ${Math.max(10, r)} Meter`; }
        const km = m / 1000;
        return `${(Math.round(km * 10) / 10).toFixed(1).replace('.', ',')} Kilometer`;
    }
    function distShort(m) { return m < 950 ? `${Math.max(10, Math.round(m / 10) * 10)} m` : `${(Math.round(m / 100) / 10).toFixed(1).replace('.', ',')} km`; }
    function routeUrl(p) { return `https://www.google.com/maps/dir/?api=1&travelmode=${p.dist < 900 ? 'walking' : 'driving'}&destination=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`; }

    let lastPlaces = [];
    function openRoute(i) {
        const p = lastPlaces[Number(i) || 0];
        if (!p) { say('Ich habe gerade keinen Ort, zu dem ich die Route öffnen könnte.'); return false; }
        let w = null;
        try { w = window.open(routeUrl(p), '_blank'); } catch (e) { w = null; }
        return !!w;
    }

    function position() {
        return new Promise((ok, err) => {
            if (!navigator.geolocation) return err(new Error('keine Ortung'));
            navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), err, { enableHighAccuracy: true, timeout: 9000, maximumAge: 60000 });
        });
    }

    async function search(req) {
        const res = resolve(req.what, req.nearest);
        if (!res) return false;
        say(['Ich schaue nach.', 'Einen Moment, ich suche.', 'Ich sehe in der Umgebung nach.'][Math.floor(Math.random() * 3)]);
        let pos;
        try { pos = await position(); }
        catch (e) { say('Ohne Standort kann ich nichts in der Nähe suchen. Bitte erlauben Sie den Standort für die App.'); return true; }
        let places = [], usedRadius = 0;
        try {
            for (const radius of RADII) {
                usedRadius = radius;
                places = toPlaces(await overpass(buildQuery(res, pos.lat, pos.lon, radius)), res, pos.lat, pos.lon);
                if (places.length) break;
            }
        } catch (e) {
            console.error('Ortssuche fehlgeschlagen:', e && e.message);
            say('Die Ortssuche antwortet gerade nicht. Bitte versuchen Sie es in einer Minute noch einmal.');
            return true;
        }
        const label = res.entry.label;
        if (!places.length) {
            say(`Im Umkreis von ${usedRadius / 1000} Kilometern finde ich keinen Eintrag für ${label}. Die Kartendatenbank kennt eventuell nicht jedes Geschäft.`);
            return true;
        }
        lastPlaces = places;
        const first = places[0], o = hoursInfo(first);
        showCards(places.map((p, i) => {
            const oi = hoursInfo(p);
            const hours = oi ? (oi.open ? `geöffnet${oi.until ? ' bis ' + oi.until : ''}` : `laut Eintrag geschlossen${oi.opensAt ? ', öffnet ' + oi.opensAt : ''}`) : (p.hours ? p.hours.slice(0, 40) : 'Öffnungszeiten unbekannt');
            return { icon: res.entry.icon || '📍', title: `${p.name} · ${distShort(p.dist)}`, subtitle: `${[p.street, p.city].filter(Boolean).join(', ') || 'Adresse unbekannt'} · ${hours} · Tippen: Route`, href: routeUrl(p) };
        }));
        const addr = [first.street, first.city].filter(Boolean).join(', ');
        const more = places.length > 1 ? ` Weitere Treffer stehen unten.` : '';
        let alt = '';
        if (o && o.open === false) {
            const other = places.find(p => { const x = hoursInfo(p); return x && x.open === true; });
            if (other) { const x = hoursInfo(other); alt = ` Offen hat gerade ${other.name}, ${distSpoken(other.dist)} entfernt${x.until ? ', bis ' + spokenTime(x.until) : ''}.`; }
        }
        say(`Am nächsten ist ${first.name}${addr ? ', ' + addr : ''}, ${distSpoken(first.dist)} entfernt.${hoursSpoken(o)}${alt}${more} Tippen Sie unten auf eine Karte, dann öffnet sich die Route.`);
        if (req.navigate) openRoute(0);
        return true;
    }

    function handleOrtsucheCommand(text) {
        const t = norm(text);
        if (!t || t.length > 100) return false;
        const req = extract(t);
        if (!req) return false;
        if (!resolve(req.what, req.nearest)) return false;
        search(req).catch(e => { console.error('Ortssuche', e); say('Die Ortssuche hat gerade nicht geklappt.'); });
        return true;
    }

    window.handleOrtsucheCommand = handleOrtsucheCommand;
    window._ortsucheTest = { extract, resolve, openNow, buildQuery, toPlaces, norm };   // nur zum Testen
})();
