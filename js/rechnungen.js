/* ============================================================
   RECHNUNGEN IM BLICK: Jarvis merkt sich jede fotografierte oder als PDF ausgewertete Rechnung/Mahnung (Absender, Betrag, Zahlungsziel)
   und behält sie im Blick, bis du sie als bezahlt meldest. Die Erinnerung zum Zahlungsziel legt weiter foto_brief.js an.
   Sprache:
   - "Welche Rechnungen sind offen?", "Rechnungen im Blick", "Wie viel muss ich noch zahlen?" -> Jarvis nennt Anzahl, Summe und die nächste Fälligkeit; Karten je Rechnung mit "Bezahlt".
   - "Die Rechnung von 1&1 ist bezahlt" / "Ich habe die Rechnung von Vodafone bezahlt" -> wird abgehakt.
   Zusätzlich kennt die KI die offenen Rechnungen (Kontext "rechnungen_offen") und kann sie beiläufig erwähnen, wenn eine bald fällig ist.
   Gespeichert wird nur auf dem Gerät (localStorage "jv_rechnungen"); bezahlte Rechnungen verschwinden nach 30 Tagen.
   Braucht: commands.js (jvCommands), optional speak(), showActionCards() (places.js), jvChain (buildSystemPrompt). foto_brief.js ruft window.jvRechnungen.merken(L) auf.
   ============================================================ */
