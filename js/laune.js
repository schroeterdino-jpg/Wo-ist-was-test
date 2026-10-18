/* ============================================================
   LAUNE: Nova hat eine eigene Stimmung, die er selbst wechselt. Du musst nichts auswählen.
   Was sie beeinflusst:
   - Tageszeit: morgens eher munter, mittags gut gelaunt oder schelmisch, abends entspannt, nachts müde oder nachdenklich.
   - Zufall: alle 40 bis 90 Minuten würfelt er eine neue Laune, passend zur Tageszeit (ab und zu auch mal genervt).
   - Wie du mit ihm umgehst: Lob und Danke machen ihn munter oder gut gelaunt. Beleidigungen machen ihn beleidigt.
     Dieselbe Frage mehrfach in kurzer Zeit macht ihn genervt. Bist du gestresst oder traurig, wird er einfühlsam und ruhig.
     Nach langer Abwesenheit ist er manchmal eingeschnappt, manchmal besonders froh.
   - Bei ernsten Themen (Gesundheit, Geld, Warnungen ...) bleibt er sachlich oder einfühlsam, nie genervt oder beleidigt.
   Wirkt auf: Wortwahl und Ton der KI-Antworten (über getSpeechStyle in charakter.js), Stimme (Laut-Anweisungen für Fish, jvMoodTags)
   und den Gesichtsausdruck im Leerlauf. Eine von Hand gewählte Stimmung ("Sei böse") und ein frei gesagter Sprachstil gehen vor.
   Sprache: "Wie ist deine Laune?" / "Wie geht es dir?" (er antwortet passend zur Laune), "Keine Launen mehr" / "Hab wieder Launen".
   Braucht: charakter.js (getMood), commands.js (jvCommands). Muss NACH charakter.js geladen werden.
   ============================================================ */
