/* ============================================================
   „LETZTE FRAGE GEWINNT“ (Start: node tests/pending_reihenfolge.js)
   Jedes Modul hält seine offene Ja/Nein-Frage selbst. Früher bekam ein kurzes „Ja“ / „Nein“ der Modul, der in der Befehlskette ZUERST dran ist
   (kleinste Zahl), nicht das Modul, das ZULETZT gefragt hat. Jetzt meldet jede Stelle, die wirklich eine Frage stellt, das an js/fragen_reihenfolge.js
   (window.jvFrage.neu(name)). Die Befehlskette lässt ein nacktes Ja/Nein nur an die jüngste Frage durch; ältere Fragen sind überholt und kommen nicht zurück.
   Geprüft mit den echten Modulen (Tagesmeldung, Löschfrage, Weckerfrage, Geburtstags-Frage, Mail-Papierkorb, Terminfinder, Ausflug, KI-Chat), festen Attrappen, ohne Netz.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');

let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('FEHLER: ' + name + (info ? '  → ' + info : '')); }
const antwort = b => ({ ok: true, status: 200, json: async () => b, text: async () => JSON.stringify(b), headers: { get: () => null } });
const MORGEN = '2026-10-29T14:00:00+01:00';
const pause = ms => new Promise(r => setTimeout(r, ms));

function neu(kiReply) {
    const calls = [];
    const app = starte({
        festerZufall: true,
        fetch: async (u, o) => {
            calls.push(String(u) + ' ' + String((o && o.method) || 'GET'));
            if (/\/api\/groq/.test(u)) {
                const b = String((o && o.body) || '');
                if (b.indexOf('\\"melden\\":true oder false') >= 0) return antwort({ choices: [{ message: { content: JSON.stringify(neu.meldung || { melden: true, thema: 'ausflug', text: 'Das Wetter ist gut. Ein Ausflug wäre schön.', aktion: 'ausflug', grund: 'Test' }) } }] });
                return antwort({ choices: [{ message: { content: JSON.stringify({ reply: kiReply || 'Das ist erledigt. Soll ich noch etwas für dich tun?', actions: [] }) } }] });
            }
            if (/gmail/.test(u)) {
                if (/messages\?maxResults/.test(u)) return antwort({ messages: [{ id: 'm1' }] });
                if (/\/trash/.test(u)) return antwort({ id: 'm1' });
                return antwort({ id: 'm1', threadId: 't1', payload: { headers: [{ name: 'From', value: 'Amazon <a@amazon.de>' }, { name: 'Subject', value: 'Bestellung' }] } });
            }
            throw new Error('offline (Attrappe): ' + u);
        }
    });
    app.vm.runInContext("accessToken='tok'; googleTokenExpiresAt=Date.now()+3600000", app.sb);
    app.calls = calls;
    return app;
}
neu.meldung = null;

/* ---- Fragen stellen (jede mit dem echten Modul) ---- */
async function frageD(app, meldung) {   // Tagesmeldung mit Ausflugs-Frage (oder die gegebene KI-Meldung)
    neu.meldung = meldung || null;
    await app.lassLaufen(() => app.sb.jvDirigent.ansage('dirig|2026-10-28|m', true));
    neu.meldung = null;
}
async function frageL(app) {            // „Soll ich den Termin wirklich löschen?“
    await app.sb.addGoogleCalendarEvent('Zahnarzt', MORGEN, '');
    await app.ki('Lösche den Zahnarzt', [{ type: 'calendar_delete', calendar_query: 'zahnarzt' }]);
}
async function frageW(app) { app.sb.jvPlan.weckerFrage('2026-10-28'); await pause(5); }
async function frageZ(app) { app.sb.jvZuvor.gebAnsage('geb|2026-10-29|Julia Geburtstag'); await pause(5); }
async function frageM(app) { await app.satz('Leg die Mail von Amazon in den Papierkorb'); await pause(60); await app.lassLaufen(async () => { }); }
async function frageT(app) { await app.satz('Wann habe ich Zeit, meine Mutter zu besuchen?'); await pause(5); }   // Auswahlfrage eins/zwei/drei
async function frageA(app) { await app.satz('Was können wir heute unternehmen?'); await pause(5); }              // Auswahlfrage „Wer kommt mit?“
async function frageK(app) {            // freie KI-Frage im Chat
    await app.lassLaufen(async () => { if (!app.sb.handleLocalCommand('Erzähl mir etwas Neues')) await app.sb.sendToGroqSmart('Erzähl mir etwas Neues'); await pause(80); });
}
async function antwortJa(app, t) { const x = await app.satz(t || 'Ja'); await pause(60); await app.lassLaufen(async () => { }); return x; }

