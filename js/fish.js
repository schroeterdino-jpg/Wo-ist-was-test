/* ============================================================
   FISH AUDIO ALS HAUPTSTIMME: ergänzt die Sprachausgabe aus voice.js um die Stimme "Fish Audio", ohne voice.js zu verändern.
   - Einstellungen > Stimme & Gespräch > Sprachausgabe: neue Auswahl "Fish Audio" (steht oben), dazu Eingabe der Stimmen-ID und "Fish-Stimme testen".
   - Einmalige Umstellung: Beim ersten Start mit dieser Datei wird Fish Audio auf diesem Gerät zur Hauptstimme. Jederzeit änderbar.
   - Rückfallkette (auf dem Server, api/stau.js): Fish Audio -> OpenAI -> Edge-TTS; die Handy-Stimme bleibt der letzte Rückfall in voice.js.
   - Menschliche Laute (Seufzen, Einatmen, Räuspern, Lachen, Pausen): siehe unten bei humanize(). Stufe in den Einstellungen oder per Sprache. Bei allen anderen Stimmen
     wird nichts davon gesprochen oder angezeigt.
   - Der Schlüssel steht nur auf dem Server (Vercel: FISH_AUDIO_API_KEY; optional FISH_AUDIO_VOICE_ID und FISH_AUDIO_MODEL), nie im Browser.
   Lange Texte (Briefing): Das Sprechen startet nach dem ersten kurzen Stück, die weiteren folgen nahtlos (siehe startQueue).
   Muss nach voice.js geladen werden. Fehlt die Datei, läuft alles wie vorher.
   ============================================================ */
