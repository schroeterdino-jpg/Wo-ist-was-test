/* ============================================================
   ORTE IN DER NÄHE: "Wo ist die nächste Apotheke?", "Wo ist ein Geldautomat?", "Wo gibt es einen Supermarkt, der noch offen hat?",
   "Wo ist eine Toilette?", "Wo kann ich parken?", "Apotheke in Hamburg" (auch für andere Orte).
   Zane sucht in den Kartendaten von OpenStreetMap (über deinen Server /api/overpass), nennt den nächsten Treffer mit Entfernung und,
   wenn in den Kartendaten Öffnungszeiten stehen, ob er gerade offen hat. Weitere Treffer erscheinen als Karten mit Weg dorthin (Google Maps).
   Restaurants und Tankstellen laufen weiter über die bisherigen Funktionen.
   Grenzen: OpenStreetMap ist von Freiwilligen gepflegt; Öffnungszeiten fehlen manchmal oder sind veraltet. Fehlen sie, sagt Zane dazu nichts.
   Braucht: voice.js (speak), apiFetch (Server-Zugriff). Optional: weathermap.js (wxGeocode, wxCleanPlace) für "... in Hamburg".
   Wird von localcommands.js aufgerufen.
   ============================================================ */

/* Kategorien: art = Artikel für "Die nächste Apotheke", sel = Kartendaten-Filter, radius = [erste Suche, größere Suche] in Metern */
const PLACE_CATEGORIES = [
    { key: 'apotheke', label: 'Apotheke', art: 'die', icon: '💊', words: /\bapotheke\w*/, sel: ['["amenity"="pharmacy"]'], radius: [3000, 12000] },
    { key: 'geldautomat', label: 'Geldautomat', art: 'der', icon: '🏧', words: /geldautomat\w*|bankautomat\w*|geld abheben|bargeld|\batm\b|geld holen/, sel: ['["amenity"="atm"]'], radius: [2500, 10000] },
    { key: 'bank', label: 'Bank', art: 'die', icon: '🏦', words: /\b(?:bank|sparkasse|volksbank|bankfiliale)\b/, sel: ['["amenity"="bank"]'], radius: [3000, 12000] },
    { key: 'supermarkt', label: 'Supermarkt', art: 'der', icon: '🛒', words: /supermarkt|supermärkte|lebensmittelgeschäft\w*|einkaufsmöglichkeit\w*|wo kann ich einkaufen/, sel: ['["shop"="supermarket"]'], radius: [3000, 12000] },
    { key: 'baecker', label: 'Bäcker', art: 'der', icon: '🥐', words: /bäcker\w*|backshop\w*/, sel: ['["shop"="bakery"]'], radius: [2500, 10000] },
    { key: 'drogerie', label: 'Drogerie', art: 'die', icon: '🧴', words: /drogerie\w*/, sel: ['["shop"="chemist"]'], radius: [3000, 12000] },
    { key: 'baumarkt', label: 'Baumarkt', art: 'der', icon: '🔨', words: /baumarkt|baumärkte|heimwerkermarkt/, sel: ['["shop"="doityourself"]', '["shop"="hardware"]'], radius: [8000, 25000] },
    { key: 'zahnarzt', label: 'Zahnarzt', art: 'der', icon: '🦷', words: /zahnarzt|zahnärzte|zahnarztpraxis/, sel: ['["amenity"="dentist"]'], radius: [3000, 12000] },
    { key: 'arzt', label: 'Arzt', art: 'der', icon: '🩺', words: /\barzt\b|\bärzte\b|hausarzt|hausärzte/, sel: ['["amenity"="doctors"]'], radius: [3000, 12000] },
    { key: 'krankenhaus', label: 'Krankenhaus', art: 'das', icon: '🏥', words: /krankenhaus|krankenhäuser|klinik\b|notaufnahme|notfallambulanz/, sel: ['["amenity"="hospital"]'], radius: [15000, 40000] },
    { key: 'tierarzt', label: 'Tierarzt', art: 'der', icon: '🐾', words: /tierarzt|tierärzte|tierklinik/, sel: ['["amenity"="veterinary"]'], radius: [5000, 20000] },
    { key: 'toilette', label: 'Toilette', art: 'die', icon: '🚻', words: /toilette\w*|\bwc\b|\bklo\b|öffentliches klo/, sel: ['["amenity"="toilets"]'], radius: [1500, 6000] },
    { key: 'parkhaus', label: 'Parkhaus', art: 'das', icon: '🅿️', words: /parkhaus|parkhäuser|tiefgarage\w*/, sel: ['["amenity"="parking"]["parking"~"multi-storey|underground"]'], radius: [2500, 10000] },
    { key: 'parkplatz', label: 'Parkplatz', art: 'der', icon: '🅿️', words: /parkplatz|parkplätze|\bparken\b|stellplatz|stellplätze/, sel: ['["amenity"="parking"]'], radius: [1500, 6000] },
    { key: 'post', label: 'Postfiliale', art: 'die', icon: '📮', words: /postfiliale\w*|poststelle\w*|postamt|postagentur/, sel: ['["amenity"="post_office"]'], radius: [3000, 12000] },
    { key: 'briefkasten', label: 'Briefkasten', art: 'der', icon: '📬', words: /briefkasten|briefkästen/, sel: ['["amenity"="post_box"]'], radius: [1500, 6000] },
    { key: 'packstation', label: 'Packstation', art: 'die', icon: '📦', words: /packstation\w*|paketstation\w*|paketbox\w*/, sel: ['["amenity"="parcel_locker"]'], radius: [2500, 10000] },
    { key: 'ladestation', label: 'Ladestation', art: 'die', icon: '🔌', words: /ladestation\w*|ladesäule\w*|e-tankstelle\w*/, sel: ['["amenity"="charging_station"]'], radius: [3000, 15000] },
    { key: 'bahnhof', label: 'Bahnhof', art: 'der', icon: '🚉', words: /bahnhof|bahnhöfe|haltepunkt/, sel: ['["railway"="station"]', '["railway"="halt"]'], radius: [10000, 30000] },
    { key: 'cafe', label: 'Café', art: 'das', icon: '☕', words: /(?:^|\s)(?:café|cafés|cafe)(?=\s|$)|kaffeehaus|coffeeshop|kaffee trinken/, sel: ['["amenity"="cafe"]'], radius: [2500, 10000] },
    { key: 'eisdiele', label: 'Eisdiele', art: 'die', icon: '🍦', words: /eisdiele\w*|eiscafé\w*|eisladen|eis essen/, sel: ['["amenity"="ice_cream"]'], radius: [3000, 12000] },
    { key: 'kino', label: 'Kino', art: 'das', icon: '🎬', words: /\bkinos?\b/, sel: ['["amenity"="cinema"]'], radius: [10000, 30000] },
    { key: 'fahrradladen', label: 'Fahrradladen', art: 'der', icon: '🚲', words: /fahrradl\w+|fahrradgeschäft\w*|fahrradwerkstatt|fahrradhändler/, sel: ['["shop"="bicycle"]'], radius: [5000, 20000] },
    { key: 'friseur', label: 'Friseur', art: 'der', icon: '💇', words: /friseur\w*|frisör\w*/, sel: ['["shop"="hairdresser"]', '["shop"~"^(beauty|hairdresser_supply)$"]["name"~"friseur|frisör|haar|hair|coiffeur|barber",i]', '["name"~"friseur|frisör|haarstudio|haarwerk|hair|coiffeur|barber",i]["shop"]'], radius: [2500, 10000] },
    { key: 'optiker', label: 'Optiker', art: 'der', icon: '👓', words: /\boptiker\b/, sel: ['["shop"="optician"]'], radius: [4000, 15000] },
    { key: 'spielplatz', label: 'Spielplatz', art: 'der', icon: '🛝', words: /spielplatz|spielplätze/, sel: ['["leisure"="playground"]'], radius: [2000, 8000] },
    { key: 'schwimmbad', label: 'Schwimmbad', art: 'das', icon: '🏊', words: /schwimmbad|schwimmbäder|schwimmhalle|freibad|hallenbad/, sel: ['["leisure"="swimming_pool"]["name"]', '["leisure"="sports_centre"]["sport"="swimming"]'], radius: [10000, 30000] },
    { key: 'werkstatt', label: 'Autowerkstatt', art: 'die', icon: '🔧', words: /\bautowerkstatt\w*|kfz[- ]?werkstatt\w*|\bwerkstatt\b|\bwerkstätte\b/, sel: ['["shop"="car_repair"]'], radius: [5000, 20000] },
    { key: 'waschanlage', label: 'Waschanlage', art: 'die', icon: '🚿', words: /waschanlage\w*|waschstraße\w*|autowäsche|autowaschanlage\w*/, sel: ['["amenity"="car_wash"]'], radius: [5000, 20000] }
];

