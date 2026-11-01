/* ============================================================
   FOTO ERKENNEN: Macht man ein Foto, ohne vorher etwas zu sagen, schaut Zane kurz drauf, erkennt, was es ist, und startet gleich die passende
   Funktion. Jede dieser Funktionen fragt selbst nach, bevor etwas gespeichert wird ("Soll ich die Einkaufsliste speichern?",
   "Soll ich dich an die Rechnung erinnern?", "Soll ich die Termine eintragen?"). Nichts wird ungefragt abgelegt.
   Erkannt wird: Einkaufszettel, Rechnung/Brief/Bescheid, Stundenplan, Plakat/Einladung (Termin), Visitenkarte, Tabelle/Plan/Zettel mit Daten,
   Parkschild, Warnleuchte. Bei allem anderen oder bei Unsicherheit bleiben die Auswahlkarten wie bisher.
   Kostet eine zusätzliche KI-Anfrage pro Foto ohne vorherigen Befehl (Fotos mit Befehl wie "Übersetze das Schild" bleiben unverändert).
   Unbekanntes Foto (oder unsicher): Jarvis sagt kurz, was er sieht, und FRAGT "Was soll ich damit tun?" (er beschreibt nicht mehr von selbst alles).
   Ist ein einzelner kaufbarer Gegenstand zu sehen (zum Beispiel ein Parfüm), merkt er sich Name und Ladenart. Dann gehen: "Preise vergleichen" /
   "Such die Preise für dieses Parfüm" (Preissuche, preissuche.js fragt window.jvFotoProdukt.preisAnfrage) und "Wo kann ich das in der Nähe kaufen?"
   (Ortssuche: nächster passender Laden; ob der Artikel dort vorrätig ist, kann Jarvis nicht wissen).
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
        essensplan: { task: 'essensplan', text: 'Essensplan' },
        termin: { task: 'events', text: 'Termin oder Kalender' },
        visitenkarte: { task: 'contact', text: 'Visitenkarte' },
        tabelle: { task: 'abtippen', text: 'Plan oder Tabelle' },
        parkschild: { task: 'parking', text: 'Parkschild' },
        warnleuchte: { task: 'car', text: 'Warnleuchte' },
        rezept: { task: 'rezept', text: 'Rezept' },
        urlaubsplan: { task: 'urlaubsplan', text: 'Urlaubsplan' },
        wunschliste: { task: 'wunschliste', text: 'Wunschliste' }
    };

    function prompt() {
        return 'Du erkennst, was auf einem Foto zu sehen ist, damit eine Assistenz-App die passende Funktion starten kann. Antworte NUR mit JSON: ' +
            '{"art":"einkaufsliste|brief|stundenplan|essensplan|termin|visitenkarte|tabelle|parkschild|warnleuchte|rezept|urlaubsplan|wunschliste|sonstiges","sicher":true oder false,"beschreibung":"ein kurzer deutscher Satz, was zu sehen ist, zum Beispiel: ein Ausmalbild mit einem Bären","produkt":"Name oder Marke und Art, wenn ein einzelner kaufbarer Gegenstand im Mittelpunkt steht und du ihn sicher erkennst, zum Beispiel: Chanel Bleu Parfüm; sonst leer","laden":"Ladenart, in der man diesen Gegenstand kauft, genau eine aus: Parfümerie, Drogerie, Supermarkt, Apotheke, Baumarkt, Elektromarkt, Handyladen, Schuhgeschäft, Bekleidungsgeschäft, Buchhandlung, Spielwarengeschäft, Möbelhaus, Fahrradladen, Zoohandlung; sonst leer"}. ' +
            'Bedeutung: einkaufsliste = handgeschriebener oder gedruckter Einkaufszettel mit Artikeln; ' +
            'brief = Brief, Rechnung, Mahnung, Bescheid, Vertragsschreiben, Behördenpost, Kontoauszug; ' +
            'stundenplan = Schulstundenplan mit Wochentagen und Fächern; ' +
            'essensplan = Speiseplan oder Kantinenplan einer Woche mit Wochentagen und Gerichten (Mittagessen); ' +
            'termin = Plakat, Flyer, Einladung, Kalenderblatt oder Terminliste mit Datum und Uhrzeit; ' +
            'visitenkarte = Visitenkarte oder Kontaktdaten einer Person oder Firma; ' +
            'tabelle = Tabelle, Plan, Aufstellung oder Liste mit mehreren Zahlen oder Daten (zum Beispiel Ratenplan, Dienstplan, Preisliste), die keiner der anderen Arten entspricht; ' +
            'parkschild = Verkehrsschild zu Parken oder Halten; warnleuchte = Kontrollleuchte im Auto; ' +
            'rezept = Kochrezept oder Backrezept mit Zutaten und/oder Zubereitungsschritten (Kochbuchseite, Zettel, Zeitschrift, Bildschirmfoto); ' +
            'urlaubsplan = Urlaubsplanung oder Urlaubsantrag: Formular mit Name und mehreren Zeiträumen von-bis für Jahresurlaub (handgeschrieben oder gedruckt); ' +
            'wunschliste = Wunschzettel oder Wunschliste (Weihnachten, Geburtstag), meist von einem Kind, mit mehreren Wünschen untereinander; ' +
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

    window.jvFotoKette.anmelden('photoAskWhatToDo', 'foto_erkennen', 20, function (origAsk) {
        return function () {
            if (!isOn() || typeof askVision !== 'function' || typeof lastPhoto === 'undefined' || !lastPhoto || !lastPhoto.dataUrl) return origAsk.apply(this, arguments);
            const my = ++seq, foto = lastPhoto, dataUrl = lastPhoto.dataUrl;
            // Auswahlkarten sofort zeigen (falls die Erkennung nichts bringt), aber noch nicht die Frage sprechen
            const origSay = window.photoSay;
            window.photoSay = function () {};
            try { origAsk.apply(this, arguments); } finally { window.photoSay = origSay; }
            try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Erkenne, was das ist...'); } catch (e) {}
            erkennen(my, foto, dataUrl).catch(e => { console.error('Foto erkennen', e && e.message); fallback(my); });
        };
    });

    function fallback(my, beschr) {
        if (my !== seq || userStarted === my) return;
        const b = String(beschr || '').replace(/\s+/g, ' ').replace(/[.!?]+$/, '').trim().slice(0, 140);
        try { window.jvFrage && window.jvFrage.neu('photo'); } catch (e) { }
        if (!b) { try { window.photoSay('Das Foto ist da. Was soll ich damit tun?'); } catch (e) {} return; }
        // Unbekanntes Foto: Jarvis sagt kurz, was er sieht, und fragt, was er damit tun soll. Die Auswahlkarten (z. B. WhatsApp senden) bleiben stehen.
        const tipp = (frisch() && stand.name) ? ' Ich kann zum Beispiel die Preise vergleichen, schauen, wo du es in der Nähe kaufen kannst, oder mit Google Lens etwas Ähnliches suchen.' : '';
        try { window.photoSay('Ich sehe: ' + b + '. Was soll ich damit tun?' + tipp); } catch (e) {}
    }

    /* ---------- Produkt auf dem Foto merken (Preise vergleichen, in der Nähe kaufen) ---------- */
    const FRISCH_MS = 10 * 60000;
    let stand = null;   // { name, laden, foto, at }
    function frisch() { return !!(stand && typeof lastPhoto !== 'undefined' && lastPhoto === stand.foto && Date.now() - stand.at < FRISCH_MS); }
    function merkeProdukt(foto, o, unbekannt) {
        const name = String(o.produkt || '').replace(/\s+/g, ' ').trim().slice(0, 80);
        const laden = String(o.laden || '').replace(/\s+/g, ' ').trim().slice(0, 40);
        stand = (name || laden || unbekannt) ? { name, laden, foto, at: Date.now() } : null;   // unbekanntes Foto: auch ohne Namen merken (dann bittet Jarvis um den Namen)
    }
    const nrm = x => String(x || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    /* Preisfrage zum Foto: Name des Produkts, '' wenn Frage erkannt aber kein Name sicher (Hinweis ist gesprochen), null = keine Foto-Preisfrage */
    function preisAnfrage(raw) {
        if (!isOn() || !frisch()) return null;
        const t = nrm(raw);
        if (!t || t.length > 90) return null;
        const BARE = /^(?:(?:ja|bitte|ok|okay)\s+)*(?:(?:vergleich|such|find|check|zeig|recherchier)\w*\s+(?:mir\s+)?(?:bitte\s+)?(?:mal\s+)?(?:die\s+|den\s+)?)?(?:preise?|preisvergleich|angebote?)(?:\s+(?:vergleichen|suchen|raus|heraus|checken|bitte))*$/;
        const FUER = /\b(?:preise?|preisvergleich|angebote?)\b.*\b(?:für|fuer|von|zu)\s+(?:dies\w*|das|den|die|es)(?:\s+\S+){0,2}$/;
        const KOSTET = /^was kostet (?:das|dies\w*|der|die|es)(?:\s+\S+){0,2}$/;
        if (!(BARE.test(t) || FUER.test(t) || KOSTET.test(t))) return null;
        if (stand.name) return stand.name;
        try { window.photoSay('Den Namen auf dem Foto kann ich nicht sicher lesen. Sag mir, wie das Produkt heißt, zum Beispiel: Such die Preise für Chanel Bleu.'); } catch (e) {}
        return '';
    }
    /* "Wo kann ich das in der Nähe kaufen?": nächster passender Laden über die Ortssuche */
    function nahe(raw) {
        if (!isOn() || !frisch()) return false;
        const t = nrm(raw);
        if (!t || t.length > 80) return false;
        const eigene = new Set(nrm(stand.name + ' ' + stand.laden).split(' '));
        const FUELL = new Set(['wo', 'kann', 'könnte', 'ich', 'das', 'dies', 'dieses', 'diesen', 'es', 'hier', 'in', 'der', 'nähe', 'meiner', 'mir', 'bei', 'umgebung', 'kaufen', 'kriegen', 'kriege', 'bekommen', 'bekomme', 'finden', 'finde', 'gibt', 'gibts', 'es', 'bitte', 'mal', 'noch', 'auch', 'produkt', 'ding', 'teil', 'sache', 'artikel', 'zu', 'kaufen']);
        if (!/\b(?:kauf\w*|krieg\w*|bekomm\w*|find\w*|gibt\w*)\b/.test(t) || !/\b(?:das|dies\w*|es)\b/.test(t)) return false;
        if (!t.split(' ').every(w => FUELL.has(w) || eigene.has(w))) return false;
        if (!stand.laden) { try { window.photoSay('Ich weiß nicht, in welchem Laden man das kauft. Soll ich stattdessen die Preise vergleichen?'); } catch (e) {} return true; }
        let ok = false;
        try { ok = typeof window.handleOrtsucheCommand === 'function' && window.handleOrtsucheCommand('Wo ist die nächste ' + stand.laden); } catch (e) { console.error('Foto in der Nähe', e); }
        if (!ok) { try { window.photoSay('Eine ' + stand.laden + ' in der Nähe kann ich gerade nicht suchen. Soll ich die Preise vergleichen?'); } catch (e) {} }
        return true;
    }

    async function erkennen(my, foto, dataUrl) {
        let content = '';
        try { content = await askVision(prompt(), 'Was ist auf diesem Foto?', dataUrl, true); } catch (e) { return fallback(my); }
        if (my !== seq || userStarted === my || typeof lastPhoto === 'undefined' || lastPhoto !== foto) return;     // inzwischen anderes Foto oder selbst gewählt
        const o = (typeof photoJsonObject === 'function' ? photoJsonObject(content) : null) || {};
        const art = String(o.art || '').toLowerCase().trim();
        const sicher = !(o.sicher === false || o.sicher === 'false');
        const a = AUFGABE[art];
        const beschr = String(o.beschreibung || '').trim();
        merkeProdukt(foto, o, !a || !sicher);
        if (!a || !sicher) return fallback(my, beschr);
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Erkannt: ' + a.text); } catch (e) {}
        mine = true;
        try { await origRun.call(window, a.task, ''); }
        catch (e) { console.error('Foto-Aufgabe', e); fallback(my); }
        finally { mine = false; }
    }

    /* ---------- Sprachbefehl: aus / an ---------- */
    function handle(text) {
        if (nahe(text)) return true;
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
    window.jvFotoProdukt = { preisAnfrage, nahe, frisch, _stand: () => stand };
})();
