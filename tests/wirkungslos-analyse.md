# Phase 5C – Wirkungslose Funktionen (Analyse, kein Produktcode)

Stand: main = e930766. Messung: `node tests/wirkungslos.js` (98 Prüfungen, Soll in `wirkungslos_soll.json`).
Methode: echte `api/memory.js` mit nachgebautem Upstash, echte Skriptreihenfolge im Testbrowser, tote Varianten nur im Test hinter `assistant.js` eingehängt.
Grenze: Die Ähnlichkeitssuche ist im Test ein Stellvertreter (Stichwort-Treffer). Wie gut die echte Vektorsuche ist, lässt sich offline nicht messen.

## 1. searchSemanticMemory

| | heute (assistant.js:11) | tote Variante (langzeit.js:160) |
|---|---|---|
| Aufruf | ein `search`, topK 5 | `search` topK 8, bei Datumswörtern zusätzlich `listall` parallel |
| Filter | keiner | nur `metadata.typ === 'episode'` |
| Ausgabe | reine Texte | `Kategorie: Text (erzählt am …)`, Pläne zuerst als `GEPLANT am <Datum>: …`, Plan/Treffer-Dubletten entfernt |
| Fehler | `[]` | `[]` |
| Zeitlimit | Aufrufer wartet max. 1,5 s (assistant.js:117) | gleich; `listall` zählt mit |
| Aufrufer | assistant, dirigent (8 s, 3 Fragen), preissuche, proaktiv (4,5 s) | gleiche |

Warum tot: assistant.js (913) wird nach langzeit.js (909) geladen und überschreibt. Vorher (bis 13./14.10.2026) war es umgekehrt, die Langzeit-Variante war live.

### Messbefunde (12+ Fixtures, `suche` im Soll)
- Leer, API-Fehler (502, Netz weg), leere Antwort, langsame Antwort: kein Unterschied (`[]`, nach 1,5 s Abbruch).
- **Verschlechterung:** Merk-dir-Einträge (`gedaechtnis.js`, ohne `typ`), Fristen und automatisch gelernte Briefing-Fakten fallen durch den Filter `typ==='episode'`. „Wo liegt der Zweitschlüssel?“ findet heute den Eintrag, mit der Langzeit-Variante nicht.
- **Besser:** „Was steht diese Woche an?“ / „Was habe ich morgen vor?“: geplante Dinge stehen als `GEPLANT am …` vorn und sind vollständig (listall), statt nur in den 5 ähnlichsten Treffern zu hängen.
- **Nur anders:** Dubletten und lange Texte (Kategorie-Präfix, mehr Treffer), Umlaute/Sonderzeichen unverändert.
- **Kosten:** Ein zusätzlicher `listall` bei jedem Satz mit Wortanfang `morgen/heute/vor…/los…/termin…` (auch „Fahr gleich los“, „Lies mir etwas vor“, Wetter morgen). Ist `listall` langsam (2 s), geht innerhalb der 1,5 s alles verloren, auch die normalen Treffer.
- **Datenrisiko (heute schon live!):** `cleanupOnce()` in langzeit.js löscht einmalig pro Gerät (Marke `jv_langzeit_aufgeraeumt_v1`, nicht in Sync-Listen) alle Vektor-Einträge, deren `typ` weder `episode` noch `frist` ist. Neue Installation oder gelöschter Speicher = erneuter Lauf. Das betrifft Merk-dir-Einträge. Unverändert gelassen, nur dokumentiert.

## 2. Konkrete Beispiele
1. „Was steht diese Woche an?“ – **tatsächlich besser** (Plan vollständig, vorn).
2. „Was habe ich morgen vor?“ – **tatsächlich besser**, aber +1 Abfrage; bei langsamem `listall` schlechter als heute.
3. „Wo liegt der Zweitschlüssel?“ – **potenziell schlechter** (Merk-dir-Eintrag gefiltert).
4. „Wie wird morgen das Wetter?“ – **kein Nutzen**, nur Mehrkosten (`listall` unnötig).
5. „Was lese ich gern?“ (Dubletten) / „Was weißt du über Liam?“ – **nur anders** (Format, topK 8).
6. „Was muss ich kündigen?“ – **potenziell schlechter** (Frist-Eintrag gefiltert; Fristen laufen sonst über `jvFristHinweis`).

