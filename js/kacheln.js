/* ============================================================
   KACHELN am Startbildschirm: drei eckige HUD-Kacheln zwischen Begrüßung und Kopf.
   Wetter | Nächster Termin | Arbeitsweg, dazu Statuszeile (Systeme online, Schicht, Datum), Linie unter dem Kopf, eckige Knöpfe unten und leuchtender Rand bei Meldung/Termin in unter 1 Stunde. Antippen: Wetterkarte / Termine / Lagebild mit der Fahrt.
   Arbeitsweg nur mit gespeicherter Arbeitsadresse (workAddress); wird höchstens alle 15 Min. neu berechnet und nur bei sichtbarer Seite.
   Ein/Aus per Sprache: "Kacheln aus" / "Kacheln an". Standard: an.
   Braucht: storage.js, briefing.js (fetchWeatherData), travel.js (fetchRouteMapData), ui.js (weatherEmojiForCode). Fehlt etwas, bleibt die Kachel leer.
   ============================================================ */
(function () {
    'use strict';
    var KEY = 'helfer_kacheln';
    var box = null, stat = null, wx = null, wxAt = 0, weg = null, wegAt = 0, wegBusy = false, wxBusy = false;

    function pd(k, d) { try { return getPersistentData(k, d); } catch (e) { return d; } }
    function sd(k, v) { try { setPersistentData(k, v); } catch (e) {} }
    function an() { return pd(KEY, 'an') !== 'aus'; }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

    function css() {
        if (document.getElementById('jvKachelnCss')) return;
        var st = document.createElement('style'); st.id = 'jvKachelnCss';
        st.textContent =
            '#jvKacheln{display:grid;grid-template-columns:1fr 1.35fr 1fr;gap:8px;width:100%;font-family:ui-monospace,Menlo,Consolas,monospace}' +
            '#jvKacheln.jvk-aus{display:none}' +
            '.jvk{background:linear-gradient(135deg,rgba(94,231,255,.28),rgba(94,231,255,.08));padding:1px;border:0;cursor:pointer;text-align:left;color:inherit;' +
            'clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px));min-width:0}' +
            '.jvk>div{background:rgba(4,14,24,.9);padding:6px 9px;height:100%;min-height:48px;clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));overflow:hidden}' +
            '.jvk-l{font-size:8px;letter-spacing:.18em;color:#5ee7ff;text-transform:uppercase;white-space:nowrap}' +
            '.jvk-l.warn{color:#ffb347}' +
            '.jvk-v{font-size:14px;color:#fff;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.jvk-s{font-size:9px;color:#9fc4d6;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}';
        st.textContent +=
            /* Untere Knöpfe + Parkknopf: eckig wie die Kacheln */
            '#briefingBtn,#photoBtn,#photoPickBtn{border-radius:0!important;border:1px solid transparent!important;' +
            'background:linear-gradient(rgba(4,14,24,.95),rgba(4,14,24,.95)) padding-box,linear-gradient(135deg,rgba(94,231,255,.5),rgba(94,231,255,.12)) border-box!important;' +
            'clip-path:polygon(0 0,calc(100% - 9px) 0,100% 9px,100% 100%,9px 100%,0 calc(100% - 9px));letter-spacing:.2em}' +
            'body #parkButton{border-radius:0!important;border:1px solid transparent!important;width:48px!important;height:48px!important;font-size:22px!important;box-shadow:none!important;' +
            'background:linear-gradient(rgba(4,14,24,.95),rgba(4,14,24,.95)) padding-box,linear-gradient(135deg,rgba(94,231,255,.6),rgba(94,231,255,.15)) border-box!important;' +
            'clip-path:polygon(0 0,calc(100% - 10px) 0,100% 10px,100% 100%,10px 100%,0 calc(100% - 10px))}' +
            'body #parkButton .pk-p{top:1px!important;right:3px!important;width:auto!important;height:auto!important;background:none!important;color:#5ee7ff!important;font-size:10px!important;border-radius:0!important}' +
            'body #parkButton.ok .pk-p{color:#3ddc97!important}body #parkButton.err .pk-p{color:#ff7a7a!important}' +
            /* Kopfzeile: dünne Linie mit Ecken */
            '.app-shell>header{position:relative}' +
            '.app-shell>header::after{content:"";position:absolute;left:16px;right:16px;bottom:0;height:7px;border-left:2px solid #5ee7ff;border-right:2px solid #5ee7ff;' +
            'background:linear-gradient(90deg,transparent,rgba(94,231,255,.7) 12%,rgba(94,231,255,.7) 88%,transparent) bottom/100% 1px no-repeat;pointer-events:none}' +
            '#jvStatus{display:flex;justify-content:space-between;align-items:center;gap:8px;width:100%;max-width:28rem;margin:0 auto;padding:6px 20px 0;font-family:ui-monospace,Menlo,Consolas,monospace;' +
            'font-size:9px;letter-spacing:.18em;color:#9fc4d6;text-transform:uppercase;box-sizing:border-box}' +
            '#jvStatus.jvk-aus{display:none}#jvStatus i{color:#5ee7ff;font-style:normal}' +
            /* sanftes Pulsieren bei Wichtigem */
            '@keyframes jvkGlow{0%,100%{filter:drop-shadow(0 0 2px rgba(255,179,71,.25))}50%{filter:drop-shadow(0 0 8px rgba(255,179,71,.85))}}' +
            '.jvk.puls{animation:jvkGlow 2.4s ease-in-out infinite}' +
            '.jvk.puls>div{box-shadow:inset 0 0 0 1px rgba(255,179,71,.55)}' +
            '@media (prefers-reduced-motion:reduce){.jvk.puls{animation:none}}';
        document.head.appendChild(st);
    }

    function kachel(id, label, wert, sub, warn) {
        return '<button type="button" class="jvk' + (warn ? ' puls' : '') + '" data-k="' + id + '"><div><div class="jvk-l' + (warn ? ' warn' : '') + '">' + esc(label) + '</div>' +
            '<div class="jvk-v">' + esc(wert) + '</div><div class="jvk-s">' + esc(sub) + '</div></div></button>';
    }

    function terminKachel() {
        var list = [];
        try { list = (calendarEntries || []).filter(function (c) { return c && c.isoDate; }); } catch (e) {}
        var jetzt = Date.now();
        list = list.filter(function (c) {
            var t = new Date(c.isoDate).getTime();
            if (isNaN(t)) return false;
            return c.allDay ? t + 86400000 > jetzt : t > jetzt - 15 * 60000;
        }).sort(function (a, b) { return new Date(a.isoDate) - new Date(b.isoDate); });
        if (!list.length) return kachel('termin', 'Termin', 'keiner', 'nichts geplant');
        var c = list[0], d = new Date(c.isoDate);
        var tag = d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        var heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        var morgen = new Date(Date.now() + 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        var zeit = c.allDay ? '' : ' ' + d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
        var wann;
        if (tag === heute) wann = 'HEUTE' + zeit;
        else if (tag === morgen) wann = 'MORGEN' + zeit;
        else {
            var wt = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short' }).replace('.', '');
            var dm = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: 'numeric', month: 'short' }).replace('.', '');
            wann = (wt + ' ' + dm).toUpperCase() + zeit;
        }
        var bald = !c.allDay && d.getTime() - jetzt < 3600000 && d.getTime() - jetzt > -15 * 60000;
        return '<button type="button" class="jvk' + (bald ? ' puls' : '') + '" data-k="termin"><div><div class="jvk-l' + (bald ? ' warn' : '') + '">' + esc(wann) + '</div><div class="jvk-v">' + esc(c.text || 'Termin') + '</div>' +
            '<div class="jvk-s">' + esc(c.location || ' ') + '</div></div></button>';
    }

    function wetterKachel() {
        if (!wx || wx.fehler) return kachel('wetter', 'Wetter', '–', 'lädt …');
        var emo = '', txt = '';
        try { emo = weatherEmojiForCode(wx.wettercode); } catch (e) {}
        try { txt = weatherCodeText(wx.wettercode); } catch (e) {}
        return kachel('wetter', 'Wetter', (emo ? emo + ' ' : '') + wx.temperatur + '°', wx.baldRegen ? 'bald Regen' : (txt || ('gefühlt ' + wx.gefuehlteTemperatur + '°')));
    }

    function wegKachel() {
        var wa = ''; try { wa = (workAddress || '').trim(); } catch (e) {}
        if (!wa) return kachel('weg', 'Arbeitsweg', '–', 'Adresse fehlt');
        if (!weg) return kachel('weg', 'Arbeitsweg', '–', wegBusy ? 'berechne …' : 'Tippen');
        var stau = weg.stauMin > 0 || (weg.warnings && weg.warnings.length);
        return kachel('weg', 'Arbeitsweg', weg.fahrtMin + (weg.stauMin ? '+' + weg.stauMin : '') + ' Min', stau ? (weg.stauMin ? 'Stau +' + weg.stauMin + ' Min' : 'Meldung') : 'frei', stau);
    }

    function zeichne() {
        if (!box) return;
        box.innerHTML = wetterKachel() + terminKachel() + wegKachel();
    }

    function sichtbar() { return !document.hidden && box && box.offsetParent !== null; }

    function ladeWetter() {
        if (wxBusy || Date.now() - wxAt < 15 * 60000 || typeof fetchWeatherData !== 'function') return;
        wxBusy = true;
        fetchWeatherData().then(function (d) { wx = d; wxAt = Date.now(); }).catch(function () {}).then(function () { wxBusy = false; zeichne(); });
    }
    function ladeWeg() {
        var wa = ''; try { wa = (workAddress || '').trim(); } catch (e) {}
        if (!wa || wegBusy || Date.now() - wegAt < 15 * 60000 || typeof fetchRouteMapData !== 'function') return;
        wegBusy = true;
        Promise.resolve(fetchRouteMapData(wa, null)).then(function (d) {
            wegAt = Date.now();
            weg = d && d.fahrtMin ? { fahrtMin: d.fahrtMin, stauMin: d.stauMin || 0, warnings: d.warnings || [] } : null;
        }).catch(function () { wegAt = Date.now(); }).then(function () { wegBusy = false; zeichne(); });
    }

    function statusZeichnen() {
        if (!stat) return;
        stat.classList.toggle('jvk-aus', !an());
        var sch = ''; try { sch = (window.jvSchichtHeute && window.jvSchichtHeute()) || ''; } catch (e) {}
        var dat = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
        stat.innerHTML = '<span><i>●</i> Systeme online</span><span>' + esc(sch) + '</span><span>' + esc(dat) + '</span>';
    }

    function aktualisieren() {
        if (!box) return;
        box.classList.toggle('jvk-aus', !an());
        statusZeichnen();
        zeichne();
        if (!an() || !sichtbar()) return;
        ladeWetter(); ladeWeg();
    }

    function tippen(k) {
        try { if (typeof playUiBeep === 'function') playUiBeep(); } catch (e) {}
        try {
            if (k === 'termin') { if (typeof openPanel === 'function') openPanel('termine'); }
            else if (k === 'wetter') { if (typeof handleWeatherMapCommand === 'function') handleWeatherMapCommand('Zeig mir die Wetterkarte'); }
            else if (k === 'weg') {
                var wa = ''; try { wa = (workAddress || '').trim(); } catch (e) {}
                if (!wa) { speak('Deine Arbeitsadresse fehlt noch. Sag zum Beispiel: Meine Arbeit ist in Hamburg, Musterstraße 1.'); return; }
                if (typeof window.computeDepartureAdvice === 'function') {
                    window.computeDepartureAdvice({ query: 'Arbeit', destination: wa, wantFuel: false }).catch(function () { speak('Die Fahrt zur Arbeit konnte ich gerade nicht berechnen.'); });
                } else if (window.jvLage) window.jvLage.open();
            }
        } catch (e) {}
    }

    function aufbauen() {
        var sec = document.getElementById('sec-speak');
        if (!sec || document.getElementById('jvKacheln')) return !!sec;
        css();
        var hd = document.querySelector('.app-shell>header');
        if (hd && !document.getElementById('jvStatus')) { stat = document.createElement('div'); stat.id = 'jvStatus'; hd.parentNode.insertBefore(stat, hd.nextSibling); }
        box = document.createElement('div'); box.id = 'jvKacheln';
        sec.insertBefore(box, sec.firstChild);
        box.addEventListener('click', function (e) { var b = e.target.closest('.jvk'); if (b) tippen(b.getAttribute('data-k')); });
        aktualisieren();
        document.addEventListener('visibilitychange', aktualisieren);
        setInterval(aktualisieren, 60000);   // Termin-Anzeige nachziehen; Wetter/Weg laden selbst nur alle 15 Min.
        return true;
    }

    function befehl(text, next) {
        var t = String(text || '').toLowerCase().replace(/[.!?,]/g, '').trim();
        var m = t.match(/^(?:(?:jarvis|zane|nova)[ ]+)?(?:die )?(?:kacheln|startkacheln|start-kacheln)(?: ?(aus|an|ausschalten|einschalten|ausblenden|einblenden))?$/);
        if (m && m[1]) {
            var aus = /^(aus|ausschalten|ausblenden)$/.test(m[1]);
            sd(KEY, aus ? 'aus' : 'an'); aktualisieren();
            speak(aus ? 'Kacheln ausgeblendet.' : 'Kacheln eingeblendet.');
            return true;
        }
        return next();
    }
    function einhaengen() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('kacheln', befehl, 36);
        return true;
    }
    if (!einhaengen()) { var n = 0, iv = setInterval(function () { if (einhaengen() || ++n > 40) clearInterval(iv); }, 250); }
    if (!aufbauen()) document.addEventListener('DOMContentLoaded', aufbauen);
})();