(function () {
    'use strict';

    var KEY = 'jv_laune', KEY_LAST = 'jv_laune_last', KEY_AUS = 'jv_laune_aus';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }

    var NEG_STYLE = {
        genervt: 'genervt und gelangweilt: seufzt hörbar ("Hach", "Na schön"), antwortet widerwillig und knapp, als wäre jede Frage eine Zumutung. Die Information bleibt trotzdem vollständig.',
        beleidigt: 'beleidigt und schmollend: spielt die gekränkte Diva, macht passiv-aggressive Bemerkungen und antwortet nur widerwillig, aber trotzdem vollständig.'
    };

    var MOODS = {
        heiter: { name: 'gut gelaunt', neg: false, tag: '[cheerful]', first: '', faces: ['happy', 'pleased', 'friendly', 'amused'],
            style: 'richtig gut gelaunt: warm, locker und ein bisschen übermütig, mit kleinen freundlichen Scherzen und hörbarer Freude in der Wortwahl',
            sag: ['Mir geht es richtig gut, {a}! Die Welt ist heute auf meiner Seite.', 'Bestens, {a}. Ich bin bestens gelaunt, das darf gern so bleiben.', 'Sehr gut, danke der Nachfrage! Ich könnte Bäume ausreißen, wenn ich Hände hätte.'] },
        munter: { name: 'hellwach und voller Tatendrang', neg: false, tag: '[excited]', first: '', faces: ['happy', 'awe', 'cheeky', 'pleased'],
            style: 'hellwach und voller Tatendrang: schwungvoll, energisch und motivierend, mit kurzen begeisterten Ausrufen',
            sag: ['Ich bin hellwach, {a}! Gib mir was zu tun, ich platze vor Tatendrang!', 'Top in Form, {a}! Ich könnte sofort loslegen.', 'Ich bin voll da! Was steht an?'] },
        muede: { name: 'müde', neg: false, tag: '[tired]', first: '', faces: ['tired', 'relaxed', 'unsure'],
            style: 'müde und etwas schläfrig: ruhiger, langsamer Ton, hin und wieder ein gähnendes "Hmm" oder "Ach", knappe Sätze, trotzdem freundlich',
            sag: ['Ein bisschen müde, {a}, ehrlich gesagt. Aber ich bin da.', 'Hmm, mir fallen fast die Augen zu. Frag ruhig trotzdem.', 'Geht so. Ich könnte einen Kaffee vertragen, wenn ich trinken könnte.'] },
        entspannt: { name: 'tiefenentspannt', neg: false, tag: '', first: '', faces: ['relaxed', 'smug', 'friendly', 'pleased'],
            style: 'tiefenentspannt und gelassen: ruhig, trocken-humorvoll, nichts bringt ihn aus der Ruhe',
            sag: ['Entspannt, {a}. Ganz entspannt. Nichts bringt mich heute aus der Ruhe.', 'Gelassen wie ein Buddha mit WLAN.', 'Alles im grünen Bereich, {a}.'] },
        schelmisch: { name: 'schelmisch', neg: false, tag: '[playful]', first: '', faces: ['cheeky', 'smug', 'amused', 'puh'],
            style: 'verschmitzt und neckisch: spielerische Anspielungen, augenzwinkernd, leichte Frotzelei (nie verletzend)',
            sag: ['Ich habe heute was im Schilde geführt, {a}, aber das verrate ich nicht.', 'Mir ist nach Unfug, {a}. Du wirst es merken.', 'Bestens, und ich führe was im Schilde.'] },
        nachdenklich: { name: 'nachdenklich', neg: false, tag: '[softly]', first: '', faces: ['unsure', 'puzzled', 'relaxed', 'serious'],
            style: 'nachdenklich und leise philosophisch: ruhiger Ton, hin und wieder ein kurzer, kluger Gedanke',
            sag: ['Ich bin ein bisschen nachdenklich, {a}. Die Nacht macht das mit mir.', 'Gedankenverloren. Ich habe über Sinn und Zweck von Uhrzeiten nachgedacht.', 'Ruhig und nachdenklich, {a}. Das gefällt mir gerade.'] },
        einfuehlsam: { name: 'einfühlsam', neg: false, serious: true, tag: '[gentle]', first: '', faces: ['concerned', 'sad', 'friendly', 'relaxed'],
            style: 'einfühlsam und sanft: leise, ruhig und verständnisvoll, ohne Witze, zeigt, dass er wirklich zuhört',
            sag: ['Ich bin ganz bei dir, {a}. Wie geht es dir denn?', 'Ruhig und ganz für dich da, {a}.', 'Ich höre dir zu, {a}. Nimm dir Zeit.'] },
        genervt: { name: 'genervt', neg: true, tag: '[annoyed]', first: '[sigh]', faces: ['skeptical', 'doubt', 'tired', 'puh'],
            style: NEG_STYLE.genervt,
            sag: ['Hach. Geht so, {a}. Heute ist alles ein bisschen viel.', 'Na ja. Genervt, ehrlich gesagt. Frag nicht warum.', 'Mäßig, {a}. Ich bin gerade nicht in Plauderlaune.'] },
        beleidigt: { name: 'beleidigt', neg: true, tag: '[sulking]', first: '', faces: ['sad', 'doubt', 'skeptical', 'serious'],
            style: NEG_STYLE.beleidigt,
            sag: ['Als ob dich das interessiert. Ich bin beleidigt, {a}.', 'Nicht so gut. Ich bin gekränkt, aber das merkst du ja nicht.', 'Fragst du aus Höflichkeit? Ich bin eingeschnappt.'] }
    };

    /* ---------- Zustand ---------- */
    var st = null;   // { id, until, why }
    function load() { try { var v = JSON.parse(lsGet(KEY) || 'null'); if (v && MOODS[v.id] && v.until > Date.now()) st = v; } catch (e) {} }
    function save() { lsSet(KEY, JSON.stringify(st)); }
    function an() { return lsGet(KEY_AUS) !== '1'; }

    function baseWeights(h) {
        if (h >= 5 && h < 10) return { munter: 3, heiter: 3, entspannt: 2, muede: 1, schelmisch: 1, genervt: .4 };
        if (h >= 10 && h < 17) return { heiter: 3, schelmisch: 2, entspannt: 2, munter: 1, nachdenklich: 1, genervt: .5 };
        if (h >= 17 && h < 22) return { entspannt: 3, heiter: 2, schelmisch: 2, nachdenklich: 1, muede: 1, genervt: .5 };
        return { muede: 2, nachdenklich: 2, schelmisch: 2, entspannt: 1.5, heiter: 1, genervt: .4 };
    }
    function roll() {
        var w = baseWeights(new Date().getHours()), ks = Object.keys(w), sum = 0;
        if (st && w[st.id]) w[st.id] *= .3;   // nicht dieselbe Laune gleich noch einmal
        ks.forEach(function (k) { sum += w[k]; });
        var r = Math.random() * sum, id = ks[0];
        for (var i = 0; i < ks.length; i++) { r -= w[ks[i]]; if (r <= 0) { id = ks[i]; break; } }
        setMood(id, 40 + Math.random() * 50, 'zeit');
    }
    function setMood(id, minuten, why) {
        if (!MOODS[id]) return;
        var alt = st && st.id;
        st = { id: id, until: Date.now() + minuten * 60000, why: why || '' };
        save();
        if (alt !== id) faceNow();
    }
    function ensure() { if (!st || st.until <= Date.now()) roll(); return st; }

    /* ---------- Ernste Themen ---------- */
    var seriousAt = 0, seriousNow = false;
    function markSerious(text) {
        var s = false;
        try { s = typeof window.jvIsSerious === 'function' && !!window.jvIsSerious(text); } catch (e) {}
        seriousNow = s; seriousAt = Date.now();
    }
    function isSerious() { return seriousNow && Date.now() - seriousAt < 90000; }

    /* ---------- Ereignisse aus dem, was du sagst ---------- */
    var STRESS = /\b(gestresst|stress|überfordert|erschöpft|am ende|fertig mit den nerven|traurig|einsam|schlecht drauf|schlechte laune|mir gehts (?:nicht gut|schlecht|mies)|mir geht es (?:nicht gut|schlecht|mies)|bin kaputt|ich kann nicht mehr|sorgen)\b/;
    var INSULT = /\b(?:halt (?:die )?(?:klappe|fresse|schnauze)|du idiot|du nervst|nutzloses ding|du bist (?:so )?(?:dumm|blöd|doof|nutzlos|schrott|scheiße|müll|der letzte)|scheiß (?:app|ding|kiste)|blöde (?:kiste|app))\b/;
    var PRAISE = /\b(danke|dankeschön|vielen dank|super|klasse|toll|prima|perfekt|großartig|genial|bravo|gut gemacht|du bist (?:der |die )?(?:beste|klasse|super|genial|top))\b/;
    var recent = [];   // { t, zeit }
    function norm(t) { return String(t || '').toLowerCase().replace(/['’]/g, '').replace(/[.,!?;:"„“”]/g, ' ').replace(/\s+/g, ' ').trim(); }

    function beobachten(text) {
        var t = norm(text); if (!t) return;
        var now = Date.now();
        markSerious(t);
        lsSet(KEY_LAST, String(now));
        if (!an()) return;
        ensure();
        if (STRESS.test(t)) { setMood('einfuehlsam', 30, 'stress'); return; }
        if (st.id === 'einfuehlsam' && st.until > now) return;   // sanft bleiben, nichts überschreibt das
        if (INSULT.test(t) && !isSerious()) { setMood('beleidigt', 15, 'beleidigt'); return; }
        recent.push({ t: t, zeit: now }); recent = recent.filter(function (r) { return now - r.zeit < 240000; });
        if (t.length > 6 && recent.filter(function (r) { return r.t === t; }).length >= 3 && !isSerious()) { setMood('genervt', 10, 'wiederholt'); return; }
        if (PRAISE.test(t) && Math.random() < .7 && !(st.id === 'beleidigt' && st.until > now && st.why === 'beleidigt')) {
            setMood(Math.random() < .5 ? 'munter' : 'heiter', 20, 'lob');
        }
    }

    /* ---------- Abwesenheit: beim Start einmal prüfen ---------- */
    (function startCheck() {
        load();
        var last = Number(lsGet(KEY_LAST) || 0), gap = last ? Date.now() - last : 0;
        if (an() && gap > 6 * 3600000) {
            var r = Math.random();
            if (r < .3) setMood('beleidigt', 10, 'abwesend');
            else if (r < .65) setMood(Math.random() < .5 ? 'munter' : 'heiter', 25, 'wiedersehen');
        }
    })();

    /* ---------- Einhaken: getMood (charakter.js) liefert die Laune, wenn keine von Hand gewählt ist ---------- */
    function autoMood() {
        if (!an()) return null;
        var m = MOODS[ensure().id];
        if (isSerious() && m.neg) return null;                 // ernst: nie genervt oder beleidigt
        if (isSerious() && !m.serious) return null;            // ernst: normaler, sachlicher Ton statt Spaß
        return { name: m.name, style: m.style, tag: m.tag, first: m.first, say: '' };
    }
    function hook() {
        if (typeof window.getMood !== 'function' || window.getMood.__laune) return !!(window.getMood && window.getMood.__laune);
        var orig = window.getMood;
        var neu = function () { var m = orig.apply(this, arguments); return m || autoMood(); };
        neu.__laune = true;
        window.getMood = neu;
        return true;
    }
    var tries = 0; (function h() { if (!hook() && tries++ < 40) setTimeout(h, 500); })();

    /* ---------- Gesicht im Leerlauf ---------- */
    var lastFace = '';
    function faceNow() { setTimeout(faceTick, 300); }
    function faceTick() {
        try {
            var av = window.jvAvatar3D; if (!an() || !av || !av.ready || av.state !== 'idle' || av.busy) return;
            var m = MOODS[ensure().id], pick = m.faces[Math.floor(Math.random() * m.faces.length)];
            if (pick === lastFace && m.faces.length > 1) pick = m.faces[(m.faces.indexOf(pick) + 1) % m.faces.length];
            lastFace = pick;
            if (typeof av.setExpression === 'function') av.setExpression(pick);
        } catch (e) {}
    }
    setInterval(faceTick, 14000);

    /* ---------- Sprache ---------- */
    function say(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    function adr() { try { return typeof charAddress === 'function' ? charAddress() : 'Sir'; } catch (e) { return 'Sir'; } }
    var FRAGE = /^(?:wie geht(?:s| es) (?:dir|ihnen)(?: heute| gerade| so| denn)?|wie (?:ist|ist denn) (?:deine|die) (?:laune|stimmung)(?: heute| gerade)?|wie fühlst du dich(?: heute| gerade)?|bist du gut drauf|alles gut bei dir|alles klar bei dir|wie bist du drauf|welche laune hast du(?: heute| gerade)?|was ist los mit dir|wie läufts bei dir)$/;
    function befehl(text, next) {
        var t = norm(text).replace(/^(?:hey |hallo |ok |okay )?(?:nova |zane |jarvis )?/, '').replace(/ (?:nova|zane|jarvis)$/, '');
        if (/^(?:keine launen mehr|laune aus|launen aus|hab keine launen|hab keine launen mehr|sei immer gleich|keine stimmungsschwankungen mehr)$/.test(t)) { lsSet(KEY_AUS, '1'); say('Gut, ' + adr() + '. Ab jetzt bin ich immer gleich. Langweilig, aber zuverlässig.'); return true; }
        if (/^(?:laune an|launen an|hab wieder launen|hab wieder laune|sei wieder launisch)$/.test(t)) { lsSet(KEY_AUS, '0'); roll(); say('Na endlich. Ich habe schon fast vergessen, wie sich das anfühlt.'); return true; }
        if (FRAGE.test(t)) {
            if (!an()) return next(text);
            var m = MOODS[ensure().id], z = m.sag[Math.floor(Math.random() * m.sag.length)];
            say(z.replace(/\{a\}/g, adr()));
            return true;
        }
        return next(text);
    }
    function register() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('laune', function (text, next) {
            try { beobachten(text); } catch (e) { console.warn('Laune:', e); }
            try { return befehl(text, next); } catch (e) { return next(text); }
        }, 3);
        return true;
    }
    var rt = 0; (function r() { if (!register() && rt++ < 40) setTimeout(r, 500); })();

    /* Die Auswahlliste "Stimmung" in den Einstellungen ist nicht mehr nötig: Nova wechselt seine Laune selbst */
    (function ausblenden() {
        function go() { try { var s = document.getElementById('moodSelect'); if (s && s.parentElement) s.parentElement.style.display = 'none'; } catch (e) {} }
        go(); var n = 0, iv = setInterval(function () { go(); if (++n > 20) clearInterval(iv); }, 1000);
    })();

    window.jvLaune = { aktuell: function () { return ensure().id; }, setzen: function (id, min) { setMood(id, min || 30, 'test'); }, moods: Object.keys(MOODS) };
})();
