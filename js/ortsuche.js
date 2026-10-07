/* ============================================================
   ORTSSUCHE: "Wo ist der nächste Penny?", "Wo ist die nächste Werkstatt?", "Wo ist der nächste McDonald's?", "Wo finde ich einen Baumarkt?",
   "Zeig mir den nächsten Supermarkt", "Navigiere mich zum nächsten Rossmann", "Gibt es hier einen Bäcker?", "Tankstelle in der Nähe".
   Sucht Läden, Ketten und Einrichtungen rund um deinen Standort in der freien Kartendatenbank OpenStreetMap (Overpass-Dienst, kein Schlüssel nötig),
   nennt den nächsten mit Entfernung, Adresse und (falls hinterlegt) ob er gerade geöffnet hat, und zeigt bis zu drei Treffer als Karten.
   Ein Tipp auf eine Karte öffnet die Route (echter Link wie bei den Orten aus nearbymore.js; zu Fuß bei unter 900 Metern, sonst mit dem Auto). Bei "Navigiere mich zum nächsten ..." wird die Route
   zusätzlich selbst geöffnet, sofern der Browser das ohne Fingertipp erlaubt.
   Läuft NACH den bisherigen festen Befehlen (nearbymore.js usw.): Was dort schon klappt, bleibt, und alles, was dort nicht erkannt wird, landet hier,
   statt bei der KI und der Restaurantsuche. Bewusst NICHT hier: Tankstellen mit Spritpreisen, Restaurants, Pizza, Döner, Imbiss und Fragen wie
   "Was kostet Diesel in der Nähe?"; die bleiben bei der KI und den bisherigen Funktionen. Hängt sich selbst ein (siehe unten), braucht dafür nicht erweiterungen.js.
   MIT ORT: "Wo ist Penny in Schwarzenbek?" sucht im genannten Ort (nicht rund um dich), nennt die Adresse und fragt, ob sie als Kontakt
   ("Penny Schwarzenbek") gespeichert werden soll. Antwort per Sprache: "Ja" oder "Nein".
   Braucht: speak (voice.js), showActionCards/clearActionCards. Grenzen: OpenStreetMap kennt nicht jedes Geschäft, Öffnungszeiten sind nicht überall eingetragen.
   ============================================================ */
