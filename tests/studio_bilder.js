/* ============================================================
   TESTS Jarvis Studio Phase 1: Bildverwaltung. Start: node tests/studio_bilder.js
   Läuft ohne Browser: Decodieren/Kodieren und IndexedDB sind durch Attrappen ersetzt (jvStudioBilder._setze); alles andere ist der echte Code
   (studio_dateien.js, studio_projekte.js, studio_bilder.js). Die Browser-Teile (echte IndexedDB, Canvas, Vorschau-Rahmen) prüft tools/studio_bilder_check.js.
   ============================================================ */
'use strict';
const fs = require('fs'), path = require('path'), vm = require('vm'), os = require('os'), cp = require('child_process');
const ROOT = path.join(__dirname, '..');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info !== undefined ? '  →  ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 300) : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');

function welt(roh) {
    const m = new Map(), ls = { getItem: k => m.has(k) ? m.get(k) : null, setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => { m.delete(k); } };
    const w = { localStorage: ls, console, TextEncoder, TextDecoder, Blob, Uint8Array, ArrayBuffer, Date, Math, JSON, Promise, Buffer, setTimeout, clearTimeout, btoa, atob, navigator: {} };
    w.window = w; w.document = undefined;
    const ctx = vm.createContext(w);
    ['js/studio_dateien.js', 'js/studio_bilder.js', 'js/studio_projekte.js'].forEach(f => vm.runInContext(lies(f), ctx, { filename: f }));
    const B = w.jvStudioBilder, D = w.jvStudioDateien, P = w.jvStudioProjekte;
    const db = new Map(), steuer = { w: 4000, h: 3000, quota: false, webp: true, dekodierFehler: false, kodiert: [] };
    if (!roh) B._setze({
        verfuegbar: () => true,
        dekodiere: async () => { if (steuer.dekodierFehler) throw new Error('kaputt'); return { w: steuer.w, h: steuer.h, quelle: {}, schliessen() { } }; },
        kodiere: async (bild, bw, bh, typ, q) => {
            steuer.kodiert.push({ bw, bh, typ, q });
            if (typ === 'image/webp' && !steuer.webp) typ = 'image/png';
            return new Blob([new Uint8Array(Math.round(bw * bh * (typ === 'image/png' ? 0.6 : q * 0.2)))], { type: typ });   // Größe sinkt mit Fläche und Qualität
        },
        speicher: {
            setze: async rec => { if (steuer.quota) { const e = new Error('voll'); e.name = 'QuotaExceededError'; throw e; } db.set(rec.id, rec); },
            hole: async id => db.get(id), loesche: async id => { db.delete(id); },
            alle: async () => [...db.values()].map(v => ({ id: v.id, projektId: v.projektId, bytes: v.bytes }))
        }
    });
    return { w, B, D, P, db, ls: m, steuer };
}
function datei(typ, name, extra) {   // echte Dateikopf-Bytes
    const koepfe = { jpeg: [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1], png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13], gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0],
        webp: [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50], heic: [0, 0, 0, 0x18, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63] };
    const bytes = typ === 'svg' ? Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>') : typ === 'html' ? Buffer.from('<html><script>alert(1)</script></html>') : Buffer.concat([Buffer.from(koepfe[typ]), Buffer.alloc(100)]);
    const b = new Blob([bytes], { type: typ === 'svg' ? 'image/jpeg' : 'application/octet-stream' });   // gelogener Typ: darf nicht zählen
    b.name = name || 'x.' + typ; return Object.assign(b, extra || {});
}
const BASIS = () => [{ pfad: 'index.html', inhalt: '<!doctype html><html><head><meta charset="utf-8"><title>T</title></head><body><main><h1>Hallo</h1></main></body></html>' }];

