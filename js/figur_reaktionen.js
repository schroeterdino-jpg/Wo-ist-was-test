/* ============================================================
   FIGUR-REAKTIONEN: Die Figur (hologramm.js) reagiert auf das, was passiert. Alles ist abschaltbar: "Figur-Animationen aus" / "Figur-Animationen an" (Standard: an).
   1) KARTENWURF: Öffnet sich ein Fenster auf einen Sprachbefehl hin (Termine, Karte, Nachrichten, Tabelle ...) oder die Wetterkarte oder der Tagesüberblick, holt die Figur ein Kärtchen
      mit dem passenden Symbol hervor, wirft es hoch, und das Fenster klappt auf. Beim Antippen von Menü oder Knöpfen gibt es keinen Wurf (keine Wartezeit).
   2) REAKTIONEN auf die Antwort (kurz nachdem Jarvis zu sprechen beginnt, höchstens alle 25 Sekunden eine):
      Regen -> Schirm; Sonne -> Sonnenbrille; Frost -> Hände reiben, Atemwölkchen; Stau -> Blick auf die Uhr, Kopfschütteln;
      "gespeichert/eingetragen" -> Stempel; "erledigt" -> Häkchen; Geburtstag/Glückwunsch -> Partyhut und Konfetti; "Gute Nacht/Tschüss" -> Winken.
   3) Foto gewählt -> Kamera mit Blitz. Lob vom User ("Gut gemacht") -> Verbeugung. Dauert die Antwort über 12 Sekunden -> Klopfen von innen.
   4) Mini-Spiele per Sprache: "Münze werfen" / "Kopf oder Zahl", "Schere Stein Papier".
   Braucht: hologramm.js (jvHolo.react / karteWurf / hoerbar), panels.js (openPanel), weathermap.js (showWeatherMap), photo.js (handlePhotoFile), commands.js, voice.js (speak).
   Ist die Figur aus (andere Ansicht), tut diese Datei nichts. Muss NACH allen genannten Dateien geladen werden.
   ============================================================ */
