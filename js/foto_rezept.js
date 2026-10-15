/* ============================================================
   FOTO REZEPT: Rezept (Kochbuchseite, Zettel, Screenshot) fotografieren, lesen, speichern, ausdrucken, vorlesen.
   - Ein Foto oder MEHRERE Bilder auf einmal (in der Galerie mehrere antippen): Zutaten auf Bild 1, Zubereitung auf Bild 2 usw.
     werden zu EINEM Rezept zusammengesetzt. Nachträglich: Karte "Foto hinzufügen".
   - Foto-Erkennung (foto_erkennen.js) erkennt ein Rezept selbst und fragt dann: speichern, ausdrucken oder vorlesen? Nichts wird ungefragt gespeichert.
   - Gespeichert wird in 'helfer_rezepte' (Rezeptbuch). Sprache: "Zeig meine Rezepte", "Zeig das Rezept Lasagne", "Drucke das Rezept Lasagne",
     "Lies mir das Rezept Lasagne vor", "Lösche das Rezept Lasagne", "Rezept fotografieren".
   - Drucken: In der Android-App öffnet sich der Druckdialog (auch "Als PDF speichern"), im Browser der Druckdialog des Browsers.
   Hängt sich in photo.js ein und muss nach foto_erkennen.js geladen werden. Benutzt: askVision, photoJsonObject, preparePhoto, speak.
   ============================================================ */
