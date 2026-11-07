/* ============================================================
   PRODUKTKARTEN: Empfiehlt Jarvis konkrete Produkte ("Ich suche zwei schöne Wasserhähne für mein Badezimmer"), bleiben sie als STRUKTURIERTE Ergebnisse erhalten
   und erscheinen als Karten mit Bild, vollständigem Namen, Händlern, Preisen und anklickbaren Links. Anschlussfragen ("Wo kann ich sie kaufen?", "Was kosten die?",
   "Welches ist günstiger?", "Zeig mir das zweite") beziehen sich auf genau diese Produkte und werden aus den gespeicherten Daten beantwortet, ohne Sprachmodell.

   Ablauf
     1. assistant.js: nach der gesprochenen Antwort auf einen Produktwunsch ruft es nachAntwort(frage, antwort) auf.
     2. Ein kleiner Groq-Aufruf (nur Auslesen) liefert die in der ANTWORT ausdrücklich genannten Produkte. Jeder Name wird gegen den Antworttext geprüft (nichts wird erfunden).
     3. Je Produkt läuft die vorhandene Preissuche (window.jvPreisAngebote = js/preissuche.js, /api/maps?action=shopping). Ein Angebot zählt nur, wenn sein Titel
        die unterscheidenden Wörter des Produktnamens enthält. Bild, Händler, Preis und Link kommen nur aus diesen geprüften Angeboten.
     4. Die Produkte werden im Gesprächsgedächtnis (window.jvGespraech, Liste 'produkte') gemerkt und als Karten gezeigt. Fehlt Bild, Preis oder Angebot, steht das ausdrücklich da.
     5. istFolgefrage(text) / folgefrage(text): Anschlussfragen zu den zuletzt gezeigten Produkten (nur wenn sie das jüngste Thema sind).

   window.jvProdukte.wunsch(text)          true: der Satz klingt nach einem Produktwunsch (nur eine Vorauswahl; die Auslese entscheidet)
   .nachAntwort(frage, antwort)            Promise: Auslese, Preissuche, Merken, Karten zeigen (nichts, wenn keine Produkte genannt wurden oder inzwischen etwas anderes gefragt wurde)
   .istFolgefrage(text)                    true: Anschlussfrage zu den gemerkten Produkten (sofort, ohne Netz)
   .folgefrage(text)                       Promise: { reply, karten } aus den gespeicherten Daten (fehlende Angebote werden einmal nachgesucht), sonst null
   .karte(produkt)                         Kartendaten (c.html) für showActionCards
   Kein Langzeitgedächtnis, kein localStorage; alles nur im Arbeitsspeicher (jvGespraech, 10 Minuten).
   ============================================================ */
