/* ============================================================
   ANFLUG: Wie bei Google Earth in einen Ort hineinfliegen.
   "Zeig mir, was in Hamburg los ist": Die Weltkugel dreht sich auf Hamburg und fährt näher heran (wie bisher). Dann blendet sie in die Neon-Karte
   (leuchtende Straßen, dieselbe wie im Karte-Fenster) über, die weiter in die Stadt hineinfliegt, bis du Straßen und Stadtteile siehst.
   Die Karte lässt sich mit dem Finger verschieben und zoomen. "🌍 Zurück zur Kugel" (oder "Zoom raus") bringt dich wieder zur Kugel;
   die Meldungen bleiben die ganze Zeit unter dem Bild.
   Wie weit die Karte heranfliegt, bestimmt die Ausdehnung des Ortes (Nominatim-Rahmen): Stadt = Straßenebene, Bundesland oder Region = weiter draußen.
   Ganze Länder und Kontinente (Rahmen über 12 Grad) bleiben auf der Kugel.
   Hängt sich in panels.js ein (weltFlyTo, weltResetLive, weltDestroy), ohne sie zu ändern. Braucht: panels.js (ensureMapLibre, loadOfmBase, buildHudStyle,
   injectHudMapStyles, weltGlobe, isPanelOpen, currentPanel), apiFetch. Fehlt etwas oder klappt etwas nicht, bleibt es einfach bei der Kugel.
   Ein-/Ausschalten: Einstellungen > Weltkugel oder per Sprache ("Anflug aus" / "Anflug an").
   ============================================================ */

const ANFLUG_ON_KEY = 'helfer_anflug';
const ANFLUG_MAX_SPAN_DEG = 12;        // Orte mit größerem Rahmen (Länder, Kontinente) bleiben auf der Kugel
const ANFLUG_START_DELAY_MS = 1700;    // so lange fliegt zuerst die Kugel (ihr Flug dauert 2,2 Sekunden), dann blendet die Karte ein
const ANFLUG_FLIGHT_MS = 3400;         // Dauer des Flugs in die Karte
const ANFLUG_FADE_MS = 800;
const ANFLUG_MAX_ZOOM = 12.5;
const ANFLUG_FALLBACK_ZOOM = 11;       // wenn der Ort keinen Rahmen liefert
const ANFLUG_MATCH_KM = 80;            // der gefundene Ort muss so nah am Ziel der Kugel liegen, sonst wird sein Rahmen ignoriert

let anflugToken = 0;
let anflugEl = null;
let anflugMap = null;
let anflugGlobePaused = false;
let anflugLast = null;                 // { lat, lng } für den Rückweg zur Kugel

