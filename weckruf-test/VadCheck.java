package de.dino.zaneweckruf;

import java.io.File;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Paths;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;

/**
 * Prüfung im GitHub-Build: lässt die Java-Umsetzung der Sprach-Schranke (OwwVad) auf einem Sprachbeispiel laufen
 * und schreibt die Werte je 512-Samples-Stück nach vad_java.csv. Der Vergleich mit der Python-Vorlage folgt im Ablauf.
 * Gefüttert wird in 1280er-Blöcken wie in der App (nicht passend zu 512, damit auch die Zwischenpuffer geprüft werden).
 * Aufruf: VadCheck <Ordner mit models/vad.onnx und vad_test.wav>
 */
public class VadCheck {
    public static void main(String[] a) throws Exception {
        String d = a[0];
        byte[] model = Files.readAllBytes(Paths.get(d, "models", "vad.onnx"));
        short[] clip = lies(new File(d, "vad_test.wav"));
        int n = Math.min(clip.length, 16000 * 30);
        try (OwwVad v = new OwwVad(model); PrintWriter w = new PrintWriter(new File(d, "vad_java.csv"))) {
            short[] block = new short[1280];
            int idx = 0;
            long t0 = System.nanoTime();
            // jedes fertige 512er-Stück einzeln ausgeben: dazu in Blöcken füttern, aber die Werte einzeln mitschreiben
            OwwVad[] einzel = {v};
            for (int i = 0; i + 512 <= n; i += 512) {
                System.arraycopy(clip, i, block, 0, 512);
                float p = einzel[0].feed(block, 512);
                w.println(idx + "," + p);
                idx++;
            }
            System.out.println("VAD: " + idx + " Stücke, " + (System.nanoTime() - t0) / 1_000 / Math.max(1, idx) + " µs pro Stück (Rechner, nicht Handy)");
        }
        // zweiter Lauf mit 1280er-Blöcken: der höchste Wert je Block muss dem Maximum der enthaltenen 512er-Stücke aus dem ersten Lauf entsprechen
        try (OwwVad v = new OwwVad(model); PrintWriter w = new PrintWriter(new File(d, "vad_java_bloecke.csv"))) {
            short[] block = new short[1280];
            int emitted = 0, pos = 0;
            for (int i = 0; i + 1280 <= n; i += 1280) {
                System.arraycopy(clip, i, block, 0, 1280);
                float p = v.feed(block, 1280);
                pos += 1280;
                int done = pos / 512;
                w.println(emitted + "," + done + "," + p);
                emitted = done;
            }
        }
    }

    private static short[] lies(File f) throws Exception {
        try (AudioInputStream in = AudioSystem.getAudioInputStream(f)) {
            if (in.getFormat().getSampleRate() != 16000f || in.getFormat().getChannels() != 1 || in.getFormat().getSampleSizeInBits() != 16)
                throw new IllegalStateException("Erwartet 16 kHz, mono, 16 Bit: " + in.getFormat());
            byte[] b = in.readAllBytes();
            short[] s = new short[b.length / 2];
            for (int i = 0; i < s.length; i++) s[i] = (short) ((b[2 * i] & 0xff) | (b[2 * i + 1] << 8));
            return s;
        }
    }
}