(function () {
    if (typeof window.getTtsEngine !== 'function' || typeof window.fetchCloudSpeechBlob !== 'function') return;

    function store(key, def) {
        try { return typeof getPersistentData === 'function' ? String(getPersistentData(key, def)) : (localStorage.getItem(key) || def); } catch (e) { return def; }
    }
    function put(key, val) {
        try { if (typeof setPersistentData === 'function') setPersistentData(key, val); else localStorage.setItem(key, val); } catch (e) {}
    }

    // Einmalig: Fish Audio zur Hauptstimme machen (danach zählt, was du in den Einstellungen wählst)
    try {
        if (localStorage.getItem('jv_fish_init') !== '1') {
            localStorage.setItem('jv_fish_init', '1');
            put('tts_engine', 'fish');
        }
    } catch (e) {}

    const VALID = ['browser', 'edge', 'openai', 'fish'];
    window.getTtsEngine = function () {
        const v = store('tts_engine', 'fish');
        return VALID.indexOf(v) !== -1 ? v : 'fish';
    };
    window.setTtsEngine = function (val) {
        put('tts_engine', (val === 'browser' || val === 'edge' || val === 'fish') ? val : 'openai');
    };
    window.getFishVoice = function () { return store('tts_fish_voice', '').replace(/[^a-zA-Z0-9_-]/g, ''); };
    window.setFishVoice = function (val) { put('tts_fish_voice', String(val || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)); };

    // ---------- Menschliche Laute (nur Fish Audio) ----------
    // Fish Audio versteht Anweisungen in eckigen Klammern. Hier werden sie vor dem Senden in den Text gesetzt, nie in der Anzeige und nie bei anderen Stimmen:
    //  [sigh] Seufzen: bei Stau und Unangenehmem (Stau, lange Fahrt, Sprit, Bahn) und manchmal bei "Einen Moment ...", dazu mal ein "Hmm."
    //  [inhale] tiefes Einatmen vor langen Antworten, [clearing throat] Räuspern nach längerer Pause
    //  vor dem Spruch (sprueche.js setzt dort ein unsichtbares Zeichen): [laughing] / [chuckle] Lachen, oder [short pause] Pause vor der Pointe
    // Nie bei ernsten Themen (Warnungen, Fehler, Erinnerungen, Gesundheit, E-Mails, Geld ...) und höchstens je ein Laut am Anfang und einer vor dem Spruch.
    // Stufe: aus / dezent (halb so oft) / mittel (Standard). Einstellungen > Stimme, oder per Sprache "Menschliche Laute aus / dezent / an".
    const MARK = '\u2063';
    const MARK_RE = new RegExp(MARK, 'g');
    const strip = (t) => String(t == null ? '' : t).replace(MARK_RE, '');
    const LEVELS = ['aus', 'dezent', 'mittel'];
    window.getHumanLevel = function () { const v = store('jv_human', 'mittel'); return LEVELS.indexOf(v) !== -1 ? v : 'mittel'; };
    window.setHumanLevel = function (v) { put('jv_human', LEVELS.indexOf(v) !== -1 ? v : 'mittel'); };
    window.getChuckle = function () { return window.getHumanLevel() !== 'aus'; };               // alte Namen, falls andere Dateien sie benutzen
    window.setChuckle = function (on) { window.setHumanLevel(on ? 'mittel' : 'aus'); };

    let lastFishAt = 0;
    const THINKING = /^(?:einen moment|moment|ich schaue|ich sehe|ich prüfe|ich suche|ich frage|sofort|gleich|mal sehen|ich rechne|ich lade)/i;
    const SIGH_CATS = { stau_viel: 0.6, stau_lang: 0.7, fahrt_lang: 0.3, sprit: 0.3, bahn: 0.2 };

    function humanize(text) {
        const level = window.getHumanLevel();
        const force = window.__jvForceHuman === true;
        window.__jvForceHuman = false;
        if (level === 'aus') return strip(text);
        const f = force ? 1000 : (level === 'dezent' ? 0.5 : 1);      // Faktor auf alle Wahrscheinlichkeiten
        const roll = (p) => force || Math.random() < p * f;
        const idx = String(text).indexOf(MARK);
        const pre = idx === -1 ? String(text) : String(text).slice(0, idx);
        const quip = idx === -1 ? '' : strip(String(text).slice(idx + 1));
        const serious = typeof window.jvIsSerious === 'function' && window.jvIsSerious(pre + ' ' + quip);
        const now = Date.now();
        const idle = lastFishAt && now - lastFishAt > 15 * 60000;
        lastFishAt = now;
        let start = '';
        let out = strip(pre);
        if (!serious) {
            const cat = typeof window.jvClassify === 'function' ? (window.jvClassify(pre) || {}).cat : null;
            const plainLen = out.replace(/\s+/g, ' ').length;
            if (idle && roll(0.6)) start = '[clearing throat] ';
            else if (cat && SIGH_CATS[cat] && roll(SIGH_CATS[cat])) start = '[sigh] ';
            else if (plainLen <= 70 && THINKING.test(out.trim())) { if (roll(0.3)) start = '[sigh] '; else if (roll(0.2)) start = 'Hmm. '; }
            else if (plainLen > 180 && roll(0.5)) start = '[inhale] ';
        }
        let mid = '';
        if (quip && !serious && (force || Math.random() < (level === 'dezent' ? 0.45 : 0.85))) {
            const r = force ? 0.5 : Math.random();
            mid = r < 0.25 ? '[laughing] ' : r < 0.75 ? '[chuckle] ' : '[short pause] ';
        }
        if (!quip) return start + out;
        const sep = /[\s]$/.test(out) ? '' : ' ';
        return start + out + sep + mid + quip;
    }
    // Handy-Stimme (Browser): das Zeichen nie mit vorlesen lassen
    if (typeof window.speakBrowser === 'function' && !window.speakBrowser._jv) {
        const originalBrowser = window.speakBrowser;
        const wrappedBrowser = function () { const a = Array.prototype.slice.call(arguments); a[0] = strip(a[0]); return originalBrowser.apply(this, a); };
        wrappedBrowser._jv = true;
        window.speakBrowser = wrappedBrowser;
    }

    // ---------- Abruf vom Server ----------
    // Kurze Texte: eine Anfrage (der Server weicht bei Problemen selbst auf OpenAI/Edge aus).
    // Lange Texte (Briefing!): Das Sprechen beginnt nach dem ERSTEN kurzen Stück (ein bis zwei Sätze, ca. 1-3 Sekunden). Die weiteren Stücke holt die App
    // nacheinander im Hintergrund und hängt sie nahtlos an, noch während das erste läuft (ein Stück Sprache dauert beim Abspielen viel länger als beim Erzeugen).
    // Nacheinander statt gleichzeitig, damit Fish Audio nicht wegen zu vieler Anfragen ablehnt. Alle Stücke bekommen dieselbe Fish-Stimme; hakt ein späteres Stück
    // auch nach zwei Versuchen, wird der RESTTEXT einmal über die normale Kette (OpenAI/Edge) gesprochen, damit nichts fehlt.
    const CHUNK_MAX = 280, SINGLE_MAX = 320, FIRST_MIN = 60, FIRST_MAX = 170;

    function sentencesOf(text) {
        const t = String(text).replace(/\s+/g, ' ').trim();
        const out = [];
        t.split(/(?<=[.!?…])\s+/).forEach(sn => {
            let rest = sn;
            while (rest.length > CHUNK_MAX) {                     // sehr langer Satz: an Kommas oder Leerzeichen teilen
                let cut = rest.lastIndexOf(', ', CHUNK_MAX);
                if (cut < 80) cut = rest.lastIndexOf(' ', CHUNK_MAX);
                if (cut < 40) cut = CHUNK_MAX;
                out.push(rest.slice(0, cut + 1).trim());
                rest = rest.slice(cut + 1).trim();
            }
            if (rest) out.push(rest);
        });
        return out;
    }

    /* Teilt in ein kurzes erstes Stück (schneller Start) und danach Stücke bis ~280 Zeichen. Tags bleiben bei ihrem Satz. */
    function splitForFish(text) {
        const t = String(text).replace(/\s+/g, ' ').trim();
        if (t.length <= SINGLE_MAX) return [t];
        const sentences = sentencesOf(t);
        const chunks = [];
        let cur = '', first = true;
        const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; first = false; };
        sentences.forEach(sn => {
            const limit = first ? FIRST_MAX : CHUNK_MAX;
            if (first && cur && cur.length >= FIRST_MIN) push();
            if (!cur) cur = sn;
            else if ((cur + ' ' + sn).length > limit) { push(); cur = sn; }
            else cur = cur + ' ' + sn;
            if (first && cur.length >= FIRST_MIN) push();
        });
        push();
        return chunks;
    }

    function setLastVoice(engine, ms, chars, parts) {
        window.jvLastVoice = { engine, ms, chars, parts, at: Date.now() };
        try {
            const el = document.getElementById('fishLastVoice');
            if (el) {
                const name = { fish: 'Fish Audio', openai: 'OpenAI', edge: 'Edge', gemischt: 'gemischt' }[engine] || engine;
                el.textContent = `Zuletzt gesprochen mit: ${name} (${chars} Zeichen${parts > 1 ? ', ' + parts + ' Stücke' : ''}, ${(ms / 1000).toFixed(1)} s bis zum Start)`;
                el.style.color = engine === 'fish' ? '#7fe3b0' : '#ffb870';
            }
        } catch (e) {}
    }

    async function requestOne(text, voice, opts) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeout);
        try {
            const oaVoice = typeof getOpenaiVoice === 'function' ? getOpenaiVoice() : 'alloy';
            const url = `/api/stau?tts=1&text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&engine=fish&fishVoice=${encodeURIComponent(window.getFishVoice())}&openaiVoice=${encodeURIComponent(oaVoice)}${opts.fishOnly ? '&fishOnly=1' : ''}`;
            const res = await apiFetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) return null;
            const blob = await res.blob();
            if (!blob || blob.size === 0) return null;
            return { blob, engine: (res.headers && res.headers.get && res.headers.get('x-voice-engine')) || 'fish' };
        } catch (e) {
            clearTimeout(timer);
            return null;
        }
    }

    // Warteschlange der Folge-Stücke: parts[i] ist ein Versprechen auf den Ton von Stück i (oder null, wenn übersprungen)
    function startQueue(chunks, voice, firstEngine) {
        const parts = chunks.map(() => { let res; const p = new Promise(r => { res = r; }); return { p, res }; });
        (async () => {
            for (let i = 0; i < chunks.length; i++) {
                let r = null;
                if (firstEngine === 'fish') {
                    r = await requestOne(chunks[i], voice, { timeout: 12000, fishOnly: true });
                    if (!r) r = await requestOne(chunks[i], voice, { timeout: 12000, fishOnly: true });
                }
                if (!r) {                                   // Rest in einem Stück über die normale Kette
                    const remaining = chunks.slice(i).join(' ');
                    const rr = await requestOne(remaining.length > 2300 ? remaining.slice(0, 2300) : remaining, voice, { timeout: 20000 });
                    parts[i].res(rr ? rr.blob : null);
                    for (let k = i + 1; k < chunks.length; k++) parts[k].res(null);
                    return;
                }
                parts[i].res(r.blob);
            }
        })();
        let idx = 0;
        return { next: async () => { while (idx < parts.length) { const b = await parts[idx++].p; if (b) return b; } return null; } };
    }

    // Abspielen: voice.js spielt das erste Stück ab; endet es, kommt das nächste. voice.js bekommt erst Bescheid, wenn alle Stücke gespielt sind.
    const queues = {};
    try {
        const origCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = function (obj) { const u = origCreate(obj); try { if (obj && obj.__jvQ) queues[u] = obj.__jvQ; } catch (e) {} return u; };
        const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
        if (proto && !proto._jvChainPatched) {
            const prevPlay = proto.play;
            proto.play = function () {
                try {
                    const q = queues[this.src];
                    if (q && !this.__jvChained) { this.__jvChained = true; delete queues[this.src]; chainPlayback(this, q); }
                } catch (e) {}
                return prevPlay.apply(this, arguments);
            };
            proto._jvChainPatched = true;
        }
    } catch (e) {}

    function chainPlayback(el, q) {
        const origEnded = el.onended;
        const urls = [];
        el.onended = async function (ev) {
            try {
                const blob = await q.next();
                if (blob) {
                    const u = URL.createObjectURL(blob);
                    urls.push(u);
                    el.src = u;
                    await el.play();
                    return;
                }
            } catch (e) { /* bei einem Problem: so tun, als wäre alles gespielt */ }
            urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
            if (typeof origEnded === 'function') origEnded.call(el, ev);
        };
    }

    const originalFetch = window.fetchCloudSpeechBlob;
    window.fetchCloudSpeechBlob = async function (text, voice) {
        if (window.getTtsEngine() !== 'fish') return originalFetch.call(this, strip(text), voice);
        if (typeof AbortController === 'undefined') return null;
        const started = Date.now();
        const full = humanize(text);
        const chunks = splitForFish(full);

        // Erstes (oder einziges) Stück: normale Kette, der Server weicht bei Problemen selbst aus
        const r = await requestOne(chunks[0], voice, { timeout: 10000 });
        if (!r) return null;
        setLastVoice(r.engine, Date.now() - started, full.length, chunks.length);
        if (chunks.length > 1) {
            // Kam das erste Stück nicht von Fish Audio, wird der Rest einheitlich über dieselbe Ersatzkette geholt
            const restChunks = r.engine === 'fish' ? chunks.slice(1) : [chunks.slice(1).join(' ')];
            try { r.blob.__jvQ = startQueue(restChunks, voice, r.engine); } catch (e) {}
        }
        return r.blob;
    };

    // Test: fragt den Server, ob Fish Audio antwortet, und spielt dann einen Satz
    window.runFishDiagnosis = async function () {
        const out = document.getElementById('fishDiagOutput');
        const show = (t) => { if (out) { out.textContent = t; out.classList.remove('hidden'); } };
        show('Prüfe Fish Audio ...');
        try {
            const url = `/api/stau?tts=1&engine=fish&diag=1&text=${encodeURIComponent('Test')}&fishVoice=${encodeURIComponent(window.getFishVoice())}`;
            const res = await apiFetch(url);
            const d = await res.json();
            if (d && d.ok && d.engineUsed === 'fish') {
                const noId = /keine Stimmen-ID/.test(String(d.voice || ''));
                show(`✅ Fish Audio antwortet (Modell ${d.model}, Stimme ${d.voice}).` + (noId ? '\n⚠️ Ohne feste Stimmen-ID kann die Stimme von Satz zu Satz wechseln. Trage oben eine ID von fish.audio ein.' : ''));
                if (typeof testVoice === 'function') testVoice();
            } else {
                show('❌ ' + ((d && d.error) || ('Antwort: ' + JSON.stringify(d))) + '\nJarvis spricht in dem Fall mit der nächsten Stimme (OpenAI oder Edge).');
            }
        } catch (e) {
            show('❌ Server nicht erreichbar: ' + String((e && e.message) || e));
        }
    };

    // Test: ein Satz mit sicherem Seufzer und Lachen (ohne Zufall)
    window.testChuckle = function () {
        window.__jvForceHuman = true;
        speak('Auf Ihrer Strecke gibt es einen Stau, mit etwa zwanzig Minuten Verzögerung. ' + MARK + 'Da würde ich nicht hinfahren.');
    };

    // Sprachbefehle: "Menschliche Laute aus / dezent / an", "Kichern aus", "Lach nicht mehr", "Du darfst wieder lachen"
    window.handleKichernCommand = function (text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 45) return false;
        const say = (m) => speak(m, typeof continueConversation === 'function' ? continueConversation : undefined);
        const word = '(?:kichern|lachen|seufzen|menschliche laute|laute)';
        if (new RegExp('^(?:jarvis )?' + word + ' (?:aus|ausschalten)$').test(t) || /^(?:jarvis )?(?:kicher|lach|seufz)\w*\s+(?:bitte\s+)?(?:nicht|nie|kein)(?:\s+mehr)?$/.test(t) || /^hör auf zu (?:kichern|lachen|seufzen)$/.test(t)) {
            window.setHumanLevel('aus'); syncUi(); say('In Ordnung, ich verzichte auf Lachen und Seufzen.'); return true;
        }
        if (new RegExp('^' + word + ' dezent$').test(t) || /^(?:etwas |bisschen |ein bisschen )?(?:weniger|seltener) (?:kichern|lachen|seufzen)$/.test(t)) {
            window.setHumanLevel('dezent'); syncUi(); say('Gut, ich halte mich zurück.'); return true;
        }
        if (new RegExp('^' + word + ' (?:an|ein|einschalten)$').test(t) || /^du darfst (?:wieder )?(?:kichern|lachen|seufzen)$/.test(t) || /^(?:kicher|lach|seufz)\s+(?:wieder|ruhig)$/.test(t)) {
            window.setHumanLevel('mittel'); syncUi(); say('Gern, ich bin wieder ein bisschen menschlicher.'); return true;
        }
        return false;
    };

    function syncUi() { try { const lvl = document.getElementById('humanLevelSelect'); if (lvl) lvl.value = window.getHumanLevel(); } catch (e) {} }

    // Einstellungen: Auswahl, Stimmen-ID
    function bindUi() {
        try {
            const sel = document.getElementById('ttsEngineSelect');
            const row = document.getElementById('fishVoiceRow');
            const input = document.getElementById('fishVoiceInput');
            const edgeRow = document.getElementById('edgeVoiceRow'), openaiRow = document.getElementById('openaiVoiceRow');
            const sync = () => {
                if (!sel) return;
                if (row) row.classList.toggle('hidden', sel.value !== 'fish');
                if (edgeRow) edgeRow.classList.toggle('hidden', sel.value !== 'edge' && sel.value !== 'fish');       // bei Fish: Rückfall-Stimmen
                if (openaiRow) openaiRow.classList.toggle('hidden', sel.value !== 'openai' && sel.value !== 'fish');
            };
            if (sel) {
                sel.value = window.getTtsEngine();
                sel.addEventListener('change', sync);
                sync();
            }
            const lvl = document.getElementById('humanLevelSelect');
            if (lvl) { lvl.value = window.getHumanLevel(); lvl.addEventListener('change', () => window.setHumanLevel(lvl.value)); }
            if (input) {
                input.value = window.getFishVoice();
                input.addEventListener('change', () => { window.setFishVoice(input.value); input.value = window.getFishVoice(); });
            }
        } catch (e) {}
    }
    bindUi();
})();
