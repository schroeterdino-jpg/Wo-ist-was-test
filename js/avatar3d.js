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
    const KEY2 = 'jv_kopf3d_modell';   // 'frau' oder 'standard'
    const isOn = () => lsGet(KEY) === '1';
    const frau = () => lsGet(KEY2) === 'frau';
    const holoOn = () => document.body.classList.contains('jv-holo');

    let status = 'leer';   // leer | laedt | bereit | fehler
    let THREE = null, renderer = null, scene = null, cam = null, pivot = null, model = null, head = null, c3 = null;
    let morphMeshes = [], augeR = null, augeL = null, kiefer = [], geladenFrau = false;
    let kopfH = 3.3, kopfChinY = 0, kopfCx = 0, kopfCz = 0;
    let lw = 0, lh = 0, ldpr = 0;
    const GROESSE_FRAU = 1.9, FRAU_RUNTER = 0.1;   // weiblicher Kopf: ohne Körper, deshalb größer und tiefer
    const GROESSE = 1.38;   // der 3D-Kopf wirkt neben dem breiten Körper sonst klein

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
                        THREE = await import('https://esm.sh/three@0.161.0');
            const { GLTFLoader } = await import('https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js');
            const { KTX2Loader } = await import('https://esm.sh/three@0.161.0/examples/jsm/loaders/KTX2Loader.js');
            const { MeshoptDecoder } = await import('https://esm.sh/meshoptimizer@0.20.0');
            if (!renderer) {
            c3 = document.createElement('canvas');   // wird nicht angezeigt: hologramm.js kopiert das Bild an die richtige Stelle der Figur
            renderer = new THREE.WebGLRenderer({ canvas: c3, alpha: true, antialias: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
            renderer.setClearColor(0x000000, 0);
            renderer.outputColorSpace = THREE.SRGBColorSpace;
            scene = new THREE.Scene();
            cam = new THREE.OrthographicCamera(0, 100, 100, 0, -2000, 2000);
            scene.add(new THREE.HemisphereLight(0xfff4ea, 0x3b3028, 1.25));
            const key = new THREE.DirectionalLight(0xfff0e2, 2.1); key.position.set(0.6, 0.9, 1.0); scene.add(key);
            const rim = new THREE.DirectionalLight(0x7fcfff, 0.9); rim.position.set(-1, 0.4, -0.6); scene.add(rim);
            }
            if (pivot) { scene.remove(pivot); pivot = null; }
            const istFrau = false; geladenFrau = false;
            const ktx2 = new KTX2Loader().setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/libs/basis/').detectSupport(renderer);
            const loader = new GLTFLoader().setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
            const g = await new Promise((ok, no) => loader.load('./models/facecap.glb?v=9', ok, undefined, no));
            model = g.scene;
            const meshes = [];
            model.traverse(o => { if (o.isMesh && o.morphTargetDictionary) meshes.push(o); });
            if (!meshes.length) throw new Error('Kein Kopf im Modell');
            morphMeshes = meshes; augeR = augeL = null; kiefer = [];
            if (istFrau) {
                head = meshes.find(m => m.name === 'head') || meshes[0];
                model.traverse(o => { if (o.name === 'eyeR') augeR = o; else if (o.name === 'eyeL') augeL = o; if (o.userData && o.userData.jawTravel !== undefined) kiefer.push({ o, y0: o.position.y, d: o.userData.jawTravel }); });
                // Maße des Kopfes (Meter): Kinn bis Scheitel
                try { head.material.color.setRGB(0.95, 0.8, 0.7); head.material.needsUpdate = true; } catch (e) {}   // Haut etwas wärmer
                kopfH = 0.235; kopfChinY = 1.59; kopfCx = 0; kopfCz = -0.01;
                model.traverse(o => { if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach(m => { m.needsUpdate = true; }); } });
            } else {
            head = meshes.sort((a, b) => Object.keys(b.morphTargetDictionary).length - Object.keys(a.morphTargetDictionary).length)[0];
            model.updateMatrixWorld(true);
            const box = new THREE.Box3().setFromObject(head, true);   // genau, nur der Kopf (nicht Augäpfel oder Zähne, die darüber hinausragen können)
            kopfH = box.max.y - box.min.y; kopfChinY = box.min.y; kopfCx = (box.min.x + box.max.x) / 2; kopfCz = (box.min.z + box.max.z) / 2;
            // JARVIS v9: matte titanium face + mechanical shell details.
            try {
                head.material = new THREE.MeshPhysicalMaterial({
                    color: 0x9aa6ad,
                    metalness: 0.58,
                    roughness: 0.48,
                    clearcoat: 0.10,
                    clearcoatRoughness: 0.62,
                    emissive: 0x061015,
                    emissiveIntensity: 0.10
                });
                head.material.morphTargets = true;
                head.material.needsUpdate = true;

                // Green luminous eyes like the reference.
                model.traverse(o => {
                    if (!o.isMesh) return;
                    const n = String(o.name || '').toLowerCase();
                    if (n.includes('eyeleft') || n.includes('eyeright')) {
                        o.material = new THREE.MeshPhysicalMaterial({
                            color: 0xbaffc8,
                            emissive: 0x39ff88,
                            emissiveIntensity: 3.0,
                            metalness: 0.08,
                            roughness: 0.24,
                            clearcoat: 0.35
                        });
                    } else if (n.includes('teeth')) {
                        o.material = new THREE.MeshStandardMaterial({
                            color: 0xc7d0d4, metalness: 0.35, roughness: 0.48
                        });
                    }
                });

                // Details are children of the head, so they follow all head movement.
                const details = new THREE.Group();
                details.name = 'JarvisMechanicalDetails';
                head.add(details);

                const darkMat = new THREE.MeshStandardMaterial({
                    color: 0x27333a, metalness: 0.82, roughness: 0.38
                });
                const silverMat = new THREE.MeshStandardMaterial({
                    color: 0xb8c2c7, metalness: 0.72, roughness: 0.36
                });
                const greenMat = new THREE.MeshPhysicalMaterial({
                    color: 0x6dffd0, emissive: 0x21ff9b, emissiveIntensity: 2.2,
                    transparent: true, opacity: 0.74, roughness: 0.24, metalness: 0.08
                });
                const goldMat = new THREE.MeshPhysicalMaterial({
                    color: 0xffd45d, emissive: 0xffa900, emissiveIntensity: 2.8,
                    metalness: 0.30, roughness: 0.28, clearcoat: 0.35
                });

                function box(name, sx, sy, sz, x, y, z, mat, rz=0) {
                    const m = new THREE.Mesh(new THREE.BoxGeometry(sx,sy,sz), mat);
                    m.name=name; m.position.set(x,y,z); m.rotation.z=rz; details.add(m); return m;
                }

                // Temple / cheek armor. Kept away from lips and eyelids so facial morphs remain readable.
                box('leftTemplePlate', .16,.30,.035,-.30,.08,.38,darkMat,-.18);
                box('rightTemplePlate',.16,.30,.035, .30,.08,.38,darkMat, .18);
                box('leftCheekPlate', .18,.23,.035,-.27,-.16,.41,silverMat, .18);
                box('rightCheekPlate',.18,.23,.035, .27,-.16,.41,silverMat,-.18);
                box('chinPlate',.27,.10,.040,0,-.36,.43,darkMat,0);

                // Forehead circuitry base and central gold power crystal.
                box('foreheadCircuit',.42,.10,.040,0,.33,.42,darkMat,0);
                const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(.085,0), goldMat);
                crystal.name='JarvisForeheadCore';
                crystal.scale.set(.78,1.25,.40);
                crystal.position.set(0,.34,.48);
                details.add(crystal);

                // Transparent skull dome + glowing "brain".
                const dome = new THREE.Mesh(
                    new THREE.SphereGeometry(.37,32,18,0,Math.PI*2,0,Math.PI*.53),
                    new THREE.MeshPhysicalMaterial({
                        color:0xbfefff, transparent:true, opacity:.18,
                        roughness:.08, metalness:.05, transmission:.22,
                        clearcoat:.65, side:THREE.DoubleSide
                    })
                );
                dome.name='JarvisSkullDome';
                dome.scale.set(1.0,.78,.72);
                dome.position.set(0,.48,.03);
                details.add(dome);

                const brain = new THREE.Group();
                brain.name='JarvisGlowingBrain';
                brain.position.set(0,.48,.08);
                details.add(brain);
                for(let i=0;i<15;i++){
                    const a=(i/15)*Math.PI*2;
                    const r=.10 + (i%4)*.035;
                    const orb=new THREE.Mesh(new THREE.SphereGeometry(.052,12,8),greenMat);
                    orb.scale.set(1.35,.72,.85);
                    orb.position.set(Math.cos(a)*r, Math.sin(a)*r*.45, .02+(i%3)*.025);
                    brain.add(orb);
                }
                const brainLight = new THREE.PointLight(0x3dffad, 2.4, 2.4);
                brainLight.position.set(0,.50,.38);
                details.add(brainLight);

                // Subtle cool lighting, no mirror-ball gloss.
                const key = new THREE.DirectionalLight(0xd7f4ff, 1.05);
                key.position.set(-.8,.8,1.8); scene.add(key);
                const fill = new THREE.DirectionalLight(0x75dfff,.42);
                fill.position.set(.9,.1,1.2); scene.add(fill);

                // Gentle brain pulse.
                const oldAnimate = window.__jarvisBrainPulse;
                window.__jarvisBrainPulse = { brain, brainLight, greenMat, t:0 };
            } catch (e) { console.warn('JARVIS Material', e); }
            }
            pivot = new THREE.Group(); pivot.rotation.order = 'YXZ'; pivot.add(model); scene.add(pivot);
            status = 'bereit';
            if (ansage && isOn()) say('Der JARVIS-Kopf ist bereit.');
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
        const s = px * (st.HH / kopfH) * (geladenFrau ? GROESSE_FRAU : GROESSE);     // Pixel je Modell-Einheit
        // Drehpunkt: unter dem Kinn (wie beim gezeichneten Kopf)
        const pivX = st.ox, pivY = st.H - (st.oy - (st.PVY - 0.1) * px) - (geladenFrau ? st.H * FRAU_RUNTER : 0);
        pivot.position.set(pivX, pivY, 0);
        pivot.scale.setScalar(s);
        pivot.rotation.set(st.pit, st.yaw, st.rol);
        // Modell so verschieben, dass das Kinn 0,05 Figur-Einheiten über dem Drehpunkt liegt und die Mitte auf der Achse
        model.position.set(-kopfCx, -kopfChinY + 0.05 * (kopfH / st.HH), -kopfCz);
        // Regler setzen
        const o = formen(st);
        for (const mm of (geladenFrau ? morphMeshes : [head])) {
            const dict = mm.morphTargetDictionary, inf = mm.morphTargetInfluences;
            for (const n in dict) inf[dict[n]] = 0;
            for (const n in o) { const i = dict[n]; if (i !== undefined) inf[i] = cl(o[n]); }
        }
        if (geladenFrau) {   // Augäpfel drehen, Unterkiefer-Teile mitnehmen
            const gx = cl(st.gx, -1, 1), gy = cl(st.gy, -1, 1);
            if (augeR) augeR.rotation.set(-gy * 0.3, gx * 0.4, 0);
            if (augeL) augeL.rotation.set(-gy * 0.3, gx * 0.4, 0);
            for (const k of kiefer) k.o.position.y = k.y0 + k.d * (o.jawOpen || 0);
        }
        renderer.render(scene, cam);
        return c3;
    }

    function wechsel() {   // Modell tauschen: beim nächsten Zeichnen neu laden
        if (status === 'laedt') return;
        if (status === 'bereit' && geladenFrau === frau()) return;
        status = 'leer'; if (isOn() && holoOn()) laden(false);
    }
    function mountToggle() {
        if (document.getElementById('kopf3dToggle')) return;
        const holder = document.querySelector('.holo-container');
        if (!holder) return;
        const b = document.createElement('button');
        b.id='kopf3dToggle'; b.type='button'; b.textContent='3D'; b.title='3D-Kopf an/aus';
        b.style.cssText='position:absolute;right:42px;top:2px;z-index:12;height:32px;min-width:46px;padding:0 10px;border-radius:18px;border:1px solid rgba(73,215,255,.55);background:rgba(10,22,33,.88);color:#8feaff;font:700 14px monospace;cursor:pointer';
        const paint=()=>{ const on=isOn(); b.textContent=on?'● 3D':'○ 3D'; b.style.color=on?'#9fffe8':'#8feaff'; };
        b.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();lsSet(KEY,isOn()?'0':'1');status=isOn()&&status==='fehler'?'leer':status;paint();if(isOn()&&holoOn())laden(false);});
        holder.appendChild(b); paint();
    }
    if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',mountToggle); else mountToggle();

    /* ---------- Sprache ---------- */
    function handle(text) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:\-]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60) return false;
        if (/\b(?:weibliche[nrms]?|frauen|fraulichen?)\s*(?:modell\s*)?kopf\b/.test(t) || /\bkopf\s+(?:von|als)\s+(?:einer\s+)?frau\b/.test(t)) {
            if (/\b(aus|ausschalten|weg|normal\w*|standard)\b/.test(t)) { lsSet(KEY2, 'standard'); wechsel(); say('Gut, ich nehme wieder den ersten Kopf.'); return true; }
            lsSet(KEY2, 'frau'); lsSet(KEY, '1'); wechsel();
            if (!holoOn()) { say('Der weibliche Kopf zeigt sich in der Figur-Ansicht. Schalten Sie sie mit dem Knopf oben rechts ein.'); return true; }
            say('Einen Moment, ich lade den weiblichen Kopf.'); return true;
        }
        if (!/\b(?:realistische[nrms]?\s+kopf|3\s*d\s*kopf|dreid\s*kopf|echte[nr]?\s+kopf)\b/.test(t)) return false;
        if (/\b(aus|ausschalten|deaktivier\w*|abschalten|weg)\b/.test(t)) {
            lsSet(KEY, '0'); say('Gut, ich zeige wieder die gezeichnete Figur.'); return true;
        }
        if (/\b(an|ein|einschalten|aktivier\w*|zeig\w*|zeige)\b/.test(t) || /^(?:bitte )?(?:schalte? )?(?:den )?\w*\s?kopf/.test(t)) {
            lsSet(KEY, '1');
            if (!holoOn()) { say('Der JARVIS-Kopf zeigt sich in der Figur-Ansicht. Schalten Sie sie mit dem Knopf oben rechts ein.'); return true; }
            if (status === 'bereit') say('Hier ist der JARVIS-Kopf.');
            else if (status === 'fehler') { status = 'leer'; say('Einen Moment, ich lade den Kopf noch einmal.'); laden(true); }
            else { say('Einen Moment, ich lade den Kopf.'); laden(true); }
            return true;
        }
        say('Der JARVIS-Kopf ist ' + (isOn() ? 'an' : 'aus') + '.');
        return true;
    }
    if (window.jvCommands) {
        window.jvCommands.use('kopf3d', function (text, next) {
            try { if (handle(text)) return true; } catch (e) { console.error('Kopf3D', e); }
            return next(text);
        }, 205);
    }
    window.jvKopf3d = { nurKopf: () => status === 'bereit' && geladenFrau, aktiv, draw, handle, isOn, status: () => status, formen, masse: () => ({ kopfH, kopfChinY, kopfCx, kopfCz }), _dbg: () => ({ head, scene, pivot }) };
})();
