/* ============================================================
   fotosenden.js – das Foto selbst per WhatsApp verschicken
   ============================================================
   - Nach jedem Foto erscheint in der Auswahl eine Karte "Per WhatsApp senden".
   - Sprache: "Schick das Foto per WhatsApp" / "Verschick das Bild über WhatsApp".
   - Ähnliches finden: Karte "Ähnliches suchen" und Sprache "Finde etwas Ähnliches" / "Such das mit Google Lens": Das Foto geht an Google Lens
     (Jarvis-App, neue APK nötig), Lens sucht selbst ähnliche Produkte. Im Browser nicht möglich.
   - In der Jarvis-App (ab v22) wird das Foto an WhatsApp übergeben, dort suchst du die Person aus.
     Im Browser öffnet sich stattdessen das Teilen-Fenster des Handys, sofern es Dateien teilen kann.
   Braucht: photo.js (lastPhoto, runLastPhotoTask), places.js (showActionCards), commands.js (jvCommands). Wird ganz am Ende der Skripte geladen.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvFotoSenden) return;

    const FRISCH_MS = 60 * 60 * 1000;   // so lange gilt "das Foto" für das zuletzt gewählte Bild

    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function norm(t) {
        return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
            .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    }
    function foto() {
        try {
            if (typeof lastPhoto !== 'undefined' && lastPhoto && lastPhoto.dataUrl && Date.now() - lastPhoto.at < FRISCH_MS) return lastPhoto;
        } catch (e) { }
        return null;
    }

    async function senden() {
        const f = foto();
        if (!f) { sagen('Ich habe gerade kein Foto, das ich schicken könnte. Mach zuerst ein Foto oder wähl eins aus.'); return false; }
        const N = window.ZaneNative;
        if (N && typeof N.shareImage === 'function') {
            let ok = false;
            try { ok = !!N.shareImage(f.dataUrl, ''); } catch (e) { ok = false; }
            if (ok) { sagen('WhatsApp öffnet sich. Such dort die Person aus, der du das Foto schicken willst.'); return true; }
            sagen('Das Foto konnte ich nicht an WhatsApp übergeben.');
            return false;
        }
        if (N) { sagen('Zum Verschicken von Fotos brauchst du die neue Jarvis-App. Bitte installiere die neueste Version.'); return false; }
        // Browser: Teilen-Fenster des Handys
        try {
            const blob = await (await fetch(f.dataUrl)).blob();
            const file = new File([blob], 'Jarvis.jpg', { type: 'image/jpeg' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file] }); return true; }
        } catch (e) { if (e && e.name === 'AbortError') return true; }
        sagen('Das Foto kann ich nur aus der Jarvis-App verschicken.');
        return false;
    }

    /* Foto an Google Lens übergeben: Lens sucht selbst ähnliche Produkte (Jarvis-App, neue APK) */
    async function lens() {
        const f = foto();
        if (!f) { sagen('Ich habe gerade kein Foto, das ich suchen könnte. Mach zuerst ein Foto oder wähl eins aus.'); return false; }
        const N = window.ZaneNative;
        if (N && typeof N.lensSuchen === 'function') {
            let ok = false;
            try { ok = !!N.lensSuchen(f.dataUrl); } catch (e) { ok = false; }
            if (ok) { sagen('Google Lens öffnet sich und sucht ähnliche Produkte. Erscheint eine Liste, tippe auf Lens.'); return true; }
            sagen('Das Foto konnte ich nicht an Google Lens übergeben.');
            return false;
        }
        if (N) { sagen('Dafür brauchst du die neue Jarvis-App. Bitte installiere die neueste Version.'); return false; }
        sagen('Google Lens kann ich nur aus der Jarvis-App öffnen.');
        return false;
    }

    /* Karte "Per WhatsApp senden" in jede Foto-Auswahl einfügen (die Auswahlkarten bauen mehrere Dateien). Läuft über die Foto-Kette (js/foto_kette.js), Rang 10 = ganz außen. */
    if (typeof window.showActionCards === 'function') {
        window.jvFotoKette.anmelden('showActionCards', 'fotosenden', 10, function (orig) {
            return function (cards) {
                try {
                    if (Array.isArray(cards)
                        && cards.some(c => c && typeof c.onclick === 'string' && c.onclick.indexOf('runLastPhotoTask(') >= 0)
                        && !cards.some(c => c && typeof c.onclick === 'string' && c.onclick.indexOf('jvFotoSenden') >= 0)) {
                        cards = cards.concat([{ icon: '📤', title: 'Per WhatsApp senden', subtitle: 'Das Foto selbst verschicken', onclick: 'jvFotoSenden.senden()' },
                            { icon: '🔎', title: 'Ähnliches suchen', subtitle: 'Mit Google Lens', onclick: 'jvFotoSenden.lens()' }]);
                    }
                } catch (e) { }
                return orig.call(this, cards);
            };
        });
    }

    const LENS_WORTE = new Set(['mir', 'dir', 'etwas', 'was', 'sowas', 'so', 'dazu', 'dafuer', 'davon', 'das', 'dem', 'dieses', 'diesem', 'hier', 'bitte', 'mal', 'noch', 'im', 'netz', 'online', 'produkte', 'produkt', 'artikel', 'sachen', 'ding', 'aehnliches', 'aehnliche', 'aehnlicher', 'aehnlich', 'google', 'lens', 'mit', 'per', 'bei', 'nach', 'zu', 'ein', 'eine', 'foto', 'bild', 'jarvis']);
    /* Sprachbefehl: "Schick das Foto per WhatsApp" */
    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 14) return next(text);
        /* "Finde etwas Ähnliches", "Such das mit Google Lens": nur mit einem frischen Foto, und nur wenn der Satz sonst nichts Eigenes sagt */
        if (/\blens\b/.test(t) && t.split(' ').length <= 8 && foto()) { lens(); return true; }
        if (/\baehnlich\w*\b/.test(t) && foto() && Date.now() - foto().at < 10 * 60 * 1000 && /\b(?:find|such|zeig|gib|hol|schau|check)\w*\b/.test(t)
            && t.split(' ').every(w => LENS_WORTE.has(w) || /^(?:find|such|zeig|gib|hol|schau|check|aehnlich)\w*$/.test(w))) { lens(); return true; }
        const whats = /\bwhats ?app\b|\bwhatsapp\b/.test(t);
        const verb = /\b(schick\w*|send\w*|verschick\w*|teil\w*|weiterleit\w*)\b/.test(t);
        if (!(whats && verb && /\b(foto\w*|bild\w*|photo\w*|ausmalbild\w*|aufnahme)\b/.test(t))) return next(text);
        if (/\brezept\w*\b/.test(t)) return next(text);
        senden();
        return true;
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('fotosenden', befehl, 4);

    window.jvFotoSenden = { senden, lens };
})();
