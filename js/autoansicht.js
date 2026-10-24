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
    let layer = null, tick = null, heimTimer = null, kartenTimer = null, tankTimer = null, wake = null;
    let kartenBox = null, kartenParent = null, kartenNext = null;
    let kopfHolder = null, kopfParent = null, kopfNext = null;   // Kopf-Ansicht: der 3D-Kopf zieht in die Autoansicht um
    function kopfModus() { try { return localStorage.getItem('jv_aa_kopf') === '1'; } catch (e) { return false; } }
    function kopfSpeichern(an) { try { localStorage.setItem('jv_aa_kopf', an ? '1' : '0'); } catch (e) { } }

    function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function sagen(t, weiter) { try { speak(t, weiter && typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function uhrzeit(ms) { return new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }); }
    function $(id) { return document.getElementById(id); }

    const CSS = '#aa-layer{position:fixed;inset:0;z-index:8000;background:#030810;color:#d8f3ff;font-family:"DejaVu Sans Mono",ui-monospace,monospace;display:flex;flex-direction:column;padding:10px 16px 12px;gap:10px;overflow:auto}' +
        '#aa-layer .lab{font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#49d7ff}' +
        '#aa-layer .kopf{display:flex;justify-content:space-between;align-items:center}' +
        '#aa-layer .x{border:2px solid #ff6b6b;color:#ffd6d6;background:rgba(255,80,80,.18);padding:14px 28px;min-height:56px;min-width:150px;font:inherit;font-size:20px;font-weight:700;border-radius:10px}' +
        '#aa-layer .mitte{flex:1;display:flex;flex-wrap:wrap;gap:14px;min-height:0}' +
        '#aa-layer .karte{border:1px solid rgba(73,215,255,.45);background:linear-gradient(160deg,rgba(14,40,60,.85),rgba(5,16,26,.9));border-radius:6px}' +
        '#aa-layer .heim{flex:1 1 320px;border-color:#4cffb0;padding:16px 18px;display:flex;flex-direction:column;justify-content:center}' +
        '#aa-layer .gross{font-size:clamp(44px,13vmin,92px);font-weight:700;line-height:1.05;margin-top:6px}' +
        '#aa-layer .grid{flex:1 1 320px;display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:1fr;gap:12px}' +
        '#aa-layer .knopf{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;min-height:84px;color:#d8f3ff;text-decoration:none;font:inherit;font-size:clamp(15px,3.4vmin,22px);cursor:pointer}' +
        '#aa-layer .knopf span{font-size:clamp(28px,7vmin,46px)}' +
        '#aa-layer .fuss{display:flex;gap:10px;align-items:stretch}' +
        '#aa-layer .fuss .mic{flex:3 1 0!important}' +
        '#aa-layer .fuss .x{flex:1 1 0;min-width:0;min-height:0;padding:10px 8px}' +
        '#aa-layer .mic{border:2px solid #49d7ff;border-radius:40px;padding:12px;text-align:center;color:#49d7ff;font-size:clamp(15px,3vmin,20px);background:none;font-family:inherit}' +
        '#aa-layer #actionCards{max-height:30vh;overflow:auto}' +
        '#aa-layer .dim{color:#8fb4c8}.grn{color:#4cffb0}.org{color:#ffb347}' +
        '#aa-layer.km .mitte{flex-wrap:nowrap;overflow:hidden;gap:10px}' +
        '#aa-layer.km .heim{flex:0 0 24%;min-width:0;padding:8px 10px;overflow:hidden}' +
        '#aa-layer.km .grid{flex:0 0 22%;min-width:0;grid-template-columns:1fr;gap:8px}' +
        '#aa-layer.km .kopfmitte{flex:1 1 auto;min-width:0;min-height:160px;display:flex;align-items:center;justify-content:center;position:relative}' +
        '#aa-layer.km .kopfmitte .holo-container{height:100%!important;width:auto!important;aspect-ratio:1/1;max-width:100%;max-height:100%}' +
        '#aa-layer.km .gross{font-size:clamp(24px,8vh,44px)!important;white-space:nowrap}' +
        '#aa-layer.km #aa-sub{font-size:clamp(11px,2.8vh,15px)!important;margin-top:4px!important;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}' +
        '#aa-layer.km #aa-tank{display:none}' +
        '#aa-layer.km .knopf{flex-direction:row;gap:8px;min-height:0;font-size:clamp(12px,3.2vh,16px)!important}' +
        '#aa-layer.km .knopf span{font-size:clamp(18px,5vh,28px)!important}' +
        '#aa-layer .aa-map{display:none;position:relative;overflow:hidden;padding:0}' +
        '#aa-layer .aa-map .kacheln{position:absolute;inset:0;overflow:hidden;filter:invert(.92) hue-rotate(180deg) saturate(.7)}' +
        '#aa-layer .aa-map .kacheln img{position:absolute;width:256px;height:256px;max-width:none}' +
        '#aa-layer .aa-map .pkt{position:absolute;width:14px;height:14px;margin:-7px 0 0 -7px;border-radius:50%;border:2px solid #fff;z-index:2}' +
        '#aa-layer .aa-map .hin{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:12px;font-size:13px;color:#8fb4c8}' +
        '#aa-layer .aa-map .lab{position:absolute;left:8px;bottom:6px;z-index:2;background:rgba(3,8,16,.8);padding:3px 8px;border-radius:4px;font-size:11px}' +
        /* Sehr breit (Auto-Display): drei Spalten, Karte rechts */
        '@media (orientation:landscape) and (min-aspect-ratio:16/10){' +
          '#aa-layer .mitte{flex-wrap:nowrap;overflow:hidden}' +
          '#aa-layer .heim{flex:1 1 28%;min-width:0}' +
          '#aa-layer .grid{flex:1 1 30%;min-width:0}' +
          '#aa-layer .aa-map{display:block;flex:1 1 42%;min-width:0}' +
          '#aa-layer .heim{padding:8px 10px;overflow:hidden}' +
          '#aa-layer .gross{font-size:clamp(26px,9vh,48px)!important;line-height:1.05;margin-top:2px;white-space:nowrap}' +
          '#aa-layer #aa-sub{font-size:clamp(11px,3vh,15px)!important;margin-top:4px!important;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}' +
          '#aa-layer #aa-tank{display:none}' +
          '#aa-layer .knopf{font-size:clamp(11px,3.2vh,16px)!important;white-space:nowrap;overflow:hidden;padding:2px;gap:2px}' +
          '#aa-layer .knopf span{font-size:clamp(16px,5vh,26px)!important}' +
          '#aa-layer .lab{font-size:11px;letter-spacing:.1em}' +
        '}' +
        /* Querformat (niedriger Bildschirm): alles kompakter, nichts darf die Zeile unten überdecken */
        '@media (orientation:landscape) and (max-height:520px){' +
          '#aa-layer{padding:6px 12px 8px;gap:6px}' +
          '#aa-layer .mitte{flex:1 1 auto;flex-wrap:nowrap;gap:10px;min-height:0;overflow:hidden}' +
          '#aa-layer .heim{flex:1 1 45%;padding:8px 12px;min-width:0;overflow:hidden}' +
          '#aa-layer .gross{font-size:clamp(34px,15vh,70px)}' +
          '#aa-layer .grid{flex:1 1 55%;gap:8px;min-width:0}' +
          '#aa-layer .knopf{min-height:0;gap:2px;font-size:clamp(13px,4.6vh,18px)}' +
          '#aa-layer .knopf span{font-size:clamp(20px,8vh,32px)}' +
          '#aa-layer .x{padding:12px 24px;min-height:52px;font-size:18px}' +
          '#aa-layer .mic{flex:0 0 auto;padding:6px;font-size:13px}' +
          '#aa-layer #actionCards{max-height:26vh}' +
        '}';

    function bauen() {
        const st = document.createElement('style'); st.id = 'aa-style'; st.textContent = CSS; document.head.appendChild(st);
        layer = document.createElement('div'); layer.id = 'aa-layer';
        layer.innerHTML =
            '<div class="kopf"><span class="lab">● Autoansicht <span id="aa-fw" class="dim" style="text-transform:none;letter-spacing:0;margin-left:8px"></span></span><span><span id="aa-uhr" class="dim" style="font-size:15px;margin-right:14px"></span></span></div>' +
            '<div class="mitte">' +
              '<div class="karte heim"><div class="lab grn">Heimweg</div><div id="aa-min" class="gross">…</div><div id="aa-sub" class="dim" style="font-size:clamp(14px,3vmin,20px);margin-top:8px">wird berechnet</div><div id="aa-tank" style="font-size:clamp(13px,2.7vmin,18px);margin-top:16px;line-height:1.5"></div></div>' +
              '<div class="grid">' +
                '<a class="karte knopf" id="aa-heim-knopf" target="_blank" rel="noopener"><span>🧭</span>Nach Hause</a>' +
                '<button type="button" class="karte knopf" id="aa-anruf"><span>📞</span>Anrufen</button>' +
                '<button type="button" class="karte knopf" id="aa-tanken"><span>⛽</span>Tanken</button>' +
                '<button type="button" class="karte knopf" id="aa-park"><span>🅿️</span>Parkplatz</button>' +
              '</div>' +
              (kopfModus() ? '<div class="kopfmitte" id="aa-kopf"></div>' : '<div class="karte aa-map" id="aa-map"><span class="lab">Du und dein Ziel</span></div>') +
            '</div>' +
            '<div id="aa-karten"></div>' +
            '<div class="fuss"><button type="button" class="mic" id="aa-mic">🎤 Tippen oder sag „Hey Jarvis“</button><button type="button" class="x" id="aa-x">✕ beenden</button></div>';
        document.body.appendChild(layer);
        if (kopfModus()) {   // 3D-Kopf (nur das Bild) in die Mitte holen; beim Schließen geht er zurück
            layer.classList.add('km');
            const h = document.querySelector('.holo-container');
            if (h && h.parentNode && $('aa-kopf')) { kopfHolder = h; kopfParent = h.parentNode; kopfNext = h.nextSibling; $('aa-kopf').appendChild(h); }
            if ($('aa-kopf')) $('aa-kopf').onclick = function () { try { if (typeof startListening === 'function') startListening(false); } catch (e) { } };
        }
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
    /* Karte (nur auf sehr breiten Displays): OpenStreetMap-Ausschnitt mit deinem Standort, Bildausschnitt reicht bis zur Heimatadresse */
    let kartenKey = '';
    function merc(lat, lon, z) {
        const n = 256 * Math.pow(2, z), r = lat * Math.PI / 180;
        return { x: (lon + 180) / 360 * n, y: (1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n };
    }
    function hinweis(box, t) {
        box.querySelectorAll('.kacheln,.pkt,.hin').forEach(function (e) { e.remove(); });
        const d = document.createElement('div'); d.className = 'hin'; d.textContent = t; box.insertBefore(d, box.firstChild);
    }
    async function kartenAktualisieren() {
        if (!layer) return;
        try {
            const box = $('aa-map'); if (!box || box.offsetWidth < 50) return;
            const ziel = heimZiel();
            if (!ziel || typeof geocodeAddress !== 'function' || typeof getPosition !== 'function') { hinweis(box, 'Heimatadresse fehlt'); return; }
            const h = await geocodeAddress(ziel);
            if (!h) { hinweis(box, 'Heimatadresse nicht gefunden'); return; }
            let pos = null;
            try { pos = await getPosition({ timeout: 9000, enableHighAccuracy: false, maximumAge: 120000 }); } catch (e) { }
            if (!layer) return;
            if (!pos) { hinweis(box, 'Standort fehlt (Standortzugriff erlaubt?)'); return; }
            const la = pos.coords.latitude, lo = pos.coords.longitude;
            const key = [la, lo, h.lat, h.lon].map(function (v) { return v.toFixed(3); }).join('|') + '|' + box.offsetWidth + 'x' + box.offsetHeight;
            if (key === kartenKey) return; kartenKey = key;
            const W = box.offsetWidth, H = box.offsetHeight;
            let z = 15;
            for (let t = 15; t >= 4; t--) {
                const a = merc(la, lo, t), b = merc(h.lat, h.lon, t);
                if (Math.abs(a.x - b.x) <= W * 0.7 && Math.abs(a.y - b.y) <= H * 0.7) { z = t; break; }
                z = t;
            }
            const A = merc(la, lo, z), B = merc(h.lat, h.lon, z);
            const cx = (A.x + B.x) / 2, cy = (A.y + B.y) / 2, x0 = cx - W / 2, y0 = cy - H / 2, n = Math.pow(2, z);
            box.querySelectorAll('.kacheln,.pkt,.hin').forEach(function (e) { e.remove(); });
            const k = document.createElement('div'); k.className = 'kacheln';
            for (let tx = Math.floor(x0 / 256); tx <= Math.floor((x0 + W) / 256); tx++) {
                for (let ty = Math.floor(y0 / 256); ty <= Math.floor((y0 + H) / 256); ty++) {
                    if (ty < 0 || ty >= n) continue;
                    const im = document.createElement('img');
                    im.alt = ''; im.style.left = Math.round(tx * 256 - x0) + 'px'; im.style.top = Math.round(ty * 256 - y0) + 'px';
                    im.src = 'https://tile.openstreetmap.org/' + z + '/' + (((tx % n) + n) % n) + '/' + ty + '.png';
                    k.appendChild(im);
                }
            }
            box.insertBefore(k, box.firstChild);
            [[A, '#378ADD'], [B, '#E24B4A']].forEach(function (p) {
                const d = document.createElement('div'); d.className = 'pkt'; d.style.background = p[1];
                d.style.left = Math.round(p[0].x - x0) + 'px'; d.style.top = Math.round(p[0].y - y0) + 'px'; box.appendChild(d);
            });
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

    function fahrAnzeige() {
        try {
            const e = $('aa-fw'); if (!e) return;
            const n = window.ZaneNative;
            if (!n || typeof n.fahrAn !== 'function') { e.textContent = '· Vorlesen: neue APK nötig'; return; }
            e.textContent = n.fahrAn() ? '· Vorlesen an' : '· Vorlesen AUS';
        } catch (x) { }
    }

    function oeffnen() {
        if (layer) return;
        bauen();
        fahrFlag(true);
        setTimeout(fahrAnzeige, 600);
        // Kartenbereich hierher umziehen, damit Anruf- und Routenkarten sichtbar sind
        kartenBox = document.getElementById('actionCards');
        if (kartenBox) { kartenParent = kartenBox.parentNode; kartenNext = kartenBox.nextSibling; $('aa-karten').appendChild(kartenBox); }
        const uhr = function () { const e = $('aa-uhr'); if (e) e.textContent = uhrzeit(Date.now()); };
        uhr(); tick = setInterval(uhr, 20000);
        heimAktualisieren(); heimTimer = setInterval(heimAktualisieren, 3 * 60000);
        kartenKey = ''; setTimeout(kartenAktualisieren, 1500); kartenTimer = setInterval(kartenAktualisieren, 2 * 60000);
        tankAktualisieren(); tankTimer = setInterval(tankAktualisieren, 10 * 60000);
        try { if (navigator.wakeLock && navigator.wakeLock.request) navigator.wakeLock.request('screen').then(function (w) { wake = w; }).catch(function () { }); } catch (e) { }
    }
    /* Sicherung: bleibt der Bildschirm länger als 15 Minuten aus (Handy in der Tasche, Auto längst verlassen), schließt sich die Autoansicht und der Fahrmodus geht aus.
       Im Auto bleibt der Bildschirm an (Spiegelung und Wachhalten), dort greift das nie. */
    let dunkelT = null;
    document.addEventListener('visibilitychange', function () {
        clearTimeout(dunkelT); dunkelT = null;
        if (document.visibilityState === 'hidden' && layer) dunkelT = setTimeout(function () { if (layer && document.visibilityState === 'hidden') schliessen(); }, 15 * 60000);
    });
    function schliessen() {
        if (!layer) return;
        clearInterval(tick); clearInterval(heimTimer); clearInterval(tankTimer); clearInterval(kartenTimer);
        fahrFlag(false);
        try { if (wake) wake.release(); } catch (e) { } wake = null;
        if (kartenBox && kartenParent) { try { kartenParent.insertBefore(kartenBox, kartenNext && kartenNext.parentNode === kartenParent ? kartenNext : null); } catch (e) { } }
        kartenBox = kartenParent = kartenNext = null;
        if (kopfHolder && kopfParent) { try { kopfParent.insertBefore(kopfHolder, kopfNext && kopfNext.parentNode === kopfParent ? kopfNext : null); } catch (e) { } }
        kopfHolder = kopfParent = kopfNext = null;
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
        const mitKopf = /\bmit (?:dem )?kopf\b|\bkopf ?ansicht\b/.test(t), ohneKopf = /\bohne (?:den )?kopf\b/.test(t);
        if (mitKopf || ohneKopf) {
            kopfSpeichern(mitKopf);
            if (layer) schliessen();
            oeffnen(); sagen(mitKopf ? 'Autoansicht mit Kopf ist an.' : 'Autoansicht ohne Kopf ist an.', false);
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