## 3. foto_stundenplan (Hülle um searchSemanticMemory, Zeile ~289)
- Zweck: Fragen zum Stundenplan („Was hat Isabel morgen in der dritten Stunde?“) holen per `listall` die Stundenplan-Einträge dazu.
- Tot, weil 856 < 913 (assistant.js überschreibt). Früher live.
- Messung mit konstruierten Störeinträgen: mit Hülle kommen die Stundenplan-Einträge sicher an; heute nur, wenn die Suche sie zufällig unter den Top 5 hat. Echte Vektorqualität nicht messbar.
- Doppelverhalten: Wäre sie mit der Langzeit-Suche zusammen aktiv, gäbe es zwei `listall`. Nur im Zusammenspiel entscheiden.
- Fachlich nicht veraltet, aber Teil derselben Suchentscheidung.

## 4. sendToGroqSmart heute
Aktiv: Basis assistant.js; Hüllen `synapsen` (merkt letzten Text) und `weathermap` („Karte schließen“). Tot: `festnamen` (835), `hoerkorrektur` (838) – beim Laden ist die Funktion noch nicht da (typeof-Prüfung falsch).
Textfluss (Quellenbefunde im Test, `textfluss`): Der Text geht unverändert in `chatHistory`, `jvLetzterText`, `executeAction(action, text, ctx)` und Merk-dir-Speicherung. Aufrufer ohne Korrektur: autoansicht, foto_brief, fristen, kennenlernen, kuendigung, langzeit, mehrfach, rueckfrage, localcommands.

## 5. Regeln
### festnamen (7 Regeln + „Hey Sein“)
Alicia/Alycia/Alisia/Alissa/Alyssia → Alyssa (+ „s“-Formen); Neu(-)Gar/Gal…ring → Neu-Galliner-Ring; Schwarzenbeck → Schwarzenbek; Schröter/Schroeter-Schreibung → **Schroeter**; Verbrüderungs Ring → Verbrüderungsring; Zain/Zayn/Zein/Zeyn/Sane/Zaine → Zane; Satzanfang „Hey/Hallo/Hi sein/sain/zehn/seyn/sehn“ → Zane.
Wortgrenzen sauber (Alissandro, Alicante bleiben). Befunde: **Schröter → Schroeter ändert einen echten Nachnamen** (Termin „mit Herrn Schröter“); „Neu Kalliner Ring“ wird nicht erkannt (Lücke); „Hallo zehn Minuten …“ würde zu „Hallo Zane Minuten“; Zein/Sane sind auch Wörter/Namen.
### hoerkorrektur
Fest `Hamlet → Hamiyet` plus lernbare Einträge (`jv_hoerkorrektur`, max. 60), Wortgrenzen, Groß/klein egal, mehrwortige nur nach Namens-Kontextwörtern. Befunde: **„Wer hat Hamlet geschrieben“ → „Hamiyet“ (verschlechtert)**; gelernt „Mal“ → „Malte“ (Schutzliste kennt „mal“ nicht): „Sag mal …“ → „Sag Malte …“; „Ende“ → „Enne“. Lernbefehl selbst und Löschen/Liste laufen schon heute über `jvCommands`.

## 6. Simulation 35 Eingaben (A heute / B +festnamen / C +hoerkorrektur / D beide)
Gesamt über B/C/D: 52 unverändert, 25 unverändert (lokaler Weg), 20 verbessert, 4 fragwürdig, 2 verschlechtert, 2 KI-Teilsatz geändert. Welt D allein: 13 / 8 / 10 verbessert / 2 fragwürdig / 1 verschlechtert / 1 Teilsatz.
Verbessert: Alicia/Alissa-Varianten, Neu-Galliner-Ring-Varianten, Schwarzenbeck, Zain/Zayn, Mehrfachfrage-Teil mit „Alicia“ (heute unkorrigiert, weil mehrfach vor festnamen läuft). Fragwürdig: Schröter. Verschlechtert: Hamlet. Einzelfälle siehe `eingaben` im Soll.

