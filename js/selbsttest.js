/* ============================================================
   SELBSTTEST: erweitert den Systemcheck ("Selbsttest" / "Systemcheck") um die neuen Teile:
   Standort, Google-Route, Verkehr, Diesel-Suche, Lagebild und Sprachbefehle.
   Hängt sich an collectSystemChecks (systemcheck.js); das Fenster zeigt hud_fenster.js. Fehler stören nie.
   ============================================================ */
(function () {
    'use strict';
    const orig = window.collectSystemChecks;
    if (typeof orig !== 'function' || orig._jvSelf) return;

    const mitZeit = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('antwortet nicht')), ms))]);
    const warum = (e) => (e && e.message === 'antwortet nicht') ? 'antwortet nicht' : 'keine Verbindung';
    const holeJson = async (url, ms) => {
        const r = await mitZeit(apiFetch(url), ms);
        const d = await r.json().catch(() => null);
        return { r, d };
    };

    async function standort() {
        if (!navigator.geolocation) return { ok: false, text: 'nicht unterstützt' };
        try {
            const p = await mitZeit(new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 120000 })), 10000);
            return { ok: true, text: 'gefunden', lat: p.coords.latitude, lon: p.coords.longitude };
        } catch (e) { return { ok: false, text: (e && e.code === 1) ? 'nicht erlaubt' : 'kein Signal' }; }
    }

    window.collectSystemChecks = async function () {
        const res = await orig.apply(this, arguments);
        const add = (name, ok, text) => res.push({ name, ok, text });
        try {
            const pos = await standort();
            add('Standort', pos.ok, pos.text);
            const lat = pos.ok ? pos.lat : 53.5, lon = pos.ok ? pos.lon : 10.48;
            await Promise.all([
                (async () => {
                    try {
                        const { r, d } = await holeJson(`/api/route?fromLat=${lat}&fromLon=${lon}&toLat=53.55&toLon=10.0&geometry=0&google=1`, 15000);
                        const rt = d && d.routes && d.routes[0];
                        if (!r.ok || !rt) add('Google-Route', false, (d && d.error) || ('Status ' + r.status));
                        else if (d.quelle === 'google') add('Google-Route', true, Math.round(rt.duration / 60) + ' Min, Google');
                        else add('Google-Route', false, 'nur Ersatzdienst (OSRM), Google-Schlüssel oder Monatslimit prüfen');
                    } catch (e) { add('Google-Route', false, warum(e)); }
                })(),
                (async () => {
                    try {
                        const dl = 0.1, dn = 0.17;
                        const { r, d } = await holeJson('/api/stau?traffic=1&bbox=' + [lon - dn, lat - dl, lon + dn, lat + dl].map(n => n.toFixed(5)).join(','), 15000);
                        if (r.ok && d && !d.error) add('Verkehr', true, 'Meldungen kommen an');
                        else add('Verkehr', false, (d && d.error) || ('Status ' + r.status));
                    } catch (e) { add('Verkehr', false, warum(e)); }
                })(),
                (async () => {
                    try {
                        const { r, d } = await holeJson(`/api/tankroute?lat=${lat.toFixed(5)}&lng=${lon.toFixed(5)}&rad=5`, 15000);
                        if (r.ok && d && !d.error) add('Diesel-Suche', true, 'antwortet');
                        else add('Diesel-Suche', false, (d && d.error) || ('Status ' + r.status));
                    } catch (e) { add('Diesel-Suche', false, warum(e)); }
                })()
            ]);
        } catch (e) { add('Selbsttest', false, 'Fehler: ' + (e && e.message || e)); }

        /* Bausteine und Sprachbefehle (ohne etwas auszulösen): sind sie überhaupt geladen? */
        try {
            const fehlt = [];
            if (!window.jvLage || typeof window.jvLage.open !== 'function') fehlt.push('Lagebild');
            if (!window.jvPanel) fehlt.push('Fenster');
            const liste = (window.jvCommands && window.jvCommands.list) ? window.jvCommands.list().join(' ') : '';
            ['lagebild', 'arbeitsweg-via'].forEach(n => { if (liste.indexOf(n) < 0) fehlt.push('Befehl ' + n); });
            if (typeof window.executeAction !== 'function') fehlt.push('Aktionen');
            add('Bausteine', fehlt.length === 0, fehlt.length ? 'fehlt: ' + fehlt.join(', ') : 'Lagebild und Sprachbefehle geladen');
        } catch (e) {}
        return res;
    };
    window.collectSystemChecks._jvSelf = true;
})();
