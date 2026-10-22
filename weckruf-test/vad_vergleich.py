"""Vergleicht die Werte der Java-Sprach-Schranke mit der Python-Vorlage. Aufruf: python vad_vergleich.py <Ordner>"""
import sys
import numpy as np
d = sys.argv[1]
py = np.loadtxt(d + '/vad_python.csv', delimiter=',')[:, 1]
ja = np.loadtxt(d + '/vad_java.csv', delimiter=',')[:, 1]
n = min(len(py), len(ja))
diff = np.abs(py[:n] - ja[:n]).max()
print('Stücke: Python %d, Java %d, größte Abweichung %.6f' % (len(py), len(ja), diff))
print('Sprache (>0.35) in %.0f %% der Stücke' % (100 * np.mean(py[:n] > 0.35)))
bl = np.loadtxt(d + '/vad_java_bloecke.csv', delimiter=',')
# Block-Läufe: höchster Wert je Block muss das Maximum der in diesem Block fertig gewordenen Stücke sein
bad = 0
for row in bl:
    a, b, p = int(row[0]), int(row[1]), row[2]
    if b > a:
        if abs(max(ja[a:b]) - p) > 1e-4: bad += 1
    elif p != -1: bad += 1
print('Blöcke mit falschem Höchstwert:', bad, 'von', len(bl))
ok = diff < 1e-3 and bad == 0 and abs(len(py) - len(ja)) <= 1
print('ERGEBNIS:', 'in Ordnung' if ok else 'ABWEICHUNG')
sys.exit(0 if ok else 1)