(function () {
    if (typeof window.processPhoto !== 'function' || typeof window.askVision !== 'function') return;

    const KEY = 'helfer_rezepte';
    const DRAFT_MS = 15 * 60000;

    function say(msg) { try { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    function cards(list) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function' && list && list.length) showActionCards(list);
        } catch (e) {}
    }
    function status(t) { try { if (typeof typeWriterStatus === 'function') typeWriterStatus(t); } catch (e) {} }
    function norm(text) { return String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    /* ---------- Rezeptbuch ---------- */
    function loadAll() {
        try {
            const v = JSON.parse(getPersistentData(KEY, '[]'));
            return Array.isArray(v) ? v : [];
        } catch (e) { return []; }
    }
    function saveAll(list) { try { setPersistentData(KEY, JSON.stringify(list)); } catch (e) { console.error('Rezepte speichern', e); } }

    /* ---------- Entwurf: gerade gelesenes Rezept, noch nicht gespeichert ---------- */
    let draft = null;       // { rez, at }
    let addMode = false;    // nächstes Foto wird an das Rezept angehängt

    function emptyRez() { return { titel: '', portionen: '', zeit: '', zutaten: [], zubereitung: [] }; }
    function hasDraft() { return !!draft && Date.now() - draft.at < DRAFT_MS; }

    function rezeptPrompt() {
        return 'Du liest ein Rezept von einem Foto (Kochbuchseite, Zettel, Zeitschrift, Bildschirmfoto). Antworte NUR mit einem JSON-Objekt: ' +
            '{"ist_rezept":true oder false,"titel":"Name des Gerichts oder null","portionen":"zum Beispiel 4 Portionen oder null","zeit":"zum Beispiel 45 Minuten oder null",' +
            '"zutaten":["200 g Mehl","2 Eier"],"zubereitung":["erster Schritt","zweiter Schritt"],"hinweis":"ein kurzer Satz oder leer"}. ' +
            'Regeln: Übernimm Mengen, Zutaten und Schritte so, wie sie auf dem Foto stehen. Jeder Schritt der Zubereitung ist ein eigener Eintrag ohne Nummerierung. ' +
            'Stehen auf dem Foto nur Zutaten oder nur die Zubereitung, lass die andere Liste leer. Zutatengruppen wie "Für den Teig" schreibst du als eigenen Eintrag mit Doppelpunkt am Ende ("Für den Teig:"). ' +
            'Erfinde nichts und ergänze nichts; was nicht lesbar ist, lässt du weg. Ist auf dem Foto kein Rezept, setze "ist_rezept" auf false und lass die Listen leer.';
    }

    function strList(v) {
        if (typeof v === 'string') v = v.split(/\n+/);
        if (!Array.isArray(v)) return [];
        return v.map(x => {
            if (x && typeof x === 'object') x = [x.menge, x.einheit, x.name || x.zutat].filter(Boolean).join(' ') || x.text || '';
            return String(x == null ? '' : x).replace(/^\s*(?:\d{1,2}[.)]\s+|[-•*]\s+)/, '').replace(/\s+/g, ' ').trim();
        }).filter(x => x && x.length < 600);
    }

    function parseRezept(content) {
        const o = typeof photoJsonObject === 'function' ? photoJsonObject(content) : null;
        if (!o || typeof o !== 'object') return null;
        const clean = v => (v == null || String(v).trim().toLowerCase() === 'null') ? '' : String(v).trim();
        const r = { titel: clean(o.titel).slice(0, 80), portionen: clean(o.portionen).slice(0, 40), zeit: clean(o.zeit).slice(0, 40), zutaten: strList(o.zutaten).slice(0, 60), zubereitung: strList(o.zubereitung).slice(0, 50) };
        if (!r.zutaten.length && !r.zubereitung.length) return null;
        return r;
    }

    function mergeInto(base, r) {
        if (!base.titel && r.titel) base.titel = r.titel;
        if (!base.portionen && r.portionen) base.portionen = r.portionen;
        if (!base.zeit && r.zeit) base.zeit = r.zeit;
        const addUnique = (to, from) => {
            const seen = new Set(to.map(x => norm(x)));
            from.forEach(x => { const k = norm(x); if (k && !seen.has(k)) { seen.add(k); to.push(x); } });
        };
        addUnique(base.zutaten, r.zutaten);
        addUnique(base.zubereitung, r.zubereitung);
        return base;
    }

    /* ---------- Foto(s) -> Rezept ---------- */
    async function processRezept(urls, addTo) {
        status('Lese das Rezept ...');
        let lastErr = null;
        const results = await Promise.all(urls.map(u =>
            askVision(rezeptPrompt(), 'Lies das Rezept von diesem Foto.', u, true).then(parseRezept).catch(e => { lastErr = e; return null; })));
        const rez = addTo || emptyRez();
        let found = 0;
        results.forEach(r => { if (r) { mergeInto(rez, r); found++; } });
        if (!found) {
            if (lastErr) {
                cards([{ icon: '⚠️', title: 'Rezept lesen: Fehler der KI-Verbindung', subtitle: String((lastErr && lastErr.message) || lastErr).slice(0, 200) }]);
                say('Die Auswertung hat gerade nicht geklappt. Den Grund siehst du unten auf der Karte.');
            } else {
                say(urls.length > 1 ? 'Auf diesen Bildern konnte ich kein Rezept erkennen. Mehrere Bilder setze ich nur für Rezepte zusammen.' : 'Ich konnte auf dem Foto kein Rezept erkennen. Ist es scharf und gut beleuchtet?');
            }
            return;
        }
        if (typeof photoPending !== 'undefined') photoPending = null;     // es ist immer nur eine Rückfrage offen
        if (typeof photoEvents !== 'undefined') { photoEvents = []; }
        draft = { rez, at: Date.now() };
        addMode = false;
        showDraftCards();
        const n = rez.zutaten.filter(z => !/:$/.test(z)).length, m = rez.zubereitung.length;
        let msg = `Das ist ein Rezept${rez.titel ? ': ' + rez.titel : ''}. Ich habe ${n} ${n === 1 ? 'Zutat' : 'Zutaten'} und ${m} ${m === 1 ? 'Schritt' : 'Schritte'} gelesen.`;
        if (!m) msg += ' Die Zubereitung fehlt noch. Mit „Foto hinzufügen“ ergänzt du sie.';
        else if (!n) msg += ' Die Zutaten fehlen noch. Mit „Foto hinzufügen“ ergänzt du sie.';
        msg += ' Soll ich es speichern, ausdrucken oder vorlesen?';
        say(msg);
    }

    function showDraftCards() {
        if (!draft) return;
        const r = draft.rez;
        const n = r.zutaten.filter(z => !/:$/.test(z)).length;
        cards([
            { icon: '🍽️', title: r.titel || 'Rezept ohne Namen', subtitle: `${n} Zutaten · ${r.zubereitung.length} Schritte${r.portionen ? ' · ' + r.portionen : ''}`, onclick: 'jvRezept.ansehen()' },
            { icon: '💾', title: 'Speichern', subtitle: 'Ins Rezeptbuch', onclick: 'jvRezept.speichern()' },
            { icon: '🖨️', title: 'Drucken', subtitle: 'Druckansicht oder als PDF', onclick: 'jvRezept.drucken()' },
            { icon: '🔊', title: 'Vorlesen', subtitle: 'Zutaten und Zubereitung', onclick: 'jvRezept.vorlesen()' },
            { icon: '➕', title: 'Foto hinzufügen', subtitle: 'Zweite Seite, zum Beispiel die Zubereitung', onclick: 'jvRezept.hinzu()' }
        ]);
    }

    /* ---------- Speichern, vorlesen, drucken ---------- */
    function titelFrei(list, titel) {
        let t = titel || ('Rezept vom ' + new Date().toLocaleDateString('de-DE'));
        const base = t; let i = 2;
        while (list.some(x => norm(x.titel) === norm(t))) t = base + ' (' + (i++) + ')';
        return t;
    }

    function speichern(rez) {
        rez = rez || (hasDraft() ? draft.rez : null);
        if (!rez) { say('Es gibt gerade kein Rezept zum Speichern.'); return null; }
        const list = loadAll();
        const copy = JSON.parse(JSON.stringify(rez));
        copy.titel = titelFrei(list, copy.titel);
        copy.id = Date.now();
        copy.at = Date.now();
        list.unshift(copy);
        saveAll(list);
        if (draft && draft.rez === rez) draft.rez = copy;     // weiter mit dem gespeicherten Rezept (Drucken, Vorlesen)
        cards([]);
        say(`${copy.titel} ist im Rezeptbuch gespeichert. Du findest es mit „Zeig meine Rezepte“.`);
        return copy;
    }

    function lesetext(rez, teil) {
        const z = rez.zutaten.map(x => x.replace(/:$/, '.')).join(', ').replace(/\.,/g, '.');
        const s = rez.zubereitung.map((x, i) => `Schritt ${i + 1}: ${x.replace(/[.!?]*$/, '.')}`).join(' ');
        const kopf = rez.titel ? rez.titel + '. ' : '';
        if (teil === 'zutaten') return kopf + (z ? 'Zutaten: ' + z + '.' : 'Zu diesem Rezept habe ich keine Zutaten.');
        if (teil === 'zubereitung') return kopf + (s ? 'Zubereitung. ' + s : 'Zu diesem Rezept habe ich keine Zubereitung.');
        return kopf + (z ? 'Zutaten: ' + z + '. ' : '') + (s ? 'Zubereitung. ' + s : '');
    }

    function vorlesen(rez, teil) {
        rez = rez || (hasDraft() ? draft.rez : null);
        if (!rez) { say('Es gibt gerade kein Rezept zum Vorlesen.'); return; }
        say(lesetext(rez, teil));
    }

    function druckHtml(rez) {
        const zut = rez.zutaten.map(z => /:$/.test(z) ? `<li class="grp">${esc(z)}</li>` : `<li>${esc(z)}</li>`).join('');
        const sch = rez.zubereitung.map(s => `<li>${esc(s)}</li>`).join('');
        const meta = [rez.portionen, rez.zeit].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');
        return '<!doctype html><html lang="de"><head><meta charset="utf-8"><title>' + esc(rez.titel || 'Rezept') + '</title><style>' +
            '@page{size:A4;margin:16mm}*{box-sizing:border-box}body{font-family:Georgia,"Times New Roman",serif;color:#111;font-size:12pt;line-height:1.45;margin:0}' +
            'h1{font-size:23pt;margin:0 0 4px}.meta{color:#555;font-size:10.5pt;margin-bottom:12px}' +
            'h2{font-size:12.5pt;border-bottom:1.5px solid #333;padding-bottom:2px;margin:16px 0 8px;text-transform:uppercase;letter-spacing:.07em}' +
            'ul{padding:0;list-style:none;margin:0;columns:2;column-gap:28px}ul li{padding:2px 0;break-inside:avoid}ul li.grp{font-weight:bold;margin-top:8px;column-span:none}' +
            'ol{padding-left:22px;margin:0}ol li{margin-bottom:8px}.foot{margin-top:22px;font-size:8.5pt;color:#888}' +
            '</style></head><body><h1>' + esc(rez.titel || 'Rezept') + '</h1>' + (meta ? '<div class="meta">' + meta + '</div>' : '') +
            (zut ? '<h2>Zutaten</h2><ul>' + zut + '</ul>' : '') + (sch ? '<h2>Zubereitung</h2><ol>' + sch + '</ol>' : '') +
            '<div class="foot">Aus Nova</div></body></html>';
    }

    function drucken(rez) {
        rez = rez || (hasDraft() ? draft.rez : null);
        if (!rez) { say('Es gibt gerade kein Rezept zum Drucken.'); return; }
        const html = druckHtml(rez);
        try {
            if (window.ZaneNative && typeof window.ZaneNative.printHtml === 'function') {
                window.ZaneNative.printHtml(rez.titel || 'Rezept', html);
                say('Der Druckdialog öffnet sich. Dort kannst du auch „Als PDF speichern“ wählen.');
                return;
            }
        } catch (e) { console.error('Drucken (App)', e); }
        if (window.ZaneNative) { say('Zum Drucken braucht die App eine Aktualisierung. Das Rezept ist aber gespeichert, wenn du es gespeichert hast.'); return; }
        try {   // Browser: unsichtbares Fenster mit dem Rezeptblatt drucken
            const f = document.createElement('iframe');
            f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
            document.body.appendChild(f);
            f.contentDocument.open(); f.contentDocument.write(html); f.contentDocument.close();
            setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) {} setTimeout(() => f.remove(), 60000); }, 400);
            say('Der Druckdialog öffnet sich.');
        } catch (e) { say('Das Drucken hat nicht geklappt.'); }
    }

    /* ---------- Anzeige: Rezept auf einem Bildschirm ---------- */
    function zeigen(rez, gespeichert) {
        const old = document.getElementById('jvRezeptView'); if (old) old.remove();
        const wrap = document.createElement('div');
        wrap.id = 'jvRezeptView';
        wrap.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(3,8,16,.98);display:flex;flex-direction:column;padding:14px;gap:10px;color:#e8f6ff;font-family:inherit';
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;justify-content:space-between;align-items:center;gap:10px';
        const h = document.createElement('div');
        h.style.cssText = 'font-size:19px;color:#5ee7ff;font-weight:bold';
        h.textContent = rez.titel || 'Rezept';
        const x = document.createElement('button');
        x.textContent = '✕'; x.setAttribute('aria-label', 'Schließen');
        x.style.cssText = 'background:none;border:1px solid #5ee7ff;color:#5ee7ff;border-radius:8px;font-size:20px;padding:4px 12px';
        x.onclick = () => wrap.remove();
        head.appendChild(h); head.appendChild(x);
        const body = document.createElement('div');
        body.style.cssText = 'flex:1;overflow-y:auto;font-size:17px;line-height:1.45;padding:12px;border-radius:10px;background:rgba(94,231,255,.07);border:1px solid rgba(94,231,255,.25)';
        let html = '';
        const meta = [rez.portionen, rez.zeit].filter(Boolean).map(esc).join(' · ');
        if (meta) html += '<div style="color:#8fb3c4;margin-bottom:8px">' + meta + '</div>';
        if (rez.zutaten.length) html += '<div style="color:#5ee7ff;letter-spacing:.08em;margin:6px 0">ZUTATEN</div><ul style="list-style:none;padding:0;margin:0">' +
            rez.zutaten.map(z => /:$/.test(z) ? `<li style="font-weight:bold;margin-top:8px">${esc(z)}</li>` : `<li>• ${esc(z)}</li>`).join('') + '</ul>';
        if (rez.zubereitung.length) html += '<div style="color:#5ee7ff;letter-spacing:.08em;margin:14px 0 6px">ZUBEREITUNG</div><ol style="padding-left:22px;margin:0">' +
            rez.zubereitung.map(s => `<li style="margin-bottom:8px">${esc(s)}</li>`).join('') + '</ol>';
        body.innerHTML = html;
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap';
        const btn = (t, fn) => {
            const b = document.createElement('button');
            b.textContent = t;
            b.style.cssText = 'flex:1;min-width:30%;background:rgba(94,231,255,.12);border:1px solid #5ee7ff;color:#5ee7ff;border-radius:10px;font-size:16px;padding:10px 6px';
            b.onclick = fn; bar.appendChild(b);
        };
        btn('🖨️ Drucken', () => drucken(rez));
        btn('🔊 Vorlesen', () => { wrap.remove(); vorlesen(rez); });
        if (gespeichert) {
            let sicher = false;
            btn('🗑️ Löschen', function () {
                if (!sicher) { sicher = true; this.textContent = 'Wirklich löschen?'; setTimeout(() => { sicher = false; try { this.textContent = '🗑️ Löschen'; } catch (e) {} }, 4000); return; }
                loeschen(rez.id); wrap.remove();
            });
        }
        else btn('💾 Speichern', () => { const c = speichern(rez); if (c) { wrap.remove(); } });
        wrap.appendChild(head); wrap.appendChild(body); wrap.appendChild(bar);
        document.body.appendChild(wrap);
    }

    function loeschen(id) {
        const list = loadAll();
        const i = list.findIndex(r => r.id === id);
        if (i < 0) return false;
        const t = list[i].titel;
        list.splice(i, 1);
        saveAll(list);
        say(`${t} ist aus dem Rezeptbuch gelöscht.`);
        return true;
    }

    function zeigeBuch() {
        const list = loadAll();
        if (!list.length) { say('Dein Rezeptbuch ist noch leer. Fotografiere ein Rezept, dann speichere ich es.'); return; }
        cards(list.slice(0, 8).map(r => ({ icon: '🍽️', title: r.titel, subtitle: `${r.zutaten.length} Zutaten · ${r.zubereitung.length} Schritte`, onclick: `jvRezept.oeffne(${Number(r.id)})` })));
        const namen = list.slice(0, 4).map(r => r.titel).join(', ');
        say(`Du hast ${list.length} ${list.length === 1 ? 'Rezept' : 'Rezepte'} gespeichert: ${namen}${list.length > 4 ? ' und weitere' : ''}. Tippe unten auf eins, oder sag zum Beispiel „Zeig das Rezept ${list[0].titel}“.`);
    }

    function finde(t) {
        const list = loadAll();
        let best = null, bestScore = 0;
        list.forEach(r => {
            const titel = norm(r.titel);
            let score = 0;
            if (titel && t.includes(titel)) score = 100 + titel.length;
            else titel.split(' ').filter(w => w.length >= 4).forEach(w => { if (t.includes(w.slice(0, Math.max(4, w.length - 2)))) score += w.length; });
            if (score > bestScore) { bestScore = score; best = r; }
        });
        return best;
    }

    /* ---------- Sprachbefehle ---------- */
    function handle(text) {
        const t = norm(text);
        if (!t || t.length > 120) return false;

        // Gerade gelesenes Rezept: speichern / drucken / vorlesen / verwerfen / Foto hinzufügen
        if (hasDraft()) {
            if (/^(?:ja|ja bitte|jawohl|gerne|ok|okay|klar|speichern|speicher(?:e)? (?:es|das|ihn|das rezept)|bitte speichern|ja speichern|ablegen|merk dir das|ins rezeptbuch)$/.test(t)) { speichern(); return true; }
            if (/\b(?:druck\w*|ausdruck\w*|druckansicht)\b/.test(t)) { drucken(); return true; }
            if (/\bzutaten\b.*\b(?:vorlesen|vor)\b|\blies\w*\b.*\bzutaten\b/.test(t)) { vorlesen(null, 'zutaten'); return true; }
            if (/\bzubereitung\b.*\b(?:vorlesen|vor)\b|\blies\w*\b.*\bzubereitung\b|\bzubereitung\b$/.test(t)) { vorlesen(null, 'zubereitung'); return true; }
            if (/^(?:vorlesen|lies (?:es|das|mir das|mir das rezept) vor|les (?:es|das) vor|lies vor)$/.test(t)) { vorlesen(); return true; }
            if (/\b(?:foto|bild|seite)\b.*\b(?:hinzu\w*|dazu|ergänz\w*|anhäng\w*)\b|\b(?:hinzu\w*|ergänz\w*)\b.*\b(?:foto|bild|seite)\b/.test(t)) { hinzu(); return true; }
            if (/^(?:nein|nee|nicht|lieber nicht|abbrechen|verwerfen|vergiss es|lass (?:es|das))$/.test(t)) { draft = null; cards([]); say('Gut, ich habe nichts gespeichert.'); return true; }
        }

        // Rezeptbuch
        if (/\b(?:meine rezepte|rezeptbuch|rezeptsammlung|gespeicherte rezepte|alle rezepte)\b/.test(t) && /\b(?:zeig\w*|öffne|öffnen|anzeigen|was|welche|liste|such\w*)\b|^(?:meine rezepte|rezeptbuch)$/.test(t)) { zeigeBuch(); return true; }

        // Ein bestimmtes Rezept: "Zeig das Rezept Lasagne", "Drucke das Rezept Lasagne", "Lies mir das Rezept Lasagne vor", "Lösche das Rezept Lasagne"
        const verb = t.match(/^(?:bitte\s+)?(zeig\w*|öffne\w*|lies|les|lese|lesen|druck\w*|ausdruck\w*|lösch\w*|entfern\w*|such\w*)\b/);
        if (verb && /\brezept\b/.test(t) && loadAll().length) {
            const r = finde(t);
            if (r) {
                if (/^(?:lösch|entfern)/.test(verb[1])) { loeschen(r.id); return true; }
                if (/^(?:druck|ausdruck)/.test(verb[1])) { drucken(r); return true; }
                if (/^(?:lies|les|lese|lesen)/.test(verb[1]) || /\bvor(?:lesen)?\b/.test(t)) { vorlesen(r, /\bzutaten\b/.test(t) ? 'zutaten' : /\bzubereitung\b/.test(t) ? 'zubereitung' : undefined); return true; }
                zeigen(r, true);
                say(`Hier ist ${r.titel}.`);
                return true;
            }
        }
        return false;
    }

    function istRezeptFoto(text) {
        const t = norm(text);
        if (!t || t.length > 140) return false;
        if (/\b(?:zutaten|kühlschrank|vorräte|vorrat)\b/.test(t) || /\bwas kann ich\b/.test(t)) return false;     // das ist die Rezeptidee aus Zutaten
        return /\brezept\w*\b/.test(t) && /\b(?:foto\w*|bild\w*|fotografier\w*|abfotografier\w*|kamera|einscann\w*|aufnehm\w*|abschreib\w*|abtipp\w*)\b/.test(t);
    }

    function hinzu() {
        if (!hasDraft()) { say('Es gibt gerade kein Rezept, zu dem ich etwas hinzufügen kann.'); return; }
        addMode = true;
        if (typeof photoIntent !== 'undefined') photoIntent = { task: 'rezept', question: '', at: Date.now() };
        if (typeof showPhotoCards === 'function') showPhotoCards();
        say('Fotografiere die nächste Seite, oder wähl in deinen Dateien ein oder mehrere Bilder aus.');
    }

    /* ---------- Einhängen in photo.js und die anderen foto_*.js ---------- */
    const origProcess = window.processPhoto;
    window.processPhoto = async function (intent, dataUrl) {
        if (intent && intent.task === 'rezept') {
            const add = addMode && hasDraft() ? draft.rez : null;
            return processRezept([dataUrl], add);
        }
        return origProcess.apply(this, arguments);
    };

    if (typeof window.parsePhotoRequest === 'function') {
        const origParse = window.parsePhotoRequest;
        window.parsePhotoRequest = function (text) {
            if (istRezeptFoto(text)) return { task: 'rezept', question: norm(text) };
            return origParse.apply(this, arguments);
        };
    }

    if (typeof window.handlePhotoCommand === 'function') {
        const origCmd = window.handlePhotoCommand;
        window.handlePhotoCommand = function (text) {
            try {
                if (istRezeptFoto(text)) {
                    // Liegt gerade ein frisches Foto vor und der Satz heißt "werte es als Rezept aus", direkt auswerten
                    if (typeof lastPhoto !== 'undefined' && lastPhoto && Date.now() - lastPhoto.at < (typeof PHOTO_FOLLOWUP_MS !== 'undefined' ? PHOTO_FOLLOWUP_MS : 600000)
                        && !/\b(?:mach\w*|nimm|aufnehm\w*|fotografier\w*|abfotografier\w*|kamera)\b/.test(norm(text))) {
                        runLastPhotoTask('rezept', text).catch(() => say('Die Auswertung hat gerade nicht geklappt.'));
                        return true;
                    }
                    photoIntent = { task: 'rezept', question: String(text || ''), at: Date.now() };
                    if (typeof showPhotoCards === 'function') showPhotoCards();
                    say('Lege das Rezept gut beleuchtet und gerade hin. Tippe unten auf die Karte, dann öffnet sich die Kamera. Hast du mehrere Seiten, wähl in deinen Dateien alle Bilder auf einmal aus.');
                    return true;
                }
            } catch (e) { console.error('Rezept-Befehl', e); }
            return origCmd.apply(this, arguments);
        };
    }

    // Folgesatz nach einem Foto: "Das ist ein Rezept", "Speichere das als Rezept"
    if (typeof window.parseFollowupTask === 'function') {
        const origFollow = window.parseFollowupTask;
        window.parseFollowupTask = function (text) {
            const t = norm(text);
            if (/\brezept\b/.test(t) && /\b(?:das|dies\w*|es)\b/.test(t) && /\b(?:speicher\w*|lies|les|lese|erkenn\w*|auswert\w*|abschreib\w*|ist ein|ablegen)\b/.test(t) && !/\b(?:was kann ich|zutaten)\b/.test(t)) return { task: 'rezept' };
            return origFollow.apply(this, arguments);
        };
    }

    // Auswahlkarten nach einem Foto ohne Befehl: eine Karte "Rezept" ergänzen
    if (typeof window.photoAskWhatToDo === 'function') {
        const prev = window.photoAskWhatToDo;
        window.photoAskWhatToDo = function () {
            const realShow = window.showActionCards;
            window.showActionCards = function (list) {
                if (Array.isArray(list) && list.length > 2 && !list.some(c => /rezept/i.test(c.title || ''))) {
                    list = [{ icon: '🍽️', title: 'Rezept lesen', subtitle: 'Speichern, ausdrucken, vorlesen', onclick: "runLastPhotoTask('rezept')" }].concat(list);
                }
                return realShow.call(this, list);
            };
            try { return prev.apply(this, arguments); } finally { window.showActionCards = realShow; }
        };
    }

    // Mehrere Bilder auf einmal aus der Galerie: werden zu EINEM Rezept zusammengesetzt
    async function mehrere(files) {
        if (typeof photoIntent !== 'undefined') photoIntent = null;
        status('Werte die Bilder aus ...');
        cards([]);
        const urls = [];
        for (const f of files.slice(0, 6)) {
            const okType = /^image\//.test(f.type || '') || /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i.test(f.name || '');
            if (!okType) continue;
            try { urls.push(await preparePhoto(f)); } catch (e) { console.error('Bild lesen', e); }
        }
        if (!urls.length) { say('Diese Dateien konnte ich nicht lesen. Bitte wähl Bilder aus.'); return; }
        try { if (typeof lastPhoto !== 'undefined') lastPhoto = { dataUrl: urls[0], at: Date.now(), text: '' }; } catch (e) {}
        const add = addMode && hasDraft() ? draft.rez : null;
        await processRezept(urls, add);
    }
    function initInputs() {
        const pick = document.getElementById('photoPickInput');
        if (!pick) return;
        try { pick.multiple = true; } catch (e) {}
        pick.addEventListener('change', function (ev) {
            const files = Array.from((ev.target && ev.target.files) || []);
            if (files.length < 2) return;                 // ein Bild: wie bisher (photo.js)
            ev.stopImmediatePropagation();
            try { ev.target.value = ''; } catch (e) {}
            mehrere(files).catch(e => { console.error('Mehrere Bilder', e); say('Die Auswertung hat gerade nicht geklappt.'); });
        }, true);
    }
    initInputs();

    if (window.jvCommands) {
        window.jvCommands.use('rezepte', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Rezepte', e); }
            return next(text);
        }, 94);
    }

    window.jvRezept = {
        speichern: () => speichern(), drucken: () => drucken(), vorlesen: () => vorlesen(), hinzu,
        ansehen: () => { if (hasDraft()) zeigen(draft.rez, false); },
        oeffne: (id) => { const r = loadAll().find(x => x.id === id); if (r) zeigen(r, true); },
        liste: loadAll, handle
    };
})();
