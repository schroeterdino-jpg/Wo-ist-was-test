/* ============================================================
   ERGEBNISSE: Bundesliga-Ergebnisse als Fenster, nach Spieltag (OpenLigaDB, kostenlos, kein Schlüssel, direkt aus dem Browser).
   Sagen:
     "Zeig mir die Bundesliga-Ergebnisse" / "Ergebnisse vom Spieltag" / "Wie ist der Spieltag ausgegangen"  -> aktueller Spieltag
     "Ergebnisse vom letzten Spieltag" / "vorletzten Spieltag" / "nächsten Spieltag" / "Ergebnisse vom 5. Spieltag"
     "2. Bundesliga Ergebnisse" / "zweite Liga Ergebnisse"
     "Wie hat der HSV am letzten Spieltag gespielt?" / "Wie hat Bayern am 5. Spieltag gespielt?"  -> nur das Spiel dieses Teams, gesprochen
   Im Fenster: Pfeile für den Spieltag davor und danach, Umschalter 1. und 2. Bundesliga. Läuft ein Spiel, aktualisiert sich das Fenster jede Minute.
   Die Tabelle und "Wie hat der HSV gespielt?" (aktueller Spieltag, localcommands.js) bleiben unverändert.
   Braucht: extrafenster.js (openExtraWindow), commands.js (jvCommands), localcommands.js (BUNDESLIGA_TEAM_ALIASES), voice.js (speak). Muss danach geladen werden.
   ============================================================ */
