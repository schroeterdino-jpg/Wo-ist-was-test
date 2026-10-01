/* ============================================================
   LOCALCOMMANDS: Protokolle und feste Sprachbefehle ohne Umweg über die KI (Karte, Welt, Bundesliga ...)
   Aus assistant.js herausgelöst, Code unverändert. Braucht: storage.js, panels.js, voice.js zur Laufzeit.
   ============================================================ */

/* ---------- Protokolle ---------- */
const DEFAULT_PROTOCOLS = {
    feierabend: {
        name: 'Feierabend',
        steps: ['Wie lange dauert die Fahrt nach Hause?', 'Wie ist das Wetter?', 'Was kosten Benzin und Diesel in der Nähe?']
    }
};
let protocols = {};
(function loadProtocols() {
    const raw = getPersistentData('helfer_protocols', '');
    if (!raw) {
        protocols = JSON.parse(JSON.stringify(DEFAULT_PROTOCOLS));   // erster Start: "Feierabend" ist schon vorbereitet
        setPersistentData('helfer_protocols', JSON.stringify(protocols));
        return;
    }
    try { protocols = JSON.parse(raw) || {}; } catch (e) { protocols = {}; }
})();
let protocolRunning = false;

/* Fehlertext bei Problemen, sonst null */
function saveProtocol(name, steps) {
    const cleanName = String(name || '').replace(/^protokoll\s+/i, '').trim();
    const key = plainKey(cleanName);
    if (!key) return 'Mir fehlt der Name für das Protokoll.';
    const list = (Array.isArray(steps) ? steps : []).map(x => String(x || '').trim()).filter(Boolean).slice(0, 8);
    if (list.length === 0) return 'Mir fehlen die Schritte für das Protokoll.';
    protocols[key] = { name: cleanName, steps: list };
    setPersistentData('helfer_protocols', JSON.stringify(protocols));
    return null;
}

function deleteProtocol(name) {
    const key = plainKey(String(name || '').replace(/^protokoll\s+/i, ''));
    if (!key || !protocols[key]) return false;
    delete protocols[key];
    setPersistentData('helfer_protocols', JSON.stringify(protocols));
    return true;
}

/* Sagt der Satz "Starte Protokoll Feierabend" (oder nur "Feierabend")? Gibt den Schlüssel des Protokolls zurück. */
function findProtocolToRun(text) {
    const raw = String(text || '');
    if (/\b(lege|leg|erstelle|erstell\w*|anlegen|speichere|lösche|löschen|entferne|vergiss|neues|neu)\b/i.test(raw)) return null;   // Anlegen/Löschen macht die KI
    const t = plainKey(raw);
    const hasWord = t.includes('protokoll');
    for (const k of Object.keys(protocols)) {
        const nk = plainKey(protocols[k].name);
        if (!nk) continue;
        if (t === nk || (hasWord && t.includes(nk))) return k;
    }
    return null;
}

async function runProtocol(key) {
    const p = protocols[key];
    if (!p || protocolRunning) return;
    protocolRunning = true;
    isProcessing = true;
    typeWriterStatus(`Protokoll ${p.name} läuft...`);
    updateTerminalStream(`PROTOCOL: RUN_${plainKey(p.name).toUpperCase()}`, "PROCESSING");
    clearActionCards();
    const replies = [];
    const cards = [];
    try {
        for (const step of p.steps) {
            await sendToGroqSmart(step, { collect: (r, c) => { if (r) replies.push(r); (c || []).forEach(x => cards.push(x)); } });
        }
    } finally {
        protocolRunning = false;
        isProcessing = false;
    }
    if (isPanelOpen()) closePanel();
    showActionCards(cards);
    speak(`Protokoll ${p.name}. ` + (replies.length ? replies.join(' ') : 'Ich konnte dazu leider nichts ermitteln.'), continueConversation);
}

/* ---------- Feste Sprachbefehle (ohne Umweg über die KI) ----------
   Gibt true zurück, wenn der Satz hier behandelt wurde. */
function isMapCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, '').trim();
    if (t.length > 70 || !/\b(karte|landkarte|kartenansicht)\b/.test(t)) return false;
    return /(zeig|öffne|öffnen|anzeig|blende|starte|mach\b|mal\b)/.test(t);
}

/* "Zeig mir mein Dashboard", "Dashboard öffnen", "Übersicht anzeigen" */
function isDashboardCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?]/g, '').trim();
    if (t.length > 70 || !/(?:^|[^a-zäöüß])(dashboard|übersicht|cockpit)(?:$|[^a-zäöüß])/.test(t)) return false;
    return /(zeig|öffne|öffnen|anzeig|blende|starte|mach\b|mal\b)/.test(t);
}

/* "Was ist gerade in Spanien los?", "Nachrichten aus Japan", "Zeig mir, was auf der Welt los ist"
   -> { place: 'Spanien' } bzw. { place: '' } (nur die Kugel); sonst null */
function matchWorldCommand(text) {
    const t = String(text || '').trim().replace(/[?!.]+$/, '');
    const low = t.toLowerCase();
    if (!t || t.length > 90) return null;
    if (/\b(iss|raumstation)\b/.test(low)) return { place: '', mode: 'iss' };
    if (/\berdbeb\w*|\bbeben\b/.test(low)) return { place: '', mode: 'quakes' };
    // "Zeig mir auf der Weltkugel, wo ich bin" / "Weltkugel, wo befinde ich mich" / "Mein Standort auf der Welt"
    if (/\b(welt|weltkugel|globus|kugel)\b/.test(low) && /\b(wo (bin ich|befinde ich mich)|mein(en|e|er)? standort|meine position)\b/.test(low)) return { place: '', mode: 'mystandort' };
    if (/\b(weltkugel|globus)\b/.test(low) || /(auf|in) der welt\b|weltweit|zeig\w*\s+(mir\s+)?(bitte\s+)?die welt\b/.test(low)) return { place: '' };
    if (!/(\blos\b|passiert|geschieht|nachrichten|\bnews\b|neuigkeiten|\bneues\b|\blage\b|sieht es .* aus|was läuft|was geht)/.test(low)) return null;
    if (/\b(wetter|regen|regenschirm|temperatur|grad|sprit|benzin|diesel|preise?|fahrzeit|fahrt|stau|restaurants?|essen|hotels?|termine?|kalender|listen?|einkaufsliste|gedächtnis|erinnerung(?:en)?|paket|mails?|briefing|parkplatz)\b/.test(low)) return null;
    const m = t.match(/(?:^|\s)(?:in|aus|von|über|mit|um)\s+(?:(?:der|dem|den|die|das)\s+)?(.+?)(?:\s+(?:gerade|aktuell|jetzt|heute|los|neu|neues|passiert|geschieht|aus|denn|eigentlich))*$/i);
    if (!m) return null;
    const place = m[1].trim();
    if (place.length < 3 || place.length > 40 || /^(mein|dein|unser|hier|dieser|diesem|dieser|meiner|deiner)/i.test(place)) return null;
    return { place };
}

/* "Zeig mir New York live", "Ich möchte gerne mal Florida sehen", "Live-Kamera Tokio"
   -> { place: 'newyork' } (bekannter Ort, Schlüssel) bzw. { place: 'Rom' } (unbekannter Ort); sonst null */
