/* ============================================================
   TIMER per Sprache, direkt in der App (ohne KI, ohne Netz):
   "Stell einen Timer auf 10 Minuten" / "Timer 5 Minuten für die Nudeln" / "Wecke mich in einer halben Stunde"
   "Wie lange läuft der Timer noch?" / "Timer abbrechen" / "Stopp den Timer für die Nudeln"
   Läuft ein Timer ab, sagt Jarvis es, schickt eine Benachrichtigung und vibriert; er wiederholt sich alle 25 Sekunden
   (höchstens dreimal), bis du "Stopp", "Danke" oder "Timer abbrechen" sagst. Das gilt nur, solange die App offen ist - darum zeigt Jarvis
   zu jedem Timer und Wecker zusätzlich eine Karte, die ihn in der Uhr-App deines Handys einstellt (klingelt auch bei geschlossener App).
   Während ein Timer läuft, zeigt ein kleiner Zähler unter dem Briefing-Knopf die Restzeit.
   Braucht: storage.js (getPersistentData/setPersistentData), voice.js (speak, pickRandom). Wird von localcommands.js aufgerufen.
   ============================================================ */

const TIMERS_KEY = 'helfer_timers';
const TIMER_RING_REPEAT_MS = 25000;
const TIMER_RING_MAX = 3;
const TIMER_MIN_MS = 3000;
const TIMER_MAX_MS = 24 * 3600 * 1000;
let activeTimers = [];
let alarmQuestionAt = 0;   // Jarvis hat nach der Uhrzeit gefragt
let nativeHintShown = false;
let timerQuestionAt = 0;   // Jarvis hat nach der Dauer gefragt: die nächste Antwort ("10 Minuten") gilt für den Timer

function loadTimers() {
    try {
        const arr = JSON.parse(getPersistentData(TIMERS_KEY, '[]') || '[]');
        activeTimers = Array.isArray(arr) ? arr.filter(t => t && typeof t.endAt === 'number') : [];
    } catch (e) { activeTimers = []; }
}
function saveTimers() { setPersistentData(TIMERS_KEY, JSON.stringify(activeTimers)); }

/* Zahl als Ziffer oder deutsches Wort ("10", "zehn", "fünfundzwanzig", "1,5"); sonst null */
function germanNumber(w) {
    w = String(w || '').toLowerCase().trim();
    if (/^\d+([.,]\d+)?$/.test(w)) return Number(w.replace(',', '.'));
    const ones = { ein: 1, eins: 1, eine: 1, einen: 1, einer: 1, zwei: 2, drei: 3, vier: 4, fünf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9 };
    const teens = { zehn: 10, elf: 11, zwölf: 12, dreizehn: 13, vierzehn: 14, fünfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19 };
    const tens = { zwanzig: 20, dreißig: 30, vierzig: 40, fünfzig: 50, sechzig: 60, siebzig: 70, achtzig: 80, neunzig: 90 };
    if (w in ones) return ones[w];
    if (w in teens) return teens[w];
    if (w in tens) return tens[w];
    const m = w.match(/^(ein|zwei|drei|vier|fünf|sechs|sieben|acht|neun)und(zwanzig|dreißig|vierzig|fünfzig|sechzig|siebzig|achtzig|neunzig)$/);
    if (m) return ones[m[1]] + tens[m[2]];
    return null;
}

/* Dauer aus dem Satz in Millisekunden: "10 Minuten", "eine halbe Stunde", "1 Stunde 30", "anderthalb Stunden", "90 Sekunden" ... ; 0, wenn keine genannt */
function parseDurationMs(text) {
    let t = String(text || '').toLowerCase();
    let ms = 0;
    const take = (re, val) => { if (re.test(t)) { ms += val; t = t.replace(re, ' '); } };
    take(/\b(?:anderthalb|eineinhalb)\s+stunden?\b/, 90 * 60000);
    take(/\bdreiviertel\s*stunde\b/, 45 * 60000);
    take(/\bviertel\s*stunde\b/, 15 * 60000);
    take(/\bhalbe[nr]?\s+stunde\b/, 30 * 60000);
    // "1 Stunde 30" (Minuten ohne Einheit)
    const hm = t.match(/(\d+|[a-zäöüß]+)\s*(?:stunden?|std|h)\s+(\d{1,2})\b(?!\s*(?:sekunde|minute|min|stunde|std|uhr|h\b))/);
    if (hm && germanNumber(hm[1]) !== null) { ms += germanNumber(hm[1]) * 3600000 + Number(hm[2]) * 60000; t = t.replace(hm[0], ' '); }
    const re = /(\d+(?:[.,]\d+)?|[a-zäöüß]+)\s*(sekunden?|sek|minuten?|min|stunden?|std|h)\b/g;
    let m;
    while ((m = re.exec(t)) !== null) {
        const n = germanNumber(m[1]);
        if (n === null) continue;
        const unit = m[2];
        ms += n * (/^(sek)/.test(unit) ? 1000 : /^(min)/.test(unit) ? 60000 : 3600000);
    }
    return Math.round(ms);
}

