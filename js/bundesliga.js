/* ============================================================
   BUNDESLIGA-FENSTER: Tabelle | Spieltag | HSV - zum Wischen nach links/rechts.
   "Öffne die Bundesliga-Tabelle" -> Seite 1, "Zeig die Bundesliga-Ergebnisse" -> Seite 2, "HSV Übersicht" -> Seite 3.
   Daten: OpenLigaDB (ohne Schlüssel). Braucht: extrafenster.js (openExtraWindow), jvCommands (localcommands.js).
   Fehlt diese Datei, greifen die alten Ansichten (Tabellen-Panel, Ergebnis-Fenster) weiter.
   ============================================================ */
(function () {
    'use strict';
    var API = 'https://api.openligadb.de';
    var HSV = 'Hamburger SV';
    var st = null;

    function saison() {
        try { if (typeof bundesligaSeasonYear === 'function') return bundesligaSeasonYear(); } catch (e) {}
        var d = new Date(); return (d.getMonth() + 1) >= 7 ? d.getFullYear() : d.getFullYear() - 1;
    }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function sag(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    function holen(u) { return fetch(API + u).then(function (r) { if (!r.ok) throw new Error('S' + r.status); return r.json(); }); }
    function ligaName(l) { return l === 'bl2' ? '2. Bundesliga' : 'Bundesliga'; }
    function kurz(n) { return String(n || '').replace(/^(?:1\.\s*)?FC\s+/, '').replace(/^Borussia\s+/, 'Bor. ').replace(/^1\.\s*/, ''); }
    function istHsv(t) { return !!(t && t.teamName && t.teamName.indexOf(HSV) >= 0); }
    function hatHsv(m) { return istHsv(m.team1) || istHsv(m.team2); }

    function stand(m) {
        var ko = new Date(m.matchDateTimeUTC || m.matchDateTime), a = null, b = null;
        if (m.matchIsFinished && Array.isArray(m.matchResults) && m.matchResults.length) {
            var r = m.matchResults.find(function (x) { return x.resultTypeID === 2; }) || m.matchResults[m.matchResults.length - 1];
            a = r.pointsTeam1; b = r.pointsTeam2;
            return { art: 'fertig', a: a, b: b, ko: ko };
        }
        if (m.matchIsFinished) return { art: 'fertig', a: 0, b: 0, ko: ko };
        if (ko <= new Date()) {
            a = 0; b = 0;
            if (Array.isArray(m.goals) && m.goals.length) { var l = m.goals[m.goals.length - 1]; a = l.scoreTeam1 || 0; b = l.scoreTeam2 || 0; }
            else if (Array.isArray(m.matchResults) && m.matchResults.length) { var q = m.matchResults[m.matchResults.length - 1]; a = q.pointsTeam1; b = q.pointsTeam2; }
            return { art: 'live', a: a, b: b, ko: ko };
        }
        return { art: 'offen', a: null, b: null, ko: ko };
    }
    function tag(d) { return d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'numeric' }); }
    function uhr(d) { return d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }); }
    function icon(t, g) {
        g = g || 20;
        return t && t.teamIconUrl ? '<img src="' + esc(t.teamIconUrl) + '" style="width:' + g + 'px;height:' + g + 'px;object-fit:contain;flex:none" onerror="this.style.visibility=\'hidden\'">' : '<span style="width:' + g + 'px;flex:none"></span>';
    }

    /* ---------- Seite 1: Tabelle ---------- */
    function zone(liga, platz, n) {
        if (liga === 'bl1') { if (platz <= 4) return '#2ecc71'; if (platz === 5) return '#49d7ff'; if (platz === 16) return '#ff9a44'; if (platz > n - 2) return '#ff5a5a'; }
        else { if (platz <= 2) return '#2ecc71'; if (platz === 3) return '#8be3a8'; if (platz === 16) return '#ff9a44'; if (platz > n - 2) return '#ff5a5a'; }
        return 'transparent';
    }
    function tabelleHtml(liga, tab) {
        if (!tab.length) return '<p style="color:#ff9a44">Die Tabelle ist gerade nicht abrufbar.</p>';
        var h = '<div style="display:grid;grid-template-columns:22px 1fr 24px 38px 30px;gap:2px 6px;font-size:12px;align-items:center">' +
            '<span></span><span style="color:#7fb8cf">Verein</span><span style="color:#7fb8cf;text-align:right">Sp</span><span style="color:#7fb8cf;text-align:right">Tore</span><span style="color:#7fb8cf;text-align:right">Pkt</span>';
        tab.forEach(function (t, i) {
            var me = t.teamName && t.teamName.indexOf(HSV) >= 0;
            var bg = me ? 'background:rgba(73,215,255,.16);border-radius:6px;' : '';
            var diff = (t.goals || 0) - (t.opponentGoals || 0);
            h += '<span style="' + bg + 'border-left:3px solid ' + zone(liga, i + 1, tab.length) + ';padding:3px 0 3px 3px;text-align:center;color:#9fc4d6">' + (i + 1) + '</span>' +
                '<span style="' + bg + 'display:flex;gap:6px;align-items:center;padding:3px 0;overflow:hidden;white-space:nowrap;' + (me ? 'font-weight:700;color:#fff' : '') + '">' + icon(t, 18) + '<span style="overflow:hidden;text-overflow:ellipsis">' + esc(kurz(t.teamName)) + '</span></span>' +
                '<span style="' + bg + 'text-align:right;padding:3px 0;color:#9fc4d6">' + (t.matches || 0) + '</span>' +
                '<span style="' + bg + 'text-align:right;padding:3px 0;color:#9fc4d6">' + (diff > 0 ? '+' : '') + diff + '</span>' +
                '<span style="' + bg + 'text-align:right;padding:3px 4px 3px 0;font-weight:700;color:#e2e8f0">' + (t.points || 0) + '</span>';
        });
        return h + '</div><div style="margin-top:8px;font-size:11px;color:#7fb8cf">Grün: oben &nbsp;·&nbsp; Orange: Relegation &nbsp;·&nbsp; Rot: Abstieg &nbsp;·&nbsp; „Tore“ = Tordifferenz</div>';
    }
    function ladeTabelle() {
        var el = st.pages[0];
        el.innerHTML = '<p style="color:#7fb8cf">Lade Tabelle …</p>';
        return holen('/getbltable/' + st.liga + '/' + saison()).then(function (t) {
            st.tab = Array.isArray(t) ? t : [];
            if (st.pages[0] === el) el.innerHTML = tabelleHtml(st.liga, st.tab);
        }).catch(function () { el.innerHTML = '<p style="color:#ff9a44">Die Tabelle konnte ich gerade nicht abrufen.</p>'; });
    }

    /* ---------- Seite 2: Spieltag ---------- */
    function spielzeile(m) {
        var s = stand(m), me = hatHsv(m);
        var mitte = s.art === 'offen' ? '<span style="color:#9fc4d6">' + uhr(s.ko) + '</span>' :
            '<b style="' + (s.art === 'live' ? 'color:#ff5a5a' : 'color:#fff') + '">' + s.a + ' : ' + s.b + '</b>';
        return '<div style="display:grid;grid-template-columns:1fr 62px 1fr;align-items:center;gap:6px;padding:6px 6px;border-radius:8px;font-size:13px;' + (me ? 'background:rgba(73,215,255,.14);' : '') + '">' +
            '<span style="display:flex;gap:6px;align-items:center;justify-content:flex-end;text-align:right;overflow:hidden"><span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(kurz(m.team1.teamName)) + '</span>' + icon(m.team1, 18) + '</span>' +
            '<span style="text-align:center">' + mitte + (s.art === 'live' ? '<div style="font-size:9px;color:#ff5a5a">LIVE</div>' : '') + '</span>' +
            '<span style="display:flex;gap:6px;align-items:center;overflow:hidden">' + icon(m.team2, 18) + '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(kurz(m.team2.teamName)) + '</span></span></div>';
    }
    function spieltagHtml(liste) {
        if (!liste.length) return '<p style="color:#ff9a44">Für diesen Spieltag gibt es noch keine Daten.</p>';
        var s = liste.slice().sort(function (a, b) { return stand(a).ko - stand(b).ko; }), h = '', last = '';
        s.forEach(function (m) {
            var t = tag(stand(m).ko);
            if (t !== last) { h += '<div style="margin:8px 0 2px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#7fb8cf">' + esc(t) + '</div>'; last = t; }
            h += spielzeile(m);
        });
        return h;
    }
    function zeichneSpieltag() {
        var el = st.pages[1], g = st.gruppe, btn = 'border:1px solid rgba(93,209,255,.4);border-radius:8px;background:#0a1621;color:#49d7ff;font-size:16px;padding:2px 14px;cursor:pointer';
        el.innerHTML = '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px">' +
            '<button type="button" data-g="-1" style="' + btn + '">‹</button><b style="color:#e2e8f0">' + g + '. Spieltag</b><button type="button" data-g="1" style="' + btn + '">›</button></div>' +
            '<div data-liste>' + (st.spiele ? spieltagHtml(st.spiele) : '<p style="color:#7fb8cf">Lade Spieltag …</p>') + '</div>';
        el.querySelectorAll('button[data-g]').forEach(function (b) {
            b.addEventListener('click', function () {
                var n = st.gruppe + Number(b.getAttribute('data-g'));
                if (n < 1 || n > 34) return;
                st.gruppe = n; st.spiele = null; ladeSpieltag();
            });
        });
    }
    function ladeSpieltag() {
        zeichneSpieltag();
        var g = st.gruppe, liga = st.liga;
        return holen('/getmatchdata/' + liga + '/' + saison() + '/' + g).then(function (a) {
            if (!st || st.liga !== liga || st.gruppe !== g) return;
            st.spiele = Array.isArray(a) ? a : [];
            var l = st.pages[1].querySelector('[data-liste]'); if (l) l.innerHTML = spieltagHtml(st.spiele);
            plane();
        }).catch(function () {
            var l = st && st.pages[1].querySelector('[data-liste]'); if (l) l.innerHTML = '<p style="color:#ff9a44">Den Spieltag konnte ich gerade nicht abrufen.</p>';
        });
    }
    function startGruppe() {
        return holen('/getcurrentgroup/' + st.liga).then(function (g) { st.gruppe = Number(g && g.groupOrderID) || 1; }).catch(function () { st.gruppe = st.gruppe || 1; });
    }

    /* ---------- Seite 3: HSV ---------- */
    function chip(r) {
        var c = r === 'S' ? '#2ecc71' : r === 'U' ? '#e0b030' : '#ff5a5a';
        return '<span style="display:inline-block;width:26px;height:26px;line-height:26px;text-align:center;border-radius:50%;background:' + c + ';color:#06121c;font-weight:700;font-size:13px">' + r + '</span>';
    }
    function hsvHtml(liga, tab, spiele) {
        var meine = spiele.filter(hatHsv).sort(function (a, b) { return stand(a).ko - stand(b).ko; });
        if (!meine.length) return '<p style="color:#ff9a44">Zum HSV habe ich gerade keine Spiele gefunden.</p>';
        var fertige = meine.filter(function (m) { return stand(m).art === 'fertig'; });
        var live = meine.filter(function (m) { return stand(m).art === 'live'; })[0];
        var offen = meine.filter(function (m) { return stand(m).art === 'offen'; })[0];
        var h = '<div style="text-align:center;color:#7fb8cf;font-size:12px;margin-bottom:6px">' + ligaName(liga) + '</div>';
        var nxt = live || offen;
        if (nxt) {
            var s = stand(nxt), heim = istHsv(nxt.team1), gegner = heim ? nxt.team2 : nxt.team1;
            h += '<div style="border:1px solid rgba(93,209,255,.35);border-radius:12px;padding:12px;text-align:center;background:rgba(73,215,255,.07)">' +
                '<div style="font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:' + (live ? '#ff5a5a' : '#7fb8cf') + '">' + (live ? 'Läuft gerade' : 'Nächstes Spiel') + '</div>' +
                '<div style="display:flex;justify-content:center;align-items:center;gap:12px;margin:8px 0">' + icon(nxt.team1, 38) + '<b style="font-size:20px;color:#fff">' + (live ? s.a + ' : ' + s.b : 'vs') + '</b>' + icon(nxt.team2, 38) + '</div>' +
                '<div style="font-size:14px;color:#e2e8f0">' + (heim ? 'Heim gegen ' : 'Auswärts bei ') + esc(kurz(gegner.teamName)) + '</div>' +
                '<div style="font-size:12px;color:#9fc4d6;margin-top:2px">' + esc(tag(s.ko)) + ', ' + uhr(s.ko) + ' Uhr</div></div>';
        } else {
            h += '<p style="text-align:center;color:#9fc4d6">Kein weiteres Spiel in dieser Saison offen.</p>';
        }
        var platz = null, pkt = null;
        (tab || []).forEach(function (t, i) { if (istHsv(t)) { platz = i + 1; pkt = t.points; } });
        if (platz) h += '<div style="display:flex;gap:10px;margin:12px 0 6px"><div style="flex:1;text-align:center;border-radius:10px;background:#0a1621;padding:8px"><div style="font-size:22px;font-weight:700;color:#fff">' + platz + '.</div><div style="font-size:11px;color:#7fb8cf">Platz</div></div>' +
            '<div style="flex:1;text-align:center;border-radius:10px;background:#0a1621;padding:8px"><div style="font-size:22px;font-weight:700;color:#fff">' + pkt + '</div><div style="font-size:11px;color:#7fb8cf">Punkte</div></div></div>';
        var letzte = fertige.slice(-5);
        if (letzte.length) {
            var chips = letzte.map(function (m) {
                var s = stand(m), mein = istHsv(m.team1) ? s.a : s.b, geg = istHsv(m.team1) ? s.b : s.a;
                return chip(mein > geg ? 'S' : mein === geg ? 'U' : 'N');
            }).join(' ');
            h += '<div style="margin:10px 0 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#7fb8cf">Letzte ' + letzte.length + ' Spiele</div><div style="display:flex;gap:6px;margin-bottom:8px">' + chips + '</div>';
            h += letzte.slice().reverse().map(spielzeile).join('');
        }
        return h;
    }
    function ladeHsv() {
        var el = st.pages[2];
        el.innerHTML = '<p style="color:#7fb8cf">Lade HSV …</p>';
        var versuch = function (liga) {
            return Promise.all([holen('/getmatchdata/' + liga + '/' + saison()), holen('/getbltable/' + liga + '/' + saison()).catch(function () { return []; })]).then(function (r) {
                var sp = Array.isArray(r[0]) ? r[0] : [];
                if (!sp.some(hatHsv)) throw new Error('kein HSV');
                return { liga: liga, sp: sp, tab: Array.isArray(r[1]) ? r[1] : [] };
            });
        };
        return versuch(st.liga).catch(function () { return versuch(st.liga === 'bl1' ? 'bl2' : 'bl1'); }).then(function (r) {
            if (st && st.pages[2] === el) el.innerHTML = hsvHtml(r.liga, r.tab, r.sp);
        }).catch(function () { el.innerHTML = '<p style="color:#ff9a44">Den HSV konnte ich gerade nicht abrufen.</p>'; });
    }

    /* ---------- Fenster ---------- */
    var NAMEN = ['Tabelle', 'Spieltag', 'HSV'];
    function seite(n, glatt) {
        if (!st) return;
        var w = st.scroller.clientWidth;
        st.scroller.scrollTo({ left: n * w, behavior: glatt === false ? 'auto' : 'smooth' });
        markiere(n);
    }
    function markiere(n) {
        st.aktiv = n;
        st.tabs.forEach(function (b, i) {
            b.style.background = i === n ? '#0e3a52' : '#0a1621';
            b.style.color = i === n ? '#fff' : '#49d7ff';
        });
        st.dots.forEach(function (d, i) { d.style.background = i === n ? '#49d7ff' : 'rgba(93,209,255,.25)'; });
    }
    function plane() {
        if (!st) return;
        clearInterval(st.timer);
        if ((st.spiele || []).some(function (m) { return stand(m).art === 'live'; })) {
            var mein = st;
            st.timer = setInterval(function () {
                if (st !== mein || !document.getElementById('extraFensterBody') || !mein.body.isConnected) { clearInterval(mein.timer); return; }
                holen('/getmatchdata/' + mein.liga + '/' + saison() + '/' + mein.gruppe).then(function (a) {
                    if (st !== mein) return;
                    mein.spiele = Array.isArray(a) ? a : [];
                    var l = mein.pages[1].querySelector('[data-liste]'); if (l) l.innerHTML = spieltagHtml(mein.spiele);
                    if (!mein.spiele.some(function (m) { return stand(m).art === 'live'; })) { clearInterval(mein.timer); ladeTabelle(); ladeHsv(); }
                }).catch(function () {});
            }, 60000);
        }
    }

    function oeffnen(liga, seiteNr, gruppe) {
        if (typeof window.openExtraWindow !== 'function') return false;
        if (st) clearInterval(st.timer);
        var knopf = 'flex:1;border:1px solid rgba(93,209,255,.35);border-radius:8px;font-size:13px;padding:6px 4px;cursor:pointer;font-family:inherit';
        var body = window.openExtraWindow('⚽ Bundesliga',
            '<div style="display:flex;gap:6px;margin-bottom:8px">' + NAMEN.map(function (n, i) { return '<button type="button" data-t="' + i + '" style="' + knopf + '">' + n + '</button>'; }).join('') + '</div>' +
            '<div style="display:flex;gap:6px;margin-bottom:8px"><button type="button" data-l="bl1" style="' + knopf + '">1. Liga</button><button type="button" data-l="bl2" style="' + knopf + '">2. Liga</button></div>' +
            '<div data-sc style="display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;-webkit-overflow-scrolling:touch;overscroll-behavior-x:contain">' +
            [0, 1, 2].map(function () { return '<div data-p style="flex:0 0 100%;min-width:100%;box-sizing:border-box;scroll-snap-align:start;scroll-snap-stop:always;padding:0 2px"></div>'; }).join('') + '</div>' +
            '<div style="display:flex;justify-content:center;align-items:center;gap:8px;margin-top:10px"><span data-d style="width:8px;height:8px;border-radius:50%"></span><span data-d style="width:8px;height:8px;border-radius:50%"></span><span data-d style="width:8px;height:8px;border-radius:50%"></span></div>' +
            '<div style="text-align:center;font-size:11px;color:#7fb8cf;margin-top:6px">← wischen →</div>');
        st = {
            body: body, liga: liga, gruppe: gruppe || 1, spiele: null, tab: [], timer: null, aktiv: 0,
            scroller: body.querySelector('[data-sc]'), pages: [].slice.call(body.querySelectorAll('[data-p]')),
            tabs: [].slice.call(body.querySelectorAll('button[data-t]')), dots: [].slice.call(body.querySelectorAll('[data-d]'))
        };
        var me = st, tick = null;
        st.tabs.forEach(function (b, i) { b.addEventListener('click', function () { seite(i); }); });
        body.querySelectorAll('button[data-l]').forEach(function (b) {
            b.style.background = b.getAttribute('data-l') === liga ? '#0e3a52' : '#0a1621'; b.style.color = b.getAttribute('data-l') === liga ? '#fff' : '#49d7ff';
            b.addEventListener('click', function () { oeffnen(b.getAttribute('data-l'), me.aktiv); });
        });
        st.scroller.addEventListener('scroll', function () {
            clearTimeout(tick);
            tick = setTimeout(function () { var w = me.scroller.clientWidth || 1; var n = Math.round(me.scroller.scrollLeft / w); if (n !== me.aktiv && n >= 0 && n < 3) markiere(n); }, 60);
        });
        markiere(seiteNr || 0);
        setTimeout(function () { if (st === me) seite(seiteNr || 0, false); }, 0);
        ladeTabelle();
        (gruppe ? Promise.resolve() : startGruppe()).then(function () { return st === me ? ladeSpieltag() : null; });
        ladeHsv();
        return true;
    }

    /* ---------- Sprachbefehl ---------- */
    function norm(t) { return String(t || '').toLowerCase().replace(/[.,!?;:"„“”]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function team(t) {
        var al = (typeof BUNDESLIGA_TEAM_ALIASES === 'object' && BUNDESLIGA_TEAM_ALIASES) || {};
        return Object.keys(al).some(function (k) { return new RegExp('(?:^|[^a-zäöüß])' + k.replace(/\./g, '\\.') + '(?![a-zäöüß])').test(t); });
    }
    function auswerten(t) {
        if (t.length > 80) return null;
        var liga = /(?:2\.\s*bundesliga|zweite[nr]?\s*liga|2\.\s*liga)/.test(t) ? 'bl2' : 'bl1';
        if (/tabelle|rangliste|tabellenstand|tabellenplatz/.test(t) || (/wie steht/.test(t) && /bundesliga/.test(t))) return { liga: liga, seite: 0 };
        var hsv = /\bhsv\b|hamburger sv|hamburger/.test(t);
        if (hsv && /(übersicht|uebersicht|fenster|spielplan|nächsten spiele|naechsten spiele|bundesliga)/.test(t) && !/(wie hat|gespielt)/.test(t)) return { liga: liga, seite: 2 };
        if (team(t) && !hsv) return null;
        if (hsv) return null;
        var nr = t.match(/(?:spieltag|runde)\s*(\d{1,2})/) || t.match(/(\d{1,2})\.?\s*(?:spieltag|runde)/);
        if (/(bundesliga|liga|fußball|fussball|spieltag)/.test(t) && /(ergebnis|spieltag|spiele\b|resultat|spielplan)/.test(t) ||
            /^(?:zeig(?: mir)? )?(?:die )?(?:aktuellen? )?(?:fußball|fussball|bundesliga)[ -]?ergebnisse/.test(t))
            return { liga: liga, seite: 1, gruppe: nr ? Math.max(1, Math.min(34, Number(nr[1]))) : null };
        return null;
    }

    function befehl(text, next) {
        var a = auswerten(norm(text));
        if (!a) return next();
        if (typeof window.openExtraWindow !== 'function') return next();
        oeffnen(a.liga, a.seite, a.gruppe);
        sag(a.seite === 0 ? 'Hier ist die Tabelle der ' + ligaName(a.liga) + '. Wische nach links für den Spieltag und den HSV.' :
            a.seite === 1 ? 'Hier ist der Spieltag. Wische für Tabelle und HSV.' : 'Hier ist die Übersicht zum HSV.');
        return true;
    }

    function einhaengen() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('bundesliga', befehl, 40);
        return true;
    }
    if (!einhaengen()) { var n = 0, iv = setInterval(function () { if (einhaengen() || ++n > 40) clearInterval(iv); }, 250); }
    window.jvBundesliga = { oeffnen: oeffnen };
})();
