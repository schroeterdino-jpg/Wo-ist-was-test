/* ============================================================
   SYSTEMCHECK VOLL: prüft ALLES auf einmal, nach Bereichen geordnet, mit Lösung zu jedem Fehler.
   Ersetzt systemcheck.js und selbsttest.js (die beiden gibt es nicht mehr). Prüft:
   - Google/Dienste: Kalender, Gmail, Wetter, Spritpreise, Karten, KI, Google-Route, Verkehr, Diesel-Suche, Standort
   - Handy: Mikrofon, Spracherkennung, Kamera, Benachrichtigungen/Push, Speicher, Stimme, Netz, Uhrzeit
   - Programm: alle Programmdateien erreichbar, Funktionen geladen, Programmfehler seit dem Start, 3D-Kopf und Modelle
   - Server: App-Code, Langzeitgedächtnis, Abgleich, Push-Server, Mail-Wächter, Nachrichten, Filme, Stimmen (Fish, Edge)
   - Daten: Heimat- und Arbeitsadresse
   - Weckruf-App: erkannt? Weckwort? Funktionen der App
   Aufruf: Menü "Alles prüfen", Sprache "Systemcheck", einmal am Tag still im Hintergrund (meldet sich nur bei Problemen).
   Ein Fehler in einer Prüfung stört nie die anderen. Kostet (Fish, YouTube, KI, Google-Route) nur bei der von Hand gestarteten Prüfung.
   Muss NACH hud_fenster.js geladen werden.
   ============================================================ */