(function () {
    'use strict';

    var API = 'https://api.openligadb.de';
    var MAX_GRUPPE = 34;

    function saison() {
        try { if (typeof bundesligaSeasonYear === 'function') return bundesligaSeasonYear(); } catch (e) {}
        var d = new Date(); return (d.getMonth() + 1) >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function sag(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    function ligaName(l) { return l === 'bl2' ? '2. Bundesliga' : 'Bundesliga'; }
    function norm(t) { return String(t || '').toLowerCase().replace(/[.,!?;:"„“”]/g, ' ').replace(/\s+/g, ' ').trim(); }

    /* ---------- Daten ---------- */
    function holen(url) {
        return fetch(url).then(function (r) { if (!r.ok) throw new Error('Status ' + r.status); return r.json(); });
    }
    function aktuelleGruppe(liga) {
        return holen(API + '/getcurrentgroup/' + liga).then(function (g) { return Number(g && g.groupOrderID) || 1; });
    }
    function spieltag(liga, gruppe) {
        return holen(API + '/getmatchdata/' + liga + '/' + saison() + '/' + gruppe).then(function (a) { return Array.isArray(a) ? a : []; });
    }

    /* Zustand und Ergebnis eines Spiels: { art: 'fertig' | 'live' | 'offen', t1, t2, zeit } */
    function stand(m) {
        var ko = new Date(m.matchDateTimeUTC || m.matchDateTime);
        var res = null;
        if (m.matchIsFinished && Array.isArray(m.matchResults) && m.matchResults.length) {
            var r = m.matchResults.find(function (x) { return x.resultTypeID === 2; }) || m.matchResults[m.matchResults.length - 1];
            res = { a: r.pointsTeam1, b: r.pointsTeam2 };
        }
        if (m.matchIsFinished) return { art: 'fertig', erg: res, ko: ko };
        if (ko <= new Date()) {
            var a = 0, b = 0;
            if (Array.isArray(m.goals) && m.goals.length) { var l = m.goals[m.goals.length - 1]; a = l.scoreTeam1 || 0; b = l.scoreTeam2 || 0; }
            else if (Array.isArray(m.matchResults) && m.matchResults.length) { var q = m.matchResults[m.matchResults.length - 1]; a = q.pointsTeam1; b = q.pointsTeam2; }
            return { art: 'live', erg: { a: a, b: b }, ko: ko };
        }
        return { art: 'offen', erg: null, ko: ko };
    }
    function kurz(n) { return String(n || '').replace(/^(?:1\.\s*)?FC\s+/, '').replace(/^Borussia\s+/, 'Bor. ').replace(/^1\.\s*/, ''); }
    function fertig(liste) { return liste.length > 0 && liste.every(function (m) { return stand(m).art === 'fertig'; }); }
    function begonnen(liste) { return liste.some(function (m) { return stand(m).art !== 'offen'; }); }

    /* Der Spieltag, auf den sich "aktuell" bezieht: der letzte, der schon Ergebnisse hat */
    function bezug(liga) {
        return aktuelleGruppe(liga).then(function (cur) {
            return spieltag(liga, cur).then(function (liste) {
                if (begonnen(liste) || cur <= 1) return { gruppe: cur, liste: liste };
                return spieltag(liga, cur - 1).then(function (v) { return { gruppe: cur - 1, liste: v }; });
            });
        });
    }

    /* ---------- Fenster ---------- */
    var fenster = null;   // { body, liga, gruppe, timer }
    function tagKopf(d) { return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' }); }
    function uhr(d) { return d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }); }

    function zeile(m) {
        var s = stand(m), icon = function (t) { return t && t.teamIconUrl ? '<img src="' + esc(t.teamIconUrl) + '" style="width:20px;height:20px;object-fit:contain;flex:none" onerror="this.remove()">' : '<span style="width:20px;flex:none"></span>'; };
        var mitte, farbe = '#e2e8f0';
        if (s.art === 'offen') { mitte = uhr(s.ko); farbe = '#7fb8cf'; }
        else { mitte = s.erg ? (s.erg.a + ' : ' + s.erg.b) : '–'; if (s.art === 'live') farbe = '#ff9a44'; }
        var badge = s.art === 'live' ? '<div style="text-align:center;font-size:10px;color:#ff9a44;letter-spacing:.1em">● LÄUFT</div>' : '';
        return '<div style="background:rgba(0,0,0,.55);border:1px solid ' + (s.art === 'live' ? 'rgba(255,154,68,.55)' : 'rgba(93,209,255,.15)') + ';border-radius:10px;padding:8px 10px;margin-top:6px">' +
            '<div style="display:flex;align-items:center;gap:8px;font-size:13px">' +
            icon(m.team1) + '<span style="flex:1;min-width:0;text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(kurz(m.team1 && m.team1.teamName)) + '</span>' +
            '<span style="flex:none;min-width:58px;text-align:center;font-weight:700;color:' + farbe + '">' + esc(mitte) + '</span>' +
            '<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(kurz(m.team2 && m.team2.teamName)) + '</span>' + icon(m.team2) +
            '</div>' + badge + '</div>';
    }

    function zeichne(liga, gruppe, liste) {
        if (!fenster) return;
        var sorted = liste.slice().sort(function (a, b) { return stand(a).ko - stand(b).ko; });
        var html = '', tag = '';
        sorted.forEach(function (m) {
            var k = tagKopf(stand(m).ko);
            if (k !== tag) { tag = k; html += '<div style="margin-top:12px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:#7fb8cf">' + esc(k) + '</div>'; }
            html += zeile(m);
        });
        if (!sorted.length) html = '<p style="color:#7fb8cf">Zu diesem Spieltag liegen noch keine Spiele vor.</p>';
        var knopf = 'border:1px solid rgba(93,209,255,.4);border-radius:8px;background:#0a1621;color:#49d7ff;font:700 14px ui-monospace,monospace;padding:6px 12px;cursor:pointer';
        var aktiv = function (l) { return knopf + (liga === l ? ';background:#0e3a52' : ''); };
        fenster.body.innerHTML =
            '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between">' +
            '<button data-a="zurueck" style="' + knopf + '" aria-label="Spieltag davor">◀</button>' +
            '<div style="text-align:center;font-weight:700;color:#e2e8f0">' + esc(gruppe + '. Spieltag') + '<div style="font-size:11px;color:#7fb8cf;font-weight:400">' + esc(ligaName(liga)) + ' · Saison ' + saison() + '/' + String(saison() + 1).slice(2) + '</div></div>' +
            '<button data-a="weiter" style="' + knopf + '" aria-label="Spieltag danach">▶</button></div>' +
            '<div style="display:flex;gap:8px;margin-top:10px"><button data-a="bl1" style="' + aktiv('bl1') + ';flex:1">1. Liga</button><button data-a="bl2" style="' + aktiv('bl2') + ';flex:1">2. Liga</button></div>' +
            html;
        fenster.body.querySelectorAll('button[data-a]').forEach(function (b) {
            b.addEventListener('click', function () {
                var a = b.getAttribute('data-a');
                if (a === 'zurueck') laden(fenster.liga, Math.max(1, fenster.gruppe - 1));
                else if (a === 'weiter') laden(fenster.liga, Math.min(MAX_GRUPPE, fenster.gruppe + 1));
                else if (a === 'bl1' || a === 'bl2') bezug(a).then(function (r) { laden(a, r.gruppe, r.liste); }).catch(function () { laden(a, 1); });
            });
        });
        // Läuft ein Spiel: jede Minute neu laden, solange das Fenster offen ist
        clearInterval(fenster.timer);
        if (liste.some(function (m) { return stand(m).art === 'live'; })) {
            var body = fenster.body;
            fenster.timer = setInterval(function () {
                if (!fenster || fenster.body !== body || !document.body.contains(body)) { clearInterval(this); return; }
                spieltag(fenster.liga, fenster.gruppe).then(function (l) { if (fenster && fenster.body === body) zeichne(fenster.liga, fenster.gruppe, l); }).catch(function () {});
            }, 60000);
        }
    }

    function laden(liga, gruppe, vorgeladen) {
        if (!fenster) return Promise.resolve();
        fenster.liga = liga; fenster.gruppe = gruppe;
        var p = vorgeladen ? Promise.resolve(vorgeladen) : spieltag(liga, gruppe);
        if (!vorgeladen) fenster.body.insertAdjacentHTML('afterbegin', '<p style="color:#7fb8cf;margin:0 0 8px">Lade Spieltag …</p>');
        return p.then(function (l) { zeichne(liga, gruppe, l); return l; })
            .catch(function () { if (fenster) fenster.body.innerHTML = '<p style="color:#ff9a44">Die Ergebnisse konnte ich gerade nicht abrufen.</p>'; return []; });
    }

    function oeffnen(liga, gruppe, liste) {
        if (typeof window.openExtraWindow !== 'function') return false;
        var body = window.openExtraWindow('⚽ ' + ligaName(liga) + ' – Ergebnisse', '<p style="color:#7fb8cf">Lade Spieltag …</p>');
        if (fenster) clearInterval(fenster.timer);
        fenster = { body: body, liga: liga, gruppe: gruppe, timer: null };
        laden(liga, gruppe, liste);
        return true;
    }

    /* Kurzer Sprechtext: nur Spiele mit Ergebnis oder laufend */
    function vorlesen(liga, gruppe, liste) {
        var teile = liste.slice().sort(function (a, b) { return stand(a).ko - stand(b).ko; }).map(function (m) {
            var s = stand(m); if (s.art === 'offen' || !s.erg) return null;
            return kurz(m.team1.teamName) + ' ' + s.erg.a + ' zu ' + s.erg.b + ' ' + kurz(m.team2.teamName) + (s.art === 'live' ? ' (läuft noch)' : '');
        }).filter(Boolean);
        if (!teile.length) return gruppe + '. Spieltag der ' + ligaName(liga) + ': Es gibt noch keine Ergebnisse, die Spiele stehen aus.';
        return gruppe + '. Spieltag der ' + ligaName(liga) + ': ' + teile.join('. ') + '.';
    }

    /* ---------- Sprachbefehl ---------- */
    function team(t) {
        var al = (typeof BUNDESLIGA_TEAM_ALIASES === 'object' && BUNDESLIGA_TEAM_ALIASES) || {};
        var ks = Object.keys(al).sort(function (a, b) { return b.length - a.length; });
        for (var i = 0; i < ks.length; i++) { if (new RegExp('(?:^|[^a-zäöüß])' + ks[i].replace(/\./g, '\\.') + '(?![a-zäöüß])').test(t)) return al[ks[i]]; }
        return null;
    }
    function auswerten(t) {
        if (t.length > 90 || /tabelle|rangliste/.test(t)) return null;
        var liga = /(?:2\.\s*bundesliga|zweite[nr]?\s*liga|2\.\s*liga)/.test(t) ? 'bl2' : 'bl1';
        var spielt = /(?:wie hat|wie haben|wie hatte|wann spielt|wann spielen|gespielt)/.test(t);
        var nr = (t.match(/(?:spieltag|runde)\s*(\d{1,2})/) || t.match(/(\d{1,2})\.?\s*(?:spieltag|runde)/));
        var absolut = nr ? Math.max(1, Math.min(MAX_GRUPPE, Number(nr[1]))) : null;
        var rel = null;
        if (/vorvorletzt/.test(t)) rel = 'vorvorletzter';
        else if (/vorletzt/.test(t)) rel = 'vorletzter';
        else if (/letzt\w*\s+(?:spieltag|woche|runde)|vergangen\w*\s+(?:spieltag|woche)|letztes wochenende|vorherig\w*\s+spieltag/.test(t)) rel = 'letzter';
        else if (/(?:n[äa]chst\w*|kommend\w*|folgend\w*)\s+(?:spieltag|runde)/.test(t)) rel = 'naechster';
        var tm = team(t);
        var wortLiga = /(bundesliga|liga|fußball|fussball|spieltag)/.test(t);
        var wortErg = /(ergebnis|spieltag|ausgegangen|spielergebnis|spiele\b|resultat)/.test(t);
        if (tm) {
            // Mit Team nur dann zuständig, wenn ein anderer Spieltag gemeint ist; sonst bleibt localcommands.js dran
            if (!(absolut || rel) || !(spielt || wortErg)) return null;
            return { art: 'team', team: tm, liga: liga, absolut: absolut, rel: rel };
        }
        if (!(wortLiga && wortErg) && !/^(?:zeig(?: mir)? )?(?:die )?(?:aktuellen? )?(?:fußball|fussball|bundesliga)[ -]?ergebnisse/.test(t)) return null;
        return { art: 'liste', liga: liga, absolut: absolut, rel: rel };
    }

    function gruppeBestimmen(a) {
        return bezug(a.liga).then(function (r) {
            if (a.absolut) return spieltag(a.liga, a.absolut).then(function (l) { return { gruppe: a.absolut, liste: l }; });
            var letzter = fertig(r.liste) ? r.gruppe : Math.max(1, r.gruppe - 1);
            var g = r.gruppe;
            if (a.rel === 'letzter') g = letzter;
            else if (a.rel === 'vorletzter') g = Math.max(1, letzter - 1);
            else if (a.rel === 'vorvorletzter') g = Math.max(1, letzter - 2);
            else if (a.rel === 'naechster') g = Math.min(MAX_GRUPPE, r.gruppe + 1);
            if (g === r.gruppe) return r;
            return spieltag(a.liga, g).then(function (l) { return { gruppe: g, liste: l }; });
        });
    }

    function ausfuehren(a) {
        gruppeBestimmen(a).then(function (r) {
            if (a.art === 'liste') {
                if (!oeffnen(a.liga, r.gruppe, r.liste)) { sag('Das Fenster steht gerade nicht zur Verfügung.'); return; }
                sag(vorlesen(a.liga, r.gruppe, r.liste));
                return;
            }
            // Team: Spiel dieses Teams am gewünschten Spieltag, in beiden Ligen suchen (Auf- und Absteiger)
            var treffer = function (liste) { return liste.find(function (m) { return (m.team1 && m.team1.teamName.indexOf(a.team) >= 0) || (m.team2 && m.team2.teamName.indexOf(a.team) >= 0); }); };
            var hit = treffer(r.liste);
            if (hit) { sag(satz(hit, a.liga, r.gruppe)); return; }
            var andere = a.liga === 'bl1' ? 'bl2' : 'bl1';
            gruppeBestimmen({ liga: andere, absolut: a.absolut, rel: a.rel }).then(function (r2) {
                var h2 = treffer(r2.liste);
                sag(h2 ? satz(h2, andere, r2.gruppe) : 'Zu diesem Team habe ich an dem Spieltag kein Spiel gefunden.');
            });
        }).catch(function () { sag('Die Ergebnisse konnte ich gerade nicht abrufen.'); });
    }
    function satz(m, liga, gruppe) {
        var s = stand(m), tag = tagKopf(s.ko), h = m.team1.teamName, g = m.team2.teamName, l = ligaName(liga);
        if (s.art === 'fertig' && s.erg) return h + ' gegen ' + g + ' (' + l + ', ' + gruppe + '. Spieltag) endete ' + s.erg.a + ' zu ' + s.erg.b + ', gespielt am ' + tag + '.';
        if (s.art === 'live') return h + ' gegen ' + g + ' läuft gerade, es steht ' + s.erg.a + ' zu ' + s.erg.b + '.';
        return h + ' gegen ' + g + ' (' + l + ', ' + gruppe + '. Spieltag) findet statt am ' + tag + ' um ' + uhr(s.ko) + ' Uhr.';
    }

    function register() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('ergebnisse', function (text, next) {
            try { var a = auswerten(norm(text)); if (a) { ausfuehren(a); return true; } } catch (e) { console.warn('Ergebnisse:', e); }
            return next(text);
        }, 60);
        return true;
    }
    var n = 0; (function r() { if (!register() && n++ < 40) setTimeout(r, 500); })();

    window.jvErgebnisse = { auswerten: auswerten, stand: stand, vorlesen: vorlesen, oeffnen: oeffnen };
})();
