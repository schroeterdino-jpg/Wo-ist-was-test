/* ============================================================
   ANRUFEN FEST: "Ruf Schatz an" wählt immer sofort (in der Jarvis-App; sonst erscheint die Karte zum Antippen), ohne dass die KI den Satz erst deuten muss.
   Auch: Knopf "Anrufen" in der Autoansicht fragt "Wen soll ich anrufen?" und wählt den nächsten Namen, den du sagst.
   Ist der Name nicht eindeutig, fragt rueckfrage.js nach ("Welchen meinst du ...") und führt den Satz danach hier aus.
   Braucht: places.js (findContactForAction, buildCallCard, showActionCards), lists.js, die APK-Funktion ZaneNative.anrufen.
   ============================================================ */
(function () {
    'use strict';
    var wartet = 0;   // Zeitpunkt, bis zu dem der nächste Name als Anruf gilt (nach "Wen soll ich anrufen?")
    function sagen(t, weiter) { try { speak(t, weiter && typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function plain(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }

    /* Name aus dem Satz holen, sonst null. Beispiele: "ruf Schatz an", "ruf mal bitte meine Frau an", "anrufen Schatz", "ruf an bei Matze" */
    function nameAus(t) {
        t = t.replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '').replace(/^(?:kannst du|koenntest du|bitte) /, '');
        var m = t.match(/^(?:ruf|rufe|ruf mal|ruf bitte|ruf mir|telefoniere mit|wahl|waehle|waehl)\s+(?:mal |bitte |mir )*(.+?)(?:\s+bitte)?\s+an$/) ||
                t.match(/^(?:ruf|rufe)\s+(?:mal |bitte )*an(?:\s+bei)?\s+(.+?)(?:\s+bitte)?$/) ||
                t.match(/^(?:ich (?:will|moechte|muss) )?(.+?)\s+anrufen$/);
        if (!m) return null;
        var n = m[1].replace(/^(?:den|die|das|dem|meinen|meine|mein)\s+/, function (x) { return /^(?:meine|meinen|mein)\s/.test(x) ? x : ''; }).trim();
        return n && n.split(' ').length <= 4 ? n : null;
    }

    function wählen(name, direkt) {
        var card;
        try { card = buildCallCard({ contact_name: name }); }
        catch (err) {
            var msg = (err && err.userMessage) || '';
            // Kein Kontakt dazu: nicht im Weg stehen (nur wenn wir ausdrücklich nach einem Namen gefragt haben, sagen wir es)
            if (/nicht gefunden/.test(msg) && !direkt) return false;
            sagen(msg || 'Das konnte ich nicht anrufen.', /mehrere|Welchen/.test(msg));
            return true;
        }
        var wer = String(card.title || '').replace(/ anrufen$/, '');
        try { if (typeof showActionCards === 'function') showActionCards([card]); } catch (e) { }
        var nummer = String(card.href || '').replace(/^tel:/, '');
        var app = !!(window.ZaneNative && typeof window.ZaneNative.anrufen === 'function');
        sagen(app ? 'Ich rufe ' + wer + ' an.' : 'Tippe auf die Karte, dann rufe ich ' + wer + ' an.', false);
        if (app && nummer) setTimeout(function () { try { window.ZaneNative.anrufen(nummer); } catch (e) { } }, 1800);
        return true;
    }

    function befehl(text, next) {
        var t = plain(text);
        if (!t) return next(text);
        var n = nameAus(t);
        if (n) { if (wählen(n, false)) { wartet = 0; return true; } return next(text); }
        if (wartet && Date.now() < wartet && t.split(' ').length <= 4) {
            wartet = 0;
            if (/^(vergiss es|abbrechen|abbruch|egal|nein|stopp|stop|niemanden|keinen)\b/.test(t)) { sagen('In Ordnung.', false); return true; }
            var name = t.replace(/^(?:ruf|rufe|bitte|mal)\s+/, '').replace(/\s+an$/, '').trim();
            if (name && wählen(name, true)) return true;
        }
        return next(text);
    }

    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('anruf', befehl, 0.45);
        return true;
    }
    if (!cmd()) { var k = 0, iv = setInterval(function () { if (cmd() || ++k > 40) clearInterval(iv); }, 250); }
    /* Autoansicht: nach "Wen soll ich anrufen?" gilt der nächste Name als Anruf (30 Sekunden) */
    window.jvAnruf = { warte: function () { wartet = Date.now() + 30000; }, test: nameAus };
})();
