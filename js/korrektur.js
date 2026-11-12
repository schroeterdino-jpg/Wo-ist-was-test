/* ============================================================
   KORREKTUR: Du verbesserst Jarvis selbst. Sagt er etwas Falsches, sagst du (nach "Stopp" oder direkt danach):
     "Das ist falsch, der Termin ist um 10 Uhr"  /  "Das stimmt nicht, meine Schicht beginnt um 13:45"  /  "Korrektur: Hamburg schreibt man mit ..."
   Jarvis merkt sich die Korrektur samt der Frage und seiner falschen Antwort, bestätigt sie ("Verstanden, ich merke mir: ...")
   und beachtet sie ab dann bei JEDER Antwort der KI (Zusatz in der KI-Anweisung, Vorrang vor allem anderen).
   Sagst du nur "Das ist falsch", fragt er "Was ist richtig?" und nimmt deinen nächsten Satz als Korrektur.
   Liste: "Welche Korrekturen hast du?"   Löschen: "Vergiss die letzte Korrektur" / "Lösche alle Korrekturen".
   Unterschied zu hoerkorrektur.js: dort geht es um die SCHREIBWEISE eines falsch verstandenen Wortes, hier um falsche INHALTE/Antworten.
   Speicher: jv_korrekturen (höchstens 30). Braucht: commands.js (jvCommands), prompt-Kette (jvChain), kontext_lokal.js (jvKontext.letzter).
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_korrekturen', MAX = 30, FRAGE_MS = 30000;
    function pd(k, d) { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) || d); } catch (e) { return d; } }
    function sd(k, v) { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) { } }
    function laden() { try { const s = pd(KEY, ''); const l = s ? JSON.parse(s) : []; return Array.isArray(l) ? l : []; } catch (e) { return []; } }
    function speichern(l) { sd(KEY, l.length ? JSON.stringify(l.slice(-MAX)) : ''); }
    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    let erwartet = null;   // { at, f, a }: "Was ist richtig?" wurde gefragt

    /* Anfang des Satzes sagt "das ist falsch" o. ä.; Gruppe 1 = der Rest (die Korrektur selbst) */
    const START = [
        /^(?:nein\s+|nee\s+|ne\s+|aber\s+)?(?:das|dies|es)\s+(?:ist|war|stimmt|sind)\s+(?:so\s+|leider\s+|aber\s+|hier\s+)?(?:nicht\s+(?:richtig|korrekt|ganz\s+richtig|so)|falsch)\b[\s,.:;-]*(.*)$/,
        /^(?:nein\s+|nee\s+|aber\s+)?(?:das\s+)?stimmt\s+(?:so\s+)?nicht\b[\s,.:;-]*(.*)$/,
        /^(?:nein\s+|nee\s+)?(?:falsch|so\s+nicht|das\s+ist\s+nicht\s+richtig)\b[\s,.:;-]*(.*)$/,
        /^(?:korrektur|verbesserung)\b[\s,.:;-]*(.*)$/,
        /^korrigier(?:e)?\s+dich\b[\s,.:;-]*(.*)$/,
        /^(?:du\s+)?(?:irrst|täuschst|taeuschst)\s+dich\b[\s,.:;-]*(.*)$/
    ];
    const LIST = [/\bwelche\s+korrekturen\s+(?:hast|kennst)\s+du\b/, /^(?:zeig|zeige|lies|lese)\s+(?:mir\s+)?(?:meine|deine|die)\s+korrekturen/, /^was\s+habe\s+ich\s+dir\s+(?:alles\s+)?(?:korrigiert|verbessert|beigebracht)\b/];
    const LETZTE = [/^(?:vergiss|lösche?|loesche?|entferne)\s+(?:die\s+)?letzte\s+korrektur\b/];
    const ALLE = [/^(?:vergiss|lösche?|loesche?|entferne)\s+(?:alle|deine|meine)\s+korrekturen\b/, /^korrekturen\s+(?:löschen|loeschen|leeren|zurücksetzen|zuruecksetzen)\b/];

    function bereinigen(t) { return String(t || '').replace(/\s+/g, ' ').trim(); }
    function norm(t) { return bereinigen(t).toLowerCase().replace(/[!?]+$/g, '').replace(/\s+/g, ' '); }

    function merken(korrektur, f, a) {
        const k = bereinigen(korrektur).slice(0, 300);
        if (!k) return false;
        const l = laden();
        l.push({ k: k, f: bereinigen(f).slice(0, 200), a: bereinigen(a).slice(0, 240), am: heute() });
        speichern(l);
        return true;
    }
    function letzteAntwort() {
        try { const x = window.jvKontext && window.jvKontext.letzter ? window.jvKontext.letzter(180000) : null; return x ? { f: x.frage, a: x.antwort } : { f: '', a: '' }; } catch (e) { return { f: '', a: '' }; }
    }
    function bestaetigen(k) { sagen('Verstanden, ich merke mir: ' + k.replace(/[.!?]+$/, '') + '. Ab jetzt beachte ich das.'); }

    function handle(text) {
        const raw = bereinigen(text);
        if (!raw) return false;
        const t = norm(raw);
        /* offene Frage "Was ist richtig?": der nächste Satz ist die Korrektur */
        if (erwartet) {
            const e = erwartet; erwartet = null;
            if (Date.now() - e.at < FRAGE_MS && !/^(?:vergiss es|lass(?:\s+es)?|egal|abbrechen|doch nicht)\b/.test(t)) {
                if (merken(raw, e.f, e.a)) { bestaetigen(raw); return true; }
            } else if (/^(?:vergiss es|lass(?:\s+es)?|egal|abbrechen|doch nicht)\b/.test(t)) { sagen('Alles klar, ich lasse es.'); return true; }
        }
        if (t.length > 400) return false;
        if (ALLE.some(r => r.test(t))) { const n = laden().length; speichern([]); sagen(n ? 'Okay, ich habe alle Korrekturen vergessen.' : 'Ich hatte keine Korrekturen gemerkt.'); return true; }
        if (LETZTE.some(r => r.test(t))) { const l = laden(); if (!l.length) { sagen('Ich hatte keine Korrektur gemerkt.'); return true; } const x = l.pop(); speichern(l); sagen('Okay, die Korrektur „' + x.k.slice(0, 80) + '“ habe ich vergessen.'); return true; }
        if (LIST.some(r => r.test(t))) {
            const l = laden();
            if (!l.length) { sagen('Du hast mir noch nichts korrigiert. Sag einfach: Das ist falsch, und dann was richtig ist.'); return true; }
            sagen('Ich habe mir ' + (l.length === 1 ? 'eine Korrektur' : l.length + ' Korrekturen') + ' gemerkt. Zuletzt: ' + l.slice(-3).reverse().map(x => '„' + x.k.slice(0, 80) + '“').join(', ') + '.');
            try { if (typeof showActionCards === 'function') showActionCards(l.slice(-6).reverse().map(x => ({ icon: '✏️', title: x.k.slice(0, 80), subtitle: x.f ? 'zu: ' + x.f.slice(0, 60) : 'am ' + x.am }))); } catch (e) { }
            return true;
        }
        for (const r of START) {
            const m = t.match(r);
            if (!m) continue;
            /* Rest aus dem Originaltext holen (Groß-/Kleinschreibung bleibt): Länge des Anfangs abziehen */
            const rest = bereinigen(raw.slice(raw.length - (m[1] ? m[1].length : 0))).replace(/^[\s,.:;-]+/, '');
            const l = letzteAntwort();
            if (!rest || rest.length < 3) {
                if (!l.f && !l.a) return false;   // nichts, worauf sich "falsch" beziehen könnte: normal weiter (kein Warten auf die nächste Äußerung)
                erwartet = { at: Date.now(), f: l.f, a: l.a };
                sagen('Was ist richtig?');
                return true;
            }
            if (merken(rest, l.f, l.a)) { bestaetigen(rest); return true; }
        }
        return false;
    }

    /* Hinweis für die KI: gemerkte Korrekturen haben Vorrang */
    function promptText() {
        const l = laden().slice(-20);
        if (!l.length) return '';
        return '\n\nKORREKTUREN DES NUTZERS (sie hat er dir selbst beigebracht, sie haben VORRANG vor allem anderen, auch vor deinem Wissen und dem Kontext; beachte sie sofort und ohne Rückfrage, und wiederhole den alten Fehler nicht):\n' +
            l.map((x, i) => (i + 1) + '. ' + (x.f ? 'Auf „' + x.f + '“ ' + (x.a ? 'antwortetest du „' + x.a + '“; ' : '') : '') + 'richtig ist: ' + x.k).join('\n');
    }
    if (window.jvChain) window.jvChain.use('buildSystemPrompt', 'korrektur', function (next) { return next() + promptText(); }, 214);

    window.jvKorrektur = { handle, laden, promptText, merken };
    if (window.jvCommands) {
        window.jvCommands.use('korrektur', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Korrektur', e); }
            return next(text);
        }, 0.01);
    }
})();
