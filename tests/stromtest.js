/* ============================================================
   STROMSPAREN PHASE 1: Messzähler + Testschalter "Wach-Sperre deaktivieren (Test)" (Start: node tests/stromtest.js)
   Prüft den Quelltext der Handy-App (weckruf-src/), ohne Android:
     A  Standardwert des Testschalters = aus
     B  Schalter aus: Wach-Sperre wie bisher (PARTIAL_WAKE_LOCK "zane:lauschen", ohne Timeout)
     C  Schalter an: Wach-Sperre wird nicht gehalten (freigegeben)
     D  an -> aus: Sperre wird sofort wieder geholt (ohne Neustart des Dienstes)
     E  Nachtruhe unverändert, Testschalter kann sie nicht umgehen
     F  Mikrofon-/Filter-Pipeline unverändert (Rate, Format, Puffer, Schwellen, Entscheidungen)
     G  Messzähler beeinflussen keine Entscheidung
     H  keine Netzwerkübertragung der Messdaten
     I  kein neuer Timer / keine neue Schleife nur für die Statistik
   Es werden keine Dateien verändert. Mit ROOT=<Ordner> lässt sich ein anderer Stand prüfen (Negativbeweis gegen main).
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const ROOT = process.env.ROOT || path.join(__dirname, '..');
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let ok = 0, fehler = 0;
function check(name, v) { if (v) ok++; else { fehler++; console.log('FEHLER: ' + name); } }
const prefs = lies('weckruf-src/Prefs.java'), wake = lies('weckruf-src/WakeService.java'), oww = lies('weckruf-src/OwwSpeech.java'), setup = lies('weckruf-src/SetupActivity.java');
const zaehle = (s, re) => (s.match(re) || []).length;

/* A */
check('A: Prefs.testOhneWachsperre liest den Wert mit Standard false', /static boolean testOhneWachsperre\(Context c\) \{ return sp\(c\)\.getBoolean\("testOhneWachsperre", false\); \}/.test(prefs));
check('A: Setter vorhanden', /static void setTestOhneWachsperre\(Context c, boolean v\)/.test(prefs));
check('A: Einstellung steht in den Jarvis-Einstellungen mit klarer Bezeichnung', /schalter\(wc, "Wach-Sperre deaktivieren \(Test\)", Prefs\.testOhneWachsperre\(this\)/.test(setup));

/* B, C, D */
const m = wake.match(/private void wakeLockAnpassen\(\) \{([\s\S]*?)\n    \}\n/);
const fn = m ? m[1] : '';
check('B/C: wakeLockAnpassen gefunden', !!m);
check('C: Sperre wird freigegeben, wenn ausgeschaltet() ODER Testschalter an', /if \(ausgeschaltet\(\) \|\| Prefs\.testOhneWachsperre\(this\)\) \{[\s\S]*wakeLock\.release\(\)[\s\S]*wakeLock = null;/.test(fn));
check('B: sonst wie bisher PARTIAL_WAKE_LOCK "zane:lauschen", acquire() ohne Timeout', /else if \(wakeLock == null\) \{[\s\S]*PowerManager\.PARTIAL_WAKE_LOCK, "zane:lauschen"\);\s*wakeLock\.acquire\(\);/.test(fn) && !/acquire\(\s*\d/.test(fn));
check('D: Umstellen ruft wakeLockAnpassen sofort auf dem Hauptthread (kein Neustart des Dienstes)', /static void wachsperreGeaendert\(\) \{\s*final WakeService s = inst;\s*if \(s != null\) s\.main\.post\(s::wakeLockAnpassen\);\s*\}/.test(wake));
check('D: der Schalter ruft wachsperreGeaendert nach dem Speichern', /Prefs\.setTestOhneWachsperre\(this, an\); WakeService\.wachsperreGeaendert\(\);/.test(setup));
check('B: wakeLockAnpassen wird weiter beim Start und bei Nachtwechsel aufgerufen', zaehle(wake, /wakeLockAnpassen\(\);/g) >= 2);

/* E */
check('E: ausgeschaltet() unverändert (Knopf oder Nachtruhe)', /private boolean ausgeschaltet\(\) \{\s*return Prefs\.muted\(this\) \|\| nachtAktiv\(\);\s*\}/.test(wake));
check('E: Nachtruhe-Wechsel ruft weiter wakeLockAnpassen und nachtPlanen', /void nachtWechsel\(\) \{[\s\S]*?wakeLockAnpassen\(\);\s*nachtPlanen\(\);\s*evalVosk\(\);/.test(wake));
check('E: der Testschalter kann die Sperre nur freigeben, nie während Nachtruhe holen (Bedingung beginnt mit ausgeschaltet())', /if \(ausgeschaltet\(\) \|\| Prefs\.testOhneWachsperre/.test(fn) && !/else if \(.*testOhneWachsperre/.test(fn));
check('E: Nachtruhe-Standard 23 bis 4 Uhr in Prefs unverändert', /nightFrom|nightTo/.test(prefs) && /nightOn\(Context c\) \{ return sp\(c\)\.getBoolean\("nightOn", true\)/.test(prefs));

/* F */
check('F: 16 kHz, mono, 16 Bit, Quelle VOICE_RECOGNITION', /RATE = 16000/.test(oww) && /AudioFormat\.CHANNEL_IN_MONO/.test(oww) && /AudioFormat\.ENCODING_PCM_16BIT/.test(oww) && /MediaRecorder\.AudioSource\.VOICE_RECOGNITION/.test(oww));
check('F: Puffer mindestens 3 s, Block 1280 (80 ms)', /Math\.max\(min, RATE \* 2 \* 3\)/.test(oww) && /short\[\] block = new short\[OwwEngine\.CHUNK\]/.test(oww) && /static final int CHUNK = 1280/.test(lies('weckruf-src/OwwEngine.java')));
check('F: Schwellen und Nachlaufzeiten unverändert', /VORLAUF = 16;/.test(oww) && /NACHLAUF = 19;/.test(oww) && /DAUERLAERM = 600;/.test(oww) && /SPRACHE = 0\.35f;/.test(oww) && /SPRACH_HALT = 12;/.test(oww) && /VAD_AUS = 12;/.test(oww));
check('F: Entscheidungen unverändert (Lautstärke-Schranke, Dauerlärm, Filter, Treffer)', /boolean laut = rms > boden \* 2\.2 \+ 60;/.test(oww) && /boolean energie = laut \|\| boden > DAUERLAERM;/.test(oww) && /aktiv = sprachHalt > 0;/.test(oww) && /else if \(score >= threshold\)/.test(oww) && /if \(energie\) vadStill = 0; else if \(vadStill < VAD_AUS\) vadStill\+\+;/.test(oww));
check('F: Foreground-Dienst unverändert (START_STICKY, microphone)', /return START_STICKY;/.test(wake) && /FOREGROUND_SERVICE_TYPE_MICROPHONE/.test(wake));
check('F: Server-Abfrage unverändert (jede Minute)', /if \(alive\) main\.postDelayed\(this, 60000\);/.test(wake) && /AuftragReceiver\.abfragenAsync\(WakeService\.this\)/.test(wake));

/* G */
const zaehler = ['blocksAll', 'vadWin', 'vadPosWin', 'vadAll', 'vadPosAll', 'trefferAll'];
let g = true;
oww.split('\n').forEach(z => {
    const bed = [];
    z.replace(/\b(?:if|while) \(([^)]*)\)/g, (_, c) => { bed.push(c); return ''; });
    const tern = z.match(/[^?]*\?[^:]*:/);
    if (tern && !/^\s*\/\//.test(z) && !/"/.test(z)) bed.push(tern[0]);
    bed.forEach(c => zaehler.forEach(n => { if (new RegExp('\\b' + n + '\\b').test(c)) { g = false; console.log('  Zähler in Bedingung: ' + z.trim()); } }));
});
check('G: Zähler kommen nur in Zählen und Anzeige vor, nie in einer Bedingung der Erkennung', g);
check('G: alle sechs Zähler sind da', zaehler.every(n => new RegExp('\\b' + n + '\\b').test(oww)));
check('G: Messzeile zeigt Filter geprüft, Sprache, Messdauer, Treffer', /Sprachfilter geprüft: /.test(oww) && /davon Sprache /.test(oww) && /Messdauer: /.test(oww) && /Treffer seit Start: /.test(oww));

/* H */
check('H: OwwSpeech hat keine Netzwerkaufrufe', !/HttpURLConnection|new URL\(|apiFetch|OkHttp|Socket\(/.test(oww));
check('H: die Messdaten gehen nur lokal über Prefs.setStat', zaehle(oww, /Prefs\.setStat\(/g) === 1 && /static void setStat\(Context c, String s\) \{ sp\(c\)\.edit\(\)\.putString\("stat", s\)\.apply\(\); \}/.test(prefs));

/* I */
check('I: OwwSpeech: keine neuen Timer (kein postDelayed/Timer/Executor), nur der eine Audio-Thread und der eine Handler', zaehle(oww, /postDelayed|java\.util\.Timer|ScheduledExecutor|Executors\./g) === 0 && zaehle(oww, /new Thread\(/g) === 1 && zaehle(oww, /new Handler\(/g) === 1);
check('I: Messwerte werden weiter nur alle 10 s im vorhandenen Fenster geschrieben (keine zweite Stelle)', zaehle(oww, /10_000_000_000L/g) === 1);
check('I: WakeService: unverändert drei Dauer-Takte (Wächter 15 s, Telefonat 2 s, Meldungen 60 s)', /main\.postDelayed\(watchdog, 15000\)/.test(wake) && /main\.postDelayed\(gespraechPruefen, 2000\)/.test(wake) && /postDelayed\(this, 60000\)/.test(wake));

console.log((fehler ? 'FEHLGESCHLAGEN' : 'OK') + ': ' + ok + ' Prüfungen bestanden, ' + fehler + ' Fehler');
process.exit(fehler ? 1 : 0);
