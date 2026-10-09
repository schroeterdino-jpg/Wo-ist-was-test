/* ============================================================
   RADAR: Vollbild-Ansicht im Film-Stil. Du bist in der Mitte, eine Scan-Linie dreht sich, rundherum leuchten (20 km Radius, Norden oben):
   - ⛽ Tankstellen (günstigste Diesel-Preise, die günstigste in Grün) - Tankerkönig über /api/tankroute
   - ⚠ Verkehrsmeldungen (Stau, Unfälle, Sperrungen) - TomTom über /api/stau?traffic=1 (braucht TOMTOM_API_KEY; ohne Schlüssel fehlt dieser Teil).
     Dein Arbeitsweg (gespeicherte Arbeitsadresse) ist als Linie eingezeichnet; Meldungen darauf sind hervorgehoben und werden zuerst genannt (Straße, Abschnitt, Art, Verzögerung, Entfernung und Richtung), alle anderen sind blass.
   - ☂ Regen in den nächsten 3 Stunden: Vorhersage für 8 Richtungen rund um dich (Open-Meteo), als blaue Sektoren mit Beginn-Uhrzeit
   - ◆ Termine der nächsten 24 Stunden, die einen Ort haben
   Aufruf: "Radar" / "Zeig mir das Radar"; Schließen: ✕, Tipp auf den Rand oder "Radar schließen". Punkt antippen = Info (mit "Route" zum Tanken/Termin).
   Aktualisiert sich alle 5 Minuten, solange das Radar offen ist. Jarvis nennt beim Öffnen per Sprache kurz das Wichtigste.
   Braucht: fetchUserLocationData (briefing.js), apiFetch, optional calendarEntries, geocodeDestination (travel.js), buildMapsLink (places.js), speak().
   Jede Quelle ist unabhängig: fällt eine aus, fehlt nur ihr Teil.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvRadar) return;
    const RKM = 20;
    let layer = null, cv = null, ctx2 = null, raf = 0, timer = 0, state = null, sel = null, hits = [], t0 = 0, W = 0, H = 0;
    const COL = { fuel: '#7dffb0', fuelBest: '#b6ffd2', stau: '#ff5d5d', term: '#ffd166', rain: '#6fa8ff' };
    const ICO = { fuel: '⛽', stau: '⚠', term: '◆' };
    const sagen = t => { try { if (typeof speak === 'function') speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} };
    const mit = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
    const euro = p => p.toFixed(3).replace('.', ',') + ' €';
    const HIMMEL = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];

    function rad(d) { return d * Math.PI / 180; }
    function distKm(a, b, c, d) { const t = rad, x = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(x)); }
    function bearing(a, b, c, d) { const y = Math.sin(rad(d - b)) * Math.cos(rad(c)), x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b)); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
    function dest(lat, lon, brg, dk) { const R = 6371, b = rad(brg), p1 = rad(lat), l1 = rad(lon), dr = dk / R; const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(b)); const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2)); return [p2 * 180 / Math.PI, l2 * 180 / Math.PI]; }
    const hhmm = d => d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
    const himmel = b => HIMMEL[Math.round(b / 45) % 8];
    function distToLine(lat, lon, pts) {
        let best = Infinity;
        for (let i = 0; i < pts.length - 1; i++) {
            const a = pts[i], b = pts[i + 1], kx = Math.cos(lat * Math.PI / 180);
            const ax = (a[1] - lon) * kx, ay = a[0] - lat, bx = (b[1] - lon) * kx, by = b[0] - lat, dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
            let t = L > 0 ? -(ax * dx + ay * dy) / L : 0; t = Math.max(0, Math.min(1, t));
            const d = Math.hypot(ax + t * dx, ay + t * dy) * 111.2; if (d < best) best = d;
        }
        return best;
    }
    function wrap(x, text, maxW, maxLines) {
        const words = String(text).split(' '), lines = []; let cur = '';
        for (const w of words) { const t = cur ? cur + ' ' + w : w; if (x.measureText(t).width <= maxW) cur = t; else { if (cur) lines.push(cur); cur = w; } }
        if (cur) lines.push(cur);
        if (lines.length > maxLines) { lines.length = maxLines; lines[maxLines - 1] = lines[maxLines - 1].replace(/.{0,2}$/, '…'); }
        return lines;
    }
    // ausführliche Beschreibung einer Verkehrsmeldung für Liste, Info und Sprache
    function stauZeile(p, kurz) {
        const strasse = p.strassen && p.strassen[0] ? p.strassen[0] : '';
        const wo = p.von && p.nach && p.von !== p.nach ? 'zwischen ' + p.von + ' und ' + p.nach : (p.von ? 'bei ' + p.von : '');
        const ort = ((strasse ? strasse + ' ' : '') + wo).trim();
        const teile = [(ort ? ort + ': ' : '') + p.art + (p.anzahl > 1 ? ' (' + p.anzahl + ' Meldungen)' : '')];
        if (kurz && !ort && p.text && !new RegExp(p.art, 'i').test(p.text)) teile.push(p.text);
        if (p.min >= 2) teile.push(p.min + ' Minuten länger');
        if (!kurz && p.laenge_m >= 300) teile.push((p.laenge_m / 1000).toFixed(1).replace('.', ',') + ' km lang');
        teile.push(p.d.toFixed(0) + ' km ' + himmel(p.b));
        if (!kurz && p.text && !new RegExp(p.art, 'i').test(p.text)) teile.push(p.text);
        return teile.join(' · ');
    }

    /* ---------- Daten ---------- */
    async function ladeTank(lat, lon) {
        try {
            const r = await apiFetch('/api/tankroute?lat=' + lat.toFixed(5) + '&lng=' + lon.toFixed(5) + '&rad=' + RKM);
            const d = await r.json();
            if (!r.ok || !d.stations) return [];
            return d.stations.filter(s => s.diesel > 0).map(s => ({ typ: 'fuel', lat: s.lat, lon: s.lng, preis: s.diesel, name: s.name, strasse: s.strasse, ort: s.ort })).sort((a, b) => a.preis - b.preis).slice(0, 12);
        } catch (e) { return []; }
    }
    async function ladeStau(lat, lon) {
        try {
            const dl = RKM / 111, dn = RKM / (111 * Math.cos(rad(lat)));
            const r = await apiFetch('/api/stau?traffic=1&bbox=' + [lon - dn, lat - dl, lon + dn, lat + dl].map(n => n.toFixed(5)).join(','));
            const d = await r.json();
            if (!r.ok) return { fehler: d && d.error ? String(d.error) : 'Status ' + r.status, items: [] };
            return { items: (d.incidents || []).filter(i => ![4, 10].includes(i.kategorie) && (i.stufe >= 2 || i.verzoegerung_s >= 120 || [1, 8].includes(i.kategorie))).map(i => ({ typ: 'stau', lat: i.lat, lon: i.lon, art: i.art, min: Math.round(i.verzoegerung_s / 60), laenge_m: i.laenge_m || 0, von: i.von, nach: i.nach, strassen: i.strassen, text: i.text })).slice(0, 150) };
        } catch (e) { return { fehler: 'nicht erreichbar', items: [] }; }
    }
    async function ladeRegen(lat, lon) {
        try {
            const pts = [[lat, lon]];
            for (let b = 0; b < 360; b += 45) pts.push(dest(lat, lon, b, RKM * 0.6));
            const url = 'https://api.open-meteo.com/v1/forecast?latitude=' + pts.map(p => p[0].toFixed(3)).join(',') + '&longitude=' + pts.map(p => p[1].toFixed(3)).join(',') + '&minutely_15=precipitation&forecast_minutely_15=12&timezone=GMT';
            const r = await fetch(url);
            let d = await r.json();
            if (!Array.isArray(d)) d = [d];
            const jetzt = Date.now();
            return d.map((x, i) => {
                const m = x.minutely_15; if (!m || !m.precipitation) return null;
                const k = m.precipitation.findIndex((v, j) => v >= 0.1 && new Date(m.time[j] + 'Z').getTime() + 15 * 60000 > jetzt);
                if (k < 0) return { brg: i === 0 ? null : (i - 1) * 45, start: null, mm: 0 };
                const s = new Date(m.time[k] + 'Z').getTime();
                return { brg: i === 0 ? null : (i - 1) * 45, start: Math.max(s, jetzt), mm: m.precipitation[k] };
            }).filter(Boolean);
        } catch (e) { return []; }
    }
    async function ladeTermine(lat, lon) {
        const out = [];
        try {
            const jetzt = Date.now(), bis = jetzt + 24 * 3600000;
            const ev = (typeof calendarEntries !== 'undefined' ? calendarEntries : []).filter(e => e && e.location && e.isoDate && String(e.isoDate).length > 10 && new Date(e.isoDate).getTime() > jetzt - 1800000 && new Date(e.isoDate).getTime() < bis).slice(0, 4);
            for (const e of ev) {
                try {
                    const g = await mit(geocodeDestination(e.location, ''), 5000);
                    if (g && isFinite(g.lat)) out.push({ typ: 'term', lat: g.lat, lon: g.lon, name: e.text, wann: new Date(e.isoDate), ort: e.location });
                } catch (x) {}
            }
        } catch (e) {}
        return out;
    }

    async function laden() {
        let loc = null;
        try { loc = await mit(fetchUserLocationData(), 15000); } catch (e) {}
        if (!loc || loc.fehler || loc.latitude === undefined) return { fehler: (loc && loc.fehler) || 'Standort nicht verfügbar. Ist der Zugriff erlaubt?' };
        const lat = loc.latitude, lon = loc.longitude;
        const work = (typeof workAddress === 'string') ? workAddress : '';
        const arbeitP = (work && typeof fetchRouteMapData === 'function') ? mit(fetchRouteMapData(work, loc).catch(() => null), 14000) : Promise.resolve(null);
        const [tank, stau, regen, term, arbeitRoute] = await Promise.all([ladeTank(lat, lon), ladeStau(lat, lon), ladeRegen(lat, lon), ladeTermine(lat, lon), arbeitP]);
        let arbeit = null;
        if (arbeitRoute && Array.isArray(arbeitRoute.coords) && arbeitRoute.coords.length > 1) {
            let c = arbeitRoute.coords; if (c.length > 400) { const st = Math.ceil(c.length / 400); c = c.filter((_, i) => i % st === 0 || i === c.length - 1); }
            arbeit = { coords: c, fahrtMin: arbeitRoute.fahrtMin || null };
        }
        return { lat, lon, ort: loc.ort || '', tank, stau, regen, term, arbeit, hatArbeit: !!work, zeit: Date.now() };
    }

    /* ---------- Auswertung ---------- */
    // Meldungen an fast derselben Stelle (z.B. beide Fahrtrichtungen, mehrere Teilstücke einer Sperrung) zu einem Punkt zusammenfassen
    function clustern(items) {
        const sorted = items.slice().sort((a, b) => (b.aufWeg ? 1 : 0) - (a.aufWeg ? 1 : 0) || b.min - a.min || (b.stufe || 0) - (a.stufe || 0));
        const out = [];
        sorted.forEach(i => {
            const c = out.find(o => distKm(o.lat, o.lon, i.lat, i.lon) < 1.5);
            if (c) c.anzahl++; else out.push(Object.assign({ anzahl: 1 }, i));
        });
        return out;
    }
    function punkte(s) {
        const out = [];
        s.tank.forEach((t, i) => out.push(Object.assign({}, t, { best: i === 0 })));
        s.stau.cluster.forEach(x => out.push(x));
        s.term.forEach(x => out.push(x));
        out.forEach(p => { p.d = distKm(s.lat, s.lon, p.lat, p.lon); p.b = bearing(s.lat, s.lon, p.lat, p.lon); });
        // außerhalb des Radius (Ecken der Abfrage-Fläche) weglassen, Termine bleiben am Rand sichtbar
        return out.filter(p => p.typ === 'term' || p.d <= RKM);
    }
    function infoText(p) {
        if (p.typ === 'fuel') return '⛽ ' + p.name + ' · Diesel ' + euro(p.preis) + ' · ' + p.d.toFixed(1).replace('.', ',') + ' km · ' + [p.strasse, p.ort].filter(Boolean).join(', ');
        if (p.typ === 'stau') return (p.aufWeg ? '🚗 Auf deinem Arbeitsweg: ' : '⚠ ') + stauZeile(p, false);
        return '◆ ' + p.name + ' · ' + hhmm(p.wann) + ' Uhr · ' + p.d.toFixed(1).replace('.', ',') + ' km';
    }
    function zusammenfassung(s) {
        const z = [], sp = [];
        if (s.tank.length) { const t = s.tank[0]; z.push('⛽ Günstigster Diesel: ' + t.name + ' ' + euro(t.preis) + ' · ' + distKm(s.lat, s.lon, t.lat, t.lon).toFixed(0) + ' km'); sp.push('Der günstigste Diesel ist ' + euro(t.preis).replace(' €', ' Euro') + ' bei ' + t.name + ', ' + distKm(s.lat, s.lon, t.lat, t.lon).toFixed(0) + ' Kilometer entfernt.'); }
        const cl = s.stau.cluster || [], n = cl.length, auf = cl.filter(x => x.aufWeg), rest = cl.filter(x => !x.aufWeg);
        if (s.hatArbeit && s.arbeit) {
            if (auf.length) { auf.slice(0, 2).forEach(a => z.push('🚗 Arbeitsweg: ' + stauZeile(a, true))); sp.push('Auf deinem Arbeitsweg: ' + auf.slice(0, 2).map(a => stauZeile(a, true).replace(/ · \d+ km \S+$/, '')).join('. ') + '.'); }
            else if (!s.stau.fehler) { z.push('🚗 Arbeitsweg: frei, keine Meldungen'); sp.push('Auf deinem Arbeitsweg ist nichts gemeldet.'); }
        } else if (s.hatArbeit === false) z.push('🚗 Arbeitsweg unbekannt: sag „Merk dir meine Arbeitsadresse“');
        if (s.stau.fehler) z.push('⚠ Verkehr: nicht verfügbar');
        else if (rest.length) { const r2 = rest.slice(0, auf.length ? 1 : 2); r2.forEach(a => z.push('⚠ ' + stauZeile(a, true))); if (rest.length > r2.length) z.push('⚠ + ' + (rest.length - r2.length) + ' weitere Meldungen (blass auf dem Radar, antippen)'); if (!auf.length) sp.push('Im Umkreis: ' + r2.map(a => stauZeile(a, true)).join('. ') + '.'); }
        else if (!n) z.push('⚠ Keine Verkehrsmeldungen im Umkreis');
        const nass = s.regen.filter(x => x.start), jetztNass = nass.filter(x => x.start - Date.now() < 6 * 60000);
        const r = nass.slice().sort((a, b) => a.start - b.start)[0];
        if (jetztNass.length >= 6) {
            z.push('☂ Regen im ganzen Umkreis');
            sp.push('Es regnet im ganzen Umkreis.');
        } else if (r) {
            const spaet = nass.filter(x => x.start - Date.now() >= 6 * 60000).sort((a, b) => a.start - b.start)[0];
            const wer = jetztNass.length ? jetztNass[0] : spaet;
            const min = Math.max(0, Math.round((wer.start - Date.now()) / 60000));
            const wo = wer.brg === null ? 'bei dir' : 'aus Richtung ' + HIMMEL[wer.brg / 45];
            z.push('☂ Regen ' + (min <= 5 ? 'jetzt' : 'ab ' + hhmm(new Date(wer.start)) + ' Uhr') + ' · ' + wo);
            sp.push(min <= 5 ? 'Es regnet ' + (wer.brg === null ? 'gerade bei dir.' : 'in der Nähe, ' + wo + '.') : 'Regen erreicht dich in etwa ' + min + ' Minuten, ' + wo + '.');
        } else z.push('☂ Kein Regen in den nächsten 3 Stunden');
        if (s.term.length) { const t = s.term.slice().sort((a, b) => a.wann - b.wann)[0]; z.push('◆ ' + t.name + ' · ' + hhmm(t.wann) + ' Uhr'); }
        return { zeilen: z, sprache: sp };
    }

    /* ---------- Zeichnen ---------- */
    function frame(now) {
        raf = requestAnimationFrame(frame);
        if (!cv) return;
        const x = ctx2, cx = W / 2, cy = Math.max(190, Math.min(H * 0.42, 300)), R = Math.min(W / 2 - 34, cy - 62, 190);
        const sw = ((now - t0) / 4200 * 360) % 360;   // eine Umdrehung in 4,2 s
        x.clearRect(0, 0, W, H);
        let g = x.createRadialGradient(cx, cy, 10, cx, cy, Math.max(W, H) * 0.7); g.addColorStop(0, '#0b2b40'); g.addColorStop(1, '#02070d'); x.fillStyle = g; x.fillRect(0, 0, W, H);
        x.strokeStyle = 'rgba(94,231,255,.06)'; x.lineWidth = 1;
        for (let i = 0; i < W; i += 26) { x.beginPath(); x.moveTo(i, 0); x.lineTo(i, H); x.stroke(); }
        for (let j = 0; j < H; j += 26) { x.beginPath(); x.moveTo(0, j); x.lineTo(W, j); x.stroke(); }
        // Regen-Sektoren (unter allem anderen)
        if (state && state.regen) state.regen.forEach(r => {
            if (!r.start) return;
            const min = (r.start - Date.now()) / 60000, schon = min < 6;
            const a = schon ? 0.1 : Math.max(0.14, Math.min(0.4, 0.4 - min / 400 + Math.min(r.mm, 2) * 0.05));
            if (r.brg === null) { x.beginPath(); x.arc(cx, cy, R * 0.14, 0, 7); x.fillStyle = 'rgba(111,168,255,' + a + ')'; x.fill(); return; }
            const mid = rad(r.brg) - Math.PI / 2, gr = x.createRadialGradient(cx, cy, R * 0.15, cx, cy, R);
            gr.addColorStop(0, 'rgba(111,168,255,0)'); gr.addColorStop(1, 'rgba(111,168,255,' + a + ')');
            x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, mid - rad(22.5), mid + rad(22.5)); x.closePath(); x.fillStyle = gr; x.fill();
            if (!schon) {
                const lx = cx + R * 0.82 * Math.sin(rad(r.brg)), ly = cy - R * 0.82 * Math.cos(rad(r.brg));
                x.fillStyle = '#9cc4ff'; x.font = '10px ui-monospace,monospace'; x.textAlign = 'center'; x.fillText('☂ ' + hhmm(new Date(r.start)), lx, ly);
            }
        });
        for (let i = 1; i <= 4; i++) {
            x.beginPath(); x.arc(cx, cy, R * i / 4, 0, 7); x.strokeStyle = 'rgba(94,231,255,' + (i === 4 ? 0.6 : 0.28) + ')'; x.lineWidth = i === 4 ? 1.6 : 1; x.stroke();
            x.fillStyle = 'rgba(94,231,255,.7)'; x.font = '9px ui-monospace,monospace'; x.textAlign = 'left'; x.fillText((i * RKM / 4) + ' km', cx + 4, cy - R * i / 4 + 10);
        }
        x.strokeStyle = 'rgba(94,231,255,.22)'; [0, 45, 90, 135].forEach(a => { const r = rad(a); x.beginPath(); x.moveTo(cx - R * Math.sin(r), cy + R * Math.cos(r)); x.lineTo(cx + R * Math.sin(r), cy - R * Math.cos(r)); x.stroke(); });
        for (let a = 0; a < 360; a += 5) { const r = rad(a), l = a % 30 ? 4 : 9; x.beginPath(); x.moveTo(cx + (R + 3) * Math.sin(r), cy - (R + 3) * Math.cos(r)); x.lineTo(cx + (R + 3 + l) * Math.sin(r), cy - (R + 3 + l) * Math.cos(r)); x.strokeStyle = 'rgba(94,231,255,.6)'; x.stroke(); }
        x.fillStyle = '#5ee7ff'; x.font = 'bold 12px ui-monospace,monospace'; x.textAlign = 'center';
        x.fillText('N', cx, cy - R - 18); x.fillText('S', cx, cy + R + 28); x.fillText('O', cx + R + 20, cy + 4); x.fillText('W', cx - R - 20, cy + 4);
        // Scan-Linie
        const a0 = rad(sw) - Math.PI / 2;
        for (let k = 0; k < 50; k++) { x.beginPath(); x.moveTo(cx, cy); x.arc(cx, cy, R, a0 - k * 0.022 - 0.022, a0 - k * 0.022); x.closePath(); x.fillStyle = 'rgba(94,231,255,' + (0.2 * (1 - k / 50)) + ')'; x.fill(); }
        x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + R * Math.cos(a0), cy + R * Math.sin(a0)); x.strokeStyle = '#5ee7ff'; x.lineWidth = 2; x.shadowColor = '#5ee7ff'; x.shadowBlur = 12; x.stroke(); x.shadowBlur = 0;
        // Arbeitsweg als Linie (nur der Teil im Radius)
        if (state && state.arbeit) {
            x.save(); x.beginPath(); x.arc(cx, cy, R, 0, 7); x.clip();
            x.beginPath(); let an = false;
            state.arbeit.coords.forEach(c => { const d = distKm(state.lat, state.lon, c[0], c[1]), b = bearing(state.lat, state.lon, c[0], c[1]), f = d / RKM, px = cx + R * f * Math.sin(rad(b)), py = cy - R * f * Math.cos(rad(b)); if (!an) { x.moveTo(px, py); an = true; } else x.lineTo(px, py); });
            x.strokeStyle = 'rgba(255,255,255,.55)'; x.lineWidth = 2; x.setLineDash([6, 4]); x.shadowColor = '#5ee7ff'; x.shadowBlur = 6; x.stroke(); x.setLineDash([]); x.shadowBlur = 0; x.restore();
        }
        // Punkte
        hits = [];
        if (state && state.pts) {
            const used = [], labeled = { fuel: 0, stau: 0 };
            const frei = (x0, y0, w) => !used.some(u => x0 < u.x + u.w && x0 + w > u.x && Math.abs(y0 - u.y) < 12);
            const prio = state.pts.slice().sort((a, b) => (b.best ? 3 : 0) + (b.aufWeg ? 4 : 0) + (b.typ === 'term' ? 2 : 0) + (b.typ === 'stau' ? 1 : 0) - ((a.best ? 3 : 0) + (a.aufWeg ? 4 : 0) + (a.typ === 'term' ? 2 : 0) + (a.typ === 'stau' ? 1 : 0)));
            const pos = new Map();
            state.pts.forEach(p => {
                const f = Math.min(p.d / RKM, 0.97), px = cx + R * f * Math.sin(rad(p.b)), py = cy - R * f * Math.cos(rad(p.b));
                pos.set(p, [px, py]);
                const diff = ((sw - p.b) % 360 + 360) % 360, glow = diff < 80 ? 1 - diff / 80 : 0;
                const c = p.typ === 'fuel' ? (p.best ? COL.fuelBest : COL.fuel) : COL[p.typ], big = p.best ? 2 : 0;
                const blass = p.typ === 'stau' && state.arbeit && !p.aufWeg && sel !== p;
                x.globalAlpha = blass ? 0.38 : 1;
                x.beginPath(); x.arc(px, py, (p.aufWeg ? 7 : 5) + big + glow * 5, 0, 7); x.fillStyle = c + (glow > 0.1 ? '66' : '2a'); x.fill();
                x.beginPath(); x.arc(px, py, (p.aufWeg ? 4.6 : 3.5) + big * 0.5, 0, 7); x.fillStyle = c; x.shadowColor = c; x.shadowBlur = blass ? 0 : 8; x.fill(); x.shadowBlur = 0;
                x.globalAlpha = 1;
                if (sel === p) { x.beginPath(); x.arc(px, py, 11, 0, 7); x.strokeStyle = '#fff'; x.lineWidth = 1.5; x.stroke(); }
                hits.push({ p, x: px, y: py });
            });
            x.font = '10px ui-monospace,monospace';
            prio.forEach(p => {
                if ((p.typ === 'fuel' && labeled.fuel >= 3) || (p.typ === 'stau' && (labeled.stau >= 4 || (state.arbeit && !p.aufWeg)))) return;
                const [px, py] = pos.get(p), c = p.typ === 'fuel' ? (p.best ? COL.fuelBest : COL.fuel) : COL[p.typ];
                const l = ICO[p.typ] + ' ' + String(p.typ === 'fuel' ? euro(p.preis).replace(' €', '') : p.typ === 'stau' ? p.art + (p.anzahl > 1 ? ' ×' + p.anzahl : '') + (p.min >= 2 ? ' +' + p.min : '') : p.name).slice(0, 18);
                const w = x.measureText(l).width;
                let left = px > cx + 30, lx = left ? px + 9 : px - 9 - w;
                if (lx < 4 || lx + w > W - 4) { left = !left; lx = left ? px + 9 : px - 9 - w; }
                if (lx < 4 || lx + w > W - 4 || !frei(lx, py, w)) return;
                used.push({ x: lx, y: py, w });
                if (p.typ === 'fuel') labeled.fuel++; else if (p.typ === 'stau') labeled.stau++;
                x.fillStyle = c; x.textAlign = 'left'; x.fillText(l, lx, py + 3);
            });
        }
        x.beginPath(); x.arc(cx, cy, 5, 0, 7); x.fillStyle = '#fff'; x.shadowColor = '#5ee7ff'; x.shadowBlur = 14; x.fill(); x.shadowBlur = 0;
        // Kopf
        x.textAlign = 'left'; x.fillStyle = '#5ee7ff'; x.font = '13px ui-monospace,monospace'; x.fillText('J.A.R.V.I.S. // RADAR', 16, 30);
        x.font = '10px ui-monospace,monospace'; x.fillStyle = 'rgba(94,231,255,.7)';
        x.fillText(state && state.ort ? state.ort.toUpperCase() : (state && state.fehler ? 'KEIN STANDORT' : 'LADE DATEN …'), 16, 46);
        x.textAlign = 'right'; x.fillText('SCAN ' + String(Math.round(sw)).padStart(3, '0') + '°', W - 52, 30); x.fillText(state && state.zeit ? 'AKTUELL ' + hhmm(new Date(state.zeit)) : '', W - 52, 46);
        // Legende + Liste
        let ly = cy + R + 50, lx = 16; x.textAlign = 'left';
        [['fuel', 'Tanken'], ['stau', 'Verkehr'], ['rain', 'Regen'], ['term', 'Termine']].forEach(([t, n]) => { x.fillStyle = COL[t]; x.beginPath(); x.arc(lx + 4, ly - 4, 4, 0, 7); x.fill(); x.font = '11px ui-monospace,monospace'; x.fillText(n, lx + 13, ly); lx += Math.max(80, (W - 32) / 4); });
        const rows = (state && state.fehler ? [state.fehler] : (state && state.zus ? state.zus.zeilen : ['Daten werden geladen …'])).slice();
        if (sel) rows.unshift(infoText(sel));
        x.font = '11px ui-monospace,monospace';
        let yy = ly + 9;
        rows.slice(0, 7).forEach((t, i) => {
            const ist = sel && i === 0, lines = wrap(x, t, W - 48 - (ist && sel && (sel.typ === 'fuel' || sel.typ === 'term') ? 62 : 0), ist ? 4 : 3), h = lines.length * 14 + 8;
            if (yy + h > H - 6) return;
            x.fillStyle = ist ? 'rgba(20,60,80,.9)' : 'rgba(6,20,34,.7)'; x.fillRect(12, yy, W - 24, h); x.strokeStyle = ist ? '#5ee7ff' : 'rgba(94,231,255,.3)'; x.strokeRect(12, yy, W - 24, h);
            x.fillStyle = '#d8f6ff'; x.textAlign = 'left'; lines.forEach((l, k) => x.fillText(l, 20, yy + 15 + k * 14));
            if (i === 0 && state) state._ersteY = yy;
            yy += h + 5;
        });
        if (sel && (sel.typ === 'fuel' || sel.typ === 'term')) { const y = ((state && state._ersteY) || (ly + 9)) + 4; hits.push({ knopf: true, x: W - 70, y: y + 11, w: 60, h: 22 }); x.fillStyle = '#5ee7ff'; x.fillRect(W - 70, y, 58, 22); x.fillStyle = '#02070d'; x.font = 'bold 11px ui-monospace,monospace'; x.textAlign = 'center'; x.fillText('Route ▶', W - 41, y + 15); }
    }

    function tap(ev) {
        const r = cv.getBoundingClientRect(), px = ev.clientX - r.left, py = ev.clientY - r.top;
        const kn = hits.find(h => h.knopf);
        if (kn && px >= kn.x && px <= kn.x + kn.w && py >= kn.y - 11 && py <= kn.y + 11 && sel) {
            const adr = sel.typ === 'fuel' ? [sel.strasse, sel.ort].filter(Boolean).join(', ') : sel.ort;
            try { if (typeof buildMapsLink === 'function') window.open(buildMapsLink(adr, '', 'driving'), '_blank'); } catch (e) {}
            return;
        }
        let best = null, bd = 26;
        hits.forEach(h => { if (h.p) { const d = Math.hypot(h.x - px, h.y - py); if (d < bd) { bd = d; best = h.p; } } });
        if (best) sel = best === sel ? null : best; else if (py < 70 && px > W - 50) close();
    }

    /* ---------- Öffnen / Schließen ---------- */
    // Meldungen ohne Straße/Ort (z.B. Sperrungen): Ortsname über die Koordinaten nachschlagen (nur für die angezeigten, höchstens 4, ein Aufruf pro Sekunde)
    const ortCache = {};
    async function ortsname(lat, lon) {
        const k = lat.toFixed(3) + ',' + lon.toFixed(3);
        if (ortCache[k] !== undefined) return ortCache[k];
        try {
            const r = await mit(fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&accept-language=de&lat=' + lat + '&lon=' + lon), 5000);
            const d = r && r.ok ? await r.json() : null, a = (d && d.address) || {};
            const strasse = a.road || a.pedestrian || '', ort = a.suburb || a.village || a.town || a.city || a.municipality || '';
            return (ortCache[k] = [strasse, ort].filter(Boolean).join(', ') || '');
        } catch (e) { return (ortCache[k] = ''); }
    }
    async function orteNachladen(s) {
        const kand = s.stau.cluster.filter(p => !p.von && !(p.strassen && p.strassen[0])).sort((a, b) => (b.aufWeg ? 1 : 0) - (a.aufWeg ? 1 : 0)).slice(0, 4);
        for (const p of kand) {
            const n = await ortsname(p.lat, p.lon);
            if (n) p.von = n;
            if (state !== s) return;
            await new Promise(r => setTimeout(r, 1100));
        }
        if (state === s && kand.length) s.zus = zusammenfassung(s);
    }
    async function refresh(sprich) {
        const s = await laden();
        if (!layer) return;
        if (s.fehler) { state = { fehler: s.fehler }; if (sprich) sagen(s.fehler); return; }
        (s.stau.items || []).forEach(i => { i.aufWeg = !!(s.arbeit && distToLine(i.lat, i.lon, s.arbeit.coords) <= 1.2); }); s.stau.cluster = clustern(s.stau.items || []).filter(x => distKm(s.lat, s.lon, x.lat, x.lon) <= RKM).slice(0, 15); s.pts = punkte(s); s.zus = zusammenfassung(s); state = s; sel = null;
        await orteNachladen(s);   // Straße/Ort für Meldungen ohne Angabe ergänzen (Anzeige aktualisiert sich dabei von selbst)
        if (sprich && state === s) sagen('Radar aktiv. ' + (s.zus.sprache.join(' ') || 'Im Umkreis gibt es nichts Besonderes.'));
    }
    function open(sprich) {
        if (layer) return;
        layer = document.createElement('div'); layer.id = 'jvRadar';
        layer.style.cssText = 'position:fixed;inset:0;z-index:9500;background:#02070d;touch-action:manipulation';
        cv = document.createElement('canvas'); cv.style.cssText = 'width:100%;height:100%;display:block';
        layer.appendChild(cv);
        const b = document.createElement('button'); b.textContent = '✕'; b.setAttribute('aria-label', 'Radar schließen');
        b.style.cssText = 'position:absolute;top:12px;right:12px;width:36px;height:36px;border-radius:8px;border:1px solid rgba(93,209,255,.5);background:#0a1621;color:#49d7ff;font-size:17px';
        b.addEventListener('click', close); layer.appendChild(b);
        document.body.appendChild(layer);
        const fit = () => { const d = window.devicePixelRatio || 1; W = layer.clientWidth; H = layer.clientHeight; cv.width = W * d; cv.height = H * d; ctx2 = cv.getContext('2d'); ctx2.setTransform(d, 0, 0, d, 0, 0); };
        fit(); window.addEventListener('resize', fit); layer._fit = fit;
        cv.addEventListener('click', tap);
        state = null; sel = null; t0 = performance.now();
        raf = requestAnimationFrame(frame);
        refresh(!!sprich);
        timer = setInterval(() => refresh(false), 5 * 60000);
    }
    function close() {
        if (!layer) return;
        cancelAnimationFrame(raf); clearInterval(timer);
        window.removeEventListener('resize', layer._fit);
        layer.remove(); layer = null; cv = null; state = null; sel = null;
    }
    window.jvRadar = { open, close, isOpen: () => !!layer, _state: () => state };

    /* ---------- Sprache ---------- */
    if (window.jvCommands) {
        window.jvCommands.use('radar', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (t.length > 50) return next(text);
            if (layer && /^(?:jarvis )?(?:radar )?(?:schließ\w*|schliess\w*|zumachen|ausblenden|beenden|zurück|radar (?:aus|zu))(?: radar)?$/.test(t)) { close(); return true; }
            if (/^(?:jarvis )?(?:(?:zeig(?:e)?(?: mir)?|öffne|starte|mach|schalte|gib mir) )?(?:(?:das|den) )?radar(?:ansicht)?(?: (?:an|auf|ein|öffnen|starten|zeigen|bitte))*$/.test(t)) { open(true); return true; }
            return next(text);
        }, 140);
    }
})();
