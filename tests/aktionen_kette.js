/* ============================================================
   TEST "Aktions-Kette" (A5, Teil 2): js/aktionen_kette.js und die acht angemeldeten Umhüllungen von executeAction
   Teil A prüft die Sammelstelle allein (Attrappen als Hüllen), Teil B die echte App.
   Zusammen mit tests/aktionen.js (Golden Master, 97 Szenarien) beweist das: gleiche Wirkung, feste Reihenfolge, Fehler fallen auf.
   Aufruf: node tests/aktionen_kette.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
const KETTE = fs.readFileSync(path.join(ROOT, 'js', 'aktionen_kette.js'), 'utf8');
const { starte } = require('./umgebung.js');
const { alle } = require('./aktionen.js');
const { SZENARIEN } = require('./aktionen_szenarien.js');

let fehler = 0, anzahl = 0;
function pruefe(ok, text) { anzahl++; if (!ok) { fehler++; console.log('  ✗ ' + text); } else if (process.argv.includes('--laut')) console.log('  ✓ ' + text); }
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const SOLL_LISTE = [['loeschen_fragen', 10], ['gedaechtnis', 20], ['geburtstag_ganztag', 30], ['langzeit_erinnern', 40], ['langzeit', 50], ['lagebild', 60], ['routinen', 70], ['formulierungen', 80]].map(x => ({ name: x[0], rang: x[1] }));
const ERBT_NICHT = { gedaechtnis: 1, lagebild: 1 };

/* ---------- Teil A: Sammelstelle allein ---------- */
function frische(opt) {
    opt = opt || {};
    const spur = [], fehlerMeldungen = [];
    const ctx = { console: { error: m => fehlerMeldungen.push(String(m)), log() { }, warn() { } }, setTimeout() { }, addEventListener() { } };
    ctx.window = ctx;
    ctx.executeAction = opt.basis || async function (a) { spur.push('basis'); if (a && a.wirf) throw a.wirf; return { von: 'basis', a }; };
    vm.createContext(ctx);
    if (!opt.ohneKette) vm.runInContext(KETTE, ctx, { filename: 'aktionen_kette.js' });
    // eine Attrappen-Hülle: schreibt in die Spur, reicht durch
    ctx.attrappe = function (name) {
        return function (innen) {
            const w = async function (a) { spur.push(name); return innen.apply(this, arguments); };
            w['_' + name] = true;
            return w;
        };
    };
    return { ctx, spur, fehlerMeldungen };
}
function meldeAlleAn(w, reihenfolge) {
    const ergebnis = {};
    for (const i of reihenfolge) { const e = SOLL_LISTE[i]; ergebnis[e.name] = w.ctx.jvAktionen.huelle(e.name, e.rang, w.ctx.attrappe(e.name), ERBT_NICHT[e.name] ? { erbt: false } : undefined); }
    return ergebnis;
}
async function teilA() {
    console.log('Teil A: Sammelstelle allein');
    const reihenfolgen = {
        vorwaerts: [0, 1, 2, 3, 4, 5, 6, 7], rueckwaerts: [7, 6, 5, 4, 3, 2, 1, 0],
        gemischt: [3, 7, 0, 5, 1, 6, 2, 4], gemischt2: [4, 2, 6, 1, 5, 0, 7, 3]
    };
    let ersteSpur = null, ersteListe = null, ersteMerkmale = null;
    for (const [name, r] of Object.entries(reihenfolgen)) {
        const w = frische();
        const e = meldeAlleAn(w, r);
        pruefe(Object.values(e).every(x => x === true), 'Anmeldung (' + name + '): alle acht werden angenommen');
        const liste = w.ctx.jvAktionen.liste();
        pruefe(gleich(liste, SOLL_LISTE), 'liste() (' + name + ') = die acht Namen und Ränge von außen nach innen');
        await w.ctx.executeAction({ type: 'x' });
        pruefe(gleich(w.spur, SOLL_LISTE.map(x => x.name).concat('basis')), 'Aufruf-Reihenfolge (' + name + '): ' + w.spur.join(' > '));
        const merkmale = Object.keys(w.ctx.executeAction).sort();
        pruefe(gleich(merkmale, ['_gedaechtnis', '_loeschen_fragen']), 'Merkmale der äußersten Funktion (' + name + '): ' + merkmale.join(','));
        if (ersteSpur === null) { ersteSpur = w.spur.slice(); ersteListe = liste; ersteMerkmale = merkmale; }
        else pruefe(gleich(w.spur, ersteSpur) && gleich(liste, ersteListe) && gleich(merkmale, ersteMerkmale), 'Kette (' + name + ') ist identisch zur ersten Reihenfolge');
        pruefe(w.ctx.jvAktionen.pruefe().vollstaendig === true, 'pruefe() (' + name + ') meldet die Kette als vollständig');
    }

    { // doppelter Name
        const w = frische(); meldeAlleAn(w, reihenfolgen.vorwaerts);
        let aufgerufen = 0;
        const nochmal = w.ctx.jvAktionen.huelle('langzeit', 55, function (innen) { aufgerufen++; return innen; });
        pruefe(nochmal === false && aufgerufen === 0, 'doppelter Name: wird abgelehnt, fabrik wird nicht einmal aufgerufen');
        const nochmal2 = w.ctx.jvAktionen.huelle('langzeit', 50, function (innen) { aufgerufen++; return innen; });
        pruefe(nochmal2 === false && aufgerufen === 0, 'doppelter Name mit gleichem Rang: abgelehnt');
        pruefe(gleich(w.ctx.jvAktionen.liste(), SOLL_LISTE), 'doppelter Name: keine zweite Hülle in der Liste');
        await w.ctx.executeAction({ type: 'x' });
        pruefe(w.spur.filter(s => s === 'langzeit').length === 1, 'doppelter Name: die Hülle läuft genau einmal');
        pruefe(w.ctx.jvAktionen.pruefe().vollstaendig === true, 'doppelter Name: Kette bleibt vollständig (kein Fehler durch Doppelanmeldung)');
    }
    { // Datei zweimal geladen
        const w = frische(); meldeAlleAn(w, reihenfolgen.vorwaerts);
        const vorher = w.ctx.jvAktionen;
        vm.runInContext(KETTE, w.ctx, { filename: 'aktionen_kette.js' });
        pruefe(w.ctx.jvAktionen === vorher && gleich(w.ctx.jvAktionen.liste(), SOLL_LISTE), 'Datei zweimal geladen: Sammelstelle bleibt dieselbe');
    }
    { // Fehler und Rückgaben kommen unverändert beim Aufrufer an
        const w = frische(); meldeAlleAn(w, reihenfolgen.gemischt);
        const e = new Error('Bumm'); e.userMessage = 'Bumm (Nutzer)'; e.auth = true;
        let gefangen = null;
        try { await w.ctx.executeAction({ type: 'x', wirf: e }); } catch (x) { gefangen = x; }
        pruefe(gefangen === e, 'Fehler der Basis erreicht den Aufrufer als dasselbe Objekt (userMessage und auth bleiben)');
        const w2 = frische();
        const f = new Error('innen kaputt'); f.userMessage = 'nutzer';
        for (const x of SOLL_LISTE) {
            if (x.name === 'routinen') w2.ctx.jvAktionen.huelle(x.name, x.rang, function (innen) { return async function () { throw f; }; });
            else w2.ctx.jvAktionen.huelle(x.name, x.rang, w2.ctx.attrappe(x.name));
        }
        let g2 = null; try { await w2.ctx.executeAction({ type: 'x' }); } catch (x) { g2 = x; }
        pruefe(g2 === f, 'Fehler einer inneren Hülle (routinen) erreicht den Aufrufer unverändert');
        pruefe(w2.spur.includes('langzeit') && !w2.spur.includes('formulierungen') && !w2.spur.includes('basis'), 'Fehler einer inneren Hülle: weiter innen läuft nichts mehr');
        const w3 = frische(); meldeAlleAn(w3, reihenfolgen.vorwaerts);
        const aktion = { type: 'x', n: 1 };
        const r = await w3.ctx.executeAction(aktion, 'Satz', { counter: 0 });
        pruefe(r && r.von === 'basis' && r.a === aktion, 'Rückgabewert und Argument der Basis kommen unverändert an');
        // Argumente werden vollständig und in Reihenfolge durchgereicht
        const gesehen = [];
        const w4 = frische({ basis: async function () { gesehen.push(Array.from(arguments)); } });
        meldeAlleAn(w4, reihenfolgen.rueckwaerts);
        const ctxx = { counter: 3 };
        await w4.ctx.executeAction({ type: 'y' }, 'Text', ctxx, 'extra');
        pruefe(gesehen.length === 1 && gesehen[0].length === 4 && gesehen[0][1] === 'Text' && gesehen[0][2] === ctxx && gesehen[0][3] === 'extra', 'alle Argumente kommen bei der Basis an');
    }
    { // unbekannte Aktionen: laufen bis zur Basis, die nichts tut
        const w = frische({ basis: async function () { w.spur.push('basis'); } }); meldeAlleAn(w, reihenfolgen.vorwaerts);
        const r = await w.ctx.executeAction({ type: 'gibtsnicht' });
        pruefe(r === undefined && w.spur[w.spur.length - 1] === 'basis', 'unbekannte Aktion: erreicht die Basis, Ergebnis undefined');
    }
    { // kaputte Registrierungen
        const w = frische(); meldeAlleAn(w, [0, 1, 2, 3, 4, 5, 7]);   // routinen (Index 6) fehlt
        const p = w.ctx.jvAktionen.pruefe();
        pruefe(!p.vollstaendig && gleich(p.fehlend, ['routinen']), 'eine Hülle fehlt (routinen): pruefe() meldet unvollständig und nennt sie');
        pruefe(gleich(w.ctx.jvAktionen.liste().map(x => x.name), SOLL_LISTE.map(x => x.name).filter(n => n !== 'routinen')), 'eine Hülle fehlt: liste() zeigt ehrlich nur sieben');
        const w2 = frische(); meldeAlleAn(w2, [0, 1, 2, 3, 4, 5, 6]);   // formulierungen fehlt
        pruefe(gleich(w2.ctx.jvAktionen.pruefe().fehlend, ['formulierungen']), 'ganz innen fehlt (formulierungen): erkannt');
        const w2b = frische(); meldeAlleAn(w2b, [1, 2, 3, 4, 5, 6, 7]);   // loeschen_fragen fehlt
        pruefe(gleich(w2b.ctx.jvAktionen.pruefe().fehlend, ['loeschen_fragen']), 'ganz außen fehlt (loeschen_fragen): erkannt');
        const w3 = frische();
        const r1 = w3.ctx.jvAktionen.huelle('loeschen_fragen', 10, function () { throw new Error('fabrik kaputt'); });
        pruefe(r1 === false && w3.ctx.jvAktionen.liste().length === 0, 'fabrik wirft: Hülle wird nicht eingebaut');
        pruefe(w3.ctx.jvAktionen.pruefe().fehler.length === 1 && !w3.ctx.jvAktionen.pruefe().vollstaendig, 'fabrik wirft: der Fehler steht in pruefe().fehler, Kette gilt als unvollständig');
        pruefe(w3.fehlerMeldungen.length === 1 && /fabrik kaputt/.test(w3.fehlerMeldungen[0]), 'fabrik wirft: es gibt eine laute Meldung (console.error)');
        const w3b = frische(); meldeAlleAn(w3b, [1, 2, 3, 4, 5, 6, 7]);
        w3b.ctx.jvAktionen.huelle('loeschen_fragen', 10, function () { throw new Error('kaputt'); });
        const p3 = w3b.ctx.jvAktionen.pruefe();
        pruefe(!p3.vollstaendig && gleich(p3.fehlend, ['loeschen_fragen']) && p3.fehler.length === 1, 'fabrik wirft bei der letzten Hülle: fehlend + Fehler, nie still vollständig');
        await w3b.ctx.executeAction({ type: 'x' });
        pruefe(gleich(w3b.spur, SOLL_LISTE.slice(1).map(x => x.name).concat('basis')), 'fabrik wirft: die übrigen Hüllen laufen unverändert weiter');
        const w4 = frische();
        pruefe(w4.ctx.jvAktionen.huelle('x', 10, function () { return 42; }) === false && w4.ctx.jvAktionen.pruefe().fehler.length === 1, 'fabrik liefert keine Funktion: abgelehnt, Fehler gemerkt');
        pruefe(w4.ctx.jvAktionen.huelle('y', 'zehn', function (i) { return i; }) === false, 'ungültiger Rang: abgelehnt');
        pruefe(w4.ctx.jvAktionen.huelle('', 10, function (i) { return i; }) === false, 'leerer Name: abgelehnt');
        pruefe(w4.ctx.jvAktionen.huelle('z', 10, 'keine funktion') === false, 'fabrik ist keine Funktion: abgelehnt');
        const w5 = frische();
        w5.ctx.jvAktionen.huelle('a', 10, w5.ctx.attrappe('a'));
        const gleichRang = w5.ctx.jvAktionen.huelle('b', 10, w5.ctx.attrappe('b'));
        pruefe(gleichRang === false && gleich(w5.ctx.jvAktionen.liste(), [{ name: 'a', rang: 10 }]) && w5.ctx.jvAktionen.pruefe().fehler.length === 1, 'zwei Hüllen mit gleichem Rang: die zweite wird abgelehnt und gemeldet');
        const w6 = frische(); meldeAlleAn(w6, reihenfolgen.vorwaerts);
        w6.ctx.jvAktionen.huelle('dazu', 55, w6.ctx.attrappe('dazu'));
        pruefe(gleich(w6.ctx.jvAktionen.pruefe().unerwartet, ['dazu']) && !w6.ctx.jvAktionen.pruefe().vollstaendig, 'eine unerwartete neunte Hülle wird erkannt');
        const w7 = frische();
        for (const x of SOLL_LISTE) w7.ctx.jvAktionen.huelle(x.name, x.name === 'routinen' ? 75 : x.rang, w7.ctx.attrappe(x.name));
        pruefe(gleich(w7.ctx.jvAktionen.pruefe().rangFalsch, ['routinen']) && !w7.ctx.jvAktionen.pruefe().vollstaendig, 'falscher Rang wird erkannt');
        const w8 = frische(); meldeAlleAn(w8, [7, 6, 5]);
        w8.ctx.executeAction = async function () { };   // jemand legt seine Umhüllung auf die alte Art darüber
        const r8 = w8.ctx.jvAktionen.huelle('geburtstag_ganztag', 30, w8.ctx.attrappe('geburtstag_ganztag'));
        pruefe(r8 === false && !w8.ctx.jvAktionen.pruefe().vollstaendig && w8.ctx.jvAktionen.pruefe().fehler.length === 1, 'fremde Umhüllung auf der alten Art: spätere Anmeldung wird nicht still darübergelegt, sondern gemeldet');
    }
    { // Basis fehlt: keine Sammelstelle (die Dateien fallen auf die alte Art zurück)
        const c = { console: { error() { } }, addEventListener() { } }; c.window = c; vm.createContext(c);
        vm.runInContext(KETTE, c);
        pruefe(c.jvAktionen === undefined, 'ohne executeAction gibt es keine Sammelstelle');
    }
}

