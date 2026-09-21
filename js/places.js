/* ============================================================
   PLACES: Parkplatz, Navigation, Anrufen, WhatsApp, Aktionskarten
   Der Browser darf nicht selbst anrufen oder Nachrichten abschicken.
   Deshalb erscheinen große Karten unter dem Ring. Ein Tipp darauf
   öffnet Telefon, WhatsApp oder Google Maps mit allem vorausgefüllt.
   Braucht: storage.js, render.js (escapeHtml), lists.js (resolveListTargets, userError),
            briefing.js (Standort, normalizeKey, formatSpokenTime)
   ============================================================ */

/* --- Aktionskarten --- */
function showActionCards(cards) {
    const box = document.getElementById('actionCards');
    if (!box) return;
    box.innerHTML = (cards || []).map(c => {
        const external = /^https?:/.test(c.href) ? ' target="_blank" rel="noopener"' : '';
        return `<a href="${escapeHtml(c.href)}"${external} onclick="playUiBeep()" class="flex items-center gap-3 bg-[#0a1621]/90 backdrop-blur border border-[#49d7ff]/60 border-glow-cyan rounded-xl p-3 font-mono">` +
            `<span class="text-2xl">${c.icon}</span>` +
            `<span class="flex-1 min-w-0"><b class="block text-[#49d7ff] text-sm">${escapeHtml(c.title)}</b>` +
            `<span class="block text-xs text-slate-400 truncate">${escapeHtml(c.subtitle || '')}</span></span>` +
            `<span class="text-[#49d7ff] text-lg">›</span></a>`;
    }).join('');
}

function clearActionCards() {
    showActionCards([]);
}

/* --- Navigation und Verbindungen (Google Maps zeigt die Bus- und Bahnverbindung direkt an) --- */
const NAV_MODES = { transit: 'Bus & Bahn', walking: 'zu Fuß', bicycling: 'mit dem Fahrrad', driving: 'mit dem Auto' };

function buildMapsLink(to, from, mode) {
    let url = 'https://www.google.com/maps/dir/?api=1&destination=' + encodeURIComponent(to) + '&travelmode=' + mode;
    if (from) url += '&origin=' + encodeURIComponent(from);   // ohne Startpunkt gilt der Standort des Users
    return url;
}

function buildNavigationCard(action) {
    const rawTo = String(action.nav_to || '').trim();
    if (!rawTo) throw userError('Mir fehlt das Ziel.');
    const from = String(action.nav_from || '').trim();
    let mode = String(action.nav_mode || '').toLowerCase().trim();
    let to = rawTo;

    const isCar = ['parkplatz', 'meinparkplatz', 'auto', 'meinauto', 'geparktesauto'].includes(normalizeKey(rawTo));
    if (isCar) {
        if (!parkingSpot) throw userError('Ich habe keinen gespeicherten Parkplatz. Sagen Sie „Merk dir, wo ich geparkt habe", dann speichere ich ihn.');
        to = `${parkingSpot.lat},${parkingSpot.lon}`;
        if (!NAV_MODES[mode]) mode = 'walking';
    } else if (!NAV_MODES[mode]) {
        mode = 'driving';
    }

    const icon = mode === 'transit' ? '🚆' : mode === 'walking' ? '🚶' : mode === 'bicycling' ? '🚲' : '🚗';
    const title = isCar ? 'Zum Auto' : (mode === 'transit' ? `Verbindung nach ${rawTo}` : `Route nach ${rawTo}`);
    const subtitle = `${NAV_MODES[mode]}, ${from ? 'von ' + from : 'von Ihrem Standort'}`;
    return { icon, title, subtitle, href: buildMapsLink(to, from, mode) };
}

/* --- Anrufen und WhatsApp --- */
function findContactForAction(name) {
    const n = String(name || '').trim();
    if (!n) throw userError('Mir fehlt der Name des Kontakts.');
    const entries = Object.keys(savedContacts).map(k => ({ text: savedContacts[k].originalName, key: k }));
    let target;
    try {
        target = resolveListTargets(entries, n, 'in den Kontakten')[0];
    } catch (err) {
        const msg = err.userMessage || '';
        throw userError(msg + (/nicht gefunden/.test(msg) ? ' Nennen Sie mir Name und Nummer, dann speichere ich den Kontakt.' : ''));
    }
    const c = savedContacts[target.key];
    return { name: c.originalName, phone: c.phone };
}

function phoneForTel(p) {
    return String(p).replace(/[^\d+]/g, '');
}

/* WhatsApp braucht die Nummer international, ohne +, Klammern und Nullen vorne: 0151 123456 -> 49151123456 */
function phoneForWhatsApp(p) {
    let s = String(p).trim().replace(/[\s()\-./]/g, '');
    if (s.startsWith('+')) s = s.slice(1);
    else if (s.startsWith('00')) s = s.slice(2);
    else if (s.startsWith('0')) s = '49' + s.slice(1);
    return s.replace(/\D/g, '');
}

