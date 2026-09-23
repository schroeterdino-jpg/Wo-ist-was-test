/* ============================================================
   SMARTTIPS: Erkennt Aktivitäten in Terminen (schwimmen, Garten, Wandern ...)
   und gibt rechtzeitig vorher einen Tipp, was man mitnehmen sollte -
   je nach Wetter an dem Tag. Läuft nach demselben Muster wie die
   Erinnerungen: nur while die App offen ist, kein Push nötig.
   Braucht: calendarEntries (storage.js), fetchWeatherForecast (briefing.js), speak (voice.js)
   ============================================================ */

const ACTIVITY_TIPS = [
    { keywords: ['schwimmen', 'baden', 'schwimmbad', 'freibad', 'schwimmhalle'], basis: 'Badesachen und ein Handtuch', sonne: 'Sonnencreme' },
    { keywords: ['garten', 'gärtnern', 'gaertnern'], basis: 'Gartenhandschuhe', sonne: 'Sonnencreme', regen: 'eine Regenjacke' },
    { keywords: ['picknick', 'grillen', 'grillabend'], basis: 'Getränke', sonne: 'Sonnencreme', regen: 'lieber einen Plan B, es könnte regnen' },
    { keywords: ['wandern', 'spazieren', 'spaziergang', 'ausflug', 'wanderung'], basis: 'festes Schuhwerk', sonne: 'Sonnencreme und etwas zu trinken', regen: 'eine Regenjacke' },
    { keywords: ['radfahren', 'fahrrad', 'radtour', 'fahrradtour'], basis: 'den Helm und eine Trinkflasche', regen: 'eine Regenjacke' },
    { keywords: ['joggen', 'laufen', 'laufrunde'], sonne: 'Sonnencreme und etwas zu trinken', regen: 'wetterfeste Kleidung' },
    { keywords: ['camping', 'zelten'], basis: 'wetterfeste Kleidung', regen: 'eine zusätzliche Plane gegen Regen' },
    { keywords: ['angeln'], basis: 'Sonnenschutz' }
];

const SMART_TIP_LEAD_MIN_MIN = 45;   // frühestens 45 Minuten vorher
const SMART_TIP_LEAD_MAX_MIN = 75;   // spätestens 75 Minuten vorher (Prüf-Fenster)

function loadTippedEventIds() {
    try { return new Set(JSON.parse(getPersistentData('helfer_smart_tips_given', '[]'))); }
    catch (e) { return new Set(); }
}
function saveTippedEventIds(set) {
    const arr = Array.from(set).slice(-200);   // nicht unbegrenzt wachsen lassen
    setPersistentData('helfer_smart_tips_given', JSON.stringify(arr));
}

function findActivityTip(eventText) {
    const nk = normalizeKey(eventText || '');
    return ACTIVITY_TIPS.find(a => a.keywords.some(k => nk.includes(normalizeKey(k))));
}

function buildTipSentence(activity, weatherDay) {
    const parts = [];
    if (activity.basis) parts.push(activity.basis);
    if (weatherDay) {
        const regnetWahrscheinlich = (weatherDay.regenwahrscheinlichkeit_prozent || 0) >= 50 || (weatherDay.niederschlag_mm || 0) > 0.5;
        if (regnetWahrscheinlich && activity.regen) parts.push(activity.regen);
        else if (!regnetWahrscheinlich && weatherDay.hoechstwert_grad >= 20 && activity.sonne) parts.push(activity.sonne);
    }
    if (parts.length === 0) return null;
    return `Übrigens: Denken Sie an ${parts.join(' und ')}.`;
}

async function checkSmartTips() {
    if (!calendarEntries || calendarEntries.length === 0) return;
    const now = new Date();
    const tipped = loadTippedEventIds();

    const due = calendarEntries.find(e => {
        if (!e.isoDate || tipped.has(String(e.id))) return false;
        const t = new Date(e.isoDate);
        const minsAway = (t.getTime() - now.getTime()) / 60000;
        return minsAway >= SMART_TIP_LEAD_MIN_MIN && minsAway <= SMART_TIP_LEAD_MAX_MIN && findActivityTip(e.text);
    });
    if (!due) return;

    const activity = findActivityTip(due.text);
    tipped.add(String(due.id));
    saveTippedEventIds(tipped);   // sofort merken, damit es bei einem Fehler nicht wiederholt versucht wird

    let weatherDay = null;
    try {
        const forecast = await fetchWeatherForecast();
        if (forecast && forecast.tage) {
            const eventIso = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(new Date(due.isoDate));
            weatherDay = forecast.tage.find(t => t.datum === eventIso) || null;
        }
    } catch (e) { /* ohne Wetter geht's auch, dann eben nur die Basis-Tipps */ }

    const satz = buildTipSentence(activity, weatherDay);
    if (satz) speak(`In Kürze steht "${due.text}" an. ${satz}`);
}

setInterval(() => { checkSmartTips(); }, 60000);
