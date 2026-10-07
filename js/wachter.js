/* ============================================================
   WÄCHTER: Jarvis meldet sich von selbst, solange die App offen ist (Bildschirm an oder "Hey Jarvis"-Modus).
   Er sieht jede Minute nach und spricht nur, wenn es wirklich etwas gibt:
   - ABFAHRT: Ein Termin mit Ort steht an, und es wird Zeit loszufahren ("In etwa 10 Minuten sollten Sie zum Zahnarzt losfahren, die Fahrt dauert rund 25 Minuten").
     Die Fahrzeit kommt vom Karten-Server (ohne Verkehr gerechnet), plus 10 Minuten Puffer.
   - GLEICH: Ein Termin ohne Ort beginnt in 15 Minuten.
   - REGEN: In der nächsten Stunde fängt es an zu regnen (höchstens einmal in drei Stunden).
   - GEBURTSTAG: Heute hat jemand Geburtstag (einmal am Tag, nach 8 Uhr).
   Regeln, damit es nicht nervt: nichts zwischen 22 und 7 Uhr; höchstens eine Meldung alle 8 Minuten; jede Meldung nur einmal; nichts, solange du sprichst, Jarvis spricht, rechnet oder
   der Dolmetscher läuft. Jede Meldung zählt erst als erledigt, wenn sie wirklich gesprochen wurde (blockiert Chrome den Ton, kommt sie später noch einmal).
   Ist die App geschlossen oder der Bildschirm aus, kann eine Web-App nichts sagen; dafür gäbe es nur Push-Benachrichtigungen.
   Ein-/Ausschalten: Einstellungen > Charakter oder per Sprache ("Melde dich nicht mehr von selbst" / "Melde dich von selbst").
   Braucht: calendarEntries, weathermap.js (wxGeocode), birthdays.js (fetchUpcomingBirthdays), voice.js (speak, isSpeaking), charakter.js (charAddress), persona.js (sassLevel),
   briefing.js (isBirthdayEntry), apiFetch. Fehlt etwas, entfällt nur die jeweilige Meldung.
   ============================================================ */

const WACHTER_KEY = 'helfer_proactive';
const WACHTER_TICK_MS = 60000;
const WACHTER_FIRST_TICK_MS = 25000;
const WACHTER_MIN_GAP_MS = 8 * 60000;
const WACHTER_RETRY_GAP_MS = 5 * 60000;   // nach einer nicht gesprochenen Meldung so lange warten
const WACHTER_QUIET_FROM = 22, WACHTER_QUIET_TO = 7;
const WACHTER_LEAVE_BUFFER_MIN = 10;
const WACHTER_LOOKAHEAD_MIN = 150;
const WACHTER_RAIN_EVERY_MS = 10 * 60000;
const WACHTER_DONE_KEY = 'wachter_done';

let wachterLastSpoken = 0;
let wachterLastTry = 0;
let wachterBusy = false;
const wachterDrive = {};                       // Ort -> { min, at }
let wachterRain = { at: 0, minutes: null };     // letztes Wetter-Ergebnis

function wachterEnabled() { return getPersistentData(WACHTER_KEY, '1') !== '0'; }
function setWachter(on) {
    setPersistentData(WACHTER_KEY, on ? '1' : '0');
    try { const t = document.getElementById('proactiveToggle'); if (t) t.checked = !!on; } catch (e) {}
}

function wachterBerlinHour() {
    const h = parseInt(new Date().toLocaleString('de-DE', { timeZone: 'Europe/Berlin', hour: 'numeric', hour12: false }), 10);
    return isNaN(h) ? new Date().getHours() : h;
}
function wachterQuiet() { const h = wachterBerlinHour(); return h >= WACHTER_QUIET_FROM || h < WACHTER_QUIET_TO; }
function wachterDayKey() { return new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' }); }

/* Was heute schon gemeldet wurde (überlebt einen App-Neustart am selben Tag) */
function wachterLoadDone() {
    try {
        const o = JSON.parse(localStorage.getItem(WACHTER_DONE_KEY) || 'null');
        if (o && o.day === wachterDayKey() && o.ids) return o;
    } catch (e) {}
    return { day: wachterDayKey(), ids: {} };
}
function wachterIsDone(id) { return !!wachterLoadDone().ids[id]; }
function wachterMarkDone(id) {
    const o = wachterLoadDone(); o.ids[id] = Date.now();
    try { localStorage.setItem(WACHTER_DONE_KEY, JSON.stringify(o)); } catch (e) {}
}

function wachterIdle() {
    if (typeof document !== 'undefined' && document.hidden) return false;
    if (typeof isProcessing !== 'undefined' && isProcessing) return false;
    if (typeof isSpeaking === 'function' && isSpeaking()) return false;
    if (typeof interpreter !== 'undefined' && interpreter) return false;
    if (typeof isRecording !== 'undefined' && isRecording && !(typeof wakeWordListening !== 'undefined' && wakeWordListening)) return false;   // du sprichst gerade
    return true;
}

function wAddress() { return (typeof charAddress === 'function') ? charAddress() : ((typeof currentUserName !== 'undefined' && currentUserName) || 'Sir'); }
function wLevel() { return (typeof sassLevel === 'function') ? sassLevel() : 2; }

function wachterPosition() {
    return new Promise((ok, err) => {
        if (!navigator.geolocation) return err(new Error('keine Ortung'));
        navigator.geolocation.getCurrentPosition(p => ok({ lat: p.coords.latitude, lon: p.coords.longitude }), err, { timeout: 7000, maximumAge: 120000 });
    });
}
function wachterTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }

