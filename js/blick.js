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
        var abfZ = '', weckZ = '';
        var vor = p.tagVor(z.ymd), abf = p.abfahrtMin(sh) - vor;
        if (!z.heute || z.nu.min < abf) {
            if (vor > 0) abfZ = '<span class="org">❄ Abfahrt <b>' + hm(abf) + '</b> (statt ' + hm(abf + vor) + ')</span>';
            else abfZ = '🚗 Abfahrt <b>' + hm(abf) + '</b>';
        }
        if (sh === 'frueh' && !z.heute) {
            // Nur "Wecker" sagen, wenn Jarvis wirklich einen gestellt hat; sonst ist 3:30 nur die Aufstehzeit
            var gest = p.weckerStand ? p.weckerStand(z.ymd) : null;
            if (gest != null) weckZ = '⏰ Wecker <b>' + hm(gest) + '</b> ✓';
            else weckZ = '<span class="org">⏰ Aufstehen <b>' + hm(p.weckzeit() - vor) + '</b> · noch kein Wecker</span>';
        }
        if (abfZ || weckZ) rows.push('<div>' + [abfZ, weckZ].filter(Boolean).join(' · ') + '</div>');
        try {
            var k = p.terminKonflikte(); if (k && k.length) rows.push('<div class="org">⚠ ' + esc(String(k[0]).slice(0, 70)) + '</div>');
        } catch (e) { }
        return rows.join('');
    }

    function css() {
        if (document.getElementById('jvBlickCss')) return;
        var st = document.createElement('style'); st.id = 'jvBlickCss';
        st.textContent =
            '#jvBlick{width:100%;margin-top:6px;font-family:ui-monospace,Menlo,Consolas,monospace;cursor:pointer;background:linear-gradient(135deg,rgba(94,231,255,.28),rgba(94,231,255,.08));padding:1px;' +
            'clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))}' +
            '#jvBlick>div{background:rgba(4,14,24,.9);padding:5px 9px 6px;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px))}' +
            '#jvBlick .bl{font-size:7px;letter-spacing:.18em;color:#5ee7ff;text-transform:uppercase}' +
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
        setInterval(zeichne, 60000);
        document.addEventListener('visibilitychange', function () { if (!document.hidden) zeichne(); });
        return true;
    }
    var n = 0, iv = setInterval(function () { if (aufbauen() || ++n > 60) clearInterval(iv); }, 500);
    window.jvBlick = { zeichne: zeichne, zeilen: zeilen };
})();
