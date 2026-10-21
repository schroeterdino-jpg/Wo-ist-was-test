# Hinweise für Claude

Vor jeder Arbeit an dieser App zuerst `ARCHITEKTUR.md` lesen: Überblick über Web-App, Server (`api/`), Weckruf-APK (`weckruf-src/`), Datenabgleich und Stolperfallen.

Wichtig:
- Der Assistent heißt **Jarvis** (nach außen). Intern heißt er noch "Zane" (Befehle, Schlüssel); Schlüssel mit `nova_` und `jv_` nicht umbenennen, sonst gehen Einstellungen verloren.
- Änderungen immer als Branch plus Pull Request, nie als ZIP. Der Nutzer mergt am Handy.
- Bei jedem Umbau sagen, welche Dateien gelöscht werden sollen. Optische Änderungen erst als Bild zeigen.
- Neue Skripte in `index.html` einhängen und `?v=` ändern, wenn sich eine Datei geändert hat.
- Vercel Hobby: höchstens 12 Functions in `api/` (11 belegt). Neues in bestehende Dateien einbauen.
- Änderungen unter `weckruf-src/` lösen einen neuen APK-Bau aus; der Nutzer muss die neue APK installieren.
- Der Nutzer arbeitet am Handy, Antworten auf Deutsch, kurz und ohne Fachjargon.