const PLACE_NEAR_PHRASE = /\b(?:nächste[nrms]?|nächst\w*|in der nähe|um die ecke|hier in der gegend|wo ist|wo sind|wo gibt es|wo finde ich|wo kann ich|ich suche|ich brauche|gibt es hier|gibt es (?:eine|einen|ein)|zeig mir|finde mir|such mir|wo ist hier)\b/;
/* Dafür fragt Zane nicht nach dem Speichern in den Kontakten */
const PLACE_NO_SAVE = ['geldautomat', 'toilette', 'parkhaus', 'parkplatz', 'briefkasten', 'ladestation', 'spielplatz'];
const PLACE_OWN_CAR = /\b(?:mein|meine|meinen|meinem|geparkt|abgestellt|habe ich|steht mein)\b/;

/* Satz verstehen: { cat, place, onlyOpen } oder null */
function parsePlacesRequest(text) {
    const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 110) return null;
    // Terminwünsche sind KEINE Ortssuche. Beispiel: "Ich brauche einen Friseurtermin bei Anja"
    // muss an Kalender/KI weiterlaufen und darf nicht wegen "Friseur" hier abgefangen werden.
    if (/\b(?:termin|termine|termins|terminen|terminwunsch|friseurtermin|arzttermin|zahnarzttermin|werkstatttermin)\w*\b/.test(t)) return null;
    // Kalender-, Erinnerungs- und Aufgabenbefehle sind ebenfalls KEINE Ortssuche ("Trag morgen um 15 Uhr Zahnarzt in den Kalender ein": "Kalender Ein" ist kein Ort).
    if (/\bkalender\b|\baufgabenliste\w*|\baufgaben?\b|\bto-?do\w*|\berinner\w*|\btrag\w*\b.*\bein\b/.test(t)) return null;
    if (/\b(?:wetter|kurs|euro|lira|dollar|tanke|tanken|sprit|diesel|benzin|restaurant\w*|hunger|pizza\w*|döner|zug|züge|zuges|bus|busse|fährt|fahrt|abfahrt|abfahrten|ankunft|verbindung\w*|fahrplan|bahnfahrt|losfahren|umstieg\w*|ice|regionalbahn|s-bahn|u-bahn)\b/.test(t)) return null;   // gehört anderen Funktionen
    const cat = PLACE_CATEGORIES.find(c => c.words.test(t));
    if (!cat) return null;
    if (cat.key === 'parkplatz' && PLACE_OWN_CAR.test(t)) return null;   // "Wo ist mein Parkplatz?" gehört zur Parkplatz-Merkfunktion
    const onlyOpen = /\b(?:offen|geöffnet|hat auf|haben auf|noch auf|aufhat|jetzt auf)\b/.test(t) || /\bhat\s+(?:\w+\s+){0,3}?(?:noch\s+)?(?:auf|offen)\b/.test(t);
    let place = '';
    // Ein Ort zählt nur, wenn er NACH dem Suchwort steht ("Apotheke in Hamburg"), nicht "Ich war bei der Bank"
    const hit = cat.words.exec(t);
    const after = hit ? t.slice(hit.index + hit[0].length) : '';
    const pm = after.match(/(?:^|\s)(?:in|bei|um|nahe|rund um)\s+([a-zäöüß][a-zäöüß .'-]{1,30})$/);
    if (pm) {
        const cand = pm[1].replace(/(?:\s+(?:auf|offen|geöffnet|noch|jetzt|bitte))+$/, '').trim();
        place = (typeof wxCleanPlace === 'function') ? wxCleanPlace(cand) : '';
        if (/^(?:der\s+)?(?:nähe|umgebung|stadt|gegend)$/i.test(cand)) place = '';
        if (place && PLACE_CATEGORIES.some(c => c.words.test(cand))) place = '';   // "in der Bank" ist kein Ort
    }
    // Zielort darf auch VOR der Kategorie stehen: "Ich suche in Wentorf Apotheken", "Gibt es in Hamburg Apotheken?"
    if (!place && hit) {
        const before = t.slice(0, hit.index);
        const bm = before.match(/(?:^|\s)in\s+([a-zäöüß][a-zäöüß .'-]{1,30})\s*$/);
        if (bm) {
            let cand = bm[1].replace(/^(?:der|die|das|den|dem|des)\s+/, '').trim();
            cand = cand.replace(/(?:\s+(?:ein|eine|einen|einem|noch|mal))+$/, '').trim();
            cand = cand.replace(/^(?:ich\s+suche|suche|finde|zeig\s+mir|gibt\s+es|wo\s+sind|wo\s+gibt\s+es)\s+/i, '').trim();
            place = (typeof wxCleanPlace === 'function') ? wxCleanPlace(cand) : '';
            if (/^(?:der\s+)?(?:nähe|umgebung|stadt|gegend)$/i.test(cand)) place = '';
            if (place && PLACE_CATEGORIES.some(c => c.words.test(cand))) place = '';
        }
    }
    // Ohne "Wo ist / nächste / in der Nähe ..." nur, wenn ein Ort genannt ist ("Apotheke in Hamburg")
    if (!PLACE_NEAR_PHRASE.test(t) && !place) return null;
    return { cat, place, onlyOpen };
}

/* ---------- Öffnungszeiten (OpenStreetMap-Schreibweise) ---------- */
const OH_DAYS = { Mo: 1, Tu: 2, We: 3, Th: 4, Fr: 5, Sa: 6, Su: 0 };
const OH_DAY_RE = '(?:Mo|Tu|We|Th|Fr|Sa|Su)';

function ohDaysFrom(part) {
    const out = [];
    for (const tok of part.split(',')) {
        const m = tok.trim().match(new RegExp('^(' + OH_DAY_RE + ')(?:\\s*-\\s*(' + OH_DAY_RE + '))?$'));
        if (!m) return null;
        let a = OH_DAYS[m[1]];
        const b = m[2] ? OH_DAYS[m[2]] : a;
        for (let i = 0; i < 7; i++) { out.push(a); if (a === b) break; a = (a + 1) % 7; }
    }
    return out;
}

function ohParseTimes(part) {
    const p = part.trim();
    if (/^(?:off|closed)$/i.test(p)) return 'off';
    const ranges = [];
    for (const tok of p.split(',')) {
        const m = tok.trim().match(/^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/);
        if (!m) return null;
        const s = Number(m[1]) * 60 + Number(m[2]);
        let e = Number(m[3]) * 60 + Number(m[4]);
        if (e <= s) e += 1440;   // über Mitternacht
        ranges.push([s, e]);
    }
    return ranges.length ? ranges : null;
}

/* Wochenplan [Sonntag..Samstag] mit Zeitbereichen in Minuten; null, wenn die Angabe zu kompliziert ist (dann sagt Zane nichts zur Öffnung) */
function parseOpeningHours(oh) {
    let s = String(oh || '').replace(/"[^"]*"/g, '').trim();
    if (!s) return null;
    if (/^24\/7$/i.test(s)) return [0, 1, 2, 3, 4, 5, 6].map(() => [[0, 1440]]);
    const schedule = [[], [], [], [], [], [], []];
    let any = false;
    for (let rule of s.split(';')) {
        rule = rule.trim();
        if (!rule) continue;
        if (/^(?:PH|SH)\b/.test(rule)) continue;   // Feiertags- und Ferienregeln werden ignoriert
        const m = rule.match(new RegExp('^((?:' + OH_DAY_RE + '(?:\\s*-\\s*' + OH_DAY_RE + ')?)(?:\\s*,\\s*' + OH_DAY_RE + '(?:\\s*-\\s*' + OH_DAY_RE + ')?)*)?\\s*(.*)$'));
        if (!m) return null;
        const days = m[1] ? ohDaysFrom(m[1]) : [0, 1, 2, 3, 4, 5, 6];
        if (!days) return null;
        let timesPart = m[2].trim().replace(/\s+/g, '');
        if (/^24\/7$/i.test(timesPart)) timesPart = '00:00-24:00';
        const times = ohParseTimes(timesPart);
        if (times === null) return null;
        days.forEach(d => { schedule[d] = times === 'off' ? [] : times.slice(); });
        any = true;
    }
    return any ? schedule : null;
}

function ohTimeText(min) {
    const m = ((min % 1440) + 1440) % 1440;
    return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
}

function ohSpoken(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    return `${h} Uhr${m ? ' ' + m : ''}`;
}

/* { open: true|false|null, until: "18:30"|null, opensAt: "08:00"|null } mit der Uhr des Handys */
function osmOpenStatus(oh, now) {
    const sch = parseOpeningHours(oh);
    if (!sch) return { open: null, until: null, opensAt: null };
    const today = now.getDay(), prev = (today + 6) % 7;
    const min = now.getHours() * 60 + now.getMinutes();
    for (const [s, e] of sch[today]) {
        if (min >= s && min < e) {
            if (e === 1440) {   // bis Mitternacht: läuft es morgen ab 0:00 weiter?
                const next = sch[(today + 1) % 7].find(r => r[0] === 0);
                if (next) {
                    const allDay = sch.every(d => d.some(r => r[0] === 0 && r[1] >= 1440));   // rund um die Uhr
                    return { open: true, until: allDay ? null : ohTimeText(next[1]), opensAt: null };
                }
            }
            return { open: true, until: ohTimeText(e), opensAt: null };
        }
    }
    for (const [s, e] of sch[prev]) if (e > 1440 && min < e - 1440) return { open: true, until: ohTimeText(e), opensAt: null };   // seit gestern Abend offen
    const later = sch[today].filter(r => r[0] > min).sort((a, b) => a[0] - b[0])[0];
    return { open: false, until: null, opensAt: later ? ohTimeText(later[0]) : null };
}

/* ---------- Kartendaten holen ---------- */
function plTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms))]);
}

