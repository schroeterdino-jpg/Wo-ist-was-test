/* ============================================================
   SIMULIERTE WELT für den Meldungs-Messlauf (C1). Wird von tests/meldungen.js benutzt. Ändert keinen App-Code.
   Zwei Läufe:
     'tag'   Mittwoch 28.10.2026, 12:00 bis 15:10, Spätschicht (Briefing ab 12:45), Termin "Arzt Hamburg" 15:00 mit Ort,
             Erinnerung 14:30, dazu Bank-Mail, wichtige Mail, Mahnung, Paket, Preis-Treffer, Auftrag, WhatsApp im Fahrmodus,
             Alarm, Supermarkt-Ansage, Routine, Meldung der Handy-App, Parkplatz, Autoansicht.
     'nacht' Sonntag 01.11.2026 21:00 bis Montag 02.11.2026 10:00, Montag ist Frühschicht (Briefing ab 3:30, Ruhezeit bis dahin):
             Erinnerungen in der Ruhezeit, Mails in der Nacht, Alarm, Auftrag, WhatsApp, morgens Tagesüberblick.
   Annahme für beide Läufe: die App ist die ganze Zeit offen und sichtbar (das ist der ungünstigste Fall; in der Praxis läuft nachts
   vieles nur über Handy-App oder Push). Netz und Handy-Brücke sind feste Attrappen. Alle Varianten (mit/ohne Beobachter) bekommen dasselbe.
   ============================================================ */
'use strict';
const { starte } = require('./umgebung.js');

const antwort = o => ({ ok: true, status: 200, json: async () => o, text: async () => JSON.stringify(o) });
const aus = s => ({ ok: false, status: s, json: async () => ({}), text: async () => '' });
const b64url = t => Buffer.from(String(t), 'utf8').toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const ms = iso => Date.parse(iso);

