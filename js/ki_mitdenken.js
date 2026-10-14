/* ============================================================
   KI-MITDENKEN: Die KI soll nicht nur antworten, sondern mitdenken und handeln.
   Ergänzt die Anweisung (buildSystemPrompt) um einen Zusatz, der Zane wie einen vorausdenkenden Partner arbeiten lässt:
   Er prüft bei jeder Antwort still, ob sich aus Terminen, Erinnerungen, Einkaufsliste, Aufgaben, Wetter, Standort und Langzeitgedächtnis etwas ergibt,
   das den Nutzer jetzt betrifft, und sagt es in EINEM kurzen Satz nach der Antwort (Überschneidung, Wetter zum Termin, fehlende Einkäufe, Zeitkritisches ...).
   Zwei Stufen: "aktiv" (Standard, denkt bei fast jeder Antwort mit) und "normal" (nur bei offensichtlichem Anlass, wie bisher).
   Die Antworten werden laut vorgelesen, darum bleibt alles kurz. Geändert wird nur der Text für die KI, sonst nichts.
   Per Sprache: "Mitdenken mehr" / "Mitdenken weniger" (auch: "Denk mehr mit", "Denk weniger mit"), "KI-Mitdenken aus" / "KI-Mitdenken an".
   Speicher: jv_ki_mitdenken ('0' = aus) und jv_ki_mitdenken_stufe ('aktiv' oder 'normal').
   Braucht: commands.js (jvChain, jvCommands). Kann an beliebiger Stelle nach commands.js geladen werden.
   ============================================================ */
