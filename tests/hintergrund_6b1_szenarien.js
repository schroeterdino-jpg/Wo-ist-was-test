/* ============================================================
   Phase 6B.1: Szenarien je Kandidat in der Prüfwelt (tests/hintergrund_6b1_welt.js). Liefert Beobachtungen als einfache Zahlen/Texte.
   Dieselben Szenarien laufen VOR der Änderung (eingefroren in tests/hintergrund_6b1_vorher.json = alter IST-Zustand) und danach (Suite).
   Kandidaten: mimik.js, holo_look.js, anzeige.js (zwei Takte).
   NICHT dabei: laune.js (14-s-Gesichtstakt). faceTick ruft ensure() auf, das bei abgelaufener Laune eine neue Stimmung würfelt UND speichert
   (roll → setMood → save). Das ist mehr als Darstellung und wurde aus dem Umfang genommen (Auftrag 6B.1 Punkt 10).
   ============================================================ */
'use strict';
const { lade } = require('./hintergrund_6b1_welt.js');

const KANDIDATEN = {
    mimik: {
        datei: 'mimik.js', sichtbarMs: 10000, opt: {},
        vorbereiten(w) { w.kopf = w.sb.jvAvatar3D; w.kopf.state = 'listening'; },
        zustand(w) { const p = w.sb.jvAvatar3D.protokoll; return { grimassen: p.filter(x => x !== 'grimasse:null').length, geloescht: p.filter(x => x === 'grimasse:null').length }; },
        aendere(w) { w.sb.jvAvatar3D.state = 'thinking'; }
    },
    holo_look: {
        datei: 'holo_look.js', sichtbarMs: 10000, opt: { mitHolo: true },
        vorbereiten() { },
        zustand(w) { return { klassen: [...w.body._cls].sort().join(' ') }; },
        aendere(w) { w.sb.jvAvatar3D.active = false; }
    },
    anzeige: {
        datei: 'anzeige.js', sichtbarMs: 10000, opt: { breite: 1000, hoehe: 600 },
        vorbereiten(w) { w.sb.__auto = false; w.sb.__fenster = false; w.sb.jvAutoansicht = { offen: () => w.sb.__auto }; w.sb.isPanelOpen = () => w.sb.__fenster; },
        zustand(w) { const kn = w.doc.body.children.find(c => c.id === 'anzeigeZu'); return { zoom: String(w.html.style.zoom || ''), breit: w.html._cls.has('jv-breit'), knopf: kn ? kn.style.display : '?' }; },
        aendere(w) { w.sb.__auto = true; w.sb.__fenster = true; }
    }
};
/* anzeige.js liest den gespeicherten Zoom beim Laden: 80 % vorgeben, damit der Zoom beim Öffnen der Autoansicht sichtbar wird */
function frischeWelt(K) { return lade(K.datei, K.datei === 'anzeige.js' ? Object.assign({}, K.opt, { speicher: { jv_anzeige_zoom: '80' } }) : K.opt); }

function ablauf(name, quelle) {
    const K = KANDIDATEN[name];
    const w = quelle == null ? frischeWelt(K) : lade(K.datei, Object.assign({}, K.opt, K.datei === 'anzeige.js' ? { speicher: { jv_anzeige_zoom: '80' } } : {}, { quelle }));
    const r = {};
    if (w.ladeFehler) return { ladeFehler: String(w.ladeFehler.message) };
    K.vorbereiten(w);
    const d = () => w.z.intervalAufrufe;
    r.start = { aktiv: w.aktiveIntervalle(), ms: w.aktiveIntervallMs(), hoererVisibility: w.hoererAnzahl('visibilitychange') };
    let a = d(); w.tick(K.sichtbarMs);
    r.sichtbar = { ms: K.sichtbarMs, aufrufe: d() - a, zustand: K.zustand(w), aktivNachher: w.aktiveIntervallMs() };
    // hidden 5 s, dann zurück
    let sp = w.z.speicherSchreiben, nz = w.z.netz; w.verstecke(true); a = d(); w.tick(5000);
    r.hidden5 = { aufrufe: d() - a, aktiv: w.aktiveIntervalle(), zustand: K.zustand(w), speicherSchreiben: w.z.speicherSchreiben - sp, netz: w.z.netz - nz };
    w.verstecke(false); r.rueck5Sofort = K.zustand(w); a = d(); w.tick(5000);
    r.rueck5Danach = { aufrufe: d() - a, aktiv: w.aktiveIntervalle(), zustand: K.zustand(w) };
    // hidden 30 s mit Zustandsänderung, dann zurück
    sp = w.z.speicherSchreiben; nz = w.z.netz; w.verstecke(true); K.aendere(w); a = d(); w.tick(30000);
    r.hidden30 = { aufrufe: d() - a, aktiv: w.aktiveIntervalle(), zustand: K.zustand(w), speicherSchreiben: w.z.speicherSchreiben - sp, netz: w.z.netz - nz };
    w.verstecke(false); r.rueck30Sofort = K.zustand(w); a = d(); w.tick(5000);
    r.rueck30Danach = { aufrufe: d() - a, aktiv: w.aktiveIntervalle(), zustand: K.zustand(w) };
    // 10 schnelle Wechsel (je 100 ms)
    const vorher = w.z.setInterval; a = d();
    for (let i = 0; i < 10; i++) { w.verstecke(true); w.tick(100); w.verstecke(false); w.tick(100); }
    r.wechsel10 = { aktiv: w.aktiveIntervalle(), ms: w.aktiveIntervallMs(), neueIntervalle: w.z.setInterval - vorher, fehler: w.z.fehler.length, zustand: K.zustand(w) };
    r.fehler = w.z.fehler.slice();
    r.speicherSchreiben = w.z.speicherSchreiben; r.netz = w.z.netz;
    return r;
}
function messeAlle() { const o = {}; for (const n of Object.keys(KANDIDATEN)) o[n] = ablauf(n); return o; }
module.exports = { KANDIDATEN, ablauf, messeAlle, frischeWelt };
