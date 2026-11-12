/* ============================================================
   TEST: Mitlaufen (js/mitlauf.js): die Chef-KI plant im Hintergrund mit, ohne etwas zu ändern.
   Start: node tests/mitlauf.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
const schlaf = ms => new Promise(r => setTimeout(r, ms));

function neu(plan) {
    const st = { planer: 0, normal: 0 }, gespr = [];
    const A = starte({ jetzt: '2026-11-11T10:00:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true, nachSkript: (f, sb) => { if (f === 'voice.js') sb.speak = function (t) { gespr.push(String(t)); }; },
        fetch: async (u, o) => {
            if (/api\/groq/.test(String(u))) {
                const b = JSON.parse(o.body), sys = (b.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
                if (/Du planst für einen Sprachassistenten/.test(sys)) { st.planer++; return ant({ choices: [{ message: { content: JSON.stringify(plan || { absicht: 'wetter', schritte: [{ faehigkeit: 'wetter', params: { ort: 'Hamburg' } }] }) } }] }); }
                st.normal++; return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Der erste Bundeskanzler war Konrad Adenauer.', actions: [] }) } }] });
            }
            throw new Error('offline ' + u);
        } });
    A.st = st; A.gespr = gespr; A.sb.jvChef.aus();
    A.frag = async s => { await A.lassLaufen(async () => { A.sb.jvTippen(s); await warte(80); }); await A.lassLaufen(async () => { await warte(60); }); };
    return A;
}
(async () => {
    {   /* AUS (Standard): kein zusätzlicher Aufruf */
        const A = neu();
        A.sb.jvMitlauf._zeiten(10);
        await A.frag('Wer war der erste Bundeskanzler der Bundesrepublik');
        await schlaf(80); await warte(60);
        check('1a aus: Chef-KI wird nicht gefragt', A.st.planer === 0, String(A.st.planer));
        check('1b aus: normale KI antwortet wie immer', A.st.normal === 1 && A.gespr.some(t => /Adenauer/.test(t)), JSON.stringify(A.gespr));
    }
    {   /* Spracherkennung schreibt oft getrennt oder anders */
        const A = neu();
        const h = A.sb.jvMitlauf.handle;
        check('7a „Mit laufen an“ (getrennt) schaltet ein', h('Mit laufen an') === true && A.sb.jvMitlauf.istAn());
        check('7b „Mitlauf an“, „Mitlaufen anschalten“, „Lauf mit“', h('Mitlauf an') === true && h('Mitlaufen anschalten') === true && h('Lauf mit') === true);
        check('7c „Mit laufen aus“ schaltet aus', h('Mit laufen aus') === true && !A.sb.jvMitlauf.istAn());
        check('7d Alltagssätze bleiben unberührt', h('Lauf mit mir zum Bäcker') === false && h('Ich gehe heute mit Max laufen') === false);
    }
    {   /* EIN: Befehl schaltet ein, KI-Satz wird im Hintergrund mitgeplant, Antwort unverändert, nichts ausgeführt */
        const A = neu();
        A.sb.jvMitlauf._zeiten(10);
        await A.frag('Mitlaufen an');
        check('2a Schalter gesetzt', A.sb.jvMitlauf.istAn() === true);
        check('2b Jarvis bestätigt', A.gespr.some(t => /im Hintergrund mit/.test(t)), JSON.stringify(A.gespr));
        A.gespr.length = 0;
        await A.frag('Wer war der erste Bundeskanzler der Bundesrepublik');
        await schlaf(120); await warte(80);
        const l = A.sb.jvMitlauf.laden();
        check('2c Chef-KI wurde genau einmal gefragt', A.st.planer === 1, String(A.st.planer));
        check('2d Protokoll hat den Eintrag (Weg ki, Fähigkeit wetter)', l.length === 1 && l[0].w === 'ki' && l[0].f[0] === 'wetter' && l[0].ok, JSON.stringify(l));
        check('2e Antwort unverändert, genau eine normale KI-Anfrage', A.st.normal === 1 && A.gespr.length === 1 && /Adenauer/.test(A.gespr[0]), JSON.stringify(A.gespr));
        check('2f Chef-KI hat nichts ausgeführt (kein Wetter gesprochen)', !A.gespr.some(t => /Grad|Wetter/.test(t)), JSON.stringify(A.gespr));
    }
    {   /* "kann nicht"-Plan und Bericht */
        const A = neu({ absicht: 'x', schritte: [], kann_nicht: true, hinweis: 'Das kann ich noch nicht.' });
        A.sb.jvMitlauf._zeiten(10);
        await A.frag('Mitlaufen an');
        await A.frag('Wer war der erste Bundeskanzler der Bundesrepublik');
        await schlaf(120); await warte(80);
        const l = A.sb.jvMitlauf.laden();
        check('3a kann_nicht wird notiert', l.length === 1 && l[0].k === true, JSON.stringify(l));
        A.gespr.length = 0;
        await A.frag('Mitlauf-Bericht');
        check('3b Bericht nennt die Zahlen', A.gespr.some(t => /1 Sätze beobachtet|1 Sätze/.test(t)) || A.gespr.some(t => /beobachtet/.test(t)), JSON.stringify(A.gespr));
        await A.frag('Mitlauf-Bericht leeren');
        check('3c leeren', A.sb.jvMitlauf.laden().length === 0);
        await A.frag('Mitlaufen aus');
        check('3d aus', A.sb.jvMitlauf.istAn() === false);
    }
    {   /* Chef-KI selbst an: kein Mitlaufen (keine Doppelanfrage) */
        const A = neu();
        A.sb.jvMitlauf._zeiten(10);
        await A.frag('Mitlaufen an');
        A.sb.jvChef.an();
        const r = A.sb.jvMitlauf.beobachte('Wer war der erste Bundeskanzler', 'ki');
        check('4a Chef-KI an: Mitlaufen bleibt still', r === false);
    }
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
