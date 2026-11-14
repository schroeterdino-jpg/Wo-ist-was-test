/* ============================================================
   TESTS: Kino-Effekte (js/effekte.js). Start: node tests/effekte.js
   Springt erst nach gut 2 Sekunden Arbeit an, wählt den Effekt nach der Aufgabe, Tippen und "Effekte aus" schalten ihn ab,
   ändert nichts an Antworten. Das Zeichnen selbst ist eine Attrappe (Canvas); geprüft werden Steuerung, Auswahl und Abschalten.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };

function neu(chef) {
    const st = { plan: { schritte: [] } };
    const A = starte({ jetzt: '2026-11-14T10:00:00+01:00', festerZufall: true, spracherkennung: true, chefStandard: !!chef, fetch: async (u, o) => {
        u = String(u);
        if (/api\/groq/.test(u)) {
            let m = []; try { m = JSON.parse(o.body).messages || []; } catch (e) { }
            if (m[0] && /Du planst für einen Sprachassistenten/.test(String(m[0].content))) { st.ent = (st.ent || 0) + 1; return ant({ choices: [{ message: { content: JSON.stringify(st.plan) } }] }); }
            return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'KI-ANTWORT', actions: [] }) } }] });
        }
        throw new Error('offline ' + u);
    } });
    A.st = st;
    /* Zeichen-Attrappe: Elemente sind einfache Objekte, die Zeichenfläche schluckt alles */
    A.sb.__els = [];
    A.vm.runInContext("document.createElement = function (t) { const e = { tag: t, style: {}, children: [], setAttribute() { }, appendChild(c) { e.children.push(c); }, addEventListener() { }, getContext() { return new Proxy(function () { }, { get: () => function () { }, set: () => true }); } }; __els.push(e); return e; }; document.body = { appendChild() { } }; document.getElementById = () => null; requestAnimationFrame = function () { return 1; }; cancelAnimationFrame = function () { };", A.sb);
    A.sage = async (s, p) => { if (p) st.plan = p; const g0 = A.gesagt.length; await A.lassLaufen(async () => { A.sb.jvTippen(s); await warte(80); }); await A.lassLaufen(async () => { await warte(60); }); return A.gesagt.slice(g0).join(' | '); };
    A.busy = b => A.vm.runInContext('isProcessing = ' + (b ? 'true' : 'false') + ';', A.sb);
    A.zu = () => A.sb.jvEffekt.zustand();
    return A;
}

