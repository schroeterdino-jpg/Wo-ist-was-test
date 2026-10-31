/* ============================================================
   STARTSEITE "ÜBERSICHT" (Start: node tests/uebersicht.js)
   Prüft ohne Browser (kleine Attrappe für document/window):
     1  index.html: alle Felder der Startseite in der vereinbarten Reihenfolge, Kugel (#recordBtn, #jarvisSphere), Tonbalken (kein eigener Mikro-Knopf, Tippen auf die Kugel startet das Sprechen); kein Rest vom 3D-Kopf
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

/* 5b Tipp auf das Regen-Feld öffnet die Wetterkarte (Regen-Ebene, still), nicht das Lagebild */
{
    const ue = fs.readFileSync(path.join(ROOT, 'js/uebersicht.js'), 'utf8'), wm = fs.readFileSync(path.join(ROOT, 'js/weathermap.js'), 'utf8');
    check('Regen-Feld: Tipp öffnet die Wetterkarte mit Regen-Ebene (Rückfall: Lagebild)', /tippe\('uebRegen', \(\) => \{ if \(window\.jvWetterkarte\) window\.jvWetterkarte\.oeffnen\('rain'\)/.test(ue));
    check('Wetterkarte: jvWetterkarte.oeffnen startet still (kein Vorlesen) und mit gewählter Ebene', /window\.jvWetterkarte = \{ oeffnen: function \(ebene\)[^}]*still: true/.test(wm) && /if \(!req\.still\) say\(wxSummary/.test(wm) && /wxLayerNow = WX_LAYERS\.some\(l => l\[0\] === ebene\) \? ebene : 'temp'/.test(wm));
    check('Diesel-Feld öffnet weiter nur die Diesel-Ansicht', /tippe\('uebDiesel'.*open\(false, 'diesel'\)/.test(ue));
}

/* 5c Eingabeleiste: getippter Satz geht denselben Weg wie ein gesprochener */
{
    const ue = fs.readFileSync(path.join(ROOT, 'js/uebersicht.js'), 'utf8'), vo = fs.readFileSync(path.join(ROOT, 'js/voice.js'), 'utf8');
    check('Eingabeleiste: voice.js gibt window.jvTippen = handleRecognizedText frei', /window\.jvTippen = handleRecognizedText;/.test(vo));
    check('Eingabeleiste: Senden ruft jvTippen mit dem getippten Satz (Rückfall sendToGroqSmart), leerer Satz sendet nichts', /window\.jvTippen\(t\)/.test(ue) && /if \(!t\) \{ zu\(\); return; \}/.test(ue) && /sendToGroqSmart\(t\)/.test(ue));
    check('Eingabeleiste: Enter sendet, Symbol klappt die Leiste auf und zu', /e\.key === 'Enter'/.test(ue) && /bar\.hidden = false/.test(ue));
}

/* 5d Tagesüberblick offen: isPanelOpen() ist wahr, currentPanel aber null - refreshOpenPanel darf dann nicht abstürzen */
{
    const pa = fs.readFileSync(path.join(ROOT, 'js/panels.js'), 'utf8');
    check('panels.js: keine ungeschützten currentPanel.name-Zugriffe nach isPanelOpen()', !/!isPanelOpen\(\) \|\| currentPanel\.name/.test(pa) && /if \(!currentPanel \|\| !isPanelOpen\(\) \|\| !\['termine', 'erinnerungen'\]/.test(pa));
}

/* 6 Startseite anpassen (js/startseite_anpassen.js): Felder ein-/ausschalten und verschieben, nur lokal, Standard unverändert */
{
    const anp = fs.readFileSync(path.join(ROOT, 'js/startseite_anpassen.js'), 'utf8'), idx = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8'), pan = fs.readFileSync(path.join(ROOT, 'js/panels.js'), 'utf8'), css = fs.readFileSync(path.join(ROOT, 'style.css'), 'utf8');
    check('Anpassen: Skript steht nach uebersicht.js in index.html (genau einmal)', (idx.match(/startseite_anpassen\.js/g) || []).length === 1 && idx.indexOf('startseite_anpassen.js') > idx.indexOf('js/uebersicht.js'));
    check('Anpassen: Menüeintrag im ☰-Menü und CSS für ausgeblendete Felder', /Startseite anpassen/.test(pan) && /\.ueb-karte\.ueb-aus\s*\{\s*display:\s*none/.test(css));
    check('Anpassen: kein Netz, kein Timer', !/fetch\(|apiFetch|setInterval|setTimeout/.test(anp));
    const IDS = ['uebArbeit', 'uebRegen', 'uebDiesel', 'uebSchicht', 'uebTermine', 'uebErinnerung', 'uebEinkauf', 'uebWetter'];
    const els = {}; IDS.forEach(id => { els[id] = { style: {}, set: new Set(), classList: { toggle(c, on) { if (on) els[id].set.add(c); else els[id].set.delete(c); }, remove(c) { els[id].set.delete(c); } } }; });
    const store = {};
    const sb = { window: {}, document: { readyState: 'complete', getElementById: id => els[id] || null, body: { classList: { add() {}, remove() {} } } }, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } }, console };
    vm.runInNewContext(anp, sb);
    const A = sb.window.jvStartAnpassen;
    check('Anpassen: Standard = Reihenfolge der Seite, nichts ausgeblendet', IDS.every((id, i) => els[id].style.order === String(i) && !els[id].set.has('ueb-aus')));
    store.jv_ueb_felder = JSON.stringify({ reihenfolge: ['uebSchicht', 'uebDiesel', 'gibtsnicht', 'uebSchicht'], aus: ['uebDiesel', 'unbekannt'] });
    A.anwenden();
    check('Anpassen: Reihenfolge übernommen, fehlende Felder hinten, Unbekanntes und Doppeltes ignoriert', els.uebSchicht.style.order === '0' && els.uebDiesel.style.order === '1' && els.uebArbeit.style.order === '2' && els.uebWetter.style.order === '7', IDS.map(id => els[id].style.order));
    check('Anpassen: nur das gewählte Feld ist ausgeblendet', els.uebDiesel.set.has('ueb-aus') && IDS.filter(id => els[id].set.has('ueb-aus')).length === 1);
    store.jv_ueb_felder = '{kaputt';
    A.anwenden();
    check('Anpassen: kaputte Einstellung ergibt wieder den Standard (kein Absturz)', IDS.every((id, i) => els[id].style.order === String(i) && !els[id].set.has('ueb-aus')));
    store.jv_ueb_felder = JSON.stringify({ reihenfolge: IDS.slice().reverse(), aus: ['uebRegen'] });
    A.anwenden(); A.zuruecksetzen();
    check('Anpassen: Zurücksetzen stellt alles wie vorher (keine Reihenfolge, nichts ausgeblendet)', IDS.every(id => els[id].style.order === '' && !els[id].set.has('ueb-aus')) && store.jv_ueb_felder === '{}');
}
for (const id of ['recordBtn', 'jarvisSphere', 'uebEq', 'uebGruss', 'uebUhr', 'uebHinweis', 'hudSubtitleBox']) check('Element vorhanden: #' + id, idx.indexOf('id="' + id + '"') > 0);
check('Kugel liegt vor den Feldern (oben links)', idx.indexOf('id="jarvisSphere"') < idx.indexOf('id="uebArbeit"'));
check('Kein eigener Mikro-Knopf mehr: Tippen auf die Kugel startet das Sprechen, Hinweis steht in der Kopfzeile', idx.indexOf('id="uebMic"') < 0 && /id="recordBtn" onclick="toggleSpeechRecognition\(\)"/.test(idx) && idx.indexOf('id="uebHinweis"') > idx.indexOf('id="uebGruss"') && idx.indexOf('id="uebHinweis"') < idx.indexOf('id="uebArbeit"'));
check('Kein Rest vom Kopf in index.html (kopfRow, jvAvatar, 3D-Kopf)', !/kopfRow|jvAvatar3D|avatar3d|3D-Kopf/i.test(idx));

/* 2 Dateien */
const tags = idx.match(/<script src="\.\/js\/uebersicht\.js(\?v=[0-9a-f]+)?"><\/script>/g) || [];
check('uebersicht.js genau einmal eingehängt', tags.length === 1, tags);
for (const f of ['js/avatar3d.js', 'js/kopf.js', 'js/mimik.js', 'js/holo_look.js', 'js/ansicht.js', 'models/mann.glb', 'models/zubehoer.glb']) {
    check('gelöscht: ' + f, !fs.existsSync(path.join(ROOT, f)));
    check('nicht mehr eingebunden: ' + f, idx.indexOf(f) < 0 && !/\.glb/.test(idx));
}

/* 2b Regen-Animation: nur das Wetter JETZT (nicht die Vorhersage der nächsten 3 Stunden) */
const fx = fs.readFileSync(path.join(ROOT, 'js/wetterfx.js'), 'utf8'), br = fs.readFileSync(path.join(ROOT, 'js/briefing.js'), 'utf8');
check('briefing.js liefert das aktuelle Wetter als eigenen Wert (aktuellerCode = data.current.weather_code)', /aktuellerCode:\s*data\.current\.weather_code/.test(br));
check('wetterfx.js nimmt für die Animation aktuellerCode, nicht den Vorhersage-Code', /artAusCode\(d\.aktuellerCode !== undefined \? d\.aktuellerCode : d\.wettercode/.test(fx) && !/artAusCode\(d\.wettercode/.test(fx));

/* 3/4/5 Verhalten */
function welt(opt) {
    const el = {}; const intervalle = [];
    const mk = id => el[id] || (el[id] = { id, textContent: '', innerHTML: '', className: '', style: {}, children: [], classList: { contains: () => false, add() {}, remove() {}, toggle() {} }, addEventListener() {}, appendChild(c) { this.children.push(c); } });
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
function await_(fn) { setImmediate(() => setImmediate(fn)); }
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
    const H = welt({ lage: { hatArbeit: true, arbeit: { min: 0, meldungen: [] }, heimweg: { min: 31, meldungen: [{ title: 'Stau' }] }, tank: [], regen: [], termin: null } });
    H.sb.window.jvUebersicht.auffrischen();
    await_(() => {
        const HA = aus(H.el.uebArbeit);
        check('Bei der Arbeit (0 min): Heimweg 31 min mit Meldung statt "0 min"', /^31 min/.test(HA) && /1 Meldung/.test(HA), HA);
    });
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
