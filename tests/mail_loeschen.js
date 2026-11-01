/* ============================================================
   TESTS: Mails flexibel in den Papierkorb legen (js/mailaktionen.js). Start: node tests/mail_loeschen.js
   Echte Module (mail.js, mailaktionen.js, die ganze Befehls-Kette), Attrappe nur für das Netz (Gmail-Antworten).
   Vorher fiel "Lösch alle" (ohne das Wort Mail) bis zur KI durch ("Das kann ich leider nicht tun").
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }

const MAILS = [
    { id: 'm1', von: 'Anna Beispiel <anna@beispiel.de>', betreff: 'Kaffee am Samstag?' },
    { id: 'm2', von: 'GitHub <noreply@github.com>', betreff: 'Neuer Pull Request' },
    { id: 'm3', von: 'Vercel <notifications@vercel.com>', betreff: 'Deployment fertig' },
    { id: 'm4', von: 'Sparkasse <info@sparkasse.de>', betreff: 'Wichtig: Rechnung und Frist' },   // als wichtig eingestuft
    { id: 'm5', von: 'Matze <matze@arbeit.de>', betreff: 'Schichttausch' },
    { id: 'm6', von: 'Shop <news@shop.de>', betreff: 'Angebot der Woche' }
];
const WERBUNG = ['p1', 'p2', 'p3'];

/* Gmail-Attrappe: protokolliert alle Schreibzugriffe */
function gmail(st) {
    return async (u, o) => {
        const m = u.match(/gmail\.googleapis\.com\/gmail\/v1\/users\/me\/(.*)$/);
        if (!m) throw new Error('offline (Attrappe): ' + u);
        const pfad = m[1], antw = (status, body) => ({ status, ok: status >= 200 && status < 300, json: async () => { if (body === undefined) throw new Error('leer'); return body; } });
        if (pfad === 'messages/batchModify') { st.batch.push(JSON.parse(o.body)); return st.batchFehler ? antw(500, {}) : antw(204); }
        let t = pfad.match(/^messages\/([^/?]+)\/trash$/);
        if (t) { st.trash.push(t[1]); return st.trashFehler ? antw(500, {}) : antw(200, { id: t[1] }); }
        if (pfad.startsWith('labels/UNREAD')) return antw(200, { messagesUnread: 57 });
        let d = pfad.match(/^messages\/([^/?]+)\?format=metadata/);
        if (d) {
            const x = MAILS.find(e => e.id === d[1]); if (!x) return antw(404, {});
            return antw(200, { id: x.id, threadId: 't' + x.id, snippet: '', labelIds: ['INBOX', 'UNREAD'], internalDate: '1', payload: { headers: [{ name: 'From', value: x.von }, { name: 'Subject', value: x.betreff }, { name: 'Date', value: 'Wed, 28 Oct 2026 08:00:00 +0100' }] } });
        }
        if (pfad.startsWith('messages?')) {
            const q = decodeURIComponent(pfad.split('&q=')[1] || '');
            if (/category:promotions/.test(q)) return antw(200, { messages: WERBUNG.map(id => ({ id })) });
            const f = q.match(/from:(\S+)/);
            const l = f ? MAILS.filter(e => e.von.toLowerCase().includes(f[1].toLowerCase())) : MAILS;
            return antw(200, { messages: l.map(e => ({ id: e.id })) });
        }
        return antw(404, {});
    };
}

/* mitListe: erst die echte Mailübersicht holen (setzt lastEmailList und den Frische-Merker) */
async function neu(o) {
    o = o || {};
    const st = { batch: [], trash: [], batchFehler: !!o.batchFehler, trashFehler: !!o.trashFehler };
    const A = starte({ jetzt: '2026-10-28T10:00:00+01:00', festerZufall: true, fetch: gmail(st) });
    A.vm.runInContext("accessToken = 'x'; googleTokenExpiresAt = Date.now() + 3600000;", A.sb);
    if (o.mitListe !== false) await A.lassLaufen(() => A.vm.runInContext('fetchEmailOverview({ max: 6, rank: false })', A.sb));
    A.st = st;
    A.listeIds = () => A.vm.runInContext('lastEmailList.map(e => e.id).join(",")', A.sb);
    A.zustand = () => A.sb.jvMailAktionen._zustand();
    A.sag = async t => { const x = await A.satz(t); return { x, text: x.gesagt.join(' | '), mail: /mailaktionen/.test(x.modul || '') }; };
    return A;
}
const ids = b => (b ? b.ids.join(',') : '');

