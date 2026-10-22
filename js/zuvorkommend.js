/* ============================================================
   ZUVORKOMMEND: Jarvis handelt von sich aus und sagt es dir ("Ich habe mir erlaubt ..."), du kannst es mit "Mach rückgängig" zurücknehmen.
   1) Frost: Abend vor einer Frühschicht (bei der Wecker-Frage um 20:30) schaut Jarvis in die Vorhersage für morgen früh.
      Bei Frost, Schnee oder Glätte zieht er deine Abfahrt um 10 bis 15 Minuten vor (plan_ansagen.js: tagVor), damit Zeit zum Kratzen bleibt,
      und schlägt den Wecker entsprechend früher vor. "Mach rückgängig" stellt alles zurück.
   2) Familie/Geburtstage: 5 Tage vorher fragt Jarvis um 18 Uhr, ob schon ein Geschenk da ist, und legt auf Wunsch eine Erinnerung an.
      Abstellen: "Frag nicht mehr nach Geburtstagen" (wieder an: "Frag wieder nach Geburtstagen").
   Braucht: plan_ansagen.js (window.jvPlan), birthdays.js (fetchUpcomingBirthdays), calendar.js (addGoogleCalendarReminder), commands.js (jvCommands).
   ============================================================ */
(function () {
    const P = () => window.jvPlan || null;
    const K_LETZT = 'jv_zuvor_letzt', K_GEB = 'jv_zuvor_geb', K_GEB_AUS = 'jv_zuvor_geb_aus', K_GEB_GEFRAGT = 'jv_zuvor_gefragt_';
    const GEB_VORLAUF_TAGE = 5, GEB_UHR_MIN = 18 * 60;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function sagen(t, weiter) { try { speak(t, weiter && typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function karten() { try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function tageZwischen(a, b) { const t = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((t(b) - t(a)) / 86400000); }

    /* ---------- 1) Frost ---------- */
    const SCHNEE_CODES = [56, 57, 66, 67, 71, 73, 75, 77, 85, 86];
    async function morgenOrt() {
        const p = P();
        try {
            const ziel = p && p.heimAdresse && p.heimAdresse();
            if (ziel && typeof geocodeAddress === 'function') { const g = await Promise.race([geocodeAddress(ziel), new Promise(r => setTimeout(() => r(null), 5000))]); if (g) return g; }
        } catch (e) { }
        try { const pos = await getPosition({ timeout: 7000, enableHighAccuracy: false, maximumAge: 600000 }); return { lat: pos.coords.latitude, lon: pos.coords.longitude }; } catch (e) { }
        return null;
    }
    /* Vorhersage rund um die Abfahrt: { min: tiefste Temperatur, schnee: Schnee oder gefrierender Regen } oder null */
    async function wetterAbfahrt(ymd, abfMin) {
        const o = await morgenOrt(); if (!o) return null;
        try {
            const r = await Promise.race([fetch('https://api.open-meteo.com/v1/forecast?latitude=' + o.lat.toFixed(3) + '&longitude=' + o.lon.toFixed(3) + '&hourly=temperature_2m,weather_code&forecast_days=3&timezone=Europe%2FBerlin'), new Promise(r => setTimeout(() => r(null), 9000))]);
            if (!r || !r.ok) return null;
            const j = await r.json(), h = j && j.hourly; if (!h || !Array.isArray(h.time)) return null;
            const von = Math.floor((abfMin - 90) / 60), bis = Math.floor(abfMin / 60);
            let min = null, schnee = false;
            h.time.forEach((t, i) => {
                if (t.slice(0, 10) !== ymd) return;
                const hh = Number(t.slice(11, 13)); if (hh < von || hh > bis) return;
                const v = Number(h.temperature_2m[i]); if (Number.isFinite(v) && (min === null || v < min)) min = v;
                if (SCHNEE_CODES.indexOf(Number(h.weather_code[i])) >= 0) schnee = true;
            });
            return min === null ? null : { min, schnee };
        } catch (e) { return null; }
    }
    function gradText(v) { const r = Math.round(v); return (r < 0 ? 'minus ' + (-r) : String(r)) + ' Grad'; }
    /* Wird von plan_ansagen.js vor der Wecker-Frage aufgerufen (ymd = heutiger Abend). Rückgabe: Satz für Jarvis oder ''. */
    async function vorWecker(ymd) {
        const p = P(); if (!p) return '';
        const morgen = p.ymdPlus(ymd, 1);
        if (p.schichtAm(morgen) !== 'frueh' || p.tagVor(morgen) > 0) return '';
        const abf = p.abfahrtMin('frueh');
        const w = await wetterAbfahrt(morgen, abf);
        if (!w || !(w.min <= 0.5 || w.schnee)) return '';
        const vor = (w.schnee || w.min <= -5) ? 15 : 10;
        p.setTagVor(morgen, vor);
        lsSet(K_LETZT, JSON.stringify({ art: 'frost', ymd: morgen, at: Date.now() }));
        try { p.planSenden(true); } catch (e) { }
        const grund = w.schnee ? 'morgen früh Schnee oder Glätte möglich sind (' + gradText(w.min) + ')' : 'morgen früh Frost ist (' + gradText(w.min) + ')';
        return 'Ich habe mir erlaubt, deine Abfahrt morgen auf ' + p.uhr(abf - vor) + ' vorzuziehen, weil ' + grund + ' und du vielleicht kratzen musst. Wenn du das nicht willst, sag: Mach rückgängig.';
    }
    function rueckgaengig() {
        const p = P();
        let l = null; try { l = JSON.parse(lsGet(K_LETZT) || 'null'); } catch (e) { }
        if (!l || !l.at || Date.now() - l.at > 36 * 3600000 || !p) { sagen('Da gibt es gerade nichts, was ich rückgängig machen könnte.', false); return; }
        if (l.art === 'frost') {
            p.setTagVor(l.ymd, 0);
            try { p.planSenden(true); } catch (e) { }
            let t = 'Erledigt. Die Abfahrt bleibt bei ' + p.uhr(p.abfahrtMin('frueh')) + '.';
            if (lsGet('jv_plan_wecker_' + p.ymdPlus(l.ymd, -1)) === 'ja') t += ' Den Wecker habe ich schon gestellt, den musst du in der Uhr-App selbst zurückstellen.';
            lsSet(K_LETZT, '');
            sagen(t, false);
            return;
        }
        sagen('Da gibt es gerade nichts, was ich rückgängig machen könnte.', false);
    }

    /* ---------- 2) Geburtstage ---------- */
    function gebAus() { return lsGet(K_GEB_AUS) === '1'; }
    function gebListe() { try { const a = JSON.parse(lsGet(K_GEB) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function gebKey(ymd, titel) { return K_GEB_GEFRAGT + ymd + '_' + String(titel).toLowerCase().replace(/[^a-zäöüß0-9]/g, '').slice(0, 30); }
    let aktualisiert = 0;
    async function gebAktualisieren() {
        if (typeof fetchUpcomingBirthdays !== 'function' || Date.now() - aktualisiert < 30 * 60000) return;
        aktualisiert = Date.now();
        try {
            const l = await fetchUpcomingBirthdays(7);
            lsSet(K_GEB, JSON.stringify((l || []).filter(x => x && x.ymd && x.titel).map(x => ({ ymd: x.ymd, titel: String(x.titel).replace(/\|/g, ' ').slice(0, 60) }))));
            try { if (P()) P().planSenden(false); } catch (e) { }
        } catch (e) { }
    }
    /* Einträge für den Plan (plan_ansagen.js bauePlan): pro Geburtstag eine Vorfrage um 18 Uhr, ab 5 Tage vorher */
    function planEintraege() {
        const p = P(), out = [];
        if (!p || gebAus()) return out;
        const nu = p.jetzt(), jetztMs = Date.now();
        gebListe().forEach(b => {
            const bis = tageZwischen(nu.ymd, b.ymd);
            if (bis < 1 || bis > GEB_VORLAUF_TAGE || lsGet(gebKey(b.ymd, b.titel))) return;
            for (let d = nu.ymd; d < b.ymd; d = p.ymdPlus(d, 1)) {
                if (tageZwischen(d, b.ymd) > GEB_VORLAUF_TAGE) continue;
                const at = p.berlinMs(d, GEB_UHR_MIN);
                if (at > jetztMs + 20000) { out.push({ id: 'geb|' + b.ymd + '|' + b.titel, at, text: 'Bald ist ein Geburtstag: ' + b.titel + '. Tippe, dann frage ich dich kurz etwas dazu.' }); break; }
            }
        });
        return out;
    }
    let offenGeb = null;   // { ymd, titel, at }
    function gebAnsage(id) {
        const p = P(); if (!p || gebAus()) return false;
        const teile = String(id).split('|'), ymd = teile[1], titel = teile.slice(2).join('|');
        const bis = tageZwischen(p.jetzt().ymd, ymd);
        if (!ymd || !titel || bis < 1 || bis > GEB_VORLAUF_TAGE || lsGet(gebKey(ymd, titel))) return false;
        lsSet(gebKey(ymd, titel), '1');
        offenGeb = { ymd, titel, at: Date.now() };
        const wann = bis === 1 ? 'Morgen' : 'In ' + bis + ' Tagen';
        const was = /geburtstag|birthday|bday/i.test(titel) ? (bis === 1 ? 'ist ' : 'ist ') + titel : 'hat ' + titel + ' Geburtstag';
        try {
            if (typeof showActionCards === 'function') showActionCards([
                { icon: '🎁', title: 'Ja, erinnere mich ans Geschenk', subtitle: titel, onclick: 'jvZuvor.gebJa()' },
                { icon: '✅', title: 'Schon erledigt', subtitle: '', onclick: 'jvZuvor.gebNein()' }
            ]);
        } catch (e) { }
        sagen(wann + ' ' + was + '. Hast du schon ein Geschenk? Soll ich dich erinnern, dass du eins besorgst?', true);
        return true;
    }
    async function gebJa() {
        const p = P(), g = offenGeb; offenGeb = null; karten();
        if (!g || !p) { sagen('Gerade ist keine Geburtstags-Frage offen.', false); return; }
        const nu = p.jetzt(), bis = tageZwischen(nu.ymd, g.ymd);
        let ms, wann;
        if (bis >= 3) { ms = p.berlinMs(p.ymdPlus(g.ymd, -2), 18 * 60); wann = 'zwei Tage vorher, um 18 Uhr'; }
        else if (bis === 2) { ms = p.berlinMs(p.ymdPlus(nu.ymd, 1), 9 * 60); wann = 'morgen früh um 9 Uhr'; }
        else if (nu.min < 20 * 60) { ms = Date.now() + 60 * 60000; wann = 'in einer Stunde'; }
        else { ms = p.berlinMs(g.ymd, 8 * 60); wann = 'morgen früh um 8 Uhr'; }
        try {
            if (typeof addGoogleCalendarReminder !== 'function') throw new Error('keine Erinnerungen');
            await addGoogleCalendarReminder('Geschenk besorgen für ' + g.titel, new Date(ms).toISOString(), null, false);
            sagen('Gut, ich erinnere dich ' + wann + ' ans Geschenk.', false);
        } catch (e) { sagen('Die Erinnerung konnte ich gerade nicht anlegen. Sag mir einfach: Erinnere mich an das Geschenk.', false); }
    }
    function gebNein() {
        const g = offenGeb; offenGeb = null; karten();
        sagen(g ? 'Prima, dann ist das schon erledigt.' : 'Gerade ist keine Geburtstags-Frage offen.', false);
    }

    /* ---------- Sprache ---------- */
    function befehl(text, next) {
        const t = norm(text).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '').replace(/^bitte /, '');
        if (!t || t.split(' ').length > 12) return next(text);
        if (/\b(?:mach(?:e)?|nimm|nehm)\b.*\brueckgaengig\b|^rueckgaengig\b|\bnimm (?:das|es) zurueck\b/.test(t)) { rueckgaengig(); return true; }
        if (offenGeb && Date.now() - offenGeb.at < 40 * 60000) {
            if (/^(nein|nee|ne|schon erledigt|hab ich schon|habe ich schon|ist erledigt|erledigt|brauche ich nicht|nicht noetig|nein danke)\b/.test(t)) { gebNein(); return true; }
            if (/^(ja|jawohl|jep|jo|joa|klar|gerne|gern|okay|ok|bitte|mach das|genau|gut|erinner mich|erinnere mich)\b/.test(t)) { gebJa(); return true; }
        }
        if (/\bgeburtstag\w*\b/.test(t) && /\b(?:frag|frage)\b.*\bnicht mehr\b|\bnicht mehr\b.*\b(?:frag|fragen)\b/.test(t)) { lsSet(K_GEB_AUS, '1'); sagen('In Ordnung, ich frage nicht mehr nach Geburtstagen.', false); return true; }
        if (/\bgeburtstag\w*\b/.test(t) && /\b(?:frag|frage|fragen)\b.*\bwieder\b|\bwieder\b.*\b(?:frag|fragen)\b/.test(t)) { try { localStorage.removeItem(K_GEB_AUS); } catch (e) { } sagen('Gut, ich frage wieder nach Geburtstagen.', false); return true; }
        return next(text);
    }
    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('zuvorkommend', befehl, 0.7);
        return true;
    }
    if (!cmd()) { let n = 0; const iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }

    setTimeout(gebAktualisieren, 15000);
    setTimeout(function () { aktualisiert = 0; gebAktualisieren(); }, 90000);   // falls Google zu Beginn noch nicht verbunden war
    setInterval(function () { aktualisiert = 0; gebAktualisieren(); }, 3 * 3600000);
    try { document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(gebAktualisieren, 4000); }); } catch (e) { }
    window.jvZuvor = { vorWecker, rueckgaengig, planEintraege, gebAnsage, gebJa, gebNein, gebAktualisieren };
})();
