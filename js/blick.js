/* ============================================================
   BLICK AUF EINEN BLICK: eine Karte unter den Kacheln am Startbildschirm mit dem Wichtigsten zur nächsten Schicht.
   Zeigt: Schicht (heute noch aktiv, sonst die nächste), Abfahrt (mit "Frost: vorgezogen", wenn Jarvis sie vorgezogen hat), Wecker (Frühschicht; nur "Wecker" mit Haken, wenn Jarvis ihn gestellt hat, sonst "Aufstehen ... noch kein Wecker")
   und, falls vorhanden, den ersten Terminkonflikt mit der Arbeit. Antippen öffnet den Wochenüberblick.
   Aus mit "Kacheln aus" (gleiche Einstellung wie die Kacheln). Braucht: plan_ansagen.js (window.jvPlan), kacheln.js (#jvKacheln).
   ============================================================ */
(function () {
    'use strict';
    var card = null;
    var NAME = { frueh: 'Frühschicht', spaet: 'Spätschicht' };
    function P() { return window.jvPlan || null; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function hm(min) { return Math.floor(min / 60) + ':' + String(min % 60).padStart(2, '0'); }
    function an() { try { return getPersistentData('helfer_kacheln', 'an') !== 'aus'; } catch (e) { return true; } }
    function wochentag(ymd) {
        var p = ymd.split('-').map(Number);
        return new Date(Date.UTC(p[0], p[1] - 1, p[2], 12)).toLocaleDateString('de-DE', { timeZone: 'UTC', weekday: 'long' });
    }

    /* Welcher Tag wird gezeigt? Heute, solange die Schicht noch nicht vorbei ist, sonst die nächste Schicht (bis 7 Tage voraus). */
    function ziel() {
        var p = P(); if (!p) return null;
        var nu = p.jetzt(), sh = p.schichtAm(nu.ymd);
        if (sh && nu.min < p.ende(sh)) return { ymd: nu.ymd, sh: sh, heute: true, nu: nu };
        for (var i = 1; i <= 7; i++) {
            var y = p.ymdPlus(nu.ymd, i), s = p.schichtAm(y);
            if (s) return { ymd: y, sh: s, heute: false, nu: nu, tage: i };
        }
        return null;
    }

    function zeilen() {
        var p = P(), z = ziel(); if (!p || !z) return null;
        var rows = [], sh = z.sh, ende = p.ende(sh), beginn = p.beginn(sh);
        var tag = z.heute ? 'Heute' : (z.tage === 1 ? 'Morgen' : wochentag(z.ymd));
        var icon = sh === 'frueh' ? '🌅' : '🌆';
        rows.push('<div>' + icon + ' <b>' + esc(tag) + '</b> · ' + NAME[sh] + (z.heute && z.nu.min >= beginn ? ' bis ' + hm(ende) : ' ab ' + hm(beginn)) + '</div>');
        var abfZ = '', weckZ = '', weckX = '';
        var vor = p.tagVor(z.ymd), abf = p.abfahrtMin(sh) - vor;
        if (!z.heute || z.nu.min < abf) {
            if (vor > 0) abfZ = '<span class="org">❄ Abfahrt <b>' + hm(abf) + '</b> (statt ' + hm(abf + vor) + ')</span>';
            else abfZ = '🚗 Abfahrt <b>' + hm(abf) + '</b>';
        }
        if (sh === 'frueh' && !z.heute) {
            // Den echten Wecker des Handys abfragen (APK): grün nur, wenn morgen vor der Abfahrt wirklich einer klingelt (egal wer ihn gestellt hat).
            // Ohne die App (Browser, alte APK) lässt sich das nicht wissen, dann steht hier nichts.
            var wk = weckerEcht(p, z.ymd, abf);
            if (wk && wk.ok) weckZ = '<span class="grn">⏰ Wecker <b>' + hm(wk.min) + '</b> ✓</span>';
            else if (wk) weckZ = '<span class="rot">⏰ Wecker <b>' + hm(p.weckzeit() - vor) + '</b> ✗ nicht gestellt</span>';
            if (wk && wk.anderer) weckX = '<div class="rot" style="white-space:normal">Nächster Wecker: ' + esc(wk.anderer) + (wk.von ? ' · von ' + esc(wk.von) : '') + '</div>';
        }
        // Eine Zeile nur, wenn sie auf den Bildschirm passt (Wecker gestellt, kein Frost); sonst zwei Zeilen, damit nichts abgeschnitten wird
        if (abfZ && weckZ && vor === 0 && weckZ.indexOf('✓') >= 0) rows.push('<div>' + abfZ + ' · ' + weckZ + '</div>');
        else { if (abfZ) rows.push('<div>' + abfZ + '</div>'); if (weckZ) rows.push('<div>' + weckZ + '</div>'); }
        if (weckX) rows.push(weckX);
        try {
            var k = p.terminKonflikte(); if (k && k.length) rows.push('<div class="org">⚠ ' + esc(kurzKonflikt(k[0])) + '</div>'); 
        } catch (e) { }
        return rows.join('');
    }

    /* Nächster Wecker des Handys: { ok, min } wenn er am Schichttag vor der Abfahrt klingelt, { ok: false } wenn nicht, null wenn nicht abfragbar */
    function weckerEcht(p, ymd, abfMin) {
        try {
            var n = window.ZaneNative;
            if (!n || typeof n.naechsterWecker !== 'function') return null;
            var t = Number(n.naechsterWecker());   // Das Handy kann ein paar Sekunden vor der vollen Minute melden (3:29:5x): auf die nächste Minute runden
            if (!isFinite(t) || t < 0) return null;
            if (t === 0) return { ok: false };
            if (t < p.berlinMs(ymd, 0) || t > p.berlinMs(ymd, abfMin)) {
                // Es gibt einen Wecker, aber nicht zur richtigen Zeit: den nächsten zeigen, damit man sieht, was Jarvis sieht
                var w = new Date(Math.round(t / 60000) * 60000).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '');
                var von = ''; try { if (typeof n.naechsterWeckerVon === 'function') von = String(n.naechsterWeckerVon() || ''); } catch (e) { }
                return { ok: false, anderer: w, von: von };
            }
            var u = new Date(Math.round(t / 60000) * 60000).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hour12: false }).split(':');
            return { ok: true, min: Number(u[0]) * 60 + Number(u[1]) };
        } catch (e) { return null; }
    }

    /* "Dienstag um 14 Uhr KJP liegt in deiner Spätschicht (Feierabend 22 Uhr 12)" -> "Dienstag 14 Uhr KJP · Spätschicht" */
    function kurzKonflikt(t) {
        t = String(t).replace(/\s*\([^)]*\)\s*$/, '').replace(/ um (\d)/, ' $1');
        t = t.replace(/^(Montag|Dienstag|Mittwoch|Donnerstag|Freitag|Samstag|Sonntag)\b/, function (w) { return w.slice(0, 2); });
        var m = t.match(/^(.*?) liegt in deiner (\S+)/);
        return (m ? m[1] + ' · ' + m[2] : t).slice(0, 60);
    }

    function css() {
        if (document.getElementById('jvBlickCss')) return;
        var st = document.createElement('style'); st.id = 'jvBlickCss';
        st.textContent =
            '#jvBlick{width:100%;margin-top:6px;font-family:ui-monospace,Menlo,Consolas,monospace;cursor:pointer;background:linear-gradient(135deg,rgba(94,231,255,.28),rgba(94,231,255,.08));padding:1px;' +
            'clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))}' +
            '#jvBlick>div{background:rgba(4,14,24,.9);padding:5px 9px 6px;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px))}' +
            '#jvBlick .bl{font-size:7px;letter-spacing:.18em;color:#5ee7ff;text-transform:uppercase}' +
            '#jvBlick .grn{color:#4cffb0}#jvBlick .rot{color:#ff5c5c}' +
            '#jvBlick .bz{font-size:10.5px;color:#e6f6ff;margin-top:2px;line-height:1.45}#jvBlick .bz>div{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#jvBlick .bz .org{color:#ffb347}' +
            '#jvBlick.aus{display:none}';
        document.head.appendChild(st);
    }

    function zeichne() {
        if (!card) return;
        var h = null; try { h = zeilen(); } catch (e) { }
        if (!h || !an()) { card.classList.add('aus'); return; }
        card.classList.remove('aus');
        card.innerHTML = '<div><div class="bl">Blick auf einen Blick</div><div class="bz">' + h + '</div></div>';
    }

    function aufbauen() {
        var box = document.getElementById('jvKacheln');
        if (!box) return false;
        if (document.getElementById('jvBlick')) return true;
        css();
        card = document.createElement('div'); card.id = 'jvBlick'; card.className = 'aus';
        box.parentNode.insertBefore(card, box.nextSibling);
        card.addEventListener('click', function () {
            try { if (typeof playUiBeep === 'function') playUiBeep(); } catch (e) { }
            try { if (typeof window.handleLocalCommand === 'function') window.handleLocalCommand('Zeig mir den Wochenüberblick'); } catch (e) { }
        });
        zeichne();
        setInterval(zeichne, 15000);
        window.addEventListener('focus', zeichne);
        window.addEventListener('pageshow', zeichne);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) zeichne(); });
        return true;
    }
    var n = 0, iv = setInterval(function () { if (aufbauen() || ++n > 60) clearInterval(iv); }, 500);
    window.jvBlick = { zeichne: zeichne, zeilen: zeilen };
})();
