# LANDKARTE: wo suche ich zuerst?

Rein technische Dokumentation für Entwickler und KI-Einstieg. Sie erzeugt keine Produktlogik und wird von keinem Skript der App gelesen.
Stand: 29.10.2026 (Phase 8B, 166 Produktdateien in `js/`). Gehört zu `ARCHITEKTUR.md` (Überblick) und ist von `faehigkeiten.js` (Produktfunktion Hilfe/Mehrfachfragen) bewusst getrennt.
Von einer Fähigkeit (`faehigkeiten.js`) zu den Dateien: die Fähigkeit nennt nur ihre Kerndateien; die übrigen Dateien des Bereichs stehen in der Tabelle unten (Spalte „Abhängigkeiten“) und in der Bereichsliste (Teil 4). Das Fähigkeiten-Verzeichnis ist keine vollständige Funktionsliste und keine Liste aller Produktdateien (Einzelheiten: `ARCHITEKTUR.md`, Abschnitt „Fähigkeiten-Verzeichnis (B1)“). Offene technische Punkte: `ARCHITEKTUR.md`, Abschnitt „Bekannte offene technische Punkte“.
Ergänzt durch die Fresh-AI-Nachbesserung: Anleitungen zum Erweitern (neuer Sprachbefehl, neue speak-Stufe), Java→JS-Rückrufe der APK, bekannte Gleichrang-Gruppen und die Test-Übersicht (Bereich → Tests): `ARCHITEKTUR.md`, Abschnitte „Rezepte und Nachschlagen für neue Entwickler“.
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
| Gedächtnis lesen | assistant.js (`searchSemanticMemory`, Besitzer), gedaechtnis.js, langzeit.js (Zusatzquelle) | assistant.js (Kontext), kontext_lokal.js, prompt.js |
| Startseite | uebersicht.js (`jvUebersicht`) | sphere.js, lagebild.js (`jvLage.daten`) |
| Sprache/TTS | voice.js (`speak`), **speak_kette.js** (`jvSpeakKette`, Reihenfolge der 6 `speak`-Hüllen), fish.js (Hauptstimme) | audio.js, toene.js, speechrate.js, tempo.js, voicefix.js, pronunciation.js, sprueche.js, teilen.js, kontext_lokal.js, **api/stau.js** (Fish-Weiterleitung), [APK] AnsageReceiver |
| Spracheingabe | voice.js (Browser), native_speech.js (APK/Vosk) | wake_start.js, hoeren.js, hoerkorrektur.js, festnamen.js, [APK] WakeService, OwwEngine/OwwSpeech/OwwVad |
| WhatsApp | [APK] NachrichtenService.java, ZaneBridge.java; Web: fahr_whatsapp.js, schlaf_antwort.js | zuvorkommend.js (Glückwunsch), teilen.js, KontaktWahl.java, Prefs.java |
| Vertretung | **[APK] NachrichtenService.java** (Timer „Ich warte N Minuten“), VertretungReceiver.java | Prefs.java, ZaneBridge (`vertretungSetzen/Minuten`), schlaf_antwort.js (Schlafmodus-Text/KI) |
| Schicht | schicht.js, schichtauskunft.js | plan_ansagen.js, frueher_los.js, urlaub.js, vorbereitung.js, api/sync.js (Push) |
| Ausflüge | ausflug.js | places.js/ortsuche.js (Orte), wetter, calendar.js |
| Fotos | **foto_kette.js** (`jvFotoKette`, zuerst hier schauen), photo.js, foto_erkennen.js | foto_* (9 Erweiterungen, Rang statt Ladereihenfolge), fotosenden.js, lagebild.js, wunschliste.js |
| Proaktive Meldungen | wachter.js, proaktiv.js, dirigent.js, zane_redet.js, kennenlernen.js, vorbereitung.js, routinen.js | api/sync.js (Push), auftraege.js (Abholen), meldungen.js |
| C1 | meldungen.js (Beobachter), meldungs_regeln.js (`jvRegeln.scharf`), ruhe.js | zane_redet.js + kennenlernen.js (`c1Darf`), tests/c1_stufe1.js, tests/regeln.js |
| KI-Anfragen | assistant.js (`sendToGroqSmart`, Zeile 31), prompt.js | api/groq.js, persona/jarvis/charakter/laune/ki_mitdenken/contextplus/fehlerort, jvChain (11), Kette jvKiText (KI-Kopie des Nutzertextes, Phase 5D.2) |
| Hilfe / „Was kannst du?“ / Fähigkeitenübersicht | help.js (`parseHelpRequest`, `handleHelpCommand`, `showHelpOverview`); aufgerufen als feste Zeile in `handleLocalCommandInner` in localcommands.js (Basisstufe, innerhalb aller `jvCommands`-Einträge); **aktuell kein eigener `jvCommands`-Rang** | faehigkeiten.js (liefert die Karten über `helpFaehigkeitKarten`/`showFaehigkeitHelp`), einfuehrung.js (liest `HELP_TOPICS`), anleitung.js (Tour verweist auf Hilfe-Gruppen), alleinstellung.js (eigener Befehl für „besser/anders“), tests/faehigkeiten.js |
| KI-Aktionen | actions.js, aktionen_kette.js (8 Hüllen) | faehigkeiten.js, antwort_bau.js, tests/aktionen*.js |
| Löschen/Bestätigen | loeschen_fragen.js (Rang 10, außen), rueckfrage.js | actions.js, loesch_notiz.js |
| Android-Bridge | [APK] ZaneBridge.java (55 `@JavascriptInterface`), MainActivity.java | native_speech.js + 22 weitere JS-Dateien mit Code-Zugriff auf `ZaneNative` (Stand 44c6c7e, ohne Kommentare und Texte gezählt; `faehigkeiten.js` nennt den Namen nur in Beschreibungstexten), tests/handyapp.js, faehigkeiten.js (`nurHandyApp`). **Java ruft auch JS auf** (`evaluateJavascript`): Liste der Rückrufziele in `ARCHITEKTUR.md`, Abschnitt „Android: Java ruft JS“, vor dem Löschen einer scheinbar unbenutzten JS-Funktion lesen |
| Befehl wird nicht erkannt | commands.js (`jvCommands.list()`) → Rang der betroffenen Datei, dann die alten Außen-Wrapper um `handleLocalCommand` (5 im Code, 4 aktiv; Abschnitt 2, Punkt „Befehle“) | localcommands.js (Basis), mehrfach.js (trennt Sätze) |
| Reihenfolge-/Ladefehler | index.html (Position), tools/stempel.js, tests/lauf.js | Aufbau-Tests (Syntax, jede Datei eingebunden) |

