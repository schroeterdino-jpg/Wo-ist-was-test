/* ============================================================
   KOPF 3D (realistischer Kopf): Optionale Ansicht der Figur mit einem echten 3D-Kopf statt des gezeichneten.
   Das Modell "Face Cap" (vendor/facecap.glb, Bannaflak, im three.js-Projekt als Beispiel enthalten) hat 52 Gesichtsregler:
   Augen, Lider, Brauen, Wangen, Mund, Kiefer. Die Mimik, das Sprechen, das Blinzeln, den Blick und die Kopfbewegung liefert weiter js/hologramm.js,
   dieser Kopf bekommt nur die Werte. Körper, Arme, Gesten und Requisiten (Karte, Schirm ...) bleiben die gezeichneten.
   Die 3D-Bibliothek (three.js, MIT-Lizenz) liegt im Ordner vendor und wird erst beim Einschalten geladen, sonst kostet die Ansicht nichts.
   Ein-/Ausschalten per Sprache: "Realistischer Kopf an" / "Realistischer Kopf aus" (auch "3D-Kopf an/aus"). Standard: aus.
   Klappt das Laden nicht (kein WebGL, Datei fehlt), bleibt der gezeichnete Kopf.
   Braucht: hologramm.js (ruft aktiv() und draw() auf), commands.js. importmap in index.html (three -> vendor/three.module.js).
   ============================================================ */
