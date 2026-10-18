/* ============================================================
   SCHICHTAUSKUNFT: Nova beantwortet Fragen zu deinen Schichtzeiten selbst, ohne dass du sie ins Gedächtnis sprechen musst.
   - Feste Fragen (ohne KI): "Wann beginnt meine Spätschicht?", "Wann fange ich an?", "Schichtbeginn", "Wann stehe ich auf?"
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
    function schichtWoche(plus) {   // 0 = diese Woche, 1 = nächste Woche
        const t = T(), st = t && t.load();
        if (!st) return null;
        return t.shiftOfWeek(st, t.weekNo(t.berlin()) + plus);
    }
    function aufstehen() { const t = T(), st = t && t.load(); return st && st.times ? st.times.frueh : 210; }
    function briefingSpaet() { const t = T(), st = t && t.load(); return st && st.times ? st.times.spaet : 720; }

    /* Für die KI */
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
    }

    function sag(t) { try { speak(t, false); } catch (e) { } return true; }

    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 14) return next(text);
        const nenntFrueh = /\bfrueh\s?schicht\b|\bfruehschicht\b/.test(t), nenntSpaet = /\bspaet\s?schicht\b|\bspaetschicht\b/.test(t);
        const naechste = /\b(naechste|kommende|naechster)\b/.test(t);
        const frageBeginn = (/\b(wann|um wie viel uhr|um wieviel uhr|wie viel uhr)\b.*\b(beginnt|beginn|faengt|fange|fangen|startet|anfang|anfaengt|losgeht|los geht)\b/.test(t) && /\b(schicht|fruehschicht|spaetschicht|arbeit|dienst|an)\b/.test(t))
            || /\b(schichtbeginn|arbeitsbeginn|dienstbeginn)\b/.test(t);
        const frageAuf = /\bwann\b.*\b(stehe ich auf|muss ich aufstehen|soll ich aufstehen|aufstehen)\b/.test(t);
        if (!frageBeginn && !frageAuf) return next(text);
        if (/\b(setz|stell|aender\w*|trag\w*|merk\w*|speicher\w*)\b/.test(t)) return next(text);   // keine Änderung hier
        if (!T() || !T().load()) return sag('Deine Schicht ist noch nicht eingestellt. Sag zum Beispiel: Diese Woche Frühschicht.');
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
