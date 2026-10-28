/* ============================================================
   ZUVORKOMMEND: Jarvis handelt von sich aus und sagt es dir ("Ich habe mir erlaubt ..."), du kannst es mit "Mach rückgängig" zurücknehmen.
   1) Frost: Abend vor einer Frühschicht (bei der Wecker-Frage um 20:30) schaut Jarvis in die Vorhersage für morgen früh.
      Bei Frost, Schnee oder Glätte zieht er deine Abfahrt um 10 bis 15 Minuten vor (plan_ansagen.js: tagVor), damit Zeit zum Kratzen bleibt,
      und schlägt den Wecker entsprechend früher vor. "Mach rückgängig" stellt alles zurück.
   2) Familie/Geburtstage: 5 Tage vorher fragt Jarvis um 18 Uhr, ob schon ein Geschenk da ist, und legt auf Wunsch eine Erinnerung an.
      Abstellen: "Frag nicht mehr nach Geburtstagen" (wieder an: "Frag wieder nach Geburtstagen"). Gilt auch für 3).
   3) Glückwunsch: Am Vortag um 18:15 und am Geburtstag selbst (8 Uhr, bei Frühschicht 15:30) meldet sich Jarvis mit einem fertigen Gratulations-Entwurf,
      passend zur Person (Tochter, Schatz, Mama, Enkelin, sonst freundlich). Am Geburtstag fragt er, ob er WhatsApp mit dem Text öffnen soll
      (Karte zum Antippen oder "Ja"); abgeschickt wird in WhatsApp mit einem Tipp auf Senden. "Schon gratuliert" streicht die Erinnerung am Geburtstag.
      Probe: "Teste den Glückwunsch für Alyssa". Plan-Einträge: gebv|ymd|titel (Vortag) und gebt|ymd|titel (Tag selbst), gesprochen über plan_ansagen.js (ansage).
   Braucht: plan_ansagen.js (window.jvPlan), birthdays.js (fetchUpcomingBirthdays), calendar.js (addGoogleCalendarReminder), commands.js (jvCommands).
   ============================================================ */
