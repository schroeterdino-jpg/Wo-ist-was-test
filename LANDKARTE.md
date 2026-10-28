# LANDKARTE: wo suche ich zuerst?

Rein technische Dokumentation für Entwickler und KI-Einstieg. Sie erzeugt keine Produktlogik und wird von keinem Skript der App gelesen.
Stand: 28.10.2026 (Commit 7802e22, 168 Produktdateien in `js/`). Gehört zu `ARCHITEKTUR.md` (Überblick) und ist von `faehigkeiten.js` (Produktfunktion Hilfe/Mehrfachfragen) bewusst getrennt.
Ein Test (`tests/landkarte.js`) prüft, dass jede Datei in `js/` genau einem Bereich zugeordnet ist und alle hier genannten Dateien existieren.

Schreibweise: `jv…` = Globals im Browser, `[APK]` = `weckruf-src/`. Zeilennummern fehlen absichtlich (veralten schnell); mit `grep -n` suchen.

## 1. Problem/Funktion → zuerst zuständige Datei(en) → wichtige Abhängigkeiten

| Problem/Funktion | Zuerst zuständige Datei(en) | Wichtige abhängige |
|---|---|---|
| Kalender lesen | calendar.js (`fetchGoogleCalendarEvents`, `calendarEntries`) | was_steht_an.js (Auskunft), assistant.js (Kontext), api: Google direkt per `fetch` |
| Kalender schreiben | calendar.js (`addGoogleCalendarEvent`), actions.js (`calendar`) | langzeit_erinnern.js (Aktion + Rückfrage), geburtstag_ganztag.js, mitdenken.js (Prüfung vorher), terminfinder.js |
| Kalender löschen | actions.js (`calendar_delete`) | **loeschen_fragen.js** (Rückfrage, Rang 10), loesch_notiz.js, calendar.js |
| Erinnerungen | reminders.js (Parser), calendar.js (Takt 1 s, `reminderEntries`), langzeit_erinnern.js | pushsync.js, api/sync.js (Push), Erinnerung-Aktion in actions.js |
| Aufgaben | actions.js (`todo`), lists.js | storage.js, tagesueberblick.js, langzeit.js (Aufgabe notiert) |
| Wetter | weathermap.js, unwetter.js, wetterfx.js, ui.js (`updateOverviewWeather`) | briefing.js, kacheln.js, wachter.js, fahrtcheck.js, api: Wetterquellen, alarm.js |
| Fahrzeit | travel.js, fahrtcheck.js | lagebild.js, stadtverkehr.js, plan_ansagen.js, api/maps.js, api/stau.js |
| Ortssuche | ortsuche.js, nearby.js, nearbymore.js, orte.js | places.js, routing.js, api/maps.js (Overpass), streetview.js |
| Gedächtnis speichern | actions.js (`memory_store`) → gedaechtnis.js (lokal), langzeit.js (`episode_store`) | gedaechtnis_zeit.js, langzeit_erinnern.js, api/memory.js |
| Gedächtnis lesen | gedaechtnis.js (`searchSemanticMemory`), langzeit.js | assistant.js (Kontext), kontext_lokal.js, prompt.js |
| Avatar | avatar3d.js (`jvAvatar3D`), kopf.js | holo_look.js, ansicht.js, models/mann.glb |
| Mimik | mimik.js (Takt 120 ms), avatar3d.js (`setExpression`) | laune.js, charakter.js, lebendig.js |
| Sprache/TTS | voice.js (`speak`), fish.js (Hauptstimme) | audio.js, toene.js, speechrate.js, tempo.js, voicefix.js, pronunciation.js, sprueche.js, teilen.js, kontext_lokal.js, **api/stau.js** (Fish-Weiterleitung), [APK] AnsageReceiver |
| Spracheingabe | voice.js (Browser), native_speech.js (APK/Vosk) | wake_start.js, hoeren.js, hoerkorrektur.js, festnamen.js, [APK] WakeService, OwwEngine/OwwSpeech/OwwVad |
| WhatsApp | [APK] NachrichtenService.java, ZaneBridge.java; Web: fahr_whatsapp.js, schlaf_antwort.js | zuvorkommend.js (Glückwunsch), teilen.js, KontaktWahl.java, Prefs.java |
| Vertretung | **[APK] NachrichtenService.java** (Timer „Ich warte N Minuten“), VertretungReceiver.java | Prefs.java, ZaneBridge (`vertretungSetzen/Minuten`), schlaf_antwort.js (Schlafmodus-Text/KI) |
| Schicht | schicht.js, schichtauskunft.js | plan_ansagen.js, frueher_los.js, urlaub.js, vorbereitung.js, api/sync.js (Push) |
| Ausflüge | ausflug.js | places.js/ortsuche.js (Orte), wetter, calendar.js |
| Fotos | **foto_kette.js** (`jvFotoKette`, zuerst hier schauen), photo.js, foto_erkennen.js | foto_* (9 Erweiterungen, Rang statt Ladereihenfolge), fotosenden.js, lagebild.js, wunschliste.js |
| Proaktive Meldungen | wachter.js, proaktiv.js, dirigent.js, zane_redet.js, kennenlernen.js, vorbereitung.js, routinen.js | api/sync.js (Push), auftraege.js (Abholen), meldungen.js |
| C1 | meldungen.js (Beobachter), meldungs_regeln.js (`jvRegeln.scharf`), ruhe.js | zane_redet.js + kennenlernen.js (`c1Darf`), tests/c1_stufe1.js, tests/regeln.js |
| KI-Anfragen | assistant.js (`sendToGroqSmart`, Zeile 31), prompt.js | api/groq.js, persona/jarvis/charakter/laune/ki_mitdenken/contextplus/fehlerort, jvChain (11) |
| KI-Aktionen | actions.js, aktionen_kette.js (8 Hüllen) | faehigkeiten.js, antwort_bau.js, tests/aktionen*.js |
| Löschen/Bestätigen | loeschen_fragen.js (Rang 10, außen), rueckfrage.js | actions.js, loesch_notiz.js |
| Android-Bridge | [APK] ZaneBridge.java (55 `@JavascriptInterface`), MainActivity.java | native_speech.js + 14 weitere JS-Dateien mit `ZaneNative`, tests/handyapp.js, faehigkeiten.js (`nurHandyApp`) |
| Befehl wird nicht erkannt | commands.js (`jvCommands.list()`) → Rang der betroffenen Datei, dann die 5 Außen-Wrapper (D.3) | localcommands.js (Basis), mehrfach.js (trennt Sätze) |
| Reihenfolge-/Ladefehler | index.html (Position), tools/stempel.js, tests/lauf.js | Aufbau-Tests (Syntax, jede Datei eingebunden) |

