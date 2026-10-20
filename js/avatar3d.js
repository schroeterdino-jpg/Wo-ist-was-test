/* JARVIS 3D v6.10 – v5-Basis + Fish-Audio-Lippensync + Robot-Material direkt auf FaceCap. */
(async function(){
'use strict';
const JV_HINTERGRUND=false; // Die alte Glaskugel samt Scan-Strahl ist aus; den Hologramm-Hintergrund zeichnet js/holo_look.js (true = alter Hintergrund)
const JV_KOPFBEWEGUNG=true; // false = Kopf bleibt (fast) still
const KOPF_URL={jung:'./models/facecap.glb?v=5',reif:'./models/mann.glb?v=6'};
// Feinabstimmung des reifen Kopfes: h = Gesamthoehe im Bild (Kopf plus Hals), cy = Hoehe im Modell, die in der Bildmitte liegen soll
const KOPF_REIF={h:2.40,cy:1.630};
function kopfLesen(){try{return localStorage.getItem('nova_kopf')==='reif'?'reif':'jung'}catch(e){return 'jung'}}
let kopfArt=kopfLesen();
const JV_HAARE=true; // false = glatzköpfig wie vorher
const holder=document.querySelector('.holo-container'); if(!holder) return;
let THREE,GLTFLoader,KTX2Loader,MeshoptDecoder;
try{
  THREE=await import('https://esm.sh/three@0.161.0');
  ({GLTFLoader}=await import('https://esm.sh/three@0.161.0/examples/jsm/loaders/GLTFLoader.js'));
  ({KTX2Loader}=await import('https://esm.sh/three@0.161.0/examples/jsm/loaders/KTX2Loader.js'));
  ({MeshoptDecoder}=await import('https://esm.sh/meshoptimizer@0.20.0'));
}catch(e){
  console.error('JARVIS 3D: Loader konnten nicht geladen werden',e);
  return;
}

const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2)); renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.12;
renderer.domElement.id='jarvisAvatar3D';
renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:none;z-index:4;pointer-events:none;-webkit-mask-image:radial-gradient(closest-side,#000 74%,transparent 100%);mask-image:radial-gradient(closest-side,#000 74%,transparent 100%)'; holder.appendChild(renderer.domElement);
const scene=new THREE.Scene(); const camera=new THREE.PerspectiveCamera(28,1,.01,100); camera.position.set(0,-.12,5.2); /* Kamera weiter weg (Kopf kleiner) und etwas tiefer (Kopf sitzt höher) */
scene.add(new THREE.HemisphereLight(0xd9f7ff,0x071018,1.55));
let key=new THREE.DirectionalLight(0xf3fbff,2.35);key.position.set(2.5,3.5,4);scene.add(key);
let rim=new THREE.DirectionalLight(0x35d7ff,1.45);rim.position.set(-3,1,-1);scene.add(rim);
let fill=new THREE.PointLight(0x6be9ff,5.5,8);fill.position.set(2,-1,2);scene.add(fill);
const root=new THREE.Group();scene.add(root);
// ---------- Zane-Hintergrund: Hologramm-Ringe + Partikel + Schein (hinter dem Kopf) ----------
const bgGroup=new THREE.Group(); bgGroup.position.set(0,-.04,-1.0); scene.add(bgGroup);
const bgRings=[], bgMats=[]; let bgParticles=null, bgHalo=null, bgScan=null, bgBig=null;
if(JV_HINTERGRUND){
  const addMat=(c,o)=>{const m=new THREE.MeshBasicMaterial({color:c,transparent:true,opacity:o,blending:THREE.AdditiveBlending,depthWrite:false,side:THREE.DoubleSide});bgMats.push([m,o]);return m};
  const ring=(r,tube,arc,col,op,speed,tilt)=>{const m=new THREE.Mesh(new THREE.TorusGeometry(r,tube,6,160,arc),addMat(col,op));m.rotation.x=tilt||0;m.userData.speed=speed;bgGroup.add(m);bgRings.push(m);
    // Leuchten: dickere, sehr transparente Kopien im gleichen Takt
    [[4,.16],[9,.05]].forEach(([k,f])=>{const g=new THREE.Mesh(new THREE.TorusGeometry(r,tube*k,16,160,arc),addMat(col,op*f));g.userData.follow=m;bgGroup.add(g);bgRings.push(g)});
    return m};
  ring(1.25,.005,Math.PI*2,0x35d7ff,.35,.05,0);
  ring(1.50,.008,Math.PI*1.35,0x00bfff,.55,-.16,0);
  ring(1.78,.006,Math.PI*1.7,0x35d7ff,.32,.10,0);
  ring(2.05,.004,Math.PI*0.9,0x8df7ff,.28,-.07,0);
  ring(1.38,.004,Math.PI*2,0x8df7ff,.25,.0,.0);
  // Skala aus kleinen Strichen
  {const pts=[];const N=120;for(let i=0;i<N;i++){const a=i/N*Math.PI*2,L=(i%5===0)?.07:.035,r0=1.64;pts.push(Math.cos(a)*r0,Math.sin(a)*r0,0,Math.cos(a)*(r0+L),Math.sin(a)*(r0+L),0)}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pts,3));
   const l=new THREE.LineSegments(g,new THREE.LineBasicMaterial({color:0x35d7ff,transparent:true,opacity:.40,blending:THREE.AdditiveBlending,depthWrite:false}));l.userData.speed=.03;bgGroup.add(l);bgRings.push(l);}
  // Partikel
  {const N=140,pos=new Float32Array(N*3),vel=new Float32Array(N);for(let i=0;i<N;i++){pos[i*3]=(Math.random()-.5)*4.4;pos[i*3+1]=(Math.random()-.5)*4.2;pos[i*3+2]=-.8-Math.random()*1.6;vel[i]=.03+Math.random()*.08}
   const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.BufferAttribute(pos,3));
   bgParticles=new THREE.Points(g,new THREE.PointsMaterial({color:0x9ff8ff,size:.09,map:(()=>{const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d');const g=x.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(150,240,255,.8)');g.addColorStop(1,'rgba(0,150,255,0)');x.fillStyle=g;x.fillRect(0,0,64,64);return new THREE.CanvasTexture(c)})(),transparent:true,opacity:.95,blending:THREE.AdditiveBlending,depthWrite:false,sizeAttenuation:true}));
   bgParticles.userData.vel=vel;bgParticles.position.z=0;scene.add(bgParticles);}
  // weicher Schein hinter dem Kopf
  {const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');const gr=x.createRadialGradient(128,128,10,128,128,128);
   gr.addColorStop(0,'rgba(30,150,230,.30)');gr.addColorStop(.45,'rgba(0,90,170,.10)');gr.addColorStop(1,'rgba(0,40,90,0)');x.fillStyle=gr;x.fillRect(0,0,256,256);
   const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));sp.scale.set(4.4,4.4,1);sp.position.set(0,-.04,-1.6);scene.add(sp);bgBig=sp;}
  // Heller Kern-Schein direkt hinter dem Kopf (Rand-Leuchten) – pulsiert beim Sprechen
  {const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');const gr=x.createRadialGradient(128,128,40,128,128,128);
   gr.addColorStop(0,'rgba(80,220,255,0)');gr.addColorStop(.55,'rgba(60,200,255,.30)');gr.addColorStop(.8,'rgba(30,170,255,.14)');gr.addColorStop(1,'rgba(0,80,160,0)');x.fillStyle=gr;x.fillRect(0,0,256,256);
   bgHalo=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,blending:THREE.AdditiveBlending,depthWrite:false}));bgHalo.scale.set(2.9,3.3,1);bgHalo.position.set(0,-.04,-.7);scene.add(bgHalo);}
  // Scan-Strahl: weiche waagerechte Lichtlinie, wandert langsam von oben nach unten
  {const c=document.createElement('canvas');c.width=256;c.height=32;const x=c.getContext('2d');const gr=x.createLinearGradient(0,0,0,32);
   gr.addColorStop(0,'rgba(0,200,255,0)');gr.addColorStop(.5,'rgba(120,240,255,.9)');gr.addColorStop(1,'rgba(0,200,255,0)');x.fillStyle=gr;x.fillRect(0,0,256,32);
   bgScan=new THREE.Sprite(new THREE.SpriteMaterial({map:new THREE.CanvasTexture(c),transparent:true,opacity:.28,blending:THREE.AdditiveBlending,depthWrite:false}));bgScan.scale.set(3.6,.22,1);bgScan.position.set(0,0,-.5);scene.add(bgScan);}

}
let bgSpk=0;
function updateBackground(now,dt,st,speaking){
  if(!JV_HINTERGRUND)return;
  bgSpk+=((speaking?1:0)-bgSpk)*Math.min(1,dt*3.2);
  const boost=speaking?2.4:(st==='thinking'?3.2:(st==='listening'?1.6:1));
  for(const r of bgRings){ if(r.userData.follow){r.rotation.z=r.userData.follow.rotation.z;} else r.rotation.z+= (r.userData.speed||0)*dt*boost*2;}
  const pulse=1+bgSpk*(.8+.25*Math.sin(now*.011));
  for(const [m,o] of bgMats) m.opacity=o*pulse*(st==='listening'?1.25:1);
  if(bgBig){bgBig.material.opacity=.55+bgSpk*.45;bgBig.scale.set(4.4+bgSpk*1.0,4.4+bgSpk*1.0,1);}
  if(bgHalo){bgHalo.material.opacity=Math.min(1,(.40+.10*Math.sin(now*.0016)+bgSpk*(.75+.2*Math.sin(now*.012)))*(st==='listening'?1.25:1));bgHalo.scale.set(2.9+bgSpk*.5,3.3+bgSpk*.55,1);}
  if(bgScan){const ph=((now*.00016*boost)%1);bgScan.position.y=1.5-ph*3.0;bgScan.material.opacity=.30*Math.sin(ph*Math.PI);}
  if(bgParticles){const p=bgParticles.geometry.attributes.position,v=bgParticles.userData.vel;
    for(let i=0;i<p.count;i++){let y=p.getY(i)+v[i]*dt*boost;if(y>2.1)y=-2.1;p.setY(i,y)}p.needsUpdate=true;}
}
 const faceRoot=new THREE.Group();root.add(faceRoot);
