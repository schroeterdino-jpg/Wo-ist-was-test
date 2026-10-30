/* ============================================================
   STARTSEITE "ÜBERSICHT" (Start: node tests/uebersicht.js)
   Prüft ohne Browser (kleine Attrappe für document/window):
     1  index.html: alle Felder der Startseite in der vereinbarten Reihenfolge, Kugel (#recordBtn, #jarvisSphere), Mikro-Knopf, Tonbalken; kein Rest vom 3D-Kopf
     2  js/uebersicht.js ist genau einmal eingehängt, und die gelöschten Kopf-Dateien (avatar3d, kopf, mimik, holo_look, ansicht, models/*.glb) sind weg und nirgends mehr eingebunden
     3  Die Felder werden aus Lagebild, Kalender, Erinnerungen, Einkauf, Schicht und Wetter gefüllt (Zahlen, Texte, Reihenfolge der Termine, Fahrzeit)
     4  Ohne Daten (Lagebild fehlt/Fehler) bleiben die Felder lesbar, es gibt keinen Absturz
     5  Es werden nur zwischengespeicherte Daten verlangt (jvLage.daten mit 10 Minuten), kein eigener Netz-Timer
   Es werden keine Dateien verändert.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function check(n, c, extra) { if (c) ok++; else { fehler++; console.log('FEHLER: ' + n + (extra !== undefined ? '  -> ' + JSON.stringify(extra).slice(0, 300) : '')); } }
const idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
const code = fs.readFileSync(path.join(ROOT, 'js/uebersicht.js'), 'utf8');

/* 1 Markup */
const FELDER = ['uebArbeit', 'uebRegen', 'uebDiesel', 'uebSchicht', 'uebTermine', 'uebErinnerung', 'uebEinkauf', 'uebWetter'];
const pos = FELDER.map(f => idx.indexOf('id="' + f + '"'));
check('alle 8 Felder vorhanden', pos.every(p => p > 0), pos);
check('Felder in der vereinbarten Reihenfolge (Arbeitsweg, Regen, Diesel, Schicht, Termine, Erinnerungen, Einkauf, Wetter morgen)', pos.every((p, i) => i === 0 || p > pos[i - 1]));
for (const id of ['recordBtn', 'jarvisSphere', 'uebMic', 'uebEq', 'uebGruss', 'uebUhr', 'uebHinweis', 'hudSubtitleBox']) check('Element vorhanden: #' + id, idx.indexOf('id="' + id + '"') > 0);
check('Kugel liegt vor den Feldern (oben links)', idx.indexOf('id="jarvisSphere"') < idx.indexOf('id="uebArbeit"'));
check('Hinweis "HEY JARVIS ODER TIPPEN" steht unter dem Mikro-Knopf', idx.indexOf('id="uebMic"') < idx.indexOf('ODER TIPPEN'));
check('Kein Rest vom Kopf in index.html (kopfRow, jvAvatar, 3D-Kopf)', !/kopfRow|jvAvatar3D|avatar3d|3D-Kopf/i.test(idx));

/* 2 Dateien */
const tags = idx.match(/<script src="\.\/js\/uebersicht\.js(\?v=[0-9a-f]+)?"><\/script>/g) || [];
check('uebersicht.js genau einmal eingehängt', tags.length === 1, tags);
for (const f of ['js/avatar3d.js', 'js/kopf.js', 'js/mimik.js', 'js/holo_look.js', 'js/ansicht.js', 'models/mann.glb', 'models/zubehoer.glb']) {
    check('gelöscht: ' + f, !fs.existsSync(path.join(ROOT, f)));
    check('nicht mehr eingebunden: ' + f, idx.indexOf(f) < 0 && !/\.glb/.test(idx));
}