(function () {
    const KEY = 'jv_figur_anim';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) !== '0';
    const holo = () => window.jvHolo || null;
    const holoOn = () => { try { return document.body.classList.contains('jv-holo') && !!holo(); } catch (e) { return false; } };
    const panelOffen = () => { try { return typeof isPanelOpen === 'function' && isPanelOpen(); } catch (e) { return false; } };
    function say(m) { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    /* ---------- 1) Kartenwurf ---------- */
    const PANEL_ICON = { termine: '📅', erinnerungen: '🔔', einkauf: '📝', aufgaben: '📝', gedaechtnis: '🧠', kontakte: '👤', karte: '🗺️', protokolle: '📋', adressen: '📍', dashboard: '🖥️', nachrichten: '📰', tabelle: '⚽' };
    let lastTap = 0, wirft = false, nachWurf = 0;
    try {
        document.addEventListener('pointerdown', () => { lastTap = Date.now(); }, true);
        document.addEventListener('touchstart', () => { lastTap = Date.now(); }, { capture: true, passive: true });
    } catch (e) {}
    function wurf(icon, tu, args, self) {
        if (!isOn() || !holoOn() || wirft || Date.now() - lastTap < 1500 || Date.now() < nachWurf) return false;
        wirft = true;
        let ok = false;
        try { ok = typeof holo().karteWurf === 'function' && holo().karteWurf(icon, () => { nachWurf = Date.now() + 4000; try { tu.apply(self, args); } catch (e) { console.error('Kartenwurf', e); } wirft = false; }, 2150); } catch (e) { ok = false; }
        if (!ok) wirft = false;
        return ok;
    }
    if (typeof window.openPanel === 'function' && !window.openPanel._wurf) {
        const orig = window.openPanel;
        const w = function (name) {
            try {
                const ico = PANEL_ICON[name];
                const schonOffen = panelOffen() && typeof currentPanel !== 'undefined' && currentPanel && currentPanel.name === name;
                if (ico && !schonOffen && wurf(ico, orig, arguments, this)) return true;
            } catch (e) {}
            return orig.apply(this, arguments);
        };
        w._wurf = true;
        Object.keys(orig).forEach(k => { try { w[k] = orig[k]; } catch (e) {} });
        window.openPanel = w;
    }
    if (typeof window.showWeatherMap === 'function' && !window.showWeatherMap._wurf) {
        const orig = window.showWeatherMap;
        const w = function () {
            try { if (wurf('🌦️', orig, arguments, this)) return; } catch (e) {}
            return orig.apply(this, arguments);
        };
        w._wurf = true;
        window.showWeatherMap = w;
    }

    if (typeof window.uebRender === 'function' && !window.uebRender._wurf) {   // Tagesüberblick (morgens beim Öffnen und per Sprache)
        const orig = window.uebRender;
        const w = function () {
            try { if (wurf('🗓️', orig, arguments, this)) return; } catch (e) {}
            return orig.apply(this, arguments);
        };
        w._wurf = true;
        window.uebRender = w;
    }

    /* ---------- 2) Reaktionen auf die Antwort ---------- */
    let lastReact = 0;
    function react(name, icon, force) {
        if (!isOn() || !holoOn() || wirft) return false;
        if (!force && Date.now() - lastReact < 25000) return false;
        lastReact = Date.now();
        return holo().react(name, icon);
    }
    function wetterText(t) { return /(?:\d+\s*(?:grad|°)|wetter|temperatur|vorhersage|höchstwert|tiefstwert)/.test(t); }
    function pick(text) {
        const t = ' ' + String(text || '').toLowerCase() + ' ';
        if (t.length > 900) return null;
        if (/herzlichen glückwunsch zum geburtstag|alles gute zum geburtstag|hat heute geburtstag|heute hat .{0,30}geburtstag|geburtstag(?:skind)? heute/.test(t)) return 'party';
        if (/\bgute nacht\b|\btschüss\b|\bbis später\b|\bbis morgen\b|\bschönen feierabend\b|\bbis bald\b|schlafen sie gut|schlaf gut|süße träume|angenehme nachtruhe|\bgut(?:e)? nacht\b|\bauf wiedersehen\b|\bbis dann\b|\bschönen abend noch\b|\bschönen tag noch\b|\bmach'?s gut\b|\bpassen sie auf sich auf\b/.test(t)) return 'winken';
        if (/\bstau\b|\bstaus\b|zähfließend|stockender verkehr|verzögerung(?:en)? von|längere fahrzeit/.test(t) && !/kein stau|keine staus|ohne stau/.test(t)) return 'stau';
        if (wetterText(t)) {
            if (/\bregen\b|regnet|schauer|nieselregen|gewitter|starkregen|nass/.test(t) && !/kein regen|keinen regen|trocken/.test(t)) return 'schirm';
            if (/frost|glatteis|\bschnee|minusgrade|unter null|eisig|sehr kalt|\bkalt\b/.test(t)) return 'kalt';
            if (/sonnig|sonne\b|wolkenlos|heiter|strahlend|sommerlich/.test(t)) return 'sonne';
        }
        if (/\berledigt\b|abgehakt|abgeschlossen/.test(t)) return 'haken';
        if (/gespeichert|eingetragen|gemerkt|notiert|angelegt|hinzugefügt|steht jetzt (?:im|in der)/.test(t)) return 'stempel';
        return null;
    }
    function nachHoeren(name, versuche) {
        // erst starten, wenn die Stimme wirklich zu hören ist (Cloud-Stimme braucht 1-2 s Vorlauf)
        let n = 0;
        const iv = setInterval(() => {
            n++;
            let h = false; try { h = holo().hoerbar(); } catch (e) {}
            if (h || n > (versuche || 30)) { clearInterval(iv); react(name, ''); }
        }, 150);
    }
    function wrapSpeak() {
        if (typeof window.speak !== 'function' || window.speak._figur) return;
        const orig = window.speak;
        const w = function (text, cb, lang) {
            try { if (isOn() && holoOn() && !lang && !panelOffen()) { const k = pick(text); if (k) nachHoeren(k, 30); } } catch (e) {}
            return orig.apply(this, arguments);
        };
        w._figur = true;
        Object.keys(orig).forEach(k => { try { w[k] = orig[k]; } catch (e) {} });
        window.speak = w;
    }
    wrapSpeak();
    setTimeout(wrapSpeak, 3000);   // falls hologramm.js speak erst später einhüllt (die letzte Hülle bleibt außen)

    /* ---------- 3) Foto, Lob, Warten ---------- */
    if (typeof window.handlePhotoFile === 'function' && !window.handlePhotoFile._figur) {
        const orig = window.handlePhotoFile;
        const w = function () { try { react('kamera', '', true); } catch (e) {} return orig.apply(this, arguments); };
        w._figur = true;
        window.handlePhotoFile = w;
    }
    setInterval(() => {
        try {
            if (!isOn() || !holoOn()) { t0 = 0; return; }
            const busy = typeof isProcessing !== 'undefined' && isProcessing;
            if (!busy) { t0 = 0; return; }
            if (!t0) t0 = Date.now();
            if (Date.now() - t0 > 12000) { t0 = 0; react('klopfen', ''); }
        } catch (e) {}
    }, 1000);
    let t0 = 0;

    /* ---------- 4) Sprachbefehle ---------- */
    let spiel = null;   // { art:'ssp', at }
    const SSP = ['Schere', 'Stein', 'Papier'], SSP_EMO = { Schere: '✌️', Stein: '✊', Papier: '✋' };
    function sspWin(a, b) { return a === b ? 0 : ((a === 'Schere' && b === 'Papier') || (a === 'Stein' && b === 'Schere') || (a === 'Papier' && b === 'Stein')) ? 1 : -1; }
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t) return false;
        if (t.length <= 50 && /figur[- ]?(?:animation|reaktion)\w*|animationen der figur/.test(t)) {
            if (/\b(aus|ausschalten|deaktivier\w*|stopp?)\b/.test(t)) { lsSet(KEY, '0'); say('Die Figur bleibt jetzt ruhig. Keine Animationen mehr.'); return true; }
            if (/\b(an|ein|einschalten|aktivier\w*)\b/.test(t)) { lsSet(KEY, '1'); say('Die Animationen der Figur sind wieder an.'); return true; }
            say('Die Animationen der Figur sind ' + (isOn() ? 'an' : 'aus') + '.'); return true;
        }
        if (t.length <= 30 && /^(?:figur|animations?)[- ]?test$|^teste? (?:die )?(?:figur|animationen)$/.test(t)) {
            const neu = !!(holo() && typeof holo().karteWurf === 'function' && typeof holo().react === 'function');
            say('Figur-Test. Die Datei für die Animationen ist geladen. Die Figur-Datei ist ' + (holo() ? (neu ? 'auf dem neuen Stand' : 'noch die alte, es fehlt die neue hologramm Datei') : 'nicht da') + '. Die Figur ist ' + (holoOn() ? 'an' : 'aus, schalten Sie die Figur-Ansicht ein') + '. Die Animationen sind ' + (isOn() ? 'an' : 'aus') + '.');
            if (neu && holoOn()) { wirft = false; setTimeout(() => holo().karteWurf('✅', () => {}, 2150), 800); }
            return true;
        }
        // Verabschiedung des Users -> Winken (der Befehl läuft normal weiter)
        if (t.length <= 40 && /\b(?:gute nacht|tschüss|tschuess|tschau|ciao|bis später|bis morgen|bis bald|auf wiedersehen|schönen feierabend|ich gehe schlafen|ich geh schlafen|ich gehe jetzt)\b/.test(t)) { setTimeout(() => react('winken', ''), 1500); return false; }
        // Lob -> Verbeugung (der Befehl läuft normal weiter)
        if (t.length <= 40 && /\b(?:gut gemacht|sehr gut gemacht|super gemacht|toll gemacht|bravo|du bist (?:der beste|klasse|super|toll|spitze)|danke jarvis|danke scarlett)\b/.test(t)) { setTimeout(() => react('verbeugen', ''), 600); return false; }
        // Münze werfen
        if (t.length <= 40 && /\b(?:münze werfen|wirf (?:eine |die )?münze|münzwurf|kopf oder zahl)\b/.test(t)) {
            if (!holoOn() || !isOn()) { say(Math.random() < 0.5 ? 'Kopf.' : 'Zahl.'); return true; }
            const kopf = Math.random() < 0.5;
            wirft = false;
            holo().gimShow('muenze', 3800);
            setTimeout(() => say(kopf ? 'Kopf.' : 'Zahl.'), 3000);
            return true;
        }
        // Schere, Stein, Papier
        if (t.length <= 40 && /schere,? stein,? papier/.test(t)) { spiel = { art: 'ssp', at: Date.now() }; say('Dann los. Sagen Sie Schere, Stein oder Papier.'); return true; }
        if (spiel && spiel.art === 'ssp' && Date.now() - spiel.at < 40000 && t.length <= 30) {
            const m = t.match(/\b(schere|stein|papier)\b/);
            if (m) {
                const du = m[1].charAt(0).toUpperCase() + m[1].slice(1), ich = SSP[(Math.random() * 3) | 0], r = sspWin(du, ich);
                const antwort = () => say('Ich habe ' + ich + '. ' + (r === 0 ? 'Unentschieden.' : r > 0 ? 'Sie gewinnen.' : 'Ich gewinne.'));
                spiel = null;
                if (holoOn() && isOn()) { wirft = false; if (!holo().karteWurf(SSP_EMO[ich], antwort, 2300)) antwort(); }
                else antwort();
                return true;
            }
        }
        return false;
    }
    if (window.jvCommands) {
        window.jvCommands.use('figur-reaktionen', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Figur-Reaktionen', e); }
            return next(text);
        }, 93);
    }

    window.jvFigur = { pick, handle, isOn, react };
})();
