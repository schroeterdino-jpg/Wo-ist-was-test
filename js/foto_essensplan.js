/* ============================================================
   ESSENSPLAN FOTOGRAFIEREN UND MERKEN: Der Wochenplan der Kantine (Montag bis Freitag, je ein vegetarisches Gericht und eins mit Fleisch) wird fotografiert.
   Jarvis liest ihn vom Foto, zeigt ihn zum Prüfen (Zellen lassen sich ändern) und merkt ihn sich nach deinem Tipp auf Speichern.
   Ein neuer Plan ersetzt den alten (der Plan ändert sich jede Woche). Gespeichert wird auf diesem Gerät (localStorage "jv_essensplan").
   Aufrufen:
   - vorher: "Essensplan fotografieren", "Merk dir den Essensplan", "Speiseplan fotografieren", "Kantinenplan merken"
   - danach (Foto ist schon gemacht): Karte "Essensplan merken" oder "Merk dir das als Essensplan"; die Foto-Erkennung erkennt ihn auch selbst
   Fragen danach: "Was gibt es morgen?", "Was gibt es heute zu essen?", "Was gibt es am Mittwoch?", "Lies mir den Essensplan vor", "Zeig den Essensplan", "Essensplan löschen"
   Am Wochenende (kein Plan) nennt er den nächsten Montag. Ist der Plan älter als 9 Tage, sagt er das dazu.
   Hängt sich in photo.js ein und muss nach foto_stundenplan.js und vor foto_erkennen.js geladen werden.
   Benutzt: askVision, photoJsonObject, photoSay, lastPhoto, runLastPhotoTask, jvCommands. Fehlt photo.js, tut diese Datei nichts.
   ============================================================ */
