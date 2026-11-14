/* ============================================================
   REGISTRY-SCHREIBKERN (Paket B1): neue Fähigkeiten für die Registry (window.jvRegistry) plus gemeinsame Sicherheitsregeln.
     aufgabe_erstellen   Aufgabe auf die Aufgabenliste (kein Duplikat)
     aufgaben_lesen      Aufgabenliste vorlesen (nur lesend)
     termine_lesen       Termine eines Tages (nur lesend)
     termin_verschieben  Termin verschieben: nur nach Bestätigung, bei mehreren Treffern wird nachgefragt
     kontakt_speichern   Kontakt/Adresse speichern, auch aus dem zuletzt gefundenen Ort ("Speichere die Adresse von der Apotheke")
   NICHT PRODUKTIV: Die Chef-KI führt in B1 keine dieser Fähigkeiten echt aus (chef.js: FREIGEGEBEN ist unverändert, die Schreibenden stehen in SCHREIB).
   Nichts in der App ruft sie auf, nur die Tests. Es gibt keinen neuen Sprachbefehl und keine Änderung am bisherigen KI-Weg (assistant.js, actions.js).

   Regeln für alle Schreib-Fähigkeiten:
   - Vor dem Schreiben: Angaben vollständig? (sonst NEEDS_INFORMATION mit gezielter Rückfrage)
   - Kein Duplikat: Gibt es den Eintrag schon, wird NICHTS angelegt; das Ergebnis sagt es ehrlich (daten.schonVorhanden).
   - Mehrere passende Einträge -> Rückfrage mit nummerierter Liste, nie raten.
   - Riskantes (Verschieben, anderer Adresse überschreiben, Schichtregel gegen den Schichtplan) -> NEEDS_CONFIRMATION. Löschen gibt es hier nicht.
   - Nach dem Schreiben: Wirkung prüfen (Eintrag steht wirklich in der Liste); sonst TOOL_FAILED. Keine automatische Wiederholung.
   Bestätigung: Termin verschieben nutzt die feste Registry-Bestätigung (opts.bestaetigt). Die übrigen Rückfragen kommen aus der Vorprüfung und
   werden mit kontext.bestaetigt === true freigegeben. Die Chef-KI setzt beides in B1 nie.

   Wiederverwendet (keine zweite Implementierung): executeAction (todo, calendar_update), Registry-Kern, sicherheit.js, schichtauskunft.js (jvSchichtWissen).
   Einzige eigene Schreibstelle: Kontakt (savedContacts/helfer_contacts, gleiche Form wie saveContact() in lists.js). saveContact() selbst wird NICHT benutzt,
   weil es über Eingabefelder arbeitet und selbst spricht (das gäbe eine doppelte Antwort).

   Zuletzt gefundene Orte: window.jvSchreibkern.merkeOrte(liste, art) (10 Minuten, nur Arbeitsspeicher). Gefüllt von nearbymore.js (Apotheke usw.) und
   von jvOrtGespraech.merke (Ortssuche/KI). Ohne diese Treffer fragt kontakt_speichern nach, es rät nie.
   ============================================================ */
