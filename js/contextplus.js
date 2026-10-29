/* JARVIS Kontext+ v1 – zentrale Folgefragen + Antworttiefe, ohne bestehende Aktionen zu duplizieren. */
(function(){
'use strict';
function extraRules(text){
 const t=String(text||'').toLowerCase();
 let r='\n\nGESPRÄCHSKONTEXT UND FOLGEFRAGEN:\n'+
   '- Behandle die letzten Gesprächsrunden als zusammenhängendes Gespräch. Pronomen und Kurzformen wie "der", "die", "das", "den", "dahin", "dort", "hin", "der Laden", "die Adresse" oder "der Ort" beziehen sich auf das zuletzt eindeutig besprochene passende Objekt, Ziel, Geschäft, Kontakt, Ereignis oder Suchergebnis.\n'+
   '- Verlange NICHT, dass der User den Namen erneut sagt, wenn der Bezug aus dem unmittelbar vorherigen Gespräch eindeutig ist. Beispiel: "Wo ist der nächste Penny?" -> danach "Wann macht der zu?" -> danach "Wie weit ist das von hier?" -> danach "Navigier mich hin." Alles bezieht sich weiter auf denselben Penny.\n'+
   '- Ist der Bezug wirklich mehrdeutig, frage genau einmal kurz nach. Erfinde niemals einen Bezug.\n'+
   '- Nutze dafür ausschließlich die bereits vorhandenen JARVIS-Aktionen; erfinde keine neue Aktion und bestätige nichts, was nicht ausgeführt wurde.\n';
 if(/\b(nur kurz|ganz kurz|kurz gesagt|kurze antwort|fass dich kurz)\b/.test(t))
   r+='\nANTWORTTIEFE: Der User will diese Antwort besonders kurz. Antworte mit genau einem knappen Satz, außer eine Sicherheitsinformation erfordert mehr.\n';
 if(/\b(genauer|ausführlich|ausfuehrlich|mehr details|detailliert|erklär.*mehr|erklaer.*mehr|erklär.*genau|erklaer.*genau)\b/.test(t))
   r+='\nANTWORTTIEFE: Der User verlangt diesmal mehr Details. Du darfst deutlich ausführlicher als die normale 1-2-Satz-Regel antworten, aber bleibe relevant und gut sprechbar.\n';
 return r;
}
/* Einmal in die Ergänzungs-Liste der KI-Anweisung (commands.js, jvChain) eintragen. Rang 50 = innerster der fünf späten Zusätze (kommt zuerst ans Ende).
   Gleicher Name = gleicher Eintrag, doppeltes Ausführen ergibt also nie einen zweiten Block. Kein Nachhängen per Zeitgeber mehr nötig. */
if(window.jvChain) window.jvChain.use('buildSystemPrompt','contextplus',function(next,args){ return next()+extraRules(args[0]); },50);
})();
