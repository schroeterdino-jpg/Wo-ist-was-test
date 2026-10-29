# Sprache/TTS: Ist-Zustand (Phase 4, nur Analyse und Sicherheitsnetz)

Referenz: `main` bei `0df3afb` (nach Phase 3). Kein Produktcode wurde geändert. Das Sicherheitsnetz ist `tests/sprache.js` mit dem Soll in `tests/sprache_soll.json` (Neu schreiben: `node tests/sprache.js --schreiben`, Gegenproben erklären: `node tests/sprache.js --details`).

## 1. Die ganze Kette, außen → innen

Aufrufer rufen `speak(text, onComplete, langCode)` auf. Außen → innen läuft heute:

| # | Stufe | Datei (Position in `index.html`) | Funktion |
|---|---|---|---|
| 1 | teilen | `teilen.js` (923) | `speak` |
| 2 | kontext_lokal | `kontext_lokal.js` (902) | `speak` |
| 3 | Gedankenstriche/Preise | `fish.js` (879, Marke `_dash`) | `speak` |
| 4 | Töne | `toene.js` (877) | `speak` |
| 5 | Sprüche | `sprueche.js` (876) | `speak` |
| 6 | Straßen-Grammatik, Zwischenansage ausreden lassen | `voicefix.js` (780) | `speak` (hier als nackte Zuweisung `speak = …`) |
| 7 | Basis | `voice.js` (778) | `speak` |

Darunter, je nach Stimme:

- Handy-Stimme: `speakBrowser` → `speakBrowserNow` → `speechSynthesis.speak` (Tempo-Umrechnung aus `speechrate.js`).
- Cloud-Stimme: `fetchCloudSpeechBlob` → `new Audio(blob)` (Tempo aus `speechrate.js`).

Eigene Ketten für andere Funktionen (nicht `speak`):

- **speakBrowser** (außen → innen): `pronunciation.js` (hängt sich erst bei DOMContentLoaded ein, ist deshalb immer außen) → `fish.js` (Marke `_jv`) → `voice.js`.
- **speakAckBrowser**: `pronunciation.js` (DOMContentLoaded) → `voice.js`.
- **speakAck** (Zwischenansage): `fish.js` (`_jv`, setzt `__jvAck`) → `voicefix.js` (unterdrückt, wenn Jarvis schon spricht) → `voice.js`.
- **fetchCloudSpeechBlob**: `pronunciation.js` (DOMContentLoaded, außen) → `fish.js` (ERSETZT die Funktion, behält die Original-Funktion nur für Nicht-Fish-Stimmen) → `voice.js`.
- **getTtsEngine/setTtsEngine**: `fish.js` ersetzt beide (Standard "fish", Einmal-Start schreibt `tts_engine`).
- **getSpeechRateFactor/setSpeechRate**: `speechrate.js` → `tempo.js` (zusätzliche lokale Sicherung `jv_speech_rate_local`).
- **startThinkingSound**: `audio.js` → `voicefix.js` macht daraus eine leere Funktion.
- **speechSynthesis.speak** und **window.Audio**: `speechrate.js` umhüllt beide (Tempo; bei `Audio` nur für `blob:`-Quellen).
- **Vorübergehend**: `mehrfach.js` ersetzt `window.speak` nur während eines Aufrufs (siehe 4).

Dateien, die beteiligt sind: `voice.js`, `voicefix.js`, `pronunciation.js`, `speechrate.js`, `tempo.js`, `sprueche.js`, `toene.js`, `fish.js`, `kontext_lokal.js`, `teilen.js`, `mehrfach.js`, `native_speech.js`, dazu lesend `audio.js` (Töne), `lebendig.js` (`jvListenIndicator` wird von `speak` gerufen), `ui.js` (Untertitel/Terminal), `ruhe.js` (liest `isSpeaking`).

## 2. Jede Stufe im Einzelnen

Abkürzungen: **Text** = ändert den gesprochenen Text, **Audio** = ändert Ton/Tempo/Zusatz-Töne, **verhindern** = kann die Ausgabe ganz unterbinden, **zusätzlich** = kann zusätzliche Ausgabe erzeugen, **Rückgabe** = ändert Rückgabewert/Promise (alle Stufen geben nur zurück, was die innere liefert, also `undefined`; kein Promise), **Fehler** = ändert die Fehlerbehandlung.

