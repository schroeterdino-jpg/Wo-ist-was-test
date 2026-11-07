/* ============================================================
   JARVIS STUDIO - ANZEIGE in der normalen Jarvis-Oberfläche (keine eigene Seite, kein Formular): eine Karte unter der Kugel mit
   Status, echter Uhr, Schritten, Live-Zeitleiste, Freigabe-Knöpfen und den Ergebnissen (Vorschau, Downloads, Quellen, Fehlermeldung).
   Alles stammt aus echten Daten (jvMission, jvStudioRegie.zeitleiste, jvStudioProjekte). Keine Prozentwerte, keine erfundenen Schritte.
   Vorschau: eigenes iframe mit sandbox="allow-scripts allow-forms allow-modals" OHNE allow-same-origin, dazu strenge Content-Security-Policy (kein Netz).
   Zeitgeber: genau einer (1 Sekunde), nur solange die Karte eine laufende Mission zeigt und die App sichtbar ist.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvStudioAnsicht) return;

    var STATUS = { geplant: ['Bereit', '#49d7ff'], laeuft: ['Läuft', '#ff9a44'], wartet_freigabe: ['Wartet auf Freigabe', '#ffbe50'], pausiert: ['Pausiert', '#9aa7b5'], abgeschlossen: ['Fertig', '#57e0a1'], fehlgeschlagen: ['Fehlgeschlagen', '#ff5c3c'], abgebrochen: ['Abgebrochen', '#9aa7b5'] };
    var zeigt = null;        // { art:'mission', id } | { art:'projekt', id }
    var el = null, takt = null, letztesHtml = '', hoerer = null, bestaetige = null, bestaetigeTimer = 0, vorschauEl = null, vorschauNachricht = null;

    function M() { return window.jvMission; }
    function P() { return window.jvStudioProjekte; }
    function R() { return window.jvStudioRegie; }
    function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    function hms(ms) { var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), r = s % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(r).padStart(2, '0'); }
    function kb(n) { return n >= 1048576 ? (n / 1048576).toFixed(1).replace('.', ',') + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
    function sichtbar() { try { return document.hidden !== true; } catch (e) { return true; } }
    function httpsLink(u) { return /^https:\/\/[^\s"'<>]+$/.test(String(u || '')) ? u : ''; }

    var STIL = '<style>#studioKarte{margin:8px 0;align-self:stretch;width:100%;min-width:0;max-width:100%;box-sizing:border-box}#studioKarte *{min-width:0;box-sizing:border-box}#studioKarte .skUnten{position:sticky;bottom:6px;z-index:3;background:rgba(10,22,33,.98);box-shadow:0 0 0 6px rgba(10,22,33,.98);border-radius:10px;margin-top:8px}#studioKarte .skUnten .skFrage{margin-top:0}#studioKarte .sk{box-sizing:border-box;width:100%;max-width:100%;overflow-wrap:anywhere;background:rgba(10,22,33,.92);border:1px solid rgba(73,215,255,.45);border-radius:14px;padding:12px;font-family:ui-monospace,monospace;color:#e2e8f0}' +
        '#studioKarte .skK{display:flex;align-items:center;gap:8px}#studioKarte h3{margin:0;font-size:14px;color:#49d7ff;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
        '#studioKarte .skChip{font-size:12px;padding:2px 8px;border-radius:999px;border:1px solid currentColor;white-space:nowrap}#studioKarte .skUhr{font-size:20px;color:#fff;margin:6px 0 2px}' +
        '#studioKarte .skKlein{font-size:12px;color:#94a3b8}#studioKarte ol,#studioKarte ul{list-style:none;margin:6px 0;padding:0}#studioKarte li{font-size:13px;padding:2px 0;display:flex;gap:6px}' +
        '#studioKarte .skZ{font-size:12px;color:#cbd5e1}#studioKarte .skZ time{color:#64748b;min-width:42px}' +
        '#studioKarte button,#studioKarte a.skB{min-height:44px;padding:0 14px;border-radius:10px;border:1px solid rgba(73,215,255,.5);background:rgba(73,215,255,.12);color:#49d7ff;font-size:14px;display:inline-flex;align-items:center;text-decoration:none;cursor:pointer}' +
        '#studioKarte button.skRot{border-color:#ff5c3c;color:#ff8a70;background:rgba(255,92,60,.1)}#studioKarte button.skGruen{border-color:#57e0a1;color:#57e0a1;background:rgba(87,224,161,.12)}' +
        '#studioKarte .skReihe>*{flex:1 1 auto;justify-content:center}#studioKarte .skReihe{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}#studioKarte .skFehler{border:1px solid #ff5c3c;border-radius:10px;padding:8px;margin-top:8px;font-size:13px;color:#ffb4a5}' +
        '#studioKarte .skFrage{border:1px solid #ffbe50;border-radius:10px;padding:8px;margin-top:8px;font-size:13px;color:#ffd98a}#studioKarte .skErg{border:1px solid rgba(87,224,161,.5);border-radius:10px;padding:8px;margin-top:8px;font-size:13px}' +
        '#studioKarte a{color:#7dd3fc;word-break:break-all}#studioVorschau{position:fixed;top:0;left:0;right:0;bottom:0;height:100vh;height:100dvh;z-index:9999;background:#0b1620;display:flex;flex-direction:column;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)}#studioVorschau header{display:flex;align-items:center;gap:8px;padding:8px 12px;color:#cbd5e1;font-size:13px}' +
        '#studioVorschau iframe{flex:1;min-height:0;border:0;background:#fff;width:100%}#studioVorschau button{min-height:44px;padding:0 16px;border-radius:10px;border:1px solid #49d7ff;background:transparent;color:#49d7ff;font-size:14px}</style>';

    /* ---------- Vollbild-Arbeitsmodus: solange ein Studio-Auftrag arbeitet, verschwindet das normale Dashboard; die Kugel und die Studio-Karte bleiben ---------- */
    var ARBEIT_CSS = 'html.jvStudioArbeit #overviewLine,html.jvStudioArbeit #uebRaster,html.jvStudioArbeit #uebGrussBox,html.jvStudioArbeit #uebUhrBox,html.jvStudioArbeit #uebEq,html.jvStudioArbeit #quickAccessList{display:none!important}' +
        'html.jvStudioArbeit #uebKopf{display:flex;justify-content:center}' +
        'html.jvStudioArbeit #studioKarte{margin:4px 0 12px}' +   // keine eigene Scroll-Box: die Seite scrollt, so bleiben Knöpfe und Text immer erreichbar
        'html.jvStudioArbeit #sec-speak{justify-content:flex-start;align-items:stretch}' +
        'html.jvStudioArbeit #uebersicht{margin-top:0;margin-bottom:0}';
    var arbeitModus = false;
    function arbeitAktiv() { var m = zeigt && zeigt.art === 'mission' && M() && M().hole(zeigt.id); return !!(m && ['geplant', 'laeuft', 'wartet_freigabe', 'pausiert'].indexOf(m.status) >= 0); }
    function arbeitModusSetzen(an) {
        if (typeof document === 'undefined' || an === arbeitModus) return;
        arbeitModus = an;
        try {
            if (an && !document.getElementById('studioArbeitCss')) { var st = document.createElement('style'); st.id = 'studioArbeitCss'; st.textContent = ARBEIT_CSS; document.head.appendChild(st); }
            document.documentElement.classList.toggle('jvStudioArbeit', an);
            if (an && window.scrollTo) window.scrollTo(0, 0);
        } catch (e) { }
    }
    function schrittZeichen(s) { return ({ erledigt: '✓', laeuft: '●', fehlgeschlagen: '✗', uebersprungen: '–', unterbrochen: '⏸', offen: '○' })[s] || '○'; }
    function ergebnisHtml(m) {
        var arb = P().arbeit.hole(m.id) || {}, pr = arb.projektId ? P().hole(arb.projektId) : null; if (!pr) return '';
        return projektHtml(pr, m.status === 'abgeschlossen');
    }
    function projektHtml(pr, kopf) {
        var h = '<div class="skErg"><b>' + esc(pr.name) + '</b> <span class="skKlein">Version ' + pr.version + '</span>';
        if (pr.ergebnis && pr.ergebnis.fazit) {
            h += '<div style="margin-top:6px">' + esc(pr.ergebnis.fazit) + '</div>';
            if ((pr.ergebnis.punkte || []).length) h += '<ul>' + pr.ergebnis.punkte.slice(0, 5).map(function (p) { return '<li>• <span>' + esc(p.aussage) + ' <span class="skKlein">[' + p.quellen.join(', ') + ']</span></span></li>'; }).join('') + '</ul>';
            if ((pr.ergebnis.unterschiede || []).length) h += '<div class="skKlein">Unterschiede: ' + esc(pr.ergebnis.unterschiede.slice(0, 2).join(' · ')) + '</div>';
            if ((pr.ergebnis.quellen || []).length) h += '<div class="skKlein" style="margin-top:6px">Quellen:</div><ol>' + pr.ergebnis.quellen.map(function (q, i) { var l = httpsLink(q.url); return '<li><span>' + (i + 1) + '.</span><span>' + (l ? '<a href="' + esc(l) + '" target="_blank" rel="noopener noreferrer">' + esc(q.titel || l) + '</a>' : esc(q.titel)) + '</span></li>'; }).join('') + '</ol>';
        }
        if (pr.dateien) h += '<div class="skKlein">' + pr.dateien.length + ' Dateien: ' + esc(pr.dateien.map(function (f) { return f.pfad; }).join(', ')) + '</div>';
        h += '<div class="skReihe">';
        if (pr.dateien) h += '<button type="button" onclick="jvStudioAnsicht.aktion(\'vorschau\',\'' + esc(pr.id) + '\')">▶ Vorschau</button><button type="button" onclick="jvStudioAnsicht.aktion(\'zip\',\'' + esc(pr.id) + '\')">⬇ Projekt (ZIP)</button>';
        if (pr.datei) h += '<button type="button" onclick="jvStudioAnsicht.aktion(\'datei\',\'' + esc(pr.id) + '\')">⬇ ' + esc(pr.datei.name) + '</button>';
        if (pr.apk && httpsLink(pr.apk.url)) h += '<a class="skB" href="' + esc(pr.apk.url) + '" target="_blank" rel="noopener noreferrer">⬇ APK (' + kb(pr.apk.bytes || 0) + ')</a>';
        else if (pr.dateien) h += '<button type="button" onclick="jvStudioAnsicht.aktion(\'apk\',\'' + esc(pr.id) + '\')">📦 APK bauen</button>';
        h += '</div>';
        if (pr.apk) h += '<div class="skKlein">Debug-APK: ohne Berechtigungen, auch ohne Internet. Zum Installieren erlaubt Android einmalig „Unbekannte Apps“ für deinen Browser.</div>';
        return h + '</div>';
    }
    /* Plan-Karte (Planungsdialog): zeigt das Konzept vor dem Bauen; Bauen nur per Knopf „Ja, bauen“ oder gesprochenem Ja */
    function planHtml() {
        var Au = window.jvStudioAuftrag, pl = Au && Au.plan && Au.plan(); if (!pl || pl.phase === 'denkt') return '';
        if (pl.phase === 'verloren') return STIL + '<div class="sk"><div class="skK"><h3>Plan verloren</h3><button type="button" aria-label="Schließen" onclick="jvStudioAnsicht.aktion(\'zu\')">✕</button></div><p>Mein Konzept für „' + esc((pl.e && pl.e.thema) || 'deinen Auftrag') + '“ ging beim Neustart verloren. Gebaut wurde nichts.</p><div class="skFrage"><b>Soll ich es mir neu überlegen?</b><div class="skReihe"><button type="button" class="skGruen" onclick="jvStudioAnsicht.aktion(\'planJa\')">Ja, neu überlegen</button><button type="button" class="skRot" onclick="jvStudioAnsicht.aktion(\'planAbbruch\')">Abbrechen</button></div></div></div>';
        var k = pl.konzept, t = '<div class="sk"><div class="skK"><h3>Plan' + (k ? ': ' + esc(k.name) : '') + '</h3><button type="button" aria-label="Schließen" onclick="jvStudioAnsicht.aktion(\'zu\')">✕</button></div>';
        if (k) {
            t += '<p><b>Stil' + (k.richtung ? ' (' + esc(k.richtung) + ')' : '') + ':</b> ' + esc(k.stil) + '</p><p><b>Farben:</b> ' + esc(k.farben) + '</p>';
            if (k.layout) t += '<p><b>Layout:</b> ' + esc(k.layout) + '</p>';
            if (k.animationen) t += '<p><b>Bewegung:</b> ' + esc(k.animationen) + '</p>';
            if (k.alternative) t += '<p><b>Zweite Richtung' + (k.alternative.richtung ? ' (' + esc(k.alternative.richtung) + ')' : '') + ':</b> ' + esc(k.alternative.stil) + ' ' + esc(k.alternative.farben) + ' <i>Sag „Richtung B“ zum Wechseln.</i></p>';
            t += '<p><b>Aufbau:</b> ' + esc((k.aufbau || []).join(' · ')) + '</p><p><b>Funktionen:</b></p><ul>' + (k.funktionen || []).map(function (f) { return '<li>' + esc(f) + '</li>'; }).join('') + '</ul>';
            t += '<p><b>Bedienung:</b> ' + esc(k.nutzbarkeit) + '</p><p><b>Warum:</b> ' + esc(k.begruendung) + '</p>';
        } else t += '<p>Ohne Konzept: Jarvis könnte den Auftrag nur direkt bauen.</p>';
        if (pl.phase === 'frage') t += '<div class="skFrage"><b>Frage:</b> ' + esc(pl.frage) + '<div>Antworte per Sprache.</div></div>';
        else t += '<div class="skUnten"><div class="skFrage"><b>Soll ich das so bauen?</b><div class="skReihe"><button type="button" class="skGruen" onclick="jvStudioAnsicht.aktion(\'planJa\')">Ja, bauen</button><button type="button" class="skRot" onclick="jvStudioAnsicht.aktion(\'planAbbruch\')">Abbrechen</button></div><div>Änderungswunsch? Einfach sagen, z. B. „Mach die Farben blau“.</div></div></div>';
        return STIL + t + '</div>';
    }
    function planNeuZeichnen() {
        var Au = window.jvStudioAuftrag, pl = Au && Au.plan && Au.plan(), offen = pl && pl.phase !== 'denkt';
        if (offen && (!zeigt || zeigt.art === 'plan')) { zeigt = { art: 'plan' }; letztesHtml = ''; zeichne(); }
        else if (!offen && zeigt && zeigt.art === 'plan') { zeigt = null; letztesHtml = ''; zeichne(); }
    }
    function html() {
        if (!zeigt) return '';
        if (zeigt.art === 'projekt') { var pr = P().hole(zeigt.id); if (!pr) return ''; return STIL + '<div class="sk"><div class="skK"><h3>' + esc(pr.name) + '</h3><button type="button" aria-label="Schließen" onclick="jvStudioAnsicht.aktion(\'zu\')">✕</button></div>' + projektHtml(pr, true) + '</div>'; }
        if (zeigt.art === 'plan') return planHtml();
        var m = M() && M().hole(zeigt.id); if (!m) return '';
        var st = STATUS[m.status] || ['?', '#9aa7b5'], z = M().zeiten(m.id) || {}, lf = m.schritte.filter(function (s) { return s.status === 'laeuft'; })[0];
        var h = STIL + '<div class="sk" role="region" aria-label="Studio-Mission"><div class="skK"><h3>' + esc(m.titel) + '</h3><span class="skChip" style="color:' + st[1] + '">' + esc(st[0]) + '</span><button type="button" aria-label="Karte schließen" onclick="jvStudioAnsicht.aktion(\'zu\')">✕</button></div>';
        h += '<div class="skUhr" aria-label="Echte Uhr">' + hms(z.aktivMs || 0) + ' <span class="skKlein">aktiv' + (z.wartezeitMs ? ' · ' + hms(z.wartezeitMs) + ' Wartezeit' : '') + (z.pauseMs ? ' · ' + hms(z.pauseMs) + ' Pause' : '') + '</span></div>';
        if (lf) h += '<div class="skKlein">Jetzt: ' + esc(lf.titel) + (lf.start ? ' (seit ' + hms(Date.now() - lf.start) + ')' : '') + '</div>';
        h += '<ol>' + m.schritte.map(function (s) { return '<li><span style="color:' + (s.status === 'erledigt' ? '#57e0a1' : s.status === 'fehlgeschlagen' ? '#ff5c3c' : s.status === 'laeuft' ? '#ff9a44' : '#64748b') + '">' + schrittZeichen(s.status) + '</span><span>' + esc(s.titel) + (s.status === 'erledigt' && s.dauerMs ? ' <span class="skKlein">' + hms(s.dauerMs) + '</span>' : '') + '</span></li>'; }).join('') + '</ol>';
        var pg = R() && m.status === 'laeuft' ? R().prognose(m.id) : null;
        if (pg) h += '<div class="skKlein">' + (pg.moeglich ? 'Schätzung: ' + esc(pg.satz) + ' Grundlage: ' + esc(pg.basis) + '.' : 'Zeitprognose noch nicht möglich: ' + esc(pg.grund || '')) + '</div>';
        var zl = R() ? R().zeitleiste(m.id).slice(-6) : [], t0 = m.gestartet || m.erstellt;
        if (zl.length) h += '<ul aria-label="Live-Zeitleiste">' + zl.map(function (e) { return '<li class="skZ"><time>+' + hms(e.zeit - t0) + '</time><span>' + esc(e.text) + '</span></li>'; }).join('') + '</ul>';
        var unten = '';
        if (m.status === 'wartet_freigabe') unten += '<div class="skFrage"><b>Freigabe nötig:</b> ' + esc(m.freigabeFuer || '') + '<div class="skReihe"><button type="button" class="skGruen" onclick="jvStudioAnsicht.aktion(\'freigeben\')">Ja, freigeben</button><button type="button" class="skRot" onclick="jvStudioAnsicht.aktion(\'ablehnen\')">Nein</button></div></div>';
        if (m.status === 'fehlgeschlagen') h += '<div class="skFehler"><b>Fehler:</b> ' + esc(m.fehlergrund || 'Unbekannt') + '</div>';
        if (m.status === 'abgebrochen' && m.abbruchgrund) h += '<div class="skKlein">Grund: ' + esc(m.abbruchgrund) + '</div>';
        if (m.status === 'pausiert' && m.unterbrochen) h += '<div class="skKlein">Die App war zwischendurch zu. Nichts läuft von selbst weiter.</div>';
        h += ergebnisHtml(m);
        var reihe = '';
        if (m.status === 'laeuft') reihe = '<button type="button" onclick="jvStudioAnsicht.aktion(\'pause\')">⏸ Pause</button>';
        if (m.status === 'pausiert') reihe = '<button type="button" class="skGruen" onclick="jvStudioAnsicht.aktion(\'weiter\')">▶ Fortsetzen</button>';
        if (['laeuft', 'pausiert', 'wartet_freigabe', 'geplant'].indexOf(m.status) >= 0) reihe += '<button type="button" class="skRot" onclick="jvStudioAnsicht.aktion(\'abbruch\')">' + (bestaetige === 'abbruch' ? 'Wirklich abbrechen?' : 'Abbrechen') + '</button>';
        if (reihe) unten += '<div class="skReihe">' + reihe + '</div>';
        if (unten) h += '<div class="skUnten">' + unten + '</div>';
        return h + '</div>';
    }
    function container() {
        if (el && el.parentNode) return el;
        if (typeof document === 'undefined') return null;
        var karten = document.getElementById('actionCards'); if (!karten || !karten.parentNode) return null;
        el = document.createElement('div'); el.id = 'studioKarte';
        karten.parentNode.insertBefore(el, karten);
        return el;
    }
    function zeichne() {
        var c = container(); if (!c) return;
        var h = html();
        arbeitModusSetzen(arbeitAktiv());
        if (h === letztesHtml) return;
        letztesHtml = h; c.innerHTML = h;
        arbeitModusSetzen(arbeitAktiv());
        c.style.display = h ? '' : 'none';
        if (!h) stopTakt(); else startTakt();
    }
    function laeuftNoch() { var m = zeigt && zeigt.art === 'mission' && M() && M().hole(zeigt.id); return !!(m && (m.status === 'laeuft' || m.status === 'wartet_freigabe')); }
    function startTakt() {
        if (takt || !laeuftNoch()) return;
        takt = setInterval(function () { if (!laeuftNoch()) { stopTakt(); zeichne(); return; } if (sichtbar()) zeichne(); }, 1000);
    }
    function stopTakt() { if (takt) { clearInterval(takt); takt = null; } }
    function anhoeren() {
        if (hoerer || !M()) return;
        hoerer = function (art, id) { if (zeigt && zeigt.art === 'mission' && (art === 'geaendert' || art === 'neu') && id === zeigt.id) { bestaetige = null; zeichne(); startTakt(); } };
        M().an(hoerer);
    }
    function zeige(mid) { zeigt = { art: 'mission', id: mid }; letztesHtml = ''; anhoeren(); zeichne(); }
    function zeigeProjekt(pid) { zeigt = { art: 'projekt', id: pid }; letztesHtml = ''; zeichne(); }
    function neuZeichnen(mid) { if (zeigt && zeigt.art === 'mission' && zeigt.id === mid) zeichne(); }

    /* ---------- Dateien ---------- */
    function laden(name, mime, u8) {
        try {
            var blob = new Blob([u8], { type: mime }), url = URL.createObjectURL(blob), a = document.createElement('a');
            a.href = url; a.download = name; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
            setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
            return true;
        } catch (e) { return false; }
    }
    function vorschau(pid) {
        var pr = P().hole(pid); if (!pr || !pr.dateien || !window.jvStudioDateien) return false;
        schliesseVorschau();
        var htm = window.jvStudioDateien.vorschauHtml(pr.dateien);
        vorschauEl = document.createElement('div'); vorschauEl.id = 'studioVorschau';
        vorschauEl.innerHTML = '<header><b style="flex:1">' + esc(pr.name) + ' – Vorschau (abgeschottet, ohne Netz)</b><button type="button" onclick="jvStudioAnsicht.aktion(\'vorschauZu\')">Schließen</button></header>';
        var fr = document.createElement('iframe');
        fr.setAttribute('sandbox', 'allow-scripts allow-forms allow-modals');   // bewusst OHNE allow-same-origin
        fr.setAttribute('referrerpolicy', 'no-referrer'); fr.setAttribute('title', 'Vorschau ' + pr.name);
        fr.srcdoc = htm;
        /* Zweite Sicherung: Navigiert die Seite trotz Link-Abfang doch weg (z. B. per Skript), meldet sie das beim Verlassen (pagehide) oder lädt der Rahmen ein zweites Mal.
           Dann wird er sofort auf die Vorschau zurückgesetzt, höchstens 3-mal; danach hält die Vorschau mit einem Hinweistext an. */
        var ladungen = 0, zurueck = 0, hin = document.createElement('div');
        hin.setAttribute('role', 'status'); hin.style.cssText = 'display:none;padding:10px 14px;background:#111;color:#fff;font-size:15px;text-align:center';
        function ruecksetzen() {
            ladungen = 0;
            if (zurueck >= 3) { try { fr.srcdoc = '<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;padding:20px">Die Seite wollte die Vorschau verlassen. Die Vorschau wurde angehalten.</body>'; } catch (e) { } zurueck = 99; return; }
            zurueck++;
            hin.textContent = 'Die Seite wollte die Vorschau verlassen. Ich habe sie zurückgesetzt.'; hin.style.display = 'block';
            setTimeout(function () { hin.style.display = 'none'; }, 4500);
            fr.srcdoc = htm;
        }
        fr.addEventListener('load', function () { ladungen++; if (ladungen > 1 && zurueck < 99) ruecksetzen(); });
        vorschauNachricht = function (ev) { if (ev && ev.source === fr.contentWindow && ev.data && ev.data.jvVorschauWeg && zurueck < 99) ruecksetzen(); };
        window.addEventListener('message', vorschauNachricht);
        vorschauEl.appendChild(hin); vorschauEl.appendChild(fr); document.body.appendChild(vorschauEl);
        return true;
    }
    function schliesseVorschau() { if (vorschauNachricht) { window.removeEventListener('message', vorschauNachricht); vorschauNachricht = null; } if (vorschauEl) { try { vorschauEl.remove(); } catch (e) { } vorschauEl = null; } }

    /* ---------- Bedienung ---------- */
    function aktion(name, arg) {
        var A = window.jvStudioAuftrag, mid = zeigt && zeigt.art === 'mission' ? zeigt.id : null, r;
        if (name === 'zu') { zeigt = null; letztesHtml = ''; stopTakt(); zeichne(); arbeitModusSetzen(false); return true; }
        if (name === 'planJa') return !!(A && A.planBestaetigen && A.planBestaetigen());
        if (name === 'planAbbruch') return !!(A && A.planAbbrechen && A.planAbbrechen());
        if (name === 'vorschau') return vorschau(arg);
        if (name === 'vorschauZu') { schliesseVorschau(); return true; }
        if (name === 'zip') { var pr = P().hole(arg); if (!pr || !pr.dateien) return false; return laden(window.jvStudioWerkzeuge.dateiname(pr.name, 'zip'), 'application/zip', window.jvStudioDateien.zip(pr.dateien)); }
        if (name === 'datei') { var p2 = P().hole(arg); if (!p2 || !p2.datei) return false; return laden(p2.datei.name, p2.datei.mime, window.jvStudioWerkzeuge.ausB64(p2.datei.b64)); }
        if (name === 'apk') { if (A) A.behandle('Mach eine APK aus ' + (P().hole(arg) ? P().hole(arg).name : 'dem Projekt')); return true; }
        if (!mid || !A) return false;
        if (name === 'pause') { r = M().pausieren(mid); }
        else if (name === 'weiter') { r = M().fortsetzen(mid); if (r.ok) A.laufen(mid); }
        else if (name === 'freigeben') { r = A.freigeben(mid, true); }
        else if (name === 'ablehnen') { r = A.freigeben(mid, false); }
        else if (name === 'abbruch') {
            if (bestaetige !== 'abbruch') { bestaetige = 'abbruch'; clearTimeout(bestaetigeTimer); bestaetigeTimer = setTimeout(function () { bestaetige = null; zeichne(); }, 5000); letztesHtml = ''; zeichne(); return true; }
            clearTimeout(bestaetigeTimer); bestaetige = null; r = M().abbrechen(mid, 'Auf deinen Wunsch abgebrochen');
        }
        letztesHtml = ''; zeichne();
        return !!(r && r.ok !== false);
    }

    window.jvStudioAnsicht = { zeige: zeige, zeigeProjekt: zeigeProjekt, neuZeichnen: neuZeichnen, planNeuZeichnen: planNeuZeichnen, aktion: aktion, html: html, schliesseVorschau: schliesseVorschau, _zustand: function () { return { zeigt: zeigt, takt: !!takt, bestaetige: bestaetige }; }, arbeitModus: function () { return arbeitModus; }, _esc: esc, _hms: hms };
})();
