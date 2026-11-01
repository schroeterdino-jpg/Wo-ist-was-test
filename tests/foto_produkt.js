/* ============================================================
   TESTS: Foto von etwas Unbekanntem (zum Beispiel ein Parfüm): Jarvis sagt kurz, was er sieht, und FRAGT, was er damit tun soll.
   Danach gehen "Preise vergleichen (für dieses Parfüm)" und "Wo kann ich das in der Nähe kaufen?". Start: node tests/foto_produkt.js
   Echte Module (photo.js, foto_erkennen.js, preissuche.js, ortsuche.js, die ganze Befehls-Kette), Attrappe nur für die Bild-KI (askVision).
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const pause = ms => new Promise(r => setTimeout(r, ms));

const PARFUEM = { art: 'sonstiges', sicher: true, beschreibung: 'ein Parfümflakon in einem Schrank', produkt: 'Chanel Bleu Parfüm', laden: 'Parfümerie' };

/* erkennung: was die Bild-KI zur Erkennung liefert; Aufrufe werden gezählt */
async function foto(erkennung, o) {
    o = o || {};
    const A = starte({ jetzt: '2026-10-28T10:00:00+01:00', festerZufall: true, fetch: async u => { throw new Error('offline (Attrappe): ' + u); } });
    A.visionAufrufe = [];
    A.sb.__vision = async (system, user, dataUrl, json) => { A.visionAufrufe.push({ system: String(system).slice(0, 60), user }); if (erkennung instanceof Error) throw erkennung; return JSON.stringify(erkennung); };
    A.vm.runInContext('askVision = window.__vision;', A.sb);
    A.vm.runInContext("lastPhoto = { dataUrl: 'data:image/jpeg;base64,AAAA', at: Date.now(), text: '' };", A.sb);
    if (o.aus) A.store['jv_foto_erkennen'] = '0';
    // Spione: Ortssuche und Preissuche-Aufruf
    A.ortsuche = [];
    A.sb.__orts = text => { A.ortsuche.push(text); return o.ortsucheGeht === false ? false : true; };
    A.vm.runInContext('window.handleOrtsucheCommand = window.__orts;', A.sb);
    const g0 = A.gesagt.length;
    await A.lassLaufen(() => A.vm.runInContext('photoAskWhatToDo()', A.sb));
    await pause(120);
    A.ersteAnsage = A.gesagt.slice(g0).join(' | ');
    A.sag = async t => { const g1 = A.gesagt.length; const x = await A.satz(t); await pause(120); return { x, text: A.gesagt.slice(g1).join(' | ') }; };
    return A;
}

