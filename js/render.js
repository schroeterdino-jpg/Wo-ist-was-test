/* ============================================================
   RENDER: Listen und Tages-Übersicht anzeigen
   Braucht: ui.js, storage.js, lists.js (parseMemoryValue)
   ============================================================ */

/* Schlanke Zeile oben: nächster Termin (ohne Geburtstage) und Zahl der anstehenden Erinnerungen */
function getAssistantOverview(now = new Date()) {
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const next = (calendarEntries || [])
        .filter(c => c.isoDate && !isBirthdayEntry(c))
        .map(c => ({ text: c.text, ...parseEventDate(c.isoDate) }))
        .filter(c => !isNaN(c.date.getTime()) && (c.allDay ? c.date >= todayStart : c.date >= now))
        .sort((a, b) => a.date - b.date)[0];

    let nextText = 'Keine anstehenden Termine';
    const disconnected = typeof isGoogleAuthorized === 'function' && !isGoogleAuthorized();
    if (disconnected) {
        nextText = 'Kalender nicht verbunden. Tippen zum Verbinden.';
    } else if (next) {
        const tag = relativeDayLabel(next.date, todayStart);
        nextText = next.allDay
            ? `${next.text}, ${tag}, ganztägig`
            : `${next.text}, ${tag} ${next.date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Berlin' })}`;
    }

    const reminderCount = (reminderEntries || [])
        .filter(r => !r.triggered && r.time && new Date(r.time) >= now).length;

    return { nextText, reminderCount };
}

function renderAssistantOverview() {
    const ov = getAssistantOverview();
    const elNext = document.getElementById('ovNext');
    const elRem = document.getElementById('ovReminders');
    if (elNext) elNext.textContent = ov.nextText;
    if (elRem) elRem.textContent = `🔔 ${ov.reminderCount}`;
}

/* Schreibt nur, wenn sich der Inhalt wirklich geändert hat: spart Arbeit und verhindert Flackern beim Auffrischen */
function setHtmlIfChanged(el, html) {
    if (!el || el.__lastHtml === html) return;
    el.__lastHtml = html;
    el.innerHTML = html;
}

function escapeHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderAllLists() {
    if (calendarList) setHtmlIfChanged(calendarList, calendarEntries.length === 0 ? '<li class="text-slate-500 italic">Keine Termine.</li>' : calendarEntries.map(e => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>📅 ${e.text} (${e.date})</span><button onclick="playUiBeep(); deleteCalendarEntry('${e.id}')" class="text-[#49d7ff] font-bold text-xs uppercase">Löschen</button></li>`).join(''));
    if (todoList) setHtmlIfChanged(todoList, todoEntries.length === 0 ? '<li class="text-slate-500 italic">Keine offenen Aufgaben.</li>' : todoEntries.map(e => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>📝 ${e.text}</span><button onclick="playUiBeep(); deleteTodoEntry(${e.id})" class="text-[#57e0a1] font-bold text-xs uppercase">Erledigt</button></li>`).join(''));
    if (shoppingList) setHtmlIfChanged(shoppingList, shoppingEntries.length === 0 ? '<li class="text-slate-500 italic">Liste ist leer.</li>' : shoppingEntries.map(e => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>🛒 ${e.text}</span><button onclick="playUiBeep(); deleteShoppingEntry(${e.id})" class="text-[#57e0a1] font-bold text-xs uppercase">Gekauft</button></li>`).join(''));
    if (reminderList) setHtmlIfChanged(reminderList, reminderEntries.length === 0 ? '<li class="text-slate-500 italic">Keine Erinnerungen.</li>' : reminderEntries.map(e => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>🔔 ${e.text} (${new Date(e.time).toLocaleString('de-DE', {timeZone: 'Europe/Berlin', dateStyle:'short', timeStyle:'short'})})</span><button onclick="playUiBeep(); deleteReminderEntry(${e.id})" class="text-[#49d7ff] font-bold text-xs uppercase">Löschen</button></li>`).join(''));

    if (categoryContainer) {
        const memKeys = Object.keys(memoryItems);
        const memHtml = memKeys.length === 0 ? '<p class="text-slate-500 italic text-xs">Noch nichts im Gedächtnis gespeichert.</p>' : memKeys.map(k => {
            const val = parseMemoryValue(memoryItems[k]);
            return `<div class="flex justify-between items-center text-xs py-1 border-b border-[rgba(93,209,255,.1)]"><span>• <b class="text-[#49d7ff]">${k}</b>: ${val}</span><button onclick="playUiBeep(); deleteMemoryItem('${k}')" class="text-[#49d7ff] font-bold">Löschen</button></div>`;
        }).join('');
        setHtmlIfChanged(categoryContainer, memHtml);
    }

    const briefingListEl = document.getElementById('briefingList');
    if (briefingListEl) {
        const wishHtml = briefingWishes.length === 0
            ? '<li class="text-slate-500 italic">Keine Wünsche eingetragen.</li>'
            : briefingWishes.map(w => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>${w.type === 'item' ? '📌 Gegenstand: ' : '🌅 '}${escapeHtml(w.text)}</span><button onclick="playUiBeep(); deleteBriefingWish(${Number(w.id)})" class="text-[#49d7ff] font-bold text-xs uppercase">Löschen</button></li>`).join('');
        setHtmlIfChanged(briefingListEl, wishHtml);
    }

    if (typeof renderParkingCard === 'function') renderParkingCard();
    if (typeof refreshOpenPanel === 'function') refreshOpenPanel();

    renderAssistantOverview();
}
