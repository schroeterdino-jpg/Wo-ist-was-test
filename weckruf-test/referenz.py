"""Referenz: die Python-Vorlage von openWakeWord auf denselben Sprachbeispielen. Aufruf: python referenz.py <Ordner>"""
import sys
import wave

import numpy as np
from openwakeword.model import Model

d = sys.argv[1]
for clip, modell in [("alexa_test", "alexa_v0.1"), ("hey_mycroft_test", "hey_mycroft_v0.1")]:
    m = Model(
        wakeword_models=[f"{d}/models/{modell}.onnx"],
        inference_framework="onnx",
        melspec_model_path=f"{d}/models/melspectrogram.onnx",
        embedding_model_path=f"{d}/models/embedding_model.onnx",
    )
    w = wave.open(f"{d}/{clip}.wav")
    daten = np.frombuffer(w.readframes(w.getnframes()), dtype=np.int16)
    preds = m.predict_clip(daten, padding=4)
    key = list(preds[0].keys())[0]
    with open(f"{d}/py_{clip}.csv", "w") as f:
        for i, p in enumerate(preds):
            f.write(f"{i},{float(p[key])}\n")
    print(clip, len(preds), "Blöcke, höchster Wert", max(float(p[key]) for p in preds))
