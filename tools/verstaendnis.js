/* ============================================================
   VERSTÄNDNIS-CHECK: spielt rund 1000 Sätze (tools/verstaendnis_saetze.js) durch die festen Sprachbefehle der App und zählt:
     - lokal richtig  : ein passender fester Befehl hat den Satz beantwortet
     - an die KI      : kein fester Befehl hat zugegriffen; Chef-KI / KI entscheidet (hier nicht messbar, weil kein Netz)
     - Fehlgriff      : ein fester Befehl aus einem ANDEREN Bereich hat den Satz abgefangen (falsche Antwort ist so gut wie sicher)
   Start: node tools/verstaendnis.js            (Bericht auf dem Bildschirm; mit --alle auch jede Zeile; --json Datei schreiben)
   Ändert nichts an der App. Offline, die KI ist eine Attrappe.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('../tests/umgebung.js');
const BEREICHE = require('./verstaendnis_saetze.js');
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
const VOR_F = ['', 'Sag mal, ', 'Kannst du mir sagen, ', 'Jarvis, ', 'Ich wollte mal wissen: '];
const VOR_B = ['', 'Bitte ', 'Jarvis, ', 'Hey Jarvis, '];
const VOR_G = ['', 'Jarvis, '];
function saetze() {
    const out = [], seen = new Set();
    const add = (bereich, t) => { const k = t.toLowerCase(); if (seen.has(k)) return; seen.add(k); out.push({ bereich, text: t }); };
    for (const [b, d] of Object.entries(BEREICHE)) {
        (d.f || []).forEach(s => VOR_F.forEach(v => add(b, v + (v ? lc(s) : s))));
        (d.b || []).forEach(s => VOR_B.forEach((v, i) => add(b, i === 0 ? s : v + lc(s))));
        (d.g || []).forEach(s => VOR_G.forEach(v => add(b, v + (v ? lc(s) : s))));
    }
    return out;
}
const ant = d => ({ ok: true, status: 200, json: async () => d });
(async () => {
    const alle = saetze(), erg = [];
    const t0 = Date.now();
    let A = null, n = 0;
    for (const s of alle) {
        if (!A || n++ % 12 === 0) { A = starte({ jetzt: '2026-11-11T10:00:00+01:00', festerZufall: true, spracherkennung: true, fetch: async () => ant({ choices: [{ message: { content: JSON.stringify({ reply: 'KI', actions: [] }) } }] }) }); try { A.sb.jvChef.aus(); } catch (e) { } }
        let r; try { r = await A.satz(s.text); } catch (e) { r = { lokal: false, fehler: String(e.message) }; }
        const ok = BEREICHE[s.bereich].ok, teile = r.lokal ? String(r.modul || '').split('+') : [];
        let klasse = 'an_ki';
        if (r.lokal) klasse = teile.some(m => ok.includes(m)) ? 'richtig' : 'fehlgriff';
        erg.push({ bereich: s.bereich, text: s.text, klasse, modul: r.modul || '', gesagt: (r.gesagt || []).join(' ').slice(0, 90) });
    }
    const z = k => erg.filter(e => e.klasse === k).length, G = erg.length;
    const pr = x => (100 * x / G).toFixed(1) + ' %';
    console.log('VERSTÄNDNIS-CHECK: ' + G + ' Sätze, ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    console.log('  lokal richtig beantwortet : ' + z('richtig') + '  (' + pr(z('richtig')) + ')');
    console.log('  an die KI / Chef-KI        : ' + z('an_ki') + '  (' + pr(z('an_ki')) + ')   <- hier entscheidet die KI, offline nicht messbar');
    console.log('  FEHLGRIFF (falscher Befehl): ' + z('fehlgriff') + '  (' + pr(z('fehlgriff')) + ')');
    console.log('\nJe Bereich (richtig / an KI / Fehlgriff):');
    for (const b of Object.keys(BEREICHE)) { const x = erg.filter(e => e.bereich === b); console.log('  ' + b.padEnd(12) + ' ' + String(x.length).padStart(3) + ' Sätze: ' + [ 'richtig', 'an_ki', 'fehlgriff' ].map(k => x.filter(e => e.klasse === k).length).join(' / ')); }
    const fg = erg.filter(e => e.klasse === 'fehlgriff');
    console.log('\nFehlgriffe (' + fg.length + '):');
    const gz = new Map(); fg.forEach(e => { const k = e.bereich + ' → ' + e.modul; gz.set(k, (gz.get(k) || []).concat(e)); });
    for (const [k, l] of gz) console.log('  ' + k + '  (' + l.length + 'x)  z. B. „' + l[0].text + '“ → ' + (l[0].gesagt || '(keine Antwort)'));
    if (process.argv.includes('--alle')) erg.forEach(e => console.log(e.klasse.padEnd(9) + ' ' + e.bereich.padEnd(11) + ' ' + e.modul.padEnd(28) + ' | ' + e.text + ' | ' + e.gesagt));
    if (process.argv.includes('--json')) require('fs').writeFileSync(process.argv[process.argv.indexOf('--json') + 1] || 'verstaendnis.json', JSON.stringify(erg, null, 1));
    process.exit(0);
})();