(function () {
    'use strict';
    const KEY = 'jv_rechnungen';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    function load() { try { const a = JSON.parse(lsGet(KEY)); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function save(a) { lsSet(KEY, JSON.stringify(a.slice(-60))); }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function tage(iso) { return Math.round((new Date(iso + 'T12:00:00Z') - new Date(heute() + 'T12:00:00Z')) / 86400000); }
    function euro(n) { return Number(n).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' Euro'; }
    function tagText(iso) { try { return new Date(iso + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }); } catch (e) { return iso; } }
    const norm = s => String(s || '').toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss').replace(/[^a-z0-9]/g, '');
    function sagen(t) { try { if (typeof speak === 'function') speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    function aufraeumen(l) {
        const grenze = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
        return l.filter(r => !(r.bezahlt && String(r.bezahlt) < grenze));
    }
    function offen() {
        return aufraeumen(load()).filter(r => !r.bezahlt).sort((a, b) => String(a.ziel || '9999').localeCompare(String(b.ziel || '9999')));
    }

    /* ---------- Merken (aus foto_brief.js) ---------- */
    function merken(L) {
        try {
            if (!L || (L.typ !== 'rechnung' && L.typ !== 'mahnung')) return false;
            if (!L.betrag && !L.zahlungsziel) return false;
            const absender = String(L.absender || 'Unbekannt').slice(0, 60);
            const ziel = /^\d{4}-\d{2}-\d{2}$/.test(String(L.zahlungsziel || '')) ? L.zahlungsziel : null;
            const betrag = Number(L.betrag) > 0 ? Number(L.betrag) : null;
            const key = norm(absender) + '|' + (betrag || '') + '|' + (ziel || '');
            const l = aufraeumen(load());
            const ex = l.find(r => r.key === key);
            if (ex) { ex.typ = L.typ; ex.gesehen = heute(); if (ex.bezahlt) ex.bezahlt = false; }
            else l.push({ id: 'rg_' + Date.now().toString(36), key, absender, betrag, ziel, typ: L.typ, gesehen: heute(), bezahlt: false });
            save(l);
            return true;
        } catch (e) { return false; }
    }
    function bezahlt(id) {
        const l = load(), r = l.find(x => x.id === id);
        if (!r) return false;
        r.bezahlt = heute();
        save(l);
        return r;
    }
    window.jvRechnungBezahlt = function (id) {
        const r = bezahlt(id);
        if (r) { sagen('Gut, die Rechnung von ' + r.absender + ' ist abgehakt.'); try { zeigen(false); } catch (e) {} }
    };
    window.jvRechnungen = { merken, offen, bezahlt };

    /* ---------- Anzeigen und Vorlesen ---------- */
    function wannText(r) {
        if (!r.ziel) return 'ohne bekanntes Zahlungsziel';
        const d = tage(r.ziel);
        if (d < 0) return 'seit ' + (-d) + (d === -1 ? ' Tag' : ' Tagen') + ' überfällig';
        if (d === 0) return 'heute fällig';
        if (d === 1) return 'morgen fällig';
        return 'fällig am ' + tagText(r.ziel) + ', in ' + d + ' Tagen';
    }
    function zeigen(vorlesen) {
        const l = offen();
        if (!l.length) {
            if (vorlesen) sagen('Ich habe keine offenen Rechnungen vermerkt. Fotografieren Sie eine Rechnung, dann merke ich sie mir.');
            return;
        }
        const summe = l.reduce((s, r) => s + (r.betrag || 0), 0);
        const ueber = l.filter(r => r.ziel && tage(r.ziel) < 0).length;
        const n = l[0];
        let s = 'Sie haben ' + l.length + (l.length === 1 ? ' offene Rechnung' : ' offene Rechnungen') + (summe ? ' über zusammen ' + euro(summe) : '') + '.';
        s += ' Als Nächstes: ' + n.absender + (n.betrag ? ' über ' + euro(n.betrag) : '') + ', ' + wannText(n) + '.';
        if (ueber && !(n.ziel && tage(n.ziel) < 0 && ueber === 1)) s += ' ' + ueber + (ueber === 1 ? ' ist' : ' sind') + ' überfällig.';
        if (vorlesen) sagen(s);
        try {
            if (typeof showActionCards === 'function') showActionCards(l.slice(0, 8).map(r => ({
                icon: r.ziel && tage(r.ziel) < 0 ? '⚠️' : '🧾',
                title: r.absender + (r.betrag ? ' · ' + euro(r.betrag) : ''),
                subtitle: wannText(r) + ' · tippen = bezahlt',
                onclick: "jvRechnungBezahlt('" + r.id + "')"
            })));
        } catch (e) {}
    }

    /* ---------- Sprache ---------- */
    const LIST_RXS = [
        /(?:^|\s)rechnungen?\b.*\b(?:offen\w*|ausstehend\w*|unbezahlt\w*|im blick|übersicht|überblick)\b/,
        /\b(?:offene|ausstehende|unbezahlte)\s+rechnungen\b/,
        /^(?:zeig(?:e)?\s+(?:mir\s+)?)?(?:meine\s+|die\s+)?rechnungen$/,
        /\bwie\s+viel\w*\s+(?:muss|soll)\s+ich\s+(?:denn\s+)?(?:noch\s+)?(?:zahlen|bezahlen)\b/,
        /\bwas\s+muss\s+ich\s+(?:denn\s+)?(?:noch\s+)?(?:zahlen|bezahlen)\b/
    ];
    const PAID_RXS = [
        /(?:^|\s)rechnung\s+(?:von|vom|der|bei|an)\s+(.+?)\s+(?:ist\s+|wurde\s+)?(?:schon\s+)?(?:bezahlt|beglichen|überwiesen|erledigt)$/,
        /^(?:ich\s+habe\s+)?(?:die\s+|meine\s+)?rechnung\s+(?:von|vom|der|bei|an)\s+(.+?)\s+(?:schon\s+)?(?:bezahlt|beglichen|überwiesen)$/,
        /^(?:die\s+)?(.+?)\s*-?\s*rechnung\s+(?:ist\s+|wurde\s+)?(?:schon\s+)?(?:bezahlt|beglichen|überwiesen|erledigt)$/
    ];
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 90 || !/rechnung|zahlen/.test(t)) return false;
        for (const rx of PAID_RXS) {
            const m = t.match(rx);
            if (!m) continue;
            const k = norm(m[1]);
            if (k.length < 2) continue;
            const hit = offen().find(r => { const a = norm(r.absender); return a && (a.includes(k) || k.includes(a)); });
            if (!hit) { sagen('Eine offene Rechnung von ' + m[1] + ' habe ich nicht vermerkt.'); return true; }
            bezahlt(hit.id);
            sagen('Gut, die Rechnung von ' + hit.absender + (hit.betrag ? ' über ' + euro(hit.betrag) : '') + ' ist abgehakt.');
            return true;
        }
        if (LIST_RXS.some(r => r.test(t))) { zeigen(true); return true; }
        return false;
    }
    window.handleRechnungenCommand = handle;
    if (window.jvCommands) {
        window.jvCommands.use('rechnungen', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Rechnungen', e); }
            return next(text);
        }, 150);
    }

    /* ---------- Kontext für die KI ---------- */
    if (window.jvChain) {
        window.jvChain.use('buildSystemPrompt', 'rechnungen', function (next) {
            let base = next();
            try {
                const l = offen().slice(0, 6);
                if (l.length) base += '\n\nrechnungen_offen (nur erwähnen, wenn der User nach Rechnungen, Post oder Geld fragt, oder wenn eine in den nächsten 3 Tagen fällig oder überfällig ist; sonst nicht): ' +
                    JSON.stringify(l.map(r => ({ von: r.absender, betrag: r.betrag, faellig: r.ziel, in_tagen: r.ziel ? tage(r.ziel) : null })));
            } catch (e) {}
            return base;
        }, 210);
    }
})();
