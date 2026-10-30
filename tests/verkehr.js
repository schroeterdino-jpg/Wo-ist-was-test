/* ============================================================
   VERKEHR PHASE 1 + 2 + LAGEBILD "VERKEHR IN DER NÄHE" + SERVER-ROUTENRELEVANZ (Start: node tests/verkehr.js)
   PHASE 1 sichert zwei belegte Fehler ab:
   1. Schwere Meldungen (Sperrung, Unfall) dürfen nicht hinter kleinen Meldungen aus der begrenzten Auswahl fallen
      (autobahn.de: erst ordnen, dann auf 2 begrenzen; TomTom: erst Schwere, dann Verzögerung, dann die ersten 3).
   2. Die Autobahnnummer steht nur in der Aussage, wenn die Meldung sie selbst nennt, nicht schon weil der Feed dieser Autobahn abgefragt wurde.
   Gemessen wird mit der echten Skript-Reihenfolge (tests/umgebung.js) und festen Attrappen für /api/route und /api/stau; kein echtes Netz.
   PHASE 2 (Abschnitt 9 ff.): Routenrelevanz. Eine Meldung gilt nur "auf der Strecke", wenn sie höchstens 250 m neben dem Linienverlauf der Route liegt; bis 1,2 km heißt sie
   "nahe deiner Route", darüber wird sie nicht als Streckenmeldung gesagt. Schwere ändert daran nichts, sie ordnet nur innerhalb der Meldungen, die die Route betreffen.
   LAGEBILD-NÄHE (Abschnitt 17 ff.): "⚠ VERKEHR – ABSEITS DEINER STRECKE" zeigt Unfälle und Stau bis 10 km um den Standort, die nicht an der Arbeitsstrecke liegen; fehlende Ortsnamen
   holt orteNachladen bei Nominatim (höchstens 3 je Laden, pro Stelle einmal dank ortCache, direkt aus dem Browser).
   SERVER (Abschnitt 23 ff.): Termin-Abfahrten in api/sync.js zählen Zusatzminuten nur für Meldungen höchstens 250 m neben der Routenlinie (aus den Step-Geometrien der vorhandenen OSRM-Anfrage);
   bis 1,2 km nur als Hinweis "nahe deiner Route", ohne Minuten; ohne brauchbare Linie nie geschätzte Minuten. Alles mit festen Attrappen (OSRM, autobahn.de, Redis), kein Netz.
   NICHT geprüft (bewusst, noch nicht gebaut): Fahrtrichtung / Gegenrichtung, Briefing und Phase-1-Reihenfolge auf dem Server.
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
/* Phase 2: Meldungen mit Abstand zur Route. f = Stelle entlang der Route (0 = Start, 1 = Ziel), dKm = so viele km nach Norden verschoben (die Linie läuft fast von Ost nach West,
   der Abstand zur Linie ist darum etwa dKm; die Prüfung unten misst ihn mit routenRelevanz nach). */
