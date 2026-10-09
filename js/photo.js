/* ============================================================
   FOTO-FUNKTION: Kamera auf etwas halten, Jarvis wertet das Foto mit einer KI aus.
   Aufrufen: Knopf 📷 unter der Kugel, oder per Sprache: "Mach ein Foto", "Übersetze dieses Schild", "Lies mir den Brief vor",
   "Erkläre mir diese Warnleuchte", "Trag die Termine von diesem Foto in meinen Kalender ein", "Was für ein Vogel ist das?" (Kamera öffnet sich nach einem Tipp
   auf die Karte, weil Chrome die Kamera nur nach einem Fingertipp erlaubt).
   Weitere Aufgaben: Visitenkarte -> Kontakt anlegen, handgeschriebener Zettel -> Einkaufsliste, Plakat/Flyer -> Termin, Parkschild ("Darf ich hier parken?"),
   Zutaten -> Rezeptidee ("Was kann ich damit kochen?"). Kontakt und Einkaufszettel werden erst nach deinem "Ja" gespeichert.
   Danach Fragen zum selben Foto: "Zum Foto: Was kostet das?" (10 Minuten lang).
   TERMINE AUS EINEM FOTO: Jarvis liest sie heraus und zeigt sie als Karten; eingetragen wird erst nach deinem "Ja" (oder Tipp auf die Karten),
   weil eine KI Handschrift und Datum auch mal falsch liest. Termine ohne Uhrzeit werden ganztägig eingetragen, schon vorhandene übersprungen.
   Datenschutz: Das Foto wird verkleinert und zur Auswertung an den KI-Anbieter geschickt (über deinen Server /api/groq).
   Braucht: voice.js (speak), calendar.js (addGoogleCalendarEvent), briefing.js (normalizeKey), apiFetch, showActionCards/clearActionCards.
   Wird von localcommands.js aufgerufen.
   ============================================================ */

/* Bild-fähige KI-Modelle bei Groq (laut Groq-Dokumentation "Images and Vision", Stand 2026). Das erste ist die Wahl, das zweite die Ersatzwahl,
   falls das erste nicht (mehr) angeboten wird. Die früheren Llama-4-Modelle gibt es dort nicht mehr. Ändern sich die Namen, genügt es, sie hier zu tauschen.
   gpt-oss-120b (das Standard-Modell der App) versteht nur Text, deshalb braucht die Foto-Funktion eigene Modelle. */
const PHOTO_MODELS = ['qwen/qwen3.8-27b', 'qwen/qwen3.6-27b'];
const PHOTO_MAX_SIDE = 1600;        // längste Seite nach dem Verkleinern, in Pixeln
const PHOTO_JPEG_QUALITY = 0.82;
const PHOTO_INTENT_MS = 3 * 60000;  // so lange gilt "Übersetze dieses Schild", bis das Foto da ist
const PHOTO_FOLLOWUP_MS = 10 * 60000;
const PHOTO_EVENTS_MS = 5 * 60000;

let photoIntent = null;   // { task, question, at }
let lastPhoto = null;     // { dataUrl, at, text } für Fragen zum selben Foto (text: nur bei PDF, der Text aus der Datei)
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
    // Plakat, Flyer, Einladung -> Termin
    if (/\b(plakat|flyer|einladung|aushang|veranstaltung\w*)\b/.test(t) && /\b(termin\w*|veranstaltung\w*|kalender)\b/.test(t) && /(eintrag|trag|schreib|übernehm|übernimm|erkenn|hinzu)/.test(t)) return { task: 'events', question: t };
    // Visitenkarte -> Kontakt anlegen
    if (/\b(visitenkarte|kontaktkarte)\b/.test(t) || (/\bkontakt\w*\b/.test(t) && photoWord && /(anleg|erstell|speicher|übernehm|trag|eintrag|neu)/.test(t))) return { task: 'contact', question: t };
    // Einkaufszettel -> Einkaufsliste
    if (/\b(einkaufszettel|einkaufsliste|zettel|handgeschrieben\w*)\b/.test(t) && (photoWord || /zettel/.test(t)) && /(setz|trag|schreib|übernehm|übernimm|füg|hinzu|abschreib|auf die liste|in die liste|einkaufsliste)/.test(t)) return { task: 'shopping', question: t };
    // Parkschild
    if (/\b(darf|kann|muss)\s+ich\s+hier\s+(parken|stehen|halten)\b/.test(t) || /\b(parkschild|parkverbot|halteverbot|parkscheibe|parkregelung|parkordnung)\b/.test(t)) return { task: 'parking', question: t };
    // Zutaten -> Rezept
    if (/\bwas kann ich (?:damit|hieraus|daraus|mit (?:diesen|den)\s+(?:zutaten|sachen|lebensmitteln))\s*(?:kochen|machen|zubereiten)\b/.test(t) || (/\b(zutaten|kühlschrank|vorräte|vorrat)\b/.test(t) && /\b(koch\w*|rezept\w*|gericht)\b/.test(t))) return { task: 'cook', question: t };
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

