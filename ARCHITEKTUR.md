# Jarvis: Architektur-Überblick

Stand: 21.10.2026 (Commit b240df6). Zweck: schnell wieder einsteigen, ohne alles neu zu lesen.
Intern heißt der Assistent noch "Zane" (Befehle, gespeicherte Daten, Dateinamen), nach außen überall "Jarvis" (`js/name.js`).

## 1. Drei Teile

| Teil | Wo | Läuft auf |
|---|---|---|
| Web-App | `index.html`, `style.css`, `js/` (133 Skripte), `sw.js`, `manifest.json` | Vercel (Region fra1), im Browser oder im WebView der APK |
| Server | `api/` (11 Dateien) | Vercel Serverless Functions |
| Weckruf-APK "Jarvis" | `weckruf-src/` | Android (Galaxy S25), Bau über GitHub Actions |

Die APK öffnet die Web-App (`https://wo-ist-was-test.vercel.app/`) in einem WebView und bietet ihr über `ZaneBridge` native Funktionen an (Spracherkennung, Drucken, Ansagen, Orts-Erinnerungen).

## 2. Weg einer Frage

1. Spracheingabe: `voice.js` (Browser) oder `native_speech.js` (APK, Vosk). Korrekturen vorab: `festnamen.js`, `hoerkorrektur.js`.
2. Feste Befehle ohne KI zuerst: `localcommands.js`, `commands.js` und viele Einzelmodule (Weltzeit, Feiertage, Währung, Ortssuche ...).
3. Sonst `assistant.js` (`sendToGroqSmart`): sammelt Kontext (Wetter, Termine, Listen, Gedächtnis, Standort, Schicht, Langzeitgedächtnis-Treffer), `prompt.js` baut die Anweisung (plus `persona.js`, `jarvis.js`, `charakter.js`, `laune.js`, `ki_mitdenken.js`).
4. `api/groq.js` leitet an Groq weiter (Modell openai/gpt-oss-120b, JSON-Antwort mit `reply` und `actions`). Dieselbe Datei macht auch die Whisper-Spracherkennung.
5. `actions.js` führt die Aktionen aus. Für einige Fragen erzwingt `assistant.js` die richtige Aktion (Web-Suche, Restaurants, Bahn, Tanken, Stau), auch wenn die KI etwas anderes liefert.
6. Ausgabe: `voice.js` und `fish.js` (Fish Audio als Hauptstimme), Aussprache über `pronunciation.js`, Anzeige über `panels.js`, `render.js`, `hud_fenster.js`, Kopf über `avatar3d.js`, `mimik.js`, `holo_look.js`.

## 3. Daten

- **Lokal** (localStorage): Einkauf, Aufgaben/Notizen, Gedächtnis (Gegenstände und Orte), Kontakte, Briefing-Wünsche, Parkplatz, Adressen, Schicht, Einstellungen. Zugriff über `storage.js`, `lists.js`.
- **Abgleich** (`sync.js` mit `api/sync.js`, Upstash Redis): Liste `SYNC_KEYS` (auch in `ALLOWED_KEYS` im Server). Pro Bereich gewinnt der neuere Zeitstempel. `sync.js` hängt sich in `Storage.prototype.setItem` ein. Neue Einstellungen, die geräteübergreifend gelten sollen, müssen in beide Listen.
- **Langzeitgedächtnis** (`langzeit.js` mit `api/memory.js`, Upstash Vector): Erlebnisse, Pläne, Vorlieben, Daten, Fristen aus Mails. Aktionen: store, search, list, listall, delete, due, mark, fristen. Bewusst getrennt vom lokalen Gedächtnis.
- **Schlüssel und Secrets:** nur in Vercel-Umgebungsvariablen (APP_SECRET, GROQ_API_KEY, FISH_AUDIO_*, GOOGLE_*, UPSTASH_*, KV_*, VAPID_*, TANKERKOENIG/TANKER_API_KEY, TOMTOM, TMDB, YOUTUBE, OPENAI ...). Die App schickt APP_SECRET als `x-app-key`.

## 4. Server (`api/`)

Vercel Hobby erlaubt höchstens **12** Functions, belegt sind 11. Neue Funktionen in bestehende Dateien einbauen (wie `maps.js`, `memory.js`, `groq.js`).

| Datei | Aufgabe |
|---|---|
| `groq.js` | KI-Weiterleitung und Whisper |
| `sync.js` | Datenabgleich, **alle Push-Meldungen** (Erinnerungen, Briefing, Wetter, Regen, Diesel, Mail, HSV, Abfahrt, Vorbereitung). Der Zeitgeber ist extern (cron-job.org ruft jede Minute `push_due` mit `PUSH_CRON_KEY` auf), nicht der Vercel-Cron |
| `memory.js` | Langzeitgedächtnis, täglicher Vercel-Cron `reflect` (macht nichts mehr) |
| `maps.js` | Geocode, Reverse, Route, Overpass (alte Adressen per `vercel.json` umgeleitet) |
| `stau.js`, `tankroute.js`, `tank.js` | Stau, Tanken entlang der Strecke, Spritpreise |
| `bahn.js`, `news.js`, `filme.js`, `youtubelive.js` | Bahn, Nachrichten, Filmtipps, Live-Kameras |

