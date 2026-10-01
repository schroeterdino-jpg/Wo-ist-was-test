/* ============================================================
   TANKBUCH / FAHRTENBUCH per Sprache, direkt in der App (ohne KI):
   Eintragen:  "Ich habe 40 Liter für 72 Euro getankt, Kilometerstand 123456"
               "Gestern 38,5 Liter getankt, 69 Euro 40, Stand 123.900"   (Kilometerstand auch nachtragen: "Kilometerstand 123456")
   Abfragen:   "Wie ist mein Verbrauch?" / "Was habe ich diesen Monat getankt?" / "Wie viele Kilometer bin ich diesen Monat gefahren?" /
               "Was kostet mich ein Kilometer?" / "Zeig das Tankbuch" / "Lösche die letzte Tankung"
   Annahme: getankt wird immer voll, außer du sagst "nicht voll", "teilweise" oder "halb". Der Verbrauch wird zwischen zwei Volltankungen mit
   Kilometerstand berechnet (Standardverfahren, Teiltankungen werden mitgezählt).
   Braucht: storage.js, voice.js (speak, pickRandom); showActionCards/clearActionCards aus ui.js/render.js. Wird von localcommands.js aufgerufen.
   ============================================================ */

const TANKBUCH_KEY = 'helfer_tankbuch';

function loadTankbuch() {
    try {
        const arr = JSON.parse(getPersistentData(TANKBUCH_KEY, '[]') || '[]');
        return Array.isArray(arr) ? arr.filter(e => e && typeof e.time === 'number') : [];
    } catch (e) { return []; }
}
function saveTankbuch(list) { setPersistentData(TANKBUCH_KEY, JSON.stringify(list)); }

/* "123.456", "123 456", "72,50", "72.5" -> Zahl */
function parseDeNumber(s) {
    let v = String(s || '').replace(/\s/g, '');
    if (/,\d{1,3}$/.test(v)) v = v.replace(/\./g, '').replace(',', '.');
    else if (/^\d{1,3}(\.\d{3})+$/.test(v)) v = v.replace(/\./g, '');
    const n = Number(v);
    return isNaN(n) ? null : n;
}


/* ---------- Sorte: "Ich fahre Diesel" wird einmal gemerkt (auch für die Tankstellensuche) ---------- */
const FUEL_LABELS = { diesel: 'Diesel', e10: 'Super E10', e5: 'Super E5' };
function getPreferredFuel() {
    const v = getPersistentData('helfer_fuel_type', 'diesel');
    return (v === 'e10' || v === 'e5' || v === 'diesel') ? v : 'diesel';
}
function setPreferredFuel(v) { setPersistentData('helfer_fuel_type', v); }

/* Sorte aus Wörtern: "Diesel", "Super", "E5", "E10", "Benzin" (= E10); null, wenn keine genannt */
function fuelFromWords(text) {
    const t = String(text || '').toLowerCase();
    if (/\bdiesel\b/.test(t)) return 'diesel';
    if (/\be10\b|benzin/.test(t)) return 'e10';
    if (/\be5\b|\bsuper\b/.test(t)) return 'e5';
    return null;
}

const KM_NUMBER = '(\\d{1,3}(?:[.\\s]\\d{3})+|\\d{4,7})';

/* Kilometerstand aus dem Satz (mit oder ohne Stichwort "Kilometerstand"), sonst null */
function parseOdometer(text) {
    const t = String(text || '');
    let m = t.match(new RegExp('(?:kilometerstand|km-?stand|tachostand|tacho|stand)\\s*(?:ist|von|bei|liegt bei|:)?\\s*' + KM_NUMBER, 'i'));
    if (!m) m = t.match(new RegExp(KM_NUMBER + '\\s*(?:km|kilometer)\\b(?!\\s*(?:pro|je))', 'i'));
    if (!m) return null;
    const n = parseDeNumber(m[1]);
    return n && n >= 1000 ? Math.round(n) : null;
}