## 2. Reihenfolge ist Teil des Verhaltens (implizite Ketten)

Alle Skripte sind klassische, synchrone `<script>`-Tags in `index.html` (kein defer/async/module). Wer später lädt, umhüllt (wrappt) die Funktion der früheren. Die Position in `index.html` ist daher Teil der Logik. Eingefroren durch `tests/reihenfolge.js`:

- **Foto-Kette (seit Phase 3 explizit)**: `foto_kette.js` (`window.jvFotoKette.anmelden(funktion, name, rang, fabrik)`, kleiner Rang = weiter außen). Die Priorität bestimmt der Rang, NICHT mehr die Reihenfolge der Skripte; die Foto-Dateien dürfen in `index.html` in beliebiger Reihenfolge nach `photo.js` stehen (`foto_kette.js` selbst muss nach `places.js` und vor `lagebild.js`/`photo.js` laden). Sieben Funktionen, je mit eigener Kette: `parsePhotoRequest`, `processPhoto`, `handlePhotoCommand` (außen -> innen: foto_rezept 10, foto_person 30, wunschliste 40, foto_urlaubsplan 50, foto_essensplan 60, foto_stundenplan 70, foto_abtippen 80, foto_brief 90, foto_adresse 100), `parseFollowupTask` (wie oben ohne foto_person), `photoAskWhatToDo` (foto_rezept 10, foto_erkennen 20, wunschliste 40 ... foto_adresse 100), `confirmPhotoPending` (foto_brief 90, foto_adresse 100), `showActionCards` dauerhaft (fotosenden 10, lagebild 20). `runLastPhotoTask` (nur `foto_erkennen.js`) steht bewusst außerhalb. Die vorübergehenden `showActionCards`-Eingriffe der Plan-Dateien bleiben in ihrer `photoAskWhatToDo`-Erweiterung. **Bei einem Foto-Problem zuerst** `jvFotoKette.text()` bzw. `jvFotoKette.liste()` ansehen (aktive Reihenfolge je Funktion), dann `jvFotoKette.pruefe()` (fehlt etwas, falscher Rang, Anmeldefehler?), dann die Datei der Erweiterung. Test: `tests/reihenfolge.js` (Abschnitte A2, A3, C).
- **Alte Ladereihenfolge-Ketten, weiter implizit**: `handleLocalCommand` und die nicht migrierten Sprachwege (siehe unten). Dort bestimmt noch die Ladereihenfolge.
- **speak-Kette (seit Phase 4B explizit)**: `speak_kette.js` (`window.jvSpeakKette.anmelden(name, rang, fabrik)`, kleiner Rang = weiter außen, steht in `index.html` direkt nach `voice.js`). Außen → innen: `teilen` 10 → `kontext_lokal` 20 → `fish._dash` 30 → `toene` 40 → `sprueche` 50 → `voicefix.speak` 60 → Basis `voice.js`. Die Reihenfolge dieser sechs Dateien in `index.html` ist egal, solange jede nach ihren eigenen Voraussetzungen lädt (`commands.js`, `audio.js`, `voice.js`; sicherer Bereich beginnt nach `commands.js`). `window.speak` bleibt die öffentliche Schnittstelle (die Kette setzt es auf die äußerste Stufe und bestimmt die innere Stufe bei jedem Aufruf neu). Einsicht: `jvSpeakKette.liste()`, `.text()`, `.pruefe()`. Fehlt eine Stufe, erscheint das nach 3 s in der Fehleranzeige (keine Sprache, keine Karte).
- **`mehrfach.js` bleibt bewusst ein vorübergehender äußerer Fang**: ersetzt `window.speak` kurz, sammelt, stellt im `finally` wieder her; die Kette hält `window.speak` nirgends fest.
- **Bewusst NICHT migrierte Sprachwege (weiter Ladereihenfolge)**: `speakBrowser` (pronunciation → fish), `speakAckBrowser`, `speakAck` (fish → voicefix), `fetchCloudSpeechBlob`, `getTtsEngine`/`setTtsEngine` (fish), `getSpeechRateFactor`/`setSpeechRate` (speechrate → tempo), `startThinkingSound` (voicefix), `speechSynthesis.speak`/`window.Audio` (speechrate), `native_speech`. Architekturhinweis: toene, fish, sprueche, teilen, kontext_lokal, mehrfach hängen außerhalb ihres speak-Wrappers von `commands.js`/`audio.js`/`voice.js` ab; pronunciation/speechrate vor teilen zu laden ändert deshalb heute noch das Verhalten (nicht Teil von Phase 4B).
- **Befehle**: `commands.js` (`jvCommands`: Rang, bei Gleichstand gewinnt die frühere Registrierung) und alte Außen-Wrapper um `handleLocalCommand` (im Code 5: mailpush, erweiterungen, worldqueryfix, ortsuche, Inline-Skript in `index.html`; zur Laufzeit aktiv sind 4, denn `erweiterungen.js` nimmt den `jvCommands`-Weg, Rang 1200). Reihenfolge innen nach außen: localcommands > commands > mailpush > worldqueryfix > Inline-Skript (Mimik) > ortsuche.
- **KI-Aktionen**: `aktionen_kette.js` (`jvAktionen`, 8 benannte Hüllen mit Rang 10–80 um die Basis in `actions.js`).
- **Prompt**: `jvChain` (`buildSystemPrompt`, `buildMenuPanel`).
- **Sonderfall `native_speech.js`**: liegt in `index.html` vor `commands.js` und wartet deshalb per Wiederholung (40 × 250 ms, gibt dann still auf).
- **Noch implizite globale Hüllen (Stand Phase 5A gemessen; `buildSystemPrompt` in Phase 5B umgebaut, der Rest unverändert)**: `buildSystemPrompt` (seit Phase 5B nur noch `jvChain`: name 10, gedaechtnis 20, worldqueryfix 30, fish 40, contextplus 50 vor den zehn bisherigen Einträgen 100–500; keine direkten Hüllen mehr; GRÜN), `searchSemanticMemory` (seit Phase 5D.1 genau EINE Fassung in `assistant.js`, Zusatzquellen `langzeit.js`/`foto_stundenplan.js` über `window.jvSuchQuellen`; GRÜN, Netz `tests/suche.js`), `handleLocalCommand` (vier äußere Hüllen neben `jvCommands`; GELB), `sendToGroqSmart` (synapsen, weathermap; seit Phase 5D.2 greifen `festnamen`/`hoerkorrektur` nicht mehr als tote Hüllen darüber: die Festnamen-Korrektur läuft nur noch auf der KI-KOPIE des Textes über die Kette `jvKiText` (`jvChain`, Rang 100 `festnamen`, Rang 200 für eine spätere kontextabhängige Hörkorrektur reserviert, nicht eingetragen); der Originaltext bleibt überall original; GELB für die zwei verbleibenden Hüllen, GRÜN für die Textwege; Netz `tests/kitext.js`), Fenster `openPanel`/`closePanel`/`isPanelOpen` (GELB). Beschreibung: `tests/globale-ist-zustand.md`, Sicherheitsnetz: `tests/globale.js`.
- **Neue Skripte**: in `index.html` ohne `?v=` einhängen, dann `node tools/stempel.js`. Nie Stempel von Hand ändern.

