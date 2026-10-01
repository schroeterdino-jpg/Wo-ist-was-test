/* ============================================================
   ROUTING: Bahn, Spritpreise, Arbeitsadresse und Ziele ("zur Arbeit", "nach Hause")
   Aus assistant.js herausgelöst, Code unverändert. Braucht: storage.js, travel.js zur Laufzeit.
   ============================================================ */

/* --- Bahn- und Busverbindungen: Sicherheitsnetz für den Fall, dass die KI nur einen Kartenlink ("navigate") angelegt hat --- */
const BAHN_WORDS_RE = /\b(bahn|zug|züge|s-?bahn|u-?bahn|bus|hvv|verbindung|öpnv|regionalbahn|regionalexpress)\b/i;

/* Ist der Satz eine Frage nach Bahn-/Bus-Verbindungen? (bewusst streng: Autobahn, Internet-Verbindung usw. zählen nicht) */
function isBahnQuestion(text) {
    const t = String(text || '');
    const strong = /\b(bahnverbindung|zugverbindung|bahn|zug|züge|s-?bahn|u-?bahn|hvv|öpnv|regionalbahn|regionalexpress|nahverkehr)\b/i.test(t);
    const conn = /\bverbindung\b/i.test(t) && /\bvon\b.+\bnach\b/i.test(t);
    // Bus und Straßenbahn: nur, wenn es um Fahren/Verbindungen geht (nicht z.B. "Bus" als Wort in einem anderen Zusammenhang)
    const weak = /\b(bus|busse|busverbindung|buslinie|buslinien|straßenbahn|strassenbahn|tram)\b/i.test(t) && /(mit dem|mit der|nehmen|nimmt|fährt|fahren|verbindung|linie|\bvon\b.+\bnach\b)/i.test(t);
    if (!strong && !conn && !weak) return false;
    if (/(internet|wlan|bluetooth|handy|netz|server|kalender)/i.test(t)) return false;
    return /\b(von|nach|zu|zum|zur|bei mir|hier|pünktlich|ankommen|sein)\b/i.test(t);
}

/* Aus dem Satz: { from, to, time, type }; Felder bleiben leer, wenn nichts genannt wurde */
function bahnFromText(text) {
    const t = String(text || '').replace(/[?!]+$/, '');
    const out = { from: '', to: '', time: '', type: 'abfahrt' };
    const tm = t.match(/\b(?:um|ab|bis|gegen)\s+(\d{1,2})(?:[:.](\d{2})|\s*uhr(?:\s*(\d{2}))?)?/i) || t.match(/\b(\d{1,2}):(\d{2})\b/);
    if (tm) out.time = `${String(tm[1]).padStart(2, '0')}:${tm[2] || tm[3] || '00'}`;
    if (out.time && /\b(sein|ankommen|ankommt|ankunft|pünktlich|spätestens|damit|bis)\b/i.test(t)) out.type = 'ankunft';
    const m = t.match(/\bvon\s+(.+?)\s+nach\s+(.+?)(?=\s+(?:um|ab|bis|gegen)\s+\d|\s+(?:raus|heraus)\b|[.,]|$)/i);
    if (m) { out.from = m[1].trim(); out.to = m[2].trim(); }
    else {
        const n = t.match(/\b(?:nach|zu|zum|zur)\s+(.+?)(?=\s+(?:um|ab|bis|gegen)\s+\d|\s+(?:raus|heraus)\b|[.,]|$)/i);
        if (n) out.to = n[1].trim();
        const f = t.match(/\bvon\s+(.+?)(?=\s+(?:nach|zu|zum|zur|los\w*|abfahr\w*|fahr\w*|fähr\w*|komm\w*|ab|um|bis|gegen|damit|bitte)\b|[.,]|$)/i);   // "... von Hamburg Hauptbahnhof losfahren"
        if (f) out.from = f[1].trim();
    }
    if (/^(mir|uns|mich)$/i.test(out.to)) out.to = 'hier';   // "Meine Tochter möchte zu mir"
    if (!out.to && /(\bhier\b|bei mir|zu mir)/i.test(t)) out.to = /zu hause|zuhause/i.test(t) ? 'Zuhause' : 'hier';     // "... soll um 16 Uhr hier sein"
    return out;
}