### Basis (Typ 1)

| Eigenschaft | `voice.js` |
|---|---|
| `speak` | Zählt `speechGeneration` hoch, stoppt Zwischenansage und Nachdenk-Ton, bricht eine laufende Aufnahme ab, setzt Anzeige (`jvListenIndicator(false)`, Terminal "AUDIO_OUT", Knöpfe), reinigt Text (`*_#\`~` weg, "Schluessel"→"Schlüssel", "Alyssa"→"Alischa", Daten/Abkürzungen/Jahre nur ohne `langCode`). Cloud-Stimme nur wenn kein `langCode`, Engine ≠ browser und weniger als 2 Fehlversuche, sonst `speakBrowser`. |
| Netz | Cloud: `/api/stau?tts=1` über `fetchCloudSpeechBlob` (Zeitlimit 6 s). Bei Fehler zählt `ttsCloudFailCount` hoch und die Handy-Stimme springt ein. |
| Storage | liest `tts_engine`, Stimme (Edge/OpenAI/Handy) aus den Einstellungen |
| Native | keine eigene Brücke; `isSpeaking()` wird von `native_speech.js` abgefragt |
| Rückgabe/Fehler | `undefined`; Nicht-Text (`undefined`, `null`, Zahl) wirft einen `TypeError`, denn `text.replace` hat kein try (gemessen) |
| Verhindern | wird `interruptSpeaking()` während des Abrufs aufgerufen, spielt die Cloud-Antwort nicht mehr (`myGen <= interruptedGen`) |

### Dauerhafte Wrapper auf `speak` (Typ 2)

| Stufe | was genau | vor/nach innerem `speak` | Text | Audio | verhindern | zusätzlich | Storage | Netz | Native | DOM/UI | Rückgabe | Fehler |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| `voicefix.js` | `fixStreetGrammar` ("in die Ring" → "in den Ring"); ist eine Zwischenansage hörbar, wartet es bis zu 2 s (60-ms-Poller, `setTimeout`), räumt dann laufendes Audio/Utterance ab und ruft `voice.js` | davor | ja (Straße) | bricht laufende Stimme ab (`speechSynthesis.cancel`) | nein (verzögert nur, höchstens 2 s) | nein | nein | nein | nein | nein | gibt Rückgabe der inneren durch (im Wartefall sofort `undefined`) | Aufräumen in try/catch, "darf das Sprechen nie verhindern" |
| `sprueche.js` | hängt nach der Information einen Spruch an (Anlass am Text erkannt; Zufall; Stufe über `sassLevel`, Standard 2 = 0,85) | davor | **ja** (Spruch + unsichtbare Lach-Marke `⁣`) | nein | nein (gleicher Text innerhalb 3 s: bleibt unverändert) | nein (Spruch ist Teil desselben Satzes) | liest `helfer_sass_level` | nein | nein | nein | durch | try/catch: "bei jedem Problem bleibt der Text, wie er ist" |
| `toene.js` | spielt Erfolgs-/Fehler-/Warnton, passend zum Text | davor | nein | **ja** (Zusatzton, WebAudio) | nein | **ja** (Ton) | liest Ton-Schalter/Lautstärke (in `audio.js`) | nein | nein | bindet Einstellungs-Regler | durch | try/catch; ohne `langCode`, Länge ≤ 420, gleicher Ton nicht innerhalb 1,5 s |
| `fish.js` (`_dash`) | `normalizeSpoken` = Gedankenstriche zu Komma/"bis", Spritpreise auf Cent runden | davor | **ja** | nein | nein | nein | nein | nein | nein | nein | durch | nein |
| `kontext_lokal.js` | die erste gesprochene Antwort nach einem festen Befehl landet im Gesprächsverlauf (`chatHistory`) | davor | nein | nein | nein | nein | schreibt in `chatHistory` (Arbeitsspeicher) | nein | nein | nein | durch | try/catch |
| `teilen.js` | merkt jede Antwort ab 40 Zeichen (außer eigenem Sagen) für "Schick das per WhatsApp" (`jvTeilen.letzte`) | davor | nein | nein | nein | nein | Arbeitsspeicher | nein | nein | nein | durch | try/catch; kopiert Eigenschaften der inneren Funktion |

