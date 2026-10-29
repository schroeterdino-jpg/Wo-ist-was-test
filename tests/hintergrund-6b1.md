# Phase 6B.1: Visuelle Hintergrundtakte bei hidden pausieren

Ausgang: main `4b93261` (Phase 6A). Geändert: `js/mimik.js`, `js/holo_look.js`, `js/anzeige.js` (und die `?v=`-Stempel in `index.html`). Sicherheitsnetz: `node tests/hintergrund_6b1.js` (74 Prüfungen) und `node tests/hintergrund.js` (57).

## Untersuchte Kandidaten
| Kandidat | Befund beim Lesen des Codes | Entscheidung |
|---|---|---|
| mimik.js (120 ms) | `takt()` tut versteckt nichts (`bereit()` ist falsch, es wird höchstens einmal die Überlagerung gelöscht). Kein Speicher, kein Netz. | **geändert**: Takt pausiert versteckt wirklich (`clearInterval`), beim Sichtbarwerden Neustart |
| holo_look.js (700 ms) | nur `applyBody()` (Körper-Klassen) und `kick()` (Zeichenschleife). Rein Darstellung. | **geändert**: Pause; beim Sichtbarwerden einmal sofort `applyBody()` + `kick()` |
| anzeige.js (300 ms, Autoansicht) | `anwenden()` setzt nur Zoom/Klassen/Regler-Werte im DOM, kein Speicher, kein Netz, kein Native. | **geändert**: Pause; beim Sichtbarwerden einmal sofort prüfen |
| anzeige.js (400 ms, Schließen-Knopf) | blendet den Schließen-Knopf ein/aus. Rein Darstellung (in 6A noch "F, unklar", jetzt geklärt → C). | **geändert** (gemeinsam mit dem 300-ms-Takt, eine Steuerfunktion) |
| laune.js:160 (14 s) | `faceTick()` ruft `ensure()` auf. Das würfelt bei abgelaufener Laune eine **neue Stimmung und speichert sie** (`roll → setMood → save`). Mehr als Darstellung. | **aus dem Umfang genommen** (Auftrag Punkt 10), Code unverändert |
| UI-Schreibmaschine (ui.js#1–4) | `setTimeout`-Ketten, die nur während einer Schreibanimation laufen und am Textende enden. Im Leerlauf kein Takt. | **kein Kandidat**, nicht geändert |
| synapsen.js (200 ms) | in 6A als GRÜN geführt, aber mögliche nicht-visuelle Bedeutung nicht geklärt. | **bewusst zurückgestellt** (nicht angefasst) |

Kategorie A, alle Netzwerk-Poller, Native-Poller, Tagescheck: nicht angefasst (der Test vergleicht ihre statischen Merkmale Zeichen für Zeichen mit Phase 6A).

## Pause-Strategie (je Kandidat gleich, bewusst klein und lokal)
Echte Pause statt "Callback springt zurück": Bei `document.hidden` wird das Intervall mit `clearInterval` gestoppt, die Kennung auf 0 gesetzt; bei `visibilitychange` zu sichtbar startet höchstens ein neues Intervall (`if (!kennung)`). Kein gemeinsamer Helfer, kein Power-Manager, kein Patchen von `setInterval`: vier Dateien, je rund zehn Zeilen. Eine gemeinsame Hilfsfunktion hätte ein neues Skript und eine neue Ladereihenfolge-Abhängigkeit gebraucht, das lohnt für vier Timer nicht.
- **mimik.js**: beim Verstecken wird (wie bisher im ersten versteckten Takt) die Überlagerung einmal gelöscht. Der innere Zustand (`S`, `naechsteZuhoer`, …) wird versteckt weder früher noch jetzt verändert. Kein Sofort-Takt nötig: der nächste Takt kommt nach ≤120 ms wie vorher.
- **holo_look.js**: beim Sichtbarwerden sofort `applyBody()` und `kick()` (kick lief über `visibilitychange` schon vorher).
- **anzeige.js**: beim Sichtbarwerden sofort `autoTakt()` und `knopfTakt()` einmal, danach alter Takt. Die Reihenfolge der beiden Starts bleibt (400 ms vor 300 ms), damit die Register-Ids `anzeige.js#1/#2` und `tests/timer.js` unverändert bleiben.
- Startet die Seite versteckt, wird kein Takt angelegt, bis sie sichtbar wird.

## Messung (Chromium, dieselbe 60-s-Messung wie 6A: 10 s Start, 60 s Leerlauf)
| Größe | vorher (6A) | nachher (6B.1) |
|---|---|---|
| Rückrufe versteckt / 60 s | 1531 | **590** (−941, −61,5 %) |
| Rückrufe sichtbar / 60 s | 2260 | 2207 (die vier Takte gleich; Rest Schwankung der rAF-Kugel, unveränderter Code) |
| aktive Intervalle sichtbar (Start / nach 60 s) | 38 / 39 | 38 / 39 |
| aktive Intervalle versteckt | 39 | 35 (die vier pausierten fehlen) |
| nach Rückkehr / nach 10 Wechseln | – | 39 / 39 (keine Vermehrung) |
| Netzaufrufe sichtbar / versteckt | 190 / 0 | 190 / 0 |
| Native (setBusy) pro Minute | 200 | 200 |
| localStorage versteckt: set / get | 1 / 666 | 1 / 163 |

Wichtig: Gemessen wird Jarvis' eigene Sichtbarkeitslogik (`document.hidden` im Test gesteuert), nicht das Drosseln versteckter Tabs durch den Browser. Mimik und Avatar sind im Chromium-Test nicht messbar (der 3D-Kopf lädt von esm.sh); Mimik wird in der Prüfwelt (`tests/hintergrund_6b1_welt.js`, virtueller Kopf) geprüft.

## Prüfwelt (`tests/hintergrund_6b1_welt.js`, `…_szenarien.js`)
Je Kandidat: sichtbar 10 s, hidden 5 s → sichtbar, hidden 30 s mit Zustandsänderung → sichtbar, 10 schnelle Wechsel. Der alte Zustand ist in `tests/hintergrund_6b1_vorher.json` eingefroren (auf sauberem main `4b93261` gemessen, nicht überschreiben). Ergebnis: sichtbar identisch; versteckt 0 Rückrufe, 0 aktive Takte, 0 Schreibzugriffe, 0 Netz; Rückkehr stellt den Zustand sofort richtig; je 10 Wechsel gleiche Timeranzahl.
Einsparung in 30 s versteckt: mimik 250, holo_look 43, anzeige 175 Rückrufe.

## Alt gegen neu im Soll
`tests/hintergrund_soll_6a.json` (eingefroren) gegen `tests/hintergrund_soll.json`: genau vier Prozesse ändern sich, nur in den Feldern Start (ab Laden → in Steuerfunktion), Stop (nie gestoppt → clearInterval) und Doppelstart-Schutz (clear vor Neustart). `ms`, Klasse, Netz, Native bleiben gleich. Zwei Dateien hören neu auf `visibilitychange` (mimik, anzeige): 29 → 31. Die Tests `hintergrund.js` wurden gezielt angepasst: 29→31 Dateien, Doppelstart-Zahlen (einmalig beim Laden 47→44, ohne Schutz 17→16, clear vor Neustart 6→10), versteckt pausierte/weiterlaufende Takte, Mehrfachstarts im Lauf (vier Pausen-Takte je 12 Starts/11 Stopps). Messstand: `tests/hintergrund_laufzeit_6a.json` (alt, eingefroren) und `tests/hintergrund_laufzeit.json` (neu).

## Gegenproben A–J (in `tests/hintergrund_6b1.js`)
A Pause wieder entfernt, B zwei Timer beim Sichtbarwerden, C zehn Wechsel vermehren Timer, D Rückkehr aktualisiert Anzeige nicht, E Mimik nach Rückkehr eingefroren, F hidden schreibt Speicher, G hidden ruft Netz auf, H Kategorie-A-Timer verändert (3 Fälle, statisch), I sichtbare Frequenz verändert (2 Fälle), J nur `if(hidden)return` bei weiterlaufendem Timer. Jede wird aus dem erwarteten Grund rot; Kontrollen (unverändert, Kommentar) bleiben grün.

## Bekannte Grenzen
Kein echter Hintergrund-Tab; Mimik/Avatar nur in der Prüfwelt; bei Wechseln schneller als 120 ms kommt der Mimik-Takt nicht zum Zug (kein echter Fall); nach der Rückkehr beginnt die Taktphase neu (≤ ein Takt Verschiebung).
