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
        adr = null;
        offen = { query: String(query || ''), namen: liste, text: String(text || ''), merken: merken !== false, at: Date.now() };
        try { window.jvFrage && window.jvFrage.neu('rueckfrage'); } catch (e) { }
        return 'Welchen meinst du: ' + liste.slice(0, -1).join(', ') + ' oder ' + liste[liste.length - 1] + '?';
    }
    function nimmOffen() { return offen && Date.now() - offen.at < FRIST_MS ? offen : null; }

    /* ---- Fehlende Adresse einer Person (Oma, Mama ...): Jarvis fragt nach, speichert nur mit Zustimmung und bietet danach die ursprüngliche Aufgabe an ----
       Eine offene Frage zur Zeit (adr). Stufen: adresse (Wie lautet sie?) -> speichern (Soll ich sie bei X speichern?) -> start (Soll ich jetzt ... starten?).
       Gespeichert wird nur über die Registry (kontakt_speichern: ergänzt vorhandene Kontakte, legt nichts doppelt an, prüft den Erfolg). Bei Themenwechsel, Frist oder neuer Frage verfällt alles. */
    let adr = null;   // { name, art:'navigate'|'fahrzeit'|'abfahrt', ankunft?, tag?, stufe, adresse?, versuche, at }
    function nimmAdr() { if (adr && Date.now() - adr.at >= FRIST_MS) adr = null; return adr; }
    function adresseFehlt(info) {   // Rückgabe: der Fragesatz
        info = info || {};
        offen = null;
        adr = { name: String(info.name || ''), art: info.art || 'navigate', ankunft: info.ankunft || '', tag: info.tag || '', stufe: 'adresse', versuche: 0, at: Date.now() };
        try { window.jvFrage && window.jvFrage.neu('rueckfrage'); } catch (e) { }
        return 'Ich habe keine Adresse von ' + adr.name + ' gespeichert. Wie lautet sie?';
    }
    const JA = /^(?:ja|jawohl|jep|jo|gerne|gern|klar|okay|ok|bitte|genau|natuerlich|mach das|mach es|ja bitte|ja gerne|ja klar|ja mach das|ja okay|ja ok)$/;
    const NEIN = /^(?:nein|nee|ne|noe|nein danke|lieber nicht|nicht jetzt)$/;
    const NUR_EINMAL = /\bnur\s+(?:diesmal|dieses\s?mal|einmal|jetzt|heute)\b|\bnicht\s+speichern\b|\bohne\s+speichern\b/;
    const ABBRUCH = /^(?:vergiss es|vergiss das|abbrechen|abbruch|egal|lass gut sein|lass es|nichts|stopp|stop|nein danke|keinen|nee|nein|ne)\b/;
    const THEMA = /^(?:wie|was|wann|wo|wer|wieso|warum|welche\w*|erinner\w*|stell\w*|navigier\w*|ruf\w*|spiel\w*|zeig\w*|such\w*|mach\w*|trag\w*|schick\w*|schreib\w*|lies|sag\w*|hey|jarvis|kannst|koenntest|gibt|ich|wir|es gibt)\b/;
    function adresseAus(text) {   // plausible Adresse (Straße + Hausnummer, mit Ort), sonst ''
        let t = String(text || '').trim().replace(/[.!?]+$/, '').replace(/^(?:die\s+)?(?:adresse\s+)?(?:lautet|ist|:)\s+/i, '').replace(/^(?:sie\s+lautet|es\s+ist|das\s+ist)\s+/i, '').trim();
        const w = t.split(/\s+/).filter(Boolean);
        if (w.length < 2 || w.length > 14) return '';
        if (!/\b\d{1,4}[a-zA-Z]?\b/.test(t)) return '';          // Hausnummer
        if (!w.some(x => /[A-Za-zÄÖÜäöüß]{4,}/.test(x))) return '';   // ein Straßen- oder Ortsname
        return t;
    }
    function aufgabeText(a, ziel) {
        if (a.art === 'fahrzeit') return 'Wie lange brauche ich zu ' + ziel + '?';
        if (a.art === 'abfahrt') {
            const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(a.tag || '');
            const wann = iso ? 'am ' + iso[3] + '.' + iso[2] + '.' + iso[1] + ' ' : a.tag === 'morgen' ? 'morgen ' : (a.tag === 'uebermorgen' || a.tag === 'übermorgen') ? 'übermorgen ' : 'heute ';
            return 'Wann muss ich ' + wann + 'losfahren, um ' + a.ankunft + ' Uhr bei ' + ziel + ' zu sein?';
        }
        return 'Navigiere zu ' + ziel;
    }
    function aufgabeWort(a) { return a.art === 'fahrzeit' ? 'die Fahrzeit zu ' + a.name + ' berechnen' : a.art === 'abfahrt' ? 'die Abfahrtszeit zu ' + a.name + ' berechnen' : 'die Navigation zu ' + a.name + ' starten'; }
    async function speichern(a) {   // true nur, wenn die Registry den Erfolg bestätigt hat
        try {
            if (!window.jvRegistry || typeof window.jvRegistry.fuehreAus !== 'function') return false;
            const r = await window.jvRegistry.fuehreAus('kontakt_speichern', { name: a.name, adresse: a.adresse }, {});
            return !!r && r.status === 'SUCCESS';
        } catch (e) { return false; }
    }
    function adresseAntwort(text, t) {   // true = behandelt; false = nicht für uns (Themenwechsel): Frage verfällt, Satz läuft normal weiter
        const a = nimmAdr(); if (!a) return false;
        if (a.stufe === 'adresse') {
            if (ABBRUCH.test(t) && !/\d/.test(t)) { adr = null; sagen('In Ordnung, dann lassen wir es.', false); return true; }
            if (JA.test(t)) { a.at = Date.now(); sagen('Wie lautet die Adresse von ' + a.name + '?', true); return true; }
            const ad = adresseAus(text);
            if (ad) {
                a.adresse = ad; a.stufe = 'speichern'; a.at = Date.now();
                try { window.jvFrage && window.jvFrage.neu('rueckfrage'); } catch (e) { }
                sagen('Soll ich diese Adresse bei ' + a.name + ' in deinen Kontakten speichern?', true); return true;
            }
            if (THEMA.test(t) || t.split(' ').length > 14) { adr = null; return false; }
            a.versuche++;
            if (a.versuche >= 2) { adr = null; sagen('Das ist keine vollständige Adresse. Ich lasse es dabei.', false); return true; }
            a.at = Date.now();
            try { window.jvFrage && window.jvFrage.neu('rueckfrage'); } catch (e) { }
            sagen('Das sieht nicht nach einer vollständigen Adresse aus. Bitte nenne Straße, Hausnummer und Ort.', true); return true;
        }
        if (a.stufe === 'speichern') {
            const einmal = NUR_EINMAL.test(t) || NEIN.test(t);
            if (!JA.test(t) && !einmal) { adr = null; return false; }
            a.stufe = 'start'; a.at = Date.now();
            try { window.jvFrage && window.jvFrage.neu('rueckfrage'); } catch (e) { }
            if (einmal) { sagen('Gut, ich speichere nichts. Soll ich ' + aufgabeWort(a) + ', mit dieser Adresse nur diesmal?', true); return true; }
            speichern(a).then(function (ok) {
                const cur = adr; if (cur !== a) return;   // inzwischen überholt
                if (ok) sagen('Die Adresse wurde gespeichert. Soll ich jetzt ' + aufgabeWort(a) + '?', true);
                else sagen('Das Speichern hat nicht geklappt, ich habe nichts gespeichert. Soll ich ' + aufgabeWort(a) + ', mit dieser Adresse nur diesmal?', true);
            });
            return true;
        }
        if (a.stufe === 'start') {
            if (JA.test(t)) {   // die Aufgabe geht denselben Weg wie ein gesprochener Satz (voice.js: jvTippen), also mit allen Befehlen und der Chef-KI wie sonst
                adr = null; const satz = aufgabeText(a, a.adresse);
                try { if (typeof window.jvTippen === 'function') window.jvTippen(satz); else ausfuehren(satz); } catch (e) { ausfuehren(satz); }
                return true;
            }
            if (NEIN.test(t) || ABBRUCH.test(t)) { adr = null; sagen('In Ordnung, dann lassen wir es.', false); return true; }
            adr = null; return false;
        }
        adr = null; return false;
    }

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
        if (nimmAdr() && t) { if (adresseAntwort(text, t)) return true; return next(text); }
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
    window.jvRueckfrage = { vorbereiten, gemerkt, waehle, ersetzen, offen: nimmOffen, adresseFehlt, adresseOffen: nimmAdr, _adresseAus: adresseAus };
})();
