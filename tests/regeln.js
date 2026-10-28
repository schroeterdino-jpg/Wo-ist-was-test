/* ============================================================
   TESTS für die Shadow-Regeln (C1c, js/meldungs_regeln.js). Start: node tests/regeln.js
   Bericht schreiben:  REGELN_BERICHT=tests/regeln-bericht.md node tests/regeln.js
   1) Pflicht: Shadow an / aus / Datei fehlt / wirft Fehler -> tatsächliche Ausgaben, Befehlskette, Speicher, Netz, Mikrofon, Zustand identisch
      (zwei Läufe: Nachmittag und Nacht; Vergleichsbasis ist "Datei fehlt" und "ohne jeden Beobachter").
   2) Einzelregeln mit eigenen Eingaben (Ereignis/Zweck/Stufe, Erinnerungs-IDs, bewusst gesetzt, Ruhephase je Stufe, Nutzeraktivität,
      Stunden-/Tageslimit, gleicher Text, mehrere Kanäle, Verfall, kein Sprachstau).
   3) Soll gegen Ist: die beiden Messläufe laufen mit der eingebauten Shadow-Logik ("Ist") und werden mit dem unabhängig geschriebenen
      Entwurf (tests/regeln_entwurf.js, "Soll") verglichen.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
const { laufen, LAEUFE } = require('./meldungen_welt.js');
const { ruhezeitOb } = require('./meldungen_auswertung.js');
const { soll } = require('./regeln_entwurf.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const MIN = 60000;

const schnappschuss = M => JSON.stringify({
    ausgaben: M.ereignisse.filter(e => e.art !== 'brücke').map(e => [e.zeit, e.ms, e.art, e.modul, e.text]),
    bruecke: M.ereignisse.filter(e => e.art === 'brücke').map(e => [e.zeit, e.modul, e.text]),
    gesagt: M.gesagt, kette: M.kette(), zustand: M.zustand(), speicher: M.store, netz: M.aufrufe, mikro: M.mikro, sprechzeiten: M.sprechzeiten
});
function unterschied(a, b) {
    const x = JSON.parse(a), y = JSON.parse(b);
    for (const k of Object.keys(x)) {
        if (JSON.stringify(x[k]) === JSON.stringify(y[k])) continue;
        if (Array.isArray(x[k])) { for (let i = 0; i < Math.max(x[k].length, y[k].length); i++) if (JSON.stringify(x[k][i]) !== JSON.stringify(y[k][i])) return k + '[' + i + ']: ' + JSON.stringify(x[k][i]).slice(0, 160) + '  <->  ' + JSON.stringify(y[k][i]).slice(0, 160); }
        for (const kk of Object.keys(Object.assign({}, x[k], y[k]))) if (JSON.stringify(x[k][kk]) !== JSON.stringify(y[k][kk])) return k + '.' + kk;
    }
    return 'unbekannt';
}

/* Kleine Welt für Einzelregeln: feste Uhr, steuerbare App-Ruhephase, Einträge direkt ins C1-Protokoll */
function welt(jetzt) {
    const A = starte({ jetzt: jetzt || '2026-11-03T10:00:00+01:00', sekundenTakt: true });
    let ruhe = false;
    A.sb.wachterQuiet = () => ruhe;
    const w = {
        A, R: () => A.sb.jvRegeln,
        ruhe: v => { ruhe = v; },
        plus: min => { A.uhr.ms += min * MIN; },
        spule: async min => { await A.vorspulen(min * MIN); },
        E: over => {
            A.sb.jvMeldungen.beobachte(Object.assign({ quelle: 'test', kanal: ['sprache'], grund: 'probe', ausloeser: 'timer', text: 'Text ' + Math.random() }, over));
            const l = A.sb.jvRegeln.liste(); return l[l.length - 1];
        }
    };
    return w;
}
const niedrig = (over) => Object.assign({ quelle: 'zane_redet', grund: 'redet-frage', kanal: ['sprache'], frage: true, mikro: 'ja' }, over);
const termin = id => ({ art: 'termin', schluessel: id, herkunft: 'id' });
const erinn = id => ({ art: 'erinnerung', schluessel: String(id), herkunft: 'id' });

