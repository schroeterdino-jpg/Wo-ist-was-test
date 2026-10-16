/* ============================================================
   KOPF WECHSELN: zwei Köpfe für Nova (Jung = der bisherige, Reif = dunkle Haut, graue Haare) und dazu je eine eigene Fish-Stimme.
   - Einstellungen > Stimme & Gespräch > "Kopf von Nova": Auswahl, Haken "Stimme wechselt mit dem Kopf", zwei Felder für die Stimmen-IDs.
   - Per Sprache: "Reifer Kopf", "Junger Kopf", "Kopf wechseln".
   - Beim Wechseln lädt avatar3d.js den passenden Kopf (window.jvAvatar3D.setHead). Fehlt die Datei models/mann.glb, bleibt der junge Kopf.
   - Die Stimme wird über die vorhandene Fish-Einstellung gesetzt (setFishVoice). Leere ID = Standardstimme vom Server.
   Muss nach avatar3d.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    function store(key, def) {
        try { return typeof getPersistentData === 'function' ? String(getPersistentData(key, def)) : (localStorage.getItem(key) || def); } catch (e) { return def; }
    }
    function put(key, val) {
        try { if (typeof setPersistentData === 'function') setPersistentData(key, val); else localStorage.setItem(key, val); } catch (e) { }
    }
    function clean(v) { return String(v || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64); }
    function kopf() { try { return localStorage.getItem('nova_kopf') === 'reif' ? 'reif' : 'jung'; } catch (e) { return 'jung'; } }
    function slot(art) { return clean(store('nova_stimme_' + art, '')); }
    function setSlot(art, id) { put('nova_stimme_' + art, clean(id)); }
    function mitStimme() { return store('nova_kopf_stimme', '1') !== '0'; }
    function sagen(t) { try { if (typeof speak === 'function') speak(t); } catch (e) { } }

    // Einmalig: die Stimme, die gerade eingestellt ist, gehört zum reifen Kopf (so war es bei der Einrichtung gedacht)
    try {
        if (localStorage.getItem('nova_kopf_init') !== '1') {
            localStorage.setItem('nova_kopf_init', '1');
            const cur = typeof window.getFishVoice === 'function' ? clean(window.getFishVoice()) : '';
            if (cur && !slot('reif')) setSlot('reif', cur);
        }
    } catch (e) { }

    let sperre = false;
    function stimmeAnwenden(art) {
        if (!mitStimme() || typeof window.setFishVoice !== 'function') return;
        sperre = true;
        try {
            window.setFishVoice(slot(art));
            const inp = document.getElementById('fishVoiceInput');
            if (inp && typeof window.getFishVoice === 'function') inp.value = window.getFishVoice();
        } catch (e) { }
        sperre = false;
    }

    function anwenden(art, still) {
        art = art === 'reif' ? 'reif' : 'jung';
        const war = kopf();
        try { if (window.jvAvatar3D && typeof window.jvAvatar3D.setHead === 'function') window.jvAvatar3D.setHead(art); else localStorage.setItem('nova_kopf', art); } catch (e) { }
        stimmeAnwenden(art);
        uiSync();
        if (!still && war !== art) sagen(art === 'reif' ? 'So, jetzt bin ich der Reife.' : 'So, wieder der Junge.');
    }

    function uiSync() {
        try {
            const sel = document.getElementById('kopfSelect'); if (sel) sel.value = kopf();
            const cb = document.getElementById('kopfStimmeMit'); if (cb) cb.checked = mitStimme();
            const j = document.getElementById('kopfVoiceJung'); if (j && document.activeElement !== j) j.value = slot('jung');
            const r = document.getElementById('kopfVoiceReif'); if (r && document.activeElement !== r) r.value = slot('reif');
        } catch (e) { }
    }

    function bind() {
        try {
            const sel = document.getElementById('kopfSelect');
            if (sel) sel.addEventListener('change', () => anwenden(sel.value, true));
            const cb = document.getElementById('kopfStimmeMit');
            if (cb) cb.addEventListener('change', () => { put('nova_kopf_stimme', cb.checked ? '1' : '0'); if (cb.checked) stimmeAnwenden(kopf()); });
            [['kopfVoiceJung', 'jung'], ['kopfVoiceReif', 'reif']].forEach(([id, art]) => {
                const el = document.getElementById(id); if (!el) return;
                el.addEventListener('change', () => {
                    setSlot(art, el.value); el.value = slot(art);
                    if (kopf() === art) stimmeAnwenden(art);
                });
            });
            // Wer die Fish-Stimme im Feld darunter ändert, ändert damit die Stimme des gerade gezeigten Kopfes
            const fi = document.getElementById('fishVoiceInput');
            if (fi) fi.addEventListener('change', () => {
                if (sperre || !mitStimme()) return;
                setSlot(kopf(), typeof window.getFishVoice === 'function' ? window.getFishVoice() : fi.value);
                uiSync();
            });
            uiSync();
        } catch (e) { }
    }
    bind();

    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function befehl(text, next) {
        const t = norm(text);
        if (!t || t.length > 60) return next(text);
        if (/\b(mein|meine|meinen|meinem|tut|weh|schmerz\w*|kopfschmerz\w*|kopfweh|kopfsalat|kopfhoerer|kopfkissen)\b/.test(t)) return next(text);
        if (/\b(reif\w*|alt\w*|aelter\w*|dunkl\w*)\b/.test(t) && /\b(kopf|gesicht|avatar)\b/.test(t)) { anwenden('reif'); return true; }
        if (/\b(jung\w*|juenger\w*)\b/.test(t) && /\b(kopf|gesicht|avatar)\b/.test(t)) { anwenden('jung'); return true; }
        if (/\b(kopf|gesicht|avatar)\b/.test(t) && /\b(wechsel\w*|tausch\w*|anderer|anderen|zweite\w*)\b/.test(t)) { anwenden(kopf() === 'reif' ? 'jung' : 'reif'); return true; }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('kopf', befehl, 96);

    window.jvKopf = { get: kopf, set: anwenden };
})();