/* ---------- die Läufe ---------- */
const LAEUFE = {
    tag: {
        name: 'Nachmittag (Mi 28.10.2026, 12:00 bis 15:10)',
        start: '2026-10-28T12:00:00+01:00', ende: '2026-10-28T15:10:00+01:00',
        schicht: { datum: { y: 2026, m: 10, d: 28 }, shift: 'spaet' },
        termine: [{ id: 'gcal_arzt_0815', text: 'Arzt Hamburg', iso: '2026-10-28T15:00:00+01:00', ort: 'Hamburg' }, { id: 'gcal_schwimmen_0816', text: 'Schwimmen Hallenbad', iso: '2026-10-28T13:50:00+01:00', ort: '' }],
        geburtstag: { ymd: '2026-11-01', titel: 'Geburtstag Oma Ute' },
        erinnerung: { text: 'Unterlagen für den Arzt', zeit: '2026-10-28T14:30:00' },
        mails: [
            { id: 'bank_1', art: 'bank', ab: '2026-10-28T12:20:00+01:00', von: 'Sparkasse Lüneburg <noreply@sparkasse.de>', betreff: 'Kontobewegung: Gutschrift 120,00 EUR', text: 'Auf Ihrem Konto ist eine Gutschrift von 120,00 EUR eingegangen.' },
            { id: 'mw_1', art: 'wichtig', ab: '2026-10-28T12:35:00+01:00', von: 'Frau Becker <becker@grundschule-sbk.de>', betreff: 'Elternabend: bitte um Rückmeldung', text: 'Können Sie uns bitte bis Freitag Bescheid geben, ob Sie kommen?' },
            { id: 'fr_1', art: 'frist', ab: '2026-10-28T12:40:00+01:00', von: 'Stadtwerke Schwarzenbek <inkasso@stadtwerke-sbk.de>', betreff: 'Mahnung Rechnung 4711', text: 'Wir bitten um Zahlung von 89,90 Euro bis zum 05.11.2026.' }
        ],
        fristErinnerungAb: '2026-10-28T12:50:00+01:00',
        auftragAb: '2026-10-28T13:10:00+01:00',
        paket: true, preis: true, routine: true, shopping: ['Milch', 'Brot', 'Kaffee'],
        nativ: { parkplatz: true, appMeldung: true, autoansicht: true },
        pushBriefKarteBeimStart: true,
        aktionen: [
            { at: '2026-10-28T12:03:00+01:00', was: 'tipp' },                     // erster Tipp auf den Bildschirm (Start-Ansage "Systeme online")
            { at: '2026-10-28T12:10:00+01:00', was: 'whatsapp' },                 // WhatsApp-Nachricht im Fahrmodus
            { at: '2026-10-28T12:23:00+01:00', was: 'satz', text: 'Nein' },       // auf die Frage "Soll ich die Mail vorlesen?" antwortet er mit Nein
            { at: '2026-10-28T12:24:00+01:00', was: 'satz', text: 'Nein' },       // und auf "Willst du antworten?" auch
            { at: '2026-10-28T12:37:00+01:00', was: 'satz', text: 'Nein' },       // zweite Mail (Frau Becker): wieder zweimal Nein
            { at: '2026-10-28T12:38:00+01:00', was: 'satz', text: 'Nein' },
            { at: '2026-10-28T13:00:00+01:00', was: 'plan', id: 'aufbruch|2026-10-28' },   // Handy-App holt die Aufbruchs-Ansage ab
            { at: '2026-10-28T14:40:00+01:00', was: 'alarm' },                    // Warn-Push erreicht die offene App
            { at: '2026-10-28T14:45:00+01:00', was: 'plan', id: 'geb|2026-11-01|Geburtstag Oma Ute' },   // Geschenk-Vorfrage aus dem Plan
            { at: '2026-10-28T14:50:00+01:00', was: 'ort' }                       // Handy-App meldet: im Supermarkt angekommen
        ]
    },
    nacht: {
        name: 'Nacht (So 01.11.2026 21:00 bis Mo 02.11.2026 10:00)', nachtlauf: true,
        start: '2026-11-01T21:00:00+01:00', ende: '2026-11-02T10:00:00+01:00',
        schicht: { datum: { y: 2026, m: 11, d: 2 }, shift: 'frueh' },
        termine: [],
        erinnerungen: [{ text: 'Mülltonnen rausstellen', zeit: '2026-11-01T22:30:00' }, { text: 'Brotdose einpacken', zeit: '2026-11-02T04:05:00' }],
        mails: [
            { id: 'bank_2', art: 'bank', ab: '2026-11-02T02:10:00+01:00', von: 'Sparkasse Lüneburg <noreply@sparkasse.de>', betreff: 'Kontobewegung: Lastschrift 54,20 EUR', text: 'Von Ihrem Konto wurden 54,20 EUR abgebucht.' },
            { id: 'mw_2', art: 'wichtig', ab: '2026-11-02T02:20:00+01:00', von: 'Herr Krüger <krueger@handwerk-sbk.de>', betreff: 'Angebot Dachrinne: bitte um Rückruf', text: 'Können Sie mich morgen zurückrufen wegen des Angebots?' },
            { id: 'fr_2', art: 'frist', ab: '2026-11-02T02:30:00+01:00', von: 'Stadtwerke Schwarzenbek <inkasso@stadtwerke-sbk.de>', betreff: 'Mahnung Rechnung 4712', text: 'Wir bitten um Zahlung von 91,40 Euro bis zum 08.11.2026.' }
        ],
        geburtstag: null,
        fristErinnerungAb: '2026-11-02T03:00:00+01:00',
        auftragAb: '2026-11-02T01:00:00+01:00',
        paket: false, preis: false, routine: false, shopping: [],
        nativ: { parkplatz: false, appMeldung: true, autoansicht: true },
        pushBriefKarteBeimStart: false,
        aktionen: [
            { at: '2026-11-01T21:05:00+01:00', was: 'tipp' },
            { at: '2026-11-01T23:00:00+01:00', was: 'whatsapp' },
            { at: '2026-11-02T03:00:00+01:00', was: 'alarm' },
            { at: '2026-11-02T07:05:00+01:00', was: 'oeffnen' }                  // Handy in die Hand genommen, App morgens geöffnet (Tagesüberblick)
        ]
    }
};