## 5. Web-App nach Bereichen (`js/`)

- **Kern:** `boot.js` (Startanimation), `ui.js`, `storage.js`, `render.js`, `lists.js`, `assistant.js`, `prompt.js`, `actions.js`, `answers.js`, `routing.js`, `localcommands.js`, `commands.js`, `persona.js`, `reminders.js`, `name.js`
- **Stimme/Hören:** `voice.js`, `fish.js`, `audio.js`, `toene.js`, `speechrate.js`, `tempo.js`, `voicefix.js`, `pronunciation.js`, `hoeren.js`, `hoerkorrektur.js`, `festnamen.js`, `native_speech.js`, `wake_start.js`
- **Persönlichkeit:** `jarvis.js`, `charakter.js`, `laune.js`, `sprueche.js`, `zane_redet.js`, `kennenlernen.js`, `ki_mitdenken.js`, `contextplus.js`, `formulierungen.js`
- **Aussehen:** `avatar3d.js` (3D-Kopf, Modelle in `models/`), `kopf.js`, `mimik.js`, `holo_look.js`, `synapsen.js`, `wetterfx.js`, `kacheln.js`, `hud_fenster.js`, `jvfenster.js`, `panels.js` (größte Datei), `extrafenster.js`, `ansicht.js`, `sphere.js`, `vibration.js`
- **Termine/Zeit:** `calendar.js` (Google), `birthdays.js`, `geburtstag_ganztag.js`, `schicht.js`, `schichtauskunft.js`, `urlaub.js`, `plan_ansagen.js` (Ansagen, Heimweg inkl. Tanktipp `heimTank` über `api/sync.js` Aktion `tank_heim`, Terminkonflikte mit der Arbeit), `mehrfach.js` (trennt Sätze mit mehreren Wünschen; Befehlsliste, Order 0.5), `rueckfrage.js` (Zurückfragen bei mehreren Treffern, merkt die Wahl; Haken in `lists.js` resolveListTargets und `routing.js` resolveContactDestination, Satz aus `window.jvLetzterText`; Order 0.4), `zuvorkommend.js` ("Ich habe mir erlaubt": Frost → Abfahrt per `jvPlan.tagVor` vorziehen, "Mach rückgängig"; Geburtstags-Vorfrage 5 Tage vorher als Plan-Eintrag `geb|…`; Order 0.7), `mitnehmen.js`, `alarm.js`, `ferien.js`, `feiertage.js`, `weltuhr.js`, `weltzeit.js`, `sonnemond.js`
- **Unterwegs:** `travel.js`, `fahrtcheck.js`, `stadtverkehr.js`, `lagebild.js`, `places.js`, `streetview.js`, `nearby.js`, `nearbymore.js`, `ortsuche.js`, `orte.js`, `karte_zu.js`, `karten_weg.js`, `weathermap.js`, `welt_anflug.js`, `unwetter.js`, `adress_normal.js`
- **Mail/Geld:** `mail.js`, `mailaktionen.js`, `mail_nacht.js`, `mailwatch.js`, `mailpush.js`, `konto.js`, `fristen.js`, `rechnungen.js`, `kuendigung.js`, `waehrung.js`
- **Foto:** `photo.js`, `foto_erkennen.js`, `foto_brief.js`, `foto_rezept.js`, `foto_abtippen.js`, `foto_adresse.js`, `foto_stundenplan.js`, `foto_person.js`, `fotosenden.js`
- **Gedächtnis/Mitdenken:** `langzeit.js`, `langzeit_erinnern.js`, `gedaechtnis.js`, `gedaechtnis_zeit.js`, `kontext_lokal.js`, `mitdenken.js`, `proaktiv.js`, `wachter.js`, `routinen.js`, `vorbereitung.js`, `smarttips.js`, `ruhe.js`
- **Push/Sync:** `push.js`, `pushsync.js`, `sync.js`, `auftraege.js` ("Sag Bescheid, wenn ...": Diesel, Regen, Temperatur; Server: `push_watch_*` in `api/sync.js`, Prüfung jede Minute in `push_due`; Meldungen in der APK siehe Abschnitt 6)
- **Sonstiges:** `bundesliga.js`, `ergebnisse.js`, `filme.js`, `tagesueberblick.js`, `help.js`, `einfuehrung.js`, `teilen.js`, `schliessen.js`, `loeschen_fragen.js`, `loesch_notiz.js`
- **Diagnose:** `diagnose.js`, `systemcheck_voll.js`, `satztest.js`, `fehlerort.js`, `erweiterungen.js`

## 6. Weckruf-APK (`weckruf-src/`)

