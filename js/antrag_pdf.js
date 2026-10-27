/* ============================================================
   ANTRAG-PDF: Formulare mit echten Eingabefeldern (zum Beispiel der Jobcenter-Hauptantrag der Bundesagentur für Arbeit) werden DIREKT
   ausgefüllt. Es wird nichts geraten: Feldnamen, Nummern und Beschreibungen stehen in der PDF-Datei selbst (Tooltip "21 - Geben Sie Ihre ...").
   Ja/Nein-Auswahl: welcher Knopf "Ja" und welcher "Nein" ist, liest Jarvis vom Text NEBEN dem Knopf (nicht aus der Reihenfolge).
   Ist ein Knopf nicht eindeutig lesbar, bleibt das Feld "manuell" (der Nutzer kreuzt es selbst an). Unterschrift und ihr Datum bleiben immer leer.
   Teil 1 (baue): reine Rechnung ohne Bibliothek, aus einer Rohliste der Felder und dem Text der Seiten (in tests/lauf.js mit dem echten Formular geprüft).
   Teil 2 (roh, fuellen): pdf-lib (wird bei Bedarf von jsDelivr geladen) liest und schreibt die Felder; pdf.js liefert den Text der Seiten (loadPdfJs, photo.js).
   Nach dem Schreiben liest Jarvis die gespeicherte Datei wieder ein und vergleicht jedes Feld mit dem Gewollten ("Kontrolle").
   Braucht: photo.js (loadPdfJs). Wird von antrag.js benutzt (window.jvAntragPdf).
   ============================================================ */