### Dauerhafte Hooks auf andere Funktionen (Typ 2, aber nicht `speak`)

| Datei | Funktion | was | Text | Audio | verhindern | Netz | Bemerkung |
|---|---|---|---|---|---|---|---|
| `pronunciation.js` (DOMContentLoaded) | `fetchCloudSpeechBlob`, `speakBrowser`, `speakAckBrowser` | Aussprache-Liste, Ordnungs-Daten, Maße, "ein/eine", Stimmung (nur Cloud) | **ja** | nein | nein | nein (reicht weiter) | Liste aus Einstellungen (Storage). Nicht bei Fremdsprache (`langCode`) |
| `fish.js` | `speakBrowser` (`_jv`) | Lach-Marke entfernen, Preise in Wörter, Striche | **ja** | nein | nein | nein | Handy-Stimme |
| `fish.js` | `speakAck` (`_jv`) | setzt `__jvAck` während des Aufrufs: nur Fish, 20 s Zeit, sonst Stille statt Ersatzstimme | nein | indirekt | indirekt (Stille) | ja | siehe `fetchCloudSpeechBlob` |
| `fish.js` | `fetchCloudSpeechBlob` (ersetzt) | Zahlen/Uhrzeiten in Wörter, Abkürzungen buchstabieren, Lacher/Seufzer (Zufall), Stücke von ≤ 280 Zeichen, Folge-Stücke nacheinander | **ja** | **ja** (Lacher, Pausen) | nein | **ja** (`/api/stau?...engine=fish`, Rückfall auf OpenAI/Edge) | die Fish-Audio-Warteschlange (`startQueue`) hängt Folge-Stücke an `onended` des Audio |
| `fish.js` | `getTtsEngine`, `setTtsEngine` | Standard "fish", Einmal-Start schreibt `tts_engine` | nein | wählt die Stimme | nein | nein | Storage |
| `voicefix.js` | `speakAck` | unterdrückt (ruft nur `onComplete`), wenn `isSpeaking()` | nein | nein | **ja** | nein | |
| `voicefix.js` | `startThinkingSound` | leere Funktion | nein | schaltet Nachdenk-Brummen ab | **ja** (Ton) | nein | |
| `speechrate.js` | `speechSynthesis.speak`, `window.Audio` | Tempo × `getSpeechRateFactor()` (0,5–2) bzw. Tempo/Tonhöhe bei `blob:`-Audio | nein | **ja** | nein | nein | |
| `tempo.js` | `getSpeechRateFactor`, `setSpeechRate` | Tempo zusätzlich in `jv_speech_rate_local` sichern | nein | indirekt | nein | nein | Storage |

### Vorübergehender Eingriff (Typ 3) und Test-Capture (Typ 4)

| Datei | was |
|---|---|
| `mehrfach.js` Zeile 114–117 | siehe Abschnitt 4 |
| `tests/umgebung.js`, `tests/reihenfolge.js`, `tests/mehrfachfrage.js` | ersetzen `speak` durch Aufzeichner (nur Test) |
| Produktiv gibt es KEIN weiteres Capture. `satztest.js`/`diagnose.js` rufen `speak` normal auf. |

### APK/Native (Typ 5)

`native_speech.js` (777, lädt VOR `voice.js` und `commands.js`):

- Ersetzt die Spracherkennung (nicht die Ausgabe).
- 300-ms-Melder: meldet `ZaneNative.setBusy(...)` und `setSprechen(...)` anhand `isSpeaking()`, `isRecording`, `isProcessing`, `ackActive`.
- `zaneWake()`: unterbricht Jarvis, wenn er spricht (`interruptSpeaking()`), dann "Zu Diensten, Sir." Bei Engine ≠ fish über `speakAck` (läuft also durch voicefix/fish). Bei Engine = fish über einen EIGENEN Weg: `fetchCloudSpeechBlob` (mit `__jvAck`), eigenes `Audio`, gespeichert in `localStorage` (`zane_ack_…`). Dieser Weg läuft NICHT durch `speak`.

