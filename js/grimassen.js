/* GRIMASSEN: Wenn nichts los ist, macht der Kopf von selbst kleine Grimassen
   (Stirn runzeln, Nase rümpfen, Backen aufblasen, Zunge raus, ...).
   - Nur im Leerlauf: nie beim Sprechen, Zuhören oder Nachdenken, und erst nach ein paar Sekunden Ruhe.
   - Lebhaft: im Schnitt alle 4 bis 9 Sekunden etwas Neues.
   - Per Sprache: "Keine Grimassen" / "Grimassen an" / "Mach eine Grimasse".
   - Die Wahl bleibt gespeichert (localStorage, Schlüssel jv_grimassen).
   Nutzt window.jvAvatar3D (avatar3d.js): grimasse(), state, active, busy, ready, tongue(). */
(function () {
    'use strict';

    var KEY = 'jv_grimassen';
    var RUHE_MS = 5000;          // so lange muss Ruhe sein, bevor es losgeht
    var PAUSE_MIN = 4000, PAUSE_ZUSATZ = 5000;   // Pause zwischen zwei Grimassen

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    var an = lsGet(KEY) !== 'aus';

    /* Jede Grimasse: Liste von Schritten { m: {Form: Stärke}, ms: Dauer }. */
    function eine(m, ms, extra) { var g = { name: '', steps: [{ m: m, ms: ms }] }; if (extra) for (var k in extra) g[k] = extra[k]; return g; }
    var GRIMASSEN = [
        /* dezent */
        eine({ browDown_L: .8, browDown_R: .8, mouthPress_L: .3, mouthPress_R: .3 }, 1500),                                   // Stirn runzeln
        eine({ browOuterUp_L: .95, browInnerUp: .2, mouthSmile_L: .25 }, 1300, { spiegeln: true }),                         // eine Braue hoch
        eine({ noseSneer_L: .9, noseSneer_R: .9, mouthUpperUp_L: .4, mouthUpperUp_R: .4, eyeSquint_L: .25, eyeSquint_R: .25 }, 1100), // Nase rümpfen
        eine({ mouthSmile_L: .9, mouthDimple_L: .6, cheekSquint_L: .4, browOuterUp_R: .4 }, 1500, { spiegeln: true }),      // schiefes Grinsen
        eine({ mouthPucker: .85 }, 1100),                                                                                   // Lippen spitzen
        eine({ mouthFrown_L: .8, mouthFrown_R: .8, mouthPucker: .35, browInnerUp: .7 }, 1600),                              // schmollen
        /* lustig */
        eine({ cheekPuff: 1, mouthPucker: .25, eyeWide_L: .3, eyeWide_R: .3 }, 1600),                                       // Backen aufblasen
        { name: 'zunge', zunge: 1500, steps: [{ m: { mouthSmile_L: .5, mouthSmile_R: .5, eyeSquint_L: .3, eyeSquint_R: .3, jawOpen: .25 }, ms: 1600 }] },   // Zunge raus
        eine({ eyeWide_L: 1, eyeWide_R: 1, browInnerUp: .7, browOuterUp_L: .7, browOuterUp_R: .7, jawOpen: .3 }, 1400),     // Augen aufreißen
        { name: 'kiefer', steps: [                                                                                          // Kiefer wackeln
            { m: { jawLeft: .9, mouthLeft: .4, jawOpen: .12 }, ms: 320 }, { m: { jawRight: .9, mouthRight: .4, jawOpen: .12 }, ms: 320 },
            { m: { jawLeft: .9, mouthLeft: .4, jawOpen: .12 }, ms: 320 }, { m: { jawRight: .9, mouthRight: .4, jawOpen: .12 }, ms: 320 }] },
        eine({ mouthStretch_L: .7, mouthStretch_R: .7, mouthSmile_L: 1, mouthSmile_R: 1, eyeSquint_L: .4, eyeSquint_R: .4, jawOpen: .12 }, 1300), // breites Grinsen
        eine({ mouthPucker: .9, mouthFunnel: .5, cheekSquint_L: .3, cheekSquint_R: .3, browInnerUp: .3 }, 1300),            // Fischmund
        eine({ eyeSquint_L: 1, eyeSquint_R: 1, noseSneer_L: .5, noseSneer_R: .5, cheekSquint_L: .7, cheekSquint_R: .7 }, 1200), // Augen zukneifen
        eine({ jawOpen: .85, eyeSquint_L: .7, eyeSquint_R: .7, browInnerUp: .4 }, 1900),                                    // Gähnen
        { name: 'brauentanz', steps: [                                                                                      // Augenbrauen-Tanz
            { m: { browOuterUp_L: .9, browInnerUp: .2 }, ms: 260 }, { m: { browOuterUp_R: .9, browInnerUp: .2 }, ms: 260 },
            { m: { browOuterUp_L: .9, browInnerUp: .2 }, ms: 260 }, { m: { browOuterUp_R: .9, browInnerUp: .2 }, ms: 260 },
            { m: { browOuterUp_L: .9, browOuterUp_R: .9, browInnerUp: .5, mouthSmile_L: .5, mouthSmile_R: .5 }, ms: 700 }] }
    ];

    function spiegeln(m) {
        var out = {};
        for (var k in m) {
            var n = k.replace(/_L$/, '_X').replace(/_R$/, '_L').replace(/_X$/, '_R')
                .replace(/^jawLeft$/, 'jawX').replace(/^jawRight$/, 'jawLeft').replace(/^jawX$/, 'jawRight')
                .replace(/^mouthLeft$/, 'mouthX').replace(/^mouthRight$/, 'mouthLeft').replace(/^mouthX$/, 'mouthRight');
            out[n] = m[k];
        }
        return out;
    }

    var laeuft = false, abbruch = false, sofort = false, timer = 0, letzteAktivitaet = Date.now(), naechste = Date.now() + 6000, letzte = -1;

    function av() { return window.jvAvatar3D; }
    function bereit() {
        var a = av();
        return !!(a && a.ready && a.active && !document.hidden);
    }
    function ruhig() {
        var a = av();
        return !!(a && a.state === 'idle' && !a.busy);
    }

    function ende() {
        laeuft = false; abbruch = false;
        try { av().grimasse(null); } catch (e) {}
        naechste = Date.now() + PAUSE_MIN + Math.random() * PAUSE_ZUSATZ;
    }

    function spiele(g) {
        var a = av(); if (!a || laeuft) return;
        laeuft = true; abbruch = false;
        var spiegel = !!g.spiegeln && Math.random() < .5;
        if (g.zunge && a.tongue) { try { a.tongue(g.zunge); } catch (e) {} }
        var i = 0;
        (function schritt() {
            if (abbruch || !bereit() || !ruhig() || i >= g.steps.length) { ende(); return; }
            var s = g.steps[i++];
            try { a.grimasse(spiegel ? spiegeln(s.m) : s.m); } catch (e) { ende(); return; }
            setTimeout(schritt, s.ms);
        })();
    }

    function zufaellig() {
        var i;
        do { i = Math.floor(Math.random() * GRIMASSEN.length); } while (i === letzte && GRIMASSEN.length > 1);
        letzte = i;
        return GRIMASSEN[i];
    }

    function takt() {
        var jetzt = Date.now();
        if (!bereit() || !ruhig()) {
            letzteAktivitaet = jetzt;
            if (laeuft) abbruch = true;   // sobald er spricht oder zuhört: sofort aufhören
            return;
        }
        if ((!an && !sofort) || laeuft) return;
        if (!sofort && (jetzt - letzteAktivitaet < RUHE_MS || jetzt < naechste)) return;
        sofort = false;
        spiele(zufaellig());
    }
    timer = setInterval(takt, 400);

    /* ---------- Sprache ---------- */
    function sag(t) { try { if (typeof window.speak === 'function') window.speak(t, typeof window.continueConversation === 'function' ? window.continueConversation : undefined); } catch (e) {} }

    var RX_AUS = /^(?:bitte\s+)?(?:keine\s+grimassen(?:\s+mehr)?|grimassen\s+(?:aus|stopp|ausschalten|abschalten)|hör\s+auf\s+(?:mit\s+(?:den\s+)?)?grimassen|lass\s+(?:die\s+)?grimassen(?:\s+sein)?)$/;
    var RX_AN = /^(?:bitte\s+)?(?:grimassen\s+(?:an|einschalten|anschalten|wieder\s+an)|(?:mach|mache)\s+wieder\s+grimassen|wieder\s+grimassen)$/;
    var RX_EINE = /^(?:bitte\s+)?(?:mach|mache|zieh|ziehe|schneid|schneide)\s+(?:mir\s+)?(?:mal\s+)?(?:eine|ne|ein)?\s*(?:grimasse|fratze|gesicht)(?:\s+bitte)?$/;

    function handle(text) {
        var t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 50) return false;
        if (RX_AUS.test(t)) { an = false; lsSet(KEY, 'aus'); abbruch = true; sag('Gut, das Gesicht bleibt ernst.'); return true; }
        if (RX_AN.test(t)) { an = true; lsSet(KEY, 'an'); naechste = Date.now() + 1500; letzteAktivitaet = 0; sag('Grimassen sind wieder an.'); return true; }
        if (RX_EINE.test(t)) {
            if (!bereit()) { sag('Dafür müsste der Kopf gerade sichtbar sein.'); return true; }
            sofort = true;   // läuft los, sobald die App wieder ruhig ist (der Befehl selbst zählt noch als Aktivität)
            return true;
        }
        return false;
    }
    window.handleGrimassenCommand = handle;

    function registerCommand() {
        if (!window.jvCommands) return false;
        window.jvCommands.use('grimassen', function (text, next) {
            try { if (handle(text)) return true; } catch (e) {}
            return next(text);
        }, 150);
        return true;
    }
    if (!registerCommand()) document.addEventListener('DOMContentLoaded', registerCommand);
})();
