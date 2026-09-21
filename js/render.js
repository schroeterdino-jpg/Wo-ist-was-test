/* ============================================================
   RENDER: Listen und Tages-Übersicht anzeigen
   Braucht: ui.js, storage.js, lists.js (parseMemoryValue)
   ============================================================ */

function getAssistantOverview() {
    const now = new Date();

    let nextCal = "Keine anstehenden Termine";
    if (calendarEntries && calendarEntries.length > 0) {
        const validCal = calendarEntries
            .filter(c => c.isoDate && new Date(c.isoDate) >= now)
            .sort((a, b) => new Date(a.isoDate) - new Date(b.isoDate));
        if (validCal.length > 0) {
            const topCal = validCal[0];
            const dateFormatted = new Date(topCal.isoDate).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
            nextCal = `${topCal.text} (${dateFormatted})`;
        } else if (calendarEntries[0].text) {
            nextCal = calendarEntries[0].text;
        }
    }

    let nextRem = "Keine aktiven Erinnerungen";
    if (reminderEntries && reminderEntries.length > 0) {
        const validRem = reminderEntries
            .filter(r => !r.triggered && r.time && new Date(r.time) >= now)
            .sort((a, b) => new Date(a.time) - new Date(b.time));
        if (validRem.length > 0) {
            const topRem = validRem[0];
            const remFormatted = new Date(topRem.time).toLocaleString('de-DE', { timeZone: 'Europe/Berlin', dateStyle: 'short', timeStyle: 'short' });
            nextRem = `${topRem.text} (${remFormatted})`;
        }
    }

    return {
        nextCalendar: nextCal,
        nextReminder: nextRem,
        todoCount: todoEntries ? todoEntries.length : 0,
        shoppingCount: shoppingEntries ? shoppingEntries.length : 0,
        memoryCount: memoryItems ? Object.keys(memoryItems).length : 0
    };
}

function renderAssistantOverview() {
    const ov = getAssistantOverview();
    const elCal = document.getElementById('ovNextCalendar');
    const elRem = document.getElementById('ovNextReminder');
    const elTodos = document.getElementById('ovCountTodos');
    const elShopping = document.getElementById('ovCountShopping');
    const elMemory = document.getElementById('ovCountMemory');

    if (elCal) elCal.textContent = ov.nextCalendar;
    if (elRem) elRem.textContent = ov.nextReminder;
    if (elTodos) elTodos.textContent = ov.todoCount;
    if (elShopping) elShopping.textContent = ov.shoppingCount;
    if (elMemory) elMemory.textContent = ov.memoryCount;
}

function renderAllLists() {
    if (calendarList) calendarList.innerHTML = calendarEntries.length === 0 ? '<li class="text-slate-500 italic">Keine Termine.</li>' : calendarEntries.map(e => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>📅 ${e.text} (${e.date})</span><button onclick="playUiBeep(); deleteCalendarEntry('${e.id}')" class="text-[#49d7ff] font-bold text-xs uppercase">Löschen</button></li>`).join('');
    if (todoList) todoList.innerHTML = todoEntries.length === 0 ? '<li class="text-slate-500 italic">Keine offenen Aufgaben.</li>' : todoEntries.map(e => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>📝 ${e.text}</span><button onclick="playUiBeep(); deleteTodoEntry(${e.id})" class="text-[#57e0a1] font-bold text-xs uppercase">Erledigt</button></li>`).join('');
    if (shoppingList) shoppingList.innerHTML = shoppingEntries.length === 0 ? '<li class="text-slate-500 italic">Liste ist leer.</li>' : shoppingEntries.map(e => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>🛒 ${e.text}</span><button onclick="playUiBeep(); deleteShoppingEntry(${e.id})" class="text-[#57e0a1] font-bold text-xs uppercase">Gekauft</button></li>`).join('');
    if (reminderList) reminderList.innerHTML = reminderEntries.length === 0 ? '<li class="text-slate-500 italic">Keine Erinnerungen.</li>' : reminderEntries.map(e => `<li class="flex justify-between items-center bg-black p-3 rounded-lg border border-[rgba(93,209,255,.2)]"><span>🔔 ${e.text} (${new Date(e.time).toLocaleString('de-DE', {timeZone: 'Europe/Berlin', dateStyle:'short', timeStyle:'short'})})</span><button onclick="playUiBeep(); deleteReminderEntry(${e.id})" class="text-[#49d7ff] font-bold text-xs uppercase">Löschen</button></li>`).join('');

    if (categoryContainer) {
        const memKeys = Object.keys(memoryItems);
        categoryContainer.innerHTML = memKeys.length === 0 ? '<p class="text-slate-500 italic text-xs">Noch nichts im Gedächtnis gespeichert.</p>' : memKeys.map(k => {
            const val = parseMemoryValue(memoryItems[k]);
            return `<div class="flex justify-between items-center text-xs py-1 border-b border-[rgba(93,209,255,.1)]"><span>• <b class="text-[#49d7ff]">${k}</b>: ${val}</span><button onclick="playUiBeep(); deleteMemoryItem('${k}')" class="text-[#49d7ff] font-bold">Löschen</button></div>`;
        }).join('');
    }

    renderAssistantOverview();
}
