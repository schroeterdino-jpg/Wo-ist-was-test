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
    /* --- 13. Heute/morgen arbeiten? Wochenende darf nie als "morgen geht es los" enden --- */
    {
        async function frage(jetzt, f, o) { const A = neu(jetzt, o); const r = await A.satz(f); return { A, r, t: r.gesagt.join(' | ') }; }
        const montagSpaet = /Montag, Spätschicht von 13 Uhr 50 bis 22 Uhr 12/;
        let x = await frage('2026-11-07T12:00:00+01:00', 'Muss ich heute Abend arbeiten?');   // der gemeldete Fall: Samstag
        check('Samstag: "Muss ich heute Abend arbeiten?" wird lokal beantwortet', x.r.lokal, x.t);
        check('Samstag: keine Schicht, Wochenende, nächster Arbeitstag Montag (nicht morgen)', /keine Schicht/.test(x.t) && /Wochenende/.test(x.t) && montagSpaet.test(x.t) && !/morgen/i.test(x.t), x.t);
        for (const f of ['Arbeite ich morgen?', 'Muss ich morgen arbeiten?', 'Habe ich morgen Schicht?', 'Habe ich morgen frei?']) {   // morgen = Sonntag
            x = await frage('2026-11-07T12:00:00+01:00', f);
            check('Samstag: ' + f + ' -> Sonntag frei, nächster Arbeitstag Montag', x.r.lokal && /Morgen hast du keine Schicht/.test(x.t) && montagSpaet.test(x.t), x.t);
        }
        x = await frage('2026-11-07T12:00:00+01:00', 'Habe ich heute Schicht?');
        check('Samstag: "Habe ich heute Schicht?" nennt heute, nicht nur die Wochenschicht', /Heute hast du keine Schicht/.test(x.t) && !/Diese Woche hast du/.test(x.t), x.t);
        x = await frage('2026-11-08T12:00:00+01:00', 'Muss ich heute arbeiten?');
        check('Sonntag: keine Schicht, morgen (Montag) Spätschicht', /Heute hast du keine Schicht/.test(x.t) && /morgen, Montag, Spätschicht von 13 Uhr 50 bis 22 Uhr 12/.test(x.t), x.t);
        x = await frage('2026-11-06T20:00:00+01:00', 'Muss ich heute noch arbeiten?');
        check('Freitagabend (Früh): Schicht schon vorbei, nächster Arbeitstag Montag', /schon vorbei/.test(x.t) && /Montag, Spätschicht/.test(x.t), x.t);
        x = await frage('2026-11-06T20:00:00+01:00', 'Arbeite ich morgen?');
        check('Freitagabend: morgen Samstag frei', /Morgen hast du keine Schicht/.test(x.t), x.t);
        x = await frage('2026-11-04T10:00:00+01:00', 'Muss ich heute Abend arbeiten?');
        check('Früh-Arbeitstag: heute Abend nicht mehr, Schichtzeit genannt', /Abend musst du nicht mehr arbeiten/.test(x.t) && /5 Uhr 10 bis 14 Uhr 37/.test(x.t), x.t);
        x = await frage('2026-11-04T10:00:00+01:00', 'Muss ich morgen arbeiten?');
        check('Früh-Arbeitstag: morgen Frühschicht', /Morgen hast du Frühschicht von 5 Uhr 10 bis 14 Uhr 37/.test(x.t), x.t);
        x = await frage('2026-11-09T10:00:00+01:00', 'Muss ich heute Abend arbeiten?');
        check('Spät-Arbeitstag: heute Abend Spätschicht bis 22:12', /Spätschicht von 13 Uhr 50 bis 22 Uhr 12/.test(x.t) && !/nicht mehr/.test(x.t), x.t);
        x = await frage('2026-11-03T10:00:00+01:00', 'Muss ich morgen arbeiten?', { urlaub: { von: '2026-11-04', bis: '2026-11-05' } });
        check('Urlaub: morgen frei wegen Urlaub, nächster Arbeitstag Freitag', /Morgen hast du keine Schicht, du hast Urlaub/.test(x.t) && /Freitag, Frühschicht/.test(x.t), x.t);
        x = await frage('2026-11-07T12:00:00+01:00', 'Welche Schicht habe ich?');
        check('Bestehende Schichtfrage bleibt: Welche Schicht habe ich?', /Diese Woche hast du Frühschicht/.test(x.t), x.t);
        x = await frage('2026-11-07T12:00:00+01:00', 'Habe ich nächste Woche Frühschicht?');
        check('Frage nach der Woche geht weiter an den alten Schichtbefehl', !/keine Schicht/.test(x.t), x.t);
        const A = neu('2026-11-07T12:00:00+01:00'), w = A.sb.jvSchichtWissen();
        const l = w && w.heute_und_naechster_arbeitstag;
        check('KI-Kontext: heute ist Samstag, arbeitet nicht (Wochenende)', l && l.heute.wochentag === 'Samstag' && l.heute.arbeitet === false && l.heute.grund === 'Wochenende', JSON.stringify(l));
        check('KI-Kontext: nächster Arbeitstag Montag 09.11., Spätschicht 13 Uhr 50', l && l.naechster_arbeitstag.wochentag === 'Montag' && l.naechster_arbeitstag.datum === '2026-11-09' && l.naechster_arbeitstag.schicht === 'Spätschicht' && l.naechster_arbeitstag.beginn === '13 Uhr 50', JSON.stringify(l));
        const B = neu('2026-11-04T10:00:00+01:00'), l2 = B.sb.jvSchichtWissen().heute_und_naechster_arbeitstag;
        check('KI-Kontext an einem Früh-Arbeitstag um 10 Uhr: Schicht läuft gerade, nächster Arbeitstag ist heute', l2.heute.arbeitet === true && l2.heute.schicht === 'Frühschicht' && l2.heute.status === 'läuft gerade' && l2.naechster_arbeitstag.datum === '2026-11-04' && l2.naechster_arbeitstag.ist_heute === true, JSON.stringify(l2));
        const prompt = require('fs').readFileSync(__dirname + '/../js/prompt.js', 'utf8');
        check('Prompt verweist auf heute_und_naechster_arbeitstag', /heute_und_naechster_arbeitstag/.test(prompt));
    }
    console.log(fehler ? 'FEHLER: ' + fehler + ' (ok ' + ok + ')' : 'alles ok (' + ok + ' Prüfungen)');
    process.exit(fehler ? 1 : 0);
})();
