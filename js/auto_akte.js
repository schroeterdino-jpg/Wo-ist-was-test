/* ============================================================
   AUTO-AKTE: Fristen rund ums Auto an einem Ort (☰-Menü > "Auto-Akte"): TÜV (HU), Inspektion, Reifenwechsel, Versicherung.
   Bedienung nur per Tippen: Datum eintragen, fertig. Je Eintrag steht "in 45 Tagen", orange ab 45 Tagen, rot ab 14 Tagen und wenn überfällig.
   Die Daten liegen nur auf diesem Handy (localStorage, Schlüssel jv_auto_akte, kein Abgleich, kein Server).
   Jarvis nutzt sie so: dirigent.js nimmt fällige Fristen (bis 45 Tage) in den Kontext der Tagesmeldung auf (window.jvAutoAkte.faellig()),
   die KI entscheidet dann selbst, ob sie sich meldet (höchstens eine Meldung pro Tag, wie alle Tagesmeldungen).
   Zugriff: window.jvAutoAkte = { fenster(), faellig(tage), alle() }. Braucht nichts anderes; fehlt etwas, bleibt das Fenster einfach leer.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_auto_akte';
    const FELDER = [
        { id: 'hu', name: 'TÜV (HU)', typ: 'month', hint: 'Plakette hinten am Kennzeichen, zum Beispiel 06/2027' },
        { id: 'insp', name: 'Inspektion', typ: 'date', hint: 'Nächster Termin oder Fälligkeit laut Serviceheft' },
        { id: 'reifen', name: 'Reifenwechsel', typ: 'date', hint: 'Wann sollen die Reifen das nächste Mal gewechselt werden? (Faustregel: Oktober und April)' },
        { id: 'vers', name: 'Versicherung', typ: 'date', hint: 'Kündigungsfrist, falls du wechseln willst (meist der 30. November)' }
    ];

    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function laden() { try { const v = JSON.parse(lsGet(KEY) || '{}'); return v && typeof v === 'object' ? v : {}; } catch (e) { return {}; } }
    function speichern(o) { lsSet(KEY, JSON.stringify(o)); }

    /* Stichtag: bei einem Monat (TÜV) der letzte Tag des Monats */
    function stichtag(f, wert) {
        if (!wert) return null;
        const t = String(wert).split('-').map(Number);
        if (!t[0] || !t[1]) return null;
        const d = f.typ === 'month' ? new Date(t[0], t[1], 0) : new Date(t[0], t[1] - 1, t[2] || 1);
        return isNaN(d.getTime()) ? null : d;
    }
    function tageBis(d) {
        const h = new Date(); h.setHours(0, 0, 0, 0);
        return Math.round((d.getTime() - h.getTime()) / 86400000);
    }
    function status(t) {
        if (t === null) return { text: 'nicht eingetragen', farbe: '#7fb8cf' };
        if (t < 0) return { text: 'überfällig seit ' + (-t) + (t === -1 ? ' Tag' : ' Tagen'), farbe: '#ff6b6b' };
        if (t === 0) return { text: 'heute fällig', farbe: '#ff6b6b' };
        const text = t === 1 ? 'morgen' : 'in ' + t + ' Tagen';
        return { text, farbe: t <= 14 ? '#ff6b6b' : t <= 45 ? '#ff9a44' : '#57e0a1' };
    }

    function alle() {
        const o = laden();
        return FELDER.map(f => { const d = stichtag(f, o[f.id]); return { id: f.id, name: f.name, wert: o[f.id] || '', datum: d, in_tagen: d ? tageBis(d) : null }; });
    }
    /* Für die Tagesmeldung (dirigent.js): fällig oder bald fällig, kurz und ohne Datum-Objekte */
    function faellig(tage) {
        const grenze = Number.isFinite(tage) ? tage : 45;
        return alle().filter(x => x.in_tagen !== null && x.in_tagen <= grenze && x.in_tagen >= -90)
            .map(x => ({ was: x.name, in_tagen: x.in_tagen, am: x.datum.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) }));
    }

    /* ---------- Fenster ---------- */
    let win = null;
    function stil() {
        if (document.getElementById('jvAutoCss')) return;
        const st = document.createElement('style'); st.id = 'jvAutoCss';
        st.textContent =
            '#jvAuto{position:fixed;inset:0;z-index:92;background:rgba(4,9,15,.98);color:#d9e9f2;display:flex;flex-direction:column;font-family:"Rajdhani",sans-serif;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}' +
            '#jvAuto .au-head{padding:16px 18px 6px;text-align:center}#jvAuto .au-title{font:700 17px "Orbitron",sans-serif;letter-spacing:.14em;color:#49d7ff}' +
            '#jvAuto .au-sub{font:500 12px "IBM Plex Mono",monospace;color:#7fb8cf;margin-top:4px}' +
            '#jvAuto .au-body{flex:1 1 auto;overflow:auto;padding:8px 14px;display:flex;flex-direction:column;gap:12px;min-height:0}' +
            '#jvAuto .au-card{border:1px solid rgba(93,209,255,.25);border-radius:10px;padding:10px 12px;background:rgba(10,22,33,.9)}' +
            '#jvAuto .au-top{display:flex;justify-content:space-between;align-items:baseline;gap:8px}' +
            '#jvAuto .au-h{font:700 13px "IBM Plex Mono",monospace;letter-spacing:.08em;text-transform:uppercase;color:#49d7ff}' +
            '#jvAuto .au-st{font:700 17px "Rajdhani",sans-serif;white-space:nowrap}' +
            '#jvAuto .au-hint{font:500 12px "IBM Plex Mono",monospace;color:#7fb8cf;margin:4px 0 8px}' +
            '#jvAuto .au-row{display:flex;gap:8px;align-items:center}' +
            '#jvAuto input{flex:1 1 auto;min-width:0;padding:10px;border-radius:10px;border:1px solid rgba(93,209,255,.3);background:#fff;color:#111;font:15px "Rajdhani",Arial,sans-serif}' +
            '#jvAuto .au-btn{padding:10px 12px;border-radius:10px;border:1px solid rgba(93,209,255,.4);background:rgba(10,22,33,.95);color:#49d7ff;font:700 12px "IBM Plex Mono",monospace;letter-spacing:.06em;text-transform:uppercase}' +
            '#jvAuto .au-bar{padding:6px 14px 14px}';
        document.head.appendChild(st);
    }
    function schliessen() {
        if (win) { try { win.remove(); } catch (e) { } win = null; }
        try { document.body.classList.remove('panel-open'); } catch (e) { }
        try { if (typeof window.resumeJarvisSphere === 'function') window.resumeJarvisSphere(); } catch (e) { }
    }
    function fenster() {
        stil(); schliessen();
        const mk = (p, tag, cls, txt) => { const x = document.createElement(tag); if (cls) x.className = cls; if (txt !== undefined) x.textContent = txt; p.appendChild(x); return x; };
        win = document.createElement('div'); win.id = 'jvAuto';
        const head = mk(win, 'div', 'au-head'); mk(head, 'div', 'au-title', 'AUTO-AKTE');
        mk(head, 'div', 'au-sub', 'Fristen für dein Auto · bleibt nur auf diesem Handy');
        const body = mk(win, 'div', 'au-body');
        const o = laden();
        FELDER.forEach(f => {
            const card = mk(body, 'div', 'au-card');
            const top = mk(card, 'div', 'au-top'); mk(top, 'div', 'au-h', f.name);
            const st = mk(top, 'div', 'au-st');
            mk(card, 'div', 'au-hint', f.hint);
            const row = mk(card, 'div', 'au-row');
            const inp = mk(row, 'input'); inp.type = f.typ; inp.value = o[f.id] || '';
            const zeige = () => { const s = status((() => { const d = stichtag(f, inp.value); return d ? tageBis(d) : null; })()); st.textContent = s.text; st.style.color = s.farbe; };
            zeige();
            inp.addEventListener('change', () => { const n = laden(); if (inp.value) n[f.id] = inp.value; else delete n[f.id]; speichern(n); zeige(); });
            mk(row, 'button', 'au-btn', 'Löschen').addEventListener('click', () => { inp.value = ''; const n = laden(); delete n[f.id]; speichern(n); zeige(); });
        });
        const bar = mk(win, 'div', 'au-bar'); const cb = mk(bar, 'button', 'au-btn', 'Schließen'); cb.style.width = '100%'; cb.addEventListener('click', schliessen);
        document.body.appendChild(win);
        try { document.body.classList.add('panel-open'); } catch (e) { }
        try { if (typeof window.pauseJarvisSphere === 'function') window.pauseJarvisSphere(); } catch (e) { }
    }

    window.jvAutoAkte = { fenster, faellig, alle };
})();
