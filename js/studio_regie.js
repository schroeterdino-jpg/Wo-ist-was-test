/* ============================================================
   JARVIS STUDIO - LIVE-REGIE: macht aus ECHTEN Ereignissen einer Mission (Missions-Kern und Werkzeuge) drei Dinge:
     1. einen Eintrag in der Live-Zeitleiste (immer),
     2. einen Impuls an der vorhandenen Jarvis-Kugel (window.jvSphereArbeit / window.jvSphereImpuls, gezeichnet in sphere.js),
     3. wenn wichtig genug, eine Sprachansage über die vorhandene Sprachausgabe window.speak (Fish-Audio-Stimme, wenn eingestellt).
   Es gibt keine erfundenen Tätigkeiten: Ein Ereignis entsteht nur aus einem neuen Eintrag im Mission-Protokoll (jvMission.an) oder aus einer Meldung eines
   Werkzeugs im Moment seiner Arbeit (jvStudioRegie.werkzeug). Prozentwerte gibt es nicht. Zeitprognosen nur aus gemessenen Schrittdauern (prognose()).

   Ansagen: eine einzige Warteschlange mit Vorrang (3 Fehler/Freigabe, 2 Abschluss/Wichtiges, 1 Schritte/Tätigkeiten, 0 nur Zeitleiste). Gesprochen wird nur,
   wenn Jarvis nicht spricht, nicht zuhört, nicht in Ruhephase ist (ruhe.js, Wächter-Ruhezeit) und die App sichtbar ist; sonst wartet die Ansage oder verfällt.
   Mehrere Schritt-Meldungen werden zusammengefasst. Je Mission gibt es ein Zeichenbudget. Unterbrechen (interruptSpeaking) verwirft alles Nicht-Kritische.
   Stufen: "wichtige" (Standard), "alle", "aus"; dazu "stumm" und "Energiesparen" (weniger Ansagen, keine Zusatzanimation). Schlüssel: jv_regie_stufe, jv_regie_stumm, jv_regie_spar.
   Messung: je Ansage Latenz (speak bis Stimme hörbar), Dauer, Zeichen -> jvStudioRegie.messung() (echte Werte für die Fish-Audio-Bewertung; Kosten in Zeichen, nicht in Euro).
   ============================================================ */