/* Fahrzeit in Minuten von hier zum Ort (OSRM über deinen Server, 15 Minuten zwischengespeichert); null, wenn nicht ermittelbar */
async function wachterDriveMinutes(location) {
    const hit = wachterDrive[location];
    if (hit && Date.now() - hit.at < 15 * 60000) return hit.min;
    if (typeof wxGeocode !== 'function') return null;
    try {
        const [pos, geo] = await Promise.all([wachterPosition(), wachterTimeout(wxGeocode(location), 7000)]);
        if (!geo) return null;
        const r = await wachterTimeout(apiFetch(`/api/route?fromLat=${pos.lat}&fromLon=${pos.lon}&toLat=${geo.lat}&toLon=${geo.lon}`), 8000);
        const d = await r.json();
        const sec = d && d.routes && d.routes[0] && d.routes[0].duration;
        let min = sec ? Math.max(1, Math.round(sec / 60)) : null;
        if (min !== null && min > 360) min = null;   // über 6 Stunden: der Ort wurde vermutlich falsch gefunden (z.B. ein Personenname), lieber keine Fahrzeit nennen
        wachterDrive[location] = { min, at: Date.now() };
        return min;
    } catch (e) { return null; }
}

/* Minuten bis zum Regen (nur wenn es jetzt trocken ist und innerhalb einer Stunde regnet); sonst null */
async function wachterRainMinutes() {
    if (Date.now() - wachterRain.at < WACHTER_RAIN_EVERY_MS) return wachterRain.minutes;
    let minutes = null;
    try {
        const pos = await wachterPosition();
        const url = `https://api.open-meteo.com/v1/forecast?latitude=${pos.lat}&longitude=${pos.lon}&current=precipitation&minutely_15=precipitation&forecast_minutely_15=8&timezone=Europe%2FBerlin`;
        const r = await wachterTimeout(fetch(url), 8000);
        const d = await r.json();
        const nowMm = d && d.current ? Number(d.current.precipitation || 0) : 0;
        const times = d && d.minutely_15 ? d.minutely_15.time : [], mm = d && d.minutely_15 ? d.minutely_15.precipitation : [];
        if (nowMm < 0.1) {
            for (let i = 0; i < mm.length; i++) {
                if (Number(mm[i]) >= 0.2) {
                    const mins = Math.round((new Date(times[i]).getTime() - Date.now()) / 60000);
                    if (mins <= 60) minutes = Math.max(5, mins);
                    break;
                }
            }
        }
    } catch (e) { minutes = null; }
    wachterRain = { at: Date.now(), minutes };
    return minutes;
}

