/* ============================================================
   FOTO-FUNKTION: Kamera auf etwas halten, Jarvis wertet das Foto mit einer KI aus.
   Aufrufen: Knopf 📷 unter der Kugel, oder per Sprache: "Mach ein Foto", "Übersetze dieses Schild", "Lies mir den Brief vor",
   "Erkläre mir diese Warnleuchte", "Trag die Termine von diesem Foto in meinen Kalender ein", "Was für ein Vogel ist das?" (Kamera öffnet sich nach einem Tipp
   auf die Karte, weil Chrome die Kamera nur nach einem Fingertipp erlaubt).
   Danach Fragen zum selben Foto: "Zum Foto: Was kostet das?" (10 Minuten lang).
   TERMINE AUS EINEM FOTO: Jarvis liest sie heraus und zeigt sie als Karten; eingetragen wird erst nach deinem "Ja" (oder Tipp auf die Karten),
   weil eine KI Handschrift und Datum auch mal falsch liest. Termine ohne Uhrzeit werden ganztägig eingetragen, schon vorhandene übersprungen.
   Datenschutz: Das Foto wird verkleinert und zur Auswertung an den KI-Anbieter geschickt (über deinen Server /api/groq).
   Braucht: voice.js (speak), calendar.js (addGoogleCalendarEvent), briefing.js (normalizeKey), apiFetch, showActionCards/clearActionCards.
   Wird von localcommands.js aufgerufen.
   ============================================================ */

/* Bild-fähige KI-Modelle bei Groq; das erste ist die Wahl, das zweite die Ersatzwahl, falls das erste nicht (mehr) angeboten wird.
   Ändern sich die Modellnamen, genügt es, sie hier zu tauschen. */
const PHOTO_MODELS = ['meta-llama/llama-4-scout-17b-16e-instruct', 'meta-llama/llama-4-maverick-17b-128e-instruct'];
const PHOTO_MAX_SIDE = 1600;        // längste Seite nach dem Verkleinern, in Pixeln
const PHOTO_JPEG_QUALITY = 0.82;
const PHOTO_INTENT_MS = 3 * 60000;  // so lange gilt "Übersetze dieses Schild", bis das Foto da ist
const PHOTO_FOLLOWUP_MS = 10 * 60000;
const PHOTO_EVENTS_MS = 5 * 60000;

let photoIntent = null;   // { task, question, at }
let lastPhoto = null;     // { dataUrl, at } für Fragen zum selben Foto
let photoEvents = [];     // erkannte Termine: { titel, datum, uhrzeit, ort, unsicher, done }
let photoEventsAt = 0;

/* ---------- Was soll mit dem Foto passieren? ---------- */
function parsePhotoRequest(text) {
    const t = String(text || '').toLowerCase().replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 140) return null;
    const photoWord = /\b(foto|fotos|bild|kamera|aufnahme|fotografier\w*|abfotografier\w*)\b/.test(t);

    if (/\b(termine?|kalender|terminplan|kalenderblatt|wochenplan)\b/.test(t) && photoWord && /(eintrag|trag|schreib|übernehm|erkenn|lies|übertrag|hinzu|aus dem|vom|von diesem|von dem)/.test(t)) {
        return { task: 'events', question: t };
    }
    if (/\b(warnleuchte|kontrollleuchte|warnlampe|warnsymbol|kontrolllampe|warnanzeige)\b/.test(t)) return { task: 'car', question: t };
    if (/(?<![\wäöüß])übersetz\w*/.test(t) && /\b(schild|foto|bild|speisekarte|karte|etikett|brief|seite|text|verpackung|zettel|aushang|dokument|menü|beschreibung)\b/.test(t)) return { task: 'translate', question: t };
    if (/\b(lies|les|lese|vorlesen)\b/.test(t) && (photoWord || /\b(schild|brief|zettel|etikett|speisekarte|aushang|dokument|verpackung|beipackzettel|rechnung)\b/.test(t))) return { task: 'read', question: t };
    if (/\bwas f(?:ü|ue)r (?:ein|eine|einen)\s+(?:\w+\s+)?(pflanze|blume|baum|vogel|tier|pilz|insekt|käfer|spinne|schmetterling|fisch|schlange|hund|katze|strauch|blatt|frucht)\b/.test(t)) return { task: 'identify', question: t };
    if (/\bmach\w*\s+(?:mal\s+)?(?:ein\s+)?(?:foto|bild)\b/.test(t) || /^(?:foto|kamera|foto machen|bild machen|kamera öffnen|foto aufnehmen)(?:\s+bitte)?$/.test(t)
        || /\b(?:schau|sieh|guck)\w*\s+(?:dir\s+)?(?:das|dies\w*)?\s*(?:mal\s+)?an\b/.test(t) || /\bwas siehst du\b/.test(t) || /\bnimm\s+(?:ein\s+)?foto\b/.test(t) || /\bfotografier\w*/.test(t)) {
        return { task: 'describe', question: t };
    }
    return null;
}