const cyan=0x00cfff, dark=0x111820;
const metalMat=new THREE.MeshPhysicalMaterial({color:0xb8c1c7,metalness:.58,roughness:.48,clearcoat:.10,clearcoatRoughness:.55});
const darkMat=new THREE.MeshStandardMaterial({color:dark,metalness:.9,roughness:.3});
const glowMat=new THREE.MeshStandardMaterial({color:0x8df7ff,metalness:.2,roughness:.18,emissive:cyan,emissiveIntensity:5});
const morphMeshes=[]; let morphNames=new Set(), model=null, active=true, raf=0, blink=0, blinkAt=-1e9, nextBlink=0, blinkVal=0, expression='neutral', manualMouth=0, modelReady=false;
let speechMorphs={};
let tongueUntil=0, lastEmotionText='', manualExpressionUntil=0;
let grimass=null;
function setGrimasse(map){ if(grimass) for(const n in grimass){ if(!map||!(n in map)) setMorph(n,0); } grimass=map?Object.assign({},map):null; }
// Der 3D-Kopf ist die Standardansicht. Das bisherige Geflecht bleibt nur die zweite Wahl.
const startupSphere=document.getElementById('jarvisSphere');
const startupHolo=document.getElementById('jarvisHolo');
if(startupSphere) startupSphere.style.visibility='hidden';
if(startupHolo) startupHolo.style.visibility='hidden';
const status=document.createElement('div'); status.id='jv3dStatus'; status.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10;display:none;max-width:86%;padding:9px 12px;border:1px solid #16cce8;border-radius:10px;background:#06111ee8;color:#aef7ff;font:700 12px system-ui;text-align:center;box-shadow:0 0 18px #00bfff44;pointer-events:none'; holder.appendChild(status);
function showStatus(t,err=false){status.textContent=t;status.style.borderColor=err?'#ff5b6e':'#16cce8';status.style.color=err?'#ffd5da':'#aef7ff';status.style.display='block'}
function hideStatus(){status.style.display='none'}
const target={}, current={};
// FaceCap/ARKit benutzt je nach Export z.B. mouthSmileLeft statt mouthSmile_L.
// Alle Mimik- und Sprachformen werden deshalb zuerst auf den TATSÄCHLICH vorhandenen Morph-Namen aufgelöst.
function resolveMorphName(name){
 if(morphNames.has(name)) return name;
 const candidates=[
   name.replace(/_L$/,'Left').replace(/_R$/,'Right'),
   name.replace(/Left$/,'_L').replace(/Right$/,'_R'),
   name.replace(/_left$/i,'Left').replace(/_right$/i,'Right')
 ];
 for(const c of candidates) if(morphNames.has(c)) return c;
 return null;
}
function morphIndex(mesh,name){
 const real=resolveMorphName(name)||name;
 return mesh.morphTargetDictionary?.[real] ?? -1;
}
function setMorph(name,v){
 const real=resolveMorphName(name);
 if(!real) return false;
 if(/^mouthFrown/.test(real)) v=Math.min(v,.3);
 target[real]=Math.max(0,Math.min(1,v));
 return true;
}
let browBase={};
function clearExpression(){
 for(const n of morphNames)
   if(!/^eyeBlink(?:_|Left|Right)/i.test(n) && n!=='jawOpen' && n!=='mouthClose' && !/^tongue/i.test(n))
     target[n]=0;
}
function setExpression(name='neutral'){
 expression=name; clearExpression();
 const both=(n,v)=>{setMorph(n+'_L',v);setMorph(n+'_R',v)};
 switch(name){
  case 'friendly': case 'happy': both('mouthSmile',.52);both('cheekSquint',.18);setMorph('browInnerUp',.08);break;
  case 'laugh': both('mouthSmile',.95);both('cheekSquint',.55);setMorph('jawOpen',.34);both('eyeSquint',.24);break;
  case 'sad': both('mouthFrown',.35);setMorph('browInnerUp',.72);both('eyeSquint',.12);break;
  case 'serious': both('browDown',.48);both('mouthPress',.28);break;
  case 'surprised': both('eyeWide',.72);setMorph('browInnerUp',.75);both('browOuterUp',.62);setMorph('jawOpen',.38);break;
  case 'thinking': setMorph('eyeLookUp_R',.35);setMorph('eyeLookUp_L',.35);setMorph('eyeLookOut_R',.22);setMorph('eyeLookIn_L',.22);setMorph('mouthPucker',.16);setMorph('browInnerUp',.18);break;
  case 'concerned': setMorph('browInnerUp',.52);both('browDown',.22);both('mouthFrown',.12);break;
  // Neu: einzelne Brauen. Skeptisch = linke Braue hoch, rechte leicht runter.
  case 'skeptical': setMorph('browOuterUp_L',.85);setMorph('browInnerUp',.12);setMorph('browDown_R',.4);both('mouthSmile',.12);break;
  case 'question': setMorph('browInnerUp',.3);both('browOuterUp',.38);break;
  case 'browsup': setMorph('browInnerUp',.55);both('browOuterUp',.6);break;
  case 'browsdown': both('browDown',.75);break;
  case 'amused': setMorph('mouthSmile_L',.62);setMorph('mouthSmile_R',.36);setMorph('mouthDimple_L',.4);both('cheekSquint',.3);both('eyeSquint',.2);setMorph('browOuterUp_R',.25);break;
  case 'pleased': both('mouthSmile',.34);both('cheekSquint',.22);both('eyeSquint',.18);setMorph('browInnerUp',.1);break;
  case 'disgust': both('noseSneer',.6);both('browDown',.38);setMorph('mouthShrugUpper',.5);both('mouthFrown',.1);both('eyeSquint',.3);break;
  case 'angry': both('browDown',.8);both('eyeSquint',.35);both('noseSneer',.3);both('mouthPress',.4);both('mouthFrown',.06);break;
  case 'tired': both('eyeSquint',.28);setMorph('browInnerUp',.22);setMorph('eyeLookDown_L',.3);setMorph('eyeLookDown_R',.3);break;
  case 'awe': both('eyeWide',.5);setMorph('browInnerUp',.5);both('browOuterUp',.42);setMorph('mouthFunnel',.2);both('mouthSmile',.15);break;
  case 'doubt': setMorph('mouthLeft',.5);setMorph('mouthShrugLower',.4);setMorph('browInnerUp',.25);setMorph('browDown_L',.3);break;
  case 'smug': setMorph('mouthSmile_R',.52);setMorph('browOuterUp_L',.42);both('eyeSquint',.22);setMorph('jawRight',.1);break;
  case 'cheeky': setMorph('mouthSmile_L',.7);setMorph('mouthDimple_L',.5);setMorph('browOuterUp_R',.55);setMorph('eyeSquint_R',.35);setMorph('mouthRight',.2);break;
  case 'unsure': setMorph('mouthRight',.4);setMorph('mouthShrugUpper',.35);setMorph('browInnerUp',.35);setMorph('eyeLookOut_L',.25);setMorph('eyeLookOut_R',.25);break;
  case 'puh': setMorph('cheekPuff',.55);both('eyeSquint',.12);setMorph('browInnerUp',.18);break;
  case 'relaxed': both('mouthSmile',.2);both('cheekSquint',.08);both('eyeSquint',.14);setMorph('browInnerUp',.04);break;
  case 'scared': both('eyeWide',.85);setMorph('browInnerUp',.85);both('browOuterUp',.3);both('mouthStretch',.35);setMorph('jawOpen',.22);both('mouthFrown',.1);break;
  case 'puzzled': setMorph('browInnerUp',.4);setMorph('browDown_L',.32);setMorph('browOuterUp_R',.45);setMorph('mouthShrugUpper',.3);setMorph('mouthRight',.2);setMorph('eyeLookUp_L',.15);setMorph('eyeLookUp_R',.15);break;
  case 'kiss': setMorph('mouthPucker',.7);both('cheekSquint',.2);break;
 }
 // Brauen-Grundwerte merken, damit beim Sprechen leichte Bewegung darauf aufsetzen kann.
 browBase={};
 ['browInnerUp','browOuterUp_L','browOuterUp_R','browDown_L','browDown_R'].forEach(n=>{const r=resolveMorphName(n);if(r)browBase[r]=target[r]||0;});
}

// Mechanische Schulter-/Hals-Silhouette – unabhängig vom beweglichen Gesicht.
function addRobotFrame(){
 const neck=new THREE.Mesh(new THREE.CylinderGeometry(.31,.4,.72,24),darkMat);neck.position.set(0,-1.28,-.08);root.add(neck);
 const chest=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),darkMat);chest.scale.set(1.25,.30,.46);chest.position.set(0,-1.7,-.1);root.add(chest);
 for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.28,.78,.06),darkMat);p.position.set(s*.61,-.08,.14);p.rotation.z=s*.16;faceRoot.add(p);const l=new THREE.Mesh(new THREE.BoxGeometry(.045,.58,.075),glowMat);l.position.set(s*.62,-.08,.19);l.rotation.z=s*.16;faceRoot.add(l)}
 const core=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.055,24),glowMat);core.rotation.x=Math.PI/2;core.position.set(0,.78,.28);faceRoot.add(core);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.17,.025,10,32),glowMat);ring.position.set(0,.78,.31);faceRoot.add(ring);
}
// v3: keine sonstigen geometrischen Fallback-Teile mehr – erst das echte GLB anzeigen.
// addRobotFrame();

// facecap.glb benötigt zwingend EXT_meshopt_compression UND KTX2/BasisU.
const ktx2Loader=new KTX2Loader()
  .setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.161.0/examples/jsm/libs/basis/')
  .detectSupport(renderer);
const gltfLoader=new GLTFLoader();
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
gltfLoader.setKTX2Loader(ktx2Loader);