/* --- Tankstellen entlang der Strecke: Erkennung --- */
const FUEL_WORDS_RE = /tank\w*|sprit|diesel|benzin|\be10\b|\be5\b|kraftstoff/i;
const ROUTE_WORDS_RE = /\b(weg|strecke|route|unterwegs|entlang)\b/i;
function isFuelRouteQuestion(text) { return FUEL_WORDS_RE.test(text) && ROUTE_WORDS_RE.test(text); }

function fuelTypeFromText(text) {
    const t = String(text || '').toLowerCase();
    if (/\be10\b/.test(t)) return 'e10';
    if (/\be5\b|\bsuper\b/.test(t)) return 'e5';
    if (/benzin/.test(t)) return 'e10';   // wie bei den Preisen in der Nähe: "Benzin" heißt E10
    return 'diesel';
}

/* Ziel aus dem Satz: { dest: 'Arbeit', label: 'zur Arbeit' }; dest bleibt leer, wenn keins genannt wurde */
function fuelDestFromText(text) {
    const t = String(text || '');
    const low = t.toLowerCase();
    const work = /\b(arbeit|arbeitsweg|arbeitsstelle|arbeitsplatz)\b/.test(low);
    const home = /(nach hause|nachhause|zuhause|zu hause|heimweg)/.test(low);
    if (work && !home) return { dest: 'Arbeit', label: 'zur Arbeit' };
    if (home && !work) return { dest: 'Zuhause', label: 'nach Hause' };
    const m = t.match(/\b(?:nach|zu|zum|zur|bis)\s+(?:dem\s+|der\s+)?([A-ZÄÖÜ][\wäöüß-]*(?:\s+[A-ZÄÖÜ][\wäöüß-]*){0,2})/);
    if (m) return { dest: m[1].trim(), label: `nach ${m[1].trim()}` };
    return { dest: '', label: '' };
}

function fuelLabelFor(dest) {
    const k = plainKey(dest);
    if (/^(arbeit|zurarbeit)$/.test(k)) return 'zur Arbeit';
    if (/^(zuhause|nachhause|hause)$/.test(k)) return 'nach Hause';
    return dest ? `nach ${dest}` : '';
}

/* --- Spritpreise (Tankerkönig über /api/tank) --- */
let lastTankCache = null;   // { time, data } - hilft bei Folgefragen ohne Tank-Stichwort ("und die Classic?")
const TANK_CACHE_MS = 15 * 60000;

/* HUD-Karten für die drei günstigsten Tankstellen einer Sorte in der Nähe; die günstigste bekommt eine grüne Markierung */
const NEARBY_FUEL_LABELS = { diesel: 'Diesel', e10: 'E10', e5: 'Super E5' };
function buildNearbyFuelCards(stations, fuelType) {
    const label = NEARBY_FUEL_LABELS[fuelType] || 'Diesel';
    const rows = (stations || [])
        .map(s => ({ name: s.name || 'Tankstelle', strasse: s.strasse || '', preis: s[fuelType] }))
        .filter(r => typeof r.preis === 'number' && r.preis > 0);
    rows.sort((a, b) => a.preis - b.preis);
    return rows.slice(0, 3).map((r, i) => ({
        icon: i === 0 ? '🟢' : '⛽',
        title: `${i === 0 ? '🟢 GÜNSTIGSTER PREIS · ' : ''}${r.name} · ${r.preis.toFixed(3).replace('.', ',')} €`,
        subtitle: `${label}${r.strasse ? ' · ' + r.strasse : ''}`,
        href: typeof buildMapsLink === 'function' ? buildMapsLink(r.strasse || r.name, '', 'driving') : undefined
    }));
}

