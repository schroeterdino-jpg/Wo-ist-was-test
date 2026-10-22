/* ============================================================
   BEOBACHTUNGSAUFTRÄGE: "Sag Bescheid, wenn ..." - Jarvis behält etwas im Auge und meldet sich von selbst.
   Per Sprache:
     "Sag mir Bescheid, wenn der Diesel unter 1,65 fällt"            (Diesel in deiner Umgebung, in Euro)
     "Sag Bescheid, wenn es aufhört zu regnen" / "... anfängt zu regnen"
     "Meld dich, wenn es unter 0 Grad geht" / "... über 25 Grad"  (auch: "wenn es Frost gibt")
     "Sag mir jedes Mal Bescheid, wenn ..."                           (sonst meldet sich ein Auftrag einmal und löscht sich)
     "Welche Aufträge hast du?" / "Lösch alle Aufträge" / "Lösch den Dieselauftrag"
   Der Server (api/sync.js, Aktionen push_watch_*) prüft jede Minute, ob etwas fällig ist. Ist die App offen, holt sie die Meldung
   ab (alle 60 Sekunden) und spricht sie selbst; sonst kommt eine Push-Meldung aufs Handy (dafür müssen Benachrichtigungen an sein).
   Höchstens 5 Aufträge, nachts (22 bis 5 Uhr) wird nichts gemeldet. Ein Auftrag verfällt nach 30 Tagen.
   Braucht: storage.js (apiFetch), commands.js (jvCommands). Fehlt etwas, tut die Datei still nichts.
   ============================================================ */
