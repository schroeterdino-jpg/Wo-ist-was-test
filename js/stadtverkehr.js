/* ============================================================
   STADTVERKEHR: ergänzt die Staumeldungen bei "Route zu X" / "Wann muss ich losfahren" um Meldungen von Landstraßen und aus der Stadt (TomTom).
   Bisher kamen die Meldungen nur von den Autobahnen (autobahn.de). Jetzt zusätzlich: Unfälle, Stau, Sperrungen, Baustellen mit Verzögerung und Pannenfahrzeuge,
   die höchstens ~1,2 km von der berechneten Fahrstrecke entfernt liegen. Gesprochen als Zusatz ("Außerdem gemeldet: ..."), dazu Karten, und die Punkte erscheinen auf der HUD-Karte.
   ZWISCHENPUNKT FÜRS ARBEITSWEG: Sagst du "Ich fahre zur Arbeit über Lanken", rechnet Jarvis jede Fahrt zur Arbeitsadresse in zwei Teilen (hier -> Lanken -> Arbeit), damit die Route (und damit Fahrzeit,
   Briefing, Karte und Staumeldungen "auf deinem Arbeitsweg") zu deinem echten Weg passt. Aus: "Arbeitsweg ohne Zwischenpunkt". Der Ort wird in deiner Nähe gesucht (mehrere gleichnamige Orte). Gilt nur für Fahrten zur gespeicherten Arbeitsadresse.
   GOOGLE-ROUTE: Fahrten zur Arbeit holt Jarvis zuerst von der Google Routes API (api/maps.js, ?google=1; Vercel-Variable GOOGLE_MAPS_API_KEY, Redis für den Monatszähler, Limit 4000/Monat).
   Klappt das nicht (kein Schlüssel, Limit erreicht, Fehler), gilt der Zwischenpunkt, und ohne den die normale OSRM-Route.
   Braucht: api/stau.js (?traffic=1) und die Vercel-Variable TOMTOM_API_KEY. Fehlt sie oder ist TomTom nicht erreichbar, bleibt alles wie vorher (nur Autobahn).
   Braucht außerdem travel.js (routeDurationSeconds, describeAutobahnStau, lastStau*), muss danach geladen werden.
   ============================================================ */
