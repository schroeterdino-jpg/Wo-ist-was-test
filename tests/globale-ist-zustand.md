# Globale Wrapper und Ersetzungen: Ist-Zustand (Phase 5A, nur Analyse und Sicherheitsnetz)

Referenz: `main` bei `573abd3` (nach Phase 4B). Kein Produktcode wurde geändert. Das Sicherheitsnetz ist `tests/globale.js` mit dem Soll in `tests/globale_soll.json` (neu schreiben: `node tests/globale.js --schreiben`, nur nach bewusster Entscheidung; Unterschiede zeigt der Test selbst).

Gemessen wurde der aktuelle Code, nicht alte Berichte: Die App wird wie im Browser geladen (`document.readyState = 'loading'`, danach DOMContentLoaded, load, Zeitgeber). Nach jedem Skript und nach jeder Start-Phase wurde verglichen, welche globale Funktion durch eine andere ersetzt wurde. Zusätzlich: statische Suche in `js/*.js` und den fünf Inline-Skripten, Gegenprobe im echten Chromium (Playwright, lokal ausgeliefert).

## 1. Zahlen

- **138 Ersetzungen** globaler Funktionen (126 beim Laden der Skripte, 7 bei DOMContentLoaded, 4 bei load, 1 durch einen Zeitgeber) auf **61 Namen**.
- Davon **9 Namen mit bereits expliziter Kette** (Foto: 7 Funktionen, `executeAction`, `speak`), 4 reine Test-Attrappen der Umgebung (`apiFetch`, `Audio`, `openExtraWindow`, `jvCommandsUse`), **48 übrige Namen**.
- Statisch: 294 verschiedene `window.X =`-Namen, 16 davon aus mehr als einer Datei beschrieben, 5 Inline-Skripte (nur eines umhüllt etwas: `handleLocalCommand`).
- Die alten Schutzmarken (`_mailpush`, `_globalInfo65`, `_ortsuche`, `_contextPlus`, `_fishLach`, `_gedaechtnis`, `_festnamen`, `_hoerkorrektur`, `_jvSyn`, `_wx`, `_ki`, `__laune`, `_jvLage`, `_jvCommands`, `_jvChain`) werden **nur in der eigenen Datei** gelesen (Doppelwrap-Schutz). Ausnahme: `Object.keys`-Kopien (contextplus, fish, worldqueryfix, gedaechtnis) tragen die Marken der inneren Hüllen nach außen; das ist der Grund für die Ketten-Eigenheit bei `buildSystemPrompt` (Abschnitt 2).

## 2. buildSystemPrompt (ROT)

| Punkt | Befund |
|---|---|
| Basis | `prompt.js` (Funktionsdeklaration) |
| Hüllen innen → außen | `commands.js` (`jvChain`-Verteiler, Marke `_jvChain`, 10 Einträge Rang 100–500: formulierungen, langzeit, rechnungen, stundenplan, foto-person, termin-erinnern, geburtstag-ganztag, ki-mitdenken, sprueche, charakter) → `contextplus.js` (797) → `fish.js` (880, `_fishLach`) → `worldqueryfix.js` (882, `_globalInfo65`) → `gedaechtnis.js` (915, `_gedaechtnis`) → `name.js` (919, bloße Zuweisung ohne Marke) |
| Zwei Architekturen parallel | Ja: `jvChain` (Rang) und fünf direkte Hüllen (Ladereihenfolge) |
| Gespeicherte Referenzen | je Hülle eine Closure-Referenz auf die vorige; keine fremden Leser |
| Besonderheit | `contextplus.js` hängt sich beim Laden UND noch einmal per `setTimeout(install, 0)` ein. Der Schutz ist die Marke `_contextPlus`; `name.js` (außen) trägt sie nicht. Läuft der Zeitgeber vor `name.js`, bleibt es bei einer Hülle (echtes Chromium gemessen: Kontext+-Block 1×). Läuft er danach (jede Testumgebung), kommt der Block **2×** in die Anweisung (64142 statt 63238 Zeichen). Das Ergebnis hängt also vom Zeitpunkt des 0-ms-Zeitgebers ab. |
| Nebenwirkungen | keine (reiner Text), Storage nur lesend (`getHumanLevel`, `jvLaughWish`) |
| Fehlerverhalten | direkte Hüllen fangen nichts ab (außer `try` um Einzelteile); `jvChain` fängt Fehler je Eintrag und geht zum nächsten |
| Reihenfolge-Wirkung | Von 10 Paar-Vertauschungen innerhalb der Plätze der fünf Dateien ändern 9 die Anweisung (Reihenfolge der angehängten Abschnitte, bei Fragen nach der Weltlage zusätzlich der Text); nur `gedaechtnis ↔ name` ist gleich. Klasse A. |

