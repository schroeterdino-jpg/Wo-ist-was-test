# Phase 7A – Lokales Gedächtnis (memoryItems) und Speicher-Kopplungen

Nur Analyse. Kein Produktcode, keine Migration, keine Umbenennung, keine Löschung. Ausgangs-HEAD: main d31aec9.
Prüfung: `node tests/memory7a.js` (75 Prüfungen). Soll (Ist-Zustand): `tests/memory7a_soll.json`. Chromium-Messstand: `tests/memory7a_laufzeit.json` (erzeugt mit `node tests/memory7a_messen.js`).

## 1. Besitzer von memoryItems
- Definiert **einmal**: `storage.js:88` (`let memoryItems = JSON.parse(getPersistentData('helfer_memory','{}')) || {}`). Global für alle Skripte, aber keine `window`-Eigenschaft.
- 47 Fundstellen in 13 Dateien: lists.js 18, gedaechtnis_zeit.js 6, travel.js 5, actions.js 4, briefing.js 3, storage.js 3, render.js 2, answers.js, assistant.js, dirigent.js, fish.js, langzeit.js (Kommentar), sync.js je 1.
- **Referenz ersetzt** (Zuweisung an die Variable): `storage.js` (Sicherung einlesen), `sync.js` (Datenabgleich), `lists.js` (Gedächtnis leeren), `gedaechtnis_zeit.js` (Proxy). Sonst alles Änderungen am Objekt selbst.
- **Schreiber** (setPersistentData('helfer_memory')): actions.js (`memory_store`), lists.js (hinzufügen/ändern/löschen/leeren), storage.js (Sicherung), sync.js (Abgleich).
- **Leser**: lists.js (Suche), answers.js, assistant.js, briefing.js, dirigent.js, fish.js, render.js, travel.js, gedaechtnis_zeit.js (Zeitfragen).
- Besitz ist **verteilt**: ein Ort definiert, mehrere Orte schreiben. gedaechtnis_zeit.js beobachtet nur (Proxy + Rückfall über setPersistentData).

## 2. Der 3-Sekunden-Mechanismus
- `gedaechtnis_zeit.js:55` `setInterval(ensureProxy, 3000)`; **ein** Takt, nie gestoppt, ohne Sichtbarkeitsprüfung.
- Tut: prüft, ob `memoryItems` noch den Proxy trägt (Flag `__jvZeitProxy`); wenn nicht, wickelt er neu ein. Kein Lesen/Schreiben im Gerätespeicher im Ruhezustand (Chromium: 12 s Ruhe = 0 Schreibzugriffe).
- Notwendig, weil Datenabgleich/Sicherung/„Gedächtnis leeren“ die Referenz ersetzen und den Proxy verlieren. Nach einem Abgleich fehlt der Proxy bis zu 3 s; der Rückfall (setPersistentData-Hülle) stempelt dann höchstens 5 geänderte Einträge.
- Kann Daten nicht überschreiben (nur Zeitstempel in `helfer_memory_zeit`). Nicht entfernt.

## 3. Speicherwege
| Weg | Besitzer | Zweck |
|---|---|---|
| `helfer_memory` (localStorage + Spiegel sessionStorage) | storage.js / lists.js / actions.js | lokales Gedächtnis (Gegenstände, Orte), `{schlüssel: text}` |
| `helfer_memory_zeit` | gedaechtnis_zeit.js | Zeitstempel je Eintrag, nur lokal, in der Sicherung |
| `helfer_sync_meta` | sync.js | Zeit je Abgleichsbereich |
| `/api/sync` (Redis, `alltags-helfer:data`) | api/sync.js | ganzes `helfer_memory` als Text, neuerer Zeitstempel gewinnt |
| `/api/memory` (Upstash Vector) | api/memory.js | Langzeitgedächtnis (semantisch), **getrennt** vom lokalen Gedächtnis |
| `jv_tageslog` | langzeit.js | Tageslog über `chatHistory.push` |
| `helfer_reminders` | Erinnerungen | berührt das Gedächtnis nicht |
- 170 Schlüsselnamen mit `helfer_`/`jv_`/`nova_` im Code; 128 `jv_`/`nova_`-Namen sind im Golden Master festgehalten (Umbenennen fällt auf, Gegenprobe H).
- Android: `AnsageReceiver`/`OrtReceiver` nutzen nur `nova_ansage*`/`nova_orte*`; **kein** Zugriff auf `helfer_memory`. Wissensblatt (ZaneBridge) liest nur Listen, keine Gedächtnis-Schlüssel.
- Client-Abgleichsliste und Server-Erlaubnisliste stimmen für das Gedächtnis überein; der Server kennt 5 zusätzliche Schlüssel (`jv_urlaub_liste`, `jv_ausfluege`, `jv_wunschlisten`, `jv_preiswaechter`, `jv_haushalt`), harmlos.
- Kein `removeItem`/`clear` auf Gedächtnis-Schlüssel im Code.