/* "10 Minuten", "1 Stunde 30 Minuten", "90 Sekunden" */
function speakableDuration(ms) {
    let s = Math.round(ms / 1000);
    const h = Math.floor(s / 3600); s -= h * 3600;
    const m = Math.floor(s / 60); s -= m * 60;
    const parts = [];
    if (h) parts.push(h + (h === 1 ? ' Stunde' : ' Stunden'));
    if (m) parts.push(m + (m === 1 ? ' Minute' : ' Minuten'));
    if (s && !h) parts.push(s + (s === 1 ? ' Sekunde' : ' Sekunden'));
    return parts.join(' ') || '0 Sekunden';
}

/* Beschriftung aus dem Satz: "... für die Nudeln" -> "Nudeln" */
function timerLabelFromText(text) {
    let rest = String(text || '');
    rest = rest.replace(/(\d+(?:[.,]\d+)?|[A-Za-zäöüÄÖÜß]+)\s*(?:Sekunden?|Sek|Minuten?|Min|Stunden?|Std|h)\b/gi, ' ')
               .replace(/\b(?:anderthalb|eineinhalb|dreiviertel|viertel|halbe[nr]?)\s*(?:stunden?)?\b/gi, ' ')
               .replace(/\s+/g, ' ').trim();
    const m = rest.match(/\bfür\s+(?:die|den|das|der|dem|meine|meinen|mein)?\s*([A-Za-zÄÖÜäöüß][\wäöüÄÖÜß -]{1,30}?)\s*[.!?]*$/i);
    if (!m) return '';
    const label = m[1].trim();
    if (/^(mich|mir|uns|bitte|ihn|sie|es|auf|jetzt)$/i.test(label)) return '';
    return label.charAt(0).toUpperCase() + label.slice(1);
}

function timerRemainingText(t) {
    const left = Math.max(0, t.endAt - Date.now());
    return `${speakableDuration(left)}${t.label ? ' für ' + t.label : ''}`;
}

function anyTimerRinging() { return activeTimers.some(t => t.ringing); }
function stopRingingTimers() {
    const had = anyTimerRinging();
    activeTimers = activeTimers.filter(t => !t.ringing);
    if (had) { saveTimers(); updateTimerChip(); }
    return had;
}

/* ---------- Uhr-App deines Handys (klingelt auch bei geschlossener App) ----------
   Chrome erlaubt das Öffnen der Uhr-App nur nach einem Fingertipp, darum zeigt Jarvis eine Karte zum Antippen.
   Technisch ein Android-"Intent": SET_TIMER bzw. SET_ALARM. Die Uhr-App öffnet sich dabei kurz und zeigt den neuen Timer/Wecker. */
function nativeClockUrl(kind, data) {
    const extras = [];
    let action;
    if (kind === 'timer') {
        action = 'android.intent.action.SET_TIMER';
        extras.push(`i.android.intent.extra.alarm.LENGTH=${Math.max(1, Math.min(86400, Math.round(data.seconds)))}`);
    } else {
        action = 'android.intent.action.SET_ALARM';
        extras.push(`i.android.intent.extra.alarm.HOUR=${data.hour}`, `i.android.intent.extra.alarm.MINUTES=${data.minute}`);
    }
    extras.push(`S.android.intent.extra.alarm.MESSAGE=${encodeURIComponent(data.label || 'Jarvis')}`, 'B.android.intent.extra.alarm.SKIP_UI=false');
    return `intent:#Intent;action=${action};${extras.join(';')};end`;
}