// Augen des reifen Kopfes: weisse Lederhaut, braune Iris, dunkle Pupille (die Datei hat keine Augentextur)
let augenTex=null;
function augenTextur(){
 if(augenTex) return augenTex;
 const c=document.createElement('canvas'); c.width=c.height=256; const x=c.getContext('2d');
 x.fillStyle='#efe9e1'; x.fillRect(0,0,256,256);
 let g=x.createRadialGradient(128,128,10,128,128,66); g.addColorStop(0,'#5a3a1c'); g.addColorStop(.55,'#4a2c14'); g.addColorStop(.9,'#2a190c'); g.addColorStop(1,'#1a0f08');
 x.fillStyle=g; x.beginPath(); x.arc(128,128,64,0,Math.PI*2); x.fill();
 x.fillStyle='#050403'; x.beginPath(); x.arc(128,128,26,0,Math.PI*2); x.fill();
 x.fillStyle='rgba(255,255,255,.55)'; x.beginPath(); x.arc(112,112,7,0,Math.PI*2); x.fill();
 augenTex=new THREE.CanvasTexture(c); augenTex.colorSpace=THREE.SRGBColorSpace; augenTex.flipY=false; return augenTex;
}
function setHead(name){
 name=(name==='reif')?'reif':'jung';
 if(name===kopfArt&&model) return false;
 try{localStorage.setItem('nova_kopf',name)}catch(e){}
 kopfArt=name;
 if(model){try{faceRoot.remove(model)}catch(e){} model=null}
 morphMeshes.length=0; morphNames=new Set(); modelReady=false;
 ladeKopf(); return true;
}
let ladeNr=0, zubEyes=[], zubHeadMesh=null;
function ladeKopf(){
const meine=++ladeNr, art=kopfArt; zubEyes=[]; zubHeadMesh=null;
gltfLoader.load(KOPF_URL[art],g=>{
 if(meine!==ladeNr) return;
 model=g.scene; faceRoot.add(model);
 model.traverse(o=>{if(!o.isMesh)return; o.frustumCulled=false;
   const oldMaterials=Array.isArray(o.material)?o.material:[o.material];
   // Das echte facecap.glb wurde geprüft: 4 Meshes unter den Knoten eyeLeft, eyeRight, head und teeth.
   // Alle vier teilen sich dasselbe Material "lambert5". Deshalb MUSS die Zuordnung über die Elternknoten laufen,
   // nicht über Materialnamen. So bleiben Augen und Zähne getrennt vom Gesicht.
   function ancestryName(obj){
     const names=[]; let n=obj;
     while(n){ if(n.name) names.push(String(n.name)); n=n.parent; }
     return names.join(' ').toLowerCase();
   }
   const ancestry=ancestryName(o);
   const part=/teeth/.test(ancestry)?'teeth':(/eyeleft|eyeright|grp_eye/.test(ancestry)?'eye':(/head/.test(ancestry)?'head':'other'));
   if(part==='eye')zubEyes.push(o); if(part==='head'&&!zubHeadMesh)zubHeadMesh=o;

   function makeEyeMaterial(oldMat){
     // Original-Augen-Textur behalten (damit Augenweiß + Pupille erhalten bleiben),
     // aber die dunkleren Irispixel im Shader grün färben. Keine Zusatzkugel/kein Overlay.
     const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.42,metalness:0,side:THREE.DoubleSide});
     if(oldMat&&oldMat.map)m.map=oldMat.map;
     if(oldMat&&oldMat.normalMap)m.normalMap=oldMat.normalMap;
     m.onBeforeCompile=(shader)=>{
       shader.fragmentShader=shader.fragmentShader.replace(
         '#include <map_fragment>',
         `#include <map_fragment>\n`+
         `float jvLum = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));\n`+
         `float jvIris = 1.0 - smoothstep(0.48, 0.86, jvLum);\n`+
         `float jvPupil = 1.0 - smoothstep(0.08, 0.30, jvLum);\n`+
         `vec3 jvGreen = vec3(0.05,0.95,0.30) * (0.45 + 0.70*jvLum);\n`+
         `diffuseColor.rgb = mix(diffuseColor.rgb, jvGreen, jvIris * (1.0-jvPupil) * 0.96);\n`+
         `diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.008,0.018,0.012), jvPupil * 0.92);`
       );
     };
     m.customProgramCacheKey=()=> 'jarvis-green-eyes-v67';
     m.needsUpdate=true; return m;
   }
   function materialFor(oldMat){
     if(part==='teeth'&&art==='reif'){
       // Reifer Kopf: Zähne elfenbein, Zunge/Gaumen in Fleischfarbe (in mann.glb als Vertexfarben eingebrannt)
       const m=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.7,metalness:0,side:THREE.DoubleSide});
       m.needsUpdate=true; return m;
     }
     if(part==='teeth'){
       // Zähne sind im echten GLB ein eigener Knoten: sauber weiß, ohne die Gesichtsfarbe zu übernehmen.
       const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.30,metalness:0,side:THREE.DoubleSide});
       m.needsUpdate=true; return m;
     }
     if(art==='reif'){
       if(part==='eye'){const m=new THREE.MeshStandardMaterial({color:0xffffff,map:augenTextur(),roughness:.28,metalness:0,side:THREE.DoubleSide});m.needsUpdate=true;return m}
       if(part==='head'){const m=new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.66,metalness:0,side:THREE.DoubleSide});m.needsUpdate=true;return m}
     }
     if(part==='eye') return makeEyeMaterial(oldMat);
     if(part==='head'){
       // Menschenoptik: warme neutrale Haut statt Metall/Cyan. Keine Emission, kein Clearcoat, keine Leuchteffekte.
       // Die vorhandene Normalmap bleibt für Gesichtsdetails erhalten; Augen und Zähne werden separat behandelt.
       const m=new THREE.MeshStandardMaterial({color:0xc9967b,metalness:0,roughness:.72,side:THREE.DoubleSide});
       // Augenbrauen sind in der Original-Textur aufgemalt: Textur behalten, nur warm einfaerben.
       if(oldMat&&oldMat.map){
         m.map=oldMat.map; m.color.setRGB(1,1,1);
         // Textur nur als Helligkeit nutzen (Brauen/Schatten), Farbe = warme Hautfarbe wie vorher.
         // Modell-Achsen: Y = nach vorn, Z = nach unten (1-z = oben).
         // HAARE: auf die Kopfhaut gemalt (kurz, dunkelbraun). Zum Abschalten oben JV_HAARE auf false setzen.
         let hb=null; try{
           const pa=o.geometry.attributes.position; const mn=new THREE.Vector3(1e9,1e9,1e9), mx=new THREE.Vector3(-1e9,-1e9,-1e9);
           for(let i=0;i<pa.count;i++){const x=pa.getX(i),y=pa.getY(i),z=pa.getZ(i); if(x<mn.x)mn.x=x;if(y<mn.y)mn.y=y;if(z<mn.z)mn.z=z; if(x>mx.x)mx.x=x;if(y>mx.y)mx.y=y;if(z>mx.z)mx.z=z;}
           hb={min:mn,max:mx};
         }catch(e){}
         m.onBeforeCompile=(shader)=>{
           shader.uniforms.jvBMin={value:hb?hb.min:new THREE.Vector3(-1,-1,-1)};
           shader.uniforms.jvBMax={value:hb?hb.max:new THREE.Vector3(1,1,1)};
           shader.uniforms.jvHair={value:(JV_HAARE&&hb)?1.0:0.0};
           shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vJvPos;')
             .replace('#include <begin_vertex>','#include <begin_vertex>\nvJvPos=position;');
           shader.fragmentShader=shader.fragmentShader.replace('#include <common>',
             '#include <common>\nvarying vec3 vJvPos; uniform vec3 jvBMin; uniform vec3 jvBMax; uniform float jvHair;')
           .replace('#include <map_fragment>',
             '#include <map_fragment>\n'+
             'float jvL = dot(diffuseColor.rgb, vec3(0.299,0.587,0.114));\n'+
             'float jvN = clamp(jvL/0.40, 0.0, 1.6);\n'+
             'vec3 jvLumSkin = vec3(0.66,0.285,0.17) * jvN;\n'+
             'vec3 jvTexWarm = diffuseColor.rgb * vec3(2.1,1.0,0.62);\n'+
             'vec3 jvSkin = mix(jvTexWarm, jvLumSkin, 0.0) * vec3(0.96,0.86,0.78);\n'+
             'vec3 jvT = (vJvPos - jvBMin) / (jvBMax - jvBMin);\n'+
             'float jvUp = 1.0 - jvT.z;\n'+
             'float jvBand = smoothstep(0.57,0.60,jvUp)*(1.0-smoothstep(0.64,0.67,jvUp))*smoothstep(0.55,0.75,jvT.y);\n'+
             'float jvBrow = (1.0 - smoothstep(0.6, 1.05, jvN)) * jvBand;\n'+
             'jvSkin = mix(jvSkin, vec3(0.05,0.022,0.012), jvBrow*0.95);\n'+
             'float jvDark = 1.0 - smoothstep(0.15, 0.85, jvN);\n'+
             'jvSkin = mix(jvSkin, vec3(0.60,0.33,0.24), jvDark*0.55*(1.0-jvBand));\n'+
             'float jvEyeB = smoothstep(0.38,0.43,jvUp)*(1.0-smoothstep(0.545,0.575,jvUp))*smoothstep(0.55,0.75,jvT.y);\n'+
             'float jvEyeDark = 1.0 - smoothstep(0.7, 1.35, jvN);\n'+
             'jvSkin = mix(jvSkin, vec3(0.62,0.32,0.21), jvEyeDark*jvEyeB*0.7);\n'+
             'float jvLip = smoothstep(0.165,0.19,jvUp)*(1.0-smoothstep(0.225,0.25,jvUp))*(1.0-smoothstep(0.10,0.17,abs(jvT.x-0.5)))*smoothstep(0.7,0.85,jvT.y);\n'+
             'jvSkin = mix(jvSkin, vec3(0.50,0.17,0.15), jvLip*0.5);\n'+
             'float jvFront = smoothstep(0.55, 0.80, jvT.y);\n'+
             'float jvSide = smoothstep(0.30, 0.50, abs(jvT.x-0.5));\n'+
             'float jvEar = smoothstep(0.26,0.34,abs(jvT.x-0.5)) * (1.0-smoothstep(0.35,0.55,jvT.y));\n'+
             'float jvThr = mix(0.56, 0.77, jvFront) + jvEar*0.05;\n'+
             'float jvStr = sin(jvT.x*260.0+jvT.z*90.0)*sin(jvT.y*210.0+jvT.x*70.0);\n'+
             'float jvEdge = jvThr + jvStr*0.012 + sin(jvT.x*23.0+1.3)*0.012 + sin(jvT.x*57.0)*0.006;\n'+
             'float jvH = smoothstep(jvEdge-0.03, jvEdge+0.03, 1.0-jvT.z) * jvHair;\n'+
             'vec3 jvHairCol = vec3(0.028,0.016,0.010) * (0.75 + 0.5*jvStr*jvStr);\n'+
             'jvSkin = mix(jvSkin, mix(jvSkin*0.35, jvHairCol, 0.85), jvH);\n'+
             'diffuseColor.rgb = jvSkin;');
         };
         m.customProgramCacheKey=()=> 'jarvis-skin-hair-v1';
       }
       if(oldMat&&oldMat.normalMap){m.normalMap=oldMat.normalMap; m.normalScale=oldMat.normalScale?oldMat.normalScale.clone():new THREE.Vector2(1,1);}
       m.needsUpdate=true; return m;
     }
     return oldMat&&oldMat.clone?oldMat.clone():oldMat;
   }
   const replaced=oldMaterials.map(materialFor);
   o.material=Array.isArray(o.material)?replaced:replaced[0];
   if(o.morphTargetDictionary&&o.morphTargetInfluences){
     morphMeshes.push(o);Object.keys(o.morphTargetDictionary).forEach(n=>{morphNames.add(n);target[n]=0;current[n]=0})
   }
   console.info('JARVIS 3D v6.9 mesh',ancestry,'=>',part);
 });
 // Robust zentrieren: erst Weltmatrizen aktualisieren, dann skalieren, danach erneut messen.
 model.updateMatrixWorld(true);
 let box=new THREE.Box3().setFromObject(model), size=new THREE.Vector3();box.getSize(size);
 const sc=(art==='reif'?KOPF_REIF.h:2.34)/Math.max(size.y,.001); model.scale.multiplyScalar(sc); model.updateMatrixWorld(true);
 box=new THREE.Box3().setFromObject(model); const center=new THREE.Vector3();box.getCenter(center);
 model.position.x-=center.x; model.position.y-=(art==='reif'?KOPF_REIF.cy*sc:center.y)+.04; model.position.z-=center.z;
 model.updateMatrixWorld(true);
 modelReady=true; try{zubAnbringen()}catch(e){console.warn('Zubehör:',e)} setExpression('friendly'); btn.textContent='● 3D'; hideStatus(); if(active){renderer.domElement.style.display='block'; const sphere=document.getElementById('jarvisSphere');const holo=document.getElementById('jarvisHolo');if(sphere)sphere.style.visibility='hidden';if(holo)holo.style.visibility='hidden';if(!raf){loop.last=performance.now();raf=requestAnimationFrame(loop)}}
 console.info('JARVIS 3D v6.7 bereit – Größe:',size,'Morph Targets:',[...morphNames]);
},p=>{if(active&&p.total)showStatus('GLB lädt … '+Math.round(p.loaded/p.total*100)+' %')},e=>{console.error('JARVIS 3D: facecap.glb konnte nicht geladen werden',e);btn.textContent='⚠ 3D';btn.title='facecap.glb konnte nicht geladen werden';const msg=(e&&e.message)?e.message:String(e||'Unbekannter Fehler');
showStatus('✕ GLB-Fehler: '+msg.slice(0,120),true);
 if(art==='reif'&&meine===ladeNr){kopfArt='jung';try{localStorage.setItem('nova_kopf','jung')}catch(e){}ladeKopf()}});
}
ladeKopf();

