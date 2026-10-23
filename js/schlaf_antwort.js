/* ============================================================
   SCHLAFMODUS: Jarvis beantwortet WhatsApp-Nachrichten, solange du schläft (nur in der Android-App).
   "Ich gehe schlafen" / "Schlafmodus an" -> an. "Ich bin wach" / "Schlafmodus aus" -> aus, und Jarvis liest vor, wer geschrieben hat.
   "Erlaube Schatz im Schlafmodus" / "Verbiete Schatz im Schlafmodus" / "Wem antwortest du?" -> Liste der erlaubten Kontakte (Name wie in WhatsApp).
   "Wer hat mir geschrieben?" liest die gemerkten Nachrichten vor (ohne sie zu löschen). "Meine Schlafantwort ist ..." ändert den Antworttext.
   Geantwortet wird nur in Einzelchats, nur erlaubten Kontakten und höchstens dreimal pro Person und Schlafphase. Die KI (api/groq, mit festen Regeln) formuliert 1 bis 2 Sätze; bei heiklen Themen (Geld, Passwörter, Adressen ...) oder Ausfall kommt ein fester Text; bei Notfallwörtern ein lauter Alarm. "Schlafmodus feste Antwort" schaltet die KI aus. "Kontakte für den Schlafmodus auswählen" zeigt eine Mehrfachauswahl der Handy-Kontakte.
   Vertretung: "Vertretung an" / "Spring ein, wenn ich nicht antworte" - antwortet ein erlaubter Kontakt nach 10 Minuten ungelesen noch steht, antwortet Jarvis, was er sicher kann, und leitet sonst weiter ("Ich bin der Assistent von Dino, er meldet sich"). "Vertretung aus", "Vertretung nach 15 Minuten", "Was habe ich verpasst?".
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

    function kontextSenden() {
        try {
            const n = N(); const P = window.jvPlan;
            if (!n || typeof n.schlafKontext !== 'function' || !P || typeof P.schichtAm !== 'function') return;
            const ymd = P.jetzt().ymd, sh = P.schichtAm(ymd);
            const text = sh ? 'Dino arbeitet heute ' + (sh === 'frueh' ? 'Frühschicht' : 'Spätschicht') + ' bis ' + P.uhrHM(P.ende(sh)) + ' Uhr.' : 'Dino hat heute keine Schicht.';
            n.schlafKontext(ymd, text);
            if (typeof n.schlafArbeit === 'function') {
                const w = P.arbeitsFenster ? P.arbeitsFenster(ymd) : null;
                if (w) n.schlafArbeit(P.berlinMs(ymd, w.von), w.ende && w.ende > 1440 ? P.berlinMs(ymd, 0) + w.ende * 60000 : P.berlinMs(ymd, w.ende)); else n.schlafArbeit(0, 0);
            }
        } catch (e) { }
    }
    function secret() { try { return String(getPersistentData('app_secret', '') || ''); } catch (e) { return ''; } }
    function vorlesen(arr, neutral) {
        if (!arr.length) return neutral ? 'Es gibt nichts Neues. Ich habe für niemanden geantwortet.' : 'Während du geschlafen hast, hat dir niemand geschrieben.';
        const von = {}, reihe = [];
        arr.forEach(function (m) { const k = m.n; if (!von[k]) { von[k] = { n: k, texte: [], a: false, e: false, w: false, r: '' }; reihe.push(von[k]); } von[k].texte.push(m.t); if (m.a) { von[k].a = true; if (m.r) von[k].r = m.r; } if (m.e) von[k].e = true; if (m.w) von[k].w = true; });
        const teile = reihe.slice(0, 6).map(function (v) {
            const t = v.texte.slice(-2).join(' ... ');
            return (v.e ? 'Dringend! ' : '') + v.n + (v.texte.length > 1 ? ' (' + v.texte.length + ' Nachrichten)' : '') + ': ' + t + (v.a ? (v.r ? ' (Ich habe geantwortet: ' + v.r + ')' : ' (Ich habe geantwortet, dass du schläfst.)') : '') + (v.w ? ' Du sollst dich melden.' : '');
        });
        return (neutral ? 'Das habe ich für dich beantwortet: ' : 'Während du geschlafen hast, haben geschrieben: ') + '' + '' + teile.join('. ') + '.' + (reihe.length > 6 ? ' Und ' + (reihe.length - 6) + ' weitere.' : '');
    }

    function an() {
        const s = stand();
        if (!s.zugriff) {
            try { N().schlafZugriffOeffnen(); } catch (e) { }
            sagen('Dafür muss Android mir erlauben, deine Benachrichtigungen zu lesen. Ich habe die Einstellung geöffnet. Schalte dort Jarvis an. Falls es grau ist: in den App-Infos von Jarvis oben rechts die drei Punkte, dann Eingeschränkte Einstellungen zulassen. Danach sag noch einmal: Ich gehe schlafen.');
            return;
        }
        try { if (typeof N().schlafSchluessel === 'function') N().schlafSchluessel(secret()); } catch (e) { }
        N().schlafSetzen(true);
        const e = s.erlaubt || [];
        sagen('Gute Nacht. Der Schlafmodus ist an. ' + (e.length ? 'Ich antworte ' + liste(e.map(schoen)) + ', höchstens dreimal pro Person. ' : 'Ich antworte noch niemandem. Sag zum Beispiel: Erlaube Schatz im Schlafmodus. ') + (s.ki === false ? 'Ich antworte mit einem festen Text. ' : 'Ich antworte kurz und vorsichtig selbst und sage nichts zu. Bei einem Notfall wecke ich dich laut. ') + 'Morgens lese ich dir vor, wer geschrieben hat.');
    }
    function aus() {
        const s = stand();
        N().schlafSetzen(false);
        const arr = nachrichten(true);
        sagen((s.an ? 'Guten Morgen. Der Schlafmodus ist aus. ' : 'Der Schlafmodus war schon aus. ') + vorlesen(arr));
    }

    /* ---------- Wissensblatt ---------- */
    function wissen() { try { return String(N().wissenListe() || '').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); } catch (e) { return []; } }
    function wissenBefehl(txt) {
        if (!N() || typeof N().wissenListe !== 'function') return null;
        const raw = String(txt || '').trim(), t = norm(raw);
        let m;
        if ((m = raw.match(/^(?:hey |hallo |ok |okay )?(?:jarvis |zane )?(?:bitte )?merk(?:e)? dir (?:f[uü]rs|f[uü]r das|auf dem|im|ins) wissensblatt[:,]?\s*(.+)$/i)) || (m = raw.match(/^(?:jarvis |zane )?(?:schreib|trag)(?:e)? (?:bitte )?(?:auf|ins|in das) (?:das |dein )?wissensblatt[:,]?\s*(.+)$/i))) {
            const z = m[1].trim().replace(/\s+/g, ' ').slice(0, 200), l = wissen();
            if (l.length >= 40) return 'Das Wissensblatt ist voll. Streich erst etwas weg.';
            l.push(z); N().wissenSetzen(l.join('\n'));
            return 'Gemerkt fürs Wissensblatt: ' + z + '. Jarvis darf das jetzt Leuten sagen, wenn sie danach fragen. Geld, Passwörter, Adressen und Links sage ich trotzdem nie.';
        }
        if (/\bwas steht (?:alles )?(?:auf|im) (?:dem |meinem )?wissensblatt\b|\bles(?:e)? (?:mir )?(?:das |mein )?wissensblatt (?:vor)?\b|\bzeig(?:e)? (?:mir )?(?:das |mein )?wissensblatt\b/.test(t)) {
            const l = wissen();
            return l.length ? 'Auf dem Wissensblatt steht: ' + l.map(function (x, i) { return (i + 1) + '. ' + x; }).join(' ') : 'Auf dem Wissensblatt steht noch nichts. Ich sage dann nur, dass ich dein Assistent bin und weiterleite.';
        }
        if ((m = raw.match(/(?:streich|streiche|l[oö]sch|l[oö]sche|entfern|entferne)\s+(.+?)\s+(?:vom|von dem|aus dem|im) wissensblatt/i))) {
            const q = norm(m[1]), l = wissen(), n = /^(?:alles|alle|das ganze)$/.test(q) ? l.length : 0;
            if (n) { N().wissenSetzen(''); return 'Das Wissensblatt ist jetzt leer.'; }
            const rest = l.filter(function (x) { return norm(x).indexOf(q) < 0; });
            if (rest.length === l.length) return 'Dazu habe ich nichts auf dem Wissensblatt gefunden.';
            N().wissenSetzen(rest.join('\n')); return 'Gestrichen. Es steht noch ' + rest.length + ' Punkt' + (rest.length === 1 ? '' : 'e') + ' drauf.';
        }
        return null;
    }
    /* Meldung von Jarvis (Vertretung): bei der Arbeit nur Text, sonst auch sprechen */
    function pruefe() {
        try {
            const n = N(); if (!n || typeof n.holeMeldung !== 'function') return;
            const r = String(n.holeMeldung() || ''); if (!r) return;
            const o = JSON.parse(r), titel = o.titel || 'Jarvis', text = o.text || '';
            if (!text) return;
            if (o.nurText) {
                try { if (typeof openExtraWindow === 'function') openExtraWindow('🤖 ' + titel, '<div style="font-size:15px;line-height:1.55;white-space:pre-wrap">' + String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</div>'); } catch (e) { }
                try { const P = window.jvPlan; if (P && P.sagenMeldung && typeof P.sagenMeldung === 'function') { /* nur merken, nicht sprechen */ } } catch (e) { }
            } else {
                const P = window.jvPlan;
                if (P && typeof P.sagenMeldung === 'function') P.sagenMeldung(titel, text); else sagen(titel + '. ' + text);
            }
        } catch (e) { }
    }
    function befehl(txt, next) {
        const wb = wissenBefehl(txt); if (wb) { sagen(wb); return true; }
        try {
            if (N() && typeof N().anredeSetzen === 'function') {
                const tn2 = norm(txt); let mm;
                if ((mm = tn2.match(/^(?:jarvis )?(?:fuer|zu|bei) (.{2,30}?) (?:bin ich|sagst du|sagst du dass ich bin|bin ich fuer dich) (?:der |dein |deinem )?(papa|mann|dino)$/))) {
                    N().anredeSetzen(mm[1], mm[2]);
                    sagen('Gemerkt. Bei ' + mm[1].replace(/\b[a-z]/g, function (c) { return c.toUpperCase(); }) + ' stelle ich mich als KI-Assistent von ' + (mm[2] === 'papa' ? 'deinem Papa' : mm[2] === 'mann' ? 'deinem Mann' : 'Dino') + ' vor.');
                    return true;
                }
                if (/\bwie stellst du dich (?:bei )?(?:wem )?vor\b|\bwer nennt mich papa\b|\bwen nenne ich papa\b/.test(tn2)) {
                    const z = String(N().anredeListe() || '').split('\n').filter(Boolean).map(function (x) { const i = x.indexOf('='); return x.slice(0, i) + ': ' + x.slice(i + 1); });
                    sagen(z.length ? 'Ich stelle mich so vor: ' + z.join(', ') + '. Alle anderen bekommen: Assistent von Dino.' : 'Alle bekommen von mir: Assistent von Dino.');
                    return true;
                }
            }
        } catch (e) { }
        try {
            const tn = norm(txt);
            if (N() && typeof N().vertretungProtokoll === 'function' && /(warum|wieso|weshalb).*(nicht|kein).*(geantwortet|geschrieben|reagiert|eingesprungen)|\b(vertretung|vertretungs) ?(protokoll|log)\b|\bwas ist mit der vertretung\b/.test(tn)) {
                const z = String(N().vertretungProtokoll() || '').split('\n').filter(Boolean);
                sagen(z.length ? 'Das steht im Protokoll, neueste zuletzt: ' + z.slice(-5).join('. ') : 'Im Protokoll steht noch nichts. Entweder ist die Vertretung aus, oder seit dem Einschalten hat kein ausgewählter Kontakt geschrieben.');
                return true;
            }
        } catch (e) { }
        const t = norm(txt).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '').replace(/^bitte /, '');
        if (!t || t.split(' ').length > 14) return next(txt);
        let m;
        const smt = /(schlaf ?modus)/.test(t);
        if (N() && typeof N().vertretungSetzen === 'function') {
            if (/\b(vertretung|vertretungsmodus)\b.*\b(an|ein|einschalten|aktivieren)\b|\b(spring|springe) (bitte )?(fuer mich )?ein\b|\bwenn ich nicht antworte\b.*\bantworte du\b|\bantworte fuer mich wenn ich nicht antworte\b/.test(t)) {
                const s0 = stand();
                if (!s0.zugriff) { try { N().schlafZugriffOeffnen(); } catch (e) { } sagen('Dafür muss Android mir erlauben, deine Benachrichtigungen zu lesen. Ich habe die Einstellung geöffnet. Schalte dort Jarvis an und sag danach noch einmal: Vertretung an.'); return true; }
                try { if (typeof N().schlafSchluessel === 'function') N().schlafSchluessel(secret()); } catch (e) { }
                N().vertretungSetzen(true); kontextSenden();
                const e0 = s0.erlaubt || [];
                sagen('Die Vertretung ist an. Wenn du auf eine WhatsApp ' + (e0.length ? 'von ' + liste(e0.map(schoen)) : 'von einem erlaubten Kontakt') + ' ' + (s0.minuten || 10) + ' Minuten nicht reagierst, springe ich ein. Ich antworte nur, was ich sicher beantworten kann. Alles andere leite ich an dich weiter und sage dem Absender, dass du dich meldest.' + (e0.length ? '' : ' Sag zuerst: Kontakte für den Schlafmodus auswählen.'));
                return true;
            }
            if (/\b(vertretung|vertretungsmodus)\b.*\b(aus|ausschalten|beenden|deaktivieren)\b/.test(t)) { N().vertretungSetzen(false); sagen('Die Vertretung ist aus. Ich antworte nicht mehr für dich, außer im Schlafmodus.'); return true; }
            if ((m = t.match(/\b(?:vertretung|springe? ein)\b.*?\bnach (\d{1,3}) minuten\b/)) || (m = t.match(/\bnach (\d{1,3}) minuten\b.*\b(?:vertretung|springe? ein)\b/))) { const mi = Math.max(5, Math.min(120, parseInt(m[1], 10))); N().vertretungMinuten(mi); sagen('Ich springe jetzt nach ' + mi + ' Minuten ein.'); return true; }
            if (/\bwas habe ich verpasst\b|\bwer hat fuer mich geantwortet\b|\bwas hast du fuer mich geantwortet\b/.test(t)) { sagen(vorlesen(nachrichten(false), true)); return true; }
        }
        if (N() && typeof N().schlafKontakteWaehlen === 'function' && (/\bkontakte?\b/.test(t) && /(auswaehl|aussuch|waehl|oeffne|zeig|bearbeit|aender|festlegen)/.test(t) && /(schlaf|antwort)/.test(t) || /\bschlaf ?modus kontakte\b/.test(t))) {
            N().schlafKontakteWaehlen();
            sagen('Ich zeige dir deine Kontakte. Tippe die an, denen ich im Schlafmodus antworten darf, und dann auf Fertig.');
            return true;
        }
        if (N() && smt && typeof N().schlafKi === 'function' && /(feste?n? (antwort|text)|ohne ki|nur (den )?festen)/.test(t)) { N().schlafKi(false); sagen('Im Schlafmodus schreibe ich immer den festen Text und nichts anderes.'); return true; }
        if (N() && smt && typeof N().schlafKi === 'function' && /(freie?n? antwort|mit ki|selbst antworten|selbststaendig)/.test(t)) { N().schlafKi(true); sagen('Im Schlafmodus antworte ich kurz und vorsichtig selbst. Ich sage nichts zu und gebe nichts Privates heraus.'); return true; }
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
    setTimeout(kontextSenden, 7000);
    window.jvSchlaf = { befehl: befehl, vorlesen: vorlesen, pruefe: pruefe };
    setTimeout(pruefe, 3000);
})();
