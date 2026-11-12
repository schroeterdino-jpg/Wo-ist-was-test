/* ============================================================
   TEST: Chef-KI-Werkzeug wecker_stellen (Umbau Schritt 1b): die KI versteht Wecker-Wünsche in jeder Formulierung,
   die Ausführung läuft über dieselbe Wecker-Logik wie der Sprachbefehl. Start: node tests/chef_wecker.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
(async () => {
    const aufrufe = [], gespr = [], st = { planer: 0, normal: 0 };
    let plan = { absicht: 'wecker', schritte: [{ faehigkeit: 'wecker_stellen', params: { zeit: '06:30' } }] };
    const native = new Proxy({ weckerStellen: (h, m) => { aufrufe.push([h, m]); return true; } }, { get: (t, k) => k in t ? t[k] : (() => '') });
    const A = starte({ jetzt: '2026-11-12T11:13:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true, native,
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
    const d = R.hole('wecker_stellen');
    check('1a angemeldet, Wecker braucht keine Bestätigung', !!d && d.bestaetigung.noetig === false && d.pflicht.length === 1 && d.pflicht[0].name === 'zeit');
    check('1b in den Schreib-Listen der Chef-KI (B2a), nicht in der alten Freigabe', C.B2A_NEU.includes('wecker_stellen') && !C.FREIGEGEBEN.includes('wecker_stellen'));
    // Registry direkt
    let r = await R.fuehreAus('wecker_stellen', { zeit: '12:00' }, {});
    check('2a stellt den Wecker über die Wecker-Logik', r.status === 'SUCCESS' && aufrufe.length === 1 && aufrufe[0][0] === 12 && aufrufe[0][1] === 0, JSON.stringify(r).slice(0, 200));
    check('2b Antwort nennt Uhrzeit', /12[:.]00|12 Uhr/.test(r.daten && r.daten.nachricht || r.nachricht || ''), JSON.stringify(r.daten));
    aufrufe.length = 0;
    r = await R.fuehreAus('wecker_stellen', { zeit: '25:00' }, {});
    check('2c ungültige Uhrzeit: nichts gestellt, Rückfrage', r.status === 'NEEDS_INFORMATION' && aufrufe.length === 0);
    r = await R.fuehreAus('wecker_stellen', {}, {});
    check('2d ohne Uhrzeit: NEEDS_INFORMATION', r.status === 'NEEDS_INFORMATION' && aufrufe.length === 0);
    // Planprüfung
    const ok1 = z => C.planErlaubt({ schritte: [{ faehigkeit: 'wecker_stellen', params: z }] });
    check('3a Plan mit "06:30" erlaubt, "6:05" auch', ok1({ zeit: '06:30' }) === true && ok1({ zeit: '6:05' }) === true);
    check('3b Fremdangaben, falsches Format, Uhrzeit >23 verworfen', ok1({ zeit: '06:30', tag: 'morgen' }) === false && ok1({ zeit: 'halb sieben' }) === false && ok1({ zeit: '24:00' }) === false && ok1({}) === false);
    // Ganzer Weg: Satz, den die festen Muster nicht kennen
    C.an();
    aufrufe.length = 0; gespr.length = 0;
    await A.lassLaufen(async () => { A.sb.jvTippen('Ich möchte morgen früh geweckt werden, so gegen halb sieben'); await warte(80); });
    await A.lassLaufen(async () => { await warte(80); });
    check('4a KI-Weg: Planer gefragt, Wecker auf 06:30 gestellt, keine normale KI', st.planer >= 1 && aufrufe.length === 1 && aufrufe[0][0] === 6 && aufrufe[0][1] === 30 && st.normal === 0, JSON.stringify({ st, aufrufe }));
    check('4b Jarvis sagt, dass der Wecker gestellt ist', gespr.some(t => /Wecker ist gestellt/.test(t)), JSON.stringify(gespr));
    // Doppelt gesagt: ein einziger Wecker pro Satz
    check('4c genau ein Wecker für einen Satz', aufrufe.length === 1);
    // Ohne Weckwunsch im Satz schreibt die KI nie einen Wecker
    aufrufe.length = 0; gespr.length = 0;
    await A.lassLaufen(async () => { A.sb.jvTippen('Wie spät ist es in Tokio'); await warte(80); });
    await A.lassLaufen(async () => { await warte(80); });
    check('5 ohne Weckwunsch wird nie ein Wecker gestellt, auch wenn der Plan es vorschlägt', aufrufe.length === 0, JSON.stringify(aufrufe));
    // Uhr-App nimmt Wecker nicht an
    const B = starte({ jetzt: '2026-11-12T11:13:00+01:00', festerZufall: true, native: new Proxy({ weckerStellen: () => false }, { get: (t, k) => k in t ? t[k] : (() => '') }), fetch: async u => { throw new Error('offline ' + u); } });
    B.vorspulen(2000);
    r = await B.sb.jvRegistry.fuehreAus('wecker_stellen', { zeit: '07:00' }, {});
    check('6 Uhr-App lehnt ab: ehrlicher Fehler, kein Erfolg', r.status !== 'SUCCESS', JSON.stringify(r).slice(0, 200));
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
