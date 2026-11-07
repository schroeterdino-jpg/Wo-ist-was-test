/* ============================================================
   antwort_text.js – Antworten als lesbarer Text (Test der Chef-KI am Handy)
   ============================================================
   Jede Antwort, die Jarvis wirklich über speak() (voice.js) ausgibt, steht zusätzlich als Text in einer kleinen Karte unten (scrollbar, "Kopieren"),
   dazu ein kleiner Gesprächsverlauf (letzte 15 Fragen und Antworten). Es ist NUR eine Anzeige:
     - Sprachausgabe, Avatar und Bedienung bleiben unverändert (voice.js ruft nur jvAntwortText.antwort(text) in einem try/catch auf).
     - Keine zweite KI-Anfrage, keine Vercel-Funktion, nichts wird verschickt oder dauerhaft gespeichert (nur im Arbeitsspeicher der Seite).
     - Es wird nur angezeigt, was Jarvis tatsächlich gesagt hat. Nichts wird erfunden oder nachträglich erzeugt.
     - Passwörter, Schlüssel und lange Zeichenketten (Tokens) werden vor dem Merken durch „[verborgen]“ ersetzt.
   Schalter: Einstellungen > "Antworten als Text anzeigen" (Standard AN; localStorage jv_antwort_text = "0" schaltet aus).
   Ist er AUS, merkt und zeigt diese Datei nichts; Jarvis funktioniert wie vorher.
   Schnittstelle: window.jvAntwortText { frage(text), antwort(text), verlauf(), istAn(), an(), aus(), leeren(), zeigeVerlauf(), maskiere(text) }
   Braucht: voice.js (ruft frage/antwort auf). Wird nach uebersicht.js geladen.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvAntwortText) return;

    var MAX_EINTRAEGE = 15, MAX_ZEICHEN = 4000, OFFEN_MS = 120000;
    var KEY = 'jv_antwort_text';
    var istAn = true;
    var eintraege = [];     // [{ frage, teile:[text], zeit }]
    var aktuell = null;

    function jetzt() { return Date.now(); }

    /* Geheimnisse nicht anzeigen und nicht merken */
    function maskiere(t) {
        t = String(t == null ? '' : t);
        t = t.replace(/\b(passwort|password|kennwort|pin|token|api[-_ ]?key|schl(?:ü|ue)ssel|secret)\b(\s*(?:ist|lautet|:|=)\s*)\S+/gi, '$1$2[verborgen]');
        t = t.replace(/\bBearer\s+\S+/gi, 'Bearer [verborgen]');
        t = t.replace(/\b(?:sk|gsk|pk|ghp|gho|xox[abp])[-_][A-Za-z0-9_-]{12,}/g, '[verborgen]');
        t = t.replace(/\b[A-Za-z0-9_-]{40,}\b/g, '[verborgen]');
        return t.length > MAX_ZEICHEN ? t.slice(0, MAX_ZEICHEN) + ' …' : t;
    }

    function lese() { try { var v = window.localStorage && window.localStorage.getItem(KEY); istAn = v !== '0'; } catch (e) { istAn = true; } }
    function schreibe(an) { istAn = !!an; try { if (window.localStorage) window.localStorage.setItem(KEY, an ? '1' : '0'); } catch (e) { } if (!istAn) { schliesse(); } zeichneSchalter(); }

    function frage(text) {
        if (!istAn) return;
        try {
            var t = maskiere(String(text || '').trim());
            if (!t) return;
            aktuell = { frage: t, teile: [], zeit: jetzt() };
            eintraege.push(aktuell);
            while (eintraege.length > MAX_EINTRAEGE) eintraege.shift();
        } catch (e) { }
    }

    function antwort(text) {
        if (!istAn) return;
        try {
            var t = maskiere(String(text == null ? '' : text).replace(/[*_#`~]/g, '').trim());
            if (!t) return;
            if (!aktuell || jetzt() - aktuell.zeit > OFFEN_MS) {   // Ansage ohne eigene Frage (z. B. Erinnerung): eigener Eintrag
                aktuell = { frage: '', teile: [], zeit: jetzt() };
                eintraege.push(aktuell);
                while (eintraege.length > MAX_EINTRAEGE) eintraege.shift();
            }
            if (aktuell.teile[aktuell.teile.length - 1] === t) return;   // dieselbe Ansage nicht doppelt
            aktuell.teile.push(t);
            zeige(aktuell);
        } catch (e) { }
    }

    function verlauf() { return eintraege.map(function (e) { return { frage: e.frage, antwort: e.teile.join('\n') }; }); }
    function leeren() { eintraege = []; aktuell = null; schliesse(); zeichneListe(); }

    /* ---------- Anzeige ---------- */
    var karte = null, textEl = null, frageEl = null, listeEl = null, listeAuf = false;

    function stil() {
        if (document.getElementById('jvAntwortStil')) return;
        var s = document.createElement('style'); s.id = 'jvAntwortStil';
        s.textContent = '#jvAntwortKarte{position:fixed;left:8px;right:8px;bottom:calc(env(safe-area-inset-bottom,0px) + 8px);z-index:60;max-width:560px;margin:0 auto;background:rgba(6,16,26,.96);border:1px solid rgba(93,209,255,.4);border-radius:14px;color:#e2e8f0;font-size:14px;line-height:1.45;box-shadow:0 6px 24px rgba(0,0,0,.5)}' +
            '#jvAntwortKarte[hidden]{display:none}' +
            '#jvAntwortKarte .kopf{display:flex;gap:6px;align-items:center;padding:6px 8px;border-bottom:1px solid rgba(93,209,255,.18);font-size:12px;color:#5d7e91}' +
            '#jvAntwortKarte .kopf span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
            '#jvAntwortKarte button{background:transparent;border:1px solid rgba(93,209,255,.4);color:#49d7ff;border-radius:8px;padding:4px 10px;font-size:12px;font-weight:700}' +
            '#jvAntwortKarte .text{padding:8px 12px;max-height:26vh;overflow-y:auto;white-space:pre-wrap;word-break:break-word;-webkit-overflow-scrolling:touch}' +
            '#jvAntwortKarte .liste{max-height:42vh;overflow-y:auto;border-top:1px solid rgba(93,209,255,.18)}' +
            '#jvAntwortKarte .liste[hidden]{display:none}' +
            '#jvAntwortKarte .eintrag{padding:8px 12px;border-bottom:1px solid rgba(93,209,255,.1)}' +
            '#jvAntwortKarte .eintrag .f{color:#5d7e91;font-size:12px;margin-bottom:2px;white-space:pre-wrap;word-break:break-word}' +
            '#jvAntwortKarte .eintrag .a{white-space:pre-wrap;word-break:break-word;margin-bottom:4px}';
        document.head.appendChild(s);
    }

    function bauen() {
        if (karte || !document.body) return;
        stil();
        karte = document.createElement('div'); karte.id = 'jvAntwortKarte'; karte.hidden = true; karte.setAttribute('role', 'region'); karte.setAttribute('aria-label', 'Antwort als Text');
        var kopf = document.createElement('div'); kopf.className = 'kopf';
        frageEl = document.createElement('span');
        var kop = knopf('Kopieren', function () { var e = eintraege[eintraege.length - 1]; if (e) kopiere(e.teile.join('\n'), kop); });
        var ver = knopf('Verlauf', function () { listeAuf = !listeAuf; zeichneListe(); });
        var zu = knopf('✕', schliesse); zu.setAttribute('aria-label', 'Schließen');
        kopf.appendChild(frageEl); kopf.appendChild(kop); kopf.appendChild(ver); kopf.appendChild(zu);
        textEl = document.createElement('div'); textEl.className = 'text';
        listeEl = document.createElement('div'); listeEl.className = 'liste'; listeEl.hidden = true;
        karte.appendChild(kopf); karte.appendChild(textEl); karte.appendChild(listeEl);
        document.body.appendChild(karte);
    }
    function knopf(t, f) { var b = document.createElement('button'); b.type = 'button'; b.textContent = t; b.addEventListener('click', f); return b; }

    function kopiere(t, btn) {
        function fertig(ok) { if (!btn) return; var alt = btn.getAttribute('data-alt') || btn.textContent; btn.setAttribute('data-alt', alt); btn.textContent = ok ? 'Kopiert ✓' : 'Nicht möglich'; setTimeout(function () { btn.textContent = alt; }, 1500); }
        try {
            if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t).then(function () { fertig(true); }, function () { alt(); }); return; }
        } catch (e) { }
        alt();
        function alt() {
            try { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); var ok = document.execCommand('copy'); document.body.removeChild(ta); fertig(!!ok); } catch (e) { fertig(false); }
        }
    }

    function zeige(e) {
        if (!istAn) return;
        bauen(); if (!karte) return;
        frageEl.textContent = e.frage ? 'Du: ' + e.frage : 'Jarvis';
        textEl.hidden = false; textEl.textContent = e.teile.join('\n');
        textEl.scrollTop = 0;
        karte.hidden = false;
        if (listeAuf) zeichneListe();
    }
    function schliesse() { if (karte) karte.hidden = true; listeAuf = false; if (listeEl) listeEl.hidden = true; }

    function zeichneListe() {
        if (!listeEl) return;
        listeEl.textContent = '';
        listeEl.hidden = !listeAuf;
        if (!listeAuf) return;
        var l = eintraege.slice().reverse();
        if (!l.length) { var d = document.createElement('div'); d.className = 'eintrag'; d.textContent = 'Noch nichts gesagt.'; listeEl.appendChild(d); return; }
        l.forEach(function (e) {
            if (!e.teile.length) return;
            var d = document.createElement('div'); d.className = 'eintrag';
            if (e.frage) { var f = document.createElement('div'); f.className = 'f'; f.textContent = 'Du: ' + e.frage; d.appendChild(f); }
            var a = document.createElement('div'); a.className = 'a'; a.textContent = e.teile.join('\n'); d.appendChild(a);
            var k = knopf('Kopieren', function () { kopiere(e.teile.join('\n'), k); }); d.appendChild(k);
            listeEl.appendChild(d);
        });
    }
    function zeigeVerlauf() {
        if (!istAn) return;
        bauen(); if (!karte) return;
        var e = eintraege[eintraege.length - 1];
        frageEl.textContent = 'Gesprächsverlauf'; textEl.textContent = e ? '' : 'Noch nichts gesagt.'; textEl.hidden = !!e;
        karte.hidden = false; listeAuf = true; zeichneListe();
    }

    /* ---------- Einstellungen ---------- */
    function zeichneSchalter() { try { var sw = document.getElementById('antwortTextSchalter'); if (sw) sw.checked = istAn; } catch (e) { } }
    function start() {
        lese();
        try {
            var sw = document.getElementById('antwortTextSchalter'), vb = document.getElementById('antwortTextVerlauf'), lb = document.getElementById('antwortTextLeeren');
            if (sw) sw.addEventListener('change', function () { schreibe(!!sw.checked); });
            if (vb) vb.addEventListener('click', zeigeVerlauf);
            if (lb) lb.addEventListener('click', leeren);
            zeichneSchalter();
        } catch (e) { }
    }

    window.jvAntwortText = { frage: frage, antwort: antwort, verlauf: verlauf, istAn: function () { return istAn; }, an: function () { schreibe(true); }, aus: function () { schreibe(false); }, leeren: leeren, zeigeVerlauf: zeigeVerlauf, maskiere: maskiere };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
