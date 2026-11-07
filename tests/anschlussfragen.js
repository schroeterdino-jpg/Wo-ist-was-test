/* ============================================================
   TESTS "Anschlussfragen" (P1-Nachbesserung). Start: node tests/anschlussfragen.js
   Auslöser: Handytest. Frage 1 „Hast du zwei Wasserhähne-Empfehlungen für mich fürs Badezimmer?“, Frage 2 „Wo kann ich die kaufen?“ -> Jarvis fragte „Welches Produkt meinst du?“,
   obwohl die Modelle im Verlauf standen. Geprüft mit der ganzen App (echte Skripte; Netz und Groq sind Attrappen), mit einem Testmodell, das trotz Kontext zunächst NACHFRAGT:
     1. die zwei Originalfragen   2. Systemanweisung mit Bezug   3. Modell fragt nach -> zweiter Versuch   4. Händler/Preise nur über die Internetsuche
     5. Themenwechsel, Mehrdeutigkeit, kein Bezug, Ablauf   6. andere Produkte, andere Anschlussfragen   7. Fahrzeit/Nähe im Verlauf   8. keine doppelten Antworten, Grenzen
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const antwort = (d, o) => Object.assign({ ok: true, status: 200, json: async () => d, text: async () => JSON.stringify(d), headers: { get: () => null } }, o || {});
const tick = () => new Promise(r => setImmediate(r));
const MIN = 60000;

const Q1 = 'Hast du zwei Wasserhähne-Empfehlungen für mich fürs Badezimmer?';
const Q2 = 'Wo kann ich die kaufen?';
const A1 = 'Gern. Ich empfehle den Grohe Eurosmart, schlicht und sehr zuverlässig, und den Hansgrohe Talis S, der etwas höher baut und gut zu Waschschüsseln passt.';
const WEB2 = 'Den Grohe Eurosmart bekommst du zum Beispiel im Baumarkt oder bei großen Onlinehändlern, den Hansgrohe Talis S ebenfalls.';

/* Modell-Attrappe. modus: 'fragt' = fragt bei Anschlussfragen immer nach "Welches Produkt meinst du?" (auch beim zweiten Versuch),
   'fragt1' = fragt zuerst nach, antwortet aber nach dem Systemhinweis, 'brav' = nutzt den Bezug aus der Systemanweisung. */
function neu(opt) {
    opt = opt || {};
    const aufrufe = [];
    const app = starte({
        jetzt: opt.jetzt || '2026-11-07T16:30:00+01:00', festerZufall: true,
        fetch: async (u, o) => {
            u = String(u);
            if (!/\/api\/groq/.test(u)) throw new Error('offline (Attrappe): ' + u);
            const b = JSON.parse(o.body);
            const web = Array.isArray(b.tools) && b.tools.length > 0;
            const letzte = String(b.messages[b.messages.length - 1].content);
            aufrufe.push({ web, system: String(b.messages[0].content), nachrichten: b.messages.slice(1).map(m => String(m.content)), letzte });
            if (web) return antwort({ choices: [{ message: { content: opt.webText ? opt.webText(letzte) : WEB2 } }] });
            const anschluss = /(^|\s)(die|das|den|welches|zweite|beide|besser|günstiger)(\s|\?|$)/i.test(letzte.split('\n')[0]) && letzte.length < 80;
            const hatBezug = /ANSCHLUSSFRAGE – BEZUG/.test(String(b.messages[0].content));
            const hinweis = /^Systemhinweis/.test(letzte);
            let reply = null, aktionen = [];
            if (opt.skript) { const s = opt.skript(letzte, { hatBezug, hinweis }); if (s) { reply = s.reply; aktionen = s.aktionen || []; } }
            if (reply === null) {
                if (hinweis) reply = (opt.modus === 'fragt') ? 'Welches Produkt meinst du?' : 'Der Hansgrohe Talis S ist etwas hochwertiger, der Grohe Eurosmart etwas günstiger.';
                else if (anschluss) reply = (opt.modus === 'brav' && hatBezug) ? 'Der Hansgrohe Talis S ist etwas hochwertiger, der Grohe Eurosmart etwas günstiger.' : 'Welches Produkt meinst du?';
                else if (/Wasserhähne/.test(letzte)) reply = A1;
                else reply = 'Okay.';
            }
            return antwort({ choices: [{ message: { content: JSON.stringify({ reply, actions: aktionen }) } }] });
        }
    });
    app.aufrufe = aufrufe;
    return app;
}
async function runde(app, satz) {
    const g0 = app.gesagt.length, h0 = app.lese('chatHistory').length, a0 = app.aufrufe.length;
    await app.lassLaufen(async () => {
        const r = await app.satz(satz);
        if (!r.lokal) await app.sb.sendToGroqSmart(satz);
        for (let i = 0; i < 40; i++) await tick();
    });
    return { gesagt: app.gesagt.slice(g0), neuVerlauf: app.lese('chatHistory').length - h0, aufrufe: app.aufrufe.slice(a0) };
}
const verlauf = app => app.lese('chatHistory').map(m => ({ role: m.role, inhalt: (() => { try { return JSON.parse(m.content); } catch (e) { return { reply: m.content }; } })() }));
const spricht = (r, rx) => r.gesagt.some(x => rx.test(String(x)));

