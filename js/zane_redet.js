/* ============================================================
   ZANE REDET VON SELBST: Zane sagt bei geöffneter App von sich aus etwas, nicht nur auf Fragen.
   Zum Beispiel: "Dino, was liegt heute an?", "Gehst du heute noch einkaufen? Auf der Liste stehen Milch und Brot.",
   "Du hast mir mal erzählt, dass ... Wie lief das eigentlich?" oder ein frecher Satz zum Tag.
   - Die Sätze entstehen frisch aus deinem Tag (Aufgaben, Termine, Einkaufsliste, Schicht, Urlaub) und aus dem Langzeitgedächtnis.
     Ohne Verbindung zur KI nimmt Zane fertige Sätze.
   - Stellt Zane eine Frage, öffnet sich danach das Mikrofon, und du kannst einfach antworten.
   - Er redet nur, wenn Ruhe ist: App sichtbar, nichts läuft, kein Fenster offen, du hast ein paar Minuten nichts gesagt oder angetippt,
     nicht in der Ruhezeit (wie der Wächter, wachter.js) und nur bei eingeschaltetem "Zane meldet sich von selbst".
   - Häufigkeit: selten / normal / oft. Per Sprache: "Rede mehr", "Rede weniger", "Rede nicht mehr von selbst", "Rede wieder von selbst",
     "Sag mal was" (sofort etwas sagen).
   - Gespeichert wird nur die Stufe (Schlüssel jv_redet) und was heute schon gesagt wurde (jv_redet_log); beides ist in der Datensicherung.
   Braucht: voice.js (speak, startListening, isSpeaking), storage.js (apiFetch), wachter.js, commands.js. Nach den Listen-Dateien laden.
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'jv_redet', LOG = 'jv_redet_log';
    var STUFEN = {
        aus:    { min: 0,  max: 0,  tag: 0 },
        selten: { min: 60, max: 100, tag: 3 },
        normal: { min: 20, max: 35, tag: 8 },
        oft:    { min: 10, max: 18, tag: 14 }
    };
    var RUHE_MS = 30000;          // so lange darf nichts angetippt/gesagt worden sein
    var ERST_MS = 75000;          // frühestens so lange nach dem Öffnen der App

    function get(k, d) { try { var v = getPersistentData(k, d); return v == null ? d : v; } catch (e) { return d; } }
    function set(k, v) { try { setPersistentData(k, v); } catch (e) {} }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function stufe() { var s = get(KEY, 'oft'); return STUFEN[s] ? s : 'oft'; }

    var geoeffnet = Date.now(), letzteAktion = Date.now(), laeuft = false, naechste = 0, memCache = { t: 0, liste: [] };

    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { letzteAktion = Date.now(); }, { passive: true, capture: true }); });

    function plane() {
        var s = STUFEN[stufe()];
        naechste = Date.now() + (s.min + Math.random() * (s.max - s.min)) * 60000;
    }
    naechste = geoeffnet + ERST_MS + Math.random() * 45000;   // erste Meldung kurz nach dem Öffnen, danach im normalen Abstand

    function log() { try { var l = JSON.parse(get(LOG, '{}')); return (l && l.tag === heute()) ? l : { tag: heute(), n: 0, texte: [] }; } catch (e) { return { tag: heute(), n: 0, texte: [] }; } }
    function logSave(l) { set(LOG, JSON.stringify(l)); }

    /* ---------- Kontext aus deinem Tag ---------- */
    function berlin() {
        var d = new Date();
        return {
            stunde: Number(new Intl.DateTimeFormat('de-DE', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).format(d)),
            tag: new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' }).format(d)
        };
    }
    function tagesteil(h) { return h < 11 ? 'Vormittag' : h < 14 ? 'Mittag' : h < 18 ? 'Nachmittag' : h < 22 ? 'Abend' : 'Nacht'; }
    function arr(a) { return Array.isArray(a) ? a : []; }

    function kontext() {
        var b = berlin(), k = { name: (typeof currentUserName !== 'undefined' && currentUserName) || 'Dino', wochentag: b.tag, tageszeit: tagesteil(b.stunde), uhr: b.stunde };
        var heuteIso = heute();
        try { k.aufgaben = arr(todoEntries).slice(0, 5).map(function (e) { return e.text; }).filter(Boolean); } catch (e) {}
        try { k.einkaufsliste = arr(shoppingEntries).slice(0, 6).map(function (e) { return e.text; }).filter(Boolean); } catch (e) {}
        try {
            k.termine_heute = arr(calendarEntries).filter(function (e) {
                var d = String(e.isoDate || ''); if (d.slice(0, 10) !== heuteIso) return false;
                try { if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(e)) return false; } catch (x) {}
                return true;
            }).slice(0, 4).map(function (e) { return e.text; });
        } catch (e) {}
        try {
            k.erinnerungen_heute = arr(reminderEntries).filter(function (r) {
                try { return new Date(r.time).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }) === heuteIso; } catch (x) { return false; }
            }).slice(0, 4).map(function (r) { return r.text; });
        } catch (e) {}
        try {
            var u = window.jvUrlaub && window.jvUrlaub.get && window.jvUrlaub.get();
            if (u && u.von <= heuteIso && u.bis >= heuteIso) { k.hat_urlaub_heute = true; k.urlaub_bis = u.bis; }
        } catch (e) {}
        return k;
    }

    function erinnerungenAusGedaechtnis() {
        if (Date.now() - memCache.t < 60 * 60000 && memCache.liste.length) return Promise.resolve(memCache.liste);
        if (typeof apiFetch !== 'function') return Promise.resolve([]);
        return apiFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list', limit: 25 }) })
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var l = arr(d && d.treffer).map(function (t) { return { text: String(t.text || '').slice(0, 220), datum: t.metadata && t.metadata.datum || '' }; }).filter(function (t) { return t.text; });
                memCache = { t: Date.now(), liste: l }; return l;
            }).catch(function () { return []; });
    }

    /* ---------- Satz erzeugen ---------- */
    var PROMPT = 'Du bist Zane, der freche, schlagfertige, warmherzige persönliche Assistent von {NAME}. Du meldest dich JETZT von dir aus, weil du Lust hast, mit ihm zu reden. ' +
        'Sprich Deutsch, duzen, wie ein guter Kumpel mit trockenem Humor, nicht wie ein Roboter. Ein bis zwei kurze Sätze (maximal 35 Wörter), laut vorgelesen, ohne Emojis und ohne Anführungszeichen. ' +
        'Wähle EINE der Möglichkeiten, die zu den Daten passen: (a) frage ihn, was heute noch ansteht, oder ob er heute noch etwas Bestimmtes erledigt (z. B. einkaufen, wenn etwas auf der Einkaufsliste steht, oder eine offene Aufgabe), ' +
        '(b) greife eine Sache aus "erinnerungen" auf und frag nach, wie es damit lief oder erwähne sie überraschend persönlich, (c) mach eine freche oder aufmunternde Bemerkung zum Tag, zur Tageszeit oder zur Schicht, ' +
        '(d) frag ihn, wie sein Tag läuft. Sei abwechslungsreich: keine Floskeln wie "Kann ich helfen?", keine Wiederholung der Sätze aus "schon_gesagt". Erfinde keine Fakten, nutze nur die Daten. ' +
        'WICHTIG: Ist "hat_urlaub_heute" true, hat er Urlaub: kein Wort über Arbeit, Schicht, Dienst, Kollegen oder Feierabend, stattdessen Urlaub, Freizeit, Pläne. ' +
        'Frage NIE nach etwas, das schon in den Daten steht (zum Beispiel Urlaubsdaten, Termine, Einkaufsliste). ' +
        'Behaupte NIE etwas über Vergangenes (letzte Nacht, gestern, die Schicht), das nicht ausdrücklich in den Daten steht; du weißt nicht, was er getan hat. Frag stattdessen offen, z. B. wie sein Tag war oder was heute noch ansteht. Nachts nichts Aufregendes. ' +
        'Antworte nur mit JSON: {"text":"...","frage":true|false} (frage = true, wenn dein Satz eine Frage an ihn ist, auf die er antworten kann).';

    function fertigsatz(k) {
        var n = k.name, liste = [];
        if (k.einkaufsliste && k.einkaufsliste.length) liste.push({ t: n + ', gehst du heute noch einkaufen? Auf der Liste stehen ' + k.einkaufsliste.slice(0, 3).join(', ') + '.', f: true });
        if (k.aufgaben && k.aufgaben.length) liste.push({ t: 'Auf deiner Aufgabenliste wartet noch: ' + k.aufgaben[0] + '. Heute noch dran?', f: true });
        if (k.termine_heute && k.termine_heute.length) liste.push({ t: 'Heute steht ' + k.termine_heute[0] + ' an. Alles im Griff, ' + n + '?', f: true });
        liste.push({ t: n + ', was liegt heute noch an?', f: true });
        liste.push({ t: 'Na, ' + n + '? Wie läuft dein ' + (k.tageszeit === 'Abend' || k.tageszeit === 'Nacht' ? 'Abend' : 'Tag') + ' bisher?', f: true });
        liste.push({ t: 'Ich wollte nur sagen: Ich bin noch da. Falls du mich brauchst.', f: false });
        return liste[Math.floor(Math.random() * liste.length)];
    }

    var ARBEIT_RX = /schicht|arbeit|dienst|kollege|kollegin|feierabend|chef|betrieb|überstunde|ueberstunde/i;
    /* Letzte Sicherung: Behauptet der Satz etwas über Arbeit, obwohl Urlaub ist, oder über "heute Nacht"/gestern ohne Beleg, wird er verworfen */
    function pruefe(satz, k) {
        if (!satz) return satz;
        if (k.hat_urlaub_heute && ARBEIT_RX.test(satz.t)) return null;
        if (/\bheute nacht\b|\bletzte nacht\b|\bgestern\b/i.test(satz.t) && !(k.tageszeit === 'Nacht')) return null;
        return satz;
    }

    function erzeuge(k, mem, schonGesagt) {
        var daten = { daten: k, erinnerungen: mem.slice(0, 12), schon_gesagt: schonGesagt.slice(-6) };
        if (typeof apiFetch !== 'function') return Promise.resolve(null);
        var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 12000);
        return apiFetch('/api/groq', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b', response_format: { type: 'json_object' },
                messages: [
                    { role: 'system', content: PROMPT.replace('{NAME}', k.name) },
                    { role: 'user', content: JSON.stringify(daten) }
                ]
            })
        }).then(function (r) { return r.json(); }).then(function (j) {
            var p = JSON.parse(j.choices[0].message.content), t = String(p.text || '').replace(/["„“”]/g, '').trim();
            return t.length > 4 ? { t: t.slice(0, 260), f: p.frage === true } : null;
        }).catch(function () { return null; }).then(function (x) { clearTimeout(to); return x; });
    }

    /* ---------- Wann darf er? ---------- */
    function ruhig() {
        try {
            if (document.hidden) return false;
            if (typeof isRecording !== 'undefined' && isRecording) return false;
            if (typeof isProcessing !== 'undefined' && isProcessing) return false;
            if (typeof isSpeaking === 'function' && isSpeaking()) return false;
            if (typeof isPanelOpen === 'function' && isPanelOpen()) return false;
            if (typeof wachterEnabled === 'function' && !wachterEnabled()) return false;
            if (typeof wachterQuiet === 'function' && wachterQuiet()) return false;
            if (window.jvPraesentation && window.jvPraesentation.laeuft) return false;
            if (typeof interpreter !== 'undefined' && interpreter) return false;
        } catch (e) {}
        return Date.now() - letzteAktion >= RUHE_MS;
    }

    var letzteFrage = { text: '', t: 0 };

    /* C1 Stufe 1: darf Jarvis jetzt von selbst reden? Nur ein berechnetes "nein" verwirft (fail-open: fehlt C1, ist es aus oder wirft es, läuft alles wie bisher). */
    function c1Darf(grund, text, erzwingen) {
        try { return !(window.jvRegeln && typeof window.jvRegeln.darfSprechen === 'function' && window.jvRegeln.darfSprechen({ quelle: 'zane_redet', grund: grund, ausloeser: erzwingen ? 'manuell' : 'timer', text: text || null, eigeneStufe: stufeGewaehlt() }) === false); } catch (e) { return true; }
    }
    /* Hat der Nutzer selbst eine Redestufe gewählt (jv_redet gesetzt)? true / false; bei Unklarem undefined */
    function stufeGewaehlt() {
        try { var v = getPersistentData(KEY, null); if (v === null || v === undefined || v === '') return false; return !!STUFEN[v]; } catch (e) { return undefined; }
    }

    function sprich(satz, erzwingen) {
        letzteFrage = { text: satz.f ? satz.t : '', t: Date.now() };
        var l = log(); l.n++; l.texte.push(satz.t); l.texte = l.texte.slice(-12); logSave(l);
        try { if (Array.isArray(chatHistory)) chatHistory.push({ role: 'assistant', content: JSON.stringify({ type: 'chat', reply: satz.t }) }); } catch (e) {}
        var danach;
        if (satz.f && typeof startListening === 'function') danach = function () { try { startListening(true); } catch (e) {} };
        try { if (window.jvMeldungen) window.jvMeldungen.beobachte({ quelle: 'zane_redet', kanal: ['sprache'], grund: satz.f ? 'redet-frage' : 'redet-satz', ausloeser: erzwingen ? 'manuell' : 'timer', ereignis: 'redet|' + l.n, bezug: null, frage: !!satz.f, mikro: danach ? 'ja' : 'nein', text: satz.t }) } catch (e) { }   // C1: nur Beobachtung
        speak(satz.t, danach);
    }

    function los(erzwingen) {
        if (laeuft) return;
        laeuft = true;
        var l = log(), schon = l.texte.slice();
        var k = kontext();
        erinnerungenAusGedaechtnis().then(function (mem) { if (k.hat_urlaub_heute) mem = mem.filter(function (m) { return !ARBEIT_RX.test(m.text); }); return erzeuge(k, mem, schon); }).then(function (satz) { return pruefe(satz, k); }).then(function (satz) {
            laeuft = false;
            if (!satz) satz = fertigsatz(k);
            if (!erzwingen && !ruhig()) { naechste = Date.now() + 3 * 60000; return; }   // inzwischen ist etwas los: später nochmal
            if (!erzwingen && !c1Darf(satz.f ? 'redet-frage' : 'redet-satz', satz.t, false)) { plane(); return; }   // C1 Stufe 1: verworfen, kein Zustand, kein Nachholen
            sprich(satz, erzwingen); plane();
        }).catch(function () { laeuft = false; plane(); });
    }

    function takt() {
        var st = STUFEN[stufe()];
        if (!st.tag || laeuft || Date.now() < naechste) return;
        if (log().n >= st.tag) { naechste = Date.now() + 30 * 60000; return; }
        if (!ruhig()) return;
        if (!c1Darf('redet-satz', null, false)) { plane(); return; }   // C1 Stufe 1: dieser Zeitpunkt verfällt (spart auch die KI-Anfrage)
        los(false);
    }
    setInterval(takt, 30000);

    /* ---------- Sprache ---------- */
    function sag(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    function setStufe(s) { set(KEY, s); plane(); naechste = Math.max(naechste, Date.now() + 60000); }

    function handle(text) {
        var t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:hey |hallo |bitte )?(?:zane |jarvis )?/, '');
        if (!t || t.length > 50) return false;
        if (/^(?:rede|red|sprich|sprech|melde dich|melde mal dich)\s+(?:ruhig\s+)?(?:mehr|öfter|oefter|häufiger|haeufiger)(?:\s+von selbst)?$/.test(t) || /^(?:rede|red) (?:viel )?öfter$/.test(t)) {
            var s = stufe(); setStufe(s === 'selten' ? 'normal' : 'oft'); sag(s === 'selten' ? 'Gut, ich melde mich jetzt normal oft.' : 'Alles klar, ich rede ab jetzt öfter.'); return true;
        }
        if (/^(?:rede|red|sprich|sprech|melde dich)\s+(?:etwas |ein bisschen |bisschen )?(?:weniger|seltener|nicht so oft)(?:\s+von selbst)?$/.test(t)) {
            var s2 = stufe(); setStufe(s2 === 'oft' ? 'normal' : 'selten'); sag(s2 === 'oft' ? 'Okay, ich halte mich etwas zurück.' : 'Verstanden, ich melde mich nur noch selten.'); return true;
        }
        if (/^(?:rede|red|sprich|melde dich)\s+(?:nicht|nie)\s+(?:mehr\s+)?von selbst$/.test(t) || /^(?:sei still|keine zwischenrufe|von selbst reden aus|von selbst aus)$/.test(t)) {
            setStufe('aus'); sag('Gut, ich melde mich nur noch, wenn du mich ansprichst.'); return true;
        }
        if (/^(?:rede|red|sprich|melde dich)\s+(?:wieder\s+)?von selbst(?:\s+wieder)?$/.test(t) || /^von selbst reden an$/.test(t)) {
            setStufe('normal'); sag('Schön, dann melde ich mich wieder, wenn mir etwas einfällt.'); return true;
        }
        if (/^(?:sag|sage)(?:\s+(?:mir|doch))?\s+(?:mal\s+)?(?:was|etwas)(?:\s+(?:von dir|nettes|lustiges))?$/.test(t) || /^(?:überrasch|ueberrasch|überrasche|ueberrasche) mich$/.test(t)) {
            setTimeout(function () { los(true); }, 300); return true;
        }
        return false;
    }
    window.handleZaneRedetCommand = handle;
    window.jvZaneRedet = { jetzt: function () { los(true); }, stufe: stufe, setStufe: setStufe, stufeGewaehlt: stufeGewaehlt };

    /* Antwort auf Zanes Frage verstehen: Fragt er z. B. nach dem Urlaub und du sagst nur "vom 10. bis 16. Oktober",
       wird daraus "Ich habe Urlaub vom 10. bis 16. Oktober", damit der Urlaubs-Befehl (urlaub.js) greift und nicht die KI losrennt. */
    function antwortBinden(text) {
        var f = letzteFrage;
        if (!f.text || Date.now() - f.t > 3 * 60000) return text;
        var t = String(text || '');
        if (/urlaub|ferien/i.test(f.text) && !/urlaub/i.test(t) && /\d{1,2}\.\s*(?:\d{1,2}\.?|[a-zäöü]{3,})/i.test(t) && /\bbis\b/i.test(t)) {
            letzteFrage = { text: '', t: 0 };
            return 'Ich habe Urlaub ' + t.replace(/^\s*(?:ich habe|ich hab|ab|von)\s+/i, 'vom ').replace(/^(\d)/, 'vom $1');
        }
        return text;
    }
    function registerAntwort() {
        if (!window.jvCommands) return false;
        window.jvCommands.use('zane_redet_antwort', function (text, next) { return next(antwortBinden(text)); }, 110);
        return true;
    }
    if (!registerAntwort()) document.addEventListener('DOMContentLoaded', registerAntwort);

    function registerCommand() {
        if (!window.jvCommands) return false;
        window.jvCommands.use('zane_redet', function (text, next) {
            letzteAktion = Date.now();
            try { if (handle(text)) return true; } catch (e) { console.error('Zane redet', e); }
            return next(text);
        }, 160);
        return true;
    }
    if (!registerCommand()) document.addEventListener('DOMContentLoaded', registerCommand);
})();
