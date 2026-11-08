# Hinweise für Claude

Vor jeder Arbeit an dieser App zuerst `ARCHITEKTUR.md` lesen: Überblick über Web-App, Server (`api/`), Weckruf-APK (`weckruf-src/`), Datenabgleich und Stolperfallen.

Wichtig:
- Der Assistent heißt **Jarvis** (nach außen). Intern heißt er noch "Zane" (Befehle, Schlüssel); Schlüssel mit `nova_` und `jv_` nicht umbenennen, sonst gehen Einstellungen verloren.
- Änderungen immer als Branch plus Pull Request, nie als ZIP. Der Nutzer mergt am Handy.
- Bei jedem Umbau sagen, welche Dateien gelöscht werden sollen. Optische Änderungen erst als Bild zeigen.
- Neue Skripte in `index.html` einhängen (ohne `?v=`), danach `node tools/stempel.js` ausführen: es setzt den Cache-Stempel jeder eigenen Datei automatisch aus ihrem Inhalt. Die Tests schlagen fehl, wenn ein Stempel fehlt oder veraltet ist. Nie von Hand ändern.
- Vercel Hobby: höchstens 12 Functions in `api/` (11 belegt). Neues in bestehende Dateien einbauen.
- Änderungen unter `weckruf-src/` lösen einen neuen APK-Bau aus; der Nutzer muss die neue APK installieren.
- Der Nutzer arbeitet am Handy, Antworten auf Deutsch, kurz und ohne Fachjargon.
- Neue Funktion für den Nutzer: auch einen Schritt in `js/anleitung.js` (geführte Tour) und ein Beispiel in `js/help.js` ergänzen, sonst fehlt sie in der Tour.

## Masterplan (verbindlich)
Vor Entwicklungsaufgaben:
1. `JARVIS_MASTERPLAN.md` lesen bzw. die relevanten Abschnitte berücksichtigen.
2. Aktuelle Prioritäten und offene Aufgaben beachten.
3. Bestehende Architektur und Funktionen schützen.
4. Nur die tatsächlich relevanten Dateien untersuchen.

Nach abgeschlossenen Änderungen:
1. Betroffene Roadmap-Einträge aktualisieren.
2. Status und PR-Nummer ergänzen.
3. Neue wichtige Entscheidungen oder offene Probleme dokumentieren.
4. Unbeteiligte Einträge unverändert lassen.

## Pflicht vor jedem PR-Abschluss: rote A/E-Prüfungen verhindern
- Nach jeder Änderung an `js/*.js` oder `index.html` IMMER `node tools/stempel.js` ausführen.
- Nach Änderungen, die Inventarwerte beeinflussen, IMMER `node tests/inventar8a.js --schreiben` ausführen. Reihenfolge: zuerst Stempel, dann Golden Master.
- Beide generierten Dateien `index.html` und `tests/inventar8a_soll.json` im PR mit committen; anschließend `node tools/stempel.js --pruefen` und `node tests/inventar8a.js` prüfen.
- `.github/workflows/pr-vorbereitung.yml` erledigt diese Vorbereitung zusätzlich automatisch bei PR-Änderungen; trotzdem alle fünf GitHub-Testgruppen auf dem neuesten Commit prüfen. Bei rot keine Freigabe melden.
- Bei der PR-Vorbereitung erst den automatischen Commit abwarten; für den neuesten Bot-Commit anschließend eine reguläre CI-Ausführung anstoßen. GitHub-Actions-Bot-Commits können `action_required` statt neuer Testläufe auslösen. Dann eine sachliche Dokumentationskorrektur durch den Bearbeiter auf dem PR-Branch committen, damit die fünf Prüfgruppen regulär neu starten; niemals allein wegen `action_required` mergen.

## Ablauf je Entwicklungsschritt (verbindlich, seit 08.11.2026)
1. Masterplan lesen, Code und vorhandene Funktionen untersuchen, nur einen klar abgegrenzten Schritt bearbeiten; Vorhandenes wiederverwenden, keine parallelen Systeme.
2. Regressionstests, PR, alle CI-Prüfungen abwarten. Nur nach Dinos ausdrücklichem „Ja“ mergen.
3. Dino testet danach auf seinem Android-Handy. Ein grüner automatischer Test ersetzt keinen Handytest. Bei Fehlern zuerst nachbessern und erneut testen.
4. Erst nach erfolgreichem Handytest gilt ein Schritt als abgeschlossen: Masterplan aktualisieren (Änderung, PR, Tests, Handytest, offene Probleme, nächster Schritt), dann die nächste Aufgabe.

## Arbeitsgeschwindigkeit (verbindlich, seit 07.11.2026)
1. Masterplan und vorhandene Architekturinformationen (`ARCHITEKTUR.md`, `LANDKARTE.md`) nutzen, statt Zusammenhänge neu zu untersuchen.
2. Nur unmittelbar relevante Dateien und Abhängigkeiten lesen; keine vollständigen Repository-Analysen ohne konkreten Anlass.
3. Kleinste sichere Änderung zuerst; keine zusätzlichen Funktionen, keine ungefragten Umbauten.
4. Lokal nur die betroffenen Tests ausführen; die vollständige Prüfung übernimmt GitHub (CI). Tests nicht ohne neue Änderung oder konkreten Fehler wiederholen.
5. Dokumentation gezielt und knapp aktualisieren; Abschlussberichte kurz.
6. Sicherheitsprüfungen, Bestätigungspflichten und wichtige Regressionstests nie aus Zeitgründen überspringen.
7. Im Bericht kurz nennen, welche Arbeitsschritte die meiste Zeit gekostet haben (Zeitfresser erkennen).
