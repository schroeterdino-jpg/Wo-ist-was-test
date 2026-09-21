/* ============================================================
   LISTS: Aufgaben, Einkaufsliste, Gedächtnis, Kontakte
   Braucht: storage.js, render.js
   ============================================================ */

/* --- Gedächtnis: Werte lesen und durchsuchen --- */
function parseMemoryValue(rawVal) {
    if (typeof rawVal === 'object' && rawVal !== null) {
        return rawVal.location || rawVal.value || JSON.stringify(rawVal);
    }
    try {
        const parsed = JSON.parse(rawVal);
        if (typeof parsed === 'object' && parsed !== null) {
            return parsed.location || parsed.value || String(rawVal);
        }
    } catch (e) {}
    return String(rawVal);
}

function searchMemory(query) {
    if (!query || typeof memoryItems !== 'object') return [];
    const lowerQuery = query.toLowerCase().trim();

    const matchesQuery = (text, q) => {
        if (text.includes(q) || q.includes(text)) return true;
        const normalizedText = text.replace(/y/g, 'i');
        const normalizedQ = q.replace(/y/g, 'i');
        return normalizedText.includes(normalizedQ) || normalizedQ.includes(normalizedText);
    };

    return Object.keys(memoryItems)
        .filter(key => {
            const cleanVal = parseMemoryValue(memoryItems[key]).toLowerCase();
            return matchesQuery(key.toLowerCase(), lowerQuery) || matchesQuery(cleanVal, lowerQuery);
        })
        .map(key => ({ key, value: parseMemoryValue(memoryItems[key]) }));
}

/* --- Manuell hinzufügen --- */
function addManualTodo() {
    const inputEl = document.getElementById('manualTodoInput');
    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (val) {
        todoEntries.unshift({ id: Date.now(), text: val, createdDate: 'Manuell' });
        setPersistentData('helfer_todo_entries', JSON.stringify(todoEntries));
        inputEl.value = '';
        renderAllLists();
        speak(`Aufgabe hinzugefügt, Sir.`);
    }
}

function addManualShoppingItem() {
    const inputEl = document.getElementById('manualShoppingInput');
    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (val) {
        shoppingEntries.unshift({ id: Date.now(), text: val });
        setPersistentData('helfer_shopping', JSON.stringify(shoppingEntries));
        inputEl.value = '';
        renderAllLists();
        speak(`Wird erledigt, ${currentUserName}. Artikel steht auf der Einkaufsliste.`);
    }
}

function addManualMemoryItem() {
    const keyEl = document.getElementById('manualMemoryKeyInput');
    const valEl = document.getElementById('manualMemoryValInput');
    if (!keyEl || !valEl) return;
    const key = keyEl.value.trim().toLowerCase();
    const val = valEl.value.trim();
    if (key && val) {
        memoryItems[key] = val;
        setPersistentData('helfer_memory', JSON.stringify(memoryItems));
        keyEl.value = '';
        valEl.value = '';
        renderAllLists();
        speak(`Information im neuronalen Netz gespeichert, ${currentUserName}.`);
    }
}

/* --- Kontakte --- */
function saveContact() {
    const name = contactNameInput.value.trim();
    const phone = contactPhoneInput.value.trim();
    if (name && phone) {
        savedContacts[name.toLowerCase()] = { originalName: name, phone: phone };
        setPersistentData('helfer_contacts', JSON.stringify(savedContacts));
        contactNameInput.value = '';
        contactPhoneInput.value = '';
        renderContactList();
        speak(`Kontakt ${name} wurde ins Verzeichnis aufgenommen.`);
    }
}

function deleteContact(key) {
    delete savedContacts[key];
    setPersistentData('helfer_contacts', JSON.stringify(savedContacts));
    renderContactList();
}

function renderContactList() {
    if (!contactListDisplay) return;
    const keys = Object.keys(savedContacts);
    contactListDisplay.innerHTML = keys.length === 0 ? 'Keine Kontakte.' : keys.map(k => `<div class="flex justify-between items-center bg-black p-2 rounded border border-[rgba(93,209,255,.2)] my-1"><span>${savedContacts[k].originalName}:${savedContacts[k].phone}</span><button onclick="playUiBeep(); deleteContact('${k}')" class="text-[#49d7ff] font-bold">Löschen</button></div>`).join('');
}

/* --- Löschen --- */
function deleteTodoEntry(id) {
    todoEntries = todoEntries.filter(e => e.id !== id);
    setPersistentData('helfer_todo_entries', JSON.stringify(todoEntries));
    renderAllLists();
    speak("Als erledigt markiert, Sir.");
}

function deleteShoppingEntry(id) {
    shoppingEntries = shoppingEntries.filter(e => e.id !== id);
    setPersistentData('helfer_shopping', JSON.stringify(shoppingEntries));
    renderAllLists();
    speak("Aus der Einkaufsliste gestrichen.");
}

function deleteMemoryItem(key) {
    delete memoryItems[key];
    setPersistentData('helfer_memory', JSON.stringify(memoryItems));
    renderAllLists();
    speak("Eintrag aus dem Gedächtnis gelöscht.");
}

function clearAllMemory() {
    memoryItems = {};
    localStorage.removeItem('helfer_memory');
    renderAllLists();
    speak("Das neuronale Gedächtnis wurde vollständig bereinigt.");
}
