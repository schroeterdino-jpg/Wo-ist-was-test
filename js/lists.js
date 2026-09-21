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

/* Gleicher Gegenstand mit angehängtem "ort" ("schlüsselort" = "schlüssel"): Der alte Eintrag wird ersetzt,
   statt doppelt im Gedächtnis zu bleiben. */
function removeKeyVariants(newKey) {
    const b = normalizeKey(newKey);
    if (!b) return;
    Object.keys(memoryItems).forEach(k => {
        const a = normalizeKey(k);
        if (k !== newKey && (a === b + 'ort' || b === a + 'ort')) delete memoryItems[k];
    });
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
        removeKeyVariants(key);
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
    setHtmlIfChanged(contactListDisplay, keys.length === 0 ? 'Keine Kontakte.' : keys.map(k => `<div class="flex justify-between items-center bg-black p-2 rounded border border-[rgba(93,209,255,.2)] my-1"><span>${savedContacts[k].originalName}:${savedContacts[k].phone}</span><button onclick="playUiBeep(); deleteContact('${k}')" class="text-[#49d7ff] font-bold">Löschen</button></div>`).join(''));
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
    setPersistentData('helfer_memory', '{}');
    renderAllLists();
    speak("Das neuronale Gedächtnis wurde vollständig bereinigt.");
}

/* --- Briefing-Wünsche: Dinge, die im Tages-Briefing immer genannt werden sollen --- */
function saveBriefingWishes() {
    setPersistentData('helfer_briefing_wishes', JSON.stringify(briefingWishes));
}

/* type 'text': freier Hinweis ("Denken Sie an Ihre Tabletten.")
   type 'item': Begriff aus dem Gedächtnis, der immer mit seinem Platz genannt wird */
function addBriefingWish(type, text, id) {
    const clean = String(text || '').trim();
    const norm = normalizeKey(clean);
    if (!norm) return false;
    if (briefingWishes.some(w => w.type === type && normalizeKey(w.text) === norm)) return false;
    briefingWishes.push({ id: id || Date.now(), type, text: clean });
    saveBriefingWishes();
    renderAllLists();
    return true;
}

function addManualBriefingWish() {
    const inputEl = document.getElementById('manualBriefingInput');
    if (!inputEl) return;
    const val = inputEl.value.trim();
    if (val) {
        addBriefingWish('text', val, Date.now());
        inputEl.value = '';
        speak(`Wird im Briefing berücksichtigt, ${currentUserName}.`);
    }
}

function deleteBriefingWish(id) {
    briefingWishes = briefingWishes.filter(w => w.id !== id);
    saveBriefingWishes();
    renderAllLists();
    speak("Aus dem Briefing gestrichen.");
}

/* Löscht alle Wünsche, die zum Suchbegriff passen. Gibt die Anzahl zurück (0 = nichts gefunden). */
function deleteBriefingWishesByQuery(query) {
    const q = normalizeKey(query);
    if (!q) return 0;
    const before = briefingWishes.length;
    briefingWishes = briefingWishes.filter(w => {
        const t = normalizeKey(w.text);
        return !(t.includes(q) || q.includes(t));
    });
    const removed = before - briefingWishes.length;
    if (removed > 0) {
        saveBriefingWishes();
        renderAllLists();
    }
    return removed;
}

/* --- Allgemeines Bearbeiten der Listen per Sprache (Aktion "list_edit") --- */

/* Fehler mit einem Satz, den J.A.R.V.I.S. dem User wörtlich sagen kann */
function userError(message) {
    const err = new Error(message);
    err.userMessage = message;
    return err;
}

const LIST_PLACE = {
    einkauf: 'auf der Einkaufsliste',
    aufgaben: 'auf der Aufgabenliste',
    gedaechtnis: 'im Gedächtnis',
    kontakte: 'in den Kontakten'
};

/* Findet Einträge zu einem Suchbegriff: erst exakte Treffer, sonst Einträge, die den Begriff enthalten.
   Bei mehreren ungenauen Treffern wird nichts geändert, sondern nachgefragt. */
function resolveListTargets(entries, query, place) {
    const q = normalizeKey(query);
    const exact = q ? entries.filter(e => normalizeKey(e.text) === q) : [];
    if (exact.length > 0) return exact;
    const partial = q ? entries.filter(e => normalizeKey(e.text).includes(q)) : [];
    if (partial.length === 0) throw userError(`„${query}" habe ich ${place} nicht gefunden.`);
    if (partial.length > 1) {
        throw userError(`Zu „${query}" gibt es mehrere Einträge: ${partial.map(e => e.text).join(', ')}. Welchen meinen Sie?`);
    }
    return partial;
}

