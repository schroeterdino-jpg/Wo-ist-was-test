/* ============================================================
   SCHLAFMODUS: Jarvis beantwortet WhatsApp-Nachrichten, solange du schläft (nur in der Android-App).
   "Ich gehe schlafen" / "Schlafmodus an" -> an. "Ich bin wach" / "Schlafmodus aus" -> aus, und Jarvis liest vor, wer geschrieben hat.
   "Erlaube Schatz im Schlafmodus" / "Verbiete Schatz im Schlafmodus" / "Wem antwortest du?" -> Liste der erlaubten Kontakte (Name wie in WhatsApp).
   "Wer hat mir geschrieben?" liest die gemerkten Nachrichten vor (ohne sie zu löschen). "Meine Schlafantwort ist ..." ändert den Antworttext.
   Geantwortet wird nur in Einzelchats, nur erlaubten Kontakten, höchstens einmal pro Schlafphase und mit einem festen Text (keine KI, nichts geht ins Internet).
   Die App (NachrichtenService) braucht den Benachrichtigungszugriff in Android; ohne ihn öffnet Jarvis die Einstellung. Order 0.36.
   Braucht: window.ZaneNative (schlafZugriff, schlafZugriffOeffnen, schlafSetzen, schlafStand, schlafKontakt, schlafText, schlafNachrichten), commands.js, voice.js.
   ============================================================ */
