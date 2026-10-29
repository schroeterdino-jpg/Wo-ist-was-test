/* Phase 7B: Zustand VOR der Korrektur (Zeitfrage + Lesefehler in storage.js), nur im Speicher nachgebaut.
   Dient dazu, den Phase-7A-Golden-Master des alten Zustands unverändert weiter zu prüfen (tests/memory7a.js)
   und den Fehler als reproduzierbar zu belegen (tests/memory7b.js). Kein Produktcode. */
'use strict';
const TAUSCH = [
 {
  "datei": "storage.js",
  "neu": "let memoryItems = (() => { try { return JSON.parse(getPersistentData('helfer_memory', '{}')) || {}; } catch (e) { console.warn('helfer_memory ist kein gültiges JSON: Gedächtnis startet leer, der gespeicherte Wert bleibt unverändert.'); return {}; } })();   // Lesefehler nur hier abfangen, damit Kontakte, Tageslog usw. weiterladen (nichts wird überschrieben)",
  "alt": "let memoryItems = JSON.parse(getPersistentData('helfer_memory', '{}')) || {};"
 },
 {
  "datei": "gedaechtnis_zeit.js",
  "neu": "try { const res = (typeof searchMemory === 'function' ? searchMemory(term) : []), nt = String(term || '').toLowerCase().replace(/\\s+/g, ' ').trim(); hit = res.find(r => !r.unscharf && String(r.key).toLowerCase().replace(/\\s+/g, ' ').trim() === nt) || res[0] || null; } catch (e) { hit = null; }   // genauer Name vor Teilwort-Treffer; sonst wie bisher der erste Treffer",
  "alt": "try { hit = (typeof searchMemory === 'function' ? searchMemory(term) : [])[0] || null; } catch (e) { hit = null; }"
 }
];
function zustandVor7b(datei, text) {
    for (const t of TAUSCH) if (t.datei === datei && text.includes(t.neu)) text = text.split(t.neu).join(t.alt);   // unveränderter Text bleibt unverändert (mehrfach anwendbar)
    return text;
}
module.exports = { zustandVor7b, TAUSCH };
