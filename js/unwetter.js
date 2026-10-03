/* ============================================================
   UNWETTERWARNUNGEN: Amtliche Warnungen des Deutschen Wetterdienstes (DWD) für deinen Standort, über den freien Dienst Bright Sky
   (api.brightsky.dev, kein Schlüssel nötig, direkt aus dem Browser abrufbar).
   1) Per Sprache: "Gibt es Unwetterwarnungen?", "Ist Unwetter gemeldet?", "Wetterwarnung", "Sturmwarnung".
   2) Von selbst: Der Wächter (wachter.js) fragt alle paar Minuten nach und meldet sich bei Warnungen ab "markant" (Stufe 2 von 4).
      Wie bei allen Wächter-Meldungen: nur bei offener App, nie zwischen 22 und 7 Uhr, jede Warnung nur einmal am Tag.
   Ernste Themen bekommen nie einen Spruch.
   Wird von erweiterungen.js eingehängt (Sprachbefehl und Wächter). Braucht: speak (voice.js), showActionCards/clearActionCards.
   ============================================================ */
(function () {
    const CACHE_MS = 10 * 60000;
    const SEVERITY_RANK = { minor: 1, moderate: 2, severe: 3, extreme: 4 };
    const SEVERITY_LABEL = { minor: 'Wetterhinweis', moderate: 'markante Wetterwarnung', severe: 'Unwetterwarnung', extreme: 'extreme Unwetterwarnung' };
    let cache = { at: 0, alerts: null, pos: null };

    function say(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }
    function showCards(cards) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(cards);
        } catch (e) {}
    }
    function timeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }
    function position() {
        return new Promise((ok, err) => {
            if (!navigator.geolocation) return err(new Error('keine Ortung'));
            navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), err, { timeout: 7000, maximumAge: 10 * 60000 });
        });
    }

    /* Holt die aktuellen Warnungen (10 Minuten zwischengespeichert). Wirft einen Fehler, wenn Ortung oder Dienst nicht gehen. */
    async function fetchAlerts() {
        if (cache.alerts && Date.now() - cache.at < CACHE_MS) return cache.alerts;
        const pos = await position();
        const r = await timeout(fetch(`https://api.brightsky.dev/alerts?lat=${pos.lat.toFixed(4)}&lon=${pos.lon.toFixed(4)}`), 9000);
        if (!r.ok) throw new Error('Status ' + r.status);
        const d = await r.json();
        const now = Date.now(), seen = new Set(), list = [];
        (d.alerts || []).forEach(a => {
            const onset = a.onset ? new Date(a.onset).getTime() : now, expires = a.expires ? new Date(a.expires).getTime() : now + 3600000;
            if (isNaN(expires) || expires < now) return;   // schon vorbei
            const key = (a.event_de || a.event_en || '') + '|' + (a.onset || '') + '|' + (a.expires || '');
            if (seen.has(key)) return;
            seen.add(key);
            list.push({
                id: String(a.alert_id || a.id || key),
                event: a.event_de || a.event_en || 'Wetterwarnung',
                headline: a.headline_de || a.headline_en || '',
                description: a.description_de || '',
                instruction: a.instruction_de || '',
                severity: SEVERITY_RANK[a.severity] ? a.severity : 'minor',
                onset, expires
            });
        });
        list.sort((x, y) => SEVERITY_RANK[y.severity] - SEVERITY_RANK[x.severity] || x.onset - y.onset);
        cache = { at: Date.now(), alerts: list, pos };
        return list;
    }

    function berlin(ms, opts) { return new Date(ms).toLocaleString('de-DE', Object.assign({ timeZone: 'Europe/Berlin' }, opts)); }
    function spokenWhen(ms) {
        const d = new Date(ms), now = new Date();
        const sameDay = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) === now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        const hm = berlin(ms, { hour: '2-digit', minute: '2-digit', hour12: false }).split(':');
        const h = parseInt(hm[0], 10), m = hm[1];
        const clock = m === '00' ? `${h} Uhr` : `${h} Uhr ${m}`;
        return sameDay ? `heute um ${clock}` : `${berlin(ms, { weekday: 'long' })} um ${clock}`;
    }
    function cardFor(a) {
        const hm = (ms) => berlin(ms, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
        const icon = a.severity === 'extreme' ? '🚨' : a.severity === 'severe' ? '⛈️' : '⚠️';
        return { icon, title: a.event, subtitle: `${SEVERITY_LABEL[a.severity]} · bis ${hm(a.expires)}` };
    }

    /* Für den Wächter: Meldungen im Format { id, prio, text } für Warnungen ab "markant", die jetzt gelten oder innerhalb von 3 Stunden beginnen */
    async function unwetterWachterItems() {
        const list = await fetchAlerts(), now = Date.now(), out = [];
        list.forEach(a => {
            if (SEVERITY_RANK[a.severity] < 2) return;
            if (a.onset > now + 3 * 3600000) return;
            const begins = a.onset > now + 5 * 60000 ? `Sie gilt ab ${spokenWhen(a.onset)}` : 'Sie gilt bereits';
            out.push({
                id: `uwarn|${a.id}`,
                prio: SEVERITY_RANK[a.severity] >= 3 ? 7 : 4,
                text: `Achtung: ${SEVERITY_LABEL[a.severity]} des Deutschen Wetterdienstes für Ihren Standort. ${a.event}. ${begins}, bis ${spokenWhen(a.expires)}.`
            });
        });
        return out;
    }

    /* ---------- Sprachbefehle ---------- */
    async function answerWarnings(detailsWanted) {
        let list;
        try { list = await fetchAlerts(); }
        catch (e) { say('Die Wetterwarnungen konnte ich gerade nicht abrufen. Entweder fehlt der Standort oder der Warndienst antwortet nicht.'); return; }
        if (!list.length) { say('Für Ihren Standort liegt derzeit keine Warnung des Deutschen Wetterdienstes vor.'); return; }
        showCards(list.slice(0, 6).map(cardFor));
        const top = list[0], more = list.length - 1;
        let msg = `Es liegt ${list.length === 1 ? 'eine Warnung' : list.length + ' Warnungen'} des Deutschen Wetterdienstes vor. ${SEVERITY_LABEL[top.severity].charAt(0).toUpperCase() + SEVERITY_LABEL[top.severity].slice(1)}: ${top.event}, gültig bis ${spokenWhen(top.expires)}.`;
        if (more > 0) msg += ` Dazu ${more === 1 ? 'eine weitere' : more + ' weitere'}, die Einzelheiten stehen unten.`;
        if (detailsWanted && top.instruction) msg += ` Verhaltenshinweis: ${top.instruction.replace(/\s+/g, ' ').slice(0, 260)}`;
        say(msg);
    }

    function handleUnwetterCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 90) return false;
        const hit = /\b(unwetter\w*|wetterwarnung\w*|sturmwarnung\w*|unwetterwarnung\w*|dwd|deutsche[rn]? wetterdienst)\b/.test(t)
            || (/\bwarnung(?:en)?\b/.test(t) && /\b(wetter|sturm|gewitter|hagel|glätte|starkregen|hochwasser)\b/.test(t))
            || (/\bwarnt\b/.test(t) && /\b(wetter|dwd)\b/.test(t));
        if (!hit) return false;
        if (/\b(melde dich|von selbst|abschalten|ausschalten|einschalten)\b/.test(t)) return false;   // Einstellung des Wächters, nicht diese Abfrage
        answerWarnings(/(verhalten|was soll ich|was muss ich|tipps?|hinweise?|einzelheiten|details)/.test(t));
        return true;
    }

    window.handleUnwetterCommand = handleUnwetterCommand;
    window.unwetterWachterItems = unwetterWachterItems;
    window._unwetterTest = { fetchAlerts };   // nur zum Testen
})();
