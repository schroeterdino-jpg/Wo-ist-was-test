/* ============================================================
   URLAUB: "Ich habe Urlaub vom 20. Oktober bis 3. November" – in dieser Zeit meldet Jarvis nichts mehr zum Arbeitsweg
   (kein Wetter für die Fahrt zur Arbeit, kein Regen auf dem Arbeitsweg, kein Schicht-Briefing, kein "Zeit ins Bett" vor der Frühschicht).
   Sprache:  "Ich habe Urlaub vom 20. Oktober bis 3. November" / "Urlaub vom 20.10. bis 3.11." / "Ich habe ab morgen zwei Wochen Urlaub"
             "Urlaub bis Freitag" geht nicht, bitte Datum nennen ("Urlaub bis 24. Oktober").
             "Urlaub beenden" / "Ich habe keinen Urlaub mehr" / "Habe ich Urlaub eingetragen?"
   Speicher: Schlüssel jv_urlaub = {von:'JJJJ-MM-TT', bis:'JJJJ-MM-TT'}. Die Datei js/pushsync.js meldet ihn dem Server (api/sync.js),
             der in dieser Zeit die Arbeitsweg-Meldungen auslässt. Nach dem letzten Urlaubstag gilt automatisch wieder alles normal.
   Braucht: storage.js, commands.js, pushsync.js. Muss nach commands.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_urlaub';
    const MONATE = ['januar', 'februar', 'märz', 'april', 'mai', 'juni', 'juli', 'august', 'september', 'oktober', 'november', 'dezember'];
    const MON_RX = '(jan(?:uar)?|feb(?:ruar)?|mär(?:z)?|maer(?:z)?|apr(?:il)?|mai|jun(?:i)?|jul(?:i)?|aug(?:ust)?|sep(?:t(?:ember)?)?|okt(?:ober)?|nov(?:ember)?|dez(?:ember)?)';

    function today() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function addDays(iso, n) { const d = new Date(iso + 'T12:00:00'); d.setDate(d.getDate() + n); return d.toLocaleDateString('sv-SE'); }
    function iso(y, m, d) {
        const dt = new Date(y, m - 1, d, 12);
        if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
        return dt.toLocaleDateString('sv-SE');
    }
    function monthIdx(name) {
        const n = name.slice(0, 3).replace('mae', 'mär');
        return MONATE.findIndex(m => m.slice(0, 3) === n) + 1;
    }
    function lesbar(s) {
        try { return new Date(s + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }); } catch (e) { return s; }
    }

    /* Alle Datumsangaben im Satz in der Reihenfolge finden */
    function findDates(t) {
        const out = [], now = today(), y0 = +now.slice(0, 4);
        const rx = new RegExp('(\\d{1,2})\\.\\s*(\\d{1,2})\\.?(?:\\s*(\\d{4}|\\d{2}))?(?!\\d)|(\\d{1,2})\\.?\\s*' + MON_RX + '\\w*(?:\\s+(\\d{4}))?|(übermorgen|morgen|heute)', 'g');
        let m;
        while ((m = rx.exec(t))) {
            let d = null, mo = null, y = null;
            if (m[7]) {
                const base = m[7] === 'heute' ? now : addDays(now, m[7] === 'morgen' ? 1 : 2);
                out.push({ iso: base, i: m.index }); continue;
            }
            if (m[1]) { d = +m[1]; mo = +m[2]; y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : null; }
            else { d = +m[4]; mo = monthIdx(m[5]); y = m[6] ? +m[6] : null; }
            if (!mo || mo > 12) continue;
            let r = iso(y || y0, mo, d);
            if (r && !y && r < addDays(now, -1)) r = iso(y0 + 1, mo, d);   // ohne Jahr: nächstes Vorkommen
            if (r) out.push({ iso: r, i: m.index });
        }
        return out;
    }
    const ZAHL = { ein: 1, eine: 1, einen: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, zwölf: 12 };
    function dauerTage(t) {
        const m = t.match(/(\d{1,2}|ein|eine|einen|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|zwölf)\s*(tage?|wochen?)/);
        if (!m) return 0;
        const n = /^\d/.test(m[1]) ? +m[1] : (ZAHL[m[1]] || 0);
        return n * (m[2].startsWith('woche') ? 7 : 1);
    }

    function get() {
        try {
            const u = JSON.parse(getPersistentData(KEY, '') || 'null');
            if (u && u.von && u.bis && u.bis >= today()) return u;
        } catch (e) {}
        return null;
    }
    function set(u) { try { setPersistentData(KEY, u ? JSON.stringify(u) : ''); } catch (e) {} }
    function say(txt) { try { speak(txt, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    const WORD = /\burlaub\b/;
    const ENDE = /(urlaub\s+(?:beenden|löschen|entfernen|abbrechen|ist\s+(?:vorbei|zu\s+ende|aus))|(?:kein(?:en)?|nicht\s+mehr)\s+urlaub|urlaub\s+(?:fällt|f[aä]llt)\s+aus|urlaub\s+abgesagt)/;
    const FRAGE = /\b(?:habe|hab|hatte|hast)\s+(?:ich|ich\s+noch|ich\s+gerade)\s+(?:einen\s+)?urlaub|urlaub\s+eingetragen|wann\s+(?:ist|habe\s+ich|hab\s+ich)\s+(?:mein\s+)?urlaub|wie\s+lange\s+(?:habe|hab)\s+ich\s+(?:noch\s+)?urlaub/;

    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[,!?;]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 140 || !WORD.test(t)) return false;
        if (ENDE.test(t)) {
            const had = !!get(); set(null);
            say(had ? 'Okay, der Urlaub ist gelöscht. Ab jetzt melde ich mich wieder wie gewohnt zum Arbeitsweg.' : 'Es war kein Urlaub eingetragen.');
            return true;
        }
        if (FRAGE.test(t)) {
            const u = get();
            if (!u) say('Du hast keinen Urlaub eingetragen.');
            else if (u.von <= today()) say('Dein Urlaub läuft noch bis zum ' + lesbar(u.bis) + '. Danach melde ich mich wieder zum Arbeitsweg.');
            else say('Du hast vom ' + lesbar(u.von) + ' bis zum ' + lesbar(u.bis) + ' Urlaub eingetragen.');
            return true;
        }
        if (/\b(habe|hab|nehme|nehm|trag|trage|tragen|mach|ab|vom|von|bis|hatte)\b/.test(t) && !/\bwann\b|\bwie\b/.test(t)) {
            const ds = findDates(t);
            let von = null, bis = null;
            if (ds.length >= 2) { von = ds[0].iso; bis = ds[1].iso; }
            else if (ds.length === 1) {
                const n = dauerTage(t);
                if (/\bbis\b/.test(t) && !/\b(vom|von|ab)\b/.test(t)) { von = today(); bis = ds[0].iso; }
                else if (n > 0) { von = ds[0].iso; bis = addDays(von, n - 1); }
            } else {
                const n = dauerTage(t);
                if (n > 0 && /\b(?:ab\s+heute|ab\s+jetzt)\b/.test(t)) { von = today(); bis = addDays(von, n - 1); }
            }
            if (von && bis) {
                if (bis < von) { const x = von; von = bis; bis = x; }
                if (bis < today()) { say('Dieses Datum liegt schon in der Vergangenheit. Nenne mir bitte Anfang und Ende noch einmal.'); return true; }
                set({ von, bis });
                say('Alles klar, Urlaub vom ' + lesbar(von) + ' bis zum ' + lesbar(bis) + ' ist eingetragen. In dieser Zeit melde ich nichts mehr zum Arbeitsweg.');
                return true;
            }
            say('Von wann bis wann hast du Urlaub? Sag zum Beispiel: Ich habe Urlaub vom 20. Oktober bis 3. November.');
            return true;
        }
        return false;
    }

    window.jvUrlaub = { get, handle };
    if (window.jvCommands) {
        window.jvCommands.use('urlaub', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Urlaub', e); }
            return next(text);
        }, 120);
    }
})();
