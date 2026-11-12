/* ============================================================
   TEST: Chef-KI-Werkzeug einkauf_hinzufuegen (Umbau Bereich Einkauf/Aufgaben/Erinnerungen, Schritt 1):
   die KI versteht Einkaufswünsche in jeder Formulierung, die Ausführung läuft über die bestehende Aktion 'shopping'.
   Start: node tests/chef_einkauf.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
(async () => {
    const gespr = [], st = { planer: 0, normal: 0 };
    let plan = { absicht: 'einkauf', schritte: [{ faehigkeit: 'einkauf_hinzufuegen', params: { artikel: 'Käse, Joghurt' } }] };
    const A = starte({ jetzt: '2026-11-12T11:13:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true,
        nachSkript: (f, sb) => { if (f === 'voice.js') sb.speak = function (t) { gespr.push(String(t)); return Promise.resolve(); }; },
        fetch: async (u, o) => {
            if (/api\/groq/.test(String(u))) {
                const b = JSON.parse(o.body), sys = (b.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
                if (/Du planst für einen Sprachassistenten/.test(sys)) { st.planer++; return ant({ choices: [{ message: { content: JSON.stringify(plan) } }] }); }
                st.normal++; return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Normale KI.', actions: [] }) } }] });
            }
            throw new Error('offline ' + u);
        } });
    A.vorspulen(2000);
    const R = A.sb.jvRegistry, C = A.sb.jvChef;
    const liste = () => (A.lese('shoppingEntries') || []).map(e => e.text);
    const d = R.hole('einkauf_hinzufuegen');
    check('1a angemeldet, keine Bestätigung nötig, Pflichtangabe "artikel"', !!d && d.bestaetigung.noetig === false && d.pflicht.length === 1 && d.pflicht[0].name === 'artikel');
    check('1b in den Schreib-Listen der Chef-KI (B2a), nicht in der alten Freigabe', C.B2A_NEU.includes('einkauf_hinzufuegen') && C.B2A_SCHREIBT.includes('einkauf_hinzufuegen') && !C.FREIGEGEBEN.includes('einkauf_hinzufuegen'));
    // Registry direkt
    let r = await R.fuehreAus('einkauf_hinzufuegen', { artikel: 'Butter' }, {});
    check('2a ein Artikel kommt auf die Liste, Rückgabe nennt ihn', r.status === 'SUCCESS' && liste().includes('Butter') && /Butter/.test(r.daten && r.daten.nachricht || ''), JSON.stringify(r).slice(0, 250));
    r = await R.fuehreAus('einkauf_hinzufuegen', { artikel: 'Milch, Eier und Brot' }, {});
    check('2b mehrere Artikel (Komma und "und") kommen alle auf die Liste', r.status === 'SUCCESS' && ['Milch', 'Eier', 'Brot'].every(x => liste().includes(x)), JSON.stringify(liste()));
    const vorher = liste().length;
    r = await R.fuehreAus('einkauf_hinzufuegen', { artikel: 'butter' }, {});
    check('2c Duplikat (auch klein geschrieben): nichts doppelt, ehrliche Antwort "schon drauf"', liste().length === vorher && /schon drauf/.test(r.daten && r.daten.nachricht || ''), JSON.stringify(r).slice(0, 250));
    r = await R.fuehreAus('einkauf_hinzufuegen', {}, {});
    check('2d ohne Artikel: NEEDS_INFORMATION, nichts geschrieben', r.status === 'NEEDS_INFORMATION' && liste().length === vorher);
    r = await R.fuehreAus('einkauf_hinzufuegen', { artikel: ' , ' }, {});
    check('2e nur Trennzeichen: NEEDS_INFORMATION', r.status === 'NEEDS_INFORMATION' && liste().length === vorher);
    // Planprüfung
    const ok1 = z => C.planErlaubt({ schritte: [{ faehigkeit: 'einkauf_hinzufuegen', params: z }] });
    check('3a Plan mit Artikeln erlaubt', ok1({ artikel: 'Milch' }) === true && ok1({ artikel: 'Milch, Eier, Brot' }) === true);
    check('3b Fremdangaben, leer, Sonderzeichen verworfen', ok1({ artikel: 'Milch', menge: 2 }) === false && ok1({}) === false && ok1({ artikel: '<b>x</b>' }) === false && ok1({ artikel: 5 }) === false);
    // Ganzer Weg: Satz ohne festes Muster
    C.an();
    gespr.length = 0;
    await A.lassLaufen(async () => { A.sb.jvTippen('Wir brauchen dringend Käse und Joghurt'); await warte(80); });
    await A.lassLaufen(async () => { await warte(80); });
    check('4a KI-Weg: Planer gefragt, Käse und Joghurt stehen auf der Liste, keine normale KI', st.planer >= 1 && liste().includes('Käse') && liste().includes('Joghurt') && st.normal === 0, JSON.stringify({ st, liste: liste() }));
    check('4b Jarvis sagt, was auf der Liste steht', gespr.some(t => /Einkaufsliste/.test(t)), JSON.stringify(gespr));
    // Ohne Einkaufswunsch im Satz schreibt die KI nie auf die Liste
    const n0 = liste().length; plan = { absicht: 'einkauf', schritte: [{ faehigkeit: 'einkauf_hinzufuegen', params: { artikel: 'Tokio' } }] };
    await A.lassLaufen(async () => { A.sb.jvTippen('Wie spät ist es in Tokio'); await warte(80); });
    await A.lassLaufen(async () => { await warte(80); });
    check('5 ohne Einkaufswunsch wird nie etwas auf die Liste geschrieben, auch wenn der Plan es vorschlägt', liste().length === n0 && !liste().includes('Tokio'), JSON.stringify(liste()));
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
