/* ============================================================
   FOTO PERSON: "Das ist meine Tochter Julia" (nach einem Foto) oder "Merk dir, wie Julia aussieht" (dann Foto machen).
   Zane beschreibt, was er sieht (Haare, Brille, ungefähres Alter, Kleidung, auffällige Merkmale), sagt es dir und fragt: "Soll ich mir das merken?".
   Bei "Ja" steht die Beschreibung im Langzeitgedächtnis ("Wie sieht Julia aus?" beantwortet er daraus). Ein neues Foto derselben Person ersetzt die alte Beschreibung.
   WICHTIG: Gesichter werden NICHT wiedererkannt. Er erkennt Julia auf einem neuen Foto nicht selbst, er kennt nur die gemerkte Beschreibung.
   Das Foto selbst wird nicht gespeichert, nur der Text. Ohne dein "Ja" wird nichts gespeichert. Vergessen: "Vergiss, wie Julia aussieht" (oder im Langzeitgedächtnis-Fenster löschen).
   Hängt sich in photo.js ein (parsePhotoRequest, processPhoto, handlePhotoCommand) und muss nach foto_abtippen.js und foto_erkennen.js geladen werden.
   Benutzt: askVision, photoJsonObject, lastPhoto, photoIntent, showPhotoCards, apiFetch, /api/memory.
   ============================================================ */
