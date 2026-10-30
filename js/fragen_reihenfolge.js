/* ============================================================
   LETZTE FRAGE GEWINNT: ein kurzes "Ja" oder "Nein" gehört der Frage, die Jarvis ZULETZT gestellt hat, nicht dem Modul mit der kleinsten Befehlszahl.
   Jedes Modul hält seine offene Ja/Nein-Frage selbst (mit eigener Frist). Früher bekam das erste Modul der Befehlskette (commands.js) das Ja, auch wenn danach
   eine andere Frage gestellt wurde (Tagesmeldung zuerst, dann Löschfrage: das Ja ging an die Tagesmeldung).

   So geht es: Wer wirklich eine Frage stellt (Ja/Nein oder Auswahl), ruft dort window.jvFrage.neu('<Name des Befehls in commands.js>') auf.
   commands.js fragt vor jedem Eintrag jvFrage.sperrt(name, text): Ein nacktes Ja/Nein (nur diese Wörter, nichts sonst) wird nur an den Eintrag der jüngsten Frage
   durchgelassen; Einträge, die schon einmal gefragt haben und überholt sind, werden dafür übersprungen. Ihr alter Zustand kommt nicht zurück, weil nur eine NEUE Frage
   die jüngste Frage ändert. Läuft die jüngste Frage ab oder ist beantwortet, geht ein weiteres Ja/Nein an niemanden (es wird zur normalen KI-Eingabe).
   - Eine reine Information (ohne Frage) ersetzt nichts. Auch Sätze, die kein nacktes Ja/Nein sind, laufen wie bisher durch alle Einträge.
   - Eine freie Frage der KI im Chat meldet assistant.js als 'ki' an (nur wenn währenddessen kein Modul gefragt hat, zum Beispiel eine Löschfrage über den KI-Weg).
   - Einträge, die sich nie anmelden, werden nie gesperrt und verhalten sich wie bisher.
   - Nur im Speicher: ein Neustart der App vergisst alles (wie die Pending-Zustände der Module). Keine Anfragen, keine Zeitgeber.
   Angemeldet: dirigent, plan_wecker, zuvorkommend, loeschen_fragen, mailaktionen, terminfinder, ausflug, rueckfrage, ki, mailwatch, termin-erinnern (langzeit_erinnern),
   routinen, kuendigung, orte, spotify-auto, fahr_whatsapp, photo (photo.js, foto_brief, foto_adresse, foto_erkennen, foto_abtippen), foto-person, rezepte (foto_rezept),
   antrag, behoerdenbrief, ortsuche, wunschliste, preissuche, panels (die letzten drei fragen ohne eigenen Zustand: sie sperren nur ältere Ja/Nein-Fragen).
   Zwei Antworter hängen nicht in der Befehlskette, sondern direkt in localcommands.js (photo) bzw. in der Hülle um handleLocalCommand (ortsuche): dort prüft je ein
   jvFrage.sperrt('photo'|'ortsuche', text), damit auch ihre alte Frage nach einer neueren nicht zurückkommt.
   ============================================================ */
(function () {
    'use strict';
    const BARE = /^(?:ja|jawohl|jep|jo|joa|jup|gerne|gern|klar|okay|ok|bitte|genau|natuerlich|mach das|mach es|ja bitte|ja gerne|ja klar|ja mach das|ja okay|ja ok|nein|nee|ne|noe|nein danke|danke nein|nicht jetzt|lieber nicht|spaeter)$/;
    const known = new Set();   // Namen, die sich schon einmal angemeldet haben
    let jung = null;           // { name, at }: die zuletzt gestellte Frage
    let anzahl = 0;

    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function neu(name) {
        name = String(name || ''); if (!name) return;
        known.add(name); jung = { name, at: Date.now() }; anzahl++;
    }
    function aktuell() { return jung ? jung.name : null; }
    /* true = dieser Eintrag darf das nackte Ja/Nein nicht bekommen (eine jüngere Frage gehört einem anderen) */
    function sperrt(name, text) {
        if (!jung || name === jung.name || !known.has(name)) return false;
        return BARE.test(norm(text));
    }
    /* KI-Antwort im Chat: eine Frage am Ende zählt als jüngste Frage, sofern währenddessen kein Modul gefragt hat */
    function kiFrage(zaehlerVorher, antwort) {
        if (zaehlerVorher !== anzahl) return;
        if (/\?\s*["”»)\]]*\s*$/.test(String(antwort || ''))) neu('ki');
    }
    window.jvFrage = { neu, aktuell, sperrt, kiFrage, zaehler: function () { return anzahl; } };
})();