function matchLiveCamCommand(text) {
    const t = String(text || '').trim().replace(/[?!.,]+$/, '');
    const low = t.toLowerCase();
    if (!t || t.length > 90) return null;
    if (/(nachrichten|\bnews\b|\blos\b|passiert|wetter|regen|route|fahr|karte|preis|sprit|stau|termin|kalender|liste|erdbeb|\biss\b|übersetz|dolmetsch)/.test(low)) return null;
    const known = (typeof LIVE_CAMS !== 'undefined') ? LIVE_CAMS.find(c => c.names.some(n => new RegExp('(?:^|[^a-zäöüß])' + n.replace(/ /g, '\\s+') + '(?![a-zäöüß])').test(low))) : null;
    const liveWord = /\b(live|livecam|live-cam|webcam|webcams|kamera|kameras|kamerabild\w*|cam|cams)\b/.test(low);
    const seeStrict = /(zeig\w*|sehen|schauen|anschauen|ansehen|öffne\w*)/.test(low);                 // "möchte nach Paris" allein ist keine Kamera-Bitte
    const wishWord = /(möchte|will\b|lass mich|kann ich)/.test(low);
    if (known && (liveWord || seeStrict)) return { place: known.key };
    if (!known && liveWord && (seeStrict || wishWord)) {
        const rest = low.replace(/\b(zeig\w*|mir|mal|bitte|ich|möchte|will|gerne|live|livecam|live-cam|webcams?|kameras?|kamerabild\w*|cams?|von|aus|in|auf|bilder|die|das|den|dem|der|eine|einen|ein|sehen|ansehen|anschauen|schauen|öffne\w*|lass|mich|kannst|du|kann|ich|zeigen|noch|doch|einmal)\b/g, ' ').replace(/\s+/g, ' ').trim();
        const words = rest.split(' ').filter(Boolean);
        if (words.length >= 1 && words.length <= 3 && rest.length >= 3) return { place: rest.replace(/\b\w/g, c => c.toUpperCase()) };
    }
    return null;
}

/* Ist die Weltkugel offen, genügt ein Ortsname: "Und in Portugal?", "In Spanien", "Japan".
   Bewusst streng: Alles andere (z.B. "Setz Milch auf die Einkaufsliste") geht ganz normal an J.A.R.V.I.S. */
function placeFromFollowUp(text) {
    const t = String(text || '').trim().replace(/[?!.,]+$/, '');
    if (!t || t.length > 40 || t.split(/\s+/).length > 7) return null;
    const stop = /^(jarvis|danke|bitte|hallo|hey|okay|ok|ja|nein|weiter|stopp|stop|schließen|zurück|wetter|karte|radar|liste|termine|kalender|hilfe|mehr|nochmal|wiederholen|gut|super|genau|richtig|falsch|morgen|abend|nacht|heute|jetzt|später|alles|nichts|nix|dann|noch|auch|wieder|wie|was|wo|wer|wann|warum|nähe|umgebung|einkaufsliste|aufgaben|aufgabenliste|erinnerungen|termin|kontakte|gedächtnis|briefing|parkplatz|einstellungen|menü|mir|mich|dir|uns|ich|du|wir|sie|es)$/i;
    const article = '(?:(?:der|dem|den|die|das)\\s+)?';
    let place = null;
    // 1) mit Einleitung: "Und in Portugal", "In Spanien", "Was ist in Italien", "Und Japan"
    let m = t.match(new RegExp('^(?:und\\s+)?(?:was\\s+ist\\s+|wie\\s+ist\\s+es\\s+|wie\\s+sieht\\s+es\\s+)?(?:in|aus|von|über|nach)\\s+' + article + '(.+?)(?:\\s+(?:los|aus|denn))*$', 'i'));
    if (m) place = m[1];
    else {
        m = t.match(new RegExp('^und\\s+' + article + '(.+)$', 'i'));
        if (m) place = m[1];
        // 2) ein einzelnes großgeschriebenes Wort: "Portugal"
        else if (!/\s/.test(t) && /^[A-ZÄÖÜ]/.test(t) && t.length >= 4) place = t;
    }
    if (!place) return null;
    place = place.trim();
    const words = place.split(/\s+/);
    if (words.length > 3 || place.length < 3 || place.length > 30 || /\d/.test(place) || stop.test(place) || stop.test(words[0])) return null;
    return place;
}

/* Ein Fehler in den festen Befehlen darf nie dazu führen, dass Jarvis gar nichts mehr sagt: dann geht der Satz normal an die KI */
function handleLocalCommand(text) {
    try {
        return handleLocalCommandInner(text);
    } catch (e) {
        console.error('Fester Sprachbefehl fehlgeschlagen', e);
        return false;
    }
}

/* "Zeig mir die Nachrichten von heute" / "Nachrichten für Hamburg" -> öffnet das neue Nachrichten-Panel.
   Gibt den erkannten Ort zurück (leer = Deutschland, Standard), oder null, wenn es kein Nachrichten-Befehl war. */
