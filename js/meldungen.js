/* ============================================================
   MELDUNGS-BEOBACHTER (C1): zählt nur mit, wann sich Jarvis von selbst meldet. Er verändert NICHTS.
   - Reine Beobachtung: kein Eingriff in Texte, Zeiten, Ruhezeiten, Abstände oder "nur einmal"-Regeln; blockiert, verzögert und fasst nichts zusammen.
   - Nur Arbeitsspeicher (Ringpuffer, die letzten 300 Einträge). Kein localStorage, kein sessionStorage, kein Server, kein Netz,
     kein bestehender Schlüssel (insbesondere nicht "jv_meldungen", den plan_ansagen.js für "Meldungen zum Nachlesen" benutzt).
   - Jeder Aufruf ist gegen Fehler abgesichert. Fehlt diese Datei, laufen alle Meldungsstellen wie bisher.
   - Protokolliert wird nur, wenn tatsächlich eine Ausgabe für den Nutzer ausgelöst wird (Sprache, Karte, Fenster, Benachrichtigung),
     nicht bei Prüfungen oder Abfragen. Mehrere Kanäle DERSELBEN Meldung ergeben EINEN Eintrag mit mehreren Kanälen.
   - Bewertet wird nichts: kein "doppelt", kein "zu viel", kein "falsch".

   Eintrag (eingefroren):
     nr         laufende Nummer
     zeit       Zeitpunkt des Aufrufs (ms)
     quelle     Datei/Modul, zum Beispiel 'wachter'
     kanal      Liste: 'sprache' | 'karte' | 'fenster' | 'benachrichtigung' | 'push'
     grund      kurzer Code des Anlasses, zum Beispiel 'abfahrt'
     status     'ausgegeben' (Standard: Sprache/Karte/Fenster/Hinweis/Benachrichtigung wurde tatsächlich für den Nutzer ausgelöst)
                oder 'ausgeloest' (ein Modul stößt nur einen Vorgang an, dessen Ausgabe woanders entsteht, zum Beispiel schicht.js -> briefing.js;
                dann ist kanal leer und es zählt NICHT als Nutzer-Meldung)
     ausloeser  'timer' | 'app-start' | 'app-rueckkehr' | 'apk' | 'push' | 'plan' | 'manuell' | 'folge'   (rein beschreibend; 'folge' = Ausgabe als
                Folge eines kurz davor protokollierten 'ausgeloest'-Eintrags)
     frage      true, wenn die Meldung eine Frage an den Nutzer ist
     mikro      'nein' | 'bedingt' (Rückruf continueConversation: hört nur im Gesprächsmodus zu) | 'ja' (das Modul ruft nach dem Sprechen startListening selbst auf)
     ereignis   Schlüssel des Ereignisses, genau so wie das Modul ihn selbst führt (zum Beispiel 'leave|Arzt|2026-10-28T14:00:00+01:00')
     bezug      { art, schluessel, herkunft } einheitlich über alle Module; herkunft 'id' (stabile ID, bevorzugt),
                'text+zeit' (Rückfall, wenn keine ID da ist) oder 'tag'
     text       die ersten 80 Zeichen des Meldungstextes
   Mitleser:  window.jvMeldungen.abonniere(fn)  (meldungs_regeln.js rechnet damit im Shadow-Modus aus, was eine Sammelstelle entschieden hätte)
   Aufruf:  try { window.jvMeldungen && window.jvMeldungen.beobachte({ ... }); } catch (e) {}
   ============================================================ */
