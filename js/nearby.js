/* ============================================================
   NEARBY: Restaurants und Lokale in der Nähe
   Nutzt OpenStreetMap-Daten über Overpass (kostenlos, ohne API-Schlüssel), über den eigenen Server geleitet.
   Braucht: briefing.js (fetchUserLocationData), lists.js (userError), places.js (buildMapsLink), storage.js (apiFetch)
   ============================================================ */

const CUISINE_MAP = {
    chinesisch: 'chinese', chinesische: 'chinese', china: 'chinese',
    italienisch: 'italian', italienische: 'italian',
    griechisch: 'greek', griechische: 'greek',
    tuerkisch: 'turkish',
    indisch: 'indian', indische: 'indian',
    thailaendisch: 'thai', thai: 'thai',
    japanisch: 'japanese', sushi: 'japanese|sushi',
    vietnamesisch: 'vietnamese',
    mexikanisch: 'mexican',
    amerikanisch: 'american',
    deutsch: 'german',
    vegan: 'vegan',
    vegetarisch: 'vegetarian',
    pizza: 'pizza',
    doener: 'kebab', kebab: 'kebab',
    burger: 'burger',
    asiatisch: 'asian',
    spanisch: 'spanish',
    franzoesisch: 'french',
    libanesisch: 'lebanese',
    arabisch: 'arabic',
    koreanisch: 'korean'
};

/* Aus einem Satz das erste passende Küchen-Stichwort herausziehen (für den erzwungenen Sprachbefehl-Trigger) */
function extractCuisineKeyword(text) {
    const nk = normalizeKey(text || '');
    const hit = Object.keys(CUISINE_MAP).find(k => nk.includes(k));
    return hit || '';
}
const NEARBY_GENERIC_WORDS = ['restaurant', 'restaurants', 'essen', 'food', 'lokal', 'gaststaette', 'gaststätte', 'imbiss', 'was', 'etwas', 'lokale'];

/* Aus dem Suchbegriff einen Overpass-Filter machen: bekannte Küche -> passendes OSM-Tag, sonst der Begriff selbst */
function cuisineFilterFor(query) {
    const key = normalizeKey(query || '');
    if (!key || NEARBY_GENERIC_WORDS.includes(key)) return null;
    if (CUISINE_MAP[key]) return CUISINE_MAP[key];
    const safe = String(query).replace(/[^a-zA-Z0-9äöüÄÖÜß ]/g, '').trim();
    return safe || null;
}

function haversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371, toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1), dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(a));
}

function buildOverpassQuery(lat, lon, radiusM, cuisine) {
    const c = cuisine ? `["cuisine"~"${cuisine}",i]` : '';
    return `[out:json][timeout:12];(node["amenity"~"restaurant|fast_food"]${c}(around:${radiusM},${lat},${lon});way["amenity"~"restaurant|fast_food"]${c}(around:${radiusM},${lat},${lon}););out center 20;`;
}