async function tankFuerFrage(text) {
    if (isFuelRouteQuestion(text)) return null;   // Fragen "auf dem Weg zu ..." beantwortet die Strecken-Abfrage, keine Anfrage in der Nähe (Tankerkönig erlaubt nur etwa eine pro Minute)
    const passtThema = /benzin|diesel|sprit|tank|e10|kraftstoff|günstig|kostet|teuer|preis/i.test(text);
    const cacheFrisch = lastTankCache && (Date.now() - lastTankCache.time) < TANK_CACHE_MS;

    if (!passtThema) {
        return cacheFrisch ? lastTankCache.data : null;   // Folgefrage ohne Stichwort: letzten Stand weiterverwenden
    }

    typeWriterStatus("Rufe Spritpreise ab...");
    updateTerminalStream("API_FETCH: FUEL_PRICES", "FETCHING");
    try {
        const pos = await new Promise((ok, err) =>
            navigator.geolocation.getCurrentPosition(ok, err, { timeout: 7000, maximumAge: 60000 }));
        const r = await apiFetch(`/api/tank?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&rad=5`);
        const d = await r.json();
        if (!r.ok || d.error) {   // echter Fehler vom Server: nicht als "keine Tankstellen" ausgeben und nicht zwischenspeichern
            return { fehler: "Die Spritpreise sind gerade nicht verfügbar: " + (d.error || ('Status ' + r.status)) };
        }
        if (!d.stations || d.stations.length === 0) {
            const result = { fehler: "Keine geöffneten Tankstellen in der Nähe gefunden." };
            lastTankCache = { time: Date.now(), data: result };
            return result;
        }
        const result = {
            hinweis: "Preise in Euro pro Liter, nach Entfernung sortiert. Nenne die drei günstigsten Tankstellen für die erfragte Sorte, beginnend mit der günstigsten, jeweils mit Name, Straße und Preis. Bei 'Benzin' ohne Angabe nimm E10. Sprich Preise als Euro und Cent, z.B. 'zwei Euro zweiundzwanzig'. Das ist eine Liste, die Antwort darf daher länger sein. Fragt der User gezielt nach einer bestimmten Tankstelle aus dieser Liste, nenne nur deren Preis(e).",
            stationen: d.stations
        };
        lastTankCache = { time: Date.now(), data: result };
        return result;
    } catch (e) {
        const result = { fehler: "Standort oder Spritpreise nicht verfügbar." };
        lastTankCache = { time: Date.now(), data: result };
        return result;
    }
}


/* ============================================================
   ARBEITSADRESSE, PROTOKOLLE UND FESTE SPRACHBEFEHLE
   - Arbeitsadresse: "Merk dir meine Arbeitsadresse: ..." (wie die Heimatadresse, wird nicht überschrieben)
   - Ziele wie "Arbeit" und "Zuhause" werden in die gespeicherten Adressen umgewandelt
   - Protokolle: mehrere Befehle unter einem Namen ("Starte Protokoll Feierabend")
   - Karte: "Zeig mir die Karte"
   ============================================================ */

let workAddress = getPersistentData('helfer_work_address', '') || '';

function saveWorkAddress(addr) {
    workAddress = String(addr || '').trim();
    setPersistentData('helfer_work_address', workAddress);
    updateTerminalStream("WORK: SAVED");
}

/* "Merk dir meine Arbeitsadresse Neu-Galliner-Ring 6" -> die Adresse, sonst null */
function matchWorkAddressCommand(text) {
    const m = String(text || '').match(/(?:^|\s)(?:merk\w*|speicher\w*|notier\w*|hinterleg\w*|trag\w*|änder\w*|aktualisier\w*)\s.*?\b(?:arbeitsadresse|arbeitsstelle|arbeitsplatz|adresse\s+(?:von|meiner)\s+(?:meiner\s+)?arbeit|adresse\s+(?:der|meiner)\s+arbeit)\b\s*(?:ist|lautet|liegt)?\s*[:,]?\s*(.+)$/i);
    if (!m) return null;
    let addr = m[1].replace(/[.!?]+$/, '').trim();
    if (/(änder|aktualisier)/i.test(text)) addr = addr.replace(/^auf\s+(?!dem\b|der\b|den\b)/i, '');   // "Ändere ... auf Hauptstraße 12"
    return addr.length >= 4 ? addr : null;
}

function plainKey(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
}

