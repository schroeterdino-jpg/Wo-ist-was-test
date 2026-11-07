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
| P1 | Intelligenter KI-Dirigent (natürliche Sprache, Werkzeugwahl, Mehrfachaufgaben, Kombination, Selbstbezüge, gezielte Rückfragen, Fehlerbehandlung, Ergebnisprüfung, nichts erfinden) | In Arbeit | #377, Phase 3 (PR siehe Abschnitt 7) | Schritt 1 erledigt: Kette (Ergebnis eines lesenden Schritts an den nächsten), Erfolgsprüfung, Websuche als Ausweg – nur im Chef-KI-Weg (Standard AUS). Schritt 2 (Phase 3): Werkzeug `produktsuche` (nutzt die vorhandene Preissuche, Händler/Preis/Link zusammen, Ergebnis für Folgeschritte nutzbar). Offen: Chef-KI als Standard-Dirigent (Entscheidung Dino), Foto-Anbindung, Selbstbezug „du = Jarvis“ |
| P1 | Automatische Internetrecherche ohne „Such im Internet“ | Geplant | – | Entscheidungsregel im Dirigenten (Teil des Dirigenten-Entwurfs) |
| P1 | Intelligente Kamera (erkennt, was fotografiert wurde, bereitet Aktionen vor) | Geplant | – | An Werkzeugzentrale/Dirigent anbinden; Rechnung, Produkt/Ersatzteil, Visitenkarte, Gerät/Fehlercode, Text/Dokument; vorhandene `foto_*`-Dateien nutzen, **keine isolierte Zusatzfunktion**; verbindliche Aktionen nur mit Dinos Freigabe |
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
| Phase 3 (`chef-produktsuche`) | Registry-Werkzeug `produktsuche` (`js/registry_produkt.js`) über die vorhandene Preissuche; Chef-KI darf es planen (höchstens 2 je Plan), kein Fallback auf freie Websuche | PR offen, nicht gemergt |
| #365 | Schichtzeiten (`jarvis-schichten`) | offen, nicht anfassen |
| dieser PR | Masterplan + Regel in `CLAUDE.md` (nur Dokumentation) | siehe Abschnitt 8 |

## 8. Pflege des Masterplans
Vor jedem Entwicklungsauftrag die relevanten Abschnitte lesen (Prioritäten, offene Aufgaben, Regeln); bereits Erledigtes nicht wiederholen. Nach Abschluss **nur die betroffenen Einträge** aktualisieren: Status und PR-Nummer in Abschnitt 4 und 7, neue Entscheidungen und offene Probleme in Abschnitt 5, neue beschlossene Funktionen in Abschnitt 4 aufnehmen. Unbeteiligte Einträge unverändert lassen. Andere KI-Entwickler orientieren sich an denselben Regeln. Der Masterplan ist eine Übersicht; maßgeblich bleibt der aktuelle Code.
