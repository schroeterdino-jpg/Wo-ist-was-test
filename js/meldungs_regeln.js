/* ============================================================
   MELDUNGS-REGELN (C1c, nur SHADOW): rechnet für jede Meldung aus dem C1-Protokoll (meldungen.js) aus, was eine spätere
   Sammelstelle entschieden HÄTTE. Es wird NICHTS blockiert, verschoben, verändert oder nachgeliefert.
   - Reine Beobachtung: hört auf window.jvMeldungen.abonniere(); kein Eingriff in Sprache, Karten, Fenster, Timer, Ruhezeiten, Texte.
   - Nur Arbeitsspeicher (Ringpuffer 300). Kein localStorage, kein Netz, kein Server, keine bestehenden Schlüssel.
   - Jeder Aufruf ist abgesichert. Fehlt diese Datei, ist sie aus oder wirft sie, laufen alle Meldungsstellen wie bisher.
   - Die Ruhephase kommt von der App selbst (wachterQuiet(), kennt Schichten), nicht aus einer festen Uhrzeit.

   Entscheidung (aktuell), getrennt von Nachlieferbarkeit und Verfall:
     entscheid   'zugelassen' | 'spaeter' | 'nur_stiller_kanal' | 'unklar'
                 'spaeter' heißt NUR: "Diese Meldung wäre zu diesem Zeitpunkt nicht ausgegeben worden."
                 Es heißt NICHT, dass sie später nachgesprochen wird.
     proKanal    { sprache|karte|fenster|hinweis|benachrichtigung|push: 'ja' | 'nein' } je Kanal der Meldung
     nachlieferung  { moeglich, verfallMin, verfallZeit, grund }   (rein beschreibend; im Shadow wird nichts nachgeliefert)
     kanalSchutz    bei bewusst gesetzten Erinnerungen: welche Kanäle in einer späteren Stufe erhalten bleiben sollen, auch wenn Sprache nicht passt
                    (nur Datenmodell, ändert jetzt nichts)
   Modell Version 2: version, prio (KRITISCH|HOCH|NORMAL|NIEDRIG|NUTZER), zweck, stufe, bewusstGesetzt, art (proaktiv|angefordert),
   ereignisId, merker[], regel, mikro (wie_bisher|nicht_automatisch|-)
   ============================================================ */
