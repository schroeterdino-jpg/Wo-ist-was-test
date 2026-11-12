/* ============================================================
   TEST: Ausflug-Anschluss: "Nee, ich suche was für drin" nach einem Vorschlag plant neu (nur der Wunsch ändert sich).
   Start: node tests/ausflug_folge.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const antwort = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const pause = ms => new Promise(r => setTimeout(r, ms));
const STAND = { lat: 53.5, lon: 10 };
const AUSSEN = [{ name: 'Wildpark Schwarze Berge', lat: 53.4, lon: 10.0 }, { name: 'Minigolf Hamburg Süd', lat: 53.45, lon: 10.05 }];
const INNEN = [{ name: 'Indoor Spielplatz Bunte Welt', lat: 53.52, lon: 10.02 }, { name: 'Hallenbad Harburg', lat: 53.46, lon: 9.98 }];
function neu() {
    const suchen = [];
    const app = starte({ jetzt: '2026-11-12T10:00:00+01:00', festerZufall: true, fetch: async (u, o) => {
        u = String(u);
        if (/\/api\/maps\?action=places/.test(u)) { const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || ''); suchen.push(q); const d = /Indoor|Hallenbad|Museum|Bowling/.test(q); return antwort({ places: (d ? INNEN : AUSSEN).map(p => Object.assign({ hours: '' }, p)) }); }
        if (/\/api\/route/.test(u)) return antwort({ routes: [{ duration: 1800 }] });
        if (/googleapis\.com\/calendar/.test(u)) return antwort({ items: [] });
        if (/\/api\/groq/.test(u)) return antwort({ choices: [{ message: { content: JSON.stringify({ reply: 'KI-ANTWORT', actions: [] }) } }] });
        throw new Error('offline ' + u);
    } });
    app.setze('wetterPosition', async () => STAND);
    app.setze('fetchWeatherForecast', async () => ({ tage: ['2026-11-12', '2026-11-13', '2026-11-14'].map(d => ({ datum: d, regenwahrscheinlichkeit_prozent: 5, niederschlag_mm: 0, hoechstwert_grad: 12 })) }));
    app.suchen = suchen; return app;
}
async function satz(app, t) { const x = await app.satz(t); await pause(150); await app.lassLaufen(async () => { }); return x; }
const alles = app => app.gesagt.join(' ');
(async () => {
    for (const folge of ['Nee, ich suche was für drin', 'Nein, lieber drinnen', 'Such was für drinnen', 'Nee, ich will was Indoor']) {
        const app = neu();
        await satz(app, 'Such mir einen Ausflug mit den Kindern für morgen');
        const antw = alles(app);
        if (!/Wildpark|Minigolf/.test(antw)) { await satz(app, 'die Kinder'); }
        check('Start: draußen vorgeschlagen (' + folge + ')', /Wildpark|Minigolf/.test(alles(app)), alles(app).slice(0, 200));
        app.gesagt.length = 0;
        const n0 = app.suchen.length;
        const r = await satz(app, folge);
        check('lokal übernommen: ' + folge, r.lokal === true, String(r.modul));
        check('neue Suche nach drinnen: ' + folge, app.suchen.slice(n0).some(q => /Indoor|Hallenbad|Museum|Bowling/.test(q)), JSON.stringify(app.suchen.slice(n0)));
        check('Antwort nennt Indoor-Ziele: ' + folge, /Indoor Spielplatz|Hallenbad/.test(alles(app)), alles(app).slice(0, 200));
        check('keine Rückfrage "Was suchst du": ' + folge, !/was suchst du/i.test(alles(app)));
    }
    {   /* ohne vorherige Anfrage: kein Eingriff */
        const app = neu();
        const r = await satz(app, 'Nee, ich suche was für drin');
        check('ohne Ausflugsanfrage: nicht übernommen', !(r.modul === 'ausflug'), String(r.modul));
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
