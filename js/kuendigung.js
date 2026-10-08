/* ============================================================
   KÜNDIGUNG SCHREIBEN: "Schreib mir eine Kündigung" startet ein kurzes Gespräch. Jarvis fragt nacheinander:
   Anbieter, Art des Vertrags, Kunden-/Vertragsnummer, Kündigung zum nächstmöglichen Zeitpunkt / zu einem Datum / außerordentlich (mit Grund),
   Name und Anschrift (werden fürs nächste Mal gemerkt) und die Kündigungsadresse des Anbieters (ohne Angabe bleibt eine Lücke).
   Danach steht der Brief in einem Fenster: Text lässt sich ändern, "PDF speichern" (richtige PDF-Datei), "Drucken", "Kopieren",
   "Adresse suchen" (Google-Suche nach der Kündigungsadresse des Anbieters).
   Sprache: "Schreib mir eine Kündigung", "Ich möchte meinen Vertrag kündigen", "Kündigung für Vodafone aufsetzen". Abbrechen: "Abbrechen" / "Stopp".
   Eigenständig; muss nach localcommands.js geladen werden. Ein Entwurf, keine Rechtsberatung: Jarvis sagt, dass Adresse und Frist zu prüfen sind.
   ============================================================ */
(function () {
    const PROFILE_KEY = 'jv_kuend_profil', LAST_KEY = 'jv_kuend_letzte';
    const norm = s => String(s || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();
    const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\s.,;:!?„“"]+|[\s,;:!?„“"]+$/g, '').trim();
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function loadProfile() { try { const p = JSON.parse(lsGet(PROFILE_KEY) || '{}'); return (p && typeof p === 'object') ? p : {}; } catch (e) { return {}; } }
    function saveProfile(p) { lsSet(PROFILE_KEY, JSON.stringify(p)); }
    const LIST_KEY = 'jv_kuend_liste', MAX_LIST = 5;
    function loadList() {
        try { const v = JSON.parse(lsGet(LIST_KEY) || 'null'); if (Array.isArray(v)) return v.filter(e => e && typeof e.text === 'string'); } catch (e) {}
        try { const o = JSON.parse(lsGet(LAST_KEY) || 'null'); if (o && typeof o.text === 'string') return [{ id: o.at || Date.now(), text: o.text, data: o.data || null, at: o.at || Date.now() }]; } catch (e) {}
        return [];
    }
    function loadLast() { const l = loadList(); return l.length ? l[0] : null; }
    function saveLast(text, data) {
        data = data || {};
        if (!data.id) data.id = Date.now();
        const old = loadList(), prev = old.find(e => e.id === data.id), list = old.filter(e => e.id !== data.id);
        const now = (prev && prev.text === String(text || '')) ? prev.at : Date.now();
        list.unshift({ id: data.id, text: String(text || ''), data: data, at: now });
        lsSet(LIST_KEY, JSON.stringify(list.slice(0, MAX_LIST)));
        lsSet(LAST_KEY, JSON.stringify({ text: String(text || ''), data: data, at: now }));
    }
    function deleteEntry(id) {
        const list = loadList().filter(e => e.id !== id);
        lsSet(LIST_KEY, JSON.stringify(list));
        lsSet(LAST_KEY, list.length ? JSON.stringify({ text: list[0].text, data: list[0].data, at: list[0].at }) : 'null');
    }
    function say(m) { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    /* ---------- Hilfsfunktionen für gesprochene Antworten ---------- */
    const YES = /^(?:ja|jawohl|jep|genau|stimmt|richtig|passt|korrekt|gerne|klar|okay|ok|mach das|das stimmt|so ist es)\b/;
    const NO = /^(?:nein|nee|falsch|nicht ganz|stimmt nicht|anders)\b/;
    const UNKNOWN = /(?:wei(?:ß|ss)\s.*nicht|keine ahnung|nicht zur hand|habe ich nicht|hab ich nicht|kenne ich nicht|kenn ich nicht|nicht bekannt|unbekannt|später|spaeter|egal|offen|lücke|luecke|überspring|ueberspring|^(?:nein|nee|keine|keiner|nichts)$)/;
    const CANCEL = /^(?:abbrechen|abbruch|stopp|stop|vergiss es|lass es|lass das|doch nicht|vergiss das|schluss)\b/;

    const DIGITS = { null: '0', eins: '1', ein: '1', zwei: '2', zwo: '2', drei: '3', vier: '4', fünf: '5', fuenf: '5', sechs: '6', sieben: '7', acht: '8', neun: '9' };
    const NUM_FILLER = /^(?:die|der|das|ist|meine|mein|kundennummer|kunden|vertragsnummer|vertrags|nummer|lautet|und|also|ähm|äh|buchstabe|bindestrich|strich)$/;
    function parseNumber(text) {
        const toks = String(text || '').toLowerCase().replace(/[,;:!?„“"]+/g, ' ').split(/\s+/).filter(Boolean)
            .map(t => DIGITS[t] !== undefined ? DIGITS[t] : t).filter(t => !NUM_FILLER.test(t));
        if (!toks.length) return '';
        if (toks.length > 1 && toks.every(t => /^[0-9a-zäöüß\-\/]{1,8}$/.test(t))) return toks.join('').toUpperCase();
        return toks.join(' ').toUpperCase();
    }

    const MONTHS = { januar: 1, jänner: 1, februar: 2, märz: 3, maerz: 3, april: 4, mai: 5, juni: 6, juli: 7, august: 8, september: 9, oktober: 10, november: 11, dezember: 12 };
    const pad = n => String(n).padStart(2, '0');
    function fmtDate(d) { return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
    function parseDateText(text, now) {
        now = now || new Date();
        const t = String(text || '').toLowerCase().replace(/[,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();
        let day = 0, mon = 0, yr = 0, m;
        if ((m = t.match(/(\d{1,2})\s*\.\s*(\d{1,2})\s*\.?\s*(\d{4}|\d{2})?(?!\d)/))) { day = +m[1]; mon = +m[2]; yr = m[3] ? +m[3] : 0; }
        else if ((m = t.match(/(\d{1,2})\s*\.?\s*(januar|jänner|februar|märz|maerz|april|mai|juni|juli|august|september|oktober|november|dezember)\s*(\d{4})?/))) { day = +m[1]; mon = MONTHS[m[2]]; yr = m[3] ? +m[3] : 0; }
        else if (/jahresende|ende (?:des|dieses|diesen) jahres|ende jahr|zum jahresende/.test(t)) { day = 31; mon = 12; yr = now.getFullYear(); }
        else if (/ende (?:des|dieses|diesen|nächsten|naechsten) monats|monatsende|ende monat/.test(t)) {
            const next = /nächst|naechst/.test(t); const base = new Date(now.getFullYear(), now.getMonth() + (next ? 2 : 1), 0);
            return fmtDate(base);
        }
        if (!day || !mon || day > 31 || mon > 12) return null;
        if (yr && yr < 100) yr += 2000;
        if (!yr) { yr = now.getFullYear(); if (new Date(yr, mon - 1, day) < new Date(now.getFullYear(), now.getMonth(), now.getDate())) yr++; }
        return `${pad(day)}.${pad(mon)}.${yr}`;
    }

    /* ---------- Der Brief ---------- */
    function lines(s) { return String(s || '').split(/\s*[,;\n]\s*(?=\S)/).map(x => x.trim()).filter(Boolean); }
    function cityOf(addr) { const m = String(addr || '').match(/\b\d{5}\s+([A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß\-\s]*?)\s*$/); return m ? m[1].trim() : ''; }
    function kindOf(art) {
        const a = String(art || '').toLowerCase();
        if (/strom|erdgas|\bgas|energie|fernwärme|fernwaerme/.test(a)) return 'energie';
        if (/miet|wohnung/.test(a)) return 'miete';
        if (/versicher/.test(a)) return 'vers';
        if (/internet|dsl|handy|mobil|festnetz|telefon|glasfaser|kabel|sim\b|rufnummer/.test(a)) return 'telko';
        return 'allg';
    }
    function buildLetter(d, now) {
        now = now || new Date();
        const kind = kindOf(d.art);
        const absender = [d.name || '[Ihr Name]'].concat(lines(capWords(d.adresse) || '[Ihre Anschrift]'));
        const anbL = d.anbAdresse ? lines(d.anbAdresse) : ['[Anschrift des Anbieters]'];
        if (anbL.length && d.anbieter && norm(anbL[0]) === norm(d.anbieter)) anbL.shift();
        const empf = [d.anbieter || '[Anbieter]'].concat(anbL);
        const ort = capWords(cityOf(d.adresse)), datum = fmtDate(now);
        // Vertragsart nur in Klammern, wenn der Anbietername sie nicht schon enthält (easy Fitness + Fitnessstudio -> keine Klammer)
        const anbN = norm(d.anbieter);
        const redundant = !d.art || norm(d.art).split(' ').some(w => w.length >= 5 && anbN.includes(w.slice(0, 6)));
        const art = '';   // keine Klammer mit der Vertragsart im Brief (Anbieter und Nummer genügen)
        const bei = d.anbieter ? ` bei ${d.anbieter}` : ' bei Ihnen';
        const nl = kind === 'vers' ? 'Versicherungsschein-/Vertragsnummer' : kind === 'miete' ? 'Mietvertragsnummer' : 'Kunden-/Vertragsnummer';
        const num = d.nummer ? ` mit der ${nl} ${d.nummer}` : '';
        const obj = d.objekt ? String(d.objekt) : '';
        let betreff;
        if (kind === 'miete') betreff = `Kündigung des Mietverhältnisses${obj ? ' – Wohnung ' + obj : ''}${d.nummer ? ' – ' + nl + ' ' + d.nummer : ''}`;
        else betreff = `Kündigung meines Vertrags${art}${d.anbieter ? ' bei ' + d.anbieter : ''}${d.nummer ? ' – ' + nl + ' ' + d.nummer : ''}`;
        const teil = kind === 'miete' ? `das Mietverhältnis über die Wohnung${obj ? ' ' + obj : ''}${num}` : `meinen Vertrag${art}${bei}${num}`;
        const fruehest = 'zum nächstmöglichen Zeitpunkt';
        let satz;
        if (d.modus === 'datum' && d.datum) satz = `hiermit kündige ich ${teil} ordentlich und fristgerecht zum ${d.datum}, hilfsweise zum nächstmöglichen Zeitpunkt.`;
        else if (d.modus === 'ausser') {
            const preis = /preis|erhöhung|erhoehung|teurer|beitrag/i.test(d.grund || '');
            const was = /beitrag/i.test(d.grund || '') ? 'Beitragserhöhung' : 'Preiserhöhung';
            satz = preis
                ? `hiermit kündige ich ${teil} außerordentlich unter Berufung auf mein Sonderkündigungsrecht wegen der ${was}, hilfsweise ordentlich ${fruehest}.`
                : `hiermit kündige ich ${teil} außerordentlich aus wichtigem Grund${d.grund ? ' (' + d.grund + ')' : ''}, hilfsweise ordentlich ${fruehest}.`;
        } else satz = `hiermit kündige ich ${teil} ordentlich und fristgerecht ${fruehest}.`;
        const ident = (d.nummer || d.zaehler || kind === 'miete') ? '' : ' Der Vertrag läuft auf meinen Namen und die oben genannte Anschrift.';
        // Angaben je nach Vertragsart
        const fakten = [];
        if (kind === 'energie') {
            if (obj) fakten.push('Verbrauchsstelle: ' + obj);
            if (d.zaehler) fakten.push('Zählernummer: ' + d.zaehler);
            if (d.stand) fakten.push('Zählerstand am ' + datum + ': ' + d.stand);
        } else if (kind === 'telko' && d.rufnr) fakten.push('Rufnummer: ' + d.rufnr);
        let schluss;
        if (kind === 'miete') schluss = 'Bitte bestätigen Sie mir die Kündigung sowie das Ende des Mietverhältnisses schriftlich. Bitte nennen Sie mir außerdem einen Termin für die Wohnungsübergabe und teilen Sie mir mit, wann ich die Mietkaution zurückerhalte.';
        else {
            schluss = 'Bitte bestätigen Sie mir die Kündigung sowie das Datum des Vertragsendes innerhalb von 14 Tagen schriftlich.';
            if (kind === 'energie') schluss += ' Bitte erstellen Sie nach Vertragsende die Schlussrechnung.' + (d.wechsel ? ' Mein neuer Versorger übernimmt die Belieferung und wird sich bei Ihnen melden.' : '');
            else schluss += ' Eine erteilte Einzugsermächtigung widerrufe ich mit Wirkung zum Vertragsende.';
            if (kind === 'telko' && d.mitnahme) schluss += ' Bitte geben Sie meine Rufnummer zur Mitnahme zu meinem neuen Anbieter frei.';
            schluss += ' Bitte löschen Sie nach Vertragsende außerdem meine personenbezogenen Daten, soweit keine gesetzlichen Aufbewahrungspflichten bestehen.';
        }
        return [
            absender.join('\n'), '',
            empf.join('\n'), '',
            (ort ? ort + ', ' : '') + datum, '',
            'Betreff: ' + betreff, '',
            'Sehr geehrte Damen und Herren,', '',
            satz + ident, ''
        ].concat(fakten.length ? [fakten.join('\n'), ''] : []).concat([
            schluss, '',
            'Mit freundlichen Grüßen', '', '', '',
            '____________________', d.name || '[Ihr Name]'
        ]).join('\n');
    }

    /* ---------- Eigene kleine PDF-Datei (nur Text, Schrift Helvetica, A4) ---------- */
    const HW = { 32: 278, 33: 278, 34: 355, 35: 556, 36: 556, 37: 889, 38: 667, 39: 191, 40: 333, 41: 333, 42: 389, 43: 584, 44: 278, 45: 333, 46: 278, 47: 278, 58: 278, 59: 278, 60: 584, 61: 584, 62: 584, 63: 556, 64: 1015,
        65: 667, 66: 667, 67: 722, 68: 722, 69: 667, 70: 611, 71: 778, 72: 722, 73: 278, 74: 500, 75: 667, 76: 556, 77: 833, 78: 722, 79: 778, 80: 667, 81: 778, 82: 722, 83: 667, 84: 611, 85: 722, 86: 667, 87: 944, 88: 667, 89: 667, 90: 611,
        91: 278, 92: 278, 93: 278, 94: 469, 95: 556, 96: 333, 97: 556, 98: 556, 99: 500, 100: 556, 101: 556, 102: 278, 103: 556, 104: 556, 105: 222, 106: 222, 107: 500, 108: 222, 109: 833, 110: 556, 111: 556, 112: 556, 113: 556, 114: 333, 115: 500, 116: 278, 117: 556, 118: 500, 119: 722, 120: 500, 121: 500, 122: 500, 123: 334, 124: 260, 125: 334, 126: 584 };
    for (let c = 48; c <= 57; c++) HW[c] = 556;
    function pdfByte(ch) {
        const c = ch.charCodeAt(0);
        if (c === 0x20AC) return 0x80;
        if (c === 0x2013 || c === 0x2014) return 0x2D;
        if (c === 0x201E || c === 0x201C || c === 0x201D) return 0x22;
        if (c === 0x2018 || c === 0x2019) return 0x27;
        if (c < 256) return c;
        return 0x3F;
    }
    function glyphWidth(ch) {
        const c = pdfByte(ch);
        if (HW[c]) return HW[c];
        if (c === 0x80) return 556;
        if (c === 0xDF) return 611;
        if (c === 0xC4 || c === 0xC0 || c === 0xC1 || c === 0xC2) return 667;
        if (c === 0xD6) return 778;
        if (c === 0xDC) return 722;
        return 556;
    }
    function textWidth(s, size) { let w = 0; for (const ch of s) w += glyphWidth(ch); return w * size / 1000; }
    function wrapLine(line, size, maxW) {
        if (!line) return [''];
        const out = []; let cur = '';
        line.split(' ').forEach(word => {
            const test = cur ? cur + ' ' + word : word;
            if (textWidth(test, size) <= maxW || !cur) cur = test; else { out.push(cur); cur = word; }
        });
        out.push(cur);
        return out;
    }
    function makePdf(text) {
        const W = 595, H = 842, ML = 72, MT = 780, MB = 72, SIZE = 11, LEAD = 15, maxW = W - ML * 2;
        const pages = [[]]; let y = MT;
        String(text).replace(/\r/g, '').split('\n').forEach(src => {
            wrapLine(src, SIZE, maxW).forEach(l => {
                if (y < MB) { pages.push([]); y = MT; }
                pages[pages.length - 1].push({ l, y }); y -= LEAD;
            });
        });
        const esc = s => { let o = ''; for (const ch of s) { const b = pdfByte(ch); const c = String.fromCharCode(b); o += (c === '(' || c === ')' || c === '\\') ? '\\' + c : c; } return o; };
        const objs = [];
        const n = pages.length;   // Objekte: 1 Katalog, 2 Seitenbaum, 3 Schrift, dann je Seite: Seite (4+2i) und Inhalt (5+2i)
        objs[1] = '<< /Type /Catalog /Pages 2 0 R >>';
        objs[2] = `<< /Type /Pages /Kids [${pages.map((_, i) => `${4 + 2 * i} 0 R`).join(' ')}] /Count ${n} >>`;
        objs[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>';
        pages.forEach((pg, i) => {
            const body = 'BT\n/F1 ' + SIZE + ' Tf\n' + pg.map(o => `1 0 0 1 ${ML} ${o.y} Tm (${esc(o.l)}) Tj`).join('\n') + '\nET';
            objs[4 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`;
            objs[5 + 2 * i] = `<< /Length ${body.length} >>\nstream\n${body}\nendstream`;
        });
        let out = '%PDF-1.4\n'; const offs = [];
        for (let i = 1; i < objs.length; i++) { offs[i] = out.length; out += `${i} 0 obj\n${objs[i]}\nendobj\n`; }
        const xref = out.length;
        out += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offs.slice(1).map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
        out += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
        const bytes = new Uint8Array(out.length);
        for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
        return bytes;
    }

    /* ---------- Fenster ---------- */
    let el = null, lastData = null;
    function ensureStyle() {
        if (document.getElementById('kdStyle')) return;
        const st = document.createElement('style');
        st.id = 'kdStyle';
        st.textContent =
            '#jvKuend{position:fixed;inset:0;z-index:92;background:rgba(4,9,15,.98);color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
            '#jvKuend .kd-head{padding:16px 18px 6px;text-align:center}' +
            '#jvKuend .kd-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.14em;color:#49d7ff}' +
            '#jvKuend .kd-sub{font:500 12px "IBM Plex Mono",monospace;color:#7fb8cf;margin-top:4px}' +
            '#jvKuend textarea{flex:1 1 auto;margin:8px 14px;padding:12px;border-radius:10px;border:1px solid rgba(93,209,255,.3);background:#fff;color:#111;font:15px/1.45 "Rajdhani",Arial,sans-serif;resize:none;min-height:0}' +
            '#jvKuend .kd-bar{display:grid;grid-template-columns:1fr 1fr;gap:8px;padding:6px 14px 14px}' +
            '#jvKuend .kd-btn{padding:11px 6px;border-radius:10px;border:1px solid rgba(93,209,255,.4);background:rgba(10,22,33,.95);color:#49d7ff;font:700 12px "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase}' +
            '#jvKuend .kd-btn.primary{background:rgba(73,215,255,.2);color:#fff}' +
            '#jvKuend .kd-list{flex:1 1 auto;overflow:auto;padding:8px 14px;display:flex;flex-direction:column;gap:10px;min-height:0}' +
            '#jvKuend .kd-row{display:flex;gap:8px}' +
            '#jvKuend .kd-open{flex:1 1 auto;text-align:left;text-transform:none;white-space:pre-line;font-size:13px}' +
            '#jvKuend .kd-del{flex:0 0 48px}' +
            '#jvKuendPrint{display:none}' +
            '@media print{body.jv-kuend-print>*:not(#jvKuendPrint){display:none!important}body.jv-kuend-print #jvKuendPrint{display:block!important;position:static!important;background:#fff;color:#000;white-space:pre-wrap;font:12pt/1.45 Arial,sans-serif;padding:0}}';
        document.head.appendChild(st);
    }
    function closeWin() {
        if (el) { try { el.remove(); } catch (e) {} el = null; }
        try { document.body.classList.remove('panel-open'); } catch (e) {}
        try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) {}
    }
    function fileName() { return 'Kuendigung_' + String((lastData && lastData.anbieter) || 'Vertrag').replace(/[^A-Za-z0-9ÄÖÜäöüß]+/g, '_').replace(/^_|_$/g, '') + '.pdf'; }
    function savePdf(text) {
        try {
            const bytes = makePdf(text), blob = new Blob([bytes], { type: 'application/pdf' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob); a.download = fileName();
            document.body.appendChild(a); a.click();
            setTimeout(() => { try { URL.revokeObjectURL(a.href); a.remove(); } catch (e) {} }, 4000);
            return true;
        } catch (e) { console.error('Kündigung PDF', e); return false; }
    }
    function printText(text) {
        let box = document.getElementById('jvKuendPrint');
        if (!box) { box = document.createElement('div'); box.id = 'jvKuendPrint'; document.body.appendChild(box); }
        box.textContent = text;
        document.body.classList.add('jv-kuend-print');
        const done = () => { document.body.classList.remove('jv-kuend-print'); window.removeEventListener('afterprint', done); };
        window.addEventListener('afterprint', done);
        setTimeout(() => { try { window.print(); } catch (e) { done(); } setTimeout(done, 60000); }, 150);
    }
    function openWin(text, data) {
        ensureStyle(); closeWin(); lastData = data;
        const mk = (p, tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; p.appendChild(x); return x; };
        el = document.createElement('div'); el.id = 'jvKuend';
        const head = mk(el, 'div', 'kd-head');
        mk(head, 'div', 'kd-title', 'KÜNDIGUNG');
        mk(head, 'div', 'kd-sub', 'Entwurf: Text lässt sich hier ändern');
        const ta = mk(el, 'textarea'); ta.value = text; ta.spellcheck = false;
        saveLast(text, data); ta.addEventListener('input', () => saveLast(ta.value, data));
        const bar = mk(el, 'div', 'kd-bar');
        const note = txt => { try { say(txt); } catch (e) {} };
        mk(bar, 'button', 'kd-btn primary', '📄 PDF speichern').addEventListener('click', () => { note(savePdf(ta.value) ? 'Die PDF-Datei wurde gespeichert. Sie finden sie bei den Downloads.' : 'Das PDF konnte nicht erstellt werden.'); });
        mk(bar, 'button', 'kd-btn primary', '🖨️ Drucken').addEventListener('click', () => printText(ta.value));
        mk(bar, 'button', 'kd-btn', '📋 Kopieren').addEventListener('click', () => {
            const ok = () => note('Der Text ist kopiert.');
            try { navigator.clipboard.writeText(ta.value).then(ok, () => { ta.select(); document.execCommand('copy'); ok(); }); } catch (e) { try { ta.select(); document.execCommand('copy'); ok(); } catch (x) {} }
        });
        mk(bar, 'button', 'kd-btn', '🔎 Adresse suchen').addEventListener('click', () => {
            const q = encodeURIComponent(((data && data.anbieter) || '') + ' Kündigung Adresse Kündigungsschreiben');
            window.open('https://www.google.com/search?q=' + q, '_blank');
        });
        const closeBtn = mk(bar, 'button', 'kd-btn', 'Schließen'); closeBtn.addEventListener('click', closeWin); closeBtn.style.gridColumn = '1 / -1';
        document.body.appendChild(el);
        try { document.body.classList.add('panel-open'); } catch (e) {}
        try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) {}
    }

    /* ---------- Namensschreibweise (Schröter -> Schroeter) und Postleitzahl ---------- */
    const OE_RE = /(?:^|\s)(?:o\s?e\s?t?|oet)(?=\s|$)/;
    const OE_STRIP = /\s*(?:geschrieben\s+)?(?:mit\s+)?(?:o\s?e\s?t?|oet)\.?\s*$/i;
    const capWords = x => String(x || '').replace(/(^|[\s\-])([a-zäöüß])/g, (m, a, b) => a + b.toUpperCase());
    function fixName(n) { return String(n || '').replace(/ö/g, 'oe').replace(/Ö/g, 'Oe'); }
    function plzText(raw) {
        const toks = String(raw || '').trim().split(/\s+/);
        let digits = '', k = 0;
        while (k < toks.length && digits.length < 5 && DIGITS[toks[k].toLowerCase()] !== undefined) digits += DIGITS[toks[k++].toLowerCase()];
        return digits.length === 5 ? (digits + ' ' + toks.slice(k).join(' ')).trim() : clean(raw);   // Großschreibung folgt in capWords
    }

    /* ---------- Menü: neue Kündigung oder gespeicherte ansehen ---------- */
    function fmtAt(t) { const d = new Date(t); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; }
    function openMenu() {
        const list = loadList();
        if (!list.length) { closeWin(); say('Du hast noch keine Kündigung gespeichert. Ich schreibe jetzt eine neue.'); startNew(); return; }
        ensureStyle(); closeWin();
        const mk = (p, tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; p.appendChild(x); return x; };
        el = document.createElement('div'); el.id = 'jvKuend';
        const head = mk(el, 'div', 'kd-head');
        mk(head, 'div', 'kd-title', 'KÜNDIGUNGEN');
        mk(head, 'div', 'kd-sub', list.length === 1 ? '1 gespeicherte Kündigung' : list.length + ' gespeicherte Kündigungen (die letzten ' + MAX_LIST + ')');
        const box = mk(el, 'div', 'kd-list');
        const nb = mk(box, 'button', 'kd-btn primary', '✉️ Neue Kündigung schreiben');
        nb.addEventListener('click', () => { closeWin(); startNew(); });
        list.forEach(e => {
            const row = mk(box, 'div', 'kd-row');
            const d = e.data || {};
            const b = mk(row, 'button', 'kd-btn kd-open', (d.anbieter || 'Kündigung') + (d.art ? ' · ' + d.art : '') + '\n' + fmtAt(e.at));
            b.addEventListener('click', () => { openWin(e.text, d); });
            const x = mk(row, 'button', 'kd-btn kd-del', '✕');
            x.addEventListener('click', () => { deleteEntry(e.id); if (loadList().length) openMenu(); else { closeWin(); say('Die Kündigung ist gelöscht.'); } });
        });
        const cb = mk(el, 'div', 'kd-bar'); const closeBtn = mk(cb, 'button', 'kd-btn', 'Schließen'); closeBtn.addEventListener('click', closeWin); closeBtn.style.gridColumn = '1 / -1';
        document.body.appendChild(el);
        try { document.body.classList.add('panel-open'); } catch (e) {}
        try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) {}
    }
    function startNew() { start(''); }

    /* ---------- Das Gespräch ---------- */
    let S = null;   // { step, d, at }
    const ART_RE = /vertrag|abo|abonnement|mitgliedschaft|versicherung|internet|handy|mobilfunk|strom|gas|fitness|dsl|tarif|zeitung|zeitschrift|streaming|netflix/i;
    const LAST_RE = /^(?:bitte\s+)?(?:(?:zeig|zeige|öffne|oeffne|hol|such|mach)(?:\s+mir)?\s+)?(?:(?:die|meine)\s+)?(?:letzte|vorherige|gespeicherte|zuletzt geschriebene)\s+k(?:ü|ue)ndigung(?:\s+(?:noch\s*mal|wieder|auf|an|her))*$/;
    const START_1 = /\bk(?:ü|ue)ndigung(?:en|sschreiben)?\b.*\b(?:schreib\w*|verfass\w*|aufsetz\w*|erstell\w*|entwirf\w*|entwerf\w*|formulier\w*|vorbereit\w*)\b/;
    const START_2 = /\b(?:schreib\w*|verfass\w*|setz\w*|erstell\w*|entwirf\w*|entwerf\w*|formulier\w*|brauch\w*|will|möchte|moechte|mach\w*|bereite)\b.*\bk(?:ü|ue)ndigung\b/;
    const START_3 = /\b(?:ich )?(?:will|möchte|moechte|muss|würde gerne)\b.*\b(?:vertrag|abo|abonnement|mitgliedschaft|versicherung|handyvertrag|internetvertrag|stromvertrag)\b.*\bk(?:ü|ue)ndigen\b/;

    const LIST_RE = /^(?:bitte\s+)?(?:(?:zeig|zeige|öffne|oeffne|hol|such)(?:\s+mir)?\s+)?(?:(?:die|meine|alle|gespeicherten)\s+)*(?:k(?:ü|ue)ndigungen|k(?:ü|ue)ndigungsschreiben)(?:\s+(?:an|auf|anzeigen|her|ansehen))*$/;
    function isStart(t) { return t.length <= 100 && (START_1.test(t) || START_2.test(t) || START_3.test(t)); }
    function prefill(raw, d) {
        const m = String(raw || '').match(/.*\b(?:bei|für|fuer|an|von)\s+(?:den |die |das |meinen |meine |mein |meinem |meiner |dem |der |einem |einer )?(.+?)\s*(?:schreiben|aufsetzen|verfassen|erstellen|kündigen)?\s*$/i);
        if (!m) return;
        const g = clean(m[1]);
        if (!g || /^(?:mir|uns|mich|dich|dir|eine|einen|ein)$/i.test(g)) return;
        if (ART_RE.test(g) && !d.art) d.art = g; else if (!ART_RE.test(g)) d.anbieter = g;
    }
    function start(raw) {
        S = { step: 'anbieter', d: { modus: 'naechst' }, at: Date.now() };
        prefill(raw, S.d);
        next();
    }
    function ask(q) { say(q); }
    function next() {
        const d = S.d, p = loadProfile();
        if (!d.anbieter) { S.step = 'anbieter'; return ask('Gerne. Bei welchem Anbieter möchten Sie kündigen?'); }
        if (!d.art) { S.step = 'art'; return ask(`Um welchen Vertrag bei ${d.anbieter} geht es? Zum Beispiel Handyvertrag, Internet, Strom, Gas, Versicherung, Miete oder Fitnessstudio.`); }
        const kind = kindOf(d.art);
        if (d.nummer === undefined) { S.step = 'nummer'; return ask(`Wie lautet Ihre ${kind === 'vers' ? 'Versicherungsschein- oder Vertragsnummer' : kind === 'miete' ? 'Mietvertragsnummer' : 'Kunden- oder Vertragsnummer'}? Wenn Sie sie nicht zur Hand haben, sagen Sie: weiß ich nicht.`); }
        if (!d.modusGeklaert) { S.step = 'modus'; return ask('Soll zum nächstmöglichen Zeitpunkt gekündigt werden, zu einem bestimmten Datum, oder außerordentlich, zum Beispiel wegen einer ' + (kind === 'vers' ? 'Beitragserhöhung' : 'Preiserhöhung') + '?'); }
        if (d.modus === 'datum' && !d.datum) { S.step = 'datum'; return ask('Zu welchem Datum soll der Vertrag enden?'); }
        if (d.modus === 'ausser' && d.grund === undefined) { S.step = 'grund'; return ask('Was ist der Grund? Zum Beispiel Preiserhöhung, Umzug oder Leistungsmängel.'); }
        if (!d.name) {
            if (p.name && !S.profilGefragt) { S.profilGefragt = true; S.step = 'profil'; return ask(`Als Absender nehme ich ${p.name}${p.adresse ? ', ' + p.adresse : ''}. Stimmt das?`); }
            S.step = 'name'; return ask('Auf welchen Namen läuft der Vertrag? Bitte Vor- und Nachname.');
        }
        if (!d.adresse) {
            let home = '';
            try { if (typeof window.resolvePersonalPlace === 'function') home = String(window.resolvePersonalPlace('zuhause') || ''); } catch (e) {}
            if (home && /\d/.test(home) && !S.homeGefragt) { S.homeGefragt = true; S.homeVorschlag = home; S.step = 'home'; return ask(`Ist das Ihre Anschrift: ${home}?`); }
            S.step = 'adresse'; return ask('Wie lautet Ihre Anschrift? Straße, Hausnummer, Postleitzahl und Ort.');
        }
        if (!S.plzGefragt && !/\b\d{5}\b/.test(d.adresse)) { S.plzGefragt = true; S.step = 'plz'; return ask('Wie lauten Postleitzahl und Ort dazu? Dann steht der Ort vor dem Datum im Brief.'); }
        if (kind === 'energie') {
            if (d.zaehler === undefined) { S.step = 'zaehler'; return ask('Wie lautet die Zählernummer? Sie steht auf dem Zähler oder auf der Rechnung. Wenn Sie sie nicht haben, sagen Sie: weiß ich nicht.'); }
            if (d.objekt === undefined) { S.step = 'objekt'; return ask('Liegt die Verbrauchsstelle, also der Ort der Lieferung, an Ihrer Anschrift?'); }
            if (d.stand === undefined) { S.step = 'stand'; return ask('Kennen Sie den aktuellen Zählerstand? Sonst sagen Sie: weiß ich nicht.'); }
            if (d.wechsel === undefined) { S.step = 'wechsel'; return ask('Wechseln Sie zu einem neuen Anbieter?'); }
        } else if (kind === 'miete') {
            if (d.objekt === undefined) { S.step = 'objekt'; return ask('Liegt die gemietete Wohnung an Ihrer Anschrift?'); }
        } else if (kind === 'telko') {
            if (d.rufnr === undefined) { S.step = 'rufnr'; return ask('Wie lautet die Rufnummer des Vertrags? Sonst sagen Sie: weiß ich nicht.'); }
            if (d.mitnahme === undefined) { S.step = 'mitnahme'; return ask('Möchten Sie Ihre Rufnummer zu einem neuen Anbieter mitnehmen?'); }
        }
        if (d.anbAdresse === undefined) { S.step = 'anbAdresse'; return ask('Kennen Sie die Kündigungsadresse des Anbieters? Sagen Sie sie mir, oder sagen Sie: weiß ich nicht. Dann lasse ich eine Lücke, und Sie können im Fenster nach der Adresse suchen.'); }
        finish();
    }
    function finish() {
        const d = S.d; S = null;
        saveProfile(Object.assign(loadProfile(), { name: d.name, adresse: d.adresse }));
        const text = buildLetter(d);
        try { openWin(text, d); } catch (e) { console.error('Kündigung Fenster', e); say('Das Fenster konnte nicht geöffnet werden. Bitte versuchen Sie es noch einmal.'); return; }
        const luecke = !d.anbAdresse ? ' Die Anschrift des Anbieters fehlt noch, tragen Sie sie im Fenster ein oder tippen Sie auf Adresse suchen.' : '';
        say(`Die Kündigung an ${d.anbieter} ist fertig.${luecke} Bitte prüfen Sie Adresse, Nummer und Kündigungsfrist. Sie können den Text im Fenster ändern, als PDF speichern oder drucken. Name und Anschrift merke ich mir für das nächste Mal.`);
    }

    function answer(raw) {
        const t = norm(raw), d = S.d, txt = clean(raw);
        switch (S.step) {
            case 'anbieter': d.anbieter = txt.replace(/^(?:bei|von|an|der|die|das)\s+/i, ''); break;
            case 'art': d.art = txt.replace(/^(?:ein|eine|einen|mein|meine|meinen|der|die|das)\s+/i, ''); break;
            case 'nummer': d.nummer = UNKNOWN.test(t) ? '' : parseNumber(raw); break;
            case 'modus': {
                const dt = parseDateText(raw);
                if (/außerordentlich|ausserordentlich|sonderk|sonder|preiserh|beitragserh|fristlos|wichtig/.test(t)) {
                    d.modus = 'ausser'; d.modusGeklaert = true;
                    if (/beitrag/.test(t)) d.grund = 'Beitragserhöhung';
                    else if (/preiserh|preis|teurer/.test(t)) d.grund = 'Preiserhöhung';
                } else if (dt) { d.modus = 'datum'; d.datum = dt; d.modusGeklaert = true; }
                else if (/datum|bestimmt|ende|zum\b.*\d/.test(t) && !/nächst|naechst|früh|frueh|schnellst/.test(t)) { d.modus = 'datum'; d.modusGeklaert = true; }
                else { d.modus = 'naechst'; d.modusGeklaert = true; }
                break;
            }
            case 'datum': {
                const dt = parseDateText(raw);
                if (!dt) { say('Das Datum habe ich nicht verstanden. Sagen Sie es bitte so: 31. Dezember 2026.'); return; }
                d.datum = dt; break;
            }
            case 'grund': d.grund = UNKNOWN.test(t) ? '' : txt; break;
            case 'profil': {
                const p = loadProfile();
                if (OE_RE.test(t)) { p.name = fixName(p.name); saveProfile(p); d.name = p.name; d.adresse = p.adresse || ''; }
                else if (YES.test(t)) { d.name = p.name; d.adresse = p.adresse || ''; } else { S.step = 'name'; return next(); }
                break;
            }
            case 'name': d.name = capWords(OE_RE.test(t) ? fixName(txt.replace(OE_STRIP, '')) : txt); break;
            case 'home':
                if (YES.test(t)) d.adresse = S.homeVorschlag; else { S.step = 'adresse'; return ask('Wie lautet Ihre Anschrift? Straße, Hausnummer, Postleitzahl und Ort.'); }
                break;
            case 'adresse': d.adresse = capWords(txt); break;
            case 'plz': if (!UNKNOWN.test(t)) d.adresse = d.adresse + ', ' + capWords(plzText(raw)); break;
            case 'zaehler': d.zaehler = UNKNOWN.test(t) ? '' : parseNumber(raw); break;
            case 'objekt':
                if (YES.test(t)) d.objekt = d.adresse; else { S.step = 'objekt2'; return ask('Wie lautet die Anschrift?'); }
                break;
            case 'objekt2': d.objekt = capWords(txt); break;
            case 'stand': d.stand = UNKNOWN.test(t) ? '' : parseNumber(raw); break;
            case 'wechsel': d.wechsel = YES.test(t); break;
            case 'rufnr': d.rufnr = UNKNOWN.test(t) ? '' : parseNumber(raw); break;
            case 'mitnahme': d.mitnahme = YES.test(t); break;
            case 'anbAdresse': d.anbAdresse = UNKNOWN.test(t) ? '' : capWords(txt); break;
        }
        S.at = Date.now();
        next();
    }

    function handle(text) {
        const t = norm(text);
        if (S) {
            if (Date.now() - S.at > 10 * 60000) S = null;
            else {
                if (CANCEL.test(t)) { S = null; say('In Ordnung, ich habe die Kündigung abgebrochen.'); return true; }
                answer(text); return true;
            }
        }
        if (t.length <= 70 && /\bname\w*\b/.test(t) && OE_RE.test(t)) {
            const p = loadProfile();
            if (!p.name) { say('Ich habe noch keinen Namen gespeichert. Sagen Sie ihn bei der nächsten Kündigung, dann schreibe ich ihn mit oe.'); return true; }
            p.name = fixName(p.name); saveProfile(p);
            say(`In Ordnung. Ich schreibe Ihren Namen künftig so: ${p.name}.`); return true;
        }
        if (LIST_RE.test(t)) { openMenu(); return true; }
        if (LAST_RE.test(t)) {
            const l = loadLast();
            if (!l) { say('Ich habe noch keine Kündigung gespeichert.'); return true; }
            openWin(l.text, l.data || {}); say('Hier ist Ihre letzte Kündigung.'); return true;
        }
        if (!t || !isStart(t)) return false;
        start(text);
        return true;
    }

    /* ---------- Eintrag im ☰-Menü (ohne panels.js zu ändern: buildMenuPanel wird umwickelt) ---------- */
    function hookMenu() {
        try {
            if (typeof window.buildMenuPanel !== 'function' || window.buildMenuPanel.__kd) return;
            const orig = window.buildMenuPanel;
            const wrapped = function () {
                const r = orig.apply(this, arguments);
                try {
                    if (r && typeof r.html === 'string' && r.html.indexOf('kuendigungMenu') < 0) {
                        const n = loadList().length;
                        const sub = n ? (n === 1 ? '1 gespeicherte, neue schreiben' : n + ' gespeicherte, neue schreiben') : 'Brief schreiben, als PDF speichern oder drucken';
                        const btn = '<button class="panel-row w-full flex items-center gap-3 text-left bg-black/60 border border-[rgba(73,215,255,.2)] rounded-lg p-3 mb-2" style="--i:11" onclick="playUiBeep(); closePanel(); window.kuendigungMenu()">' +
                            '<span class="text-2xl">✉️</span><span class="flex-1"><b class="block text-[#49d7ff] text-sm">Kündigungen</b><span class="text-xs text-slate-400">' + sub + '</span></span><span class="text-[#49d7ff]">›</span></button>';
                        const m = r.html.match(/<button[^>]*openPanel\('planer'\)/);
                        r.html = m ? r.html.replace(m[0], btn + m[0]) : r.html.replace(/<\/div>\s*$/, btn + '</div>');
                    }
                } catch (e) { console.error('Kündigung Menü', e); }
                return r;
            };
            wrapped.__kd = true;
            window.buildMenuPanel = wrapped;
        } catch (e) {}
    }
    hookMenu();
    [800, 3000].forEach(ms => setTimeout(hookMenu, ms));

    window.handleKuendigungCommand = handle;
    window.kuendigungMenu = openMenu;
    window.__kuendTest = { openMenu, loadList, kindOf, fixName, plzText, loadLast, saveLast, parseNumber, parseDateText, buildLetter, makePdf, isStart, state: () => S, wrap: wrapLine };

    let lastHooked = null;
    function hook() {
        const prev = window.handleLocalCommand;
        if (typeof prev !== 'function' || prev === lastHooked) return;
        const hooked = function (text) {
            try { if (handle(text)) return true; } catch (e) { console.error('Kündigung', e); }
            return prev.apply(this, arguments);
        };
        Object.keys(prev).forEach(k => { try { hooked[k] = prev[k]; } catch (e) {} });
        lastHooked = hooked;
        window.handleLocalCommand = hooked;
    }
    hook();
    [1500, 4000, 9000].forEach(ms => setTimeout(hook, ms));   // spätere Dateien umwickeln den Befehl: wieder ganz nach außen
})();
