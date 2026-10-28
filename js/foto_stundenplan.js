/* ============================================================
   STUNDENPLAN FOTOGRAFIEREN UND MERKEN: Zane liest den Stundenplan vom Foto, zeigt ihn zum Prüfen (Zellen lassen sich ändern)
   und speichert ihn nach deinem Tipp im Langzeitgedächtnis: pro Wochentag ein Eintrag ("Stundenplan von Isabel, Montag: 1. Mathe, 2. Deutsch ...").
   Ein neuer Plan überschreibt den alten derselben Person. Die Einträge stehen auch im Langzeitgedächtnis-Fenster und lassen sich dort löschen.
   Aufrufen:
   - vorher: "Merk dir den Stundenplan", "Stundenplan von Isabel fotografieren", "Speicher den Stundenplan"
   - danach (Foto ist schon gemacht): Karte "Stundenplan merken" oder "Merk dir das als Stundenplan"
   Fragen danach (ganz normal): "Was hat Isabel morgen in der dritten Stunde?", "Wann hat sie Sport?", "Was hat Isabel am Donnerstag?"
   Standardname: Isabel (im Fenster änderbar; der zuletzt benutzte Name wird gemerkt).
   Hängt sich in photo.js ein (ohne es zu verändern) und muss nach photo.js, foto_abtippen.js und langzeit.js geladen werden.
   Benutzt: askVision, photoJsonObject, photoSay, lastPhoto, runLastPhotoTask, apiFetch (/api/memory). Fehlt photo.js, tut diese Datei nichts.
   ============================================================ */
