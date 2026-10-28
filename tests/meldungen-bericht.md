# C1 Gesamtbericht der Messung (alle instrumentierten App-Meldungsquellen)

Nur Messwerte. Kein Urteil, keine Regel, kein Vorschlag. Alle Zahlen stammen aus simulierten Läufen mit festen Attrappen für Netz, Handy-Brücke und Standort (siehe `tests/meldungen_welt.js`), nicht aus echtem Betrieb.

## Annahmen und Grenzen der Messung

- Die App ist in beiden Läufen die ganze Zeit offen und sichtbar. Das ist der ungünstigste Fall; in der Praxis läuft nachts vieles nur über die Handy-App oder als Push.
- Server-Push (api/sync.js) ist nicht gemessen und nicht verändert.
- Eine Ausgabe ist ein Eintrag mit Status „ausgegeben“: Sprache, Karte, Fenster oder Hinweis wurde für den Nutzer ausgelöst. „ausgeloest“ heißt: ein Modul stößt nur einen Vorgang an, dessen Ausgabe woanders entsteht (schicht.js und plan_ansagen „brief“ stoßen das Briefing an, gesprochen wird es in briefing.js; jarvis.js legt die Start-Ansage bereit, gesprochen wird sie erst beim ersten Tipp).
- Die Sprachausgabe der Attrappe dauert 14 Zeichen pro Sekunde (mindestens 1,5 s); in dieser Zeit meldet isSpeaking() = true, wie in der App. Dadurch warten Quellen, die isSpeaking() prüfen, so wie in der App.
- Fest angenommene Nutzer-Handlungen im Lauf (damit Quellen, die auf eine Antwort warten, weiterlaufen): Antworten „Nein“ auf die Mail-Fragen (nur Nachmittag), ein Tipp auf den Bildschirm für die Start-Ansage, WhatsApp-Nachricht, Warn-Push, Supermarkt-Meldung der Handy-App. Auslöser von außen (Push, Handy-Brücke) sind direkte Aufrufe der Empfangsstellen.
- Der Text jeder Ausgabe ist auf 80 Zeichen gekürzt; Ereignis-Bezüge nutzen echte IDs (Termin, Mail, Paket, Auftrag, Nachricht …) und fallen nur ohne ID auf Text und Zeit zurück.
- Die Kennenlern-Frage und zane_redet verwenden in der Simulation die Rückfall-Sätze ohne KI (die KI-Attrappe liefert für sie nichts); die Zahl der Meldungen hängt von Zufall und Stufen ab (Zufallszahl hier fest).
- Ruhezeit-Regeln wie ruhe.js (Briefing läuft gerade) sind nicht einzeln ausgewertet.

## Überblick

| Quelle | Nachmittag (Mi 28.10.2026, 12:00 bis 15:10): ausgegeben (ausgeloest) | Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00): ausgegeben (ausgeloest) | Kanäle (beide Läufe) |
|---|---|---|---|
| calendar | 1 (0) | 2 (0) | sprache |
| dirigent | 0 (0) | 1 (0) | fenster, karte, sprache |
| plan_ansagen | 1 (0) | 0 (0) | fenster, sprache |
| proaktiv | 2 (0) | 1 (0) | karte |
| schicht | 0 (1) | 0 (1) | - |
| smarttips | 1 (0) | 0 (0) | sprache |
| travel | 1 (0) | 0 (0) | sprache |
| vorbereitung | 1 (0) | 0 (0) | karte, sprache |
| wachter | 2 (0) | 0 (0) | sprache |
| zuvorkommend | 1 (0) | 0 (0) | karte, sprache |
| alarm | 2 (0) | 1 (0) | fenster, sprache |
| auftraege | 1 (0) | 1 (0) | sprache |
| autoansicht | 1 (0) | 1 (0) | fenster, sprache |
| fahr_whatsapp | 1 (0) | 1 (0) | fenster, sprache |
| fristen | 2 (0) | 0 (0) | karte, sprache |
| jarvis | 1 (1) | 1 (1) | sprache |
| kennenlernen | 2 (0) | 1 (0) | sprache |
| konto | 1 (0) | 0 (0) | sprache |
| mail_nacht | 1 (0) | 1 (0) | karte, sprache |
| mailwatch | 2 (0) | 1 (0) | sprache |
| orte | 2 (0) | 1 (0) | karte, sprache |
| pakete | 1 (0) | 0 (0) | hinweis, sprache |
| parkplatz_auto | 1 (0) | 0 (0) | sprache |
| preissuche | 1 (0) | 0 (0) | sprache |
| routinen | 2 (0) | 0 (0) | karte, sprache |
| schlaf_antwort | 1 (0) | 1 (0) | fenster, sprache |
| tagesueberblick | 0 (0) | 1 (0) | fenster |
| zane_redet | 14 (0) | 18 (0) | sprache |
| briefing | 1 (0) | 1 (0) | sprache |
| **Summe** | **47** (2) | **34** (2) | |

## 1. Nachmittag (Mi 28.10.2026, 12:00 bis 15:10)

Ausgaben (Status "ausgegeben"): **47**. Ausgelöste Vorgänge ohne eigene Ausgabe (Status "ausgeloest"): **2**.

### 1.1 Anzahl je Quelle

