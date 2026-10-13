/* ============================================================
   SYSTEMCHECK: prüft alle wichtigen Verbindungen auf einmal
   Aus assistant.js herausgelöst, Code unverändert.
   ============================================================ */

/* ============================================================
   SYSTEMCHECK: prüft alle wichtigen Verbindungen auf einmal
   (Google Kalender, Gmail, Wetter, Spritpreise, Karten, KI)
   Knopf: Einstellungen -> "Alles prüfen". Per Sprache: "Systemcheck".
   ============================================================ */
function checkWithTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms))]);
}

const SYSTEMCHECK_ORDER = ['Google Kalender', 'Gmail', 'Wetter', 'Spritpreise', 'Karten', 'KI'];

async function collectSystemChecks() {
    const results = [];
    const add = (name, ok, text) => results.push({ name, ok, text });
    const why = (e) => (e && e.message === 'Zeitüberschreitung') ? 'antwortet nicht' : ((e && e.userMessage) || 'keine Verbindung');

    // Google: Kalender und Gmail nutzen dieselbe Anmeldung
    let googleOk = false, googleWhy = '';
    if (!accessToken) {
        googleWhy = 'nicht verbunden';
    } else {
        if (!isGoogleAuthorized()) { try { await ensureGoogleAuth(4000); } catch (e) {} }
        if (isGoogleAuthorized()) googleOk = true; else googleWhy = 'Anmeldung abgelaufen';
    }
    const googleCheck = async (name, url, noPermission) => {
        if (!googleOk) return add(name, false, googleWhy + ', bitte unter Einstellungen neu verbinden');
        try {
            const r = await checkWithTimeout(fetch(url, { headers: { 'Authorization': `Bearer ${accessToken}` } }), 12000);
            if (r.ok) add(name, true, 'verbunden');
            else if (r.status === 401) { markGoogleExpired(); add(name, false, 'Anmeldung abgelaufen, bitte neu verbinden'); }
            else if (r.status === 403) add(name, false, noPermission);
            else add(name, false, 'Fehler ' + r.status);
        } catch (e) { add(name, false, why(e)); }
    };

    await Promise.all([
        googleCheck('Google Kalender', 'https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=1', 'Berechtigung fehlt, bitte neu verbinden'),
        googleCheck('Gmail', 'https://gmail.googleapis.com/gmail/v1/users/me/profile', 'Berechtigung "Gmail lesen" fehlt, bitte neu verbinden und alle Häkchen setzen'),
        (async () => {
            try {
                if (typeof fetchWeatherData !== 'function') return add('Wetter', false, 'Funktion fehlt');
                const w = await checkWithTimeout(fetchWeatherData(), 15000);
                if (w && !w.fehler) add('Wetter', true, 'Daten kommen an');
                else add('Wetter', false, (w && w.fehler) || 'keine Daten');
            } catch (e) { add('Wetter', false, why(e)); }
        })(),
        (async () => {
            try {
                const r = await checkWithTimeout(apiFetch('/api/tank?lat=53.55&lng=10.0&rad=5'), 15000);
                const d = await r.json().catch(() => ({}));
                if (r.ok && Array.isArray(d.stations)) add('Spritpreise', true, d.stations.length + (d.stations.length === 1 ? ' Tankstelle' : ' Tankstellen') + ' gefunden');
                else add('Spritpreise', false, d.error || ('Status ' + r.status));
            } catch (e) { add('Spritpreise', false, why(e)); }
        })(),
        (async () => {
            try {
                const r = await checkWithTimeout(apiFetch('/api/geocode?q=Hamburg'), 15000);
                const d = await r.json().catch(() => null);
                if (r.ok && Array.isArray(d) && d.length > 0) add('Karten', true, 'Adress-Suche funktioniert');
                else add('Karten', false, (d && d.error) || ('Status ' + r.status));
            } catch (e) { add('Karten', false, why(e)); }
        })(),
        (async () => {
            try {
                const r = await checkWithTimeout(apiFetch('/api/groq', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ model: "openai/gpt-oss-120b", reasoning_effort: "low", messages: [{ role: "user", content: "Antworte nur mit dem Wort ok." }] })
                }), 25000);
                const d = await r.json().catch(() => null);
                if (r.ok && d && d.choices && d.choices[0]) add('KI', true, 'antwortet');
                else add('KI', false, (d && d.error && (d.error.message || d.error)) || ('Status ' + r.status));
            } catch (e) { add('KI', false, why(e)); }
        })()
    ]);

    results.sort((a, b) => SYSTEMCHECK_ORDER.indexOf(a.name) - SYSTEMCHECK_ORDER.indexOf(b.name));
    return results;
}

function formatSystemCheck(results) {
    return results.map(r => `${r.ok ? '✅' : '❌'} ${r.name}: ${r.text}`).join('\n');
}

/* Knopf in den Einstellungen */
async function runSystemCheck() {
    const out = document.getElementById('systemCheckOutput');
    const show = (txt) => { if (out) { out.textContent = txt; out.classList.remove('hidden'); } };
    show('Prüfe alle Verbindungen, bitte kurz warten ...');
    try {
        const results = await collectSystemChecks();
        const bad = results.filter(r => !r.ok).length;
        show(formatSystemCheck(results) + '\n\n' + (bad === 0 ? 'Alles in Ordnung.' : `${bad} Problem${bad > 1 ? 'e' : ''} gefunden.`));
    } catch (e) {
        show('❌ Unerwarteter Fehler: ' + (e && e.message ? e.message : e));
    }
}

/* Per Sprache ("Systemcheck"): Jarvis nennt das Ergebnis und zeigt Probleme als Karten */
async function runSystemCheckSpoken() {
    speakAck('Ich prüfe alle Verbindungen.');
    try {
        const results = await collectSystemChecks();
        const bad = results.filter(r => !r.ok);
        if (typeof clearActionCards === 'function') clearActionCards();
        if (bad.length === 0) {
            speak(`Alle ${results.length} Systeme laufen einwandfrei.`, continueConversation);
        } else {
            if (typeof showActionCards === 'function') showActionCards(bad.map(r => ({ icon: '❌', title: r.name, subtitle: r.text })));
            const names = bad.map(r => r.name).join(', ');
            speak(`${bad.length === 1 ? 'Ein Problem' : bad.length + ' Probleme'} gefunden: ${names}. Die Einzelheiten stehen unten.`, continueConversation);
        }
    } catch (e) {
        speak('Der Systemcheck ist leider fehlgeschlagen.');
    }
}

function isSystemCheckCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 60) return false;
    return /\b(systemcheck|systemprüfung|systemtest|selbsttest)\b/.test(t)
        || /\bprüf\w*\s+(?:mal\s+)?(?:bitte\s+)?(?:alle\s+|alles\b|die\s+)?(?:verbindungen|schnittstellen|systeme)\b/.test(t)
        || /\balles prüfen\b/.test(t);
}
