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
        technik: 'Dabei ist bei mir technisch etwas schiefgelaufen. Versuch es bitte gleich noch einmal.'
    };

    function bekannt(a) {
        if (!a || typeof a !== 'object') return true;
        var t = a.type;
        if (t === undefined || t === null || t === '') return true;
        if (typeof t === 'string' && BEKANNT[t]) return true;
        if (a.calendar_text) return true;
        return !!HARMLOS[String(t).trim().toLowerCase()];
    }
    function ohneWirkung(erfolgTypen, okAnzahl, fehler, nichts) {
        if ((fehler && fehler.length) || (nichts && nichts.length)) return false;
        return (erfolgTypen || []).every(function (t) { return !t || t === 'chat' || t === 'memory_search'; });
    }
    var vorfaelle = [];
    function merke(art, typ) {
        vorfaelle.push({ zeit: Date.now(), art: String(art), typ: String(typ == null ? '' : typ).slice(0, 40) });
        if (vorfaelle.length > 20) vorfaelle.shift();
        try { console.warn('Jarvis-Sicherheit:', art, typ || ''); } catch (e) { }
    }
    window.jvSicher = { bekannt: bekannt, ohneWirkung: ohneWirkung, texte: TEXTE, merke: merke, vorfaelle: function () { return vorfaelle.slice(); }, _bekannteTypen: function () { return Object.keys(BEKANNT); } };
})();