(function () {
    function N() { const n = window.ZaneNative; return n && typeof n.schlafStand === 'function' ? n : null; }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function sagen(t) { try { speak(t, undefined); } catch (e) { } }
    function stand() { try { return JSON.parse(N().schlafStand() || '{}'); } catch (e) { return {}; } }
    function liste(a) { return a.length < 2 ? a.join('') : a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1]; }
    function schoen(n) { return String(n || '').replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }); }
    function nachrichten(loeschen) { try { return JSON.parse(N().schlafNachrichten(!!loeschen) || '[]'); } catch (e) { return []; } }

    function vorlesen(arr) {
        if (!arr.length) return 'Während du geschlafen hast, hat dir niemand geschrieben.';
        const von = {}, reihe = [];
        arr.forEach(function (m) { const k = m.n; if (!von[k]) { von[k] = { n: k, texte: [], a: false }; reihe.push(von[k]); } von[k].texte.push(m.t); if (m.a) von[k].a = true; });
        const teile = reihe.slice(0, 6).map(function (v) {
            const t = v.texte.slice(-2).join(' ... ');
            return v.n + (v.texte.length > 1 ? ' (' + v.texte.length + ' Nachrichten)' : '') + ': ' + t + (v.a ? ' (Ich habe geantwortet, dass du schläfst.)' : '');
        });
        return 'Während du geschlafen hast, haben geschrieben: ' + teile.join('. ') + '.' + (reihe.length > 6 ? ' Und ' + (reihe.length - 6) + ' weitere.' : '');
    }

    function an() {
        const s = stand();
        if (!s.zugriff) {
            try { N().schlafZugriffOeffnen(); } catch (e) { }
            sagen('Dafür muss Android mir erlauben, deine Benachrichtigungen zu lesen. Ich habe die Einstellung geöffnet. Schalte dort Jarvis an. Falls es grau ist: in den App-Infos von Jarvis oben rechts die drei Punkte, dann Eingeschränkte Einstellungen zulassen. Danach sag noch einmal: Ich gehe schlafen.');
            return;
        }
        N().schlafSetzen(true);
        const e = s.erlaubt || [];
        sagen('Gute Nacht. Der Schlafmodus ist an. ' + (e.length ? 'Ich antworte ' + liste(e.map(schoen)) + ' einmal, dass du schläfst. ' : 'Ich antworte noch niemandem. Sag zum Beispiel: Erlaube Schatz im Schlafmodus. ') + 'Morgens lese ich dir vor, wer geschrieben hat.');
    }
    function aus() {
        const s = stand();
        N().schlafSetzen(false);
        const arr = nachrichten(true);
        sagen((s.an ? 'Guten Morgen. Der Schlafmodus ist aus. ' : 'Der Schlafmodus war schon aus. ') + vorlesen(arr));
    }

    function befehl(txt, next) {
        const t = norm(txt).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '').replace(/^bitte /, '');
        if (!t || t.split(' ').length > 14) return next(txt);
        let m;
        const sm = /(schlaf ?modus|schlafen|antwort)/.test(t);
        if (sm && (m = t.match(/^(?:erlaub\w*|erlauben)\s+(?:dass\s+)?(.+?)(?:\s+(?:darf|soll|im schlaf ?modus|zu antworten|antworten|auch|eine antwort|bekommt|bekommen|an|ein))*$/) || t.match(/^(.+?)\s+darf\s+(?:im schlaf ?modus\s+)?antworten\b/) || t.match(/^schlaf ?modus\s+(?:fuer|mit)\s+(.+?)\s+(?:erlauben|an)$/))) {
            if (!N()) return next(txt);
            const name = m[1].trim(); if (!name || name.split(' ').length > 3) return next(txt);
            N().schlafKontakt(name, true);
            sagen(schoen(name) + ' bekommt im Schlafmodus eine Antwort. Der Name muss genauso in WhatsApp gespeichert sein, sonst erkenne ich ihn nicht.');
            return true;
        }
        if (sm && (m = t.match(/^(?:verbiet\w*|verbieten|entfern\w*)\s+(.+?)(?:\s+(?:im schlaf ?modus|aus dem schlaf ?modus|aus der antwortliste|nicht mehr antworten))*$/))) {
            if (!N()) return next(txt);
            const name = m[1].trim(); if (!name || name.split(' ').length > 3) return next(txt);
            N().schlafKontakt(name, false);
            sagen(schoen(name) + ' bekommt im Schlafmodus keine Antwort mehr.');
            return true;
        }
        if (/\b(schlafmodus|schlaf modus)\b.*\b(an|ein|einschalten|aktivieren|starten)\b|\bich (gehe|geh) (jetzt |gleich )?schlafen\b|\bich schlafe (jetzt|gleich)\b|\bantworte (bitte )?fuer mich\b/.test(t)) {
            if (!N()) { sagen('Den Schlafmodus gibt es nur in der Jarvis-App auf dem Handy.'); return true; }
            an(); return true;
        }
        if (/\b(schlafmodus|schlaf modus)\b.*\b(aus|beenden|ende|ausschalten|deaktivieren)\b|\bich bin (jetzt |wieder )?(wach|aufgestanden)\b/.test(t)) {
            if (!N()) { sagen('Den Schlafmodus gibt es nur in der Jarvis-App auf dem Handy.'); return true; }
            aus(); return true;
        }
        if (/\bwer hat (mir )?(geschrieben|mir eine nachricht geschrieben)\b|\bhat mir (jemand|wer) geschrieben\b/.test(t) && N()) { sagen(vorlesen(nachrichten(false))); return true; }
        if (/\bwem antwortest du\b|\bwer darf (eine )?antwort\w*\b|\bwem antwortest du im schlafmodus\b/.test(t) && N()) {
            const e = stand().erlaubt || [];
            sagen(e.length ? 'Im Schlafmodus antworte ich: ' + liste(e.map(schoen)) + '.' : 'Im Schlafmodus antworte ich noch niemandem.');
            return true;
        }
        if ((m = String(txt).match(/(?:meine )?schlaf\s?antwort (?:ist|lautet|soll sein)[:,]?\s+(.{5,300})$/i)) && N()) {
            N().schlafText(m[1].trim());
            sagen('Verstanden. Ich schreibe im Schlafmodus: ' + m[1].trim());
            return true;
        }
        if (/schlaf ?modus/.test(t) && N()) { sagen('Ich habe Schlafmodus verstanden, aber nicht, was ich tun soll. Gehört habe ich: ' + String(txt).slice(0, 80) + '. Sag zum Beispiel: Erlaube Schatz im Schlafmodus, oder: Ich gehe schlafen.'); return true; }
        return next(txt);
    }
    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('schlaf_antwort', befehl, 0.36);
        return true;
    }
    if (!cmd()) { let n = 0; const iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }
    window.jvSchlaf = { befehl: befehl, vorlesen: vorlesen };
})();