(function () {
    if (typeof window.processPhoto !== 'function' || typeof window.parsePhotoRequest !== 'function') return;

    const NAME_KEY = 'jv_stundenplan_name';
    const TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const ABK = { mo: 'Montag', di: 'Dienstag', mi: 'Mittwoch', do: 'Donnerstag', fr: 'Freitag', sa: 'Samstag' };

    function say(msg) {
        if (typeof photoSay === 'function') photoSay(msg);
        else speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    }
    function norm(text) { return String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const cap = s => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const slug = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '') || 'kind';
    function todayIso() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function standardName() { return lsGet(NAME_KEY) || 'Isabel'; }

    async function post(body) {
        const res = await apiFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        let data = null; try { data = await res.json(); } catch (e) {}
        if (!res.ok) throw new Error((data && data.error) || ('Fehler ' + res.status));
        return data || {};
    }

    /* ---------- Erkennen ---------- */
    const ACT = /\b(?:merk\w*|speicher\w*|fotografier\w*|abfotografier\w*|einles\w*|les\w*|ablegen|leg\w*|abtipp\w*|aufnehm\w*|aufschreib\w*|einsp\w*|hinterleg\w*|eintrag\w*|trag\w*|einscann\w*|scann\w*|abspeicher\w*)\b/;
    function personFrom(t) {
        const m = String(t || '').match(/stundenplan\s+(?:von|vom|für|fuer|der|des)\s+(?:meiner\s+tochter\s+|meinem\s+sohn\s+|meinen\s+kindern\s+)?([a-zäöüß]{2,20})/i);
        if (!m) return '';
        const w = m[1].toLowerCase();
        if (/^(?:meiner|meinem|meinen|dem|der|die|das|den|einem|einer|diese\w*|heute|morgen)$/.test(w)) return '';
        return cap(w);
    }
    function isStundenplan(text) {
        const t = norm(text);
        if (!t || t.length > 110 || !/stundenplan/.test(t)) return false;
        if (/^(?:was|wann|welche\w*|wie|wo|hat|haben)\b/.test(t) && !ACT.test(t)) return false;
        return ACT.test(t);
    }
    function isFollowup(text) {
        const t = norm(text);
        if (!t || t.length > 80) return false;
        return /^(?:(?:jarvis|zane) )?(?:bitte )?(?:merk|merke|speicher|speichere)\w*\s+(?:dir\s+|mir\s+)?(?:das|dies\w*|es)\s+(?:bitte\s+)?(?:als|im|als meinen)\s+(?:den\s+)?stundenplan$/.test(t)
            || /^(?:das|es|dies\w*)\s+(?:ist|ist ein|ist der)\s+(?:ein\s+|der\s+)?stundenplan$/.test(t);
    }

    /* ---------- Einhängen in photo.js ---------- */
    window.jvFotoKette.anmelden('parsePhotoRequest', 'foto_stundenplan', 70, function (origParse) {
        return function (text) {
            if (isStundenplan(text)) return { task: 'stundenplan', question: norm(text) };
            return origParse.apply(this, arguments);
        };
    });
    if (typeof window.parseFollowupTask === 'function') {
        window.jvFotoKette.anmelden('parseFollowupTask', 'foto_stundenplan', 70, function (origFollow) {
            return function (text) {
                if (isFollowup(text)) return { task: 'stundenplan', question: norm(text) };
                return origFollow.apply(this, arguments);
            };
        });
    }
    window.jvFotoKette.anmelden('processPhoto', 'foto_stundenplan', 70, function (origProcess) {
        return async function (intent, dataUrl) {
            if (intent && intent.task === 'stundenplan') return processStundenplan(intent, dataUrl);
            return origProcess.apply(this, arguments);
        };
    });
    /* Auswahlkarten nach einem Foto ohne vorherigen Befehl: Karte "Stundenplan merken" dazu (alle bisherigen bleiben) */
    if (typeof window.photoAskWhatToDo === 'function') {
        window.jvFotoKette.anmelden('photoAskWhatToDo', 'foto_stundenplan', 70, function (origAsk) {
            return function () {
                const origCards = window.showActionCards;
                if (typeof origCards !== 'function') return origAsk.apply(this, arguments);
                window.showActionCards = function (list) {
                    try { if (Array.isArray(list)) list.splice(Math.min(1, list.length), 0, { icon: '📚', title: 'Stundenplan merken', subtitle: 'Im Langzeitgedächtnis speichern', onclick: "runLastPhotoTask('stundenplan')" }); } catch (e) {}
                    return origCards.apply(this, arguments);
                };
                try { return origAsk.apply(this, arguments); } finally { window.showActionCards = origCards; }
            };
        });
    }
    if (typeof window.handlePhotoCommand === 'function') {
        window.jvFotoKette.anmelden('handlePhotoCommand', 'foto_stundenplan', 70, function (origCmd) {
            return function (text) {
                try {
                    if (isStundenplan(text) || isFollowup(text)) {
                        const fresh = typeof lastPhoto !== 'undefined' && lastPhoto && Date.now() - lastPhoto.at < (typeof PHOTO_FOLLOWUP_MS !== 'undefined' ? PHOTO_FOLLOWUP_MS : 600000);
                        if (fresh && !/\b(?:neu\w*|fotografier\w*|abfotografier\w*|mach\w*\s+(?:ein\s+)?foto)\b/.test(norm(text))) {
                            runLastPhotoTask('stundenplan', text).catch(() => say('Das Auswerten hat gerade nicht geklappt.'));
                            return true;
                        }
                        photoIntent = { task: 'stundenplan', question: String(text || ''), at: Date.now() };
                        if (typeof showPhotoCards === 'function') showPhotoCards();
                        say('Leg den Stundenplan gut beleuchtet und gerade hin. Tippe unten auf die Karte, dann öffnet sich die Kamera.');
                        return true;
                    }
                } catch (e) { console.error('Stundenplan-Befehl', e); }
                return origCmd.apply(this, arguments);
            };
        });
    }

    /* ---------- Lesen ---------- */
    function prompt() {
        return 'Du liest einen Schulstundenplan von einem Foto. Antworte NUR mit einem JSON-Objekt: ' +
            '{"name":"Name des Kindes, falls auf dem Plan zu lesen, sonst null",' +
            '"stunden":["Zeit der 1. Stunde, z.B. 07:50-08:35, oder leer","Zeit der 2. Stunde", ...],' +
            '"tage":{"Montag":["Fach der 1. Stunde","Fach der 2. Stunde", ...],"Dienstag":[...],"Mittwoch":[...],"Donnerstag":[...],"Freitag":[...]}}. ' +
            'Regeln: Jede Liste eines Tages hat für jede Unterrichtsstunde einen Eintrag, in der Reihenfolge der Stunden von oben nach unten; eine Freistunde oder Lücke ist ein leerer Text "". ' +
            'Schreibe die Fächer genau so ab, wie sie dastehen (auch Abkürzungen wie Ma, D, E, Sp, Raum oder Lehrerkürzel in Klammern, z.B. "Mathe (R12)"). Pausen sind keine Stunden und kommen nicht hinein. ' +
            'Nimm nur Tage, die auf dem Plan stehen. Erfinde nichts; Unleserliches wird "?".';
    }
    function parsePlan(content) {
        const o = (typeof photoJsonObject === 'function' ? photoJsonObject(content) : null) || {};
        const tage = {};
        const src = o.tage && typeof o.tage === 'object' ? o.tage : {};
        Object.keys(src).forEach(k => {
            const low = String(k).toLowerCase().trim();
            const tag = TAGE.find(t => t.toLowerCase() === low) || ABK[low.slice(0, 2)];
            if (!tag) return;
            let arr = src[k];
            if (!Array.isArray(arr)) return;
            arr = arr.map(x => (x && typeof x === 'object') ? String(x.fach || x.name || '') : String(x == null ? '' : x)).map(x => x.trim());
            while (arr.length && !arr[arr.length - 1]) arr.pop();
            if (arr.some(Boolean)) tage[tag] = arr;
        });
        const zeiten = Array.isArray(o.stunden) ? o.stunden.map(x => String(x == null ? '' : x).trim()) : [];
        return { name: (typeof o.name === 'string' && o.name.trim() && !/^null$/i.test(o.name.trim())) ? o.name.trim() : '', tage, zeiten };
    }

    let pending = null;   // { name }

    async function processStundenplan(intent, dataUrl) {
        say('Ich lese den Stundenplan. Einen Moment.');
        let content = '';
        try { content = await askVision(prompt(), 'Lies den Stundenplan von diesem Foto.', dataUrl, true); }
        catch (e) { console.error('Stundenplan', e && e.message); say('Das Lesen hat gerade nicht geklappt. Ist das Foto scharf und gut beleuchtet?'); return; }
        const plan = parsePlan(content);
        const tageN = Object.keys(plan.tage).length;
        if (!tageN) { say('Ich konnte auf dem Foto keinen Stundenplan erkennen. Ist er scharf, gerade und ganz im Bild?'); return; }
        const name = personFrom(intent && intent.question) || standardName();
        zeigeFenster(plan, name);
        say('Ich habe den Stundenplan gelesen, ' + tageN + ' Tage. Bitte prüfe ihn. Zellen lassen sich antippen und ändern. Dann tippst du auf Speichern, und ich merke ihn mir für ' + name + '.');
    }

    /* ---------- Fenster ---------- */
    function css() {
        if (document.getElementById('jvSpCss')) return;
        const st = document.createElement('style'); st.id = 'jvSpCss';
        st.textContent =
            '#jvSp{position:fixed;inset:0;z-index:99999;background:rgba(3,8,16,.97);display:flex;flex-direction:column;padding:12px;gap:10px;color:#e8f6ff;font-family:inherit;box-sizing:border-box}' +
            '#jvSp .sp-head{display:flex;justify-content:space-between;align-items:center;font-size:15px;letter-spacing:.08em;color:#5ee7ff;gap:8px}' +
            '#jvSp .sp-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}' +
            '#jvSp button{background:rgba(94,231,255,.1);border:1px solid #5ee7ff;color:#5ee7ff;border-radius:8px;font-size:16px;padding:8px 14px;cursor:pointer;font-family:inherit}' +
            '#jvSp button.primary{background:#5ee7ff;color:#03111a;font-weight:700}' +
            '#jvSp input{font-size:16px;padding:7px 10px;border-radius:8px;border:1px solid #5ee7ff;background:#07131d;color:#e8f6ff;width:9em;font-family:inherit}' +
            '#jvSp .sp-body{flex:1;overflow:auto;padding:8px;border-radius:10px;background:#fff;color:#000;font:14px/1.35 Arial,Helvetica,sans-serif}' +
            '#jvSp table{border-collapse:collapse;width:100%;table-layout:fixed}' +
            '#jvSp th,#jvSp td{border:1px solid #666;padding:5px 3px;text-align:left;vertical-align:top;word-break:break-word;font-size:13px}' +
            '#jvSp th:first-child,#jvSp td.nr{width:3.6em}#jvSp td.nr small{display:block;font-weight:400;font-size:9px;color:#444}' +
            '#jvSp th{background:#e8eef2}#jvSp td.nr{background:#f3f6f8;font-weight:700}' +
            '#jvSp .sp-note{font-size:12px;color:#8fb9c9}';
        document.head.appendChild(st);
    }

    function zeigeFenster(plan, name) {
        css();
        const old = document.getElementById('jvSp'); if (old) old.remove();
        const tage = TAGE.filter(t => plan.tage[t]);
        const n = Math.max.apply(null, tage.map(t => plan.tage[t].length).concat([plan.zeiten.length]));
        const wrap = document.createElement('div'); wrap.id = 'jvSp';
        const head = document.createElement('div'); head.className = 'sp-head';
        const title = document.createElement('span'); title.textContent = 'STUNDENPLAN · PRÜFEN'; head.appendChild(title);
        const x = document.createElement('button'); x.textContent = '✕'; x.setAttribute('aria-label', 'Schließen'); x.addEventListener('click', () => wrap.remove()); head.appendChild(x);

        const bar = document.createElement('div'); bar.className = 'sp-bar';
        const lab = document.createElement('span'); lab.textContent = 'Für:'; bar.appendChild(lab);
        const inp = document.createElement('input'); inp.type = 'text'; inp.value = name; inp.setAttribute('aria-label', 'Name'); bar.appendChild(inp);
        const note = document.createElement('div'); note.className = 'sp-note'; note.textContent = 'Fächer prüfen und bei Fehlern direkt in die Zelle tippen. Gespeichert wird pro Wochentag ein Eintrag; ein alter Plan dieser Person wird ersetzt.';

        const body = document.createElement('div'); body.className = 'sp-body';
        const tbl = document.createElement('table');
        const hr = document.createElement('tr');
        const h0 = document.createElement('th'); h0.textContent = 'Std.'; hr.appendChild(h0);
        tage.forEach(t => { const th = document.createElement('th'); th.textContent = t.slice(0, 2); th.title = t; hr.appendChild(th); });
        tbl.appendChild(hr);
        for (let i = 0; i < n; i++) {
            const tr = document.createElement('tr');
            const nr = document.createElement('td'); nr.className = 'nr';
            nr.textContent = (i + 1) + '.';
            if (plan.zeiten[i]) { const sm = document.createElement('small'); sm.textContent = plan.zeiten[i]; nr.appendChild(sm); }
            tr.appendChild(nr);
            tage.forEach(t => { const td = document.createElement('td'); td.textContent = plan.tage[t][i] || ''; td.contentEditable = 'true'; td.dataset.tag = t; tr.appendChild(td); });
            tbl.appendChild(tr);
        }
        body.appendChild(tbl);

        const save = document.createElement('button'); save.type = 'button'; save.className = 'primary'; save.textContent = '💾 Speichern';
        save.addEventListener('click', async () => {
            const nm = cap(inp.value.trim()) || standardName();
            const out = {}; tage.forEach(t => { out[t] = []; });
            Array.prototype.slice.call(tbl.rows, 1).forEach(r => { Array.prototype.slice.call(r.cells, 1).forEach(td => { out[td.dataset.tag].push(td.textContent.trim()); }); });
            tage.forEach(t => { while (out[t].length && !out[t][out[t].length - 1]) out[t].pop(); });
            save.disabled = true; note.textContent = 'Speichere ...';
            try {
                const k = await speichern(nm, out, plan.zeiten);
                lsSet(NAME_KEY, nm);
                wrap.remove();
                say('Gespeichert: der Stundenplan von ' + nm + ', ' + k + ' Tage. Du kannst mich jetzt zum Beispiel fragen: Was hat ' + nm + ' morgen in der dritten Stunde?');
            } catch (e) {
                console.error('Stundenplan speichern', e);
                save.disabled = false; note.textContent = 'Das Speichern hat nicht geklappt: ' + String((e && e.message) || e).slice(0, 120);
            }
        });
        bar.appendChild(save);

        wrap.appendChild(head); wrap.appendChild(bar); wrap.appendChild(body); wrap.appendChild(note);
        document.body.appendChild(wrap);
    }

    /* ---------- Speichern: pro Wochentag ein Eintrag; fester Name der ID, damit ein neuer Plan den alten überschreibt ---------- */
    function tagText(name, tag, arr, zeiten) {
        const parts = [];
        arr.forEach((f, i) => { parts.push((i + 1) + '. ' + (f || '(frei)')); });
        let s = 'Stundenplan von ' + name + ', ' + tag + ': ' + parts.join(', ') + '.';
        const z = (zeiten || []).map((x, i) => x ? (i + 1) + '. ' + x : '').filter(Boolean);
        if (z.length) s += ' Stundenzeiten: ' + z.join(', ') + '.';
        return s.slice(0, 1900);
    }
    async function speichern(name, tage, zeiten) {
        const heute = todayIso();
        const neu = Object.keys(tage).filter(t => tage[t].some(Boolean));
        if (!neu.length) throw new Error('Der Plan ist leer.');
        const ids = {};
        for (const t of neu) {
            const id = 'stundenplan_' + slug(name) + '_' + t.toLowerCase();
            ids[id] = true;
            await post({
                action: 'store', id, text: tagText(name, t, tage[t], zeiten),
                metadata: { typ: 'episode', kategorie: 'Stundenplan', person: name, wochentag: t, quelle: 'foto', datum_gesagt: heute, status: 'ohne_nachfrage', anstoss_aus: true }
            });
        }
        // Tage, die im neuen Plan fehlen (z.B. früher Freitag), aus dem alten Plan entfernen
        try {
            const d = await post({ action: 'listall' });
            const weg = (d.eintraege || []).filter(e => e && e.metadata && e.metadata.kategorie === 'Stundenplan' && slug(e.metadata.person) === slug(name) && !ids[e.id]).map(e => e.id);
            if (weg.length) await post({ action: 'delete', ids: weg });
        } catch (e) { /* Aufräumen ist nur eine Zugabe */ }
        cache = null;
        return neu.length;
    }

    /* ---------- Fragen zum Stundenplan: Einträge gezielt ins Gedächtnis-Paket legen ---------- */
    let cache = null;   // { t, liste }
    async function alleStundenplan() {
        if (cache && Date.now() - cache.t < 60000) return cache.liste;
        const d = await post({ action: 'listall' });
        const liste = (d.eintraege || []).filter(e => e && e.metadata && e.metadata.kategorie === 'Stundenplan' && e.text)
            .map(e => ({ tag: e.metadata.wochentag, person: e.metadata.person, text: e.text }));
        cache = { t: Date.now(), liste };
        return liste;
    }
    const SCHULE = /stundenplan|\bschule\b|\bschul\w*|\bstunde\b|\bstunden\b|unterricht|hausaufgab|sportzeug|turnbeutel|\bfach\b|\bf(?:ä|ae)cher\b|\bsport\b|\bmathe\w*|\bdeutsch\b|\benglisch\b|mitnehmen|mitbringen|freistunde|schulfrei|\bpause\b/;
    function tagAusFrage(t) {
        const now = new Date();
        const wd = d => ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d];
        const berlin = off => { const x = new Date(now.getTime() + off * 86400000); return wd(new Date(x.toLocaleString('en-US', { timeZone: 'Europe/Berlin' })).getDay()); };
        const m = t.match(/\b(montag|dienstag|mittwoch|donnerstag|freitag|samstag)\b/);
        if (m) return cap(m[1]);
        if (/\bübermorgen\b/.test(t)) return berlin(2);
        if (/\bmorgen\b/.test(t) && !/\bmorgens\b/.test(t)) return berlin(1);
        if (/\bheute\b/.test(t)) return berlin(0);
        return '';
    }
    const origSearch = window.searchSemanticMemory;
    if (typeof origSearch === 'function') {
        window.searchSemanticMemory = async function (text) {
            const basis = await origSearch.apply(this, arguments);
            try {
                const t = norm(text);
                if (!SCHULE.test(t)) return basis;
                const liste = await alleStundenplan();
                if (!liste.length) return basis;
                let tag = tagAusFrage(t);
                if (tag === 'Sonntag' || tag === 'Samstag') tag = 'Montag';
                const treffer = (tag ? liste.filter(e => e.tag === tag) : liste).map(e => e.text);
                const rest = (Array.isArray(basis) ? basis : []).filter(x => !treffer.some(y => String(x).includes(y.slice(0, 40))));
                return treffer.concat(rest);
            } catch (e) { return basis; }
        };
    }
    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'stundenplan', function (next) {
            let base = next();
            try {
                if (cache && cache.liste && cache.liste.length) base += '\n\nStundenplan: Einträge "Stundenplan von <Name>, <Wochentag>: 1. …, 2. …" in gedächtnis_semantisch sind der Schulstundenplan des Kindes. Antworte aus ihnen genau und knapp. "Morgen" und "heute" sind der Wochentag von morgen bzw. heute; am Wochenende gilt der Montag. "(frei)" ist eine Freistunde. Steht der Tag nicht im Plan, hat das Kind dann keinen Unterricht. Erfinde keine Fächer.';
            } catch (e) {}
            return base;
        }, 210);
    }
    // Plan beim Start einmal vormerken, damit der Hinweis oben schon beim ersten Mal im Prompt steht
    setTimeout(() => { alleStundenplan().catch(() => {}); }, 4000);

    window.jvStundenplan = { isStundenplan, isFollowup, parsePlan, tagText, personFrom };
})();