function matchNachrichtenPanelCommand(text) {
    const t = String(text || '').trim();
    if (!t || t.length > 90) return null;
    if (!/\bnachrichten\b/i.test(t)) return null;
    if (!/\b(zeig|zeigen|öffne|öffnen|was gibt|aktuelle|heute)\b/i.test(t)) return null;
    const m = t.match(/nachrichten\s+(?:für|aus|von|in)\s+([a-zäöüßA-ZÄÖÜ\- ]+)/i);
    return m ? m[1].trim().replace(/\bheute\b.*$/i, '').trim() : '';
}

/* --- Bundesliga: "Wie hat der HSV gespielt?" / "Wann spielt der HSV?" (OpenLigaDB, kostenlos, kein Schlüssel,
   direkt aus dem Browser abrufbar). Deckt nur den AKTUELLEN Spieltag ab (1. und 2. Bundesliga) - das reicht für
   "wie hat X zuletzt gespielt / wann spielt X als nächstes", aber nicht für länger zurückliegende Spiele. --- */
const BUNDESLIGA_TEAM_ALIASES = {
    hsv: 'Hamburg', 'hamburger sv': 'Hamburg', hamburg: 'Hamburg',
    bayern: 'Bayern', fcb: 'Bayern', münchen: 'Bayern', muenchen: 'Bayern',
    dortmund: 'Dortmund', bvb: 'Dortmund',
    bremen: 'Bremen', werder: 'Bremen',
    schalke: 'Schalke',
    leverkusen: 'Leverkusen', bayer: 'Leverkusen',
    gladbach: 'Gladbach', mönchengladbach: 'Gladbach', moenchengladbach: 'Gladbach',
    frankfurt: 'Frankfurt', eintracht: 'Frankfurt',
    stuttgart: 'Stuttgart', vfb: 'Stuttgart',
    hoffenheim: 'Hoffenheim',
    mainz: 'Mainz',
    köln: 'Köln', koeln: 'Köln',
    union: 'Union Berlin', 'union berlin': 'Union Berlin',
    freiburg: 'Freiburg',
    augsburg: 'Augsburg',
    bochum: 'Bochum',
    heidenheim: 'Heidenheim',
    wolfsburg: 'Wolfsburg',
    leipzig: 'Leipzig', 'rb leipzig': 'Leipzig',
    kiel: 'Kiel', holstein: 'Kiel',
    pauli: 'Pauli', 'st pauli': 'Pauli', 'st. pauli': 'Pauli',
    hannover: 'Hannover',
    nürnberg: 'Nürnberg', nuernberg: 'Nürnberg',
    fürth: 'Fürth', fuerth: 'Fürth',
    düsseldorf: 'Düsseldorf', duesseldorf: 'Düsseldorf',
    braunschweig: 'Braunschweig',
    karlsruhe: 'Karlsruhe',
    magdeburg: 'Magdeburg',
    elversberg: 'Elversberg',
    regensburg: 'Regensburg',
    ulm: 'Ulm'
};

/* "Zeig mir die Tabelle" / "Wie ist die Tabelle?" -> öffnet die Bundesliga-Tabelle als eigenes Fenster
   (nicht nur ein gesprochenes Ergebnis wie bei matchBundesligaCommand). Gibt 'bl1' oder 'bl2' zurück, oder null. */
function matchBundesligaTableCommand(text) {
    const low = String(text || '').toLowerCase();
    if (low.length > 60) return null;
    // Kein Wortgrenzen-Zwang mehr bei "tabelle" - erkennt so auch "Tabellenstand", "Tabellenplatz" usw.,
    // nicht nur das isolierte Wort "Tabelle" selbst.
    const hasTableWord = /tabelle|rangliste/.test(low);
    const hasStandingsPhrase = /wie steht/.test(low) && /bundesliga/.test(low);
    if (!hasTableWord && !hasStandingsPhrase) return null;
    return /\b(2\.\s*bundesliga|zweite(n)?\s*liga)\b/.test(low) ? 'bl2' : 'bl1';
}

