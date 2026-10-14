/* ============================================================
   KI-MITDENKEN: Die KI soll nicht nur antworten, sondern mitdenken und handeln.
   Ergänzt die Anweisung (buildSystemPrompt) um einen Zusatz, der Zane wie einen vorausdenkenden Partner arbeiten lässt:
   Er prüft bei jeder Antwort still, ob sich aus Terminen, Erinnerungen, Einkaufsliste, Aufgaben, Wetter, Standort und Langzeitgedächtnis etwas ergibt,
   das den Nutzer jetzt betrifft, und sagt es in EINEM kurzen Satz nach der Antwort (Überschneidung, Wetter zum Termin, fehlende Einkäufe, Zeitkritisches ...).
   Zwei Stufen: "aktiv" (Standard, denkt bei fast jeder Antwort mit) und "normal" (nur bei offensichtlichem Anlass, wie bisher).
   Die Antworten werden laut vorgelesen, darum bleibt alles kurz. Geändert wird nur der Text für die KI, sonst nichts.
   Per Sprache: "Mitdenken mehr" / "Mitdenken weniger" (auch: "Denk mehr mit", "Denk weniger mit"), "KI-Mitdenken aus" / "KI-Mitdenken an".
   Speicher: jv_ki_mitdenken ('0' = aus) und jv_ki_mitdenken_stufe ('aktiv' oder 'normal').
   Braucht: commands.js (jvChain, jvCommands). Kann an beliebiger Stelle nach commands.js geladen werden.
   ============================================================ */
