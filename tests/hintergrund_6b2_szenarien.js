/* ============================================================
   Phase 6B.2: Szenarien für den 200-ms-Takt in js/synapsen.js (Prüfwelt, virtuelle Uhr, steuerbare Sichtbarkeit).
   Der Takt gleicht den Zustand "denkt Jarvis gerade?" (globales isProcessing) mit der Synapsen-Anzeige ab (start/stop).
   Beobachtet werden Anzeige (Canvas/Text), Zeichenaufrufe, Speicher, Netz, die Hülle um sendToGroqSmart und die Timer.
   ============================================================ */
'use strict';
const { lade } = require('./hintergrund_6b1_welt.js');

function welt(quelle) {
    const rec = { aufrufe: [], rueckgaben: [] };
    const w = lade('synapsen.js', {
        mitHolo: true, kopf: false, quelle: quelle == null ? undefined : quelle,
        global: (sb) => ({
            isProcessing: false,
            getPersistentData: (k, d) => { const v = sb.localStorage.getItem(k); return v == null ? d : v; },
            setPersistentData: (k, v) => sb.localStorage.setItem(k, v),
            sendToGroqSmart: function (text) { rec.aufrufe.push(String(text)); return 'antwort:' + text; },
            speak: () => { }, jvCommands: { use() { return true; } }
        })
    });
    w.rec = rec;
    return w;
}
const zustand = w => { const cv = w.doc.body.children.find(c => c.id === 'jvSynapsen'), tx = w.doc.body.children.find(c => c.id === 'jvSynText'); return cv ? { leinwand: String(cv.style.opacity), text: String(tx.style.opacity), zeile: tx.textContent.replace(/\.+$/, '') } : { leinwand: '-', text: '-', zeile: '-' }; };
const denken = (w, an) => { w.sb.isProcessing = !!an; };

function ablauf(quelle) {
    const w = welt(quelle), r = {};
    if (w.ladeFehler) return { ladeFehler: String(w.ladeFehler.message) };
    const d = () => w.z.intervalAufrufe;
    r.start = { aktiv: w.aktiveIntervalle(), ms: w.aktiveIntervallMs(), hoererVisibility: w.hoererAnzahl('visibilitychange') };
    r.huelle = { markiert: w.sb.sendToGroqSmart._jvSyn === true };
    // 1. sichtbar 30 s im Leerlauf
    let a = d(), c = w.z.ctxAufrufe; w.tick(30000);
    r.leerlauf30 = { aufrufe: d() - a, zeichnen: w.z.ctxAufrufe - c, zustand: zustand(w) };
    // 2. KI-Anfrage sichtbar: Hülle merkt sich den Text (Stichworte), der Takt schaltet die Anzeige ein und wieder aus
    denken(w, true); const rueck = w.sb.sendToGroqSmart('Wie wird das Wetter morgen?'); a = d(); c = w.z.ctxAufrufe; w.tick(3000);
    r.ki = { rueckgabe: rueck, originalAufrufe: w.rec.aufrufe.slice(), aufrufe: d() - a, zeichnetWaehrend: w.z.ctxAufrufe - c > 0, zustand: zustand(w) };
    denken(w, false); w.tick(1000); r.kiEnde = { zustand: zustand(w) };
    // 3. hidden 30 s im Leerlauf
    w.verstecke(true); let sp = w.z.speicherSchreiben, nz = w.z.netz; a = d(); c = w.z.ctxAufrufe; w.tick(30000);
    r.hidden30 = { aufrufe: d() - a, aktiv: w.aktiveIntervalle(), zeichnen: w.z.ctxAufrufe - c, speicher: w.z.speicherSchreiben - sp, netz: w.z.netz - nz, zustand: zustand(w) };
    w.verstecke(false); r.rueck30Sofort = zustand(w); w.tick(250); r.rueck30Nach250 = zustand(w);
    // 4. versteckt beginnt das Denken: Anzeige bleibt aus, bei der Rückkehr (Denken läuft noch) wird sie eingeschaltet
    w.verstecke(true); denken(w, true); a = d(); w.tick(5000);
    r.hiddenDenkt = { aufrufe: d() - a, zustand: zustand(w) };
    w.verstecke(false); r.hiddenDenktRueckSofort = zustand(w); w.tick(250); r.hiddenDenktRueckNach250 = zustand(w);
    // 5. versteckt endet das Denken (Anzeige war an): bleibt eingefroren, bei der Rückkehr wird sie ausgeschaltet
    w.verstecke(true); denken(w, false); w.tick(5000);
    r.hiddenEnde = { zustand: zustand(w) };
    w.verstecke(false); r.hiddenEndeRueckSofort = zustand(w); w.tick(250); r.hiddenEndeRueckNach250 = zustand(w); w.tick(1000); r.hiddenEndeNach1250 = zustand(w);
    // 6. zehn schnelle Wechsel, dabei läuft das Denken
    denken(w, true); w.tick(300); const vor = w.z.setInterval; a = d();
    for (let i = 0; i < 10; i++) { w.verstecke(true); w.tick(100); w.verstecke(false); w.tick(100); }
    r.wechsel10 = { aktiv: w.aktiveIntervalle(), ms: w.aktiveIntervallMs(), neueIntervalle: w.z.setInterval - vor, fehler: w.z.fehler.length, zustand: zustand(w) };
    denken(w, false); w.tick(500); r.nachWechsel = { zustand: zustand(w), aktiv: w.aktiveIntervalle() };
    // 7. sichtbarer Takt über 10 s mit Denken: Zahl der Takt-Rückrufe (200 ms) und Zeichenaufrufe
    denken(w, true); a = d(); c = w.z.ctxAufrufe; w.tick(10000); r.denkt10 = { aufrufe: d() - a, zeichnet: w.z.ctxAufrufe - c > 0 };
    denken(w, false); w.tick(1000);
    r.fehler = w.z.fehler.slice(); r.netz = w.z.netz; r.speicherSchreiben = w.z.speicherSchreiben;
    r.huelleNachher = { markiert: w.sb.sendToGroqSmart._jvSyn === true, originalAufrufe: w.rec.aufrufe.length };
    return r;
}
module.exports = { ablauf, welt, zustand, denken };
