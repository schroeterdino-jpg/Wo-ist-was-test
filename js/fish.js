/* ============================================================
   FISH AUDIO ALS HAUPTSTIMME: ergänzt die Sprachausgabe aus voice.js um die Stimme "Fish Audio", ohne voice.js zu verändern.
   - Einstellungen > Stimme & Gespräch > Sprachausgabe: neue Auswahl "Fish Audio" (steht oben), dazu Eingabe der Stimmen-ID und "Fish-Stimme testen".
   - Einmalige Umstellung: Beim ersten Start mit dieser Datei wird Fish Audio auf diesem Gerät zur Hauptstimme. Jederzeit änderbar.
   - Rückfallkette (auf dem Server, api/stau.js): Fish Audio -> OpenAI -> Edge-TTS; die Handy-Stimme bleibt der letzte Rückfall in voice.js.
   - Menschliche Laute (Seufzen, Einatmen, Räuspern, Lachen, Pausen): siehe unten bei humanize(). Stufe in den Einstellungen oder per Sprache. Bei allen anderen Stimmen
     wird nichts davon gesprochen oder angezeigt.
   - Der Schlüssel steht nur auf dem Server (Vercel: FISH_AUDIO_API_KEY; optional FISH_AUDIO_VOICE_ID und FISH_AUDIO_MODEL), nie im Browser.
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

    // Holt die MP3 vom Server; für Fish Audio mit Stimmen-ID, sonst wie bisher (voice.js)
    const originalFetch = window.fetchCloudSpeechBlob;
    window.fetchCloudSpeechBlob = async function (text, voice) {
        if (window.getTtsEngine() !== 'fish') return originalFetch.call(this, strip(text), voice);
        text = humanize(text);
        if (typeof AbortController === 'undefined') return null;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 10000);
        try {
            const oaVoice = typeof getOpenaiVoice === 'function' ? getOpenaiVoice() : 'alloy';
            const url = `/api/stau?tts=1&text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&engine=fish&fishVoice=${encodeURIComponent(window.getFishVoice())}&openaiVoice=${encodeURIComponent(oaVoice)}`;
            const res = await apiFetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) return null;
            const blob = await res.blob();
            return blob && blob.size > 0 ? blob : null;
        } catch (e) {
            clearTimeout(timer);
            return null;
        }
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
                show(`✅ Fish Audio antwortet (Modell ${d.model}, Stimme ${d.voice}).`);
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
                if (edgeRow) edgeRow.classList.toggle('hidden', sel.value !== 'edge');
                if (openaiRow) openaiRow.classList.toggle('hidden', sel.value !== 'openai');
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
