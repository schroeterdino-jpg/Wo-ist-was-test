package de.dino.zaneweckruf;

import android.content.Context;
import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;

import java.util.Locale;

/**
 * Mikrofon-Schleife für die openWakeWord-Erkennung: liest Blöcke von 80 ms, lässt sie von {@link OwwEngine} bewerten
 * und meldet einen Treffer, wenn der Wert über der Schwelle liegt. Misst außerdem, wie viel Zeit die Erkennung wirklich rechnet.
 * Sprach-Schranke: Zusätzlich zur Lautstärke prüft {@link OwwVad}, ob wirklich jemand spricht. Maschinenlärm öffnet die Schranke dann nicht mehr.
 * Fehlt das Modell oder gibt es einen Fehler, gilt wieder nur die Lautstärke (wie bisher).
 */
class OwwSpeech {
    interface Listener {
        void onWake(float score);
        void onError(Exception e);
    }

    private static final int RATE = 16000;
    private static final int VORLAUF = 16;          // 16 x 80 ms = 1,3 s Vorlauf
    private static final int NACHLAUF = 19;         // 1,5 s Stille nach der letzten Lautstärke, dann wird wieder pausiert
    private static final double DAUERLAERM = 600;   // Ruhepegel ab dem durchgehend gerechnet wird (Auto)
    private static final float SPRACHE = 0.35f;     // ab diesem Wert gilt ein 32-ms-Stück als Sprache (Test: Lärm blieb unter 0,15, Sprache wird auch bei 0 dB Lärm erkannt)
    private static final int SPRACH_HALT = 12;      // so viele Blöcke (ca. 1 s) bleibt die Schranke nach dem letzten Sprachstück offen
    private static final int VAD_AUS = 12;          // so lange ohne Lautstärke, dann ruht auch die Sprach-Erkennung

    private final Context ctx;
    private final OwwEngine eng;
    private final float threshold;
    private OwwVad vad;
    private final Handler main = new Handler(Looper.getMainLooper());
    private AudioRecord ar;
    private Thread th;
    private volatile boolean run = false;

    OwwSpeech(Context ctx, OwwEngine eng, float threshold, OwwVad vad) {
        this.ctx = ctx.getApplicationContext();
        this.eng = eng;
        this.threshold = threshold;
        this.vad = vad;
    }

    boolean startListening(final Listener l) {
        if (run) return false;
        int min = AudioRecord.getMinBufferSize(RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int buf = Math.max(min, RATE * 2 * 3);   // mind. 3 s Puffer (Bytes), damit nichts verloren geht, wenn der Prozessor kurz schläft
        ar = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, RATE, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, buf);
        if (ar.getState() != AudioRecord.STATE_INITIALIZED) {
            try { ar.release(); } catch (Throwable ignored) { }
            ar = null;
            throw new RuntimeException("Mikrofon nicht verfügbar");
        }
        run = true;
        th = new Thread(() -> loop(l), "zane-oww");
        th.start();
        return true;
    }

