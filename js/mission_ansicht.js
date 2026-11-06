/* ============================================================
   MISSIONSZENTRALE (Jarvis Studio, Paket M2): die Oberfläche zum Missions-Kern (mission_kern.js, window.jvMission).
   Alles, was sie anzeigt, kommt aus den echten M1-Daten: Uhr (aus Zeitstempeln), Zustand, Schritte, Belege, Kosten, Budget. Es gibt KEINE erfundenen
   Prozentwerte, Arbeitsschritte oder KI-Aktivitäten. Der Phasenring besteht aus den echten Schritten der Mission, seine Farbe aus dem echten Zustand.
   Sie führt keine Aufträge aus (Schritte trägt der Nutzer von Hand ein; Werkzeuge kommen später) und ändert nichts am Kern.
   Zugang nur über das Menü ☰ → "Missionszentrale" (window.missionMenu). Kein Sprachbefehl, die Befehlsreihenfolge bleibt unverändert.

   Bewegung (alles nur bei geöffneter Zentrale):
     · Ringe drehen per CSS (keine Schleife in JavaScript), jeder Zustand hat sein eigenes Bild. Bei unsichtbarer App stehen sie (animation-play-state),
       bei "Bewegung reduzieren" (prefers-reduced-motion) gibt es keine Animation, Farben und Zahlen bleiben.
     · Die Jarvis-Kugel in der Mitte wird NICHT neu gebaut: das Bild der vorhandenen Kugel (#jarvisSphere, sphere.js bleibt unverändert) wird nur kopiert.
       Dafür läuft EINE Zeichenschleife (requestAnimationFrame), nur in der Detailansicht, nur bei sichtbarer App und erlaubter Bewegung.
     · EIN Sekundentakt rechnet die Uhr aus den Zeitstempeln und gibt dem Kern das Lebenszeichen. Beides endet beim Schließen.
   Kritische Aktionen (Abbrechen, Entfernen, Freigeben, Scheitern melden) laufen erst nach Bestätigung im eigenen Fenster und nur über jvMission,
   dessen Regeln (erlaubte Übergänge, Belegpflicht, Budgetprüfung) unverändert gelten.
   Braucht: mission_kern.js. Optional: sphere.js (Kugelbild).
   ============================================================ */