## 2. Reihenfolge ist Teil des Verhaltens (implizite Ketten)

Alle Skripte sind klassische, synchrone `<script>`-Tags in `index.html` (kein defer/async/module). Wer später lädt, umhüllt (wrappt) die Funktion der früheren. Die Position in `index.html` ist daher Teil der Logik. Eingefroren durch `tests/reihenfolge.js`:

- **Foto-Kette (seit Phase 3 explizit)**: `foto_kette.js` (`window.jvFotoKette.anmelden(funktion, name, rang, fabrik)`, kleiner Rang = weiter außen). Die Priorität bestimmt der Rang, NICHT mehr die Reihenfolge der Skripte; die Foto-Dateien dürfen in `index.html` in beliebiger Reihenfolge nach `photo.js` stehen (`foto_kette.js` selbst muss nach `places.js` und vor `lagebild.js`/`photo.js` laden). Sieben Funktionen, je mit eigener Kette: `parsePhotoRequest`, `processPhoto`, `handlePhotoCommand` (außen -> innen: foto_rezept 10, foto_person 30, wunschliste 40, foto_urlaubsplan 50, foto_essensplan 60, foto_stundenplan 70, foto_abtippen 80, foto_brief 90, foto_adresse 100), `parseFollowupTask` (wie oben ohne foto_person), `photoAskWhatToDo` (foto_rezept 10, foto_erkennen 20, wunschliste 40 ... foto_adresse 100), `confirmPhotoPending` (foto_brief 90, foto_adresse 100), `showActionCards` dauerhaft (fotosenden 10, lagebild 20). `runLastPhotoTask` (nur `foto_erkennen.js`) steht bewusst außerhalb. Die vorübergehenden `showActionCards`-Eingriffe der Plan-Dateien bleiben in ihrer `photoAskWhatToDo`-Erweiterung. **Bei einem Foto-Problem zuerst** `jvFotoKette.text()` bzw. `jvFotoKette.liste()` ansehen (aktive Reihenfolge je Funktion), dann `jvFotoKette.pruefe()` (fehlt etwas, falscher Rang, Anmeldefehler?), dann die Datei der Erweiterung. Test: `tests/reihenfolge.js` (Abschnitte A2, A3, C).
- **Alte Ladereihenfolge-Ketten, weiter implizit**: `speak` (siehe unten), `handleLocalCommand`. Dort bestimmt noch die Ladereihenfolge.
- **speak-Kette**: `voice.js` (Basis) → `sprueche` → `toene` → `fish` → `kontext_lokal` → `teilen`; dazu der vorübergehende `window.speak`-Austausch in `mehrfach.js`.
- **Befehle**: `commands.js` (`jvCommands`: Rang, bei Gleichstand gewinnt die frühere Registrierung) und alte Außen-Wrapper um `handleLocalCommand` (im Code 5: mailpush, erweiterungen, worldqueryfix, ortsuche, Inline-Skript in `index.html`; zur Laufzeit aktiv sind 4, denn `erweiterungen.js` nimmt den `jvCommands`-Weg, Rang 1200). Reihenfolge innen nach außen: localcommands > commands > mailpush > worldqueryfix > Inline-Skript (Mimik) > ortsuche.
- **KI-Aktionen**: `aktionen_kette.js` (`jvAktionen`, 8 benannte Hüllen mit Rang 10–80 um die Basis in `actions.js`).
- **Prompt**: `jvChain` (`buildSystemPrompt`, `buildMenuPanel`).
- **Sonderfall `native_speech.js`**: liegt in `index.html` vor `commands.js` und wartet deshalb per Wiederholung (40 × 250 ms, gibt dann still auf).
- **Neue Skripte**: in `index.html` ohne `?v=` einhängen, dann `node tools/stempel.js`. Nie Stempel von Hand ändern.

