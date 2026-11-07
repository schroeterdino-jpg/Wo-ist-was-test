/* ============================================================
   JARVIS STUDIO - BILDER (Phase 1): eigene Fotos verkleinern, in IndexedDB speichern und in Projekte einfügen.
   window.jvStudioBilder
   Warum IndexedDB: localStorage fasst nur wenige MB (Studio-Projekte sind auf 1,8 MB begrenzt). Ein Foto vom Handy hat 3 bis 10 MB.
   Im Projekt (localStorage) steht nur ein kleiner Verweis: { pfad:'bilder/foto-1.jpg', inhalt:'', bildId:'b…', mime, bytes, w, h, quelle }.
   Die Bytes liegen in IndexedDB (Datenbank jv_studio_bilder, Speicher "bilder"), getrennt nach Projekt.
   Ablauf eines Fotos: Dateityp an den ersten Bytes prüfen -> decodieren -> auf höchstens 1600 Pixel Kantenlänge verkleinern -> neu codieren
   (JPEG bzw. WebP, Qualität sinkt stufenweise, bis es unter ca. 350 KB liegt) -> speichern. Das Neucodieren entfernt EXIF-Daten (auch den Aufnahmeort)
   und macht aus jeder Eingabe ein harmloses Rasterbild; das Original wird nie gespeichert. SVG, HTML und alles Unbekannte wird abgelehnt.
   Funktionen (alle liefern Zusagen und werfen nie; Fehler als { ok:false, fehler }):
     verfuegbar()                              gibt es IndexedDB und Bild-Werkzeuge im Browser?
     hinzufuegen(projektId, datei, opt)        -> { ok, eintrag }   opt.vorhanden = aktuelle Dateiliste des Projekts (Namen, Anzahl, Platz)
     quelleAnnehmen(...) / ausAnbieter(...)    Vorbereitung für lizenzierte Web-Bilder und KI-Bilder (noch ohne Anbieter, siehe QUELLEN)
     hole(id) / dataUrl(id) / entferne(id)
     fuerVorschau(dateien)                     -> { karte:{pfad:dataUrl}, fehlend:[pfad] }
     fuerZip(dateien)                          -> { dateien (mit Bytes), fehlend:[pfad] }
     raeumeAuf(projektId, listen)              löscht Fotos des Projekts, die in keiner Dateiliste mehr vorkommen
     loescheProjekt(projektId)
     verbrauch()                               -> { anzahl, bytes }
     nachweis(dateien)                         Text für Bilder mit Fremdquelle (Lizenz, Urheber) – für die ZIP-Datei
   Rein rechnerische Teile (planeGroesse, erkenneTyp, sichererName, leiter) sind ohne Browser testbar; Decodieren, Codieren und Speicher sind austauschbar
   (_setze), damit die Tests ohne Browser laufen. Netz wird hier NIE benutzt: alles funktioniert offline.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvStudioBilder) return;

    var GRENZEN = {
        maxEingabeByte: 25 * 1024 * 1024,    // größer lehnen wir ab, bevor wir es überhaupt decodieren (Speicher des Handys)
        maxPixel: 80 * 1000 * 1000,          // 80 Megapixel Eingangsgröße (S25 Ultra 200 MP wird als 50 MP geliefert); darüber droht ein Absturz beim Decodieren
        maxKante: 1600, minKante: 640,
        zielByte: 350 * 1000, maxBildByte: 700 * 1000,
        maxProProjekt: 12, maxProjektByte: 5 * 1000 * 1000, maxGesamtByte: 80 * 1000 * 1000
    };
    var DB_NAME = 'jv_studio_bilder', STORE = 'bilder';
    var ENDUNG = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

    /* ---------- Quellen (Vorbereitung): jedes Bild trägt seine Herkunft ---------- */
    var QUELLEN = {
        eigen: { name: 'Eigenes Foto', aktiv: true, netz: false, pflicht: [] },
        lizenz_web: { name: 'Lizenziertes Web-Bild', aktiv: false, netz: true, pflicht: ['lizenz', 'urheber', 'herkunftUrl'], anbieter: null },
        ki_bild: { name: 'KI-erzeugtes Bild', aktiv: false, netz: true, pflicht: ['anbieter', 'modell'], anbieter: null }
    };
    function registriereAnbieter(art, anbieter) {
        var q = QUELLEN[art];
        if (!q || art === 'eigen' || !anbieter || typeof anbieter.hole !== 'function' || typeof anbieter.name !== 'string') return false;
        q.anbieter = anbieter; q.aktiv = true; return true;
    }
    function quelleOk(q) {
        if (!q || !QUELLEN[q.art]) return 'Unbekannte Bildquelle.';
        var fehlt = QUELLEN[q.art].pflicht.filter(function (k) { return !q[k] || typeof q[k] !== 'string'; });
        if (fehlt.length) return 'Zur Bildquelle fehlt: ' + fehlt.join(', ') + '. Ohne Lizenzangabe speichere ich kein Fremdbild.';
        if (q.herkunftUrl && !/^https:\/\//i.test(q.herkunftUrl)) return 'Die Herkunftsadresse muss mit https beginnen.';
        return '';
    }
    function saubereQuelle(q) {
        var o = { art: q.art, name: QUELLEN[q.art].name };
        ['lizenz', 'lizenzUrl', 'urheber', 'herkunftUrl', 'anbieter', 'modell', 'hinweis'].forEach(function (k) { if (typeof q[k] === 'string' && q[k]) o[k] = q[k].replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, 200); });
        return o;
    }

    /* ---------- Reine Hilfen ---------- */
    function planeGroesse(w, h, maxKante) {
        if (!(w > 0) || !(h > 0)) return null;
        var f = Math.min(1, maxKante / Math.max(w, h));
        return { w: Math.max(1, Math.round(w * f)), h: Math.max(1, Math.round(h * f)) };
    }
    /* Dateityp an den ersten Bytes (der Name oder der vom Handy gemeldete Typ zählt nicht) */
    function erkenneTyp(u8) {
        if (!u8 || u8.length < 12) return '';
        if (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) return 'jpeg';
        if (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) return 'png';
        if (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x38) return 'gif';
        if (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[3] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45 && u8[10] === 0x42 && u8[11] === 0x50) return 'webp';
        if (u8[4] === 0x66 && u8[5] === 0x74 && u8[6] === 0x79 && u8[7] === 0x70) { var m = String.fromCharCode(u8[8], u8[9], u8[10], u8[11]); if (/^(heic|heix|hevc|mif1|msf1|avif)$/.test(m)) return 'heic'; }
        return '';
    }
    function sichererName(name, endung, belegt) {
        var b = String(name || 'foto').replace(/\.[a-z0-9]{1,5}$/i, '').toLowerCase()
            .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
        if (!b || /^(img|image|foto|photo|pxl|dsc)?-?\d{6,}/.test(b)) b = 'foto';
        var n = 1, pfad = 'bilder/' + b + '.' + endung;
        while (belegt[pfad]) { n++; pfad = 'bilder/' + b + '-' + n + '.' + endung; }
        return pfad;
    }
    /* Qualitätsstufen, dann kleinere Kanten, bis es unter die Zielgröße passt */
    function leiter(maxKante) {
        var l = [], k = maxKante;
        [[1, [0.85, 0.75, 0.65]], [0.8, [0.7, 0.55]], [0.65, [0.6, 0.45]], [0.5, [0.5, 0.4]]].forEach(function (s) {
            var kante = Math.max(GRENZEN.minKante, Math.round(k * s[0]));
            s[1].forEach(function (q) { l.push({ kante: kante, q: q }); });
        });
        return l;
    }
    function neueId() { return 'b' + Date.now().toString(36) + Math.floor(Math.random() * 1679616).toString(36).padStart(4, '0'); }
    function zuB64(u8) {
        if (typeof Buffer !== 'undefined') return Buffer.from(u8).toString('base64');
        var s = '', n = 0x8000; for (var i = 0; i < u8.length; i += n) s += String.fromCharCode.apply(null, u8.subarray(i, i + n)); return btoa(s);
    }

    /* ---------- Browser-Teile (austauschbar für Tests) ---------- */
    var impl = {
        /* Datei -> { w, h, quelle, schliessen() } */
        dekodiere: async function (blob) {
            if (typeof createImageBitmap === 'function') {
                var bm; try { bm = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { bm = await createImageBitmap(blob); }
                return { w: bm.width, h: bm.height, quelle: bm, schliessen: function () { try { bm.close(); } catch (e) { } } };
            }
            return new Promise(function (ok, nein) {
                var url = URL.createObjectURL(blob), im = new Image();
                im.onload = function () { ok({ w: im.naturalWidth, h: im.naturalHeight, quelle: im, schliessen: function () { URL.revokeObjectURL(url); } }); };
                im.onerror = function () { URL.revokeObjectURL(url); nein(new Error('Bild nicht lesbar')); };
                im.src = url;
            });
        },
        /* Bild -> Blob in der Zielgröße */
        kodiere: function (bild, w, h, typ, q) {
            return new Promise(function (ok, nein) {
                var c = document.createElement('canvas'); c.width = w; c.height = h;
                var g = c.getContext('2d'); if (!g) { nein(new Error('Keine Zeichenfläche')); return; }
                if (typ === 'image/jpeg') { g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); }   // JPEG kennt keine Transparenz
                g.imageSmoothingQuality = 'high'; g.drawImage(bild.quelle, 0, 0, w, h);
                c.toBlob(function (b) { c.width = c.height = 0; b ? ok(b) : nein(new Error('Kodieren fehlgeschlagen')); }, typ, q);
            });
        },
        db: null,
        oeffne: function () {
            if (impl.db) return impl.db;
            impl.db = new Promise(function (ok, nein) {
                var rq; try { rq = indexedDB.open(DB_NAME, 1); } catch (e) { nein(e); return; }
                rq.onupgradeneeded = function () { var d = rq.result; if (!d.objectStoreNames.contains(STORE)) { var s = d.createObjectStore(STORE, { keyPath: 'id' }); s.createIndex('projekt', 'projektId', { unique: false }); } };
                rq.onsuccess = function () { var d = rq.result; d.onversionchange = function () { d.close(); impl.db = null; }; ok(d); };
                rq.onerror = function () { nein(rq.error || new Error('IndexedDB nicht verfügbar')); };
                rq.onblocked = function () { nein(new Error('IndexedDB blockiert')); };
            });
            impl.db.catch(function () { impl.db = null; });
            return impl.db;
        },
        /* Speicher-Schnittstelle: setze, hole, loesche, alle (alle Einträge ohne Daten) */
        speicher: {
            setze: function (rec) { return impl.tx('readwrite', function (s) { return s.put(rec); }); },
            hole: function (id) { return impl.tx('readonly', function (s) { return s.get(id); }); },
            loesche: function (id) { return impl.tx('readwrite', function (s) { return s.delete(id); }); },
            alle: function () {
                return impl.oeffne().then(function (d) {
                    return new Promise(function (ok, nein) {
                        var res = [], rq = d.transaction(STORE, 'readonly').objectStore(STORE).openCursor();
                        rq.onsuccess = function () { var c = rq.result; if (c) { var v = c.value; res.push({ id: v.id, projektId: v.projektId, bytes: v.bytes }); c.continue(); } else ok(res); };
                        rq.onerror = function () { nein(rq.error); };
                    });
                });
            }
        },
        tx: function (modus, f) {
            return impl.oeffne().then(function (d) {
                return new Promise(function (ok, nein) {
                    var t = d.transaction(STORE, modus), rq = f(t.objectStore(STORE)), erg;
                    rq.onsuccess = function () { erg = rq.result; };
                    t.oncomplete = function () { ok(erg); };
                    t.onerror = t.onabort = function () { nein(t.error || rq.error || new Error('Speichern fehlgeschlagen')); };
                });
            });
        }
    };
    function _setze(teile) { Object.keys(teile || {}).forEach(function (k) { if (k === 'speicher') impl.speicher = teile.speicher; else impl[k] = teile[k]; }); }

    function verfuegbar() { return impl.verfuegbar(); }
    impl.verfuegbar = function () {
        try { return typeof indexedDB !== 'undefined' && !!indexedDB && (typeof createImageBitmap === 'function' || typeof Image !== 'undefined') && typeof document !== 'undefined'; } catch (e) { return false; }
    }
    function fehler(t) { return { ok: false, fehler: t }; }
    function istQuotaFehler(e) { return !!e && (e.name === 'QuotaExceededError' || e.code === 22 || /quota/i.test(String(e.message))); }

    /* ---------- Verkleinern ---------- */
    async function verkleinere(datei) {
        var kopf;
        try { kopf = new Uint8Array(await datei.slice(0, 16).arrayBuffer()); } catch (e) { return fehl('Die Datei konnte nicht gelesen werden.'); }
        var typ = erkenneTyp(kopf);
        if (!typ) return fehl('Das ist kein Foto, das ich nehme (JPEG, PNG, WebP oder GIF). SVG und andere Dateien lehne ich aus Sicherheitsgründen ab.');
        var bild;
        try { bild = await impl.dekodiere(datei); }
        catch (e) { return fehl(typ === 'heic' ? 'Dieses Bildformat (HEIC/AVIF) kann dein Browser nicht lesen. Stell die Kamera auf JPEG oder wähle das Foto aus der Galerie.' : 'Das Bild konnte nicht gelesen werden (beschädigt?).'); }
        try {
            if (bild.w * bild.h > GRENZEN.maxPixel) return fehl('Das Bild ist mit ' + Math.round(bild.w * bild.h / 1e6) + ' Megapixeln zu groß für das Handy-Studio.');
            var ausTyp = typ === 'jpeg' ? 'image/jpeg' : 'image/webp', stufen = leiter(GRENZEN.maxKante), letzter = null, g;
            for (var i = 0; i < stufen.length; i++) {
                g = planeGroesse(bild.w, bild.h, stufen[i].kante);
                var b = await impl.kodiere(bild, g.w, g.h, ausTyp, stufen[i].q);
                if (ausTyp === 'image/webp' && b.type !== 'image/webp') { ausTyp = 'image/png'; b = await impl.kodiere(bild, g.w, g.h, ausTyp, 1); }   // Browser ohne WebP-Kodierer: PNG
                letzter = { blob: b, w: g.w, h: g.h, mime: b.type || ausTyp };
                if (b.size <= GRENZEN.zielByte) break;
                if (ausTyp === 'image/png' && i === 0) { /* PNG ignoriert die Qualität: gleich zur kleineren Kante */ i = Math.max(i, 2); }
            }
            if (!letzter || !ENDUNG[letzter.mime]) return fehl('Das Bild konnte nicht umgewandelt werden.');
            if (letzter.blob.size > GRENZEN.maxBildByte) return fehl('Das Bild bleibt auch verkleinert zu groß (' + Math.round(letzter.blob.size / 1000) + ' KB).');
            return { ok: true, blob: letzter.blob, w: letzter.w, h: letzter.h, mime: letzter.mime, original: { w: bild.w, h: bild.h, bytes: datei.size } };
        } catch (e) { return fehl('Das Bild konnte nicht verkleinert werden.'); }
        finally { try { bild.schliessen(); } catch (x) { } }
        function fehl(t) { return fehler(t); }
    }

    /* ---------- Speichern ---------- */
    async function belegt() {
        try { var a = await impl.speicher.alle(); return { anzahl: a.length, bytes: a.reduce(function (s, x) { return s + (x.bytes || 0); }, 0), liste: a }; }
        catch (e) { return { anzahl: 0, bytes: 0, liste: [], fehler: true }; }
    }
    async function verbrauch() { var b = await belegt(); return { anzahl: b.anzahl, bytes: b.bytes }; }

    async function speichereBlob(projektId, blob, m, opt) {
        opt = opt || {};
        var D = window.jvStudioDateien, vorhanden = opt.vorhanden || [];
        if (!projektId) return fehler('Das Projekt fehlt.');
        var e = quelleOk(m.quelle); if (e) return fehler(e);
        var meine = vorhanden.filter(function (f) { return D && D.istBild(f); });
        if (meine.length >= GRENZEN.maxProProjekt) return fehler('Ein Projekt kann höchstens ' + GRENZEN.maxProProjekt + ' Fotos haben. Entferne zuerst eines.');
        if (vorhanden.length >= (D ? D.GRENZEN.maxDateien : 40)) return fehler('Das Projekt hat schon die höchste Zahl an Dateien.');
        var summe = meine.reduce(function (s, f) { return s + (f.bytes || 0); }, 0);
        if (summe + blob.size > GRENZEN.maxProjektByte) return fehler('Die Fotos dieses Projekts würden ' + Math.round((summe + blob.size) / 100000) / 10 + ' MB groß; erlaubt sind ' + GRENZEN.maxProjektByte / 1000000 + ' MB. Entferne ein Foto.');
        var b = await belegt();
        if (b.bytes + blob.size > GRENZEN.maxGesamtByte) return fehler('Der Fotospeicher des Studios ist voll (' + Math.round(b.bytes / 1000000) + ' von ' + GRENZEN.maxGesamtByte / 1000000 + ' MB). Lösche ein Projekt mit Fotos.');
        var belegtP = {}; vorhanden.forEach(function (f) { if (f && f.pfad) belegtP[f.pfad] = true; });
        var pfad = sichererName(m.name, ENDUNG[m.mime], belegtP), id = neueId(), daten;
        try { daten = await blob.arrayBuffer(); } catch (x) { return fehler('Das Bild konnte nicht gelesen werden.'); }
        try { await impl.speicher.setze({ id: id, projektId: projektId, mime: m.mime, bytes: blob.size, w: m.w, h: m.h, erstellt: Date.now(), quelle: saubereQuelle(m.quelle), daten: daten }); }
        catch (x) { return fehler(istQuotaFehler(x) ? 'Auf dem Handy ist nicht genug Speicher frei, um das Foto zu sichern.' : 'Das Foto konnte nicht gespeichert werden (Browser-Speicher nicht verfügbar).'); }
        return { ok: true, eintrag: { pfad: pfad, inhalt: '', bildId: id, mime: m.mime, bytes: blob.size, w: m.w, h: m.h, quelle: saubereQuelle(m.quelle) } };
    }

    /* Eigenes Foto vom Handy */
    async function hinzufuegen(projektId, datei, opt) {
        if (!impl.verfuegbar()) return fehler('Dieser Browser kann Fotos hier nicht speichern.');
        if (!datei || typeof datei.slice !== 'function' || typeof datei.size !== 'number') return fehler('Es wurde kein Foto gewählt.');
        if (datei.size === 0) return fehler('Die Datei ist leer.');
        if (datei.size > GRENZEN.maxEingabeByte) return fehler('Die Datei ist mit ' + Math.round(datei.size / 1000000) + ' MB zu groß (höchstens ' + GRENZEN.maxEingabeByte / 1000000 + ' MB).');
        var v = await verkleinere(datei); if (!v.ok) return v;
        var r = await speichereBlob(projektId, v.blob, { name: datei.name, mime: v.mime, w: v.w, h: v.h, quelle: { art: 'eigen' } }, opt);
        if (r.ok) r.original = v.original;
        return r;
    }

    /* Lizenzierte Web-Bilder und KI-Bilder: noch KEIN Anbieter angeschlossen. Der Weg ist vorbereitet: ein Anbieter liefert { blob, name, quelle }, und ohne Lizenz-/Herkunftsangaben wird nichts gespeichert. */
    async function ausAnbieter(art, projektId, anfrage, opt) {
        var q = QUELLEN[art];
        if (!q || art === 'eigen') return fehler('Unbekannte Bildquelle.');
        if (!q.aktiv || !q.anbieter) return fehler(q.name + ': ist noch nicht angeschlossen.');
        var r; try { r = await q.anbieter.hole(anfrage); } catch (e) { return fehler(q.name + ': Abruf fehlgeschlagen.'); }
        if (!r || !r.blob) return fehler(q.name + ': keine Antwort.');
        var datei = r.blob;
        if (datei.size > GRENZEN.maxEingabeByte) return fehler('Das Bild ist zu groß.');
        var v = await verkleinere(datei); if (!v.ok) return v;
        return speichereBlob(projektId, v.blob, { name: r.name || art, mime: v.mime, w: v.w, h: v.h, quelle: Object.assign({}, r.quelle, { art: art }) }, opt);
    }

    /* ---------- Lesen ---------- */
    async function hole(id) { try { return (await impl.speicher.hole(id)) || null; } catch (e) { return null; } }
    async function dataUrl(id) {
        var r = await hole(id); if (!r || !r.daten) return '';
        return 'data:' + r.mime + ';base64,' + zuB64(new Uint8Array(r.daten));
    }
    async function entferne(id) { try { await impl.speicher.loesche(id); return true; } catch (e) { return false; } }
    var FEHLT = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect width="400" height="240" fill="#ccc"/><text x="200" y="125" text-anchor="middle" font-family="sans-serif" font-size="20" fill="#555">Foto fehlt</text></svg>');
    async function fuerVorschau(dateien) {
        var karte = {}, fehlend = [], D = window.jvStudioDateien;
        var liste = D ? D.bilderListe(dateien) : [];
        for (var i = 0; i < liste.length; i++) {
            var u = ''; try { u = await dataUrl(liste[i].bildId); } catch (e) { }
            if (u) karte[liste[i].pfad] = u; else { karte[liste[i].pfad] = FEHLT; fehlend.push(liste[i].pfad); }
        }
        return { karte: karte, fehlend: fehlend };
    }
    async function fuerZip(dateien) {
        var fehlend = [], aus = [], D = window.jvStudioDateien;
        for (var i = 0; i < (dateien || []).length; i++) {
            var f = dateien[i];
            if (!D || !D.istBild(f)) { aus.push(f); continue; }
            var r = await hole(f.bildId);
            if (!r || !r.daten) { fehlend.push(f.pfad); continue; }
            aus.push({ pfad: f.pfad, inhalt: new Uint8Array(r.daten) });
        }
        var nw = nachweis(dateien);
        if (nw) aus.push({ pfad: 'bilder/NACHWEIS.txt', inhalt: nw });
        return { dateien: aus, fehlend: fehlend };
    }
    function nachweis(dateien) {
        var D = window.jvStudioDateien, z = [];
        (D ? D.bilderListe(dateien) : []).forEach(function (f) {
            var q = f.quelle; if (!q || q.art === 'eigen') return;
            z.push(f.pfad + ': ' + (q.name || q.art) + (q.urheber ? ', Urheber: ' + q.urheber : '') + (q.lizenz ? ', Lizenz: ' + q.lizenz : '') + (q.lizenzUrl ? ' (' + q.lizenzUrl + ')' : '') + (q.herkunftUrl ? ', Quelle: ' + q.herkunftUrl : '') + (q.anbieter ? ', Anbieter: ' + q.anbieter : '') + (q.modell ? ', Modell: ' + q.modell : ''));
        });
        return z.length ? 'Bildnachweis\n\n' + z.join('\n') + '\n' : '';
    }

    /* ---------- Aufräumen ---------- */
    /* listen: Dateilisten, die ein Projekt noch braucht (aktuelle Fassung und die Fassung davor) */
    async function raeumeAuf(projektId, listen) {
        var D = window.jvStudioDateien, noetig = {}, weg = 0;
        (listen || []).forEach(function (l) { (D ? D.bilderListe(l) : []).forEach(function (f) { noetig[f.bildId] = true; }); });
        var b = await belegt();
        for (var i = 0; i < b.liste.length; i++) if (b.liste[i].projektId === projektId && !noetig[b.liste[i].id]) { if (await entferne(b.liste[i].id)) weg++; }
        return weg;
    }
    async function loescheProjekt(projektId) {
        var b = await belegt(), n = 0;
        for (var i = 0; i < b.liste.length; i++) if (b.liste[i].projektId === projektId) { if (await entferne(b.liste[i].id)) n++; }
        return n;
    }
    /* Dauerhafter Speicher: bittet den Browser, die Fotos nicht ungefragt zu löschen (Android Chrome entscheidet selbst, ob er zustimmt) */
    async function dauerhaft() {
        try { if (navigator.storage && navigator.storage.persist) return !!(await navigator.storage.persist()); } catch (e) { }
        return false;
    }
    async function platzInfo() {
        try { if (navigator.storage && navigator.storage.estimate) { var e = await navigator.storage.estimate(); return { belegt: e.usage || 0, frei: Math.max(0, (e.quota || 0) - (e.usage || 0)) }; } } catch (e) { }
        return null;
    }

    window.jvStudioBilder = {
        GRENZEN: GRENZEN, QUELLEN: QUELLEN, verfuegbar: verfuegbar, hinzufuegen: hinzufuegen, ausAnbieter: ausAnbieter, registriereAnbieter: registriereAnbieter,
        hole: hole, dataUrl: dataUrl, entferne: entferne, fuerVorschau: fuerVorschau, fuerZip: fuerZip, raeumeAuf: raeumeAuf, loescheProjekt: loescheProjekt,
        verbrauch: verbrauch, nachweis: nachweis, dauerhaft: dauerhaft, platzInfo: platzInfo, FEHLT: FEHLT,
        planeGroesse: planeGroesse, erkenneTyp: erkenneTyp, sichererName: sichererName, leiter: leiter, _setze: _setze, _verkleinere: verkleinere
    };
})();
