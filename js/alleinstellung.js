/* ============================================================
   ALLEINSTELLUNG: "Was unterscheidet dich von anderen KI-Assistenten?" / "Was kannst du besser als ChatGPT, Alexa oder Siri?" /
   "Warum bist du besser?" -> Jarvis erzählt ehrlich, was er für Dino kann, was allgemeine Assistenten nicht haben (feste Antwort, keine KI nötig).
   Nur gesprochen (der Kopf redet), kein Fenster. Wird die App um etwas Wichtiges erweitert, hier einen Punkt ergänzen.
   Braucht: commands.js (jvCommands), voice.js (speak); extrafenster.js (openExtraWindow) ist optional. Order 4.1.
   ============================================================ */
(function () {
    'use strict';
    var PUNKTE = [
        ['Ich kenne dich', 'Deine Schichten, Termine, Familie, Geburtstage und was du mir erzählt hast. Frag „Was steht morgen an?“, und ich nenne zuerst deine Schicht mit Beginn.'],
        ['Ich vergesse nichts', 'Restaurants, Ausflüge, Wünsche der Familie und alles, was du mir sagst, bleibt im Langzeitgedächtnis.'],
        ['Ich melde mich von selbst', 'Beim Öffnen der App, morgens und abends, bei Paketen, fälligen Rechnungen, Feiertagen und Unwetter. Ein normaler Assistent wartet, bis du fragst.'],
        ['Ich plane mit dir', 'Der Termin-Finder rechnet Fahrzeit mit Verkehr und Rückweg zur Arbeit ein. Die Wunschliste sucht Preise. Fotos von Briefen und Zetteln lese ich ab.'],
        ['Ich bin für unterwegs gebaut', 'Ich laufe im Auto, höre auf Zuruf, sage dir, wann du losfahren musst, und rufe, wenn du aufstehen musst.'],
        ['Ich gehöre dir', 'Ich bin deine eigene App und wachse mit jeder Idee von dir. Du sagst, was fehlt, und es kommt dazu.']
    ];
    var SPRECH = 'Der größte Unterschied: Ich kenne dich. Ich weiß, wann du Schicht hast, was ansteht und was du mir erzählt hast, und ich vergesse es nicht. ' +
        'Ich melde mich von selbst, wenn etwas wichtig wird, zum Beispiel bei Paketen, Rechnungen, Feiertagen oder Unwetter. ' +
        'Ich plane mit dir, mit Fahrzeit und Verkehr, und ich suche Preise für die Wunschliste von Liam. ' +
        'Ich bin für unterwegs gebaut, auch fürs Auto. Und ich gehöre dir: Was dir fehlt, bauen wir ein. ' +
        'Beim reinen Allgemeinwissen sind die großen Assistenten auch gut. Mein Vorteil ist, dass ich dein Leben kenne.';
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    var RX = /(?:was|wodurch|wie)\s+(?:unterscheid\w+ (?:dich|du)|bist du anders)\b|\bwas (?:kannst|machst) du (?:besser|anders)\b|\bwarum (?:bist du|soll ich dich nehmen).*\b(?:besser|nehmen)\b|\bwas (?:macht|kann) dich (?:besonders|besser)\b|\bwas ist (?:dein|das) besondere\b|\bwas hast du (?:anderen|vielen) (?:voraus|ki\w*)\b|\bwas kannst du,? was (?:andere|chatgpt|alexa|siri|gemini)/;
    function html() {
        var h = '<div style="font-size:14px;line-height:1.5;color:#e8f3f9">';
        PUNKTE.forEach(function (p) { h += '<div style="margin:0 0 12px"><b style="color:#4cffb0">' + p[0] + '</b><br>' + p[1] + '</div>'; });
        return h + '</div>';
    }
    function register() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('alleinstellung', function (text, next) {
            var t = norm(text);
            if (t.length > 120 || !RX.test(t)) return next(text);
            try { speak(SPRECH, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { }
            return true;
        }, 4.1);
        return true;
    }
    var n = 0; (function r() { if (!register() && n++ < 40) setTimeout(r, 500); })();
    window.jvAlleinstellung = { test: function (t) { return RX.test(norm(t)); }, html: html };
})();