## 3. Was hängt von der Ladereihenfolge ab (Beweis)

Alle 36 Paar-Vertauschungen der neun Dateien `voicefix, pronunciation, speechrate, sprueche, toene, fish, kontext_lokal, teilen, mehrfach` wurden im Test in der Speicher-Kopie gemacht (Platte unverändert) und mit dem Messlauf verglichen (`ist.matrix`, im Soll festgehalten: 15 identisch, 21 verändert).

Vorsicht beim Lesen: Wer eine Datei weit nach vorn schiebt, nimmt ihr ihre Voraussetzungen (z. B. `kontext_lokal.js` vor `localcommands.js`). Aussagekräftig sind deshalb vor allem die Paare im späten Block (`sprueche, toene, fish, kontext_lokal, teilen, mehrfach`, alle zwischen Position 876 und 926, Voraussetzungen alle geladen):

| Vertauschung | Ergebnis | Was genau |
|---|---|---|
| sprueche ↔ toene | **verändert** | Ton wird "fehler" statt "erfolg": der angehängte Spruch ("…ich kann dich leider nicht abschleppen") enthält ein Fehlerwort, das der Ton dann mit auswertet |
| sprueche ↔ fish | **verändert** | wie oben (Spruch liegt dann vor dem Ton) |
| sprueche ↔ kontext_lokal | **verändert** | wie oben (Spruch liegt außerhalb des Tons, Ton wird "fehler") |
| sprueche ↔ teilen | **verändert** | `teilen` liegt dann innerhalb von `fish`: gemerkt wird die abgerundete Fassung ("2,19 Euro"), außerdem steht `sprueche` außen |
| sprueche ↔ mehrfach | **verändert** | `sprueche` rutscht an das äußere Ende, `teilen` merkt dann die Fassung mit Spruch |
| toene ↔ teilen | **verändert** | `teilen` merkt "2,19 Euro" statt "2,193 Euro" (liegt dann hinter dem Runden) |
| fish ↔ teilen | **verändert** | wie oben: gemerkt (und damit per WhatsApp verschickt) wird die abgerundete Fassung |
| fish ↔ mehrfach | **verändert** | `fish` wird die äußerste Stufe: `teilen` merkt die abgerundete Fassung |
| toene ↔ fish | identisch | |
| toene ↔ kontext_lokal | identisch | |
| toene ↔ mehrfach | identisch | |
| fish ↔ kontext_lokal | identisch | |
| kontext_lokal ↔ teilen | identisch | |
| kontext_lokal ↔ mehrfach | identisch | |
| teilen ↔ mehrfach | identisch | |

Die Datei `pronunciation.js` ist **ortsunabhängig**: Vertauschungen mit `speechrate`, `sprueche`, `fish`, `voicefix` ändern nichts, denn sie hängt sich ohnehin erst bei DOMContentLoaded ein. Die Paare mit `toene`, `teilen`, `kontext_lokal`, `mehrfach` sind verändert, weil dort die ANDERE Datei umzieht.

`voicefix.js` ist die innerste Stufe. Zieht man es nach außen, wechselt die Reihenfolge von Ton und "Stimme abbrechen" (der Ton kommt dann erst nach dem Abbruch der alten Stimme). Hörbar nur minimal.

Funktional wichtig sind also genau diese drei Ordnungen:

1. `teilen` außerhalb von `fish`/`toene`/`sprueche`: damit merkt "Schick das per WhatsApp" den echten Text (Preis mit drei Stellen, ohne Spruch).
2. `toene` außerhalb von `sprueche`: der Ton richtet sich nach der Information, nicht nach dem angehängten Spruch.
3. `voicefix` ganz innen: erst Ton, dann Abbruch der alten Stimme, dann `voice.js`.

`kontext_lokal` ist gegenüber allen anderen Stufen reihenfolgeneutral.

## 4. `mehrfach.js` genau

Ort: `sichererTeil(teil, namen)` (Zeilen 111–118), nur im Weg `frageBefehl` (Rang 0,05 der Befehlsliste).

