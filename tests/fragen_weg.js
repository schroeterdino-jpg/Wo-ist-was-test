/* ============================================================
   TESTS "Fragen auf dem Sprachweg" (Phase A+B des Intelligenz-Umbaus). Start: node tests/fragen_weg.js
   Messkorpus mit rund 170 realistischen deutschen Sprachfragen. Geprüft wird nicht nur, DASS etwas reagiert, sondern
     - WER antwortet (richtiges lokales Modul oder KI; Modulname aus dem echten Befehlsweg der ganzen App),
     - ob bei mehreren Fragen in einem Satz ALLE Teilfragen erhalten bleiben (in der gesprochenen Antwort oder im KI-Auftrag),
     - ob eine Anschlussfrage richtig weiterläuft,
     - dass reine Fragen nichts verändern (kein Eintrag, kein Speichern) und dass die Chef-KI aus bleibt.
   Die KI ist eine Attrappe (antwortet "KI-ANTWORT" und merkt sich den Auftrag); Netz sonst aus. Die Tabelle beschreibt den heutigen, geprüften Stand:
   ändert sich das Verhalten absichtlich, wird die Zeile angepasst. Bekannte Lücken stehen getrennt unten und lassen den Test nicht scheitern.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const ant = d => ({ ok: true, status: 200, json: async () => d });
const tick = n => new Promise(async res => { for (let i = 0; i < (n || 5); i++) await new Promise(r => setImmediate(r)); res(); });
const JETZT = '2026-11-07T14:40:00+01:00';   // Samstag
const KI_ANTWORT = 'KI-ANTWORT';

/* Eine App (frische Welt) mit fest eingestellter Schicht, KI-Attrappe und Aufzeichnung der KI-Aufträge */
function neueApp() {
    const kiCalls = [];
    const A = starte({ jetzt: JETZT, festerZufall: true, fetch: async (u, opts) => {
        if (/\/api\/groq/.test(u)) {
            const b = JSON.parse(opts.body); kiCalls.push(String(b.messages[b.messages.length - 1].content));
            return ant({ choices: [{ message: { content: JSON.stringify({ reply: KI_ANTWORT, actions: [] }) } }] });
        }
        throw new Error('offline (Attrappe): ' + u);
    } });
    A.store['jv_schicht'] = JSON.stringify({ base: A.sb._schichtTest.weekNo({ y: 2026, m: 11, d: 7 }), shift: 'spaet', times: { frueh: 420, spaet: 765 }, auto: true });
    A.vorspulen(2000);
    return { A, kiCalls };
}
/* Abbild alles Gespeicherten (Speicher ohne Stimmung, Tageslog und Nutzungsprotokoll der Routinen, die sich mit jeder Frage ändern dürfen, und Kalender) */
function abbild(A) {
    const st = {}; Object.keys(A.store).filter(k => !/^jv_(?:laune|tageslog|routinen)/.test(k)).sort().forEach(k => { st[k] = A.store[k]; });
    return JSON.stringify({ st, kal: A.lese('calendarEntries') });
}
/* Wie voice.js: erst die festen Befehle (A.satz), sonst die KI */
async function frage(App, satz) {
    const { A, kiCalls } = App;
    kiCalls.length = 0;
    const g0 = A.gesagt.length, z0 = abbild(A);
    let r;
    await A.lassLaufen(async () => {
        r = await A.satz(satz);
        if (!r.lokal) await A.sb.sendToGroqSmart(satz);
        await tick(80);
    });
    const modul = r.modul == null ? '' : (String(r.modul).startsWith('(Basis') ? 'Basis' : String(r.modul));
    const ki = kiCalls.slice();
    return { lokal: !!r.lokal, modul, ki, gesagt: A.gesagt.slice(g0).join(' '), unveraendert: abbild(A) === z0 };
}
const weg = e => (e.lokal && !e.ki.length) ? 'lokal' : (!e.lokal ? 'ki' : 'beides');
const klein = s => String(s || '').toLowerCase();

/* ---------- 1. Tabelle: Satz -> richtiger Weg ----------
   k Gruppe · s Satz · w Weg (lokal | ki | beides) · m Modulname (lokal; bei Mehrfachfragen "<lokales Modul>+mehrfachfrage") · sagt Teil der lokalen Antwort · teile Stichwörter, die ALLE vorkommen müssen */