(async () => {
    /* 1) "Lösch alle" mit aktivem Mail-Kontext: erst fragen, bei Ja alle IDs in den Papierkorb */
    {
        const A = await neu();
        check('0 Vorbereitung: Liste hat 6 Mails', A.listeIds() === 'm1,m2,m3,m4,m5,m6', A.listeIds());
        const a = await A.sag('Lösch alle');
        check('1a "Lösch alle": Rückfrage mit Anzahl', /Ich verschiebe alle 6 Mails in den Papierkorb\. Richtig\?/.test(a.text) && a.mail, a.text);
        check('1b vor dem Ja wird nichts gelöscht', A.st.batch.length === 0 && A.st.trash.length === 0);
        const j = await A.sag('Ja');
        check('1c Ja → eine Sammel-Anfrage mit allen 6 IDs und TRASH', A.st.batch.length === 1 && ids(A.st.batch[0]) === 'm1,m2,m3,m4,m5,m6' && A.st.batch[0].addLabelIds.includes('TRASH'), JSON.stringify(A.st.batch));
        check('1d Erfolgsmeldung nennt die Anzahl, Liste ist leer', /Erledigt, 6 Mails liegen im Papierkorb/.test(j.text) && A.listeIds() === '', j.text + ' | ' + A.listeIds());
    }
    /* weitere Sprachvarianten für "alle" */
    for (const s of ['Lösch alle Mails.', 'Die können alle weg.', 'Alle löschen.', 'Lösch sie alle.', 'Verschieb alle in den Papierkorb.']) {
        const A = await neu(); const a = await A.sag(s);
        check('1e "' + s + '" → Rückfrage alle 6', /Ich verschiebe alle 6 Mails in den Papierkorb\. Richtig\?/.test(a.text), a.text);
    }
    /* 2) "Lösch alle" ohne Mail-Kontext: kein Mail-Löschen */
    {
        const A = await neu({ mitListe: false });
        const a = await A.sag('Lösch alle');
        check('2a ohne Mail-Kontext: nicht von mailaktionen behandelt, nichts gefragt, nichts gelöscht', !a.mail && !A.zustand().pending && !/Papierkorb/.test(a.text) && A.st.batch.length + A.st.trash.length === 0, a.x.modul + ' | ' + a.text);
        const b = await A.sag('Lösch alle Mails');
        check('2b "Lösch alle Mails" ohne Liste: Hinweis auf die Mailübersicht, nichts gelöscht', /Mailübersicht/.test(b.text) && !A.zustand().pending && A.st.batch.length === 0, b.text);
    }
    /* Kontextregel: mit Mail-Kontext darf ein Satz über Einkauf, Aufgaben, Termine usw. nichts an Mails ändern */
    {
        const A = await neu();
        for (const s of ['Lösch alle Einkäufe', 'Lösch die erste Aufgabe', 'Lösch alle Termine', 'Lösch die Erinnerung', 'Lösch die ersten drei Einträge von der Einkaufsliste']) {
            const a = await A.sag(s);
            check('2c "' + s + '" löscht keine Mails', !A.zustand().pending && A.st.batch.length + A.st.trash.length === 0 && !/Papierkorb/.test(a.text), a.text);
        }
        /* Kontext zu alt (über 10 Minuten): kurze Sätze ohne das Wort Mail greifen nicht mehr */
        A.uhr.ms += 11 * 60 * 1000;
        const a = await A.sag('Lösch alle');
        check('2d Mail-Kontext älter als 10 Minuten: "Lösch alle" wird nicht als Mail-Löschen genommen', !a.mail && !A.zustand().pending, a.x.modul + ' | ' + a.text);
    }
    /* 3) / 4) erste N */
    {
        const A = await neu(); const a = await A.sag('Lösch die ersten drei Mails.');
        check('3a "die ersten drei Mails": Rückfrage', /Ich verschiebe die ersten 3 Mails in den Papierkorb\. Richtig\?/.test(a.text), a.text);
        await A.sag('Ja');
        check('3b Ja → m1,m2,m3', ids(A.st.batch[0]) === 'm1,m2,m3', JSON.stringify(A.st.batch));
        check('3c Liste enthält nur noch m4,m5,m6', A.listeIds() === 'm4,m5,m6', A.listeIds());
        const b = await A.sag('Lösch die erste Mail'); await A.sag('Ja');
        check('3d danach ist "die erste" die frühere vierte', A.st.trash.join(',') === 'm4', A.st.trash.join(','));
    }
    for (const [s, n] of [['Lösch die ersten 4', 4], ['Die ersten 5 können weg', 5], ['Lösch die ersten vier.', 4]]) {
        const A = await neu(); const a = await A.sag(s);
        check('4 "' + s + '" → Rückfrage erste ' + n, new RegExp('Ich verschiebe die ersten ' + n + ' Mails in den Papierkorb\\. Richtig\\?').test(a.text), a.text);
        await A.sag('Ja');
        check('4 "' + s + '" → genau die ersten ' + n + ' IDs', ids(A.st.batch[0]) === ['m1', 'm2', 'm3', 'm4', 'm5', 'm6'].slice(0, n).join(','), JSON.stringify(A.st.batch));
    }
    {   const A = await neu(); const a = await A.sag('Lösch die ersten 10 Mails');
        check('4x mehr Mails verlangt als in der Liste: nichts löschen, klare Antwort', /nur 6 Mails/.test(a.text) && !A.zustand().pending && A.st.batch.length === 0, a.text); }
    /* 5) einzelne Position */
    for (const [s, id] of [['Lösch die erste Mail', 'm1'], ['Lösch die zweite.', 'm2'], ['Die vierte kann weg', 'm4'], ['Mail Nummer 5 löschen', 'm5'], ['Lösch Nummer 3', 'm3']]) {
        const A = await neu(); const a = await A.sag(s);
        check('5/6 "' + s + '" → Rückfrage zu ' + id, /in den Papierkorb legen\?/.test(a.text) && A.zustand().pending && A.zustand().pending.id === id, a.text + ' | ' + JSON.stringify(A.zustand().pending));
        await A.sag('Ja');
        check('5/6 "' + s + '" → Papierkorb für ' + id, A.st.trash.join(',') === id && A.st.batch.length === 0, A.st.trash.join(',') + '/' + JSON.stringify(A.st.batch));
    }
    /* 7) / 8) mehrere bestimmte Positionen */
    for (const [s, soll, wort] of [['Lösch Nummer 2 und 4', 'm2,m4', 'die Mails 2 und 4'], ['Lösch Mail 1, 3 und 5', 'm1,m3,m5', 'die Mails 1, 3 und 5'], ['Die zweite und dritte können weg', 'm2,m3', 'die Mails 2 und 3']]) {
        const A = await neu(); const a = await A.sag(s);
        check('7/8 "' + s + '" → Rückfrage ' + wort, a.text.includes('Ich verschiebe ' + wort + ' in den Papierkorb. Richtig?'), a.text);
        await A.sag('Ja');
        check('7/8 "' + s + '" → nur ' + soll, A.st.batch.length === 1 && ids(A.st.batch[0]) === soll, JSON.stringify(A.st.batch));
    }
    /* 9) die gerade vorgelesene Mail */
    for (const s of ['Lösch diese Mail', 'Die kann weg', 'Lösch die', 'Weg damit']) {
        const A = await neu();
        A.vm.runInContext("resolveEmailRef('2')", A.sb);   // Jarvis liest gerade die zweite Mail vor
        const a = await A.sag(s);
        check('9 "' + s + '" → Rückfrage zur vorgelesenen Mail (GitHub)', A.zustand().pending && A.zustand().pending.id === 'm2' && /GitHub/.test(a.text), a.text + ' | ' + JSON.stringify(A.zustand().pending));
        await A.sag('Ja');
        check('9 "' + s + '" → m2 im Papierkorb, "aktuell" bereinigt, Liste ohne m2', A.st.trash.join(',') === 'm2' && A.zustand().aktuell === null && A.listeIds() === 'm1,m3,m4,m5,m6', A.st.trash.join(',') + ' | ' + A.listeIds());
    }
    {   const A = await neu({ mitListe: false });   // ohne jeden Mail-Kontext darf "Die kann weg" nichts auslösen
        const a = await A.sag('Die kann weg'); check('9x "Die kann weg" ohne Mail-Kontext: nichts', !a.mail && !A.zustand().pending, a.x.modul); }
    /* 10) Absender */
    for (const [s, id, name] of [['Lösch die Mail von GitHub', 'm2', 'GitHub'], ['Lösche die Mail von Vercel', 'm3', 'Vercel'], ['Die Mail von Anna kann weg', 'm1', 'Anna']]) {
        const A = await neu(); const a = await A.sag(s);
        check('10 "' + s + '" → Rückfrage zu ' + name, A.zustand().pending && A.zustand().pending.id === id && a.text.includes(name), a.text);
        await A.sag('Ja');
        check('10 "' + s + '" → Papierkorb ' + id, A.st.trash.join(',') === id, A.st.trash.join(','));
    }
    /* 11) Nein */
    {
        const A = await neu(); await A.sag('Lösch alle'); const n = await A.sag('Nein');
        check('11 Nein → nichts gelöscht, Liste unverändert, keine Rückfrage mehr', A.st.batch.length + A.st.trash.length === 0 && A.listeIds() === 'm1,m2,m3,m4,m5,m6' && !A.zustand().pending && /lasse/.test(n.text), n.text);
        const B = await neu(); await B.sag('Lösch Nummer 2 und 4'); await B.sag('Nein'); const j = await B.sag('Ja');
        check('11b nach Nein bewirkt ein späteres Ja nichts', B.st.batch.length === 0 && !/Erledigt/.test(j.text), j.text);
    }
    /* 12) Ja: richtige IDs — Auswahl wird beim Fragen festgehalten */
    {
        const A = await neu(); await A.sag('Lösch Nummer 2 und 4');
        A.vm.runInContext("lastEmailList.unshift({ id: 'neu', von: 'X', betreff: 'Y' })", A.sb);   // die Liste ändert sich zwischen Frage und Ja
        await A.sag('Ja');
        check('12 Ja löscht genau die beim Fragen gemeinten IDs (m2,m4)', ids(A.st.batch[0]) === 'm2,m4', JSON.stringify(A.st.batch));
    }
    /* 13) Gmail-Fehler → keine falsche Erfolgsmeldung */
    {
        const A = await neu({ batchFehler: true }); await A.sag('Lösch alle'); const j = await A.sag('Ja');
        check('13a Sammel-Fehler: kein "Erledigt", Fehler wird genannt, Liste bleibt', !/Erledigt/.test(j.text) && /nicht geklappt|Fehler 500/.test(j.text) && A.listeIds() === 'm1,m2,m3,m4,m5,m6', j.text + ' | ' + A.listeIds());
        const B = await neu({ trashFehler: true }); await B.sag('Lösch die erste Mail'); const k = await B.sag('Ja');
        check('13b Einzel-Fehler: kein "Erledigt"', !/Erledigt/.test(k.text) && B.listeIds().startsWith('m1'), k.text);
    }
    /* 14) wichtig eingestufte Mail darf gelöscht werden, wenn sie ausdrücklich gewählt wurde */
    {
        const A = await neu(); await A.sag('Lösch Nummer 4'); await A.sag('Ja');
        check('14a ausdrücklich gewählte "wichtige" Mail (Sparkasse, Rechnung/Frist) geht in den Papierkorb', A.st.trash.join(',') === 'm4', A.st.trash.join(','));
        const B = await neu(); await B.sag('Lösch alle'); await B.sag('Ja');
        check('14b "Lösch alle" nimmt auch die wichtige Mail mit', ids(B.st.batch[0]).split(',').includes('m4'), JSON.stringify(B.st.batch));
    }
    /* 15) Werbe-Mails wie bisher */
    {
        const A = await neu(); const a = await A.sag('Lösche alle Werbe-Mails');
        check('15a Rückfrage mit Anzahl der Werbe-Mails', /liegen 3 Mails/.test(a.text), a.text);
        await A.sag('Ja');
        check('15b Ja → die Werbe-Mails (p1,p2,p3) in den Papierkorb, nicht die Mail-Liste', ids(A.st.batch[0]) === 'p1,p2,p3', JSON.stringify(A.st.batch));
    }
    /* Sicherheit: nie raten */
    {
        const A = await neu(); const a = await A.sag('Lösch alle außer die erste');
        check('S1 "alle außer …" wird nicht geraten: nichts gelöscht, keine Rückfrage', /nicht sicher verstanden/.test(a.text) && !A.zustand().pending && A.st.batch.length === 0, a.text);
        const B = await neu(); const b = await B.sag('Lösch alle Mails von Anna');
        check('S2 "alle Mails von Anna": nur die Mail von Anna wird gefragt, nicht die ganze Liste', B.zustand().pending && B.zustand().pending.art === 'einzeln' && B.zustand().pending.id === 'm1', b.text);
        const C = await neu(); C.vm.runInContext('lastEmailList.length = 0', C.sb);
        const c = await C.sag('Lösch alle'); check('S3 leere Liste: nichts', !C.zustand().pending && C.st.batch.length === 0, c.text);
    }
    console.log(`MAIL-LOESCHEN: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})();
