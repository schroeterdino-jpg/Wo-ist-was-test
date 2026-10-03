/* ============================================================
   EXTRAFENSTER: ein einfaches Fenster im HUD-Stil für die neuen Ansichten (Mond, Feiertage).
   Es liegt unabhängig vom Fenster-System der App (panels.js) über allem, schließt sich per Tipp auf das ✕, auf den dunklen Rand
   oder per Sprache ("Schließen", "Mach das Fenster zu").
   Benutzt von sonnemond.js und feiertage.js; fehlt diese Datei, zeigen die beiden ihre Antworten weiter als Karten.
   Braucht: nichts.
   ============================================================ */
(function () {
    let layer = null;

    function injectStyle() {
        if (document.getElementById('extraFensterStyle')) return;
        const st = document.createElement('style');
        st.id = 'extraFensterStyle';
        st.textContent = '@keyframes xwIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}' +
            '#extraFenster::-webkit-scrollbar{width:6px}#extraFenster::-webkit-scrollbar-thumb{background:rgba(93,209,255,.3);border-radius:3px}';
        document.head.appendChild(st);
    }

    function onKey(e) { if (e.key === 'Escape') closeExtraWindow(); }

    function closeExtraWindow() {
        if (layer) { try { layer.remove(); } catch (e) {} layer = null; }
        document.removeEventListener('keydown', onKey);
    }

    /* Öffnet das Fenster; gibt das Element mit dem Inhalt zurück (dort lässt sich später noch etwas nachtragen) */
    function openExtraWindow(title, html) {
        injectStyle();
        closeExtraWindow();
        layer = document.createElement('div');
        layer.id = 'extraFensterLayer';
        layer.style.cssText = 'position:fixed;left:0;top:0;right:0;bottom:0;z-index:9000;display:flex;align-items:center;justify-content:center;' +
            'padding:max(14px,env(safe-area-inset-top)) 14px max(14px,env(safe-area-inset-bottom));background:rgba(2,8,14,.74);';
        layer.innerHTML =
            '<div id="extraFenster" role="dialog" aria-modal="true" style="width:100%;max-width:440px;max-height:100%;overflow-y:auto;box-sizing:border-box;' +
            'background:linear-gradient(180deg,#0b1a29,#07111b);border:1px solid rgba(93,209,255,.35);border-radius:16px;box-shadow:0 0 30px rgba(0,210,255,.16);' +
            'color:#e2e8f0;font-family:ui-monospace,Menlo,Consolas,monospace;animation:xwIn .28s ease-out">' +
            '<div style="position:sticky;top:0;z-index:2;display:flex;justify-content:space-between;align-items:center;padding:12px 14px;' +
            'background:rgba(8,20,32,.96);border-bottom:1px solid rgba(93,209,255,.2)">' +
            '<span style="font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#49d7ff;font-size:15px"></span>' +
            '<button type="button" aria-label="Schließen" style="border:1px solid rgba(93,209,255,.4);border-radius:8px;background:#0a1621;color:#49d7ff;font-size:16px;padding:2px 11px;cursor:pointer">✕</button>' +
            '</div><div id="extraFensterBody" style="padding:14px"></div></div>';
        layer.querySelector('span').textContent = title;
        layer.querySelector('button').addEventListener('click', closeExtraWindow);
        layer.addEventListener('click', e => { if (e.target === layer) closeExtraWindow(); });
        document.body.appendChild(layer);
        document.addEventListener('keydown', onKey);
        const body = layer.querySelector('#extraFensterBody');
        body.innerHTML = html;
        return body;
    }

    /* "Schließen", "Mach das Fenster zu" - gilt nur, solange dieses Fenster offen ist */
    function handleExtraWindowCommand(text) {
        if (!layer) return false;
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (/^(?:jarvis )?(?:schließ\w*|schliess\w*|zumachen|fenster schließen|ansicht schließen|ausblenden|weg damit|mach (?:das |es |die |den )?(?:fenster |ansicht )?zu|zurück)$/.test(t)) {
            closeExtraWindow();
            return true;
        }
        return false;
    }

    window.openExtraWindow = openExtraWindow;
    window.closeExtraWindow = closeExtraWindow;
    window.handleExtraWindowCommand = handleExtraWindowCommand;
})();
