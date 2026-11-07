/* ============================================================
   JARVIS STUDIO - PROJEKTGEDÄCHTNIS: was Jarvis gebaut, geschrieben oder recherchiert hat, bleibt auffindbar.
   "Ändere die App von gestern" -> finde() erkennt Tag, Art und Name; ist es nicht eindeutig, kommt eine gezielte Rückfrage statt einer Vermutung.
   window.jvStudioProjekte:
     neu(p)                 legt ein Projekt an. p = { name, art, auftrag, dateien? | datei? | ergebnis?, missionId? }  -> { ok, projekt } | { ok:false, fehler }
     aktualisiere(id, patch) neue Fassung (version+1); die Fassung davor bleibt EINMAL erhalten (vorher), nichts wird still überschrieben
     hole(id) / liste() / entferne(id)
     finde(text)            -> { ok:true, projekt } | { ok:false, art:'frage'|'keine', frage, kandidaten:[id..] }
     arbeit.setze(missionId, objekt) / arbeit.hole(missionId) / arbeit.weg(missionId)   Zwischenstand einer laufenden Mission (damit sie nach einem Neustart weitermachen kann)
     status()               { anzahl, bytes, grenze, ladeStatus }
   Speicher: localStorage "jv_studio_projekte_v1" und "jv_studio_arbeit_v1" (nur dieses Gerät, bewusst nicht im Geräte-Abgleich).
   Grenzen: höchstens 40 Projekte und 1,8 MB insgesamt. Ist es voll, wird NICHT still das Älteste gelöscht, sondern abgelehnt (Jarvis fragt dann, was weg soll).
   ============================================================ */