function resize(){const w=holder.clientWidth||360,h=holder.clientHeight||360;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(holder);resize();
function clearSpeechMorphs(){
 for(const n of ['jawOpen','mouthClose','mouthFunnel','mouthPucker','mouthStretch_L','mouthStretch_R','mouthPress_L','mouthPress_R','mouthLowerDown_L','mouthLowerDown_R','mouthUpperUp_L','mouthUpperUp_R','mouthRollLower','mouthRollUpper']){
   setMorph(n,0);
 }
}
function lipShapeForText(text,audio){
 if(!audio || audio.paused || audio.ended || !text) return null;
 const dur=Number(audio.duration); if(!isFinite(dur)||dur<=0) return {kind:'A',amp:.22};
 const t=Math.max(0,Math.min(dur,Number(audio.currentTime)||0));
 // Wörter/Laute werden über die REALE Fish-Audio-Dauer verteilt. Leerzeichen/Punktuation erzeugen kurze Mundpausen.
 const units=[]; const src=String(text).toLowerCase().replace(/\[[^\]]+\]/g,' ');
 const re=/(sch|ch|ei|ai|ie|eu|äu|au|pf|ph|qu|[a-zäöüß]|[.,!?;:])/g; let m;
 while((m=re.exec(src))) units.push(m[0]);
 if(!units.length) return {kind:'A',amp:.18};
 const pos=(t/dur)*units.length; const i=Math.min(units.length-1,Math.floor(pos)); const u=units[i];
 if(/[.,!?;:]/.test(u)) return {kind:'REST',amp:0};
 if(/^[mbp]$/.test(u)) return {kind:'MBP',amp:.08};
 const isV=x=>/^(a|e|i|o|u|ä|ö|ü|y|ei|ai|ie|eu|äu|au)$/.test(x);
 if(!isV(u)){
   // Mitlaut: Mund bleibt in der Form des letzten Vokals, nur etwas enger (kein Aufklappen pro Buchstabe)
   for(let k=i-1;k>=Math.max(0,i-3);k--){ const w=units[k]; if(isV(w)){
     const base=/^(o|ö|u|ü|au|eu|äu)$/.test(w)?{kind:'OU',amp:.34}:/^(e|i|ä|y|ei|ai|ie)$/.test(w)?{kind:'EI',amp:.25}:{kind:'A',amp:.38};
     return {kind:base.kind,amp:base.amp*.6};
   } }
   return {kind:'CONS',amp:.12};
 }
 if(/^[fvw]$/.test(u)||u==='ph') return {kind:'FV',amp:.16};
 if(/^(o|ö|u|ü|au|eu|äu)$/.test(u)) return {kind:'OU',amp:.34};
 if(/^(e|i|ä|y|ei|ai|ie)$/.test(u)) return {kind:'EI',amp:.25};
 if(/^(s|z|ß|sch|ch|j|x)$/.test(u)) return {kind:'S',amp:.17};
 if(/^[l]$/.test(u)) return {kind:'L',amp:.20};
 return {kind:'A',amp:.38};
}
// Kiefer folgt der echten Lautstärke der Stimme (AnalyserNode). Fällt das aus, läuft automatisch die Text-Variante weiter.
const JV_AUDIO_LIPPEN=true;
let anCtx=null, envState=0, audioDriven=false;
function audioEnvelope(audio){
 if(!JV_AUDIO_LIPPEN||!audio||audio.__jvAnFail) return null;
 try{
   if(!anCtx){ const AC=window.AudioContext||window.webkitAudioContext; if(!AC){JV_NOAC=true;return null} anCtx=new AC(); }
   if(anCtx.state!=='running'){ anCtx.resume&&anCtx.resume(); return null; }   // erst hängen wir uns ein, wenn der Ton sicher weiterläuft
   let an=audio.__jvAn;
   if(!an){
     const src=anCtx.createMediaElementSource(audio); an=anCtx.createAnalyser(); an.fftSize=512; an.smoothingTimeConstant=0;
     src.connect(an); an.connect(anCtx.destination); audio.__jvAn=an; audio.__jvBuf=new Uint8Array(an.fftSize);
   }
   const buf=audio.__jvBuf; an.getByteTimeDomainData(buf);
   let s=0; for(let i=0;i<buf.length;i++){const d=(buf[i]-128)/128; s+=d*d;}
   const rms=Math.sqrt(s/buf.length);
   const lvl=Math.max(0,Math.min(1,(rms-.015)/.22));
   envState+=(lvl-envState)*(lvl>envState?.55:.2);   // schnell auf, etwas langsamer zu
   return envState;
 }catch(e){ audio.__jvAnFail=true; audio.__jvAnErr=String(e&&e.message||e).slice(0,60); return null; }
}
let JV_NOAC=false;
function applyAudioSpeech(env,shape){
 clearSpeechMorphs();
 const kind=shape&&shape.kind||'A', e2=Math.min(1,env*2.5);
 const scale=(kind==='OU')?.75:(kind==='EI')?.7:(kind==='S'||kind==='FV')?.55:1;
 let jaw=Math.pow(env,.85)*.42*scale;
 const lach=(expression==='laugh');
 if(lach) jaw=Math.max(jaw,.26+.14*env);          // beim Lachen bleibt der Mund offen
 setMorph('jawOpen',jaw); setMorph('mouthLowerDown_L',jaw*.3); setMorph('mouthLowerDown_R',jaw*.3);
 setMorph('mouthUpperUp_L',jaw*.1); setMorph('mouthUpperUp_R',jaw*.1);
 setMorph('mouthClose',lach?0:Math.max(0,Math.min(.6,.6-env*2.4)));      // leise/Pause: Lippen zu (nicht beim Lachen)
 if(kind==='OU'){ setMorph('mouthFunnel',.4*e2); setMorph('mouthPucker',.34*e2); }
 else if(kind==='EI'){ setMorph('mouthStretch_L',.3*e2); setMorph('mouthStretch_R',.3*e2); }
 else if(kind==='FV'){ setMorph('mouthRollLower',.3*e2); }
}
function applySpeechShape(shape){
 clearSpeechMorphs(); if(!shape) return;
 if(expression==='laugh'){ setMorph('jawOpen',.3+.1*Math.abs(Math.sin(performance.now()*.012))); return; }
 if(shape.kind==='REST'){ setMorph('mouthClose',.55); return; }
 const a=shape.amp||.2;
 switch(shape.kind){
  case 'MBP': setMorph('mouthClose',.9);setMorph('mouthPress_L',.3);setMorph('mouthPress_R',.3);break;
  case 'CONS': setMorph('jawOpen',.12);setMorph('mouthClose',.25);break;
  case 'FV': setMorph('jawOpen',.06);setMorph('mouthClose',.3);setMorph('mouthRollLower',.34);setMorph('mouthUpperUp_L',.16);setMorph('mouthUpperUp_R',.16);break;
  case 'OU': setMorph('jawOpen',a*.75);setMorph('mouthFunnel',.48);setMorph('mouthPucker',.44);break;
  case 'EI': setMorph('jawOpen',a*.55);setMorph('mouthStretch_L',.38);setMorph('mouthStretch_R',.38);setMorph('mouthUpperUp_L',.12);setMorph('mouthUpperUp_R',.12);break;
  case 'S': setMorph('jawOpen',.08);setMorph('mouthClose',.4);setMorph('mouthStretch_L',.16);setMorph('mouthStretch_R',.16);break;
  case 'L': setMorph('jawOpen',.14);setMorph('mouthClose',.2);setMorph('mouthUpperUp_L',.10);setMorph('mouthUpperUp_R',.10);break;
  default: setMorph('jawOpen',a*.9);setMorph('mouthLowerDown_L',a*.34);setMorph('mouthLowerDown_R',a*.34);setMorph('mouthUpperUp_L',a*.15);setMorph('mouthUpperUp_R',a*.15);
 }
}
function tongueMorphName(){
 for(const n of morphNames){ if(/^tongue[_-]?out$/i.test(n)||/^tongueout$/i.test(n)) return n; }
 return null;
}
function emotionFromSpeech(text){
 const t=String(text||'').toLowerCase();
 if(/\b(ekelhaft|igitt|pfui|widerlich|eklig)\b/.test(t)) return 'disgust';
 if(/\b(wütend|wuetend|ärgerlich|aergerlich|nervt|unverschämt|unverschaemt|frechheit)\b/.test(t)) return 'angry';
 if(/\b(müde|muede|erschöpft|erschoepft|gähn|gaehn|schlafen|feierabend)\b/.test(t)) return 'tired';
 if(/\b(wahnsinn|beeindruckend|großartig|grossartig|fantastisch|traumhaft|atemberaubend)\b/.test(t)) return 'awe';
 if(/\b(hehe|schelm|zwinker|na warte|ätsch|aetsch)\b/.test(t)) return 'cheeky';
 if(/\b(haha|hahaha|hihi|lol|ha ha)\b/.test(t)) return 'laugh';
 if(/\b(lach|witzig|lustig|spaß|spass|komisch)\b/.test(t)) return 'amused';
 if(/\b(stolz|gewonnen|gelungen|erfolg|geschafft|gut gemacht)\b/.test(t)) return 'smug';
 if(/\b(puh|uff|boah|hitze|schwül|schwuel)\b/.test(t)) return 'puh';
 if(/\b(vielleicht|keine ahnung|weiß nicht|weiss nicht|unklar|eventuell|womöglich|womoeglich)\b/.test(t)) return 'unsure';
 if(/\b(wirklich|echt jetzt|bist du sicher|glaube ich kaum|zweifel|angeblich)\b/.test(t)) return 'doubt';
 if(/\b(danke|bitte schön|bitte schoen|gern geschehen|freut mich|schön|schoen|toll|prima|herzlich)\b/.test(t)) return 'pleased';
 // Reihenfolge bewusst: starke Gefühle zuerst, dann freundlich als Standard.
 if(/\b(wow|unglaublich|überrasch|ueberrasch|oh!|oha|wirklich\?|ernsthaft\?)\b/.test(t)) return 'surprised';
 if(/\b(tut mir leid|leider|traurig|verstorben|gestorben|beileid|schade|bedauer|nicht gut)\b/.test(t)) return 'sad';
 if(/\b(achtung|warnung|vorsicht|gefährlich|gefaehrlich|dringend|ernst|problem|fehler)\b/.test(t)) return 'serious';
 if(/\b(hmm|überlege|ueberlege|nachdenken|mal sehen|ich denke|ich prüfe|ich pruefe)\b/.test(t)) return 'thinking';
 if(/\b(sorge|besorgt|aufpassen|hoffentlich|unsicher)\b/.test(t)) return 'concerned';
 if(/\b(haha|hehe|witzig|lustig|freut mich|gern|gerne|super|prima|perfekt|geschafft|natürlich|natuerlich)\b/.test(t)) return 'happy';
 if(/\?\s*$/.test(String(text||'').trim())) return 'question';
 return 'friendly';
}
function syncEmotionToFish(){
 const audio=window.__jvLipAudio, text=String(window.__jvLipText||'');
 if(!audio||audio.paused||audio.ended||!text||text===lastEmotionText) return;
 lastEmotionText=text; lastSentence=-1;
}
let lastSentence=-1;
const EXPR_OK=['neutral','friendly','happy','laugh','amused','pleased','relaxed','smug','cheeky','sad','concerned','serious','angry','disgust','scared','surprised','awe','puzzled','thinking','unsure','skeptical','doubt','tired','puh','question','kiss'];
function kiMimikAktiv(){ try{ const K=window.__jvMimikKI, au=window.__jvLipAudio; return !!(K&&K.list&&K.list.length&&Date.now()-K.at<600000&&au&&!au.paused&&!au.ended); }catch(e){ return false; } }
function syncSentenceEmotion(){
 const audio=window.__jvLipAudio, text=String(window.__jvLipText||'');
 if(!audio||audio.paused||audio.ended||!text) return;
 if(performance.now()<manualExpressionUntil) return;
 const dur=Number(audio.duration); if(!isFinite(dur)||dur<=0) return;
 const sents=text.replace(/\[[^\]]+\]/g,' ').match(/[^.!?;:]+[.!?;:]*/g)||[text];
 const tot=sents.reduce((s,x)=>s+x.length,0)||1; let pos=(Math.max(0,audio.currentTime)/dur)*tot, idx=0;
 for(;idx<sents.length-1;idx++){ if(pos<sents[idx].length) break; pos-=sents[idx].length; }
 if(idx===lastSentence) return; lastSentence=idx;
 const s=sents[idx]; let emo=null;
 try{ // Hat die KI zu dieser Antwort selbst Ausdrücke gewählt (Feld "mimik"), gelten die
   const K=window.__jvMimikKI;
   if(K&&K.list&&K.list.length&&Date.now()-K.at<600000){
     const rep=String(K.reply||''), probe=String(sents[0]||'').replace(/\s+/g,' ').trim().slice(0,24);
     const flat=rep.replace(/\s+/g,' '); const st=probe?flat.indexOf(probe):-1;
     let gi;
     if(st>=0){
       let before=0; for(let k=0;k<idx;k++) before+=sents[k].length;
       const gpos=st+before+1, rs=flat.match(/[^.!?;:]+[.!?;:]*/g)||[flat]; let acc=0; gi=rs.length-1;
       for(let k=0;k<rs.length;k++){ acc+=rs[k].length; if(gpos<=acc){gi=k;break;} }
     } else gi=(sents.length===K.list.length)?idx:Math.floor(idx/Math.max(1,sents.length)*K.list.length);
     const cand=String(K.list[Math.min(gi,K.list.length-1)]||'').toLowerCase();
     if(EXPR_OK.indexOf(cand)>=0) emo=cand;
   }
 }catch(e){}
 if(!emo) emo=emotionFromSpeech(s);
 if(emo==='friendly'&&/[?]\s*$/.test(s.trim())) emo='question';
 if(emo!==expression) setExpression(emo);
}
// Kleine Zufalls-Mimik: alle paar Sekunden ein kurzes Zucken (Brauen, Wangen, Nase, Mundwinkel ...). Beim Sprechen nur Gesicht oben, nie der Mund.
const MIMIK_STAERKE=1;
const MICROS=[
 {n:{browInnerUp:.35,browOuterUp_L:.3,browOuterUp_R:.3},t:900},
 {n:{browOuterUp_L:.5,browDown_R:.18},t:1000},
 {n:{cheekSquint_L:.28,cheekSquint_R:.28,eyeSquint_L:.18,eyeSquint_R:.18},t:1100},
 {n:{noseSneer_L:.35,noseSneer_R:.2},t:700},
 {n:{eyeWide_L:.3,eyeWide_R:.3,browInnerUp:.2},t:800},
 {n:{browDown_L:.3,browDown_R:.3,eyeSquint_L:.15,eyeSquint_R:.15},t:1000},
 {n:{mouthSmile_L:.3,mouthSmile_R:.18,mouthDimple_L:.25},t:1200,mund:true},
 {n:{mouthPress_L:.3,mouthPress_R:.3,mouthRollLower:.2},t:900,mund:true},
 {n:{mouthLeft:.3,jawLeft:.12},t:1000,mund:true},
 {n:{mouthRight:.3,jawRight:.12},t:1000,mund:true},
 {n:{mouthShrugLower:.3,browInnerUp:.2,mouthSmile_L:.12,mouthSmile_R:.12},t:1100,mund:true},
 {n:{cheekPuff:.3},t:700,mund:true},
 {n:{mouthPucker:.3,mouthRollUpper:.2},t:900,mund:true}
];
let micro=null, microNext=0;
function microEnvelope(now){ if(!micro) return 0; const x=(now-micro.t0)/micro.t; if(x<0||x>=1){micro=null;return 0} return Math.sin(Math.PI*x); }
let lipSilent=0, lipLastT=0;
function generischSpricht(){
 try{
   const a=(typeof currentAudio!=='undefined')?currentAudio:null;
   if(a&&!a.paused&&!a.ended&&a.currentTime>.05) return true;
   if(window.speechSynthesis&&window.speechSynthesis.speaking) return true;
 }catch(e){}
 return false;
}
function applyMorphs(dt,speaking,now){
 syncEmotionToFish(); syncSentenceEmotion();
 const tn=tongueMorphName(); if(tn) setMorph(tn, performance.now()<tongueUntil ? .95 : 0);
 // Natürliches Blinzeln: zeitgesteuert (alle 2-6 s, manchmal doppelt), unabhängig vom Sprechen.
 if(blink>=1){blinkAt=now;blink=0;}
 if(now>=nextBlink){blinkAt=now;nextBlink=now+2200+Math.random()*3800; if(Math.random()<.2)nextBlink=now+330;}
 { const bt=(now-blinkAt)/210; blinkVal=(bt>=0&&bt<1)?(bt<.38?bt/.38:1-(bt-.38)/.62):0; }
 const audio=window.__jvLipAudio, text=window.__jvLipText||'';
 const fishSpeaking=!!(audio&&!audio.paused&&!audio.ended);
 // Beim Sprechen: Brauen betonen leicht im Rhythmus der Worte (nur bei den Hoch-Brauen).
 if(fishSpeaking&&expression!=='skeptical'&&expression!=='browsdown'&&expression!=='serious'){
   const tt=now/1000, p=Math.max(0,Math.sin(tt*2.3)*Math.sin(tt*0.9+1.2))*.2;
   for(const n in browBase){ if(/Up/.test(n)) setMorph(n, browBase[n]+p); }
 }
 if(fishSpeaking){
   let env=audioEnvelope(audio);
   // Sicherung (Mund blieb zu, obwohl er sprach): liefert der Lautstärke-Messer dauerhaft Stille, obwohl der Ton läuft,
   // wechselt der Mund auf die Text-Variante, bis wieder echte Lautstärke ankommt.
   if(env!==null){ const dtm=lipLastT?Math.min(100,now-lipLastT):16; lipLastT=now; if(env<.02&&audio.currentTime>.25) lipSilent+=dtm; else lipSilent=0; if(lipSilent>700) env=null; } else { lipLastT=0; lipSilent=0; }
   audioDriven=(env!==null);
   const shp=lipShapeForText(text,audio)||{kind:['A','EI','OU','A','CONS','A'][Math.floor(now/130)%6],amp:.2+.2*Math.abs(Math.sin(now*.011))};   // ohne Text (z. B. Zwischenansage/Cache): Sprechrhythmus statt geschlossener Mund
   if(audioDriven) applyAudioSpeech(env,shp); else applySpeechShape(shp);
   if(anCtx&&anCtx.state==='suspended'&&anCtx.resume) anCtx.resume();
 }
 else if(generischSpricht()){
   // Sicherung: Ton läuft, aber das Lippen-Audio wurde nicht erkannt -> Mund bewegt sich trotzdem im Sprechrhythmus
   audioDriven=false; envState=0; lipSilent=0; lipLastT=0;
   applySpeechShape({kind:['A','EI','OU','A','CONS','A'][Math.floor(now/130)%6],amp:.2+.2*Math.abs(Math.sin(now*.011))});
 }
 else if(manualMouth>0){audioDriven=false;envState=0;clearSpeechMorphs();setMorph('jawOpen',manualMouth)}
 else { audioDriven=false; envState=0; clearSpeechMorphs(); if(!/^(laugh|surprised|awe)$/.test(expression)) setMorph('mouthClose',.35); }
 if(sleepLevel>.4&&!fishSpeaking){ setMorph('jawOpen',(.045+.03*(.5+.5*Math.sin(now*.0016)))*Math.min(1,sleepLevel)); }   // schlafend: Mund leicht offen, atmet
 // Grimassen (js/grimassen.js): liegen als Überlagerung oben drauf, damit das Aufräumen der Mundformen sie nicht löscht.
 if(grimass){ for(const n in grimass){ if(!fishSpeaking||/^(brow|eye|cheek|nose|mouthSmile|mouthDimple)/.test(n)) setMorph(n,grimass[n]); } }   // beim Sprechen nur Augen, Brauen, Wangen, Nase und Lächeln, nie den Mund/Kiefer
 if(expression==='laugh'&&!fishSpeaking)setMorph('jawOpen',Math.max(target.jawOpen||0,.28));
 if(expression==='surprised'&&!fishSpeaking)setMorph('jawOpen',Math.max(target.jawOpen||0,.34));
 try{ window.__jvMouthDiag={t:Math.round(now),fish:fishSpeaking,audioDriven:audioDriven,env:+envState.toFixed(3),silent:Math.round(lipSilent),ctx:anCtx?anCtx.state:'-',fail:!!(audio&&audio.__jvAnFail),err:(audio&&audio.__jvAnErr)||'-',txt:String(text||'').length,paused:!!(audio&&audio.paused),ct:audio?+Number(audio.currentTime).toFixed(1):0,dur:audio?+Number(audio.duration||0).toFixed(1):0,vol:audio?+Number(audio.volume).toFixed(2):0,muted:!!(audio&&audio.muted),gen:generischSpricht(),state:speaking,expr:expression,ki:kiMimikAktiv(),sleep:+Number(sleepLevel).toFixed(2),jawT:+(target.jawOpen||0).toFixed(2),jawC:+(current.jawOpen||0).toFixed(2),mcT:+(target.mouthClose||0).toFixed(2),dt:+Number(dt).toFixed(3)}; }catch(e){}
 for(const n of morphNames){const want=target[n]||0;const mund=/^(jaw|mouth)/.test(n)&&speaking&&!audioDriven;current[n]+=(want-current[n])*Math.min(1,dt*(mund?8:14))}
 { const b1=resolveMorphName('eyeBlink_L'),b2=resolveMorphName('eyeBlink_R'), wl=(grimass&&grimass.eyeBlink_L)||0, wr=(grimass&&grimass.eyeBlink_R)||0; const sl=sleepLevel*.97; if(b1)current[b1]=Math.max(0,Math.min(1,Math.max(blinkVal,wl,sl))); if(b2)current[b2]=Math.max(0,Math.min(1,Math.max(blinkVal,wr,sl))); }   // Zwinkern (Mimik) läuft über die Überlagerung
 const shown=Object.assign({},current);
 if(now>microNext&&!micro&&MIMIK_STAERKE>0&&sleepLevel<.2){ const pool=MICROS.filter(m=>!(speaking&&m.mund)); micro=Object.assign({t0:now},pool[Math.floor(Math.random()*pool.length)]); microNext=now+1800+Math.random()*4200; }
 { const e=microEnvelope(now); if(e>0&&micro) for(const k in micro.n){ const r=resolveMorphName(k); if(r) shown[r]=Math.min(1,Math.max(shown[r]||0,micro.n[k]*e*MIMIK_STAERKE)); } }
 for(const m of morphMeshes)for(const n of morphNames){const i=morphIndex(m,n);if(i>=0)m.morphTargetInfluences[i]=shown[n]||0}
}
let lastAvatarState='';
function avatarState(){
 const rb=document.getElementById('recordBtn'), rt=document.getElementById('recordText');
 const speaking=!!(window.__jvLipAudio&&!window.__jvLipAudio.paused&&!window.__jvLipAudio.ended);
 if(speaking)return 'speaking';
 if(rb&&rb.classList.contains('recording'))return 'listening';
 const tx=String(rt&&rt.textContent||'').toLowerCase();
 if(/verarbeitet|verarbeite|processing|denkt|analys/.test(tx))return 'thinking';
 return 'idle';
}
function syncAvatarState(now){
 const st=avatarState();
 schlafPruefen(st,now);
 if(st!==lastAvatarState && now>=manualExpressionUntil){
   lastAvatarState=st;
   if(st==='listening')setExpression('friendly');
   else if(st==='thinking'){ if(!(JV_SPIEGELN&&mirror.expr&&now<mirror.until)) setExpression('thinking'); }
   else if(st==='idle'){ if(sleepLevel<.4) setExpression('friendly'); }
 }
 return st;
}
// ================= v7: Schlafen, Blick zum Finger, Spiegeln, Kopfhaltung, Zubehör =================
const JV_SCHLAF=true;           // nachts im Leerlauf schläft Nova (false = nie)
const SCHLAF_VON=22, SCHLAF_BIS=5, SCHLAF_NACH_MS=120000;   // 22 bis 5 Uhr, nach 2 Minuten Ruhe
const JV_BLICK_FINGER=true;     // Augen und Kopf folgen deinem Finger
const JV_SPIEGELN=true;         // reagiert mit Mimik schon auf das, was du sagst
const JV_POSE=true;             // Kopfhaltung passend zur Mimik, Nicken beim Zuhören
const ZUB_URL='./models/zubehoer.glb?v=1';
const REIF_M={ed:0.06608,ey:1.6437,zf:0.12322,hw:0.09532,top:1.76642,zmin:-0.09046};   // Messwerte des reifen Kopfes (fbx/accglb.py)
let sleepLevel=0, sleepForced=false, forcedGrace=0, lastActive=performance.now(), sleepOn=false;
const gaze={x:0,y:0,until:0,w:0,dirty:false};
const mirror={expr:null,until:0,tilt:0,tiltUntil:0};
const pose={x:0,y:0,z:0};
function isNight(){const h=new Date().getHours();return SCHLAF_VON>SCHLAF_BIS?(h>=SCHLAF_VON||h<SCHLAF_BIS):(h>=SCHLAF_VON&&h<SCHLAF_BIS)}
function schlafPruefen(st,now){
  if(st!=='idle') lastActive=now;
  if(sleepForced&&st!=='idle'&&now>=forcedGrace) sleepForced=false;   // in den ersten Sekunden läuft noch das "Gute Nacht"
}
function schlafStep(dt,now,st){
  const want=JV_SCHLAF&&st==='idle'&&modelReady&&(sleepForced||(isNight()&&now-lastActive>SCHLAF_NACH_MS));
  sleepLevel+=((want?1:0)-sleepLevel)*(1-Math.exp(-dt*(want?1.3:4.5))); if(sleepLevel<.002)sleepLevel=0;
  if(want&&!sleepOn&&sleepLevel>.5){sleepOn=true;setExpression('neutral')}
  if(!want&&sleepOn&&sleepLevel<.5){sleepOn=false;setExpression('friendly')}
  zubS+=(zubWant-zubS)*(1-Math.exp(-dt*4));
}
// ---- Blick zum Finger ----
function gazeEvent(e){
  try{
    const now=performance.now();
    if(e.type==='pointerdown'){ lastActive=now; sleepForced=false; }
    if(!JV_BLICK_FINGER) return;
    const r=holder.getBoundingClientRect(); if(!r.width) return;
    const cx=r.left+r.width/2, cy=r.top+r.height*.45;
    gaze.x=Math.max(-1,Math.min(1,(e.clientX-cx)/(r.width*.55+80)*1.25));
    gaze.y=Math.max(-1,Math.min(1,(e.clientY-cy)/(r.height*.55+80)*1.25));
    gaze.until=now+(e.pointerType==='mouse'?1800:2600);
  }catch(err){}
}
window.addEventListener('pointerdown',gazeEvent,{passive:true,capture:true});
window.addEventListener('pointermove',gazeEvent,{passive:true,capture:true});
// ---- Kopfhaltung zur Mimik ----
const POSEN={question:{z:.09,x:-.02},puzzled:{z:.10,y:.04},skeptical:{z:-.06,y:.05},doubt:{z:-.05},unsure:{z:.06,x:.02},
 sad:{x:.075,z:.02},concerned:{x:.05,z:.04},tired:{x:.09,z:.05},thinking:{z:.05,y:.04,x:-.02},smug:{x:-.05,z:-.03},cheeky:{z:.07,y:-.03},
 amused:{z:.03,x:-.01},happy:{z:.015},laugh:{x:-.03},surprised:{x:-.045},scared:{x:-.05},awe:{x:-.04},angry:{x:.045},serious:{x:.025},
 disgust:{x:-.02,y:.06},pleased:{z:.025},relaxed:{z:.02},kiss:{z:.04}};
