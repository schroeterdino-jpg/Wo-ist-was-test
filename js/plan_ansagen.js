/* ============================================================
   plan_ansagen.js – Jarvis meldet sich zur richtigen Zeit von selbst (auch bei gesperrtem Handy, nur in der Jarvis-App)
   ============================================================
   - WOCHENÜBERBLICK: Sonntag 18:00. Schicht der kommenden Woche (mit Urlaubstagen), Termine, Erinnerungen, offene Aufgaben, fällige Rechnungen.
   - AUFBRUCHSZEIT: an jedem Arbeitstag (Mo-Fr, nicht im Urlaub), Früh- und Spätschicht, 10 Minuten vor der Abfahrt.
     Abfahrt = Schichtbeginn minus Fahrzeit (mit aktueller Verkehrslage, kurz vor der Ansage frisch abgefragt) minus 10 Minuten Puffer.
     Schichtbeginn: Früh 5:10, Spät 13:45 (änderbar per Sprache: "Meine Frühschicht beginnt um 5 Uhr 30").
     Abfahrt fest: Früh 4:30, Spät 13:20 ("Meine Abfahrt in der Frühschicht ist um 4 Uhr 30"); bei deutlich längerer Fahrt (ab 10 Minuten mehr) entsprechend früher.
   - STAU-CHECK: 20 Minuten vor der Aufbruchs-Ansage (Frühschicht frühestens 10 Minuten nach dem Aufstehen) prüft Jarvis still die Verkehrslage. Sie spricht nur bei Stau
     oder wenn die Fahrt mindestens 10 Minuten länger dauert als sonst ("normal" = Mittelwert der letzten Messungen). Test: "Teste den Stau-Check".
   - HEIMWEG: kurz nach Schichtende (Früh 14:37, Spät 22:12, änderbar: "Meine Frühschicht endet um 14 Uhr 40") sagt Jarvis, wie lange die Heimfahrt dauert
     und ob auf der Strecke Stau gemeldet ist (ab deinem Standort zur Heimatadresse). Test: "Teste den Heimweg" / "Wie ist der Heimweg?".
   - WECKER-FRAGE: Am Abend vor einer Frühschicht um 20:30: "Soll ich den Wecker auf 3 Uhr 30 stellen?" Ja = Wecker in der Uhr-App des Handys.
   - WECKER per Sprache: "Stell den Wecker auf 6 Uhr 15", "Weck mich um 5", "Wecker in 20 Minuten".
   - Rechnung: "Trag die Frist in den Kalender ein" nach einer ausgewerteten Rechnung (zusätzlich zur Erinnerung).
   So klappt das Von-selbst: Diese Datei meldet der App eine Liste mit Uhrzeiten (ZaneNative.planAnsagen). Die App löst sie zur Zeit selbst aus,
   schaltet den Bildschirm ein und holt Jarvis nach vorn; Jarvis holt die Ansage ab (ZaneNative.holeAnsage) und spricht sie. Im Browser gibt es das nicht.
   Sprache: "Wochenüberblick" (jederzeit) · "Wann muss ich zur Arbeit los?" · "Was ist geplant?" · "Planer aus" / "Planer an" · "Teste die Wecker-Frage"
   Braucht: schicht.js (_schichtTest), urlaub.js, commands.js, voice.js (speak), travel.js (fetchRouteMapData), calendar.js, lists, rechnungen.js. Wird ganz am Ende geladen.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvPlan) return;

    const BEGINN_STD = { frueh: 5 * 60 + 10, spaet: 13 * 60 + 45 };
    const PUFFER_ARBEIT = 10;        // Minuten zwischen Ankunft und Schichtbeginn
    const STAU_VOR = 20;             // Stau-Check so viele Minuten vor der Aufbruchs-Ansage
    const VOR_ABFAHRT = 10;          // so viele Minuten vor der Abfahrt kommt die Ansage
    const WOCHEN_MIN = 18 * 60;      // Sonntag 18:00
    const WECKER_MIN = 20 * 60 + 30; // Abend vor der Frühschicht 20:30
    const HEIM_NACH = 3;             // so viele Minuten nach Schichtende kommt die Heimweg-Ansage
    const TAGE_VORAUS = 5;
    const K_AUS = 'jv_plan_aus', K_FAHRT = 'jv_plan_fahrt', K_BEGINN = 'jv_plan_beginn', K_ABF = 'jv_plan_abfahrt', K_GESAGT = 'jv_plan_gesagt', K_WECKER = 'jv_plan_wecker_', K_ENDE = 'jv_plan_ende', K_HEIM = 'jv_plan_heim', K_VOR = 'jv_plan_vor_';

    /* ---------- Hilfen ---------- */
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function pd(k, d) { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (lsGet(k) ?? d); } catch (e) { return d; } }
    function sd(k, v) { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else lsSet(k, v); } catch (e) { } }
    function N() { return window.ZaneNative || null; }
    function sagen(t, weiter) {
        try { speak(t, weiter && typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { }
    }
    /* ---------- Meldungen zum Nachlesen ---------- */
    const K_MELD = 'jv_meldungen';
    function meldungen() { try { const a = JSON.parse(lsGet(K_MELD) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function escH(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function merkeMeldung(titel, text) {
        try { const a = meldungen(); a.push({ at: Date.now(), t: titel, x: String(text || '').slice(0, 900) }); lsSet(K_MELD, JSON.stringify(a.slice(-20))); } catch (e) { }
    }
    function zeigeMeldung(titel, text) {
        try {
            if (typeof openExtraWindow !== 'function') return;
            const zeit = new Date().toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
            openExtraWindow(titel, '<div style="font-size:12px;color:#8fb4c8;margin-bottom:8px">' + zeit + ' Uhr</div>' +
                '<div style="font-size:15px;line-height:1.55;white-space:pre-wrap">' + escH(String(text || '').replace(/\. (?=[A-ZÄÖÜ])/g, '.\n\n')) + '</div>');
        } catch (e) { }
    }
    /* Meldung sprechen, zum Nachlesen merken und als Fenster zeigen */
    function sagenMeldung(titel, text, ohneFenster, weiter) {   // weiter: Jarvis hört danach zu (bei Fragen mit Ja/Nein)
        merkeMeldung(titel, text);
        if (!ohneFenster) zeigeMeldung(titel, text);
        sagen(text, !!weiter);
    }
    function verlaufFenster() {
        const a = meldungen().slice().reverse();
        if (!a.length) { sagen('Ich habe noch keine Meldung zum Nachlesen gemerkt.', false); return; }
        try {
            if (typeof openExtraWindow !== 'function') { sagen(a[0].t + ': ' + a[0].x, false); return; }
            const html = a.slice(0, 10).map(m => {
                const d = new Date(m.at), tag = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit' }),
                    zeit = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
                return '<div style="margin-bottom:14px;padding-bottom:12px;border-bottom:1px solid rgba(93,209,255,.15)">' +
                    '<div style="font-size:12px;color:#8fb4c8">' + escH(tag) + ', ' + zeit + ' Uhr</div>' +
                    '<div style="font-weight:700;color:#49d7ff;margin:2px 0 4px">' + escH(m.t) + '</div>' +
                    '<div style="font-size:14px;line-height:1.5;white-space:pre-wrap">' + escH(String(m.x).replace(/\. (?=[A-ZÄÖÜ])/g, '.\n')) + '</div></div>';
            }).join('');
            openExtraWindow('🔔 Meine Meldungen', html);
        } catch (e) { }
        sagen('Hier sind deine letzten Meldungen zum Nachlesen.', false);
    }
    function norm(t) {
        return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9:. ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    const pad = n => String(n).padStart(2, '0');
    const pad4 = n => String(n).padStart(4, '0');
    function aus() { return pd(K_AUS, '') === '1'; }

    /* ---------- Zeit in Berlin ---------- */
    function parts(ms) {
        const p = {};
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
            .formatToParts(new Date(ms)).forEach(x => { p[x.type] = x.value; });
        return { ymd: p.year + '-' + p.month + '-' + p.day, min: (+p.hour % 24) * 60 + (+p.minute) };
    }
    function jetzt() { return parts(Date.now()); }
    function offset(ms) {
        const p = parts(ms), [y, m, d] = p.ymd.split('-').map(Number);
        return Date.UTC(y, m - 1, d, 0, 0) + p.min * 60000 - ms;
    }
    /* Zeitpunkt (Millisekunden) für Datum und Minute seit Mitternacht in Berlin */
    function berlinMs(ymd, min) {
        const [y, m, d] = ymd.split('-').map(Number);
        const t0 = Date.UTC(y, m - 1, d, 0, 0) + min * 60000;
        let r = t0 - offset(t0);
        r = t0 - offset(r);
        return r;
    }
    function ymdPlus(ymd, n) { const [y, m, d] = ymd.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
    function dow(ymd) { const [y, m, d] = ymd.split('-').map(Number); return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7; }   // Montag = 0
    const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag'];
    function tagName(ymd) {
        const h = jetzt().ymd;
        if (ymd === h) return 'heute';
        if (ymd === ymdPlus(h, 1)) return 'morgen';
        return TAGE[dow(ymd)];
    }
    function uhr(min) { const h = Math.floor(min / 60), m = min % 60; return m ? h + ' Uhr ' + m : h + ' Uhr'; }
    function uhrHM(min) { return Math.floor(min / 60) + ':' + pad(min % 60); }
    function undListe(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]; }
    function tagWann(ymd) { const t = tagName(ymd); return t === 'heute' ? 'Heute' : t === 'morgen' ? 'Morgen' : 'Am ' + t; }

    /* ---------- Schicht, Urlaub, Schichtbeginn ---------- */
    function S() { const t = window._schichtTest; return t && typeof t.load === 'function' ? t : null; }
    function urlaubAm(ymd) {
        try {
            const u = window.jvUrlaub && window.jvUrlaub.get && window.jvUrlaub.get();
            return !!(u && u.von && u.bis && u.von <= ymd && u.bis >= ymd);
        } catch (e) { return false; }
    }
    function schichtAm(ymd) {   // 'frueh' | 'spaet' | null (Wochenende, Urlaub, keine Schicht eingestellt)
        const T = S(); if (!T) return null;
        const st = T.load(); if (!st) return null;
        if (dow(ymd) > 4 || urlaubAm(ymd)) return null;
        const [y, m, d] = ymd.split('-').map(Number);
        return T.shiftOfWeek(st, T.weekNo({ y, m, d }));
    }
    function schichtOhneUrlaub(ymd) {
        const T = S(); if (!T) return null;
        const st = T.load(); if (!st) return null;
        const [y, m, d] = ymd.split('-').map(Number);
        return T.shiftOfWeek(st, T.weekNo({ y, m, d }));
    }
    function beginn(sh) {
        try {
            const o = JSON.parse(pd(K_BEGINN, '') || 'null');
            if (o && Number.isFinite(o[sh])) return o[sh];
        } catch (e) { }
        return BEGINN_STD[sh];
    }
    function setBeginn(sh, min) {
        let o = {}; try { o = JSON.parse(pd(K_BEGINN, '') || '{}') || {}; } catch (e) { }
        o[sh] = min; sd(K_BEGINN, JSON.stringify(o));
    }
    const ENDE_STD = { frueh: 14 * 60 + 37, spaet: 22 * 60 + 12 };
    function ende(sh) {
        try { const o = JSON.parse(pd(K_ENDE, '') || 'null'); if (o && Number.isFinite(o[sh])) return o[sh]; } catch (e) { }
        return ENDE_STD[sh];
    }
    function setEnde(sh, min) {
        let o = {}; try { o = JSON.parse(pd(K_ENDE, '') || '{}') || {}; } catch (e) { }
        o[sh] = min; sd(K_ENDE, JSON.stringify(o));
    }
    function weckzeit() { const T = S(), st = T && T.load(); return st && st.times && Number.isFinite(st.times.frueh) ? st.times.frueh : 210; }
    const NAME = { frueh: 'Frühschicht', spaet: 'Spätschicht' };

    /* ---------- Abfahrtszeit ----------
       Feste Zeit pro Schicht (Früh 4:30, Spät 13:20; änderbar per Sprache). Nur wenn die Fahrt heute deutlich länger dauert als sonst
       (10 Minuten oder mehr), wird entsprechend früher losgefahren. */
    const ABF_STD = { frueh: 4 * 60 + 30, spaet: 13 * 60 + 20 };
    function abfFix(sh) {
        try { const o = JSON.parse(pd(K_ABF, '') || 'null'); if (o && Number.isFinite(o[sh])) return o[sh]; } catch (e) { }
        return ABF_STD[sh];
    }
    function setAbf(sh, min) {
        let o = {}; try { o = JSON.parse(pd(K_ABF, '') || '{}') || {}; } catch (e) { }
        o[sh] = min; sd(K_ABF, JSON.stringify(o));
    }
    /* Tages-Vorzug: Jarvis zieht die Abfahrt (und die Wecker-Zeit) an einem bestimmten Tag um N Minuten vor, zum Beispiel bei Frost (zuvorkommend.js). Rückgängig: auf 0 setzen. */
    function tagVor(ymd) { const v = Number(lsGet(K_VOR + ymd)); return Number.isFinite(v) && v > 0 && v <= 60 ? Math.round(v) : 0; }
    function setTagVor(ymd, min) { if (min > 0) lsSet(K_VOR + ymd, String(Math.round(min))); else { try { localStorage.removeItem(K_VOR + ymd); } catch (e) { } } }
    function abfahrtFuer(sh, min, normal, ymd) { const mehr = (min || 0) - (normal || 0); return abfFix(sh) - (ymd ? tagVor(ymd) : 0) - (mehr >= 10 ? mehr : 0); }

    /* ---------- Fahrzeit zur Arbeit ---------- */
    /* "Normale" Fahrzeit = Mittelwert (Median) der letzten Messungen; einzelne Staus verfälschen sie kaum */
    function messungen() {
        try { const a = JSON.parse(lsGet(K_FAHRT) || '[]'); return Array.isArray(a) ? a.filter(x => x && x.min >= 3 && x.min <= 180) : []; } catch (e) { return []; }
    }
    function letzteFahrt() {
        const m = messungen().map(x => x.min).sort((a, b) => a - b);
        return m.length ? m[Math.floor(m.length / 2)] : 30;
    }
    function merkeFahrt(min) {
        if (!(min >= 3 && min <= 180)) return;
        const a = messungen(); a.push({ min, at: Date.now() });
        lsSet(K_FAHRT, JSON.stringify(a.slice(-9)));
    }
    const ISTSTAU = /Achtung, auf der Strecke aktuell gemeldet|Außerdem gemeldet/;
    async function fahrtFrisch() {
        let min = null, stau = '', st = 0;
        try {
            if (typeof workAddress === 'string' && workAddress) {
                if (typeof fetchRouteMapData === 'function') {
                    const d = await Promise.race([fetchRouteMapData(workAddress), new Promise(r => setTimeout(() => r(null), 14000))]);
                    if (d && d.fahrtMin) {
                        min = d.fahrtMin; st = d.stauMin || 0;
                        stau = (typeof lastStauText === 'string') ? lastStauText.trim() : '';
                    }
                }
                if (!min && typeof wachterDriveMinutes === 'function') {
                    const m = await Promise.race([wachterDriveMinutes(workAddress), new Promise(r => setTimeout(() => r(null), 6000))]);
                    if (m) min = m;
                }
            }
        } catch (e) { }
        if (min) merkeFahrt(min);   // gemerkt wird die Fahrzeit ohne Stau (sie ist der Vergleichswert für "normal")
        return { min: min ? min + st : min, st, stau };
    }
    if (typeof window.jvSchichtInfo === 'function' && !window.jvSchichtInfo._plan) {   // merkt sich die Fahrzeit, wenn das Briefing sie holt
        const o = window.jvSchichtInfo;
        const w = async function () {
            const r = await o.apply(this, arguments);
            try { if (r && r.fahrzeit_zur_arbeit_minuten) merkeFahrt(r.fahrzeit_zur_arbeit_minuten - (r.davon_stau_minuten || 0)); } catch (e) { }
            return r;
        };
        w._plan = true;
        window.jvSchichtInfo = w;
    }

    /* ---------- Heimweg (ab deinem Standort zur Heimatadresse) ---------- */
    function heimAdresse() {
        try {
            if (typeof homeAddress === 'string') return homeAddress;
            return (homeAddress && (homeAddress.address || homeAddress.text || homeAddress.label)) || '';
        } catch (e) { return ''; }
    }
    function heimMessungen() {
        try { const a = JSON.parse(lsGet(K_HEIM) || '[]'); return Array.isArray(a) ? a.filter(x => x && x.min >= 3 && x.min <= 180) : []; } catch (e) { return []; }
    }
    function heimNormal() {
        const m = heimMessungen().map(x => x.min).sort((a, b) => a - b);
        return m.length >= 3 ? m[Math.floor(m.length / 2)] : null;   // erst nach 3 Messungen gibt es einen Vergleichswert
    }
    function merkeHeim(min) {
        if (!(min >= 3 && min <= 180)) return;
        const a = heimMessungen(); a.push({ min, at: Date.now() });
        lsSet(K_HEIM, JSON.stringify(a.slice(-9)));
    }
    async function heimFrisch() {
        let min = null, stau = '', st = 0;
        const ziel = heimAdresse();
        try {
            if (ziel) {
                if (typeof fetchRouteMapData === 'function') {
                    const d = await Promise.race([fetchRouteMapData(ziel), new Promise(r => setTimeout(() => r(null), 14000))]);
                    if (d && d.fahrtMin) {
                        min = d.fahrtMin; st = d.stauMin || 0;
                        stau = (typeof lastStauText === 'string') ? lastStauText.trim() : '';
                    }
                }
                if (!min && typeof wachterDriveMinutes === 'function') {
                    const m = await Promise.race([wachterDriveMinutes(ziel), new Promise(r => setTimeout(() => r(null), 6000))]);
                    if (m) min = m;
                }
            }
        } catch (e) { }
        return { min: min ? min + st : min, st, stau, ziel: !!ziel };
    }
    /* Tanken auf dem Heimweg: fragt den Server nach einer deutlich günstigeren Tankstelle nahe der Strecke (mind. 4 Cent unter dem Schnitt, höchstens 5 Minuten Umweg).
       Rückgabe: Satz, oder '' wenn nichts Passendes da ist (mit zeigeKeins=true dann ein Satz, warum nicht) */
    async function heimTank(zeigeKeins) {
        const keins = t => zeigeKeins ? t : '';
        try {
            const ziel = heimAdresse();
            if (!ziel || typeof geocodeAddress !== 'function' || typeof apiFetch !== 'function') return keins('Dafür fehlt mir die Heimatadresse.');
            const h = await Promise.race([geocodeAddress(ziel), new Promise(r => setTimeout(() => r(null), 6000))]);
            if (!h) return keins('Ich konnte deine Heimatadresse nicht auf der Karte finden.');
            let pos;
            try { pos = await getPosition({ timeout: 9000, enableHighAccuracy: false, maximumAge: 120000 }); } catch (e) { return keins('Ich kenne deinen Standort gerade nicht. Ist der Standortzugriff erlaubt?'); }
            const res = await Promise.race([
                apiFetch('/api/sync?action=tank_heim', { method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ lat: pos.coords.latitude, lon: pos.coords.longitude, hlat: h.lat, hlon: h.lon }) }),
                new Promise(r => setTimeout(() => r(null), 10000))]);
            if (!res || !res.ok) return keins('Die Spritpreise konnte ich gerade nicht abrufen.');
            const r = await res.json();
            if (!r || !r.found) {
                if (r && r.nah) return keins('Du bist schon fast zu Hause.');
                return keins('Auf deinem Heimweg ist gerade nichts deutlich Günstigeres dabei.');
            }
            const preis = (Math.round(r.price * 100) / 100).toFixed(2).replace('.', ',');
            const ort = r.place ? ' in ' + r.place : '';
            const um = r.umwegMin <= 1 ? 'kaum Umweg' : r.umwegMin + ' Minuten Umweg';
            return 'Übrigens: ' + r.name + ort + ' hat Diesel für ' + preis + ' Euro, ' + r.ct + ' Cent günstiger als im Schnitt hier, ' + um + '.';
        } catch (e) { return keins('Das hat gerade nicht geklappt.'); }
    }
    /* Text für die Heimfahrt; leer nur, wenn du schon zu Hause bist (und es kein Test ist) */
    /* offene Aufgaben, in denen "heute" steht (nur die werden beim Feierabend genannt) */
    function heuteAufgaben() {
        const l = (typeof todoEntries !== 'undefined' && Array.isArray(todoEntries)) ? todoEntries : [];
        const heute = jetzt().ymd;
        return l.filter(e => e && !e.done && (e.due === heute || /\bheute\b|^\s*noch\b/i.test(String(e.text || '')))).map(e => String(e.text).trim());
    }
    function heuteAufgabenText() {
        const a = heuteAufgaben();
        if (!a.length) return '';
        const k = a.map(x => x.replace(/\s*\b(noch\s+)?heute\b\s*/i, ' ').replace(/\s+/g, ' ').trim().replace(/^noch\s+/i, '')).filter(Boolean);
        if (!k.length) return '';
        return k.length === 1 ? 'Du wolltest heute noch: ' + k[0] + '.' : 'Du wolltest heute noch: ' + k.slice(0, 3).join(', ') + '.';
    }
    /* Termine, die heute noch kommen (ab jetzt, dazu Ganztägiges); Geburtstage zählen hier nicht */
    function termineHeuteText() {
        try {
            const nu = jetzt();
            const t = termineInWoche(nu.ymd, nu.ymd).filter(x => x.ymd === nu.ymd && !/geburtstag|birthday|bday/i.test(x.text) && (x.zeit == null || x.zeit >= nu.min));
            if (!t.length) return '';
            const teile = t.slice(0, 4).map(x => x.zeit != null ? 'um ' + uhr(x.zeit) + ' ' + x.text : x.text + ' (ganztägig)');
            return (t.length === 1 ? 'Heute steht noch ein Termin an: ' : 'Heute stehen noch Termine an: ') + teile.join('; ') + (t.length > 4 ? '; und ' + (t.length - 4) + ' weitere' : '') + '.';
        } catch (e) { return ''; }
    }
    async function heimText(immer) {
        const f = await heimFrisch();
        if (!f.ziel) return 'Ich habe keine Heimatadresse gespeichert. Sag zum Beispiel: Merk dir meine Heimatadresse, Verbrüderungsring 13.';
        if (!f.min) return 'Feierabend! Den Heimweg konnte ich gerade nicht berechnen. Ist der Standortzugriff erlaubt?';
        if (f.min <= 3 && !immer) return '';   // schon zu Hause
        const normal = heimNormal();
        merkeHeim(f.min - (f.st || 0));
        const mehr = normal ? f.min - normal : 0;
        let t = 'Feierabend! Der Heimweg dauert rund ' + f.min + ' Minuten.';
        if (mehr >= 10) t += ' Das sind ' + mehr + ' Minuten mehr als sonst.';
        if (f.stau) t += ' ' + f.stau;
        if (f.st) t += ' Darin sind etwa ' + f.st + ' Minuten Stau schon eingerechnet.';
        else if (!f.stau && mehr < 10) t += ' Auf der Strecke ist alles frei.';
        const heute = heuteAufgabenText();
        if (heute) t += ' ' + heute;
        const termine = termineHeuteText();
        if (termine) t += ' ' + termine;
        const tank = await heimTank(false);
        if (tank) t += ' ' + tank;
        return t + ' Gute Heimfahrt.';
    }

    /* ---------- Texte ---------- */
    async function aufbruchText(ymd, mitFrisch) {
        const sh = schichtAm(ymd);
        if (!sh) return { text: '', sh: null };
        const start = beginn(sh), normal = letzteFahrt();
        let min, stau = '', st = 0;
        if (mitFrisch) { const f = await fahrtFrisch(); min = f.min || letzteFahrt(); stau = f.stau || ''; st = f.min ? (f.st || 0) : 0; }
        else min = letzteFahrt();
        const abfahrt = abfahrtFuer(sh, min, normal, ymd);
        const nu = jetzt();
        const diff = abfahrt - nu.min;
        let t;
        if (nu.ymd !== ymd) {
            t = tagWann(ymd) + ' hast du ' + NAME[sh] + ' ab ' + uhr(start) + '. Fahr gegen ' + uhr(abfahrt) + ' los, die Fahrt dauert rund ' + min + ' Minuten.';
        } else if (nu.min >= start) {
            t = 'Deine ' + NAME[sh] + ' hat schon um ' + uhr(start) + ' angefangen.';
        } else if (diff >= 3) {
            t = 'Bald geht es los. Fahr um ' + uhr(abfahrt) + ' ab, das ist in ' + diff + ' Minuten. Die Fahrt zur Arbeit dauert rund ' + min + ' Minuten, deine ' + NAME[sh] + ' beginnt um ' + uhr(start) + '.';
        } else if (diff >= -3) {
            t = 'Es ist Zeit zum Losfahren. Die Fahrt dauert rund ' + min + ' Minuten, deine ' + NAME[sh] + ' beginnt um ' + uhr(start) + '.';
        } else if (nu.min + min < start) {
            t = 'Du solltest jetzt losfahren. Die Fahrt dauert rund ' + min + ' Minuten, deine ' + NAME[sh] + ' beginnt um ' + uhr(start) + '.';
        } else {
            t = 'Es wird knapp. Die Fahrt dauert rund ' + min + ' Minuten, deine ' + NAME[sh] + ' beginnt aber schon um ' + uhr(start) + '. Fahr sofort los.';
        }
        if (stau) t += ' ' + stau;
        if (st) t += ' Darin sind etwa ' + st + ' Minuten Stau schon eingerechnet.';
        try { if (mitFrisch && nu.ymd === ymd && nu.min < start && window.jvMitnehmen) t += ' ' + window.jvMitnehmen.text(); } catch (e) { }   // Mitnehmen-Liste (mitnehmen.js), nur bei der echten Ansage am selben Tag
        return { text: t, sh, min, abfahrt };
    }

    function termineInWoche(montag, ab) {
        const sonntag = ymdPlus(montag, 6), out = [];
        try {
            (typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries) ? calendarEntries : []).forEach(e => {
                if (!e || !e.isoDate) return;
                const iso = String(e.isoDate);
                let ymd, zeit = null;
                if (iso.length === 10) ymd = iso;
                else { const ms = Date.parse(iso); if (isNaN(ms)) return; const p = parts(ms); ymd = p.ymd; zeit = p.min; }
                if (ymd < ab || ymd > sonntag) return;
                const text = String(e.text || '').trim();
                if (!text || /^(früh|spät)schicht$/i.test(text)) return;
                out.push({ ymd, zeit, text });
            });
        } catch (e) { }
        return out.sort((a, b) => (a.ymd + pad4(a.zeit == null ? 0 : a.zeit + 1)).localeCompare(b.ymd + pad4(b.zeit == null ? 0 : b.zeit + 1)));
    }
    function erinnerungenInWoche(montag, ab) {
        const sonntag = ymdPlus(montag, 6), out = [];
        try {
            (typeof reminderEntries !== 'undefined' && Array.isArray(reminderEntries) ? reminderEntries : []).forEach(r => {
                if (!r || r.done || !r.time) return;
                const ms = Date.parse(String(r.time)); if (isNaN(ms)) return;
                const p = parts(ms);
                if (p.ymd < ab || p.ymd > sonntag) return;
                out.push({ ymd: p.ymd, zeit: p.min, text: String(r.text || '').trim() });
            });
        } catch (e) { }
        return out.filter(x => x.text).sort((a, b) => (a.ymd + pad4(a.zeit)).localeCompare(b.ymd + pad4(b.zeit)));
    }
    function liste(arr, max) {
        const teile = arr.slice(0, max).map(x => tagName(x.ymd) + (x.zeit != null ? ' um ' + uhr(x.zeit) : '') + ' ' + x.text);
        let s = teile.join('; ');
        if (arr.length > max) s += '; und ' + (arr.length - max) + ' weitere';
        return s;
    }

    /* Überblick für die Woche, die am Montag "montag" beginnt. "ab": erster Tag, der noch zählt (heute, wenn die Woche läuft). */
    function wochenText(montag, ab, naechste) {
        const T = S(), st = T && T.load();
        const teile = ['Hier ist dein Überblick für ' + (naechste ? 'die kommende Woche' : 'diese Woche') + '.'];
        if (st) {
            const sh = schichtOhneUrlaub(montag);
            const tage = [];
            for (let i = 0; i < 5; i++) { const y = ymdPlus(montag, i); if (y >= ab) tage.push(y); }
            const urlaub = tage.filter(urlaubAm);
            if (tage.length) {
                if (urlaub.length === tage.length) teile.push('Du hast ' + (naechste ? 'die ganze Woche' : 'bis Freitag') + ' Urlaub. Sonst hättest du ' + NAME[sh] + '.');
                else if (urlaub.length) teile.push('Du hast ' + NAME[sh] + ', aber am ' + undListe(urlaub.map(y => TAGE[dow(y)])) + ' Urlaub.');
                else teile.push('Du hast ' + NAME[sh] + ', Beginn ' + uhr(beginn(sh)) + '.');
            }
        }
        const term = termineInWoche(montag, ab);
        teile.push(term.length ? 'Termine: ' + liste(term, 6) + '.' : 'Keine Termine im Kalender.');
        try {
            const kf = term.map(e => { const k = konfliktMit(e); return k ? konfliktText(e, k) : ''; }).filter(Boolean);
            if (kf.length) teile.push('Achtung: ' + kf.slice(0, 3).join('; ') + '.');
        } catch (e) { }
        const erin = erinnerungenInWoche(montag, ab);
        if (erin.length) teile.push('Erinnerungen: ' + liste(erin, 3) + '.');
        try {
            const todo = (typeof todoEntries !== 'undefined' && Array.isArray(todoEntries)) ? todoEntries.filter(e => e && !e.done) : [];
            if (todo.length) teile.push('Auf deiner Aufgabenliste ' + (todo.length === 1 ? 'steht ein Eintrag' : 'stehen ' + todo.length + ' Einträge') + '.');
        } catch (e) { }
        try {
            const sonntag = ymdPlus(montag, 6), heute = jetzt().ymd;
            const rg = (window.jvRechnungen && window.jvRechnungen.offen ? window.jvRechnungen.offen() : []).filter(r => r.ziel && r.ziel <= sonntag);
            if (rg.length) {
                teile.push('Rechnungen: ' + rg.slice(0, 3).map(r => r.absender + (r.betrag ? ' ' + Number(r.betrag).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Euro' : '') + (r.ziel < heute ? ', überfällig' : ', fällig ' + tagName(r.ziel))).join('; ') + '.');
            }
        } catch (e) { }
        return teile.join(' ');
    }
    /* ---------- Terminkonflikte mit der Arbeit ---------- */
    /* Arbeitszeit an einem Tag: Abfahrt bis Schichtende (Minuten seit Mitternacht); null ohne Schicht (Wochenende, Urlaub) */
    function arbeitsFenster(ymd) {
        const sh = schichtAm(ymd);
        return sh ? { sh, von: abfFix(sh), ende: ende(sh) } : null;
    }
    /* Ein Termin ({ ymd, zeit, text }) gegen die Arbeit: { art: 'drin' | 'knapp', sh, ende, luft } oder null */
    function konfliktMit(ev) {
        if (!ev || ev.zeit == null) return null;
        const w = arbeitsFenster(ev.ymd); if (!w) return null;
        if (ev.zeit >= w.von && ev.zeit <= w.ende) return { art: 'drin', sh: w.sh, ende: w.ende };
        if (ev.zeit > w.ende && ev.zeit - w.ende <= 45) return { art: 'knapp', sh: w.sh, ende: w.ende, luft: ev.zeit - w.ende };
        return null;
    }
    function konfliktText(ev, k) {
        const wann = tagName(ev.ymd) + ' um ' + uhr(ev.zeit) + ' ' + ev.text;
        return k.art === 'drin'
            ? wann + ' liegt in deiner ' + NAME[k.sh] + ' (Feierabend ' + uhr(k.ende) + ')'
            : wann + ' beginnt nur ' + k.luft + ' Minuten nach deinem Feierabend um ' + uhr(k.ende);
    }
    /* Termine der nächsten zwei Wochen: Konflikte mit der Arbeit und Termine, die sich gegenseitig überschneiden */
    function terminKonflikte() {
        const h = jetzt().ymd;
        const alle = termineInWoche(h, h).concat(termineInWoche(ymdPlus(h, 7), ymdPlus(h, 7))).filter(e => e.zeit != null);
        const out = [];
        alle.forEach(e => { const k = konfliktMit(e); if (k) out.push(konfliktText(e, k)); });
        for (let i = 0; i < alle.length; i++) for (let j = i + 1; j < alle.length; j++) {
            const a = alle[i], b = alle[j];
            if (a.ymd === b.ymd && Math.abs(a.zeit - b.zeit) < 60) out.push(tagName(a.ymd) + ' um ' + uhr(a.zeit) + ' ' + a.text + ' und um ' + uhr(b.zeit) + ' ' + b.text + ' überschneiden sich');
        }
        return out;
    }
    function wocheJetzt() {   // Sonntag: die kommende Woche, sonst die laufende
        const h = jetzt().ymd, d = dow(h);
        if (d === 6) return { montag: ymdPlus(h, 1), ab: ymdPlus(h, 1), naechste: true };
        return { montag: ymdPlus(h, -d), ab: h, naechste: false };
    }

    /* ---------- Plan an die App melden ---------- */
    /* Merkt, dass Jarvis für diesen Tag einen Wecker gestellt hat (Minute des Tages), damit die Karte am Startbild nichts Falsches behauptet */
    function merkeWecker(ymdTag, min) { lsSet('jv_plan_wzeit_' + ymdTag, String(min)); }
    function weckerStand(ymdTag) { const v = Number(lsGet('jv_plan_wzeit_' + ymdTag)); return Number.isFinite(v) && lsGet('jv_plan_wzeit_' + ymdTag) ? v : null; }
    function gefragt(ymd) { return !!lsGet(K_WECKER + ymd); }
    function bauePlan() {
        const out = [];
        if (aus() || !S() || !S().load()) return out;
        const nu = jetzt(), jetztMs = Date.now();
        for (let i = 0; i < TAGE_VORAUS; i++) {
            const ymd = ymdPlus(nu.ymd, i), d = dow(ymd);
            if (d === 6) {
                const mo = ymdPlus(ymd, 1);
                out.push({ id: 'wochen|' + ymd, at: berlinMs(ymd, WOCHEN_MIN), text: wochenText(mo, mo, true).slice(0, 400) });
            }
            const sh = schichtAm(ymd);
            if (sh) {
                try {   // Schicht-Briefing: in der Android-App weckt Jarvis den Bildschirm und erzählt es zur Briefing-Zeit (Früh ab 3:30, Spät ab 12:00)
                    const bt = S().load().times;
                    if (bt && Number.isFinite(bt[sh])) out.push({ id: 'brief|' + ymd, at: berlinMs(ymd, bt[sh]), text: 'Dein Briefing ist bereit. Tippe, dann erzähle ich es dir.' });
                } catch (e) { }
                const start = beginn(sh), fahrt = letzteFahrt();
                const abfahrt = abfFix(sh) - tagVor(ymd), ansage = abfahrt - VOR_ABFAHRT;
                const staumin = Math.max(ansage - STAU_VOR, sh === 'frueh' ? weckzeit() + 10 : 0);
                if (ansage >= 0 && staumin <= ansage - 5) out.push({ id: 'stau|' + ymd, at: berlinMs(ymd, staumin), text: 'Ich prüfe kurz die Verkehrslage auf deinem Arbeitsweg. Ist alles frei, sage ich nichts.' });
                out.push({ id: 'heim|' + ymd, at: berlinMs(ymd, ende(sh) + HEIM_NACH), text: 'Feierabend. ' + (heuteAufgabenText() ? heuteAufgabenText() + ' ' : '') + 'Tippe, dann sage ich dir, wie der Heimweg aussieht.' });
                if (ansage >= 0) out.push({ id: 'aufbruch|' + ymd, at: berlinMs(ymd, ansage), text: 'Abfahrt gegen ' + uhrHM(abfahrt) + ' Uhr (' + NAME[sh] + ' ab ' + uhrHM(start) + ', Fahrt rund ' + fahrt + ' Minuten). Tippe, dann sage ich dir die aktuelle Lage.' });
            }
            const morgen = ymdPlus(ymd, 1);
            if ((d <= 3 || d === 6) && schichtAm(morgen) === 'frueh' && !gefragt(ymd)) {
                out.push({ id: 'wecker|' + ymd, at: berlinMs(ymd, WECKER_MIN), text: 'Morgen ist Frühschicht. Soll ich den Wecker auf ' + uhrHM(weckzeit() - tagVor(morgen)) + ' Uhr stellen? Tippe, dann frage ich dich.' });
            }
        }
        try { if (window.jvZuvor && window.jvZuvor.planEintraege) window.jvZuvor.planEintraege().forEach(e => out.push(e)); } catch (e) { }   // Geburtstags-Vorfragen
        try { if (window.jvDirigent && window.jvDirigent.planEintraege) window.jvDirigent.planEintraege().forEach(e => out.push(e)); } catch (e) { }   // Tagesmeldungen (dirigent.js)
        return out.filter(e => e.at > jetztMs + 20000).sort((a, b) => a.at - b.at);
    }
    /* Für den Server (pushsync.js): Wochenüberblick als Push-Nachricht mit vollem Text, auch wenn die App offen ist */
    function pushPlan() {
        const out = [];
        try {
            if (aus()) return out;
            const nu = jetzt(), jetztMs = Date.now();
            for (let i = 0; i < 8; i++) {
                const ymd = ymdPlus(nu.ymd, i);
                if (dow(ymd) !== 6) continue;
                const mo = ymdPlus(ymd, 1), at = berlinMs(ymd, WOCHEN_MIN);
                if (at < jetztMs - 20 * 60000) continue;
                out.push({ id: 'pw' + ymd, k: 'p', t: 'Wochenüberblick', x: wochenText(mo, mo, true).slice(0, 700), at });
            }
        } catch (e) { }
        return out;
    }
    let letztesSignal = '';
    function planSenden(erzwingen) {
        try {
            const n = N();
            if (!n || typeof n.planAnsagen !== 'function') return false;
            const plan = bauePlan();
            const json = JSON.stringify(plan);
            if (!erzwingen && json === letztesSignal) return true;
            letztesSignal = json;
            return !!n.planAnsagen(json);
        } catch (e) { console.error('Plan senden', e && e.message); return false; }
    }

    /* ---------- Ansagen abholen und sprechen ---------- */
    function gesagt() { try { return JSON.parse(lsGet(K_GESAGT) || '[]'); } catch (e) { return []; } }
    function merkeGesagt(id) { const a = gesagt().filter(x => x !== id); a.push(id); lsSet(K_GESAGT, JSON.stringify(a.slice(-20))); }
    function bereit() {
        try {
            if (typeof speak !== 'function') return false;
            if (typeof isProcessing !== 'undefined' && isProcessing) return false;
            if (typeof isSpeaking === 'function' && isSpeaking()) return false;
            if (document.getElementById('jvBoot')) return false;   // Startanimation läuft noch: erst danach sprechen
            return true;
        } catch (e) { return true; }
    }
    function warteBereit(maxMs) {
        return new Promise(res => {
            const t0 = Date.now();
            (function schau() { if (bereit() || Date.now() - t0 > maxMs) res(bereit()); else setTimeout(schau, 700); })();
        });
    }

    let offenesWecker = null;   // { ymd, min, at }
    async function ansage(id, erzwingen, angetippt) {   // angetippt: die Meldung wurde angetippt, dann nicht wegen "schon gesagt" schweigen
        id = String(id || ''); if (!id) return false;
        if (!erzwingen && !angetippt && gesagt().includes(id)) return false;
        const art = id.split('|')[0], ymd = id.split('|')[1] || jetzt().ymd, nu = jetzt();
        if (!(await warteBereit(30000))) return false;
        if (!erzwingen) {   // abgelaufene Ansage (zum Beispiel alte Meldung angetippt): nichts sagen
            if (art === 'wochen' && nu.ymd !== ymd) return false;
            if (art === 'aufbruch' && (nu.ymd !== ymd || nu.min >= beginn(schichtAm(ymd) || 'frueh'))) return false;
            if (art === 'wecker' && (nu.ymd !== ymd || nu.min > 23 * 60)) return false;
            if (art === 'heim') { const sh0 = schichtAm(ymd); if (nu.ymd !== ymd || !sh0 || nu.min < ende(sh0) || nu.min > ende(sh0) + 120) return false; }
            if (art === 'stau' && (nu.ymd !== ymd || !schichtAm(ymd) || nu.min >= beginn(schichtAm(ymd)) - 30)) return false;
        }
        if (art === 'brief') {   // Schicht-Briefing, einmal pro Tag (nicht doppelt, wenn schicht.js es schon gesagt hat)
            let schon = ''; try { schon = String(getPersistentData('jv_schicht_last', '') || ''); } catch (e) { }
            if (!erzwingen && (schon === ymd || nu.ymd !== ymd || nu.min > 15 * 60)) return false;
            merkeGesagt(id);
            try { setPersistentData('jv_schicht_last', ymd); } catch (e) { }
            if (typeof triggerDailyBriefing === 'function') { try { triggerDailyBriefing(); return true; } catch (e) { return false; } }
            return false;
        }
        merkeGesagt(id);
        if (art === 'auftrag') {   // Beobachtungsauftrag erfüllt (auftraege.js, AuftragReceiver der App): id = auftrag|<Auftrags-ID>|<Text>
            const text = id.split('|').slice(2).join('|');
            if (!text) return false;
            sagenMeldung('👁️ Auftrag', text);
            return true;
        }
        if (art === 'ort') { try { return !!(window.jvOrte && window.jvOrte.ansage(id)); } catch (e) { return false; } }   // Orts-Erinnerung (orte.js)
        if (art === 'wochen') {
            const mo = ymdPlus(ymd, 1);
            sagenMeldung('📅 Wochenüberblick', wochenText(mo, mo, true));
            return true;
        }
        if (art === 'aufbruch') {
            const r = await aufbruchText(ymd, true);
            if (!r.text) return false;
            sagenMeldung('🚗 Aufbruchszeit', r.text);
            return true;
        }
        if (art === 'heim') {
            const t = await heimText(!!erzwingen || !!angetippt);
            if (!t) { try { const a = gesagt().filter(x => x !== id); lsSet(K_GESAGT, JSON.stringify(a)); } catch (e) { } return false; }
            sagenMeldung('🏠 Heimweg', t);
            return true;
        }
        if (art === 'wecker') {
            let vorsatz = '';
            try { if (window.jvZuvor && window.jvZuvor.vorWecker) vorsatz = await window.jvZuvor.vorWecker(ymd) || ''; } catch (e) { }   // zuvorkommend.js: z. B. Frost -> Abfahrt vorgezogen
            weckerFrage(ymd, vorsatz); return true;
        }
        if (art === 'geb') { try { return !!(window.jvZuvor && window.jvZuvor.gebAnsage(id)); } catch (e) { return false; } }   // Geburtstags-Vorfrage (zuvorkommend.js)
        if (art === 'gebv' || art === 'gebt') { try { return !!(window.jvZuvor && window.jvZuvor.gebGruss(id)); } catch (e) { return false; } }   // Glückwunsch-Entwurf am Vortag / am Geburtstag (zuvorkommend.js)
        if (art === 'dirig') { try { return !!(window.jvDirigent && await window.jvDirigent.ansage(id, !!erzwingen)); } catch (e) { return false; } }   // Tagesmeldung (dirigent.js)
        if (art === 'stau') { return stauCheck(ymd, !!erzwingen); }
        return false;
    }
    /* Früher Stau-Check: spricht nur, wenn die Fahrt heute deutlich länger dauert als sonst oder Meldungen auf der Strecke liegen */
    async function stauCheck(ymd, immer) {
        const sh = schichtAm(ymd); if (!sh) return false;
        const normal = letzteFahrt();
        const f = await fahrtFrisch();
        const min = f.min || normal;
        const stau = ISTSTAU.test(f.stau || '') ? f.stau.trim() : '';
        const mehr = min - normal;
        if (!immer && mehr < 10 && !stau) return false;   // alles normal: Jarvis bleibt still
        const abfahrt = abfahrtFuer(sh, min, normal, ymd), nu = jetzt();
        let t = mehr >= 10 ? 'Auf deinem Arbeitsweg ist heute mehr los. Die Fahrt dauert rund ' + min + ' Minuten statt sonst ' + normal + '.' : 'Die Fahrt dauert rund ' + min + ' Minuten.';
        if (stau) t += ' ' + stau;
        if (f.min && f.st) t += ' Darin sind etwa ' + f.st + ' Minuten Stau schon eingerechnet.';
        t += abfahrt <= nu.min + 5 ? ' Fahr am besten gleich los.' : ' Fahr lieber um ' + uhr(abfahrt) + ' los.';
        sagenMeldung('🚦 Stau auf dem Arbeitsweg', t);
        return true;
    }
    function pruefe() {
        try {
            const n = N();
            if (!n || typeof n.holeAnsage !== 'function') return;
            const id = String(n.holeAnsage() || '');
            if (id) ansage(id, false, true);
        } catch (e) { }
    }

    /* ---------- Wecker ---------- */
    function weckerFrage(ymd, vorsatz) {
        const min = weckzeit() - tagVor(ymdPlus(ymd, 1));
        offenesWecker = { ymd, min, at: Date.now() };
        try {
            if (typeof showActionCards === 'function') showActionCards([
                { icon: '⏰', title: 'Wecker auf ' + uhrHM(min) + ' Uhr stellen', subtitle: 'Frühschicht morgen', onclick: 'jvPlan.weckerJa()' },
                { icon: '🙅', title: 'Nein danke', subtitle: '', onclick: 'jvPlan.weckerNein()' }
            ]);
        } catch (e) { }
        sagen((vorsatz ? vorsatz + ' ' : '') + 'Morgen ist Frühschicht. Soll ich den Wecker auf ' + uhr(min) + ' stellen?', true);
    }
    function karten() { try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) { } }
    let weckerIntentUrl = '';
    function weckerIntent() { karten(); if (weckerIntentUrl) { try { location.href = weckerIntentUrl; } catch (e) { } } }
    function weckerSetzen(h, m, label) {
        const n = N();
        if (!n) {
            // Ohne Jarvis-App (normale Web-Seite im Browser): Android-Uhr-App per Link öffnen; der Wecker muss dort einmal bestätigt werden.
            if (!/Android/i.test(navigator.userAgent || '')) return 'kein-app';
            const url = 'intent:#Intent;action=android.intent.action.SET_ALARM;i.android.intent.extra.alarm.HOUR=' + h + ';i.android.intent.extra.alarm.MINUTES=' + m +
                ';S.android.intent.extra.alarm.MESSAGE=' + encodeURIComponent(label || 'Jarvis') + ';end';
            try { if (navigator.userActivation && navigator.userActivation.isActive) { location.href = url; return 'intent-offen'; } } catch (e) { }
            weckerIntentUrl = url;
            try {
                if (typeof showActionCards === 'function') showActionCards([
                    { icon: '⏰', title: 'Wecker ' + uhrHM(h * 60 + m) + ' in der Uhr-App öffnen', subtitle: 'Dort kurz auf Speichern tippen', onclick: 'jvPlan.weckerIntent()' }
                ]);
            } catch (e) { }
            return 'intent-karte';
        }
        if (typeof n.weckerStellen !== 'function') return 'alt';
        let ok = false;
        try { ok = !!n.weckerStellen(h, m, label || 'Jarvis'); } catch (e) { ok = false; }
        return ok ? 'ok' : 'fehler';
    }
    function weckerAntwort(r, h, m) {
        const nu = jetzt(), ziel = h * 60 + m;
        const wann = ziel > nu.min ? 'heute' : 'morgen';
        if (r === 'ok') return 'Der Wecker ist gestellt, ' + wann + ' um ' + uhr(ziel) + '. Du findest ihn in der Uhr-App.';
        if (r === 'intent-karte') return 'Tippe auf die Karte, dann öffnet sich die Uhr-App mit dem Wecker um ' + uhr(ziel) + '. Dort musst du ihn nur noch speichern.';
        if (r === 'intent-offen') return 'Ich öffne die Uhr-App mit dem Wecker um ' + uhr(ziel) + '. Bitte dort noch auf Speichern tippen.';
        if (r === 'kein-app') return 'Einen Wecker kann ich nur in der Jarvis-App auf dem Handy stellen.';
        if (r === 'alt') return 'Dafür brauchst du die neueste Jarvis-App. Bitte installiere die aktuelle Version.';
        return 'Den Wecker konnte ich nicht stellen. Prüfe, ob die Uhr-App des Handys erreichbar ist.';
    }
    function weckerJa() {
        const w = offenesWecker; offenesWecker = null; karten();
        if (!w) { sagen('Gerade ist keine Wecker-Frage offen.', false); return; }
        const h = Math.floor(w.min / 60), m = w.min % 60;
        const r = weckerSetzen(h, m, 'Jarvis: Frühschicht');
        if (r === 'ok' || r === 'intent-offen' || r === 'intent-karte') { lsSet(K_WECKER + w.ymd, 'ja'); merkeWecker(ymdPlus(w.ymd, 1), w.min); }
        sagen(weckerAntwort(r, h, m) + (r === 'ok' ? ' Gute Nacht.' : ''), false);
    }
    function weckerNein() {
        const w = offenesWecker; offenesWecker = null; karten();
        if (w) lsSet(K_WECKER + w.ymd, 'nein');
        sagen('Gut, dann stelle ich keinen Wecker.', false);
    }

    const ZAHLEN = { ein: 1, eins: 1, eine: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwoelf: 12, fuenfzehn: 15, zwanzig: 20, dreissig: 30, vierzig: 40, fuenfundvierzig: 45 };
    function zahlenWorte(t) {
        return t.replace(/\b(fuenfundvierzig|fuenfzehn|zwanzig|dreissig|vierzig|zwoelf|fuenf|sechs|sieben|zehn|eins|eine|einer|ein|zwei|drei|vier|acht|neun|elf)\b/g, (m) => String(ZAHLEN[m]));
    }
    /* Uhrzeit aus einem Satz: { h, m } oder { rel: Minuten } oder null */
    function parseZeit(t0) {
        const t = zahlenWorte(t0);
        let m;
        if ((m = t.match(/\bin (\d{1,3}) (minuten?|min|stunden?|std)\b/))) {
            const n = +m[1]; return { rel: /^(st)/.test(m[2]) ? n * 60 : n };
        }
        if ((m = t.match(/\bviertel (nach|vor) (\d{1,2})\b/))) {
            let h = +m[2], mi = m[1] === 'nach' ? 15 : 45; if (m[1] === 'vor') h = (h + 23) % 24;
            return { h, m: mi };
        }
        if ((m = t.match(/\bhalb (\d{1,2})\b/))) return { h: (+m[1] + 23) % 24, m: 30 };
        if ((m = t.match(/\b(\d{1,2})[:.](\d{2})\b/))) return { h: +m[1], m: +m[2] };
        if ((m = t.match(/\b(\d{1,2}) uhr (\d{1,2})\b/))) return { h: +m[1], m: +m[2] };
        if ((m = t.match(/\b(\d{1,2}) uhr\b/))) return { h: +m[1], m: 0 };
        if ((m = t.match(/\bum (\d{1,2})\b/))) return { h: +m[1], m: 0 };
        return null;
    }
    function weckerAusSprache(n) {
        let vor = 0;
        try { vor = Number(n.naechsterWecker()); } catch (e) { }
        if (!(vor > 0)) { sagen('Es ist kein Wecker gestellt.', false); return; }
        const um = uhr(parts(Math.round(vor / 60000) * 60000).min);
        let ok = false;
        try { ok = !!n.weckerAus(); } catch (e) { }
        if (!ok) { sagen('Das kann ich mit dieser Uhr-App nicht. Schalte den Wecker bitte selbst aus.', false); return; }
        setTimeout(function () {
            let nach = 0;
            try { nach = Number(n.naechsterWecker()); } catch (e) { }
            if (!(nach > 0) || Math.abs(nach - vor) > 60000) sagen('Erledigt, der Wecker um ' + um + ' ist aus.', false);
            else sagen('Der Wecker um ' + um + ' ist noch an. Die Uhr hat es nicht angenommen oder er kommt von einer anderen App. Schalte ihn bitte selbst aus.', false);
        }, 2500);
    }
    function weckerBefehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 16) return next(text);
        if (offenesWecker && Date.now() - offenesWecker.at < 40 * 60000) {   // Antwort auf die Abend-Frage
            if (/^(nein|nee|ne|nicht|lass|laesst|brauche ich nicht|kein wecker|nein danke)\b/.test(t)) { weckerNein(); return true; }
            if (/^(ja|jawohl|jep|jo|joa|klar|gerne|gern|okay|ok|bitte|mach|stell|mach das|genau|gut)\b/.test(t)) { weckerJa(); return true; }
        }
        if (!/\bwecker\b|\bweck mich\b|\bwecke mich\b|\bweck\b/.test(t)) return next(text);
        if (/\b(loesch\w*|aus|ausschalten|ausmachen|abschalten|abbrechen|entfern\w*|deaktivier\w*)\b/.test(t)) {
            // "Wecker aus" / "Lösche den Wecker": in der Jarvis-App die Uhr bitten, den nächsten Wecker zu löschen, und danach nachsehen, ob er wirklich weg ist
            const n = N();
            if (n && typeof n.weckerAus === 'function' && typeof n.naechsterWecker === 'function' && !/\b(alarm|alle)\b/.test(t) && !parseZeit(t)) { weckerAusSprache(n); return true; }
            return next(text);
        }
        let z = parseZeit(t);
        if (!z && /\bfrueh\s?schicht\b|\bfruehschicht\b/.test(t)) { const w = weckzeit(); z = { h: Math.floor(w / 60), m: w % 60 }; }
        if (!z) return next(text);
        let h, m;
        if (z.rel != null) {
            const ziel = parts(Date.now() + z.rel * 60000); h = Math.floor(ziel.min / 60); m = ziel.min % 60;
        } else {
            h = z.h; m = z.m;
            if (/\b(abends|nachmittags|mittags)\b/.test(t) && h < 12) h += 12;
        }
        if (h < 0 || h > 23 || m < 0 || m > 59) return next(text);
        const r = weckerSetzen(h, m, 'Jarvis');
        if (r === 'ok') { const nu = jetzt(); merkeWecker(h * 60 + m > nu.min ? nu.ymd : ymdPlus(nu.ymd, 1), h * 60 + m); }
        sagen(weckerAntwort(r, h, m), false);
        return true;
    }

    /* ---------- Sprachbefehle ---------- */
    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 14) return next(text);
        // Schichtbeginn ändern
        let m = t.match(/\b(fruehschicht|spaetschicht)\b.*\b(beginnt|faengt an|startet|anfang)\b/) || t.match(/\b(beginn|anfang)\b.*\b(fruehschicht|spaetschicht)\b/);
        if (m && /\b(meine|mein|die|der)\b/.test(t)) {
            const sh = /fruehschicht/.test(t) ? 'frueh' : 'spaet';
            const z = parseZeit(t.replace(/\b(fruehschicht|spaetschicht)\b/g, ''));
            if (z && z.h != null) {
                setBeginn(sh, z.h * 60 + z.m);
                planSenden(true);
                sagen('Gut, deine ' + NAME[sh] + ' beginnt um ' + uhr(z.h * 60 + z.m) + '. Die Aufbruchszeit rechne ich damit.', false);
                return true;
            }
        }
        // Abfahrtszeit ändern ("Meine Abfahrt in der Frühschicht ist um 4 Uhr 30" / "In der Spätschicht fahre ich um 13 Uhr 20 los")
        if (/\b(fruehschicht|spaetschicht)\b/.test(t) && /\b(abfahrt|fahre|fahr|losfahre|los)\b/.test(t) && !/\b(beginnt|faengt an|startet)\b/.test(t)) {
            const sh = /fruehschicht/.test(t) ? 'frueh' : 'spaet';
            const z = parseZeit(t.replace(/\b(fruehschicht|spaetschicht)\b/g, ''));
            if (z && z.h != null) {
                setAbf(sh, z.h * 60 + z.m);
                planSenden(true);
                sagen('Gut, in der ' + NAME[sh] + ' fährst du um ' + uhr(z.h * 60 + z.m) + ' los.', false);
                return true;
            }
        }
        // Schichtende ändern ("Meine Frühschicht endet um 14 Uhr 40")
        m = t.match(/\b(fruehschicht|spaetschicht)\b.*\b(endet|ende|aus|schluss|feierabend)\b/) || t.match(/\b(ende|schluss|feierabend)\b.*\b(fruehschicht|spaetschicht)\b/);
        if (m && /\b(meine|mein|die|der)\b/.test(t) && !/\b(beginnt|faengt an|startet)\b/.test(t)) {
            const sh = /fruehschicht/.test(t) ? 'frueh' : 'spaet';
            const z = parseZeit(t.replace(/\b(fruehschicht|spaetschicht)\b/g, ''));
            if (z && z.h != null) {
                setEnde(sh, z.h * 60 + z.m);
                planSenden(true);
                sagen('Gut, deine ' + NAME[sh] + ' endet um ' + uhr(z.h * 60 + z.m) + '. Kurz danach sage ich dir, wie der Heimweg aussieht.', false);
                return true;
            }
        }
        // Heimweg jederzeit / Test
        if (/\b(heimweg|heimfahrt|feierabend.?(ansage|meldung|briefing))\b/.test(t) && !/\b(endet|ende)\b/.test(t)) {
            (async () => {
                const r = await heimText(true);
                if (r) sagenMeldung('🏠 Heimweg', r); else sagen('Zum Heimweg habe ich gerade nichts.', false);
            })();
            return true;
        }
        // Terminkonflikte prüfen
        if (/\b(terminkonflikte?|termin.?ueberschneidung\w*|ueberschneidung\w*|kollision\w*|kollidier\w*)\b/.test(t) || /\bkonflikte?\b.*\btermin\w*|\btermin\w*.*\bkonflikte?\b/.test(t)) {
            const k = terminKonflikte();
            if (!k.length) sagenMeldung('📅 Terminprüfung', 'In den nächsten zwei Wochen passt alles zusammen: Kein Termin liegt in deiner Arbeitszeit oder überschneidet sich mit einem anderen.');
            else sagenMeldung('📅 Terminprüfung', 'Ich habe ' + (k.length === 1 ? 'einen Konflikt' : k.length + ' Konflikte') + ' gefunden. ' + k.slice(0, 4).join('. ') + '.' + (k.length > 4 ? ' Dazu kommen noch ' + (k.length - 4) + ' weitere.' : ''));
            return true;
        }
        // Planer ein/aus
        if (/^(den |der |nova )?(planer|tagesplaner)\s+(aus|an|ein)(schalten)?$/.test(t) || /^(schalte? )?(den )?planer (aus|an|ein)(schalten)?$/.test(t)) {
            const an = /\b(an|ein)\b/.test(t) && !/\baus\b/.test(t);
            sd(K_AUS, an ? '' : '1'); planSenden(true);
            sagen(an ? 'Der Planer ist an. Wochenüberblick, Aufbruchszeit und Wecker-Frage kommen wieder von selbst.' : 'Der Planer ist aus. Ich melde mich nicht mehr von selbst mit Überblick, Aufbruchszeit und Wecker-Frage.', false);
            return true;
        }
        // Was ist geplant?
        if (/\b(was ist geplant|geplante (meldungen|ansagen)|naechste (meldung|ansage)|was meldest du dir|planer status|planer zeig\w*)\b/.test(t)) {
            const p = bauePlan();
            if (!p.length) sagen(aus() ? 'Der Planer ist aus.' : 'Im Moment ist nichts geplant. Ist die Schicht eingestellt?', false);
            else {
                const art = { wochen: 'Wochenüberblick', aufbruch: 'Aufbruchszeit', wecker: 'Wecker-Frage', stau: 'Stau-Check', heim: 'Heimweg' };
                sagen('Geplant: ' + p.slice(0, 4).map(e => art[e.id.split('|')[0]] + ' ' + tagName(parts(e.at).ymd) + ' um ' + uhr(parts(e.at).min)).join('; ') + '.', false);
            }
            return true;
        }
        // Meldungen nachlesen
        if (/\b(meine meldungen|verpasste meldungen|meldungen nachlesen|letzte meldungen?|letzte ansagen?)\b/.test(t) || /\bwas hast du (mir )?(gerade |eben |vorhin )?(gesagt|gemeldet)\b/.test(t) || /\bwas habe ich (gerade |eben |vorhin )?verpasst\b/.test(t)) {
            verlaufFenster();
            return true;
        }
        // Wochenüberblick jederzeit
        if (/\b(wochenueberblick|wochenvorschau|wochenuebersicht)\b/.test(t) || /\b(ueberblick|uebersicht|vorschau)\b.*\bwoche\b/.test(t) || /\bwoche\b.*\b(ueberblick|uebersicht|vorschau)\b/.test(t)) {
            const w = wocheJetzt();
            if (/\b(naechste|kommende)\b/.test(t) && !w.naechste) {
                const mo = ymdPlus(w.montag, 7);
                sagenMeldung('📅 Wochenüberblick', wochenText(mo, mo, true), false);
            } else {
                sagenMeldung('📅 Wochenüberblick', wochenText(w.montag, w.ab, w.naechste), false);
            }
            return true;
        }
        // Aufbruchszeit jederzeit
        if (/\baufbruchszeit\b/.test(t) || /\bwann\b.*\b(zur arbeit|zum arbeitsplatz|auf die arbeit)\b.*\b(los|fahren|losfahren|aufbrechen|abfahren)\b/.test(t) || /\bwann (muss|soll|sollte) ich\b.*\b(los|losfahren|aufbrechen)\b.*\barbeit\b/.test(t)) {
            (async () => {
                const heute = jetzt().ymd;
                let ymd = heute;
                if (!schichtAm(ymd) || jetzt().min >= beginn(schichtAm(ymd))) {   // heute nichts mehr: nächster Arbeitstag
                    ymd = null;
                    for (let i = 1; i <= 7; i++) { const y = ymdPlus(heute, i); if (schichtAm(y)) { ymd = y; break; } }
                }
                if (!ymd) { sagen('Ich finde keinen Arbeitstag in den nächsten Tagen. Ist deine Schicht eingestellt?', false); return; }
                const r = await aufbruchText(ymd, ymd === heute);
                if (r.text) sagenMeldung('🚗 Aufbruchszeit', r.text); else sagen('Dafür brauche ich deine Schicht. Sag zum Beispiel: Diese Woche Frühschicht.', false);
            })();
            return true;
        }
        // Tests
        if (/\b(teste|test)\b.*\b(wecker.?frage)\b/.test(t)) { weckerFrage(ymdPlus(jetzt().ymd, 0)); return true; }
        if (/\b(teste|test)\b.*\bstau.?check\b/.test(t) || /\bstau.?check\b/.test(t)) {
            const heute = jetzt().ymd; let ymd = null;
            for (let i = 0; i <= 7 && !ymd; i++) { const y = ymdPlus(heute, i); if (schichtAm(y)) ymd = y; }
            if (!ymd) { sagen('Ich finde keinen Arbeitstag in den nächsten Tagen.', false); return true; }
            stauCheck(ymd, true);
            return true;
        }
        return next(text);
    }

    /* ---------- Rechnungsfrist in den Kalender ---------- */
    function fristBefehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 14) return next(text);
        if (!(/\bkalender\b/.test(t) && /\b(frist|rechnung|zahlungsziel|faelligkeit)\b/.test(t) && /\b(trag\w*|schreib\w*|speicher\w*|eintragen|eintrag)\b/.test(t))) return next(text);
        if (typeof window.jvRechnungKalender !== 'function') return next(text);
        window.jvRechnungKalender();
        return true;
    }

    if (window.jvCommands && typeof window.jvCommands.use === 'function') {
        window.jvCommands.use('plan_wecker', weckerBefehl, 3);
        window.jvCommands.use('plan_ansagen', befehl, 4);
        window.jvCommands.use('plan_frist', fristBefehl, 4);
    }

    /* ---------- Start ---------- */
    window.jvPlan = { weckerStand, beginn, heimFrisch, tagVor, setTagVor, berlinMs, jetzt, ymdPlus, uhr, uhrHM, sagenMeldung, heimAdresse, weckzeit, schichtAm, arbeitsFenster, konfliktMit, terminKonflikte, heimText, heimTank, ende, abfahrtMin: abfFix, pushPlan, verlaufFenster, stauCheck, pruefe, ansage, bauePlan, planSenden, wochenText, aufbruchText, weckerJa, weckerNein, weckerIntent, weckerFrage, parseZeit };
    setTimeout(() => { planSenden(true); pruefe(); }, 5000);
    setTimeout(pruefe, 12000);   // Jarvis war beim Start noch nicht fertig: Ansage später noch einmal abholen
    setInterval(() => planSenden(false), 10 * 60000);
    try {
        document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => { planSenden(false); pruefe(); }, 1500); });
    } catch (e) { }
})();
