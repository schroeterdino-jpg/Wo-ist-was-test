/* ============================================================
   AUSWERTUNG der Messläufe (C1). Rechnet nur: zählt, ordnet zu, schreibt den Bericht. Bewertet nichts
   (kein "doppelt", "zu viel", "unnötig", kein Vorschlag).
   ============================================================ */
'use strict';

const ZONE = 'Europe/Berlin';
const TAGE = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const uhrzeit = ms => new Date(ms).toLocaleTimeString('de-DE', { timeZone: ZONE, hour: '2-digit', minute: '2-digit', second: '2-digit' });
const tag = ms => TAGE[new Date(new Date(ms).toLocaleString('en-US', { timeZone: ZONE })).getDay()];
const stunde = ms => parseInt(new Date(ms).toLocaleString('de-DE', { timeZone: ZONE, hour: 'numeric', hour12: false }), 10) % 24;
const wann = (ms, mitTag) => (mitTag ? tag(ms) + ' ' : '') + uhrzeit(ms);
const sek = ms => Math.round(ms / 1000);
const min = a => a.length ? Math.min(...a) : null;
const max = a => a.length ? Math.max(...a) : null;
const median = a => { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
const zelle = s => String(s == null ? '' : s).replace(/\|/g, '/').replace(/\n/g, ' ');
const dauer = s => s === null || s === undefined ? '-' : (s >= 3600 ? Math.floor(s / 3600) + ' h ' + Math.round((s % 3600) / 60) + ' min' : s >= 120 ? Math.round(s / 60) + ' min' : s + ' s');

/* Ordnet jede Sprachausgabe der Attrappe einem Eintrag zu (gleicher Textanfang, höchstens 10 s Abstand). Gibt { sprechen[], zuordnung: Map(eintrag.nr -> sprechenEreignis) } */
function zuordnen(M) {
    const liste = M.sb.jvMeldungen ? M.sb.jvMeldungen.liste() : [];
    const sprechen = M.ereignisse.filter(e => e.art === 'sprechen');
    const benutzt = new Set(), zu = new Map();
    for (const ei of liste) {
        if (ei.status !== 'ausgegeben' || !ei.kanal.includes('sprache') || !ei.text) continue;
        const k = ei.text.slice(0, 25);
        const s = sprechen.find(x => !benutzt.has(x) && String(x.text).replace(/\s+/g, ' ').trim().startsWith(k) && x.ms >= ei.zeit - 1000 && x.ms - ei.zeit <= 10000);
        if (s) { benutzt.add(s); zu.set(ei.nr, s); }
    }
    return { liste, sprechen, zuordnung: zu, ohneEintrag: sprechen.filter(x => !benutzt.has(x)) };
}

/* Ruhezeit nach der App-Regel (wachterQuiet) und nach fester Regel 22 bis 7 Uhr; die Uhr der Attrappe wird kurz auf den Zeitpunkt gestellt */
function ruhezeitOb(M, ms) {
    const alt = M.uhr.ms; let app = null;
    try { M.uhr.ms = ms; app = typeof M.sb.wachterQuiet === 'function' ? !!M.sb.wachterQuiet() : null; } catch (e) { app = null; } finally { M.uhr.ms = alt; }
    const h = stunde(ms);
    return { app, fest: h >= 22 || h < 7 };
}

function analyse(M) {
    const z = zuordnen(M);
    const liste = z.liste;
    const aus = liste.filter(e => e.status === 'ausgegeben');
    const ausgeloest = liste.filter(e => e.status === 'ausgeloest');
    const r = { M, def: M.def, liste, aus, ausgeloest, zuordnung: z.zuordnung, ohneEintrag: z.ohneEintrag, sprechen: z.sprechen };
    /* Abstände zwischen aufeinanderfolgenden Ausgaben */
    r.abstaende = aus.slice(1).map((e, i) => ({ von: aus[i], zu: e, ms: e.zeit - aus[i].zeit }));
    const sp = aus.filter(e => e.kanal.includes('sprache'));
    r.abstaendeSprache = sp.slice(1).map((e, i) => ({ von: sp[i], zu: e, ms: e.zeit - sp[i].zeit }));
    /* gleiche Bezüge */
    const gruppen = new Map();
    for (const e of aus) { if (!e.bezug) continue; const k = e.bezug.art + ': ' + e.bezug.schluessel; if (!gruppen.has(k)) gruppen.set(k, []); gruppen.get(k).push(e); }
    r.bezuege = [...gruppen].filter(([, a]) => a.length >= 2).map(([k, a]) => ({ k, a, quellen: [...new Set(a.map(e => e.quelle))], texte: [...new Set(a.map(e => e.text))] }));
    /* identische Texte */
    const texte = new Map();
    for (const e of aus) { if (!e.text) continue; if (!texte.has(e.text)) texte.set(e.text, []); texte.get(e.text).push(e); }
    r.identisch = [...texte].filter(([, a]) => a.length >= 2).map(([t, a]) => ({ t, a }));
    /* Sprachausgaben, die während einer anderen liefen (die Attrappe stellt sie hintereinander: Wartezeit bis zum Ende der vorigen) */
    const sz = M.sprechzeiten || [];
    r.waehrend = [];
    for (let i = 1; i < sz.length; i++) {
        const s = sz[i], vor = sz.slice(0, i).filter(x => x.bis > s.ms).sort((a, b) => b.bis - a.bis)[0];
        if (vor) r.waehrend.push({ s, vor, wartet: vor.bis - s.ms });
    }
    const quelleZuSprechen = (s) => { const nr = [...z.zuordnung].find(([, x]) => x.text === s.text && x.ms === s.ms); return nr ? liste.find(e => e.nr === nr[0]) : null; };
    r.waehrend.forEach(w => { w.eintrag = quelleZuSprechen(w.s); w.voriger = quelleZuSprechen(w.vor); });
    /* Ausgaben kurz nach einer anderen Ausgabe (60 s) */
    r.binnen60 = r.abstaende.filter(a => a.ms <= 60000);
    /* Ruhezeiten */
    r.ruhe = aus.map(e => Object.assign({ e }, ruhezeitOb(M, e.zeit)));
    /* zane_redet */
    const zr = aus.filter(e => e.quelle === 'zane_redet');
    const mikroAufrufe = M.mikro || [];
    const sprechenZr = zr.map(e => z.zuordnung.get(e.nr)).filter(Boolean);
    r.zane = {
        eintraege: zr,
        abstaende: zr.slice(1).map((e, i) => sek(e.zeit - zr[i].zeit)),
        texte: [...new Set(zr.map(e => e.text))],
        wiederholt: [...zr.reduce((m, e) => m.set(e.text, (m.get(e.text) || 0) + 1), new Map())].filter(([, n]) => n > 1),
        fragen: zr.filter(e => e.frage).length,
        mikroModul: zr.filter(e => e.mikro === 'ja').length,
        mikroGeoeffnet: zr.filter(e => {
            const s = z.zuordnung.get(e.nr); if (!s) return false;
            const ende = (M.sprechzeiten.find(x => x.ms === s.ms && x.text === s.text) || {}).bis || s.ms;
            return mikroAufrufe.some(t => t >= ende && t - ende <= 5000);
        }).length,
        proStunde: zr.reduce((m, e) => { const h = stunde(e.zeit); m[h] = (m[h] || 0) + 1; return m; }, {})
    };
    return r;
}

const ueberschriftTabelle = (k) => '| ' + k.join(' | ') + ' |\n|' + k.map(() => '---').join('|') + '|';

function berichtLauf(r, nr, quellen, hilfe) {
    const mt = r.def.nachtlauf; const W = ms => wann(ms, mt);
    const z = [];
    const lauf = r.def;
    z.push(`## ${nr}. ${lauf.name}\n`);
    z.push(`Ausgaben (Status "ausgegeben"): **${r.aus.length}**. Ausgelöste Vorgänge ohne eigene Ausgabe (Status "ausgeloest"): **${r.ausgeloest.length}**.\n`);

    /* 1 je Quelle */
    z.push(`### ${nr}.1 Anzahl je Quelle\n`);
    z.push(ueberschriftTabelle(['Quelle', 'ausgeloest', 'ausgegeben', 'davon mit Sprache', 'davon mit Karte/Fenster/Hinweis']));
    for (const q of quellen) {
        const a = r.aus.filter(e => e.quelle === q), l = r.ausgeloest.filter(e => e.quelle === q);
        z.push(`| ${q}${hilfe.includes(q) ? ' (spricht das angestoßene Briefing)' : ''} | ${l.length} | ${a.length} | ${a.filter(e => e.kanal.includes('sprache')).length} | ${a.filter(e => e.kanal.some(k => k !== 'sprache')).length} |`);
    }
    z.push('\n### ' + nr + '.2 Anzahl je Kanal\n');
    const kan = {}; r.aus.forEach(e => e.kanal.forEach(k => { kan[k] = (kan[k] || 0) + 1; }));
    z.push(ueberschriftTabelle(['Kanal', 'Ausgaben (eine Ausgabe mit mehreren Kanälen zählt bei jedem Kanal)']));
    Object.keys(kan).sort().forEach(k => z.push(`| ${k} | ${kan[k]} |`));
    const ausl = {}; r.aus.forEach(e => { ausl[e.ausloeser] = (ausl[e.ausloeser] || 0) + 1; });
    z.push('\nAuslöser: ' + Object.keys(ausl).sort().map(k => k + ' ' + ausl[k]).join(', ') + '.\n');

    /* 3 Abstände */
    z.push(`### ${nr}.3 Zeitliche Abstände zwischen Ausgaben\n`);
    const ab = r.abstaende.map(a => sek(a.ms)), abs = r.abstaendeSprache.map(a => sek(a.ms));
    z.push(`- Alle Ausgaben (${r.aus.length}): kleinster Abstand ${dauer(min(ab))}, Mittelwert (Median) ${dauer(median(ab))}, größter ${dauer(max(ab))}.`);
    z.push(`- Nur Ausgaben mit Sprache (${r.aus.filter(e => e.kanal.includes('sprache')).length}): kleinster ${dauer(min(abs))}, Median ${dauer(median(abs))}, größter ${dauer(max(abs))}.`);
    z.push(`- Ausgaben höchstens 60 s nach der vorigen Ausgabe: ${r.binnen60.length}.\n`);
    z.push('Die zehn kleinsten Abstände:\n');
    z.push(ueberschriftTabelle(['Abstand', 'vorige Ausgabe', 'nächste Ausgabe']));
    r.abstaende.slice().sort((a, b) => a.ms - b.ms).slice(0, 10).forEach(a => z.push(`| ${dauer(sek(a.ms))} | ${W(a.von.zeit)} ${a.von.quelle} (${a.von.grund}) | ${W(a.zu.zeit)} ${a.zu.quelle} (${a.zu.grund}) |`));
    z.push('\nAbstände je Quelle (zwischen zwei Ausgaben derselben Quelle):\n');
    z.push(ueberschriftTabelle(['Quelle', 'Ausgaben', 'kleinster Abstand', 'Median', 'größter']));
    for (const q of quellen) {
        const a = r.aus.filter(e => e.quelle === q); if (a.length < 2) continue;
        const d = a.slice(1).map((e, i) => sek(e.zeit - a[i].zeit));
        z.push(`| ${q} | ${a.length} | ${dauer(min(d))} | ${dauer(median(d))} | ${dauer(max(d))} |`);
    }

    /* 4 gleiche Bezüge */
    z.push(`\n### ${nr}.4 Ausgaben mit demselben Ereignis-Bezug\n`);
    if (!r.bezuege.length) z.push('Keine.\n');
    r.bezuege.forEach(b => {
        z.push(`**${zelle(b.k)}** (Herkunft ${[...new Set(b.a.map(e => e.bezug.herkunft))].join('/')}): ${b.a.length} Ausgaben von ${b.quellen.length} Quelle(n) (${b.quellen.join(', ')}), ${b.texte.length} verschiedene Text(e).`);
        b.a.forEach((e, i) => z.push(`- ${W(e.zeit)} | ${e.quelle} | ${e.kanal.join('+')} | ${e.grund} | Abstand zur vorigen: ${i ? dauer(sek(e.zeit - b.a[i - 1].zeit)) : '-'} | „${zelle(e.text)}“`));
        z.push('');
    });
    const versch = r.bezuege.filter(b => b.texte.length > 1);
    z.push(`Bezüge, zu denen es mehr als einen verschiedenen Text gab: ${versch.length} von ${r.bezuege.length}.`);
    const gleichTextBezug = r.bezuege.filter(b => b.texte.length < b.a.length);
    z.push(`Bezüge, in denen derselbe Text mehrfach vorkam: ${gleichTextBezug.length}.\n`);

    /* 5 identische Texte */
    z.push(`### ${nr}.5 Identische Texte\n`);
    if (!r.identisch.length) z.push('Keine Ausgabe-Texte (erste 80 Zeichen) kamen mehrfach vor.\n');
    else {
        z.push(ueberschriftTabelle(['Text (80 Zeichen)', 'Anzahl', 'Quellen', 'Uhrzeiten']));
        r.identisch.sort((a, b) => b.a.length - a.a.length).forEach(i => z.push(`| ${zelle(i.t)} | ${i.a.length} | ${[...new Set(i.a.map(e => e.quelle))].join(', ')} | ${i.a.map(e => W(e.zeit)).join(', ')} |`));
        z.push('');
    }

    /* 6 während anderer */
    z.push(`### ${nr}.6 Meldungen während anderer Meldungen\n`);
    z.push(`Die Sprachausgabe der Attrappe dauert so lang wie echte Sprache (14 Zeichen pro Sekunde, mindestens 1,5 s) und meldet in dieser Zeit isSpeaking() = true. Hier gezählt: Sprachausgaben, die angefordert wurden, während noch eine andere lief (die Attrappe stellt sie dahinter).\n`);
    z.push(`Anzahl: **${r.waehrend.length}** von ${(r.M.sprechzeiten || []).length} Sprachausgaben.\n`);
    if (r.waehrend.length) {
        z.push(ueberschriftTabelle(['Angefordert', 'Quelle (Eintrag)', 'lief noch', 'Wartezeit']));
        r.waehrend.forEach(w => z.push(`| ${W(w.s.ms)} | ${w.eintrag ? w.eintrag.quelle + ' (' + w.eintrag.grund + ')' : 'ohne Eintrag: „' + zelle(w.s.text.slice(0, 40)) + '“'} | ${w.voriger ? w.voriger.quelle + ' (' + w.voriger.grund + ')' : 'ohne Eintrag: „' + zelle(w.vor.text.slice(0, 40)) + '“'} | ${dauer(sek(w.wartet))} |`));
        z.push('');
    }

    /* 7 Ruhezeiten */
    z.push(`### ${nr}.7 Ausgaben während Ruhezeiten\n`);
    z.push('Ruhezeit nach der App-Regel: das Ergebnis von wachterQuiet() zu dem Zeitpunkt (22 bis 7 Uhr; in Frühschicht-Wochen ab 21:30 bis zur Briefing-Zeit). Feste Regel: 22 bis 7 Uhr.\n');
    const rApp = r.ruhe.filter(x => x.app), rFest = r.ruhe.filter(x => x.fest);
    z.push(`Ausgaben in der Ruhezeit nach App-Regel: **${rApp.length}**; nach fester Regel 22 bis 7 Uhr: **${rFest.length}**.\n`);
    if (rApp.length || rFest.length) {
        z.push(ueberschriftTabelle(['Uhrzeit', 'Quelle', 'Kanal', 'Grund', 'App-Regel', 'feste Regel 22-7']));
        r.ruhe.filter(x => x.app || x.fest).forEach(x => z.push(`| ${W(x.e.zeit)} | ${x.e.quelle} | ${x.e.kanal.join('+')} | ${x.e.grund} | ${x.app ? 'Ruhezeit' : 'nein'} | ${x.fest ? 'Ruhezeit' : 'nein'} |`));
        z.push('');
        const je = {}; r.ruhe.filter(x => x.app || x.fest).forEach(x => { je[x.e.quelle] = (je[x.e.quelle] || 0) + 1; });
        z.push('Je Quelle: ' + Object.keys(je).sort().map(k => k + ' ' + je[k]).join(', ') + '.\n');
    }

    /* 8 ausgeloest vs ausgegeben */
    z.push(`### ${nr}.8 Ausgelöste Vorgänge gegenüber tatsächlichen Ausgaben\n`);
    if (!r.ausgeloest.length) z.push('Keine ausgelösten Vorgänge ohne eigene Ausgabe.\n');
    r.ausgeloest.forEach(a => {
        const folge = r.aus.filter(e => e.zeit >= a.zeit && e.zeit - a.zeit <= 180000 && e.bezug && a.bezug && e.bezug.schluessel === a.bezug.schluessel && e.grund !== a.grund && (a.grund === 'schicht-briefing' ? e.quelle === 'briefing' : e.quelle === a.quelle));
        z.push(`- ${W(a.zeit)} ${a.quelle} stößt „${a.grund}“ an (${a.ausloeser}) → ${folge.length ? folge.map(e => W(e.zeit) + ' ' + e.quelle + ' (' + e.grund + ', ' + e.ausloeser + ', ' + e.kanal.join('+') + '), nach ' + dauer(sek(e.zeit - a.zeit))).join('; ') : 'bis zum Ende des Messlaufs keine zugehörige Ausgabe'}`);
    });
    const brief = r.aus.filter(e => e.grund === 'tagesbriefing').length, briefSpr = r.sprechen.filter(s => /^(Guten (Tag|Morgen|Abend)|Hallo), \w+\. Es ist \d/.test(s.text)).length;
    z.push(`\nGezählte Nutzer-Ausgaben des Tagesbriefings: ${brief}; tatsächlich gesprochene Briefings (Textanfang „Guten Tag/Morgen, <Name>. Es ist …“): ${briefSpr}.\n`);
    return z;
}

function berichtZane(r, nr) {
    const mt = r.def.nachtlauf; const W = ms => wann(ms, mt);
    const q = r.zane, z = [];
    z.push(`### ${nr} zane_redet im Lauf „${r.def.name}“\n`);
    z.push(`- Meldungen: **${q.eintraege.length}**.`);
    z.push(`- Abstände zwischen zwei Meldungen: kleinster ${dauer(min(q.abstaende))}, Median ${dauer(median(q.abstaende))}, größter ${dauer(max(q.abstaende))}.`);
    z.push(`- Verschiedene Texte: ${q.texte.length}; Texte, die mehr als einmal kamen: ${q.wiederholt.length}${q.wiederholt.length ? ' (' + q.wiederholt.map(([t, n]) => '„' + zelle(t) + '“ ' + n + '×').join('; ') + ')' : ''}.`);
    z.push(`- Fragen darunter: ${q.fragen}. Das Modul fordert nach der Frage selbst zum Zuhören auf (startListening als Rückruf): ${q.mikroModul}. Tatsächlicher Aufruf von startListening innerhalb von 5 s nach Ende der Sprachausgabe: ${q.mikroGeoeffnet}.`);
    const std = Object.keys(q.proStunde).map(Number).sort((a, b) => a - b);
    z.push('- Verteilung nach Uhrzeit (Stunde: Anzahl): ' + (std.length ? std.map(h => h + ': ' + q.proStunde[h]).join(', ') : 'keine') + '.');
    if (q.eintraege.length) {
        z.push('\n' + ueberschriftTabelle(['Uhrzeit', 'Abstand zur vorigen', 'Frage', 'Mikrofon-Aufruf durch Modul', 'Text']));
        q.eintraege.forEach((e, i) => z.push(`| ${W(e.zeit)} | ${i ? dauer(sek(e.zeit - q.eintraege[i - 1].zeit)) : '-'} | ${e.frage ? 'ja' : 'nein'} | ${e.mikro} | ${zelle(e.text)} |`));
    }
    z.push('');
    return z;
}

function anhang(r, nr) {
    const mt = r.def.nachtlauf; const W = ms => wann(ms, mt);
    const z = [`### ${nr} Alle Einträge in zeitlicher Reihenfolge („${r.def.name}“)\n`];
    z.push(ueberschriftTabelle(['Nr', 'Uhrzeit', 'Quelle', 'Status', 'Kanal', 'Grund', 'Auslöser', 'Frage', 'Mikro', 'Bezug', 'Text (80 Zeichen)']));
    r.liste.forEach(e => z.push(`| ${e.nr} | ${W(e.zeit)} | ${e.quelle} | ${e.status} | ${e.kanal.join('+') || '-'} | ${e.grund} | ${e.ausloeser} | ${e.frage ? 'ja' : ''} | ${e.mikro === 'nein' ? '' : e.mikro} | ${e.bezug ? zelle(e.bezug.art + ': ' + e.bezug.schluessel + ' (' + e.bezug.herkunft + ')') : ''} | ${zelle(e.text)} |`));
    z.push('');
    z.push(`Sprachausgaben ohne zugehörigen Eintrag (Antworten auf Sätze des Nutzers, Dialog-Folgen, andere Module): ${r.ohneEintrag.length}\n`);
    if (r.ohneEintrag.length) {
        z.push(ueberschriftTabelle(['Uhrzeit', 'Text (60 Zeichen)']));
        r.ohneEintrag.forEach(s => z.push(`| ${W(s.ms)} | ${zelle(String(s.text).slice(0, 60))} |`));
        z.push('');
    }
    return z;
}

function bericht(laeufe, quellen, hilfe) {
    const z = [];
    z.push('# C1 Gesamtbericht der Messung (alle instrumentierten App-Meldungsquellen)\n');
    z.push('Nur Messwerte. Kein Urteil, keine Regel, kein Vorschlag. Alle Zahlen stammen aus simulierten Läufen mit festen Attrappen für Netz, Handy-Brücke und Standort (siehe `tests/meldungen_welt.js`), nicht aus echtem Betrieb.\n');
    z.push('## Annahmen und Grenzen der Messung\n');
    z.push('- Die App ist in beiden Läufen die ganze Zeit offen und sichtbar. Das ist der ungünstigste Fall; in der Praxis läuft nachts vieles nur über die Handy-App oder als Push.');
    z.push('- Server-Push (api/sync.js) ist nicht gemessen und nicht verändert.');
    z.push('- Eine Ausgabe ist ein Eintrag mit Status „ausgegeben“: Sprache, Karte, Fenster oder Hinweis wurde für den Nutzer ausgelöst. „ausgeloest“ heißt: ein Modul stößt nur einen Vorgang an, dessen Ausgabe woanders entsteht (schicht.js und plan_ansagen „brief“ stoßen das Briefing an, gesprochen wird es in briefing.js; jarvis.js legt die Start-Ansage bereit, gesprochen wird sie erst beim ersten Tipp).');
    z.push('- Die Sprachausgabe der Attrappe dauert 14 Zeichen pro Sekunde (mindestens 1,5 s); in dieser Zeit meldet isSpeaking() = true, wie in der App. Dadurch warten Quellen, die isSpeaking() prüfen, so wie in der App.');
    z.push('- Fest angenommene Nutzer-Handlungen im Lauf (damit Quellen, die auf eine Antwort warten, weiterlaufen): Antworten „Nein“ auf die Mail-Fragen (nur Nachmittag), ein Tipp auf den Bildschirm für die Start-Ansage, WhatsApp-Nachricht, Warn-Push, Supermarkt-Meldung der Handy-App. Auslöser von außen (Push, Handy-Brücke) sind direkte Aufrufe der Empfangsstellen.');
    z.push('- Der Text jeder Ausgabe ist auf 80 Zeichen gekürzt; Ereignis-Bezüge nutzen echte IDs (Termin, Mail, Paket, Auftrag, Nachricht …) und fallen nur ohne ID auf Text und Zeit zurück.');
    z.push('- Die Kennenlern-Frage und zane_redet verwenden in der Simulation die Rückfall-Sätze ohne KI (die KI-Attrappe liefert für sie nichts); die Zahl der Meldungen hängt von Zufall und Stufen ab (Zufallszahl hier fest).');
    z.push('- Ruhezeit-Regeln wie ruhe.js (Briefing läuft gerade) sind nicht einzeln ausgewertet.\n');

    /* Überblick beide Läufe */
    z.push('## Überblick\n');
    z.push(ueberschriftTabelle(['Quelle'].concat(laeufe.map(r => r.def.name + ': ausgegeben (ausgeloest)')).concat(['Kanäle (beide Läufe)'])));
    for (const q of quellen) {
        const sp = laeufe.map(r => `${r.aus.filter(e => e.quelle === q).length} (${r.ausgeloest.filter(e => e.quelle === q).length})`);
        const k = new Set(); laeufe.forEach(r => r.aus.filter(e => e.quelle === q).forEach(e => e.kanal.forEach(x => k.add(x))));
        z.push(`| ${q} | ${sp.join(' | ')} | ${[...k].sort().join(', ') || '-'} |`);
    }
    z.push(`| **Summe** | ${laeufe.map(r => `**${r.aus.length}** (${r.ausgeloest.length})`).join(' | ')} | |`);
    z.push('');
    let nr = 1;
    for (const r of laeufe) { berichtLauf(r, nr, quellen, hilfe).forEach(x => z.push(x)); nr++; }
    z.push(`## ${nr}. zane_redet (nur gemessen)\n`);
    laeufe.forEach((r, i) => berichtZane(r, nr + '.' + (i + 1)).forEach(x => z.push(x)));
    nr++;
    z.push(`## ${nr}. Anhang: alle Einträge\n`);
    laeufe.forEach((r, i) => anhang(r, nr + '.' + (i + 1)).forEach(x => z.push(x)));
    return z.join('\n') + '\n';
}

module.exports = { zuordnen, analyse, bericht, ruhezeitOb, uhrzeit };
