package de.dino.zaneweckruf;

import java.io.File;
import java.io.PrintWriter;
import java.nio.file.Files;
import java.nio.file.Paths;
import javax.sound.sampled.AudioInputStream;
import javax.sound.sampled.AudioSystem;

/**
 * Prüfung im GitHub-Build: lässt die Java-Umsetzung (OwwEngine) auf echten Sprachbeispielen laufen und schreibt die Werte
 * je 80-ms-Block in eine CSV-Datei. vergleich.py hält sie gegen die Werte der Python-Vorlage von openWakeWord.
 * Aufruf: OwwCheck <Ordner mit models/ und den wav-Dateien>
 */
public class OwwCheck {
    public static void main(String[] a) throws Exception {
        String d = a[0];
        String[][] paare = {{"alexa_test", "alexa_v0.1"}, {"hey_mycroft_test", "hey_mycroft_v0.1"}};
        byte[] mel = Files.readAllBytes(Paths.get(d, "models", "melspectrogram.onnx"));
        byte[] emb = Files.readAllBytes(Paths.get(d, "models", "embedding_model.onnx"));
        for (String[] p : paare) {
            byte[] wake = Files.readAllBytes(Paths.get(d, "models", p[1] + ".onnx"));
            short[] clip = lies(new File(d, p[0] + ".wav"));
            int pad = 4 * 16000;   // 4 s Stille davor und danach, wie padding=4 in der Python-Vorlage
            short[] data = new short[pad + clip.length + pad];
            System.arraycopy(clip, 0, data, pad, clip.length);
            try (OwwEngine eng = new OwwEngine(mel, emb, wake); PrintWriter w = new PrintWriter(new File(d, "java_" + p[0] + ".csv"))) {
                short[] block = new short[OwwEngine.CHUNK];
                int idx = 0;
                long t0 = System.nanoTime();
                for (int i = 0; i < data.length - OwwEngine.CHUNK; i += OwwEngine.CHUNK) {   // wie predict_clip: letzter Teilblock entfällt
                    System.arraycopy(data, i, block, 0, OwwEngine.CHUNK);
                    w.println(idx + "," + eng.process(block));
                    idx++;
                }
                System.out.println(p[0] + ": " + idx + " Blöcke, " + (System.nanoTime() - t0) / 1_000_000 / Math.max(1, idx) + " ms pro Block (Rechner, nicht Handy)");
            }
        }
    }

    private static short[] lies(File f) throws Exception {
        try (AudioInputStream in = AudioSystem.getAudioInputStream(f)) {
            if (in.getFormat().getSampleRate() != 16000f || in.getFormat().getChannels() != 1 || in.getFormat().getSampleSizeInBits() != 16)
                throw new IllegalStateException("Erwartet 16 kHz, mono, 16 Bit: " + in.getFormat());
            byte[] b = in.readAllBytes();
            short[] s = new short[b.length / 2];
            for (int i = 0; i < s.length; i++) s[i] = (short) ((b[2 * i] & 0xff) | (b[2 * i + 1] << 8));   // little endian
            return s;
        }
    }
}
