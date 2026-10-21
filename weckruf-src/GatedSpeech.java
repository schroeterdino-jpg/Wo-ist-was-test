package de.dino.zaneweckruf;

import android.media.AudioFormat;
import android.media.AudioRecord;
import android.media.MediaRecorder;
import android.os.Handler;
import android.os.Looper;
import android.os.Process;

import org.vosk.Recognizer;
import org.vosk.android.RecognitionListener;

/**
 * Ersatz für Vosk-SpeechService, der Strom spart: Das Mikrofon läuft weiter, aber die Spracherkennung rechnet nur,
 * wenn es hörbar lauter ist als die Umgebung (mit 0,5 Sekunden Vorlauf, damit der Anfang von "Hey" nicht fehlt).
 * In ruhigen Zeiten wird so fast nichts gerechnet. In sehr lauter Umgebung (Auto) rechnet er wie bisher durchgehend.
 */
class GatedSpeech {
    private static final int CHUNK_MS = 100;
    private static final int VORLAUF = 5;        // 5 x 100 ms
    private static final int NACHLAUF = 12;      // 1,2 s Stille nach der letzten Lautstärke, dann Ergebnis abholen

    private final android.content.Context ctx;
    private final Recognizer rec;
    private final int rate;
    private final Handler main = new Handler(Looper.getMainLooper());
    private AudioRecord ar;
    private Thread th;
    private volatile boolean run = false;

    GatedSpeech(android.content.Context ctx, Recognizer rec, float rate) {
        this.ctx = ctx.getApplicationContext();
        this.rec = rec;
        this.rate = (int) rate;
    }

    boolean startListening(final RecognitionListener l) {
        if (run) return false;
        int min = AudioRecord.getMinBufferSize(rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT);
        int buf = Math.max(min, rate * 2);   // mind. 1 s Puffer (Bytes)
        ar = new AudioRecord(MediaRecorder.AudioSource.VOICE_RECOGNITION, rate, AudioFormat.CHANNEL_IN_MONO, AudioFormat.ENCODING_PCM_16BIT, buf);
        if (ar.getState() != AudioRecord.STATE_INITIALIZED) {
            try { ar.release(); } catch (Throwable ignored) { }
            ar = null;
            throw new RuntimeException("Mikrofon nicht verfügbar");
        }
        run = true;
        ar.startRecording();
        th = new Thread(() -> loop(l), "zane-lauschen");
        th.start();
        return true;
    }

    private void melde(final RecognitionListener l, final String json) {
        main.post(() -> { try { l.onResult(json); } catch (Throwable ignored) { } });
    }

    private void loop(final RecognitionListener l) {
        try { Process.setThreadPriority(Process.THREAD_PRIORITY_AUDIO); } catch (Throwable ignored) { }
        final int chunk = rate * CHUNK_MS / 1000;
        short[] cur = new short[chunk];
        short[][] ring = new short[VORLAUF][chunk];
        int ringN = 0, ringPos = 0;       // ringPos: Platz für den nächsten Block
        double boden = 60;                // geschätzter Ruhepegel der Umgebung
        boolean rechnet = false;
        int still = 0, lautSerie = 0;
        long gesamt = 0, gerechnet = 0, fenster = 0, fensterRechnet = 0;
        try {
            while (run) {
                int n = ar.read(cur, 0, chunk);
                if (n < 0) throw new RuntimeException("Mikrofon-Fehler " + n);
                if (n == 0) continue;
                double sum = 0;
                for (int i = 0; i < n; i++) sum += (double) cur[i] * cur[i];
                double rms = Math.sqrt(sum / n);
                boolean laut = rms > boden * 2.2 + 60;
                if (!laut) { boden = Math.max(25, Math.min(3000, boden * 0.97 + rms * 0.03)); lautSerie = 0; }
                else if (++lautSerie > 30) boden = Math.min(3000, boden * 0.9 + rms * 0.1);   // seit über 3 s durchgehend laut: Dauerlärm (Fernseher, Auto), nicht "Hey Jarvis" - die Schranke passt sich an

                gesamt++; fenster++;
                if (rechnet) { gerechnet++; fensterRechnet++; }
                if (fenster >= 100) {   // alle 10 Sekunden: Messwert für die Einstellungen
                    try { Prefs.setStat(ctx, Math.round(100.0 * fensterRechnet / fenster) + " % zuletzt, " + Math.round(100.0 * gerechnet / gesamt) + " % seit Start"); } catch (Throwable ignored) { }
                    fenster = 0; fensterRechnet = 0;
                }
                if (!rechnet) {
                    if (laut) {
                        rechnet = true;
                        still = 0;
                        // Vorlauf in zeitlicher Reihenfolge einspeisen (ältester Block zuerst)
                        int start = ringN < VORLAUF ? 0 : ringPos;
                        for (int k = 0; k < ringN; k++) rec.acceptWaveForm(ring[(start + k) % VORLAUF], chunk);
                        ringN = 0;
                        ringPos = 0;
                        if (rec.acceptWaveForm(cur, n)) melde(l, rec.getResult());
                    } else {
                        System.arraycopy(cur, 0, ring[ringPos], 0, n);
                        ringPos = (ringPos + 1) % VORLAUF;
                        if (ringN < VORLAUF) ringN++;
                    }
                } else {
                    if (rec.acceptWaveForm(cur, n)) melde(l, rec.getResult());
                    if (laut) still = 0;
                    else if (++still >= NACHLAUF) {
                        melde(l, rec.getFinalResult());   // holt auch halbfertige Sätze ab und setzt zurück
                        rechnet = false;
                        still = 0;
                        ringN = 0;
                        ringPos = 0;
                    }
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
        if (t != null) { try { t.join(800); } catch (InterruptedException ignored) { } }
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