/* 3/4/5 Verhalten */
function welt(opt) {
    const el = {}; const intervalle = [];
    const mk = id => el[id] || (el[id] = { id, textContent: '', innerHTML: '', className: '', style: {}, children: [], classList: { contains: () => false, add() {}, remove() {} }, addEventListener() {}, appendChild(c) { this.children.push(c); } });
    const doc = { hidden: false, readyState: 'complete', body: { classList: { contains: () => false } }, getElementById: mk, createElement: () => ({ style: {} }), addEventListener() {} };
    const jetzt = Date.now(), in1 = h => new Date(jetzt + h * 3600000).toISOString();
    const calls = { daten: [], wetter: 0 };
    const sb = { document: doc, console, Date, Math, Intl, Promise, Number, String, JSON, Array, Object, isFinite, isNaN, parseInt,
        setTimeout: fn => { sb.__spaeter = fn; return 1; }, setInterval: (fn, ms) => { intervalle.push(ms); return 2; }, requestAnimationFrame() {},
        calendarEntries: opt.kalender || [], reminderEntries: opt.erinnerungen || [], shoppingEntries: opt.einkauf || [],
        parseEventDate: iso => /^\d{4}-\d{2}-\d{2}$/.test(iso) ? { date: new Date(iso + 'T00:00:00'), allDay: true } : { date: new Date(iso), allDay: false },
        isBirthdayEntry: e => /geburtstag/i.test(e.text || ''), relativeDayLabel: () => 'heute',
        fetchWeatherForecast: () => { calls.wetter++; return Promise.resolve(opt.wetter || { fehler: 'x' }); } };
    sb.window = sb; sb.window.jvSchichtHeute = () => opt.schicht || null;
    sb.window.jvPlan = { abfahrtMin: sh => sh === 'frueh' ? 270 : 780 };
    sb.window.jvLage = { daten: ms => { calls.daten.push(ms); return Promise.resolve(opt.lage || null); }, regenInfo: l => l.regenX || null, open() {} };
    vm.createContext(sb); vm.runInContext(code, sb);
    return { sb, el, intervalle, calls, jetzt, in1 };
}
const aus = e => (e.innerHTML || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

const w = welt({});
const tIn = h => new Date(w.jetzt + h * 3600000).toISOString();
const W = welt({
    kalender: [{ text: 'Elternabend', isoDate: tIn(75) }, { text: 'Zahnarzt', isoDate: tIn(26) }, { text: 'Finja abholen', isoDate: tIn(50) }, { text: 'Oma Geburtstag', isoDate: tIn(30) }, { text: 'Kino', isoDate: tIn(100) }, { text: 'Alt', isoDate: tIn(-48) }],
    erinnerungen: [{ time: tIn(3) }, { time: tIn(8) }, { time: tIn(-1) }, { time: tIn(5), triggered: true }],
    einkauf: [{ text: 'Milch' }, { text: 'Brot' }, { text: 'Penny' }, { text: 'Eier' }],
    schicht: 'Spätschicht',
    lage: { hatArbeit: true, arbeit: { min: 24, meldungen: [] }, tank: [{ preis: 1.589, name: 'Aral', km: 2.1 }], regen: [], termin: { name: 'Zahnarzt', min: 15 }, regenX: { gross: 'Regen ab 21:30 Uhr', text: 'In etwa 90 Minuten, bei dir', ok: false } },
    wetter: { tage: [{ tag: 'heute' }, { tag: 'morgen', wetter: 'leicht bewölkt', tiefstwert_grad: 6, hoechstwert_grad: 13, niederschlag_mm: 0 }] }
});
W.sb.window.jvUebersicht.lokal();
const t = aus(W.el.uebTermine);
check('Termine: genau 4 Zeilen (Zahnarzt, Finja, Elternabend, Kino)', (W.el.uebTermine.innerHTML.match(/class="ueb-zeile"/g) || []).length === 4 && /Kino/.test(t), t);
check('Termine: nach Zeit sortiert (Zahnarzt vor Finja vor Elternabend)', t.indexOf('Zahnarzt') >= 0 && t.indexOf('Zahnarzt') < t.indexOf('Finja') && t.indexOf('Finja') < t.indexOf('Elternabend'), t);
check('Termine: keine Geburtstage, nichts Vergangenes', !/Oma|Alt/.test(t), t);
check('Erinnerungen: nur offene, zukünftige (2)', /^2\b/.test(aus(W.el.uebErinnerung)), aus(W.el.uebErinnerung));
check('Einkauf: 4 Dinge mit den ersten Namen', /^4 Dinge Milch, Brot, Penny/.test(aus(W.el.uebEinkauf)), aus(W.el.uebEinkauf));
check('Schicht: Spät mit Abfahrt 13:00', /Spät/.test(aus(W.el.uebSchicht)) && /13:00/.test(aus(W.el.uebSchicht)), aus(W.el.uebSchicht));
check('Gruß, Uhr und Schicht-Zeile gesetzt', W.el.uebGruss.textContent.length > 3 && /^\d\d:\d\d$/.test(W.el.uebUhr.textContent) && /Spätschicht/.test(W.el.uebSchichtZeile.textContent));
W.sb.window.jvUebersicht.auffrischen();
setImmediate(() => setImmediate(() => {
    const A = aus(W.el.uebArbeit), R = aus(W.el.uebRegen), D = aus(W.el.uebDiesel), T = aus(W.el.uebTermine), WE = aus(W.el.uebWetter);
    check('Arbeitsweg: 24 min und "frei"', /^24 min/.test(A) && /frei/.test(A), A);
    check('Regen: Uhrzeit groß, Hinweis in 90 min', /21:30 Uhr/.test(R) && /90 min/.test(R), R);
    check('Diesel: 1,589 € und Tankstelle', /1,589/.test(D) && /Aral/.test(D), D);
    check('Termin mit Fahrzeit (15 min)', /Zahnarzt .*Fahrzeit 15 min/.test(T), T);
    check('Wetter morgen: Tief 6, Hoch 13°, bewölkt', /6 \/ 13°/.test(WE) && /bewölkt/i.test(WE), WE);
    check('Lagebild wird nur zwischengespeichert verlangt (10 Minuten)', W.calls.daten.length >= 1 && W.calls.daten.every(ms => ms === 600000), W.calls.daten);
    check('Keine Netz-Timer: nur zwei lokale Takte (20 s, 250 ms)', JSON.stringify(W.intervalle) === JSON.stringify([20000, 250]), W.intervalle);

    /* 4 ohne Daten */
    const L = welt({ lage: { fehler: 'Standort nicht verfügbar' } });
    L.sb.window.jvUebersicht.auffrischen();
    setImmediate(() => setImmediate(() => {
        check('Ohne Standort: Arbeitsweg zeigt den Grund statt abzustürzen', /Standort nicht verfügbar|lädt/.test(aus(L.el.uebArbeit)), aus(L.el.uebArbeit));
        check('Ohne Termine: freundlicher Text', /Keine Termine/.test(aus(L.el.uebTermine)), aus(L.el.uebTermine));
        check('Ohne Schichtplan: "Frei"', /Frei/.test(aus(L.el.uebSchicht)), aus(L.el.uebSchicht));
        check('Leere Listen: Erinnerungen 0, Einkauf leer', /^0\b/.test(aus(L.el.uebErinnerung)) && /Liste ist leer/.test(aus(L.el.uebEinkauf)));
        console.log((fehler ? 'FEHLGESCHLAGEN' : 'OK') + ': ' + ok + ' Prüfungen bestanden, ' + fehler + ' Fehler');
        process.exit(fehler ? 1 : 0);
    }));
}));
