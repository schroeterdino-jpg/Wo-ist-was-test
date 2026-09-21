/* ============================================================
   AUDIO: High-Tech WebAudio Sound-Synthesizer
   ============================================================ */

let audioCtx = null;
function getAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function playUiBeep() {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(800, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(1200, ctx.currentTime + 0.05);
        gain.gain.setValueAtTime(0.05, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.05);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.05);
    } catch(e) {}
}

function playJarvisSound() {
    try {
        const ctx = getAudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(300, ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(900, ctx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.08, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
        console.log('Audio Sound Effekt Fehler:', e);
    }
}

/* --- Realistischer J.A.R.V.I.S. HUD Thinking-Sound (Verarbeitungs-Loop) --- */
let thinkingOsc = null;
let thinkingGain = null;
let thinkingInterval = null;

function startThinkingSound() {
    try {
        stopThinkingSound();
        const ctx = getAudioContext();

        thinkingOsc = ctx.createOscillator();
        thinkingGain = ctx.createGain();

        thinkingOsc.type = 'triangle';
        thinkingOsc.frequency.setValueAtTime(60, ctx.currentTime);
        thinkingOsc.frequency.linearRampToValueAtTime(180, ctx.currentTime + 2.0);

        thinkingGain.gain.setValueAtTime(0.02, ctx.currentTime);

        thinkingOsc.connect(thinkingGain);
        thinkingGain.connect(ctx.destination);
        thinkingOsc.start();

        thinkingInterval = setInterval(() => {
            try {
                const now = ctx.currentTime;
                const pulseOsc = ctx.createOscillator();
                const pulseGain = ctx.createGain();

                pulseOsc.type = 'sine';
                const freq = 1200 + Math.random() * 1800;
                pulseOsc.frequency.setValueAtTime(freq, now);

                pulseGain.gain.setValueAtTime(0.015, now);
                pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.04);

                pulseOsc.connect(pulseGain);
                pulseGain.connect(ctx.destination);

                pulseOsc.start(now);
                pulseOsc.stop(now + 0.04);
            } catch(e) {}
        }, 120);

    } catch (e) {
        console.log('Thinking Sound Fehler:', e);
    }
}

function stopThinkingSound() {
    if (thinkingInterval) {
        clearInterval(thinkingInterval);
        thinkingInterval = null;
    }
    if (thinkingOsc) {
        try {
            thinkingOsc.stop();
            thinkingOsc.disconnect();
        } catch(e) {}
        thinkingOsc = null;
    }
    if (thinkingGain) {
        try { thinkingGain.disconnect(); } catch(e) {}
        thinkingGain = null;
    }
}