**Zielarchitektur (Vorschlag, Phase 5B):** Die fünf direkten Hüllen werden Einträge der vorhandenen `jvChain` mit Rängen außerhalb des bisherigen Bereichs (z. B. name 10, gedaechtnis 20, worldqueryfix 30, fish 40, contextplus 50; die bisherigen 100–500 bleiben). `contextplus` hängt sich genau einmal ein. Golden Master: `tests/globale.js` (Hash, Länge und Abschnittsreihenfolge für 6 Eingaben in zwei Zeitvarianten); Ziel ist die Früh-Variante (echter Browser), die Spät-Variante muss dabei verschwinden. Umfang: 5 Dateien, je wenige Zeilen. Risiko: mittel (der Text geht an die KI; Reihenfolge und Doppel-Block müssen bewusst festgelegt werden, `jvChain` fängt Fehler anders als die direkten Hüllen).

## 3. handleLocalCommand (GELB)

| Punkt | Befund |
|---|---|
| Basis | `localcommands.js` (793): `handleLocalCommand` → `handleLocalCommandInner` (Fehler → `false`) |
| Hüllen innen → außen | `commands.js` (795, `jvCommands`-Verteiler, 96 Einträge, Marke `_jvCommands`) → `mailpush.js` (846, `_mailpush`) → `worldqueryfix.js` (882, `_globalInfo65`) → Inline-Skript in `index.html` (885, Mimik-Befehle) → `ortsuche.js` (896, `_ortsuche`) |
| Zwei Architekturen | Ja: `jvCommands` (Rang) und vier äußere Hüllen. `mailpush.js` ist doppelt vorhanden (äußere Vorprüfung UND eigener `jvCommands`-Eintrag) |
| Historischer Ballast | `erweiterungen.js`: der Rückfall-Zweig (`else if (typeof window.handleLocalCommand ...)`) wird nie genommen, weil `jvCommands` da ist (Rang 1200). |
| Fachlich nötig | `worldqueryfix` (liefert `false` → Frage geht an die KI), Inline-Mimik, `ortsuche` (davor `handlePendingSaveAnswer`, danach `handleOrtsucheCommand`, dazu der Nebeneffekt `patchOldPlacesFetch`), `mailpush` (vor dem alten Push-Befehl) |
| Lesen von `window.handleLocalCommand` | `foto_brief.js` (`runLocal`), `kuendigung.js`, `satztest.js`, jeweils zur Aufrufzeit (kein Problem). `mehrfach.js` nutzt `jvCommands.nur()` und umgeht die vier äußeren Hüllen bewusst. |
| Rückgabe | synchron `true`/`false` |
| Reihenfolge-Wirkung | Vertauschung der drei Datei-Plätze (mailpush, worldqueryfix, ortsuche): bei den 14 gemessenen Eingaben **identisch** (Klasse C/D, die Hüllen sind weitgehend unabhängig). |

Eine explizite Kette wäre sinnvoll, ist aber kein Muss: Die vier Hüllen sind in `jvCommands` als Einträge mit Rang unter 10 (vor `festnamen`, Rang 10) darstellbar; `ortsuche` braucht einen Eintrag, der erst `next()` aufruft und danach prüft. Nicht in Phase 5A.

## 4. sendToGroqSmart (GELB)

