/* ============================================================
   Auswertung des Chromium-Messstands (tests/hintergrund_laufzeit.json, erzeugt von tests/hintergrund_messen.js). Rein rechnend, keine Browser-Abhängigkeit.
   Liefert die vergleichbaren Kennzahlen (Kategorien statt Roh-Zähler, weil echte Uhr schwankt) und die Tabellen für die Doku.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path');
const DATEI = path.join(__dirname, 'hintergrund_laufzeit.json');

function laden() { return fs.existsSync(DATEI) ? JSON.parse(fs.readFileSync(DATEI, 'utf8')) : null; }
function summiere(l, phasen) {   // Stellen über mehrere Phasen zusammenfassen
    const r = {};
    for (const ph of phasen) { const p = l.phasen[ph]; if (!p) continue; for (const [s, v] of Object.entries(p.sites)) { const x = r[s] || (r[s] = { k: v.k, ms: {}, c: 0, f: 0, x: 0, ausCb: 0 }); x.c += v.c; x.f += v.f; x.x += v.x; x.ausCb += v.ausCb; Object.assign(x.ms, v.ms); } }
    return r;
}
function netzSumme(p) { return p ? Object.values(p.net).reduce((a, b) => a + b.n, 0) : 0; }
function proMinute(f, fensterMs) { return Math.round(f * 60000 / fensterMs); }
const stufe = n => n >= 100 ? 'hoch (ab 100/min)' : n >= 10 ? 'mittel (10–99/min)' : n >= 1 ? 'gering (1–9/min)' : 'keine';

function auswerten(o) {
    const w = o.fensterMs, L = o.lauf, out = {};
    const vis = L.sichtbar, ver = L.versteckt;
    // Alle bis zum Ende des Starts angelegten setInterval-Stellen (Laden + erste 10 s)
    const start = summiere(vis, ['laden', 'start']), msAlle = {};
    for (const l of Object.values(L)) for (const p of Object.values(l.phasen)) for (const [s, v] of Object.entries(p.sites)) { msAlle[s] = Object.assign(msAlle[s] || {}, v.ms); }
    const takt = s => { const m = Object.keys(msAlle[s] || {}); return m.length ? m.join('/') : '?'; };
    out.startIntervalle = Object.entries(start).filter(([, v]) => v.k === 'iv' && v.c > 0).map(([s]) => s + ' @' + takt(s)).sort();
    out.startAktivIntervalle = Object.values(vis.aktiv.start.iv).reduce((a, b) => a + b, 0);
    out.idleAktivIntervalle = Object.values(vis.aktiv.idle.iv).reduce((a, b) => a + b, 0);
    out.idleAktivRaf = Object.keys(vis.aktiv.idle.raf).sort();
    // Leerlauf sichtbar: Rückrufe pro Minute je Datei (nur dauerhaft wiederkehrende Intervalle/rAF; Einmal-Timeouts und Bursts getrennt)
    const idle = summiere(vis, ['idle']), dateien = {}, burst = {};
    for (const [s, v] of Object.entries(idle)) {
        const d = s.replace(/:.*/, '');
        if (v.k === 'iv' || v.k === 'raf') dateien[d] = (dateien[d] || 0) + proMinute(v.f, w.idle);
        else if (v.f >= 20) burst[s] = proMinute(v.f, w.idle);
    }
    out.idleProMinuteStufe = Object.fromEntries(Object.entries(dateien).filter(([, n]) => n >= 1).sort().map(([d, n]) => [d, stufe(n)]));
    out.idleProMinuteZahl = dateien;
    out.idleBurstTimeouts = burst;
    // sichtbar vs versteckt (Lauf "versteckt": idle sichtbar -> idle_versteckt)
    const a = summiere(ver, ['idle']), b = summiere(ver, ['idle_versteckt']), vh = {};
    for (const s of new Set([...Object.keys(a), ...Object.keys(b)])) {
        const k = (a[s] || b[s]).k, fa = (a[s] || { f: 0 }).f, fb = (b[s] || { f: 0 }).f;
        if (k === 'to' || fa + fb < 3) continue;
        const ms = Math.min(...Object.keys(msAlle[s] || { 99999999: 1 }).map(Number).filter(x => x > 0).concat([99999999])), erwartet = k === 'iv' && ms < 99999999 ? w.idle / ms : null;
        let verhalten;
        if (k === 'iv' && erwartet < 8) verhalten = 'seltener Takt (Fenster zu kurz für den Vergleich)';
        else if (k === 'iv' && fa < 0.5 * erwartet) verhalten = 'kurzlebig/ereignisgesteuert (kein Dauertakt)';
        else if (k === 'raf' && fa < 30) verhalten = 'kurzlebig/ereignisgesteuert (kein Dauertakt)';
        else verhalten = fb <= 0.1 * fa ? 'pausiert' : fb >= 0.8 * fa ? 'läuft unverändert weiter' : 'läuft weniger';
        vh[s] = { k, sichtbar: fa, versteckt: fb, verhalten };
    }
    out.versteckt = vh;
    out.verstecktPausiert = Object.keys(vh).filter(s => vh[s].verhalten === 'pausiert').sort();
    out.verstecktWeiter = Object.keys(vh).filter(s => vh[s].verhalten === 'läuft unverändert weiter').sort();
    out.netzSichtbarIdle = netzSumme(ver.phasen.idle); out.netzVerstecktIdle = netzSumme(ver.phasen.idle_versteckt);
    const cbSumme = p => Object.values(p.sites).reduce((x, y) => x + y.f, 0);
    out.callbacksSichtbarIdle = cbSumme(ver.phasen.idle); out.callbacksVerstecktIdle = cbSumme(ver.phasen.idle_versteckt);
    out.domSichtbarIdle = ver.phasen.idle.dom + ver.phasen.idle.domAttr; out.domVerstecktIdle = ver.phasen.idle_versteckt.dom + ver.phasen.idle_versteckt.domAttr;
    out.speicherSichtbarIdle = ver.phasen.idle.store; out.speicherVerstecktIdle = ver.phasen.idle_versteckt.store;
    // Doppelstart-Probe
    const ds = vis.phasen.doppelstart_6x, dv = vis.aktiv.doppelstart_vorher.iv, dn = vis.aktiv.doppelstart_6x.iv;
    out.doppelstartNeueIntervalle = Object.entries(ds.sites).filter(([, v]) => v.k === 'iv' && v.c > 0).map(([s]) => s).sort();
    out.doppelstartAktivGeaendert = Object.keys(Object.assign({}, dv, dn)).filter(k => (dv[k] || 0) !== (dn[k] || 0)).sort();
    // Mehrfach gestartete Intervall-Stellen über den ganzen Lauf
    const mehr = {}; for (const [n, l] of Object.entries(L)) { const c = summiere(l, Object.keys(l.phasen)); mehr[n] = Object.entries(c).filter(([, v]) => v.k === 'iv' && v.c > 1).map(([s, v]) => s + ' x' + v.c).sort(); }
    out.mehrfachGestartet = mehr;
    // Netz im Leerlauf nach Quelle (sichtbar)
    out.idleNetz = Object.fromEntries(Object.entries(vis.phasen.idle.net).map(([k, v]) => [k, { n: v.n, von: v.von }]));
    // Native (APK-Attrappe)
    const nat = L.nativ.phasen.idle.nativ; out.nativIdle = nat; out.nativStart = L.nativ.phasen.start.nativ;
    const aufrufeNat = Object.entries(nat).sort((x, y) => y[1] - x[1])[0]; out.nativPollQuelle = aufrufeNat ? aufrufeNat[0] : null; out.nativPollProMinute = aufrufeNat ? proMinute(aufrufeNat[1], w.idle) : 0;
    // Szenarien: Netzaufrufe und neue Timer je Szenario
    out.szenarien = {};
    for (const n of ['sprache', 'erinnerungen', 'termine_heute', 'dashboard_wetter', 'ki_anfrage', 'panel_wechsel']) { const p = vis.phasen[n]; if (!p) continue; out.szenarien[n] = { netz: netzSumme(p), neueIntervalle: Object.entries(p.sites).filter(([, v]) => v.k === 'iv' && v.c > 0).length, sprache: p.sprache, audio: p.audio, benachrichtigung: p.benachr }; }
    out.benachrichtigungenGesamt = Object.values(L).reduce((n, l) => n + Object.values(l.phasen).reduce((m, p) => m + p.benachr, 0), 0);
    out.externeZiele = Object.keys(vis.extern).sort();
    return out;
}
module.exports = { laden, auswerten, summiere, proMinute, stufe, DATEI };