(async () => {
    /* ---- 1. die zwei Originalfragen (Modell fragt IMMER nach, auch beim zweiten Versuch) ---- */
    {
        const app = neu({ modus: 'fragt' });
        const r1 = await runde(app, Q1);
        check('1.1 Frage 1 wird laut beantwortet (zwei Modelle)', spricht(r1, /Grohe Eurosmart/) && spricht(r1, /Hansgrohe Talis/), JSON.stringify(r1.gesagt));
        check('1.2 Frage 1: kein lokaler Befehl, ein Verlaufspaar', r1.neuVerlauf === 2, String(r1.neuVerlauf));
        const r2 = await runde(app, Q2);
        check('1.3 Frage 2: NICHT „Welches Produkt meinst du?“', !spricht(r2, /Welches Produkt meinst du/), JSON.stringify(r2.gesagt));
        check('1.4 Frage 2: Antwort kommt aus der Internetsuche, genau eine Sprachausgabe', r2.gesagt.length === 1 && /Baumarkt|Onlineh/.test(r2.gesagt[0]), JSON.stringify(r2.gesagt));
        const web = r2.aufrufe.filter(a => a.web);
        check('1.5 Suche bekommt die Modellnamen (Anfrage und Verlauf)', web.length === 1 && /Grohe Eurosmart/.test(web[0].letzte) && /Hansgrohe Talis S/.test(web[0].system + web[0].letzte), web[0] && web[0].letzte);
        check('1.6 Frage 2: nur ein Verlaufspaar, kein Doppeleintrag', r2.neuVerlauf === 2, String(r2.neuVerlauf));
        const v = verlauf(app), letzte = v[v.length - 1];
        check('1.7 Verlauf hält die echte Antwort (nicht „Ich schaue nach.“, nicht die Rückfrage)', letzte.role === 'assistant' && /Baumarkt/.test(letzte.inhalt.reply) && !/Welches Produkt/.test(JSON.stringify(v.slice(-2))), JSON.stringify(letzte));
        check('1.8 Antwort erfindet nichts selbst: gesprochen ist genau der Text der Suche', r2.gesagt[0].indexOf('Baumarkt') >= 0 && !/\d\s?(Euro|€)/.test(r2.gesagt[0]));
    }

    /* ---- 2. braves Modell: Bezug steht in der Systemanweisung ---- */
    {
        const app = neu({ modus: 'brav' });
        await runde(app, Q1);
        const r = await runde(app, 'Welches ist besser?');
        const ki = r.aufrufe.filter(a => !a.web);
        check('2.1 Systemanweisung enthält den Bezug samt Modellnamen', ki.length === 1 && /ANSCHLUSSFRAGE – BEZUG/.test(ki[0].system) && /Hansgrohe Talis S/.test(ki[0].system), ki[0] && ki[0].system.slice(-600));
        check('2.2 Systemanweisung verbietet Erfinden und Nachfragen', /Frage NICHT zurück/.test(ki[0].system) && /Erfinde niemals Händler, Preise oder Namen/.test(ki[0].system));
        check('2.3 Antwort nutzt den Kontext, nur ein Aufruf, eine Sprachausgabe', r.aufrufe.length === 1 && r.gesagt.length === 1 && /Talis/.test(r.gesagt[0]), JSON.stringify(r.gesagt));
        const r0 = await runde(app, 'Wie spät ist es?');
        check('2.4 Ein neues Thema ohne Bezugswort bekommt keinen Zusatz', r0.aufrufe.every(a => !/ANSCHLUSSFRAGE – BEZUG/.test(a.system)));
        const rn = await runde(app, 'Wie wird das Wetter morgen?');
        check('2.5 „Wie wird das Wetter morgen?“ (eigener Gegenstand) bekommt keinen erzwungenen Suchlauf', rn.aufrufe.every(a => !a.web));
    }

    /* ---- 3. Modell fragt zuerst nach -> ein zweiter Versuch mit dem Bezug ---- */
    {
        const app = neu({ modus: 'fragt1' });
        await runde(app, Q1);
        const r = await runde(app, 'Welches ist besser?');
        const ki = r.aufrufe.filter(a => !a.web);
        check('3.1 genau zwei KI-Aufrufe (Nachfrage, dann Antwort)', ki.length === 2, String(ki.length));
        check('3.2 zweiter Versuch trägt den Systemhinweis mit den Namen', /^Systemhinweis/.test(ki[1].letzte) && /Grohe Eurosmart/.test(ki[1].letzte));
        check('3.3 gesprochen wird nur die zweite Antwort, einmal', r.gesagt.length === 1 && /Talis S ist etwas hochwertiger/.test(r.gesagt[0]), JSON.stringify(r.gesagt));
        check('3.4 ein Verlaufspaar, ohne die Rückfrage', r.neuVerlauf === 2 && !/Welches Produkt/.test(JSON.stringify(verlauf(app).slice(-2))));
        const r2 = await runde(app, 'Zeig mir das zweite');
        check('3.5 „Zeig mir das zweite“ nutzt den Kontext (nicht „Welches Produkt meinst du?“)', !spricht(r2, /Welches Produkt meinst du/), JSON.stringify(r2.gesagt));
    }

    /* ---- 4. Händler und Preise nur über die Internetsuche ---- */
    {
        const app = neu({ modus: 'brav', webText: () => 'Ich finde keine verlässlichen Preise.' });
        await runde(app, Q1);
        const r = await runde(app, 'Was kosten die?');
        check('4.1 „Was kosten die?“ geht in die Internetsuche statt in eine KI-Schätzung', r.aufrufe.filter(a => a.web).length === 1 && /Grohe Eurosmart/.test(r.aufrufe.find(a => a.web).letzte), JSON.stringify(r.aufrufe.map(a => a.web)));
        check('4.2 gesprochen wird der Suchtext, keine erfundenen Preise', r.gesagt.length === 1 && /keine verlässlichen Preise/.test(r.gesagt[0]) && !/\d\s?(Euro|€)/.test(r.gesagt[0]));
        const r3 = await runde(app, 'Wo bekomme ich die am günstigsten?');
        check('4.3 „am günstigsten“ am Ende ändert nichts (Füllwörter)', r3.aufrufe.some(a => a.web));
        const r4 = await runde(app, 'Was kostet das Brot?');
        check('4.4 eigener Gegenstand („das Brot“) löst keine Suche nach den Wasserhähnen aus', !r4.aufrufe.some(a => a.web && /Grohe/.test(a.letzte)));
    }

    /* ---- 5. Themenwechsel, Mehrdeutigkeit, kein Bezug, Ablauf ---- */
    {
        const app = neu({ modus: 'fragt' });
        const r = await runde(app, Q2);
        check('5.1 ohne vorherige Antwort: keine Suche, kein erfundener Bezug (normale Rückfrage)', !r.aufrufe.some(a => a.web) && r.aufrufe.every(a => !/ANSCHLUSSFRAGE – BEZUG/.test(a.system)) && spricht(r, /Welches Produkt meinst du/), JSON.stringify(r.gesagt));
    }
    {
        const app = neu({ modus: 'fragt', skript: (l) => /Kühlschrank/.test(l) ? { reply: 'Ein Kühlschrank pumpt Wärme aus dem Innenraum nach außen: Ein Kältemittel verdampft innen und gibt die Wärme außen am Gitter wieder ab.' } : null });
        await runde(app, Q1);
        await runde(app, 'Wie funktioniert ein Kühlschrank?');
        const r = await runde(app, Q2);
        check('5.2 zwei verschiedene Themen: keine geratene Suche', !r.aufrufe.some(a => a.web), JSON.stringify(r.aufrufe.map(a => a.web)));
        check('5.3 Jarvis fragt selbst nach, auf welche Frage sich „die“ bezieht (kein erfundenes Produkt, kein KI-Aufruf)', r.aufrufe.length === 0 && r.gesagt.length === 1 && /Worauf bezieht sich das/.test(r.gesagt[0]) && /Wasserhähne/.test(r.gesagt[0]) && /Kühlschrank/.test(r.gesagt[0]), JSON.stringify(r.gesagt));
        check('5.3b die Rückfrage ersetzt keine gemerkte Antwort', app.sb.jvGespraech.antworten().length === 2);
    }
    {
        const app = neu({ modus: 'fragt' });
        await runde(app, Q1);
        await app.vorspulen(11 * MIN);
        const r = await runde(app, Q2);
        check('5.4 nach 11 Minuten ist der Bezug abgelaufen', !r.aufrufe.some(a => a.web) && r.aufrufe.every(a => !/ANSCHLUSSFRAGE – BEZUG/.test(a.system)));
    }

    {
        const app = neu({ modus: 'fragt' });
        const r = await runde(app, 'Wo bekomme ich die am günstigsten?');
        check('5.5 Preissuche ohne vorherige Antwort fragt weiter nach dem Produkt (bisheriges Verhalten)', spricht(r, /Welches Produkt soll ich suchen/), JSON.stringify(r.gesagt));
    }

    /* ---- 6. andere Produkte und Anschlussfragen ---- */
    {
        const app = neu({ modus: 'fragt', skript: (l) => /Staubsauger/.test(l) ? { reply: 'Ich würde den Dyson V15 Detect und den Miele Triflex HX2 in die engere Wahl nehmen, beide sind kabellos.' } : null,
            webText: (l) => 'Den Dyson V15 Detect gibt es im Fachhandel und online.' });
        await runde(app, 'Kannst du mir zwei Staubsauger empfehlen?');
        const r = await runde(app, 'Wo gibt es die?');
        check('6.1 Staubsauger: „Wo gibt es die?“ nutzt die Namen', r.aufrufe.some(a => a.web && /Dyson V15 Detect/.test(a.letzte)) && !spricht(r, /Welches Produkt meinst du/), JSON.stringify(r.gesagt));
        const r2 = await runde(app, 'Und welches ist leiser?');
        check('6.2 „Und welches ist leiser?“: Bezug in der Systemanweisung, zweiter Versuch bei Nachfrage', r2.aufrufe.filter(a => !a.web).length >= 1 && r2.aufrufe.filter(a => !a.web).every(a => /Dyson V15 Detect|Miele Triflex|Systemhinweis/.test(a.system + a.letzte)));
    }

    /* ---- 7. andere Wege schreiben die echte Antwort in den Verlauf: Fahrzeit, Nähe ---- */
    {
        const app = neu({ modus: 'fragt', skript: (l) => /Hamburg/.test(l) ? { reply: 'Ich schaue nach.', aktionen: [{ type: 'travel_time', travel_destination: 'Hamburg' }] }
            : /Restaurants/.test(l) ? { reply: 'Ich suche.', aktionen: [{ type: 'nearby_places', places_query: 'Restaurant' }] } : null });
        app.setze('computeDepartureAdvice', async () => ({ reply: 'Nach Hamburg brauchst du etwa 45 Minuten, aktuell ohne Stau.', card: { icon: '🚗', title: 'Hamburg', subtitle: '45 min' } }));
        const r = await runde(app, 'Wie lange brauche ich nach Hamburg?');
        const v = verlauf(app), l = v[v.length - 1];
        check('7.1 Fahrzeit: gesprochen einmal, Verlauf hält die echte Antwort', r.gesagt.length === 1 && /45 Minuten/.test(r.gesagt[0]) && /45 Minuten/.test(l.inhalt.reply) && l.inhalt.actions.length === 0, JSON.stringify(l));
        check('7.2 Fahrzeit: ein Verlaufspaar', r.neuVerlauf === 2, String(r.neuVerlauf));
        app.setze('findNearbyRestaurants', async () => ({ reply: 'Ich habe drei Lokale gefunden: Trattoria Roma, Elbblick und Zum Alten Hafen.', cards: [] }));
        const r2 = await runde(app, 'Zeig mir Restaurants in der Nähe');
        const v2 = verlauf(app), l2 = v2[v2.length - 1];
        check('7.3 Nähe: Verlauf hält die echte Antwort mit den Namen', /Trattoria Roma/.test(l2.inhalt.reply), JSON.stringify(l2));
        check('7.4 Nähe: eine Sprachausgabe', r2.gesagt.length === 1, JSON.stringify(r2.gesagt));
        const r3 = await runde(app, 'Wo kann ich die kaufen?');
        check('7.5 Nähe ist kein Produkt: „kaufen“ startet dort keine Internetsuche', !r3.aufrufe.some(a => a.web));
    }

    /* ---- 9. die drei belegten Fehlerfälle (Handytest vom 07.11., PR #370) als Dauertest ---- */
    const einkauf = app => app.lese('shoppingEntries').length;
    const SHOP = l => /Wo kann ich die kaufen/.test(l.split('\n')[0]) ? { reply: 'Welches Produkt willst du kaufen?', aktionen: [{ type: 'shopping', shopping_item: 'Produkt' }] } : null;
    {   // B: das Modell würde bei Frage 2 eine Einkaufslisten-Aktion anlegen und nachfragen
        const app = neu({ modus: 'fragt', skript: SHOP });
        await runde(app, Q1);
        const e0 = einkauf(app);
        const r = await runde(app, Q2);
        check('9.B1 Frage 2 geht direkt in die Internetsuche, das Modell wird gar nicht gefragt', r.aufrufe.filter(a => !a.web).length === 0 && r.aufrufe.filter(a => a.web).length === 1, JSON.stringify(r.aufrufe.map(a => a.web)));
        check('9.B2 gesprochen wird die Suchantwort, nicht „Welches Produkt willst du kaufen?“, genau einmal', r.gesagt.length === 1 && /Baumarkt/.test(r.gesagt[0]) && !/Welches Produkt/.test(r.gesagt[0]), JSON.stringify(r.gesagt));
        const wb = r.aufrufe.find(a => a.web);
        check('9.B3 die Suche enthält die zuvor genannten Modelle, nicht nur „die“', !!wb && /Grohe Eurosmart/.test(wb.letzte) && /Hansgrohe Talis S/.test(wb.letzte));
        check('9.B4 kein Eintrag auf der Einkaufsliste', einkauf(app) === e0, e0 + ' → ' + einkauf(app));
    }
    {   // B': ohne Bezug (kein Merker) legt eine Händlerfrage trotzdem nie einen Einkaufslisten-Eintrag an
        const app = neu({ modus: 'fragt', skript: SHOP });
        const e0 = einkauf(app);
        const r = await runde(app, Q2);
        check('9.B5 ohne Merker: Modell fragt wie bisher nach, aber die Einkaufslisten-Aktion wird verworfen', einkauf(app) === e0 && spricht(r, /Welches Produkt willst du kaufen/), e0 + ' → ' + einkauf(app) + ' ' + JSON.stringify(r.gesagt));
        const app2 = neu({ modus: 'fragt', skript: l => /Wo kann ich Milch kaufen/.test(l.split('\n')[0]) ? { reply: 'Das bekommst du in jedem Supermarkt.', aktionen: [{ type: 'shopping', shopping_item: 'Milch' }] } : null });
        await runde(app2, 'Wo kann ich Milch kaufen?');
        check('9.B6 „Wo kann ich Milch kaufen?“ (Frage) legt keine Milch auf die Liste', einkauf(app2) === 0, String(einkauf(app2)));
        const app3 = neu({ modus: 'fragt', skript: l => /Setz Milch auf die Einkaufsliste/.test(l.split('\n')[0]) ? { reply: 'Erledigt.', aktionen: [{ type: 'shopping', shopping_item: 'Milch' }] } : null });
        await runde(app3, 'Setz Milch auf die Einkaufsliste');
        check('9.B7 ein echter Auftrag („Setz Milch auf die Einkaufsliste“) funktioniert weiter', einkauf(app3) === 1, String(einkauf(app3)));
    }
    {   // D: die Antwort auf Frage 1 endet mit einer Rückfrage
        const app = neu({ modus: 'fragt', skript: l => /Wasserhähne/.test(l) ? { reply: 'Ich empfehle den Grohe Eurosmart und den Hansgrohe Talis S, beide sind im Bad bewährt. Soll ich dir Preise raussuchen?' } : null });
        await runde(app, Q1);
        check('9.D1 die Antwort mit Schlussfrage steht im Merker', app.sb.jvGespraech.antworten().length === 1 && /Talis S/.test(app.sb.jvGespraech.antworten()[0].text));
        const r = await runde(app, Q2);
        check('9.D2 Frage 2 führt zur Internetsuche mit den Modellen', r.aufrufe.filter(a => a.web).length === 1 && /Grohe Eurosmart/.test((r.aufrufe.find(a => a.web) || {}).letzte || '') && !spricht(r, /Welches Produkt/), JSON.stringify(r.gesagt));
        const app2 = neu({ modus: 'fragt', skript: l => /Wasserhähne/.test(l) ? { reply: 'Welches Produkt meinst du?' } : null });
        await runde(app2, Q1);
        check('9.D3 eine reine Rückfrage wird weiterhin NICHT gemerkt', app2.sb.jvGespraech.antworten().length === 0);
    }
    {   // E: dieselbe Frage 1 noch einmal innerhalb von 10 Minuten
        const app = neu({ modus: 'fragt' });
        await runde(app, Q1); await runde(app, Q2); await runde(app, Q1);
        const r = await runde(app, Q2);
        check('9.E1 wiederholte Frage 1 erzeugt keine Mehrdeutigkeit (ein Thema)', app.sb.jvGespraech.antworten().filter(a => a.frage === Q1).length === 1);
        check('9.E2 Frage 2 geht wieder direkt zur Suche', r.aufrufe.filter(a => a.web).length === 1 && !spricht(r, /Worauf bezieht|Welches Produkt/), JSON.stringify(r.gesagt));
        const r3 = await runde(app, Q2);
        check('9.E3 auch ein drittes Mal', r3.aufrufe.filter(a => a.web).length === 1 && !spricht(r3, /Worauf bezieht|Welches Produkt/));
    }
    {   // Mehrdeutig: wirklich zwei Themen -> Jarvis fragt selbst
        const app = neu({ modus: 'fragt', skript: l => /Kühlschrank/.test(l) ? { reply: 'Ein Kühlschrank pumpt Wärme aus dem Innenraum nach außen und gibt sie am Gitter wieder ab.' } : null });
        await runde(app, Q1); await runde(app, 'Wie funktioniert ein Kühlschrank?');
        const e0 = einkauf(app);
        const r = await runde(app, Q2);
        check('9.M1 echte Mehrdeutigkeit: Jarvis fragt nach, keine Suche, kein erfundenes Produkt, keine Liste', !r.aufrufe.some(a => a.web) && spricht(r, /Worauf bezieht sich das/) && einkauf(app) === e0, JSON.stringify(r.gesagt));
        const r2 = await runde(app, 'Die Wasserhähne');
        check('9.M2 Antwort auf die Nachfrage wird nicht als Produkt „Die Wasserhähne“ auf die Liste gelegt', einkauf(app) === e0);
    }
    {   // zweiter KI-Versuch: die verworfene erste Antwort führt keine Aktion aus
        const app = neu({ modus: 'fragt1', skript: (l, k) => (/Welches ist besser/.test(l.split('\n')[0]) && !k.hinweis) ? { reply: 'Welches Produkt meinst du?', aktionen: [{ type: 'shopping', shopping_item: 'Wasserhahn' }] } : null });
        await runde(app, Q1);
        const e0 = einkauf(app);
        const r = await runde(app, 'Welches ist besser?');
        check('9.Z1 zweiter Versuch liefert die Antwort', r.aufrufe.filter(a => !a.web).length === 2 && spricht(r, /Talis S ist etwas hochwertiger/), JSON.stringify(r.gesagt));
        check('9.Z2 die Einkaufslisten-Aktion des verworfenen ersten Versuchs wurde NICHT ausgeführt', einkauf(app) === e0, e0 + ' → ' + einkauf(app));
        const app2 = neu({ modus: 'fragt', skript: (l, k) => /Welches ist besser/.test(l.split('\n')[0]) ? { reply: 'Welches Produkt meinst du?', aktionen: [{ type: 'shopping', shopping_item: 'Wasserhahn' }] } : null });
        await runde(app2, Q1);
        await runde(app2, 'Welches ist besser?');
        check('9.Z3 fragt das Modell auch beim zweiten Mal nach, bleibt die Liste ebenfalls unberührt', einkauf(app2) === 0, String(einkauf(app2)));
    }
    {   // Diagnose
        const app = neu({ modus: 'fragt' });
        app.sb.setPersistentData('helfer_diag', '1');
        await runde(app, Q1);
        await runde(app, Q2);
        const zeilen = (app.lese('diagLines') || []).join('\n');
        check('9.G1 Diagnose zeigt Dateiversion, Bezug und Pfad', /Anschluss: Datei \S+ \| Bezug: 1 Antwort\(en\), 1 Thema\/Themen, jüngste: antwort, vor \d+ s \| Pfad: direkt/.test(zeilen), zeilen.slice(-400));
        check('9.G2 Diagnose enthält keine Antwortinhalte der Empfehlung und keine Schlüssel', !/Hansgrohe/.test(zeilen.split('\n').filter(z => /^Anschluss:/.test(z)).join('\n')) && !/gsk_|APP_SECRET|x-app-key/i.test(zeilen));
    }

    /* ---- 8. Grenzen, Langzeitgedächtnis unberührt ---- */
    {
        const app = neu({ modus: 'brav' });
        const vorher = JSON.stringify(Object.keys(app.store || {}).filter(k => !/^jv_(tageslog|laune|routinen)/.test(k)).sort());
        await runde(app, Q1);
        const st = app.sb.jvGespraech.status();
        check('8.1 Gedächtnis hält höchstens 3 Antworten, ohne Inhalte im Status', st.antworten >= 1 && st.antworten <= 3 && !JSON.stringify(st).includes('Grohe'));
        for (let i = 0; i < 6; i++) await runde(app, 'Erzähl mir etwas Nr ' + i + ' bitte etwas längeres als Okay');
        check('8.2 nie mehr als 3 Antworten', app.sb.jvGespraech.status().antworten <= 3);
        const al = app.sb.jvGespraech.antworten();
        check('8.3 Text je Antwort höchstens 700 Zeichen', al.every(a => a.text.length <= 700));
        const nachher = JSON.stringify(Object.keys(app.store || {}).filter(k => !/^jv_(tageslog|laune|routinen)/.test(k)).sort());
        check('8.4 keine neuen Speicherschlüssel (Langzeitgedächtnis unberührt)', vorher === nachher, vorher + ' | ' + nachher);
        app.sb.jvGespraech.vergiss();
        check('8.5 vergiss() leert die Antworten', app.sb.jvGespraech.status().antworten === 0);
    }

    console.log('Anschlussfragen: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
