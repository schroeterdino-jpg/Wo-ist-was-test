/* Bericht zu den Shadow-Regeln: Soll gegen Ist auf den beiden Messläufen. Nur Messwerte, keine Bewertung. */
'use strict';
const hm = ms => new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace('.,', '');
const NAME = { tag: 'Nachmittag (Mi 28.10.2026, 12:00 bis 15:10)', nacht: 'Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00)' };
const L = { zugelassen: 'zugelassen', spaeter: 'später', nur_stiller_kanal: 'nur stiller Kanal', unklar: 'unklar' };
const zaehle = (liste, f) => { const o = {}; liste.forEach(x => { const k = f(x); o[k] = (o[k] || 0) + 1; }); return o; };
const n = (o, k) => (o && o[k]) || 0;

function bericht(vergleich, ruhezeitOb) {
    let t = '# Shadow-Regeln: Soll gegen Ist auf den beiden Messläufen\n\n';
    t += 'Nur Messwerte. Die Shadow-Logik (`js/meldungs_regeln.js`) hat in beiden Läufen mitgerechnet; die tatsächlichen Ausgaben sind in allen Varianten identisch (Test „Shadow an / aus / Datei fehlt / wirft Fehler“). Alle Zahlen stammen aus simulierten Läufen mit Attrappen, nicht aus dem echten Betrieb. „Später“ heißt nur: *Diese Meldung wäre zu diesem Zeitpunkt nicht ausgegeben worden.* Es wird nichts nachgeliefert.\n\n';
    t += '## 1. Soll gegen Ist\n\n';
    t += '„Soll“ ist der unabhängig geschriebene Entwurf (`tests/regeln_entwurf.js`), „Ist“ die eingebaute Logik. Verglichen werden je Ausgabe Entscheidung, Stufe, Merker und Mikrofon-Absicht.\n\n';
    t += '| Lauf | Ausgaben | Soll = Ist | Abweichungen |\n|---|---|---|---|\n';
    vergleich.forEach(v => { t += `| ${NAME[v.art]} | ${v.ist.length} | ${v.ist.length - v.abw.length} | ${v.abw.length} |\n`; });
    vergleich.forEach(v => v.abw.forEach(a => { t += `\nAbweichung ${v.art} Nr. ${a.nr} (${a.quelle}): Soll ${a.soll}; Ist ${a.ist}\n`; }));
    t += '\n## 2. Ergebnis der eingebauten Logik\n\n';
    t += '| | ' + vergleich.map(v => NAME[v.art]).join(' | ') + ' |\n|---|---|---|\n';
    const Z = vergleich.map(v => zaehle(v.ist, d => d.entscheid));
    ['zugelassen', 'spaeter', 'nur_stiller_kanal', 'unklar'].forEach(k => { t += `| ${L[k]} | ${Z.map(z => n(z, k)).join(' | ')} |\n`; });
    t += '| Ausgaben gesamt | ' + vergleich.map(v => v.ist.length).join(' | ') + ' |\n';
    t += '| ausgelöste Vorgänge (nicht entschieden) | ' + vergleich.map(v => v.M.sb.jvRegeln.ausgeloest()).join(' | ') + ' |\n';
    t += '\nNach Stufe und Entscheidung:\n\n| Stufe / Entscheidung | ' + vergleich.map(v => NAME[v.art]).join(' | ') + ' |\n|---|---|---|\n';
    const ks = new Set(); vergleich.forEach(v => v.ist.forEach(d => ks.add((d.prio || '-') + ' / ' + L[d.entscheid])));
    [...ks].sort().forEach(k => { t += `| ${k} | ${vergleich.map(v => n(zaehle(v.ist, d => (d.prio || '-') + ' / ' + L[d.entscheid]), k)).join(' | ')} |\n`; });
    t += '\nMerker (ändern nichts; eine Ausgabe kann mehrere haben):\n\n| Merker | ' + vergleich.map(v => NAME[v.art]).join(' | ') + ' |\n|---|---|---|\n';
    const ms = new Set(); vergleich.forEach(v => v.ist.forEach(d => d.merker.forEach(m => ms.add(m))));
    [...ms].sort().forEach(m => { t += `| ${m} | ${vergleich.map(v => v.ist.filter(d => d.merker.includes(m)).length).join(' | ')} |\n`; });
    t += '\nZahl der Ausgaben je Regel, die die Entscheidung bestimmt hat:\n\n| Regel | ' + vergleich.map(v => NAME[v.art]).join(' | ') + ' |\n|---|---|---|\n';
    const rs = new Set(); vergleich.forEach(v => v.ist.forEach(d => rs.add(d.regel)));
    [...rs].sort().forEach(r => { t += `| ${r} | ${vergleich.map(v => v.ist.filter(d => d.regel === r).length).join(' | ')} |\n`; });

    t += '\n## 3. Bewusst gesetzte Erinnerungen und Fristen\n\n';
    vergleich.forEach(v => {
        t += `**${NAME[v.art]}**\n\n`;
        const e = v.ist.filter(d => d.bewusstGesetzt || d.quelle === 'fristen');
        if (!e.length) { t += '(keine)\n\n'; return; }
        t += '| Uhrzeit | Quelle / Grund | Stufe | Entscheidung | Merker | Kanalschutz (nur Datenmodell) |\n|---|---|---|---|---|---|\n';
        e.forEach(d => { t += `| ${hm(d.zeit)} | ${d.quelle} / ${d.grund} | ${d.prio} | ${L[d.entscheid]} | ${d.merker.join(', ') || '-'} | ${d.kanalSchutz ? 'behalte ' + d.kanalSchutz.behalteKanal.join('+') + ', Sprache nicht Pflicht' : '-'} |\n`; });
        t += '\n';
    });

    t += '## 4. Nachlieferbarkeit und Verfall (nur Rechnung)\n\n';
    t += 'Getrennt von der Entscheidung: Jede zurückgestellte Meldung hat Nachlieferbarkeit und Verfallszeit je Meldungsart. NIEDRIG verfällt sofort. Die Vorschau zeigt für das Ende der Ruhephase, was nachlieferbar wäre, wenn man es täte (höchstens 2 gesprochen, Rest als eine stille Sammelkarte, Abgelaufenes verfallen). Im Shadow-Modus passiert nichts davon.\n\n';
    vergleich.forEach(v => {
        const zur = v.ist.filter(d => d.entscheid === 'spaeter' || d.entscheid === 'nur_stiller_kanal');
        t += `**${NAME[v.art]}**: ${zur.length} zurückgestellt oder nur still; davon NIEDRIG (nicht nachlieferbar) ${zur.filter(d => d.prio === 'NIEDRIG').length}, nachlieferbar ${zur.filter(d => d.nachlieferung.moeglich).length}.\n\n`;
        if (v.art === 'nacht') {
            const norm = zur.filter(d => d.prio !== 'NIEDRIG');
            const ende = new Date('2026-11-02T03:30:00+01:00').getTime();
            const vor = v.M.sb.jvRegeln.nachliefervorschau(ende);
            const nach = new Set(norm.map(d => d.nr));
            t += 'Zurückgestellte Meldungen der Nacht (ohne NIEDRIG):\n\n| Uhrzeit | Quelle / Grund | Entscheidung | nachlieferbar | Verfall nach | Verfallszeit |\n|---|---|---|---|---|---|\n';
            norm.forEach(d => { t += `| ${hm(d.zeit)} | ${d.quelle} / ${d.grund} | ${L[d.entscheid]} | ${d.nachlieferung.moeglich ? 'ja' : 'nein'} | ${d.nachlieferung.verfallMin} min | ${d.nachlieferung.verfallZeit ? hm(d.nachlieferung.verfallZeit) : '-'} |\n`; });
            const nr = x => (v.ist.find(d => d.nr === x) || {}).quelle + ' ' + hm((v.ist.find(d => d.nr === x) || {}).zeit);
            t += `\nVorschau am Ende der Ruhephase (${hm(ende)}): gesprochen höchstens 2: ${vor.sprache.map(nr).join('; ') || '-'}; stille Sammelkarte: ${vor.sammelkarte.map(nr).join('; ') || '-'}; verfallen: ${vor.verfallen.map(nr).join('; ') || '-'}; verworfen (NIEDRIG oder Doppelte): ${vor.verworfen.length}.\n\n`;
        }
    });

    t += '## 5. zane_redet (nur gemessen)\n\n| Lauf | Meldungen | zugelassen | später | Gründe der Zurückstellung | Mikrofon: wie bisher / nicht automatisch |\n|---|---|---|---|---|---|\n';
    vergleich.forEach(v => {
        const z = v.ist.filter(d => d.quelle === 'zane_redet');
        const gr = zaehle(z.filter(d => d.entscheid === 'spaeter'), d => d.regel);
        t += `| ${NAME[v.art]} | ${z.length} | ${z.filter(d => d.entscheid === 'zugelassen').length} | ${z.filter(d => d.entscheid === 'spaeter').length} | ${Object.keys(gr).map(k => k + ' ' + gr[k]).join(', ')} | ${z.filter(d => d.mikro === 'wie_bisher').length} / ${z.filter(d => d.mikro === 'nicht_automatisch').length} |\n`;
    });

    t += '\n## 6. Alle Entscheidungen\n';
    vergleich.forEach(v => {
        t += `\n### ${NAME[v.art]}\n\n| Uhrzeit | Quelle / Grund | Stufe | Entscheidung | Regel | Merker | Mikro | Warum |\n|---|---|---|---|---|---|---|---|\n`;
        v.ist.forEach(d => { t += `| ${hm(d.zeit)} | ${d.quelle} / ${d.grund} | ${d.prio || '-'} | ${L[d.entscheid]} | ${d.regel} | ${d.merker.join(', ') || '-'} | ${d.mikro} | ${d.warum}${d.mit ? ' (zusammen mit ' + d.mit.join(', ') + ')' : ''} |\n`; });
    });
    return t;
}
module.exports = { bericht };
