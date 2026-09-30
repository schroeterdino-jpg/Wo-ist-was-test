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
let allVoicesList = [];      // alle Stimmen des Geräts (für den Dolmetscher-Modus), nicht nur die deutschen
let interpreter = null;      // Dolmetscher-Modus: { lang, turn } solange er aktiv ist
let interpFailCount = 0;     // wie oft die Spracherkennung in dieser Dolmetscher-Runde schon nichts verstanden hat
const INTERP_MAX_RETRIES = 2;   // so oft hört er in derselben Runde automatisch weiter, bevor er zurück auf Deutsch wechselt
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
    if (typeof jvListenIndicator === 'function') jvListenIndicator(false);
    if (window.recordBtn) {
        window.recordBtn.classList.remove('recording');
        window.recordBtn.classList.remove('speaking');
    }
    const waveEl = document.getElementById('waveform');
    if (waveEl) waveEl.classList.remove('speaking');

    if (window.recordText) window.recordText.textContent = "J.A.R.V.I.S. / BEREIT";
    if (typeof updateTerminalStream === 'function') updateTerminalStream("SYS_IDLE: AWAITING_INPUT", "ONLINE");
    if (wakeWordEnabled && typeof startWakeWordListening === 'function') startWakeWordListening();
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
    allVoicesList = window.speechSynthesis.getVoices();
    availableVoices = allVoicesList.filter(v => /^de([-_]|$)/i.test(v.lang || ''));
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

function voiceForLang(code) {
    const want = String(code || '').replace('_', '-').toLowerCase();
    const prefix = want.slice(0, 2);
    const norm = v => String(v.lang || '').replace('_', '-').toLowerCase();
    const cands = allVoicesList.filter(v => norm(v).startsWith(prefix));
    if (!cands.length) return null;
    return cands.sort((a, b) => ((norm(b) === want ? 100 : 0) + scoreVoice(b)) - ((norm(a) === want ? 100 : 0) + scoreVoice(a)))[0];
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
    if (typeof getPersistentData === 'function') {
        sel.value = availableVoices.some(v => v.voiceURI === selectedVoiceURI) ? selectedVoiceURI : '';
    }
}

function testVoice() {
    speak(`Guten Tag. Sämtliche Systeme arbeiten einwandfrei.`);
}

if ('speechSynthesis' in window) {
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
}

const voiceSelectEl = document.getElementById('voiceSelect');
if (voiceSelectEl) {
    voiceSelectEl.addEventListener('change', () => {
        selectedVoiceURI = voiceSelectEl.value;
        if (typeof setPersistentData === 'function') setPersistentData('tts_voice_uri', selectedVoiceURI);
        testVoice();
    });
}

const ttsEngineSelectEl = document.getElementById('ttsEngineSelect');
if (ttsEngineSelectEl) {
    ttsEngineSelectEl.value = getTtsEngine();
    const edgeRow = document.getElementById('edgeVoiceRow');
    if (edgeRow) edgeRow.classList.toggle('hidden', ttsEngineSelectEl.value === 'browser');
}
const edgeVoiceSelectEl = document.getElementById('edgeVoiceSelect');
if (edgeVoiceSelectEl) edgeVoiceSelectEl.value = getEdgeVoice();

const conversationToggleEl = document.getElementById('conversationModeToggle');
if (conversationToggleEl) {
    conversationToggleEl.checked = conversationMode;
    conversationToggleEl.addEventListener('change', () => {
        conversationMode = conversationToggleEl.checked;
        if (typeof setPersistentData === 'function') setPersistentData('conversation_mode', conversationMode ? '1' : '0');
    });
}

const wakeWordToggleEl = document.getElementById('wakeWordToggle');
if (wakeWordToggleEl) wakeWordToggleEl.checked = wakeWordEnabled;

/* --- Sprechen --- */
const MONTHS_DE = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'];

