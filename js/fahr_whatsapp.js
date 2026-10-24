/* ============================================================
   FAHR-WHATSAPP: Im Fahrmodus (Autoansicht offen) liest Jarvis WhatsApp-Nachrichten vor, fragt, ob du antworten willst,
   und schickt deine gesprochene Antwort ab. Danach sagt und zeigt er, was er geschrieben hat.
   Ablauf: "Nachricht von Schatz: ... Willst du antworten?" -> "Ja" -> "Was soll ich schreiben?" -> du sprichst -> "Gesendet an Schatz: ..."
   Abkürzung: "Ja, ich bin in zehn Minuten da" oder "Schreib ihm: bin gleich da" schickt sofort. "Nein" / "Abbrechen" lässt es.
   Wer vorgelesen wird, bestimmt die Kontaktauswahl vom Schlafmodus (Prefs.erlaubt). Nur Einzelchats.
   Die APK (NachrichtenService) ruft window.jvFahrWA.nachricht({id, name, text, kann}) auf, solange Prefs.fahren an ist;
   autoansicht.js schaltet das per ZaneNative.setFahrmodus(true/false). Mehrere Nachrichten werden nacheinander abgearbeitet.
   Braucht: window.ZaneNative (fahrSenden, fahrVerwerfen), commands.js (jvCommands), voice.js (speak, continueConversation). Order 0.1.
   ============================================================ */