const PHOTO_SYSTEM_BASE = 'Du bist J.A.R.V.I.S., ein Assistent, der ein Foto auswertet. Antworte auf Deutsch, knapp und so, dass man es gut vorlesen kann: höchstens vier kurze Sätze, ohne Aufzählungszeichen, ohne Markdown, ohne Links. ' +
    'Erfinde nichts. Ist etwas nicht erkennbar oder nicht lesbar, sage das ehrlich, statt zu raten.';

function photoSystemPrompt(task) {
    switch (task) {
        case 'read': return PHOTO_SYSTEM_BASE + ' Lies den sichtbaren Text vor. Bei langen Texten nenne nur das Wichtigste (Absender, Anliegen, Fristen, Beträge). Ist der Text nicht deutsch, übersetze ihn ins Deutsche.';
        case 'translate': return PHOTO_SYSTEM_BASE + ' Übersetze den sichtbaren Text ins Deutsche. Sage zuerst kurz, was es ist (Schild, Speisekarte, Etikett ...), dann die Übersetzung.';
        case 'car': return PHOTO_SYSTEM_BASE + ' Auf dem Foto sind Anzeigen oder Kontrollleuchten eines Autos (es kann ein Diesel-SUV sein). Nenne, welche Leuchte oder Anzeige du erkennst, was sie bedeutet und ob man weiterfahren kann oder anhalten bzw. in die Werkstatt muss. Bist du unsicher, sage das und empfehle einen Blick in die Bedienungsanleitung.';
        case 'identify': return PHOTO_SYSTEM_BASE + ' Sage, was zu sehen ist. Bei Pflanzen, Tieren und Pilzen nenne die wahrscheinlichste Art mit deiner Sicherheit und weise darauf hin, dass man Pilze und Pflanzen nie allein nach einem Foto essen sollte.';
        default: return PHOTO_SYSTEM_BASE + ' Beschreibe kurz, was zu sehen ist. Ist Text sichtbar, nenne das Wichtigste daraus und übersetze ihn ins Deutsche, falls er nicht deutsch ist.';
    }
}

/* ---------- Kamera öffnen, Foto vorbereiten ---------- */
function openPhotoCamera(fromButton) {
    if (fromButton && (!photoIntent || Date.now() - photoIntent.at > PHOTO_INTENT_MS)) photoIntent = { task: 'describe', question: '', at: Date.now() };
    const el = document.getElementById('photoInput');
    if (el) el.click();
}
function openPhotoGallery() {
    const el = document.getElementById('photoPickInput');
    if (el) el.click();
}

function showPhotoCards() {
    if (typeof clearActionCards === 'function') clearActionCards();
    if (typeof showActionCards === 'function') {
        showActionCards([
            { icon: '📷', title: 'Foto aufnehmen', subtitle: 'Tippen, dann öffnet sich die Kamera', onclick: 'openPhotoCamera()' },
            { icon: '🖼️', title: 'Bild aus der Galerie', subtitle: 'Ein vorhandenes Foto auswählen', onclick: 'openPhotoGallery()' }
        ]);
    }
}

/* Foto verkleinern (Datenmenge und Tempo) und als JPEG-Datenadresse zurückgeben */
function preparePhoto(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Foto nicht lesbar'));
        reader.onload = () => {
            const raw = reader.result;
            const img = new Image();
            img.onerror = () => reject(new Error('Bild nicht lesbar'));
            img.onload = () => {
                try {
                    const scale = Math.min(1, PHOTO_MAX_SIDE / Math.max(img.width, img.height));
                    const w = Math.max(1, Math.round(img.width * scale)), h = Math.max(1, Math.round(img.height * scale));
                    const canvas = document.createElement('canvas');
                    canvas.width = w; canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY));
                } catch (e) { resolve(raw); }   // notfalls das Original schicken
            };
            img.src = raw;
        };
        reader.readAsDataURL(file);
    });
}

/* ---------- KI fragen ---------- */
function photoTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms))]);
}

