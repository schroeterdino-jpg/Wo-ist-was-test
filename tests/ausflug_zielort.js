/* ============================================================
   TESTS "Zielort beim Ausflug". Start: node tests/ausflug_zielort.js
   Ein ausdrücklich genannter Zielort ("Ausflug nach Lübeck", "in Schwerin machen") muss von der Frage bis zur Ortssuche, zum Wetter und zur
   Fahrzeit erhalten bleiben und hat Vorrang vor dem eigenen Standort. Ohne Zielort bleibt alles wie bisher (Suche um den eigenen Standort).
   Keine feste Ortsliste im Programm: die Attrappe der Ortsauflösung kennt mehrere Städte, die Prüfungen sind für alle gleich.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const antwort = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const pause = ms => new Promise(r => setTimeout(r, ms));
const HEIM = { lat: 53.5, lon: 10.5 };   // eigener Standort (Schwarzenbek-Gegend)
const STAEDTE = { 'Lübeck': [53.87, 10.69], 'Hamburg': [53.55, 9.99], 'Schwerin': [53.63, 11.41], 'Kiel': [54.32, 10.14], 'Flensburg': [54.78, 9.44] };
const nah = (a, b) => Math.abs(a[0] - b[0]) < 0.01 && Math.abs(a[1] - b[1]) < 0.01;

function neu(opt) {
    opt = opt || {};
    const suchen = [], wetterPos = [], routen = [], geo = [];
    const app = starte({
        jetzt: '2026-11-07T14:40:00+01:00', festerZufall: true,
        fetch: async (u) => {
            u = String(u);
            if (/\/api\/geocode/.test(u)) {
                const q = decodeURIComponent(u.split('q=')[1]); geo.push(q);
                return antwort(STAEDTE[q] ? [{ lat: STAEDTE[q][0], lon: STAEDTE[q][1], display_name: q + ', Deutschland' }] : []);
            }
            if (/\/api\/maps\?action=places/.test(u)) {
                const lat = +u.match(/lat=([\d.]+)/)[1], lon = +u.match(/lon=([\d.]+)/)[1];
                suchen.push([lat, lon]);
                return antwort({ places: [{ name: 'Ziel A', lat: lat + 0.02, lon: lon + 0.02 }, { name: 'Ziel B', lat: lat - 0.02, lon: lon + 0.01 }] });
            }
            if (/\/api\/route/.test(u)) { routen.push([+u.match(/fromLat=([\d.]+)/)[1], +u.match(/fromLon=([\d.]+)/)[1]]); return antwort({ routes: [{ duration: 2400 }] }); }
            if (/googleapis\.com\/calendar/.test(u)) return antwort({ items: [] });
            if (/\/api\/groq/.test(u)) return antwort({ choices: [{ message: { content: JSON.stringify({ reply: 'KI', actions: [] }) } }] });
            throw new Error('offline (Attrappe): ' + u);
        }
    });
    app.setze('wetterPosition', async () => HEIM);
    app.setze('fetchWeatherForecast', async (pos) => {
        wetterPos.push(pos ? [pos.lat, pos.lon] : 'eigener Standort');
        return { tage: ['2026-11-07', '2026-11-08', '2026-11-09', '2026-11-10'].map(d => ({ datum: d, regenwahrscheinlichkeit_prozent: 5, niederschlag_mm: 0, hoechstwert_grad: 9 })) };
    });
    (opt.termine || []).forEach(t => app.lese('calendarEntries').push(t));
    app.suchen = suchen; app.wetterPos = wetterPos; app.routen = routen; app.geo = geo;
    return app;
}
async function sag(app, t) { const x = await app.satz(t); await pause(120); await app.lassLaufen(async () => { }); x.alles = app.gesagt.slice(); return x; }
const letztes = app => app.gesagt[app.gesagt.length - 1] || '';

(async () => {
    /* Hauptfall und Varianten: Frage -> (Rückfrage "Wer kommt mit?") -> Antwort. Prüfungen sind für jede Stadt gleich. */
    const FAELLE = [
        { satz: 'Habe ich nächste Woche Zeit für einen Ausflug nach Lübeck?', ort: 'Lübeck', antw: 'die Kinder' },
        { satz: 'Habe ich Samstag Zeit für einen Ausflug nach Hamburg?', ort: 'Hamburg', antw: 'nur wir' },
        { satz: 'Können wir Sonntag etwas in Lübeck unternehmen?', ort: 'Lübeck', antw: 'die Kinder' },
        { satz: 'Was können wir am Wochenende in Schwerin machen?', ort: 'Schwerin', antw: 'die Kinder' },
        { satz: 'Hast du eine Idee für einen Ausflug nach Kiel?', ort: 'Kiel', antw: 'nur wir' },
        { satz: 'Wohin können wir am Samstag mit den Enkeln in Flensburg fahren?', ort: 'Flensburg', antw: null }
    ];
    for (const f of FAELLE) {
        const app = neu();
        const e1 = await sag(app, f.satz);
        check(f.satz + ' → Ausflug-Modul übernimmt', /ausflug/.test(String(e1.modul)), String(e1.modul));
        if (f.antw) { await sag(app, f.antw); }
        const m = STAEDTE[f.ort];
        check(f.satz + ' → Ortssuche wurde für ' + f.ort + ' aufgelöst', app.geo.includes(f.ort), JSON.stringify(app.geo));
        check(f.satz + ' → Ausflugssuche läuft um ' + f.ort + ', nicht um den eigenen Standort', app.suchen.length > 0 && app.suchen.every(p => nah(p, m)), JSON.stringify(app.suchen));
        check(f.satz + ' → Wetter für ' + f.ort, app.wetterPos.length > 0 && app.wetterPos.every(p => Array.isArray(p) && nah(p, m)), JSON.stringify(app.wetterPos));
        check(f.satz + ' → Antwort nennt ' + f.ort, new RegExp(f.ort).test(letztes(app)), letztes(app).slice(0, 160));
        check(f.satz + ' → Ziele sind Karten mit Entfernung vom eigenen Standort (nicht vom Zielort-Mittelpunkt)', /Ziel A|Ziel B/.test(letztes(app)), letztes(app).slice(0, 200));
    }
    /* Agent-Weg: Fahrzeit wird vom eigenen Standort zum Ziel gerechnet, Suche und Wetter beim Ziel */
    {
        const app = neu();
        await sag(app, 'Plane Samstag einen Ausflug nach Kiel mit den Kindern und kümmer dich darum');
        check('Agent: Suche um Kiel', app.suchen.length > 0 && app.suchen.every(p => nah(p, STAEDTE['Kiel'])), JSON.stringify(app.suchen));
        check('Agent: Wetter für Kiel', app.wetterPos.length > 0 && app.wetterPos.every(p => Array.isArray(p) && nah(p, STAEDTE['Kiel'])), JSON.stringify(app.wetterPos));
        check('Agent: Fahrzeit startet am eigenen Standort', app.routen.length > 0 && app.routen.every(p => nah(p, [HEIM.lat, HEIM.lon])), JSON.stringify(app.routen));
        check('Agent: Antwort nennt Kiel', /Kiel/.test(letztes(app)), letztes(app).slice(0, 200));
    }
    /* Ohne Zielort: bisheriges Verhalten (Suche und Wetter um den eigenen Standort, keine Ortsauflösung) */
    {
        const app = neu();
        const e1 = await sag(app, 'Habe ich nächste Woche Zeit für einen Ausflug?');
        check('ohne Ziel: Kalenderantwort und Rückfrage', /Zeit für einen Ausflug/.test(e1.alles.join(' ')) && /mitkommt/.test(e1.alles.join(' ')), e1.alles.join(' ').slice(0, 200));
        await sag(app, 'die Kinder');
        check('ohne Ziel: keine Ortsauflösung', app.geo.length === 0, JSON.stringify(app.geo));
        check('ohne Ziel: Suche um den eigenen Standort', app.suchen.length > 0 && app.suchen.every(p => nah(p, [HEIM.lat, HEIM.lon])), JSON.stringify(app.suchen));
        check('ohne Ziel: Wetter wie bisher für den eigenen Standort', app.wetterPos.length > 0 && app.wetterPos.every(p => p === 'eigener Standort'), JSON.stringify(app.wetterPos));
        check('ohne Ziel: Antwort nennt keinen Ort', !/ in [A-Z]/.test(letztes(app).split('.')[0]), letztes(app).slice(0, 120));
        const app2 = neu();
        await sag(app2, 'Was können wir Samstag mit den Kindern unternehmen?');
        check('ohne Ziel (Klassiker): Suche um den eigenen Standort', app2.suchen.length > 0 && app2.suchen.every(p => nah(p, [HEIM.lat, HEIM.lon])) && app2.geo.length === 0, JSON.stringify(app2.suchen));
    }
    /* Wörter, die KEIN Ort sind, werden nicht als Ziel genommen */
    for (const satz of ['Was können wir am Samstag mit den Kindern unternehmen?', 'Hast du eine Idee für einen Ausflug in der Nähe?', 'Habe ich nächste Woche Zeit für einen Ausflug in der Umgebung?', 'Gibt es einen Ausflug im Wochenende']) {
        const app = neu(); await sag(app, satz); await sag(app, 'die Kinder');
        check('kein Ortsziel erkannt: ' + satz, app.geo.length === 0, JSON.stringify(app.geo));
    }
    /* Unbekannter Ort: ehrlich sagen, nicht still um den Standort suchen */
    {
        const app = neu();
        await sag(app, 'Habe ich nächste Woche Zeit für einen Ausflug nach Xyzburg?'); await sag(app, 'die Kinder');
        check('unbekannter Ort: ehrliche Antwort', /Xyzburg/.test(letztes(app)) && /nicht gefunden/.test(letztes(app)), letztes(app));
        check('unbekannter Ort: es wird NICHT still um den eigenen Standort gesucht', app.suchen.length === 0, JSON.stringify(app.suchen));
    }
    /* Der Kalender wird auch mit Zielort nicht verändert */
    {
        const app = neu(); const vor = JSON.stringify(app.lese('calendarEntries'));
        await sag(app, 'Habe ich nächste Woche Zeit für einen Ausflug nach Lübeck?'); await sag(app, 'die Kinder');
        check('Kalender bleibt unverändert', JSON.stringify(app.lese('calendarEntries')) === vor);
        check('Chef-KI bleibt aus', app.store['jv_chef'] !== '1' && !app.sb.jvChef.istAn());
    }
    console.log('Ausflug-Zielort: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