(async function () {
    /* ---------- 1. Reine Hilfen ---------- */
    { const { B } = welt();
        check('Größe: 4000x3000 -> 1600x1200', JSON.stringify(B.planeGroesse(4000, 3000, 1600)) === '{"w":1600,"h":1200}');
        check('Größe: kleines Bild bleibt', JSON.stringify(B.planeGroesse(800, 600, 1600)) === '{"w":800,"h":600}');
        check('Größe: Hochformat', JSON.stringify(B.planeGroesse(3000, 4000, 1600)) === '{"w":1200,"h":1600}');
        check('Größe: ungültig -> null', B.planeGroesse(0, 5, 100) === null && B.planeGroesse(-1, 5, 100) === null);
        const k = (typ) => B.erkenneTyp(new Uint8Array(Buffer.concat([Buffer.from(({ jpeg: [0xFF, 0xD8, 0xFF, 0xE0, 0, 0x10, 0x4A, 0x46, 0x49, 0x46, 0, 1], png: [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13], gif: [0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 1, 0, 1, 0, 0, 0] })[typ]), Buffer.alloc(20)])));
        check('Typ: jpeg/png/gif erkannt', k('jpeg') === 'jpeg' && k('png') === 'png' && k('gif') === 'gif');
        check('Typ: SVG/HTML/Text/leer unbekannt', B.erkenneTyp(new Uint8Array(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))) === '' && B.erkenneTyp(new Uint8Array(Buffer.from('<html><body>hallo hallo</body></html>'))) === '' && B.erkenneTyp(new Uint8Array(3)) === '');
        check('Name: Umlaute und Sonderzeichen', B.sichererName('Größe & Spaß!.JPG', 'jpg', {}) === 'bilder/groesse-spass.jpg');
        check('Name: Kamera-Nummernname wird "foto"', B.sichererName('IMG_20261107_132200.jpg', 'jpg', {}) === 'bilder/foto.jpg' && B.sichererName('20261107132200.jpg', 'jpg', {}) === 'bilder/foto.jpg');
        check('Name: Doppelte werden nummeriert', B.sichererName('katze.png', 'png', { 'bilder/katze.png': true, 'bilder/katze-2.png': true }) === 'bilder/katze-3.png');
        check('Name: Pfadangriff wird harmlos', /^bilder\/[a-z0-9-]+\.jpg$/.test(B.sichererName('../../etc/passwd<script>.jpg', 'jpg', {})));
        const l = B.leiter(1600); check('Leiter: wird nie größer, endet klein', l[0].kante === 1600 && l.every((s, i) => i === 0 || s.kante <= l[i - 1].kante) && l[l.length - 1].kante >= 640 && l.every(s => s.q > 0 && s.q <= 1));
    }

    /* ---------- 2. Foto aufnehmen: verkleinern + speichern ---------- */
    { const { B, db, steuer, ls } = welt();
        const r = await B.hinzufuegen('sp1', datei('jpeg', 'Urlaub Strand.jpg'), { vorhanden: BASIS() });
        check('JPEG: angenommen', r.ok, r);
        check('JPEG: verkleinert auf höchstens 1600 Pixel', r.ok && Math.max(r.eintrag.w, r.eintrag.h) <= 1600 && r.eintrag.w === 1600 && r.eintrag.h === 1200, r.eintrag);
        check('JPEG: Endung jpg, Name bereinigt', r.ok && r.eintrag.pfad === 'bilder/urlaub-strand.jpg', r.eintrag && r.eintrag.pfad);
        check('JPEG: Eintrag ohne Text, mit Verweis', r.ok && r.eintrag.inhalt === '' && /^b[a-z0-9]{6,24}$/.test(r.eintrag.bildId) && r.eintrag.mime === 'image/jpeg');
        check('JPEG: unter Zielgröße', r.ok && r.eintrag.bytes <= B.GRENZEN.zielByte, r.eintrag && r.eintrag.bytes);
        check('JPEG: Quelle ist eigenes Foto', r.ok && r.eintrag.quelle.art === 'eigen');
        const rec = r.ok && db.get(r.eintrag.bildId);
        check('IndexedDB: Daten liegen dort, nach Projekt getrennt', rec && rec.projektId === 'sp1' && rec.daten.byteLength === r.eintrag.bytes);
        check('Stufenweise: erst hohe Qualität, kleiner nur wenn nötig', steuer.kodiert[0].q === 0.85 && steuer.kodiert[0].typ === 'image/jpeg');
        check('Original wird nie gespeichert (nur die neu kodierte Fassung)', rec && rec.daten.byteLength <= B.GRENZEN.zielByte && !rec.original);

        steuer.kodiert.length = 0; steuer.w = 6000; steuer.h = 6000;   // riesig: braucht mehrere Stufen
        const g = await B.hinzufuegen('sp1', datei('jpeg', 'gross.jpg'), { vorhanden: BASIS() });
        check('Großes Bild: braucht mehrere Stufen und passt am Ende', g.ok && steuer.kodiert.length > 1 && g.eintrag.bytes <= B.GRENZEN.zielByte, { n: steuer.kodiert.length, e: g.eintrag });
        steuer.w = 4000; steuer.h = 3000;

        const p = await B.hinzufuegen('sp1', datei('png', 'logo.png'), { vorhanden: BASIS() });
        check('PNG: wird WebP (Transparenz bleibt)', p.ok && p.eintrag.mime === 'image/webp' && /\.webp$/.test(p.eintrag.pfad), p);
        steuer.webp = false;
        const p2 = await B.hinzufuegen('sp1', datei('png', 'logo.png'), { vorhanden: BASIS() });
        check('PNG ohne WebP-Kodierer im Browser: Rückfall auf PNG mit passender Endung', p2.ok && p2.eintrag.mime === 'image/png' && /\.png$/.test(p2.eintrag.pfad), p2);
        steuer.webp = true;
        const gi = await B.hinzufuegen('sp1', datei('gif', 'tanz.gif'), { vorhanden: BASIS() });
        check('GIF: wird ein Standbild (WebP)', gi.ok && gi.eintrag.mime === 'image/webp', gi);

        /* Ablehnungen */
        const s = await B.hinzufuegen('sp1', datei('svg', 'bild.jpg'), { vorhanden: BASIS() });
        check('SVG wird abgelehnt (auch mit gelogenem Typ und .jpg-Name)', !s.ok && /kein Foto|SVG/.test(s.fehler), s);
        const h = await B.hinzufuegen('sp1', datei('html', 'seite.png'), { vorhanden: BASIS() });
        check('HTML wird abgelehnt', !h.ok, h);
        check('Leere Datei abgelehnt', !(await B.hinzufuegen('sp1', Object.assign(new Blob([]), { name: 'a.jpg' }), {})).ok);
        check('Kein Foto gewählt abgelehnt', !(await B.hinzufuegen('sp1', null, {})).ok);
        const riesig = { size: 30 * 1000 * 1000, slice() { throw new Error('darf nicht gelesen werden'); }, name: 'r.jpg' };
        const rr = await B.hinzufuegen('sp1', riesig, {}); check('Über 25 MB: abgelehnt, bevor gelesen wird', !rr.ok && /zu groß/.test(rr.fehler), rr);
        steuer.dekodierFehler = true;
        const kd = await B.hinzufuegen('sp1', datei('jpeg', 'kaputt.jpg'), {}); check('Nicht decodierbar: verständliche Meldung', !kd.ok && /nicht gelesen|beschädigt/.test(kd.fehler), kd);
        const he = await B.hinzufuegen('sp1', datei('heic', 'a.heic'), {}); check('HEIC ohne Browserunterstützung: eigener Hinweis', !he.ok && /HEIC/.test(he.fehler), he);
        steuer.dekodierFehler = false;
        steuer.w = 12000; steuer.h = 9000; const mp = await B.hinzufuegen('sp1', datei('jpeg', 'pano.jpg'), {}); check('108 Megapixel abgelehnt', !mp.ok && /Megapixel/.test(mp.fehler), mp); steuer.w = 4000; steuer.h = 3000;
        const n0 = db.size; steuer.quota = true;
        const q = await B.hinzufuegen('sp1', datei('jpeg', 'q.jpg'), { vorhanden: BASIS() });
        check('Speicher voll: klare Meldung, nichts halb gespeichert', !q.ok && /nicht genug Speicher/.test(q.fehler) && db.size === n0, q); steuer.quota = false;
        check('localStorage bleibt frei von Bilddaten', ![...ls.values()].some(v => v.length > 5000), [...ls.values()].map(v => v.length));
    }

    /* ---------- 3. Grenzen ---------- */
    { const { B, db } = welt();
        let liste = BASIS();
        for (let i = 0; i < 12; i++) { const r = await B.hinzufuegen('sp2', datei('jpeg', 'f.jpg'), { vorhanden: liste }); if (!r.ok) { check('12 Fotos passen (' + i + ')', false, r); break; } liste = liste.concat([r.eintrag]); }
        check('12 Fotos mit eindeutigen Namen', new Set(liste.map(f => f.pfad)).size === 13, liste.map(f => f.pfad));
        const r13 = await B.hinzufuegen('sp2', datei('jpeg', 'f.jpg'), { vorhanden: liste });
        check('13. Foto wird abgelehnt', !r13.ok && /höchstens 12/.test(r13.fehler), r13);
        const vorher = db.size;
        const alt = B.GRENZEN.maxProjektByte; B.GRENZEN.maxProjektByte = 100 * 1000;
        const rb = await B.hinzufuegen('sp3', datei('jpeg', 'f.jpg'), { vorhanden: [{ pfad: 'index.html', inhalt: '' }, { pfad: 'bilder/a.jpg', inhalt: '', bildId: 'baaaaaaa1', bytes: 90 * 1000 }] });
        check('Projektgrenze (Bytes) greift', !rb.ok && /MB|erlaubt/.test(rb.fehler), rb); B.GRENZEN.maxProjektByte = alt;
        const altG = B.GRENZEN.maxGesamtByte; B.GRENZEN.maxGesamtByte = 100 * 1000;
        const rg = await B.hinzufuegen('sp4', datei('jpeg', 'f.jpg'), { vorhanden: BASIS() });
        check('Gesamtgrenze des Fotospeichers greift', !rg.ok && /voll/.test(rg.fehler) && db.size === vorher, rg); B.GRENZEN.maxGesamtByte = altG;
        const v = await B.verbrauch(); check('Verbrauch zählt Fotos und Bytes', v.anzahl === db.size && v.bytes > 0, v);
        const vollP = Array.from({ length: 40 }, (_, i) => ({ pfad: 'd' + i + '.txt', inhalt: '' }));
        const r40 = await B.hinzufuegen('sp5', datei('jpeg', 'f.jpg'), { vorhanden: vollP }); check('Dateigrenze des Projekts (40) greift', !r40.ok, r40);
    }

    /* ---------- 4. Projektprüfung und Verweise ---------- */
    { const { B, D } = welt();
        const e = { pfad: 'bilder/strand.jpg', inhalt: '', bildId: 'babc123456', mime: 'image/jpeg', bytes: 1000, w: 800, h: 600, quelle: { art: 'eigen' } };
        const mit = (html, extra) => [{ pfad: 'index.html', inhalt: html }].concat(extra || [], [e]);
        const gut = mit('<!doctype html><html><head><title>t</title></head><body><img src="bilder/strand.jpg" alt="Strand"></body></html>');
        check('Prüfung: Projekt mit Foto-Verweis ist gültig', D.pruefeProjekt(gut).ok, D.pruefeProjekt(gut));
        check('Prüfung: Foto zählt nicht zu den Text-Bytes', D.pruefeProjekt(gut).bytes < 300, D.pruefeProjekt(gut).bytes);
        check('Verweise: <img> auf eigenes Foto ist erlaubt', D.pruefeVerweise(gut).ok, D.pruefeVerweise(gut));
        check('Verweise: <img> auf nicht vorhandenes Foto bleibt Fehler', !D.pruefeVerweise(mit('<img src="bilder/gibtsnicht.jpg">')).ok);
        check('Verweise: JPG-Bild ohne Foto-Eintrag bleibt Fehler', !D.pruefeVerweise([{ pfad: 'index.html', inhalt: '<img src="bilder/strand.jpg">' }]).ok);
        check('Verweise: fremde Adresse bleibt Fehler', !D.pruefeVerweise(mit('<img src="https://x.de/a.jpg">')).ok);
        const css = mit('<link rel="stylesheet" href="css/style.css"><div class="hero"></div>', [{ pfad: 'css/style.css', inhalt: '.hero{background:url("../bilder/strand.jpg") center/cover}' }]);
        check('Verweise: CSS-url() auf eigenes Foto erlaubt (relativ zur CSS-Datei)', D.pruefeVerweise(css).ok, D.pruefeVerweise(css));
        check('Verweise: CSS-url() auf Fremdes bleibt Fehler', !D.pruefeVerweise(mit('<style>.a{background:url(https://x.de/a.jpg)}</style>')).ok && !D.pruefeVerweise(mit('<style>.a{background:url(bilder/nix.jpg)}</style>')).ok);
        check('Verweise: Stil im style-Attribut', D.pruefeVerweise(mit('<div style="background:url(bilder/strand.jpg)"></div>')).ok);
        const bad = (x) => D.pruefeProjekt([{ pfad: 'index.html', inhalt: '' }, x]);
        check('Prüfung: ungültige bildId abgelehnt', !bad({ pfad: 'bilder/a.jpg', inhalt: '', bildId: '../../x' }).ok && !bad({ pfad: 'bilder/a.jpg', inhalt: '', bildId: 5 }).ok);
        check('Prüfung: Foto außerhalb bilder/ abgelehnt', !bad({ pfad: 'a.jpg', inhalt: '', bildId: 'babc123456' }).ok && !bad({ pfad: 'js/a.jpg', inhalt: '', bildId: 'babc123456' }).ok);
        check('Prüfung: Endung svg/html/js für Foto abgelehnt', ['svg', 'html', 'js', 'gif', 'exe'].every(x => !bad({ pfad: 'bilder/a.' + x, inhalt: '', bildId: 'babc123456' }).ok));
        check('Prüfung: Foto mit Text im Inhalt abgelehnt', !bad({ pfad: 'bilder/a.jpg', inhalt: 'GIF89a', bildId: 'babc123456' }).ok);
        check('Prüfung: Textdatei mit Bild-Endung ohne bildId abgelehnt (alte Regel bleibt)', !bad({ pfad: 'bilder/a.jpg', inhalt: 'abc' }).ok && !bad({ pfad: 'a.png', inhalt: 'x' }).ok);
        const dreizehn = [{ pfad: 'index.html', inhalt: '' }].concat(Array.from({ length: 13 }, (_, i) => ({ pfad: 'bilder/f' + i + '.jpg', inhalt: '', bildId: 'babc12345' + i })));
        check('Prüfung: mehr als 12 Fotos abgelehnt', !D.pruefeProjekt(dreizehn).ok);
        const alt = [{ pfad: 'index.html', inhalt: '<!doctype html><title>a</title><h1>x</h1>' }, { pfad: 'style.css', inhalt: 'h1{color:red}' }];
        check('Alte Projekte ohne Fotos: unverändert gültig', D.pruefeProjekt(alt).ok && D.pruefeVerweise(alt).ok);
        const rb = D.ersetzeBilder(mit('<img src="bilder/strand.jpg" alt="ok"><img src="bilder/weg.jpg" alt="weg">'));
        check('ersetzeBilder: eigenes Foto bleibt, fehlendes wird Fläche', rb.anzahl === 1 && /src="bilder\/strand.jpg"/.test(rb.dateien[0].inhalt) && !/weg\.jpg/.test(rb.dateien[0].inhalt));
        check('ersetzeBilder: Foto-Eintrag selbst unverändert', rb.dateien.find(f => f.bildId).bildId === 'babc123456');
        check('Hilfen: ohneBilder/bilderListe', D.ohneBilder(gut).length === 1 && D.bilderListe(gut).length === 1);
    }

    /* ---------- 5. Vorschau ---------- */
    { const { D } = welt();
        const e = { pfad: 'bilder/strand.jpg', inhalt: '', bildId: 'babc123456' }, URL1 = 'data:image/jpeg;base64,AAAA';
        const dat = [{ pfad: 'index.html', inhalt: '<!doctype html><html><head><link rel="stylesheet" href="css/style.css"><style>.b{background:url(bilder/strand.jpg)}</style></head><body><img src="bilder/strand.jpg" alt="x"><picture><source srcset="bilder/strand.jpg"><img src="./bilder/strand.jpg"></picture><div style="background:url(\'bilder/strand.jpg\')"></div></body></html>' },
            { pfad: 'css/style.css', inhalt: '.hero{background:url("../bilder/strand.jpg")}' }, e];
        const h = D.vorschauHtml(dat, { 'bilder/strand.jpg': URL1 });
        check('Vorschau: kein Dateiname bleibt übrig', !/bilder\/strand/.test(h), h.match(/.{30}bilder\/strand.{20}/));
        check('Vorschau: alle Stellen tragen die data:-Adresse (img, srcset, 3x CSS)', h.split(URL1).length - 1 === 6, h.split(URL1).length - 1);
        check('Vorschau: strenge CSP bleibt (kein Netz)', /img-src data: blob:/.test(h) && /default-src 'none'/.test(h));
        const ohne = D.vorschauHtml(dat);
        check('Vorschau ohne Fotokarte: weiter lauffähig (kein Fehler)', typeof ohne === 'string' && /Content-Security-Policy/.test(ohne));
        const svgAlt = D.vorschauHtml([{ pfad: 'index.html', inhalt: '<img src="a.svg">' }, { pfad: 'a.svg', inhalt: '<svg xmlns="http://www.w3.org/2000/svg"/>' }]);
        check('Vorschau: SVG-Bilder wie bisher', /data:image\/svg\+xml/.test(svgAlt));
        const pl = D.platzhalter(dat); check('Platzhalter: ein Pixel pro Foto', Object.keys(pl).length === 1 && /^data:image\/gif/.test(pl['bilder/strand.jpg']));
        check('Vorschau: Fotodaten kommen nur aus der übergebenen Karte (ein Name kann keine fremde Datei ziehen)', !/data:image\/jpeg/.test(D.vorschauHtml([{ pfad: 'index.html', inhalt: '<img src="../../etc/x.jpg"><img src="bilder/nix.jpg">' }], { 'bilder/strand.jpg': URL1 })));
    }

    /* ---------- 6. Vorschau-/ZIP-Daten aus dem Speicher, Aufräumen ---------- */
    { const { B, D, P, db, w } = welt();
        let liste = BASIS();
        const a = await B.hinzufuegen('spA', datei('jpeg', 'eins.jpg'), { vorhanden: liste }); liste = D.fotoEinfuegen(liste, a.eintrag, 'Eins').dateien;
        const b = await B.hinzufuegen('spA', datei('png', 'zwei.png'), { vorhanden: liste }); liste = D.fotoEinfuegen(liste, b.eintrag, 'Zwei').dateien;
        check('fotoEinfuegen: <figure> mit <img> vor </main>, Maße und alt', /<figure class="jv-foto"[^>]*><img src="bilder\/eins.jpg" alt="Eins" width="1600" height="1200"[^>]*><\/figure>/.test(liste[0].inhalt) && liste[0].inhalt.indexOf('eins.jpg') < liste[0].inhalt.indexOf('</main>') && liste[0].inhalt.indexOf('zwei.webp') < liste[0].inhalt.indexOf('</main>'), liste[0].inhalt);
        check('Projekt mit eingefügten Fotos besteht die Prüfung', D.pruefeProjekt(liste).ok && D.pruefeVerweise(liste).ok, [D.pruefeProjekt(liste), D.pruefeVerweise(liste)]);
        const fv = await B.fuerVorschau(liste);
        check('fuerVorschau: data:-Adressen mit richtigem Typ', fv.fehlend.length === 0 && /^data:image\/jpeg;base64,/.test(fv.karte['bilder/eins.jpg']) && /^data:image\/webp;base64,/.test(fv.karte['bilder/zwei.webp']), Object.keys(fv.karte));
        const echt = Buffer.from(fv.karte['bilder/eins.jpg'].split(',')[1], 'base64');
        check('fuerVorschau: Bytes stimmen mit dem Gespeicherten überein', echt.length === a.eintrag.bytes);
        const html = D.vorschauHtml(liste, fv.karte);
        check('Vorschau mit gespeicherten Fotos zeigt beide', (html.match(/data:image\/(jpeg|webp);base64/g) || []).length === 2);
        db.delete(a.eintrag.bildId);
        const fv2 = await B.fuerVorschau(liste);
        check('Foto fehlt im Speicher: Platzhalter statt kaputtem Bild, gemeldet', fv2.fehlend.join() === 'bilder/eins.jpg' && /^data:image\/svg\+xml/.test(fv2.karte['bilder/eins.jpg']) && /Foto fehlt/.test(decodeURIComponent(fv2.karte['bilder/eins.jpg'])));
        const z0 = await B.fuerZip(liste); check('fuerZip: fehlendes Foto wird gemeldet (kein halbes ZIP)', z0.fehlend.join() === 'bilder/eins.jpg');
        const a2 = await B.hinzufuegen('spA', datei('jpeg', 'eins.jpg'), { vorhanden: D.fotoEntfernen(liste, 'bilder/eins.jpg') }); liste = D.fotoEntfernen(liste, 'bilder/eins.jpg');
        check('fotoEntfernen: Eintrag und <figure> sind weg', !liste.some(f => f.pfad === 'bilder/eins.jpg') && !/eins\.jpg/.test(liste[0].inhalt) && /zwei\.webp/.test(liste[0].inhalt));
        liste = D.fotoEinfuegen(liste, a2.eintrag, 'Eins neu').dateien;
        const z = await B.fuerZip(liste);
        check('fuerZip: alle Fotos mit echten Bytes', z.fehlend.length === 0 && z.dateien.filter(f => f.inhalt instanceof Uint8Array).length === 2);
        const bytesA = z.dateien.find(f => f.pfad === a2.eintrag.pfad).inhalt;
        check('fuerZip: Bytes gleich wie gespeichert', bytesA.length === a2.eintrag.bytes);
        const zip = D.zip(z.dateien);
        const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zb-')); fs.writeFileSync(path.join(tmp, 'p.zip'), Buffer.from(zip));
        let unz = null; try { unz = cp.execFileSync('unzip', ['-l', path.join(tmp, 'p.zip')], { encoding: 'utf8' }); } catch (e) { }
        if (unz !== null) {
            check('ZIP: index.html und beide Fotos darin', /index\.html/.test(unz) && /bilder\/zwei\.webp/.test(unz) && /bilder\/eins\.jpg/.test(unz), unz);
            try { cp.execFileSync('unzip', ['-tq', path.join(tmp, 'p.zip')]); check('ZIP: Prüfsummen in Ordnung (unzip -t)', true); } catch (e) { check('ZIP: Prüfsummen in Ordnung', false, String(e.stdout)); }
            cp.execFileSync('unzip', ['-o', '-q', path.join(tmp, 'p.zip'), '-d', path.join(tmp, 'x')]);
            check('ZIP: entpacktes Foto ist byte-gleich', Buffer.compare(fs.readFileSync(path.join(tmp, 'x', a2.eintrag.pfad)), Buffer.from(bytesA)) === 0);
            check('ZIP: HTML verweist relativ auf das Foto, das daneben liegt', fs.existsSync(path.join(tmp, 'x', 'bilder', 'zwei.webp')) && /src="bilder\/zwei\.webp"/.test(fs.readFileSync(path.join(tmp, 'x', 'index.html'), 'utf8')));
        } else console.log('(unzip fehlt: ZIP-Inhalt nur über die Struktur geprüft)');
        check('ZIP: ohne Fremdquelle keine Nachweis-Datei', !z.dateien.some(f => /NACHWEIS/.test(f.pfad)));

        /* Aufräumen */
        const pr = P.neu({ name: 'Foto-Test', art: 'webseite', auftrag: 'x', dateien: liste }); check('Projekt mit Foto-Verweisen speichern', pr.ok, pr);
        check('Projektspeicher: nur kleine Verweise, keine Bilddaten', pr.ok && JSON.stringify(P.hole(pr.projekt.id).dateien).length < 3000);
        const fremd = await B.hinzufuegen(pr.projekt.id, datei('jpeg', 'x.jpg'), { vorhanden: [] });
        const waise = await B.hinzufuegen('spA', datei('jpeg', 'waise.jpg'), { vorhanden: [] });
        const weg = await B.raeumeAuf('spA', [liste]);
        check('raeumeAuf: löscht nur nicht mehr gebrauchte Fotos des Projekts', weg >= 1 && [...db.values()].filter(r => r.projektId === 'spA').length === 2 && db.has(fremd.eintrag.bildId) && !db.has(waise.eintrag.bildId));
        const mitVorher = await B.hinzufuegen('spB', datei('jpeg', 'v.jpg'), { vorhanden: [] });
        const w2 = await B.raeumeAuf('spB', [BASIS(), [mitVorher.eintrag]]);
        check('raeumeAuf: Fassung davor (Rückgängig) behält ihre Fotos', w2 === 0 && db.has(mitVorher.eintrag.bildId));
        check('loescheProjekt: alle Fotos des Projekts weg, fremde bleiben', (await B.loescheProjekt('spA')) === 2 && db.has(fremd.eintrag.bildId));
        P.entferne(pr.projekt.id); await new Promise(r => setTimeout(r, 20));
        check('Projekt löschen räumt dessen Fotos in IndexedDB auf', !db.has(fremd.eintrag.bildId));
        check('Projekt löschen lässt Fotos anderer Projekte', db.has(mitVorher.eintrag.bildId));
        /* Versionen: aktualisiere behält Verweise der Vorgängerfassung */
        const p3 = P.neu({ name: 'V', art: 'webseite', auftrag: 'x', dateien: [{ pfad: 'index.html', inhalt: '<p>1</p>' }, mitVorher.eintrag] });
        const u = P.aktualisiere(p3.projekt.id, { dateien: [{ pfad: 'index.html', inhalt: '<p>2</p>' }] });
        check('Version davor behält den Foto-Verweis', u.ok && u.projekt.vorher.dateien.some(f => f.bildId === mitVorher.eintrag.bildId));
    }

    /* ---------- 7. Quellen für später (Lizenz-Bilder, KI-Bilder) ---------- */
    { const { B, D, db } = welt();
        const r1 = await B.ausAnbieter('lizenz_web', 'sp1', { suche: 'katze' }); check('Lizenzbilder: ohne Anbieter klare Absage', !r1.ok && /nicht angeschlossen/.test(r1.fehler), r1);
        const r2 = await B.ausAnbieter('ki_bild', 'sp1', {}); check('KI-Bilder: ohne Anbieter klare Absage', !r2.ok && /nicht angeschlossen/.test(r2.fehler), r2);
        check('Unbekannte Quelle / "eigen" nicht über Anbieter', !(await B.ausAnbieter('quatsch', 'sp1', {})).ok && !(await B.ausAnbieter('eigen', 'sp1', {})).ok);
        check('Anbieter ohne hole() wird nicht registriert', !B.registriereAnbieter('lizenz_web', { name: 'x' }) && !B.registriereAnbieter('eigen', { name: 'x', hole: () => 0 }));
        check('Standard: Fremdquellen sind aus', B.QUELLEN.eigen.aktiv && !B.QUELLEN.lizenz_web.aktiv && !B.QUELLEN.ki_bild.aktiv);
        let antwort = { blob: datei('jpeg', 'stock.jpg'), name: 'katze', quelle: { art: 'x', lizenz: '' } };
        B.registriereAnbieter('lizenz_web', { name: 'Testanbieter', hole: async () => antwort });
        const r3 = await B.ausAnbieter('lizenz_web', 'sp1', {}, { vorhanden: BASIS() });
        check('Fremdbild ohne Lizenz/Urheber/Quelle wird NICHT gespeichert', !r3.ok && /Lizenz|fehlt/.test(r3.fehler) && db.size === 0, r3);
        antwort = { blob: datei('jpeg', 'stock.jpg'), name: 'katze', quelle: { lizenz: 'CC0', urheber: 'Max', herkunftUrl: 'http://x.de/a' } };
        const r4 = await B.ausAnbieter('lizenz_web', 'sp1', {}, { vorhanden: BASIS() }); check('Herkunft nur über https', !r4.ok && /https/.test(r4.fehler), r4);
        antwort = { blob: datei('jpeg', 'stock.jpg'), name: 'katze', quelle: { art: 'eigen', lizenz: 'CC0', lizenzUrl: 'https://creativecommons.org/publicdomain/zero/1.0/', urheber: 'Max <b>', herkunftUrl: 'https://beispiel.de/a' } };
        const r5 = await B.ausAnbieter('lizenz_web', 'sp1', {}, { vorhanden: BASIS() });
        check('Fremdbild mit vollständiger Herkunft wird gespeichert, Art nicht fälschbar', r5.ok && r5.eintrag.quelle.art === 'lizenz_web' && r5.eintrag.quelle.lizenz === 'CC0', r5);
        const nw = B.nachweis(BASIS().concat([r5.eintrag, { pfad: 'bilder/e.jpg', inhalt: '', bildId: 'beeeeeeee', quelle: { art: 'eigen' } }]));
        check('Nachweis nennt Urheber, Lizenz, Quelle – aber nicht eigene Fotos', /Max/.test(nw) && /CC0/.test(nw) && /beispiel\.de/.test(nw) && !/bilder\/e\.jpg/.test(nw), nw);
        const zz = await B.fuerZip(BASIS().concat([r5.eintrag])); check('ZIP enthält bilder/NACHWEIS.txt bei Fremdbildern', zz.dateien.some(f => f.pfad === 'bilder/NACHWEIS.txt'));
        B.registriereAnbieter('ki_bild', { name: 'KI', hole: async () => ({ blob: datei('png', 'ki.png'), name: 'ki', quelle: { anbieter: 'Testbild', modell: 'm1' } }) });
        const r6 = await B.ausAnbieter('ki_bild', 'sp1', {}, { vorhanden: BASIS() }); check('KI-Bild wird mit Anbieter und Modell vermerkt', r6.ok && r6.eintrag.quelle.art === 'ki_bild' && r6.eintrag.quelle.modell === 'm1', r6);
        check('Anbieter-Bild wird wie jedes Foto verkleinert und geprüft', r6.ok && r6.eintrag.mime === 'image/webp' && Math.max(r6.eintrag.w, r6.eintrag.h) <= 1600);
        B.registriereAnbieter('ki_bild', { name: 'KI', hole: async () => ({ blob: datei('svg', 'ki.svg'), name: 'ki', quelle: { anbieter: 'T', modell: 'm' } }) });
        check('Anbieter kann kein SVG einschmuggeln', !(await B.ausAnbieter('ki_bild', 'sp1', {}, { vorhanden: BASIS() })).ok);
        const roh = welt(true); check('Verfügbarkeit ohne Browser: false, Aufnahme meldet sauber statt abzustürzen', roh.B.verfuegbar() === false && (await roh.B.hinzufuegen('x', datei('jpeg'), {})).ok === false);
    }

    /* ---------- 8. Skripte eingehängt, Netz nie benutzt ---------- */
    { const idx = lies('index.html'), src = lies('js/studio_bilder.js');
        check('index.html hängt studio_bilder.js ein, mit Stempel', /<script src=".\/js\/studio_bilder.js\?v=[0-9a-f]{8}"><\/script>/.test(idx));
        check('studio_bilder.js benutzt kein Netz', !/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon|importScripts)\b/.test(src.replace(/\/\*[\s\S]*?\*\//g, '')));
        check('studio_bilder.js: kein eval, kein innerHTML', !/\beval\s*\(|new\s+Function|innerHTML/.test(src));
        check('Bilder vor Projekten geladen (Aufräumen beim Löschen)', idx.indexOf('studio_bilder.js') < idx.indexOf('studio_projekte.js'));
    }

    console.log('STUDIO-BILDER: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Absturz: ' + (e && e.stack || e)); process.exit(1); });