const TABELLE = [
    {k:'info', s:"Wie spät ist es in Tokio?", w:'lokal', m:"erweiterungen", sagt:/tokio.*22 uhr 40/},
    {k:'info', s:"Wie hoch ist der Eiffelturm?", w:'ki'},
    {k:'info', s:"Was ist die Hauptstadt von Australien?", w:'ki'},
    {k:'info', s:"Wer hat gestern die Bundesliga gewonnen?", w:'ki'},
    {k:'info', s:"Wie viel ist 17 Prozent von 240?", w:'ki'},
    {k:'info', s:"Wann ist der nächste Vollmond?", w:'lokal', m:"erweiterungen", sagt:/vollmond.*24\. november/},
    {k:'info', s:"Wann geht morgen die Sonne auf?", w:'lokal', m:"erweiterungen", sagt:/7 uhr 33/},
    {k:'info', s:"Wann ist Sonnenuntergang?", w:'lokal', m:"erweiterungen"},
    {k:'info', s:"Welcher Tag ist heute?", w:'ki'},
    {k:'info', s:"Welches Datum haben wir heute?", w:'ki'},
    {k:'info', s:"Wie viele Tage sind es bis Weihnachten?", w:'ki'},
    {k:'info', s:"Wann ist Weihnachten?", w:'lokal', m:"erweiterungen", sagt:/weihnachten.*25\. dezember/},
    {k:'info', s:"Wann ist der nächste Feiertag?", w:'lokal', m:"erweiterungen", sagt:/weihnachtstag/},
    {k:'info', s:"Wie spät ist es?", w:'ki'},
    {k:'info', s:"Wie viel Uhr ist es in New York?", w:'lokal', m:"erweiterungen", sagt:/new york.*8 uhr 40/},
    {k:'info', s:"Wie heißt die Hauptstadt von Frankreich?", w:'ki'},
    {k:'info', s:"Wer war der erste Mensch auf dem Mond?", w:'ki'},
    {k:'info', s:"Wie weit ist der Mond von der Erde entfernt?", w:'ki'},
    {k:'info', s:"Was bedeutet Fernweh?", w:'ki'},
    {k:'info', s:"Wie schreibt man Rhythmus?", w:'ki'},
    {k:'form', s:"Wann ist Vollmond?", w:'lokal', m:"erweiterungen", sagt:/vollmond.*24\. november/},
    {k:'form', s:"Wann haben wir den nächsten Vollmond?", w:'lokal', m:"erweiterungen", sagt:/24\. november/},
    {k:'form', s:"Wann kommt der nächste Vollmond?", w:'lokal', m:"erweiterungen", sagt:/24\. november/},
    {k:'form', s:"Sag mir, wann der nächste Vollmond ist", w:'lokal', m:"erweiterungen", sagt:/24\. november/},
    {k:'form', s:"Weißt du, wann Vollmond ist?", w:'lokal', m:"erweiterungen", sagt:/24\. november/},
    {k:'form', s:"Wann beginnt meine Schicht?", w:'lokal', m:"schicht_auskunft", sagt:/frühschicht.*5 uhr 10/},
    {k:'form', s:"Wann fängt meine Schicht an?", w:'lokal', m:"schicht_auskunft", sagt:/frühschicht.*5 uhr 10/},
    {k:'form', s:"Wann muss ich morgen zur Arbeit?", w:'lokal', m:"schicht_auskunft", sagt:/keine schicht/},
    {k:'form', s:"Welche Schicht habe ich diese Woche?", w:'lokal', m:"schicht", sagt:/spätschicht/},
    {k:'form', s:"Welche Schicht habe ich übernächste Woche?", w:'lokal', m:"schicht"},
    {k:'form', s:"Habe ich morgen Frühschicht?", w:'lokal', m:"plan_ansagen"},
    {k:'form', s:"Muss ich morgen früh raus?", w:'ki'},
    {k:'form', s:"Wann ist meine Schicht zu Ende?", w:'lokal', m:"schicht_auskunft", sagt:/feierabend/},
    {k:'form', s:"Wann habe ich Feierabend?", w:'lokal', m:"schicht_auskunft"},
    {k:'form', s:"Wie wird morgen das Wetter?", w:'ki'},
    {k:'form', s:"Wie ist das Wetter morgen?", w:'ki'},
    {k:'form', s:"Wird es morgen regnen?", w:'ki'},
    {k:'form', s:"Gibt es morgen Regen?", w:'ki'},
    {k:'form', s:"Brauche ich morgen einen Regenschirm?", w:'ki'},
    {k:'form', s:"Was sagt der Wetterbericht für Samstag?", w:'ki'},
    {k:'form', s:"Wie warm wird es heute?", w:'ki'},
    {k:'form', s:"Soll ich heute die Wäsche draußen aufhängen?", w:'ki'},
    {k:'form', s:"Brauche ich heute eine Jacke?", w:'ki'},
    {k:'form', s:"Wie wird das Wetter in Hamburg?", w:'lokal', m:"Basis"},
    {k:'form', s:"Wie ist das Wetter in Lübeck am Wochenende?", w:'lokal', m:"Basis"},
    {k:'form', s:"Was steht heute an?", w:'lokal', m:"was_steht_an", sagt:/nichts eingetragen/},
    {k:'form', s:"Was steht morgen in meinem Kalender?", w:'lokal', m:"was_steht_an", sagt:/nichts eingetragen/},
    {k:'form', s:"Was habe ich morgen vor?", w:'lokal', m:"was_steht_an"},
    {k:'form', s:"Welche Termine habe ich diese Woche?", w:'ki'},
    {k:'form', s:"Habe ich morgen einen Termin?", w:'ki'},
    {k:'form', s:"Was steht am Samstag an?", w:'lokal', m:"was_steht_an"},
    {k:'form', s:"Habe ich nächste Woche Zeit?", w:'ki'},
    {k:'form', s:"Wann habe ich das nächste Mal frei?", w:'ki'},
    {k:'laden', s:"Wann hat die Apotheke in Schwarzenbek auf?", w:'lokal', m:"Basis", sagt:/schwarzenbek/},
    {k:'laden', s:"Wann hat der Supermarkt in Schwarzenbek auf?", w:'lokal', m:"Basis", sagt:/schwarzenbek/},
    {k:'laden', s:"Hat die Apotheke in Mölln noch auf?", w:'lokal', m:"Basis"},
    {k:'laden', s:"Wo ist die nächste Apotheke?", w:'lokal', m:"Basis"},
    {k:'laden', s:"Ist die Apotheke in Geesthacht offen?", w:'lokal', m:"Basis", sagt:/geesthacht/},
    {k:'laden', s:"Wo ist der nächste Penny?", w:'lokal', m:"Basis"},
    {k:'laden', s:"Gibt es in Hamburg eine Apotheke?", w:'lokal', m:"Basis"},
    {k:'laden', s:"Wann macht der Bäcker in Ratzeburg auf?", w:'lokal', m:"Basis"},
    {k:'laden', s:"Ist die Tankstelle in Mölln noch geöffnet?", w:'ki'},
    {k:'laden', s:"Wo ist die nächste Bank?", w:'lokal', m:"Basis"},
    {k:'laden', s:"Wo finde ich einen Parkplatz in der Nähe?", w:'lokal', m:"Basis"},
    {k:'laden', s:"Wo ist die nächste Toilette?", w:'lokal', m:"Basis"},
    {k:'laden', s:"Such mir einen Italiener in der Nähe", w:'ki'},
    {k:'laden', s:"Wann öffnet die Post?", w:'ki'},
    {k:'laden', s:"Wo gibt es einen Arzt in Lauenburg?", w:'lokal', m:"Basis"},
    {k:'route', s:"Wie komme ich von hier nach Hamburg Hauptbahnhof?", w:'ki'},
    {k:'route', s:"Wie lange brauche ich nach Lübeck?", w:'ki'},
    {k:'route', s:"Wie lange brauche ich morgen zur Arbeit?", w:'ki'},
    {k:'route', s:"Ist auf dem Weg zur Arbeit gerade Stau?", w:'ki'},
    {k:'route', s:"Ist der Weg nach Lübeck frei?", w:'ki'},
    {k:'route', s:"Wann sollte ich morgen losfahren?", w:'ki'},
    {k:'route', s:"Wann fährt der nächste Zug nach Hamburg?", w:'ki'},
    {k:'route', s:"Wann fährt der Bus nach Schwarzenbek?", w:'ki'},
    {k:'route', s:"Wie ist die Verkehrslage auf der A1?", w:'ki'},
    {k:'route', s:"Navigiere mich nach Hause", w:'ki'},
    {k:'route', s:"Wie weit ist es bis Hamburg?", w:'ki'},
    {k:'route', s:"Wie lange dauert die Fahrt zum Flughafen?", w:'ki'},
    {k:'route', s:"Muss ich morgen früher los wegen Regen?", w:'ki'},
    {k:'route', s:"Gibt es Stau auf dem Weg nach Hamburg?", w:'ki'},
    {k:'route', s:"Was kostet ein Liter Diesel in Hamburg?", w:'ki'},
    {k:'ausflug', s:"Was können wir am Wochenende mit den Kindern unternehmen?", w:'lokal', m:"ausflug"},
    {k:'ausflug', s:"Hast du eine Idee für einen Ausflug am Sonntag?", w:'lokal', m:"ausflug"},
    {k:'ausflug', s:"Wohin können wir am Samstag mit den Enkeln fahren?", w:'lokal', m:"ausflug"},
    {k:'ausflug', s:"Habe ich nächste Woche Zeit für einen Ausflug nach Lübeck?", w:'lokal', m:"ausflug"},
    {k:'ausflug', s:"Habe ich am Wochenende Zeit für einen Ausflug?", w:'lokal', m:"ausflug"},
    {k:'ausflug', s:"Hab ich morgen Zeit für einen Ausflug?", w:'lokal', m:"ausflug"},
    {k:'ausflug', s:"Lohnt sich ein Ausflug am Sonntag bei dem Wetter?", w:'ki'},
    {k:'ausflug', s:"Plane uns einen Ausflug für Samstag mit den Kindern", w:'lokal', m:"ausflug"},
    {k:'ausflug', s:"Wir waren gestern im Tierpark Hagenbeck, das war super", w:'lokal', m:"ausflug", sagt:/gemerkt.*tierpark hagenbeck/},
    {k:'ausflug', s:"Welche Ausflüge haben wir schon gemacht?", w:'lokal', m:"ausflug", sagt:/noch keinen ausflug/},
    {k:'ausflug', s:"Wo waren wir schon?", w:'lokal', m:"ausflug", sagt:/noch keinen ausflug/},
    {k:'ausflug', s:"Was ist heute in der Nähe los?", w:'lokal', m:"ausflug"},
    {k:'mehr', s:"Wann ist Vollmond und brauche ich dann eine Jacke?", w:'beides', m:"vollmond_auskunft+mehrfachfrage", teile:["vollmond", "jacke"]},
    {k:'mehr', s:"Gibt es morgen Regen und wann fängt meine Schicht an?", w:'beides', m:"schicht_auskunft+mehrfachfrage", teile:["regen", "schicht"]},
    {k:'mehr', s:"Was habe ich morgen vor und wie wird das Wetter dazu?", w:'beides', m:"was_steht_an+mehrfachfrage", teile:["vor", "wetter"]},
    {k:'mehr', s:"Was steht heute an und wie wird das Wetter?", w:'beides', m:"was_steht_an+mehrfachfrage", teile:["eingetragen", "wetter"]},
    {k:'mehr', s:"Wann beginnt meine Schicht und wie wird das Wetter morgen?", w:'beides', m:"schicht_auskunft+mehrfachfrage", teile:["schicht", "wetter"]},
    {k:'mehr', s:"Wann ist Vollmond und wie wird morgen das Wetter?", w:'beides', m:"vollmond_auskunft+mehrfachfrage", teile:["vollmond", "wetter"]},
    {k:'mehr', s:"Wie wird das Wetter morgen und was steht morgen an?", w:'beides', m:"was_steht_an+mehrfachfrage", teile:["wetter", "eingetragen"]},
    {k:'mehr', s:"Wann beginnt meine Schicht und wann ist der nächste Vollmond?", w:'lokal', m:"schicht_auskunft+vollmond_auskunft+mehrfachfrage", teile:["schicht", "vollmond"]},
    {k:'mehr', s:"Wann ist Vollmond und wann geht die Sonne auf?", w:'beides', m:"vollmond_auskunft+mehrfachfrage", teile:["vollmond", "sonne"]},
    {k:'mehr', s:"Wie spät ist es in Tokio und wie spät ist es in New York?", w:'lokal', m:"erweiterungen", teile:["tokio", "new york"]},
    {k:'mehr', s:"Wie wird morgen das Wetter und muss ich dann früher los?", w:'ki', teile:["wetter", "früher los"]},
    {k:'mehr', s:"Was kostet Diesel in Hamburg und wie ist das Wetter dort?", w:'ki', teile:["diesel", "wetter"]},
    {k:'mehr', s:"Gibt es morgen Regen und brauche ich einen Schirm?", w:'ki', teile:["regen", "schirm"]},
    {k:'mehr', s:"Ist morgen Frühschicht und gibt es Regen?", w:'lokal', m:"schicht"},
    {k:'mehr', s:"Wann fängt meine Schicht an und brauche ich heute eine Jacke?", w:'beides', m:"schicht_auskunft+mehrfachfrage", teile:["schicht", "jacke"]},
    {k:'mehr', s:"Wann hat die Apotheke in Mölln auf und wie komme ich dahin?", w:'ki', teile:["apotheke", "komme ich"]},
    {k:'mehr', s:"Wie wird das Wetter am Samstag und wann geht die Sonne unter?", w:'ki', teile:["wetter", "sonne"]},
    {k:'mehr', s:"Was steht morgen an und wann beginnt meine Schicht?", w:'lokal', m:"was_steht_an+schicht_auskunft+mehrfachfrage", teile:["eingetragen", "schicht"]},
    {k:'mehr', s:"Wann ist Weihnachten und wie viele Tage sind es noch?", w:'lokal', m:"erweiterungen", teile:["weihnachten", "48 tagen"]},
    {k:'mehr', s:"Wer hat gestern gewonnen und wie hoch war das Ergebnis?", w:'ki', teile:["gewonnen", "ergebnis"]},
    {k:'mehr', s:"Wie spät ist es und wie wird das Wetter?", w:'ki', teile:["spät", "wetter"]},
    {k:'mehr', s:"Was kostet ein Liter Diesel und wo ist die nächste Tankstelle?", w:'ki', teile:["diesel", "tankstelle"]},
    {k:'verw', s:"Wann hat die Bäckerei in Ratzeburg auf?", w:'lokal', m:"Basis"},
    {k:'verw', s:"Ich habe Hunger", w:'ki'},
    {k:'verw', s:"Wo waren wir gestern?", w:'ki'},
    {k:'verw', s:"Was ist mit meiner Schicht am Samstag?", w:'ki'},
    {k:'verw', s:"Wann ist die Müllabfuhr?", w:'ki'},
    {k:'verw', s:"Wann hat Julia Geburtstag?", w:'ki'},
    {k:'verw', s:"Was hatte ich mir wegen der Waschmaschine gemerkt?", w:'ki'},
    {k:'verw', s:"Wann habe ich den Schlüssel abgelegt?", w:'ki'},
    {k:'verw', s:"Wo habe ich mein Auto geparkt?", w:'ki'},
    {k:'verw', s:"Erinnere mich morgen um 8 an den Zahnarzt", w:'ki'},
    {k:'verw', s:"Trag morgen um 15 Uhr Zahnarzt in den Kalender ein", w:'ki'},
    {k:'verw', s:"Lösche meinen Termin morgen", w:'ki'},
    {k:'verw', s:"Ruf Julia an", w:'ki'},
    {k:'verw', s:"Was läuft heute im Fernsehen?", w:'ki'},
    {k:'verw', s:"Übersetze guten Morgen ins Türkische", w:'ki'},
    {k:'verw', s:"Mach das Licht an", w:'ki'},
    {k:'verw', s:"Stell einen Timer auf zehn Minuten", w:'ki'},
    {k:'verw', s:"Wie viel Zeit habe ich noch bis Feierabend?", w:'ki'},
    {k:'verw', s:"Wann ist der Mond am hellsten?", w:'ki'},
    {k:'verw', s:"Wo ist der Mond gerade?", w:'lokal', m:"erweiterungen", sagt:/vollmond/},
    {k:'lueck', s:"Wetter", w:'ki'},
    {k:'lueck', s:"Wann?", w:'ki'},
    {k:'lueck', s:"Und dann?", w:'ki'},
    {k:'lueck', s:"Wie komme ich dahin?", w:'ki'},
    {k:'lueck', s:"Wie lange dauert das?", w:'ki'},
    {k:'lueck', s:"Habe ich Zeit?", w:'ki'},
    {k:'lueck', s:"Ausflug", w:'lokal', m:"ausflug"},
    {k:'lueck', s:"Wann hat die auf?", w:'ki'},
    {k:'lueck', s:"Ist es dort kalt?", w:'ki'},
    {k:'lueck', s:"Erinnere mich", w:'ki'}
];
/* Bekannte Lücken: die Antwort ist heute unvollständig. Sie lassen den Test nicht scheitern, werden aber gemeldet (und melden sich, sobald sie behoben sind). */
const LUECKEN = [
    { s: 'Ist morgen Frühschicht und gibt es Regen?', fehlt: /regen/, grund: 'Der frühe Schicht-Befehl nimmt den ganzen Satz; "Ist morgen Frühschicht" ist keine sichere Einzelauskunft, deshalb wird nicht zerlegt.' }
];
/* ---------- 2. Anschlussfragen: erste Frage, dann die Folgefrage in DERSELBEN App ---------- [erste, folge, Weg der Folge, Modul der Folge] */
const FOLGEN = [
    ["Wie wird morgen das Wetter?", "Und am Samstag?", 'ki', null],
    ["Wie wird morgen das Wetter?", "Und in Hamburg?", 'ki', null],
    ["Wie ist das Wetter in Lübeck?", "Und wie komme ich da hin?", 'ki', null],
    ["Wo ist die nächste Apotheke?", "Und wie lange dauert das?", 'ki', null],
    ["Such mir einen Italiener in der Nähe", "Und wie komme ich da hin?", 'ki', null],
    ["Wann ist der nächste Vollmond?", "Und wann geht dann die Sonne auf?", 'lokal', "erweiterungen"],
    ["Wann beginnt meine Schicht?", "Und morgen?", 'ki', null],
    ["Wie spät ist es in Tokio?", "Und in New York?", 'lokal', "erweiterungen"],
    ["Was steht heute an?", "Und morgen?", 'ki', null],
    ["Habe ich nächste Woche Zeit für einen Ausflug nach Lübeck?", "die Kinder", 'lokal', "ausflug"]
];

