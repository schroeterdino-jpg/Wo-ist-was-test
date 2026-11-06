/* ============================================================
   MISSIONS-KERN (Jarvis Studio, Paket M1): das Fundament für lange, mehrstufige Aufträge.
   Er verwaltet Missionen (anlegen, speichern, laden, starten, pausieren, fortsetzen, beenden), führt aber selbst KEINE KI-Aufträge aus,
   ruft keinen Server auf und führt keinen fremden Code aus. Recherche-, Code-, Dokument- und APK-Werkzeuge kommen später (Schnittstelle: jvMission.werkzeuge).

   Zustände einer Mission: geplant, laeuft, wartet_freigabe, pausiert, abgeschlossen, fehlgeschlagen, abgebrochen (die letzten drei sind endgültig).
   Zeit: echte Zeitstempel (Date.now), keine Schätzung. Getrennt erfasst: aktive Zeit, Wartezeit auf Freigabe, Pause, Unterbrechung (App war zu).
   Neustart: Eine Mission, die lief, wird NICHT stillschweigend weitergeführt. Sie wird "pausiert" (Unterbrechung), ihr laufender Schritt "unterbrochen";
     die aktive Zeit zählt nur bis zum letzten Lebenszeichen (herzschlag), der Rest ist "Unterbrechung". Fortsetzen geht nur ausdrücklich, ein Schritt
     läuft nie von selbst noch einmal.
   Schritte: ein Schritt gilt nur als erledigt mit Beleg (Art + Text). Überspringen braucht einen Grund. Ohne Beleg kein "erledigt", keine erfundenen Erfolge.
   Kosten: in Cent, getrennt "geschätzt" (nur wenn jemand eine Schätzung einträgt), "gemeldet" (nur gemeldete Beträge) und "unbekannt" (Anzahl Posten ohne Betrag).
     Es wird nichts erfunden oder verrechnet. Mit Budgetgrenze: Überschreitung hält die laufende Mission an (wartet_freigabe).
   Speicher: localStorage "jv_missionen_v1" (Prüfsumme, Sicherungskopie "…_bak"). Beschädigte Daten werden nicht überschrieben, sondern in "…_defekt" gesichert.
     Bewusst NICHT im Geräte-Abgleich (SYNC_KEYS / api/sync.js); es ändert sich kein bestehendes Speicherformat.
   Grenzen (M1): nur lokal, ein Gerät; zwei gleichzeitig offene Fenster mit denselben Daten sind nicht abgeglichen; höchstens 50 Missionen.
   Braucht: nichts (nur localStorage und Date.now). Anzeige: mission_ansicht.js.
   ============================================================ */
