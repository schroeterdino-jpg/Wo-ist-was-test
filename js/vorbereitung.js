/* ============================================================
   VORBEREITUNG ("Ich habe mir erlaubt ..."): Nova bereitet einen Termin mit Ort vor, bevor du fragst.
   Etwa 90 bis 45 Minuten vorher (einmal pro Termin) rechnet er von selbst: Route mit aktuellem Verkehr und Abfahrtszeit, Wetter am Ziel zur Ankunft,
   günstigste Tankstelle auf dem Weg, passende Einträge von Einkaufsliste und Aufgaben, bald fällige Rechnungen. Es öffnet sich das Lagebild
   (wie beim Fahrt-Check), und er sagt: "Ich habe mir erlaubt, deinen Termin ... vorzubereiten. ..."
   Regeln wie beim Wächter (wachter.js): nur bei offener, sichtbarer App, wenn Ruhe ist, nicht in der Ruhezeit, nur bei "Zane meldet sich von selbst".
   Sprache: "Bereite meinen nächsten Termin vor" (sofort) · "Vorbereitung aus" / "Vorbereitung an".
   Braucht: travel.js (computeDepartureAdvice), fahrtcheck.js, lagebild.js, wachter.js, calendar (calendarEntries), voice.js (speak), commands.js.
   Muss nach fahrtcheck.js und wachter.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvVorbereitung) return;
    const K_AUS = 'jv_vorb_aus', K_DONE = 'jv_vorb_done';
    const VON_MIN = 90, BIS_MIN = 45, TICK_MS = 60000;
    let laeuft = false;

    function pd(k, d) { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) ?? d); } catch (e) { return d; } }
    function sd(k, v) { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) { } }
    function aus() { return pd(K_AUS, '') === '1'; }
    function erledigt() { try { const o = JSON.parse(localStorage.getItem(K_DONE) || '{}') || {}; return o; } catch (e) { return {}; } }
    function merke(id) {
        try {
            const o = erledigt(), jetzt = Date.now();
            Object.keys(o).forEach(k => { if (jetzt - o[k] > 3 * 86400000) delete o[k]; });
            o[id] = jetzt; localStorage.setItem(K_DONE, JSON.stringify(o));
        } catch (e) { }
    }
    const HH = ms => new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
    function ruhe() {
        try {
            if (typeof wachterEnabled === 'function' && !wachterEnabled()) return false;
            if (typeof wachterQuiet === 'function' && wachterQuiet()) return false;
            if (typeof wachterIdle === 'function' && !wachterIdle()) return false;
            if (document.getElementById('extraFensterLayer')) return false;   // ein Fenster ist offen
        } catch (e) { return false; }
        return true;
    }

    /* Termine mit Uhrzeit und Ort, die in der Zukunft beginnen (aufsteigend) */
    function kandidaten() {
        const out = [], jetzt = Date.now();
        try {
            (typeof calendarEntries !== 'undefined' ? calendarEntries : []).forEach(c => {
                if (!c || !c.isoDate || !/T/.test(c.isoDate) || !c.location || !String(c.location).trim()) return;
                if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(c)) return;
                const at = new Date(c.isoDate).getTime();
                if (isNaN(at) || at <= jetzt) return;
                out.push({ id: 'v' + c.id + '|' + String(c.isoDate).slice(0, 16), at, titel: String(c.text || 'Termin'), ort: String(c.location).trim() });
            });
        } catch (e) { }
        return out.sort((a, b) => a.at - b.at);
    }

    async function vorbereiten(t, manuell) {
        if (laeuft || typeof computeDepartureAdvice !== 'function') return false;
        laeuft = true;
        try {
            merke(t.id);
            const res = await computeDepartureAdvice({ query: t.ort, destination: t.ort, arrivalTime: HH(t.at), wantFuel: true });
            if (!res || !res.reply) return false;
            const kopf = 'Ich habe mir erlaubt, deinen Termin ' + t.titel + ' um ' + HH(t.at) + ' Uhr vorzubereiten. ';
            try { if (res.card && typeof showActionCards === 'function') showActionCards([res.card].concat(res.stauCards || [])); } catch (e) { }
            try { speak(kopf + res.reply, false); } catch (e) { }
            return true;
        } catch (e) {
            if (manuell) { try { speak((e && e.userMessage) || 'Die Vorbereitung hat gerade nicht geklappt.', false); } catch (x) { } }
            return false;
        } finally { laeuft = false; }
    }

    function tick() {
        try {
            if (aus() || laeuft || !ruhe()) return;
            const jetzt = Date.now(), done = erledigt();
            const t = kandidaten().find(k => !done[k.id] && k.at - jetzt <= VON_MIN * 60000 && k.at - jetzt >= BIS_MIN * 60000);
            if (t) vorbereiten(t, false);
        } catch (e) { }
    }

    function befehl(text, next) {
        const s = String(text || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!s || s.split(' ').length > 10) return next(text);
        let m = s.match(/^(?:nova |jarvis |zane )?vorbereitung (aus|an|ein)$/) || s.match(/^(?:nova |jarvis |zane )?(?:schalte )?vorbereitung (aus|an|ein)(?:schalten)?$/);
        if (m) {
            sd(K_AUS, m[1] === 'aus' ? '1' : '');
            try { speak(m[1] === 'aus' ? 'Gut, ich bereite Termine nicht mehr von selbst vor.' : 'Gut, ich bereite Termine mit Ort wieder von selbst vor, etwa eine Stunde vorher.', false); } catch (e) { }
            return true;
        }
        if (/\b(bereite|bereit)\b.*\b(termin)\b.*\bvor\b/.test(s) || /\bvorbereitung\b.*\b(naechsten|naechste|termin)\b/.test(s)) {
            const t = kandidaten()[0];
            if (!t) { try { speak('Ich finde keinen kommenden Termin mit Ort im Kalender.', false); } catch (e) { } return true; }
            try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Bereite ' + t.titel + ' vor...'); } catch (e) { }
            vorbereiten(t, true);
            return true;
        }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('vorbereitung', befehl, 166);

    window.jvVorbereitung = { tick, kandidaten, vorbereiten, befehl };
    setInterval(tick, TICK_MS);
    setTimeout(tick, 45000);
})();
