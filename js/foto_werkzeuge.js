/* ============================================================
   FOTO -> WERKZEUGE (Phase 4): verbindet die vorhandene Foto-Erkennung (js/foto_erkennen.js, EINE Bild-Anfrage je Foto) mit der Registry.
   Keine zweite Kamera, keine zweite Erkennung: foto_erkennen.js liefert die Einordnung, diese Datei entscheidet nur, welches vorhandene Werkzeug danach läuft.
   - Produktfoto (Produkt sicher erkannt)  -> Registry "produktsuche" (vorhandene Preissuche + Produktkarten), ohne Rückfrage (reine Recherche)
   - Gerät mit Fehlercode                  -> Registry "websuche" (Bedeutung/Lösung); ohne lesbaren Code fragt Jarvis nach dem Code
   - Textfoto                              -> Jarvis fragt, ob er vorlesen / übersetzen / erklären / zusammenfassen soll ("Erkläre das", "Fasse das zusammen")
   - Rechnung, Visitenkarte, Zettel, Termin ... bleiben bei den vorhandenen Foto-Funktionen (foto_brief, contact ...): sie fragen selbst vor jedem Speichern.
   - Unsicher oder unbekannt -> wie bisher: Jarvis sagt kurz, was er sieht, und fragt, was er damit tun soll.
   Es wird NICHTS gespeichert, gelöscht oder gesendet. Nur lesende Werkzeuge. Nichts wird erfunden: Produkt, Gerät und Code stammen aus der Einordnung des Fotos,
   Preise, Händler und Antworten aus den Werkzeugen.
   Für Anschlussfragen: Ergebnis wird als Antwort gemerkt (jvAnschlussAntwort, Art "foto"), Produkte als Produktliste (Gesprächsgedächtnis) und die Registry-Fähigkeit
   "foto_info" gibt der Chef-KI (Standard AUS) die Einordnung des letzten Fotos (Ketten: foto_info -> produktsuche). Nur Arbeitsspeicher, 10 Minuten.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvFotoWerkzeuge) return;
    var FRISCH_MS = 10 * 60000, CODE_MS = 2 * 60000;
    var stand = null;   // { art, produkt, geraet, code, beschreibung, at, wartetCode }

    function zeile(v, max) { return String(v == null ? '' : v).replace(/[<>{}\[\]]|https?:\/\/\S*/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }
    function codeOk(c) { c = String(c == null ? '' : c).replace(/\s+/g, ' ').trim(); return /^[A-Za-z0-9][A-Za-z0-9 .\/-]{0,14}$/.test(c) && /\d/.test(c) ? c : ''; }
    function frisch() { return !!stand && Date.now() - stand.at < FRISCH_MS; }
    function sag(m) { try { if (typeof photoSay === 'function') photoSay(m); else if (typeof speak === 'function') speak(m); } catch (e) { } }
    function karten(c) { try { if (c && c.length && typeof window.showActionCards === 'function') window.showActionCards(c); } catch (e) { } }
    function merke(frage, text) { try { if (window.jvAnschlussAntwort) window.jvAnschlussAntwort.merke('foto', frage, text); } catch (e) { } }
    function reg() { return window.jvRegistry || null; }
    function frageNeu() { try { window.jvFrage && window.jvFrage.neu('photo'); } catch (e) { } }

    /* ---- Registry: Einordnung des letzten Fotos (nur lesen) ---- */
    function anmelden() {
        var R = reg(); if (!R || R.namen().indexOf('foto_info') >= 0) return;
        R.registriere({
            name: 'foto_info',
            beschreibung: 'Sagt, was auf dem zuletzt gemachten Foto erkannt wurde (Art, Produkt, Gerät, Fehlercode, Beschreibung). Kein neues Foto, keine neue KI-Anfrage. Nur sinnvoll, wenn der Nutzer sich auf das Foto bezieht.',
            pflicht: [], optional: [],
            rueckgabe: { beschreibung: 'Einordnung des letzten Fotos; leere Felder, wenn nichts erkannt wurde.', felder: ['art', 'produkt', 'geraet', 'code', 'beschreibung', 'nachricht'] },
            fehler: [
                { status: 'NO_RESULTS', wann: 'Es gibt kein frisches, erkanntes Foto.' },
                { status: 'CAPABILITY_MISSING', wann: 'Die Foto-Erkennung ist in dieser Umgebung nicht geladen.' }
            ],
            fallbacks: [],
            bestaetigung: { noetig: false, grund: 'Reine Auskunft aus dem Arbeitsspeicher, ändert nichts.' },
            pruefeErfolg: function (d) { return !!d && typeof d.art === 'string' && typeof d.nachricht === 'string' && d.nachricht.trim() !== ''; },
            verbindung: { datei: 'js/foto_werkzeuge.js', funktion: 'jvFotoWerkzeuge.stand' },
            verfuegbar: function () { return true; },
            leer: function (d) { return !!d && d.leer === true; },
            ausfuehren: async function () {
                if (!frisch()) return { leer: true, art: '', produkt: '', geraet: '', code: '', beschreibung: '', nachricht: 'Ich habe gerade kein erkanntes Foto.', reply: 'Ich habe gerade kein erkanntes Foto.' };
                var s = stand, n = 'Auf dem Foto: ' + (s.beschreibung || s.art) + '.' + (s.produkt ? ' Produkt: ' + s.produkt + '.' : '') + (s.geraet ? ' Gerät: ' + s.geraet + '.' : '') + (s.code ? ' Code: ' + s.code + '.' : '');
                var kann = s.produkt ? 'Ich kann Preise und Händler dazu suchen.' : s.art === 'geraet' ? 'Ich kann im Internet nachsehen, was der Fehlercode bedeutet.' : s.art === 'text' ? 'Ich kann den Text vorlesen, übersetzen, erklären oder zusammenfassen.'
                    : s.art === 'brief' ? 'Ich kann den Brief oder die Rechnung auswerten und dich auf Wunsch an die Frist erinnern.' : s.art === 'visitenkarte' ? 'Ich kann daraus auf Wunsch einen Kontakt anlegen.' : 'Sag mir, was ich damit tun soll.';
                n += ' ' + kann;   // nur Möglichkeiten, die es wirklich gibt; ausgeführt wird erst auf Wunsch
                return { art: s.art, produkt: s.produkt, geraet: s.geraet, code: s.code, beschreibung: s.beschreibung, nachricht: n };
            }
        });
    }
    anmelden();

    /* ---- Produktfoto -> Produktsuche ---- */
    async function produktAuto(c, produkt, beschr) {
        var R = reg(), vor = beschr ? 'Ich sehe: ' + beschr + '. ' : '';
        var r = R ? await R.fuehreAus('produktsuche', { suchbegriff: produkt }, { kontext: { text: produkt } }) : null;
        if (!c.gueltig()) return true;   // inzwischen anderes Foto oder selbst gewählt: nichts mehr sagen
        if (r && r.status === 'SUCCESS' && r.ausgefuehrt && r.nachricht) {
            karten(r.daten && r.daten.cards);
            merke('Foto: ' + produkt, r.nachricht);
            sag(vor + r.nachricht);
        } else return false;   // Suche ohne verlässliches Ergebnis: wie bisher sagt Jarvis kurz, was er sieht, und fragt, was er damit tun soll (mit den Angeboten Preise vergleichen / in der Nähe kaufen)
        return true;
    }

    /* ---- Gerät mit Fehlercode -> Recherche ---- */
    async function recherche(geraet, code, gueltig) {
        var R = reg(), frage = (geraet ? geraet + ' ' : '') + 'Fehlercode ' + code + ' Bedeutung und Lösung';
        var r = R ? await R.fuehreAus('websuche', { frage: frage }, { kontext: { text: frage } }) : null;
        if (gueltig && !gueltig()) return true;
        if (r && r.status === 'SUCCESS' && r.ausgefuehrt && r.nachricht) {
            merke('Fehlercode ' + code, r.nachricht);
            sag('Ich habe im Internet zu ' + (geraet ? geraet + ' mit ' : '') + 'Fehlercode ' + code + ' gesucht. ' + r.nachricht);
        } else sag('Ich habe ' + (geraet ? geraet + ' und ' : '') + 'den Code ' + code + ' erkannt, aber die Suche im Internet hat gerade nicht geklappt.');
        return true;
    }
    async function geraetAuto(c, geraet, code, beschr) {
        if (!code) {
            stand.wartetCode = true; frageNeu();
            sag('Ich sehe: ' + (beschr || geraet || 'ein Gerät') + '. Ich kann den Fehlercode nicht sicher lesen. Wie lautet er?');
            return true;
        }
        return recherche(geraet, code, c.gueltig);
    }

    /* ---- Textfoto ---- */
    function textAngebot(beschr) {
        frageNeu();
        var t = 'Ich sehe einen Text' + (beschr ? ': ' + beschr : '') + '. Soll ich ihn vorlesen, übersetzen, erklären oder zusammenfassen?';
        merke('Textfoto', 'Auf dem Foto ist ein Text zu sehen' + (beschr ? ': ' + beschr : '') + '.');
        sag(t);
        return true;
    }

    /* ---- Haken von foto_erkennen.js: true = behandelt ---- */
    async function nachErkennung(c) {
        var o = c.o || {}, art = String(c.art || ''), sicher = c.sicher !== false;
        var produkt = zeile(o.produkt, 60), geraet = zeile(o.geraet, 60), code = codeOk(o.code), beschr = zeile(c.beschr, 140);
        stand = { art: art || 'sonstiges', produkt: produkt, geraet: geraet, code: code, beschreibung: beschr, at: Date.now(), wartetCode: false };
        if (!sicher) return false;                                   // unsicher: bisherige Rückfrage "Was soll ich damit tun?"
        if (art === 'geraet' && (geraet || code || beschr)) return geraetAuto(c, geraet, code, beschr);
        if (art === 'text') return textAngebot(beschr);
        if ((art === 'sonstiges' || !art) && produkt.length >= 3 && /[A-Za-zÄÖÜäöüß]/.test(produkt)) return produktAuto(c, produkt, beschr);
        return false;
    }

    /* ---- Sprache: "Erkläre das", "Fasse das zusammen", Antwort auf die Frage nach dem Fehlercode ---- */
    function norm(t) { return String(t || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function fotoDa() { try { return typeof lastPhoto !== 'undefined' && !!lastPhoto && Date.now() - lastPhoto.at < FRISCH_MS; } catch (e) { return false; } }
    function handle(text) {
        var t = norm(text);
        if (!t || t.length > 60) return false;
        if (stand && stand.wartetCode && Date.now() - stand.at < CODE_MS) {
            var m = t.match(/^(?:(?:der|es ist|das ist|fehlercode|code|ist|er lautet)\s+)*([a-z]{0,3}[\s-]?\d{1,4}[a-z0-9]{0,3})$/i);
            var cd = m ? codeOk(m[1].toUpperCase()) : '';
            if (cd) { stand.wartetCode = false; stand.code = cd; recherche(stand.geraet, cd).catch(function () { }); return true; }
        }
        if (!fotoDa() || typeof window.runLastPhotoTask !== 'function') return false;
        var erkl = /^(?:bitte\s+)?erkl[aä]r\w*\s+(?:mir\s+)?(?:das|dies\w*|es|den text)(?:\s+(?:bitte|kurz|einfach|mal))*$/.test(t);
        var zus = /^(?:bitte\s+)?fass\w*\s+(?:mir\s+)?(?:das|dies\w*|es|den text)\s+(?:(?:bitte|kurz|mal)\s+)*zusammen$/.test(t);
        if (!erkl && !zus) return false;
        window.runLastPhotoTask('describe', erkl ? 'Erkläre mir den Text auf dem Foto in einfachen, kurzen Worten.' : 'Fasse den Text auf dem Foto in zwei bis drei Sätzen zusammen.').catch(function () { sag('Die Auswertung hat gerade nicht geklappt.'); });
        return true;
    }
    /* Kein eigener Befehl: foto_erkennen.js ruft handle() in seinem bestehenden Befehl "foto-erkennung" auf (die Befehlsliste bleibt unverändert). */
    window.jvFotoWerkzeuge = { nachErkennung: nachErkennung, handle: handle, stand: function () { return stand ? JSON.parse(JSON.stringify(stand)) : null; }, frisch: frisch, vergiss: function () { stand = null; } };
})();
