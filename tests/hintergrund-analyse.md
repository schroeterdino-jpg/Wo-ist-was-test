# Phase 6A: Timer und Hintergrundprozesse (nur Analyse, kein Produktcode geändert)

Stand: main `dcf81d6`, Messung 29.10.2026. Prozesstabelle: `tests/hintergrund-tabelle.md` (erzeugt mit `node tests/hintergrund_doku.js`).
Sicherheitsnetz: `node tests/hintergrund.js` (57 Prüfungen). Messwerkzeug (nur lokal, braucht Playwright): `node tests/hintergrund_messen.js`; sein Ergebnis ist als `tests/hintergrund_laufzeit.json` eingecheckt. Soll: `tests/hintergrund_soll.json`.

## 1. Zahlen (neu gemessen, gleich wie die alten)
- 102 Konstrukte = 72 `setInterval` + 30 selbst ansetzende `setTimeout` in 58 Dateien. Der alte Wert stimmt, es hat sich nichts verschoben.
- 16 `requestAnimationFrame`-Stellen in 6 Dateien (avatar3d 3, holo_look 2, sphere 4, synapsen 2, welt_anflug 1 [keine Schleife], wetterfx 4). Nirgends `cancelAnimationFrame`.
- 38 Dateien prüfen `hidden`/Sichtbarkeit, 29 hören auf `visibilitychange`.
- Wächter (Sichtbarkeitsprüfung) bei den 102 Funden: direkt 9, indirekt 21, keiner 72.
- Stop: 40 Intervalle ohne gespeicherte Kennung ("nie gestoppt"), 31 mit `clearInterval`, 1 (spotify.js#2) mit Kennung aber ohne Stop. Fehlendes `clearInterval` ist nicht automatisch ein Fehler (Dauerläufer sollen laufen).
- Start: 44 beim Laden, 23 in Funktionen, 30 selbst ansetzend, 3 bei Ereignis, 2 im Rückruf.
- Unter 1 Sekunde: 41 Konstrukte (7 Dauerläufer, 29 Warte-Poller, 2 Animationen, 3 bedingt).
- Netzwerk-Poller: 33 sicher erkannt (+8 möglich). Native/APK: 9.

## 2. Kategorien (A–F)
| Kat | Anzahl | Bedeutung |
|---|---|---|
| A kritisch | 9 | nur mit Codebeleg: Erinnerungs-Takt (calendar.js#1), Handy-Statusmeldung (native_speech.js#1), Weckwort-Kette (voice.js#2/#3), Aufträge für die APK (auftraege.js#2), Wächter (wachter.js#1), Server-Abgleich (pushsync.js#1/#2), Ansagen an die APK (plan_ansagen.js#2) |
| B funktional | 20 | normale Hintergrundarbeit ohne Netz |
| C Oberfläche/Animation | 12 | Mimik, Blick, Synapsen, Anzeige, Schreibmaschine usw. |
| D Polling/Netzwerk | 28 | holen regelmäßig Daten |
| E Retry/Warten | 29 | warten auf ein anderes Skript/eine Funktion |
| F verdächtig/unklar | 4 | nur markiert, nicht bewertet: gedaechtnis_zeit.js#1, kacheln.js#2, anzeige.js#1, blick.js#1 |

## 3. Laufzeit (echtes Chromium, Sichtbarkeit steuerbar)
**Wichtig:** gemessen wird nur, was Jarvis selbst entscheidet. Das Drosseln versteckter Tabs durch den Browser ist NICHT gemessen (siehe Grenzen).
- Beim Start entstehen 39 Intervalle (Laden + 10 s), 38 sind aktiv; nach 60 s Leerlauf 39 (der Wächter startet nach 25 s). Aktive Animationsschleife im Leerlauf: sphere.js (rAF).
- 60 s Leerlauf sichtbar: ca. 2260 Rückrufe, 190 Netzaufrufe (fast alle aus einem einzigen Schub: Tagescheck `systemcheck_voll.js` 45 s nach dem Start, ca. 189 Einmal-Timer), 153 DOM-Änderungen, 0 Benachrichtigungen. Hoch (ab 100/min): anzeige, mimik, ruhe, sphere (rAF), synapsen. Mittel: calendar (60/min), gedaechtnis_zeit, holo_look, laune, spotify, voice.
- 60 s Leerlauf versteckt: ca. 1531 Rückrufe, **0 Netzaufrufe**, 27 DOM-Änderungen. Netz ist also wirksam geschützt; die kurzen Takte laufen aber weiter.
- Versteckt pausiert: sphere.js (rAF 473 → 4). Kurzlebig/ereignisgesteuert (kein Dauertakt): voice.js:346, laune.js:191. Läuft unverändert weiter: anzeige (300/400 ms), mimik (120 ms), synapsen (200 ms), ruhe (400 ms), holo_look (700 ms), calendar (1 s), gedaechtnis_zeit, spotify.js:531. Diese Takte kehren meist früh zurück, kosten aber Aufrufe.
- Native (Attrappe): `setBusy` aus native_speech.js ca. 200 Aufrufe/min (300 ms-Takt); sonst nur Einzelaufrufe beim Start.
- Szenarien (je 8 s): Sprache, Erinnerungen, Termine heute, Wetter, KI-Anfrage, Panelwechsel starten **kein** neues Intervall. Netz: KI-Anfrage 4, Wetter 1, Sprache 1, Panelwechsel 1.
- Doppelstart: sechsmal Erinnerungs-Panel öffnen/schließen erzeugt keine neuen Intervalle. Nur `voice.js:346` (`whenVoicesReady`) wird in manchen Läufen zweimal gestartet und beendet sich selbst.

## 4. Befunde je Thema
- **Unter 1 s:** mimik 120 ms, synapsen 200 ms, anzeige 300/400 ms, ruhe 400 ms, holo_look 700 ms, native_speech 300 ms. Zweck: Animation/Anzeige, außer ruhe.js (füttert `jvRuhe`) und native_speech.js (Handy-Status, Kat. A). Keine Empfehlung "einfach höher setzen".
- **Doppelstart ohne Schutz (Start in Funktion, nie gestoppt):** anzeige.js#1, blick.js#1, kacheln.js#2, proaktiv.js#1, synapsen.js#1, wachter.js#1, wetterfx.js#1. Im Test wurde keiner doppelt gestartet; das Risiko ist nur statisch.
- **Retry/Warten:** 29 Warte-Poller, rund 21 davon wurden in der Messung nie gestartet (Ziel war beim ersten Versuch da). `wake_start.js#1` (300 ms, wartet auf speakAck/startListening) ist unbegrenzt; `voice.js#1` begrenzt über `maxMs`; die meisten übrigen zählen bis 40/60.
- **Avatar:** `avatar3d.js` hat 3 rAF-Stellen ohne `hidden`-Prüfung und ohne `cancelAnimationFrame` (der Browser pausiert rAF im versteckten Tab); Leerlauf-Drosselung ca. 30 fps über `loop.ruhig`. Nicht messbar (lädt von esm.sh), daher nur statisch. sphere, holo_look, synapsen, wetterfx haben eigene Sichtbarkeitsprüfungen.
- **calendar.js#1:** 1-s-Takt ohne Wächter, nie gestoppt, Kategorie A (löst Erinnerungen aus).

## 5. Kandidaten (NICHTS davon umgesetzt)
**GRÜN** (kleines Risiko, nur Oberfläche):
- mimik 120 ms, synapsen 200 ms, holo_look 700 ms, anzeige 300 ms, laune.js:160, ui-Schreibmaschinen: heute laufen sie versteckt weiter. Möglich: bei `hidden` pausieren. Nutzen: weniger Rückrufe (versteckt ca. -1500/min). Risiko: Zustand beim Zurückkommen. Vorher nötig: Test, dass die Anzeige beim Sichtbarwerden sofort stimmt.
- Warte-Poller, die nie starten: kein Eingriff nötig, nur beobachten.

**GELB** (Funktion hängt daran):
- Netz-Poller mit direktem/keinem Wächter (sync, kacheln-Wetter, travel, smarttips, zuvorkommend, langzeit, mail_nacht, orte, calendar.js#3, ui.js#6/#7). Heute: versteckt 0 Netzaufrufe im Test. Möglich: einheitlicher Wächter. Risiko: Daten veraltet beim Zurückkommen. Vorher nötig: "Beim Sichtbarwerden sofort nachladen"-Test.
- ruhe.js 400 ms (speist `jvRuhe`), gedaechtnis_zeit ensureProxy 3 s (F), spotify.js#2 ohne Stop, die 7 Doppelstart-Kandidaten oben.
- Der Tagescheck-Schub (189 Einmal-Timer + Serveraufrufe, 45 s nach dem Start): möglicher Entzerrungskandidat, aber nur mit eigenen Tests.

**ROT** (nicht anfassen ohne eigene Phase): alle Kategorie-A-Prozesse (Erinnerung, Weckwort, native Statusmeldung, Wächter, pushsync, Aufträge, Ansagen) und die nicht messbare Avatar-Schleife.

**Mögliche spätere Stromsparmodus-Bausteine** (nichts gebaut): Oberflächen-/Animationstakte (C), häufige Anzeige-Takte, Netz-Poller, sichtbarkeitsabhängige Aktualisierungen. Erinnerung, Alarm und kritische Wächter gehören NICHT hinein.

## 6. Messgrenzen
- Kein echter Hintergrund-Tab: Headless-Chromium drosselt nicht wie ein verstecktes Handy-Tab. Gemessen ist nur Jarvis' eigene Logik (`hidden` künstlich gesetzt).
- 3D-Avatar nicht ladbar (esm.sh), nur statisch.
- Konto-abhängige Timer (konto, mailwatch, fristen, Spotify, Google-Token) laufen im Test nicht.
- Echte Uhr: Rohzähler schwanken; das Soll friert deshalb Kategorien ein, keine Rohzahlen.
- Android/APK nur über eine Attrappe (Proxy), keine echte Messung.
- Alle `/api/*` sind beantwortet mit `{}`, externe Ziele abgebrochen (aber gezählt). Es entstehen keine echten Benachrichtigungen (0).

## 7. Gegenproben A–L (in `tests/hintergrund.js`, nur im Speicher verändert)
A Erinnerungs-Timer entfernt, B kritisches Intervall geändert, C Dauerläufer doppelt gestartet, D Netz-Polling verdoppelt, E Sichtbarkeitsprüfung entfernt, F `clearInterval` entfernt, G native Abfrage entfernt, H Avatar-/Kugel-Schleife doppelt, I Retry unbegrenzt, J unbegrenzter Retry begrenzt, K Timer startet beim Seitenstart statt bei Bedarf, L Bedarfs-Timer wird Dauerläufer: jeweils rot; Kontrollen (Kommentar, Text, harmloser Einmal-Timeout, unverändert) bleiben grün.

## 8. Empfehlung für Phase 6B
Nur klein anfangen: zuerst GRÜN, und zwar eine einzige Gruppe (reine Animations-/Anzeige-Takte bei `hidden` pausieren), mit Vorher-/Nachher-Test "sichtbar wieder = gleiche Anzeige". Kategorie A bleibt unangetastet. Danach Netz-Poller (GELB) einzeln. Vorher Entscheidung des Nutzers, ob überhaupt Strom gespart werden soll.