/* ---------- Teil B: die echte App ---------- */
let SOLL = null;
function sollLaden() { SOLL = JSON.parse(fs.readFileSync(path.join(__dirname, 'aktionen_soll.json'), 'utf8')).szenarien; }
/* langeZeit: Schritte, in denen die Uhr mehr als eine Minute vorläuft, werden nicht verglichen. Dann laufen nämlich alle Dauerläufer der App (Gedächtnis-Abfragen im Hintergrund,
   Ansagen) in der Reihenfolge, in der ihre Dateien geladen wurden; bei vertauschter Ladereihenfolge ändert sich deren Reihenfolge (zum Beispiel topK 5 statt 8), mit der Aktions-Kette hat das nichts zu tun. */
async function gegenSoll(optionen, langeZeitAus) {
    const l = await alle(SZENARIEN, optionen);
    const ohne = (fp, sz) => { if (!langeZeitAus || !fp || !fp.schritte) return fp; return Object.assign({}, fp, { schritte: fp.schritte.map((x, i) => (sz.schritte[i] && sz.schritte[i].vor >= 60000) ? { uebersprungen: true } : x) }); };
    return SZENARIEN.filter(sz => JSON.stringify(ohne(l[sz.name], sz)) !== JSON.stringify(ohne(SOLL[sz.name], sz))).map(sz => sz.name);
}

