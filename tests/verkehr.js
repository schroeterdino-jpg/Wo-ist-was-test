/* ============================================================
   VERKEHR PHASE 1 (Start: node tests/verkehr.js)
   Sichert zwei belegte Fehler ab:
   1. Schwere Meldungen (Sperrung, Unfall) dürfen nicht hinter kleinen Meldungen aus der begrenzten Auswahl fallen
      (autobahn.de: erst ordnen, dann auf 2 begrenzen; TomTom: erst Schwere, dann Verzögerung, dann die ersten 3).
   2. Die Autobahnnummer steht nur in der Aussage, wenn die Meldung sie selbst nennt, nicht schon weil der Feed dieser Autobahn abgefragt wurde.
   Gemessen wird mit der echten Skript-Reihenfolge (tests/umgebung.js) und festen Attrappen für /api/route und /api/stau; kein echtes Netz.
   NICHT geprüft (bewusst, noch nicht gebaut): Fahrtrichtung, Linienabstand der Autobahn-Meldungen, Lagebild "Verkehr in der Nähe".
   ============================================================ */
'use strict';
const { starte } = require('./umgebung.js');

let ok = 0, fehler = 0;
function check(name, bedingung, info) { if (bedingung) ok++; else { fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); } }

const antwort = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
// Route Schwarzenbek -> Hamburg (A24), Linie als [Länge, Breite]
const A = [10.482, 53.509], B = [9.994, 53.551];
const GEO = []; for (let i = 0; i <= 20; i++) GEO.push([A[0] + (B[0] - A[0]) * i / 20, A[1] + (B[1] - A[1]) * i / 20]);
const punkt = f => ({ lat: (A[1] + (B[1] - A[1]) * f).toFixed(5), long: (A[0] + (B[0] - A[0]) * f).toFixed(5) });
const aufLinie = lon => ({ lat: A[1] + (A[0] - lon) / (A[0] - B[0]) * (B[1] - A[1]), lon });

/* autobahn.de-Meldung (Feed der A24) */
const W = (title, desc, f, icon) => ({ title, description: desc || [], coordinate: punkt(f), icon: icon || '101' });
/* TomTom-Meldung, so wie api/stau.js sie weitergibt */
const T = (art, kategorie, stufe, sek, lon, extra) => Object.assign({ art, kategorie, stufe, verzoegerung_s: sek, laenge_m: 300, von: '', nach: '', strassen: [], text: '' }, aufLinie(lon), extra || {});

async function lauf(feed, tomtom) {
    const urls = [];
    const app = starte({
        festerZufall: true,
        fetch: async u => {
            urls.push(u);
            if (/\/api\/route/.test(u)) return antwort({ quelle: 'osrm', routes: [{ duration: 1800, distance: 35000, geometry: { coordinates: GEO }, legs: [{ steps: [{ ref: 'A24', name: '' }] }] }] });
            if (/\/api\/stau\?road=/.test(u)) return antwort({ warning: feed || [], webcam: [] });
            if (/\/api\/stau\?traffic=1/.test(u)) return antwort({ incidents: tomtom || [] });
            throw new Error('offline (Attrappe): ' + u);
        }
    });
    const sb = app.sb;
    const r = (await app.lassLaufen(() => sb.routeDurationSeconds(A[1], A[0], B[1], B[0]))).wert;
    const text = (await app.lassLaufen(() => sb.describeAutobahnStau(r.autobahnen, A[1], A[0], B[1], B[0]))).wert;
    const warnungen = JSON.parse(app.vm.runInContext('JSON.stringify(lastStauWarnings)', sb));
    const karten = JSON.parse(app.vm.runInContext('JSON.stringify(lastStauCards)', sb));
    return { app, sb, text: String(text), warnungen, karten, urls, stauMin: sb.jvStauMin, coords: r.coords };
}
/* Lagebild-Zeilen zu einem Lauf: die Texte, die das Fenster setzt (Attrappen-Elemente schreiben ihren textContent mit) */
function lagebildTexte(l) {
    const texte = [];
    const rec = () => new Proxy(function () { }, {
        get(t, k) { return k === 'textContent' ? '' : (k === Symbol.toPrimitive ? () => '' : rec()); },
        set(t, k, v) { if (k === 'textContent') texte.push(String(v)); return true; },
        apply() { return rec(); }
    });
    l.sb.document.createElement = () => rec();
    const m = { from: { lat: A[1], lon: A[0] }, to: { lat: B[1], lon: B[0], label: 'Hamburg' }, coords: l.coords, warnings: l.warnungen, autobahnen: ['A24'], fahrtMin: 30, stauMin: 0, km: 35, terminMs: null };
    l.sb.jvLage.ziel({ titel: 'Hamburg', map: m, untertitel: '', zeilen: [] });
    return texte;
}
const pos = (t, w) => t.indexOf(w);

