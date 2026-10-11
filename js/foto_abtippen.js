/* ============================================================
   FOTO ABTIPPEN ZUM AUSDRUCKEN: Ratenzahlungsplan, Tabelle, Zettel, Liste, Brief - Jarvis schreibt den Text vom Foto sauber ab,
   zeigt ihn in einem Fenster (Tabellen als richtige Tabelle) und man kann ihn ändern, drucken (am Handy auch "Als PDF speichern") oder kopieren.
   Aufrufen:
   - vorher: "Ratenplan abtippen", "Tipp den Plan ab", "Foto abtippen zum Ausdrucken", "Schreib das Foto ab"
   - danach (Foto ist schon gemacht): "Tipp das ab", "Schreib das ab", "Zum Ausdrucken", "Mach das druckbar", oder auf die Karte "Abtippen zum Ausdrucken" tippen
   Es wird nichts gespeichert und nichts versendet; das Fenster zeigt nur den Text. Liest er etwas falsch, lässt sich die Zelle im Fenster direkt ändern.
   Hängt sich in photo.js ein (ohne es zu verändern) und muss nach photo.js und foto_brief.js geladen werden.
   Benutzt: askVision, photoSay, lastPhoto, runLastPhotoTask. Fehlt photo.js, tut diese Datei nichts.
   ============================================================ */