(async () => {
    /* 1) Unbekanntes Foto: kurze Beschreibung und die Frage */
    {
        const A = await foto(PARFUEM);
        check('1a Parfüm-Foto: Jarvis sagt, was er sieht, und fragt "Was soll ich damit tun?"', /Ich sehe: ein Parfümflakon in einem Schrank\. Was soll ich damit tun\?/.test(A.ersteAnsage), A.ersteAnsage);
        check('1b er nennt Preisvergleich und Kaufen in der Nähe als Möglichkeit', /Preise vergleichen/.test(A.ersteAnsage) && /in der Nähe kaufen/.test(A.ersteAnsage), A.ersteAnsage);
        check('1c es gibt nur EINE Bild-Anfrage (keine automatische Beschreibung mehr)', A.visionAufrufe.length === 1, JSON.stringify(A.visionAufrufe));
        /* 2) Preise vergleichen */
        const p1 = await A.sag('Preise vergleichen');
        check('2a "Preise vergleichen" sucht den erkannten Produktnamen', /Chanel Bleu Parfüm/.test(p1.text), p1.text);
        const B = await foto(PARFUEM);
        const p2 = await B.sag('Such die Preise für dieses Parfüm');
        check('2b "Such die Preise für dieses Parfüm" nimmt das Produkt vom Foto', /Chanel Bleu Parfüm/.test(p2.text), p2.text);
        const C = await foto(PARFUEM);
        const p3 = await C.sag('Was kostet das?');
        check('2c "Was kostet das?" nimmt das Produkt vom Foto', /Chanel Bleu Parfüm/.test(p3.text), p3.text);
        const D = await foto(PARFUEM);
        const p4 = await D.sag('Such die Preise für Milch');
        check('2d ein anderes Produkt wird NICHT durch das Foto ersetzt', /Milch/.test(p4.text) && !/Chanel/.test(p4.text), p4.text);
        /* 3) in der Nähe kaufen */
        const E = await foto(PARFUEM);
        const n1 = await E.sag('Wo kann ich das in der Nähe kaufen?');
        check('3a "Wo kann ich das in der Nähe kaufen?" → Ortssuche nach der nächsten Parfümerie', E.ortsuche.length === 1 && E.ortsuche[0] === 'Wo ist die nächste Parfümerie', JSON.stringify(E.ortsuche) + ' | ' + n1.text);
        const F = await foto(PARFUEM);
        await F.sag('Wo gibt es das hier?'); 
        check('3b "Wo gibt es das hier?" ebenso', F.ortsuche.length === 1, JSON.stringify(F.ortsuche));
        const G = await foto(PARFUEM);
        await G.sag('Wo finde ich das Rezept für Pfannkuchen?');
        check('3c ein anderer Satz mit "Wo finde ich …" geht NICHT in die Foto-Ortssuche', G.ortsuche.length === 0, JSON.stringify(G.ortsuche));
        const H = await foto(PARFUEM, { ortsucheGeht: false });
        const n2 = await H.sag('Wo kann ich das in der Nähe kaufen?');
        check('3d Ortssuche kennt die Ladenart nicht: ehrliche Antwort statt Schweigen', /kann ich gerade nicht suchen/.test(n2.text), n2.text);
    }
    /* 4) Ortssuche kennt jetzt die Parfümerie */
    {
        const A = await foto(PARFUEM); A.vm.runInContext('window.handleOrtsucheCommand = undefined', A.sb);
        const T = A.sb._ortsucheTest;
        const req = T.extract(T.norm('Wo ist die nächste Parfümerie')), res = req && T.resolve(req.what, req.nearest);
        check('4 Ortssuche versteht "Wo ist die nächste Parfümerie"', !!res && /Parfümerie/.test(res.entry.label), JSON.stringify(res && res.entry && res.entry.label));
    }
    /* 5) Name nicht sicher lesbar / Ladenart unbekannt */
    {
        const A = await foto({ art: 'sonstiges', sicher: true, beschreibung: 'ein Gegenstand im Regal', produkt: '', laden: '' });
        check('5a ohne Produktname kein Preis-Tipp in der Ansage', /Was soll ich damit tun\?/.test(A.ersteAnsage) && !/Preise vergleichen/.test(A.ersteAnsage), A.ersteAnsage);
        const p = await A.sag('Preise vergleichen');
        check('5b Preisfrage ohne Namen: bittet um den Namen, sucht nichts Falsches', /nicht sicher lesen/.test(p.text) && !/günstigsten Preis/.test(p.text), 'TEXT: ' + p.text);
        const B = await foto({ art: 'sonstiges', sicher: true, beschreibung: 'ein Gerät', produkt: 'Kaffeemaschine X', laden: '' });
        const n = await B.sag('Wo kann ich das in der Nähe kaufen?');
        check('5c Ladenart unbekannt: sagt es und bietet Preisvergleich an', /nicht, in welchem Laden/.test(n.text) && B.ortsuche.length === 0, n.text);
    }
    /* 6) Foto zu alt: nichts davon greift */
    {
        const A = await foto(PARFUEM);
        A.uhr.ms += 11 * 60 * 1000;
        A.vm.runInContext('lastPhoto.at = Date.now() - 11 * 60000;', A.sb);
        await A.sag('Wo kann ich das in der Nähe kaufen?');
        const p = await A.sag('Preise vergleichen');
        check('6 Foto älter als 10 Minuten: keine Foto-Ortssuche und keine Foto-Preisfrage', A.ortsuche.length === 0 && !/Chanel/.test(p.text), JSON.stringify(A.ortsuche) + ' | ' + p.text);
    }
    /* 7) Bekannte Arten bleiben wie bisher, Fehler und Schalter */
    {
        const A = await foto({ art: 'einkaufsliste', sicher: true, beschreibung: 'ein Einkaufszettel', produkt: '', laden: '' });
        check('7a erkannter Einkaufszettel: startet die Einkaufszettel-Funktion, fragt NICHT "Was soll ich damit tun?"', !/Ich sehe:/.test(A.ersteAnsage) && A.visionAufrufe.length >= 2, A.ersteAnsage + ' | ' + A.visionAufrufe.length);
        const B = await foto({ art: 'brief', sicher: false, beschreibung: 'ein Schreiben', produkt: '', laden: '' });
        check('7b unsicher erkannt: sagt kurz, was er sieht, und fragt', /Ich sehe: ein Schreiben\. Was soll ich damit tun\?/.test(B.ersteAnsage), B.ersteAnsage);
        const C = await foto({ art: 'sonstiges', sicher: true, beschreibung: '', produkt: '', laden: '' });
        check('7c keine Beschreibung: einfache Frage "Das Foto ist da. Was soll ich damit tun?"', /Das Foto ist da\. Was soll ich damit tun\?/.test(C.ersteAnsage), C.ersteAnsage);
        const D = await foto(new Error('Bild-KI nicht erreichbar'));
        check('7d Fehler der Bild-KI: trotzdem die Frage "Was soll ich damit tun?"', /Was soll ich damit tun\?/.test(D.ersteAnsage), D.ersteAnsage);
        const E = await foto(PARFUEM, { aus: true });
        check('7e Foto-Erkennung aus: wie früher nur die Frage, keine Bild-Anfrage', /Das Foto ist da\. Was soll ich damit tun\?/.test(E.ersteAnsage) && E.visionAufrufe.length === 0, E.ersteAnsage + ' | ' + E.visionAufrufe.length);
        const F = await foto(PARFUEM, { aus: true });
        const p = await F.sag('Preise vergleichen');
        check('7f Foto-Erkennung aus: "Preise vergleichen" nimmt nichts vom Foto', !/Chanel/.test(p.text), p.text);
    }
    console.log(`FOTO-PRODUKT: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})();