/* index.html kurz verändert einlesen lassen (nur für diesen Test, die Datei selbst bleibt unberührt) */
async function mitIndex(umbau, fn) {
    const orig = fs.readFileSync;
    fs.readFileSync = function (p) {
        const r = orig.apply(this, arguments);
        if (typeof p === 'string' && path.resolve(p) === path.join(ROOT, 'index.html')) return umbau(String(r));
        return r;
    };
    try { return await fn(); } finally { fs.readFileSync = orig; }
}
function umordnen(html, reihenfolge) {   // die acht Hüllen-Dateien tauschen ihre Plätze in index.html: Platz i bekommt Datei reihenfolge[i]
    const dateien = SOLL_LISTE.map(x => x.name + '.js');
    const zeilen = html.split('\n');
    const plaetze = dateien.map(d => zeilen.findIndex(z => z.includes('/js/' + d + '?') || z.includes('/js/' + d + '"')));
    const nach = plaetze.slice().sort((a, b) => a - b);
    const inhalte = plaetze.map(i => zeilen[i]);
    const geladen = reihenfolge.map(i => inhalte[i]);
    nach.forEach((platz, k) => { zeilen[platz] = geladen[k]; });
    return zeilen.join('\n');
}
async function teilB() {
    console.log('Teil B: echte App');
    sollLaden();
    const app = starte({ festerZufall: true });
    pruefe(app.ladefehler.length === 0, 'App lädt ohne Ladefehler');
    const A = app.sb.jvAktionen;
    pruefe(!!A, 'jvAktionen ist da');
    pruefe(gleich(JSON.parse(JSON.stringify(A.liste())), SOLL_LISTE), 'echte App: liste() = die acht Namen und Ränge von außen nach innen');
    pruefe(A.pruefe().vollstaendig === true, 'echte App: pruefe() meldet die Kette als vollständig');
    pruefe(gleich(Object.keys(app.sb.executeAction).sort(), ['_gedaechtnis', '_loeschFrage']), 'echte App: Merkmale der äußersten Funktion wie früher');
    const index = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
    const ik = index.indexOf('js/aktionen_kette.js'), ia = index.indexOf('js/actions.js'), ih = SOLL_LISTE.map(x => index.indexOf('js/' + x.name + '.js'));
    pruefe(ia > 0 && ik > ia && ih.every(i => i > ik), 'index.html: aktionen_kette.js steht direkt nach actions.js und vor allen acht Hüllen');
    pruefe(!/<script[^>]*aktionen_kette[^>]*>[\s\S]{0,200}?<script[^>]*actions\.js/.test(index), 'index.html: Reihenfolge actions.js, aktionen_kette.js');
    const zwischen = index.slice(ia, ik).split('\n').filter(z => /<script/.test(z));
    pruefe(zwischen.length === 1, 'index.html: zwischen actions.js und aktionen_kette.js steht kein anderes Skript');

    // Fehlt eine Hülle, erkennt der Test es eindeutig
    for (const x of SOLL_LISTE) {
        const a = starte({ festerZufall: true, ohneSkripte: [x.name + '.js'] });
        const p = a.sb.jvAktionen.pruefe();
        pruefe(!p.vollstaendig && gleich(p.fehlend, [x.name]), 'ohne ' + x.name + '.js: pruefe() meldet unvollständig und nennt genau diese Hülle');
        const l = a.sb.jvAktionen.liste().map(e => e.name);
        pruefe(gleich(l, SOLL_LISTE.map(e => e.name).filter(n => n !== x.name)), 'ohne ' + x.name + '.js: liste() zeigt ehrlich sieben Hüllen');
    }

    // Rückfall: ohne aktionen_kette.js gilt weiter alles wie früher
    const ohne = starte({ festerZufall: true, ohneSkripte: ['aktionen_kette.js'] });
    pruefe(ohne.sb.jvAktionen === undefined, 'Rückfall: ohne aktionen_kette.js gibt es keine Sammelstelle');
    pruefe(gleich(Object.keys(ohne.sb.executeAction).sort(), ['_gedaechtnis', '_loeschFrage']), 'Rückfall: Merkmale der äußersten Funktion wie früher');
    const d0 = await gegenSoll({ ohneSkripte: ['aktionen_kette.js'] });
    pruefe(d0.length === 0, 'Rückfall (ohne aktionen_kette.js): Golden Master ' + (SZENARIEN.length - d0.length) + '/' + SZENARIEN.length + (d0.length ? ' - abweichend: ' + d0.slice(0, 5).join(', ') : ''));

    // Mit Kette: Golden Master, auch wenn sich die Dateien in anderer Reihenfolge anmelden
    // reihenfolge[k] = Index (in SOLL_LISTE, außen zuerst) der Hülle, deren Datei an k-ter Stelle in index.html steht und damit k-ter geladen wird
    const reihen = { 'wie heute (innen zuerst)': [7, 6, 5, 4, 3, 2, 1, 0], 'umgekehrt (außen zuerst)': [0, 1, 2, 3, 4, 5, 6, 7], 'gemischt': [3, 7, 0, 5, 1, 6, 2, 4], 'gemischt 2': [4, 2, 6, 1, 5, 0, 7, 3] };
    for (const [name, reihenfolge] of Object.entries(reihen)) {
        const d = await mitIndex(h => umordnen(h, reihenfolge), async () => {
            const a = starte({ festerZufall: true });
            const p = a.sb.jvAktionen.pruefe(), l = JSON.parse(JSON.stringify(a.sb.jvAktionen.liste()));
            pruefe(a.ladefehler.length === 0, 'Ladereihenfolge ' + name + ': keine Ladefehler');
            pruefe(p.vollstaendig && gleich(l, SOLL_LISTE), 'Ladereihenfolge ' + name + ': Kette vollständig und liste() unverändert');
            pruefe(gleich(Object.keys(a.sb.executeAction).sort(), ['_gedaechtnis', '_loeschFrage']), 'Ladereihenfolge ' + name + ': Merkmale der äußersten Funktion unverändert');
            return await gegenSoll(undefined, true);
        });
        pruefe(d.length === 0, 'Ladereihenfolge ' + name + ': Golden Master ' + (SZENARIEN.length - d.length) + '/' + SZENARIEN.length + (d.length ? ' - abweichend: ' + d.slice(0, 5).join(', ') : ''));
    }

    // Gegenprobe: ohne Sammelstelle (alte Technik) wirkt eine vertauschte Ladereihenfolge dagegen sofort - der Test sieht also die Reihenfolge
    const dAlt = await mitIndex(h => umordnen(h, [0, 1, 2, 3, 4, 5, 6, 7]), async () => gegenSoll({ ohneSkripte: ['aktionen_kette.js'] }, true));
    pruefe(dAlt.length >= 10, 'Gegenprobe: alte Technik mit umgekehrter Ladereihenfolge weicht in ' + dAlt.length + ' Szenarien ab (mindestens 10 erwartet)');
}

(async () => {
    await teilA();
    await teilB();
    console.log(fehler ? '\n' + fehler + ' von ' + anzahl + ' Prüfungen FEHLGESCHLAGEN' : '\nAktions-Kette in Ordnung (' + anzahl + ' Prüfungen)');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