(function () {
    'use strict';
    if (window.jvMission) return;

    const KEY = 'jv_missionen_v1', BAK = 'jv_missionen_v1_bak', DEFEKT = 'jv_missionen_v1_defekt';
    const VERSION = 1, MAX_MISSIONEN = 50, MAX_SCHRITTE = 30, MAX_LOG = 100, MAX_KOSTEN = 200;
    const STATUS = ['geplant', 'laeuft', 'wartet_freigabe', 'pausiert', 'abgeschlossen', 'fehlgeschlagen', 'abgebrochen'];
    const ENDGUELTIG = ['abgeschlossen', 'fehlgeschlagen', 'abgebrochen'];
    const UEBERGAENGE = {
        geplant: ['laeuft', 'abgebrochen'],
        laeuft: ['wartet_freigabe', 'pausiert', 'abgeschlossen', 'fehlgeschlagen', 'abgebrochen'],
        wartet_freigabe: ['laeuft', 'abgebrochen', 'fehlgeschlagen'],
        pausiert: ['laeuft', 'abgebrochen'],
        abgeschlossen: [], fehlgeschlagen: [], abgebrochen: []
    };
    const SCHRITT_STATUS = ['offen', 'laeuft', 'erledigt', 'fehlgeschlagen', 'uebersprungen', 'unterbrochen'];
    const BELEG_ARTEN = ['ergebnis', 'pruefung', 'quelle', 'datei', 'test'];
    const WERKZEUG_ARTEN = ['recherche', 'code', 'dokument', 'apk', 'sonstiges'];

    let zustand = { rev: 0, zaehler: 0, missionen: [] };
    let ladeStatus = 'neu';          // neu | ok | leer | gesichert (aus Sicherungskopie) | defekt (Daten waren beschädigt, leer gestartet)
    let speicherFehler = '';         // Text, solange das letzte Speichern fehlschlug
    let verworfen = 0;               // Anzahl beim Laden verworfener, ungültiger Missionen
    const hoerer = [];
    const werkzeugListe = {};
    const imLauf = {};               // missionId + '/' + schrittId -> true, solange ein Werkzeug diesen Schritt ausführt (keine doppelte Ausführung)
    let letzterHerzschlagSpeichern = 0;

    /* ---------- kleine Helfer ---------- */
    const jetzt = () => Date.now();
    const ganz = n => typeof n === 'number' && isFinite(n) && Math.floor(n) === n;
    const nichtNegativ = n => ganz(n) && n >= 0;
    const kurz = (t, max) => String(t == null ? '' : t).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
    const ok = (extra) => Object.assign({ ok: true }, extra || {});
    const fehl = (code, text) => ({ ok: false, code: code, fehler: text });
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } }
    function hash(s) {   // FNV-1a, nur gegen Beschädigung (keine Sicherheitsfunktion)
        let h = 0x811c9dc5; s = String(s);
        for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0; }
        return h.toString(16);
    }
    function melde(art, id) { hoerer.slice().forEach(f => { try { f(art, id); } catch (e) { } }); }
    function logge(m, ereignis, text) {
        m.log.push({ zeit: jetzt(), ereignis: ereignis, text: kurz(text, 300) });
        if (m.log.length > MAX_LOG) m.log.splice(0, m.log.length - MAX_LOG);
    }
    function neueId(praefix) {
        zustand.zaehler++;
        return praefix + jetzt().toString(36) + zustand.zaehler.toString(36) + Math.floor(Math.random() * 1296).toString(36);
    }

    /* ---------- Prüfen geladener Daten ---------- */
    function pruefeMission(m) {   // true = gültig. Fehlende Teile werden nicht erraten.
        try {
            if (!m || typeof m !== 'object' || typeof m.id !== 'string' || !m.id) return false;
            if (STATUS.indexOf(m.status) < 0) return false;
            if (typeof m.titel !== 'string' || typeof m.auftrag !== 'string') return false;
            if (!ganz(m.erstellt) || !ganz(m.geaendert)) return false;
            const z = m.zeit; if (!z || !nichtNegativ(z.aktivMs) || !nichtNegativ(z.wartezeitMs) || !nichtNegativ(z.pauseMs) || !nichtNegativ(z.unterbrochenMs)) return false;
            if (z.seit !== null && !ganz(z.seit)) return false;
            if (!ganz(m.herzschlag)) return false;
            if (!Array.isArray(m.schritte) || m.schritte.length > MAX_SCHRITTE) return false;
            const ids = {};
            for (const s of m.schritte) {
                if (!s || typeof s.id !== 'string' || ids[s.id] || SCHRITT_STATUS.indexOf(s.status) < 0 || typeof s.titel !== 'string') return false;
                ids[s.id] = true;
                if (s.status === 'erledigt' && !(s.beleg && BELEG_ARTEN.indexOf(s.beleg.art) >= 0 && String(s.beleg.text || '').trim())) return false;   // "erledigt" ohne Beleg gibt es nicht
                if (s.status === 'uebersprungen' && !String(s.grund || '').trim()) return false;
                if (!Array.isArray(s.abhaengigVon)) return false;
            }
            const k = m.kosten; if (!k || !Array.isArray(k.eintraege) || k.eintraege.length > MAX_KOSTEN) return false;
            if (k.budgetCent !== null && !nichtNegativ(k.budgetCent)) return false;
            if (k.geschaetztCent !== null && !nichtNegativ(k.geschaetztCent)) return false;
            for (const e of k.eintraege) if (!e || (e.cent !== null && !nichtNegativ(e.cent))) return false;
            if (!Array.isArray(m.log)) return false;
            return true;
        } catch (e) { return false; }
    }

    /* ---------- Speichern und Laden ---------- */
    function speichern() {
        zustand.rev++;
        let text;
        try {
            const daten = JSON.stringify({ zaehler: zustand.zaehler, missionen: zustand.missionen });
            text = JSON.stringify({ v: VERSION, rev: zustand.rev, gespeichert: jetzt(), summe: hash(daten), daten: daten });
        } catch (e) { speicherFehler = 'Missionen konnten nicht gespeichert werden (Daten nicht lesbar).'; return false; }
        const alt = lsGet(KEY);
        if (alt) lsSet(BAK, alt);   // letzter guter Stand als Sicherung
        if (!lsSet(KEY, text)) { speicherFehler = 'Speicher voll oder gesperrt: Die Missionen sind nur im Arbeitsspeicher und gehen beim Schließen verloren.'; return false; }
        speicherFehler = '';
        return true;
    }
    function lese(text) {   // -> { zaehler, missionen, verworfen } oder null
        try {
            const o = JSON.parse(text);
            if (!o || o.v !== VERSION || typeof o.daten !== 'string' || o.summe !== hash(o.daten)) return null;
            const d = JSON.parse(o.daten);
            if (!d || !Array.isArray(d.missionen)) return null;
            const gut = d.missionen.filter(pruefeMission);
            return { zaehler: ganz(d.zaehler) ? d.zaehler : gut.length, missionen: gut, verworfen: d.missionen.length - gut.length, rev: ganz(o.rev) ? o.rev : 0 };
        } catch (e) { return null; }
    }
    /* Nach einem Neustart: laufende Missionen anhalten (nicht still weiterlaufen lassen), Zeit ehrlich aufteilen. */
    function nachNeustart(m, jetztMs) {
        if (m.status === 'laeuft') {
            const von = m.zeit.seit == null ? jetztMs : m.zeit.seit;
            const bis = Math.min(jetztMs, Math.max(von, m.herzschlag));
            m.zeit.aktivMs += Math.max(0, bis - von);
            m.zeit.unterbrochenMs += Math.max(0, jetztMs - bis);
            m.zeit.seit = jetztMs;
            m.status = 'pausiert';
            m.unterbrochen = true;
            m.schritte.forEach(s => { if (s.status === 'laeuft') { s.status = 'unterbrochen'; s.dauerMs += Math.max(0, bis - (s.start || bis)); s.start = null; } });
            logge(m, 'unterbrochen', 'App war geschlossen oder neu geladen. Mission angehalten, nichts wurde von selbst fortgesetzt.');
        }
    }
    function laden() {
        const roh = lsGet(KEY);
        let r = null;
        if (roh) r = lese(roh);
        if (r) ladeStatus = 'ok';
        else {
            const bak = lsGet(BAK);
            if (roh) { lsSet(DEFEKT, roh); ladeStatus = 'defekt'; }
            r = bak ? lese(bak) : null;
            if (r) ladeStatus = 'gesichert';
            else if (!roh) ladeStatus = 'leer';
        }
        zustand = r ? { rev: r.rev, zaehler: r.zaehler, missionen: r.missionen } : { rev: 0, zaehler: 0, missionen: [] };
        verworfen = r ? r.verworfen : 0;
        const t = jetzt();
        zustand.missionen.forEach(m => nachNeustart(m, t));
        for (const k of Object.keys(imLauf)) delete imLauf[k];
        if (zustand.missionen.length || ladeStatus === 'defekt' || ladeStatus === 'gesichert') speichern();
        melde('geladen');
        return { ok: true, ladeStatus: ladeStatus, anzahl: zustand.missionen.length, verworfen: verworfen };
    }

    /* ---------- Zeit ---------- */
    function zeiten(m) {
        const z = m.zeit, t = jetzt();
        let aktiv = z.aktivMs, warten = z.wartezeitMs, pause = z.pauseMs;
        if (z.seit != null) {
            const d = Math.max(0, t - z.seit);
            if (m.status === 'laeuft') aktiv += d; else if (m.status === 'wartet_freigabe') warten += d; else if (m.status === 'pausiert') pause += d;
        }
        return { aktivMs: aktiv, wartezeitMs: warten, pauseMs: pause, unterbrochenMs: z.unterbrochenMs, gesamtMs: Math.max(0, (m.ende || t) - m.erstellt) };
    }
    /* Schließt den laufenden Zeitabschnitt ab (vor jedem Statuswechsel). Eine rückwärts gestellte Uhr zählt nie negativ. */
    function abschnittSchliessen(m, t) {
        const z = m.zeit;
        if (z.seit != null) {
            const d = t - z.seit;
            if (d < 0) m.uhrSprung = (m.uhrSprung || 0) + 1;
            const dd = Math.max(0, d);
            if (m.status === 'laeuft') z.aktivMs += dd; else if (m.status === 'wartet_freigabe') z.wartezeitMs += dd; else if (m.status === 'pausiert') z.pauseMs += dd;
        }
        z.seit = t;
    }
    function schrittZeitSchliessen(m, s, t) {
        if (s.status === 'laeuft' && s.start != null) s.dauerMs += Math.max(0, t - s.start);
        s.start = null;
    }

    /* ---------- Zustandsautomat ---------- */
    function sucheMission(id) { return zustand.missionen.find(m => m.id === id) || null; }
    function wechsel(m, neu, grund) {
        if (UEBERGAENGE[m.status].indexOf(neu) < 0) return fehl('uebergang', 'Von „' + m.status + '“ geht es nicht nach „' + neu + '“.');
        const t = jetzt();
        abschnittSchliessen(m, t);
        const alt = m.status;
        if (neu !== 'laeuft') m.schritte.forEach(s => { if (s.status === 'laeuft') { schrittZeitSchliessen(m, s, t); s.status = 'unterbrochen'; } });
        m.status = neu; m.geaendert = t; m.herzschlag = t;
        if (ENDGUELTIG.indexOf(neu) >= 0) { m.ende = t; m.zeit.seit = null; }
        if (neu === 'laeuft') m.unterbrochen = false;
        logge(m, alt + ' → ' + neu, grund || '');
        return ok({ mission: m });
    }
    function aendere(id, fn) {   // gemeinsamer Ablauf: finden, ändern, speichern, melden. fn liefert ein Ergebnisobjekt.
        const m = sucheMission(id);
        if (!m) return fehl('unbekannt', 'Diese Mission gibt es nicht.');
        const r = fn(m);
        if (r && r.ok) {
            m.geaendert = jetzt();
            const gespeichert = speichern();
            r.gespeichert = gespeichert;
            if (!gespeichert) r.warnung = speicherFehler;
            r.mission = kopie(m);
            melde('geaendert', id);
        }
        return r;
    }
    function kopie(m) { return JSON.parse(JSON.stringify(m)); }

    /* ---------- Kosten ---------- */
    function kostenSumme(m) {
        let summe = 0, unbekannt = 0;
        m.kosten.eintraege.forEach(e => { if (e.cent === null) unbekannt++; else summe += e.cent; });
        return { gemeldetCent: summe, unbekannt: unbekannt };
    }
    function kostenAnsicht(m) {
        const s = kostenSumme(m), k = m.kosten;
        const ueber = k.budgetCent !== null && s.gemeldetCent > k.budgetCent;
        return { budgetCent: k.budgetCent, geschaetztCent: k.geschaetztCent, gemeldetCent: s.gemeldetCent, unbekannt: s.unbekannt,
                 budgetUeberschritten: ueber, budgetPruefbar: k.budgetCent === null || s.unbekannt === 0,
                 rest: k.budgetCent !== null ? Math.max(0, k.budgetCent - s.gemeldetCent) : null };
    }

    /* ---------- Öffentliche Schnittstelle ---------- */
    function neu(opt) {
        opt = opt || {};
        const titel = kurz(opt.titel, 120), auftrag = kurz(opt.auftrag, 4000);
        if (!titel) return fehl('titel', 'Eine Mission braucht einen Titel.');
        if (!auftrag) return fehl('auftrag', 'Eine Mission braucht einen Auftragstext.');
        if (zustand.missionen.length >= MAX_MISSIONEN) return fehl('zuviele', 'Es gibt schon ' + MAX_MISSIONEN + ' Missionen. Entferne zuerst beendete.');
        const roh = Array.isArray(opt.schritte) ? opt.schritte : [];
        if (roh.length > MAX_SCHRITTE) return fehl('schritte', 'Höchstens ' + MAX_SCHRITTE + ' Schritte.');
        for (const k of ['budgetCent', 'geschaetztCent']) if (opt[k] != null && !nichtNegativ(opt[k])) return fehl('kosten', k + ' muss eine ganze Zahl in Cent sein (0 oder mehr).');
        const t = jetzt();
        const schritte = [], ids = {};
        for (let i = 0; i < roh.length; i++) {
            const r = roh[i] || {}, st = kurz(typeof roh[i] === 'string' ? roh[i] : r.titel, 160);
            if (!st) return fehl('schritt', 'Schritt ' + (i + 1) + ' hat keinen Titel.');
            if (r.werkzeug != null && !/^[a-z][a-z0-9_]{1,40}$/.test(String(r.werkzeug))) return fehl('werkzeug', 'Ungültiger Werkzeugname bei Schritt ' + (i + 1) + '.');
            const sid = 's' + (i + 1);
            ids[sid] = true;
            schritte.push({ id: sid, titel: st, werkzeug: r.werkzeug ? String(r.werkzeug) : null, status: 'offen', abhaengigVon: [], beleg: null, grund: '', fehler: '', start: null, ende: null, dauerMs: 0, versuche: 0 });
        }
        for (let i = 0; i < roh.length; i++) {   // Abhängigkeiten: nur auf frühere Schritte (verhindert Kreise)
            const dep = roh[i] && Array.isArray(roh[i].abhaengigVon) ? roh[i].abhaengigVon : [];
            for (const d of dep) {
                const nr = Number(String(d).replace(/^s/, ''));
                if (!ids[String(d)] || !(nr >= 1 && nr <= i)) return fehl('abhaengig', 'Schritt ' + (i + 1) + ' darf nur von früheren Schritten abhängen.');
                schritte[i].abhaengigVon.push(String(d));
            }
        }
        const m = {
            v: VERSION, id: neueId('m'), titel: titel, auftrag: auftrag, status: 'geplant', erstellt: t, geaendert: t, ende: null, herzschlag: t, unterbrochen: false,
            zeit: { aktivMs: 0, wartezeitMs: 0, pauseMs: 0, unterbrochenMs: 0, seit: t },
            schritte: schritte,
            kosten: { budgetCent: opt.budgetCent != null ? opt.budgetCent : null, geschaetztCent: opt.geschaetztCent != null ? opt.geschaetztCent : null, eintraege: [] },
            log: []
        };
        m.zeit.seit = null;   // vor dem Start läuft keine Missionszeit
        logge(m, 'angelegt', 'Mission angelegt (' + schritte.length + ' Schritte).');
        zustand.missionen.push(m);
        const gespeichert = speichern();
        melde('neu', m.id);
        return ok({ mission: kopie(m), gespeichert: gespeichert, warnung: gespeichert ? '' : speicherFehler });
    }
    function starten(id) {
        return aendere(id, m => {
            if (m.status !== 'geplant') return fehl('uebergang', 'Nur eine geplante Mission kann gestartet werden.');
            if (!m.schritte.length) return fehl('keineSchritte', 'Ohne Schritte kann die Mission nicht starten.');
            const ka = kostenAnsicht(m);
            if (ka.budgetUeberschritten) return fehl('budget', 'Das Budget ist schon überschritten.');
            return wechsel(m, 'laeuft', 'gestartet');
        });
    }
    function pausieren(id) { return aendere(id, m => wechsel(m, 'pausiert', 'pausiert')); }
    function fortsetzen(id) {
        return aendere(id, m => {
            if (m.status !== 'pausiert') return fehl('uebergang', 'Nur eine pausierte Mission kann fortgesetzt werden.');
            if (kostenAnsicht(m).budgetUeberschritten) return fehl('budget', 'Das Budget ist überschritten. Erhöhe es zuerst (Freigabe).');
            return wechsel(m, 'laeuft', 'fortgesetzt');
        });
    }
    function freigabeAnfordern(id, grund) {
        return aendere(id, m => {
            const g = kurz(grund, 300); if (!g) return fehl('grund', 'Nenne, wofür die Freigabe nötig ist.');
            m.freigabeFuer = g;
            return wechsel(m, 'wartet_freigabe', 'Freigabe nötig: ' + g);
        });
    }
    function freigeben(id, opt) {
        return aendere(id, m => {
            if (m.status !== 'wartet_freigabe') return fehl('uebergang', 'Es wartet nichts auf Freigabe.');
            opt = opt || {};
            if (opt.budgetCent != null) { if (!nichtNegativ(opt.budgetCent)) return fehl('kosten', 'Budget muss eine ganze Zahl in Cent sein.'); m.kosten.budgetCent = opt.budgetCent; }
            if (kostenAnsicht(m).budgetUeberschritten) return fehl('budget', 'Das Budget ist überschritten. Setze ein höheres Budget, sonst läuft die Mission nicht weiter.');
            m.freigabeFuer = '';
            return wechsel(m, 'laeuft', 'freigegeben');
        });
    }
    function abschliessen(id) {
        return aendere(id, m => {
            if (m.status !== 'laeuft') return fehl('uebergang', 'Nur eine laufende Mission kann abgeschlossen werden.');
            if (!m.schritte.length) return fehl('keineSchritte', 'Ohne Schritte gibt es nichts abzuschließen.');
            const offen = m.schritte.filter(s => s.status !== 'erledigt' && s.status !== 'uebersprungen');
            if (offen.length) return fehl('offeneSchritte', 'Noch nicht fertig: ' + offen.map(s => s.titel).join(', ') + '.');
            return wechsel(m, 'abgeschlossen', 'alle Schritte erledigt oder bewusst übersprungen');
        });
    }
    function fehlschlagen(id, grund) {
        return aendere(id, m => {
            const g = kurz(grund, 300); if (!g) return fehl('grund', 'Nenne den Grund des Scheiterns.');
            m.fehlergrund = g;
            return wechsel(m, 'fehlgeschlagen', g);
        });
    }
    function abbrechen(id, grund) {
        return aendere(id, m => { m.abbruchgrund = kurz(grund, 300); return wechsel(m, 'abgebrochen', kurz(grund, 300) || 'abgebrochen'); });
    }
    function entfernen(id) {
        const m = sucheMission(id);
        if (!m) return fehl('unbekannt', 'Diese Mission gibt es nicht.');
        if (ENDGUELTIG.indexOf(m.status) < 0) return fehl('nichtBeendet', 'Nur beendete Missionen können entfernt werden. Brich sie zuerst ab.');
        zustand.missionen = zustand.missionen.filter(x => x.id !== id);
        const gespeichert = speichern();
        melde('entfernt', id);
        return ok({ gespeichert: gespeichert });
    }

    /* ---------- Schritte ---------- */
    function sucheSchritt(m, sid) { return m.schritte.find(s => s.id === sid) || null; }
    function schrittStarten(id, sid) {
        return aendere(id, m => {
            if (m.status !== 'laeuft') return fehl('nichtLaufend', 'Die Mission läuft nicht. Schritte starten nur in einer laufenden Mission.');
            const s = sucheSchritt(m, sid); if (!s) return fehl('unbekannt', 'Diesen Schritt gibt es nicht.');
            if (s.status !== 'offen' && s.status !== 'unterbrochen') return fehl('schrittStatus', 'Dieser Schritt ist „' + s.status + '“ und kann nicht gestartet werden.');
            if (m.schritte.some(x => x.status === 'laeuft')) return fehl('belegt', 'Es läuft schon ein anderer Schritt.');
            const offenDep = s.abhaengigVon.filter(d => { const x = sucheSchritt(m, d); return !x || (x.status !== 'erledigt' && x.status !== 'uebersprungen'); });
            if (offenDep.length) return fehl('abhaengig', 'Zuerst müssen diese Schritte fertig sein: ' + offenDep.join(', ') + '.');
            const t = jetzt();
            s.versuche++; s.status = 'laeuft'; s.start = t; s.fehler = '';
            logge(m, 'schritt', s.titel + ' gestartet (Versuch ' + s.versuche + ')');
            return ok();
        });
    }
    function pruefeBeleg(b) {
        if (!b || typeof b !== 'object') return 'Ohne Beleg gilt ein Schritt nicht als erledigt.';
        if (BELEG_ARTEN.indexOf(b.art) < 0) return 'Belegart muss eine von ' + BELEG_ARTEN.join(', ') + ' sein.';
        if (kurz(b.text, 2000).length < 3) return 'Der Beleg braucht einen Text (was wurde geprüft oder geliefert?).';
        return '';
    }
    function schrittErledigt(id, sid, beleg) {
        return aendere(id, m => {
            const s = sucheSchritt(m, sid); if (!s) return fehl('unbekannt', 'Diesen Schritt gibt es nicht.');
            if (m.status !== 'laeuft') return fehl('nichtLaufend', 'Die Mission läuft nicht.');
            if (s.status !== 'laeuft') return fehl('schrittStatus', 'Nur ein laufender Schritt kann erledigt werden.');
            const e = pruefeBeleg(beleg); if (e) return fehl('beleg', e);
            const t = jetzt();
            schrittZeitSchliessen(m, s, t);
            s.status = 'erledigt'; s.ende = t;
            s.beleg = { art: beleg.art, text: kurz(beleg.text, 2000), ref: beleg.ref ? kurz(beleg.ref, 300) : '', zeit: t };
            logge(m, 'schritt', s.titel + ' erledigt (Beleg: ' + beleg.art + ')');
            return ok();
        });
    }
    function schrittFehler(id, sid, grund) {
        return aendere(id, m => {
            const s = sucheSchritt(m, sid); if (!s) return fehl('unbekannt', 'Diesen Schritt gibt es nicht.');
            if (s.status !== 'laeuft') return fehl('schrittStatus', 'Nur ein laufender Schritt kann fehlschlagen.');
            const g = kurz(grund, 300); if (!g) return fehl('grund', 'Nenne den Grund.');
            const t = jetzt(); schrittZeitSchliessen(m, s, t);
            s.status = 'fehlgeschlagen'; s.ende = t; s.fehler = g;
            logge(m, 'schritt', s.titel + ' fehlgeschlagen: ' + g);
            return ok();
        });
    }
    function schrittUeberspringen(id, sid, grund) {
        return aendere(id, m => {
            const s = sucheSchritt(m, sid); if (!s) return fehl('unbekannt', 'Diesen Schritt gibt es nicht.');
            if (m.status !== 'laeuft' && m.status !== 'pausiert') return fehl('nichtLaufend', 'Nur in einer laufenden oder pausierten Mission.');
            if (s.status !== 'offen' && s.status !== 'unterbrochen' && s.status !== 'fehlgeschlagen') return fehl('schrittStatus', 'Dieser Schritt ist „' + s.status + '“.');
            const g = kurz(grund, 300); if (!g) return fehl('grund', 'Zum Überspringen gehört ein Grund.');
            s.status = 'uebersprungen'; s.grund = g; s.ende = jetzt();
            logge(m, 'schritt', s.titel + ' übersprungen: ' + g);
            return ok();
        });
    }

    /* ---------- Kosten (öffentlich) ---------- */
    function kostenMelden(id, opt) {
        return aendere(id, m => {
            opt = opt || {};
            if (ENDGUELTIG.indexOf(m.status) >= 0) return fehl('beendet', 'Die Mission ist beendet.');
            if (opt.cent !== null && !nichtNegativ(opt.cent)) return fehl('kosten', 'Kosten sind eine ganze Zahl in Cent oder null (unbekannt). Es werden keine Beträge geschätzt oder erfunden.');
            if (m.kosten.eintraege.length >= MAX_KOSTEN) return fehl('zuviele', 'Zu viele Kostenposten.');
            const quelle = kurz(opt.quelle, 60); if (!quelle) return fehl('quelle', 'Woher stammt die Kostenangabe?');
            m.kosten.eintraege.push({ zeit: jetzt(), cent: opt.cent, quelle: quelle, notiz: kurz(opt.notiz, 200), schritt: opt.schritt ? kurz(opt.schritt, 20) : '' });
            logge(m, 'kosten', opt.cent === null ? 'Kosten unbekannt gemeldet (' + quelle + ')' : opt.cent + ' Cent gemeldet (' + quelle + ')');
            const ka = kostenAnsicht(m);
            const r = ok({ kosten: ka });
            if (ka.budgetUeberschritten && m.status === 'laeuft') {   // Budget gerissen: sofort anhalten, Freigabe nötig
                m.freigabeFuer = 'Budget überschritten (' + ka.gemeldetCent + ' von ' + ka.budgetCent + ' Cent)';
                wechsel(m, 'wartet_freigabe', m.freigabeFuer);
                r.angehalten = true;
            }
            return r;
        });
    }
    function kostenSchaetzung(id, cent) {
        return aendere(id, m => {
            if (cent !== null && !nichtNegativ(cent)) return fehl('kosten', 'Eine Schätzung ist eine ganze Zahl in Cent oder null (unbekannt).');
            m.kosten.geschaetztCent = cent; logge(m, 'kosten', 'Schätzung ' + (cent === null ? 'gelöscht' : cent + ' Cent')); return ok();
        });
    }
    function budgetSetzen(id, cent) {
        return aendere(id, m => {
            if (cent !== null && !nichtNegativ(cent)) return fehl('kosten', 'Budget ist eine ganze Zahl in Cent oder null (keine Grenze).');
            if (ENDGUELTIG.indexOf(m.status) >= 0) return fehl('beendet', 'Die Mission ist beendet.');
            m.kosten.budgetCent = cent; logge(m, 'kosten', 'Budget ' + (cent === null ? 'aufgehoben' : cent + ' Cent')); return ok();
        });
    }
    /* Vorab-Frage eines späteren Werkzeugs: darf es diesen Betrag ausgeben? Unbekannte Kosten sind bei gesetztem Budget NICHT erlaubt (nicht prüfbar). */
    function darfAusgeben(id, cent) {
        const m = sucheMission(id); if (!m) return { erlaubt: false, grund: 'Diese Mission gibt es nicht.' };
        if (m.status !== 'laeuft') return { erlaubt: false, grund: 'Die Mission läuft nicht.' };
        const ka = kostenAnsicht(m);
        if (ka.budgetCent === null) return { erlaubt: true, grund: 'kein Budget gesetzt' };
        if (cent === null || cent === undefined) return { erlaubt: false, grund: 'Kosten unbekannt, mit gesetztem Budget nicht prüfbar.' };
        if (!nichtNegativ(cent)) return { erlaubt: false, grund: 'Ungültiger Betrag.' };
        if (!ka.budgetPruefbar) return { erlaubt: false, grund: 'Es gibt Kostenposten ohne Betrag, das Budget ist nicht prüfbar.' };
        return ka.gemeldetCent + cent <= ka.budgetCent ? { erlaubt: true, grund: 'im Budget' } : { erlaubt: false, grund: 'würde das Budget überschreiten' };
    }

    /* ---------- Werkzeug-Schnittstelle (nur der Rahmen, keine echten Werkzeuge in M1) ---------- */
    function werkzeugRegistrieren(w) {
        if (!w || !/^[a-z][a-z0-9_]{1,40}$/.test(String(w.name || ''))) return fehl('werkzeug', 'Ungültiger Werkzeugname.');
        if (WERKZEUG_ARTEN.indexOf(w.art) < 0) return fehl('werkzeug', 'Art muss eine von ' + WERKZEUG_ARTEN.join(', ') + ' sein.');
        if (typeof w.ausfuehren !== 'function') return fehl('werkzeug', 'Ein Werkzeug braucht eine Funktion „ausfuehren“.');
        if (werkzeugListe[w.name]) return fehl('doppelt', 'Dieses Werkzeug ist schon registriert.');
        werkzeugListe[w.name] = { name: w.name, art: w.art, beschreibung: kurz(w.beschreibung, 300), ausfuehren: w.ausfuehren };
        return ok();
    }
    /* Führt EINEN Schritt mit seinem Werkzeug aus. Das Werkzeug muss { beleg:{art,text}, kostenCent } liefern, sonst gilt der Schritt als fehlgeschlagen.
       Kein automatischer zweiter Versuch, nie zwei gleichzeitige Ausführungen desselben Schritts. */
    async function fuehreSchrittAus(id, sid, kontext) {
        const m0 = sucheMission(id); if (!m0) return fehl('unbekannt', 'Diese Mission gibt es nicht.');
        const s0 = sucheSchritt(m0, sid); if (!s0) return fehl('unbekannt', 'Diesen Schritt gibt es nicht.');
        const w = s0.werkzeug ? werkzeugListe[s0.werkzeug] : null;
        if (!w) return fehl('keinWerkzeug', 'Für diesen Schritt ist kein Werkzeug registriert.');
        const schluessel = id + '/' + sid;
        if (imLauf[schluessel]) return fehl('doppelt', 'Dieser Schritt wird gerade schon ausgeführt.');
        const erlaubt = darfAusgeben(id, kontext && kontext.erwarteteKostenCent !== undefined ? kontext.erwarteteKostenCent : 0);
        if (!erlaubt.erlaubt && m0.kosten.budgetCent !== null) return fehl('budget', 'Nicht ausgeführt: ' + erlaubt.grund);
        const start = schrittStarten(id, sid); if (!start.ok) return start;
        imLauf[schluessel] = true;
        let erg = null, problem = '';
        try { erg = await w.ausfuehren({ mission: kopie(sucheMission(id)), schritt: sid, kontext: kontext || {} }); }
        catch (e) { problem = 'Das Werkzeug ist abgestürzt: ' + kurz(e && e.message, 200); }
        finally { delete imLauf[schluessel]; }
        if (!problem && erg && Object.prototype.hasOwnProperty.call(erg, 'kostenCent')) {
            const k = kostenMelden(id, { cent: erg.kostenCent === undefined ? null : erg.kostenCent, quelle: w.name, schritt: sid });
            if (!k.ok && !problem) problem = k.fehler;
        }
        const aktuell = sucheMission(id);
        if (!aktuell || aktuell.status !== 'laeuft') return fehl('nichtMehrLaufend', 'Die Mission wurde währenddessen angehalten. Das Ergebnis wurde nicht übernommen.');
        if (problem) return schrittFehler(id, sid, problem);
        if (!erg || !erg.ok) return schrittFehler(id, sid, kurz(erg && erg.fehler, 300) || 'Das Werkzeug meldete einen Fehler.');
        const e = pruefeBeleg(erg.beleg);
        if (e) return schrittFehler(id, sid, 'Das Werkzeug lieferte keinen gültigen Beleg: ' + e);
        return schrittErledigt(id, sid, erg.beleg);
    }

    /* ---------- Lebenszeichen ---------- */
    function herzschlag() {   // die Ansicht ruft das regelmäßig auf; gespeichert wird höchstens alle 10 Sekunden
        const t = jetzt();
        let laufend = false;
        zustand.missionen.forEach(m => { if (m.status === 'laeuft') { m.herzschlag = Math.max(m.herzschlag, t); laufend = true; } });
        if (laufend && t - letzterHerzschlagSpeichern >= 10000) { letzterHerzschlagSpeichern = t; speichern(); }
        return laufend;
    }

    /* ---------- Lesen ---------- */
    function ansicht(m) { return Object.assign(kopie(m), { zeiten: zeiten(m), kostenAnsicht: kostenAnsicht(m), moeglich: UEBERGAENGE[m.status].slice() }); }
    function liste() { return zustand.missionen.map(ansicht); }
    function hole(id) { const m = sucheMission(id); return m ? ansicht(m) : null; }
    function status() { return { ladeStatus: ladeStatus, speicherFehler: speicherFehler, verworfen: verworfen, anzahl: zustand.missionen.length, rev: zustand.rev }; }

    window.jvMission = {
        version: VERSION, STATUS: STATUS.slice(), UEBERGAENGE: JSON.parse(JSON.stringify(UEBERGAENGE)), BELEG_ARTEN: BELEG_ARTEN.slice(),
        neu: neu, starten: starten, pausieren: pausieren, fortsetzen: fortsetzen, freigabeAnfordern: freigabeAnfordern, freigeben: freigeben,
        abschliessen: abschliessen, fehlschlagen: fehlschlagen, abbrechen: abbrechen, entfernen: entfernen,
        schrittStarten: schrittStarten, schrittErledigt: schrittErledigt, schrittFehler: schrittFehler, schrittUeberspringen: schrittUeberspringen,
        kostenMelden: kostenMelden, kostenSchaetzung: kostenSchaetzung, budgetSetzen: budgetSetzen, darfAusgeben: darfAusgeben,
        werkzeuge: { registriere: werkzeugRegistrieren, liste: function () { return Object.keys(werkzeugListe).map(k => ({ name: k, art: werkzeugListe[k].art, beschreibung: werkzeugListe[k].beschreibung })); } },
        fuehreSchrittAus: fuehreSchrittAus,
        herzschlag: herzschlag, liste: liste, hole: hole, status: status, laden: laden, zeiten: function (id) { const m = sucheMission(id); return m ? zeiten(m) : null; },
        an: function (f) { if (typeof f === 'function') hoerer.push(f); }, ab: function (f) { const i = hoerer.indexOf(f); if (i >= 0) hoerer.splice(i, 1); }
    };
    laden();
})();
