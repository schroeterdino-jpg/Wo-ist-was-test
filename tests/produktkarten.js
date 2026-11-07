/* ============================================================
   TESTS "Produktkarten" (Einkaufserfahrung). Start: node tests/produktkarten.js
   Ganze Kette mit der echten App (echte Skripte; Netz, Groq und der Preisdienst sind Attrappen):
     Sprachfrage -> KI/Internetsuche -> Auslese der genannten Produkte -> Preissuche -> gemerkte Produkte -> sichtbare Karten -> Anschlussfrage -> Händlerangebote -> Links
   Die Attrappe verhält sich wie der Handytest: auf "Ich suche zwei schöne Wasserhähne für mein Badezimmer." startet das Modell "web_lookup"; auf "Wo kann ich sie kaufen?" würde es
   eine Einkaufslisten-Aktion anlegen und nach dem Produkt fragen - das darf nie zum Zug kommen.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const antwort = (d, o) => Object.assign({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d), headers: { get: () => null } }, o || {});
const tick = () => new Promise(r => setImmediate(r));

const Q1 = 'Ich suche zwei schöne Wasserhähne für mein Badezimmer.';
const Q2 = 'Wo kann ich sie kaufen?';
const WEB1 = 'Zwei gute Kandidaten sind der Grohe Eurosmart, schlicht und zuverlässig, und der Hansgrohe Talis S, der etwas höher baut.';
const BILD1 = 'https://shop-bilder.example/grohe-eurosmart.jpg', BILD2 = 'https://shop-bilder.example/talis-s.jpg';

const ANG = {
    'Grohe Eurosmart': [
        { titel: 'GROHE Eurosmart Einhand-Waschtischbatterie', shop: 'Baumarkt24', preisText: '64,90 €', preis: 64.9, link: 'https://baumarkt24.example/grohe-eurosmart', bild: BILD1 },
        { titel: 'Grohe Eurosmart Waschtischarmatur chrom', shop: 'Sanitär-Direkt', preisText: '69,50 €', preis: 69.5, link: 'https://sanitaer-direkt.example/eurosmart', bild: '' },
        { titel: 'Grohe Eurosmart Armatur', shop: 'Onlinehandel', preisText: '72,00 €', preis: 72, link: 'https://onlinehandel.example/e', bild: '' },
        { titel: 'Völlig anderes Produkt Duschkopf', shop: 'Fremdshop', preisText: '9,99 €', preis: 9.99, link: 'https://fremd.example/duschkopf', bild: 'https://fremd.example/x.jpg' }
    ],
    'Hansgrohe Talis S': [
        { titel: 'Hansgrohe Talis S Waschtischmischer 72020000', shop: 'Bad-Welt', preisText: '129,00 €', preis: 129, link: 'https://bad-welt.example/talis-s', bild: BILD2 }
    ]
};

/* opt.angebote: Name -> Liste (Standard ANG); opt.webText; opt.auslese: Antwort der Auslese (Standard beide Produkte); opt.modell: Verhalten bei Anschlussfragen */
function neu(opt) {
    opt = opt || {};
    const log = { groq: [], shop: [], web: 0, auslese: 0 };
    const app = starte({
        jetzt: '2026-11-07T18:30:00+01:00', festerZufall: true,
        fetch: async (u, o) => {
            u = String(u);
            if (/action=shopping/.test(u)) {
                const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || '');
                log.shop.push(q);
                if (opt.shopFehler) return antwort({ error: 'Preis-Dienst antwortet mit 500' }, { ok: false, status: 502 });
                const tab = opt.angebote || ANG;
                const key = Object.keys(tab).find(k => q.toLowerCase().indexOf(k.toLowerCase()) >= 0);
                return antwort({ angebote: key ? tab[key] : [] });
            }
            if (!/\/api\/groq/.test(u)) throw new Error('offline (Attrappe): ' + u);
            const b = JSON.parse(o.body);
            const sys = String(b.messages[0].content), letzte = String(b.messages[b.messages.length - 1].content);
            if (/^Produkt-Auslese/.test(sys)) {
                log.auslese++;
                const j = opt.auslese !== undefined ? opt.auslese : { produkte: [{ name: 'Grohe Eurosmart', hersteller: 'Grohe' }, { name: 'Hansgrohe Talis S', hersteller: 'Hansgrohe' }] };
                return antwort({ choices: [{ message: { content: JSON.stringify(j) } }] });
            }
            if (Array.isArray(b.tools) && b.tools.length) { log.web++; return antwort({ choices: [{ message: { content: opt.webText || WEB1 } }] }); }
            log.groq.push({ system: sys, letzte });
            const erste = letzte.split('\n')[0];
            let reply = 'Okay.', aktionen = [];
            if (/Wasserhähne/.test(erste)) { reply = 'Ich schaue nach.'; aktionen = [{ type: 'web_lookup', web_query: 'schöne Wasserhähne Badezimmer' }]; }
            else if (/Einkaufsliste/.test(erste)) { reply = 'Milch steht auf der Liste.'; aktionen = [{ type: 'shopping', shopping_item: 'Milch' }]; }
            else if (/kaufen|kosten/.test(erste)) { reply = 'Welches Produkt möchtest du kaufen?'; aktionen = [{ type: 'shopping', shopping_item: 'Produkt' }]; }
            else if (/Kühlschrank/.test(erste)) reply = 'Ein Kühlschrank pumpt Wärme aus dem Innenraum nach außen und gibt sie am Gitter wieder ab.';
            return antwort({ choices: [{ message: { content: JSON.stringify({ reply, actions: aktionen }) } }] });
        }
    });
    app.log = log;
    app.karten = []; app.sb.showActionCards = c => { app.karten.push(JSON.parse(JSON.stringify(c))); };
    return app;
}
async function runde(app, satz) {
    const g0 = app.gesagt.length, h0 = app.lese('chatHistory').length, l0 = app.log.groq.length, k0 = app.karten.length;
    await app.lassLaufen(async () => {
        const r = await app.satz(satz);
        if (!r.lokal) await app.sb.sendToGroqSmart(satz);
        for (let i = 0; i < 60; i++) await tick();
        try { const l = app.sb.jvProdukte.lauf(); if (l) await l; } catch (e) { }
        for (let i = 0; i < 20; i++) await tick();
    });
    const karten = app.karten.slice(k0), letzte = app.karten.length ? app.karten[app.karten.length - 1] : [];
    return { gesagt: app.gesagt.slice(g0), neuVerlauf: app.lese('chatHistory').length - h0, modellAufrufe: app.log.groq.length - l0, karten: karten, sichtbar: letzte };
}
const einkauf = app => app.lese('shoppingEntries').length;
const html = k => (k || []).map(c => c.html || '').join('\n');
const links = h => (h.match(/href="([^"]+)"/g) || []).map(x => x.slice(6, -1));

