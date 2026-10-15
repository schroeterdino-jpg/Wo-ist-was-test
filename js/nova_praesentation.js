/* PRÄSENTATION (TikTok-Version): Nova stellt sich in ca. 60 Sekunden mit 10 Highlights vor (Gesicht bleibt oben frei) (für Bildschirmaufnahmen, hochkant).
   - Start per Sprache: "Stell dich vor", "Präsentation", "Starte die Präsentation", "Präsentation starten", "TikTok Präsentation".
   - Abbrechen: zweimal schnell auf den Bildschirm tippen.
   - Zu jedem Highlight steht groß, was du sagst (Sprechblase mit Mikrofon, getippt wie gesprochen), danach zeigt und sagt Nova die Antwort.
   - Alles ist ausgedacht (Max Mustermann, Beispielrechnung), es werden KEINE echten Daten angezeigt oder gelesen.
   - Die 10 Highlights: Humor, Rechnung, Kündigung, Glatteis-Alarm, Dolmetscher, Stau-Check, Mail vorlesen, Route/Sprit/Radar, drei Ansichten, Aufruf.
   - Die Beispielrechnung liegt in ./beispielrechnung.jpg.
   Nutzt nur: speak(text, callback, sprache), window.jvAvatar3D, window.jvAnsicht, window.jvCommands. */
