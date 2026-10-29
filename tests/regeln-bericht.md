> **Historische Momentaufnahme aus Phase C1 (Shadow-Regeln).** Zahlen und Architekturstand entsprechen diesem Zeitpunkt und sind nicht automatisch der aktuelle Repository-Stand. Der Bericht wird von `REGELN_BERICHT=… node tests/regeln.js` erzeugt; nach einer Neuerzeugung diesen Hinweis wieder voranstellen. Aktueller Stand: `ARCHITEKTUR.md`, `tests/inventar8a-analyse.md`.

# Shadow-Regeln: Soll gegen Ist auf den beiden Messläufen

Nur Messwerte. Die Shadow-Logik (`js/meldungs_regeln.js`) hat in beiden Läufen mitgerechnet; die tatsächlichen Ausgaben sind in allen Varianten identisch (Test „Shadow an / aus / Datei fehlt / wirft Fehler“). Alle Zahlen stammen aus simulierten Läufen mit Attrappen, nicht aus dem echten Betrieb. „Später“ heißt nur: *Diese Meldung wäre zu diesem Zeitpunkt nicht ausgegeben worden.* Es wird nichts nachgeliefert.

## 1. Soll gegen Ist

„Soll“ ist der unabhängig geschriebene Entwurf (`tests/regeln_entwurf.js`), „Ist“ die eingebaute Logik. Verglichen werden je Ausgabe Entscheidung, Stufe, Merker und Mikrofon-Absicht.

| Lauf | Ausgaben | Soll = Ist | Abweichungen |
|---|---|---|---|
| Nachmittag (Mi 28.10.2026, 12:00 bis 15:10) | 47 | 47 | 0 |
| Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00) | 34 | 34 | 0 |

## 2. Ergebnis der eingebauten Logik

| | Nachmittag (Mi 28.10.2026, 12:00 bis 15:10) | Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00) |
|---|---|---|
| zugelassen | 29 | 12 |
| später | 18 | 21 |
| nur stiller Kanal | 0 | 1 |
| unklar | 0 | 0 |
| Ausgaben gesamt | 47 | 34 |
| ausgelöste Vorgänge (nicht entschieden) | 2 | 2 |

Nach Stufe und Entscheidung:

| Stufe / Entscheidung | Nachmittag (Mi 28.10.2026, 12:00 bis 15:10) | Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00) |
|---|---|---|
| HOCH / zugelassen | 10 | 4 |
| KRITISCH / zugelassen | 1 | 1 |
| NIEDRIG / später | 18 | 18 |
| NIEDRIG / zugelassen | 2 | 3 |
| NORMAL / nur stiller Kanal | 0 | 1 |
| NORMAL / später | 0 | 3 |
| NORMAL / zugelassen | 15 | 3 |
| NUTZER / zugelassen | 1 | 1 |

Merker (ändern nichts; eine Ausgabe kann mehrere haben):

| Merker | Nachmittag (Mi 28.10.2026, 12:00 bis 15:10) | Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00) |
|---|---|---|
| anderes_modul | 1 | 0 |
| gewollte_stufen | 1 | 1 |
| gleicher_zweck | 2 | 0 |
| niedrig_in_ruhe | 0 | 4 |
| niedrig_zu_dicht | 15 | 2 |
| selbes_ereignis_anderer_zweck | 4 | 0 |
| wiederholung | 3 | 12 |
| zusammenfassbar | 1 | 0 |

Zahl der Ausgaben je Regel, die die Entscheidung bestimmt hat:

| Regel | Nachmittag (Mi 28.10.2026, 12:00 bis 15:10) | Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00) |
|---|---|---|
| frei | 26 | 7 |
| niedrig-abstand | 15 | 2 |
| niedrig-frei | 2 | 2 |
| niedrig-nachlauf | 0 | 4 |
| niedrig-text | 3 | 12 |
| nutzer-vorrang | 1 | 1 |
| ruhe-matrix | 0 | 6 |

## 3. Bewusst gesetzte Erinnerungen und Fristen

**Nachmittag (Mi 28.10.2026, 12:00 bis 15:10)**

| Uhrzeit | Quelle / Grund | Stufe | Entscheidung | Merker | Kanalschutz (nur Datenmodell) |
|---|---|---|---|---|---|
| Mi 12:40:45 | fristen / frist-gefunden | HOCH | zugelassen | - | - |
| Mi 12:50:45 | fristen / frist-erinnerung | NORMAL | zugelassen | - | - |
| Mi 14:00:30 | proaktiv / erinnerung-vorwarnung | HOCH | zugelassen | - | behalte hinweis+benachrichtigung+karte, Sprache nicht Pflicht |
| Mi 14:30:01 | calendar / erinnerung | HOCH | zugelassen | gewollte_stufen | behalte hinweis+benachrichtigung+karte, Sprache nicht Pflicht |

**Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00)**

| Uhrzeit | Quelle / Grund | Stufe | Entscheidung | Merker | Kanalschutz (nur Datenmodell) |
|---|---|---|---|---|---|
| So 22:30:01 | calendar / erinnerung | HOCH | zugelassen | - | behalte hinweis+benachrichtigung+karte, Sprache nicht Pflicht |
| Mo 03:35:30 | proaktiv / erinnerung-vorwarnung | HOCH | zugelassen | - | behalte hinweis+benachrichtigung+karte, Sprache nicht Pflicht |
| Mo 04:05:01 | calendar / erinnerung | HOCH | zugelassen | gewollte_stufen | behalte hinweis+benachrichtigung+karte, Sprache nicht Pflicht |

## 4. Nachlieferbarkeit und Verfall (nur Rechnung)

Getrennt von der Entscheidung: Jede zurückgestellte Meldung hat Nachlieferbarkeit und Verfallszeit je Meldungsart. NIEDRIG verfällt sofort. Die Vorschau zeigt für das Ende der Ruhephase, was nachlieferbar wäre, wenn man es täte (höchstens 2 gesprochen, Rest als eine stille Sammelkarte, Abgelaufenes verfallen). Im Shadow-Modus passiert nichts davon.

**Nachmittag (Mi 28.10.2026, 12:00 bis 15:10)**: 18 zurückgestellt oder nur still; davon NIEDRIG (nicht nachlieferbar) 18, nachlieferbar 0.

**Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00)**: 22 zurückgestellt oder nur still; davon NIEDRIG (nicht nachlieferbar) 18, nachlieferbar 4.

Zurückgestellte Meldungen der Nacht (ohne NIEDRIG):

| Uhrzeit | Quelle / Grund | Entscheidung | nachlieferbar | Verfall nach | Verfallszeit |
|---|---|---|---|---|---|
| So 23:00:00 | fahr_whatsapp / whatsapp-vorlesen | später | ja | 120 min | Mo 01:00:00 |
| Mo 01:00:00 | auftraege / auftrag-erfuellt | später | ja | 360 min | Mo 07:00:00 |
| Mo 02:12:25 | mailwatch / wichtige-mail | später | ja | 720 min | Mo 14:12:25 |
| Mo 02:30:15 | mail_nacht / mail-entwuerfe | nur stiller Kanal | ja | 480 min | Mo 10:30:15 |

Vorschau am Ende der Ruhephase (Mo 03:30:00): gesprochen höchstens 2: auftraege Mo 01:00:00; mailwatch Mo 02:12:25; stille Sammelkarte: mail_nacht Mo 02:30:15; verfallen: fahr_whatsapp So 23:00:00; verworfen (NIEDRIG oder Doppelte): 18.

## 5. zane_redet (nur gemessen)

| Lauf | Meldungen | zugelassen | später | Gründe der Zurückstellung | Mikrofon: wie bisher / nicht automatisch |
|---|---|---|---|---|---|
| Nachmittag (Mi 28.10.2026, 12:00 bis 15:10) | 14 | 1 | 13 | niedrig-abstand 10, niedrig-text 3 | 2 / 12 |
| Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00) | 18 | 1 | 17 | niedrig-abstand 1, niedrig-text 12, niedrig-nachlauf 4 | 0 / 18 |

## 6. Alle Entscheidungen

### Nachmittag (Mi 28.10.2026, 12:00 bis 15:10)

