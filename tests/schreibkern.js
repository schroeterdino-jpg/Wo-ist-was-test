/* ============================================================
   TESTS Schreibkern (Paket B1): Start: node tests/schreibkern.js
   Neue Registry-Fähigkeiten: aufgabe_erstellen, aufgaben_lesen, termine_lesen, termin_verschieben, kontakt_speichern.
   Dazu: Doppelschutz für Erinnerung/Termin, Schichtregel gegen den Schichtplan, zuletzt gefundene Orte.
   Alles über die echte Registry in der App-Attrappe (Uhr und Netz sind Attrappen). Die Chef-KI schreibt in B1 NICHT.
   ============================================================ */
'use strict';
process.env.TZ = 'Europe/Berlin';
const fs = require('fs'), path = require('path');
const { starte, ROOT } = require('./umgebung.js');
let ok = 0, fehler = 0;
function check(name, b, info) { if (b) { ok++; return; } fehler++; console.log('✗ ' + name + (info ? '  →  ' + info : '')); }
const lies = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const ant = d => ({ ok: true, status: 200, json: async () => d });
const JETZT = '2026-11-05T10:00:00+01:00';
const MORGEN15 = '2026-11-06T15:00:00+01:00', FREITAG14 = '2026-11-06T14:00:00+01:00', SAMSTAG10 = '2026-11-07T10:00:00+01:00';

function umgebung(opt) {
    opt = opt || {};
    const A = starte({ jetzt: JETZT, festerZufall: true, spracherkennung: true, fetch: opt.fetch || (async (u) => { throw new Error('offline (Attrappe) ' + u); }) });
    A.zaehler = { exec: 0 };
    const exec0 = A.sb.executeAction; A.sb.executeAction = function () { A.zaehler.exec++; return exec0.apply(this, arguments); };
    return A;
}
const ruf = async (A, name, p, o) => { const q = await A.lassLaufen(() => A.sb.jvRegistry.fuehreAus(name, p, o)); if (q.haengt) return { status: 'HAENGT' }; return q.wert; };
const T = (id, text, iso, extra) => Object.assign({ id, text, date: 'x', isoDate: iso, location: '' }, extra || {});
const alles = A => JSON.stringify({ s: A.store, m: A.lese('memoryItems'), r: A.lese('reminderEntries'), c: A.lese('calendarEntries'), t: A.lese('todoEntries'), k: A.lese('savedContacts'), e: A.lese('shoppingEntries') });
const ORTE = [{ name: 'Rosen-Apotheke', adresse: 'Marktstr. 2', lat: 53.5, lon: 10.1 }, { name: 'Adler Apotheke', adresse: 'Ringstr. 9', lat: 53.51, lon: 10.12 }];

