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
    const SCOPES = 'user-modify-playback-state user-read-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative';
    const KEY = 'jv_spotify', PKCE = 'jv_spotify_pkce', PENDING = 'jv_spotify_pending';
    const API = 'https://api.spotify.com/v1';

    function sagen(t) { try { speak(t); } catch (e) { } }
    function norm(t) { return String(t || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function roh(t) { return String(t || '').toLowerCase().replace(/[.,!?;:"„“]+/g, ' ').replace(/\s+/g, ' ').trim(); }
    function laden(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
    function speichern(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } }
    const AKTIV = 'jv_spotify_aktiv';
    function aktivMerken() { try { localStorage.setItem(AKTIV, String(Date.now())); } catch (e) { } }
    function aktivJetzt() { try { return Date.now() - parseInt(localStorage.getItem(AKTIV) || '0', 10) < 3 * 3600 * 1000; } catch (e) { return false; } }
    function verbunden() { const t = laden(KEY); return !!(t && t.refresh); }
    function schlaf(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
    function hinweis(text, bleibt) {
        try {
            const d = document.createElement('div');
            d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:90px;z-index:99999;background:#04090f;border:1px solid #4cffb0;color:#e8f3f9;padding:10px 16px;border-radius:10px;font:14px sans-serif;max-width:90vw';
            d.textContent = text;
            if (bleibt) { d.textContent = text + '  (zum Schließen tippen)'; d.onclick = function () { try { d.remove(); } catch (e) { } }; document.body.appendChild(d); return; }
            document.body.appendChild(d); setTimeout(function () { try { d.remove(); } catch (e) { } }, 6000);
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
        speichern(KEY, { access: j.access_token, refresh: j.refresh_token || alt.refresh, scope: j.scope || alt.scope || '', exp: Date.now() + (j.expires_in || 3600) * 1000 });
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
        return { status: r.status, json: j, pfad: methode + ' ' + pfad.split('?')[0] };
    }
    function fehlerText(r) {
        if (r.status === 401) return 'Spotify ist nicht verbunden. Sag Spotify verbinden.';
        if (r.status === 403) return 'Spotify erlaubt das nicht. Fehler 403.';
        if (r.status === 429) return 'Spotify bremst gerade. Versuch es gleich nochmal.';
        if (r.status === 0) return 'Ich komme gerade nicht ins Internet.';
        return 'Spotify meldet Fehler ' + r.status + '.';
    }
    /* Genaue Fehlermeldung zusätzlich als Text auf dem Bildschirm (zum Weitersagen an Claude) */
    function fehlerZeigen(r) {
        try { hinweis('Spotify ' + r.status + ' bei ' + (r.pfad || '?') + ': ' + ((r.json && r.json.error && (r.json.error.message || r.json.error.reason)) || 'ohne Text')); } catch (e) { }
    }
    function erfolg(r) { return r.status >= 200 && r.status < 300; }

    /* Immer dieses Handy nehmen (nicht das zuletzt benutzte Gerät, z. B. Alexa) */
    async function geraet() {
        const r = await ruf('GET', '/me/player/devices');
        const l = (r.json && r.json.devices) || [];
        return { handy: l.find(function (d) { return /smartphone/i.test(d.type || ''); }) || null, alle: l };
    }
    /* Neue APK: Spotify direkt auf dem Handy starten lassen (klappt auch bei geschlossener App). Ohne neue APK oder ohne Angaben: false. */
    function nativSpielen(info) {
        try { return !!(info && info.titel && window.ZaneNative && ZaneNative.spotifySpielen && ZaneNative.spotifySpielen(JSON.stringify(info))); } catch (e) { return false; }
    }
    async function nativErgebnis(ansage) {
        aktivMerken(); if (ansage) sagen(ansage);
        setTimeout(miniAktualisieren, 6000);
    }
    /* Musik starten; body = { context_uri } oder { uris } oder leer (weiterspielen); info = { typ, titel, kuenstler } für den direkten Start über die App */
    async function abspielen(body, ansage, schon, info) {
        let d = await geraet();
        let g = d.handy;
        let kalt = false;
        if (!g && !schon && nativSpielen(info)) { await nativErgebnis(ansage); return; }
        if (!g && !schon) {
            speichern(PENDING, { body: body || null, ansage: ansage, t: Date.now() });
            let offen = false; try { offen = !!(window.ZaneNative && ZaneNative.spotifyOeffnen && ZaneNative.spotifyOeffnen()); } catch (e) { }
            if (!offen) { speichern(PENDING, null); g = d.alle[0] || null; if (!g) { sagen('Ich finde kein Spotify-Gerät. Öffne bitte die Spotify-App einmal.'); return; } }
            else {
                for (let i = 0; i < 8 && !g; i++) { await schlaf(1500); g = (await geraet()).handy; }
                if (!g) { sagen('Spotify ist offen. Komm zu Jarvis zurück, dann starte ich die Musik.'); return; }
                speichern(PENDING, null);
                kalt = true; await schlaf(4500);   /* frisch gestartete App braucht einen Moment, bevor sie Befehle wirklich ausführt */
            }
        }
        if (!g) g = d.alle[0] || null;
        if (!g) { sagen('Ich finde kein Spotify-Gerät.'); return; }
        if (!g.is_active) {
            await ruf('PUT', '/me/player', { device_ids: [g.id], play: false }); await schlaf(1500);
            let aktiv = false; try { const h = (await geraet()).handy; aktiv = !!(h && h.is_active); } catch (e) { }
            /* Spotify führt eine geschlossene App weiter als "Gerät" in der Liste, schickt aber nichts an sie.
               Wird das Handy nach dem Umschalten nicht aktiv, ist die App zu: dann erst öffnen und warten, bis sie wirklich aktiv ist. */
            if (!aktiv && !schon && /smartphone/i.test(g.type || '') && nativSpielen(info)) { await nativErgebnis(ansage); return; }
            if (!aktiv && !schon && /smartphone/i.test(g.type || '')) {
                speichern(PENDING, { body: body || null, ansage: ansage, t: Date.now() });
                let offen = false; try { offen = !!(window.ZaneNative && ZaneNative.spotifyOeffnen && ZaneNative.spotifyOeffnen()); } catch (e) { }
                if (offen) {
                    kalt = true;
                    for (let i = 0; i < 9 && !aktiv; i++) {
                        await schlaf(2000);
                        if (i % 2 === 1) await ruf('PUT', '/me/player', { device_ids: [g.id], play: false });
                        const h = (await geraet()).handy; aktiv = !!(h && h.is_active);
                    }
                    if (!aktiv) { sagen('Spotify ist offen. Komm zu Jarvis zurück, dann starte ich die Musik.'); return; }
                    speichern(PENDING, null);
                    await schlaf(2500);
                } else { speichern(PENDING, null); }
            }
        }
        const pfadPlay = '/me/player/play?device_id=' + encodeURIComponent(g.id);
        const r = await ruf('PUT', pfadPlay, body || undefined);
        if (erfolg(r)) {
            /* Spotify bestätigt den Befehl oft, obwohl das Handy noch gar nicht spielt (frisch geöffnete App). Darum nachprüfen und notfalls erneut senden. */
            let stand = null, laeuft = false;
            const versuche = kalt ? 7 : 4;
            for (let k = 0; k < versuche && !laeuft; k++) {
                await schlaf(k === 0 ? 1800 : (kalt ? 2800 : 2200));
                const st = await ruf('GET', '/me/player');
                stand = st.json || null;
                laeuft = !!(stand && stand.is_playing && (!body || !body.uris || (stand.item && stand.item.uri === body.uris[0])));
                if (!laeuft && k < versuche - 1) {
                    /* Kaltstart: jeden zweiten Versuch das Handy neu als Abspielgerät setzen, dann erst Play */
                    if (kalt && k % 2 === 1) { await ruf('PUT', '/me/player', { device_ids: [g.id], play: false }); await schlaf(1200); }
                    await ruf('PUT', pfadPlay, body || undefined);
                }
            }
            if (laeuft) { aktivMerken(); setTimeout(miniAktualisieren, 1500); if (ansage) sagen(ansage); return; }
            /* Spotify hat Play angenommen, spielt aber nichts: dann die App direkt bitten (neue APK) */
            if (nativSpielen(info)) { await nativErgebnis(ansage); return; }
            try {
                const dl = (await geraet()).alle.map(function (x) { return x.name + ' (' + x.type + (x.is_active ? ', aktiv' : '') + ')'; }).join('; ');
                hinweis('Spotify-Stand: Befehl an ' + (g.name || '?') + ' (' + (g.type || '?') + ', ' + (g.is_active ? 'aktiv' : 'nicht aktiv') + ') gesendet, Antwort ' + r.status + '. Spotify meldet: ' + (stand && stand.device ? stand.device.name : 'kein Gerät') + ', spielt: ' + (stand && stand.is_playing ? 'ja' : 'nein') + (stand && stand.item ? ', Lied: ' + stand.item.name : '') + '. Geräte: ' + (dl || 'keine'), true);
            } catch (e) { }
            sagen('Spotify hat den Befehl angenommen, aber die Musik startet nicht. Tippe in Spotify einmal auf Play.');
            return;
        }
        fehlerZeigen(r); sagen(fehlerText(r));
    }
    async function suchenUndSpielen(anfrage, art) {
        let q = anfrage.replace(/\s+/g, ' ').trim();
        if (!q) { return abspielen(null, 'Okay.'); }
        const typ = art || 'track,artist';
        const ok = function (a) { return ((a && a.items) || []).filter(function (x) { return x && x.is_playable !== false; }); };
        /* "Titel von Künstler": gezielt nach Titel UND Künstler suchen, sonst findet Spotify mit dem Wort "von" oft das falsche Lied.
           Die Spracherkennung verhört Namen gern ("Lene Fischer"), darum mehrere Versuche vom genauen zum freien. */
        let titelQ = null, kuenstlerQ = null;
        if (!art) { const tv = q.match(/^(.+?) (?:von der|von dem|von den|von die|von|vom|by) (.+)$/); if (tv) { titelQ = tv[1].trim(); kuenstlerQ = tv[2].trim(); } }
        let r = null;
        if (!art) {
            const nt = norm(titelQ || q), nk = norm(kuenstlerQ || '');
            const kwort = nk.split(' ').filter(function (w) { return w.length >= 4; });
            const passtK = function (x) { return !nk || (x.artists || []).some(function (a) { const na = norm(a.name); return na.indexOf(nk) >= 0 || nk.indexOf(na) >= 0 || kwort.some(function (w) { return na.indexOf(w) >= 0 || (w.length > 5 && na.indexOf(w.slice(1)) >= 0); }); }); };
            const passtT = function (x) { return norm(x.name).indexOf(nt) >= 0; };
            const versuche = titelQ
                ? ['track:' + titelQ + ' artist:' + kuenstlerQ, titelQ + ' ' + kuenstlerQ, titelQ]
                : [q];
            for (let k = 0; k < versuche.length; k++) {
                const rr = await ruf('GET', '/search?q=' + encodeURIComponent(versuche[k]) + '&type=track&limit=10&market=DE');
                if (!erfolg(rr)) { if (k === versuche.length - 1 && !r) { fehlerZeigen(rr); sagen(fehlerText(rr)); return; } continue; }
                const liste = ok((rr.json || {}).tracks);
                if (!liste.length) continue;
                const gut = liste.find(function (x) { return passtT(x) && passtK(x); }) || (k === versuche.length - 1 ? (liste.find(passtT) || null) : null);
                if (gut) return abspielen({ uris: [gut.uri] }, 'Ich spiele ' + gut.name + (gut.artists && gut.artists[0] ? ' von ' + gut.artists[0].name : '') + '.', false, { typ: 'track', titel: gut.name, uri: gut.uri, kuenstler: (gut.artists && gut.artists[0] ? gut.artists[0].name : '') });
            }
            if (!titelQ) { /* ohne "von": weiter unten Künstler/Playlist-Suche wie bisher */ }
            else { sagen('Dazu habe ich bei Spotify nichts gefunden.'); return; }
        }
        r = await ruf('GET', '/search?q=' + encodeURIComponent(q) + '&type=' + typ + '&limit=5&market=DE');
        if (!erfolg(r)) { fehlerZeigen(r); sagen(fehlerText(r)); return; }
        const j = r.json || {};
        const kue = ok(j.artists), tit = ok(j.tracks), pl = ok(j.playlists), al = ok(j.albums);
        if (art === 'playlist') { const eigene = await meinePlaylists(); const nq = norm(q); const e = eigene.find(function (x) { const n = norm(x.name); return n === nq || n.indexOf(nq) >= 0; }); if (e) return abspielen({ context_uri: e.uri }, 'Ich spiele deine Playlist ' + e.name + '.', false, { typ: 'playlist', titel: e.name, uri: e.uri }); }
        if (art === 'playlist') { if (pl[0]) return abspielen({ context_uri: pl[0].uri }, 'Ich spiele die Playlist ' + pl[0].name + '.', false, { typ: 'playlist', titel: pl[0].name, uri: pl[0].uri }); }
        else if (art === 'album') { if (al[0]) return abspielen({ context_uri: al[0].uri }, 'Ich spiele das Album ' + al[0].name + '.', false, { typ: 'album', titel: al[0].name, uri: al[0].uri, kuenstler: (al[0].artists && al[0].artists[0] ? al[0].artists[0].name : '') }); }
        else {
            const nq = norm(q);
            const treffer = kue.find(function (a) { return norm(a.name) === nq; });
            if (treffer) return abspielen({ context_uri: treffer.uri }, 'Ich spiele ' + treffer.name + '.', false, { typ: 'artist', titel: treffer.name, uri: treffer.uri });
            if (tit[0]) return abspielen({ uris: [tit[0].uri] }, 'Ich spiele ' + tit[0].name + (tit[0].artists && tit[0].artists[0] ? ' von ' + tit[0].artists[0].name : '') + '.', false, { typ: 'track', titel: tit[0].name, uri: tit[0].uri, kuenstler: (tit[0].artists && tit[0].artists[0] ? tit[0].artists[0].name : '') });
            if (kue[0]) return abspielen({ context_uri: kue[0].uri }, 'Ich spiele ' + kue[0].name + '.', false, { typ: 'artist', titel: kue[0].name, uri: kue[0].uri });
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
        if (r) fehlerZeigen(r);
        sagen(fehlerText(r || { status: 0 }));
    }
    async function lautstaerke(ziel, schritt) {
        try {   // Handy-Lautstärke direkt ändern (Spotify erlaubt das bei Handys nicht per Fernsteuerung)
            if (window.ZaneNative && typeof ZaneNative.musikLautstaerke === 'function') {
                let aktuell = ZaneNative.musikLautstaerke(0);
                if (aktuell >= 0) {
                    const delta = ziel != null ? ziel - aktuell : schritt;
                    if (delta !== 0) aktuell = ZaneNative.musikLautstaerke(delta);
                    if (aktuell >= 0) return;
                }
            }
        } catch (e) { }
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


    /* ---------- Fenster zum Aussuchen ---------- */
    let FL = null, tab = 'playlists', suchText = '', pollT = null, sucheT = null, eigenCache = null;
    function esc(x) { return String(x == null ? '' : x).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
    function hatListenRecht() { const t = laden(KEY); return !!(t && /playlist-read-private/.test(t.scope || '')); }
    async function meinePlaylists() {
        if (eigenCache && Date.now() - eigenCache.t < 300000) return eigenCache.l;
        if (!hatListenRecht()) return [];
        const r = await ruf('GET', '/me/playlists?limit=50');
        const l = ((r.json && r.json.items) || []).filter(Boolean);
        if (erfolg(r)) eigenCache = { t: Date.now(), l: l };
        return l;
    }
    function bild(b) { return (b && b.length ? (b[b.length > 1 ? b.length - 2 : 0] || b[0]).url : '') || ''; }
    function zeile(name, sub, img, body, ansage) {
        const id = 'sp' + Math.random().toString(36).slice(2, 8);
        zeile._k[id] = { body: body, ansage: ansage };
        return '<div class="sp-z"><div class="sp-b" style="' + (img ? 'background-image:url(\'' + esc(img) + '\')' : '') + '"></div><div class="sp-t"><div class="sp-n">' + esc(name) + '</div><div class="sp-s">' + esc(sub) + '</div></div><button type="button" class="sp-p" data-k="' + id + '" aria-label="Abspielen">▶</button></div>';
    }
    zeile._k = {};
    function css() {
        if (document.getElementById('sp-style')) return;
        const st = document.createElement('style'); st.id = 'sp-style';
        st.textContent =
            '#sp-layer{position:fixed;inset:0;z-index:8600;background:#04090f;color:#e8f3f9;font-family:"DejaVu Sans Mono",ui-monospace,monospace;display:flex;flex-direction:column;box-sizing:border-box;padding:var(--aa-rand-y,0px) var(--aa-rand-x,0px)}' +
            '#sp-layer .sp-kopf{display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border-bottom:1px solid #1b3a4a}#sp-layer .sp-ti{color:#4cffb0;letter-spacing:.14em;font-size:13px}' +
            '#sp-layer .sp-x{width:52px;height:44px;border:1px solid rgba(93,209,255,.6);border-radius:10px;background:transparent;color:#49d7ff;font-size:22px}' +
            '#sp-layer .sp-such{padding:10px 14px 4px}#sp-layer input{width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid #49d7ff;background:#071521;color:#e8f3f9;font:15px "DejaVu Sans Mono",monospace}' +
            '#sp-layer .sp-tabs{display:flex;gap:8px;padding:8px 14px;flex-wrap:wrap}#sp-layer .sp-tab{border:1px solid #1b3a4a;color:#8fb4c8;border-radius:16px;padding:7px 12px;background:transparent;font:12px "DejaVu Sans Mono",monospace}#sp-layer .sp-tab.an{border-color:#4cffb0;color:#4cffb0;background:rgba(76,255,176,.12)}' +
            '#sp-layer .sp-liste{flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-bottom:8px}#sp-layer .sp-ue{padding:12px 14px 6px;font-size:11px;letter-spacing:.14em;color:#4cffb0}' +
            '#sp-layer .sp-z{display:flex;align-items:center;gap:12px;padding:8px 14px;border-bottom:1px solid #0e2230}#sp-layer .sp-b{width:52px;height:52px;border-radius:8px;background:#12303f center/cover no-repeat;flex:none}' +
            '#sp-layer .sp-t{flex:1;min-width:0}#sp-layer .sp-n{font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}#sp-layer .sp-s{font-size:12px;color:#8fb4c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '#sp-layer .sp-p{width:46px;height:46px;border-radius:50%;border:1px solid #4cffb0;color:#4cffb0;background:transparent;font-size:17px;flex:none}' +
            '#sp-layer .sp-info{padding:18px 14px;font-size:13px;color:#8fb4c8;line-height:1.4}#sp-layer .sp-info button{margin-top:10px;padding:11px 14px;border-radius:10px;border:1px solid #4cffb0;color:#4cffb0;background:transparent;font:700 13px "DejaVu Sans Mono",monospace}' +
            '#sp-layer .sp-fuss{border-top:1px solid #4cffb0;background:#071521;padding:10px 14px calc(10px + env(safe-area-inset-bottom,0px))}#sp-layer .sp-jetzt{display:flex;align-items:center;gap:12px}' +
            '#sp-layer .sp-steu{display:flex;justify-content:space-around;margin-top:8px;gap:6px}#sp-layer .sp-steu button{flex:1;height:46px;border-radius:10px;border:1px solid #1b3a4a;background:transparent;color:#49d7ff;font-size:19px}#sp-layer .sp-steu .gr{color:#4cffb0;border-color:#4cffb0}';
        document.head.appendChild(st);
    }
    function fensterZu() {
        try { if (pollT) clearInterval(pollT); pollT = null; if (FL && FL.parentNode) FL.parentNode.removeChild(FL); } catch (e) { }
        FL = null;
    }
    async function jetzt() {
        if (!FL) return;
        const r = await ruf('GET', '/me/player');
        const el = FL.querySelector('.sp-jetzt'); if (!el) return;
        const it = r.json && r.json.item;
        if (!it) { el.innerHTML = '<div class="sp-t"><div class="sp-n">Es läuft nichts</div><div class="sp-s">Tippe auf ▶ bei einer Playlist</div></div>'; return; }
        const img = bild(it.album && it.album.images);
        el.innerHTML = '<div class="sp-b" style="' + (img ? 'background-image:url(\'' + esc(img) + '\')' : '') + '"></div><div class="sp-t"><div class="sp-n">' + esc(it.name) + '</div><div class="sp-s">' + esc((it.artists || []).map(function (a) { return a.name; }).join(', ')) + (r.json.device ? ' · ' + esc(r.json.device.name) : '') + '</div></div>';
        const pb = FL.querySelector('#sp-pp'); if (pb) pb.textContent = r.json.is_playing ? '⏸' : '▶';
    }
    async function fuellen() {
        if (!FL) return;
        const L = FL.querySelector('.sp-liste'); if (!L) return;
        zeile._k = {};
        const q = suchText.trim();
        let h = '';
        const lade = '<div class="sp-info">Lade …</div>';
        L.innerHTML = lade;
        const mein = async function () {
            if (!hatListenRecht()) return '<div class="sp-info">Für deine eigenen Playlists braucht Jarvis eine zusätzliche Erlaubnis.<br><button type="button" id="sp-neu">Mit Spotify neu verbinden</button></div>';
            const l = (await meinePlaylists()).filter(function (x) { return !q || norm(x.name).indexOf(norm(q)) >= 0; });
            if (!l.length) return q ? '' : '<div class="sp-info">Du hast keine eigenen Playlists.</div>';
            return '<div class="sp-ue">MEINE PLAYLISTS</div>' + l.map(function (x) { return zeile(x.name, (x.items && x.items.total != null ? x.items.total : (x.tracks && x.tracks.total != null ? x.tracks.total : '')) + ' Titel', bild(x.images), { context_uri: x.uri }, 'Ich spiele deine Playlist ' + x.name + '.'); }).join('');
        };
        const typ = { playlists: 'playlist', alben: 'album', lieder: 'track', kuenstler: 'artist' }[tab];
        if (tab === 'playlists') h += await mein();
        if (q || tab !== 'playlists') {
            if (!q) h += '<div class="sp-info">Tippe oben ein, was du suchst.</div>';
            else {
                const r = await ruf('GET', '/search?q=' + encodeURIComponent(q) + '&type=' + typ + '&limit=10');
                if (!erfolg(r)) { fehlerZeigen(r); h += '<div class="sp-info">' + esc(fehlerText(r)) + '</div>'; }
                else {
                    const l = (((r.json || {})[typ + 's'] || {}).items || []).filter(Boolean);
                    h += '<div class="sp-ue">GEFUNDEN BEI SPOTIFY</div>';
                    if (!l.length) h += '<div class="sp-info">Nichts gefunden.</div>';
                    h += l.map(function (x) {
                        if (typ === 'track') return zeile(x.name, (x.artists || []).map(function (a) { return a.name; }).join(', '), bild(x.album && x.album.images), { uris: [x.uri] }, 'Ich spiele ' + x.name + '.');
                        if (typ === 'album') return zeile(x.name, (x.artists || []).map(function (a) { return a.name; }).join(', '), bild(x.images), { context_uri: x.uri }, 'Ich spiele das Album ' + x.name + '.');
                        if (typ === 'artist') return zeile(x.name, 'Künstler', bild(x.images), { context_uri: x.uri }, 'Ich spiele ' + x.name + '.');
                        return zeile(x.name, (x.owner && x.owner.display_name) || 'Spotify', bild(x.images), { context_uri: x.uri }, 'Ich spiele die Playlist ' + x.name + '.');
                    }).join('');
                }
            }
        }
        if (!FL) return;
        L.innerHTML = h;
        L.querySelectorAll('.sp-p').forEach(function (b) {
            b.onclick = async function () {
                const k = zeile._k[b.getAttribute('data-k')]; if (!k) return;
                b.textContent = '…'; await abspielen(k.body, k.ansage); b.textContent = '▶'; setTimeout(jetzt, 1500);
            };
        });
        const nb = L.querySelector('#sp-neu'); if (nb) nb.onclick = function () { fensterZu(); login(); };
    }
    function fenster(q) {
        css(); suchText = q || '';
        if (FL) fensterZu();
        FL = document.createElement('div'); FL.id = 'sp-layer';
        FL.innerHTML = '<div class="sp-kopf"><span class="sp-ti">♫ SPOTIFY</span><button type="button" class="sp-x" id="sp-x" aria-label="Schließen">✕</button></div>' +
            '<div class="sp-such"><input id="sp-q" type="search" placeholder="🔍  Suchen …" autocomplete="off" value="' + esc(suchText) + '"></div>' +
            '<div class="sp-tabs"><button type="button" class="sp-tab an" data-t="playlists">Playlists</button><button type="button" class="sp-tab" data-t="alben">Alben</button><button type="button" class="sp-tab" data-t="lieder">Lieder</button><button type="button" class="sp-tab" data-t="kuenstler">Künstler</button></div>' +
            '<div class="sp-liste"></div>' +
            '<div class="sp-fuss"><div class="sp-jetzt"></div><div class="sp-steu"><button type="button" id="sp-zr">⏮</button><button type="button" id="sp-pp" class="gr">⏸</button><button type="button" id="sp-vor">⏭</button><button type="button" id="sp-lei">🔉</button><button type="button" id="sp-lau">🔊</button><button type="button" id="sp-zu">✕</button></div></div>';
        document.body.appendChild(FL);
        aktivMerken();
        tab = 'playlists';
        FL.querySelector('#sp-x').onclick = fensterZu;
        FL.querySelectorAll('.sp-tab').forEach(function (b) { b.onclick = function () { tab = b.getAttribute('data-t'); FL.querySelectorAll('.sp-tab').forEach(function (c) { c.classList.toggle('an', c === b); }); fuellen(); }; });
        const inp = FL.querySelector('#sp-q');
        inp.oninput = function () { suchText = inp.value; clearTimeout(sucheT); sucheT = setTimeout(fuellen, 600); };
        inp.onkeydown = function (e) { if (e.key === 'Enter') { clearTimeout(sucheT); fuellen(); inp.blur(); } };
        FL.querySelector('#sp-zr').onclick = function () { steuern('zurueck').then(function () { setTimeout(jetzt, 1200); }); };
        FL.querySelector('#sp-vor').onclick = function () { steuern('naechste').then(function () { setTimeout(jetzt, 1200); }); };
        FL.querySelector('#sp-pp').onclick = async function () {
            const r = await ruf('GET', '/me/player');
            if (r.json && r.json.is_playing) await steuern('pause'); else await steuern('weiter');
            setTimeout(jetzt, 1200);
        };
        FL.querySelector('#sp-lei').onclick = function () { lautstaerke(null, -15); };
        FL.querySelector('#sp-lau').onclick = function () { lautstaerke(null, 15); };
        FL.querySelector('#sp-zu').onclick = fensterZu;
        fuellen(); jetzt();
        pollT = setInterval(jetzt, 5000);
    }


    /* ---------- Kleiner Player (normale Ansicht unter der Kugel, Autoansicht unten) ---------- */
    let miniN = null, miniA = null, miniT = null, miniLetzt = 0;
    function miniHtml() {
        return '<div class="spm-b"></div><div class="spm-t"><div class="spm-n">–</div><div class="spm-s"></div></div>' +
            '<button type="button" class="spm-k" data-a="zurueck" aria-label="Zurück">⏮</button><button type="button" class="spm-k spm-g" data-a="pp" aria-label="Pause oder Weiter">⏸</button><button type="button" class="spm-k" data-a="naechste" aria-label="Weiter">⏭</button>';
    }
    function miniCss() {
        if (document.getElementById('spm-style')) return;
        const st = document.createElement('style'); st.id = 'spm-style';
        st.textContent =
            '.spm{display:none;align-items:center;gap:10px;box-sizing:border-box;width:100%;max-width:460px;margin:6px auto;background:#071521;border:1px solid #4cffb0;border-radius:12px;padding:8px 10px;font-family:"DejaVu Sans Mono",ui-monospace,monospace;color:#e8f3f9}' +
            '.spm.an{display:flex}.spm .spm-b{width:38px;height:38px;border-radius:6px;background:#12303f center/cover no-repeat;flex:none}.spm .spm-t{flex:1;min-width:0}' +
            '.spm .spm-n{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.spm .spm-s{font-size:10px;color:#8fb4c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}' +
            '.spm .spm-k{width:40px;height:40px;border-radius:10px;border:1px solid #1b3a4a;background:transparent;color:#49d7ff;font-size:17px;flex:none}.spm .spm-g{border-color:#4cffb0;color:#4cffb0}' +
            '#aa-layer .spm{max-width:none;margin:0 0 8px;padding:10px 14px;gap:14px}#aa-layer .spm .spm-b{width:48px;height:48px}#aa-layer .spm .spm-n{font-size:clamp(14px,3vmin,20px)}#aa-layer .spm .spm-s{font-size:clamp(11px,2.2vmin,15px)}' +
            '#aa-layer .spm .spm-k{width:clamp(52px,10vmin,80px);height:clamp(44px,8vmin,64px);font-size:clamp(20px,4vmin,30px)}';
        document.head.appendChild(st);
    }
    function miniBauen(host, vor) {
        const d = document.createElement('div'); d.className = 'spm'; d.innerHTML = miniHtml();
        if (vor && vor.parentNode === host) host.insertBefore(d, vor); else host.appendChild(d);
        d.querySelector('.spm-b').onclick = function () { fenster(''); };
        d.querySelectorAll('.spm-k').forEach(function (b) {
            b.onclick = async function () {
                const a = b.getAttribute('data-a');
                if (a === 'pp') { const r = await ruf('GET', '/me/player'); if (r.json && r.json.is_playing) await steuern('pause'); else await steuern('weiter'); }
                else await steuern(a);
                aktivMerken(); setTimeout(miniAktualisieren, 1200);
            };
        });
        return d;
    }
    function miniHolen() {
        try {
            miniCss();
            if (!miniN || !miniN.isConnected) { const sm = document.getElementById('statusMessage'); miniN = sm && sm.parentNode ? miniBauen(sm.parentNode, sm) : null; }
            const aa = document.getElementById('aa-layer');
            if (aa) { if (!miniA || !miniA.isConnected) { const f = aa.querySelector('.fuss'); miniA = f ? miniBauen(aa, f) : null; } } else miniA = null;
        } catch (e) { }
    }
    async function miniAktualisieren() {
        try {
            miniHolen();
            const ziele = [miniN, miniA].filter(Boolean);
            if (!ziele.length) return;
            if (!verbunden() || !aktivJetzt() || document.visibilityState !== 'visible') { ziele.forEach(function (z) { z.classList.remove('an'); }); return; }
            const r = await ruf('GET', '/me/player');
            const it = r.json && r.json.item;
            if (!it) { ziele.forEach(function (z) { z.classList.remove('an'); }); return; }
            const img = bild(it.album && it.album.images);
            ziele.forEach(function (z) {
                z.classList.add('an');
                z.querySelector('.spm-b').style.backgroundImage = img ? 'url("' + img + '")' : '';
                z.querySelector('.spm-n').textContent = it.name;
                z.querySelector('.spm-s').textContent = (it.artists || []).map(function (a) { return a.name; }).join(', ');
                z.querySelector('.spm-g').textContent = r.json.is_playing ? '⏸' : '▶';
            });
        } catch (e) { }
    }
    function miniStarten() {
        if (miniT) return;
        miniT = setInterval(miniAktualisieren, 5000);
        setTimeout(miniAktualisieren, 2500);
    }


    /* ---------- Musik anbieten, sobald die Autoansicht aufgeht ---------- */
    const AUTO_LIST = 'jv_spotify_autoliste', AUTO_AUS = 'jv_spotify_auto_aus', AUTO_ZEIT = 'jv_spotify_gefragt';
    let autoFrage = null;   // { stufe: 'ja' | 'name', t }
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch (e) { } }
    function sagenWeiter(t) { try { speak(t, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) { } }
    async function autoAnbieten() {
        try {
            if (!verbunden() || lsGet(AUTO_AUS) === '1') return;
            if (Date.now() - parseInt(lsGet(AUTO_ZEIT) || '0', 10) < 20 * 60000) return;   // höchstens alle 20 Minuten
            if (!(window.jvAutoansicht && jvAutoansicht.offen())) return;
            const r = await ruf('GET', '/me/player');
            if (r.json && r.json.is_playing) return;   // es läuft schon Musik
            lsSet(AUTO_ZEIT, String(Date.now()));
            autoFrage = { stufe: 'ja', t: Date.now() };
            sagenWeiter('Soll ich Musik spielen?');
        } catch (e) { }
    }
    document.addEventListener('jv-autoansicht', autoAnbieten);
    function autoAntwort(text, next) {
        if (!autoFrage) return next(text);
        if (Date.now() - autoFrage.t > 60000) { autoFrage = null; return next(text); }
        const t = norm(text), n = t.split(' ').length;
        if (/^(?:nein|nee|ne|noe|nicht|stopp|stop|abbrechen|lass es|lass|vergiss es|jetzt nicht|nicht jetzt|keine musik)\b/.test(t)) { autoFrage = null; sagen('Okay, keine Musik.'); return true; }
        if (autoFrage.stufe === 'ja') {
            if (!/^(?:ja|jawohl|jep|jo|joa|klar|genau|gerne|gern|okay|ok|bitte|ja bitte|mach|mach das|spiel|spiele|starte)\b/.test(t)) { autoFrage = null; return next(text); }
            const liste = lsGet(AUTO_LIST);
            if (liste) { autoFrage = null; suchenUndSpielen(liste, 'playlist'); return true; }
            autoFrage = { stufe: 'name', t: Date.now() };
            sagenWeiter('Welche Playlist soll ich im Auto spielen? Sag zum Beispiel den Namen deiner Playlist.');
            return true;
        }
        if (n > 8) { autoFrage = null; return next(text); }
        const name = t.replace(/^(?:die |meine |meiner |playlist |die playlist |spiel |spiele )+/, '').replace(/ playlist$/, '').trim();
        autoFrage = null;
        if (!name) return next(text);
        lsSet(AUTO_LIST, name);
        sagen('Okay, ich merke mir ' + name + ' als Auto-Playlist.');
        suchenUndSpielen(name, 'playlist');
        return true;
    }
    if (window.jvCommands && typeof window.jvCommands.use === 'function') window.jvCommands.use('spotify-auto', autoAntwort, 0.2);
    window.jvSpotify_auto = { aus: function (an) { lsSet(AUTO_AUS, an ? '1' : null); } };

    /* ---------- Sprachbefehle ---------- */
    function befehl(text, next) {
        const t = roh(text);
        if (!t || t.split(' ').length > 14 || !/spotify|musik|lied|song|titel|playlist|album|spiel|n(ä|ae)chst|(ü|ue)berspring|vorherig|zur(ü|ue)ck|l(ä|ae)uft|spielt|lauter|leiser|weiter|pause|stop|anhalten|halt|skip|fortsetzen|auto[ -]?playlist|beim einsteigen|im auto/.test(t)) return next(text);
        const S = '(?:bitte )?';
        const nein = function (msg) { sagen(msg || 'Spotify ist noch nicht verbunden. Sag: Spotify verbinden.'); return true; };

        if (new RegExp('^' + S + 'spotify (?:verbinden|anmelden|einrichten|koppeln|login|einloggen)$').test(t)) { login(); return true; }
        if (new RegExp('^' + S + 'spotify (?:trennen|abmelden|ausloggen)$').test(t)) { speichern(KEY, null); sagen('Spotify ist getrennt.'); return true; }
        if (/^spotify status$/.test(t)) { sagen(verbunden() ? 'Spotify ist verbunden.' : 'Spotify ist nicht verbunden.'); return true; }

        if (/^(?:bitte )?(?:spotify|spotify (?:öffnen|oeffnen|fenster|zeigen|anzeigen))$/.test(t)) { if (!verbunden()) return nein(); fenster(''); return true; }
        if (/^(?:bitte )?spotify (?:schlie(?:ß|ss)en|zu|beenden|fenster zu)$/.test(t)) { fensterZu(); return true; }
        let ms = t.match(/^(?:bitte )?(?:zeig(?:e)?|such(?:e)?)(?: mir)?(?: nach)? (.+?) (?:auf|bei|in) spotify$/) || t.match(/^(?:bitte )?spotify (?:such(?:e|en)?|zeig(?:e)?)(?: mir)?(?: nach)? (.+)$/);
        if (ms) { if (!verbunden()) return nein(); fenster(ms[1].replace(/^(?:die |das |den |der )+/, '')); return true; }
        if (verbunden() && (aktivJetzt() || FL)) {
            if (/^(?:bitte )?(?:weiter|n(?:ä|ae)chstes|n(?:ä|ae)chster|n(?:ä|ae)chste|skip|(?:ü|ue)berspringen)$/.test(t)) { steuern('naechste'); return true; }
            if (/^(?:bitte )?(?:zur(?:ü|ue)ck|vorheriges|vorheriger|vorherige)$/.test(t)) { steuern('zurueck'); return true; }
            if (/^(?:bitte )?(?:pause|stopp|stop|anhalten|halt)$/.test(t)) { steuern('pause'); return true; }
            if (/^(?:bitte )?(?:lauter|leiser)$/.test(t)) { lautstaerke(null, /lauter/.test(t) ? 15 : -15); return true; }
            if (/^(?:bitte )?(?:weiterspielen|fortsetzen)$/.test(t)) { steuern('weiter'); return true; }
        }
        if (new RegExp('^' + S + '(?:mach )?(?:die )?(?:musik|spotify)(?: bitte)? (?:beenden|aus|ausmachen|ausschalten|stoppen|schlie(?:ß|ss)en und stoppen)$').test(t) || /^(?:beende|stoppe) (?:die )?(?:musik|spotify)$/.test(t)) {
            if (!verbunden()) return nein();
            try { localStorage.removeItem(AKTIV); } catch (e) { }
            fensterZu();
            ruf('PUT', '/me/player/pause').then(function () { sagen('Okay, die Musik ist aus.'); miniAktualisieren(); });
            return true;
        }
        let ma = t.match(/^(?:bitte )?(?:meine |die )?auto[ -]?playlist (?:ist|soll|heisst|heißt|wird|auf) (?:die |meine )?(.+)$/) || t.match(/^(?:bitte )?(?:merk dir|merke dir|nimm|nehme) (?:die |meine )?(?:playlist )?(.+?) als auto[ -]?playlist$/);
        if (ma) { lsSet(AUTO_LIST, ma[1].replace(/ playlist$/, '').trim()); sagen('Okay, die Auto-Playlist ist ' + ma[1].replace(/ playlist$/, '').trim() + '.'); return true; }
        if (/^(?:bitte )?(?:auto[ -]?playlist (?:ändern|aendern|zurücksetzen|zuruecksetzen|vergessen)|andere auto[ -]?playlist)$/.test(t)) { lsSet(AUTO_LIST, null); sagen('Okay. Beim nächsten Mal frage ich dich nach der Playlist.'); return true; }
        if (/^(?:bitte )?musik (?:beim einsteigen|im auto|in der autoansicht) (aus|an|ausschalten|einschalten)$/.test(t)) { const an = /an|einschalten/.test(t.split(' ').pop()); lsSet(AUTO_AUS, an ? null : '1'); sagen(an ? 'Ich biete dir im Auto wieder Musik an.' : 'Ich frage im Auto nicht mehr nach Musik.'); return true; }
        const aktion = function (fn) { if (!verbunden()) return nein(); fn(); return true; };
        let m;
        if (new RegExp('^' + S + '(?:mach )?(?:die )?(?:musik|spotify)(?: bitte)? (?:pause|pausieren|stopp|stop|aus|anhalten|ausmachen|ausschalten)$').test(t) || /^musik (?:pausieren|anhalten|ausmachen|stoppen)$/.test(t) || /^pausiere (?:die )?musik$/.test(t))
            return aktion(function () { steuern('pause'); });
        if (new RegExp('^' + S + '(?:mach )?(?:die )?(?:musik|spotify)(?: bitte)? (?:weiter|an|fortsetzen|weiterspielen|starten|play|los)$').test(t) || /^(?:mach )?(?:die )?musik (?:an|weiter)$/.test(t) || /^spiel(?:e)? (?:weiter|musik)$/.test(t) || /^spotify (?:starten|starte)$/.test(t))
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

        /* Spielen: "Spotify" darf irgendwo im Satz stehen (auch mitten drin), und ist nicht nötig, sobald Spotify verbunden ist */
        let q = null;
        const VERB = '(?:spiel|spiele|spielt|starte|start|mach|leg|lege|h(?:ö|oe)re|h(?:ö|oe)r)';
        if (/\bspotify\b/.test(t)) {
            m = t.match(new RegExp('^' + S + VERB + ' (?:mir )?(.+)$')) || t.match(/^spotify (?:spiel|spiele|starte|start) (?:mir )?(.+)$/);
            if (m) { q = m[1].replace(/\s*\b(?:auf|bei|mit|(?:ü|ue)ber|in|per|via)\s+spotify\b/g, ' ').replace(/\bspotify\b/g, ' ').replace(/\s+(?:ab|an)$/, '').replace(/\s+/g, ' ').trim(); if (!q) q = null; }
        }
        let mitSpotify = q != null;
        if (q == null && verbunden()) {
            m = t.match(new RegExp('^' + S + '(?:spiel|spiele|spielt|leg|lege) (?:mir )?(.+?)(?: ab)?$'));
            if (m && !/^(?:die |das |den )?(?:start[- ]?ansage|ansage|briefing|nachricht|nachrichten|video|film|serie|spiel|spiele|quiz|schach|memory|vier gewinnt|tic tac toe|aufnahme|sprachnachricht|mailbox|alarm|wecker)\b/.test(m[1])) q = m[1];
        }
        if (q == null) return next(text);
        if (!verbunden()) return nein();
        let art = null;
        if (/\bplaylist\b/.test(q)) { art = 'playlist'; q = q.replace(/\bplaylist\b/g, ' '); }
        else if (/\balbum\b/.test(q)) { art = 'album'; q = q.replace(/\balbum\b/g, ' '); }
        q = q.replace(/^(?:meine |meiner |mein |die |das |den |der |ein |eine |einen |mir )+/, '').replace(/^(?:musik|lieder|lied|songs|song|titel|st(?:ü|ue)ck)(?: von| vom|:)? ?/, '').replace(/^(?:von|vom) /, '').replace(/\s+/g, ' ').trim();
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

    window.jvSpotify = { verbunden: verbunden, login: login, oeffnen: function (q) { if (verbunden()) fenster(q || ''); else sagen('Spotify ist noch nicht verbunden. Sag: Spotify verbinden.'); }, schliessen: fensterZu };
    rueckweg();
    miniStarten();
    window.jvSpotify.mini = miniAktualisieren;
})();
