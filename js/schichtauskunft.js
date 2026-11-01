/* ============================================================
   SCHICHTAUSKUNFT: Jarvis beantwortet Fragen zu deinen Schichtzeiten selbst, ohne dass du sie ins Gedächtnis sprechen musst.
   - Feste Fragen (ohne KI): "Wann beginnt meine Spätschicht?", "Wann fange ich an?", "Schichtbeginn", "Wann stehe ich auf?"
   - Arbeitszeit-Fragen: "Wann muss ich morgen zur Arbeit?" bleiben bei der Schichtauskunft und öffnen NICHT das Lagebild.
   - Die KI bekommt bei jeder Frage die Schichtdaten mit (window.jvSchichtWissen): Schicht diese und nächste Woche, Beginn, Aufstehzeit, Urlaub.
   Quellen: schicht.js (Wochenwechsel, Aufstehzeit Früh, Briefing-Zeit Spät), plan_ansagen.js (Beginn Früh 5:10, Spät 13:45, änderbar), urlaub.js.
   Muss nach schicht.js, urlaub.js und commands.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvSchichtWissen) return;
    const NAME = { frueh: 'Frühschicht', spaet: 'Spätschicht' };
    const BEGINN_STD = { frueh: 5 * 60 + 10, spaet: 13 * 60 + 45 };
    function T() { const t = window._schichtTest; return t && typeof t.load === 'function' && typeof t.shiftOfWeek === 'function' ? t : null; }
    function norm(t) {
        return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9: ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function uhr(min) { const h = Math.floor(min / 60), m = min % 60; return m ? h + ' Uhr ' + m : h + ' Uhr'; }
    function beginn(sh) {
        try {
            const raw = typeof getPersistentData === 'function' ? getPersistentData('jv_plan_beginn', '') : '';
            const o = JSON.parse(raw || 'null');
            if (o && Number.isFinite(o[sh])) return o[sh];
        } catch (e) { }
        return BEGINN_STD[sh];
    }
    function schichtWoche(plus) {
        const t = T(), st = t && t.load();
        if (!st) return null;
        return t.shiftOfWeek(st, t.weekNo(t.berlin()) + plus);
    }
    function aufstehen() { const t = T(), st = t && t.load(); return st && st.times ? st.times.frueh : 210; }
    function briefingSpaet() { const t = T(), st = t && t.load(); return st && st.times ? st.times.spaet : 720; }

    function zielTag(offset) {
        const tt = T(), b = tt && tt.berlin();
        if (!b) return null;
        const d = new Date(Date.UTC(b.y, b.m - 1, b.d + offset));
        return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), ymd: d.toISOString().slice(0, 10), dow: d.getUTCDay() };
    }
    function schichtAmTag(tag) {
        const tt = T(), st = tt && tt.load();
        if (!tt || !st || !tag) return null;
        return tt.shiftOfWeek(st, tt.weekNo(tag));
    }
    function istUrlaub(ymd) {
        try {
            const u = window.jvUrlaub && window.jvUrlaub.get && window.jvUrlaub.get();
            return !!(u && u.von && u.bis && u.von <= ymd && u.bis >= ymd);
        } catch (e) { return false; }
    }

    window.jvSchichtWissen = function () {
        try {
            const a = schichtWoche(0), b = schichtWoche(1);
            if (!a) return null;
            const o = {
                schicht_diese_woche: NAME[a], schicht_naechste_woche: NAME[b],
                schichtbeginn: { 'Frühschicht': uhr(beginn('frueh')), 'Spätschicht': uhr(beginn('spaet')) },
                aufstehen_in_der_fruehschicht: uhr(aufstehen()),
                briefing_in_der_spaetschicht_ab: uhr(briefingSpaet()),
                hinweis: 'Der Schichtwechsel ist immer montags, Früh und Spät wechseln sich wöchentlich ab. Arbeit nur Montag bis Freitag.'
            };
            try { const u = window.jvUrlaub && window.jvUrlaub.get && window.jvUrlaub.get(); if (u && u.von && u.bis) o.urlaub = { von: u.von, bis: u.bis }; } catch (e) { }
            return o;
        } catch (e) { return null; }
    };

    function sag(t) { try { speak(t, false); } catch (e) { } return true; }

    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 14) return next(text);
        const nenntFrueh = /\bfrueh\s?schicht\b|\bfruehschicht\b/.test(t), nenntSpaet = /\bspaet\s?schicht\b|\bspaetschicht\b/.test(t);
        const naechste = /\b(naechste|kommende|naechster)\b/.test(t);
        const frageBeginn = (/\b(wann|um wie viel uhr|um wieviel uhr|wie viel uhr)\b.*\b(beginnt|beginn|faengt|fange|fangen|startet|anfang|anfaengt|losgeht|los geht)\b/.test(t) && /\b(schicht|fruehschicht|spaetschicht|arbeit|dienst|an)\b/.test(t))
            || /\b(schichtbeginn|arbeitsbeginn|dienstbeginn)\b/.test(t);
        const frageAuf = /\bwann\b.*\b(stehe ich auf|muss ich aufstehen|soll ich aufstehen|aufstehen)\b/.test(t);
        // Wichtig: "Wann muss ich morgen zur Arbeit?" fragt nach Arbeits-/Schichtbeginn, nicht nach Route/Abfahrt.
        // Nur wenn ausdrücklich "los", "losfahren", "Abfahrt", "Fahrzeit", "Weg" usw. genannt wird, darf der Arbeitsweg-Handler übernehmen.
        const fragtArbeitszeit = /\b(wann|um wie viel uhr|um wieviel uhr|wie viel uhr)\b/.test(t)
            && /\b(arbeit|arbeiten|dienst)\b/.test(t)
            && (/\b(muss|soll|fange|beginne|arbeite)\b/.test(t) || /\bzur arbeit\b/.test(t))
            && !/\b(los|losfahren|abfahrt|abfahren|fahrzeit|fahrt|weg|route|verkehr|stau|brauche|dauert)\b/.test(t);
        if (!frageBeginn && !frageAuf && !fragtArbeitszeit) return next(text);
        if (/\b(setz|stell|aender\w*|trag\w*|merk\w*|speicher\w*)\b/.test(t)) return next(text);
        if (!T() || !T().load()) return sag('Deine Schicht ist noch nicht eingestellt. Sag zum Beispiel: Diese Woche Frühschicht.');

        // Heute/morgen/übermorgen werden tagesgenau ausgewertet. Das ist besonders am Sonntag wichtig:
        // "morgen" liegt dann bereits in der nächsten Schichtwoche.
        if (fragtArbeitszeit && /\b(heute|morgen|uebermorgen)\b/.test(t)) {
            const off = /\buebermorgen\b/.test(t) ? 2 : /\bmorgen\b/.test(t) ? 1 : 0;
            const tag = zielTag(off);
            const wort = off === 0 ? 'heute' : off === 1 ? 'morgen' : 'übermorgen';
            if (!tag) return next(text);
            if (tag.dow === 0 || tag.dow === 6) return sag('Du musst ' + wort + ' nicht zur Arbeit. Es ist Wochenende.');
            if (istUrlaub(tag.ymd)) return sag('Du musst ' + wort + ' nicht zur Arbeit. Du hast Urlaub.');
            const shTag = schichtAmTag(tag);
            return sag('Du hast ' + wort + ' ' + NAME[shTag] + ' und musst um ' + uhr(beginn(shTag)) + ' anfangen.');
        }

        const diese = schichtWoche(0), nachste = schichtWoche(1);
        const sh = nenntFrueh ? 'frueh' : nenntSpaet ? 'spaet' : (naechste ? nachste : diese);
        if (frageAuf) {
            if (sh === 'frueh') return sag('In der Frühschicht stehst du um ' + uhr(aufstehen()) + ' auf.');
            return sag('In der Spätschicht gibt es keine feste Aufstehzeit. Mein Briefing kommt ab ' + uhr(briefingSpaet()) + ', kurz vor der Abfahrt. In der Frühschicht stehst du um ' + uhr(aufstehen()) + ' auf.');
        }
        if (nenntFrueh || nenntSpaet) {
            return sag('Deine ' + NAME[sh] + ' beginnt um ' + uhr(beginn(sh)) + '. Diese Woche hast du ' + NAME[diese] + ', nächste Woche ' + NAME[nachste] + '.');
        }
        if (naechste) return sag('Nächste Woche hast du ' + NAME[nachste] + ', Beginn um ' + uhr(beginn(nachste)) + '.');
        return sag('Diese Woche hast du ' + NAME[diese] + ', Beginn um ' + uhr(beginn(diese)) + '. Nächste Woche hast du ' + NAME[nachste] + ', Beginn um ' + uhr(beginn(nachste)) + '.');
    }

    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('schicht_auskunft', befehl, 2);
    window._schichtAuskunft = { befehl, wissen: window.jvSchichtWissen };
})();