async function askVision(system, userText, dataUrl, wantJson) {
    let lastErr = null;
    for (const model of PHOTO_MODELS) {
        for (const withJsonMode of (wantJson ? [true, false] : [false])) {   // manche Modelle verweigern den JSON-Modus mit Bildern: dann ohne versuchen
            try {
                const body = {
                    model, temperature: 0.2,
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: dataUrl } }] }
                    ]
                };
                if (withJsonMode) body.response_format = { type: 'json_object' };
                const res = await photoTimeout(apiFetch('/api/groq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), 45000);
                const data = await res.json().catch(() => null);
                if (res.ok && data && data.choices && data.choices[0]) return String(data.choices[0].message.content || '');
                lastErr = (data && data.error && (data.error.message || data.error)) || ('Status ' + res.status);
                console.error('Foto-KI (' + model + (withJsonMode ? ', JSON-Modus' : '') + '):', lastErr);
            } catch (e) {
                lastErr = e.message;
                console.error('Foto-KI (' + model + '):', e.message);
                if (e.auth) throw e;
            }
        }
    }
    throw new Error(String(lastErr || 'unbekannter Fehler'));
}

function photoCleanAnswer(raw) {
    if (typeof cleanWebAnswer === 'function') return cleanWebAnswer(raw);
    return String(raw || '').replace(/[*_`#>|]+/g, ' ').replace(/https?:\/\/\S+/g, '').replace(/\s*\n+\s*/g, '. ').replace(/\s{2,}/g, ' ').trim();
}

/* ---------- Termine aus dem Foto ---------- */
function photoEventsPrompt() {
    const now = new Date();
    const today = now.toLocaleDateString('sv-SE', { timeZone: 'Europe/Berlin' });
    return 'Du liest Termine aus dem Foto eines Kalenders, Terminplans, Dienstplans oder Zettels. Heute ist ' + today + '. ' +
        'Antworte NUR mit einem JSON-Objekt: {"termine":[{"titel":"kurzer Titel","datum":"JJJJ-MM-TT","uhrzeit":"HH:MM oder null","ort":"Ort oder null","unsicher":true oder false}],"hinweis":"ein kurzer Satz oder leer"}. ' +
        'Regeln: Nimm nur Einträge, die wirklich als Termin dastehen. Steht Monat oder Jahr nur als Überschrift auf dem Blatt, übernimm es für die Einträge darunter. Fehlt das Jahr, nimm das Jahr, bei dem der Termin heute oder in der Zukunft liegt. ' +
        'Gibt es keine Uhrzeit, setze "uhrzeit" auf null. Ist Handschrift, Datum oder Titel schwer lesbar, setze "unsicher" auf true. Erfinde nichts. Sind keine Termine erkennbar, gib eine leere Liste zurück.';
}

function parsePhotoEvents(content) {
    let obj = null;
    try { obj = JSON.parse(content); } catch (e) {
        const m = String(content || '').match(/\{[\s\S]*\}/);
        if (m) { try { obj = JSON.parse(m[0]); } catch (e2) {} }
    }
    const list = obj && Array.isArray(obj.termine) ? obj.termine : [];
    const out = [];
    list.forEach(e => {
        if (!e || typeof e !== 'object') return;
        const titel = String(e.titel || '').trim().slice(0, 80);
        const datum = String(e.datum || '').trim();
        if (!titel || !/^\d{4}-\d{2}-\d{2}$/.test(datum) || isNaN(new Date(datum + 'T12:00:00').getTime())) return;
        let uhrzeit = null, unsicher = !!e.unsicher;
        const rawTime = String(e.uhrzeit == null ? '' : e.uhrzeit).trim();
        const tm = rawTime.match(/^(\d{1,2}):(\d{2})/);
        if (tm && Number(tm[1]) < 24 && Number(tm[2]) < 60) uhrzeit = `${tm[1].padStart(2, '0')}:${tm[2]}`;
        else if (rawTime && rawTime.toLowerCase() !== 'null') unsicher = true;   // Uhrzeit angegeben, aber nicht lesbar/sinnvoll: bitte prüfen
        out.push({ titel, datum, uhrzeit, ort: e.ort ? String(e.ort).trim().slice(0, 60) : '', unsicher, done: false });
    });
    return { events: out.slice(0, 20), hint: obj && obj.hinweis ? String(obj.hinweis) : '' };
}

function photoEventWhen(e) {
    const day = new Date(e.datum + 'T12:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long' });
    if (!e.uhrzeit) return day;
    const [h, m] = e.uhrzeit.split(':').map(Number);
    return `${day} um ${h} Uhr${m ? ' ' + m : ''}`;
}

function localDayOf(value) {
    const d = new Date(value);
    if (isNaN(d.getTime())) return '';
    const p = n => String(n).padStart(2, '0');
    return /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function photoEventExists(ev) {
    const key = normalizeKey(ev.titel);
    return (calendarEntries || []).some(c => c.isoDate && normalizeKey(c.text) === key && localDayOf(c.isoDate) === ev.datum);
}

function showPhotoEventCards() {
    const open = photoEvents.filter(e => !e.done).length;
    const cards = photoEvents.map((e, i) => {
        const card = { icon: e.done ? '✅' : '📅', title: e.titel, subtitle: `${photoEventWhen(e)}${e.ort ? ' · ' + e.ort : ''}${e.unsicher ? ' · ⚠️ bitte prüfen' : ''}${e.done ? ' · eingetragen' : ''}` };
        if (!e.done) card.onclick = `addPhotoEvent(${i})`;
        return card;
    });
    if (open > 0) cards.push({ icon: '➕', title: open === 1 ? 'Termin eintragen' : `Alle ${open} eintragen`, subtitle: 'In den Google Kalender', onclick: 'addAllPhotoEvents()' });
    if (typeof clearActionCards === 'function') clearActionCards();
    if (typeof showActionCards === 'function') showActionCards(cards);
}

/* Trägt einen erkannten Termin ein; gibt 'ok', 'schon da', 'lokal' (nur in der App) zurück */
async function addOnePhotoEvent(e) {
    if (photoEventExists(e)) return 'schon da';
    const iso = e.uhrzeit ? `${e.datum}T${e.uhrzeit}:00` : e.datum;
    const synced = await addGoogleCalendarEvent(e.titel, iso, e.ort || '', null, !e.uhrzeit);
    return synced === false ? 'lokal' : 'ok';
}

function photoSay(msg) { speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined); }

async function addPhotoEvent(i) {
    const e = photoEvents[i];
    if (!e || e.done) return;
    const r = await addOnePhotoEvent(e);
    e.done = true;
    showPhotoEventCards();
    if (r === 'lokal') photoSay(`${googleProblemText(lastGoogleProblem)} Der Termin ${e.titel} ist nur in der App gespeichert.`);
    else photoSay(r === 'schon da' ? `${e.titel} stand schon in Ihrem Kalender.` : `${e.titel} ist eingetragen, ${photoEventWhen(e)}.`);
}

async function addAllPhotoEvents() {
    const todo = photoEvents.filter(e => !e.done);
    if (!todo.length) { photoSay('Es gibt nichts mehr einzutragen.'); return; }
    let added = 0, skipped = 0, local = 0;
    for (const e of todo) {
        const r = await addOnePhotoEvent(e);
        e.done = true;
        if (r === 'ok') added++; else if (r === 'schon da') skipped++; else local++;
    }
    photoEventsAt = 0;
    showPhotoEventCards();
    let msg = `${added + local} ${added + local === 1 ? 'Termin' : 'Termine'} eingetragen.`;
    if (skipped) msg += ` ${skipped} ${skipped === 1 ? 'stand' : 'standen'} schon im Kalender.`;
    if (local) msg += ` ${googleProblemText(lastGoogleProblem)} ${local === 1 ? 'Einer ist' : local + ' sind'} nur in der App gespeichert.`;
    photoSay(msg);
}

/* ---------- Foto ist da ---------- */
async function handlePhotoFile(file) {
    if (!file) return;
    const intent = (photoIntent && Date.now() - photoIntent.at < PHOTO_INTENT_MS) ? photoIntent : { task: 'describe', question: '' };
    photoIntent = null;
    try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Werte das Foto aus...'); } catch (e) {}
    try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) {}
    let dataUrl;
    try { dataUrl = await preparePhoto(file); } catch (e) { photoSay('Das Foto konnte ich nicht lesen.'); return; }
    lastPhoto = { dataUrl, at: Date.now() };
    try {
        if (intent.task === 'events') {
            const content = await askVision(photoEventsPrompt(), 'Lies die Termine aus diesem Foto.', dataUrl, true);
            const { events, hint } = parsePhotoEvents(content);
            if (!events.length) { photoSay('Ich konnte keine Termine erkennen. Ist das Foto scharf, und ist der Kalender gut zu sehen?' + (hint ? ' ' + hint : '')); return; }
            photoEvents = events; photoEventsAt = Date.now();
            showPhotoEventCards();
            const unsure = events.filter(e => e.unsicher).length;
            const names = events.slice(0, 3).map(e => `${e.titel}, ${photoEventWhen(e)}`).join('; ');
            photoSay(`Ich habe ${events.length} ${events.length === 1 ? 'Termin' : 'Termine'} erkannt: ${names}${events.length > 3 ? ' und weitere' : ''}.` +
                (unsure ? ` Bei ${unsure} bin ich nicht sicher.` : '') + ` Soll ich ${events.length === 1 ? 'ihn' : 'sie'} eintragen? Sagen Sie Ja, oder tippen Sie unten auf ${events.length === 1 ? 'die Karte' : 'die Karten'}.`);
            return;
        }
        const q = intent.question ? `Der Nutzer sagte: "${intent.question}". Mach, was er möchte.` : 'Was ist auf dem Foto?';
        const content = await askVision(photoSystemPrompt(intent.task), q, dataUrl, false);
        const answer = photoCleanAnswer(content);
        photoSay(answer || 'Dazu konnte ich auf dem Foto nichts Brauchbares erkennen.');
    } catch (e) {
        console.error('Foto-Auswertung fehlgeschlagen:', e && e.message);
        const m = String((e && e.message) || 'unbekannter Fehler');
        // Den echten Grund als Karte zeigen (eine Konsole gibt es in der App nicht): so lässt sich der Fehler gezielt beheben
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards([{ icon: '⚠️', title: 'Foto-Auswertung: Fehler der KI-Verbindung', subtitle: m.slice(0, 220) }]);
        } catch (e2) {}
        photoSay(/image|vision|content|model|multimodal/i.test(m)
            ? 'Meine KI-Verbindung nimmt gerade keine Bilder an. Den genauen Grund sehen Sie unten auf der Karte.'
            : 'Die Auswertung des Fotos hat gerade nicht geklappt. Den Grund sehen Sie unten auf der Karte.');
    }
}

/* ---------- Sprachbefehle ---------- */
function handlePhotoCommand(text) {
    const raw = String(text || '').trim();
    const t = raw.toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return false;

    // Erkannte Termine: "Ja" trägt sie ein, "Nein" verwirft sie
    if (photoEvents.some(e => !e.done) && Date.now() - photoEventsAt < PHOTO_EVENTS_MS) {
        if (/^(?:ja|jawohl|jo|gerne|bitte|okay|ok|klar|los|mach das|mach es|alle|ja bitte|ja gerne|trag(?:e)? (?:sie|alle|die|das)(?: alle)? ein|alle eintragen|eintragen|übernehmen|bitte eintragen)$/.test(t)) {
            addAllPhotoEvents().catch(() => photoSay('Das Eintragen hat nicht geklappt.'));
            return true;
        }
        if (/^(?:nein|nee|nicht|lieber nicht|abbrechen|vergiss es|lass (?:es|das)|verwerfen)$/.test(t)) {
            photoEvents = []; photoEventsAt = 0;
            try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) {}
            photoSay('Gut, ich habe nichts eingetragen.');
            return true;
        }
    }

    // Frage zum letzten Foto: "Zum Foto: Was kostet das?"
    const follow = t.match(/^(?:und\s+)?(?:zum|zu dem|auf dem|auf diesem|im|in dem)\s+(?:foto|bild)\s+(.+)$/);
    if (follow) {
        if (!lastPhoto || Date.now() - lastPhoto.at > PHOTO_FOLLOWUP_MS) { photoSay('Ich habe gerade kein Foto, auf das ich mich beziehen kann.'); return true; }
        photoSay('Ich schaue noch einmal hin.');
        askVision(photoSystemPrompt('describe'), `Frage des Nutzers zum Foto: "${follow[1]}"`, lastPhoto.dataUrl, false)
            .then(a => photoSay(photoCleanAnswer(a) || 'Dazu sehe ich auf dem Foto nichts.'))
            .catch(() => photoSay('Die Auswertung hat gerade nicht geklappt.'));
        return true;
    }

    const req = parsePhotoRequest(raw);
    if (!req) return false;
    photoIntent = { task: req.task, question: raw, at: Date.now() };
    showPhotoCards();
    const what = req.task === 'events' ? 'Fotografieren Sie den Kalender' : req.task === 'translate' ? 'Fotografieren Sie, was ich übersetzen soll' : req.task === 'read' ? 'Fotografieren Sie, was ich vorlesen soll' : 'Halten Sie die Kamera darauf';
    photoSay(`${what}. Tippen Sie unten auf die Karte, dann öffnet sich die Kamera.`);
    return true;
}

/* ---------- Kamera-Eingabe und Knopf verbinden ---------- */
(function initPhoto() {
    try {
        const onPick = (ev) => {
            const f = ev.target && ev.target.files && ev.target.files[0];
            handlePhotoFile(f);
            try { ev.target.value = ''; } catch (e) {}   // derselbe Foto-Name darf erneut gewählt werden
        };
        ['photoInput', 'photoPickInput'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.addEventListener('change', onPick);
        });
    } catch (e) { /* ohne Kamera-Eingabe läuft die App normal weiter */ }
})();
