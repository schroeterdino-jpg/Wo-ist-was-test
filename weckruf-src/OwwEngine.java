package de.dino.zaneweckruf;

import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtSession;
import ai.onnxruntime.TensorInfo;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;
import java.util.Collections;
import java.util.Random;

/**
 * openWakeWord (freie Weckwort-Erkennung, Apache 2.0) in reinem Java mit ONNX Runtime.
 * Umsetzung der Python-Vorlage (utils.AudioFeatures und Model.predict): Pro Block von 80 ms (1280 Samples, 16 kHz)
 * laufen drei kleine Modelle: Mel-Spektrogramm -> Sprach-Merkmale (96 Zahlen) -> Weckwort-Modell (letzte 16 Merkmale).
 * Enthält bewusst nichts von Android, damit der Test im GitHub-Build dieselbe Klasse gegen die Python-Vorlage prüfen kann.
 */
final class OwwEngine implements AutoCloseable {
    static final int CHUNK = 1280;
    private static final int NACHLAUF = 160 * 3;   // so viele Samples des vorigen Blocks gehören zum Mel-Fenster dazu
    private static final int MEL_FRAMES = 76;
    private static final int MEL_BINS = 32;
    private static final int EMB = 96;
    private static final int WARMUP = 24;          // Blöcke Rauschen zum Auffüllen der Puffer (wie die Vorlage beim Start)

    private final OrtEnvironment env;
    private final OrtSession mel, emb, cls;
    private final String melIn, embIn, clsIn;
    private final int clsFrames;
    private final float[] melBuf = new float[MEL_FRAMES * MEL_BINS];
    private final float[] feat;                    // clsFrames x 96, ältester zuerst
    private final short[] tail = new short[NACHLAUF];
    private int tailN = 0;
    private final FloatBuffer embInput = direct(MEL_FRAMES * MEL_BINS);
    private final FloatBuffer clsInput;

    OwwEngine(byte[] melModel, byte[] embModel, byte[] wakeModel) throws Exception {
        env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions so = new OrtSession.SessionOptions();
        so.setIntraOpNumThreads(1);   // ein Kern reicht und spart Strom
        so.setInterOpNumThreads(1);
        mel = env.createSession(melModel, so);
        emb = env.createSession(embModel, so);
        cls = env.createSession(wakeModel, so);
        melIn = mel.getInputNames().iterator().next();
        embIn = emb.getInputNames().iterator().next();
        clsIn = cls.getInputNames().iterator().next();
        long[] shape = ((TensorInfo) cls.getInputInfo().get(clsIn).getInfo()).getShape();
        clsFrames = (int) shape[1];
        feat = new float[clsFrames * EMB];
        clsInput = direct(clsFrames * EMB);
        reset();
    }

    private static FloatBuffer direct(int n) {
        return ByteBuffer.allocateDirect(4 * n).order(ByteOrder.nativeOrder()).asFloatBuffer();
    }

    /** Puffer zurücksetzen und mit leisem Rauschen auffüllen, damit es keine falschen Treffer direkt nach dem Start gibt. */
    void reset() throws Exception {
        java.util.Arrays.fill(melBuf, 1f);
        java.util.Arrays.fill(feat, 0f);
        tailN = 0;
        Random rnd = new Random(1234);
        short[] noise = new short[CHUNK];
        for (int k = 0; k < WARMUP; k++) {
            for (int i = 0; i < CHUNK; i++) noise[i] = (short) (rnd.nextInt(2000) - 1000);
            process(noise);
        }
    }

    /** Nach einer Pause (Stille-Schranke): Puffer leeren, ohne Rauschen zu rechnen. Danach den Vorlauf mit echtem Ton einspeisen. */
    void softReset() {
        java.util.Arrays.fill(melBuf, 1f);
        java.util.Arrays.fill(feat, 0f);
        tailN = 0;
    }

    /** Ein Block von genau 1280 Samples (16 Bit, mono, 16 kHz). Liefert den Wert 0..1 für "Weckwort gehört". */
    float process(short[] chunk) throws Exception {
        // 1. Mel-Spektrogramm über (Nachlauf des letzten Blocks + neuer Block)
        int n = tailN + CHUNK;
        FloatBuffer in = direct(n);
        for (int i = 0; i < tailN; i++) in.put(tail[i]);
        for (int i = 0; i < CHUNK; i++) in.put(chunk[i]);
        in.rewind();
        float[] spec;
        try (OnnxTensor t = OnnxTensor.createTensor(env, in, new long[]{1, n});
             OrtSession.Result r = mel.run(Collections.singletonMap(melIn, t))) {
            FloatBuffer o = ((OnnxTensor) r.get(0)).getFloatBuffer();
            spec = new float[o.remaining()];
            o.get(spec);
        }
        for (int i = 0; i < spec.length; i++) spec[i] = spec[i] / 10f + 2f;   // dieselbe Umrechnung wie die Vorlage
        int len = spec.length;
        if (len >= melBuf.length) {
            System.arraycopy(spec, len - melBuf.length, melBuf, 0, melBuf.length);
        } else {
            System.arraycopy(melBuf, len, melBuf, 0, melBuf.length - len);
            System.arraycopy(spec, 0, melBuf, melBuf.length - len, len);
        }
        System.arraycopy(chunk, CHUNK - NACHLAUF, tail, 0, NACHLAUF);
        tailN = NACHLAUF;

        // 2. Sprach-Merkmale aus den letzten 76 Mel-Zeilen
        embInput.rewind();
        embInput.put(melBuf);
        embInput.rewind();
        float[] e = new float[EMB];
        try (OnnxTensor t = OnnxTensor.createTensor(env, embInput, new long[]{1, MEL_FRAMES, MEL_BINS, 1});
             OrtSession.Result r = emb.run(Collections.singletonMap(embIn, t))) {
            FloatBuffer o = ((OnnxTensor) r.get(0)).getFloatBuffer();
            o.get(e, 0, EMB);
        }
        System.arraycopy(feat, EMB, feat, 0, feat.length - EMB);
        System.arraycopy(e, 0, feat, feat.length - EMB, EMB);

        // 3. Weckwort-Modell über die letzten 16 Merkmale
        clsInput.rewind();
        clsInput.put(feat);
        clsInput.rewind();
        try (OnnxTensor t = OnnxTensor.createTensor(env, clsInput, new long[]{1, clsFrames, EMB});
             OrtSession.Result r = cls.run(Collections.singletonMap(clsIn, t))) {
            return ((OnnxTensor) r.get(0)).getFloatBuffer().get(0);
        }
    }

    @Override
    public void close() {
        try { mel.close(); } catch (Throwable ignored) { }
        try { emb.close(); } catch (Throwable ignored) { }
        try { cls.close(); } catch (Throwable ignored) { }
    }
}
