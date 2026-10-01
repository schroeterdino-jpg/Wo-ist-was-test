/* ============================================================
   AUSSPRACHE-LISTE: Jarvis merkt sich, wie schwierige Wörter und Namen gesprochen werden sollen.
   Beispiel: "Sprich Alyssa so aus: Alischa" - angezeigt bleibt "Alyssa", gesprochen wird "Alischa".
   Braucht: storage.js (getPersistentData/setPersistentData), voice.js (speak). Muss NACH voice.js geladen werden.

   So greift es ein: voice.js schickt jeden zu sprechenden Text an fetchCloudSpeechBlob() (Cloud-Stimme)
   bzw. speakBrowser()/speakAckBrowser() (Handy-Stimme). Diese drei Funktionen werden hier umhüllt und ersetzen
   vor dem Sprechen die Wörter aus der Liste. voice.js selbst bleibt unverändert; bei der Cloud-Stimme
   zeigt der Untertitel weiter die Original-Schreibweise.
   ============================================================ */

const PRONUNCIATION_KEY = 'helfer_pronunciations';

function getPronunciations() {
    try {
        const obj = JSON.parse(getPersistentData(PRONUNCIATION_KEY, '{}') || '{}');
        return (obj && typeof obj === 'object' && !Array.isArray(obj)) ? obj : {};
    } catch (e) {
        return {};
    }
}

function savePronunciations(obj) {
    setPersistentData(PRONUNCIATION_KEY, JSON.stringify(obj));
}

