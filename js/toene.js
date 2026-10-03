/* ============================================================
   TÖNE: Bestätigungs-, Fehler- und Warnton passend zu dem, was Jarvis gleich sagt.
   - Erfolg ("Erledigt", "Notiert", "ist eingetragen", "gespeichert", "steht auf der Einkaufsliste" ...): kurzer, aufsteigender Dreiklang
   - Fehler ("konnte ich nicht", "nicht erreichbar", "hat nicht geklappt" ...): tiefer, absteigender Ton
   - Warnung ("Achtung ...", Unwetterwarnungen): zwei Töne im Wechsel
   Der Ton kommt direkt vor der Stimme. Erkannt wird der Anlass am gesprochenen Text (wie bei sprueche.js); die Dolmetscher-Ausgabe bleibt still.
   Einstellungen > Töne: Schalter, Lautstärke, Test. Per Sprache: "Töne aus", "Töne an", "Töne leiser", "Töne lauter".
   Braucht: audio.js (playSuccessSound, playErrorSound, playAlertSound, setSoundEnabled, setSoundVolume), speak (voice.js). Muss nach voice.js geladen werden.
   ============================================================ */
(function () {
    const SUCCESS = /\b(erledigt|notiert|vermerkt|eingetragen|gespeichert|hinzugefügt|gelöscht|entfernt|verschoben|angelegt|aktualisiert)\b|steht auf der (?:einkaufs)?liste|stehen auf der (?:einkaufs)?liste/i;
    const ERROR = /(konnte ich (?:\w+ )*nicht|kann ich (?:\w+ )*nicht|ich konnte (?:\w+ )*nicht|ich kann (?:\w+ )*nicht|nicht erreichbar|fehlgeschlagen|nicht geklappt|antwortet (?:\w+ )?nicht|nicht verbunden|abgelaufen|ohne standort|keinen standort|nicht eingerichtet|kein zugriff|\bfehler\b|mikrofon-zugriff blockiert)/i;
    const WARN = /^\s*(?:achtung|warnung)\b|unwetterwarnung|wetterwarnung|warnung des deutschen wetterdienstes/i;
    let lastTone = { kind: '', at: 0 };

    function toneFor(text) {
        const t = String(text || '');
        if (!t || t.length > 420) return null;
        if (WARN.test(t)) return 'warn';
        if (ERROR.test(t)) return 'error';
        if (SUCCESS.test(t)) return 'success';
        return null;
    }
    function playTone(kind) {
        const now = Date.now();
        if (lastTone.kind === kind && now - lastTone.at < 1500) return;   // nicht doppelt hintereinander
        lastTone = { kind, at: now };
        try {
            if (kind === 'success' && typeof playSuccessSound === 'function') playSuccessSound();
            else if (kind === 'error' && typeof playErrorSound === 'function') playErrorSound();
            else if (kind === 'warn' && typeof playAlertSound === 'function') playAlertSound();
        } catch (e) {}
    }

    /* speak() umhüllen: Ton auslösen, Text und alles andere unverändert weitergeben */
    if (typeof window.speak === 'function' && !window.speak._toene) {
        const original = window.speak;
        const wrapped = function (text, onComplete, langCode) {
            try { if (!langCode && typeof getSoundEnabled === 'function' && getSoundEnabled()) { const k = toneFor(text); if (k) playTone(k); } } catch (e) {}
            return original.apply(this, arguments);
        };
        wrapped._toene = true;
        window.speak = wrapped;
    }

    /* Einstellungen (Schalter und Lautstärke) mit der Seite verbinden */
    function pct(v) { return Math.round(v * 100) + ' %'; }
    function bindSettings() {
        try {
            const tog = document.getElementById('soundToggle'), vol = document.getElementById('soundVolume'), val = document.getElementById('soundVolumeValue');
            if (tog && typeof getSoundEnabled === 'function') {
                tog.checked = getSoundEnabled();
                tog.addEventListener('change', () => { setSoundEnabled(tog.checked); });
            }
            if (vol && typeof getSoundVolume === 'function') {
                vol.value = String(getSoundVolume());
                if (val) val.textContent = pct(getSoundVolume());
                vol.addEventListener('input', () => { setSoundVolume(vol.value); if (val) val.textContent = pct(getSoundVolume()); });
            }
        } catch (e) {}
    }
    function syncSettingsUi() {
        try {
            const tog = document.getElementById('soundToggle'), vol = document.getElementById('soundVolume'), val = document.getElementById('soundVolumeValue');
            if (tog) tog.checked = getSoundEnabled();
            if (vol) vol.value = String(getSoundVolume());
            if (val) val.textContent = pct(getSoundVolume());
        } catch (e) {}
    }
    bindSettings();

    /* "Töne testen": nacheinander Tipp-Ton, Bestätigung, Fehler, Warnung */
    window.testSounds = function () {
        try {
            if (typeof getSoundEnabled === 'function' && !getSoundEnabled()) setSoundEnabled(true);
            syncSettingsUi();
            playUiBeep();
            setTimeout(() => { if (typeof playSuccessSound === 'function') playSuccessSound(); }, 500);
            setTimeout(() => { if (typeof playErrorSound === 'function') playErrorSound(); }, 1200);
            setTimeout(() => { if (typeof playAlertSound === 'function') playAlertSound(); }, 2000);
        } catch (e) {}
    };

    /* Sprachbefehle: "Töne aus", "Töne an", "Töne leiser", "Töne lauter" */
    function handleToeneCommand(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 50 || !/\b(töne|effekttöne|sounds?|geräusche)\b/.test(t)) return false;
        if (typeof setSoundEnabled !== 'function') return false;
        const say = (m) => speak(m, typeof continueConversation === 'function' ? continueConversation : undefined);
        if (/\b(aus|ausschalten|abschalten|stumm|ausmachen|deaktivier\w*)\b/.test(t)) { setSoundEnabled(false); syncSettingsUi(); say('Die Effekt-Töne sind aus.'); return true; }
        if (/\b(an|ein|einschalten|anschalten|anmachen|aktivier\w*)\b/.test(t) && !/\bleiser|lauter\b/.test(t)) { setSoundEnabled(true); syncSettingsUi(); say('Die Effekt-Töne sind an.'); setTimeout(() => { try { playSuccessSound(); } catch (e) {} }, 300); return true; }
        if (/\bleiser\b/.test(t)) { setSoundEnabled(true); setSoundVolume(getSoundVolume() - 0.3); syncSettingsUi(); say('Etwas leiser.'); return true; }
        if (/\blauter\b/.test(t)) { setSoundEnabled(true); setSoundVolume(getSoundVolume() + 0.3); syncSettingsUi(); say('Etwas lauter.'); setTimeout(() => { try { playUiBeep(); } catch (e) {} }, 300); return true; }
        return false;
    }

    window.handleToeneCommand = handleToeneCommand;
    window._toeneTest = { toneFor };   // nur zum Testen
})();
