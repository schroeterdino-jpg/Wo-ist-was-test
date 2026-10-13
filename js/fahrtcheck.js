/* ============================================================
   FAHRT-CHECK: Nach "Route zu X" / "Wann muss ich losfahren" hängt Jarvis einen kurzen Tipp an die Antwort, der mehrere Quellen verbindet:
   - WETTER am Ziel zur Ankunftszeit (Open-Meteo, stündlich): Regen, Gewitter oder Hagel bei der Ankunft, und ab wann es dort wieder trocken ist
   - SPRIT: die günstigste Tankstelle auf der Strecke (kommt schon aus travel.js) erscheint zusätzlich im Fenster
   - LISTEN: passende Einträge von Einkaufsliste und Aufgaben (Baumarkt -> Schrauben, Kabel ... / Supermarkt -> die ganze Einkaufsliste / Apotheke ...)
   - RECHNUNGEN: eine Rechnung, die in den nächsten 2 Tagen fällig oder schon überfällig ist (rechnungen.js)
   Gesprochen werden höchstens zwei kurze Sätze; alles Weitere steht im Lagebild (lagebild.js, Ansicht "Ziel"), ersatzweise im Fenster "FAHRT-CHECK" (hud_fenster.js).
   Es erscheint nur, was wirklich etwas zu sagen hat. Ausschalten: "Fahrt-Check aus" / "Fahrt-Check an".
   Greift nur bei der Sprachabfrage (computeDepartureAdvice mit Suchbegriff), nicht bei der Abfahrts-Warnung oder der Spritsuche.
   Braucht: travel.js (computeDepartureAdvice), optional hud_fenster.js (jvPanel), lists (shoppingEntries, todoEntries), rechnungen.js. Muss danach geladen werden.
   ============================================================ */
