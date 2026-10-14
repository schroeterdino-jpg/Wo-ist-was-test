/* PRÄSENTATION: Zane stellt sich in ca. 60 Sekunden selbst vor (für Bildschirmaufnahmen).
   - Start per Sprache: "Präsentation", "Starte die Präsentation", "Präsentation starten".
   - Abbrechen: zweimal schnell auf den Bildschirm tippen.
   - Alles ist ausgedacht (Max Mustermann, Beispielrechnung), es werden KEINE echten Daten angezeigt oder gelesen.
   - Ablauf: Vorstellung, Morgen-Briefing, Rechnung fotografieren, Route/Stau/Sprit, Dolmetscher, Ansichten, Abschluss.
   - Die Beispielrechnung liegt in ./beispielrechnung.jpg.
   Nutzt nur: speak(text, callback, sprache), window.jvAvatar3D, window.jvAnsicht, window.jvCommands. */
(function () {
    'use strict';

    var laeuft = false, abbruch = false, root = null, gen = 0, letzterTipp = 0;

    var CSS = '' +
        '#jvPraes{position:fixed;left:0;right:0;bottom:0;height:56vh;z-index:99990;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:0 16px calc(18px + env(safe-area-inset-bottom));' +
        'background:linear-gradient(to top,rgba(2,10,18,.97) 55%,rgba(2,10,18,.0));color:#dff6ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none}' +
        '#jvPraes *{box-sizing:border-box}' +
        '#jvPraes .pz-cap{width:100%;max-width:520px;text-align:center;font-size:19px;line-height:1.35;font-weight:600;letter-spacing:.2px;min-height:52px;margin-bottom:12px;text-shadow:0 0 14px rgba(73,215,255,.55);opacity:0;transition:opacity .35s}' +
        '#jvPraes .pz-cap.an{opacity:1}' +
        '#jvPraes .pz-stage{position:relative;width:100%;max-width:520px;height:30vh;min-height:190px}' +
        '#jvPraes .pz-card{position:absolute;inset:0;border:1px solid rgba(73,215,255,.55);border-radius:16px;background:rgba(6,24,38,.88);box-shadow:0 0 28px rgba(0,190,255,.28),inset 0 0 22px rgba(0,190,255,.08);padding:14px 16px;opacity:0;transform:translateY(26px) scale(.97);transition:opacity .45s,transform .45s;overflow:hidden}' +
        '#jvPraes .pz-card.an{opacity:1;transform:none}' +
        '#jvPraes .pz-card.weg{opacity:0;transform:translateY(-18px) scale(.97)}' +
        '#jvPraes .pz-kopf{font:700 11px/1 ui-monospace,Menlo,monospace;letter-spacing:2.5px;color:#49d7ff;margin-bottom:10px;text-transform:uppercase}' +
        '#jvPraes .pz-zeile{display:flex;align-items:center;gap:10px;font-size:15.5px;line-height:1.3;padding:5px 0;opacity:0;transform:translateX(-14px);transition:opacity .4s,transform .4s}' +
        '#jvPraes .pz-zeile.an{opacity:1;transform:none}' +
        '#jvPraes .pz-zeile b{color:#7ff0ff}' +
        '#jvPraes .pz-gross{font-size:56px;font-weight:800;letter-spacing:10px;text-align:center;margin-top:34px;color:#eaffff;text-shadow:0 0 22px #00c8ff,0 0 48px #0090ff}' +
        '#jvPraes .pz-klein{text-align:center;font:600 12px ui-monospace,Menlo,monospace;letter-spacing:4px;color:#49d7ff;margin-top:8px}' +
        '#jvPraes .pz-foto{position:absolute;left:14px;top:14px;bottom:14px;width:38%;border-radius:8px;background:#000 center/contain no-repeat;border:1px solid rgba(255,255,255,.35);overflow:hidden}' +
        '#jvPraes .pz-scan{position:absolute;left:0;right:0;height:3px;background:#49d7ff;box-shadow:0 0 14px 4px rgba(73,215,255,.9);top:0;opacity:0}' +
        '#jvPraes .pz-scan.an{opacity:1;animation:pzscan 1.5s ease-in-out 2}' +
        '@keyframes pzscan{0%{top:0}50%{top:calc(100% - 3px)}100%{top:0}}' +
        '#jvPraes .pz-rechts{position:absolute;left:calc(38% + 28px);right:14px;top:12px}' +
        '#jvPraes .pz-flag{display:inline-block;padding:2px 8px;border:1px solid #49d7ff;border-radius:6px;font:700 12px ui-monospace,Menlo,monospace;color:#49d7ff;margin-right:6px}' +
        '#jvPraes .pz-gruen{color:#5dffa8}#jvPraes .pz-rot{color:#ff7a7a}#jvPraes .pz-gelb{color:#ffd166}';

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

    var capEl, stage, aktuelleKarte = null;
    function caption(t) {
        if (!capEl) return;
        capEl.classList.remove('an');
        setTimeout(function () { if (!capEl) return; capEl.textContent = t || ''; if (t) capEl.classList.add('an'); }, 200);
    }
    function karte(html) {
        var alt = aktuelleKarte;
        if (alt) { alt.classList.remove('an'); alt.classList.add('weg'); setTimeout(function () { try { alt.remove(); } catch (e) {} }, 600); }
        var k = el('div', 'pz-card', html);
        stage.appendChild(k);
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

    /* ---------------- Szenen ---------------- */
    function szeneVorstellung() {
        var k = karte('<div class="pz-gross">ZANE</div><div class="pz-klein">DEIN PERSÖNLICHER ASSISTENT</div>');
        mimik('happy'); caption('');
        return sag('Hallo. Ich bin Zane. Dein persönlicher Assistent, direkt in deiner Hosentasche.');
    }

    function szeneBriefing() {
        mimik('friendly'); caption('☀️ Morgen-Briefing');
        var k = karte('<div class="pz-kopf">Guten Morgen, Max</div>' +
            '<div class="pz-zeile">🌤️ <span><b>14 °C</b>, trocken, am Nachmittag Wind</span></div>' +
            '<div class="pz-zeile">🕕 <span>Frühschicht <b>ab 6:00 Uhr</b></span></div>' +
            '<div class="pz-zeile">🚗 <span>A24: <b class="pz-rot">Stau +12 Min.</b> – lieber früher los</span></div>' +
            '<div class="pz-zeile">🔑 <span>Dein Schlüssel liegt <b>auf dem Küchentisch</b></span></div>');
        var rede = sag('Jeden Morgen weiß ich, was ansteht. Wetter, Schicht, Stau auf deinem Weg, und sogar, wo du deinen Schlüssel hingelegt hast.');
        return Promise.all([warte(1200).then(function () { return zeilen(k, 1100); }), rede]);
    }

    function szeneRechnung() {
        mimik('thinking'); caption('📸 Rechnung fotografieren');
        var k = karte('<div class="pz-foto" style="background-image:url(./beispielrechnung.jpg)"><div class="pz-scan"></div></div>' +
            '<div class="pz-rechts"><div class="pz-kopf">Gelesen von Zane</div>' +
            '<div class="pz-zeile">🏢 <span><b>Nordstrom Energie</b></span></div>' +
            '<div class="pz-zeile">💶 <span><b>84,50 €</b></span></div>' +
            '<div class="pz-zeile">📅 <span>fällig <b class="pz-gelb">28. Oktober</b></span></div>' +
            '<div class="pz-zeile">⏰ <span class="pz-gruen"><b>Erinnerung gesetzt</b></span></div></div>');
        setTimeout(function () { var s = k.querySelector('.pz-scan'); if (s) s.classList.add('an'); }, 700);
        var z = k.querySelectorAll('.pz-zeile');
        var rede = sag('Rechnung vor die Kamera, fertig. Nordstrom Energie, vierundachtzig Euro fünfzig, fällig am achtundzwanzigsten Oktober. Ich erinnere dich rechtzeitig.');
        var anim = warte(2600).then(function () {
            var i = 0; return (function n() { if (i >= z.length) return Promise.resolve(); z[i++].classList.add('an'); return warte(1000).then(n); })();
        });
        return Promise.all([anim, rede]);
    }

    function szeneRoute() {
        mimik('serious'); caption('🗺️ Route, Stau & Sprit');
        var k = karte('<div class="pz-kopf">Hamburg → Schwarzenbek</div>' +
            '<div class="pz-zeile">⏱️ <span><b>34 Min.</b> <span class="pz-rot">(+9 Min. Stau)</span></span></div>' +
            '<div class="pz-zeile">🛣️ <span>Alternativ über B404: <b class="pz-gruen">−6 Min.</b></span></div>' +
            '<div class="pz-zeile">⛽ <span>Günstigster Diesel: <b>1,59 €</b> nur 2 km entfernt</span></div>');
        var rede = sag('Ich kenne die Strecke, den Stau und die billigste Tankstelle. Frag mich einfach, wie du fährst.');
        return Promise.all([warte(900).then(function () { return zeilen(k, 1000); }), rede]);
    }

    function szeneDolmetscher() {
        mimik('surprised'); caption('🌍 Live-Dolmetscher');
        var k = karte('<div class="pz-kopf">Deutsch ⇄ Türkisch</div>' +
            '<div class="pz-zeile"><span class="pz-flag">DE</span><span>„Wo ist der Bahnhof?“</span></div>' +
            '<div class="pz-zeile"><span class="pz-flag">TR</span><span><b>„İstasyon nerede?“</b></span></div>' +
            '<div class="pz-zeile"><span class="pz-flag">TR</span><span>„Düz git, sonra sağa.“</span></div>' +
            '<div class="pz-zeile"><span class="pz-flag">DE</span><span><b>„Geradeaus, dann rechts.“</b></span></div>');
        var rede = sag('Und wenn du mal jemanden nicht verstehst: Ich dolmetsche live. Zum Beispiel Türkisch.');
        return Promise.all([warte(700).then(function () { return zeilen(k, 900); }), rede]);
    }

    function szeneAnsichten() {
        mimik('happy'); caption('✨ Drei Gesichter');
        var k = karte('<div class="pz-kopf">Ansichten per Sprache</div>' +
            '<div class="pz-zeile">👤 <span>„Zeig den <b>Kopf</b>“</span></div>' +
            '<div class="pz-zeile">🔮 <span>„Zeig die <b>Kugel</b>“</span></div>' +
            '<div class="pz-zeile">🧠 <span>„Zeig das <b>Gehirn</b>“</span></div>');
        var g = gen;
        var rede = sag('Ich kann auch anders aussehen. Kugel. Gehirn. Und zurück zum Kopf.');
        var show = warte(1500).then(function () { ansicht('kugel'); return warte(2100); })
            .then(function () { ansicht('gehirn'); return warte(2100); })
            .then(function () { ansicht('kopf'); });
        var z = k.querySelectorAll('.pz-zeile');
        z.forEach(function (e, i) { setTimeout(function () { if (g === gen) e.classList.add('an'); }, 1500 + i * 2100); });
        return Promise.all([show, rede]);
    }

    function szeneAbschluss() {
        ansicht('kopf'); mimik('laugh'); caption('');
        var k = karte('<div class="pz-gross">ZANE</div><div class="pz-klein">ARBEITET FÜR DICH · TAG UND NACHT</div>');
        setTimeout(function () { grimasse({ browOuterUp_L: .95, browInnerUp: .2, mouthSmile_L: .8, mouthSmile_R: .4 }, 1400); }, 500);
        return sag('Ich bin Zane. Ich arbeite für dich, Tag und Nacht. Und ich beschwere mich nie über Überstunden.')
            .then(function () { grimasse({ eyeSquint_L: .6, eyeSquint_R: .6, mouthSmile_L: 1, mouthSmile_R: 1, browInnerUp: .3 }, 1500); return warte(1800); });
    }

    /* ---------------- Steuerung ---------------- */
    function aufraeumen() {
        gen++;
        laeuft = false;
        try { if (root) root.remove(); } catch (e) {}
        root = null; stage = null; capEl = null; aktuelleKarte = null;
        try { document.body.classList.remove('jv-praesentation'); } catch (e) {}
        ansicht('kopf'); mimik('friendly');
        try { if (window.jvAvatar3D && window.jvAvatar3D.grimasse) window.jvAvatar3D.grimasse(null); } catch (e) {}
    }

    function stop() { if (!laeuft) return false; abbruch = true; try { if (typeof window.speechSynthesis !== 'undefined') window.speechSynthesis.cancel(); } catch (e) {} aufraeumen(); abbruch = false; return true; }

    function start() {
        if (laeuft) return true;
        laeuft = true; abbruch = false; gen++;
        if (!document.getElementById('jvPraesCss')) { var s = el('style'); s.id = 'jvPraesCss'; s.textContent = CSS; document.head.appendChild(s); }
        root = el('div'); root.id = 'jvPraes';
        capEl = el('div', 'pz-cap'); stage = el('div', 'pz-stage');
        root.appendChild(capEl); root.appendChild(stage);
        root.addEventListener('click', function () { var n = Date.now(); if (n - letzterTipp < 450) stop(); letzterTipp = n; });
        document.body.appendChild(root);
        document.body.classList.add('jv-praesentation');
        ansicht('kopf');
        var g = gen;
        warte(1500)   // kurzer Vorlauf, damit die Aufnahme sauber startet
            .then(szeneVorstellung).then(function () { return warte(250); })
            .then(szeneBriefing).then(function () { return warte(250); })
            .then(szeneRechnung).then(function () { return warte(250); })
            .then(szeneRoute).then(function () { return warte(250); })
            .then(szeneDolmetscher).then(function () { return warte(250); })
            .then(szeneAnsichten).then(function () { return warte(250); })
            .then(szeneAbschluss)
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
            .replace(/^(?:hey |hallo |ok |okay )?(?:zane |jarvis )/, '');
        t = t.replace(/praesentation/g, 'präsentation');
        if (!t || t.length > 50) return false;
        if (RX.test(t)) { setTimeout(start, 150); return true; }
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
