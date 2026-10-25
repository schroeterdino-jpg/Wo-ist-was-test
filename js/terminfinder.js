/* ============================================================
   TERMIN-FINDER: "Ich müsste mal zu meiner Mutter fahren", "Ich muss demnächst zum Friseur", "Wann habe ich Zeit, Anna zu besuchen?"
   Sagst du etwas, das du erledigen willst, ohne Tag und Uhrzeit zu nennen, sucht Jarvis selbst freie Zeiten und fragt, welche er eintragen soll:
   Kalender (jeder Termin zählt eine Stunde) + Schicht (Früh/Spät im Wechsel, Abfahrt bis Heimkehr) + Urlaub (freie Tage) -> drei freie Zeiten in den nächsten
   14 Tagen, freie Tage (Wochenende, Urlaub) zuerst. Bei einem Besuch mit Adresse in den Kontakten rechnet er die Fahrzeit hin und zurück mit (OSRM über /api/route).
   Du antwortest "eins", "zwei", "drei", einen Wochentag, "andere" (die nächsten drei) oder "nein". Dann kommt der Termin in den Google Kalender
   (Titel "Besuch bei Mama" bzw. "Friseur", Ort aus den Kontakten, Länge 2 Stunden bei Besuchen, sonst 1 Stunde).
   Nicht zuständig: Sätze mit Tag oder Uhrzeit ("Morgen um 14 Uhr zum Friseur"), die gehen wie bisher in den Kalender.
   Braucht: commands.js, calendar.js (calendarEntries, addGoogleCalendarEvent), schicht.js (_schichtTest), urlaub.js, vorbereitung.js (jvOrtAusKontakt), weathermap.js (wxGeocode), places.js (showActionCards).
   ============================================================ */
