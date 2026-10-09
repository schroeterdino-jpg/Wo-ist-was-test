/* ============================================================
   STADTVERKEHR: ergänzt die Staumeldungen bei "Route zu X" / "Wann muss ich losfahren" um Meldungen von Landstraßen und aus der Stadt (TomTom).
   Bisher kamen die Meldungen nur von den Autobahnen (autobahn.de). Jetzt zusätzlich: Unfälle, Stau, Sperrungen, Baustellen mit Verzögerung und Pannenfahrzeuge,
   die höchstens ~1,2 km von der berechneten Fahrstrecke entfernt liegen. Gesprochen als Zusatz ("Außerdem gemeldet: ..."), dazu Karten, und die Punkte erscheinen auf der HUD-Karte.
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

    // merkt sich den Linienverlauf der zuletzt berechneten Route ([Breite, Länge]-Paare)
    window.routeDurationSeconds = async function () {
        const r = await origRoute.apply(this, arguments);
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
