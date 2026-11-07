/* ============================================================
   JARVIS STUDIO - DATEIEN: echte Dateien erzeugen und Projektdateien prüfen. Reine Funktionen, kein Netz, kein Speicher, keine Oberfläche.
   window.jvStudioDateien:
     zip(dateien)              -> Uint8Array   ZIP ohne Kompression ("store"), UTF-8-Namen, CRC32. dateien = [{ pfad, inhalt: string|Uint8Array }]
     docx(doc)                 -> Uint8Array   echtes Word-Dokument.  doc = { titel, untertitel?, abschnitte:[{ ueberschrift?, absaetze?:[text], liste?:[text], tabelle?:{ kopf:[..], zeilen:[[..]] } }], quellen?:[{ titel, url }] }
     pptx(deck)                -> Uint8Array   echte PowerPoint-Datei. deck = { titel, untertitel?, folien:[{ titel, punkte?:[text], notiz? }] }
     pruefeProjekt(dateien)    -> { ok, fehler:[..], warnungen:[..], bytes }   Grenzen und Namen für Web-Projekte (nur Textdateien)
     pruefeVerweise(dateien)   -> { ok, fehler:[..] }   Bilder/Skripte/Stile/Links: fremde Adressen, fehlende Dateien, tote Anker
     ersetzeBilder(dateien)    -> { dateien, anzahl }  kaputte <img> durch Inline-SVG-Fläche ersetzen (letzte Rückfalllösung)
     vorschauHtml(dateien)     -> string       ein einzelnes HTML (CSS/JS eingebettet) mit strenger Content-Security-Policy (kein Netz) für ein abgeschottetes iframe
     esc(text)                 HTML maskieren
   Sicherheit: erzeugter Code wird hier NIE ausgeführt. Die Vorschau gehört in ein iframe mit sandbox="allow-scripts" (ohne allow-same-origin).
   ============================================================ */
