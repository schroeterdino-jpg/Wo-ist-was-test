/* ============================================================
   TESTS Phase 1 "Sicherheit": Jarvis meldet nie fälschlich Erfolg und endet nie mit leerem Text. Start: node tests/sicherheit.js
   Teil 1: reine Funktionen (js/sicherheit.js)
   Teil 2: Vollständigkeit der Liste bekannter Aktionsarten gegen den echten Code und die Liste in prompt.js
   Teil 3: Integration über js/assistant.js (sendToGroqSmart) mit einer Attrappe für die KI: unbekannte Aktion, leere Antwort, Fehler, genau EINE Antwort
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path'), vm = require('vm');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const JETZT = '2026-10-28T10:00:00+01:00';
const FEHLT = 'fehlt mir noch die passende Fähigkeit', UNKLAR = 'Ich bin mir nicht sicher, was du damit möchtest';

(async () => {
    /* ---------- Teil 1 ---------- */
    const sb0 = { window: {}, console: { warn() {} , error() {} } }; vm.createContext(sb0);
    const quelle = fs.readFileSync(path.join(ROOT, 'js/sicherheit.js'), 'utf8');
    vm.runInContext(quelle, sb0);
    const S = sb0.window.jvSicher;
    check('1a nur window.jvSicher wird angelegt', Object.keys(sb0.window).join() === 'jvSicher', Object.keys(sb0.window).join());
    check('1b kein Speicher, kein Netz, keine Sprachausgabe, kein Zeitgeber', !/localStorage|sessionStorage|fetch\(|speak\(|executeAction|document\.|setTimeout|setInterval/.test(quelle.replace(/\/\*[\s\S]*?\*\//g, '')));
    check('1c erfundener Typ ist unbekannt', S.bekannt({ type: 'hotel_buchen' }) === false);
    check('1d bekannte Typen und reine Antwort ohne Typ sind bekannt', S.bekannt({ type: 'shopping' }) && S.bekannt({ type: 'chat' }) && S.bekannt({ reply: 'Hallo' }) && S.bekannt({}) && S.bekannt({ type: '' }) && S.bekannt(null));
    check('1e harmlose Wörter der KI ("none", "Answer") sind keine fehlende Fähigkeit', S.bekannt({ type: 'none' }) && S.bekannt({ type: 'Answer' }) && S.bekannt({ type: 'smalltalk' }));
    check('1f Kalender-Text ohne Typ bleibt bekannt', S.bekannt({ type: 'termin_anlegen', calendar_text: 'Zahnarzt' }));
    check('1g Typ ist eine Zahl oder ein Objekt: unbekannt, aber kein Absturz', S.bekannt({ type: 42 }) === false && S.bekannt({ type: {} }) === false);
    check('2a ohneWirkung: nur Antworten / nichts', S.ohneWirkung([], 0, [], []) && S.ohneWirkung(['chat'], 1, [], []) && S.ohneWirkung([undefined, 'chat'], 2, [], []));
    check('2b ohneWirkung: echte Wirkung oder ehrliche Meldung zählt nicht', !S.ohneWirkung(['shopping'], 1, [], []) && !S.ohneWirkung([], 0, ['Fehler'], []) && !S.ohneWirkung([], 0, [], ['nichts geändert']));
    S.merke('fehlt', 'x'); S.merke('unklar', 'y');
    check('3a Vorfälle nur im Arbeitsspeicher, Art und Typ, höchstens 20', S.vorfaelle().length === 2 && Object.keys(S.vorfaelle()[0]).sort().join() === 'art,typ,zeit');
    for (let i = 0; i < 30; i++) S.merke('fehlt', 't' + i);
    check('3b Vorfälle begrenzt auf 20', S.vorfaelle().length === 20);

    /* ---------- Teil 2: Liste gegen den echten Code ---------- */
    const bek = new Set(S._bekannteTypen());
    const imCode = new Set();
    fs.readdirSync(path.join(ROOT, 'js')).filter(f => f.endsWith('.js')).forEach(f => {
        const q = fs.readFileSync(path.join(ROOT, 'js', f), 'utf8');
        let m; const rx = /\b(?:action|a|act|aktion)\.type\s*(?:===|==)\s*'([a-z_]+)'/g;
        while ((m = rx.exec(q))) imCode.add(m[1]);
    });
    const imPrompt = new Set(); const pz = fs.readFileSync(path.join(ROOT, 'js/prompt.js'), 'utf8').split('\n').find(l => /type einer Aktion/.test(l)) || '';
    (pz.match(/\\"[a-z_]+\\"/g) || []).forEach(x => imPrompt.add(x.replace(/[\\"]/g, '')));
    check('4a Liste im Prompt gefunden (Messung selbst gültig)', imPrompt.size >= 35 && imCode.size >= 35, imPrompt.size + ' / ' + imCode.size);
    const fehltCode = [...imCode].filter(t => !bek.has(t)), fehltPrompt = [...imPrompt].filter(t => !bek.has(t));
    check('4b jede Aktionsart im Code steht in der Liste bekannter Aktionen', fehltCode.length === 0, fehltCode.join(','));
    check('4c jede Aktionsart im Prompt steht in der Liste bekannter Aktionen', fehltPrompt.length === 0, fehltPrompt.join(','));

    /* ---------- Teil 3: Integration ---------- */
    function kopf(antwort) {
        return starte({ jetzt: JETZT, festerZufall: true, fetch: async (u) => {
            if (/\/api\/groq/.test(u) && antwort) return antwort();
            throw new Error('offline ' + u);
        } });
    }
    async function lauf(satz, aktionen, reply, o) {
        o = o || {};
        const A = kopf(() => ant({ choices: [{ message: { content: typeof o.roh === 'string' ? o.roh : JSON.stringify(reply === undefined ? { actions: aktionen } : { reply, actions: aktionen }) } }] }));
        A.setze('wxGeocode', async () => ({ lat: 53.5, lon: 10 }));
        const g0 = A.gesagt.length;
        const r = await A.lassLaufen(() => A.sb.sendToGroqSmart(satz, o.opts));
        await new Promise(res => setImmediate(res));
        const gesagt = A.gesagt.slice(g0);
        return { gesagt, text: gesagt.join(' | '), haengt: !!r.haengt, A };
    }
    let r;
    r = await lauf('Buch mir ein Hotel in Rom', [{ type: 'hotel_buchen', ort: 'Rom' }], 'Ich habe das Hotel in Rom gebucht!');
    check('5a erfundene Aktion: keine falsche Erfolgsmeldung', !/gebucht/.test(r.text) && r.text.includes(FEHLT), r.text);
    check('5b erfundene Aktion: genau EINE Antwort', r.gesagt.length === 1, String(r.gesagt.length));
    r = await lauf('Setz Milch auf die Einkaufsliste und buch ein Hotel', [{ type: 'shopping', shopping_items: ['Milch'] }, { type: 'hotel_buchen' }], 'Alles erledigt!');
    check('5c erfundene Aktion neben echter: echte läuft, Meldung ehrlich', r.A.lese('shoppingEntries').some(e => e.text === 'Milch') && r.text.includes(FEHLT) && /Einkaufsliste ergänzt/.test(r.text) && !/Alles erledigt/.test(r.text), r.text);
    check('5d Meldung nur einmal, auch bei zwei erfundenen Aktionen', (await lauf('x', [{ type: 'a_b' }, { type: 'c_d' }], 'ok')).text.split(FEHLT).length === 2);

    r = await lauf('Hm', [], '');
    check('6a leere Antwort ohne Aktion: nie "erledigt", sondern Rückfrage', r.text.includes(UNKLAR) && !/erledigt/i.test(r.text), r.text);
    check('6b leere Antwort: genau EINE Antwort', r.gesagt.length === 1, String(r.gesagt.length));
    r = await lauf('Hm', [], '   \n ');
    check('6c nur Leerzeichen zählt als leer', r.text.includes(UNKLAR), r.text);
    r = await lauf('Hm', [{ type: 'chat' }], '');
    check('6d chat-Aktion mit leerer Antwort: Rückfrage statt "erledigt"', r.text.includes(UNKLAR) && !/erledigt/i.test(r.text), r.text);
    r = await lauf('Hm', [], undefined);
    check('6e KI-Antwort ganz ohne reply-Feld: Rückfrage', r.text.includes(UNKLAR), r.text);
    r = await lauf('Hm', [], { text: 'seltsam' });
    check('6f reply ist ein Objekt: Rückfrage, kein Absturz', r.text.includes(UNKLAR) && !r.haengt, r.text);
    r = await lauf('Setz Milch auf die Einkaufsliste', [{ type: 'shopping', shopping_items: ['Milch'] }], '');
    check('6g echte Wirkung und leere Antwort: bleibt eine positive Meldung (wie bisher)', r.A.lese('shoppingEntries').some(e => e.text === 'Milch') && /erledigt|Dienst|Passiert|Fertig/i.test(r.text) && !r.text.includes(UNKLAR), r.text);
    let gesammelt;
    await lauf('Hm', [], '', { opts: { collect: (t) => { gesammelt = t; } } });
    check('6h Protokoll-Lauf (collect): auch dort kein leerer Text', typeof gesammelt === 'string' && gesammelt.includes(UNKLAR), String(gesammelt));

    r = await lauf('Hallo', [{ type: 'none' }], 'Hallo, schön dich zu hören.');
    check('7a harmloser Typ "none": Antwort bleibt, keine Fähigkeits-Meldung', r.text === 'Hallo, schön dich zu hören.', r.text);
    r = await lauf('Hallo', [{ type: 'chat' }], 'Hallo, schön dich zu hören.');
    check('7b chat: wie bisher', r.text === 'Hallo, schön dich zu hören.', r.text);
    r = await lauf('Hallo', undefined, 'Hallo, schön dich zu hören.', { roh: JSON.stringify({ reply: 'Hallo, schön dich zu hören.' }) });
    check('7c Antwort ganz ohne actions-Feld: wie bisher', r.text === 'Hallo, schön dich zu hören.', r.text);
    r = await lauf('Wie spät', [{ type: 'chat' }], 'Es ist zehn Uhr.');
    check('7d normale Antwort: genau eine, unverändert', r.gesagt.length === 1 && r.text === 'Es ist zehn Uhr.', r.text);

    /* technische Fehler: immer eine verständliche Antwort, genau eine */
    const A1 = kopf(null); const g1 = A1.gesagt.length; await A1.lassLaufen(() => A1.sb.sendToGroqSmart('Erzähl mir was')); await new Promise(res => setImmediate(res));
    check('8a KI nicht erreichbar: genau eine verständliche Antwort', A1.gesagt.length - g1 === 1 && A1.gesagt[A1.gesagt.length - 1].length > 10, A1.gesagt.slice(g1).join('|'));
    r = await lauf('Hm', [], null, { roh: 'das ist kein json' });
    check('8b KI liefert kaputten Text: genau eine verständliche Antwort', r.gesagt.length === 1 && r.text.length > 10 && !r.haengt, r.text);
    const A2 = kopf(() => ant({ error: 'Rate limit' })); const g2 = A2.gesagt.length; await A2.lassLaufen(() => A2.sb.sendToGroqSmart('Erzähl mir was')); await new Promise(res => setImmediate(res));
    check('8c KI-Antwort ohne choices (Fehlerantwort): genau eine verständliche Antwort', A2.gesagt.length - g2 === 1 && A2.gesagt[A2.gesagt.length - 1].length > 10, A2.gesagt.slice(g2).join('|'));

    console.log(`SICHERHEIT: ${ok} Prüfungen in Ordnung, ${fehler} Fehler`);
    process.exit(fehler ? 1 : 0);
})();