| Punkt | Befund |
|---|---|
| Basis | `assistant.js` (913): `async function sendToGroqSmart` → `sendToGroqSmartCore` (selbst durch `fehlerort.js` umhüllt) |
| Lebende Hüllen innen → außen | `synapsen.js` (bei DOMContentLoaded, Marke `_jvSyn`, merkt den Text) → `weathermap.js` (bei load, Marke `_wx`, "Karte schließen" ohne KI) |
| **Tote Hüllen** | `festnamen.js` (835) und `hoerkorrektur.js` (838) prüfen `typeof window.sendToGroqSmart === 'function'`. `assistant.js` lädt erst später, also greift der Zweig nie. Der Text, der an die KI geht, wird **nicht** korrigiert (im Test und im echten Chromium gemessen: der Kern bekommt „Neu Galina Ring“ unverändert). Die Namens-Korrektur der Sprache passiert früher in `hoeren.js` (`jvFestnamen`), getippter Text bleibt unkorrigiert. Lädt man die beiden Dateien hinter `assistant.js`, wird die Korrektur aktiv (gemessen: „Neu-Galliner-Ring“). Klasse A. |
| Rückgabe | immer ein Versprechen (Promise); `weathermap` gibt bei seinem Kurzschluss `Promise.resolve()` zurück |
| Fehlerpfade | Schutzhülle in `assistant.js` (Fehler vor dem Kern → Fehlerbox + Ansage) |
| Reihenfolge-Wirkung | `synapsen ↔ weathermap` vertauschen: identisch (Ereignisse DOMContentLoaded vor load legen die Reihenfolge fest, Klasse D) |

## 5. searchSemanticMemory und jvFristHinweis (ROT, braucht erst eine Entscheidung)

- `langzeit.js` (909) setzt `window.searchSemanticMemory = async function ...` (eigene Suche mit Plänen und Datum, `topK` 8, zweite Anfrage `listall`). `assistant.js` (913) deklariert danach `async function searchSemanticMemory`; die Deklaration überschreibt die Zuweisung. **Ergebnis: Die Suche aus `langzeit.js` ist nie aktiv** (gemessen im Test und im echten Chromium: eine einzige Anfrage mit `topK` 5, keine `listall`-Anfrage).
- `foto_stundenplan.js` (856) hängt sich an `searchSemanticMemory` an, aber die Funktion gibt es dort noch nicht: toter Zweig.
- Lebend: `ki_mitdenken.js` (bei load, Marke `_ki`) umhüllt die Suche und `jvFristHinweis` (Basis `langzeit.js`, aufgerufen in `assistant.js`).
- Reihenfolge-Wirkung: `langzeit.js` hinter `assistant.js` laden schaltet die Langzeit-Suche ein (Klasse A, ändert das Verhalten und die Anfragen an den Server).
- Das ist kein reiner Umbau, sondern eine Entscheidung (Funktion einschalten oder Totcode entfernen). Deshalb erst klären, dann bauen.

## 6. Fenster: openPanel, closePanel, isPanelOpen, refreshOpenPanel (GELB)

Basis `panels.js` (770, Funktionsdeklarationen). Alle Hüllen sind bloße Zuweisungen auf die Deklaration (`closePanel = function ...`, zum Teil auch `window.closePanel = closePanel = ...`).

| Funktion | Hüllen innen → außen |
|---|---|
| `openPanel` | `weathermap` (805) → `ferien` (807) → `tagesueberblick` (848, fängt `dashboard` ab) → `karte_zu` (862) |
| `closePanel` | `weathermap` → `ferien` → `tagesueberblick` → `langzeit` (909) |
| `isPanelOpen` | `ferien` → `tagesueberblick` → `langzeit` |
| `refreshOpenPanel` | `weathermap` |

Jede Hülle schließt ihr eigenes Fenster; die Reihenfolge ändert nur, in welcher Reihenfolge diese unabhängigen Schließer laufen (5 von 6 Vertauschungen ändern genau das, `tagesueberblick ↔ karte_zu` ist gleich). Klasse C. Kein Umbau nötig.

## 7. Einzel-Hüllen (Basis plus eine Hülle) und Besonderheiten

Basis plus genau eine Hülle (Klasse B, die Hülle muss nach der Basis laden; GRÜN/GELB): `saveHomeAddress`/`saveWorkAddress` (adress_normal), `computeDepartureAdvice` (fahrtcheck), `routeDurationSeconds`/`describeAutobahnStau` (stadtverkehr), `fuelAlongRouteAdvice` (lagebild), `getMood` (laune), `triggerDailyBriefing` (ruhe), `jvHearing`/`jvListenIndicator` (lebendig), `onLocalDataChanged` (pushsync), `jvSchichtInfo` (plan_ansagen), `resolveEmailRef` (mailaktionen), `wachterCollect` (erweiterungen), `sendToGroqSmartCore` (fehlerort), `deleteTodoEntry`/`deleteShoppingEntry`/`deleteCalendarEntry`/`deleteReminderEntry` (loesch_notiz), `setPersistentData` (gedaechtnis_zeit), `openGoogleCalendarApp` (langzeit_erinnern), `weltDestroy`/`weltFlyTo`/`weltResetLive` (welt_anflug), `renderContactList` (lists), `renderAllLists` (render → pronunciation bei DOMContentLoaded), `buildMenuPanel` (commands.js/jvChain, 4 Einträge), `runLastPhotoTask` (foto_erkennen), `openPhotoCamera`/`openPhotoGallery` (foto_rezept).