(function () {
    'use strict';
    var R = window.jvRegistry;
    if (!R || R.namen().indexOf('aufgabe_erstellen') >= 0) return;

    var BERLIN = 'Europe/Berlin', ORTE_MS = 10 * 60000;

    /* ---------------- Hilfen ---------------- */
    function norm(s) {
        return String(s == null ? '' : s).toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/\s+/g, ' ').trim();
    }
    function jetzt() { return Date.now(); }
    function tagVon(d) { return d.toLocaleDateString('sv-SE', { timeZone: BERLIN }); }
    function uhrVon(d) { return d.toLocaleTimeString('sv-SE', { timeZone: BERLIN, hour: '2-digit', minute: '2-digit' }); }
    function listeTermine() { try { return typeof calendarEntries !== 'undefined' && Array.isArray(calendarEntries) ? calendarEntries : null; } catch (e) { return null; } }
    function listeAufgaben() { try { return typeof todoEntries !== 'undefined' && Array.isArray(todoEntries) ? todoEntries : null; } catch (e) { return null; } }
    function kontakte() { try { return typeof savedContacts !== 'undefined' && savedContacts && typeof savedContacts === 'object' ? savedContacts : null; } catch (e) { return null; } }
    function ctxNeu(kontext) {
        var c = kontext && kontext.ctx;
        if (c && Array.isArray(c.cards) && Array.isArray(c.notes)) return c;
        return { counter: 0, cards: [], notes: [], panel: null };
    }
    function satzDesNutzers(kontext, params, feld) { return String((kontext && kontext.text) || params[feld] || ''); }
    function bestaetigt(kontext) { return !!kontext && kontext.bestaetigt === true; }
    function fehler(m) { var e = new Error(m); e.userMessage = m; return e; }
    function sicherheit(aktion) {
        try {
            if (!window.jvSicher || typeof window.jvSicher.pruefe !== 'function') return null;
            var art = window.jvSicher.pruefe(aktion);
            if (art === 'unvollstaendig') return { status: 'NEEDS_INFORMATION', nachricht: window.jvSicher.texte.unvollstaendig };
            if (art) return { status: 'CAPABILITY_MISSING', nachricht: window.jvSicher.texte.fehlt };
        } catch (e) { }
        return null;
    }
    function warte(ms) { return new Promise(function (res) { setTimeout(res, ms); }); }
    /* Wartet höchstens maxMs, bis bedingung() wahr ist (Google lädt die Terminliste erst nach dem Ändern neu). */
    async function warteBis(bedingung, maxMs) {
        var t = 0;
        if (bedingung()) return true;
        while (t < maxMs) { await warte(250); t += 250; if (bedingung()) return true; }
        return false;
    }
    function uhrzeitText(d) { return uhrVon(d).replace(/^0/, '') + ' Uhr'; }
    function tagText(d) {
        var heute = tagVon(new Date()), t = tagVon(d);
        var morgen = tagVon(new Date(Date.now() + 86400000)), uebermorgen = tagVon(new Date(Date.now() + 2 * 86400000));
        if (t === heute) return 'heute';
        if (t === morgen) return 'morgen';
        if (t === uebermorgen) return 'übermorgen';
        return d.toLocaleDateString('de-DE', { timeZone: BERLIN, weekday: 'long', day: 'numeric', month: 'long' });
    }
    function terminZeitText(e) {   // "morgen um 15 Uhr" / "Freitag, 7. November, ganztägig"
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate))) return tagText(new Date(e.isoDate + 'T12:00:00')) + ', ganztägig';
        var d = new Date(e.isoDate);
        return isNaN(d.getTime()) ? 'zu unbekannter Zeit' : tagText(d) + ' um ' + uhrzeitText(d);
    }
    function zeitPasst(eintragZeit, gewuenscht) {
        var b = new Date(gewuenscht);
        if (isNaN(b.getTime())) return false;
        if (/^\d{4}-\d{2}-\d{2}$/.test(String(eintragZeit))) return String(eintragZeit) === tagVon(b);
        var a = new Date(eintragZeit);
        return !isNaN(a.getTime()) && Math.abs(a.getTime() - b.getTime()) < 60000;
    }
    function tagVonEintrag(e) {
        var z = String(e && e.isoDate || '');
        if (/^\d{4}-\d{2}-\d{2}$/.test(z)) return z;
        var d = new Date(z);
        return isNaN(d.getTime()) ? '' : tagVon(d);
    }
    function nummerierte(liste, fn) { return liste.slice(0, 5).map(function (x, i) { return (i + 1) + ': ' + fn(x); }).join('. '); }

    /* ---------------- Zuletzt gefundene Orte ---------------- */
    var orte = { at: 0, art: '', liste: [] };
    function merkeOrte(liste, art) {
        var l = [];
        (Array.isArray(liste) ? liste : []).slice(0, 10).forEach(function (o) {
            if (!o || typeof o !== 'object') return;
            var name = String(o.name != null ? o.name : (o.title != null ? o.title : '')).trim();
            if (!name) return;
            var adresse = String(o.adresse != null ? o.adresse : (o.street != null ? o.street : '')).trim();
            var e = { name: name.slice(0, 120), adresse: adresse.slice(0, 200) };
            var la = Number(o.lat), lo = Number(o.lon);
            if (o.lat != null && o.lon != null && isFinite(la) && isFinite(lo)) { e.lat = la; e.lon = lo; }
            l.push(e);
        });
        if (!l.length) return false;   // eine leere Suche löscht den bisherigen Stand nicht
        orte = { at: jetzt(), art: String(art || '').slice(0, 40), liste: l };
        return true;
    }
    function letzteOrte() { return jetzt() - orte.at <= ORTE_MS ? orte.liste.map(function (o) { return Object.assign({}, o); }) : []; }
    /* Verbindung zur Ortssuche/KI: jvOrtGespraech.merke ruft nach dem bisherigen Verhalten zusätzlich merkeOrte (der Rückgabewert bleibt unverändert). */
    try {
        var og = window.jvOrtGespraech;
        if (og && typeof og.merke === 'function' && !og.merke._schreibkern) {
            var orig = og.merke;
            og.merke = function (liste, quelle) {
                var r = orig.apply(this, arguments);
                try { merkeOrte(liste, quelle); } catch (e) { }
                return r;
            };
            og.merke._schreibkern = true;
        }
    } catch (e) { }

    /* ============ 1. Aufgabe erstellen ============ */
    function aufgabeAktion(p) { return { type: 'todo', todo_text: String(p.text).trim() }; }
    R.registriere({
        name: 'aufgabe_erstellen',
        beschreibung: 'Setzt eine Aufgabe auf die Aufgabenliste. Gibt es dieselbe Aufgabe schon, wird nichts doppelt angelegt.',
        pflicht: [{ name: 'text', typ: 'text', beschreibung: 'Was zu tun ist, zum Beispiel "Blumen kaufen".' }],
        optional: [],
        rueckgabe: { beschreibung: 'Anzahl vorher/nachher, ob neu angelegt oder schon vorhanden, Hinweise.', felder: ['vorher', 'nachher', 'neu', 'passend', 'schonVorhanden', 'angelegt', 'hinweise', 'nichtsGetan', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Kein Aufgabentext angegeben.' },
            { status: 'TOOL_FAILED', wann: 'Nach dem Anlegen steht die Aufgabe nicht in der Liste, oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Aktionsausführung oder die Aufgabenliste ist nicht geladen.' }
        ],
        fallbacks: ['erinnerung_erstellen'],
        bestaetigung: { noetig: false, grund: 'Eine Aufgabe auf der Liste ist harmlos und lässt sich wieder entfernen.' },
        pruefeErfolg: function (d) { return !!d && (d.schonVorhanden === true || d.passend >= 1) && (!d.nichtsGetan || d.nichtsGetan.length === 0); },
        verbindung: { datei: 'js/actions.js', funktion: 'executeAction', aktion: 'todo' },
        verfuegbar: function () { return typeof executeAction === 'function' && !!listeAufgaben(); },
        vorpruefung: function (p) {
            if (!String(p.text == null ? '' : p.text).trim()) return { status: 'NEEDS_INFORMATION', nachricht: 'Was soll ich auf die Aufgabenliste setzen?', fehlend: ['text'] };
            return sicherheit(aufgabeAktion(p));
        },
        ausfuehren: async function (p, kontext) {
            var a = aufgabeAktion(p), ctx = ctxNeu(kontext), SYM_N = Symbol.for('jv.nichtsGetan');
            var vorher = listeAufgaben().slice(), gleich = norm(a.todo_text);
            var schon = vorher.filter(function (e) { return e && norm(e.text) === gleich; });
            if (schon.length) {   // Duplikat: nichts schreiben
                return { vorher: vorher.length, nachher: vorher.length, neu: 0, passend: 0, schonVorhanden: true, angelegt: false, hinweise: [], nichtsGetan: [],
                         nachricht: 'Die Aufgabe „' + a.todo_text + '“ steht schon auf deiner Liste, ich habe nichts doppelt angelegt.' };
            }
            var nichtsVorher = (ctx[SYM_N] || []).length;
            await executeAction(a, satzDesNutzers(kontext, p, 'text'), ctx);
            var nachher = listeAufgaben() || [];
            var neu = nachher.filter(function (e) { return vorher.indexOf(e) < 0; });
            var passend = neu.filter(function (e) { return e && norm(e.text) === gleich; });
            var nichts = (ctx[SYM_N] || []).slice(nichtsVorher);
            return { vorher: vorher.length, nachher: nachher.length, neu: neu.length, passend: passend.length, schonVorhanden: false, angelegt: passend.length >= 1, hinweise: ctx.notes.slice(), nichtsGetan: nichts,
                     nachricht: nichts[0] || (passend.length >= 1 ? 'Ich habe „' + a.todo_text + '“ auf deine Aufgabenliste gesetzt.' : 'Die Aufgabe wurde nicht gespeichert.') };
        }
    });

    /* ============ 2. Aufgaben lesen ============ */
    R.registriere({
        name: 'aufgaben_lesen',
        beschreibung: 'Liest die Aufgabenliste vor (nur lesend, ändert nichts).',
        pflicht: [],
        optional: [],
        rueckgabe: { beschreibung: 'Anzahl und die Texte der Aufgaben.', felder: ['anzahl', 'aufgaben', 'nachricht'] },
        fehler: [
            { status: 'CAPABILITY_MISSING', wann: 'Die Aufgabenliste ist nicht geladen.' },
            { status: 'TOOL_FAILED', wann: 'Ein technischer Fehler trat auf.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: 'Nur lesend.' },
        pruefeErfolg: function (d) { return !!d && Array.isArray(d.aufgaben) && d.anzahl === d.aufgaben.length; },
        verbindung: { datei: 'js/lists.js', funktion: 'todoEntries', aktion: 'lesen' },
        verfuegbar: function () { return !!listeAufgaben(); },
        ausfuehren: async function () {
            var l = (listeAufgaben() || []).map(function (e) { return String(e && e.text || '').trim(); }).filter(Boolean);
            var nachricht = !l.length ? 'Deine Aufgabenliste ist leer.'
                : 'Auf deiner Aufgabenliste ' + (l.length === 1 ? 'steht eine Aufgabe: ' : 'stehen ' + l.length + ' Aufgaben: ') + l.slice(0, 8).join(', ') + (l.length > 8 ? ' und ' + (l.length - 8) + ' weitere' : '') + '.';
            return { anzahl: l.length, aufgaben: l, nachricht: nachricht };
        }
    });

    /* ============ 3. Termine lesen ============ */
    function tagAusParam(t) {   // 'heute' | 'morgen' | 'uebermorgen' | 'YYYY-MM-DD' -> 'YYYY-MM-DD' oder ''
        var s = norm(t || 'heute');
        if (s === 'heute') return tagVon(new Date());
        if (s === 'morgen') return tagVon(new Date(Date.now() + 86400000));
        if (s === 'uebermorgen') return tagVon(new Date(Date.now() + 2 * 86400000));
        if (/^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T12:00:00').getTime())) return s;
        return '';
    }
    function zeitraumAusParam(z) {   // 'diese_woche' | 'naechste_woche' | 'naechste_7_tage' -> { von, bis, name } (YYYY-MM-DD) oder null
        var s = norm(z || '').replace(/[\s-]+/g, '_');
        if (s === 'nächste_woche') s = 'naechste_woche';
        if (s !== 'diese_woche' && s !== 'naechste_woche' && s !== 'naechste_7_tage') return null;
        var jetzt = new Date(), wt = new Date(jetzt.toLocaleDateString('sv-SE', { timeZone: BERLIN }) + 'T12:00:00'), tag = (wt.getDay() + 6) % 7;   // 0 = Montag
        var plus = function (n) { return tagVon(new Date(wt.getTime() + n * 86400000)); };
        if (s === 'diese_woche') return { von: plus(0), bis: plus(6 - tag), name: 'diese Woche' };
        if (s === 'naechste_woche') return { von: plus(7 - tag), bis: plus(13 - tag), name: 'nächste Woche' };
        return { von: plus(0), bis: plus(6), name: 'die nächsten sieben Tage' };
    }
    function wochentagKurz(tag) { return new Date(tag + 'T12:00:00').toLocaleDateString('de-DE', { timeZone: BERLIN, weekday: 'long' }); }
    R.registriere({
        name: 'termine_lesen',
        beschreibung: 'Nennt die Termine eines Tages oder einer Woche aus dem Kalender der App (nur lesend, ändert nichts).',
        pflicht: [],
        optional: [{ name: 'tag', typ: 'text', beschreibung: 'heute (Standard), morgen, uebermorgen oder ein Datum wie 2026-11-06.' }, { name: 'zeitraum', typ: 'text', beschreibung: 'Für mehrere Tage statt tag: diese_woche (heute bis Sonntag), naechste_woche (Montag bis Sonntag) oder naechste_7_tage.' }],
        rueckgabe: { beschreibung: 'Tag, Anzahl und die Termine (Titel, Zeit, Ort) in zeitlicher Reihenfolge.', felder: ['tag', 'anzahl', 'termine', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Der Tag ist nicht verständlich.' },
            { status: 'CAPABILITY_MISSING', wann: 'Der Kalender ist nicht geladen.' },
            { status: 'TOOL_FAILED', wann: 'Ein technischer Fehler trat auf.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: 'Nur lesend.' },
        pruefeErfolg: function (d) { return !!d && Array.isArray(d.termine) && d.anzahl === d.termine.length; },
        verbindung: { datei: 'js/calendar.js', funktion: 'calendarEntries', aktion: 'lesen' },
        verfuegbar: function () { return !!listeTermine(); },
        vorpruefung: function (p) {
            if (p.zeitraum) { if (!zeitraumAusParam(p.zeitraum)) return { status: 'NEEDS_INFORMATION', nachricht: 'Für welchen Zeitraum soll ich in den Kalender schauen?', fehlend: ['zeitraum'] }; return null; }
            if (!tagAusParam(p.tag)) return { status: 'NEEDS_INFORMATION', nachricht: 'Für welchen Tag soll ich in den Kalender schauen?', fehlend: ['tag'] };
            return null;
        },
        ausfuehren: async function (p) {
            var zr = p.zeitraum ? zeitraumAusParam(p.zeitraum) : null;
            if (zr) {
                var lw = (listeTermine() || []).filter(function (e) { var t = e && tagVonEintrag(e); return t && t >= zr.von && t <= zr.bis; }).sort(function (a, b) { return String(a.isoDate) < String(b.isoDate) ? -1 : 1; });
                var tw = lw.map(function (e) {
                    var ganz = /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate));
                    return { id: e.id, tag: tagVonEintrag(e), text: String(e.text || ''), zeit: ganz ? 'ganztägig' : uhrzeitText(new Date(e.isoDate)), ort: String(e.location || '') };
                });
                var nw = !tw.length ? 'Für ' + zr.name + ' steht kein Termin in deinem Kalender.'
                    : (tw.length === 1 ? 'Für ' + zr.name + ' steht ein Termin an: ' : 'Für ' + zr.name + ' stehen ' + tw.length + ' Termine an: ') +
                      tw.map(function (t) { return wochentagKurz(t.tag) + (t.zeit === 'ganztägig' ? ' ganztägig ' : ' um ' + t.zeit + ' ') + t.text + (t.ort ? ' in ' + t.ort : ''); }).join(', ') + '.';
                return { tag: '', zeitraum: p.zeitraum, von: zr.von, bis: zr.bis, anzahl: tw.length, termine: tw, nachricht: nw };
            }
            var tag = tagAusParam(p.tag);
            var l = (listeTermine() || []).filter(function (e) { return e && tagVonEintrag(e) === tag; }).sort(function (a, b) { return String(a.isoDate) < String(b.isoDate) ? -1 : 1; });
            var termine = l.map(function (e) {
                var ganz = /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate));
                return { id: e.id, text: String(e.text || ''), zeit: ganz ? 'ganztägig' : uhrzeitText(new Date(e.isoDate)), ort: String(e.location || '') };
            });
            var wann = tag === tagVon(new Date()) ? 'heute' : tag === tagAusParam('morgen') ? 'morgen' : tag === tagAusParam('uebermorgen') ? 'übermorgen' : 'am ' + new Date(tag + 'T12:00:00').toLocaleDateString('de-DE', { timeZone: BERLIN, day: 'numeric', month: 'long' });
            var nachricht = !termine.length ? 'Für ' + wann + ' steht kein Termin in deinem Kalender.'
                : (termine.length === 1 ? 'Für ' + wann + ' steht ein Termin an: ' : 'Für ' + wann + ' stehen ' + termine.length + ' Termine an: ') +
                  termine.map(function (t) { return (t.zeit === 'ganztägig' ? 'ganztägig ' : t.zeit + ' ') + t.text + (t.ort ? ' in ' + t.ort : ''); }).join(', ') + '.';
            return { tag: tag, anzahl: termine.length, termine: termine, nachricht: nachricht };
        }
    });

    /* ============ 4. Termin verschieben ============ */
    /* Passende Termine: ab heute, Titel enthält die Suche (oder umgekehrt); optional nur an einem Tag oder genau eine ID (Auswahl nach einer Rückfrage). */
    function kandidatenTermine(p) {
        var q = norm(p.suche), heute = tagVon(new Date()), tagFilter = p.tag ? tagAusParam(p.tag) : '';
        var id = p.termin_id != null && p.termin_id !== '' ? String(p.termin_id) : '';
        return (listeTermine() || []).filter(function (e) {
            if (!e || !e.text) return false;
            if (id) return String(e.id) === id;
            var t = tagVonEintrag(e);
            if (!t || t < heute) return false;
            if (tagFilter && t !== tagFilter) return false;
            var n = norm(e.text);
            return !!q && (n.indexOf(q) >= 0 || q.indexOf(n) >= 0);
        }).sort(function (a, b) { return String(a.isoDate) < String(b.isoDate) ? -1 : 1; });
    }
    function frageVerschieben(p) {
        var k = kandidatenTermine(p);
        if (k.length !== 1) return '';
        var n = new Date(p.neue_zeit);
        return 'Soll ich „' + k[0].text + '“ (' + terminZeitText(k[0]) + ') auf ' + tagText(n) + ' um ' + uhrzeitText(n) + ' verschieben?';
    }
    R.registriere({
        name: 'termin_verschieben',
        beschreibung: 'Verschiebt einen bestehenden Termin auf eine neue Zeit. Nur nach ausdrücklicher Bestätigung; bei mehreren passenden Terminen wird nachgefragt, nie geraten.',
        pflicht: [
            { name: 'suche', typ: 'text', beschreibung: 'Woran der Termin zu erkennen ist, zum Beispiel "Zahnarzt".' },
            { name: 'neue_zeit', typ: 'zeit', beschreibung: 'Neuer Beginn als ISO-Zeit, zum Beispiel 2026-11-07T14:00:00.' }
        ],
        optional: [
            { name: 'tag', typ: 'text', beschreibung: 'Der bisherige Tag (heute, morgen, uebermorgen oder Datum), wenn mehrere Termine gleich heißen.' },
            { name: 'termin_id', typ: 'text', beschreibung: 'Genau dieser Termin (nach einer Rückfrage ausgewählt).' }
        ],
        rueckgabe: { beschreibung: 'Der Termin, die alte und die tatsächlich gespeicherte neue Zeit, ob die Änderung nachgewiesen ist, Hinweise.', felder: ['id', 'text', 'vorher', 'nachher', 'verifiziert', 'hinweise', 'nichtsGetan', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Kein oder mehr als ein passender Termin, oder die neue Zeit liegt in der Vergangenheit.' },
            { status: 'NEEDS_CONFIRMATION', wann: 'Immer, bis der Nutzer eindeutig zugestimmt hat.' },
            { status: 'TOOL_FAILED', wann: 'Die neue Zeit steht danach nicht im Kalender (auch nicht bei Google), oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Aktionsausführung oder der Kalender ist nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: true, grund: 'Ein Termin im Kalender wird geändert.' },
        pruefeErfolg: function (d) { return !!d && d.verifiziert === true && (!d.nichtsGetan || d.nichtsGetan.length === 0); },
        verbindung: { datei: 'js/actions.js', funktion: 'executeAction', aktion: 'calendar_update' },
        verfuegbar: function () { return typeof executeAction === 'function' && !!listeTermine(); },
        vorpruefung: function (p) {
            if (!String(p.suche == null ? '' : p.suche).trim() && !(p.termin_id != null && p.termin_id !== '')) return { status: 'NEEDS_INFORMATION', nachricht: 'Welchen Termin soll ich verschieben?', fehlend: ['suche'] };
            var n = new Date(p.neue_zeit);
            if (isNaN(n.getTime()) || n.getTime() < Date.now() - 60000) return { status: 'NEEDS_INFORMATION', nachricht: 'Die neue Zeit liegt in der Vergangenheit. Auf wann soll ich den Termin verschieben?', fehlend: ['neue_zeit'] };
            var k = kandidatenTermine(p);
            if (k.length === 0) return { status: 'NEEDS_INFORMATION', nachricht: 'Ich habe keinen passenden Termin gefunden. Wie heißt der Termin genau?', fehlend: ['suche'] };
            if (k.length > 1) return { status: 'NEEDS_INFORMATION', nachricht: 'Ich finde mehrere passende Termine. ' + nummerierte(k, function (e) { return e.text + ', ' + terminZeitText(e); }) + '. Welchen meinst du?', fehlend: ['termin_id'] };
            return sicherheit({ type: 'calendar_update', calendar_id: k[0].id, calendar_time: p.neue_zeit });
        },
        ausfuehren: async function (p, kontext) {
            var k = kandidatenTermine(p);
            if (k.length !== 1) throw fehler(k.length ? 'Es passen jetzt mehrere Termine, deshalb habe ich nichts verschoben.' : 'Der Termin ist nicht mehr da, deshalb habe ich nichts verschoben.');
            var e = k[0], ctx = ctxNeu(kontext), SYM_N = Symbol.for('jv.nichtsGetan'), nichtsVorher = (ctx[SYM_N] || []).length;
            var vorher = e.isoDate, id = e.id, titel = e.text;
            await executeAction({ type: 'calendar_update', calendar_id: id, calendar_time: p.neue_zeit, _bestaetigt: true }, satzDesNutzers(kontext, p, 'suche'), ctx);
            var steht = function () { var x = (listeTermine() || []).filter(function (t) { return t && String(t.id) === String(id); })[0]; return !!x && zeitPasst(x.isoDate, p.neue_zeit); };
            var verifiziert = await warteBis(steht, 4000);
            var jetztE = (listeTermine() || []).filter(function (t) { return t && String(t.id) === String(id); })[0];
            var nichts = (ctx[SYM_N] || []).slice(nichtsVorher);
            var nachricht = nichts[0] || (verifiziert ? 'Ich habe „' + titel + '“ auf ' + terminZeitText(jetztE) + ' verschoben.' + (ctx.notes.length ? ' ' + ctx.notes.join(' ') : '')
                                                       : (ctx.notes.join(' ') || 'Ich konnte nicht bestätigen, dass der Termin verschoben wurde. Bitte prüfe ihn im Kalender.'));
            return { id: id, text: titel, vorher: vorher, nachher: jetztE ? jetztE.isoDate : null, verifiziert: verifiziert, hinweise: ctx.notes.slice(), nichtsGetan: nichts, nachricht: nachricht };
        }
    });

    /* ============ 5. Kontakt speichern ============ */
    /* Welcher gefundene Ort ist gemeint? Eindeutig -> {ort}; sonst Rückfrage. Nie raten. */
    function ortWaehlen(p) {
        var l = letzteOrte(), nr = p.nummer != null && p.nummer !== '' ? +p.nummer : 0, q = norm(p.ort);
        if (!l.length) return { status: 'NEEDS_INFORMATION', nachricht: 'Ich habe gerade keinen gefundenen Ort gemerkt. Suche zuerst nach dem Ort oder nenne mir Name und Adresse.', fehlend: ['ort'] };
        if (nr) {
            if (nr >= 1 && nr <= l.length) return { ort: l[nr - 1] };
            return { status: 'NEEDS_INFORMATION', nachricht: 'Die Nummer ' + nr + ' gibt es nicht. ' + nummerierte(l, function (o) { return o.name; }) + '. Welchen meinst du?', fehlend: ['nummer'] };
        }
        var treffer = q ? l.filter(function (o) { var n = norm(o.name); return n.indexOf(q) >= 0 || q.indexOf(n) >= 0 || (!!orte.art && norm(orte.art).indexOf(q) >= 0); }) : l;
        if (q && !treffer.length) return { status: 'NEEDS_INFORMATION', nachricht: 'Ich habe keinen gefundenen Ort passend zu „' + p.ort + '“. ' + nummerierte(l, function (o) { return o.name; }) + '. Welchen meinst du?', fehlend: ['ort'] };
        if (treffer.length === 1) return { ort: treffer[0] };
        return { status: 'NEEDS_INFORMATION', nachricht: 'Ich habe mehrere Treffer gemerkt. ' + nummerierte(treffer, function (o) { return o.name + (o.adresse ? ', ' + o.adresse : ''); }) + '. Welchen soll ich speichern?', fehlend: ['nummer'] };
    }
    /* Alles, was zum Speichern gebraucht wird, oder die Rückfrage. */
    function kontaktAngaben(p, kontext) {
        var name = String(p.name == null ? '' : p.name).trim(), adresse = String(p.adresse == null ? '' : p.adresse).trim(), tel = String(p.telefon == null ? '' : p.telefon).trim();
        if (!(name && (adresse || tel))) {
            var w = ortWaehlen(p);
            if (!w.ort) return w;
            name = name || w.ort.name; adresse = adresse || w.ort.adresse;
            if (!adresse && !tel) return { status: 'NEEDS_INFORMATION', nachricht: 'Zu „' + w.ort.name + '“ habe ich keine Adresse. Nenne mir eine Adresse oder Telefonnummer, dann speichere ich den Kontakt.', fehlend: ['adresse'] };
        }
        return { name: name, adresse: adresse, telefon: tel };
    }
    function kontaktSchluessel(name) { return String(name).trim().toLowerCase(); }
    R.registriere({
        name: 'kontakt_speichern',
        beschreibung: 'Speichert einen Kontakt mit Adresse und/oder Telefonnummer, auch aus dem zuletzt gefundenen Ort ("Speichere die Adresse von der Apotheke"). Gibt es den Kontakt schon, wird nichts doppelt angelegt; eine andere Adresse wird nie ohne Rückfrage überschrieben.',
        pflicht: [],
        optional: [
            { name: 'ort', typ: 'text', beschreibung: 'Welcher zuletzt gefundene Ort, zum Beispiel "Apotheke" oder ein Name.' },
            { name: 'nummer', typ: 'zahl', beschreibung: 'Nummer in der zuletzt genannten Trefferliste (1 = erster).' },
            { name: 'name', typ: 'text', beschreibung: 'Name des Kontakts (ohne Angabe der Name des gefundenen Ortes).' },
            { name: 'adresse', typ: 'text', beschreibung: 'Adresse, wenn nicht aus einem gefundenen Ort.' },
            { name: 'telefon', typ: 'text', beschreibung: 'Telefonnummer.' }
        ],
        rueckgabe: { beschreibung: 'Name, Adresse, ob neu angelegt, ergänzt oder schon vorhanden, und die tatsächlich gespeicherte Adresse.', felder: ['name', 'adresse', 'telefon', 'angelegt', 'schonVorhanden', 'ergaenzt', 'gespeichert', 'nachricht'] },
        fehler: [
            { status: 'NEEDS_INFORMATION', wann: 'Kein gemerkter Ort, mehrere Treffer, keine Adresse oder Telefonnummer.' },
            { status: 'NEEDS_CONFIRMATION', wann: 'Zum Namen gibt es schon eine andere Adresse oder Nummer (Überschreiben nur nach Zustimmung, kontext.bestaetigt).' },
            { status: 'TOOL_FAILED', wann: 'Nach dem Speichern steht der Kontakt nicht mit der gewünschten Adresse in der Liste, oder ein technischer Fehler trat auf.' },
            { status: 'CAPABILITY_MISSING', wann: 'Die Kontaktliste ist nicht geladen.' }
        ],
        fallbacks: [],
        bestaetigung: { noetig: false, grund: 'Ein Kontakt kommt nur dazu oder wird ergänzt; ein abweichender Eintrag wird in der Vorprüfung bestätigt.' },
        pruefeErfolg: function (d) { return !!d && (d.schonVorhanden === true || (d.gespeichert === true && (d.angelegt === true || d.ergaenzt === true))); },
        verbindung: { datei: 'js/lists.js', funktion: 'saveContact', aktion: 'savedContacts' },
        verfuegbar: function () { return !!kontakte() && typeof setPersistentData === 'function'; },
        vorpruefung: function (p, kontext) {
            var a = kontaktAngaben(p, kontext);
            if (a.status) return a;
            var alt = kontakte()[kontaktSchluessel(a.name)];
            if (alt && !bestaetigt(kontext)) {
                var adrAnders = a.adresse && alt.address && norm(alt.address) !== norm(a.adresse);
                var telAnders = a.telefon && alt.phone && norm(alt.phone) !== norm(a.telefon);
                if (adrAnders || telAnders) return { status: 'NEEDS_CONFIRMATION', nachricht: 'Zu „' + (alt.originalName || a.name) + '“ gibt es schon ' + (adrAnders ? 'eine andere Adresse (' + alt.address + ')' : 'eine andere Nummer') + '. Soll ich sie durch die neue ersetzen?' };
            }
            return null;
        },
        ausfuehren: async function (p, kontext) {
            var a = kontaktAngaben(p, kontext);
            if (a.status) throw fehler(a.nachricht);
            var liste = kontakte(), key = kontaktSchluessel(a.name), alt = liste[key];
            if (alt && (!a.adresse || norm(alt.address) === norm(a.adresse)) && (!a.telefon || norm(alt.phone) === norm(a.telefon))) {
                return { name: alt.originalName || a.name, adresse: alt.address || '', telefon: alt.phone || '', angelegt: false, schonVorhanden: true, ergaenzt: false, gespeichert: false,
                         nachricht: 'Den Kontakt „' + (alt.originalName || a.name) + '“ gibt es schon mit dieser Angabe, ich habe nichts doppelt angelegt.' };
            }
            liste[key] = { originalName: (alt && alt.originalName) || a.name, phone: a.telefon || (alt && alt.phone) || '', address: a.adresse || (alt && alt.address) || '' };   // gleiche Form wie saveContact() in lists.js
            setPersistentData('helfer_contacts', JSON.stringify(liste));
            try { if (typeof renderContactList === 'function') renderContactList(); } catch (e) { }
            var steht = kontakte()[key];
            var gespeichert = !!steht && (!a.adresse || norm(steht.address) === norm(a.adresse)) && (!a.telefon || norm(steht.phone) === norm(a.telefon));
            return { name: a.name, adresse: steht ? steht.address : '', telefon: steht ? steht.phone : '', angelegt: !alt, schonVorhanden: false, ergaenzt: !!alt, gespeichert: gespeichert,
                     nachricht: gespeichert ? (alt ? 'Ich habe den Kontakt „' + a.name + '“ ergänzt.' : 'Ich habe „' + a.name + '“ mit ' + (a.adresse ? 'der Adresse ' + a.adresse : 'der Nummer') + ' als Kontakt gespeichert.') : 'Der Kontakt wurde nicht gespeichert.' };
        }
    });

    /* ============ Schichtregel gegen den Schichtplan (für gedaechtnis_speichern) ============ */
    var RX_SCHICHT = /(?:fruehschicht|spaetschicht|frueh schicht|spaet schicht|nachtschicht)/;
    var RX_FEST = /\b(?:immer|normalerweise|meistens|ueblicherweise|in der regel|gewoehnlich|jeden|jede|montags|dienstags|mittwochs|donnerstags|freitags|samstags|sonntags)\b/;
    function schichtPruefung(p, kontext) {
        try {
            if (bestaetigt(kontext)) return null;
            var t = norm(String(p.schluessel || '') + ' ' + String(p.wert || ''));
            if (!RX_SCHICHT.test(t) || !RX_FEST.test(t)) return null;
            var w = typeof window.jvSchichtWissen === 'function' ? window.jvSchichtWissen() : null;
            if (!w) return null;   // kein bekannter Schichtplan: nichts zu widersprechen
            return { status: 'NEEDS_CONFIRMATION', nachricht: 'In deinem Schichtplan wechseln Früh- und Spätschicht jede Woche (diese Woche ' + (w.schicht_diese_woche || '?') + ', nächste Woche ' + (w.schicht_naechste_woche || '?') + '). Das passt nicht zu einer festen Regel. Soll ich sie trotzdem merken?' };
        } catch (e) { return null; }
    }

    window.jvSchreibkern = Object.freeze({ merkeOrte: merkeOrte, letzteOrte: letzteOrte, kandidatenTermine: kandidatenTermine, frageVerschieben: frageVerschieben, schichtPruefung: schichtPruefung, ORTE_MS: ORTE_MS });

    var lose = R.pruefeVerweise();
    if (lose.length) { try { console.warn('Jarvis-Registry: Fallback nicht angemeldet', JSON.stringify(lose)); } catch (e) { } }
})();