- **Wann**: bei einer Mehrfachfrage ("Wie wird morgen das Wetter und wann ist der nächste Vollmond?"), und nur für Teile, bei denen eine "reine Auskunft" (`reineAuskunft`) zuständig sein könnte. Heute sind das vier Befehle: `was_steht_an`, `vollmond_auskunft`, `gedaechtnis_zeit`, `schicht_auskunft`.
- **Ersetzt**: `window.speak = function (t) { fang.push(String(t)); }`, direkt vor `J.nur(namen, teil)`.
- **Gesammelt**: jeder Text, den ein Auskunftsbefehl über `speak(...)` ausgibt (als Zeichenkette). Er wird am Ende mit den anderen Teilantworten zu EINER Antwort zusammengebaut (`window.jvAntwort.baue`) und einmal gesprochen (`window.speak`, also durch die ganze Kette).
- **Unterdrückt**: in diesem Fenster läuft keine Stufe der Kette; die Texte gehen nur in die Sammelliste und erscheinen erst in der zusammengebauten Antwort (gemessen, Test G7: "Gefangen: …" wird nur einmal als Teil des Gesamttextes gesprochen). Ausnahmen: Aufrufe über eine VORHER gespeicherte Referenz auf `speak` und `speakAck` laufen weiter durch die echte Kette (Test G7, "gespeicherte Referenz").
- **Wiederhergestellt**: in `finally { window.speak = orig; }` im selben synchronen Block. Bei Erfolg, bei Ausnahme (Test G7: Befehl wirft, `window.speak` danach gleich, Rückgabe `false`, alles weiter hörbar).
- **Promise/async**: `J.nur` ist heute synchron. Liefert ein Befehl ein Versprechen (nicht der Fall), gilt es als erledigt (`!!`), der gefangene Text bleibt leer und eine Sprache NACH dem `await` wird nicht mehr gefangen, sondern normal gesprochen (Test G7: "async").
- **Parallele Sprachausgabe im Fenster**: JavaScript ist einzelfädig; solange `J.nur` läuft, kann nichts anderes sprechen. Was in dem Fenster mit `setTimeout` oder Mikrotask geplant wird, läuft erst NACH der Wiederherstellung und wird normal gesprochen (Test G7: "Mikrotask/Zeitgeber entkommt"). Gefährlich wäre nur, wenn jemand künftig einen asynchron sprechenden Befehl als `reineAuskunft` markiert: dann spricht er außerhalb des Fangs, aber ohne Fehler. Heute nicht der Fall (die vier Befehle sind synchron; `sonnemond.js` hat asynchrone Teile, aber nicht in `vollmond_auskunft`).
- **Folgerung für einen Umbau**: Eine Kette, die `window.speak` einmal beim Laden festhält, würde Fang und Wiederherstellung zerstören. Der Fang ersetzt die ÄUSSERSTE sichtbare Funktion und muss das auch in Zukunft können.

## 5. Wer entscheidet was?

| Frage | Wer | Anmerkung |
|---|---|---|
| **Darf gesprochen werden?** | Die Aufrufer, nicht die Wrapper: `proaktiv.js` (`speakOn()` + `isSpeaking()`), `fristen.js`, `konto.js`, `mail_nacht.js`, `mailwatch.js`, `wachter.js` (`jvRuhe()` + `isSpeaking()`); `zane_redet.js`, `kennenlernen.js` (`jvRegeln.darfSprechen`, C1 `scharf === true`, nur LOW-Sprache); `jvMeldungen` beobachtet nur (Kanal "sprache" ist eine Beobachtung, keine Ausführung) | `ruhe.js` liest `isSpeaking()` alle 400 ms und hält 9 s Ruhe nach Sprechen/Rechnen, 4 Minuten nach einem Briefing |
| **Was wird gesprochen?** | Befehle, KI, Meldungs-Texte (Aufrufer). Danach verändern es: `voicefix` (Straße), `sprueche` (Spruch), `fish` (Striche/Preise), `voice.js` (Reinigung), `pronunciation`/`fish` (Aussprache, Zahlen, Lacher, nur für die Stimme) | Die Anzeige-Untertitel zeigen den umgeschriebenen Text der Handy-Stimme |
| **Wer spricht?** | `voice.js` (Handy-Stimme oder Cloud), `fish.js` für die Fish-Stimme, `speechrate.js` für das Tempo | `native_speech.js` hat einen eigenen Weg für das "Ja?" nach dem Weckwort (Fish) |
| **Unterdrückung INNERHALB der Speak-Wrapper** | Keine für `speak` selbst. Nur: `speakAck` wird unterdrückt bei `isSpeaking()` (voicefix), bei Aufnahme (voice.js) oder wenn die Antwort dazwischenkam (Generation); Cloud-Audio wird verworfen nach `interruptSpeaking()`; `mehrfach.js` schluckt während des Fangs; `voicefix` verzögert höchstens 2 s | C1/ruhe/Meldungen dürfen NICHT in die Speak-Kette wandern |