Weitere Funde:
- `runSystemCheckSpoken`: `hud_fenster.js` (812) umhüllt nur, wenn es die Funktion schon gibt; sie wird erst von `systemcheck_voll.js` (826) gesetzt. Die Hülle in `hud_fenster.js` ist tot (Klasse A, harmlos).
- `plFetchElements` (nearbymore): `ortsuche.js` umhüllt sie erst beim ersten Befehl (`patchOldPlacesFetch`), also zur Laufzeit, nicht beim Laden (Klasse C).
- Hüllen auf eingebauten Funktionen (in der Testumgebung nicht messbar, nur statisch geprüft): `HTMLMediaElement.prototype.play` von `lebendig.js` (`_jvPlayPatched`) und `fish.js` (`_jvChainPatched`), `Storage.prototype.setItem` in `sync.js`, `window.Audio` und `speechSynthesis.speak` in `speechrate.js`. Alle sind Sprach- oder Speicherpfade außerhalb dieser Phase.

## 8. Temporäre Ersetzungen

| Stelle | lokal/synchron | `finally` | async-sicher | Bewertung |
|---|---|---|---|---|
| `mehrfach.js`: `window.speak` (Fang) | ja | ja | nein: Sprache nach `await`/Zeitgeber/gespeicherter Referenz entkommt (in `tests/sprache.js` G7 gemessen) | bewusst außerhalb einer Kette, GRÜN |
| `commands.js`: `nurFlag` (Flag, keine Funktion) | ja | ja | n/a | GRÜN |
| `foto_erkennen.js`: `window.photoSay` während `origAsk` | ja | ja | nur synchron, `origAsk` gibt nichts zurück | GRÜN (gemessen: nach dem Aufruf wieder gleich, auch wenn die Karten-Funktion wirft) |
| `foto_essensplan/stundenplan/urlaubsplan/rezept`, `wunschliste`: `window.showActionCards` während `origAsk` | ja | ja | synchron | GRÜN (gleiche Messung) |
| `fish.js`/`native_speech.js`: `window.__jvAck` (Flag) | ja | ja | n/a | GRÜN |

Gefahr durch Parallelität: nur beim `mehrfach`-Fang denkbar, wenn zwischen Ersetzen und Zurücksetzen ein Zeitgeber oder Promise etwas spricht. Das ist dokumentiert und bewusst.

## 9. Warte- und Wiederholungskonstruktionen

| Konstruktion | Dateien | Heute nötig? | Verhalten bei Misserfolg |
|---|---|---|---|
| `register()`-Wiederholung (40 × 500 ms) auf `jvCommands` | `adresse_speichern`, `alleinstellung`, `anleitung`, `einfuehrung`, `ergebnisse`, `mitnehmen` | nein: `commands.js` lädt vorher, der erste Versuch klappt, **es entsteht kein Zeitgeber** | gibt nach 40 Versuchen still auf |
| `hook()`-Wiederholung (40 × 500 ms) auf `getMood` | `laune.js` | nein: `charakter.js` lädt vorher | gibt still auf |
| `setTimeout(install, 0)` | `contextplus.js` | siehe Abschnitt 2: macht aus Zufall eine zweite Hülle | keiner |
| Einhängen bei load | `ki_mitdenken.js`, `weathermap.js` | ja (Funktionen stehen erst nach `assistant.js` bereit) | still |
| Einhängen bei DOMContentLoaded | `synapsen.js`, `pronunciation.js`, `adress_normal.js` | ja | still |
| 40 × 250 ms auf `jvCommands` | `native_speech.js` | ja (lädt vor `commands.js`) | gibt still auf (schon in `tests/reihenfolge.js` D) |
| `waitForAckEnd` (60 ms, höchstens 2 s) | `voicefix.js` | ja (Laufzeit) | spricht in jedem Fall |

