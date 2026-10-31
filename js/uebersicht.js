/* ============================================================
   ÜBERSICHT (Startseite) – ersetzt die frühere Kopf-Ansicht
   Kleine Kugel oben links, Begrüßung, Schicht, Uhr und feste Felder:
   Arbeitsweg, Regen, Diesel, Schicht, Nächste Termine, Erinnerungen, Einkauf, Wetter morgen.
   Gleiche Daten wie bisher (Lagebild, Kalender, Wetter) – nichts Neues im Hintergrund:
   - Lagebild-Daten kommen zwischengespeichert aus window.jvLage.daten (höchstens alle 10 Minuten neu),
   - die Wettervorhersage höchstens alle 30 Minuten neu,
   - neu geholt wird nur beim Öffnen und wenn die App wieder sichtbar wird, es gibt keinen Netz-Timer.
   Nur die Uhr und die lokalen Felder (Termine, Erinnerungen, Einkauf) werden alle 20 Sekunden aufgefrischt, solange die Seite sichtbar ist.
   Tonbalken: grün, solange Jarvis spricht (Lautstärke aus js/sphere.js), orange, solange du sprichst (Lautstärke vom Handy-Spracherkenner, braucht die neue APK).
   Braucht: lagebild.js (jvLage.daten), schicht.js, briefing.js, storage.js, sphere.js. Fehlt etwas davon, bleibt nur das jeweilige Feld leer.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvUebersicht) return;
    const $ = id => document.getElementById(id);
    const LAGE_MS = 10 * 60000, WETTER_MS = 30 * 60000;
    const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const hhmm = d => d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
    const stand = { lage: null, wetter: null, wetterZeit: 0, wetterLauf: false };

    function setze(id, html) {
        const el = $(id);
        if (!el || el.__ueb === html) return;
        el.__ueb = html;
        el.innerHTML = html;
    }
    function tippe(id, fn) { const el = $(id); if (el && !el.__uebTap) { el.__uebTap = 1; el.addEventListener('click', () => { try { if (typeof playUiBeep === 'function') playUiBeep(); fn(); } catch (e) {} }); } }
    function panel(name) { return () => { if (typeof openPanel === 'function') openPanel(name); }; }

    /* ---------- Kopfzeile: Gruß, Schicht, Uhr ---------- */
    function kopf() {
        const jetzt = new Date();
        const h = +new Intl.DateTimeFormat('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hourCycle: 'h23' }).format(jetzt);
        const gruss = h < 5 ? 'Gute Nacht' : h < 11 ? 'Guten Morgen' : h < 17 ? 'Guten Tag' : 'Guten Abend';
        let sh = ''; try { sh = (window.jvSchichtHeute && window.jvSchichtHeute()) || ''; } catch (e) {}
        const g = $('uebGruss'); if (g && g.textContent !== gruss) g.textContent = gruss;
        const s = $('uebSchichtZeile'); const st = sh ? sh + ' heute' : 'Kein Schichtplan heute'; if (s && s.textContent !== st) s.textContent = st;
        const u = $('uebUhr'); const ut = hhmm(jetzt); if (u && u.textContent !== ut) u.textContent = ut;
        const d = $('uebDatum'); const dt = jetzt.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' }).replace(',', '').toUpperCase(); if (d && d.textContent !== dt) d.textContent = dt;
    }

    /* ---------- Felder mit Lagebild-Daten ---------- */
    function arbeitsweg(l) {
        if (!l) return '<div class="ueb-gross">–</div><div class="ueb-sub">lädt …</div>';
        if (l.fehler) return '<div class="ueb-gross">–</div><div class="ueb-sub">' + esc(l.fehler) + '</div>';
        if (!l.hatArbeit) return '<div class="ueb-gross">–</div><div class="ueb-sub">Arbeitsadresse fehlt</div>';
        if (!l.arbeit) return '<div class="ueb-gross">–</div><div class="ueb-sub">Route nicht verfügbar</div>';
        const w = l.heimweg || l.arbeit; const an = hhmm(new Date(Date.now() + w.min * 60000));
        const m = w.meldungen || [];
        const lage = m.length ? '<span class="ueb-warn">' + m.length + (m.length === 1 ? ' Meldung' : ' Meldungen') + '</span>' : '<span class="ueb-ok">frei</span>';
        return '<div class="ueb-gross">' + w.min + '<small>min</small></div><div class="ueb-sub">' + 'Ankunft ' + an + ' · ' + lage + '</div>';
    }
    function regen(l) {
        if (!l || l.fehler) return '<div class="ueb-gross">–</div><div class="ueb-sub">' + (l ? 'keine Daten' : 'lädt …') + '</div>';
        let r = null; try { r = window.jvLage.regenInfo(l); } catch (e) {}
        if (!r) return '<div class="ueb-gross">–</div><div class="ueb-sub">keine Daten</div>';
        const uhr = /^Regen ab (\d{1,2}:\d{2}) Uhr$/.exec(r.gross);
        if (uhr) return '<div class="ueb-gross ueb-warn">' + uhr[1] + '<small>Uhr</small></div><div class="ueb-sub">' + esc(r.text.replace(/^In etwa /, 'in ').replace(/ Minuten/, ' min').replace(/, aus /, ' · ').replace(/, bei dir/, '')) + '</div>';
        return '<div class="ueb-gross ' + (r.ok ? 'ueb-ok' : 'ueb-warn') + ' ueb-klein">' + esc(r.gross) + '</div><div class="ueb-sub">' + esc(r.text) + '</div>';
    }
    function diesel(l) {
        if (!l || l.fehler) return '<div class="ueb-gross">–</div><div class="ueb-sub">' + (l ? 'keine Daten' : 'lädt …') + '</div>';
        const t = l.tank && l.tank[0];
        if (!t) return '<div class="ueb-gross">–</div><div class="ueb-sub">nichts im Umkreis</div>';
        return '<div class="ueb-gross">' + t.preis.toFixed(3).replace('.', ',') + '<small>€</small></div><div class="ueb-sub">' + esc(t.name) + ' · ' + t.km.toFixed(1).replace('.', ',') + ' km</div>';
    }

    /* ---------- Schicht ---------- */
    function schicht() {
        let name = ''; try { name = (window.jvSchichtHeute && window.jvSchichtHeute()) || ''; } catch (e) {}
        if (!name) return '<div class="ueb-gross ueb-klein">Frei</div><div class="ueb-sub">kein Schichtplan heute</div>';
        const sh = /^Fr/.test(name) ? 'frueh' : 'spaet';
        let abf = ''; try { const m = window.jvPlan && window.jvPlan.abfahrtMin && window.jvPlan.abfahrtMin(sh); if (Number.isFinite(m)) abf = Math.floor(m / 60) + ':' + String(m % 60).padStart(2, '0'); } catch (e) {}
        return '<div class="ueb-gross">' + (sh === 'frueh' ? 'Früh' : 'Spät') + '</div><div class="ueb-sub">' + (abf ? 'Abfahrt ' + abf + ' Uhr' : name) + '</div>';
    }

    /* ---------- Nächste Termine (3–4) mit Fahrzeit ---------- */
    function termine(l) {
        let eintraege = [];
        try {
            const heute0 = new Date(); heute0.setHours(0, 0, 0, 0);
            const jetzt = Date.now();
            eintraege = (typeof calendarEntries !== 'undefined' ? calendarEntries : []).filter(e => e && e.isoDate && e.text && !(typeof isBirthdayEntry === 'function' && isBirthdayEntry(e)))
                .map(e => ({ e, p: parseEventDate(e.isoDate) })).filter(x => !isNaN(x.p.date.getTime()) && (x.p.allDay ? x.p.date.getTime() >= heute0.getTime() : x.p.date.getTime() > jetzt - 30 * 60000))
                .sort((a, b) => a.p.date - b.p.date).slice(0, 4);
        } catch (e) {}
        if (!eintraege.length) return '<div class="ueb-sub">Keine Termine in nächster Zeit.</div>';
        const heute0 = new Date(); heute0.setHours(0, 0, 0, 0);
        return eintraege.map(x => {
            const diff = Math.round((new Date(x.p.date.getFullYear(), x.p.date.getMonth(), x.p.date.getDate()) - heute0) / 86400000);
            const tag = diff <= 0 ? 'heute' : diff === 1 ? 'morgen' : x.p.date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' }).replace(',', '');
            const zeit = x.p.allDay ? '' : ' ' + hhmm(x.p.date);
            const fz = l && l.termin && l.termin.name === x.e.text && l.termin.min ? ' · Fahrzeit ' + l.termin.min + ' min' : '';
            return '<div class="ueb-zeile"><span><b>' + esc(x.e.text) + '</b>' + fz + '</span><span>' + esc(tag) + zeit + '</span></div>';
        }).join('');
    }

    /* ---------- Erinnerungen, Einkauf ---------- */
    function erinnerungen() {
        let liste = [];
        try {
            const jetzt = new Date();
            liste = (typeof reminderEntries !== 'undefined' ? reminderEntries : []).filter(r => r && !r.triggered && r.time && new Date(r.time) >= jetzt).sort((a, b) => new Date(a.time) - new Date(b.time));
        } catch (e) {}
        let sub = 'nichts offen';
        if (liste.length) {
            const min = Math.max(0, Math.round((new Date(liste[0].time) - Date.now()) / 60000));
            sub = (min < 60 ? 'in ' + min + ' min' : min < 1440 ? 'in ' + Math.round(min / 60) + ' Std.' : 'in ' + Math.round(min / 1440) + ' Tg.');
        }
        return '<div class="ueb-gross">' + liste.length + '</div><div class="ueb-sub">' + sub + '</div>';
    }
    function einkauf() {
        let liste = []; try { liste = typeof shoppingEntries !== 'undefined' ? shoppingEntries : []; } catch (e) {}
        if (!liste.length) return '<div class="ueb-gross">0</div><div class="ueb-sub">Liste ist leer</div>';
        const namen = liste.slice(0, 3).map(x => x.text).join(', ') + (liste.length > 3 ? ' …' : '');
        return '<div class="ueb-gross">' + liste.length + '<small>' + (liste.length === 1 ? 'Ding' : 'Dinge') + '</small></div><div class="ueb-sub">' + esc(namen) + '</div>';
    }

    /* ---------- Wetter morgen ---------- */
    function wetterMorgen() {
        const w = stand.wetter;
        if (!w) return '<div class="ueb-sub">lädt …</div>';
        if (w.fehler || !w.tage || !w.tage.length) return '<div class="ueb-sub">Vorhersage gerade nicht verfügbar.</div>';
        const t = w.tage.find(x => x.tag === 'morgen') || w.tage[1];
        if (!t) return '<div class="ueb-sub">keine Vorhersage</div>';
        const kurz = (t.wetter || '').replace(/^leicht /, '');
        const regenText = t.niederschlag_mm >= 0.5 ? 'Regen ' + String(t.niederschlag_mm).replace('.', ',') + ' mm' : 'trocken';
        return '<div class="ueb-gross">' + t.tiefstwert_grad + '<small>/</small>' + t.hoechstwert_grad + '°</div><div class="ueb-sub">' + esc(kurz) + (t.niederschlag_mm >= 0.5 ? ' · ' + regenText : '') + '</div>';
    }

    /* ---------- Zeichnen ---------- */
    function lokal() {
        kopf();
        const l = stand.lage;
        setze('uebArbeit', arbeitsweg(l)); { const ka = $('uebArbeit'); if (ka) ka.classList.toggle('heim', !!(l && l.heimweg && l.arbeit)); }   // Beschriftung "Heimweg" statt "Arbeitsweg"
        setze('uebRegen', regen(l));
        setze('uebDiesel', diesel(l));
        setze('uebSchicht', schicht());
        setze('uebTermine', termine(l));
        setze('uebErinnerung', erinnerungen());
        setze('uebEinkauf', einkauf());
        setze('uebWetter', wetterMorgen());
    }
    function sichtbar() { return !document.hidden && (!document.body || !document.body.classList.contains('panel-open')); }

    function lageHolen() {
        try {
            if (!window.jvLage || typeof window.jvLage.daten !== 'function') return;
            window.jvLage.daten(LAGE_MS).then(d => { if (d) { stand.lage = d; lokal(); } }).catch(() => {});
        } catch (e) {}
    }
    function wetterHolen() {
        if (stand.wetterLauf || typeof fetchWeatherForecast !== 'function' || (stand.wetter && !stand.wetter.fehler && Date.now() - stand.wetterZeit < WETTER_MS)) return;
        stand.wetterLauf = true;
        Promise.resolve(fetchWeatherForecast()).then(w => { stand.wetter = w; stand.wetterZeit = Date.now(); lokal(); }).catch(() => {}).then(() => { stand.wetterLauf = false; });
    }
    function auffrischen() { lokal(); lageHolen(); wetterHolen(); }

    /* ---------- Tonbalken ---------- */
    const BALKEN = 28;
    let balken = [], eqLauf = false, eqPegel = 0, eqPhase = 0;
    function eqBauen() {
        const eq = $('uebEq'); if (!eq || eq.children.length) return;
        for (let i = 0; i < BALKEN; i++) eq.appendChild(document.createElement('i'));
        balken = Array.from(eq.children);
    }
    function zustand() {
        const b = $('recordBtn'); if (!b) return 'ruhe';
        if (b.classList.contains('speaking')) return 'jarvis';
        if (b.classList.contains('recording') && window.jvUserSpeaking === true) return 'nutzer';
        return 'ruhe';
    }
    function eqBild() {
        const z = zustand();
        const eq = $('uebEq');
        if (z === 'ruhe' && eqPegel < 0.02) { eqLauf = false; if (eq) { eq.className = ''; balken.forEach(x => { x.style.height = '3px'; }); } return; }
        let ziel = 0;
        if (z === 'jarvis') { try { ziel = Math.min(1, (window.jvSphereLevel ? window.jvSphereLevel() : 0.4) * 1.6); } catch (e) {} if (!(ziel > 0)) ziel = 0.35; }
        else if (z === 'nutzer') {
            const frisch = window.jvUserRmsZeit && Date.now() - window.jvUserRmsZeit < 400;
            ziel = frisch ? Math.min(1, Math.max(0, (window.jvUserRms || 0) / 10)) : 0.3;   // ohne neue APK: gleichmäßige Bewegung
        }
        eqPegel += (ziel - eqPegel) * 0.3;
        eqPhase += 0.22;
        if (eq) eq.className = z === 'nutzer' ? 'nutzer' : 'jarvis';
        for (let i = 0; i < balken.length; i++) {
            const form = 0.45 + 0.55 * Math.abs(Math.sin(eqPhase + i * 0.55) * Math.cos(eqPhase * 0.6 + i * 0.21));
            balken[i].style.height = Math.max(3, Math.round(3 + 11 * eqPegel * form)) + 'px';
        }
        requestAnimationFrame(eqBild);
    }
    function eqPruefen() {
        if (eqLauf || document.hidden || zustand() === 'ruhe') return;
        eqLauf = true; requestAnimationFrame(eqBild);
    }

    function start() {
        eqBauen(); tippLeiste(); seiteZwei();
        tippe('uebArbeit', () => { if (window.jvLage && window.jvLage.open) window.jvLage.open(); });
        tippe('uebRegen', () => { if (window.jvWetterkarte) window.jvWetterkarte.oeffnen('rain'); else if (window.jvLage && window.jvLage.open) window.jvLage.open(); });
        tippe('uebDiesel', () => { if (window.jvLage && window.jvLage.open) window.jvLage.open(false, 'diesel'); });
        tippe('uebTermine', panel('termine'));
        tippe('uebErinnerung', panel('erinnerungen'));
        tippe('uebEinkauf', panel('einkauf'));
        lokal();
        setTimeout(auffrischen, 1500);   // erst nach dem Start der übrigen Skripte
        setInterval(() => { if (sichtbar()) lokal(); }, 20000);
        setInterval(eqPruefen, 250);     // nur ein Blick auf den Zustand; gezeichnet wird nur, solange gesprochen wird
        document.addEventListener('visibilitychange', () => { if (!document.hidden) auffrischen(); });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
    window.jvUebersicht = { auffrischen, lokal };

    /* Seite 2 der Startseite: große Knöpfe für Foto, Bild, Briefing, Überblick, Einkauf, Preissuche, Karte, Parkplatz.
       Wechsel durch Wischen nach links/rechts auf freier Fläche oder durch Tippen auf die zwei Punkte; Seite 1 bleibt unverändert. */
    function seiteZwei() {
        const box = $('uebersicht'), raster = $('uebRaster'); if (!box || !raster || $('uebSeite2')) return;
        const SVG = {
            cam: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
            img: '<rect x="3.5" y="5" width="17" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M4 18l5-5 4 3 3-3 4 4"/>',
            sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8"/>',
            mon: '<rect x="3.5" y="4.5" width="17" height="11" rx="1.5"/><path d="M9 19.5h6M12 15.5v4"/>',
            lst: '<path d="M8 7h12M8 12h12M8 17h12"/><circle cx="4.5" cy="7" r=".8"/><circle cx="4.5" cy="12" r=".8"/><circle cx="4.5" cy="17" r=".8"/>',
            tag: '<path d="M3.5 12.5V4.5h8l9 9-8 8z"/><circle cx="8" cy="9" r="1.3"/>',
            map: '<path d="M4 6l5-2 6 2 5-2v14l-5 2-6-2-5 2z"/><path d="M9 4v14M15 6v14"/>',
            par: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M10 17V8h3.5a2.7 2.7 0 010 5.4H10"/>'
        };
        const aufruf = f => () => { try { f(); } catch (e) { } };
        const T = [
            ['cam', 'Foto', 'Kamera öffnen', aufruf(() => openPhotoCamera(true))],
            ['img', 'Bild', 'aus Dateien', aufruf(() => openPhotoGallery())],
            ['sun', 'Briefing', 'Tag in Kürze', aufruf(() => triggerDailyBriefing())],
            ['mon', 'Überblick', 'dein Tag', aufruf(() => { if (typeof closePanel === 'function') closePanel(); showUeberblick(false); })],
            ['lst', 'Einkauf', 'Liste', aufruf(() => openPanel('einkauf')), 'uebS2Einkauf'],
            ['tag', 'Preissuche', 'günstig finden', aufruf(() => { if (window.jvPreisWaechter && window.jvPreisWaechter.oeffnen) window.jvPreisWaechter.oeffnen(); })],
            ['map', 'Karte', 'Standort, Route', aufruf(() => openPanel('karte'))],
            ['par', 'Parkplatz', 'Auto finden', aufruf(() => parkButtonTap())]
        ];
        const g = document.createElement('div'); g.id = 'uebSeite2';
        T.forEach(t => {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'ueb-s2-knopf';
            b.innerHTML = '<svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">' + SVG[t[0]] + '</svg><span><small' + (t[4] ? ' id="' + t[4] + '"' : '') + '>' + t[2] + '</small><b>' + t[1] + '</b></span>';
            b.addEventListener('click', () => { try { if (typeof playUiBeep === 'function') playUiBeep(); } catch (e) { } t[3](); });
            g.appendChild(b);
        });
        raster.parentNode.insertBefore(g, raster.nextSibling);
        const punkte = document.createElement('div'); punkte.id = 'uebPunkte';
        const p1 = document.createElement('button'), p2 = document.createElement('button');
        [p1, p2].forEach((p, i) => { p.type = 'button'; p.setAttribute('aria-label', 'Seite ' + (i + 1)); punkte.appendChild(p); });
        box.appendChild(punkte);
        function zeige(n) {
            box.classList.toggle('ueb-s2', n === 2); p1.classList.toggle('on', n === 1); p2.classList.toggle('on', n === 2);
            try { const e = $('uebS2Einkauf'), l = (typeof shoppingEntries !== 'undefined' && shoppingEntries) ? shoppingEntries.length : 0; if (e) e.textContent = l ? l + (l === 1 ? ' Ding' : ' Dinge') : 'Liste'; } catch (e) { }
        }
        p1.addEventListener('click', () => zeige(1)); p2.addEventListener('click', () => zeige(2)); zeige(1);
        let x0 = null, y0 = null;
        box.addEventListener('touchstart', e => { const t = e.touches && e.touches[0]; if (t && !(e.target.closest && e.target.closest('input,textarea'))) { x0 = t.clientX; y0 = t.clientY; } else x0 = null; }, { passive: true });
        box.addEventListener('touchend', e => {
            if (x0 === null) return; const t = e.changedTouches && e.changedTouches[0]; if (!t) return;
            const dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) zeige(dx < 0 ? 2 : 1);
        }, { passive: true });
        window.jvUebersicht.seite = zeige;
    }

    /* Eingabeleiste: ein getippter Satz geht denselben Weg wie ein gesprochener (voice.js: window.jvTippen). Das Tastatur-Symbol klappt die Leiste auf. */
    function tippLeiste() {
        const box = $('uebersicht'); if (!box || $('jvTippBtn')) return;
        const btn = document.createElement('button'); btn.id = 'jvTippBtn'; btn.type = 'button'; btn.textContent = '⌨'; btn.setAttribute('aria-label', 'Jarvis etwas schreiben');
        const bar = document.createElement('div'); bar.id = 'jvTippBar'; bar.hidden = true;
        const inp = document.createElement('input'); inp.type = 'text'; inp.id = 'jvTippInput'; inp.placeholder = 'Jarvis etwas schreiben…'; inp.autocomplete = 'off'; inp.enterKeyHint = 'send';
        const ok = document.createElement('button'); ok.type = 'button'; ok.id = 'jvTippSenden'; ok.textContent = 'SENDEN';
        bar.appendChild(inp); bar.appendChild(ok); box.appendChild(btn); box.appendChild(bar);
        function zu() { bar.hidden = true; btn.classList.remove('on'); inp.blur(); }
        function senden() {
            const t = inp.value.trim(); if (!t) { zu(); return; }
            inp.value = ''; zu();
            try { if (typeof window.jvTippen === 'function') window.jvTippen(t); else if (typeof sendToGroqSmart === 'function') sendToGroqSmart(t); } catch (e) { }
        }
        btn.addEventListener('click', () => { try { if (typeof playUiBeep === 'function') playUiBeep(); } catch (e) { } if (bar.hidden) { bar.hidden = false; btn.classList.add('on'); setTimeout(() => inp.focus(), 50); } else zu(); });
        ok.addEventListener('click', senden);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); senden(); } else if (e.key === 'Escape') zu(); });
    }
})();