| Uhrzeit | Quelle / Grund | Stufe | Entscheidung | Regel | Merker | Mikro | Warum |
|---|---|---|---|---|---|---|---|
| Mi 12:00:01 | alarm / briefing-karte | HOCH | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für HOCH |
| Mi 12:00:01 | autoansicht / autoansicht-einsteigen | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 12:00:03 | schlaf_antwort / app-meldung | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 12:00:07 | parkplatz_auto / parkplatz-gemerkt | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 12:00:09 | pakete / paket-zugestellt | NORMAL | zugelassen | frei | - | wie_bisher | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 12:00:25 | kennenlernen / kennenlern-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (16 s) |
| Mi 12:00:40 | orte / standort-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | - | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (31 s) |
| Mi 12:00:45 | preissuche / preis-treffer | NORMAL | zugelassen | frei | - | wie_bisher | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 12:02:01 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (77 s) |
| Mi 12:03:00 | jarvis / start-ansage | NUTZER | zugelassen | nutzer-vorrang | - | - | vom Nutzer angefordert, hat Vorrang |
| Mi 12:05:00 | routinen / routine-vorschlag | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | wie_bisher | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (120 s) |
| Mi 12:10:00 | fahr_whatsapp / whatsapp-vorlesen | NORMAL | zugelassen | frei | - | wie_bisher | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 12:16:40 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (400 s) |
| Mi 12:20:44 | konto / bank-mail | NORMAL | zugelassen | frei | - | wie_bisher | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 12:21:25 | mailwatch / wichtige-mail | NORMAL | zugelassen | frei | zusammenfassbar | wie_bisher | außerhalb der Ruhephase, keine Bremse für NORMAL (zusammen mit konto 12:20:44) |
| Mi 12:31:04 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | wie_bisher | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (579 s) |
| Mi 12:35:00 | smarttips / mitnehmen-tipp | NIEDRIG | zugelassen | niedrig-frei | - | - | keine Bremse greift |
| Mi 12:36:25 | mailwatch / wichtige-mail | NORMAL | zugelassen | frei | - | wie_bisher | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 12:40:45 | fristen / frist-gefunden | HOCH | zugelassen | frei | - | wie_bisher | außerhalb der Ruhephase, keine Bremse für HOCH |
| Mi 12:45:00 | briefing / tagesbriefing | HOCH | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für HOCH |
| Mi 12:46:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | wie_bisher | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (60 s) |
| Mi 12:50:30 | proaktiv / termin-vorwarnung | HOCH | zugelassen | frei | selbes_ereignis_anderer_zweck | - | außerhalb der Ruhephase, keine Bremse für HOCH (zusammen mit smarttips 12:35:00) |
| Mi 12:50:45 | fristen / frist-erinnerung | NORMAL | zugelassen | frei | - | wie_bisher | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 13:00:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (555 s) |
| Mi 13:00:03 | plan_ansagen / aufbruchszeit | HOCH | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für HOCH |
| Mi 13:00:30 | mail_nacht / mail-entwuerfe | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 13:10:00 | auftraege / auftrag-erfuellt | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 13:14:01 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (242 s) |
| Mi 13:28:40 | zane_redet / redet-frage | NIEDRIG | zugelassen | niedrig-frei | - | nicht_automatisch | keine Bremse greift |
| Mi 13:30:25 | vorbereitung / termin-vorbereitet | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 13:35:25 | wachter / termin-gleich | HOCH | zugelassen | frei | selbes_ereignis_anderer_zweck | - | außerhalb der Ruhephase, keine Bremse für HOCH (zusammen mit smarttips 12:35:00, proaktiv 12:50:30) |
| Mi 13:43:01 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (456 s) |
| Mi 13:58:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mi 14:00:30 | proaktiv / erinnerung-vorwarnung | HOCH | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für HOCH |
| Mi 14:08:25 | wachter / abfahrt | HOCH | zugelassen | frei | selbes_ereignis_anderer_zweck | - | außerhalb der Ruhephase, keine Bremse für HOCH (zusammen mit vorbereitung 13:30:25) |
| Mi 14:12:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (215 s) |
| Mi 14:15:00 | travel / abfahrt | HOCH | zugelassen | frei | selbes_ereignis_anderer_zweck, gleicher_zweck, anderes_modul | - | außerhalb der Ruhephase, keine Bremse für HOCH (zusammen mit vorbereitung 13:30:25, wachter 14:08:25) |
| Mi 14:26:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mi 14:30:01 | calendar / erinnerung | HOCH | zugelassen | frei | gewollte_stufen | - | außerhalb der Ruhephase, keine Bremse für HOCH (zusammen mit proaktiv 14:00:30) |
| Mi 14:30:25 | kennenlernen / kennenlern-frage | NIEDRIG | später | niedrig-abstand | gleicher_zweck, niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (24 s) (zusammen mit kennenlernen 12:00:25) |
| Mi 14:35:00 | routinen / routine-hinweis | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | - | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (299 s) |
| Mi 14:40:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (599 s) |
| Mi 14:40:00 | alarm / warnung | KRITISCH | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für KRITISCH |
| Mi 14:45:01 | zuvorkommend / geburtstag-vorfrage | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 14:50:01 | orte / einkaufsliste-markt | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| Mi 14:54:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (239 s) |
| Mi 15:08:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |

### Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00)

| Uhrzeit | Quelle / Grund | Stufe | Entscheidung | Regel | Merker | Mikro | Warum |
|---|---|---|---|---|---|---|---|
| So 21:00:01 | autoansicht / autoansicht-einsteigen | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| So 21:00:03 | schlaf_antwort / app-meldung | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| So 21:00:19 | dirigent / tagesmeldung | NORMAL | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NORMAL |
| So 21:00:40 | orte / standort-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | - | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (21 s) |
| So 21:02:01 | zane_redet / redet-frage | NIEDRIG | später | niedrig-abstand | niedrig_zu_dicht | nicht_automatisch | weniger als 10 min nach anderer zugelassener Sprach-Ausgabe (102 s) |
| So 21:05:00 | jarvis / start-ansage | NUTZER | zugelassen | nutzer-vorrang | - | - | vom Nutzer angefordert, hat Vorrang |
| So 21:16:40 | zane_redet / redet-frage | NIEDRIG | zugelassen | niedrig-frei | - | nicht_automatisch | keine Bremse greift |
| So 21:31:04 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| So 21:46:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| So 22:30:01 | calendar / erinnerung | HOCH | zugelassen | ruhe-matrix | - | - | Ruhephase, aber HOCH darf alle Kanäle (bewusst gesetzt) |
| So 23:00:00 | fahr_whatsapp / whatsapp-vorlesen | NORMAL | später | ruhe-matrix | - | wie_bisher | Ruhephase: NORMAL hat keinen erlaubten Kanal |
| Mo 01:00:00 | auftraege / auftrag-erfuellt | NORMAL | später | ruhe-matrix | - | - | Ruhephase: NORMAL hat keinen erlaubten Kanal |
| Mo 02:12:25 | mailwatch / wichtige-mail | NORMAL | später | ruhe-matrix | - | wie_bisher | Ruhephase: NORMAL hat keinen erlaubten Kanal |
| Mo 02:30:15 | mail_nacht / mail-entwuerfe | NORMAL | nur stiller Kanal | ruhe-matrix | - | - | Ruhephase: sprache aus, karte bleibt |
| Mo 03:00:00 | alarm / warnung | KRITISCH | zugelassen | ruhe-matrix | - | - | Ruhephase, aber KRITISCH darf alle Kanäle |
| Mo 03:30:00 | briefing / tagesbriefing | HOCH | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für HOCH |
| Mo 03:33:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-nachlauf | niedrig_in_ruhe | nicht_automatisch | Nachlauf: Ruhephase endete vor weniger als 60 min |
| Mo 03:35:30 | proaktiv / erinnerung-vorwarnung | HOCH | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für HOCH |
| Mo 03:47:04 | zane_redet / redet-frage | NIEDRIG | später | niedrig-nachlauf | niedrig_in_ruhe | nicht_automatisch | Nachlauf: Ruhephase endete vor weniger als 60 min |
| Mo 04:01:34 | zane_redet / redet-frage | NIEDRIG | später | niedrig-nachlauf | niedrig_in_ruhe | nicht_automatisch | Nachlauf: Ruhephase endete vor weniger als 60 min |
| Mo 04:05:01 | calendar / erinnerung | HOCH | zugelassen | frei | gewollte_stufen | - | außerhalb der Ruhephase, keine Bremse für HOCH (zusammen mit proaktiv 03:35:30) |
| Mo 04:16:01 | zane_redet / redet-frage | NIEDRIG | später | niedrig-nachlauf | niedrig_in_ruhe | nicht_automatisch | Nachlauf: Ruhephase endete vor weniger als 60 min |
| Mo 04:30:34 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 04:45:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 04:59:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 05:13:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 05:27:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 05:41:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 05:55:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 06:09:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 06:23:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 06:37:00 | zane_redet / redet-frage | NIEDRIG | später | niedrig-text | wiederholung | nicht_automatisch | gleicher Text innerhalb 24 h schon gesagt |
| Mo 07:05:01 | tagesueberblick / tagesueberblick-leer | NIEDRIG | zugelassen | frei | - | - | außerhalb der Ruhephase, keine Bremse für NIEDRIG |
| Mo 09:00:25 | kennenlernen / kennenlern-frage | NIEDRIG | zugelassen | niedrig-frei | - | nicht_automatisch | keine Bremse greift |
