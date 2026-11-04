/* ============================================================
   SICHERHEIT (Phase 1): Jarvis soll nie fälschlich Erfolg melden und nie mit leerem Text enden.
   Reine Hilfe für js/assistant.js (sendToGroqSmart). Kein Speicher, kein Netz, keine Sprachausgabe, keine Zeitgeber.

   window.jvSicher.bekannt(action)   false NUR bei einer Aktion mit ausdrücklichem, unbekanntem Typ (die KI hat etwas erfunden, das es nicht gibt).
                                     Ohne Typ (reine Antwort), bekannter Typ, Kalender-Text und harmlose Wörter wie "none" oder "answer" gelten als bekannt.
   window.jvSicher.ohneWirkung(erfolgTypen, okAnzahl, fehler, nichts)
                                     true, wenn nichts Echtes geschehen ist (nur Antworten oder gar nichts) und es auch keine ehrliche Fehler-/Nichts-Meldung gibt.
   window.jvSicher.texte             die festen Sätze: fehlt (fehlende Fähigkeit), unklar (nicht verstanden), technik (technischer Fehler)
   window.jvSicher.merke(art, typ)   merkt sich die letzten 20 Vorfälle NUR im Arbeitsspeicher (Art und Aktionsname, nie der gesprochene Satz).

   Die Liste BEKANNT muss alle Aktionsarten enthalten, die actions.js, assistant.js und die Hüllen kennen. tests/sicherheit.js prüft das gegen den echten Code
   und gegen die Liste in prompt.js: Kommt dort eine Aktionsart dazu, schlägt der Test fehl, bis sie hier steht.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvSicher) return;

    var BEKANNT = {};
    ('chat memory_store memory_search todo calendar calendar_delete calendar_update reminder reminder_delete shopping name_change briefing_add briefing_delete list_edit ' +
     'calendar_search parking_save parking_clear home_save work_save navigate call whatsapp show_panel web_lookup email_check email_read travel_time backup_export ' +
     'nearby_places protocol_save protocol_delete world_news world_live fuel_route bahn episode_store episode_asked episode_forget episode_nicht_fragen phrase_save phrase_delete')
        .split(' ').forEach(function (t) { BEKANNT[t] = true; });

    /* Wörter, mit denen eine KI manchmal "keine Aktion, nur Antwort" meint. Sie sind keine Fähigkeit und dürfen nicht als fehlende Fähigkeit gemeldet werden. */
    var HARMLOS = {};
    ('none null nothing no_action noaction no-action noop answer reply respond response info information message say speak text talk conversation smalltalk small_talk chitchat greeting answer_only')
        .split(' ').forEach(function (t) { HARMLOS[t] = true; });

    var TEXTE = {
        fehlt: 'Das habe ich verstanden, aber dafür fehlt mir noch die passende Fähigkeit. Ich kann es gerade nicht ausführen.',
        unklar: 'Ich bin mir nicht sicher, was du damit möchtest. Soll ich etwas suchen oder speichern, oder möchtest du nur darüber reden?',
        technik: 'Dabei ist bei mir technisch etwas schiefgelaufen. Versuch es bitte gleich noch einmal.',
        unvollstaendig: 'Dazu waren die Angaben unvollständig, deshalb habe ich nichts gespeichert. Sag es bitte noch einmal.',
        nichtAusgefuehrt: 'Moment, das habe ich nicht ausgeführt. Es wurde nichts gespeichert oder eingetragen. Sag es bitte noch einmal.'
    };

    /* Schreib-Parameter einer Aktion (Namen wie in actions.js). Hat ein Objekt solche Angaben, aber keinen gültigen Typ, würde nichts geschrieben,
       die KI-Antwort aber Erfolg behaupten. Ausnahme: calendar_text (executeAction legt dann einen Termin an, auch ohne Typ). */
    var SCHREIB = /^(?:shopping|todo|memory|reminder|calendar|parking|home|work|briefing|protocol|list|episode|phrase|nav|call|whatsapp)_|^new_name$/;
    function leer(v) { return v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length); }
    function hatSchreibParameter(a) { return Object.keys(a).some(function (k) { return SCHREIB.test(k) && !leer(a[k]); }); }
    function text(v) { return typeof v === 'string' && v.trim() !== ''; }
    function pflichtFehlt(a, t) {   // nur die Typen, bei denen die Aktionsausführung ohne diese Angabe NICHTS tut (sonst bleibt das bisherige Verhalten)
        if (t === 'memory_store') return !text(a.memory_key);
        if (t === 'name_change') return !text(a.new_name);
        if (t === 'todo') return !(text(a.todo_text) || (Array.isArray(a.todo_items) && a.todo_items.some(text)));
        return false;
    }
    /* pruefe(action): null = in Ordnung, 'fehlt' = erfundener Typ, 'unvollstaendig' = Schreib-Angaben ohne gültigen Typ oder Pflichtangabe fehlt */
    function pruefe(a) {
        if (!a || typeof a !== 'object') return null;
        var t = a.type;
        var ohneTyp = t === undefined || t === null || t === '';
        var harmlos = typeof t === 'string' && (t === 'chat' || (!BEKANNT[t] && HARMLOS[t.trim().toLowerCase()]));
        if (ohneTyp || harmlos) return a.calendar_text ? null : (hatSchreibParameter(a) ? 'unvollstaendig' : null);
        if (typeof t === 'string' && BEKANNT[t]) return pflichtFehlt(a, t) ? 'unvollstaendig' : null;
        return a.calendar_text ? null : 'fehlt';
    }
    function bekannt(a) { return pruefe(a) === null; }

    /* Behauptet die KI-Antwort, etwas getan zu haben ("Ich habe den Termin eingetragen", "Die Erinnerung ist gespeichert")? Wird nur zusammen mit ohneWirkung() benutzt:
       geschah nichts Echtes, ist die Behauptung falsch. Verneinte Sätze, Fragen und Sätze zu Fragen des Nutzers (Auskunft: "Der Termin ist eingetragen") zählen nicht. */
    var PART = '(?:eingetragen|gespeichert|angelegt|notiert|hinzugefügt|aufgeschrieben|erstellt|gelöscht|entfernt|gemerkt|gesetzt|verschoben|geändert|gebucht|vermerkt|eingeplant|eingestellt|aktualisiert|abgespeichert|eingefügt|abgehakt)';
    var RX_ICH = new RegExp('\\b(?:ich habe|ich hab|habe ich|hab ich)\\b[^.!?]*\\b' + PART + '\\b');
    var RX_PASSIV = new RegExp('\\b(?:ist|sind|wurde|wurden|steht|stehen)\\b[^.!?]{0,40}\\b' + PART + '\\b|^(?:alles |ist )?(?:erledigt|' + PART + ')\\b');
    var RX_NEG = /\b(?:nicht|nichts|nie|niemals|kein|keine|keinen|keinem|noch nicht|leider|konnte|kann)\b/;
    var RX_FRAGE = /^\s*(?:jarvis[, ]+|zane[, ]+)?(?:ist|sind|hab|habe|hast|hat|gibt|steht|stehen|wann|was|wie|wo|welche[rsmn]?|wer|warum|wieso|kann|kannst|könnte|könntest|wird|werden)\b/i;
    function behauptetErfolg(reply, nutzerText) {
        var frage = /\?/.test(String(nutzerText || '')) || RX_FRAGE.test(String(nutzerText || ''));
        var teile = String(reply || '').toLowerCase().match(/[^.!?]+[.!?]*/g) || [];
        return teile.some(function (satz) {
            var st = satz.trim();
            if (!st || /\?\s*$/.test(st) || RX_NEG.test(st)) return false;
            if (RX_ICH.test(st)) return true;
            return !frage && RX_PASSIV.test(st);
        });
    }
    function ohneWirkung(erfolgTypen, okAnzahl, fehler, nichts) {
        if ((fehler && fehler.length) || (nichts && nichts.length)) return false;
        return (erfolgTypen || []).every(function (t) { return !t || t === 'chat' || t === 'memory_search' || (typeof t === 'string' && HARMLOS[t.toLowerCase()] === true); });
    }
    var vorfaelle = [];
    function merke(art, typ) {
        vorfaelle.push({ zeit: Date.now(), art: String(art), typ: String(typ == null ? '' : typ).slice(0, 40) });
        if (vorfaelle.length > 20) vorfaelle.shift();
        try { console.warn('Jarvis-Sicherheit:', art, typ || ''); } catch (e) { }
    }
    window.jvSicher = { bekannt: bekannt, pruefe: pruefe, behauptetErfolg: behauptetErfolg, ohneWirkung: ohneWirkung, texte: TEXTE, merke: merke, vorfaelle: function () { return vorfaelle.slice(); }, _bekannteTypen: function () { return Object.keys(BEKANNT); } };
})();
