/* ============================================================
   EINFÜHRUNG: Erklärung für Leute, die die App nicht kennen. Ein Fenster mit drei Teilen:
     1) So sprichst du mit Jarvis   2) Das richtest du zuerst ein (Adressen, Schicht, Benachrichtigungen ...)   3) Alles, was er kann
   Teil 3 wird AUTOMATISCH aus der Hilfe (help.js, HELP_TOPICS) gebaut: wird dort etwas ergänzt, steht es hier von selbst mit drin.
   Dazu sagt Jarvis eine kurze Begrüßung.
   Sagen: "Wie gehe ich mit dir um?" · "Wie bediene ich dich?" · "Erklär mir die App" · "Was kannst du für mich erledigen?" · "Einführung" · "Anleitung"
   ("Hilfe" und "Was kannst du?" bleiben wie bisher die Themenliste.)
   Braucht: extrafenster.js (openExtraWindow), help.js (HELP_TOPICS), commands.js, voice.js (speak). Wird nach help.js geladen.
   ============================================================ */
(function () {
    'use strict';

    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function sag(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    function norm(t) { return String(t || '').toLowerCase().replace(/[.,!?;:"„“”]/g, ' ').replace(/\s+/g, ' ').trim(); }

    var BEGRUESSUNG = 'Ich bin Jarvis, dein Sprachassistent. Tippe unten auf den Kreis und sprich ganz normal mit mir, so wie mit einem Menschen. ' +
        'Ich trage Termine und Erinnerungen ein, sage dir, wann du losfahren musst, auch mit Stau, suche Bus und Bahn, nenne das Wetter, führe Listen und merke mir Dinge. ' +
        'Ich melde mich auch von selbst, zum Beispiel vor der Abfahrt zur Arbeit. Ich habe dir eine Anleitung geöffnet: oben, was du zuerst einrichten solltest, darunter alles, was ich kann. Wenn du etwas Bestimmtes suchst, sag einfach Hilfe.';

    var SCHRITTE = [
        ['Standort erlauben', 'Wenn das Handy nach dem Standort fragt: Zulassen. Ohne Standort kann ich keine Fahrzeit und kein Wetter für dich berechnen.'],
        ['Heimatadresse', 'Sag: „Merk dir meine Heimatadresse: Musterstraße 5, Musterstadt“. Dann geht auch „Bring mich nach Hause“.'],
        ['Arbeitsadresse', 'Sag: „Merk dir meine Arbeitsadresse: Musterstraße 5, Musterstadt“. Damit rechne ich Fahrzeit, Stau und Abfahrt zur Arbeit. Adressen kannst du auch im Menü ☰ > Adressen eintippen.'],
        ['Schicht einstellen', 'Sag: „Diese Woche Frühschicht“ (oder „Diese Woche Spätschicht“). Danach wechsele ich jeden Montag von selbst. Prüfen: „Welche Schicht habe ich?“'],
        ['Wann du zur Arbeit musst', 'Sag zum Beispiel: „Meine Frühschicht beginnt um 5 Uhr 10“ und „Meine Spätschicht beginnt um 13 Uhr 45“. Daraus berechne ich deine Abfahrtszeit und melde mich kurz vorher.'],
        ['Wann du aufstehst (Briefing)', 'Sag zum Beispiel: „Briefing in der Frühschicht um 3 Uhr 45“ oder „Briefing in der Spätschicht um 11 Uhr“. Dann kommt dein Tages-Briefing zu dieser Zeit. Nachfragen: „Wann kommt mein Briefing?“'],
        ['Benachrichtigungen an', 'Sag: „Benachrichtigungen an“ und tippe auf die Karte, dann auf Zulassen. Dann melde ich mich auch bei geschlossener App (Erinnerungen, Abfahrt, Unwetter, HSV-Ergebnis). Test: „Sende eine Test-Nachricht“.'],
        ['Mitnehmen-Liste', 'Sag: „Was muss ich mitnehmen?“. Ergänzen mit „Pack Handy auf meine Mitnehmen-Liste“. Ich sage sie dir vor der Abfahrt zur Arbeit.'],
        ['Urlaub eintragen', 'Sag: „Ich habe Urlaub vom 20. Oktober bis 3. November“. In dieser Zeit melde ich nichts zum Arbeitsweg.'],
        ['Wie ich dich nennen soll', 'Sag: „Nenn mich Boss“ (oder deinen Namen). Mit „Sei frecher“ oder „Sei höflicher“ stellst du ein, wie locker ich antworte.'],
        ['Zwischenpunkt auf dem Arbeitsweg', 'Fährst du immer über einen bestimmten Ort? Sag: „Ich fahre zur Arbeit über Lanken“. Dann passen Route und Stau zu deinem echten Weg.']
    ];

    function html() {
        var box = 'background:rgba(0,0,0,.45);border:1px solid rgba(93,209,255,.25);border-radius:10px;padding:10px 12px;margin-top:8px';
        var h2 = 'margin:18px 0 6px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#49d7ff';
        var out = '<div style="font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.5;color:#e2e8f0">';

        out += '<h3 style="' + h2 + ';margin-top:2px">1 · So sprichst du mit mir</h3>' +
            '<div style="' + box + '">Tippe auf den Kreis unten („Klicken zum Sprechen“) und sprich ganz normal, in ganzen Sätzen. Ich antworte laut und zeige dazu Karten oder Fenster. ' +
            'Du musst keine festen Befehle lernen: sag es so, wie du es einem Menschen sagen würdest. Für Beispiele zu jedem Thema sag „Hilfe“.</div>';

        out += '<h3 style="' + h2 + '">2 · Das richtest du zuerst ein</h3>';
        SCHRITTE.forEach(function (s, i) {
            out += '<div style="' + box + '"><b style="color:#49d7ff">' + (i + 1) + '. ' + esc(s[0]) + '</b><div style="margin-top:3px;color:#cbd5e1">' + esc(s[1]) + '</div></div>';
        });

        out += '<h3 style="' + h2 + '">3 · Alles, was ich kann</h3><div style="color:#7fb8cf;font-size:12px">Tippe auf ein Thema, dann siehst du Beispielsätze.</div>';
        var topics = (typeof HELP_TOPICS !== 'undefined' && Array.isArray(HELP_TOPICS)) ? HELP_TOPICS : [];
        topics.forEach(function (t) {
            out += '<details style="' + box + '"><summary style="cursor:pointer;color:#e2e8f0;font-weight:700">' + esc(t.icon || '•') + ' ' + esc(t.title) + '</summary><ul style="margin:8px 0 0;padding-left:18px;color:#cbd5e1">' +
                (t.examples || []).map(function (x) { return '<li style="margin-top:4px">' + esc(x) + '</li>'; }).join('') + '</ul></details>';
        });
        return out + '</div>';
    }

    function zeigen() {
        if (typeof window.openExtraWindow === 'function') window.openExtraWindow('🧭 Anleitung', html());
        sag(BEGRUESSUNG);
    }

    var RX = /^(?:(?:jarvis|zane|nova)[, ]+)?(?:wie (?:gehe|geh|komme|komm) ich mit dir um|wie bediene ich dich|wie benutze ich dich|wie nutze ich dich|wie funktionierst du|wie funktioniert (?:die app|das hier|nova|das alles)|erklär(?:e)? mir (?:die app|dich|das hier|nova|alles)|(?:was|wie) kannst du (?:alles )?für mich (?:tun|machen|erledigen)|was kann ich mit dir (?:machen|anfangen|alles machen)|was kannst du alles erledigen|(?:eine )?(?:kurze )?(?:einführung|anleitung|gebrauchsanweisung)(?: bitte| zur app)?|(?:zeig|gib) mir (?:die|eine) (?:einführung|anleitung)|ich bin neu hier|wie fange ich an|wo fange ich an)$/;

    function register() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('einfuehrung', function (text, next) {
            var t = norm(text);
            if (t.length <= 70 && RX.test(t)) { zeigen(); return true; }
            return next(text);
        }, 4);
        return true;
    }
    var n = 0; (function r() { if (!register() && n++ < 40) setTimeout(r, 500); })();
    window.jvEinfuehrung = { zeigen: zeigen, html: html, test: function (t) { return RX.test(norm(t)); } };
})();
