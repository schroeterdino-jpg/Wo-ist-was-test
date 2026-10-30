/* ============================================================
   „LETZTE FRAGE GEWINNT“, zweite Stufe (Start: node tests/pending_zweite_stufe.js)
   Dazu gekommen sind: mailwatch, Termin-Erinnerung (langzeit_erinnern), Routinen, Kündigung, Orte, Spotify (Auto), Fahr-WhatsApp,
   Foto (Kontakt und die Auswahl „Was soll ich damit tun?“), Behördenbrief. Jedes Modul stellt hier seine ECHTE Frage (mit festen Attrappen, ohne Netz).
   Je Modul drei Abläufe mit der Löschfrage (loeschen_fragen) als Gegenstück:
     A  älter: Löschfrage, danach stellt das Modul seine Frage  -> ein Ja geht an das Modul, die Löschfrage wird NICHT ausgeführt, auch ein zweites Ja nicht
     B  älter: das Modul, danach die Löschfrage                  -> ein Ja löscht, das Modul bekommt es nicht, die alte Frage des Moduls kommt danach nicht zurück
     C  das Modul allein                                         -> Einzelbetrieb wie bisher (das Ja geht an das Modul)
   Dazu: Nein landet beim richtigen Modul, Auswahlfragen sperren ältere Ja/Nein-Fragen, zwei Module untereinander.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');

let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const antwort = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const MORGEN = '2026-10-29T14:00:00+01:00';
const pause = ms => new Promise(r => setTimeout(r, ms));

function neu(opt) {
    opt = opt || {};
    const app = starte({
        festerZufall: true, native: !!opt.native,
        fetch: async (u, o) => {
            if (/\/api\/groq/.test(u)) return antwort({ choices: [{ message: { content: JSON.stringify({ reply: 'Das ist erledigt.', actions: [] }) } }] });
            throw new Error('offline (Attrappe): ' + u);
        }
    });
    app.vm.runInContext("accessToken='tok'; googleTokenExpiresAt=Date.now()+3600000", app.sb);
    if (opt.native) {
        app.sb.ZaneNative.planOrte = () => true;
        app.sb.ZaneNative.ortStatus = () => JSON.stringify({ fein: false, immer: false });
    }
    return app;
}
const aktuell = app => (app.sb.jvFrage && app.sb.jvFrage.aktuell) ? app.sb.jvFrage.aktuell() : undefined;
const von = (x, name) => new RegExp('(^|\\+)' + name + '(\\+|$)').test(x.modul || '');
const termine = app => JSON.parse(app.vm.runInContext('JSON.stringify(calendarEntries.map(e => e.text))', app.sb));
const zahnarzt = app => termine(app).some(t => /zahnarzt/i.test(t));
async function antwortJa(app, t) { const x = await app.satz(t || 'Ja'); await pause(60); await app.lassLaufen(async () => { }); return x; }

/* ---- Die Löschfrage (Gegenstück) ---- */
async function frageL(app) {
    await app.sb.addGoogleCalendarEvent('Zahnarzt', MORGEN, '');
    await app.ki('Lösche den Zahnarzt', [{ type: 'calendar_delete', calendar_query: 'zahnarzt' }]);
}