function matchBundesligaCommand(text) {
    const low = String(text || '').toLowerCase();
    if (low.length > 90) return null;
    if (!/(bundesliga|gespielt|spielt\b|wann spielt|wie hat|ergebnis)/i.test(low)) return null;
    for (const alias of Object.keys(BUNDESLIGA_TEAM_ALIASES)) {
        if (low.includes(alias)) return BUNDESLIGA_TEAM_ALIASES[alias];
    }
    return null;
}

/* Aktuellen Spieltag von 1. und 2. Bundesliga durchsuchen (manche Teams wechseln zwischen den Ligen, z.B. der HSV) */
async function fetchBundesligaTeamStatus(teamNamePart) {
    for (const liga of ['bl1', 'bl2']) {
        try {
            const res = await fetch(`https://api.openligadb.de/getmatchdata/${liga}`);
            if (!res.ok) continue;
            const matches = await res.json();
            const hit = (matches || []).find(m =>
                (m.team1 && m.team1.teamName && m.team1.teamName.includes(teamNamePart)) ||
                (m.team2 && m.team2.teamName && m.team2.teamName.includes(teamNamePart))
            );
            if (hit) return { match: hit, liga };
        } catch (e) { /* nächste Liga probieren */ }
    }
    return null;
}

function describeBundesligaMatch(hit) {
    const m = hit.match;
    const heim = m.team1.teamName, gast = m.team2.teamName;
    const kickoff = new Date(m.matchDateTime);
    const finished = !!m.matchIsFinished;
    let ergebnis = null;
    if (finished && Array.isArray(m.matchResults) && m.matchResults.length) {
        const endResult = m.matchResults.find(r => r.resultTypeID === 2) || m.matchResults[m.matchResults.length - 1];
        ergebnis = `${endResult.pointsTeam1}:${endResult.pointsTeam2}`;
    }
    const zeitText = kickoff.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
    const liga = hit.liga === 'bl2' ? '2. Bundesliga' : '1. Bundesliga';
    if (finished && ergebnis) return `${heim} gegen ${gast} (${liga}) endete ${ergebnis}, gespielt am ${zeitText}.`;
    if (kickoff > new Date()) return `${heim} gegen ${gast} (${liga}) findet statt am ${zeitText}.`;
    return `${heim} gegen ${gast} (${liga}) läuft gerade oder das Ergebnis ist noch nicht eingetragen, angesetzt für ${zeitText}.`;
}