(function () {
    'use strict';
    if (window.jvStudioProjekte) return;

    var KEY = 'jv_studio_projekte_v1', KEY_ARBEIT = 'jv_studio_arbeit_v1';
    var MAX_PROJEKTE = 40, MAX_BYTES = 1800000, MAX_ARBEIT_BYTES = 400000;
    var ARTEN = ['webseite', 'app', 'dokument', 'praesentation', 'recherche'];
    var zustand = { v: 1, zaehler: 0, projekte: [] }, arbeitsmappe = {}, ladeStatus = 'neu';

    function jetzt() { return Date.now(); }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function kurz(t, n) { return String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, n); }
    function kopie(o) { return JSON.parse(JSON.stringify(o)); }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }

    function laden() {
        var roh = lsGet(KEY);
        if (roh === null) { ladeStatus = 'leer'; zustand = { v: 1, zaehler: 0, projekte: [] }; }
        else {
            try {
                var d = JSON.parse(roh);
                if (!d || d.v !== 1 || !Array.isArray(d.projekte)) throw new Error('Format');
                zustand = d; ladeStatus = 'ok';
            } catch (e) {
                lsSet(KEY + '_defekt', roh);   // beschädigte Daten werden gesichert, nie überschrieben
                zustand = { v: 1, zaehler: 0, projekte: [] }; ladeStatus = 'defekt';
            }
        }
        var ra = lsGet(KEY_ARBEIT);
        try { arbeitsmappe = ra ? JSON.parse(ra) : {}; if (!arbeitsmappe || typeof arbeitsmappe !== 'object' || Array.isArray(arbeitsmappe)) arbeitsmappe = {}; } catch (e) { arbeitsmappe = {}; }
    }
    function bytes() { return JSON.stringify(zustand).length; }
    function speichern() { return lsSet(KEY, JSON.stringify(zustand)); }
    function speichernArbeit() { return lsSet(KEY_ARBEIT, JSON.stringify(arbeitsmappe)); }

    function pruefe(p) {
        if (!p || typeof p !== 'object') return 'Projekt fehlt.';
        if (ARTEN.indexOf(p.art) < 0) return 'Unbekannte Art: ' + p.art;
        if (!kurz(p.name, 60)) return 'Name fehlt.';
        return '';
    }
    function neu(p) {
        var f = pruefe(p); if (f) return { ok: false, fehler: f };
        if (zustand.projekte.length >= MAX_PROJEKTE) return { ok: false, fehler: 'Es gibt schon ' + MAX_PROJEKTE + ' Projekte. Sag mir, welches weg soll.', voll: true };
        zustand.zaehler++;
        var t = jetzt();
        var pr = { id: 'sp' + t.toString(36) + zustand.zaehler.toString(36), name: kurz(p.name, 60), art: p.art, auftrag: kurz(p.auftrag, 400), erstellt: t, geaendert: t, version: 1, missionId: p.missionId ? String(p.missionId) : null };
        if (Array.isArray(p.dateien)) pr.dateien = kopie(p.dateien);
        if (p.datei) pr.datei = kopie(p.datei);
        if (p.ergebnis) pr.ergebnis = kopie(p.ergebnis);
        zustand.projekte.push(pr);
        if (bytes() > MAX_BYTES) { zustand.projekte.pop(); zustand.zaehler--; return { ok: false, fehler: 'Der Speicher für Projekte ist voll. Sag mir, welches Projekt weg soll.', voll: true }; }
        if (!speichern()) { zustand.projekte.pop(); zustand.zaehler--; return { ok: false, fehler: 'Das Projekt konnte nicht gespeichert werden (Speicher des Geräts voll).' }; }
        return { ok: true, projekt: kopie(pr) };
    }
    function suche(id) { for (var i = 0; i < zustand.projekte.length; i++) if (zustand.projekte[i].id === id) return zustand.projekte[i]; return null; }
    function aktualisiere(id, patch) {
        var p = suche(id); if (!p) return { ok: false, fehler: 'Dieses Projekt gibt es nicht.' };
        var alt = kopie(p);
        if (p.dateien && patch.dateien) p.vorher = { version: p.version, dateien: p.dateien };
        ['dateien', 'datei', 'ergebnis', 'apk', 'name'].forEach(function (k) { if (patch[k] !== undefined) p[k] = kopie(patch[k]); });
        if (typeof patch.bauzeit === 'number' && isFinite(patch.bauzeit)) { p.bauzeiten = (p.bauzeiten || []).concat([Math.round(patch.bauzeit)]).slice(-10); }
        if (patch.dateien || patch.datei || patch.ergebnis) p.version++;
        p.geaendert = jetzt();
        if (bytes() > MAX_BYTES || !speichern()) { Object.keys(p).forEach(function (k) { delete p[k]; }); Object.assign(p, alt); return { ok: false, fehler: 'Speicher voll: die neue Fassung konnte nicht gespeichert werden. Die alte bleibt unverändert.', voll: true }; }
        return { ok: true, projekt: kopie(p) };
    }
    function entferne(id) { var n = zustand.projekte.length; zustand.projekte = zustand.projekte.filter(function (p) { return p.id !== id; }); if (zustand.projekte.length === n) return { ok: false, fehler: 'Dieses Projekt gibt es nicht.' }; speichern(); try { if (window.jvStudioBilder && window.jvStudioBilder.loescheProjekt) window.jvStudioBilder.loescheProjekt(id).catch(function () { }); } catch (e) { } return { ok: true }; }
    function hole(id) { var p = suche(id); return p ? kopie(p) : null; }
    function liste() { return zustand.projekte.map(kopie); }

    /* ---------- "die App von gestern" ---------- */
    var TAGE = { montag: 1, dienstag: 2, mittwoch: 3, donnerstag: 4, freitag: 5, samstag: 6, sonnabend: 6, sonntag: 0 };
    var ART_WORTE = [
        [/\b(app|web ?app|anwendung|programm|spiel|rechner|tool)\b/, ['app', 'webseite']],
        [/\b(webseite|website|homepage|seite|landingpage)\b/, ['webseite', 'app']],
        [/\b(praesentation|folien|powerpoint|vortrag|slides)\b/, ['praesentation']],
        [/\b(dokument|bericht|word|text|datei)\b/, ['dokument', 'recherche']],
        [/\b(recherche|rechercheergebnis|ergebnis)\b/, ['recherche']]
    ];
    function tagStart(ts) { var d = new Date(ts); d.setHours(0, 0, 0, 0); return d.getTime(); }
    function bezeichnung(p) {
        var d = new Date(p.geaendert), t = tagStart(jetzt()), diff = Math.round((t - tagStart(p.geaendert)) / 86400000);
        var wann = diff === 0 ? 'heute' : diff === 1 ? 'gestern' : diff === 2 ? 'vorgestern' : 'am ' + String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.';
        return p.name + ' (' + wann + ')';
    }
    function finde(text) {
        var t = norm(text), alle = zustand.projekte.slice();
        if (!alle.length) return { ok: false, art: 'keine', frage: 'Ich habe noch kein Projekt gespeichert.', kandidaten: [] };
        var heute = tagStart(jetzt()), tagZiel = null;
        if (/\bvorgestern\b/.test(t)) tagZiel = heute - 2 * 86400000;
        else if (/\bgestern\b/.test(t)) tagZiel = heute - 86400000;
        else if (/\bheute\b/.test(t)) tagZiel = heute;
        else { var m = /\bvor (\d{1,2}) tagen\b/.exec(t); if (m) tagZiel = heute - (+m[1]) * 86400000; }
        if (tagZiel === null) {
            Object.keys(TAGE).some(function (n) {
                if (new RegExp('\\b(?:am |letzten |vom )?' + n + '\\b').test(t)) {
                    var d = new Date(heute), diff = (d.getDay() - TAGE[n] + 7) % 7 || 7; tagZiel = heute - diff * 86400000; return true;
                }
                return false;
            });
        }
        var arten = null; ART_WORTE.some(function (a) { if (a[0].test(t)) { arten = a[1]; return true; } return false; });
        var kand = alle;
        if (arten) kand = kand.filter(function (p) { return arten.indexOf(p.art) >= 0; });
        var mitTag = kand;
        if (tagZiel !== null) mitTag = kand.filter(function (p) { return tagStart(p.geaendert) === tagZiel || tagStart(p.erstellt) === tagZiel; });
        /* Namensbestandteile aus dem Satz (nur Wörter, die im Projektnamen vorkommen) */
        var namensTreffer = mitTag.filter(function (p) { return norm(p.name).split(' ').some(function (w) { return w.length >= 4 && t.indexOf(w) >= 0; }); });
        var zuletzt = /\b(letzte|letzten|neueste|neuesten|zuletzt|aktuelle|aktuellen)\b/.test(t);
        if (namensTreffer.length) mitTag = namensTreffer;
        var sortiert = mitTag.slice().sort(function (a, b) { return b.geaendert - a.geaendert; });
        if (sortiert.length === 1) return { ok: true, projekt: kopie(sortiert[0]) };
        if (sortiert.length > 1) {
            if (zuletzt) return { ok: true, projekt: kopie(sortiert[0]) };
            var top = sortiert.slice(0, 3);
            return { ok: false, art: 'frage', frage: 'Welches meinst du: ' + top.map(bezeichnung).join(' oder ') + '?', kandidaten: top.map(function (p) { return p.id; }) };
        }
        /* nichts passt zum genannten Tag: ehrlich sagen und das Nächstliegende anbieten, nicht stillschweigend etwas anderes nehmen */
        var rest = (arten ? alle.filter(function (p) { return arten.indexOf(p.art) >= 0; }) : alle).sort(function (a, b) { return b.geaendert - a.geaendert; });
        if (!rest.length) return { ok: false, art: 'keine', frage: 'Dazu habe ich kein Projekt gespeichert.', kandidaten: [] };
        return { ok: false, art: 'frage', frage: (tagZiel !== null ? 'Von diesem Tag habe ich nichts. ' : 'Das habe ich nicht eindeutig gefunden. ') + 'Meinst du ' + bezeichnung(rest[0]) + '?', kandidaten: [rest[0].id] };
    }

    /* ---------- Zwischenstand einer Mission ---------- */
    var arbeit = {
        setze: function (mid, obj) {
            var alt = arbeitsmappe[mid]; arbeitsmappe[mid] = { zeit: jetzt(), daten: kopie(obj) };
            if (JSON.stringify(arbeitsmappe).length > MAX_ARBEIT_BYTES) { if (alt) arbeitsmappe[mid] = alt; else delete arbeitsmappe[mid]; return false; }
            return speichernArbeit();
        },
        hole: function (mid) { return arbeitsmappe[mid] ? kopie(arbeitsmappe[mid].daten) : null; },
        weg: function (mid) { delete arbeitsmappe[mid]; speichernArbeit(); }
    };

    laden();
    window.jvStudioProjekte = {
        ARTEN: ARTEN.slice(), neu: neu, aktualisiere: aktualisiere, hole: hole, liste: liste, entferne: entferne, finde: finde, arbeit: arbeit, bezeichnung: bezeichnung,
        status: function () { return { anzahl: zustand.projekte.length, bytes: bytes(), grenze: MAX_BYTES, ladeStatus: ladeStatus }; }, laden: laden
    };
})();
