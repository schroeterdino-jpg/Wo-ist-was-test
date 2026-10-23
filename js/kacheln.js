/* ============================================================
   KACHELN am Startbildschirm: drei eckige HUD-Kacheln zwischen Begrüßung und Kopf.
   Wetter | Nächster Termin | Arbeitsweg, dazu Statuszeile (Systeme online, Schicht, Datum), Linie unter dem Kopf, eckige Knöpfe unten und leuchtender Rand bei Meldung/Termin in unter 1 Stunde. Antippen: Wetterkarte / Termine / Lagebild mit der Fahrt.
   Arbeitsweg nur mit gespeicherter Arbeitsadresse (workAddress); bist du schon dort (höchstens 3 Min.), wird daraus von selbst der Heimweg; wird höchstens alle 15 Min. neu berechnet und nur bei sichtbarer Seite.
   Ein/Aus per Sprache: "Kacheln aus" / "Kacheln an". Standard: an.
   Braucht: storage.js, briefing.js (fetchWeatherData), travel.js (fetchRouteMapData), ui.js (weatherEmojiForCode). Fehlt etwas, bleibt die Kachel leer.
   ============================================================ */
(function () {
    'use strict';
    var KEY = 'helfer_kacheln';
    var terminIdx = 0, terminAt = 0, sperreBis = 0;
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
            /* Untere Leiste: vier gleich hohe eckige Knöpfe in einer Reihe, mittig */
            '#briefingBtn,#photoBtn,#photoPickBtn,#parkButton.jvk-in{box-sizing:border-box!important;height:46px!important;border-radius:0!important;border:1px solid rgba(94,231,255,.6)!important;' +
            'background:rgba(6,20,32,.95)!important;box-shadow:none!important;color:#5ee7ff;letter-spacing:.2em;display:flex;align-items:center;justify-content:center;' +
            'clip-path:polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,7px 100%,0 calc(100% - 7px))}' +
            '#briefingBtn{display:none!important}' +   /* Briefing-Knopf entfällt: das Briefing kommt von selbst (Früh- und Spätschicht) */
            '#photoBtn,#photoPickBtn,#parkButton.jvk-in{width:50px!important;padding:0!important;font-size:18px!important}' +
            '#parkButton.jvk-in{position:relative!important;left:auto!important;right:auto!important;bottom:auto!important;top:auto!important;z-index:auto!important}' +
            '#parkButton.jvk-in .pk-p{position:absolute!important;top:1px!important;right:4px!important;width:auto!important;height:auto!important;background:none!important;color:#5ee7ff!important;font:700 8px monospace!important;border-radius:0!important}' +
            '#parkButton.jvk-in.ok{border-color:#3ddc97!important}#parkButton.jvk-in.ok .pk-p{color:#3ddc97!important}' +
            '#parkButton.jvk-in.err{border-color:#ff7a7a!important}#parkButton.jvk-in.err .pk-p{color:#ff7a7a!important}' +
            '.jvk-reihe{justify-content:center;gap:8px!important}' +
            '#parkButton.jvk-in.hidden{display:none!important}' +
            /* leerer Untertitel-Kasten ausblenden */
            '#hudSubtitleBox:has(#hudSubtitleText:empty){display:none!important}' +
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
        if (terminIdx && Date.now() - terminAt > 20000) terminIdx = 0;   // nach 20 s ohne Wischen wieder der nächste Termin
        if (terminIdx >= list.length) terminIdx = terminIdx === 9999 ? list.length - 1 : 0;
        var c = list[terminIdx], d = new Date(c.isoDate);
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
        if (list.length > 1) wann += ' · ' + (terminIdx + 1) + '/' + list.length;
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
        return kachel('weg', weg.art === 'heim' ? 'Heimweg' : 'Arbeitsweg', weg.fahrtMin + (weg.stauMin ? '+' + weg.stauMin : '') + ' Min', stau ? (weg.stauMin ? 'Stau +' + weg.stauMin + ' Min' : 'Meldung') : 'frei', stau);
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
            weg = d && d.fahrtMin ? { fahrtMin: d.fahrtMin, stauMin: d.stauMin || 0, warnings: d.warnings || [], art: 'arbeit' } : null;
            // Bist du schon bei der Arbeit (höchstens 3 Minuten bis dorthin), zeigt die Kachel von selbst den Heimweg
            if (weg && weg.fahrtMin <= 3 && window.jvPlan && typeof window.jvPlan.heimAdresse === 'function') {
                var heim = ''; try { heim = window.jvPlan.heimAdresse() || ''; } catch (e) {}
                if (heim) return Promise.resolve(fetchRouteMapData(heim, null)).then(function (h) {
                    if (h && h.fahrtMin && h.fahrtMin > 3) weg = { fahrtMin: h.fahrtMin, stauMin: h.stauMin || 0, warnings: h.warnings || [], art: 'heim' };
                }).catch(function () {});
            }
        }).catch(function () { wegAt = Date.now(); }).then(function () { wegBusy = false; zeichne(); });
    }

    function statusZeichnen() {
        if (!stat) return;
        stat.classList.toggle('jvk-aus', !an());
        var sch = ''; try { sch = (window.jvSchichtHeute && window.jvSchichtHeute()) || ''; } catch (e) {}
        var dat = new Date().toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'short' }).replace(/\./g, '');
        stat.innerHTML = '<span><i>●</i> Systeme online</span><span>' + esc(sch) + '</span><span>' + esc(dat) + '</span>';
    }

    function parkInReihe() {
        var pb = document.getElementById('parkButton'), bb = document.getElementById('briefingBtn');
        if (!pb || !bb || pb.classList.contains('jvk-in')) return !!(pb && pb.classList.contains('jvk-in'));
        bb.parentNode.classList.add('jvk-reihe');
        pb.classList.add('jvk-in'); bb.parentNode.appendChild(pb);
        return true;
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
                if (weg && weg.art === 'heim' && window.jvPlan && typeof window.jvPlan.heimText === 'function') {
                    window.jvPlan.heimText(true).then(function (t) { if (t) speak(t); }).catch(function () { speak('Den Heimweg konnte ich gerade nicht berechnen.'); });
                    return;
                }
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
        box.addEventListener('click', function (e) { if (Date.now() < sperreBis) return; var b = e.target.closest('.jvk'); if (b) tippen(b.getAttribute('data-k')); });
        // Wischen auf der Termin-Kachel: nach links = nächster Termin, nach rechts = vorheriger
        var sx = 0, sy = 0, imTermin = false;
        box.addEventListener('touchstart', function (e) { var b = e.target.closest('.jvk'); imTermin = !!(b && b.getAttribute('data-k') === 'termin'); if (imTermin && e.touches[0]) { sx = e.touches[0].clientX; sy = e.touches[0].clientY; } }, { passive: true });
        box.addEventListener('touchend', function (e) {
            if (!imTermin || !e.changedTouches[0]) return; imTermin = false;
            var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
            if (Math.abs(dx) < 40 || Math.abs(dy) > Math.abs(dx) * .7) return;
            sperreBis = Date.now() + 400;
            terminIdx = terminIdx + (dx < 0 ? 1 : -1); terminAt = Date.now();
            if (terminIdx < 0) terminIdx = 9999;   // vor dem ersten: zum letzten springen (terminKachel kürzt auf Länge)
            zeichne();
            try { if (typeof playUiBeep === 'function') playUiBeep(); } catch (x) {}
        }, { passive: true });
        aktualisieren();
        if (!parkInReihe()) { var pn = 0, piv = setInterval(function () { if (parkInReihe() || ++pn > 40) clearInterval(piv); }, 250); }
        document.addEventListener('visibilitychange', aktualisieren);
        setInterval(aktualisieren, 60000);   // Termin-Anzeige nachziehen; Wetter/Weg laden selbst nur alle 15 Min.
        return true;
    }

    function befehl(text, next) {
        var t = String(text || '').toLowerCase().replace(/[.!?,]/g, '').trim();
        var md = t.match(/mund[- ]?(?:dia|di)?agnose/) ? [t, /(\baus|abschalten|ausstellen|beenden)/.test(t.replace(/mund[- ]?diagnose/, '')) ? 'aus' : 'an'] : null;
        if (md) { var mein = md[1] !== 'aus'; sd('helfer_munddiag', mein ? 'an' : 'aus'); mundDiagnose(mein); speak(mein ? 'Mund-Diagnose eingeschaltet.' : 'Mund-Diagnose ausgeschaltet.'); return true; }
        var st2 = t.match(/^(?:(?:jarvis|zane|nova)[ ]+)?(?:den )?start[- ]?(?:ton|sound|geräusch|geraeusch)(?: ?(aus|an|ausschalten|einschalten))$/);
        if (st2) { var tau = /^(aus|ausschalten)$/.test(st2[1]); try { localStorage.setItem('helfer_bootton', tau ? 'aus' : 'an'); } catch (e) {} speak(tau ? 'Der Startton ist aus.' : 'Der Startton ist an, aber nur wenn der Browser Ton ohne Tippen erlaubt.'); return true; }
        var sb = t.match(/^(?:(?:jarvis|zane|nova)[ ]+)?(?:die )?(?:start[- ]?animation|startanimation|boot[- ]?animation)(?: ?(aus|an|ausschalten|einschalten))$/);
        if (sb) {
            var baus = /^(aus|ausschalten)$/.test(sb[1]);
            try { if (window.jvBootSetzen) window.jvBootSetzen(!baus); } catch (e) {}
            speak(baus ? 'Startanimation ausgeschaltet.' : 'Startanimation eingeschaltet.');
            return true;
        }
        var u = t.match(/^(?:(?:jarvis|zane|nova)[ ]+)?(?:die )?untertitel(?: ?(aus|an|ausschalten|einschalten))$/);
        if (u) {
            var uaus = /^(aus|ausschalten)$/.test(u[1]);
            sd('helfer_untertitel', uaus ? 'aus' : 'an');
            speak(uaus ? 'Untertitel ausgeschaltet.' : 'Untertitel eingeschaltet.');
            return true;
        }
        var m = t.match(/^(?:(?:jarvis|zane|nova)[ ]+)?(?:die )?(?:kacheln|startkacheln|start-kacheln)(?: ?(aus|an|ausschalten|einschalten|ausblenden|einblenden))?$/);
        if (m && m[1]) {
            var aus = /^(aus|ausschalten|ausblenden)$/.test(m[1]);
            sd(KEY, aus ? 'aus' : 'an'); aktualisieren();
            speak(aus ? 'Kacheln ausgeblendet.' : 'Kacheln eingeblendet.');
            return true;
        }
        return next();
    }
    var mdEl = null, mdIv = 0;
    function mundDiagnose(ein) {
        if (!ein) { if (mdEl) { mdEl.remove(); mdEl = null; } clearInterval(mdIv); return; }
        if (mdEl) return;
        mdEl = document.createElement('pre');
        mdEl.style.cssText = 'position:fixed;left:4px;top:70px;z-index:2147482000;margin:0;padding:6px 8px;background:rgba(0,0,0,.78);color:#7dffb0;font:10px/1.25 ui-monospace,Menlo,monospace;pointer-events:none;max-width:60vw;white-space:pre-wrap;border:1px solid rgba(125,255,176,.4)';
        document.body.appendChild(mdEl);
        mdIv = setInterval(function () { var d = window.__jvMouthDiag; mdEl.textContent = d ? Object.keys(d).map(function (k) { return k + ': ' + d[k]; }).join('\n') : 'keine Daten (Kopf nicht aktiv?)'; }, 250);
    }
    function einhaengen() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('kacheln', befehl, 36);
        return true;
    }
    try { if (pd('helfer_munddiag', 'aus') === 'an') { if (document.body) mundDiagnose(true); else document.addEventListener('DOMContentLoaded', function () { mundDiagnose(true); }); } } catch (e) {}
    if (!einhaengen()) { var n = 0, iv = setInterval(function () { if (einhaengen() || ++n > 40) clearInterval(iv); }, 250); }
    if (!aufbauen()) document.addEventListener('DOMContentLoaded', aufbauen);
})();
