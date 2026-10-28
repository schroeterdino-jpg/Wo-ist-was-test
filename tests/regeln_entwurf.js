/* Entwurf als unabhängige Zweitrechnung (Referenz "Soll") für den Vergleich mit js/meldungs_regeln.js ("Ist").
   Gleiche Regeln wie im freigegebenen Bauvorschlag plus die Entscheidungen vom 28.10.2026 (Fristen: Mahnung/überfällig = HOCH). Bewusst anders geschrieben als die App-Datei. */
'use strict';
const P = { niedrigAbstandMin: 10, niedrigNachNutzerMin: 3, niedrigNachRuheMin: 60, niedrigProStunde: 2, niedrigProTag: 6, abstandZweckMin: 10 };
const K = {
 'alarm/warnung':['KRITISCH','warnung','einzig'], 'alarm/briefing-karte':['HOCH','briefing','karte'],
 'briefing/tagesbriefing':['HOCH','briefing','haupt'], 'calendar/erinnerung':['HOCH','erinnerung','faellig',1],
 'proaktiv/erinnerung-vorwarnung':['HOCH','erinnerung','vorwarnung',1], 'proaktiv/termin-vorwarnung':['HOCH','termin-vorwarnung','vorwarnung'],
 'wachter/abfahrt':['HOCH','abfahrt','haupt'], 'travel/abfahrt':['HOCH','abfahrt','haupt'], 'plan_ansagen/aufbruchszeit':['HOCH','abfahrt','haupt'],
 'wachter/termin-gleich':['HOCH','termin-gleich','nah'], 'vorbereitung/termin-vorbereitet':['NORMAL','vorbereitung','info'],
 'fristen/frist-gefunden':['NORMAL','frist-neu','info'], 'fristen/frist-erinnerung':['NORMAL','frist-erinnerung','faellig'],
 'konto/bank-mail':['NORMAL','kontobewegung','info'], 'mailwatch/wichtige-mail':['NORMAL','mail-wichtig','info'],
 'mail_nacht/mail-entwuerfe':['NORMAL','mail-entwuerfe','info'], 'pakete/paket-zugestellt':['NORMAL','paket','info'],
 'preissuche/preis-treffer':['NORMAL','preis','info'], 'auftraege/auftrag-erfuellt':['NORMAL','auftrag','info'],
 'fahr_whatsapp/whatsapp-vorlesen':['NORMAL','nachricht','info'], 'schlaf_antwort/app-meldung':['NORMAL','nachricht','info'],
 'parkplatz_auto/parkplatz-gemerkt':['NORMAL','parkplatz','info'], 'autoansicht/autoansicht-einsteigen':['NORMAL','status','info'],
 'zuvorkommend/geburtstag-vorfrage':['NORMAL','geburtstag','frage'], 'dirigent/tagesmeldung':['NORMAL','tagesmeldung','info'],
 'orte/einkaufsliste-markt':['NORMAL','einkauf','info'], 'orte/standort-frage':['NIEDRIG','standort-frage','frage'],
 'smarttips/mitnehmen-tipp':['NIEDRIG','tipp','info'], 'routinen/routine-vorschlag':['NIEDRIG','routine','frage'], 'routinen/routine-hinweis':['NIEDRIG','routine','info'],
 'kennenlernen/kennenlern-frage':['NIEDRIG','kennenlernen','frage'], 'zane_redet/redet-frage':['NIEDRIG','smalltalk','frage'],
 'tagesueberblick/tagesueberblick-leer':['NIEDRIG','ueberblick','info'], 'tagesueberblick/tagesueberblick':['NORMAL','ueberblick','info'],
};
K['jarvis/start-ansage']=['NUTZER','start-ansage','angefordert'];
K['jarvis/start-ansage'] = ['NUTZER', 'start-ansage', 'angefordert'];
const RUHE_OK = { KRITISCH: 'ALLE', HOCH: 'ALLE', NORMAL: ['karte', 'hinweis', 'benachrichtigung'], NIEDRIG: [] };

