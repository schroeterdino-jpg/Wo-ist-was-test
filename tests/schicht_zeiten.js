/* ============================================================
   TESTS: Schichtzeiten, Ankunft, Abfahrt, Heimfahrt, Schicht-Erinnerung, einmalige Änderungen, Ruhezeit, Wetter-gegen-Essensplan.
   Start: node tests/schicht_zeiten.js   Echte Module, feste Uhr (Europe/Berlin), Attrappe für die Android-Plan-Schnittstelle.
   Arten: Hinfahrt = stau| + aufbruch| ; Heimfahrt = heim| ; Schicht-Erinnerung = wecker| ; Briefing = brief|
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const pause = ms => new Promise(r => setTimeout(r, ms));
const hm = ms => new Date(ms).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const uhrBerlin = ms => new Date(ms).toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });

/* Woche ab Mo 02.11.2026 = Frühschicht, 09.11. = Spät, 16.11. = Früh */
function neu(jetzt, o) {
    o = o || {};
    const cap = [];
    const native = { planAnsagen: j => { cap.push(JSON.parse(j)); return true; }, holeAnsage: () => '', naechsterWecker: () => 0 };
    const A = starte({ jetzt, native, festerZufall: true, fetch: async u => { throw new Error('offline ' + u); } });
    const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 11, d: 2 });
    A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'frueh', times: { frueh: 225, spaet: 720 }, auto: true }));
    if (o.urlaub) A.store['jv_urlaub'] = JSON.stringify(o.urlaub);
    if (o.fahrt) A.store['jv_plan_fahrt'] = JSON.stringify([{ min: o.fahrt, at: Date.now() }]);
    if (o.essen) A.store['jv_essensplan'] = JSON.stringify({ gespeichert: '2026-11-02', tage: { Montag: { veg: 'Nudeln', fleisch: 'Gulasch' }, Freitag: { veg: 'Fisch', fleisch: 'Fisch' } } });
    A.cap = cap; A.P = A.sb.jvPlan;
    A.plan = () => A.P.bauePlan();
    return A;
}
const ids = (plan, art) => plan.filter(e => e.id.split('|')[0] === art);