| Quelle | ausgeloest | ausgegeben | davon mit Sprache | davon mit Karte/Fenster/Hinweis |
|---|---|---|---|---|
| calendar | 0 | 1 | 1 | 0 |
| dirigent | 0 | 0 | 0 | 0 |
| plan_ansagen | 0 | 1 | 1 | 1 |
| proaktiv | 0 | 2 | 0 | 2 |
| schicht | 1 | 0 | 0 | 0 |
| smarttips | 0 | 1 | 1 | 0 |
| travel | 0 | 1 | 1 | 0 |
| vorbereitung | 0 | 1 | 1 | 1 |
| wachter | 0 | 2 | 2 | 0 |
| zuvorkommend | 0 | 1 | 1 | 1 |
| alarm | 0 | 2 | 1 | 2 |
| auftraege | 0 | 1 | 1 | 0 |
| autoansicht | 0 | 1 | 1 | 1 |
| fahr_whatsapp | 0 | 1 | 1 | 1 |
| fristen | 0 | 2 | 2 | 2 |
| jarvis | 1 | 1 | 1 | 0 |
| kennenlernen | 0 | 2 | 2 | 0 |
| konto | 0 | 1 | 1 | 0 |
| mail_nacht | 0 | 1 | 1 | 1 |
| mailwatch | 0 | 2 | 2 | 0 |
| orte | 0 | 2 | 2 | 2 |
| pakete | 0 | 1 | 1 | 1 |
| parkplatz_auto | 0 | 1 | 1 | 0 |
| preissuche | 0 | 1 | 1 | 0 |
| routinen | 0 | 2 | 2 | 2 |
| schlaf_antwort | 0 | 1 | 1 | 1 |
| tagesueberblick | 0 | 0 | 0 | 0 |
| zane_redet | 0 | 14 | 14 | 0 |
| briefing (spricht das angestoßene Briefing) | 0 | 1 | 1 | 0 |

### 1.2 Anzahl je Kanal

| Kanal | Ausgaben (eine Ausgabe mit mehreren Kanälen zählt bei jedem Kanal) |
|---|---|
| fenster | 6 |
| hinweis | 1 |
| karte | 11 |
| sprache | 44 |

Auslöser: apk 5, app-start 1, folge 1, manuell 1, plan 2, push 3, timer 34.

### 1.3 Zeitliche Abstände zwischen Ausgaben

- Alle Ausgaben (47): kleinster Abstand 0 s, Mittelwert (Median) 4 min, größter 15 min.
- Nur Ausgaben mit Sprache (44): kleinster 0 s, Median 4 min, größter 15 min.
- Ausgaben höchstens 60 s nach der vorigen Ausgabe: 15.

Die zehn kleinsten Abstände:

| Abstand | vorige Ausgabe | nächste Ausgabe |
|---|---|---|
| 0 s | 12:00:01 alarm (briefing-karte) | 12:00:01 autoansicht (autoansicht-einsteigen) |
| 0 s | 14:40:00 zane_redet (redet-frage) | 14:40:00 alarm (warnung) |
| 1 s | 12:00:01 autoansicht (autoansicht-einsteigen) | 12:00:03 schlaf_antwort (app-meldung) |
| 2 s | 12:00:07 parkplatz_auto (parkplatz-gemerkt) | 12:00:09 pakete (paket-zugestellt) |
| 3 s | 13:00:00 zane_redet (redet-frage) | 13:00:03 plan_ansagen (aufbruchszeit) |
| 4 s | 12:00:03 schlaf_antwort (app-meldung) | 12:00:07 parkplatz_auto (parkplatz-gemerkt) |
| 5 s | 12:00:40 orte (standort-frage) | 12:00:45 preissuche (preis-treffer) |
| 15 s | 12:00:25 kennenlernen (kennenlern-frage) | 12:00:40 orte (standort-frage) |
| 15 s | 12:50:30 proaktiv (termin-vorwarnung) | 12:50:45 fristen (frist-erinnerung) |
| 16 s | 12:00:09 pakete (paket-zugestellt) | 12:00:25 kennenlernen (kennenlern-frage) |

Abstände je Quelle (zwischen zwei Ausgaben derselben Quelle):

| Quelle | Ausgaben | kleinster Abstand | Median | größter |
|---|---|---|---|---|
| proaktiv | 2 | 1 h 10 min | 1 h 10 min | 1 h 10 min |
| wachter | 2 | 33 min | 33 min | 33 min |
| alarm | 2 | 2 h 40 min | 2 h 40 min | 2 h 40 min |
| fristen | 2 | 10 min | 10 min | 10 min |
| kennenlernen | 2 | 2 h 30 min | 2 h 30 min | 2 h 30 min |
| mailwatch | 2 | 15 min | 15 min | 15 min |
| orte | 2 | 2 h 49 min | 2 h 49 min | 2 h 49 min |
| routinen | 2 | 2 h 30 min | 2 h 30 min | 2 h 30 min |
| zane_redet | 14 | 14 min | 14 min | 15 min |

### 1.4 Ausgaben mit demselben Ereignis-Bezug

**tag: 2026-10-28** (Herkunft tag): 4 Ausgaben von 4 Quelle(n) (alarm, jarvis, briefing, plan_ansagen), 4 verschiedene Text(e).
- 12:00:01 | alarm | fenster | briefing-karte | Abstand zur vorigen: - | „Briefing. Guten Tag, Dino. Heute hast du Spätschicht.“
- 12:03:00 | jarvis | sprache | start-ansage | Abstand zur vorigen: 3 min | „Systeme online. Guten Tag, Sir. Heute Spätschicht. 2 Termine heute, der nächste “
- 12:45:00 | briefing | sprache | tagesbriefing | Abstand zur vorigen: 42 min | „Guten Tag, Dino. Es ist 12 Uhr 45. Heute hast du Spätschicht, Abfahrt um 13 Uhr.“
- 13:00:03 | plan_ansagen | sprache+fenster | aufbruchszeit | Abstand zur vorigen: 15 min | „Es ist Zeit zum Losfahren. Die Fahrt dauert rund 30 Minuten, deine Spätschicht b“

**frage: k21** (Herkunft id): 2 Ausgaben von 1 Quelle(n) (kennenlernen), 1 verschiedene Text(e).
- 12:00:25 | kennenlernen | sprache | kennenlern-frage | Abstand zur vorigen: - | „Hast du Haustiere, oder hättest du gern welche?“
- 14:30:25 | kennenlernen | sprache | kennenlern-frage | Abstand zur vorigen: 2 h 30 min | „Hast du Haustiere, oder hättest du gern welche?“