function updatePose(now,dt,st){
  let tx=0,ty=0,tz=0;
  if(JV_POSE){
    const p=POSEN[expression]; if(p){tx=p.x||0;ty=p.y||0;tz=p.z||0}
    if(now<mirror.tiltUntil){ tz+=mirror.tilt; tx-=.015; }
    if(st==='listening'&&window.jvUserSpeaking){ tx+=Math.max(0,Math.sin(now*.0042))*.04*Math.max(0,Math.sin(now*.0011+1)); }   // nickt leicht, während du sprichst
  }
  const k=1-Math.exp(-dt*3.2); pose.x+=(tx-pose.x)*k; pose.y+=(ty-pose.y)*k; pose.z+=(tz-pose.z)*k;
}
// ---- Spiegeln: Nova reagiert auf das, was DU sagst, noch bevor sie antwortet ----
function nova_spricht(){ const a=window.__jvLipAudio; return !!(a&&!a.paused&&!a.ended); }
function spiegeln(text){
  if(!JV_SPIEGELN||!text) return;
  const raw=String(text), t=' '+raw.toLowerCase().replace(/[.,!;:]+/g,' ').replace(/\s+/g,' ')+' ';
  let ex=null;
  if(/(gestorben|verstorben|beerdig|todesfall|trauer|traurig|verloren|vermiss|einsam|geweint|weine |krebs|trennung|schluss gemacht|depress|überfordert|ueberfordert|hoffnungslos|schlecht gegangen|gestresst)/.test(t)) ex='sad';
  else if(/(sorge|sorgen|angst|besorgt|problem|stress|schlimm|krank|unfall|streit|ärger|aerger|schmerz|nervt|genervt|wütend|wuetend|sauer|frechheit|unfair|müde|muede|erschöpft|erschoepft|kaputt|schlecht geschlafen)/.test(t)) ex='concerned';
  else if(/(haha|hihi|lustig|witzig|kicher|lach|scherz)/.test(t)) ex='amused';
  else if(/(gewonnen|bestanden|geburtstag|hochzeit|befördert|befoerdert|schwanger|zusage|geschafft|urlaub|freue mich|freu mich|super|geil|klasse|wunderbar|großartig|grossartig|fantastisch|endlich)/.test(t)) ex='happy';
  else if(/(stell dir vor|unglaublich|wahnsinn|krass|nicht zu fassen|kaum zu glauben|echt jetzt)/.test(t)) ex='surprised';
  else if(/(danke|dankeschön|dankeschoen|gut gemacht|bravo|du bist (super|toll|klasse|gut|cool|witzig|der beste|die beste))/.test(t)) ex='pleased';
  const frage=/\?/.test(raw)||/^ (wer|wie|was|warum|wieso|weshalb|wann|wo|wohin|woher|welche[nrsm]?|wieviel|wie viel|kannst du|kann ich|könntest du|hast du|gibt es|ist es|soll ich|sollen wir|stimmt) /.test(t);
  const now=performance.now();
  mirror.expr=ex; mirror.until=now+9000;
  mirror.tilt=frage?(Math.random()<.5?-1:1)*.10:0; mirror.tiltUntil=frage?now+6000:0;
  if(ex) setTimeout(()=>{ try{ if(!nova_spricht()&&now+9000>performance.now()) setExpression(ex); }catch(e){} },320);
}
// ---- Zubehör (Brille, Sonnenbrille, Mütze, Cap, Kopfhörer) ----
const ZUB_NAMEN=['brille','sonnenbrille','muetze','cap','kopfhoerer'], ZUB_TEXT={brille:'die Brille',sonnenbrille:'die Sonnenbrille',muetze:'die Mütze',cap:'die Cap',kopfhoerer:'die Kopfhörer'};
const ZUB_KOPF=['muetze','cap','kopfhoerer'];
let zubRoot=null, zubGlas=null, zubKopfG=null, zubNodes={}, zubLoading=null, zubSel=new Set(), zubS=1, zubWant=1;
try{ const l=JSON.parse(localStorage.getItem('nova_zubehoer')||'[]'); if(Array.isArray(l)) l.forEach(n=>{ if(ZUB_NAMEN.includes(n)) zubSel.add(n); }); }catch(e){}
function zubLaden(){
  if(zubLoading) return zubLoading;
  zubLoading=new Promise((res,rej)=>{
    gltfLoader.load(ZUB_URL,g=>{
      zubRoot=new THREE.Group(); zubGlas=new THREE.Group(); zubKopfG=new THREE.Group(); zubRoot.add(zubGlas); zubRoot.add(zubKopfG);
      for(const n of ZUB_NAMEN){
        const o=g.scene.getObjectByName('z_'+n); if(!o) continue;
        o.traverse(x=>{ x.frustumCulled=false; if(x.isMesh&&x.material){ x.material.side=THREE.DoubleSide; x.renderOrder=(x.material.transparent?6:5); } });
        o.visible=false; (/brille/.test(n)?zubGlas:zubKopfG).add(o); zubNodes[n]=o;
      }
      res(true);
    },undefined,e=>{ zubLoading=null; rej(e); });
  });
  zubLoading.catch(e=>console.warn('zubehoer.glb konnte nicht geladen werden',e));
  return zubLoading;
}
function kopfMasse(){
  if(kopfArt==='reif'||!zubHeadMesh||zubEyes.length<2) return null;
  model.updateMatrixWorld(true);
  const inv=new THREE.Matrix4().copy(model.matrixWorld).invert();
  const boxes=zubEyes.slice(0,2).map(m=>new THREE.Box3().setFromObject(m).applyMatrix4(inv));
  const c=boxes.map(b=>b.getCenter(new THREE.Vector3())).sort((a,b)=>a.x-b.x);
  const ed=Math.abs(c[1].x-c[0].x), ey=(c[0].y+c[1].y)/2, ecx=(c[0].x+c[1].x)/2; if(!(ed>1e-4)) return null;
  const pos=zubHeadMesh.geometry.attributes.position, v=new THREE.Vector3(); zubHeadMesh.updateMatrixWorld(true);
  const mw=new THREE.Matrix4().multiplyMatrices(inv,zubHeadMesh.matrixWorld);
  let hw=0, top=-1e9, zmin=1e9, zf=[-1e9,-1e9];
  for(let i=0;i<pos.count;i++){
    v.fromBufferAttribute(pos,i).applyMatrix4(mw);
    if(Math.abs(v.y-ey)<.3*ed){ hw=Math.max(hw,Math.abs(v.x-ecx)); for(let k=0;k<2;k++) if(Math.abs(v.x-c[k].x)<.3*ed) zf[k]=Math.max(zf[k],v.z); }
    if(v.y>top) top=v.y; if(v.y>ey&&v.z<zmin) zmin=v.z;
  }
  const zfm=(zf[0]+zf[1])/2; if(!(hw>0)||!(zfm>zmin)||!(top>ey)) return null;
  return {ed,ey,ecx,zf:zfm,hw,top,zmin};
}
function zubPlatzieren(){
  if(!zubRoot) return;
  const R=REIF_M; let M=null; try{ M=kopfMasse(); }catch(e){ console.warn('Kopfmaße:',e); }
  if(!M){ zubGlas.scale.set(1,1,1); zubGlas.position.set(0,0,0); zubKopfG.scale.set(1,1,1); zubKopfG.position.set(0,0,0); return; }
  const s=M.ed/R.ed; zubGlas.scale.setScalar(s); zubGlas.position.set(M.ecx,M.ey-s*R.ey,M.zf-s*R.zf);
  const sx=M.hw/R.hw, sy=(M.top-M.ey)/(R.top-R.ey), sz=(M.zf-M.zmin)/(R.zf-R.zmin);
  zubKopfG.scale.set(sx,sy,sz); zubKopfG.position.set(M.ecx,M.ey-sy*R.ey,M.zmin-sz*R.zmin);
}
function zubSicht(){
  for(const n of ZUB_NAMEN) if(zubNodes[n]) zubNodes[n].visible=zubSel.has(n);
  zubWant=ZUB_KOPF.some(n=>zubSel.has(n))?.93:1;
}
function zubAnbringen(){
  if(!model) return;
  if(!zubRoot){ if(zubSel.size) zubLaden().then(()=>zubAnbringen()).catch(()=>{}); return; }
  model.add(zubRoot); zubPlatzieren(); zubSicht();
}
function zubNormal(){
  if(zubSel.has('sonnenbrille')&&zubSel.has('brille')) zubSel.delete('brille');
  const kopf=ZUB_KOPF.filter(n=>zubSel.has(n)); for(let i=0;i<kopf.length-1;i++) zubSel.delete(kopf[i]);   // nur ein Kopfteil (das zuletzt hinzugefügte bleibt)
}
function zubSetzen(liste,speichern){
  zubSel=new Set((liste||[]).filter(n=>ZUB_NAMEN.includes(n))); zubNormal();
  if(speichern!==false){ try{localStorage.setItem('nova_zubehoer',JSON.stringify([...zubSel]))}catch(e){} }
  if(zubRoot){ zubAnbringen(); } else if(zubSel.size) zubLaden().then(()=>zubAnbringen()).catch(()=>{});
  zubSicht(); return [...zubSel];
}
function zubBefehl(t){
  const item=/\bsonnenbrille\b/.test(t)?'sonnenbrille':/\bbrille\b/.test(t)?'brille':/\b(mütze|muetze|wollmütze|wollmuetze|bommelmütze|bommelmuetze|haube)\b/.test(t)?'muetze':/\b(cap|basecap|baseballcap|kappe|schirmmütze|schirmmuetze)\b/.test(t)?'cap':/\bkopfh(ö|oe|o)rer\b/.test(t)?'kopfhoerer':null;
  const alle=/\b(alles|alle|das zeug|den kram)\b.*\b(ab|runter|weg)\b/.test(t)||/\bnimm\b.*\b(alles|alle)\b/.test(t);
  const ab=/\b(ab|abnehmen|absetzen|runter|herunter|weg)\b/.test(t)||/\bohne\b/.test(t)||/\bkeine?n?\b.*\bmehr\b/.test(t);
  const auf=/\b(auf|an|drauf|anziehen|aufsetzen|anlegen)\b/.test(t)||/\b(setz|setze|zieh|ziehe|leg|lege|trag|trage|schnall|stülp|stuelp)\b/.test(t);
  if(!item&&!(alle&&zubSel.size)) return null;
  if(!item&&alle){ zubSetzen([]); return {text:'In Ordnung.',exp:'neutral'}; }
  if(ab&&!/\b(setz|setze)\b.*\b(auf)\b/.test(t)){
    const s=[...zubSel].filter(n=>n!==item); zubSetzen(s); return {text:'Okay, '+ZUB_TEXT[item]+' ist ab.',exp:'neutral'};
  }
  if(auf&&/\b(wo|wer|hast|hab|habe|suche|such|finde)\b/.test(t)&&!/\b(setz|setze|zieh|ziehe|leg|lege|trag|trage|mach|mache|nimm)\b/.test(t)) return null;
  if(auf){
    const s=[...zubSel].filter(n=>n!==item); s.push(item); zubSetzen(s);
    const txt={brille:'So besser?',sonnenbrille:'Cool, oder?',muetze:'Schön warm.',cap:'Wie sehe ich aus?',kopfhoerer:'Wie gefällt dir das?'}[item];
    return {text:txt,exp:item==='sonnenbrille'?'smug':item==='muetze'?'pleased':'amused',zub:item};
  }
  return null;
}
function sag(text,exp,ohneWeiter){
  try{ if(exp){ setExpression(exp); manualExpressionUntil=performance.now()+4500; } }catch(e){}
  try{ if(typeof window.speak==='function') window.speak(text,ohneWeiter?undefined:(typeof window.continueConversation==='function'?window.continueConversation:undefined)); }catch(e){}
}