/* Kleine Karte fürs Einzelspiel (unter der Kugel auf dem Hauptbildschirm), zusätzlich zur gesprochenen Antwort */
function bundesligaMatchCard(hit) {
    const m = hit.match;
    const heim = m.team1.teamName, gast = m.team2.teamName;
    const kickoff = new Date(m.matchDateTime);
    const finished = !!m.matchIsFinished;
    const liga = hit.liga === 'bl2' ? '2. Bundesliga' : '1. Bundesliga';
    let ergebnis = null;
    if (finished && Array.isArray(m.matchResults) && m.matchResults.length) {
        const endResult = m.matchResults.find(r => r.resultTypeID === 2) || m.matchResults[m.matchResults.length - 1];
        ergebnis = `${endResult.pointsTeam1}:${endResult.pointsTeam2}`;
    }
    const zeitText = kickoff.toLocaleString('de-DE', { timeZone: 'Europe/Berlin', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
    return {
        icon: finished ? '⚽' : '🕒',
        title: `${heim} – ${gast}`,
        subtitle: (finished && ergebnis ? ergebnis + ' · ' : '') + zeitText + ' · ' + liga
    };
}

async function handleBundesligaQuery(teamNamePart) {
    speakAck(pickRandom(['Ich schaue nach.', 'Einen Moment, ich prüfe die Bundesliga.', 'Ich sehe nach.']));
    try {
        const hit = await fetchBundesligaTeamStatus(teamNamePart);
        if (!hit) { speak(`Zum aktuellen Spieltag habe ich für ${teamNamePart} leider kein Spiel gefunden.`, continueConversation); return; }
        if (typeof clearActionCards === 'function') clearActionCards();
        if (typeof showActionCards === 'function') showActionCards([bundesligaMatchCard(hit)]);
        speak(describeBundesligaMatch(hit), continueConversation);
    } catch (e) {
        speak('Die Bundesliga-Daten konnte ich gerade nicht abrufen.', continueConversation);
    }
}

function handleLocalCommandInner(text) {
    if (handleGreeting(text)) return true;
    if (typeof handlePronunciationCommand === 'function' && handlePronunciationCommand(text)) return true;
    if (isSystemCheckCommand(text)) { runSystemCheckSpoken(); return true; }
    // Wichtige Erinnerungen: "erledigt" beendet das Nachfassen, "in zehn Minuten nochmal" verschiebt sie
    if (handleAcknowledgeCommand(text)) return true;
    if (handleSnoozeCommand(text)) return true;

    // "Zeig mir die Nachrichten von heute" / "Nachrichten für Hamburg" -> eigenes Panel mit Bild-Karten,
    // OHNE die 3D-Weltkugel. Die Weltkugel selbst bleibt für "Zeig mir die Weltkugel"/ISS/Erdbeben/Live-Kameras da.
    const newsCmd = matchNachrichtenPanelCommand(text);
    if (newsCmd !== null) { openPanel('nachrichten', { place: newsCmd }); return true; }

    const blTeam = matchBundesligaCommand(text);
    if (blTeam) { handleBundesligaQuery(blTeam); return true; }
    const blTable = matchBundesligaTableCommand(text);
    if (blTable) { openPanel('tabelle', { liga: blTable }); return true; }

    const worldCmd = matchWorldCommand(text);
    if (worldCmd) { openWelt(worldCmd.place, worldCmd.mode); return true; }
    const liveCmd = matchLiveCamCommand(text);
    if (liveCmd) { openWelt(liveCmd.place, 'live'); return true; }
    if (typeof isPanelOpen === 'function' && isPanelOpen() && currentPanel && currentPanel.name === 'welt') {
        if (text.length <= 40 && /\b(wo (bin ich|befinde ich mich)|mein(en|e|er)? standort|meine position)\b/i.test(text)) { openWelt('', 'mystandort'); return true; }
        const followPlace = placeFromFollowUp(text);
        if (followPlace) { openWelt(followPlace); return true; }
    }
    const addr = matchWorkAddressCommand(text);
    if (addr) {
        saveWorkAddress(addr);
        speak(`Arbeitsadresse gespeichert: ${addr}.`, continueConversation);
        return true;
    }
    if (/\b(regenradar|niederschlagsradar|wetterradar|radar)\b/i.test(text) && String(text).length <= 70) {
        if (isPanelOpen() && currentPanel && currentPanel.name === 'karte') hudMapSetRadar(true);
        else openPanel('karte', { radar: true });
        speak(pickRandom(['Hier das Regenradar.', 'Das Radar wird geladen.', 'Sehr wohl, das Regenradar.', 'Einen Blick auf den Himmel, sofort.', 'Ich hole die aktuellen Regendaten.', 'Kommt sogleich.']), continueConversation);
        return true;
    }
    if (isMapCommand(text)) {
        openPanel('karte', {});
        speak(pickRandom(['Bitte sehr.', 'Karte wird aufgebaut.', 'Sehr wohl.', 'Einen Moment, ich lege die Karte auf.', 'Ich rufe die Route ab.', 'Wird sofort aufgebaut.']), continueConversation);
        return true;
    }
    if (isDashboardCommand(text)) {
        if (typeof openDashboard === 'function') openDashboard();
        else openPanel('dashboard', {});
        speak(pickRandom(['Bitte sehr.', 'Dashboard wird aufgebaut.', 'Sehr wohl.', 'Ich stelle die Übersicht zusammen.', 'Einen Augenblick, alles auf einen Blick.', 'Wird sofort zusammengestellt.']), continueConversation);
        return true;
    }
    const pk = findProtocolToRun(text);
    if (pk) {
        runProtocol(pk).catch(e => { console.error('Protokoll fehlgeschlagen', e); speak('Das Protokoll ist leider fehlgeschlagen.'); });
        return true;
    }
    return false;
}
