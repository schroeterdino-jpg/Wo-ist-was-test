/* ============================================================
   MITDENKEN BEIM TERMIN EINTRAGEN: Bevor ein neuer Termin in den Kalender kommt, prüft Jarvis ihn und sagt dazu, was auffällt:
   - Termin liegt in der Vergangenheit oder gibt es schon (gleicher Titel, gleiche Zeit)
   - Überschneidung mit einem anderen Termin (jeder Termin zählt eine Stunde)
   - Feiertag an dem Tag (in deinem Bundesland)
   - Bei Schule/Kita-Terminen: Schulferien an dem Tag
   - Bei Terminen draußen (Garten, Grillen, Radtour ...): Regen oder Sturm gemeldet (nur die nächsten 7 Tage)
   - Fahrzeit: reicht der Abstand zum Termin davor oder danach für die Fahrt (nur wenn beide einen Ort haben)
   - Sehr früh (vor 6 Uhr) oder sehr spät (ab 22 Uhr)
   Der Termin wird trotzdem eingetragen; die Hinweise (höchstens zwei, die wichtigsten) hängen an der gesprochenen Antwort.
   Wer ihn nicht möchte, sagt "Lösche den Termin ...". Wiederholungen ("jeden Montag") werden nicht geprüft.
   Alles ist zeitlich begrenzt (7 Sekunden), damit das Eintragen nie länger wartet; was bis dahin fertig ist, wird genannt.
   Braucht: calendarEntries, briefing.js (formatSpokenTime, isBirthdayEntry), ferien.js (ferienHomeState, ferienLoad, ferienPeriodsFor),
   weathermap.js (wxGeocode), apiFetch, persona.js (sassLevel). Fehlt etwas davon, entfällt nur die jeweilige Prüfung. Wird von actions.js aufgerufen.
   ============================================================ */

const MD_MAX_NOTES = 2;
const MD_TIME_LIMIT_MS = 7000;
const MD_EVENT_MINUTES = 60;   // so lange zählt jeder Termin für Überschneidungen
const MD_OUTDOOR_RE = /(grill\w*|garten\w*|spazier\w*|wander\w*|radtour|fahrradtour|radfahren|picknick|fußball|fussball|tennis|golf|joggen|laufen|schwimm\w*|freibad|flohmarkt|\bmarkt\b|sommerfest|gartenfest|draußen|ausflug|angeln|camping|zelt\w*|zaun|rasen|hecke|terrasse|open air|stadtfest|spielplatz|\bpark\b|baustelle|dach\b)/i;
const MD_SCHOOL_RE = /(schul\w*|\bkita\b|kindergarten|elternabend|elternsprechtag|zeugnis\w*|einschulung|klassenfahrt|unterricht|\bhort\b)/i;

function mdAddress() { return (typeof charAddress === 'function') ? charAddress() : ((typeof currentUserName !== 'undefined' && currentUserName) || 'Sir'); }
function mdCheeky() { return (typeof sassLevel === 'function') ? sassLevel() >= 2 : true; }
function mdTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), ms))]); }

