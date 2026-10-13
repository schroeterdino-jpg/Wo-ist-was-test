/* ============================================================
   SONNE UND MOND: "Wann geht die Sonne unter?", "Sonnenaufgang", "Wie lange ist es noch hell?", "Wann geht der Mond auf?",
   "Wann ist Vollmond?", "Wie ist der Mond heute?", "Wann ist Neumond?".
   Alles wird in der App berechnet (Rechenverfahren der Astronomie, wie in der freien Bibliothek SunCalc), es ist keine Schnittstelle nötig.
   Der Standort kommt vom Handy; ohne Standort rechnet Jarvis mit Hamburg und sagt das dazu.
   Bei Mond-Fragen öffnet sich ein Fenster mit Mondbild (extrafenster.js; ohne diese Datei erscheinen Karten).
   Wird von erweiterungen.js in die festen Sprachbefehle eingehängt. Braucht: speak (voice.js), showActionCards/clearActionCards.
   ============================================================ */
(function () {
    const rad = Math.PI / 180, dayMs = 86400000, J1970 = 2440588, J2000 = 2451545, E = rad * 23.4397, J0 = 0.0009;
    const FALLBACK = { lat: 53.55, lon: 10.0, guessed: true };   // Hamburg, wenn das Handy keinen Standort liefert

    function say(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }
    function showCards(cards) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(cards);
        } catch (e) {}
    }

    /* ---------- Rechnerei ---------- */
    const toJulian = d => d.valueOf() / dayMs - 0.5 + J1970;
    const toDays = d => toJulian(d) - J2000;
    const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(E) - Math.tan(b) * Math.sin(E), Math.cos(l));
    const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(E) + Math.cos(b) * Math.sin(E) * Math.sin(l));
    const siderealTime = (d, lw) => rad * (280.16 + 360.9856235 * d) - lw;
    const solarMeanAnomaly = d => rad * (357.5291 + 0.98560028 * d);
    function eclipticLongitude(M) {
        const C = rad * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M)), P = rad * 102.9372;
        return M + C + P + Math.PI;
    }
    function sunCoords(d) { const M = solarMeanAnomaly(d), L = eclipticLongitude(M); return { dec: declination(L, 0), ra: rightAscension(L, 0) }; }
    const julianCycle = (d, lw) => Math.round(d - J0 - lw / (2 * Math.PI));
    const approxTransit = (Ht, lw, n) => J0 + (Ht + lw) / (2 * Math.PI) + n;
    const solarTransitJ = (ds, M, L) => J2000 + ds + 0.0053 * Math.sin(M) - 0.0069 * Math.sin(2 * L);
    const hourAngle = (h, phi, d) => Math.acos((Math.sin(h) - Math.sin(phi) * Math.sin(d)) / (Math.cos(phi) * Math.cos(d)));
    const fromJulian = j => new Date((j + 0.5 - J1970) * dayMs);

    /* Sonnenaufgang und -untergang für den Tag, in dem "date" liegt (Mittag als Bezug) */
    function sunTimes(date, lat, lon) {
        const lw = rad * -lon, phi = rad * lat, d = toDays(date), n = julianCycle(d, lw), ds = approxTransit(0, lw, n);
        const M = solarMeanAnomaly(ds), L = eclipticLongitude(M), dec = declination(L, 0), Jnoon = solarTransitJ(ds, M, L);
        const w = hourAngle(-0.833 * rad, phi, dec);
        if (isNaN(w)) return { rise: null, set: null };
        const Jset = solarTransitJ(approxTransit(w, lw, n), M, L), Jrise = Jnoon - (Jset - Jnoon);
        return { rise: fromJulian(Jrise), set: fromJulian(Jset) };
    }

    function moonCoords(d) {
        const L = rad * (218.316 + 13.176396 * d), M = rad * (134.963 + 13.064993 * d), F = rad * (93.272 + 13.229350 * d);
        const l = L + rad * 6.289 * Math.sin(M), b = rad * 5.128 * Math.sin(F), dt = 385001 - 20905 * Math.cos(M);
        return { ra: rightAscension(l, b), dec: declination(l, b), dist: dt };
    }
    function astroRefraction(h) { if (h < 0) h = 0; return 0.0002967 / Math.tan(h + 0.00312536 / (h + 0.08901179)); }
    function moonAltitude(date, lat, lon) {
        const lw = rad * -lon, phi = rad * lat, d = toDays(date), c = moonCoords(d), H = siderealTime(d, lw) - c.ra;
        let h = Math.asin(Math.sin(phi) * Math.sin(c.dec) + Math.cos(phi) * Math.cos(c.dec) * Math.cos(H));
        return h + astroRefraction(h);
    }
    function hoursLater(date, h) { return new Date(date.valueOf() + h * dayMs / 24); }

    /* Mondaufgang und -untergang für den Kalendertag (Ortszeit des Handys) */
    function moonTimes(date, lat, lon) {
        const t = new Date(date); t.setHours(0, 0, 0, 0);
        const hc = 0.133 * rad;
        let h0 = moonAltitude(t, lat, lon) - hc, rise = null, set = null;
        for (let i = 1; i <= 24; i += 2) {
            const h1 = moonAltitude(hoursLater(t, i), lat, lon) - hc, h2 = moonAltitude(hoursLater(t, i + 1), lat, lon) - hc;
            const a = (h0 + h2) / 2 - h1, b = (h2 - h0) / 2, xe = -b / (2 * a), ye = (a * xe + b) * xe + h1, disc = b * b - 4 * a * h1;
            let roots = 0, x1 = 0, x2 = 0;
            if (disc >= 0) {
                const dx = Math.sqrt(disc) / (Math.abs(a) * 2);
                x1 = xe - dx; x2 = xe + dx;
                if (Math.abs(x1) <= 1) roots++;
                if (Math.abs(x2) <= 1) roots++;
                if (x1 < -1) x1 = x2;
            }
            if (roots === 1) { if (h0 < 0) rise = i + x1; else set = i + x1; }
            else if (roots === 2) { rise = i + (ye < 0 ? x2 : x1); set = i + (ye < 0 ? x1 : x2); }
            if (rise !== null && set !== null) break;
            h0 = h2;
        }
        return { rise: rise !== null ? hoursLater(t, rise) : null, set: set !== null ? hoursLater(t, set) : null };
    }

    /* Mondphase: 0 = Neumond, 0.5 = Vollmond, 1 = wieder Neumond */
    function moonIllumination(date) {
        const d = toDays(date), s = sunCoords(d), m = moonCoords(d), sdist = 149598000;
        const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
        const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
        const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
        return { fraction: (1 + Math.cos(inc)) / 2, phase: 0.5 + 0.5 * inc * (angle < 0 ? -1 : 1) / Math.PI };
    }

    /* Nächster Vollmond (target 0.5) oder Neumond (target 0): erst stundenweise suchen, dann minutengenau */
    function nextPhase(target, from) {
        const start = (from || new Date()).getTime();
        const crossed = (prev, cur) => target === 0.5 ? (prev < 0.5 && cur >= 0.5) : (prev > 0.9 && cur < 0.1);
        let prev = moonIllumination(new Date(start)).phase;
        for (let h = 1; h <= 24 * 32; h++) {
            const cur = moonIllumination(new Date(start + h * 3600000)).phase;
            if (crossed(prev, cur)) {
                let p = moonIllumination(new Date(start + (h - 1) * 3600000)).phase;
                for (let mi = 1; mi <= 60; mi++) {
                    const c = moonIllumination(new Date(start + (h - 1) * 3600000 + mi * 60000)).phase;
                    if (crossed(p, c)) return new Date(start + (h - 1) * 3600000 + mi * 60000);
                    p = c;
                }
                return new Date(start + h * 3600000);
            }
            prev = cur;
        }
        return null;
    }

    function phaseName(p) {
        if (p < 0.03 || p >= 0.97) return 'Neumond';
        if (p < 0.22) return 'zunehmende Sichel';
        if (p < 0.28) return 'zunehmender Halbmond (erstes Viertel)';
        if (p < 0.47) return 'zunehmender Mond';
        if (p < 0.53) return 'Vollmond';
        if (p < 0.72) return 'abnehmender Mond';
        if (p < 0.78) return 'abnehmender Halbmond (letztes Viertel)';
        return 'abnehmende Sichel';
    }

    /* ---------- Standort und Text ---------- */
    let posCache = null;
    function position() {
        return new Promise(resolve => {
            if (posCache && Date.now() - posCache.at < 10 * 60000) return resolve(posCache.pos);
            if (!navigator.geolocation) return resolve(FALLBACK);
            navigator.geolocation.getCurrentPosition(
                p => { const pos = { lat: p.coords.latitude, lon: p.coords.longitude, guessed: false }; posCache = { pos, at: Date.now() }; resolve(pos); },
                () => resolve(FALLBACK),
                { timeout: 7000, maximumAge: 10 * 60000 }
            );
        });
    }
    function berlinHM(d) {
        const s = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false });
        const [h, m] = s.split(':');
        return { h: parseInt(h, 10), m, short: `${String(parseInt(h, 10)).padStart(2, '0')}:${m}` };
    }
    function spoken(d) { const t = berlinHM(d); return t.m === '00' ? `${t.h} Uhr` : `${t.h} Uhr ${t.m}`; }
    function dayWord(n) { return n === 0 ? 'heute' : n === 1 ? 'morgen' : 'übermorgen'; }
    function dateText(d) { return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' }); }
    function daysFromNow(d) {
        const a = new Date(); a.setHours(12, 0, 0, 0);
        const b = new Date(d); b.setHours(12, 0, 0, 0);
        return Math.round((b - a) / dayMs);
    }
    function untilText(n) { return n <= 0 ? 'heute' : n === 1 ? 'morgen' : n === 2 ? 'übermorgen' : `in ${n} Tagen`; }
    function guessNote(pos) { return pos.guessed ? ' Ihren Standort kenne ich gerade nicht, ich habe mit Hamburg gerechnet.' : ''; }
    function noonOf(offset) { const d = new Date(); d.setDate(d.getDate() + offset); d.setHours(12, 0, 0, 0); return d; }

    /* ---------- Mond-Fenster (Bild) ---------- */
    let svgCounter = 0;
    function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

    /* Mond als Bild (SVG) für die Phase p (0 = Neumond, 0.5 = Vollmond), Nordhalbkugel: zunehmend rechts beleuchtet */
    function moonSvg(p, size) {
        const R = 100, uid = ++svgCounter, cosv = Math.cos(2 * Math.PI * p), rx = Math.abs(cosv) * R, waxing = p < 0.5;
        let lit;
        if (p < 0.012 || p > 0.988) lit = '';
        else if (waxing) lit = `M 0 ${-R} A ${R} ${R} 0 0 1 0 ${R} A ${rx.toFixed(2)} ${R} 0 0 ${cosv > 0 ? 0 : 1} 0 ${-R} Z`;
        else lit = `M 0 ${-R} A ${R} ${R} 0 0 0 0 ${R} A ${rx.toFixed(2)} ${R} 0 0 ${cosv > 0 ? 1 : 0} 0 ${-R} Z`;
        const craters = [[-35, -30, 18], [25, -45, 12], [40, 15, 22], [-20, 35, 15], [-55, 8, 9], [8, 2, 8], [2, 62, 10], [-60, -52, 7], [58, -20, 8]]
            .map(c => `<circle cx="${c[0]}" cy="${c[1]}" r="${c[2]}" fill="#8a8468" opacity=".26"/>`).join('');
        const glow = (1 - Math.cos(2 * Math.PI * p)) / 2;
        return `<svg viewBox="-112 -112 224 224" width="${size}" height="${size}" style="display:block;margin:0 auto;filter:drop-shadow(0 0 ${Math.round(6 + glow * 20)}px rgba(255,246,205,${(0.1 + glow * 0.3).toFixed(2)}))" aria-hidden="true">` +
            `<defs><radialGradient id="xm${uid}" cx="38%" cy="34%" r="80%"><stop offset="0" stop-color="#fffdf0"/><stop offset=".55" stop-color="#e9e3c8"/><stop offset="1" stop-color="#b3ad8f"/></radialGradient>` +
            (lit ? `<clipPath id="xc${uid}"><path d="${lit}"/></clipPath>` : '') + `</defs>` +
            `<circle r="100" fill="#0d1a27" stroke="rgba(93,209,255,.4)" stroke-width="1.5"/>` +
            `<circle r="100" fill="none" stroke="rgba(120,150,180,.14)" stroke-width="10"/>` +
            (lit ? `<path d="${lit}" fill="url(#xm${uid})"/><g clip-path="url(#xc${uid})">${craters}</g>` : '') +
            `</svg>`;
    }

    function phaseRow(label, value, sub) {
        return `<div style="display:flex;justify-content:space-between;gap:10px;padding:8px 0;border-top:1px solid rgba(93,209,255,.12)">` +
            `<span style="color:#7fa7bd;font-size:12px">${esc(label)}</span>` +
            `<span style="text-align:right;font-size:13px;color:#e2e8f0">${value}${sub ? `<br><span style="color:#7fa7bd;font-size:11px">${esc(sub)}</span>` : ''}</span></div>`;
    }
    function miniMoon(label, p, line1, line2) {
        return `<div style="flex:1;min-width:0;text-align:center">${moonSvg(p, 64)}<div style="margin-top:6px;font-size:11px;color:#49d7ff;text-transform:uppercase;letter-spacing:.05em">${esc(label)}</div>` +
            `<div style="font-size:11px;color:#e2e8f0">${esc(line1)}</div><div style="font-size:10px;color:#7fa7bd">${esc(line2 || '')}</div></div>`;
    }
    function shortDate(d) { return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'short' }); }

    /* mode: 'today' (aktuelle Phase groß), 'full' (Vollmond groß), 'new' (Neumond groß) */
    function openMoonWindow(mode) {
        const now = new Date(), ill = moonIllumination(now), pct = Math.round(ill.fraction * 100);
        const full = nextPhase(0.5, now), neu = nextPhase(0, now);
        if (typeof window.openExtraWindow !== 'function') {
            showCards([{ icon: '🌙', title: `${phaseName(ill.phase)}, ${pct} % beleuchtet`, subtitle: full ? `Nächster Vollmond: ${dateText(full)}` : '' }].concat(neu ? [{ icon: '🌑', title: 'Nächster Neumond', subtitle: dateText(neu) }] : []));
            return;
        }
        const bigPhase = mode === 'full' ? 0.5 : mode === 'new' ? 0 : ill.phase;
        let caption, captionSub;
        if (mode === 'full' && full) { caption = 'Nächster Vollmond'; captionSub = `${dateText(full)}, ${berlinHM(full).short} Uhr · ${untilText(daysFromNow(full))}`; }
        else if (mode === 'new' && neu) { caption = 'Nächster Neumond'; captionSub = `${dateText(neu)}, ${berlinHM(neu).short} Uhr · ${untilText(daysFromNow(neu))}`; }
        else { caption = phaseName(ill.phase).replace(/^./, c => c.toUpperCase()); captionSub = `${pct} % beleuchtet · ${ill.phase < 0.5 ? 'zunehmend' : 'abnehmend'}`; }

        const html =
            `<div style="padding:6px 0 4px">${moonSvg(bigPhase, 210)}</div>` +
            `<div style="text-align:center;margin:10px 0 14px"><div style="font-size:17px;font-weight:700;color:#fff6cf">${esc(caption)}</div><div style="font-size:12px;color:#9fd8ee;margin-top:3px">${esc(captionSub)}</div></div>` +
            `<div style="display:flex;gap:8px;padding:12px 0;border-top:1px solid rgba(93,209,255,.2);border-bottom:1px solid rgba(93,209,255,.12)">` +
            miniMoon('Heute', ill.phase, `${pct} %`, phaseName(ill.phase)) +
            miniMoon('Vollmond', 0.5, full ? shortDate(full) : '–', full ? untilText(daysFromNow(full)) : '') +
            miniMoon('Neumond', 0, neu ? shortDate(neu) : '–', neu ? untilText(daysFromNow(neu)) : '') +
            `</div>` +
            `<div id="xwMoonTimes">${phaseRow('Mondaufgang heute', '…')}${phaseRow('Monduntergang heute', '…')}</div>`;
        const body = window.openExtraWindow('Mond', html);

        // Auf- und Untergang nachtragen, sobald der Standort da ist
        position().then(pos => {
            const m0 = moonTimes(noonOf(0), pos.lat, pos.lon);
            const el = body.querySelector('#xwMoonTimes');
            if (!el) return;
            el.innerHTML = phaseRow('Mondaufgang heute', m0.rise ? `${berlinHM(m0.rise).short} Uhr` : 'keiner', pos.guessed ? 'Standort geschätzt (Hamburg)' : '') +
                phaseRow('Monduntergang heute', m0.set ? `${berlinHM(m0.set).short} Uhr` : 'keiner');
        }).catch(() => {});
    }

    /* ---------- Antworten ---------- */
    async function answerSun(wantRise, wantSet, wantLight) {
        const pos = await position(), now = new Date();
        const t0 = sunTimes(noonOf(0), pos.lat, pos.lon), t1 = sunTimes(noonOf(1), pos.lat, pos.lon);
        if (!t0.rise || !t0.set) { say('Zur Sonne kann ich für Ihren Standort gerade keine Zeiten berechnen.'); return; }
        showCards([{ icon: '🌅', title: `Sonnenaufgang ${berlinHM(t0.rise).short} · Sonnenuntergang ${berlinHM(t0.set).short}`, subtitle: `Heute · morgen: ${berlinHM(t1.rise).short} und ${berlinHM(t1.set).short}${pos.guessed ? ' · Standort geschätzt' : ''}` }]);
        const parts = [];
        if (wantLight) {
            if (now < t0.rise) parts.push(`Die Sonne ist noch nicht aufgegangen, sie geht um ${spoken(t0.rise)} auf.`);
            else if (now < t0.set) {
                const mins = Math.round((t0.set - now) / 60000), h = Math.floor(mins / 60), m = mins % 60;
                const dur = h > 0 ? `${h} ${h === 1 ? 'Stunde' : 'Stunden'}${m ? ' und ' + m + ' Minuten' : ''}` : `${m} Minuten`;
                parts.push(`Es bleibt noch etwa ${dur} hell, die Sonne geht um ${spoken(t0.set)} unter.`);
            } else parts.push(`Die Sonne ist schon untergegangen, um ${spoken(t0.set)}. Morgen geht sie um ${spoken(t1.rise)} auf.`);
        } else {
            if (wantRise) parts.push(now < t0.rise ? `Die Sonne geht heute um ${spoken(t0.rise)} auf.` : `Die Sonne ist heute um ${spoken(t0.rise)} aufgegangen, morgen geht sie um ${spoken(t1.rise)} auf.`);
            if (wantSet) parts.push(now < t0.set ? `Die Sonne geht heute um ${spoken(t0.set)} unter.` : `Die Sonne ist heute um ${spoken(t0.set)} untergegangen, morgen geht sie um ${spoken(t1.set)} unter.`);
        }
        say(parts.join(' ') + guessNote(pos));
    }

    async function answerMoonTimes(wantRise, wantSet) {
        const pos = await position(), now = new Date();
        const m0 = moonTimes(noonOf(0), pos.lat, pos.lon), m1 = moonTimes(noonOf(1), pos.lat, pos.lon);
        const ill = moonIllumination(now), pct = Math.round(ill.fraction * 100);
        openMoonWindow('today');
        const parts = [];
        if (wantRise) {
            if (!m0.rise && !m1.rise) parts.push('Heute und morgen gibt es keinen Mondaufgang.');
            else if (m0.rise && now < m0.rise) parts.push(`Der Mond geht heute um ${spoken(m0.rise)} auf.`);
            else if (m0.rise) parts.push(`Der Mond ist heute um ${spoken(m0.rise)} aufgegangen${m1.rise ? `, morgen geht er um ${spoken(m1.rise)} auf` : ''}.`);
            else parts.push(`Heute gibt es keinen Mondaufgang, morgen geht der Mond um ${spoken(m1.rise)} auf.`);
        }
        if (wantSet) {
            if (!m0.set && !m1.set) parts.push('Heute und morgen gibt es keinen Monduntergang.');
            else if (m0.set && now < m0.set) parts.push(`Der Mond geht heute um ${spoken(m0.set)} unter.`);
            else if (m0.set) parts.push(`Der Mond ist heute um ${spoken(m0.set)} untergegangen${m1.set ? `, morgen geht er um ${spoken(m1.set)} unter` : ''}.`);
            else parts.push(`Heute gibt es keinen Monduntergang, morgen geht der Mond um ${spoken(m1.set)} unter.`);
        }
        parts.push(`Er ist gerade ${phaseName(ill.phase)}, zu ${pct} Prozent beleuchtet.`);
        say(parts.join(' ') + guessNote(pos));
    }

    function answerPhase(target) {
        const now = new Date(), ill = moonIllumination(now), pct = Math.round(ill.fraction * 100);
        const d = nextPhase(target, now);
        const name = target === 0.5 ? 'Vollmond' : 'Neumond';
        if (!d) { say(`Den nächsten ${name} kann ich gerade nicht berechnen.`); return; }
        const n = daysFromNow(d);
        openMoonWindow(target === 0.5 ? 'full' : 'new');
        const now50 = target === 0.5 && ill.phase >= 0.485 && ill.phase <= 0.515;
        const lead = now50 ? 'Gerade ist Vollmond. ' : '';
        say(`${lead}Der nächste ${name} ist am ${dateText(d)}, also ${untilText(n)}.`);
    }

    function answerMoonToday() {
        const now = new Date(), ill = moonIllumination(now), pct = Math.round(ill.fraction * 100);
        const full = nextPhase(0.5, now);
        openMoonWindow('today');
        say(`Der Mond ist gerade ${phaseName(ill.phase)}, zu ${pct} Prozent beleuchtet.${full ? ` Der nächste Vollmond ist am ${dateText(full)}.` : ''}`);
    }

    /* ---------- Sprachbefehle ---------- */
    function handleSonneMondCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 90) return false;
        if (/\b(wetter|regen|schirm|temperatur|grad|scheint|scheinen|sonnenbrille|sonnencreme|uv|montag|mondschein)\b/.test(t) && !/(untergang|aufgang)/.test(t)) return false;

        // Mond
        if (/\b(vollmond|neumond)\b/.test(t) && /\b(wann|nächste|nächsten|ist|kommt|haben)\b/.test(t)) {
            answerPhase(/neumond/.test(t) ? 0 : 0.5);
            return true;
        }
        if (/\b(mond|mondaufgang|monduntergang|mondphase)\b/.test(t)) {
            const rise = /(mondaufgang|\bauf\b|aufgehen|geht .*auf)/.test(t), set = /(monduntergang|\bunter\b|untergehen|geht .*unter)/.test(t);
            if (rise || set) { answerMoonTimes(rise, set); return true; }
            if (/(phase|wie ist der mond|wie sieht der mond|mond heute|mond gerade|mond aus|zunehmend|abnehmend|halbmond|sichel)/.test(t)) { answerMoonToday(); return true; }
            return false;
        }

        // Sonne
        if (/\b(sonnenuntergang|sonnenaufgang|sonne)\b/.test(t)) {
            const rise = /(sonnenaufgang|aufgang|\bauf\b|aufgehen)/.test(t), set = /(sonnenuntergang|untergang|\bunter\b|untergehen)/.test(t);
            if (rise || set) { answerSun(rise, set, false); return true; }
            return false;
        }
        if (/\b(wie lange|bis wann)\b.*\bhell\b/.test(t) || /\bwann wird es (?:dunkel|hell)\b/.test(t)) {
            answerSun(false, false, true);
            return true;
        }
        return false;
    }

    window.handleSonneMondCommand = handleSonneMondCommand;
    window._sonneMondTest = { sunTimes, moonTimes, moonIllumination, nextPhase, phaseName, moonSvg };   // nur zum Testen
})();