/* Sagt der Satz selbst "zur Arbeit" bzw. "nach Hause", gilt immer die gespeicherte Adresse - egal, was die KI als Ziel eingesetzt hat
   (sie nimmt sonst manchmal eine ältere, falsch geschriebene Adresse aus dem Gedächtnis).
   Ausnahme: "zu Alissa nach Hause" heißt "zu Alissas Zuhause", nicht zum eigenen Zuhause - das darf die
   feste Regel unten nicht überschreiben, sonst navigiert die App fälschlich zur eigenen Adresse. */
function mentionsVisitingSomeonesHome(text) {
    return /\bzu\s+[A-ZÄÖÜ][\wäöüß]{2,}\b[^.!?]{0,30}\b(nach\s*hause|zuhause|zu\s*hause)\b/i.test(String(text || ''));
}

function resolveTravelDestination(userText, dest) {
    const t = String(userText || '').toLowerCase();
    const visitingSomeoneElse = mentionsVisitingSomeonesHome(userText);
    const wantsWork = /\b(arbeit|arbeitsweg|arbeitsstelle|arbeitsplatz)\b/.test(t);
    const wantsHome = /(nach hause|nachhause|zuhause|zu hause|heimweg)/.test(t) && !visitingSomeoneElse;
    if (wantsWork && !wantsHome) return resolvePersonalPlace('Arbeit');
    if (wantsHome && !wantsWork) return resolvePersonalPlace('Zuhause');
    return resolvePersonalPlace(dest);
}

/* "Arbeit", "zur Arbeit", "nach Hause" ... -> gespeicherte Adresse. Alle anderen Ziele bleiben unverändert. */
function resolvePersonalPlace(dest) {
    const raw = String(dest || '').trim();
    if (!raw) return raw;
    const k = plainKey(raw);
    if (/^(zu|zur|zum|nach|in|ins|auf)?(meine|meiner|mein|meinem)?(arbeit|arbeitsstelle|arbeitsplatz|firma|buro|buero)$/.test(k)) {
        if (!workAddress) throw userError('Ihre Arbeitsadresse kenne ich noch nicht. Sagen Sie: Merk dir meine Arbeitsadresse, und dann die Adresse.');
        return workAddress;
    }
    if (/^(nach|zu|in|ins|auf)?(meine|mein)?(hause|zuhause|heim|heimat|heimatadresse|wohnung)$/.test(k)) {
        const home = (typeof homeAddress === 'string') ? homeAddress : (homeAddress && (homeAddress.address || homeAddress.text || homeAddress.label)) || '';
        if (!home) throw userError('Ihre Heimatadresse kenne ich noch nicht. Sagen Sie: Merk dir meine Heimatadresse, und dann die Adresse.');
        return home;
    }
    return raw;
}


/* ============================================================
   KONTAKTE ALS FAHRZIEL: "Ich möchte zu Alyssa fahren" -> die gespeicherte Adresse des Kontakts
   Vorher ging der bloße Name an Google Maps, und Maps fand irgendein Geschäft mit diesem Namen (z.B. eine Praxis).
   Jetzt wird erst in den Kontakten nachgesehen; nur was kein Kontakt ist (z.B. "Penny in Schwarzenbek"), wird weiter gesucht.
   ============================================================ */

/* Kontakte als einheitliche Liste [{ name, address }], egal ob savedContacts eine Liste oder eine Zuordnung ist */
function contactList() {
    const raw = (typeof savedContacts !== 'undefined') ? savedContacts : null;
    if (!raw) return [];
    const pick = (v, fallbackName) => {
        if (!v || typeof v !== 'object') return { name: fallbackName || '', address: '' };
        return { name: v.name || v.key || v.label || fallbackName || '', address: v.address || v.adresse || v.addr || v.ort || v.location || '' };
    };
    if (Array.isArray(raw)) return raw.map(v => pick(v, ''));
    return Object.keys(raw).map(k => pick(raw[k], k));
}

/* Namen vergleichbar machen: ohne Satzzeichen/Umlaut-Unterschiede; die Schreibweisen, die die Spracherkennung durcheinanderbringt,
   und gängige Anreden werden gleichgesetzt ("Mutter" = "Mama", "Alicia" = "Alyssa") */
