/* ============================================================
   TESTS "Händlerlinks + kombinierte Produktfragen". Start: node tests/haendlerlinks.js
   Teil 1: Server (api/maps.js mit Attrappen): woher kommen Händlerlinks, was wird verworfen, was ist Vergleich
   Teil 2: ganze App-Kette (echte Skripte, Attrappen für Netz/Groq/Preisdienst): gesprochene Sätze -> Pfad -> Karten -> Links -> Anschlussfragen
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const antwort = (d, o) => Object.assign({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d), headers: { get: () => null } }, o || {});
const tick = () => new Promise(r => setImmediate(r));

/* ---------- Teil 1: Server ---------- */
async function serverTests() {
    const lade = fake => { const mod = { exports: {} }; new Function('module', 'process', 'fetch', 'AbortSignal', 'URL', fs.readFileSync(path.join(ROOT, 'api/maps.js'), 'utf8').replace(/^export const config/m, 'const config').replace(/^export default /m, 'module.exports = '))(mod, { env: { SERPER_API_KEY: 'x', APP_SECRET: 's' } }, fake, { timeout: () => undefined }, URL);
        return async query => { let out; await mod.exports({ method: 'GET', query, headers: { 'x-app-key': 's' } }, { status: c => ({ json: j => { out = j; }, end() { } }), setHeader() { }, json: j => { out = j; } }); return out; }; };
    const shop = [
        { title: 'GROHE Eurosmart Waschtischarmatur', source: 'Baumarkt24', price: '64,90 €', link: 'https://www.google.com/search?ibp=oshop&q=x', imageUrl: 'https://img.example/a.jpg' },
        { title: 'GROHE Eurosmart Waschtischarmatur chrom', source: 'Sanitär-Direkt', price: '69,50 €', link: 'https://www.google.com/aclk?x=1' },
        { title: 'GROHE Eurosmart Armatur', source: 'Direktshop', price: '71,00 €', link: 'https://direktshop.example/grohe-eurosmart' }
    ];
    const organic = [
        { title: 'Grohe Eurosmart Waschtischarmatur kaufen | Baumarkt24', link: 'https://www.baumarkt24.de/grohe-eurosmart-waschtisch' },
        { title: 'Grohe Eurosmart günstig – Preisvergleich', link: 'https://www.idealo.de/preisvergleich/OffersOfProduct/1.html' },
        { title: 'Grohe Eurosmart Waschtisch bei Google', link: 'https://www.google.com/shopping/product/1' },
        { title: 'Kinderfahrrad 16 Zoll | Sanitaer-Direkt', link: 'https://www.sanitaer-direkt.de/kinderfahrrad' }   // richtiger Händler, falsches Produkt
    ];
    let suchen = 0;
    const fake = async (url, o) => {
        if (/shopping/.test(url)) return antwort({ shopping: shop });
        if (/ kaufen"/.test(String(o && o.body))) suchen++;
        if (/site:idealo|idealo Preisvergleich/.test(String(o && o.body))) return antwort({ organic: [] });
        return antwort({ organic });
    };
    const rufe = lade(fake);
    const ohne = await rufe({ action: 'shopping', q: 'Grohe Eurosmart' });
    check('S1 ohne Händler-Wunsch bleibt alles wie bisher: Google-Links leer, nur der echte Direktlink bleibt', ohne.angebote.filter(x => x.link).length === 1 && ohne.angebote.find(x => x.shop === 'Direktshop').link === 'https://direktshop.example/grohe-eurosmart', JSON.stringify(ohne.angebote.map(x => [x.shop, x.link])));
    const mit = await rufe({ action: 'shopping', q: 'Grohe Eurosmart', haendler: '1' });
    const by = n => mit.angebote.find(x => x.shop === n);
    check('S2 Händler-Wunsch: Baumarkt24 bekommt die echte Händlerseite (gleicher Händler, passendes Produkt), als „haendlerseite“ gekennzeichnet', by('Baumarkt24').link === 'https://www.baumarkt24.de/grohe-eurosmart-waschtisch' && by('Baumarkt24').linkArt === 'haendlerseite', JSON.stringify(by('Baumarkt24')));
    check('S3 richtiger Händler, aber falsches Produkt (Kinderfahrrad): kein Link erfunden', by('Sanitär-Direkt') && !by('Sanitär-Direkt').link, JSON.stringify(by('Sanitär-Direkt')));
    check('S4 ein Direktlink aus der Preissuche bleibt „direkt“', by('Direktshop').linkArt === 'direkt' && by('Direktshop').link === 'https://direktshop.example/grohe-eurosmart');
    check('S5 kein Angebot bekommt je einen Google- oder Idealo-Link als Händlerlink', mit.angebote.filter(x => !x.vergleich).every(x => !x.link || !/google|idealo/i.test(x.link)));
    check('S6 Preis und Händlername bleiben unverändert beim Angebot', by('Baumarkt24').preisText === '64,90 €' && by('Baumarkt24').titel.indexOf('GROHE Eurosmart') === 0 && by('Baumarkt24').bild === 'https://img.example/a.jpg');
    const ohneSuche = suchen;
    await rufe({ action: 'shopping', q: 'Grohe Eurosmart' });
    check('S7 die zusätzliche Händlersuche läuft nur mit Händler-Wunsch', suchen === ohneSuche);
    /* Idealo-Treffer werden als Vergleich markiert */
    const fake2 = async (url, o) => {
        if (/shopping/.test(url)) return antwort({ shopping: shop.slice(2) });
        if (/idealo\.de\/preisvergleich\/Main/.test(url)) return antwort({}, { ok: false, status: 404 });
        return antwort({ organic: [{ title: 'Grohe Eurosmart Waschtischarmatur ab 59,99 € - Preisvergleich | idealo', link: 'https://www.idealo.de/preisvergleich/OffersOfProduct/2.html', snippet: 'Preise ab 59,99 € bei 12 Shops' }] });
    };
    const v = await lade(fake2)({ action: 'shopping', q: 'Grohe Eurosmart Waschtischarmatur' });
    const id = (v.angebote || []).filter(x => /idealo/i.test(x.shop));
    check('S8 Idealo-Treffer sind ausdrücklich als Vergleich markiert (vergleich:true)', id.length >= 1 && id.every(x => x.vergleich === true), JSON.stringify(v.angebote));

    /* ---- Handytest 07.11. (2): Links landeten bei Angeboten, die nicht ausgegeben/angezeigt wurden ---- */
    {
        const namen = ['Teuer1', 'Teuer2', 'Teuer3', 'Teuer4', 'Teuer5', 'Billig1', 'Billig2', 'Billig3'];
        const preise = [49, 48, 47, 46, 45, 30, 31, 32];   // die günstigsten stehen in der Google-Reihenfolge HINTEN
        const sh = namen.map((n, i) => ({ title: 'Grohe BauEdge Waschtischarmatur', source: n, price: preise[i] + ',00 €', link: 'https://www.google.com/aclk?a=' + i }));
        const anf = [];
        const fk = async (url, o) => {
            if (/shopping/.test(url)) return antwort({ shopping: sh });
            const qq = String((JSON.parse(String(o && o.body || '{}'))).q || '');
            if (!qq || /site:idealo|idealo Preisvergleich/.test(qq)) return antwort({ organic: [] });
            anf.push(qq);
            const n = namen.find(x => qq.endsWith(' ' + x));
            return antwort({ organic: n ? [{ title: 'Grohe BauEdge Waschtischarmatur | ' + n, link: 'https://www.' + n.toLowerCase() + '.de/grohe-bauedge' }] : [] });
        };
        const r = await lade(fk)({ action: 'shopping', q: 'Grohe BauEdge', haendler: '1' });
        const shown = r.angebote || [];
        check('S17 ausgegeben werden die 5 günstigsten (30, 31, 32, 45, 46) - keine Preise verschwiegen', shown.map(x => x.preis).join() === '30,31,32,45,46', shown.map(x => x.preis).join());
        check('S18 ALLE ausgegebenen Angebote haben einen Händlerlink (die Suche gilt den ausgegebenen, nicht den ersten fünf der Google-Reihenfolge)', shown.every(x => x.link && x.linkArt === 'haendlerseite'), JSON.stringify(shown.map(x => [x.shop, x.link])));
        check('S19 Preis und Händler gehören zum selben Angebot wie der Link (Billig1 = 30 € = billig1.de)', shown[0].shop === 'Billig1' && shown[0].preis === 30 && /billig1\.de/.test(shown[0].link));
        check('S20 Diagnose: ausgegeben 5, davon 5 mit Händlerlink; höchstens 6 Anfragen', r.diag.h.ausgegeben === 5 && r.diag.h.mitLink === 5 && anf.length === 6 && r.diag.h.anfragen === 6, JSON.stringify(r.diag.h) + ' ' + anf.length);
    }

    /* ---- Handytest 07.11.: kleine Shops stehen nicht in der allgemeinen Suche -> gezielte Suche je Händler ---- */
    {
        const sh = [
            { title: 'Schütte Athos Plus Waschtischarmatur', source: 'OBI', price: '17,99 €', link: 'https://www.google.com/search?ibp=oshop&q=1' },
            { title: 'Schütte Athos Plus Waschtischarmatur chrom', source: 'onlinebaufuchs', price: '22,39 €', link: 'https://www.google.com/aclk?a=2' },
            { title: 'Schütte Athos Plus Armatur', source: 'MDM Tools', price: '23,00 €', link: 'https://www.google.com/aclk?a=3' },
            { title: 'Schütte Athos Plus Armatur', source: 'BAU99', price: '24,00 €', link: 'https://www.google.com/aclk?a=4' },
            { title: 'Schütte Athos Plus Armatur', source: 'Sanitino', price: '25,00 €', link: 'https://www.google.com/aclk?a=5' }
        ];
        const anfragen = [];
        let sanitinoFehler = false;
        const fk = async (url, o) => {
            if (/shopping/.test(url)) return antwort({ shopping: sh });
            const body = JSON.parse(String(o && o.body || '{}')), qq = String(body.q || '');
            if (/site:idealo|idealo Preisvergleich/.test(qq)) return antwort({ organic: [] });
            if (qq) anfragen.push(qq);
            if (/ kaufen$/.test(qq)) return antwort({ organic: [{ title: 'Schütte Athos Plus Armatur | Hornbach', link: 'https://www.hornbach.de/p/athos' }, { title: 'Schütte Athos Plus Preisvergleich', link: 'https://www.idealo.de/preisvergleich/OffersOfProduct/7.html' }] });
            if (/OBI$/.test(qq)) return antwort({ organic: [{ title: 'SCHÜTTE Waschtischarmatur Athos Plus | OBI', link: 'https://www.obi.de/p/schuette-athos-plus' }] });
            if (/onlinebaufuchs$/.test(qq)) return antwort({ organic: [{ title: 'Schütte Athos Plus Einhebelmischer günstig kaufen', link: 'https://www.onlinebaufuchs.de/schuette-athos-plus' }] });
            if (/MDM Tools$/.test(qq)) return antwort({ organic: [{ title: 'Schütte Armaturen & Mischer - Sanitär | MDM Tools', link: 'https://www.mdm-tools.de/sanitaer/armaturen' }, { title: 'Schütte Athos Plus Preisvergleich', link: 'https://www.preisvergleich.example/x' }] });
            if (/BAU99$/.test(qq) && sanitinoFehler) return antwort({}, { ok: false, status: 500 });
            if (/Sanitino$/.test(qq)) return sanitinoFehler ? antwort({}, { ok: false, status: 500 }) : antwort({ organic: [] });
            return antwort({ organic: [] });   // BAU99: nichts
        };
        const rufe2 = lade(fk);
        const r = await rufe2({ action: 'shopping', q: 'Schütte Athos Plus', haendler: '1' });
        const g = n => (r.angebote || []).find(x => x.shop === n);
        check('S9 kleine Shops: gezielte Suche je Händler findet die Produktseite (OBI, onlinebaufuchs)', g('OBI') && g('OBI').link === 'https://www.obi.de/p/schuette-athos-plus' && g('OBI').linkArt === 'haendlerseite' && g('onlinebaufuchs') && g('onlinebaufuchs').link === 'https://www.onlinebaufuchs.de/schuette-athos-plus', JSON.stringify(r.angebote));
        check('S10 nur Händlerseite zum Thema (Kategorie) wird als „kategorie“ gekennzeichnet, nie als Produktseite', g('MDM Tools') && g('MDM Tools').linkArt === 'kategorie' && /mdm-tools\.de/.test(g('MDM Tools').link), JSON.stringify(g('MDM Tools')));
        check('S11 nichts gefunden (BAU99, Sanitino): kein Link, kein erfundener', !g('BAU99').link && !g('Sanitino').link && !g('BAU99').linkArt);
        check('S12 Vergleichsseiten (Idealo, „preisvergleich“) werden nie als Händlerlink genommen', (r.angebote || []).every(x => !/idealo|preisvergleich/i.test(x.link)));
        check('S13 wenige Anfragen: 1 allgemeine + höchstens 5 gezielte (je ausgegebenem Händler eine)', anfragen.length === 6 && r.diag.h.anfragen === 6, String(anfragen.length));
        check('S14 Diagnose: Anfragen, Treffer, ergänzt und Ablehnungsgründe, ohne Schlüssel', r.diag.h.ergaenzt === 3 && r.diag.h.abgelehnt.host === 2 && r.diag.h.treffer >= 5 && r.diag.h.fehler.length === 0 && !/"x"|X-API/.test(JSON.stringify(r.diag)), JSON.stringify(r.diag.h));
        sanitinoFehler = true; anfragen.length = 0;
        const r2 = await rufe2({ action: 'shopping', q: 'Schütte Athos Plus', haendler: '1' });
        check('S15 Suchfehler eines Händlers wird in der Diagnose gemeldet, die anderen Links bleiben', r2.diag.h.fehler.join() === 'HTTP 500,HTTP 500' && r2.angebote.find(x => x.shop === 'OBI').link, JSON.stringify(r2.diag.h));
        anfragen.length = 0;
        const r3 = await rufe2({ action: 'shopping', q: 'Schütte Athos Plus' });
        check('S16 ohne Händler-Wunsch keine zusätzlichen Anfragen und keine Händler-Diagnose', anfragen.length === 0 && !r3.diag.h, String(anfragen.length));
    }

}

/* ---------- Teil 2: App ---------- */
const BILD = {};
function neu(opt) {
    opt = opt || {};
    const log = { groq: [], shop: [], web: 0, auslese: 0, haendlerFlag: 0 };
    const app = starte({
        jetzt: '2026-11-07T19:30:00+01:00', festerZufall: true,
        fetch: async (u, o) => {
            u = String(u);
            if (/action=shopping/.test(u)) {
                const q = decodeURIComponent((u.match(/[?&]q=([^&]*)/) || [])[1] || '');
                log.shop.push(q); if (/haendler=1/.test(u)) log.haendlerFlag++;
                if (opt.shopFehler) return antwort({ error: 'x' }, { ok: false, status: 502 });
                const tab = opt.angebote || {};
                const key = Object.keys(tab).find(k => q.toLowerCase().indexOf(k.toLowerCase()) >= 0);
                return antwort({ angebote: key ? tab[key] : [] });
            }
            if (!/\/api\/groq/.test(u)) throw new Error('offline (Attrappe): ' + u);
            const b = JSON.parse(o.body);
            const sys = String(b.messages[0].content), letzte = String(b.messages[b.messages.length - 1].content);
            if (/^Produkt-Auslese/.test(sys)) { log.auslese++; return antwort({ choices: [{ message: { content: JSON.stringify(opt.auslese || { produkte: [] }) } }] }); }
            if (Array.isArray(b.tools) && b.tools.length) { log.web++; return antwort({ choices: [{ message: { content: opt.webText || '' } }] }); }
            log.groq.push({ system: sys, letzte });
            /* so verhält sich das Modell am Handy: bei "kaufen" eine Einkaufsliste anlegen und nach dem Produkt fragen */
            let reply = 'Okay.', aktionen = [];
            const erste = letzte.split('\n')[0];
            if (/Wasserhähne/.test(erste) && !/kaufen/.test(erste)) { reply = 'Ich schaue nach.'; aktionen = [{ type: 'web_lookup', web_query: 'schöne Wasserhähne Badezimmer' }]; }
            else if (/kaufen|bekomme/.test(erste)) { reply = 'Welches Produkt möchtest du kaufen?'; aktionen = [{ type: 'shopping', shopping_item: 'Produkt' }]; }
            else if (/Wetter/.test(erste)) { reply = 'Morgen wird es sonnig bei 12 Grad.'; }
            return antwort({ choices: [{ message: { content: JSON.stringify({ reply, actions: aktionen }) } }] });
        }
    });
    app.log = log; app.karten = []; app.sb.showActionCards = c => { app.karten.push(JSON.parse(JSON.stringify(c))); };
    if (opt.chef) app.sb.jvChef.an();
    return app;
}
async function runde(app, satz) {
    const g0 = app.gesagt.length, l0 = app.log.groq.length, k0 = app.karten.length, w0 = app.log.web;
    await app.lassLaufen(async () => {
        const r = await app.satz(satz);
        if (!r.lokal) await app.sb.sendToGroqSmart(satz);
        for (let i = 0; i < 80; i++) await tick();
        try { const l = app.sb.jvProdukte.lauf(); if (l) await l; } catch (e) { }
        for (let i = 0; i < 20; i++) await tick();
    });
    return { gesagt: app.gesagt.slice(g0), modell: app.log.groq.length - l0, karten: app.karten.slice(k0), sichtbar: app.karten.length > k0 ? app.karten[app.karten.length - 1] : [], web: app.log.web - w0 };
}
const einkauf = app => app.lese('shoppingEntries').length;
const html = k => (k || []).map(c => c.html || '').join('\n');
const hrefs = h => (h.match(/href="([^"]+)"/g) || []).map(x => x.slice(6, -1));
const ang = (titel, shop, p, link, extra) => Object.assign({ titel, shop, preisText: p.toFixed(2).replace('.', ',') + ' €', preis: p, link: link || '', bild: '' }, extra || {});

const ORIG = 'Ich suche einen Wasserhahn für mein Badezimmer. Hast du da vielleicht irgendwas für mich? Und wo kann ich das kaufen? Und sag mir bitte den Preis.';
const HAHN = { auslese: { produkte: [{ name: 'Grohe Eurosmart' }, { name: 'Hansgrohe Talis S' }] }, webText: 'Zwei gute Kandidaten sind der Grohe Eurosmart, schlicht und zuverlässig, und der Hansgrohe Talis S, der etwas höher baut.' };
const TAB_ECHT = {
    'Grohe Eurosmart': [ang('GROHE Eurosmart Waschtischarmatur', 'Baumarkt24', 64.9, 'https://baumarkt24.example/eurosmart', { bild: 'https://img.example/e.jpg', linkArt: 'direkt' }), ang('Grohe Eurosmart Armatur chrom', 'Sanitär-Direkt', 69.5, 'https://sanitaer.example/eurosmart', { linkArt: 'haendlerseite' }), ang('Grohe Eurosmart Armatur', 'Idealo', 59.99, 'https://www.idealo.de/preisvergleich/OffersOfProduct/9.html', { vergleich: true })],
    'Hansgrohe Talis S': [ang('Hansgrohe Talis S Waschtischmischer', 'Bad-Welt', 129, 'https://bad-welt.example/talis', { bild: 'https://img.example/t.jpg', linkArt: 'direkt' })]
};
const TAB_OHNE = {
    'Grohe Eurosmart': [ang('GROHE Eurosmart Waschtischarmatur', 'Baumarkt24', 64.9, ''), ang('Grohe Eurosmart Armatur chrom', 'Sanitär-Direkt', 69.5, '')],
    'Hansgrohe Talis S': [ang('Hansgrohe Talis S Waschtischmischer', 'Bad-Welt', 129, '')]
};

(async () => {
    await serverTests();

    /* ---- A. Händlerlinks in den Karten ---- */
    {
        const app = neu(Object.assign({ angebote: TAB_ECHT }, HAHN));
        const r = await runde(app, 'Ich suche zwei schöne Wasserhähne für mein Badezimmer.');
        const h = html(r.sichtbar), links = hrefs(h);
        check('A1 mit echten Händlerlinks: jeder Händler führt auf SEINE Seite (Händler, Preis, Link gehören zusammen)', links.includes('https://baumarkt24.example/eurosmart') && links.includes('https://sanitaer.example/eurosmart') && links.includes('https://bad-welt.example/talis') && /Baumarkt24 · 64,90 €<\/?[^>]*>?[^<]*›|Baumarkt24 · 64,90 €/.test(h), JSON.stringify(links));
        check('A2 Idealo erscheint NIE als Händlerlink; der Vergleich steht getrennt und beschriftet, wenn ein Link fehlt', !/Idealo · 59,99/.test(h.replace(/Preisvergleich/g, '')) || /Preisvergleich/.test(h));
        check('A3 die Preissuche wird mit Händler-Wunsch aufgerufen', app.log.haendlerFlag === 2, String(app.log.haendlerFlag));
        const gm = app.sb.jvGespraech.liste().items[0];
        check('A4 im Gedächtnis: Art des Links gespeichert, Idealo nur unter „vergleich“', gm.angebote.every(a => !/idealo/i.test(a.link) && !/idealo/i.test(a.shop)) && gm.vergleich && gm.vergleich[0] && /idealo/.test(gm.vergleich[0].link) && gm.angebote[0].linkArt === 'direkt' && gm.angebote[1].linkArt === 'haendlerseite', JSON.stringify(gm));
        check('A5 Produktseite eines Händlers ist als solche gekennzeichnet (Preis kann abweichen)', /Sanitär-Direkt · 69,50 €[^<]*\(Link separat gesucht, Preis kann abweichen\)/.test(h));
        const r2 = await runde(app, 'Wo kann ich die beiden kaufen?');
        check('A6 „Wo kann ich die beiden kaufen?“: lokal aus den Produkten, ohne Modell, ohne Einkaufsliste', r2.modell === 0 && einkauf(app) === 0 && /Grohe Eurosmart gibt es bei Baumarkt24 für 64,90 €/.test(r2.gesagt[0]) && /Talis S gibt es bei Bad-Welt für 129,00 €/.test(r2.gesagt[0]), JSON.stringify(r2.gesagt));
        check('A7 die Kaufkarten haben dieselben echten Händlerlinks', hrefs(html(r2.sichtbar)).includes('https://baumarkt24.example/eurosmart') && hrefs(html(r2.sichtbar)).includes('https://bad-welt.example/talis'));
        const r3 = await runde(app, 'Welcher der vorgeschlagenen Wasserhähne ist am günstigsten?');
        check('A8 „Welcher der vorgeschlagenen Wasserhähne ist am günstigsten?“ vergleicht die gezeigten Preise', r3.modell === 0 && /Am günstigsten ist Grohe Eurosmart mit 64,90 €/.test(r3.gesagt[0]), JSON.stringify(r3.gesagt));
        check('A9 der Idealo-Preis (59,99) zählt nicht als Händlerangebot im Vergleich', !/59,99/.test(r3.gesagt[0]));
    }
    {
        const app = neu(Object.assign({ angebote: TAB_OHNE }, HAHN));
        const r = await runde(app, 'Ich suche zwei schöne Wasserhähne für mein Badezimmer.');
        const h = html(r.sichtbar), links = hrefs(h);
        check('B1 ohne Händlerlinks: Händler und Preis stehen als Text, offen gekennzeichnet („kein direkter Link gefunden“)', (h.match(/kein direkter Link gefunden/g) || []).length === 3 && /Baumarkt24 · 64,90 €/.test(h) && /Bad-Welt · 129,00 €/.test(h), h.slice(0, 400));
        check('B2 nirgends ein Händlerlink erfunden: alle Links sind Idealo und stehen unter „Preisvergleich (kein Händlerlink)“', links.length === 2 && links.every(l => /idealo\.de/.test(l)) && (h.match(/Preisvergleich \(kein Händlerlink\)/g) || []).length === 2, JSON.stringify(links));
        check('B3 kein Händlertext enthält einen Link zu Idealo', !/Baumarkt24[^<]*<\/a>/.test(h) && !/<a [^>]*idealo[^>]*>\s*(Baumarkt24|Sanitär|Bad-Welt)/.test(h));
        const r2 = await runde(app, 'Wo kann ich die beiden kaufen?');
        check('B4 Anschlussfrage nennt die Händler, sagt aber ehrlich nichts über Links; Karten ohne Händlerlink', r2.modell === 0 && /Baumarkt24/.test(r2.gesagt[0]) && hrefs(html(r2.sichtbar)).every(l => /idealo\.de/.test(l)));
    }
    {
        const app = neu(Object.assign({ angebote: { 'Grohe Eurosmart': [ang('Grohe Eurosmart Armatur', 'Idealo', 59.99, 'https://www.idealo.de/preisvergleich/OffersOfProduct/9.html'), ang('Grohe Eurosmart Armatur', 'idealo.de', 58, 'https://www.idealo.de/x')], 'Hansgrohe Talis S': [] } }, HAHN));
        const r = await runde(app, 'Ich suche zwei schöne Wasserhähne für mein Badezimmer.');
        const h = html(r.sichtbar);
        check('B5 liefert die Suche nur Idealo, gibt es KEIN Händlerangebot; Idealo steht getrennt als Vergleich', /Kein verlässliches Angebot gefunden/.test(h) && /Preisvergleich \(kein Händlerlink\)/.test(h) && !/Idealo · 59,99 €[^<]*<\/a>\s*<span style="display:block;color:#94a3b8/.test('x'), h.slice(0, 300));
        const r2 = await runde(app, 'Wo kann ich die beiden kaufen?');
        check('B6 und die Antwort behauptet keinen Händler', !/gibt es bei Idealo/.test(r2.gesagt[0]), JSON.stringify(r2.gesagt));
    }
    {
        const tab = { 'Grohe Eurosmart': [ang('GROHE Eurosmart Waschtischarmatur', 'MDM Tools', 39.9, 'https://mdm.example/armaturen', { linkArt: 'kategorie' })], 'Hansgrohe Talis S': [] };
        const app = neu(Object.assign({ angebote: tab }, HAHN));
        const r = await runde(app, 'Ich suche zwei schöne Wasserhähne für mein Badezimmer.'), h = html(r.sichtbar);
        check('B7 nur eine Händlerseite (Kategorie): Link vorhanden, aber ausdrücklich „nicht sicher genau dieses Produkt“', /href="https:\/\/mdm\.example\/armaturen"[^>]*>MDM Tools · 39,90 € \(Händlerseite, nicht sicher genau dieses Produkt\)/.test(h), h.slice(0, 300));
        check('B8 Diagnosezeile zu den Händlerlinks erscheint nicht ohne Diagnose-Modus und stört nicht', r.sichtbar.length === 2);
    }

    {
        const tab = { 'Grohe Eurosmart': [ang('Grohe Eurosmart Armatur', 'A-Shop', 40, ''), ang('Grohe Eurosmart Armatur', 'B-Shop', 41, ''), ang('Grohe Eurosmart Armatur', 'C-Shop', 42, ''), ang('Grohe Eurosmart Armatur', 'D-Shop', 50, 'https://d-shop.example/e', { linkArt: 'haendlerseite' })], 'Hansgrohe Talis S': [] };
        const app = neu(Object.assign({ angebote: tab }, HAHN));
        const r = await runde(app, 'Ich suche zwei schöne Wasserhähne für mein Badezimmer.'), h = html(r.sichtbar);
        check('B9 die 3 günstigsten bleiben sichtbar (auch ohne Link) und das günstigste Angebot MIT Händlerlink kommt dazu', /A-Shop · 40,00/.test(h) && /B-Shop · 41,00/.test(h) && /C-Shop · 42,00/.test(h) && /href="https:\/\/d-shop\.example\/e"[^>]*>D-Shop · 50,00/.test(h), h.slice(0, 500));
        check('B10 der dazugekommene Link gehört zum richtigen Angebot (D-Shop 50 €), die anderen bleiben ehrlich ohne Link', (h.match(/kein direkter Link gefunden/g) || []).length === 3);
    }

    /* ---- C. die Originalfrage und andere kombinierte Sätze ---- */
    for (const chef of [false, true]) {
        const app = neu(Object.assign({ angebote: TAB_ECHT, chef }, HAHN));
        const r = await runde(app, ORIG);
        const tag = chef ? ' (Chef-KI an)' : '';
        check('C1' + tag + ' Originalfrage: keine Ortsrückfrage, kein Modellaufruf, keine Einkaufsliste', !/Welchen Ort/.test(r.gesagt.join(' ')) && r.modell === 0 && einkauf(app) === 0, JSON.stringify(r.gesagt));
        check('C2' + tag + ' Originalfrage: Internetsuche, Produkte genannt, zwei Karten mit Preis, Händler und Link', r.web === 1 && /Grohe Eurosmart/.test(r.gesagt[0]) && r.sichtbar.length === 2 && hrefs(html(r.sichtbar)).includes('https://baumarkt24.example/eurosmart'), JSON.stringify(r.gesagt) + ' ' + r.sichtbar.length);
        check('C3' + tag + ' die Karten enthalten die Preise', /64,90 €/.test(html(r.sichtbar)) && /129,00 €/.test(html(r.sichtbar)));
        const r2 = await runde(app, 'Und welcher ist günstiger?');
        check('C4' + tag + ' natürliche Anschlussfrage nach der Originalfrage', r2.modell === 0 && /Am günstigsten ist Grohe Eurosmart/.test(r2.gesagt[0]), JSON.stringify(r2.gesagt));
    }
    {
        const app = neu({ angebote: { 'Samsung': [ang('Samsung QLED Q60D 55 Zoll', 'TV-Shop', 549, 'https://tvshop.example/q60d', { bild: 'https://img.example/tv1.jpg' })], 'LG': [ang('LG OLED C4 55 Zoll', 'Bildschirm-Welt', 1199, 'https://bw.example/c4', { bild: 'https://img.example/tv2.jpg' })], 'Sony': [ang('Sony Bravia 7 55 Zoll', 'Medien-Markt24', 899, '', {})] },
            auslese: { produkte: [{ name: 'Samsung QLED Q60D' }, { name: 'LG OLED C4' }, { name: 'Sony Bravia 7' }] }, webText: 'Gute Fernseher sind der Samsung QLED Q60D mit 55 Zoll, der LG OLED C4 mit besonders gutem Schwarz und der Sony Bravia 7 mit starkem Bild.' });
        const r = await runde(app, 'Zeig mir drei gute Fernseher mit Bildern und Preisen.');
        const h = html(r.sichtbar);
        check('D1 Fernseher: drei Karten mit Bildern und Preisen, kein Modellaufruf (kein „Fernsehprogramm“-Missverständnis)', r.sichtbar.length === 3 && r.modell === 0 && r.web === 1 && /img\.example\/tv1\.jpg/.test(h) && /549,00 €/.test(h) && /1\.?199,00 €|1199,00 €/.test(h.replace('.', '')), JSON.stringify(r.gesagt) + ' ' + r.sichtbar.length);
        check('D2 Sony hat keinen Link: gekennzeichnet, kein erfundener', /Medien-Markt24 · 899,00 €[^<]*<i[^>]*>\(kein direkter Link gefunden\)/.test(h));
        const r2 = await runde(app, 'Zeig mir das zweite');
        check('D3 „Zeig mir das zweite“ = LG', r2.sichtbar.length === 1 && /LG OLED C4/.test(html(r2.sichtbar)));
    }
    {
        const app = neu({ angebote: { 'Xiaomi': [ang('Xiaomi Redmi 13C 128 GB', 'Handy-Welt', 99, 'https://hw.example/13c', { bild: 'https://img.example/h.jpg' })] }, auslese: { produkte: [{ name: 'Xiaomi Redmi 13C' }] }, webText: 'Ein günstiges Handy ist das Xiaomi Redmi 13C, das gibt es oft für unter 120 Euro.' });
        const r = await runde(app, 'Ich brauche ein günstiges Handy. Wo bekomme ich das?');
        check('E1 Handy: Antwort, Karte mit Händler/Preis/Link, keine Rückfrage, keine Einkaufsliste', r.web === 1 && r.modell === 0 && einkauf(app) === 0 && r.sichtbar.length === 1 && hrefs(html(r.sichtbar)).includes('https://hw.example/13c') && !/Welches Produkt/.test(r.gesagt.join(' ')), JSON.stringify(r.gesagt));
    }
    {
        const app = neu({ angebote: { 'Ikea': [ang('IKEA Kallax Regal 77x147', 'IKEA', 79.99, 'https://ikea.example/kallax')] }, auslese: { produkte: [{ name: 'IKEA Kallax' }] }, webText: 'Ein beliebtes Regal ist das IKEA Kallax, vielseitig und günstig.' });
        const r = await runde(app, 'Ich suche ein Regal fürs Wohnzimmer und möchte wissen, was es kostet und wo ich es kaufen kann.');
        check('E2 Möbel: gleiche Kette', r.web === 1 && r.modell === 0 && r.sichtbar.length === 1 && /79,99/.test(html(r.sichtbar)), JSON.stringify(r.gesagt));
    }

    /* ---- F. Dinge, die NICHT zu Produktkarten werden dürfen ---- */
    {
        const app = neu({ angebote: TAB_ECHT, chef: true, auslese: HAHN.auslese, webText: HAHN.webText });
        const r = await runde(app, 'Wo ist der nächste Baumarkt in der Nähe, der Wasserhähne verkauft?');
        check('F1 echte lokale Geschäftssuche: keine Produktkarten, keine Preissuche, kein Produkt-Auslesen', app.log.auslese === 0 && app.log.shop.length === 0 && r.sichtbar.every(c => !c.produkt), JSON.stringify(r.gesagt).slice(0, 200));
        const r2 = await runde(app, 'Setz Wasserhähne für das Bad auf die Einkaufsliste und sag mir den Preis');
        check('F2 Einkaufslisten-Auftrag bleibt ein Listenauftrag (keine Produktkarten)', app.log.auslese === 0 && app.log.shop.length === 0);
        const r3 = await runde(app, 'Wie wird morgen das Wetter?');
        check('F3 Wetterfrage unberührt', /sonnig/.test(r3.gesagt.join(' ')) || r3.modell === 1 || r3.gesagt.length >= 1, JSON.stringify(r3.gesagt));
        check('F4 Wetterfrage löst keine Produktkette aus', app.log.auslese === 0 && app.log.shop.length === 0);
    }
    {
        const app = neu({ chef: true });
        const rr = await runde(app, 'Hast du da vielleicht irgendwas für mich?');
        check('F5 „da“ als Füllwort („Hast du da vielleicht …“) löst keine Ortsrückfrage aus', !/Welchen Ort/.test(rr.gesagt.join(' ')), JSON.stringify(rr.gesagt));
        const r2 = await runde(app, 'Wie komme ich da hin?');
        check('F6 echter Ortsbezug („Wie komme ich da hin?“) ohne Ort fragt weiterhin nach', /Welchen Ort/.test(r2.gesagt.join(' ')) || r2.gesagt.length >= 1, JSON.stringify(r2.gesagt));
    }
    {
        const app = neu({ angebote: {}, auslese: HAHN.auslese, webText: HAHN.webText });
        const r = await runde(app, ORIG);
        check('G1 keine Suchergebnisse: Karten sagen es, nichts erfunden, keine Ortsrückfrage', r.sichtbar.length === 2 && (html(r.sichtbar).match(/Kein verlässliches Angebot gefunden/g) || []).length === 2 && !/€/.test(html(r.sichtbar)), html(r.sichtbar).slice(0, 200));
    }
    {
        const app = neu({ angebote: TAB_ECHT, auslese: HAHN.auslese, webText: HAHN.webText });
        await runde(app, ORIG);
        const r2 = await runde(app, 'Wie wird morgen das Wetter?');
        const r3 = await runde(app, 'Wo kann ich die beiden kaufen?');
        check('G2 Wetterfrage dazwischen: die Kaufnachfrage greift weiter auf die genannten Produkte zu (nicht auf das Wetter), keine Einkaufsliste, keine Ortsrückfrage', /Grohe Eurosmart/.test(r3.gesagt.join(' ')) && !/Wetter|Welchen Ort|Welches Produkt/.test(r3.gesagt.join(' ')) && einkauf(app) === 0, JSON.stringify(r3.gesagt));
    }

    console.log('Händlerlinks: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