// Kopf schaut von selbst mal hierhin, mal dorthin (Augen schauen zuerst), nickt leicht beim Sprechen.
const look={y:0,x:0,z:0,ty:0,tx:0,tz:0,next:0,nod:0};
function updateLook(now,dt,st,speaking){
  if(!JV_KOPFBEWEGUNG){look.y=look.x=look.z=0;return}
  const gz=JV_BLICK_FINGER&&now<gaze.until&&sleepLevel<.3;
  gaze.w+=((gz?1:0)-gaze.w)*(1-Math.exp(-dt*(gz?9:2.5)));
  if(now>look.next){
    const quiet=Math.random()<.35;
    const amp=(st==='thinking')?.55:(speaking?.45:.7);
    look.ty=quiet?(Math.random()-.5)*.12:(Math.random()<.5?-1:1)*(.18+Math.random()*.22)*amp/.7;
    look.tx=(Math.random()-.45)*(quiet?.05:.16);
    look.tz=(Math.random()-.5)*(quiet?.03:.09);
    look.next=now+(speaking?2200:3200)+Math.random()*(speaking?3200:6500);
  }
  if(gz){ look.ty=gaze.x*.30; look.tx=gaze.y*.13; look.tz=0; look.next=Math.max(look.next,gaze.until+500); }
  if(sleepLevel>.3){ look.ty=look.tx=look.tz=0; look.next=now+1500; }
  const k=1-Math.exp(-dt*(gz?3.6:2.0));
  look.y+=(look.ty-look.y)*k; look.x+=(look.tx-look.x)*k; look.z+=(look.tz-look.z)*k;
  look.nod=speaking?Math.sin(now*.0062)*.028*(.4+.6*Math.max(0,Math.sin(now*.0019))):look.nod*.9;
  updatePose(now,dt,st);
  // Augen schauen etwas früher in die Blickrichtung
  if(expression!=='thinking'||gaze.w>.02){
    let d=Math.max(-1,Math.min(1,look.ty/.4))*.6;
    if(gaze.w>.01) d=d*(1-gaze.w)+Math.max(-1,Math.min(1,gaze.x))*.95*gaze.w;
    const u=Math.max(0,d), v=Math.max(0,-d);
    setMorph('eyeLookOut_L',u);setMorph('eyeLookIn_R',u);setMorph('eyeLookIn_L',v);setMorph('eyeLookOut_R',v);
    if(gaze.w>.02){ gaze.dirty=true; const up=Math.max(0,-gaze.y)*.9*gaze.w, dn=Math.max(0,gaze.y)*.8*gaze.w;
      setMorph('eyeLookUp_L',up);setMorph('eyeLookUp_R',up);setMorph('eyeLookDown_L',dn);setMorph('eyeLookDown_R',dn); }
    else if(gaze.dirty){ gaze.dirty=false; setExpression(expression); }
  }
}
function loop(now){if(!active){raf=0;return}raf=requestAnimationFrame(loop);const dt=Math.min(.05,(now-(loop.last||now))/1000);loop.last=now;
 let speaking=!!(window.__jvLipAudio&&!window.__jvLipAudio.paused&&!window.__jvLipAudio.ended);
 const st=syncAvatarState(now); updateLook(now,dt,st,speaking); applyMorphs(dt,speaking,now);
 schlafStep(dt,now,st);
 const baseY=Math.sin(now*.00055)*.035*(1-sleepLevel), baseX=Math.sin(now*.0007)*.008;
 root.rotation.y=baseY+(st==='thinking'?.055:0)+look.y+pose.y;
 root.rotation.x=baseX+(st==='listening'?-.018:st==='thinking'?-.010:0)+look.x+look.nod+pose.x+.17*sleepLevel; root.rotation.z=look.z+pose.z+.05*sleepLevel;
 const atem=Math.sin(now*.0017)*sleepLevel;
 root.position.y=Math.sin(now*.0011)*.012*(1-sleepLevel)+(st==='listening'?.008:0)+atem*.012-(1-zubS)*.55;
 root.scale.setScalar(zubS*(1+.006*atem));
 updateBackground(now,dt,st,speaking);
 renderer.render(scene,camera)}