function contactKey(s) {
    // Erst in Wörter zerlegen und führende Füllwörter entfernen ("zu meiner Tochter" -> "Tochter"); zusammengeklebt wäre "zumeiner" nicht mehr trennbar
    const filler = new Set(['zu', 'zur', 'zum', 'nach', 'bei', 'von', 'vom', 'meiner', 'meinem', 'meinen', 'meine', 'mein', 'der', 'dem', 'die', 'den']);
    const words = String(s || '').toLowerCase().split(/\s+/).filter(Boolean);
    while (words.length > 1 && filler.has(words[0])) words.shift();
    let k = plainKey(words.join(' '));
    k = k.replace(/alicia|alissa|alisha|alysa/g, 'alyssa');
    return { mutter: 'mama', mutti: 'mama', mami: 'mama', mum: 'mama', vater: 'papa', vati: 'papa' }[k] || k;
}

/* Hat die Adresse keinen Ort, wird der Ort der Heimatadresse ergänzt - sonst muss der Kartendienst raten, welcher
   "Hans-Dewitz-Ring" gemeint ist. Adressen mit Komma oder Postleitzahl bleiben unberührt. */
function withDefaultRegion(address) {
    const addr = String(address || '').trim();
    if (!addr || /\d{5}/.test(addr) || addr.includes(',')) return addr;
    const home = (typeof homeAddress === 'string') ? homeAddress : (homeAddress && (homeAddress.address || homeAddress.text || homeAddress.label)) || '';
    if (!home) return addr;
    const plz = home.match(/\b(\d{5})\s+([A-ZÄÖÜ][\wäöüß.-]*(?:\s+[A-ZÄÖÜ][\wäöüß.-]*)?)/);
    if (plz) return `${addr}, ${plz[1]} ${plz[2]}`;
    const parts = home.split(',').map(x => x.trim()).filter(Boolean);
    if (parts.length > 1 && !/\d/.test(parts[parts.length - 1])) return `${addr}, ${parts[parts.length - 1]}`;
    return addr;
}

/* Gibt die Adresse des Kontakts zurück, dessen Name dem Ziel entspricht; sonst null (dann ist es ein normaler Ort) */
function resolveContactDestination(dest) {
    const d = contactKey(dest);
    if (!d) return null;
    const hit = contactList().find(c => c.address && contactKey(c.name) === d);
    return hit ? withDefaultRegion(hit.address) : null;
}

/* Wendet das auf die Aktionen der KI an: Fahrziele, die ein Kontakt sind, werden durch die Adresse ersetzt.
   Fehlt eine Fahr-Aktion ganz ("Ich möchte zu Alyssa fahren" nur als Antwort), wird eine Fahrzeit-Abfrage ergänzt. */
function resolveContactsInActions(actions, text) {
    const fields = { navigate: ['nav_to', 'nav_from'], travel_time: ['travel_destination'], bahn: ['bahn_to', 'bahn_from'], fuel_route: ['fuel_destination'] };
    actions.forEach(a => {
        (fields[a.type] || []).forEach(f => {
            if (!a[f]) return;
            const addr = resolveContactDestination(a[f]);
            if (addr) a[f] = addr;
        });
    });

    const hasRoute = actions.some(a => fields[a.type]);
    const onlyChat = actions.every(a => !a.type || a.type === 'chat' || a.type === 'memory_search');
    if (!hasRoute && onlyChat && /\b(fahren|fahr|hinfahren|hin\s*fahren|navigier\w*|bring mich|weg zu|route zu)\b/i.test(String(text || ''))) {
        const t = String(text || '');
        const hit = contactList().find(c => c.address && contactKey(c.name) &&
            new RegExp('\\b(?:zu|nach|bei)\\s+(?:meiner\\s+|meinem\\s+|meinen\\s+)?' + String(c.name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'i').test(t));
        if (hit) { actions.length = 0; actions.push({ type: 'travel_time', travel_destination: withDefaultRegion(hit.address) }); }
    }
    return actions;
}
