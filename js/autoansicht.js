/* ============================================================
   AUTOANSICHT: Vollbild-Ansicht für die Fahrt, auch im Querformat (zum Beispiel über den Android-Stick gespiegelt).
   An: "Autoansicht" - Aus: "Autoansicht beenden" oder das ✕ oben rechts. Alles von Hand, nichts passiert automatisch.
   Zeigt: Heimweg-Zeit in großen Ziffern (alle 3 Minuten frisch), den Tanktipp (falls es einen gibt), vier große Knöpfe
   (Nach Hause, Anrufen, Tanken, Parkplatz) und eine Zeile zum Sprechen. Karten, die Jarvis dabei anlegt (Anruf, Route ...), erscheinen in der Ansicht,
   weil der Kartenbereich (#actionCards) solange hierher umgezogen wird.
   Solange sie offen ist, ist der "Fahrmodus" an (ZaneNative.setFahrmodus): dann liest fahr_whatsapp.js WhatsApp-Nachrichten vor.
   Braucht: plan_ansagen.js (window.jvPlan: heimFrisch, heimTank, heimAdresse), places.js (buildMapsLink), voice.js (speak, startListening), commands.js.
   ============================================================ */
(function () {
    let layer = null, tick = null, heimTimer = null, tankTimer = null, wake = null;
    let kartenBox = null, kartenParent = null, kartenNext = null;

    function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function sagen(t, weiter) { try { speak(t, weiter && typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function uhrzeit(ms) { return new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }); }
    function $(id) { return document.getElementById(id); }

    const CSS = '#aa-layer{position:fixed;inset:0;z-index:8000;background:#030810;color:#d8f3ff;font-family:"DejaVu Sans Mono",ui-monospace,monospace;display:flex;flex-direction:column;padding:10px 16px 12px;gap:10px;overflow:auto}' +
        '#aa-layer .lab{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#49d7ff}' +
        '#aa-layer .kopf{display:flex;justify-content:space-between;align-items:center}' +
        '#aa-layer .x{border:1px solid #49d7ff88;color:#49d7ff;background:none;padding:8px 14px;font:inherit;font-size:15px;border-radius:8px}' +
        '#aa-layer .mitte{flex:1;display:flex;flex-wrap:wrap;gap:14px;min-height:0}' +
        '#aa-layer .karte{border:1px solid rgba(73,215,255,.45);background:linear-gradient(160deg,rgba(14,40,60,.85),rgba(5,16,26,.9));border-radius:6px}' +
        '#aa-layer .heim{flex:1 1 320px;border-color:#4cffb0;padding:16px 18px;display:flex;flex-direction:column;justify-content:center}' +
        '#aa-layer .gross{font-size:clamp(44px,13vmin,92px);font-weight:700;line-height:1.05;margin-top:6px}' +
        '#aa-layer .grid{flex:1 1 320px;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:12px}' +
        '#aa-layer .knopf{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:84px;color:#d8f3ff;text-decoration:none;font:inherit;font-size:clamp(15px,3.4vmin,22px);cursor:pointer}' +
        '#aa-layer .knopf span{font-size:clamp(28px,7vmin,46px)}' +
        '#aa-layer .mic{border:2px solid #49d7ff;border-radius:40px;padding:12px;text-align:center;color:#49d7ff;font-size:clamp(15px,3vmin,20px);background:none;font-family:inherit}' +
        '#aa-layer #actionCards{max-height:30vh;overflow:auto}' +
        '#aa-layer .dim{color:#8fb4c8}.grn{color:#4cffb0}.org{color:#ffb347}' +
        /* Querformat (niedriger Bildschirm): alles kompakter, nichts darf die Zeile unten überdecken */
        '@media (orientation:landscape) and (max-height:520px){' +
          '#aa-layer{padding:6px 12px 8px;gap:6px}' +
          '#aa-layer .mitte{flex:1 1 auto;flex-wrap:nowrap;gap:10px;min-height:0;overflow:hidden}' +
          '#aa-layer .heim{flex:1 1 45%;padding:8px 12px;min-width:0;overflow:hidden}' +
          '#aa-layer .gross{font-size:clamp(34px,15vh,70px)}' +
          '#aa-layer .grid{flex:1 1 55%;gap:8px;min-width:0}' +
          '#aa-layer .knopf{min-height:0;gap:2px;font-size:clamp(13px,4.6vh,18px)}' +
          '#aa-layer .knopf span{font-size:clamp(20px,8vh,32px)}' +
          '#aa-layer .x{padding:5px 12px;font-size:13px}' +
          '#aa-layer .mic{flex:0 0 auto;padding:6px;font-size:13px}' +
          '#aa-layer #actionCards{max-height:26vh}' +
        '}';

    function bauen() {
        const st = document.createElement('style'); st.id = 'aa-style'; st.textContent = CSS; document.head.appendChild(st);
        layer = document.createElement('div'); layer.id = 'aa-layer';
        layer.innerHTML =
            '<div class="kopf"><span class="lab">● Autoansicht</span><span><span id="aa-uhr" class="dim" style="font-size:15px;margin-right:14px"></span><button type="button" class="x" id="aa-x">✕ beenden</button></span></div>' +
            '<div class="mitte">' +
              '<div class="karte heim"><div class="lab grn">Heimweg</div><div id="aa-min" class="gross">…</div><div id="aa-sub" class="dim" style="font-size:clamp(14px,3vmin,20px);margin-top:8px">wird berechnet</div><div id="aa-tank" style="font-size:clamp(13px,2.7vmin,18px);margin-top:16px;line-height:1.5"></div></div>' +
              '<div class="grid">' +
                '<a class="karte knopf" id="aa-heim-knopf" target="_blank" rel="noopener"><span>🧭</span>Nach Hause</a>' +
                '<button type="button" class="karte knopf" id="aa-anruf"><span>📞</span>Anrufen</button>' +
                '<button type="button" class="karte knopf" id="aa-tanken"><span>⛽</span>Tanken</button>' +
                '<button type="button" class="karte knopf" id="aa-park"><span>🅿️</span>Parkplatz</button>' +
              '</div>' +
            '</div>' +
            '<div id="aa-karten"></div>' +
            '<button type="button" class="mic" id="aa-mic">🎤 Tippen oder sag „Hey Jarvis“</button>';
        document.body.appendChild(layer);
        $('aa-x').onclick = schliessen;
        $('aa-anruf').onclick = function () { sagen('Wen soll ich anrufen?', true); };
        $('aa-tanken').onclick = function () { frage('Wo ist die nächste Tankstelle'); };
        $('aa-park').onclick = function () { frage('Wo ist mein Auto'); };
        $('aa-mic').onclick = function () { try { if (typeof startListening === 'function') startListening(false); } catch (e) { } };
        $('aa-heim-knopf').onclick = function (ev) {
            const ziel = heimZiel();
            if (!ziel) { ev.preventDefault(); sagen('Ich habe keine Heimatadresse gespeichert.', false); return; }
            this.href = (typeof buildMapsLink === 'function') ? buildMapsLink(ziel, '', 'driving') : 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(ziel) + '&travelmode=driving';
        };
    }
    function heimZiel() { try { return window.jvPlan && window.jvPlan.heimAdresse ? window.jvPlan.heimAdresse() : ''; } catch (e) { return ''; } }
    function frage(text) {
        try { if (typeof window.handleLocalCommand === 'function' && window.handleLocalCommand(text)) return; } catch (e) { }
        try { if (typeof sendToGroqSmart === 'function') sendToGroqSmart(text); } catch (e) { }
    }

    async function heimAktualisieren() {
        if (!layer) return;
        const P = window.jvPlan;
        try {
            if (!P || !P.heimFrisch) { $('aa-min').textContent = '–'; $('aa-sub').textContent = 'Heimweg nicht verfügbar'; return; }
            const f = await P.heimFrisch();
            if (!layer) return;
            if (!f.ziel) { $('aa-min').textContent = '–'; $('aa-sub').textContent = 'Heimatadresse fehlt'; return; }
            if (!f.min) { $('aa-min').textContent = '–'; $('aa-sub').textContent = 'Heimweg gerade nicht berechenbar (Standort erlaubt?)'; return; }
            if (f.min <= 3) { $('aa-min').textContent = 'Zu Hause'; $('aa-sub').textContent = ''; return; }
            $('aa-min').textContent = f.min + ' Min';
            let sub = 'Ankunft ' + uhrzeit(Date.now() + f.min * 60000);
            if (f.stau) sub += ' · ' + String(f.stau).trim().slice(0, 110);
            else if (!f.st) sub += ' · Strecke frei';
            else sub += ' · ' + f.st + ' Min Stau eingerechnet';
            $('aa-sub').textContent = sub;
        } catch (e) { }
    }
    async function tankAktualisieren() {
        if (!layer) return;
        try {
            const P = window.jvPlan; if (!P || !P.heimTank) return;
            const t = await P.heimTank(false);
            if (!layer) return;
            $('aa-tank').innerHTML = t ? '<span class="org">⛽</span> ' + esc(String(t).replace(/^Übrigens:\s*/, '')) : '';
        } catch (e) { }
    }

    /* Der APK sagen, ob der Fahrmodus läuft: nur dann gibt sie WhatsApp von erlaubten Kontakten zum Vorlesen weiter (fahr_whatsapp.js) */
    function fahrFlag(an) { try { const n = window.ZaneNative; if (n && typeof n.setFahrmodus === 'function') n.setFahrmodus(!!an); } catch (e) { } }

    function oeffnen() {
        if (layer) return;
        bauen();
        fahrFlag(true);
        // Kartenbereich hierher umziehen, damit Anruf- und Routenkarten sichtbar sind
        kartenBox = document.getElementById('actionCards');
        if (kartenBox) { kartenParent = kartenBox.parentNode; kartenNext = kartenBox.nextSibling; $('aa-karten').appendChild(kartenBox); }
        const uhr = function () { const e = $('aa-uhr'); if (e) e.textContent = uhrzeit(Date.now()); };
        uhr(); tick = setInterval(uhr, 20000);
        heimAktualisieren(); heimTimer = setInterval(heimAktualisieren, 3 * 60000);
        tankAktualisieren(); tankTimer = setInterval(tankAktualisieren, 10 * 60000);
        try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () { }); } catch (e) { }
    }
    function schliessen() {
        if (!layer) return;
        clearInterval(tick); clearInterval(heimTimer); clearInterval(tankTimer);
        fahrFlag(false);
        try { if (wake) wake.release(); } catch (e) { } wake = null;
        if (kartenBox && kartenParent) { try { kartenParent.insertBefore(kartenBox, kartenNext && kartenNext.parentNode === kartenParent ? kartenNext : null); } catch (e) { } }
        kartenBox = kartenParent = kartenNext = null;
        try { layer.remove(); const s = document.getElementById('aa-style'); if (s) s.remove(); } catch (e) { }
        layer = null;
    }

    function befehl(text, next) {
        const t = norm(text).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '').replace(/^bitte /, '');
        if (!t || t.split(' ').length > 6 || !/\bauto ?ansicht\b/.test(t)) return next(text);
        if (/\b(beenden|beende|aus|ausschalten|schliess\w*|schliesse|zu|verlassen|stopp|ende)\b/.test(t)) {
            if (layer) { schliessen(); sagen('Autoansicht beendet.', false); } else sagen('Die Autoansicht ist gar nicht an.', false);
            return true;
        }
        if (layer) { sagen('Die Autoansicht ist schon an.', false); return true; }
        oeffnen(); sagen('Autoansicht ist an.', false);
        return true;
    }
    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('autoansicht', befehl, 0.3);
        return true;
    }
    if (!cmd()) { let n = 0; const iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }
    /* Beim Einsteigen (Auto-Bluetooth, APK) holt die App Jarvis nach vorn und meldet das mit einem Merker; dann geht die Autoansicht von selbst auf */
    function start() {
        try {
            const n = window.ZaneNative;
            if (n && typeof n.holeAutoansicht === 'function' && n.holeAutoansicht()) { if (!layer) { oeffnen(); sagen('Autoansicht ist an.', false); } }
        } catch (e) { }
        if (!layer) fahrFlag(false);   // Seite frisch geladen und Autoansicht zu: Fahrmodus-Merker der APK zurücksetzen
    }
    setTimeout(start, 1800);   // Seite wurde vom Auto-Bluetooth frisch gestartet
    window.jvAutoansicht = { oeffnen, schliessen, start, offen: function () { return !!layer; } };
})();