- `WakeService`: Vordergrunddienst, lauscht aufs Weckwort. **Zwei Erkennungen**, einstellbar in den Jarvis-Einstellungen unter "Erkennung":
  - bisher: Vosk mit Weckwort "Hey Jarvis" (`GatedSpeech` mit Stille-Schranke)
  - neu: openWakeWord (`OwwEngine` rechnet Mel, Embedding, Weckwort-Modell je 80 ms; `OwwSpeech` ist die Mikrofon-Schleife mit Stille-Schranke seit PR #44). Weckwort: fertiges Modell "Hey Jarvis".
  - Sprach-Schranke: `OwwVad` (Silero VAD, MIT, `oww/vad.onnx`, vom Bau geladen) prüft, ob wirklich gesprochen wird; die Engine rechnet nur bei Sprache (Schwelle 0,35, ca. 1 s Halt). Maschinenlärm öffnet nur die Lautstärke-Schranke, nicht die Engine. Fehlt das Modell oder gibt es einen Fehler, gilt wie früher nur die Lautstärke. Messzeile zeigt "Sprachfilter an/aus".
- **Parkplatz automatisch:** `CarWatcher` (im `WakeService` angemeldet, Bluetooth-Trennung des in den Einstellungen gewählten Autos, 10 s Entprellen) holt den Standort (GPS, sonst letzter bekannter) und legt ihn als JSON in `Prefs.parkPending`; die Seite (`parkplatz_auto.js`) holt ihn per `ZaneBridge.holeParkplatz()`, schlägt die Adresse nach und speichert `parkingSpot` (nicht bei höchstens 150 m von zu Hause). Braucht Bluetooth-Erlaubnis und Standort "Immer zulassen". Nur solange der Dienst läuft.
- **Unterbrechen per Sprache (Test, in den Einstellungen):** Die Seite meldet über `ZaneBridge.setSprechen()`, ob Jarvis spricht. Ist die Einstellung an, pausiert `WakeService.want()` dann nicht, die Schwelle steigt um 0,25 (Jarvis' eigene Stimme), und `zaneWake` (native_speech.js) bricht die Sprachausgabe mit `interruptSpeaking()` ab. Nur mit der neuen Erkennung (openWakeWord).
- **Meldungen vom Server in der APK:** Im WebView gibt es kein Web-Push. `AuftragReceiver` fragt per `push_native` (`api/sync.js`) nach, jede Minute im `WakeService` und alle 5 Minuten über den Wecker. Der Server legt jede Meldung (`sendToAll`) zusätzlich in eine eigene Warteschlange (`alltags-helfer:natq`), solange die APK in den letzten 20 Minuten nachgefragt hat. Normale Meldungen werden Benachrichtigungen (Erinnerungen mit "Erledigt"), erfüllte Aufträge spricht Jarvis. `pushsync.js` behandelt die APK wie "Benachrichtigungen an", damit der Server Erinnerungen, Schicht und Standort bekommt. Der App-Code kommt über `ZaneBridge.auftraege()` in die APK. Browser-Version und APK gleichzeitig = doppelte Meldungen.
- Nachtruhe (Standard 23 bis 04 Uhr), Pause während Jarvis spricht oder zuhört, Ein/Aus in der Benachrichtigung.
- `MainActivity` (WebView der Web-App), `ZaneBridge` (JavaScript-Brücke), `SetupActivity` (Jarvis-Einstellungen mit Messzeile), `AnsageReceiver` (geplante Ansagen bei gesperrtem Handy), `OrtReceiver` (Orts-Erinnerungen), `Prefs`.
- Bau: `.github/workflows/zane-weckruf.yml` (bei Änderungen in `weckruf-src`, lädt Vosk- und openWakeWord-Modelle, veröffentlicht `Zane-Weckruf.apk` als Release "weckruf-N"). `oww-test.yml` prüft `OwwEngine` und `OwwVad` gegen die Python-Vorlagen (`weckruf-test/`).

## 7. Arbeitsweise und Stolperfallen

- Dateien werden am Handy über GitHub eingespielt, bevorzugt als Pull Request. Nicht mehr benötigte Dateien sollen ganz raus.
- Neue Skripte in `index.html` an der passenden Stelle einhängen; das Anhängsel `?v=…` ändern, wenn sich die Datei geändert hat.
- Mehrere Module ersetzen zur Laufzeit Funktionen anderer (zum Beispiel `fish.js` die Sprachausgabe). Die Reihenfolge in `index.html` zählt.
- Neue geräteübergreifende Einstellung: Schlüssel in `SYNC_KEYS` (`js/sync.js`) **und** `ALLOWED_KEYS` (`api/sync.js`) eintragen.
- Push-Meldungen laufen im Server (`api/sync.js`), bei offener App spricht die App selbst (`wachter.js` und Co.). `api/sync.js` merkt sich per `push_alive`, ob die App offen ist.
- Der Name Nova war nur kurz für ein Video; alles heißt wieder Jarvis. Interne Schlüssel mit `nova_` (Kopf, Zubehör, Prefs der APK) blieben bewusst, sonst gingen gespeicherte Einstellungen verloren.
