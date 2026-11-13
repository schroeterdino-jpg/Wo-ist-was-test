/* ============================================================
   TEST: Chef-KI-Werkzeug erinnerung_verschieben (Umbau Bereich Einkauf/Aufgaben/Erinnerungen, Schritt 3):
   "heute Abend nochmal", "schieb das auf morgen früh" in freier Formulierung verschiebt die Erinnerung.
   Start: node tests/chef_verschieben.js
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
    let plan = null;
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
    const rem = { get length() { return A.lese('reminderEntries').length; }, push: x => A.lese('reminderEntries').push(x), find: f => A.lese('reminderEntries').find(f), filter: f => A.lese('reminderEntries').filter(f), findIndex: f => A.lese('reminderEntries').findIndex(f), splice: (a, b) => A.lese('reminderEntries').splice(a, b) };   // die Liste wird beim Löschen neu gebildet: immer frisch lesen
    const jetzt = () => new A.sb.Date().getTime();
    const inMin = m => new Date(jetzt() + m * 60000).toISOString();
    const neu = (id, text, extra) => rem.push(Object.assign({ id, text, important: true, triggered: true, done: false, time: inMin(-1) }, extra || {}));
    const offen = text => rem.filter(r => r.text === text && !r.done);
    const d = R.hole('erinnerung_verschieben');
    check('1a angemeldet, keine Bestätigung nötig, Pflichtangabe "zeit"', !!d && d.bestaetigung.noetig === false && d.pflicht.length === 1 && d.pflicht[0].name === 'zeit');
    check('1b in den Schreib-Listen der Chef-KI (B2a), nicht in der alten Freigabe', C.B2A_NEU.includes('erinnerung_verschieben') && C.B2A_SCHREIBT.includes('erinnerung_verschieben') && !C.FREIGEGEBEN.includes('erinnerung_verschieben'));
    // Registry direkt
    let r = await R.fuehreAus('erinnerung_verschieben', { zeit: inMin(120) }, {});
    check('2a nichts geklingelt, kein Stichwort: ehrliche Rückfrage, nichts angelegt', r.status === 'NEEDS_INFORMATION' && rem.length === 0, JSON.stringify(r).slice(0, 250));
    neu(901, 'Tablette nehmen');
    r = await R.fuehreAus('erinnerung_verschieben', { zeit: inMin(-5) }, {});
    check('2b Zeit in der Vergangenheit: NEEDS_INFORMATION, alte Erinnerung unberührt', r.status === 'NEEDS_INFORMATION' && offen('Tablette nehmen').length === 1, JSON.stringify(r).slice(0, 250));
    r = await R.fuehreAus('erinnerung_verschieben', { zeit: inMin(120) }, {});
    const neue = rem.filter(x => x.text === 'Tablette nehmen' && !x.done);
    check('2c nachfragende Erinnerung wird verschoben: alte erledigt, genau eine neue zur Zeit, bleibt wichtig', r.status === 'SUCCESS' && rem.find(x => x.id === 901).done === true && neue.length === 1 && neue[0].important === true && Math.abs(new A.sb.Date(neue[0].time).getTime() - (jetzt() + 120 * 60000)) < 90000 && /Tablette nehmen/.test(r.daten.nachricht), JSON.stringify([r, rem]).slice(0, 400));
    check('2d die neue Erinnerung hat noch nicht geklingelt', neue[0].triggered === false && neue[0].done === false);
    neu(902, 'Müll rausbringen');
    neu(903, 'Tochter abholen');
    r = await R.fuehreAus('erinnerung_verschieben', { zeit: inMin(60) }, {});
    check('2e zwei nachfragende ohne Stichwort: nicht raten, Rückfrage nennt beide', r.status === 'NEEDS_INFORMATION' && /Tochter/.test(JSON.stringify(r)) && offen('Tochter abholen').length === 1, JSON.stringify(r).slice(0, 300));
    r = await R.fuehreAus('erinnerung_verschieben', { zeit: inMin(60), suche: 'Tochter' }, {});
    check('2f mit Stichwort die passende (nicht die andere)', r.status === 'SUCCESS' && rem.find(x => x.id === 903).done === true && offen('Müll rausbringen').length === 1, JSON.stringify(r).slice(0, 300));
    r = await R.fuehreAus('erinnerung_verschieben', { zeit: inMin(60), suche: 'Zahnarzt' }, {});
    check('2g unbekanntes Stichwort: NEEDS_INFORMATION', r.status === 'NEEDS_INFORMATION', JSON.stringify(r).slice(0, 250));
    // noch nicht geklingelte Erinnerung mit Stichwort verschieben
    rem.push({ id: 931, text: 'Blumen gießen', time: inMin(30), important: false, triggered: false, done: false });
    r = await R.fuehreAus('erinnerung_verschieben', { zeit: inMin(300), suche: 'Blumen' }, {});
    check('2h kommende Erinnerung mit Stichwort verschiebbar: die alte ist ganz weg, genau eine neue', r.status === 'SUCCESS' && !rem.find(x => x.id === 931) && offen('Blumen gießen').length === 1 && rem.filter(x => x.text === 'Blumen gießen').length === 1 && new A.sb.Date(offen('Blumen gießen')[0].time).getTime() > jetzt() + 200 * 60000, JSON.stringify(r).slice(0, 300));
    // Planprüfung
    const ok1 = z => C.planErlaubt({ schritte: [{ faehigkeit: 'erinnerung_verschieben', params: z }] });
    check('3a Plan mit Zeit (und Stichwort) erlaubt', ok1({ zeit: '2026-11-12T19:00:00' }) === true && ok1({ zeit: '2026-11-12T19:00:00', suche: 'Tablette' }) === true);
    check('3b ohne Zeit, Fremdangaben, Sonderzeichen verworfen', ok1({}) === false && ok1({ suche: 'x' }) === false && ok1({ zeit: '2026-11-12T19:00:00', id: 1 }) === false && ok1({ zeit: '2026-11-12T19:00:00', suche: '<b>x</b>' }) === false);
    // Ganzer Weg
    C.an();
    rem.find(x => x.id === 902).done = true;
    neu(941, 'Wäsche aufhängen');
    plan = { absicht: 'verschieben', schritte: [{ faehigkeit: 'erinnerung_verschieben', params: { zeit: '2026-11-12T19:00:00' } }] };
    gespr.length = 0;
    await A.lassLaufen(async () => { A.sb.jvTippen('Heute Abend bitte nochmal'); await warte(80); });
    await A.lassLaufen(async () => { await warte(80); });
    const w = rem.filter(x => x.text === 'Wäsche aufhängen' && !x.done);
    check('4a KI-Weg: Planer gefragt, Wäsche steht auf 19:00, keine normale KI', st.planer >= 1 && w.length === 1 && new A.sb.Date(w[0].time).getHours() === 19 && st.normal === 0, JSON.stringify({ st, w }));
    check('4b Jarvis sagt, wann sie jetzt kommt', gespr.some(t => /Wäsche aufhängen kommt jetzt heute um 19:00/.test(t)), JSON.stringify(gespr));
    // Ohne Verschiebe-Wunsch im Satz wird nie verschoben
    plan = { absicht: 'verschieben', schritte: [{ faehigkeit: 'erinnerung_verschieben', params: { zeit: '2026-11-12T20:00:00', suche: 'Wäsche' } }] };
    await A.lassLaufen(async () => { A.sb.jvTippen('Wie spät ist es in Tokio'); await warte(80); });
    await A.lassLaufen(async () => { await warte(80); });
    const w2 = rem.filter(x => x.text === 'Wäsche aufhängen' && !x.done);
    check('5 ohne Verschiebe-Wunsch wird nie verschoben, auch wenn der Plan es vorschlägt', w2.length === 1 && new A.sb.Date(w2[0].time).getHours() === 19, JSON.stringify(w2));
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
