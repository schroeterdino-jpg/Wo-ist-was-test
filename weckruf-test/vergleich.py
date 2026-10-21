"""Vergleicht die Werte der Java-Umsetzung mit der Python-Vorlage. Aufruf: python vergleich.py <Ordner>. Endet mit Fehler, wenn sie abweichen."""
import sys

d = sys.argv[1]
ok = True


def lies(pfad):
    return [float(z.split(",")[1]) for z in open(pfad).read().split("\n") if z.strip()]


for clip in ["alexa_test", "hey_mycroft_test"]:
    py = lies(f"{d}/py_{clip}.csv")
    ja = lies(f"{d}/java_{clip}.csv")
    if len(py) != len(ja):
        print(clip, "FEHLER: unterschiedliche Anzahl Blöcke", len(py), len(ja))
        ok = False
        continue
    abw = max(abs(a - b) for a, b in zip(py, ja))
    print(f"{clip}: höchster Wert Python {max(py):.3f}, Java {max(ja):.3f}, größte Abweichung {abw:.4f}")
    if abw > 0.02:
        print("  FEHLER: Abweichung größer als 0,02")
        ok = False
    if max(py) < 0.5 or max(ja) < 0.5:
        print("  FEHLER: das Weckwort wurde nicht erkannt (höchster Wert unter 0,5)")
        ok = False
sys.exit(0 if ok else 1)