/* Uhrzeit aus dem Satz: "um 7 Uhr", "um 6:30", "um 7 Uhr 15", "um halb sieben", "viertel nach sieben", "um 7 Uhr abends"; null, wenn keine genannt */
function parseAlarmTime(text) {
    const t = String(text || '').toLowerCase();
    let hour = null, minute = 0, m;
    if ((m = t.match(/\bviertel\s+(nach|vor)\s+(\d{1,2}|[a-zäöüß]+)\b/))) {
        const n = germanNumber(m[2]);
        if (n >= 1 && n <= 12) { if (m[1] === 'nach') { hour = n; minute = 15; } else { hour = n === 1 ? 12 : n - 1; minute = 45; } }
    } else if ((m = t.match(/\bhalb\s+(\d{1,2}|[a-zäöüß]+)\b/))) {
        const n = germanNumber(m[1]);
        if (n >= 1 && n <= 12) { hour = n === 1 ? 12 : n - 1; minute = 30; }
    } else if ((m = t.match(/\b(\d{1,2})[:.](\d{2})\b/))) {
        hour = Number(m[1]); minute = Number(m[2]);
    } else if ((m = t.match(/\b(\d{1,2}|[a-zäöüß]+)\s*uhr(?:\s*(\d{1,2}|[a-zäöüß]+))?/))) {
        hour = germanNumber(m[1]);
        if (m[2] !== undefined) { const mi = germanNumber(m[2]); if (mi !== null && mi < 60) minute = mi; }
    } else if ((m = t.match(/\bum\s+(\d{1,2}|[a-zäöüß]+)\b(?!\s*(?:minuten?|min|stunden?|sekunden?|euro|prozent|grad|kilometer|km|liter))/))) {
        hour = germanNumber(m[1]);
    }
    if (hour === null || hour < 0 || hour > 24 || minute < 0 || minute > 59) return null;
    if (/\b(abends|nachmittags|nachts)\b/.test(t) && hour < 12 && hour >= 1) hour += (/\bnachts\b/.test(t) && hour < 6) ? 0 : 12;   // "7 Uhr abends" = 19 Uhr
    if (hour === 24) hour = 0;
    return { hour, minute };
}

/* Karte, die beim Antippen die Uhr-App startet. Als onclick statt als Link: der Aufruf geschieht so direkt im Fingertipp,
   was Chrome für Android-"Intents" verlangt (ein normaler Link öffnet sie oft nicht). */
