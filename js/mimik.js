/* ============================================================
   MIMIK: Der 3D-Kopf zeigt in Gesprächen mehr Gesicht, nicht nur eine Stimmung pro Antwort.
   - BEIM SPRECHEN: Die Stimmung wechselt mit dem Inhalt jedes Satzes (ernst, lächelnd, überrascht ...). Bei betonten Wörtern
     (Zahlen, "wichtig", "nie", "Achtung" ...) hebt er die Brauen oder kneift die Augen etwas zu.
   - AM SATZENDE: Nach der Antwort manchmal ein Grinsen, manchmal ein Zwinkern. Bei einer Frage gehen die Brauen hoch.
   - BEIM ZUHÖREN: Während du sprichst, hebt er mal eine Braue, lächelt leicht oder blickt interessiert.
   - BEIM NACHDENKEN: Der Blick wandert ab und zu zur Seite oder nach oben.
   - Im Leerlauf macht weiter grimassen.js die Grimassen. Beide stören sich nicht: Mimik arbeitet nur beim Sprechen, Zuhören und Nachdenken.
   - Einstellbar per Sprache: "Mimik mehr", "Mimik weniger", "Mimik normal", "Mimik aus", "Mimik an". Speicher: jv_mimik (wenig, normal, viel, aus).
   Nutzt window.jvAvatar3D (avatar3d.js): grimasse(), setExpression(), state, active, ready und die Sprechdaten window.__jvLipAudio / __jvLipText (fish.js).
   Beim Sprechen werden nur Augen, Brauen, Wangen, Nase und Lächeln bewegt, nie Mund und Kiefer (das macht die Lippensynchronisation).
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'jv_mimik';
    var STUFEN = { aus: 0, wenig: .6, normal: 1, viel: 1.35 };

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function stufe() { var s = lsGet(KEY); return STUFEN.hasOwnProperty(s) ? s : 'normal'; }
    function skala() { return STUFEN[stufe()]; }
    function av() { return window.jvAvatar3D; }
    function bereit() { var a = av(); return !!(a && a.ready && a.active && !document.hidden); }

    /* ---------- Überlagerung mit Zeitablauf ---------- */
    var token = 0, meinAktiv = false;
    function zeige(map, ms) {
        var a = av(); if (!a || !a.grimasse) return;
        var f = skala(); if (!f) return;
        var m = {};
        for (var k in map) m[k] = Math.min(1, map[k] * f);
        var my = ++token;
        try { a.grimasse(m); meinAktiv = true; } catch (e) { return; }
        setTimeout(function () { if (my === token) { try { a.grimasse(null); } catch (e) {} meinAktiv = false; } }, ms);
    }
    function loesche() { token++; if (meinAktiv) { try { av().grimasse(null); } catch (e) {} meinAktiv = false; } }

    /* ---------- Bausteine ---------- */
    function sidePick() { return Math.random() < .5 ? 'L' : 'R'; }
    var FORMEN = {
        brauenHoch: function () { return { browInnerUp: .55, browOuterUp_L: .5, browOuterUp_R: .5, eyeWide_L: .15, eyeWide_R: .15 }; },
        einBrauHoch: function () { var s = sidePick(); var m = { browInnerUp: .15, mouthSmile_L: .15, mouthSmile_R: .15 }; m['browOuterUp_' + s] = .75; return m; },
        zusammenkneifen: function () { return { eyeSquint_L: .45, eyeSquint_R: .45, browDown_L: .4, browDown_R: .4, noseSneer_L: .15, noseSneer_R: .15 }; },
        laecheln: function () { return { mouthSmile_L: .45, mouthSmile_R: .45, cheekSquint_L: .2, cheekSquint_R: .2, eyeSquint_L: .12, eyeSquint_R: .12 }; },
        grinsen: function () { return { mouthSmile_L: .7, mouthSmile_R: .7, mouthDimple_L: .35, mouthDimple_R: .35, cheekSquint_L: .4, cheekSquint_R: .4, eyeSquint_L: .25, eyeSquint_R: .25, browOuterUp_L: .25, browOuterUp_R: .25 }; },
        schiefGrinsen: function () { var s = sidePick(), o = s === 'L' ? 'R' : 'L'; var m = { browOuterUp_R: .3, eyeSquint_L: .25, eyeSquint_R: .25 }; m['mouthSmile_' + s] = .85; m['mouthSmile_' + o] = .25; m['mouthDimple_' + s] = .5; m['cheekSquint_' + s] = .45; m['browOuterUp_' + s] = .55; return m; },
        zwinkern: function () { var s = sidePick(), o = s === 'L' ? 'R' : 'L'; var m = { mouthSmile_L: .5, mouthSmile_R: .5, browInnerUp: .1 }; m['eyeBlink_' + s] = 1; m['cheekSquint_' + s] = .7; m['eyeSquint_' + s] = .5; m['browDown_' + s] = .25; m['browOuterUp_' + o] = .3; return m; },
        interessiert: function () { return { browInnerUp: .35, eyeWide_L: .2, eyeWide_R: .2, mouthSmile_L: .15, mouthSmile_R: .15 }; },
        blickWeg: function () {
            var r = Math.random(), m = {};
            if (r < .4) { m.eyeLookUp_L = .45; m.eyeLookUp_R = .45; m.eyeLookOut_L = .3; m.eyeLookIn_R = .3; }
            else if (r < .7) { m.eyeLookOut_L = .6; m.eyeLookIn_R = .6; m.eyeLookDown_L = .1; m.eyeLookDown_R = .1; }
            else { m.eyeLookIn_L = .6; m.eyeLookOut_R = .6; m.eyeLookUp_L = .2; m.eyeLookUp_R = .2; }
            m.browInnerUp = .2; return m;
        }
    };

    /* ---------- Stimmung pro Satz ---------- */
    function stimmung(t) {
        t = String(t || '').toLowerCase();
        if (/\b(wow|unglaublich|oha|überrasch|ueberrasch|wirklich\?)\b/.test(t)) return 'surprised';
        if (/\b(leider|tut mir leid|schade|traurig|nicht gut|problem|fehler)\b/.test(t)) return 'concerned';
        if (/\b(achtung|warnung|vorsicht|gefährlich|gefaehrlich|dringend|stau|unfall|sperrung|glatteis)\b/.test(t)) return 'serious';
        if (/\b(hmm|überlege|ueberlege|mal sehen|ich prüfe|ich pruefe)\b/.test(t)) return 'thinking';
        if (/\b(haha|hehe|witzig|lustig|super|prima|perfekt|geschafft|gerne|gern|freut mich|natürlich|natuerlich|klar)\b/.test(t)) return 'happy';
        if (/\?\s*$/.test(t.trim())) return 'question';
        return 'friendly';
    }
    var BETONT_HOCH = /(\d|wichtig|achtung|wirklich|genau|sofort|endlich|überraschung|ueberraschung|übrigens|uebrigens|tatsächlich|tatsaechlich|krass|wahnsinn|unglaublich|super|prima|perfekt)/i;
    var BETONT_ENG = /^(nie|nicht|kein|keine|keinen|niemals|leider|problem|stau|unfall|achtung|vorsicht|warnung)$/i;

    /* ---------- Sprechen verfolgen ---------- */
    var S = null;   // aktueller Satz-/Wortplan
    function plan(audio, text) {
        var clean = String(text || '').replace(/\[[^\]]+\]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!clean) return null;
        var total = clean.length, sentences = [], re = /[^.!?]+[.!?]*/g, m, pos = 0;
        while ((m = re.exec(clean))) {
            var t = m[0].trim(); if (!t) continue;
            sentences.push({ text: t, von: m.index / total, bis: (m.index + m[0].length) / total, geplant: false });
        }
        var words = [], wr = /[A-Za-zÄÖÜäöüß0-9,.-]+/g, w;
        while ((w = wr.exec(clean))) {
            var word = w[0].replace(/[.,!?;:]+$/g, '');
            if (word.length < 2 && !/\d/.test(word)) continue;
            var hoch = BETONT_HOCH.test(word), eng = BETONT_ENG.test(word);
            if (hoch || eng) words.push({ p: w.index / total, art: eng ? 'eng' : 'hoch', fertig: false });
        }
        return { audio: audio, text: clean, sentences: sentences, words: words, satz: -1, ende: false, letzteBetonung: 0, frage: /\?\s*$/.test(clean) };
    }

    function sprechTakt() {
        var a = window.__jvLipAudio, text = window.__jvLipText || '';
        var spricht = !!(a && !a.paused && !a.ended);
        if (!spricht) { return false; }
        if (!S || S.audio !== a) S = plan(a, text);
        if (!S) return true;
        var dur = Number(a.duration);
        if (!isFinite(dur) || dur <= 0) return true;
        var p = Math.max(0, Math.min(1, (Number(a.currentTime) || 0) / dur));
        var jetzt = Date.now();

        // Satzwechsel: neue Stimmung
        var idx = -1;
        for (var i = 0; i < S.sentences.length; i++) { if (p >= S.sentences[i].von - .001) idx = i; }
        if (idx !== S.satz && idx >= 0) {
            S.satz = idx;
            try { av().setExpression(stimmung(S.sentences[idx].text)); } catch (e) {}
            if (idx > 0 && Math.random() < .5 * skala()) zeige(Math.random() < .5 ? FORMEN.brauenHoch() : FORMEN.einBrauHoch(), 700);
        }
        // Betonung
        for (var j = 0; j < S.words.length; j++) {
            var w = S.words[j];
            if (!w.fertig && p >= w.p) {
                w.fertig = true;
                if (jetzt - S.letzteBetonung > 1300 && Math.random() < .8 * skala() && p < .9) {
                    S.letzteBetonung = jetzt;
                    zeige(w.art === 'eng' ? FORMEN.zusammenkneifen() : FORMEN.brauenHoch(), 650);
                }
            }
        }
        // Satzende der ganzen Antwort: Grinsen, Zwinkern oder Frage-Blick
        if (!S.ende && p >= .9) {
            S.ende = true;
            var r = Math.random(), f = skala();
            if (S.frage) zeige(FORMEN.brauenHoch(), 1700);
            else if (r < .3 * Math.min(1.4, f)) zeige(FORMEN.zwinkern(), 420);
            else if (r < .65 * Math.min(1.4, f)) zeige(Math.random() < .5 ? FORMEN.grinsen() : FORMEN.schiefGrinsen(), 1600);
        }
        return true;
    }

    /* ---------- Zuhören und Nachdenken ---------- */
    var naechsteZuhoer = 0, naechsteDenk = 0, letzterZustand = 'idle';
    function zustandTakt(st) {
        var jetzt = Date.now(), f = skala();
        if (st === 'listening') {
            if (jetzt >= naechsteZuhoer) {
                naechsteZuhoer = jetzt + (2200 + Math.random() * 3200) / Math.max(.5, f);
                var r = Math.random();
                zeige(r < .3 ? FORMEN.einBrauHoch() : r < .55 ? FORMEN.interessiert() : r < .8 ? FORMEN.laecheln() : FORMEN.zusammenkneifen(), 900 + Math.random() * 500);
            }
        } else if (st === 'thinking') {
            if (jetzt >= naechsteDenk) {
                naechsteDenk = jetzt + 1800 + Math.random() * 1800;
                zeige(FORMEN.blickWeg(), 1300);
            }
        }
    }

    function takt() {
        if (!skala() || !bereit()) { if (meinAktiv) loesche(); return; }
        var a = av(), st = a.state;
        if (st === 'speaking') { sprechTakt(); }
        else {
            S = null;
            if (st !== letzterZustand && (letzterZustand === 'speaking') && meinAktiv) { /* Abschluss-Grinsen/Zwinkern läuft noch kurz aus */ }
            if (st === 'listening' || st === 'thinking') zustandTakt(st);
        }
        if (st !== letzterZustand) {
            if ((letzterZustand === 'listening' || letzterZustand === 'thinking') && st !== letzterZustand && meinAktiv) loesche();
            letzterZustand = st;
        }
    }
    setInterval(takt, 120);

    /* ---------- Sprache ---------- */
    function sag(t) { try { if (typeof window.speak === 'function') window.speak(t, typeof window.continueConversation === 'function' ? window.continueConversation : undefined); } catch (e) {} }
    function setze(s, antwort) { lsSet(KEY, s); if (s === 'aus') loesche(); sag(antwort); }

    function handle(text) {
        var t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:bitte\s+)?(?:zane\s+|jarvis\s+)?/, '');
        if (!t || t.length > 40) return false;
        var s = stufe();
        if (/^(?:mimik|gesicht|gesichtsausdruck)\s+(?:mehr|stärker|staerker|viel|lebhafter)$/.test(t) || /^mehr (?:mimik|gesicht)$/.test(t)) { setze(s === 'wenig' ? 'normal' : 'viel', s === 'wenig' ? 'Normale Mimik, alles klar.' : 'Gut, ich zeige jetzt viel mehr Gesicht.'); return true; }
        if (/^(?:mimik|gesicht|gesichtsausdruck)\s+(?:weniger|schwächer|schwaecher|dezenter|ruhiger)$/.test(t) || /^weniger (?:mimik|gesicht)$/.test(t)) { setze(s === 'viel' ? 'normal' : 'wenig', s === 'viel' ? 'Okay, normale Mimik.' : 'Verstanden, ich bleibe dezenter.'); return true; }
        if (/^(?:mimik|gesicht)\s+normal$/.test(t)) { setze('normal', 'Normale Mimik.'); return true; }
        if (/^(?:mimik|gesicht)\s+(?:aus|abschalten|ausschalten)$/.test(t) || /^keine mimik$/.test(t)) { setze('aus', 'Gut, ich mache ein ernstes Gesicht.'); return true; }
        if (/^(?:mimik|gesicht)\s+(?:an|einschalten|anschalten)$/.test(t)) { setze('normal', 'Die Mimik ist wieder an.'); return true; }
        if (/^(?:zwinker|zwinkere)(?: mal)?$/.test(t) || /^(?:zwinker|zwinkere) mir (?:mal )?zu$/.test(t)) { if (bereit()) zeige(FORMEN.zwinkern(), 450); else sag('Dafür müsste der Kopf gerade sichtbar sein.'); return true; }
        if (/^(?:grins|grinse)(?: mal)?$/.test(t) || /^lächle(?: mal)?$/.test(t) || /^laechle(?: mal)?$/.test(t)) { if (bereit()) zeige(FORMEN.grinsen(), 1800); else sag('Dafür müsste der Kopf gerade sichtbar sein.'); return true; }
        return false;
    }
    window.handleMimikCommand = handle;
    window.jvMimik = { stufe: stufe, zeige: function (n) { if (FORMEN[n]) zeige(FORMEN[n](), 1500); } };

    function registerCommand() {
        if (!window.jvCommands) return false;
        window.jvCommands.use('mimik', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Mimik', e); }
            return next(text);
        }, 155);
        return true;
    }
    if (!registerCommand()) document.addEventListener('DOMContentLoaded', registerCommand);
})();

/* Stand 14.10. 23:10 */