(async () => {
    {
        const A = neu(false), J = A.sb.jvEffekt;
        check('1 jvEffekt ist da, acht Effekte, Standard an', !!J && J.ARTEN.length === 8 && J.istAn() === true && ['radar', 'route', 'globus', 'regen', 'kalender', 'kette', 'neuro', 'news'].every(a => J.ARTEN.indexOf(a) >= 0), J && J.ARTEN.join());
        const m = J.WERKZEUG;
        check('2 Zuordnung Aufgabe → Effekt', m.ortssuche === 'radar' && m.fahrzeit === 'route' && m.websuche === 'globus' && m.produktsuche === 'globus' && m.wetter === 'regen' && m.termine_lesen === 'kalender' && m.__kette === 'kette', JSON.stringify(m));
        const t0 = 1000000;
        A.busy(true); J.pruefe(t0); J.pruefe(t0 + 500); J.pruefe(t0 + 1000);
        check('3 vor 1,2 Sekunden Arbeit: kein Effekt', J.zustand().laufend === false);
        J.werkzeug('wetter'); J.pruefe(t0 + 1300);
        check('4 nach 1,2 Sekunden: Effekt läuft, passend zum Hinweis (Regen)', J.zustand().laufend === true && J.zustand().art === 'regen', JSON.stringify(J.zustand()));
        J.werkzeug('ortssuche'); J.pruefe(t0 + 1600);
        check('5 neuer Hinweis wechselt den Effekt mitten in der Aufgabe (Radar)', J.zustand().art === 'radar', JSON.stringify(J.zustand()));
        A.busy(false); J.pruefe(t0 + 2000);
        check('6 Aufgabe fertig: Effekt endet mit Haken (nicht mehr laufend, Ende gemerkt, ok)', J.zustand().laufend === false && J.zustand().endeAt > 0 && J.zustand().ok === true, JSON.stringify(J.zustand()));
    }
    {
        const A = neu(false), J = A.sb.jvEffekt, t0 = 2000000;
        A.busy(true); J.pruefe(t0); J.pruefe(t0 + 800); A.busy(false); J.pruefe(t0 + 1000);
        check('7 kurze Aufgabe (unter 1,2 s): nie ein Effekt', J.zustand().laufend === false && J.zustand().endeAt === 0 && !A.sb.__els.some(e => e.tag === 'canvas'));
        A.busy(true); J.pruefe(t0 + 5000); J.pruefe(t0 + 7500);
        check('8 lange Aufgabe ohne Hinweis: Neuronen-Netz', J.zustand().laufend && J.zustand().art === 'neuro', JSON.stringify(J.zustand()));
        const box = A.sb.__els.find(e => e.id === 'jvEffekt');
        check('9 Tippen auf den Effekt schließt ihn und er kommt in dieser Aufgabe nicht wieder', box && typeof box.onclick === 'function' && (box.onclick(), J.zustand().laufend === false) && (J.pruefe(t0 + 12000), J.zustand().laufend === false));
        A.busy(false); J.pruefe(t0 + 13000); A.busy(true); J.pruefe(t0 + 14000); J.pruefe(t0 + 16500);
        check('10 bei der nächsten Aufgabe ist er wieder da', J.zustand().laufend === true);
    }
    {
        const A = neu(false), J = A.sb.jvEffekt, t0 = 3000000;
        let fertig; const p = new Promise(r => { fertig = r; });
        J.begleite('news', p); J.pruefe(t0); J.pruefe(t0 + 2500);
        check('11 begleitete Aufgabe (Nachrichten) zeigt beim Laden den Globus, auch ohne isProcessing', J.zustand().laufend && J.zustand().art === 'globus', JSON.stringify(J.zustand()));
        fertig(1); await warte(5); J.pruefe(t0 + 4000);
        check('12 Aufgabe fertig: Effekt endet', J.zustand().laufend === false && J.zustand().endeAt > 0);
        const B = neu(false), K = B.sb.jvEffekt, t1 = 4000000;
        let f2; const p2 = new Promise(r => { f2 = r; });
        K.begleite('news', p2, ['Schwarzenbek', 'Hamburg']); K.pruefe(t1); K.pruefe(t1 + 2500);
        f2([[{ title: 'Neuer Radweg eröffnet' }, { title: 'Sperrung der B207' }], [{ title: 'Hafen meldet Rekord' }]]); await warte(5);
        check('12b Nachrichten da: echte Schlagzeilen fliegen ein (3 Kacheln, Effekt Nachrichten)', K.zustand().art === 'news' && K.zustand().news === 3 && K.zustand().laufend, JSON.stringify(K.zustand()));
        K.pruefe(t1 + 3000);
        check('12c der Effekt bleibt zum Lesen stehen, auch wenn die Aufgabe fertig ist', K.zustand().laufend === true);
    }
    {
        const A = neu(false), J = A.sb.jvEffekt, t0 = 4000000;
        await A.sage('Effekte aus');
        check('13 "Effekte aus" schaltet ab, merkt es und Jarvis antwortet kurz', J.istAn() === false && A.store['jv_effekte'] === 'aus', A.store['jv_effekte']);
        A.busy(true); J.pruefe(t0); J.pruefe(t0 + 5000);
        check('14 ausgeschaltet: auch bei langer Aufgabe kein Effekt', J.zustand().laufend === false);
        await A.sage('Schalte die Effekte an');
        check('15 "Schalte die Effekte an" schaltet wieder ein', J.istAn() === true && A.store['jv_effekte'] === 'an');
        const B = starte({ jetzt: '2026-11-14T10:00:00+01:00', festerZufall: true, speicher: { jv_effekte: 'aus' }, fetch: async () => { throw new Error('offline'); } });
        check('16 gemerktes "aus" gilt nach einem Neustart', B.sb.jvEffekt.istAn() === false);
    }
    {   // "Was gibt es Neues bei den Nachrichten" ist eine Nachrichten-Frage, nicht der Tagesüberblick
        const A = neu(false);
        const r = await A.sage('Was gibt es Neues bei den Nachrichten');
        check('19 "Was gibt es Neues bei den Nachrichten" läuft über die Nachrichten, nicht über den Tagesüberblick', !/schaue auf deinen Tag/.test(r) && /Nachrichten/.test(r), r);
        const B = neu(false);
        check('19b "Was gibt es Neues" bleibt der Tagesüberblick', /schaue auf deinen Tag/.test(await B.sage('Was gibt es Neues')));
    }
    {   // Chef-KI meldet das Werkzeug; Antworten bleiben unverändert
        const A = neu(true);
        A.sb.__w = []; A.vm.runInContext("jvEffekt.werkzeug = function (n) { __w.push(n); };", A.sb);
        const s1 = await A.sage('Wird es morgen nass, ich fahre nach Hamburg', { schritte: [{ faehigkeit: 'wetter', params: { ort: 'Hamburg' } }] });
        const C = neu(true); C.sb.__a = 0; C.vm.runInContext("const __o = jvEffekt.arbeit; jvEffekt.arbeit = function (p) { __a++; return __o(p); };", C.sb);
        await C.sage('Wird es morgen nass, ich fahre nach Hamburg', { schritte: [{ faehigkeit: 'wetter', params: { ort: 'Hamburg' } }] });
        check('20 die ganze Chef-KI-Arbeit wird dem Effekt gemeldet (läuft auch ohne "beschäftigt")', C.sb.__a >= 1, String(C.sb.__a));
        check('17 Chef-KI meldet bei einem Werkzeug dessen Namen (wetter)', A.sb.__w.indexOf('wetter') >= 0, JSON.stringify(A.sb.__w));
        const A2 = neu(true); A2.sb.__w = []; A2.vm.runInContext("jvEffekt.werkzeug = function (n) { __w.push(n); };", A2.sb);
        await A2.sage('Such mir eine Pizzeria in Hamburg und sag mir, wie dort das Wetter wird', { schritte: [{ faehigkeit: 'ortssuche', params: { suchbegriff: 'Pizza' } }, { faehigkeit: 'wetter', params: {}, aus: { ort: { schritt: 1, feld: 'orte' } } }] });
        check('18 bei mehreren Schritten meldet die Chef-KI die Schritt-Kette', A2.sb.__w.indexOf('__kette') >= 0, JSON.stringify(A2.sb.__w));
    }
    console.log('Effekte: ' + ok + ' OK, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})();
