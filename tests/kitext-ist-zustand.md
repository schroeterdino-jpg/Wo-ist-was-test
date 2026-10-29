# KI-Text (Phase 5D.2): Ist-Zustand und Messung

Netz: `node tests/kitext.js` (Soll `tests/kitext_soll.json`, Vorher-Zustand `tests/kitext_vorher.json`, gemessen auf dem Code VOR dem Umbau, main = 036f318).

## Grundregel
Der **Originaltext** bleibt überall original: Chat-Verlauf, `jvLetzterText`, Aktionen, „Merk dir“, Kalender, Erinnerungen. Nur die **KI-Kopie** wird unmittelbar vor der Anfrage an die KI durch die Kette `jvKiText` normalisiert.

## Vorher (Phase 5C/5D.1)
- `festnamen.js` und `hoerkorrektur.js` hängten je eine Hülle um `sendToGroqSmart`. Beide wurden von `assistant.js` (lädt später) überschrieben: **tot**. Die KI bekam den unkorrigierten Text. Wären sie aktiv gewesen, hätten sie die korrigierte Fassung in Chat-Verlauf, `jvLetzterText`, Aktionen und Merk-dir getragen (Gegenprobe A/C/D/E).
- Beispiele vorher: „Fahr zum Neu Galina Ring“ → KI bekam „Neu Galina Ring“; „Wie viele Einwohner hat Schwarzenbeck“ unverändert.

## Nachher
- Originaltext → lokale Verarbeitung / Speicherung: unverändert (alle 48 Eingaben identisch zum Vorher-Zustand in Weg, Chat-Verlauf, `jvLetzterText`, Aktionen, Gedächtnis, Kalender, Erinnerungen).
- Originaltext → KI-Kopie → KI-Normalisierung → KI: Kette `jvKiText`, Eintrag `festnamen` (Rang 100). Rang 200 reserviert, leer.

## Bewusst nicht übernommen
| Regel | Grund |
|---|---|
| Schröter → Schroeter (KI) | echter Nachname; nur lokale Wege/Speichern (wie bisher) |
| „Hey Sein/sain/zehn/sehn“ → Zane | `voice.js` macht es beim Sprechen; „Hallo zehn Euro“ wäre Fehlkorrektur |
| Zein, Sane → Zane | echte Wörter (Protein, englisch) |
| Hamlet → Hamiyet | Sachfragen („Wer hat Hamlet geschrieben?“) würden zerstört |
| gelernte Hörkorrekturen (Mal → Malte, Ende → Enne) | „Sag mal, …“ / „Am Ende …“ würden zerstört |

## Hörkorrektur später: Entscheidungskriterien (nichts davon gebaut)
Satzkontext (Sachfrage über ein Werk oder persönlicher Satz), Kontaktbezug (Name steht im Adressbuch/Gedächtnis), Befehlsart (anrufen, schreiben, Termin mit …), klare Gegenwörter („geschrieben“, „Shakespeare“, „Stück“). Mehrdeutig = keine automatische Korrektur. Gelernte Wörter bräuchten Wortgrenzen, Kontext, Häufigkeit, Bestätigung und Ablaufzeit. Die Zukunftsfälle stehen schon im Test (`hamletZukunft`) und sind durch eine pauschale Ersetzung nicht grün zu machen. Platz: `jvChain.use('jvKiText', 'hoerkorrektur', …, 200)` (läuft vor den Festnamen, bekommt den Originaltext).

## Geänderte Soll-Werte in bestehenden Suiten (begründet)
- `globale`: „sonder: festnamen.js + hoerkorrektur.js NACH assistant.js (sendToGroqSmart)“ war „verändert“ (Reihenfolge-abhängig), ist jetzt „identisch“: die Korrektur hängt nicht mehr an der Ladereihenfolge. Genau diese eine Stelle.
- `wirkungslos`: die Vier-Welten-Messung bildete den toten Wrapper nach. Der Kern bekommt weiter das Original (die Kopie entsteht darin); die Befunde „korrigierte Fassung landet im Verlauf/Merk-dir“ und „Verbesserungen UND Verschlechterungen je nach Ladereihenfolge“ sind durch das Gegenteil ersetzt (Original bleibt, alle Welten gleich). Soll neu geschrieben.
- `landkarte`: 460 → 461 Prüfungen (neue Testdatei).

