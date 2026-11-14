/* ============================================================
   URLAUB: "Ich habe Urlaub vom 20. Oktober bis 3. November" – in dieser Zeit meldet Zane nichts mehr zum Arbeitsweg
   (kein Wetter für die Fahrt zur Arbeit, kein Regen auf dem Arbeitsweg, kein Schicht-Briefing, kein "Zeit ins Bett" vor der Frühschicht).
   Sprache:  "Ich habe Urlaub vom 20. Oktober bis 3. November" / "Urlaub vom 20.10. bis 3.11." / "Ich habe ab morgen zwei Wochen Urlaub"
             Auch: "nächste Woche Urlaub", "übernächste Woche", "von Montag bis Freitag", "bis Freitag", "ab nächster Woche zwei Wochen" (Wochen = Mo–Fr).
             "Urlaub beenden" / "Ich habe keinen Urlaub mehr" / "Habe ich Urlaub eingetragen?"
   Kalender: Der Urlaub kommt als ganztägiger Termin "Urlaub 🌴" in den Google Kalender (ID "kid" beim Urlaub in jv_urlaub_liste). Mehrere Urlaube möglich; jv_urlaub bleibt der laufende oder nächste (für den Server). Löschen: ohne Angabe der laufende/nächste, sonst "im Januar", "vom 5. Januar", "alle". Überschneidende Urlaube werden ersetzt.
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
        const alt = liste();
        a = (a || []).map(e => { const o = alt.find(x => x.von === e.von && x.bis === e.bis); return o && o.kid ? Object.assign({}, e, { kid: o.kid }) : e; });
        alt.forEach(o => { if (o.s === 1 && !a.some(e => e.von === o.von && e.bis === o.bis)) a.push(o); });   // per Sprache eingetragene Urlaube bleiben beim Urlaubszettel erhalten
        try { setPersistentData(LKEY, a.length ? JSON.stringify(a) : ''); } catch (e) {} try { if (window.jvSchichtNeuPlanen) window.jvSchichtNeuPlanen(); } catch (e) {}
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

    const WORD = /\burlaub(?:e|en)?\b/;
    const LOESCH = /\b(?:lösch\w*|loesch\w*|beend\w*|entfern\w*|streich\w*|storni\w*|absag\w*|abgesagt|abbrech\w*)\b/;
    const ENDE = /(urlaub\s+(?:beenden|löschen|entfernen|abbrechen|ist\s+(?:vorbei|zu\s+ende|aus))|(?:kein(?:en)?|nicht\s+mehr)\s+urlaub|urlaub\s+(?:fällt|f[aä]llt)\s+aus|urlaub\s+abgesagt)/;
    const FRAGE = /\b(?:habe|hab|hatte|hast)\s+(?:ich|ich\s+noch|ich\s+gerade)\s+(?:einen\s+)?urlaub|urlaub\s+eingetragen|wann\s+(?:ist|habe\s+ich|hab\s+ich)\s+(?:mein\s+)?urlaub|wie\s+lange\s+(?:habe|hab)\s+ich\s+(?:noch\s+)?urlaub/;


    /* Kalender: Jeder per Sprache eingetragene Urlaub kommt zusätzlich als ganztägiger Termin "Urlaub 🌴" in den Google Kalender. Die Termin-ID (kid)
       steht beim Urlaub in der Liste, damit Löschen oder Ersetzen genau diesen Eintrag entfernt (nie fremde Termine). */
    const KALKEY = 'jv_urlaub_kal';   // alt (ein einzelner Urlaub bis 14.11.2026): wird beim ersten Mal in die Liste übernommen
    function speichereListe(a) { try { setPersistentData(LKEY, a && a.length ? JSON.stringify(a) : ''); } catch (e) {} try { if (window.jvSchichtNeuPlanen) window.jvSchichtNeuPlanen(); } catch (e) {} }
    function uebernehmeAlt() {   // ein früher gesetzter einzelner Urlaub (nur jv_urlaub) gehört in die Liste
        const c = einzeln();
        if (!(c && c.von && c.bis && c.bis >= today())) return;
        const l = liste();
        if (l.some(x => x.von === c.von && x.bis === c.bis)) return;
        let kid = '';
        try { const k = JSON.parse(getPersistentData(KALKEY, '') || 'null'); if (k && k.id && k.von === c.von && k.bis === c.bis) kid = k.id; } catch (e) {}
        const e = { von: c.von, bis: c.bis, s: 1 }; if (kid) e.kid = kid;
        l.push(e); speichereListe(l);
    }
    function sortiert() { return liste().filter(x => x.bis >= today()).sort((a, b) => a.von < b.von ? -1 : a.von > b.von ? 1 : 0); }
    async function kalenderLoeschen(kid) {   // null: kein Kalendereintrag bekannt, true: weg, false: bleibt bei Google stehen
        if (!kid) return null;
        try { const ok = typeof deleteCalendarEntry === 'function' ? await deleteCalendarEntry(kid) : false; return ok !== false; } catch (e) { return false; }
    }
    async function kalenderNeu(von, bis) {   // { r: null (nicht möglich) | 'ok' | 'fehler', kid }
        try {
            if (typeof addGoogleCalendarEvent !== 'function') return { r: null, kid: '' };
            window.jvLetzterGoogleTermin = null;
            const ok = await addGoogleCalendarEvent('Urlaub 🌴', von + 'T12:00:00', '', null, true, bis);
            const t = window.jvLetzterGoogleTermin;
            return { r: ok ? 'ok' : 'fehler', kid: ok && t && t.id ? t.id : '' };
        } catch (e) { return { r: 'fehler', kid: '' }; }
    }

    /* Kontrolle nach dem Eintragen: Jarvis liest den Termin direkt bei Google nach und zeigt ihn ein paar Sekunden in einem kleinen Kalender
       (Haken = steht wirklich bei Google; sonst rot "nur in Jarvis"). Danach schließt sich das Fenster und die Übersicht ist wieder da. */
    async function kalenderPruefen(kid) {   // Termin von Google oder null
        try {
            if (!kid || typeof isGoogleAuthorized !== 'function' || !isGoogleAuthorized() || typeof fetch !== 'function') return null;
            const res = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(kid), { headers: { 'Authorization': 'Bearer ' + accessToken } });
            if (!res || !res.ok) return null;
            const d = await res.json();
            return d && d.status !== 'cancelled' && d.start && d.start.date ? d : null;
        } catch (e) { return null; }
    }
    function kontrolleHtml(von, bis, ok) {
        const y = +von.slice(0, 4), m = +von.slice(5, 7), tage = new Date(y, m, 0).getDate();
        const vor = (new Date(y, m - 1, 1, 12).getDay() + 6) % 7;
        const farbe = ok ? '#4cffb0' : '#ff8a6b', tint = ok ? 'rgba(76,255,176,.22)' : 'rgba(255,138,107,.22)';
        let zellen = '';
        for (let i = 0; i < vor; i++) zellen += '<span></span>';
        for (let d = 1; d <= tage; d++) {
            const iso = y + '-' + ('0' + m).slice(-2) + '-' + ('0' + d).slice(-2), drin = iso >= von && iso <= bis;
            zellen += '<span style="padding:5px 0;border-radius:6px;' + (drin ? 'background:' + tint + ';color:' + farbe + ';font-weight:700;' : 'color:#9fb6c6;') + '">' + d + '</span>';
        }
        const kopf = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map(t => '<span style="color:#5d7e91;font-size:11px;">' + t + '</span>').join('');
        const monat = new Date(y, m - 1, 1, 12).toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
        return '<div style="display:flex;justify-content:space-between;font-size:13px;margin-bottom:8px;"><b>📅 Google Kalender</b><span style="color:#5d7e91;">' + (ok ? 'gerade abgefragt' : 'nicht gefunden') + '</span></div>'
            + '<div style="font-size:13px;color:#9fb6c6;margin-bottom:6px;">' + monat + '</div>'
            + '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:3px;text-align:center;font-size:13px;">' + kopf + zellen + '</div>'
            + '<div style="margin-top:10px;padding:9px 11px;border-radius:8px;border:1px solid ' + farbe + ';color:' + farbe + ';font-size:13px;"><b>' + (ok ? '✓ Urlaub 🌴 steht bei Google' : '✗ Nur in Jarvis, bei Google nicht gefunden') + '</b><br><span style="color:#9fb6c6;">' + lesbar(von) + ' bis ' + lesbar(bis) + (ok ? ', ganztägig' : '') + '</span></div>'
            + '<div style="margin-top:10px;height:3px;background:rgba(255,255,255,.12);border-radius:2px;"><div id="jvUrlaubBalken" style="width:100%;height:3px;background:' + farbe + ';border-radius:2px;transition:width 6s linear;"></div></div>';
    }
    async function zeigeKontrolle(von, bis, kid) {
        try {
            const d = await kalenderPruefen(kid);
            let v = von, b = bis;
            if (d) { v = d.start.date; b = d.end && d.end.date ? addDays(d.end.date, -1) : d.start.date; }   // so, wie es bei Google steht
            const wrap = document.createElement('div'); wrap.id = 'jvUrlaubKontrolle';
            wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(3,10,16,.72);display:flex;align-items:center;justify-content:center;';
            wrap.innerHTML = '<div style="background:#0a1621;border:1px solid rgba(93,209,255,.4);border-radius:14px;width:min(92vw,360px);padding:14px;color:#e2e8f0;font-family:ui-monospace,monospace;">' + kontrolleHtml(v, b, !!d) + '</div>';
            const alt = document.getElementById && document.getElementById('jvUrlaubKontrolle'); if (alt && alt.remove) alt.remove();
            let zu = false;
            const schliessen = function () {
                if (zu) return; zu = true;
                try { wrap.remove(); } catch (e) {}
                try { if (typeof closePanel === 'function') closePanel(); } catch (e) {}
                try { if (window.jvUebersicht && window.jvUebersicht.auffrischen) window.jvUebersicht.auffrischen(); } catch (e) {}
            };
            wrap.onclick = schliessen;
            document.body.appendChild(wrap);
            setTimeout(function () { try { const bl = wrap.querySelector && wrap.querySelector('#jvUrlaubBalken'); if (bl) bl.style.width = '0%'; } catch (e) {} }, 40);
            setTimeout(schliessen, d ? 6000 : 9000);
            return { ok: !!d, von: v, bis: b };
        } catch (e) { return { ok: false }; }
    }
    function kurz(e) { return 'vom ' + lesbar(e.von) + ' bis zum ' + lesbar(e.bis); }
    function monatsTreffer(mo) {   // Urlaube, die den Monat (in irgendeinem Jahr ihres Zeitraums) berühren
        return sortiert().filter(x => {
            for (let y = +x.von.slice(0, 4); y <= +x.bis.slice(0, 4); y++) {
                const a = iso(y, mo, 1), b = iso(y, mo, new Date(y, mo, 0).getDate());
                if (a && b && x.von <= b && x.bis >= a) return true;
            }
            return false;
        });
    }
    /* Urlaub löschen: ohne Angabe der laufende oder nächste; sonst nach Monat ("im Januar"), Datum ("vom 5. Januar") oder "alle" */
    function loeschen(t) {
        uebernehmeAlt();
        const l = sortiert();
        if (!l.length) { say('Es war kein Urlaub eingetragen.'); return true; }
        let ziel = null;
        if (/\b(?:alle|sämtliche\w*|saemtliche\w*)\b/.test(t)) ziel = l;
        else {
            const ds = findDates(t).filter(d => !/heute|morgen/.test(t.slice(d.i, d.i + 8)));
            const mm = t.match(new RegExp('\\b' + MON_RX + '\\w*'));
            if (ds.length) ziel = l.filter(x => ds.some(d => x.von <= d.iso && x.bis >= d.iso));
            else if (mm) ziel = monatsTreffer(monthIdx(mm[1]));
            else { const c = get(); ziel = c ? l.filter(x => x.von === c.von && x.bis === c.bis) : [l[0]]; if (!ziel.length) ziel = [l[0]]; }
            if (!ziel.length) { say('Dazu habe ich keinen Urlaub gefunden. Du hast ' + (l.length === 1 ? 'einen Urlaub ' + kurz(l[0]) : l.length + ' Urlaube: ' + l.slice(0, 4).map(kurz).join(', ')) + '.'); return true; }
            if (ziel.length > 1) { say('Da habe ich ' + ziel.length + ' Urlaube: ' + ziel.slice(0, 4).map(kurz).join(', ') + '. Sag mir, welchen du meinst, zum Beispiel: Lösch den Urlaub vom ' + lesbar(ziel[0].von) + '.'); return true; }
        }
        const weg = ziel.slice();
        const rest = liste().filter(x => !weg.some(w => w.von === x.von && w.bis === x.bis));
        const c0 = einzeln();
        speichereListe(rest);
        if (c0 && weg.some(w => w.von === c0.von && w.bis === c0.bis)) set(null);
        rolle();
        const msg = (weg.length === 1 ? 'Okay, der Urlaub ' + kurz(weg[0]) + ' ist gelöscht.' : 'Okay, alle ' + weg.length + ' Urlaube sind gelöscht.')
            + (get() ? ' Dein nächster Urlaub ist ' + kurz(get()) + '.' : ' Ab jetzt melde ich mich wieder wie gewohnt zum Arbeitsweg.');
        Promise.all(weg.map(w => kalenderLoeschen(w.kid))).then(rs => {
            const mitKid = rs.filter(r => r !== null);
            say(msg + (!mitKid.length ? '' : mitKid.every(r => r === true) ? ' Der Eintrag im Kalender ist auch weg.' : ' Im Google Kalender konnte ich nicht alles löschen, den Rest musst du dort selbst entfernen.'));
        }).catch(() => say(msg));
        return true;
    }
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[,!?;]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 140 || !WORD.test(t)) return false;
        if (!FRAGE.test(t) && (ENDE.test(t) || LOESCH.test(t))) return loeschen(t);
        if (FRAGE.test(t) || /\b(?:welche|meine)\s+urlaube\b|\burlaube\s+eingetragen\b/.test(t)) {
            uebernehmeAlt();
            const l = sortiert();
            if (!l.length) say('Du hast keinen Urlaub eingetragen.');
            else if (l.length === 1) { const u = l[0]; say(u.von <= today() ? 'Dein Urlaub läuft noch bis zum ' + lesbar(u.bis) + '. Danach melde ich mich wieder zum Arbeitsweg.' : 'Du hast ' + kurz(u) + ' Urlaub eingetragen.'); }
            else say('Du hast ' + l.length + ' Urlaube eingetragen: ' + l.slice(0, 5).map(kurz).join(', ') + '.');
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
                uebernehmeAlt();
                const l0 = liste(), ersetzt = l0.filter(x => x.von <= bis && x.bis >= von);   // überschneidet sich ein Urlaub, wird er ersetzt (sein Kalendereintrag auch)
                const l1 = l0.filter(x => x.bis >= today() && !ersetzt.includes(x)); l1.push({ von, bis, s: 1 });
                speichereListe(l1); set(null); rolle();
                const basis = 'Alles klar, Urlaub vom ' + lesbar(von) + ' bis zum ' + lesbar(bis) + ' ist eingetragen. In dieser Zeit melde ich nichts mehr zum Arbeitsweg.'
                    + (ersetzt.length ? ' Den überschneidenden Urlaub ' + kurz(ersetzt[0]) + ' habe ich dafür ersetzt.' : '') + (l1.length > 1 ? ' Du hast jetzt ' + l1.length + ' Urlaube eingetragen.' : '');
                Promise.all(ersetzt.map(x => kalenderLoeschen(x.kid))).then(() => kalenderNeu(von, bis)).then(k => {
                    if (k.kid) { const l2 = liste(); const e = l2.find(x => x.von === von && x.bis === bis); if (e) { e.kid = k.kid; speichereListe(l2); } }
                    say(basis + (k.r === 'ok' ? ' Er steht auch im Kalender.' : k.r === 'fehler' ? ' Im Google Kalender konnte ich ihn nicht eintragen, er steht nur in Jarvis.' : ''));
                    return zeigeKontrolle(von, bis, k.kid);
                }).catch(() => say(basis));
                return true;
            }
            say('Von wann bis wann hast du Urlaub? Sag zum Beispiel: Ich habe Urlaub vom 20. Oktober bis 3. November.');
            return true;
        }
        return false;
    }

    window.jvUrlaub = { get, handle, liste, setListe, kontrolle: zeigeKontrolle };
    try { setTimeout(rolle, 3000); setInterval(rolle, 3600000); } catch (e) {}
    if (window.jvCommands) {
        window.jvCommands.use('urlaub', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Urlaub', e); }
            return next(text);
        }, 120);
    }
})();