(function () {
    'use strict';

    var laeuft = false, abbruch = false, root = null, gen = 0, letzterTipp = 0;

    var CSS = '' +
        '#jvPraes{position:fixed;left:0;right:0;bottom:0;height:56vh;z-index:99990;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:0 16px calc(18px + env(safe-area-inset-bottom));' +
        'background:linear-gradient(to top,rgba(2,10,18,.96) 62%,rgba(2,10,18,.0));color:#dff6ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none}' +
        '#jvPraes *{box-sizing:border-box}' +
        '#jvPraes .pz-cap{width:100%;max-width:520px;text-align:center;font-size:19px;line-height:1.35;font-weight:600;letter-spacing:.2px;min-height:52px;margin-bottom:12px;text-shadow:0 0 14px rgba(73,215,255,.55);opacity:0;transition:opacity .35s}' +
        '#jvPraes .pz-cap.an{opacity:1}' +
        '#jvPraes .pz-stage{position:relative;width:100%;max-width:520px;height:27vh;min-height:176px}' +
        '#jvPraes .pz-cmd{width:100%;max-width:520px;min-height:46px;margin-bottom:8px;padding:7px 14px;border:1.5px solid rgba(255,255,255,.55);border-radius:28px;background:rgba(18,64,98,.82);box-shadow:0 0 22px rgba(0,190,255,.35);font-size:19px;line-height:1.2;font-weight:700;color:#fff;display:flex;align-items:center;gap:12px;opacity:0;transform:translateY(12px) scale(.97);transition:opacity .3s,transform .3s}' +
        '#jvPraes .pz-cmd.an{opacity:1;transform:none}#jvPraes .pz-cmd .pz-ic{font-size:24px;animation:pzbeat .9s ease-in-out infinite;flex:none}#jvPraes .pz-cmd .pz-car{display:inline-block;width:2px;height:1.1em;background:#49d7ff;margin-left:3px;vertical-align:-3px;animation:pzblink .6s steps(2) infinite}@keyframes pzblink{50%{opacity:0}}' +
        '#jvPraes .pz-card{position:absolute;inset:0;border:1px solid rgba(73,215,255,.55);border-radius:16px;background:rgba(6,24,38,.88);box-shadow:0 0 28px rgba(0,190,255,.28),inset 0 0 22px rgba(0,190,255,.08);padding:0;opacity:0;transform:translateY(26px) scale(.97);transition:opacity .45s,transform .45s;overflow:hidden}' +
        '#jvPraes .pz-in{position:absolute;left:0;top:0;right:0;bottom:0;padding:14px 16px}' +
        '#jvPraes .pz-card.an{opacity:1;transform:none}' +
        '#jvPraes .pz-card.weg{opacity:0;transform:translateY(-18px) scale(.97)}' +
        '#jvPraes .pz-kopf{font:700 13px/1 ui-monospace,Menlo,monospace;letter-spacing:2.5px;color:#49d7ff;margin-bottom:6px;text-transform:uppercase}' +
        '#jvPraes .pz-zeile{display:flex;align-items:center;gap:10px;font-size:15.5px;line-height:1.3;padding:5px 0;opacity:0;transform:translateX(-14px);transition:opacity .4s,transform .4s}' +
        '#jvPraes .pz-zeile.an{opacity:1;transform:none}' +
        '#jvPraes .pz-zeile b{color:#7ff0ff}' +
        '#jvPraes .pz-gross{font-size:56px;font-weight:800;letter-spacing:10px;text-align:center;margin-top:34px;color:#eaffff;text-shadow:0 0 22px #00c8ff,0 0 48px #0090ff}' +
        '#jvPraes .pz-klein{text-align:center;font:600 12px ui-monospace,Menlo,monospace;letter-spacing:4px;color:#49d7ff;margin-top:8px}' +
        '#jvPraes .pz-fz{display:flex;gap:14px;align-items:flex-start}#jvPraes .pz-foto{position:relative;flex:0 0 36%;height:128px;border-radius:8px;background:#000 center/contain no-repeat;border:1px solid rgba(255,255,255,.35);overflow:hidden}' +
        '#jvPraes .pz-scan{position:absolute;left:0;right:0;height:3px;background:#49d7ff;box-shadow:0 0 14px 4px rgba(73,215,255,.9);top:0;opacity:0}' +
        '#jvPraes .pz-scan.an{opacity:1;animation:pzscan 1.5s ease-in-out 2}' +
        '@keyframes pzscan{0%{top:0}50%{top:calc(100% - 3px)}100%{top:0}}' +
        '#jvPraes .pz-rechts{flex:1;min-width:0}' +
        '#jvPraes .pz-flag{display:inline-block;padding:2px 8px;border:1px solid #49d7ff;border-radius:6px;font:700 12px ui-monospace,Menlo,monospace;color:#49d7ff;margin-right:6px}' +
        '#jvPraes .pz-gruen{color:#5dffa8}#jvPraes .pz-rot{color:#ff7a7a}#jvPraes .pz-gelb{color:#ffd166}' +
        '#jvPraes .pz-bar{position:absolute;left:16px;right:16px;top:-6px;height:3px;background:rgba(73,215,255,.18);border-radius:2px}#jvPraes .pz-bar i{display:block;height:100%;width:0;background:#49d7ff;box-shadow:0 0 10px #49d7ff;border-radius:2px;transition:width .8s}' +
        '.pz-blitz{position:fixed;inset:0;z-index:99995;pointer-events:none;background:radial-gradient(circle at 50% 70%,rgba(180,245,255,.85),rgba(0,170,255,.35) 60%,transparent);animation:pzblitz .42s ease-out forwards}@keyframes pzblitz{0%{opacity:.95}100%{opacity:0}}' +
        '#jvPraes .pz-cap{font-size:29px;line-height:1.1;min-height:0;margin-bottom:8px;font-weight:900;letter-spacing:.5px;text-transform:uppercase;transform:scale(.9);transition:opacity .2s,transform .25s cubic-bezier(.2,1.6,.4,1)}#jvPraes .pz-cap.an{transform:scale(1)}' +
        '#jvPraes .pz-riesig{font-size:84px;text-align:center;margin-top:14px;filter:drop-shadow(0 0 22px #00c8ff);animation:pzbeat .9s ease-in-out infinite}@keyframes pzbeat{50%{transform:scale(1.14)}}' +
        '#jvPraes .pz-glitch{animation:pzglitch 2.4s infinite}@keyframes pzglitch{0%,92%,100%{transform:none;text-shadow:0 0 22px #00c8ff,0 0 48px #0090ff}94%{transform:translateX(-5px) skewX(8deg);text-shadow:4px 0 #ff2a6d,-4px 0 #00f0ff}97%{transform:translateX(4px);text-shadow:-4px 0 #ff2a6d,4px 0 #00f0ff}}' +
        '#jvPraes .pz-zeile{font-size:20px;padding:6px 0;transform:translateX(-22px) scale(.96)}#jvPraes .pz-zeile.an{transform:none}' +
        '#jvPraes .pz-gross2{font-size:36px;font-weight:800;color:#eaffff;text-shadow:0 0 14px #00c8ff}' +
        '#jvPraes .pz-betrag b{font-size:46px;font-weight:800;color:#eaffff;text-shadow:0 0 16px #00c8ff}' +
        '#jvPraes .pz-links{align-self:flex-start}#jvPraes .pz-rechtsb{justify-content:flex-end;color:#7ff0ff}' +
        '#jvPraes .pz-wort{display:flex;align-items:center;justify-content:center;height:100%}' +
        '#jvPraes .pz-cta{font-size:40px;font-weight:900;line-height:1.1;text-align:center;color:#eaffff;text-shadow:0 0 22px #00c8ff,0 0 48px #0090ff;margin-top:18px}#jvPraes .pz-cta2{font-size:19px;text-align:center;color:#7ff0ff;margin-top:12px;font-weight:700}' +
        '#jvPraes .pz-cta.pz-rot{color:#ff6b6b;text-shadow:0 0 22px #ff2a2a,0 0 48px #ff0000}' +
        '#jvPraes .pz-w{font-size:64px;font-weight:900;letter-spacing:8px;color:#eaffff;text-shadow:0 0 22px #00c8ff,0 0 52px #0090ff}#jvPraes .pz-w2{animation:pzslam .45s cubic-bezier(.2,1.7,.4,1)}@keyframes pzslam{0%{transform:scale(2.4);opacity:0}100%{transform:none;opacity:1}}';

    function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
    function warte(ms) { var g = gen; return new Promise(function (r) { setTimeout(r, ms); }).then(function () { if (g !== gen || abbruch) throw 'stop'; }); }

    /* Sprechen mit Absicherung: ruft weiter, auch wenn der Ton ausfällt */
    function sag(text, lang) {
        var g = gen;
        return new Promise(function (resolve) {
            var fertig = false;
            function ok() { if (!fertig) { fertig = true; resolve(); } }
            var limit = Math.max(3500, text.length * 105 + 3500);
            setTimeout(ok, limit + 4000);
            try { if (typeof window.speak === 'function') window.speak(text, ok, lang || undefined); else setTimeout(ok, text.length * 70); } catch (e) { setTimeout(ok, 1500); }
        }).then(function () { if (g !== gen || abbruch) throw 'stop'; });
    }

    /* Anpassung an große Handy-Schrift: Hat das Handy "Schriftgröße" oder "Bildschirmzoom" groß gestellt, wäre alles zu riesig.
       Wir messen den Faktor (zf) und verkleinern Überschrift, Sprechblase und Karteninhalt so, dass alles ins Bild passt. */
    var zf = 1;
    function messeZoom() {
        try {
            var p = el('div', '', 'Mg'); p.style.cssText = 'position:absolute;left:-999px;top:0;visibility:hidden;font-size:100px;line-height:1;white-space:nowrap;font-family:system-ui,sans-serif';
            document.body.appendChild(p); var h = p.getBoundingClientRect().height; p.remove();
            zf = Math.max(1, Math.min(2.2, h / 100 || 1));
        } catch (e) { zf = 1; }
    }
    function passe(inner, zuGross, minZ) {   // Inhalt per zoom so lange verkleinern, bis zuGross() nicht mehr wahr ist
        var z = 1 / zf; minZ = minZ || .45;
        inner.style.zoom = z;
        for (var i = 0; i < 30 && z > minZ && zuGross(); i++) { z -= .04; inner.style.zoom = z; }
    }

    var capEl, cmdEl, stage, aktuelleKarte = null;
    function caption(t) {
        if (!capEl) return;
        capEl.classList.remove('an');
        setTimeout(function () { if (!capEl) return; capEl.textContent = t || ''; if (t) { capEl.style.zoom = 1 / zf; passe(capEl, function () { return capEl.getBoundingClientRect().height > Math.max(60, window.innerHeight * .085); }); capEl.classList.add('an'); } }, 200);
    }
    function karte(html) {
        var alt = aktuelleKarte;
        if (alt) { alt.classList.remove('an'); alt.classList.add('weg'); setTimeout(function () { try { alt.remove(); } catch (e) {} }, 600); }
        var k = el('div', 'pz-card');
        var inn = el('div', 'pz-in', html); k.appendChild(inn);
        stage.appendChild(k);
        passe(inn, function () { return k.scrollHeight > k.clientHeight + 1 || k.scrollWidth > k.clientWidth + 1; });
        requestAnimationFrame(function () { requestAnimationFrame(function () { k.classList.add('an'); }); });
        aktuelleKarte = k;
        return k;
    }
    function zeilen(k, ms) {
        var z = k.querySelectorAll('.pz-zeile'), i = 0;
        return (function naechste() {
            if (i >= z.length) return Promise.resolve();
            z[i++].classList.add('an');
            return warte(ms || 450).then(naechste);
        })();
    }
    function mimik(n) { try { if (window.jvAvatar3D && window.jvAvatar3D.setExpression) window.jvAvatar3D.setExpression(n); } catch (e) {} }
    function grimasse(m, ms) { try { if (window.jvAvatar3D && window.jvAvatar3D.grimasse) { window.jvAvatar3D.grimasse(m); setTimeout(function () { try { window.jvAvatar3D.grimasse(null); } catch (e) {} }, ms || 1300); } } catch (e) {} }
    function ansicht(n) { try { if (window.jvAnsicht) window.jvAnsicht.set(n); } catch (e) {} }

    /* ---------------- Effekte ---------------- */
    function blitz() { if (!root) return; var f = el('div', 'pz-blitz'); document.body.appendChild(f); setTimeout(function () { try { f.remove(); } catch (e) {} }, 420); }
    function zaehle(node, bis, ms, dez, suffix) {
        var t0 = Date.now(), g = gen;
        (function f() {
            if (g !== gen || !node) return;
            var p = Math.min(1, (Date.now() - t0) / ms), v = bis * (1 - Math.pow(1 - p, 3));
            node.textContent = v.toFixed(dez).replace('.', ',') + (suffix || '');
            if (p < 1) requestAnimationFrame(f);
        })();
    }
    function fortschritt(p) { var b = root && root.querySelector('.pz-bar i'); if (b) b.style.width = p + '%'; }
    function pop(k, ms) {
        var z = k.querySelectorAll('.pz-zeile'), i = 0;
        return (function n() { if (i >= z.length) return Promise.resolve(); z[i++].classList.add('an'); return warte(ms || 380).then(n); })();
    }

    /* ---------------- Sprechblase: was der Nutzer sagt ---------------- */
    function cmd(text, icon) {
        var g = gen;
        if (!cmdEl) return Promise.resolve();
        cmdEl.classList.remove('an');
        return warte(220).then(function () {
            cmdEl.innerHTML = '<span class="pz-ic">' + (icon || '🎤') + '</span><span><span class="pz-t"></span><i class="pz-car"></i></span>';
            cmdEl.classList.add('an');
            var t = cmdEl.querySelector('.pz-t'), i = 0, n = text.length, schritt = Math.max(28, Math.min(55, 1300 / n));
            return new Promise(function (res) {
                (function tipp() {
                    if (g !== gen || !t) return res();
                    i++; t.textContent = text.slice(0, i);
                    if (i < n) setTimeout(tipp, schritt); else res();
                })();
            });
        }).then(function () { return warte(350); });
    }
    /* Eine Szene: Sprechblase tippen, dann Karte mit Zeilen zeigen und dazu sprechen */
    function szene(o) {
        blitz(); mimik(o.mimik || 'friendly'); fortschritt(o.nr * 9); caption(o.nr + '/10 · ' + o.cap);
        return cmd(o.cmd, o.icon).then(function () {
            var k = karte(o.html);
            if (o.nach) o.nach(k);
            var rede = sag(o.rede);
            return Promise.all([warte(250).then(function () { return pop(k, o.takt || 750); }), rede]);
        });
    }

    function szeneHook() {
        mimik('serious'); blitz(); fortschritt(3); caption('MEIN HANDY HÖRT ZU.');
        if (cmdEl) cmdEl.classList.remove('an');
        karte('<div class="pz-gross pz-glitch">NOVA</div><div class="pz-klein">„HEY NOVA“ · AUCH BEI GESPERRTEM HANDY</div>');
        setTimeout(function () { grimasse({ browOuterUp_L: .95, browInnerUp: .3, mouthSmile_L: .8, mouthSmile_R: .3 }, 1400); }, 600);
        setTimeout(function () { caption('UND HANDELT.'); blitz(); }, 1900);
        return sag('Ich bin Nova. Du sprichst, ich erledige.');
    }

    function szene1() {   // Humor: sofort Sympathie
        return szene({ nr: 1, cap: 'ER HAT HUMOR', mimik: 'laugh', cmd: 'Initiiere Selbstzerstörung.', icon: '🎤', takt: 600,
            html: '<div class="pz-kopf">Nova antwortet</div>' +
                '<div class="pz-zeile">💥 <span><b class="pz-gross2">Abgelehnt.</b></span></div>' +
                '<div class="pz-zeile">🧾 <span>„In deinem <b class="pz-gelb">Tarif</b> nicht enthalten.“</span></div>' +
                '<div class="pz-zeile">😏 <span>Frech, aber <b>nie bei ernsten Themen</b></span></div>',
            nach: function () { setTimeout(function () { grimasse({ mouthSmile_L: 1, mouthSmile_R: 1, browInnerUp: .4, eyeSquint_L: .5, eyeSquint_R: .5 }, 1600); }, 900); },
            rede: 'Selbstzerstörung ist in deinem Tarif leider nicht enthalten.' });
    }

    function szene2() {   // Rechnung: der stärkste Effekt
        blitz(); mimik('thinking'); fortschritt(18); caption('2/10 · FOTO → ERLEDIGT');
        return cmd('Lies mir die Rechnung vor.', '🎤').then(function () {
            var k = karte('<div class="pz-fz"><div class="pz-foto" style="background-image:url(./beispielrechnung.jpg)"><div class="pz-scan"></div></div>' +
                '<div class="pz-rechts"><div class="pz-kopf">Nova liest</div>' +
                '<div class="pz-zeile pz-betrag"><b class="pz-z">0,00 €</b></div>' +
                '<div class="pz-zeile">📅 <span>fällig <b class="pz-gelb">28. Okt.</b></span></div>' +
                '<div class="pz-zeile">⏰ <span class="pz-gruen"><b>Im Kalender ✓</b></span></div></div></div>');
            setTimeout(function () { var sc = k.querySelector('.pz-scan'); if (sc) sc.classList.add('an'); }, 200);
            var z = k.querySelectorAll('.pz-zeile');
            var ablauf = warte(1100).then(function () { z[0].classList.add('an'); blitz(); zaehle(k.querySelector('.pz-z'), 84.5, 800, 2, ' €'); return warte(850); })
                .then(function () { z[1].classList.add('an'); return warte(500); })
                .then(function () { z[2].classList.add('an'); });
            var rede = sag('Betrag, Frist, Kalender. Erledigt, bevor du blinzelst.');
            return Promise.all([ablauf, rede]);
        });
    }

    function szene3() {   // Kündigung: spart Geld, jeder kennt das
        return szene({ nr: 3, cap: 'KÜNDIGUNG IN SEKUNDEN', mimik: 'friendly', cmd: 'Schreib mir eine Kündigung.', icon: '🎤', takt: 600,
            html: '<div class="pz-kopf">Brief fertig</div>' +
                '<div class="pz-zeile">📄 <span>„Hiermit kündige ich meinen Vertrag …“</span></div>' +
                '<div class="pz-zeile">✅ <span><b class="pz-gruen">PDF</b> · Drucken · Kopieren</span></div>' +
                '<div class="pz-zeile">🏢 <span>Adresse des Anbieters: <b>gesucht</b></span></div>',
            rede: 'Ich frage kurz nach, dann steht dein Brief. Als PDF.' });
    }

    function szene4() {   // Alarm: echte Warnung der App, rot und mit Sirene
        blitz(); mimik('serious'); fortschritt(36); caption('4/10 · WARNT VON SELBST');
        if (cmdEl) cmdEl.classList.remove('an');
        karte('<div class="pz-cta pz-rot">⚠ GLATTEIS</div><div class="pz-cta2">auf deiner Strecke · Nova meldet sich</div>');
        setTimeout(function () { try { if (window.jvAlarm) window.jvAlarm({ stufe: 'rot', titel: 'Glatteis auf deiner Strecke', text: 'Plan mehr Zeit ein.', sprechen: false }); } catch (e) {} }, 350);
        return sag('Achtung. Glatteis auf deiner Strecke. Plan mehr Zeit ein.').then(function () { try { if (window.jvAlarmClose) window.jvAlarmClose(); } catch (e) {} return warte(250); });
    }

    function szene5() {
        return szene({ nr: 5, cap: 'LIVE-DOLMETSCHER', mimik: 'surprised', cmd: 'Dolmetsche Deutsch und Türkisch.', icon: '🎤', takt: 550,
            html: '<div class="pz-kopf">Deutsch ⇄ Türkisch</div>' +
                '<div class="pz-zeile pz-links"><span class="pz-flag">DE</span><span>Wo ist der Bahnhof?</span></div>' +
                '<div class="pz-zeile pz-rechtsb"><span class="pz-flag">TR</span><span><b>İstasyon nerede?</b></span></div>' +
                '<div class="pz-zeile pz-links"><span class="pz-flag">TR</span><span>Düz git, sonra sağa.</span></div>',
            rede: 'Ich dolmetsche live, in beide Richtungen.' });
    }

    function szene6() {
        return szene({ nr: 6, cap: 'WARNT VOR DEM STAU', mimik: 'serious', cmd: '4:00 Uhr · Nova meldet sich', icon: '🔔', takt: 600,
            html: '<div class="pz-kopf">Stau-Check · Arbeitsweg</div>' +
                '<div class="pz-zeile">🚗 <span>Heute <b class="pz-rot">48 Min.</b> statt sonst <b>30</b></span></div>' +
                '<div class="pz-zeile">🛣️ <span>A24: <b class="pz-gelb">Stau gemeldet</b></span></div>' +
                '<div class="pz-zeile">⏰ <span>Fahr um <b class="pz-gruen">4:10 Uhr</b> los</span></div>',
            rede: 'Stau auf deiner Strecke? Ich sage dir, wann du früher losmusst.' });
    }

    function szene7() {
        return szene({ nr: 7, cap: 'LIEST DEINE MAILS VOR', mimik: 'friendly', cmd: 'Nova meldet sich von selbst', icon: '✉️', takt: 600,
            html: '<div class="pz-kopf">Neue E-Mail</div>' +
                '<div class="pz-zeile">✉️ <span>Von <b>Anna</b></span></div>' +
                '<div class="pz-zeile">📌 <span>Betreff: <b>Samstag, 18 Uhr</b></span></div>' +
                '<div class="pz-zeile">🗣️ <span>„Soll ich sie <b class="pz-gruen">vorlesen</b>?“</span></div>',
            rede: 'Du hast eine E-Mail von Anna. Soll ich sie vorlesen?' });
    }

    function szene8() {
        return szene({ nr: 8, cap: 'ROUTE · SPRIT · RADAR', mimik: 'serious', cmd: 'Route nach Hamburg.', icon: '🎤', takt: 700,
            html: '<div class="pz-kopf">Schwarzenbek → Hamburg</div>' +
                '<div class="pz-zeile">⏱️ <span><b class="pz-gross2">34 Min.</b> <span class="pz-rot">+9 Stau</span></span></div>' +
                '<div class="pz-zeile">⛽ <span>Diesel <b class="pz-gross2">1,59 €</b> · 2 km</span></div>' +
                '<div class="pz-zeile">🌧️ <span>Radar: <b class="pz-gruen">ab 14 Uhr trocken</b></span></div>',
            rede: 'Route, billigster Sprit auf dem Weg und das Regenradar.' });
    }

    function szene9() {   // Die Ansichten wechseln live
        blitz(); mimik('happy'); fortschritt(81); caption('9/10 · DREI GESICHTER');
        if (cmdEl) cmdEl.classList.remove('an');
        karte('<div class="pz-cta">KOPF · KUGEL · GEHIRN</div><div class="pz-cta2">Du wählst, wie Nova aussieht.</div>');
        setTimeout(function () { ansicht('kugel'); blitz(); }, 1300);
        setTimeout(function () { ansicht('gehirn'); blitz(); }, 2600);
        setTimeout(function () { ansicht('kopf'); blitz(); }, 3900);
        return sag('Kopf, Kugel oder Gehirn. Du wählst, wie ich aussehe.').then(function () { return warte(1400); });
    }

    function szene10() {   // Schluss: ehrlicher Aufruf
        blitz(); ansicht('kopf'); mimik('laugh'); fortschritt(100); caption('10/10');
        if (cmdEl) cmdEl.classList.remove('an');
        karte('<div class="pz-cta pz-glitch">WER WILL<br>NOVA AUCH?</div><div class="pz-cta2">Schreib NOVA in die Kommentare ↓</div>');
        setTimeout(function () { grimasse({ browOuterUp_L: .95, browInnerUp: .2, mouthSmile_L: .8, mouthSmile_R: .4 }, 1400); }, 500);
        return sag('Ich schlafe nie, ich vergesse nichts. Ich bin Nova.')
            .then(function () { grimasse({ eyeSquint_L: .6, eyeSquint_R: .6, mouthSmile_L: 1, mouthSmile_R: 1, browInnerUp: .3 }, 1500); return warte(1600); });
    }

    /* ---------------- Steuerung ---------------- */
    function aufraeumen() {
        gen++;
        laeuft = false;
        try { if (window.jvAlarmClose) window.jvAlarmClose(); } catch (e) {}
        try { if (root) root.remove(); } catch (e) {}
        root = null; stage = null; capEl = null; cmdEl = null; aktuelleKarte = null;
        try { document.body.classList.remove('jv-praesentation'); } catch (e) {}
        ansicht('kopf'); mimik('friendly');
        try { if (window.jvAvatar3D && window.jvAvatar3D.grimasse) window.jvAvatar3D.grimasse(null); } catch (e) {}
    }

    function stop() { if (!laeuft) return false; abbruch = true; try { if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel(); } catch (e) {} aufraeumen(); abbruch = false; return true; }

    function start() {
        if (laeuft) return true;
        laeuft = true; abbruch = false; gen++;
        if (!document.getElementById('jvPraesCss')) { var s = el('style'); s.id = 'jvPraesCss'; s.textContent = CSS; document.head.appendChild(s); }
        messeZoom();
        root = el('div'); root.id = 'jvPraes';
        capEl = el('div', 'pz-cap'); cmdEl = el('div', 'pz-cmd'); stage = el('div', 'pz-stage'); cmdEl.style.zoom = 1 / zf;
        root.appendChild(capEl); root.appendChild(cmdEl); root.appendChild(stage); root.insertAdjacentHTML('beforeend','<div class="pz-bar"><i></i></div>');
        root.addEventListener('click', function () { var n = Date.now(); if (n - letzterTipp < 450) stop(); letzterTipp = n; });
        document.body.appendChild(root);
        document.body.classList.add('jv-praesentation');
        ansicht('kopf');
        var g = gen;
        warte(900)
            .then(szeneHook).then(function () { return warte(150); })
            .then(szene1).then(function () { return warte(150); })
            .then(szene2).then(function () { return warte(150); })
            .then(szene3).then(function () { return warte(150); })
            .then(szene4).then(function () { return warte(150); })
            .then(szene5).then(function () { return warte(150); })
            .then(szene6).then(function () { return warte(150); })
            .then(szene7).then(function () { return warte(150); })
            .then(szene8).then(function () { return warte(150); })
            .then(szene9).then(function () { return warte(150); })
            .then(szene10)
            .then(function () { return warte(900); })
            .then(function () { if (g === gen) aufraeumen(); })
            .catch(function (e) { if (e !== 'stop') { console.error('Präsentation', e); if (g === gen) aufraeumen(); } });
        return true;
    }
    window.jvPraesentation = { start: start, stop: stop, get laeuft() { return laeuft; } };

    /* ---------------- Sprache ---------------- */
    var RX = /^(?:bitte\s+)?(?:(?:starte?|beginne?|mach|zeig|spiel|spiele|los)\s+(?:mal\s+)?(?:die\s+|deine\s+|eine\s+|mir\s+(?:die\s+|deine\s+)?)?)?präsentation(?:\s+(?:starten|beginnen|los|bitte|ab))?$|^präsentation\s+starten$/;
    function handle(text) {
        var t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim()
            .replace(/^(?:hey |hallo |ok |okay )?(?:zane |jarvis |nova )/, '');
        t = t.replace(/praesentation/g, 'präsentation').replace(/^(?:tik ?tok|tiktok)[ -]+(?=präsentation)/, '').replace(/(?:^| )(?:tik ?tok|tiktok)[ -]+(?=präsentation)/, ' ');
        if (!t || t.length > 50) return false;
        if (RX.test(t) || /^stell(?:e)? dich (?:(?:mal|bitte|doch|kurz|einmal|ruhig|allen|uns) )*vor$/.test(t)) { setTimeout(start, 150); return true; }
        return false;
    }
    window.handlePraesentationCommand = handle;

    function registerCommand() {
        if (!window.jvCommands) return false;
        window.jvCommands.use('praesentation', function (text, next) {
            try { if (handle(text)) return true; } catch (e) {}
            return next(text);
        }, 120);
        return true;
    }
    if (!registerCommand()) document.addEventListener('DOMContentLoaded', registerCommand);
})();