## 4. Datenflüsse (Eingabe → Verarbeitung → RAM → Speicher → Server → später lesen)
- **A „Merk dir, dass mein Zweitschlüssel …“**: `memory_store` → `memoryItems[key]` (Proxy stempelt) → `helfer_memory` (L+S) + 3× `helfer_memory_zeit` → Abgleich in ca. 2,5 s → zusätzlich `/api/memory` store (ohne Warten). Später: `searchMemory`.
- **B Erinnerung**: nur `helfer_reminders`, Gedächtnis unberührt.
- **C Langzeit lesen / D semantisch suchen**: `/api/memory` search/listall; schreibt nichts lokal.
- **E ändern**: wie A, gleicher Schlüssel; Zeit neu gestempelt. **F löschen**: `delete` → Zeit entfernt → `helfer_memory`; `clear` per Sprache verboten; mehrere Teiltreffer → Rückfrage, nichts gelöscht.
- **G Neustart**: `storage.js` liest `helfer_memory`, neuer Proxy, 1 Takt; keine Schreibzugriffe beim Start.
- **H viele schnelle Änderungen**: 5 Einträge = 5× `helfer_memory`, 15× Zeit, Referenz bleibt gleich.
- **I Speicher von außen geändert** (anderer Tab): RAM sieht es nicht; das nächste Schreiben überschreibt den fremden Eintrag (GELB).
- **J Server-/Sync-Fehler** (500, offline, leere/kaputte Antwort): lokales Gedächtnis unverändert, Referenz gleich.

## 5. Referenzidentität (`memoryItems === alteReferenz`)
Bleibt gleich: normales Schreiben, Ändern, Löschen, 3-s-Takt, schnelle Änderungen. **Wechselt**: Neustart (neue App), Datenabgleich mit neuerem Server-Stand, Sicherung einlesen, Gedächtnis leeren. Wer eine Referenz hält, wäre nach dem Abgleich veraltet; im Code hält niemand eine Referenz (alle lesen die Variable neu).

## 6. Proxy
Fängt `set` (stempelt) und `deleteProperty` (entfernt Stempel), `get` nur für das Flag. Flag nicht aufzählbar und nicht im JSON. Keine Proxy-um-Proxy-Gefahr (Flag-Prüfung). Verschachtelte Änderungen werden nicht gestempelt (Werte sind Texte). Bei Referenzersetzung geht der Proxy verloren, wird nach ≤3 s erneuert. Pro Eintrag 3 Zeitschreibzugriffe (GELB, nicht falsch).

## 7. Rennen (wer gewinnt heute)
- Zwei Schreibzugriffe hintereinander: beide landen. Lokal schreiben während Sync-Anfrage läuft: lokal gewinnt (neuerer Zeitstempel). Späte Server-Antwort: überschreibt neueren lokalen Stand nicht. Zwei Geräte offline: das mit dem neueren Stempel ersetzt das ganze Gedächtnis, Extra-Einträge des anderen gehen verloren (GELB, Szenario `parallel`).
- Server: zwei gleichzeitige POSTs → letzter ersetzt den anderen (Lesen-Ändern-Schreiben ohne Sperre). `mark` im Langzeitgedächtnis verliert bei Gleichzeitigkeit eine Markierung.

## 8. Datenverlust-Risiken
- Kaputtes JSON in `helfer_memory`: `storage.js` bricht ab, danach fehlen `memoryItems`, Kontakte, Briefing, Parkplatz, Heimadresse und Tageslog bis zur Reparatur; **gespeicherte Daten selbst bleiben unverändert** (Speicher wird nicht überschrieben). Heilung durch Abgleich mit dem Server.
- Server-Fehler, leere Antwort: kein Überschreiben. Server ersetzt beschädigten Gesamtwert still durch einen neuen.
- Kein Aufräumen oder Migration auf `helfer_memory`.

## 9. Einstufung
| Befund | Farbe |
|---|---|
| Zeitfrage „Zweitschlüssel“ trifft durch Teilwort-Suche den Eintrag „schlüssel“ (`searchMemory(term)[0]`): falsche Antwort | **ROT** |
| Proxy-Stempel ×3, 3-s-Takt ohne Pause, Referenzersetzung im Abgleich, Gesamtwert-Abgleich (letzter gewinnt), zweiter Tab, kaputtes JSON mit Folgeschaden, Server-Gleichzeitigkeit, Server-Reset, mark-Rennen | GELB |
| normales Schreiben, Neustart, Löschen mit Stempel, Sync-Fehler, späte Antwort, Langzeit getrennt, Erinnerung getrennt, doppelte Initialisierung | GRÜN |

## 10. Gegenproben A–O (Quelltext nur im Speicher verändert)
A Besitzer geändert · B Proxy entfernt · C Zusatz-Proxy · D Takt entfernt · E Takt doppelt · F Referenz ersetzt · G Schlüsselname · H jv_/nova_ umbenannt · I Lesefehler löscht · J Sync überschreibt · K Doppelschreiben · L Neustart verliert · M falscher Eintrag gelöscht · N Serverfehler leert · O Initialisierung zweimal. **Alle 15 werden erkannt**, Kontrollläufe (unverändert, nur Kommentar) bleiben gleich.

## 11. Zielarchitektur (nur Vorschlag, nicht umgesetzt)
Ein Besitzer `jvMemory` mit `lesen`, `schreiben`, `aendern`, `loeschen`, `beobachten` (statt Proxy und 3-s-Takt). Er würde Referenz, Zeitstempel, Speichern und Abgleich-Meldung bündeln. **Offen**, ob das nötig ist: Heute geht im Normalbetrieb nichts verloren; ein großer Umbau ist nicht zwingend.

## 12. Empfehlung Phase 7B
1. Zeitfrage-Suche: exakter Treffer vor Teiltreffer (wie `resolveListTargets`), behebt das einzige ROT. Kleine Änderung in gedaechtnis_zeit.js.
2. Danach optional: kaputtes JSON in storage.js abfangen (Leseschutz, ohne Daten zu überschreiben); Rest erst nach Entscheidung.

## 13. Ausdrücklich NICHT ändern
`nova_`/`jv_`-Schlüssel, Schlüsselnamen `helfer_memory*`, Abgleichslisten, Phase-6-Takte, Langzeit-Suche, Erinnerungen, Schichtlogik, Android-Code, Server-Code – ohne eigene Freigabe.
