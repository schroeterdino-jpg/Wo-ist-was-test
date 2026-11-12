/* ============================================================
   TEST: Roboter-Avatar (js/avatar_roboter.js): Mund folgt dem Sprechen, schließt bei Stille/Unterbrechung,
   Rückfall auf die Kugel bei fehlendem Bild oder Merker, keine eigene Schleife. Start: node tests/avatar_roboter.js
   ============================================================ */
'use strict';
const fs = require('fs'), vm = require('vm'), path = require('path');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const quelle = fs.readFileSync(path.join(__dirname, '..', 'js', 'avatar_roboter.js'), 'utf8');
check('keine eigene Animationsschleife', !/requestAnimationFrame|setInterval/.test(quelle.replace(/\/\*[\s\S]*?\*\//g, '')));

function welt(opt) {
    const zeichnet = { bilder: 0, alphas: [] };
    const ctx = new Proxy({ globalAlpha: 1 }, { get(t, k) { if (k in t) return t[k]; if (k === 'drawImage') return () => { zeichnet.bilder++; zeichnet.alphas.push(t.globalAlpha); }; if (k === 'createRadialGradient') return () => ({ addColorStop() { } }); return () => { }; }, set(t, k, v) { t[k] = v; return true; } });
    const kugel = { style: {} }, kopfKlassen = new Set(), canvas = { style: {}, setAttribute() { } };
    canvas.getContext = () => ctx;
    const holo = { appendChild() { } };
    const doc = { readyState: 'complete', addEventListener() { }, createElement: () => canvas, getElementById: id => id === 'jarvisSphere' ? kugel : id === 'uebKopf' ? { classList: { add: c => kopfKlassen.add(c), remove: c => kopfKlassen.delete(c) } } : null, querySelector: () => holo };
    const w = { localStorage: { getItem: () => opt.merker || null }, document: doc };
    function Image() { const s = this; Object.defineProperty(s, 'src', { set(v) { setTimeout(() => (opt.fehlt && v.indexOf(opt.fehlt) >= 0 ? s.onerror() : s.onload()), 0); } }); }
    const sb = { window: w, document: doc, Image, setTimeout, console, Math };
    w.window = w; vm.createContext(sb); vm.runInContext(quelle, sb);
    return { w, kugel, kopfKlassen, zeichnet };
}
const warte = () => new Promise(r => setTimeout(r, 20));
(async () => {
    let W = welt({}); await warte();
    const R = W.w.jvRoboter;
    check('Roboter wird aktiv, Kugel versteckt', R.aktiv === true && W.kugel.style.display === 'none' && W.kopfKlassen.has('ueb-roboter'));
    check('Mund: Stille = zu, laut = offen', R._oeffnung('idle', 0.5, 1) === 0 && R._oeffnung('speaking', 0.01, 1) === 0 && R._oeffnung('speaking', 0.5, 1) === 1);
    for (let i = 0; i < 20; i++) R.frame('speaking', 0.5, i);
    check('Beim Sprechen öffnet sich der Mund', R._st.a1 > 0.9 && R._st.a2 > 0.9, JSON.stringify([R._st.a1, R._st.a2]));
    R.frame('idle', 0, 21);
    check('Nach dem Sprechen/Unterbrechen sofort zu', R._st.a1 === 0 && R._st.a2 === 0, JSON.stringify([R._st.a1, R._st.a2]));
    let n = 0; for (let i = 0; i < 60; i++) { const v = W.zeichnet.bilder; R.frame('idle', 0, i); if (W.zeichnet.bilder > v) n++; }
    check('Ruhe zeichnet nur selten (gedrosselt)', n <= 24 && n >= 1, String(n));
    let fehlerGeworfen = false; try { R.frame('speaking', undefined, 5); R.frame('speaking', null, 6); } catch (e) { fehlerGeworfen = true; }
    check('Ohne Pegel kein Fehler (Sprechmuster)', !fehlerGeworfen);
    R.aktiv = false;
    check('Ausschalten zeigt die Kugel wieder', W.kugel.style.display === '' && !W.kopfKlassen.has('ueb-roboter'));
    W = welt({ fehlt: 'mund2' }); await warte();
    check('Fehlendes Bild: Kugel bleibt', W.w.jvRoboter.aktiv === false && W.kugel.style.display !== 'none');
    W = welt({ merker: 'kugel' }); await warte();
    check('Merker jv_avatar=kugel erzwingt die Kugel', W.w.jvRoboter.aktiv === false && W.kugel.style.display !== 'none');
    for (const f of ['models/roboter.webp', 'models/mund1.webp', 'models/mund2.webp']) check('Bild vorhanden: ' + f, fs.existsSync(path.join(__dirname, '..', f)));
    const sp = fs.readFileSync(path.join(__dirname, '..', 'js', 'sphere.js'), 'utf8');
    check('sphere.js ruft den Roboter auf und fällt bei Fehler zurück', /jvRoboter\.frame\(mode, liveLevel, time\)/.test(sp) && /jvRoboter\.aktiv = false/.test(sp));
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