(function () {
    'use strict';
    const NAMEN = { diesel: 'Dieselpreis', regen: 'Regen', temp: 'Temperatur' };

    function norm(t) {
        return String(t || '').toLowerCase().replace(/[.!?;:]+/g, ' ').replace(/,/g, ',').replace(/\s+/g, ' ').trim();
    }
    function pushAn() { try { return getPersistentData('jv_push', '') === '1'; } catch (e) { return false; } }
    function sagen(text) { try { if (typeof speak === 'function') speak(text); } catch (e) { } }
    function zahl(s) { return Number(String(s).replace(',', '.')); }
    function deutsch(v) { return String(v).replace('.', ','); }

    async function post(action, body) {
        const res = await apiFetch('/api/sync?action=' + action, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
        if (!res.ok) throw new Error('Status ' + res.status);
        const r = await res.json();
        if (r && Array.isArray(r.list)) melden(r.list.length);
        return r;
    }

    /* In der Android-App gibt es kein Web-Push: Die App fragt selbst nach erfüllten Aufträgen (AuftragReceiver), solange es welche gibt.
       Hier sagen wir ihr, wie viele es sind (und geben den App-Code mit). Im Browser tut das nichts. */
    function melden(n) {
        try {
            const N = window.ZaneNative;
            if (N && typeof N.auftraege === 'function') N.auftraege(String(getPersistentData('app_secret', '') || ''), n);
        } catch (e) { }
    }
    function inApp() { try { return !!(window.ZaneNative && typeof window.ZaneNative.auftraege === 'function'); } catch (e) { return false; } }

    /* Auftrag aus dem Satz lesen; null, wenn es keiner ist */
    const BESCHEID = /\b(?:sag|sage|gib|geb|gebe) (?:mir |mal |bitte |gleich |sofort |dann |jedes mal |jedes weitere mal )*bescheid\b|\bmeld(?:e)? dich\b|\bbenachrichtige mich\b|\bwarn(?:e)? mich\b|\binformier(?:e)? mich\b|\bgib mir (?:ein )?(?:zeichen|bescheid)\b|\bsag mir (?:gleich |dann |sofort )?(?:wenn|sobald|falls|ob)\b|\bsag (?:gleich |dann |sofort )?(?:wenn|sobald)\b/;
    function parseAuftrag(t) {
        if (!BESCHEID.test(t)) return null;
        const einmal = !/\b(?:jedes mal|jedes weitere mal|immer wenn|immer wieder|dauerhaft|jedes mal wenn)\b|\bimmer,? (?:wenn|sobald)\b/.test(t);
        // Dieselpreis
        if (/\b(?:diesel|dieselpreis|sprit|spritpreis|tankpreis)\b/.test(t)) {
            let m = t.match(/unter (\d)[,.](\d{1,3})\b/);
            let v = m ? zahl(m[1] + '.' + m[2]) : NaN;
            if (isNaN(v)) { m = t.match(/unter (\d) euro (\d{1,2})\b/); if (m) v = zahl(m[1] + '.' + (m[2].length === 1 ? m[2] + '0' : m[2])); }
            if (isNaN(v)) { m = t.match(/unter (1\d\d) cent\b/); if (m) v = Number(m[1]) / 100; }
            if (isNaN(v)) { m = t.match(/unter (\d) euro\b/); if (m) v = Number(m[1]); }
            if (!isNaN(v)) return { typ: 'diesel', op: 'unter', wert: v, einmal };
            return { fehler: 'Bei welchem Preis soll ich mich melden? Zum Beispiel: Sag Bescheid, wenn der Diesel unter 1,65 fällt.' };
        }
        // Regen
        if (/\bregn|\bregen\b/.test(t)) {
            if (/aufh(?:ö|oe)rt|auf(?:h|g)(?:ö|oe)rt|vorbei|nicht mehr|stoppt|endet|h(?:ö|oe)rt .*auf|trocken wird|trocken ist/.test(t)) return { typ: 'regen', op: 'endet', einmal };
            if (/anf(?:ä|ae)ngt|beginnt|losgeht|einsetzt|f(?:ä|ae)ngt .*an|regnet\b/.test(t)) return { typ: 'regen', op: 'beginnt', einmal };
            return { fehler: 'Soll ich mich melden, wenn es anfängt zu regnen, oder wenn es aufhört?' };
        }
        // Temperatur
        if (/\b(?:grad|temperatur|frost|friert|kalt|warm|hei(?:ß|ss))\b/.test(t)) {
            let m = t.match(/unter (minus )?(-?\d{1,2})(?:[,.](\d))? grad/);
            if (m) { let v = zahl(m[2] + (m[3] ? '.' + m[3] : '')); if (m[1]) v = -Math.abs(v); return { typ: 'temp', op: 'unter', wert: v, einmal }; }
            m = t.match(/(?:ü|ue)ber (minus )?(-?\d{1,2})(?:[,.](\d))? grad/);
            if (m) { let v = zahl(m[2] + (m[3] ? '.' + m[3] : '')); if (m[1]) v = -Math.abs(v); return { typ: 'temp', op: 'ueber', wert: v, einmal }; }
            m = t.match(/(?:w(?:ä|ae)rmer als|mehr als) (\d{1,2}) grad/);
            if (m) return { typ: 'temp', op: 'ueber', wert: zahl(m[1]), einmal };
            if (/\b(?:frost|friert|gefrierpunkt|null grad)\b/.test(t)) return { typ: 'temp', op: 'unter', wert: 0, einmal };
            return { fehler: 'Bei welcher Temperatur soll ich mich melden? Zum Beispiel: Sag Bescheid, wenn es unter 0 Grad geht.' };
        }
        return null;
    }

    function beschreibe(w) {
        if (w.typ === 'diesel') return 'der Diesel unter ' + deutsch(Number(w.wert).toFixed(2)) + ' Euro fällt';
        if (w.typ === 'temp') return w.op === 'unter' ? 'es unter ' + deutsch(w.wert) + ' Grad geht' : 'es über ' + deutsch(w.wert) + ' Grad geht';
        return w.op === 'endet' ? 'es aufhört zu regnen' : 'es anfängt zu regnen';
    }

    async function anlegen(a) {
        try {
            const r = await post('push_watch_add', a);
            if (r && r.voll) { sagen('Ich beobachte schon fünf Dinge, Sir. Lösch erst einen Auftrag, zum Beispiel mit: Lösch alle Aufträge.'); return; }
            if (!r || !r.ok) { sagen('Das konnte ich nicht anlegen.'); return; }
            const wann = a.einmal ? 'einmal' : 'jedes Mal';
            let s = 'Verstanden, Sir. Ich melde mich ' + wann + ', sobald ' + beschreibe(a) + '.';
            if (!pushAn() && !inApp()) s += ' Aber die Benachrichtigungen sind aus. Sag: Benachrichtigungen an, dann erreiche ich dich auch bei geschlossener App.';
            sagen(s);
        } catch (e) { sagen('Das hat gerade nicht geklappt. Versuch es bitte gleich noch einmal.'); }
    }

    async function auflisten() {
        try {
            const r = await post('push_watch_list', {});
            const l = (r && r.list) || [];
            if (!l.length) { sagen('Ich beobachte im Moment nichts, Sir.'); return; }
            sagen(l.length === 1 ? 'Ich beobachte eine Sache: Ich melde mich, sobald ' + beschreibe(l[0]) + '.'
                : 'Ich beobachte ' + l.length + ' Dinge: ' + l.map(w => 'sobald ' + beschreibe(w)).join('; ') + '.');
        } catch (e) { sagen('Das konnte ich gerade nicht abrufen.'); }
    }

    async function loeschen(body, text) {
        try {
            const r = await post('push_watch_del', body);
            const n = (r && r.entfernt) || 0;
            sagen(n ? (n === 1 ? 'Erledigt, ich habe den Auftrag gelöscht.' : 'Erledigt, ich habe ' + n + ' Aufträge gelöscht.') : (text || 'Da war nichts zu löschen.'));
        } catch (e) { sagen('Das hat gerade nicht geklappt.'); }
    }

    function befehl(text, next) {
        const t = norm(text).replace(/^(?:hey |hallo |ok |okay )?(?:jarvis|zane|nova)[ ,]+/, '').replace(/^bitte /, '');
        if (!t || t.length > 140) return next(text);
        if (/\b(?:auftr(?:ä|ae)ge|beobachtungen)\b/.test(t) && /\b(?:welche|was|zeig|zeige|liste|hast du|gibt es|habe ich|laufen)\b/.test(t) && !/\bl(?:ö|oe)sch|\bentfern|\bvergiss|\bstorniere|\bbeende/.test(t)) { auflisten(); return true; }
        if (/\bwas (?:beobachtest|(?:ü|ue)berwachst) du\b/.test(t)) { auflisten(); return true; }
        if (/^(?:l(?:ö|oe)sch(?:e)?|entferne|vergiss|storniere|beende)\b/.test(t) && /\b(?:auftr(?:ä|ae)ge|beobachtungen)\b/.test(t) && /\b(?:alle|sämtliche|saemtliche)\b/.test(t)) { loeschen({ all: true }); return true; }
        const m = t.match(/^(?:l(?:ö|oe)sch(?:e)?|entferne|vergiss|storniere|beende) (?:den |die |meinen )?(diesel|dieselpreis|regen|temperatur)(?:-| )?(?:auftrag|beobachtung)/);
        if (m) { loeschen({ typ: /diesel/.test(m[1]) ? 'diesel' : m[1] === 'regen' ? 'regen' : 'temp' }, 'Diesen Auftrag gab es nicht.'); return true; }
        // Eigenarbeit: "Such den günstigsten Diesel auf dem Heimweg und melde dich" -> sofort nachsehen und sagen, was unterwegs günstig ist
        if (/\b(?:g(?:ü|ue)nstigst\w*|billigst\w*|beste\w*)\b/.test(t) && /\b(?:diesel|sprit|tankstelle|tanken)\b/.test(t) && /\bheimweg|\bnach hause|\bheimfahrt/.test(t)) {
            (async function () {
                sagen('Ich schaue nach.');
                let r = '';
                try { r = window.jvPlan && window.jvPlan.heimTank ? await window.jvPlan.heimTank(true) : ''; } catch (e) { }
                sagen(r || 'Das konnte ich gerade nicht prüfen.');
            })();
            return true;
        }
        const a = parseAuftrag(t);
        if (!a) return next(text);
        if (a.fehler) { sagen(a.fehler); return true; }
        anlegen(a);
        return true;
    }

    // Meldungen abholen, die Jarvis selbst sprechen soll (nur bei offener, sichtbarer App)
    let laeuft = false;
    async function abholen() {
        if (laeuft || document.hidden) return;
        try { if (typeof isRecording !== 'undefined' && isRecording) return; } catch (e) { }
        try { if (typeof isSpeaking === 'function' && isSpeaking()) return; } catch (e) { }
        laeuft = true;
        try {
            // Der Server weiß nur durch ein Lebenszeichen, dass die App offen ist (dann kommt die Meldung hierher und nicht als Push):
            // mit Benachrichtigungen schickt pushsync.js es, in der Android-App ohne Web-Push schicken wir es selbst.
            if (!pushAn()) { if (!inApp()) { laeuft = false; return; } await post('push_alive', {}); }
            const r = await post('push_watch_poll', {});
            const msgs = (r && r.msgs) || [];
            if (msgs.length) sagen(msgs.map(m => m.body).join(' '));
        } catch (e) { }
        laeuft = false;
    }

    function cmd() {
        if (!window.jvCommands || typeof window.jvCommands.use !== 'function') return false;
        window.jvCommands.use('auftraege', befehl, 36);
        return true;
    }
    if (!cmd()) { let n = 0; const iv = setInterval(function () { if (cmd() || ++n > 40) clearInterval(iv); }, 250); }
    setInterval(abholen, 60000);
    // App verlassen: dem Server sagen, dass sie zu ist, damit erfüllte Aufträge sofort an die Android-App gehen (nur ohne Web-Push)
    document.addEventListener('visibilitychange', function () {
        if (document.hidden && inApp() && !pushAn()) { try { apiFetch('/api/sync?action=push_gone', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json' }, body: '{}' }).catch(function () { }); } catch (e) { } }
        else if (!document.hidden) setTimeout(abholen, 800);
    });
    // Beim Start einmal abgleichen (Anzahl an die Android-App melden, wartende Meldungen abholen)
    setTimeout(function () { if (inApp()) post('push_watch_list', {}).catch(function () { }); abholen(); }, 6000);
    window.jvAuftraege = { parse: parseAuftrag, abholen };
})();