(function () {
    if (typeof window.processPhoto !== 'function' || typeof window.parsePhotoRequest !== 'function') return;

    const KEY = 'jv_essensplan';
    const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag'];
    const WD = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];

    function say(msg) {
        if (typeof photoSay === 'function') photoSay(msg);
        else speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    }
    function sagen(msg) { try { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function norm(text) { return String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function laden() { try { const o = JSON.parse(lsGet(KEY) || 'null'); return o && o.tage ? o : null; } catch (e) { return null; } }
    function berlinTag(off) {
        const d = new Date(Date.now() + off * 86400000);
        return new Date(d.toLocaleString('en-US', { timeZone: 'Europe/Berlin' })).getDay();
    }
    function heuteIso() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }

    /* ---------- Erkennen (Foto) ---------- */
    const WORT = /(?:essens?\s?plan|speise\s?plan|kantinen\s?plan|mittags?\s?plan|men(?:ü|ue)\s?plan|kantinen\s?essen)/;
    const ACT = /\b(?:merk\w*|speicher\w*|fotografier\w*|abfotografier\w*|einles\w*|les\w*|ablegen|leg\w*|aufnehm\w*|aufschreib\w*|hinterleg\w*|einscann\w*|scann\w*|abspeicher\w*)\b/;
    function isEssensplan(text) {
        const t = norm(text);
        if (!t || t.length > 110 || !WORT.test(t)) return false;
        if (/^(?:was|wann|welche\w*|wie|wo|hat|haben|gibt|zeig\w*|lies|les|loesch\w*|lösch\w*)\b/.test(t)) return false;
        return ACT.test(t);
    }
    function isFollowup(text) {
        const t = norm(text);
        if (!t || t.length > 80) return false;
        return /^(?:(?:jarvis|zane) )?(?:bitte )?(?:merk|merke|speicher|speichere)\w*\s+(?:dir\s+|mir\s+)?(?:das|dies\w*|es)\s+(?:bitte\s+)?(?:als|im|als meinen)\s+(?:den\s+)?(?:essens?\s?plan|speise\s?plan|kantinen\s?plan)$/.test(t)
            || /^(?:das|es|dies\w*)\s+(?:ist|ist ein|ist der)\s+(?:ein\s+|der\s+)?(?:essens?\s?plan|speise\s?plan|kantinen\s?plan)$/.test(t);
    }

    const origParse = window.parsePhotoRequest;
    window.parsePhotoRequest = function (text) {
        if (isEssensplan(text)) return { task: 'essensplan', question: norm(text) };
        return origParse.apply(this, arguments);
    };
    if (typeof window.parseFollowupTask === 'function') {
        const origFollow = window.parseFollowupTask;
        window.parseFollowupTask = function (text) {
            if (isFollowup(text)) return { task: 'essensplan', question: norm(text) };
            return origFollow.apply(this, arguments);
        };
    }
    const origProcess = window.processPhoto;
    window.processPhoto = async function (intent, dataUrl) {
        if (intent && intent.task === 'essensplan') return processEssensplan(dataUrl);
        return origProcess.apply(this, arguments);
    };
    if (typeof window.photoAskWhatToDo === 'function') {
        const origAsk = window.photoAskWhatToDo;
        window.photoAskWhatToDo = function () {
            const origCards = window.showActionCards;
            if (typeof origCards !== 'function') return origAsk.apply(this, arguments);
            window.showActionCards = function (list) {
                try { if (Array.isArray(list)) list.splice(Math.min(1, list.length), 0, { icon: '🍽️', title: 'Essensplan merken', subtitle: 'Wochenplan lesen und speichern', onclick: "runLastPhotoTask('essensplan')" }); } catch (e) { }
                return origCards.apply(this, arguments);
            };
            try { return origAsk.apply(this, arguments); } finally { window.showActionCards = origCards; }
        };
    }
    if (typeof window.handlePhotoCommand === 'function') {
        const origCmd = window.handlePhotoCommand;
        window.handlePhotoCommand = function (text) {
            try {
                if (isEssensplan(text) || isFollowup(text)) {
                    const fresh = typeof lastPhoto !== 'undefined' && lastPhoto && Date.now() - lastPhoto.at < (typeof PHOTO_FOLLOWUP_MS !== 'undefined' ? PHOTO_FOLLOWUP_MS : 600000);
                    if (fresh && !/\b(?:neu\w*|fotografier\w*|abfotografier\w*|mach\w*\s+(?:ein\s+)?foto)\b/.test(norm(text))) {
                        runLastPhotoTask('essensplan', text).catch(() => say('Das Auswerten hat gerade nicht geklappt.'));
                        return true;
                    }
                    photoIntent = { task: 'essensplan', question: String(text || ''), at: Date.now() };
                    if (typeof showPhotoCards === 'function') showPhotoCards();
                    say('Leg den Essensplan gut beleuchtet und gerade hin. Tippe unten auf die Karte, dann öffnet sich die Kamera.');
                    return true;
                }
            } catch (e) { console.error('Essensplan-Befehl', e); }
            return origCmd.apply(this, arguments);
        };
    }

    /* ---------- Lesen ---------- */
    function prompt() {
        return 'Du liest den Wochen-Essensplan einer Kantine von einem Foto. Antworte NUR mit einem JSON-Objekt: ' +
            '{"woche":"Zeitraum oder Kalenderwoche, falls auf dem Plan zu lesen, sonst null",' +
            '"tage":{"Montag":[{"art":"vegetarisch","gericht":"..."},{"art":"fleisch","gericht":"..."}],"Dienstag":[...],"Mittwoch":[...],"Donnerstag":[...],"Freitag":[...]}}. ' +
            'Regeln: art ist "vegetarisch" (auch vegan), "fleisch" (auch Fisch und Geflügel) oder "sonstiges" (Suppe, Salat, Dessert, Beilage, Aktion). ' +
            'Pro Tag meist ein vegetarisches Gericht und eins mit Fleisch. Schreibe die Gerichte genau so ab, wie sie dastehen, ohne Preise und ohne Allergen-Nummern. ' +
            'Nimm nur Tage, die auf dem Plan stehen. Erfinde nichts; Unleserliches wird "?".';
    }
    function parsePlan(content) {
        const o = (typeof photoJsonObject === 'function' ? photoJsonObject(content) : null) || {};
        const src = o.tage && typeof o.tage === 'object' ? o.tage : {};
        const tage = {};
        Object.keys(src).forEach(k => {
            const low = String(k).toLowerCase().trim();
            const tag = TAGE.find(t => t.toLowerCase() === low) || TAGE.find(t => t.toLowerCase().slice(0, 2) === low.slice(0, 2));
            if (!tag) return;
            const e = { veg: '', fleisch: '', sonst: '' };
            const v = src[k];
            const liste = Array.isArray(v) ? v : (v && typeof v === 'object' ? Object.keys(v).map(a => ({ art: a, gericht: v[a] })) : []);
            liste.forEach(x => {
                const art = String((x && x.art) || '').toLowerCase(), g = String((x && (x.gericht || x.name)) || '').trim();
                if (!g) return;
                if (/veg/.test(art)) e.veg = e.veg ? e.veg + ', ' + g : g;
                else if (/fleisch|fisch|gefl/.test(art)) e.fleisch = e.fleisch ? e.fleisch + ', ' + g : g;
                else e.sonst = e.sonst ? e.sonst + ', ' + g : g;
            });
            if (e.veg || e.fleisch || e.sonst) tage[tag] = e;
        });
        return { woche: (typeof o.woche === 'string' && o.woche.trim() && !/^null$/i.test(o.woche.trim())) ? o.woche.trim() : '', tage };
    }
    async function processEssensplan(dataUrl) {
        say('Ich lese den Essensplan. Einen Moment.');
        let content = '';
        try { content = await askVision(prompt(), 'Lies den Essensplan von diesem Foto.', dataUrl, true); }
        catch (e) { console.error('Essensplan', e && e.message); say('Das Lesen hat gerade nicht geklappt. Ist das Foto scharf und gut beleuchtet?'); return; }
        const plan = parsePlan(content);
        const n = Object.keys(plan.tage).length;
        if (!n) { say('Ich konnte auf dem Foto keinen Essensplan erkennen. Ist er scharf, gerade und ganz im Bild?'); return; }
        zeigeFenster(plan);
        say('Ich habe den Essensplan gelesen, ' + n + ' Tage. Bitte prüfe ihn. Zellen lassen sich antippen und ändern. Dann tippst du auf Speichern.');
    }

    /* ---------- Fenster ---------- */
    function css() {
        if (document.getElementById('jvEpCss')) return;
        const st = document.createElement('style'); st.id = 'jvEpCss';
        st.textContent =
            '#jvEp{position:fixed;inset:0;z-index:99999;background:rgba(3,8,16,.97);display:flex;flex-direction:column;padding:12px;gap:10px;color:#e8f6ff;font-family:inherit;box-sizing:border-box}' +
            '#jvEp .ep-head{display:flex;justify-content:space-between;align-items:center;font-size:15px;letter-spacing:.08em;color:#5ee7ff;gap:8px}' +
            '#jvEp button{background:rgba(94,231,255,.1);border:1px solid #5ee7ff;color:#5ee7ff;border-radius:8px;font-size:16px;padding:8px 14px;cursor:pointer;font-family:inherit}' +
            '#jvEp button.primary{background:#5ee7ff;color:#03111a;font-weight:700}' +
            '#jvEp .ep-body{flex:1;overflow:auto;padding:8px;border-radius:10px;background:#fff;color:#000;font:14px/1.35 Arial,Helvetica,sans-serif}' +
            '#jvEp table{border-collapse:collapse;width:100%;table-layout:fixed}#jvEp th,#jvEp td{border:1px solid #666;padding:6px 4px;text-align:left;vertical-align:top;word-break:break-word;font-size:13px}' +
            '#jvEp th{background:#e8eef2}#jvEp td.tg{width:3.2em;background:#f3f6f8;font-weight:700}#jvEp .ep-note{font-size:12px;color:#8fb9c9}';
        document.head.appendChild(st);
    }
    function zeigeFenster(plan, nurAnzeige) {
        css();
        const old = document.getElementById('jvEp'); if (old) old.remove();
        const wrap = document.createElement('div'); wrap.id = 'jvEp';
        const head = document.createElement('div'); head.className = 'ep-head';
        const title = document.createElement('span'); title.textContent = 'ESSENSPLAN' + (nurAnzeige ? '' : ' · PRÜFEN') + (plan.woche ? ' · ' + plan.woche : ''); head.appendChild(title);
        const x = document.createElement('button'); x.textContent = '✕'; x.setAttribute('aria-label', 'Schließen'); x.onclick = () => wrap.remove(); head.appendChild(x);
        const body = document.createElement('div'); body.className = 'ep-body';
        const tbl = document.createElement('table');
        tbl.innerHTML = '<tr><th>Tag</th><th>Vegetarisch</th><th>Mit Fleisch</th></tr>';
        TAGE.filter(t => plan.tage[t]).forEach(t => {
            const e = plan.tage[t], tr = document.createElement('tr');
            const c0 = document.createElement('td'); c0.className = 'tg'; c0.textContent = t.slice(0, 2); c0.title = t; tr.appendChild(c0);
            ['veg', 'fleisch'].forEach(f => { const td = document.createElement('td'); td.textContent = e[f] || ''; td.contentEditable = nurAnzeige ? 'false' : 'true'; td.dataset.tag = t; td.dataset.f = f; tr.appendChild(td); });
            tr.dataset.sonst = e.sonst || '';
            tbl.appendChild(tr);
        });
        body.appendChild(tbl);
        const note = document.createElement('div'); note.className = 'ep-note';
        note.textContent = nurAnzeige ? 'Gespeichert am ' + (plan.gespeichert || '') : 'Gerichte prüfen und bei Fehlern direkt in die Zelle tippen. Ein alter Plan wird ersetzt.';
        wrap.appendChild(head);
        if (!nurAnzeige) {
            const save = document.createElement('button'); save.type = 'button'; save.className = 'primary'; save.textContent = '💾 Speichern';
            save.onclick = () => {
                const out = {};
                Array.prototype.slice.call(tbl.rows, 1).forEach(r => {
                    const t = r.cells[1].dataset.tag;
                    out[t] = { veg: r.cells[1].textContent.trim(), fleisch: r.cells[2].textContent.trim(), sonst: r.dataset.sonst || '' };
                });
                lsSet(KEY, JSON.stringify({ gespeichert: heuteIso(), woche: plan.woche || '', tage: out }));
                wrap.remove();
                say('Gespeichert. Du kannst mich jetzt zum Beispiel fragen: Was gibt es morgen?');
            };
            wrap.appendChild(save);
        }
        wrap.appendChild(body); wrap.appendChild(note);
        document.body.appendChild(wrap);
    }

    /* ---------- Fragen ---------- */
    function gerichte(e) {
        let s = '';
        if (e.veg) s += 'vegetarisch ' + e.veg;
        if (e.fleisch) s += (s ? ', und mit Fleisch ' : 'mit Fleisch ') + e.fleisch;
        if (!s && e.sonst) s = e.sonst;
        return s;
    }
    function altHinweis(p) {
        try {
            const tage = (Date.parse(heuteIso()) - Date.parse(p.gespeichert)) / 86400000;
            if (tage > 9) return ' Achtung, der Plan ist vom ' + p.gespeichert.split('-').reverse().join('.').slice(0, 5) + '. und vielleicht nicht mehr aktuell.';
        } catch (e) { }
        return '';
    }
    function antwortTag(off, p) {
        const wd = berlinTag(off), name = WD[wd];
        const wort = off === 0 ? 'Heute' : off === 1 ? 'Morgen' : off === 2 ? 'Übermorgen' : 'Am ' + name;
        if (p.tage[name]) return wort + (off >= 0 && off <= 2 ? ', ' + name + ',' : '') + ' gibt es ' + gerichte(p.tage[name]) + '.' + altHinweis(p);
        if (wd === 0 || wd === 6) { const mo = p.tage.Montag; return wort + ' gibt es keinen Essensplan.' + (mo ? ' Am Montag gibt es ' + gerichte(mo) + '.' : '') + altHinweis(p); }
        return 'Für ' + name + ' steht nichts im Essensplan.' + altHinweis(p);
    }
    function offsetAusSatz(t) {
        const m = t.match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)\b/);
        if (m) { const ziel = WD.findIndex(w => w.toLowerCase() === m[1]); const jetzt = berlinTag(0); return ((ziel - jetzt) + 7) % 7; }
        if (/\b(?:übermorgen|uebermorgen)\b/.test(t)) return 2;
        if (/\bmorgen\b/.test(t) && !/\bmorgens\b/.test(t)) return 1;
        if (/\bheute\b/.test(t)) return 0;
        return null;
    }
    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 12) return next(text);
        const p = laden();
        if (WORT.test(t) && /\b(?:loesch\w*|lösch\w*|entfern\w*)\b/.test(t)) {
            if (!p) { sagen('Es ist kein Essensplan gespeichert.'); return true; }
            lsSet(KEY, ''); sagen('Der Essensplan ist gelöscht.'); return true;
        }
        if (!p) return next(text);
        if (WORT.test(t) && /\b(?:zeig\w*|anzeigen|oeffne\w*|öffne\w*)\b/.test(t)) { zeigeFenster(p, true); sagen('Hier ist der Essensplan.'); return true; }
        if (WORT.test(t) && /\b(?:vorles\w*|lies|les\w*|woche|ganze\w*)\b/.test(t)) {
            const teile = TAGE.filter(d => p.tage[d]).map(d => d + ': ' + gerichte(p.tage[d]) + '.');
            sagen('Der Essensplan. ' + teile.join(' ') + altHinweis(p)); return true;
        }
        const frage = /^(?:was|welche[sn]?|gibt)\b/.test(t) && /\b(?:gibt|gibts|essen|kantine|mittag\w*|gericht\w*|kochen|kocht|zu essen)\b/.test(t) || WORT.test(t);
        if (!frage || /\b(?:fernsehen|tv|kino|neu\w*|nachricht\w*|wetter|film\w*|programm|termin\w*|arbeit|schicht\w*|tank\w*|sprit|diesel|zuhause|abend\w*|fruehstueck|frühstück)\b/.test(t)) return next(text);
        const off = offsetAusSatz(t);
        if (off == null) return next(text);
        sagen(antwortTag(off, p)); return true;
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('essensplan', befehl, 41);

    window.jvEssensplan = { isEssensplan, isFollowup, parsePlan, antwortTag, laden };
})();
