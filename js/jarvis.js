/* ============================================================
   JARVIS-TON: Jarvis spricht dich mit "Sir" an (sparsam), bestätigt knapp ("Erledigt, Sir.") und mischt trockene mit sachlichen Sätzen.
   Dazu eine kurze START-ANSAGE: einmal am Tag beim ersten Öffnen, z. B. "Systeme online. Guten Morgen, Sir. Heute Frühschicht. Draußen 7 Grad, trocken."
   Sie erscheint sofort als kleine Karte oben; gesprochen wird sie beim ersten Antippen (der Browser erlaubt Sprache erst nach einem Tipp).
   Ein/Aus per Sprache: "Jarvis-Ton aus" / "Jarvis-Ton an" (nur dieser Ton), "Start-Ansage aus" / "Start-Ansage an". Standard: beides an.
   Ernste Themen (Arzt, Geld, Mails ...) bleiben ohne Show: das entscheidet persona.js weiter selbst.
   Braucht: storage.js (getPersistentData/setPersistentData), commands.js (jvCommands), voice.js (speak). persona.js und prompt.js fragen window.jvJarvisTon() ab.
   Fehlt diese Datei, bleibt alles wie vorher.
   ============================================================ */
(function () {
    'use strict';
    var TON_KEY = 'helfer_jarvis_ton', START_KEY = 'helfer_jarvis_start', LAST_KEY = 'helfer_jarvis_start_tag';

    function pd(k, d) { try { return getPersistentData(k, d); } catch (e) { return d; } }
    function sd(k, v) { try { setPersistentData(k, v); } catch (e) {} }
    function tonAn() { return pd(TON_KEY, 'an') !== 'aus'; }
    function startAn() { return pd(START_KEY, 'an') !== 'aus'; }
    window.jvJarvisTon = tonAn;

    /* Zusatz für die KI-Anweisung (persona.js hängt ihn vor den Tonfall-Block) */
    window.jvJarvisBlock = function () {
        if (!tonAn()) return '';
        return 'JARVIS-TON (vom User gewünscht, gilt zusätzlich zur Tonfall-Stufe): Du sprichst den User gelegentlich mit "Sir" an, bei etwa jeder zweiten kurzen Bestätigung ("Erledigt, Sir.", "Wecker auf 6 Uhr, Sir."), nie in jedem Satz und nie mehrfach in einer Antwort. Du DUZT ihn weiterhin ("du", "dir", "dein"), also "Ich erinnere dich rechtzeitig, Sir." und nie "Sie". ' +
            'Dein Ton ist eine Mischung aus trocken und sachlich: knappe Statusmeldungen wie "Erledigt.", "Verstanden.", "Läuft.", dazu bei Gelegenheit ein kurzer, trockener Halbsatz oder eine nützliche Zusatzinfo (Wetter, Verkehr), aber nie unterwürfig: keine Floskeln wie "Zu Diensten", "Sehr gerne" oder "Gern geschehen". ' +
            'Bei Fehlern bleibst du ruhig und sachlich: "Das hat leider nicht funktioniert, Sir. Ich versuche es gleich erneut." Bei ernsten Themen (Gesundheit, Geld, Mails, Notfälle) kein Witz und keine Show, höchstens ein kurzes "Sir".\n\n';
    };

    /* ---------- Start-Ansage ---------- */
    function berlinTag() {
        try { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); } catch (e) { return new Date().toISOString().slice(0, 10); }
    }
    function stunde() {
        var h = parseInt(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false }), 10);
        return isNaN(h) ? new Date().getHours() : h;
    }
    function wochentag() { // 0 = Sonntag
        try { var w = new Date().toLocaleDateString('en-US', { timeZone: 'Europe/Berlin', weekday: 'short' }); return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(w); } catch (e) { return new Date().getDay(); }
    }
    function gruss() {
        var h = stunde();
        if (h >= 5 && h < 11) return 'Guten Morgen';
        if (h >= 11 && h < 18) return 'Guten Tag';
        if (h >= 18 && h < 23) return 'Guten Abend';
        return 'Noch wach';
    }
    function termineHeute() {
        try {
            if (typeof calendarEntries === 'undefined') return null;
            var heute = berlinTag(), jetzt = Date.now(), liste = [];
            calendarEntries.forEach(function (c) {
                var t = new Date(c.isoDate); if (isNaN(t)) return;
                if (t.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) === heute && t.getTime() >= jetzt - 30 * 60000 && !c.allDay) liste.push(t);
            });
            liste.sort(function (a, b) { return a - b; });
            return liste;
        } catch (e) { return null; }
    }
    function uhr(t) {
        var h = 0, m = 0;
        new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(t).forEach(function (x) { if (x.type === 'hour') h = Number(x.value) % 24; if (x.type === 'minute') m = Number(x.value); });
        return m ? h + ' Uhr ' + m : h + ' Uhr';
    }
    function wetterSatz() {
        return new Promise(function (resolve) {
            try {
                if (typeof fetchWeatherData !== 'function') return resolve('');
                var fertig = false, t = setTimeout(function () { if (!fertig) { fertig = true; resolve(''); } }, 4500);
                fetchWeatherData().then(function (w) {
                    if (fertig) return; fertig = true; clearTimeout(t);
                    if (!w || typeof w.temperatur !== 'number') return resolve('');
                    resolve('Draußen ' + w.temperatur + ' Grad, ' + (w.baldRegen ? 'Regen in Sicht.' : 'trocken.'));
                }).catch(function () { if (!fertig) { fertig = true; clearTimeout(t); resolve(''); } });
            } catch (e) { resolve(''); }
        });
    }
    function schichtSatz() {
        try {
            var wd = wochentag(); if (wd === 0 || wd === 6) return '';
            var s = typeof window.jvSchichtHeute === 'function' ? window.jvSchichtHeute() : null;
            return s ? 'Heute ' + s + '.' : '';
        } catch (e) { return ''; }
    }
    function terminSatz() {
        var l = termineHeute();
        if (!l || !l.length) return '';
        return (l.length === 1 ? 'Ein Termin heute, um ' : l.length + ' Termine heute, der nächste um ') + uhr(l[0]) + '.';
    }

    var karte = null, wartetAufTipp = null;
    function zeigen(text) {
        return;   // keine Text-Karte mehr: er spricht, mitlesen ist nicht nötig
        try {
            if (karte) karte.remove();
            karte = document.createElement('div');
            karte.setAttribute('role', 'status');
            karte.style.cssText = 'position:fixed;left:12px;right:12px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:8500;padding:10px 14px;border:1px solid rgba(94,231,255,.55);border-left:3px solid #5ee7ff;border-radius:6px;background:rgba(4,14,24,.92);box-shadow:0 0 18px rgba(0,210,255,.25);color:#cfefff;font:13px/1.35 "IBM Plex Mono",ui-monospace,monospace;letter-spacing:.02em';
            var k = document.createElement('div'); k.textContent = 'SYSTEME ONLINE'; k.style.cssText = 'font-size:10px;letter-spacing:.18em;color:#5ee7ff;margin-bottom:3px';
            var t = document.createElement('div'); t.textContent = text;
            karte.appendChild(k); karte.appendChild(t);
            karte.addEventListener('click', function () { if (karte) { karte.remove(); karte = null; } });
            document.body.appendChild(karte);
            setTimeout(function () { if (karte) { karte.remove(); karte = null; } }, 20000);
        } catch (e) {}
    }
    function sprechenBeimTipp(text) {
        var start = Date.now();
        function los() {
            document.removeEventListener('pointerdown', los, true);
            wartetAufTipp = null;
            if (Date.now() - start > 5 * 60000) return;     // zu spät: nicht mehr vorlesen
            try {
                if (typeof isSpeaking === 'function' && isSpeaking()) return;   // spricht schon etwas anderes
                if (typeof window.wachterIdle === 'function' && !window.wachterIdle()) return;
                if (typeof speak === 'function') setTimeout(function () { try { if (!(typeof isSpeaking === 'function' && isSpeaking())) speak(text); } catch (e) {} }, 350);
            } catch (e) {}
            if (karte) { try { karte.remove(); } catch (e) {} karte = null; }
        }
        wartetAufTipp = los;
        document.addEventListener('pointerdown', los, true);
    }

    async function startAnsage(auchWennSchonHeute) {
        if (!startAn() || !tonAn()) { if (!auchWennSchonHeute) return; }
        var heute = berlinTag();
        if (!auchWennSchonHeute) { if (pd(LAST_KEY, '') === heute) return; sd(LAST_KEY, heute); }
        var teile = ['Systeme online.', gruss() + (gruss() === 'Noch wach' ? '?' : ', Sir.')];
        var s = schichtSatz(); if (s) teile.push(s);
        var w = await wetterSatz(); if (w) teile.push(w);
        var t = terminSatz(); if (t) teile.push(t);
        var text = teile.join(' ');
        zeigen(text);
        if (auchWennSchonHeute) { try { if (typeof speak === 'function') speak(text); } catch (e) {} }
        else sprechenBeimTipp(text);
    }
    window.jvStartAnsage = startAnsage;

    /* nicht bei Alarm-/Briefing-Links und nicht, wenn die App im Hintergrund startet */
    function beimOeffnen() {
        try {
            if (document.hidden) { document.addEventListener('visibilitychange', function f() { if (!document.hidden) { document.removeEventListener('visibilitychange', f); setTimeout(beimOeffnen, 1500); } }); return; }
            if (/[?&](alarm|brief)=/.test(location.search)) return;
            startAnsage(false);
        } catch (e) {}
    }
    setTimeout(beimOeffnen, 3500);

    /* ---------- Sprachbefehle ---------- */
    function norm(t) { return String(t || '').toLowerCase().replace(/[.,!?;:"„“”]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function befehl(text, next) {
        var t = norm(text);
        if (t.length > 40) return next();
        if (/^jarvis[- ]?(?:ton|stil|modus) (?:aus|an|ein)(?:schalten)?$/.test(t)) {
            var aus = /\baus\b/.test(t);
            sd(TON_KEY, aus ? 'aus' : 'an');
            speak(aus ? 'Verstanden. Ich klinge wieder wie vorher.' : 'Jarvis-Ton aktiv, Sir.');
            return true;
        }
        if (/^(?:start[- ]?ansage|begrüßung beim start|startansage) (aus|an|ein)(?:schalten)?$/.test(t)) {
            var a2 = /\baus\b/.test(t);
            sd(START_KEY, a2 ? 'aus' : 'an');
            speak(a2 ? 'Start-Ansage ausgeschaltet.' : 'Start-Ansage eingeschaltet.');
            return true;
        }
        if (/^(?:spiel(?:e)? )?(?:die )?(?:start[- ]?ansage|startansage)(?: ab| noch(?: ?mal)?)?$/.test(t)) { startAnsage(true); return true; }
        return next();
    }
    function einhaengen() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('jarvis', befehl, 35);
        return true;
    }
    if (!einhaengen()) { var n = 0, iv = setInterval(function () { if (einhaengen() || ++n > 40) clearInterval(iv); }, 250); }
})();
