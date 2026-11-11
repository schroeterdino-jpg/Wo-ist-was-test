/* ============================================================
   LÜCKENBUCH: Jarvis merkt selbst, wenn er etwas nicht weiß oder nicht kann, und schreibt es für den Ausbau auf.
   - Spricht Jarvis einen Satz wie "Das weiß ich nicht" oder "Das kann ich nicht", wird die Frage des Nutzers samt Antwort gemerkt
     und Jarvis hängt an: "Das habe ich mir für den Ausbau aufgeschrieben." (kontext_lokal.js ruft jvLuecken.pruefe in der Sprech-Kette auf)
   - Technische Aussetzer ("gerade nicht", keine Verbindung) und lange Antworten zählen nicht; dieselbe Frage wird nur einmal aufgeschrieben.
   - Sprache: "Was kannst du noch nicht?" / "Was fehlt dir noch?" / "Lückenbuch" -> liest die Liste vor, zeigt sie als Karten und bietet "Alles kopieren" an
              (die Kopie gibt der Nutzer an Claude weiter); "Lückenbuch leeren" löscht die Liste.
   - Speicher: Schlüssel jv_luecken (Liste, höchstens 40 Einträge, neueste zuletzt). Ändert sonst nichts.
   Braucht: commands.js (jvCommands), optional speak(), showActionCards(). Muss vor kontext_lokal.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_luecken', MAX = 40;
    const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
    function pd(k, d) { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) || d); } catch (e) { return d; } }
    function sd(k, v) { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) { } }
    function laden() { try { const a = JSON.parse(pd(KEY, '') || '[]'); return Array.isArray(a) ? a.filter(x => x && x.f) : []; } catch (e) { return []; } }
    function speichern(l) { sd(KEY, l.length ? JSON.stringify(l.slice(-MAX)) : ''); }
    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }

    /* Sätze, mit denen Jarvis sagt, dass er etwas nicht weiß oder nicht kann */
    const LUECKE = [
        /\b(?:das|dazu|davon|darüber|darueber|so etwas|sowas)\s+(?:weiß|weiss|kann|konnte|wusste)\s+ich\s+(?:leider\s+|noch\s+|auch\s+)*nicht\b/i,
        /\bweiß ich (?:leider |im Moment |gerade )*nicht\b|\bweiss ich (?:leider )?nicht\b/i,
        /\bkann ich (?:dir |Ihnen )?(?:dabei |dazu )?(?:leider |noch )*nicht (?:helfen|sagen|beantworten|tun|machen|erledigen)\b/i,
        /\b(?:habe|hab) ich (?:leider )?(?:keinen|keine|kein) (?:Zugriff|Zugang|Informationen?|Daten|Möglichkeit|Funktion)\b/i,
        /\b(?:ist|wäre|waere) (?:mir |bei mir )?(?:leider )?nicht möglich\b/i,
        /\b(?:das|so etwas|sowas) (?:kann|konnte) ich (?:leider |noch )+nicht\b/i,
        /\b(?:leider )?kann ich (?:dir |Ihnen |dazu |dabei |das )?(?:leider |noch |derzeit |aktuell )*(?:keine|keinen|keinem|kein|nicht)\b/i,
        /\b(?:leider )?ich kann (?:dir |Ihnen |dazu |dabei )?(?:leider |noch |derzeit |aktuell )*(?:keine|keinen|keinem|kein|nicht)\b/i,
        /\b(?:ich )?(?:habe|hab) (?:ich )?(?:leider |derzeit |aktuell |dazu |darauf |dafür |hierfür )*(?:keinen|keine|kein) (?:\w+ )?(?:Zugriff|Zugang|Informationen?|Daten|Möglichkeit|Funktion|Kenntnis)\b/i,
        /\bnicht in der Lage\b|\bhabe ich (?:leider )?(?:keine|nicht die) Möglichkeit\b/i
    ];
    /* technische Aussetzer sind keine Lücke im Können */
    const AUSSETZER = /\bgerade nicht\b|\bVerbindung\b|\bans Internet\b|\bkein Netz\b|\bnoch einmal\b|\bspäter\b|\bversuch es\b|\bnicht eindeutig verstanden\b/i;

    function luecke(antwort) {
        const a = String(antwort || '').trim();
        /* Nur der Anfang zählt: sagt Jarvis gleich zu Beginn "kann ich nicht", ist es eine Lücke, auch wenn danach noch eine Alternative folgt. */
        const kopf = a.slice(0, 140);
        if (!a || AUSSETZER.test(kopf)) return false;
        return LUECKE.some(rx => rx.test(kopf));
    }
    const EIGENE = /l[üu]ckenbuch|l[üu]ckenliste|was kannst du noch nicht|was fehlt dir/i;

    /* Aufruf aus der Sprech-Kette: Frage des Nutzers + erste Antwort. Gibt den Zusatz für die Sprache zurück ('' wenn nichts aufgeschrieben wurde). */
    function pruefe(frage, antwort) {
        try {
            const f = String(frage || '').trim();
            if (!f || f.length < 4 || EIGENE.test(f) || !luecke(antwort)) return '';
            const l = laden(), k = norm(f);
            if (l.some(x => norm(x.f) === k)) return ' Das hatte ich mir schon aufgeschrieben.';
            l.push({ f: f.slice(0, 200), a: String(antwort).trim().slice(0, 240), am: heute() });
            speichern(l);
            return ' Das habe ich mir für den Ausbau aufgeschrieben.';
        } catch (e) { return ''; }
    }

    function kopierText() {
        const l = laden();
        return 'Jarvis kann das noch nicht (Lückenbuch, Stand ' + heute() + '):\n' + l.map((x, i) => (i + 1) + '. ' + x.f + '  →  Jarvis sagte: ' + x.a + ' (' + x.am + ')').join('\n');
    }
    window.jvLueckenKopieren = function () {
        const t = kopierText();
        try { if (navigator.clipboard && navigator.clipboard.writeText) { navigator.clipboard.writeText(t); sagen('Die Liste ist kopiert. Du kannst sie jetzt an Claude weitergeben.'); return; } } catch (e) { }
        sagen('Das Kopieren hat nicht geklappt. Du findest die Liste im Verlauf.');
    };
    function zeigen() {
        const l = laden();
        if (!l.length) { sagen('Ich habe mir noch nichts aufgeschrieben. Sobald ich etwas nicht weiß oder nicht kann, merke ich es mir.'); return; }
        const neu = l.slice(-5).reverse();
        sagen('Ich habe mir ' + (l.length === 1 ? 'eine Sache' : l.length + ' Dinge') + ' für den Ausbau aufgeschrieben. Zuletzt: ' + neu.slice(0, 3).map(x => '„' + x.f.replace(/[?.!]+$/, '') + '“').join('; ') + '.');
        try {
            if (typeof showActionCards === 'function') {
                const karten = neu.map(x => ({ icon: '📝', title: x.f.slice(0, 80), subtitle: 'am ' + x.am }));
                karten.push({ icon: '📋', title: 'Alles kopieren', subtitle: 'für Claude zum Einbauen', onclick: 'jvLueckenKopieren()' });
                showActionCards(karten);
            }
        } catch (e) { }
    }
    function leeren() {
        const n = laden().length; speichern([]);
        sagen(n ? 'Okay, das Lückenbuch ist geleert.' : 'Das Lückenbuch war schon leer.');
    }

    const LIST = [/\bwas\s+(?:kannst|kann)\s+(?:du|jarvis|zane)\s+(?:denn\s+)?(?:noch|bis jetzt|bisher)\s+nicht\b/, /^(?:und\s+)?was\s+fehlt\s+(?:dir|jarvis)(?:\s+(?:denn\s+)?noch)?$/, /\bwas\s+hast\s+du\s+(?:dir\s+)?(?:alles\s+)?aufgeschrieben\b/, /^(?:zeig(?:e)?\s+(?:mir\s+)?)?(?:das\s+|dein\s+|die\s+)?l[uü]ckenbuch$|^(?:zeig(?:e)?\s+(?:mir\s+)?)?(?:die\s+|deine\s+)?l[uü]ckenliste$/];
    const CLEAR = [/(?:l[uü]ckenbuch|l[uü]ckenliste)\s+(?:l[oö]schen|leeren|zur[uü]cksetzen)/, /(?:l[oö]sch|leer)\w*\s+(?:das\s+|die\s+|dein\w*\s+)?(?:l[uü]ckenbuch|l[uü]ckenliste)/];
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 80) return false;
        const n = t.replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue');
        if (CLEAR.some(r => r.test(t) || r.test(n))) { leeren(); return true; }
        if (LIST.some(r => r.test(t) || r.test(n))) { zeigen(); return true; }
        return false;
    }
    window.jvLuecken = { pruefe, laden, luecke, kopierText, handle };
    if (window.jvCommands) {
        window.jvCommands.use('luecken', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Lückenbuch', e); }
            return next(text);
        }, 160);
    }
})();