(function () {
    if (typeof window.processPhoto !== 'function' || typeof window.parsePhotoRequest !== 'function') return;

    const REL = 'tochter|sohn|frau|mann|mutter|vater|bruder|schwester|enkelin|enkel|freundin|freund|kollegin|kollege|oma|opa|nichte|neffe|tante|onkel|schwiegermutter|schwiegervater|schwiegersohn|schwiegertochter|cousine|cousin|nachbarin|nachbar|chefin|chef|partnerin|partner|mama|papa|großmutter|großvater|kind';
    const NAME = '[A-ZÄÖÜ][a-zäöüßé-]{1,24}';
    const NICHT_NAME = new Set(['Zane', 'Scarlett', 'Das', 'Dies', 'Merk', 'Merke', 'Foto', 'Bild', 'Ja', 'Nein', 'Ok', 'Okay', 'Bitte', 'Hier', 'Wie', 'Aussehen', 'Gesicht', 'Person', 'Dir', 'Mir', 'Von', 'Meiner', 'Meines', 'Meinem', 'Meine']);
    REL.split('|').forEach(r => NICHT_NAME.add(r.charAt(0).toUpperCase() + r.slice(1)));
    const PHOTO_FRESH_MS = (typeof PHOTO_FOLLOWUP_MS !== 'undefined') ? PHOTO_FOLLOWUP_MS : 600000;

    function say(msg) {
        if (typeof photoSay === 'function') photoSay(msg);
        else speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    }
    function norm(t) { return String(t || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    const fresh = () => typeof lastPhoto !== 'undefined' && lastPhoto && Date.now() - lastPhoto.at < PHOTO_FRESH_MS;
    function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

    /* Sätze erkennen. Rückgabe: { name, rel, nurMerken } oder null. Der Name kommt aus der Großschreibung des Originaltexts. */
    function parse(text, hatFoto) {
        const raw = String(text || '').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        const t = raw.toLowerCase();
        if (!t || t.length > 90 || /^(?:was|wann|wo|wie viel|welche\w*|hast|hat|weißt|weisst)\b/.test(t)) return null;
        let m;
        // "Das ist meine Tochter Julia" / "Das ist Julia" (nur mit frischem Foto)
        if (hatFoto && (m = raw.match(new RegExp('^(?:jarvis |zane |scarlett )?(?:das|dies|das hier)\\s+ist\\s+(?:(?:meine?|mein|unsere?|unser)\\s+(' + REL + ')\\b\\s*(' + NAME + ')?|(' + NAME + '))\\s*$', 'i')))) {
            const rel = m[1] ? m[1].toLowerCase() : '';
            let name = m[2] || m[3] || '';
            if (name && !/^[A-ZÄÖÜ]/.test(name)) name = '';
            if (NICHT_NAME.has(name)) name = '';
            if (rel || name) return { name, rel };
        }
        // "Merk dir, wie Julia aussieht" / "Merk dir das Aussehen von meiner Tochter Julia"
        if (/\b(?:merk\w*|speicher\w*)\b/.test(t) && /\b(?:aussieht|aussehen|aussah|gesicht|person)\b/.test(t)) {
            const rel = ((t.match(new RegExp('\\b(' + REL + ')\\b')) || [])[1]) || '';
            const caps = (raw.match(new RegExp('\\b' + NAME + '\\b', 'g')) || []).filter((w, i) => !NICHT_NAME.has(w) && !(i === 0 && raw.indexOf(w) === 0));
            const name = caps[0] || '';
            return { name, rel, nurMerken: true };
        }
        return null;
    }
    function label(p) { return p.name ? p.name : cap(p.rel || 'Person'); }
    function slug(s) { return String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'person'; }

    /* ---------- Einhängen ---------- */
    const origParse = window.parsePhotoRequest;
    window.parsePhotoRequest = function (text) {
        const p = parse(text, false);
        if (p && p.nurMerken) return { task: 'person', question: String(text || '') };
        return origParse.apply(this, arguments);
    };
    const origProcess = window.processPhoto;
    window.processPhoto = async function (intent, dataUrl) {
        if (intent && intent.task === 'person') return processPerson(parse(intent.question, true) || parse(intent.question, false) || {}, dataUrl);
        return origProcess.apply(this, arguments);
    };
    if (typeof window.handlePhotoCommand === 'function') {
        const origCmd = window.handlePhotoCommand;
        window.handlePhotoCommand = function (text) {
            try {
                const p = parse(text, fresh());
                if (p) {
                    if (fresh()) {
                        runLastPhotoTask('person', text).catch(() => say('Das hat gerade nicht geklappt.'));
                        return true;
                    }
                    if (p.nurMerken) {
                        photoIntent = { task: 'person', question: String(text || ''), at: Date.now() };
                        if (typeof showPhotoCards === 'function') showPhotoCards();
                        say('Machen Sie bitte ein Foto von ' + (p.name || (p.rel ? 'der Person' : 'der Person')) + '. Tippen Sie unten auf die Karte, dann öffnet sich die Kamera. Ich beschreibe dann, was ich sehe, und frage, ob ich es mir merken soll.');
                        return true;
                    }
                }
            } catch (e) { console.error('Foto-Person', e); }
            return origCmd.apply(this, arguments);
        };
    }

    /* ---------- Foto auswerten ---------- */
    function prompt() {
        return 'Du beschreibst das ÄUSSERE einer Person auf einem Foto kurz und sachlich auf Deutsch, damit sich eine Assistenz-App merken kann, wie die Person aussieht. ' +
            'Nenne nur, was man sieht: Haarfarbe und Frisur, Brille, Bart, ungefähres Alter in groben Gruppen (Kind, Jugendliche/r, junge/r Erwachsene/r, Erwachsene/r, ältere Person), Kleidung, auffällige Merkmale (Sommersprossen, Mütze, Schmuck). ' +
            'Nenne NICHT: Namen, Herkunft, Hautfarbe, Gesundheit, Gefühle, Attraktivität, Gewicht. Rate nicht, wer die Person ist. Höchstens zwei kurze Sätze, ohne die Person beim Namen zu nennen (schreibe "Die Person hat ..."). ' +
            'Sind mehrere Personen zu sehen, beschreibe nur die auffälligste und schreibe in "mehrere" true. Ist keine Person zu sehen, ist "beschreibung" leer. ' +
            'Antworte NUR mit JSON: {"beschreibung":"...", "mehrere":true oder false}.';
    }
    let pending = null;   // { name, rel, text, at }

    async function processPerson(p, dataUrl) {
        const who = label(p);
        if (!p.name && !p.rel) { say('Wer ist das? Sagen Sie zum Beispiel: Das ist meine Tochter Julia. Das Foto bleibt dafür kurz erhalten.'); return; }
        try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Sehe mir ' + who + ' an...'); } catch (e) {}
        let o = null;
        try { o = photoJsonObject(await askVision(prompt(), 'Beschreibe das Äußere der Person.', dataUrl, true)); } catch (e) { console.error('Foto-Person', e && e.message); }
        const text = o && String(o.beschreibung || '').replace(/\s+/g, ' ').trim().slice(0, 400);
        if (!text) { say(o ? 'Auf dem Foto kann ich keine Person erkennen. Versuchen Sie es bitte nochmal, etwas näher und gut beleuchtet.' : 'Das Foto konnte ich gerade nicht auswerten.'); return; }
        const mehr = o.mehrere === true ? ' Es sind mehrere Personen zu sehen, ich habe nur eine beschrieben.' : '';
        pending = { name: p.name, rel: p.rel, text, at: Date.now() };
        say('Das sehe ich bei ' + who + ': ' + text + mehr + ' Soll ich mir das merken? Ein Gesicht erkenne ich später damit nicht wieder, ich merke mir nur diese Beschreibung.');
    }

    async function speichern() {
        const p = pending; pending = null;
        if (!p) return;
        const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        const lesbar = new Date(heute + 'T12:00:00').toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' });
        const who = label(p);
        const rel = p.rel ? ' (' + cap(p.rel) + ' des Users)' : '';
        const body = p.text.replace(/^Die Person\b/, who);
        const fullText = ('Aussehen von ' + who + rel + ', nach einem Foto vom ' + lesbar + ': ' + body).slice(0, 1990);
        try {
            const res = await apiFetch('/api/memory', {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'store', id: 'person_' + slug(who), text: fullText, metadata: { typ: 'episode', kategorie: 'Person', titel: who, quelle: 'foto', datum_gesagt: heute, status: 'ohne_nachfrage', anstoss_aus: true } })
            });
            if (!res.ok) throw new Error('Fehler ' + res.status);
            say('Gut, ich habe mir gemerkt, wie ' + who + ' aussieht.');
        } catch (e) { console.error('Foto-Person speichern', e); say('Im Langzeitgedächtnis konnte ich das gerade nicht speichern.'); }
    }

    /* ---------- Ja / Nein / Vergessen ---------- */
    const JA = /^(?:ja|jawohl|jo|gerne|bitte|okay|ok|klar|mach das|mach es|ja bitte|ja gerne|merk dir das|merk es dir|speichern|speicher es|passt)$/;
    const NEIN = /^(?:nein|nee|nö|nicht|lieber nicht|nein danke|vergiss es|lass (?:es|das)|verwerfen|abbrechen)$/;
    async function vergessen(name) {
        try {
            const res = await apiFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'delete', ids: ['person_' + slug(name)] }) });
            if (!res.ok) throw new Error('Fehler ' + res.status);
            say('Gut, ich habe vergessen, wie ' + name + ' aussieht.');
        } catch (e) { say('Das konnte ich gerade nicht löschen. Im Langzeitgedächtnis-Fenster können Sie den Eintrag selbst entfernen.'); }
    }
    function handle(text) {
        const t = norm(text);
        if (!t) return false;
        let m;
        if (t.length <= 70 && (m = String(text).match(new RegExp('vergiss\\w*,?\\s+(?:wie\\s+)?(?:meine?\\s+(?:' + REL + ')\\s+)?(' + NAME + ')\\s+aussieht', 'i')))) { vergessen(cap(m[1])); return true; }
        if (!pending) return false;
        if (Date.now() - pending.at > 5 * 60000) { pending = null; return false; }
        if (JA.test(t)) { speichern(); return true; }
        if (NEIN.test(t)) { pending = null; say('Gut, ich habe nichts gespeichert.'); return true; }
        return false;
    }
    if (window.jvCommands) {
        window.jvCommands.use('foto-person', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Foto-Person', e); }
            return next(text);
        }, 97);
    }

    /* ---------- Hinweis für die KI ---------- */
    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'foto-person', function (next) {
            return next() + '\n\nPersonenbeschreibungen: Einträge "Aussehen von <Name> …" in gedächtnis_semantisch sind Beschreibungen nach einem Foto, die der User dir gegeben hat. Beantworte "Wie sieht <Name> aus?" daraus, knapp und ohne etwas dazuzuerfinden. Erkenne niemals Personen an ihrem Gesicht auf einem Foto.';
        }, 212);
    }

    window.jvFotoPerson = { parse, handle, prompt, label };
})();