/* Tankung aus dem Satz: { liters, euros, odo, full, time }; null, wenn weder Liter noch Euro genannt sind */
function parseFuelEntry(text) {
    const t = String(text || '');
    const lit = t.match(/(\d+(?:[.,]\d+)?)\s*(?:l\b|liter\w*)/i);
    const eur = t.match(/(\d+(?:[.,]\d+)?)\s*(?:euro|€|eur\b)(?:\s*(?:und\s*)?(\d{1,2})(?!\d|[.,]\d)(?!\s*(?:l\b|liter|km|kilometer)))?/i);
    const price = t.match(/(\d[.,]\d{1,3})\s*(?:euro|€)?\s*(?:pro|je|\/)\s*liter/i);
    let liters = lit ? parseDeNumber(lit[1]) : null;
    let euros = null;
    if (eur) {
        euros = parseDeNumber(eur[1]);
        if (eur[2] && euros !== null && Number.isInteger(euros)) euros += Number(eur[2]) / 100;   // "72 Euro 50"
    }
    const ppl = price ? parseDeNumber(price[1]) : null;
    if (liters === null && euros !== null && ppl) liters = euros / ppl;
    if (euros === null && liters !== null && ppl) euros = liters * ppl;
    if (liters === null && euros === null) return null;
    const lower = t.toLowerCase();
    const full = !/(nicht voll|teilweise|nur teil|\bhalb\b|aufgefüllt|nachgefüllt)/.test(lower);
    const dayOffset = /\bvorgestern\b/.test(lower) ? 2 : /\bgestern\b/.test(lower) ? 1 : 0;
    const time = Date.now() - dayOffset * 86400000;
    return { liters: liters !== null ? Math.round(liters * 100) / 100 : null, euros: euros !== null ? Math.round(euros * 100) / 100 : null, odo: parseOdometer(t), full, time };
}

/* Verbrauch je Tankung (l/100 km) nach dem Standardverfahren; Rückgabe: Liste { entry, consumption } nur für Volltankungen mit Verbrauch */
function computeConsumptions(list) {
    const entries = [...list].sort((a, b) => (a.odo || 0) - (b.odo || 0) || a.time - b.time).filter(e => e.odo);
    const out = [];
    let lastFullOdo = null, litersSince = 0;
    entries.forEach(e => {
        litersSince += e.liters || 0;
        if (e.full !== false) {
            if (lastFullOdo !== null && e.odo > lastFullOdo && litersSince > 0) {
                out.push({ entry: e, consumption: litersSince / (e.odo - lastFullOdo) * 100 });
            }
            lastFullOdo = e.odo;
            litersSince = 0;
        }
    });
    return out;
}

const fmtDe = (n, digits) => Number(n).toFixed(digits).replace('.', ',');
const speakEuro = (n) => `${fmtDe(n, 2)} Euro`;
const MONTH_NAMES = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/* Zeitraum aus dem Satz: { from, to, label } */
function tankPeriodFromText(text) {
    const t = String(text || '').toLowerCase();
    const now = new Date();
    if (/letzte[nm]?\s+jahr/.test(t)) return { from: new Date(now.getFullYear() - 1, 0, 1).getTime(), to: new Date(now.getFullYear(), 0, 1).getTime(), label: `${now.getFullYear() - 1}` };
    if (/(dies\w*|laufend\w*|im)\s+jahr/.test(t) && !/monat/.test(t)) return { from: new Date(now.getFullYear(), 0, 1).getTime(), to: Infinity, label: `in diesem Jahr` };
    if (/insgesamt|gesamt|alles|bisher/.test(t)) return { from: 0, to: Infinity, label: 'insgesamt' };
    if (/(letzte[nm]?|vergangene[nm]?|vorige[nm]?)\s+monat/.test(t)) {
        const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        return { from: f.getTime(), to: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), label: `im ${MONTH_NAMES[f.getMonth()]}` };
    }
    return { from: new Date(now.getFullYear(), now.getMonth(), 1).getTime(), to: Infinity, label: `im ${MONTH_NAMES[now.getMonth()]}` };
}

function tankStats(list, period) {
    const inRange = list.filter(e => e.time >= period.from && e.time < period.to);
    const liters = inRange.reduce((s, e) => s + (e.liters || 0), 0);
    const euros = inRange.reduce((s, e) => s + (e.euros || 0), 0);
    const withOdo = list.filter(e => e.odo).sort((a, b) => a.odo - b.odo);
    const inOdo = withOdo.filter(e => e.time >= period.from && e.time < period.to);
    let km = null;
    if (inOdo.length) {
        const before = withOdo.filter(e => e.time < period.from).pop();   // letzter Stand vor dem Zeitraum, falls vorhanden
        const base = before ? before.odo : inOdo[0].odo;
        km = inOdo[inOdo.length - 1].odo - base;
    }
    return { count: inRange.length, liters, euros, km };
}

