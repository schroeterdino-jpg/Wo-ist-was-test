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

/* --- Realistischer J.A.R.V.I.S. HUD Thinking-Sound: rhythmischer Datenverarbeitungs-Puls statt Dauerton --- */
let thinkingInterval = null;

function startThinkingSound() {
    try {
        stopThinkingSound();
        const ctx = getAudioContext();
        let step = 0;
        const notes = [1046, 1318, 1568, 1760];

        thinkingInterval = setInterval(() => {
            try {
                const now = ctx.currentTime;

                // Tiefer, leiser Puls im Takt (wie ein Herzschlag der Datenverarbeitung)
                const pulse = ctx.createOscillator();
                const pulseGain = ctx.createGain();
                pulse.type = 'sine';
                pulse.frequency.setValueAtTime(70, now);
                pulseGain.gain.setValueAtTime(0.0001, now);
                pulseGain.gain.exponentialRampToValueAtTime(0.05, now + 0.02);
                pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.12);
                pulse.connect(pulseGain);
                pulseGain.connect(ctx.destination);
                pulse.start(now);
                pulse.stop(now + 0.14);

                // Kurzer, leicht zufälliger Daten-Blip obendrauf (wie schnelles Rechnen)
                const freq = notes[step % notes.length] * (0.98 + Math.random() * 0.04);
                const blip = ctx.createOscillator();
                const blipGain = ctx.createGain();
                blip.type = 'triangle';
                blip.frequency.setValueAtTime(freq, now);
                blipGain.gain.setValueAtTime(0.0001, now);
                blipGain.gain.exponentialRampToValueAtTime(0.02, now + 0.01);
                blipGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.07);
                blip.connect(blipGain);
                blipGain.connect(ctx.destination);
                blip.start(now);
                blip.stop(now + 0.08);

                step++;
            } catch (e) {}
        }, 260);

    } catch (e) {
        console.log('Thinking Sound Fehler:', e);
    }
}

function stopThinkingSound() {
    if (thinkingInterval) {
        clearInterval(thinkingInterval);
        thinkingInterval = null;
    }
}

/* Fenster öffnen/schließen: tiefer Energie-Puls + heller "Materialisieren"-Shimmer + kurzes Scan-Rauschen */
function playPanelSound(opening = true) {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(opening ? 90 : 260, now);
        sub.frequency.exponentialRampToValueAtTime(opening ? 260 : 90, now + 0.22);
        subGain.gain.setValueAtTime(0.0001, now);
        subGain.gain.exponentialRampToValueAtTime(0.08, now + 0.03);
        subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start(now);
        sub.stop(now + 0.28);

        [0, 6].forEach(detune => {
            const shimmer = ctx.createOscillator();
            const sGain = ctx.createGain();
            shimmer.type = 'sine';
            shimmer.detune.setValueAtTime(opening ? detune : -detune, now);
            shimmer.frequency.setValueAtTime(opening ? 1400 : 2200, now);
            shimmer.frequency.exponentialRampToValueAtTime(opening ? 2200 : 1400, now + 0.16);
            sGain.gain.setValueAtTime(0.0001, now + 0.02);
            sGain.gain.exponentialRampToValueAtTime(0.035, now + 0.06);
            sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
            shimmer.connect(sGain);
            sGain.connect(ctx.destination);
            shimmer.start(now);
            shimmer.stop(now + 0.22);
        });

        const bufferSize = Math.max(1, Math.floor(ctx.sampleRate * 0.15));
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize);
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(opening ? 2600 : 900, now);
        filter.Q.value = 6;
        const noiseGain = ctx.createGain();
        noiseGain.gain.setValueAtTime(0.05, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);
        noise.connect(filter);
        filter.connect(noiseGain);
        noiseGain.connect(ctx.destination);
        noise.start(now);
    } catch (e) {}
}