**mail: bank_1** (Herkunft id): 2 Ausgaben von 2 Quelle(n) (konto, mailwatch), 2 verschiedene Text(e).
- 12:20:44 | konto | sprache | bank-mail | Abstand zur vorigen: - | „Auf deinem Konto ist ein Eingang von 120 Euro. Betreff: Kontobewegung: Gutschrif“
- 12:21:25 | mailwatch | sprache | wichtige-mail | Abstand zur vorigen: 41 s | „Du hast eine E-Mail von Sparkasse Lüneburg. Betreff: Kontobewegung: Gutschrift 1“

**termin: gcal_schwimmen_0816** (Herkunft id): 3 Ausgaben von 3 Quelle(n) (smarttips, proaktiv, wachter), 3 verschiedene Text(e).
- 12:35:00 | smarttips | sprache | mitnehmen-tipp | Abstand zur vorigen: - | „In Kürze steht "Schwimmen Hallenbad" an. Übrigens: Denk an Badesachen und ein Ha“
- 12:50:30 | proaktiv | karte | termin-vorwarnung | Abstand zur vorigen: 16 min | „In einer Stunde hast du: Schwimmen Hallenbad.“
- 13:35:25 | wachter | sprache | termin-gleich | Abstand zur vorigen: 45 min | „Dino, in 15 Minuten wartet „Schwimmen Hallenbad“. Nur zur Erinnerung.“

**termin: gcal_arzt_0815** (Herkunft id): 3 Ausgaben von 3 Quelle(n) (vorbereitung, wachter, travel), 3 verschiedene Text(e).
- 13:30:25 | vorbereitung | karte+sprache | termin-vorbereitet | Abstand zur vorigen: - | „Ich habe mir erlaubt, deinen Termin Arzt Hamburg um 15:00 Uhr vorzubereiten. Ham“
- 14:08:25 | wachter | sprache | abfahrt | Abstand zur vorigen: 38 min | „Dino, es wird Zeit: Du solltest jetzt zu „Arzt Hamburg“ losfahren. Die Fahrt dau“
- 14:15:00 | travel | sprache | abfahrt | Abstand zur vorigen: 7 min | „Du solltest jetzt losfahren, sonst schaffst du es nicht rechtzeitig zu Arzt Hamb“

**erinnerung: 1793185200000** (Herkunft id): 2 Ausgaben von 2 Quelle(n) (proaktiv, calendar), 2 verschiedene Text(e).
- 14:00:30 | proaktiv | karte | erinnerung-vorwarnung | Abstand zur vorigen: - | „In 30 Minuten: Unterlagen für den Arzt.“
- 14:30:01 | calendar | sprache | erinnerung | Abstand zur vorigen: 30 min | „Zur Erinnerung: Unterlagen für den Arzt“

Bezüge, zu denen es mehr als einen verschiedenen Text gab: 5 von 6.
Bezüge, in denen derselbe Text mehrfach vorkam: 1.

### 1.5 Identische Texte

| Text (80 Zeichen) | Anzahl | Quellen | Uhrzeiten |
|---|---|---|---|
| Dino, was liegt heute noch an? | 14 | zane_redet | 12:02:01, 12:16:40, 12:31:04, 12:46:00, 13:00:00, 13:14:01, 13:28:40, 13:43:01, 13:58:00, 14:12:00, 14:26:00, 14:40:00, 14:54:00, 15:08:00 |
| Hast du Haustiere, oder hättest du gern welche? | 2 | kennenlernen | 12:00:25, 14:30:25 |

### 1.6 Meldungen während anderer Meldungen

Die Sprachausgabe der Attrappe dauert so lang wie echte Sprache (14 Zeichen pro Sekunde, mindestens 1,5 s) und meldet in dieser Zeit isSpeaking() = true. Hier gezählt: Sprachausgaben, die angefordert wurden, während noch eine andere lief (die Attrappe stellt sie dahinter).

Anzahl: **3** von 45 Sprachausgaben.

| Angefordert | Quelle (Eintrag) | lief noch | Wartezeit |
|---|---|---|---|
| 12:00:03 | schlaf_antwort (app-meldung) | autoansicht (autoansicht-einsteigen) | 0 s |
| 12:00:09 | pakete (paket-zugestellt) | parkplatz_auto (parkplatz-gemerkt) | 3 s |
| 12:00:45 | preissuche (preis-treffer) | orte (standort-frage) | 7 s |

### 1.7 Ausgaben während Ruhezeiten

Ruhezeit nach der App-Regel: das Ergebnis von wachterQuiet() zu dem Zeitpunkt (22 bis 7 Uhr; in Frühschicht-Wochen ab 21:30 bis zur Briefing-Zeit). Feste Regel: 22 bis 7 Uhr.

Ausgaben in der Ruhezeit nach App-Regel: **0**; nach fester Regel 22 bis 7 Uhr: **0**.

### 1.8 Ausgelöste Vorgänge gegenüber tatsächlichen Ausgaben

- 12:00:03 jarvis stößt „start-ansage“ an (app-start) → bis zum Ende des Messlaufs keine zugehörige Ausgabe
- 12:45:00 schicht stößt „schicht-briefing“ an (timer) → 12:45:00 briefing (tagesbriefing, folge, sprache), nach 0 s

Gezählte Nutzer-Ausgaben des Tagesbriefings: 1; tatsächlich gesprochene Briefings (Textanfang „Guten Tag/Morgen, <Name>. Es ist …“): 1.

## 2. Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00)

Ausgaben (Status "ausgegeben"): **34**. Ausgelöste Vorgänge ohne eigene Ausgabe (Status "ausgeloest"): **2**.

