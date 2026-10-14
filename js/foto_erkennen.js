/* ============================================================
   FOTO ERKENNEN: Macht man ein Foto, ohne vorher etwas zu sagen, schaut Zane kurz drauf, erkennt, was es ist, und startet gleich die passende
   Funktion. Jede dieser Funktionen fragt selbst nach, bevor etwas gespeichert wird ("Soll ich die Einkaufsliste speichern?",
   "Soll ich Sie an die Rechnung erinnern?", "Soll ich die Termine eintragen?"). Nichts wird ungefragt abgelegt.
   Erkannt wird: Einkaufszettel, Rechnung/Brief/Bescheid, Stundenplan, Plakat/Einladung (Termin), Visitenkarte, Tabelle/Plan/Zettel mit Daten,
   Parkschild, Warnleuchte. Bei allem anderen oder bei Unsicherheit bleiben die Auswahlkarten wie bisher.
   Kostet eine zusätzliche KI-Anfrage pro Foto ohne vorherigen Befehl (Fotos mit Befehl wie "Übersetze das Schild" bleiben unverändert).
   Aus- und einschalten per Sprache: "Foto-Erkennung aus" / "Foto-Erkennung an". Standard: an.
   Hängt sich in photo.js ein und muss nach allen anderen foto_*.js geladen werden.
   Benutzt: askVision, photoJsonObject, runLastPhotoTask, lastPhoto, photoSay. Fehlt photo.js, tut diese Datei nichts.
   ============================================================ */
(function () {
    if (typeof window.photoAskWhatToDo !== 'function' || typeof window.runLastPhotoTask !== 'function') return;

    const KEY = 'jv_foto_erkennen';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) !== '0';

    /* Welche Art -> welche Aufgabe von photo.js / foto_*.js */
    const AUFGABE = {
        einkaufsliste: { task: 'shopping', text: 'Einkaufszettel' },
        brief: { task: 'letter', text: 'Brief oder Rechnung' },
        stundenplan: { task: 'stundenplan', text: 'Stundenplan' },
        termin: { task: 'events', text: 'Termin oder Kalender' },
        visitenkarte: { task: 'contact', text: 'Visitenkarte' },
        tabelle: { task: 'abtippen', text: 'Plan oder Tabelle' },
        parkschild: { task: 'parking', text: 'Parkschild' },
        warnleuchte: { task: 'car', text: 'Warnleuchte' }
    };

    function prompt() {
        return 'Du erkennst, was auf einem Foto zu sehen ist, damit eine Assistenz-App die passende Funktion starten kann. Antworte NUR mit JSON: ' +
            '{"art":"einkaufsliste|brief|stundenplan|termin|visitenkarte|tabelle|parkschild|warnleuchte|sonstiges","sicher":true oder false}. ' +
            'Bedeutung: einkaufsliste = handgeschriebener oder gedruckter Einkaufszettel mit Artikeln; ' +
            'brief = Brief, Rechnung, Mahnung, Bescheid, Vertragsschreiben, Behördenpost, Kontoauszug; ' +
            'stundenplan = Schulstundenplan mit Wochentagen und Fächern; ' +
            'termin = Plakat, Flyer, Einladung, Kalenderblatt oder Terminliste mit Datum und Uhrzeit; ' +
            'visitenkarte = Visitenkarte oder Kontaktdaten einer Person oder Firma; ' +
            'tabelle = Tabelle, Plan, Aufstellung oder Liste mit mehreren Zahlen oder Daten (zum Beispiel Ratenplan, Dienstplan, Preisliste), die keiner der anderen Arten entspricht; ' +
            'parkschild = Verkehrsschild zu Parken oder Halten; warnleuchte = Kontrollleuchte im Auto; ' +
            'sonstiges = alles andere (Landschaft, Personen, Gegenstände, Tiere, Essen, einfache Textseiten). ' +
            '"sicher" ist false, wenn du dir nicht ziemlich sicher bist.';
    }

    let seq = 0, userStarted = 0;
    // Wählt der Nutzer selbst eine Karte oder sagt etwas, während die Erkennung läuft, wird nicht dazwischengefunkt
    const origRun = window.runLastPhotoTask;
    let mine = false;
    window.runLastPhotoTask = function () {
        if (!mine) userStarted = seq;
        return origRun.apply(this, arguments);
    };

    const origAsk = window.photoAskWhatToDo;
    window.photoAskWhatToDo = function () {
        if (!isOn() || typeof askVision !== 'function' || typeof lastPhoto === 'undefined' || !lastPhoto || !lastPhoto.dataUrl) return origAsk.apply(this, arguments);
        const my = ++seq, foto = lastPhoto, dataUrl = lastPhoto.dataUrl;
        // Auswahlkarten sofort zeigen (falls die Erkennung nichts bringt), aber noch nicht die Frage sprechen
        const origSay = window.photoSay;
        window.photoSay = function () {};
        try { origAsk.apply(this, arguments); } finally { window.photoSay = origSay; }
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Erkenne, was das ist...'); } catch (e) {}
        erkennen(my, foto, dataUrl).catch(e => { console.error('Foto erkennen', e && e.message); fallback(my); });
    };

    function fallback(my) {
        if (my !== seq || userStarted === my) return;
        try { window.photoSay('Das Foto ist da. Was soll ich damit tun?'); } catch (e) {}
    }

    async function erkennen(my, foto, dataUrl) {
        let content = '';
        try { content = await askVision(prompt(), 'Was ist auf diesem Foto?', dataUrl, true); } catch (e) { return fallback(my); }
        if (my !== seq || userStarted === my || typeof lastPhoto === 'undefined' || lastPhoto !== foto) return;     // inzwischen anderes Foto oder selbst gewählt
        const o = (typeof photoJsonObject === 'function' ? photoJsonObject(content) : null) || {};
        const art = String(o.art || '').toLowerCase().trim();
        const sicher = !(o.sicher === false || o.sicher === 'false');
        const a = AUFGABE[art];
        if (!a || !sicher) return fallback(my);
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Erkannt: ' + a.text); } catch (e) {}
        mine = true;
        try { await origRun.call(window, a.task, ''); }
        catch (e) { console.error('Foto-Aufgabe', e); fallback(my); }
        finally { mine = false; }
    }

    /* ---------- Sprachbefehl: aus / an ---------- */
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60 || !/foto\s*erkennung|foto\s*automatik|bilder?\s*erkennung/.test(t)) return false;
        const say = m => speak(m, typeof continueConversation === 'function' ? continueConversation : undefined);
        if (/\b(aus|ausschalten|deaktivier\w*|stopp?|nicht)\b/.test(t)) { lsSet(KEY, '0'); say('Die Foto-Erkennung ist aus. Nach einem Foto zeige ich wieder nur die Auswahl.'); return true; }
        if (/\b(an|ein|einschalten|aktivier\w*)\b/.test(t)) { lsSet(KEY, '1'); say('Die Foto-Erkennung ist an. Ich schaue nach einem Foto selbst, was es ist.'); return true; }
        say('Die Foto-Erkennung ist ' + (isOn() ? 'an' : 'aus') + '.');
        return true;
    }
    if (window.jvCommands) {
        window.jvCommands.use('foto-erkennung', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Foto-Erkennung', e); }
            return next(text);
        }, 95);
    }
    window.jvFotoErkennen = { isOn, handle, prompt };
})();