(function () {
    'use strict';
    const PDFLIB_URL = 'https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js';
    let ladeLib = null;
    function ladePdfLib() {
        if (typeof window.PDFLib !== 'undefined' && window.PDFLib) return Promise.resolve(window.PDFLib);
        if (!ladeLib) ladeLib = new Promise((res, rej) => {
            const s = document.createElement('script'); s.src = PDFLIB_URL;
            s.onload = () => window.PDFLib ? res(window.PDFLib) : rej(new Error('PDF-Bibliothek fehlt'));
            s.onerror = () => { ladeLib = null; rej(new Error('PDF-Bibliothek nicht ladbar')); };
            document.head.appendChild(s);
        });
        return ladeLib;
    }

    /* ---------- Teil 1: reine Rechnung ---------- */
    function artVonName(name) {
        if (/^date/i.test(name)) return 'datum';
        if (/IBAN/i.test(name)) return 'iban';
        if (/StID/i.test(name)) return 'steuerid';
        if (/Plz$/i.test(name)) return 'plz';
        if (/Tel$/i.test(name)) return 'telefon';
        if (/^numf/i.test(name)) return 'zahl';
        return 'text';
    }
    function tooltipTeile(tt) {
        const t = String(tt || '').replace(/\s+/g, ' ').trim();
        const m = t.match(/^(\d+)\s*-\s*(.*)$/);
        return { nr: m ? m[1] : '', rest: m ? m[2] : t };
    }
    function bezeichnungUndHinweis(rest) {
        const teile = rest.split(' - ').map(s => s.trim()).filter(Boolean);
        if (teile.length <= 1) return { bezeichnung: teile[0] || '', hinweis: '' };
        const hinweis = [];
        let bez = teile[0];
        teile.slice(1).forEach((t, i) => { if (i === 0 && /TT\.MM\.JJJJ|22-stellig/.test(t)) bez += ' – ' + t; else hinweis.push(t); });
        return { bezeichnung: bez, hinweis: hinweis.join(' ') };
    }
    // Text rechts neben einem Knopf: nächstes Textstück, das mit Ja oder Nein beginnt (sonst das nächste Textstück)
    function labelRechts(items, rect) {
        const rechts = rect.x + rect.w;
        const nah = (items || []).filter(it => it && String(it.s || '').trim() && it.x >= rechts - 3 && it.x <= rechts + 60 && it.y >= rect.y - 5 && it.y <= rect.y + rect.h + 5)
            .sort((a, b) => (a.x - rechts) - (b.x - rechts));
        const jn = nah.find(it => /^(?:ja|nein)\b/i.test(String(it.s).trim()));
        if (jn) return /^ja\b/i.test(String(jn.s).trim()) ? 'Ja' : 'Nein';
        return nah.length ? String(nah[0].s).trim().slice(0, 60) : '';
    }
    /* roh: [{ name, typ: 'text'|'radio'|'check', tooltip, maxLen, widgets: [{ seite (1-basiert), rect: {x,y,w,h}, wert }] }]
       seitenItems: Liste je Seite von [{ s, x, y, w }] (Text mit Position, PDF-Koordinaten) */
    function baue(roh, seitenItems) {
        const out = [], gruppen = {};
        roh.forEach((r, idx) => {
            const { nr, rest } = tooltipTeile(r.tooltip);
            const seite = (r.widgets && r.widgets[0] && r.widgets[0].seite) || 1;
            if (r.typ === 'text') {
                const hb = bezeichnungUndHinweis(rest || r.name);
                const art = (/^date/i.test(r.name) && /unterschrift/i.test(rest)) ? 'unterschrift' : artVonName(r.name);
                out.push({ id: r.name, nr, bezeichnung: hb.bezeichnung, hinweis: hb.hinweis, art, optionen: [], pflicht: null, unsicher: false, seite, _o: idx,
                    acro: { typ: 'text', name: r.name, maxLen: r.maxLen || 0 } });
            } else if (r.typ === 'radio') {
                const hb = bezeichnungUndHinweis(rest || r.name);
                const opt = (r.widgets || []).map(w => ({ wert: w.wert, label: labelRechts((seitenItems[w.seite - 1] || []), w.rect) }));
                const eindeutig = opt.length >= 2 && opt.every(o => o.label) && new Set(opt.map(o => o.label)).size === opt.length;
                const jn = eindeutig && opt.length === 2 && opt.every(o => o.label === 'Ja' || o.label === 'Nein');
                out.push({ id: r.name, nr, bezeichnung: hb.bezeichnung, hinweis: hb.hinweis, art: jn ? 'ja_nein' : (eindeutig ? 'auswahl' : 'manuell'),
                    optionen: jn ? [] : opt.map(o => o.label), pflicht: null, unsicher: false, seite, _o: idx, acro: { typ: 'radio', name: r.name, optionen: opt } });
            } else if (r.typ === 'check') {
                const m = rest.match(/^Option\s+(\d+)\s+von\s+(\d+)\s*-\s*(.*)$/);
                if (!m) {   // einzelnes Kästchen
                    out.push({ id: r.name, nr, bezeichnung: rest || r.name, hinweis: '', art: 'mehrfach', optionen: [rest || r.name], pflicht: false, unsicher: false, seite, _o: idx,
                        acro: { typ: 'check', boxen: [{ name: r.name, label: rest || r.name }] } });
                    return;
                }
                const teile = m[3].split(' - ').map(s => s.trim());
                const frage = teile[0], label = teile[1] || teile[0], hinweis = teile.slice(2).join(' ');
                const key = 'grp' + (nr || r.name);
                if (!gruppen[key]) {
                    gruppen[key] = { id: key, nr, bezeichnung: frage, hinweis: '', art: 'mehrfach', optionen: [], pflicht: false, unsicher: false, seite, _o: idx, acro: { typ: 'check', boxen: [] } };
                    out.push(gruppen[key]);
                }
                const g = gruppen[key];
                g.optionen.push(label.slice(0, 160)); g.acro.boxen.push({ name: r.name, label: label.slice(0, 160) });
                if (hinweis && !g.hinweis.includes(hinweis)) g.hinweis = (g.hinweis ? g.hinweis + ' ' : '') + hinweis.slice(0, 160);
            }
        });
        Object.keys(gruppen).forEach(k => { const g = gruppen[k]; if (!/\b(?:welche|welchen)\b/i.test(g.bezeichnung)) g.art = 'auswahl'; });   // "Geben Sie Ihren Familienstand an" = eine Wahl, "welche Leistungen" = mehrere
        out.sort((a, b) => (Number(a.nr || 9999) - Number(b.nr || 9999)) || (a._o - b._o));
        out.forEach(f => { delete f._o; });
        return out;
    }
    function sauber(text, kannEncoden) {   // Zeichen, die die Standardschrift nicht kennt, ersetzen und melden
        let s = String(text == null ? '' : text).normalize('NFC'), bad = [];
        if (!kannEncoden) return { text: s, bad };
        s = Array.from(s).map(ch => { try { kannEncoden(ch); return ch; } catch (e) { bad.push(ch); return '?'; } }).join('');
        return { text: s, bad };
    }

    /* ---------- Teil 2: pdf-lib / pdf.js ---------- */
    async function roh(PDFLib, doc) {
        const { PDFName, PDFTextField, PDFRadioGroup, PDFCheckBox } = PDFLib;
        const seitenRefs = doc.getPages().map(p => String(p.ref));
        const fallback = {};
        doc.getPages().forEach((p, i) => { try { const a = p.node.Annots(); if (a) for (let k = 0; k < a.size(); k++) fallback[String(a.get(k))] = i + 1; } catch (e) { } });
        const seiteVon = w => {
            try { const P = w.P(); if (P) { const i = seitenRefs.indexOf(String(P)); if (i >= 0) return i + 1; } } catch (e) { }
            try { return fallback[String(doc.context.getObjectRef(w.dict))] || 1; } catch (e) { return 1; }
        };
        const out = [];
        doc.getForm().getFields().forEach(f => {
            const typ = f instanceof PDFTextField ? 'text' : f instanceof PDFRadioGroup ? 'radio' : f instanceof PDFCheckBox ? 'check' : '';
            if (!typ) return;
            let tooltip = ''; try { const tu = f.acroField.dict.lookup(PDFName.of('TU')); tooltip = tu && tu.decodeText ? tu.decodeText() : ''; } catch (e) { }
            const widgets = f.acroField.getWidgets().map(w => {
                const r = w.getRectangle(); let wert = '';
                try { const on = w.getOnValue(); wert = on ? String(on.asString()).replace(/^\//, '') : ''; } catch (e) { }
                return { seite: seiteVon(w), rect: { x: r.x, y: r.y, w: r.width, h: r.height }, wert };
            });
            let maxLen = 0; try { maxLen = typ === 'text' ? (f.getMaxLength() || 0) : 0; } catch (e) { }
            out.push({ name: f.getName(), typ, tooltip, maxLen, widgets });
        });
        return out;
    }
    async function seitenText(pdfjs, bytes) {
        const pdf = await pdfjs.getDocument({ data: bytes.slice() }).promise, res = [];
        for (let n = 1; n <= pdf.numPages; n++) {
            const tc = await (await pdf.getPage(n)).getTextContent();
            res.push(tc.items.filter(i => i && i.str != null && i.transform).map(i => ({ s: i.str, x: i.transform[4], y: i.transform[5], w: i.width || 0 })));
        }
        return res;
    }
    /* Liest die Felder einer PDF-Datei. Ergebnis: { bytes, felder } oder null, wenn die Datei (kaum) Eingabefelder hat. */
    async function felder(file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const PDFLib = await ladePdfLib();
        let doc; try { doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false }); } catch (e) { return null; }
        const r = await roh(PDFLib, doc);
        if (r.length < 5) return null;
        const pdfjs = await loadPdfJs();
        const items = await seitenText(pdfjs, bytes);
        return { bytes, felder: baue(r, items) };
    }
    /* Schreibt die Werte ins Formular. werte: { feldId: Text | 'Ja'/'Nein'/Auswahltext | [Optionstexte] }. Ergebnis: { bytes, kontrolle: { ok, falsch: [..] }, warnungen: [..] } */
    async function fuellen(bytes, felderListe, werte) {
        const PDFLib = await ladePdfLib();
        const doc = await PDFLib.PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
        const form = doc.getForm(), font = await doc.embedFont(PDFLib.StandardFonts.Helvetica);
        const kann = ch => font.encodeText(ch);
        const warnungen = [], soll = [];
        felderListe.forEach(f => {
            if (!f.acro || f.art === 'unterschrift' || f.art === 'manuell') return;
            const v = werte[f.id];
            if (v == null || v === '' || (Array.isArray(v) && !v.length && f.acro.typ !== 'check')) return;
            try {
                if (f.acro.typ === 'text') {
                    const s = sauber(String(v).trim(), kann);
                    if (s.bad.length) warnungen.push('Feld ' + (f.nr || f.id) + ': Zeichen ' + s.bad.join(' ') + ' kann die PDF-Schrift nicht und wurde durch ? ersetzt.');
                    let t = s.text; if (f.acro.maxLen && t.length > f.acro.maxLen) { warnungen.push('Feld ' + (f.nr || f.id) + ': Text ist länger als erlaubt (' + f.acro.maxLen + ') und wurde gekürzt.'); t = t.slice(0, f.acro.maxLen); }
                    form.getTextField(f.acro.name).setText(t); soll.push({ f, t });
                } else if (f.acro.typ === 'radio') {
                    const opt = f.acro.optionen.find(o => o.label === v);
                    if (!opt) { warnungen.push('Feld ' + (f.nr || f.id) + ': Auswahl "' + v + '" nicht gefunden.'); return; }
                    form.getRadioGroup(f.acro.name).select(opt.wert); soll.push({ f, t: opt.wert });
                } else if (f.acro.typ === 'check') {
                    const gewaehlt = Array.isArray(v) ? v : [v];
                    f.acro.boxen.forEach(b => { const cb = form.getCheckBox(b.name); if (gewaehlt.includes(b.label)) cb.check(); else cb.uncheck(); });
                    soll.push({ f, t: gewaehlt });
                }
            } catch (e) { warnungen.push('Feld ' + (f.nr || f.id) + ' konnte nicht geschrieben werden: ' + String(e && e.message).slice(0, 80)); }
        });
        try { form.updateFieldAppearances(font); } catch (e) { warnungen.push('Anzeige der Felder konnte nicht erneuert werden.'); }
        try { form.acroForm.dict.set(PDFLib.PDFName.of('NeedAppearances'), PDFLib.PDFBool.True); } catch (e) { }
        const neu = await doc.save();
        // Kontrolle: gespeicherte Datei neu einlesen und jedes Feld mit dem Gewollten vergleichen
        const falsch = [];
        try {
            const d2 = await PDFLib.PDFDocument.load(neu, { ignoreEncryption: true, updateMetadata: false }), f2 = d2.getForm();
            soll.forEach(({ f, t }) => {
                try {
                    if (f.acro.typ === 'text') { if ((f2.getTextField(f.acro.name).getText() || '') !== t) falsch.push(f.nr || f.id); }
                    else if (f.acro.typ === 'radio') { if (f2.getRadioGroup(f.acro.name).getSelected() !== t) falsch.push(f.nr || f.id); }
                    else if (f.acro.typ === 'check') { f.acro.boxen.forEach(b => { if (f2.getCheckBox(b.name).isChecked() !== t.includes(b.label)) falsch.push((f.nr || f.id) + ' ' + b.label); }); }
                } catch (e) { falsch.push(f.nr || f.id); }
            });
        } catch (e) { warnungen.push('Die Kontrolle der gespeicherten Datei hat nicht geklappt.'); falsch.push('(Kontrolle nicht möglich)'); }
        return { bytes: neu, kontrolle: { anzahl: soll.length, falsch }, warnungen };
    }

    window.jvAntragPdf = { felder, fuellen, baue, labelRechts, tooltipTeile, artVonName, sauber, bezeichnungUndHinweis };
})();