Gegenprobe im Test: ohne `commands.js` wiederholen die sieben Dateien tatsächlich (500 ms); die Konstruktion funktioniert also noch, wird nur nicht gebraucht. Timer-Optimierung ist nicht Teil dieser Phase.

## 10. Einteilung nach Klassen (A–D) und Ampel

- **A echte Wrapper-Reihenfolgeabhängigkeit:** `buildSystemPrompt` (5 Hüllen + `contextplus`-Zeitgeber), `searchSemanticMemory` (`langzeit` ↔ `assistant`), `sendToGroqSmart` (`festnamen`/`hoerkorrektur` ↔ `assistant`).
- **B allgemeine Datei-/Initialisierungsabhängigkeit:** alle Einzel-Hüllen (Abschnitt 7), die `register()`/`hook()`-Wiederholungen, `runSystemCheckSpoken`.
- **C absichtlich oder unabhängig:** Fenster-Hüllen, `handleLocalCommand`-Hüllen (bei den gemessenen Eingaben), `plFetchElements`, temporäre Ersetzungen.
- **D bereits explizit gelöst:** `jvFotoKette`, `jvSpeakKette`, `jvAktionen`, `jvChain`, `jvCommands`.

| Ampel | Kandidat |
|---|---|
| ROT | 1. `buildSystemPrompt` (zwei Architekturen, Ergebnis hängt von Ladereihenfolge und Zeitpunkt ab) · 2. `searchSemanticMemory`/`jvFristHinweis` (Funktion still verloren; erst Entscheidung nötig) |
| GELB | `handleLocalCommand` · `sendToGroqSmart` (zwei tote Hüllen) · Fenster-Hüllen · `runSystemCheckSpoken` · Wiederholungskonstruktionen · Hüllen auf `HTMLMediaElement.prototype`/`Storage.prototype` |
| GRÜN | Foto-, Speak-, Aktions-Kette, `jvChain`, `jvCommands`, `mehrfach`-Fang, alle Einzel-Hüllen, temporäre Ersetzungen mit `finally` |

## 11. Empfohlene Reihenfolge ab Phase 5B

1. **5B: `buildSystemPrompt`** in die vorhandene `jvChain` überführen (siehe Abschnitt 2). Golden Master steht (`tests/globale.js`); Zielzustand = Früh-Variante.
2. **5C (Entscheidung des Nutzers, kein reiner Umbau):** `searchSemanticMemory` (Langzeit-Suche einschalten oder Totcode entfernen) und die toten `sendToGroqSmart`-Hüllen (`festnamen`/`hoerkorrektur`) einschalten oder entfernen.
3. **5D (optional):** `handleLocalCommand`-Hüllen als `jvCommands`-Einträge (`mailpush`, `worldqueryfix`, Mimik, `ortsuche`); toter Rückfall in `erweiterungen.js` entfernen.
4. Rest (Fenster, Einzel-Hüllen, Wiederholungen): nur bei Bedarf, keine Eile.

## 12. Neues Sicherheitsnetz (`tests/globale.js`)

- A: Ersetzungsprotokoll je Skript und Start-Phase (138 Ersetzungen) eingefroren.
- B1: `buildSystemPrompt` für 6 Eingaben in zwei Zeitvarianten (Länge, Hash, Abschnittsreihenfolge, Kontext+-Anzahl).
- B2: `handleLocalCommand` für 14 Eingaben (Ergebnis, Modul, gesprochener Text).
- B3: `sendToGroqSmart` (was der Kern bekommt, Rückgabe, Marke), B4: `searchSemanticMemory`/`jvFristHinweis` (Anfragen), B5: Fenster (Schließer), B6: vorübergehende Ersetzungen (auch bei Ausnahme).
- C: Zeitgeber der Wartekonstruktionen und Beweis, dass sie ohne `commands.js` wirklich warten.
- D: 19 Paar-Vertauschungen (10 Prompt, 3 Befehle, 6 Fenster) innerhalb der Plätze der beteiligten Dateien plus 3 Sonderproben (Datei hinter ihre Basis).
- Sachaussagen („Befunde“) und Gegenproben (veränderte Quelle, fehlende Datei muss abweichen).
