/* ============================================================
   JARVIS STUDIO - AUFTRAG PER SPRACHE: "Jarvis, bau mir eine App", "Recherchiere das für mich", "Ändere die App von gestern".
   Keine Formulare, keine manuelle Eingabe von Schritten. Der Satz wird erkannt, die Arbeitsschritte werden AUTOMATISCH geplant und im vorhandenen Missions-Kern
   (window.jvMission) angelegt und gestartet. Die Werkzeuge (studio_werkzeuge.js) arbeiten sie nacheinander ab; die Live-Regie (studio_regie.js) begleitet sie.

   Einbindung: als lokaler Teil des Chef-KI-Hakens (chef.js: kiWeg und behandle rufen zuerst jvStudioAuftrag.behandle). Dort laufen sie NACH allen festen Sprachbefehlen,
   die 92 Befehle und ihre Reihenfolge bleiben unverändert, es gibt keinen neuen Eintrag in commands.js. Es gibt keine zweite KI-Steuerung: Die Erkennung ist lokal
   (deutsche Muster, kostenlos), die KI wird nur INNERHALB der Werkzeug-Schritte benutzt (bestehender Weg /api/groq).
   Planung: je Auftragsart eine feste, geprüfte Schrittfolge (Recherche, Web-App, Dokument, Präsentation, Änderung, APK); die KI füllt die Schritte mit Inhalt, sie erfindet
   keine Schritte. Fehlen wesentliche Angaben ("bau mir eine App"), stellt Jarvis EINE gezielte Rückfrage.
   Freigabe: Der APK-Bau schickt das Projekt an GitHub. Davor wartet die Mission auf ein ausdrückliches Ja (Karte oder Sprache).
   Steuerung per Sprache (nur mit dem Wort Mission/Auftrag): pausieren, fortsetzen, abbrechen, "wie weit ist die Mission".
   Einstellungen per Sprache: "Ansagen alle / nur wichtige / aus", "Mission stumm", "Mission laut", "Energiesparen an/aus", "Studio aus/an".
   ============================================================ */
