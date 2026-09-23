/* ============================================================
   VOICE: Stimme, Gesprächsmodus, Unterbrechen, Spracherkennung
   Braucht: ui.js, audio.js, storage.js
   ============================================================ */

let currentAudio = null;
let currentUtterance = null;
let ackActive = false;
let isProcessing = false;
let isFollowUp = false;
let followUpTimer = null;
let conversationMode = getPersistentData('conversation_mode', '1') === '1';
let selectedVoiceURI = getPersistentData('tts_voice_uri', '');
let availableVoices = [];
let wakeWordEnabled = getPersistentData('wake_word_enabled', '0') === '1';
let wakeWordListening = false;

const SPEECH_RATE = 1.0;
const SPEECH_PITCH = 0.92;
const FOLLOW_UP_WINDOW_MS = 9000;
const ACK_DELAY_MS = 1500;
const WAKE_WORD_REGEX = /\bhe?y?\s*jarvis\b/i;

function pickRandom(list) {
    return list[Math.floor(Math.random() * list.length)];
}

function isSpeaking() {
    return !!currentUtterance || currentAudio !== null;
}

function clearFollowUpTimer() {
    if (followUpTimer) { clearTimeout(followUpTimer); followUpTimer = null; }
}

function setIdleUi() {
    if (recordBtn) {
        recordBtn.classList.remove('recording');
        recordBtn.classList.remove('speaking');
    }
    const waveEl = document.getElementById('waveform');
    if (waveEl) waveEl.classList.remove('speaking');

    if (recordText) recordText.textContent = "J.A.R.V.I.S. / BEREIT";
    updateTerminalStream("SYS_IDLE: AWAITING_INPUT", "ONLINE");
    if (wakeWordEnabled) startWakeWordListening();
}

/* --- Stimmen-Auswahl --- */
function scoreVoice(v) {
    const n = (v.name || '').toLowerCase();
    let s = 0;
    if (/neural|natural|online|premium|enhanced|wavenet/.test(n)) s += 50;
    if (/google/.test(n)) s += 15;
    if (/markus|stefan|conrad|killian|jonas|yannick|florian|hans|klaus|\bmale\b|männlich/.test(n)) s += 30;
    if (/anna|petra|marlene|vicki|katja|amala|seraphina|female|weiblich/.test(n)) s -= 10;
    if ((v.lang || '').replace('_', '-') === 'de-DE') s += 10;
    if (v.localService) s += 2;
    return s;
}

function loadVoices() {
    if (!('speechSynthesis' in window)) return;
    availableVoices = window.speechSynthesis.getVoices().filter(v => /^de([-_]|$)/i.test(v.lang || ''));
    populateVoiceSelect();
}

function getBestVoice() {
    if (!availableVoices.length) return null;
    return [...availableVoices].sort((a, b) => scoreVoice(b) - scoreVoice(a))[0];
}

function getActiveVoice() {
    if (selectedVoiceURI) {
        const chosen = availableVoices.find(v => v.voiceURI === selectedVoiceURI);
        if (chosen) return chosen;
    }
    return getBestVoice();
}

function populateVoiceSelect() {
    const sel = document.getElementById('voiceSelect');
    if (!sel) return;
    sel.innerHTML = '';
    const best = getBestVoice();
    const autoOpt = document.createElement('option');
    autoOpt.value = '';
    autoOpt.textContent = best ? `Automatisch (${best.name})` : 'Automatisch';
    sel.appendChild(autoOpt);
    availableVoices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.voiceURI;
        opt.textContent = `${v.name} (${v.lang})`;
        sel.appendChild(opt);
    });
    sel.value = availableVoices.some(v => v.voiceURI === selectedVoiceURI) ? selectedVoiceURI : '';
}

function testVoice() {
    speak(`Guten Tag, ${currentUserName}. Sämtliche Systeme arbeiten einwandfrei.`);
}

if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

const voiceSelectEl = document.getElementById('voiceSelect');
if (voiceSelectEl) {
    voiceSelectEl.addEventListener('change', () => {
        selectedVoiceURI = voiceSelectEl.value;
        setPersistentData('tts_voice_uri', selectedVoiceURI);
        testVoice();
    });
}