(function () {
    if (typeof window.processPhoto !== 'function' || typeof window.parsePhotoRequest !== 'function') return;

    function say(msg) {
        if (typeof photoSay === 'function') photoSay(msg);
        else speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    }
    function norm(text) { return String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }

    /* ---------- Erkennen ---------- */
    const WAS = '(?:plan|ratenplan|ratenzahlungsplan|zahlungsplan|tabelle|liste|zettel|dokument|brief|schreiben|seite|text|foto|bild|rechnung|vertrag|übersicht|aufstellung)';
    function isAbtippen(text) {
        const t = norm(text);
        if (!t || t.length > 120) return false;
        if (/\b(?:abtippen|abtipp\w*|abschreiben|abschreib\w*)\b/.test(t) || /\b(?:tipp|tippe|schreib|schreibe)\w*\s+(?:mir\s+)?(?:\w+\s+){0,3}ab\b/.test(t)) return true;
        if (/\b(?:zum|zu)\s+(?:ausdrucken|drucken)\b/.test(t) && new RegExp('\\b' + WAS + '\\b').test(t)) return true;
        if (/\b(?:ausdrucken|drucken|druckbar)\b/.test(t) && /\b(?:foto|bild|ratenplan|ratenzahlungsplan|zahlungsplan)\b/.test(t)) return true;
        return false;
    }
    function isFollowup(text) {
        const t = norm(text);
        if (!t || t.length > 70) return false;
        if (/^(?:jarvis )?(?:bitte )?(?:(?:tipp|tippe|schreib|schreibe)\w*\s+(?:mir\s+)?(?:das|dies\w*|es|den plan|die tabelle|den ratenplan)\s+(?:bitte\s+)?ab|(?:das|es)\s+abtippen|abtippen|abschreiben|(?:mach|mache)\s+(?:mir\s+)?(?:das|es|daraus)\s+(?:bitte\s+)?(?:druckbar|zum ausdrucken)|(?:zum|zu)\s+ausdrucken|(?:das|es|den plan|die tabelle)\s+(?:bitte\s+)?(?:ausdrucken|drucken))$/.test(t)) return true;
        return false;
    }

    /* ---------- Einhängen in photo.js ---------- */
    const origParse = window.parsePhotoRequest;
    window.parsePhotoRequest = function (text) {
        if (isAbtippen(text)) return { task: 'abtippen', question: norm(text) };
        return origParse.apply(this, arguments);
    };
    if (typeof window.parseFollowupTask === 'function') {
        const origFollow = window.parseFollowupTask;
        window.parseFollowupTask = function (text) {
            if (isFollowup(text)) return { task: 'abtippen' };
            return origFollow.apply(this, arguments);
        };
    }
    const origProcess = window.processPhoto;
    window.processPhoto = async function (intent, dataUrl) {
        if (intent && intent.task === 'abtippen') return processAbtippen(dataUrl, intent.question === MEHR);
        return origProcess.apply(this, arguments);
    };

    /* Auswahlkarten nach einem Foto ohne vorherigen Befehl: "Abtippen zum Ausdrucken" vorne dazu */
    if (typeof window.photoAskWhatToDo === 'function') {
        const origAsk = window.photoAskWhatToDo;
        window.photoAskWhatToDo = function () {
            try {
                if (typeof clearActionCards === 'function') clearActionCards();
                if (typeof showActionCards === 'function') {
                    showActionCards([
                        { icon: '🖨️', title: 'Abtippen zum Ausdrucken', subtitle: 'Ratenplan, Tabelle, Zettel sauber abschreiben', onclick: "runLastPhotoTask('abtippen')" },
                        { icon: '✉️', title: 'Brief auswerten', subtitle: 'Rechnung, Mahnung, Vertrag, Bescheid, Einladung', onclick: "runLastPhotoTask('letter')" },
                        { icon: '🛒', title: 'Auf die Einkaufsliste', subtitle: 'Zettel lesen, Artikel eintragen', onclick: "runLastPhotoTask('shopping')" },
                        { icon: '📅', title: 'Termine eintragen', subtitle: 'Kalender, Plakat, Einladung', onclick: "runLastPhotoTask('events')" },
                        { icon: '📍', title: 'Dorthin navigieren', subtitle: 'Adresse lesen, Route starten', onclick: "runLastPhotoTask('address')" },
                        { icon: '👤', title: 'Kontakt anlegen', subtitle: 'Visitenkarte', onclick: "runLastPhotoTask('contact')" },
                        { icon: '🔤', title: 'Vorlesen / übersetzen', subtitle: 'Text auf dem Foto', onclick: "runLastPhotoTask('read')" },
                        { icon: '🔍', title: 'Beschreiben', subtitle: 'Was ist zu sehen?', onclick: "runLastPhotoTask('describe')" }
                    ]);
                }
                say('Das Foto ist da. Was soll ich damit tun?');
            } catch (e) { return origAsk.apply(this, arguments); }
        };
    }

    /* Befehl vorher ("Ratenplan abtippen"): erst Kamera, mit einer passenden Ansage. Liegt schon ein frisches Foto vor, gleich abtippen. */
    if (typeof window.handlePhotoCommand === 'function') {
        const origCmd = window.handlePhotoCommand;
        window.handlePhotoCommand = function (text) {
            try {
                if (isAbtippen(text) || isFollowup(text)) {
                    const fresh = typeof lastPhoto !== 'undefined' && lastPhoto && Date.now() - lastPhoto.at < (typeof PHOTO_FOLLOWUP_MS !== 'undefined' ? PHOTO_FOLLOWUP_MS : 600000);
                    if (fresh && !/\b(?:neu\w*|fotografier\w*|abfotografier\w*|mach\w*\s+(?:ein\s+)?foto)\b/.test(norm(text))) {
                        runLastPhotoTask('abtippen', text).catch(() => say('Das Abtippen hat gerade nicht geklappt.'));
                        return true;
                    }
                    photoIntent = { task: 'abtippen', question: String(text || ''), at: Date.now() };
                    if (typeof showPhotoCards === 'function') showPhotoCards();
                    say('Legen Sie den Plan gut beleuchtet und gerade hin. Tippen Sie unten auf die Karte, dann öffnet sich die Kamera. Bei mehreren Seiten machen Sie zuerst die erste.');
                    return true;
                }
            } catch (e) { console.error('Abtippen-Befehl', e); }
            return origCmd.apply(this, arguments);
        };
    }

    /* ---------- Mehrere Seiten: weitere Fotos werden hinten angehängt ---------- */
    const MEHR = '__mehr';
    let doc = null;   // { pages } solange das Fenster offen ist

    const isRow = l => /\|/.test(l) && l.split('|').length >= 2;
    const keyOf = l => l.split('|').map(c => c.trim().toLowerCase()).join('|');
    /* Neue Seite an den bisherigen Text hängen: wiederholte Spaltenüberschrift, wiederholte Überschrift und doppelte Zeilen (Überlappung) fallen weg */
    function mergePages(oldText, newText) {
        const oldLines = oldText.split('\n');
        const seenRows = new Set(oldLines.filter(isRow).map(keyOf));
        const seenText = new Set(oldLines.filter(l => !isRow(l) && l.trim().length > 6).map(l => l.trim().toLowerCase()));
        const firstRowOld = oldLines.find(isRow);
        let nl = newText.split('\n');
        const out = [];
        let sawRow = false;
        nl.forEach(l => {
            if (!l.trim()) { out.push(l); return; }
            if (isRow(l)) {
                const k = keyOf(l);
                if (!sawRow && firstRowOld && k === keyOf(firstRowOld)) { sawRow = true; return; }      // Spaltenüberschrift der neuen Seite
                sawRow = true;
                if (seenRows.has(k)) return;                                                         // Zeile gibt es schon (Fotos überlappen)
                out.push(l); return;
            }
            if (!sawRow && seenText.has(l.trim().toLowerCase())) return;                              // gleiche Überschrift oben auf der neuen Seite
            out.push(l);
        });
        while (out.length && !out[0].trim()) out.shift();
        while (out.length && !out[out.length - 1].trim()) out.pop();
        if (!out.length) return oldText;
        const oldLast = oldLines.filter(l => l.trim()).pop() || '';
        const sep = (isRow(oldLast) && isRow(out[0])) ? '\n' : '\n\n';
        return oldText.replace(/\s+$/, '') + sep + out.join('\n');
    }
    /* Raten-Nummern in der ersten Spalte: Lücken verraten eine fehlende Seite oder ein Foto, das eine Zeile abschneidet */
    function luecken(text) {
        const nums = [];
        text.split('\n').filter(isRow).forEach(l => { const c = l.split('|')[0].trim(); if (/^\d{1,3}\.?$/.test(c)) nums.push(parseInt(c, 10)); });
        if (nums.length < 3) return '';
        const miss = [];
        for (let i = 1; i < nums.length; i++) for (let n = nums[i - 1] + 1; n < nums[i] && miss.length < 12; n++) miss.push(n);
        if (!miss.length) return '';
        return miss.length === 1 ? 'Rate ' + miss[0] + ' fehlt' : 'Die Raten ' + miss.join(', ') + ' fehlen';
    }

    /* ---------- Abtippen ---------- */
    function prompt() {
        return 'Du schreibst den kompletten Text von einem Foto sauber und vollständig ab (zum Ausdrucken). ' +
            'Regeln: Schreibe ALLES ab, was lesbar ist, in der Reihenfolge von oben nach unten, genau mit denselben Zahlen, Beträgen, Daten, Namen und Rechtschreibung. Erfinde nichts, rechne nichts um, lass nichts weg. ' +
            'Ist eine Stelle nicht lesbar, schreibe an dieser Stelle [unleserlich]. ' +
            'Ist es eine Tabelle (z.B. ein Ratenplan mit Spalten wie Rate, Fälligkeit, Betrag), dann schreibe jede Zeile der Tabelle als eine Zeile, die Spalten getrennt durch " | ", und zuerst die Überschriftenzeile der Spalten. ' +
            'Texte über oder unter der Tabelle schreibst du als eigene normale Zeilen. Eine leere Zeile trennt Abschnitte. ' +
            'Antworte NUR mit dem abgeschriebenen Text. Kein Markdown, keine Sternchen, keine Erklärung, kein Kommentar, keine Einleitung.';
    }
    function clean(raw) {
        return String(raw || '').replace(/```[a-z]*\n?/gi, '').replace(/\*\*/g, '').replace(/^\s*[-|]{3,}[-| ]*$/gm, '').replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim();
    }

    async function processAbtippen(dataUrl, mehr) {
        const body0 = document.querySelector('#jvAbtipp .abt-body');
        mehr = !!(mehr && doc && body0);
        say(mehr ? 'Ich hänge die nächste Seite an. Einen Moment.' : 'Ich tippe es ab. Einen Moment.');
        let raw = '';
        try { raw = await askVision(prompt(), 'Schreibe den Text auf diesem Foto vollständig ab.', dataUrl, false); }
        catch (e) {
            console.error('Abtippen', e && e.message);
            say('Das Abtippen hat gerade nicht geklappt. Ist das Foto scharf und gut beleuchtet?');
            return;
        }
        let text = clean(raw);
        if (!text || text.length < 3) { say('Ich konnte auf dem Foto keinen Text erkennen. Ist es scharf, gerade und gut beleuchtet?'); return; }
        if (mehr) { text = mergePages(toText(body0), text); doc.pages++; } else doc = { pages: 1 };
        try { zeigeFenster(text); }
        catch (e) { console.error('Abtippen-Fenster', e); say('Ich habe es abgetippt, kann es aber gerade nicht anzeigen.'); return; }
        const zeilen = text.split('\n').filter(l => l.trim()).length;
        const lk = luecken(text);
        say((mehr ? 'Seite ' + doc.pages + ' ist dabei, jetzt ' + zeilen + ' Zeilen. ' : 'Fertig, ' + zeilen + ' Zeilen. ') + (lk ? lk + ' vermutlich. Fehlt eine Seite? ' : '') +
            (mehr ? 'Noch eine Seite? Tippen Sie auf Weitere Seite, sonst auf Drucken.' : 'Hat der Plan mehr Seiten, tippen Sie auf Weitere Seite. Sonst prüfen Sie die Zahlen und drucken ihn aus.'));
    }

    /* ---------- Fenster ---------- */
    function css() {
        if (document.getElementById('jvAbtCss')) return;
        const st = document.createElement('style'); st.id = 'jvAbtCss';
        st.textContent =
            '#jvAbtipp{position:fixed;inset:0;z-index:99999;background:rgba(3,8,16,.97);display:flex;flex-direction:column;padding:12px;gap:10px;color:#e8f6ff;font-family:inherit;box-sizing:border-box}' +
            '#jvAbtipp .abt-head{display:flex;justify-content:space-between;align-items:center;font-size:15px;letter-spacing:.08em;color:#5ee7ff;gap:8px}' +
            '#jvAbtipp .abt-bar{display:flex;gap:8px;flex-wrap:wrap}' +
            '#jvAbtipp button{background:rgba(94,231,255,.1);border:1px solid #5ee7ff;color:#5ee7ff;border-radius:8px;font-size:16px;padding:8px 14px;cursor:pointer;font-family:inherit}' +
            '#jvAbtipp button.primary{background:#5ee7ff;color:#03111a;font-weight:700}' +
            '#jvAbtipp .abt-body{flex:1;overflow:auto;padding:12px;border-radius:10px;background:#fff;color:#000;font:15px/1.45 Arial,Helvetica,sans-serif}' +
            '#jvAbtipp .abt-body table{border-collapse:collapse;width:100%;margin:8px 0}' +
            '#jvAbtipp .abt-body th,#jvAbtipp .abt-body td{border:1px solid #444;padding:5px 8px;text-align:left;vertical-align:top}' +
            '#jvAbtipp .abt-body th{background:#e8eef2}' +
            '#jvAbtipp .abt-body p{margin:0 0 6px;white-space:pre-wrap}' +
            '#jvAbtipp .abt-note{font-size:12px;color:#8fb9c9}' +
            '@media print{body.jv-abt-print>*:not(#jvAbtipp){display:none!important}' +
            'body.jv-abt-print #jvAbtipp{position:static!important;inset:auto!important;display:block!important;background:#fff!important;padding:0!important}' +
            'body.jv-abt-print #jvAbtipp .abt-head,body.jv-abt-print #jvAbtipp .abt-note{display:none!important}' +
            'body.jv-abt-print #jvAbtipp .abt-body{overflow:visible!important;padding:0!important;font-size:11pt}}';
        document.head.appendChild(st);
    }

    /* Text -> HTML: Zeilen mit " | " werden zu Tabellen (erste Zeile einer Tabelle = Kopf), alles andere zu Absätzen */
    function toHtml(body, text) {
        body.textContent = '';
        const lines = text.split('\n');
        let tbl = null, rowsInTbl = 0;
        const closeTbl = () => { tbl = null; rowsInTbl = 0; };
        lines.forEach(line => {
            if (!line.trim()) { closeTbl(); return; }
            if (/\|/.test(line) && line.split('|').length >= 2) {
                if (!tbl) { tbl = document.createElement('table'); body.appendChild(tbl); }
                const tr = document.createElement('tr');
                const cells = line.split('|').map(c => c.trim());
                if (cells.length > 1 && cells[0] === '') cells.shift();
                if (cells.length > 1 && cells[cells.length - 1] === '') cells.pop();
                cells.forEach(c => { const td = document.createElement(rowsInTbl === 0 ? 'th' : 'td'); td.textContent = c; td.contentEditable = 'true'; tr.appendChild(td); });
                tbl.appendChild(tr); rowsInTbl++;
            } else {
                closeTbl();
                const p = document.createElement('p'); p.textContent = line; p.contentEditable = 'true'; body.appendChild(p);
            }
        });
    }
    /* Fensterinhalt -> Text (nach Änderungen durch den Nutzer) */
    function toText(body) {
        const out = [];
        Array.prototype.forEach.call(body.children, el => {
            if (el.tagName === 'TABLE') {
                Array.prototype.forEach.call(el.rows, r => out.push(Array.prototype.map.call(r.cells, c => c.textContent.trim()).join(' | ')));
                out.push('');
            } else out.push(el.textContent);
        });
        return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
    }

    function zeigeFenster(text) {
        css();
        const old = document.getElementById('jvAbtipp'); if (old) old.remove();
        const pages = doc ? doc.pages : 1;
        const wrap = document.createElement('div'); wrap.id = 'jvAbtipp';
        const head = document.createElement('div'); head.className = 'abt-head';
        const title = document.createElement('span'); title.textContent = 'ABGETIPPT · ' + pages + (pages === 1 ? ' SEITE' : ' SEITEN'); head.appendChild(title);
        const x = document.createElement('button'); x.textContent = '✕'; x.setAttribute('aria-label', 'Schließen'); x.addEventListener('click', () => { wrap.remove(); doc = null; });
        head.appendChild(x);
        const bar = document.createElement('div'); bar.className = 'abt-bar';
        const body = document.createElement('div'); body.className = 'abt-body';
        toHtml(body, text);
        const note = document.createElement('div'); note.className = 'abt-note'; note.textContent = 'Zahlen bitte mit dem Original vergleichen. Zellen lassen sich antippen und ändern.';
        const mk = (label, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (cls) b.className = cls; b.addEventListener('click', fn); bar.appendChild(b); };
        mk('🖨️ Drucken', 'primary', () => {
            document.body.classList.add('jv-abt-print');
            const done = () => { document.body.classList.remove('jv-abt-print'); window.removeEventListener('afterprint', done); };
            window.addEventListener('afterprint', done);
            setTimeout(() => { try { window.print(); } catch (e) { done(); } setTimeout(done, 60000); }, 150);
        });
        const naechste = (fn) => () => {
            try { photoIntent = { task: 'abtippen', question: MEHR, at: Date.now() }; } catch (e) {}
            note.textContent = 'Mach das Foto der nächsten Seite. Danach wird sie angehängt.';
            try { fn(); } catch (e) { note.textContent = 'Die Kamera ließ sich nicht öffnen.'; }
        };
        mk('➕ Weitere Seite', '', naechste(() => { if (typeof openPhotoCamera === 'function') openPhotoCamera(true); }));
        mk('📁 Aus Dateien', '', naechste(() => { if (typeof openPhotoGallery === 'function') openPhotoGallery(); }));
        mk('📋 Kopieren', '', () => {
            const t = toText(body);
            try { navigator.clipboard.writeText(t).then(() => { note.textContent = 'Kopiert.'; }, () => { note.textContent = 'Kopieren war nicht möglich.'; }); }
            catch (e) { note.textContent = 'Kopieren war nicht möglich.'; }
        });
        wrap.appendChild(head); wrap.appendChild(bar); wrap.appendChild(body); wrap.appendChild(note);
        document.body.appendChild(wrap);
    }

    window.jvAbtippen = { isAbtippen, isFollowup, toHtml, toText, clean, mergePages, luecken };
})();