/* ---- Die Module: ihre echte Frage stellen, und woran man erkennt, dass sie das Ja/Nein bekommen hat ---- */
const MODULE = [
    {
        name: 'mailwatch', native: false, name_chain: 'mailwatch',
        async frage(app) {
            app.vm.runInContext("accessToken='tok'; localStorage.setItem('jv_mailwatch_seen','[]'); fetchEmailOverview = async function(){ return {emails:[{id:'x9', von:'Bank', betreff:'Wichtig'}]}; }", app.sb);
            (app.dokListener['click'] || []).forEach(f => f({}));
            await app.sb.jvMailWatch.check(); await pause(40);
        },
        bekam: (x, app) => von(x, 'mailwatch')
    },
    {
        name: 'Termin-Erinnerung', native: false, name_chain: 'termin-erinnern',
        async frage(app) { await app.ki('Ich muss Donnerstag um 13:15 auf der Arbeit sein', [{ type: 'chat' }]); await pause(60); },
        nein: true,
        bekam: (x, app) => von(x, 'termin-erinnern') || /dann erinnere ich dich nicht/.test(x.gesagt.join(' '))
    },
    {
        name: 'Routinen', native: false, name_chain: 'routinen',
        async frage(app) {
            const o = app.sb._routinenTest.load();
            o.log = ['2026-10-27', '2026-10-26', '2026-10-25', '2026-10-24'].map(d => ({ k: 'wetter', d, w: new Date(d + 'T12:00:00Z').getDay(), m: 9 * 60 }));
            app.sb.setPersistentData('jv_routinen', JSON.stringify(o));
            await app.vorspulen(6 * 60 * 1000); await app.vorspulen(60 * 1000);
        },
        bekam: (x, app) => von(x, 'routinen')
    },
    {
        name: 'Kündigung', native: false, name_chain: 'kuendigung',
        async frage(app) { await app.satz('Ich möchte meinen Vertrag kündigen'); await pause(40); },
        bekam: (x, app) => von(x, 'kuendigung')
    },
    {
        name: 'Orte', native: true, name_chain: 'orte',
        async frage(app) { await app.satz('Ortserinnerung an'); await app.vorspulen(2000); await pause(30); },
        bekam: (x, app) => von(x, 'orte')
    },
    {
        name: 'Spotify (Auto)', native: false, name_chain: 'spotify-auto',
        async frage(app) {
            app.vm.runInContext("localStorage.setItem('jv_spotify', JSON.stringify({access:'a', refresh:'r', exp: Date.now()+3600000})); jvAutoansicht.offen = function(){return true;}; ruf = async function(){ return {status:200, json:{is_playing:false}}; }", app.sb);
            (app.dokListener['jv-autoansicht'] || []).forEach(f => f({})); await pause(80);
        },
        bekam: (x, app) => von(x, 'spotify-auto')
    },
    {
        name: 'Fahr-WhatsApp', native: true, name_chain: 'fahr_whatsapp',
        async frage(app) {
            app.vm.runInContext("jvAutoansicht.offen = function(){return true;}", app.sb);
            app.sb.jvFahrWA.nachricht({ id: 'w1', name: 'Julia', text: 'Kommst du heute?', kann: true }); await pause(50);
        },
        bekam: (x, app) => von(x, 'fahr_whatsapp')
    },
    {
        name: 'Foto (Kontakt)', native: false, name_chain: 'photo',
        async frage(app) {
            app.vm.runInContext("askVision = async function(){ return JSON.stringify({name:'Max Muster', telefon:'0171123456'}); }", app.sb);
            await app.lassLaufen(async () => { await app.sb.processPhoto({ task: 'contact', question: '' }, 'data:image/png;base64,AAAA'); });
        },
        bekam: (x, app) => app.vm.runInContext('photoPending', app.sb) === null
    },
    {
        name: 'Behördenbrief', native: false, name_chain: 'behoerdenbrief',
        async frage(app) { await app.satz('Schreib einen Brief an meine Versicherung'); await pause(40); },
        bekam: (x, app) => von(x, 'behoerdenbrief')
    }
];