function pronunciationEscape(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/* Ersetzt jedes Wort der Liste im Text (ganze Wörter, Groß-/Kleinschreibung egal, auch mit angehängtem "s": "Alyssas") */
function applyPronunciations(text) {
    let out = String(text == null ? '' : text);
    const dict = getPronunciations();
    const keys = Object.keys(dict).sort((a, b) => b.length - a.length);
    keys.forEach(word => {
        const spoken = dict[word];
        if (!word || !spoken) return;
        try {
            const re = new RegExp('(?<![\\p{L}\\p{N}])' + pronunciationEscape(word) + '(s)?(?![\\p{L}\\p{N}])', 'giu');
            out = out.replace(re, (m, s) => spoken + (s || ''));
        } catch (e) { /* ein kaputter Eintrag darf das Sprechen nie verhindern */ }
    });
    return out;
}

function validPronunciationPart(s) {
    const t = String(s || '').trim();
    return t.length >= 1 && t.length <= 40 && t.split(/\s+/).length <= 4;
}

/* Gibt true zurück, wenn gespeichert wurde */
function savePronunciation(word, spoken) {
    word = String(word || '').trim().replace(/^[„“"'\s]+|[„“"'.,!?\s]+$/g, '');
    spoken = String(spoken || '').trim().replace(/^[„“"'\s]+|[„“"'.,!?\s]+$/g, '');
    if (!validPronunciationPart(word) || !validPronunciationPart(spoken)) return false;
    if (word.toLowerCase() === spoken.toLowerCase()) return false;
    const dict = getPronunciations();
    Object.keys(dict).forEach(k => { if (k.toLowerCase() === word.toLowerCase()) delete dict[k]; });   // gleiches Wort nicht doppelt
    dict[word] = spoken;
    savePronunciations(dict);
    renderPronunciationList();
    return true;
}

/* Gibt true zurück, wenn etwas gelöscht wurde */
function deletePronunciation(word) {
    const dict = getPronunciations();
    const key = Object.keys(dict).find(k => k.toLowerCase() === String(word || '').trim().toLowerCase());
    if (!key) return false;
    delete dict[key];
    savePronunciations(dict);
    renderPronunciationList();
    return true;
}

/* --- Einstellungen: Liste anzeigen und Einträge von Hand pflegen --- */
function renderPronunciationList() {
    const box = document.getElementById('pronunciationList');
    if (!box) return;
    const dict = getPronunciations();
    const keys = Object.keys(dict).sort((a, b) => a.localeCompare(b, 'de'));
    box.textContent = '';
    if (keys.length === 0) {
        const p = document.createElement('p');
        p.className = 'text-slate-500 italic';
        p.textContent = 'Noch keine eigene Aussprache gespeichert.';
        box.appendChild(p);
        return;
    }
    keys.forEach(word => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between gap-2 py-1';
        const label = document.createElement('span');
        label.className = 'text-slate-200 break-words min-w-0';
        label.textContent = `${word} → ${dict[word]}`;
        const btns = document.createElement('span');
        btns.className = 'flex gap-2 shrink-0';
        const play = document.createElement('button');
        play.type = 'button';
        play.className = 'px-2 py-1 rounded border border-[rgba(93,209,255,.3)] text-[#49d7ff]';
        play.textContent = '🔊';
        play.setAttribute('aria-label', 'Anhören');
        play.addEventListener('click', () => { if (typeof playUiBeep === 'function') playUiBeep(); speak(word); });
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'px-2 py-1 rounded border border-[rgba(93,209,255,.3)] text-[#49d7ff]';
        del.textContent = '🗑️';
        del.setAttribute('aria-label', 'Löschen');
        del.addEventListener('click', () => { if (typeof playUiBeep === 'function') playUiBeep(); deletePronunciation(word); });
        btns.appendChild(play);
        btns.appendChild(del);
        row.appendChild(label);
        row.appendChild(btns);
        box.appendChild(row);
    });
}

function savePronunciationManual() {
    const wordEl = document.getElementById('pronWordInput');
    const spokenEl = document.getElementById('pronSpokenInput');
    if (!wordEl || !spokenEl) return;
    const word = wordEl.value.trim(), spoken = spokenEl.value.trim();
    if (!savePronunciation(word, spoken)) {
        speak('Das konnte ich nicht speichern. Bitte Wort und Aussprache ausfüllen, und die beiden müssen sich unterscheiden.');
        return;
    }
    wordEl.value = '';
    spokenEl.value = '';
    speak(`Gut, ab jetzt sage ich ${word.trim()}.`);   // der Text läuft durch die Liste: man hört gleich die neue Aussprache
}

/* --- Sprachbefehle ---
   "Sprich Alyssa so aus: Alischa" / "Sprich Alyssa wie Alischa aus" / "Alyssa wird Alischa ausgesprochen" /
   "Merk dir die Aussprache von Alyssa: Alischa" / "Vergiss die Aussprache von Alyssa" / "Welche Aussprachen kennst du?"
   Gibt true zurück, wenn der Satz hier behandelt wurde. */
function handlePronunciationCommand(text) {
    const t = String(text || '').replace(/[„“"”]/g, '').replace(/[.!?]+$/, '').trim();
    if (!t || t.length > 120) return false;
    const done = (msg) => { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); return true; };

    let m = t.match(/^(?:bitte\s+)?(?:vergiss|lösche|löschen|entferne|streiche)\s+(?:die\s+)?aussprache\s+(?:von|für|bei)\s+(.+)$/i);
    if (m) {
        const word = m[1].trim();
        return done(deletePronunciation(word) ? `Gut, ${word} spreche ich wieder wie geschrieben aus.` : `Zu ${word} habe ich keine eigene Aussprache gespeichert.`);
    }

    if (/^(?:welche|zeig\w*|nenne?|sag\w*)\b.*\baussprachen?\b/i.test(t)) {
        const dict = getPronunciations();
        const keys = Object.keys(dict);
        if (keys.length === 0) return done('Ich habe noch keine eigene Aussprache gespeichert.');
        return done('Ich kenne diese Aussprachen: ' + keys.map(k => `${k} sage ich wie ${dict[k]}`).join(', ') + '.');
    }

    m = t.match(/^(?:bitte\s+)?spr(?:ich|ech)\w*\s+(?:den\s+namen\s+|das\s+wort\s+|den\s+begriff\s+)?(.+?)\s+so\s+aus\s*[:,]?\s+(.+)$/i)
        || t.match(/^(?:bitte\s+)?spr(?:ich|ech)\w*\s+(?:den\s+namen\s+|das\s+wort\s+|den\s+begriff\s+)?(.+?)\s+(?:wie|als)\s+(.+?)\s+aus$/i)
        || t.match(/^(?:merk\w*\s+(?:dir\s+)?)?(?:die\s+)?aussprache\s+(?:von|für|bei)\s+(.+?)\s*(?:ist|lautet|wie|:|,)\s*(.+)$/i);
    if (!m) {
        // "Alyssa wird Alischa ausgesprochen": nur kurze Wort-Paare, sonst würde ein normaler Satz fälschlich als Aussprache gelten
        const p = t.match(/^(.+?)\s+(?:wird|soll)\s+(?:wie\s+)?(.+?)\s+(?:ausgesprochen|gesprochen)$/i);
        if (!p) return false;
        const w = p[1].trim().split(/\s+/), sp = p[2].trim();
        if (w.length > 2 || sp.split(/\s+/).length > 2) return false;
        if (/^(das|der|die|den|dem|es|er|sie|ich|wir|man|dies|dieses|diese|was|wer|wie)$/i.test(w[0])) return false;
        if (/\b(wie|und|oder|nicht|heute|morgen|gestern)\b/i.test(sp)) return false;
        m = p;
    }

    const word = m[1].trim(), spoken = m[2].trim();
    if (!validPronunciationPart(word) || !validPronunciationPart(spoken)) return false;
    if (word.toLowerCase() === spoken.toLowerCase()) {
        // Die Spracherkennung hat beides gleich geschrieben (z.B. verbessert sie bestimmte Namen von selbst)
        return done('Die Spracherkennung hat beides gleich geschrieben. Bitte tragen Sie die Aussprache in den Einstellungen unter Stimme ein.');
    }
    if (!savePronunciation(word, spoken)) return false;
    return done(`Gut, ab jetzt sage ich ${word}.`);   // läuft selbst durch die Liste: man hört gleich die neue Aussprache
}

/* --- Einklinken in die Sprachausgabe (voice.js bleibt unverändert) --- */
(function hookSpeech() {
    if (typeof fetchCloudSpeechBlob === 'function') {
        const origCloud = fetchCloudSpeechBlob;
        fetchCloudSpeechBlob = function (text, voice) {
            return origCloud.call(this, applyPronunciations(text), voice);
        };
    }
    if (typeof speakBrowser === 'function') {
        const origBrowser = speakBrowser;
        speakBrowser = function (cleanText, onComplete, langCode) {
            return origBrowser.call(this, langCode ? cleanText : applyPronunciations(cleanText), onComplete, langCode);   // Dolmetscher (Fremdsprache) bleibt unberührt
        };
    }
    if (typeof speakAckBrowser === 'function') {
        const origAck = speakAckBrowser;
        speakAckBrowser = function (text, gen, onComplete) {
            return origAck.call(this, applyPronunciations(text), gen, onComplete);
        };
    }
})();

/* Liste in den Einstellungen aktuell halten: beim Start und bei jeder Neuzeichnung der Listen */
(function hookRender() {
    if (typeof renderAllLists === 'function') {
        const origRender = renderAllLists;
        renderAllLists = function () {
            const result = origRender.apply(this, arguments);
            try { renderPronunciationList(); } catch (e) {}
            return result;
        };
    }
    try { renderPronunciationList(); } catch (e) {}
})();