(function () {
    'use strict';
    if (window.jvRegeln) return;
    var MAX = 300;
    var P = {   // Startwerte (freigegeben als Startwerte für Shadow-Auswertungen, keine endgültigen Regeln)
        niedrigAbstandMin: 10, niedrigNachNutzerMin: 3, niedrigProStunde: 2, niedrigProTag: 6, textFensterH: 24, nachlaufMin: 60,
        zusammenfassMin: 10, mikroNutzerMin: 10, maxNachlieferSprache: 2
    };
    var an = true, entscheidungen = [], ausgeloest = 0, nutzerZeiten = [], ereignisse = {}, zugelassene = [], texte = {};
    var letzteRuhe = null, ruheEnde = null;

    /* ---------- Tabelle: quelle/grund -> [Priorität, Zweck, Stufe, bewusstGesetzt, Verfall in Minuten] ----------
       Verfall = wie lange eine zurückgestellte Meldung noch relevant wäre (0 = verfällt sofort, wird nicht nachgeliefert). Pro Meldungsart. */
    var TAB = {
        'alarm/warnung': ['KRITISCH', 'warnung', 'einzig', 0, 0],
        'wachter/unwetter': ['KRITISCH', 'warnung', 'einzig', 0, 0],
        'alarm/briefing-karte': ['HOCH', 'briefing', 'karte', 0, 180],
        'alarm/briefing-vorlesen': ['HOCH', 'briefing', 'haupt', 0, 180],
        'briefing/tagesbriefing': ['HOCH', 'briefing', 'haupt', 0, 180],
        'plan_ansagen/schicht-briefing': ['HOCH', 'briefing', 'haupt', 0, 180],
        'schicht/schicht-briefing': ['HOCH', 'briefing', 'haupt', 0, 180],
        'calendar/erinnerung': ['HOCH', 'erinnerung', 'faellig', 1, 120],
        'calendar/erinnerung-nachfrage': ['HOCH', 'erinnerung', 'nachfrage', 1, 120],
        'proaktiv/erinnerung-vorwarnung': ['HOCH', 'erinnerung', 'vorwarnung', 1, 120],
        'proaktiv/termin-vorwarnung': ['HOCH', 'termin-vorwarnung', 'vorwarnung', 0, 60],
        'wachter/abfahrt': ['HOCH', 'abfahrt', 'haupt', 0, 30],
        'travel/abfahrt': ['HOCH', 'abfahrt', 'haupt', 0, 30],
        'plan_ansagen/aufbruchszeit': ['HOCH', 'abfahrt', 'haupt', 0, 30],
        'plan_ansagen/heimweg': ['HOCH', 'abfahrt', 'heimweg', 0, 60],
        'plan_ansagen/stau-arbeitsweg': ['HOCH', 'stau', 'haupt', 0, 30],
        'wachter/termin-gleich': ['HOCH', 'termin-gleich', 'nah', 0, 30],
        'vorbereitung/termin-vorbereitet': ['NORMAL', 'vorbereitung', 'info', 0, 60],
        'fristen/frist-gefunden': ['NORMAL', 'frist-neu', 'info', 0, 1440],
        'fristen/frist-erinnerung': ['NORMAL', 'frist-erinnerung', 'faellig', 0, 720],
        'konto/bank-mail': ['NORMAL', 'kontobewegung', 'info', 0, 720],
        'mailwatch/wichtige-mail': ['NORMAL', 'mail-wichtig', 'info', 0, 720],
        'mail_nacht/mail-entwuerfe': ['NORMAL', 'mail-entwuerfe', 'info', 0, 480],
        'pakete/paket-zugestellt': ['NORMAL', 'paket', 'info', 0, 480],
        'pakete/paket-zustellung': ['NORMAL', 'paket', 'unterwegs', 0, 120],
        'preissuche/preis-treffer': ['NORMAL', 'preis', 'info', 0, 60],
        'auftraege/auftrag-erfuellt': ['NORMAL', 'auftrag', 'info', 0, 360],
        'plan_ansagen/auftrag': ['NORMAL', 'auftrag', 'info', 0, 360],
        'fahr_whatsapp/whatsapp-vorlesen': ['NORMAL', 'nachricht', 'info', 0, 120],
        'schlaf_antwort/app-meldung': ['NORMAL', 'nachricht', 'info', 0, 120],
        'parkplatz_auto/parkplatz-gemerkt': ['NORMAL', 'parkplatz', 'info', 0, 30],
        'autoansicht/autoansicht-einsteigen': ['NORMAL', 'status', 'info', 0, 5],
        'zuvorkommend/geburtstag-vorfrage': ['NORMAL', 'geburtstag', 'frage', 0, 480],
        'zuvorkommend/glueckwunsch-vortag': ['NORMAL', 'geburtstag', 'vortag', 0, 480],
        'zuvorkommend/glueckwunsch-tag': ['NORMAL', 'geburtstag', 'tag', 0, 480],
        'wachter/geburtstag': ['NORMAL', 'geburtstag', 'info', 0, 480],
        'wachter/regen': ['NORMAL', 'wetter', 'info', 0, 120],
        'dirigent/tagesmeldung': ['NORMAL', 'tagesmeldung', 'info', 0, 180],
        'orte/einkaufsliste-markt': ['NORMAL', 'einkauf', 'info', 0, 30],
        'plan_ansagen/wecker-frage': ['NORMAL', 'wecker', 'frage', 0, 60],
        'plan_ansagen/wochenueberblick': ['NORMAL', 'ueberblick', 'info', 0, 480],
        'tagesueberblick/tagesueberblick': ['NORMAL', 'ueberblick', 'info', 0, 120],
        'tagesueberblick/tagesueberblick-vorlesen': ['NORMAL', 'ueberblick', 'info', 0, 120],
        'jarvis/start-ansage': ['NORMAL', 'start-ansage', 'info', 0, 0],
        'orte/standort-frage': ['NIEDRIG', 'standort-frage', 'frage', 0, 0],
        'smarttips/mitnehmen-tipp': ['NIEDRIG', 'tipp', 'info', 0, 0],
        'routinen/routine-vorschlag': ['NIEDRIG', 'routine', 'frage', 0, 0],
        'routinen/routine-hinweis': ['NIEDRIG', 'routine', 'info', 0, 0],
        'kennenlernen/kennenlern-frage': ['NIEDRIG', 'kennenlernen', 'frage', 0, 0],
        'zane_redet/redet-frage': ['NIEDRIG', 'smalltalk', 'frage', 0, 0],
        'zane_redet/redet-satz': ['NIEDRIG', 'smalltalk', 'satz', 0, 0],
        'tagesueberblick/tagesueberblick-leer': ['NIEDRIG', 'ueberblick', 'leer', 0, 0]
    };
    /* In der Ruhephase erlaubte Kanäle je Priorität (außerhalb der Ruhephase sind alle erlaubt) */
    var ALLE = ['sprache', 'karte', 'fenster', 'hinweis', 'benachrichtigung', 'push'];
    var RUHE_OK = { KRITISCH: ALLE, NUTZER: ALLE, HOCH: ALLE, NORMAL: ['karte', 'hinweis', 'benachrichtigung'], NIEDRIG: [] };
    var RANG = { KRITISCH: 0, NUTZER: 0, HOCH: 1, NORMAL: 2, NIEDRIG: 3 };

    function s(x, n) { try { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, n); } catch (e) { return ''; } }
    function holeRuhe() { try { return typeof wachterQuiet === 'function' ? !!wachterQuiet() : null; } catch (e) { return null; } }

    /* Merkt sich, wann die App-Ruhephase zuletzt endete (für den Nachlauf von NIEDRIG). Es gibt bewusst KEINEN eigenen Zeitgeber:
       geprüft wird bei jeder Meldung, bei Nutzeraktivität und beim Sichtbarkeitswechsel. Das Ende der Ruhephase ist damit der erste Zeitpunkt, an dem
       "nicht mehr ruhig" beobachtet wurde (höchstens so spät wie die nächste Meldung; der Nachlauf ist dadurch eher etwas länger als kürzer). */
    function ruheStand() {
        var q = holeRuhe(), jetzt = Date.now();
        if (letzteRuhe === true && q === false) ruheEnde = jetzt;
        if (q !== null) letzteRuhe = q;
        return q;
    }

    function nutzerAktiv(ms) { try { ruheStand(); nutzerZeiten.push(typeof ms === 'number' ? ms : Date.now()); if (nutzerZeiten.length > 60) nutzerZeiten.splice(0, nutzerZeiten.length - 60); } catch (e) { } }

    /* Prioritäten, die aus dem vorhandenen Grund des Moduls folgen (keine KI-Bewertung): Fristen */
    function fristPrio(e) {
        if (e.grund === 'frist-gefunden') return e.kanal.indexOf('sprache') >= 0 ? 'HOCH' : 'NORMAL';   // das Modul spricht von selbst nur bei Mahnung und Vertragsänderung
        if (e.grund === 'frist-erinnerung') return /überfällig|ist heute fällig/i.test(e.text) ? 'HOCH' : 'NORMAL';   // Wortlaut des Moduls: Stufe "ueber" oder Tag 0
        return null;
    }

    function ereignisKey(e) {
        var b = e.bezug;
        if (!b || !b.art || !b.schluessel || b.herkunft === 'tag') return '';   // 'tag' ist zu grob
        return b.art + '|' + b.schluessel;
    }

    function wann(ms) { try { return new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch (e) { return ''; } }

    function entscheide(e) {
        var q = ruheStand(), jetzt = e.zeit;
        var key = e.quelle + '/' + e.grund, t = TAB[key];
        var r = {
            version: 2, nr: e.nr, zeit: e.zeit, quelle: e.quelle, grund: e.grund, kanal: e.kanal.slice(), status: e.status,
            prio: null, zweck: '', stufe: '', bewusstGesetzt: false, art: e.ausloeser === 'manuell' ? 'angefordert' : 'proaktiv',
            ereignisId: ereignisKey(e), merker: [], proKanal: {}, entscheid: 'unklar', regel: 'nicht-in-tabelle', warum: '',
            mikro: '-', ruhe: q === true, nachlieferung: { moeglich: false, verfallMin: 0, verfallZeit: null, grund: '' }, kanalSchutz: null
        };
        if (!t && r.art !== 'angefordert') { r.warum = 'nicht in der Tabelle'; return r; }
        if (!t) t = ['NORMAL', 'angefordert', 'info', 0, 0];   // vom Nutzer angestoßen, aber Quelle/Grund nicht in der Tabelle: gilt trotzdem (Vorrang)
        r.prio = t[0]; r.zweck = t[1]; r.stufe = t[2]; r.bewusstGesetzt = t[3] === 1;
        var fp = fristPrio(e); if (fp) r.prio = fp;
        if (r.art === 'angefordert') r.prio = 'NUTZER';
        var verfallMin = t[4];
        var hatSprache = e.kanal.indexOf('sprache') >= 0;

        /* Merker zu früheren Meldungen desselben Ereignisses (ändern nichts) */
        var ek = r.ereignisId;
        if (ek) {
            var liste = ereignisse[ek] || [];
            liste.forEach(function (v) {
                var wer = v.quelle + ' ' + wann(v.zeit);
                if (v.zweck === r.zweck && v.stufe === r.stufe) { r.merker.push('gleicher_zweck'); if (v.quelle !== r.quelle) r.merker.push('anderes_modul'); }
                else if (v.zweck === r.zweck) r.merker.push('gewollte_stufen');
                else if (jetzt - v.zeit <= P.zusammenfassMin * 60000) r.merker.push('zusammenfassbar');
                else r.merker.push('selbes_ereignis_anderer_zweck');
                r.mit = (r.mit || []).concat(wer);
            });
            liste.push({ zweck: r.zweck, stufe: r.stufe, quelle: r.quelle, zeit: jetzt });
            if (liste.length > 20) liste.shift();
            ereignisse[ek] = liste;
            var ks = Object.keys(ereignisse); if (ks.length > MAX) delete ereignisse[ks[0]];
        }
        r.merker = r.merker.filter(function (m, i, a) { return a.indexOf(m) === i; });

        if (r.prio === 'NUTZER') {
            r.entscheid = 'zugelassen'; r.regel = 'nutzer-vorrang'; r.warum = 'vom Nutzer angefordert, hat Vorrang';
        } else {
            var ruhe = q === true;
            var ok = ruhe ? RUHE_OK[r.prio] : ALLE;
            var erlaubt = e.kanal.filter(function (c) { return ok.indexOf(c) >= 0; });
            e.kanal.forEach(function (c) { r.proKanal[c] = ok.indexOf(c) >= 0 ? 'ja' : 'nein'; });
            if (erlaubt.length === e.kanal.length) { r.entscheid = 'zugelassen'; r.regel = ruhe ? 'ruhe-matrix' : 'frei'; r.warum = ruhe ? 'Ruhephase, aber ' + r.prio + ' darf alle Kanäle' + (r.bewusstGesetzt ? ' (bewusst gesetzt)' : '') : 'außerhalb der Ruhephase, keine Bremse für ' + r.prio; }
            else if (erlaubt.length) { r.entscheid = 'nur_stiller_kanal'; r.regel = 'ruhe-matrix'; r.warum = 'Ruhephase: ' + e.kanal.filter(function (c) { return erlaubt.indexOf(c) < 0; }).join('+') + ' aus, ' + erlaubt.join('+') + ' bleibt'; }
            else { r.entscheid = 'spaeter'; r.regel = 'ruhe-matrix'; r.warum = 'Ruhephase: ' + r.prio + ' hat keinen erlaubten Kanal'; if (r.prio === 'NIEDRIG') r.merker.push('niedrig_in_ruhe'); }

            /* Nur NIEDRIG mit Sprache: Bremsen (die erste greifende gewinnt) */
            if (r.prio === 'NIEDRIG' && r.entscheid === 'zugelassen' && hatSprache) {
                var letzteSprache = null;
                for (var i = zugelassene.length - 1; i >= 0; i--) { if (zugelassene[i].sprache) { letzteSprache = zugelassene[i].zeit; break; } }
                var letzterNutzer = null;
                for (var j = nutzerZeiten.length - 1; j >= 0; j--) { if (nutzerZeiten[j] <= jetzt) { letzterNutzer = nutzerZeiten[j]; break; } }
                var niedrigStd = 0, niedrigTag = 0;
                zugelassene.forEach(function (z) { if (z.niedrig && z.sprache) { if (jetzt - z.zeit < 3600000) niedrigStd++; if (jetzt - z.zeit < 86400000) niedrigTag++; } });
                var textZeit = texte[e.text];
                var sperre = null;
                if (q === false && ruheEnde !== null && jetzt - ruheEnde < P.nachlaufMin * 60000) sperre = ['niedrig-nachlauf', 'niedrig_in_ruhe', 'Nachlauf: Ruhephase endete vor weniger als ' + P.nachlaufMin + ' min'];
                else if (letzteSprache !== null && jetzt - letzteSprache < P.niedrigAbstandMin * 60000) sperre = ['niedrig-abstand', 'niedrig_zu_dicht', 'weniger als ' + P.niedrigAbstandMin + ' min nach anderer zugelassener Sprach-Ausgabe (' + Math.round((jetzt - letzteSprache) / 1000) + ' s)'];
                else if (letzterNutzer !== null && jetzt - letzterNutzer < P.niedrigNachNutzerMin * 60000) sperre = ['niedrig-nutzer', 'niedrig_zu_dicht', 'weniger als ' + P.niedrigNachNutzerMin + ' min nach Nutzeraktivität'];
                else if (niedrigTag >= P.niedrigProTag) sperre = ['niedrig-tag', 'menge', 'mehr als ' + P.niedrigProTag + ' niedrige Sprach-Impulse pro Tag'];
                else if (niedrigStd >= P.niedrigProStunde) sperre = ['niedrig-stunde', 'menge', 'mehr als ' + P.niedrigProStunde + ' niedrige Sprach-Impulse pro Stunde'];
                else if (textZeit !== undefined && jetzt - textZeit < P.textFensterH * 3600000) sperre = ['niedrig-text', 'wiederholung', 'gleicher Text innerhalb ' + P.textFensterH + ' h schon gesagt'];
                if (sperre) { r.entscheid = 'spaeter'; r.regel = sperre[0]; r.merker.push(sperre[1]); r.warum = sperre[2]; e.kanal.forEach(function (c) { r.proKanal[c] = 'nein'; }); }
                else { r.regel = 'niedrig-frei'; r.warum = 'keine Bremse greift'; }
            }
        }

        /* Mikrofon-Absicht (nur NIEDRIG bewertet) */
        if (e.mikro === 'ja' || e.mikro === 'bedingt') {
            if (r.prio === 'NIEDRIG') {
                var n = null; for (var k = nutzerZeiten.length - 1; k >= 0; k--) { if (nutzerZeiten[k] <= jetzt) { n = nutzerZeiten[k]; break; } }
                r.mikro = (n !== null && jetzt - n < P.mikroNutzerMin * 60000) ? 'wie_bisher' : 'nicht_automatisch';
            } else r.mikro = 'wie_bisher';
        }

        /* Nachlieferbarkeit und Verfall (getrennt von der Entscheidung; im Shadow wird nichts nachgeliefert) */
        var nachl = r.entscheid === 'spaeter' || r.entscheid === 'nur_stiller_kanal';
        if (nachl) {
            if (r.prio === 'NIEDRIG') r.nachlieferung = { moeglich: false, verfallMin: 0, verfallZeit: null, grund: 'niedrig verfaellt, wird nicht nachgeliefert' };
            else if (verfallMin > 0) r.nachlieferung = { moeglich: true, verfallMin: verfallMin, verfallZeit: jetzt + verfallMin * 60000, grund: 'bis zum Verfall nachlieferbar' };
            else r.nachlieferung = { moeglich: false, verfallMin: 0, verfallZeit: null, grund: 'verfaellt sofort' };
        }
        if (r.bewusstGesetzt) r.kanalSchutz = { behalteKanal: ['hinweis', 'benachrichtigung', 'karte'], sprachePflicht: false, nurDatenmodell: true };

        /* Zustand für spätere Entscheidungen (nur zugelassene zählen als tatsächlich ausgegeben) */
        if (r.entscheid !== 'spaeter' && r.entscheid !== 'unklar') {
            var sprecht = r.entscheid === 'zugelassen' ? hatSprache : (r.proKanal.sprache === 'ja');
            zugelassene.push({ zeit: jetzt, sprache: sprecht, niedrig: r.prio === 'NIEDRIG' });
            if (zugelassene.length > MAX) zugelassene.shift();
            if (r.prio === 'NIEDRIG' && hatSprache) { texte[e.text] = jetzt; var tk = Object.keys(texte); if (tk.length > MAX) delete texte[tk[0]]; }
        }
        return r;
    }

    function hoere(e) {
        try {
            if (!an || !e) return;
            if (e.status === 'ausgeloest') { ausgeloest++; return; }
            var r = entscheide(e);
            entscheidungen.push(Object.freeze(r));
            if (entscheidungen.length > MAX) entscheidungen.splice(0, entscheidungen.length - MAX);
        } catch (err) { /* der Shadow darf nie etwas stören */ }
    }

    /* Was würde beim Ende der Ruhephase (oder zu einem anderen Zeitpunkt) nachgeliefert werden können? Reine Rechnung, es wird nichts ausgegeben.
       - NIEDRIG: verworfen. Abgelaufene (verfallZeit <= ms): verfallen. Gleiche Ereignis+Zweck: nur die neueste.
       - Höchstens maxNachlieferSprache Meldungen dürften gesprochen werden (nach Priorität, dann Zeit); der Rest nur als eine stille Sammelkarte.
         So gibt es keinen morgendlichen Sprachstau. */
    function nachliefervorschau(ms, liste) {
        var aus = { sprache: [], sammelkarte: [], verfallen: [], verworfen: [] };
        try {
            var kand = [], gesehen = {};
            (liste || entscheidungen).filter(function (d) { return d.entscheid === 'spaeter' || d.entscheid === 'nur_stiller_kanal'; }).slice().reverse().forEach(function (d) {
                var k = d.ereignisId ? d.ereignisId + '|' + d.zweck : 'nr' + d.nr;
                if (d.prio === 'NIEDRIG' || !d.nachlieferung.moeglich) { aus.verworfen.push(d.nr); return; }
                if (d.nachlieferung.verfallZeit !== null && d.nachlieferung.verfallZeit <= ms) { aus.verfallen.push(d.nr); return; }
                if (gesehen[k]) { aus.verworfen.push(d.nr); return; }
                gesehen[k] = 1; kand.push(d);
            });
            kand.sort(function (a, b) { return (RANG[a.prio] - RANG[b.prio]) || (a.zeit - b.zeit); });
            kand.forEach(function (d, i) { (i < P.maxNachlieferSprache ? aus.sprache : aus.sammelkarte).push(d.nr); });
        } catch (e) { }
        return aus;
    }

    try {
        ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { nutzerAktiv(); }, { passive: true, capture: true }); });
        document.addEventListener('visibilitychange', function () { try { ruheStand(); } catch (e) { } }, { passive: true });
        if (window.jvMeldungen && typeof window.jvMeldungen.abonniere === 'function') window.jvMeldungen.abonniere(hoere);
    } catch (e) { }

    window.jvRegeln = {
        tabelle: TAB, parameter: P,
        liste: function () { return entscheidungen.slice(); },
        ausgeloest: function () { return ausgeloest; },
        leeren: function () { entscheidungen.length = 0; },
        aus: function () { an = false; }, einschalten: function () { an = true; }, istAn: function () { return an; },
        nutzerAktiv: nutzerAktiv, nachliefervorschau: nachliefervorschau
    };
})();