(function () {
    'use strict';
    if (window.jvMissionAnsicht) return;
    const K = () => window.jvMission;
    const NAME = { geplant: 'GEPLANT', laeuft: 'LÄUFT', wartet_freigabe: 'WARTET AUF FREIGABE', pausiert: 'PAUSIERT', abgeschlossen: 'ABGESCHLOSSEN', fehlgeschlagen: 'FEHLGESCHLAGEN', abgebrochen: 'ABGEBROCHEN' };
    const FARBE = { geplant: '#3a8cff', laeuft: '#5ee7ff', wartet_freigabe: '#ffb347', pausiert: '#a5b4fc', abgeschlossen: '#3ee6b0', fehlgeschlagen: '#ff5c5c', abgebrochen: '#c084fc' };
    const SFARBE = { erledigt: '#3ee6b0', laeuft: '#5ee7ff', offen: '#1d3a5f', fehlgeschlagen: '#ff5c5c', unterbrochen: '#ffb347', uebersprungen: '#7fa3c2' };
    const SZEICHEN = { erledigt: '✓', laeuft: '●', offen: '', fehlgeschlagen: '!', unterbrochen: 'II', uebersprungen: '↷' };
    const SNAME = { erledigt: 'erledigt', laeuft: 'läuft', offen: 'offen', fehlgeschlagen: 'fehlgeschlagen', unterbrochen: 'unterbrochen', uebersprungen: 'übersprungen' };
    const BELEG = { ergebnis: 'Ergebnis', pruefung: 'Prüfung', quelle: 'Quelle', datei: 'Datei', test: 'Test' };
    const AKTIV = ['laeuft', 'wartet_freigabe', 'pausiert', 'geplant'];
    const ENDE = ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen'];

    const ui = { ansicht: 'liste', id: null, sheet: null, meldung: '', akt: false, fertigAnim: false };
    let wurzel = null, stilEl = null, takt = null, schleife = 0, aktTimer = 0, hoerer = null, sichtbar = true, bewegungAus = false, mq = null, mqHoerer = null, visHoerer = null;

    /* ---------- Helfer ---------- */
    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    const p2 = n => (n < 10 ? '0' : '') + n;
    function hms(ms) { const s = Math.floor(Math.max(0, ms) / 1000); return p2(Math.floor(s / 3600)) + ':' + p2(Math.floor((s % 3600) / 60)) + ':' + p2(s % 60); }
    function dauer(ms) { const s = Math.floor(Math.max(0, ms) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60); return (h ? h + ':' + p2(m) : m) + ':' + p2(s % 60); }
    function euro(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
    function parseEuro(t) {   // "0,50" / "2" / "1.5" → Cent; leer → null (kein Wert); ungültig → NaN
        t = String(t == null ? '' : t).trim().replace(/\s*€$/, '');
        if (!t) return null;
        if (!/^\d{1,6}([.,]\d{1,2})?$/.test(t)) return NaN;
        return Math.round(parseFloat(t.replace(',', '.')) * 100);
    }
    function uhrZeit(ms) { try { return new Date(ms).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }); } catch (e) { return ''; } }
    const jetztS = () => Date.now() / 1000;
    const verz = per => 'animation-delay:-' + (jetztS() % per).toFixed(2) + 's';   // Drehung läuft nach jedem Neuzeichnen nahtlos weiter
    function bewegungErlaubt() { return !bewegungAus && sichtbar; }

    /* ---------- Ring (SVG) ---------- */
    function bogen(steps, r, w, cx, cy) {
        const n = steps.length;
        if (!n) return '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="none" stroke="' + SFARBE.offen + '" stroke-width="' + w + '"/>';
        const gap = n > 1 ? 9 : 0, seg = 360 / n - gap;
        let s = '';
        steps.forEach((x, i) => {
            const a0 = (-90 + i * (360 / n) + gap / 2) * Math.PI / 180, a1 = a0 + seg * Math.PI / 180;
            const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0), x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
            s += '<path d="M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + r + ' ' + r + ' 0 ' + (seg > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2) + '" fill="none" stroke="' + SFARBE[x.status] + '" stroke-width="' + w +
                '" stroke-linecap="round"' + (n === 1 ? ' stroke-dasharray="0.1"' : '') + (x.status === 'laeuft' ? ' class="mzLauf"' : '') + '/>';
        });
        return s;
    }
    function ticks() {
        let s = '';
        for (let i = 0; i < 72; i++) {
            const a = i * 5 * Math.PI / 180, l = i % 6 ? 4 : 9;
            s += '<line x1="' + (150 + 142 * Math.cos(a)).toFixed(1) + '" y1="' + (150 + 142 * Math.sin(a)).toFixed(1) + '" x2="' + (150 + (142 - l) * Math.cos(a)).toFixed(1) + '" y2="' + (150 + (142 - l) * Math.sin(a)).toFixed(1) +
                '" stroke="currentColor" stroke-width="' + (i % 6 ? 1 : 1.6) + '" opacity="' + (i % 6 ? 0.45 : 0.9) + '"/>';
        }
        return s;
    }
    function ringHtml(m) {
        const z = m.status, col = FARBE[z];
        const badge = z === 'abgeschlossen' ? '<g transform="translate(150 284)"><circle r="14" fill="#030812" stroke="' + col + '" stroke-width="2"/><path d="M-6 0l4 5 8-10" stroke="' + col + '" stroke-width="2.4" fill="none"/></g>'
            : z === 'fehlgeschlagen' ? '<g transform="translate(150 284)"><circle r="14" fill="#030812" stroke="' + col + '" stroke-width="2"/><path d="M0 -7v8M0 5.5v1" stroke="' + col + '" stroke-width="2.6" stroke-linecap="round"/></g>'
            : z === 'wartet_freigabe' ? '<g transform="translate(150 284)"><circle r="14" fill="#030812" stroke="' + col + '" stroke-width="2"/><path d="M-4 -6v12M4 -6v12" stroke="' + col + '" stroke-width="2.6" stroke-linecap="round"/></g>' : '';
        return '<div class="mzRing' + (ui.akt ? ' akt' : '') + (ui.fertigAnim && z === 'abgeschlossen' ? ' fertig' : '') + '" data-z="' + z + '" style="--c:' + col + '">' +
            '<svg viewBox="0 0 300 300" aria-hidden="true"><defs><radialGradient id="mzRg"><stop offset="0" stop-color="' + col + '" stop-opacity=".18"/><stop offset="1" stop-color="' + col + '" stop-opacity="0"/></radialGradient>' +
            '<linearGradient id="mzSw" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="' + col + '" stop-opacity="0"/><stop offset="1" stop-color="' + col + '" stop-opacity=".55"/></linearGradient></defs>' +
            '<circle class="mzGlow" cx="150" cy="150" r="130" fill="url(#mzRg)" style="' + verz(4) + '"/>' +
            '<g class="mzSpin1" style="color:' + col + ';' + verz(70) + '">' + ticks() + '</g>' +
            '<g class="mzSweepG" style="' + verz(9) + '"><path d="M150 150 L150 30 A120 120 0 0 1 252 90 Z" fill="url(#mzSw)" opacity=".35"/></g>' +
            '<g>' + bogen(m.schritte, 124, 7, 150, 150) + '</g>' +
            '<g class="mzSpin2" style="' + verz(40) + '"><circle cx="150" cy="150" r="108" fill="none" stroke="' + col + '" stroke-width="1.2" stroke-dasharray="3 9" opacity=".6"/><circle cx="150" cy="150" r="100" fill="none" stroke="' + col + '" stroke-width=".8" opacity=".28"/></g>' +
            '<circle class="mzBurst" cx="150" cy="150" r="124" fill="none" stroke="' + col + '" stroke-width="3"/>' + badge + '</svg>' +
            '<div class="mzMitte"><canvas id="mzKugel" class="mzKugel" width="224" height="224" aria-hidden="true"></canvas>' +
            '<div class="mzUhr" data-k="haupt">' + hms(m.zeiten.aktivMs) + '</div><div class="mzUhrT">AKTIVE ZEIT</div></div>' +
            (ui.akt ? '<div class="mzAktText">MISSION AKTIVIERT</div>' : '') + '</div>';
    }
    function miniRing(m) {
        const col = FARBE[m.status];
        return '<svg class="mzMini" viewBox="0 0 62 62" aria-hidden="true" data-z="' + m.status + '" style="--c:' + col + '"><g>' + bogen(m.schritte, 26, 4, 31, 31) + '</g>' +
            '<circle class="mzMiniDreh" cx="31" cy="31" r="17" fill="none" stroke="' + col + '" stroke-width="1" stroke-dasharray="2 5" opacity=".6" style="transform-origin:31px 31px;' + verz(14) + '"/>' +
            '<circle cx="31" cy="31" r="8" fill="' + col + '" opacity=".85"/></svg>';
    }

    /* ---------- Texte aus echten Daten ---------- */
    function hinweis(m) {
        const lauf = m.schritte.find(s => s.status === 'laeuft'), nr = lauf ? m.schritte.indexOf(lauf) + 1 : 0;
        if (m.status === 'laeuft') return lauf ? 'Schritt ' + nr + ' von ' + m.schritte.length + ' läuft' : 'Läuft. Es ist gerade kein Schritt gestartet.';
        if (m.status === 'geplant') return 'Bereit. Noch nichts gestartet.';
        if (m.status === 'pausiert') return m.unterbrochen ? 'Unterbrochen: Die App war zu. Nichts läuft von selbst weiter.' : 'Pausiert. Mit „Fortsetzen“ geht es weiter.';
        if (m.status === 'wartet_freigabe') return (m.freigabeFuer || 'Freigabe nötig') + '. Ohne dein Ja geht nichts weiter.';
        if (m.status === 'abgeschlossen') return 'Alle Schritte mit Beleg erledigt oder bewusst übersprungen.';
        if (m.status === 'fehlgeschlagen') return 'Grund: ' + (m.fehlergrund || 'nicht angegeben');
        return 'Abgebrochen' + (m.abbruchgrund ? ': ' + m.abbruchgrund : '') + '.';
    }
    function belegteSchritte(m) { return m.schritte.filter(s => s.status === 'erledigt').length; }
    function kostenHtml(m) {
        const k = m.kostenAnsicht;
        const anteil = k.budgetCent ? Math.min(100, Math.round(k.gemeldetCent * 100 / k.budgetCent)) : null;
        let h = '<div class="mzKarte"><div class="mzZeile"><span>Kosten gemeldet <b>' + euro(k.gemeldetCent) + '</b></span><small>' + (k.budgetCent === null ? 'keine Grenze' : 'Budget ' + euro(k.budgetCent)) + '</small></div>';
        if (anteil !== null) h += '<div class="mzBalken' + (k.budgetUeberschritten ? ' ueber' : '') + '"><i style="width:' + anteil + '%"></i></div>';
        h += '<div class="mzZeile"><small>' + (k.geschaetztCent === null ? 'keine Schätzung' : 'Schätzung ' + euro(k.geschaetztCent)) + '</small><small>' +
            (k.budgetUeberschritten ? '<span class="mzWarn">Budget überschritten (+' + euro(k.gemeldetCent - k.budgetCent) + ')</span>' : k.rest !== null ? 'noch ' + euro(k.rest) : '') + '</small></div>';
        if (k.unbekannt) h += '<div class="mzHinweis">' + k.unbekannt + ' Posten ohne bekannten Betrag' + (k.budgetCent !== null ? ': das Budget ist nicht prüfbar.' : '.') + '</div>';
        if (ENDE.indexOf(m.status) < 0) h += '<button class="mzKlein" data-mk="sheet" data-a="budget|' + esc(m.id) + '">Budget ändern</button>';
        return h + '</div>';
    }
    function schritteHtml(m) {
        if (!m.schritte.length) return '<div class="mzKarte"><small>Diese Mission hat keine Schritte.</small></div>';
        const kannArbeiten = m.status === 'laeuft';
        let h = '<div class="mzKarte mzSchritte">';
        m.schritte.forEach(s => {
            const f = SFARBE[s.status], laufMs = s.status === 'laeuft' && s.start ? s.dauerMs + Math.max(0, Date.now() - s.start) : s.dauerMs;
            h += '<div class="mzSchritt"><span class="mzPunkt" style="color:' + f + ';border-color:' + f + '">' + SZEICHEN[s.status] + '</span><div class="mzST"><b>' + esc(s.titel) + '</b>' +
                '<small style="color:' + f + '">' + SNAME[s.status] + (s.versuche > 1 ? ' · Versuch ' + s.versuche : '') + '</small></div>' +
                '<span class="mzD"' + (s.status === 'laeuft' && s.start ? ' data-sd="' + s.start + '|' + s.dauerMs + '"' : '') + '>' + (laufMs || s.status === 'laeuft' ? dauer(laufMs) : '–') + '</span></div>';
            if (s.beleg) h += '<div class="mzBeleg">Beleg (' + esc(BELEG[s.beleg.art] || s.beleg.art) + '): ' + esc(s.beleg.text) + (s.beleg.ref ? ' · ' + esc(s.beleg.ref) : '') + '</div>';
            if (s.fehler) h += '<div class="mzFehlerT">Fehler: ' + esc(s.fehler) + '</div>';
            if (s.grund) h += '<div class="mzGrundT">Übersprungen: ' + esc(s.grund) + '</div>';
            if (s.abhaengigVon.length && s.status === 'offen') h += '<div class="mzGrundT">wartet auf ' + esc(s.abhaengigVon.join(', ')) + '</div>';
            let b = '';
            if (kannArbeiten && (s.status === 'offen' || s.status === 'unterbrochen')) b += '<button class="mzKlein" data-mk="sstart" data-a="' + esc(m.id + '|' + s.id) + '">Schritt starten</button>';
            if (kannArbeiten && s.status === 'laeuft') b += '<button class="mzKlein ok" data-mk="sheet" data-a="beleg|' + esc(m.id + '|' + s.id) + '">Erledigt mit Beleg</button><button class="mzKlein bad" data-mk="sheet" data-a="sfehler|' + esc(m.id + '|' + s.id) + '">Fehler melden</button>';
            if ((m.status === 'laeuft' || m.status === 'pausiert') && (s.status === 'offen' || s.status === 'unterbrochen' || s.status === 'fehlgeschlagen')) b += '<button class="mzKlein" data-mk="sheet" data-a="skip|' + esc(m.id + '|' + s.id) + '">Überspringen</button>';
            if (b) h += '<div class="mzSB">' + b + '</div>';
        });
        return h + '</div>';
    }
    function knoepfe(m) {
        const b = [];
        if (m.status === 'geplant') b.push(['start', 'START', '#3a8cff']);
        if (m.status === 'laeuft') b.push(['pause', 'PAUSE', '#5ee7ff']);
        if (m.status === 'pausiert') b.push(['weiter', 'FORTSETZEN', '#5ee7ff']);
        if (m.status === 'wartet_freigabe') b.push(['sheet|frei', 'FREIGEBEN', '#ffb347']);
        if (m.status === 'laeuft' && m.schritte.length && m.schritte.every(s => s.status === 'erledigt' || s.status === 'uebersprungen')) b.push(['ende', 'ABSCHLIESSEN', '#3ee6b0']);
        if (m.moeglich.indexOf('abgebrochen') >= 0) b.push(['sheet|abbr', 'ABBRECHEN', '#c084fc']);
        if (ENDE.indexOf(m.status) >= 0) b.push(['sheet|weg', 'ENTFERNEN', '#7fa3c2']);
        return b.map(x => '<button class="mzGross" style="--c:' + x[2] + '" data-mk="' + x[0].split('|')[0] + '" data-a="' + (x[0].indexOf('|') > 0 ? x[0].split('|')[1] + '|' : '') + esc(m.id) + '">' + x[1] + '</button>').join('');
    }

    /* ---------- Fenster (Bestätigungen und Eingaben) ---------- */
    function sheetHtml(m) {
        const s = ui.sheet; if (!s) return '';
        const fe = s.fehler ? '<div class="mzSheetFehler">' + esc(s.fehler) + '</div>' : '';
        const ja = (txt, farbe) => '<div class="mzSheetB"><button class="mzGross" style="--c:#7fa3c2" data-mk="zu2" data-a="">Zurück</button><button class="mzGross" style="--c:' + (farbe || '#5ee7ff') + '" data-mk="ok2" data-a="">' + txt + '</button></div>';
        let h = '<div class="mzSheetBg" data-mk="zu2" data-a=""></div><div class="mzSheet" role="dialog" aria-modal="true">';
        if (s.art === 'abbr') h += '<b>Mission wirklich abbrechen?</b><p>„' + esc(m.titel) + '“ wird endgültig beendet. Die bisherige Zeit und die Belege bleiben sichtbar.</p><input class="mzIn" data-f="grund" placeholder="Grund (freiwillig)" maxlength="300">' + fe + ja('JA, ABBRECHEN', '#c084fc');
        else if (s.art === 'weg') h += '<b>Mission entfernen?</b><p>„' + esc(m.titel) + '“ wird mit allen Belegen und Zeiten gelöscht. Das geht nicht rückgängig.</p>' + fe + ja('JA, ENTFERNEN', '#ff5c5c');
        else if (s.art === 'frei') {
            const k = m.kostenAnsicht;
            h += '<b>Freigeben?</b><p>' + esc(m.freigabeFuer || 'Die Mission wartet auf dich.') + '</p>' + (k.budgetUeberschritten ? '<p class="mzWarn">Das Budget ist überschritten. Setze ein höheres Budget, sonst läuft nichts weiter.</p><input class="mzIn" data-f="budget" inputmode="decimal" placeholder="Neues Budget in € (z. B. 1,50)">' : '') + fe + ja('JA, FREIGEBEN', '#ffb347');
        }
        else if (s.art === 'gescheitert') h += '<b>Als gescheitert melden?</b><p>Die Mission wird beendet. Nenne den Grund.</p><input class="mzIn" data-f="grund" placeholder="Grund" maxlength="300">' + fe + ja('GESCHEITERT MELDEN', '#ff5c5c');
        else if (s.art === 'budget') h += '<b>Budget ändern</b><p>Betrag in Euro. Leer lassen = keine Grenze. Schon gemeldete Kosten bleiben.</p><input class="mzIn" data-f="budget" inputmode="decimal" placeholder="z. B. 2,50" value="' + (m.kostenAnsicht.budgetCent === null ? '' : esc((m.kostenAnsicht.budgetCent / 100).toFixed(2).replace('.', ','))) + '">' + fe + ja('SPEICHERN');
        else if (s.art === 'beleg') h += '<b>Beleg zum Schritt</b><p>Ohne Beleg gilt ein Schritt nicht als erledigt. Schreibe, was geprüft oder geliefert wurde.</p><select class="mzIn" data-f="art">' + Object.keys(BELEG).map(k => '<option value="' + k + '">' + BELEG[k] + '</option>').join('') + '</select><textarea class="mzIn" data-f="text" rows="3" maxlength="2000" placeholder="Was wurde geprüft oder geliefert?"></textarea><input class="mzIn" data-f="ref" maxlength="300" placeholder="Verweis, Link oder Dateiname (freiwillig)">' + fe + ja('ALS ERLEDIGT BELEGEN', '#3ee6b0');
        else if (s.art === 'sfehler') h += '<b>Fehler beim Schritt</b><input class="mzIn" data-f="grund" maxlength="300" placeholder="Was ist schiefgegangen?">' + fe + ja('FEHLER MELDEN', '#ff5c5c');
        else if (s.art === 'skip') h += '<b>Schritt überspringen</b><p>Ein Grund ist Pflicht. Der Schritt zählt dann als bewusst übersprungen, nicht als erledigt.</p><input class="mzIn" data-f="grund" maxlength="300" placeholder="Grund">' + fe + ja('ÜBERSPRINGEN');
        return h + '</div>';
    }

    /* ---------- Ansichten ---------- */
    function kopf(links, mitte, chip, farbe) {
        return '<div class="mzTop"><button class="mzZurueck" data-mk="' + links[0] + '" data-a="">‹ ' + links[1] + '</button><b>' + mitte + '</b>' + (chip ? '<span class="mzChip" style="color:' + farbe + '">' + chip + '</span>' : '<span></span>') + '</div>';
    }
    function meldungen() {
        const st = K().status();
        let h = '';
        if (st.speicherFehler) h += '<div class="mzBanner rot">⚠ ' + esc(st.speicherFehler) + '</div>';
        if (st.ladeStatus === 'defekt' || st.ladeStatus === 'gesichert') h += '<div class="mzBanner gelb">⚠ Gespeicherte Missionen waren beschädigt. ' + (st.ladeStatus === 'gesichert' ? 'Der letzte gute Stand wurde wiederhergestellt.' : 'Es wurde leer gestartet; die beschädigten Daten sind gesichert.') + '</div>';
        if (st.verworfen) h += '<div class="mzBanner gelb">⚠ ' + st.verworfen + ' ungültige Mission(en) beim Laden verworfen.</div>';
        if (ui.meldung) h += '<div class="mzBanner blau">' + esc(ui.meldung) + '</div>';
        return h;
    }
    function listeHtml() {
        const alle = K().liste().sort((a, b) => (ENDE.indexOf(a.status) >= 0 ? 1 : 0) - (ENDE.indexOf(b.status) >= 0 ? 1 : 0) || b.erstellt - a.erstellt);
        const lauf = alle.filter(m => m.status === 'laeuft').length, wart = alle.filter(m => m.status === 'wartet_freigabe').length;
        let h = kopf(['zu', 'Menü'], 'MISSIONSZENTRALE', lauf ? lauf + ' LÄUFT' : wart ? wart + ' WARTET' : '', lauf ? FARBE.laeuft : FARBE.wartet_freigabe) + '<h1>Alle Missionen</h1>' +
            '<div class="mzSub">' + alle.length + ' gespeichert' + (lauf ? ' · ' + lauf + ' läuft' : '') + (wart ? ' · ' + wart + ' wartet auf dich' : '') + '</div>' + meldungen() +
            '<button class="mzNeu" data-mk="neu" data-a="">＋ NEUE MISSION</button>';
        if (!alle.length) h += '<div class="mzLeer">Noch keine Mission. Tippe auf „Neue Mission“.</div>';
        alle.forEach(m => {
            h += '<button class="mzMK" data-mk="oeffne" data-a="' + esc(m.id) + '">' + miniRing(m) + '<span class="mzTx"><b>' + esc(m.titel) + '</b><span style="color:' + FARBE[m.status] + '">' + NAME[m.status] + '</span>' +
                '<small>' + belegteSchritte(m) + ' von ' + m.schritte.length + ' Schritten belegt</small></span><span class="mzR"><b data-lz="' + esc(m.id) + '">' + dauer(m.zeiten.aktivMs) + '</b>aktiv</span></button>';
        });
        return h;
    }
    function neuHtml() {
        return kopf(['liste', 'Zentrale'], 'NEUE MISSION') + '<h1>Neue Mission</h1>' + meldungen() +
            '<div class="mzForm"><label>Titel<input class="mzIn" data-f="titel" maxlength="120" placeholder="z. B. Wochenbericht prüfen"></label>' +
            '<label>Auftrag<textarea class="mzIn" data-f="auftrag" rows="4" maxlength="4000" placeholder="Was soll erreicht werden?"></textarea></label>' +
            '<label>Schritte (einer pro Zeile, höchstens 30)<textarea class="mzIn" data-f="schritte" rows="5" placeholder="Quellen sammeln&#10;Zahlen prüfen&#10;Bericht schreiben"></textarea></label>' +
            '<label>Budget in € (freiwillig, leer = keine Grenze)<input class="mzIn" data-f="budget" inputmode="decimal" placeholder="z. B. 1,50"></label>' +
            '<label>Schätzung in € (freiwillig, leer = keine Schätzung)<input class="mzIn" data-f="schaetzung" inputmode="decimal" placeholder="z. B. 0,40"></label>' +
            '<p class="mzSub">Die Schritte trägst du selbst ab und belegst sie. Jarvis führt in dieser Version noch keine Schritte aus.</p>' +
            '<button class="mzGross" style="--c:#3ee6b0" data-mk="anlegen" data-a="">MISSION ANLEGEN</button></div>';
    }
    function detailHtml(m) {
        const z = m.zeiten, col = FARBE[m.status];
        return kopf(['liste', 'Zentrale'], 'MISSION', NAME[m.status].length > 14 ? '' : NAME[m.status], col) + '<h1>' + esc(m.titel) + '</h1>' +
            '<div class="mzSub">angelegt ' + uhrZeit(m.erstellt) + ' · ' + m.schritte.length + ' Schritt' + (m.schritte.length === 1 ? '' : 'e') + (m.ende ? ' · beendet ' + uhrZeit(m.ende) : '') + '</div>' + meldungen() +
            ringHtml(m) + '<div class="mzStatus" style="color:' + col + '">' + NAME[m.status] + '<small>' + esc(hinweis(m)) + '</small></div>' +
            '<div class="mzKacheln"><div><i>AKTIV</i><b data-k="aktiv">' + dauer(z.aktivMs) + '</b></div><div><i>WARTEN</i><b data-k="warten">' + dauer(z.wartezeitMs) + '</b></div><div><i>PAUSE</i><b data-k="pause">' + dauer(z.pauseMs) + '</b></div><div><i>UNTERBR.</i><b data-k="unterbr">' + dauer(z.unterbrochenMs) + '</b></div></div>' +
            kostenHtml(m) + '<div class="mzKarte mzAuftrag"><i>AUFTRAG</i><div>' + esc(m.auftrag) + '</div></div>' + schritteHtml(m) +
            '<div class="mzExt"><span>🔎 Recherche</span><span>⌨ Code</span><span>📄 Dateien</span><span>👁 Vorschau</span></div><div class="mzExtT">Folgt in einer späteren Version. Noch ohne Funktion.</div>' +
            (m.status === 'laeuft' ? '<button class="mzKlein bad" style="margin:10px 16px 0" data-mk="sheet" data-a="gescheitert|' + esc(m.id) + '">Als gescheitert melden</button>' : '') +
            '<div class="mzLog"><i>VERLAUF</i>' + m.log.slice(-8).reverse().map(l => '<div><small>' + uhrZeit(l.zeit) + '</small> ' + esc(l.ereignis) + (l.text ? ' · ' + esc(l.text) : '') + '</div>').join('') + '</div><div style="height:96px"></div>' +
            '<div class="mzAkt">' + knoepfe(m) + '</div>' + sheetHtml(m);
    }
    const STIL = ':root{--mzbg:#030812}' +
        '#mzRoot{position:fixed;inset:0;z-index:99999;overflow-y:auto;overflow-x:hidden;background:radial-gradient(120% 60% at 50% 12%,#0a1c36 0%,#030812 62%);color:#e6f6ff;font-family:system-ui,-apple-system,Roboto,sans-serif;font-size:16px;line-height:1.35;padding:env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0);-webkit-tap-highlight-color:transparent}' +
        ':where(#mzRoot *){margin:0}#mzRoot *{box-sizing:border-box}:where(#mzRoot button){font:inherit;cursor:pointer;color:inherit}' +
        '.mzTop{display:flex;align-items:center;justify-content:space-between;padding:16px 16px 4px;gap:8px}.mzTop b{letter-spacing:.2em;font-size:13px;color:#5ee7ff}' +
        '.mzZurueck{background:none;border:0;color:#9ab8d4;font-size:17px;min-height:48px;padding:0 6px}.mzChip{font-size:13px;font-weight:700;letter-spacing:.08em;padding:7px 12px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}' +
        '#mzRoot h1{font-size:24px;font-weight:600;padding:4px 16px 0;overflow-wrap:anywhere}.mzSub{padding:2px 16px 0;color:#9ab8d4;font-size:14px}' +
        '.mzBanner{margin:8px 16px 0;padding:10px 12px;border-radius:12px;font-size:14px}.mzBanner.rot{background:#6b1a1a}.mzBanner.gelb{background:#5c3a0a}.mzBanner.blau{background:#12304f;color:#ffe9a8}' +
        '.mzNeu{display:block;width:calc(100% - 32px);margin:14px 16px 0;min-height:60px;border-radius:16px;border:1.5px solid #5ee7ff;background:linear-gradient(90deg,rgba(58,140,255,.2),rgba(94,231,255,.1));color:#5ee7ff;font-weight:700;letter-spacing:.08em;font-size:17px}' +
        '.mzLeer{padding:24px 16px;color:#9ab8d4}.mzMK{display:flex;align-items:center;gap:12px;width:calc(100% - 32px);margin:10px 16px 0;padding:12px;min-height:84px;text-align:left;background:rgba(22,48,79,.42);border:1px solid #17375c;border-radius:16px}' +
        '.mzMini{width:62px;height:62px;flex:none}.mzTx{display:flex;flex-direction:column;min-width:0;flex:1}.mzTx b{font-size:17px;overflow-wrap:anywhere}.mzTx span{font-size:13px;font-weight:700;letter-spacing:.06em}.mzTx small{color:#9ab8d4;font-size:13px}' +
        '.mzR{margin-left:auto;text-align:right;font-size:13px;color:#9ab8d4}.mzR b{display:block;font:600 17px ui-monospace,Menlo,monospace;color:#e6f6ff}' +
        '.mzRing{position:relative;width:min(300px,76vw);aspect-ratio:1;margin:10px auto 0}.mzRing svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}' +
        '.mzMitte{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.mzKugel{width:44%;height:auto;aspect-ratio:1;margin-top:-12%;filter:drop-shadow(0 0 8px var(--c))}' +
        '.mzUhr{font:600 clamp(24px,8vw,32px) ui-monospace,Menlo,monospace;letter-spacing:.03em;font-variant-numeric:tabular-nums;margin-top:2px}.mzUhrT{font-size:12px;letter-spacing:.2em;color:#9ab8d4}' +
        '.mzStatus{text-align:center;margin-top:8px;font-size:21px;font-weight:700;letter-spacing:.16em;padding:0 16px}.mzStatus small{display:block;font-size:14px;letter-spacing:0;font-weight:400;color:#b4cbe0;margin-top:4px}' +
        '.mzKacheln{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;padding:12px 16px 0}.mzKacheln div{background:rgba(22,48,79,.45);border:1px solid #17375c;border-radius:12px;padding:8px 4px;text-align:center}' +
        '.mzKacheln i,.mzAuftrag i,.mzLog i{display:block;font-style:normal;font-size:11px;letter-spacing:.1em;color:#9ab8d4}.mzKacheln b{font:600 16px ui-monospace,Menlo,monospace}' +
        '.mzKarte{margin:10px 16px 0;background:rgba(22,48,79,.4);border:1px solid #17375c;border-radius:14px;padding:12px 14px}.mzZeile{display:flex;justify-content:space-between;align-items:baseline;gap:8px;font-size:15px}.mzZeile small{color:#9ab8d4;font-size:13px}' +
        '.mzBalken{height:8px;border-radius:9px;background:#0d2240;margin:8px 0 6px;overflow:hidden}.mzBalken i{display:block;height:100%;background:linear-gradient(90deg,#3a8cff,#5ee7ff)}.mzBalken.ueber i{background:linear-gradient(90deg,#ffb347,#ff7a47)}' +
        '.mzWarn{color:#ffb347}.mzHinweis{font-size:13px;color:#ffb347;margin-top:4px}.mzAuftrag div{font-size:15px;overflow-wrap:anywhere;white-space:pre-wrap;margin-top:2px}' +
        '.mzSchritt{display:flex;gap:10px;align-items:center;padding:8px 0;border-top:1px solid #12304f}.mzSchritt:first-child{border-top:0}.mzPunkt{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;flex:none;border:2px solid}' +
        '.mzST{min-width:0;flex:1}.mzST b{display:block;font-size:16px;font-weight:600;overflow-wrap:anywhere}.mzST small{font-size:13px}.mzD{font:13px ui-monospace,Menlo,monospace;color:#9ab8d4}' +
        '.mzBeleg{font-size:13px;color:#3ee6b0;padding:0 0 6px 36px;overflow-wrap:anywhere}.mzFehlerT{font-size:13px;color:#ff9a9a;padding:0 0 6px 36px}.mzGrundT{font-size:13px;color:#ffd27a;padding:0 0 6px 36px}.mzSB{display:flex;flex-wrap:wrap;gap:8px;padding:0 0 8px 36px}' +
        '.mzKlein{min-height:44px;padding:8px 14px;border-radius:12px;border:1px solid #5ee7ff;background:rgba(10,28,54,.8);color:#5ee7ff;font-size:14px;margin-top:8px}.mzKlein.ok{border-color:#3ee6b0;color:#3ee6b0}.mzKlein.bad{border-color:#ff5c5c;color:#ff8a8a}.mzSB .mzKlein{margin-top:0}' +
        '.mzExt{display:flex;gap:6px;padding:12px 16px 0}.mzExt span{flex:1;text-align:center;font-size:12px;color:#5d7893;border:1px dashed #1b3556;border-radius:10px;padding:8px 2px}.mzExtT{padding:4px 16px 0;font-size:12px;color:#5d7893}' +
        '.mzLog{margin:12px 16px 0;font-size:13px;color:#9ab8d4}.mzLog div{padding:2px 0;overflow-wrap:anywhere}' +
        '.mzAkt{position:fixed;left:0;right:0;bottom:0;display:flex;gap:10px;padding:14px 16px calc(16px + env(safe-area-inset-bottom,0));background:linear-gradient(0deg,#030812 72%,transparent);z-index:2}' +
        '.mzGross{flex:1;min-height:58px;border-radius:16px;border:1.5px solid var(--c);background:rgba(10,28,54,.9);color:var(--c);font-weight:700;letter-spacing:.06em;font-size:16px}.mzForm .mzGross{width:100%;flex:none;margin-top:6px}' +
        '.mzForm{padding:8px 16px 40px;display:flex;flex-direction:column;gap:12px}.mzForm label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:#b4cbe0}' +
        '.mzIn{width:100%;min-height:48px;padding:10px 12px;border-radius:12px;border:1px solid #1f4570;background:#06142a;color:#e6f6ff;font:inherit;font-size:16px}.mzIn:focus{outline:2px solid #5ee7ff}' +
        '.mzSheetBg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:3}.mzSheet{position:fixed;left:0;right:0;bottom:0;z-index:4;max-height:88vh;overflow-y:auto;background:#07162c;border-top:2px solid #1f4570;border-radius:22px 22px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom,0));display:flex;flex-direction:column;gap:10px}' +
        '.mzSheet b{font-size:19px}.mzSheet p{font-size:15px;color:#b4cbe0}.mzSheetB{display:flex;gap:10px;margin-top:4px}.mzSheetFehler{color:#ff9a9a;font-size:14px}' +
        /* Bewegung: nur mit .an, Pause bei unsichtbarer App (.pause), keine bei reduzierter Bewegung (.ruhe) */
        '@keyframes mzSp{to{transform:rotate(360deg)}}@keyframes mzAtm{0%,100%{opacity:1}50%{opacity:.3}}@keyframes mzPuls{0%,100%{opacity:.85}50%{opacity:.4}}@keyframes mzWarnP{0%,100%{opacity:1}50%{opacity:.45}}' +
        '@keyframes mzBurst{0%{transform:scale(.55);opacity:.95;stroke-width:6}100%{transform:scale(1.28);opacity:0;stroke-width:1}}@keyframes mzAktR{0%{transform:scale(.88);opacity:.2}40%{opacity:1}100%{transform:scale(1);opacity:1}}' +
        '@keyframes mzAktT{0%{opacity:0;transform:translateY(8px)}20%,75%{opacity:1;transform:none}100%{opacity:0}}@keyframes mzZu{from{stroke-dashoffset:60}to{stroke-dashoffset:0}}@keyframes mzHaken{0%{transform:scale(.7);opacity:.4}60%{transform:scale(1.18)}100%{transform:scale(1);opacity:1}}' +
        '.mzBurst,.mzAktText{display:none}.mzSweepG{opacity:0}.mzSpin1,.mzSpin2,.mzSweepG,.mzMiniDreh{transform-origin:150px 150px;transform-box:view-box}.mzMiniDreh{transform-origin:31px 31px}' +
        '#mzRoot.an .mzRing[data-z=geplant] .mzGlow{animation:mzAtm 4s ease-in-out infinite}' +
        '#mzRoot.an .mzRing[data-z=laeuft] .mzSpin1{animation:mzSp 70s linear infinite}#mzRoot.an .mzRing[data-z=laeuft] .mzSpin2{animation:mzSp 40s linear infinite reverse}' +
        '#mzRoot.an .mzRing[data-z=laeuft] .mzSweepG{opacity:1;animation:mzSp 9s linear infinite}#mzRoot.an .mzRing[data-z=laeuft] .mzGlow{animation:mzPuls 3s ease-in-out infinite}#mzRoot.an .mzRing[data-z=laeuft] .mzLauf{animation:mzPuls 2s ease-in-out infinite}' +
        '#mzRoot.an .mzRing[data-z=wartet_freigabe] .mzGlow{animation:mzAtm 3.2s ease-in-out infinite}#mzRoot.an .mzRing[data-z=pausiert] .mzGlow{animation:mzAtm 7s ease-in-out infinite}' +
        '#mzRoot.an .mzRing[data-z=fehlgeschlagen] .mzGlow{animation:mzWarnP 2.4s ease-in-out infinite}' +
        '#mzRoot.an .mzMK .mzMini[data-z=laeuft] .mzMiniDreh{animation:mzSp 14s linear infinite}' +
        '#mzRoot.an .mzRing.akt{animation:mzAktR 1.5s ease-out}#mzRoot.an .mzRing.akt .mzBurst{display:block;animation:mzBurst 1.4s ease-out;transform-origin:150px 150px;transform-box:view-box}' +
        '#mzRoot .mzRing.akt .mzAktText{display:block;position:absolute;left:0;right:0;bottom:-4px;text-align:center;font-size:13px;font-weight:700;letter-spacing:.24em;color:var(--c)}#mzRoot.an .mzRing.akt .mzAktText{animation:mzAktT 1.7s ease-out forwards}' +
        '#mzRoot.an .mzRing.fertig .mzLauf,#mzRoot.an .mzRing.fertig svg{animation:mzHaken .9s ease-out}' +
        '#mzRoot.pause *{animation-play-state:paused!important}#mzRoot.ruhe *{animation:none!important;transition:none!important}';

    /* ---------- Zeichnen ---------- */
    function aktuelleMission() { return ui.id ? K().hole(ui.id) : null; }
    function html() {
        if (!K()) return '';
        if (ui.ansicht === 'neu') return neuHtml();
        if (ui.ansicht === 'detail') { const m = aktuelleMission(); if (m) return detailHtml(m); ui.ansicht = 'liste'; ui.id = null; ui.sheet = null; }
        return listeHtml();
    }
    function klassen() { if (wurzel) wurzel.className = (bewegungAus ? 'ruhe' : 'an') + (sichtbar ? '' : ' pause'); }
    function zeichne() {
        if (!wurzel) return;
        const oben = wurzel.scrollTop;
        wurzel.innerHTML = html();
        wurzel.scrollTop = oben;
        klassen();
        kugelStart();
    }
    function tick() {   // jede Sekunde: Lebenszeichen an den Kern; Zahlen aus den echten Zeitstempeln
        const k = K(); if (!k) return;
        k.herzschlag();
        if (!sichtbar || !wurzel || !wurzel.querySelectorAll) return;
        if (ui.ansicht === 'detail' && ui.id) {
            const z = k.zeiten(ui.id); if (!z) return;
            const set = (n, t) => { const e = wurzel.querySelector('[data-k="' + n + '"]'); if (e) e.textContent = t; };
            set('haupt', hms(z.aktivMs)); set('aktiv', dauer(z.aktivMs)); set('warten', dauer(z.wartezeitMs)); set('pause', dauer(z.pauseMs)); set('unterbr', dauer(z.unterbrochenMs));
            wurzel.querySelectorAll('[data-sd]').forEach(e => { const [s, d] = e.getAttribute('data-sd').split('|').map(Number); e.textContent = dauer(d + Math.max(0, Date.now() - s)); });
        } else if (ui.ansicht === 'liste') {
            wurzel.querySelectorAll('[data-lz]').forEach(e => { const z = k.zeiten(e.getAttribute('data-lz')); if (z) e.textContent = dauer(z.aktivMs); });
        }
    }

    /* ---------- Kugelbild (Kopie der vorhandenen Kugel, keine zweite Instanz) ---------- */
    function kugelBild() {
        const c = document.getElementById('mzKugel'); if (!c || !c.getContext) return;
        const x = c.getContext('2d'), q = document.getElementById('jarvisSphere');
        x.clearRect(0, 0, c.width, c.height);
        if (q && q.width) { try { x.drawImage(q, 0, 0, c.width, c.height); return; } catch (e) { } }
        x.strokeStyle = '#5ee7ff'; x.globalAlpha = .5; x.beginPath(); x.arc(c.width / 2, c.height / 2, c.width * .28, 0, 7); x.stroke(); x.globalAlpha = 1;   // Ersatz, falls die Kugel fehlt
    }
    let letztesBild = 0;
    function kugelSchritt(ts) {
        schleife = 0;
        if (!wurzel || ui.ansicht !== 'detail' || !bewegungErlaubt()) return;
        if (!ts || ts - letztesBild >= 30) { letztesBild = ts || 0; kugelBild(); }   // etwa 30 Bilder pro Sekunde reichen (auch auf 120-Hz-Bildschirmen)
        schleife = window.requestAnimationFrame(kugelSchritt);
    }
    function kugelStart() {
        if (ui.ansicht !== 'detail') { kugelStopp(); return; }
        kugelBild();   // immer ein Standbild (auch bei reduzierter Bewegung)
        if (!schleife && bewegungErlaubt() && window.requestAnimationFrame) schleife = window.requestAnimationFrame(kugelSchritt);   // höchstens EINE Schleife
    }
    function kugelStopp() { if (schleife && window.cancelAnimationFrame) window.cancelAnimationFrame(schleife); schleife = 0; }

    /* ---------- Aktionen ---------- */
    function ergebnis(r) {
        ui.meldung = r && !r.ok ? r.fehler : (r && r.warnung ? r.warnung : (r && r.angehalten ? 'Budget erreicht: Die Mission wartet auf deine Freigabe.' : ''));
        return r;
    }
    function aktivierung() {
        ui.akt = true;
        if (aktTimer) clearTimeout(aktTimer);
        aktTimer = setTimeout(() => { aktTimer = 0; ui.akt = false; zeichne(); }, 1800);
    }
    function aktion(a, arg, werte) {
        const k = K(); if (!k) return null;
        werte = werte || {}; arg = arg || '';
        const [id, sid] = String(arg).split('|');
        let r = null;
        if (a === 'zu') { schliessen(); return null; }
        if (a === 'liste') { ui.ansicht = 'liste'; ui.id = null; ui.sheet = null; ui.meldung = ''; }
        else if (a === 'neu') { ui.ansicht = 'neu'; ui.meldung = ''; }
        else if (a === 'oeffne') { ui.ansicht = 'detail'; ui.id = arg; ui.sheet = null; ui.meldung = ''; ui.fertigAnim = false; }
        else if (a === 'anlegen') {
            const b = parseEuro(werte.budget), s = parseEuro(werte.schaetzung);
            if (Number.isNaN(b) || Number.isNaN(s)) r = { ok: false, fehler: 'Beträge bitte als Euro-Zahl eintragen, zum Beispiel 1,50.' };
            else {
                const schritte = String(werte.schritte || '').split('\n').map(t => t.trim()).filter(Boolean).map(t => ({ titel: t }));
                r = k.neu({ titel: werte.titel, auftrag: werte.auftrag, schritte: schritte, budgetCent: b, geschaetztCent: s });
                if (r.ok) { ui.ansicht = 'detail'; ui.id = r.mission.id; }
            }
            ergebnis(r);
        }
        else if (a === 'start') { r = ergebnis(k.starten(id)); if (r.ok) aktivierung(); }
        else if (a === 'pause') r = ergebnis(k.pausieren(id));
        else if (a === 'weiter') r = ergebnis(k.fortsetzen(id));
        else if (a === 'ende') { r = ergebnis(k.abschliessen(id)); if (r.ok) ui.fertigAnim = true; }
        else if (a === 'sstart') r = ergebnis(k.schrittStarten(id, sid));
        else if (a === 'sheet') { const [art, i2, s2] = String(arg).split('|'); ui.sheet = { art: art, id: i2, sid: s2 || '', fehler: '' }; }
        else if (a === 'zu2') ui.sheet = null;
        else if (a === 'ok2') {   // Bestätigung im Fenster: erst jetzt wird gehandelt
            const sh = ui.sheet; if (!sh) return null;
            let e = null;
            if (sh.art === 'abbr') e = k.abbrechen(sh.id, werte.grund);
            else if (sh.art === 'weg') e = k.entfernen(sh.id);
            else if (sh.art === 'gescheitert') e = k.fehlschlagen(sh.id, werte.grund);
            else if (sh.art === 'sfehler') e = k.schrittFehler(sh.id, sh.sid, werte.grund);
            else if (sh.art === 'skip') e = k.schrittUeberspringen(sh.id, sh.sid, werte.grund);
            else if (sh.art === 'beleg') e = k.schrittErledigt(sh.id, sh.sid, { art: werte.art, text: werte.text, ref: werte.ref });
            else if (sh.art === 'budget') { const b = parseEuro(werte.budget); e = Number.isNaN(b) ? { ok: false, fehler: 'Bitte als Euro-Zahl eintragen, zum Beispiel 2,50.' } : k.budgetSetzen(sh.id, b); }
            else if (sh.art === 'frei') {
                const b = parseEuro(werte.budget);
                e = Number.isNaN(b) ? { ok: false, fehler: 'Bitte als Euro-Zahl eintragen, zum Beispiel 1,50.' } : k.freigeben(sh.id, b === null ? {} : { budgetCent: b });
            }
            r = e;
            if (e && e.ok) { ui.sheet = null; ui.meldung = e.warnung || ''; if (sh.art === 'weg') { ui.ansicht = 'liste'; ui.id = null; } }
            else if (sh) sh.fehler = e ? e.fehler : 'Das hat nicht geklappt.';
        }
        zeichne();
        return r;
    }
    function lese() {   // Eingabefelder des Fensters oder Formulars einsammeln
        const w = {}; if (!wurzel || !wurzel.querySelectorAll) return w;
        wurzel.querySelectorAll('[data-f]').forEach(e => { w[e.getAttribute('data-f')] = e.value; });
        return w;
    }
    function klick(ev) {
        const b = ev.target && ev.target.closest && ev.target.closest('[data-mk]'); if (!b) return;
        try { if (window.playUiBeep) window.playUiBeep(); } catch (e) { }
        aktion(b.getAttribute('data-mk'), b.getAttribute('data-a') || '', lese());
    }

    /* ---------- Öffnen und Schließen ---------- */
    function bewegungPruefen() { try { bewegungAus = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch (e) { bewegungAus = false; } }
    function sichtbarPruefen() { sichtbar = !(typeof document !== 'undefined' && document.hidden); }
    function oeffnen() {
        if (!K() || wurzel) return;
        bewegungPruefen(); sichtbarPruefen();
        ui.ansicht = 'liste'; ui.id = null; ui.sheet = null; ui.meldung = ''; ui.akt = false; ui.fertigAnim = false;
        stilEl = document.createElement('style'); stilEl.id = 'mzStil'; stilEl.textContent = STIL; document.head.appendChild(stilEl);
        wurzel = document.createElement('div'); wurzel.id = 'mzRoot';
        wurzel.addEventListener('click', klick);
        document.body.appendChild(wurzel);
        hoerer = function (art, id) { if (art === 'entfernt' && id === ui.id) { ui.ansicht = 'liste'; ui.id = null; ui.sheet = null; } zeichne(); };   // Änderungen von außen (zum Beispiel ein anderes Werkzeug) erscheinen sofort
        K().an(hoerer);
        visHoerer = function () { sichtbarPruefen(); klassen(); if (sichtbar) { zeichne(); } else kugelStopp(); };
        document.addEventListener('visibilitychange', visHoerer);
        try { mq = window.matchMedia('(prefers-reduced-motion: reduce)'); mqHoerer = function () { bewegungPruefen(); klassen(); if (bewegungAus) kugelStopp(); kugelStart(); }; if (mq.addEventListener) mq.addEventListener('change', mqHoerer); } catch (e) { mq = null; }
        takt = setInterval(tick, 1000);
        zeichne();
    }
    function schliessen() {
        if (takt) { clearInterval(takt); takt = null; }
        kugelStopp();
        if (aktTimer) { clearTimeout(aktTimer); aktTimer = 0; }
        if (hoerer && K()) K().ab(hoerer); hoerer = null;
        if (visHoerer) { document.removeEventListener('visibilitychange', visHoerer); visHoerer = null; }
        try { if (mq && mqHoerer && mq.removeEventListener) mq.removeEventListener('change', mqHoerer); } catch (e) { } mq = null; mqHoerer = null;
        if (wurzel) { wurzel.remove(); wurzel = null; }
        if (stilEl) { stilEl.remove(); stilEl = null; }
        ui.sheet = null; ui.akt = false;
    }
    window.missionMenu = oeffnen;
    /* Kurskorrektur nach M2: Die Bedienung läuft allein über die Jarvis-Sprachoberfläche mit der Kugel. Der Menüpunkt
       „Missionszentrale“ ist deshalb ausgeblendet. Der Code bleibt (nichts gelöscht, Missionsdaten unberührt); mit
       MENUE_SICHTBAR = true erscheint der Punkt wieder. window.missionMenu() bleibt als Entwickler-Zugang erhalten. */
    const MENUE_SICHTBAR = false;
    try {
        if (MENUE_SICHTBAR && window.jvChain) window.jvChain.use('buildMenuPanel', 'mission', function (next) {
            const r = next();
            try {
                if (r && typeof r.html === 'string' && r.html.indexOf('missionMenu') < 0) {
                    const btnH = '<button class="panel-row w-full flex items-center gap-3 text-left bg-black/60 border border-[rgba(73,215,255,.2)] rounded-lg p-3 mb-2" style="--i:14" onclick="playUiBeep(); closePanel(); window.missionMenu()">' +
                        '<span class="text-2xl">🛰️</span><span class="flex-1"><b class="block text-[#49d7ff] text-sm">Missionszentrale</b><span class="text-xs text-slate-400">Lange Aufträge mit Uhr, Status, Schritten und Kosten</span></span><span class="text-[#49d7ff]">›</span></button>';
                    if (r.html.indexOf('<!--post-->') >= 0) r.html = r.html.replace('<!--post-->', btnH + '<!--post-->');
                    else { const m = r.html.match(/<button[^>]*openPanel\('planer'\)/); r.html = m ? r.html.replace(m[0], btnH + m[0]) : r.html.replace(/<\/div>\s*$/, btnH + '</div>'); }
                }
            } catch (e) { console.error('Mission Menü', e); }
            return r;
        }, 100);
    } catch (e) { }
    window.jvMissionAnsicht = {
        oeffnen: oeffnen, schliessen: schliessen, aktion: aktion, html: html,
        _zustand: () => ui, _laeuft: () => ({ takt: !!takt, schleife: !!schleife, offen: !!wurzel }), _setSicht: function (s) { sichtbar = !!s; klassen(); if (!sichtbar) kugelStopp(); else kugelStart(); }, _setBewegungAus: function (b) { bewegungAus = !!b; klassen(); if (bewegungAus) kugelStopp(); else kugelStart(); },
        _dauer: dauer, _hms: hms, _esc: esc, _euro: euro, _parseEuro: parseEuro, _farbe: FARBE, _name: NAME
    };
})();
