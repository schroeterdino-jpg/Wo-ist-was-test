/* ============================================================
   LAGEBILD: ersetzt das Radar. Ein Zane-Fenster mit dem Wichtigsten rund um dich, als Liste statt Kreis:
   - 🚗 Arbeitsweg: Fahrzeit, Kilometer, Ankunft und Meldungen, die WIRKLICH auf deiner Strecke liegen (Autobahn + TomTom), sonst "frei"
   - ☂ Regen: trocken, "regnet jetzt" oder "ab 20:45 Uhr, aus Westen" (Open-Meteo, nächste 3 Stunden, Umkreis 20 km)
   - ⛽ Diesel: die zwei günstigsten Tankstellen im Umkreis von 5 km mit Preis und Entfernung (Tankerkönig), Antippen = Navigation
   - ⚠ Verkehr in der Nähe: Stau und Unfälle im Umkreis von 10 km abseits deiner Strecke (nur wenn TomTom eingerichtet ist)
   - ◆ Nächster Termin mit Ort, Uhrzeit und Fahrzeit, Antippen = Navigation
   Knöpfe: "Auf Karte" (öffnet die Zane-Karte), "Aktualisieren". Aufruf: "Lagebild", "Radar", "Wie ist die Lage"; Schließen: ✕ oder "Lagebild schließen".
   Aktualisiert sich alle 5 Minuten, solange es offen ist; Zane nennt beim Öffnen kurz das Wichtigste.
   ZIEL-ANSICHT: "Route zu X", "Bring mich zu X", "Wann muss ich losfahren", "Ist Stau auf dem Weg zu X": dasselbe Fenster zeigt Ziel, Fahrzeit, Ankunft, Meldungen auf der Strecke,
   Wetter am Ziel, Diesel an der Strecke, passende Listeneinträge und Rechnungen (kommt aus fahrtcheck.js); Knöpfe "Navigation" (Google Maps), "Karte", "Lagebild".
   Bei "Route zu X" öffnet sich Google Maps nicht mehr von selbst (executeAction wird umgeleitet), nur auf Tipp.
   ORTE-ANSICHT: "Wo ist der nächste Penny?", "Apotheke in der Nähe": die Treffer (aus ortsuche.js/nearbymore.js) erscheinen im selben Fenster, Tipp = Route.
   Braucht: fetchUserLocationData, apiFetch, fetchRouteMapData (travel.js), optional calendarEntries, geocodeDestination, buildMapsLink, openPanel, speak().
   Jede Quelle ist unabhängig: fällt eine aus, fehlt nur ihre Karte.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvLage) return;
    const RKM = 20;
    const TANK_KM = 5;   // Diesel nur im Umkreis von 5 km um dich
    function quelleOrte() {
        const g = window.__jvGoogleLast;
        if (g && Date.now() - g.at < 120000) {
            if (g.ok && g.n) return 'Quelle: Google Places (' + g.n + ' Treffer).';
            if (g.ok) return 'Quelle: OpenStreetMap (Google fand nichts).';
            return 'Quelle: OpenStreetMap. Google Places ging nicht: ' + g.msg;
        }
        return 'Quelle: OpenStreetMap. Öffnungszeiten können fehlen oder veraltet sein.';
    }
    let layer = null, body = null, timer = 0, state = null, ladeNr = 0, view = 'umkreis', zielD = null, orteD = null, orteTank = false, wegD = null;
    const sagen = t => { try { if (typeof speak === 'function') speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} };
    const mit = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
    const euro = p => p.toFixed(3).replace('.', ',') + ' €';
    const hhmm = d => d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
    const HIMMEL = ['Norden', 'Nordosten', 'Osten', 'Südosten', 'Süden', 'Südwesten', 'Westen', 'Nordwesten'];
    const rad = d => d * Math.PI / 180;
    const distKm = (a, b, c, d) => { const t = rad, x = Math.sin(t(c - a) / 2) ** 2 + Math.cos(t(a)) * Math.cos(t(c)) * Math.sin(t(d - b) / 2) ** 2; return 6371 * 2 * Math.asin(Math.sqrt(x)); };
    function bearing(a, b, c, d) { const y = Math.sin(rad(d - b)) * Math.cos(rad(c)), x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b)); return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360; }
    function dest(lat, lon, brg, dk) { const R = 6371, b = rad(brg), p1 = rad(lat), l1 = rad(lon), dr = dk / R; const p2 = Math.asin(Math.sin(p1) * Math.cos(dr) + Math.cos(p1) * Math.sin(dr) * Math.cos(b)); const l2 = l1 + Math.atan2(Math.sin(b) * Math.sin(dr) * Math.cos(p1), Math.cos(dr) - Math.sin(p1) * Math.sin(p2)); return [p2 * 180 / Math.PI, l2 * 180 / Math.PI]; }
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

    /* ---------- Daten (jede Quelle für sich) ---------- */
    async function ladeTank(lat, lon) {
        try {
            const r = await apiFetch('/api/tankroute?lat=' + lat.toFixed(5) + '&lng=' + lon.toFixed(5) + '&rad=' + TANK_KM);
            const d = await r.json();
            if (!r.ok || !d.stations) return [];
            return d.stations.filter(s => s.diesel > 0).map(s => ({ lat: s.lat, lon: s.lng, preis: s.diesel, name: s.name, strasse: s.strasse, ort: s.ort, km: distKm(lat, lon, s.lat, s.lng) }))
                .filter(s => s.km <= TANK_KM).sort((a, b) => a.preis - b.preis).slice(0, 2);
        } catch (e) { return []; }
    }
    async function ladeStau(lat, lon) {
        try {
            const dl = RKM / 111, dn = RKM / (111 * Math.cos(rad(lat)));
            const r = await apiFetch('/api/stau?traffic=1&bbox=' + [lon - dn, lat - dl, lon + dn, lat + dl].map(n => n.toFixed(5)).join(','));
            const d = await r.json();
            if (!r.ok) return { fehler: true, items: [] };
            return { items: (d.incidents || []).filter(i => ![4, 10].includes(i.kategorie) && (i.stufe >= 2 || i.verzoegerung_s >= 120 || [1, 8].includes(i.kategorie)))
                .map(i => ({ kategorie: i.kategorie, lat: i.lat, lon: i.lon, art: i.art, min: Math.round(i.verzoegerung_s / 60), von: i.von, nach: i.nach, strassen: i.strassen, text: i.text })).slice(0, 150) };
        } catch (e) { return { fehler: true, items: [] }; }
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
            const out = d.map((x, i) => {
                const m = x.minutely_15; if (!m || !m.precipitation) return null;
                const k = m.precipitation.findIndex((v, j) => v >= 0.1 && new Date(m.time[j] + 'Z').getTime() + 15 * 60000 > jetzt);
                if (k < 0) return { brg: i === 0 ? null : (i - 1) * 45, start: null };
                return { brg: i === 0 ? null : (i - 1) * 45, start: Math.max(new Date(m.time[k] + 'Z').getTime(), jetzt) };
            }).filter(Boolean);
            return out.length ? out : null;
        } catch (e) { return null; }
    }
    async function ladeTermin(lat, lon) {
        try {
            const jetzt = Date.now(), bis = jetzt + 24 * 3600000;
            const ev = (typeof calendarEntries !== 'undefined' ? calendarEntries : []).filter(e => e && e.location && e.isoDate && String(e.isoDate).length > 10 && new Date(e.isoDate).getTime() > jetzt - 1800000 && new Date(e.isoDate).getTime() < bis)
                .sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate));
            const e = ev[0]; if (!e) return null;
            const out = { name: e.text, wann: new Date(e.isoDate), ort: e.location, min: null };
            try {
                const g = await mit(geocodeDestination(e.location, ''), 5000);
                if (g && isFinite(g.lat) && typeof routeDurationSeconds === 'function') {
                    const r = await mit(routeDurationSeconds(lat, lon, g.lat, g.lon), 8000);
                    if (r && r.seconds) out.min = Math.round(r.seconds / 60);
                }
            } catch (x) {}
            return out;
        } catch (e) { return null; }
    }

    async function laden() {
        let loc = null;
        try { loc = await mit(fetchUserLocationData(), 15000); } catch (e) {}
        if (!loc || loc.fehler || loc.latitude === undefined) return { fehler: (loc && loc.fehler) || 'Standort nicht verfügbar. Ist der Zugriff erlaubt?' };
        const lat = loc.latitude, lon = loc.longitude;
        const work = (typeof workAddress === 'string') ? workAddress : '';
        const arbeitP = (work && typeof fetchRouteMapData === 'function') ? mit(fetchRouteMapData(work, loc).catch(() => null), 16000) : Promise.resolve(null);
        const [tank, stau, regen, termin, route] = await Promise.all([ladeTank(lat, lon), ladeStau(lat, lon), ladeRegen(lat, lon), ladeTermin(lat, lon), arbeitP]);
        let arbeit = null;
        if (route && Array.isArray(route.coords) && route.coords.length > 1) {
            // Sperrungen zählen nur, wenn sie wirklich auf der Strecke liegen (Google fährt um Sperrungen herum), alles andere bis ~600 m neben der Linie
            const auf = (route.warnings || []).filter(w => distToLine(w.lat, w.lon, route.coords) <= (/sperr|gesperrt/i.test((w.title || '') + ' ' + (w.text || '')) ? 0.25 : 0.6));
            arbeit = { min: route.fahrtMin + (route.stauMin || 0), km: Math.round(Number(route.km)), coords: route.coords, meldungen: auf };
        }
        // Verkehr in der Nähe: nicht auf dem Arbeitsweg und nicht doppelt zu einer Autobahn-Meldung
        const aufWeg = i => (arbeit && distToLine(i.lat, i.lon, arbeit.coords) <= 1.5) || (route && (route.warnings || []).some(w => distKm(w.lat, w.lon, i.lat, i.lon) < 1.5));
        const rest = [];
        stau.items.filter(i => distKm(lat, lon, i.lat, i.lon) <= 10 && [1, 6].includes(i.kategorie) && !aufWeg(i))   // abseits der Strecke nur Unfälle und Stau im Umkreis von 10 km.sort((a, b) => b.min - a.min).forEach(i => { if (!rest.some(o => distKm(o.lat, o.lon, i.lat, i.lon) < 1.5)) rest.push(i); });
        return { lat, lon, ort: loc.ort || '', tank, stau: { fehler: stau.fehler, rest }, regen, termin, arbeit, hatArbeit: !!work, routeFehlt: !!work && !arbeit, zeit: Date.now() };
    }

    /* ---------- Texte ---------- */
    function stauText(p) {
        const strasse = p.strassen && p.strassen[0] ? p.strassen[0] : '';
        const wo = p.von && p.nach && p.von !== p.nach ? 'zwischen ' + p.von + ' und ' + p.nach : (p.von ? 'bei ' + p.von : '');
        const ort = ((strasse ? strasse + ' ' : '') + wo).trim();
        const t = [(ort ? ort + ': ' : '') + p.art];
        if (p.min >= 2) t.push(p.min + ' Min. länger');
        return t.join(' · ');
    }
    function regenInfo(s) {
        if (!s.regen) return null;
        const nass = s.regen.filter(x => x.start), jetztNass = nass.filter(x => x.start - Date.now() < 6 * 60000);
        if (!nass.length) return { gross: 'Trocken', text: 'Kein Regen in den nächsten 3 Stunden', sprache: 'In den nächsten drei Stunden bleibt es trocken.', ok: true };
        if (jetztNass.length >= 6) return { gross: 'Regnet jetzt', text: 'Im ganzen Umkreis von ' + RKM + ' km', sprache: 'Es regnet im ganzen Umkreis.', ok: false };
        const spaet = nass.filter(x => x.start - Date.now() >= 6 * 60000).sort((a, b) => a.start - b.start)[0];
        const wer = jetztNass.length ? jetztNass[0] : spaet;
        const min = Math.max(0, Math.round((wer.start - Date.now()) / 60000));
        const wo = wer.brg === null ? 'bei dir' : 'aus ' + HIMMEL[wer.brg / 45];
        if (min <= 5) return { gross: wer.brg === null ? 'Regnet jetzt' : 'Regen in der Nähe', text: wer.brg === null ? 'Bei dir' : 'Aus Richtung ' + HIMMEL[wer.brg / 45], sprache: wer.brg === null ? 'Es regnet gerade bei dir.' : 'In der Nähe regnet es, ' + wo + '.', ok: false };
        return { gross: 'Regen ab ' + hhmm(new Date(wer.start)) + ' Uhr', text: 'In etwa ' + min + ' Minuten, ' + wo, sprache: 'Regen erreicht dich in etwa ' + min + ' Minuten, ' + wo + '.', ok: false };
    }
    function sprache(s) {
        const sp = [];
        if (s.arbeit) {
            sp.push('Dein Arbeitsweg dauert ' + s.arbeit.min + ' Minuten.');
            sp.push(s.arbeit.meldungen.length ? 'Auf der Strecke gemeldet: ' + s.arbeit.meldungen.slice(0, 2).map(m => m.title).join('. ') + '.' : 'Auf deiner Strecke ist nichts gemeldet.');
        }
        const r = regenInfo(s); if (r) sp.push(r.sprache);
        if (s.tank.length) sp.push('Der günstigste Diesel ist ' + euro(s.tank[0].preis).replace(' €', ' Euro') + ' bei ' + s.tank[0].name + ', ' + Math.round(s.tank[0].km) + ' Kilometer entfernt.');
        if (s.stau.rest.length) sp.push('In der Nähe: ' + s.stau.rest.slice(0, 2).map(stauText).join('. ') + '.');
        if (s.termin) sp.push('Als Nächstes: ' + s.termin.name + ' um ' + hhmm(s.termin.wann) + ' Uhr' + (s.termin.min ? ', Fahrzeit etwa ' + s.termin.min + ' Minuten' : '') + '.');
        return sp.join(' ');
    }

    /* ---------- Darstellung ---------- */
    function stil() {
        if (document.getElementById('jvLageCss')) return;
        const st = document.createElement('style'); st.id = 'jvLageCss';
        st.textContent = '#jvLage{position:fixed;inset:0;z-index:9500;background:rgba(2,7,13,.97);color:#d8f6ff;font:13px ui-monospace,Menlo,monospace;overflow-y:auto;-webkit-overflow-scrolling:touch}' +
            '#jvLage .in{max-width:520px;margin:0 auto;padding:14px 14px 40px}' +
            '#jvLage .kopf{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px}' +
            '#jvLage .kopf b{display:block;font-size:15px;letter-spacing:2px;color:#5ee7ff}#jvLage .kopf small{opacity:.7;font-size:11px}' +
            '#jvLage .x{width:36px;height:36px;border-radius:8px;border:1px solid rgba(93,209,255,.5);background:#0a1621;color:#49d7ff;font-size:17px}' +
            '#jvLage .k{position:relative;background:rgba(6,20,34,.7);border:1px solid rgba(94,231,255,.35);border-radius:6px;padding:10px 12px 11px;margin-bottom:10px;box-shadow:0 0 14px rgba(94,231,255,.1)}' +
            '#jvLage .k.tap{cursor:pointer}#jvLage .k.tap:active{background:rgba(20,60,80,.8)}' +
            '#jvLage .k:before,#jvLage .k:after{content:"";position:absolute;width:8px;height:8px;border:2px solid #5ee7ff}#jvLage .k:before{top:-2px;left:-2px;border-right:0;border-bottom:0}#jvLage .k:after{bottom:-2px;right:-2px;border-left:0;border-top:0}' +
            '#jvLage .t{display:flex;justify-content:space-between;font-size:10px;letter-spacing:2px;color:#5ee7ff;margin-bottom:5px}' +
            '#jvLage .g{font-size:21px;font-weight:600;color:#fff;text-shadow:0 0 10px #5ee7ff;line-height:1.2}' +
            '#jvLage .z{margin-top:5px;line-height:1.35}' +
            '#jvLage .ok{color:#7dffb0}#jvLage .bad{color:#ff8a8a}#jvLage .dim{opacity:.7}' +
            '#jvLage .knoepfe{display:flex;gap:10px;margin-top:14px}' +
            '#jvLage .knoepfe button{flex:1;padding:12px 8px;border-radius:8px;border:1px solid rgba(93,209,255,.5);background:#0a1621;color:#49d7ff;font:600 12px ui-monospace,Menlo,monospace;letter-spacing:1px}' +
            '#jvLage .knoepfe button.p{background:#5ee7ff;color:#02070d}' +
            '#jvLage .knoepfe.wrap{flex-wrap:wrap}#jvLage .knoepfe.wrap button{flex:1 1 42%;min-height:54px;display:flex;align-items:center;justify-content:center;text-align:center}#jvLage .knoepfe button.an{background:#5ee7ff;color:#02070d}' +
            '#jvLage .duo{display:flex;gap:10px;margin-bottom:10px}#jvLage .duo .mini{flex:1;background:rgba(6,20,34,.7);border:1px solid rgba(94,231,255,.35);border-radius:6px;padding:9px 12px}' +
            '#jvLage .mini .t{margin-bottom:3px}#jvLage .mini .w{font-size:16px;font-weight:600;color:#7dffb0}' +
            '#jvLage .p1{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}#jvLage .p1 .n{font-size:12px;font-weight:400;text-shadow:none}' +
            '#jvLage .hinweis{font-size:11px;opacity:.6;margin:2px 2px 8px}' +
            '#jvLage .fuss{margin-top:12px;font-size:10px;opacity:.55;line-height:1.4}';
        document.head.appendChild(st);
    }
    const el = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined && txt !== null) e.textContent = txt; return e; };
    function karte(titel, rechts, gross, zeilen, aktion) {
        const k = el('div', 'k' + (aktion ? ' tap' : ''));
        const t = el('div', 't'); t.appendChild(el('span', '', titel)); t.appendChild(el('span', '', rechts || '')); k.appendChild(t);
        if (gross) k.appendChild(el('div', 'g', gross));
        (zeilen || []).forEach(z => k.appendChild(el('div', 'z ' + (z.c || ''), z.t)));
        if (aktion) k.addEventListener('click', aktion);
        return k;
    }
    function mini(titel, wert) {
        const m = el('div', 'mini'); m.appendChild(el('div', 't', titel)); m.appendChild(el('div', 'w', '✓ ' + wert)); return m;
    }
    const navi = adr => () => { try { if (typeof buildMapsLink === 'function') window.open(buildMapsLink(adr, '', 'driving'), '_blank'); } catch (e) {} };

    function zeichne() {
        if (!body) return;
        body.textContent = '';
        if (view === 'ziel' && zielD) return zeichneZiel();
        if (view === 'orte' && orteD) return zeichneOrte();
        const s = state;
        if (!s) { body.appendChild(karte('LAGEBILD', '', 'Lade Daten …', [{ t: 'Standort, Verkehr, Wetter und Preise werden geholt.', c: 'dim' }])); return; }
        if (s.fehler) { body.appendChild(karte('LAGEBILD', '', 'Kein Standort', [{ t: s.fehler, c: 'bad' }])); return; }

        // Arbeitsweg
        if (s.arbeit) {
            const m = s.arbeit.meldungen;
            const z = m.length ? m.slice(0, 3).map(x => ({ t: '⚠ ' + x.title + (x.road && /^A\d+$/.test(x.road) && String(x.title).indexOf(x.road) < 0 ? ' (' + x.road + ')' : ''), c: 'bad' })) : [{ t: '✓ Frei, keine Meldungen auf deiner Strecke', c: 'ok' }];
            if (m.length > 3) z.push({ t: '+ ' + (m.length - 3) + ' weitere Meldungen', c: 'dim' });
            body.appendChild(karte('🚗 ARBEITSWEG', 'ANKUNFT ' + hhmm(new Date(Date.now() + s.arbeit.min * 60000)), s.arbeit.min + ' Min · ' + s.arbeit.km + ' km', z));
        } else if (s.routeFehlt) body.appendChild(karte('🚗 ARBEITSWEG', '', 'Nicht verfügbar', [{ t: 'Die Route konnte gerade nicht berechnet werden.', c: 'dim' }]));
        else body.appendChild(karte('🚗 ARBEITSWEG', '', 'Unbekannt', [{ t: 'Sag „Merk dir meine Arbeitsadresse“, dann zeige ich dir hier Fahrzeit und Verkehr.', c: 'dim' }]));

        // Regen
        const r = regenInfo(s);
        const regenRuhig = !!(r && r.ok && r.gross === 'Trocken');
        const verkehrRuhig = !s.stau.fehler && !s.stau.rest.length;
        if (regenRuhig || verkehrRuhig) {   // ruhige Lage: zwei kleine Kacheln statt zwei großer Karten
            const duo = el('div', 'duo');
            if (regenRuhig) duo.appendChild(mini('☂ REGEN · 3 STD', 'Trocken'));
            if (verkehrRuhig) duo.appendChild(mini('⚠ VERKEHR · 10 KM', 'Ruhig'));
            body.appendChild(duo);
        }
        if (r && !regenRuhig) body.appendChild(karte('☂ REGEN', 'NÄCHSTE 3 STD', r.gross, [{ t: r.text, c: r.ok ? 'ok' : 'dim' }]));

        // Diesel
        if (s.tank.length) {
            const k = el('div', 'k'); const t = el('div', 't'); t.appendChild(el('span', '', '⛽ DIESEL'));
            t.appendChild(el('span', '', 'IM UMKREIS ' + TANK_KM + ' KM')); k.appendChild(t);
            s.tank.forEach((x, i) => {
                const row = el('div', 'z'); row.style.cssText = 'cursor:pointer;' + (i ? 'margin-top:9px' : '');
                const a = el('div', 'g p1', euro(x.preis)); if (i) a.style.fontSize = '17px';
                a.appendChild(el('span', 'n ' + (i === 0 ? 'ok' : ''), x.name + ' · ' + x.km.toFixed(1).replace('.', ',') + ' km'));
                row.appendChild(a);
                row.appendChild(el('div', 'dim', x.strasse || ''));
                row.addEventListener('click', navi([x.strasse, x.ort].filter(Boolean).join(', ')));
                k.appendChild(row);
            });
            body.appendChild(k);
        }

        else body.appendChild(karte('⛽ DIESEL', 'IM UMKREIS ' + TANK_KM + ' KM', 'Keine Tankstelle', [{ t: 'Im Umkreis von ' + TANK_KM + ' km gibt es keine Tankstelle mit Dieselpreis.', c: 'dim' }]));

        // Verkehr in der Nähe
        if (s.stau.fehler) body.appendChild(karte('⚠ VERKEHR', 'IN DER NÄHE', 'Nicht verfügbar', [{ t: 'Die Verkehrsdaten konnten gerade nicht geladen werden.', c: 'dim' }]));
        else if (s.stau.rest.length) {
            const z = s.stau.rest.slice(0, 3).map(p => ({ t: stauText(p) + ' · ' + Math.round(distKm(s.lat, s.lon, p.lat, p.lon)) + ' km', c: '' }));
            if (s.stau.rest.length > 3) z.push({ t: '+ ' + (s.stau.rest.length - 3) + ' weitere Meldungen (auf der Karte)', c: 'dim' });
            body.appendChild(karte('⚠ VERKEHR', 'ABSEITS DEINER STRECKE', s.stau.rest.length + (s.stau.rest.length === 1 ? ' Meldung' : ' Meldungen'), z));
        }

        // Termin
        if (s.termin) body.appendChild(karte('◆ NÄCHSTER TERMIN', hhmm(s.termin.wann) + ' UHR', s.termin.name, [{ t: s.termin.ort + (s.termin.min ? ' · Fahrzeit ca. ' + s.termin.min + ' Min.' : ''), c: 'dim' }], navi(s.termin.ort)));

        const kn = el('div', 'knoepfe');
        const b1 = el('button', 'p', 'AUF KARTE ▶'); b1.addEventListener('click', () => { close(); try { if (typeof openPanel === 'function') openPanel('karte'); } catch (e) {} });
        const b2 = el('button', '', 'AKTUALISIEREN'); b2.addEventListener('click', () => { b2.textContent = 'LÄDT …'; b2.disabled = true; b2.style.opacity = '.6'; refresh(false); });
        kn.appendChild(b1); kn.appendChild(b2); body.appendChild(kn);
        body.appendChild(el('div', 'fuss', 'Stand ' + hhmm(new Date(s.zeit)) + ' Uhr'));
    }

    /* ---------- Ortsnamen für Meldungen ohne Straße/Ort ---------- */
    const ortCache = {};
    async function ortsname(lat, lon) {
        const k = lat.toFixed(3) + ',' + lon.toFixed(3);
        if (ortCache[k] !== undefined) return ortCache[k];
        try {
            const r = await mit(fetch('https://nominatim.openstreetmap.org/reverse?format=json&zoom=16&accept-language=de&lat=' + lat + '&lon=' + lon), 5000);
            const d = r && r.ok ? await r.json() : null, a = (d && d.address) || {};
            return (ortCache[k] = [a.road || a.pedestrian || '', a.suburb || a.village || a.town || a.city || a.municipality || ''].filter(Boolean).join(', '));
        } catch (e) { return (ortCache[k] = ''); }
    }
    async function orteNachladen(s) {
        const kand = s.stau.rest.filter(p => !p.von && !(p.strassen && p.strassen[0])).slice(0, 3);
        for (const p of kand) {
            const n = await ortsname(p.lat, p.lon);
            if (n) p.von = n;
            if (state !== s) return;
            await new Promise(r => setTimeout(r, 1100));
        }
        if (state === s && kand.length && view === 'umkreis') zeichne();
    }

    async function refresh(sprich) {
        const nr = ++ladeNr;
        const s = await laden();
        if (!layer || nr !== ladeNr) return;
        state = s; if (view === 'umkreis') zeichne();
        if (s.fehler) { if (sprich) sagen(s.fehler); return; }
        if (sprich) sagen('Lagebild. ' + (sprache(s) || 'Im Moment gibt es nichts Besonderes.'));
        orteNachladen(s);
    }
    function layerBauen() {
        if (layer) return;
        stil();
        layer = el('div'); layer.id = 'jvLage';
        const inn = el('div', 'in'); layer.appendChild(inn);
        const kopf = el('div', 'kopf'); const l = el('div'); l.appendChild(el('b', '', 'LAGEBILD')); l.appendChild(el('small', '', 'Zane · dein Umkreis')); kopf.appendChild(l);
        const x = el('button', 'x', '✕'); x.setAttribute('aria-label', 'Lagebild schließen'); x.addEventListener('click', close); kopf.appendChild(x);
        inn.appendChild(kopf); body = el('div'); inn.appendChild(body);
        document.body.appendChild(layer);
        layer._klein = l.querySelector('small');
    }
    function kopfText() {
        if (!layer || !layer._klein) return;
        layer._klein.textContent = view === 'ziel' ? 'Zane · deine Fahrt' : view === 'orte' ? 'Zane · in deiner Nähe' : 'Zane · dein Umkreis';
    }
    function open(sprich) {
        if (layer && view === 'umkreis') return;
        layerBauen();
        view = 'umkreis'; kopfText();
        clearInterval(timer);
        if (!state) { zeichne(); } else zeichne();
        refresh(!!sprich);
        timer = setInterval(() => refresh(false), 5 * 60000);
    }
    function close() {
        if (!layer) return;
        clearInterval(timer); ladeNr++; layer.remove(); layer = null; body = null; state = null; view = 'umkreis'; zielD = null; orteD = null; wegD = null;
    }

    /* ---------- Ansicht "Ziel": Route zu X, Wann losfahren, Stau auf der Strecke ---------- */
    function zurueckKnopf() { const b = el('button', '', '◀ LAGEBILD'); b.addEventListener('click', () => { state = null; open(true); }); return b; }
    function ziel(d) {
        if (!d || !d.map) return false;
        zielD = d; view = 'ziel'; wegD = null;
        layerBauen(); clearInterval(timer); ladeNr++; kopfText(); zeichne();
        try { layer.scrollTo(0, 0); } catch (e) {}
        return true;
    }
    /* Meldungen, die wirklich auf der Strecke liegen (Sperrungen enger, sonst 600 m); auch für den gesprochenen Satz (fahrtcheck.js) */
    function aufStrecke(m) {
        return (m && m.warnings || []).filter(w => m.coords && distToLine(w.lat, w.lon, m.coords) <= (/sperr|gesperrt/i.test((w.title || '') + ' ' + (w.text || '')) ? 0.25 : 0.6));
    }
    function zeichneZiel() {
        const d = zielD, m = d.map, min = m.fahrtMin + (m.stauMin || 0), km = Math.round(Number(m.km));
        const auf = aufStrecke(m);
        const z = [];
        if (d.untertitel) { const ab = String(d.untertitel).match(/Abfahrt bis .+$/); if (ab) z.push({ t: ab[0].replace(/(\d{1,2}) Uhr (\d{1,2})\b/, (x, h, m) => h.padStart(2, '0') + ':' + m.padStart(2, '0') + ' Uhr'), c: 'dim' }); }
        if (auf.length) auf.slice(0, 3).forEach(x => z.push({ t: '⚠ ' + x.title + (x.road && /^A\d+$/.test(x.road) && String(x.title).indexOf(x.road) < 0 ? ' (' + x.road + ')' : ''), c: 'bad' }));
        else z.push({ t: '✓ Frei, keine Meldungen auf der Strecke', c: 'ok' });
        if (auf.length > 3) z.push({ t: '+ ' + (auf.length - 3) + ' weitere Meldungen', c: 'dim' });
        body.appendChild(karte('🎯 ' + String(d.titel || 'ZIEL').toUpperCase().slice(0, 48), (m.terminMs && m.terminMs - Date.now() > (min || 0) * 60000 + 5 * 60000) ? 'TERMIN ' + hhmm(new Date(m.terminMs)) : 'ANKUNFT ' + hhmm(new Date(Date.now() + (min || 0) * 60000)), min + ' Min · ' + km + ' km', z));
        // Street-View-Foto vom Ziel (js/streetview.js); ohne Foto oder ohne die Datei bleibt alles wie vorher
        try {
            const lp = Array.isArray(m.coords) && m.coords.length ? m.coords[m.coords.length - 1] : null;
            if (typeof window.jvStreetViewBild === 'function' && lp && isFinite(lp[0]) && isFinite(lp[1])) body.appendChild(window.jvStreetViewBild(lp[0] + ',' + lp[1]));
        } catch (e) {}
        const extra = (d.zeilen || []).filter(x => x && x.text);
        if (extra.length) body.appendChild(karte('UNTERWEGS & AM ZIEL', '', null, extra.map(x => ({ t: x.text, c: '' }))));
        // Kategorien auf der Strecke (Tippen = Suche entlang der Route)
        body.appendChild(el('div', 'z dim', 'AUF DEM WEG SUCHEN:'));
        const kat = el('div', 'knoepfe wrap');
        WEG_KAT.forEach(k => {
            const b = el('button', (wegD && String(wegD.was) === String(k.q)) ? 'an' : '', k.icon + ' ' + k.name.toUpperCase());
            b.addEventListener('click', () => { suchAufDemWeg(k.q, k.name).catch(e => console.error('Lagebild Weg', e)); });
            kat.appendChild(b);
        });
        const bm = el('button', '', '🎤 ETWAS ANDERES'); bm.addEventListener('click', () => { try { if (typeof startListening === 'function') startListening(false); } catch (e) {} });
        kat.appendChild(bm);
        body.appendChild(kat);
        if (wegD) {
            if (wegD.lade) body.appendChild(karte('📍 ' + (wegD.name || wegD.was).toUpperCase().slice(0, 22) + ' · AUF DEM WEG', '', null, [{ t: 'Ich suche entlang der Strecke …', c: 'dim' }]));
            else if (!wegD.items.length) body.appendChild(karte('📍 ' + (wegD.name || wegD.was).toUpperCase().slice(0, 22) + ' · AUF DEM WEG', '', null, [{ t: wegD.fehler ? 'Die Suche ging gerade nicht (Google Places).' : 'Nichts gefunden: ' + (wegD.name || wegD.was), c: 'dim' }]));
            else { body.appendChild(el('div', 'hinweis', 'Tippen auf eine Karte öffnet die Route')); wegD.items.forEach((x, i) => body.appendChild(karte('📍 ' + x.name.slice(0, 26), x.status ? x.status.toUpperCase() : '', null, [{ t: x.ab, c: 'dim' }], () => { try { window.open(x.href, '_blank'); } catch (e) {} }))); }
        }
        const kn = el('div', 'knoepfe');
        const b1 = el('button', 'p', 'NAVIGATION ▶'); b1.addEventListener('click', () => { try { const a = m.to && isFinite(m.to.lat) ? m.to.lat + ',' + m.to.lon : d.titel; window.open(buildMapsLink(a, '', 'driving'), '_blank'); } catch (e) {} });
        const b2 = el('button', '', 'KARTE'); b2.addEventListener('click', () => { const md = d.map; close(); try { openPanel('karte', { mapData: md }); } catch (e) {} });
        kn.appendChild(b1); kn.appendChild(b2); body.appendChild(kn);
        const kn2 = el('div', 'knoepfe'); kn2.appendChild(zurueckKnopf()); body.appendChild(kn2);
        body.appendChild(el('div', 'fuss', 'Stand ' + hhmm(new Date()) + ' Uhr'));
    }

    /* ---------- Ansicht "Orte": Wo ist der nächste Penny, Apotheke in der Nähe ---------- */
    function orte(cards, tank) {
        if (!Array.isArray(cards) || !cards.length) return false;
        orteD = cards; orteTank = !!tank; view = 'orte';
        layerBauen(); clearInterval(timer); ladeNr++; kopfText(); zeichne();
        try { layer.scrollTo(0, 0); } catch (e) {}
        return true;
    }
    function zeichneOrte() {
        body.appendChild(el('div', 'hinweis', 'Tippen auf eine Karte öffnet die Route'));
        orteD.forEach((c, i) => {
            const k = karte((orteTank ? '⛽' : (c.icon || '📍')) + (i === 0 ? (orteTank ? ' DIESEL · GÜNSTIGSTER' : ' AM NÄCHSTEN') : ''), '', orteTank ? String(c.title).replace(/^🟢\s*GÜNSTIGSTER PREIS\s*·\s*/, '') : c.title, [{ t: String(c.subtitle || '').replace(/\s*·\s*Tippen: Route\s*$/, ''), c: 'dim' }], () => { try { window.open(c.href, '_blank'); } catch (e) {} });
            body.appendChild(k);
        });
        const kn = el('div', 'knoepfe'); kn.appendChild(zurueckKnopf()); body.appendChild(kn);
        body.appendChild(el('div', 'fuss', orteTank ? 'Quelle: Tankerkönig, Preise in Euro pro Liter, im Umkreis von ' + TANK_KM + ' km.' : quelleOrte()));
    }
    const istTankKarte = c => c && /^(🟢|⛽)/.test(String(c.icon || '')) && /\d,\d{3} €\s*$/.test(String(c.title || ''));
    const istOrtKarte = c => c && c.href && / · /.test(String(c.title || '')) && /google\.com\/maps\/dir\/\?[^ ]*destination=-?\d+(?:\.\d+)?,-?\d+(?:\.\d+)?/.test(c.href);

    window.jvLage = { open, close, isOpen: () => !!layer, ziel, orte, aufStrecke };
    window.jvRadar = window.jvLage;   // alte Bezeichnung bleibt gültig

    /* ---------- Umleiten: alles läuft über das Lagebild ---------- */
    // Orte in der Nähe ("Wo ist der nächste Penny?"): die Treffer-Karten erscheinen zusätzlich im Lagebild
    const origKarten = window.showActionCards;
    if (typeof origKarten === 'function' && !origKarten._jvLage) {
        window.showActionCards = function (cards) {
            const r = origKarten.apply(this, arguments);
            try { if (Array.isArray(cards) && cards.length && cards.every(istOrtKarte)) orte(cards); else if (Array.isArray(cards) && cards.length && cards.every(istTankKarte)) orte(cards, true); } catch (e) { console.error('Lagebild Orte', e); }
            return r;
        };
        window.showActionCards._jvLage = true;
    }
    // "Route zu X" / "Bring mich zu X" mit dem Auto: statt Google Maps zu öffnen erst rechnen und das Lagebild mit Fahrzeit, Stau und Wetter zeigen
    const origAktion = window.executeAction;
    if (typeof origAktion === 'function' && !origAktion._jvLage) {
        // A5: Die Umhüllung wird über die Aktions-Kette (aktionen_kette.js) angemeldet, Rang 60. Sie gibt (wie früher) die Merkmale der inneren Funktion NICHT weiter (erbt:false). Fehlt die Kette, legt die Datei sie wie früher selbst um window.executeAction.
        const baue = function (origAktion) {
            const wrapped = async function (action, text, ctx) {
                try {
                    if (action && action.type === 'navigate' && action.nav_to && !String(action.nav_from || '').trim() && /^(|driving)$/.test(String(action.nav_mode || '').toLowerCase().trim()) &&
                        typeof resolveTravelDestination === 'function' && typeof window.computeDepartureAdvice === 'function' && ctx && Array.isArray(ctx.notes)) {
                        const k = String(action.nav_to).toLowerCase().replace(/[^a-zäöüß]/g, '');
                        if (!/^(parkplatz|meinparkplatz|auto|meinauto|geparktesauto)$/.test(k)) {
                            const res = await window.computeDepartureAdvice({ query: text || String(action.nav_to), destination: resolveTravelDestination(text, action.nav_to), wantFuel: true });
                            if (res && res.reply) {
                                ctx.notes.push(res.reply);
                                if (typeof updateTerminalStream === 'function') updateTerminalStream('LAGEBILD: ZIEL');
                                return;
                            }
                        }
                    }
                } catch (e) { if (e && e.auth) throw e; console.error('Lagebild Ziel', e); }
                return origAktion.apply(this, arguments);
            };
            wrapped._jvLage = true;
            return wrapped;
        };
        if (window.jvAktionen && typeof window.jvAktionen.huelle === 'function') window.jvAktionen.huelle('lagebild', 60, baue, { erbt: false });
        else window.executeAction = baue(origAktion);
    }
    // "Wo tanke ich günstig auf dem Weg zu X": Diesel an der Strecke im Lagebild zeigen, nicht auf der dunklen HUD-Karte (E10/E5 bleiben beim Alten)
    const origTank = window.fuelAlongRouteAdvice;
    if (typeof origTank === 'function' && !origTank._jvLage) {
        window.fuelAlongRouteAdvice = async function (opts) {
            try {
                const ft = String((opts && opts.fuelType) || 'diesel').toLowerCase();
                if (opts && opts.destination && ft === 'diesel' && typeof window.computeDepartureAdvice === 'function') {
                    const res = await window.computeDepartureAdvice({ query: opts.destLabel || String(opts.destination), destination: opts.destination, wantFuel: true });
                    if (res && res.reply) {
                        const sp = res.sprit;
                        const extra = sp && sp.preis > 0 ? ' Der günstigste Diesel an der Strecke: ' + (sp.name || 'eine Tankstelle') + ' für ' + sp.preis.toFixed(3).replace('.', ',') + ' Euro.' : ' An der Strecke habe ich keine Tankstelle gefunden.';
                        return { reply: res.reply + extra, cards: [], map: null, fuel: null, label: null };
                    }
                }
            } catch (e) { if (e && (e.userMessage || e.auth)) throw e; console.error('Lagebild Tanken', e); }
            return origTank.apply(this, arguments);
        };
        window.fuelAlongRouteAdvice._jvLage = true;
    }


    /* ---------- "Gibt es eine Apotheke auf dem Weg?" (nur in der Ziel-Ansicht) ---------- */
    function punkteAmWeg(coords) {
        const n = coords.length, out = [];
        const k = Math.min(5, Math.max(2, Math.round(n / 60)));
        for (let i = 1; i <= k; i++) out.push(coords[Math.min(n - 1, Math.floor(n * i / (k + 1)))]);
        return out;
    }
    const WEG_KAT = [
        { icon: '🍔', name: 'Restaurants', q: ['Fast Food', 'Restaurant'] },   // Fast Food extra, sonst kommen kaum McDonald's & Co.,
        { icon: '⛽', name: 'Tankstellen', q: 'Tankstelle' },
        { icon: '🔨', name: 'Baumärkte', q: 'Baumarkt' },
        { icon: '🛒', name: 'Supermärkte', q: 'Supermarkt' },
        { icon: '☕', name: 'Cafés', q: 'Café' }
    ];
    // Orte per Google Places (über deinen Server). Liefert Einträge im Format { lat, lon, tags:{name}, g:{openNow} }
    async function sucheOrteGoogle(was, lat, lon, radiusM) {
        const r = await apiFetch('/api/maps?action=places&q=' + encodeURIComponent(was) + '&lat=' + Number(lat).toFixed(6) + '&lon=' + Number(lon).toFixed(6) + '&radius=' + Math.round(radiusM || 6000));
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d || !Array.isArray(d.places)) throw new Error((d && d.error) || ('Status ' + r.status));
        return d.places.map(p => ({ lat: Number(p.lat), lon: Number(p.lon), tags: { name: p.name || '' }, g: { openNow: p.openNow } })).filter(e => isFinite(e.lat) && isFinite(e.lon));
    }
    if (typeof window.jvGoogleElements !== 'function') window.jvGoogleElements = sucheOrteGoogle;
    async function suchAufDemWeg(was, anzeige) {
        const m = zielD && zielD.map;
        if (!m || !m.coords || m.coords.length < 2) { sagen('Dafür brauche ich erst eine Route. Sag zum Beispiel: Route zu Hamburg.'); return; }
        const name = anzeige || was;
        sagen('Ich suche ' + name + ' auf dem Weg.');
        wegD = { was, name, items: [], lade: true }; if (view === 'ziel' && body) zeichne();
        const fragen = Array.isArray(was) ? was : [was];
        let pts = punkteAmWeg(m.coords);
        if (fragen.length > 1 && pts.length > 4) pts = pts.filter((_, i) => i % 2 === 0 || i === pts.length - 1).slice(0, 4);   // spart Abfragen (Monatslimit)
        let fehler = 0;
        const jobs = [];
        pts.forEach(p => fragen.forEach(q => jobs.push(mit(window.jvGoogleElements(q, p[0], p[1], 6000).catch(() => { fehler++; return []; }), 12000))));
        const alle = await Promise.all(jobs);
        const gesehen = new Set(), items = [];
        alle.forEach(l => (l || []).forEach(e => {
            const nm = (e.tags && e.tags.name) || '';
            const key = nm + '|' + Number(e.lat).toFixed(4) + ',' + Number(e.lon).toFixed(4);
            if (!nm || gesehen.has(key)) return;
            gesehen.add(key);
            const ab = distToLine(e.lat, e.lon, m.coords);
            if (ab > 2.5) return;   // höchstens 2,5 km abseits der Strecke
            const g = e.g || {}, st = g.openNow === true ? 'offen' : g.openNow === false ? 'geschlossen' : '';
            const to = m.to && isFinite(m.to.lat) ? m.to.lat + ',' + m.to.lon : (zielD.titel || '');
            items.push({ name: nm, ab: ab < 0.15 ? 'direkt an der Strecke' : (ab < 1 ? Math.round(ab * 10) * 100 + ' m Umweg' : ab.toFixed(1).replace('.', ',') + ' km abseits'), abKm: ab, status: st, href: 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(to) + '&waypoints=' + encodeURIComponent(e.lat + ',' + e.lon) + '&travelmode=driving' });
        }));
        items.sort((a, b) => (a.abKm + (a.status === 'geschlossen' ? 3 : 0)) - (b.abKm + (b.status === 'geschlossen' ? 3 : 0)));   // Geschlossene rutschen nach hinten
        wegD = { was, name, items: items.slice(0, 6), fehler: fehler >= jobs.length };
        if (view === 'ziel' && body) zeichne();
        if (!items.length) { sagen(fehler >= jobs.length ? 'Die Suche ging gerade nicht, Google Places antwortet nicht.' : 'Auf dem Weg habe ich ' + name + ' nicht gefunden.'); return; }
        const e0 = items[0];
        sagen('Ja, ' + e0.name + ', ' + (e0.abKm < 0.15 ? 'direkt an der Strecke' : 'etwa ' + (e0.abKm < 1 ? Math.round(e0.abKm * 10) * 100 + ' Meter' : e0.abKm.toFixed(1).replace('.', ',') + ' Kilometer') + ' abseits') + (e0.status ? ', ' + e0.status : '') + '.' + (items.length > 1 ? ' Weitere stehen im Lagebild.' : ''));
    }
    if (window.jvCommands) {
        window.jvCommands.use('lageweg', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (!(layer && view === 'ziel' && zielD) || t.length > 80) return next(text);
            const m = t.match(/^(?:jarvis )?(?:gibt es|gibt's|ist|sind|finde|such|suche|zeig mir|zeig)?\s*(?:da |dort )?(?:eine?n?|keine?n?|irgendeine?n?|ne|nen)?\s*(.+?)\s+(?:auf dem weg|auf der strecke|unterwegs|an der strecke|entlang der strecke)(?: gibt es| gibt's)?$/);
            // Auch mit "auf dem Weg" VOR dem Gesuchten: "Gibt es auf dem Weg ein McDonald's", "Ist unterwegs irgendwo eine Apotheke"
            let m2 = m;
            if (!m2) {
                const m3 = t.match(/^(?:jarvis )?(?:gibt es|gibt's|ist|sind|finde|such|suche|zeig mir|zeig)?\s*(?:da |dort |hier )?(?:auf dem weg|auf der strecke|unterwegs|an der strecke|entlang der strecke|auf dem weg dorthin)\s*(?:gibt es |gibt's |ist |sind )?(?:da |dort |irgendwo |vielleicht )*(?:eine?n?|keine?n?|irgendeine?n?|ne|nen)?\s*(.+)$/);
                if (m3) m2 = m3;
            }
            if (!m2 || !m2[1] || /^(?:stau|regen|wetter|diesel|tankstelle für diesel)$/.test(m2[1])) return next(text);
            const was = m2[1].replace(/^(?:gibt es|gibt's|ist|sind)\s+/, '').replace(/\b(?:so|mal|vielleicht|bitte|noch|irgendwo)\b/g, '').replace(/\s+/g, ' ').trim();
            if (!was) return next(text);
            suchAufDemWeg(was.charAt(0).toUpperCase() + was.slice(1)).catch(e => console.error('Lagebild Weg', e));
            return true;
        }, 139);
    }

    /* ---------- Sprache ---------- */
    if (window.jvCommands) {
        window.jvCommands.use('lagebild', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            if (t.length > 50) return next(text);
            if (layer && /^(?:jarvis )?(?:lagebild |radar |lage )?(?:schließ\w*|schliess\w*|zumachen|ausblenden|beenden|zurück)(?: (?:lagebild|radar|lage))?$|^(?:jarvis )?(?:lagebild|radar) (?:aus|zu)$/.test(t)) { close(); return true; }
            if (/^(?:jarvis )?(?:(?:zeig(?:e)?(?: mir)?|öffne|starte|mach|schalte|gib mir) )?(?:(?:das|den|die|mein|meine) )?(?:radar(?:ansicht)?|lagebild|lage)(?: (?:an|auf|ein|öffnen|starten|zeigen|bitte))*$|^(?:jarvis )?wie ist (?:die|meine) lage(?: heute| gerade| jetzt)?$/.test(t)) { open(true); return true; }
            return next(text);
        }, 140);
    }
})();