function anflugEnabled() { return getPersistentData(ANFLUG_ON_KEY, '1') !== '0'; }
function anflugSleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function anflugKm(lat1, lon1, lat2, lon2) {
    const R = 6371, rad = x => x * Math.PI / 180;
    const a = Math.sin(rad(lat2 - lat1) / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(rad(lon2 - lon1) / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
function anflugStillWelt() { return typeof isPanelOpen === 'function' && isPanelOpen() && currentPanel && currentPanel.name === 'welt'; }

/* Rahmen des Ortes: { west, south, east, north, span } oder null (dann gilt die feste Zoomstufe) */
async function anflugBBox(name, lat, lng) {
    try {
        const q = String(name || '').trim();
        if (!q || typeof apiFetch !== 'function') return null;
        const r = await Promise.race([apiFetch('/api/geocode?q=' + encodeURIComponent(q)), new Promise((_, rej) => setTimeout(() => rej(new Error('Zeitüberschreitung')), 8000))]);
        if (!r.ok) return null;
        const d = await r.json();
        const hit = Array.isArray(d) ? d[0] : null;
        if (!hit || !Array.isArray(hit.boundingbox) || hit.boundingbox.length < 4) return null;
        const [south, north, west, east] = hit.boundingbox.map(Number);
        if ([south, north, west, east].some(v => !isFinite(v))) return null;
        if (isFinite(Number(hit.lat)) && isFinite(Number(hit.lon)) && anflugKm(lat, lng, Number(hit.lat), Number(hit.lon)) > ANFLUG_MATCH_KM) return null;   // anderer Ort gefunden als der, zu dem die Kugel fliegt
        return { west, south, east, north, span: Math.max(north - south, east - west) };
    } catch (e) { return null; }
}

function anflugStyles() {
    if (document.getElementById('anflugStyles')) return;
    const st = document.createElement('style');
    st.id = 'anflugStyles';
    st.textContent =
        '.anflug-wrap{position:absolute;inset:0;z-index:5;opacity:0;transition:opacity ' + (ANFLUG_FADE_MS / 1000) + 's ease;background:#020a12}' +
        '.anflug-wrap #anflugMap{position:absolute;inset:0}' +
        '#anflugMap .maplibregl-canvas{outline:none}' +
        '#anflugMap .maplibregl-ctrl-attrib{background:rgba(0,0,0,.55);color:#5d7e91;font-size:9px}#anflugMap .maplibregl-ctrl-attrib a{color:#5d7e91}' +
        '#anflugMap .maplibregl-popup-content{background:rgba(0,12,24,.94);color:#cfefff;border:1px solid rgba(73,215,255,.5);border-radius:8px;padding:6px 11px;font-size:12px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}' +
        '#anflugMap .maplibregl-popup-tip{border-top-color:rgba(0,12,24,.94)!important;border-bottom-color:rgba(0,12,24,.94)!important}' +
        '.anflug-back{position:absolute;top:10px;left:10px;z-index:7;border:1px solid rgba(73,215,255,.7);color:#49d7ff;border-radius:999px;padding:7px 14px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;background:rgba(0,10,20,.9);box-shadow:0 0 14px rgba(73,215,255,.4);-webkit-tap-highlight-color:transparent}' +
        '.anflug-wrap::after{content:"";position:absolute;inset:0;z-index:1;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(73,215,255,.03) 0,rgba(73,215,255,.03) 1px,transparent 1px,transparent 3px),radial-gradient(ellipse at center,transparent 60%,rgba(0,8,16,.5) 100%)}';
    document.head.appendChild(st);
}

function anflugGlobeResume() {
    if (anflugGlobePaused) {
        try { if (typeof weltGlobe !== 'undefined' && weltGlobe && typeof weltGlobe.resumeAnimation === 'function') weltGlobe.resumeAnimation(); } catch (e) {}
        anflugGlobePaused = false;
    }
}

/* Karte sofort entfernen (Ort wechselt, Fenster schließt, Anflug aus) */
function anflugCloseNow() {
    anflugToken++;
    if (anflugMap) { try { anflugMap.remove(); } catch (e) {} anflugMap = null; }
    if (anflugEl) { try { anflugEl.remove(); } catch (e) {} anflugEl = null; }
    anflugGlobeResume();
}

/* "Zurück zur Kugel": Karte blendet aus, die Kugel läuft wieder und zeigt den Ort */
function anflugBack() {
    if (!anflugEl) return false;
    const el = anflugEl, map = anflugMap, token = ++anflugToken;
    anflugEl = null; anflugMap = null;
    el.style.opacity = '0';
    anflugGlobeResume();
    try { if (anflugLast && typeof weltGlobe !== 'undefined' && weltGlobe) weltGlobe.pointOfView({ lat: anflugLast.lat, lng: anflugLast.lng, altitude: 1.5 }, 1200); } catch (e) {}
    setTimeout(() => { try { if (map) map.remove(); } catch (e) {} try { el.remove(); } catch (e) {} }, ANFLUG_FADE_MS + 100);
    return true;
}

async function anflugStart(lat, lng, name) {
    if (!anflugEnabled() || !anflugStillWelt()) return;
    anflugCloseNow();
    const my = anflugToken;
    const t0 = Date.now();
    anflugLast = { lat, lng };
    const wrap = document.querySelector('.hud-globe-wrap');
    if (!wrap) return;
    const ok = () => my === anflugToken && anflugStillWelt();

    // Alles Nötige gleichzeitig vorbereiten, während die Kugel noch fliegt
    let base = null;
    const [bbox, libOk] = await Promise.all([
        anflugBBox(name, lat, lng),
        ensureMapLibre().then(() => true).catch(() => false),
        loadOfmBase().then(b => { base = b; }).catch(() => {})
    ]).then(r => [r[0], r[1]]);
    if (!ok() || !libOk || !base || typeof maplibregl === 'undefined') return;
    if (bbox && bbox.span > ANFLUG_MAX_SPAN_DEG) return;   // Land oder Kontinent: bleibt auf der Kugel

    // Erst überblenden, wenn die Kugel ihren Flug beendet hat
    const wait = ANFLUG_START_DELAY_MS - (Date.now() - t0);
    if (wait > 0) await anflugSleep(wait);
    if (!ok()) return;

    anflugStyles();
    try { injectHudMapStyles(); } catch (e) {}
    const el = document.createElement('div');
    el.className = 'anflug-wrap';
    const mapDiv = document.createElement('div');
    mapDiv.id = 'anflugMap';
    el.appendChild(mapDiv);
    const back = document.createElement('button');
    back.type = 'button';
    back.className = 'anflug-back';
    back.textContent = '🌍 Zurück zur Kugel';
    back.addEventListener('click', () => { try { playUiBeep(); } catch (e) {} anflugBack(); });
    el.appendChild(back);
    wrap.appendChild(el);
    anflugEl = el;

    let map;
    try {
        map = new maplibregl.Map({
            container: mapDiv, style: buildHudStyle(base), center: [lng, lat], zoom: 2.6,
            attributionControl: false, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0
        });
        map.addControl(new maplibregl.AttributionControl({ compact: true }));
        map.touchZoomRotate.disableRotation();
    } catch (e) {
        console.error('Anflug: Karte konnte nicht gestartet werden', e);
        anflugCloseNow();
        return;
    }
    anflugMap = map;

    let started = false;
    const go = () => {
        if (started || !ok() || anflugMap !== map) return;
        started = true;
        try { map.resize(); } catch (e) {}
        requestAnimationFrame(() => { el.style.opacity = '1'; });
        // Die Kugel pausiert, sobald die Karte sichtbar ist (spart Akku, zwei 3D-Ansichten gleichzeitig wären zu viel)
        setTimeout(() => {
            if (!ok() || anflugMap !== map) return;
            try { if (typeof weltGlobe !== 'undefined' && weltGlobe && typeof weltGlobe.pauseAnimation === 'function') { weltGlobe.pauseAnimation(); anflugGlobePaused = true; } } catch (e) {}
        }, ANFLUG_FADE_MS + 150);
        try {
            if (bbox) {
                const bounds = new maplibregl.LngLatBounds([bbox.west, bbox.south], [bbox.east, bbox.north]);
                map.fitBounds(bounds, { padding: 28, maxZoom: ANFLUG_MAX_ZOOM, duration: ANFLUG_FLIGHT_MS, curve: 1.5, essential: true });
            } else {
                map.flyTo({ center: [lng, lat], zoom: ANFLUG_FALLBACK_ZOOM, duration: ANFLUG_FLIGHT_MS, curve: 1.5, essential: true });
            }
            map.once('moveend', () => {
                if (!ok() || anflugMap !== map) return;
                try {
                    const dot = document.createElement('div'); dot.className = 'hud-dest'; dot.textContent = '◎';
                    const holder = document.createElement('div'); holder.appendChild(dot);
                    const mk = new maplibregl.Marker({ element: holder, anchor: 'center' }).setLngLat([lng, lat]);
                    mk.setPopup(new maplibregl.Popup({ offset: 16, closeButton: false, closeOnClick: false }).setText(String(name || '')));
                    mk.addTo(map);
                    mk.togglePopup();
                } catch (e) {}
            });
        } catch (e) { console.error('Anflug: Flug fehlgeschlagen', e); }
    };
    map.once('load', go);
    setTimeout(() => { if (!started && ok() && anflugMap === map) anflugCloseNow(); }, 15000);   // Karte lädt nicht: bei der Kugel bleiben
}

/* ---------- Sprachbefehle ---------- */
function handleAnflugCommand(text) {
    const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!t || t.length > 50) return false;
    const say = (m) => speak(m, typeof continueConversation === 'function' ? continueConversation : undefined);
    if (anflugEl && /^(?:zurück zur (?:weltkugel|kugel|erde)|zeig(?:e)? (?:mir )?(?:die )?(?:weltkugel|kugel|erde) (?:wieder|zurück)|zoom(?:e)? (?:wieder )?raus|rauszoomen|raus zoomen|aus der karte raus)$/.test(t)) {
        anflugBack();
        return true;
    }
    if (/^(?:schalte? )?(?:den )?anflug (?:auf städte |in die stadt )?(?:aus|ab|deaktivieren|abschalten)$/.test(t) || /^(?:kein|ohne) anflug(?: mehr)?$/.test(t)) {
        setPersistentData(ANFLUG_ON_KEY, '0');
        try { const c = document.getElementById('anflugToggle'); if (c) c.checked = false; } catch (e) {}
        say('Gut, die Weltkugel bleibt künftig auf der Kugel, ohne Anflug in die Stadtkarte.');
        return true;
    }
    if (/^(?:schalte? )?(?:den )?anflug (?:auf städte |in die stadt )?(?:an|ein|aktivieren|einschalten)$/.test(t)) {
        setPersistentData(ANFLUG_ON_KEY, '1');
        try { const c = document.getElementById('anflugToggle'); if (c) c.checked = true; } catch (e) {}
        say('Der Anflug in die Stadtkarte ist wieder eingeschaltet.');
        return true;
    }
    return false;
}

/* ---------- Einhängen in die Weltkugel (panels.js) und Einstellungen ---------- */
(function hookAnflug() {
    try {
        if (typeof weltFlyTo === 'function') {
            const o = weltFlyTo;
            weltFlyTo = function (lat, lng, name) { const r = o.apply(this, arguments); anflugStart(Number(lat), Number(lng), name).catch(() => {}); return r; };
        }
        if (typeof weltResetLive === 'function') {
            const o = weltResetLive;
            weltResetLive = function () { anflugCloseNow(); return o.apply(this, arguments); };
        }
        if (typeof weltDestroy === 'function') {
            const o = weltDestroy;
            weltDestroy = function () { anflugCloseNow(); return o.apply(this, arguments); };
        }
    } catch (e) { /* ohne Anflug funktioniert die Weltkugel wie bisher */ }
    try {
        const c = document.getElementById('anflugToggle');
        if (c) { c.checked = anflugEnabled(); c.addEventListener('change', () => setPersistentData(ANFLUG_ON_KEY, c.checked ? '1' : '0')); }
    } catch (e) {}
})();