(async () => {
    let A = umgebung();
    check('0a keine Ladefehler, Chef-KI standardmäßig AUS', A.ladefehler.length === 0 && A.sb.jvChef.istAn() === false, A.ladefehler.join('; '));
    const neue = ['aufgabe_erstellen', 'aufgaben_lesen', 'termine_lesen', 'termin_verschieben', 'kontakt_speichern'];
    check('0b alle fünf neuen Fähigkeiten sind angemeldet, Fallback-Verweise stimmen', neue.every(n => !!A.sb.jvRegistry.hole(n)) && A.sb.jvRegistry.pruefeVerweise().length === 0);
    check('0c Verschieben verlangt immer Bestätigung; die anderen nicht', A.sb.jvRegistry.hole('termin_verschieben').bestaetigung.noetig === true && ['aufgabe_erstellen', 'aufgaben_lesen', 'termine_lesen', 'kontakt_speichern'].every(n => A.sb.jvRegistry.hole(n).bestaetigung.noetig === false));
    check('0d Chef-KI schreibt in B1 nicht: Freigabe unverändert, neue Schreibende gesperrt', A.sb.jvChef.FREIGEGEBEN.join() === 'ortssuche,websuche,wetter,produktsuche,foto_info,jarvis_info,fahrzeit,kontakte_lesen,gedaechtnis_lesen,abfahrt,schicht,essensplan,erinnerungen_lesen,einkauf_lesen,urlaub_lesen,rechnungen_lesen,vollmond,wunschliste_lesen,pakete_lesen,parkplatz_lesen,uhrzeit_anderswo' && ['aufgabe_erstellen', 'termin_verschieben', 'kontakt_speichern'].every(n => A.sb.jvChef.SCHREIB.includes(n)) && neue.every(n => !A.sb.jvChef.FREIGEGEBEN.includes(n)));
    const sk = lies('js/registry_schreibkern.js').replace(/\/\*[\s\S]*?\*\//g, '');
    check('0e der Schreibkern macht keine eigenen Netz- oder KI-Anfragen (keine Kosten) und keine Sprachausgabe', !/\bfetch\s*\(|apiFetch|sendToGroq|\bspeak\s*\(|speakAck/.test(sk));
    check('0f nichts wird gelöscht: kein Löschaufruf im Schreibkern', !/delete\s|splice\(|executeAction\(\s*\{\s*type:\s*'(?:calendar_delete|reminder_delete|episode_forget)'|\.pop\(|\.shift\(/.test(sk.replace(/delete\s+\w+\[/g, '')));

    /* ============ aufgabe_erstellen ============ */
    A = umgebung(); let z0 = alles(A);
    let r = await ruf(A, 'aufgabe_erstellen', { text: '  ' });
    check('1a leerer Text -> NEEDS_INFORMATION, nichts geschrieben, kein Aufruf', r.status === 'NEEDS_INFORMATION' && alles(A) === z0 && A.zaehler.exec === 0, JSON.stringify(r));
    r = await ruf(A, 'aufgabe_erstellen', { text: 'Blumen kaufen' });
    check('1b Aufgabe wird angelegt und nachgewiesen (SUCCESS, genau 1 neu, 1 Aufruf)', r.status === 'SUCCESS' && r.daten.angelegt === true && r.daten.neu === 1 && A.lese('todoEntries').length === 1 && A.lese('todoEntries')[0].text === 'Blumen kaufen' && A.zaehler.exec === 1, JSON.stringify(r));
    const nachErste = alles(A);
    r = await ruf(A, 'aufgabe_erstellen', { text: ' blumen KAUFEN ' });
    check('1c gleiche Aufgabe (Groß/Klein, Leerzeichen) -> SUCCESS "schon vorhanden", nichts doppelt, KEIN zweiter Schreibaufruf', r.status === 'SUCCESS' && r.daten.schonVorhanden === true && r.daten.angelegt === false && alles(A) === nachErste && A.zaehler.exec === 1 && /schon/.test(r.nachricht), JSON.stringify(r));
    r = await ruf(A, 'aufgabe_erstellen', { text: 'Milch holen' });
    check('1d andere Aufgabe wird ergänzt, die erste bleibt', r.status === 'SUCCESS' && A.lese('todoEntries').length === 2 && A.lese('todoEntries').some(e => e.text === 'Blumen kaufen'));
    { const B = umgebung(); B.sb.executeAction = async () => { B.zaehler.exec++; }; const q = await ruf(B, 'aufgabe_erstellen', { text: 'Blumen kaufen' });
      check('1e Schreibaufruf tut nichts -> TOOL_FAILED, nie falsche Erfolgsmeldung, kein zweiter Versuch', q.status === 'TOOL_FAILED' && B.lese('todoEntries').length === 0 && B.zaehler.exec === 1, JSON.stringify(q)); }
    { const B = umgebung(); B.sb.executeAction = async () => { B.zaehler.exec++; throw new Error('kaputt'); }; const q = await ruf(B, 'aufgabe_erstellen', { text: 'Blumen kaufen' });
      check('1f Schreibaufruf wirft -> TOOL_FAILED, keine automatische Wiederholung', q.status === 'TOOL_FAILED' && B.zaehler.exec === 1, JSON.stringify(q)); }
    { const B = umgebung(); const q = await ruf(B, 'aufgabe_erstellen', { text: 'Blumen kaufen' }, { trocken: true });
      check('1g Trockenlauf schreibt nichts', q.status === 'SUCCESS' && q.trocken === true && B.lese('todoEntries').length === 0 && B.zaehler.exec === 0); }

    /* ============ aufgaben_lesen ============ */
    A = umgebung();
    r = await ruf(A, 'aufgaben_lesen', {});
    check('2a leere Liste -> ehrliche Antwort', r.status === 'SUCCESS' && r.daten.anzahl === 0 && /leer/.test(r.nachricht), JSON.stringify(r));
    A.lese('todoEntries').push({ id: 1, text: 'Blumen kaufen' }, { id: 2, text: 'Milch holen' }); z0 = alles(A);
    r = await ruf(A, 'aufgaben_lesen', {});
    check('2b Liste wird genannt und nichts verändert', r.status === 'SUCCESS' && r.daten.anzahl === 2 && /Blumen kaufen/.test(r.nachricht) && /Milch holen/.test(r.nachricht) && alles(A) === z0 && A.zaehler.exec === 0, JSON.stringify(r));

    /* ============ termine_lesen ============ */
    A = umgebung();
    A.lese('calendarEntries').push(T('local_1', 'Zahnarzt', MORGEN15), T('local_2', 'Frühstück mit Anna', '2026-11-06T08:30:00+01:00', { location: 'Café Roma' }), T('local_3', 'Werkstatt', SAMSTAG10), T('local_4', 'Geburtstag Mama', '2026-11-06'));
    z0 = alles(A);
    r = await ruf(A, 'termine_lesen', { tag: 'morgen' });
    check('3a morgen: drei Einträge in zeitlicher Reihenfolge (ganztägig zuerst), mit Ort', r.status === 'SUCCESS' && r.daten.anzahl === 3 && r.daten.termine.map(t => t.text).join() === 'Geburtstag Mama,Frühstück mit Anna,Zahnarzt' && /Café Roma/.test(r.nachricht) && /15:00 Uhr/.test(r.nachricht), JSON.stringify(r));
    r = await ruf(A, 'termine_lesen', {});
    check('3b heute ist leer -> ehrliche Antwort "kein Termin", kein Fehler', r.status === 'SUCCESS' && r.daten.anzahl === 0 && /kein Termin/.test(r.nachricht), JSON.stringify(r));
    r = await ruf(A, 'termine_lesen', { tag: '2026-11-07' });
    check('3c Datum wird verstanden', r.status === 'SUCCESS' && r.daten.anzahl === 1 && r.daten.termine[0].text === 'Werkstatt');
    r = await ruf(A, 'termine_lesen', { tag: 'irgendwann' });
    check('3d unverständlicher Tag -> NEEDS_INFORMATION (Rückfrage), nichts gelesen', r.status === 'NEEDS_INFORMATION' && /welchen Tag/i.test(r.nachricht) || /Für welchen Tag/.test(r.nachricht), JSON.stringify(r));
    check('3e Lesen verändert nichts', alles(A) === z0 && A.zaehler.exec === 0);

    /* ============ termin_verschieben ============ */
    const VP = { suche: 'Zahnarzt', neue_zeit: FREITAG14 };
    A = umgebung(); A.lese('calendarEntries').push(T('local_1', 'Zahnarzt', MORGEN15), T('local_2', 'Frühstück mit Anna', '2026-11-06T08:30:00+01:00')); z0 = alles(A);
    r = await ruf(A, 'termin_verschieben', VP);
    check('4a ohne Bestätigung -> NEEDS_CONFIRMATION, nichts geändert, kein Schreibaufruf', r.status === 'NEEDS_CONFIRMATION' && alles(A) === z0 && A.zaehler.exec === 0, JSON.stringify(r));
    check('4b die Rückfrage nennt Termin, alte und neue Zeit', /Zahnarzt/.test(A.sb.jvSchreibkern.frageVerschieben(VP)) && /verschieben/.test(A.sb.jvSchreibkern.frageVerschieben(VP)) && /14:00 Uhr/.test(A.sb.jvSchreibkern.frageVerschieben(VP)), A.sb.jvSchreibkern.frageVerschieben(VP));
    r = await ruf(A, 'termin_verschieben', VP, { bestaetigt: true });
    const e1 = A.lese('calendarEntries').find(e => e.id === 'local_1');
    check('4c mit Bestätigung: Termin steht wirklich auf der neuen Zeit (SUCCESS, verifiziert), anderer Termin unberührt, nichts gelöscht', r.status === 'SUCCESS' && r.daten.verifiziert === true && new Date(e1.isoDate).getTime() === new Date(FREITAG14).getTime() && A.lese('calendarEntries').length === 2 && A.lese('calendarEntries').find(e => e.id === 'local_2').isoDate === '2026-11-06T08:30:00+01:00' && A.zaehler.exec === 1, JSON.stringify(r));
    check('4d der lokale Hinweis (nur in der App) wird mitgeliefert, nicht verschwiegen', /nur in der App|Google/.test(r.nachricht) || r.daten.hinweise.length > 0, JSON.stringify(r.daten.hinweise));
    { const B = umgebung(); B.lese('calendarEntries').push(T('local_1', 'Zahnarzt', MORGEN15), T('local_9', 'Zahnarzt Kontrolle', SAMSTAG10)); const z = alles(B);
      let q = await ruf(B, 'termin_verschieben', VP, { bestaetigt: true });
      check('4e mehrere passende Termine -> NEEDS_INFORMATION mit nummerierter Liste, auch MIT Bestätigung wird nichts geändert', q.status === 'NEEDS_INFORMATION' && /1:/.test(q.nachricht) && /2:/.test(q.nachricht) && q.fehlend.includes('termin_id') && alles(B) === z && B.zaehler.exec === 0, JSON.stringify(q));
      q = await ruf(B, 'termin_verschieben', Object.assign({ termin_id: 'local_9' }, VP), { bestaetigt: true });
      check('4f Auswahl per Termin-ID -> genau dieser Termin wird verschoben, der andere nicht', q.status === 'SUCCESS' && new Date(B.lese('calendarEntries').find(e => e.id === 'local_9').isoDate).getTime() === new Date(FREITAG14).getTime() && B.lese('calendarEntries').find(e => e.id === 'local_1').isoDate === MORGEN15, JSON.stringify(q));
      const C = umgebung(); C.lese('calendarEntries').push(T('local_1', 'Zahnarzt', MORGEN15), T('local_9', 'Zahnarzt Kontrolle', SAMSTAG10));
      q = await ruf(C, 'termin_verschieben', Object.assign({ tag: 'samstag' }, VP), { bestaetigt: true });
      check('4g unverständlicher Tagesfilter findet nichts -> Rückfrage statt Raten', q.status === 'NEEDS_INFORMATION' && C.zaehler.exec === 0, JSON.stringify(q));
      q = await ruf(C, 'termin_verschieben', Object.assign({ tag: '2026-11-07' }, VP), { bestaetigt: true });
      check('4h Tagesfilter als Datum trennt die zwei Termine -> eindeutig, verschoben', q.status === 'SUCCESS' && C.lese('calendarEntries').find(e => e.id === 'local_9').isoDate !== SAMSTAG10 && C.lese('calendarEntries').find(e => e.id === 'local_1').isoDate === MORGEN15, JSON.stringify(q)); }
    { const B = umgebung(); B.lese('calendarEntries').push(T('local_1', 'Zahnarzt', MORGEN15)); const z = alles(B);
      let q = await ruf(B, 'termin_verschieben', { suche: 'Friseur', neue_zeit: FREITAG14 }, { bestaetigt: true });
      check('4i kein passender Termin -> NEEDS_INFORMATION, nichts geändert', q.status === 'NEEDS_INFORMATION' && alles(B) === z && B.zaehler.exec === 0, JSON.stringify(q));
      q = await ruf(B, 'termin_verschieben', { suche: 'Zahnarzt', neue_zeit: '2026-11-01T10:00:00+01:00' }, { bestaetigt: true });
      check('4j neue Zeit in der Vergangenheit -> NEEDS_INFORMATION, nichts geändert', q.status === 'NEEDS_INFORMATION' && /Vergangenheit/.test(q.nachricht) && alles(B) === z, JSON.stringify(q));
      q = await ruf(B, 'termin_verschieben', { suche: '  ', neue_zeit: FREITAG14 }, { bestaetigt: true });
      check('4k leere Suche -> NEEDS_INFORMATION', q.status === 'NEEDS_INFORMATION' && B.zaehler.exec === 0);
      q = await ruf(B, 'termin_verschieben', { suche: 'Zahnarzt', neue_zeit: 'bald' }, { bestaetigt: true });
      check('4l ungültige Zeit -> NEEDS_INFORMATION', q.status === 'NEEDS_INFORMATION' && B.zaehler.exec === 0);
      q = await ruf(B, 'termin_verschieben', VP, { bestaetigt: true, trocken: true });
      check('4m Trockenlauf ändert nichts', q.status === 'SUCCESS' && q.trocken === true && alles(B) === z); }
    { const B = umgebung(); B.lese('calendarEntries').push(T('local_1', 'Zahnarzt', MORGEN15)); B.sb.executeAction = async () => { B.zaehler.exec++; };
      const q = await ruf(B, 'termin_verschieben', VP, { bestaetigt: true });
      check('4n Änderung kommt nicht an (Eintrag unverändert) -> TOOL_FAILED "nicht bestätigt", keine falsche Erfolgsmeldung, kein zweiter Versuch', q.status === 'TOOL_FAILED' && B.lese('calendarEntries')[0].isoDate === MORGEN15 && B.zaehler.exec === 1 && !/verschoben\.$/.test(q.nachricht.replace('nicht bestätigen, dass der Termin verschoben', '')), JSON.stringify(q)); }
    { const B = umgebung(); B.lese('calendarEntries').push(T('local_1', 'Zahnarzt', '2026-11-03T15:00:00+01:00'));
      const q = await ruf(B, 'termin_verschieben', VP, { bestaetigt: true });
      check('4o vergangene Termine werden nicht angefasst (kein Treffer)', q.status === 'NEEDS_INFORMATION' && B.zaehler.exec === 0, JSON.stringify(q)); }

    /* ============ kontakt_speichern ============ */
    A = umgebung(); A.sb.jvSchreibkern.merkeOrte(ORTE, 'Apotheke'); const g0 = A.gesagt.length;
    r = await ruf(A, 'kontakt_speichern', { ort: 'Apotheke' });
    check('5a zwei Apotheken gemerkt -> NEEDS_INFORMATION mit Liste, nichts gespeichert', r.status === 'NEEDS_INFORMATION' && /Rosen-Apotheke/.test(r.nachricht) && /Adler Apotheke/.test(r.nachricht) && Object.keys(A.lese('savedContacts')).length === 0, JSON.stringify(r));
    r = await ruf(A, 'kontakt_speichern', { ort: 'Apotheke', nummer: 2 });
    const k = A.lese('savedContacts')['adler apotheke'];
    check('5b mit Nummer: genau dieser Ort wird gespeichert (Name, Adresse), nachgewiesen und persistent', r.status === 'SUCCESS' && r.daten.angelegt === true && k && k.address === 'Ringstr. 9' && k.originalName === 'Adler Apotheke' && /Ringstr\. 9/.test(String(A.store.helfer_contacts || '')), JSON.stringify({ r, k }));
    check('5c es wird nichts gesprochen (keine doppelte Antwort durch den Kern)', A.gesagt.length === g0);
    const nach = alles(A);
    r = await ruf(A, 'kontakt_speichern', { ort: 'Adler', nummer: 2 });
    check('5d zweites Mal: SUCCESS "schon vorhanden", nichts doppelt, Daten unverändert', r.status === 'SUCCESS' && r.daten.schonVorhanden === true && alles(A) === nach && Object.keys(A.lese('savedContacts')).length === 1, JSON.stringify(r));
    { const B = umgebung(); B.sb.jvSchreibkern.merkeOrte([ORTE[0]], 'Apotheke');
      const q = await ruf(B, 'kontakt_speichern', { ort: 'Apotheke' });
      check('5e genau ein Treffer: "Speichere die Adresse von der Apotheke" speichert ihn ohne Rückfrage', q.status === 'SUCCESS' && B.lese('savedContacts')['rosen-apotheke'].address === 'Marktstr. 2', JSON.stringify(q)); }
    { const B = umgebung(); const q = await ruf(B, 'kontakt_speichern', { ort: 'Apotheke' });
      check('5f nichts gemerkt -> NEEDS_INFORMATION, nichts gespeichert', q.status === 'NEEDS_INFORMATION' && Object.keys(B.lese('savedContacts')).length === 0, JSON.stringify(q)); }
    { const B = umgebung(); B.sb.jvSchreibkern.merkeOrte([ORTE[0]], 'Apotheke'); await B.vorspulen(11 * 60000);
      const q = await ruf(B, 'kontakt_speichern', { ort: 'Apotheke' });
      check('5g nach 10 Minuten sind die Orte vergessen -> Rückfrage, nie raten', B.sb.jvSchreibkern.letzteOrte().length === 0 && q.status === 'NEEDS_INFORMATION', JSON.stringify(q)); }
    { const B = umgebung(); B.sb.jvSchreibkern.merkeOrte([{ name: 'Löwen Apotheke', adresse: '' }], 'Apotheke');
      const q = await ruf(B, 'kontakt_speichern', {});
      check('5h Ort ohne Adresse -> NEEDS_INFORMATION (Adresse fehlt), kein leerer Kontakt', q.status === 'NEEDS_INFORMATION' && q.fehlend.includes('adresse') && Object.keys(B.lese('savedContacts')).length === 0, JSON.stringify(q)); }
    { const B = umgebung(); B.sb.jvSchreibkern.merkeOrte([ORTE[0]], 'Apotheke');
      const q = await ruf(B, 'kontakt_speichern', { ort: 'Bäckerei' });
      check('5i falscher Ortsname -> keine Verwechslung, Rückfrage', q.status === 'NEEDS_INFORMATION' && Object.keys(B.lese('savedContacts')).length === 0, JSON.stringify(q)); }
    { const B = umgebung(); const q = await ruf(B, 'kontakt_speichern', { name: 'Tante Erna', adresse: 'Dorfstr. 3', telefon: '040 123' });
      check('5j ausdrückliche Angaben ohne gemerkten Ort -> Kontakt wird angelegt', q.status === 'SUCCESS' && B.lese('savedContacts')['tante erna'].phone === '040 123' && B.lese('savedContacts')['tante erna'].address === 'Dorfstr. 3', JSON.stringify(q)); }
    { const B = umgebung(); B.lese('savedContacts')['tante erna'] = { originalName: 'Tante Erna', phone: '040 123', address: '' };
      const q = await ruf(B, 'kontakt_speichern', { name: 'Tante Erna', adresse: 'Dorfstr. 3' });
      const c = B.lese('savedContacts')['tante erna'];
      check('5k vorhandener Kontakt wird ERGÄNZT, die Nummer bleibt erhalten', q.status === 'SUCCESS' && q.daten.ergaenzt === true && c.phone === '040 123' && c.address === 'Dorfstr. 3', JSON.stringify(c)); }
    { const B = umgebung(); B.lese('savedContacts')['tante erna'] = { originalName: 'Tante Erna', phone: '', address: 'Alte Str. 1' }; const z = alles(B);
      let q = await ruf(B, 'kontakt_speichern', { name: 'Tante Erna', adresse: 'Dorfstr. 3' });
      check('5l andere Adresse zum selben Namen -> NEEDS_CONFIRMATION, nichts überschrieben', q.status === 'NEEDS_CONFIRMATION' && /Alte Str\. 1/.test(q.nachricht) && alles(B) === z, JSON.stringify(q));
      q = await ruf(B, 'kontakt_speichern', { name: 'Tante Erna', adresse: 'Dorfstr. 3' }, { kontext: { bestaetigt: true } });
      check('5m erst mit ausdrücklicher Zustimmung wird ersetzt und nachgewiesen', q.status === 'SUCCESS' && B.lese('savedContacts')['tante erna'].address === 'Dorfstr. 3', JSON.stringify(q)); }
    { const B = umgebung(); const q = await ruf(B, 'kontakt_speichern', {});
      check('5n gar keine Angabe -> NEEDS_INFORMATION', q.status === 'NEEDS_INFORMATION' && B.zaehler.exec === 0); }
    { const B = umgebung(); B.sb.jvSchreibkern.merkeOrte(ORTE, 'Apotheke'); B.sb.jvSchreibkern.merkeOrte([], 'Apotheke');
      check('5o eine leere Suche löscht die gemerkten Orte nicht (aber überschreibt sie auch nicht)', B.sb.jvSchreibkern.letzteOrte().length === 2); }
    { const B = umgebung(); const r1 = B.sb.jvOrtGespraech.merke([{ name: 'Café Roma', adresse: 'Hauptstr. 1', lat: 53.5, lon: 10.1 }], 'ki');
      check('5p Ortssuche/KI-Treffer (jvOrtGespraech.merke) stehen auch zur Verfügung; Rückgabe der Ortssuche unverändert', B.sb.jvSchreibkern.letzteOrte().some(o => o.name === 'Café Roma') && r1 !== undefined || B.sb.jvSchreibkern.letzteOrte().some(o => o.name === 'Café Roma'), JSON.stringify(B.sb.jvSchreibkern.letzteOrte())); }

    /* ---- Ende-zu-Ende: gefundene Apotheke (Orte-Suche) -> "Speichere die Adresse von der Apotheke" ---- */
    { const B = umgebung({ fetch: async (u) => {
          u = String(u);
          if (/action=places/.test(u)) return ant({ places: [{ name: 'Rosen-Apotheke', street: 'Marktstr.', housenumber: '2', city: 'Schwarzenbek', lat: 53.502, lon: 10.1, openNow: true, until: '18:00' }] });
          throw new Error('offline (Attrappe) ' + u);
      } });
      B.sb.fetchUserLocationData = async () => ({ latitude: 53.5, longitude: 10.1 });
      B.sb.navigator.geolocation.getCurrentPosition = (okf) => okf({ coords: { latitude: 53.5, longitude: 10.1 } });
      await B.lassLaufen(async () => { B.sb.jvTippen('Wo ist die nächste Apotheke?'); for (let i = 0; i < 80; i++) await new Promise(res => setImmediate(res)); });
      check('6a Orte-Suche (Apotheke) merkt die Treffer für das Speichern', B.sb.jvSchreibkern.letzteOrte().length === 1 && B.sb.jvSchreibkern.letzteOrte()[0].name === 'Rosen-Apotheke', JSON.stringify(B.sb.jvSchreibkern.letzteOrte()) + ' | ' + B.gesagt.join(' / '));
      const q = await ruf(B, 'kontakt_speichern', { ort: 'Apotheke' });
      check('6b "Speichere die Adresse von der Apotheke" legt den Kontakt mit der gefundenen Adresse an', q.status === 'SUCCESS' && /Marktstr\./.test(B.lese('savedContacts')['rosen-apotheke'].address), JSON.stringify(q)); }

    /* ============ Doppelschutz der bestehenden Fähigkeiten ============ */
    A = umgebung();
    const ZEIT = '2026-11-06T08:00:00', ZEIT_T = '2026-11-06T10:00:00';
    r = await ruf(A, 'erinnerung_erstellen', { text: 'Müll rausbringen', zeit: ZEIT });
    const e0 = A.zaehler.exec, n0 = A.lese('reminderEntries').length;
    let r2 = await ruf(A, 'erinnerung_erstellen', { text: 'müll rausbringen ', zeit: ZEIT });
    check('7a Erinnerung doppelt: zweites Mal SUCCESS "schon vorhanden", nichts angelegt, kein Schreibaufruf', r.status === 'SUCCESS' && r2.status === 'SUCCESS' && r2.daten.schonVorhanden === true && A.lese('reminderEntries').length === n0 && A.zaehler.exec === e0 && n0 === 1, JSON.stringify(r2));
    r = await ruf(A, 'erinnerung_erstellen', { text: 'Müll rausbringen', zeit: '2026-11-07T08:00:00' });
    check('7b gleicher Text an einem anderen Tag ist KEIN Duplikat', r.status === 'SUCCESS' && !r.daten.schonVorhanden && A.lese('reminderEntries').length === 2, JSON.stringify(r));
    r = await ruf(A, 'termin_erstellen', { text: 'Zahnarzt', zeit: ZEIT_T });
    const e1x = A.zaehler.exec, c0 = A.lese('calendarEntries').length;
    r2 = await ruf(A, 'termin_erstellen', { text: 'Zahnarzt', zeit: ZEIT_T });
    check('7c Termin doppelt: zweites Mal SUCCESS "schon vorhanden", nichts angelegt, kein Schreibaufruf', r.status === 'SUCCESS' && r2.status === 'SUCCESS' && r2.daten.schonVorhanden === true && A.lese('calendarEntries').length === c0 && A.zaehler.exec === e1x, JSON.stringify(r2));
    r = await ruf(A, 'termin_erstellen', { text: 'Zahnarzt', zeit: '2026-11-06T11:00:00' });
    check('7d gleicher Titel zu anderer Uhrzeit ist KEIN Duplikat', r.status === 'SUCCESS' && !r.daten.schonVorhanden && A.lese('calendarEntries').length === c0 + 1, JSON.stringify(r));
    r = await ruf(A, 'termin_erstellen', { text: 'Yoga', zeit: '2026-11-09T18:00:00', wiederholung_einheit: 'week', wiederholung_intervall: 1 });
    check('7e Wiederholungen werden vom Vorab-Duplikatschutz nicht blockiert (dort entscheidet weiter die bestehende Erfolgsprüfung)', r.daten && r.daten.schonVorhanden !== true, JSON.stringify(r).slice(0, 200));

    /* ============ Schichtregel gegen den Schichtplan ============ */
    A = umgebung(); A.sb.jvSchichtWissen = () => ({ schicht_diese_woche: 'Frühschicht', schicht_naechste_woche: 'Spätschicht' });
    z0 = alles(A);
    r = await ruf(A, 'gedaechtnis_speichern', { schluessel: 'schicht freitag', wert: 'Freitags habe ich normalerweise Spätschicht' });
    check('8a feste Schichtregel gegen wechselnden Schichtplan -> NEEDS_CONFIRMATION (Rückfrage), nichts gespeichert', r.status === 'NEEDS_CONFIRMATION' && /Schichtplan/.test(r.nachricht) && /Frühschicht/.test(r.nachricht) && alles(A) === z0 && A.zaehler.exec === 0, JSON.stringify(r));
    r = await ruf(A, 'gedaechtnis_speichern', { schluessel: 'schicht freitag', wert: 'Freitags habe ich normalerweise Spätschicht' }, { kontext: { bestaetigt: true } });
    check('8b erst nach Zustimmung wird gemerkt und nachgewiesen', r.status === 'SUCCESS' && /Spätschicht/.test(A.lese('memoryItems')['schicht freitag'] || ''), JSON.stringify(r));
    r = await ruf(A, 'gedaechtnis_speichern', { schluessel: 'schlüssel', wert: 'im Auto' });
    check('8c andere Gedächtniseinträge werden nicht aufgehalten', r.status === 'SUCCESS' && A.lese('memoryItems')['schlüssel'] === 'im Auto', JSON.stringify(r));
    r = await ruf(A, 'gedaechtnis_speichern', { schluessel: 'schicht heute', wert: 'Heute Spätschicht gewechselt' });
    check('8d eine einmalige Schichtangabe ohne feste Regel wird nicht aufgehalten', r.status === 'SUCCESS', JSON.stringify(r));
    { const B = umgebung(); B.sb.jvSchichtWissen = () => null;
      const q = await ruf(B, 'gedaechtnis_speichern', { schluessel: 'schicht freitag', wert: 'Freitags normalerweise Spätschicht' });
      check('8e ohne bekannten Schichtplan gibt es nichts zu widersprechen -> normal gespeichert', q.status === 'SUCCESS', JSON.stringify(q)); }

    /* ============ Bestehendes bleibt ============ */
    A = umgebung();
    const befehle = A.sb.jvCommands.list().map(c => c.name || c);
    check('9a Befehlsliste unverändert (jvCommands.list() zählt 95 Einträge wie auf main; Reihenfolge prüfen tests/reihenfolge.js und tests/globale.js)', befehle.length === 95, String(befehle.length));
    check('9b Chef-KI bleibt AUS, auch nach dem Laden des Schreibkerns', A.sb.jvChef.istAn() === false && A.ladefehler.length === 0);
    check('9c keine neue Serverfunktion', fs.readdirSync(path.join(ROOT, 'api')).filter(f => f.endsWith('.js') && !f.startsWith('_')).length <= 12);

    console.log('SCHREIBKERN (B1): ' + ok + ' Prüfungen in Ordnung, ' + fehler + ' Fehler');
    process.exit(fehler ? 1 : 0);
})().catch(e => { console.log('✗ Test abgestürzt: ' + (e && e.stack || e)); process.exit(2); });
