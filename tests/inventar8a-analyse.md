# Phase 8A: Schlussinventur (nur Analyse, kein Produktcode geändert)

Prüfung: `tests/inventar8a.js` (Soll: `tests/inventar8a_soll.json`). Dateitabelle erzeugen: `node tests/inventar8a.js --tabelle`.
Stand: main 80a7d49. Gelöscht wird in 8A nichts. Alles unten ist Empfehlung.

## 1. Zahlen (heute gegen Phase 1 = Stand f8e6db1)
| | Phase 1 | heute |
|---|---|---|
| Dateien im Repo | 250 | 314 |
| Produkt-JS in `js/` | 167 | 169 (neu: `foto_kette.js`, `speak_kette.js`) |
| JS-Zeilen | 43178 | 43534 |
| JS-Bytes | 3032680 | 3065679 |
| gzip | 908760 | 923833 |
| Script-Tags | 174 (167 eigene, 2 fremde, 5 inline) | 176 (169 eigene, 2 fremde, 5 inline) |
| `api/` | 11 | 11 (Grenze 12 eingehalten) |
| Tests (Dateien in `tests/`) | 22 (17 js) | 83 (47 js, 14 md, 22 json) |
| Workflows / weckruf-src | 3 / 26 | 3 / 26 |

Das Wachstum kommt fast nur aus Tests und Doku. Der Produktcode ist um 2 Dateien und rund 33 KB gewachsen.

## 2. Klassifikation der Produkt-JS (A–E)
A behalten 144, B klein aber sinnvoll 16, C historischer Ballast 8, D verdächtig tot 0, E nachweislich tot 0. Jede Datei einzeln: `node tests/inventar8a.js --tabelle`.
- C = die acht Dateien mit altem Rückfallzweig der Aktions-Kette (`else window.executeAction = baue(...)`): formulierungen, geburtstag_ganztag, gedaechtnis, lagebild, langzeit, langzeit_erinnern, loeschen_fragen, routinen. Sie sind aktiv und nötig; nur der Rückfallzweig ist überholt (die Kette hat seit Phase 3 keinen Rückfall mehr).
- D/E leer: Der Erkenner (Wirkung = Timer, Listener, Ketteneintrag, fetch, Bridge, `.onXxx =` …, Nutzer = Name wird in anderen Js/HTML/Java/api gebraucht) findet keine Datei ohne Wirkung. `hoeren.js` wurde zuerst als D markiert, ist aber aktiv (setzt `recognition.onresult`); der Erkenner wurde deshalb um `.onXxx =` erweitert. Das zeigt: ein Treffer in D ist nur ein Verdacht, nie ein Löschgrund.
- Kleine Dateien (≤ 80 Zeilen, 28 Stück, in der Soll-Datei unter `kleineDateien`) sind kein Löschgrund. Beispiele: `hoeren.js`, `loesch_notiz.js`, `wake_start.js`, `tempo.js`.

## 3. Reste (nicht entfernt)
- Rückfallzweig der Aktions-Kette: 8 Dateien. Eigenschaftskopie `Object.keys(original).forEach`: 6 Dateien. Foto-/Speak-Kette: keine Rückfälle.
- Guard-Marker (`xyz._name = true`): 27 Stück in 22 Dateien. Testhaken `window._xTest`: 13 Dateien.
- Wirkung: alle aktiv. Sicher entfernbar erst nach Umbau auf die Kette und Golden-Master-Vergleich (Tests: `aktionen`, `aktionen_kette`, `reihenfolge`).

## 4. Duplikate
- Gleichnamige globale Funktionen in mehreren Dateien: keine.
- Identische Funktionskörper (≥ 150 Zeichen): 17 Gruppen an 61 Stellen, größte: `ruhig` (kennenlernen = zane_redet), `rohMail` (mail_nacht = mailaktionen). Das ist bewusste Kleinduplizierung innerhalb von Skript-IIFEs.
- Lokale Hilfen mit verschiedenen Fassungen (gefährlich bei Zusammenlegung): `norm` 43 Kopien/19 Fassungen, `sagen` 30/11, `say` 26/12, `esc` 15/15, `befehl` 35/35, `lsGet` 29/2, `lsSet` 29/4.
- Empfehlung: nichts automatisch zusammenführen. Jede Fassung hat eigene Sonderfälle; ein Zusammenführen ändert Verhalten.