function plDistanceM(lat1, lon1, lat2, lon2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLat = (lat2 - lat1) * rad, dLon = (lon2 - lon1) * rad;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}

function plDistanceText(m) {
    if (m < 950) return `${Math.max(10, Math.round(m / 10) * 10)} Meter`;
    return `${(m / 1000).toFixed(1).replace('.', ',')} Kilometer`;
}

function plBuildQuery(cat, lat, lon, radius) {
    const parts = cat.sel.map(sel => `nwr${sel}(around:${radius},${lat.toFixed(5)},${lon.toFixed(5)});`);
    return `[out:json][timeout:25];(${parts.join('')});out center tags 80;`;
}

function plPosition() {
    return new Promise((ok, err) => {
        if (!navigator.geolocation) return err(new Error('keine Ortung'));
        navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), err, { timeout: 8000, maximumAge: 120000 });
    });
}

async function plFetchElements(query) {
    const res = await plTimeout(apiFetch('/api/overpass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) }), 35000);
    if (!res.ok) throw new Error('Kartendaten nicht erreichbar (' + res.status + ')');
    const d = await res.json();
    return Array.isArray(d.elements) ? d.elements : [];
}

/* Elemente -> Trefferliste mit Entfernung, Adresse und Öffnungsstatus, nach Entfernung sortiert */
function plBuildResults(cat, elements, lat, lon, now, withOpenStatus) {
    const seen = new Set();
    const out = [];
    for (const e of elements) {
        const tags = e.tags || {};
        const la = e.lat !== undefined ? e.lat : (e.center && e.center.lat), lo = e.lon !== undefined ? e.lon : (e.center && e.center.lon);
        if (typeof la !== 'number' || typeof lo !== 'number') continue;
        if (/^(?:private|no|customers|permit|delivery)$/i.test(tags.access || '') && (cat.key === 'parkplatz' || cat.key === 'parkhaus' || cat.key === 'toilette')) continue;   // nicht öffentlich
        const name = tags.name || tags.brand || tags.operator || '';
        const key = `${name.toLowerCase()}|${la.toFixed(3)}|${lo.toFixed(3)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const street = tags['addr:street'] ? `${tags['addr:street']}${tags['addr:housenumber'] ? ' ' + tags['addr:housenumber'] : ''}` : '';
        const status = withOpenStatus && tags.opening_hours ? osmOpenStatus(tags.opening_hours, now) : { open: null, until: null, opensAt: null };
        out.push({ name, street, lat: la, lon: lo, dist: plDistanceM(lat, lon, la, lo), status, fee: tags.fee === 'yes' });
    }
    return out.sort((a, b) => a.dist - b.dist);
}

function plMapsUrl(r) {
    return `https://www.google.com/maps/dir/?api=1&destination=${r.lat},${r.lon}&travelmode=${r.dist < 1500 ? 'walking' : 'driving'}`;
}

function plOpenShort(st) {
    if (st.open === true) return st.until ? `offen bis ${st.until}` : 'durchgehend offen';
    if (st.open === false) return st.opensAt ? `geschlossen, öffnet ${st.opensAt}` : 'gerade geschlossen';
    return '';
}

function plOpenSpoken(st, art) {
    if (st.open === true) return st.until ? `, geöffnet bis ${ohSpoken(st.until)}` : ', durchgehend geöffnet';
    if (st.open === false) {
        const pron = art === 'der' ? 'er' : art === 'das' ? 'es' : 'sie';
        return st.opensAt ? `, aber gerade geschlossen, ${pron} öffnet um ${ohSpoken(st.opensAt)}` : ', aber gerade geschlossen';
    }
    return '';
}

/* Übergabe an die neuere Ortssuche (ortsuche.js: Google Places zuerst, dann Kartenserver), nur bei eingeschalteter Chef-KI und nur einmal je Anfrage.
   true = die Ortssuche hat die Anfrage übernommen und antwortet selbst (auch mit eigener Fehlermeldung); false = alte Meldung sprechen. */
function plUebergabe(text) {
    try {
        if (!text || !window.jvChef || typeof window.jvChef.istAn !== 'function' || !window.jvChef.istAn()) return false;
        if (typeof window.handleOrtsucheCommand !== 'function') return false;
        if (window.handleOrtsucheCommand(text) !== true) return false;
        try { window.jvChef.uebergabeAlteSuche(); } catch (e) {}
        return true;
    } catch (e) { return false; }
}

/* ---------- Tempo: Google Places zuerst, Zeitmessung, Zwischenansage ---------- */
/* Nur Geschäfte und Einrichtungen, die Google Places zuverlässig kennt. Toiletten, Parkplätze, Parkhäuser, Geldautomaten, Briefkästen, Packstationen, Ladesäulen,
   Bahnhöfe und Spielplätze bleiben bei den Kartendaten (OpenStreetMap kennt dort mehr, z. B. "kostenpflichtig"). "Bank" fehlt absichtlich (Sitzbank-Verwechslung). */
const PL_GOOGLE_ZUERST = ['apotheke', 'supermarkt', 'baecker', 'drogerie', 'baumarkt', 'zahnarzt', 'arzt', 'krankenhaus', 'tierarzt', 'post', 'cafe', 'eisdiele', 'kino', 'fahrradladen', 'friseur', 'optiker', 'schwimmbad', 'werkstatt', 'waschanlage'];
const PL_GOOGLE_MS = 6000;   // so lange wird auf Google gewartet, danach gilt der bisherige Weg über die Kartendaten
const PL_ACK_MS = 4000;      // so lange wird still gesucht, danach kommt EINE kurze Zwischenansage
const PL_ACK_WARTEN_MS = 2500;   // so lange wartet die Antwort höchstens auf eine gerade laufende Zwischenansage (kein Übereinanderreden)

/* Google Places über den vorhandenen Server (/api/maps?action=places: 10 Minuten zwischengespeichert, Monatslimit im Server). EIN Aufruf mit dem größeren Umkreis
   ersetzt die zwei Runden nacheinander: Treffer sind nach Entfernung sortiert, der nächste steht also vorn. null = nicht verfügbar (Fehler, Limit, Zeit), [] = nichts gefunden. */
async function plGoogle(cat, lat, lon) {
    if (typeof apiFetch !== 'function') return null;
    try {
        const url = '/api/maps?action=places&q=' + encodeURIComponent(cat.label) + '&lat=' + encodeURIComponent(lat.toFixed(6)) + '&lon=' + encodeURIComponent(lon.toFixed(6)) + '&radius=' + encodeURIComponent(cat.radius[1]) + '&kanal=orte';   // kanal: nur zur Unterscheidung (Server ignoriert es, Tests nutzen es)
        const r = await plTimeout(apiFetch(url), PL_GOOGLE_MS);
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d || !Array.isArray(d.places)) return null;
        return d.places.map(p => {
            const la = Number(p.lat), lo = Number(p.lon);
            const status = p.openNow === true ? { open: true, until: p.until || null, opensAt: null } : p.openNow === false ? { open: false, until: null, opensAt: p.opensAt || null } : { open: null, until: null, opensAt: null };
            return { name: String(p.name || ''), street: [p.street, p.housenumber].filter(Boolean).join(' '), lat: la, lon: lo, dist: plDistanceM(lat, lon, la, lo), status, fee: false };
        }).filter(x => x.name && isFinite(x.lat) && isFinite(x.lon)).sort((a, b) => a.dist - b.dist);
    } catch (e) { return null; }
}

/* Zeitmessung (nur Zahlen und die Art der Suche, nie ein Satz, nur im Arbeitsspeicher; sichtbar in Einstellungen > Chef-KI) */
const plZeiten = [];
let plNr = 0;
function plSek(ms) { return typeof ms === 'number' ? (ms / 1000).toFixed(1).replace('.', ',') + ' s' : '–'; }
function plZeitenZeichnen() {
    try {
        const el = document.getElementById('ortZeitListe');
        if (!el) return;
        el.textContent = '';
        plZeiten.slice().reverse().forEach(z => {
            const d = document.createElement('div');
            const t = new Date(z.zeit), hh = ('0' + t.getHours()).slice(-2) + ':' + ('0' + t.getMinutes()).slice(-2) + ':' + ('0' + t.getSeconds()).slice(-2);
            d.textContent = 'Orte #' + z.nr + ' · ' + hh + ' · ' + z.kat + ' · Standort ' + plSek(z.pos) + (z.google !== null ? ' · Google ' + plSek(z.google) : '') + (z.osm !== null ? ' · Karten ' + plSek(z.osm) + ' (' + z.runden + ' Runde' + (z.runden === 1 ? '' : 'n') + ')' : '') + ' · Antwort nach ' + plSek(z.gesamt) + ' · ' + z.quelle + ' · ' + z.ergebnis + (z.ack ? ' · Zwischenansage' : '');
            el.appendChild(d);
        });
    } catch (e) { }
}
function plZeitenSpeichern(m) { plZeiten.push(m); if (plZeiten.length > 10) plZeiten.shift(); plZeitenZeichnen(); }
window.jvOrtZeiten = { liste: () => plZeiten.map(z => Object.assign({}, z)), zeichne: plZeitenZeichnen, vergiss: () => { plZeiten.length = 0; plZeitenZeichnen(); } };

/* Zwischenansage bei langer Suche: EINMAL, kurz, ohne danach das Zuhören zu starten (das Ende zählt nur für die Antwort). Die Antwort wartet höchstens PL_ACK_WARTEN_MS darauf. */
function plAckStart(S) {
    try {
        if (S.fertig || S.ackP || typeof speakAck !== 'function') return;
        S.ackAt = Date.now();
        S.ackP = new Promise(res => { try { speakAck('Einen Moment, ich suche noch.', res); } catch (e) { res(); } });
    } catch (e) { }
}
async function plAckAbwarten(S) {
    try {
        if (!S.ackP) return;
        const rest = PL_ACK_WARTEN_MS - (Date.now() - S.ackAt);
        if (rest > 0) await Promise.race([S.ackP, new Promise(r => setTimeout(r, rest))]);
    } catch (e) { }
}

/* ---------- Ablauf ---------- */
async function runPlaces(req, originalText) {
    const S = { fertig: false, ackP: null, ackAt: 0 };
    const M = { nr: ++plNr, zeit: Date.now(), kat: req.cat.label, pos: null, quelle: 'keine', google: null, osm: null, runden: 0, ack: false, gesamt: null, ergebnis: 'fehler' };
    const timer = setTimeout(() => { if (!S.fertig) { M.ack = true; plAckStart(S); } }, PL_ACK_MS);
    try { await runPlacesInner(req, originalText, S, M); }
    finally { S.fertig = true; clearTimeout(timer); if (M.gesamt === null) M.gesamt = Date.now() - M.zeit; plZeitenSpeichern(M); }
}

async function runPlacesInner(req, originalText, S, M) {
    let uebergeben = false;   // je Anfrage höchstens eine Übergabe
    /* Jede Antwort geht hier durch: wartet kurz auf eine laufende Zwischenansage und beendet die Suche (keine weitere Zwischenansage). */
    const say = async (msg) => {
        S.fertig = true;
        await plAckAbwarten(S);
        if (M.gesamt === null) M.gesamt = Date.now() - M.zeit;
        speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    };
    const cat = req.cat;
    try { if (typeof typeWriterStatus === 'function') typeWriterStatus(`Suche ${cat.label}...`); } catch (e) {}
    let lat, lon, where = '';
    const nearMe = !req.place;
    const tPos = Date.now();
    if (nearMe) {
        try { const p = await plPosition(); lat = p.lat; lon = p.lon; M.pos = Date.now() - tPos; }
        catch (e) {
            M.pos = Date.now() - tPos; M.ergebnis = 'standort';
            await say(e && e.code === 1 ? 'Der Standort ist für die App nicht erlaubt. Bitte erlauben Sie ihn in den Einstellungen.' : 'Ihren Standort kann ich gerade nicht ermitteln.');
            return;
        }
    } else {
        const geo = (typeof wxGeocode === 'function') ? await wxGeocode(req.place) : null;
        M.pos = Date.now() - tPos;
        if (!geo) { M.ergebnis = 'ort_unbekannt'; await say(`Den Ort ${req.place} habe ich nicht gefunden.`); return; }
        lat = geo.lat; lon = geo.lon; where = ` in ${geo.short}`;
        try { if (window.jvChef && typeof window.jvChef.ortMerken === 'function') window.jvChef.ortMerken(geo.short); } catch (e) {}   // Gesprächsort für "dort" (nur bei eingeschalteter Chef-KI)
    }

    const now = new Date();
    let results = null, radiusUsed = cat.radius[0];
    const googleErst = PL_GOOGLE_ZUERST.includes(cat.key);
    if (googleErst) {
        const tg = Date.now();
        const g = await plGoogle(cat, lat, lon);
        M.google = Date.now() - tg;
        if (g && g.length) { results = g; radiusUsed = cat.radius[1]; M.quelle = 'google'; }
    }
    if (!results) {   // bisheriger Weg über die Kartendaten (auch Rückfall, wenn Google nichts liefert)
        const to = Date.now();
        let elements = [];
        try {
            M.runden = 1;
            elements = await plFetchElements(plBuildQuery(cat, lat, lon, cat.radius[0]));
            if (!elements.length) { radiusUsed = cat.radius[1]; M.runden = 2; elements = await plFetchElements(plBuildQuery(cat, lat, lon, cat.radius[1])); }
        } catch (e) {
            M.osm = Date.now() - to; M.ergebnis = 'fehler';
            if (!uebergeben && (uebergeben = true) && (S.fertig = true) && plUebergabe(originalText)) { M.ergebnis = 'uebergeben'; return; }
            await say('Die Kartendaten sind gerade nicht erreichbar. Versuchen Sie es bitte gleich noch einmal.');
            return;
        }
        M.osm = Date.now() - to; M.quelle = googleErst ? 'karten_nach_google' : 'karten';
        results = plBuildResults(cat, elements, lat, lon, now, nearMe);
    }
    results.forEach(r => { r.status.art = cat.art; });
    if (req.onlyOpen && nearMe) {
        const open = results.filter(r => r.status.open !== false);
        if (open.length) results = open;
    }
    if (!results.length) {
        M.ergebnis = 'leer';
        if (!uebergeben && (uebergeben = true) && (S.fertig = true) && plUebergabe(originalText)) { M.ergebnis = 'uebergeben'; return; }
        await say(`Im Umkreis von ${Math.round(radiusUsed / 1000)} Kilometern${where} habe ich in den Kartendaten keinen Treffer für ${cat.label} gefunden. Die Daten sind nicht überall vollständig.`);
        return;
    }
    M.ergebnis = 'treffer';

    const first = results[0];
    const adj = cat.art === 'der' ? 'Der nächste' : cat.art === 'das' ? 'Das nächste' : 'Die nächste';
    const who = first.name || first.street || cat.label;
    let msg = `${adj} ${cat.label}${where}: ${who}, ${plDistanceText(first.dist)} entfernt${plOpenSpoken(first.status, cat.art)}.`;
    if (first.fee && (cat.key === 'toilette' || cat.key === 'parkplatz' || cat.key === 'parkhaus')) msg = msg.replace(/\.$/, ', kostenpflichtig.');
    // erste Wahl ist zu: den nächsten nennen, der offen hat
    if (first.status.open === false) {
        const alt = results.find(r => r.status.open === true);
        if (alt) msg += ` Offen hat gerade ${alt.name || alt.street || 'eine andere'}, ${plDistanceText(alt.dist)} entfernt${alt.status.until ? ', bis ' + ohSpoken(alt.status.until) : ''}.`;
        else if (cat.key === 'apotheke') msg += ' Notdienst-Apotheken finden Sie auf aponet.de.';
    }
    msg += results.length > 1 ? ' Weitere stehen unten.' : '';
    // Adresse in den Kontakten speichern anbieten (nur bei Läden und Einrichtungen mit festem Standort); die Antwort wertet ortsuche.js aus
    if (typeof window.jvOfferSave === 'function' && !PLACE_NO_SAVE.includes(cat.key)) {
        try {
            const offer = await window.jvOfferSave(cat.label, results.slice(0, 3));
            if (offer) msg += (offer.listing || '') + (offer.ask || '');
        } catch (e) {}
    }

    const cards = results.slice(0, 4).map(r => ({
        icon: cat.icon, title: `${r.name || cat.label} · ${plDistanceText(r.dist)}`,
        subtitle: [r.street, plOpenShort(r.status)].filter(Boolean).join(' · ') || 'Weg zeigen', href: plMapsUrl(r)
    }));
    try { if (typeof clearActionCards === 'function') clearActionCards(); if (typeof showActionCards === 'function') showActionCards(cards); } catch (e) {}
    try { if (window.jvSchreibkern) window.jvSchreibkern.merkeOrte(results.slice(0, 4).map(r => ({ name: r.name || cat.label, adresse: r.street || '', lat: r.lat, lon: r.lon })), cat.label); } catch (e) {}   // B1: für "Speichere die Adresse von der Apotheke"
    await say(msg);
}

function handlePlacesCommand(text) {
    const req = parsePlacesRequest(text);
    if (!req) return false;
    runPlaces(req, text).catch(() => { try { speak('Die Suche hat gerade nicht geklappt.'); } catch (e) {} });
    return true;
}