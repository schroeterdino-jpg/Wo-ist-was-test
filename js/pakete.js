/* ============================================================
   PAKETE: Sendungsverfolgung für DHL-Pakete. Quelle: DHL-Schnittstelle über /api/bahn?aktion=paket (Schlüssel DHL_API_KEY bei Vercel; fehlt er, sagt Jarvis das).
   Sprache:
   - "Paket DHL 1234 5678 9012" / "Merk dir das Paket 123456789012" / "Paket von Amazon 123456789012" / "Verfolge das Paket für Julia 123456789012"
   - "Wo ist mein Paket?" / "Paketstatus" / "Wann kommt mein Paket?"
   - "Meine Pakete" / "Paket hinzufügen" (Fenster zum Einfügen der Nummer, praktisch zum Kopieren aus der DHL-Nachricht)
   - "Vergiss das Paket" / "Alle Pakete löschen"
   Jarvis schaut beim Öffnen der App und danach höchstens alle 30 Minuten nach; wird ein Paket zugestellt, sagt er es. Zugestellte Pakete verschwinden nach 30 Tagen
   (DHL verlangt, die Daten dann zu löschen). Gespeichert wird nur auf diesem Gerät (localStorage "jv_pakete"). Daten: Deutsche Post DHL Group.
   Braucht: storage.js (apiFetch), commands.js (jvCommands), voice.js (speak). Order 43.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_pakete';
    function laden() { try { const a = JSON.parse(localStorage.getItem(KEY) || '[]'); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function speichern(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { } }
    function sagen(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    function hinweis(text) {
        try {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:99999;background:#04090f;border:1px solid #4cffb0;color:#e8f3f9;padding:10px 16px;border-radius:10px;font:14px sans-serif;max-width:90vw';
            d.textContent = text; document.body.appendChild(d); setTimeout(function () { try { d.remove(); } catch (e) { } }, 7000);
        } catch (e) { }
    }
    function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function heute(off) { return new Date(Date.now() + (off || 0) * 86400000).toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function tagText(iso) {
        if (!iso) return '';
        const tag = String(iso).slice(0, 10);
        if (tag === heute(0)) return 'heute';
        if (tag === heute(1)) return 'morgen';
        if (tag === heute(-1)) return 'gestern';
        const d = new Date(tag + 'T12:00:00');
        if (isNaN(d.getTime())) return '';
        const diff = (d.getTime() - new Date(heute(0) + 'T12:00:00').getTime()) / 86400000;
        const wt = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'][d.getDay()];
        return diff > 0 && diff < 7 ? 'am ' + wt : 'am ' + tag.split('-').reverse().slice(0, 2).join('.') + '.';
    }
    function uhr(iso) { const m = String(iso || '').match(/T(\d{2}):(\d{2})/); return m ? m[1] + ':' + m[2] + ' Uhr' : ''; }

    /* ---------- Abfragen ---------- */
    async function abfragen(nr) {
        const r = await apiFetch('/api/bahn?aktion=paket&nr=' + encodeURIComponent(nr)).catch(function (e) { return { _fehler: e }; });
        if (r && r._fehler) return { fehler: 'Ich komme gerade nicht ans Internet.' };
        let j = null; try { j = await r.json(); } catch (e) { }
        if (!r.ok) return { fehler: (j && j.error) || ('Fehler ' + r.status), fehlt: !!(j && j.fehlt), unbekannt: !!(j && j.unbekannt) };
        return { daten: j };
    }
    function uebernehmen(p, d) {
        const alt = p.code + '|' + p.status;
        p.code = d.code; p.status = d.status; p.beschr = d.beschreibung; p.zeit = d.zeit; p.ort = d.ort; p.erwartet = d.erwartet; p.bis = d.bis;
        p.geprueft = Date.now();
        if (d.code === 'delivered' && !p.zugestellt) p.zugestellt = Date.now();
        return alt !== p.code + '|' + p.status;
    }
    function bezeichnung(p) { return p.name ? 'das Paket ' + (/^(?:von|für|fuer)\b/i.test(p.name) ? p.name : 'von ' + p.name) : 'dein Paket (endet auf ' + p.nr.slice(-4) + ')'; }
    function satz(p) {
        const b = bezeichnung(p), B = b.charAt(0).toUpperCase() + b.slice(1);
        if (p.code === 'delivered') return B + ' ist zugestellt' + (p.zeit ? ', ' + tagText(p.zeit) + (uhr(p.zeit) ? ' um ' + uhr(p.zeit) : '') : '') + '.';
        let s = B + ': ' + (p.beschr || p.status || 'Status unbekannt').replace(/\.$/, '') + '.';
        if (p.ort) s += ' Zuletzt in ' + p.ort + '.';
        if (p.erwartet) s += ' Erwartet ' + tagText(p.erwartet) + (uhr(p.erwartet) && !/00:00/.test(uhr(p.erwartet)) ? ' gegen ' + uhr(p.erwartet) : '') + (p.bis && uhr(p.bis) ? ' bis ' + uhr(p.bis) : '') + '.';
        return s;
    }
    function aufraeumen(a) {
        const grenze = Date.now() - 30 * 86400000;
        return a.filter(function (p) { return !(p.zugestellt && p.zugestellt < grenze); });
    }

    async function alleStatus() {
        let a = aufraeumen(laden());
        if (!a.length) { sagen('Du hast noch kein Paket eingetragen. Sag zum Beispiel: Paket, und dann die Nummer.'); return; }
        const aktiv = a.filter(function (p) { return !(p.code === 'delivered' && Date.now() - (p.zugestellt || 0) > 2 * 86400000); });
        const zeigen = aktiv.length ? aktiv : a.slice(-1);
        const teile = [];
        for (const p of zeigen) {
            const r = await abfragen(p.nr);
            if (r.daten) { uebernehmen(p, r.daten); teile.push(satz(p)); }
            else if (r.fehlt) { sagen(r.fehler); return; }
            else teile.push((p.name ? 'Paket ' + p.name : 'Das Paket auf ' + p.nr.slice(-4)) + ': ' + r.fehler);
        }
        speichern(a);
        sagen(teile.join(' '));
    }
    async function hinzufuegen(nr, name) {
        const a = aufraeumen(laden());
        let p = a.find(function (x) { return x.nr === nr; });
        if (!p) { p = { nr: nr, name: name || '', dienst: 'DHL', neu: Date.now() }; a.push(p); } else if (name) p.name = name;
        const r = await abfragen(nr);
        if (r.fehlt) { speichern(a); sagen('Ich habe das Paket gemerkt. Der DHL-Schlüssel fehlt aber noch, deshalb kann ich den Stand noch nicht abfragen.'); return; }
        if (r.daten) { uebernehmen(p, r.daten); speichern(a); sagen('Okay, ich verfolge das Paket. ' + satz(p)); return; }
        if (r.unbekannt) { speichern(a); sagen('Ich habe die Nummer gemerkt, aber DHL kennt sie noch nicht. Das ist bei neuen Paketen normal. Ich schaue später nochmal.'); return; }
        speichern(a); sagen('Ich habe die Nummer gemerkt. ' + r.fehler);
    }

    /* ---------- Fenster ---------- */
    let FW = null;
    function css() {
        if (document.getElementById('pk-style')) return;
        const st = document.createElement('style'); st.id = 'pk-style';
        st.textContent =
            '#pk-layer{position:fixed;inset:0;z-index:8700;background:#04090f;color:#e8f3f9;font-family:"DejaVu Sans Mono",ui-monospace,monospace;display:flex;flex-direction:column;box-sizing:border-box;padding:var(--aa-rand-y,0px) var(--aa-rand-x,0px)}' +
            '#pk-layer .k{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #1b3a4a;color:#4cffb0;letter-spacing:.14em;font-size:13px}' +
            '#pk-layer .x{width:52px;height:44px;border:1px solid rgba(93,209,255,.6);border-radius:10px;background:transparent;color:#49d7ff;font-size:22px}' +
            '#pk-layer .add{display:flex;gap:8px;padding:10px 14px}#pk-layer input{flex:1;min-width:0;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid #49d7ff;background:#071521;color:#e8f3f9;font:15px "DejaVu Sans Mono",monospace}' +
            '#pk-layer .add button{padding:0 14px;border-radius:10px;border:1px solid #4cffb0;color:#4cffb0;background:transparent;font:700 14px "DejaVu Sans Mono",monospace}' +
            '#pk-layer .l{flex:1;overflow-y:auto;padding:0 14px}#pk-layer .z{border-bottom:1px solid #0e2230;padding:10px 0;display:flex;gap:10px;align-items:flex-start}' +
            '#pk-layer .z .t{flex:1;min-width:0;font-size:13px;line-height:1.4}#pk-layer .z .n{color:#8fb4c8;font-size:11px}#pk-layer .z button{width:40px;height:40px;border-radius:10px;border:1px solid #1b3a4a;background:transparent;color:#ff7b7b;font-size:16px}' +
            '#pk-layer .f{padding:10px 14px;font-size:10px;color:#5d7e91}';
        document.head.appendChild(st);
    }
    function fensterZu() { try { if (FW && FW.parentNode) FW.parentNode.removeChild(FW); } catch (e) { } FW = null; }
    function zeichnen() {
        if (!FW) return;
        const a = aufraeumen(laden());
        const L = FW.querySelector('.l');
        L.innerHTML = a.length ? a.map(function (p, i) {
            return '<div class="z"><div class="t"><div>' + esc(p.name ? p.name : 'Paket') + ' · <span class="n">' + esc(p.nr) + '</span></div><div>' + esc(p.code ? satz(p) : 'Noch nicht abgefragt.') + '</div></div><button type="button" data-i="' + i + '" aria-label="Löschen">🗑</button></div>';
        }).join('') : '<div class="z"><div class="t">Noch kein Paket. Füge oben eine DHL-Sendungsnummer ein.</div></div>';
        L.querySelectorAll('button').forEach(function (b) {
            b.onclick = function () { const aa = aufraeumen(laden()); aa.splice(parseInt(b.getAttribute('data-i'), 10), 1); speichern(aa); zeichnen(); };
        });
    }
    function fenster() {
        css(); fensterZu();
        FW = document.createElement('div'); FW.id = 'pk-layer';
        FW.innerHTML = '<div class="k"><span>📦 PAKETE</span><button type="button" class="x" aria-label="Schließen">✕</button></div>' +
            '<div class="add"><input id="pk-nr" type="text" inputmode="text" placeholder="DHL-Sendungsnummer einfügen" autocomplete="off"><button type="button" id="pk-ok">Hinzufügen</button></div>' +
            '<div class="l"></div><div class="f">Daten: Deutsche Post DHL Group. Zugestellte Pakete werden nach 30 Tagen gelöscht.</div>';
        document.body.appendChild(FW);
        FW.querySelector('.x').onclick = fensterZu;
        FW.querySelector('#pk-ok').onclick = async function () {
            const nr = String(FW.querySelector('#pk-nr').value || '').replace(/\s+/g, '').toUpperCase();
            if (!/^[A-Z0-9]{8,30}$/.test(nr)) { hinweis('Die Nummer sieht nicht richtig aus.'); return; }
            FW.querySelector('#pk-nr').value = '';
            await hinzufuegen(nr, ''); zeichnen();
        };
        zeichnen();
        alleAktualisieren().then(zeichnen);
    }
    async function alleAktualisieren() {
        const a = aufraeumen(laden());
        for (const p of a) { if (p.code === 'delivered') continue; const r = await abfragen(p.nr); if (r.daten) uebernehmen(p, r.daten); }
        speichern(a);
    }

    /* ---------- Sprachbefehle ---------- */
    function nummerAus(t) {
        const tokens = t.split(/\s+/).filter(function (w) { return /^[a-z0-9]+$/i.test(w) && /\d/.test(w); });
        const nr = tokens.join('').toUpperCase();
        return /^[A-Z0-9]{10,30}$/.test(nr) ? nr : '';
    }
    function befehl(text, next) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.split(' ').length > 30 || !/(?:paket|p(?:ä|ae)ckchen|sendung)/.test(t)) return next(text);
        const nr = nummerAus(t);
        if (nr) {
            const m = t.match(/\b(?:von|f(?:ü|ue)r)\s+([a-zäöü]{3,20})\b/);
            const name = m && !/^(?:dhl|nummer|mich|mir)$/.test(m[1]) ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : '';
            hinzufuegen(nr, name ? (/^f/.test(m[0]) ? 'für ' : 'von ') + name : ''); return true;
        }
        if (/\b(?:vergiss\w*|l(?:ö|oe)sch\w*|entfern\w*)\b/.test(t)) {
            const a = laden(); if (!a.length) { sagen('Es ist kein Paket eingetragen.'); return true; }
            speichern([]); sagen(a.length > 1 ? 'Alle Pakete sind gelöscht.' : 'Das Paket ist gelöscht.'); return true;
        }
        if (/\b(?:hinzuf(?:ü|ue)g\w*|eintragen|nummer eingeben|neues paket|zeig\w*|meine pakete|(?:ö|oe)ffne\w*)\b/.test(t)) { fenster(); sagen('Hier sind deine Pakete.'); return true; }
        if (/^(?:wo|wann|was|wie|ist|kommt|bleibt|status)\b/.test(t) || /^(?:paketstatus|paket status|sendungsverfolgung|pakete|paket)$/.test(t) || /\bpaketstatus\b/.test(t)) {
            if (/\b(?:fernsehen|film|kino)\b/.test(t)) return next(text);
            alleStatus(); return true;
        }
        return next(text);
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('pakete', befehl, 43);

    /* ---------- Hintergrund: beim Öffnen und alle 30 Minuten nachsehen, Zustellung ansagen ---------- */
    let letzter = 0;
    async function nachsehen() {
        try {
            if (document.visibilityState !== 'visible' || Date.now() - letzter < 30 * 60000) return;
            const a = aufraeumen(laden()).filter(function (p) { return p.code !== 'delivered'; });
            if (!a.length) return;
            letzter = Date.now();
            const alle = aufraeumen(laden());
            for (const p of a) {
                const q = alle.find(function (x) { return x.nr === p.nr; }); if (!q) continue;
                const r = await abfragen(q.nr);
                if (!r.daten) { if (r.fehlt) return; continue; }
                const vorher = q.code;
                const geaendert = uebernehmen(q, r.daten);
                if (geaendert && q.code === 'delivered') { hinweis('📦 ' + satz(q)); sagen(satz(q)); }
                else if (geaendert && vorher && /zustellung|zustell/i.test(q.beschr || q.status || '')) hinweis('📦 ' + satz(q));
            }
            speichern(alle);
        } catch (e) { }
    }
    document.addEventListener('visibilitychange', function () { setTimeout(nachsehen, 1500); });
    setTimeout(nachsehen, 9000);
    window.jvPakete = { oeffnen: fenster, schliessen: fensterZu };
})();