## 5. Ketten und Verzeichnisse (zur Laufzeit gemessen)
| Name | Besitzer | Einträge | doppelte Ränge | Vollständigkeitsprüfung | Rückfall | dokumentiert |
|---|---|---|---|---|---|---|
| jvAktionen | aktionen_kette.js | 8 Hüllen | 0 | `pruefe()` | in 8 Dateien (C) | ja |
| jvFotoKette | foto_kette.js | 7 Methoden / 48 Einträge | 0 | `pruefe()` | nein | ja |
| jvSpeakKette | speak_kette.js | 6 | 0 | `pruefe()` | nein | ja |
| jvCommands | commands.js | 96 | 25 Einträge mit gleichem Rang (Reihenfolge der Anmeldung entscheidet) | – | nein | ja |
| jvChain | commands.js | Erweiterungen von Prompt und Menü (von rund 21 Dateien genutzt) | – | – | nein | ja |
| jvKiText / jvSuchQuellen | kitext / assistant, foto_stundenplan, langzeit | siehe Soll | – | durch `kitext.js`, `suche.js` | – | ja |
| jvFaehigkeiten | faehigkeiten.js | 8 Fähigkeiten, 41 genannte Dateien | – | `faehigkeiten.js` (391) | – | ja |
| jvMeldungen / jvRegeln | meldungen.js / meldungs_regeln.js | siehe Soll | – | `meldungen.js`, `regeln.js` | `scharf`-Schalter | ja |
Fähigkeiten nennen nur einen Teil der Dateien (128 Produktdateien sind in keiner Fähigkeit genannt, das sind Hilfs- und Querschnittsdateien). Ein Fremder findet den Weg über `LANDKARTE.md` (alle 169 Dateien je genau einmal zugeordnet, geprüft von `tests/landkarte.js`) besser als über die Fähigkeiten.

## 6. LANDKARTE.md / ARCHITEKTUR.md gegen das Repo
- richtig: Foto-/Speak-/Aktionskette, Prompt/jvChain, Mehrfachfragen, C1 (jvMeldungen/jvRegeln), KI-Text, Gedächtnis (7A/7B), Hintergrundprozesse (6B).
- veraltet: ARCHITEKTUR.md Zeile 16 nennt „168 Skripte“, richtig ist 169 (LANDKARTE.md sagt 169). „Projektstand und nächste Schritte (Stand 24.10.2026)“ in Abschnitt 8 ist älter als der Rest.
- unvollständig: die offenen GELB-Punkte stehen verteilt in den Analyse-Dateien (`tests/*-analyse.md`), nicht an einer Stelle.
- widersprüchlich: nichts gefunden.

## 7. Testbestand
24 Schritte im Workflow, alle mit Datei. Klassen (in der Suite festgelegt): Regression 13, Golden Master 8, Inventar 3 (`landkarte`, `timer`, `inventar8a`), historisch eingefroren 1 (`memory7a`, läuft gegen den Zustand vor 7B), Hilfsdateien 18, lokale Werkzeuge 4. Möglicherweise überlappend (nur Hinweis, nichts löschen): `aktionen` / `aktionen_kette`, `hintergrund` / `hintergrund_6b1` / `6b2`, `memory7a` / `memory7b`.

## 8. Doku-Bestand
Aktuell: ARCHITEKTUR, LANDKARTE, CLAUDE, `memory7b-analyse`, `hintergrund-6b1`, `hintergrund-6b2`, `kitext-ist-zustand`, `suche-ist-zustand`, diese Datei. Momentaufnahmen (Stand der jeweiligen Phase, nicht gepflegt): `ist-zustand`, `sprache-ist-zustand`, `globale-ist-zustand`, `wirkungslos-analyse`, `hintergrund-analyse`, `hintergrund-tabelle`, `meldungen-bericht`, `regeln-bericht`, `memory7a-analyse`. Fünf davon tragen keinen Hinweis „Momentaufnahme“ (Soll-Datei: `momentaufnahmeOhneHistorischHinweis`). Empfehlung 8B: Hinweiszeile ergänzen, nichts löschen.

