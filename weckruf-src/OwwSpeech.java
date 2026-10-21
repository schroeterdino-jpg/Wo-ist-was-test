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
 */
class OwwSpeech {
    interface Listener {
        void onWake(float score);
        void onError(Exception e);
    }

    private static final int RATE = 16000;

    private final Context ctx;
    private final OwwEngine eng;
    private final float threshold;
    private final Handler main = new Handler(Looper.getMainLooper());
    private AudioRecord ar;
    private Thread th;
    private volatile boolean run = false;

    OwwSpeech(Context ctx, OwwEngine eng, float threshold) {
        this.ctx = ctx.getApplicationContext();
        this.eng = eng;
        this.threshold = threshold;
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
                long t0 = System.nanoTime();
                float score = eng.process(block);
                long t1 = System.nanoTime();
                busyAll += t1 - t0;
                busyWin += t1 - t0;
                if (score > peak) peak = score;
                if (sperre > 0) sperre--;
                else if (score >= threshold) {
                    sperre = 25;   // 2 s Ruhe nach einem Treffer
                    try { Prefs.setLast(ctx, "erkannt: " + String.format(Locale.US, "%.2f", score)); } catch (Throwable ignored) { }
                    final float s = score;
                    main.post(() -> { try { l.onWake(s); } catch (Throwable ignored) { } });
                }
                if (t1 - winStart >= 10_000_000_000L) {   // alle 10 Sekunden: Messwerte für die Einstellungen
                    try {
                        Prefs.setStat(ctx, Math.round(100.0 * busyWin / (t1 - winStart)) + " % zuletzt, "
                                + Math.round(100.0 * busyAll / (t1 - start)) + " % seit Start (openWakeWord, gemessene Rechenzeit)");
                        Prefs.setLast(ctx, "höchster Wert zuletzt: " + String.format(Locale.US, "%.2f", peak)
                                + " (löst ab " + String.format(Locale.US, "%.2f", threshold) + " aus)");
                    } catch (Throwable ignored) { }
                    winStart = t1;
                    busyWin = 0;
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
