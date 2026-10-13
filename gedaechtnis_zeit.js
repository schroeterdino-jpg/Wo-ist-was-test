/* ============================================================
   GEDÄCHTNIS-ZEITEN: Wann wurde ein Gegenstand im (lokalen) Gedächtnis abgelegt?
   "Ich lege meinen Schlüssel unter das Kopfkissen" -> Gedächtnis: schlüssel = unter dem Kopfkissen. Zusätzlich merkt sich diese Datei Datum und Uhrzeit
   in einer EIGENEN kleinen Liste (helfer_memory_zeit). Der Eintrag selbst und das Langzeitgedächtnis (Vektor) bleiben völlig unberührt.
   Fragen wie "Wann habe ich den Schlüssel abgelegt?" oder "Seit wann liegt der Schlüssel da?" beantwortet die App selbst aus dieser Liste, ohne die KI.
   Einträge von früher haben kein Datum ("Dazu habe ich kein Datum gespeichert"); neue bekommen es automatisch, auch wenn derselbe Platz noch einmal gesagt wird.
   Braucht: storage.js (getPersistentData/setPersistentData), lists.js (memoryItems, parseMemoryValue, searchMemory), voice.js (speak). Muss nach lists.js und
   localcommands.js geladen werden (am besten ganz am Ende der Skripte).
   ============================================================ */
(function () {
    const ZEIT_KEY = 'helfer_memory_zeit';
    const FLAG = '__jvZeitProxy';
    const orig = (typeof setPersistentData === 'function') ? setPersistentData : null;
    if (!orig || typeof getPersistentData !== 'function') return;

    function load() { try { const o = JSON.parse(getPersistentData(ZEIT_KEY, '{}')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    function save(o) { try { orig(ZEIT_KEY, JSON.stringify(o)); } catch (e) {} }
    function stamp(key) { if (typeof key !== 'string') return; const o = load(); o[key] = new Date().toISOString(); save(o); }
    function unstamp(key) { if (typeof key !== 'string') return; const o = load(); if (key in o) { delete o[key]; save(o); } }

    /* 1) Jede Zuweisung memoryItems[x] = ... (auch mit gleichem Platz) trägt die Zeit ein; Löschen entfernt sie */
    function ensureProxy() {
        try {
            if (typeof memoryItems !== 'object' || !memoryItems || memoryItems[FLAG]) return;
            memoryItems = new Proxy(memoryItems, {
                get(t, k, r) { return k === FLAG ? true : Reflect.get(t, k, r); },
                set(t, k, v, r) { const ok = Reflect.set(t, k, v, r); stamp(k); return ok; },
                deleteProperty(t, k) { const ok = Reflect.deleteProperty(t, k); unstamp(k); return ok; }
            });
        } catch (e) { /* z.B. wenn memoryItems nicht ersetzt werden kann: dann greift nur Weg 2 */ }
    }

    /* 2) Rückfall: beim Speichern des Gedächtnisses neue oder geänderte Einträge vergleichen (falls der Proxy mal ersetzt wurde, z.B. nach "Gedächtnis leeren") */
    let snap = {};
    function readMem() { try { const o = JSON.parse(getPersistentData('helfer_memory', '{}')); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
    snap = readMem();
    window.setPersistentData = function (key, value) {
        const res = orig.apply(this, arguments);
        if (key === 'helfer_memory') {
            try {
                const now = (typeof value === 'string') ? JSON.parse(value) : readMem();
                const t = load(); let changed = false;
                const keys = Object.keys(now);
                const diff = keys.filter(k => !(k in snap) || JSON.stringify(snap[k]) !== JSON.stringify(now[k]));
                if (diff.length > 0 && diff.length <= 5) diff.forEach(k => { t[k] = new Date().toISOString(); changed = true; });
                Object.keys(t).forEach(k => { if (!(k in now)) { delete t[k]; changed = true; } });
                if (changed) save(t);
                snap = now;
            } catch (e) {}
            ensureProxy();
        }
        return res;
    };
    ensureProxy();
    try { setInterval(ensureProxy, 3000); } catch (e) {}

    /* ---------- Antworten auf Zeitfragen ---------- */
    const norm = s => String(s || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim();
    const ART = '(?:(?:den|die|das|dem|der|meinen|meine|meinem|meiner|mein|dort|da)\\s+)?';
    const RES = [
        new RegExp('^(?:wann|um wie viel uhr|an welchem tag|an welchem datum)\\s+(?:habe|hab|hatte)\\s+ich\\s+' + ART + '(.+?)\\s+(?:dort\\s+|da\\s+|dahin\\s+|hin\\s*)?(?:abgelegt|hingelegt|hingepackt|gepackt|gelegt|hingestellt|weggelegt|versteckt|verstaut|gespeichert|abgestellt|hingehängt|aufgehängt)$'),
        new RegExp('^(?:seit wann)\\s+(?:liegt|liegen|ist|sind|steht|stehen|hängt|hängen|befindet sich|befinden sich)\\s+' + ART + '(.+?)(?:\\s+(?:schon\\s+)?(?:dort|da|dort drin|da drin|dort drauf|da drauf))?$'),
        new RegExp('^(?:wann|seit wann)\\s+(?:war|wurde|wurden)\\s+' + ART + '(.+?)\\s+(?:dort\\s+|da\\s+)?(?:abgelegt|hingelegt|hingepackt|gespeichert|abgestellt|versteckt)$')
    ];

    function whenText(iso) {
        const d = new Date(iso);
        if (isNaN(d.getTime())) return '';
        const day = x => x.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
        const diff = Math.round((new Date(day(new Date()) + 'T12:00:00') - new Date(day(d) + 'T12:00:00')) / 86400000);
        const clock = (typeof formatSpokenTime === 'function') ? formatSpokenTime(d) : d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' }) + ' Uhr';
        if (diff === 0) return `heute um ${clock}`;
        if (diff === 1) return `gestern um ${clock}`;
        if (diff === 2) return `vorgestern um ${clock}`;
        return `am ${d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long' })} um ${clock}`;
    }
    function cap(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

    function answer(term) {
        let hit = null;
        try { hit = (typeof searchMemory === 'function' ? searchMemory(term) : [])[0] || null; } catch (e) { hit = null; }
        if (!hit || hit.unscharf) return null;   // kein Gegenstand dieses Namens im Gedächtnis: die normale Verarbeitung (KI) übernimmt
        const ts = load()[hit.key];
        const val = (typeof parseMemoryValue === 'function' && memoryItems && hit.key in memoryItems) ? parseMemoryValue(memoryItems[hit.key]) : (hit.value || '');
        if (!ts) return `Dazu habe ich kein Datum gespeichert. ${cap(hit.key)} steht bei mir ${val ? val : 'im Gedächtnis'}, aber nicht, seit wann.`;
        const w = whenText(ts);
        return `${cap(hit.key)}, ${val}: Das habe ich ${w} gespeichert.`;
    }

    function handle(text) {
        const t = norm(text);
        if (!t || t.length > 80) return false;
        for (const rx of RES) {
            const m = t.match(rx);
            if (!m) continue;
            const reply = answer(m[1].trim());
            if (!reply) return false;
            try { speak(reply, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {}
            return true;
        }
        return false;
    }
    window.handleGedaechtnisZeitCommand = handle;

    if (window.jvCommands) {   // Befehlsliste (commands.js)
        window.jvCommands.use('gedaechtnis_zeit', function (text, next) {
            try { if (handle(text)) return true; } catch (e) {}
            return next(text);
        }, 1100);
    }
})();