/* ============================================================
   FOTO MIT ADRESSE -> NAVIGATION: Plakat, Flyer, Einladung, Brief, Schild oder Zettel fotografieren, Jarvis liest die Adresse
   und startet auf Wunsch die Route (Google Maps, Start ist dein Standort, Auto).
   Aufrufen:
   - vorher: "Navigiere zu der Adresse auf diesem Foto", "Bring mich zu der Adresse auf dem Plakat", "Fotografiere die Adresse und bring mich hin"
   - danach: Foto machen (📷 oder 📁), dann "Bring mich dorthin", "Navigiere dorthin" oder auf die Karte "Dorthin navigieren" tippen
   Ablauf: Jarvis liest die Adresse vor und zeigt sie als Karte (bei mehreren Adressen auf dem Foto jeweils eine). "Ja" oder ein Tipp auf die Karte
   startet die Route; "Nein" verwirft. Eine KI kann Handschrift und Hausnummern falsch lesen, darum wird erst nach deinem OK gestartet.
   Hängt sich in photo.js ein (ohne es zu verändern) und muss danach geladen werden. Benutzt dessen Teile: askVision, photoJsonObject,
   photoPending, lastPhoto, runLastPhotoTask, photoSay. Fehlt photo.js, tut diese Datei nichts.
   ============================================================ */