function speakableDates(text) {
    return String(text).replace(/(?<![\d.])(\d{1,2})\.(\d{1,2})\.(?:(\d{4})|(\d{2})(?!\d))?(?!\d)/g, (m, d, mo, y4, y2) => {
        const day = Number(d), month = Number(mo);
        if (day < 1 || day > 31 || month < 1 || month > 12) return m;
        const year = y4 || (y2 ? `20${y2}` : '');
        return `${day}. ${MONTHS_DE[month - 1]}${year ? ' ' + year : ''}`;
    });
}

function speakableAbbreviations(text) {
    const end = '(?=[\\s,;:)!?]|$)';
    return String(text)
        .replace(new RegExp('([A-Za-zÄÖÜäöüß])str\\.' + end, 'g'), '$1straße')
        .replace(new RegExp('\\bStr\\.' + end, 'g'), 'Straße')
        .replace(new RegExp('\\bstr\\.' + end, 'g'), 'straße')
        .replace(/([A-Za-zÄÖÜäöüß])str(?=\s+\d)/g, '$1straße');
}

function getTtsEngine() {
    return typeof getPersistentData === 'function' ? getPersistentData('tts_engine', 'auto') : 'auto';
}
function setTtsEngine(val) {
    if (typeof setPersistentData === 'function') setPersistentData('tts_engine', val === 'browser' ? 'browser' : 'auto');
}
function getEdgeVoice() {
    return typeof getPersistentData === 'function' ? getPersistentData('tts_edge_voice', 'de-DE-ConradNeural') : 'de-DE-ConradNeural';
}
function setEdgeVoice(val) {
    if (typeof setPersistentData === 'function') setPersistentData('tts_edge_voice', String(val || 'de-DE-ConradNeural'));
}

let ttsCloudFailCount = 0;
const TTS_CLOUD_MAX_FAILS = 2;

/* ============================================================
   NEUER AP-TTS AUDIO STREAM (ERSETZT DIE ALTE WEB SPEECH API)
   ============================================================ */

export async function speak(text, options = {}) {
    stopSpeaking(); // Laufende Sprachausgaben sofort unterbrechen
    if (!text) return;

    let cleanText = speakableDates(text);
    cleanText = speakableAbbreviations(cleanText);

    isProcessing = false;
    
    // UI auf Sprech-Modus umstellen
    if (window.recordBtn) {
        window.recordBtn.classList.remove('recording');
        window.recordBtn.classList.add('speaking');
    }
    const waveEl = document.getElementById('waveform');
    if (waveEl) waveEl.classList.add('speaking');
    if (window.recordText) window.recordText.textContent = "J.A.R.V.I.S. / SPRICHT";
    if (typeof updateTerminalStream === 'function') updateTerminalStream("SYS_AUDIO: OUTPUT_STREAM_ACTIVE", "TALKING");

    try {
        const secret = (typeof getPersistentData === 'function' ? getPersistentData('app_secret', '') : '') || (window.CONFIG && window.CONFIG.APP_SECRET); 

        const response = await fetch('/api/tts', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-app-key': secret
            },
            body: JSON.stringify({ text: cleanText })
        });

        if (!response.ok) throw new Error('Konnte Audio von API nicht laden');

        const blob = await response.blob();
        const audioUrl = URL.createObjectURL(blob);
        
        currentAudio = new Audio(audioUrl);
        
        currentAudio.onended = () => {
            currentAudio = null;
            if (conversationMode) {
                clearFollowUpTimer();
                followUpTimer = setTimeout(() => {
                    if (typeof startVoiceRecognition === 'function') startVoiceRecognition();
                }, 400);
            } else {
                setIdleUi();
            }
        };

        currentAudio.onerror = () => {
            fallbackBrowserSpeak(cleanText);
        };

        await currentAudio.play();

    } catch (error) {
        console.warn("Fehler bei AI-Stimme, wechsle auf lokalen Browser-Fallback:", error);
        fallbackBrowserSpeak(cleanText);
    }
}

