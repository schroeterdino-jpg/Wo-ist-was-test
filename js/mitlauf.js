/* ============================================================
   MITLAUFEN (Stufe 1 vom Umbau "Chef-KI zuerst"): Jarvis fragt im Hintergrund die Chef-KI, was SIE mit einem Satz tun würde, und schreibt den Vergleich auf.
   (Anders als der Schattenbetrieb in schatten.js, der nur mit festen Mustern vergleicht: hier plant die echte Chef-KI mit.)
   - Ändert NICHTS am Verhalten: weder Antwort noch Ablauf. Die Chef-KI führt nichts aus (nur planen, kein Sprechen, keine Aktion).
   - Standard AUS. Schalter: "Mitlaufen an" / "Mitlaufen aus" (Merker jv_mitlauf). Läuft nicht, wenn die Chef-KI selbst an ist.
   - Kostenbremse: erst 3 s nach dem eigentlichen Ablauf, höchstens eine Beobachtung gleichzeitig, mindestens 6 s Abstand, höchstens 60 am Tag, nur Sätze mit 3 bis 30 Wörtern.
   - Aufgeschrieben wird (jv_mitlauf_log, höchstens 80, neueste zuletzt): Satz, Weg des alten Ablaufs (lokal = fester Befehl, ki = normale KI), Fähigkeiten, die die Chef-KI gewählt hätte, "kann nicht", Rückfrage.
   - Sprache: "Mitlauf-Bericht" liest die Auswertung vor und bietet "Alles kopieren" an; "Mitlauf-Bericht leeren" löscht das Protokoll.
   Haken: voice.js ruft jvMitlauf.beobachte(text, 'lokal'|'ki') NACH der Entscheidung (abgesichert, kann nie stören).
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_mitlauf', LOG = 'jv_mitlauf_log', TAG = 'jv_mitlauf_tag', MAX = 80, MAX_TAG = 60, ABSTAND = 6000;
    let VERZOEGERUNG = 3000;
    function pd(k, d) { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) || d); } catch (e) { return d; } }
    function sd(k, v) { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) { } }
    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function istAn() { return pd(KEY, '') === '1'; }
    function schalten(an) { sd(KEY, an ? '1' : ''); sagen(an ? 'Okay, ich schaue ab jetzt im Hintergrund mit, was die Chef-KI tun würde. An deinen Antworten ändert sich nichts.' : 'Okay, das Mitlaufen ist aus.'); }
    function laden() { try { const a = JSON.parse(pd(LOG, '') || '[]'); return Array.isArray(a) ? a.filter(x => x && x.s) : []; } catch (e) { return []; } }
    function speichern(l) { sd(LOG, l.length ? JSON.stringify(l.slice(-MAX)) : ''); }

    let laeuft = false, letzte = 0;
    function tagOk() {   // höchstens MAX_TAG Beobachtungen pro Tag
        try {
            const p = String(pd(TAG, '') || '').split('|'), n = p[0] === heute() ? (parseInt(p[1], 10) || 0) : 0;
            if (n >= MAX_TAG) return false;
            sd(TAG, heute() + '|' + (n + 1)); return true;
        } catch (e) { return false; }
    }
    function sende(nachrichten) {
        const f = typeof apiFetch === 'function' ? apiFetch : (typeof window.apiFetch === 'function' ? window.apiFetch : null);
        if (!f) return Promise.reject(new Error('Keine KI-Anbindung'));
        return f('/api/groq', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', response_format: { type: 'json_object' }, messages: nachrichten })
        }).then(r => r.json()).then(d => {
            const c = d && d.choices && d.choices[0] && d.choices[0].message && d.choices[0].message.content;
            if (typeof c !== 'string' || !c.trim()) throw new Error('Leere KI-Antwort');
            return c;
        });
    }
    function beobachte(text, weg) {
        try {
            if (!istAn() || typeof text !== 'string') return false;
            const t = text.trim(), w = t ? t.split(/\s+/).length : 0;
            if (w < 3 || w > 30 || t.length > 240) return false;
            const chef = window.jvChef;
            if (!chef || typeof chef.plane !== 'function' || typeof chef.kiEntscheider !== 'function' || (typeof chef.istAn === 'function' && chef.istAn())) return false;
            if (laeuft || Date.now() - letzte < ABSTAND || (typeof navigator !== 'undefined' && navigator.onLine === false)) return false;
            if (!tagOk()) return false;
            laeuft = true; letzte = Date.now();
            setTimeout(function () {
                Promise.resolve().then(() => chef.plane(t, { entscheider: chef.kiEntscheider(sende) })).then(function (pr) {
                    const e = { s: t.slice(0, 160), w: weg === 'lokal' ? 'lokal' : 'ki', am: heute(), ok: !!(pr && pr.ok), f: [], k: false, q: false };
                    if (pr && pr.ok && pr.plan) {
                        e.f = (pr.plan.schritte || []).map(x => x.faehigkeit).slice(0, 3);
                        e.k = !!pr.plan.kannNicht; e.q = !!pr.plan.frage;
                    }
                    const l = laden(); l.push(e); speichern(l);
                }).catch(function () { }).then(function () { laeuft = false; });
            }, VERZOEGERUNG);
            return true;
        } catch (e) { laeuft = false; return false; }
    }

    function auswertung(l) {
        const a = { gesamt: l.length, kiMitFaehigkeit: 0, lokalMitFaehigkeit: 0, kannNicht: 0, ungueltig: 0 };
        l.forEach(x => { if (!x.ok) a.ungueltig++; else if (x.k) a.kannNicht++; else if (x.f && x.f.length) { if (x.w === 'ki') a.kiMitFaehigkeit++; else a.lokalMitFaehigkeit++; } });
        return a;
    }
    function kopierText() {
        const l = laden();
        return 'Mitlauf-Protokoll Chef-KI (Stand ' + heute() + '):\n' + l.map((x, i) => (i + 1) + '. „' + x.s + '“ – alter Weg: ' + x.w + '; Chef-KI: ' + (!x.ok ? 'Plan ungültig' : x.k ? 'kann nicht' : x.f.length ? x.f.join(' + ') : x.q ? 'Rückfrage' : 'nichts') + ' (' + x.am + ')').join('\n');
    }
    window.jvMitlaufKopieren = function () {
        const t = kopierText();
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t); sagen('Das Protokoll ist kopiert. Du kannst es jetzt an Claude weitergeben.'); return; } } catch (e) { }
        sagen('Das Kopieren hat nicht geklappt.');
    };
    function bericht() {
        const l = laden();
        if (!l.length) { sagen(istAn() ? 'Ich habe noch nichts beobachtet. Sprich einfach normal mit mir, ich schaue im Hintergrund mit.' : 'Das Mitlaufen ist aus. Sag „Mitlaufen an“, dann schaue ich im Hintergrund mit.'); return; }
        const a = auswertung(l);
        sagen('Ich habe ' + a.gesamt + ' Sätze beobachtet. Bei ' + a.kiMitFaehigkeit + ' hätte die Chef-KI gezielt eine Fähigkeit benutzt, wo ich sonst nur geraten habe. Bei ' + a.kannNicht + ' hätte auch sie gesagt, dass es noch nicht geht.');
        try {
            if (typeof showActionCards === 'function') showActionCards([
                { icon: '🔎', title: a.gesamt + ' Sätze beobachtet', subtitle: a.kiMitFaehigkeit + ' besser mit Chef-KI · ' + a.kannNicht + ' geht noch nicht · ' + a.ungueltig + ' ungültig' },
                { icon: '📋', title: 'Alles kopieren', subtitle: 'für Claude zum Auswerten', onclick: 'jvMitlaufKopieren()' }]);
        } catch (e) { }
    }
    function leeren() { const n = laden().length; speichern([]); sagen(n ? 'Okay, das Mitlauf-Protokoll ist geleert.' : 'Das Protokoll war schon leer.'); }

    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/-/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 80 || !/mitlauf/.test(t)) return false;
        if (/mitlauf\s*(?:bericht|protokoll)?\s+(?:l[oö]schen|leeren)|(?:l[oö]sch|leer)\w*\s+(?:den\s+|das\s+|dein\w*\s+)?mitlauf/.test(t)) { leeren(); return true; }
        if (/\bmitlaufen?\s+(?:an|ein|einschalten|starten)\b|(?:schalte?|mach)\s+(?:das\s+)?mitlaufen\s+(?:an|ein)\b/.test(t)) { schalten(true); return true; }
        if (/\bmitlaufen?\s+(?:aus|ausschalten|beenden|stoppen)\b|(?:schalte?|mach)\s+(?:das\s+)?mitlaufen\s+aus\b/.test(t)) { schalten(false); return true; }
        if (/mitlauf\s*(?:bericht|protokoll)/.test(t)) { bericht(); return true; }
        return false;
    }
    window.jvMitlauf = { beobachte, handle, istAn, laden, auswertung, kopierText, _zeiten: function (v, a) { VERZOEGERUNG = v; } };
    if (window.jvCommands) {
        window.jvCommands.use('mitlauf', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Mitlaufen', e); }
            return next(text);
        }, 161);
    }
})();
