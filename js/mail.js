/* ============================================================
   MAIL: Gmail lesen (nur lesen, nichts verändern oder verschicken)
   Braucht: calendar.js (accessToken, isGoogleAuthorized, ensureGoogleAuth, markGoogleExpired)
   ============================================================ */

function decodeBase64Url(str) {
    try {
        const b64 = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
        const bin = atob(b64 + '==='.slice((b64.length + 3) % 4));
        const bytes = Uint8Array.from(bin, c => c.charCodeAt(0));
        return new TextDecoder('utf-8').decode(bytes);
    } catch (e) {
        return '';
    }
}

/* HTML-E-Mails auf reinen Text bringen, zum Vorlesen */
function htmlToSpokenText(html) {
    return String(html || '')
        .replace(/<style[\s\S]*?<\/style>/gi, ' ')
        .replace(/<script[\s\S]*?<\/script>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&quot;/g, '"')
        .replace(/[ \t]{2,}/g, ' ').replace(/\n{2,}/g, '\n').trim();
}

/* Den Textteil aus dem (verschachtelten) MIME-Aufbau einer Nachricht holen: Text bevorzugt, sonst HTML */
function extractMessageText(payload) {
    if (!payload) return '';
    const parts = [];
    (function walk(p) { if (!p) return; parts.push(p); (p.parts || []).forEach(walk); })(payload);
    const plain = parts.find(p => p.mimeType === 'text/plain' && p.body && p.body.data);
    if (plain) return decodeBase64Url(plain.body.data);
    const html = parts.find(p => p.mimeType === 'text/html' && p.body && p.body.data);
    if (html) return htmlToSpokenText(decodeBase64Url(html.body.data));
    if (payload.body && payload.body.data) return decodeBase64Url(payload.body.data);
    return '';
}

function headerValue(headers, name) {
    const h = (headers || []).find(x => x.name && x.name.toLowerCase() === name.toLowerCase());
    return h ? h.value : '';
}

/* "Anna Muster <anna@beispiel.de>" -> nur "Anna Muster" (angenehmer zum Vorlesen) */
function shortSender(from) {
    const m = String(from || '').match(/^"?([^"<]+)"?\s*<[^>]+>$/);
    return (m ? m[1] : from).trim() || 'Unbekannt';
}

function spokenEmailDate(raw) {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return '';
    const now = new Date();
    const sameDay = d.toDateString() === now.toDateString();
    const opts = sameDay ? {} : { weekday: 'long', day: 'numeric', month: 'long' };
    return (sameDay ? 'heute, ' : '') + d.toLocaleDateString('de-DE', opts) + (sameDay ? '' : ', ') + formatSpokenTime(d);
}

async function gmailFetch(path, headers) {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, { headers });
    if (res.status === 401) return { unauthorized: true };
    if (res.status === 403) return { scopeMissing: true };
    if (!res.ok) return { error: 'Fehler ' + res.status };
    return { data: await res.json() };
}

/* --- Für die KI: neueste E-Mails, standardmäßig ungelesene --- */
async function fetchEmailOverview(opts = {}) {
    const onlyUnread = opts.onlyUnread !== false;
    const max = Math.min(Math.max(Number(opts.max) || 8, 1), 20);
    const searchTerm = String(opts.query || '').trim();

    let authorized = isGoogleAuthorized();
    if (!authorized && accessToken) authorized = await ensureGoogleAuth(4000);
    if (!authorized) {
        return {
            emails: [], anzahl_ungelesen: null, verbindung: 'getrennt',
            hinweis: (accessToken ? 'Der Google-Zugang ist abgelaufen. ' : 'Google ist nicht verbunden. ') + 'Bitte auf die Karte unten tippen, um neu zu verbinden.'
        };
    }

    const headers = { 'Authorization': `Bearer ${accessToken}` };
    let q = onlyUnread ? 'is:unread' : 'in:inbox';
    if (opts.importantOnly) q += ' -category:promotions -category:social -category:forums -category:updates';
    if (searchTerm) q += ' ' + searchTerm;

    const list = await gmailFetch('messages?maxResults=' + max + '&q=' + encodeURIComponent(q), headers);
    if (list.unauthorized) { markGoogleExpired(); return { emails: [], anzahl_ungelesen: null, verbindung: 'getrennt', hinweis: 'Die Google-Anmeldung ist abgelaufen. Bitte auf die Karte unten tippen, um neu zu verbinden.' }; }
    if (list.scopeMissing) { markGoogleExpired(); return { emails: [], anzahl_ungelesen: null, verbindung: 'getrennt', hinweis: 'Für Gmail fehlt noch die Berechtigung. Bitte auf die Karte unten tippen und beim Verbinden auch "Gmail lesen" erlauben.' }; }
    if (list.error) return { emails: [], anzahl_ungelesen: null, hinweis: 'Die E-Mails konnten nicht abgerufen werden (' + list.error + ').' };

    const ids = (list.data.messages || []).map(m => m.id);
    const details = await Promise.all(ids.map(async id => {
        const r = await gmailFetch(`messages/${id}?format=metadata&metadataHeaders=From&metadataHeaders=Subject&metadataHeaders=Date`, headers);
        if (!r.data) return null;
        const m = r.data;
        return {
            id: m.id,
            von: shortSender(headerValue(m.payload && m.payload.headers, 'From')),
            betreff: headerValue(m.payload && m.payload.headers, 'Subject') || '(ohne Betreff)',
            datum: spokenEmailDate(headerValue(m.payload && m.payload.headers, 'Date')),
            kurztext: (m.snippet || '').replace(/\s+/g, ' ').trim(),
            ungelesen: (m.labelIds || []).includes('UNREAD')
        };
    }));

    let unreadTotal = null;
    const profile = await gmailFetch('labels/UNREAD', headers);
    if (profile.data && typeof profile.data.messagesUnread === 'number') unreadTotal = profile.data.messagesUnread;

    const emails = details.filter(Boolean);
    lastEmailList = emails;
    return { emails, anzahl_ungelesen: unreadTotal };
}