/* ---------- Meldungen sammeln: { id, prio, text } ---------- */
async function wachterCollect() {
    const out = [], a = wAddress(), lvl = wLevel(), now = Date.now();
    const entries = (typeof calendarEntries !== 'undefined' ? calendarEntries : []);

    for (const e of entries) {
        if (!e || !e.isoDate || /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate))) continue;
        try { if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(e)) continue; } catch (x) {}
        const start = new Date(e.isoDate).getTime();
        if (isNaN(start)) continue;
        const mins = Math.round((start - now) / 60000);
        if (mins < 1 || mins > WACHTER_LOOKAHEAD_MIN) continue;
        const key = `${e.text}|${e.isoDate}`;
        const title = String(e.text || 'Ihr Termin');
        if (e.location) {
            const drive = await wachterDriveMinutes(e.location);
            if (drive !== null) {
                const leaveIn = mins - drive - WACHTER_LEAVE_BUFFER_MIN;
                if (leaveIn <= 10 && mins < drive) {
                    out.push({ id: `leave|${key}`, prio: 5, text: `${a}, das wird knapp: Die Fahrt zu „${title}“ dauert rund ${drive} Minuten, der Termin beginnt aber in ${mins} Minuten.` });
                } else if (leaveIn <= 10) {
                    const when = leaveIn > 2 ? `in etwa ${leaveIn} Minuten` : 'jetzt';
                    let text = leaveIn > 2
                        ? `${a}, ${when} sollten Sie zu „${title}“ losfahren. Die Fahrt dauert rund ${drive} Minuten, ohne Verkehr gerechnet.`
                        : `${a}, es wird Zeit: Sie sollten jetzt zu „${title}“ losfahren. Die Fahrt dauert rund ${drive} Minuten, ohne Verkehr gerechnet.`;
                    if (lvl >= 2 && leaveIn <= 2) text += ' Ich sage es nur ungern, aber: Beeilung.';
                    out.push({ id: `leave|${key}`, prio: 5, text });
                }
                continue;
            }
        }
        if (mins <= 15 && mins >= 3) {
            out.push({ id: `soon|${key}`, prio: 4, text: lvl >= 2 ? `${a}, in ${mins} Minuten wartet „${title}“. Nur zur Erinnerung.` : `In ${mins} Minuten: ${title}.` });
        }
    }

    // Regen
    const rain = await wachterRainMinutes();
    if (rain !== null) {
        out.push({ id: `rain|${Math.floor(now / (3 * 3600000))}`, prio: 3,
            text: lvl >= 2 ? `In etwa ${rain} Minuten fängt es an zu regnen, ${a}. Ein Schirm wäre jetzt eine Idee.` : `In etwa ${rain} Minuten fängt es an zu regnen, ${a}.` });
    }

    // Geburtstag heute (einmal am Tag, nach 8 Uhr)
    if (wachterBerlinHour() >= 8 && typeof fetchUpcomingBirthdays === 'function' && !wachterIsDone(`bday|${wachterDayKey()}`)) {
        try {
            const list = (await wachterTimeout(fetchUpcomingBirthdays(0), 9000)).filter(b => b.tag === 'heute');
            if (list.length) {
                const parts = list.map(b => /geburtstag/i.test(b.titel) ? `ist ${b.titel}` : `hat ${b.titel} Geburtstag`);
                const text = `Heute ${parts[0]}${parts[1] ? ' und ' + parts[1] : ''}.${lvl >= 1 ? ' Vielleicht eine kurze Nachricht, ' + a + '?' : ''}`;
                out.push({ id: `bday|${wachterDayKey()}`, prio: 2, text });
            }
        } catch (e) {}
    }
    return out;
}

/* ---------- Ein Durchlauf ---------- */
async function wachterTick() {
    if (wachterBusy || !wachterEnabled() || wachterQuiet() || !wachterIdle()) return;
    const now = Date.now();
    if (now - wachterLastSpoken < WACHTER_MIN_GAP_MS || now - wachterLastTry < WACHTER_RETRY_GAP_MS) return;
    wachterBusy = true;
    try {
        const cands = (await wachterCollect()).filter(c => !wachterIsDone(c.id)).sort((x, y) => y.prio - x.prio);
        if (!cands.length || !wachterIdle() || wachterQuiet() || !wachterEnabled()) return;   // zwischenzeitlich geändert: lieber still
        const c = cands[0];
        wachterLastTry = Date.now();
        speak(c.text, () => { wachterMarkDone(c.id); wachterLastSpoken = Date.now(); });   // erst nach wirklich gesprochener Meldung als erledigt gezählt
    } catch (e) { /* der Wächter darf nie etwas stören */ }
    finally { wachterBusy = false; }
}

/* ---------- Sprachbefehle ---------- */
function handleWachterCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 70) return false;
    const say = (m) => speak(m, typeof continueConversation === 'function' ? continueConversation : undefined);
    if (/^(?:melde dich|sprich|sag etwas|sag was)(?: bitte)? (?:nicht|nie)(?: mehr)? von selbst$/.test(t) || /^(?:hör|hoer) (?:bitte )?auf,? dich von selbst zu melden$/.test(t)
        || /^(?:keine|ohne) (?:meldungen|hinweise|ansagen) (?:mehr )?von selbst$/.test(t) || /^(?:sei|bleib) still,? bis ich dich frage$/.test(t)) {
        setWachter(false);
        say(`In Ordnung, ${wAddress()}. Ich melde mich nur noch, wenn Sie mich ansprechen.`);
        return true;
    }
    if (/^melde dich(?: bitte)?(?: wieder)? von selbst$/.test(t) || /^du darfst dich (?:wieder )?von selbst melden$/.test(t) || /^(?:meldungen|hinweise) von selbst (?:wieder )?(?:an|einschalten)$/.test(t)) {
        setWachter(true);
        say(`Gern, ${wAddress()}. Ich melde mich, wenn es wichtig wird, solange die App offen ist. Zwischen 22 und 7 Uhr bin ich still.`);
        return true;
    }
    return false;
}

(function initWachter() {
    try {
        const t = document.getElementById('proactiveToggle');
        if (t) { t.checked = wachterEnabled(); t.addEventListener('change', () => setWachter(t.checked)); }
    } catch (e) {}
    try {
        setTimeout(() => { wachterTick(); setInterval(wachterTick, WACHTER_TICK_MS); }, WACHTER_FIRST_TICK_MS);
    } catch (e) {}
})();