Merkposten (nicht umgesetzt): Für "Jarvis beim Sprechen natürlich unterbrechen" gibt es schon `interruptSpeaking()` (`voice.js`), das `briefing.js` und `zaneWake()` rufen, und die Meldung `setSprechen` im 300-ms-Melder. Die natürliche Stelle wäre dort, nicht in einem Wrapper.

## 6. Golden Master (`tests/sprache.js`)

Der Aufzeichner sitzt ganz unten (Handy-Stimme, Audio, Netz, Töne, Anzeige-Funktionen, Zeitgeber, Native-Brücke). Zufall fest, Uhr virtuell, Seite meldet während des Ladens `loading` und löst danach DOMContentLoaded aus (wie im Browser).

| Gruppe | Inhalt |
|---|---|
| P (Protokoll) | 30 Einträge: welche Datei welche Sprach-Funktion ersetzt/umhüllt, inklusive der drei DOMContentLoaded-Hooks |
| G1 | 13 Proben über die Handy-Stimme: Text, Reihenfolge, Töne, Anzeige, Rückgabe, was `teilen` merkt |
| G1b/G1c | Zufall 0 (Sprüche und Lacher greifen); Spruch mit Fehlerwort (Reihenfolge Ton ↔ Spruch) |
| G2 | Fremdsprache (`langCode`): kein Ton, keine Aussprache-Anpassung |
| G3 (edge, fish), G3b, G3c | Cloud-Weg: Netzabruf mit Text, Audio, Tempo; lange Texte in Stücken; Ausfall → Rückfall auf Handy-Stimme, Fehlerzähler |
| G4 | Zwischenansage: frei, unterdrückt (spricht schon / Aufnahme), Fish-Wache, Edge, Antwort kommt dazwischen (Wartezeit 190 ms und 2 s), Antwort überholt Cloud-Ansage |
| G5 | Wiederholungs- und Längenregeln: Spruch 3 s, Ton 1,5 s, Töne aus, 420/421 Zeichen, > 430 Zeichen, Zufall 0,99 |
| G6 | `teilen`/`kontext_lokal` mit echten Befehlen ("Wie spät ist es in Istanbul?", "Und in Tokio?", "Schick das per WhatsApp"): Verlauf, Merker |
| G7 | `mehrfach.js`: echte Mehrfachfrage; Fang mit Mikrotask/Zeitgeber; Ausnahme; Versprechen; gespeicherte Referenz |
| G8 | Fehlerverhalten: `undefined`/`null`/Zahl, Handy-Stimme wirft, Ton-Funktion fehlt, `sassLevel` wirft |
| G9 | APK: Weckwort (Handy/Fish), `speak` mit Brücke, Weckwort während Jarvis spricht |
| G10 | Tempo 0,5 / 0,8 / 1 / 1,3 / 1,4 / 3 |
| M | Vertauschungs-Matrix mit 36 Paaren |
| A–E | 26 Gegenproben (Details mit `--details`) |

Nicht messbar in der Test-Umgebung: echte Hörbarkeit, echte Cloud-Stimmen, echte DOM-Elemente (nur über die Anzeige-Funktionen), die Java-Seite der APK.

Alle Werte sind NEU (neue Datei); kein bestehender Sollwert wurde angefasst oder neu geschrieben.