/* --- Für die KI: eine bestimmte E-Mail vorlesen (die 1., 2. ... aus der letzten Übersicht, oder per id) --- */
async function fetchEmailFullText(id) {
    let authorized = isGoogleAuthorized();
    if (!authorized && accessToken) authorized = await ensureGoogleAuth(4000);
    if (!authorized) throw userError('Google ist nicht verbunden. Bitte auf die Karte unten tippen, um neu zu verbinden.');

    const headers = { 'Authorization': `Bearer ${accessToken}` };
    const r = await gmailFetch(`messages/${id}?format=full`, headers);
    if (r.unauthorized) { markGoogleExpired(); throw userError('Die Google-Anmeldung ist abgelaufen. Bitte auf die Karte unten tippen, um neu zu verbinden.'); }
    if (r.scopeMissing) { markGoogleExpired(); throw userError('Für Gmail fehlt noch die Berechtigung. Bitte auf die Karte unten tippen und beim Verbinden auch "Gmail lesen" erlauben.'); }
    if (r.error || !r.data) throw userError('Diese E-Mail konnte nicht geladen werden.');

    const m = r.data;
    let text = extractMessageText(m.payload);
    text = text.replace(/^>.*$/gm, '').replace(/\n{2,}/g, '\n').trim();   // zitierte alte Nachrichten grob weglassen
    if (text.length > 1400) {
        const cut = text.slice(0, 1400);
        const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('\n'));
        text = (end > 400 ? cut.slice(0, end + 1) : cut) + ' ... Die E-Mail ist länger, der Rest steht nur im Postfach.';
    }
    return {
        von: shortSender(headerValue(m.payload && m.payload.headers, 'From')),
        betreff: headerValue(m.payload && m.payload.headers, 'Subject') || '(ohne Betreff)',
        text: text || '(Diese E-Mail hat keinen lesbaren Text, zum Beispiel weil sie nur ein Bild enthält.)'
    };
}

/* Merkt sich die zuletzt gezeigte Liste, damit "lies mir die erste vor" funktioniert */
let lastEmailList = [];

function resolveEmailRef(ref) {
    if (!lastEmailList.length) return null;
    const r = String(ref == null ? '' : ref).trim();
    if (!r) return lastEmailList[0].id;
    const n = parseInt(r, 10);
    if (!isNaN(n) && String(n) === r.replace(/[.,]/g, '') && n >= 1 && n <= lastEmailList.length) return lastEmailList[n - 1].id;
    const nk = normalizeKey(r);
    const hit = lastEmailList.find(e => normalizeKey(e.von).includes(nk) || normalizeKey(e.betreff).includes(nk));
    return hit ? hit.id : (lastEmailList.length === 1 ? lastEmailList[0].id : null);
}

/* --- Mail-Test für die Einstellungen --- */
async function diagnoseGmail(log) {
    let ok = isGoogleAuthorized();
    if (!ok && accessToken) { log('Verbindung abgelaufen, erneuere still ...'); ok = await ensureGoogleAuth(4000); }
    if (!ok) { log(accessToken ? '❌ Verbindung abgelaufen. Oben auf "Mit Google Kalender verbinden" tippen und neu verbinden.' : '❌ Nicht verbunden. Oben auf "Mit Google Kalender verbinden" tippen.'); return; }
    log('✅ Verbindung gültig');

    const headers = { 'Authorization': `Bearer ${accessToken}` };
    try {
        const r = await fetch('https://oauth2.googleapis.com/tokeninfo?access_token=' + encodeURIComponent(accessToken));
        const d = await r.json();
        const scopes = String(d.scope || '').split(' ');
        const canRead = scopes.some(x => /\/auth\/gmail(\.readonly)?$/.test(x));
        log(canRead ? '✅ Berechtigung "Gmail lesen" vorhanden' : '❌ Berechtigung "Gmail lesen" FEHLT. Bitte neu verbinden (Karte oben) und alle Häkchen setzen.');
        if (!canRead) return;
    } catch (e) { log('Berechtigungen: nicht prüfbar'); }

    try {
        const ov = await fetchEmailOverview({ onlyUnread: true, max: 5 });
        if (ov.hinweis) { log('❌ ' + ov.hinweis); return; }
        log(`Ungelesene E-Mails insgesamt: ${ov.anzahl_ungelesen === null ? 'unbekannt' : ov.anzahl_ungelesen}`);
        log(`Geladen: ${ov.emails.length}`);
        ov.emails.forEach(e => log(`  • ${e.von} – ${e.betreff}`));
        if (ov.emails[0]) {
            const full = await fetchEmailFullText(ov.emails[0].id);
            log('✅ Erste E-Mail lesbar: ' + full.text.slice(0, 120).replace(/\s+/g, ' ') + ' ...');
        }
    } catch (e) {
        log('❌ ' + (e && e.userMessage ? e.userMessage : 'Unerwarteter Fehler beim Lesen.'));
    }
    log('Fertig.');
}

async function runGmailDiagnosis() {
    const out = document.getElementById('gmailDiagOutput');
    const lines = [];
    const log = (t) => { lines.push(t); if (out) { out.textContent = lines.join('\n'); out.classList.remove('hidden'); } };
    try { await diagnoseGmail(log); }
    catch (e) { log('❌ Unerwarteter Fehler: ' + (e && e.message ? e.message : e)); }
}
