> **Historische Momentaufnahme aus Phase 0 des Umbaus zum denkenden Assistenten (main e47c52f, 04.11.2026).** Zahlen und Befehlsliste entsprechen diesem Zeitpunkt und sind nicht automatisch der aktuelle Repository-Stand. Aktueller Stand: `ARCHITEKTUR.md`.

# Phase 0: Fehlerstellen und Einstufung der Befehle

Stand: main e47c52f. Gemessen im Test-Gerüst (tests/umgebung.js, KI und Netz abgeschaltet), gelesen im echten Code. Die Test-Baseline steht in `tests/PHASE0_BASELINE.md`.

## A. Tatsächliche Fehlerstellen (Eingabe geht verloren oder falscher Erfolg)

| Nr | Stelle | Was passiert | Schwere | Behandelt in |
|---|---|---|---|---|
| F1 | js/actions.js, Ende von `executeAction` | Kein Abschluss-Zweig: Eine Aktion mit unbekanntem Typ tut nichts, wirft aber keinen Fehler. | hoch | Phase 1 (Prüfung in assistant.js, js/sicherheit.js) |
| F2 | js/assistant.js, Zählung `okCount++` | Die Aktion aus F1 zählt als geklappt. | hoch | Phase 1 |
| F3 | js/assistant.js, Standardsatz bei leerer KI-Antwort | "Zu deinen Diensten. Es ist erledigt." (je nach Laune Varianten), auch wenn nichts geschehen ist (leere Antwort, nur `chat`, keine Aktion). | hoch | Phase 1 |
| F4 | js/assistant.js, KI-Antwort ohne Text | Antwort nur aus Leerzeichen oder ein Objekt/Zahl statt Text wurde ungeprüft an `speak()` gegeben. | mittel | Phase 1 |
| F5 | js/assistant.js, `ai.reply` bei erfundener Aktion | Die KI behauptet Erfolg ("Hotel gebucht"), die Aktion existiert nicht. Der Text wurde gesprochen. | hoch | Phase 1 |
| F6 | festes Kommando gibt `true` zurück, spricht aber nicht | Die KI wird nicht mehr gefragt. In einer Stichprobe von 41 Sätzen im Test-Gerüst kam kein stummer Fall vor. Ein Beweis für stumme Befehle fehlt, ebenso ein Beweis dagegen. | unbekannt | NICHT in Phase 1 geändert: manche Befehle sind absichtlich still (Fenster zu, Anzeige, Lautstärke). Messung und Einzeleinstufung folgen. |
| F7 | js/assistant.js, Weltkugel-Pfad | Antwort wird nicht gesprochen, die Weltkugel liest selbst vor. Absichtlich still. | keine | unverändert |
| F8 | Ja/Nein-Sperre (`jvFrage`) | Läuft die jüngste Frage ab, wird ein nacktes "Ja" zur normalen KI-Eingabe ohne Bezug. Die KI sieht den Verlauf, ob sie es richtig deutet, ist offen. | mittel | später (Phase 2/3) |
| F9 | Fehler der KI-Schnittstelle (kein Netz, 429, 502, kaputtes JSON) | Eine von vier Standardfloskeln ("Sensoren blockiert" usw.). Sie nennt keinen Grund, ist aber nicht stumm. Test 8a bis 8c prüfen: genau eine Antwort. | niedrig | Text bleibt, Test neu (tests/sicherheit.js) |

## B. Einstufung der 94 Befehle der Kette (`jvCommands.list()`)

Grundlage: Name, Dateikopf (erste Zeilen der Datei) und Messungen. Nicht jede Regex wurde einzeln gelesen. Einstufung ist ein Vorschlag, noch keine Änderung.

**Hart (Systembefehle: eindeutig, deterministisch, ohne KI sinnvoll)**
karten-weg, schliessen, karte-zu, orte-karte, mail_nacht-karte, jvfenster, lageweg, lagebild, autoansicht, anzeige, vibration, wetterfx, kacheln, synapsen, tour, einfuehrung, satztest, push, mailpush, spotify, spotify-auto, plan_wecker, plan_ansagen, plan_frist, alarm, ansagen, langzeit_reset, urlaub, routinen, auftraege.

**Durchreicher und Aufbereiter (verschlucken nichts oder nur eigene Folgeantworten)**
festnamen, hoerkorrektur, kontext_lokal, rueckfrage, mehrfachfrage, mehrfach, ki-mitdenken (nur KI-Text), formulierungen (nur eigener Wunsch-Satz).

