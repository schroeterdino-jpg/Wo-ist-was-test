/* ============================================================
   KENNENLERN-FRAGEN: Nova stellt dir von selbst ab und zu EINE Frage, damit sie dich besser kennenlernt.
   - Höchstens 2 Fragen pro Tag, mindestens 2,5 Stunden Abstand, nur zwischen 9 und 20:30 Uhr.
   - Nur wenn Ruhe ist (wie bei zane_redet.js): App sichtbar, nichts läuft, du hast eine Minute nichts getippt oder gesagt,
     keine Ruhezeit (wachter.js) und "Nova meldet sich von selbst" ist an.
   - Die KI denkt sich die Frage selbst aus: passend zu dem, was Nova schon über dich weiß (Langzeitgedächtnis), zu Wochentag und Tageszeit,
     ohne Wiederholung ("schon gefragt"). Nichts zu Gesundheit, Geld, Religion, Politik, Alter. Fällt die KI aus, nimmt Nova eine Frage aus einer festen Liste (40 Stück).
   - Nach der Frage öffnet sich das Mikrofon. Deine Antwort wird als kurzer Satz im Langzeitgedächtnis gespeichert (Kategorie Vorliebe).
     Sagst du etwas ganz anderes (einen Befehl), läuft das ganz normal weiter und die Frage verfällt.
     Sensibles (Gesundheit, Geld, Religion, Politik, Sexualität ...) speichert Nova nicht.
   - Sprache: "Stell mir eine Frage" / "Frag mich was" (sofort eine), "Kennenlern-Fragen aus" / "an", "Frag mich nicht mehr",
     "Überspringen" / "Lieber nicht" / "Weiß ich nicht" als Antwort auf eine Frage.
   - Alles Gespeicherte siehst du im Fenster "Langzeitgedächtnis" und kannst es dort einzeln löschen.
   Braucht: voice.js (speak, startListening, isSpeaking), storage.js (apiFetch, getPersistentData), commands.js, wachter.js, api/memory.js, api/groq.
   Nach zane_redet.js laden.
   ============================================================ */
