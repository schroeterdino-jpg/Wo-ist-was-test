/* ============================================================
   FISH AUDIO ALS HAUPTSTIMME: ergänzt die Sprachausgabe aus voice.js um die Stimme "Fish Audio", ohne voice.js zu verändern.
   - Einstellungen > Stimme & Gespräch > Sprachausgabe: neue Auswahl "Fish Audio" (steht oben), dazu Eingabe der Stimmen-ID und "Fish-Stimme testen".
   - Einmalige Umstellung: Beim ersten Start mit dieser Datei wird Fish Audio auf diesem Gerät zur Hauptstimme. Jederzeit änderbar.
   - Rückfallkette (auf dem Server, api/stau.js): Fish Audio -> OpenAI -> Edge-TTS; die Handy-Stimme bleibt der letzte Rückfall in voice.js.
   - Menschliche Laute (Seufzen, Einatmen, Räuspern, Lachen, Pausen): siehe unten bei humanize(). Stufe in den Einstellungen oder per Sprache. Bei allen anderen Stimmen
     wird nichts davon gesprochen oder angezeigt.
   - Der Schlüssel steht nur auf dem Server (Vercel: FISH_AUDIO_API_KEY; optional FISH_AUDIO_VOICE_ID und FISH_AUDIO_MODEL), nie im Browser.
   Lange Texte (Briefing): Das Sprechen startet nach dem ersten kurzen Stück, die weiteren folgen nahtlos (siehe startQueue).
   Muss nach voice.js geladen werden. Fehlt die Datei, läuft alles wie vorher.
   ============================================================ */