(function () {
    'use strict';
    const orig = window.computeDepartureAdvice;
    if (typeof orig !== 'function' || window.__jvFahrtcheck) return;
    window.__jvFahrtcheck = true;
    const KEY = 'jv_fahrtcheck';
    const pd = (k, d) => { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) ?? d); } catch (e) { return d; } };
    const sd = (k, v) => { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) {} };
    const mit = (p, ms) => Promise.race([p, new Promise(r => setTimeout(() => r(null), ms))]);
    const hh = d => d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).replace(':00', '') + ' Uhr';

    /* ---------- Wetter am Ziel ---------- */
    const nass = (mm, code) => mm >= 0.3 || (code >= 51 && code <= 67) || (code >= 80 && code <= 99);
    async function wetterAmZiel(lat, lon, minuten) {
        try {
            const r = await fetch('https://api.open-meteo.com/v1/forecast?latitude=' + lat + '&longitude=' + lon + '&hourly=precipitation,weather_code&forecast_days=2&timezone=Europe%2FBerlin');
            const d = await r.json(), H = d.hourly;
            if (!H || !H.time) return null;
            const an = new Date(Date.now() + minuten * 60000);
            // Stunden als Berlin-Ortszeit "YYYY-MM-DDTHH:00": Vergleich über denselben Textschlüssel
            const key = x => x.toLocaleString('sv-SE', { timeZone: 'Europe/Berlin' }).slice(0, 13).replace(' ', 'T');
            const i = H.time.findIndex(t => t.slice(0, 13) === key(an));
            if (i < 0) return null;
            const code = H.weather_code[i], mm = H.precipitation[i];
            if (!nass(mm, code)) return { trockenZiel: true, text: '', kurz: 'Bei Ankunft gegen ' + hh(an) + ' ist es am Ziel trocken' };
            const schwer = code === 96 || code === 99, gewitter = code === 95 || schwer;
            let trocken = null;
            for (let j = i + 1; j < Math.min(H.time.length, i + 6); j++) if (!nass(H.precipitation[j], H.weather_code[j])) { trocken = H.time[j].slice(11, 13); break; }
            const was = schwer ? 'Gewitter mit Hagel' : gewitter ? 'ein Gewitter' : mm >= 2 ? 'kräftiger Regen' : 'Regen';
            return { text: 'Bei deiner Ankunft gegen ' + hh(an) + ' gibt es am Ziel ' + was + (trocken ? '; ab ' + parseInt(trocken, 10) + ' Uhr ist es dort trocken.' : '.'), kurz: 'Am Ziel ' + was + ' zur Ankunft' + (trocken ? ', ab ' + parseInt(trocken, 10) + ' Uhr trocken' : '') };
        } catch (e) { return null; }
    }

    /* ---------- Listen ---------- */
    const KAT = [
        { rx: /baumarkt|bauhaus|hornbach|obi\b|toom|hagebau|eisenwaren|werkstatt/, such: /schraub|kabel|dübel|werkzeug|farbe|holz|lampe|schlauch|nägel|nagel|kleber|bohr|steck|sicherung|lack|pinsel|baumarkt|zange|glühbirne|batterie/ , liste: 'beide' },
        { rx: /supermarkt|edeka|rewe|lidl|aldi|penny|netto|kaufland|markt\b|einkaufen|bäcker/, such: null, liste: 'einkauf' },
        { rx: /apotheke/, such: /tablette|salbe|pflaster|medik|apotheke|rezept|hustensaft|vitamin|tropfen/, liste: 'beide' },
        { rx: /drogerie|dm\b|rossmann|müller/, such: /shampoo|seife|zahn|creme|deo|windel|drogerie|tempo|waschmittel/, liste: 'beide' },
        { rx: /post\b|paketshop|dhl|hermes/, such: /paket|brief|post|retoure|marke/, liste: 'beide' },
        { rx: /tankstelle|tanken/, such: /tanken|scheibenwasch|öl\b|reifen|luft/, liste: 'beide' }
    ];
    function listenTipp(ziel) {
        try {
            const z = String(ziel || '').toLowerCase();
            const shop = (typeof shoppingEntries !== 'undefined' ? shoppingEntries : []).map(e => String(e.text || '')).filter(Boolean);
            const todo = (typeof todoEntries !== 'undefined' ? todoEntries : []).map(e => String(e.text || '')).filter(Boolean);
            let treffer = [];
            const k = KAT.find(x => x.rx.test(z));
            if (k) {
                if (k.liste === 'einkauf') treffer = shop.slice(0, 6);
                else treffer = shop.concat(todo).filter(t => k.such.test(t.toLowerCase())).slice(0, 6);
            }
            // zusätzlich: Einträge, die das Zielwort selbst nennen ("Penny: Milch")
            const wort = z.split(/[\s,]+/).filter(w => w.length >= 4 && !/^(zum|zur|nach|dem|der|die|das)$/.test(w));
            shop.concat(todo).forEach(t => { if (wort.some(w => t.toLowerCase().includes(w)) && !treffer.includes(t)) treffer.push(t); });
            return treffer.slice(0, 6);
        } catch (e) { return []; }
    }

    /* ---------- Rechnungen ---------- */
    function rechnungsTipp() {
        try {
            if (!window.jvRechnungen) return null;
            const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
            const r = window.jvRechnungen.offen().filter(x => x.ziel && Math.round((new Date(x.ziel + 'T12:00:00Z') - new Date(heute + 'T12:00:00Z')) / 86400000) <= 2);
            if (!r.length) return null;
            const d = Math.round((new Date(r[0].ziel + 'T12:00:00Z') - new Date(heute + 'T12:00:00Z')) / 86400000);
            return r.length > 1 ? r.length + ' Rechnungen sind bald fällig oder überfällig' : 'Rechnung ' + r[0].absender + (r[0].betrag ? ' (' + r[0].betrag.toFixed(2).replace('.', ',') + ' €)' : '') + (d < 0 ? ' ist überfällig' : d === 0 ? ' ist heute fällig' : d === 1 ? ' ist morgen fällig' : ' ist übermorgen fällig');
        } catch (e) { return null; }
    }

    window.computeDepartureAdvice = async function (opts) {
        const res = await orig.apply(this, arguments);
        try {
            if (!opts || typeof opts !== 'object' || !('query' in opts) || !res || !res.map) return res;
            const m = res.map, ziel = (m.to && m.to.label) || opts.destination || opts.query || '';
            const zeilen = [], sprich = [];
            if (pd(KEY, 'an') !== 'aus') {
                const [wetter] = await Promise.all([mit(wetterAmZiel(m.to.lat, m.to.lon, m.fahrtMin || 0), 6000)]);
                const liste = listenTipp(ziel), rg = rechnungsTipp();
                if (wetter) { zeilen.push({ ok: null, text: '☂ ' + wetter.kurz }); if (wetter.text) sprich.push(wetter.text); }
                if (res.sprit) zeilen.push({ ok: null, text: '⛽ ' + (res.sprit.name || 'Tankstelle') + ': Diesel ' + res.sprit.preis.toFixed(3).replace('.', ',') + ' € an der Strecke' });
                if (liste.length) { zeilen.push({ ok: null, text: '📝 Auf deiner Liste: ' + liste.join(', ') }); sprich.push('Auf deiner Liste stehen noch ' + liste.slice(0, 3).join(', ') + (liste.length > 3 ? ' und mehr' : '') + '.'); }
                if (rg) zeilen.push({ ok: null, text: '🧾 ' + rg });
                if (sprich.length) res.reply += ' ' + sprich.slice(0, 2).join(' ');
            }
            // Alles in einem Fenster: das Lagebild zeigt Ziel, Fahrzeit, Stau auf der Strecke, Wetter am Ziel, Diesel, Liste und Rechnung.
            // Die HUD-Karte öffnet sich dann nicht zusätzlich (der Linienverlauf wird nur der Antwort abgenommen, nicht dem Original).
            // Gesprochener Satz zur Verkehrslage und Karte sollen dasselbe sagen: nur Meldungen, die wirklich auf der Strecke liegen
            if (window.jvLage && typeof window.jvLage.aufStrecke === 'function' && typeof lastStauText === 'string' && lastStauText && res.reply && res.reply.indexOf(lastStauText) >= 0) {
                const auf = window.jvLage.aufStrecke(m);
                const satz = auf.length ? ' Achtung, auf der Strecke gemeldet: ' + auf.slice(0, 3).map(x => x.title).join('; ') + '.' : ' Auf deiner Strecke sind keine Meldungen bekannt.';
                res.reply = res.reply.replace(lastStauText, satz);
            }
            if (window.jvLage && typeof window.jvLage.ziel === 'function') {
                const sub = res.card && res.card.subtitle && /Abfahrt/.test(res.card.subtitle) ? res.card.subtitle : '';
                if (window.jvLage.ziel({ titel: ziel, map: m, untertitel: sub, zeilen })) return Object.assign({}, res, { map: Object.assign({}, m, { coords: null }) });
            }
            if (zeilen.length && window.jvPanel) window.jvPanel.zeigen({ titel: 'FAHRT-CHECK', zeit: String(ziel).toUpperCase().slice(0, 18), zeilen, sek: 18 });
        } catch (e) { console.error('Fahrtcheck', e); }
        return res;
    };

    if (window.jvCommands) {
        window.jvCommands.use('fahrtcheck', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
            const m = t.match(/^(?:jarvis )?fahrt ?check (aus|an|ein)$/);
            if (!m) return next(text);
            sd(KEY, m[1] === 'aus' ? 'aus' : 'an');
            try { speak(m[1] === 'aus' ? 'Der Fahrt-Check ist aus.' : 'Der Fahrt-Check ist an.', typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {}
            return true;
        }, 165);
    }
})();