(async () => {
    /* ===== 0. Einhängung ===== */
    {
        const html = lies('index.html');
        check('index.html lädt meldungs_regeln.js nach meldungen.js (mit Stempel)', /meldungen\.js\?v=[0-9a-f]{8}"><\/script>\s*<script src="\.\/js\/meldungs_regeln\.js\?v=[0-9a-f]{8}"><\/script>/.test(html));
        const q = lies('js/meldungs_regeln.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');   // ohne Kommentare
        check('Shadow-Datei: kein localStorage/sessionStorage/Netz/fetch', !/localStorage|sessionStorage|fetch\(|XMLHttpRequest|indexedDB/.test(q));
        check('Shadow-Datei: ruft keine Sprach-, Karten- oder Fensterfunktion auf', !/\b(speak|say|sayCard|card|startListening|appendChild|alert)\s*\(/.test(q));
        check('Shadow-Datei: berührt keinen bestehenden Schlüssel (jv_/nova_)', !/['"`](jv_|nova_)/.test(q));
        check('api/sync.js bleibt unberührt', !/jvRegeln|meldungs_regeln/.test(lies('api/sync.js')));
        const dateien = fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js') && f !== 'meldungs_regeln.js' && f !== 'meldungen.js');
        check('keine der Meldungsdateien (und keine andere) kennt die Shadow-Datei', dateien.every(f => !/jvRegeln|meldungs_regeln/.test(lies('js/' + f))));
        check('weckruf-src (APK) bleibt unberührt', !/jvRegeln|meldungs_regeln/.test(fs.readdirSync(path.join(ROOT, 'weckruf-src'), { recursive: true }).filter(f => /\.(java|kt|xml|gradle)$/.test(String(f))).map(f => lies('weckruf-src/' + f)).join('')));
    }

    /* ===== 1. Pflicht: tatsächliche Ausgabe identisch ===== */
    const laeufe = [];
    for (const art of ['tag', 'nacht']) {
        const mit = await laufen(art, {});
        const fehlt = await laufen(art, { ohneShadow: true });
        const aus = await laufen(art, { shadowAus: true });
        const kaputt = await laufen(art, { shadowKaputt: true });
        const ohneC1 = await laufen(art, { ohne: true });
        const s = { mit: schnappschuss(mit), fehlt: schnappschuss(fehlt), aus: schnappschuss(aus), kaputt: schnappschuss(kaputt), ohneC1: schnappschuss(ohneC1) };
        check(art + ': Simulation läuft und hat viele Ausgaben', mit.ereignisse.filter(e => e.art === 'sprechen').length >= 20);
        check(art + ': Shadow AN = Shadow-Datei FEHLT (Sprache, Karten, Fenster, Kette, Speicher, Netz, Mikrofon, Zustand)', s.mit === s.fehlt, s.mit === s.fehlt ? '' : unterschied(s.mit, s.fehlt));
        check(art + ': Shadow AUS = Shadow-Datei FEHLT', s.aus === s.fehlt, s.aus === s.fehlt ? '' : unterschied(s.aus, s.fehlt));
        check(art + ': Shadow WIRFT FEHLER (alle Methoden und ein zweiter Mitleser werfen) = Shadow-Datei FEHLT', s.kaputt === s.fehlt, s.kaputt === s.fehlt ? '' : unterschied(s.kaputt, s.fehlt));
        check(art + ': Shadow AN = ganz OHNE Beobachter (weder C1 noch Shadow)', s.mit === s.ohneC1, s.mit === s.ohneC1 ? '' : unterschied(s.mit, s.ohneC1));
        check(art + ': Shadow AUS rechnet nichts', aus.sb.jvRegeln.liste().length === 0 && !aus.sb.jvRegeln.istAn());
        check(art + ': Shadow-Datei fehlt -> es gibt kein jvRegeln, C1 läuft weiter', fehlt.sb.jvRegeln === undefined && fehlt.sb.jvMeldungen.liste().length > 20);
        check(art + ': Ladefehler gibt es nicht', mit.ladefehler.length === 0, mit.ladefehler.join('; '));
        check(art + ': Shadow-Entscheidungen: eine je Ausgabe, keine für "ausgeloest"', mit.sb.jvRegeln.liste().length === mit.sb.jvMeldungen.liste().filter(e => e.status === 'ausgegeben').length && mit.sb.jvRegeln.ausgeloest() === mit.sb.jvMeldungen.liste().filter(e => e.status === 'ausgeloest').length);
        laeufe.push({ art, M: mit });
    }

    /* ===== 2. Einzelregeln ===== */
    {   // gleiches Ereignis + gleicher Zweck + gleiche Stufe (zwei Module)
        const w = welt();
        const a = w.E({ quelle: 'wachter', grund: 'abfahrt', bezug: termin('gcal_arzt'), text: 'Abfahrt Arzt' });
        w.plus(7);
        const b = w.E({ quelle: 'travel', grund: 'abfahrt', bezug: termin('gcal_arzt'), text: 'Abfahrt Arzt travel' });
        check('gleiches Ereignis + gleicher Zweck + gleiche Stufe: Merker gleicher_zweck + anderes_modul, aber BEIDE zugelassen', b.merker.includes('gleicher_zweck') && b.merker.includes('anderes_modul') && a.entscheid === 'zugelassen' && b.entscheid === 'zugelassen' && a.merker.length === 0);
        check('gleicher Zweck: es wird nicht festgelegt, welche gewinnt (kein Verfall, keine Sperre)', b.regel === 'frei' && b.nachlieferung.moeglich === false);
    }
    {   // gleiches Ereignis + gleicher Zweck + unterschiedliche Stufe
        const w = welt();
        const a = w.E({ quelle: 'proaktiv', grund: 'erinnerung-vorwarnung', bezug: erinn(111), text: 'Vorwarnung' });
        w.plus(30);
        const b = w.E({ quelle: 'calendar', grund: 'erinnerung', bezug: erinn(111), text: 'Erinnerung fällig' });
        check('gleiches Ereignis + gleicher Zweck + unterschiedliche Stufe: Merker gewollte_stufen, kein gleicher_zweck, beide zugelassen', b.merker.includes('gewollte_stufen') && !b.merker.includes('gleicher_zweck') && a.entscheid === 'zugelassen' && b.entscheid === 'zugelassen');
    }
    {   // gleiches Ereignis + unterschiedlicher Zweck
        const w = welt();
        w.E({ quelle: 'vorbereitung', grund: 'termin-vorbereitet', bezug: termin('gcal_arzt'), text: 'Vorbereitet' });
        w.plus(38);
        const b = w.E({ quelle: 'wachter', grund: 'abfahrt', bezug: termin('gcal_arzt'), text: 'Abfahrt' });
        check('gleiches Ereignis + anderer Zweck (38 min später): selbes_ereignis_anderer_zweck, zugelassen, kein Duplikat', b.merker.includes('selbes_ereignis_anderer_zweck') && !b.merker.includes('gleicher_zweck') && b.entscheid === 'zugelassen');
        const w2 = welt();
        w2.E({ quelle: 'konto', grund: 'bank-mail', bezug: { art: 'mail', schluessel: 'bank_1', herkunft: 'id' }, text: 'Konto' });
        w2.plus(1);
        const c = w2.E({ quelle: 'mailwatch', grund: 'wichtige-mail', bezug: { art: 'mail', schluessel: 'bank_1', herkunft: 'id' }, text: 'Mail' });
        check('gleiche Mail, zwei Module, anderer Zweck, 1 min Abstand: zusammenfassbar, beide zugelassen', c.merker.includes('zusammenfassbar') && c.entscheid === 'zugelassen');
        const w3 = welt();
        w3.E({ quelle: 'briefing', grund: 'tagesbriefing', bezug: { art: 'tag', schluessel: '2026-11-03', herkunft: 'tag' }, text: 'Briefing' });
        const d = w3.E({ quelle: 'alarm', grund: 'briefing-karte', bezug: { art: 'tag', schluessel: '2026-11-03', herkunft: 'tag' }, text: 'Karte' });
        check('Bezug "tag" ist zu grob und verbindet nichts', d.merker.length === 0 && d.ereignisId === '');
    }
    {   // unterschiedliche Erinnerungs-IDs
        const w = welt();
        const a = w.E({ quelle: 'calendar', grund: 'erinnerung', bezug: erinn(1001), text: 'Mülltonnen rausstellen' });
        w.plus(60);
        const b = w.E({ quelle: 'calendar', grund: 'erinnerung', bezug: erinn(1002), text: 'Brotdose einpacken' });
        check('unterschiedliche Erinnerungs-IDs: nicht verbunden (keine Merker), beide zugelassen', a.merker.length === 0 && b.merker.length === 0 && a.entscheid === 'zugelassen' && b.entscheid === 'zugelassen');
        const nacht = laeufe.find(l => l.art === 'nacht').M;
        const cal = nacht.sb.jvMeldungen.liste().filter(e => e.quelle === 'calendar' && e.grund === 'erinnerung');
        check('Testdaten (Nacht): "Mülltonnen" und "Brotdose" haben jetzt unterschiedliche Erinnerungs-IDs', cal.length === 2 && cal[0].bezug.schluessel !== cal[1].bezug.schluessel, cal.map(e => e.bezug && e.bezug.schluessel).join(' / '));
        const dec = nacht.sb.jvRegeln.liste().filter(d => d.quelle === 'calendar' && d.grund === 'erinnerung');
        check('Testdaten (Nacht): die beiden Erinnerungen werden nicht wegen einer gleichen Test-ID verbunden', dec.length === 2 && dec[0].merker.length === 0 && !dec[1].merker.includes('gleicher_zweck') && dec[1].mit.every(m => /^proaktiv /.test(m)), dec.map(d => d.merker.join('+') + (d.mit ? ' mit ' + d.mit.join() : '')).join(' | '));
        const vor = nacht.sb.jvRegeln.liste().find(d => d.grund === 'erinnerung-vorwarnung');
        const faellig = nacht.sb.jvRegeln.liste().filter(d => d.quelle === 'calendar')[1];
        check('Testdaten (Nacht): Vorwarnung 03:35 und fällige Erinnerung 04:05 derselben Erinnerung (Brotdose) sind gewollte_stufen', !!vor && !!faellig && faellig.merker.includes('gewollte_stufen'), vor ? faellig && faellig.merker.join('+') : 'keine Vorwarnung');
    }
    {   // bewusst gesetzte Erinnerung
        const w = welt(); w.ruhe(true);
        const a = w.E({ quelle: 'calendar', grund: 'erinnerung', bezug: erinn(7), kanal: ['sprache'], text: 'Tabletten' });
        check('bewusst gesetzte Erinnerung in Ruhephase: bewusstGesetzt, HOCH, zugelassen, nicht verworfen', a.bewusstGesetzt === true && a.prio === 'HOCH' && a.entscheid === 'zugelassen' && a.proKanal.sprache === 'ja');
        check('bewusst gesetzte Erinnerung: Kanalschutz im Datenmodell (Hinweis/Benachrichtigung/Karte bleiben, Sprache nicht zwingend), nur Modell', a.kanalSchutz && a.kanalSchutz.behalteKanal.includes('benachrichtigung') && a.kanalSchutz.sprachePflicht === false && a.kanalSchutz.nurDatenmodell === true);
        const v = w.E({ quelle: 'proaktiv', grund: 'termin-vorwarnung', bezug: termin('t9'), text: 'Termin gleich' });
        check('normale Termin-Vorwarnung ist nicht "bewusst gesetzt", hat keinen Kanalschutz', v.bewusstGesetzt === false && v.kanalSchutz === null);
    }
    {   // Ruhephase je Stufe
        const w = welt(); w.ruhe(true);
        const n1 = w.E({ quelle: 'mailwatch', grund: 'wichtige-mail', kanal: ['sprache'], text: 'Mail' });
        check('NORMAL (nur Sprache) in Ruhephase: später, Kanal Sprache nein', n1.prio === 'NORMAL' && n1.entscheid === 'spaeter' && n1.proKanal.sprache === 'nein');
        const n2 = w.E({ quelle: 'mail_nacht', grund: 'mail-entwuerfe', kanal: ['karte', 'sprache'], text: 'Entwürfe' });
        check('NORMAL mit Karte + Sprache in Ruhephase: nur stiller Kanal (Karte ja, Sprache nein)', n2.entscheid === 'nur_stiller_kanal' && n2.proKanal.karte === 'ja' && n2.proKanal.sprache === 'nein');
        const n3 = w.E({ quelle: 'fahr_whatsapp', grund: 'whatsapp-vorlesen', kanal: ['fenster', 'sprache'], text: 'WhatsApp' });
        check('fahr_whatsapp bleibt NORMAL; in Ruhephase fallen Fenster und Sprache weg -> später', n3.prio === 'NORMAL' && n3.entscheid === 'spaeter');
        const l = w.E(niedrig({ text: 'Na?' }));
        check('NIEDRIG in Ruhephase: später, Merker niedrig_in_ruhe, nicht nachlieferbar', l.entscheid === 'spaeter' && l.merker.includes('niedrig_in_ruhe') && l.nachlieferung.moeglich === false);
        const k = w.E({ quelle: 'alarm', grund: 'warnung', kanal: ['fenster', 'sprache'], text: 'Glatteis' });
        check('KRITISCH in Ruhephase: zugelassen auf allen Kanälen', k.prio === 'KRITISCH' && k.entscheid === 'zugelassen' && k.proKanal.fenster === 'ja' && k.proKanal.sprache === 'ja');
        const u = w.E({ quelle: 'jarvis', grund: 'start-ansage', ausloeser: 'manuell', kanal: ['sprache'], text: 'Systeme online' });
        check('NUTZER (von dir angestoßen) in Ruhephase: zugelassen, Vorrang', u.prio === 'NUTZER' && u.art === 'angefordert' && u.entscheid === 'zugelassen' && u.regel === 'nutzer-vorrang');
        const h = w.E({ quelle: 'wachter', grund: 'abfahrt', bezug: termin('x1'), text: 'Abfahrt' });
        check('HOCH in Ruhephase: zugelassen', h.prio === 'HOCH' && h.entscheid === 'zugelassen');
        const t = w.E({ quelle: 'unbekannt', grund: 'irgendwas', text: 'x' });
        check('Quelle/Grund nicht in der Tabelle: "unklar", nichts wird entschieden', t.entscheid === 'unklar' && t.prio === null);
    }
    {   // Fristen: Mahnung/überfällig = HOCH aus vorhandenem Grund, normale Frist = NORMAL
        const w = welt();
        const a = w.E({ quelle: 'fristen', grund: 'frist-gefunden', kanal: ['karte', 'sprache'], text: 'Mahnung: Stadtwerke' });
        const b = w.E({ quelle: 'fristen', grund: 'frist-gefunden', kanal: ['karte'], text: 'Rechnung: Telekom' });
        const c = w.E({ quelle: 'fristen', grund: 'frist-erinnerung', kanal: ['karte', 'sprache'], text: 'Telekom ist seit 3 Tagen überfällig' });
        const d = w.E({ quelle: 'fristen', grund: 'frist-erinnerung', kanal: ['karte', 'sprache'], text: 'Strom über 40 Euro ist in 3 Tagen fällig' });
        const e = w.E({ quelle: 'fristen', grund: 'frist-erinnerung', kanal: ['karte', 'sprache'], text: 'Miete ist heute fällig' });
        check('Fristen: Mahnung (Modul spricht selbst) = HOCH, normale Frist = NORMAL', a.prio === 'HOCH' && b.prio === 'NORMAL');
        check('Fristen-Erinnerung: überfällig und heute fällig = HOCH, in 3 Tagen = NORMAL (nur aus dem vorhandenen Wortlaut, keine KI)', c.prio === 'HOCH' && e.prio === 'HOCH' && d.prio === 'NORMAL');
    }
    {   // Nutzeraktivität
        const w = welt();
        w.R().nutzerAktiv(w.A.uhr.ms - 1 * MIN);
        const a = w.E(niedrig({ text: 'Frage A' }));
        check('NIEDRIG 1 min nach Nutzeraktivität: später (niedrig_zu_dicht), Regel niedrig-nutzer', a.entscheid === 'spaeter' && a.regel === 'niedrig-nutzer' && a.merker.includes('niedrig_zu_dicht'));
        check('NIEDRIG nach Nutzeraktivität: Mikrofon wird "wie bisher" gelassen, wenn der Nutzer gerade aktiv war', a.mikro === 'wie_bisher');
        w.plus(4);
        const b = w.E(niedrig({ text: 'Frage B' }));
        check('NIEDRIG 5 min nach Nutzeraktivität: zugelassen; Mikrofon nach 10 min Pause nicht automatisch', b.entscheid === 'zugelassen' && b.mikro === 'wie_bisher');
        w.plus(20);
        const c = w.E(niedrig({ text: 'Frage C' }));
        check('NIEDRIG ohne Aktivität in den letzten 10 min: Mikrofon "nicht_automatisch" (nur Absicht, nichts geändert)', c.mikro === 'nicht_automatisch' && c.entscheid === 'zugelassen');
        const d = w.E({ quelle: 'konto', grund: 'bank-mail', kanal: ['sprache'], mikro: 'bedingt', text: 'Konto' });
        check('NORMAL mit Mikrofon-Rückruf: Mikrofon "wie bisher"', d.mikro === 'wie_bisher');
    }
    {   // Mindestabstand, Stunden- und Tageslimit, Nachlauf, gleicher Text
        const w = welt();
        const a = w.E(niedrig({ text: 'S1' })); w.plus(4);
        const b = w.E(niedrig({ text: 'S2' }));
        check('NIEDRIG 4 min nach zugelassener NIEDRIG-Sprache: später (10-min-Abstand)', a.entscheid === 'zugelassen' && b.entscheid === 'spaeter' && b.regel === 'niedrig-abstand');
        w.plus(8);
        const c = w.E(niedrig({ text: 'S3' }));
        const d = w.E(niedrig({ text: 'S4' }));
        check('Zurückgestellte Meldungen zählen nicht als gesprochen (S3 durfte, danach S4 sofort wieder zu dicht)', c.entscheid === 'zugelassen' && d.entscheid === 'spaeter');
        w.plus(11);
        const e = w.E(niedrig({ text: 'S5' }));
        check('Stundenlimit: dritter NIEDRIG-Impuls innerhalb einer Stunde -> später (niedrig-stunde)', e.entscheid === 'spaeter' && e.regel === 'niedrig-stunde' && e.merker.includes('menge'));
        const w2 = welt(); let zug = 0, letzte = null;
        for (let i = 0; i < 9; i++) { const x = w2.E(niedrig({ text: 'T' + i })); if (x.entscheid === 'zugelassen') zug++; letzte = x; w2.plus(61); }
        check('Tageslimit: höchstens 6 NIEDRIG-Sprachimpulse in 24 Stunden (9 Versuche im Stundenabstand -> 6), danach niedrig-tag', zug === 6 && letzte.regel === 'niedrig-tag', zug + ' / ' + letzte.regel);
        const w3 = welt();
        w3.E(niedrig({ text: 'Wie war dein Tag?' })); w3.plus(30);
        const x = w3.E(niedrig({ text: 'Wie war dein Tag?' }));
        check('exakt gleicher Text innerhalb 24 h: später (wiederholung)', x.entscheid === 'spaeter' && x.regel === 'niedrig-text' && x.merker.includes('wiederholung'));
        const y = w3.E(niedrig({ text: 'Wie war dein Tag!' }));
        check('ein anderer Text (auch nur ein Zeichen anders) ist keine Wiederholung', y.entscheid === 'zugelassen', y.regel);
        w3.plus(25 * 60);
        const z = w3.E(niedrig({ text: 'Wie war dein Tag?' }));
        check('derselbe Text nach mehr als 24 h: zugelassen', z.entscheid === 'zugelassen', z.regel);
    }
    {   // Nachlauf nach Ruhephase (es gibt keinen eigenen Zeitgeber: das Ende wird bei der nächsten Beobachtung erkannt)
        const w = welt(); w.ruhe(true);
        w.E({ quelle: 'alarm', grund: 'warnung', kanal: ['sprache'], text: 'Nachts' });
        w.plus(3); w.ruhe(false);
        w.E({ quelle: 'briefing', grund: 'tagesbriefing', ausloeser: 'folge', text: 'Briefing' });   // erste Beobachtung nach Ende der Ruhephase
        w.plus(17);
        const a = w.E(niedrig({ text: 'Morgen!' }));
        check('NIEDRIG kurz nach Ende der Ruhephase: später (Nachlauf, niedrig_in_ruhe)', a.entscheid === 'spaeter' && a.regel === 'niedrig-nachlauf' && a.merker.includes('niedrig_in_ruhe'), a.regel);
        w.plus(44);
        const b = w.E(niedrig({ text: 'Später am Morgen' }));
        check('NIEDRIG 60 min nach Ende der Ruhephase: zugelassen', b.entscheid === 'zugelassen', b.regel);
        const w2 = welt(); w2.ruhe(true); w2.E({ quelle: 'alarm', grund: 'warnung', text: 'x' }); w2.plus(1); w2.ruhe(false);
        const h = w2.E({ quelle: 'briefing', grund: 'tagesbriefing', ausloeser: 'folge', text: 'Briefing' });
        check('HOCH im Nachlauf wird nicht gebremst', h.entscheid === 'zugelassen');
        check('Die Shadow-Datei startet keinen eigenen Zeitgeber', !/setInterval|setTimeout/.test(lies('js/meldungs_regeln.js').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
    }
    {   // mehrere Kanäle
        const w = welt();
        const a = w.E({ quelle: 'pakete', grund: 'paket-zugestellt', kanal: ['hinweis', 'sprache'], bezug: { art: 'paket', schluessel: 'P1', herkunft: 'id' }, text: 'Paket' });
        check('Meldung mit mehreren Kanälen außerhalb der Ruhephase: jeder Kanal "ja"', a.entscheid === 'zugelassen' && a.proKanal.hinweis === 'ja' && a.proKanal.sprache === 'ja');
        w.ruhe(true);
        const b = w.E({ quelle: 'pakete', grund: 'paket-zugestellt', kanal: ['hinweis', 'sprache'], bezug: { art: 'paket', schluessel: 'P2', herkunft: 'id' }, text: 'Paket 2' });
        check('Meldung mit mehreren Kanälen in der Ruhephase: Hinweis bleibt, Sprache entfällt -> nur_stiller_kanal; Entscheidung je Kanal getrennt', b.entscheid === 'nur_stiller_kanal' && b.proKanal.hinweis === 'ja' && b.proKanal.sprache === 'nein');
        const c = w.E({ quelle: 'wachter', grund: 'unwetter', kanal: ['karte', 'sprache', 'push'], text: 'Unwetter' });
        check('KRITISCH mit drei Kanälen: alle ja', c.entscheid === 'zugelassen' && Object.values(c.proKanal).every(v => v === 'ja'));
    }
    {   // Entscheidung, Nachlieferbarkeit und Verfall sind getrennte Felder
        const w = welt(); w.ruhe(true);
        const a = w.E({ quelle: 'mailwatch', grund: 'wichtige-mail', bezug: { art: 'mail', schluessel: 'm1', herkunft: 'id' }, text: 'Wichtige Mail' });
        check('"später" ist nur die aktuelle Entscheidung; Nachlieferbarkeit und Verfallszeit sind eigene Felder', a.entscheid === 'spaeter' && a.nachlieferung && 'moeglich' in a.nachlieferung && 'verfallMin' in a.nachlieferung && 'verfallZeit' in a.nachlieferung);
        check('wichtige Mail: nachlieferbar, Verfall 12 h nach der Meldung', a.nachlieferung.moeglich === true && a.nachlieferung.verfallMin === 720 && a.nachlieferung.verfallZeit === a.zeit + 720 * MIN);
        const p = w.E({ quelle: 'preissuche', grund: 'preis-treffer', text: 'Preis gefallen' });
        check('Preisfund: Verfall nur 60 min (verschiedene Meldungsarten haben verschiedene Verfallszeiten)', p.nachlieferung.moeglich === true && p.nachlieferung.verfallMin === 60);
        const z = w.E({ quelle: 'autoansicht', grund: 'autoansicht-einsteigen', text: 'Autoansicht ist an.' });
        check('situationsbezogene Meldung (Autoansicht): Verfall nur 5 min', z.nachlieferung.verfallMin === 5);
        const l = w.E(niedrig({ text: 'Plausch' }));
        check('NIEDRIG: nicht nachlieferbar, verfällt sofort', l.nachlieferung.moeglich === false && l.nachlieferung.verfallZeit === null);
        const ok2 = w.R().liste().every(d => d.entscheid !== 'zugelassen' || d.nachlieferung.moeglich === false);
        check('zugelassene Meldungen haben nichts nachzuliefern', ok2);
        check('im Shadow-Modus wird nichts nachgeliefert (es gibt keine Ausgabe durch die Shadow-Datei)', w.A.ereignisse.filter(e => e.art === 'sprechen' && /Wichtige Mail|Preis gefallen/.test(e.text)).length === 0);
    }
    {   // abgelaufener Verfall und kein Sprachstau
        const w = welt('2026-11-02T23:00:00+01:00'); w.ruhe(true);
        const mail1 = w.E({ quelle: 'mailwatch', grund: 'wichtige-mail', bezug: { art: 'mail', schluessel: 'm1', herkunft: 'id' }, text: 'Mail 1' }); w.plus(30);
        const preis = w.E({ quelle: 'preissuche', grund: 'preis-treffer', text: 'Preis' }); w.plus(30);
        const paket = w.E({ quelle: 'pakete', grund: 'paket-zugestellt', kanal: ['sprache'], bezug: { art: 'paket', schluessel: 'P1', herkunft: 'id' }, text: 'Paket' }); w.plus(30);
        const bank = w.E({ quelle: 'konto', grund: 'bank-mail', bezug: { art: 'mail', schluessel: 'b1', herkunft: 'id' }, text: 'Bank' }); w.plus(30);
        const auftr = w.E({ quelle: 'auftraege', grund: 'auftrag-erfuellt', bezug: { art: 'auftrag', schluessel: 'a1', herkunft: 'id' }, text: 'Auftrag' }); w.plus(30);
        const mail2 = w.E({ quelle: 'mailwatch', grund: 'wichtige-mail', bezug: { art: 'mail', schluessel: 'm2', herkunft: 'id' }, text: 'Mail 2' });
        const plausch = w.E(niedrig({ text: 'Plausch' }));
        const ids = [mail1, preis, paket, bank, auftr, mail2, plausch];
        check('sieben Meldungen in der Nacht: alle "später" (nur Entscheidung)', ids.every(d => d.entscheid === 'spaeter'));
        const morgen = new Date('2026-11-03T07:00:00+01:00').getTime();
        const v = w.R().nachliefervorschau(morgen);
        check('Vorschau 07:00: abgelaufene Meldungen (Preis nach 60 min) sind verfallen', v.verfallen.includes(preis.nr), JSON.stringify(v));
        check('Vorschau: NIEDRIG wird verworfen und nicht nachgeliefert', v.verworfen.includes(plausch.nr));
        check('Vorschau: höchstens 2 Meldungen dürften gesprochen werden, der Rest nur als eine stille Sammelkarte (kein Sprachstau)', v.sprache.length <= 2 && v.sprache.length + v.sammelkarte.length >= 3 && v.sammelkarte.length >= 1, JSON.stringify(v));
        check('Vorschau: Ordnung nach Priorität, dann Zeit; abgelaufene tauchen nicht in Sprache oder Sammelkarte auf', !v.sprache.concat(v.sammelkarte).includes(preis.nr) && !v.sprache.concat(v.sammelkarte).includes(plausch.nr));
        const gleich = w.R().liste().length;
        check('Die Vorschau ist reine Rechnung: keine Ausgabe, keine neue Entscheidung', w.A.ereignisse.filter(e => e.art === 'sprechen' && /Mail 1|Paket|Bank|Auftrag/.test(e.text)).length === 0 && w.R().liste().length === gleich);
        const frueh = w.R().nachliefervorschau(w.A.uhr.ms - 40 * MIN);
        check('Vorschau mit früherem Zeitpunkt: Preis (Verfall 60 min) ist noch nicht abgelaufen', frueh.verfallen.length < v.verfallen.length || !frueh.verfallen.includes(preis.nr) || preis.nachlieferung.verfallZeit <= w.A.uhr.ms - 40 * MIN);
        const zwei = w.R().nachliefervorschau(morgen, w.R().liste().filter(d => d.quelle === 'mailwatch'));
        check('Vorschau: gleiche Meldungsart zu verschiedenen Mails bleibt getrennt; gleiche Mail würde zusammengelegt', zwei.sprache.length + zwei.sammelkarte.length === 2);
    }
    {   // Ringpuffer, ausgelöste Einträge
        const w = welt();
        w.A.sb.jvMeldungen.beobachte({ quelle: 'schicht', grund: 'schicht-briefing', status: 'ausgeloest', kanal: [] });
        check('Einträge mit Status "ausgeloest" werden nicht entschieden, nur gezählt', w.R().liste().length === 0 && w.R().ausgeloest() === 1);
        for (let i = 0; i < 320; i++) w.E({ quelle: 'konto', grund: 'bank-mail', text: 'M' + i });
        check('Ringpuffer hält höchstens 300 Entscheidungen', w.R().liste().length === 300);
        check('Entscheidungen sind eingefroren und tragen Version 2', Object.isFrozen(w.R().liste()[0]) && w.R().liste()[0].version === 2);
        w.R().aus();
        const vorher = w.R().liste().length; w.E({ quelle: 'konto', grund: 'bank-mail', text: 'nach aus' });
        check('Shadow aus: keine neuen Entscheidungen; wieder an: es geht weiter', w.R().liste().length === vorher && (w.R().einschalten(), w.E({ quelle: 'konto', grund: 'bank-mail', text: 'wieder an' }), w.R().liste().length === Math.min(300, vorher + 1) || w.R().liste().length === 300));
    }
    {   // Mitleser-Schnittstelle
        const A = starte({});
        let n = 0;
        A.sb.jvMeldungen.abonniere(() => { throw new Error('böse'); });
        A.sb.jvMeldungen.abonniere(() => { n++; });
        A.sb.jvMeldungen.beobachte({ quelle: 'konto', grund: 'bank-mail', kanal: ['sprache'], text: 'x' });
        check('ein werfender Mitleser stört weder den Eintrag noch andere Mitleser', A.sb.jvMeldungen.liste().length === 1 && n === 1);
        const e = A.sb.jvMeldungen.liste()[0];
        check('der Mitleser bekommt eingefrorene Einträge (kann nichts ändern)', Object.isFrozen(e));
    }

    /* ===== 3. Soll gegen Ist ===== */
    const vergleich = [];
    for (const { art, M } of laeufe) {
        const liste = M.sb.jvMeldungen.liste();
        const ist = M.sb.jvRegeln.liste();
        const nutzer = (LAEUFE[art].aktionen || []).filter(a => ['tipp', 'satz', 'oeffnen'].includes(a.was)).map(a => +new Date(a.at));
        const ruheAt = ms => ruhezeitOb(M, ms).app;
        const s = soll(liste, nutzer, ruheAt);
        check(art + ': Soll und Ist haben gleich viele Entscheidungen', s.length === ist.length, s.length + ' / ' + ist.length);
        const abw = [];
        s.forEach((x, i) => {
            const y = ist[i]; if (!y) return;
            const gleichMerker = [...x.merker].sort().join() === y.merker.filter(m => !['anderes_modul'].includes(m) || x.merker.has('anderes_modul')).sort().join();
            const prioIst = y.prio;
            if (x.nr !== y.nr || x.dec !== y.entscheid || x.prio !== prioIst || !gleichMerker || (x.mikro !== y.mikro && !(x.mikro === '-' && y.mikro === '-'))) abw.push({ nr: x.nr, quelle: y.quelle + '/' + y.grund, soll: x.dec + ' ' + x.prio + ' [' + [...x.merker].sort().join(',') + '] mikro ' + x.mikro, ist: y.entscheid + ' ' + y.prio + ' [' + y.merker.slice().sort().join(',') + '] mikro ' + y.mikro });
        });
        check(art + ': Soll (Entwurf) und Ist (eingebaut) stimmen bei Entscheidung, Stufe, Merkern und Mikro-Absicht überein', abw.length === 0, abw.slice(0, 3).map(a => JSON.stringify(a)).join(' | '));
        vergleich.push({ art, M, s, ist, abw });
    }

    if (process.env.REGELN_BERICHT) {
        fs.writeFileSync(path.join(ROOT, process.env.REGELN_BERICHT), require('./regeln_bericht.js').bericht(vergleich, ruhezeitOb));
        console.log('Bericht geschrieben: ' + process.env.REGELN_BERICHT);
    }
    console.log(fehler ? '\n' + fehler + ' Prüfung(en) FEHLGESCHLAGEN, ' + ok + ' in Ordnung.' : 'Shadow-Regeln in Ordnung (' + ok + ' Prüfungen).');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('abgebrochen: ' + (e && e.stack || e)); process.exit(1); });
