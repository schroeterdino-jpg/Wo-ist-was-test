# Phase 7B – Zeitfrage und Lesefehler von helfer_memory

Zwei Produktzeilen, sonst nichts. Ausgangs-HEAD: main 2f53a0d. Prüfung: `node tests/memory7b.js` (109 Prüfungen), Golden Master `tests/memory7b_soll.json` (vorher + nachher), Chromium-Messstand `tests/memory7b_laufzeit.json` (`node tests/memory7b_messen.js`).
Der alte Phase-7A-Golden-Master (`tests/memory7a_soll.json`) bleibt unverändert; `tests/memory7a.js` baut den Zustand vor 7B mit `tests/memory7b_alt.js` im Speicher nach und prüft ihn weiter (75 Prüfungen).

## Teil A – Zeitfrage
- **Besitzer:** `answer(term)` in `js/gedaechtnis_zeit.js`. Sie nahm `searchMemory(term)[0]`.
- **Ursache:** `searchMemory` liefert alle Treffer (Teilwort in beide Richtungen) in Speicherreihenfolge. Stand „schlüssel“ vor „zweitschlüssel“, gewann der kürzere Name.
- **Korrektur (1 Zeile):** erst der Eintrag, dessen Name nach trim/Kleinschreibung/Leerzeichen-Zusammenfassung genau der Frage entspricht (ohne unscharfe Treffer); sonst wie bisher der erste Treffer.
- `searchMemory()` selbst ist **nicht** verändert. Andere Aufrufer: `assistant.js` (Suchaktion) und `proaktiv.js` (Vorschläge), beide unverändert.
- Kein Fuzzy, keine KI-Suche; Tippfehler-Treffer (unscharf) werden weiter nicht lokal beantwortet.
- Vorher → nachher: Frage „Zweitschlüssel“ bei „schlüssel“ + „zweitschlüssel“: „Schlüssel, …“ → „Zweitschlüssel, …“. Gleiches Muster in 8 Fällen (auch andere Reihenfolge, Großschreibung, Umlaute, Bindestrich, Leerzeichen, mehrere ähnliche Namen, ohne Zeitstempel). Unverändert: nur Teilwort, mehrere Teilwort-Treffer (erster), kein Treffer, ähnlicher Begriff, Tippfehler, zwei gleiche Namen (erster, stabil).

## Teil B – Lesefehler
- **Besitzer:** `js/storage.js`, Start von `memoryItems` (`JSON.parse` ohne Schutz).
- **Ursache:** ein ungültiger Wert in `helfer_memory` warf beim Laden und brach das ganze Skript ab: `memoryItems`, Kontakte, Briefing, Parkplatz, Heimadresse, `chatHistory` (Tageslog) blieben undefiniert.
- **Korrektur (1 Zeile):** nur dieser eine Lesevorgang fängt den Fehler ab, das Gedächtnis startet leer, eine Warnung steht in der Konsole.
- Der kaputte Originalwert bleibt unverändert (kein `removeItem`, kein Überschreiben, keine neuen Schreibzugriffe, keine Reparatur, kein Sync-Eingriff). Gültige, leere, fehlende und Array-Werte verhalten sich wie vorher.
- Restpunkt: andere Schlüssel in `storage.js` (z. B. Kontakte) sind weiter ungeschützt – nicht Teil von 7B. Schreibt der Nutzer später einen neuen Gedächtnis-Eintrag, ersetzt dieser den kaputten Wert (Nutzeraktion, wie jedes Speichern). Der Datenabgleich verhält sich wie vorher (guter Server-Stand ersetzt den kaputten lokalen Wert).

## Nicht geändert
`memoryItems`-Architektur, Proxy, 3000-ms-Takt, Sync, `/api/memory`, Server, Android, Schlüsselnamen.