const conversationToggleEl = document.getElementById('conversationModeToggle');
if (conversationToggleEl) {
    conversationToggleEl.checked = conversationMode;
    conversationToggleEl.addEventListener('change', () => {
        conversationMode = conversationToggleEl.checked;
        setPersistentData('conversation_mode', conversationMode ? '1' : '0');
    });
}

const wakeWordToggleEl = document.getElementById('wakeWordToggle');
if (wakeWordToggleEl) wakeWordToggleEl.checked = wakeWordEnabled;

/* --- Sprechen --- */
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

/* "11.04." oder "11.04.2026" wird als "11. April" bzw. "11. April 2026" gesprochen und angezeigt.
   So kann die Stimme Tag und Monat nicht vertauschen. Uhrzeiten wie "18.34" und Preise bleiben unberührt. */
function speakableDates(text) {
    return String(text).replace(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(?:(\d{4})|(\d{2})(?!\d))?(?!\d)/g, (m, d, mo, y4, y2) => {
        const day = Number(d), month = Number(mo);
        if (day < 1 || day > 31 || month < 1 || month > 12) return m;
        const year = y4 || (y2 ? `20${y2}` : '');
        return `${day}. ${MONTHS_DE[month - 1]}${year ? ' ' + year : ''}`;
    });
}