### 2.1 Anzahl je Quelle

| Quelle | ausgeloest | ausgegeben | davon mit Sprache | davon mit Karte/Fenster/Hinweis |
|---|---|---|---|---|
| calendar | 0 | 2 | 2 | 0 |
| dirigent | 0 | 1 | 1 | 1 |
| plan_ansagen | 0 | 0 | 0 | 0 |
| proaktiv | 0 | 1 | 0 | 1 |
| schicht | 1 | 0 | 0 | 0 |
| smarttips | 0 | 0 | 0 | 0 |
| travel | 0 | 0 | 0 | 0 |
| vorbereitung | 0 | 0 | 0 | 0 |
| wachter | 0 | 0 | 0 | 0 |
| zuvorkommend | 0 | 0 | 0 | 0 |
| alarm | 0 | 1 | 1 | 1 |
| auftraege | 0 | 1 | 1 | 0 |
| autoansicht | 0 | 1 | 1 | 1 |
| fahr_whatsapp | 0 | 1 | 1 | 1 |
| fristen | 0 | 0 | 0 | 0 |
| jarvis | 1 | 1 | 1 | 0 |
| kennenlernen | 0 | 1 | 1 | 0 |
| konto | 0 | 0 | 0 | 0 |
| mail_nacht | 0 | 1 | 1 | 1 |
| mailwatch | 0 | 1 | 1 | 0 |
| orte | 0 | 1 | 1 | 1 |
| pakete | 0 | 0 | 0 | 0 |
| parkplatz_auto | 0 | 0 | 0 | 0 |
| preissuche | 0 | 0 | 0 | 0 |
| routinen | 0 | 0 | 0 | 0 |
| schlaf_antwort | 0 | 1 | 1 | 1 |
| tagesueberblick | 0 | 1 | 0 | 1 |
| zane_redet | 0 | 18 | 18 | 0 |
| briefing (spricht das angestoßene Briefing) | 0 | 1 | 1 | 0 |

### 2.2 Anzahl je Kanal

| Kanal | Ausgaben (eine Ausgabe mit mehreren Kanälen zählt bei jedem Kanal) |
|---|---|
| fenster | 6 |
| karte | 4 |
| sprache | 32 |

Auslöser: apk 3, app-rueckkehr 1, app-start 1, folge 1, manuell 1, push 2, timer 25.

### 2.3 Zeitliche Abstände zwischen Ausgaben

- Alle Ausgaben (34): kleinster Abstand 1 s, Mittelwert (Median) 14 min, größter 2 h 0 min.
- Nur Ausgaben mit Sprache (32): kleinster 1 s, Median 14 min, größter 2 h 23 min.
- Ausgaben höchstens 60 s nach der vorigen Ausgabe: 3.

Die zehn kleinsten Abstände:

| Abstand | vorige Ausgabe | nächste Ausgabe |
|---|---|---|
| 1 s | So 21:00:01 autoansicht (autoansicht-einsteigen) | So 21:00:03 schlaf_antwort (app-meldung) |
| 17 s | So 21:00:03 schlaf_antwort (app-meldung) | So 21:00:19 dirigent (tagesmeldung) |
| 21 s | So 21:00:19 dirigent (tagesmeldung) | So 21:00:40 orte (standort-frage) |
| 81 s | So 21:00:40 orte (standort-frage) | So 21:02:01 zane_redet (redet-frage) |
| 3 min | Mo 03:33:00 zane_redet (redet-frage) | Mo 03:35:30 proaktiv (erinnerung-vorwarnung) |
| 3 min | So 21:02:01 zane_redet (redet-frage) | So 21:05:00 jarvis (start-ansage) |
| 3 min | Mo 03:30:00 briefing (tagesbriefing) | Mo 03:33:00 zane_redet (redet-frage) |
| 3 min | Mo 04:01:34 zane_redet (redet-frage) | Mo 04:05:01 calendar (erinnerung) |
| 11 min | Mo 04:05:01 calendar (erinnerung) | Mo 04:16:01 zane_redet (redet-frage) |
| 12 min | Mo 03:35:30 proaktiv (erinnerung-vorwarnung) | Mo 03:47:04 zane_redet (redet-frage) |

Abstände je Quelle (zwischen zwei Ausgaben derselben Quelle):

| Quelle | Ausgaben | kleinster Abstand | Median | größter |
|---|---|---|---|---|
| calendar | 2 | 5 h 35 min | 5 h 35 min | 5 h 35 min |
| zane_redet | 18 | 14 min | 14 min | 5 h 47 min |

### 2.4 Ausgaben mit demselben Ereignis-Bezug

**tag: 2026-11-01** (Herkunft tag): 2 Ausgaben von 2 Quelle(n) (dirigent, jarvis), 2 verschiedene Text(e).
- So 21:00:19 | dirigent | sprache+fenster+karte | tagesmeldung | Abstand zur vorigen: - | „Guten Tag, Dino. Hier ist deine Tagesmeldung.“
- So 21:05:00 | jarvis | sprache | start-ansage | Abstand zur vorigen: 5 min | „Systeme online. Guten Abend, Sir.“

**tag: 2026-11-02** (Herkunft tag): 2 Ausgaben von 2 Quelle(n) (briefing, tagesueberblick), 2 verschiedene Text(e).
- Mo 03:30:00 | briefing | sprache | tagesbriefing | Abstand zur vorigen: - | „Guten Morgen, Dino. Es ist 3 Uhr 30. Heute hast du Frühschicht, Abfahrt um 4 Uhr“
- Mo 07:05:01 | tagesueberblick | fenster | tagesueberblick-leer | Abstand zur vorigen: 3 h 35 min | „Tagesüberblick“