## 7. Doppelkorrektur
- `voice.js: fixKnownMishearings` korrigiert schon heute Alicia/Alissa/Alisha → Alyssa und Zain/Zayn/Zein/Zeyn/Sane/Jarvis/Jarwis/… → Zane sowie „Hallo sein“ → Zane (inkl. dem Fehler „Hallo zehn Minuten“).
- Der lokale Befehlsweg (`jvCommands` → `festnamen` Rang 10, `hoerkorrektur` 400) korrigiert heute für Sprachbefehle bereits (Probe `lokalerText`).
- Offen bleibt nur: Neu-Galliner-Ring, Schwarzenbeck, Schroeter, Verbrüderungsring und Hamiyet für **KI-Text** und für Mehrfachfrage-Teile. Das ist der echte Mehrwert; Alyssa/Zane wären doppelt.
- Orts-/Navigationslogik (`adress_normal.js`, `worldqueryfix`) normalisiert Adressen/Orte unabhängig und fängt den Neu-Galliner-Ring teils selbst.

## 8. Sichtbarer Text vs. KI-/Aktionstext
Würde eine Korrektur vor `sendToGroqSmart` laufen, landet der korrigierte Text in: Chatverlauf (sichtbar), KI-Anfrage, `jvLetzterText`, `executeAction`-Kontext, Merk-dir-Speicher (`gedaechtnis`, `said`), Kalender-/Erinnerungstexten. Eine stille Umschreibung (Schröter → Schroeter) würde damit **gespeicherte Nutzerdaten verändern** – STOPP-Regel Punkt „Nutzerdaten“.

## 9. Zielarchitektur (nicht umgesetzt)
Eigene, benannte Vorverarbeitung `jvEingabe` (Kette wie `jvChain`) mit Normalisierern: `namen` (nur Alyssa/Zane-frei, weil voice.js das schon tut: Neu-Galliner-Ring, Schwarzenbek, Verbrüderungsring), `gelernt` (hoerkorrektur). Regeln: (1) nur **KI-Kopie** korrigieren, Chatverlauf/Aktionen/Speicher bekommen den Originaltext; (2) Reihenfolge: voice → jvCommands → Eingabekette → sendToGroqSmart; (3) je Eintrag Fehlerisolation; (4) kein Schröter-Eintrag, Hamlet-Festeintrag raus, Schutzliste um „mal/ende/…“ erweitern; (5) ladeunabhängig, weil Aufruf im Kern statt Hülle; (6) einzeln testbar.

## 10. Entscheidungsmatrix
| Kandidat | Empfehlung | Nutzen | Risiko | Aufwand | Begründung |
|---|---|---|---|---|---|
| searchSemanticMemory | **ÜBERARBEITEN DANN AKTIVIEREN** | Wochen-/Tagesplanung vollständiger | Filter verliert Merk-dir/Fristen; listall-Kosten und Zeitlimit; cleanupOnce löscht Nicht-Episoden | mittel | Filter weg, listall nur bei echten Datumsfragen, cleanupOnce vorher entschärfen |
| foto_stundenplan | **ÜBERARBEITEN DANN AKTIVIEREN** (zusammen mit der Suche) | sicherer Stundenplan-Abruf | Doppel-listall | klein | nur im Rahmen einer Such-Pipeline |
| festnamen | **ÜBERARBEITEN DANN AKTIVIEREN** | Neu-Galliner-Ring, Schwarzenbek, Verbrüderungsring für KI-Text | Schröter-Regel ändert echten Namen; Doppelkorrektur Alyssa/Zane | klein | Regeln kürzen, nur KI-Kopie |
| hoerkorrektur | **LIEGEN LASSEN** (Hamlet-Festeintrag entfernen) | gelernte Korrekturen für KI-Text | Hamlet falsch, „Mal/Ende“ falsch, Nutzerdaten | mittel | Lokaler Weg nutzt sie bereits; für KI zu riskant ohne Schutz |

## 11. Empfehlung Phase 5D
1. Zuerst `cleanupOnce` entschärfen (Merk-dir-Einträge schützen) – eigene kleine Änderung, Nutzerentscheidung nötig.
2. Danach Suche überarbeiten (Filter weg, `listall` nur bei Datumsfragen, Stundenplan einbauen) und erst dann aktivieren.
3. festnamen als KI-Kopie-Normalisierer mit gekürzten Regeln.
4. hoerkorrektur und den Hamlet-Eintrag nicht für die KI aktivieren.