const termine = app => JSON.parse(app.vm.runInContext('JSON.stringify(calendarEntries.map(e => e.text))', app.sb));
const zahnarzt = app => termine(app).some(t => /zahnarzt/i.test(t));
const trash = app => app.calls.some(c => /\/trash|batchModify/.test(c));
const aktuell = app => (app.sb.jvFrage && app.sb.jvFrage.aktuell) ? app.sb.jvFrage.aktuell() : undefined;
const von = (x, name) => new RegExp('(^|\\+)' + name + '(\\+|$)').test(x.modul || '');

(async () => {
    /* ---------- 1–3 Tagesmeldung und Löschfrage ---------- */
    {
        const app = neu(); await frageD(app); await frageL(app);
        const j = await antwortJa(app);
        check('1 Tagesmeldung → Löschfrage → Ja: nur die Löschfrage (Termin gelöscht)', !zahnarzt(app), JSON.stringify(termine(app)));
        check('1 … die Tagesmeldung bekommt das Ja nicht', !von(j, 'dirigent') && !von(j, 'ausflug'), j.modul + ' | ' + j.gesagt.join(' '));
        const j2 = await antwortJa(app);
        check('28 … und kommt später nicht wieder hoch (zweites Ja startet keinen Ausflug)', !von(j2, 'dirigent') && !von(j2, 'ausflug'), j2.modul);
    }
    {
        const app = neu(); await frageD(app); await frageL(app);
        const n = await antwortJa(app, 'Nein');
        check('2 Tagesmeldung → Löschfrage → Nein: Löschfrage abgelehnt, Termin bleibt', zahnarzt(app) && !app.sb.jvLoeschFrage.offen(), JSON.stringify(termine(app)));
        check('2 … die Tagesmeldung bekommt das Nein nicht', !von(n, 'dirigent'), n.modul + ' | ' + n.gesagt.join(' '));
        const j = await antwortJa(app);
        check('2 … danach startet ein Ja die alte Tagesmeldung nicht mehr', !von(j, 'dirigent') && !von(j, 'ausflug'), j.modul);
    }
    {
        const app = neu(); await frageL(app); await frageD(app);
        const j = await antwortJa(app);
        check('3 Löschfrage → Tagesmeldung → Ja: nur die Tagesmeldung (Ausflug startet)', von(j, 'ausflug') && /Wer kommt mit/.test(j.gesagt.join(' ')), j.modul + ' | ' + j.gesagt.join(' '));
        check('3 … der Termin wird NICHT gelöscht', zahnarzt(app), JSON.stringify(termine(app)));
    }

    /* ---------- 4–5 Wecker und Tagesmeldung ---------- */
    {
        const app = neu(); await frageW(app); await frageD(app);
        const j = await antwortJa(app);
        check('4 Weckerfrage → Tagesmeldung → Ja: nur die Tagesmeldung', von(j, 'ausflug') && !von(j, 'plan_wecker'), j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const app = neu(); await frageD(app); await frageW(app);
        const j = await antwortJa(app);
        check('5 Tagesmeldung → Weckerfrage → Ja: nur der Wecker', von(j, 'plan_wecker') && !von(j, 'dirigent') && !von(j, 'ausflug'), j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const app = neu(); await frageD(app); await frageW(app);
        const n = await antwortJa(app, 'Nein');
        check('6 Tagesmeldung → Weckerfrage → Nein: nur der Wecker wird abgelehnt', von(n, 'plan_wecker') && !von(n, 'dirigent'), n.modul + ' | ' + n.gesagt.join(' '));
        const j = await antwortJa(app);
        check('6 … die ältere Tagesmeldung kommt danach nicht wieder', !von(j, 'dirigent') && !von(j, 'ausflug'), j.modul);
    }

    /* ---------- 6–7 Zuvorkommend und Mail ---------- */
    {
        const app = neu(); await frageZ(app); await frageM(app);
        check('Mailfrage steht (Voraussetzung)', !!app.sb.jvMailAktionen._zustand().pending);
        const j = await antwortJa(app);
        check('7 Zuvorkommend → Mailfrage → Ja: die Mailfrage (Mail im Papierkorb)', trash(app) && von(j, 'mailaktionen') && !von(j, 'zuvorkommend'), j.modul + ' | ' + app.calls.filter(c => /gmail/.test(c)).join(' ; '));
    }
    {
        const app = neu(); await frageM(app); await frageZ(app);
        const j = await antwortJa(app);
        check('8 Mailfrage → Zuvorkommend → Ja: Zuvorkommend, Mail bleibt', von(j, 'zuvorkommend') && !trash(app), j.modul + ' | ' + j.gesagt.join(' '));
    }

    /* ---------- 8 Zwei löschende Fragen nacheinander ---------- */
    {
        const app = neu(); await frageM(app); await frageL(app);
        const j = await antwortJa(app);
        check('9 Mailfrage → Löschfrage → Ja: nur die jüngste (Termin weg, Mail bleibt)', !zahnarzt(app) && !trash(app), JSON.stringify(termine(app)) + ' trash=' + trash(app) + ' ' + j.modul);
    }
    {
        const app = neu(); await frageL(app); await frageM(app);
        const j = await antwortJa(app);
        check('9 Löschfrage → Mailfrage → Ja: nur die jüngste (Mail im Papierkorb, Termin bleibt)', trash(app) && zahnarzt(app), JSON.stringify(termine(app)) + ' trash=' + trash(app) + ' ' + j.modul);
    }

    /* ---------- 9 Information ersetzt keine Frage ---------- */
    {
        const app = neu(); await frageD(app);
        const info = await app.satz('Was steht morgen an?');
        check('10 Information ohne Frage (Voraussetzung: wurde beantwortet)', /was_steht_an/.test(info.modul || '') && !/\?/.test(info.gesagt.join(' ')), info.modul + ' | ' + info.gesagt.join(' '));
        const j = await antwortJa(app);
        check('10 Information nach Frage → Ja: die alte Frage gilt weiter (Ausflug)', von(j, 'ausflug'), j.modul + ' | ' + j.gesagt.join(' '));
    }

    /* ---------- 10 Auswahlfrage nach Ja/Nein-Frage ---------- */
    {
        const app = neu(); await frageD(app); await frageT(app);
        const j = await antwortJa(app);
        check('11 Tagesmeldung → Terminfinder-Auswahl → Ja: keine falsche alte Aktion', !von(j, 'dirigent') && !von(j, 'ausflug'), j.modul + ' | ' + j.gesagt.join(' '));
        const eins = await antwortJa(app, 'eins'); await pause(30);
        check('11 … die Auswahl selbst funktioniert weiter („eins“ trägt ein)', von(eins, 'terminfinder'), eins.modul + ' | ' + eins.gesagt.join(' '));
    }
    {
        const app = neu(); await frageL(app); await frageA(app);
        const j = await antwortJa(app);
        check('11 Löschfrage → „Wer kommt mit?“ → Ja: der Termin wird nicht gelöscht', zahnarzt(app), JSON.stringify(termine(app)) + ' ' + j.modul);
    }

    /* ---------- 11 KI-Frage nach altem lokalen Pending ---------- */
    {
        const app = neu(); await frageD(app); await frageK(app);
        const j = await antwortJa(app);
        check('12 Tagesmeldung → KI-Frage im Chat → Ja: nicht von der Tagesmeldung genommen', !von(j, 'dirigent') && !von(j, 'ausflug'), j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const app = neu(); await frageL(app); await frageK(app);
        const j = await antwortJa(app);
        check('12 Löschfrage → KI-Frage → Ja: der Termin wird nicht gelöscht', zahnarzt(app) && !von(j, 'loeschen_fragen'), JSON.stringify(termine(app)) + ' ' + j.modul);
    }
    {
        // Eine Löschfrage, die über den KI-Weg kommt, bleibt die jüngste Frage (die KI-Antwort darf sie nicht überholen)
        const app = neu(); await frageD(app);
        await app.sb.addGoogleCalendarEvent('Zahnarzt', MORGEN, '');
        await app.lassLaufen(async () => { try { await app.sb.executeAction({ type: 'calendar_delete', calendar_query: 'zahnarzt' }, 'Lösche den Zahnarzt', { counter: 0, cards: [], notes: [], panel: null }); } catch (e) { } });
        const j = await antwortJa(app);
        check('13 Löschfrage kommt über den KI-Weg: Ja gilt ihr', !zahnarzt(app), JSON.stringify(termine(app)) + ' ' + j.modul);
    }

    /* ---------- 12–15 Ja/Nein ohne Frage, zweites Ja/Nein ---------- */
    {
        const app = neu();
        const j = await antwortJa(app), n = await antwortJa(app, 'Nein');
        check('14 Ja ohne offene Frage: keine lokale Aktion', j.modul === null && j.gesagt.length === 0 && !j.lokal, j.modul + ' | ' + j.gesagt.join(' '));
        check('15 Nein ohne offene Frage: keine lokale Aktion', n.modul === null && n.gesagt.length === 0 && !n.lokal, n.modul + ' | ' + n.gesagt.join(' '));
    }
    {
        const app = neu(); await frageW(app);
        const j1 = await antwortJa(app), j2 = await antwortJa(app);
        check('16 Ja beantwortet die Weckerfrage', von(j1, 'plan_wecker'), j1.modul);
        check('16 zweites Ja: keine Wiederholung', j2.modul === null && j2.gesagt.length === 0, j2.modul + ' | ' + j2.gesagt.join(' '));
    }
    {
        const app = neu(); await frageW(app);
        const n1 = await antwortJa(app, 'Nein'), n2 = await antwortJa(app, 'Nein');
        check('17 Nein lehnt die Weckerfrage ab', von(n1, 'plan_wecker'), n1.modul);
        check('17 zweites Nein: keine Wiederholung', n2.modul === null && n2.gesagt.length === 0, n2.modul + ' | ' + n2.gesagt.join(' '));
    }

    /* ---------- 16 Ablauf des jüngsten Pendings ---------- */
    {
        const app = neu(); await frageD(app); await app.vorspulen(60000); await frageL(app);
        await app.vorspulen(3 * 60000);   // Löschfrage gilt nur 2 Minuten, die Tagesmeldung noch 10
        check('18 Löschfrage ist abgelaufen (Voraussetzung)', !app.sb.jvLoeschFrage.offen());
        const j = await antwortJa(app);
        check('18 abgelaufene jüngste Frage: die ältere Tagesmeldung wird NICHT wieder aktuell', !von(j, 'dirigent') && !von(j, 'ausflug') && zahnarzt(app), j.modul + ' | ' + j.gesagt.join(' '));
    }

    /* ---------- 17 Reload ---------- */
    {
        const app = neu(); await frageD(app);
        const frisch = neu();
        check('19 Reload: keine jüngste Frage, keine Pendings', aktuell(frisch) === null, String(aktuell(frisch)));
        const j = await antwortJa(frisch);
        check('19 Reload: Ja macht nichts', j.modul === null && j.gesagt.length === 0, j.modul);
        check('19 Die Tagesmeldung hat sich als jüngste Frage gemeldet', aktuell(app) === 'dirigent', String(aktuell(app)));
    }

    /* ---------- 18–19 Tagesmeldung ohne Aktionsfrage ---------- */
    {
        const app = neu(); await frageW(app);
        await frageD(app, { melden: true, thema: 'wetter', text: 'Heute Abend gibt es Regen, nimm die Jacke mit.', aktion: 'keine', grund: 'x' });
        check('20 Tagesmeldung ohne Aktionsfrage meldet keine Frage an', aktuell(app) === 'plan_wecker', String(aktuell(app)));
        const j = await antwortJa(app);
        check('20 … ein Ja gilt weiter der Weckerfrage', von(j, 'plan_wecker'), j.modul + ' | ' + j.gesagt.join(' '));
    }
    {
        const app = neu(); await frageW(app);
        await frageD(app, { melden: true, thema: 'besuch', text: 'Morgen ist Reformationstag, du hast frei und das Wetter ist trocken. Vielleicht wäre ein Besuch bei deiner Mutter eine schöne Idee. Soll ich?', aktion: 'besuch:Mutter', grund: 'x' });
        check('21 Reformationstag-Beispiel: keine Frage, kein Pending, keine Anmeldung', aktuell(app) === 'plan_wecker', String(aktuell(app)));
        const j = await antwortJa(app);
        check('21 … Ja gilt der Weckerfrage, nicht einer Besuchssuche', von(j, 'plan_wecker') && !von(j, 'terminfinder'), j.modul + ' | ' + j.gesagt.join(' '));
    }

    /* ---------- 20 Einzel-Fragen unverändert ---------- */
    {
        let app = neu(); await frageD(app); let j = await antwortJa(app);
        check('22 einzeln: Tagesmeldung + Ja', von(j, 'ausflug'), j.modul);
        app = neu(); await frageL(app); j = await antwortJa(app);
        check('22 einzeln: Löschfrage + Ja löscht', !zahnarzt(app), JSON.stringify(termine(app)));
        app = neu(); await frageL(app); j = await antwortJa(app, 'Nein');
        check('22 einzeln: Löschfrage + Nein behält', zahnarzt(app), JSON.stringify(termine(app)));
        app = neu(); await frageW(app); j = await antwortJa(app);
        check('22 einzeln: Weckerfrage + Ja', von(j, 'plan_wecker'), j.modul);
        app = neu(); await frageZ(app); j = await antwortJa(app);
        check('22 einzeln: Geburtstags-Frage + Ja', von(j, 'zuvorkommend'), j.modul);
        app = neu(); await frageM(app); j = await antwortJa(app);
        check('22 einzeln: Mailfrage + Ja (Papierkorb)', trash(app), j.modul);
        app = neu(); await frageM(app); j = await antwortJa(app, 'Nein');
        check('22 einzeln: Mailfrage + Nein (kein Papierkorb)', !trash(app) && von(j, 'mailaktionen'), j.modul);
        app = neu(); await frageA(app); j = await antwortJa(app, 'die Kinder');
        check('22 einzeln: „Wer kommt mit?“ + Antwort', von(j, 'ausflug'), j.modul + ' | ' + j.gesagt.join(' '));
    }

    console.log('\nLetzte Frage gewinnt: ' + ok + ' Prüfungen gut, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.error('Testlauf abgestürzt:', e); process.exit(2); });