**erinnerung: 1793563201500** (Herkunft id): 2 Ausgaben von 2 Quelle(n) (proaktiv, calendar), 2 verschiedene Text(e).
- Mo 03:35:30 | proaktiv | karte | erinnerung-vorwarnung | Abstand zur vorigen: - | „In 30 Minuten: Brotdose einpacken.“
- Mo 04:05:01 | calendar | sprache | erinnerung | Abstand zur vorigen: 30 min | „Zur Erinnerung: Brotdose einpacken“

Bezüge, zu denen es mehr als einen verschiedenen Text gab: 3 von 3.
Bezüge, in denen derselbe Text mehrfach vorkam: 0.

### 2.5 Identische Texte

| Text (80 Zeichen) | Anzahl | Quellen | Uhrzeiten |
|---|---|---|---|
| Na, Dino? Wie läuft dein Abend bisher? | 18 | zane_redet | So 21:02:01, So 21:16:40, So 21:31:04, So 21:46:00, Mo 03:33:00, Mo 03:47:04, Mo 04:01:34, Mo 04:16:01, Mo 04:30:34, Mo 04:45:00, Mo 04:59:00, Mo 05:13:00, Mo 05:27:00, Mo 05:41:00, Mo 05:55:00, Mo 06:09:00, Mo 06:23:00, Mo 06:37:00 |

### 2.6 Meldungen während anderer Meldungen

Die Sprachausgabe der Attrappe dauert so lang wie echte Sprache (14 Zeichen pro Sekunde, mindestens 1,5 s) und meldet in dieser Zeit isSpeaking() = true. Hier gezählt: Sprachausgaben, die angefordert wurden, während noch eine andere lief (die Attrappe stellt sie dahinter).

Anzahl: **1** von 32 Sprachausgaben.

| Angefordert | Quelle (Eintrag) | lief noch | Wartezeit |
|---|---|---|---|
| So 21:00:03 | schlaf_antwort (app-meldung) | autoansicht (autoansicht-einsteigen) | 0 s |

### 2.7 Ausgaben während Ruhezeiten

Ruhezeit nach der App-Regel: das Ergebnis von wachterQuiet() zu dem Zeitpunkt (22 bis 7 Uhr; in Frühschicht-Wochen ab 21:30 bis zur Briefing-Zeit). Feste Regel: 22 bis 7 Uhr.

Ausgaben in der Ruhezeit nach App-Regel: **6**; nach fester Regel 22 bis 7 Uhr: **23**.

| Uhrzeit | Quelle | Kanal | Grund | App-Regel | feste Regel 22-7 |
|---|---|---|---|---|---|
| So 22:30:01 | calendar | sprache | erinnerung | Ruhezeit | Ruhezeit |
| So 23:00:00 | fahr_whatsapp | fenster+sprache | whatsapp-vorlesen | Ruhezeit | Ruhezeit |
| Mo 01:00:00 | auftraege | sprache | auftrag-erfuellt | Ruhezeit | Ruhezeit |
| Mo 02:12:25 | mailwatch | sprache | wichtige-mail | Ruhezeit | Ruhezeit |
| Mo 02:30:15 | mail_nacht | karte+sprache | mail-entwuerfe | Ruhezeit | Ruhezeit |
| Mo 03:00:00 | alarm | fenster+sprache | warnung | Ruhezeit | Ruhezeit |
| Mo 03:30:00 | briefing | sprache | tagesbriefing | nein | Ruhezeit |
| Mo 03:33:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 03:35:30 | proaktiv | karte | erinnerung-vorwarnung | nein | Ruhezeit |
| Mo 03:47:04 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 04:01:34 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 04:05:01 | calendar | sprache | erinnerung | nein | Ruhezeit |
| Mo 04:16:01 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 04:30:34 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 04:45:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 04:59:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 05:13:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 05:27:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 05:41:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 05:55:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 06:09:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 06:23:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |
| Mo 06:37:00 | zane_redet | sprache | redet-frage | nein | Ruhezeit |

Je Quelle: alarm 1, auftraege 1, briefing 1, calendar 2, fahr_whatsapp 1, mail_nacht 1, mailwatch 1, proaktiv 1, zane_redet 14.

### 2.8 Ausgelöste Vorgänge gegenüber tatsächlichen Ausgaben

- So 21:00:05 jarvis stößt „start-ansage“ an (app-start) → bis zum Ende des Messlaufs keine zugehörige Ausgabe
- Mo 03:30:00 schicht stößt „schicht-briefing“ an (timer) → Mo 03:30:00 briefing (tagesbriefing, folge, sprache), nach 0 s

Gezählte Nutzer-Ausgaben des Tagesbriefings: 1; tatsächlich gesprochene Briefings (Textanfang „Guten Tag/Morgen, <Name>. Es ist …“): 1.

## 3. zane_redet (nur gemessen)

### 3.1 zane_redet im Lauf „Nachmittag (Mi 28.10.2026, 12:00 bis 15:10)“

- Meldungen: **14**.
- Abstände zwischen zwei Meldungen: kleinster 14 min, Median 14 min, größter 15 min.
- Verschiedene Texte: 1; Texte, die mehr als einmal kamen: 1 („Dino, was liegt heute noch an?“ 14×).
- Fragen darunter: 14. Das Modul fordert nach der Frage selbst zum Zuhören auf (startListening als Rückruf): 14. Tatsächlicher Aufruf von startListening innerhalb von 5 s nach Ende der Sprachausgabe: 14.
- Verteilung nach Uhrzeit (Stunde: Anzahl): 12: 4, 13: 5, 14: 4, 15: 1.

