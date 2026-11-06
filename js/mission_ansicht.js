/* ============================================================
   MISSIONS-ANSICHT (Jarvis Studio, Paket M1): einfache Testansicht für den Missions-Kern (mission_kern.js).
   Bewusst schlicht: Liste, Statusfarbe, Uhr, Kosten, Schritte, Knöpfe. Keine Animation (die kommt in M2).
   Erreichbar nur über das Menü ☰ → "Missionszentrale (Test M1)". Kein Sprachbefehl, die Befehlsreihenfolge bleibt unverändert.
   Die Uhr (1 Sekunde) läuft nur, solange die Ansicht offen ist, und rechnet aus gespeicherten Zeitstempeln (nicht durch Mitzählen).
   Die Testmission ist reine Probe: Die Schritte tun nichts, die Belege sind als "Test" gekennzeichnet.
   Braucht: mission_kern.js
   ============================================================ */
(function () {
    'use strict';
    if (window.jvMissionAnsicht) return;
    const K = () => window.jvMission;
    const FARBE = { geplant: '#94a3b8', laeuft: '#22c55e', wartet_freigabe: '#f59e0b', pausiert: '#49d7ff', abgeschlossen: '#16a34a', fehlgeschlagen: '#ef4444', abgebrochen: '#a855f7' };
    const NAME = { geplant: 'Geplant', laeuft: 'Läuft', wartet_freigabe: 'Wartet auf Freigabe', pausiert: 'Pausiert', abgeschlossen: 'Abgeschlossen', fehlgeschlagen: 'Fehlgeschlagen', abgebrochen: 'Abgebrochen' };
    const SNAME = { offen: 'offen', laeuft: 'läuft', erledigt: 'erledigt', fehlgeschlagen: 'fehlgeschlagen', uebersprungen: 'übersprungen', unterbrochen: 'unterbrochen' };
    let uhr = null, meldung = '';

    function esc(t) { return String(t == null ? '' : t).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
    function dauer(ms) {
        const s = Math.floor(Math.max(0, ms) / 1000), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
        return (h ? h + ' Std ' : '') + (h || m ? m + ' Min ' : '') + r + ' Sek';
    }
    function euro(c) { return (c / 100).toFixed(2).replace('.', ',') + ' €'; }
    function btn(txt, aktion, args, farbe) {
        return '<button data-mk="' + aktion + '" data-a="' + esc(args || '') + '" style="min-height:44px;margin:3px;padding:6px 12px;border-radius:8px;border:1px solid ' + (farbe || '#49d7ff') + ';background:#0b1220;color:' + (farbe || '#49d7ff') + ';font-size:14px">' + esc(txt) + '</button>';
    }

    function missionHtml(m) {
        const z = m.zeiten, k = m.kostenAnsicht, f = FARBE[m.status];
        let h = '<div style="border:2px solid ' + f + ';border-radius:12px;padding:10px;margin:10px 0;background:#0b1220">';
        h += '<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><b style="color:#fff">' + esc(m.titel) + '</b>' +
            '<span style="background:' + f + ';color:#000;border-radius:6px;padding:2px 8px;font-weight:bold;font-size:13px;white-space:nowrap">' + NAME[m.status] + '</span></div>';
        h += '<div style="color:#cbd5e1;font-size:13px;margin:4px 0">' + esc(m.auftrag) + '</div>';
        if (m.unterbrochen) h += '<div style="color:#f59e0b;font-size:13px">⚠ Unterbrochen (App war zu). Nichts läuft von selbst weiter.</div>';
        if (m.freigabeFuer) h += '<div style="color:#f59e0b;font-size:13px">Wartet auf dich: ' + esc(m.freigabeFuer) + '</div>';
        if (m.fehlergrund) h += '<div style="color:#ef4444;font-size:13px">Grund: ' + esc(m.fehlergrund) + '</div>';
        h += '<div style="color:#e2e8f0;font-size:13px;margin:6px 0">⏱ Aktiv: <b data-uhr="' + esc(m.id) + '">' + dauer(z.aktivMs) + '</b> · Wartezeit: ' + dauer(z.wartezeitMs) +
            ' · Pause: ' + dauer(z.pauseMs) + ' · Unterbrochen: ' + dauer(z.unterbrochenMs) + ' · Gesamt: ' + dauer(z.gesamtMs) + '</div>';
        h += '<div style="color:#e2e8f0;font-size:13px;margin:6px 0">💶 Gemeldet: <b>' + euro(k.gemeldetCent) + '</b> · Geschätzt: ' + (k.geschaetztCent === null ? 'keine Schätzung' : euro(k.geschaetztCent)) +
            ' · Budget: ' + (k.budgetCent === null ? 'keine Grenze' : euro(k.budgetCent)) + (k.unbekannt ? ' · <span style="color:#f59e0b">' + k.unbekannt + ' Posten ohne bekannten Betrag</span>' : '') +
            (k.budgetUeberschritten ? ' · <span style="color:#ef4444">Budget überschritten</span>' : '') + '</div>';
        h += '<div style="margin:6px 0">';
        m.schritte.forEach(s => {
            const sf = s.status === 'erledigt' ? '#16a34a' : s.status === 'laeuft' ? '#22c55e' : s.status === 'fehlgeschlagen' ? '#ef4444' : s.status === 'unterbrochen' ? '#f59e0b' : '#94a3b8';
            h += '<div style="border-left:3px solid ' + sf + ';padding:4px 8px;margin:4px 0;font-size:13px;color:#e2e8f0"><b>' + esc(s.id) + '</b> ' + esc(s.titel) + ' <span style="color:' + sf + '">[' + SNAME[s.status] + ']</span>';
            if (s.dauerMs) h += ' <span style="color:#94a3b8">' + dauer(s.dauerMs) + '</span>';
            if (s.beleg) h += '<div style="color:#86efac">Beleg (' + esc(s.beleg.art) + '): ' + esc(s.beleg.text) + '</div>';
            if (s.fehler) h += '<div style="color:#fca5a5">Fehler: ' + esc(s.fehler) + '</div>';
            if (s.grund) h += '<div style="color:#fcd34d">Übersprungen: ' + esc(s.grund) + '</div>';
            if (m.status === 'laeuft' && (s.status === 'offen' || s.status === 'unterbrochen')) h += btn('Schritt starten', 'sstart', m.id + '|' + s.id);
            if (m.status === 'laeuft' && s.status === 'laeuft') h += btn('Erledigt (Test-Beleg)', 'sok', m.id + '|' + s.id, '#22c55e') + btn('Fehler', 'sfehl', m.id + '|' + s.id, '#ef4444');
            h += '</div>';
        });
        h += '</div><div>';
        const mo = m.moeglich;
        if (m.status === 'geplant') h += btn('▶ Start', 'start', m.id, '#22c55e');
        if (mo.indexOf('pausiert') >= 0) h += btn('⏸ Pause', 'pause', m.id);
        if (m.status === 'pausiert') h += btn('▶ Fortsetzen', 'weiter', m.id, '#22c55e');
        if (m.status === 'laeuft') h += btn('Freigabe nötig (Test)', 'frage', m.id, '#f59e0b') + btn('✔ Abschließen', 'ende', m.id, '#16a34a');
        if (m.status === 'wartet_freigabe') h += btn('Freigeben', 'frei', m.id, '#22c55e') + btn('Freigeben + Budget 1 €', 'frei1', m.id, '#22c55e');
        if (m.status === 'laeuft' || m.status === 'pausiert' || m.status === 'wartet_freigabe') {
            h += btn('+5 Cent melden', 'k5', m.id) + btn('Kosten unbekannt melden', 'kunb', m.id) + btn('Budget 10 Cent', 'b10', m.id);
        }
        if (mo.indexOf('abgebrochen') >= 0) h += btn('✖ Abbrechen', 'abbr', m.id, '#a855f7');
        if (m.status === 'laeuft') h += btn('Mission scheitert (Test)', 'scheit', m.id, '#ef4444');
        if (['abgeschlossen', 'fehlgeschlagen', 'abgebrochen'].indexOf(m.status) >= 0) h += btn('Entfernen', 'weg', m.id, '#94a3b8');
        h += '</div></div>';
        return h;
    }

    function zeichne() {
        const wurzel = document.getElementById('mkAnsicht'); if (!wurzel) return;
        const st = K().status();
        let h = '<div style="display:flex;justify-content:space-between;align-items:center"><b style="color:#49d7ff;font-size:18px">🛰️ Missionszentrale (Test M1)</b>' + btn('Schließen', 'zu', '', '#94a3b8') + '</div>';
        h += '<div style="color:#94a3b8;font-size:12px">Nur eine Testansicht. Die Schritte tun nichts; hier prüfst du Uhr, Status, Kosten und Neustart.</div>';
        if (st.speicherFehler) h += '<div style="background:#7f1d1d;color:#fff;padding:8px;border-radius:8px;margin:6px 0">⚠ ' + esc(st.speicherFehler) + '</div>';
        if (st.ladeStatus === 'defekt' || st.ladeStatus === 'gesichert') h += '<div style="background:#78350f;color:#fff;padding:8px;border-radius:8px;margin:6px 0">⚠ Gespeicherte Missionen waren beschädigt. ' +
            (st.ladeStatus === 'gesichert' ? 'Der letzte gute Stand wurde wiederhergestellt.' : 'Es wurde leer gestartet; die beschädigten Daten sind gesichert.') + '</div>';
        if (st.verworfen) h += '<div style="background:#78350f;color:#fff;padding:8px;border-radius:8px;margin:6px 0">⚠ ' + st.verworfen + ' ungültige Mission(en) beim Laden verworfen.</div>';
        if (meldung) h += '<div style="background:#1e293b;color:#fde68a;padding:8px;border-radius:8px;margin:6px 0">' + esc(meldung) + '</div>';
        h += '<div>' + btn('➕ Neue Testmission', 'neu', '', '#22c55e') + '</div>';
        const liste = K().liste().sort((a, b) => b.erstellt - a.erstellt);
        h += liste.length ? liste.map(missionHtml).join('') : '<div style="color:#94a3b8;margin:12px 0">Noch keine Mission. Tippe auf „Neue Testmission“.</div>';
        wurzel.innerHTML = h;
    }
    function nurUhr() {   // jede Sekunde: nur die Zahlen der laufenden Missionen, ohne alles neu zu zeichnen
        const k = K(); if (!k) return;
        k.herzschlag();
        document.querySelectorAll('[data-uhr]').forEach(e => { const z = k.zeiten(e.getAttribute('data-uhr')); if (z) e.textContent = dauer(z.aktivMs); });
    }
    function zeigeErgebnis(r) { meldung = r && !r.ok ? r.fehler : (r && r.warnung ? r.warnung : (r && r.angehalten ? 'Budget erreicht: Mission wartet auf Freigabe.' : '')); zeichne(); }

    function klick(ev) {
        const b = ev.target.closest && ev.target.closest('[data-mk]'); if (!b) return;
        const a = b.getAttribute('data-mk'), arg = b.getAttribute('data-a') || '', k = K();
        const [id, sid] = arg.split('|');
        try { if (window.playUiBeep) window.playUiBeep(); } catch (e) { }
        let r = null;
        if (a === 'zu') return schliessen();
        if (a === 'neu') r = k.neu({ titel: 'Testmission ' + new Date().toLocaleTimeString('de-DE'), auftrag: 'Probelauf ohne echte Arbeit. Prüft Uhr, Status, Kosten und Neustart.',
            schritte: [{ titel: 'Erster Probeschritt' }, { titel: 'Zweiter Probeschritt', abhaengigVon: ['s1'] }, { titel: 'Dritter Probeschritt', abhaengigVon: ['s2'] }] });
        else if (a === 'start') r = k.starten(id);
        else if (a === 'pause') r = k.pausieren(id);
        else if (a === 'weiter') r = k.fortsetzen(id);
        else if (a === 'frage') r = k.freigabeAnfordern(id, 'Testfreigabe: Darf es weitergehen?');
        else if (a === 'frei') r = k.freigeben(id);
        else if (a === 'frei1') r = k.freigeben(id, { budgetCent: 100 });
        else if (a === 'ende') r = k.abschliessen(id);
        else if (a === 'abbr') r = k.abbrechen(id, 'Von dir abgebrochen');
        else if (a === 'scheit') r = k.fehlschlagen(id, 'Test: Mission absichtlich als gescheitert markiert');
        else if (a === 'weg') r = k.entfernen(id);
        else if (a === 'sstart') r = k.schrittStarten(id, sid);
        else if (a === 'sok') r = k.schrittErledigt(id, sid, { art: 'test', text: 'Test-Beleg: Schritt in der Testansicht bestätigt (keine echte Arbeit).' });
        else if (a === 'sfehl') r = k.schrittFehler(id, sid, 'Test: Schritt absichtlich fehlgeschlagen');
        else if (a === 'k5') r = k.kostenMelden(id, { cent: 5, quelle: 'Testansicht' });
        else if (a === 'kunb') r = k.kostenMelden(id, { cent: null, quelle: 'Testansicht', notiz: 'Betrag unbekannt' });
        else if (a === 'b10') r = k.budgetSetzen(id, 10);
        zeigeErgebnis(r);
    }
    function oeffnen() {
        if (!K()) return;
        if (document.getElementById('mkAnsicht')) return;
        const d = document.createElement('div');
        d.id = 'mkAnsicht';
        d.setAttribute('style', 'position:fixed;inset:0;z-index:99999;overflow-y:auto;background:#050a14;color:#e2e8f0;padding:12px 12px 80px;font-family:inherit');
        d.addEventListener('click', klick);
        document.body.appendChild(d);
        meldung = '';
        zeichne();
        uhr = setInterval(nurUhr, 1000);
    }
    function schliessen() {
        if (uhr) { clearInterval(uhr); uhr = null; }
        const d = document.getElementById('mkAnsicht'); if (d) d.remove();
    }
    window.missionMenu = oeffnen;
    try {
        if (window.jvChain) window.jvChain.use('buildMenuPanel', 'mission', function (next) {
            const r = next();
            try {
                if (r && typeof r.html === 'string' && r.html.indexOf('missionMenu') < 0) {
                    const btnH = '<button class="panel-row w-full flex items-center gap-3 text-left bg-black/60 border border-[rgba(73,215,255,.2)] rounded-lg p-3 mb-2" style="--i:14" onclick="playUiBeep(); closePanel(); window.missionMenu()">' +
                        '<span class="text-2xl">🛰️</span><span class="flex-1"><b class="block text-[#49d7ff] text-sm">Missionszentrale (Test M1)</b><span class="text-xs text-slate-400">Lange Aufträge mit Uhr, Status und Kosten ausprobieren</span></span><span class="text-[#49d7ff]">›</span></button>';
                    if (r.html.indexOf('<!--post-->') >= 0) r.html = r.html.replace('<!--post-->', btnH + '<!--post-->');
                    else { const m = r.html.match(/<button[^>]*openPanel\('planer'\)/); r.html = m ? r.html.replace(m[0], btnH + m[0]) : r.html.replace(/<\/div>\s*$/, btnH + '</div>'); }
                }
            } catch (e) { console.error('Mission Menü', e); }
            return r;
        }, 100);
    } catch (e) { }
    window.jvMissionAnsicht = { oeffnen: oeffnen, schliessen: schliessen, _dauer: dauer, _esc: esc };
})();
