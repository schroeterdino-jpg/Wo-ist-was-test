# Sprache/TTS – Ist-Zustand und Golden Master (Phase 4, nur Tests)

Referenz: main `0df3afb`. Kein Produktcode geändert. Test: `node tests/sprache.js` (Soll: `tests/sprache_soll.json`, NEU; `--schreiben` friert neu ein).

## Speak-Kette heute (außen → innen, funktional)
teilen > kontext_lokal > fish > toene > sprueche > voicefix > voice (Basis).
Danach je nach Weg: `speakBrowser` (fish, pronunciation) / `speakAck` (fish, voicefix) / `fetchCloudSpeechBlob` (fish, pronunciation) / `getTtsEngine` (fish) – eigene Ketten.
Daneben: speechrate.js (patcht `speechSynthesis.speak` und `Audio`), voicefix (`startThinkingSound` stillgelegt), mehrfach.js (nur vorübergehend `window.speak`).

## Ladereihenfolge (index.html) – Vertauschungen
- identisch: voicefix/sprueche/toene/fish untereinander, kontext_lokal↔teilen, pronunciation↔voice/voicefix/fish/speechrate, speechrate↔voicefix/fish.
- verändert: voice.js mit jedem Wrapper (Basis muss innen sein); kontext_lokal und teilen mit voicefix/sprueche/toene(fish): sie sehen/merken dann anderen Text (korrigierter vs. unkorrigierter Satz); speechrate↔voice.
- pronunciation.js hängt erst bei DOMContentLoaded ein (im Browser immer außen).

## mehrfach.js
`window.speak` wird nur für die Dauer eines synchronen `jvCommands.nur(...)` ersetzt (Fang), `finally` stellt die alte Funktion immer wieder her (Erfolg, Exception, Promise-Rückgabe). Bekannte Eigenschaften (eingefroren): ein später Sprecher (setTimeout) entgeht dem Fang und spricht parallel/danach; ein fremder Austausch von `window.speak` im Fenster wird beim Rückbau überschrieben.

## Schnittstellen
Wer entscheidet OB: ruhe/C1/Meldungen (außerhalb der Kette). WAS: Aufrufer/Befehle. Ausführung: speak-Kette. Unterdrückungen innerhalb der Kette: voicefix (Zwischenansage während Sprechen), toene (nur mit Ton an, Entprellung 1500 ms), sprueche (Sperrliste, Länge, Zufall), voice.js (Generation/Aufnahme).
Nutzerunterbrechung: NICHT umgesetzt; möglicher Ansatzpunkt `interruptSpeaking()`/`speechGeneration` in voice.js.