function speak(text, onComplete) {
    stopThinkingSound();

    if (isRecording && recognition) {
        isFollowUp = false;
        clearFollowUpTimer();
        try { recognition.abort(); } catch (e) {}
    }

    if (recordBtn) {
        recordBtn.classList.remove('recording');
        recordBtn.classList.add('speaking');
    }
    const waveEl = document.getElementById('waveform');
    if (waveEl) waveEl.classList.add('speaking');

    if (recordText) recordText.textContent = "J.A.R.V.I.S. / SPRICHT...";
    updateTerminalStream("AUDIO_OUT: TRANSMITTING...", "SPEAKING");

    let cleanText = text.replace(/[*_#`~]/g, '');
    cleanText = cleanText.replace(/Schluessel/g, 'Schlüssel').replace(/schluessel/g, 'schlüssel');
    cleanText = speakableDates(cleanText);

    if ('speechSynthesis' in window) {
        if (!ackActive) window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(cleanText);
        const voice = getActiveVoice();
        if (voice) {
            utterance.voice = voice;
            utterance.lang = voice.lang;
        } else {
            utterance.lang = 'de-DE';
        }
        utterance.rate = SPEECH_RATE;
        utterance.pitch = SPEECH_PITCH;
        currentUtterance = utterance;

        const revealRest = setHudSubtitleSynced(cleanText, utterance);

        const finish = (completed) => {
            if (utterance !== currentUtterance) return;
            currentUtterance = null;
            if (revealRest) revealRest();
            setIdleUi();
            if (completed && onComplete) onComplete();
        };
        utterance.onend = () => finish(true);
        utterance.onerror = () => finish(false);

        window.speechSynthesis.speak(utterance);
    } else {
        setHudSubtitle(cleanText);
        if (currentAudio) { currentAudio.pause(); currentAudio = null; }
        currentAudio = new Audio(`https://translate.google.com/translate_tts?ie=UTF-8&q=${encodeURIComponent(cleanText)}&tl=de&client=tw-ob`);
        currentAudio.playbackRate = 1.1;
        currentAudio.play().catch(() => {});

        currentAudio.onended = () => { 
            currentAudio = null; 
            setIdleUi();
            if (onComplete) onComplete(); 
        };
    }
}

function speakAck(text) {
    if (!('speechSynthesis' in window) || isRecording) return;
    const u = new SpeechSynthesisUtterance(text);
    const voice = getActiveVoice();
    if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = 'de-DE'; }
    u.rate = SPEECH_RATE;
    u.pitch = SPEECH_PITCH;
    ackActive = true;
    u.onend = () => { ackActive = false; };
    u.onerror = () => { ackActive = false; };
    window.speechSynthesis.speak(u);
}

function interruptSpeaking() {
    stopThinkingSound();
    if (currentAudio) { currentAudio.pause(); currentAudio = null; }
    currentUtterance = null;
    ackActive = false;
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    setIdleUi();
}

/* --- Spracherkennung --- */
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let isRecording = false;

function setListeningUi(followUp) {
    if (recordBtn) {
        recordBtn.classList.remove('speaking');
        recordBtn.classList.add('recording');
    }
    if (recordText) recordText.textContent = "J.A.R.V.I.S. / HÖRE...";
    typeWriterStatus(followUp ? "Ich höre weiter zu..." : "Höre zu...");
    setHudSubtitle(followUp ? "Höre weiter zu..." : "Aktiviert. Ich höre zu...");
    updateTerminalStream("VOICE_RECOGNITION: ACTIVE", "LISTENING");
}

function startListening(followUp = false) {
    if (!recognition || isRecording) return;
    recognition.continuous = false;
    isFollowUp = followUp;
    clearFollowUpTimer();
    try {
        recognition.start();
    } catch (e) {
        isFollowUp = false;
        return;
    }
    setListeningUi(followUp);
    if (followUp) {
        followUpTimer = setTimeout(() => {
            if (isRecording && isFollowUp) {
                try { recognition.stop(); } catch (e) {}
            }
        }, FOLLOW_UP_WINDOW_MS);
    }
}

function continueConversation() {
    if (conversationMode) startListening(true);
}

const END_PHRASE = /^((ok|okay|nein|gut|super) )?(danke( schön| dir)?|vielen dank|das war'?s|das wäre alles|das ist alles|nichts weiter|abbrechen|stopp?|ende|schluss)( danke)?$/;

function isEndPhrase(text) {
    const t = text.toLowerCase().replace(/[.,!?]/g, '').trim();
    return t.length <= 32 && END_PHRASE.test(t);
}

if (SpeechRecognition) {
    recognition = new SpeechRecognition();
    recognition.lang = 'de-DE';
    recognition.onstart = () => {
        isRecording = true;
        setListeningUi(isFollowUp);
    };
    recognition.onresult = (event) => {
        const text = event.results[event.results.length - 1][0].transcript;

        if (wakeWordListening) {
            const m = text.match(WAKE_WORD_REGEX);
            if (!m) return;   // kein Weckwort erkannt: einfach weiter zuhören, nichts an die KI schicken
            wakeWordListening = false;
            recognition.continuous = false;
            const rest = text.slice(m.index + m[0].length).replace(/^[,.:\s]+/, '').trim();
            if (rest) {
                handleRecognizedText(rest);
            } else {
                isRecording = false;   // sonst würde speakAck() das "Ja?" für sich stumm verschlucken (isRecording ist im Dauerzuhören-Modus noch true)
                speakAck('Ja?');
                isFollowUp = true;
                clearFollowUpTimer();
                followUpTimer = setTimeout(() => { isFollowUp = false; setIdleUi(); }, FOLLOW_UP_WINDOW_MS);
                setListeningUi(true);
                try { recognition.start(); } catch (e) {}
            }
            return;
        }

        handleRecognizedText(text);
    };

    function handleRecognizedText(text) {
        isFollowUp = false;
        clearFollowUpTimer();
        typeWriterStatus(`Verstanden: "${text}"`);
        setHudSubtitle(`User: "${text}"`);

        // Fenster offen und "Schließen" gesagt: nur schließen, kein Aufruf an die KI
        if (isPanelOpen() && isCloseCommand(text)) {
            closePanel();
            typeWriterStatus("Klicken zum Sprechen...");
            speak(pickRandom(["Sehr wohl.", "Zu Diensten.", "Wird geschlossen.", "Gerne."]), continueConversation);
            return;
        }

        if (isEndPhrase(text)) {
            closePanel();
            typeWriterStatus("Klicken zum Sprechen...");
            speak(pickRandom(["Sehr wohl.", "Jederzeit.", "Zu Diensten.", "Bis gleich.", "Ich bin für Sie da."]));
            return;
        }
        sendToGroqSmart(text);
    }
    recognition.onerror = (event) => {
        const wasFollowUp = isFollowUp;
        isFollowUp = false;
        clearFollowUpTimer();
        const wasWake = wakeWordListening;
        wakeWordListening = false;
        if (event && (event.error === 'not-allowed' || event.error === 'service-not-allowed')) {
            typeWriterStatus("Mikrofon-Zugriff blockiert.");
            setHudSubtitle("Mikrofon-Zugriff blockiert.");
            wakeWordEnabled = false;   // Zugriff verweigert: Weckwort-Modus lässt sich nicht sinnvoll fortsetzen
        } else if (wasFollowUp && !isProcessing && !isSpeaking()) {
            typeWriterStatus("Klicken zum Sprechen...");
        } else if (wasWake && wakeWordEnabled && !isProcessing && !isSpeaking()) {
            setTimeout(() => startWakeWordListening(), 800);   // z.B. Stille-Zeitüberschreitung: einfach neu starten
        }
        resetRecordingState();
    };
    recognition.onend = () => {
        const wasFollowUp = isFollowUp;
        const wasWake = wakeWordListening;
        isFollowUp = false;
        wakeWordListening = false;
        clearFollowUpTimer();
        if (wasFollowUp && !isProcessing && !isSpeaking()) {
            typeWriterStatus("Klicken zum Sprechen...");
        }
        resetRecordingState();
        if (pendingManualListen) {
            pendingManualListen = false;
            startListening(false);
        } else if (wasWake && wakeWordEnabled && !isProcessing && !isSpeaking()) {
            setTimeout(() => startWakeWordListening(), 400);   // Sitzung von selbst beendet (Browser-Limit): weiterlauschen
        }
    };
}

/* --- Weckwort-Modus: hört dauerhaft zu, solange die App offen ist, und reagiert nur auf "Hey Jarvis" --- */
function startWakeWordListening() {
    if (!recognition || !wakeWordEnabled) return;
    if (isRecording || isSpeaking() || isProcessing || wakeWordListening) return;
    if (document.hidden) return;   // App im Hintergrund: nicht versuchen, spart Akku und vermeidet Fehler
    wakeWordListening = true;
    recognition.continuous = true;
    recognition.interimResults = false;
    try {
        recognition.start();
        if (recordText) recordText.textContent = "J.A.R.V.I.S. / WARTET AUF „HEY JARVIS\"...";
    } catch (e) {
        wakeWordListening = false;
    }
}

function stopWakeWordListening() {
    wakeWordListening = false;
    if (recognition && isRecording) { try { recognition.stop(); } catch (e) {} }
}

function setWakeWordEnabled(on) {
    wakeWordEnabled = !!on;
    setPersistentData('wake_word_enabled', wakeWordEnabled ? '1' : '0');
    if (wakeWordEnabled) startWakeWordListening();
    else stopWakeWordListening();
}

if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) stopWakeWordListening();
        else if (wakeWordEnabled && !isRecording && !isSpeaking() && !isProcessing) startWakeWordListening();
    });
}

let pendingManualListen = false;

function toggleSpeechRecognition() {
    playUiBeep();
    if (!recognition) {
        alert('Spracherkennung wird von diesem Browser leider nicht unterstützt.');
        return;
    }
    if (isSpeaking()) {
        interruptSpeaking();
        setTimeout(() => startListening(false), 200);
        return;
    }
    if (wakeWordListening) {
        // Man will jetzt sofort reden, statt erst "Hey Jarvis" zu sagen: umschalten auf normales Zuhören
        wakeWordListening = false;
        pendingManualListen = true;
        try { recognition.stop(); } catch (e) { pendingManualListen = false; startListening(false); }
        return;
    }
    if (isRecording) {
        isFollowUp = false;
        clearFollowUpTimer();
        recognition.stop();
    } else {
        startListening(false);
    }
}

function resetRecordingState() {
    isRecording = false;
    if (!isSpeaking() && !isProcessing) {
        setIdleUi();
    }
}