const PN = (f, dKm) => ({ lat: A[1] + (B[1] - A[1]) * f + dKm / 111.2, lon: A[0] + (B[0] - A[0]) * f });
const WN = (title, desc, f, dKm, icon) => { const p = PN(f, dKm); return { title, description: desc || [], coordinate: { lat: p.lat.toFixed(5), long: p.lon.toFixed(5) }, icon: icon || '101' }; };
const TN = (art, kategorie, stufe, sek, f, dKm, extra) => Object.assign({ art, kategorie, stufe, verzoegerung_s: sek, laenge_m: 300, von: '', nach: '', strassen: [], text: '' }, PN(f, dKm), extra || {});
const AUFSATZ = /Achtung, auf der Strecke aktuell gemeldet:/, NAHSATZ = /Außerdem gemeldet, nahe deiner Route:/;
/* Satzteil hinter "nahe deiner Route:" bzw. vor dem Satz "Außerdem gemeldet"; macht die Zuordnung der Aussagen eindeutig */
const teilAuf = t => (/Achtung, auf der Strecke aktuell gemeldet:([^]*?)(?: Außerdem gemeldet|$)/.exec(t) || [, ''])[1];
const teilNah = t => (/Außerdem gemeldet, nahe deiner Route:([^]*)$/.exec(t) || [, ''])[1];

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

    /* ======================= PHASE 2: Routenrelevanz ======================= */
    /* ---------- 9. Die Einordnung selbst (routenRelevanz, travel.js): Schwellen und Messung ---------- */
    {
        const l = await lauf([]);
        const R = (f, d) => { const p = PN(f, d); return l.sb.routenRelevanz(p.lat, p.lon, l.coords); };
        check('V9 Punkt auf der Linie: auf, Abstand fast 0', R(0.5, 0).klasse === 'auf' && R(0.5, 0).km < 0.02, JSON.stringify(R(0.5, 0)));
        check('V9 Abstand wird richtig gemessen (0,4 km Verschiebung = 0,4 km)', Math.abs(R(0.5, 0.4).km - 0.4) < 0.02, JSON.stringify(R(0.5, 0.4)));
        check('V9 0,2 km = auf, 0,3 km = nahe (Grenze 0,25)', R(0.5, 0.2).klasse === 'auf' && R(0.5, 0.3).klasse === 'nahe', JSON.stringify([R(0.5, 0.2), R(0.5, 0.3)]));
        check('V9 1,0 km = nahe, 1,3 km = umgebung (Grenze 1,2)', R(0.5, 1.0).klasse === 'nahe' && R(0.5, 1.3).klasse === 'umgebung', JSON.stringify([R(0.5, 1.0), R(0.5, 1.3)]));
        check('V9 4 km = umgebung', R(0.5, 4).klasse === 'umgebung');
        check('V9 Schwellen: 0,25 und 1,2 km', l.app.vm.runInContext('[ROUTE_AUF_KM, ROUTE_NAHE_KM]', l.sb).join() === '0.25,1.2');
    }
    /* ---------- 10. A-C: Sperrung, Unfall und kleine Baustelle genau auf der Route ---------- */
    {
        const l = await lauf([WN('A24 | AS Witzhave - AS Reinbek', ['Vollsperrung'], 0.4, 0, '250')]);
        check('V10 A Vollsperrung auf der Route: "auf der Strecke", Klasse auf', AUFSATZ.test(l.text) && /Sperrung/.test(teilAuf(l.text)) && l.warnungen.length === 1 && l.warnungen[0].klasse === 'auf', l.text + ' ' + JSON.stringify(l.warnungen));
        const u = await lauf([WN('A24 | AS Reinbek - AS Billstedt', ['Unfall'], 0.8, 0)]);
        check('V10 B Unfall auf der Route: "auf der Strecke", Klasse auf', AUFSATZ.test(u.text) && /Unfall/.test(teilAuf(u.text)) && u.warnungen[0] && u.warnungen[0].klasse === 'auf', u.text);
        const b = await lauf([WN('A24 | Kleine Baustelle bei Wentorf', ['Baustelle'], 0.1, 0, '123')]);
        check('V10 C kleine Baustelle auf der Route: ebenfalls "auf der Strecke"', AUFSATZ.test(b.text) && /Baustelle/.test(teilAuf(b.text)) && b.warnungen[0].klasse === 'auf', b.text);
        check('V10 C ... aber mit niedrigerem Schweregrad als Sperrung und Unfall', b.sb.warnungRang('Baustelle') > b.sb.warnungRang('Sperrung') && b.sb.warnungRang('Baustelle') > b.sb.warnungRang('Unfall'));
        const t = await lauf([], [TN('Sperrung', 8, 4, 0, 0.4, 0, { von: 'AS Reinbek', strassen: ['A24'] })]);
        check('V10 A TomTom-Sperrung auf der Route: Klasse auf, im Satz', /Außerdem gemeldet: Sperrung/.test(t.text) && t.warnungen.length === 1 && t.warnungen[0].klasse === 'auf', t.text);
    }
    /* ---------- 11. D, E, F: Abstand 0,4 km / 1 km / 4 km, autobahn.de und TomTom ---------- */
    {
        for (const [art, f] of [['Baustelle', 0.4], ['Vollsperrung', 0.4]]) {
            const titel = art === 'Baustelle' ? 'A24 | Baustelle bei Reinbek' : 'A24 | AS Reinbek - AS Billstedt';
            const nahe = await lauf([WN(titel, [art], f, 0.4, art === 'Baustelle' ? '123' : '250')]);
            check('V11 D autobahn.de ' + art + ' 0,4 km neben der Route: "nahe deiner Route", nicht "auf der Strecke"', NAHSATZ.test(nahe.text) && !AUFSATZ.test(nahe.text) && teilAuf(nahe.text) === '', nahe.text);
            check('V11 D ... und nicht in der Warnliste für Karte/Lagebild', nahe.warnungen.length === 0, JSON.stringify(nahe.warnungen));
            check('V11 D ... Lagebild: keine Meldung auf der Strecke', lagebildTexte(nahe).some(x => /Frei, keine Meldungen auf der Strecke/.test(x)) && !lagebildTexte(nahe).some(x => /Reinbek/.test(x)));
            const km1 = await lauf([WN(titel, [art], f, 1.0, art === 'Baustelle' ? '123' : '250')]);
            check('V11 E autobahn.de ' + art + ' 1 km neben der Route: "nahe deiner Route"', NAHSATZ.test(km1.text) && !AUFSATZ.test(km1.text) && km1.warnungen.length === 0, km1.text);
            const weit = await lauf([WN(titel, [art], f, 4, art === 'Baustelle' ? '123' : '250')]);
            check('V11 F autobahn.de ' + art + ' 4 km neben der Route (im alten Rechteck): keine Streckenmeldung', !AUFSATZ.test(weit.text) && !NAHSATZ.test(weit.text) && !/Reinbek|Billstedt/.test(weit.text) && weit.warnungen.length === 0 && weit.karten.length === 0, weit.text);
            check('V11 F ... der Satz sagt, dass nichts bekannt ist', /Auf der A24 sind aktuell keine Staumeldungen bekannt\./.test(weit.text), weit.text);
        }
        const tn = await lauf([], [TN('Stau', 6, 2, 300, 0.4, 0.4, { von: 'Reinbek' })]);
        check('V11 D TomTom-Stau 0,4 km daneben: "nahe deiner Route", nicht in der Warnliste', NAHSATZ.test(tn.text) && /Stau bei Reinbek/.test(teilNah(tn.text)) && tn.warnungen.length === 0, tn.text);
        check('V11 D ... die Verzögerung wird nicht in die Fahrzeit gerechnet (stauMin 0)', tn.stauMin === 0, String(tn.stauMin));
        check('V11 D ... die Karte sagt "nahe der Route"', tn.karten.length === 1 && /nahe der Route/.test(tn.karten[0].title), JSON.stringify(tn.karten));
        const ta = await lauf([], [TN('Stau', 6, 2, 300, 0.4, 0, { von: 'Reinbek' })]);
        check('V11 TomTom-Stau auf der Route: Verzögerung zählt (stauMin 5)', ta.stauMin === 5 && ta.warnungen.length === 1, String(ta.stauMin));
        const ts = await lauf([], [TN('Sperrung', 8, 4, 0, 0.4, 0.4, { von: 'AS Reinbek', strassen: ['A24'] })]);
        check('V11 D TomTom-Sperrung 0,4 km daneben: weiter nicht gemeldet (Sperrungen nur auf der Route)', !/Sperrung/.test(ts.text) && ts.warnungen.length === 0, ts.text);
        const tw = await lauf([], [TN('Stau', 6, 2, 300, 0.4, 4, { von: 'Reinbek' })]);
        check('V11 F TomTom 4 km daneben: keine Streckenmeldung', !/Stau bei Reinbek/.test(tw.text) && tw.warnungen.length === 0, tw.text);
    }
    /* ---------- 12. G, H, I: nahe am Nutzer / schwere Meldung weit daneben ---------- */
    {
        const g = await lauf([WN('A24 | Baustelle bei Wentorf', ['Baustelle'], 0.02, 3, '123')]);
        check('V12 G kleine Meldung nahe dem Start, aber 3 km neben der Route: keine Streckenmeldung', !/Wentorf/.test(g.text) && g.warnungen.length === 0 && !lagebildTexte(g).some(x => /Wentorf/.test(x)), g.text);
        const h = await lauf([WN('A24 | AS Reinbek - AS Billstedt', ['Vollsperrung'], 0.5, 5, '250')], [TN('Sperrung', 8, 4, 0, 0.5, 5, { von: 'AS Reinbek', strassen: ['A24'] })]);
        check('V12 H schwere Sperrung 5 km neben der Route: Schwere überstimmt die Lage nicht (autobahn.de und TomTom)', !/Sperrung/.test(h.text) && h.warnungen.length === 0 && h.karten.length === 0, h.text);
        check('V12 H ... die Aussage bleibt "keine Staumeldungen bekannt"', /Auf der A24 sind aktuell keine Staumeldungen bekannt\./.test(h.text), h.text);
        const i = await lauf([WN('A24 | Baustelle bei Wentorf', ['Baustelle'], 0.1, 0, '123'), WN('A24 | AS Reinbek - AS Billstedt', ['Vollsperrung'], 0.5, 4, '250')]);
        check('V12 I kleine Meldung auf der Route + schwere Sperrung weit daneben: nur die Baustelle ist Streckenmeldung', /Baustelle/.test(teilAuf(i.text)) && !/Sperrung/.test(i.text) && i.warnungen.length === 1 && /Wentorf/.test(i.warnungen[0].title), i.text);
        const i2 = await lauf([WN('A24 | Baustelle bei Wentorf', ['Baustelle'], 0.1, 0, '123'), WN('A24 | AS Reinbek - AS Billstedt', ['Vollsperrung'], 0.5, 0.6, '250')]);
        check('V12 I (nahe statt weit) die Sperrung steht im eigenen "nahe deiner Route"-Satz, nicht bei den Streckenmeldungen', /Baustelle/.test(teilAuf(i2.text)) && !/Sperrung/.test(teilAuf(i2.text)) && /Sperrung/.test(teilNah(i2.text)), i2.text);
    }
    /* ---------- 13. J, K: Phase 1 bleibt, auch mit Abstand ---------- */
    {
        const j = await lauf([WN('A24 | Kleine Baustelle bei Wentorf', ['Baustelle'], 0.1, 0, '123'), WN('A24 | Baustelle bei Reinbek', ['Baustelle'], 0.2, 0, '123'),
            WN('A24 | Hindernis bei Glinde', ['Gegenstand auf der Fahrbahn'], 0.3, 0), WN('A24 | Unfall weit weg', ['Unfall'], 0.35, 6, '101'), WN('A24 | AS Witzhave - AS Reinbek', ['Vollsperrung'], 0.4, 0, '250')]);
        check('V13 J Vollsperrung + kleine Meldungen auf der Route: Sperrung bleibt drin und steht vorn', /Sperrung/.test(teilAuf(j.text)) && (pos(teilAuf(j.text), 'Hindernis') < 0 || pos(teilAuf(j.text), 'Sperrung') < pos(teilAuf(j.text), 'Hindernis')) && (pos(teilAuf(j.text), 'Baustelle') < 0 || pos(teilAuf(j.text), 'Sperrung') < pos(teilAuf(j.text), 'Baustelle')), j.text);
        check('V13 J ... die weit entfernte Meldung taucht nirgends auf', !/weit weg/.test(j.text) && !j.warnungen.some(w => /weit weg/.test(w.title)), j.text);
        check('V13 J ... Warnliste beginnt weiter mit der Sperrung', j.warnungen.length > 0 && /Witzhave/.test(j.warnungen[0].title), JSON.stringify(j.warnungen.map(w => w.title)));
        const jt = await lauf([], [TN('Stau', 6, 2, 200, 0.3, 0, { von: 'Wentorf' }), TN('Stau', 6, 2, 170, 0.2, 0, { von: 'Reinbek' }), TN('Stau', 6, 2, 130, 0.1, 0, { von: 'Billstedt' }),
            TN('Sperrung', 8, 4, 0, 0.4, 0, { von: 'AS Reinbek', nach: 'AS Witzhave', strassen: ['A24'] })]);
        check('V13 J TomTom: Sperrung (0 s) + drei kleine Staus auf der Route: Sperrung bleibt vorn', pos(jt.text, 'Sperrung') >= 0 && pos(jt.text, 'Sperrung') < pos(jt.text, 'Stau bei') && jt.warnungen.length <= 3, jt.text);
        const k = await lauf([WN('In den Plantagen', ['Sperrung'], 0.5, 0, '250')]);
        check('V13 K "In den Plantagen" auf der Route: Sperrung ohne A24-Behauptung', AUFSATZ.test(k.text) && /Sperrung bei In den Plantagen/.test(teilAuf(k.text)) && !/A24/.test(teilAuf(k.text)), k.text);
        const k2 = await lauf([WN('In den Plantagen', ['Sperrung'], 0.5, 0.6, '250')]);
        check('V13 K "In den Plantagen" 0,6 km daneben: "nahe deiner Route", wieder ohne A24', /Sperrung bei In den Plantagen/.test(teilNah(k2.text)) && !/A24/.test(teilNah(k2.text)) && k2.warnungen.length === 0, k2.text);
    }
    /* ---------- 14. L: Direktweg (Satz, Karten, Warnliste) und Lagebild urteilen gleich ---------- */
    {
        const feed = [WN('A24 | Baustelle bei Wentorf', ['Baustelle'], 0.1, 0, '123'), WN('A24 | Baustelle bei Reinbek', ['Baustelle'], 0.2, 0.2, '123'), WN('A24 | Stau bei Glinde', ['Stau'], 0.3, 0.4, '123'),
            WN('A24 | Hindernis bei Billstedt', ['Gegenstand auf der Fahrbahn'], 0.5, 1.0), WN('A24 | Unfall bei Öjendorf', ['Unfall'], 0.6, 4, '101')];
        const l = await lauf(feed);
        const rel = w => l.sb.routenRelevanz(Number(w.coordinate.lat), Number(w.coordinate.long), l.coords).klasse;
        const erwartetAuf = feed.filter(w => rel(w) === 'auf').map(w => w.title.split('|').pop().trim()).sort();
        check('V14 L Testdaten decken auf, nahe und umgebung ab', ['auf', 'nahe', 'umgebung'].every(k => feed.some(w => rel(w) === k)), feed.map(rel).join());
        const lage = l.sb.jvLage.aufStrecke({ warnings: l.warnungen, coords: l.coords }).map(w => w.title.replace(/^Baustelle bei |^Stau bei /, '')).sort();
        const direkt = l.warnungen.map(w => w.title.replace(/^Baustelle bei |^Stau bei /, '')).sort();
        check('V14 L Direktweg-Warnliste und Lagebild kennen dieselben Streckenmeldungen', JSON.stringify(lage) === JSON.stringify(direkt) && direkt.length === erwartetAuf.length, JSON.stringify({ lage, direkt, erwartetAuf }));
        check('V14 L ... und jede ist als "auf" gekennzeichnet', l.warnungen.every(w => w.klasse === 'auf'), JSON.stringify(l.warnungen.map(w => w.klasse)));
        const lt = lagebildTexte(l);
        check('V14 L Lagebild zeigt genau die Meldungen auf der Strecke (nicht die nahen, nicht die entfernten)', erwartetAuf.every(t => lt.some(x => x.indexOf(t) >= 0)) && !lt.some(x => /Billstedt|Öjendorf/.test(x)), JSON.stringify(lt));
        check('V14 L Satz: die Meldung 1 km daneben steht nur im "nahe deiner Route"-Teil, die 4 km entfernte gar nicht', !/Billstedt/.test(teilAuf(l.text)) && !/Öjendorf/.test(l.text), l.text);
    }
    /* ---------- 15. Ohne Linienverlauf: nur das grobe Rechteck, also keine Aussage "auf der Strecke" ---------- */
    {
        const urls = [];
        const app = starte({ festerZufall: true, fetch: async u => { urls.push(u); if (/\/api\/stau\?road=/.test(u)) return antwort({ warning: [WN('A24 | Baustelle bei Reinbek', ['Baustelle'], 0.2, 0, '123')], webcam: [] }); if (/\/api\/stau\?traffic=1/.test(u)) return antwort({ incidents: [] }); throw new Error('offline (Attrappe): ' + u); } });
        const text = String((await app.lassLaufen(() => app.sb.describeAutobahnStau(['A24'], A[1], A[0], B[1], B[0]))).wert);
        check('V15 ohne Linienverlauf: keine Formulierung "auf der Strecke gemeldet"', !AUFSATZ.test(text) && /Außerdem gemeldet, im Gebiet der Strecke: A24: Baustelle bei Reinbek/.test(text), text);
        check('V15 ohne Linienverlauf: kein Widerspruch "keine Staumeldungen" davor', !/keine Staumeldungen/.test(text), text);
        const warn = JSON.parse(app.vm.runInContext('JSON.stringify(lastStauWarnings)', app.sb));
        check('V15 ohne Linienverlauf: Klasse "gebiet" (nicht belegt auf der Route)', warn.length === 1 && warn[0].klasse === 'gebiet', JSON.stringify(warn));
    }
    /* ---------- 16. Aufrufzahl, Doppelte ---------- */
    {
        const l = await lauf([WN('A24 | Baustelle bei Reinbek', ['Baustelle'], 0.2, 0.4, '123')], [TN('Stau', 6, 2, 300, 0.2, 0.4, { von: 'Reinbek' }), TN('Stau', 6, 2, 300, 0.6, 0.4, { von: 'Billstedt' })]);
        const art = u => /\/api\/route\?.*google=1/.test(u) ? 'route-google' : /\/api\/route/.test(u) ? 'route' : /\/api\/stau\?road=/.test(u) ? 'autobahn.de' : /\/api\/stau\?traffic=1/.test(u) ? 'tomtom' : 'anderes:' + u;
        check('V16 keine zusätzlichen Abfragen durch die Routenprüfung', JSON.stringify(l.urls.map(art).sort()) === JSON.stringify(['autobahn.de', 'route', 'route-google', 'tomtom']), JSON.stringify(l.urls.map(art)));
        check('V16 dieselbe nahe Stelle von autobahn.de und TomTom wird nur einmal genannt', (l.text.match(/Reinbek/g) || []).length === 1 && /Billstedt/.test(l.text), l.text);
    }

    /* ======================= LAGEBILD "VERKEHR IN DER NÄHE" ======================= */
    /* Lagebild-Fenster (Ansicht "Umkreis") mit festem Standort am Start der Route, einer Arbeitsstrecke (A -> B) und den übergebenen TomTom-Meldungen. Nominatim antwortet mit
       einer Attrappe, die jede Abfrage mitzählt. Alle Texte, die das Fenster setzt, werden gesammelt. */
    const PE = (f, dN, dE) => ({ lat: A[1] + (B[1] - A[1]) * f + dN / 111.2, lon: A[0] + (B[0] - A[0]) * f + (dE || 0) / (111.2 * Math.cos(53.5 * Math.PI / 180)) });
    const TQ = (art, kategorie, sek, p, von) => Object.assign({ art, kategorie, stufe: 2, verzoegerung_s: sek, laenge_m: 300, von: von || '', nach: '', strassen: [], text: '' }, p);
    const LINIE_LB = GEO.map(c => [c[1], c[0]]);   // [Breite, Länge]
    async function lageUmkreis(incidents, routenWarnungen) {
        const urls = [];
        const app = starte({ festerZufall: true, fetch: async u => {
            urls.push(u);
            if (/nominatim\.openstreetmap\.org/.test(u)) { const m = /lat=([-\d.]+)&lon=([-\d.]+)/.exec(u) || /lon=([-\d.]+)&lat=([-\d.]+)/.exec(u); return antwort({ address: { road: 'Teststraße ' + (m ? Number(m[1]).toFixed(3) : ''), suburb: 'Testort' } }); }
            if (/\/api\/stau\?traffic=1/.test(u)) return antwort({ incidents });
            throw new Error('offline (Attrappe): ' + u); } });
        const sb = app.sb, texte = [];
        app.setze('workAddress', 'Arbeit 1');
        sb.fetchUserLocationData = async () => ({ latitude: A[1], longitude: A[0], ort: 'Schwarzenbek' });
        sb.fetchRouteMapData = async () => ({ coords: LINIE_LB, warnings: routenWarnungen || [], fahrtMin: 30, stauMin: 0, km: 35 });
        const rec = () => new Proxy(function () { }, { get(t, k) { return k === 'textContent' ? '' : (k === Symbol.toPrimitive ? () => '' : rec()); }, set(t, k, v) { if (k === 'textContent') texte.push(String(v)); return true; }, apply() { return rec(); } });
        sb.document.createElement = () => rec();
        const lade = async () => { await app.lassLaufen(async () => { sb.jvLage.open(false); for (let i = 0; i < 300; i++) await new Promise(r => setImmediate(r)); }); };
        const nominatim = () => urls.filter(u => /nominatim\.openstreetmap\.org/.test(u)).length;
        await lade();
        return { app, sb, texte, urls, nominatim, nochmal: async () => { sb.jvLage.close(); texte.length = 0; await lade(); } };
    }
    const nahe = t => t.filter(x => /ABSEITS DEINER STRECKE|Unfall|Stau|Min\. länger|bei |Teststraße/.test(x));
    /* ---------- 17. Nähe-Meldung erscheint wieder (Kommentarfehler in lagebild.js Zeile 125) ---------- */
    {
        const L = await lageUmkreis([TQ('Unfall', 1, 900, PE(0.0, 7), 'Nordost')]);
        check('V17 1 Meldung ~7 km vom Standort, nicht an der Strecke: Karte "ABSEITS DEINER STRECKE"', L.texte.some(x => /ABSEITS DEINER STRECKE/.test(x)), JSON.stringify(nahe(L.texte)));
        check('V17 1 ... mit Unfall, Ort und Entfernung', L.texte.some(x => /bei Nordost: Unfall · 15 Min\. länger · 7 km/.test(x)), JSON.stringify(nahe(L.texte)));
        check('V17 1 ... und die Kachel "Ruhig" erscheint dann nicht', !L.texte.some(x => /Ruhig/.test(x)), JSON.stringify(L.texte));
    }
    /* ---------- 18. Meldungen, die nicht in "Verkehr in der Nähe" gehören ---------- */
    {
        const L = await lageUmkreis([TQ('Stau', 6, 600, PE(0.0, 20), 'Zuweit'), TQ('Baustelle', 9, 600, PE(0.0, 5), 'Baustelle'), TQ('Stau', 6, 600, PE(0.1, 0), 'AufRoute'), TQ('Stau', 6, 600, PE(0.05, 0.9), 'NaheRoute')]);
        check('V18 4 entfernte Meldung (20 km), Baustelle, Meldung auf der Strecke und Meldung 0,9 km neben der Strecke erscheinen NICHT unter "Verkehr in der Nähe"', !L.texte.some(x => /Zuweit|Baustelle|AufRoute|NaheRoute|ABSEITS/.test(x)), JSON.stringify(nahe(L.texte)));
        check('V18 6 ohne passende Meldung: keine leere Nähe-Karte, stattdessen "Ruhig"', L.texte.some(x => /Ruhig/.test(x)) && !L.texte.some(x => /ABSEITS DEINER STRECKE/.test(x)), JSON.stringify(L.texte));
        check('V18 5 ... und keine Nominatim-Abfrage für Meldungen, die gar nicht in die Nähe-Liste kommen (auch ohne Namen)', L.nominatim() === 0, String(L.nominatim()));
        const K = await lageUmkreis([TQ('Stau', 6, 600, PE(0.0, 20)), TQ('Baustelle', 9, 600, PE(0.0, 5)), TQ('Stau', 6, 600, PE(0.1, 0)), TQ('Stau', 6, 600, PE(0.05, 0.9))]);
        check('V18 5 namenlose Meldungen außerhalb der Nähe-Liste verursachen 0 Nominatim-Abfragen', K.nominatim() === 0, String(K.nominatim()));
        const leer = await lageUmkreis([]);
        check('V18 6 keine Verkehrsmeldungen: "Ruhig", keine Karte, keine Nominatim-Abfrage', leer.texte.some(x => /Ruhig/.test(x)) && !leer.texte.some(x => /ABSEITS/.test(x)) && leer.nominatim() === 0, JSON.stringify(leer.texte));
    }
    /* ---------- 19. Mehrere Nähe-Meldungen: vorhandene Sortierung (längste Verzögerung zuerst), nahe Dubletten nur einmal ---------- */
    {
        const L = await lageUmkreis([TQ('Stau', 6, 600, PE(0.0, 3), 'Klein'), TQ('Unfall', 1, 1200, PE(0.0, 6), 'Gross'), TQ('Stau', 6, 900, PE(0.0, 9), 'Mittel'), TQ('Stau', 6, 700, PE(0.0, 9.5), 'Doppelt')]);
        const z = L.texte.filter(x => /Min\. länger/.test(x));
        check('V19 5 Sortierung: 20 Min vor 15 Min vor 10 Min', z.length === 3 && /Gross/.test(z[0]) && /Mittel/.test(z[1]) && /Klein/.test(z[2]), JSON.stringify(z));
        check('V19 5 ... Meldung unter 1,5 km neben einer bereits genannten wird nicht doppelt aufgeführt', !L.texte.some(x => /Doppelt/.test(x)), JSON.stringify(z));
        check('V19 Titel zählt die Meldungen', L.texte.some(x => /^3 Meldungen$/.test(x)), JSON.stringify(L.texte));
    }
    /* ---------- 20. Strecke + Nähe zusammen: Phase 1 / Phase 2 / "In den Plantagen" bleiben ---------- */
    {
        const sperr = { lat: PE(0.1, 0).lat, lon: PE(0.1, 0).lon, road: 'A24', klasse: 'auf', autobahnBelegt: false, title: 'Sperrung bei In den Plantagen', text: '' };
        const L = await lageUmkreis([TQ('Stau', 6, 600, PE(0.0, 4), 'Klein')], [sperr]);
        check('V20 F schwere Streckenmeldung bleibt im Arbeitsweg-Bereich, ohne A24-Behauptung', L.texte.some(x => x === '⚠ Sperrung bei In den Plantagen'), JSON.stringify(L.texte.filter(x => /Plantagen|A24/.test(x))));
        check('V20 F ... und die kleine Nähe-Meldung verdrängt sie nicht, steht aber auch in "Verkehr in der Nähe"', L.texte.some(x => /bei Klein: Stau · 10 Min\. länger · 4 km/.test(x)) && L.texte.some(x => /ABSEITS DEINER STRECKE/.test(x)), JSON.stringify(nahe(L.texte)));
    }
    /* ---------- 21. Nominatim (orteNachladen): Aufrufzahl, Obergrenze, Cache ---------- */
    {
        const mit = await lageUmkreis([TQ('Unfall', 1, 900, PE(0.0, 7), 'Mit Namen'), TQ('Stau', 6, 600, PE(0.0, 4), 'Auch Name')]);
        check('V21 1 Meldungen mit vorhandenem Ortsnamen: 0 Nominatim-Aufrufe', mit.nominatim() === 0 && mit.texte.some(x => /ABSEITS/.test(x)), String(mit.nominatim()));
        const str = await lageUmkreis([Object.assign(TQ('Stau', 6, 600, PE(0.0, 4)), { strassen: ['B404'] })]);
        check('V21 1 ... auch bei vorhandener Straßennummer ohne Ortsnamen: 0 Aufrufe', str.nominatim() === 0, String(str.nominatim()));
        const eine = await lageUmkreis([TQ('Unfall', 1, 900, PE(0.0, 7))]);
        check('V21 2 eine namenlose Meldung: genau 1 Nominatim-Abfrage', eine.nominatim() === 1, String(eine.nominatim()));
        check('V21 2 ... und der gefundene Name erscheint in der Karte', eine.texte.some(x => /bei Teststraße [\d.]+, Testort: Unfall/.test(x)), JSON.stringify(nahe(eine.texte)));
        const viele = await lageUmkreis([TQ('Unfall', 1, 1300, PE(0.0, 3)), TQ('Stau', 6, 1200, PE(0.0, 5)), TQ('Stau', 6, 1100, PE(0.0, 7)), TQ('Stau', 6, 1000, PE(0.0, 9)), TQ('Stau', 6, 900, PE(0.0, 6, 4))]);
        check('V21 3 fünf namenlose Meldungen: höchstens 3 Nominatim-Abfragen', viele.nominatim() === 3, String(viele.nominatim()));
        check('V21 3 ... und es sind die 3 mit der längsten Verzögerung (Reihenfolge der Liste)', /lat=53\.5\d*/.test(viele.urls.filter(u => /nominatim/.test(u))[0] || '') && viele.urls.filter(u => /nominatim/.test(u)).length === 3);
        const n1 = viele.nominatim();
        await viele.nochmal();
        check('V21 4/6 erneutes Laden/Zeichnen derselben Stellen: keine weitere Nominatim-Abfrage (ortCache)', viele.nominatim() === n1, n1 + ' -> ' + viele.nominatim());
        check('V21 4/6 ... die Karte zeigt die Namen auch beim zweiten Laden', viele.texte.some(x => /Teststraße/.test(x)), JSON.stringify(nahe(viele.texte)));
    }
    /* ---------- 22. Netzwerk insgesamt: nichts Neues außer den vorhandenen Abfragen ---------- */
    {
        const L = await lageUmkreis([TQ('Unfall', 1, 900, PE(0.0, 7), 'Nordost')]);
        const unbekannt = L.urls.filter(u => !/\/api\/stau\?traffic=1|\/api\/tankroute|open-meteo\.com|nominatim\.openstreetmap\.org/.test(u));
        check('V22 10 Lagebild fragt nur Bekanntes ab (TomTom über /api/stau, Tankerkönig, Wetter, Nominatim), nichts Neues', unbekannt.length === 0, JSON.stringify(unbekannt));
        check('V22 10 /api/stau?traffic=1 wird beim Öffnen genau 1x abgefragt (wie vorher)', L.urls.filter(u => /\/api\/stau\?traffic=1/.test(u)).length === 1, JSON.stringify(L.urls));
    }

    /* ======================= SERVER: ROUTENRELEVANZ BEI TERMIN-ABFAHRTEN (api/sync.js) ======================= */
    /* api/sync.js wird als echte Datei geladen (Kopie mit zwei zusätzlichen Zeilen am Ende, die nur die inneren Funktionen herausreichen). Alle Netzwerkantworten sind feste Attrappen:
       OSRM im dokumentierten Format (steps=true: je Step eine geometry als Polyline mit 5 Stellen), autobahn.de-Feed der A24 und ein Redis aus dem Speicher. Kein Zugriff auf das echte Netz. */
    const nodeFs = require('fs'), nodeOs = require('os'), nodePath = require('path'), nodeUrl = require('url');
    let serverModul = null;
    async function ladeServer() {
        if (serverModul) return serverModul;
        const tmp = nodePath.join(nodeOs.tmpdir(), 'verkehr_server_' + process.pid + '.mjs');
        nodeFs.writeFileSync(tmp, nodeFs.readFileSync(nodePath.join(__dirname, '..', 'api', 'sync.js'), 'utf8') +
            "\nexport const __t = { checkStau, routeServer, decode: typeof decodePoly5 === 'function' ? decodePoly5 : null, saetze: typeof stauSaetze === 'function' ? stauSaetze : null };\nexport default handler;\n".replace('export default handler;\n', ''));
        const m = await import(nodeUrl.pathToFileURL(tmp).href);
        const hdl = (await import(nodeUrl.pathToFileURL(tmp).href)).default;
        try { nodeFs.unlinkSync(tmp); } catch (e) { }
        serverModul = { t: m.__t, handler: hdl };
        return serverModul;
    }
    /* Polyline mit 5 Stellen (Google-Format) - eigene, unabhängige Umsetzung für die Attrappe */
    const polyCodiere = pts => { let s = '', pb = 0, pl = 0; const e = v => { v = v < 0 ? ~(v << 1) : v << 1; let o = ''; while (v >= 0x20) { o += String.fromCharCode((0x20 | (v & 31)) + 63); v >>= 5; } return o + String.fromCharCode(v + 63); }; for (const p of pts) { const b = Math.round(p[1] * 1e5), l = Math.round(p[0] * 1e5); s += e(b - pb) + e(l - pl); pb = b; pl = l; } return s; };   // pts = [Länge, Breite]
    const osrmAntwort = (opt) => {
        opt = opt || {};
        const teile = [GEO.slice(0, 8), GEO.slice(7, 15), GEO.slice(14)];
        const steps = teile.map((t, i) => ({ ref: 'A24', name: '', distance: 12000, duration: 600, geometry: opt.ohneGeometrie ? undefined : (opt.kaputt === i ? 'abä!' : polyCodiere(t)) }));
        steps.push({ ref: '', name: '', distance: 0, duration: 0, geometry: opt.ankunftLeer ? '' : polyCodiere([GEO[20], GEO[20]]) });
        return { code: 'Ok', routes: opt.leer ? [] : [{ duration: 1800, distance: 35000, legs: [{ steps }] }] };
    };
    /* Meldung im Feed, genau km neben der Route (senkrecht zur Linie), an Stelle f */
    const SEITL = (f, km) => { const kx = 111.2 * Math.cos(53.5 * Math.PI / 180), dx = (B[0] - A[0]) * kx, dy = (B[1] - A[1]) * 111.2, L = Math.hypot(dx, dy); return { lat: A[1] + (B[1] - A[1]) * f + (dx / L) * km / 111.2, lon: A[0] + (B[0] - A[0]) * f + (-dy / L) * km / kx }; };
    const SW = (title, f, km, desc) => { const p = SEITL(f, km); return { title, description: desc || [], coordinate: { lat: p.lat.toFixed(5), long: p.lon.toFixed(5) }, icon: '101' }; };
    /* Netz-Attrappe für den Server: zählt Aufrufe, redis = Speicher (Schlüssel -> Text) */
    async function mitNetz(opt, fn) {
        const log = { osrm: [], autobahn: [], sonst: [] }, daten = Object.assign({}, opt.redis || {}), alt = global.fetch, env = {};
        for (const [k, v] of Object.entries({ PUSH_CRON_KEY: 'k', VAPID_PUBLIC_KEY: 'x', VAPID_PRIVATE_KEY: 'y', KV_REST_API_URL: 'https://kv.test', KV_REST_API_TOKEN: 't' })) { env[k] = process.env[k]; process.env[k] = v; }
        global.fetch = async (u, o) => {
            u = String(u);
            if (u === 'https://kv.test') { const c = JSON.parse(o.body); let r = null; if (c[0] === 'GET') r = daten[c[1]] === undefined ? null : daten[c[1]]; else if (c[0] === 'SET') { daten[c[1]] = c[2]; r = 'OK'; } return { ok: true, status: 200, json: async () => ({ result: r }) }; }
            if (/router\.project-osrm\.org\/route\/v1\/driving\//.test(u)) { log.osrm.push(u); if (opt.osrmFehler === 'netz') throw new Error('offline'); if (opt.osrmFehler === 500) return { ok: false, status: 500, json: async () => ({}) }; return antwort(opt.osrm || osrmAntwort()); }
            if (/verkehr\.autobahn\.de\/o\/autobahn\/A24\/services\/warning/.test(u)) { log.autobahn.push(u); return antwort({ warning: opt.feed || [] }); }
            log.sonst.push(u); throw new Error('offline (Attrappe): ' + u);
        };
        try { return await fn({ log, daten }); }
        finally { global.fetch = alt; for (const [k, v] of Object.entries(env)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } }
    }
    async function terminLauf(feed, osrmOpt, opt) {
        const S = await ladeServer(), jetzt = Date.now();
        const st = { items: [{ id: 't1', k: 'e', x: 'Zahnarzt', at: jetzt + 3 * 3600000, l: 'Hamburg Hbf', g: { lat: B[1], lon: B[0] } }], sent: {}, alive: 0, cfg: {}, loc: { lat: A[1], lon: A[0], ts: jetzt } };
        return mitNetz({ feed, osrm: osrmAntwort(osrmOpt), redis: { 'alltags-helfer:pushitems': JSON.stringify(st) }, osrmFehler: opt && opt.osrmFehler }, async ({ log, daten }) => {
            let status = 0; const res = { status(c) { status = c; return this; }, json() { return this; } };
            await S.handler({ query: { action: 'push_due', key: 'k' }, headers: {} }, res);
            const neu = JSON.parse(daten['alltags-helfer:pushitems']);
            return { status, dep: neu.dep && neu.dep.t1, log, S };
        });
    }
    const STAU = 'Stau Ahrensburg', SPERR = 'Vollsperrung Billstedt', UNF = 'Unfall Reinbek';
    /* ---------- 23. Grundlagen: Decodierung (bekannter Vergleichswert) und Anfrage unverändert ---------- */
    {
        const S = await ladeServer();
        const d = S.t.decode && S.t.decode('_p~iF~ps|U_ulLnnqC_mqNvxq`@');   // Beispiel aus der Google-Polyline-Beschreibung
        check('V23 5/7 Server decodiert Polyline5 richtig (Vergleichswert 38.5/-120.2, 40.7/-120.95, 43.252/-126.453)', !!d && d.length === 3 && Math.abs(d[0][0] - 38.5) < 1e-9 && Math.abs(d[0][1] + 120.2) < 1e-9 && Math.abs(d[1][0] - 40.7) < 1e-9 && Math.abs(d[2][1] + 126.453) < 1e-9, JSON.stringify(d));
        check('V23 5/7 ... kaputte, leere und fremde Zeichenketten ergeben null statt Absturz', !!S.t.decode && [null, '', 'abä!', '_p~iF~ps|U_ulL', undefined, 12].every(x => S.t.decode(x) === null), '');
        const r = await mitNetz({}, async ({ log }) => ({ r: await S.t.routeServer({ lat: A[1], lon: A[0] }, { lat: B[1], lon: B[0] }), log }));
        check('V23 29 OSRM-Anfrage unverändert (overview=false&steps=true) und genau 1 Aufruf', r.log.osrm.length === 1 && /\?overview=false&steps=true$/.test(r.log.osrm[0]), JSON.stringify(r.log.osrm));
        check('V23 5 Linie aus den Step-Geometrien entsteht (Text) und Fahrzeit/Autobahn bleiben', typeof r.r.lin === 'string' && r.r.lin.length > 10 && r.r.fahrtMin === 30 && r.r.autobahnen.join() === 'A24', JSON.stringify(r.r).slice(0, 200));
        const pts = r.r.lin && S.t.decode ? S.t.decode(r.r.lin) : null;
        check('V23 5 ... die Linie beginnt am Start, endet am Ziel und deckt die ganze Strecke ab', !!pts && Math.abs(pts[0][0] - A[1]) < 1e-3 && Math.abs(pts[0][1] - A[0]) < 1e-3 && Math.abs(pts[pts.length - 1][0] - B[1]) < 1e-3 && Math.abs(pts[pts.length - 1][1] - B[0]) < 1e-3, pts ? pts.length + ' Punkte' : 'keine');
    }
    /* ---------- 24. Einordnung und Zusatzminuten je Abstand (checkStau mit Linie) ---------- */
    {
        const S = await ladeServer();
        const lin = (await mitNetz({}, async () => (await S.t.routeServer({ lat: A[1], lon: A[0] }, { lat: B[1], lon: B[0] })))).lin;
        const route = { autobahnen: ['A24'], from: { lat: A[1], lon: A[0] }, to: { lat: B[1], lon: B[0] }, lin };
        const pruefe = async (feed, r) => (await mitNetz({ feed }, async () => S.t.checkStau(r || route)));
        const e1 = await pruefe([SW(STAU, 0.5, 0.1)]);
        check('V24 1 Stau 0,1 km neben der Linie (AUF): Text und 10 Zusatzminuten', e1.kostMin === 10 && e1.meldungen.length === 1 && /Ahrensburg/.test(e1.meldungen[0]), JSON.stringify(e1));
        const e2 = await pruefe([SW(STAU, 0.5, 0.24)]);
        check('V24 2 Grenzfall 0,24 km (noch AUF): Zusatzminuten', e2.kostMin === 10 && e2.meldungen.length === 1, JSON.stringify(e2));
        const e2b = await pruefe([SW(STAU, 0.5, 0.27)]);
        check('V24 2 knapp über 0,25 km (0,27): nicht mehr AUF, keine Zusatzminuten', e2b.kostMin === 0 && e2b.meldungen.length === 0, JSON.stringify(e2b));
        for (const km of [0.5, 1.0]) {
            const n = await pruefe([SW(SPERR, 0.5, km)]);
            check('V24 3/4 Vollsperrung ' + km + ' km daneben (NAHE): als "nahe" erlaubt, 0 Zusatzminuten, nicht unter "auf der Strecke"', n.kostMin === 0 && (n.meldungen || []).length === 0 && (n.nahe || []).length === 1 && /Billstedt/.test(n.nahe[0]), JSON.stringify(n));
        }
        for (const km of [4, 15, 8]) {
            const u = await pruefe([SW(STAU, 0.5, km)]);
            check('V24 5/6 Stau ' + km + ' km daneben (UMGEBUNG): kein Text, 0 Zusatzminuten', u.kostMin === 0 && (u.meldungen || []).length === 0 && (u.nahe || []).length === 0, JSON.stringify(u));
        }
        const sp = await pruefe([SW(SPERR, 0.5, 4)]);
        check('V24 7 schwere Sperrung 4 km abseits: 0 Zusatzminuten', sp.kostMin === 0 && (sp.meldungen || []).length === 0, JSON.stringify(sp));
        const un = await pruefe([SW(UNF, 0.3, 0.05)]);
        check('V24 9 Unfall AUF: bestehende Minutenlogik (10)', un.kostMin === 10 && /Unfall/.test(un.meldungen.join()), JSON.stringify(un));
        const m20 = await pruefe([SW(STAU, 0.5, 0.05, ['Verzögerung: 20 Minuten'])]);
        check('V24 10 Meldungstext mit 20 Minuten AUF: 20 Minuten bleiben', m20.kostMin === 20, JSON.stringify(m20));
        const m3 = await pruefe([SW('Stau Ahrensburg', 0.2, 0.05), SW('Stau Reinbek', 0.5, 0.05), SW('Stau Billstedt', 0.8, 0.05)]);
        check('V24 11 drei AUF-Meldungen: 30 Minuten, 3 Texte', m3.kostMin === 30 && m3.meldungen.length === 3, JSON.stringify(m3));
        const m6 = await pruefe(['Ahrensburg', 'Reinbek', 'Billstedt', 'Glinde', 'Wentorf', 'Hamm'].map((n, i) => SW('Stau ' + n, 0.1 + i * 0.15, 0.05)));
        check('V24 11 sechs AUF-Meldungen: Obergrenze 45 Minuten, höchstens 3 Texte', m6.kostMin === 45 && m6.meldungen.length === 3, JSON.stringify(m6));
        const gemischt = await pruefe([SW(STAU, 0.5, 4), SW(SPERR, 0.6, 0.5), SW(UNF, 0.3, 0.05)]);
        check('V24 18 gemischt: nur die AUF-Meldung zählt (10 Min.), NAHE nur als Hinweis, UMGEBUNG fehlt', gemischt.kostMin === 10 && gemischt.meldungen.length === 1 && gemischt.nahe.length === 1 && !/Ahrensburg/.test(JSON.stringify(gemischt)), JSON.stringify(gemischt));
    }
    /* ---------- 25. Ohne brauchbare Linie: Rückfall ohne geschätzte Zusatzminuten ---------- */
    {
        const S = await ladeServer();
        const basis = { autobahnen: ['A24'], from: { lat: A[1], lon: A[0] }, to: { lat: B[1], lon: B[0] } };
        const pruefe = async (feed, r) => (await mitNetz({ feed }, async () => S.t.checkStau(r)));
        const f1 = await pruefe([SW(STAU, 0.5, 4)], basis);
        check('V25 12 keine Linie: allgemeiner Hinweis erlaubt, aber 0 Zusatzminuten (4 km abseits)', f1.kostMin === 0, JSON.stringify(f1));
        const f2 = await pruefe([SW(STAU, 0.5, 15), SW(SPERR, 0.5, 0.05)], basis);
        check('V25 12 keine Linie: auch eine Meldung direkt an der Strecke und eine 15 km daneben ergeben keine geschätzten Minuten', f2.kostMin === 0 && f2.geprueft === true, JSON.stringify(f2));
        const f3 = await pruefe([SW(STAU, 0.5, 0.05)], Object.assign({ lin: 'abä!kaputt' }, basis));
        check('V25 13 kaputte Linie: kein Absturz, 0 Zusatzminuten', f3.kostMin === 0 && f3.geprueft === true, JSON.stringify(f3));
        const f4 = await pruefe([SW(STAU, 0.5, 0.05)], Object.assign({ lin: '' }, basis));
        check('V25 15 leere Linie: kein Absturz, 0 Zusatzminuten', f4.kostMin === 0, JSON.stringify(f4));
        const f5 = await pruefe([SW(STAU, 0.5, 0.05)], Object.assign({ lin: polyCodiere([[A[0], A[1]]]) }, basis));
        check('V25 15 Linie mit nur einem Punkt: 0 Zusatzminuten', f5.kostMin === 0, JSON.stringify(f5));
        const f6 = await pruefe([], Object.assign({}, basis, { autobahnen: [] }));
        check('V25 ohne Autobahn auf der Strecke: wie bisher nicht geprüft', f6.geprueft === false && (f6.meldungen || []).length === 0, JSON.stringify(f6));
    }
    /* ---------- 26. routeServer: fehlende/kaputte/teilweise kaputte Geometrie, leere Route, OSRM-Fehler ---------- */
    {
        const S = await ladeServer();
        const rs = async (opt) => mitNetz(opt, async () => S.t.routeServer({ lat: A[1], lon: A[0] }, { lat: B[1], lon: B[0] }));
        const ohne = await rs({ osrm: osrmAntwort({ ohneGeometrie: true }) });
        check('V26 12 fehlende Step-Geometrie: Fahrzeit und Autobahn bleiben, keine Linie', !!ohne && ohne.fahrtMin === 30 && ohne.autobahnen.join() === 'A24' && !ohne.lin, JSON.stringify(ohne));
        const kaputt = await rs({ osrm: osrmAntwort({ kaputt: 1 }) });
        check('V26 13/14 ein kaputter Step: keine Linie (kein Loch erraten), Fahrzeit bleibt', !!kaputt && kaputt.fahrtMin === 30 && !kaputt.lin, JSON.stringify(kaputt));
        const ankunft = await rs({ osrm: osrmAntwort({ ankunftLeer: true }) });
        check('V26 14 leere Geometrie bei dem Ankunfts-Step ohne Länge stört nicht (Linie entsteht)', !!ankunft && typeof ankunft.lin === 'string' && ankunft.lin.length > 10, JSON.stringify(ankunft));
        const leer = await rs({ osrm: osrmAntwort({ leer: true }) });
        check('V26 15 leere Route (keine routes): wie bisher null', leer === null, JSON.stringify(leer));
        const f500 = await rs({ osrmFehler: 500 }), fNetz = await rs({ osrmFehler: 'netz' });
        check('V26 16 OSRM-Fehler (500 / Netz): wie bisher null, kein Absturz', f500 === null && fNetz === null, JSON.stringify([f500, fNetz]));
        const S2 = await ladeServer();
        const teil = await mitNetz({ osrm: osrmAntwort({ kaputt: 0 }), feed: [SW(STAU, 0.5, 0.05)] }, async () => { const r = await S2.t.routeServer({ lat: A[1], lon: A[0] }, { lat: B[1], lon: B[0] }); return S2.t.checkStau({ autobahnen: r.autobahnen, from: { lat: A[1], lon: A[0] }, to: { lat: B[1], lon: B[0] }, lin: r.lin }); });
        check('V26 14 teilweise kaputte Steps ergeben nie Zusatzminuten (sicher und immer gleich)', teil.kostMin === 0, JSON.stringify(teil));
    }
    /* ---------- 27. Ganzer Weg: Termin-Abfahrt (Zeitgeber-Lauf) mit Redis-Attrappe ---------- */
    {
        const fall = async (name, feed, erwartet, osrmOpt) => {
            const r = await terminLauf(feed, osrmOpt);
            check('V27 ' + name + ': Abfahrt wird berechnet (Zusatzminuten ' + erwartet + ')', r.status === 200 && !!r.dep && !r.dep.fail && r.dep.fahrtMin === 30 && (r.dep.stauMin || 0) === erwartet, JSON.stringify(r.dep).slice(0, 220) + ' status ' + r.status);
            return r;
        };
        const a4 = await fall('11 4-km-Offroute-Stau', [SW(STAU, 0.5, 4)], 0);
        const a15 = await fall('12 15-km-Offroute-Sperrung', [SW(SPERR, 0.5, 15)], 0);
        const n05 = await fall('13 NAHE 0,5 km', [SW(SPERR, 0.5, 0.5)], 0);
        const n10 = await fall('14 NAHE 1,0 km', [SW(SPERR, 0.5, 1.0)], 0);
        const auf = await fall('8 kleiner Stau AUF', [SW(STAU, 0.5, 0.05)], 10);
        await fall('15 AUF mit 20-Minuten-Meldung', [SW(STAU, 0.5, 0.05, ['Verzögerung: 20 Minuten'])], 20);
        await fall('16 mehrere AUF-Meldungen, Obergrenze', ['Ahrensburg', 'Reinbek', 'Billstedt', 'Glinde', 'Wentorf'].map((n, i) => SW('Stau ' + n, 0.1 + i * 0.18, 0.05)), 45);
        await fall('17 ohne Geometrie (Rückfall) mit Meldung 4 km daneben', [SW(STAU, 0.5, 4)], 0, { ohneGeometrie: true });
        await fall('18 kaputte Geometrie (Rückfall) mit Meldung auf der Strecke', [SW(STAU, 0.5, 0.05)], 0, { kaputt: 2 });
        const abfahrtMin = r => r.dep.fahrtMin + (r.dep.stauMin || 0) + 10;   // wie leaveAt0 in api/sync.js: Fahrzeit + Aufschlag + 10 Minuten Puffer
        check('V27 18/19/21 UMGEBUNG (4 km) und NAHE ziehen die Abfahrtszeit nicht vor (Abfahrt 40 Minuten vor dem Termin, wie ohne Meldung); eine Meldung AUF der Strecke schon (50)', abfahrtMin(a4) === 40 && abfahrtMin(a15) === 40 && abfahrtMin(n05) === 40 && abfahrtMin(n10) === 40 && abfahrtMin(auf) === 50, [a4, a15, n05, n10, auf].map(abfahrtMin).join(','));
        check('V27 25-29 genau 1 OSRM-Aufruf (unverändert) und 1 autobahn.de-Aufruf je Berechnung, nichts anderes', auf.log.osrm.length === 1 && auf.log.autobahn.length === 1 && /\?overview=false&steps=true$/.test(auf.log.osrm[0]) && auf.log.sonst.every(u => !/osrm|autobahn/.test(u)), JSON.stringify({ osrm: auf.log.osrm.length, a: auf.log.autobahn.length }));
        check('V27 Speicher: die Linie wird kompakt mit dem Termin gemerkt (unter 2000 Zeichen)', typeof auf.dep.lin === 'string' && auf.dep.lin.length > 10 && auf.dep.lin.length < 2000, String(auf.dep.lin && auf.dep.lin.length));
        const S = await ladeServer();
        const spaeter = await mitNetz({ feed: [SW(STAU, 0.5, 0.05), SW(SPERR, 0.6, 0.5), SW(STAU + ' 2', 0.4, 4)] }, async () => S.t.checkStau({ autobahnen: auf.dep.autobahnen, from: auf.dep.from, to: auf.dep.to, lin: auf.dep.lin }));
        check('V27 spätere Prüfung (Abfahrts-/Vorbereitungs-Nachricht) nutzt die gemerkte Linie: 1 auf der Strecke, 1 nahe, die 4-km-Meldung fehlt', spaeter.meldungen.length === 1 && spaeter.nahe.length === 1 && spaeter.kostMin === 10 && !/ 2/.test(JSON.stringify(spaeter)), JSON.stringify(spaeter));
    }
    /* ---------- 27b. Sätze der Termin-Nachricht ---------- */
    {
        const S = await ladeServer(), sa = S.t.saetze || (() => ['(fehlt)']);
        const mit = sa({ geprueft: true, meldungen: ['A24 Stau X (Stau)'], nahe: ['A24 Sperrung Y (Sperrung)'], kostMin: 10, ohneLinie: false });
        check('V27b 6 mit Linie: "Auf der Strecke" und getrennt "Außerdem gemeldet, nahe deiner Route"', mit.length === 2 && /^Auf der Strecke: A24 Stau X/.test(mit[0]) && /^Außerdem gemeldet, nahe deiner Route: A24 Sperrung Y/.test(mit[1]), JSON.stringify(mit));
        const nurNah = sa({ geprueft: true, meldungen: [], nahe: ['A24 Sperrung Y (Sperrung)'], kostMin: 0, ohneLinie: false });
        check('V27b 6 nur eine nahe Meldung: "Keine Staumeldungen auf der Strecke" plus Hinweis (die nahe Meldung wird nicht als sicher auf der Strecke gesagt)', nurNah.length === 2 && /^Keine Staumeldungen auf der Strecke/.test(nurNah[0]) && /nahe deiner Route/.test(nurNah[1]), JSON.stringify(nurNah));
        const ohne = sa({ geprueft: true, meldungen: ['A24 Stau X (Stau)'], nahe: [], kostMin: 0, ohneLinie: true });
        check('V27b 7 ohne Linie: nur "Im Gebiet der Strecke", nicht "Auf der Strecke"', ohne.length === 1 && /^Im Gebiet der Strecke: /.test(ohne[0]) && !/Auf der Strecke/.test(ohne[0]), JSON.stringify(ohne));
    }
    /* ---------- 28. Browser und Server stufen dieselben Koordinaten gleich ein ---------- */
    {
        const S = await ladeServer(), app = starte({ festerZufall: true, fetch: async () => { throw new Error('offline'); } });
        const lin = (await mitNetz({}, async () => (await S.t.routeServer({ lat: A[1], lon: A[0] }, { lat: B[1], lon: B[0] })))).lin;
        const ungleich = [];
        for (const km of [0.05, 0.1, 0.24, 0.3, 0.5, 1.0, 1.15, 1.3, 4, 15]) {
            const p = SEITL(0.5, km), client = app.sb.routenRelevanz(p.lat, p.lon, LINIE_LB).klasse;
            const r = await mitNetz({ feed: [SW(STAU, 0.5, km)] }, async () => S.t.checkStau({ autobahnen: ['A24'], from: { lat: A[1], lon: A[0] }, to: { lat: B[1], lon: B[0] }, lin }));
            const server = (r.meldungen || []).length ? 'auf' : (r.nahe || []).length ? 'nahe' : 'umgebung';
            if (client !== server) ungleich.push(km + ' km: Browser ' + client + ', Server ' + server);
        }
        check('V28 20 Browser (routenRelevanz) und Server ordnen 10 Abstände von 0,05 bis 15 km gleich ein', ungleich.length === 0, ungleich.join(' | '));
    }

    console.log('VERKEHR PHASE 1 + 2 + LAGEBILD-NÄHE + SERVER-ROUTENRELEVANZ: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
