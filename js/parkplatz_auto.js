/* ============================================================
   PARKPLATZ AUTOMATISCH: Trennt sich das Handy vom Auto (Bluetooth, in den Jarvis-Einstellungen gewählt), merkt sich die App den Standort.
   Diese Datei holt ihn ab (ZaneNative.holeParkplatz), schlägt die Adresse nach und speichert ihn wie "Merk dir, wo ich geparkt habe".
   Regeln: Ist der Punkt höchstens 150 m von zu Hause, wird nichts gespeichert. Ein später von Hand gespeicherter Parkplatz wird nicht überschrieben.
   Braucht: places.js (reverseGeocodeWithHouseNumber, parkingSpot), travel.js (geocodeAddress), storage.js (setPersistentData).
   ============================================================ */
(function () {
    function N() { return window.ZaneNative || null; }
    function meter(a, b) {
        const R = 6371000, rad = Math.PI / 180, dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
        const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    async function zuHause(p) {
        try {
            const h = (typeof homeAddress === 'string') ? homeAddress : (homeAddress && (homeAddress.address || homeAddress.text || homeAddress.label)) || '';
            if (!h || typeof geocodeAddress !== 'function') return false;
            const g = await Promise.race([geocodeAddress(h), new Promise(r => setTimeout(() => r(null), 6000))]);
            return !!g && meter({ lat: p.lat, lon: p.lon }, g) <= 150;
        } catch (e) { return false; }
    }
    let laeuft = false;
    async function holen() {
        if (laeuft) return;
        const n = N();
        if (!n || typeof n.holeParkplatz !== 'function') return;
        laeuft = true;
        try {
            const s = String(n.holeParkplatz() || '');
            if (!s) return;
            const o = JSON.parse(s);
            if (!Number.isFinite(o.lat) || !Number.isFinite(o.lon)) return;
            const at = Number(o.at) || Date.now();
            if (typeof parkingSpot !== 'undefined' && parkingSpot && Date.parse(parkingSpot.gespeichert) > at) return;   // von Hand gespeichert, neuer als das hier
            if (await zuHause(o)) return;
            let adresse = null;
            try { adresse = await reverseGeocodeWithHouseNumber(o.lat, o.lon); } catch (e) { }
            if (!adresse) adresse = 'Koordinaten ' + o.lat.toFixed(5) + ', ' + o.lon.toFixed(5);
            parkingSpot = { lat: o.lat, lon: o.lon, adresse: adresse, notiz: 'automatisch gemerkt (Auto getrennt)', gespeichert: new Date(at).toISOString() };
            setPersistentData('helfer_parking', JSON.stringify(parkingSpot));
            try { renderAllLists(); } catch (e) { }
            if (Date.now() - at < 20 * 60000 && !document.hidden && typeof speak === 'function' && !(typeof isSpeaking === 'function' && isSpeaking())) {
                speak('Ich habe mir gemerkt, wo du geparkt hast: ' + adresse + '.');
            }
        } catch (e) { }
        finally { laeuft = false; }
    }
    setTimeout(holen, 7000);
    setInterval(function () { if (!document.hidden) holen(); }, 60000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(holen, 1500); });
    window.jvParkplatzAuto = { holen };
})();