(function () {
    'use strict';
    if (window.__jvCheckVoll) return;
    window.__jvCheckVoll = true;

    const mit = (p, ms, msg) => Promise.race([Promise.resolve(p), new Promise((_, rej) => setTimeout(() => rej(new Error(msg || 'antwortet nicht')), ms))]);
    const pd = (k, d) => { try { return typeof getPersistentData === 'function' ? getPersistentData(k, d) : (localStorage.getItem(k) ?? d); } catch (e) { return d; } };
    const sd = (k, v) => { try { if (typeof setPersistentData === 'function') setPersistentData(k, v); else localStorage.setItem(k, v); } catch (e) {} };
    const IN_APP = () => !!window.ZaneNative;

    const GRUPPEN = ['Handy', 'Programm', 'Google', 'Dienste', 'Server', 'Daten', 'Weckruf-App'];
    const ok = (text) => ({ ok: true, text });
    const schlecht = (text, fix) => ({ ok: false, text, fix: fix || '' });
    const hinweis = (text, fix) => ({ ok: null, text, fix: fix || '' });
    const warum = (e) => {
        if (!e) return 'unbekannt';
        if (e.userMessage) return e.userMessage;
        if (e.message === 'antwortet nicht') return 'antwortet nicht';
        return 'keine Verbindung';
    };

    async function api(url, opts, ms) {
        const r = await mit(apiFetch(url, opts || {}), ms || 15000);
        let d = null; try { d = await r.json(); } catch (e) {}
        return { r, d };
    }
    const fehlerText = (r, d) => (d && d.error && (d.error.message || d.error)) || ('Status ' + r.status);

    /* ---------------- Handy ---------------- */
    async function pruefMikro() {
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        let st = ''; try { if (navigator.permissions) st = (await navigator.permissions.query({ name: 'microphone' })).state; } catch (e) {}
        const wo = IN_APP() ? 'Jarvis' : 'Chrome';
        if (st === 'denied') return schlecht('blockiert', 'Android: Einstellungen > Apps > ' + wo + ' > Berechtigungen > Mikrofon erlauben');
        if (!SR && !IN_APP()) return schlecht('Spracherkennung fehlt in diesem Browser', 'Chrome oder die Jarvis-App benutzen');
        return ok(st === 'prompt' ? 'bereit (wird beim ersten Mal gefragt)' : (IN_APP() ? 'erlaubt, Spracherkennung der App' : 'erlaubt'));
    }
    async function pruefKamera() {
        if (!document.getElementById('photoInput')) return schlecht('Foto-Eingabe fehlt', 'index.html und js/photo.js prüfen');
        if (typeof window.openPhotoCamera !== 'function') return schlecht('Kamera-Funktion fehlt', 'js/photo.js fehlt oder hat einen Fehler');
        let st = ''; try { if (navigator.permissions) st = (await navigator.permissions.query({ name: 'camera' })).state; } catch (e) {}
        if (st === 'denied') return schlecht('blockiert', 'Android: Einstellungen > Apps > ' + (IN_APP() ? 'Jarvis' : 'Chrome') + ' > Berechtigungen > Kamera erlauben');
        let n = -1; try { if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) n = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput').length; } catch (e) {}
        if (n === 0 && !IN_APP()) return hinweis('keine Kamera gefunden', 'Handy neu starten oder Chrome-Berechtigung prüfen');
        return ok('bereit' + (IN_APP() ? ' (in der Jarvis-App startet der Knopf die Handy-Kamera)' : '') + ', zum Echttest den Kamera-Knopf antippen');
    }
    async function pruefPush() {
        const perm = (typeof Notification !== 'undefined') ? Notification.permission : 'nicht unterstützt';
        if (perm === 'nicht unterstützt') return IN_APP() ? hinweis('in der App nicht verfügbar', 'Erinnerungen laufen in der App über die Weckruf-Funktion') : schlecht('nicht unterstützt', 'Chrome benutzen');
        if (perm === 'denied') return schlecht('blockiert', 'Chrome-Seiteneinstellungen oder Android: Benachrichtigungen für ' + (IN_APP() ? 'Jarvis' : 'Chrome') + ' erlauben');
        if (perm !== 'granted') return hinweis('noch nicht erlaubt', 'in den Einstellungen "Push" einschalten');
        let sub = null, swok = false;
        try { if ('serviceWorker' in navigator) { const reg = await mit(navigator.serviceWorker.getRegistration(), 4000); swok = !!reg; if (reg && reg.pushManager) sub = await mit(reg.pushManager.getSubscription(), 4000); } } catch (e) {}
        if (!swok) return hinweis('erlaubt, aber kein Service Worker', 'Seite neu laden');
        if (!sub) return hinweis('erlaubt, aber nicht angemeldet', 'in den Einstellungen Push einmal aus- und wieder einschalten');
        return ok('erlaubt und angemeldet');
    }
    async function pruefSpeicher() {
        try {
            const k = '__jv_check';
            localStorage.setItem(k, String(Date.now())); const v = localStorage.getItem(k); localStorage.removeItem(k);
            if (!v) return schlecht('Speicher nimmt nichts an', 'Website-Daten für die Seite löschen und neu laden; Privatmodus aus');
        } catch (e) { return schlecht('Speicher gesperrt', 'Privatmodus aus, Website-Daten erlauben'); }
        try {
            if (navigator.storage && navigator.storage.estimate) {
                const e = await navigator.storage.estimate();
                if (e && e.quota) {
                    const p = Math.round((e.usage || 0) / e.quota * 100);
                    if (p >= 80) return hinweis('fast voll (' + p + ' %)', 'in den Einstellungen Bilder oder alte Daten löschen');
                    return ok('funktioniert (' + p + ' % belegt)');
                }
            }
        } catch (e) {}
        return ok('funktioniert');
    }
    async function pruefStimme() {
        const teile = [];
        let voices = [];
        try {
            if ('speechSynthesis' in window) {
                voices = speechSynthesis.getVoices();
                if (!voices.length) await mit(new Promise(res => { const f = () => res(); speechSynthesis.addEventListener('voiceschanged', f, { once: true }); setTimeout(res, 1500); }), 2000).catch(() => {});
                voices = speechSynthesis.getVoices();
            }
        } catch (e) {}
        const de = voices.filter(v => /^de/i.test(v.lang)).length;
        if (!('speechSynthesis' in window) && IN_APP()) return ok('in der Jarvis-App nicht eingebaut, Jarvis nutzt dort die Server-Stimmen (Fish, Edge)');
        if (!('speechSynthesis' in window)) return hinweis('Handy-Stimme (Ausweichstimme) nicht verfügbar', 'Chrome-Sprachausgabe in den Android-Einstellungen prüfen');
        if (!de) teile.push('keine deutsche Handy-Stimme');
        let ac = '';
        try { const AC = window.AudioContext || window.webkitAudioContext; if (AC) { const c = new AC(); ac = c.state; try { c.close(); } catch (e) {} } } catch (e) {}
        if (!de) return hinweis(teile.join(', '), 'Android: Einstellungen > Allgemeine Verwaltung > Text-in-Sprache > Deutsch installieren');
        return ok('Ausweichstimme (Handy) hat ' + de + ' deutsche Stimme' + (de > 1 ? 'n' : '') + (ac === 'suspended' ? ', Ton startet nach dem ersten Tippen' : ''));
    }
    async function pruefNetz() {
        if (navigator.onLine === false) return schlecht('offline', 'WLAN oder mobile Daten einschalten');
        const c = navigator.connection || {};
        const art = c.effectiveType ? c.effectiveType.toUpperCase() : '';
        if (c.saveData) return hinweis('Datensparmodus an', 'Android: Datensparmodus für Jarvis/Chrome ausnehmen');
        if (art === 'SLOW-2G' || art === '2G') return hinweis('sehr langsam (' + art + ')', 'besseren Empfang oder WLAN suchen');
        return ok('online' + (art ? ' (' + art + ')' : ''));
    }
    async function pruefUhr() {
        try {
            const t0 = Date.now();
            const r = await mit(fetch(location.pathname || '/', { method: 'HEAD', cache: 'no-store' }), 8000);
            const dh = r.headers.get('date'); if (!dh) return ok('nicht prüfbar');
            const t1 = Date.now(); const diff = Math.abs(t0 + (t1 - t0) / 2 - new Date(dh).getTime());
            if (diff > 120000) return schlecht('Handy-Uhr geht ' + Math.round(diff / 60000) + ' Minuten falsch', 'Android: Datum und Uhrzeit auf automatisch stellen (sonst stimmen Wecker und Google-Anmeldung nicht)');
            return ok('stimmt');
        } catch (e) { return ok('nicht prüfbar'); }
    }

    /* ---------------- Programm ---------------- */
    async function pruefDateien() {
        const urls = [];
        document.querySelectorAll('script[src],link[rel="stylesheet"][href]').forEach(el => {
            const u = el.getAttribute('src') || el.getAttribute('href');
            if (!u || /^(https?:)?\/\//.test(u) || /^data:/.test(u)) return;
            urls.push(u);
        });
        ['manifest.json', 'sw.js'].forEach(u => urls.push('./' + u));
        const einmalig = [...new Set(urls)];
        const fehlt = [];
        let i = 0;
        async function worker() {
            while (i < einmalig.length) {
                const u = einmalig[i++];
                try {
                    const r = await mit(fetch(u, { method: 'HEAD', cache: 'no-store' }), 12000);
                    if (!r.ok && r.status !== 405 && r.status !== 501) fehlt.push(u.replace(/^\.\//, '').replace(/\?.*$/, ''));
                } catch (e) { fehlt.push(u.replace(/^\.\//, '').replace(/\?.*$/, '') + ' (keine Antwort)'); }
            }
        }
        await Promise.all([worker(), worker(), worker(), worker(), worker(), worker()]);
        if (fehlt.length) return schlecht('fehlt oder nicht erreichbar: ' + fehlt.slice(0, 6).join(', ') + (fehlt.length > 6 ? ' und ' + (fehlt.length - 6) + ' weitere' : ''), 'diese Dateien bei GitHub hochladen (Ordner js bzw. Hauptordner)');
        return ok(einmalig.length + ' Dateien da');
    }
    async function pruefFunktionen() {
        const E = window.__jvExpect;
        if (!E) return hinweis('Liste nicht verfügbar', 'index.html ist älter als dieser Check');
        const fehlt = [];
        Object.keys(E).forEach(f => { if (typeof window[E[f]] !== 'function') fehlt.push(f); });
        if (fehlt.length) return schlecht('nicht geladen: ' + fehlt.join(', '), 'Datei fehlt im Ordner js oder enthält einen Fehler (Fehleranzeige unten beachten)');
        return ok(Object.keys(E).length + ' Bausteine geladen');
    }
    async function pruefFehler() {
        const e = window.__jvErrs;
        if (!e) return hinweis('Fehlerliste nicht verfügbar', 'index.html ist älter als dieser Check');
        const echte = e.filter(m => !/^DATEI NICHT GELADEN|^FEHLT NACH/.test(m));
        if (!echte.length) return ok('keine Programmfehler seit dem Start');
        return schlecht(echte.length + ' Programmfehler seit dem Start, zuletzt: ' + String(echte[echte.length - 1]).slice(0, 140), 'Screenshot der roten Fehleranzeige schicken; App neu öffnen leert die Liste');
    }
    async function pruefModelle() {
        const liste = [['models/mann.glb', true], ['models/zubehoer.glb', false]];
        const fehlt = [], optional = [];
        await Promise.all(liste.map(async ([u, pflicht]) => {
            try { const r = await mit(fetch('./' + u, { method: 'HEAD', cache: 'no-store' }), 12000); if (!r.ok) (pflicht ? fehlt : optional).push(u); }
            catch (e) { (pflicht ? fehlt : optional).push(u); }
        }));
        let kopf = '';
        try { const a = window.jvAvatar3D; if (a) { const rd = typeof a.ready === 'function' ? a.ready() : a.ready; kopf = rd ? ', 3D-Kopf läuft' : ', 3D-Kopf lädt oder ist aus'; } else kopf = ', 3D-Kopf nicht geladen'; } catch (e) {}
        if (fehlt.length) return schlecht('fehlt: ' + fehlt.join(', '), 'Datei in den Ordner models bei GitHub hochladen');
        if (optional.length) return hinweis('fehlt: ' + optional.join(', ') + kopf, 'Datei in den Ordner models hochladen (nur nötig für Brille/Mütze)');
        return ok('Modelle da' + kopf);
    }

    /* ---------------- Server ---------------- */
    async function pruefAppCode() {
        if (!pd('app_secret', '')) return schlecht('nicht eingetragen', 'Einstellungen > App-Code eintragen (derselbe wie APP_SECRET bei Vercel)');
        try {
            const { r } = await api('/api/geocode?q=Hamburg', {}, 12000);
            if (r.status === 401) return schlecht('wird vom Server abgelehnt', 'App-Code in den Einstellungen mit APP_SECRET bei Vercel vergleichen');
            return ok('wird akzeptiert');
        } catch (e) { return schlecht(warum(e), e && e.auth ? 'App-Code in den Einstellungen prüfen' : 'Netz oder Vercel prüfen'); }
    }
    async function pruefGedaechtnis() {
        try {
            const { r, d } = await api('/api/memory', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'list', limit: 1 }) }, 15000);
            if (r.ok) {
                const n = d && (d.total ?? d.count ?? (Array.isArray(d.items) ? d.items.length : null));
                return ok('antwortet' + (typeof n === 'number' ? ' (' + n + (n === 1 ? ' Eintrag sichtbar)' : ' Einträge sichtbar)') : ''));
            }
            return schlecht(fehlerText(r, d), 'bei Vercel UPSTASH_VECTOR_REST_URL und _TOKEN prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefAbgleich() {
        try {
            const { r, d } = await api('/api/sync', {}, 15000);
            if (r.ok && d && d.items) return ok('Abgleich erreichbar (' + Object.keys(d.items).length + ' Datensätze)');
            return schlecht(fehlerText(r, d), 'bei Vercel Upstash Redis mit dem Projekt verbinden (KV_REST_API_URL / _TOKEN)');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefPushServer() {
        try {
            const { r, d } = await api('/api/sync?action=push_key', {}, 12000);
            if (r.ok && d && d.publicKey) return ok('Push-Schlüssel vorhanden');
            return schlecht(fehlerText(r, d), 'bei Vercel VAPID_PUBLIC_KEY und VAPID_PRIVATE_KEY eintragen, dann Redeploy');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefMailWaechter() {
        try {
            const { r, d } = await api('/api/sync?action=push_mail_status', {}, 12000);
            if (!r.ok) return schlecht(fehlerText(r, d), 'bei Vercel GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET prüfen');
            if (d && d.secretOk === false) return schlecht('Server hat keine Google-Zugangsdaten', 'bei Vercel GOOGLE_CLIENT_ID und GOOGLE_CLIENT_SECRET eintragen, dann Redeploy');
            if (!d || !d.verbunden) return hinweis('nicht verbunden', 'in den Einstellungen Mail-Wächter einmal verbinden (nur nötig, wenn du Mail-Meldungen am Sperrbildschirm willst)');
            if (d.fehler) return schlecht('verbunden, aber: ' + String(d.fehler).slice(0, 100), 'Mail-Wächter in den Einstellungen neu verbinden');
            const alt = d.letztePruefung ? Math.round((Date.now() - d.letztePruefung) / 60000) : null;
            if (alt !== null && alt > 180) return hinweis('verbunden, letzte Prüfung vor ' + Math.round(alt / 60) + ' Stunden', 'prüft nur, wenn der Server-Takt läuft (cron-job.org bei PUSH_CRON_KEY)');
            return ok('verbunden' + (alt !== null ? ', letzte Prüfung vor ' + alt + ' Min' : ''));
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefNachrichten() {
        try {
            const { r, d } = await api('/api/news?q=Hamburg', {}, 15000);
            if (r.ok && d && !d.error) return ok('Nachrichten kommen an');
            return schlecht(fehlerText(r, d), 'später nochmal prüfen (Nachrichtenquelle antwortet nicht)');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefFilme() {
        try {
            const { r, d } = await api('/api/filme?mode=discover', {}, 15000);
            if (r.ok && d && !d.error) return ok('Filmdaten kommen an');
            return schlecht(fehlerText(r, d), 'bei Vercel TMDB_API_KEY prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefEdge() {
        try {
            const r = await mit(apiFetch('/api/stau?tts=1&engine=edge&text=' + encodeURIComponent('Test')), 15000);
            const ct = r.headers.get('content-type') || '';
            if (r.ok && /audio/.test(ct)) return ok('Edge-Stimme (Notfall-Stimme) antwortet');
            return hinweis('Edge-Stimme antwortet nicht (Status ' + r.status + ')', 'nur Notfall-Stimme; später nochmal prüfen');
        } catch (e) { return hinweis(warum(e), 'nur Notfall-Stimme'); }
    }
    async function pruefFish() {
        try {
            const fv = (typeof window.getFishVoice === 'function') ? window.getFishVoice() : '';
            const { r, d } = await api('/api/stau?tts=1&engine=fish&diag=1&text=Test&fishVoice=' + encodeURIComponent(fv), {}, 20000);
            if (d && d.ok && d.engineUsed === 'fish') return ok('Fish-Stimme antwortet' + (/keine Stimmen-ID/.test(String(d.voice || '')) ? ' (ohne feste Stimmen-ID)' : ''));
            return schlecht(String((d && d.error) || ('Status ' + r.status)).slice(0, 140), 'bei Vercel FISH_AUDIO_API_KEY und Guthaben prüfen; solange spricht Jarvis mit der nächsten Stimme');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefYoutube() {
        try {
            const { r, d } = await api('/api/youtubelive?type=live&q=Hamburg', {}, 15000);
            if (r.ok && d && !d.error) return ok('antwortet');
            return schlecht(fehlerText(r, d), 'bei Vercel YOUTUBE_API_KEY und das Tageslimit prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }

    /* ---------------- Daten ---------------- */
    async function pruefAdresse(key, name) {
        const v = String(pd(key, '') || '').trim();
        if (v) return ok(v.length > 48 ? v.slice(0, 46) + '…' : v);
        return hinweis('nicht gespeichert', 'sag "Merk dir meine ' + name + ': Straße Nr, Ort". Browser und Jarvis-App haben getrennte Speicher, jede merkt sich die Adresse für sich');
    }

    /* ---------------- Weckruf-App ---------------- */
    async function pruefApp() {
        const N = window.ZaneNative;
        if (!N) return hinweis('Seite läuft im Browser, nicht in der Jarvis-App', 'Weckwort im Hintergrund, Wecker-Ansagen und Kamera-Knopf brauchen die Jarvis-App');
        const fehlt = ['recStart', 'printHtml', 'shareImage', 'planAnsagen', 'holeAnsage', 'weckerStellen', 'openSetup', 'auftraege'].filter(f => typeof N[f] !== 'function');
        if (fehlt.length) return hinweis('App ist älter, es fehlt: ' + fehlt.join(', '), 'neue APK bei GitHub bauen lassen (Releases) und installieren');
        return ok('Jarvis-App erkannt, alle Funktionen da');
    }
    async function pruefWeckwort() {
        let an = null;
        try { if (typeof wakeWordEnabled !== 'undefined') an = !!wakeWordEnabled; } catch (e) {}
        if (an === null) return hinweis('Status nicht lesbar', '');
        return an ? ok('Weckwort-Modus an') : hinweis('Weckwort-Modus aus', 'in den Einstellungen einschalten, wenn Jarvis auf "Hey Jarvis" hören soll');
    }


    /* ---------------- Google und Dienste (früher systemcheck.js und selbsttest.js) ---------------- */
    let posMerk = null;
    function posHolen() {
        if (!posMerk) posMerk = (async () => {
            if (!navigator.geolocation) return { ok: false, text: 'nicht unterstützt' };
            try {
                const p = await mit(new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 8000, maximumAge: 120000 })), 10000);
                return { ok: true, text: 'gefunden', lat: p.coords.latitude, lon: p.coords.longitude };
            } catch (e) { return { ok: false, text: (e && e.code === 1) ? 'nicht erlaubt' : 'kein Signal' }; }
        })();
        return posMerk;
    }
    async function pruefStandort() {
        const p = await posHolen();
        if (p.ok) return ok('gefunden');
        return p.text === 'nicht erlaubt'
            ? schlecht('nicht erlaubt', 'Android: Einstellungen > Apps > ' + (IN_APP() ? 'Jarvis' : 'Chrome') + ' > Berechtigungen > Standort erlauben')
            : schlecht(p.text, 'Standort und GPS am Handy einschalten, kurz nach draußen oder ans Fenster');
    }
    let googleStatus = null;
    async function googleBereit() {
        if (googleStatus) return googleStatus;
        let okG = false, warumG = '';
        try {
            if (typeof accessToken === 'undefined' || !accessToken) warumG = 'nicht verbunden';
            else {
                if (!isGoogleAuthorized()) { try { await ensureGoogleAuth(4000); } catch (e) {} }
                if (isGoogleAuthorized()) okG = true; else warumG = 'Anmeldung abgelaufen';
            }
        } catch (e) { warumG = 'nicht verbunden'; }
        googleStatus = { ok: okG, warum: warumG };
        return googleStatus;
    }
    async function pruefGoogle(url, keineRechte) {
        const g = await googleBereit();
        if (!g.ok) return schlecht(g.warum, 'Einstellungen > Google neu verbinden');
        try {
            const r = await mit(fetch(url, { headers: { 'Authorization': 'Bearer ' + accessToken } }), 12000);
            if (r.ok) return ok('verbunden');
            if (r.status === 401) { try { markGoogleExpired(); } catch (e) {} return schlecht('Anmeldung abgelaufen', 'Einstellungen > Google neu verbinden'); }
            if (r.status === 403) return schlecht(keineRechte, 'Einstellungen > Google neu verbinden und alle Häkchen setzen');
            return schlecht('Fehler ' + r.status, 'später nochmal prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz prüfen'); }
    }
    const pruefKalender = () => pruefGoogle('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', 'Berechtigung fehlt');
    const pruefGmail = () => pruefGoogle('https://gmail.googleapis.com/gmail/v1/users/me/profile', 'Berechtigung "Gmail lesen" fehlt');
    async function pruefWetter() {
        try {
            if (typeof fetchWeatherData !== 'function') return schlecht('Funktion fehlt', 'js/briefing.js fehlt oder hat einen Fehler');
            const w = await mit(fetchWeatherData(), 15000);
            if (w && !w.fehler) return ok('Daten kommen an');
            return schlecht((w && w.fehler) || 'keine Daten', 'Standort erlauben, dann nochmal prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz prüfen'); }
    }
    async function pruefSprit() {
        try {
            const { r, d } = await api('/api/tank?lat=53.55&lng=10.0&rad=5', {}, 15000);
            if (r.ok && d && Array.isArray(d.stations)) return ok(d.stations.length + (d.stations.length === 1 ? ' Tankstelle' : ' Tankstellen') + ' gefunden');
            return schlecht(fehlerText(r, d), 'bei Vercel TANKERKOENIG_API_KEY prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefKarten() {
        try {
            const { r, d } = await api('/api/geocode?q=Hamburg', {}, 15000);
            if (r.ok && Array.isArray(d) && d.length > 0) return ok('Adress-Suche funktioniert');
            return schlecht((d && d.error) || ('Status ' + r.status), 'später nochmal prüfen (Kartendienst antwortet nicht)');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefKI() {
        try {
            const { r, d } = await api('/api/groq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'openai/gpt-oss-120b', reasoning_effort: 'low', messages: [{ role: 'user', content: 'Antworte nur mit dem Wort ok.' }] }) }, 25000);
            if (r.ok && d && d.choices && d.choices[0]) return ok('antwortet');
            return schlecht(fehlerText(r, d), 'bei Vercel GROQ_API_KEY und das Mengenlimit prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefRoute() {
        try {
            const p = await posHolen(); const lat = p.ok ? p.lat : 53.5, lon = p.ok ? p.lon : 10.48;
            const { r, d } = await api('/api/route?fromLat=' + lat + '&fromLon=' + lon + '&toLat=53.55&toLon=10.0&geometry=0&google=1', {}, 15000);
            const rt = d && d.routes && d.routes[0];
            if (!r.ok || !rt) return schlecht((d && d.error) || ('Status ' + r.status), 'Netz oder Vercel prüfen');
            if (d.quelle === 'google') return ok(Math.round(rt.duration / 60) + ' Min, Google');
            return schlecht('nur Ersatzdienst (OSRM)', 'bei Vercel Google-Schlüssel und das Monatslimit prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefVerkehr() {
        try {
            const p = await posHolen(); const lat = p.ok ? p.lat : 53.5, lon = p.ok ? p.lon : 10.48, dl = 0.1, dn = 0.17;
            const { r, d } = await api('/api/stau?traffic=1&bbox=' + [lon - dn, lat - dl, lon + dn, lat + dl].map(n => n.toFixed(5)).join(','), {}, 15000);
            if (r.ok && d && !d.error) return ok('Meldungen kommen an');
            return schlecht(fehlerText(r, d), 'bei Vercel TOMTOM_API_KEY prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefDiesel() {
        try {
            const p = await posHolen(); const lat = p.ok ? p.lat : 53.5, lon = p.ok ? p.lon : 10.48;
            const { r, d } = await api('/api/tankroute?lat=' + lat.toFixed(5) + '&lng=' + lon.toFixed(5) + '&rad=5', {}, 15000);
            if (r.ok && d && !d.error) return ok('antwortet');
            return schlecht(fehlerText(r, d), 'bei Vercel TANKERKOENIG_API_KEY prüfen');
        } catch (e) { return schlecht(warum(e), 'Netz oder Vercel prüfen'); }
    }
    async function pruefBausteine() {
        const fehlt = [];
        if (!window.jvLage || typeof window.jvLage.open !== 'function') fehlt.push('Lagebild');
        if (!window.jvPanel) fehlt.push('Fenster');
        const liste = (window.jvCommands && window.jvCommands.list) ? window.jvCommands.list().join(' ') : '';
        ['lagebild', 'arbeitsweg-via'].forEach(n => { if (liste.indexOf(n) < 0) fehlt.push('Befehl ' + n); });
        if (typeof window.executeAction !== 'function') fehlt.push('Aktionen');
        return fehlt.length ? schlecht('fehlt: ' + fehlt.join(', '), 'Datei im Ordner js fehlt oder hat einen Fehler') : ok('Lagebild und Sprachbefehle geladen');
    }

    /* ---------------- Ablauf ---------------- */
    // [Gruppe, Name, Funktion, teuer?]
    const PRUEFUNGEN = [
        ['Handy', 'Standort', pruefStandort], ['Handy', 'Mikrofon', pruefMikro], ['Handy', 'Kamera', pruefKamera], ['Handy', 'Benachrichtigungen', pruefPush],
        ['Handy', 'Speicher', pruefSpeicher], ['Handy', 'Stimme (Handy)', pruefStimme], ['Handy', 'Netz', pruefNetz], ['Handy', 'Uhrzeit', pruefUhr],
        ['Programm', 'Programmdateien', pruefDateien], ['Programm', 'Bausteine', pruefBausteine], ['Programm', 'Funktionen', pruefFunktionen], ['Programm', 'Programmfehler', pruefFehler], ['Programm', '3D-Kopf', pruefModelle],
        ['Google', 'Google Kalender', pruefKalender], ['Google', 'Gmail', pruefGmail],
        ['Dienste', 'Wetter', pruefWetter], ['Dienste', 'Spritpreise', pruefSprit], ['Dienste', 'Karten', pruefKarten], ['Dienste', 'KI', pruefKI, true],
        ['Dienste', 'Google-Route', pruefRoute, true], ['Dienste', 'Verkehr', pruefVerkehr], ['Dienste', 'Diesel-Suche', pruefDiesel],
        ['Server', 'App-Code', pruefAppCode], ['Server', 'Langzeitgedächtnis', pruefGedaechtnis], ['Server', 'Abgleich', pruefAbgleich], ['Server', 'Push-Server', pruefPushServer],
        ['Server', 'Mail-Wächter', pruefMailWaechter], ['Server', 'Nachrichten', pruefNachrichten], ['Server', 'Filme', pruefFilme], ['Server', 'Stimme Edge', pruefEdge],
        ['Server', 'Stimme Fish', pruefFish, true], ['Server', 'YouTube', pruefYoutube, true],
        ['Daten', 'Heimatadresse', () => pruefAdresse('helfer_home_address', 'Heimatadresse')], ['Daten', 'Arbeitsadresse', () => pruefAdresse('helfer_work_address', 'Arbeitsadresse')],
        ['Weckruf-App', 'Jarvis-App', pruefApp], ['Weckruf-App', 'Weckwort', pruefWeckwort]
    ];

    async function sammeln(leicht) {
        const res = [];
        posMerk = null; googleStatus = null;
        // Alle Prüfungen gleichzeitig
        await Promise.all(PRUEFUNGEN.map((p, nr) => [p, nr]).filter(([p]) => !(leicht && p[3])).map(async ([[gruppe, name, fn], nr]) => {
            let r;
            try { r = await fn(); } catch (e) { r = schlecht('Prüfung selbst ist abgestürzt: ' + (e && e.message || e), ''); }
            res.push({ gruppe, name, ok: r.ok, text: r.text, fix: r.fix || '', nr });
        }));
        res.sort((a, b) => (GRUPPEN.indexOf(a.gruppe) - GRUPPEN.indexOf(b.gruppe)) || ((a.nr || 0) - (b.nr || 0)));
        return res;
    }
    window.collectSystemChecksVoll = sammeln;
    // Wer collectSystemChecks aufruft (z. B. alte Fenster), bekommt jetzt ebenfalls alles
    window.collectSystemChecks = function () { return sammeln(false); };
    window.collectSystemChecks._jvVoll = true;

    const symbol = (o) => o === true ? '✅' : o === false ? '❌' : '⚠️';
    function alsText(res) {
        let out = '', g = '';
        res.forEach(r => {
            if (r.gruppe !== g) { g = r.gruppe; out += (out ? '\n' : '') + '— ' + g.toUpperCase() + ' —\n'; }
            out += symbol(r.ok) + ' ' + r.name + ': ' + r.text + (r.ok !== true && r.fix ? '\n    → ' + r.fix : '') + '\n';
        });
        const bad = res.filter(r => r.ok === false).length, hin = res.filter(r => r.ok === null).length;
        out += '\n' + (bad === 0 ? 'Alles in Ordnung.' : bad + ' Problem' + (bad > 1 ? 'e' : '') + ' gefunden.') + (hin ? ' ' + hin + ' Hinweis' + (hin > 1 ? 'e' : '') + '.' : '');
        out += '\n(' + new Date().toLocaleString('de-DE') + (IN_APP() ? ', Jarvis-App' : ', Browser') + ')';
        return out;
    }
    window.__jvCheckText = alsText;


    /* Namen, die andere Dateien noch benutzen (localcommands.js ruft isSystemCheckCommand) */
    window.checkWithTimeout = (p, ms) => mit(p, ms, 'Zeitüberschreitung');
    window.isSystemCheckCommand = function (text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60) return false;
        return /\b(systemcheck|systemprüfung|systemtest|selbsttest)\b/.test(t)
            || /\bprüf\w*\s+(?:mal\s+)?(?:bitte\s+)?(?:alle\s+|alles\b|die\s+)?(?:verbindungen|schnittstellen|systeme)\b/.test(t)
            || /\balles prüfen\b/.test(t);
    };

    /* Knopf im Menü */
    window.runSystemCheck = async function () {
        const out = document.getElementById('systemCheckOutput');
        const show = (t) => { if (out) { out.textContent = t; out.classList.remove('hidden'); } };
        show('Prüfe alles, das dauert bis zu einer halben Minute ...');
        try {
            const res = await sammeln(false);
            window.__jvLetzterCheck = res;
            const text = alsText(res);
            show(text);
            let b = document.getElementById('systemCheckCopy');
            if (!b && out && out.parentNode) {
                b = document.createElement('button'); b.id = 'systemCheckCopy'; b.type = 'button'; b.textContent = '📋 Ergebnis kopieren';
                b.className = 'w-full bg-slate-800 hover:bg-slate-700 text-[#49d7ff] py-2 rounded-lg text-xs font-bold border border-[#49d7ff]/40';
                out.parentNode.insertBefore(b, out.nextSibling);
            }
            if (b) b.onclick = async () => { try { await navigator.clipboard.writeText(alsText(window.__jvLetzterCheck || res)); b.textContent = '✅ Kopiert'; } catch (e) { b.textContent = 'Kopieren nicht möglich, bitte Screenshot'; } setTimeout(() => { b.textContent = '📋 Ergebnis kopieren'; }, 2500); };
        } catch (e) { show('❌ Unerwarteter Fehler: ' + (e && e.message ? e.message : e)); }
    };

    /* Per Sprache und als Fenster */
    window.runSystemCheckSpoken = async function () {
        try { if (typeof speakAck === 'function') speakAck('Ich prüfe alles. Das dauert einen Moment.'); } catch (e) {}
        try {
            const res = await sammeln(false);
            window.__jvLetzterCheck = res;
            const bad = res.filter(r => r.ok === false), hin = res.filter(r => r.ok === null);
            if (typeof clearActionCards === 'function') clearActionCards();
            if (window.jvPanel) {
                window.jvPanel.zeigen({
                    titel: 'SYSTEMCHECK', zeit: bad.length ? bad.length + ' PROBLEM' + (bad.length > 1 ? 'E' : '') : 'ALLES OK',
                    text: hin.length ? hin.length + ' Hinweis' + (hin.length > 1 ? 'e' : '') + ' im Menü unter "Alles prüfen"' : '',
                    zeilen: bad.length ? bad.map(r => ({ ok: false, text: r.name + ': ' + r.text })) : [{ ok: true, text: res.length + ' Prüfungen bestanden' }], sek: bad.length ? 30 : 12
                });
            }
            if (bad.length && typeof showActionCards === 'function') showActionCards(bad.slice(0, 6).map(r => ({ icon: '❌', title: r.name, subtitle: r.text + (r.fix ? ' → ' + r.fix : '') })));
            const sag = bad.length === 0
                ? 'Systemcheck abgeschlossen. Alle ' + res.length + ' Prüfungen sind in Ordnung.' + (hin.length ? ' ' + (hin.length === 1 ? 'Ein Hinweis' : hin.length + ' Hinweise') + ' stehen im Menü.' : '')
                : 'Systemcheck abgeschlossen. ' + (bad.length === 1 ? 'Ein Problem' : bad.length + ' Probleme') + ': ' + bad.map(r => r.name).join(', ') + '. Die Lösungen stehen unten.';
            if (typeof speak === 'function') speak(sag, typeof continueConversation === 'function' ? continueConversation : undefined);
        } catch (e) { try { speak('Der Systemcheck ist leider fehlgeschlagen.'); } catch (x) {} }
    };

    /* Einmal am Tag still im Hintergrund: meldet sich nur, wenn etwas kaputt ist */
    const AUTO_KEY = 'jv_autocheck', LETZT_KEY = 'jv_autocheck_tag';
    async function tagesCheck() {
        try {
            if (pd(AUTO_KEY, 'an') === 'aus' || document.hidden) return;
            if (/alarm=/.test(location.search)) return;
            const heute = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
            if (localStorage.getItem(LETZT_KEY) === heute) return;
            localStorage.setItem(LETZT_KEY, heute);
            const res = await sammeln(true);
            window.__jvLetzterCheck = res;
            const bad = res.filter(r => r.ok === false);
            if (!bad.length || !window.jvPanel) return;
            window.jvPanel.zeigen({ titel: 'SYSTEMCHECK', zeit: bad.length + ' PROBLEM' + (bad.length > 1 ? 'E' : ''), text: 'Sag „Systemcheck“ für alle Einzelheiten.', zeilen: bad.slice(0, 4).map(r => ({ ok: false, text: r.name + ': ' + r.text })), sek: 25 });
        } catch (e) {}
    }
    setTimeout(tagesCheck, 45000);

    if (window.jvCommands && typeof window.jvCommands.use === 'function') {
        window.jvCommands.use('autocheck', function (text, next) {
            const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
            const m = t.match(/^(?:(?:jarvis|zane|nova) )?(?:automatischen? )?(?:systemcheck|tagescheck|selbsttest) (?:automatisch )?(an|aus|ein)(?:schalten)?$/) || t.match(/^(?:schalte? )?(?:den )?(?:automatischen? )?(?:systemcheck|tagescheck) (an|aus|ein)(?:schalten)?$/);
            if (!m) return next(text);
            const v = m[1] === 'aus' ? 'aus' : 'an';
            sd(AUTO_KEY, v);
            try { speak(v === 'aus' ? 'Der tägliche Systemcheck im Hintergrund ist aus.' : 'Der tägliche Systemcheck im Hintergrund ist an. Ich melde mich nur, wenn etwas nicht stimmt.', typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {}
            return true;
        }, 150);
    }
})();
