# Langzeit-Suche und Aufräumen (Phase 5D.1)

Netz: `node tests/suche.js` (Soll: `suche_soll.json`, neu schreiben mit `--schreiben`). `suche_vorher.json` ist die Messung VOR dem Umbau (`--vorher`, nur zum Nachlesen, wird nicht verglichen).
Gemessen mit der echten `api/memory.js` und einem Attrappen-Vektorspeicher in der echten Skript-Reihenfolge. Die Ähnlichkeit ist ein Stellvertreter (Stichwörter): geprüft wird, was die App mit den Treffern macht, nicht die Güte der echten Vektorsuche.

## Vorher (Phase 5C-Stand) → nachher
| Punkt | vorher | nachher |
|---|---|---|
| Suche | `assistant.js` (aktiv) und `langzeit.js` (tot, wurde überschrieben) | nur `assistant.js`; Zusatzquellen über `window.jvSuchQuellen` |
| Filter nach Eintragsart | keiner (aktiv) / nur "episode" (tot) | keiner |
| Gesamtliste `listall` | nie (aktiv) / bei jedem Wortanfang "morgen/heute/vor…/los…/termin…" (tot) | nur bei echter Planungsfrage mit Zeitraum (oder Schulfrage), höchstens eine pro Frage |
| Langsame Gesamtliste | alles verloren (tote Fassung) | Treffer bleiben, Wartezeit höchstens 1 s |
| Stundenplan | tote Hülle | Zusatzquelle, teilt die eine Gesamtliste |
| Aufräumen (neue Geräte) | löschte alles ohne typ episode/frist (Merk-dir!) | löscht nur leeren Text ohne Angaben |
| Zeilenformat | reiner Text | Erlebnisse: `Kategorie: Text (erzählt am …)`; Pläne: `GEPLANT/GEBURTSTAG/FRIST am …` |

## Sollwert-Änderungen anderer Suiten (einzeln begründet)
- `globale_soll.json`: (1) Eintrag `assistant.js -> searchSemanticMemory` entfällt (die Funktion überschreibt keine Zuweisung aus `langzeit.js` mehr); (2) `load -> searchSemanticMemory` steht jetzt hinter `load -> jvFristHinweis` (gleiche Datei `ki_mitdenken.js`, nur Reihenfolge der Aufzählung); (3) Sonderprobe "langzeit.js NACH assistant.js" ist jetzt `identisch` (Reihenfolgeunabhängigkeit ist das Ziel).
- `wirkungslos`: Teile A–C (tote Suche, Aufräumen alt, Stundenplan-Hülle) entfernt, da der gemessene Code nicht mehr existiert (ersetzt durch `suche.js`); Teile D–E (festnamen/hoerkorrektur) unverändert und identisch (Soll-Schlüssel regeln/lernen/eingaben/lokalerText/textfluss gleich).

## Gegenproben (in `suche.js`)
A alter Episoden-Filter · B altes Aufräumen · C Wetter morgen löst listall aus · D Planungsfrage ohne Zeitweg · E langsame Gesamtliste verliert Treffer · F Dublette doppelt · G Zweitschlüssel nicht gefunden · H Kündigung nicht gefunden · I zweite Gesamtliste durch Stundenplan · J alte konkurrierende Fassung.