(async () => {
    for (const M of MODULE) {
        const tag = M.name;
        /* C  Einzelbetrieb */
        {
            const app = neu({ native: M.native }); await M.frage(app);
            check(tag + ' C: stellt seine Frage und meldet sich als jüngste an (' + M.name_chain + ')', aktuell(app) === M.name_chain, 'aktuell=' + aktuell(app));
            const x = await antwortJa(app, M.nein ? 'Nein' : 'Ja');
            check(tag + ' C: allein — ein ' + (M.nein ? 'Nein' : 'Ja') + ' geht wie bisher an das Modul', M.bekam(x, app), x.modul + ' | ' + x.gesagt.join(' ').slice(0, 120));
        }
        /* A  Löschfrage älter, Modul jünger */
        {
            const app = neu({ native: M.native }); await frageL(app); await M.frage(app);
            check(tag + ' A: das Modul ist die jüngste Frage', aktuell(app) === M.name_chain, 'aktuell=' + aktuell(app));
            const x = await antwortJa(app, M.nein ? 'Nein' : 'Ja');
            check(tag + ' A: Löschfrage → ' + tag + ' → ' + (M.nein ? 'Nein' : 'Ja') + ': der Termin wird NICHT angefasst', zahnarzt(app) && !von(x, 'loeschen_fragen'), x.modul + ' | ' + JSON.stringify(termine(app)));
            check(tag + ' A: … das Modul bekommt die Antwort', M.bekam(x, app), x.modul + ' | ' + x.gesagt.join(' ').slice(0, 120));
            const y = await antwortJa(app, 'Ja');
            check(tag + ' A: … ein weiteres Ja löscht danach auch nichts (die alte Löschfrage kommt nicht zurück)', zahnarzt(app) && !von(y, 'loeschen_fragen'), y.modul + ' | ' + JSON.stringify(termine(app)));
        }
        /* B  Modul älter, Löschfrage jünger */
        {
            const app = neu({ native: M.native }); await M.frage(app); await frageL(app);
            check(tag + ' B: die Löschfrage ist die jüngste Frage', aktuell(app) === 'loeschen_fragen', 'aktuell=' + aktuell(app));
            const x = await antwortJa(app, 'Ja');
            check(tag + ' B: ' + tag + ' → Löschfrage → Ja: nur die Löschfrage (Termin gelöscht)', !zahnarzt(app), JSON.stringify(termine(app)) + ' | ' + x.modul);
            check(tag + ' B: … das ältere Modul bekommt das Ja nicht', !M.bekam(x, app), x.modul + ' | ' + x.gesagt.join(' ').slice(0, 120));
            const y = await antwortJa(app, 'Ja');
            check(tag + ' B: … und kommt mit einem zweiten Ja nicht zurück', !M.bekam(y, app), y.modul + ' | ' + y.gesagt.join(' ').slice(0, 120));
        }
    }

    /* ---------- Nein landet beim richtigen Modul ---------- */
    {
        const M = MODULE.find(m => m.name === 'Foto (Kontakt)');
        const app = neu(); await frageL(app); await M.frage(app);
        const n = await antwortJa(app, 'Nein');
        check('Nein: Löschfrage → Foto-Kontakt → Nein: das Foto verwirft den Kontakt, der Termin bleibt', zahnarzt(app) && app.vm.runInContext('photoPending', app.sb) === null, n.modul + ' | ' + n.gesagt.join(' ').slice(0, 100));
    }
    {
        const M = MODULE.find(m => m.name === 'Routinen');
        const app = neu(); await frageL(app); await M.frage(app);
        const n = await antwortJa(app, 'Nein');
        check('Nein: Löschfrage → Routinen-Vorschlag → Nein: nur der Vorschlag wird abgelehnt, der Termin bleibt', zahnarzt(app) && von(n, 'routinen'), n.modul);
    }

    /* ---------- Auswahlfragen sperren ältere Ja/Nein-Fragen ---------- */
    {
        const app = neu(); await frageL(app);
        app.sb.photoAskWhatToDo(); await pause(20);
        check('Auswahl: „Was soll ich damit tun?“ (Foto) wird als jüngste Frage angemeldet', aktuell(app) === 'photo', 'aktuell=' + aktuell(app));
        const x = await antwortJa(app, 'Ja');
        check('Auswahl: Löschfrage → Foto-Auswahl → Ja: der Termin wird nicht gelöscht', zahnarzt(app) && !von(x, 'loeschen_fragen'), x.modul + ' | ' + JSON.stringify(termine(app)));
    }
    {
        const app = neu(); await frageL(app);
        await app.satz('Ich möchte meinen Vertrag kündigen'); await pause(40);
        const x = await antwortJa(app, 'Ja');
        check('Auswahl: Löschfrage → Kündigung („Bei welchem Anbieter?“) → Ja: der Termin bleibt', zahnarzt(app) && !von(x, 'loeschen_fragen'), x.modul);
    }

    /* ---------- Zwei der neuen Module untereinander ---------- */
    {
        const R = MODULE.find(m => m.name === 'Routinen'), F = MODULE.find(m => m.name === 'Foto (Kontakt)');
        const app = neu(); await R.frage(app); await F.frage(app);
        check('zwei Module: Routinen-Vorschlag → Foto-Kontakt: das Foto ist die jüngste Frage', aktuell(app) === 'photo', 'aktuell=' + aktuell(app));
        const x = await antwortJa(app, 'Ja');
        check('zwei Module: das Ja geht an den Foto-Kontakt, nicht an die Routine', F.bekam(x, app) && !von(x, 'routinen'), x.modul);
        const y = await antwortJa(app, 'Ja');
        check('zwei Module: die ältere Routinen-Frage kommt mit einem zweiten Ja nicht zurück', !von(y, 'routinen'), y.modul);
    }
    {
        const R = MODULE.find(m => m.name === 'Routinen'), F = MODULE.find(m => m.name === 'Foto (Kontakt)');
        const app = neu(); await F.frage(app); await R.frage(app);
        const x = await antwortJa(app, 'Ja');
        check('zwei Module: Foto-Kontakt → Routinen-Vorschlag → Ja: nur die Routine; der Kontakt bleibt unbeantwortet', von(x, 'routinen') && app.vm.runInContext('photoPending', app.sb) !== null, x.modul);
    }

    /* ---------- Information ohne Frage ersetzt nichts ---------- */
    {
        const F = MODULE.find(m => m.name === 'Foto (Kontakt)');
        const app = neu(); await F.frage(app);
        await app.satz('Wie spät ist es?'); await pause(30);
        const x = await antwortJa(app, 'Ja');
        check('Information: Foto-Frage → „Wie spät ist es?“ → Ja: die Foto-Frage gilt weiter', F.bekam(x, app), x.modul);
    }

    console.log('\nZweite Stufe: ' + ok + ' Prüfungen gut, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('ABBRUCH', e && e.stack || e); process.exit(2); });