(async () => {
    /* ---- 1. die ganze Kette ---- */
    {
        const app = neu();
        const r1 = await runde(app, Q1);
        check('1.1 Jarvis nennt die Produkte (Internetsuche), genau eine Sprachausgabe', r1.gesagt.length === 1 && /Grohe Eurosmart/.test(r1.gesagt[0]) && /Talis S/.test(r1.gesagt[0]) && app.log.web === 1, JSON.stringify(r1.gesagt));
        check('1.2 die Auslese lief genau einmal und beide Produkte wurden einzeln gesucht', app.log.auslese === 1 && app.log.shop.length === 2 && app.log.shop.some(q => /Grohe Eurosmart/.test(q)) && app.log.shop.some(q => /Hansgrohe Talis S/.test(q)), JSON.stringify(app.log.shop));
        const h1 = html(r1.sichtbar);
        check('1.3 zwei Produktkarten sichtbar', r1.sichtbar.length === 2 && /Grohe Eurosmart/.test(h1) && /Hansgrohe Talis S/.test(h1), JSON.stringify(r1.sichtbar).slice(0, 300));
        check('1.4 echte Produktbilder der Quellen', h1.indexOf('src="' + BILD1 + '"') >= 0 && h1.indexOf('src="' + BILD2 + '"') >= 0);
        check('1.5 Händler und Preis an jedem Angebot, anklickbare Kauflinks', /Baumarkt24 · 64,90 €/.test(h1) && /Bad-Welt · 129,00 €/.test(h1) && links(h1).includes('https://baumarkt24.example/grohe-eurosmart') && links(h1).includes('https://bad-welt.example/talis-s'));
        check('1.6 mehrere Händler zum ersten Produkt (günstigste zuerst), das fremde Angebot („Duschkopf“) ist nicht dabei', /Baumarkt24[\s\S]*Sanitär-Direkt[\s\S]*Onlinehandel/.test(h1) && !/Fremdshop|Duschkopf|9,99/.test(h1));
        const l = app.sb.jvGespraech.liste();
        check('1.7 die Produkte liegen strukturiert im Gesprächsgedächtnis (Name, Bild, Angebote mit Link)', l && l.art === 'produkte' && l.items.length === 2 && l.items[0].name === 'Grohe Eurosmart' && l.items[0].bild === BILD1 && l.items[0].angebote.length === 3 && l.items[0].angebote[0].link === 'https://baumarkt24.example/grohe-eurosmart', JSON.stringify(l && l.items[0]));
        const e0 = einkauf(app), m0 = app.log.groq.length;
        const r2 = await runde(app, Q2);
        check('1.8 Anschlussfrage: das Sprachmodell wird gar nicht gefragt', r2.modellAufrufe === 0 && app.log.groq.length === m0, String(r2.modellAufrufe));
        check('1.9 gesprochen: beide Produkte mit Händler und Preis, genau einmal, keine Rückfrage', r2.gesagt.length === 1 && /Grohe Eurosmart gibt es bei Baumarkt24 für 64,90 €/.test(r2.gesagt[0]) && /Hansgrohe Talis S gibt es bei Bad-Welt für 129,00 €/.test(r2.gesagt[0]) && !/Welches Produkt/.test(r2.gesagt[0]), JSON.stringify(r2.gesagt));
        check('1.10 Händlerkarten mit Links sichtbar', r2.sichtbar.length === 2 && links(html(r2.sichtbar)).includes('https://baumarkt24.example/grohe-eurosmart') && links(html(r2.sichtbar)).includes('https://bad-welt.example/talis-s'));
        check('1.11 kein Eintrag auf der Einkaufsliste', einkauf(app) === e0 && e0 === 0);
        check('1.12 Verlauf: je Frage genau ein Paar, mit der echten Antwort', r2.neuVerlauf === 2 && /Hansgrohe Talis S gibt es/.test(app.lese('chatHistory').slice(-1)[0].content), String(r2.neuVerlauf));
        const r3 = await runde(app, 'Was kosten die?');
        check('1.13 „Was kosten die?“ aus denselben Daten, ohne Modell, ohne Internetsuche', r3.modellAufrufe === 0 && app.log.web === 1 && /64,90 €/.test(r3.gesagt[0]) && /129,00 €/.test(r3.gesagt[0]), JSON.stringify(r3.gesagt));
        const r4 = await runde(app, 'Welches ist günstiger?');
        check('1.14 „Welches ist günstiger?“ vergleicht die echten Preise', r4.modellAufrufe === 0 && /Am günstigsten ist Grohe Eurosmart mit 64,90 €[^.]*, danach Hansgrohe Talis S mit 129,00 €/.test(r4.gesagt[0]), JSON.stringify(r4.gesagt));
        const r5 = await runde(app, 'Zeig mir das zweite');
        check('1.15 „Zeig mir das zweite“ zeigt genau das zweite Produkt', r5.modellAufrufe === 0 && r5.sichtbar.length === 1 && /Hansgrohe Talis S/.test(html(r5.sichtbar)) && /Hansgrohe Talis S/.test(r5.gesagt[0]) && !/Eurosmart/.test(r5.gesagt[0]), JSON.stringify(r5.gesagt));
        const r6 = await runde(app, 'Wo kann ich das erste kaufen?');
        check('1.16 „Wo kann ich das erste kaufen?“ nur zum ersten Produkt', r6.sichtbar.length === 1 && /Eurosmart/.test(html(r6.sichtbar)) && !/Talis/.test(r6.gesagt[0]), JSON.stringify(r6.gesagt));
        const r7 = await runde(app, 'Zeig mir das dritte');
        check('1.17 ein drittes gibt es nicht: Jarvis sagt es und nennt die zwei, erfindet keins', /nur 2 Produkte/.test(r7.gesagt[0]) && /1: Grohe Eurosmart, 2: Hansgrohe Talis S/.test(r7.gesagt[0]), JSON.stringify(r7.gesagt));
        const r8 = await runde(app, 'Was kostet der Grohe?');
        check('1.18 per Name: „Was kostet der Grohe?“ nur Grohe', r8.sichtbar.length === 1 && /Eurosmart/.test(html(r8.sichtbar)) && !/Talis/.test(r8.gesagt[0]), JSON.stringify(r8.gesagt));
        const r9 = await runde(app, 'Wie komme ich dahin?');
        check('1.19 „Wie komme ich dahin?“ macht aus einem Shop-Link keine Route (Produkte sind keine Orte)', !/Route zu/.test(JSON.stringify(r9.karten)) && !/Hier ist die Route/.test((r9.gesagt || []).join(' ')), JSON.stringify(r9.gesagt));
    }

    /* ---- 2. fehlende Bilder, Preise, Angebote ---- */
    {
        const tab = { 'Grohe Eurosmart': [{ titel: 'Grohe Eurosmart Armatur', shop: 'Baumarkt24', preisText: '64,90 €', preis: 64.9, link: 'https://baumarkt24.example/e', bild: '' }], 'Hansgrohe Talis S': [] };
        const app = neu({ angebote: tab });
        const r1 = await runde(app, Q1), h = html(r1.sichtbar);
        check('2.1 fehlendes Bild wird ausdrücklich gemeldet', /Kein Produktbild gefunden/.test(h) && !/<img/.test(h));
        check('2.2 fehlendes Angebot wird ausdrücklich gemeldet, kein erfundener Preis, nur ein Preisvergleichs-Link', /Kein verlässliches Angebot gefunden/.test(h) && /idealo\.de\/preisvergleich/.test(h) && (h.match(/€/g) || []).length === 1);
        const r2 = await runde(app, Q2);
        check('2.3 Anschlussfrage: ehrlich, wo es kein Angebot gibt', /Grohe Eurosmart gibt es bei Baumarkt24 für 64,90 €/.test(r2.gesagt[0]) && /Zu Hansgrohe Talis S habe ich gerade kein verlässliches Angebot gefunden/.test(r2.gesagt[0]), JSON.stringify(r2.gesagt));
        const r3 = await runde(app, 'Welches ist günstiger?');
        check('2.4 Vergleich nur mit einem Preis: sagt, dass er nicht vergleichen kann', /Nur zu Grohe Eurosmart habe ich einen Preis/.test(r3.gesagt[0]) && /nicht vergleichen/.test(r3.gesagt[0]), JSON.stringify(r3.gesagt));
        check('2.5 beim Nachfragen wurde das fehlende Angebot einmal erneut gesucht', app.log.shop.filter(q => /Talis/.test(q)).length === 3, JSON.stringify(app.log.shop));
    }
    {
        const app = neu({ angebote: {}, shopFehler: false });
        const r1 = await runde(app, Q1), r2 = await runde(app, Q2);
        check('2.6 keine Suchergebnisse: Karten ohne Preis, nichts erfunden', r1.sichtbar.length === 2 && !/€/.test(html(r1.sichtbar).replace(/ · /g, '')) && /Zu Grohe Eurosmart habe ich gerade kein verlässliches Angebot gefunden/.test(r2.gesagt[0]) && !/ für \d/.test(r2.gesagt[0]), JSON.stringify(r2.gesagt));
        check('2.7 auch dann keine Einkaufsliste, kein Modell', einkauf(app) === 0 && r2.modellAufrufe === 0);
    }
    {
        const app = neu({ shopFehler: true });
        const r1 = await runde(app, Q1), r2 = await runde(app, Q2);
        check('2.8 Preisdienst ausgefallen: Karten sagen es, Antwort bleibt ehrlich', /Die Preissuche hat nicht geklappt/.test(html(r1.sichtbar)) && /kein verlässliches Angebot/.test(r2.gesagt[0]) && !/ für \d/.test(r2.gesagt[0]), JSON.stringify(r2.gesagt));
    }
    {
        const tab = { 'Grohe Eurosmart': [{ titel: 'Duschkopf Regenbrause', shop: 'Fremdshop', preisText: '9,99 €', preis: 9.99, link: 'https://fremd.example/x', bild: 'https://fremd.example/x.jpg' }, { titel: 'Grohe Eurosmart Marktplatz-Angebot', shop: 'OnBuy', preisText: '1,00 €', preis: 1, link: 'https://onbuy.example', bild: '', markt: true }], 'Hansgrohe Talis S': [] };
        const app = neu({ angebote: tab });
        const r1 = await runde(app, Q1), h = html(r1.sichtbar);
        check('2.9 nicht passende Angebote und Marktplätze werden nicht als Angebot gezeigt', !/Fremdshop|9,99|OnBuy|1,00/.test(h) && !/fremd\.example/.test(h), h.slice(0, 300));
    }

    /* ---- 3. nichts erfunden: Auslese ---- */
    {
        const app = neu({ auslese: { produkte: [{ name: 'Grohe Eurosmart', hersteller: 'Grohe' }, { name: 'Kludi Zenta', hersteller: 'Kludi' }] } });
        const r1 = await runde(app, Q1);
        check('3.1 ein Produkt, das nicht in der Antwort steht, wird verworfen', r1.sichtbar.length === 1 && /Grohe Eurosmart/.test(html(r1.sichtbar)) && !/Kludi/.test(html(r1.sichtbar)) && !app.log.shop.some(q => /Kludi/.test(q)), JSON.stringify(app.log.shop));
    }
    {
        const app = neu({ auslese: { produkte: [] }, webText: 'Ich würde auf eine Einhebelmischer-Armatur mit Keramikkartusche achten, die ist langlebig und leicht zu reinigen.' });
        const r1 = await runde(app, Q1);
        check('3.2 nennt die Antwort keine konkreten Produkte, entstehen keine Karten und keine Preissuche', r1.sichtbar.length === 0 && app.log.shop.length === 0 && (app.sb.jvGespraech.liste() || {}).art !== 'produkte', JSON.stringify(app.log.shop));
        const r2 = await runde(app, Q2);
        check('3.3 ohne gemerkte Produkte läuft „Wo kann ich sie kaufen?“ wie bisher, aber ohne Einkaufslisten-Eintrag', einkauf(app) === 0, String(einkauf(app)));
    }
    {
        const app = neu();
        const r = await runde(app, 'Wie funktioniert ein Kühlschrank?');
        check('3.4 Fragen ohne Produktwunsch lösen weder Auslese noch Preissuche aus', app.log.auslese === 0 && app.log.shop.length === 0 && r.sichtbar.length === 0);
        const r2 = await runde(app, 'Erinnere mich morgen an den Wasserhahn im Bad');
        check('3.5 Erinnerung: keine Auslese', app.log.auslese === 0);
    }

    /* ---- 4. Themenwechsel, Wiederholung ---- */
    {
        const app = neu();
        await runde(app, Q1);
        await runde(app, 'Wie funktioniert ein Kühlschrank?');
        const e0 = einkauf(app);
        const r = await runde(app, Q2);
        check('4.1 Themenwechsel: „Wo kann ich sie kaufen?“ greift nicht still auf die Produkte zu, Jarvis fragt nach', /Worauf bezieht sich das/.test(r.gesagt[0]) && /Wasserhähne/.test(r.gesagt[0]) && /Kühlschrank/.test(r.gesagt[0]) && r.modellAufrufe === 0 && einkauf(app) === e0, JSON.stringify(r.gesagt));
        const r2 = await runde(app, 'Zeig mir das zweite');
        check('4.2 nach dem Themenwechsel zeigt „das zweite“ keine Produkte', r2.sichtbar.length === 0 || !/Talis/.test(html(r2.sichtbar)));
    }
    {
        const app = neu();
        await runde(app, Q1); await runde(app, Q1);
        const l = app.sb.jvGespraech.liste();
        check('4.3 dieselbe Frage zweimal: eine Liste mit zwei Produkten, keine doppelten', l.items.length === 2 && app.sb.jvGespraech.antworten().filter(a => a.frage === Q1).length === 1);
        const r = await runde(app, Q2);
        check('4.4 danach funktioniert die Anschlussfrage unverändert', /Grohe Eurosmart gibt es bei Baumarkt24/.test(r.gesagt[0]) && r.modellAufrufe === 0, JSON.stringify(r.gesagt));
    }
    {
        const app = neu();
        await runde(app, Q1);
        await app.vorspulen(11 * 60000);
        const r = await runde(app, Q2);
        check('4.5 nach 11 Minuten sind die Produkte abgelaufen: keine Karten aus alten Daten', !/Baumarkt24/.test((r.gesagt || []).join(' ')));
    }

    /* ---- 5. Kaufabsicht ohne Karten: andere Wünsche bleiben wie sie sind ---- */
    {
        const app = neu();
        await runde(app, 'Setz Milch auf die Einkaufsliste');
        check('5.1 „Setz Milch auf die Einkaufsliste“ legt weiter einen Eintrag an', einkauf(app) === 1, String(einkauf(app)));
        const r = await runde(app, 'Wo kann ich Milch kaufen?');
        check('5.2 „Wo kann ich Milch kaufen?“ löst keine Produktkarten aus', r.sichtbar.length === 0 && app.log.auslese === 0, String(r.sichtbar.length));
    }

    console.log('Produktkarten: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
