/* ============================================================
   FRÜHER LOS (Mitdenken): "Ich muss Donnerstag um 13:15 auf der Arbeit sein" - beginnt die Arbeit an dem Tag früher als sonst (Schicht + Beginn kennt Jarvis),
   zieht Jarvis die Abfahrt an diesem Tag um die Differenz vor (plan_ansagen.js: setTagVor, höchstens 60 Minuten), sagt es und meldet sich dann
   wie jeden Tag kurz vor der Abfahrt mit der Verkehrslage (Plan-Einträge stau| und aufbruch|, danach planSenden).
   Erkannt: "muss/soll ... <Tag> ... <Uhrzeit> ... Arbeit/anfangen/da sein" oder "<Tag> fange ich um 13:15 an". Tag: heute, morgen, übermorgen, Wochentag, Datum.
   Gilt nur, wenn an dem Tag eine Schicht eingetragen ist und der Beginn früher liegt; sonst läuft der Satz normal weiter (KI, Termin-Rückfrage).
   Zurück: "Mach die frühere Abfahrt rückgängig".
   Braucht: plan_ansagen.js (window.jvPlan), langzeit_erinnern.js (jvTerminErinnern.ausText), commands.js (jvCommands).
   ============================================================ */
(function () {
    const K_LETZT = 'jv_frueher_letzt';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function sagen(t) { try { speak(t); } catch (e) { } }
    const P = () => window.jvPlan || null;
    const pad = n => String(n).padStart(2, '0');

    function befehl(text, next) {
        const raw = String(text || '').trim(); if (!raw) return next(text);
        const t = raw.toLowerCase();
        const p = P();
        if (/(?:mach|setz)\w*\s+(?:die\s+)?fr(?:ü|ue)her\w*\s+abfahrt\s+(?:r(?:ü|ue)ckg(?:ä|ae)ngig|zur(?:ü|ue)ck)/.test(t) || /fr(?:ü|ue)her\w*\s+abfahrt\s+(?:r(?:ü|ue)ckg(?:ä|ae)ngig|zur(?:ü|ue)ck)/.test(t)) {
            const y = lsGet(K_LETZT);
            if (!p || !y) { sagen('Da gibt es gerade nichts zurückzusetzen.'); return true; }
            p.setTagVor(y, 0); try { p.planSenden(true); } catch (e) { } lsSet(K_LETZT, '');
            sagen('Erledigt. Die Abfahrt ist an dem Tag wieder wie sonst.'); return true;
        }
        const arbeit = /\b(?:muss|soll|sollte)\b.*\b(?:arbeit|betrieb|anfangen|anfang|da sein|dort sein|los)\b/.test(t) || /\bfange\b.*\ban\b/.test(t);
        if (!arbeit || /\b(?:war|waren|gestern|vorhin|letzte\w*)\b/.test(t)) return next(text);
        const T = window.jvTerminErinnern; if (!p || !T || typeof T.ausText !== 'function') return next(text);
        const s = T.ausText(raw); if (!s) return next(text);
        const ymd = s.start.getFullYear() + '-' + pad(s.start.getMonth() + 1) + '-' + pad(s.start.getDate());
        let sh = null; try { sh = p.schichtAm(ymd); } catch (e) { }
        if (!sh) return next(text);
        const normal = p.beginn(sh), neu = s.h * 60 + s.mi, diff = Math.min(60, normal - neu);
        if (!(diff > 0)) return next(text);
        try { p.setTagVor(ymd, diff); p.planSenden(true); } catch (e) { return next(text); }
        lsSet(K_LETZT, ymd);
        const abf = p.abfahrtMin(sh) - diff, tag = T.tagWort(s.start);
        sagen('Verstanden. ' + tag.charAt(0).toUpperCase() + tag.slice(1) + ' beginnst du um ' + p.uhr(neu) + ' statt um ' + p.uhr(normal) + '. Ich ziehe deine Abfahrt um ' + diff + ' Minuten vor, auf ' + p.uhr(abf) + '. Kurz vorher melde ich mich mit der Verkehrslage. Wenn das nicht stimmt, sag: Mach die frühere Abfahrt rückgängig.');
        return true;
    }

    function einhaengen() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('frueher-los', befehl, 0.69);
        return true;
    }
    if (!einhaengen()) { let n = 0; const iv = setInterval(function () { if (einhaengen() || ++n > 40) clearInterval(iv); }, 250); }
    window.jvFruehLos = { befehl };
})();