(function () {
    if (typeof window.processPhoto !== 'function' || typeof window.parsePhotoRequest !== 'function') return;

    const MAPS_URL = 'https://www.google.com/maps/dir/?api=1&travelmode=driving&destination=';

    function say(msg) {
        if (typeof photoSay === 'function') photoSay(msg);
        else speak(msg, typeof continueConversation === 'function' ? continueConversation : undefined);
    }
    function cards(list) {
        try {
            if (typeof clearActionCards === 'function') clearActionCards();
            if (typeof showActionCards === 'function') showActionCards(list);
        } catch (e) {}
    }

    /* ---------- Sprachbefehle erkennen ---------- */
    const NAV_WORD = /(navigier\w*|bring mich|fahr\w*|\broute\b|wie komme ich|hinkommen|\bhin\b|dorthin|dahin)/;
    const PHOTO_WORD = /\b(foto|bild|aufnahme|kamera|fotografier\w*|abfotografier\w*)\b|\bauf (?:dem|diesem|dieser|den) (?:plakat|flyer|zettel|brief|schild|aushang|visitenkarte|einladung|karte)\b|\bvon (?:diesem|dieser|dem|der) (?:plakat|flyer|zettel|brief|schild|aushang|visitenkarte|einladung|karte)\b/;

    function norm(text) { return String(text || '').toLowerCase().replace(/[?!.,;:]+/g, ' ').replace(/\s+/g, ' ').trim(); }

    function isAddressRequest(text) {
        const t = norm(text);
        return !!t && t.length <= 110 && NAV_WORD.test(t) && PHOTO_WORD.test(t);
    }
    function isAddressFollowup(text) {
        const t = norm(text);
        if (!t || t.length > 70) return false;
        if (/\b(dorthin|dahin|da hin|dort hin)\b/.test(t) && /(navigier\w*|bring mich|fahr\w*|\broute\b|wie komme ich|hinkommen|komme)/.test(t)) return true;
        if (/^(?:jarvis )?navigier\w*(?: mich)?(?: bitte)?$/.test(t)) return true;
        if (/\b(?:zu|zur|zu der|zu dieser) (?:dieser )?adresse\b/.test(t) && NAV_WORD.test(t)) return true;
        return false;
    }

    /* ---------- Einhängen in photo.js ---------- */
    const origParse = window.parsePhotoRequest;
    window.parsePhotoRequest = function (text) {
        if (isAddressRequest(text)) return { task: 'address', question: norm(text) };
        return origParse.apply(this, arguments);
    };

    if (typeof window.parseFollowupTask === 'function') {
        const origFollow = window.parseFollowupTask;
        window.parseFollowupTask = function (text) {
            if (isAddressFollowup(text)) return { task: 'address' };
            return origFollow.apply(this, arguments);
        };
    }

    const origProcess = window.processPhoto;
    window.processPhoto = async function (intent, dataUrl) {
        if (intent && intent.task === 'address') return processAddressPhoto(dataUrl);
        return origProcess.apply(this, arguments);
    };

    if (typeof window.confirmPhotoPending === 'function') {
        const origConfirm = window.confirmPhotoPending;
        window.confirmPhotoPending = async function () {
            if (typeof photoPending !== 'undefined' && photoPending && photoPending.type === 'address') {
                const lifetime = typeof PHOTO_EVENTS_MS !== 'undefined' ? PHOTO_EVENTS_MS : 5 * 60000;
                if (Date.now() - photoPending.at > lifetime) { photoPending = null; say('Es gibt gerade nichts zu starten.'); return; }
                startNavigation(0);
                return;
            }
            return origConfirm.apply(this, arguments);
        };
    }

    /* Zusätzliche Wörter für "Ja", solange eine Adresse wartet: "Navigieren", "Route starten", "Fahr los" */
    if (typeof window.handlePhotoCommand === 'function') {
        const origCmd = window.handlePhotoCommand;
        window.handlePhotoCommand = function (text) {
            try {
                if (typeof photoPending !== 'undefined' && photoPending && photoPending.type === 'address') {
                    const t = norm(text);
                    if (/^(?:jarvis )?(?:navigier\w*|route starten|starte? (?:die )?(?:route|navigation)|bring mich hin|fahr mich hin|fahr los|los geht s|start|starten)$/.test(t)) {
                        window.confirmPhotoPending().catch(() => say('Die Navigation konnte ich nicht starten.'));
                        return true;
                    }
                }
            } catch (e) {}
            return origCmd.apply(this, arguments);
        };
    }

    /* Auswahlkarten nach dem Foto (wenn vorher nichts gesagt wurde): "Dorthin navigieren" ergänzen */
    if (typeof window.photoAskWhatToDo === 'function') {
        window.photoAskWhatToDo = function () {
            cards([
                { icon: '🛒', title: 'Auf die Einkaufsliste', subtitle: 'Zettel lesen, Artikel eintragen', onclick: "runLastPhotoTask('shopping')" },
                { icon: '📅', title: 'Termine eintragen', subtitle: 'Kalender, Plakat, Einladung', onclick: "runLastPhotoTask('events')" },
                { icon: '📍', title: 'Dorthin navigieren', subtitle: 'Adresse lesen, Route starten', onclick: "runLastPhotoTask('address')" },
                { icon: '👤', title: 'Kontakt anlegen', subtitle: 'Visitenkarte', onclick: "runLastPhotoTask('contact')" },
                { icon: '🔤', title: 'Vorlesen / übersetzen', subtitle: 'Text auf dem Foto', onclick: "runLastPhotoTask('read')" },
                { icon: '🔍', title: 'Beschreiben', subtitle: 'Was ist zu sehen?', onclick: "runLastPhotoTask('describe')" }
            ]);
            say('Das Foto ist da. Was soll ich damit tun?');
        };
    }

    /* ---------- Adresse lesen ---------- */
    function addressPrompt() {
        return 'Du liest von einem Foto die Adresse, zu der jemand hinfahren möchte. Antworte NUR mit einem JSON-Objekt: ' +
            '{"orte":[{"name":"Name des Ortes oder der Firma oder null","adresse":"Straße Hausnummer, PLZ Ort oder null","unsicher":true oder false}]}. ' +
            'Höchstens 3 Einträge, der wichtigste zuerst: der Ort, zu dem man hinfahren soll (Veranstaltungsort, Geschäft, Praxis, Treffpunkt). ' +
            'Bei einem Brief ist es die Absenderadresse, nicht die Adresse des Empfängers. Steht nur eine Straße ohne Ort, lasse den Ort weg. ' +
            'Erfinde nichts und ergänze keine Hausnummer oder Postleitzahl, die nicht dasteht. Ist etwas schwer lesbar, setze "unsicher" auf true. ' +
            'Ist keine Adresse erkennbar, gib eine leere Liste zurück.';
    }

    function parseAddresses(content) {
        const obj = typeof photoJsonObject === 'function' ? photoJsonObject(content) : null;
        const list = obj && Array.isArray(obj.orte) ? obj.orte : [];
        const clean = v => (v == null || String(v).trim().toLowerCase() === 'null') ? '' : String(v).trim();
        const out = [], seen = new Set();
        list.forEach(o => {
            if (!o || typeof o !== 'object') return;
            const name = clean(o.name).slice(0, 60), adresse = clean(o.adresse).slice(0, 120);
            const dest = adresse || name;
            if (dest.length < 4) return;
            const key = dest.toLowerCase();
            if (seen.has(key)) return;
            seen.add(key);
            out.push({ name, adresse, dest, unsicher: !!o.unsicher });
        });
        return out.slice(0, 3);
    }

    async function processAddressPhoto(dataUrl) {
        try {
            const content = await askVision(addressPrompt(), 'Lies die Adresse von diesem Foto.', dataUrl, true);
            const list = parseAddresses(content);
            if (!list.length) { say('Ich konnte auf dem Foto keine Adresse erkennen. Ist sie scharf und gut zu lesen?'); return; }
            photoPending = { type: 'address', data: list, at: Date.now() };
            showAddressCards();
            const first = list[0];
            const what = first.name && first.adresse ? `${first.name}, ${first.adresse}` : first.dest;
            const more = list.length > 1 ? ` Auf dem Foto steht noch ${list.length === 2 ? 'eine weitere Adresse' : (list.length - 1) + ' weitere Adressen'}, sie stehen unten.` : '';
            say(`Ich habe gelesen: ${what}.${first.unsicher ? ' Bei der Schreibweise bin ich nicht sicher.' : ''}${more} Soll ich die Route starten? Sagen Sie Ja, oder tippen Sie unten auf die Karte.`);
        } catch (e) {
            console.error('Adresse aus Foto fehlgeschlagen:', e && e.message);
            const m = String((e && e.message) || 'unbekannter Fehler');
            cards([{ icon: '⚠️', title: 'Foto-Auswertung: Fehler der KI-Verbindung', subtitle: m.slice(0, 220) }]);
            say('Die Auswertung des Fotos hat gerade nicht geklappt. Den Grund sehen Sie unten auf der Karte.');
        }
    }

    function showAddressCards() {
        if (typeof photoPending === 'undefined' || !photoPending || photoPending.type !== 'address') return;
        cards(photoPending.data.map((c, i) => ({
            icon: i === 0 ? '📍' : '📌',
            title: c.name || c.adresse,
            subtitle: (c.name && c.adresse ? c.adresse : 'Dorthin navigieren') + (c.unsicher ? ' · ⚠️ bitte prüfen' : '') + ' · Tippen: Route starten',
            onclick: `photoNavigate(${i})`
        })));
    }

    /* ---------- Route starten ---------- */
    function startNavigation(i) {
        const pend = typeof photoPending !== 'undefined' ? photoPending : null;
        const c = pend && pend.type === 'address' && pend.data[i];
        if (!c) { say('Ich habe gerade keine Adresse, zu der ich navigieren könnte.'); return false; }
        const url = MAPS_URL + encodeURIComponent(c.dest);
        let opened = null;
        try { opened = window.open(url, '_blank'); } catch (e) { opened = null; }
        if (opened) {
            photoPending = null;
            cards([]);
            say('Ich öffne die Route.');
            return true;
        }
        // Blockiert der Browser das automatische Öffnen (kein Fingertipp), bleibt die Karte stehen: ein Tipp darauf öffnet die Route
        say('Tippen Sie unten auf die Karte, dann öffnet sich die Navigation.');
        return false;
    }

    window.photoNavigate = function (i) { startNavigation(Number(i) || 0); };
    window._fotoAdresseTest = { isAddressRequest, isAddressFollowup, parseAddresses };   // nur zum Testen
})();