(function () {
    function N() { const n = window.ZaneNative; return n && typeof n.fahrSenden === 'function' ? n : null; }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function sagen(t, weiter, danach) {
        try { speak(t, danach || (weiter && typeof continueConversation === 'function' ? continueConversation : undefined)); }
        catch (e) { if (danach) { try { danach(); } catch (e2) { } } }
    }

    const GUELTIG_MS = 90000;            // so lange wartet eine Frage auf deine Antwort
    const NEIN = /^(nein|nee|ne|noe|nicht|stopp|stop|abbrechen|abbruch|lass es|lass|vergiss es|vergiss das|doch nicht|spaeter|jetzt nicht|nicht jetzt)\b/;
    const JA = /^(ja|jawohl|jep|jo|joa|klar|genau|gerne|gern|okay|ok|bitte|antworte|antworten|schreib|schreibe|ja bitte|mach das|mach)\b/;

    let queue = [], cur = null, stufe = '', timer = null, box = null;

    function css() {
        if (document.getElementById('fwa-style')) return;
        const st = document.createElement('style'); st.id = 'fwa-style';
        st.textContent =
            '#fwa-box{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(env(safe-area-inset-bottom,0px) + 84px);z-index:9000;width:min(94vw,560px);box-sizing:border-box;' +
            'background:rgba(4,9,15,.97);border:1px solid #4cffb0;border-radius:12px;padding:12px 14px;color:#e8f3f9;font-family:"DejaVu Sans Mono",ui-monospace,monospace;box-shadow:0 0 22px rgba(76,255,176,.25)}' +
            '#fwa-box .k{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#4cffb0}' +
            '#fwa-box .t{font-size:clamp(15px,3.4vmin,20px);line-height:1.35;margin:6px 0;word-break:break-word}' +
            '#fwa-box .s{font-size:13px;color:#8fb4c8}' +
            '#fwa-box .b{display:flex;gap:10px;margin-top:8px}' +
            '#fwa-box button{flex:1;padding:11px 8px;border-radius:10px;font:700 14px "DejaVu Sans Mono",monospace;background:rgba(10,22,33,.95)}' +
            '#fwa-box .ja{border:1px solid #4cffb0;color:#4cffb0}#fwa-box .nein{border:1px solid rgba(93,209,255,.6);color:#49d7ff}';
        document.head.appendChild(st);
    }
    function zeigen(kopf, text, sub, knoepfe) {
        try {
            css();
            if (!box) { box = document.createElement('div'); box.id = 'fwa-box'; document.body.appendChild(box); }
            box.innerHTML = '<div class="k">' + esc(kopf) + '</div><div class="t">' + esc(text) + '</div>' + (sub ? '<div class="s">' + esc(sub) + '</div>' : '') +
                (knoepfe ? '<div class="b"><button type="button" class="ja" id="fwa-ja">Antworten</button><button type="button" class="nein" id="fwa-nein">Nein</button></div>' : '');
            if (knoepfe) {
                const j = document.getElementById('fwa-ja'), n = document.getElementById('fwa-nein');
                if (j) j.onclick = function () { fragen(); };
                if (n) n.onclick = function () { ende('Okay, ich antworte nicht.'); };
            }
        } catch (e) { }
    }
    function wegBox() { try { if (box && box.parentNode) box.parentNode.removeChild(box); } catch (e) { } box = null; }

    function nachricht(o) {
        try {
            if (!o || !o.name || !o.text) return;
            if (!window.jvAutoansicht || !window.jvAutoansicht.offen()) return;   // nur im Fahrmodus
            queue.push(o);
            if (!cur) weiter();
        } catch (e) { }
    }

    function weiter() {
        clearTimeout(timer);
        if (!queue.length) { cur = null; stufe = ''; return; }
        cur = queue.shift();
        if (!cur.kann) {
            zeigen('WhatsApp · ' + cur.name, cur.text, 'Hier kann ich nicht antworten.', false);
            const c = cur; cur = null;
            sagen('Nachricht von ' + c.name + ': ' + c.text, false, function () { setTimeout(function () { wegBox(); weiter(); }, 1500); });
            return;
        }
        stufe = 'frage';
        zeigen('WhatsApp · ' + cur.name, cur.text, 'Sag „Ja“ zum Antworten oder „Nein“.', true);
        sagen('Nachricht von ' + cur.name + ': ' + cur.text + '. Willst du antworten?', true);
        timer = setTimeout(verwerfen, GUELTIG_MS + 20000);   // Vorlesen dauert, deshalb etwas mehr Zeit
    }

    function verwerfen() {
        clearTimeout(timer);
        try { if (cur && N()) N().fahrVerwerfen(cur.id); } catch (e) { }
        cur = null; stufe = ''; wegBox();
        setTimeout(weiter, 500);
    }

    function fragen() {
        if (!cur) return;
        stufe = 'diktat';
        clearTimeout(timer); timer = setTimeout(verwerfen, GUELTIG_MS);
        zeigen('WhatsApp an ' + cur.name, 'Ich höre zu …', 'Sprich deine Antwort. Zum Abbrechen sag „Abbrechen“.', false);
        sagen('Was soll ich schreiben?', true);
    }

    function ende(satz) {
        clearTimeout(timer);
        try { if (cur && N()) N().fahrVerwerfen(cur.id); } catch (e) { }
        cur = null; stufe = ''; wegBox();
        if (satz) sagen(satz, false, function () { setTimeout(weiter, 800); });
        else setTimeout(weiter, 500);
    }

    function senden(roh) {
        const c = cur;
        let t = String(roh || '').trim().replace(/\s+/g, ' ');
        if (!c || !t) return false;
        t = t.charAt(0).toUpperCase() + t.slice(1);
        clearTimeout(timer);
        let ok = false;
        try { ok = !!(N() && N().fahrSenden(c.id, t)); } catch (e) { ok = false; }
        cur = null; stufe = '';
        if (ok) {
            zeigen('✔ Gesendet an ' + c.name, t, 'Nachricht von ' + c.name + ': ' + c.text, false);
            sagen('Gesendet an ' + c.name + ': ' + t, false, function () { setTimeout(function () { wegBox(); weiter(); }, 4000); });
        } else {
            zeigen('Senden hat nicht geklappt', t, 'Antworte bitte selbst in WhatsApp.', false);
            sagen('Das Senden hat nicht geklappt. Vielleicht wurde die Nachricht schon gelesen. Antworte bitte selbst.', false, function () { setTimeout(function () { wegBox(); weiter(); }, 4000); });
        }
        return true;
    }

    /* Sprachbefehl: nur aktiv, solange eine Nachricht offen ist */
    function sprache(text, next) {
        if (!cur) return next(text);
        const raw = String(text || '').trim(), n = norm(raw), w = n ? n.split(' ').length : 0;
        if (!n) return next(text);
        if (stufe === 'frage') {
            if (w <= 6 && NEIN.test(n)) { ende('Okay, ich antworte nicht.'); return true; }
            // "Schreib ihm: bin gleich da" / "Antworte: ..." -> sofort senden
            let m = raw.match(/^\s*(?:ja[,.!]?\s+)?(?:schreib|schreibe|antworte|sag)\w*\s*(?:ihm|ihr|ihnen|dem|der)?\s*(?:dass|das|bitte)?[:,]?\s+(.{2,})$/i);
            if (m && norm(m[1]).split(' ').length >= 2) { senden(m[1]); return true; }
            // "Ja, ich bin gleich da" -> der Rest ist die Antwort
            m = raw.match(/^\s*(?:ja|jawohl|jep|jo|joa|klar|genau|gerne|okay|ok)[,.!]?\s+(.{3,})$/i);
            if (m && norm(m[1]).split(' ').length >= 3) { senden(m[1]); return true; }
            if (w <= 4 && JA.test(n)) { fragen(); return true; }
            verwerfen();   // etwas ganz anderes gesagt: Frage erledigt, der Satz läuft normal weiter
            return next(text);
        }
        if (stufe === 'diktat') {
            if (w <= 3 && /^(abbrechen|abbruch|vergiss es|vergiss das|lass es|lass|nein|nee|stopp|stop|doch nicht)\b/.test(n)) { ende('Okay, nichts gesendet.'); return true; }
            senden(raw);
            return true;
        }
        return next(text);
    }

    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('fahr_whatsapp', sprache, 0.1);
        return true;
    }
    if (!cmd()) { let k = 0; const iv = setInterval(function () { if (cmd() || ++k > 40) clearInterval(iv); }, 250); }
    window.jvFahrWA = { nachricht: nachricht, offen: function () { return !!cur; } };
})();
