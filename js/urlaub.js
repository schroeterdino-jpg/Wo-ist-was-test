/* ============================================================
   URLAUB: "Ich habe Urlaub vom 20. Oktober bis 3. November" – in dieser Zeit meldet Zane nichts mehr zum Arbeitsweg
   (kein Wetter für die Fahrt zur Arbeit, kein Regen auf dem Arbeitsweg, kein Schicht-Briefing, kein "Zeit ins Bett" vor der Frühschicht).
   Sprache:  "Ich habe Urlaub vom 20. Oktober bis 3. November" / "Urlaub vom 20.10. bis 3.11." / "Ich habe ab morgen zwei Wochen Urlaub"
             Auch: "nächste Woche Urlaub", "übernächste Woche", "von Montag bis Freitag", "bis Freitag", "ab nächster Woche zwei Wochen" (Wochen = Mo–Fr).
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
            if (r) out.push({ iso: r, i: m.index, noYear: !y, cur: !y ? iso(y0, mo, d) : null });
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

    /* Urlaubsliste (Jahresplan vom Foto, js/foto_urlaubsplan.js): [{von,bis,tage,kal}]. Gespeichert und benutzt wird immer nur EIN Urlaub
       (jv_urlaub, den der Server kennt): der laufende oder der nächste aus der Liste. Ist er vorbei, rückt der nächste nach. */
    const LKEY = 'jv_urlaub_liste';

    /* Wochen und Wochentage in echte Daten umwandeln ("nächste Woche", "von Montag bis Freitag", "bis Freitag", "ab nächster Woche zwei Wochen"),
       damit die Datum-Logik unten sie wie "20.10.2026" behandelt. Heute = Europa/Berlin. */
    const WT = { sonntag: 0, montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6 };
    function wochentag(isoStr) { return new Date(isoStr + 'T12:00:00').getDay(); }
    function deDatum(isoStr) { const a = isoStr.split('-'); return +a[2] + '.' + +a[1] + '.' + a[0]; }
    function montagDerWoche(off) { return addDays(today(), -((wochentag(today()) + 6) % 7) + 7 * off); }
    function relativ(t) {
        let r = t;
        /* 1) Wochen: diese / nächste / kommende / übernächste Woche */
        r = r.replace(/(^|\s)(übernächst|uebernaechst|nächst|naechst|kommend|dies)(?:e|er|en|es)?\s+woche\b/g, function (all, pre, w, off, str) {
            const o = /^(?:übernächst|uebernaechst)$/.test(w) ? 2 : /^dies$/.test(w) ? 0 : 1;
            const von = o === 0 ? today() : montagDerWoche(o); let bis = addDays(montagDerWoche(o), 4); if (bis < von) bis = von;
            const davor = str.slice(0, off);
            if (/(?:^|\s)ab(?:\s+der)?\s*$/.test(davor)) return pre + deDatum(von);
            return pre + 'vom ' + deDatum(von) + ' bis ' + deDatum(bis);
        });
        r = r.replace(/\b(vom|von)\s+vom\b/g, '$1');
        /* 2) Wochentage, von links nach rechts: "nächsten Montag" liegt nach heute, sonst gilt der nächste passende Tag ab heute */
        let ref = today();
        r = r.replace(/(^|\s)(nächst\w*|naechst\w*|kommend\w*)?\s*(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonnabend|sonntag)(?=\s|$)/g, function (all, pre, nx, tag) {
            let n = (WT[tag] - wochentag(ref) + 7) % 7;
            if (nx && n === 0 && ref === today()) n = 7;
            ref = addDays(ref, n);
            return pre + deDatum(ref);
        });
        return r;
    }
    function liste() {
        try { const a = JSON.parse(getPersistentData(LKEY, '') || 'null'); return Array.isArray(a) ? a.filter(x => x && x.von && x.bis) : []; } catch (e) { return []; }
    }
    function einzeln() { try { return JSON.parse(getPersistentData(KEY, '') || 'null'); } catch (e) { return null; } }
    function rolle() {
        const l = liste().filter(x => x.bis >= today()).sort((a, b) => a.von < b.von ? -1 : a.von > b.von ? 1 : 0);
        if (!l.length) return;
        const n = l[0], c = einzeln();
        const gueltig = c && c.von && c.bis && c.bis >= today();
        const ausListe = c && liste().some(x => x.von === c.von && x.bis === c.bis);
        if (!gueltig || (ausListe && (c.von !== n.von || c.bis !== n.bis))) set({ von: n.von, bis: n.bis });
    }
    function setListe(a) {
        try { setPersistentData(LKEY, a && a.length ? JSON.stringify(a) : ''); } catch (e) {} try { if (window.jvSchichtNeuPlanen) window.jvSchichtNeuPlanen(); } catch (e) {}
        rolle();
    }
    function get() {
        rolle();
        try {
            const u = einzeln();
            if (u && u.von && u.bis && u.bis >= today()) return u;
        } catch (e) {}
        return null;
    }
    function set(u) { try { setPersistentData(KEY, u ? JSON.stringify(u) : ''); } catch (e) {} try { if (window.jvSchichtNeuPlanen) window.jvSchichtNeuPlanen(); } catch (e) {} }
    function say(txt) { try { speak(txt, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    const WORD = /\burlaub\b/;
    const ENDE = /(urlaub\s+(?:beenden|löschen|entfernen|abbrechen|ist\s+(?:vorbei|zu\s+ende|aus))|(?:kein(?:en)?|nicht\s+mehr)\s+urlaub|urlaub\s+(?:fällt|f[aä]llt)\s+aus|urlaub\s+abgesagt)/;
    const FRAGE = /\b(?:habe|hab|hatte|hast)\s+(?:ich|ich\s+noch|ich\s+gerade)\s+(?:einen\s+)?urlaub|urlaub\s+eingetragen|wann\s+(?:ist|habe\s+ich|hab\s+ich)\s+(?:mein\s+)?urlaub|wie\s+lange\s+(?:habe|hab)\s+ich\s+(?:noch\s+)?urlaub/;

    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[,!?;]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 140 || !WORD.test(t)) return false;
        if (ENDE.test(t)) {
            const cur = get(), had = !!cur; set(null);
            if (cur) { const rest = liste().filter(x => !(x.von === cur.von && x.bis === cur.bis)); try { setPersistentData(LKEY, rest.length ? JSON.stringify(rest) : ''); } catch (e) {} }
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
        const trel = relativ(t);
        const GRUND = /\b(habe|hab|nehme|nehm|trag|trage|tragen|mach|ab|vom|von|bis|hatte)\b/, ERWEITERT = /\b(bin|ist|sind|fahre|fliege|gehe|geh|möchte|moechte|will|brauche|beantragt|genehmigt|gönne|goenne|mache|machen|nehmen)\b/;
        if ((GRUND.test(trel) || (ERWEITERT.test(trel) && findDates(trel).length > 0)) && !/\bwann\b|\bwie\b/.test(trel)) {
            const t = trel;
            const ds = findDates(t);
            let von = null, bis = null;
            if (ds.length >= 2) {
                von = ds[0].iso; bis = ds[1].iso;
                /* Ohne Jahr gilt für BEIDE Daten dasselbe Jahr: "vom 10. bis 16. Oktober" mitten in dieser Woche ist
                   dieses Jahr, auch wenn der 10. schon vorbei ist (früher rutschte er ins nächste Jahr). */
                const a = ds[0], b = ds[1];
                if (a.noYear && a.cur) {
                    const bc = (b.noYear && b.cur) ? b.cur : b.iso;
                    if (a.cur <= bc && bc >= addDays(today(), -1)) { von = a.cur; if (b.noYear && b.cur) bis = b.cur; }
                }
            }
            else if (ds.length === 1 && (() => {   // "vom 10. bis 16. Oktober": nur das zweite Datum hat einen Monat
                const rg = t.match(new RegExp('(\\d{1,2})\\.?\\s*(?:bis|-)\\s*(?:zum\\s+|zu\\s+)?(\\d{1,2})\\.?\\s*' + MON_RX));
                if (!rg) return false;
                const mo = monthIdx(rg[3]), yy = +ds[0].iso.slice(0, 4), v = iso(yy, mo, +rg[1]), b2 = iso(yy, mo, +rg[2]);
                if (!v || !b2 || v > b2) return false;
                von = v; bis = b2; return true;
            })()) { /* von und bis sind gesetzt */ }
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

    window.jvUrlaub = { get, handle, liste, setListe };
    try { setTimeout(rolle, 3000); setInterval(rolle, 3600000); } catch (e) {}
    if (window.jvCommands) {
        window.jvCommands.use('urlaub', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Urlaub', e); }
            return next(text);
        }, 120);
    }
})();