## 3. Hintergrundarbeit (Timer)

Inventar und Regeln: `tests/timer_inventar.js` (beschreibend) und `tests/timer.js`. Ein neuer dauerhafter Timer/Poller macht den Test rot, bis er dort eingetragen ist.
Zusätzlich (Phase 6A): `tests/hintergrund.js` (Golden Master der Hintergrundprozesse, Laufzeit-Messstand `tests/hintergrund_laufzeit.json`), Analyse `tests/hintergrund-analyse.md`, Tabelle `tests/hintergrund-tabelle.md`.
Phase 6B.1 (mimik, holo_look, anzeige pausieren versteckt): Test stillgelegt, weil Mimik und Hologramm-Look mit dem 3D-Kopf entfernt wurden.
Phase 6B.2 (synapsen-200-ms-Takt pausiert versteckt): Vergleichstest stillgelegt (sein Vergleichsstand enthielt Mimik und Hologramm-Look); der heutige Stand ist in `tests/hintergrund.js` eingefroren.
Phase 7A (lokales Gedächtnis memoryItems, nur Analyse): `tests/memory7a.js`, Beschreibung `tests/memory7a-analyse.md`.
Phase 7B (Zeitfrage exakter Name zuerst, Lesefehler von helfer_memory isoliert): `tests/memory7b.js`, Beschreibung `tests/memory7b-analyse.md`.
Phase 8A (Schlussinventur, nur Analyse): `tests/inventar8a.js`, Beschreibung `tests/inventar8a-analyse.md`.