(function () {
    'use strict';
    if (window.__jvStadtverkehr) return;
    const origRoute = window.routeDurationSeconds, origDesc = window.describeAutobahnStau;
    if (typeof origRoute !== 'function' || typeof origDesc !== 'function') return;
    window.__jvStadtverkehr = true;
    let routeCoords = null;

    const VIA_KEY = 'jv_arbeit_via';
    const pd = (k, d) => { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) ?? d); } catch (e) { return d; } };
    const sd = (k, v) => { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) {} };
    const sagen = t => { try { if (typeof speak === 'function') speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} };
    const viaCache = {};

    // Ort suchen und von mehreren Treffern den nächsten zum Standort nehmen
    async function sucheOrt(name, nahLat, nahLon) {
        try {
            const r = await apiFetch('/api/geocode?q=' + encodeURIComponent(name));
            if (!r.ok) return null;
            const d = await r.json();
            if (!Array.isArray(d) || !d.length) return null;
            const list = d.map(x => ({ lat: Number(x.lat), lon: Number(x.lon) })).filter(x => isFinite(x.lat) && isFinite(x.lon));
            if (!list.length) return null;
            if (nahLat === undefined) return list[0];
            return list.sort((a, b) => km(a.lat, a.lon, nahLat, nahLon) - km(b.lat, b.lon, nahLat, nahLon))[0];
        } catch (e) { return null; }
    }

    // Fahrten zur Arbeit mit Zwischenpunkt in zwei Teilen rechnen, sonst unverändert
    async function mitZwischenpunkt(args) {
        const [fLat, fLon, tLat, tLon] = args;
        const via = pd(VIA_KEY, '');
        if (!via || typeof workAddress !== 'string' || !workAddress || typeof geocodeAddress !== 'function') return null;
        try {
            const w = await geocodeAddress(workAddress);
            if (!w || km(w.lat, w.lon, tLat, tLon) > 0.5 || km(w.lat, w.lon, fLat, fLon) < 8) return null;   // nur Fahrten ZUR Arbeit, nicht von dort
            const ck = via + '|' + fLat.toFixed(2) + ',' + fLon.toFixed(2);
            const v = viaCache[ck] || (viaCache[ck] = await sucheOrt(via, fLat, fLon));
            if (!v || km(v.lat, v.lon, fLat, fLon) < 1 || km(v.lat, v.lon, tLat, tLon) < 1 || km(v.lat, v.lon, fLat, fLon) > 60) return null;
            const a = await origRoute(fLat, fLon, v.lat, v.lon), b = await origRoute(v.lat, v.lon, tLat, tLon);
            if (!a || !b) return null;
            const ab = [].concat(a.autobahnen || [], b.autobahnen || []).filter((x, i, arr) => arr.indexOf(x) === i);
            return { seconds: a.seconds + b.seconds, meters: a.meters + b.meters, autobahnen: ab, coords: (a.coords && b.coords) ? a.coords.concat(b.coords) : null };
        } catch (e) { if (e && e.auth) throw e; return null; }
    }

    // Fahrten zur Arbeit: Route von Google (wie in der Google-Maps-App, mit aktuellem Verkehr). Der Server nutzt dafür den Google-Schlüssel,
    // zählt mit (Monatslimit) und merkt sich Ergebnisse 10 Minuten. Ohne Schlüssel, bei Limit oder Fehler: null, dann geht es wie bisher weiter.
    const arbeitGeo = {};
    async function mitGoogle(args) {
        const [fLat, fLon, tLat, tLon] = args;
        if (typeof workAddress !== 'string' || !workAddress || typeof geocodeAddress !== 'function') return null;
        if (window.__jvGoogleAus) return null;
        try {
            const w = arbeitGeo[workAddress] || (arbeitGeo[workAddress] = await geocodeAddress(workAddress));
            if (!w || km(w.lat, w.lon, tLat, tLon) > 0.5 || km(w.lat, w.lon, fLat, fLon) < 3) return null;   // nur Fahrten ZUR Arbeit
            const res = await apiFetch(`/api/route?fromLat=${fLat}&fromLon=${fLon}&toLat=${tLat}&toLon=${tLon}&geometry=1&google=1`);
            if (!res.ok) return null;
            const data = await res.json();
            const r = data && data.quelle === 'google' && data.routes && data.routes[0];
            if (!r || !isFinite(r.duration)) return null;
            const coords = (r.geometry && Array.isArray(r.geometry.coordinates)) ? r.geometry.coordinates.map(c => [c[1], c[0]]) : null;
            const ab = typeof extractAutobahnRefs === 'function' ? extractAutobahnRefs(r) : [];
            return { seconds: r.duration, meters: r.distance, autobahnen: ab, coords, quelle: 'google' };
        } catch (e) { if (e && e.auth) throw e; return null; }
    }

    // merkt sich den Linienverlauf der zuletzt berechneten Route ([Breite, Länge]-Paare)
    window.routeDurationSeconds = async function () {
        const args = Array.from(arguments);
        let r = await mitGoogle(args);
        if (!r) r = await mitZwischenpunkt(args);
        if (!r) r = await origRoute.apply(this, arguments);
        routeCoords = r && Array.isArray(r.coords) && r.coords.length > 1 ? r.coords : null;
        return r;
    };

    const km = (la1, lo1, la2, lo2) => {
        const R = 6371, t = d => d * Math.PI / 180, dLa = t(la2 - la1), dLo = t(lo2 - lo1);
        const a = Math.sin(dLa / 2) ** 2 + Math.cos(t(la1)) * Math.cos(t(la2)) * Math.sin(dLo / 2) ** 2;
        return R * 2 * Math.asin(Math.sqrt(a));
    };
    function distToLine(lat, lon, pts) {
        let best = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1];
            const kx = Math.cos(lat * Math.PI / 180), ax = (a[1] - lon) * kx, ay = a[0] - lat, bx = (b[1] - lon) * kx, by = b[0] - lat;
            const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
            let t = L > 0 ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
            const d = Math.hypot(ax + t * dx, ay + t * dy) * 111.2;
            if (d < best) best = d;
        }
        return best;
    }

    async function stadtMeldungen(fLat, fLon, tLat, tLon) {
        let pts = routeCoords;
        if (!pts) pts = [[fLat, fLon], [tLat, tLon]];
        if (pts.length > 400) { const step = Math.ceil(pts.length / 400); pts = pts.filter((_, i) => i % step === 0 || i === pts.length - 1); }
        const lats = pts.map(p => p[0]), lons = pts.map(p => p[1]), pad = 0.02;
        const bbox = [Math.min(...lons) - pad, Math.min(...lats) - pad, Math.max(...lons) + pad, Math.max(...lats) + pad].map(n => n.toFixed(5)).join(',');
        let d;
        try {
            const r = await apiFetch('/api/stau?traffic=1&bbox=' + bbox);
            if (!r.ok) return null;
            d = await r.json();
        } catch (e) { return null; }
        if (!d || !Array.isArray(d.incidents)) return null;
        const doppelt = (i) => (typeof lastStauWarnings !== 'undefined' ? lastStauWarnings : []).some(w => km(w.lat, w.lon, i.lat, i.lon) < 1.5);
        const wichtig = d.incidents.filter(i => ![4, 10].includes(i.kategorie) && (i.stufe >= 2 || i.verzoegerung_s >= 120 || [1, 8].includes(i.kategorie)))
            .filter(i => distToLine(i.lat, i.lon, pts) <= 1.2 && !doppelt(i))
            .sort((a, b) => (b.verzoegerung_s - a.verzoegerung_s) || (b.stufe - a.stufe)).slice(0, 3);
        return wichtig;
    }

    if (window.jvCommands) {
        window.jvCommands.use('arbeitsweg-via', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (t.length > 80) return next(text);
            if (/^(?:jarvis )?(?:mein )?(?:arbeitsweg|weg zur arbeit) (?:ohne (?:zwischenpunkt|zwischenstopp|umweg)|normal|zurücksetzen)$|^(?:jarvis )?(?:zwischenpunkt|umweg) (?:löschen|entfernen|aus)$/.test(t)) {
                sd(VIA_KEY, ''); sagen('Gut, ich berechne den Arbeitsweg wieder ohne Zwischenpunkt.'); return true;
            }
            const m = t.match(/^(?:jarvis )?(?:ich fahre? |ich fahr |mein |der )?(?:zur arbeit |arbeitsweg |weg zur arbeit )(?:geht |führt |läuft |fahre ich )?(?:immer )?über (.{2,40})$/);
            if (!m) return next(text);
            const ort = m[1].replace(/\b(?:bitte|immer|und dann weiter)\b/g, '').trim().replace(/\b\w/g, c => c.toUpperCase());
            (async () => {
                const hit = await sucheOrt(ort);
                if (!hit) { sagen('Den Ort ' + ort + ' habe ich nicht gefunden. Sag es bitte noch einmal.'); return; }
                sd(VIA_KEY, ort);
                Object.keys(viaCache).forEach(k => delete viaCache[k]);
                sagen('Gut, dein Arbeitsweg führt jetzt über ' + ort + '.');
            })();
            return true;
        }, 145);
    }

    window.describeAutobahnStau = async function (autobahnen, fLat, fLon, tLat, tLon) {
        let text = await origDesc.apply(this, arguments);
        try {
            const w = await stadtMeldungen(fLat, fLon, tLat, tLon);
            if (w && w.length) {
                const teile = w.map(i => {
                    const wo = i.von && i.nach && i.von !== i.nach ? ' zwischen ' + i.von + ' und ' + i.nach : (i.von ? ' bei ' + i.von : '');
                    const min = Math.round(i.verzoegerung_s / 60);
                    return i.art + (i.strassen && i.strassen[0] ? ' auf der ' + i.strassen[0] : '') + wo + (min >= 2 ? ', etwa ' + min + ' Minuten länger' : '');
                });
                text += ' Außerdem gemeldet: ' + teile.join('; ') + '.';
                const ICON = { 'Unfall': '🚨', 'Stau': '🚦', 'Sperrung': '⛔', 'Fahrstreifen gesperrt': '🚧', 'Baustelle': '🚧', 'Pannenfahrzeug': '🚗', 'Gefahrenstelle': '⚠️', 'Glätte': '❄️', 'Nebel': '🌫️', 'Überflutung': '🌊' };
                w.forEach((i, k) => {
                    lastStauWarnings.push({ lat: i.lat, lon: i.lon, road: (i.strassen && i.strassen[0]) || 'Stadt', title: teile[k], text: i.text || '' });
                    lastStauCards.push({
                        icon: ICON[i.art] || '⚠️',
                        title: i.art + ' · ' + ((i.strassen && i.strassen[0]) || (i.von || 'Strecke')),
                        subtitle: (i.von ? i.von + (i.nach ? ' → ' + i.nach : '') : (i.text || 'Verkehrsmeldung')) + (i.verzoegerung_s >= 120 ? ' · +' + Math.round(i.verzoegerung_s / 60) + ' min' : ''),
                        href: 'https://www.google.com/maps?q=' + i.lat + ',' + i.lon
                    });
                });
                if (typeof lastStauText !== 'undefined') lastStauText = text;
            }
        } catch (e) { console.error('Stadtverkehr', e); }
        return text;
    };
})();
