/* ============================================================
   TEST: Chef-KI-Werkzeug erinnerung_erledigt (Umbau Bereich Einkauf/Aufgaben/Erinnerungen, Schritt 2):
   "Hab die Tablette genommen" in jeder Formulierung hakt die nachfragende wichtige Erinnerung ab.
   Start: node tests/chef_erledigt.js
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
    let plan = { absicht: 'erledigt', schritte: [{ faehigkeit: 'erinnerung_erledigt', params: { suche: 'Tablette' } }] };
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
    const rem = A.lese('reminderEntries');
    const neu = (id, text, extra) => rem.push(Object.assign({ id, text, important: true, triggered: true, done: false }, extra || {}));
    const dran = () => rem.filter(r => r.important && r.triggered && !r.done).map(r => r.text);
    const d = R.hole('erinnerung_erledigt');
    check('1a angemeldet, keine Bestätigung nötig, keine Pflichtangabe', !!d && d.bestaetigung.noetig === false && d.pflicht.length === 0);
    check('1b in den Schreib-Listen der Chef-KI (B2a)', C.B2A_NEU.includes('erinnerung_erledigt') && C.B2A_SCHREIBT.includes('erinnerung_erledigt') && !C.FREIGEGEBEN.includes('erinnerung_erledigt'));
    // Registry direkt
    let r = await R.fuehreAus('erinnerung_erledigt', {}, {});
    check('2a nichts nachfragend: ehrliche Antwort, nichts geändert', r.status === 'SUCCESS' && /keine wichtige Erinnerung/.test(r.daten && r.daten.nachricht || ''), JSON.stringify(r).slice(0, 250));
    neu(901, 'Tablette nehmen'); neu(902, 'Müll rausbringen'); neu(903, 'Alte Sache', { done: true }); neu(904, 'Nicht wichtig', { important: false });
    r = await R.fuehreAus('erinnerung_erledigt', { suche: 'Tablette' }, {});
    check('2b Stichwort: nur die passende wird abgehakt', r.status === 'SUCCESS' && dran().length === 1 && dran()[0] === 'Müll rausbringen' && /Tablette/.test(r.daten.nachricht), JSON.stringify([r, dran()]).slice(0, 300));
    check('2c unwichtige und schon erledigte bleiben unberührt', rem.find(x => x.id === 904).done === false && rem.find(x => x.id === 903).done === true);
    neu(905, 'Medikament einnehmen');
    r = await R.fuehreAus('erinnerung_erledigt', { suche: 'Zahnarzt' }, {});
    check('2d unbekanntes Stichwort: alle nachfragenden werden abgehakt', r.status === 'SUCCESS' && dran().length === 0, JSON.stringify(dran()));
    // Planprüfung
    const ok1 = z => C.planErlaubt({ schritte: [{ faehigkeit: 'erinnerung_erledigt', params: z }] });
    check('3a Plan ohne und mit Stichwort erlaubt', ok1({}) === true && ok1({ suche: 'Tablette' }) === true);
    check('3b Fremdangaben, Sonderzeichen, falscher Typ verworfen', ok1({ suche: 'x', id: 1 }) === false && ok1({ suche: '<b>x</b>' }) === false && ok1({ suche: 5 }) === false);
    // Ganzer Weg
    C.an();
    neu(911, 'Tablette nehmen');
    gespr.length = 0;
    await A.lassLaufen(async () => { A.sb.jvTippen('Ich hab das Zeug von vorhin schon geschluckt'); await warte(80); });
    await A.lassLaufen(async () => { await warte(80); });
    check('4a KI-Weg: Planer gefragt, Erinnerung abgehakt, keine normale KI', st.planer >= 1 && dran().length === 0 && st.normal === 0, JSON.stringify({ st, dran: dran() }));
    check('4b Jarvis sagt, dass er nicht mehr nachfragt', gespr.some(t => /nicht mehr nach/.test(t)), JSON.stringify(gespr));
    // Ohne Erledigt-Wunsch im Satz wird nie abgehakt
    neu(912, 'Tablette abends');
    await A.lassLaufen(async () => { A.sb.jvTippen('Wie spät ist es in Tokio'); await warte(80); });
    await A.lassLaufen(async () => { await warte(80); });
    check('5 ohne Erledigt-Wunsch wird nie abgehakt, auch wenn der Plan es vorschlägt', dran().includes('Tablette abends'), JSON.stringify(dran()));
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