(function () {
    'use strict';
    if (window.jvStudioAuftrag) return;

    var K_AN = 'jv_studio', FRAGE_MS = 2 * 60000;
    var K_PLAN = 'jv_studio_plan_v1', K_PLANUNG = 'jv_studio_planung', PLAN_MS = 20 * 60000;   // Planungsdialog: Plan überlebt einen Neustart, verfällt nach 20 Minuten ohne Antwort
    var plan = null, planAbgelaufen = false;
    var laeufer = {};        // Mission -> true, solange ein Läufer die Schritte abarbeitet (nie zwei gleichzeitig)
    var offen = null;        // genau eine offene Rückfrage: { art, erkannt, bis }
    var freigabeOffen = null;   // Mission, die auf das Ja zum APK-Bau wartet
    var protokoll = [];

    function M() { return window.jvMission; }
    function P() { return window.jvStudioProjekte; }
    function R() { return window.jvStudioRegie; }
    function A() { return window.jvStudioAnsicht; }
    function jetzt() { return Date.now(); }
    function ls(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { } }
    function istAn() { return ls(K_AN) !== '0'; }
    function sag(text) { try { if (typeof window.speak === 'function') window.speak(text); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[„“"'’‘»«]/g, '').replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function frageAnmelden() { try { if (window.jvFrage && typeof window.jvFrage.neu === 'function') window.jvFrage.neu('studio'); } catch (e) { } }
    function frageGehoertUns() { try { return !window.jvFrage || window.jvFrage.aktuell() === 'studio'; } catch (e) { return true; } }
    function merkeProtokoll(art, extra) { protokoll.push(Object.assign({ zeit: jetzt(), art: art }, extra || {})); if (protokoll.length > 20) protokoll.shift(); }

    /* ---------- Erkennen ---------- */
    var BARE_JA = /^(?:ja|jawohl|gerne|ok|okay|klar|ja bitte|ja gerne|ja klar|ja mach das|mach das|genau|richtig|ja baue es|ja bau es|ja so|so passt es|passt|ja passt|ja bauen)$/;
    var STEUER_ARTEN = ['steuer', 'ansagen', 'stumm', 'spar', 'studio_schalter', 'diagnose', 'zeigen', 'planung', 'plan_zeigen'];
    var RX_ANREDE = /^(?:(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova)[ ,]+)/;
    var RX_HOEFLICH = /\b(bitte|mal|doch|eben|kurz|einfach|gern|gerne|jetzt|mir|fuer mich|fuer mich bitte)\b/g;
    var RX_BAU = /\b(bau|baue|bauen|erstell|erstelle|erstellen|programmier|programmiere|entwickl|entwickle|entwickeln|generier|generiere|schreib|schreibe)\b/;
    var RX_APPWORT = /\b(app|webapp|web app|anwendung|webseite|website|homepage|landingpage|spiel|taschenrechner|rechner|tool|programm|seite)\b/;
    var RX_APK = /\bapk\b|android ?app|app (?:fuer|auf) (?:mein |das |den )?(?:handy|android|smartphone)/;
    var RX_AENDERN = /\b(aender|aendere|aendern|veraender|veraendere|erweiter|erweitere|korrigier|korrigiere|verbesser|verbessere|ueberarbeit|ueberarbeite|passe|pass)\b/;
    var RX_PROJEKTWORT = /\b(app|webapp|webseite|website|homepage|seite|projekt|spiel|rechner|tool|programm|dokument|praesentation|recherche|bericht)\b/;
    var RX_RECHERCHE = /\brecherch\w*/;
    var RX_DOKUMENT = /\b(dokument|bericht|word datei|word dokument|zusammenfassung|ausarbeitung|konzept|handout|referat|artikel)\b/;
    var RX_PRAES = /\b(praesentation|powerpoint|folien|vortrag|slides|foliensatz)\b/;
    var RX_AUSSCHLUSS = /\b(brief|widerspruch|antrag|kuendigung|beschwerde|anschreiben|lebenslauf|einkaufsliste|erinnerung|termin|wecker|nachricht|mail|e mail|notiz)\b/;
    var FUELL = /\b(ein|eine|einen|einem|einer|die|der|das|den|dem|mir|mich|uns|fuer|von|zu|zum|zur|ueber|zu dem|und|dass|damit|so|etwas|was|neue|neues|neuen|kleine|kleines|kleinen|einfache|einfaches|einfachen|schoene|schoenes|tolle|tolles|app|webapp|web app|anwendung|webseite|website|homepage|seite|programm|projekt|dokument|praesentation|powerpoint|bericht|recherche|apk|android|bau|baue|bauen|erstell|erstelle|erstellen|programmier|programmiere|entwickl|entwickle|generier|generiere|schreib|schreibe|mach|mache|recherchier|recherchiere|aender|aendere|jarvis|bitte)\b/g;

    function themaAus(roh) {
        var t = String(roh || '').replace(/^\s+|\s+$/g, '').replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova)[ ,]+/i, '').slice(0, 400);
        return t.charAt(0).toUpperCase() + t.slice(1);
    }
    function inhaltsWoerter(n) { return n.replace(FUELL, ' ').replace(/\s+/g, ' ').trim().split(' ').filter(function (w) { return w.length > 2; }); }

    function erkenne(text) {
        var roh = String(text || '').trim();
        if (!roh || roh.length > 500) return null;
        var n = norm(roh).replace(RX_ANREDE, '');
        var hatMission = /\b(mission|auftrag)\b/.test(n);

        /* Einstellungen und Steuerung */
        var m;
        if ((m = /^(?:studio|jarvis studio) (an|aus|ein)$/.exec(n))) return { art: 'studio_schalter', an: m[1] !== 'aus' };
        if (/^(?:studio|apk|apk bau) (?:diagnose|verbindung pruefen|verbindung testen)$|^(?:pruefe|teste) (?:die )?(?:studio |apk )?(?:apk )?verbindung$/.test(n)) return { art: 'diagnose' };
        if ((m = /^(?:planung|planungsmodus|planen) (an|aus|ein)$/.exec(n))) return { art: 'planung', an: m[1] !== 'aus' };
        if (/^(?:wie war der plan|was war der plan|was ist der plan|wie lautet der plan|zeig(?:e)? (?:mir )?den plan|plan zeigen)$/.test(n)) return { art: 'plan_zeigen' };
        if ((m = /^(?:ansagen|meldungen|mission ansagen|missions ansagen) (?:auf )?(alle|wichtige|nur wichtige|aus)$/.exec(n)) || (m = /^(?:nur wichtige|alle) (ansagen|meldungen)$/.exec(n))) { var w = m[1] === 'ansagen' || m[1] === 'meldungen' ? (/^nur/.test(n) ? 'wichtige' : 'alle') : m[1].replace('nur ', ''); return { art: 'ansagen', stufe: w }; }
        if (/^(?:keine ansagen|ansagen aus|mission stumm|mission leise|missionen stumm|stumm schalten mission)$/.test(n)) return { art: 'stumm', an: true };
        if (/^(?:mission laut|missionen laut|ansagen an|ansagen ein|mission wieder sprechen)$/.test(n)) return { art: 'stumm', an: false };
        if ((m = /^energiesparen (an|aus|ein)(?: mission| ansagen)?$/.exec(n))) return { art: 'spar', an: m[1] !== 'aus' };
        if (hatMission) {
            if (/\b(pausier\w*|anhalten|halte \w+ an)\b/.test(n)) return { art: 'steuer', aktion: 'pause' };
            if (/\b(fortsetz\w*|setze\s+\w+\s+\w*\s*fort|setze\s+\w+\s+fort|fort|weiter\w*|mach \w+ weiter|geht weiter)\b/.test(n)) return { art: 'steuer', aktion: 'weiter' };
            if (/\b(abbrech\w*|brich \w+ ab|breche \w+ ab|stopp\w*|beende\w*)\b/.test(n)) return { art: 'steuer', aktion: 'abbruch' };
            if (/\b(wie weit|stand|status|wie laeuft|was macht)\b/.test(n)) return { art: 'steuer', aktion: 'status' };
        }
        if (/^(?:wie weit bist du|was machst du gerade|wie laeuft es|wie lange noch)$/.test(n)) return { art: 'steuer', aktion: 'status', nurWennAktiv: true };

        /* Projekt zeigen */
        if (/\b(zeig\w*|oeffne\w*|starte\w*|spiel\w* ab|lass \w+ sehen)\b/.test(n) && RX_PROJEKTWORT.test(n) && /\b(von (gestern|heute|vorgestern|montag|dienstag|mittwoch|donnerstag|freitag|samstag|sonntag)|letzte\w*|neueste\w*|gebaute\w*|gespeicherte\w*|projekt)\b/.test(n) && !RX_BAU.test(n)) return { art: 'zeigen', bezug: roh };

        /* Aufträge */
        if (RX_AUSSCHLUSS.test(n) && !RX_APPWORT.test(n) && !RX_RECHERCHE.test(n)) return null;
        var bauVerb = RX_BAU.test(n) || /\bmach\w* mir\b/.test(n);
        var thema = themaAus(roh);
        if (RX_APK.test(n) && (bauVerb || /\bmach\w*\b/.test(n) || /\bals apk\b/.test(n))) {
            var mitBau = RX_APPWORT.test(n.replace(RX_APK, '')) && /\b(bau\w*|erstell\w*|programmier\w*|entwickl\w*)\b/.test(n) && !/\b(von gestern|von heute|vorgestern|aus der|aus dem|aus meiner|aus meinem|die letzte|der letzten|vorhandene\w*|gespeicherte\w*|fertige\w*)\b/.test(n);
            return { art: mitBau ? 'webapp' : 'apk', thema: thema, mitApk: true, bezug: roh, roh: roh };
        }
        if (RX_AENDERN.test(n) && RX_PROJEKTWORT.test(n)) return { art: 'aendern', thema: thema, bezug: roh, roh: roh, mitApk: /\bapk\b/.test(n) };
        if (RX_RECHERCHE.test(n)) {
            var ausgabe = RX_PRAES.test(n) ? 'praesentation' : RX_DOKUMENT.test(n) ? 'dokument' : 'bericht';
            return { art: 'recherche', ausgabe: ausgabe, thema: thema, roh: roh };
        }
        if (bauVerb && RX_PRAES.test(n)) return { art: 'dokument', ausgabe: 'praesentation', thema: thema, roh: roh };
        if (bauVerb && RX_DOKUMENT.test(n) && !RX_APPWORT.test(n.replace(/\bseite\b/, ''))) return { art: 'dokument', ausgabe: 'dokument', thema: thema, roh: roh };
        if (bauVerb && RX_APPWORT.test(n)) {
            if (/\b(spiel|spiele) (ab|mir|musik|lied)\b/.test(n)) return null;
            return { art: 'webapp', thema: thema, roh: roh };
        }
        return null;
    }

    /* ---------- Planung: feste, geprüfte Schrittfolgen ---------- */
    var PLAENE = {
        recherche: [['Suchbegriffe festlegen', 'st_suchbegriffe'], ['Im Internet suchen', 'st_suche'], ['Seiten wirklich abrufen und lesen', 'st_lesen'], ['Quellen vergleichen und Zitate prüfen', 'st_auswerten']],
        bericht: [['Recherche-Bericht schreiben', 'st_bericht']],
        dokument: [['Dokument gliedern', 'st_gliederung'], ['Word-Datei erzeugen und prüfen', 'st_datei']],
        praesentation: [['Folien planen', 'st_gliederung'], ['PowerPoint-Datei erzeugen und prüfen', 'st_datei']],
        webapp: [['Anforderungen analysieren', 'st_anforderungen'], ['Code schreiben', 'st_code'], ['Testlauf und Prüfung', 'st_pruefen'], ['Projekt speichern', 'st_speichern']],
        aendern: [['Änderung ausarbeiten', 'st_aendern'], ['Testlauf und Prüfung', 'st_pruefen'], ['Neue Fassung speichern', 'st_speichern']],
        apk: [['Projekt prüfen', 'st_pruefen']],
        apkbau: [['Debug-APK bauen (nach deiner Freigabe)', 'st_apk_bau']]
    };
    var TAETIGKEIT = { recherche: 'Ich lege jetzt die Suchbegriffe fest.', webapp: 'Ich analysiere jetzt die Anforderungen.', dokument: 'Ich gliedere jetzt das Dokument.', praesentation: 'Ich plane jetzt die Folien.', aendern: 'Ich sehe mir das Projekt an.', apk: 'Ich prüfe jetzt das Projekt.' };
    function planeSchritte(e) {
        var s = [];
        if (e.art === 'recherche') { s = PLAENE.recherche.slice(); if (e.ausgabe === 'bericht') s = s.concat(PLAENE.bericht); else s = s.concat(PLAENE[e.ausgabe]); }
        else if (e.art === 'dokument') s = PLAENE[e.ausgabe].slice();
        else if (e.art === 'webapp') s = PLAENE.webapp.slice();
        else if (e.art === 'aendern') s = PLAENE.aendern.slice();
        else if (e.art === 'apk') s = PLAENE.apk.slice();
        if (e.mitApk && (e.art === 'webapp' || e.art === 'aendern' || e.art === 'apk')) s = s.concat(PLAENE.apkbau);
        return s.map(function (x, i) { return { titel: x[0], werkzeug: x[1], abhaengigVon: i ? ['s' + i] : [] }; });
    }
    var TITEL = { recherche: 'Recherche', webapp: 'Web-App', dokument: 'Dokument', praesentation: 'Präsentation', aendern: 'Änderung', apk: 'APK-Bau' };
    function missionsTitel(e) { var t = e.thema.replace(/[.!?]+$/, ''); return (TITEL[e.art === 'dokument' && e.ausgabe === 'praesentation' ? 'praesentation' : e.art] || 'Auftrag') + ': ' + t.slice(0, 70); }

    /* ---------- Rückfragen: nur wenn wirklich etwas Wesentliches fehlt ---------- */
    function brauchtThema(e) {
        if (e.art === 'apk' || e.art === 'aendern') return false;
        var w = inhaltsWoerter(norm(e.thema));
        if (e.art === 'webapp') return w.length < 1 && !/\b(rechner|taschenrechner|spiel|todo|liste|timer|quiz)\b/.test(norm(e.thema));
        return w.length < 1;
    }
    var FRAGE = { webapp: 'Was soll die App können?', recherche: 'Wozu soll ich recherchieren?', dokument: 'Worüber soll das Dokument sein?', praesentation: 'Worüber soll die Präsentation sein?' };

    /* ---------- Mission anlegen und starten ---------- */
    function starteAuftrag(e, projekt) {
        if (!M() || !P() || !window.jvStudioWerkzeuge) return { ok: false, fehler: 'Die Studio-Technik ist nicht geladen.' };
        var schritte = planeSchritte(e);
        if (!schritte.length) return { ok: false, fehler: 'Dazu kann ich keinen Plan machen.' };
        var r = M().neu({ titel: missionsTitel(e), auftrag: e.roh || e.thema, schritte: schritte });
        if (!r.ok) return { ok: false, fehler: r.fehler };
        var id = r.mission.id;
        P().arbeit.setze(id, { studio: true, art: e.art, thema: e.thema, ausgabe: e.ausgabe || (e.art === 'webapp' ? 'app' : ''), mitApk: !!e.mitApk, projektId: projekt ? projekt.id : undefined, konzept: e.konzept || undefined });
        var s = M().starten(id);
        if (!s.ok) { M().abbrechen(id, 'Start nicht möglich'); return { ok: false, fehler: s.fehler }; }
        var taet = TAETIGKEIT[e.art] || '';
        var ack = R() ? R().bestaetigung(taet) : 'Wird erledigt.';
        if (R()) { R().ack(id, ack); R().ansage(id, ack, 3); }
        merkeProtokoll('start', { art: e.art, mission: id });
        if (A()) A().zeige(id);
        laufen(id);
        return { ok: true, id: id, ack: ack };
    }

    /* ---------- Läufer ---------- */
    function abschlussSatz(mid) {
        var arb = P().arbeit.hole(mid) || {}, pr = arb.projektId ? P().hole(arb.projektId) : null, b = arb.bericht;
        if (arb.art === 'recherche' && b) {
            var erste = String(b.fazit || '').split(/(?<=[.!?])\s/)[0] || '';
            if (arb.ausgabe !== 'bericht' && pr) return 'Fertig. Ich habe ' + (arb.ausgabe === 'praesentation' ? 'die Präsentation' : 'das Dokument') + ' „' + pr.name + '“ aus ' + (arb.seiten || []).length + ' gelesenen Quellen erstellt. ' + erste;
            return 'Die Recherche ist fertig: ' + b.punkte.length + ' belegte Aussagen aus ' + (arb.seiten || []).length + ' gelesenen Quellen. ' + erste;
        }
        if (pr && pr.apk && arb.mitApk) return 'Die Debug-APK für „' + pr.name + '“ ist gebaut. Du findest den Download in der Karte.';
        if (pr && (arb.art === 'webapp' || arb.art === 'aendern')) return (arb.art === 'aendern' ? 'Die neue Fassung von „' : 'Die Web-App „') + pr.name + (arb.art === 'aendern' ? '“ ist gespeichert, geprüft und läuft ohne Fehler.' : '“ ist fertig, geprüft und gespeichert.');
        if (pr) return (pr.art === 'praesentation' ? 'Die Präsentation „' : 'Das Dokument „') + pr.name + '“ ist fertig.';
        return 'Der Auftrag ist erledigt.';
    }
    function abraeumen(mid) {   // Zwischenstand verkleinern: die Ergebnisse stehen im Projektgedächtnis
        var arb = P().arbeit.hole(mid); if (!arb) return;
        delete arb.seiten; delete arb.treffer; delete arb.dateien; delete arb.gliederung;
        P().arbeit.setze(mid, arb);
    }
    async function laufen(mid) {
        if (laeufer[mid]) return; laeufer[mid] = true;
        try {
            for (var runde = 0; runde < 40; runde++) {
                var m = M().hole(mid); if (!m || m.status !== 'laeuft') break;
                var s = m.schritte.filter(function (x) { return x.status === 'offen' || x.status === 'unterbrochen'; })[0];
                if (!s) {
                    var asatz = abschlussSatz(mid), nachfrage = nachtragFrageVorbereiten(mid);
                    if (R()) R().abschlussText(mid, asatz + nachfrage);
                    var ab = M().abschliessen(mid);
                    if (ab.ok) { abraeumen(mid); if (nachfrage) nachtragFrageSetzen(mid); } else if (nachfrage) offen = null;
                    break;
                }
                var arb = P().arbeit.hole(mid) || {};
                if (s.werkzeug === 'st_apk_bau' && !arb.freigabeOk) {
                    var pr = arb.projektId ? P().hole(arb.projektId) : null;
                    var grund = 'APK bauen: Die ' + (pr && pr.dateien ? pr.dateien.length : '') + ' Dateien von „' + (pr ? pr.name : 'dem Projekt') + '“ werden an GitHub gesendet und dort gebaut. Die App bekommt keine Berechtigungen.';
                    M().freigabeAnfordern(mid, grund);
                    freigabeOffen = mid; frageAnmelden();
                    break;
                }
                await M().fuehreSchrittAus(mid, s.id);
                var nach = M().hole(mid); if (!nach) break;
                var st = nach.schritte.filter(function (x) { return x.id === s.id; })[0];
                if (st && st.status === 'fehlgeschlagen') {
                    if (nach.status === 'laeuft') M().fehlschlagen(mid, 'Schritt „' + st.titel + '“ ist fehlgeschlagen: ' + String(st.fehler || '').slice(0, 200));
                    break;
                }
                if (nach.status !== 'laeuft') break;
            }
        } catch (e) {
            try { if (M().hole(mid) && M().hole(mid).status === 'laeuft') M().fehlschlagen(mid, 'Unerwarteter Fehler: ' + String(e && e.message).slice(0, 150)); } catch (e2) { }
        } finally { delete laeufer[mid]; if (A()) A().neuZeichnen(mid); }
    }

    /* ---------- Steuerung ---------- */
    function aktive() {
        var l = M() ? M().liste().filter(function (m) { var a = P().arbeit.hole(m.id); return a && a.studio && ['laeuft', 'wartet_freigabe', 'pausiert'].indexOf(m.status) >= 0; }) : [];
        return l.sort(function (a, b) { return b.erstellt - a.erstellt; });
    }
    function letzte() {
        var l = M() ? M().liste().filter(function (m) { var a = P().arbeit.hole(m.id); return a && a.studio; }) : [];
        return l.sort(function (a, b) { return b.erstellt - a.erstellt; })[0] || null;
    }
    function freigeben(mid, ja) {
        freigabeOffen = null;
        if (!ja) { M().abbrechen(mid, 'Freigabe abgelehnt'); return { ok: true, text: 'Alles klar, ich baue nichts und breche die Mission ab.' }; }
        var arb = P().arbeit.hole(mid) || {}; arb.freigabeOk = true; P().arbeit.setze(mid, arb);
        var f = M().freigeben(mid); if (!f.ok) return { ok: false, text: f.fehler };
        laufen(mid);
        return { ok: true, text: 'Freigabe erhalten, ich starte den Bau.' };
    }
    function steuere(aktion, nurWennAktiv) {
        var akt = aktive(), m = akt[0] || (aktion === 'status' ? letzte() : null);
        if (!m) return nurWennAktiv ? null : 'Es läuft gerade keine Mission.';
        if (aktion === 'status') return statusSatz(m);
        if (aktion === 'pause') { if (m.status !== 'laeuft') return 'Die Mission läuft gerade nicht.'; var p = M().pausieren(m.id); return p.ok ? 'Die Mission ist pausiert. Der laufende Schritt wird noch zu Ende geführt, danach macht nichts weiter.' : p.fehler; }
        if (aktion === 'weiter') { if (m.status === 'wartet_freigabe') { freigabeOffen = m.id; frageAnmelden(); return 'Die Mission wartet auf deine Freigabe: ' + (m.freigabeFuer || 'der nächste Schritt') + ' Sag Ja oder Nein.'; } var f = M().fortsetzen(m.id); if (f.ok) { laufen(m.id); return 'Ich mache weiter.'; } return f.fehler; }
        if (aktion === 'abbruch') { var a = M().abbrechen(m.id, 'Auf Wunsch abgebrochen'); freigabeOffen = null; return a.ok ? 'Die Mission ist abgebrochen.' : a.fehler; }
        return null;
    }
    function statusSatz(m) {
        var z = M().zeiten(m.id) || {}, erl = m.schritte.filter(function (s) { return s.status === 'erledigt' || s.status === 'uebersprungen'; }).length;
        var lf = m.schritte.filter(function (s) { return s.status === 'laeuft'; })[0];
        var txt = ({ geplant: 'Die Mission ist noch nicht gestartet.', laeuft: lf ? 'Gerade läuft: ' + lf.titel + '.' : 'Die Mission läuft.', wartet_freigabe: 'Die Mission wartet auf deine Freigabe.', pausiert: 'Die Mission ist pausiert.', abgeschlossen: 'Die Mission ist abgeschlossen.', fehlgeschlagen: 'Die Mission ist fehlgeschlagen.', abgebrochen: 'Die Mission wurde abgebrochen.' })[m.status];
        txt += ' ' + erl + ' von ' + m.schritte.length + ' Schritten sind erledigt, aktive Zeit bisher ' + (R() ? R().dauerText(z.aktivMs || 0) : Math.round((z.aktivMs || 0) / 1000) + ' Sekunden') + '.';
        if (R() && (m.status === 'laeuft')) { var pg = R().prognose(m.id); txt += pg.moeglich ? ' ' + pg.satz : ' Eine Zeitprognose kann ich noch nicht seriös geben.'; }
        return txt;
    }


    /* ---------- DIRIGENT: ordnet jeden Satz ein, solange ein Auftrag läuft oder eine Rückfrage offen ist ----------
       Arten: antwort (auf offene Rückfrage/Freigabe, weiter oben), zusatzwunsch (gehört zum laufenden App-Auftrag), zwischenfrage/fremd (geht unverändert an Jarvis,
       Auftrag und offene Rückfrage bleiben unberührt), neuer Auftrag, Steuerung (pausieren, fortsetzen, abbrechen, Status). Nichts davon markiert einen Auftrag als erledigt. */
    var RX_FRAGEWORT = /^(?:wie|was|wann|wo|wer|wem|wen|wessen|warum|wieso|weshalb|welche[rsnm]?|wieviel\w*|wie viel\w*|gibt es|ist|sind|kann|kannst|hast|hat|habe ich|muss ich|brauche ich|soll ich|darf|wird|werden|wurde|woher|wohin|wofuer)\b/;
    var RX_ZUSATZ_VERB = /\b(fueg\w*|ergaenz\w*|bau\w*|nimm|nehm\w*|mach\w*|erweiter\w*|aender\w*|bring\w*|pack\w*|setz\w*|bitte)\b/;
    var RX_ZUSATZ_MARKE = /\b(hinzu|dazu|noch|auch|zusaetzlich|ausserdem|einbau\w*|einbaue\w*)\b/;
    var RX_NEUE_APP = /\b(neue|neues|neuen|andere|anderes|zweite|zweites|weitere|weiteres)\s+(app|webapp|web app|webseite|website|spiel|programm|tool)\b|\bnoch (?:eine?n?|ne) (?:neue\w* )?(app|webapp|web app|webseite|website|spiel|programm|tool|recherche|praesentation|dokument)\b/;
    var RX_ZUSATZ_BEZUG = /\b(app|funktion|funktionen|knopf|knoepfe|button|feld|felder|anzeige|design|farbe|farben|seite|ansicht|menue|tabelle|diagramm|export|speicher\w*)\b/;
    function istFrage(roh) { var n = norm(roh); return /\?\s*$/.test(String(roh || '')) || RX_FRAGEWORT.test(n.replace(RX_ANREDE, '')); }
    function laufendeApp() {   // der Auftrag, dem ein Zusatzwunsch gehören kann: genau EINE laufende oder pausierte Web-App-/Änderungs-Mission
        var l = aktive().filter(function (m) { var a = P().arbeit.hole(m.id) || {}; return (m.status === 'laeuft' || m.status === 'pausiert') && (a.art === 'webapp' || a.art === 'aendern'); });
        return l.length === 1 ? l[0] : null;
    }
    function klassifiziere(text) {
        var roh = String(text || ''), n = norm(roh).replace(RX_ANREDE, '');
        var akt = aktive();
        if (!akt.length && !offen && !freigabeOffen) return { art: 'frei' };
        var e = erkenne(roh), app = laufendeApp();
        var zusatzForm = app && RX_ZUSATZ_VERB.test(n) && RX_ZUSATZ_MARKE.test(n) && RX_ZUSATZ_BEZUG.test(n) && n.length >= 8 && !RX_NEUE_APP.test(n) && !RX_AUSSCHLUSS.test(n) && !(e && STEUER_ARTEN.indexOf(e.art) >= 0);
        if (zusatzForm) return { art: 'zusatzwunsch', mission: app };   // vor „neuer Auftrag“: „Baue noch Urlaubstage dazu in die App“ ist KEIN neuer Auftrag
        if (e) return { art: STEUER_ARTEN.indexOf(e.art) >= 0 ? 'steuerung' : 'neuerAuftrag', erkannt: e };
        if (istFrage(roh)) return { art: 'zwischenfrage' };
        return { art: 'fremd' };
    }
    /* Zusatzwunsch einarbeiten, aber NUR solange der Arbeitsschritt es sicher zulässt: der Code-Schritt hat noch nicht begonnen. Sonst wird der Wunsch vorgemerkt und
       nach der Fertigstellung als Rückfrage angeboten (kein stilles Umbauen eines schon geschriebenen Projekts). */
    function ergaenze(mid, text) {
        var m = M().hole(mid), arb = P().arbeit.hole(mid) || {};
        var wunsch = themaAus(text).replace(/[.!?]+$/, '').slice(0, 200);
        var codeSchritt = (m && m.schritte || []).filter(function (x) { return x.werkzeug === 'st_code' || x.werkzeug === 'st_aendern'; })[0];
        if (!m || !codeSchritt) return { ok: false, text: 'Bei diesem Auftrag kann ich nichts mehr ergänzen.' };
        if (codeSchritt.status === 'offen' || codeSchritt.status === 'unterbrochen') {
            arb.thema = String(arb.thema || '') + ' – Zusatzwunsch: ' + wunsch;
            (arb.zusaetze = arb.zusaetze || []).push(wunsch); P().arbeit.setze(mid, arb);
            merkeProtokoll('zusatz_eingearbeitet', { mission: mid });
            return { ok: true, art: 'eingearbeitet', text: 'Habe ich ergänzt: ' + wunsch + '. Ich arbeite weiter.' };
        }
        if (codeSchritt.status === 'laeuft' || codeSchritt.status === 'erledigt') {
            (arb.nachtraege = arb.nachtraege || []).push(wunsch); P().arbeit.setze(mid, arb);
            merkeProtokoll('zusatz_vorgemerkt', { mission: mid });
            return { ok: true, art: 'vorgemerkt', text: 'Der Code ist schon in Arbeit. Ich merke mir „' + wunsch + '“ und frage dich nach der Fertigstellung, ob ich die App danach so ändern soll.' };
        }
        return { ok: false, text: 'Dazu ist der Auftrag nicht mehr in einem Zustand, in dem ich etwas ergänzen kann.' };
    }
    function nachtragFrageVorbereiten(mid) {   // Text der Rückfrage (nur wenn Wünsche vorgemerkt sind und ein Projekt existiert)
        var arb = P().arbeit.hole(mid) || {};
        if (!arb.nachtraege || !arb.nachtraege.length || !arb.projektId) return '';
        return ' Du hattest noch gewünscht: ' + arb.nachtraege.join('; ') + '. Soll ich die App jetzt so ändern?';
    }
    function nachtragFrageSetzen(mid) {   // erst NACH erfolgreichem Abschluss: die Frage gilt jetzt (Ja/Nein gehört dem Studio)
        var arb = P().arbeit.hole(mid) || {};
        offen = { art: 'nachtrag', mid: mid, projektId: arb.projektId, wuensche: (arb.nachtraege || []).slice(), bis: jetzt() + 10 * 60000 };
        frageAnmelden();
    }
    function dirigent() {   // eindeutiger Stand: welcher Auftrag läuft, was wartet
        var a = aktive()[0] || null, lf = a && a.schritte.filter(function (x) { return x.status === 'laeuft'; })[0];
        return { mission: a ? { id: a.id, titel: a.titel, status: a.status, schritt: lf ? lf.titel : '' } : null, anzahlAktiv: aktive().length, freigabeOffen: freigabeOffen, offeneFrage: offen ? offen.art : null };
    }


    /* ---------- PLANUNGSDIALOG: vor jedem App-/Website-Auftrag entwickelt die KI ein individuelles Konzept; gebaut wird erst nach einem eindeutigen Ja ----------
       Phasen: denkt (KI arbeitet) -> frage (höchstens EINE Rückfrage) -> bestaetigung („Soll ich das so bauen?“; Änderungswünsche überarbeiten nur den Plan) -> Mission.
       Stufen: direkt (Kleinstwerkzeuge wie Zähler/Timer oder „Planung aus“: wie bisher), kompakt (App), ausfuehrlich (Website/größeres Projekt).
       Gespeichert (jv_studio_plan_v1) überlebt der Plan einen Neustart; nach einem Neustart genügt ein einzelnes Ja nicht (Jarvis nennt den Plan erst noch einmal). 20 Minuten ohne Antwort: verfallen. */
    var RX_PLAN_WEB = /\b(webseite|website|homepage|landingpage|shop|portal|plattform|onlineshop)\b/;
    var RX_PLAN_KLEIN = /\b(zaehler|rechner|taschenrechner|timer|stoppuhr|wuerfel|taschenlampe|muenzwurf|countdown)\b/;
    var RX_BEFEHLSART = /^(?:stell|setz|schreib|erinner|ruf|schick|spiel|starte|oeffne|zeig|navigier|fahr|such|lies|lösch|loesch|mach das licht|schalt|wecke?)/;
    function planungAn() { return ls(K_PLANUNG) !== '0'; }
    function planSpeichern() {
        try { if (plan) localStorage.setItem(K_PLAN, JSON.stringify(plan)); else localStorage.removeItem(K_PLAN); } catch (e) { }
        try { if (A() && A().planNeuZeichnen) A().planNeuZeichnen(); } catch (e2) { }
    }
    function planWeg() { plan = null; planSpeichern(); }
    function planGueltig() {
        if (!plan) return false;
        if (jetzt() > plan.bis) { plan = null; planAbgelaufen = true; planSpeichern(); return false; }
        return true;
    }
    function planLaden() {
        var roh = ls(K_PLAN); if (!roh) return;
        try {
            var d = JSON.parse(roh);
            if (!d || typeof d !== 'object' || !d.e || !d.phase) throw new Error('x');
            if (jetzt() > d.bis) { planAbgelaufen = true; try { localStorage.removeItem(K_PLAN); } catch (e) { } return; }
            if (d.phase === 'denkt') { try { localStorage.removeItem(K_PLAN); } catch (e) { } return; }   // die KI-Antwort ging mit dem Neustart verloren: nichts zu bestätigen
            plan = d; plan.neustart = true; frageAnmelden();
        } catch (e) { try { localStorage.removeItem(K_PLAN); } catch (e2) { } plan = null; }
    }
    function planStufe(e) {
        if (!e || e.art !== 'webapp' || !planungAn()) return 'direkt';
        var n = norm(e.thema || e.roh || '');
        if (RX_PLAN_KLEIN.test(n) && !RX_PLAN_WEB.test(n)) return 'direkt';
        return (RX_PLAN_WEB.test(n) || inhaltsWoerter(n).length >= 7) ? 'ausfuehrlich' : 'kompakt';
    }
    function liste(a) { return (a || []).join(', '); }
    function konzeptSprache(k) {   // gesprochene Kurzfassung (die Karte zeigt alles)
        var t = 'Mein Konzept für „' + k.name + '“: ' + k.stil;
        if (k.farben) t += ' Farben: ' + k.farben;
        t += ' Funktionen: ' + liste(k.funktionen.slice(0, 4)) + '.';
        if (k.begruendung) t += ' ' + k.begruendung;
        return t;
    }
    function konzeptKompakt(p) {   // verbindlicher Text für die Studio-Werkzeuge
        var k = p.konzept; if (!k) return '';
        var t = k.name + '. Stil: ' + k.stil + ' Farben: ' + k.farben + ' Aufbau: ' + liste(k.aufbau) + '. Funktionen: ' + liste(k.funktionen) + '. Bedienung: ' + k.nutzbarkeit;
        if ((p.antworten || []).length) t += ' Antwort des Nutzers: ' + p.antworten.join(' | ') + '.';
        if ((p.aenderungenText || []).length) t += ' Gewünschte Änderungen: ' + p.aenderungenText.join(' | ') + '.';
        return t.slice(0, 900);
    }
    function planStart(e) {
        var stufe = planStufe(e); if (stufe === 'direkt') return false;
        var W = window.jvStudioWerkzeuge; if (!W || !W.planeKonzept) return false;
        plan = { id: 'pl' + jetzt().toString(36), phase: 'denkt', e: e, stufe: stufe, konzept: null, frage: '', antworten: [], aenderungenText: [], fragen: 0, humor: false, bis: jetzt() + PLAN_MS, neustart: false };
        planSpeichern(); frageAnmelden(); merkeProtokoll('plan_start', { stufe: stufe });
        sag((R() ? R().anrede() + ', ' : '') + 'ich überlege mir erst ein Konzept, bevor ich etwas baue.');
        planDenken(plan.id, { thema: e.thema, stufe: stufe, frageErlaubt: true });
        return true;
    }
    function planDenken(id, o) {
        window.jvStudioWerkzeuge.planeKonzept(o).then(function (k) { if (plan && plan.id === id) planErgebnis(k, o); })
            .catch(function (err) { if (plan && plan.id === id) planFehler(err); });
    }
    function planErgebnis(k, o) {
        plan.konzept = k; plan.bis = jetzt() + PLAN_MS;
        if (!o.aenderung && !(o.antworten && o.antworten.length) && k.frage && plan.fragen === 0) {
            plan.fragen = 1; plan.phase = 'frage'; plan.frage = k.frage;
            planSpeichern(); frageAnmelden(); sag(konzeptSprache(k) + ' Eine Frage: ' + k.frage); return;
        }
        plan.phase = 'bestaetigung'; plan.frage = '';
        var humor = (!o.aenderung && !plan.humor && k.bemerkung) ? ' ' + k.bemerkung : '';
        if (humor) plan.humor = true;
        planSpeichern(); frageAnmelden();
        sag((o.aenderung ? 'Angepasst. ' : '') + konzeptSprache(k) + humor + ' Soll ich das so bauen?');
    }
    function planFehler(err) {
        plan.phase = 'bestaetigung'; plan.konzept = null; plan.bis = jetzt() + PLAN_MS; planSpeichern(); frageAnmelden();
        sag('Ein Konzept konnte ich gerade nicht entwickeln (' + String(err && err.message || 'unbekannter Fehler').slice(0, 120) + '). Soll ich trotzdem direkt bauen? Sag Ja oder Abbrechen.');
    }
    function planStarten() {   // erst nach eindeutigem Ja (Sprache oder Knopf): die bestehende Studio-Mission
        var p = plan; if (!p || p.phase !== 'bestaetigung') return false;
        if (aktive().some(function (m) { return m.status === 'laeuft'; })) { sag('Es läuft schon eine Mission. Sag „Mission abbrechen“ oder warte, bis sie fertig ist. Der Plan bleibt erhalten.'); return true; }
        var e2 = Object.assign({}, p.e); if (p.konzept) e2.konzept = konzeptKompakt(p);
        planWeg();
        if (!istBereit()) { sag('Das Studio ist auf diesem Gerät noch nicht vollständig geladen.'); return true; }
        var r = starteAuftrag(e2, null); if (!r.ok) sag(r.fehler);
        return true;
    }
    function planNochmal(text, o) {   // Antwort oder Änderungswunsch: der Plan wird überarbeitet, es wird NICHT gebaut
        plan.phase = 'denkt'; plan.bis = jetzt() + PLAN_MS; planSpeichern();
        planDenken(plan.id, Object.assign({ thema: plan.e.thema, stufe: plan.stufe, altKonzept: plan.konzept, frageErlaubt: false }, o));
    }
    function planBehandle(text, n) {   // true = erledigt, false = an Jarvis weiterreichen (Zwischenfrage), null = nicht Sache des Plans
        if (!planGueltig()) return null;
        var ja = BARE_JA.test(n), nein = /^(?:nein|nee|ne|nicht so|lieber nicht)$/.test(n);
        var abbruch = /^(?:abbrechen|vergiss es|lass es|stopp|stop|doch nicht|verwirf den plan|plan verwerfen|plan abbrechen|vergiss den plan|ich will das nicht)$/.test(n);
        if ((ja || nein) && !frageGehoertUns()) return null;
        if ((ja || nein) && (plan.phase === 'bestaetigung' || plan.phase === 'frage') && (freigabeOffen || (offen && jetzt() <= offen.bis))) { merkeProtokoll('ja_mehrdeutig'); sag('Ich habe gerade mehrere offene Fragen. Sag „Plan bauen“ für den Plan oder „APK freigeben“ für den Bau, oder beantworte zuerst die andere Frage.'); return true; }
        if (abbruch) { planWeg(); sag('Alles klar, ich verwerfe den Plan. Es wurde nichts gebaut.'); return true; }
        var e = erkenne(text);
        if (e && STEUER_ARTEN.indexOf(e.art) >= 0) return null;
        if (e && (e.art !== 'webapp' || RX_NEUE_APP.test(n))) { planWeg(); return null; }   // ein wirklich anderer Auftrag ersetzt den Plan
        var frage = istFrage(text) && !RX_ZUSATZ_BEZUG.test(n);
        if (plan.phase === 'denkt') { if (ja || nein) { sag('Einen Moment, ich überlege noch.'); return true; } return null; }
        if (frage) { merkeProtokoll('zwischenfrage_plan'); return false; }
        var woerter = n.split(' ').length;
        if (plan.phase === 'frage') {
            if (!ja && !nein && (woerter > 14 || RX_BEFEHLSART.test(n))) return null;
            var antwort = ja ? 'Ja' : nein ? 'Nein' : themaAus(text).slice(0, 200);
            plan.antworten.push(antwort); sag('Verstanden, ich arbeite das ein.');
            planNochmal(text, { antworten: plan.antworten }); return true;
        }
        /* bestaetigung */
        if (ja) {
            if (plan.neustart) { plan.neustart = false; planSpeichern(); frageAnmelden(); sag('Der Plan von vorhin: ' + (plan.konzept ? konzeptSprache(plan.konzept) : 'direkt bauen ohne Konzept') + ' Sag noch einmal Ja, dann baue ich.'); return true; }
            return planStarten();
        }
        if (/^(?:plan bauen|bau den plan|bau es so)$/.test(n)) return planStarten();
        if (nein) { sag('Okay. Was soll ich ändern? Oder sag Abbrechen.'); return true; }
        if (woerter > 40 || RX_BEFEHLSART.test(n)) return null;
        if ((plan.aenderungenText || []).length >= 5) { sag('Das war schon die fünfte Änderung. Sag Ja zum Bauen oder Abbrechen.'); return true; }
        plan.aenderungenText.push(themaAus(text).slice(0, 200)); sag('Verstanden, ich passe das Konzept an. Gebaut wird noch nichts.');
        planNochmal(text, { aenderung: text }); return true;
    }

    /* ---------- Projekt finden (Projektgedächtnis) ---------- */
    async function mitProjekt(e) {
        var f = P().finde(e.bezug || e.roh || e.thema);
        if (f.ok) return starteMitProjekt(e, f.projekt);
        if (f.art === 'frage') { offen = { art: 'projektwahl', erkannt: e, kand: f.kandidaten, bis: jetzt() + FRAGE_MS }; frageAnmelden(); sag(f.frage); merkeProtokoll('frage_projekt'); return true; }
        sag(f.frage + (e.art === 'aendern' || e.art === 'apk' ? ' Sag „Bau mir eine App“, dann lege ich eins an.' : ''));
        return true;
    }
    function starteMitProjekt(e, pr) {
        if ((e.art === 'aendern' || e.art === 'apk') && !pr.dateien) { sag('„' + pr.name + '“ ist keine Web-App, die ich ändern oder bauen könnte.'); return true; }
        var r = starteAuftrag(e, pr);
        if (!r.ok) sag(r.fehler);
        return true;
    }

    /* ---------- Einstieg aus dem Chef-KI-Haken ---------- */
    function behandle(text) {
        if (typeof text !== 'string' || !text.trim()) return false;
        try {
            var n = norm(text);
            var pb = planBehandle(text, n); if (pb !== null) return pb;   // Planungsdialog zuerst: ein Ja gehört zum Plan, nie heimlich zu etwas anderem
            if (planAbgelaufen && BARE_JA.test(n) && frageGehoertUns()) { planAbgelaufen = false; sag('Der Plan ist abgelaufen. Sag mir den Auftrag bitte noch einmal.'); return true; }
            /* Antworten auf eine offene Rückfrage oder Freigabe */
            if (freigabeOffen && offen && jetzt() <= offen.bis && frageGehoertUns() && BARE_JA.test(n)) {   // zwei offene Fragen gleichzeitig: ein nacktes Ja löst NICHTS aus
                merkeProtokoll('ja_mehrdeutig');
                sag('Ich habe gerade zwei offene Fragen. Sag „APK freigeben“ für den Bau, oder beantworte zuerst die andere Frage mit dem Namen.'); return true;
            }
            if (freigabeOffen && frageGehoertUns()) {
                if (/^(?:ja|jawohl|gerne|ok|okay|klar|freigeben|freigabe erteilt|apk freigeben|bau es|mach es|mach das|ja bitte|ja gerne|ja klar|ja mach das)$/.test(n) && !(offen && jetzt() <= offen.bis && !/freigeb|bau es|apk/.test(n))) { var j = freigeben(freigabeOffen, true); sag(j.text); return true; }
                if (/^(?:nein|nee|nicht|lieber nicht|nein danke|abbrechen|stopp|nicht bauen)$/.test(n)) { var nn = freigeben(freigabeOffen, false); sag(nn.text); return true; }
            }
            if (offen && jetzt() <= offen.bis && (offen.art === 'thema' || offen.art === 'projektwahl') && istFrage(text) && !RX_ZUSATZ_BEZUG.test(n) && !erkenne(text)) { merkeProtokoll('zwischenfrage'); return false; }   // Zwischenfrage (z. B. Wetter): die Rückfrage bleibt offen
            if (offen && jetzt() <= offen.bis && frageGehoertUns()) {
                var o = offen; offen = null;
                if (o.art === 'nachtrag') {
                    if (/^(?:ja|jawohl|gerne|ok|okay|klar|ja bitte|ja gerne|ja klar|ja mach das|mach das|aendere es|aender die app)$/.test(n)) { var pn = P().hole(o.projektId); if (!pn) { sag('Das Projekt finde ich nicht mehr.'); return true; } return starteMitProjekt({ art: 'aendern', thema: o.wuensche.join('; '), roh: 'Ändere die App: ' + o.wuensche.join('; '), bezug: pn.name }, pn); }
                    if (/^(?:nein|nee|nicht|lieber nicht|nein danke|spaeter|egal)$/.test(n)) { sag('Alles klar, die App bleibt so.'); return true; }
                    offen = o; return false;   // etwas anderes gesagt: Frage bleibt bis zum Ablauf offen
                }
                if (/^(?:nein|nee|abbrechen|vergiss es|lass es|egal|stopp)\b/.test(n)) { sag('Alles klar, ich lasse es.'); return true; }
                if (o.art === 'thema') { var e2 = Object.assign({}, o.erkannt); e2.thema = themaAus(text); e2.roh = (o.erkannt.roh || '') + ' – ' + text; if (planStart(e2)) return true; var r2 = starteAuftrag(e2, null); if (!r2.ok) sag(r2.fehler); return true; }
                if (o.art === 'projektwahl') {
                    var cand = o.kand.map(function (id) { return P().hole(id); }).filter(Boolean), wahl = null;
                    if (cand.length === 1 && /^(?:ja|jawohl|genau|richtig|gerne|ja bitte|ok|okay|klar)$/.test(n)) wahl = cand[0];
                    else cand.forEach(function (c) { if (!wahl && n.indexOf(norm(c.name)) >= 0) wahl = c; });
                    if (!wahl && /\b(erste|erstes|ersten|oberste)\b/.test(n)) wahl = cand[0];
                    if (!wahl && /\b(zweite|zweites|zweiten)\b/.test(n)) wahl = cand[1];
                    if (!wahl && /\b(dritte|dritten)\b/.test(n)) wahl = cand[2];
                    if (!wahl) { sag('Das habe ich nicht zuordnen können. Sag mir bitte den Namen des Projekts.'); offen = o; offen.bis = jetzt() + FRAGE_MS; frageAnmelden(); return true; }
                    if (o.erkannt.art === 'zeigen') { if (A()) A().zeigeProjekt(wahl.id); sag('Hier ist ' + wahl.name + '.'); return true; }
                    return starteMitProjekt(o.erkannt, wahl);
                }
            }
            var kl = klassifiziere(text);
            if (kl.art === 'zusatzwunsch' && istAn()) { var zr = ergaenze(kl.mission.id, text); sag(zr.text); return true; }
            if (kl.art === 'zwischenfrage' || kl.art === 'fremd') { merkeProtokoll(kl.art); return false; }   // geht unverändert an Jarvis; Auftrag und offene Rückfrage bleiben unberührt
            if (offen && offen.art !== 'nachtrag') offen = null; else if (offen && kl.art === 'neuerAuftrag') offen = null;
            var e = kl.erkannt || erkenne(text); if (!e) return false;
            if (e.art !== 'studio_schalter' && !istAn()) return false;
            merkeProtokoll('erkannt', { art: e.art });
            if (e.art === 'studio_schalter') { lsSet(K_AN, e.an ? '1' : '0'); sag(e.an ? 'Das Studio ist an.' : 'Das Studio ist aus. Aufträge zum Bauen und Recherchieren nehme ich nicht mehr an.'); return true; }
            if (e.art === 'planung') { lsSet(K_PLANUNG, e.an ? '1' : '0'); sag(e.an ? 'Die Planung vor dem Bauen ist an.' : 'Die Planung ist aus. Ich baue neue Apps wieder sofort, ohne vorher ein Konzept zu zeigen.'); return true; }
            if (e.art === 'plan_zeigen') { if (planGueltig() && plan.phase !== 'denkt') sag(plan.konzept ? konzeptSprache(plan.konzept) + (plan.phase === 'frage' ? ' Offen ist meine Frage: ' + plan.frage : ' Soll ich das so bauen?') : 'Offen ist der Auftrag ohne Konzept. Soll ich trotzdem direkt bauen?'); else sag(plan ? 'Ich überlege noch am Konzept.' : 'Es ist gerade kein Plan offen.'); return true; }
            if (e.art === 'diagnose') {   // sichere Diagnose der APK-Verbindung: der Server prüft Repository und Schreibrecht (keine Geheimnisse in der Antwort)
                var af = typeof apiFetch === 'function' ? apiFetch : (typeof window.apiFetch === 'function' ? window.apiFetch : null);
                if (!af) { sag('Keine Verbindung zum Server.'); return true; }
                sag('Ich prüfe die Verbindung zum APK-Bau.');
                af('/api/maps?action=studio_diagnose').then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j || {} }; }); }).then(function (x) {
                    var j = x.j; sag(x.ok && j.urteil ? j.urteil + (j.repo ? ' Repository: ' + j.repo + '.' : '') + (j.tokenAblauf && j.tokenAblauf !== 'unbekannt' ? ' Das Token läuft ab am ' + String(j.tokenAblauf).slice(0, 10) + '.' : '') : 'Die Diagnose hat nicht geklappt' + (j.error ? ': ' + String(j.error).slice(0, 120) : '.'));
                }).catch(function () { sag('Die Diagnose hat nicht geklappt: Server nicht erreichbar.'); });
                return true;
            }
            if (!R()) return false;
            if (e.art === 'ansagen') { R().setzeStufe(e.stufe); sag(e.stufe === 'alle' ? 'Ich sage alle Arbeitsschritte an.' : e.stufe === 'aus' ? 'Ich sage nichts mehr an. Alles steht weiter in der Zeitleiste.' : 'Ich melde mich nur bei Wichtigem: Freigaben, Fehler, Ergebnis.'); return true; }
            if (e.art === 'stumm') { R().setzeStumm(e.an); sag(e.an ? 'Okay, ich bin still. Die Zeitleiste läuft weiter.' : 'Ich melde mich wieder.'); return true; }
            if (e.art === 'spar') { R().setzeSpar(e.an); sag(e.an ? 'Energiesparen ist an: weniger Ansagen, keine Zusatzanimation.' : 'Energiesparen ist aus.'); return true; }
            if (e.art === 'steuer') { var rs = steuere(e.aktion, e.nurWennAktiv); if (rs === null) return false; sag(rs); return true; }
            if (e.art === 'zeigen') { var f = P().finde(e.bezug); if (f.ok) { if (A()) A().zeigeProjekt(f.projekt.id); sag('Hier ist ' + f.projekt.name + '.'); return true; } if (f.art === 'frage') { offen = { art: 'projektwahl', erkannt: e, kand: f.kandidaten, bis: jetzt() + FRAGE_MS }; frageAnmelden(); sag(f.frage); return true; } sag(f.frage); return true; }
            if (!istBereit()) { sag('Das Studio ist auf diesem Gerät noch nicht vollständig geladen.'); return true; }
            if (aktive().some(function (m) { return m.status === 'laeuft'; }) && (e.art === 'webapp' || e.art === 'recherche' || e.art === 'dokument' || e.art === 'aendern' || e.art === 'apk')) { sag('Es läuft schon eine Mission. Sag „Mission abbrechen“ oder warte, bis sie fertig ist.'); return true; }
            if (e.art === 'aendern' || e.art === 'apk') { mitProjekt(e); return true; }
            if (brauchtThema(e)) { offen = { art: 'thema', erkannt: e, bis: jetzt() + FRAGE_MS }; frageAnmelden(); sag(FRAGE[e.art === 'dokument' && e.ausgabe === 'praesentation' ? 'praesentation' : e.art] || 'Worum geht es genau?'); merkeProtokoll('frage_thema', { art: e.art }); return true; }
            if (planStart(e)) return true;
            var r = starteAuftrag(e, null);
            if (!r.ok) sag(r.fehler);
            return true;
        } catch (err) { merkeProtokoll('fehler', { text: String(err && err.message).slice(0, 100) }); return false; }
    }
    function istBereit() { return !!(M() && P() && R() && window.jvStudioWerkzeuge && window.jvStudioDateien); }

    /* ---------- nach einem Neustart: pausierte Studio-Missionen bleiben pausiert; "fortsetzen" setzt sie fort ---------- */
    planLaden();
    window.jvStudioAuftrag = {
        behandle: behandle, erkenne: erkenne, planeSchritte: planeSchritte, starteAuftrag: starteAuftrag, laufen: laufen, freigeben: freigeben,
        steuere: steuere, aktive: aktive, letzte: letzte, istAn: istAn, statusSatz: statusSatz, protokoll: function () { return protokoll.slice(); },
        offeneFreigabe: function () { return freigabeOffen; }, klassifiziere: klassifiziere, ergaenze: ergaenze, dirigent: dirigent, offeneFrage: function () { return offen ? { art: offen.art } : null; },
        plan: function () { return plan ? JSON.parse(JSON.stringify(plan)) : null; }, planStufe: planStufe, planBestaetigen: function () { return !!plan && plan.phase === 'bestaetigung' && planGueltig() && planStarten(); }, planAbbrechen: function () { if (plan) { planWeg(); sag('Alles klar, ich verwerfe den Plan. Es wurde nichts gebaut.'); } return true; },
        _setzeOffen: function (o) { offen = o; }
    };
})();