function mdParse(iso) {
    const s = String(iso || '');
    const allDay = /^\d{4}-\d{2}-\d{2}$/.test(s);
    const d = allDay ? new Date(s + 'T12:00:00') : new Date(s);
    return isNaN(d.getTime()) ? null : { date: d, allDay };
}
function mdLocalDay(d) { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; }
function mdDayText(d) { return d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' }); }
function mdTimeText(d) { return (typeof formatSpokenTime === 'function') ? formatSpokenTime(d) : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr'; }
function mdNorm(s) { return String(s || '').toLowerCase().replace(/[^a-z0-9äöüß]/g, ''); }

/* Zeitliche Termine des Kalenders (ohne Ganztägiges und Geburtstage) */
function mdTimedEntries() {
    const out = [];
    (typeof calendarEntries !== 'undefined' ? calendarEntries : []).forEach(e => {
        if (!e || !e.isoDate || /^\d{4}-\d{2}-\d{2}$/.test(String(e.isoDate))) return;
        try { if (typeof isBirthdayEntry === 'function' && isBirthdayEntry(e)) return; } catch (x) {}
        const d = new Date(e.isoDate);
        if (!isNaN(d.getTime())) out.push({ text: e.text || '', start: d, location: e.location || '' });
    });
    return out;
}

/* ---------- Die einzelnen Prüfungen: jede legt höchstens einen Hinweis { prio, text } ab ---------- */
function mdCheckBasics(notes, text, p) {
    const a = mdAddress(), now = Date.now();
    const day = mdLocalDay(p.date);
    if (p.allDay) {
        if (day < mdLocalDay(new Date())) notes.push({ prio: 1, text: mdCheeky() ? `Der Termin liegt in der Vergangenheit, ${a}. Ich trage ihn trotzdem ein, aber die Zeitmaschine ist noch in Arbeit.` : `Hinweis: Der Termin liegt in der Vergangenheit, ${a}.` });
        return;
    }
    if (p.date.getTime() < now - 5 * 60000) {
        notes.push({ prio: 1, text: mdCheeky() ? `Der Termin liegt in der Vergangenheit, ${a}. Ich trage ihn trotzdem ein, aber die Zeitmaschine ist noch in Arbeit.` : `Hinweis: Der Termin liegt in der Vergangenheit, ${a}.` });
    }
    const timed = mdTimedEntries();
    // Doppelt?
    const dup = timed.find(e => mdNorm(e.text) === mdNorm(text) && Math.abs(e.start - p.date) < 60000);
    if (dup) { notes.push({ prio: 9, text: `Achtung, ${a}: Diesen Termin gibt es schon im Kalender, am ${mdDayText(dup.start)} um ${mdTimeText(dup.start)}.` }); return; }
    // Überschneidung
    const clash = timed.filter(e => Math.abs(e.start - p.date) < MD_EVENT_MINUTES * 60000).sort((x, y) => Math.abs(x.start - p.date) - Math.abs(y.start - p.date))[0];
    if (clash) {
        const t = `${mdDayText(clash.start)} um ${mdTimeText(clash.start)}`;
        notes.push({ prio: 10, text: mdCheeky() ? `Achtung, ${a}: ${t.charAt(0).toUpperCase() + t.slice(1)} steht schon „${clash.text}“ im Kalender. Ich beherrsche Vieles, aber nicht das Teilen.` : `Achtung, ${a}: Das überschneidet sich mit „${clash.text}“, ${t}.` });
    }
    // Ungewöhnliche Uhrzeit
    const h = p.date.getHours();
    if (h < 6) notes.push({ prio: 2, text: mdCheeky() ? `${h === 0 ? 'Mitternacht' : h + ' Uhr früh'}? Mutig, ${a}.` : `Das ist ein sehr früher Termin, ${a}.` });
    else if (h >= 22) notes.push({ prio: 2, text: mdCheeky() ? `So spät noch? Mutig, ${a}.` : `Das ist ein sehr später Termin, ${a}.` });
}

async function mdCheckHoliday(notes, p) {
    if (typeof ferienHomeState !== 'function' || typeof apiFetch !== 'function') return;
    const code = await ferienHomeState();
    if (!code) return;
    const day = mdLocalDay(p.date);
    const r = await mdTimeout(apiFetch(`/api/maps?action=holidays&kind=public&from=${day}&to=${day}`), 6500);
    if (!r.ok) return;
    const d = await r.json();
    if (!Array.isArray(d)) return;
    const hit = d.find(h => {
        if (h.nationwide || !Array.isArray(h.subdivisions) || !h.subdivisions.length) return true;
        return h.subdivisions.some(sd => { const m = String((sd && sd.code) || '').match(/^DE-([A-Z]{2})/); return m && m[1] === code; });
    });
    if (!hit) return;
    const names = Array.isArray(hit.name) ? hit.name : [];
    const nm = (names.find(n => n && String(n.language).toUpperCase() === 'DE') || names[0] || {}).text || 'ein Feiertag';
    notes.push({ prio: 6, text: mdCheeky() ? `Übrigens, ${mdAddress()}: Am ${mdDayText(p.date)} ist ${nm}, also ein Feiertag. Da haben die meisten frei, falls das eine Rolle spielt.` : `Hinweis: Am ${mdDayText(p.date)} ist ${nm}, ein Feiertag.` });
}

async function mdCheckSchoolHoliday(notes, text, p) {
    if (!MD_SCHOOL_RE.test(text) || typeof ferienHomeState !== 'function' || typeof ferienLoad !== 'function') return;
    const code = await ferienHomeState();
    if (!code) return;
    await mdTimeout(ferienLoad(0), 6500);
    const day = mdLocalDay(p.date);
    const hit = ferienPeriodsFor(code).find(x => x.start <= day && x.end >= day && FERIEN_MAJOR.includes(x.kind));
    if (hit) notes.push({ prio: 5, text: `Beachten Sie, ${mdAddress()}: Zu der Zeit sind Schulferien in ${ferienStateByCode(code).name}, ${hit.name}.` });
}

async function mdCoords(location) {
    if (location && typeof wxGeocode === 'function') {
        const g = await mdTimeout(wxGeocode(location), 5500).catch(() => null);
        if (g) return { lat: g.lat, lon: g.lon };
    }
    return mdTimeout(new Promise((ok, err) => navigator.geolocation.getCurrentPosition(pos => ok({ lat: pos.coords.latitude, lon: pos.coords.longitude }), err, { timeout: 5000, maximumAge: 600000 })), 5500);
}

async function mdCheckWeather(notes, text, p, location) {
    if (!MD_OUTDOOR_RE.test(text + ' ' + (location || ''))) return;
    const diff = Math.round((new Date(mdLocalDay(p.date) + 'T12:00:00') - new Date(mdLocalDay(new Date()) + 'T12:00:00')) / 86400000);
    if (diff < 0 || diff > 6) return;
    const c = await mdCoords(location);
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${c.lat}&longitude=${c.lon}&daily=precipitation_probability_max,precipitation_sum,wind_gusts_10m_max&timezone=Europe%2FBerlin&forecast_days=7`;
    const r = await mdTimeout(fetch(url), 6500);
    const d = await r.json();
    const day = mdLocalDay(p.date);
    const i = d && d.daily && d.daily.time ? d.daily.time.indexOf(day) : -1;
    if (i < 0) return;
    const prob = d.daily.precipitation_probability_max ? (d.daily.precipitation_probability_max[i] || 0) : 0;
    const mm = d.daily.precipitation_sum ? (d.daily.precipitation_sum[i] || 0) : 0;
    const gust = d.daily.wind_gusts_10m_max ? Math.round(d.daily.wind_gusts_10m_max[i] || 0) : 0;
    const a = mdAddress();
    if (prob >= 60 || mm >= 3) notes.push({ prio: 4, text: mdCheeky() ? `Für ${mdDayText(p.date)} sind ${prob} Prozent Regenwahrscheinlichkeit gemeldet, ${a}, und der Termin klingt nach draußen. Vielleicht einen Schirm einplanen.` : `Für ${mdDayText(p.date)} sind ${prob} Prozent Regenwahrscheinlichkeit gemeldet. Der Termin klingt nach draußen.` });
    else if (gust >= 60) notes.push({ prio: 4, text: `Für ${mdDayText(p.date)} sind Sturmböen bis ${gust} Kilometer pro Stunde gemeldet, und der Termin klingt nach draußen.` });
}

/* Fahrzeit in Minuten zwischen zwei Orten (OSRM über deinen Server); null, wenn nicht ermittelbar */
async function mdDriveMinutes(fromLoc, toLoc) {
    if (typeof wxGeocode !== 'function' || typeof apiFetch !== 'function') return null;
    const [g1, g2] = await Promise.all([mdTimeout(wxGeocode(fromLoc), 5500).catch(() => null), mdTimeout(wxGeocode(toLoc), 5500).catch(() => null)]);
    if (!g1 || !g2) return null;
    const r = await mdTimeout(apiFetch(`/api/route?fromLat=${g1.lat}&fromLon=${g1.lon}&toLat=${g2.lat}&toLon=${g2.lon}`), 6000);
    const d = await r.json();
    const sec = d && d.routes && d.routes[0] && d.routes[0].duration;
    return sec ? Math.round(sec / 60) : null;
}

async function mdCheckTravel(notes, text, p, location) {
    if (!location) return;
    const day = mdLocalDay(p.date);
    const same = mdTimedEntries().filter(e => e.location && mdLocalDay(e.start) === day && Math.abs(e.start - p.date) >= MD_EVENT_MINUTES * 60000);
    const prev = same.filter(e => e.start < p.date).sort((x, y) => y.start - x.start)[0];
    const next = same.filter(e => e.start > p.date).sort((x, y) => x.start - y.start)[0];
    const a = mdAddress();
    const jobs = [];
    if (prev) jobs.push((async () => {
        const gap = Math.round((p.date - (prev.start.getTime() + MD_EVENT_MINUTES * 60000)) / 60000);
        if (gap > 150) return;
        const drive = await mdDriveMinutes(prev.location, location);
        if (drive !== null && gap < drive + 10) notes.push({ prio: 8, text: `Zwischen „${prev.text}“ und diesem Termin brauchen Sie etwa ${drive} Minuten Fahrt, es bleiben aber nur ${Math.max(gap, 0)}. Das wird knapp, ${a}.` });
    })());
    if (next) jobs.push((async () => {
        const gap = Math.round((next.start - (p.date.getTime() + MD_EVENT_MINUTES * 60000)) / 60000);
        if (gap > 150) return;
        const drive = await mdDriveMinutes(location, next.location);
        if (drive !== null && gap < drive + 10) notes.push({ prio: 8, text: `Von diesem Termin zu „${next.text}“ brauchen Sie etwa ${drive} Minuten Fahrt, es bleiben aber nur ${Math.max(gap, 0)}. Das wird knapp, ${a}.` });
    })());
    await Promise.all(jobs);
}

/* ---------- Haupt-Funktion: gibt die (höchstens zwei) wichtigsten Hinweise als Sätze zurück ---------- */
async function thoughtsForNewEvent(text, iso, location) {
    const p = mdParse(iso);
    if (!p) return [];
    const notes = [];
    try { mdCheckBasics(notes, String(text || ''), p); } catch (e) {}
    const slow = [];
    const guard = (fn) => Promise.resolve().then(fn).catch(() => {});
    slow.push(guard(() => mdCheckHoliday(notes, p)));
    if (!p.allDay) {
        slow.push(guard(() => mdCheckSchoolHoliday(notes, String(text || ''), p)));
        slow.push(guard(() => mdCheckWeather(notes, String(text || ''), p, location)));
        slow.push(guard(() => mdCheckTravel(notes, String(text || ''), p, location)));
    }
    await Promise.race([Promise.all(slow), new Promise(r => setTimeout(r, MD_TIME_LIMIT_MS))]);
    return notes.slice().sort((x, y) => y.prio - x.prio).slice(0, MD_MAX_NOTES).map(n => n.text);
}