/* liste: Einträge des C1-Protokolls; nutzer: Zeiten der Nutzeraktivität (ms); ruheAt(ms): App-Ruhephase zu dieser Zeit */
function soll(liste, nutzer, ruheAt) {
    const aus = liste.filter(e => e.status === 'ausgegeben'); const out = []; const niedrigZeiten = [], gesehen = {};
    for (const e of aus) {
        const key = e.quelle + '/' + e.grund; const k = K[key];
        const r = { nr: e.nr, dec: 'zugelassen', prio: null, merker: new Set(), mikro: '-' };
        if (!k) { r.dec = 'unklar'; out.push(r); continue; }
        r.prio = k[0]; r.zweck = k[1]; r.stufe = k[2];
        if (key === 'fristen/frist-gefunden' && e.kanal.includes('sprache')) r.prio = 'HOCH';
        if (key === 'fristen/frist-erinnerung' && /überfällig|ist heute fällig/i.test(e.text)) r.prio = 'HOCH';
        const hatSprache = e.kanal.includes('sprache');
        const fein = e.bezug && e.bezug.herkunft !== 'tag';
        if (fein) for (const v of out) {
            const ve = liste.find(x => x.nr === v.nr);
            if (!ve.bezug || ve.bezug.herkunft === 'tag' || ve.bezug.art !== e.bezug.art || ve.bezug.schluessel !== e.bezug.schluessel) continue;
            if (v.zweck === r.zweck && v.stufe === r.stufe) { r.merker.add('gleicher_zweck'); if (ve.quelle !== e.quelle) r.merker.add('anderes_modul'); }
            else if (v.zweck === r.zweck) r.merker.add('gewollte_stufen');
            else if (e.zeit - ve.zeit <= P.abstandZweckMin * 60000) r.merker.add('zusammenfassbar');
            else r.merker.add('selbes_ereignis_anderer_zweck');
        }
        if (e.ausloeser === 'manuell') { r.prio = 'NUTZER'; out.push(r); continue; }
        const ruhe = ruheAt(e.zeit) === true;
        if (ruhe && r.prio !== 'KRITISCH' && r.prio !== 'HOCH') {
            const erlaubt = e.kanal.filter(c => RUHE_OK[r.prio].includes(c));
            if (erlaubt.length === e.kanal.length) r.dec = 'zugelassen';
            else if (erlaubt.length) r.dec = 'nur_stiller_kanal';
            else { r.dec = 'spaeter'; if (r.prio === 'NIEDRIG') r.merker.add('niedrig_in_ruhe'); }
        }
        if (r.prio === 'NIEDRIG' && r.dec === 'zugelassen' && hatSprache) {
            const nachRuhe = ruheAt(e.zeit) === false && ruheAt(e.zeit - P.niedrigNachRuheMin * 60000) === true;
            const letzte = out.filter(x => x.dec === 'zugelassen' || x.dec === 'nur_stiller_kanal').filter(x => liste.find(y => y.nr === x.nr).kanal.includes('sprache') && (x.dec === 'zugelassen')).map(x => liste.find(y => y.nr === x.nr).zeit).pop();
            const nu = nutzer.filter(t => t <= e.zeit).pop();
            const std = niedrigZeiten.filter(t => e.zeit - t < 3600000).length, tag = niedrigZeiten.filter(t => e.zeit - t < 86400000).length;
            let sp = null;
            if (nachRuhe) sp = 'niedrig_in_ruhe';
            else if (letzte !== undefined && e.zeit - letzte < P.niedrigAbstandMin * 60000) sp = 'niedrig_zu_dicht';
            else if (nu !== undefined && e.zeit - nu < P.niedrigNachNutzerMin * 60000) sp = 'niedrig_zu_dicht';
            else if (tag >= P.niedrigProTag) sp = 'menge';
            else if (std >= P.niedrigProStunde) sp = 'menge';
            else if (gesehen[e.text] !== undefined && e.zeit - gesehen[e.text] < 86400000) sp = 'wiederholung';
            if (sp) { r.dec = 'spaeter'; r.merker.add(sp); } else { niedrigZeiten.push(e.zeit); gesehen[e.text] = e.zeit; }
        }
        if (e.mikro === 'ja' || e.mikro === 'bedingt') {
            if (r.prio === 'NIEDRIG') { const n = nutzer.filter(t => t <= e.zeit).pop(); r.mikro = (n !== undefined && e.zeit - n < 600000) ? 'wie_bisher' : 'nicht_automatisch'; }
            else r.mikro = 'wie_bisher';
        }
        out.push(r);
    }
    return out;
}
module.exports = { soll };
