/* ============================================================
   TESTS für B2b-2: Terminänderungen des alten KI-Wegs (calendar_update) nur nach klarem "Ja".
   Start: node tests/chef_b2b2.js
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const { starte } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const JETZT = '2026-10-28T10:00:00+01:00';
const ALT = '2026-10-29T08:00:00.000Z';   // morgen 09:00 Berlin
const NEU = '2026-10-29T16:00:00+01:00';
const ctxNeu = () => ({ counter: 0, cards: [], notes: [], panel: null });

function app(extra) {
    const A = starte(Object.assign({ jetzt: JETZT, festerZufall: true, fetch: async u => { throw new Error('offline ' + u); } }, extra || {}));
    A.lese('calendarEntries').push({ id: 'local_1', text: 'Zahnarzt', date: 'x', isoDate: ALT, location: '' });
    return A;
}
const zeit = A => (A.lese('calendarEntries').find(e => e.id === 'local_1') || {}).isoDate;
async function ki(A, a, text) {
    let fehl = null; const g0 = A.gesagt.length;
    try { await A.lassLaufen(() => A.sb.executeAction(a, text || 'Verschieb den Zahnarzt', ctxNeu())); } catch (e) { fehl = e; }
    return { fehl, frage: fehl && (fehl.userMessage || fehl.message) };
}
const UPD = { type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: NEU };
async function sag(A, t) { const r = await A.satz(t); return r; }

(async () => {
    {   // 1 Ohne Bestätigung ändert sich nichts, Frage nennt Termin, alte und neue Zeit
        const A = app(); const r = await ki(A, UPD);
        check('1 Frage kommt, Termin unverändert', !!r.frage && zeit(A) === ALT, String(r.frage));
        check('1 Frage nennt Termin, alte und neue Zeit', /Zahnarzt/.test(r.frage) && /9 Uhr/.test(r.frage) && /16 Uhr/.test(r.frage), String(r.frage));
        check('1 eine Frage ist offen', A.sb.jvLoeschFrage.offen());
        const j = await sag(A, 'Ja');
        check('1 nach Ja: Termin wirklich verschoben', new Date(zeit(A)).getTime() === new Date(NEU).getTime(), zeit(A));
        check('1 Erfolg wird gesagt', /Zahnarzt/.test(j.gesagt.join(' ')) || /geändert|Erledigt/.test(j.gesagt.join(' ')), j.gesagt.join(' | '));
        check('1 danach keine Frage mehr offen, nur ein Termin', !A.sb.jvLoeschFrage.offen() && A.lese('calendarEntries').filter(e => /zahnarzt/i.test(e.text)).length === 1);
    }
    {   // 2 Nein
        const A = app(); await ki(A, UPD); const j = await sag(A, 'Nein');
        check('2 Nein ändert nichts', zeit(A) === ALT && !A.sb.jvLoeschFrage.offen() && /nichts geändert/.test(j.gesagt.join(' ')), zeit(A) + ' ' + j.gesagt.join('|'));
    }
    {   // 3 unklar: einmal nachfragen, dann abbrechen; "Ja, aber lieber später" ist kein Ja
        const A = app(); await ki(A, UPD);
        const u1 = await sag(A, 'Ja, aber lieber später');
        check('3 "Ja, aber ..." ändert nichts (Nachfrage oder neuer Satz)', zeit(A) === ALT);
        const B = app(); await ki(B, UPD);
        const a = await sag(B, 'Hm vielleicht'); 
        check('3 unklar: einmal nachgefragt, Frage bleibt offen, nichts geändert', zeit(B) === ALT && B.sb.jvLoeschFrage.offen() && /nicht eindeutig/.test(a.gesagt.join(' ')), a.gesagt.join('|'));
        const b = await sag(B, 'Weiß nicht');
        check('3 zweimal unklar: abgebrochen, nichts geändert', zeit(B) === ALT && !B.sb.jvLoeschFrage.offen(), b.gesagt.join('|'));
    }
    {   // 4 abgelaufen
        const A = app(); await ki(A, UPD); await A.vorspulen(121000);
        check('4 Frage nach 2 Minuten verfallen', !A.sb.jvLoeschFrage.offen() && zeit(A) === ALT);
        const j = await sag(A, 'Ja');
        check('4 spätes Ja ändert nichts und sagt es ehrlich', zeit(A) === ALT && /abgelaufen/.test(j.gesagt.join(' ')), j.gesagt.join('|'));
    }
    {   // 5 Termin zwischenzeitlich geändert / gelöscht
        const A = app(); await ki(A, UPD);
        A.lese('calendarEntries').find(e => e.id === 'local_1').isoDate = '2026-10-30T08:00:00.000Z';
        const j = await sag(A, 'Ja');
        check('5 zwischenzeitlich geänderter Termin: nichts angefasst', zeit(A) === '2026-10-30T08:00:00.000Z' && /inzwischen geändert/.test(j.gesagt.join(' ')), j.gesagt.join('|'));
        const B = app(); await ki(B, UPD); B.lese('calendarEntries').length = 0;
        const k = await sag(B, 'Ja');
        check('5 zwischenzeitlich gelöschter Termin: nichts neu angelegt', B.lese('calendarEntries').length === 0 && /inzwischen geändert/.test(k.gesagt.join(' ')), k.gesagt.join('|'));
    }
    {   // 6 ein Ja bestätigt nie mehrere Aktionen
        const A = app(); A.lese('calendarEntries').push({ id: 'local_2', text: 'Friseur', date: 'x', isoDate: '2026-10-30T08:00:00.000Z', location: '' });
        await ki(A, UPD);
        const r2 = await ki(A, { type: 'calendar_update', calendar_query: 'friseur', calendar_time: '2026-10-30T15:00:00+01:00' });
        check('6 zweite Änderung in derselben Runde wird abgelehnt (einzeln)', /einzeln/.test(String(r2.frage)), String(r2.frage));
        await sag(A, 'Ja');
        check('6 Ja ändert nur den ersten Termin', new Date(zeit(A)).getTime() === new Date(NEU).getTime() && A.lese('calendarEntries').find(e => e.id === 'local_2').isoDate === '2026-10-30T08:00:00.000Z');
        const B = app(); await ki(B, { type: 'calendar_delete', calendar_query: 'zahnarzt' }); 
        const r3 = await ki(B, UPD);
        check('6 Änderung neben offener Löschfrage wird nicht vermischt', /einzeln/.test(String(r3.frage)) && B.lese('calendarEntries').length === 1, String(r3.frage));
    }
    {   // 7 relative Angaben: ab der ALTEN Zeit gerechnet, nicht der KI-Rechnung vertrauen
        const A = app(); const r = await ki(A, { type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: '2026-10-29T20:00:00+01:00' }, 'Verschieb den Zahnarzt eine Stunde später');
        check('7 "eine Stunde später" → 10 Uhr, nicht die falsche KI-Zeit', /10 Uhr/.test(r.frage) && !/20 Uhr/.test(r.frage), String(r.frage));
        await sag(A, 'Ja');
        check('7 nach Ja genau 10:00', new Date(zeit(A)).getTime() === new Date('2026-10-29T10:00:00+01:00').getTime(), zeit(A));
    }
    {   // 8 Zeit gleich: nichts zu ändern → keine Frage, nichts passiert
        const A = app(); const r = await ki(A, { type: 'calendar_update', calendar_query: 'zahnarzt', calendar_time: ALT });
        check('8 gleiche Zeit: keine sinnlose Frage', !A.sb.jvLoeschFrage.offen() && zeit(A) === ALT, String(r.frage));
    }
    {   // 9 kein Treffer: wie bisher, keine Frage
        const A = app(); const r = await ki(A, { type: 'calendar_update', calendar_query: 'steuerberater', calendar_time: NEU });
        check('9 kein passender Termin: keine Änderungsfrage, nichts geändert', !A.sb.jvLoeschFrage.offen() && zeit(A) === ALT);
    }
    {   // 10 Chef-KI hat selbst bestätigt: _bestaetigt umgeht die zweite Frage
        const A = app(); const r = await ki(A, Object.assign({ _bestaetigt: true }, UPD));
        check('10 bereits bestätigte Aktion (Chef-KI) fragt nicht doppelt', !r.fehl && new Date(zeit(A)).getTime() === new Date(NEU).getTime(), String(r.frage));
    }
    {   // 11 Löschfrage bleibt wie bisher
        const A = app(); const r = await ki(A, { type: 'calendar_delete', calendar_query: 'zahnarzt' });
        check('11 Löschfrage unverändert', /wirklich löschen/.test(String(r.frage)) && A.lese('calendarEntries').length === 1);
        await sag(A, 'Ja');
        check('11 Ja löscht', A.lese('calendarEntries').length === 0);
    }
    {   // 12 ein neuer Satz beendet die Frage
        const A = app(); await ki(A, UPD); await sag(A, 'Wie spät ist es');
        check('12 anderer Satz beendet die Frage, nichts geändert', !A.sb.jvLoeschFrage.offen() && zeit(A) === ALT);
        const j = await sag(A, 'Ja');
        check('12 danach bestätigt ein Ja nichts mehr', zeit(A) === ALT);
    }
    console.log('CHEF B2b-2: ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})();
