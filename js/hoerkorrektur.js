/* ============================================================
   HÖR-KORREKTUR: Die Spracherkennung des Handys verhört sich bei manchen Namen und Wörtern immer gleich ("Hamlet" statt "Hamiyet").
   Du bringst Jarvis die richtige Schreibweise einmal bei, dann ersetzt die App das falsch erkannte Wort, bevor irgendetwas damit passiert
   (Kalender-Suche, Kontakte, die KI), und die Korrektur bleibt dauerhaft gespeichert.
   Sagen: "Wenn ich Hamlet sage, meine ich Hamiyet" / "Schreib Hamiyet statt Hamlet" / "Korrigiere Hamlet zu Hamiyet".
   Liste: "Welche Hör-Korrekturen hast du?"  Löschen: "Vergiss die Korrektur für Hamlet".
   Das ist etwas anderes als die Aussprache-Liste (wie Jarvis ein Wort SPRICHT): hier geht es darum, wie ein erkanntes Wort GESCHRIEBEN wird.
   Braucht: assistant.js (sendToGroqSmart), localcommands.js (handleLocalCommand). Muss nach beiden geladen werden.
   ============================================================ */
(function () {
    const KEY = 'jv_hoerkorrektur';
    const MAX_ITEMS = 60;
    const PROTECTED = /^(?:ja|nein|und|oder|der|die|das|ich|du|er|sie|es|wir|mit|von|bei|für|auf|aus|nach|zum|zur|wie|was|wer|wo|wann|warum|nicht|ist|bin|war|hat|habe|mein|meine|dein|jarvis)$/i;

    function load() { try { const v = JSON.parse(localStorage.getItem(KEY) || '{}'); return (v && typeof v === 'object' && !Array.isArray(v)) ? v : {}; } catch (e) { return {}; } }
    function save(map) { try { localStorage.setItem(KEY, JSON.stringify(map)); } catch (e) {} }
    const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const clean = s => String(s || '').trim().replace(/^[„“"»«'‚‘]+|[„“"»«'‚‘.!?,;:]+$/g, '').trim();

    /* Wendet alle gespeicherten Korrekturen auf einen erkannten Satz an (längste zuerst, ganze Wörter, Groß-/Kleinschreibung egal) */
    /* Einträge: Text = überall ersetzen; {r, c:1} = nur im Namens-Zusammenhang ersetzen (für Wortgruppen wie "haben jetzt") */
    const CTX = '(?:kennst\\s+du|kennt\\s+ihr|kenne\\s+ich|kennen\\s+wir|rufe?|ruf\\s+mal|anrufe?|anruf|kontakt|wann\\s+hat|wer\\s+ist|wo\\s+wohnt|wo\\s+arbeitet|wo\\s+ist|nachricht\\s+an|mail\\s+an|schreib\\s+an|an|mit|bei|von|für|über)';
    function fix(text) {
        let t = String(text == null ? '' : text);
        const map = load();
        Object.keys(map).sort((a, b) => b.length - a.length).forEach(k => {
            const e = map[k], r = (e && typeof e === 'object') ? e.r : e, ctx = !!(e && typeof e === 'object' && e.c);
            try {
                if (ctx) t = t.replace(new RegExp('(^|[^A-Za-zÄÖÜäöüß0-9])(' + CTX + ')(\\s+)' + esc(k).replace(/\\ /g, '\\s+') + '(?![A-Za-zÄÖÜäöüß0-9])', 'gi'), (m, pre, tr, sp) => pre + tr + sp + r);
                else t = t.replace(new RegExp('(^|[^A-Za-zÄÖÜäöüß0-9])' + esc(k) + '(?![A-Za-zÄÖÜäöüß0-9])', 'gi'), (m, pre) => pre + r);
            } catch (e2) {}
        });
        return t;
    }
    window.jvHoerKorrektur = fix;

    function say(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    function card(list) { try { clearActionCards(); showActionCards(list); } catch (e) {} }

    /* ---------- Befehle ---------- */
    function parseTeach(t) {
        let m = t.match(/^(?:wenn|falls)\s+ich\s+(.+?)\s+sage[,:]?\s+(?:dann\s+)?(?:meine|meinte)\s+ich\s+(.+)$/i)
             || t.match(/^(?:wenn|falls)\s+ich\s+(.+?)\s+sage[,:]?\s+(?:dann\s+)?(?:schreib|schreibe|schreibst\s+du)\s+(.+)$/i);
        if (m) return { falsch: clean(m[1]), richtig: clean(m[2]) };
        m = t.match(/^(?:schreib|schreibe)\s+(.+?)\s+(?:statt|anstatt|und\s+nicht)\s+(.+)$/i);
        if (m) return { falsch: clean(m[2]), richtig: clean(m[1]) };
        m = t.match(/^(?:korrigiere|ersetze)\s+(.+?)\s+(?:durch|mit|zu|in)\s+(.+)$/i);
        if (m) return { falsch: clean(m[1]), richtig: clean(m[2]) };
        return null;
    }

    function handle(textRaw) {
        const raw = String(textRaw || '').trim();
        if (!raw || raw.length > 120) return false;
        const t = raw.replace(/\s+/g, ' ');

        const del = t.match(/^(?:bitte\s+)?(?:vergiss|lösche|löschen|entferne)\s+(?:die\s+)?(?:hör-?korrektur|korrektur|schreibweise)\s+(?:von|für|bei)\s+(.+)$/i);
        if (del) {
            const k = clean(del[1]).toLowerCase();
            const map = load();
            const hit = Object.keys(map).find(x => x.toLowerCase() === k);
            if (!hit) { say('Dazu habe ich keine Korrektur gespeichert.'); return true; }
            delete map[hit]; save(map);
            say(`Die Korrektur für ${hit} ist gelöscht.`);
            return true;
        }
        if (/^(?:welche|zeig\w*|nenne?|sag\w*)\b.*\b(?:hör-?korrekturen|korrekturen|schreibweisen)\b/i.test(t)) {
            const map = load(), keys = Object.keys(map);
            if (!keys.length) { say('Ich habe keine Hör-Korrekturen gespeichert.'); return true; }
            card(keys.slice(0, 8).map(k => ({ icon: '✏️', title: `„${k}“ → „${typeof map[k] === 'object' ? map[k].r : map[k]}“`, subtitle: 'Hör-Korrektur' })));
            say(`Ich habe ${keys.length === 1 ? 'eine Korrektur' : keys.length + ' Korrekturen'} gespeichert, sie stehen auf den Karten.`);
            return true;
        }
        const p = parseTeach(t);
        if (!p) return false;
        if (!p.falsch || !p.richtig || p.falsch.length < 3 || p.richtig.length < 2 || p.falsch.length > 40 || p.richtig.length > 40) return false;
        if (p.falsch.toLowerCase() === p.richtig.toLowerCase()) return false;
        if (p.falsch.split(/\s+/).length > 3 || p.richtig.split(/\s+/).length > 3) return false;
        if (PROTECTED.test(p.falsch)) { say('Dieses Wort ist zu allgemein, das möchte ich nicht ersetzen.'); return true; }
        const map = load();
        if (Object.keys(map).length >= MAX_ITEMS) { say('Die Liste der Hör-Korrekturen ist voll. Löschen Sie bitte erst eine.'); return true; }
        const ctxOnly = p.falsch.split(/\s+/).length > 1;
        map[p.falsch] = ctxOnly ? { r: p.richtig, c: 1 } : p.richtig; save(map);
        card([{ icon: '✏️', title: `„${p.falsch}“ → „${p.richtig}“`, subtitle: ctxOnly ? 'Hör-Korrektur gespeichert (nur bei Namen-Sätzen)' : 'Hör-Korrektur gespeichert' }]);
        say(ctxOnly ? `Verstanden. Wenn ich ${p.falsch} höre und es nach einem Namen klingt, schreibe ich ${p.richtig}.` : `Verstanden. Wenn ich ${p.falsch} höre, schreibe ich ab jetzt ${p.richtig}.`);
        return true;
    }
    window.handleHoerKorrekturCommand = handle;

    /* ---------- Einhängen ---------- */
    if (window.jvCommands) {   // Befehlsliste (commands.js): alles, was weiter innen steht, bekommt den korrigierten Text
        window.jvCommands.use('hoerkorrektur', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Hör-Korrektur', e); }
            const fixed = fix(text);
            return next(fixed);
        }, 400);
    }
    if (typeof window.sendToGroqSmart === 'function' && !window.sendToGroqSmart._hoerkorrektur) {
        const original = window.sendToGroqSmart;
        const wrapped = function (text) {
            const args = Array.prototype.slice.call(arguments);
            if (typeof text === 'string') args[0] = fix(text);
            return original.apply(this, args);
        };
        wrapped._hoerkorrektur = true;
        Object.keys(original).forEach(k => { try { wrapped[k] = original[k]; } catch (e) {} });
        window.sendToGroqSmart = wrapped;
    }
})();