# JARVIS – Masterplan (dauerhaftes Projektgedächtnis)

Gemeinsame Projektübersicht für Dino, Claude, ChatGPT und andere Entwickler. Sie **ersetzt nicht die Prüfung des aktuellen Codes**: Aufbau und Dateien stehen in `ARCHITEKTUR.md` und `LANDKARTE.md`, dieser Plan sagt, **was beschlossen, im Bau und offen ist**.
Pflege: siehe Abschnitt 8. Stand: 07.11.2026, nach PR #375.

## 1. Projektziel
Jarvis (intern noch „Zane“) ist Dinos persönlicher Sprachassistent als Web-App (PWA auf Vercel) plus Weckruf-APK für Android. Er arbeitet nur am Handy (Samsung), spricht Deutsch, antwortet kurz und ohne Fachjargon. Ziel der nächsten Phase: ein Jarvis, den Dino anderen Menschen **zuverlässig vorführen** kann – er versteht natürliche Sprache, wählt seine Werkzeuge selbst, prüft Ergebnisse und erfindet nichts.

## 2. Bestehende Fähigkeiten und Architektur (nicht als fehlend eintragen!)
Quelle der Wahrheit: `ARCHITEKTUR.md` (Überblick, Stolperfallen), `LANDKARTE.md` (Problem → zuständige Datei), `js/faehigkeiten.js` (Fähigkeiten-Verzeichnis).
- **Weg einer Frage:** `voice.js` → feste Sprachbefehle (`commands.js`, `jvCommands`) → `mehrfach.js` (Mehrfachfragen) → optional Chef-KI (`chef.js`, Schalter, Standard AUS) → `assistant.js` (ein Groq-Aufruf, JSON `{reply, actions[]}`) → Aktionen (`actions.js`, benannte Kette `aktionen_kette.js`) → Antwort per `speak`. Internetrecherche: `web_lookup` → `answers.js` (zweiter Groq-Aufruf mit `browser_search`).
- **Werkzeug-/Fähigkeitenregister bereits vorhanden:** `registry.js`, `registry_faehigkeiten.js`, `registry_schreibkern.js` (Phase 2 / Paket B1); Chef-KI plant damit Schritte (ortssuche, websuche, wetter …).
- **Gesprächsgedächtnis:** `gespraech.js` (`jvGespraech`: Listen, Auswahl, letzte Antworten, 10 Minuten, nur Arbeitsspeicher), `gespraech_ort.js`, `gespraech_antwort.js` (Anschlussfragen/Routing, Diagnose-Zeile), Langzeitgedächtnis `langzeit.js`/`gedaechtnis.js`/`api/memory.js`.
- **Einkauf/Preise (neu, PR #369–#375):** `preissuche.js` (Serper-Preissuche, Preiswächter), `wunschliste.js`, `produktkarten.js` (Karten mit Bild/Preis/Händler/Link, Auslese genannter Produkte, lokale Anschlussfragen, kombinierte Produktfragen), `api/maps.js` (shopping, Händlerlink-Suche).
- **Fotos:** `foto_kette.js`, `foto_erkennen.js`, `foto_brief.js`, `foto_abtippen.js`, `foto_adresse.js`, `foto_person.js`, `foto_rezept.js`, `foto_stundenplan.js`, `foto_urlaubsplan.js`, `foto_essensplan.js`, `fotosenden.js`; Produktfoto/Lens (Tests `foto_produkt`, `foto_lens`); Rechnungen/Kündigung/Behördenbrief: `rechnungen.js`, `kuendigung.js`, `behoerdenbrief.js`.
- **Weitere:** Kalender/Erinnerungen/Aufgaben, Wetter/Unwetter, Fahrzeit/Verkehr/Stau (`travel.js`, `fahrtcheck.js`, `stadtverkehr.js`, `api/stau.js`), Ortssuche, Schicht, Spotify, Schlafmodus/WhatsApp-Vertretung (APK), Autoansicht, Ausflugs-Planer, Termin-Finder, Dirigent/Tagesmeldungen (`dirigent.js`), Meldungs-Sammelstelle (C1), geführte Tour (`anleitung.js`) und Hilfe (`help.js`).
- **Server:** 11 von 12 erlaubten Vercel-Functions in `api/` belegt. **KI:** Groq (`openai/gpt-oss-120b`), `api/groq.js` ist reine Durchleitung.

## 3. Aktueller Entwicklungsstand
- PR #369 (Gesprächsfaden), #370 (Anschluss-Merker), #371 (Routing statt Prompt), #372 (Produktkarten), #373 (Händlerlinks ehrlich + kombinierte Produktfragen ohne Ortsrückfrage), #374 (gezielte Händlersuche), #375 (Links für tatsächlich angezeigte Angebote): **gemergt**.
- Händlerlink-Korrektur umgesetzt; **tatsächlicher Erfolg auf dem Handy noch nicht abschließend bestätigt**. Bei Bedarf später mit der Diagnose („Diagnose an“, Zeilen „Händlerlinks …“ / „Angebote …“) erneut prüfen – jetzt keine weitere Reparaturrunde.
- **PR #365** (Schichtzeiten, Branch `jarvis-schichten`) bleibt offen und **unangetastet**. PR #363 / Branch `studio-bilder` sind obsolet (Rückfrage an Dino offen).
- **Nächste Phase:** Werkzeugzentrale, KI-Dirigent, intelligente Kamera.

## 4. Priorisierte Roadmap
Status: Geplant, In Arbeit, Fertig, Blockiert. „Bestehendes nutzen“ heißt: auf vorhandenem Code aufbauen, nichts parallel neu bauen.

| Priorität | Funktion | Status | PR | Nächster Schritt |
|---|---|---|---|---|
| P1 | Zentrale Werkzeugverwaltung (Internet, Produkt/Preis, Wetter, Kalender, Erinnerungen/Aufgaben, Navigation/Verkehr, Gedächtnis, Foto, Dokumente/Rechnungen, Kontakte, Berechnungen, weitere) | Geplant | – | Bestand der Register (`registry*.js`, `faehigkeiten.js`) mit den tatsächlich vorhandenen Werkzeugen abgleichen; Lücken schließen, keine zweite Implementierung |
| P1 | Intelligenter KI-Dirigent (natürliche Sprache, Werkzeugwahl, Mehrfachaufgaben, Kombination, Selbstbezüge, gezielte Rückfragen, Fehlerbehandlung, Ergebnisprüfung, nichts erfinden) | In Arbeit | #377, #378, #380, #382, #383 | Schritt 5 (#383): Plausibilitätsprüfung der Route (Luftlinie, Umwegfaktor, Geschwindigkeit; gezielt neu rechnen, sonst ehrlich nachfragen), nur Meldungen auf der Route. Schritt 4 (#382): Werkzeug `fahrzeit` (nutzt `routeDurationSeconds`/`describeAutobahnStau`, nennt ausdrücklich „mit aktuellem Verkehr“ bzw. „keine Live-Auskunft“, bei Fehler keine Zahl, Fahrzeit nie per Websuche). Schritt 3 (Phase 5, #380): Werkzeug `jarvis_info` (Selbstbezug „du = Jarvis“, echte Fähigkeitenliste aus der Registry), Entscheidungsregeln im Planer (Wissensfragen direkt, Aktuelles automatisch per Websuche, mehrteilige Fragen der Reihe nach), Schreibschutz (Planer darf ohne ausdrücklichen Wunsch nichts schreiben → alter Weg genau einmal). Weiterhin nur im Testmodus (Standard AUS). Schritt 1 erledigt: Kette (Ergebnis eines lesenden Schritts an den nächsten), Erfolgsprüfung, Websuche als Ausweg – nur im Chef-KI-Weg (Standard AUS). Schritt 2 (Phase 3): Werkzeug `produktsuche` (nutzt die vorhandene Preissuche, Händler/Preis/Link zusammen, Ergebnis für Folgeschritte nutzbar). Offen: Chef-KI als Standard-Dirigent (Entscheidung Dino), Planer-Qualität mit echter Groq-KI am Handy prüfen |
| P1 | Fahrzeit mit Startort auch bei ausgeschalteter Chef-KI | Fertig | #384 | Ursache: der alte Weg kannte nur den GPS-Standort („von Schwarzenbek“ ignoriert, keine Plausibilitätsprüfung). Jetzt nutzt er bei „von X zum Y“ ohne Ankunftszeit das Fahrzeit-Werkzeug. |
| P1 | Fahrzeit: travel_time ohne Ziel / klein geschriebener Satz | Fertig | #385 | Handy-Diagnose: KI lieferte travel_time ohne Ziel, #384 griff nicht. Jetzt Ziel und Start aus dem Satz; Weg steht im Terminal-Stream („FAHRZEIT: WERKZEUG …“ / „ALTER WEG (Grund)“). |
| P1 | Fahrzeit: gewählter Weg im Diagnosefenster | Fertig | #386 | Nach #385 blieb der Handyfehler; der Terminal-Stream wird sofort überschrieben. Der Weg (Werkzeug/alter Weg, Start, Ziel, Luftlinie, Route) steht jetzt im vorhandenen Diagnosefenster („Diagnose an“). Ursache noch nicht bewiesen. |
| P1 | Fahrzeit: Ziel in falscher Stadt (Hamburger Hauptbahnhof → Münster) | Fertig | #387 | Handy-Diagnose bewies: Treffer „Münster … Hamburger Straße“ passte, weil der Stadtname nur in der Straße stand. Jetzt zählt nur der Ort (strukturierte Angaben des Geocoders, sonst Namensteile ohne Straße), zweite Suche „Hauptbahnhof, Hamburg“, sonst Nachfrage. Auch „Münchner“ wird jetzt erkannt. |
| P1 | Phase 5.1 Schritt 1: Abfahrtsfragen („Wann muss ich losfahren?“) bleiben beim vorhandenen Abfahrtsweg | Fertig | #388 | Chef-KI plant dafür kein `fahrzeit` (nur Fahrdauer, keine Ankunftszeit/Puffer): Vorfilter überspringt, ein Plan mit `fahrzeit` wird verworfen. Kontakt-/Gedächtnis-/Abfahrts-Werkzeuge folgen in späteren Schritten. |
| P1 | Phase 5.1 Schritt 2: Kontakte und Gedächtnis lesend (`kontakte_lesen`, `gedaechtnis_lesen`), persönliche Fahrziele | Fertig | #389 | Registry-Werkzeuge nutzen `contactList`/`contactKey`, `findMemoryAddressFor`, `searchMemory`. `fahrzeit` löst „meine Mutter/Zahnarzt“ zuerst über Kontakte (dann Gedächtnis), mehrdeutig → Nachfrage. Offen für Schritt 3: Zielstadt-Prüfung im alten Abfahrtsweg (`computeDepartureAdvice`), Abfahrts-Werkzeug. |
| P1 | Phase 5.1 Schritt 3: Abfahrtsplanung als Werkzeug `abfahrt` (Ankunftszeit → späteste Abfahrt) + Zielstadt-Prüfung im alten Abfahrtsweg | Fertig (PR offen) | #390 | `abfahrt` ruft die bestehende `computeDepartureAdvice` (Puffer, Staumeldungen) auf, löst Personen über Kontakte auf, fragt bei fehlendem Ziel/unklarer oder vergangener Uhrzeit nach und sagt ehrlich, dass die Verkehrslage nur die von jetzt ist. Die Zielstadt-Prüfung aus #387 sitzt jetzt gemeinsam in `travel.js` (`ortStimmt`, `geocodeDestinationPruefen`) und gilt auch im alten Weg für „Hamburger Hauptbahnhof“-artige Ziele. Vorfilter #388 angepasst: Abfahrtsfragen erreichen den Planer, ein Plan nur mit `fahrzeit` wird verworfen. Offen: Startort „von X“ im Werkzeug, echte Verkehrsprognose. |
| P1 | Automatische Internetrecherche ohne „Such im Internet“ | In Arbeit | #380 | Planer-Regel + Vorfilter (nur im Testmodus); Echtprüfung am Handy offen |
| P1 | Antworten als Text sichtbar (zum Testen der Chef-KI am Handy) | Fertig (PR offen) | #383 | Fahrzeit: Plausibilitätsprüfung (314-km-Fehler), nur Meldungen auf der Route, Startort aus dem Satz | PR offen, nicht gemergt |
| #382 | Fahrzeit/Verkehr als Werkzeug `fahrzeit` (Chef-KI), Test `tests/chef_fahrzeit.js` | gemergt |
| #381 | Schalter „Antworten als Text anzeigen“ (Standard AN); am Handy prüfen, ob Karte und Kopieren gut bedienbar sind |
| P1 | Intelligente Kamera (erkennt, was fotografiert wurde, bereitet Aktionen vor) | In Arbeit | #379 | Schritt 1 erledigt: Produktfoto → `produktsuche`, Gerät/Fehlercode → Websuche, Textfoto → Angebot (erklären/zusammenfassen), Chef-KI-Werkzeug `foto_info`, Merken für Anschlussfragen; Rechnung/Visitenkarte weiter über `foto_brief`/`contact` mit eigener Bestätigung. Offen: Ersatzteil, Dokumente ablegen, Chef-KI als Standard-Dirigent |
| P1 | Natürliches Gespräch und Gedächtnis (Anschlussfragen, Kontext, Mehrdeutigkeit, Selbstbezüge „du/dich/deine Funktionen“, keine erfundenen Erinnerungen) | In Arbeit | #369, #370, #371, #372, #373 | Produktbereich fertig; Selbstbezüge und allgemeine Themen über den Dirigenten |
| P1 | Erfolgsprüfung (Termin/Erinnerung wirklich gespeichert, Werkzeugfehler erkennen, keine falschen Erfolgsmeldungen, sichere Wiederholung) | Geplant | – | Vorhandenes prüfen (`aktionen_kette.js`, Test `aktionserfolg`), Lücken benennen, dann schließen |
| P1 | Produktkarten mit Bild, Preis, Händler, Kauflink, Anschlussfragen | Fertig | #372, #373, #374, #375 | Händlerlinks am Handy bestätigen (offen) |
| P2 | Intelligentes Stromsparen und Hintergrundmanagement | Geplant | – | Bestand `tests/hintergrund-analyse.md` lesen |
| P2 | Natürliches Unterbrechen während Jarvis spricht (ohne erneutes Aktivierungswort) | Geplant | – | Sprach-/APK-Weg prüfen (`voice.js`, `native_speech.js`, Weckruf) |
| P2 | Schwere Verkehrsstörungen entlang der echten Route priorisieren, keine falschen Straßen-/Sperrungszuordnungen | Geplant | – | `stadtverkehr.js`, `api/stau.js`, `fahrtcheck.js` prüfen |
| P2 | Proaktive Rückfragen mit klarer Aktion („Soll ich dich daran erinnern?“ statt „Soll ich?“) | Geplant | – | Dirigent/Meldungen (`dirigent.js`, `meldungen.js`) |
| P2 | Mehrstufige Planung von Ausflügen und Terminen (Wetter, Öffnungszeiten, Kosten, Verfügbarkeit) | Geplant | – | Auf `ausflug.js` und `terminfinder.js` aufbauen |
| P2 | Spezialisierte KI-Mitarbeiter (Recherche, Entwickler, Qualitätsprüfer, Finanz, Geschäftsberater); Jarvis erkennt Schwächen, schlägt Verbesserungen vor, bereitet kontrollierte Reparaturen vor | Geplant | – | Erst nach Werkzeugzentrale/Dirigent; **keine selbstständigen produktiven Codeänderungen oder Merges ohne ausdrückliche Zustimmung** |
| P2 | KI-Geschäftsberater (Marktlücken, Wettbewerb, Budgets, Umsatz/Kosten/Gewinn/Risiko/Zeit, Geschäftspläne) | Geplant | – | Nach den spezialisierten Mitarbeitern |
| P3 | Großer Praxistest (Gespräche, Mehrfachfragen, Recherche, Kamera, Produkt/Preis, Termine/Erinnerungen, Gedächtnis, Selbstbezüge, Werkzeugkombinationen, Fehlerbehandlung) | Geplant | – | Nach P1; Ziel: Vorführbarkeit |

## 5. Bekannte Fehler und Einschränkungen
- **Händlerlinks:** Erfolg am Handy offen. Links kommen aus einer zusätzlichen Websuche (höchstens 1 + 5 Anfragen), nicht live gegen den Suchdienst getestet; kleine Shops können ohne Link bleiben (Karte sagt es). Preis und separat gesuchter Link sind **nicht** als identisches Live-Angebot zu verstehen.
- **Produktbilder** nur, wenn der Preisdienst (serper.dev) eine Bild-Adresse liefert.
- **Produktgedächtnis:** 10 Minuten, nur im Arbeitsspeicher (nach App-Neustart leer); „Welches ist besser?“ (Qualität) läuft weiter über die KI.
- **Chef-KI** (`chef.js`) ist standardmäßig AUS (Schalter in den Einstellungen / `jv_chef`); nicht ungefragt einschalten.
- Weitere dokumentierte, bewusst offene Punkte: `ARCHITEKTUR.md`, Abschnitt „Bekannte offene technische Punkte“.
- Änderungen unter `weckruf-src/` lösen einen APK-Bau aus; Dino muss die neue APK installieren.

## 6. Technische Entwicklungsregeln
- Groq beibehalten. Keine zusätzlichen kostenpflichtigen KI-Dienste ohne Zustimmung.
- Vercel Hobby: höchstens 12 Functions in `api/` (11 belegt) – Neues in bestehende Dateien einbauen, keine unnötigen neuen Serverfunktionen.
- Vorhandene Funktionen wiederverwenden, bestehende nicht beschädigen, zusammengehörige Änderungen bündeln.
- Immer Branch + Pull Request, nie ZIP; **niemals ohne Dinos ausdrückliche Freigabe („Ja“) mergen**. Dino nennt bei jedem Umbau, welche Dateien gelöscht werden sollen („Zu löschen: …“).
- Namen: nach außen **Jarvis**, intern „Zane“; Schlüssel mit `nova_` und `jv_` nicht umbenennen.
- Neue Skripte in `index.html` ohne `?v=` einhängen, dann `node tools/stempel.js` (nie Stempel von Hand). Neue Nutzerfunktion: Schritt in `js/anleitung.js` und Beispiel in `js/help.js`. Neue Tests in `.github/workflows/tests.yml` und `tests/inventar8a.js` eintragen.
- Tokenverbrauch gering halten, keine unnötigen vollständigen Repository-Analysen, während der Entwicklung gezielt testen, vor dem Merge die GitHub-CI-Prüfungen abwarten.
- Optische Änderungen erst als Bild zeigen. Antworten an Dino: Deutsch, kurz, ohne Fachjargon.
- **PR #365 unangetastet lassen.**

## 7. Fortschritt und PR-Verweise
| PR | Inhalt | Stand |
|---|---|---|
| #369 | Gesprächsfaden: echte Websuch-Antwort ersetzt „Ich schaue nach“ im Verlauf | gemergt |
| #370 | Anschluss-Merker (`gespraech_antwort.js`) | gemergt |
| #371 | Routing statt Prompt: Händlerfragen ohne Einkaufslisten-Eintrag | gemergt |
| #372 | Produktkarten (Bild, Preis, Händler, Link; lokale Anschlussfragen) | gemergt |
| #373 | Händlerlinks ehrlich (Idealo nur als Vergleich) + kombinierte Produktfragen ohne Ortsrückfrage | gemergt |
| #374 | Gezielte Händlersuche je Händler, Diagnose | gemergt |
| #375 | Händlerlinks für tatsächlich angezeigte Angebote | gemergt |
| #377 | Chef-KI Phase 2: lesende Ketten (`aus`), `pruefeErfolg` wirksam, Websuche-Ausweg für Wetter/Ortssuche; Standard weiter AUS | gemergt |
| #378 | Registry-Werkzeug `produktsuche` (`js/registry_produkt.js`) über die vorhandene Preissuche; Chef-KI darf es planen (höchstens 2 je Plan), kein Fallback auf freie Websuche | PR offen, nicht gemergt |
| #381 | Antworten als Text: `js/antwort_text.js` (Karte, Verlauf, Kopieren, Schalter), Test `tests/antwort_text.js` | gemergt |
| #380 | Intelligenter Dirigent: `jarvis_info`, Planer-Regeln, Schreibschutz, Test `tests/chef_dirigent.js` | gemergt |
| #379 | Intelligente Kamera Schritt 1: `js/foto_werkzeuge.js` (Foto → produktsuche / Recherche / Text), Registry `foto_info`, Arbeitsregeln in `CLAUDE.md` | gemergt |
| #365 | Schichtzeiten (`jarvis-schichten`) | offen, nicht anfassen |
| dieser PR | Masterplan + Regel in `CLAUDE.md` (nur Dokumentation) | siehe Abschnitt 8 |

## 8. Pflege des Masterplans
Vor jedem Entwicklungsauftrag die relevanten Abschnitte lesen (Prioritäten, offene Aufgaben, Regeln); bereits Erledigtes nicht wiederholen. Nach Abschluss **nur die betroffenen Einträge** aktualisieren: Status und PR-Nummer in Abschnitt 4 und 7, neue Entscheidungen und offene Probleme in Abschnitt 5, neue beschlossene Funktionen in Abschnitt 4 aufnehmen. Unbeteiligte Einträge unverändert lassen. Andere KI-Entwickler orientieren sich an denselben Regeln. Der Masterplan ist eine Übersicht; maßgeblich bleibt der aktuelle Code.
