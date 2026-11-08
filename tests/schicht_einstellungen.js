/* ============================================================
   TEST: Schichtzeiten-Einstellungen speichern sofort bei jeder Änderung (Handy-Zeitwähler hat keine OK-Taste).
   Start: node tests/schicht_einstellungen.js   Echtes plan_ansagen.js (window.jvPlan), Attrappe für die Seitenelemente.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
(async () => {
    const A = starte({ jetzt: '2026-11-08T16:10:00+01:00', native: { planAnsagen: () => true, holeAnsage: () => '', naechsterWecker: () => 0 }, festerZufall: true, fetch: async u => { throw new Error('offline ' + u); } });
    const P = A.sb.jvPlan;
    P.setBeginn('spaet', 13 * 60 + 33);
    const ids = ['szFruehBeginn', 'szFruehEnde', 'szSpaetBeginn', 'szSpaetEnde', 'szVorher', 'szStau', 'szSpeichern', 'szMeldung', 'schichtzeitenDetails'];
    const el = {}; ids.forEach(id => { el[id] = { value: '', checked: true, style: {}, textContent: '', l: {}, addEventListener(t, f) { (this.l[t] = this.l[t] || []).push(f); } }; });
    const doc = { getElementById: id => el[id] || null, readyState: 'complete', addEventListener() { } };
    const win = { jvPlan: P };
    new Function('window', 'document', 'setTimeout', fs.readFileSync(path.join(__dirname, '..', 'js', 'schicht_einstellungen.js'), 'utf8'))(win, doc, () => 0);
    check('1 Felder werden aus dem Plan gefüllt (Spät Beginn 13:33)', el.szSpaetBeginn.value === '13:33', el.szSpaetBeginn.value);
    el.szSpaetBeginn.value = '13:45';
    (el.szSpaetBeginn.l.change || []).forEach(f => f());
    check('2 Änderung am Zeitfeld speichert sofort (ohne Knopf): Spät Beginn 13:45', P.beginn('spaet') === 13 * 60 + 45, String(P.beginn('spaet')));
    check('3 Meldung "Gespeichert" erscheint', /Gespeichert/.test(el.szMeldung.textContent) && /13:45/.test(el.szMeldung.textContent), el.szMeldung.textContent);
    check('4 Feld zeigt nach dem Speichern 13:45 (springt nicht zurück)', el.szSpaetBeginn.value === '13:45', el.szSpaetBeginn.value);
    el.szVorher.value = '25'; (el.szVorher.l.change || []).forEach(f => f());
    check('5 Ankunft vor Beginn 25 Minuten gespeichert', P.vorherStd() === 25 && P.ankunft('spaet', '2026-11-10') === 13 * 60 + 45 - 25, String(P.vorherStd()));
    el.szSpaetBeginn.value = ''; (el.szSpaetBeginn.l.change || []).forEach(f => f());
    check('6 leeres Feld speichert nichts und lässt die alte Zeit stehen', P.beginn('spaet') === 13 * 60 + 45 && /Bitte alle Zeiten/.test(el.szMeldung.textContent), String(P.beginn('spaet')));
    el.szSpaetBeginn.value = '13:50'; el.szSpeichern.l.click.forEach(f => f());
    check('7 der Speichern-Knopf funktioniert weiter', P.beginn('spaet') === 13 * 60 + 50, String(P.beginn('spaet')));
    for (const [eing, soll] of [['1345', 13 * 60 + 45], ['13.45', 13 * 60 + 45], ['13 45', 13 * 60 + 45], ['945', 9 * 60 + 45], ['14', 14 * 60]]) {
        el.szSpaetBeginn.value = eing; (el.szSpaetBeginn.l.change || []).forEach(f => f());
        check('8 Eingabe "' + eing + '" wird verstanden und gespeichert', P.beginn('spaet') === soll && /^\d\d:\d\d$/.test(el.szSpaetBeginn.value), String(P.beginn('spaet')) + ' ' + el.szSpaetBeginn.value);
    }
    el.szSpaetBeginn.value = '14:00'; (el.szSpaetBeginn.l.change || []).forEach(f => f());
    for (const eing of ['25:99', 'abc', '1399']) {
        el.szSpaetBeginn.value = eing; (el.szSpaetBeginn.l.change || []).forEach(f => f());
        check('9 ungültige Eingabe "' + eing + '" ändert nichts (Meldung)', P.beginn('spaet') === 14 * 60 && /Bitte alle Zeiten/.test(el.szMeldung.textContent), String(P.beginn('spaet')));
    }
    check('10 Zeitfelder sind Textfelder (kein Handy-Zeitwähler ohne OK-Taste)', !/type="time"/.test(fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8').match(/id="szSpaetBeginn"[^>]*>|<input[^>]*id="szSpaetBeginn"[^>]*>/)[0]));
    console.log(fehler ? 'FEHLER: ' + fehler + ' (ok ' + ok + ')' : 'alles ok (' + ok + ' Prüfungen)');
    process.exit(fehler ? 1 : 0);
})();
