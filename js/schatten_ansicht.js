/* ============================================================
   DIAGNOSEANSICHT SCHATTENBETRIEB (Phase 5): Einstellungen > "Diagnose: Schattenbetrieb".
   Zeigt NUR, was js/schatten.js tatsächlich beobachtet hat (jvSchatten.zusammenfassung()): EIN/AUS, Anzahl beobachteter Anfragen, Übereinstimmungen,
   Abweichungen, je Vorgang vorgeschlagene Fähigkeit, benutzter Weg (fester Befehl oder KI). Keine Beispiel- oder Platzhalterdaten.
   Der Schalter schreibt nur den Merker "jv_schatten" (Standard: nicht gesetzt = AUS). "Einträge löschen" leert Protokoll und Zähler im Arbeitsspeicher.
   Kein Netz, keine Sätze, keine zusätzliche Aktion, kein KI-Aufruf. Texte werden nur über textContent eingesetzt.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvSchattenAnsicht) return;

    var NAMEN = { ortssuche: 'Ortssuche', websuche: 'Websuche', erinnerung_erstellen: 'Erinnerung', termin_erstellen: 'Kalendertermin', gedaechtnis_speichern: 'Gedächtnis' };
    var URTEIL = {
        uebereinstimmung: 'gleich', lokal_statt_faehigkeit: 'Abweichung: fester Befehl statt Fähigkeit', ki_ohne_aktion: 'Abweichung: KI antwortete nur',
        andere_faehigkeit: 'Abweichung: andere Fähigkeit', unerwartete_faehigkeit: 'Abweichung: nicht vermutet', keine_faehigkeit: 'keine Fähigkeit nötig'
    };
    function name(n) { return NAMEN[n] || String(n).replace(/_/g, ' '); }
    function liste(a) { return a && a.length ? a.map(name).join(', ') : 'keine'; }
    function uhrzeit(ms) { try { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2) + ':' + ('0' + d.getSeconds()).slice(-2); } catch (e) { return ''; } }
    function el(id) { return document.getElementById(id); }

    function zeilenText(e) {
        return '#' + e.nr + ' · ' + uhrzeit(e.zeit) + ' · ' + (e.weg === 'ki' ? 'KI' : 'fester Befehl') + ' · vorgeschlagen: ' + liste(e.kandidaten) + ' · benutzt: ' + liste(e.faehigkeiten) + ' · ' + (URTEIL[e.urteil] || e.urteil);
    }

    function zeichne() {
        var S = window.jvSchatten, schalter = el('schattenSchalter'), status = el('schattenStatus'), zahlen = el('schattenZahlen'), lst = el('schattenListe');
        if (!schalter || !status || !zahlen || !lst) return false;
        lst.textContent = '';
        if (!S || typeof S.zusammenfassung !== 'function') { status.textContent = 'nicht verfügbar'; zahlen.textContent = ''; schalter.disabled = true; return false; }
        var z; try { z = S.zusammenfassung(); } catch (e) { status.textContent = 'Fehler'; zahlen.textContent = 'Die Diagnose kann gerade nicht angezeigt werden.'; return false; }
        schalter.checked = !!z.an;
        status.textContent = z.an ? 'EIN' : 'AUS';
        status.style.color = z.an ? '#4cffb0' : '#5d7e91';
        if (!z.an && !z.beobachtet) { zahlen.textContent = 'Aus: es wird nichts beobachtet.'; return true; }
        zahlen.textContent = 'Beobachtete Anfragen: ' + z.beobachtet + ' · gleiche Entscheidung: ' + z.uebereinstimmung + ' · Abweichungen: ' + z.abweichungen + ' · ohne Fähigkeit: ' + z.keineFaehigkeit + (z.eigeneFehler ? ' · Fehler im Schatten: ' + z.eigeneFehler : '');
        if (!z.letzte.length) {
            var leer = document.createElement('div'); leer.textContent = z.an ? 'Noch keine Anfrage beobachtet.' : 'Keine Einträge.'; lst.appendChild(leer);
        }
        z.letzte.forEach(function (e) { var d = document.createElement('div'); d.textContent = zeilenText(e); lst.appendChild(d); });
        return true;
    }

    function merker(an) { try { if (an) window.localStorage.setItem('jv_schatten', '1'); else window.localStorage.removeItem('jv_schatten'); } catch (e) { } }

    function schalten(an) {
        var S = window.jvSchatten; if (!S) return false;
        if (an) S.an(); else S.aus();
        merker(an);
        zeichne();
        return true;
    }
    function loeschen() { var S = window.jvSchatten; if (S && S.vergiss) S.vergiss(); zeichne(); return true; }

    function start() {
        try {
            var sw = el('schattenSchalter'), akt = el('schattenAktualisieren'), del = el('schattenLoeschen'), box = el('schattenBox');
            if (sw) sw.addEventListener('change', function () { schalten(!!sw.checked); });
            if (akt) akt.addEventListener('click', zeichne);
            if (del) del.addEventListener('click', loeschen);
            if (box) box.addEventListener('toggle', function () { if (box.open) zeichne(); });
            zeichne();
        } catch (e) { }
    }

    window.jvSchattenAnsicht = { zeichne: zeichne, schalten: schalten, loeschen: loeschen, starte: start };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
