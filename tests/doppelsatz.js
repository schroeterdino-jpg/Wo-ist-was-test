/* ============================================================
   TEST: Doppelsätze mit lesenden Auskünften (Umbau): ein fester Befehl darf bei "A und B" nicht allein antworten und B verschlucken.
   Bei eingeschalteter Chef-KI gehen solche Sätze zuerst an die Chef-KI (MEHR_GRUPPEN 6 bis 12 in js/chef.js). Einzelfragen bleiben bei den festen Befehlen.
   Start: node tests/doppelsatz.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const warte = async n => { for (let i = 0; i < (n || 40); i++) await new Promise(r => setImmediate(r)); };
const WS = { faehigkeit: 'websuche', params: { frage: 'Frage' } }, PS = { faehigkeit: 'produktsuche', params: { suchbegriff: 'Fernseher' } }, WE = { faehigkeit: 'wetter', params: { tag: 'morgen' } };
const FAELLE = [
    ['Wie viel sind 50 Dollar in Euro und was kostet ein Fernseher', [WS, PS]],
    ['Wann sind die nächsten Ferien und wie wird das Wetter morgen', [WS, WE]],
    ['Wann geht die Sonne unter und was kostet ein Fernseher', [WS, PS]],
    ['Welche Schicht habe ich morgen und wie wird das Wetter morgen', [{ faehigkeit: 'schicht', params: { tag: 'morgen' } }, WE]],
    ['Welche Rechnungen sind offen und wie wird das Wetter morgen', [{ faehigkeit: 'rechnungen_lesen', params: {} }, WE]],
    ['Habe ich Urlaub und wie wird das Wetter morgen', [{ faehigkeit: 'urlaub_lesen', params: {} }, WE]],
    ['Zeig mir die Karte und wie wird das Wetter morgen', [{ faehigkeit: 'karte_zeigen', params: {} }, WE]],
    ['Öffne die Karte und was kostet ein Fernseher', [{ faehigkeit: 'karte_zeigen', params: {} }, PS]],
    ['Wie war mein Monat und wie wird das Wetter morgen', [{ faehigkeit: 'haushaltsbuch_lesen', params: {} }, WE]],
    ['Wie war mein Monat und was kostet ein Fernseher', [{ faehigkeit: 'haushaltsbuch_lesen', params: {} }, PS]]
];
(async () => {
    const gespr = [], st = { planer: 0, normal: 0 };
    let plan = null;
    const A = starte({ jetzt: '2026-11-12T11:13:00+01:00', festerZufall: true, echtesSpeak: true, spracherkennung: true,
        nachSkript: (f, sb) => { if (f === 'voice.js') sb.speak = function (t) { gespr.push(String(t)); return Promise.resolve(); }; },
        fetch: async (u, o) => {
            if (/api\/groq/.test(String(u))) {
                const b = JSON.parse(o.body), sys = (b.messages || []).filter(m => m.role === 'system').map(m => m.content).join('\n');
                if (/Du planst für einen Sprachassistenten/.test(sys)) { st.planer++; return ant({ choices: [{ message: { content: JSON.stringify({ absicht: 'x', schritte: plan }) } }] }); }
                st.normal++; return ant({ choices: [{ message: { content: JSON.stringify({ reply: 'Normale KI.', actions: [] }) } }] });
            }
            throw new Error('offline ' + u);
        } });
    A.vorspulen(2000);
    const C = A.sb.jvChef;
    // Chef-KI AUS: alles wie bisher
    for (const [satz] of FAELLE) check('1 Chef-KI aus: nicht mehrteilig (' + satz.slice(0, 30) + ')', C.mehrteilig(satz) === false);
    C.an();
    for (const [satz, pl] of FAELLE) {
        check('2a mehrteilig erkannt: ' + satz, C.mehrteilig(satz) === true);
        plan = pl; st.planer = 0; gespr.length = 0;
        await A.lassLaufen(async () => { A.sb.jvTippen(satz); await warte(120); });
        await A.lassLaufen(async () => { await warte(120); });
        check('2b Chef-KI wird zuerst gefragt, kein fester Befehl allein: ' + satz, st.planer >= 1, JSON.stringify({ st, gespr }));
    }
    // Rückfall: plant die Chef-KI nichts Brauchbares, beantwortet NICHT der feste Befehl allein den ersten Teil, sondern die normale KI bekommt den ganzen Satz
    plan = [{ faehigkeit: 'gibt_es_nicht', params: {} }]; st.planer = 0; st.normal = 0; gespr.length = 0;
    await A.lassLaufen(async () => { A.sb.jvTippen('Wann sind die nächsten Ferien und wie wird das Wetter morgen'); await warte(120); });
    await A.lassLaufen(async () => { await warte(120); });
    check('2c Rückfall: Chef-KI gefragt, dann die normale KI mit dem ganzen Satz', st.planer >= 1 && st.normal >= 1, JSON.stringify(st));
    check('2d Rückfall: der Ferien-Befehl hat nicht allein geantwortet', !gespr.some(t => /Ferientermine|Ferien/.test(t) && !/Normale KI/.test(t)), JSON.stringify(gespr));
    // Mehrteilig mit Schreibgruppe: der feste Befehl darf weiter vorrangig antworten (unverändertes Verhalten)
    check('2e Gruppen 0 bis 5 behalten den alten Rückfall', A.sb.jvChef.mehrteilig('Erinnere mich morgen an den Arzt und trag einen Termin ein') === true);
    // Die beiden neuen Werkzeuge direkt
    const RG = A.sb.jvRegistry;
    let rr = await RG.fuehreAus('haushaltsbuch_lesen', {}, {});
    check('4a haushaltsbuch_lesen liefert die Bilanz als Satz', rr.status === 'SUCCESS' && /Buchungen|eingegangen/.test(rr.daten && rr.daten.nachricht || ''), JSON.stringify(rr).slice(0, 250));
    rr = await RG.fuehreAus('karte_zeigen', {}, {});
    check('4b karte_zeigen legt die Karte auf', rr.status === 'SUCCESS' && /Karte/.test(rr.daten && rr.daten.nachricht || ''), JSON.stringify(rr).slice(0, 250));
    check('4c beide sind rein lesend: keine Bestätigung, nicht in den Schreib-Listen', ['haushaltsbuch_lesen', 'karte_zeigen'].every(n => RG.hole(n).bestaetigung.noetig === false && !C.B2A_SCHREIBT.includes(n)));
    // Einzelfragen bleiben bei den festen Befehlen
    for (const satz of ['Wann geht die Sonne unter', 'Habe ich Urlaub', 'Welche Rechnungen sind offen', 'Wie viel sind 50 Dollar in Euro', 'Was kostet ein Fernseher und ein Toaster', 'Zeig mir die Karte', 'Wie war mein Monat', 'Zeig mir das Haushaltsbuch', 'Haushaltsbuch einlesen und wie wird das Wetter morgen', 'Zeig mir die Sparkarte und die Kreditkarte']) {
        check('3a Einzelfrage ist nicht mehrteilig: ' + satz, C.mehrteilig(satz) === false);
    }
    // Schreibwünsche mit Urlaub/Rechnung zählen nicht als lesende Gruppe
    check('3b "Urlaub eintragen und Wetter" ist keine Urlaub-Leseabfrage', C.mehrteilig('Trag meinen Urlaub ein und sag mir das Wetter') === false);
    console.log(fehler ? '✗ ' + fehler + ' Fehler' : '✓ alle ' + ok + ' Prüfungen bestanden');
    process.exit(fehler ? 1 : 0);
})();
