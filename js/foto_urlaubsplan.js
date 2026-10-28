/* ============================================================
   URLAUBSPLAN FOTOGRAFIEREN: Der Jahres-Urlaubszettel (z. B. "Urlaubsplanung 2027" mit mehreren Zeiträumen) wird fotografiert.
   Jarvis liest alle Zeiträume vom Foto und zeigt sie zum Prüfen (Daten und Tage lassen sich ändern, Zeilen löschen oder dazufügen).
   Er zählt mit: verplante Tage, nötige Tage (z. B. "25 Tage verplanen") und Jahresanspruch (z. B. 30). Stimmt die Tageszahl vom Zettel nicht mit
   Montag bis Freitag überein, steht ein Hinweis in der Zeile (so fällt ein falsch gelesenes Datum auf).
   Nach deinem Tipp auf "Eintragen" wird alles gespeichert: in der Urlaubsliste von Jarvis (js/urlaub.js, dort wird immer der aktuelle
   oder nächste Urlaub für die Arbeitsweg-Stille benutzt) und als ganztägige Termine "Urlaub" im Google Kalender (nur einmal pro Zeitraum).
   Aufrufen:
   - vorher: "Urlaubsplan fotografieren", "Urlaubszettel einlesen", "Trag meinen Urlaubsplan ein"
   - danach (Foto ist schon gemacht): Karte "Urlaubsplan eintragen" oder "Merk dir das als Urlaubsplan"; die Foto-Erkennung erkennt den Zettel auch selbst
   Fragen danach: "Wie viele Urlaubstage habe ich verplant?", "Zeig meinen Urlaubsplan", "Urlaubsplan löschen" (Kalendereinträge bleiben)
   Speicher: jv_urlaub_liste (js/urlaub.js, wird gesichert), jv_urlaub_meta (Anspruch, Pflicht, Abgabe, Jahr).
   Hängt sich in photo.js ein und muss nach urlaub.js, calendar.js und foto_essensplan.js, aber vor foto_erkennen.js geladen werden.
   Benutzt: askVision, photoJsonObject, photoSay, lastPhoto, runLastPhotoTask, addGoogleCalendarEvent, window.jvUrlaub, jvCommands.
   ============================================================ */
