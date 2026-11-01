/* ============================================================
   TESTS für Agenten-Stufe 1 (Ausflug): Start: node tests/ausflug_agent.js
   "Plane Samstag einen Ausflug mit den Kindern und kümmer dich darum" -> Plan -> konkrete Frage -> erst nach "Ja" Kalendereintrag -> Ergebnis ehrlich.
   Echte Module (ausflug.js, commands.js, fragen_reihenfolge.js, actions.js mit allen Hüllen, antwort_bau.js), Attrappen für Netz, Wetter und Standort.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const antwort = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const pause = ms => new Promise(r => setTimeout(r, ms));
const SA = '2026-10-31', SO = '2026-11-01';   // heute ist Mittwoch, 28.10.2026
const STAND = { lat: 53.5, lon: 10 };

const TIERPARK = { name: 'Wildpark Schwarze Berge', lat: 53.4, lon: 10.0, street: 'Am Wildpark', city: 'Rosengarten' };
const MINIGOLF = { name: 'Minigolf Hamburg Süd', lat: 53.45, lon: 10.05 };
const INDOOR = { name: 'Indoor Spielplatz Bunte Welt', lat: 53.52, lon: 10.02 };
const BAD = { name: 'Hallenbad Harburg', lat: 53.46, lon: 9.98 };

/* opt: regen true|false|'aus' (Wetterdienst fällt aus), route 'ok'|'aus', orte (Antwort der Ortssuche je Suchwort-Teil), google true|false, termine [], speicher {} */
function neu(opt) {
    opt = opt || {};
    const calls = [], suchen = [], posts = [];
    const app = starte({
        jetzt: '2026-10-28T10:00:00+01:00', festerZufall: true, speicher: opt.speicher || {},
        fetch: async (u, o) => {
            u = String(u); calls.push(u + ' ' + String((o && o.method) || 'GET'));
            if (/\/api\/maps\?action=places/.test(u)) {
                const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || ''); suchen.push(q);
                const drinnen = /Indoor|Hallenbad|Museum|Bowling/.test(q);
                const liste = opt.orte ? opt.orte(q, drinnen) : (drinnen ? [INDOOR, BAD] : [TIERPARK, MINIGOLF]);
                return antwort({ places: liste.map(p => Object.assign({ hours: '', openNow: undefined }, p)) });
            }
            if (/\/api\/route/.test(u)) { if (opt.route === 'aus') throw new Error('route kaputt'); return antwort({ routes: [{ duration: 2100 }] }); }   // 35 Minuten
            if (/googleapis\.com\/calendar\/v3\/calendars\/primary\/events$/.test(u) && o && o.method === 'POST') { posts.push(JSON.parse(o.body)); return antwort({ id: 'g_ausflug_42', status: 'confirmed' }); }
            if (/googleapis\.com\/calendar/.test(u)) return antwort({ items: [] });
            if (/\/api\/groq/.test(u)) return antwort({ choices: [{ message: { content: JSON.stringify({ reply: 'Okay.', actions: [] }) } }] });
            throw new Error('offline (Attrappe): ' + u);
        }
    });
    if (opt.google !== false) app.vm.runInContext("accessToken='tok'; googleTokenExpiresAt=Date.now()+3600000*24*365", app.sb);
    app.setze('wetterPosition', async () => STAND);
    app.setze('fetchWeatherForecast', async () => {
        if (opt.regen === 'aus') throw new Error('wetter kaputt');
        const regen = opt.regen === true;
        return { tage: [SA, SO, '2026-10-29'].map(d => ({ datum: d, regenwahrscheinlichkeit_prozent: regen ? 90 : 5, niederschlag_mm: regen ? 8 : 0, hoechstwert_grad: 14 })) };
    });
    (opt.termine || []).forEach(t => app.lese('calendarEntries').push(t));
    app.calls = calls; app.suchen = suchen; app.posts = posts;
    return app;
}
const termin = (iso, text) => ({ id: 'x' + text + iso, text, date: 'x', isoDate: new Date(iso).toISOString(), location: '' });
const eintraege = app => JSON.parse(app.vm.runInContext('JSON.stringify(calendarEntries.map(e => e.text))', app.sb));
const spricht = x => (x.gesagt || []).join(' ');
async function satz(app, t) { const x = await app.satz(t); await pause(120); await app.lassLaufen(async () => { }); x.alles = app.gesagt.slice(); return x; }
const letztes = app => app.gesagt[app.gesagt.length - 1] || '';
const AGENT = 'Plane Samstag einen Ausflug mit den Kindern und kümmer dich darum.';