(async () => {
    /* ---------- 1. Tabelle ---------- */
    check('Korpus hat mindestens 150 Fragen', TABELLE.length + FOLGEN.length * 2 >= 150, String(TABELLE.length + FOLGEN.length * 2));
    const gruppen = {};
    for (const z of TABELLE) {
        gruppen[z.k] = (gruppen[z.k] || 0) + 1;
        const App = neueApp(), e = await frage(App, z.s);
        const w = weg(e), name = z.k + ': ' + z.s;
        check(name + ' → Weg ' + z.w, w === z.w, 'war ' + w + ' (' + e.modul + ') ' + e.gesagt.slice(0, 100));
        if (z.m !== undefined && z.w !== 'ki') check(name + ' → Modul ' + z.m, e.modul === z.m, 'war "' + e.modul + '"');
        if (z.w === 'ki') check(name + ' → KI bekommt den ganzen Satz', e.ki.length >= 1 && klein(e.ki[0]).includes(klein(z.s).replace(/[?!.]+$/, '').slice(0, 25)), JSON.stringify(e.ki));
        if (z.sagt) check(name + ' → Antwort enthält ' + z.sagt, z.sagt.test(klein(e.gesagt)), e.gesagt.slice(0, 160));
        if (z.teile) {
            const alles = klein(e.gesagt + ' ' + e.ki.join(' '));
            for (const t of z.teile) check(name + ' → Teilfrage "' + t + '" bleibt erhalten', alles.includes(t), alles.slice(0, 200));
        }
        const schreibend = /^(?:Erinnere|Trag|Lösche|Wir waren|Ruf|Stell|Mach|Übersetze|Navigiere)\b/.test(z.s);
        if (!schreibend && z.w !== 'ki') check(name + ' → ändert nichts', e.unveraendert);
        check(name + ' → höchstens ein KI-Aufruf' + (z.s === 'Was läuft heute im Fernsehen?' ? ' (Fernseh-Weg fragt zweimal, wie bisher)' : ''), e.ki.length <= (z.s === 'Was läuft heute im Fernsehen?' ? 2 : 1), String(e.ki.length));
        check(name + ' → Chef-KI bleibt aus', !App.A.store['jv_chef'] && !App.A.sb.jvChef.istAn());
    }
    /* ---------- 2. Anschlussfragen ---------- */
    for (const [a, b, w, m] of FOLGEN) {
        const App = neueApp();
        await frage(App, a);
        const e = await frage(App, b);
        const name = 'Anschluss: "' + a + '" dann "' + b + '"';
        check(name + ' → Weg ' + w, weg(e) === w, 'war ' + weg(e) + ' (' + e.modul + ') ' + e.gesagt.slice(0, 100));
        if (m) check(name + ' → Modul ' + m, e.modul === m, 'war "' + e.modul + '"');
        if (w === 'ki') check(name + ' → KI bekommt die Folgefrage', e.ki.length === 1 && klein(e.ki[0]).includes(klein(b).replace(/[?!.]+$/, '')), JSON.stringify(e.ki));
    }

    /* ---------- 3. Die vier nachgewiesenen Fehlzuordnungen im Detail ---------- */
    {   // 3.1 Apotheke: Öffnungszeiten-Frage, kein Ausflug
        const App = neueApp(), e = await frage(App, 'Wann hat die Apotheke in Schwarzenbek auf?');
        check('3.1 Apotheke landet nicht im Ausflug-Modul', e.modul !== 'ausflug' && !/wer kommt mit/i.test(e.gesagt), e.modul + ' / ' + e.gesagt);
        check('3.1 Ort wird als "Schwarzenbek" gesucht, nicht als "Schwarzenbek Auf"', /schwarzenbek/i.test(e.gesagt) && !/schwarzenbek auf/i.test(e.gesagt), e.gesagt);
        const App2 = neueApp(); await frage(App2, 'Habe ich nächste Woche Zeit für einen Ausflug nach Lübeck?');
        const e2 = await frage(App2, 'Wann hat die Apotheke in Mölln auf?');
        check('3.1 Eine offene Rückfrage "Wer kommt mit?" schluckt eine fremde Frage nicht', e2.modul !== 'ausflug' && !/ich kenne deinen standort|wer kommt mit/i.test(e2.gesagt), e2.modul + ' / ' + e2.gesagt);
    }
    {   // 3.2 Zeit für einen Ausflug: Kalender UND Ausflugsabsicht
        const App = neueApp(), A = App.A;
        // Montag 9.11. voll belegt, alle anderen Tage frei
        ['10:00', '12:00', '14:00', '16:00'].forEach(h => A.lese('calendarEntries').push({ id: 'T' + h, text: 'Termin ' + h, isoDate: '2026-11-09T' + h + ':00+01:00' }));
        const z0 = JSON.stringify(A.lese('calendarEntries'));
        const e = await frage(App, 'Habe ich nächste Woche Zeit für einen Ausflug nach Lübeck?');
        check('3.2 Modul ist der Ausflug (Absicht erkannt)', e.modul === 'ausflug', e.modul);
        check('3.2 Antwort nennt das Ziel Lübeck', /Lübeck/.test(e.gesagt), e.gesagt);
        check('3.2 Antwort nennt freie Tage aus dem Kalender', /Dienstag/.test(e.gesagt) && /Samstag/.test(e.gesagt), e.gesagt);
        check('3.2 Der volle Montag wird NICHT als frei genannt', !/Montag,|Montag und|: Montag/.test(e.gesagt.replace(/Soll ich.*$/, '')), e.gesagt);
        check('3.2 Es wird nachgefragt, nicht losgeplant', /Soll ich|Dann sag, wer mitkommt/.test(e.gesagt) && e.ki.length === 0, e.gesagt);
        check('3.2 Kalender unverändert (nichts geschrieben)', JSON.stringify(A.lese('calendarEntries')) === z0);
        const e2 = await frage(App, 'die Kinder');
        check('3.2 Die Antwort "die Kinder" setzt die Planung fort', e2.modul === 'ausflug', e2.modul);
        check('3.2 Auch jetzt wird nichts in den Kalender geschrieben', JSON.stringify(A.lese('calendarEntries')) === z0);
        const App3 = neueApp();
        ['10:00', '12:00', '14:00', '16:00'].forEach(h => ['2026-11-08'].forEach(d => App3.A.lese('calendarEntries').push({ id: 'U' + h, text: 'Termin ' + h, isoDate: d + 'T' + h + ':00+01:00' })));
        const e3 = await frage(App3, 'Hab ich morgen Zeit für einen Ausflug?');
        check('3.2 Voller Tag: ehrliche Antwort "kein Tag", keine Rückfrage', /kein Tag/.test(e3.gesagt) && !/Wer|mitkommt/.test(e3.gesagt), e3.gesagt);
    }
    {   // 3.3 Vollmond UND Jacke
        const App = neueApp(), e = await frage(App, 'Wann ist Vollmond und brauche ich dann eine Jacke?');
        check('3.3 Vollmond wird lokal beantwortet', /24\. November/.test(e.gesagt), e.gesagt);
        check('3.3 Jacken-Frage geht an die KI (genau ein Aufruf)', e.ki.length === 1 && /jacke/i.test(e.ki[0]), JSON.stringify(e.ki));
        check('3.3 Die KI weiß, auf welchen Tag sich "dann" bezieht', /Vollmond/.test(e.ki[0] || '') && /24\. November/.test(e.ki[0] || ''), JSON.stringify(e.ki));
        check('3.3 Gesprochen wird EINE zusammengesetzte Antwort', /Vollmond/.test(e.gesagt) && e.gesagt.includes(KI_ANTWORT), e.gesagt);
    }
    {   // 3.4 Regen UND Schicht
        const App = neueApp(), e = await frage(App, 'Gibt es morgen Regen und wann fängt meine Schicht an?');
        check('3.4 Schicht wird lokal beantwortet', /Frühschicht/.test(e.gesagt), e.gesagt);
        check('3.4 Regen-Frage geht an die KI (genau ein Aufruf)', e.ki.length === 1 && /regen/i.test(e.ki[0]) && !/schicht/i.test(e.ki[0]), JSON.stringify(e.ki));
        check('3.4 Gesprochen wird EINE zusammengesetzte Antwort mit beiden Teilen', e.gesagt.includes(KI_ANTWORT) && /Frühschicht/.test(e.gesagt), e.gesagt);
        const App2 = neueApp(); App2.A.sb.jvMehrfachfrage.umgehen = true;
        const e2 = await frage(App2, 'Gibt es morgen Regen und wann fängt meine Schicht an?');
        check('3.4 Kontrolle: ohne den Mehrfachfrage-Weg fehlt der Regen-Teil (Test misst wirklich)', !e2.ki.some(x => /regen/i.test(x)));
    }

    /* ---------- 4. Grenzen: nichts wird pauschal an die KI geschickt ---------- */
    {
        const App = neueApp(), e = await frage(App, 'Gibt es morgen Regen und brauche ich einen Schirm?');
        check('4.1 Zwei reine KI-Fragen bleiben EIN Aufruf mit dem ganzen Satz', e.ki.length === 1 && /regen/i.test(e.ki[0]) && /schirm/i.test(e.ki[0]) && !e.lokal, JSON.stringify(e.ki));
        const e2 = await frage(neueApp(), 'Wie spät ist es in Tokio und wie spät ist es in New York?');
        check('4.2 Zwei Weltzeiten werden lokal beantwortet, beide Städte, ohne KI', e2.lokal && !e2.ki.length && /Tokio/.test(e2.gesagt) && /New York/.test(e2.gesagt), e2.gesagt);
        const e3 = await frage(neueApp(), 'Wer war der erste Mensch auf dem Mond?');
        check('4.3 Wissensfrage über den Mond geht an die KI (nicht Mondaufgang)', !e3.lokal && e3.ki.length === 1, e3.gesagt);
        const e4 = await frage(neueApp(), 'Wie ist das Wetter in Lübeck am Wochenende?');
        check('4.4 "am Wochenende" wird nicht Teil des Ortsnamens', /Lübeck/.test(e4.gesagt) && !/Wochenende/.test(e4.gesagt), e4.gesagt);
        const e5 = await frage(neueApp(), 'Gibt es in Hamburg eine Apotheke?');
        check('4.5 "eine" wird nicht Teil des Ortsnamens', /Hamburg/.test(e5.gesagt) && !/Hamburg Eine/.test(e5.gesagt), e5.gesagt);
        const e6 = await frage(neueApp(), 'Wann ist Vollmond?');
        check('4.6 Einzelfrage Vollmond läuft unverändert über das normale Modul', e6.modul === 'erweiterungen' && !e6.ki.length, e6.modul);
    }
    /* Chef-KI ist nicht eingeschaltet, Groq-Weg unverändert */
    {
        const App = neueApp();
        check('5.1 Chef-KI ist ohne Einstellung aus', !App.A.store['jv_chef'] && !(App.A.sb.jvChef && App.A.sb.jvChef.istAn()), String(App.A.store['jv_chef']));
    }

    /* ---------- Bekannte Lücken (melden, nicht scheitern) ---------- */
    for (const l of LUECKEN) {
        const e = await frage(neueApp(), l.s), alles = klein(e.gesagt + ' ' + e.ki.join(' '));
        if (l.fehlt.test(alles)) console.log('  Lücke behoben: "' + l.s + '" – bitte aus LUECKEN entfernen');
        else console.log('  bekannte Lücke: "' + l.s + '" – ' + l.grund);
    }

    console.log('Fragen auf dem Sprachweg: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler (' + (TABELLE.length + FOLGEN.length * 2) + ' Fragen: ' + Object.keys(gruppen).map(g => g + ' ' + gruppen[g]).join(', ') + ', Anschluss ' + FOLGEN.length * 2 + ')');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