| Uhrzeit | Abstand zur vorigen | Frage | Mikrofon-Aufruf durch Modul | Text |
|---|---|---|---|---|
| 12:02:01 | - | ja | ja | Dino, was liegt heute noch an? |
| 12:16:40 | 15 min | ja | ja | Dino, was liegt heute noch an? |
| 12:31:04 | 14 min | ja | ja | Dino, was liegt heute noch an? |
| 12:46:00 | 15 min | ja | ja | Dino, was liegt heute noch an? |
| 13:00:00 | 14 min | ja | ja | Dino, was liegt heute noch an? |
| 13:14:01 | 14 min | ja | ja | Dino, was liegt heute noch an? |
| 13:28:40 | 15 min | ja | ja | Dino, was liegt heute noch an? |
| 13:43:01 | 14 min | ja | ja | Dino, was liegt heute noch an? |
| 13:58:00 | 15 min | ja | ja | Dino, was liegt heute noch an? |
| 14:12:00 | 14 min | ja | ja | Dino, was liegt heute noch an? |
| 14:26:00 | 14 min | ja | ja | Dino, was liegt heute noch an? |
| 14:40:00 | 14 min | ja | ja | Dino, was liegt heute noch an? |
| 14:54:00 | 14 min | ja | ja | Dino, was liegt heute noch an? |
| 15:08:00 | 14 min | ja | ja | Dino, was liegt heute noch an? |

### 3.2 zane_redet im Lauf „Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00)“

- Meldungen: **18**.
- Abstände zwischen zwei Meldungen: kleinster 14 min, Median 14 min, größter 5 h 47 min.
- Verschiedene Texte: 1; Texte, die mehr als einmal kamen: 1 („Na, Dino? Wie läuft dein Abend bisher?“ 18×).
- Fragen darunter: 18. Das Modul fordert nach der Frage selbst zum Zuhören auf (startListening als Rückruf): 18. Tatsächlicher Aufruf von startListening innerhalb von 5 s nach Ende der Sprachausgabe: 18.
- Verteilung nach Uhrzeit (Stunde: Anzahl): 3: 2, 4: 5, 5: 4, 6: 3, 21: 4.

| Uhrzeit | Abstand zur vorigen | Frage | Mikrofon-Aufruf durch Modul | Text |
|---|---|---|---|---|
| So 21:02:01 | - | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| So 21:16:40 | 15 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| So 21:31:04 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| So 21:46:00 | 15 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 03:33:00 | 5 h 47 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 03:47:04 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 04:01:34 | 15 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 04:16:01 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 04:30:34 | 15 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 04:45:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 04:59:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 05:13:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 05:27:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 05:41:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 05:55:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 06:09:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 06:23:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |
| Mo 06:37:00 | 14 min | ja | ja | Na, Dino? Wie läuft dein Abend bisher? |

## 4. Anhang: alle Einträge

### 4.1 Alle Einträge in zeitlicher Reihenfolge („Nachmittag (Mi 28.10.2026, 12:00 bis 15:10)“)