(function () {
    'use strict';
    var ON_KEY = 'jv_kennen_an', LOG_KEY = 'jv_kennen_log', ASKED_KEY = 'jv_kennen_gefragt';
    var MAX_PRO_TAG = 2, ABSTAND_MS = 150 * 60000, RUHE_MS = 60000, ERST_MS = 4 * 60000;
    var VON_H = 9, BIS_H = 20.5, ANTWORT_MS = 3 * 60000;

    function get(k, d) { try { var v = getPersistentData(k, d); return v == null ? d : v; } catch (e) { return d; } }
    function set(k, v) { try { setPersistentData(k, v); } catch (e) {} }
    function heute() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }
    function stundeJetzt() {
        var p = new Intl.DateTimeFormat('de-DE', { hour: 'numeric', minute: 'numeric', hourCycle: 'h23', timeZone: 'Europe/Berlin' }).formatToParts(new Date()), h = 0, m = 0;
        p.forEach(function (x) { if (x.type === 'hour') h = Number(x.value); if (x.type === 'minute') m = Number(x.value); });
        return h + m / 60;
    }
    function an() { return get(ON_KEY, '1') !== '0'; }
    function name() { try { return (typeof currentUserName === 'string' && currentUserName) || 'Dino'; } catch (e) { return 'Dino'; } }
    function sag(t, modus) { try { speak(t, modus === true ? function () { try { startListening(true); } catch (e) {} } : (modus === 'still' ? undefined : (typeof continueConversation === 'function' ? continueConversation : undefined))); } catch (e) { console.error('Kennenlernen', e); } }
    function card(l) { try { if (typeof showActionCards === 'function') showActionCards(l); } catch (e) {} }

    /* ---------- Fragenliste: id, Thema, Frage ---------- */
    var FRAGEN = [
        ['k01', 'Kaffee', 'Trinkst du morgens eher Kaffee, Tee oder gar nichts?'],
        ['k02', 'Frühstück', 'Was isst du am liebsten zum Frühstück?'],
        ['k03', 'Lieblingsessen', 'Was ist dein absolutes Lieblingsessen?'],
        ['k04', 'Kochen', 'Kochst du gern selbst, oder ist es eher Pflicht?'],
        ['k05', 'Musik', 'Welche Musik hörst du am liebsten, zum Beispiel im Auto?'],
        ['k06', 'Lieblingskünstler', 'Gibt es einen Sänger oder eine Band, die du immer wieder hörst?'],
        ['k07', 'Filme', 'Welche Filme oder Serien schaust du am liebsten?'],
        ['k08', 'Hobbys', 'Was machst du in deiner Freizeit am liebsten?'],
        ['k09', 'Garten', 'Was gefällt dir am Garten am besten, oder was machst du dort am liebsten?'],
        ['k10', 'Urlaub', 'Wohin würdest du am liebsten mal wieder verreisen?'],
        ['k11', 'Urlaubsart', 'Bist du im Urlaub eher der Strandtyp, der Städtereisende oder der Wanderer?'],
        ['k12', 'Traumziel', 'Gibt es ein Reiseziel, das du unbedingt noch sehen willst?'],
        ['k13', 'Auto', 'Was für ein Auto fährst du, und was gefällt dir daran?'],
        ['k14', 'Arbeitsweg', 'Wie ist dein Arbeitsweg, hörst du da etwas Bestimmtes?'],
        ['k15', 'Morgenmensch', 'Bist du eher Frühaufsteher oder Nachteule, wenn du dir die Zeit aussuchen dürftest?'],
        ['k16', 'Frühschicht', 'Was machst du nach der Frühschicht, um abzuschalten?'],
        ['k17', 'Spätschicht', 'Was machst du vor der Spätschicht am Vormittag am liebsten?'],
        ['k18', 'Wochenende', 'Wie sieht ein perfektes freies Wochenende für dich aus?'],
        ['k19', 'Sport', 'Machst du irgendeinen Sport, oder schaust du lieber zu?'],
        ['k20', 'Lieblingsverein', 'Hast du einen Lieblingsverein oder eine Lieblingssportart zum Zuschauen?'],
        ['k21', 'Tiere', 'Hast du Haustiere, oder hättest du gern welche?'],
        ['k22', 'Wetter', 'Welches Wetter magst du am liebsten?'],
        ['k23', 'Jahreszeit', 'Welche Jahreszeit ist deine liebste?'],
        ['k24', 'Handy', 'Wofür nutzt du dein Handy am meisten?'],
        ['k25', 'Technik', 'Bastelst du gern an Technik oder an Dingen im Haus?'],
        ['k26', 'Smarthome', 'Hast du schon etwas Smartes zu Hause, zum Beispiel Licht oder Heizung per App?'],
        ['k27', 'Solar', 'Beschäftigst du dich mit Solarstrom oder Energiesparen zu Hause?'],
        ['k28', 'Einkaufen', 'Wo kaufst du meistens ein, und gehst du lieber spontan oder mit Liste?'],
        ['k29', 'Lieblingsgetränk', 'Was trinkst du abends am liebsten?'],
        ['k30', 'Ordnung', 'Bist du eher der Ordentliche oder der Kreative mit etwas Chaos?'],
        ['k31', 'Lesen', 'Liest du gern, und wenn ja, was?'],
        ['k32', 'Spiele', 'Spielst du gern etwas, am Handy, am PC oder Brettspiele?'],
        ['k33', 'Familie', 'Was unternimmst du gern mit deiner Familie?'],
        ['k34', 'Feiern', 'Feierst du lieber groß oder im kleinen Kreis?'],
        ['k35', 'Kindheit', 'Was war als Kind dein Lieblingsplatz oder deine liebste Beschäftigung?'],
        ['k36', 'Wunschprojekt', 'Gibt es ein Projekt zu Hause oder im Garten, das du unbedingt mal angehen willst?'],
        ['k37', 'Lieblingsort', 'Wo in deiner Umgebung bist du am liebsten?'],
        ['k38', 'Lieblingssatz', 'Gibt es einen Spruch oder ein Wort, das du oft benutzt?'],
        ['k39', 'Nova', 'Was soll ich dir im Alltag am meisten abnehmen?'],
        ['k40', 'Tagesablauf', 'Welche Tageszeit ist für dich die beste, wenn du Ruhe zum Nachdenken hast?']
    ];
    function fragenListe() { return FRAGEN.map(function (f) { return { id: f[0], thema: f[1], text: f[2] }; }); }

    /* ---------- Tageslimit und Gefragtes ---------- */
    function log() { try { var l = JSON.parse(get(LOG_KEY, '{}')); return (l && l.tag === heute()) ? l : { tag: heute(), n: 0, last: 0 }; } catch (e) { return { tag: heute(), n: 0, last: 0 }; } }
    function logSave(l) { set(LOG_KEY, JSON.stringify(l)); }
    function gefragt() { try { var a = JSON.parse(get(ASKED_KEY, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function gefragtMerken(id) { var a = gefragt(); if (a.indexOf(id) < 0) a.push(id); set(ASKED_KEY, JSON.stringify(a.slice(-200))); }

    /* ---------- Wann darf Nova fragen? ---------- */
    var geoeffnet = Date.now(), letzteAktion = Date.now(), laeuft = false, pending = null;
    ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) { document.addEventListener(ev, function () { letzteAktion = Date.now(); }, { passive: true, capture: true }); });

    function ruhig() {
        try {
            if (document.hidden) return false;
            if (typeof isRecording !== 'undefined' && isRecording) return false;
            if (typeof isProcessing !== 'undefined' && isProcessing) return false;
            if (typeof isSpeaking === 'function' && isSpeaking()) return false;
            if (typeof isPanelOpen === 'function' && isPanelOpen()) return false;
            if (typeof wachterEnabled === 'function' && !wachterEnabled()) return false;
            if (typeof wachterQuiet === 'function' && wachterQuiet()) return false;
            if (window.jvPraesentation && window.jvPraesentation.laeuft) return false;
            if (typeof interpreter !== 'undefined' && interpreter) return false;
        } catch (e) {}
        return Date.now() - letzteAktion >= RUHE_MS;
    }
    function zeitFenster() { var h = stundeJetzt(); return h >= VON_H && h < BIS_H; }

    /* ---------- Frage auswählen ---------- */
    function bekanntes() {
        if (typeof apiFetch !== 'function') return Promise.resolve([]);
        return apiFetch('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list', limit: 30 }) })
            .then(function (r) { return r.json(); })
            .then(function (d) { return ((d && d.treffer) || []).map(function (t) { return String(t.text || '').slice(0, 200); }).filter(Boolean); })
            .catch(function () { return []; });
    }
    function zufall(a) { return a[Math.floor(Math.random() * a.length)]; }
    function mischen(a) { var b = a.slice(); for (var i = b.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = b[i]; b[i] = b[j]; b[j] = t; } return b; }

    /* Die KI denkt sich die Frage selbst aus: passend zu dem, was Nova schon über dich weiß, und zu Wochentag und Tageszeit.
       Fällt die KI aus, nimmt Nova eine Frage aus der festen Liste oben. */
    var TEXTE_KEY = 'jv_kennen_texte';
    var SENSIBEL_RX = /krank|gesundheit|arzt|medikament|diagnose|schulden|gehalt|verdien|geld|einkommen|steuer|politik|partei|wähl|religi|glaub|gott|sex|polizei|straf|gericht|missbrauch|depress|therapie|alter\b|wie alt/i;
    function gefragteTexte() { try { var a = JSON.parse(get(TEXTE_KEY, '[]')); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
    function textMerken(t) { var a = gefragteTexte(); a.push(String(t).slice(0, 200)); set(TEXTE_KEY, JSON.stringify(a.slice(-40))); }
    function tageszeit() { var h = stundeJetzt(); return h < 11 ? 'Vormittag' : h < 14 ? 'Mittag' : h < 18 ? 'Nachmittag' : 'Abend'; }
    function wochentag() { return new Intl.DateTimeFormat('de-DE', { weekday: 'long', timeZone: 'Europe/Berlin' }).format(new Date()); }

    function erfinde(bek) {
        if (typeof apiFetch !== 'function') return Promise.resolve(null);
        var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 12000);
        var system = 'Du bist Nova, der persönliche Sprachassistent von ' + name() + '. Du möchtest ihn besser kennenlernen und stellst ihm JETZT eine einzige Frage, die du dir selbst ausdenkst. ' +
            'Regeln: Deutsch, duzen, wie ein neugieriger, netter Kumpel. Genau EINE Frage, höchstens 25 Wörter, laut vorgelesen, ohne Emojis, ohne Anführungszeichen, mit Fragezeichen am Ende. ' +
            'Frage über Alltag, Vorlieben, Hobbys, Essen, Musik, Filme, Reisen, Auto, Garten, Familienunternehmungen, Wünsche und Pläne, Gewohnheiten, Lieblingsorte, Technik. ' +
            'Wenn in "bekannt" etwas steht, kannst du daran anknüpfen und tiefer fragen ("Du hast mal erwähnt, dass ... Wie ...?"), oder ein neues Thema wählen. ' +
            'Frage NIE nach etwas, das schon in "bekannt" beantwortet ist, und stelle keine Frage, die ähnlich zu "schon_gefragt" ist. ' +
            'NIEMALS fragen nach: Gesundheit, Krankheit, Geld, Schulden, Gehalt, Politik, Religion, Sexualität, Straftaten, Alter, Details zu Kindern. ' +
            'Behaupte nichts, was nicht in "bekannt" steht. Passe dich an Wochentag und Tageszeit an (kein "Guten Morgen" am Abend). ' +
            'Antworte NUR mit JSON: {"frage":"...","thema":"ein Wort"}.';
        return apiFetch('/api/groq', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
            body: JSON.stringify({
                model: 'openai/gpt-oss-120b', response_format: { type: 'json_object' },
                messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ bekannt: bek, schon_gefragt: gefragteTexte().slice(-25), wochentag: wochentag(), tageszeit: tageszeit() }) }]
            })
        }).then(function (r) { return r.json(); }).then(function (j) {
            var p = JSON.parse(j.choices[0].message.content), f = String(p.frage || '').replace(/["„“”]/g, '').replace(/\s+/g, ' ').trim();
            if (f.length < 12 || f.length > 220 || f.charAt(f.length - 1) !== '?' || SENSIBEL_RX.test(f)) return null;
            return { id: 'ki_' + Date.now(), thema: String(p.thema || 'Kennenlernen').slice(0, 30), text: f };
        }).catch(function () { return null; }).then(function (x) { clearTimeout(to); return x; });
    }

    function ausListe() {
        var schon = gefragt();
        var offen = fragenListe().filter(function (f) { return schon.indexOf(f.id) < 0; });
        return offen.length ? zufall(offen) : null;
    }
    function waehle() {
        return bekanntes().then(function (bek) { return erfinde(bek); }).then(function (f) { return f || ausListe(); });
    }

    function stelle(erzwingen) {
        if (laeuft || pending) return;
        laeuft = true;
        waehle().then(function (f) {
            laeuft = false;
            if (!f) { if (erzwingen) sag('Mir fällt gerade keine gute Frage ein. Erzähl mir einfach selbst, was dir einfällt.'); return; }
            if (!erzwingen && !ruhig()) return;   // inzwischen ist etwas los: beim nächsten Takt wieder
            if (!erzwingen) { var l = log(); l.n++; l.last = Date.now(); logSave(l); }
            pending = { id: f.id, thema: f.thema, frage: f.text, t: Date.now() };
            textMerken(f.text);
            try { if (Array.isArray(chatHistory)) chatHistory.push({ role: 'assistant', content: JSON.stringify({ type: 'chat', reply: f.text }) }); } catch (e) {}
            sag(f.text, true);
        }).catch(function () { laeuft = false; });
    }

    function takt() {
        if (pending && Date.now() - pending.t > ANTWORT_MS) pending = null;   // keine Antwort bekommen: Frage verfällt (bleibt aber für später erlaubt)
        if (!an() || laeuft || pending) return;
        var l = log();
        if (l.n >= MAX_PRO_TAG) return;
        if (Date.now() - geoeffnet < ERST_MS) return;
        if (l.last && Date.now() - l.last < ABSTAND_MS) return;
        if (!zeitFenster() || !ruhig()) return;
        stelle(false);
    }
    setInterval(takt, 30000);

    /* ---------- Antwort verstehen und merken ---------- */
    var SKIP_RX = /^(?:überspring\w*|lieber nicht|weiß (?:ich )?nicht|weiss (?:ich )?nicht|keine ahnung|dazu sag ich nichts|das sag ich nicht|nächste frage|naechste frage|frag was anderes|später|spaeter|jetzt nicht|nein danke|lass(?:e)? (?:es|das))(?: bitte| mal| jetzt)?$/;
    var STOP_RX = /^(?:frag mich nicht mehr|keine fragen mehr|hör auf mich zu fragen|hoer auf mich zu fragen|stell(?:e)? keine fragen mehr)$/;

    function antwortAuswerten(text, frage) {
        if (typeof apiFetch !== 'function') return Promise.resolve(null);
        var ctl = new AbortController(), to = setTimeout(function () { ctl.abort(); }, 12000);
        var system = 'Nova (Sprachassistent) hat ' + name() + ' gerade eine Frage gestellt, und er hat per Spracheingabe (Fehler möglich) etwas gesagt. Entscheide: ' +
            '(1) "antwort": true NUR wenn der Satz eine Antwort auf die Frage ist. Ein Befehl, eine Gegenfrage oder ein anderes Thema ist KEINE Antwort (false). ' +
            '(2) "fakt": die Antwort als EIN kurzer, klarer Satz über ihn in der dritten Person, zum Beispiel "' + name() + ' trinkt morgens am liebsten Kaffee." Nichts dazuerfinden. ' +
            '(3) "sensibel": true, wenn es um Gesundheit, Krankheit, Geld oder Schulden, Religion, Politik, Sexualität, Straftaten oder Kinder-Details geht. ' +
            '(4) "ack": eine ganz kurze, freundliche Reaktion von Nova, ein Satz, max. 12 Wörter, duzen, ohne Emojis, passend zur Antwort (kein bloßes "Danke für die Antwort"). ' +
            'Antworte NUR mit JSON: {"antwort":bool,"fakt":"...","sensibel":bool,"ack":"..."}.';
        return apiFetch('/api/groq', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctl.signal,
            body: JSON.stringify({ model: 'openai/gpt-oss-120b', response_format: { type: 'json_object' }, messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify({ frage: frage, gesagt: text }) }] })
        }).then(function (r) { return r.json(); }).then(function (j) {
            var p = JSON.parse(j.choices[0].message.content);
            return { antwort: p.antwort === true, fakt: String(p.fakt || '').trim().slice(0, 300), sensibel: p.sensibel === true, ack: String(p.ack || '').replace(/["„“”]/g, '').trim().slice(0, 140) };
        }).catch(function () { return null; }).then(function (x) { clearTimeout(to); return x; });
    }
    function speichern(fakt, thema) {
        return apiFetch('/api/memory', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'store', text: fakt, metadata: { typ: 'episode', kategorie: 'Vorliebe', datum_gesagt: heute(), quelle: 'kennenlernen', status: 'ohne_nachfrage', thema: thema } })
        }).then(function (r) { return r.ok; }).catch(function () { return false; });
    }

    function antwortBehandeln(roh, next) {
        var p = pending; pending = null;
        var t = String(roh || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (STOP_RX.test(t)) { set(ON_KEY, '0'); sag('Gut, ich stelle dir keine Fragen mehr. Mit "Kennenlern-Fragen an" geht es wieder los.'); return true; }
        if (SKIP_RX.test(t)) { gefragtMerken(p.id); sag('Kein Problem, dann eben nicht.', 'still'); return true; }
        if (/^(?:kennenlern|stell(?:e)? mir|frag mich|lern(?:e)? mich)/.test(t)) return handle(roh, next);   // Schalter-Befehle auch mitten in einer Frage
        // Wahrscheinlich ein Befehl? Dann nicht als Antwort werten.
        var rest = function () {
            var r = false;
            try { r = next(roh); } catch (e) { console.error('Kennenlernen', e); }
            if (!r && typeof window.sendToGroqSmart === 'function') { try { window.sendToGroqSmart(roh); } catch (e) {} }
        };
        antwortAuswerten(roh, p.frage).then(function (a) {
            if (!a || !a.antwort || !a.fakt) { rest(); return; }       // keine Antwort: normal weiter, Frage kommt vielleicht später nochmal
            gefragtMerken(p.id);
            if (a.sensibel) { sag('Okay, das speichere ich lieber nicht.', 'still'); return; }
            speichern(a.fakt, p.thema).then(function (ok) {
                if (ok) { card([{ icon: '🧠', title: 'Gemerkt', subtitle: a.fakt.slice(0, 150) }]); sag(a.ack || 'Gut zu wissen.', 'still'); }
                else sag('Das konnte ich gerade nicht speichern.', 'still');
            });
        }).catch(function () { rest(); });
        return true;
    }

    /* ---------- Sprache ---------- */
    function handle(roh, next) {
        if (pending && Date.now() - pending.t > ANTWORT_MS) pending = null;
        var t = String(roh || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^(?:hey |hallo |bitte )?(?:nova )?/, '');
        letzteAktion = Date.now();
        if (pending && t.length <= 300) return antwortBehandeln(roh, next);
        if (!t || t.length > 60) return next(roh);
        if (/^kennenlern[- ]?fragen\s+(?:aus|ausschalten|aus ?schalten)$/.test(t) || /^(?:frag mich nicht mehr|keine fragen mehr|stell(?:e)? keine fragen mehr)$/.test(t)) {
            set(ON_KEY, '0'); sag('Gut, ich stelle dir keine Kennenlern-Fragen mehr.'); return true;
        }
        if (/^kennenlern[- ]?fragen\s+(?:an|ein|einschalten|wieder an)$/.test(t)) {
            set(ON_KEY, '1'); sag('Schön, dann frage ich dich wieder ab und zu etwas, höchstens zweimal am Tag.'); return true;
        }
        if (/^(?:stell|stelle) mir (?:eine|mal eine) frage$/.test(t) || /^frag mich (?:mal )?(?:was|etwas)$/.test(t) || /^(?:lern|lerne) mich (?:mal )?kennen$/.test(t)) {
            setTimeout(function () { stelle(true); }, 300); return true;
        }
        return next(roh);
    }
    function registrieren() {
        if (!window.jvCommands) return false;
        window.jvCommands.use('kennenlernen', function (text, next) {
            try { return handle(text, next); } catch (e) { console.error('Kennenlernen', e); return next(text); }
        }, 105);
        return true;
    }
    if (!registrieren()) document.addEventListener('DOMContentLoaded', registrieren);
    window.jvKennenlernen = { jetzt: function () { stelle(true); }, _zustand: function () { return { pending: pending, log: log(), gefragt: gefragt().length }; } };
})();