function buildCallCard(action) {
    const c = findContactForAction(action.contact_name);
    const tel = phoneForTel(c.phone);
    if (!tel) throw userError(`Zu ${c.name} habe ich keine Telefonnummer.`);
    return { icon: '📞', title: `${c.name} anrufen`, subtitle: c.phone, href: 'tel:' + tel };
}

function buildWhatsAppCard(action) {
    const c = findContactForAction(action.contact_name);
    const num = phoneForWhatsApp(c.phone);
    if (!num) throw userError(`Zu ${c.name} habe ich keine Telefonnummer.`);
    const msg = String(action.message_text || '').trim();
    return {
        icon: '💬',
        title: `WhatsApp an ${c.name}`,
        subtitle: msg ? msg : 'Chat öffnen',
        href: 'https://wa.me/' + num + (msg ? '?text=' + encodeURIComponent(msg) : '')
    };
}

/* --- Parkplatz --- */
async function saveParkingSpot(note) {
    const loc = await fetchUserLocationData();
    if (!loc || loc.fehler || loc.latitude === undefined) {
        throw userError('Ihren Standort konnte ich gerade nicht ermitteln. Ist der Standortzugriff erlaubt?');
    }
    const street = loc.straßenAdresse ? loc.straßenAdresse + ', ' : '';
    const place = loc.ort && loc.ort !== 'Koordinaten ermittelt' ? loc.ort : '';
    const address = (street + place).trim() || `Koordinaten ${Number(loc.latitude).toFixed(5)}, ${Number(loc.longitude).toFixed(5)}`;

    parkingSpot = {
        lat: loc.latitude,
        lon: loc.longitude,
        adresse: address,
        notiz: note || '',
        gespeichert: new Date().toISOString()
    };
    setPersistentData('helfer_parking', JSON.stringify(parkingSpot));
    renderAllLists();
    return loc.genauigkeit;   // in Metern
}

function clearParkingSpot(announce = true) {
    parkingSpot = null;
    setPersistentData('helfer_parking', 'null');
    renderAllLists();
    if (announce) speak('Parkplatz gelöscht, Sir.');
}

async function saveParkingManual() {
    try {
        const accuracy = await saveParkingSpot('');
        let msg = `Parkplatz gespeichert, ${currentUserName}.`;
        if (accuracy && accuracy > 60) msg += ` Der Standort ist nur auf etwa ${Math.round(accuracy)} Meter genau.`;
        speak(msg);
    } catch (e) {
        speak(e.userMessage || 'Der Parkplatz konnte nicht gespeichert werden.');
    }
}

/* Für die KI: was ist gespeichert und wie lange her? */
function describeParking() {
    if (!parkingSpot) return null;
    const when = new Date(parkingSpot.gespeichert);
    const mins = Math.round((Date.now() - when.getTime()) / 60000);
    let vor;
    if (mins < 2) vor = 'gerade eben';
    else if (mins < 60) vor = `vor ${mins} Minuten`;
    else if (mins < 60 * 24) vor = `vor ${Math.round(mins / 60)} Stunden`;
    else vor = `vor ${Math.round(mins / 1440)} Tagen`;
    const tag = when.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Europe/Berlin' });
    return {
        adresse: parkingSpot.adresse,
        notiz: parkingSpot.notiz || undefined,
        gespeichert_vor: vor,
        gespeichert_am: `${tag}, ${formatSpokenTime(when)}`
    };
}

function renderParkingCard() {
    const box = document.getElementById('parkingBox');
    if (!box) return;
    if (!parkingSpot) {
        box.innerHTML = '<p class="text-slate-500 italic">Kein Parkplatz gespeichert.</p>';
        return;
    }
    const d = describeParking();
    box.innerHTML =
        `<div class="bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]">` +
        `<p class="text-slate-200">🚗 ${escapeHtml(d.adresse)}</p>` +
        (d.notiz ? `<p class="text-slate-400">${escapeHtml(d.notiz)}</p>` : '') +
        `<p class="text-[#5d7e91]">Gespeichert ${escapeHtml(d.gespeichert_vor)}</p></div>` +
        `<div class="flex gap-2">` +
        `<a href="${escapeHtml(buildMapsLink(parkingSpot.lat + ',' + parkingSpot.lon, '', 'walking'))}" target="_blank" rel="noopener" onclick="playUiBeep()" class="flex-1 text-center bg-[#49d7ff] text-[#050a10] py-2 rounded-lg font-bold uppercase">🚶 Zum Auto</a>` +
        `<button onclick="playUiBeep(); clearParkingSpot()" class="text-[#49d7ff] font-bold uppercase px-3">Löschen</button></div>`;
}