/* ---------- Netz-Attrappe, abhängig von der virtuellen Uhrzeit ---------- */
function netz(def, jetzt, zust) {
    const mails = def.mails.map(m => Object.assign({}, m, { abMs: ms(m.ab) }));
    const sichtbar = art => mails.filter(m => m.art === art && m.abMs <= jetzt());
    return function (url, opt) {
        const u = String(url);
        let body = null; try { body = opt && opt.body ? JSON.parse(opt.body) : null; } catch (e) { }
        if (/googleapis\.com\/calendar\/v3\/calendars\/primary\/events/.test(u)) return antwort({ items: def.termine.map(t => ({ id: t.id, summary: t.text, status: 'confirmed', start: { dateTime: t.iso }, location: t.ort })) });
        if (/nominatim\.openstreetmap\.org\/reverse/.test(u)) return antwort({ address: { city: 'Lüneburg', country: 'Deutschland', road: 'Am Markt', house_number: '1' } });
        if (/\/api\/geocode/.test(u)) return antwort([{ lat: '53.5511', lon: '9.9937', display_name: 'Hamburg, Deutschland' }]);
        if (/\/api\/route/.test(u)) return antwort({ routes: [{ duration: 2400, distance: 42000 }] });
        if (/open-meteo|weather|wetter/i.test(u)) return antwort({ current: { temperature_2m: 11, weather_code: 3, wind_speed_10m: 10 }, hourly: { time: [], precipitation: [] }, daily: { time: [new Date(jetzt()).toISOString().slice(0, 10)], temperature_2m_max: [12], temperature_2m_min: [6], weather_code: [3], precipitation_sum: [0] } });
        /* Gmail */
        const g = /gmail\.googleapis\.com\/gmail\/v1\/users\/me\/(.*)$/.exec(u);
        if (g) {
            const pfad = g[1];
            if (/^drafts\?/.test(pfad) || pfad === 'drafts') return opt && opt.method === 'POST' ? antwort({ id: 'entwurf_' + jetzt() }) : antwort({ drafts: [] });
            const einzel = /^messages\/([^?]+)\?format=(full|metadata)/.exec(pfad);
            if (einzel) {
                const m = mails.find(x => x.id === decodeURIComponent(einzel[1]));
                if (!m) return aus(404);
                return antwort({ id: m.id, threadId: 't_' + m.id, snippet: m.text, labelIds: ['UNREAD', 'INBOX'], internalDate: String(m.abMs),
                    payload: { mimeType: 'text/plain', body: { data: b64url(m.text) }, headers: [{ name: 'From', value: m.von }, { name: 'Subject', value: m.betreff }, { name: 'Date', value: new Date(m.abMs).toUTCString() }, { name: 'Message-ID', value: '<' + m.id + '@test>' }] } });
            }
            if (/^messages\?/.test(pfad)) {
                const q = decodeURIComponent((/[?&]q=([^&]*)/.exec(pfad) || [, ''])[1]);
                let liste = [];
                if (/(^|\s)category:promotions/.test(q)) return antwort({ messages: [], resultSizeEstimate: 0 });
                else if (/Rechnung OR Mahnung/.test(q)) liste = sichtbar('frist');
                else if (/from:sparkasse/.test(q)) liste = sichtbar('bank');
                else if (/^in:inbox is:unread/.test(q)) liste = sichtbar('wichtig');                 // Mail-Nachtschicht
                else if (/^is:unread/.test(q)) liste = sichtbar('wichtig').concat(sichtbar('bank'));  // wichtige Mail (mailwatch)
                return antwort({ messages: liste.map(m => ({ id: m.id, threadId: 't_' + m.id })), resultSizeEstimate: liste.length });
            }
            return aus(404);
        }
        /* KI */
        if (/\/api\/groq/.test(u) && body && body.messages && body.messages[0]) {
            const s = String(body.messages[0].content);
            const gib = o => antwort({ choices: [{ message: { content: JSON.stringify(o) } }] });
            if (/Fristen-Übersicht/.test(s)) return gib({ relevant: true, art: 'Mahnung', titel: 'Stadtwerke-Mahnung', datum: '2026-11-05', betrag: '89,90 Euro', zusammenfassung: 'Die Zahlung ist überfällig.' });
            if (/antwort_noetig/.test(s)) return gib({ antwort_noetig: true, grund: 'Es wird um Rückmeldung gebeten.', text: 'Guten Tag, danke für Ihre Nachricht, ich melde mich in Kürze. Viele Grüße Dino' });
            if (/TERMIN/.test(s)) return gib({ termin: false });
            if (/NEUE DATEN/.test(s)) return gib({ melden: true, thema: 'allgemein', text: 'Guten Tag, Dino. Hier ist deine Tagesmeldung.', aktion: 'keine', grund: 'Schicht heute' });
            return aus(503);
        }
        /* Gedächtnis-Server: nur Fristen */
        if (/\/api\/memory/.test(u) && body) {
            if (body.action === 'fristen') {
                if (body.all || zust.fristMarkiert || jetzt() < ms(def.fristErinnerungAb)) return antwort({ fristen: [] });
                return antwort({ fristen: [{ id: 'frist_fr', text: 'Stadtwerke-Mahnung', tage: 2, stufe: 'vor2', metadata: { titel: 'Stadtwerke-Rechnung', betrag: '89,90 Euro' } }] });
            }
            if (body.action === 'mark') { zust.fristMarkiert = true; return antwort({ ok: true }); }
            if (body.action === 'store') return antwort({ ok: true });
        }
        /* Aufträge, Pakete, Preise */
        if (/\/api\/sync\?action=push_watch_poll/.test(u)) {
            if (!zust.auftragGeliefert && jetzt() >= ms(def.auftragAb)) { zust.auftragGeliefert = true; return antwort({ msgs: [{ id: 'auftrag_diesel', body: 'Diesel ist jetzt unter 1,65 Euro. Die günstigste Tankstelle ist Aral in Schwarzenbek.' }] }); }
            return antwort({ msgs: [] });
        }
        if (/\/api\/sync\?action=push_(alive|watch_list|gone)/.test(u)) return antwort({ ok: true, list: [] });
        if (/\/api\/bahn\?aktion=paket/.test(u)) return antwort({ code: 'delivered', status: 'Zugestellt', beschreibung: 'Das Paket wurde zugestellt.', zeit: new Date(jetzt() - 600000).toISOString() });
        if (/\/api\/maps\?action=shopping/.test(u)) return antwort({ angebote: [{ preis: 239, shop: 'Otto', titel: 'Sony WH-1000XM4 Kopfhörer', link: 'https://example.test/sony' }] });
        return aus(503);
    };
}

