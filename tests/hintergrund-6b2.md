# Phase 6B.2: Synapsen-200-ms-Takt

**Stufe A (Analyse):** `synapsen.js` hat einen 200-ms-Takt (`takt`). Er liest nur `isProcessing` und schaltet damit die Anzeige (Leinwand `#jvSynapsen`, Text `#jvSynText`) an oder aus. Er schreibt keinen Speicher, ruft weder Netz noch Native, KI, Sprache, Memory, Aktionen, Kalender noch proaktive Logik auf. Nur der Befehl "Synapsen an/aus" schreibt in den Speicher (außerhalb des Takts). Die Hülle um `sendToGroqSmart` ist getrennt und unverändert. Klasse: GRÜN.

**Stufe B:** versteckt `clearInterval`; sichtbar höchstens ein Takt, einmal sofort prüfen.

| | vorher | nachher |
|---|---|---|
| versteckt, 60 s (Chromium) | 590 Rückrufe | 290 |
| sichtbar, 60 s | 2207 | 2276 (Schwankung) |
| Netz sichtbar/versteckt | 190/0 | 190/0 |
| Prüfwelt versteckt 30 s | 150 Rückrufe | 0 |

Prüfung: `node tests/hintergrund_6b2.js`. Neu messen (lokal): `node tests/hintergrund_messen.js`.