async function overpassSearch(lat, lon, radiusM, cuisine) {
    const res = await apiFetch('/api/overpass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: buildOverpassQuery(lat, lon, radiusM, cuisine) })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data && data.elements) || [];
}

function placeFromElement(el, userLat, userLon) {
    const t = el.tags || {};
    if (!t.name) return null;
    const lat = el.lat !== undefined ? el.lat : (el.center && el.center.lat);
    const lon = el.lon !== undefined ? el.lon : (el.center && el.center.lon);
    if (lat === undefined || lon === undefined) return null;
    const strasse = [t['addr:street'], t['addr:housenumber']].filter(Boolean).join(' ');
    return { name: t.name, strasse, distanzKm: haversineKm(userLat, userLon, lat, lon), lat, lon };
}

const distText = km => km < 1 ? Math.round(km * 1000) + ' Meter' : km.toFixed(1).replace('.', ',') + ' km';

async function findNearbyRestaurants(query) {
    const loc = await fetchUserLocationData();
    if (!loc || loc.fehler || loc.latitude === undefined) throw userError('Ihren Standort konnte ich gerade nicht ermitteln. Ist der Standortzugriff erlaubt?');

    const cuisine = cuisineFilterFor(query);
    let elements;
    try {
        elements = await overpassSearch(loc.latitude, loc.longitude, 2000, cuisine);
    } catch (e) {
        if (e && e.auth) throw e;
        elements = null;
    }
    if (elements === null) throw userError('Die Suche nach Restaurants konnte gerade nicht durchgeführt werden.');

    let places = elements.map(el => placeFromElement(el, loc.latitude, loc.longitude)).filter(Boolean);
    let radiusUsed = 2;
    if (places.length === 0) {
        try { elements = await overpassSearch(loc.latitude, loc.longitude, 5000, cuisine); } catch (e) { elements = []; }
        places = (elements || []).map(el => placeFromElement(el, loc.latitude, loc.longitude)).filter(Boolean);
        radiusUsed = 5;
    }

    places.sort((a, b) => a.distanzKm - b.distanzKm);
    const top = places.slice(0, 5);

    if (top.length === 0) {
        const art = query ? `zu "${query}" ` : '';
        return { reply: `In der Nähe (bis ${radiusUsed} km) habe ich leider nichts ${art}gefunden.`, cards: [] };
    }

    const namen = top.slice(0, 3).map(p => `${p.name}${p.strasse ? ' (' + p.strasse + ')' : ''}, ${distText(p.distanzKm)}`);
    const reply = `In der Nähe gibt es zum Beispiel ${namen.join('; ')}.`;

    const cards = top.map(p => ({
        icon: '🍽️',
        title: p.name,
        subtitle: distText(p.distanzKm) + (p.strasse ? ' · ' + p.strasse : ''),
        href: buildMapsLink(p.strasse ? `${p.name}, ${p.strasse}` : p.name, '', p.distanzKm < 1.2 ? 'walking' : 'driving')
    }));

    return { reply, cards };
}

/* --- Test für die Einstellungen --- */
async function diagnoseNearby(query, log) {
    log('Suchbegriff: ' + (query || '(keiner, alle Restaurants)'));
    log('Standort wird ermittelt ...');
    let loc;
    try { loc = await fetchUserLocationData(); } catch (e) { log('❌ Standort-Fehler: ' + e.message); return; }
    if (!loc || loc.fehler || loc.latitude === undefined) { log('❌ Standort nicht verfügbar' + (loc && loc.fehler ? ': ' + loc.fehler : '')); return; }
    log(`✅ Standort: ${loc.latitude.toFixed(4)}, ${loc.longitude.toFixed(4)}`);

    const cuisine = cuisineFilterFor(query);
    log(cuisine ? `Küchen-Filter: "${cuisine}"` : 'Kein Küchen-Filter (alle Restaurants)');

    log('Overpass-Anfrage (/api/overpass) läuft, kann etwas dauern ...');
    let res;
    try {
        res = await apiFetch('/api/overpass', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: buildOverpassQuery(loc.latitude, loc.longitude, 2000, cuisine) }) });
    } catch (e) {
        log('❌ ' + (e && e.userMessage ? e.userMessage : 'Keine Verbindung zum Server.'));
        return;
    }
    const raw = await res.text();
    log('Antwort: Status ' + res.status);
    let data;
    try { data = JSON.parse(raw); } catch (e) { log('❌ Die Antwort war kein JSON: ' + raw.slice(0, 200).replace(/\s+/g, ' ')); return; }
    if (!res.ok) { log('❌ Fehler: ' + (data.error || JSON.stringify(data)).toString().slice(0, 250)); return; }

    const places = (data.elements || []).map(el => placeFromElement(el, loc.latitude, loc.longitude)).filter(Boolean);
    places.sort((a, b) => a.distanzKm - b.distanzKm);
    log(`✅ ${places.length} Treffer im Umkreis von 2 km`);
    places.slice(0, 5).forEach(p => log(`  • ${p.name} · ${distText(p.distanzKm)}${p.strasse ? ' · ' + p.strasse : ''}`));
    log('Fertig.');
}

async function runNearbyDiagnosis() {
    const out = document.getElementById('nearbyDiagOutput');
    const input = document.getElementById('nearbyDiagInput');
    const lines = [];
    const log = (t) => { lines.push(t); if (out) { out.textContent = lines.join('\n'); out.classList.remove('hidden'); } };
    try { await diagnoseNearby(input ? input.value : '', log); }
    catch (e) { log('❌ Unerwarteter Fehler: ' + (e && e.message ? e.message : e)); }
}