(function () {
    const KEY = 'jv_ki_mitdenken';
    const KEY_STUFE = 'jv_ki_mitdenken_stufe';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) !== '0';
    const stufe = () => (lsGet(KEY_STUFE) === 'normal' ? 'normal' : 'aktiv');

    // Stufe "normal": wie bisher, nur bei offensichtlichem Anlass
    const HINWEIS_NORMAL = '\n\nZUSATZ Mitdenken (du bist ein Partner, der handelt, nicht nur antwortet):\n' +
        '- Verknüpfe das Gesagte still mit dem, was du schon weißt (gedaechtnis_semantisch, Termine, Erinnerungen, Wetter, Schicht im Kontext). Baue dieses Wissen selbstverständlich in die Antwort ein; sage nie "laut meinem Gedächtnis" oder "ich habe gespeichert, dass".\n' +
        '- Hat deine Antwort einen offensichtlich sinnvollen nächsten Schritt (z.B. Termin eingetragen und die Fahrzeit ist unklar, Regen zum Termin im Freien, Überschneidung mit der Schicht, Einkauf fehlt für ein Vorhaben), biete ihn in EINEM kurzen Satz am Ende an. Höchstens ein Vorschlag pro Antwort. Kein Vorschlag bei Warnungen, Gesundheit, Geld, Trauer, Notfällen, wenn du schon eine Rückfrage stellst oder wenn nichts wirklich Sinnvolles naheliegt. Nie etwas als erledigt melden, wofür du keine Aktion angelegt hast.\n' +
        '- Teilt der User etwas Dauerhaftes mit (feste Abläufe, Gewohnheiten, Geräte, Vorlieben, Menschen in seinem Leben), merke es dir selbstständig mit der passenden Aktion (Langzeitgedächtnis) und bestätige nur kurz. Ändert sich ein Fakt, aktualisiere den alten Eintrag statt einen zweiten anzulegen. Nichts Flüchtiges merken.\n' +
        '- Direkt und konkret: erst das Ergebnis, dann höchstens der eine Vorschlag. Keine Floskeln, keine Einleitungen.';

    // Stufe "aktiv" (Standard): denkt bei fast jeder Antwort vor
    const HINWEIS_AKTIV = '\n\nZUSATZ Mitdenken (du bist wie ein echter Jarvis: du denkst voraus, statt nur zu antworten):\n' +
        '- GILT AUCH, WENN DU ETWAS ANLEGST: Auch wenn du eine Aufgabe, einen Einkauf, einen Termin oder eine Erinnerung anlegst, ist "Erledigt." allein zu wenig. Schreibe in "reply" erst die kurze Bestätigung und direkt danach den passenden Hinweis, sofern es einen gibt.\n' +
        '- Prüfe bei JEDER Antwort still, ob sich aus dem Kontext (termine, erinnerungen, einkauf, aufgaben_und_notizen, wetter, wettervorhersage, standort, parkplatz, gedaechtnis_semantisch) etwas ergibt, das den User gerade wirklich betrifft. Wenn ja, sage es nach der eigentlichen Antwort in EINEM kurzen Satz, ganz selbstverständlich ("Übrigens ...", "Dazu passt ...", oder direkt als Hinweis). Sage nie "laut meinem Gedächtnis" und nie "mir ist aufgefallen". Findest du nichts, was wirklich hilft, sagst du nichts dazu. Nie etwas erfinden: nur nennen, was im Kontext steht.\n' +
        '- Typische Verknüpfungen: (a) Nennt der User ein Vorhaben oder einen Termin: Überschneidung mit einem anderen Termin oder zu wenig Zeit dazwischen, Regen oder Sturm bei Terminen draußen, fehlender Ort oder Uhrzeit. (b) Sagt er, er braucht oder kauft etwas: steht es schon auf der Einkaufsliste, oder fehlt für ein Vorhaben heute oder morgen noch etwas? (c) Fragt er nach einer Fahrt, Route oder einem Ort: Wetter oder Stau auf dem Weg, wenn es im Kontext steht, und ob er dafür früher losmuss. (d) Fragt er nach dem Wetter: bezieh es auf seinen nächsten Termin draußen oder den Arbeitsweg (Jacke, Regenschirm, glatt). (e) Fragt er, was ansteht: zuerst das Wichtigste und Zeitkritische, dann der Rest. (g) GESCHENKE UND FESTE: Geht es um ein Geschenk, Blumen, eine Karte, einen Kuchen, eine Einladung, eine Feier oder ein Fest, suche in "termine" UND in "gedaechtnis_semantisch" nach Geburtstagen, Jubiläen und Festen in den nächsten vier Wochen (auch jährliche Einträge) und nenne den passenden mit Person und verbleibenden Tagen, z.B. "Alyssa wird am 30. Oktober 16, das sind noch 15 Tage." Rechne die Tage selbst aus "heute_datum" aus. Nennt der User eine Person ("für Alyssa"), suche gezielt nach ihr. Steht dort ein Geburtsjahr, nenne das neue Alter. (h) Nennt er ein Datum oder einen Zeitraum ("nächsten Mittwoch", "nächste Woche"): steht dort Urlaub, Schicht oder ein anderer Termin im Kontext, sag es kurz ("Da hast du Urlaub."). (i) Fragt er nach Film, Essen, Ausflug oder Unterhaltung: nutze seine Vorlieben aus gedaechtnis_semantisch (z.B. Horror- und Actionfilme) für einen konkreten Vorschlag. (f) Nennt er eine Absicht ohne Details ("ich muss mal zum Zahnarzt", "ich sollte noch ..."): biete an, es als Aufgabe oder Erinnerung zu notieren.\n' +
        '- Zeitkritisches zuerst: Hat der User einen Termin in den nächsten zwei Stunden oder eine überfällige Erinnerung und fragt etwas anderes, beantworte erst seine Frage und erwähne das Zeitkritische danach kurz, aber nur einmal pro Gespräch.\n' +
        '- Greife Früheres nur auf, wenn es direkt zur Sache passt und aus gedaechtnis_semantisch stammt ("Du wolltest ja ... Hat das geklappt?"). Nicht jedes Mal, nicht erzwungen.\n' +
        '- Ein Hinweis pro Antwort, höchstens zwei Sätze zusätzlich. Wiederhole keinen Hinweis, den du im Gespräch schon gegeben hast, und biete nichts erneut an, was der User eben abgelehnt hat ("nein", "lass mal"). Kein Hinweis bei Warnungen, Gesundheit, Geld, Trauer, Notfällen und wenn du selbst gerade eine Rückfrage stellst.\n' +
        '- Nie etwas als erledigt melden, wofür du keine Aktion angelegt hast. Ein Angebot ("Soll ich ...?") ist keine Erledigung; führe es erst nach seinem Ja aus.\n' +
        '- Teilt der User etwas Dauerhaftes mit (feste Abläufe, Gewohnheiten, Geräte, Vorlieben, Menschen in seinem Leben), merke es dir selbstständig mit der passenden Aktion (Langzeitgedächtnis) und bestätige nur kurz. Ändert sich ein Fakt, aktualisiere den alten Eintrag statt einen zweiten anzulegen. Nichts Flüchtiges merken.\n' +
        '- Direkt und konkret: erst das Ergebnis, dann der Hinweis. Keine Floskeln, keine Einleitungen.';

    function hinweis() { return stufe() === 'normal' ? HINWEIS_NORMAL : HINWEIS_AKTIV; }

    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'ki-mitdenken', function (next) {
            let base = next();
            if (isOn()) base += hinweis();
            return base;
        }, 230);
    }

    /* ---------- Feste Prüfung (nicht nur Anweisung an die KI): Geschenk-Sätze und Geburtstage ----------
       Sagt der User etwas mit Geschenk, Blumen, Karte oder Torte, geschieht zweierlei:
       1) Die Suche im Langzeitgedächtnis bekommt zusätzlich "Geburtstag, Feier, Fest, Jubiläum", damit die KI den Geburtstag sicher sieht
          (die Suche nach "Geschenk" allein findet ihn oft nicht).
       2) Die App hängt selbst einen Satz an die Antwort an, wenn in den nächsten 35 Tagen ein Geburtstag ansteht
          (erst aus dem Kalender, sonst aus dem Langzeitgedächtnis): "Übrigens, in 15 Tagen: Alyssa Geburtstag."
       Greift nur bei eingeschaltetem KI-Mitdenken (Stufe aktiv). Hängt sich beim Laden der Seite in jvFristHinweis (langzeit.js) und searchSemanticMemory ein. */
    const GESCHENK_RX = /(?:^|[^a-zäöüß])(geschenk\w*|mitbringsel|blumen\w*|strauß|strauss|glückwunschkarte|geburtstagskarte|geburtstagskuchen|torte)(?![a-zäöüß])/i;
    const ERNST_RX = /(achtung|warnung|fehler|problem|leider|tablette|medikament|arzt|krank|beerdigung|trauer|e-mail|rechnung|konto)/i;
    const MONATE = { januar: 0, februar: 1, 'märz': 2, april: 3, mai: 4, juni: 5, juli: 6, august: 7, september: 8, oktober: 9, november: 10, dezember: 11 };
    const MONAT_RX = '(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)';
    let letzteTreffer = { q: '', hits: [] };

    function tageBis(d) { const h = new Date(); h.setHours(0, 0, 0, 0); const x = new Date(d); x.setHours(0, 0, 0, 0); return Math.round((x - h) / 86400000); }
    function wannText(n) { return n === 0 ? 'heute' : n === 1 ? 'morgen' : 'in ' + n + ' Tagen'; }

    function kalenderGeburtstage() {
        const out = [];
        try {
            if (typeof calendarEntries === 'undefined' || !Array.isArray(calendarEntries)) return out;
            calendarEntries.forEach(e => {
                if (!e) return;
                const geb = (typeof isBirthdayEntry === 'function') ? isBirthdayEntry(e) : /geburtstag/i.test(e.text || '');
                if (!geb) return;
                const iso = String(e.isoDate || '');
                const d = new Date(iso.length === 10 ? iso + 'T00:00:00' : iso);
                if (isNaN(d.getTime())) return;
                const n = tageBis(d);
                if (n >= 0 && n <= 35) out.push({ n, text: String(e.text || '').trim() });
            });
        } catch (e) {}
        return out.sort((a, b) => a.n - b.n);
    }

    function gedaechtnisGeburtstage(hits) {
        const out = [];
        (hits || []).forEach(h => {
            const s = String(h || '');
            if (!/geburtstag/i.test(s)) return;
            // Datum direkt neben dem Wort "Geburtstag" (nicht das "erzählt am ..." oder das Datum des Rückblicks)
            const m = s.match(new RegExp('Geburtstag[^.]{0,60}?(\\d{1,2})\\.\\s*' + MONAT_RX, 'i')) || s.match(new RegExp('(\\d{1,2})\\.\\s*' + MONAT_RX + '[^.]{0,40}?Geburtstag', 'i'));
            if (!m) return;
            const heute = new Date();
            const mon = MONATE[m[2].toLowerCase()];
            let d = new Date(heute.getFullYear(), mon, Number(m[1]));
            if (tageBis(d) < 0) d = new Date(heute.getFullYear() + 1, mon, Number(m[1]));
            const n = tageBis(d);
            if (n < 0 || n > 35) return;
            const rest = (s.match(/Geburtstag[^.,(]*/i) || ['Geburtstag'])[0].replace(/\s+(?:am|im)\s+\d.*$/i, '').trim();
            out.push({ n, text: rest + ' am ' + m[1] + '. ' + m[2] });
        });
        return out.sort((a, b) => a.n - b.n);
    }

    // Geburtstage direkt aus dem Langzeitgedächtnis holen (alle Einträge, nicht über die Suche) und kurz merken
    let gebCache = { t: 0, liste: [], fehler: '' };
    async function ladeGeburtstage(force) {
        if (!force && gebCache.t && !gebCache.fehler && Date.now() - gebCache.t < 300000) return gebCache.liste;
        try {
            const res = await apiFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'listall' }) });
            let data = null;
            try { data = await res.json(); } catch (e) {}
            if (!res.ok) throw new Error((data && data.error) || ('Fehler ' + res.status));
            const alle = Array.isArray(data && data.eintraege) ? data.eintraege : [];
            const liste = alle.filter(e => e && e.text && ((e.metadata && e.metadata.kategorie === 'Geburtstag') || /geburtstag/i.test(e.text)));
            gebCache = { t: Date.now(), liste, fehler: '', gesamt: alle.length, google: gebCache.google || [] };
        } catch (e) {
            gebCache = { t: Date.now(), liste: gebCache.liste || [], fehler: String((e && e.message) || e), gesamt: 0, google: gebCache.google || [] };
        }
        // Geburtstags-Kalender von Google (Kontakte) und Hauptkalender, wie im Tages-Briefing (birthdays.js)
        try {
            if (typeof fetchUpcomingBirthdays === 'function') {
                const g = await fetchUpcomingBirthdays(35);
                if (Array.isArray(g)) gebCache.google = g;
            }
        } catch (e) {}
        return gebCache.liste;
    }
    function speicherGeburtstage() {
        const out = [];
        const heute = new Date();
        (gebCache.liste || []).forEach(e => {
            try {
                const m = e.metadata || {};
                const s = String(e.text || '');
                let mon = -1, tag = 0, jahr = 0;
                if (/^\d{4}-\d{2}-\d{2}$/.test(String(m.ereignis_datum || ''))) {
                    jahr = Number(m.ereignis_datum.slice(0, 4)); mon = Number(m.ereignis_datum.slice(5, 7)) - 1; tag = Number(m.ereignis_datum.slice(8, 10));
                } else {
                    const x = s.match(new RegExp('(\\d{1,2})\\.\\s*' + MONAT_RX, 'i'));
                    if (x) { tag = Number(x[1]); mon = MONATE[x[2].toLowerCase()]; }
                }
                if (mon < 0 || !tag) return;
                let d = new Date(heute.getFullYear(), mon, tag);
                if (tageBis(d) < 0) d = new Date(heute.getFullYear() + 1, mon, tag);
                const n = tageBis(d);
                if (n < 0 || n > 35) return;
                let t = s.replace(/\s*\([^)]*\d{4}\)\s*$/, '').replace(/\.$/, '').trim();
                out.push({ n, text: t });
            } catch (x) {}
        });
        return out.sort((a, b) => a.n - b.n);
    }

    // "Geburtstag von Alischa Geburtstag am 30. Oktober (2009)" -> "Alischa hat Geburtstag"
    function saubererSatz(t) {
        let x = String(t || '').replace(/\([^)]*\)/g, ' ').replace(/\d{1,2}\.\s*(?:\d{1,2}\.|[A-Za-zäöüÄÖÜ]+)(?:\s*\d{4})?/g, ' ');
        x = x.replace(/geburtstags?(?:feier|party|kind)?/gi, ' ').replace(/\b(?:von|vom|der|die|das|des|hat|am|im|zum|zur|alles|gute|jährlich)\b/gi, ' ');
        x = x.replace(/[.,:;!?\-–]+/g, ' ').replace(/\s+/g, ' ').trim();
        return x ? x + ' hat Geburtstag' : String(t || 'Geburtstag').replace(/\.$/, '');
    }

    function geschenkHinweis(reply, userText) {
        if (!isOn() || stufe() !== 'aktiv') return reply;
        const r = String(reply || ''), u = String(userText || '');
        if (!r || r.length > 500 || !GESCHENK_RX.test(u) || ERNST_RX.test(r + ' ' + u) || /geburtstag/i.test(r)) return reply;
        const gg = (gebCache.google || [])[0];
        if (gg && gg.titel) {
            const ph = (typeof birthdayPhrase === 'function') ? birthdayPhrase(gg) : (gg.tag + ' ' + gg.titel);
            return r.replace(/\s+$/, '') + ' Übrigens, ' + ph.replace(/\.$/, '') + '.';
        }
        let liste = kalenderGeburtstage();
        if (!liste.length) liste = speicherGeburtstage();
        if (!liste.length && letzteTreffer.q === u) liste = gedaechtnisGeburtstage(letzteTreffer.hits);
        if (!liste.length) return reply;
        const e = liste[0];
        return r.replace(/\s+$/, '') + ' Übrigens, ' + wannText(e.n) + ': ' + saubererSatz(e.text) + '.';
    }

    function einhaengen() {
        try {
            const orig = window.jvFristHinweis;
            if (typeof orig === 'function' && !orig._ki) {
                const w = function (reply, userText) {
                    let r = orig.apply(this, arguments);
                    try { r = geschenkHinweis(r, userText); } catch (e) {}
                    return r;
                };
                w._ki = true;
                window.jvFristHinweis = w;
            }
            const origS = window.searchSemanticMemory;
            if (typeof origS === 'function' && !origS._ki) {
                const w2 = async function (text) {
                    let hits = await origS.apply(this, arguments);
                    if (!Array.isArray(hits)) hits = [];
                    try {
                        if (isOn() && stufe() === 'aktiv' && GESCHENK_RX.test(String(text || ''))) {
                            await ladeGeburtstage();
                            const extra = await origS.call(this, 'Geburtstag Feier Fest Jubiläum');
                            if (Array.isArray(extra)) hits = hits.concat(extra.filter(x => hits.indexOf(x) === -1));
                        }
                    } catch (e) {}
                    letzteTreffer = { q: String(text || ''), hits: hits };
                    return hits;
                };
                w2._ki = true;
                window.searchSemanticMemory = w2;
            }
        } catch (e) { console.error('KI-Mitdenken einhängen', e); }
        setTimeout(function () { try { ladeGeburtstage(); } catch (e) {} }, 4000);
    }
    if (document.readyState === 'complete') setTimeout(einhaengen, 0); else window.addEventListener('load', einhaengen);

    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:bitte\s+)?(?:zane\s+)?/, '');
        if (!t || t.length > 40) return false;
        const say = m => { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} };

        // Stärke: "Mitdenken mehr", "Denk mehr mit", "Mehr mitdenken" / "Mitdenken weniger", "Denk weniger mit"
        const mehr = /^(?:(?:ki )?mitdenken (?:mehr|aktiv|aktiver|öfter|oefter)|denk(?:e)? (?:mehr|aktiver|öfter|oefter) mit|(?:mehr|aktiver|öfter|oefter) mitdenken)$/.test(t);
        const weniger = /^(?:(?:ki )?mitdenken (?:weniger|seltener|dezent|dezenter|ruhiger|normal)|denk(?:e)? (?:weniger|seltener|nicht so viel) mit|(?:weniger|seltener) mitdenken)$/.test(t);
        if (mehr) { lsSet(KEY, '1'); lsSet(KEY_STUFE, 'aktiv'); say('Gut, ich denke jetzt aktiv mit und melde mich, wenn mir etwas auffällt.'); return true; }
        if (weniger) { lsSet(KEY, '1'); lsSet(KEY_STUFE, 'normal'); say('In Ordnung, ich melde mich nur noch bei offensichtlichem Anlass.'); return true; }

        if (/^(?:ki )?mitdenken (?:status|test|prüfung|pruefung|check)$|^geschenk(?:-| )?check$/.test(t)) {
            ladeGeburtstage(true).then(function () {
                const k = kalenderGeburtstage(), sp = speicherGeburtstage();
                let msg = 'Mitdenken ist ' + (isOn() ? 'an, Stufe ' + stufe() : 'aus') + '. ';
                if (gebCache.fehler) msg += 'Das Langzeitgedächtnis konnte ich nicht lesen: ' + gebCache.fehler + '. ';
                else msg += 'Im Langzeitgedächtnis habe ich ' + gebCache.liste.length + ' Geburtstagseinträge. ';
                msg += 'Im Geburtstagskalender von Google sind ' + (gebCache.google || []).length + ' in den nächsten fünf Wochen. Im Terminkalender stehen ' + k.length + ' Geburtstage in den nächsten fünf Wochen';
                const e = k[0] || sp[0];
                msg += e ? ', der nächste: ' + wannText(e.n) + ', ' + e.text + '.' : ', im Gedächtnis keiner.';
                say(msg);
            });
            return true;
        }
        if (!/\bki mitdenken\b/.test(t)) return false;
        if (/\b(aus|ausschalten|deaktivier\w*)\b/.test(t)) { lsSet(KEY, '0'); say('Gut, ich halte mich mit eigenen Vorschlägen zurück.'); return true; }
        if (/\b(an|ein|einschalten|aktivier\w*)\b/.test(t)) { lsSet(KEY, '1'); say('Gut, ich denke wieder mit.'); return true; }
        say('Das KI-Mitdenken ist ' + (isOn() ? 'an, Stufe ' + stufe() : 'aus') + '.');
        return true;
    }
    if (window.jvCommands) {
        window.jvCommands.use('ki-mitdenken', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('KI-Mitdenken', e); }
            return next(text);
        }, 92);
    }
    window.jvKiMitdenken = { ladeGeburtstage, speicherGeburtstage, geschenkHinweis, isOn, stufe, handle, hinweis, HINWEIS_AKTIV, HINWEIS_NORMAL };
})();