(function () {
    const ENDPOINTS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://overpass.private.coffee/api/interpreter'];
    const RADII = [3000, 10000, 20000];

    function say(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }
    /* Zwischenmeldung, solange gesucht wird: nur als Statuszeile, NICHT gesprochen. Eine gesprochene Zwischenansage (auch über speakAck) lässt die App
       danach wieder zuhören, bevor die Antwort da ist, und die Antwort geht unter. Die bisherige Orte-Suche (nearbymore.js) macht es genauso: erst still suchen, dann antworten. */
    function ack(msg) {
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus(msg); } catch (e) {}
    }
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
        { names: ['friseursalon', 'friseur', 'frisör', 'barbier', 'barbershop'], label: 'Friseur', icon: '💈', f: ['["shop"="hairdresser"]', '["shop"~"^(beauty|hairdresser_supply)$"]["name"~"friseur|frisör|haar|hair|coiffeur|barber",i]', '["name"~"friseur|frisör|haarstudio|haarwerk|hair|coiffeur|barber",i]["shop"]'] },
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
    /* Ketten werden NICHT über eine Namenssuche beim Kartenserver gefunden (die ist bei großen Gebieten sehr langsam und läuft oft in die Zeitüberschreitung),
       sondern: Der Server liefert alle Geschäfte der passenden Art im Umkreis (schnell, über das Merkmal), und der Name wird erst hier im Handy geprüft. */
    const GROUPS = {
        super: ['["shop"~"^(supermarket|convenience|discount|general|wholesale|variety_store)$"]'],
        drug: ['["shop"~"^(chemist|beauty|variety_store|department_store|cosmetics)$"]'],
        food: ['["amenity"~"^(fast_food|restaurant|cafe|ice_cream|food_court)$"]'],
        diy: ['["shop"~"^(doityourself|hardware|garden_centre|trade|building_materials)$"]'],
        furn: ['["shop"~"^(furniture|doityourself|houseware|department_store|interior_decoration|variety_store)$"]'],
        elec: ['["shop"~"^(electronics|computer|mobile_phone|hifi)$"]'],
        fuel: ['["amenity"="fuel"]'],
        bank: ['["amenity"~"^(bank|atm)$"]'],
        post: ['["amenity"~"^(post_office|parcel_locker)$"]', '["shop"~"^(kiosk|convenience|copyshop|newsagent|stationery|tobacco)$"]']
    };
    const GENERIC = ['["shop"]', '["amenity"~"^(restaurant|fast_food|cafe|bank|fuel|pharmacy|pub|bar|cinema|doctors|dentist|post_office|car_wash)$"]'];
    const BRAND_GROUP = {
        super: ['penny', 'aldi', 'lidl', 'rewe', 'edeka', 'netto', 'kaufland', 'norma', 'famila', 'marktkauf', 'nah und gut', 'nahkauf', 'hit', 'globus', 'real', 'bio company', 'denn s', 'alnatura'],
        drug: ['rossmann', 'dm', 'müller', 'budni'],
        food: ['mcdonalds', 'mc donalds', 'macdonalds', 'mcdonald', 'burger king', 'kfc', 'subway', 'starbucks', 'nordsee', 'dunkin', 'l osteria', 'pizza hut', 'dominos'],
        diy: ['hornbach', 'obi', 'bauhaus', 'toom', 'hagebau'],
        furn: ['ikea', 'poco', 'roller'],
        elec: ['mediamarkt', 'media markt', 'saturn', 'euronics', 'expert'],
        fuel: ['aral', 'shell', 'esso', 'jet', 'hem', 'total', 'star'],
        bank: ['sparkasse', 'volksbank', 'commerzbank', 'deutsche bank', 'postbank'],
        post: ['hermes', 'dhl', 'ups']
    };
    BRANDS.forEach(b => {
        const n = b.names[0];
        b.f = GENERIC;
        b.generic = true;
        for (const g of Object.keys(BRAND_GROUP)) {
            if (BRAND_GROUP[g].indexOf(n) !== -1) { b.f = GROUPS[g]; b.generic = false; break; }
        }
    });
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
        // "penny in schwarzenbek": Ort hinter dem Laden abtrennen (nicht bei "in der nähe", "in meiner umgebung" usw.)
        let place = '';
        const pm = what.match(/^(.+?)\s+in\s+(?!(?:der|dem|den|die|das|meiner|meinem|diesem|dieser|einem|einer|nähe|umgebung)\b)([a-zäöüß][a-zäöüß.\-]*(?:\s+[a-zäöüß][a-zäöüß.\-]*){0,2})$/);
        if (pm) { what = pm[1].trim(); place = pm[2].trim(); }
        if (!what || what.split(' ').length > 4 || OWN.test(what)) return null;
        if (/^(?:was|wie|wer|wann|warum|wieso|welche\w*|wieviel\w*|ob)\b/.test(what)) return null;
        return { what, place, explicit: explicit || /in der nähe|in meiner nähe|in der umgebung/.test(t), nearest: explicit, navigate };
    }

    /* Sucht den Eintrag (Art oder Kette), sonst bei ausdrücklichem "nächste ..." eine reine Namenssuche */
    function resolve(what, nearest) {
        for (const a of ALL) if (wordRe(a.name).test(what)) return { kind: a.type, entry: a.entry, query: what };
        if (nearest && !BLACK.test(what) && what.split(' ').length <= 3 && /^[a-zäöüß0-9&\- ]{3,}$/.test(what)) {
            const label = what.replace(/\b\w/g, c => c.toUpperCase());
            return { kind: 'brand', entry: { rx: esc(what).replace(/\s+/g, '\\s*'), label, icon: '📍', brand: true, f: GENERIC, generic: true }, query: what, guessed: true };
        }
        return null;
    }

    /* ---------- Suche ---------- */
    function buildQuery(res, lat, lon, radius) {
        const around = `(around:${radius},${lat.toFixed(5)},${lon.toFixed(5)})`;
        const body = res.entry.f.map(f => `nwr${around}${f};`).join('');
        return `[out:json][timeout:20];(${body});out center ${res.entry.brand ? 900 : 60};`;
    }

    function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }

    /* Fragt den Server der App (/api/overpass, wie die bisherige Orte-Suche in nearbymore.js) UND die öffentlichen Kartenserver gleichzeitig.
       Die erste brauchbare Antwort gewinnt, die anderen Anfragen werden abgebrochen. Das ist wichtig, weil die Kartenserver oft ausgelastet sind
       und der Server der App bei Vercel nach etwa 10 Sekunden aufgibt. Schlägt alles fehl, steht in der Fehlermeldung, woran es bei jedem lag. */
    function raceOverpass(query, useAppServer, maxMs) {
        return new Promise((resolve, reject) => {
            const errors = [], controllers = [];
            let pending = 0, done = false;
            const fail = (who, e) => {
                errors.push(`${who}: ${String((e && e.message) || e).replace(/signal is aborted without reason/i, 'Zeitüberschreitung').slice(0, 60)}`);
                if (--pending === 0 && !done) reject(new Error(errors.join(' · ')));
            };
            const win = (elements) => {
                if (done) return;
                done = true;
                controllers.forEach(c => { try { c.abort(); } catch (e) {} });
                resolve(elements);
            };
            if (useAppServer && typeof apiFetch === 'function') {
                pending++;
                withTimeout(apiFetch('/api/overpass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }), maxMs || 28000)
                    .then(async res => { if (!res.ok) throw new Error('Status ' + res.status); const d = await res.json(); if (!d || !Array.isArray(d.elements)) throw new Error('keine Daten'); win(d.elements); })
                    .catch(e => fail('App-Server', e));
            }
            ENDPOINTS.forEach(url => {
                pending++;
                const ctl = typeof AbortController === 'function' ? new AbortController() : null;
                if (ctl) controllers.push(ctl);
                const timer = setTimeout(() => { if (ctl) ctl.abort(); }, maxMs || 25000);
                fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: 'data=' + encodeURIComponent(query), signal: ctl ? ctl.signal : undefined })
                    .then(async r => { clearTimeout(timer); if (!r.ok) throw new Error('Status ' + r.status); const d = await r.json(); if (!d || !Array.isArray(d.elements)) throw new Error('keine Daten'); win(d.elements); })
                    .catch(e => { clearTimeout(timer); if (!done) fail(url.replace(/^https:\/\//, '').split('/')[0], e); else if (--pending === 0 && !done) reject(new Error(errors.join(' · '))); });
            });
            if (pending === 0) reject(new Error('keine Verbindung möglich'));
        });
    }

    function overpass(query) { return raceOverpass(query, true); }
    function directOverpass(query) { return raceOverpass(query, false); }

    /* Rückfall: Die Suche von OpenStreetMap (Nominatim, wie bei der Ortsangabe) liefert Name und Adresse, wenn die Overpass-Server nicht antworten.
       Sie hat meist keine Öffnungszeiten, kennt aber die gängigen Ketten und Straße/Hausnummer. */
    /* Mehrere Suchwörter gleichzeitig (z.B. Friseur, Haarstudio, Friseursalon), Ergebnisse zusammengeführt: Nominatim findet nur, was zum Suchwort passt. */
    const NOMI_TERMS = { 'Friseur': ['Friseur', 'Haarstudio', 'Friseursalon', 'Hairstyling'] };
    async function nominatimElements(res, lat, lon, radius) {
        const dLat = radius / 111000, dLon = radius / (111000 * Math.max(0.2, Math.cos(lat * Math.PI / 180)));
        const view = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map(n => n.toFixed(5)).join(',');
        const term = res.entry.brand && res.entry.generic ? (res.query || res.entry.label) : res.entry.label;
        const terms = (res.entry.brand && res.entry.generic) ? [term] : (NOMI_TERMS[term] || [term]);
        const one = async (t) => {
            const url = 'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=30&addressdetails=1&extratags=1&accept-language=de&bounded=1&viewbox=' + view + '&q=' + encodeURIComponent(t);
            const r = await withTimeout(fetch(url), 12000);
            if (!r.ok) throw new Error('Nominatim Status ' + r.status);
            const d = await r.json();
            if (!Array.isArray(d)) throw new Error('Nominatim: keine Daten');
            return d;
        };
        const settled = await Promise.allSettled(terms.map(one));
        const ok = settled.filter(x => x.status === 'fulfilled');
        if (!ok.length) throw settled[0].reason || new Error('Nominatim: keine Antwort');
        const seen = new Set(), all = [];
        ok.forEach(x => x.value.forEach(i => { const k = String(i.osm_type) + i.osm_id; if (!seen.has(k)) { seen.add(k); all.push(i); } }));
        return all.map(x => {
            const a = x.address || {}, ex = x.extratags || {};
            const tags = { name: x.name || a[x.type] || '', 'addr:street': a.road || a.pedestrian || '', 'addr:housenumber': a.house_number || '', 'addr:city': a.city || a.town || a.village || a.municipality || '', 'addr:postcode': a.postcode || '' };
            if (ex.opening_hours) tags.opening_hours = ex.opening_hours;
            if (ex.brand) tags.brand = ex.brand;
            return { lat: parseFloat(x.lat), lon: parseFloat(x.lon), tags };
        }).filter(e => isFinite(e.lat) && isFinite(e.lon));
    }

    /* Erst Overpass (bei schnellem Fehler ein zweiter Versuch), bei Ausfall der Rückfall über Nominatim. Nach einem Ausfall wird Overpass eine Minute lang übersprungen. */
    let overpassDownUntil = 0;
    async function getElements(res, lat, lon, radius) {
        if (Date.now() > overpassDownUntil) {
            for (let attempt = 0; attempt < 2; attempt++) {
                const t0 = Date.now();
                try { return await overpass(buildQuery(res, lat, lon, radius)); }
                catch (e) {
                    console.error('Overpass fehlgeschlagen:', e && e.message);
                    if (Date.now() - t0 > 10000) break;   // war langsam: kein zweiter Versuch
                }
            }
            overpassDownUntil = Date.now() + 60000;
        }
        try { return await nominatimElements(res, lat, lon, radius); }
        catch (e2) { throw new Error('Overpass und Nominatim: ' + String((e2 && e2.message) || e2).slice(0, 80)); }
    }

    function haversine(lat1, lon1, lat2, lon2) {
        const R = 6371000, rad = Math.PI / 180, dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(a));
    }

    function toPlaces(elements, res, lat, lon) {
        const out = [], seen = [];
        let brandRe = null;
        if (res.entry.brand) { try { brandRe = new RegExp(res.entry.rx, 'i'); } catch (e) { brandRe = null; } }
        elements.forEach(el => {
            const tags = el.tags || {};
            const plat = el.lat !== undefined ? el.lat : el.center && el.center.lat, plon = el.lon !== undefined ? el.lon : el.center && el.center.lon;
            if (plat === undefined || plon === undefined) return;
            if (brandRe) { const fields = [tags.name, tags.brand, tags.operator].filter(Boolean); if (!fields.some(f => brandRe.test(f))) return; }   // Kette: Name im Handy prüfen
            const name = tags.name || tags.brand || tags.operator || '';
            const dist = haversine(lat, lon, plat, plon);
            if (seen.some(s => s.name === name && haversine(s.lat, s.lon, plat, plon) < 80)) return;   // Gebäude und Eingang desselben Ladens
            seen.push({ name, lat: plat, lon: plon });
            const street = tags['addr:street'] ? tags['addr:street'] + (tags['addr:housenumber'] ? ' ' + tags['addr:housenumber'] : '') : '';
            const city = tags['addr:city'] || tags['addr:suburb'] || tags['addr:village'] || '';
            out.push({ name: name || res.entry.label, lat: plat, lon: plon, dist, street, city, postcode: tags['addr:postcode'] || '', hours: tags.opening_hours || '', unnamed: !name });
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
    function routeUrl(p) { return `https://www.google.com/maps/dir/?api=1&travelmode=${(!p.fromPlace && p.dist < 900) ? 'walking' : 'driving'}&destination=${p.lat.toFixed(6)},${p.lon.toFixed(6)}`; }

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
            navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), err, { timeout: 8000, maximumAge: 120000 });
        });
    }

    /* ---------- Suche in einem genannten Ort ("Wo ist Penny in Schwarzenbek?") ---------- */
    const capWords = (s) => String(s || '').replace(/(^|[\s-])([a-zäöüß])/g, (m, a, b) => a + b.toUpperCase());

    /* Ort in Koordinaten umwandeln (Nominatim, wie in briefing.js); erst in Deutschland, dann überall */
    async function geocode(place) {
        const base = 'https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&accept-language=de&q=' + encodeURIComponent(place);
        for (const extra of ['&countrycodes=de', '']) {
            const r = await withTimeout(fetch(base + extra), 9000);
            if (!r.ok) continue;
            const d = await r.json();
            if (Array.isArray(d) && d.length) {
                const a = d[0].address || {};
                return { lat: parseFloat(d[0].lat), lon: parseFloat(d[0].lon), name: a.city || a.town || a.village || a.municipality || capWords(place) };
            }
        }
        return null;
    }

    /* Vollständige Adresse: aus den Kartendaten, sonst per Rückwärtssuche; sonst Name und Ort */
    async function fullAddress(p, placeName) {
        let street = p.street, postcode = p.postcode, city = p.city || placeName;
        if (!street) {
            try {
                const r = await withTimeout(fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${p.lat}&lon=${p.lon}&zoom=18&addressdetails=1&accept-language=de`), 9000);
                const a = (await r.json()).address || {};
                if (a.road) { street = a.road + (a.house_number ? ' ' + a.house_number : ''); postcode = postcode || a.postcode || ''; city = a.city || a.town || a.village || city; }
            } catch (e) {}
        }
        const line2 = [postcode, city].filter(Boolean).join(' ');
        const address = street ? [street, line2].filter(Boolean).join(', ') : `${p.name}, ${placeName}`;
        return { street, city, address, exact: !!street };
    }

    /* Wartet auf "Ja" oder "Nein" zum Speichern in den Kontakten */
    let pendingSave = null;
    const YES_RE = /^(?:ja|jawohl|jep|jo|klar|gern|gerne|ja gern|ja gerne|ja bitte|bitte|bitte speichern|speicher(?:e)?(?: sie| es| das| ihn)?|ja speicher(?:e)?(?: sie| es| das)?|mach das|okay|ok|natürlich|unbedingt|ja natürlich)$/;
    const NO_RE = /^(?:nein|nö|nee|nein danke|danke nein|lieber nicht|nicht nötig|lass (?:es|das)|lass gut sein|nicht speichern|kein bedarf|nein bitte nicht)$/;

    function saveContactFromPlace(c) {
        const key = c.name.toLowerCase();
        const existing = (typeof savedContacts === 'object' && savedContacts[key]) || {};
        savedContacts[key] = { originalName: c.name, phone: existing.phone || '', address: c.address };
        setPersistentData('helfer_contacts', JSON.stringify(savedContacts));
        if (typeof renderContactList === 'function') renderContactList();
    }

    const ORD = [/\b(?:erste[nrms]?|1|eins|ersten)\b/, /\b(?:zweite[nrms]?|2|zwei)\b/, /\b(?:dritte[nrms]?|3|drei)\b/];
    const ORD_NAME = ['den ersten', 'den zweiten', 'den dritten'];
    function handlePendingSave(text) {
        if (!pendingSave) return false;
        const p = pendingSave;
        if (Date.now() - p.at > 3 * 60000) { pendingSave = null; return false; }
        const t = norm(text).replace(/^jarvis\s+|\s+jarvis$/g, '');
        const choices = p.choices || [{ name: p.name, address: p.address }];
        const saveOne = (c) => { saveContactFromPlace(c); };
        if (NO_RE.test(t) || /^(?:keinen?|keine|keins|lieber keinen?|keinen von beiden)$/.test(t)) { pendingSave = null; say('In Ordnung, ich lasse es.'); return true; }
        if (choices.length > 1) {
            if (/\b(?:beide|beiden|alle)\b/.test(t)) {
                pendingSave = null;
                try { choices.forEach(saveOne); say(`Erledigt. ${choices.map(c => c.name).join(' und ')} stehen jetzt in Ihren Kontakten.`); }
                catch (e) { say('Das Speichern in den Kontakten hat leider nicht geklappt.'); }
                return true;
            }
            const idx = ORD.findIndex((rx, i) => i < choices.length && rx.test(t));
            if (idx >= 0) {
                pendingSave = null;
                try { saveOne(choices[idx]); say(`Erledigt. ${choices[idx].name} steht jetzt in Ihren Kontakten.`); }
                catch (e) { say('Das Speichern in den Kontakten hat leider nicht geklappt.'); }
                return true;
            }
            if (YES_RE.test(t)) {   // "Ja" allein ist bei mehreren Treffern nicht eindeutig: nachfragen, Frage bleibt offen
                p.at = Date.now();
                say(`Welchen soll ich speichern: ${choices.map((c, i) => ORD_NAME[i]).join(', ').replace(/, ([^,]*)$/, ' oder $1')}?`);
                return true;
            }
            pendingSave = null;
            return false;   // etwas anderes gesagt: Frage verfällt
        }
        pendingSave = null;
        if (YES_RE.test(t)) {
            try { saveOne(choices[0]); say(`Erledigt. ${choices[0].name} steht jetzt in Ihren Kontakten.`); }
            catch (e) { say('Das Speichern in den Kontakten hat leider nicht geklappt.'); }
            return true;
        }
        return false;   // etwas anderes gesagt: Frage verfällt, der Satz läuft normal weiter
    }

    async function searchInPlace(req, res) {
        const label = res.entry.label;
        const placeShown = capWords(req.place);
        ack(`Suche ${label} in ${placeShown} ...`);
        showCards([{ icon: '🔎', title: `Suche ${label} in ${placeShown} ...`, subtitle: 'Ort und Kartendaten werden abgefragt' }]);
        let geo = null;
        try { geo = await geocode(req.place); } catch (e) { geo = null; }
        if (!geo) {
            showCards([{ icon: '⚠️', title: `Ort „${placeShown}" nicht gefunden`, subtitle: 'Die Ortssuche kennt diesen Ort nicht' }]);
            say(`Den Ort ${placeShown} finde ich leider nicht.`);
            return true;
        }
        let places = [], usedRadius = 0;
        try {
            for (const radius of (res.entry.brand && res.entry.generic ? [3000, 8000] : RADII)) {
                usedRadius = radius;
                places = toPlaces(await getElements(res, geo.lat, geo.lon, radius), res, geo.lat, geo.lon);
                if (places.length) break;
            }
        } catch (e) {
            console.error('Ortssuche fehlgeschlagen:', e && e.message);
            showCards([{ icon: '⚠️', title: 'Ortssuche: Kartendaten nicht erreichbar', subtitle: String((e && e.message) || 'unbekannter Fehler').slice(0, 160) }]);
            say('Die Ortssuche antwortet gerade nicht. Bitte versuchen Sie es in einer Minute noch einmal.');
            return true;
        }
        if (!places.length) {
            showCards([{ icon: '🔎', title: `Kein Treffer für ${label} in ${geo.name}`, subtitle: `Im Umkreis von ${usedRadius / 1000} km nichts in den Kartendaten` }]);
            say(`In ${geo.name} finde ich keinen Eintrag für ${label}. Die Kartendatenbank kennt eventuell nicht jedes Geschäft.`);
            return true;
        }
        places.forEach(p => { p.fromPlace = true; });
        lastPlaces = places;
        const first = places[0];
        const info = await fullAddress(first, geo.name);
        showCards(places.map((p, i) => {
            const oi = hoursInfo(p);
            const hours = oi ? (oi.open ? `geöffnet${oi.until ? ' bis ' + oi.until : ''}` : `laut Eintrag geschlossen${oi.opensAt ? ', öffnet ' + oi.opensAt : ''}`) : (p.hours ? p.hours.slice(0, 40) : 'Öffnungszeiten unbekannt');
            const addr = i === 0 ? info.address : ([p.street, p.city].filter(Boolean).join(', ') || 'Adresse unbekannt');
            return { icon: res.entry.icon || '📍', title: p.name, subtitle: `${addr} · ${hours} · Tippen: Route`, href: routeUrl(p) };
        }));
        const spokenAddr = info.exact ? [info.street, info.city].filter(Boolean).join(', ') : '';
        const many = places.length > 1 ? ' Es gibt dort mehrere Treffer; ich nenne den, der der Ortsmitte am nächsten liegt, die anderen stehen unten.' : '';
        const o = hoursInfo(first);
        const contactName = `${label} ${geo.name}`;
        pendingSave = { name: contactName, address: info.address, at: Date.now() };
        say(`${first.name} in ${geo.name}: ${spokenAddr || 'eine genaue Straße steht nicht in den Kartendaten'}.${hoursSpoken(o)}${many} Soll ich die Adresse als ${contactName} in Ihren Kontakten speichern?`);
        return true;
    }

    async function search(req) {
        const res = resolve(req.what, req.nearest);
        if (!res) return false;
        if (req.place) return searchInPlace(req, res);
        const label = res.entry.label;
        ack(`Suche ${label} ...`);
        showCards([{ icon: '🔎', title: `Suche ${label} ...`, subtitle: 'Standort und Kartendaten werden abgefragt' }]);
        let pos;
        try { pos = await position(); }
        catch (e) {
            showCards([{ icon: '⚠️', title: 'Ortssuche: kein Standort', subtitle: String((e && e.message) || 'Standort nicht erlaubt oder nicht verfügbar').slice(0, 120) }]);
            say('Ohne Standort kann ich nichts in der Nähe suchen. Bitte erlauben Sie den Standort für die App.');
            return true;
        }
        let places = [], usedRadius = 0;
        try {
            for (const radius of (res.entry.brand && res.entry.generic ? [3000, 8000] : RADII)) {
                usedRadius = radius;
                places = toPlaces(await getElements(res, pos.lat, pos.lon, radius), res, pos.lat, pos.lon);
                if (places.length) break;
            }
        } catch (e) {
            console.error('Ortssuche fehlgeschlagen:', e && e.message);
            showCards([{ icon: '⚠️', title: 'Ortssuche: Kartendaten nicht erreichbar', subtitle: String((e && e.message) || 'unbekannter Fehler').slice(0, 160) }]);
            say('Die Ortssuche antwortet gerade nicht. Bitte versuchen Sie es in einer Minute noch einmal.');
            return true;
        }
        if (!places.length) {
            showCards([{ icon: '🔎', title: `Kein Treffer für ${label}`, subtitle: `Im Umkreis von ${usedRadius / 1000} km nichts in den Kartendaten` }]);
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
        // Adressen der Treffer vervollständigen (fehlt die Straße, per Rückwärtssuche) und anbieten, sie in den Kontakten zu speichern; bei mehreren Treffern darf man wählen
        let ask = '', listing = '';
        if (!req.navigate) {
            try {
                const cands = [];
                for (const p of places.slice(0, 3)) {
                    let info = null;
                    try { info = await fullAddress(p, ''); } catch (e) { info = null; }
                    if (info && info.exact) cands.push({ p, info });
                }
                if (cands.length) {
                    const cities = cands.map(c => c.info.city || '');
                    const distinctCities = cities.every(c => c) && new Set(cities.map(c => c.toLowerCase())).size === cities.length;
                    const choices = cands.map(c => ({
                        name: [res.entry.label, distinctCities || cands.length === 1 ? c.info.city : String(c.info.street || '').replace(/\s+\d+\s*\w?$/, '')].filter(Boolean).join(' '),
                        address: c.info.address
                    }));
                    pendingSave = { choices, at: Date.now() };
                    if (choices.length === 1) ask = ` Soll ich die Adresse als ${choices[0].name} in Ihren Kontakten speichern?`;
                    else {
                        listing = cands.slice(1).map((c, i) => ` ${i === 0 ? 'Der zweite' : 'Der dritte'} ist ${[c.info.street, c.info.city].filter(Boolean).join(', ')}, ${distSpoken(c.p.dist)} entfernt.`).join('');
                        ask = ` Welchen soll ich in Ihren Kontakten speichern: ${choices.map((c, i) => ORD_NAME[i]).join(', ').replace(/, ([^,]*)$/, ' oder $1')}? Oder keinen.`;
                    }
                }
            } catch (e) { ask = ''; listing = ''; }
        }
        say(`Am nächsten ist ${first.name}${addr ? ', ' + addr : ''}, ${distSpoken(first.dist)} entfernt.${hoursSpoken(o)}${alt}${listing || more}${ask || ' Tippen Sie unten auf eine Karte, dann öffnet sich die Route.'}`);
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

    /* Für die alte Orte-Suche (nearbymore.js): Adressen der ersten Treffer vervollständigen, Rückfrage "in den Kontakten speichern?" vorbereiten.
       list: [{ name, street, lat, lon, dist }], liefert { ask, listing } oder null. Die Antwort (Ja / den ersten ...) übernimmt handlePendingSave. */
    window.jvOfferSave = async function (label, list) {
        try {
            const cands = [];
            for (const q of (list || []).slice(0, 3)) {
                let info = null;
                try { info = await fullAddress({ name: q.name || label, lat: q.lat, lon: q.lon, street: '' }, ''); } catch (e) { info = null; }
                if (!(info && info.exact) && q.street) info = { street: q.street, city: '', address: q.street, exact: true };
                if (info && info.exact) cands.push({ q, info });
            }
            if (!cands.length) return null;
            const cities = cands.map(c => c.info.city || '');
            const distinctCities = cities.every(c => c) && new Set(cities.map(c => c.toLowerCase())).size === cities.length;
            const choices = cands.map((c, i) => ({
                name: [label, (distinctCities || cands.length === 1) ? c.info.city : String(c.info.street || '').replace(/\s+\d+\s*\w?$/, '')].filter(Boolean).join(' '),
                address: c.info.address
            }));
            pendingSave = { choices, at: Date.now() };
            if (choices.length === 1) return { listing: '', ask: ` Soll ich die Adresse als ${choices[0].name} in Ihren Kontakten speichern?` };
            const listing = cands.slice(1).map((c, i) => ` ${i === 0 ? 'Der zweite' : 'Der dritte'} ist ${[c.info.street, c.info.city].filter(Boolean).join(', ')}, ${distSpoken(c.q.dist)} entfernt.`).join('');
            const ask = ` Welchen soll ich in Ihren Kontakten speichern: ${choices.map((c, i) => ORD_NAME[i]).join(', ').replace(/, ([^,]*)$/, ' oder $1')}? Oder keinen.`;
            return { listing, ask };
        } catch (e) { return null; }
    };

    /* ---------- Einhängen ---------- */
    /* Reserve für die bisherige Orte-Suche (nearbymore.js): Antwortet der Server der App nicht, wird direkt bei den Kartenservern nachgefragt.
       nearbymore.js wird nach dieser Datei geladen, deshalb wird das erst beim ersten Sprachbefehl eingehängt. */
    let oldFetchPatched = false;
    function patchOldPlacesFetch() {
        if (oldFetchPatched || typeof window.plFetchElements !== 'function') return;
        oldFetchPatched = true;
        window.plFetchElements = async function (query) {
            const q = String(query || '');
            try { const el = await raceOverpass(q, true, 20000); window.__jvPlSrc = ''; return el; }   // App-Server und Kartenserver gleichzeitig, höchstens 20 Sekunden
            catch (e2) {
                window.__jvPlSrc = 'Ausweichsuche, Kartenserver: ' + String((e2 && e2.message) || e2).slice(0, 150);
                // niemand antwortet: Rückfall über Nominatim (ohne Öffnungszeiten), Art und Umkreis stehen in der Anfrage
                const m = q.match(/around:(\d+),(-?[\d.]+),(-?[\d.]+)/);
                let cat = null;
                try { cat = (typeof PLACE_CATEGORIES !== 'undefined') ? PLACE_CATEGORIES.find(c => c.sel.some(sl => q.indexOf(sl) >= 0)) : null; } catch (e3) {}
                if (!m || !cat) throw e2;
                return await nominatimElements({ entry: { label: cat.label } }, parseFloat(m[2]), parseFloat(m[3]), parseInt(m[1], 10));
            }
        };
    }

    /* Die Ortssuche hängt sich selbst hinter die bisherigen festen Befehle (localcommands.js, nearbymore.js ...) und vor die KI.
       Was dort erkannt wird, bleibt dort; alles andere (Penny, Edeka, McDonald's ...) landet hier. */
    if (typeof window.handleLocalCommand === 'function' && !window.handleLocalCommand._ortsuche) {
        const originalLocal = window.handleLocalCommand;
        const hooked = function (text) {
            try { patchOldPlacesFetch(); } catch (e) {}
            try { installAskWrapper(); } catch (e) {}
            try { if (pendingSave && handlePendingSave(text)) return true; } catch (e) { pendingSave = null; }   // Ja/Nein zum Speichern in den Kontakten
            const handled = originalLocal.apply(this, arguments);
            if (handled) return handled;
            try { if (handleOrtsucheCommand(text)) return true; } catch (e) { console.error('Ortssuche', e); }
            return handled;
        };
        hooked._ortsuche = true;
        window.handleLocalCommand = hooked;
    }

    /* Mehrere Wünsche in einem Satz ("Ist ein Friseur in der Nähe und wie wird das Wetter morgen"): Der Ortswunsch wird herausgelöst und
       von den Orte-Suchen erledigt, der Rest geht wie gewohnt an die KI. Die Ortssuche läuft danach, wenn Jarvis fertig gesprochen hat. */
    function placeKind(part) {
        try { if (typeof window.parsePlacesRequest === 'function' ? window.parsePlacesRequest(part) : (typeof parsePlacesRequest === 'function' && parsePlacesRequest(part))) return 'old'; } catch (e) {}
        try { const r = extract(norm(part)); if (r && resolve(r.what, r.nearest)) return 'new'; } catch (e) {}
        return '';
    }
    function splitPlaceWish(text) {
        const parts = String(text || '').split(/\s+(?:und dann|und auch|und|sowie|außerdem|danach|dann)\s+|\s*,\s*/i).map(x => x.trim()).filter(Boolean);
        if (parts.length < 2) return null;
        let idx = -1, kind = '';
        for (let i = 0; i < parts.length && idx < 0; i++) { const k = placeKind(parts[i]); if (k) { idx = i; kind = k; } }
        if (idx < 0) return null;
        const rest = parts.filter((_, i) => i !== idx).join(' und ');
        if (!rest) return null;
        return { part: parts[idx], rest, kind };
    }
    async function runPlaceWish(sp) {
        for (let i = 0; i < 120 && typeof isSpeaking === 'function' && isSpeaking(); i++) await new Promise(r => setTimeout(r, 500));   // bis zu 60 s warten
        try {
            if (sp.kind === 'old' && typeof window.handlePlacesCommand === 'function') { if (window.handlePlacesCommand(sp.part)) return; }
            handleOrtsucheCommand(sp.part);
        } catch (e) { console.error('Ortssuche (Teilsatz)', e); }
    }
    function installAskWrapper() {
        if (typeof window.sendToGroqSmart !== 'function' || window.sendToGroqSmart._ortsuche) return;
        const originalAsk = window.sendToGroqSmart;
        const wrappedAsk = async function (text) {
            if (typeof text === 'string' && text.length > 25) {
                let sp = null;
                try { sp = splitPlaceWish(text); } catch (e) { sp = null; }
                if (sp) {
                    const args = Array.prototype.slice.call(arguments);
                    args[0] = sp.rest;
                    try { return await originalAsk.apply(this, args); }
                    finally { runPlaceWish(sp); }
                }
            }
            return originalAsk.apply(this, arguments);
        };
        wrappedAsk._ortsuche = true;
        Object.keys(originalAsk).forEach(k => { try { wrappedAsk[k] = originalAsk[k]; } catch (e) {} });
        window.sendToGroqSmart = wrappedAsk;
    }
    installAskWrapper();

    window.handleOrtsucheCommand = handleOrtsucheCommand;
    window._ortsucheTest = { extract, resolve, openNow, buildQuery, toPlaces, norm };   // nur zum Testen
})();