/* Wochentag, Datum und Uhrzeit für Fragen, bei denen die Zeit zählt (z.B. Parkschilder) */
function photoNowText() {
    const d = new Date();
    return 'Heute ist ' + d.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + ', es ist ' + d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr.';
}

function photoContactPrompt() {
    return 'Du liest die Kontaktdaten von einem Foto einer Visitenkarte, eines Briefkopfs oder Stempels. Antworte NUR mit einem JSON-Objekt: ' +
        '{"kontakt":{"name":"Vor- und Nachname oder Firmenname","telefon":"Nummer oder null","adresse":"Straße Hausnummer, PLZ Ort oder null","firma":"Firma oder null","email":"Adresse oder null"}}. ' +
        'Nimm bei mehreren Nummern die Mobilnummer, sonst die erste. Erfinde nichts; was nicht zu lesen ist, setze auf null.';
}

function photoShoppingPrompt() {
    return 'Du liest einen Einkaufszettel oder eine Liste von einem Foto (oft handgeschrieben). Antworte NUR mit einem JSON-Objekt: {"artikel":["Milch","Brot"]}. ' +
        'Jeder Eintrag ist ein kurzer Artikelname mit Menge, falls dabei (zum Beispiel "2 Liter Milch"). Durchgestrichene oder abgehakte Einträge lässt du weg. Erfinde nichts; was nicht lesbar ist, lässt du weg.';
}

function photoSystemPrompt(task) {
    switch (task) {
        case 'read': return PHOTO_SYSTEM_BASE + ' Lies den sichtbaren Text vor. Bei langen Texten nenne nur das Wichtigste (Absender, Anliegen, Fristen, Beträge). Ist der Text nicht deutsch, übersetze ihn ins Deutsche.';
        case 'translate': return PHOTO_SYSTEM_BASE + ' Übersetze den sichtbaren Text ins Deutsche. Sage zuerst kurz, was es ist (Schild, Speisekarte, Etikett ...), dann die Übersetzung.';
        case 'car': return PHOTO_SYSTEM_BASE + ' Auf dem Foto sind Anzeigen oder Kontrollleuchten eines Autos (es kann ein Diesel-SUV sein). Nenne, welche Leuchte oder Anzeige du erkennst, was sie bedeutet und ob man weiterfahren kann oder anhalten bzw. in die Werkstatt muss. Bist du unsicher, sage das und empfehle einen Blick in die Bedienungsanleitung.';
        case 'identify': return PHOTO_SYSTEM_BASE + ' Sage, was zu sehen ist. Bei Pflanzen, Tieren und Pilzen nenne die wahrscheinlichste Art mit deiner Sicherheit und weise darauf hin, dass man Pilze und Pflanzen nie allein nach einem Foto essen sollte.';
        case 'parking': return PHOTO_SYSTEM_BASE + ' ' + photoNowText() + ' Auf dem Foto sind Verkehrsschilder oder Parkregeln. Sage, ob man hier jetzt parken darf, wie lange, ob Parkscheibe oder Gebühr nötig ist und ab wann sich etwas ändert. Bist du unsicher oder ist ein Schild nicht lesbar, sage es und rate dazu, im Zweifel nicht zu parken.';
        case 'cook': return 'Du bist J.A.R.V.I.S. und siehst ein Foto von Zutaten oder einem Kühlschrank. Antworte auf Deutsch, ohne Aufzählungszeichen, ohne Markdown, gut vorlesbar. Nenne kurz, welche Zutaten du erkennst, schlage dann EIN passendes Gericht vor und nenne die Zubereitung in höchstens sechs kurzen Sätzen. Sage, welche gewöhnlichen Zutaten du voraussetzt (zum Beispiel Salz und Öl). Erfinde keine Zutaten, die nicht zu sehen sind.';
        default: return PHOTO_SYSTEM_BASE + ' Beschreibe kurz, was zu sehen ist. Ist Text sichtbar, nenne das Wichtigste daraus und übersetze ihn ins Deutsche, falls er nicht deutsch ist.';
    }
}