(function () {
    const P = () => window.jvPlan || null;
    const K_LETZT = 'jv_zuvor_letzt', K_GEB = 'jv_zuvor_geb', K_GEB_AUS = 'jv_zuvor_geb_aus', K_GEB_GEFRAGT = 'jv_zuvor_gefragt_';
    const GEB_VORLAUF_TAGE = 5, GEB_UHR_MIN = 18 * 60;
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function sagen(t, weiter) { try { speak(t, weiter && typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function karten() { try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[.,!?;:]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function tageZwischen(a, b) { const t = s => { const [y, m, d] = s.split('-').map(Number); return Date.UTC(y, m - 1, d); }; return Math.round((t(b) - t(a)) / 86400000); }

    /* ---------- 1) Frost ---------- */
    const SCHNEE_CODES = [56, 57, 66, 67, 71, 73, 75, 77, 85, 86];
    async function morgenOrt() {
        const p = P();
        try {
            const ziel = p && p.heimAdresse && p.heimAdresse();
            if (ziel && typeof geocodeAddress === 'function') { const g = await Promise.race([geocodeAddress(ziel), new Promise(r => setTimeout(() => r(null), 5000))]); if (g) return g; }
        } catch (e) { }
        try { const pos = await getPosition({ timeout: 7000, enableHighAccuracy: false, maximumAge: 600000 }); return { lat: pos.coords.latitude, lon: pos.coords.longitude }; } catch (e) { }
        return null;
    }
    /* Vorhersage rund um die Abfahrt: { min: tiefste Temperatur, schnee: Schnee oder gefrierender Regen } oder null */
    async function wetterAbfahrt(ymd, abfMin) {
        const o = await morgenOrt(); if (!o) return null;
        try {
            const r = await Promise.race([fetch('https://api.open-meteo.com/v1/forecast?latitude=' + o.lat.toFixed(3) + '&longitude=' + o.lon.toFixed(3) + '&hourly=temperature_2m,weather_code&forecast_days=3&timezone=Europe%2FBerlin'), new Promise(r => setTimeout(() => r(null), 9000))]);
            if (!r || !r.ok) return null;
            const j = await r.json(), h = j && j.hourly; if (!h || !Array.isArray(h.time)) return null;
            const von = Math.floor((abfMin - 90) / 60), bis = Math.floor(abfMin / 60);
            let min = null, schnee = false;
            h.time.forEach((t, i) => {
                if (t.slice(0, 10) !== ymd) return;
                const hh = Number(t.slice(11, 13)); if (hh < von || hh > bis) return;
                const v = Number(h.temperature_2m[i]); if (Number.isFinite(v) && (min === null || v < min)) min = v;
                if (SCHNEE_CODES.indexOf(Number(h.weather_code[i])) >= 0) schnee = true;
            });
            return min === null ? null : { min, schnee };
        } catch (e) { return null; }
    }
    function gradText(v) { const r = Math.round(v); return (r < 0 ? 'minus ' + (-r) : String(r)) + ' Grad'; }
    /* Wird von plan_ansagen.js vor der Wecker-Frage aufgerufen (ymd = heutiger Abend). Rückgabe: Satz für Jarvis oder ''. */
    async function vorWecker(ymd) {
        const p = P(); if (!p) return '';
        const morgen = p.ymdPlus(ymd, 1);
        if (p.schichtAm(morgen) !== 'frueh' || p.tagVor(morgen) > 0) return '';
        const abf = p.abfahrtMin('frueh');
        const w = await wetterAbfahrt(morgen, abf);
        if (!w || !(w.min <= 0.5 || w.schnee)) return '';
        const vor = (w.schnee || w.min <= -5) ? 15 : 10;
        p.setTagVor(morgen, vor);
        lsSet(K_LETZT, JSON.stringify({ art: 'frost', ymd: morgen, at: Date.now() }));
        try { p.planSenden(true); } catch (e) { }
        const grund = w.schnee ? 'morgen früh Schnee oder Glätte möglich sind (' + gradText(w.min) + ')' : 'morgen früh Frost ist (' + gradText(w.min) + ')';
        return 'Ich habe mir erlaubt, deine Abfahrt morgen auf ' + p.uhr(abf - vor) + ' vorzuziehen, weil ' + grund + ' und du vielleicht kratzen musst. Wenn du das nicht willst, sag: Mach rückgängig.';
    }
    function rueckgaengig() {
        const p = P();
        let l = null; try { l = JSON.parse(lsGet(K_LETZT) || 'null'); } catch (e) { }
        if (!l || !l.at || Date.now() - l.at > 36 * 3600000 || !p) { sagen('Da gibt es gerade nichts, was ich rückgängig machen könnte.', false); return; }
        if (l.art === 'frost') {
            p.setTagVor(l.ymd, 0);
            try { p.planSenden(true); } catch (e) { }
            let t = 'Erledigt. Die Abfahrt bleibt bei ' + p.uhr(p.abfahrtMin('frueh')) + '.';
            if (lsGet('jv_plan_wecker_' + p.ymdPlus(l.ymd, -1)) === 'ja') t += ' Den Wecker habe ich schon gestellt, den musst du in der Uhr-App selbst zurückstellen.';
            lsSet(K_LETZT, '');
            sagen(t, false);
            return;
        }
        sagen('Da gibt es gerade nichts, was ich rückgängig machen könnte.', false);
    }

    /* ---------- 2) Geburtstage ---------- */
    function gebAus() { return lsGet(K_GEB_AUS) === '1'; }
    function gebListe() { try { const a = JSON.parse(lsGet(K_GEB) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function gebKey(ymd, titel) { return K_GEB_GEFRAGT + ymd + '_' + String(titel).toLowerCase().replace(/[^a-zäöüß0-9]/g, '').slice(0, 30); }
    let aktualisiert = 0;
    async function gebAktualisieren() {
        if (typeof fetchUpcomingBirthdays !== 'function' || Date.now() - aktualisiert < 30 * 60000) return;
        aktualisiert = Date.now();
        try {
            const l = await fetchUpcomingBirthdays(7);
            lsSet(K_GEB, JSON.stringify((l || []).filter(x => x && x.ymd && x.titel).map(x => ({ ymd: x.ymd, titel: String(x.titel).replace(/\|/g, ' ').slice(0, 60) }))));
            try { if (P()) P().planSenden(false); } catch (e) { }
        } catch (e) { }
    }
    /* Einträge für den Plan (plan_ansagen.js bauePlan): pro Geburtstag eine Vorfrage um 18 Uhr, ab 5 Tage vorher */
    function planEintraege() {
        const p = P(), out = [];
        if (!p || gebAus()) return out;
        const nu = p.jetzt(), jetztMs = Date.now();
        gebListe().forEach(b => {
            const bis = tageZwischen(nu.ymd, b.ymd);
            if (bis < 1 || bis > GEB_VORLAUF_TAGE || lsGet(gebKey(b.ymd, b.titel))) return;
            for (let d = nu.ymd; d < b.ymd; d = p.ymdPlus(d, 1)) {
                if (tageZwischen(d, b.ymd) > GEB_VORLAUF_TAGE) continue;
                const at = p.berlinMs(d, GEB_UHR_MIN);
                if (at > jetztMs + 20000) { out.push({ id: 'geb|' + b.ymd + '|' + b.titel, at, text: 'Bald ist ein Geburtstag: ' + b.titel + '. Tippe, dann frage ich dich kurz etwas dazu.' }); break; }
            }
        });
        return out.concat(grussEintraege());
    }
    let offenGeb = null;   // { ymd, titel, at }
    function gebAnsage(id) {
        const p = P(); if (!p || gebAus()) return false;
        const teile = String(id).split('|'), ymd = teile[1], titel = teile.slice(2).join('|');
        const bis = tageZwischen(p.jetzt().ymd, ymd);
        if (!ymd || !titel || bis < 1 || bis > GEB_VORLAUF_TAGE || lsGet(gebKey(ymd, titel))) return false;
        lsSet(gebKey(ymd, titel), '1');
        offenGeb = { ymd, titel, at: Date.now() };
        const wann = bis === 1 ? 'Morgen' : 'In ' + bis + ' Tagen';
        const was = /geburtstag|birthday|bday/i.test(titel) ? (bis === 1 ? 'ist ' : 'ist ') + titel : 'hat ' + titel + ' Geburtstag';
        try {
            if (typeof showActionCards === 'function') showActionCards([
                { icon: '🎁', title: 'Ja, erinnere mich ans Geschenk', subtitle: titel, onclick: 'jvZuvor.gebJa()' },
                { icon: '✅', title: 'Schon erledigt', subtitle: '', onclick: 'jvZuvor.gebNein()' }
            ]);
        } catch (e) { }
        try { if (window.jvMeldungen) window.jvMeldungen.beobachte({ quelle: 'zuvorkommend', kanal: ['karte', 'sprache'], grund: 'geburtstag-vorfrage', ausloeser: 'plan', ereignis: String(id), bezug: { art: 'geburtstag', schluessel: ymd + '|' + titel, herkunft: 'text+zeit' }, text: wann + ' ' + was + '. Hast du schon ein Geschenk? Soll ich dich erinnern, dass du eins besorgst?' }) } catch (e) { }   // C1: nur Beobachtung
        sagen(wann + ' ' + was + '. Hast du schon ein Geschenk? Soll ich dich erinnern, dass du eins besorgst?', true);
        return true;
    }
    async function gebJa() {
        const p = P(), g = offenGeb; offenGeb = null; karten();
        if (!g || !p) { sagen('Gerade ist keine Geburtstags-Frage offen.', false); return; }
        const nu = p.jetzt(), bis = tageZwischen(nu.ymd, g.ymd);
        let ms, wann;
        if (bis >= 3) { ms = p.berlinMs(p.ymdPlus(g.ymd, -2), 18 * 60); wann = 'zwei Tage vorher, um 18 Uhr'; }
        else if (bis === 2) { ms = p.berlinMs(p.ymdPlus(nu.ymd, 1), 9 * 60); wann = 'morgen früh um 9 Uhr'; }
        else if (nu.min < 20 * 60) { ms = Date.now() + 60 * 60000; wann = 'in einer Stunde'; }
        else { ms = p.berlinMs(g.ymd, 8 * 60); wann = 'morgen früh um 8 Uhr'; }
        try {
            if (typeof addGoogleCalendarReminder !== 'function') throw new Error('keine Erinnerungen');
            await addGoogleCalendarReminder('Geschenk besorgen für ' + g.titel, new Date(ms).toISOString(), null, false);
            sagen('Gut, ich erinnere dich ' + wann + ' ans Geschenk.', false);
        } catch (e) { sagen('Die Erinnerung konnte ich gerade nicht anlegen. Sag mir einfach: Erinnere mich an das Geschenk.', false); }
    }
    function gebNein() {
        const g = offenGeb; offenGeb = null; karten();
        sagen(g ? 'Prima, dann ist das schon erledigt.' : 'Gerade ist keine Geburtstags-Frage offen.', false);
    }

    /* ---------- 3) Glückwunsch mit Entwurf ---------- */
    const GRUSS_VORTAG_MIN = 18 * 60 + 15;   // 15 Minuten nach der Geschenk-Frage (18 Uhr), damit sich beide nicht überlagern
    const REL = { alyssa: 'kind', julia: 'kind', isabel: 'kind', schatz: 'partner', mama: 'mutter', finja: 'enkel' };
    const STOP = /^(geburtstag|geburtstags|birthday|bday|von|vom|der|die|das|des|zum|alles|gute|hat|ist|heute|morgen)$/i;
    function gruSchluessel(art, ymd, titel) { return 'jv_zuvor_gruss_' + art + '_' + ymd + '_' + String(titel).toLowerCase().replace(/[^a-zäöüß0-9]/g, '').slice(0, 30); }
    function gebWas(titel) { return /geburtstag|birthday|bday/i.test(titel) ? 'ist ' + titel : 'hat ' + titel + ' Geburtstag'; }
    function kontaktZu(titel) {
        try {
            const raw = (typeof savedContacts !== 'undefined') ? savedContacts : null;
            if (!raw || typeof contactKey !== 'function') return null;
            const lst = Array.isArray(raw) ? raw : Object.keys(raw).map(k => raw[k]);
            const worte = String(titel || '').replace(/['’`´]s\b/gi, '').split(/\s+/).filter(w => w && !STOP.test(w));
            for (const w of worte) {
                for (const cand of [w, (/s$/i.test(w) && w.length > 3) ? w.slice(0, -1) : null]) {
                    if (!cand) continue;
                    const ck = contactKey(cand); if (!ck) continue;
                    const hit = lst.find(c => { const nk = contactKey((c && (c.originalName || c.name)) || ''); return nk && (nk === ck || nk.split(' ')[0] === ck); });
                    if (hit) return hit;
                }
            }
        } catch (e) { }
        return null;
    }
    function beziehung(name) {
        let r = null;
        try {
            const k = contactKey(name), n = window.ZaneNative;
            if (n && typeof n.anredeListe === 'function') String(n.anredeListe() || '').split('\n').forEach(z => {
                const i = z.indexOf('='); if (i > 0 && contactKey(z.slice(0, i)) === k) { const v = z.slice(i + 1).trim(); r = v === 'papa' ? 'kind' : v === 'mann' ? 'partner' : r; }
            });
            if (!r) r = REL[k] || null;
        } catch (e) { }
        return r;
    }
    function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
    function entwurf(name, rel, seed) {
        const N = name ? ', ' + name : '';
        const v = {
            kind: ['Alles Liebe zum Geburtstag' + N + '! Ich wünsche dir einen ganz wundervollen Tag. Dein Papa 🎂', 'Happy Birthday' + N + '! Hab einen tollen Tag und lass dich schön feiern. Dein Papa ❤️'],
            partner: ['Alles Liebe zum Geburtstag, mein Schatz! Ich freue mich auf einen schönen Tag mit dir. ❤️', 'Happy Birthday, mein Schatz! Ich hab dich lieb. 🎂❤️'],
            mutter: ['Alles Liebe zum Geburtstag, liebe Mama! Ich wünsche dir einen schönen Tag und vor allem Gesundheit. Dein Dino 🎂', 'Herzlichen Glückwunsch zum Geburtstag, liebe Mama! Feier schön und lass dich verwöhnen. Dein Dino ❤️'],
            enkel: ['Alles Liebe zum Geburtstag' + N + '! Dein Opa wünscht dir einen ganz tollen Tag. 🎂', 'Happy Birthday' + N + '! Lass dich schön feiern. Dein Opa hat dich lieb. ❤️'],
            sonst: ['Alles Gute zum Geburtstag' + N + '! Ich wünsche dir einen schönen Tag und alles, was du dir wünschst. 🎉', 'Herzlichen Glückwunsch zum Geburtstag' + N + '! Feier schön und lass es dir gutgehen. 🎂']
        }[rel || 'sonst'];
        return v[seed % v.length];
    }
    function ohneEmoji(t) {   // fürs Vorlesen: ohne Emojis, mit Satzende
        let s = String(t);
        try { s = s.replace(/[\p{Extended_Pictographic}️]/gu, ''); } catch (e) { }
        s = s.replace(/\s+/g, ' ').trim();
        return /[.!?]$/.test(s) ? s : s + '.';
    }
    /* "hat Alyssa Geburtstag" (Kontakt bekannt), sonst wie im Kalender-Titel */
    function wasGeb(titel) {
        const c = kontaktZu(titel), n = c ? String(c.originalName || c.name || '').trim().split(/\s+/)[0] : '';
        return n ? 'hat ' + n + ' Geburtstag' : gebWas(titel);
    }

    let offenGruss = null;   // { art, ymd, titel, text, url, anzeige, at }
    function gebGruss(id, test) {
        const p = P(); if (!p || (!test && gebAus())) return false;
        const teile = String(id).split('|'), art = teile[0], ymd = teile[1], titel = teile.slice(2).join('|');
        if (!ymd || !titel) return false;
        if (!test) {
            const bis = tageZwischen(p.jetzt().ymd, ymd);
            if (art === 'gebv' ? bis !== 1 : bis !== 0) return false;                  // abgelaufen
            if (lsGet(gruSchluessel('fertig', ymd, titel))) return false;                // schon gratuliert
        }
        const c = kontaktZu(titel);
        let name = '';
        if (c) name = String(c.originalName || c.name || '').trim().split(/\s+/)[0];
        else if (!/geburtstag|birthday|bday/i.test(titel)) name = String(titel).trim().split(/\s+/)[0];   // "Julia" allein ist ein Name, "Julias Geburtstag" nicht sicher
        const rel = name ? beziehung(name) : null;
        const text = entwurf(name, rel, hash(titel + ymd));
        let url = 'https://wa.me/?text=' + encodeURIComponent(text);
        try { const num = c && c.phone && typeof phoneForWhatsApp === 'function' ? phoneForWhatsApp(c.phone) : ''; if (num) url = 'https://wa.me/' + num + '?text=' + encodeURIComponent(text); } catch (e) { }
        const anzeige = name || String(titel).replace(/\s*geburtstag\w*/i, '').trim() || 'Geburtstag';
        offenGeb = null;
        offenGruss = { art, ymd, titel, text, url, anzeige, at: Date.now() };
        try {
            if (typeof showActionCards === 'function') showActionCards([
                { icon: '💬', title: 'WhatsApp an ' + anzeige + ' öffnen', subtitle: text, href: url },
                { icon: '✅', title: 'Schon gratuliert', subtitle: '', onclick: 'jvZuvor.grussFertig()' }
            ]);
        } catch (e) { }
        try { if (window.jvMeldungen) window.jvMeldungen.beobachte({ quelle: 'zuvorkommend', kanal: ['karte', 'sprache'], grund: art === 'gebv' ? 'glueckwunsch-vortag' : 'glueckwunsch-tag', ausloeser: test ? 'manuell' : 'plan', ereignis: String(id), bezug: { art: 'geburtstag', schluessel: ymd + '|' + titel, herkunft: 'text+zeit' }, text: text }) } catch (e) { }   // C1: nur Beobachtung
        if (art === 'gebv') {
            sagen('Morgen ' + wasGeb(titel) + '. Ich habe schon einen Glückwunsch vorbereitet: ' + ohneEmoji(text) + ' Morgen früh erinnere ich dich noch einmal. Die Karte öffnet WhatsApp mit dem Text.', false);
        } else {
            sagen('Heute ' + wasGeb(titel) + '. Mein Vorschlag für den Glückwunsch: ' + ohneEmoji(text) + ' Soll ich WhatsApp mit dem Text öffnen?', true);
        }
        return true;
    }
    function grussOeffnen() {
        const g = offenGruss;
        if (!g) { sagen('Gerade ist kein Glückwunsch offen.', false); return; }
        offenGruss = null; karten();
        if (g.art === 'gebt') lsSet(gruSchluessel('fertig', g.ymd, g.titel), '1');
        try {
            const w = window.open(g.url, '_blank');
            if (!w && !window.ZaneNative) window.location.href = g.url;
            sagen('WhatsApp öffnet sich mit dem Text. Du musst nur noch auf Senden tippen.', false);
        } catch (e) { sagen('WhatsApp konnte ich nicht öffnen. Tippe auf die Karte.', false); }
    }
    function grussFertig() {
        const g = offenGruss; offenGruss = null; karten();
        if (g) lsSet(gruSchluessel('fertig', g.ymd, g.titel), '1');
        sagen(g ? 'Prima, dann ist das erledigt.' : 'Gerade ist kein Glückwunsch offen.', false);
        try { if (P()) P().planSenden(true); } catch (e) { }
    }
    /* Einträge für den Plan: Vortag 18:15 und Geburtstag selbst (8 Uhr, bei Frühschicht 15:30 nach der Arbeit) */
    function grussEintraege() {
        const p = P(), out = [];
        if (!p || gebAus()) return out;
        const jetztMs = Date.now();
        gebListe().forEach(b => {
            if (lsGet(gruSchluessel('fertig', b.ymd, b.titel))) return;
            const atV = p.berlinMs(p.ymdPlus(b.ymd, -1), GRUSS_VORTAG_MIN);
            if (atV > jetztMs + 20000) out.push({ id: 'gebv|' + b.ymd + '|' + b.titel, at: atV, text: 'Morgen ' + wasGeb(b.titel) + '. Tippe, dann zeige ich dir einen Glückwunsch zum Senden.' });
            const atT = p.berlinMs(b.ymd, p.schichtAm(b.ymd) === 'frueh' ? 15 * 60 + 30 : 8 * 60);
            if (atT > jetztMs + 20000) out.push({ id: 'gebt|' + b.ymd + '|' + b.titel, at: atT, text: 'Heute ' + wasGeb(b.titel) + '. Tippe, dann öffne ich WhatsApp mit einem Glückwunsch.' });
        });
        return out;
    }

    /* ---------- Sprache ---------- */
    function befehl(text, next) {
        const t = norm(text).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '').replace(/^bitte /, '');
        if (!t || t.split(' ').length > 12) return next(text);
        if (/\b(?:mach(?:e)?|nimm|nehm)\b.*\brueckgaengig\b|^rueckgaengig\b|\bnimm (?:das|es) zurueck\b/.test(t)) { rueckgaengig(); return true; }
        let mt = t.match(/\b(?:teste|test|probe)\w*\b.*\bglueckwunsch\b(?:.*\bfuer (.+))?$/);
        if (mt) { const nm = (mt[1] || 'Schatz').replace(/^(?:meine |meinen |mein )/, '').trim(); gebGruss('gebt|' + P().jetzt().ymd + '|' + nm.replace(/\b[a-z]/g, c => c.toUpperCase()), true); return true; }
        if (offenGruss && Date.now() - offenGruss.at < 40 * 60000 && (!offenGeb || offenGruss.at >= offenGeb.at)) {
            if (/^(nein|nee|ne|schon gratuliert|hab ich schon|habe ich schon|ist erledigt|erledigt|brauche ich nicht|nicht noetig|nein danke|spaeter)\b/.test(t)) { grussFertig(); return true; }
            if (/^(ja|jawohl|jep|jo|joa|klar|gerne|gern|okay|ok|bitte|mach das|genau|gut|oeffne|offne|mach auf)\b/.test(t)) { grussOeffnen(); return true; }
        }
        if (offenGeb && Date.now() - offenGeb.at < 40 * 60000) {
            if (/^(nein|nee|ne|schon erledigt|hab ich schon|habe ich schon|ist erledigt|erledigt|brauche ich nicht|nicht noetig|nein danke)\b/.test(t)) { gebNein(); return true; }
            if (/^(ja|jawohl|jep|jo|joa|klar|gerne|gern|okay|ok|bitte|mach das|genau|gut|erinner mich|erinnere mich)\b/.test(t)) { gebJa(); return true; }
        }
        if (/\bgeburtstag\w*\b/.test(t) && /\b(?:frag|frage)\b.*\bnicht mehr\b|\bnicht mehr\b.*\b(?:frag|fragen)\b/.test(t)) { lsSet(K_GEB_AUS, '1'); sagen('In Ordnung, ich frage nicht mehr nach Geburtstagen.', false); return true; }
        if (/\bgeburtstag\w*\b/.test(t) && /\b(?:frag|frage|fragen)\b.*\bwieder\b|\bwieder\b.*\b(?:frag|fragen)\b/.test(t)) { try { localStorage.removeItem(K_GEB_AUS); } catch (e) { } sagen('Gut, ich frage wieder nach Geburtstagen.', false); return true; }
        return next(text);
    }
    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('zuvorkommend', befehl, 0.7);
        return true;
    }
    if (!cmd()) { let n = 0; const iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }

    setTimeout(gebAktualisieren, 15000);
    setTimeout(function () { aktualisiert = 0; gebAktualisieren(); }, 90000);   // falls Google zu Beginn noch nicht verbunden war
    setInterval(function () { aktualisiert = 0; gebAktualisieren(); }, 3 * 3600000);
    try { document.addEventListener('visibilitychange', function () { if (!document.hidden) setTimeout(gebAktualisieren, 4000); }); } catch (e) { }
    window.jvZuvor = { vorWecker, rueckgaengig, planEintraege, gebAnsage, gebJa, gebNein, gebAktualisieren, gebGruss, grussOeffnen, grussFertig };
})();
