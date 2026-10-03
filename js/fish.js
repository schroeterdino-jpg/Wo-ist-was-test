/* ============================================================
   FISH AUDIO ALS HAUPTSTIMME: ergänzt die Sprachausgabe aus voice.js um die Stimme "Fish Audio", ohne voice.js zu verändern.
   - Einstellungen > Stimme & Gespräch > Sprachausgabe: neue Auswahl "Fish Audio" (steht oben), dazu Eingabe der Stimmen-ID und "Fish-Stimme testen".
   - Einmalige Umstellung: Beim ersten Start mit dieser Datei wird Fish Audio auf diesem Gerät zur Hauptstimme. Jederzeit änderbar.
   - Rückfallkette (auf dem Server, api/stau.js): Fish Audio -> OpenAI -> Edge-TTS; die Handy-Stimme bleibt der letzte Rückfall in voice.js.
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

    // Holt die MP3 vom Server; für Fish Audio mit Stimmen-ID, sonst wie bisher (voice.js)
    const originalFetch = window.fetchCloudSpeechBlob;
    window.fetchCloudSpeechBlob = async function (text, voice) {
        if (window.getTtsEngine() !== 'fish') return originalFetch.apply(this, arguments);
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
            if (input) {
                input.value = window.getFishVoice();
                input.addEventListener('change', () => { window.setFishVoice(input.value); input.value = window.getFishVoice(); });
            }
        } catch (e) {}
    }
    bindUi();
})();