function clockCard(icon, title, subtitle, url) {
    const safe = String(url).replace(/'/g, '%27');
    return { icon, title, subtitle, onclick: `window.location.href='${safe}'` };
}

function showClockCards(cards) {
    try {
        if (typeof clearActionCards === 'function') clearActionCards();
        if (typeof showActionCards === 'function') showActionCards(cards);
    } catch (e) { /* die Karte ist Zugabe, der Timer läuft auch ohne sie */ }
}

/* ---------- Befehle ---------- */
function handleTimerCommand(text) {
    const raw = String(text || '').trim();
    const t = raw.toLowerCase().replace(/[.,!?]+$/, '');
    if (!t || t.length > 120) return false;
    const done = (msg, cards) => {
        if (cards) showClockCards(cards);
        speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
        return true;
    };

    // Ein Timer klingelt gerade: "Stopp", "Danke", "Genug", "Timer aus" beendet ihn
    if (anyTimerRinging() && /^(?:jarvis[, ]+)?(?:timer\s+)?(?:stopp?|stop|aus|ruhe|genug|ok|okay|danke|schon gut|ist gut|erledigt)(?:\s+jarvis)?$/.test(t)) {
        stopRingingTimers();
        return done(pickRandom(['Sehr wohl.', 'Ruhe ist wiederhergestellt.', 'Wie Sie wünschen.']));
    }

    const alarmWord = /\bwecker\b|\bweck\w*\s+mich\b/.test(t);
    const durationMs = parseDurationMs(raw);
    const mentionsTimer = /\btimer\b|\bstoppuhr\b/.test(t) || (alarmWord && durationMs > 0);   // "Wecke mich in 30 Minuten" ist ein Timer

    // Antwort auf eine Rückfrage: nur die Dauer bzw. nur die Uhrzeit genügt
    if (!mentionsTimer && !alarmWord) {
        if (timerQuestionAt && Date.now() - timerQuestionAt < 25000 && durationMs > 0) { timerQuestionAt = 0; return handleTimerCommand('Stell einen Timer auf ' + raw); }
        if (alarmQuestionAt && Date.now() - alarmQuestionAt < 25000 && parseAlarmTime(raw)) { alarmQuestionAt = 0; return handleTimerCommand('Stell einen Wecker auf ' + raw); }
        return false;
    }

    // Wecker zu einer Uhrzeit ("Wecke mich um 7 Uhr", "Stell einen Wecker auf 6:30")
    if (alarmWord && !mentionsTimer) {
        if (/\b(abbrech\w*|stopp\w*|stop\b|beend\w*|lösch\w*|ausschalt\w*|entfern\w*|deaktivier\w*)\b/.test(t)) {
            return done('Einen Wecker in der Uhr-App kann ich nicht ausschalten, das tun Sie dort selbst.');
        }
        const at = parseAlarmTime(raw);
        if (!at) { alarmQuestionAt = Date.now(); return done('Für wie viel Uhr soll ich den Wecker stellen?'); }
        const hh = String(at.hour).padStart(2, '0'), mm = String(at.minute).padStart(2, '0');
        return done(`Wecker für ${at.hour} Uhr${at.minute ? ' ' + at.minute : ''}. Tippen Sie unten auf die Karte, dann stellt Ihre Uhr-App ihn ein und klingelt auch bei geschlossener App.`,
            [clockCard('⏰', `Wecker ${hh}:${mm} stellen`, 'Tippen: Ihre Uhr-App stellt ihn ein', nativeClockUrl('alarm', { hour: at.hour, minute: at.minute }))]);
    }

    // Abbrechen: "Timer abbrechen", "Stopp den Timer", "Lösche den Timer für die Nudeln"
    if (mentionsTimer && /\b(abbrech\w*|stopp\w*|stop\b|beend\w*|lösch\w*|ausschalt\w*|entfern\w*|vergiss)\b/.test(t) && !/\b(stell|setz|start)\w*\b/.test(t)) {
        if (activeTimers.length === 0) return done('Es läuft gerade kein Timer.');
        const label = timerLabelFromText(raw);
        let removed;
        if (label) {
            removed = activeTimers.filter(x => x.label && x.label.toLowerCase() === label.toLowerCase());
            activeTimers = activeTimers.filter(x => !removed.includes(x));
        } else {
            removed = activeTimers; activeTimers = [];
        }
        saveTimers(); updateTimerChip();
        let msg = removed.length ? (removed.length === 1 ? 'Timer abgebrochen.' : `${removed.length} Timer abgebrochen.`) : `Einen Timer für ${label} habe ich nicht gefunden.`;
        if (removed.length && !nativeHintShown) { nativeHintShown = true; msg += ' Einen Timer in der Uhr-App beenden Sie dort selbst.'; }
        return done(msg);
    }

    // Abfragen: "Wie lange läuft der Timer noch?"
    if (mentionsTimer && /\b(wie lange|wie viel|wieviel|wann|noch|restzeit|übrig)\b/.test(t) && !/\b(stell|setz|start)\w*\b/.test(t) && durationMs === 0) {
        if (activeTimers.length === 0) return done('Es läuft gerade kein Timer.');
        const parts = activeTimers.map(timerRemainingText);
        return done(parts.length === 1 ? `Noch ${parts[0]}.` : 'Es laufen ' + parts.length + ' Timer: ' + parts.map(p => 'noch ' + p).join(', dann ') + '.');
    }

    // Stellen
    const ms = durationMs;
    if (ms <= 0) {
        if (/\b(stell|setz|start|mach|leg)\w*\b/.test(t) && mentionsTimer) { timerQuestionAt = Date.now(); return done('Auf wie viele Minuten soll ich den Timer stellen?'); }
        return false;
    }
    if (ms < TIMER_MIN_MS) return done('Das ist mir zu kurz. Ein Timer braucht mindestens drei Sekunden.');
    if (ms > TIMER_MAX_MS) return done('Mehr als 24 Stunden sind mir für einen Timer zu lang.');
    const label = timerLabelFromText(raw);
    activeTimers.push({ id: Date.now() + Math.floor(Math.random() * 1000), label, endAt: Date.now() + ms, createdAt: Date.now(), ringing: false, ringCount: 0, nextRingAt: 0 });
    saveTimers(); updateTimerChip();
    return done(`Timer gestellt: ${speakableDuration(ms)}${label ? ' für ' + label : ''}. Tippen Sie auf die Karte, dann klingelt er auch bei geschlossener App.`,
        [clockCard('⏱', `Timer ${speakableDuration(ms)}${label ? ' · ' + label : ''} in der Uhr-App`, 'Tippen: klingelt auch bei geschlossener App', nativeClockUrl('timer', { seconds: ms / 1000, label }))]);
}

/* ---------- Ablauf, Anzeige ---------- */
function ringTimer(t, now) {
    t.ringCount = (t.ringCount || 0) + 1;
    const what = t.label ? `${t.label}: Die Zeit ist um.` : 'Der Timer ist abgelaufen.';
    // Nach der Ansage hört Jarvis kurz zu, damit "Stopp" ankommt (sonst wäre das Mikrofon aus); alternativ auf den Zähler tippen
    const listenForStop = () => { try { if (typeof startListening === 'function') startListening(true, 8000); } catch (e) {} };
    if (t.ringCount === 1) speak(`${what} Sagen Sie Stopp oder tippen Sie auf den Zähler.`, listenForStop);
    else speak(`${what}`, listenForStop);
    try { if (navigator.vibrate) navigator.vibrate([300, 150, 300]); } catch (e) {}
    try { if ('Notification' in window && Notification.permission === 'granted') new Notification('Timer', { body: t.label || 'Die Zeit ist um.', icon: './dino.png' }); } catch (e) {}
    if (t.ringCount >= TIMER_RING_MAX) t.finished = true;
    else t.nextRingAt = now + TIMER_RING_REPEAT_MS;
}

function timerTick() {
    if (activeTimers.length === 0) { updateTimerChip(); return; }
    const now = Date.now();
    let changed = false;
    activeTimers.forEach(t => {
        if (!t.ringing && now >= t.endAt) {
            t.ringing = true; t.ringCount = 0; t.nextRingAt = now; changed = true;
            if (now - t.endAt > 30 * 60000) t.finished = true;   // schon lange abgelaufen (App war zu): nicht mehr melden
        }
        if (t.ringing && !t.finished && now >= t.nextRingAt) { ringTimer(t, now); changed = true; }
    });
    const before = activeTimers.length;
    activeTimers = activeTimers.filter(t => !t.finished);
    if (changed || activeTimers.length !== before) saveTimers();
    updateTimerChip();
}

function ensureTimerChip() {
    let el = document.getElementById('timerChip');
    if (el) return el;
    const anchor = document.getElementById('briefingBtn');
    if (!anchor || !anchor.parentNode) return null;
    el = document.createElement('div');
    el.id = 'timerChip';
    el.className = 'hidden px-4 py-1.5 rounded-full border border-[rgba(255,154,68,.45)] bg-[#0a1621]/80 text-[#ff9a44] text-[12px] font-mono tracking-wider cursor-pointer';
    // Tippen auf den Zähler beendet einen klingelnden Timer (auch dann, wenn die Spracherkennung nichts versteht)
    el.addEventListener('click', () => {
        if (anyTimerRinging()) {
            stopRingingTimers();
            try { if (typeof interruptSpeaking === 'function') interruptSpeaking(); } catch (e) {}
        }
    });
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
    return el;
}

function updateTimerChip() {
    const el = ensureTimerChip();
    if (!el) return;
    const ringing = activeTimers.filter(t => t.ringing);
    if (ringing.length) {
        el.textContent = `🔔 ${ringing[0].label || 'Timer'} abgelaufen · Antippen zum Stoppen`;
        el.classList.remove('hidden');
        return;
    }
    const waiting = activeTimers.filter(t => !t.ringing).sort((a, b) => a.endAt - b.endAt);
    if (waiting.length === 0) { el.classList.add('hidden'); return; }
    const t = waiting[0];
    const left = Math.max(0, Math.round((t.endAt - Date.now()) / 1000));
    const mm = String(Math.floor((left % 3600) / 60)).padStart(2, '0'), ss = String(left % 60).padStart(2, '0');
    const hh = Math.floor(left / 3600);
    const clock = hh > 0 ? `${hh}:${mm}:${ss}` : `${String(Math.floor(left / 60)).padStart(2, '0')}:${ss}`;
    el.textContent = `⏱ ${clock}${t.label ? ' ' + t.label : ''}${waiting.length > 1 ? ' (+' + (waiting.length - 1) + ')' : ''}`;
    el.classList.remove('hidden');
}

/* "Stopp"/"Danke" beendet einen klingelnden Timer: der allgemeine Abschluss-Satz in voice.js (isEndPhrase) wird hier mitbenutzt */
(function hookEndPhrase() {
    if (typeof isEndPhrase === 'function') {
        const orig = isEndPhrase;
        isEndPhrase = function (text) {
            const r = orig.apply(this, arguments);
            if (r && anyTimerRinging()) stopRingingTimers();
            return r;
        };
    }
})();

loadTimers();
if (typeof setInterval === 'function') setInterval(timerTick, 1000);
if (typeof document !== 'undefined' && document.addEventListener) {
    document.addEventListener('visibilitychange', () => { if (!document.hidden) timerTick(); });
}
