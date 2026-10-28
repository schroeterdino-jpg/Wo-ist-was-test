# C1a Messbericht: simulierter Nachmittag (nur Messwerte, keine Bewertung)

**Szenario (virtuelle Uhr, Mittwoch 28.10.2026, Berlin):** Spätschicht (Briefing ab 12:45). Termin „Arzt Hamburg“ um 15:00 mit Ort (Kalender-ID `gcal_arzt_0815`). Erinnerung „Unterlagen für den Arzt“ um 14:30. Fahrzeit-Attrappe 40 Minuten. Android-App angeschlossen (die Aufbruchs-Ansage um 13:00 wird so ausgelöst, wie die App sie abholt). Der Lauf geht von 12:00 bis 15:10.

Die Attrappen für Netz und Standort sind fest; Zufallszahlen sind festgesetzt. Ein Eintrag entsteht nur, wenn tatsächlich eine Ausgabe ausgelöst wird (keine Prüfungen/Polls).

## 1. Alle Einträge in zeitlicher Reihenfolge

| Nr | Uhrzeit | Quelle | Kanal | Grund | Auslöser | Ereignis | Bezug (Art: Schlüssel, Herkunft) | Text (80 Zeichen) |
|---|---|---|---|---|---|---|---|---|
| 1 | 12:45:00 | schicht | sprache | schicht-briefing | timer | `brief|2026-10-28` | tag: `2026-10-28`, tag |  |
| 2 | 13:00:02 | plan_ansagen | sprache+fenster | aufbruchszeit | plan | `aufbruch|2026-10-28` | tag: `2026-10-28`, tag | Es ist Zeit zum Losfahren. Die Fahrt dauert rund 30 Minuten, deine Spätschicht b |
| 3 | 13:30:34 | vorbereitung | karte+sprache | termin-vorbereitet | timer | `vgcal_arzt_0815|2026-10-28T15:00` | termin: `gcal_arzt_0815`, id | Ich habe mir erlaubt, deinen Termin Arzt Hamburg um 15:00 Uhr vorzubereiten. Ham |
| 4 | 14:00:30 | proaktiv | karte | erinnerung-vorwarnung | timer | `rem|Unterlagen für den Arzt|2026-10-28T13:30:00.000Z` | erinnerung: `1793185200000`, id | In 30 Minuten: Unterlagen für den Arzt. |
| 5 | 14:08:25 | wachter | sprache | abfahrt | timer | `leave|Arzt Hamburg|2026-10-28T15:00:00+01:00` | termin: `gcal_arzt_0815`, id | Dino, es wird Zeit: Du solltest jetzt zu „Arzt Hamburg“ losfahren. Die Fahrt dau |
| 6 | 14:15:00 | travel | sprache | abfahrt | timer | `gcal_arzt_0815` | termin: `gcal_arzt_0815`, id | Du solltest jetzt losfahren, sonst schaffst du es nicht rechtzeitig zu Arzt Hamb |
| 7 | 14:30:01 | calendar | sprache | erinnerung | timer | `rem|1793185200000` | erinnerung: `1793185200000`, id | Zur Erinnerung: Unterlagen für den Arzt |

## 2. Einträge mit demselben Bezug (Gruppen), mit zeitlichen Abständen

**tag: 2026-10-28** (Herkunft: tag), 2 Eintrag/Einträge von 2 Quelle(n): schicht, plan_ansagen
- 12:45:00 | schicht | sprache | schicht-briefing | Abstand zur vorigen: -
- 13:00:02 | plan_ansagen | sprache+fenster | aufbruchszeit | Abstand zur vorigen: 902 s

**termin: gcal_arzt_0815** (Herkunft: id), 3 Eintrag/Einträge von 3 Quelle(n): vorbereitung, wachter, travel
- 13:30:34 | vorbereitung | karte+sprache | termin-vorbereitet | Abstand zur vorigen: -
- 14:08:25 | wachter | sprache | abfahrt | Abstand zur vorigen: 2271 s
- 14:15:00 | travel | sprache | abfahrt | Abstand zur vorigen: 395 s

**erinnerung: 1793185200000** (Herkunft: id), 2 Eintrag/Einträge von 2 Quelle(n): proaktiv, calendar
- 14:00:30 | proaktiv | karte | erinnerung-vorwarnung | Abstand zur vorigen: -
- 14:30:01 | calendar | sprache | erinnerung | Abstand zur vorigen: 1771 s

## 3. Zusammenfassung der Messwerte

- Einträge insgesamt: 7 (schicht 1, plan_ansagen 1, vorbereitung 1, proaktiv 1, wachter 1, travel 1, calendar 1)
- Kanäle: sprache 6, fenster 1, karte 2
- Auslöser: timer 6, plan 1
- Einträge mit Termin-Bezug: 3, davon mit stabiler ID: 3, mit Rückfall Text+Zeit: 0
- Gesprochene Meldungen der zehn Quellen: 6; kleinster Abstand zwischen zwei gesprochenen Meldungen: 395 s, größter: 2271 s

## 4. Ausgaben im selben Zeitraum, die NICHT zu den zehn Quellen von C1a gehören (nur zur Einordnung, nicht gezählt)

| Uhrzeit | Modul | Text |
|---|---|---|
| 12:00 | hud_fenster.js:sagen | Hallo. Heute steht ein Termin an: Arzt Hamburg um 15 Uhr. |
| 12:00 | orte.js:sagen | Ich kann dich im Supermarkt an deine Einkaufsliste erinnern. Dafür braucht die App den Sta |
| 12:02 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 12:16 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 12:30 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 12:44 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 12:45 | briefing.js:triggerDailyBriefing | Guten Tag, Dino. Es ist 12 Uhr 45. Heute hast du Spätschicht, Abfahrt um 13 Uhr. Wetterdat |
| 12:59 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 13:13 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 13:27 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 13:42 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 13:56 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 14:10 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 14:25 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 14:39 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 14:53 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |
| 15:08 | zane_redet.js:sprich | Na, Dino? Wie läuft dein Abend bisher? |

## 5. Kontrolle gegen die tatsächlichen Ausgaben der Attrappe (Sprache)

Von 22 Sprachausgaben im Messlauf lassen sich 5 einem Eintrag der zehn Quellen zuordnen (gleicher Text, gleiche Minute); 17 stammen von anderen Modulen. Meldungen mit Karte oder Fenster ohne Sprache stehen nur in Abschnitt 1. Beim Eintrag von schicht.js (12:45) ist der Text leer, weil das Tagesbriefing selbst von briefing.js gesprochen wird (steht deshalb in Abschnitt 4).