/* ---------- Befehle ---------- */
function handleTankbuchCommand(text) {
    const raw = String(text || '').trim();
    const t = raw.toLowerCase().replace(/[!?]+$/, '');
    if (!t || t.length > 200) return false;
    const done = (msg) => { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); return true; };

    // Sorte festlegen: "Ich fahre Diesel" / "Mein Auto tankt Super E10" / "Ich tanke immer Diesel"
    const setFuel = t.match(/\b(?:ich fahre|mein auto (?:fährt|tankt|braucht|läuft mit|läuft auf)|ich tanke(?: immer)?|ich fahre einen?)\s+(?:mit\s+)?(?:einen?\s+)?(diesel|super(?:\s*e?\s*(?:5|10))?|e\s*5|e\s*10|benzin)\b/);
    if (setFuel && !/\b(wo|günstig|billig|preis|gerade|heute|jetzt)\b/.test(t)) {
        const w = setFuel[1];
        const fuel = /diesel/.test(w) ? 'diesel' : /10/.test(w) ? 'e10' : /5/.test(w) ? 'e5' : /benzin/.test(w) ? 'e10' : /super/.test(w) ? 'e5' : null;   // "Super" allein = Super E5, "Benzin" = E10
        if (fuel) { setPreferredFuel(fuel); return done(`Gut, ich gehe künftig von ${FUEL_LABELS[fuel]} aus.`); }
    }
    if (/\b(welche|welchen|was für (?:eine|einen))\b.*\b(sorte|sprit|kraftstoff)\b.*\b(fahre|tanke|habe)\b|\bwas tanke ich\b/.test(t)) {
        return done(`Ich gehe von ${FUEL_LABELS[getPreferredFuel()]} aus.`);
    }

    // Kilometerstand nachtragen: "Kilometerstand 123456"
    const odoOnly = t.match(new RegExp('^(?:der\\s+|mein\\s+)?(?:kilometerstand|km-?stand|tachostand)\\s*(?:ist|liegt bei|beträgt|:)?\\s*' + KM_NUMBER + '\\s*(?:km|kilometer)?$', 'i'));
    if (odoOnly) {
        const list = loadTankbuch();
        const last = list.sort((a, b) => b.time - a.time).find(e => !e.odo);
        const odo = Math.round(parseDeNumber(odoOnly[1]) || 0);
        if (!last || !odo) return done('Dazu habe ich keine Tankung ohne Kilometerstand.');
        last.odo = odo;
        saveTankbuch(list);
        return done(`Kilometerstand ${odo} bei der letzten Tankung nachgetragen.${consumptionSentence(list, last)}`);
    }

    // Tankung eintragen
    const fuelEntry = (/\b(getankt|tankte|tankung|betankt|vollgetankt)\b/.test(t) && !/\b(wie viel|wieviel|was habe ich|wie oft)\b/.test(t) && !/\b(lösch\w*|entfern\w*|streich\w*|zeig\w*)\b/.test(t)) ? parseFuelEntry(raw) : null;
    if (fuelEntry) {
        const e = fuelEntry;
        const list = loadTankbuch();
        const entry = { id: Date.now() * 1000 + Math.floor(Math.random() * 1000), time: e.time, liters: e.liters, euros: e.euros, odo: e.odo, full: e.full, fuel: fuelFromWords(raw) || getPreferredFuel() };
        list.push(entry);
        saveTankbuch(list);
        const ppl = (entry.liters && entry.euros) ? ` Das sind ${fmtDe(entry.euros / entry.liters, 3)} Euro pro Liter.` : '';
        const head = `Notiert: ${entry.liters !== null ? fmtDe(entry.liters, 1) + ' Liter' : ''}${entry.liters !== null && entry.euros !== null ? ' für ' : ''}${entry.euros !== null ? speakEuro(entry.euros) : ''}.${ppl}`;
        const tail = entry.odo ? consumptionSentence(list, entry) : ' Mir fehlt noch der Kilometerstand für den Verbrauch, sagen Sie ihn einfach nach.';
        return done(head + tail + (entry.full === false ? ' Als Teiltankung vermerkt.' : ''));
    }

    // Letzte Tankung löschen
    if (/\b(lösch\w*|entfern\w*|streich\w*)\b/.test(t) && /\b(letzte[n]?|vorherige[n]?)\b/.test(t) && /\btank\w*/.test(t)) {
        const list = loadTankbuch().sort((a, b) => a.time - b.time);
        if (!list.length) return done('Das Tankbuch ist leer.');
        const gone = list.pop();
        saveTankbuch(list);
        return done(`Die letzte Tankung${gone.liters !== null ? ' mit ' + fmtDe(gone.liters, 1) + ' Litern' : ''} ist gelöscht.`);
    }

    // Anzeigen: "Zeig das Tankbuch"
    if (/\b(tankbuch|fahrtenbuch)\b/.test(t) && /\b(zeig\w*|öffne\w*|anzeig\w*|was steht)\b/.test(t)) {
        const list = loadTankbuch().sort((a, b) => b.time - a.time);
        if (!list.length) return done('Das Tankbuch ist noch leer. Sagen Sie zum Beispiel: Ich habe 40 Liter für 72 Euro getankt.');
        const cons = new Map(computeConsumptions(list).map(c => [c.entry.id, c.consumption]));
        const cards = list.slice(0, 5).map(e => ({
            icon: '⛽',
            title: `${new Date(e.time).toLocaleDateString('de-DE', { day: 'numeric', month: 'short', timeZone: 'Europe/Berlin' })} · ${e.liters !== null ? fmtDe(e.liters, 1) + ' l' : '?'} · ${e.euros !== null ? fmtDe(e.euros, 2) + ' €' : '?'}`,
            subtitle: `${e.odo ? e.odo + ' km' : 'ohne Kilometerstand'}${cons.has(e.id) ? ' · ' + fmtDe(cons.get(e.id), 1) + ' l/100 km' : ''}${e.full === false ? ' · Teiltankung' : ''}`
        }));
        if (typeof clearActionCards === 'function') clearActionCards();
        if (typeof showActionCards === 'function') showActionCards(cards);
        return done(`Hier die letzten ${cards.length} Tankungen.`);
    }

    // Verbrauch
    if (/\b(spritverbrauch|verbrauch)\b/.test(t)) {
        const cons = computeConsumptions(loadTankbuch());
        if (!cons.length) return done('Für den Verbrauch brauche ich mindestens zwei Volltankungen mit Kilometerstand.');
        const last = cons[cons.length - 1].consumption;
        const recent = cons.slice(-5);
        const avg = recent.reduce((s, c) => s + c.consumption, 0) / recent.length;
        return done(`Zuletzt ${fmtDe(last, 1)} Liter auf 100 Kilometer${recent.length > 1 ? `, im Schnitt der letzten ${recent.length} Tankungen ${fmtDe(avg, 1)}` : ''}.`);
    }

    // Kosten pro Kilometer
    if (/\b(kostet|kosten)\b/.test(t) && /\b(kilometer|km)\b/.test(t) && /\b(mich|mir|ein|jeder|pro)\b/.test(t)) {
        const st = tankStats(loadTankbuch(), tankPeriodFromText(t));
        if (!st.km || st.km <= 0 || !st.euros) return done('Dafür brauche ich Tankungen mit Kilometerstand und Preis im Zeitraum.');
        const perKm = st.euros / st.km;
        return done(`Ein Kilometer kostet Sie ${fmtDe(perKm, 2)} Euro an Sprit, hundert Kilometer ${speakEuro(perKm * 100)}.`);
    }

    // Gefahrene Kilometer
    if (/\b(wie viele|wieviele|wie viel|wieviel)\b/.test(t) && /\b(kilometer|km)\b/.test(t) && /\bgefahren\b/.test(t)) {
        const p = tankPeriodFromText(t);
        const st = tankStats(loadTankbuch(), p);
        if (st.km === null) return done('Dafür brauche ich Tankungen mit Kilometerstand in diesem Zeitraum.');
        const when = p.label === 'insgesamt' ? 'insgesamt' : (/^\d{4}$/.test(p.label) ? 'im Jahr ' + p.label : p.label);
        return done(`Laut Tankbuch sind Sie ${when} ${Math.round(st.km)} Kilometer gefahren.`);
    }

    // Wie viel getankt / ausgegeben
    if (/\b(getankt|tanken|sprit|benzin|diesel|tankkosten|ausgegeben)\b/.test(t) && /\b(wie viel|wieviel|was habe ich|wie oft|was hat)\b/.test(t) && /\b(getankt|ausgegeben|gekostet|verbraucht)\b/.test(t)) {
        const p = tankPeriodFromText(t);
        const st = tankStats(loadTankbuch(), p);
        if (!st.count) return done(`Für ${p.label.replace(/^im /, '')} ist nichts im Tankbuch.`);
        const ppl = st.liters ? ` Im Schnitt ${fmtDe(st.euros / st.liters, 2)} Euro pro Liter.` : '';
        return done(`${p.label.charAt(0).toUpperCase() + p.label.slice(1)}: ${st.count} ${st.count === 1 ? 'Tankung' : 'Tankungen'}, ${fmtDe(st.liters, 1)} Liter, ${speakEuro(st.euros)}.${ppl}`);
    }
    return false;
}

function consumptionSentence(list, entry) {
    const hit = computeConsumptions(list).find(c => c.entry.id === entry.id);
    return hit ? ` Verbrauch seit der letzten Volltankung: ${fmtDe(hit.consumption, 1)} Liter auf 100 Kilometer.` : '';
}