(function () {
    'use strict';
    if (window.jvMeldungen) return;
    var MAX = 300, puffer = [], zaehler = 0, startMs = Date.now(), hoerer = [];

    function s(x, n) { try { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n); } catch (e) { return ''; } }

    function beobachte(info) {
        try {
            if (!info || typeof info !== 'object') return;
            var k = info.kanal, kanal = [];
            if (Array.isArray(k)) { for (var i = 0; i < k.length && i < 6; i++) kanal.push(s(k[i], 20)); } else if (k) kanal.push(s(k, 20));
            var b = info.bezug && typeof info.bezug === 'object' ? { art: s(info.bezug.art, 30), schluessel: s(info.bezug.schluessel, 200), herkunft: s(info.bezug.herkunft, 20) } : null;
            var eintrag = {
                nr: ++zaehler,
                zeit: Date.now(),
                quelle: s(info.quelle, 40),
                kanal: Object.freeze(kanal),
                grund: s(info.grund, 40),
                status: info.status === 'ausgeloest' ? 'ausgeloest' : 'ausgegeben',
                ausloeser: s(info.ausloeser, 20),
                frage: info.frage === true,
                mikro: info.mikro === 'ja' || info.mikro === 'bedingt' ? info.mikro : 'nein',
                ereignis: s(info.ereignis, 200),
                bezug: b ? Object.freeze(b) : null,
                text: s(info.text, 80)
            };
            puffer.push(Object.freeze(eintrag));
            if (puffer.length > MAX) puffer.splice(0, puffer.length - MAX);
            for (var h = 0; h < hoerer.length; h++) { try { hoerer[h](eintrag); } catch (e2) { } }   // Mitleser (zum Beispiel meldungs_regeln.js); Fehler dort stören nichts
        } catch (e) { /* der Beobachter darf nie etwas stören */ }
    }

    /* ---------- Hilfen für einheitliche Bezüge (nur lesend) ---------- */
    function bezugTerminId(id) { try { return { art: 'termin', schluessel: s(id, 200), herkunft: 'id' }; } catch (e) { return null; } }
    /* Termin aus Text und Zeit: gibt es im Kalender einen Eintrag mit echter ID, wird diese genommen; sonst Rückfall auf Text und Zeit */
    function bezugTermin(text, iso) {
        try {
            var liste = (typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries)) ? calendarEntries : [];
            for (var i = 0; i < liste.length; i++) {
                var e = liste[i];
                if (e && e.id != null && String(e.text) === String(text) && String(e.isoDate) === String(iso)) return bezugTerminId(e.id);
            }
        } catch (e) { }
        return { art: 'termin', schluessel: s(text, 120) + '|' + s(iso, 40), herkunft: 'text+zeit' };
    }
    function bezugErinnerung(rem) {
        try {
            if (rem && rem.id != null) return { art: 'erinnerung', schluessel: s(rem.id, 60), herkunft: 'id' };
            return { art: 'erinnerung', schluessel: s(rem && rem.text, 120) + '|' + s(rem && rem.time, 40), herkunft: 'text+zeit' };
        } catch (e) { return null; }
    }
    /* Erinnerung aus Text und Zeit (proaktiv.js kennt nur diese beiden): echte ID aus der Erinnerungsliste, sonst Rückfall */
    function bezugErinnerungTextZeit(text, time) {
        try {
            var liste = (typeof reminderEntries !== 'undefined' && Array.isArray(reminderEntries)) ? reminderEntries : [];
            for (var i = 0; i < liste.length; i++) { var r = liste[i]; if (r && r.id != null && String(r.text) === String(text) && String(r.time) === String(time)) return bezugErinnerung(r); }
        } catch (e) { }
        return { art: 'erinnerung', schluessel: s(text, 120) + '|' + s(time, 40), herkunft: 'text+zeit' };
    }
    /* Allgemeine Bezüge für Meldungen, die kein Termin sind (Mail, Paket, Auftrag, Frist, Routine, Produkt …): die Kennung, die das Modul selbst führt */
    function bezugId(art, id) { try { return { art: s(art, 30), schluessel: s(id, 200), herkunft: 'id' }; } catch (e) { return null; } }
    /* War kurz vorher ein Eintrag mit Status 'ausgeloest' und passendem Grund im Puffer? Dann ist diese Ausgabe die Folge davon ('folge'), sonst 'manuell' */
    function folgeAusloeser(grundTeil, ms) {
        try {
            var jetzt = Date.now();
            for (var i = puffer.length - 1; i >= 0; i--) {
                var e = puffer[i];
                if (jetzt - e.zeit > (ms || 120000)) break;
                if (e.status === 'ausgeloest' && e.grund.indexOf(grundTeil) >= 0) return 'folge';
            }
        } catch (e) { }
        return 'manuell';
    }
    function bezugTag(ymd) { try { return { art: 'tag', schluessel: s(ymd, 20), herkunft: 'tag' }; } catch (e) { return null; } }
    /* Bezug aus den Schlüsseln der Wächter-Meldungen: 'leave|<Text>|<Zeit>', 'soon|…', 'rain|…', 'bday|<Tag>', 'uwarn|<ID>' */
    function bezugAusWaechterId(id) {
        try {
            var t = String(id || ''), p = t.indexOf('|'), art = t.slice(0, p), rest = t.slice(p + 1);
            if (art === 'leave' || art === 'soon') { var q = rest.lastIndexOf('|'); return bezugTermin(rest.slice(0, q), rest.slice(q + 1)); }
            if (art === 'bday') return bezugTag(rest);
            if (art === 'uwarn') return { art: 'warnung', schluessel: s(rest, 200), herkunft: 'id' };
            if (art === 'rain') return { art: 'wetter', schluessel: s(rest, 40), herkunft: 'tag' };
        } catch (e) { }
        return null;
    }
    /* Beschreibt, ob der Aufruf kurz nach dem Start oder später beim Zurückkommen in die App geschah (rein beschreibend) */
    function herkunftApp() { try { return Date.now() - startMs < 60000 ? 'app-start' : 'app-rueckkehr'; } catch (e) { return 'app-start'; } }

    /* Mitleser anmelden: bekommt jeden neuen (eingefrorenen) Eintrag; kann nichts ändern */
    function abonniere(fn) { try { if (typeof fn === 'function' && hoerer.length < 5) hoerer.push(fn); } catch (e) { } }

    window.jvMeldungen = Object.freeze({
        beobachte: beobachte, abonniere: abonniere,
        liste: function () { return puffer.slice(); },
        leeren: function () { puffer.length = 0; },
        bezugTerminId: bezugTerminId, bezugTermin: bezugTermin, bezugErinnerung: bezugErinnerung, bezugErinnerungTextZeit: bezugErinnerungTextZeit,
        bezugTag: bezugTag, bezugId: bezugId, folgeAusloeser: folgeAusloeser, bezugAusWaechterId: bezugAusWaechterId, herkunftApp: herkunftApp
    });
})();