## Testmatrix (48 Eingaben)
| Kategorie | Eingabe | Chat-Verlauf (Original) | Nachricht an die KI | Urteil |
|---|---|---|---|---|
| Unterhaltung | Hallo Jarvis wie geht es dir | (lokal, nicht im KI-Verlauf) | (keine) | unverändert |
| Unterhaltung | Erzähl mir einen Witz | (lokal, nicht im KI-Verlauf) | (keine) | unverändert |
| Unterhaltung | Sag mal, wie wird das Wetter? | Sag mal, wie wird das Wetter? | Sag mal, wie wird das Wetter? / {"heute":"Mittwoch, 2026-10-28","uhrzeit":"10:00","zeitpunkt":"Morgen","schicht":[{"wann":"heute","tag":"Mittwoch 2026-10-28","schicht":"keine (frei oder Urlaub)"},{"wann":"morgen","tag":"Donnerstag 2026-10-29","schicht":"keine (frei oder Urlaub)"},{"wann":"übermorgen","tag":"Freitag 2026-10-30","schicht":"keine (frei oder Urlaub)"},{"wann":"Samstag","tag":"Samstag 2026-10-31","schicht":"keine (frei oder Urlaub)"}],"termine":[],"erinnerungen":[],"einkaufsliste":[],"aufgaben":[],"geburtstage":[],"wunschlisten":[],"tage_bis_heiligabend":57,"urlaub":[],"langzeitgedaechtnis":[],"offene_rechnungen":[],"feiertage":[{"name":"Reformationstag","in_tagen":3}],"gemerkte_dinge":[]} | bewusst nicht korrigiert |
| Unterhaltung | Am Ende der Straße gibt es einen Laden | Am Ende der Straße gibt es einen Laden | Am Ende der Straße gibt es einen Laden | bewusst nicht korrigiert |
| Unterhaltung | Hallo zehn Minuten Pause bitte | Hallo Zane Minuten Pause bitte | Hallo Zane Minuten Pause bitte | bewusst nicht korrigiert |
| Festnamen | Zain erzähl mir etwas über Segelschiffe | Zane erzähl mir etwas über Segelschiffe | Zane erzähl mir etwas über Segelschiffe | unverändert |
| Festnamen | Zaine was gibt es Neues | Zaine was gibt es Neues | Zane was gibt es Neues | verbessert |
| Festnamen | Ein Zaino Kaffee bitte | Ein Zaino Kaffee bitte | Ein Zaino Kaffee bitte | unverändert |
| Festnamen | Sanierung am Haus planen | Sanierung am Haus planen | Sanierung am Haus planen | unverändert |
| Personen | Ruf Alicia an | Ruf Alyssa an | Ruf Alyssa an | unverändert |
| Personen | Schreib Alycia eine Nachricht | Schreib Alycia eine Nachricht | Schreib Alyssa eine Nachricht | verbessert |
| Personen | Erzähl mir etwas über Alicias Schule | Erzähl mir etwas über Alicias Schule | Erzähl mir etwas über Alyssas Schule | verbessert |
| Personen | Wann hat Alissa Geburtstag | Wann hat Alyssa Geburtstag | Wann hat Alyssa Geburtstag | unverändert |
| Personen | Ist Herr Schröter heute da | Ist Herr Schröter heute da | Ist Herr Schröter heute da | bewusst nicht korrigiert |
| Personen | Erzähl mir etwas über Herrn Schröter von der Bank | Erzähl mir etwas über Herrn Schröter von der Bank | Erzähl mir etwas über Herrn Schröter von der Bank | bewusst nicht korrigiert |
| Hamiyet/Hamlet | Wer hat Hamlet geschrieben | Wer hat Hamlet geschrieben | Wer hat Hamlet geschrieben | bewusst nicht korrigiert |
| Hamiyet/Hamlet | Worum geht es in Hamlet | Worum geht es in Hamlet | Worum geht es in Hamlet | bewusst nicht korrigiert |
| Hamiyet/Hamlet | Wann hat Hamlet Feierabend | Wann hat Hamlet Feierabend | Wann hat Hamlet Feierabend | bewusst nicht korrigiert |
| Hamiyet/Hamlet | Hamlet kommt morgen zu Besuch | Hamlet kommt morgen zu Besuch | Hamlet kommt morgen zu Besuch | bewusst nicht korrigiert |
| Orte | Erzähl mir etwas über den Neu Galina Ring | Erzähl mir etwas über den Neu Galina Ring | Erzähl mir etwas über den Neu-Galliner-Ring | verbessert |
| Orte | Wo ist der Neu Galliner Ring | Wo ist der Neu Galliner Ring | Wo ist der Neu-Galliner-Ring | verbessert |
| Orte | Neu Gallin Ring ist weit weg | Neu Gallin Ring ist weit weg | Neu-Galliner-Ring ist weit weg | verbessert |
| Orte | Erzähl mir etwas über den Neu-Galliner-Ring | Erzähl mir etwas über den Neu-Galliner-Ring | Erzähl mir etwas über den Neu-Galliner-Ring | unverändert |
| Orte | Wie viele Einwohner hat Schwarzenbeck | Wie viele Einwohner hat Schwarzenbeck | Wie viele Einwohner hat Schwarzenbek | verbessert |
| Orte | Erzähl mir etwas über den Verbrüderungs Ring | Erzähl mir etwas über den Verbrüderungs Ring | Erzähl mir etwas über den Verbrüderungsring | verbessert |
| Orte | Ist Schwarzenbek schön | Ist Schwarzenbek schön | Ist Schwarzenbek schön | unverändert |
| Orte | Neu Kalliner Ring | Neu Kalliner Ring | Neu Kalliner Ring | bewusst nicht korrigiert |
| Navigation | Fahr zum Neu Galina Ring | Fahr zum Neu Galina Ring | Fahr zum Neu-Galliner-Ring | verbessert |
| Navigation | Navigier mich nach Schwarzenbeck bei Hamburg | Navigier mich nach Schwarzenbeck bei Hamburg | Navigier mich nach Schwarzenbek bei Hamburg | verbessert |
| Navigation | Wie lange brauche ich zur Arbeit | Wie lange brauche ich zur Arbeit | Wie lange brauche ich zur Arbeit | unverändert |
| Wetter | Wird es in Schwarzenbeck morgen regnen | Wird es in Schwarzenbeck morgen regnen | Wird es in Schwarzenbek morgen regnen | verbessert |
| Wetter | Brauche ich heute einen Schirm | Brauche ich heute einen Schirm | Brauche ich heute einen Schirm | unverändert |
| Kalender | Trag morgen um zehn Uhr einen Termin ein | Trag morgen um zehn Uhr einen Termin ein | Trag morgen um zehn Uhr einen Termin ein | unverändert |
| Kalender | Termin mit Alicia am Freitag um 15 Uhr | Termin mit Alyssa am Freitag um 15 Uhr | Termin mit Alyssa am Freitag um 15 Uhr | unverändert |
| Kalender | Termin mit Herrn Schröter am Montag | Termin mit Herrn Schröter am Montag | Termin mit Herrn Schröter am Montag | bewusst nicht korrigiert |
| Erinnerungen | Erinner mich morgen an den Arzt | Erinner mich morgen an den Arzt | Erinner mich morgen an den Arzt | unverändert |
| Erinnerungen | Erinner mich an den Anruf bei Alicia | Erinner mich an den Anruf bei Alyssa | Erinner mich an den Anruf bei Alyssa | unverändert |
| Memory | Merk dir dass Alicia am Samstag kommt | Merk dir dass Alyssa am Samstag kommt | Merk dir dass Alyssa am Samstag kommt | unverändert |
| Memory | Merk dir mein Nachname ist Schröter | Merk dir mein Nachname ist Schröter | Merk dir mein Nachname ist Schröter | bewusst nicht korrigiert |
| Memory | Das Auto steht am Neu Galina Ring merk dir das | Das Auto steht am Neu Galina Ring merk dir das | Das Auto steht am Neu-Galliner-Ring merk dir das | verbessert |
| Memory | Was weißt du über mich | Was weißt du über mich | Was weißt du über mich | unverändert |
| Schicht | Wann habe ich nächste Woche Frühschicht | Wann habe ich nächste Woche Frühschicht | Wann habe ich nächste Woche Frühschicht | unverändert |
| Schicht | Habe ich am Wochenende Spätschicht | (lokal, nicht im KI-Verlauf) | (keine) | unverändert |
| Foto | Stundenplan von Alycia fotografieren | (lokal, nicht im KI-Verlauf) | (keine) | unverändert |
| Foto | Mach ein Foto vom Brief an Schröter | (lokal, nicht im KI-Verlauf) | (keine) | bewusst nicht korrigiert |
| Mehrfachfragen | Wie wird das Wetter in Schwarzenbeck und ruf Alicia an | ruf Alyssa an | ruf Alyssa an | unverändert |
| Mehrfachfragen | Was habe ich heute vor und wie kalt ist es in Schwarzenbeck | Wie kalt ist es in Schwarzenbeck? | Wie kalt ist es in Schwarzenbek? | verbessert |
| Mehrfachfragen | Fahr zum Neu Galina Ring und wie wird das Wetter | Fahr zum Neu Galina Ring und wie wird das Wetter | Fahr zum Neu-Galliner-Ring und wie wird das Wetter | verbessert |