/* ---------- Kamera öffnen, Foto vorbereiten ---------- */
function openPhotoCamera(fromButton) {
    const el = document.getElementById('photoInput');
    if (el) el.click();
}
function openPhotoGallery() {
    const el = document.getElementById('photoPickInput');
    if (el) el.click();
}

function showPhotoCards(galleryFirst) {
    if (typeof clearActionCards === 'function') clearActionCards();
    if (typeof showActionCards === 'function') {
        const cam = { icon: '📷', title: 'Foto aufnehmen', subtitle: 'Tippen, dann öffnet sich die Kamera', onclick: 'openPhotoCamera()' };
        const pick = { icon: '📁', title: 'Bild oder PDF aus den Dateien', subtitle: 'Ein Bild oder eine PDF vom Handy auswählen', onclick: 'openPhotoGallery()' };
        showActionCards(galleryFirst ? [pick, cam] : [cam, pick]);
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

/* PDF: erste Seite als Bild (pdf.js wird erst bei Bedarf von jsdelivr geladen, wie die Karten-Bibliothek). Mehrseitige PDFs: die erste Seite zählt. */
const PDFJS_VERSION = '3.11.174';
const PDFJS_URL = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/build/pdf.min.js';
const PDFJS_WORKER = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@' + PDFJS_VERSION + '/build/pdf.worker.min.js';
let pdfjsLoading = null;
function loadPdfJs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    if (!pdfjsLoading) {
        pdfjsLoading = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = PDFJS_URL;
            s.onload = () => { if (window.pdfjsLib) { window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER; resolve(window.pdfjsLib); } else reject(new Error('PDF-Bibliothek fehlt')); };
            s.onerror = () => { pdfjsLoading = null; reject(new Error('PDF-Bibliothek nicht ladbar')); };
            document.head.appendChild(s);
        });
    }
    return pdfjsLoading;
}
function isPdfFile(file) { return !!file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')); }
async function preparePdf(file) {
    const lib = await loadPdfJs();
    const buf = await file.arrayBuffer();
    const pdf = await lib.getDocument({ data: buf }).promise;
    // Text direkt aus der Datei lesen (Seite 1 und 2): exakt, ohne Bilderkennung. Bei gescannten PDFs bleibt er leer, dann gilt nur das Bild.
    let text = '';
    try {
        for (let n = 1; n <= Math.min(2, pdf.numPages); n++) {
            const pg = await pdf.getPage(n);
            const tc = await pg.getTextContent();
            text += tc.items.map(i => (i.str || '') + (i.hasEOL ? '\n' : ' ')).join('') + '\n';
        }
        text = text.replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim().slice(0, 7000);
    } catch (e) { text = ''; }
    const page = await pdf.getPage(1);
    const v1 = page.getViewport({ scale: 1 });
    const scale = Math.max(PHOTO_MAX_SIDE, 2000) / Math.max(v1.width, v1.height);
    const vp = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(vp.width)); canvas.height = Math.max(1, Math.round(vp.height));
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);   // PDF-Hintergrund ist durchsichtig: sonst wird er im JPEG schwarz
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    return { dataUrl: canvas.toDataURL('image/jpeg', PHOTO_JPEG_QUALITY), text };
}

/* ---------- KI fragen ---------- */
function photoTimeout(promise, ms) {
    return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('Zeitüberschreitung')), ms))]);
}

/* Entfernt Denk-Abschnitte, falls das Modell welche mitschickt */
function stripThinking(text) {
    return String(text || '').replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/<\/?think>/gi, ' ').trim();
}