(function () {
    if (typeof window.processPhoto !== 'function' || typeof window.parsePhotoRequest !== 'function') return;

    const META = 'jv_urlaub_meta';
    function say(msg) {
        if (typeof photoSay === 'function') photoSay(msg);
        else speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    }
    function sagen(msg) { try { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function norm(text) { return String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function meta() { try { return JSON.parse(lsGet(META) || 'null') || {}; } catch (e) { return {}; } }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function isoOk(s) { return /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !isNaN(Date.parse(s + 'T12:00:00')); }
    function lesbar(s) { try { return new Date(s + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long' }); } catch (e) { return s; } }
    function kurz(s) { return isoOk(s) ? s.slice(8) + '.' + s.slice(5, 7) + '.' : ''; }

    /* Werktage Montag bis Freitag von..bis (Feiertage zählt Jarvis hier nicht mit) */
    function werktage(von, bis) {
        if (!isoOk(von) || !isoOk(bis) || bis < von) return 0;
        let n = 0; const d = new Date(von + 'T12:00:00'), e = new Date(bis + 'T12:00:00');
        for (let g = 0; d <= e && g < 400; g++) { const w = d.getDay(); if (w !== 0 && w !== 6) n++; d.setDate(d.getDate() + 1); }
        return n;
    }
    function summe(l) { return l.reduce((s, x) => s + (+x.tage || 0), 0); }

    /* ---------- Erkennen (Foto) ---------- */
    const WORT = /urlaubs?\s?(?:plan|planung|zettel|liste|antrag|formular)/;
    const ACT = /\b(?:merk\w*|speicher\w*|fotografier\w*|abfotografier\w*|einles\w*|les\w*|ablegen|leg\w*|aufnehm\w*|aufschreib\w*|hinterleg\w*|einscann\w*|scann\w*|abspeicher\w*|eintrag\w*|trag\w*|übernehm\w*)\b/;
    function isPlan(text) {
        const t = norm(text);
        if (!t || t.length > 110 || !WORT.test(t)) return false;
        if (/^(?:was|wann|welche\w*|wie|wo|hat|haben|gibt|zeig\w*|öffne\w*|oeffne\w*|loesch\w*|lösch\w*)\b/.test(t)) return false;
        return ACT.test(t);
    }
    function isFollowup(text) {
        const t = norm(text);
        if (!t || t.length > 80) return false;
        return /^(?:(?:jarvis|zane) )?(?:bitte )?(?:merk|merke|speicher|speichere|trag|trage)\w*\s+(?:dir\s+|mir\s+)?(?:das|dies\w*|es)\s+(?:bitte\s+)?(?:als|im|als meinen|ein als)\s+(?:den\s+)?urlaubs?\s?(?:plan|planung|zettel)/.test(t)
            || /^(?:das|es|dies\w*)\s+(?:ist|ist ein|ist der|ist mein)\s+(?:ein\s+|der\s+|mein\s+)?(?:jahres\s?)?(?:urlaubs?\s?(?:plan|planung|zettel)|jahresurlaub)$/.test(t);
    }

    window.jvFotoKette.anmelden('parsePhotoRequest', 'foto_urlaubsplan', 50, function (origParse) {
        return function (text) {
            if (isPlan(text)) return { task: 'urlaubsplan', question: norm(text) };
            return origParse.apply(this, arguments);
        };
    });
    if (typeof window.parseFollowupTask === 'function') {
        window.jvFotoKette.anmelden('parseFollowupTask', 'foto_urlaubsplan', 50, function (origFollow) {
            return function (text) {
                if (isFollowup(text)) return { task: 'urlaubsplan', question: norm(text) };
                return origFollow.apply(this, arguments);
            };
        });
    }
    window.jvFotoKette.anmelden('processPhoto', 'foto_urlaubsplan', 50, function (origProcess) {
        return async function (intent, dataUrl) {
            if (intent && intent.task === 'urlaubsplan') return verarbeiten(dataUrl);
            return origProcess.apply(this, arguments);
        };
    });
    if (typeof window.photoAskWhatToDo === 'function') {
        window.jvFotoKette.anmelden('photoAskWhatToDo', 'foto_urlaubsplan', 50, function (origAsk) {
            return function () {
                const origCards = window.showActionCards;
                if (typeof origCards !== 'function') return origAsk.apply(this, arguments);
                window.showActionCards = function (list) {
                    try { if (Array.isArray(list)) list.splice(Math.min(1, list.length), 0, { icon: '🌴', title: 'Urlaubsplan eintragen', subtitle: 'Zettel lesen, Urlaub und Kalender eintragen', onclick: "runLastPhotoTask('urlaubsplan')" }); } catch (e) { }
                    return origCards.apply(this, arguments);
                };
                try { return origAsk.apply(this, arguments); } finally { window.showActionCards = origCards; }
            };
        });
    }
    if (typeof window.handlePhotoCommand === 'function') {
        window.jvFotoKette.anmelden('handlePhotoCommand', 'foto_urlaubsplan', 50, function (origCmd) {
            return function (text) {
                try {
                    if (isPlan(text) || isFollowup(text)) {
                        const fresh = typeof lastPhoto !== 'undefined' && lastPhoto && Date.now() - lastPhoto.at < (typeof PHOTO_FOLLOWUP_MS !== 'undefined' ? PHOTO_FOLLOWUP_MS : 600000);
                        if (fresh && !/\b(?:neu\w*|fotografier\w*|abfotografier\w*|mach\w*\s+(?:ein\s+)?foto)\b/.test(norm(text))) {
                            runLastPhotoTask('urlaubsplan', text).catch(() => say('Das Auswerten hat gerade nicht geklappt.'));
                            return true;
                        }
                        photoIntent = { task: 'urlaubsplan', question: String(text || ''), at: Date.now() };
                        if (typeof showPhotoCards === 'function') showPhotoCards();
                        say('Leg den Urlaubszettel gut beleuchtet und gerade hin. Tippe unten auf die Karte, dann öffnet sich die Kamera.');
                        return true;
                    }
                } catch (e) { console.error('Urlaubsplan-Befehl', e); }
                return origCmd.apply(this, arguments);
            };
        });
    }

    /* ---------- Lesen ---------- */
    function prompt() {
        return 'Du liest einen Urlaubsplanungs-Zettel (Formular für Jahresurlaub) von einem Foto. Antworte NUR mit einem JSON-Objekt: ' +
            '{"jahr":Jahreszahl aus der Überschrift (zum Beispiel 2027) oder null,"anspruch":Gesamtanspruch an Urlaubstagen oder null,"resttage":Resttage aus dem Vorjahr oder null,' +
            '"pflicht":Anzahl Tage, die laut Hinweis verplant werden müssen, oder null,"abgabe":"JJJJ-MM-TT" oder null,' +
            '"zeitraeume":[{"von":"JJJJ-MM-TT","bis":"JJJJ-MM-TT oder null, wenn nur ein Tag eingetragen ist","tage":Zahl der Tage laut Zettel oder null,"unsicher":true oder false}]}. ' +
            'Regeln: Nimm nur ausgefüllte Zeilen, keine leeren. Daten stehen meist als Tag.Monat. (zum Beispiel 30.3. bis 2.4.), das Jahr kommt aus der Überschrift. ' +
            'Ist eine Ziffer überschrieben oder schlecht lesbar, gib deine beste Lesart und setze "unsicher" auf true. Erfinde nichts.';
    }
    function parse(content) {
        const o = (typeof photoJsonObject === 'function' ? photoJsonObject(content) : null) || {};
        const num = v => { const n = parseInt(v, 10); return isNaN(n) ? null : n; };
        const jahr = num(o.jahr) || (new Date().getFullYear() + 1);
        const liste = [];
        (Array.isArray(o.zeitraeume) ? o.zeitraeume : []).forEach(z => {
            if (!z) return;
            let von = String(z.von || '').trim(), bis = String(z.bis || '').trim();
            if (!isoOk(von)) return;
            if (!isoOk(bis)) bis = von;
            if (bis < von) { const x = von; von = bis; bis = x; }
            liste.push({ von, bis, tage: num(z.tage), unsicher: z.unsicher === true || z.unsicher === 'true' });
        });
        liste.sort((a, b) => a.von < b.von ? -1 : a.von > b.von ? 1 : 0);
        return { jahr, anspruch: num(o.anspruch), resttage: num(o.resttage), pflicht: num(o.pflicht), abgabe: isoOk(o.abgabe) ? o.abgabe : '', liste };
    }
    async function verarbeiten(dataUrl) {
        say('Ich lese den Urlaubszettel. Einen Moment.');
        let content = '';
        try { content = await askVision(prompt(), 'Lies den Urlaubszettel von diesem Foto.', dataUrl, true); }
        catch (e) { console.error('Urlaubsplan', e && e.message); say('Das Lesen hat gerade nicht geklappt. Ist das Foto scharf und gut beleuchtet?'); return; }
        const p = parse(content);
        if (!p.liste.length) { say('Ich konnte auf dem Foto keine Urlaubszeiten erkennen. Ist der Zettel scharf, gerade und ganz im Bild?'); return; }
        zeigeFenster(p);
        const unsicher = p.liste.filter(x => x.unsicher || (x.tage && x.tage !== werktage(x.von, x.bis))).length;
        say('Ich habe ' + p.liste.length + (p.liste.length === 1 ? ' Urlaubszeit' : ' Urlaubszeiten') + ' gelesen.' +
            (unsicher ? ' Bei ' + unsicher + ' bin ich nicht sicher, die sind markiert.' : '') + ' Bitte prüfe sie und tippe dann auf Eintragen.');
    }

    /* ---------- Fenster ---------- */
    function css() {
        if (document.getElementById('jvUpCss')) return;
        const st = document.createElement('style'); st.id = 'jvUpCss';
        st.textContent =
            '#jvUp{position:fixed;inset:0;z-index:99999;background:rgba(3,8,16,.97);display:flex;flex-direction:column;padding:12px;gap:10px;color:#e8f6ff;font-family:inherit;box-sizing:border-box}' +
            '#jvUp .up-head{display:flex;justify-content:space-between;align-items:center;font-size:15px;letter-spacing:.08em;color:#5ee7ff;gap:8px}' +
            '#jvUp button{background:rgba(94,231,255,.1);border:1px solid #5ee7ff;color:#5ee7ff;border-radius:8px;font-size:16px;padding:8px 14px;cursor:pointer;font-family:inherit}' +
            '#jvUp button.primary{background:#5ee7ff;color:#03111a;font-weight:700}' +
            '#jvUp .up-body{flex:1;overflow:auto;display:flex;flex-direction:column;gap:8px}' +
            '#jvUp .up-row{display:grid;grid-template-columns:1fr 1fr 62px 34px;gap:6px;align-items:center;padding:8px;border:1px solid rgba(94,231,255,.35);border-radius:10px;background:rgba(94,231,255,.05)}' +
            '#jvUp .up-row.warn{border-color:#ffb347;background:rgba(255,179,71,.09)}' +
            '#jvUp input{width:100%;box-sizing:border-box;background:#fff;color:#000;border:0;border-radius:6px;padding:8px 6px;font-size:15px;font-family:inherit;min-width:0}' +
            '#jvUp .up-hint{grid-column:1/-1;font-size:12px;color:#ffb347}' +
            '#jvUp .up-sum{font-size:14px;color:#cfeeff;line-height:1.4}#jvUp .up-note{font-size:12px;color:#8fb9c9}';
        document.head.appendChild(st);
    }
    function zeigeFenster(p) {
        css();
        const old = document.getElementById('jvUp'); if (old) old.remove();
        const m = meta();
        const anspruch = p.anspruch != null ? p.anspruch : (m.anspruch != null ? m.anspruch : null);
        const pflicht = p.pflicht != null ? p.pflicht : (m.pflicht != null ? m.pflicht : null);
        const abgabe = p.abgabe || m.abgabe || '';
        const wrap = document.createElement('div'); wrap.id = 'jvUp';
        const head = document.createElement('div'); head.className = 'up-head';
        const title = document.createElement('span'); title.textContent = 'URLAUBSPLAN' + (p.jahr ? ' ' + p.jahr : '') + ' · PRÜFEN'; head.appendChild(title);
        const x = document.createElement('button'); x.textContent = '✕'; x.setAttribute('aria-label', 'Schließen'); x.onclick = () => wrap.remove(); head.appendChild(x);
        const body = document.createElement('div'); body.className = 'up-body';
        const sum = document.createElement('div'); sum.className = 'up-sum';
        const note = document.createElement('div'); note.className = 'up-note';
        note.textContent = 'Daten und Tage lassen sich ändern. Orange = Zettel und Wochentage passen nicht zusammen (Feiertage zählt Jarvis nicht mit). Ein alter Plan wird ersetzt.';

        function werte() {
            return Array.prototype.map.call(body.querySelectorAll('.up-row'), r => ({
                von: r.querySelector('.v').value, bis: r.querySelector('.b').value || r.querySelector('.v').value,
                tage: parseInt(r.querySelector('.t').value, 10) || 0, kal: r.dataset.kal === '1'
            })).filter(e => isoOk(e.von) && isoOk(e.bis) && e.bis >= e.von);
        }
        function rechne() {
            Array.prototype.forEach.call(body.querySelectorAll('.up-row'), r => {
                const v = r.querySelector('.v').value, b = r.querySelector('.b').value || v, t = parseInt(r.querySelector('.t').value, 10) || 0;
                const w = werktage(v, b), h = r.querySelector('.up-hint');
                const bad = isoOk(v) && isoOk(b) && (t !== w || r.dataset.unsicher === '1');
                r.classList.toggle('warn', bad);
                h.style.display = bad ? '' : 'none';
                h.textContent = t !== w ? '⚠ Zettel: ' + t + ' Tage, Montag bis Freitag gezählt: ' + w + '. Datum richtig gelesen?' : '⚠ Hier war die Schrift schlecht lesbar.';
            });
            const l = werte(), s = summe(l);
            let txt = 'Verplant: ' + s + ' Tage';
            if (pflicht != null) txt += ' · nötig: ' + pflicht + (s >= pflicht ? ' ✓' : ' (noch ' + (pflicht - s) + ')');
            if (anspruch != null) txt += ' · Anspruch: ' + anspruch + (s <= anspruch ? ' (Rest ' + (anspruch - s) + ')' : ' ⚠ mehr als Anspruch');
            if (abgabe) txt += ' · Abgabe bis ' + kurz(abgabe) + abgabe.slice(0, 4).slice(2);
            sum.textContent = txt;
        }
        function zeile(e) {
            const r = document.createElement('div'); r.className = 'up-row'; r.dataset.kal = e.kal ? '1' : ''; r.dataset.unsicher = e.unsicher ? '1' : '';
            const v = document.createElement('input'); v.type = 'date'; v.className = 'v'; v.value = e.von || '';
            const b = document.createElement('input'); b.type = 'date'; b.className = 'b'; b.value = e.bis || '';
            const t = document.createElement('input'); t.type = 'number'; t.className = 't'; t.min = '0'; t.max = '60'; t.value = e.tage != null ? e.tage : werktage(e.von, e.bis);
            const del = document.createElement('button'); del.type = 'button'; del.textContent = '✕'; del.setAttribute('aria-label', 'Zeile löschen'); del.style.padding = '6px 0';
            const h = document.createElement('div'); h.className = 'up-hint'; h.style.display = 'none';
            let tagUnberuehrt = e.tage == null;
            t.addEventListener('input', () => { tagUnberuehrt = false; r.dataset.unsicher = ''; rechne(); });
            [v, b].forEach(inp => inp.addEventListener('change', () => {
                r.dataset.kal = ''; r.dataset.unsicher = '';   // geändert: gilt nicht mehr als schon im Kalender und ist von dir geprüft
                if (tagUnberuehrt) t.value = werktage(v.value, b.value || v.value);
                rechne();
            }));
            del.onclick = () => { r.remove(); rechne(); };
            r.appendChild(v); r.appendChild(b); r.appendChild(t); r.appendChild(del); r.appendChild(h);
            return r;
        }
        const kopf = document.createElement('div'); kopf.className = 'up-note'; kopf.textContent = 'Von · Bis · Tage';
        body.appendChild(kopf);
        p.liste.forEach(e => body.appendChild(zeile(e)));
        const plus = document.createElement('button'); plus.type = 'button'; plus.textContent = '＋ Zeile';
        plus.onclick = () => { body.insertBefore(zeile({ von: '', bis: '', tage: null }), plus); rechne(); };
        body.appendChild(plus);
        const save = document.createElement('button'); save.type = 'button'; save.className = 'primary'; save.textContent = '📅 Eintragen';
        save.onclick = async () => {
            const l = werte();
            if (!l.length) { say('Es ist noch keine Urlaubszeit mit Datum eingetragen.'); return; }
            save.disabled = true; save.textContent = 'Trage ein ...';
            wrap.remove();
            await eintragen(l.sort((a, b) => a.von < b.von ? -1 : 1), { jahr: p.jahr, anspruch, pflicht, abgabe });
        };
        wrap.appendChild(head); wrap.appendChild(sum); wrap.appendChild(save); wrap.appendChild(body); wrap.appendChild(note);
        document.body.appendChild(wrap);
        rechne();
    }

    /* ---------- Eintragen ---------- */
    async function eintragen(l, info) {
        lsSet(META, JSON.stringify({ jahr: info.jahr, anspruch: info.anspruch, pflicht: info.pflicht, abgabe: info.abgabe }));
        let imKalender = 0, nurApp = 0;
        for (const e of l) {
            if (e.kal) { imKalender++; continue; }
            try {
                if (typeof addGoogleCalendarEvent !== 'function') { nurApp++; continue; }
                const ok = await addGoogleCalendarEvent('Urlaub 🌴', e.von + 'T12:00:00', '', null, true, e.bis);
                if (ok) { e.kal = true; imKalender++; } else nurApp++;
            } catch (err) { console.error('Urlaub Kalender', err); nurApp++; }
        }
        if (window.jvUrlaub && window.jvUrlaub.setListe) window.jvUrlaub.setListe(l.map(e => ({ von: e.von, bis: e.bis, tage: e.tage, kal: !!e.kal })));
        const s = summe(l);
        let msg = 'Eingetragen: ' + l.length + (l.length === 1 ? ' Urlaubszeit' : ' Urlaubszeiten') + ', zusammen ' + s + ' Tage.';
        if (info.pflicht != null) msg += s >= info.pflicht ? ' Das reicht für die geforderten ' + info.pflicht + ' Tage.' : ' Es fehlen noch ' + (info.pflicht - s) + ' Tage bis zu den geforderten ' + info.pflicht + '.';
        if (info.anspruch != null && s <= info.anspruch) msg += ' Von ' + info.anspruch + ' Tagen bleiben ' + (info.anspruch - s) + ' übrig.';
        if (info.anspruch != null && s > info.anspruch) msg += ' Achtung, das sind mehr als dein Anspruch von ' + info.anspruch + ' Tagen.';
        if (nurApp) msg += ' Im Google Kalender konnte ich ' + nurApp + (nurApp === 1 ? ' Eintrag' : ' Einträge') + ' nicht anlegen, die stehen nur in der App. Verbinde Google und sag den Plan dann noch einmal.';
        else msg += ' Alle stehen auch im Google Kalender.';
        say(msg);
    }

    /* ---------- Fragen ---------- */
    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.split(' ').length > 14) return next(text);
        const U = window.jvUrlaub;
        const l = U && U.liste ? U.liste() : [];
        const plan = WORT.test(t), tage = /urlaubs?\s?tage?/.test(t) || /resturlaub/.test(t);
        if (!plan && !tage) return next(text);
        if (plan && /\b(?:loesch\w*|lösch\w*|entfern\w*)\b/.test(t)) {
            if (!l.length) { sagen('Es ist kein Urlaubsplan gespeichert.'); return true; }
            if (U.setListe) U.setListe([]);
            lsSet(META, ''); sagen('Der Urlaubsplan ist gelöscht. Die Termine im Google Kalender bleiben stehen, die löschst du dort.'); return true;
        }
        if (plan && /\b(?:zeig\w*|anzeigen|oeffne\w*|öffne\w*|ändern|aendern|bearbeit\w*)\b/.test(t)) {
            if (!l.length) { sagen('Es ist kein Urlaubsplan gespeichert. Sag zum Beispiel: Urlaubsplan fotografieren.'); return true; }
            const m = meta();
            zeigeFenster({ jahr: m.jahr || +l[0].von.slice(0, 4), anspruch: m.anspruch != null ? m.anspruch : null, pflicht: m.pflicht != null ? m.pflicht : null, abgabe: m.abgabe || '', liste: l.map(e => ({ von: e.von, bis: e.bis, tage: e.tage, kal: !!e.kal })) });
            sagen('Hier ist dein Urlaubsplan.'); return true;
        }
        if ((tage || plan) && /\b(?:wie\s?viele?|wieviel\w*|noch|verplant|übrig|uebrig|rest\w*|offen|fehlen)\b/.test(t)) {
            if (!l.length) { sagen('Es ist kein Urlaubsplan gespeichert.'); return true; }
            const m = meta(), s = summe(l);
            let msg = 'Du hast ' + l.length + (l.length === 1 ? ' Urlaubszeit' : ' Urlaubszeiten') + ' mit zusammen ' + s + ' Tagen verplant.';
            if (m.anspruch != null) msg += ' Bei ' + m.anspruch + ' Tagen Anspruch sind das noch ' + Math.max(0, m.anspruch - s) + ' offen.';
            if (m.pflicht != null) msg += s >= m.pflicht ? ' Die geforderten ' + m.pflicht + ' Tage sind erreicht.' : ' Verlangt sind ' + m.pflicht + ', es fehlen ' + (m.pflicht - s) + '.';
            sagen(msg); return true;
        }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('urlaubsplan', befehl, 118);

    window.jvUrlaubsplan = { isPlan, isFollowup, parse, werktage };
})();
