"""Referenz für die Sprach-Schranke: Silero VAD (16-kHz-Modell) mit onnxruntime, Logik wie OnnxWrapper in silero_vad/utils_vad.py.
Schreibt die Werte je 512-Samples-Stück von t/vad_test.wav (erste 30 s) nach t/vad_python.csv. Aufruf: python vad_referenz.py <Ordner>"""
import sys, wave
import numpy as np
import onnxruntime as ort

d = sys.argv[1]
o = ort.SessionOptions(); o.intra_op_num_threads = 1; o.inter_op_num_threads = 1
s = ort.InferenceSession(d + '/models/vad.onnx', sess_options=o, providers=['CPUExecutionProvider'])
w = wave.open(d + '/vad_test.wav')
assert w.getframerate() == 16000 and w.getnchannels() == 1 and w.getsampwidth() == 2
x = np.frombuffer(w.readframes(16000 * 30), dtype=np.int16)
st = np.zeros((2, 1, 128), np.float32); ctx = np.zeros(64, np.float32)
with open(d + '/vad_python.csv', 'w') as f:
    for i in range(0, len(x) - 511, 512):
        c = (x[i:i + 512].astype(np.float32) / 32768.0)
        inp = np.concatenate([ctx, c])[None, :].astype(np.float32)
        p, st = s.run(None, {'input': inp, 'state': st, 'sr': np.array(16000, dtype=np.int64)})
        ctx = inp[0, -64:]
        f.write('%d,%.6f\n' % (i // 512, p[0, 0]))
print('Python-Referenz geschrieben')