/* ---------- Lauf aufbauen und durchspielen ---------- */
async function laufen(art, opt) {
    opt = opt || {};
    const def = LAEUFE[art];
    const zust = { fristMarkiert: false, auftragGeliefert: false };
    let M = null;
    const jetzt = () => (M ? M.uhr.ms : ms(def.start));
    const fetchFn = netz(def, jetzt, zust);
    M = starte({ native: true, jetzt: def.start, sekundenTakt: true, weitereTakte: [10000], festerZufall: true, sprechenBeendet: true, sprechdauer: true, fetch: async (u, o) => fetchFn(u, o), ohneSkripte: opt.ohne ? ['meldungen.js', 'meldungs_regeln.js'] : (opt.ohneShadow ? ['meldungs_regeln.js'] : []) });
    const sb = M.sb;
    if (opt.kaputt) {
        const kaputt = () => { throw new Error('Beobachter kaputt'); };
        sb.jvMeldungen = { beobachte: kaputt, bezugTermin: kaputt, bezugTerminId: kaputt, bezugErinnerung: kaputt, bezugErinnerungTextZeit: kaputt, bezugTag: kaputt, bezugId: kaputt, folgeAusloeser: kaputt, bezugAusWaechterId: kaputt, herkunftApp: kaputt };
    }
    if (opt.shadowAus && sb.jvRegeln) sb.jvRegeln.aus();
    if (opt.shadowKaputt) {   // Shadow wirft bei jedem Aufruf Fehler; zusätzlich meldet sich ein zweiter Mitleser, der ebenfalls immer wirft
        const kaputtS = () => { throw new Error('Shadow kaputt'); };
        if (sb.jvMeldungen && sb.jvMeldungen.abonniere) sb.jvMeldungen.abonniere(kaputtS);
        if (sb.jvRegeln) ['liste', 'ausgeloest', 'leeren', 'aus', 'einschalten', 'istAn', 'nutzerAktiv', 'nachliefervorschau'].forEach(k => { try { sb.jvRegeln[k] = kaputtS; } catch (e) { } });
    }
    M.mikro = [];   // Aufrufe von startListening (Mikrofon wird geöffnet), mit virtueller Zeit
    { const echt = sb.startListening; sb.startListening = function () { M.mikro.push(M.uhr.ms); return typeof echt === 'function' ? echt.apply(this, arguments) : undefined; }; }
    sb.navigator.geolocation.getCurrentPosition = (okFn) => okFn({ coords: { latitude: 53.4, longitude: 10.2 } });   // Standort bekannt
    sb.navigator.userActivation = { hasBeenActive: true };    // der Bildschirm wurde schon einmal angetippt (sonst wartet mailwatch auf den ersten Tipp)
    sb.document.visibilityState = 'visible';
    sb.document.hidden = false;
    M.vm.runInContext("accessToken = 'test-token'; googleTokenExpiresAt = Date.now() + 86400000 * 30;", sb);   // Google verbunden (Attrappe)
    const T = sb._schichtTest;
    M.store['jv_schicht'] = JSON.stringify({ base: T.weekNo(def.schicht.datum), shift: def.schicht.shift, times: { frueh: 210, spaet: 765 }, auto: true });
    M.store['jv_konto_gesehen'] = '[]'; M.store['jv_mailwatch_seen'] = '[]';   // nicht der allererste Lauf: neue Mails werden gemeldet
    if (def.termine.length) M.vm.runInContext('calendarEntries = ' + JSON.stringify(def.termine.map(t => ({ id: t.id, text: t.text, date: '', isoDate: t.iso, eventType: 'default', recurring: false, location: t.ort }))), sb);
    if (def.shopping.length) M.vm.runInContext('shoppingEntries = ' + JSON.stringify(def.shopping.map(t => ({ text: t }))), sb);
    if (def.geburtstag) M.store['jv_zuvor_geb'] = JSON.stringify([def.geburtstag]);
    if (def.paket) M.store['jv_pakete'] = JSON.stringify([{ nr: '123456789012', name: 'Amazon', code: 'transit', status: 'In Zustellung', beschr: 'Das Paket ist in der Zustellung.' }]);
    if (def.preis) M.store['jv_preiswaechter'] = JSON.stringify([{ q: 'Sony Kopfhörer', grenze: 250 }]);
    if (def.routine) {
        const log = ['2026-10-14', '2026-10-21', '2026-10-26'].map(d => ({ k: 'einkauf', d, m: 13 * 60 + 30, w: 3 }));
        M.store['helfer_jv_routinen'] = JSON.stringify({ log, routines: [{ id: 'wetter@15', k: 'wetter', m: 14 * 60 + 45, wd: [3], n: 4, status: 'ja' }], state: {} });
        try { sb.setPersistentData('jv_routinen', JSON.stringify({ log, routines: [{ id: 'wetter@15', k: 'wetter', m: 14 * 60 + 45, wd: [3], n: 4, status: 'ja' }], state: {} })); } catch (e) { }
    }
    /* Handy-Brücke: einige Abholstellen liefern genau einmal etwas */
    const einmal = {};
    const gib = (name, wert) => () => { if (einmal[name]) return ''; einmal[name] = true; return wert; };
    const ueber = {};
    if (def.nativ.parkplatz) ueber.holeParkplatz = gib('park', JSON.stringify({ lat: 53.58, lon: 10.12, at: jetzt() - 120000 }));
    if (def.nativ.appMeldung) ueber.holeMeldung = gib('meldung', JSON.stringify({ titel: 'Vertretung', text: 'Ich habe Mama auf ihre WhatsApp geantwortet.' }));
    if (def.nativ.autoansicht) ueber.holeAutoansicht = gib('auto', true);
    const orig = sb.ZaneNative;
    sb.ZaneNative = new Proxy(orig, { get: (t, k) => (typeof k === 'string' && k in ueber) ? ueber[k] : t[k] });
    if (def.pushBriefKarteBeimStart) sb.location.href = 'http://test/?brief=1&t=' + encodeURIComponent('Briefing') + '&b=' + encodeURIComponent('Guten Tag, Dino. Heute hast du Spätschicht.');
    { const dummy = () => new Proxy(function () { }, { get: (t, k) => k === 'style' ? {} : (k === 'textContent' || k === 'value' || k === 'innerHTML' ? '' : dummy()), set: () => true, apply: () => dummy() });
      const echt = sb.document.getElementById; sb.document.getElementById = id => /^aa-/.test(String(id)) ? dummy() : echt.apply(sb.document, arguments); }   // Bauteile der Autoansicht gibt es in der Attrappe nicht
    const taps = [];
    const origAdd = sb.document.addEventListener;
    sb.document.addEventListener = function (ev, fn) { if (ev === 'pointerdown') taps.push(fn); return origAdd.apply(this, arguments); };

    /* Erinnerungen wie vom Nutzer gesagt */
    const rems = def.erinnerungen || (def.erinnerung ? [def.erinnerung] : []);
    for (const r of rems) { await M.ki('Erinnere mich an ' + r.text, [{ type: 'reminder', reminder_text: r.text, reminder_time: r.zeit }]); await M.vorspulen(1500); }   // 1,5 s dazwischen: jede Erinnerung bekommt ihre eigene ID (die ID entsteht aus der Uhrzeit)
    await M.vorspulen(2000);

    async function spule(dauer) { while (dauer > 0) { const schritt = Math.min(dauer, 15 * 60000); await M.vorspulen(schritt); dauer -= schritt; } }   // in Stücken (der Zeitgeber-Lauf ist begrenzt)
    const nutzer = () => { try { if (sb.jvRegeln && typeof sb.jvRegeln.nutzerAktiv === 'function') sb.jvRegeln.nutzerAktiv(); } catch (e) { } };   // meldet der Shadow-Datei die Handlung des simulierten Nutzers (Sprache hat in der Attrappe kein Tippen)
    const tun = {
        tipp: async () => { nutzer(); taps.slice().forEach(fn => { try { fn({}); } catch (e) { } }); },
        whatsapp: async () => { try { sb.jvFahrWA.nachricht({ id: 'wa_' + jetzt(), name: 'Julia', text: 'Kannst du Milch mitbringen?', kann: true }); } catch (e) { } },
        plan: async a => { try { await sb.jvPlan.ansage(a.id, false, true); } catch (e) { } },
        alarm: async () => { try { sb.jvAlarm({ stufe: 'rot', titel: 'Glatteis', text: 'Glättegefahr auf deiner Strecke. Plan mehr Zeit ein.' }); } catch (e) { } },
        ort: async () => { try { await sb.jvPlan.ansage('ort|' + jetzt() + '|REWE Schwarzenbek', false, true); } catch (e) { } },
        satz: async a => { nutzer(); try { await M.satz(a.text); } catch (e) { } },
        oeffnen: async () => { nutzer(); try { await sb.uebMaybeShow(); } catch (e) { } }
    };
    for (const a of def.aktionen) {
        const bis = ms(a.at);
        if (bis > M.uhr.ms) await spule(bis - M.uhr.ms);
        let fertig = false;
        const lauf = Promise.resolve(tun[a.was](a)).then(() => { fertig = true; }, () => { fertig = true; });
        await M.vorspulen(1000);
        for (let i = 0; i < 60 && !fertig; i++) await M.vorspulen(1000);   // wartet die Handlung auf einen Zeitgeber (zum Beispiel "bereit?"), läuft die Zeit weiter statt zu hängen
        await lauf;
    }
    const ende = ms(def.ende);
    if (ende > M.uhr.ms) await spule(ende - M.uhr.ms);
    M.def = def; M.art = art;
    return M;
}

module.exports = { laufen, LAEUFE };