    private void loop(final Listener l) {
        try { Process.setThreadPriority(Process.THREAD_PRIORITY_BACKGROUND); } catch (Throwable ignored) { }
        short[] block = new short[OwwEngine.CHUNK];
        short[][] ring = new short[VORLAUF][OwwEngine.CHUNK];   // die letzten 1,3 s, falls "Hey" schon vor dem Anspringen fiel
        int ringN = 0, ringPos = 0;       // ringPos: Platz für den nächsten Block
        double boden = 60;                // geschätzter Ruhepegel der Umgebung
        boolean rechnet = false;
        int still = 0, lautSerie = 0, ignorieren = 0;
        long blocksWin = 0, blocksWinRech = 0, blocksWinLaut = 0;
        int sprachHalt = 0, vadStill = VAD_AUS;
        boolean vadLauft = false;
        try {
            eng.reset();   // Puffer auffüllen; das Mikrofon startet erst danach
            if (!run) return;
            ar.startRecording();
            long start = System.nanoTime();
            long winStart = start;
            long busyAll = 0, busyWin = 0;
            float peak = 0f;
            int sperre = 0;
            while (run) {
                int got = 0;
                while (run && got < block.length) {
                    int n = ar.read(block, got, block.length - got);
                    if (n < 0) throw new RuntimeException("Mikrofon-Fehler " + n);
                    got += n;
                }
                if (!run) break;

                // Stille-Schranke: nur rechnen, wenn es hörbar lauter ist als die Umgebung (wie beim alten Modus)
                double sum = 0;
                for (int i = 0; i < block.length; i++) sum += (double) block[i] * block[i];
                double rms = Math.sqrt(sum / block.length);
                boolean laut = rms > boden * 2.2 + 60;
                if (!laut) { boden = Math.max(25, Math.min(3000, boden * 0.97 + rms * 0.03)); lautSerie = 0; }
                else if (++lautSerie > 38) boden = Math.min(3000, boden * 0.9 + rms * 0.1);   // seit über 3 s durchgehend laut: Dauerlärm, die Schranke passt sich an
                boolean energie = laut || boden > DAUERLAERM;   // im Auto (hoher Ruhepegel) ist die Lautstärke-Schranke immer offen
                boolean aktiv = energie;
                if (vad != null) {
                    // Sprach-Schranke: nur wenn die Lautstärke offen ist (oder gerade war), läuft die Sprach-Erkennung; die Engine rechnet nur bei Sprache
                    try {
                        if (energie) vadStill = 0; else if (vadStill < VAD_AUS) vadStill++;
                        if (vadStill < VAD_AUS) {
                            if (!vadLauft) { vad.reset(); vadLauft = true; }
                            float p = vad.feed(block, block.length);
                            if (p >= SPRACHE) sprachHalt = SPRACH_HALT; else if (sprachHalt > 0) sprachHalt--;
                        } else {
                            vadLauft = false;
                            if (sprachHalt > 0) sprachHalt--;
                        }
                        aktiv = sprachHalt > 0;
                    } catch (Throwable ve) {
                        vad = null;   // Fehler in der Sprach-Erkennung: weiter nur mit der Lautstärke-Schranke
                        aktiv = energie;
                    }
                }

                blocksWin++;
                if (energie) blocksWinLaut++;
                if (!rechnet && aktiv) {
                    rechnet = true;
                    still = 0;
                    eng.softReset();
                    ignorieren = VORLAUF - ringN;   // war der Vorlauf nicht voll (direkt nach dem Start), die ersten Werte nicht bewerten
                    int first = ringN < VORLAUF ? 0 : ringPos;
                    for (int k = 0; k < ringN; k++) eng.process(ring[(first + k) % VORLAUF]);   // Puffer mit echtem Ton auffüllen, Wert wird nicht bewertet
                    ringN = 0;
                    ringPos = 0;
                }
                if (!rechnet) {
                    System.arraycopy(block, 0, ring[ringPos], 0, block.length);
                    ringPos = (ringPos + 1) % VORLAUF;
                    if (ringN < VORLAUF) ringN++;
                } else {
                    blocksWinRech++;
                    long t0 = System.nanoTime();
                    float score = eng.process(block);
                    long t1 = System.nanoTime();
                    busyAll += t1 - t0;
                    busyWin += t1 - t0;
                    if (ignorieren > 0) {
                        ignorieren--;
                    } else {
                        if (score > peak) peak = score;
                        if (sperre > 0) sperre--;
                        else if (score >= threshold) {
                            sperre = 25;   // 2 s Ruhe nach einem Treffer
                            try { Prefs.setLast(ctx, "erkannt: " + String.format(Locale.US, "%.2f", score)); } catch (Throwable ignored) { }
                            final float s = score;
                            main.post(() -> { try { l.onWake(s); } catch (Throwable ignored) { } });
                        }
                    }
                    if (aktiv) still = 0;
                    else if (++still >= NACHLAUF) {
                        rechnet = false;
                        still = 0;
                        ringN = 0;
                        ringPos = 0;
                    }
                }
                long now = System.nanoTime();
                if (now - winStart >= 10_000_000_000L) {   // alle 10 Sekunden: Messwerte für die Einstellungen
                    try {
                        Prefs.setStat(ctx, Math.round(100.0 * busyWin / (now - winStart)) + " % zuletzt, "
                                + Math.round(100.0 * busyAll / (now - start)) + " % seit Start (openWakeWord, gemessene Rechenzeit); Schranke: rechnet in "
                                + Math.round(100.0 * blocksWinRech / Math.max(1, blocksWin)) + " % der Zeit (Lautstärke offen "
                                + Math.round(100.0 * blocksWinLaut / Math.max(1, blocksWin)) + " %, Sprachfilter " + (vad != null ? "an" : "aus") + ")");
                        Prefs.setLast(ctx, "höchster Wert zuletzt: " + String.format(Locale.US, "%.2f", peak)
                                + " (löst ab " + String.format(Locale.US, "%.2f", threshold) + " aus)");
                    } catch (Throwable ignored) { }
                    winStart = now;
                    busyWin = 0;
                    blocksWin = 0;
                    blocksWinRech = 0;
                    blocksWinLaut = 0;
                    peak = 0f;
                }
            }
        } catch (final Throwable e) {
            if (run) main.post(() -> { try { l.onError(e instanceof Exception ? (Exception) e : new Exception(e)); } catch (Throwable ignored) { } });
        }
    }

    boolean stop() {
        run = false;
        Thread t = th;
        th = null;
        if (t != null) { try { t.join(1500); } catch (InterruptedException ignored) { } }
        AudioRecord a = ar;
        if (a != null) { try { a.stop(); } catch (Throwable ignored) { } }
        return true;
    }

    void shutdown() {
        run = false;
        AudioRecord a = ar;
        ar = null;
        if (a != null) { try { a.release(); } catch (Throwable ignored) { } }
    }
}
