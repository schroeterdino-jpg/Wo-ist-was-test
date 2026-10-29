/* ============================================================
   FESTE NAMEN: korrigiert Wörter, die die Spracherkennung IMMER falsch schreibt, ganz am Anfang (vor allen Sprachbefehlen).
   Beispiel: "Route zu Alicia" -> "Route zu Alyssa". Ergänzt die lernbare Hör-Korrektur (hoerkorrektur.js), die weiter innen sitzt.
   Neue Einträge: unten in REGELN ergänzen: [Muster, richtige Schreibweise, optional abweichendes Muster für die KI-Kopie oder false].
   Zwei Wege: (1) lokale Befehle (jvCommands, Rang 10) und gespeicherte Texte nutzen die ganze Liste (jvFestnamen); (2) die KI-Kopie des Nutzertextes
   läuft über die Kette jvKiText (Phase 5D.2) mit der KI-Liste (jvFestnamenKi). Es gibt KEINE Hülle um sendToGroqSmart mehr.
   ============================================================ */
(function () {
    'use strict';
    const W = '(^|[^A-Za-zÄÖÜäöüß0-9])', E = '(?![A-Za-zÄÖÜäöüß0-9])';
    /* [Muster, richtige Schreibweise, Muster für die KI-Kopie (weglassen = gleiches Muster, false = nicht für die KI-Kopie)] */
    const REGELN = [
        [/alicia|alycia|alisia|alissa|alyssia/, 'Alyssa'],
        [/alicias|alycias|alisias/, 'Alyssas'],
        [/neu[\s-]*g[aä]r?l+[iy]?n\w*[\s-]*ring/, 'Neu-Galliner-Ring'],
        [/schwarzenbeck/, 'Schwarzenbek'],
        [/schr(?:ö|oe)ter/, 'Schroeter', false],   // echter Nachname: NICHT blind in der KI-Kopie ändern (nur Speicher/lokale Wege, siehe unten)
        [/verbr(?:ü|ue)derungs[\s-]+ring/, 'Verbrüderungsring'],
        [/zain|zayn|zein|zeyn|sane|zaine/, 'Zane', /zain|zayn|zeyn|zaine/]   // "Zein" (Protein) und "Sane" (englisch) nur in voice.js/lokal, nicht für die KI-Kopie
    ];
    const bauen = (re, r) => [new RegExp(W + '(?:' + re.source + ')' + E, 'gi'), r];
    const LISTE = REGELN.map(([re, r]) => bauen(re, r));                                                             // wie bisher: lokale Wege, Speicher, Hören
    const LISTE_KI = REGELN.filter(x => x[2] !== false).map(([re, r, ki]) => bauen(ki || re, r));                     // nur für die KI-Kopie
    const anwenden = (liste, text) => {
        let t = String(text == null ? '' : text);
        liste.forEach(([re, r]) => { t = t.replace(re, (m, pre) => pre + r); });
        return t;
    };

    function fest(text) {
        let t = anwenden(LISTE, text);
        t = t.replace(/^((?:hey|hallo|hi)[ ,]+)(?:sein|sain|zehn|seyn|sehn)(?![A-Za-zÄÖÜäöüß0-9])/i, '$1Zane');   // "Hey Sein" = "Hey Zane"
        return t;
    }
    window.jvFestnamen = fest;

    /* Nur die KI-Kopie des Nutzertextes (Kette jvKiText, commands.js / assistant.js jvKiTextFuer): ohne Nachnamen-Regel, ohne "Hey Sein" (das macht
       voice.js beim Sprechen schon), ohne die Wörter Zein/Sane. Der Originaltext bleibt unberührt. */
    function festKi(text) { return anwenden(LISTE_KI, text); }
    window.jvFestnamenKi = festKi;

    if (window.jvCommands) {
        window.jvCommands.use('festnamen', function (text, next) {
            const t = fest(text);
            return next(t);
        }, 10);
    }
    if (window.jvChain) {
        window.jvChain.use('jvKiText', 'festnamen', function (next, args) {
            const t = next();
            return festKi(typeof t === 'string' ? t : args[0]);
        }, 100);
    }
})();
