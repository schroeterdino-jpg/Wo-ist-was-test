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
        '#jvPraes{position:fixed;left:0;right:0;bottom:0;height:60vh;z-index:99990;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;padding:0 16px calc(18px + env(safe-area-inset-bottom));' +
        'background:linear-gradient(to top,rgba(2,10,18,.97) 50%,rgba(2,10,18,.0));color:#dff6ff;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;-webkit-tap-highlight-color:transparent;user-select:none}' +
        '#jvPraes *{box-sizing:border-box}' +
        '#jvPraes .pz-cap{width:100%;max-width:520px;text-align:center;font-size:19px;line-height:1.35;font-weight:600;letter-spacing:.2px;min-height:52px;margin-bottom:12px;text-shadow:0 0 14px rgba(73,215,255,.55);opacity:0;transition:opacity .35s}' +
        '#jvPraes .pz-cap.an{opacity:1}' +
        '#jvPraes .pz-stage{position:relative;width:100%;max-width:520px;height:36vh;min-height:230px}' +
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
        '#jvPraes .pz-gruen{color:#5dffa8}#jvPraes .pz-rot{color:#ff7a7a}#jvPraes .pz-gelb{color:#ffd166}' +
        '#jvPraes .pz-bar{position:absolute;left:16px;right:16px;top:-6px;height:3px;background:rgba(73,215,255,.18);border-radius:2px}#jvPraes .pz-bar i{display:block;height:100%;width:0;background:#49d7ff;box-shadow:0 0 10px #49d7ff;border-radius:2px;transition:width .8s}' +
        '.pz-blitz{position:fixed;inset:0;z-index:99995;pointer-events:none;background:radial-gradient(circle at 50% 70%,rgba(180,245,255,.85),rgba(0,170,255,.35) 60%,transparent);animation:pzblitz .42s ease-out forwards}@keyframes pzblitz{0%{opacity:.95}100%{opacity:0}}' +
        '#jvPraes .pz-cap{font-size:26px;font-weight:800;letter-spacing:.5px;text-transform:uppercase;transform:scale(.9);transition:opacity .2s,transform .25s cubic-bezier(.2,1.6,.4,1)}#jvPraes .pz-cap.an{transform:scale(1)}' +
        '#jvPraes .pz-riesig{font-size:84px;text-align:center;margin-top:14px;filter:drop-shadow(0 0 22px #00c8ff);animation:pzbeat .9s ease-in-out infinite}@keyframes pzbeat{50%{transform:scale(1.14)}}' +
        '#jvPraes .pz-glitch{animation:pzglitch 2.4s infinite}@keyframes pzglitch{0%,92%,100%{transform:none;text-shadow:0 0 22px #00c8ff,0 0 48px #0090ff}94%{transform:translateX(-5px) skewX(8deg);text-shadow:4px 0 #ff2a6d,-4px 0 #00f0ff}97%{transform:translateX(4px);text-shadow:-4px 0 #ff2a6d,4px 0 #00f0ff}}' +
        '#jvPraes .pz-zeile{font-size:19px;padding:7px 0;transform:translateX(-22px) scale(.96)}#jvPraes .pz-zeile.an{transform:none}' +
        '#jvPraes .pz-gross2{font-size:30px;font-weight:800;color:#eaffff;text-shadow:0 0 14px #00c8ff}' +
        '#jvPraes .pz-betrag b{font-size:38px;font-weight:800;color:#eaffff;text-shadow:0 0 16px #00c8ff}' +
        '#jvPraes .pz-links{align-self:flex-start}#jvPraes .pz-rechtsb{justify-content:flex-end;color:#7ff0ff}' +
        '#jvPraes .pz-wort{display:flex;align-items:center;justify-content:center;height:100%}' +
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

    /* ---------------- Szenen (TikTok: schnell, laut, kurze Schnitte) ---------------- */
    function szeneHook() {
        mimik('serious'); blitz(); fortschritt(4);
        caption('ICH WEISS, WO DEIN SCHLÜSSEL LIEGT.');
        var k = karte('<div class="pz-riesig">🔑</div><div class="pz-klein">UND DEINE RECHNUNGEN KENN ICH AUCH</div>');
        setTimeout(function () { grimasse({ browOuterUp_L: .95, browInnerUp: .3, mouthSmile_L: .8, mouthSmile_R: .3 }, 1500); }, 700);
        return sag('Ich weiß, wo dein Schlüssel liegt. Und deine Rechnungen kenne ich auch.');
    }

    function szeneName() {
        blitz(); mimik('happy'); fortschritt(14); caption('');
        karte('<div class="pz-gross pz-glitch">ZANE</div><div class="pz-klein">DEIN PERSÖNLICHER ASSISTENT</div>');
        return sag('Ich bin Zane.');
    }

    function szeneBriefing() {
        blitz(); mimik('friendly'); fortschritt(24); caption('☀️ JEDEN MORGEN');
        var k = karte('<div class="pz-kopf">Guten Morgen, Max</div>' +
            '<div class="pz-zeile">🌤️ <span><b>14 °C</b>, trocken</span></div>' +
            '<div class="pz-zeile">🕕 <span>Frühschicht <b>6:00 Uhr</b></span></div>' +
            '<div class="pz-zeile">🚗 <span>A24: <b class="pz-rot">Stau +<em class="pz-z">0</em> Min.</b></span></div>' +
            '<div class="pz-zeile">🔑 <span>Schlüssel: <b>Küchentisch</b></span></div>');
        setTimeout(function () { zaehle(k.querySelector('.pz-z'), 12, 1200, 0); }, 900);
        var rede = sag('Jeden Morgen: Wetter, Schicht, Stau. Bevor du die Augen richtig auf hast.');
        return Promise.all([warte(300).then(function () { return pop(k, 520); }), rede]);
    }

    function szeneRechnung() {
        blitz(); mimik('thinking'); fortschritt(42); caption('📸 FOTO. ZACK. GELESEN.');
        var k = karte('<div class="pz-foto" style="background-image:url(./beispielrechnung.jpg)"><div class="pz-scan"></div></div>' +
            '<div class="pz-rechts"><div class="pz-kopf">Zane liest</div>' +
            '<div class="pz-zeile">🏢 <span><b>Nordstrom Energie</b></span></div>' +
            '<div class="pz-zeile pz-betrag"><b class="pz-z">0,00 €</b></div>' +
            '<div class="pz-zeile">📅 <span>fällig <b class="pz-gelb">28. Okt.</b></span></div>' +
            '<div class="pz-zeile">⏰ <span class="pz-gruen"><b>Erinnerung ✓</b></span></div></div>');
        setTimeout(function () { var sc = k.querySelector('.pz-scan'); if (sc) sc.classList.add('an'); }, 300);
        var z = k.querySelectorAll('.pz-zeile');
        var ablauf = warte(1900).then(function () { z[0].classList.add('an'); return warte(450); })
            .then(function () { z[1].classList.add('an'); blitz(); zaehle(k.querySelector('.pz-z'), 84.5, 900, 2, ' €'); return warte(1100); })
            .then(function () { z[2].classList.add('an'); return warte(700); })
            .then(function () { z[3].classList.add('an'); });
        var rede = sag('Rechnung abfotografieren. Zack. Gelesen. Vierundachtzig Euro fünfzig, fällig am achtundzwanzigsten. Erinnerung läuft.');
        return Promise.all([ablauf, rede]);
    }

    function szeneRoute() {
        blitz(); mimik('serious'); fortschritt(60); caption('🚗 STAU? KENN ICH.');
        var k = karte('<div class="pz-kopf">Hamburg → Schwarzenbek</div>' +
            '<div class="pz-zeile">⏱️ <span><b class="pz-gross2">34 Min.</b> <span class="pz-rot">+9 Stau</span></span></div>' +
            '<div class="pz-zeile">🛣️ <span>Über B404: <b class="pz-gruen">−6 Min.</b></span></div>' +
            '<div class="pz-zeile">⛽ <span>Diesel <b class="pz-gross2">1,59 €</b> · 2 km</span></div>');
        var rede = sag('Stau? Kenn ich. Umweg? Hab ich. Und der billigste Sprit ist zwei Kilometer weiter.');
        return Promise.all([warte(400).then(function () { return pop(k, 850); }), rede]);
    }

    function szeneDolmetscher() {
        blitz(); mimik('surprised'); fortschritt(74); caption('🌍 LIVE-DOLMETSCHER');
        var k = karte('<div class="pz-kopf">Deutsch ⇄ Türkisch</div>' +
            '<div class="pz-zeile pz-links"><span class="pz-flag">DE</span><span>Wo ist der Bahnhof?</span></div>' +
            '<div class="pz-zeile pz-rechtsb"><span class="pz-flag">TR</span><span><b>İstasyon nerede?</b></span></div>' +
            '<div class="pz-zeile pz-links"><span class="pz-flag">TR</span><span>Düz git, sonra sağa.</span></div>' +
            '<div class="pz-zeile pz-rechtsb"><span class="pz-flag">DE</span><span><b>Geradeaus, dann rechts.</b></span></div>');
        var rede = sag('Türkisch? Kein Problem. Ich dolmetsche live.');
        return Promise.all([warte(500).then(function () { return pop(k, 750); }), rede]);
    }

    function szeneAnsichten() {
        blitz(); mimik('happy'); fortschritt(86); caption('✨ ER KANN AUCH ANDERS');
        var k = karte('<div class="pz-wort"><span class="pz-w">KOPF</span></div>');
        var w = k.querySelector('.pz-w');
        function wort(t, an) { return function () { blitz(); w.textContent = t; w.classList.remove('pz-w2'); void w.offsetWidth; w.classList.add('pz-w2'); ansicht(an); return warte(1500); }; }
        var rede = sag('Kopf. Kugel. Gehirn. Ganz wie du willst.');
        var show = warte(300).then(wort('KOPF', 'kopf')).then(wort('KUGEL', 'kugel')).then(wort('GEHIRN', 'gehirn')).then(function () { ansicht('kopf'); });
        return Promise.all([show, rede]);
    }

    function szeneAbschluss() {
        blitz(); ansicht('kopf'); mimik('laugh'); fortschritt(100); caption('');
        karte('<div class="pz-gross pz-glitch">ZANE</div><div class="pz-klein">ARBEITET FÜR DICH · TAG UND NACHT</div>');
        setTimeout(function () { grimasse({ browOuterUp_L: .95, browInnerUp: .2, mouthSmile_L: .8, mouthSmile_R: .4 }, 1400); }, 600);
        return sag('Ich schlafe nie. Ich beschwere mich nie. Und ich vergesse nichts.')
            .then(function () { grimasse({ eyeSquint_L: .6, eyeSquint_R: .6, mouthSmile_L: 1, mouthSmile_R: 1, browInnerUp: .3 }, 1500); return warte(1700); });
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
        root.appendChild(capEl); root.appendChild(stage); root.insertAdjacentHTML('beforeend','<div class="pz-bar"><i></i></div>');
        root.addEventListener('click', function () { var n = Date.now(); if (n - letzterTipp < 450) stop(); letzterTipp = n; });
        document.body.appendChild(root);
        document.body.classList.add('jv-praesentation');
        ansicht('kopf');
        var g = gen;
        warte(900)
            .then(szeneHook).then(function () { return warte(150); })
            .then(szeneName).then(function () { return warte(150); })
            .then(szeneBriefing).then(function () { return warte(150); })
            .then(szeneRechnung).then(function () { return warte(150); })
            .then(szeneRoute).then(function () { return warte(150); })
            .then(szeneDolmetscher).then(function () { return warte(150); })
            .then(szeneAnsichten).then(function () { return warte(150); })
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