## 9. GitHub Actions (CI-ROT)
Workflow `App-Tests`, ubuntu-latest, Node 20, 24 Test-Schritte. Der Lauf auf main schlägt am Schritt `tests/sprache.js` fehl. Ursache: GitHub rechnet in UTC, `sprache.js` (5 Fehler) und `globale.js` (3 Fehler) setzen die Zeitzone nicht fest (die übrigen Prüfungen setzen `process.env.TZ='Europe/Berlin'`). Nachgestellt im sauberen Klon mit Node 22: `TZ=UTC node tests/sprache.js` und `TZ=UTC node tests/globale.js` schlagen fehl, mit `TZ=Europe/Berlin` laufen alle grün. Node 20 selbst konnte hier nicht installiert werden (Netz), die Logs sind von hier nicht abrufbar; den fehlgeschlagenen Schritt zeigt aber die Actions-Schnittstelle. Nicht repariert (Regel 8A). Empfehlung 8B: `TZ: Europe/Berlin` im Workflow oder `process.env.TZ` in beiden Tests, danach neu laufen lassen. Das ändert nur Testumgebung, nicht Produktcode.

## 10. Verwaiste Dateien
Ohne Verweis irgendwo: `models/.gitkeep`, `weckruf-src/liesmich.txt`, `package.json` (nur für Werkzeuge), `beispielrechnung.jpg` (nur als Beispielbild genannt), dazu diese neue Suite selbst. Keine Produkt-JS ist verwaist.

## 11. index.html, Service Worker, Android, API
- index.html: keine doppelten, fehlenden oder verwaisten Script-Tags; alle 169 haben einen Stempel; Reihenfolge-Eckpunkte wie in Phase 1 (`aktionen_kette` direkt nach `actions`, `foto_kette` nach `places`, `speak_kette` nach `voice`). Fremde Quellen: 2. Inline-Skripte: 5.
- `sw.js`: nur Push, kein fetch-Handler, keine Cache-Liste. Manifest-Icons vorhanden. Cache-Verhalten hängt allein an den `?v=`-Stempeln.
- Android: 55 native Methoden, alle von JS genutzt; alle Rückrufe der APK (`__zaneChange`, `__zaneFiles`, `__zaneRec`, `__zaneWakePending`, `zaneWake`, `jvPlan`, `jvAutoansicht`, `jvSchlaf`, `jvFahrWA`) haben ein Ziel im Web-Code. Dadurch ist keine native Brücke löschbar.
- API: 11 Dateien, jede hat einen Aufrufer im Client.

## 12. Löschkandidaten (nur Empfehlung)
- SICHER (mit Beweis): keine. Kein Produkt-JS ist nachweislich tot.
- EVENTUELL: `beispielrechnung.jpg` (kein Aufrufer außer Doku), `models/.gitkeep`, `weckruf-src/liesmich.txt` (Löschen löst einen APK-Bau aus).
- NICHT LÖSCHEN: alle kleinen aktiven Dateien (z. B. `hoeren.js`, `loesch_notiz.js`, `wake_start.js`), die acht C-Dateien (aktiv), `CLAUDE.md`, `package.json`, alle Tests und Docs.

## 13. Neue Suite
Prüft u. a.: Produktdatei fehlt in der Landkarte, Script doppelt, Script-Datei fehlt, Chain-Datei fehlt, genannter Besitzer fehlt, Capability zeigt auf fehlende Datei, verwaister Script-Tag, js-Datei ohne Tag, wichtige Architekturdatei fehlt, Dead-Code-Erkenner. Gegenproben ändern nur den Prüf-Eingang im Speicher.

