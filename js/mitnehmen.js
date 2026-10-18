/* ============================================================
   MITNEHMEN: feste Liste der Dinge, die du vor der Arbeit nicht vergessen willst.
   Nova sagt sie bei der Aufbruchsansage (10 Minuten vor der Abfahrt, plan_ansagen.js) kurz an, an jedem Arbeitstag, Früh- und Spätschicht gleich.
   Sagen:  "Was muss ich mitnehmen?" · "Pack Handy auf meine Mitnehmen-Liste" · "Streich das Energy von der Mitnehmen-Liste"
           "Mitnehmen-Liste zurücksetzen" (dann gilt wieder die Grundliste)
   Braucht: commands.js, voice.js (speak). Muss VOR plan_ansagen.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    var KEY = 'jv_mitnehmen';
    var STANDARD = ['Arbeitschip', 'Haustürschlüssel', 'Autoschlüssel', 'Portemonnaie', 'Zahnprovisorium', 'Arbeitsessen', 'dein Energy'];

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function sag(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    function liste() {
        try { var a = JSON.parse(lsGet(KEY) || 'null'); if (Array.isArray(a) && a.length) return a.map(String); } catch (e) {}
        return STANDARD.slice();
    }
    function speichern(a) { lsSet(KEY, JSON.stringify(a)); }
    function aufzaehlung(a) { return a.length > 1 ? a.slice(0, -1).join(', ') + ' und ' + a[a.length - 1] : (a[0] || ''); }
    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
    function text() { return 'Nimm mit: ' + aufzaehlung(liste()) + '.'; }
    function norm(t) { return String(t || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function bereinigt(s) { return s.replace(/^(?:den|die|das|mein|meine|meinen|mal|noch)\s+/, '').replace(/\s+(?:bitte|auch|noch)$/, '').trim(); }

    function register() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('mitnehmen', function (text0, next) {
            var t = norm(text0), m;
            if (t.length > 90) return next(text0);
            if (/^(?:was|welche sachen|welche dinge) (?:muss|soll) ich (?:alles )?(?:mitnehmen|einpacken|nicht vergessen)|^(?:was|welche sachen|welche dinge) (?:steht|ist) (?:auf|in) (?:meiner|der) (?:mitnehmen|mitnahme)[- ]?liste|^(?:lies|sag|zeig)(?: mir)? (?:meine|die) mitnehmen[- ]?liste/.test(t)) { sag(text()); return true; }
            if (/^(?:setz |setze )?(?:meine |die )?mitnehmen[- ]?liste (?:zurück|zurücksetzen|neu)/.test(t) || /^mitnehmen[- ]?liste zurücksetzen/.test(t)) { lsSet(KEY, ''); sag('Gut, die Mitnehmen-Liste ist wieder die Grundliste. ' + text()); return true; }
            m = t.match(/^(?:pack|setz|setze|schreib|schreibe|füg|füge|nimm)\s+(.{2,40}?)\s+(?:auf|in|zu|zur|zu meiner)\s+(?:meine |die |der |meiner )?mitnehmen[- ]?liste(?:\s+(?:dazu|drauf|hinzu))?$/);
            if (m) {
                var neu = cap(bereinigt(m[1])), a = liste();
                if (!a.some(function (x) { return x.toLowerCase() === neu.toLowerCase(); })) a.push(neu);
                speichern(a); sag(neu + ' steht jetzt auf deiner Mitnehmen-Liste.'); return true;
            }
            m = t.match(/^(?:streich|streiche|lösch|lösche|nimm|entfern|entferne)\s+(.{2,40}?)\s+(?:von|aus|auf)\s+(?:meiner |der |die |meine )?mitnehmen[- ]?liste(?:\s+(?:weg|raus|runter))?$/);
            if (m) {
                var weg = bereinigt(m[1]).toLowerCase(), b = liste(), vorher = b.length;
                b = b.filter(function (x) { var l = x.toLowerCase(); return !(l === weg || l.indexOf(weg) >= 0 || weg.indexOf(l) >= 0); });
                if (b.length === vorher) { sag('Das steht nicht auf deiner Mitnehmen-Liste.'); return true; }
                speichern(b); sag('Gut, ' + cap(weg) + ' ist von der Mitnehmen-Liste gestrichen.'); return true;
            }
            return next(text0);
        }, 62);
        return true;
    }
    var n = 0; (function r() { if (!register() && n++ < 40) setTimeout(r, 500); })();
    window.jvMitnehmen = { text: text, liste: liste };
})();