## 4. Zuordnung aller Produktdateien zu Hauptbereichen

Jede Datei in `js/` steht genau einmal (Name ohne `js/` und `.js`).

- **Kern/Commands** (27): `adress_normal`, `aktionen_kette`, `alleinstellung`, `anleitung`, `answers`, `boot`, `commands`, `einfuehrung`, `erweiterungen`, `festnamen`, `fragen_reihenfolge`, `help`, `hoerkorrektur`, `lists`, `localcommands`, `loesch_notiz`, `loeschen_fragen`, `mehrfach`, `name`, `reminders`, `render`, `rueckfrage`, `schliessen`, `storage`, `ui`, `was_steht_an`, `worldqueryfix`
- **KI/Prompt/Actions** (19): `actions`, `antwort_bau`, `assistant`, `charakter`, `contextplus`, `faehigkeiten`, `fehlerort`, `formulierungen`, `jarvis`, `kennenlernen`, `ki_mitdenken`, `kontext_lokal`, `laune`, `mitdenken`, `persona`, `prompt`, `routing`, `sprueche`, `zane_redet`
- **Startseite/Optik** (14): `anzeige`, `blick`, `extrafenster`, `hud_fenster`, `jvfenster`, `kacheln`, `lebendig`, `sphere`, `uebersicht`, `synapsen`, `vibration`, `welt_anflug`, `weltuhr`, `wetterfx`
- **Fotos/Dokumente** (18): `antrag`, `antrag_pdf`, `behoerdenbrief`, `foto_abtippen`, `foto_adresse`, `foto_brief`, `foto_erkennen`, `foto_essensplan`, `foto_kette`, `foto_person`, `foto_rezept`, `foto_stundenplan`, `foto_urlaubsplan`, `fotosenden`, `kuendigung`, `photo`, `rechnungen`, `wunschliste`
- **Orte/Navigation/Fahrzeit** (16): `autoansicht`, `fahrtcheck`, `karte_zu`, `karten_weg`, `lagebild`, `nearby`, `nearbymore`, `orte`, `ortsuche`, `parkplatz_auto`, `places`, `sonnemond`, `stadtverkehr`, `streetview`, `travel`, `weltzeit`
- **Mail/Geld** (12): `fristen`, `haushalt`, `konto`, `mail`, `mail_nacht`, `mailaktionen`, `mailpush`, `mailwatch`, `pakete`, `postfach`, `preissuche`, `waehrung`
- **Sprache (TTS/STT/Wake)** (12): `audio`, `fish`, `hoeren`, `native_speech`, `pronunciation`, `speak_kette`, `speechrate`, `tempo`, `toene`, `voice`, `voicefix`, `wake_start`
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