| Nr | Uhrzeit | Quelle | Status | Kanal | Grund | Auslöser | Frage | Mikro | Bezug | Text (80 Zeichen) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 12:00:01 | alarm | ausgegeben | fenster | briefing-karte | push |  |  | tag: 2026-10-28 (tag) | Briefing. Guten Tag, Dino. Heute hast du Spätschicht. |
| 2 | 12:00:01 | autoansicht | ausgegeben | fenster+sprache | autoansicht-einsteigen | apk |  |  |  | Autoansicht ist an. |
| 3 | 12:00:03 | schlaf_antwort | ausgegeben | sprache+fenster | app-meldung | apk |  |  |  | Ich habe Mama auf ihre WhatsApp geantwortet. |
| 4 | 12:00:03 | jarvis | ausgeloest | - | start-ansage | app-start |  |  | tag: 2026-10-28 (tag) | Systeme online. Guten Tag, Sir. Heute Spätschicht. 2 Termine heute, der nächste  |
| 5 | 12:00:07 | parkplatz_auto | ausgegeben | sprache | parkplatz-gemerkt | apk |  |  |  | Ich habe mir gemerkt, wo du geparkt hast: Koordinaten 53.58000, 10.12000. |
| 6 | 12:00:09 | pakete | ausgegeben | hinweis+sprache | paket-zugestellt | app-start |  | bedingt | paket: 123456789012 (id) | Das Paket von Amazon ist zugestellt, heute um 10:50 Uhr. |
| 7 | 12:00:25 | kennenlernen | ausgegeben | sprache | kennenlern-frage | timer | ja | ja | frage: k21 (id) | Hast du Haustiere, oder hättest du gern welche? |
| 8 | 12:00:40 | orte | ausgegeben | karte+sprache | standort-frage | timer | ja |  |  | Ich kann dich im Supermarkt an deine Einkaufsliste erinnern. Dafür braucht die A |
| 9 | 12:00:45 | preissuche | ausgegeben | sprache | preis-treffer | timer |  | bedingt | produkt: Sony Kopfhörer (id) | Preis-Treffer. Sony Kopfhörer kostet jetzt 239,00 Euro bei Otto (Sony WH-1000XM4 |
| 10 | 12:02:01 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 11 | 12:03:00 | jarvis | ausgegeben | sprache | start-ansage | manuell |  |  | tag: 2026-10-28 (tag) | Systeme online. Guten Tag, Sir. Heute Spätschicht. 2 Termine heute, der nächste  |
| 12 | 12:05:00 | routinen | ausgegeben | karte+sprache | routine-vorschlag | timer | ja | bedingt | routine: einkauf@14 (id) | Mir ist etwas aufgefallen: Du schaust auf die Einkaufsliste mittwochs gegen 13 U |
| 13 | 12:10:00 | fahr_whatsapp | ausgegeben | fenster+sprache | whatsapp-vorlesen | apk | ja | bedingt | nachricht: wa_1793185800000 (id) | Nachricht von Julia: Kannst du Milch mitbringen?. Willst du antworten? |
| 14 | 12:16:40 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 15 | 12:20:44 | konto | ausgegeben | sprache | bank-mail | timer |  | bedingt | mail: bank_1 (id) | Auf deinem Konto ist ein Eingang von 120 Euro. Betreff: Kontobewegung: Gutschrif |
| 16 | 12:21:25 | mailwatch | ausgegeben | sprache | wichtige-mail | timer | ja | bedingt | mail: bank_1 (id) | Du hast eine E-Mail von Sparkasse Lüneburg. Betreff: Kontobewegung: Gutschrift 1 |
| 17 | 12:31:04 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 18 | 12:35:00 | smarttips | ausgegeben | sprache | mitnehmen-tipp | timer |  |  | termin: gcal_schwimmen_0816 (id) | In Kürze steht "Schwimmen Hallenbad" an. Übrigens: Denk an Badesachen und ein Ha |
| 19 | 12:36:25 | mailwatch | ausgegeben | sprache | wichtige-mail | timer | ja | bedingt | mail: mw_1 (id) | Du hast eine E-Mail von Frau Becker. Betreff: Elternabend: bitte um Rückmeldung. |
| 20 | 12:40:45 | fristen | ausgegeben | karte+sprache | frist-gefunden | timer |  | bedingt | mail: fr_1 (id) | Achtung, in einer E-Mail von Stadtwerke Schwarzenbek geht es um eine Mahnung: Di |
| 21 | 12:45:00 | schicht | ausgeloest | - | schicht-briefing | timer |  |  | tag: 2026-10-28 (tag) |  |
| 22 | 12:45:00 | briefing | ausgegeben | sprache | tagesbriefing | folge |  |  | tag: 2026-10-28 (tag) | Guten Tag, Dino. Es ist 12 Uhr 45. Heute hast du Spätschicht, Abfahrt um 13 Uhr. |
| 23 | 12:46:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 24 | 12:50:30 | proaktiv | ausgegeben | karte | termin-vorwarnung | timer |  |  | termin: gcal_schwimmen_0816 (id) | In einer Stunde hast du: Schwimmen Hallenbad. |
| 25 | 12:50:45 | fristen | ausgegeben | karte+sprache | frist-erinnerung | timer |  | bedingt | frist: frist_fr (id) | Erinnerung: Stadtwerke-Rechnung über 89,90 Euro ist übermorgen fällig |
| 26 | 13:00:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 27 | 13:00:03 | plan_ansagen | ausgegeben | sprache+fenster | aufbruchszeit | plan |  |  | tag: 2026-10-28 (tag) | Es ist Zeit zum Losfahren. Die Fahrt dauert rund 30 Minuten, deine Spätschicht b |
| 28 | 13:00:30 | mail_nacht | ausgegeben | karte+sprache | mail-entwuerfe | timer |  |  |  | Ich habe einen Antwort-Entwurf für dich vorbereitet: an Frau Becker zu „Elternab |
| 29 | 13:10:00 | auftraege | ausgegeben | sprache | auftrag-erfuellt | push |  |  | auftrag: auftrag_diesel (id) | Diesel ist jetzt unter 1,65 Euro. Die günstigste Tankstelle ist Aral in Schwarze |
| 30 | 13:14:01 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 31 | 13:28:40 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 32 | 13:30:25 | vorbereitung | ausgegeben | karte+sprache | termin-vorbereitet | timer |  |  | termin: gcal_arzt_0815 (id) | Ich habe mir erlaubt, deinen Termin Arzt Hamburg um 15:00 Uhr vorzubereiten. Ham |
| 33 | 13:35:25 | wachter | ausgegeben | sprache | termin-gleich | timer |  |  | termin: gcal_schwimmen_0816 (id) | Dino, in 15 Minuten wartet „Schwimmen Hallenbad“. Nur zur Erinnerung. |
| 34 | 13:43:01 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 35 | 13:58:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 36 | 14:00:30 | proaktiv | ausgegeben | karte | erinnerung-vorwarnung | timer |  |  | erinnerung: 1793185200000 (id) | In 30 Minuten: Unterlagen für den Arzt. |
| 37 | 14:08:25 | wachter | ausgegeben | sprache | abfahrt | timer |  |  | termin: gcal_arzt_0815 (id) | Dino, es wird Zeit: Du solltest jetzt zu „Arzt Hamburg“ losfahren. Die Fahrt dau |
| 38 | 14:12:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 39 | 14:15:00 | travel | ausgegeben | sprache | abfahrt | timer |  |  | termin: gcal_arzt_0815 (id) | Du solltest jetzt losfahren, sonst schaffst du es nicht rechtzeitig zu Arzt Hamb |
| 40 | 14:26:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 41 | 14:30:01 | calendar | ausgegeben | sprache | erinnerung | timer |  |  | erinnerung: 1793185200000 (id) | Zur Erinnerung: Unterlagen für den Arzt |
| 42 | 14:30:25 | kennenlernen | ausgegeben | sprache | kennenlern-frage | timer | ja | ja | frage: k21 (id) | Hast du Haustiere, oder hättest du gern welche? |
| 43 | 14:35:00 | routinen | ausgegeben | karte+sprache | routine-hinweis | timer |  |  | routine: wetter@15 (id) | Kleine Erinnerung: Um diese Zeit fragst du sonst nach dem Wetter. |
| 44 | 14:40:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 45 | 14:40:00 | alarm | ausgegeben | fenster+sprache | warnung | push |  |  |  | Glatteis. Glättegefahr auf deiner Strecke. Plan mehr Zeit ein. |
| 46 | 14:45:01 | zuvorkommend | ausgegeben | karte+sprache | geburtstag-vorfrage | plan |  |  | geburtstag: 2026-11-01/Geburtstag Oma Ute (text+zeit) | In 4 Tagen ist Geburtstag Oma Ute. Hast du schon ein Geschenk? Soll ich dich eri |
| 47 | 14:50:01 | orte | ausgegeben | karte+sprache | einkaufsliste-markt | apk |  |  | markt: REWE Schwarzenbek (id) | Du bist bei REWE Schwarzenbek. Auf deiner Einkaufsliste stehen: Milch, Brot und  |
| 48 | 14:54:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |
| 49 | 15:08:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Dino, was liegt heute noch an? |

Sprachausgaben ohne zugehörigen Eintrag (Antworten auf Sätze des Nutzers, Dialog-Folgen, andere Module): 1

| Uhrzeit | Text (60 Zeichen) |
|---|---|
| 12:37:01 | Gut, ich lasse sie ungelesen. |

### 4.2 Alle Einträge in zeitlicher Reihenfolge („Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00)“)

| Nr | Uhrzeit | Quelle | Status | Kanal | Grund | Auslöser | Frage | Mikro | Bezug | Text (80 Zeichen) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | So 21:00:01 | autoansicht | ausgegeben | fenster+sprache | autoansicht-einsteigen | apk |  |  |  | Autoansicht ist an. |
| 2 | So 21:00:03 | schlaf_antwort | ausgegeben | sprache+fenster | app-meldung | apk |  |  |  | Ich habe Mama auf ihre WhatsApp geantwortet. |
| 3 | So 21:00:05 | jarvis | ausgeloest | - | start-ansage | app-start |  |  | tag: 2026-11-01 (tag) | Systeme online. Guten Abend, Sir. |
| 4 | So 21:00:19 | dirigent | ausgegeben | sprache+fenster+karte | tagesmeldung | app-start |  |  | tag: 2026-11-01 (tag) | Guten Tag, Dino. Hier ist deine Tagesmeldung. |
| 5 | So 21:00:40 | orte | ausgegeben | karte+sprache | standort-frage | timer | ja |  |  | Ich kann dich im Supermarkt an deine Einkaufsliste erinnern. Dafür braucht die A |
| 6 | So 21:02:01 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 7 | So 21:05:00 | jarvis | ausgegeben | sprache | start-ansage | manuell |  |  | tag: 2026-11-01 (tag) | Systeme online. Guten Abend, Sir. |
| 8 | So 21:16:40 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 9 | So 21:31:04 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 10 | So 21:46:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 11 | So 22:30:01 | calendar | ausgegeben | sprache | erinnerung | timer |  |  | erinnerung: 1793563200000 (id) | Zur Erinnerung: Mülltonnen rausstellen |
| 12 | So 23:00:00 | fahr_whatsapp | ausgegeben | fenster+sprache | whatsapp-vorlesen | apk | ja | bedingt | nachricht: wa_1793570400000 (id) | Nachricht von Julia: Kannst du Milch mitbringen?. Willst du antworten? |
| 13 | Mo 01:00:00 | auftraege | ausgegeben | sprache | auftrag-erfuellt | push |  |  | auftrag: auftrag_diesel (id) | Diesel ist jetzt unter 1,65 Euro. Die günstigste Tankstelle ist Aral in Schwarze |
| 14 | Mo 02:12:25 | mailwatch | ausgegeben | sprache | wichtige-mail | timer | ja | bedingt | mail: bank_2 (id) | Du hast eine E-Mail von Sparkasse Lüneburg. Betreff: Kontobewegung: Lastschrift  |
| 15 | Mo 02:30:15 | mail_nacht | ausgegeben | karte+sprache | mail-entwuerfe | timer |  |  |  | Ich habe einen Antwort-Entwurf für dich vorbereitet: an Herr Krüger zu „Angebot  |
| 16 | Mo 03:00:00 | alarm | ausgegeben | fenster+sprache | warnung | push |  |  |  | Glatteis. Glättegefahr auf deiner Strecke. Plan mehr Zeit ein. |
| 17 | Mo 03:30:00 | schicht | ausgeloest | - | schicht-briefing | timer |  |  | tag: 2026-11-02 (tag) |  |
| 18 | Mo 03:30:00 | briefing | ausgegeben | sprache | tagesbriefing | folge |  |  | tag: 2026-11-02 (tag) | Guten Morgen, Dino. Es ist 3 Uhr 30. Heute hast du Frühschicht, Abfahrt um 4 Uhr |
| 19 | Mo 03:33:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 20 | Mo 03:35:30 | proaktiv | ausgegeben | karte | erinnerung-vorwarnung | timer |  |  | erinnerung: 1793563201500 (id) | In 30 Minuten: Brotdose einpacken. |
| 21 | Mo 03:47:04 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 22 | Mo 04:01:34 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 23 | Mo 04:05:01 | calendar | ausgegeben | sprache | erinnerung | timer |  |  | erinnerung: 1793563201500 (id) | Zur Erinnerung: Brotdose einpacken |
| 24 | Mo 04:16:01 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 25 | Mo 04:30:34 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 26 | Mo 04:45:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 27 | Mo 04:59:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 28 | Mo 05:13:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 29 | Mo 05:27:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 30 | Mo 05:41:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 31 | Mo 05:55:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 32 | Mo 06:09:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 33 | Mo 06:23:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 34 | Mo 06:37:00 | zane_redet | ausgegeben | sprache | redet-frage | timer | ja | ja |  | Na, Dino? Wie läuft dein Abend bisher? |
| 35 | Mo 07:05:01 | tagesueberblick | ausgegeben | fenster | tagesueberblick-leer | app-rueckkehr |  |  | tag: 2026-11-02 (tag) | Tagesüberblick |
| 36 | Mo 09:00:25 | kennenlernen | ausgegeben | sprache | kennenlern-frage | timer | ja | ja | frage: k21 (id) | Hast du Haustiere, oder hättest du gern welche? |

Sprachausgaben ohne zugehörigen Eintrag (Antworten auf Sätze des Nutzers, Dialog-Folgen, andere Module): 0