## 3. Hintergrundarbeit (Timer)

Inventar und Regeln: `tests/timer_inventar.js` (beschreibend) und `tests/timer.js`. Ein neuer dauerhafter Timer/Poller macht den Test rot, bis er dort eingetragen ist.

## 4. Zuordnung aller Produktdateien zu Hauptbereichen

Jede Datei in `js/` steht genau einmal (Name ohne `js/` und `.js`).

- **Kern/Commands** (26): `adress_normal`, `aktionen_kette`, `alleinstellung`, `anleitung`, `answers`, `boot`, `commands`, `einfuehrung`, `erweiterungen`, `festnamen`, `help`, `hoerkorrektur`, `lists`, `localcommands`, `loesch_notiz`, `loeschen_fragen`, `mehrfach`, `name`, `reminders`, `render`, `rueckfrage`, `schliessen`, `storage`, `ui`, `was_steht_an`, `worldqueryfix`
- **KI/Prompt/Actions** (19): `actions`, `antwort_bau`, `assistant`, `charakter`, `contextplus`, `faehigkeiten`, `fehlerort`, `formulierungen`, `jarvis`, `kennenlernen`, `ki_mitdenken`, `kontext_lokal`, `laune`, `mitdenken`, `persona`, `prompt`, `routing`, `sprueche`, `zane_redet`
- **Avatar/Mimik/Optik** (18): `ansicht`, `anzeige`, `avatar3d`, `blick`, `extrafenster`, `holo_look`, `hud_fenster`, `jvfenster`, `kacheln`, `kopf`, `lebendig`, `mimik`, `sphere`, `synapsen`, `vibration`, `welt_anflug`, `weltuhr`, `wetterfx`
- **Fotos/Dokumente** (18): `antrag`, `antrag_pdf`, `behoerdenbrief`, `foto_abtippen`, `foto_adresse`, `foto_brief`, `foto_erkennen`, `foto_essensplan`, `foto_kette`, `foto_person`, `foto_rezept`, `foto_stundenplan`, `foto_urlaubsplan`, `fotosenden`, `kuendigung`, `photo`, `rechnungen`, `wunschliste`
- **Orte/Navigation/Fahrzeit** (16): `autoansicht`, `fahrtcheck`, `karte_zu`, `karten_weg`, `lagebild`, `nearby`, `nearbymore`, `orte`, `ortsuche`, `parkplatz_auto`, `places`, `sonnemond`, `stadtverkehr`, `streetview`, `travel`, `weltzeit`
- **Mail/Geld** (12): `fristen`, `haushalt`, `konto`, `mail`, `mail_nacht`, `mailaktionen`, `mailpush`, `mailwatch`, `pakete`, `postfach`, `preissuche`, `waehrung`
- **Sprache (TTS/STT/Wake)** (11): `audio`, `fish`, `hoeren`, `native_speech`, `pronunciation`, `speechrate`, `tempo`, `toene`, `voice`, `voicefix`, `wake_start`
- **Schicht/Arbeit** (10): `frueher_los`, `mitnehmen`, `plan_ansagen`, `routinen`, `schicht`, `schichtauskunft`, `schlaf_antwort`, `urlaub`, `vorbereitung`, `zuvorkommend`
- **Kalender** (6): `birthdays`, `calendar`, `feiertage`, `ferien`, `geburtstag_ganztag`, `terminfinder`
- **Proaktivität** (6): `briefing`, `dirigent`, `proaktiv`, `smarttips`, `tagesueberblick`, `wachter`
- **Push/Sync** (4): `auftraege`, `push`, `pushsync`, `sync`
- **Medien** (4): `bundesliga`, `ergebnisse`, `filme`, `spotify`
- **Infrastruktur/Diagnose** (3): `diagnose`, `satztest`, `systemcheck_voll`
- **Gedächtnis** (3): `gedaechtnis`, `gedaechtnis_zeit`, `langzeit`
- **Meldungen/C1** (3): `meldungen`, `meldungs_regeln`, `ruhe`
- **Erinnerungen/Aufgaben** (2): `alarm`, `langzeit_erinnern`
- **UI/Panels** (2): `panels`, `teilen`
- **Wetter** (2): `unwetter`, `weathermap`
- **Sonstiges** (1): `adresse_speichern`
- **Ausflüge** (1): `ausflug`
- **WhatsApp/Vertretung** (1): `fahr_whatsapp`
