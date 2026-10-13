/* ============================================================
   AUDIO: High-Tech WebAudio Sound-Synthesizer
   Cinematischer Sci-Fi-Stil (wie im Film): sanfte Sweeps statt einzelner Pieptöne,
   warme Bässe, kein hektisches Puls-Gehämmer.
   Neu: Schalter "Töne" und Lautstärke (Einstellungen > Töne, oder per Sprache "Töne aus" / "Töne an" / "Töne leiser" / "Töne lauter").
   Alle Effekt-Töne laufen über einen gemeinsamen Lautstärkeregler (audioOut); die Stimme von Jarvis gehört nicht dazu.
   Neue Töne: playSuccessSound (Bestätigung), playErrorSound (Fehler), playAlertSound (Warnung). Sie werden von toene.js passend zum Gesprochenen ausgelöst.
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

/* --- Töne an/aus und Lautstärke (jedes Gerät merkt sich das selbst) --- */
let soundOn = true;
let soundVol = 1;
try {
    soundOn = localStorage.getItem('jv_sound_on') !== '0';
    const v = parseFloat(localStorage.getItem('jv_sound_vol'));
    if (!isNaN(v)) soundVol = Math.min(1.5, Math.max(0.2, v));
} catch (e) {}

let audioMaster = null;
/* Gemeinsamer Ausgang aller Effekt-Töne: hier greifen Schalter und Lautstärke */
function audioOut(ctx) {
    if (!audioMaster || audioMaster.context !== ctx) {
        audioMaster = ctx.createGain();
        audioMaster.gain.value = soundOn ? soundVol : 0;
        audioMaster.connect(ctx.destination);
    }
    return audioMaster;
}
function applySoundSettings() {
    try { if (audioMaster) audioMaster.gain.value = soundOn ? soundVol : 0; } catch (e) {}
}
function setSoundEnabled(on) {
    soundOn = !!on;
    try { localStorage.setItem('jv_sound_on', soundOn ? '1' : '0'); } catch (e) {}
    applySoundSettings();
}
function setSoundVolume(v) {
    const n = parseFloat(v);
    soundVol = isNaN(n) ? 1 : Math.min(1.5, Math.max(0.2, n));
    try { localStorage.setItem('jv_sound_vol', String(soundVol)); } catch (e) {}
    applySoundSettings();
}
function getSoundEnabled() { return soundOn; }
function getSoundVolume() { return soundVol; }

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
            gain.connect(audioOut(ctx));
            osc.start(now + delay);
            osc.stop(now + delay + 0.1);
        });
    } catch (e) {}
}

/* Bestätigung (Erfolg): drei weiche, aufsteigende Töne (Dur-Dreiklang), ruhiger und tiefer als der Tipp-Ton */
function playSuccessSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        [[523.25, 0], [659.25, 0.07], [783.99, 0.14]].forEach(([freq, delay], i) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + delay);
            const peak = 0.05 + i * 0.008;
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(peak, now + delay + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + (i === 2 ? 0.26 : 0.14));
            osc.connect(gain);
            gain.connect(audioOut(ctx));
            osc.start(now + delay);
            osc.stop(now + delay + 0.3);
        });
    } catch (e) {}
}

/* Fehler: zwei tiefe, absteigende Töne mit warmem Klang (weich gefiltert, nicht schrill) */
function playErrorSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        [[233.08, 0], [174.61, 0.16]].forEach(([freq, delay]) => {
            const osc = ctx.createOscillator();
            const filter = ctx.createBiquadFilter();
            const gain = ctx.createGain();
            osc.type = 'triangle';
            osc.frequency.setValueAtTime(freq, now + delay);
            osc.frequency.exponentialRampToValueAtTime(freq * 0.94, now + delay + 0.22);
            filter.type = 'lowpass';
            filter.frequency.setValueAtTime(900, now + delay);
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.085, now + delay + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.3);
            osc.connect(filter);
            filter.connect(gain);
            gain.connect(audioOut(ctx));
            osc.start(now + delay);
            osc.stop(now + delay + 0.34);
        });
    } catch (e) {}
}

/* Warnung (zum Beispiel Unwetter): zwei Töne im Wechsel, deutlich, aber nicht erschreckend */
function playAlertSound() {
    try {
        const ctx = getAudioContext();
        const now = ctx.currentTime;
        [[740, 0], [988, 0.17], [740, 0.34], [988, 0.51]].forEach(([freq, delay]) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, now + delay);
            gain.gain.setValueAtTime(0.0001, now + delay);
            gain.gain.exponentialRampToValueAtTime(0.06, now + delay + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + delay + 0.15);
            osc.connect(gain);
            gain.connect(audioOut(ctx));
            osc.start(now + delay);
            osc.stop(now + delay + 0.17);
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
        subGain.connect(audioOut(ctx));
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
        shimmerGain.connect(audioOut(ctx));
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
        gain.connect(audioOut(ctx));

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
        subGain.connect(audioOut(ctx));
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
        sGain.connect(audioOut(ctx));
        shimmer.start(now);
        shimmer.stop(now + 0.28);
    } catch (e) {}
}