(function () {
    'use strict';
    const FAMILIE = { mutter: 'Mama', mama: 'Mama', mutti: 'Mama', mami: 'Mama', mitter: 'Mama', papa: 'Papa', vater: 'Papa', papi: 'Papa', vati: 'Papa', oma: 'Oma', opa: 'Opa',
        bruder: 'meinen Bruder', schwester: 'meine Schwester', tochter: 'meine Tochter', sohn: 'meinen Sohn', freund: 'meinen Freund', freundin: 'meine Freundin', schwiegermutter: 'meine Schwiegermutter', schwiegervater: 'meinen Schwiegervater' };
    const ERLEDIGUNG = { friseur: 'Friseur', frisoer: 'Friseur', arzt: 'Arzt', hausarzt: 'Hausarzt', zahnarzt: 'Zahnarzt', tierarzt: 'Tierarzt', augenarzt: 'Augenarzt', werkstatt: 'Werkstatt', tuev: 'TÜV', optiker: 'Optiker',
        bank: 'Bank', sparkasse: 'Sparkasse', amt: 'Amt', behoerde: 'Behörde', rathaus: 'Rathaus', post: 'Post', baumarkt: 'Baumarkt', apotheke: 'Apotheke', physio: 'Physiotherapie', physiotherapie: 'Physiotherapie', massage: 'Massage', kfz: 'KFZ-Stelle' };
    const STOP = /^(?:mal|uns|euch|sie|ihn|ihr|einen|eine|etwas|noch|auch|demnaechst|bald|wieder|dort|gern|gerne|mich|dich|dir|mir|das|dies|diese|jemanden|jemand|wen|wann|wo|was|wie|ich|wir|du|er|es|den|dem|der|die)$/;
    const ZEIT_FIX = /\b(?:\d{1,2}\s*uhr|\d{1,2}:\d{2}|\d{1,2}\.\s?\d{1,2}\.?|\d{1,2}\.\s?(?:januar|februar|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)|heute|morgen|uebermorgen|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag|naechste[nrs]?\s+woche|wochenende|nachher|gleich|jetzt|sofort)\b/;
    const TAGE = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

    function sagen(msg) { try { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function pd(k, d) { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) || d); } catch (e) { return d; } }
    function cap(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function plus(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }
    function hm(min) { return String(Math.floor(min / 60)).padStart(2, '0') + ':' + String(min % 60).padStart(2, '0'); }
    function sprech(min) { const h = Math.floor(min / 60), m = min % 60; return m ? h + ' Uhr ' + m : h + ' Uhr'; }
    function datumSprech(iso) {
        const d = new Date(iso + 'T12:00:00');
        return TAGE[d.getDay()] + ', ' + d.getDate() + '. ' + d.toLocaleDateString('de-DE', { month: 'long' });
    }

    /* ---------- Satz verstehen ---------- */
    function kontaktNamen() {
        const s = new Set();
        try {
            const k = (typeof savedContacts === 'object' && savedContacts) ? savedContacts : {};
            Object.keys(k).forEach(key => { const c = k[key] || {}; norm(c.originalName || key).split(' ').forEach(w => { if (w.length >= 3) s.add(w); }); });
        } catch (e) { }
        return s;
    }
    function verstehen(raw) {
        const t = norm(raw);
        if (!t || t.split(' ').length > 28) return null;
        if (/^(?:wann|was|wie|wo|wer|warum|wieso|welche\w*)\b/.test(t) && !/\bwann\s+(?:habe|hab|kann|koennte|hat|haben)\s+(?:ich|wir)\s+(?:mal\s+)?zeit\b/.test(t)) return null;
        if (ZEIT_FIX.test(t)) return null;
        if (/\b(?:erinner\w*|anruf\w*|anrufen|ruf\w*\s+\w+\s+an|schreib\w*|nachricht\w*|whatsapp|termin\s+eintrag\w*|trag\w*\s+(?:mir\s+)?(?:den\s+)?termin|hinzufueg\w*)\b/.test(t)) return null;
        const wunsch = /\b(?:muesste|muess\w*|muss|sollte|will|moechte|moechten|wollte|wollen|wuerde|haette\s+lust|waere\s+gut|waere\s+mal|sollen)\b/.test(t) || /\bwann\s+(?:habe|hab|kann|koennte)\s+ich\s+(?:mal\s+)?zeit\b/.test(t) || /\b(?:finde|such)\w*\s+(?:mir\s+)?(?:eine?\s+)?(?:zeit|termin)\b/.test(t);
        if (!wunsch) return null;
        const namen = kontaktNamen();
        // 1) Besuch: "zu meiner Mutter fahren", "meine Mutter besuchen", "bei Anna vorbeifahren", "Anna treffen"
        let person = '';
        let m = t.match(/\b(?:zu|bei|besuch\w*)\s+(?:meiner|meinem|meinen|meine|meinen|mein|der|dem|den|die|dem)?\s*([a-z]{3,})\b/);
        if (m && !STOP.test(m[1]) && (FAMILIE[m[1]] || namen.has(m[1]))) person = m[1];
        if (!person) { m = t.match(/\b(?:meine|meiner|meinen|meinem|mein|die|den|dem|der)?\s*([a-z]{3,})\s+(?:zu\s+)?(?:besuchen|treffen|sehen|vorbeischauen|besuch)\b/); if (m && !STOP.test(m[1]) && (FAMILIE[m[1]] || namen.has(m[1]))) person = m[1]; }
        if (!person) {   // unbekannter Name, wenn er im Original groß geschrieben ist: "Anna besuchen"
            const g = String(raw).match(/\b([A-ZÄÖÜ][a-zäöüß]{2,})(?:\s+zu)?\s+(?:besuchen|treffen|sehen|vorbeischauen)\b|\b(?:zu|bei)\s+([A-ZÄÖÜ][a-zäöüß]{2,})\b/);
            const n = g && (g[1] || g[2]);
            if (n && !STOP.test(norm(n)) && !ERLEDIGUNG[norm(n)]) person = norm(n);
        }
        if (person) {
            const spoken = FAMILIE[person] ? FAMILIE[person].replace(/^(?:meinen|meine|meinem|meiner)\s+/, '') : cap(person);
            const titel = 'Besuch bei ' + cap(spoken.charAt(0).toLowerCase() + spoken.slice(1)).replace(/^Meinen? /, '');
            return { art: 'besuch', titel, name: cap(spoken), dauer: 120 };
        }
        // 2) Erledigung: "zum Friseur", "zur Werkstatt", "zum Zahnarzt"
        m = t.match(/\b(?:zum|zur|beim|bei|in\s+die|in\s+den|ins)\s+(?:meinem|meiner|der|dem)?\s*([a-z]{3,})\b/);
        if (m && ERLEDIGUNG[m[1]]) return { art: 'erledigung', titel: ERLEDIGUNG[m[1]], name: ERLEDIGUNG[m[1]], dauer: 60 };
        const w = Object.keys(ERLEDIGUNG).find(k => new RegExp('\\b' + k + '\\b').test(t));
        if (w && /\b(?:muss|muesste|sollte|will|moechte|wollte|zeit)\b/.test(t)) return { art: 'erledigung', titel: ERLEDIGUNG[w], name: ERLEDIGUNG[w], dauer: 60 };
        return null;
    }

    /* ---------- Fahrzeit ---------- */
    async function fahrzeit(ort) {
        if (!ort || typeof wxGeocode !== 'function' || typeof apiFetch !== 'function') return null;
        try {
            const heim = String(pd('helfer_home_address', '') || '').trim();
            if (!heim) return null;
            const [a, b] = await Promise.all([wxGeocode(heim), wxGeocode(ort)]);
            if (!a || !b) return null;
            const r = await apiFetch('/api/route?fromLat=' + a.lat + '&fromLon=' + a.lon + '&toLat=' + b.lat + '&toLon=' + b.lon);
            const d = await r.json();
            const sec = d && d.routes && d.routes[0] && d.routes[0].duration;
            const min = sec ? Math.round(sec / 60) : null;
            return min && min <= 300 ? min + Math.max(10, Math.round(min * 0.2)) : null;   // Puffer für Verkehr: 20 %, mindestens 10 Minuten
        } catch (e) { return null; }
    }

    /* ---------- Freie Zeiten ---------- */
    function schichtInfo() { const T = window._schichtTest; const st = T && T.load && T.load(); return T && st ? { T, st } : null; }
    function schichtAm(iso, si) {
        if (!si) return null;
        try { return si.T.shiftOfWeek(si.st, si.T.weekNo({ y: +iso.slice(0, 4), m: +iso.slice(5, 7), d: +iso.slice(8, 10) })); } catch (e) { return null; }
    }
    function zeitenJson(key, std) { try { return Object.assign({}, std, JSON.parse(pd(key, '') || '{}') || {}); } catch (e) { return std; } }
    function urlaubTage() {
        const out = [];
        try { const l = window.jvUrlaub && window.jvUrlaub.liste ? window.jvUrlaub.liste() : []; l.forEach(x => out.push([x.von, x.bis])); } catch (e) { }
        try { const u = window.jvUrlaub && window.jvUrlaub.get && window.jvUrlaub.get(); if (u && u.von) out.push([u.von, u.bis]); } catch (e) { }
        return out;
    }
    function termineAm(iso) {
        const out = [];
        let arr = []; try { arr = (typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries)) ? calendarEntries : []; } catch (e) { }
        arr.forEach(e => {
            const s = e && e.isoDate ? String(e.isoDate) : ''; if (!s || /^\d{4}-\d{2}-\d{2}$/.test(s)) return;
            const d = new Date(s); if (isNaN(d)) return;
            if (d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) !== iso) return;
            const p = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }).split(':');
            const a = +p[0] * 60 + +p[1];
            out.push([a, a + 60, 'termin']);
        });
        return out;
    }
    function freieZeiten(a) {
        const si = schichtInfo(), abf = zeitenJson('jv_plan_abfahrt', { frueh: 270, spaet: 800 }), ende = zeitenJson('jv_plan_ende', { frueh: 877, spaet: 1332 });
        const urlaub = urlaubTage(), start = plus(heute(), 1), fz = a.fahrzeit || 0;
        const tage = [];
        for (let i = 0; i < 14; i++) {
            const iso = plus(start, i), wd = new Date(iso + 'T12:00:00').getDay();
            const imUrlaub = urlaub.some(u => iso >= u[0] && iso <= u[1]);
            const frei = wd === 0 || wd === 6 || imUrlaub;
            const sh = frei ? null : schichtAm(iso, si);
            const busy = termineAm(iso);
            if (!frei) {
                if (sh) busy.push([abf[sh] - 15, ende[sh] + 45, 'arbeit']);
                else busy.push([300, 960, 'arbeit']);   // Schicht unbekannt: Arbeitstag grob 5 bis 16 Uhr
            }
            const vonMin = 8 * 60 + 30, bisMin = (a.art === 'besuch' ? 20 : 18) * 60;
            const ziel = frei || sh === 'spaet' ? 630 : 990;
            let best = null;
            for (let arr = Math.ceil((vonMin + fz) / 30) * 30; arr + a.dauer + fz <= bisMin; arr += 30) {
                const s0 = arr - fz, s1 = arr + a.dauer + fz;
                if (busy.some(b => s0 < b[1] + 15 && s1 > b[0] - 15)) continue;
                if (!best || Math.abs(arr - ziel) < Math.abs(best - ziel)) best = arr;
            }
            if (best !== null) {
                const spaeter = busy.filter(b => b[0] > best).sort((x, y) => x[0] - y[0])[0];
                tage.push({ iso, arr: best, frei, sh, bis: spaeter ? spaeter[0] - 15 - fz : null, grund: spaeter ? spaeter[2] : '', grundZeit: spaeter ? spaeter[0] + (spaeter[2] === 'arbeit' ? 15 : 0) : null });
            }
        }
        const order = tage.filter(x => x.frei).concat(tage.filter(x => !x.frei));
        return order;
    }

    /* ---------- Ablauf ---------- */
    let offen = null;   // {a, slots, seite, at}
    const SEITE = 3;

    function zeigen() {
        const o = offen; if (!o) return;
        const teil = o.slots.slice(o.seite * SEITE, o.seite * SEITE + SEITE).sort((x, y) => x.iso < y.iso ? -1 : x.iso > y.iso ? 1 : 0);
        o.aktuell = teil;
        if (!teil.length) {
            sagen(o.seite === 0 ? 'In den nächsten 14 Tagen finde ich keine freie Zeit dafür. Sag mir einen Tag, dann trage ich ihn trotzdem ein.' : 'Das waren alle freien Zeiten der nächsten 14 Tage.');
            if (o.seite === 0) offen = null; else o.seite--;
            return;
        }
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(teil.map((s, i) => ({
                icon: '📅', title: datumSprech(s.iso) + ' · ' + hm(s.arr) + ' Uhr',
                subtitle: (o.a.fahrzeit ? 'Abfahrt ' + hm(s.arr - o.a.fahrzeit) + ' · ' : '') + o.a.titel, onclick: 'window.jvTerminWahl(' + i + ')'
            })));
        } catch (e) { }
        const s1 = teil[0], a = o.a, ziel = a.art === 'besuch' ? 'zu ' + a.name + ' fahren' : a.titel;
        let satz = 'Am ' + datumSprech(s1.iso) + ' könntest du ' + (a.art === 'besuch' ? ziel : 'das erledigen: ' + a.titel) + '. ';
        const lage = s1.frei ? 'Da hast du frei. ' : s1.sh === 'spaet' ? 'Da hast du Spätschicht. ' : s1.sh === 'frueh' ? 'Da hast du Frühschicht. ' : '';
        satz += lage;
        if (a.fahrzeit) satz += 'Ich rechne ' + a.fahrzeit + ' Minuten Fahrt mit Verkehr. Fahr um ' + sprech(s1.arr - a.fahrzeit) + ' los, dann bist du um ' + sprech(s1.arr) + ' da. ';
        else satz += 'Passt gut um ' + sprech(s1.arr) + '. ';
        if (s1.bis !== null && s1.bis > s1.arr + 15) satz += 'Du hast Zeit bis ' + sprech(s1.bis) + (a.fahrzeit ? ', dann musst du dich auf den Rückweg machen' : '') + ', weil du um ' + sprech(s1.grundZeit) + (s1.grund === 'arbeit' ? ' zur Arbeit los musst. ' : ' einen Termin hast. ');
        else if (s1.bis === null && a.art === 'besuch') satz += 'Danach hast du nichts mehr vor, du kannst in Ruhe bleiben. ';
        const rest = teil.slice(1).map((s, i) => (i + 2) + ', ' + datumSprech(s.iso) + ' um ' + sprech(s.arr)).join('. ');
        const kopf = o.seite === 0 ? (a.art === 'besuch' ? '' : '') : 'Weitere freie Zeiten. ';
        sagen(kopf + satz + (rest ? 'Weitere Möglichkeiten: ' + rest + '. ' : '') + 'Welche soll ich eintragen? Sag eins, zwei oder drei, oder andere.');
    }
    async function wahl(i) {
        const o = offen; if (!o || !o.aktuell || !o.aktuell[i]) return false;
        const s = o.aktuell[i], a = o.a; offen = null;
        try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) { }
        let ok = false;
        try {
            if (typeof addGoogleCalendarEvent === 'function') ok = await addGoogleCalendarEvent(a.titel, s.iso + 'T' + hm(s.arr) + ':00', a.ort || '', null, false, null, a.dauer);
        } catch (e) { console.error('Termin-Finder', e); }
        sagen('Eingetragen: ' + a.titel + ', ' + datumSprech(s.iso) + ' um ' + sprech(s.arr) + (a.fahrzeit ? ', Abfahrt um ' + sprech(s.arr - a.fahrzeit) : '') + '.' + (ok ? ' Er steht im Google Kalender.' : ' Er steht nur in der App, Google ist nicht verbunden.'));
        return true;
    }
    window.jvTerminWahl = function (i) { return wahl(i); };

    async function starten(a) {
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Suche freie Zeiten...'); } catch (e) { }
        a.ort = (a.art === 'besuch' && typeof window.jvOrtAusKontakt === 'function') ? window.jvOrtAusKontakt(a.titel) : '';
        a.fahrzeit = a.ort ? await fahrzeit(a.ort) : null;
        if (a.art === 'besuch' && !a.ort) a.keineAdresse = true;
        const slots = freieZeiten(a);
        offen = { a, slots, seite: 0, at: Date.now() };
        if (a.keineAdresse) sagen('Zu ' + a.name + ' habe ich keine Adresse in den Kontakten, deshalb rechne ich ohne Fahrzeit.');
        zeigen();
    }

    const ZAHL = [/^(?:1|eins|ein|erste[nrs]?|die erste|den ersten|nummer eins|nummer 1)$/, /^(?:2|zwei|zweite[nrs]?|die zweite|den zweiten|nummer zwei|nummer 2)$/, /^(?:3|drei|dritte[nrs]?|die dritte|den dritten|nummer drei|nummer 3)$/];
    function befehl(text, next) {
        const t = norm(text);
        if (offen && Date.now() - offen.at > 4 * 60000) offen = null;
        if (offen && t) {
            if (/^(?:nein|nee|abbrechen|keine|keinen|keins|nichts|lass es|vergiss es|stopp?|egal)(?:\s|$)/.test(t)) { offen = null; try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) { } sagen('Okay, ich trage nichts ein.'); return true; }
            if (/^(?:andere|weitere|mehr|noch (?:mehr|andere|welche)|spaeter|naechste|zeig mir andere)\b/.test(t)) { offen.seite++; offen.at = Date.now(); zeigen(); return true; }
            let i = ZAHL.findIndex(r => r.test(t));
            if (i < 0) { const m = t.match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/); if (m && offen.aktuell) i = offen.aktuell.findIndex(s => TAGE[new Date(s.iso + 'T12:00:00').getDay()].toLowerCase() === m[1]); }
            if (i >= 0 && offen.aktuell && offen.aktuell[i]) { wahl(i); return true; }
        }
        const a = verstehen(text);
        if (!a) return next(text);
        starten(a).catch(e => { console.error('Termin-Finder', e); sagen('Beim Suchen ist etwas schiefgegangen.'); });
        return true;
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('terminfinder', befehl, 0.34);
    window.jvTerminfinder = { verstehen, freieZeiten };
})();