**Feste Auskünfte und Fachfunktionen (Satzmuster eng; eigene Daten oder Dienste; bleiben, aber mit Weiche prüfen)**
weltuhr, gedaechtnis_zeit, vollmond_auskunft, erweiterungen, ergebnisse, bundesliga, schicht_auskunft, schicht, was_steht_an, essensplan, pakete, lokalnews, fahrtcheck, vorbereitung, arbeitsweg-via, rechnungen, autocheck, konto, haushalt, postfach, mailaktionen, mailwatch, kuendigung, antrag, behoerdenbrief, rezepte, foto-erkennung, foto-person, fotosenden, urlaubsplan, teilen, adresse-speichern, fahr_whatsapp, termin-erinnern, mitnehmen, fristen, lageweg, orte, schlaf_antwort, preissuche (außer Geschenkideen), wunschliste, terminfinder, dirigent, langzeit, mehrfach.

**Weich (können normale Sprache, Beratung oder Smalltalk verschlucken; Kandidaten für "hinter die KI" in späteren Phasen)**
- `laune` ("Wie geht es dir heute?" gemessen: fester Spruch, KI nicht gefragt).
- Basis `localcommands.js` (gemessen: "Mir ist langweilig.", "Danke Jarvis.", "Das war gut.", "Erzähl einen Witz.", "Wer bist du?", "Was kannst du alles?" sind feste Antworten).
- `alleinstellung` (fester Text auf "Was kannst du besser als ...").
- `langzeit` ("Lass uns ein bisschen quatschen." gemessen: fester Satz "Gern. Worüber wollen wir plaudern?", danach zeigt der Zustand ins Leere, wenn die KI nicht übernimmt).
- `ausflug` ("Hast du eine Idee fürs Wochenende?" gemessen: startet fest den Ausflugs-Planer; für Beratung gut, für Smalltalk zu eng).
- `preissuche` Geschenkideen ("Such mir ein Geschenk für meine Frau." gemessen: feste Suche, dauert etwa eine Minute; der Satz "Ich weiß nicht, was ich meiner Frau schenken soll." geht dagegen zur KI).
- `zane_redet`, `zane_redet_antwort`, `kennenlernen`, `zuvorkommend`, `jarvis` (Ton, Start-Ansage): eigene Gesprächszustände, sie nehmen Antworten auf eigene Fragen an.
- `zane_redet` fing "Sei still." ab (gemessen). Das ist richtig und gewollt, ein Beispiel für einen guten harten Befehl innerhalb eines weichen Moduls.

Gemessen als freie KI-Weg-Sätze (also nicht verschluckt): "Was machst du gerade?", "Heute war ein anstrengender Tag.", "Was hältst du davon?", "Du nervst mich gerade.", "Ich bin müde.", "Ich hab Hunger.", "Mir ist kalt.", "Was soll ich heute kochen?", "Wo kann ich gut essen gehen?", "Ich brauche eine neue Jacke.", "Meine Frau ist im Weihnachtsfieber.", "Wie lange brauche ich dahin?", "Ruf dort an.", "Die zweite.", "Das meinte ich nicht.". Sie hängen vollständig an der KI und am Verlauf (16 Nachrichten).

Hinweis: "Stopp.", "Lauter." und "Öffne die Einstellungen." laufen nicht durch diese Kette (Stopp: Ende-Phrasen in voice.js; die anderen gehen im Test-Gerüst zur KI, in der App deckt sie `show_panel`/Sprachsteuerung ab). Das Beispiel "eindeutige lokale Befehle" des Auftrags stimmt also nur teilweise.

## C. Was Phase 1 bewusst NICHT tut

- Keine Änderung an den 94 Befehlen, keine Änderung an deren Reihenfolge.
- Kein Zeitgeber ("Wächter") über stille feste Befehle. Grund: F6 ist nicht belegt, und stille Befehle sind teils gewollt. Ein Wächter würde Fehlalarme und doppelte Antworten riskieren. Vorschlag für eine spätere Phase: erst messen (Liste aller Befehle, die `true` zurückgeben ohne `speak()`/Karte/Fenster), dann nur für echte Lücken.
- Kein Fehlerprotokoll auf der Platte (Phase 9). Es gibt nur eine Arbeitsspeicher-Liste der letzten 20 Vorfälle (Art und Aktionsname, nie der Satz).
