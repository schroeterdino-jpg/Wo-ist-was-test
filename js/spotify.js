/* ============================================================
   SPOTIFY: Jarvis startet und steuert Spotify per Sprache ("Spiel Helene Fischer auf Spotify", "Musik pausieren", "Nächstes Lied", "Musik lauter").
   Anmeldung: einmal "Spotify verbinden" (Spotify-Anmeldung mit PKCE, ohne Server und ohne Geheimnis). Rückweg auf https://wo-ist-was-test.vercel.app/?code=...
   Token liegen nur auf dem Handy (localStorage "jv_spotify"); Spotify verlangt Premium und eine Entwickler-App (Client ID unten, Redirect-URI muss genau stimmen).
   Läuft nirgends ein Spotify-Gerät, öffnet Jarvis die Spotify-App (ZaneNative.spotifyOeffnen, nur APK) und startet die Musik, sobald das Gerät da ist
   (oder sobald du zu Jarvis zurückkehrst).
   Braucht: commands.js (jvCommands), voice.js (speak). Order 7.
   ============================================================ */
(function () {
    'use strict';
    const CLIENT_ID = '038bf83d70064b9bbf36f33e3a1ee57f';
    const REDIRECT = 'https://wo-ist-was-test.vercel.app/';
    const SCOPES = 'user-modify-playback-state user-read-playback-state user-read-currently-playing';
    const KEY = 'jv_spotify', PKCE = 'jv_spotify_pkce', PENDING = 'jv_spotify_pending';
    const API = 'https://api.spotify.com/v1';

    function sagen(t) { try { speak(t); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function roh(t) { return String(t || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function laden(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
    function speichern(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
    function verbunden() { const t = laden(KEY); return !!(t && t.refresh); }
    function schlaf(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function hinweis(text) {
        try {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:99999;background:#04090f;border:1px solid #4cffb0;color:#e8f3f9;padding:10px 16px;border-radius:10px;font:14px sans-serif;max-width:90vw';
            d.textContent = text; document.body.appendChild(d); setTimeout(function () { try { d.remove(); } catch (e) { } }, 6000);
        } catch (e) { }
    }

    /* ---------- Anmeldung (PKCE) ---------- */
    function zufall(n) {
        const a = new Uint8Array(n); crypto.getRandomValues(a);
        return Array.from(a, function (b) { return 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'[b % 62]; }).join('');
    }
    function b64url(buf) {
        let s = ''; new Uint8Array(buf).forEach(function (b) { s += String.fromCharCode(b); });
        return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    }
    async function login() {
        if (location.origin + '/' !== REDIRECT) { sagen('Die Spotify-Anmeldung geht nur in der richtigen Jarvis-App.'); return; }
        if (!(window.crypto && crypto.subtle)) { sagen('Hier fehlt eine Sicherheitsfunktion für die Anmeldung.'); return; }
        const verifier = zufall(64), state = 'jvsp' + zufall(12);
        const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
        speichern(PKCE, { v: verifier, state: state, t: Date.now() });
        const url = 'https://accounts.spotify.com/authorize?' + new URLSearchParams({
            response_type: 'code', client_id: CLIENT_ID, scope: SCOPES, redirect_uri: REDIRECT,
            code_challenge_method: 'S256', code_challenge: challenge, state: state
        }).toString();
        sagen('Ich öffne die Spotify-Anmeldung.');
        setTimeout(function () { location.href = url; }, 1800);
    }
    async function tokenHolen(params) {
        const r = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString()
        });
        const j = await r.json().catch(function () { return {}; });
        if (!r.ok || !j.access_token) throw new Error((j && (j.error_description || j.error)) || ('Fehler ' + r.status));
        const alt = laden(KEY) || {};
        speichern(KEY, { access: j.access_token, refresh: j.refresh_token || alt.refresh, exp: Date.now() + (j.expires_in || 3600) * 1000 });
        return j.access_token;
    }
    async function rueckweg() {
        try {
            const q = new URLSearchParams(location.search);
            const code = q.get('code'), state = q.get('state'), fehler = q.get('error');
            if (!state || state.indexOf('jvsp') !== 0) return;
            try { history.replaceState(null, '', location.pathname); } catch (e) { }
            const p = laden(PKCE); speichern(PKCE, null);
            if (fehler) { hinweis('Spotify: Anmeldung abgebrochen.'); return; }
            if (!code || !p || p.state !== state) { hinweis('Spotify: Anmeldung passt nicht, bitte nochmal "Spotify verbinden" sagen.'); return; }
            await tokenHolen({ client_id: CLIENT_ID, grant_type: 'authorization_code', code: code, redirect_uri: REDIRECT, code_verifier: p.v });
            hinweis('Spotify ist verbunden.');
            setTimeout(function () { sagen('Spotify ist verbunden.'); }, 1500);
        } catch (e) { hinweis('Spotify: Anmeldung fehlgeschlagen (' + (e && e.message) + ').'); }
    }
    async function zugang() {
        const t = laden(KEY);
        if (!t || !t.refresh) return null;
        if (t.access && t.exp - 60000 > Date.now()) return t.access;
        try { return await tokenHolen({ client_id: CLIENT_ID, grant_type: 'refresh_token', refresh_token: t.refresh }); }
        catch (e) { return null; }
    }

    /* ---------- Web-API ---------- */
    async function ruf(methode, pfad, body, schon) {
        const tok = await zugang();
        if (!tok) return { status: 401 };
        let r;
        try {
            r = await fetch(API + pfad, { method: methode, headers: Object.assign({ Authorization: 'Bearer ' + tok }, body ? { 'Content-Type': 'application/json' } : {}), body: body ? JSON.stringify(body) : undefined });
        } catch (e) { return { status: 0 }; }
        if (r.status === 401 && !schon) { const t = laden(KEY); if (t) { t.exp = 0; speichern(KEY, t); } return ruf(methode, pfad, body, true); }
        let j = null; try { if (r.status !== 204) j = await r.json(); } catch (e) { }
        return { status: r.status, json: j };
    }
    function fehlerText(r) {
        if (r.status === 401) return 'Spotify ist nicht verbunden. Sag Spotify verbinden.';
        if (r.status === 403) return 'Spotify erlaubt das nicht. Fehler 403.';
        if (r.status === 429) return 'Spotify bremst gerade. Versuch es gleich nochmal.';
        if (r.status === 0) return 'Ich komme gerade nicht ins Internet.';
        return 'Spotify meldet Fehler ' + r.status + '.';
    }
    function erfolg(r) { return r.status >= 200 && r.status < 300; }

    async function geraet() {
        const r = await ruf('GET', '/me/player/devices');
        const l = (r.json && r.json.devices) || [];
        return l.find(function (d) { return d.is_active; }) || l.find(function (d) { return /smartphone/i.test(d.type || ''); }) || l[0] || null;
    }
    /* Musik starten; body = { context_uri } oder { uris } oder leer (weiterspielen) */
    async function abspielen(body, ansage, schon) {
        let r = await ruf('PUT', '/me/player/play', body || undefined);
        if (r.status === 404) {
            let g = await geraet();
            if (!g && !schon) {
                speichern(PENDING, { body: body || null, ansage: ansage, t: Date.now() });
                let offen = false; try { offen = !!(window.ZaneNative && ZaneNative.spotifyOeffnen && ZaneNative.spotifyOeffnen()); } catch (e) { }
                if (!offen) { speichern(PENDING, null); sagen('Ich finde kein Spotify-Gerät. Öffne bitte die Spotify-App einmal.'); return; }
                for (let i = 0; i < 8 && !g; i++) { await schlaf(1500); g = await geraet(); }
                if (!g) { sagen('Spotify ist offen. Komm zu Jarvis zurück, dann starte ich die Musik.'); return; }
                speichern(PENDING, null);
            }
            if (g) r = await ruf('PUT', '/me/player/play?device_id=' + encodeURIComponent(g.id), body || undefined);
            else { sagen('Ich finde kein Spotify-Gerät.'); return; }
        }
        if (erfolg(r)) { if (ansage) sagen(ansage); return; }
        sagen(fehlerText(r));
    }
    async function suchenUndSpielen(anfrage, art) {
        let q = anfrage.replace(/\s+/g, ' ').trim();
        if (!q) { return abspielen(null, 'Okay.'); }
        const typ = art || 'track,artist';
        const r = await ruf('GET', '/search?q=' + encodeURIComponent(q) + '&type=' + typ + '&limit=5');
        if (!erfolg(r)) { sagen(fehlerText(r)); return; }
        const j = r.json || {};
        const ok = function (a) { return ((a && a.items) || []).filter(Boolean); };
        const kue = ok(j.artists), tit = ok(j.tracks), pl = ok(j.playlists), al = ok(j.albums);
        if (art === 'playlist') { if (pl[0]) return abspielen({ context_uri: pl[0].uri }, 'Ich spiele die Playlist ' + pl[0].name + '.'); }
        else if (art === 'album') { if (al[0]) return abspielen({ context_uri: al[0].uri }, 'Ich spiele das Album ' + al[0].name + '.'); }
        else {
            const nq = norm(q);
            const treffer = kue.find(function (a) { return norm(a.name) === nq; });
            if (treffer) return abspielen({ context_uri: treffer.uri }, 'Ich spiele ' + treffer.name + '.');
            if (tit[0]) return abspielen({ uris: [tit[0].uri] }, 'Ich spiele ' + tit[0].name + (tit[0].artists && tit[0].artists[0] ? ' von ' + tit[0].artists[0].name : '') + '.');
            if (kue[0]) return abspielen({ context_uri: kue[0].uri }, 'Ich spiele ' + kue[0].name + '.');
        }
        sagen('Dazu habe ich bei Spotify nichts gefunden.');
    }
    async function steuern(was) {
        let r;
        if (was === 'pause') r = await ruf('PUT', '/me/player/pause');
        else if (was === 'weiter') return abspielen(null, '');
        else if (was === 'naechste') r = await ruf('POST', '/me/player/next');
        else if (was === 'zurueck') r = await ruf('POST', '/me/player/previous');
        if (r && (erfolg(r))) return;
        if (r && r.status === 404) { sagen('Es läuft gerade nichts auf Spotify.'); return; }
        sagen(fehlerText(r || { status: 0 }));
    }
    async function lautstaerke(ziel, schritt) {
        let v = ziel;
        if (v == null) {
            const s = await ruf('GET', '/me/player');
            const cur = s.json && s.json.device && s.json.device.volume_percent;
            if (cur == null) { sagen('Es läuft gerade nichts auf Spotify.'); return; }
            v = cur + schritt;
        }
        v = Math.max(0, Math.min(100, Math.round(v)));
        const r = await ruf('PUT', '/me/player/volume?volume_percent=' + v);
        if (erfolg(r)) return;
        sagen(r.status === 404 ? 'Es läuft gerade nichts auf Spotify.' : fehlerText(r));
    }
    async function wasLaeuft(text, next) {
        const r = await ruf('GET', '/me/player/currently-playing');
        const it = r.json && r.json.item;
        if (erfolg(r) && it && r.json.is_playing) { sagen(it.name + (it.artists && it.artists[0] ? ' von ' + it.artists[0].name : '') + '.'); return true; }
        return false;
    }

    /* ---------- Sprachbefehle ---------- */
    function befehl(text, next) {
        const t = roh(text);
        if (!t || t.split(' ').length > 14 || !/spotify|musik|lied|song|titel|playlist|album|spiel|n(ä|ae)chst|(ü|ue)berspring|vorherig|zur(ü|ue)ck|l(ä|ae)uft|spielt|lauter|leiser/.test(t)) return next(text);
        const S = '(?:bitte )?';
        const nein = function (msg) { sagen(msg || 'Spotify ist noch nicht verbunden. Sag: Spotify verbinden.'); return true; };

        if (new RegExp('^' + S + 'spotify (?:verbinden|anmelden|einrichten|koppeln|login|einloggen)$').test(t)) { login(); return true; }
        if (new RegExp('^' + S + 'spotify (?:trennen|abmelden|ausloggen)$').test(t)) { speichern(KEY, null); sagen('Spotify ist getrennt.'); return true; }
        if (/^spotify status$/.test(t)) { sagen(verbunden() ? 'Spotify ist verbunden.' : 'Spotify ist nicht verbunden.'); return true; }

        const aktion = function (fn) { if (!verbunden()) return nein(); fn(); return true; };
        let m;
        if (new RegExp('^' + S + '(?:mach )?(?:die )?(?:musik|spotify)(?: bitte)? (?:pause|pausieren|stopp|stop|aus|anhalten|ausmachen|ausschalten)$').test(t) || /^musik (?:pausieren|anhalten|ausmachen|stoppen)$/.test(t) || /^pausiere (?:die )?musik$/.test(t))
            return aktion(function () { steuern('pause'); });
        if (new RegExp('^' + S + '(?:mach )?(?:die )?(?:musik|spotify)(?: bitte)? (?:weiter|an|fortsetzen|weiterspielen|starten|play|los)$').test(t) || /^(?:mach )?(?:die )?musik (?:an|weiter)$/.test(t) || /^spiel(?:e)? (?:weiter|musik)$/.test(t) || /^spotify (?:starten|starte|öffnen|oeffnen)$/.test(t) || /^spotify$/.test(t))
            return aktion(function () { steuern('weiter'); });
        if (new RegExp('^' + S + '(?:das )?(?:n(?:ä|ae)chste[sr]?|(?:ü|ue)berspring(?:e|en)?|skip|next)(?: das)?(?: lied| song| titel| st(?:ü|ue)ck)?$').test(t) && verbunden())
            { steuern('naechste'); return true; }
        if (new RegExp('^' + S + '(?:das )?(?:vorherige[sr]?|letzte[sr]?|zur(?:ü|ue)ck) (?:lied|song|titel|st(?:ü|ue)ck)$').test(t) && verbunden())
            { steuern('zurueck'); return true; }
        m = t.match(new RegExp('^' + S + '(?:mach )?(?:die )?(?:musik|spotify) (lauter|leiser)$'));
        if (m) return aktion(function () { lautstaerke(null, m[1] === 'lauter' ? 15 : -15); });
        m = t.match(new RegExp('^' + S + '(?:musik|spotify)(?: lautst(?:ä|ae)rke)? (?:auf )?(\\d{1,3})(?: prozent)?$'));
        if (m) return aktion(function () { lautstaerke(parseInt(m[1], 10)); });
        if (/^(?:was l(?:ä|ae)uft|was spielt|welches lied|welcher song|welcher titel|was ist das f(?:ü|ue)r (?:ein )?(?:lied|song))(?: gerade| jetzt| da)?(?: l(?:ä|ae)uft| spielt)?$/.test(t) && verbunden()) {
            wasLaeuft().then(function (ok) { if (!ok) { try { next(text); } catch (e) { } } }); return true;
        }

        /* Spielen: mit "Spotify" im Satz immer, ohne nur wenn verbunden und es nach Musik klingt */
        let q = null;
        m = t.match(new RegExp('^' + S + '(?:spiel|spiele|spielt|starte|start|mach|leg|lege|h(?:ö|oe)re|h(?:ö|oe)r) (?:mir )?(.+?) (?:auf|bei|mit|(?:ü|ue)ber|in|per) spotify(?: ab| an)?$'));
        if (m) q = m[1];
        if (q == null) { m = t.match(new RegExp('^' + S + 'spotify (?:spiel|spiele|starte|start) (?:mir )?(.+)$')); if (m) q = m[1]; }
        let mitSpotify = q != null;
        if (q == null && verbunden() && /(musik|lied|song|titel|playlist|album| von | vom )/.test(' ' + t + ' ')) {
            m = t.match(new RegExp('^' + S + '(?:spiel|spiele|spielt) (?:mir )?(.+?)(?: ab)?$'));
            if (m) q = m[1];
        }
        if (q == null) return next(text);
        if (!verbunden()) return nein();
        let art = null;
        if (/\bplaylist\b/.test(q)) { art = 'playlist'; q = q.replace(/\bplaylist\b/g, ' '); }
        else if (/\balbum\b/.test(q)) { art = 'album'; q = q.replace(/\balbum\b/g, ' '); }
        q = q.replace(/^(?:die |das |den |der |ein |eine |einen |mir )+/, '').replace(/^(?:musik|lieder|lied|songs|song|titel|st(?:ü|ue)ck)(?: von| vom|:)? ?/, '').replace(/^(?:von|vom) /, '').replace(/\s+/g, ' ').trim();
        suchenUndSpielen(q, art);
        return true;
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('spotify', befehl, 7);

    /* Wartende Musik starten, sobald Jarvis wieder vorn ist (nach dem Öffnen der Spotify-App) */
    document.addEventListener('visibilitychange', async function () {
        try {
            if (document.visibilityState !== 'visible') return;
            const p = laden(PENDING);
            if (!p) return;
            speichern(PENDING, null);
            if (Date.now() - p.t > 90000 || !verbunden()) return;
            await schlaf(800);
            abspielen(p.body, p.ansage, true);
        } catch (e) { }
    });

    window.jvSpotify = { verbunden: verbunden, login: login };
    rueckweg();
})();
