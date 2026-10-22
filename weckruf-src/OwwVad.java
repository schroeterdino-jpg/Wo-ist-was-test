package de.dino.zaneweckruf;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.nio.LongBuffer;
import java.util.HashMap;
import java.util.Map;

/**
 * Sprach-Erkennung (Silero VAD, MIT-Lizenz, 16-kHz-Modell): sagt für je 32 ms Ton (512 Samples), wie sicher es menschliche Sprache ist (0..1).
 * Maschinen, Motoren, Rauschen und Musik liegen weit darunter. Die Weckwort-Erkennung rechnet darum nur noch, wenn jemand spricht,
 * und nicht mehr bei jedem Lärm. Enthält bewusst nichts von Android, damit der Test im GitHub-Build dieselbe Klasse prüfen kann.
 * Umsetzung der Vorlage (OnnxWrapper in silero_vad/utils_vad.py): vor jedem Stück kommen die letzten 64 Samples des vorigen Stücks.
 */
final class OwwVad implements AutoCloseable {
    static final int CHUNK = 512;
    private static final int CTX = 64;
    private static final int STATE = 2 * 128;

    private final OrtEnvironment env;
    private final OrtSession sess;
    private final float[] state = new float[STATE];
    private final float[] ctx = new float[CTX];
    private final float[] buf = new float[CHUNK];
    private int n = 0;
    private final FloatBuffer in = direct(CTX + CHUNK);
    private final FloatBuffer st = direct(STATE);
    private final LongBuffer sr;

    OwwVad(byte[] model) throws Exception {
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions so = new OrtSession.SessionOptions();
        so.setIntraOpNumThreads(1);
        so.setInterOpNumThreads(1);
        sess = env.createSession(model, so);
        sr = ByteBuffer.allocateDirect(8).order(ByteOrder.nativeOrder()).asLongBuffer();
        sr.put(16000L);
        sr.rewind();
        reset();
    }

    private static FloatBuffer direct(int n) {
        return ByteBuffer.allocateDirect(4 * n).order(ByteOrder.nativeOrder()).asFloatBuffer();
    }

    /** Gedächtnis löschen (nach einer Pause im Ton). */
    void reset() {
        java.util.Arrays.fill(state, 0f);
        java.util.Arrays.fill(ctx, 0f);
        n = 0;
    }

    /** Ton einspeisen (16 Bit, 16 kHz, mono). Rückgabe: der höchste Wert der dabei fertig gewordenen 32-ms-Stücke, oder -1, wenn keins fertig wurde. */
    float feed(short[] a, int len) throws Exception {
        float best = -1f;
        for (int i = 0; i < len; i++) {
            buf[n++] = a[i] / 32768f;
            if (n == CHUNK) {
                float p = run();
                if (p > best) best = p;
                n = 0;
            }
        }
        return best;
    }

    private float run() throws Exception {
        in.rewind();
        in.put(ctx);
        in.put(buf);
        in.rewind();
        st.rewind();
        st.put(state);
        st.rewind();
        sr.rewind();
        Map<String, OnnxTensor> m = new HashMap<>();
        try (OnnxTensor ti = OnnxTensor.createTensor(env, in, new long[]{1, CTX + CHUNK});
             OnnxTensor ts = OnnxTensor.createTensor(env, st, new long[]{2, 1, 128});
             OnnxTensor tr = OnnxTensor.createTensor(env, sr, new long[0])) {
            m.put("input", ti);
            m.put("state", ts);
            m.put("sr", tr);
            try (OrtSession.Result r = sess.run(m)) {
                float p = ((OnnxTensor) r.get(0)).getFloatBuffer().get(0);
                ((OnnxTensor) r.get(1)).getFloatBuffer().get(state, 0, STATE);
                System.arraycopy(buf, CHUNK - CTX, ctx, 0, CTX);
                return p;
            }
        }
    }

    @Override
    public void close() {
        try { sess.close(); } catch (Throwable ignored) { }
    }
}