function setMode(on){active=!!on; const sphere=document.getElementById('jarvisSphere'); const holo=document.getElementById('jarvisHolo'); btn.classList.toggle('active',active); btn.textContent=active?'● 3D':'○ 3D'; if(!active){renderer.domElement.style.display='none';hideStatus();if(sphere)sphere.style.visibility='';if(holo)holo.style.visibility='';return;} if(!modelReady){renderer.domElement.style.display='none';showStatus('3D-Kopf wird geladen …');if(sphere)sphere.style.visibility='';if(holo)holo.style.visibility='';return;} renderer.domElement.style.display='block';hideStatus();if(sphere)sphere.style.visibility='hidden';if(holo)holo.style.visibility='hidden';if(!raf){loop.last=performance.now();raf=requestAnimationFrame(loop)}}
const btn=document.createElement('button');btn.id='jv3dToggle';btn.type='button';btn.textContent='● 3D';btn.title='JARVIS 3D-Kopf';btn.style.cssText='position:absolute;left:6px;top:6px;z-index:9;border:1px solid #16cce8;border-radius:999px;background:#07131ddd;color:#9df6ff;padding:7px 10px;font:700 11px system-ui;letter-spacing:.04em;cursor:pointer;box-shadow:0 0 16px #00bfff33';holder.appendChild(btn);btn.onclick=()=>setMode(!active);
window.jvAvatar3D={setMode,setExpression:function(n){ if(kiMimikAktiv()) return; return setExpression(n); },expressions:['neutral','friendly','happy','laugh','sad','serious','surprised','thinking','concerned','skeptical','question','browsup','browsdown','amused','pleased','disgust','angry','tired','awe','doubt','smug','cheeky','unsure','puh','kiss','relaxed','scared','puzzled'],update(p={}){if(p.expression)setExpression(p.expression);if(p.mouth!=null)manualMouth=Math.max(0,Math.min(1,p.mouth));if(p.blink)blink=1;if(p.tongue){tongueUntil=performance.now()+Math.max(400,Number(p.tongueMs)||2200)}},tongue(ms=2200){const tn=tongueMorphName();if(!tn)return false;tongueUntil=performance.now()+ms;return true},grimasse:setGrimasse,get state(){return avatarState()},get active(){return active},get busy(){const n=performance.now();return n<manualExpressionUntil||n<tongueUntil},get ready(){return modelReady},get morphs(){return [...morphNames]},get hasTongue(){return !!tongueMorphName()}};
window.jvAvatar3D.setHead=setHead; window.jvAvatar3D.sleep=function(on){ if(on){sleepForced=true;forcedGrace=0}else{sleepForced=false;lastActive=performance.now()} }; window.jvAvatar3D.zubehoer=function(l){ return zubSetzen(Array.isArray(l)?l:[],true) }; window.jvAvatar3D.mirror=function(t){ try{spiegeln(t)}catch(e){} }; try{Object.defineProperty(window.jvAvatar3D,'kopf',{get(){return kopfArt}})}catch(e){}
// Direkte Mimik-Sprachbefehle: werden lokal ausgeführt, statt an die KI geschickt zu werden.
window.handleAvatarExpressionCommand=function(text){
 const t=String(text||'').toLowerCase().replace(/[.,!?;:]+/g,' ').replace(/\s+/g,' ').trim();
 let exp=null, answer='';
 if(/\b(zunge|zungen)\b/.test(t)&&/\b(raus|heraus|zeig|zeigen|streck|strecke|strecken)\b/.test(t)){
   const tn=tongueMorphName();
   if(tn){ setExpression('happy'); manualExpressionUntil=performance.now()+3500; tongueUntil=performance.now()+2400; answer='Na gut.'; }
   else { answer='Mein aktuelles 3D-Modell meldet gerade keinen Zungen-Morph.'; }
   try{if(typeof window.speak==='function')window.speak(answer,typeof window.continueConversation==='function'?window.continueConversation:undefined);}catch(e){}
   return true;
 }
 if(/augenbrau/.test(t)&&/\b(eine|einen|einer|links|rechts|skeptisch)\b/.test(t)&&/\b(hoch|heb|hebe|zieh|ziehe)/.test(t)){exp='skeptical';answer='Hm?';}
 else if(/augenbrau/.test(t)&&/\b(runter|senk|senke|tief)/.test(t)){exp='browsdown';answer='In Ordnung.';}
 else if(/augenbrau/.test(t)&&/\b(hoch|heb|hebe|zieh|ziehe)/.test(t)){exp='browsup';answer='So?';}
 else if(/\b(lächel|laechel|lächeln|laecheln|schau freundlich|sei freundlich)\b/.test(t)){exp='happy';answer='Natürlich.';}
 else if(/\b(lach|lache|lachen)\b/.test(t)){exp='laugh';answer='Sehr gern.';}
 else if(/\b(schau ernst|sei ernst|ernst schauen|schau böse|schau boese)\b/.test(t)){exp='serious';answer='In Ordnung.';}
 else if(/\b(schau traurig|sei traurig|traurig schauen)\b/.test(t)){exp='sad';answer='In Ordnung.';}
 else if(/\b(schau überrascht|schau ueberrascht|sei überrascht|sei ueberrascht)\b/.test(t)){exp='surprised';answer='Oh!';}
 else if(/\b(schau besorgt|sei besorgt)\b/.test(t)){exp='concerned';answer='In Ordnung.';}
 else if(/\b(schau nachdenklich|denk nach|sei nachdenklich)\b/.test(t)){exp='thinking';answer='Hm.';}
 else if(/\b(zwinker|zwinkere|zwinkern)\b/.test(t)){blink=1;manualExpressionUntil=performance.now()+1800;answer='Na klar.';try{if(typeof window.speak==='function')window.speak(answer,typeof window.continueConversation==='function'?window.continueConversation:undefined);}catch(e){}return true;}
 else if(/\b(neutral schauen|schau neutral|mimik neutral|normal schauen)\b/.test(t)){exp='neutral';answer='In Ordnung.';}
 if(!exp)return false;
 setExpression(exp); manualExpressionUntil=performance.now()+4500;
 try{if(typeof window.speak==='function')window.speak(answer,typeof window.continueConversation==='function'?window.continueConversation:undefined);}catch(e){}
 return true;
};
// v7: Zubehör- und Schlaf-Befehle zuerst, danach die bisherigen Mimik-Befehle; was keiner kennt, wird zum Spiegeln genutzt.
(function(){
 const orig=window.handleAvatarExpressionCommand;
 window.handleAvatarExpressionCommand=function(text){
   const t=String(text||'').toLowerCase().replace(/[.,!?;:]+/g,' ').replace(/\s+/g,' ').trim();
   try{ const a=zubBefehl(t); if(a){ sag(a.text,a.exp); return true; } }catch(e){ console.warn(e); }
   try{
     if(JV_SCHLAF&&/\b(geh schlafen|schlaf jetzt|schlaf ein|mach (die )?augen zu|schlafmodus|leg dich schlafen|schlaf gut nova)\b/.test(t)){
       sleepForced=true; forcedGrace=performance.now()+10000; sag('Gute Nacht.',null,true); return true; }
     if(/\b(wach auf|aufwachen|augen auf)\b/.test(t)){ sleepForced=false; lastActive=performance.now(); sag('Bin wach.','friendly'); return true; }
   }catch(e){}
   const r=orig?orig.apply(this,arguments):false;
   if(!r){ try{ spiegeln(text); }catch(e){} }
   return r;
 };
})();

})();