(async () => {
    /* ---------- 1. autobahn.de: Vollsperrung + mehrere kleine Meldungen ---------- */
    {
        const l = await lauf([W('A24 | Kleine Baustelle bei Wentorf', ['Baustelle'], 0.1, '123'), W('A24 | Baustelle bei Reinbek', ['Baustelle'], 0.2, '123'),
            W('A24 | Wasserfleck bei Glinde', [], 0.3), W('A24 | AS Witzhave - AS Reinbek', ['Vollsperrung'], 0.4, '250')]);
        check('V1 Vollsperrung bleibt in der begrenzten Auswahl', /Sperrung/.test(l.text), l.text);
        check('V1 Vollsperrung steht vor den kleinen Meldungen', pos(l.text, 'Sperrung') >= 0 && (pos(l.text, 'Baustelle') < 0 || pos(l.text, 'Sperrung') < pos(l.text, 'Baustelle')), l.text);
        check('V1 Warnliste (Karte/Lagebild) beginnt mit der Sperrung', l.warnungen.length > 0 && /Witzhave/.test(l.warnungen[0].title), JSON.stringify(l.warnungen.map(w => w.title)));
    }
    /* ---------- 2. autobahn.de: schwerer Unfall + kleine Baustellen ---------- */
    {
        const l = await lauf([W('A24 | Kleine Baustelle bei Wentorf', ['Baustelle'], 0.1, '123'), W('A24 | Baustelle bei Reinbek', ['Baustelle'], 0.2, '123'),
            W('A24 | Hindernis bei Glinde', ['Gegenstand auf der Fahrbahn'], 0.3), W('A24 | AS Reinbek - AS Billstedt', ['Unfall', 'Fahrstreifen gesperrt'], 0.8)]);
        check('V2 Unfall wird nicht verdrängt', /\(Unfall\)/.test(l.text), l.text);
        check('V2 Unfall steht vor den Baustellen', pos(l.text, 'Unfall') >= 0 && (pos(l.text, 'Baustelle') < 0 || pos(l.text, 'Unfall') < pos(l.text, 'Baustelle')), l.text);
        check('V2 höchstens 2 Meldungen gesprochen (Begrenzung bleibt)', (l.text.match(/\(/g) || []).length <= 2, l.text);
    }
    /* ---------- 3. TomTom: Sperrung mit 0 s + drei kleine Staus ---------- */
    {
        const l = await lauf([], [
            T('Stau', 6, 2, 200, 10.30, { von: 'Wentorf' }), T('Stau', 6, 2, 170, 10.20, { von: 'Reinbek' }), T('Stau', 6, 2, 130, 10.10, { von: 'Billstedt' }),
            T('Sperrung', 8, 4, 0, 10.40, { von: 'AS Reinbek', nach: 'AS Witzhave', strassen: ['A24'] })]);
        check('V3 Sperrung (0 s) wird nicht herausgeschnitten', /Sperrung/.test(l.text), l.text);
        check('V3 Sperrung steht vor den kleinen Staus', pos(l.text, 'Sperrung') >= 0 && pos(l.text, 'Sperrung') < pos(l.text, 'Stau bei'), l.text);
        check('V3 höchstens 3 TomTom-Meldungen (Begrenzung bleibt)', l.warnungen.length <= 3, String(l.warnungen.length));
    }
    /* ---------- 4. gleiche Schwere: Verzögerung bestimmt, Quell-Reihenfolge bleibt bei Gleichstand ---------- */
    {
        const l = await lauf([], [T('Unfall', 1, 3, 300, 10.30, { von: 'Wentorf' }), T('Unfall', 1, 3, 900, 10.20, { von: 'Reinbek' })]);
        check('V4 TomTom: bei gleicher Schwere zuerst die längere Verzögerung', pos(l.text, 'Reinbek') >= 0 && pos(l.text, 'Reinbek') < pos(l.text, 'Wentorf'), l.text);
        const g = await lauf([W('A24 | Baustelle bei Wentorf', ['Baustelle'], 0.1, '123'), W('A24 | Baustelle bei Reinbek', ['Baustelle'], 0.2, '123')]);
        check('V4 autobahn.de: bei gleichem Rang bleibt die Reihenfolge der Quelle', pos(g.text, 'Wentorf') >= 0 && pos(g.text, 'Wentorf') < pos(g.text, 'Reinbek'), g.text);
        const g2 = await lauf([W('A24 | Baustelle bei Wentorf', ['Baustelle'], 0.1, '123'), W('A24 | Baustelle bei Reinbek', ['Baustelle'], 0.2, '123')]);
        check('V4 zwei Läufe liefern denselben Satz', g.text === g2.text);
    }
    /* ---------- 5. Autobahnnummer, die die Meldung selbst nennt ---------- */
    {
        const l = await lauf([W('A24 | AS Witzhave - AS Reinbek', ['Vollsperrung'], 0.4, '250')]);
        check('V5 belegte Autobahnnummer erscheint im Satz', /A24: AS Witzhave - AS Reinbek \(Sperrung\)/.test(l.text), l.text);
        check('V5 Warnung ist als belegt markiert', l.warnungen[0] && l.warnungen[0].autobahnBelegt === true);
        check('V5 Karte nennt die Autobahn', l.karten[0] && /A24/.test(l.karten[0].title), JSON.stringify(l.karten[0]));
        const z = lagebildTexte(l).filter(t => /Witzhave/.test(t));
        check('V5 Lagebild hängt die belegte Nummer an', z.length === 1 && /\(A24\)/.test(z[0]), JSON.stringify(z));
    }
    /* ---------- 6. Meldung ohne selbst genannte Autobahn ---------- */
    {
        const l = await lauf([W('Bei den Gärtnereien', ['Sperrung'], 0.5, '250')]);
        const nurMeldung = l.text.replace(/^.*aktuell gemeldet:/, '');
        check('V6 abgefragte Nummer steht nicht als Tatsache in der Aussage', !/A24/.test(nurMeldung), l.text);
        check('V6 Aussage nennt Art und Ort', /Sperrung bei Bei den Gärtnereien/.test(l.text), l.text);
        check('V6 Warnung ist als nicht belegt markiert', l.warnungen[0] && l.warnungen[0].autobahnBelegt === false);
        check('V6 Karte nennt die Autobahn nicht', l.karten[0] && !/A24/.test(l.karten[0].title), JSON.stringify(l.karten[0]));
    }
    /* ---------- 7. "In den Plantagen"-ähnlicher lokaler Titel ---------- */
    {
        for (const [name, beschr] of [['nur Sperrung', ['Sperrung']], ['Beschreibung nennt die A24 nur nebenbei', ['Sperrung der Zufahrt zur A24']]]) {
            const l = await lauf([W('In den Plantagen', beschr, 0.5, '250')]);
            const nurMeldung = l.text.replace(/^.*aktuell gemeldet:/, '');
            check('V7 (' + name + ') keine A24-Sperrung behauptet', !/A24/.test(nurMeldung) && /Sperrung bei In den Plantagen/.test(l.text), l.text);
            const z = lagebildTexte(l).filter(t => /Plantagen/.test(t));
            check('V7 (' + name + ') Lagebild: Zeile ohne (A24)', z.length === 1 && !/A24/.test(z[0]) && /Sperrung bei In den Plantagen/.test(z[0]), JSON.stringify(z));
        }
    }
    /* ---------- 8. Unverändertes und Aufrufzahl ---------- */
    {
        const frei = await lauf([]);
        check('V8 keine Meldungen: bisheriger Satz', /Auf der A24 sind aktuell keine Staumeldungen bekannt\./.test(frei.text), frei.text);
        const l = await lauf([W('A24 | AS Witzhave - AS Reinbek', ['Vollsperrung'], 0.4, '250')], [T('Stau', 6, 2, 200, 10.30, { von: 'Wentorf' })]);
        check('V8 Satzanfang bleibt "Achtung, auf der Strecke aktuell gemeldet:"', /^ Achtung, auf der Strecke aktuell gemeldet: /.test(l.text), l.text);
        // Die Attrappe antwortet auf "google=1" mit osrm, darum probiert travel/stadtverkehr zusätzlich die normale Route (wie schon vor Phase 1). Neu darf nichts dazukommen.
        const art = u => /\/api\/route\?.*google=1/.test(u) ? 'route-google' : /\/api\/route/.test(u) ? 'route' : /\/api\/stau\?road=/.test(u) ? 'autobahn.de' : /\/api\/stau\?traffic=1/.test(u) ? 'tomtom' : 'anderes:' + u;
        check('V8 keine zusätzlichen Abfragen: je 1x Route(Google-Versuch), Route, autobahn.de, TomTom', JSON.stringify(l.urls.map(art).sort()) === JSON.stringify(['autobahn.de', 'route', 'route-google', 'tomtom']), JSON.stringify(l.urls.map(art)));
    }

    console.log('VERKEHR PHASE 1: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