(function () {
    const KEY = 'jv_kopf3d';
    function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
    function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
    const isOn = () => lsGet(KEY) === '1';
    const holoOn = () => document.body.classList.contains('jv-holo');

    let status = 'leer';   // leer | laedt | bereit | fehler
    let THREE = null, renderer = null, scene = null, cam = null, pivot = null, model = null, head = null, c3 = null;
    let kopfH = 3.3, kopfChinY = 0, kopfCx = 0, kopfCz = 0;
    let lw = 0, lh = 0, ldpr = 0;
    const GROESSE = 1.12;   // der 3D-Kopf wirkt neben dem breiten Körper sonst klein

    function say(m) { try { speak(m, typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }

    function aktiv() {
        if (status === 'bereit' && isOn() && holoOn()) return true;
        if (isOn() && holoOn() && status === 'leer') laden(false);
        return false;
    }

    async function laden(ansage) {   // ansage: nur wenn der User es selbst verlangt hat, sprechen; beim automatischen Laden beim Start bleibt Jarvis still
        if (status === 'laedt' || status === 'bereit') return;
        status = 'laedt';
        try {
                        THREE = await import('three');
            const { GLTFLoader } = await import('../vendor/vendor/GLTFLoader.js');
            const { KTX2Loader } = await import('../vendor/vendor/KTX2Loader.js');
            const { MeshoptDecoder } = await import('../vendor/vendor/meshopt_decoder.module.js');
            c3 = document.createElement('canvas');   // wird nicht angezeigt: hologramm.js kopiert das Bild an die richtige Stelle der Figur
            renderer = new THREE.WebGLRenderer({ canvas: c3, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
            renderer.setClearColor(0x000000, 0);
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            scene = new THREE.Scene();
            cam = new THREE.OrthographicCamera(0, 100, 100, 0, -2000, 2000);
            scene.add(new THREE.HemisphereLight(0xfff4ea, 0x3b3028, 1.25));
            const key = new THREE.DirectionalLight(0xfff0e2, 2.1); key.position.set(0.6, 0.9, 1.0); scene.add(key);
            const rim = new THREE.DirectionalLight(0x7fcfff, 0.9); rim.position.set(-1, 0.4, -0.6); scene.add(rim);
            const ktx2 = new KTX2Loader().setTranscoderPath('./vendor/vendor/').detectSupport(renderer);
            const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
            const g = await new Promise((ok, no) => loader.load('./vendor/vendor/facecap.glb', ok, undefined, no));
            model = g.scene;
            const meshes = [];
            model.traverse(o => { if (o.isMesh && o.morphTargetDictionary) meshes.push(o); });
            if (!meshes.length) throw new Error('Kein Kopf im Modell');
            head = meshes.sort((a, b) => Object.keys(b.morphTargetDictionary).length - Object.keys(a.morphTargetDictionary).length)[0];
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(head, true);   // genau, nur der Kopf (nicht Augäpfel oder Zähne, die darüber hinausragen können)
            kopfH = box.max.y - box.min.y; kopfChinY = box.min.y; kopfCx = (box.min.x + box.max.x) / 2; kopfCz = (box.min.z + box.max.z) / 2;
            // Hautton wärmer (die Textur ist grau)
            try { if (head.material) { head.material.color.setRGB(1.5, 1.08, 0.86); head.material.needsUpdate = true; } } catch (e) {}
            pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; pivot.add(model); scene.add(pivot);
            status = 'bereit';
            if (ansage && isOn()) say('Der realistische Kopf ist bereit.');
        } catch (e) {
            console.error('Kopf3D laden', e);
            status = 'fehler';
            if (ansage && isOn()) say('Den realistischen Kopf konnte ich nicht laden. Ich bleibe bei der gezeichneten Figur.');
        }
    }

    const cl = (v, a, b) => Math.max(a === undefined ? 0 : a, Math.min(b === undefined ? 1 : b, v));
    /* Werte der Figur (js/hologramm.js) -> 52 Gesichtsregler. Links/Rechts in der Figur ist aus Sicht des Betrachters, die Regler sind aus Sicht der Person: Betrachter-links = Regler _R */
    function formen(st) {
        const c = st.cur, o = {};
        const bl = cl(c.bL), br = cl(c.bR);
        o.browOuterUp_R = bl * 0.9; o.browOuterUp_L = br * 0.9;
        o.browInnerUp = cl(-c.bin * 1.5) + (bl + br) * 0.25;
        o.browDown_R = cl(c.bin * 1.3) * (1 - bl * 0.6); o.browDown_L = cl(c.bin * 1.3) * (1 - br * 0.6);
        const lid = cl(1 - (c.open * st.ek - c.sq * 0.35));
        o.eyeBlink_L = lid; o.eyeBlink_R = lid;
        const wide = cl((c.open - 1) * 1.8) * st.ek;
        o.eyeWide_L = wide; o.eyeWide_R = wide;
        const sm = (cl(c.smL, -1, 1.5) + cl(c.smR, -1, 1.5)) / 2;
        const sq = cl(c.sq * 0.9 + cl(sm) * 0.25);
        o.eyeSquint_L = sq; o.eyeSquint_R = sq;
        const gx = cl(st.gx, -1, 1), gy = cl(st.gy, -1, 1);
        if (gx > 0) { o.eyeLookOut_L = gx; o.eyeLookIn_R = gx; } else { o.eyeLookOut_R = -gx; o.eyeLookIn_L = -gx; }
        if (gy > 0) { o.eyeLookUp_L = gy; o.eyeLookUp_R = gy; } else { o.eyeLookDown_L = -gy; o.eyeLookDown_R = -gy; }
        const wob = 0.5 + 0.5 * Math.sin(st.t * 11);
        const jaw = cl(st.mo * 0.55 + st.mouthO * 0.2);
        o.jawOpen = jaw;
        o.mouthFunnel = cl(st.mouthO * 0.3 + st.mo * 0.16 * wob);
        o.mouthLowerDown_L = o.mouthLowerDown_R = jaw * 0.3;
        o.mouthUpperUp_L = o.mouthUpperUp_R = st.mo * 0.12;
        o.mouthSmile_R = cl(c.smL); o.mouthFrown_R = cl(-c.smL);
        o.mouthSmile_L = cl(c.smR); o.mouthFrown_L = cl(-c.smR);
        o.cheekSquint_L = o.cheekSquint_R = cl(sm) * 0.5;
        o.mouthStretch_L = o.mouthStretch_R = cl((c.mw - 1) * 0.5);
        o.mouthPucker = cl((1 - c.mw) * 0.5);
        return o;
    }

    function draw(st) {
        if (status !== 'bereit') return null;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        if (st.W !== lw || st.H !== lh || dpr !== ldpr) {
            lw = st.W; lh = st.H; ldpr = dpr;
            renderer.setPixelRatio(dpr); renderer.setSize(st.W, st.H, false);
            cam.left = 0; cam.right = st.W; cam.top = st.H; cam.bottom = 0; cam.updateProjectionMatrix();
        }
        // Maßstab: der gezeichnete Kopf ist HH hoch, der 3D-Kopf soll gleich hoch sein. K0 = mittlere Perspektive der gezeichneten Figur
        const K0 = 0.76;
        const px = st.sc * K0;                       // Pixel je Figur-Einheit
        const s = px * (st.HH / kopfH) * GROESSE;     // Pixel je Modell-Einheit
        // Drehpunkt: unter dem Kinn (wie beim gezeichneten Kopf)
        const pivX = st.ox, pivY = st.H - (st.oy - (st.PVY - 0.1) * px);
        pivot.position.set(pivX, pivY, 0);
        pivot.scale.setScalar(s);
        pivot.rotation.set(st.pit, st.yaw, st.rol);
        // Modell so verschieben, dass das Kinn 0,05 Figur-Einheiten über dem Drehpunkt liegt und die Mitte auf der Achse
        model.position.set(-kopfCx, -kopfChinY + 0.05 * (kopfH / st.HH), -kopfCz);
        // Regler setzen
        const o = formen(st);
        const dict = head.morphTargetDictionary, inf = head.morphTargetInfluences;
        for (const n in dict) inf[dict[n]] = 0;
        for (const n in o) { const i = dict[n]; if (i !== undefined) inf[i] = cl(o[n]); }
        renderer.render(scene, cam);
        return c3;
    }

    /* ---------- Sprache ---------- */
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60) return false;
        if (!/\b(?:realistische[nrms]?\s+kopf|3\s*d\s*kopf|dreid\s*kopf|echte[nr]?\s+kopf)\b/.test(t)) return false;
        if (/\b(aus|ausschalten|deaktivier\w*|abschalten|weg)\b/.test(t)) {
            lsSet(KEY, '0'); say('Gut, ich zeige wieder die gezeichnete Figur.'); return true;
        }
        if (/\b(an|ein|einschalten|aktivier\w*|zeig\w*|zeige)\b/.test(t) || /^(?:bitte )?(?:schalte? )?(?:den )?\w*\s?kopf/.test(t)) {
            lsSet(KEY, '1');
            if (!holoOn()) { say('Der realistische Kopf zeigt sich in der Figur-Ansicht. Schalten Sie sie mit dem Knopf oben rechts ein.'); return true; }
            if (status === 'bereit') say('Hier ist der realistische Kopf.');
            else if (status === 'fehler') { status = 'leer'; say('Einen Moment, ich lade den Kopf noch einmal.'); laden(true); }
            else { say('Einen Moment, ich lade den Kopf.'); laden(true); }
            return true;
        }
        say('Der realistische Kopf ist ' + (isOn() ? 'an' : 'aus') + '.');
        return true;
    }
    if (window.jvCommands) {
        window.jvCommands.use('kopf3d', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Kopf3D', e); }
            return next(text);
        }, 205);
    }
    window.jvKopf3d = { aktiv, draw, handle, isOn, status: () => status, formen, masse: () => ({ kopfH, kopfChinY, kopfCx, kopfCz }), _dbg: () => ({ head, scene, pivot }) };
})();