function executeListEdit(action, ctx) {
    const list = String(action.list_name || '').toLowerCase().trim();
    const op = String(action.list_op || '').toLowerCase().trim();
    const rawItems = Array.isArray(action.list_items) ? action.list_items : (action.list_items ? [action.list_items] : []);
    const items = rawItems.map(i => String(i).trim()).filter(Boolean);
    const newValue = String(action.list_new_value || '').trim();

    if (!LIST_PLACE[list]) throw userError('Diese Liste kenne ich nicht.');
    if (!['add', 'remove', 'clear', 'replace'].includes(op)) throw userError('Diese Änderung kenne ich nicht.');
    const place = LIST_PLACE[list];

    /* ---------- Einkauf & Aufgaben (Listen aus { id, text }) ---------- */
    if (list === 'einkauf' || list === 'aufgaben') {
        const isShop = list === 'einkauf';
        const getEntries = () => isShop ? shoppingEntries : todoEntries;
        const setEntries = (arr) => { if (isShop) shoppingEntries = arr; else todoEntries = arr; };
        const persist = () => setPersistentData(isShop ? 'helfer_shopping' : 'helfer_todo_entries', JSON.stringify(getEntries()));

        if (op === 'clear') {
            setEntries([]);
        } else if (op === 'add') {
            if (items.length === 0) throw userError('Mir fehlt, was ich hinzufügen soll.');
            items.forEach(text => {
                const exists = getEntries().some(e => normalizeKey(e.text) === normalizeKey(text));
                if (exists) return;
                const entry = { id: Date.now() + ctx.counter++, text };
                if (!isShop) entry.createdDate = 'Per Sprache';
                getEntries().unshift(entry);
            });
        } else if (op === 'remove') {
            if (items.length === 0) throw userError('Mir fehlt, was ich entfernen soll.');
            const done = [], problems = [];
            items.forEach(query => {
                try {
                    const targets = resolveListTargets(getEntries(), query, place);
                    setEntries(getEntries().filter(e => !targets.some(t => t.id === e.id)));
                    done.push(targets[0].text);
                } catch (err) {
                    problems.push(err.userMessage || String(err.message));
                }
            });
            persist();
            renderAllLists();
            if (problems.length > 0) {
                throw userError((done.length ? `Entfernt habe ich: ${done.join(', ')}. ` : '') + problems.join(' '));
            }
            return;
        } else if (op === 'replace') {
            if (items.length === 0 || !newValue) throw userError('Mir fehlt, was ich ändern und wie es heißen soll.');
            const targets = resolveListTargets(getEntries(), items[0], place);
            targets.forEach(t => { t.text = newValue; });
        }
        persist();
        renderAllLists();
        return;
    }

    /* ---------- Gedächtnis (Begriff -> Wert) ---------- */
    if (list === 'gedaechtnis') {
        if (op === 'clear') throw userError('Das komplette Gedächtnis leere ich nur über den Knopf im Gedächtnis-Tab.');
        const keys = () => Object.keys(memoryItems).map(k => ({ text: k }));
        if (op === 'add' || op === 'replace') {
            if (items.length === 0 || !newValue) throw userError('Mir fehlt der Begriff oder der Wert fürs Gedächtnis.');
            let key = items[0].toLowerCase();
            if (op === 'replace') key = resolveListTargets(keys(), items[0], place)[0].text;
            removeKeyVariants(key);
            memoryItems[key] = newValue;
        } else if (op === 'remove') {
            if (items.length === 0) throw userError('Mir fehlt, was ich aus dem Gedächtnis löschen soll.');
            const done = [], problems = [];
            items.forEach(query => {
                try {
                    const targets = resolveListTargets(keys(), query, place);
                    targets.forEach(t => { delete memoryItems[t.text]; });
                    done.push(targets[0].text);
                } catch (err) {
                    problems.push(err.userMessage || String(err.message));
                }
            });
            setPersistentData('helfer_memory', JSON.stringify(memoryItems));
            renderAllLists();
            if (problems.length > 0) {
                throw userError((done.length ? `Gelöscht habe ich: ${done.join(', ')}. ` : '') + problems.join(' '));
            }
            return;
        }
        setPersistentData('helfer_memory', JSON.stringify(memoryItems));
        renderAllLists();
        return;
    }

    /* ---------- Kontakte (Name -> Nummer) ---------- */
    if (list === 'kontakte') {
        if (op === 'clear') throw userError('Alle Kontakte auf einmal lösche ich nicht per Sprache.');
        const names = () => Object.keys(savedContacts).map(k => ({ text: savedContacts[k].originalName, key: k }));
        if (op === 'add') {
            if (items.length === 0 || !newValue) throw userError('Mir fehlt der Name oder die Telefonnummer.');
            savedContacts[items[0].toLowerCase()] = { originalName: items[0], phone: newValue };
        } else if (op === 'replace') {
            if (items.length === 0 || !newValue) throw userError('Mir fehlt der Name oder die neue Telefonnummer.');
            const t = resolveListTargets(names(), items[0], place)[0];
            savedContacts[t.key].phone = newValue;
        } else if (op === 'remove') {
            if (items.length === 0) throw userError('Mir fehlt, welchen Kontakt ich löschen soll.');
            const t = resolveListTargets(names(), items[0], place)[0];
            delete savedContacts[t.key];
        }
        setPersistentData('helfer_contacts', JSON.stringify(savedContacts));
        renderContactList();
    }
}
