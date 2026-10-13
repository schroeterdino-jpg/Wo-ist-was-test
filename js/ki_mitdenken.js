/* ============================================================
   KI-MITDENKEN: Die KI soll nicht nur antworten, sondern mitdenken und handeln.
   Ergänzt die Anweisung (buildSystemPrompt) um einen kurzen Zusatz: Wissen verknüpfen, EINEN sinnvollen nächsten Schritt anbieten,
   Dauerhaftes selbstständig merken, Wissen selbstverständlich einbauen. Die Antworten werden laut vorgelesen, darum bleibt alles kurz.
   Geändert wird nur der Text für die KI, sonst nichts. Aus- und einschalten per Sprache: "KI-Mitdenken aus" / "KI-Mitdenken an" (Standard: an).
   Braucht: commands.js (jvChain, jvCommands). Kann an beliebiger Stelle nach commands.js geladen werden.
   ============================================================ */
(function () {
    const KEY = 'jv_ki_mitdenken';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) !== '0';

    const HINWEIS = '\n\nZUSATZ Mitdenken (du bist ein Partner, der handelt, nicht nur antwortet):\n' +
        '- Verknüpfe das Gesagte still mit dem, was du schon weißt (gedaechtnis_semantisch, Termine, Erinnerungen, Wetter, Schicht im Kontext). Baue dieses Wissen selbstverständlich in die Antwort ein; sage nie "laut meinem Gedächtnis" oder "ich habe gespeichert, dass".\n' +
        '- Hat deine Antwort einen offensichtlich sinnvollen nächsten Schritt (z.B. Termin eingetragen und die Fahrzeit ist unklar, Regen zum Termin im Freien, Überschneidung mit der Schicht, Einkauf fehlt für ein Vorhaben), biete ihn in EINEM kurzen Satz am Ende an. Höchstens ein Vorschlag pro Antwort. Kein Vorschlag bei Warnungen, Gesundheit, Geld, Trauer, Notfällen, wenn du schon eine Rückfrage stellst oder wenn nichts wirklich Sinnvolles naheliegt. Nie etwas als erledigt melden, wofür du keine Aktion angelegt hast.\n' +
        '- Teilt der User etwas Dauerhaftes mit (feste Abläufe, Gewohnheiten, Geräte, Vorlieben, Menschen in seinem Leben), merke es dir selbstständig mit der passenden Aktion (Langzeitgedächtnis) und bestätige nur kurz. Ändert sich ein Fakt, aktualisiere den alten Eintrag statt einen zweiten anzulegen. Nichts Flüchtiges merken.\n' +
        '- Direkt und konkret: erst das Ergebnis, dann höchstens der eine Vorschlag. Keine Floskeln, keine Einleitungen.';

    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'ki-mitdenken', function (next) {
            let base = next();
            if (isOn()) base += HINWEIS;
            return base;
        }, 230);
    }

    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 40 || !/\bki mitdenken\b/.test(t)) return false;
        const say = m => { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} };
        if (/\b(aus|ausschalten|deaktivier\w*)\b/.test(t)) { lsSet(KEY, '0'); say('Gut, ich halte mich mit eigenen Vorschlägen zurück.'); return true; }
        if (/\b(an|ein|einschalten|aktivier\w*)\b/.test(t)) { lsSet(KEY, '1'); say('Gut, ich denke wieder mit.'); return true; }
        say('Das KI-Mitdenken ist ' + (isOn() ? 'an' : 'aus') + '.');
        return true;
    }
    if (window.jvCommands) {
        window.jvCommands.use('ki-mitdenken', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('KI-Mitdenken', e); }
            return next(text);
        }, 92);
    }
    window.jvKiMitdenken = { isOn, handle, HINWEIS };
})();
