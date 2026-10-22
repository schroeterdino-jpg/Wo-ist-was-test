/* ============================================================
   ZURÜCKFRAGEN: Ist ein Name oder Ziel nicht eindeutig ("Ruf Anna an" bei Anna Müller und Anna Schmidt), fragt Jarvis kurz nach,
   statt zu raten oder den Satz abzubrechen. Du antwortest nur noch "die zweite" oder "Müller"; Jarvis führt den ursprünglichen Wunsch dann aus.
   Bei Kontakten merkt er sich die Wahl ("Anna" = Anna Müller) und fragt nicht wieder. Vergessen: "Vergiss die gemerkten Rückfragen".
   Eingebaut an: lists.js (resolveListTargets: mehrere Treffer), routing.js (Fahrziel: mehrere Kontakte mit gleichem Vornamen).
   Der Satz des Nutzers kommt aus window.jvLetzterText (gesetzt in assistant.js).
   ============================================================ */
(function () {
    const K_MERK = 'jv_rueckfrage_gemerkt';
    const FRIST_MS = 10 * 60000;
    let offen = null;   // { query, namen: [..], text, merken, at }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function sagen(t, weiter) { try { speak(t, weiter && typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function plain(s) { return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }
    function merkListe() { try { const o = JSON.parse(lsGet(K_MERK) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }

    /* Frühere Wahl für diese Eingabe, sofern sie unter den Kandidaten ist; sonst null */
    function gemerkt(query, namen) {
        const n = merkListe()[plain(query)];
        return n && namen.indexOf(n) >= 0 ? n : null;
    }
    /* Frage vorbereiten; Rückgabe: der Fragesatz */
    function vorbereiten(query, namen, text, merken) {
        const liste = (namen || []).filter(Boolean).slice(0, 6);
        offen = { query: String(query || ''), namen: liste, text: String(text || ''), merken: merken !== false, at: Date.now() };
        return 'Welchen meinst du: ' + liste.slice(0, -1).join(', ') + ' oder ' + liste[liste.length - 1] + '?';
    }
    function nimmOffen() { return offen && Date.now() - offen.at < FRIST_MS ? offen : null; }

    const ORD = [[/\b(erste|ersten|erster|ersters|eins|1)\b/, 0], [/\b(zweite|zweiten|zweiter|zwei|2)\b/, 1], [/\b(dritte|dritten|dritter|drei|3)\b/, 2], [/\b(vierte|vierten|vierter|vier|4)\b/, 3]];
    function waehle(antwort, o) {
        const t = plain(antwort);
        if (/\b(letzte|letzten|letzter)\b/.test(t)) return o.namen[o.namen.length - 1];
        for (const [re, i] of ORD) if (re.test(t) && o.namen[i]) return o.namen[i];
        const wort = t.split(' ').filter(w => w.length >= 3 && !/^(den|die|das|der|dem|meine|meinen|meinte|ich|mit|von|bitte|ist|nein|doch|nimm|nehme|mal)$/.test(w));
        if (!wort.length) return null;
        const treffer = o.namen.filter(n => { const nw = plain(n).split(' '); return wort.every(w => nw.some(x => x.indexOf(w) === 0)); });
        return treffer.length === 1 ? treffer[0] : (treffer.length > 1 ? 'MEHRERE' : null);
    }
    function ersetzen(text, query, name) {
        const esc = String(query).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const re = new RegExp('(^|[^\\wäöüÄÖÜß])' + esc + '(?![\\wäöüÄÖÜß])', 'i');
        if (query && re.test(text)) return text.replace(re, (m, v) => v + name);
        return text + ' (gemeint ist ' + name + ')';
    }
    function ausfuehren(t) {
        try { if (typeof window.handleLocalCommand === 'function' && window.handleLocalCommand(t)) return; } catch (e) { }
        try { if (typeof sendToGroqSmart === 'function') sendToGroqSmart(t); } catch (e) { }
    }

    function befehl(text, next) {
        const t = plain(text).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova) /, '');
        if (/\b(?:vergiss|loesche|lösche)\b.*\bgemerkten\b.*\brueckfragen?\b|\bfrag wieder nach\b.*\b(?:namen|kontakten)\b/.test(t)) { lsSet(K_MERK, '{}'); sagen('Gut, ich habe mir die Auswahl nicht gemerkt und frage wieder nach.', false); return true; }
        const o = nimmOffen();
        if (!o || !t || t.split(' ').length > 8) return next(text);
        if (/^(vergiss es|vergiss das|abbrechen|abbruch|egal|lass gut sein|lass es|nichts|stopp|stop|nein danke|keinen)\b/.test(t)) { offen = null; sagen('In Ordnung, dann lassen wir es.', false); return true; }
        const w = waehle(text, o);
        if (!w) return next(text);   // keine Antwort auf die Frage: normal weiter (die Frage bleibt noch offen)
        if (w === 'MEHRERE') { sagen('Das passt auf mehrere. Sag bitte den ganzen Namen oder: die erste, die zweite.', true); return true; }
        offen = null;
        if (o.merken) { const m = merkListe(); m[plain(o.query)] = w; lsSet(K_MERK, JSON.stringify(m)); }
        const neu = o.text ? ersetzen(o.text, o.query, w) : '';
        if (!neu) { sagen('Verstanden, ' + w + '. Sag mir noch einmal, was ich tun soll.', true); return true; }
        ausfuehren(neu);
        return true;
    }
    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('rueckfrage', befehl, 0.4);
        return true;
    }
    if (!cmd()) { let n = 0; const iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }
    window.jvRueckfrage = { vorbereiten, gemerkt, waehle, ersetzen, offen: nimmOffen };
})();