(function () {
    if (typeof window.getTtsEngine !== 'function' || typeof window.fetchCloudSpeechBlob !== 'function') return;

    function store(key, def) {
        try { return typeof getPersistentData === 'function' ? String(getPersistentData(key, def)) : (localStorage.getItem(key) || def); } catch (e) { return def; }
    }
    function put(key, val) {
        try { if (typeof setPersistentData === 'function') setPersistentData(key, val); else localStorage.setItem(key, val); } catch (e) {}
    }

    // Einmalig: Fish Audio zur Hauptstimme machen (danach zählt, was du in den Einstellungen wählst)
    try {
        if (localStorage.getItem('jv_fish_init') !== '1') {
            localStorage.setItem('jv_fish_init', '1');
            put('tts_engine', 'fish');
        }
    } catch (e) {}

    const VALID = ['browser', 'edge', 'openai', 'fish'];
    window.getTtsEngine = function () {
        const v = store('tts_engine', 'fish');
        return VALID.indexOf(v) !== -1 ? v : 'fish';
    };
    window.setTtsEngine = function (val) {
        put('tts_engine', (val === 'browser' || val === 'edge' || val === 'fish') ? val : 'openai');
    };
    window.getFishVoice = function () { return store('tts_fish_voice', '').replace(/[^a-zA-Z0-9_-]/g, ''); };
    window.setFishVoice = function (val) { put('tts_fish_voice', String(val || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64)); };

    // ---------- Gedankenstriche nicht als "minus" sprechen ----------
    // Die KI schreibt gern "14 Grad - gefühlt wie 13 Grad" mit einem Bindestrich als Gedankenstrich. Zwischen Zahlen liest die Stimme den als "minus".
    // Darum wird jeder Strich mit Leerzeichen davor und danach vor dem Sprechen zu einem Komma (zwischen zwei Zahlen zu "bis"). Ein echtes Minus direkt an der Zahl
    // ("-3 Grad") bleibt, wie es ist. Gilt für alle Stimmen, auch für die Anzeige.
    function fixDashes(t) {
        return String(t)
            .replace(/(\d)\s+[-–—]\s+(\d)/g, '$1 bis $2')
            .replace(/\s+[-–—]\s+/g, ', ')
            .replace(/,\s*,/g, ',')
            .replace(/,\s*([.!?])/g, '$1');
    }
    window.jvFixDashes = fixDashes;

    // ---------- Preise mit drei Nachkommastellen auf Cent runden ----------
    // Spritpreise stehen mit drei Stellen im Text ("2,193 Euro"). Gesprochen werden sie auf den Cent gerundet: "2,19 Euro", "1,679 Euro" -> "1,68 Euro".
    // Betrifft nur gesprochenen Text und die Anzeige des gesprochenen Satzes; die Karten mit den Preisen behalten die drei Stellen.
    const FUEL_WORDS = /(diesel|super|e10|e5|benzin|sprit|kraftstoff|tankstelle|liter|preis|kostet|kosten|zapfsäule)/i;
    function roundPrices(t) {
        return String(t).replace(/(?<![\d,.])(\d{1,2}),(\d{3})(?!\d)/g, (m, a, b, off, str) => {
            const value = parseFloat(a + '.' + b);
            const after = str.slice(off + m.length, off + m.length + 30);
            const before = str.slice(Math.max(0, off - 90), off);
            const money = /^\s*(?:Euro|€|EUR)/i.test(after) || /^\s*(?:pro|je|den|das)\s+Liter/i.test(after);   // "2,183 Euro", "2,183 € pro Liter"
            const isMeasure = /^\s*(?:Grad|°|Kilometer|km|Meter|Prozent|%|Minuten|Stunden|Sekunden|Liter\b(?!\s*$))/i.test(after) && !money;   // Maßangaben sind keine Preise
            const fuelPrice = !isMeasure && FUEL_WORDS.test(before) && value >= 0.9 && value < 4;               // "Diesel kostet aktuell 2,183 bei Aral"
            if (!money && !fuelPrice) return m;
            return (Math.round(value * 100) / 100).toFixed(2).replace('.', ',');
        });
    }
    // alles, was vor dem Sprechen aufgeräumt wird (Gedankenstriche, Preise)
    function normalizeSpoken(t) { return roundPrices(fixDashes(t)); }
    window.jvRoundPrices = roundPrices;
    if (typeof window.speak === 'function' && !window.speak._dash) {
        const originalSpeak = window.speak;
        const wrappedSpeak = function () {
            const a = Array.prototype.slice.call(arguments);
            if (typeof a[0] === 'string') a[0] = normalizeSpoken(a[0]);
            return originalSpeak.apply(this, a);
        };
        wrappedSpeak._dash = true;
        window.speak = wrappedSpeak;
    }

    // ---------- Zahlen und Uhrzeiten als Wörter ----------
    // Fish Audio liest "Es ist 21 Uhr 40." als "... vierzigste", weil es "40." am Satzende für eine Ordnungszahl hält (so ähnlich wie "der 40."). Darum werden
    // Uhrzeiten und Zahlen direkt vor einem Satzpunkt vor dem Senden in Wörter geschrieben: "Es ist einundzwanzig Uhr vierzig."
    // Nur für die Cloud-Stimme; Anzeige und Handy-Stimme bleiben unverändert. Daten wie "3. Oktober" und Dezimalzahlen bleiben, wie sie sind.
    const NUM_UNITS = ['null', 'eins', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht', 'neun', 'zehn', 'elf', 'zwölf', 'dreizehn', 'vierzehn', 'fünfzehn', 'sechzehn', 'siebzehn', 'achtzehn', 'neunzehn'];
    const NUM_TENS = ['', '', 'zwanzig', 'dreißig', 'vierzig', 'fünfzig', 'sechzig', 'siebzig', 'achtzig', 'neunzig'];
    function below100(n, attrib) {
        if (n < 20) return (attrib && n === 1) ? 'ein' : NUM_UNITS[n];
        const t = Math.floor(n / 10), u = n % 10;
        return u ? (u === 1 ? 'ein' : NUM_UNITS[u]) + 'und' + NUM_TENS[t] : NUM_TENS[t];
    }
    function germanNumber(n, attrib) {
        if (n < 100) return below100(n, attrib);
        if (n < 1000) { const h = Math.floor(n / 100), r = n % 100; return (h === 1 ? 'einhundert' : NUM_UNITS[h] + 'hundert') + (r ? below100(r, false) : ''); }
        return String(n);
    }
    const MONTHS_RE = /^\s*(?:januar|februar|märz|april|mai|juni|juli|august|september|oktober|november|dezember)\b/i;
    const ORDINAL_NOUNS_RE = /^\s*(?:platz|stock|etage|klasse|mal|runde|spiel|liga|advent|jahrhundert|woche|tag|monat|quartal|halbzeit|satz|gang)\b/i;
    function numbersToWords(text) {
        let t = String(text);
        // 21:40 -> einundzwanzig Uhr vierzig
        t = t.replace(/(?<![\d:.,])(\d{1,2})\s*[:.]\s*(\d{2})(?![\d:])(?:\s*Uhr\b)?/g, (m, h, mi) => {
            if (m.indexOf('.') !== -1 && !/Uhr\s*$/.test(m)) return m;   // "22.15" nur mit "Uhr" als Uhrzeit lesen
            const hh = +h, mm = +mi;
            if (hh > 24 || mm > 59) return m;
            return germanNumber(hh, true) + ' Uhr' + (mm ? ' ' + below100(mm, false) : '');
        });
        // 21 Uhr 40 / 9 Uhr 05 / 16 Uhr
        t = t.replace(/(?<![\d.,])(\d{1,2}) Uhr(?: (\d{1,2}))?(?![\d])/g, (m, h, mi) => {
            const hh = +h, mm = mi === undefined ? 0 : +mi;
            if (hh > 24 || mm > 59) return m;
            return germanNumber(hh, true) + ' Uhr' + (mi !== undefined && mm ? ' ' + below100(mm, false) : '');
        });
        // Zahl direkt vor einem Satzpunkt ("Es sind 40."), aber keine Daten und Aufzählungen ("am 3. Oktober", "der 2. Platz")
        t = t.replace(/(?<![\w.,:])(\d{1,3})\.(?=\s|$)/g, (m, d, off, str) => {
            const rest = str.slice(off + m.length);
            if (MONTHS_RE.test(rest) || ORDINAL_NOUNS_RE.test(rest)) return m;
            if (/[a-zäöüß]/.test((rest.match(/^\s*(\S)/) || [])[1] || '')) return m;     // klein weiter: eher eine Ordnungszahl im Satz
            return germanNumber(+d, false) + '.';
        });
        return t;
    }
    window.jvNumbersToWords = numbersToWords;

    // ---------- Abkürzungen buchstabieren ----------
    // Fish Audio liest Buchstabenfolgen wie "KJP" englisch ("Kay Jay Pee", das J klingt komisch). Auf Deutsch heißt das "Ka Jot Pe". Darum werden Abkürzungen ohne Vokal
    // (KJP, DB, TV, PC, SMS, GPS, LKW ...) und ein paar bekannte mit Vokal (ARD, ADAC, EU ...) vor dem Senden buchstabiert. Nur für die Cloud-Stimme; die Anzeige bleibt "KJP".
    const LETTER_NAMES = { A: 'A', B: 'Be', C: 'Ze', D: 'De', E: 'E', F: 'Ef', G: 'Ge', H: 'Ha', I: 'I', J: 'Jot', K: 'Ka', L: 'El', M: 'Em', N: 'En', O: 'O', P: 'Pe', Q: 'Ku', R: 'Er', S: 'Es', T: 'Te', U: 'U', V: 'Fau', W: 'We', X: 'Iks', Y: 'Üpsilon', Z: 'Zet', Ä: 'Ä', Ö: 'Ö', Ü: 'Ü' };
    const SPELLED_EXTRA = new Set(['ARD', 'ADAC', 'AOK', 'ICE', 'USA', 'EU', 'UKW', 'DJ', 'AEG', 'IKK', 'TUI', 'UPS', 'FAQ', 'EG', 'OG', 'UG', 'ABS', 'EC', 'AG', 'OP', 'IC', 'RE', 'RB']);
    function spellAbbreviations(text) {
        return String(text).replace(/(?<![\wÄÖÜäöüß])[A-ZÄÖÜ]{2,5}(?![\wÄÖÜäöüß])/g, (w) => {
            if (!(SPELLED_EXTRA.has(w) || !/[AEIOUÄÖÜ]/.test(w))) return w;
            return w.split('').map(c => LETTER_NAMES[c] || c).join(' ');
        });
    }
    window.jvSpellAbbreviations = spellAbbreviations;

    // ---------- Menschliche Laute (nur Fish Audio) ----------
    // Fish Audio versteht Anweisungen in eckigen Klammern. Hier werden sie vor dem Senden in den Text gesetzt, nie in der Anzeige und nie bei anderen Stimmen:
    //  [sigh] Seufzen: bei Stau und Unangenehmem (Stau, lange Fahrt, Sprit, Bahn) und manchmal bei "Einen Moment ...", dazu mal ein "Hmm."
    //  [inhale] tiefes Einatmen vor langen Antworten, [clearing throat] Räuspern nach längerer Pause
    //  vor dem Spruch (sprueche.js setzt dort ein unsichtbares Zeichen): [laughing] / [chuckle] Lachen, oder [short pause] Pause vor der Pointe
    // Nie bei ernsten Themen (Warnungen, Fehler, Erinnerungen, Gesundheit, E-Mails, Geld ...) und höchstens je ein Laut am Anfang und einer vor dem Spruch.
    // Stufe: aus / dezent (halb so oft) / mittel (Standard). Einstellungen > Stimme, oder per Sprache "Menschliche Laute aus / dezent / an".
    const MARK = '\u2063';
    const MARK_RE = new RegExp(MARK, 'g');
    const strip = (t) => String(t == null ? '' : t).replace(MARK_RE, '');
    const LEVELS = ['aus', 'dezent', 'mittel'];
    window.getHumanLevel = function () { const v = store('jv_human', 'mittel'); return LEVELS.indexOf(v) !== -1 ? v : 'mittel'; };
    window.setHumanLevel = function (v) { put('jv_human', LEVELS.indexOf(v) !== -1 ? v : 'mittel'); };
    window.getChuckle = function () { return window.getHumanLevel() !== 'aus'; };               // alte Namen, falls andere Dateien sie benutzen
    window.setChuckle = function (on) { window.setHumanLevel(on ? 'mittel' : 'aus'); };

    let lastFishAt = 0;
    const THINKING = /^(?:einen moment|moment|ich schaue|ich sehe|ich prüfe|ich suche|ich frage|sofort|gleich|mal sehen|ich rechne|ich lade)/i;
    const SIGH_CATS = { stau_viel: 0.6, stau_lang: 0.7, fahrt_lang: 0.3, sprit: 0.3, bahn: 0.2 };

    function humanize(text) {
        const level = window.getHumanLevel();
        const force = window.__jvForceHuman === true;
        window.__jvForceHuman = false;
        if (level === 'aus') return strip(text);
        const f = force ? 1000 : (level === 'dezent' ? 0.5 : 1);      // Faktor auf alle Wahrscheinlichkeiten
        const roll = (p) => force || Math.random() < p * f;
        const idx = String(text).indexOf(MARK);
        const pre = idx === -1 ? String(text) : String(text).slice(0, idx);
        const quip = idx === -1 ? '' : strip(String(text).slice(idx + 1));
        const serious = typeof window.jvIsSerious === 'function' && window.jvIsSerious(pre + ' ' + quip);
        const now = Date.now();
        const idle = lastFishAt && now - lastFishAt > 15 * 60000;
        lastFishAt = now;
        let start = '';
        let out = strip(pre);
        if (!serious) {
            const cat = typeof window.jvClassify === 'function' ? (window.jvClassify(pre) || {}).cat : null;
            const plainLen = out.replace(/\s+/g, ' ').length;
            if (idle && roll(0.6)) start = '[clearing throat] ';
            else if (cat && SIGH_CATS[cat] && roll(SIGH_CATS[cat])) start = '[sigh] ';
            else if (plainLen <= 70 && THINKING.test(out.trim())) { if (roll(0.3)) start = '[sigh] '; else if (roll(0.2)) start = 'Hmm. '; }
            else if (plainLen > 180 && roll(0.5)) start = '[inhale] ';
        }
        let mid = '';
        if (quip && !serious && (force || Math.random() < (level === 'dezent' ? 0.45 : 0.85))) {
            const r = force ? 0.5 : Math.random();
            mid = r < 0.25 ? '[laughing] ' : r < 0.75 ? '[chuckle] ' : '[short pause] ';
        }
        if (!quip) return start + out;
        const sep = /[\s]$/.test(out) ? '' : ' ';
        return start + out + sep + mid + quip;
    }
    // Handy-Stimme (Browser): das Zeichen nie mit vorlesen lassen
    if (typeof window.speakBrowser === 'function' && !window.speakBrowser._jv) {
        const originalBrowser = window.speakBrowser;
        const wrappedBrowser = function () { const a = Array.prototype.slice.call(arguments); a[0] = normalizeSpoken(strip(a[0])); return originalBrowser.apply(this, a); };
        wrappedBrowser._jv = true;
        window.speakBrowser = wrappedBrowser;
    }

    // ---------- Abruf vom Server ----------
    // Kurze Texte: eine Anfrage (der Server weicht bei Problemen selbst auf OpenAI/Edge aus).
    // Lange Texte (Briefing!): Das Sprechen beginnt nach dem ERSTEN kurzen Stück (ein bis zwei Sätze, ca. 1-3 Sekunden). Die weiteren Stücke holt die App
    // nacheinander im Hintergrund und hängt sie nahtlos an, noch während das erste läuft (ein Stück Sprache dauert beim Abspielen viel länger als beim Erzeugen).
    // Nacheinander statt gleichzeitig, damit Fish Audio nicht wegen zu vieler Anfragen ablehnt. Alle Stücke bekommen dieselbe Fish-Stimme; hakt ein späteres Stück
    // auch nach zwei Versuchen, wird der RESTTEXT einmal über die normale Kette (OpenAI/Edge) gesprochen, damit nichts fehlt.
    const CHUNK_MAX = 280, SINGLE_MAX = 320, FIRST_MIN = 60, FIRST_MAX = 170;

    function sentencesOf(text) {
        const t = String(text).replace(/\s+/g, ' ').trim();
        const out = [];
        t.split(/(?<=[.!?…])\s+/).forEach(sn => {
            let rest = sn;
            while (rest.length > CHUNK_MAX) {                     // sehr langer Satz: an Kommas oder Leerzeichen teilen
                let cut = rest.lastIndexOf(', ', CHUNK_MAX);
                if (cut < 80) cut = rest.lastIndexOf(' ', CHUNK_MAX);
                if (cut < 40) cut = CHUNK_MAX;
                out.push(rest.slice(0, cut + 1).trim());
                rest = rest.slice(cut + 1).trim();
            }
            if (rest) out.push(rest);
        });
        return out;
    }

    /* Teilt in ein kurzes erstes Stück (schneller Start) und danach Stücke bis ~280 Zeichen. Tags bleiben bei ihrem Satz. */
    function splitForFish(text) {
        const t = String(text).replace(/\s+/g, ' ').trim();
        if (t.length <= SINGLE_MAX) return [t];
        const sentences = sentencesOf(t);
        const chunks = [];
        let cur = '', first = true;
        const push = () => { if (cur.trim()) chunks.push(cur.trim()); cur = ''; first = false; };
        sentences.forEach(sn => {
            const limit = first ? FIRST_MAX : CHUNK_MAX;
            if (first && cur && cur.length >= FIRST_MIN) push();
            if (!cur) cur = sn;
            else if ((cur + ' ' + sn).length > limit) { push(); cur = sn; }
            else cur = cur + ' ' + sn;
            if (first && cur.length >= FIRST_MIN) push();
        });
        push();
        return chunks;
    }

    function setLastVoice(engine, ms, chars, parts) {
        window.jvLastVoice = { engine, ms, chars, parts, at: Date.now() };
        try {
            const el = document.getElementById('fishLastVoice');
            if (el) {
                const name = { fish: 'Fish Audio', openai: 'OpenAI', edge: 'Edge', gemischt: 'gemischt' }[engine] || engine;
                el.textContent = `Zuletzt gesprochen mit: ${name} (${chars} Zeichen${parts > 1 ? ', ' + parts + ' Stücke' : ''}, ${(ms / 1000).toFixed(1)} s bis zum Start)`;
                el.style.color = engine === 'fish' ? '#7fe3b0' : '#ffb870';
            }
        } catch (e) {}
    }

    // Das eingestellte Sprechtempo (speechrate.js). Bei Fish Audio wird es direkt bei der Erzeugung der Sprache eingestellt (Fish kann 0,5 bis 2,0),
    // bei den anderen Stimmen und als Ersatz stellt die App das Abspielen schneller oder langsamer.
    function speechRate() {
        try { const v = typeof window.getSpeechRateFactor === 'function' ? Number(window.getSpeechRateFactor()) : 1; return (v >= 0.5 && v <= 2) ? v : 1; } catch (e) { return 1; }
    }

    async function requestOne(text, voice, opts) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), opts.timeout);
        try {
            const oaVoice = typeof getOpenaiVoice === 'function' ? getOpenaiVoice() : 'alloy';
            const sp = speechRate();
            const speedParam = (!opts.noFish && Math.abs(sp - 1) > 0.01) ? `&fishSpeed=${sp.toFixed(2)}` : '';
            const url = `/api/stau?tts=1&text=${encodeURIComponent(text)}&voice=${encodeURIComponent(voice)}&engine=${opts.noFish ? 'openai' : 'fish'}&fishVoice=${encodeURIComponent(window.getFishVoice())}&openaiVoice=${encodeURIComponent(oaVoice)}${opts.fishOnly ? '&fishOnly=1' : ''}${speedParam}`;
            const res = await apiFetch(url, { signal: controller.signal });
            clearTimeout(timer);
            if (!res.ok) return null;
            const blob = await res.blob();
            if (!blob || blob.size === 0) return null;
            const h = (name) => (res.headers && res.headers.get && res.headers.get(name)) || null;
            const engine = h('x-voice-engine') || 'fish';
            blob.__jvSpeech = true;                                                    // Sprach-Datei (für das Tempo beim Abspielen)
            blob.__jvFish = engine === 'fish' && (sp === 1 || h('x-fish-speed') === 'applied');   // Tempo schon von Fish Audio eingebaut: beim Abspielen nicht noch einmal
            return { blob, engine };
        } catch (e) {
            clearTimeout(timer);
            return null;
        }
    }

    // Warteschlange der Folge-Stücke: parts[i] ist ein Versprechen auf den Ton von Stück i (oder null, wenn übersprungen)
    function startQueue(chunks, voice, firstEngine) {
        const parts = chunks.map(() => { let res; const p = new Promise(r => { res = r; }); return { p, res }; });
        (async () => {
            for (let i = 0; i < chunks.length; i++) {
                let r = null;
                if (firstEngine === 'fish') {
                    r = await requestOne(chunks[i], voice, { timeout: 12000, fishOnly: true });
                    if (!r) r = await requestOne(chunks[i], voice, { timeout: 12000, fishOnly: true });
                }
                if (!r) {                                   // Rest in einem Stück über die Ersatzkette (ohne Fish, falls das erste Stück schon von der Ersatzstimme kam: eine Stimme für den ganzen Text)
                    const remaining = chunks.slice(i).join(' ');
                    const rr = await requestOne(remaining.length > 2300 ? remaining.slice(0, 2300) : remaining, voice, { timeout: 20000, noFish: firstEngine !== 'fish' });
                    parts[i].res(rr ? rr.blob : null);
                    for (let k = i + 1; k < chunks.length; k++) parts[k].res(null);
                    return;
                }
                parts[i].res(r.blob);
            }
        })();
        let idx = 0;
        return { next: async () => { while (idx < parts.length) { const b = await parts[idx++].p; if (b) return b; } return null; } };
    }

    // Abspielen: voice.js spielt das erste Stück ab; endet es, kommt das nächste. voice.js bekommt erst Bescheid, wenn alle Stücke gespielt sind.
    const queues = {};
    const speechUrls = {};   // blob-Adressen von Sprach-Dateien: Tempo schon von Fish eingebaut (true) oder beim Abspielen einstellen (false)
    try {
        const origCreate = URL.createObjectURL.bind(URL);
        URL.createObjectURL = function (obj) {
            const u = origCreate(obj);
            try { if (obj && obj.__jvQ) queues[u] = obj.__jvQ; } catch (e) {}
            try { if (obj && obj.__jvSpeech) speechUrls[u] = { fishSpeed: !!obj.__jvFish }; } catch (e) {}
            return u;
        };
        const proto = window.HTMLMediaElement && window.HTMLMediaElement.prototype;
        if (proto && !proto._jvChainPatched) {
            const prevPlay = proto.play;
            proto.play = function () {
                try {
                    // Sprechtempo sicherstellen (unabhängig davon, wie voice.js das Audio-Element anlegt)
                    const sInfo = speechUrls[this.src];
                    if (sInfo) {
                        const r = sInfo.fishSpeed ? 1 : speechRate();
                        this.defaultPlaybackRate = r;
                        this.playbackRate = r;
                        try { this.preservesPitch = true; this.webkitPreservesPitch = true; } catch (e) {}
                    }
                    const q = queues[this.src];
                    if (q && !this.__jvChained) { this.__jvChained = true; delete queues[this.src]; chainPlayback(this, q); }
                } catch (e) {}
                return prevPlay.apply(this, arguments);
            };
            proto._jvChainPatched = true;
        }
    } catch (e) {}

    function chainPlayback(el, q) {
        const origEnded = el.onended;
        const urls = [];
        let rate = el.playbackRate;                         // aktuelles Abspiel-Tempo; je nach Stück neu bestimmt (Fish hat das Tempo schon eingebaut)
        const keepPitch = el.preservesPitch;
        el.onended = async function (ev) {
            try {
                const blob = await q.next();
                if (blob) {
                    const u = URL.createObjectURL(blob);
                    urls.push(u);
                    rate = blob.__jvFish ? 1 : speechRate();
                    // Wichtig: Ein neues src setzt das Tempo im Browser auf Normal zurück. Darum Tempo ausdrücklich beibehalten, sonst spricht Jarvis ab dem zweiten Stück schneller/langsamer als eingestellt.
                    try { el.defaultPlaybackRate = rate; } catch (e) {}
                    el.src = u;
                    try { el.playbackRate = rate; if (keepPitch !== undefined) el.preservesPitch = keepPitch; } catch (e) {}
                    await el.play();
                    try { if (el.playbackRate !== rate) el.playbackRate = rate; } catch (e) {}
                    return;
                }
            } catch (e) { /* bei einem Problem: so tun, als wäre alles gespielt */ }
            urls.forEach(u => { try { URL.revokeObjectURL(u); } catch (e) {} });
            if (typeof origEnded === 'function') origEnded.call(el, ev);
        };
    }

    // Zwischenansagen ("Einen Moment"): voice.js ruft dafür speakAck() auf. Sie sollen NIE mit einer anderen Stimme kommen als die Antwort. Darum: nur Fish Audio,
    // mit viel Zeit; hakt Fish Audio, bleibt die Zwischenansage lieber stumm (ein kurzes Stück Stille), statt dass eine Ersatzstimme "Einen Moment" sagt.
    if (typeof window.speakAck === 'function' && !window.speakAck._jv) {
        const originalAck = window.speakAck;
        const wrappedAck = function () {
            window.__jvAck = true;
            try { return originalAck.apply(this, arguments); } finally { window.__jvAck = false; }
        };
        wrappedAck._jv = true;
        window.speakAck = wrappedAck;
    }
    function silentBlob() {   // 60 ms Stille als WAV (spielt überall ab)
        const n = 480, buf = new ArrayBuffer(44 + n * 2), v = new DataView(buf);
        const w = (o, str) => { for (let i = 0; i < str.length; i++) v.setUint8(o + i, str.charCodeAt(i)); };
        w(0, 'RIFF'); v.setUint32(4, 36 + n * 2, true); w(8, 'WAVE'); w(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
        v.setUint32(24, 8000, true); v.setUint32(28, 16000, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true); w(36, 'data'); v.setUint32(40, n * 2, true);
        return new Blob([buf], { type: 'audio/wav' });
    }

    const originalFetch = window.fetchCloudSpeechBlob;
    window.fetchCloudSpeechBlob = async function (text, voice) {
        const isAck = window.__jvAck === true;   // wird synchron gelesen, bevor irgendetwas wartet
        if (window.getTtsEngine() !== 'fish') {
            const other = await originalFetch.call(this, normalizeSpoken(strip(text)), voice);
            try { if (other && typeof other === 'object') other.__jvSpeech = true; } catch (e) {}
            return other;
        }
        if (typeof AbortController === 'undefined') return null;
        const started = Date.now();
        const full = humanize(spellAbbreviations(numbersToWords(normalizeSpoken(text))));
        const chunks = splitForFish(full);

        if (isAck) {
            const a = await requestOne(chunks[0], voice, { timeout: 20000, fishOnly: true });
            return a ? a.blob : silentBlob();
        }

        // Erstes (oder einziges) Stück: normale Kette. Fish Audio bekommt viel Zeit (Server 15 s), erst dann springt die Ersatzstimme ein.
        const r = await requestOne(chunks[0], voice, { timeout: 30000 });
        if (!r) return null;
        setLastVoice(r.engine, Date.now() - started, full.length, chunks.length);
        if (chunks.length > 1) {
            // Kam das erste Stück nicht von Fish Audio, wird der Rest einheitlich über dieselbe Ersatzkette geholt
            const restChunks = r.engine === 'fish' ? chunks.slice(1) : [chunks.slice(1).join(' ')];
            try { r.blob.__jvQ = startQueue(restChunks, voice, r.engine); } catch (e) {}
        }
        return r.blob;
    };

    // Test: fragt den Server, ob Fish Audio antwortet, und spielt dann einen Satz
    window.runFishDiagnosis = async function () {
        const out = document.getElementById('fishDiagOutput');
        const show = (t) => { if (out) { out.textContent = t; out.classList.remove('hidden'); } };
        show('Prüfe Fish Audio ...');
        try {
            const url = `/api/stau?tts=1&engine=fish&diag=1&text=${encodeURIComponent('Test')}&fishVoice=${encodeURIComponent(window.getFishVoice())}`;
            const res = await apiFetch(url);
            const d = await res.json();
            if (d && d.ok && d.engineUsed === 'fish') {
                const noId = /keine Stimmen-ID/.test(String(d.voice || ''));
                show(`✅ Fish Audio antwortet (Modell ${d.model}, Stimme ${d.voice}).` + (noId ? '\n⚠️ Ohne feste Stimmen-ID kann die Stimme von Satz zu Satz wechseln. Trage oben eine ID von fish.audio ein.' : ''));
                if (typeof testVoice === 'function') testVoice();
            } else {
                show('❌ ' + ((d && d.error) || ('Antwort: ' + JSON.stringify(d))) + '\nJarvis spricht in dem Fall mit der nächsten Stimme (OpenAI oder Edge).');
            }
        } catch (e) {
            show('❌ Server nicht erreichbar: ' + String((e && e.message) || e));
        }
    };

    // Test: ein Satz mit sicherem Seufzer und Lachen (ohne Zufall)
    window.testChuckle = function () {
        window.__jvForceHuman = true;
        speak('Auf Ihrer Strecke gibt es einen Stau, mit etwa zwanzig Minuten Verzögerung. ' + MARK + 'Da würde ich nicht hinfahren.');
    };

    // Sprachbefehle: "Menschliche Laute aus / dezent / an", "Kichern aus", "Lach nicht mehr", "Du darfst wieder lachen"
    window.handleKichernCommand = function (text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 45) return false;
        const say = (m) => speak(m, typeof continueConversation === 'function' ? continueConversation : undefined);
        const word = '(?:kichern|lachen|seufzen|menschliche laute|laute)';
        if (new RegExp('^(?:jarvis )?' + word + ' (?:aus|ausschalten)$').test(t) || /^(?:jarvis )?(?:kicher|lach|seufz)\w*\s+(?:bitte\s+)?(?:nicht|nie|kein)(?:\s+mehr)?$/.test(t) || /^hör auf zu (?:kichern|lachen|seufzen)$/.test(t)) {
            window.setHumanLevel('aus'); syncUi(); say('In Ordnung, ich verzichte auf Lachen und Seufzen.'); return true;
        }
        if (new RegExp('^' + word + ' dezent$').test(t) || /^(?:etwas |bisschen |ein bisschen )?(?:weniger|seltener) (?:kichern|lachen|seufzen)$/.test(t)) {
            window.setHumanLevel('dezent'); syncUi(); say('Gut, ich halte mich zurück.'); return true;
        }
        if (new RegExp('^' + word + ' (?:an|ein|einschalten)$').test(t) || /^du darfst (?:wieder )?(?:kichern|lachen|seufzen)$/.test(t) || /^(?:kicher|lach|seufz)\s+(?:wieder|ruhig)$/.test(t)) {
            window.setHumanLevel('mittel'); syncUi(); say('Gern, ich bin wieder ein bisschen menschlicher.'); return true;
        }
        return false;
    };

    function syncUi() { try { const lvl = document.getElementById('humanLevelSelect'); if (lvl) lvl.value = window.getHumanLevel(); } catch (e) {} }

    // Einstellungen: Auswahl, Stimmen-ID
    function bindUi() {
        try {
            const sel = document.getElementById('ttsEngineSelect');
            const row = document.getElementById('fishVoiceRow');
            const input = document.getElementById('fishVoiceInput');
            const edgeRow = document.getElementById('edgeVoiceRow'), openaiRow = document.getElementById('openaiVoiceRow');
            const sync = () => {
                if (!sel) return;
                if (row) row.classList.toggle('hidden', sel.value !== 'fish');
                if (edgeRow) edgeRow.classList.toggle('hidden', sel.value !== 'edge' && sel.value !== 'fish');       // bei Fish: Rückfall-Stimmen
                if (openaiRow) openaiRow.classList.toggle('hidden', sel.value !== 'openai' && sel.value !== 'fish');
            };
            if (sel) {
                sel.value = window.getTtsEngine();
                sel.addEventListener('change', sync);
                sync();
            }
            const lvl = document.getElementById('humanLevelSelect');
            if (lvl) { lvl.value = window.getHumanLevel(); lvl.addEventListener('change', () => window.setHumanLevel(lvl.value)); }
            if (input) {
                input.value = window.getFishVoice();
                input.addEventListener('change', () => { window.setFishVoice(input.value); input.value = window.getFishVoice(); });
            }
        } catch (e) {}
    }
    bindUi();
})();