## Phase 8B: CI-Zeitzone (Ergebnis, Nachtrag)
**Ursache der 8 Fehler (gemessen, kein Raten).** Die Testwelt (`tests/umgebung.js`) hat eine feste Uhr (Standard Mittwoch 28.10.2026 10:00 Berlin), aber die Zeitzone kam vom Rechner. Die App liest die lokale Gerätestunde (`new Date().getHours()` in `js/laune.js` Zeile 70, weitere Stellen z. B. `jarvis.js`, `konto.js`, `persona.js`). Unter UTC ist es in der Testwelt 9 statt 10 Uhr, `laune.js` wählt andere Stimmungsgewichte, und ein Zufallswert (festgesetzt auf 0.5) fällt auf eine andere Stimmung.
| Prüfung | erwartet (Berlin) | UTC-Wert | betroffene Funktion |
|---|---|---|---|
| sprache G3_fish | `[playful] Okay.` | `[cheerful] Okay.` | Stimmungs-Tag der Cloud-Stimme (`laune.js`) |
| sprache G3b_fish_lang | `[playful] Heute ist ein schöner Tag …` | `[cheerful] …` | dasselbe |
| sprache G4_ack | `[playful] Einen Moment.` | `[cheerful] Einen Moment.` | dasselbe |
| sprache G9_native | `[playful] Zu Diensten, Sir.` | `[cheerful] Zu Diensten, Sir.` | dasselbe |
| sprache G1b_sprueche | `[cheerful] Diesel kostet …` | `[excited] Diesel kostet …` | dasselbe |
| globale B1 Spät-Variante | SPRACHSTIL „verschmitzt und neckisch“ | „richtig gut gelaunt …“ | `buildSystemPrompt`, Stimmungssatz aus `laune.js` |
| globale B1 Früh-Variante | wie oben | wie oben | dasselbe |
| globale B1 Einstellungen (Lachwunsch/Lachen aus) | wie oben | wie oben | dasselbe |
Die Fachlogik erwartet ausdrücklich die lokale Gerätezeit (Jarvis läuft auf einem Handy in Deutschland, die Stimmung hängt an der Tageszeit). Der Prompt-Unterschied unter UTC ist ein einzelner Satz (Diff geprüft), nicht die Logik.
**Entscheidung: Variante 1 (Testvertrag ist Europe/Berlin).** Begründung: die Stimmung ist fachlich Ortszeit; ein zeitzonenunabhängiger Test würde die Uhr der Testwelt anders deuten als das Gerät. **Änderung:** eine Zeile in `tests/umgebung.js` (`process.env.TZ = 'Europe/Berlin';` vor dem ersten `require`), also zentral für alle Suiten, die die Testwelt nutzen. Workflow, Node-Version (20) und Testbefehle unverändert, weil sie kein Problem darstellen. Produktcode, Soll-Werte und Assertions unverändert.
**Gegenprobe:** `sprache.js` 178 und `globale.js` 93 Prüfungen, 0 Fehler unter `TZ=UTC`, `Europe/Berlin`, `America/Los_Angeles`, `Asia/Tokyo`. Die Suite `tests/inventar8a.js` prüft den Vertrag (Zeile vorhanden, vor dem ersten `require`, `sprache.js`/`globale.js` hängen an `umgebung.js`).
**Weitere Workflows:** `oww-test.yml` und `zane-weckruf.yml` laufen nur bei Änderungen an `weckruf-*` bzw. manuell, haben mit den Tests nichts zu tun und wurden nicht geändert.

**Zweite Ursache für die rote CI (erst nach dem Zeitzonen-Fix sichtbar).** Der Workflow bricht beim ersten Fehler ab, deshalb blieben spätere Schritte bisher verdeckt. Nach dem Fix schlug auf GitHub `tests/hintergrund_6b2.js` fehl (Schritt 25 in null Sekunden). Die Fehlermeldung ließ sich über eine temporäre Diagnose-Ausgabe lesen (Annotation, Node v20.20.2, UTC, 4 CPUs): `git show 4d5b9e6:js/synapsen.js` → `fatal: invalid object name '4d5b9e6'`. `actions/checkout@v4` holt standardmäßig nur den letzten Commit; der Test vergleicht mit dem Stand vor 6B.2 aus dem Git-Verlauf. Lokal gab es den Fehler nie, weil dort der volle Verlauf vorhanden ist. Es ist der einzige Test, der `git show` nutzt. **Änderung:** `fetch-depth: 0` beim Checkout im Workflow (Testvertrag: der Test braucht den Verlauf). Testcode, Soll-Werte und Assertions unverändert. `memory7a`, `memory7b`, `inventar8a` liefen in der Diagnose ohne eigenen Fehler.