(async () => {
    /* --- 1. Zentrale Zeiten --- */
    {
        const A = neu('2026-11-02T03:00:00+01:00'), P = A.P;
        check('Früh Beginn 5:10', P.beginn('frueh') === 310);
        check('Früh Ende 14:37', P.ende('frueh') === 14 * 60 + 37);
        check('Spät Beginn 13:50', P.beginn('spaet') === 13 * 60 + 50, String(P.beginn('spaet')));
        check('Spät Ende 22:12', P.ende('spaet') === 22 * 60 + 12);
        check('Ankunft Standard 20 Minuten vor Beginn', P.vorherStd() === 20);
        check('Früh gewünschte Ankunft 4:50', P.ankunft('frueh') === 4 * 60 + 50);
        check('Spät gewünschte Ankunft 13:30', P.ankunft('spaet') === 13 * 60 + 30);
        check('Beginn und Ankunft sind zwei Werte', P.beginn('frueh') !== P.ankunft('frueh'));
        const w = A.sb.jvSchichtWissen();
        check('KI-Kontext enthält Schichtende', w && w.schichtende && /14 Uhr 37/.test(w.schichtende['Frühschicht']) && /22 Uhr 12/.test(w.schichtende['Spätschicht']), JSON.stringify(w && w.schichtende));
        check('KI-Kontext enthält Ankunft', w && w.gewuenschte_ankunft && /4 Uhr 50/.test(w.gewuenschte_ankunft['Frühschicht']));
        const prompt = require('fs').readFileSync(__dirname + '/../js/prompt.js', 'utf8');
        check('Prompt verbietet das Schichtende nicht mehr', !/Ein Schichtende kennst du nicht/.test(prompt));
    }
    /* --- 2. Abfahrt aus Ankunft und Fahrzeit --- */
    {
        const A = neu('2026-11-02T03:00:00+01:00', { fahrt: 25 });
        check('Abfahrt Früh = Ankunft 4:50 minus 25 Minuten Fahrt', A.P.abfahrtMin('frueh') === 4 * 60 + 25, String(A.P.abfahrtMin('frueh')));
        const p = A.plan();
        const ab = ids(p, 'aufbruch')[0];
        check('Aufbruch-Meldung 10 Minuten vor der Abfahrt (4:15)', ab && uhrBerlin(ab.at) === '04:15', ab && hm(ab.at));
        const B = neu('2026-11-02T03:00:00+01:00');
        check('Ohne Messung gilt die genannte Abfahrt 4:30', B.P.abfahrtMin('frueh') === 270);
    }
    /* --- 3. Arten sauber getrennt: Früh --- */
    {
        const A = neu('2026-11-02T03:00:00+01:00'), p = A.plan();
        const heim = ids(p, 'heim'), brief = ids(p, 'brief'), stau = ids(p, 'stau'), auf = ids(p, 'aufbruch'), wecker = ids(p, 'wecker');
        check('Früh: Heimfahrt Mo um 14:40 (Ende 14:37 + 3)', heim.some(e => e.id === 'heim|2026-11-02' && uhrBerlin(e.at) === '14:40'), heim.map(e => hm(e.at)).join(','));
        check('Früh: keine pauschale 16-Uhr-Meldung', !p.some(e => uhrBerlin(e.at) === '16:00'), p.map(e => hm(e.at)).join(','));
        check('Früh: Briefing 3:45 (Aufstehzeit)', brief.some(e => e.id === 'brief|2026-11-02' && uhrBerlin(e.at) === '03:45'), brief.map(e => hm(e.at)).join(','));
        check('Früh: Hinfahrt = Stau-Check + Aufbruch', stau.length > 0 && auf.length > 0);
        check('Früh: Wecker-Frage am Vorabend 20:30 nur Mo-Do/So', wecker.every(e => uhrBerlin(e.at) === '20:30'));
        check('Keine doppelten Ids', new Set(p.map(e => e.id)).size === p.length);
    }
    /* --- 4. Spät --- */
    {
        const A = neu('2026-11-09T08:00:00+01:00'), p = A.plan();
        const heim = ids(p, 'heim');
        check('Spät: Heimfahrt Mo um 22:15', heim.some(e => e.id === 'heim|2026-11-09' && uhrBerlin(e.at) === '22:15'), heim.map(e => hm(e.at)).join(','));
        check('Spät: keine Wecker-Frage (Wecker nur vor Frühschicht, Spät-Woche)', !ids(p, 'wecker').some(e => e.id === 'wecker|2026-11-09'));
        const ab = ids(p, 'aufbruch').find(e => e.id === 'aufbruch|2026-11-09');
        check('Spät: Aufbruch 12:50 (Abfahrt 13:00)', ab && uhrBerlin(ab.at) === '12:50', ab && hm(ab.at));
    }
    /* --- 5. Freie Tage, Urlaub, Wochenende --- */
    {
        const A = neu('2026-11-06T20:00:00+01:00'), p = A.plan();   // Fr Abend, Früh-Woche
        check('Wochenende: keine Arbeitsmeldungen Sa/So', !p.some(e => /^(heim|stau|aufbruch|brief)\|2026-11-0[78]$/.test(e.id)), p.map(e => e.id).join(','));
        check('Freitag: keine Wecker-Frage (Samstag frei)', !p.some(e => e.id === 'wecker|2026-11-06'));
        check('Samstag: keine Wecker-Frage (Sonntag frei)', !p.some(e => e.id === 'wecker|2026-11-07'));
        const U = neu('2026-11-02T03:00:00+01:00', { urlaub: { von: '2026-11-02', bis: '2026-11-06' } }), pu = U.plan();
        check('Urlaub: keine Hinfahrt, Heimfahrt, Briefing, Wecker', !pu.some(e => /^(heim|stau|aufbruch|brief|wecker)\|2026-11-0[2-6]$/.test(e.id)), pu.map(e => e.id).join(','));
        const S = neu('2026-11-07T10:00:00+01:00');
        await S.satz('Wann muss ich morgen arbeiten?');
        check('Sonntag/Wochenende: Auskunft sagt keine Schicht', S.gesagt.some(t => /keine Schicht/.test(t)), S.gesagt.join('|'));
    }
    /* --- 6. Sonntag-Montag-Wechsel und Ruhezeit --- */
    {
        const q = async (t) => neu(t).sb._schichtTest.quietNow();
        check('Mo 03:00 Früh-Woche: ruhig', await q('2026-11-02T03:00:00+01:00') === true);
        check('Fr 22:00 Früh-Woche (Sa frei): keine Früh-Sonderruhe (normale Ruhezeit 22-7 gilt)', await q('2026-11-06T22:00:00+01:00') === undefined);
        check('Fr 21:45 Früh-Woche (Sa frei): keine Früh-Sonderruhe', await q('2026-11-06T21:45:00+01:00') === undefined);
        check('Sa 05:00: keine Früh-Sonderruhe', await q('2026-11-07T05:00:00+01:00') === undefined);
        check('So 21:45 vor Spät-Woche: keine Früh-Sonderruhe', await q('2026-11-08T21:45:00+01:00') === undefined);
        check('So 22:00 vor Früh-Woche: ruhig', await q('2026-11-15T22:00:00+01:00') === true);
        check('Mo 03:00 Spät-Woche: keine Früh-Sonderruhe', await q('2026-11-09T03:00:00+01:00') === undefined);
        const A = neu('2026-11-08T12:00:00+01:00'), p = A.plan();
        check('Sonntag vor Spät-Woche: keine Wecker-Frage', !p.some(e => e.id === 'wecker|2026-11-08'));
        const B = neu('2026-11-15T12:00:00+01:00');
        check('Sonntag vor Früh-Woche: Wecker-Frage 20:30', B.plan().some(e => e.id === 'wecker|2026-11-15' && uhrBerlin(e.at) === '20:30'));
    }
    /* --- 7. Manuelle Änderung der dauerhaften Zeiten --- */
    {
        const A = neu('2026-11-02T03:00:00+01:00'), P = A.P;
        P.setBeginn('frueh', 6 * 60); P.setEnde('frueh', 15 * 60 + 30); P.setVorher(30); P.setStauAn(false);
        check('Neuer Beginn gilt', P.beginn('frueh') === 360);
        check('Neues Ende gilt', P.ende('frueh') === 930);
        check('Ankunft 30 Minuten vor Beginn = 5:30', P.ankunft('frueh') === 330);
        const p = A.plan();
        check('Heimfahrt folgt dem neuen Ende (15:33)', ids(p, 'heim').some(e => e.id === 'heim|2026-11-02' && uhrBerlin(e.at) === '15:33'));
        check('Stauwarnung aus: kein Stau-Check', ids(p, 'stau').length === 0);
        check('Einstellungen bleiben im Speicher', JSON.parse(A.store['jv_plan_beginn']).frueh === 360 && A.store['jv_plan_vorher'] === '30' && A.store['jv_plan_stau_aus'] === '1', JSON.stringify(A.store));
    }
    /* --- 8. Einmalige Änderungen per Sprache --- */
    {
        const A = neu('2026-11-02T12:00:00+01:00'), P = A.P;
        await A.satz('Morgen fange ich erst um 6 Uhr an');
        check('Einmalig: Beginn morgen 6:00', P.beginn('frueh', '2026-11-03') === 360, A.gesagt.join('|'));
        check('Einmalig: dauerhafter Beginn unverändert (5:10)', P.beginn('frueh') === 310 && !/frueh/.test(String(A.store['jv_plan_beginn'] || '')));
        check('Einmalig: übermorgen unverändert', P.beginn('frueh', '2026-11-04') === 310);
        check('Einmalig später: Abfahrt rückt 50 Minuten nach hinten', P.abfahrtMin('frueh', '2026-11-03') === 270 + 50, String(P.abfahrtMin('frueh', '2026-11-03')));
        await A.satz('Morgen habe ich um 15 Uhr Feierabend');
        check('Einmalig: Ende morgen 15:00', P.ende('frueh', '2026-11-03') === 900, A.gesagt.join('|'));
        check('Einmalig: dauerhaftes Ende unverändert', P.ende('frueh') === 877 && P.ende('frueh', '2026-11-04') === 877);
        check('Einmalig: Heimfahrt morgen 15:03', ids(A.plan(), 'heim').some(e => e.id === 'heim|2026-11-03' && uhrBerlin(e.at) === '15:03'));
        await A.satz('Morgen möchte ich 30 Minuten früher auf der Arbeit sein');
        check('Einmalig: Ankunft morgen 50 Minuten vor Beginn', P.vorher('2026-11-03') === 50 && P.vorherStd() === 20, String(P.vorher('2026-11-03')));
        const g0 = A.gesagt.length;
        await A.satz('Morgen fange ich später an');
        check('Unklare Angabe: Jarvis fragt nach', A.gesagt.slice(g0).some(t => /Um wie viel Uhr/.test(t)), A.gesagt.slice(g0).join('|'));
        check('Unklare Angabe ändert nichts', P.beginn('frueh', '2026-11-03') === 360);
    }
    /* --- 8b. Einmalige Änderung weit vor dem Normalbeginn (gemeldeter Fehler: 13:45 -> 12:33 ergab 12:03 statt 11:51 wegen 60-Minuten-Grenze) --- */
    {
        const mk = () => { const A = neu('2026-11-08T12:00:00+01:00', { fahrt: 22 }); A.P.setBeginn('spaet', 13 * 60 + 45); return A; };   // Sonntag; Montag 09.11. = Spätschicht
        const A = mk(), P = A.P, MO = '2026-11-09';
        check('8b.0 Ausgangslage: Spät normal 13:45, Ankunft 13:25, Abfahrt 13:03', P.beginn('spaet') === 825 && P.ankunft('spaet') === 805 && P.abfahrtMin('spaet') === 783, [P.beginn('spaet'), P.ankunft('spaet'), P.abfahrtMin('spaet')].join(','));
        await A.satz('Morgen fange ich um 12:33 an');
        const abf = P.abfahrtMin('spaet', MO) - P.tagVor(MO);
        check('8b.1 Montag 12:33: Beginn 12:33, Ankunft 12:13 (20 Minuten Puffer)', P.beginn('spaet', MO) === 753 && P.ankunft('spaet', MO) === 733, [P.beginn('spaet', MO), P.ankunft('spaet', MO)].join(','));
        check('8b.2 Abfahrt 11:51 (nicht 12:03): 72 Minuten vorgezogen', P.tagVor(MO) === 72 && abf === 11 * 60 + 51, 'tagVor ' + P.tagVor(MO) + ' abf ' + abf);
        check('8b.3 gesprochene Antwort nennt 11 Uhr 51', A.gesagt.some(t => /auf 11 Uhr 51|Abfahrt gegen 11 Uhr 51/.test(t)), A.gesagt.join('|'));
        check('8b.4 normaler Plan unverändert (13:45 / 13:03), Folgetag ohne Ausnahme', P.beginn('spaet') === 825 && P.abfahrtMin('spaet') === 783 && P.beginn('spaet', '2026-11-10') === 825 && P.tagVor('2026-11-10') === 0 && P.abfahrtMin('spaet', '2026-11-10') === 783 && String(A.store['jv_plan_beginn']) === '{"spaet":825}', JSON.stringify([P.beginn('spaet'), P.abfahrtMin('spaet'), P.beginn('spaet','2026-11-10'), P.tagVor('2026-11-10'), P.abfahrtMin('spaet','2026-11-10'), A.store['jv_plan_beginn']]));
        const a2 = await (async () => { const g0 = A.gesagt.length; await A.satz('Wann muss ich morgen auf der Arbeit sein?'); return A.gesagt.slice(g0).join('|'); })();
        check('8b.5 Auskunft am Vortag nennt Beginn 12:33, Ankunft 12:13, Abfahrt 11:51', /12 Uhr 33/.test(a2) && /12 Uhr 13/.test(a2) && /11 Uhr 51/.test(a2), a2);
        check('8b.6 Plan: Abfahrts-Meldung Montag um 11:41 (10 Minuten vorher)', ids(A.plan(), 'aufbruch').some(e => e.id === 'aufbruch|' + MO && uhrBerlin(e.at) === '11:41'), ids(A.plan(), 'aufbruch').map(e => e.id + ' ' + hm(e.at)).join(';'));
        /* Grenzen */
        const B = mk(); await B.satz('Morgen fange ich um 10:45 an');   // genau 180 Minuten früher
        check('8b.7 genau 180 Minuten früher: voll übernommen (Abfahrt 10:03)', B.P.tagVor(MO) === 180 && B.P.abfahrtMin('spaet', MO) - B.P.tagVor(MO) === 10 * 60 + 3, String(B.P.tagVor(MO)));
        const C = mk(); await C.satz('Morgen fange ich um 8 Uhr an');   // 345 Minuten früher: gedeckelt
        check('8b.8 Mehr als 180 Minuten früher: gedeckelt auf 180, Beginn selbst bleibt 8:00, kein Absturz', C.P.tagVor(MO) === 180 && C.P.beginn('spaet', MO) === 480 && C.P.abfahrtMin('spaet', MO) - C.P.tagVor(MO) > 0, String(C.P.tagVor(MO)));
        const D = mk(); await D.satz('Morgen fange ich um 13:30 an');   // 15 Minuten früher (kleine Abweichung wie bisher)
        check('8b.9 kleine Abweichung wie bisher: 15 Minuten früher -> Abfahrt 12:48', D.P.tagVor(MO) === 15 && D.P.abfahrtMin('spaet', MO) - D.P.tagVor(MO) === 12 * 60 + 48, String(D.P.tagVor(MO)));
        const E = mk(); await E.satz('Morgen fange ich um 15 Uhr an');   // später: schiebt nach hinten, kein tagVor
        check('8b.10 späterer Beginn (15:00): Abfahrt 75 Minuten später, kein Vorzug', E.P.tagVor(MO) === 0 && E.P.abfahrtMin('spaet', MO) === 783 + 75, String(E.P.abfahrtMin('spaet', MO)));
        /* gespeicherter Wert aus der alten Version (<= 60) und Müllwerte */
        const F = mk(); F.store['jv_plan_vor_' + MO] = '45'; F.store['jv_plan_vor_2026-11-10'] = '500'; F.store['jv_plan_vor_2026-11-11'] = '-5';
        check('8b.11 alte gespeicherte Werte bleiben gültig (45), Unsinn (500, -5) wird ignoriert', F.P.tagVor(MO) === 45 && F.P.tagVor('2026-11-10') === 0 && F.P.tagVor('2026-11-11') === 0, [F.P.tagVor(MO), F.P.tagVor('2026-11-10'), F.P.tagVor('2026-11-11')].join(','));
        /* Tageswechsel: Frühschicht-Ausnahme am Folgetag beeinflusst Spät nicht, Ausnahme vom Vortag verfällt */
        const G = mk(); await G.satz('Morgen fange ich um 12:33 an');
        check('8b.12 Tageswechsel: Dienstag wieder normal, Montag-Ausnahme bleibt nur Montag', G.P.tagVor('2026-11-10') === 0 && G.P.beginn('spaet', '2026-11-10') === 825 && G.P.tagVor(MO) === 72);
        /* Frühschicht (Woche 02.11.): weit früherer Beginn */
        const H = neu('2026-11-02T12:00:00+01:00', { fahrt: 25 }); await H.satz('Morgen fange ich um 3:30 an');
        const T3 = '2026-11-03';
        check('8b.13 Frühschicht 5:10 -> 3:30: 100 Minuten, Abfahrt 2:55 - Wecker/Plan bleibt stimmig', H.P.tagVor(T3) === 100 && H.P.abfahrtMin('frueh', T3) - H.P.tagVor(T3) === 3 * 60 + 30 - 20 - 25, [H.P.tagVor(T3), H.P.abfahrtMin('frueh', T3)].join(','));
        /* "Früher los" (frueher_los.js) nutzt dieselbe Grenze */
        const K = mk(); const g0 = K.gesagt.length; await K.satz('Ich muss Montag um 12:33 auf der Arbeit sein');
        check('8b.14 Früher los: Montag 12:33 -> 72 Minuten vorgezogen (nicht 60),', K.P.tagVor(MO) === 72, K.gesagt.slice(g0).join('|') + ' ' + K.P.tagVor(MO));
    }
    /* --- 8c. Chef-KI EIN und AUS: die Schicht-Ausnahme wird in beiden Fällen gleich beantwortet (feste Befehle kommen vor der Chef-KI) --- */
    for (const an of [true, false]) {
        const A = neu('2026-11-08T12:00:00+01:00', { fahrt: 22 }); A.P.setBeginn('spaet', 13 * 60 + 45);
        if (an) A.sb.jvChef.an(); else A.sb.jvChef.aus();
        await A.satz('Morgen fange ich um 12:33 an');
        const g0 = A.gesagt.length; await A.satz('Wann muss ich morgen zur Arbeit losfahren?');
        const t = A.gesagt.slice(g0).join('|');
        check('8c Chef-KI ' + (an ? 'EIN' : 'AUS') + ': Antwort nennt Abfahrt 11 Uhr 51, keine Rückfrage nach dem Arbeitsort', /11 Uhr 51/.test(t) && !/Wohin|Arbeitsort|Adresse/.test(t), t);
    }
    /* --- 8d. Zusammengesetzte Frage "Wann muss ich morgen zur Arbeit und wann muss ich losfahren?": nur eine Antwort, keine Rückfrage "Wohin soll es genau gehen?" --- */
    {
        async function zusammen(satz, o) {
            o = o || {}; let groq = 0;
            const native = { planAnsagen: () => true, holeAnsage: () => '', naechsterWecker: () => 0 };
            const A = starte({ jetzt: '2026-11-08T09:16:00+01:00', native, festerZufall: true, fetch: async (u) => { if (/api\/groq/.test(String(u))) { groq++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'Wohin soll es genau gehen, Sir?', actions: [] }) } }] }) }; } throw new Error('offline ' + u); } });
            const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 11, d: 2 });
            A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'frueh', times: { frueh: 225, spaet: 720 }, auto: true }));
            A.store['jv_plan_fahrt'] = JSON.stringify([{ min: 22, at: Date.now() }]);
            A.P = A.sb.jvPlan; A.P.setBeginn('spaet', 13 * 60 + 45);
            if (o.ausnahme) { A.P.setBeginnTag('2026-11-09', 12 * 60 + 33); A.P.setTagVor('2026-11-09', 72); }
            if (o.adresse) A.setze('workAddress', 'Werkstraße 5, 12345 Beispielstadt');
            if (o.chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
            const g0 = A.gesagt.length;
            A.sb.jvTippen(satz); await pause(300); for (let i = 0; i < 20; i++) { A.lassLaufen && await A.lassLaufen(100); await pause(20); }
            return { t: A.gesagt.slice(g0).join(' | '), groq, A };
        }
        const S = 'Wann muss ich morgen zur Arbeit und wann muss ich losfahren?';
        for (const chef of [true, false]) for (const adresse of [true, false]) {
            const r = await zusammen(S, { ausnahme: true, adresse, chef });
            const lbl = 'Chef-KI ' + (chef ? 'EIN' : 'AUS') + ', Arbeitsadresse ' + (adresse ? 'da' : 'fehlt');
            check('8d.1 Ausnahme 12:33 (' + lbl + '): 12:13 da sein, Abfahrt 11 Uhr 51, keine Rückfrage, keine KI', /12 Uhr 33/.test(r.t) && /12 Uhr 13/.test(r.t) && /11 Uhr 51/.test(r.t) && !/Wohin/.test(r.t) && r.groq === 0, r.t + ' groq ' + r.groq);
            check('8d.2 Arbeitsadresse unverändert (' + lbl + ')', adresse ? r.A.lese('workAddress') === 'Werkstraße 5, 12345 Beispielstadt' : !r.A.lese('workAddress'));
        }
        const n = await zusammen(S, { chef: true });
        check('8d.3 normale Spätschicht (kein Ausnahmetag): Beginn 13 Uhr 45, Abfahrt 13 Uhr 3, keine Rückfrage', /13 Uhr 45/.test(n.t) && /gegen 13 Uhr 3 los/.test(n.t) && !/Wohin/.test(n.t) && n.groq === 0, n.t);
        const e = await zusammen('Wann muss ich losfahren?', { chef: false });
        check('8d.4 allein "Wann muss ich losfahren?" geht unverändert den bisherigen Weg (KI)', e.groq === 1, e.t + ' groq ' + e.groq);
        const w = await zusammen('Wann muss ich morgen zur Arbeit und wie wird das Wetter?', { ausnahme: true });
        check('8d.5 echte Zweitfrage (Wetter) geht weiter an die KI, Schichtteil bleibt lokal', w.groq === 1 && /12 Uhr 33/.test(w.t), w.t + ' groq ' + w.groq);
    }
    /* --- 9. Auskunft --- */
    {
        const A = neu('2026-11-02T12:00:00+01:00');
        await A.satz('Wann habe ich morgen Feierabend?');
        check('Feierabend morgen 14 Uhr 37', A.gesagt.some(t => /14 Uhr 37/.test(t)), A.gesagt.join('|'));
        await A.satz('Wann fahre ich heute nach Hause?');
        check('Heimfahrt heute: 14 Uhr 37', A.gesagt.filter(t => /Feierabend/.test(t)).length >= 2, A.gesagt.join('|'));
        await A.satz('Wann muss ich morgen arbeiten?');
        check('Beginn morgen 5 Uhr 10 und Abfahrt', A.gesagt.some(t => /5 Uhr 10/.test(t) && /4 Uhr 50/.test(t)), A.gesagt.join('|'));
        await A.satz('Wann beginnt meine Spätschicht?');
        check('Spätschicht-Beginn 13 Uhr 50', A.gesagt.some(t => /Spätschicht beginnt um 13 Uhr 50/.test(t)), A.gesagt.join('|'));
        await A.satz('Wann muss ich zur Arbeit losfahren?');
        check('Abfahrt wird genannt', A.gesagt.some(t => /Aufbruch|Fahr|fahr|losfahren|Abfahrt/.test(t) && /Uhr/.test(t)), A.gesagt.join('|'));
    }
    /* --- 10. Schichtende nach Mitternacht --- */
    {
        const A = neu('2026-11-09T08:00:00+01:00'), P = A.P;
        await A.satz('Meine Spätschicht endet um 0 Uhr 30');
        check('Ende 0:30 wird als Folgetag gespeichert', P.ende('spaet') === 1470, String(P.ende('spaet')));
        const h = ids(A.plan(), 'heim').find(e => e.id === 'heim|2026-11-09');
        check('Heimfahrt kommt erst um 0:33 am Folgetag, nicht 22 Stunden früher', h && /Di.*00:33/.test(hm(h.at)), h && hm(h.at));
        await A.satz('Wann habe ich heute Feierabend?');
        check('Auskunft nennt nach Mitternacht', A.gesagt.some(t => /0 Uhr 30 \(nach Mitternacht\)/.test(t)), A.gesagt.join('|'));
    }
    /* --- 11. Veraltete Meldungen: Änderung stellt den Plan neu --- */
    {
        const A = neu('2026-11-02T03:00:00+01:00');
        await A.lassLaufen(() => A.P.planSenden(true));
        const n0 = A.cap.length, vorher = A.cap[A.cap.length - 1] || [];
        check('Plan wurde gesendet und enthält Heimfahrt', vorher.some(e => e.id === 'heim|2026-11-03'));
        await A.lassLaufen(() => A.sb.jvUrlaub.setListe([{ von: '2026-11-03', bis: '2026-11-06' }]));
        await A.vorspulen(2000);
        const nach = A.cap[A.cap.length - 1] || [];
        check('Urlaub eingetragen: neuer Plan wurde sofort gesendet', A.cap.length > n0, n0 + ' -> ' + A.cap.length);
        check('Urlaub eingetragen: alte Meldungen für Di-Fr sind weg', !nach.some(e => /^(heim|stau|aufbruch|brief)\|2026-11-0[3-6]$/.test(e.id)), nach.map(e => e.id).join(','));
        const m = A.cap.length;
        const T = A.sb._schichtTest; T.save({ base: T.weekNo({ y: 2026, m: 11, d: 2 }), shift: 'spaet', times: { frueh: 225, spaet: 720 }, auto: true });
        await A.vorspulen(2000);
        check('Schichtwechsel: neuer Plan wurde sofort gesendet', A.cap.length > m, m + ' -> ' + A.cap.length);
    }
    /* --- 12. Wetterfragen gehen an den Wetterweg (KI mit Vorhersage), Essensfragen bleiben beim Essensplan --- */
    {
        const ant = d => ({ ok: true, status: 200, json: async () => d });
        const tage = ['2026-11-06', '2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12'];
        const fc = { daily: { time: tage, weather_code: [3, 63, 3, 3, 3, 3, 3], temperature_2m_max: [10, 12, 9, 9, 9, 9, 9], temperature_2m_min: [5, 8, 4, 4, 4, 4, 4], precipitation_sum: [0, 6.2, 0, 0, 0, 0, 0], precipitation_probability_max: [10, 90, 10, 10, 10, 10, 10], wind_gusts_10m_max: [20, 40, 10, 10, 10, 10, 10], wind_speed_10m_max: [12, 25, 8, 8, 8, 8, 8], sunrise: tage.map(d => d + 'T07:20'), sunset: tage.map(d => d + 'T16:30') } };
        const essen = { gespeichert: '2026-11-02', tage: { Montag: { veg: 'Nudeln', fleisch: 'Gulasch' }, Freitag: { veg: 'Fisch', fleisch: 'Fisch' } } };
        async function frage(jetzt, f) {   // Freitag 06.11.: morgen ist Samstag (der gemeldete Fehler)
            let req = null;
            const A = starte({ jetzt, festerZufall: true, fetch: async (u, o) => {
                if (/\/api\/groq/.test(u)) { req = o && o.body; return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Morgen regnet es, etwa 6 Millimeter.', actions: [] }) } }] }); }
                if (/open-meteo/.test(u)) return ant(fc);
                throw new Error('offline ' + u);
            } });
            A.setze('wxGeocode', async () => ({ lat: 53.5, lon: 10 }));
            A.store['jv_essensplan'] = JSON.stringify(essen);
            A.store['jv_wetter_pos'] = JSON.stringify({ lat: 53.5, lon: 10, at: Date.now() });   // im Test gibt es kein GPS: gemerkter Standort
            const l = await A.satz(f);
            let ki = null;
            if (!l.lokal) { const g1 = A.gesagt.length; await A.lassLaufen(() => A.sb.sendToGroqSmart(f)); await new Promise(r => setImmediate(r)); ki = A.gesagt.slice(g1).join(' | '); }
            return { l, ki, req };
        }
        for (const f of ['Gibt es morgen Regen?', 'Wird es morgen regnen?', 'Regnet es morgen?', 'Wie wird das Wetter morgen?', 'Gibt es heute Regen?', 'Gibt es morgen Schnee?', 'Gibt es heute Gewitter?']) {
            const r = await frage('2026-11-06T10:00:00+01:00', f);
            check('Wetterfrage geht nicht an den Essensplan: ' + f, !r.l.lokal && r.l.modul !== 'essensplan' && !r.l.gesagt.some(t => /Essensplan/.test(t)), r.l.modul + ' ' + r.l.gesagt.join('|'));
            let msgs = []; try { msgs = JSON.parse(r.req).messages; } catch (e) { }
            const sys = msgs.map(m => m.content).join('\n'), usr = msgs.length ? msgs[msgs.length - 1].content : '';
            check('Wetterfrage erreicht die KI als Frage des Nutzers: ' + f, usr === f, usr);
            check('KI-Anfrage enthält die echte Vorhersage (nicht nur den Prompt-Text, kein Fehlerfeld): ' + f, /"wettervorhersage":\s*\{\s*"tage"/.test(sys) && /"wettervorhersage":\s*\{[\s\S]*?"niederschlag_mm":\s*6\.2/.test(sys) && !/"wettervorhersage":\s*\{"fehler"/.test(sys), (sys.match(/"wettervorhersage":.{0,160}/) || [''])[0]);
            check('Wetterfrage bekommt die Wetterantwort: ' + f, r.ki && /regnet es/.test(r.ki), r.ki);
        }
        const fr = [['Gibt es morgen etwas zu essen?', 'Freitag-Plan: morgen ist Samstag -> kein Plan, Montag genannt'], ['Was gibt es morgen zu essen?'], ['Gibt es morgen einen Essensplan?'], ['Was gibt es morgen?']];
        for (const [f] of fr) {
            const r = await frage('2026-11-06T10:00:00+01:00', f);
            check('Essensfrage bleibt beim Essensplan (Samstag): ' + f, r.l.lokal && r.l.modul === 'essensplan' && r.l.gesagt.some(t => /keinen Essensplan/.test(t) && /Gulasch/.test(t)), r.l.modul + ' ' + r.l.gesagt.join('|'));
            check('Essensfrage geht nicht an die KI: ' + f, r.req == null);
        }
        const heut = await frage('2026-11-06T10:00:00+01:00', 'Was gibt es heute zu essen?');
        check('Essensfrage heute nennt das Gericht', heut.l.modul === 'essensplan' && heut.l.gesagt.some(t => /Fisch/.test(t)), heut.l.gesagt.join('|'));
        const mix = await frage('2026-11-06T10:00:00+01:00', 'Was gibt es heute bei Regen zu essen?');
        check('Mischfall "bei Regen zu essen" bleibt Essensplan', mix.l.modul === 'essensplan' && mix.l.gesagt.some(t => /Fisch/.test(t)), mix.l.modul + ' ' + mix.l.gesagt.join('|'));
        const mix2 = await frage('2026-11-06T10:00:00+01:00', 'Was gibt es morgen bei Regen zu essen?');
        check('Mischfall morgen (Samstag) bleibt Essensplan', mix2.l.modul === 'essensplan' && mix2.l.gesagt.some(t => /keinen Essensplan/.test(t)), mix2.l.modul + ' ' + mix2.l.gesagt.join('|'));
    }
    /* --- 11. Natürliche Schichtfragen: Fragen schreiben nie in den Plan, der genannte Tag gilt, Tagesfragen kommen aus dem Plan (nie von der KI), "früher anfangen" --- */
    {
        /* heute So 08.11.2026 09:16: diese Woche Früh, ab Mo 09.11. Spät; Mo 09.11. optional Ausnahme 12:33; Urlaub optional Mi 11.11. */
        async function lauf(satz, o) {
            o = o || {}; let groq = 0;
            const native = { planAnsagen: () => true, holeAnsage: () => '', naechsterWecker: () => 0 };
            const A = starte({ jetzt: '2026-11-08T09:16:00+01:00', native, festerZufall: true, fetch: async (u) => { if (/api\/groq/.test(String(u))) { groq++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'KI-ANTWORT', actions: [] }) } }] }) }; } throw new Error('offline ' + u); } });
            const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 11, d: 2 });
            A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'frueh', times: { frueh: 225, spaet: 720 }, auto: true }));
            if (o.urlaub) A.store['jv_urlaub'] = JSON.stringify(o.urlaub);
            A.store['jv_plan_fahrt'] = JSON.stringify([{ min: 22, at: Date.now() }]);
            A.P = A.sb.jvPlan; A.P.setBeginn('spaet', 13 * 60 + 45);
            if (o.ausnahme) { A.P.setBeginnTag('2026-11-09', 12 * 60 + 33); A.P.setTagVor('2026-11-09', 72); }
            if (o.adresse !== false) A.setze('workAddress', 'Werkstraße 5, 12345 Beispielstadt');
            if (o.chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
            const vorher = A.sb.getPersistentData('jv_schicht', '');
            const g0 = A.gesagt.length;
            A.sb.jvTippen(satz); await pause(300); for (let i = 0; i < 20; i++) { A.lassLaufen && await A.lassLaufen(100); await pause(20); }
            return { t: A.gesagt.slice(g0).join(' | '), groq, A, planGleich: vorher === A.sb.getPersistentData('jv_schicht', ''), btag: ymd => A.P.beginnTag(ymd) };
        }
        for (const chef of [false, true]) {
            const L = 'Chef-KI ' + (chef ? 'EIN' : 'AUS');
            /* 11.1 Fragen ändern den Schichtplan nie (Fehler: "Bin ich nächste Woche in Frühschicht?" hat den Plan überschrieben) */
            for (const q of ['Bin ich nächste Woche in Frühschicht?', 'Bin ich diese Woche in Spätschicht?', 'Habe ich diese Woche Spätschicht?', 'Ist nächste Woche Frühschicht?', 'Muss ich nächste Woche Frühschicht arbeiten?']) {
                const r = await lauf(q, { chef });
                check('11.1 (' + L + ') Frage ändert den Schichtplan nicht: ' + q, r.planGleich && !/Verstanden/.test(r.t), r.t);
            }
            {   // echte Einstellung funktioniert weiter
                const r = await lauf('Nächste Woche Frühschicht', { chef });
                check('11.2 (' + L + ') echte Einstellung "Nächste Woche Frühschicht" ändert weiter den Plan', !r.planGleich && /Verstanden/.test(r.t), r.t);
                const r2 = await lauf('Diese Woche habe ich Spätschicht', { chef });
                check('11.2b (' + L + ') "Diese Woche habe ich Spätschicht" ändert weiter den Plan', !r2.planGleich && /Verstanden/.test(r2.t), r2.t);
            }
            /* 11.3 Abfahrt für den genannten Tag, Ausnahme nur an ihrem Tag (Mo 09.11. = 12:33, Di 10.11. normal 13:45) */
            {
                const r = await lauf('Wann muss ich übermorgen zur Arbeit losfahren?', { chef, ausnahme: true });
                check('11.3 (' + L + ') "übermorgen" (Di): Beginn 13 Uhr 45, nicht die Ausnahme von Montag', /Am Dienstag/.test(r.t) && /13 Uhr 45/.test(r.t) && !/12 Uhr 33|11 Uhr 51/.test(r.t) && r.groq === 0, r.t);
                const r2 = await lauf('Wann muss ich am Dienstag zur Arbeit losfahren?', { chef, ausnahme: true });
                check('11.3b (' + L + ') "am Dienstag": Beginn 13 Uhr 45, Abfahrt 13 Uhr 3', /13 Uhr 45/.test(r2.t) && /13 Uhr 3 los/.test(r2.t) && r2.groq === 0, r2.t);
                const r3 = await lauf('Wann muss ich morgen zur Arbeit losfahren?', { chef, ausnahme: true });
                check('11.3c (' + L + ') "morgen" (Mo): weiter Ausnahme 12:33 → Abfahrt 11 Uhr 51', /12 Uhr 33/.test(r3.t) && /11 Uhr 51/.test(r3.t) && r3.groq === 0, r3.t);
                const r4 = await lauf('Wann muss ich am Samstag zur Arbeit losfahren?', { chef });
                check('11.3d (' + L + ') Samstag: keine Abfahrtszeit, ehrlich keine Schicht', /keine Schicht/.test(r4.t) && /Wochenende/.test(r4.t) && !/los/.test(r4.t) && r4.groq === 0, r4.t);
            }
            /* 11.4 Tagesfragen aus dem Plan */
            {
                const q = async (s, o) => lauf(s, Object.assign({ chef }, o || {}));
                let r = await q('Habe ich am Samstag frei?');
                check('11.4 (' + L + ') "Habe ich am Samstag frei?": frei, Wochenende, keine KI', /Am Samstag hast du frei/.test(r.t) && /Wochenende/.test(r.t) && r.groq === 0, r.t);
                r = await q('Muss ich am Samstag arbeiten?');
                check('11.4b (' + L + ') "Muss ich am Samstag arbeiten?": Nein, keine KI', /^Nein/.test(r.t) && /Wochenende/.test(r.t) && r.groq === 0, r.t);
                r = await q('Habe ich heute frei?');
                check('11.4c (' + L + ') "Habe ich heute frei?" (Sonntag): frei, keine KI', /Heute hast du frei/.test(r.t) && r.groq === 0, r.t);
                r = await q('Habe ich am Dienstag frei?');
                check('11.4d (' + L + ') Dienstag Spätschicht: Nein, Spätschicht, Beginn 13 Uhr 45, keine KI', /^Nein/.test(r.t) && /Spätschicht/.test(r.t) && /13 Uhr 45/.test(r.t) && r.groq === 0, r.t);
                r = await q('Habe ich morgen Frühschicht?', { ausnahme: true });
                check('11.4e (' + L + ') "Habe ich morgen Frühschicht?": Nein, Spätschicht (nicht die Wochenübersicht), keine KI', /^Nein/.test(r.t) && /Spätschicht, nicht Frühschicht/.test(r.t) && r.groq === 0, r.t);
                r = await q('Habe ich morgen Spätschicht?', { ausnahme: true });
                check('11.4f (' + L + ') "Habe ich morgen Spätschicht?": Ja, Beginn 12 Uhr 33 (Ausnahme), einmalige Änderung', /^Ja/.test(r.t) && /12 Uhr 33/.test(r.t) && /einmalige Änderung/.test(r.t) && r.groq === 0, r.t);
                r = await q('Welche Schicht habe ich am Dienstag?');
                check('11.4g (' + L + ') "Welche Schicht habe ich am Dienstag?"', /Am Dienstag hast du Spätschicht/.test(r.t) && /13 Uhr 45/.test(r.t) && r.groq === 0, r.t);
                r = await q('Muss ich am Dienstag arbeiten?');
                check('11.4h (' + L + ') "Muss ich am Dienstag arbeiten?": Ja mit Beginn und Feierabend', /^Ja/.test(r.t) && /13 Uhr 45/.test(r.t) && /22 Uhr 12/.test(r.t) && r.groq === 0, r.t);
                r = await q('Habe ich am Mittwoch frei?', { urlaub: { von: '2026-11-11', bis: '2026-11-11' } });
                check('11.4i (' + L + ') Urlaubstag: frei wegen Urlaub', /hast du frei/.test(r.t) && /Urlaub/.test(r.t) && r.groq === 0, r.t);
                r = await q('Habe ich Samstag frei und wie wird das Wetter?');
                check('11.4j (' + L + ') Mehrfachfrage bleibt auf dem bisherigen Weg (nicht von der Tagesfrage geschluckt)', !/^Am Samstag hast du frei, es ist Wochenende\.$/.test(r.t), r.t);
            }
            /* 11.5 "früher anfangen": nichts raten, einmalige Änderung, Normalplan unverändert */
            {
                let r = await lauf('Ich muss morgen früher anfangen.', { chef });
                check('11.5 (' + L + ') ohne Angabe: Nachfrage, keine KI, nichts gespeichert', /Wie viele Minuten früher oder um wie viel Uhr/.test(r.t) && r.groq === 0 && !r.btag('2026-11-09'), r.t);
                r = await lauf('Ich muss morgen 30 Minuten früher anfangen. Wann muss ich losfahren?', { chef });
                check('11.5b (' + L + ') 30 Minuten früher: Beginn 13:15 nur morgen, Abfahrt genannt, keine KI, Normalbeginn unverändert', /13 Uhr 15 statt um 13 Uhr 45/.test(r.t) && /Abfahrt gegen 12 Uhr 33/.test(r.t) && r.groq === 0 && r.btag('2026-11-09') === 13 * 60 + 15 && r.A.P.beginn('spaet') === 13 * 60 + 45 && !r.btag('2026-11-10'), r.t + ' | ' + r.btag('2026-11-09'));
                r = await lauf('Ich muss morgen um 12:33 anfangen. Wann muss ich losfahren?', { chef });
                check('11.5c (' + L + ') mit Uhrzeit weiter wie bisher: 12:33 → Abfahrt 11 Uhr 51', /12 Uhr 33/.test(r.t) && /11 Uhr 51/.test(r.t) && r.groq === 0, r.t);
                r = await lauf('Ich muss morgen 5 Stunden früher anfangen', { chef });
                check('11.5d (' + L + ') unsinnige Menge (über 180 Minuten): Nachfrage statt Speichern', /Wie viele Minuten früher oder um wie viel Uhr/.test(r.t) && !r.btag('2026-11-09'), r.t);
            }
        }
        /* 11.6 bisherige Auskünfte unverändert (Beispielfragen aus dem Auftrag) */
        for (const chef of [false, true]) {
            const L = 'Chef-KI ' + (chef ? 'EIN' : 'AUS');
            for (const [f, re] of [['Wann muss ich morgen arbeiten?', /Morgen hast du Spätschicht, Beginn um 12 Uhr 33/], ['Welche Schicht habe ich nächste Woche?', /Nächste Woche hast du Spätschicht/], ['Wann habe ich Feierabend?', /22 Uhr 12 Feierabend/], ['Wann muss ich morgen zur Arbeit losfahren?', /11 Uhr 51/]]) {
                const r = await lauf(f, { chef, ausnahme: true });
                check('11.6 (' + L + ') unverändert: ' + f, re.test(r.t) && r.groq === 0, r.t);
            }
        }
    }
    /* --- 12. Kombinationen: eine zweite Frage nach "und" geht nicht verloren; Tagesfrage + "wann muss ich losfahren" kommt aus dem Plan --- */
    {
        async function lauf(satz, o) {
            o = o || {}; let groq = 0; const kiFragen = [];
            const native = { planAnsagen: () => true, holeAnsage: () => '', naechsterWecker: () => 0 };
            const A = starte({ jetzt: '2026-11-08T09:16:00+01:00', native, festerZufall: true, sprechenBeendet: true, fetch: async (u, init) => { if (/api\/groq/.test(String(u))) { groq++; try { const m = JSON.parse(init.body).messages; kiFragen.push(String((m[m.length - 1] || {}).content || '')); } catch (e) { } return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'KI-ANTWORT', actions: [] }) } }] }) }; } throw new Error('offline ' + u); } });
            const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 11, d: 2 });
            A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'frueh', times: { frueh: 225, spaet: 720 }, auto: true }));
            A.store['jv_plan_fahrt'] = JSON.stringify([{ min: 22, at: Date.now() }]);
            A.P = A.sb.jvPlan; A.P.setBeginn('spaet', 13 * 60 + 45);
            A.P.setBeginnTag('2026-11-09', 12 * 60 + 33); A.P.setTagVor('2026-11-09', 72);
            A.setze('workAddress', 'Werkstraße 5, 12345 Beispielstadt');
            if (o.chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
            const g0 = A.gesagt.length;
            A.sb.jvTippen(satz); await pause(300);
            if (o.vor) { await A.vorspulen(2500); await pause(50); await A.vorspulen(1500); await pause(50); } else { for (let i = 0; i < 20; i++) { A.lassLaufen && await A.lassLaufen(100); await pause(20); } }   // Sprechen dauert 2 s: danach geht die zweite Frage weiter
            return { t: A.gesagt.slice(g0).join(' | '), groq, kiFragen };
        }
        for (const chef of [false, true]) {
            const L = 'Chef-KI ' + (chef ? 'EIN' : 'AUS');
            let r = await lauf('Wann muss ich morgen zur Arbeit losfahren und wie wird das Wetter?', { chef, vor: true });
            check('12.1 (' + L + ') Abfahrt UND Wetterfrage: beide beantwortet (Abfahrt 11 Uhr 51 mit Ausnahme, Wetterfrage geht weiter)', /11 Uhr 51/.test(r.t) && r.groq >= 1 && r.kiFragen.some(f => /wetter/i.test(f)) && r.t.indexOf('11 Uhr 51') < r.t.indexOf('KI-ANTWORT'), r.t + ' KI: ' + JSON.stringify(r.kiFragen));
            r = await lauf('Wann muss ich übermorgen zur Arbeit losfahren und wie lange brauche ich dahin?', { chef, vor: true });
            check('12.2 (' + L + ') zweite Frage zur Fahrzeit geht weiter, die Abfahrt gilt für den genannten Tag (Di 13:45, nicht die Ausnahme von Montag)', /13 Uhr 45/.test(r.t) && !/12 Uhr 33|11 Uhr 51/.test(r.t) && r.kiFragen.some(f => /brauche ich/i.test(f)), r.t + ' KI: ' + JSON.stringify(r.kiFragen));
            r = await lauf('Wann muss ich morgen zur Arbeit losfahren?', { chef });
            check('12.3 (' + L + ') Einzelfrage unverändert: Abfahrt, keine KI', /11 Uhr 51/.test(r.t) && r.groq === 0, r.t);
            r = await lauf('Muss ich morgen arbeiten und wann muss ich losfahren?', { chef });
            check('12.4 (' + L + ') Tagesfrage + "wann muss ich losfahren": aus dem Plan (Ausnahme 12:33, Abfahrt 11 Uhr 51), keine KI', /^Ja/.test(r.t) && /12 Uhr 33/.test(r.t) && /Fahr gegen 11 Uhr 51 los/.test(r.t) && r.groq === 0, r.t);
            r = await lauf('Muss ich am Samstag arbeiten und wann muss ich losfahren?', { chef });
            check('12.5 (' + L + ') Samstag: Nein, keine erfundene Abfahrtszeit, keine KI', /^Nein/.test(r.t) && !/Fahr gegen/.test(r.t) && r.groq === 0, r.t);
            r = await lauf('Habe ich am Dienstag frei und wann muss ich losfahren?', { chef });
            check('12.6 (' + L + ') Dienstag (Spätschicht, normal): Abfahrt 13 Uhr 3 ohne Ausnahme', /^Nein/.test(r.t) && /Fahr gegen 13 Uhr 3 los/.test(r.t) && r.groq === 0, r.t);
            r = await lauf('Wann muss ich morgen zur Arbeit losfahren und wie wird das Wetter?', { chef, vor: true });
            check('12.7 (' + L + ') Wetterteil bekommt den Tag der Abfahrt mit (sonst fragt die KI nach Ort und Tag)', r.kiFragen.some(f => /wie wird das wetter morgen/i.test(f)), JSON.stringify(r.kiFragen));
            r = await lauf('Wann muss ich übermorgen zur Arbeit losfahren und wie wird das Wetter?', { chef, vor: true });
            check('12.8 (' + L + ') übermorgen: Wetterteil mit "übermorgen"', r.kiFragen.some(f => /wetter übermorgen/i.test(f)), JSON.stringify(r.kiFragen));
            r = await lauf('Wann muss ich zur Arbeit losfahren und wie wird das Wetter?', { chef, vor: true });
            check('12.9 (' + L + ') ohne genannten Tag: nächster Arbeitstag (morgen) gilt auch für das Wetter', r.kiFragen.some(f => /wetter morgen/i.test(f)), JSON.stringify(r.kiFragen));
            r = await lauf('Wann muss ich morgen zur Arbeit losfahren und wie wird das Wetter in Hamburg?', { chef, vor: true });
            check('12.10 (' + L + ') Wetterteil mit eigenem Ort (Hamburg) geht weiter an den Ortsweg, keine Rückfrage nach dem Ort', /Hamburg/.test(r.t) && !/Welchen Ort|welchen Ort/.test(r.t), r.t);
        }
    }
    /* --- 13. Einmalige Ausnahme "Montag 13:33": "13 Uhr 33" behält die Minuten, "Montag beginnt meine Schicht um 13.33" ist eine Ausnahme (nicht KI, nicht die feste Zeit) --- */
    {
        for (const chef of [false, true]) {
            const L = 'Chef-KI ' + (chef ? 'EIN' : 'AUS');
            for (const [satz, soll] of [['Ich muss Montag um 13 Uhr 33 auf der Arbeit sein', 813], ['Montag fange ich um 13 Uhr 33 an', 813], ['Montag beginnt meine Schicht um 13.33', 813], ['Meine Schicht beginnt am Montag um 13.33 Uhr', 813], ['Ich muss morgen um 13:33 auf der Arbeit sein', 813]]) {
                let groq = 0;
                const native = { planAnsagen: () => true, holeAnsage: () => '', naechsterWecker: () => 0 };
                const A = starte({ jetzt: '2026-11-08T15:20:00+01:00', native, festerZufall: true, sprechenBeendet: true, fetch: async u => { if (/api\/groq/.test(String(u))) { groq++; return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'KI', actions: [] }) } }] }) }; } throw new Error('offline ' + u); } });
                const T = A.sb._schichtTest, wn = T.weekNo({ y: 2026, m: 11, d: 2 });
                A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: wn, shift: 'frueh', times: { frueh: 225, spaet: 720 }, auto: true }));
                A.P = A.sb.jvPlan; A.P.setBeginn('spaet', 13 * 60 + 45);
                if (chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
                const g0 = A.gesagt.length;
                A.sb.jvTippen(satz); await pause(300);
                for (let i = 0; i < 10; i++) { A.lassLaufen && await A.lassLaufen(100); await pause(20); }
                const t = A.gesagt.slice(g0).join(' | ');
                check('13.1 (' + L + ') ' + satz + ': Beginn Montag 13:33 gemerkt, nicht an die KI', A.P.beginnTag('2026-11-09') === soll && /13 Uhr 33/.test(t) && groq === 0, t + ' Tag ' + A.P.beginnTag('2026-11-09') + ' groq ' + groq);
            }
            for (const satz of ['Meine Spätschicht beginnt um 13 Uhr 40', 'Ab Montag beginnt meine Spätschicht um 13 Uhr 40']) {
                const native = { planAnsagen: () => true, holeAnsage: () => '', naechsterWecker: () => 0 };
                const A = starte({ jetzt: '2026-11-08T15:20:00+01:00', native, festerZufall: true, sprechenBeendet: true, fetch: async u => { if (/api\/groq/.test(String(u))) return { ok: true, status: 200, json: async () => ({ choices: [{ message: { content: JSON.stringify({ reply: 'KI', actions: [] }) } }] }) }; throw new Error('offline ' + u); } });
                A.sb.setPersistentData('jv_schicht', JSON.stringify({ base: A.sb._schichtTest.weekNo({ y: 2026, m: 11, d: 2 }), shift: 'frueh', times: { frueh: 225, spaet: 720 }, auto: true }));
                A.P = A.sb.jvPlan; A.P.setBeginn('spaet', 13 * 60 + 45);
                if (chef) A.sb.jvChef.an(); else A.sb.jvChef.aus();
                A.sb.jvTippen(satz); await pause(300);
                for (let i = 0; i < 10; i++) { A.lassLaufen && await A.lassLaufen(100); await pause(20); }
                check('13.2 (' + L + ') ' + satz + ': keine Tagesausnahme (feste Zeit bzw. KI)', A.P.beginnTag('2026-11-09') === 0, 'Tag ' + A.P.beginnTag('2026-11-09'));
            }
        }
    }
    console.log(fehler ? 'FEHLER: ' + fehler + ' (ok ' + ok + ')' : 'alles ok (' + ok + ' Prüfungen)');
    process.exit(fehler ? 1 : 0);
})();