(function () {
    'use strict';
    if (window.jvStudioRegie) return;

    var K_STUFE = 'jv_regie_stufe', K_STUMM = 'jv_regie_stumm', K_SPAR = 'jv_regie_spar', K_MESS = 'jv_regie_messung';
    var BUDGET_ZEICHEN = 700, MAX_ZEITLEISTE = 60, LANG_AB_MS = 45000, LANG_ABSTAND_MS = 120000, MAX_LANG_HINWEISE = 3;
    var VERFALL = { 3: 600000, 2: 45000, 1: 20000, 0: 0 };
    var zeitleiste = {};     // missionId -> [{ zeit, art, text, prio }]
    var gesehen = {};        // missionId -> Schlüssel des zuletzt verarbeiteten Protokolleintrags
    var queue = [], nextId = 1, imFlug = null, pauseBis = 0, budget = {}, langInfo = {}, abschluss = {}, ackText = {};
    var tTimer = 0, angemeldet = false, letzteAnsage = { text: '', zeit: 0 };
    var phrasenNr = 0;
    var arbeitet = {};       // missionId -> true, solange ein Werkzeug WIRKLICH läuft (von jvStudioRegie.werkzeug start..ende)

    function jetzt() { return Date.now(); }
    function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function M() { return window.jvMission; }
    function istStudio(mid) { try { var a = window.jvStudioProjekte && window.jvStudioProjekte.arbeit.hole(mid); return !!(a && a.studio); } catch (e) { return false; } }
    function stufe() { var s = ls(K_STUFE); return s === 'alle' || s === 'aus' || s === 'wichtige' ? s : 'wichtige'; }
    function stumm() { return ls(K_STUMM) === '1'; }
    function spar() { return ls(K_SPAR) === '1'; }
    function setzeStufe(s) { if (['alle', 'wichtige', 'aus'].indexOf(s) < 0) return false; lsSet(K_STUFE, s); if (s === 'aus') queue = queue.filter(function (q) { return false; }); return true; }
    function setzeStumm(an) { lsSet(K_STUMM, an ? '1' : '0'); if (an) queue = []; return !!an; }
    function setzeSpar(an) { lsSet(K_SPAR, an ? '1' : '0'); if (!an) return false; queue = queue.filter(function (q) { return q.prio >= 2; }); return true; }
    function anrede() {
        try { var n = typeof getPersistentData === 'function' ? getPersistentData('user_custom_name') : ''; if (typeof n === 'string' && n.trim()) return n.trim().slice(0, 24); } catch (e) { }
        return 'Chef';   // Standard, solange keine andere Anrede eingestellt ist
    }
    function sichtbar() { try { return typeof document === 'undefined' || document.hidden !== true; } catch (e) { return true; } }
    function bewegungAus() { try { return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { return false; } }

    /* ---------- Satzbausteine (feste Vorlagen, kein KI-Aufruf: sofort, kostenlos, nichts Erfundenes) ---------- */
    var BESTAETIGUNG = ['Wird erledigt, {A}.', 'Mache ich, {A}.', 'Bin dran, {A}.', 'Verstanden, {A}.', 'Sofort, {A}.'];
    function bestaetigung(taetigkeit) {
        var s = BESTAETIGUNG[phrasenNr++ % BESTAETIGUNG.length].replace('{A}', anrede());
        return taetigkeit ? s + ' ' + taetigkeit : s;
    }
    function dauerText(ms) {
        var s = Math.max(0, Math.round(ms / 1000));
        if (s < 60) return s + ' Sekunden';
        var m = Math.floor(s / 60), r = s % 60;
        return m + (m === 1 ? ' Minute' : ' Minuten') + (r ? ' und ' + r + ' Sekunden' : '');
    }

    /* ---------- Zeitleiste ---------- */
    function zl(mid) { return zeitleiste[mid] || (zeitleiste[mid] = []); }
    function eintrag(mid, art, text, prio) {
        var e = { zeit: jetzt(), art: art, text: String(text || '').slice(0, 220), prio: prio };
        var l = zl(mid); l.push(e); if (l.length > MAX_ZEITLEISTE) l.splice(0, l.length - MAX_ZEITLEISTE);
        return e;
    }
    function zeitleisteAnsicht(mid) {
        var m = M() && M().hole(mid), eigene = zl(mid).slice();
        var aus = eigene.map(function (e) { return { zeit: e.zeit, art: e.art, text: e.text }; });
        if (m && Array.isArray(m.log)) {   // Protokoll des Missions-Kerns (übersteht den Neustart), ohne Doppelungen der eigenen Einträge
            m.log.forEach(function (l) {
                var art = beatArt(l); if (!art) return;
                if (!aus.some(function (e) { return Math.abs(e.zeit - l.zeit) < 1500 && e.text === textZuLog(l, m, art); })) aus.push({ zeit: l.zeit, art: art, text: textZuLog(l, m, art) });
            });
        }
        return aus.sort(function (a, b) { return a.zeit - b.zeit; }).slice(-MAX_ZEITLEISTE);
    }

    /* ---------- Ereignisse aus dem Protokoll des Missions-Kerns ---------- */
    function beatArt(l) {
        var ev = String(l.ereignis || ''), tx = String(l.text || '');
        var w = /^(\w+) → (\w+)$/.exec(ev);
        if (w) return ({ laeuft: w[1] === 'pausiert' || w[1] === 'wartet_freigabe' ? 'weiter' : 'start', wartet_freigabe: 'freigabe', pausiert: 'pausiert', abgeschlossen: 'abschluss', fehlgeschlagen: 'mission_fehler', abgebrochen: 'abgebrochen' })[w[2]] || null;
        if (ev === 'schritt') { if (/ gestartet \(Versuch/.test(tx)) return 'schritt_start'; if (/ erledigt \(Beleg/.test(tx)) return 'schritt_ende'; if (/ fehlgeschlagen: /.test(tx)) return 'schritt_fehler'; if (/ übersprungen: /.test(tx)) return 'schritt_ende'; }
        if (ev === 'unterbrochen') return 'unterbrochen';
        if (ev === 'kosten') return 'kosten';
        return null;
    }
    function textZuLog(l, m, art) {
        var tx = String(l.text || '');
        if (art === 'schritt_start') return tx.replace(/ gestartet \(Versuch \d+\)$/, '') + ' läuft';
        if (art === 'schritt_ende') return tx.replace(/ erledigt \(Beleg: (\w+)\)$/, ' erledigt (Beleg: $1)');
        if (art === 'start') return 'Mission gestartet';
        if (art === 'weiter') return 'Mission läuft weiter';
        if (art === 'freigabe') return 'Wartet auf deine Freigabe' + (tx ? ': ' + tx.replace(/^Freigabe nötig: /, '') : '');
        if (art === 'pausiert') return 'Pausiert';
        if (art === 'abschluss') return 'Mission abgeschlossen';
        if (art === 'mission_fehler') return 'Mission fehlgeschlagen' + (tx ? ': ' + tx : '');
        if (art === 'abgebrochen') return 'Abgebrochen';
        return tx || art;
    }
    var PRIO = { schritt_fehler: 3, mission_fehler: 3, freigabe: 3, abschluss: 3, pausiert: 1, abgebrochen: 1, unterbrochen: 1, schritt_ende: 1, schritt_start: 0, start: 0, weiter: 0, kosten: 0, info: 0, quelle: 0, lang: 2, werkzeug_start: 1 };
    var IMPULS = { schritt_ende: 'ok', abschluss: 'ok', schritt_fehler: 'fehler', mission_fehler: 'fehler', freigabe: 'frage', quelle: 'quelle', info: 'quelle', start: 'start', schritt_start: 'start', weiter: 'start' };

    function schluessel(l) { return l.zeit + '|' + l.ereignis + '|' + l.text; }
    function verarbeiteMission(m) {
        if (!istStudio(m.id)) return;
        var log = m.log || [], letzter = gesehen[m.id];
        if (letzter === undefined) {   // erste Begegnung (z. B. nach einem Neustart): nichts nachspielen
            gesehen[m.id] = log.length ? schluessel(log[log.length - 1]) : '';
            if (m.status === 'laeuft') verfolge(true);
            return;
        }
        var start = 0;
        if (letzter) { for (var i = log.length - 1; i >= 0; i--) if (schluessel(log[i]) === letzter) { start = i + 1; break; } if (start === 0 && log.length && schluessel(log[0]) !== letzter) start = Math.max(0, log.length - 3); }
        for (var j = start; j < log.length; j++) beat(m, log[j]);
        if (log.length) gesehen[m.id] = schluessel(log[log.length - 1]);
        if (m.status === 'laeuft' || m.status === 'wartet_freigabe') verfolge(true);
    }
    function beat(m, l) {
        var art = beatArt(l); if (!art) return;
        var text = textZuLog(l, m, art), prio = PRIO[art] || 0;
        eintrag(m.id, art, text, prio);
        if (IMPULS[art]) impuls(IMPULS[art]);
        var t = null;
        if (art === 'schritt_ende') { var titel = String(l.text || '').replace(/ (erledigt|übersprungen).*$/, ''); t = { text: titel + ' ist erledigt.', merge: 'schritte', titel: titel }; }
        else if (art === 'schritt_fehler') { var mm = /^(.*?) fehlgeschlagen: (.*)$/.exec(String(l.text || '')); t = { text: 'Das hat nicht geklappt, ' + anrede() + '. ' + (mm ? mm[1] + ': ' + mm[2] : String(l.text || '')), prio: 3 }; }
        else if (art === 'mission_fehler') { t = { text: 'Die Mission ist fehlgeschlagen. ' + (l.text ? String(l.text).slice(0, 160) : ''), prio: 3, art: 'mission_fehler' }; }
        else if (art === 'freigabe') { var gr = String(l.text || '').replace(/^Freigabe nötig: /, '').slice(0, 200); t = { text: 'Ich brauche deine Freigabe, ' + anrede() + (gr ? ': ' + gr : '.') + ' Sag Ja oder Nein.', prio: 3 }; }
        else if (art === 'abschluss') { t = { text: (abschluss[m.id] || 'Die Mission „' + m.titel + '“ ist abgeschlossen.') + ' Dauer: ' + dauerText((M().zeiten(m.id) || {}).aktivMs || 0) + '.', prio: 3 }; }
        else if (art === 'abgebrochen') t = { text: 'Die Mission wurde abgebrochen.', prio: 1 };
        else if (art === 'pausiert') t = { text: 'Die Mission ist pausiert.', prio: 1 };
        if (t) ansage(m.id, art, t.text, t.prio !== undefined ? t.prio : prio, t);
        if (art === 'abschluss' || art === 'mission_fehler' || art === 'abgebrochen' || art === 'schritt_ende' || art === 'schritt_fehler' || art === 'pausiert' || art === 'freigabe') { delete arbeitet[m.id]; sphereAus(); }
    }
    function beiAenderung(art, id) {
        if (art === 'geladen' || art === 'entfernt') return;
        var m = M().hole(id); if (!m) return;
        try { verarbeiteMission(m); } catch (e) { }
        if (art === 'geaendert' || art === 'neu') plane();
    }

    /* ---------- Meldungen der Werkzeuge: der Moment, in dem wirklich gearbeitet wird ---------- */
    function werkzeug(mid, art, text, extra) {
        if (!istStudio(mid)) return;
        var a = art === 'start' ? 'werkzeug_start' : art === 'quelle' ? 'quelle' : 'info';
        eintrag(mid, a, text, PRIO[a]);
        arbeitet[mid] = true; sphereAn();
        impuls(a === 'quelle' ? 'quelle' : 'start');
        if (art === 'start') ansage(mid, 'werkzeug_start', text, 1, { text: text, merge: 'start' });
    }

    /* ---------- Kugel ---------- */
    function sphereAn() { window.jvSphereArbeit = true; }
    function sphereAus() { var noch = Object.keys(arbeitet).length > 0; window.jvSphereArbeit = noch; }
    function impuls(art) {
        if (bewegungAus() || spar() || !sichtbar()) return;
        window.jvSphereImpuls = { art: art, start: jetzt(), dauer: art === 'fehler' ? 1400 : 1000 };
    }

    /* ---------- Ansagen: Warteschlange mit Vorrang ---------- */
    function schwelle() {
        var st = stufe(); if (stumm() || st === 'aus') return 99;
        var s = st === 'alle' ? 1 : 2;
        if (spar()) s = Math.max(s, 2);
        if (!sichtbar()) s = 3;
        return s;
    }
    function ansage(mid, art, text, prio, opt) {
        opt = opt || {};
        if (prio < schwelle()) return false;
        var t = jetzt();
        if (letzteAnsage.text === text && t - letzteAnsage.zeit < 4000) return false;
        if (ackText[mid] && prio < 2 && art === 'werkzeug_start' && t - ackText[mid].zeit < 4000 && ackText[mid].text.indexOf(text) >= 0) return false;   // steht schon in der Bestätigung
        var b = budget[mid] || 0;
        if (prio < 3 && b + text.length > BUDGET_ZEICHEN) return false;
        if (opt.merge === 'schritte') {   // mehrere erledigte Schritte -> eine Meldung
            var vor = queue.filter(function (q) { return q.mid === mid && q.merge === 'schritte'; })[0];
            if (vor) { vor.anzahl++; vor.titel = opt.titel; vor.text = vor.anzahl + ' Schritte erledigt, zuletzt: ' + opt.titel + '.'; return true; }
        }
        if (opt.merge === 'start') { queue = queue.filter(function (q) { return !(q.mid === mid && q.merge === 'start'); }); }
        queue.push({ id: nextId++, mid: mid, art: art, text: text, prio: prio, merge: opt.merge || '', anzahl: 1, titel: opt.titel || '', erstellt: t, ablauf: t + (VERFALL[prio] || 15000) });
        plane();
        return true;
    }
    function aufnahme() { try { if (typeof isRecording !== 'undefined' && isRecording) return true; } catch (e) { } try { var b = document.getElementById('recordBtn'); return !!(b && b.classList.contains('recording')); } catch (e) { return false; } }
    function spricht() { try { return typeof isSpeaking === 'function' ? !!isSpeaking() : (typeof window.isSpeaking === 'function' ? !!window.isSpeaking() : false); } catch (e) { return false; } }
    function ruhe() { try { return typeof window.jvRuhe === 'function' && !!window.jvRuhe(); } catch (e) { return false; } }
    function nachtRuhe() { try { return typeof wachterQuiet === 'function' && !!wachterQuiet(); } catch (e) { return false; } }
    function darf(q) {
        var t = jetzt();
        if (spricht() || aufnahme()) return false;
        if (!sichtbar()) return false;                          // Handy gesperrt / App im Hintergrund: Meldung wartet (bis zu 10 Minuten) und wird gesprochen, sobald die App wieder offen ist
        if (t < pauseBis && q.prio < 3) return false;          // nach einem Unterbrechen eine Weile still
        if (q.prio < 3 && (ruhe() || nachtRuhe())) return false;
        return true;
    }
    function pumpe() {
        var t = jetzt();
        queue = queue.filter(function (q) { return q.ablauf > t; });
        if (imFlug) return;
        if (!queue.length) return;
        queue.sort(function (a, b) { return b.prio - a.prio || a.erstellt - b.erstellt; });
        var q = queue[0];
        if (!darf(q)) return;
        queue.shift();
        if (q.prio < schwelle()) return;
        if (typeof window.speak !== 'function') return;
        var wirklich = q.text;
        imFlug = { q: q, t0: t, gestartet: 0, text: wirklich };
        budget[q.mid] = (budget[q.mid] || 0) + wirklich.length;
        letzteAnsage = { text: wirklich, zeit: t };
        try { window.speak(wirklich); } catch (e) { imFlug = null; }
    }
    function beobachteFlug() {
        if (!imFlug) return;
        var t = jetzt(), s = spricht();
        if (s && !imFlug.gestartet) imFlug.gestartet = t;
        if (!s && (imFlug.gestartet || t - imFlug.t0 > 20000)) {
            messen({ latenz: imFlug.gestartet ? imFlug.gestartet - imFlug.t0 : null, dauer: imFlug.gestartet ? t - imFlug.gestartet : null, zeichen: imFlug.text.length, bytes: utf8Laenge(imFlug.text), ok: !!imFlug.gestartet });
            imFlug = null;
        }
    }
    function utf8Laenge(s) { try { return new TextEncoder().encode(s).length; } catch (e) { return s.length; } }
    function messen(m) {
        var l = []; try { l = JSON.parse(ls(K_MESS) || '[]'); if (!Array.isArray(l)) l = []; } catch (e) { l = []; }
        m.zeit = jetzt(); l.push(m); if (l.length > 50) l.splice(0, l.length - 50);
        lsSet(K_MESS, JSON.stringify(l));
    }
    function median(a) { if (!a.length) return null; var s = a.slice().sort(function (x, y) { return x - y; }); var h = Math.floor(s.length / 2); return s.length % 2 ? s[h] : Math.round((s[h - 1] + s[h]) / 2); }
    function messung() {
        var l = []; try { l = JSON.parse(ls(K_MESS) || '[]'); } catch (e) { }
        var mit = l.filter(function (x) { return x.ok; });
        return { anzahl: l.length, gehoert: mit.length, latenzMedianMs: median(mit.map(function (x) { return x.latenz; })), dauerMedianMs: median(mit.map(function (x) { return x.dauer; })), zeichen: l.reduce(function (s, x) { return s + (x.zeichen || 0); }, 0), bytes: l.reduce(function (s, x) { return s + (x.bytes || 0); }, 0), hinweis: 'Kosten in Zeichen/Bytes; ein Euro-Betrag wird nicht geschätzt.' };
    }
    function unterbrochen() { queue = queue.filter(function (q) { return q.prio >= 3; }); pauseBis = jetzt() + 8000; if (imFlug) imFlug = null; }

    /* ---------- lange Schritte: ehrlicher Hinweis aus der echten Uhr ---------- */
    function langHinweise() {
        if (!M()) return;
        M().liste().forEach(function (m) {
            if (m.status !== 'laeuft' || !istStudio(m.id)) return;
            var s = (m.schritte || []).filter(function (x) { return x.status === 'laeuft'; })[0]; if (!s || !s.start) return;
            var dauer = jetzt() - s.start, li = langInfo[m.id + '/' + s.id] || { n: 0, zeit: 0 };
            if (dauer >= LANG_AB_MS && li.n < MAX_LANG_HINWEISE && jetzt() - li.zeit >= LANG_ABSTAND_MS) {
                li.n++; li.zeit = jetzt(); langInfo[m.id + '/' + s.id] = li;
                var pg = prognose(m.id), z = pg.moeglich ? ' ' + pg.satz : '';
                eintrag(m.id, 'lang', s.titel + ' läuft seit ' + dauerText(dauer), 1);
                ansage(m.id, 'lang', s.titel + ' läuft seit ' + dauerText(dauer) + '.' + z, 2, {});
            }
        });
    }

    /* ---------- Zeitprognose nur aus gemessenen Dauern ---------- */
    var MIN_PROBEN = 3;
    function prognose(mid) {
        var m = M() && M().hole(mid); if (!m) return { moeglich: false, grund: 'Mission unbekannt.' };
        var proben = {};   // Werkzeug -> Dauern (ms) aus allen bisherigen, erledigten Schritten
        M().liste().forEach(function (x) { (x.schritte || []).forEach(function (s) { if (s.werkzeug && s.status === 'erledigt' && s.dauerMs > 0) (proben[s.werkzeug] = proben[s.werkzeug] || []).push(s.dauerMs); }); });
        var offen = (m.schritte || []).filter(function (s) { return s.status === 'offen' || s.status === 'laeuft' || s.status === 'unterbrochen'; });
        if (!offen.length) return { moeglich: false, grund: 'Es ist nichts mehr offen.' };
        var summe = 0, niedrig = 0, hoch = 0;
        for (var i = 0; i < offen.length; i++) {
            var s = offen[i], p = s.werkzeug ? proben[s.werkzeug] || [] : [];
            if (p.length < MIN_PROBEN) return { moeglich: false, grund: 'Für „' + s.titel + '“ gibt es erst ' + p.length + ' von ' + MIN_PROBEN + ' nötigen Messwerten.', satz: '' };
            var med = median(p), sortiert = p.slice().sort(function (a, b) { return a - b; });
            var lo = sortiert[Math.floor((p.length - 1) * 0.25)], hi = sortiert[Math.ceil((p.length - 1) * 0.75)];
            var verg = s.status === 'laeuft' && s.start ? jetzt() - s.start : 0;
            summe += Math.max(0, med - verg); niedrig += Math.max(0, lo - verg); hoch += Math.max(0, hi - verg);
        }
        return { moeglich: true, ms: summe, vonMs: niedrig, bisMs: hoch, basis: 'Mittelwert früherer Schritte derselben Art (mindestens ' + MIN_PROBEN + ' Messungen je Werkzeug)', satz: 'Nach früheren Messungen etwa ' + dauerText(summe) + ' noch, grob zwischen ' + dauerText(niedrig) + ' und ' + dauerText(hoch) + '.' };
    }

    /* ---------- Takt: ein einziger Zeitgeber, nur solange etwas ansteht ---------- */
    function laeuftWas() { try { return M().liste().some(function (m) { return (m.status === 'laeuft' || m.status === 'wartet_freigabe') && istStudio(m.id); }); } catch (e) { return false; } }
    function verfolge() { plane(); }
    function takt() {
        tTimer = 0;
        try { beobachteFlug(); pumpe(); langHinweise(); } catch (e) { }
        plane();
    }
    function plane() {
        if (tTimer) return;
        var eilig = queue.length > 0 || !!imFlug;
        if (!eilig && !laeuftWas()) return;
        tTimer = setTimeout(takt, eilig && sichtbar() ? 300 : (eilig ? 2000 : 5000));   // versteckt: nur selten nachsehen (wartende Meldung wird nach dem Öffnen der App gesprochen)
    }

    /* ---------- Anbindung ---------- */
    function anmelden() {
        if (angemeldet || !M()) return; angemeldet = true;
        M().an(beiAenderung);
        try {
            var o = window.interruptSpeaking;
            if (typeof o === 'function' && !o.__regie) { var w = function () { try { unterbrochen(); } catch (e) { } return o.apply(this, arguments); }; w.__regie = true; window.interruptSpeaking = w; }
        } catch (e) { }
        try { M().liste().forEach(function (m) { if (istStudio(m.id)) { var l = m.log || []; gesehen[m.id] = l.length ? schluessel(l[l.length - 1]) : ''; } }); } catch (e) { }
        plane();
    }
    function ackSetzen(mid, text) { ackText[mid] = { text: text, zeit: jetzt() }; }
    function abschlussSetzen(mid, text) { abschluss[mid] = String(text || '').slice(0, 300); }
    anmelden();

    window.jvStudioRegie = {
        werkzeug: werkzeug, zeitleiste: zeitleisteAnsicht, prognose: prognose, bestaetigung: bestaetigung, anrede: anrede, dauerText: dauerText,
        stufe: stufe, setzeStufe: setzeStufe, stumm: stumm, setzeStumm: setzeStumm, spar: spar, setzeSpar: setzeSpar,
        ack: ackSetzen, abschlussText: abschlussSetzen, ansage: function (mid, text, prio) { return ansage(mid, 'direkt', text, prio === undefined ? 2 : prio, {}); },
        unterbrochen: unterbrochen, messung: messung, anmelden: anmelden, impuls: impuls,
        _queue: function () { return queue.slice(); }, _pumpe: function () { beobachteFlug(); pumpe(); }, _flug: function () { return imFlug; }, _lang: langHinweise,
        _reset: function () { queue = []; imFlug = null; pauseBis = 0; budget = {}; zeitleiste = {}; letzteAnsage = { text: '', zeit: 0 }; ackText = {}; }
    };
})();
