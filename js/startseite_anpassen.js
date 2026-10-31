/* ============================================================
   STARTSEITE ANPASSEN: Welche Felder die Startseite (js/uebersicht.js) zeigt und in welcher Reihenfolge, stellst du selbst ein.
   Bedienung nur per Tippen: ☰-Menü > "Startseite anpassen": je Feld ein Schalter (an/aus) und die Pfeile ▲ ▼. "Zurücksetzen" stellt alles wie vorher.
   Gespeichert nur auf diesem Handy (localStorage, Schlüssel jv_ueb_felder, kein Abgleich, kein Server): { "reihenfolge": [Feld-Ids], "aus": [Feld-Ids] }.
   Technik: ändert nur die Anzeige der vorhandenen Felder (CSS-Eigenschaft order und die Klasse ueb-aus); uebersicht.js füllt sie unverändert weiter.
   Zugriff: window.jvStartAnpassen = { oeffnen(), anwenden(), zuruecksetzen(), felder }. Fehlt ein Feld auf der Seite, wird es übersprungen.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_ueb_felder';
    const FELDER = [
        { id: 'uebArbeit', name: 'Arbeitsweg' },
        { id: 'uebRegen', name: 'Regen' },
        { id: 'uebDiesel', name: 'Diesel' },
        { id: 'uebSchicht', name: 'Schicht' },
        { id: 'uebTermine', name: 'Nächste Termine' },
        { id: 'uebErinnerung', name: 'Erinnern' },
        { id: 'uebEinkauf', name: 'Einkauf' },
        { id: 'uebWetter', name: 'Wetter morgen' }
    ];
    const IDS = FELDER.map(f => f.id);

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    /* Gespeicherte Auswahl lesen und prüfen: unbekannte Ids fliegen raus, fehlende werden hinten angehängt */
    function laden() {
        let o = {};
        try { o = JSON.parse(lsGet(KEY) || '{}') || {}; } catch (e) { o = {}; }
        const reihe = Array.isArray(o.reihenfolge) ? o.reihenfolge.filter(id => IDS.indexOf(id) >= 0) : [];
        IDS.forEach(id => { if (reihe.indexOf(id) < 0) reihe.push(id); });
        const aus = Array.isArray(o.aus) ? o.aus.filter(id => IDS.indexOf(id) >= 0) : [];
        return { reihenfolge: reihe.filter((id, i) => reihe.indexOf(id) === i), aus };
    }
    function speichern(o) { lsSet(KEY, JSON.stringify(o)); }

    function anwenden() {
        const o = laden();
        o.reihenfolge.forEach((id, i) => {
            const el = document.getElementById(id);
            if (!el) return;
            el.style.order = String(i);
            el.classList.toggle('ueb-aus', o.aus.indexOf(id) >= 0);
        });
    }
    function zuruecksetzen() { lsSet(KEY, '{}'); anwenden(); IDS.forEach(id => { const el = document.getElementById(id); if (el) { el.style.order = ''; el.classList.remove('ueb-aus'); } }); }

    /* ---------- Fenster ---------- */
    let win = null;
    function stil() {
        if (document.getElementById('jvAnpCss')) return;
        const st = document.createElement('style'); st.id = 'jvAnpCss';
        st.textContent =
            '#jvAnp{position:fixed;inset:0;z-index:92;background:rgba(4,9,15,.98);color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
            '#jvAnp .an-head{padding:16px 18px 6px;text-align:center}#jvAnp .an-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.14em;color:#49d7ff}' +
            '#jvAnp .an-sub{font:500 12px "IBM Plex Mono",monospace;color:#7fb8cf;margin-top:4px}' +
            '#jvAnp .an-body{flex:1 1 auto;overflow:auto;padding:8px 14px;display:flex;flex-direction:column;gap:8px;min-height:0}' +
            '#jvAnp .an-row{display:flex;gap:8px;align-items:center;border:1px solid rgba(93,209,255,.25);border-radius:10px;padding:8px 10px;background:rgba(10,22,33,.9)}' +
            '#jvAnp .an-row.aus .an-name{opacity:.4;text-decoration:line-through}' +
            '#jvAnp .an-name{flex:1 1 auto;font-size:18px}' +
            '#jvAnp .an-btn{min-width:44px;padding:10px 8px;border-radius:10px;border:1px solid rgba(93,209,255,.4);background:rgba(10,22,33,.95);color:#49d7ff;font:700 13px "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase}' +
            '#jvAnp .an-btn.an-an{background:rgba(87,224,161,.18);color:#57e0a1;border-color:rgba(87,224,161,.5)}' +
            '#jvAnp .an-btn:disabled{opacity:.3}' +
            '#jvAnp .an-bar{padding:6px 14px 14px;display:flex;gap:8px}#jvAnp .an-bar .an-btn{flex:1 1 0}';
        document.head.appendChild(st);
    }
    function schliessen() {
        if (win) { try { win.remove(); } catch (e) { } win = null; }
        try { document.body.classList.remove('panel-open'); } catch (e) { }
        try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) { }
    }
    function oeffnen() {
        stil(); schliessen();
        const mk = (p, tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; p.appendChild(x); return x; };
        win = document.createElement('div'); win.id = 'jvAnp';
        const head = mk(win, 'div', 'an-head'); mk(head, 'div', 'an-title', 'STARTSEITE ANPASSEN');
        mk(head, 'div', 'an-sub', 'Felder ein- und ausschalten, mit ▲ ▼ verschieben');
        const body = mk(win, 'div', 'an-body');
        const o = laden();
        const namen = {}; FELDER.forEach(f => { namen[f.id] = f.name; });
        o.reihenfolge.forEach((id, i) => {
            const ist = o.aus.indexOf(id) < 0;
            const row = mk(body, 'div', 'an-row' + (ist ? '' : ' aus'));
            mk(row, 'div', 'an-name', namen[id]);
            const sw = mk(row, 'button', 'an-btn' + (ist ? ' an-an' : ''), ist ? 'An' : 'Aus');
            sw.addEventListener('click', () => { const n = laden(); const k = n.aus.indexOf(id); if (k >= 0) n.aus.splice(k, 1); else n.aus.push(id); speichern(n); anwenden(); oeffnen(); });
            const hoch = mk(row, 'button', 'an-btn', '▲'); hoch.disabled = i === 0;
            hoch.addEventListener('click', () => { const n = laden(); const j = n.reihenfolge.indexOf(id); if (j > 0) { n.reihenfolge.splice(j, 1); n.reihenfolge.splice(j - 1, 0, id); speichern(n); anwenden(); oeffnen(); } });
            const runter = mk(row, 'button', 'an-btn', '▼'); runter.disabled = i === o.reihenfolge.length - 1;
            runter.addEventListener('click', () => { const n = laden(); const j = n.reihenfolge.indexOf(id); if (j >= 0 && j < n.reihenfolge.length - 1) { n.reihenfolge.splice(j, 1); n.reihenfolge.splice(j + 1, 0, id); speichern(n); anwenden(); oeffnen(); } });
        });
        const bar = mk(win, 'div', 'an-bar');
        mk(bar, 'button', 'an-btn', 'Zurücksetzen').addEventListener('click', () => { zuruecksetzen(); oeffnen(); });
        mk(bar, 'button', 'an-btn an-an', 'Fertig').addEventListener('click', schliessen);
        document.body.appendChild(win);
        try { document.body.classList.add('panel-open'); } catch (e) { }
        try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) { }
    }

    window.jvStartAnpassen = { oeffnen, anwenden, zuruecksetzen, felder: FELDER };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', anwenden); else anwenden();
})();