(async () => {
    /* 1 Hauptsatz */
    {
        const app = neu();
        await satz(app, AGENT);
        const g = letztes(app);
        check('1 Agentensatz: Plan mit Empfehlung, Fahrzeit und Alternativen', /Ich würde .+ empfehlen/.test(g) && /Fahr gegen \d\d:\d\d Uhr los/.test(g) && /Alternativ: /.test(g), g);
        check('1 … und Karten mit Route (vorhandene Darstellung) statt neuer Oberfläche', app.calls.some(c => /action=places/.test(c)), '');
        check('8 konkrete Folgefrage statt "Soll ich?"', /Soll ich .+ für Samstag um \d\d:\d\d Uhr in deinen Kalender eintragen\?$/.test(g), g);
        check('9 vor dem Ja: nichts im Kalender, kein Google-Aufruf zum Schreiben', eintraege(app).length === 0 && app.posts.length === 0, JSON.stringify(eintraege(app)));
    }
    /* Weitere Wortlaute aus dem Auftrag */
    for (const [t, erwartet] of [
        ['Jarvis, wir wollen Samstag mit den Kindern etwas unternehmen. Kümmer dich darum.', true],
        ['Such uns für Samstag etwas mit den Kindern und kümmer dich darum', true],
        ['Was können wir Samstag machen? Kümmer dich darum.', 'frage'],
        ['Organisiere uns einen Ausflug fürs Wochenende', 'frage'],
        ['Plane einen Ausflug für morgen', 'frage'],
        ['Kümmer dich um unseren Ausflug am Samstag', 'frage'],
        ['Plane unseren Samstag', 'frage']
    ]) {
        const app = neu(); const x = await satz(app, t); const g = letztes(app);
        const ok1 = erwartet === true ? /Soll ich .+ eintragen\?$/.test(g) : /Wer kommt mit|Soll ich .+ eintragen\?/.test(g);
        check('Wortlaut erkannt: ' + t, ok1, g + ' | ' + x.modul);
    }
    /* 2 vorhandener Termin */
    {
        const app = neu({ termine: [termin(SA + 'T10:00:00+02:00', 'Zahnarzt')] });   // 31.10. ist noch Sommerzeit-frei? (+01:00 gilt ab 25.10.)
        const app2 = neu({ termine: [termin(SA + 'T10:00:00+01:00', 'Zahnarzt')] });
        await satz(app2, AGENT); const g = letztes(app2);
        check('2 vorhandener Termin (10 Uhr) wird genannt und der Vorschlag liegt danach', /Um 10:00 Uhr hast du Zahnarzt/.test(g) && /Fahr gegen 11:15 Uhr los/.test(g), g);
        const voll = neu({ termine: ['08:00', '10:00', '12:00', '14:00', '16:00'].map(h => termin(SA + 'T' + h + ':00+01:00', 'Termin ' + h)) });
        await satz(voll, AGENT); const gv = letztes(voll);
        check('2 ganzer Tag belegt: ehrlich sagen und anderen Tag anbieten, nichts vorgeschlagen', /Samstag ist bei dir schon ziemlich voll\. Soll ich stattdessen Sonntag prüfen\?/.test(gv) && !/empfehlen/.test(gv), gv);
        await satz(voll, 'Ja'); const g2 = letztes(voll);
        check('2 … "Ja" prüft den Sonntag; Kalender unverändert (keine Eintragung)', /Sonntag/.test(g2) && /Ich würde/.test(g2) && voll.posts.length === 0 && eintraege(voll).length === 5, g2);
    }
    /* 3/4 Wetter */
    {
        const regen = neu({ regen: true }); await satz(regen, AGENT);
        check('3 Regen bevorzugt Indoor (Suche nach Indoor-Orten, Empfehlung drinnen)', regen.suchen.some(q => /Indoor|Hallenbad|Museum|Bowling/.test(q)) && !regen.suchen.some(q => /Tierpark|Freizeitpark|Minigolf/.test(q)) && /Indoor Spielplatz|Hallenbad/.test(letztes(regen)) && /Regen/.test(letztes(regen)), letztes(regen) + ' | ' + regen.suchen.join(','));
        const gut = neu({ regen: false }); await satz(gut, AGENT);
        check('4 gutes Wetter erlaubt Outdoor', gut.suchen.some(q => /Tierpark|Freizeitpark|Minigolf/.test(q)) && /Wildpark|Minigolf/.test(letztes(gut)) && /trocken/.test(letztes(gut)), letztes(gut));
        const ind = neu({ regen: false }); await satz(ind, 'Plane Sonntag etwas Indoor mit den Kindern und kümmer dich darum');
        check('Wunsch "Indoor" schlägt gutes Wetter', ind.suchen.some(q => /Indoor|Hallenbad/.test(q)) && !ind.suchen.some(q => /Tierpark/.test(q)), ind.suchen.join(','));
    }
    /* 5 negativ bewerteter Ort */
    {
        const sp = { jv_ausfluege: JSON.stringify([{ name: 'Wildpark Schwarze Berge', art: 'ausflug', datum: '2026-09-01', urteil: 'schlecht', punkte: [], am: '2026-09-02' }]) };
        const app = neu({ speicher: sp }); await satz(app, AGENT); const g = letztes(app);
        check('5 schlecht bewerteter Ort wird nicht vorgeschlagen', !/Wildpark Schwarze Berge/.test(g) && /Minigolf/.test(g), g);
    }
    /* 6/7 Ausfälle */
    {
        const w = neu({ regen: 'aus' }); await satz(w, AGENT); const g = letztes(w);
        check('6 Wetterausfall bricht nicht ab, wird ehrlich genannt', /Das Wetter konnte ich nicht berücksichtigen/.test(g) && /Ich würde .+ empfehlen/.test(g) && /Soll ich .+ eintragen\?$/.test(g), g);
        const r = neu({ route: 'aus' }); await satz(r, AGENT); const gr = letztes(r);
        check('7 Fahrzeitausfall bricht nicht ab, Schätzung wird als Schätzung gesagt', /geschätzt etwa \d+ Minuten/.test(gr) && /Soll ich .+ eintragen\?$/.test(gr), gr);
        const ro = neu(); await satz(ro, AGENT);
        check('7 mit Route: echte Fahrzeit (35 min + 10 % → 40) statt Luftlinien-Schätzung', /ungefähr 40 Minuten/.test(letztes(ro)) && ro.calls.some(c => /\/api\/route/.test(c)), letztes(ro));
    }
    /* 9–11, 13 Ja / Nein / Erfolg / Google-ID */
    {
        const app = neu(); await satz(app, AGENT);
        const frage = letztes(app);
        await satz(app, 'Ja'); const g = letztes(app);
        check('9 nach "Ja": Kalendereintrag bei Google angelegt, Ausflug-Titel, Dauer länger als eine Stunde', app.posts.length === 1 && /^Ausflug: /.test(app.posts[0].summary) && (new Date(app.posts[0].end.dateTime) - new Date(app.posts[0].start.dateTime)) / 60000 > 60, JSON.stringify(app.posts[0]) + JSON.stringify(eintraege(app)));
        check('11 Erfolg: "Erledigt. Der Ausflug steht Samstag um HH:MM Uhr im Kalender."', /^Erledigt\. Der Ausflug steht Samstag um \d\d:\d\d Uhr im Kalender\./.test(g), g);
        const m = frage.match(/für Samstag um (\d\d:\d\d) Uhr/);
        check('11 … Uhrzeit im Eintrag = Uhrzeit in der Frage', !!m && g.includes('um ' + m[1] + ' Uhr'), frage + ' || ' + g);
        const le = app.sb.jvAusflug.letzteEintragung();
        check('13 Google-ID läuft intern mit (aus PR #325), wird nicht vorgelesen', le && le.googleId === 'g_ausflug_42' && !/g_ausflug_42/.test(app.gesagt.join(' ')), JSON.stringify(le));
        await satz(app, 'Ja');
        check('9 … genau ein Ausflug-Eintrag (das zweite "Ja" gehört der neuesten Frage, der Push-Erinnerung des Kalenders, nicht dem Ausflug)', app.posts.filter(x => /^Ausflug: /.test(x.summary)).length === 1 && /Push|Stunden vorher/.test(g), 'Posts: ' + app.posts.map(x => x.summary).join(' | '));
    }
    {
        const app = neu(); await satz(app, AGENT);
        await satz(app, 'Nein'); const g = letztes(app);
        check('10 "Nein" schreibt nichts', eintraege(app).length === 0 && app.posts.length === 0 && /lassen wir es/.test(g), g);
        await satz(app, 'Ja');
        check('10 … und ein späteres "Ja" trägt auch nichts ein', eintraege(app).length === 0 && app.posts.length === 0);
    }
    {   // ohne Google: lokal gespeichert, aber ehrlich als Teilfehler
        const app = neu({ google: false }); await satz(app, AGENT); await satz(app, 'Ja'); const g = letztes(app);
        check('12 nur lokal gespeichert: kein "Erledigt", sondern Teilfehler-Satz', /Den Ausflug habe ich geplant, aber der Kalendereintrag konnte nicht mit Google synchronisiert werden\./.test(g) && !/^Erledigt/.test(g), g);
    }
    /* 12 No-op und Fehler */
    {
        const noop = neu(); await satz(noop, AGENT);
        noop.setze('executeAction', async function (a, t, ctx) { (ctx[Symbol.for('jv.nichtsGetan')] = ctx[Symbol.for('jv.nichtsGetan')] || []).push('Der Termin war schon da, es wurde nichts geändert.'); });
        await satz(noop, 'Ja'); const g = letztes(noop);
        check('12 Kalender-No-op: keine falsche Erfolgsmeldung', !/Erledigt|steht .* im Kalender/.test(g) && /nichts geändert/.test(g), g);
        const err = neu(); await satz(err, AGENT);
        err.setze('executeAction', async function () { const e = new Error('HTTP 500'); e.userMessage = 'Der Kalender hat gerade nicht geantwortet.'; throw e; });
        await satz(err, 'Ja'); const ge = letztes(err);
        check('12 Kalender-Fehler: keine falsche Erfolgsmeldung, keine Technik', !/Erledigt|steht .* im Kalender/.test(ge) && /der Kalender hat gerade nicht geantwortet/i.test(ge) && /geplant/.test(ge) && !/HTTP 500/.test(ge), ge);
        const dub = neu(); await satz(dub, AGENT);
        const f = letztes(dub).match(/Soll ich (.+) für Samstag um (\d\d:\d\d) Uhr/);
        dub.lese('calendarEntries').push(termin(SA + 'T' + f[2] + ':00+01:00', 'Ausflug: ' + f[1]));
        await satz(dub, 'Ja'); const gd = letztes(dub);
        check('12 Ausflug steht schon im Kalender: "nichts geändert", kein zweiter Eintrag', /schon im Kalender/.test(gd) && !/^Erledigt/.test(gd) && dub.posts.length === 0, gd);
    }
    /* 14 Nicht-Ausflug wird nicht geschluckt */
    for (const t of ['Meine Versicherung ist zu teuer. Kümmer dich darum.', 'Mein Auto macht Geräusche. Kümmer dich darum.', 'Ich habe Ärger mit meinem Vermieter. Kümmer dich darum.', 'Die Kinder brauchen bis Samstag neue Schuhe. Kümmer dich darum.']) {
        const app = neu(); const x = await satz(app, t);
        check('14 "Kümmer dich darum" bei Nicht-Ausflug geht NICHT an den Ausflug: ' + t, !/ausflug/.test(x.modul || '') && !app.suchen.length && !app.sb.jvAusflug.agentAnfrage(t.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/[.,!?]/g, '')), x.modul + ' | ' + app.gesagt.join(' '));
    }
    /* 15/16 bestehende Ausflugsfunktionen */
    {
        const app = neu(); const x = await satz(app, 'Was können wir Samstag mit den Kindern machen?'); const g = letztes(app);
        check('15 normale Ausflugsfrage: unveränderter Ablauf (Ideen + Karten, KEINE Eintragsfrage)', /habe ich drei Ideen/.test(g) && /Da waren wir schon/.test(g) && !/in deinen Kalender eintragen/.test(g) && /ausflug/.test(x.modul || ''), g + ' | ' + x.modul);
        await satz(app, 'Ja'); check('15 … ein "Ja" danach trägt nichts ein', eintraege(app).length === 0 && app.posts.length === 0);
        await satz(app, 'Da waren wir schon, die zweite'); const g2 = letztes(app);
        check('16 "Da waren wir schon" funktioniert weiter (merkt den Ort)', /^Gemerkt: /.test(g2), g2);
        const wo = await satz(app, 'Wo waren wir schon?');
        check('16 … und "Wo waren wir schon?" nennt ihn', /Zuletzt wart ihr hier/.test(letztes(app)), letztes(app));
        const frag = neu(); await satz(frag, 'Was können wir heute machen?'); const gf = letztes(frag);
        check('15 ohne Personenangabe: weiter "Wer kommt mit?"', /Wer kommt mit/.test(gf), gf);
        await satz(frag, 'die Kinder'); check('15 … und danach der alte Ablauf', /drei Ideen/.test(letztes(frag)) && !/eintragen/.test(letztes(frag)), letztes(frag));
        const wer = neu(); await satz(wer, 'Plane unseren Samstag und kümmer dich darum'); const gw = letztes(wer);
        await satz(wer, 'Morgen nur Simone und ich'.replace('Morgen ', ''));
        check('Schritt 1: fehlende Angabe (wer) wird gezielt erfragt, danach Plan für Erwachsene', /Wer kommt mit/.test(gw) && /Ich würde .+ empfehlen/.test(letztes(wer)) && wer.suchen.some(q => /Aussichtspunkt|Café|Schloss|Wanderweg/.test(q)), gw + ' | ' + letztes(wer));
    }
    /* 17 Mehrfachfragen / Dirigent */
    {
        const m = neu().sb.jvMehrfach.teile(AGENT);
        check('17 Mehrfach trennt den Agentensatz nicht in Stücke', m.length === 1, JSON.stringify(m));
        const m2 = neu().sb.jvMehrfach.teile('Stell den Wecker auf 4 Uhr und setz Milch auf die Liste');
        check('17 … und trennt weiterhin an eindeutigen Stellen', m2.length === 2, JSON.stringify(m2));
        const app = neu();
        await app.lassLaufen(async () => { app.sb.handleLocalCommand('Was können wir heute unternehmen?'); });   // wie die Rückfrage der Tagesmeldung
        await pause(120);
        check('17 Dirigent-Weg ("Was können wir heute unternehmen?") bleibt der alte Ablauf', /Wer kommt mit/.test(letztes(app)));
    }
    /* 18 Reihenfolge */
    {
        const app = neu(); const l = app.sb.jvCommands.list();
        check('18 Befehlsliste: genau ein Eintrag "ausflug" mit Rang 0.35 (kein neuer Befehl, Rang unverändert)', l.filter(n => /\bausflug$/.test(n)).join() === '0.35 ausflug', l.filter(n => /ausflug/.test(n)).join());
        const a2 = neu(); const l2 = a2.sb.jvCommands.list();
        check('18 deterministisch: zweiter Start liefert dieselbe Reihenfolge und dieselbe Anzahl', JSON.stringify(l) === JSON.stringify(l2) && l.length === l2.length);
    }

    console.log(`AUSFLUG-AGENT: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})();