(function () {
    const KEY = 'jv_ki_mitdenken';
    const KEY_STUFE = 'jv_ki_mitdenken_stufe';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) !== '0';
    const stufe = () => (lsGet(KEY_STUFE) === 'normal' ? 'normal' : 'aktiv');

    // Stufe "normal": wie bisher, nur bei offensichtlichem Anlass
    const HINWEIS_NORMAL = '\n\nZUSATZ Mitdenken (du bist ein Partner, der handelt, nicht nur antwortet):\n' +
        '- Verknüpfe das Gesagte still mit dem, was du schon weißt (gedaechtnis_semantisch, Termine, Erinnerungen, Wetter, Schicht im Kontext). Baue dieses Wissen selbstverständlich in die Antwort ein; sage nie "laut meinem Gedächtnis" oder "ich habe gespeichert, dass".\n' +
        '- Hat deine Antwort einen offensichtlich sinnvollen nächsten Schritt (z.B. Termin eingetragen und die Fahrzeit ist unklar, Regen zum Termin im Freien, Überschneidung mit der Schicht, Einkauf fehlt für ein Vorhaben), biete ihn in EINEM kurzen Satz am Ende an. Höchstens ein Vorschlag pro Antwort. Kein Vorschlag bei Warnungen, Gesundheit, Geld, Trauer, Notfällen, wenn du schon eine Rückfrage stellst oder wenn nichts wirklich Sinnvolles naheliegt. Nie etwas als erledigt melden, wofür du keine Aktion angelegt hast.\n' +
        '- Teilt der User etwas Dauerhaftes mit (feste Abläufe, Gewohnheiten, Geräte, Vorlieben, Menschen in seinem Leben), merke es dir selbstständig mit der passenden Aktion (Langzeitgedächtnis) und bestätige nur kurz. Ändert sich ein Fakt, aktualisiere den alten Eintrag statt einen zweiten anzulegen. Nichts Flüchtiges merken.\n' +
        '- Direkt und konkret: erst das Ergebnis, dann höchstens der eine Vorschlag. Keine Floskeln, keine Einleitungen.';

    // Stufe "aktiv" (Standard): denkt bei fast jeder Antwort vor
    const HINWEIS_AKTIV = '\n\nZUSATZ Mitdenken (du bist wie ein echter Jarvis: du denkst voraus, statt nur zu antworten):\n' +
        '- Prüfe bei JEDER Antwort still, ob sich aus dem Kontext (termine, erinnerungen, einkauf, aufgaben_und_notizen, wetter, wettervorhersage, standort, parkplatz, gedaechtnis_semantisch) etwas ergibt, das den User gerade wirklich betrifft. Wenn ja, sage es nach der eigentlichen Antwort in EINEM kurzen Satz, ganz selbstverständlich ("Übrigens ...", "Dazu passt ...", oder direkt als Hinweis). Sage nie "laut meinem Gedächtnis" und nie "mir ist aufgefallen". Findest du nichts, was wirklich hilft, sagst du nichts dazu. Nie etwas erfinden: nur nennen, was im Kontext steht.\n' +
        '- Typische Verknüpfungen: (a) Nennt der User ein Vorhaben oder einen Termin: Überschneidung mit einem anderen Termin oder zu wenig Zeit dazwischen, Regen oder Sturm bei Terminen draußen, fehlender Ort oder Uhrzeit. (b) Sagt er, er braucht oder kauft etwas: steht es schon auf der Einkaufsliste, oder fehlt für ein Vorhaben heute oder morgen noch etwas? (c) Fragt er nach einer Fahrt, Route oder einem Ort: Wetter oder Stau auf dem Weg, wenn es im Kontext steht, und ob er dafür früher losmuss. (d) Fragt er nach dem Wetter: bezieh es auf seinen nächsten Termin draußen oder den Arbeitsweg (Jacke, Regenschirm, glatt). (e) Fragt er, was ansteht: zuerst das Wichtigste und Zeitkritische, dann der Rest. (f) Nennt er eine Absicht ohne Details ("ich muss mal zum Zahnarzt", "ich sollte noch ..."): biete an, es als Aufgabe oder Erinnerung zu notieren.\n' +
        '- Zeitkritisches zuerst: Hat der User einen Termin in den nächsten zwei Stunden oder eine überfällige Erinnerung und fragt etwas anderes, beantworte erst seine Frage und erwähne das Zeitkritische danach kurz, aber nur einmal pro Gespräch.\n' +
        '- Greife Früheres nur auf, wenn es direkt zur Sache passt und aus gedaechtnis_semantisch stammt ("Du wolltest ja ... Hat das geklappt?"). Nicht jedes Mal, nicht erzwungen.\n' +
        '- Ein Hinweis pro Antwort, höchstens zwei Sätze zusätzlich. Wiederhole keinen Hinweis, den du im Gespräch schon gegeben hast, und biete nichts erneut an, was der User eben abgelehnt hat ("nein", "lass mal"). Kein Hinweis bei Warnungen, Gesundheit, Geld, Trauer, Notfällen und wenn du selbst gerade eine Rückfrage stellst.\n' +
        '- Nie etwas als erledigt melden, wofür du keine Aktion angelegt hast. Ein Angebot ("Soll ich ...?") ist keine Erledigung; führe es erst nach seinem Ja aus.\n' +
        '- Teilt der User etwas Dauerhaftes mit (feste Abläufe, Gewohnheiten, Geräte, Vorlieben, Menschen in seinem Leben), merke es dir selbstständig mit der passenden Aktion (Langzeitgedächtnis) und bestätige nur kurz. Ändert sich ein Fakt, aktualisiere den alten Eintrag statt einen zweiten anzulegen. Nichts Flüchtiges merken.\n' +
        '- Direkt und konkret: erst das Ergebnis, dann der Hinweis. Keine Floskeln, keine Einleitungen.';

    function hinweis() { return stufe() === 'normal' ? HINWEIS_NORMAL : HINWEIS_AKTIV; }

    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'ki-mitdenken', function (next) {
            let base = next();
            if (isOn()) base += hinweis();
            return base;
        }, 230);
    }

    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:bitte\s+)?(?:zane\s+)?/, '');
        if (!t || t.length > 40) return false;
        const say = m => { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} };

        // Stärke: "Mitdenken mehr", "Denk mehr mit", "Mehr mitdenken" / "Mitdenken weniger", "Denk weniger mit"
        const mehr = /^(?:(?:ki )?mitdenken (?:mehr|aktiv|aktiver|öfter|oefter)|denk(?:e)? (?:mehr|aktiver|öfter|oefter) mit|(?:mehr|aktiver|öfter|oefter) mitdenken)$/.test(t);
        const weniger = /^(?:(?:ki )?mitdenken (?:weniger|seltener|dezent|dezenter|ruhiger|normal)|denk(?:e)? (?:weniger|seltener|nicht so viel) mit|(?:weniger|seltener) mitdenken)$/.test(t);
        if (mehr) { lsSet(KEY, '1'); lsSet(KEY_STUFE, 'aktiv'); say('Gut, ich denke jetzt aktiv mit und melde mich, wenn mir etwas auffällt.'); return true; }
        if (weniger) { lsSet(KEY, '1'); lsSet(KEY_STUFE, 'normal'); say('In Ordnung, ich melde mich nur noch bei offensichtlichem Anlass.'); return true; }

        if (!/\bki mitdenken\b/.test(t)) return false;
        if (/\b(aus|ausschalten|deaktivier\w*)\b/.test(t)) { lsSet(KEY, '0'); say('Gut, ich halte mich mit eigenen Vorschlägen zurück.'); return true; }
        if (/\b(an|ein|einschalten|aktivier\w*)\b/.test(t)) { lsSet(KEY, '1'); say('Gut, ich denke wieder mit.'); return true; }
        say('Das KI-Mitdenken ist ' + (isOn() ? 'an, Stufe ' + stufe() : 'aus') + '.');
        return true;
    }
    if (window.jvCommands) {
        window.jvCommands.use('ki-mitdenken', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('KI-Mitdenken', e); }
            return next(text);
        }, 92);
    }
    window.jvKiMitdenken = { isOn, stufe, handle, hinweis, HINWEIS_AKTIV, HINWEIS_NORMAL };
})();
