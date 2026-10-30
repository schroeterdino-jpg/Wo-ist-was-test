/* ============================================================
   STADTVERKEHR: ergänzt die Staumeldungen bei "Route zu X" / "Wann muss ich losfahren" um Meldungen von Landstraßen und aus der Stadt (TomTom).
   Bisher kamen die Meldungen nur von den Autobahnen (autobahn.de). Jetzt zusätzlich: Unfälle, Stau, Sperrungen, Baustellen mit Verzögerung und Pannenfahrzeuge,
   die höchstens ~1,2 km von der berechneten Fahrstrecke entfernt liegen. Gesprochen als Zusatz ("Außerdem gemeldet: ..."), dazu Karten, und die Punkte erscheinen auf der HUD-Karte.
   ZWISCHENPUNKT FÜRS ARBEITSWEG: Sagst du "Ich fahre zur Arbeit über Lanken", rechnet Zane jede Fahrt zur Arbeitsadresse in zwei Teilen (hier -> Lanken -> Arbeit), damit die Route (und damit Fahrzeit,
   Briefing, Karte und Staumeldungen "auf deinem Arbeitsweg") zu deinem echten Weg passt. Aus: "Arbeitsweg ohne Zwischenpunkt". Der Ort wird in deiner Nähe gesucht (mehrere gleichnamige Orte). Gilt nur für Fahrten zur gespeicherten Arbeitsadresse.
   GOOGLE-ROUTE: Fahrten zur Arbeit holt Zane zuerst von der Google Routes API (api/maps.js, ?google=1; Vercel-Variable GOOGLE_MAPS_API_KEY, Redis für den Monatszähler, Limit 4000/Monat).
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

    // Alle Fahrten (Arbeit, Termine, Besuche): Route von Google (wie in der Google-Maps-App, mit aktuellem Verkehr). Der Server nutzt dafür den Google-Schlüssel,
    // zählt mit (Monatslimit) und merkt sich Ergebnisse 10 Minuten. Ohne Schlüssel, bei Limit oder Fehler: null, dann geht es wie bisher weiter.
    const arbeitGeo = {};
    async function mitGoogle(args) {
        const [fLat, fLon, tLat, tLon] = args;
        if (window.__jvGoogleAus) return null;
        try {
            if (km(fLat, fLon, tLat, tLon) < 1) return null;   // ganz kurze Wege nicht über Google rechnen (spart das Monatslimit); alle anderen Fahrten schon, nicht nur die zur Arbeit
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
    /* Schwere einer TomTom-Meldung (klein = wichtiger): 0 Sperrung (auch Stufe 4) und Unfall, 1 Gefahrenstelle, Fahrstreifen gesperrt, große Verzögerung, 2 der Rest.
       Eine Sperrung meldet TomTom oft mit 0 Sekunden Verzögerung; nach Sekunden allein fiele sie hinter kleine Staus. */
    const schwere = i => ([1, 8].includes(i.kategorie) || i.stufe >= 4) ? 0 : ([3, 7].includes(i.kategorie) || i.stufe === 3) ? 1 : 2;

    /* Phase 2: Abstand und Klasse (auf / nahe) kommen aus routenRelevanz (travel.js). Ohne echten Linienverlauf gilt nur die Luftlinie Start-Ziel: dann bleibt es
       beim bisherigen Streifen und keine Meldung gilt als belegt "auf" oder "nahe" der Route (Klasse "gebiet"). */
    async function stadtMeldungen(fLat, fLon, tLat, tLon, linie) {
        const echt = !!(linie && linie.length > 1);
        let pts = echt ? linie : [[fLat, fLon], [tLat, tLon]];
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
        const bekannt = (typeof lastStauWarnings !== 'undefined' ? lastStauWarnings : []).concat(typeof lastStauNahe !== 'undefined' ? lastStauNahe : []);
        const doppelt = (i) => bekannt.some(w => km(w.lat, w.lon, i.lat, i.lon) < 1.5);
        const ordnen = l => l.sort((a, b) => (schwere(a) - schwere(b)) || (b.verzoegerung_s - a.verzoegerung_s) || (b.stufe - a.stufe));   // erst Schwere (Sperrung/Unfall zuerst), dann Verzögerung
        const mitKlasse = d.incidents.filter(i => ![4, 10].includes(i.kategorie) && (i.stufe >= 2 || i.verzoegerung_s >= 120 || [1, 8].includes(i.kategorie)))
            .map(i => { const r = routenRelevanz(i.lat, i.lon, pts); return { i, ok: r.km <= ([7, 8].includes(i.kategorie) ? ROUTE_AUF_KM : ROUTE_NAHE_KM), klasse: echt ? r.klasse : 'gebiet' }; })   // Sperrungen nur, wenn sie wirklich auf der Strecke liegen (Google fährt um sie herum)
            .filter(x => x.ok && !doppelt(x.i)).map(x => Object.assign({}, x.i, { klasse: x.klasse }));
        return { auf: ordnen(mitKlasse.filter(i => i.klasse !== 'nahe')).slice(0, 3), neben: ordnen(mitKlasse.filter(i => i.klasse === 'nahe')).slice(0, 2) };
    }

    if (window.jvCommands) {
        window.jvCommands.use('arbeitsweg-via', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (t.length > 80) return next(text);
            if (/^(?:(?:jarvis|zane) )?(?:mein )?(?:arbeitsweg|weg zur arbeit) (?:ohne (?:zwischenpunkt|zwischenstopp|umweg)|normal|zurücksetzen)$|^(?:(?:jarvis|zane) )?(?:zwischenpunkt|umweg) (?:löschen|entfernen|aus)$/.test(t)) {
                sd(VIA_KEY, ''); sagen('Gut, ich berechne den Arbeitsweg wieder ohne Zwischenpunkt.'); return true;
            }
            const m = t.match(/^(?:(?:jarvis|zane) )?(?:ich fahre? |ich fahr |mein |der )?(?:zur arbeit |arbeitsweg |weg zur arbeit )(?:geht |führt |läuft |fahre ich )?(?:immer )?über (.{2,40})$/);
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

    window.describeAutobahnStau = async function (autobahnen, fLat, fLon, tLat, tLon, coords) {
        window.jvStauMin = 0;   // Minuten Verzögerung durch Meldungen auf der Strecke (travel.js rechnet sie in die Abfahrtszeit ein)
        const linie = Array.isArray(coords) && coords.length > 1 ? coords : routeCoords;   // dieselbe Linie für autobahn.de (travel.js) und TomTom
        let text = await origDesc.call(this, autobahnen, fLat, fLon, tLat, tLon, linie);
        try {
            const erg = await stadtMeldungen(fLat, fLon, tLat, tLon, linie), w = erg ? erg.auf : [], neben = erg ? erg.neben : [];
            if (w.length || neben.length) {
                window.jvStauMin = Math.min(60, w.reduce((s, i) => s + (i.verzoegerung_s >= 120 ? Math.round(i.verzoegerung_s / 60) : 0), 0));   // nur Meldungen auf der Route verlängern die Fahrt
                // TomTom nennt bei Autobahn-Ausfahrten oft nur "Abfahrt [8a]" ohne Straße: dann die Autobahn der Route nehmen (wenn es nur eine gibt) und die eckigen Klammern weglassen
                const sauber = s => String(s || '').replace(/\[([^\]]+)\]/g, '$1').trim();
                const strasse = i => (i.strassen && i.strassen[0]) || ((/^(?:abfahrt|ausfahrt|auffahrt|anschlussstelle|as)\b/i.test(sauber(i.von)) && Array.isArray(autobahnen) && autobahnen.length === 1) ? autobahnen[0] : '');
                const teilText = i => {
                    const von = sauber(i.von), nach = sauber(i.nach);
                    const wo = von && nach && von !== nach ? ' zwischen ' + von + ' und ' + nach : (von ? ' bei ' + von : '');
                    const min = Math.round(i.verzoegerung_s / 60);
                    return i.art + (strasse(i) ? ' auf der ' + strasse(i) : '') + wo + (min >= 2 ? ', etwa ' + min + ' Minuten länger' : '');
                };
                const teile = w.map(teilText), nebenTeile = neben.map(teilText);
                if (teile.length) text += ' Außerdem gemeldet: ' + teile.join('; ') + '.';
                if (nebenTeile.length) text += ' Außerdem gemeldet, nahe deiner Route: ' + nebenTeile.join('; ') + '.';
                const ICON = { 'Unfall': '🚨', 'Stau': '🚦', 'Sperrung': '⛔', 'Fahrstreifen gesperrt': '🚧', 'Baustelle': '🚧', 'Pannenfahrzeug': '🚗', 'Gefahrenstelle': '⚠️', 'Glätte': '❄️', 'Nebel': '🌫️', 'Überflutung': '🌊' };
                w.forEach((i, k) => {
                    lastStauWarnings.push({ lat: i.lat, lon: i.lon, road: strasse(i) || 'Stadt', klasse: i.klasse, title: teile[k], text: i.text || '' });
                    lastStauCards.push({
                        icon: ICON[i.art] || '⚠️',
                        title: i.art + ' · ' + (strasse(i) || sauber(i.von) || 'Strecke'),
                        subtitle: (i.von ? sauber(i.von) + (i.nach ? ' → ' + sauber(i.nach) : '') : (i.text || 'Verkehrsmeldung')) + (i.verzoegerung_s >= 120 ? ' · +' + Math.round(i.verzoegerung_s / 60) + ' min' : ''),
                        href: 'https://www.google.com/maps?q=' + i.lat + ',' + i.lon
                    });
                });
                neben.forEach(i => lastStauCards.push({   // nur NAHE der Route: Karte ja, aber nicht in lastStauWarnings (Karte/Lagebild/Kacheln zählen nur Meldungen auf der Route)
                    icon: ICON[i.art] || '⚠️',
                    title: i.art + ' · ' + (strasse(i) || sauber(i.von) || 'Strecke') + ' · nahe der Route',
                    subtitle: (i.von ? sauber(i.von) + (i.nach ? ' → ' + sauber(i.nach) : '') : (i.text || 'Verkehrsmeldung')) + (i.verzoegerung_s >= 120 ? ' · +' + Math.round(i.verzoegerung_s / 60) + ' min' : ''),
                    href: 'https://www.google.com/maps?q=' + i.lat + ',' + i.lon
                }));
                if (typeof lastStauText !== 'undefined') lastStauText = text;
            }
        } catch (e) { console.error('Stadtverkehr', e); }
        return text;
    };
})();
