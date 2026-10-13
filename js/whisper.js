/* ============================================================
   WHISPER-SPRACHERKENNUNG (Groq): Statt der Handy-Erkennung nimmt die App deine Stimme kurz auf und lässt sie von Whisper in Text umwandeln.
   Das versteht Straßennamen, Eigennamen und Dialekt deutlich besser ("Neu-Galliner-Ring", "Hamiyet", "Schroeter").
   Einschalten: Einstellungen > Spracherkennung > "Whisper (Groq)". Gilt nur für dieses Gerät. Standard bleibt die Handy-Erkennung.
   Gilt für: Mikrofon antippen, Weiterhören nach einer Antwort, Dolmetscher. NICHT für das Weckwort "Hey Jarvis" (das bleibt bei der Handy-Erkennung,
   weil es dauerhaft mithört).
   Ablauf: Mikrofon auf, Aufnahme läuft, sobald du eine Pause machst (ca. 1,2 Sekunden Stille), geht die Aufnahme über /api/groq an Whisper,
   der Text läuft danach genauso weiter wie bisher (Hör-Korrektur, Befehle, KI).
   Sicherheitsnetz: Geht das Mikrofon nicht auf, nimmt die App für diese Runde die Handy-Erkennung. Klappt Whisper zweimal hintereinander nicht,
   schaltet sich die App bis zum nächsten Neustart auf die Handy-Erkennung zurück und sagt es.
   Braucht: voice.js (startListening, recognition, isRecording ...), storage.js (apiFetch). Nach voice.js, hoerkorrektur.js und hoeren.js laden.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'whisper_mode';
    const SILENCE_MS = 1200;        // so lange Stille nach dem Sprechen beendet die Aufnahme
    const MAX_MS = 22000;           // längste Aufnahme
    const MANUAL_WAIT_MS = 7000;    // so lange wartet er nach dem Antippen auf den Sprechbeginn
    const MIN_SPEECH_MS = 250;      // kürzere Geräusche zählen nicht als Sprache
    const BASE_PROMPT = 'Jarvis, Alyssa, Hamiyet, Schwarzenbek, Verbrüderungsring, Neu-Galliner-Ring, Schroeter, Penny, Rewe, Edeka, HVV, Kia Sportage, Einkaufsliste, Tankstelle, Lagebild, Erinnerung, Dolmetscher.';
    const HALLUZINATION = /^(?:untertitel\b|untertitelung\b|amara\.org|vielen dank(?: fürs| für das)? (?:zuschauen|zuhören)|danke fürs (?:zuschauen|zuhören)|bis zum nächsten mal|tschüss\.?$|\.+$|ja\.$)/i;

    let rec = null;
    try { rec = (typeof recognition !== 'undefined') ? recognition : null; } catch (e) { rec = null; }
    if (!rec || rec._jvWhisper) return;
    if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) || typeof MediaRecorder === 'undefined') return;
    rec._jvWhisper = true;

    let session = null;     // laufende Aufnahme
    let starting = null;    // Mikrofon wird gerade geöffnet: { cancel }
    let failCount = 0;      // Whisper-Fehler in Folge
    let broken = false;     // bis zum Neustart abgeschaltet

    function isOn() {
        try { return !broken && getPersistentData(KEY, '0') === '1'; } catch (e) { return false; }
    }
    function setOn(on) {
        try { setPersistentData(KEY, on ? '1' : '0'); } catch (e) {}
        broken = false; failCount = 0;
    }

    function pickMime() {
        const list = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
        for (const m of list) { try { if (MediaRecorder.isTypeSupported(m)) return m; } catch (e) {} }
        return '';
    }

    /* Hilfswörter für Whisper: Grundliste plus die richtigen Schreibweisen aus der Hör-Korrektur */
    function promptText() {
        let extra = [];
        try {
            const map = JSON.parse(localStorage.getItem('jv_hoerkorrektur') || '{}');
            extra = Object.keys(map).map(k => { const e = map[k]; return (e && typeof e === 'object') ? e.r : e; }).filter(v => v && String(v).length < 30).slice(0, 25);
        } catch (e) {}
        return (BASE_PROMPT + ' ' + extra.join(', ')).slice(0, 600);
    }

    function languageCode() {
        try {
            if (typeof interpreter !== 'undefined' && interpreter && interpreter.turn === 'foreign' && interpreter.lang && interpreter.lang.code) return interpreter.lang.code.slice(0, 2).toLowerCase();
        } catch (e) {}
        return 'de';
    }

    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
            fr.onerror = () => reject(fr.error || new Error('Aufnahme nicht lesbar'));
            fr.readAsDataURL(blob);
        });
    }

    async function transcribe(blob, mime) {
        const audio = await blobToBase64(blob);
        const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
        const timer = setTimeout(() => { try { ctrl && ctrl.abort(); } catch (e) {} }, 25000);
        try {
            const res = await apiFetch('/api/groq', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ stt: true, audio, mime, language: languageCode(), prompt: promptText() }),
                signal: ctrl ? ctrl.signal : undefined
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok) throw new Error(String((data && data.error) || ('Status ' + res.status)).slice(0, 200));
            return String(data.text || '').trim();
        } finally { clearTimeout(timer); }
    }

    function showProblem(msg) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards([{ icon: '⚠️', title: 'Whisper-Spracherkennung: Fehler', subtitle: String(msg || '').slice(0, 220) }]);
        } catch (e) {}
    }

    /* Aufnahme sauber beenden (Mikrofon freigeben) */
    function cleanup(s) {
        try { if (s.timer) clearInterval(s.timer); } catch (e) {}
        try { if (s.stream) s.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        try { if (s.ctx && s.ctx.state !== 'closed') s.ctx.close(); } catch (e) {}
        try { if (typeof jvHearing === 'function') jvHearing(false); } catch (e) {}
    }

    /* Ergebnis in den normalen Ablauf einspeisen: genau wie die Handy-Erkennung (onresult, danach onend) */
    function deliver(text) {
        try { rec.onresult({ resultIndex: 0, results: [[{ transcript: text, confidence: 1 }]] }); } catch (e) { console.error('Whisper-Ergebnis', e); }
        try { rec.onend(); } catch (e) {}
    }
    function deliverNothing() {
        try { rec.onerror({ error: 'no-speech' }); } catch (e) {}
        try { rec.onend(); } catch (e) {}
    }

    async function whisperListen(followUp, windowMs, origStart) {
        if (typeof interpreter !== 'undefined' && interpreter && !followUp) interpreter.turn = 'de';
        isFollowUp = followUp;
        clearFollowUpTimer();
        isRecording = true;            // sofort belegen, damit ein zweiter Start nicht dazwischenfunkt
        starting = { cancel: false };
        const startToken = starting;
        setListeningUi(followUp);

        const giveBack = () => { isRecording = false; try { jvListenIndicator(false); } catch (e) {} isFollowUp = false; };

        let stream;
        try {
            stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 } });
        } catch (e) {
            console.error('Whisper: Mikrofon', e && e.name);
            if (starting === startToken) starting = null;
            giveBack();
            return origStart(followUp, windowMs);   // Sicherheitsnetz: Handy-Erkennung für diese Runde
        }
        if (starting === startToken) starting = null;
        if (startToken.cancel) {   // in der Zwischenzeit abgebrochen (Mikrofon-Taste oder Jarvis spricht)
            try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
            giveBack();
            try { rec.onend(); } catch (e) {}
            return;
        }

        const mime = pickMime();
        let recorder;
        try { recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream); }
        catch (e) { stream.getTracks().forEach(t => t.stop()); giveBack(); return origStart(followUp, windowMs); }

        const s = { stream, recorder, chunks: [], ctx: null, timer: null, started: Date.now(), speechAt: 0, lastSpeech: 0, speechMs: 0, mode: null, mime: recorder.mimeType || mime || 'audio/webm' };
        session = s;

        recorder.ondataavailable = ev => { if (ev.data && ev.data.size) s.chunks.push(ev.data); };
        recorder.onstop = async () => {
            cleanup(s);
            if (session === s) session = null;
            if (s.mode === 'abort') { isRecording = false; try { rec.onend(); } catch (e) {} return; }
            if (!s.speechAt || s.speechMs < MIN_SPEECH_MS) { deliverNothing(); return; }
            try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Verstehe...'); } catch (e) {}
            try {
                const blob = new Blob(s.chunks, { type: s.mime });
                const text = await transcribe(blob, s.mime);
                failCount = 0;
                if (!text || HALLUZINATION.test(text.trim())) { deliverNothing(); return; }
                deliver(text);
            } catch (e) {
                console.error('Whisper-Fehler:', e && e.message);
                failCount++;
                showProblem(e && e.message);
                if (failCount >= 2) {
                    broken = true;
                    isRecording = false;
                    try { rec.onend(); } catch (e2) {}
                    try { speak('Die Whisper-Erkennung klappt gerade nicht. Ich nehme bis zum Neustart wieder die Handy-Erkennung.'); } catch (e2) {}
                } else {
                    isRecording = false;
                    try { rec.onend(); } catch (e2) {}
                    try { speak('Das habe ich nicht verstanden. Bitte noch einmal.'); } catch (e2) {}
                }
            }
        };

        // Lautstärke beobachten: Sprechbeginn und Pause erkennen
        try {
            const AC = window.AudioContext || window.webkitAudioContext;
            s.ctx = new AC();
            const src = s.ctx.createMediaStreamSource(stream);
            const an = s.ctx.createAnalyser();
            an.fftSize = 1024;
            src.connect(an);
            const buf = new Uint8Array(an.fftSize);
            let floor = 0.01;
            s.timer = setInterval(() => {
                const now = Date.now();
                an.getByteTimeDomainData(buf);
                let sum = 0;
                for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
                const rms = Math.sqrt(sum / buf.length);
                const loud = rms > Math.max(0.022, floor * 3);
                if (!loud) floor = floor * 0.95 + rms * 0.05;   // Grundrauschen (Auto, Motor) lernen
                if (loud) {
                    if (!s.speechAt) s.speechAt = now;
                    s.lastSpeech = now;
                    s.speechMs += 50;
                    try { jvHearing(true); } catch (e) {}
                } else { try { jvHearing(false); } catch (e) {} }
                const total = now - s.started;
                const waitMs = followUp ? Math.min(windowMs || 15000, 15000) : MANUAL_WAIT_MS;
                if (s.speechAt && now - s.lastSpeech > SILENCE_MS && s.speechMs >= MIN_SPEECH_MS) finish(s, 'send');
                else if (!s.speechAt && total > waitMs) finish(s, 'send');   // nichts gesagt: endet als "nichts verstanden"
                else if (total > MAX_MS) finish(s, 'send');
            }, 50);
        } catch (e) {
            // Ohne Lautstärke-Messung geht es nicht: Aufnahme verwerfen und Handy-Erkennung nehmen
            finish(s, 'abort');
            isFollowUp = false;
            setTimeout(() => origStart(followUp, windowMs), 50);
            return;
        }

        try { recorder.start(250); } catch (e) { finish(s, 'abort'); isFollowUp = false; setTimeout(() => origStart(followUp, windowMs), 50); }
    }

    function finish(s, mode) {
        if (!s || s.mode) return;
        s.mode = mode;
        try { if (s.timer) { clearInterval(s.timer); s.timer = null; } } catch (e) {}
        try { if (s.recorder.state !== 'inactive') s.recorder.stop(); else s.recorder.onstop && s.recorder.onstop(); } catch (e) { cleanup(s); }
    }

    // startListening ersetzen: bei eingeschaltetem Whisper die eigene Aufnahme, sonst unverändert
    const origStart = window.startListening;
    if (typeof origStart !== 'function') return;
    window.startListening = function (followUp = false, windowMs) {
        if (!isOn() || wakeWordListening || session) return origStart.apply(this, arguments);
        if (!recognition || isRecording) return;
        const w = windowMs === undefined ? (typeof FOLLOW_UP_WINDOW_MS !== 'undefined' ? FOLLOW_UP_WINDOW_MS : 8000) : windowMs;
        return whisperListen(followUp, w, origStart);
    };

    // stop() = fertig gesprochen (Mikrofon-Taste), abort() = verwerfen (z.B. weil Jarvis jetzt spricht)
    const origStop = rec.stop.bind(rec);
    const origAbort = rec.abort.bind(rec);
    rec.stop = function () {
        if (session) { finish(session, 'send'); return; }
        if (starting) { starting.cancel = true; return; }
        return origStop();
    };
    rec.abort = function () {
        if (session) {
            finish(session, 'abort');
            isRecording = false;   // gleich freigeben, damit die Sprachausgabe nicht auf das Ende der Aufnahme warten muss
            try { jvListenIndicator(false); } catch (e) {}
            return;
        }
        if (starting) { starting.cancel = true; isRecording = false; return; }
        return origAbort();
    };

    /* ---------- Einstellung ---------- */
    function injectSettings() {
        try {
            if (document.getElementById('whisperSelect')) return;
            const sums = document.querySelectorAll('details > summary');
            let anchor = null;
            sums.forEach(sm => { if (!anchor && /Effekte/.test(sm.textContent || '')) anchor = sm.parentElement; });
            if (!anchor) return;
            const box = document.createElement('details');
            box.className = anchor.className;
            box.innerHTML = '<summary class="p-4 font-bold text-slate-200 cursor-pointer bg-black/40 flex justify-between items-center border-b border-[rgba(93,209,255,.18)]"><span>🎙️ Spracherkennung</span></summary>' +
                '<div class="p-4 space-y-3">' +
                '<label class="block text-xs font-bold text-[#49d7ff] mb-1 uppercase">Erkennung:</label>' +
                '<select id="whisperSelect" class="w-full p-2.5 bg-black border border-[rgba(93,209,255,.2)] rounded-lg text-sm text-slate-100 focus:outline-none focus:border-[#49d7ff]">' +
                '<option value="0">Handy (wie bisher)</option>' +
                '<option value="1">Whisper (Groq) - versteht Namen und Straßen besser</option>' +
                '</select>' +
                '<p class="text-xs text-[#5d7e91]">Whisper nimmt dich kurz auf und schickt die Aufnahme zur Auswertung an Groq. Es wartet, bis du eine kleine Pause machst. Das Weckwort „Hey Jarvis“ bleibt bei der Handy-Erkennung. Gilt nur für dieses Gerät.</p>' +
                '</div>';
            anchor.insertAdjacentElement('beforebegin', box);
            const sel = box.querySelector('#whisperSelect');
            sel.value = getPersistentData(KEY, '0') === '1' ? '1' : '0';
            sel.addEventListener('change', () => { setOn(sel.value === '1'); });
        } catch (e) { /* ohne die Auswahl läuft alles wie bisher */ }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectSettings); else injectSettings();
    setTimeout(injectSettings, 1500);

    window.jvWhisper = { isOn, setOn };
})();
