/* Der Assistent heißt jetzt "Jarvis". Intern rechnet der Code weiter mit "Zane" (Befehle, gespeicherte Daten),
   nach außen heißt er überall Jarvis: Anzeige, Ansprache der KI, Aussprache. Das Weckwort "Jarvis" wird beim Erkennen
   in voice.js wieder zu "Zane" umgeschrieben. */
(function () {
    const NEU = 'Jarvis';
    const ALT = /Zane(?![a-zA-Z_])/g;
    const ALT_S = /Zanes(?![a-zA-Z_])/g;

    function ersetze(t) { return t.replace(ALT_S, NEU + 's').replace(ALT, NEU).replace(/ZANE(?![A-Z_])/g, 'JARVIS'); }

    // Anzeige: alle sichtbaren Texte
    function textKnoten(root) {
        try {
            const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null);
            let n;
            while ((n = w.nextNode())) {
                const p = n.parentNode && n.parentNode.nodeName;
                if (p === 'SCRIPT' || p === 'STYLE' || p === 'TEXTAREA') continue;
                if (n.nodeValue && n.nodeValue.search(/Zane|ZANE/) !== -1) n.nodeValue = ersetze(n.nodeValue);
            }
        } catch (e) { }
    }
    function attribute(root) {
        try {
            if (!root.querySelectorAll) return;
            root.querySelectorAll('[placeholder],[title],[aria-label]').forEach(function (el) {
                ['placeholder', 'title', 'aria-label'].forEach(function (a) {
                    const v = el.getAttribute(a);
                    if (v && v.search(/Zane|ZANE/) !== -1) el.setAttribute(a, ersetze(v));
                });
            });
        } catch (e) { }
    }
    function alles() {
        if (document.title.search(/Zane|ZANE/) !== -1) document.title = ersetze(document.title);
        if (document.body) { textKnoten(document.body); attribute(document.body); }
    }

    let geplant = false;
    function bald() {
        if (geplant) return;
        geplant = true;
        setTimeout(function () { geplant = false; alles(); }, 50);
    }

    function start() {
        alles();
        try {
            new MutationObserver(bald).observe(document.documentElement, { childList: true, subtree: true, characterData: true });
        } catch (e) { }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    // Ansprache der KI: Sie heißt Jarvis. Eintrag in der Ergänzungs-Liste der KI-Anweisung (commands.js, jvChain), Rang 10 = ganz außen: wirkt auf den fertigen Text.
    try {
        if (window.jvChain) window.jvChain.use('buildSystemPrompt', 'name', function (next) {
            const r = next();
            return typeof r === 'string' ? ersetze(r) : r;
        }, 10);
    } catch (e) { }
})();
