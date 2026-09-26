/* ============================================================
   AUDIO: High-Tech WebAudio Sound-Synthesizer
   Cinematischer Sci-Fi-Stil (wie im Film): sanfte Sweeps statt einzelner Pieptöne,
   warme Bässe, kein hektisches Puls-Gehämmer.
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

/* Kurzer, weicher Zwei-Ton-Chirp für Tipp-Bestätigungen (Buttons, Menüpunkte) */
function playUiBeep() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        [[880, 0], [1320, 0.045]].forEach(([freq, delay]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + delay);
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.045, now + delay + 0.012);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.09);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start(now + delay);
            osc.stop(now + delay + 0.1);
        });
    } catch (e) {}
}

/* Boot-Sound: cinematischer Power-Up, wie ein Reaktor, der hochfährt - tiefer Bass-Sweep mit hellem Shimmer obendrüber */
function playJarvisSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        // Tiefer Bass, der von unten hochzieht
        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(55, now);
        sub.frequency.exponentialRampToValueAtTime(220, now + 0.9);
        subGain.gain.setValueAtTime(0.0001, now);
        subGain.gain.exponentialRampToValueAtTime(0.09, now + 0.35);
        subGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.1);
        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start(now);
        sub.stop(now + 1.15);

        // Heller Shimmer, der etwas verzögert einsetzt und obendrauf glänzt
        const shimmer = ctx.createOscillator();
        const shimmerGain = ctx.createGain();
        const shimmerFilter = ctx.createBiquadFilter();
        shimmer.type = 'triangle';
        shimmer.frequency.setValueAtTime(660, now + 0.2);
        shimmer.frequency.exponentialRampToValueAtTime(1760, now + 0.95);
        shimmerFilter.type = 'lowpass';
        shimmerFilter.frequency.setValueAtTime(3000, now);
        shimmerGain.gain.setValueAtTime(0.0001, now + 0.2);
        shimmerGain.gain.exponentialRampToValueAtTime(0.05, now + 0.5);
        shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.15);
        shimmer.connect(shimmerFilter);
        shimmerFilter.connect(shimmerGain);
        shimmerGain.connect(ctx.destination);
        shimmer.start(now + 0.2);
        shimmer.stop(now + 1.2);
    } catch (e) {
        console.log('Audio Sound Effekt Fehler:', e);
    }
}

/* --- J.A.R.V.I.S. Nachdenk-Sound: EIN ruhiger, durchlaufender Ton mit langsamem Filter-Sweep ---
   Statt der früheren, hektischen Puls-Schleife (alle 260ms ein Blip) läuft hier nur eine einzelne,
   sehr leise Hintergrund-Textur: ein Sinuston, dessen Klangfarbe sich über einen Tiefpassfilter
   langsam auf- und abbewegt (LFO) - wie ein sanftes "Scannen/Analysieren" im Hintergrund,
   statt einem hörbaren Rhythmus. Läuft, bis stopThinkingSound() sie sauber ausblendet. */
let thinkingNodes = null;

function startThinkingSound() {
    try {
        stopThinkingSound();
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(210, now);

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(500, now);
        filter.Q.value = 7;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.03, now + 0.5);   // sanftes Einblenden

        // Sehr langsamer LFO (ca. alle 6-7 Sekunden ein Zyklus) bewegt den Filter, statt eines hörbaren Takts
        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.15, now);
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(340, now);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now);
        lfo.start(now);

        thinkingNodes = { osc, lfo, gain };
    } catch (e) {
        console.log('Thinking Sound Fehler:', e);
    }
}

function stopThinkingSound() {
    if (!thinkingNodes) return;
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        const { osc, lfo, gain } = thinkingNodes;
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(gain.gain.value, now);
        gain.gain.linearRampToValueAtTime(0, now + 0.18);   // sanftes Ausblenden statt hartem Stopp
        osc.stop(now + 0.2);
        lfo.stop(now + 0.2);
    } catch (e) {}
    thinkingNodes = null;
}

/* Fenster öffnen/schließen: warmer Energie-Puls + heller Shimmer, etwas weicher als zuvor */
function playPanelSound(opening = true) {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;

        const sub = ctx.createOscillator();
        const subGain = ctx.createGain();
        sub.type = 'sine';
        sub.frequency.setValueAtTime(opening ? 85 : 240, now);
        sub.frequency.exponentialRampToValueAtTime(opening ? 240 : 85, now + 0.26);
        subGain.gain.setValueAtTime(0.0001, now);
        subGain.gain.exponentialRampToValueAtTime(0.07, now + 0.04);
        subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.3);
        sub.connect(subGain);
        subGain.connect(ctx.destination);
        sub.start(now);
        sub.stop(now + 0.32);

        const shimmer = ctx.createOscillator();
        const sGain = ctx.createGain();
        shimmer.type = 'sine';
        shimmer.frequency.setValueAtTime(opening ? 1300 : 2000, now);
        shimmer.frequency.exponentialRampToValueAtTime(opening ? 2000 : 1300, now + 0.2);
        sGain.gain.setValueAtTime(0.0001, now + 0.03);
        sGain.gain.exponentialRampToValueAtTime(0.028, now + 0.08);
        sGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.26);
        shimmer.connect(sGain);
        sGain.connect(ctx.destination);
        shimmer.start(now);
        shimmer.stop(now + 0.28);
    } catch (e) {}
}