(function () {
    'use strict';
    if (window.jvStudioDateien) return;

    var GRENZEN = { maxDateien: 40, maxDateiByte: 400000, maxGesamtByte: 1200000 };
    var ERLAUBT = ['html', 'css', 'js', 'json', 'svg', 'txt', 'md'];
    var PFAD_RX = /^[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)*$/;

    var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
    function utf8(s) {
        if (s instanceof Uint8Array) return s;
        s = String(s == null ? '' : s);
        if (enc) return enc.encode(s);
        var out = [];   // Rückfall ohne TextEncoder
        for (var i = 0; i < s.length; i++) {
            var c = s.charCodeAt(i);
            if (c >= 0xD800 && c < 0xDC00 && i + 1 < s.length) { c = 0x10000 + ((c - 0xD800) << 10) + (s.charCodeAt(++i) - 0xDC00); }
            if (c < 0x80) out.push(c);
            else if (c < 0x800) out.push(0xC0 | (c >> 6), 0x80 | (c & 63));
            else if (c < 0x10000) out.push(0xE0 | (c >> 12), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
            else out.push(0xF0 | (c >> 18), 0x80 | ((c >> 12) & 63), 0x80 | ((c >> 6) & 63), 0x80 | (c & 63));
        }
        return new Uint8Array(out);
    }
    function esc(t) { return String(t == null ? '' : t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
    /* Zeichen, die in XML 1.0 verboten sind, entfernen (sonst öffnet Word die Datei nicht) */
    function xml(t) { return esc(String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')); }

    /* ---------- ZIP (store) ---------- */
    var CRC = (function () { var t = new Uint32Array(256); for (var n = 0; n < 256; n++) { var c = n; for (var k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); t[n] = c >>> 0; } return t; })();
    function crc32(b) { var c = 0xFFFFFFFF; for (var i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
    function zip(dateien) {
        var teile = [], zentral = [], offset = 0, anzahl = 0;
        var d = new Date(), dosZeit = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xFFFF;
        var dosDatum = ((Math.max(0, d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
        (dateien || []).forEach(function (f) {
            var name = utf8(String(f.pfad)), daten = utf8(f.inhalt), crc = crc32(daten);
            var lh = new DataView(new ArrayBuffer(30));
            lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
            lh.setUint16(10, dosZeit, true); lh.setUint16(12, dosDatum, true); lh.setUint32(14, crc, true);
            lh.setUint32(18, daten.length, true); lh.setUint32(22, daten.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
            teile.push(new Uint8Array(lh.buffer), name, daten);
            var ch = new DataView(new ArrayBuffer(46));
            ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
            ch.setUint16(12, dosZeit, true); ch.setUint16(14, dosDatum, true); ch.setUint32(16, crc, true);
            ch.setUint32(20, daten.length, true); ch.setUint32(24, daten.length, true); ch.setUint16(28, name.length, true);
            ch.setUint32(42, offset, true);
            zentral.push(new Uint8Array(ch.buffer), name);
            offset += 30 + name.length + daten.length; anzahl++;
        });
        var zentralLaenge = 0; zentral.forEach(function (z) { zentralLaenge += z.length; });
        var ende = new DataView(new ArrayBuffer(22));
        ende.setUint32(0, 0x06054b50, true); ende.setUint16(8, anzahl, true); ende.setUint16(10, anzahl, true);
        ende.setUint32(12, zentralLaenge, true); ende.setUint32(16, offset, true);
        var alle = teile.concat(zentral, [new Uint8Array(ende.buffer)]), gesamt = 0;
        alle.forEach(function (a) { gesamt += a.length; });
        var out = new Uint8Array(gesamt), pos = 0;
        alle.forEach(function (a) { out.set(a, pos); pos += a.length; });
        return out;
    }

    /* ---------- Word (docx) ---------- */
    var NS_W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';
    function wP(text, stil, extra) {
        return '<w:p><w:pPr>' + (stil ? '<w:pStyle w:val="' + stil + '"/>' : '') + (extra || '') + '</w:pPr><w:r><w:t xml:space="preserve">' + xml(text) + '</w:t></w:r></w:p>';
    }
    function wTabelle(t) {
        var zeile = function (zellen, kopf) {
            return '<w:tr>' + zellen.map(function (z) {
                return '<w:tc><w:tcPr><w:tcW w:w="0" w:type="auto"/>' + (kopf ? '<w:shd w:val="clear" w:color="auto" w:fill="D9E2F3"/>' : '') + '</w:tcPr><w:p><w:r>' + (kopf ? '<w:rPr><w:b/></w:rPr>' : '') + '<w:t xml:space="preserve">' + xml(z) + '</w:t></w:r></w:p></w:tc>';
            }).join('') + '</w:tr>';
        };
        var rand = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) { return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="808080"/>'; }).join('');
        return '<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:tblBorders>' + rand + '</w:tblBorders></w:tblPr>' +
            zeile(t.kopf || [], true) + (t.zeilen || []).map(function (z) { return zeile(z, false); }).join('') + '</w:tbl><w:p/>';
    }
    function docx(doc) {
        doc = doc || {};
        var body = wP(doc.titel || 'Dokument', 'Title');
        if (doc.untertitel) body += wP(doc.untertitel, 'Subtitle');
        (doc.abschnitte || []).forEach(function (a) {
            if (a.ueberschrift) body += wP(a.ueberschrift, 'Heading1');
            (a.absaetze || []).forEach(function (t) { body += wP(t); });
            (a.liste || []).forEach(function (t) { body += wP('• ' + t, null, '<w:ind w:left="567" w:hanging="283"/>'); });
            if (a.tabelle && a.tabelle.kopf && a.tabelle.kopf.length) body += wTabelle(a.tabelle);
        });
        if (doc.quellen && doc.quellen.length) {
            body += wP('Quellen', 'Heading1');
            doc.quellen.forEach(function (q, i) { body += wP((i + 1) + '. ' + (q.titel || q.url || '') + (q.url ? ' – ' + q.url : '')); });
        }
        var stil = function (id, name, gross, fett, farbe) {
            return '<w:style w:type="paragraph" w:styleId="' + id + '"><w:name w:val="' + name + '"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:spacing w:before="' + (gross > 30 ? 0 : 240) + '" w:after="120"/></w:pPr><w:rPr>' + (fett ? '<w:b/>' : '') + '<w:color w:val="' + farbe + '"/><w:sz w:val="' + gross + '"/></w:rPr></w:style>';
        };
        var styles = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ' + NS_W + '><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/><w:lang w:val="de-DE"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>' +
            '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/></w:style>' +
            stil('Title', 'Title', 48, true, '1F3864') + stil('Subtitle', 'Subtitle', 28, false, '595959') + stil('Heading1', 'heading 1', 32, true, '2F5496') + '</w:styles>';
        return zip([
            { pfad: '[Content_Types].xml', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>' },
            { pfad: '_rels/.rels', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>' },
            { pfad: 'docProps/core.xml', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xml(doc.titel || 'Dokument') + '</dc:title><dc:creator>Jarvis</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>' },
            { pfad: 'word/_rels/document.xml.rels', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>' },
            { pfad: 'word/styles.xml', inhalt: styles },
            { pfad: 'word/document.xml', inhalt: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ' + NS_W + '><w:body>' + body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1417" w:right="1417" w:bottom="1134" w:left="1417" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>' }
        ]);
    }

    /* ---------- PowerPoint (pptx) ---------- */
    var NS_P = 'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"';
    var REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/';
    var HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
    var B = 12192000, H = 6858000;   // 16:9 in EMU
    function rels(liste) { return HEAD + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' + liste.map(function (r) { return '<Relationship Id="' + r[0] + '" Type="' + REL + r[1] + '" Target="' + r[2] + '"/>'; }).join('') + '</Relationships>'; }
    function textBox(id, name, x, y, w, h, absaetze, gross, farbe, fett, aufzaehlung) {
        var ps = absaetze.map(function (t) {
            return '<a:p>' + (aufzaehlung ? '<a:pPr marL="342900" indent="-342900"><a:buFont typeface="Arial"/><a:buChar char="&#8226;"/></a:pPr>' : '<a:pPr><a:buNone/></a:pPr>') +
                '<a:r><a:rPr lang="de-DE" sz="' + gross + '"' + (fett ? ' b="1"' : '') + ' dirty="0"><a:solidFill><a:srgbClr val="' + farbe + '"/></a:solidFill></a:rPr><a:t>' + xml(t) + '</a:t></a:r></a:p>';
        }).join('');
        return '<p:sp><p:nvSpPr><p:cNvPr id="' + id + '" name="' + name + '"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="' + x + '" y="' + y + '"/><a:ext cx="' + w + '" cy="' + h + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/></p:spPr><p:txBody><a:bodyPr wrap="square" rtlCol="0"><a:normAutofit/></a:bodyPr><a:lstStyle/>' + ps + '</p:txBody></p:sp>';
    }
    function folie(inhalt, hintergrund) {
        return HEAD + '<p:sld ' + NS_P + '><p:cSld><p:bg><p:bgPr><a:solidFill><a:srgbClr val="' + hintergrund + '"/></a:solidFill><a:effectLst/></p:bgPr></p:bg><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>' + inhalt + '</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>';
    }
    var THEMA = HEAD + '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Jarvis"><a:themeElements><a:clrScheme name="Jarvis"><a:dk1><a:srgbClr val="000000"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="0B1F33"/></a:dk2><a:lt2><a:srgbClr val="E7ECF2"/></a:lt2><a:accent1><a:srgbClr val="1FA9D6"/></a:accent1><a:accent2><a:srgbClr val="F2A33A"/></a:accent2><a:accent3><a:srgbClr val="4CAF7A"/></a:accent3><a:accent4><a:srgbClr val="D9534F"/></a:accent4><a:accent5><a:srgbClr val="7A5CC8"/></a:accent5><a:accent6><a:srgbClr val="5B6B7B"/></a:accent6><a:hlink><a:srgbClr val="1FA9D6"/></a:hlink><a:folHlink><a:srgbClr val="7A5CC8"/></a:folHlink></a:clrScheme><a:fontScheme name="Jarvis"><a:majorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont><a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont></a:fontScheme><a:fmtScheme name="Jarvis"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="19050"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln><a:ln w="28575"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>';
    var LEERER_BAUM = '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>';
    function pptx(deck) {
        deck = deck || {};
        var folien = [{ titelfolie: true, titel: deck.titel || 'Präsentation', untertitel: deck.untertitel || '' }].concat((deck.folien || []).map(function (f) { return f; }));
        var teile = [], ct = '', pres = '', presRels = [['rId1', 'slideMaster', 'slideMasters/slideMaster1.xml'], ['rId2', 'theme', 'theme/theme1.xml']];
        folien.forEach(function (f, i) {
            var nr = i + 1, inhalt;
            if (f.titelfolie) {
                inhalt = textBox(2, 'Titel', 914400, 2200000, B - 1828800, 1400000, [f.titel], 4400, 'FFFFFF', true, false) +
                    (f.untertitel ? textBox(3, 'Untertitel', 914400, 3700000, B - 1828800, 900000, [f.untertitel], 2400, '9FD8EE', false, false) : '');
                teile.push({ pfad: 'ppt/slides/slide' + nr + '.xml', inhalt: folie(inhalt, '0B1F33') });
            } else {
                var punkte = (f.punkte || []).slice(0, 8);
                inhalt = textBox(2, 'Titel', 609600, 380000, B - 1219200, 900000, [f.titel || ''], 3200, '0B1F33', true, false) +
                    '<p:sp><p:nvSpPr><p:cNvPr id="4" name="Linie"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="609600" y="1300000"/><a:ext cx="1600000" cy="45720"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="1FA9D6"/></a:solidFill><a:ln><a:noFill/></a:ln></p:spPr></p:sp>' +
                    textBox(3, 'Inhalt', 609600, 1550000, B - 1219200, H - 2200000, punkte.length ? punkte : [''], 2200, '1F2937', false, punkte.length > 0);
                teile.push({ pfad: 'ppt/slides/slide' + nr + '.xml', inhalt: folie(inhalt, 'FFFFFF') });
            }
            teile.push({ pfad: 'ppt/slides/_rels/slide' + nr + '.xml.rels', inhalt: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml']]) });
            ct += '<Override PartName="/ppt/slides/slide' + nr + '.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>';
            presRels.push(['rId' + (i + 3), 'slide', 'slides/slide' + nr + '.xml']);
            pres += '<p:sldId id="' + (256 + i) + '" r:id="rId' + (i + 3) + '"/>';
        });
        var master = HEAD + '<p:sldMaster ' + NS_P + '><p:cSld><p:bg><p:bgRef idx="1001"><a:schemeClr val="bg1"/></p:bgRef></p:bg>' + LEERER_BAUM + '</p:cSld><p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" hlink="hlink" folHlink="folHlink"/><p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst></p:sldMaster>';
        var layout = HEAD + '<p:sldLayout ' + NS_P + ' type="blank" preserve="1"><p:cSld name="Leer">' + LEERER_BAUM + '</p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>';
        return zip([
            { pfad: '[Content_Types].xml', inhalt: HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>' + ct + '</Types>' },
            { pfad: '_rels/.rels', inhalt: rels([['rId1', 'officeDocument', 'ppt/presentation.xml']]).replace('</Relationships>', '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>') },
            { pfad: 'docProps/core.xml', inhalt: HEAD + '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>' + xml(deck.titel || 'Präsentation') + '</dc:title><dc:creator>Jarvis</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">' + new Date().toISOString().replace(/\.\d+Z$/, 'Z') + '</dcterms:created></cp:coreProperties>' },
            { pfad: 'ppt/presentation.xml', inhalt: HEAD + '<p:presentation ' + NS_P + '><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>' + pres + '</p:sldIdLst><p:sldSz cx="' + B + '" cy="' + H + '"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>' },
            { pfad: 'ppt/_rels/presentation.xml.rels', inhalt: rels(presRels) },
            { pfad: 'ppt/slideMasters/slideMaster1.xml', inhalt: master },
            { pfad: 'ppt/slideMasters/_rels/slideMaster1.xml.rels', inhalt: rels([['rId1', 'slideLayout', '../slideLayouts/slideLayout1.xml'], ['rId2', 'theme', '../theme/theme1.xml']]) },
            { pfad: 'ppt/slideLayouts/slideLayout1.xml', inhalt: layout },
            { pfad: 'ppt/slideLayouts/_rels/slideLayout1.xml.rels', inhalt: rels([['rId1', 'slideMaster', '../slideMasters/slideMaster1.xml']]) },
            { pfad: 'ppt/theme/theme1.xml', inhalt: THEMA }
        ].concat(teile));
    }

    /* ---------- Projektprüfung ---------- */
    function endung(p) { var m = /\.([a-z0-9]+)$/.exec(p); return m ? m[1] : ''; }
    function pruefeProjekt(dateien) {
        var fehler = [], warnungen = [], bytes = 0, namen = {};
        if (!Array.isArray(dateien) || !dateien.length) return { ok: false, fehler: ['Das Projekt hat keine Dateien.'], warnungen: [], bytes: 0 };
        if (dateien.length > GRENZEN.maxDateien) fehler.push('Zu viele Dateien (höchstens ' + GRENZEN.maxDateien + ').');
        dateien.forEach(function (f) {
            var p = f && typeof f.pfad === 'string' ? f.pfad : '', inh = f && f.inhalt;
            if (!PFAD_RX.test(p) || p.length > 80 || p.indexOf('..') >= 0) { fehler.push('Ungültiger Dateiname: ' + String(p).slice(0, 40)); return; }
            if (namen[p]) { fehler.push('Doppelte Datei: ' + p); return; }
            namen[p] = true;
            if (ERLAUBT.indexOf(endung(p)) < 0) { fehler.push('Dateityp nicht erlaubt: ' + p); return; }
            if (typeof inh !== 'string') { fehler.push('Inhalt fehlt: ' + p); return; }
            var n = utf8(inh).length; bytes += n;
            if (n > GRENZEN.maxDateiByte) fehler.push('Datei zu groß: ' + p);
            if (/\u0000/.test(inh)) fehler.push('Binärdaten in Textdatei: ' + p);
            if (endung(p) === 'html' || endung(p) === 'js' || endung(p) === 'svg') {
                if (/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|importScripts)\b/.test(inh)) warnungen.push(p + ': versucht Netzwerkzugriff (in Vorschau und APK blockiert).');
                if (/\beval\s*\(|new\s+Function\s*\(/.test(inh)) warnungen.push(p + ': nutzt eval/Function.');
                if (/(?:src|href)\s*=\s*["']\s*(?:https?:)?\/\//i.test(inh)) warnungen.push(p + ': lädt Inhalte von fremden Adressen (in Vorschau und APK blockiert).');
            }
        });
        if (bytes > GRENZEN.maxGesamtByte) fehler.push('Projekt zu groß (höchstens ' + Math.round(GRENZEN.maxGesamtByte / 1000) + ' KB).');
        if (!namen['index.html']) fehler.push('Es fehlt eine index.html.');
        return { ok: fehler.length === 0, fehler: fehler, warnungen: warnungen, bytes: bytes };
    }


    /* ---------- Verweisprüfung: Bilder, Skripte, Stile und Links müssen in Vorschau und APK wirklich funktionieren ----------
       Erlaubt: data:/blob:-Adressen, #anker auf vorhandene Ziele, Dateien, die im Projekt existieren (svg-Bilder, html-Seiten, css/js), mailto:/tel:/javascript:-Links.
       Fehler: fremde Adressen (http, https, //, andere Schemata), Verweise auf Dateien, die es im Projekt nicht gibt, Anker ohne Ziel, CSS-url() ohne data:. */
    function pfadAufloesen(von, ref) {
        ref = String(ref).replace(/[?#].*$/, '').trim();
        if (ref === '' || ref === '/' || ref === './') return 'index.html';
        var teile = ref.charAt(0) === '/' ? [] : String(von).split('/').slice(0, -1);
        ref.replace(/^\/+/, '').split('/').forEach(function (t) { if (t === '' || t === '.') return; if (t === '..') teile.pop(); else teile.push(t); });
        return teile.join('/');
    }
    var TAG_RX = /<(img|source|video|audio|track|embed|object|iframe|script|link|a|area|image|use|input)\b([^>]*)>/gi;
    var ATTR_RX = /(?:^|[\s"'\/])(src|href|xlink:href|poster|data|srcset)\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
    function verweisArt(tag, attr, attrs) {
        if (tag === 'a' || tag === 'area') return 'Link';
        if (tag === 'script') return 'Skript';
        if (tag === 'link') return /rel\s*=\s*["']?\s*stylesheet/i.test(attrs) ? 'Stil' : 'Ressource';
        if (tag === 'use') return 'Grafik';
        if (tag === 'input') return /type\s*=\s*["']?image/i.test(attrs) ? 'Bild' : '';
        return 'Bild';
    }
    function verweisProblem(von, art, url, karte, ids, jsText) {
        url = String(url).trim();
        if (!url || /\$\{|\{\{|["'`]\s*\+|\+\s*["'`]/.test(url)) return '';
        if (/^(data|blob):/i.test(url)) return '';
        if (art === 'Link') {
            if (/^(mailto|tel|sms|javascript):/i.test(url)) return '';
            if (url.charAt(0) === '#') {
                var id = url.slice(1); try { id = decodeURIComponent(id); } catch (e) { }
                if (id === '' || id === 'top' || ids[id] || jsText.indexOf(id) >= 0) return '';
                return 'Der Link ' + url.slice(0, 40) + ' zeigt auf ein Ziel, das es auf der Seite nicht gibt';
            }
        } else if (url.charAt(0) === '#') return '';
        if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(url)) return art + ' mit fremder Adresse (' + url.slice(0, 50) + '), dort gibt es kein Netz';
        var ziel = pfadAufloesen(von, url);
        if (karte[ziel] === undefined) return art + ' zeigt auf eine Datei, die es im Projekt nicht gibt (' + url.slice(0, 50) + ')';
        if (art === 'Bild' && endung(ziel) !== 'svg') return 'Bild ' + url.slice(0, 50) + ' ist kein SVG; Bilder nur als SVG oder data:-Adresse';
        return '';
    }
    /* Alle Bild-/Skript-/Stil-/Link-Verweise einer Datei: [{art, url, tag}] mit Problemtext (leer = in Ordnung) */
    function verweiseDerDatei(p, inh, karte, ids, jsText) {
        var aus = [], e = endung(p), m, a, tags;
        if (e === 'html' || e === 'svg' || e === 'js') {
            TAG_RX.lastIndex = 0;
            while ((m = TAG_RX.exec(inh))) {
                tags = m[2]; ATTR_RX.lastIndex = 0;
                while ((a = ATTR_RX.exec(tags))) {
                    var attr = a[1].toLowerCase(), wert = a[2] !== undefined ? a[2] : a[3], art = verweisArt(m[1].toLowerCase(), attr, tags);
                    if (!art) continue;
                    if (attr === 'srcset') { wert.split(',').forEach(function (x) { var u = x.trim().split(/\s+/)[0]; if (u) aus.push({ tag: m[0], art: art, url: u, von: e === 'js' ? 'index.html' : p }); }); continue; }
                    aus.push({ tag: m[0], art: art, url: wert, von: e === 'js' ? 'index.html' : p });
                }
            }
        }
        var css = e === 'css' ? inh : (e === 'html' ? (inh.match(/<style\b[^>]*>[\s\S]*?<\/style>/gi) || []).join('\n') + '\n' + (inh.match(/\sstyle\s*=\s*"[^"]*"/gi) || []).join('\n') : '');
        if (css) {
            var u, rx = /url\(\s*(["']?)([^)"']+)\1\s*\)/gi;
            while ((u = rx.exec(css))) { var w = u[2].trim(); if (!/^(data|blob):/i.test(w) && w.charAt(0) !== '#') aus.push({ art: 'CSS', url: w, von: p, css: true }); }
            if (/@import\b/i.test(css)) aus.push({ art: 'CSS', url: '@import', von: p, css: true });
        }
        return aus.map(function (v) {
            v.problem = v.css ? 'CSS lädt ' + v.url.slice(0, 50) + ' (nur data:-Adressen sind erlaubt)' : verweisProblem(v.von, v.art, v.url, karte, ids, jsText);
            return v;
        });
    }
    function verweisKontext(dateien) {
        var karte = {}, ids = {}, js = '';
        (dateien || []).forEach(function (f) { if (f && typeof f.pfad === 'string') karte[f.pfad] = String(f.inhalt == null ? '' : f.inhalt); });
        Object.keys(karte).forEach(function (p) {
            var e = endung(p), rx = /\b(?:id|name)\s*=\s*["']([^"']+)["']/gi, m;
            if (e === 'html' || e === 'svg') while ((m = rx.exec(karte[p]))) ids[m[1]] = true;
            if (e === 'js') js += '\n' + karte[p];
            if (e === 'html') (karte[p].match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).forEach(function (s) { js += '\n' + s; });
        });
        return { karte: karte, ids: ids, js: js };
    }
    function pruefeVerweise(dateien) {
        var k = verweisKontext(dateien), fehler = [], gesehen = {};
        Object.keys(k.karte).forEach(function (p) {
            if (['html', 'css', 'js', 'svg'].indexOf(endung(p)) < 0) return;
            verweiseDerDatei(p, k.karte[p], k.karte, k.ids, k.js).forEach(function (v) {
                if (!v.problem) return;
                var t = p + ': ' + v.problem; if (gesehen[t]) return; gesehen[t] = true; fehler.push(t);
            });
        });
        var navi = /(?:\b(?:window|document|top|parent|self)\.)?\blocation\s*(?:\.\s*(?:href|pathname)\s*=(?!=)|\.\s*(?:assign|replace)\s*\(|=(?!=)\s*["'`])/;
        Object.keys(k.karte).forEach(function (p) {
            var e = endung(p), code = e === 'js' ? k.karte[p] : e === 'html' ? (k.karte[p].match(/<script\b[^>]*>[\s\S]*?<\/script>/gi) || []).join('\n') : '';
            if (code && navi.test(code)) { var t = p + ': Seitenwechsel per Skript (location.href/assign/replace); alles liegt auf einer Seite, nutze #anker'; if (!gesehen[t]) { gesehen[t] = true; fehler.push(t); } }
        });
        return { ok: fehler.length === 0, fehler: fehler.slice(0, 8), anzahl: fehler.length };
    }
    /* Kaputte <img> (fremde Adresse, fehlende Datei, kein SVG) durch eine eigene Inline-SVG-Fläche mit der Beschriftung ersetzen. Passiert nur als letzte Rückfalllösung, nachdem die KI es einmal selbst versuchen durfte. */
    function ersetzeBilder(dateien) {
        var k = verweisKontext(dateien), anzahl = 0;
        var neu = (dateien || []).map(function (f) {
            if (!f || endung(f.pfad) !== 'html') return f;
            var inh = String(f.inhalt || '').replace(/<img\b[^>]*>/gi, function (tag) {
                var sm = /(?:^|[\s"'\/])src\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag), src = sm ? (sm[1] !== undefined ? sm[1] : sm[2]) : '';
                if (!sm || !verweisProblem(f.pfad, 'Bild', src, k.karte, k.ids, k.js)) return tag;
                var altM = /\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag), alt = (altM ? (altM[1] !== undefined ? altM[1] : altM[2]) : '').replace(/<[^>]*>/g, '').trim().slice(0, 60);
                var klasse = /\bclass\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag), idm = /\bid\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag), stil = /\bstyle\s*=\s*(?:"([^"]*)"|'([^']*)')/i.exec(tag);
                anzahl++;
                var at = function (m) { return m ? (m[1] !== undefined ? m[1] : m[2]) : ''; };
                return '<svg role="img" aria-label="' + esc(alt || 'Bild') + '" viewBox="0 0 400 240" preserveAspectRatio="xMidYMid slice"' +
                    (klasse ? ' class="' + esc(at(klasse)) + '"' : '') + (idm ? ' id="' + esc(at(idm)) + '"' : '') +
                    ' style="display:block;width:100%;height:auto;' + (stil ? esc(at(stil)).replace(/"/g, '') : '') + '">' +
                    '<rect width="400" height="240" fill="currentColor" fill-opacity=".12"/><rect x="1" y="1" width="398" height="238" fill="none" stroke="currentColor" stroke-opacity=".35" stroke-width="2"/>' +
                    '<path d="M60 170 L140 100 L200 150 L250 115 L340 170 Z" fill="currentColor" fill-opacity=".22"/><circle cx="300" cy="70" r="20" fill="currentColor" fill-opacity=".22"/>' +
                    (alt ? '<text x="200" y="210" text-anchor="middle" fill="currentColor" font-family="system-ui,sans-serif" font-size="18">' + esc(alt) + '</text>' : '') + '</svg>';
            });
            return inh === f.inhalt ? f : { pfad: f.pfad, inhalt: inh };
        });
        return { dateien: neu, anzahl: anzahl };
    }

    /* ---------- Vorschau (eine Seite, streng) ---------- */
    var CSP = "default-src 'none'; img-src data: blob:; media-src data: blob:; font-src data:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; base-uri 'none'; form-action 'none'";
    /* Links in der Vorschau: Die Vorschau hat keine eigene Adresse, ein normaler Link würde die echte Jarvis-Seite in den Rahmen laden. Darum werden alle Links abgefangen:
       #anker scrollen auf der Seite, Verweise auf die Startseite scrollen nach oben, alles andere wird mit einem Hinweis gesperrt. Formulare werden nicht abgeschickt. */
    var LINKS = '<script>(function(){var tm;function hin(t){try{var d=document.getElementById("jvHinweis");if(!d){d=document.createElement("div");d.id="jvHinweis";d.setAttribute("role","status");d.style.cssText="position:fixed;left:12px;right:12px;bottom:12px;z-index:2147483647;background:#111;color:#fff;border:1px solid #888;border-radius:10px;padding:12px 14px;font:16px/1.4 system-ui,sans-serif;text-align:center";(document.body||document.documentElement).appendChild(d)}d.textContent=t;d.style.display="block";clearTimeout(tm);tm=setTimeout(function(){d.style.display="none"},4500)}catch(e){}}' +
        'function ruhig(){try{return matchMedia("(prefers-reduced-motion: reduce)").matches}catch(e){return false}}' +
        'window.addEventListener("click",function(e){var n=e.target,a=n&&n.closest?n.closest("a[href],area[href]"):null;if(!a)return;var h=a.getAttribute("href")||"";if(/^javascript:/i.test(h))return;e.preventDefault();' +
        'var i=h.indexOf("#"),pf=(i<0?h:h.slice(0,i)).replace(/[?].*$/,""),an=i<0?"":h.slice(i+1);' +
        'if(pf===""||pf==="/"||pf==="./"||pf==="index.html"||pf==="/index.html"){if(an===""||an==="top"){scrollTo(0,0);return}try{an=decodeURIComponent(an)}catch(x){}var z=document.getElementById(an)||document.getElementsByName(an)[0];if(z&&z.scrollIntoView){z.scrollIntoView({behavior:ruhig()?"auto":"smooth",block:"start"})}else hin("Dieses Ziel gibt es auf der Seite nicht.");return}' +
        'if(/^(mailto|tel|sms):/i.test(h)){hin("E-Mail- und Telefon-Links sind in der Vorschau gesperrt.");return}' +
        'hin("Dieser Link führt aus der Vorschau hinaus und ist gesperrt. Die Vorschau zeigt nur diese eine Seite.")},true);' +
        'window.addEventListener("pagehide",function(){try{parent.postMessage({jvVorschauWeg:1},"*")}catch(e){}});' +
        'document.addEventListener("submit",function(e){if(!e.defaultPrevented){e.preventDefault();hin("Formulare werden in der Vorschau nicht abgeschickt.")}});})()</script>';
    function vorschauHtml(dateien) {
        var karte = {}; (dateien || []).forEach(function (f) { karte[f.pfad] = f.inhalt; });
        var h = String(karte['index.html'] || '');
        var norm = function (u) { return String(u).replace(/^\.\//, '').replace(/[?#].*$/, ''); };
        h = h.replace(/<link\b[^>]*rel\s*=\s*["']stylesheet["'][^>]*>/gi, function (tag) {
            var m = /href\s*=\s*["']([^"']+)["']/i.exec(tag); var pfad = m && norm(m[1]);
            return pfad && karte[pfad] !== undefined ? '<style>' + String(karte[pfad]).replace(/<\/style/gi, '<\\/style') + '</style>' : '';
        });
        h = h.replace(/<script\b([^>]*)\bsrc\s*=\s*["']([^"']+)["']([^>]*)>\s*<\/script>/gi, function (tag, a, src) {
            var pfad = norm(src);
            return karte[pfad] !== undefined ? '<script>' + String(karte[pfad]).replace(/<\/script/gi, '<\\/script') + '</script>' : '';
        });
        /* eigene SVG-Dateien des Projekts als data:-Adresse einbetten (die Vorschau lädt keine Dateien nach) */
        h = h.replace(/(<img\b[^>]*?\bsrc\s*=\s*)(["'])([^"']+)\2/gi, function (all, vor, q, src) {
            var pfad = norm(src); if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src) || endung(pfad) !== 'svg' || karte[pfad] === undefined) return all;
            return vor + q + 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(String(karte[pfad])) + q;
        });
        var meta = '<meta http-equiv="Content-Security-Policy" content="' + CSP + '">' + LINKS;
        if (/<head\b[^>]*>/i.test(h)) h = h.replace(/<head\b[^>]*>/i, function (m) { return m + meta; });
        else h = '<!doctype html><html><head><meta charset="utf-8">' + meta + '</head><body>' + h + '</body></html>';
        return h;
    }

    window.jvStudioDateien = { GRENZEN: GRENZEN, ERLAUBT: ERLAUBT, CSP: CSP, zip: zip, crc32: crc32, docx: docx, pptx: pptx, pruefeProjekt: pruefeProjekt, pruefeVerweise: pruefeVerweise, ersetzeBilder: ersetzeBilder, LINKS: LINKS, vorschauHtml: vorschauHtml, esc: esc, utf8: utf8 };
})();
