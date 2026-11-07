/* ============================================================
   REGISTRY-FÄHIGKEIT "produktsuche" (Phase 3): lesendes Werkzeug für die Chef-KI.
   Es gibt KEINE zweite Produktsuche: das Werkzeug ruft js/produktkarten.js (window.jvProdukte.chefSuche) auf, und das nutzt die vorhandene Preissuche
   (window.jvPreisAngebote = js/preissuche.js -> /api/maps?action=shopping, mit den gezielten Händlerlinks). Gleiche Prüfungen wie bei den Produktkarten:
   ein Angebot zählt nur, wenn sein Titel zum Produkt passt; Preisvergleichsseiten (Idealo ...) sind nie ein Händler; Händlername, Preis und Link bleiben im selben Angebot.
   Rückgabe (daten): produkte = [{ name, angebote:[{ shop, preis, preisText, link, linkArt }], vergleich, bild, suchfehler }], nachricht (gesprochener Satz), cards (Produktkarten).
   Die Chef-KI darf das Werkzeug nur lesend nutzen (chef.js: FREIGEGEBEN/LESEND). Preise und Händler stammen ausschließlich aus den Suchergebnissen, nie vom Modell.
   ============================================================ */
(function () {
    'use strict';
    var R = window.jvRegistry;
    if (!R || R.namen().indexOf('produktsuche') >= 0) return;

    function euroWort(n) { return (Math.round(n * 100) / 100).toFixed(2).replace('.', ',') + ' Euro'; }
    function gueltig(a) { return !!a && typeof a.shop === 'string' && a.shop.trim() !== '' && typeof a.preis === 'number' && isFinite(a.preis) && a.preis > 0; }

    /* Gesprochener Satz NUR aus geprüften Angeboten; ohne Treffer ehrlich, ohne Link ausdrücklich. */
    function satzBauen(items) {
        var teile = [], ohneLinkAlle = true, hatAngebot = false;
        items.forEach(function (it) {
            var gut = (it.angebote || []).filter(gueltig);
            if (it.suchfehler) { teile.push('Die Preissuche für ' + it.name + ' hat nicht geklappt.'); return; }
            if (!gut.length) { teile.push('Zu ' + it.name + ' habe ich kein verlässliches Angebot gefunden.'); return; }
            hatAngebot = true;
            var b = gut[0], s = it.name + ': am günstigsten bei ' + b.shop + ' für ' + euroWort(b.preis) + '.';
            if (gut[1]) s += ' Danach ' + gut[1].shop + ' für ' + euroWort(gut[1].preis) + '.';
            teile.push(s);
            if (gut.some(function (a) { return !!a.link; })) ohneLinkAlle = false;
        });
        if (hatAngebot) teile.push(ohneLinkAlle ? 'Einen direkten Händlerlink habe ich nicht gefunden.' : 'Die Karten zeigen die Angebote mit Link, soweit einer gefunden wurde.');
        return teile.join(' ');
    }

    R.registriere({
        name: 'produktsuche',
        beschreibung: 'Sucht zu einem Produkt (Hersteller und Modell oder eine Warenart, zum Beispiel "Grohe BauEdge Wasserhahn") die aktuellen Preise mit Händler und Kauflink im Internet. Je Produkt ein Schritt, höchstens zwei. Nur Produktnamen verwenden, die der Nutzer genannt hat.',
        pflicht: [{ name: 'suchbegriff', typ: 'text', beschreibung: 'Das gesuchte Produkt, so wie der Nutzer es nennt.' }],
        optional: [],
        rueckgabe: { beschreibung: 'Produkt mit Angeboten (Händler, Preis, Link), ein gesprochener Satz und Produktkarten.', felder: ['produkte', 'nachricht', 'cards'] },
        fehler: [
            { status: 'NO_RESULTS', wann: 'Zu dem Produkt wurde kein verlässliches Angebot gefunden.' },
            { status: 'TOOL_FAILED', wann: 'Die Preissuche ist ausgefallen oder nicht erreichbar.' },
            { status: 'NEEDS_INFORMATION', wann: 'Kein Produkt angegeben.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Produktsuche ist in dieser Umgebung nicht geladen.' }
        ],
        fallbacks: [],   // bewusst keiner: Preise aus einer freien Internetantwort wären nicht an Händler und Link gebunden
        bestaetigung: { noetig: false, grund: 'Reine Auskunft ohne Änderung von Daten.' },
        pruefeErfolg: function (d) {
            if (!d || !Array.isArray(d.produkte) || typeof d.nachricht !== 'string' || !d.nachricht.trim()) return false;
            return d.produkte.some(function (p) {
                var g = ((p && p.angebote) || []).filter(gueltig)[0];
                return !!g && d.nachricht.indexOf(g.shop) >= 0 && d.nachricht.indexOf(euroWort(g.preis)) >= 0;   // der gesprochene Preis gehört wirklich zu diesem Händler
            });
        },
        verbindung: { datei: 'js/produktkarten.js', funktion: 'jvProdukte.chefSuche' },
        verfuegbar: function () { return !!window.jvProdukte && typeof window.jvProdukte.chefSuche === 'function' && typeof window.jvPreisAngebote === 'function'; },
        leer: function (d) { return !!d && Array.isArray(d.produkte) && d.produkte.length > 0 && d.produkte.every(function (p) { return !((p && p.angebote) || []).some(gueltig); }); },
        ausfuehren: async function (p, kontext) {
            var r = await window.jvProdukte.chefSuche([String(p.suchbegriff)], kontext && kontext.text);
            var items = r.items || [];
            if (!items.length || items.every(function (i) { return i.suchfehler; })) { var e = new Error('Preissuche fehlgeschlagen'); e.userMessage = 'Die Preissuche hat gerade nicht geklappt.'; throw e; }
            var produkte = items.map(function (i) { return { name: i.name, angebote: (i.angebote || []).filter(gueltig), vergleich: i.vergleich || [], bild: i.bild || '', suchfehler: !!i.suchfehler }; });
            var nachricht = satzBauen(produkte);
            return { produkte: produkte, nachricht: nachricht, reply: nachricht, cards: r.karten || [] };
        }
    });
})();