(function () {
    'use strict';
    if (window.jvProdukte) return;

    var MAX_PRODUKTE = 4, MAX_ANGEBOTE = 3;
    var letzte = null;   // { frage, zeit }: zu welcher Frage die gemerkten Produkte gehören

    function G() { return window.jvGespraech || null; }
    function A() { return window.jvAnschlussAntwort || null; }
    function ohneUml(s) { return String(s == null ? '' : s).toLowerCase().replace(/ä/g, 'a').replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ß/g, 'ss'); }
    function norm(s) { return ohneUml(s).replace(/[^a-z0-9]+/g, ' ').trim(); }
    function esc(s) { return (typeof window.escapeHtml === 'function') ? window.escapeHtml(String(s == null ? '' : s)) : String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
    function woerter(t) { return norm(t).split(' ').filter(Boolean); }
    function tokens(name) { return woerter(name).filter(function (w) { return w.length >= 3 || /\d/.test(w); }); }
    function imText(name, text) { var t = ' ' + norm(text) + ' ', tk = tokens(name); return tk.length > 0 && tk.every(function (w) { return t.indexOf(w) >= 0; }); }
    function passt(name, titel) { var t = ' ' + norm(titel) + ' ', tk = tokens(name); if (!tk.length) return false; var n = tk.filter(function (w) { return t.indexOf(w) >= 0; }).length; return n / tk.length >= 0.6 && n >= 1; }
    function vergleichsLink(q) { return 'https://www.idealo.de/preisvergleich/MainSearchProductCategory.html?q=' + encodeURIComponent(String(q || '').slice(0, 120)); }
    function eur(p) { return (Math.round(p * 100) / 100).toFixed(2).replace('.', ',') + ' €'; }

    /* ---- Vorauswahl: klingt der Satz nach einem Produktwunsch? ---- */
    var RX_WUNSCH = /\b(?:empfehl\w*|empfiehl\w*|vorschl\w*|such\w*|brauch\w*|zeig\w*|tipp\w*|kaufen|kauf|welche\w*|beste\w*|gute\w*|sch[oö]ne\w*|g[uü]nstige\w*)\b/i;
    var RX_ANDERES = /\b(?:einkaufsliste|liste|termin\w*|erinner\w*|wetter|fahrzeit|route|navigier\w*|anruf\w*|mail\w*|nachricht\w*|kalender|fernseh\w*|kino|film\w*|restaurant\w*|apotheke|tankstelle|bahn|zug|schl[uü]ssel|handy suchen)\b/i;
    function wunsch(text) {
        var t = String(text == null ? '' : text).trim();
        if (!t || woerter(t).length < 3) return false;
        if (!RX_WUNSCH.test(t) || RX_ANDERES.test(t)) return false;
        try { if (A() && A().reinerBezug(t)) return false; } catch (e) { }   // "Wo kann ich sie kaufen?" ist eine Anschlussfrage, kein neuer Wunsch
        return true;
    }

    /* ---- Auslese: welche konkreten Produkte nennt die Antwort? ---- */
    var SYSTEM_AUSLESE = 'Produkt-Auslese. Du bekommst eine Frage und eine Antwort. Nenne die in der ANTWORT ausdrücklich genannten konkreten Produkte (kaufbare Waren mit Hersteller und Modell, zum Beispiel „Grohe Eurosmart“). ' +
        'Übernimm Namen nur so, wie sie in der Antwort stehen. Erfinde nichts, ergänze nichts, nenne keine Produktarten ohne Modell (nicht „ein Wasserhahn“), keine Händler, keine Orte. Höchstens ' + MAX_PRODUKTE + ' Produkte. ' +
        'Antworte NUR mit JSON: {"produkte":[{"name":"Hersteller Modell","hersteller":"Hersteller"}]}. Nennt die Antwort keine konkreten Produkte, antworte {"produkte":[]}.';
    async function auslesen(frage, antwort) {
        var res = await apiFetch('/api/groq', { method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: SYSTEM_AUSLESE }, { role: 'user', content: 'Frage: ' + String(frage).slice(0, 300) + '\nAntwort: ' + String(antwort).slice(0, 1200) }] }) });
        if (!res.ok) return [];
        var d = await res.json(), j = JSON.parse(d.choices[0].message.content), l = Array.isArray(j && j.produkte) ? j.produkte : [], out = [], gesehen = {};
        l.forEach(function (p) {
            var name = String((p && p.name) || '').replace(/\s+/g, ' ').trim();
            if (name.length < 3 || name.length > 80 || !imText(name, antwort)) return;   // nur, was wirklich in der Antwort steht
            var k = norm(name); if (!k || gesehen[k]) return; gesehen[k] = 1;
            out.push({ name: name, hersteller: String((p && p.hersteller) || '').slice(0, 60) });
        });
        return out.slice(0, MAX_PRODUKTE);
    }

    /* ---- Preissuche je Produkt (vorhandene Suche), nur geprüfte Angebote ---- */
    async function sucheEins(p) {
        var item = { name: p.name, hersteller: p.hersteller || '', beschreibung: p.hersteller || '', angebote: [], bild: '', suchfehler: false };
        try {
            var roh = await window.jvPreisAngebote(p.name), gut = [];
            (Array.isArray(roh) ? roh : []).forEach(function (a) {
                if (!a || !(a.preis > 0) || a.markt || !passt(p.name, a.titel)) return;
                gut.push(a);
            });
            gut.sort(function (x, y) { return x.preis - y.preis; });
            item.angebote = gut.slice(0, MAX_ANGEBOTE).map(function (a) { return { shop: String(a.shop || ''), preis: a.preis, preisText: String(a.preisText || eur(a.preis)), link: /^https?:\/\//i.test(String(a.link || '')) ? String(a.link) : '' }; });
            var mitBild = gut.filter(function (a) { return typeof a.bild === 'string' && /^https:\/\//i.test(a.bild); })[0];
            if (mitBild) item.bild = mitBild.bild;
        } catch (e) { item.suchfehler = true; }
        if (item.angebote.length) { item.preis = item.angebote[0].preis; item.preisText = item.angebote[0].preisText; item.shop = item.angebote[0].shop; if (item.angebote[0].link) item.link = item.angebote[0].link; }
        return item;
    }

    /* ---- Karte ---- */
    function karte(it) {
        var bild = it.bild ? '<img src="' + esc(it.bild) + '" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.style.display=\'none\'" style="width:76px;height:76px;object-fit:contain;background:#fff;border-radius:8px;flex:none">' : '';
        var zeilen = '';
        if (it.angebote && it.angebote.length) {
            zeilen = it.angebote.map(function (a) {
                var href = a.link || vergleichsLink(it.name);
                return '<a href="' + esc(href) + '" target="_blank" rel="noopener" style="display:block;color:#7dff9b;font-weight:700;text-decoration:none;margin-top:3px">' + esc(a.shop || 'Händler') + ' · ' + esc(a.preisText || eur(a.preis)) + (a.link ? '' : ' (Preisvergleich)') + ' ›</a>';
            }).join('');
        } else {
            zeilen = '<span style="display:block;color:#fbbf24;font-size:12px;margin-top:3px">' + (it.suchfehler ? 'Die Preissuche hat nicht geklappt.' : 'Kein verlässliches Angebot gefunden.') + '</span>' +
                '<a href="' + esc(vergleichsLink(it.name)) + '" target="_blank" rel="noopener" style="display:block;color:#7dff9b;font-weight:700;text-decoration:none;margin-top:3px">Preise vergleichen ›</a>';
        }
        var hinweis = it.bild ? '' : '<span style="display:block;color:#94a3b8;font-size:11px;margin-top:3px">Kein Produktbild gefunden.</span>';
        return { html: '<div style="display:flex;gap:10px;align-items:flex-start">' + bild + '<div style="min-width:0;flex:1"><b style="display:block;color:#49d7ff;font-size:14px">' + esc(it.name) + '</b>' + zeilen + hinweis + '</div></div>', rand: 'rgba(125,255,155,.35)', produkt: it.name };
    }

    function zeigeKarten(karten) { try { if (typeof window.showActionCards === 'function') window.showActionCards(karten); } catch (e) { } }

    /* ---- nach der Antwort: Auslese, Preissuche, Merken, Karten ---- */
    var lauf = null;
    function nachAntwort(frage, antwort) {
        lauf = (async function () {
            try {
                if (!wunsch(frage) || String(antwort || '').trim().length < 40 || typeof window.jvPreisAngebote !== 'function') return null;
                var namen = await auslesen(frage, antwort);
                if (!namen.length) return null;
                var items = await Promise.all(namen.map(sucheEins));
                if (window.jvLetzterText !== undefined && window.jvLetzterText !== frage) return null;   // inzwischen wurde etwas anderes gefragt: keine fremden Karten einblenden
                var g = G(); if (!g) return null;
                g.ergebnisse('produkte', items, 'produktkarten');
                letzte = { frage: norm(frage) };
                var karten = items.map(karte);
                zeigeKarten(karten);
                return { items: items, karten: karten };
            } catch (e) { return null; }
        })();
        return lauf;
    }

    /* ---- Anschlussfragen ---- */
    var RX_KAUF = /\b(?:kauf\w*|bekomm\w*|krieg\w*|bestell\w*|gibt|erh[aä]lt\w*|h[aä]ndler\w*|shop\w*|angebot\w*|kost\w*|preis\w*|teuer\w*|bezahl\w*)\b/i;
    var RX_VGL = /\b(?:g[uü]nstiger|billiger|preiswerter|g[uü]nstigste\w*|billigste\w*|teurer|teuerste\w*)\b/i;
    var RX_ZEIG = /\b(?:zeig\w*|anzeigen|nochmal|noch einmal)\b/i;
    var NR = { erste: 1, zweite: 2, dritte: 3, vierte: 4 };
    var RX_NR = /\b(?:das|den|die|der|dem)\s+(erste|zweite|dritte|vierte|letzte)n?\b/i;
    var RX_ALLE = /\b(?:beide[nrm]?|alle[nrm]?|jede[nrm]?)\b/i;

    function aktuell() {   // die gemerkten Produkte, wenn sie das jüngste Thema sind
        try {
            var g = G(); if (!g || !letzte) return null;
            var l = g.liste(); if (!l || l.art !== 'produkte' || l.veraltet || !l.items.length) return null;
            var ant = g.antworten();
            for (var i = 0; i < ant.length; i++) {
                if (ant[i].alterMs < l.alterMs) {   // jünger als die Produkte
                    if (A() && A().anschluss(ant[i].frage)) continue;       // Antwort auf eine Anschlussfrage: gleiches Thema
                    if (norm(ant[i].frage) === letzte.frage) continue;
                    return null;                                            // ein anderes Thema ist jünger
                }
            }
            return l;
        } catch (e) { return null; }
    }
    function ziele(text, items) {
        var t = String(text), m = RX_NR.exec(t);
        if (m) { var w = m[1].toLowerCase(), n = w === 'letzte' ? items.length : NR[w]; return n >= 1 && n <= items.length ? { liste: [items[n - 1]] } : { ausserhalb: true }; }
        var treffer = items.filter(function (it) { return tokens(it.name).some(function (w) { return w.length >= 4 && (' ' + norm(t) + ' ').indexOf(' ' + w + ' ') >= 0 && !/^(?:wasserhahn|armatur|produkt)$/.test(w); }); });
        if (treffer.length === 1) return { liste: treffer };
        if (treffer.length > 1 && treffer.length < items.length) return { liste: treffer };
        return { liste: items };   // kein bestimmtes Produkt genannt: alle gezeigten
    }
    function absicht(text) { return RX_VGL.test(text) ? 'vergleich' : (RX_KAUF.test(text) ? 'kauf' : ((RX_ZEIG.test(text) || /^\s*(?:und\s+)?(?:das|den|die)\s+(?:erste|zweite|dritte|vierte|letzte)n?\??\s*$/i.test(text)) ? 'zeig' : '')); }
    function hatBezug(text, items) {
        if (RX_NR.test(text) || RX_ALLE.test(text)) return true;
        try { if (A() && A().reinerBezug(text)) return true; } catch (e) { }
        return items.some(function (it) { return tokens(it.name).some(function (w) { return w.length >= 4 && (' ' + norm(text) + ' ').indexOf(' ' + w + ' ') >= 0; }); });
    }
    function istFolgefrage(text) {
        try {
            var t = String(text == null ? '' : text).trim();
            if (!t || woerter(t).length > 12) return false;
            var l = aktuell(); if (!l) return false;
            return absicht(t) !== '' && hatBezug(t, l.items);
        } catch (e) { return false; }
    }

    function angebotSatz(it) {
        if (!it.angebote || !it.angebote.length) return 'Zu ' + it.name + ' habe ich gerade kein verlässliches Angebot gefunden.';
        return it.name + ' gibt es ' + it.angebote.slice(0, 2).map(function (a) { return 'bei ' + (a.shop || 'einem Händler') + ' für ' + (a.preisText || eur(a.preis)); }).join(', ') + '.';
    }
    async function folgefrage(text) {
        try {
            var l = aktuell(); if (!l) return null;
            var z = ziele(text, l.items), art = absicht(text);
            if (z.ausserhalb) {
                return { reply: 'Ich habe nur ' + l.items.length + ' Produkt' + (l.items.length === 1 ? '' : 'e') + ': ' + l.items.map(function (it, i) { return (i + 1) + ': ' + it.name; }).join(', ') + '. Welches meinst du?', karten: [] };
            }
            var ziel = z.liste;
            // fehlende Angebote einmal nachsuchen (die erste Suche kann ausgefallen sein)
            if (art !== 'zeig' && typeof window.jvPreisAngebote === 'function') {
                for (var i = 0; i < ziel.length; i++) {
                    if ((!ziel[i].angebote || !ziel[i].angebote.length) && !ziel[i].nachgesucht) {
                        var neu = await sucheEins({ name: ziel[i].name, hersteller: ziel[i].hersteller });
                        neu.nachgesucht = true;
                        ziel[i] = neu;
                        for (var k = 0; k < l.items.length; k++) if (l.items[k].name === neu.name) l.items[k] = neu;
                    }
                }
                var g = G(); if (g) g.ergebnisse('produkte', l.items, 'produktkarten');
            }
            var karten = ziel.map(karte), reply;
            if (art === 'vergleich') {
                var mit = ziel.filter(function (it) { return it.angebote && it.angebote.length; }).sort(function (a, b) { return a.angebote[0].preis - b.angebote[0].preis; });
                if (ziel.length < 2) reply = 'Du hast nur ein Produkt gewählt, da gibt es nichts zu vergleichen. ' + angebotSatz(ziel[0]);
                else if (mit.length === 0) reply = 'Ich habe zu keinem der Produkte einen verlässlichen Preis gefunden, deshalb kann ich sie nicht vergleichen.';
                else if (mit.length === 1) reply = 'Nur zu ' + mit[0].name + ' habe ich einen Preis: ' + mit[0].angebote[0].preisText + ' bei ' + (mit[0].angebote[0].shop || 'einem Händler') + '. Die anderen kann ich deshalb nicht vergleichen.';
                else reply = 'Am günstigsten ist ' + mit[0].name + ' mit ' + mit[0].angebote[0].preisText + ' bei ' + (mit[0].angebote[0].shop || 'einem Händler') + ', danach ' + mit[1].name + ' mit ' + mit[1].angebote[0].preisText + (mit.length < ziel.length ? '. Zu den übrigen habe ich keinen Preis.' : '.');
            } else if (art === 'zeig') {
                reply = ziel.length === 1 ? 'Hier ist ' + ziel[0].name + '.' : 'Hier sind ' + ziel.map(function (it) { return it.name; }).join(' und ') + '.';
            } else {
                reply = ziel.map(angebotSatz).join(' ');
                if (karten.length) reply += ' Die Angebote siehst du als Karten.';
            }
            return { reply: reply, karten: karten };
        } catch (e) { return null; }
    }

    window.jvProdukte = { wunsch: wunsch, nachAntwort: nachAntwort, istFolgefrage: istFolgefrage, folgefrage: folgefrage, karte: karte, auslesen: auslesen, lauf: function () { return lauf; } };
})();