/* Fragt ein bildfähiges Modell. Probiert nacheinander die Modelle und je Modell mehrere Varianten der Anfrage:
   1) Denken aus + (bei Terminen) JSON-Modus, 2) ohne "Denken aus", 3) ohne JSON-Modus.
   Das macht den Aufruf unempfindlich gegen Eigenheiten einzelner Modelle oder des Servers. */
async function askVision(system, userText, dataUrl, wantJson) {
    const variants = wantJson ? [{ think: true, json: true }, { think: false, json: true }, { think: false, json: false }] : [{ think: true, json: false }, { think: false, json: false }];
    const started = Date.now();
    let lastErr = null;
    for (const model of PHOTO_MODELS) {
        for (const v of variants) {
            if (Date.now() - started > 70000) throw new Error(String(lastErr || 'Zeitüberschreitung'));
            try {
                const body = {
                    model, temperature: 0.2,
                    messages: [
                        { role: 'system', content: system },
                        { role: 'user', content: [{ type: 'text', text: userText }, { type: 'image_url', image_url: { url: dataUrl } }] }
                    ]
                };
                if (v.think) body.reasoning_effort = 'none';
                if (v.json) body.response_format = { type: 'json_object' };
                const res = await photoTimeout(apiFetch('/api/groq', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), 45000);
                const data = await res.json().catch(() => null);
                if (res.ok && data && data.choices && data.choices[0]) return stripThinking(data.choices[0].message.content);
                lastErr = (data && data.error && (data.error.message || data.error)) || ('Status ' + res.status);
                console.error('Foto-KI (' + model + (v.think ? ', Denken aus' : '') + (v.json ? ', JSON' : '') + '):', lastErr);
                if (/does not exist|not found|decommission|do not have access|unknown model|no longer/i.test(String(lastErr))) break;   // Modell gibt es nicht: gleich das nächste
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

/* JSON aus der KI-Antwort holen (auch wenn Text drumherum steht); null, wenn keins da ist */
function photoJsonObject(content) {
    try { return JSON.parse(content); } catch (e) {}
    const m = String(content || '').match(/\{[\s\S]*\}/);
    if (m) { try { return JSON.parse(m[0]); } catch (e2) {} }
    return null;
}

/* Telefonnummer ohne Leerzeichen und Zeichen, "(0)" entfällt, 0049 wird +49 */
function photoNormalizePhone(p) {
    let n = String(p || '').replace(/\(0\)/g, '').replace(/[^\d+]/g, '');
    if (n.startsWith('00')) n = '+' + n.slice(2);
    return n.length >= 5 ? n : '';
}

function parsePhotoContact(content) {
    const obj = photoJsonObject(content);
    const k = obj && (obj.kontakt || obj);
    if (!k || typeof k !== 'object') return null;
    const clean = (v) => (v == null || String(v).trim().toLowerCase() === 'null') ? '' : String(v).trim();
    let name = clean(k.name) || clean(k.firma);
    if (!name) return null;
    return { name: name.slice(0, 60), telefon: photoNormalizePhone(clean(k.telefon)), adresse: clean(k.adresse).slice(0, 100), email: clean(k.email) };
}

function parsePhotoShopping(content) {
    const obj = photoJsonObject(content);
    const list = obj && Array.isArray(obj.artikel) ? obj.artikel : [];
    const seen = new Set();
    return list.map(x => String(x || '').trim().slice(0, 40)).filter(x => { const k = x.toLowerCase(); if (!x || seen.has(k)) return false; seen.add(k); return true; }).slice(0, 30);
}

/* Etwas, das erst nach "Ja" gespeichert wird: { type: 'contact'|'shopping', data, at } */
let photoPending = null;

function contactExists(name) {
    try {
        const key = normalizeKey(name);
        return typeof contactList === 'function' && contactList().some(c => normalizeKey(c.name) === key);
    } catch (e) { return false; }
}

/* Speichert über die vorhandene Kontakt-Funktion der App (füllt deren Eingabefelder und ruft saveContact() auf) */
function savePhotoContact(c) {
    const n = document.getElementById('contactNameInput'), p = document.getElementById('contactPhoneInput'), a = document.getElementById('contactAddressInput');
    if (!n || !p || !a || typeof saveContact !== 'function') return 'fehlt';
    n.value = c.name; p.value = c.telefon || ''; a.value = c.adresse || '';
    saveContact();
    return 'ok';
}

function addPhotoShopping(items) {
    let added = 0;
    items.forEach(it => {
        const t = String(it).trim();
        if (!t || (shoppingEntries || []).some(e => String(e.text).toLowerCase() === t.toLowerCase())) return;
        shoppingEntries.unshift({ id: Date.now() + added, text: t });
        added++;
    });
    setPersistentData('helfer_shopping', JSON.stringify(shoppingEntries));
    try { renderAllLists(); } catch (e) {}
    return added;
}

function showPhotoPendingCards() {
    if (!photoPending) return;
    let cards;
    if (photoPending.type === 'contact') {
        const c = photoPending.data;
        cards = [{ icon: '👤', title: c.name, subtitle: [c.telefon, c.adresse, c.email].filter(Boolean).join(' · ') || 'keine Nummer oder Adresse erkannt' },
                 { icon: '➕', title: 'Kontakt speichern', subtitle: 'In die Kontaktliste', onclick: 'confirmPhotoPending()' }];
    } else {
        const items = photoPending.data;
        cards = items.slice(0, 8).map(x => ({ icon: '🛒', title: x, subtitle: 'Einkaufsliste' }));
        if (items.length > 8) cards.push({ icon: '🛒', title: `… und ${items.length - 8} weitere`, subtitle: 'Einkaufsliste' });
        cards.push({ icon: '➕', title: `Alle ${items.length} auf die Liste`, subtitle: 'Zur Einkaufsliste hinzufügen', onclick: 'confirmPhotoPending()' });
    }
    if (typeof clearActionCards === 'function') clearActionCards();
    if (typeof showActionCards === 'function') showActionCards(cards);
}

async function confirmPhotoPending() {
    const pend = photoPending;
    if (!pend || Date.now() - pend.at > PHOTO_EVENTS_MS) { photoSay('Es gibt gerade nichts zu speichern.'); return; }
    photoPending = null;
    try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) {}
    if (pend.type === 'contact') {
        const c = pend.data;
        if (!c.telefon && !c.adresse) { photoSay(`Bei ${c.name} habe ich weder Nummer noch Adresse erkannt. Tragen Sie ihn bitte in den Einstellungen unter Kontakte ein.`); return; }
        if (contactExists(c.name)) { photoSay(`${c.name} gibt es schon in Ihren Kontakten. Ich lasse ihn unverändert.`); return; }
        try { photoSay(savePhotoContact(c) === 'ok' ? `${c.name} ist in Ihren Kontakten gespeichert.` : 'Das Speichern der Kontakte ist in dieser Version nicht erreichbar.'); }
        catch (e) { photoSay('Das Speichern hat nicht geklappt.'); }
    } else {
        const n = addPhotoShopping(pend.data);
        photoSay(n ? `${n} ${n === 1 ? 'Artikel steht' : 'Artikel stehen'} auf der Einkaufsliste.${n < pend.data.length ? ' Der Rest war schon drauf.' : ''}` : 'Alles stand schon auf der Einkaufsliste.');
    }
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
    const intent = (photoIntent && Date.now() - photoIntent.at < PHOTO_INTENT_MS) ? photoIntent : { task: 'wait', question: '' };   // kein Sprachbefehl vorher: erst Foto, dann sagen, was damit passieren soll
    photoIntent = null;
    try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Werte das Foto aus...'); } catch (e) {}
    try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) {}
    let dataUrl;
    let pdfText = '';
    try { if (isPdfFile(file)) { const r = await preparePdf(file); dataUrl = r.dataUrl; pdfText = r.text || ''; } else dataUrl = await preparePhoto(file); }
    catch (e) { console.error('Foto/PDF lesen', e); photoSay(isPdfFile(file) ? 'Die PDF-Datei konnte ich nicht lesen. Ist sie mit einem Passwort geschützt, oder fehlt die Internetverbindung?' : 'Das Foto konnte ich nicht lesen.'); return; }
    lastPhoto = { dataUrl, at: Date.now(), text: pdfText };
    if (intent.task === 'wait') { photoAskWhatToDo(); return; }
    await processPhoto(intent, dataUrl);
}

/* Wertet ein Foto für eine Aufgabe aus (events, contact, shopping, read, translate, car, parking, cook, identify, describe) */
async function processPhoto(intent, dataUrl) {
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
        if (intent.task === 'contact') {
            const c = parsePhotoContact(await askVision(photoContactPrompt(), 'Lies die Kontaktdaten von diesem Foto.', dataUrl, true));
            if (!c) { photoSay('Ich konnte auf dem Foto keinen Namen und keine Kontaktdaten erkennen. Ist die Karte scharf und gerade im Bild?'); return; }
            photoPending = { type: 'contact', data: c, at: Date.now() };
            showPhotoPendingCards();
            photoSay(`Ich habe gelesen: ${c.name}${c.telefon ? ', Nummer ' + c.telefon.split('').join(' ') : ''}${c.adresse ? ', ' + c.adresse : ''}. Soll ich ihn in Ihre Kontakte speichern? Sagen Sie Ja, oder tippen Sie unten auf die Karte.`);
            return;
        }
        if (intent.task === 'shopping') {
            const items = parsePhotoShopping(await askVision(photoShoppingPrompt(), 'Lies die Einkaufsliste von diesem Foto.', dataUrl, true));
            if (!items.length) { photoSay('Ich konnte auf dem Zettel keine Artikel lesen. Ist er scharf und gut beleuchtet?'); return; }
            photoPending = { type: 'shopping', data: items, at: Date.now() };
            showPhotoPendingCards();
            photoSay(`Ich habe ${items.length} ${items.length === 1 ? 'Artikel' : 'Artikel'} gelesen: ${items.slice(0, 5).join(', ')}${items.length > 5 ? ' und weitere' : ''}. Soll ich ${items.length === 1 ? 'ihn' : 'sie'} auf die Einkaufsliste setzen? Sagen Sie Ja, oder tippen Sie unten auf die Karte.`);
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

/* ---------- Erst Foto, dann sagen, was damit passieren soll ---------- */
function photoAskWhatToDo() {
    try {
        if (typeof clearActionCards === 'function') clearActionCards();
        if (typeof showActionCards === 'function') {
            showActionCards([
                { icon: '🛒', title: 'Auf die Einkaufsliste', subtitle: 'Zettel lesen, Artikel eintragen', onclick: "runLastPhotoTask('shopping')" },
                { icon: '📅', title: 'Termine eintragen', subtitle: 'Kalender, Plakat, Einladung', onclick: "runLastPhotoTask('events')" },
                { icon: '👤', title: 'Kontakt anlegen', subtitle: 'Visitenkarte', onclick: "runLastPhotoTask('contact')" },
                { icon: '🔤', title: 'Vorlesen / übersetzen', subtitle: 'Text auf dem Foto', onclick: "runLastPhotoTask('read')" },
                { icon: '🔍', title: 'Beschreiben', subtitle: 'Was ist zu sehen?', onclick: "runLastPhotoTask('describe')" }
            ]);
        }
    } catch (e) {}
    photoSay('Das Foto ist da. Was soll ich damit tun?');
}

/* Führt eine Aufgabe mit dem zuletzt aufgenommenen Foto aus (ohne neues Foto) */
async function runLastPhotoTask(task, question) {
    if (!lastPhoto || Date.now() - lastPhoto.at > PHOTO_FOLLOWUP_MS) { photoSay('Ich habe gerade kein Foto. Tippen Sie auf die Kamera, um eins aufzunehmen.'); return; }
    try { if (typeof typeWriterStatus === 'function') typeWriterStatus('Werte das Foto aus...'); } catch (e) {}
    try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) {}
    await processPhoto({ task, question: question || '' }, lastPhoto.dataUrl);
}

/* Sätze, die sich auf das letzte Foto beziehen ("Setz das auf die Einkaufsliste"). Gilt nur kurz nach einem Foto, und nur mit
   Wörtern wie "das/alles/davon" direkt beim Verb, damit "Setz Milch auf die Einkaufsliste" oder "Trag morgen einen Termin ein" normal bleiben. */
function parseFollowupTask(text) {
    const t = String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 100) return null;
    const THIS = '(?:das|dies\\w*|alles|alle|davon|daraus|hiervon|sie|ihn|es|die sachen|die artikel|die dinge|die termine|den termin|die daten)';
    if (new RegExp('\\b(?:setz|setze|trag|trage|schreib|schreibe|pack|packe|füg|füge|übernimm|übernehme|nimm)\\w*\\s+(?:mir\\s+)?' + THIS + '\\s+(?:bitte\\s+)?(?:alle\\s+)?(?:auf|in|zu|zur)\\s+(?:die|der|meine|meiner)\\s+(?:einkaufsliste|liste|einkaufszettel)\\b').test(t)
        || /\b(?:einkaufsliste|einkaufszettel)\b.*\b(?:davon|daraus)\b|\b(?:davon|daraus)\b.*\bauf die (?:einkaufs)?liste\b/.test(t)) return { task: 'shopping' };
    if (!/\d|\bmorgen\b|\bheute\b|\bfür\b|\buhr\b/.test(t)) {
        if (new RegExp('\\b(?:trag|trage|übernimm|übernehme|schreib|schreibe)\\w*\\s+(?:mir\\s+)?' + THIS + '\\s+(?:bitte\\s+)?(?:alle\\s+)?(?:in|im|auf|zum|zu)\\s+(?:meinen?|den|dem)?\\s*kalender\\b').test(t)
            || /\b(?:termine?|den termin|die termine)\b.*\b(?:davon|daraus|aus dem foto|vom foto)\b.*\b(?:eintrag\w*|übernehm\w*)\b/.test(t)
            || /\b(?:trag|trage)\s+(?:davon|daraus)\s+(?:die\s+|den\s+)?termine?\s+ein\b/.test(t)
            || /\b(?:trag|trage)\w*\s+(?:mir\s+)?(?:die\s+|den\s+)?termine?\s+(?:davon\s+|daraus\s+|von dem foto\s+|vom foto\s+|aus dem foto\s+)?(?:bitte\s+)?ein\b/.test(t)) return { task: 'events' };
        if (/\bkontakt\w*\b/.test(t) && (/\b(?:anleg\w*|speicher\w*|übernehm\w*|übernimm|erstell\w*)\b/.test(t) || /\b(?:leg|lege)\b.*\ban\b/.test(t)) && new RegExp('\\b' + THIS + '\\b|\\bvisitenkarte\\b|\\bkarte\\b').test(t)) return { task: 'contact' };
    }
    if (/\b(?:darf|kann)\s+ich\s+hier\s+(?:parken|stehen|halten)\b/.test(t)) return { task: 'parking' };
    if (/\bwas kann ich\s+(?:damit|daraus|hieraus|davon)\s+(?:kochen|machen|zubereiten)\b/.test(t)) return { task: 'cook' };
    if (/(?<![\wäöüß])übersetz\w*\s+(?:mir\s+)?(?:das|dies\w*|es)\b/.test(t)) return { task: 'translate' };
    if (/\b(?:lies|les|lese)\s+(?:mir\s+)?(?:das|dies\w*|es)\b.*\bvor\b|\b(?:das|dies\w*)\s+(?:bitte\s+)?vorlesen\b/.test(t)) return { task: 'read' };
    if (/\b(?:beschreib\w*)\s+(?:mir\s+)?(?:das|dies\w*|es)\b|\bwas ist (?:das|darauf zu sehen)\b|\bwas steht (?:da|darauf)\b|\bwas siehst du\b/.test(t)) return { task: 'describe' };
    return null;
}

/* ---------- Sprachbefehle ---------- */
function handlePhotoCommand(text) {
    const raw = String(text || '').trim();
    const t = raw.toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t) return false;

    // Erkannter Kontakt oder Einkaufszettel: "Ja" speichert, "Nein" verwirft
    if (photoPending && Date.now() - photoPending.at < PHOTO_EVENTS_MS) {
        if (/^(?:ja|jawohl|jo|gerne|bitte|okay|ok|klar|los|mach das|mach es|speichern|speicher ihn|speicher sie|ja bitte|ja gerne|trag(?:e)? (?:ihn|sie|es|alle|alles)(?: alle)? ein|übernehmen|setz (?:sie|es|alles) auf die liste|auf die liste)$/.test(t)) {
            confirmPhotoPending().catch(() => photoSay('Das Speichern hat nicht geklappt.'));
            return true;
        }
        if (/^(?:nein|nee|nicht|lieber nicht|abbrechen|vergiss es|lass (?:es|das)|verwerfen)$/.test(t)) {
            photoPending = null;
            try { if (typeof clearActionCards === 'function') clearActionCards(); } catch (e) {}
            photoSay('Gut, ich habe nichts gespeichert.');
            return true;
        }
    }

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

    // Vorhandenes Bild vom Handy nehmen: "Ich möchte ein Bild aus meinem Dateiordner hinzufügen", "Foto aus der Galerie", "Bild hochladen"
    if ((/(?<![\wäöüß])(?:öffne|öffnen|zeig|zeige)\w*\s+(?:mir\s+)?(?:bitte\s+)?(?:meinen|meine|den|die)\s+(?:dateiordner|dateien|datei-?manager)\b/.test(t) || /\b(?:dateiordner|dateien|datei-?manager)\s+(?:öffnen|aufmachen)\b/.test(t))
        || /\b(bild\w*|foto\w*|datei\w*|screenshot\w*)\b/.test(t)
        && (/\b(?:aus|von)\s+(?:der|dem|den|meiner|meinem|meinen)\s+(?:galerie|dateien|dateiordner|ordner|speicher|downloads?|handy|telefon)\b/.test(t)
            || /\b(?:hinzufügen|hochladen|auswählen|einfügen|importieren|öffnen|laden|hineinladen)\b/.test(t) && /\b(bild\w*|foto\w*|screenshot\w*|datei\w*)\b/.test(t) && !/\bnotiz|dokument|pdf\b/.test(t)
            || /\b(?:schon|bereits)\s+(?:auf dem handy|gespeichert|vorhanden)\b/.test(t))) {
        // Aufgabe merken, wenn sie schon im Satz steht ("Setz die Liste aus meinem Dateiordner auf die Einkaufsliste")
        let task = (parsePhotoRequest(raw) || {}).task;
        if (!task || task === 'describe') {
            if (/\b(einkaufsliste|einkaufszettel|liste)\b/.test(t) && /\b(setz\w*|trag\w*|schreib\w*|übernehm\w*|füg\w*|pack\w*)\b/.test(t)) task = 'shopping';
            else if (/\b(termin\w*|kalender)\b/.test(t) && /\b(trag\w*|eintrag\w*|übernehm\w*)\b/.test(t)) task = 'events';
            else if (/\b(kontakt\w*|visitenkarte)\b/.test(t)) task = 'contact';
        }
        photoIntent = task && task !== 'describe' ? { task, question: raw, at: Date.now() } : null;
        showPhotoCards(true);
        photoSay('Tippen Sie unten auf die Karte, dann öffnet sich Ihr Dateiordner. Wählen Sie dort das Bild aus.');
        return true;
    }

    // Direkt nach einem Foto: "Setz das auf die Einkaufsliste", "Übersetze das", "Was ist das?"
    if (lastPhoto && Date.now() - lastPhoto.at < PHOTO_FOLLOWUP_MS) {
        const f2 = parseFollowupTask(raw);
        if (f2) {
            photoPending = null; photoEvents = []; photoEventsAt = 0;   // es ist immer nur eine Rückfrage offen
            runLastPhotoTask(f2.task, raw).catch(() => photoSay('Die Auswertung hat gerade nicht geklappt.'));
            return true;
        }
    }

    const req = parsePhotoRequest(raw);
    if (!req) return false;
    photoIntent = { task: req.task, question: raw, at: Date.now() };
    showPhotoCards();
    const what = req.task === 'contact' ? 'Fotografieren Sie die Visitenkarte' : req.task === 'shopping' ? 'Fotografieren Sie den Zettel' : req.task === 'parking' ? 'Fotografieren Sie das Schild' : req.task === 'cook' ? 'Fotografieren Sie die Zutaten' : req.task === 'events' ? 'Fotografieren Sie den Termin' : req.task === 'translate' ? 'Fotografieren Sie, was ich übersetzen soll' : req.task === 'read' ? 'Fotografieren Sie, was ich vorlesen soll' : 'Halten Sie die Kamera darauf';
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
