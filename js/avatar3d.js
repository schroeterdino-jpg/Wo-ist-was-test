/* JARVIS 3D v6.10 – v5-Basis + Fish-Audio-Lippensync + Robot-Material direkt auf FaceCap. */
(async function(){
'use strict';
const JV_HINTERGRUND=false; // Die alte Glaskugel samt Scan-Strahl ist aus; den Hologramm-Hintergrund zeichnet js/holo_look.js (true = alter Hintergrund)
const JV_KOPFBEWEGUNG=true; // false = Kopf bleibt (fast) still
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
const scene=new THREE.Scene(); const camera=new THREE.PerspectiveCamera(28,1,.01,100); camera.position.set(0,.03,4.4);
scene.add(new THREE.HemisphereLight(0xd9f7ff,0x071018,1.55));
let key=new THREE.DirectionalLight(0xf3fbff,2.35);key.position.set(2.5,3.5,4);scene.add(key);
let rim=new THREE.DirectionalLight(0x35d7ff,1.45);rim.position.set(-3,1,-1);scene.add(rim);
let fill=new THREE.PointLight(0x6be9ff,5.5,8);fill.position.set(2,-1,2);scene.add(fill);
const root=new THREE.Group();scene.add(root);
// ---------- Jarvis-Hintergrund: Hologramm-Ringe + Partikel + Schein (hinter dem Kopf) ----------
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
  case 'sad': both('mouthFrown',.68);setMorph('browInnerUp',.72);both('eyeSquint',.12);break;
  case 'serious': both('browDown',.48);both('mouthPress',.28);break;
  case 'surprised': both('eyeWide',.72);setMorph('browInnerUp',.75);both('browOuterUp',.62);setMorph('jawOpen',.38);break;
  case 'thinking': setMorph('eyeLookUp_R',.35);setMorph('eyeLookUp_L',.35);setMorph('eyeLookOut_R',.22);setMorph('eyeLookIn_L',.22);setMorph('mouthPucker',.16);setMorph('browInnerUp',.18);break;
  case 'concerned': setMorph('browInnerUp',.52);both('browDown',.22);both('mouthFrown',.35);break;
  // Neu: einzelne Brauen. Skeptisch = linke Braue hoch, rechte leicht runter.
  case 'skeptical': setMorph('browOuterUp_L',.85);setMorph('browInnerUp',.12);setMorph('browDown_R',.4);both('mouthSmile',.12);break;
  case 'question': setMorph('browInnerUp',.3);both('browOuterUp',.38);break;
  case 'browsup': setMorph('browInnerUp',.55);both('browOuterUp',.6);break;
  case 'browsdown': both('browDown',.75);break;
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

gltfLoader.load('./models/facecap.glb?v=5',g=>{
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
     if(part==='teeth'){
       // Zähne sind im echten GLB ein eigener Knoten: sauber weiß, ohne die Gesichtsfarbe zu übernehmen.
       const m=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.30,metalness:0,side:THREE.DoubleSide});
       m.needsUpdate=true; return m;
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
 const sc=2.34/Math.max(size.y,.001); model.scale.multiplyScalar(sc); model.updateMatrixWorld(true);
 box=new THREE.Box3().setFromObject(model); const center=new THREE.Vector3();box.getCenter(center);
 model.position.x-=center.x; model.position.y-=center.y+.04; model.position.z-=center.z;
 model.updateMatrixWorld(true);
 modelReady=true; setExpression('friendly'); btn.textContent='● 3D'; hideStatus(); if(active){renderer.domElement.style.display='block'; const sphere=document.getElementById('jarvisSphere');const holo=document.getElementById('jarvisHolo');if(sphere)sphere.style.visibility='hidden';if(holo)holo.style.visibility='hidden';if(!raf){loop.last=performance.now();raf=requestAnimationFrame(loop)}}
 console.info('JARVIS 3D v6.7 bereit – Größe:',size,'Morph Targets:',[...morphNames]);
},p=>{if(active&&p.total)showStatus('GLB lädt … '+Math.round(p.loaded/p.total*100)+' %')},e=>{console.error('JARVIS 3D: facecap.glb konnte nicht geladen werden',e);btn.textContent='⚠ 3D';btn.title='facecap.glb konnte nicht geladen werden';const msg=(e&&e.message)?e.message:String(e||'Unbekannter Fehler');
showStatus('✕ GLB-Fehler: '+msg.slice(0,120),true);});

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
 if(/^[fvw]$/.test(u)||u==='ph') return {kind:'FV',amp:.16};
 if(/^(o|ö|u|ü|au|eu|äu)$/.test(u)) return {kind:'OU',amp:.34};
 if(/^(e|i|ä|y|ei|ai|ie)$/.test(u)) return {kind:'EI',amp:.25};
 if(/^(s|z|ß|sch|ch|j|x)$/.test(u)) return {kind:'S',amp:.17};
 if(/^[l]$/.test(u)) return {kind:'L',amp:.20};
 return {kind:'A',amp:.38};
}
function applySpeechShape(shape){
 clearSpeechMorphs(); if(!shape||shape.kind==='REST') return;
 const a=shape.amp||.2;
 switch(shape.kind){
  case 'MBP': setMorph('mouthClose',.72);setMorph('mouthPress_L',.38);setMorph('mouthPress_R',.38);break;
  case 'FV': setMorph('jawOpen',.08);setMorph('mouthRollLower',.34);setMorph('mouthUpperUp_L',.16);setMorph('mouthUpperUp_R',.16);break;
  case 'OU': setMorph('jawOpen',a*.75);setMorph('mouthFunnel',.48);setMorph('mouthPucker',.44);break;
  case 'EI': setMorph('jawOpen',a*.55);setMorph('mouthStretch_L',.38);setMorph('mouthStretch_R',.38);setMorph('mouthUpperUp_L',.12);setMorph('mouthUpperUp_R',.12);break;
  case 'S': setMorph('jawOpen',.10);setMorph('mouthStretch_L',.16);setMorph('mouthStretch_R',.16);break;
  case 'L': setMorph('jawOpen',.20);setMorph('mouthUpperUp_L',.10);setMorph('mouthUpperUp_R',.10);break;
  default: setMorph('jawOpen',a);setMorph('mouthLowerDown_L',a*.34);setMorph('mouthLowerDown_R',a*.34);setMorph('mouthUpperUp_L',a*.15);setMorph('mouthUpperUp_R',a*.15);
 }
}
function tongueMorphName(){
 for(const n of morphNames){ if(/^tongue[_-]?out$/i.test(n)||/^tongueout$/i.test(n)) return n; }
 return null;
}
function emotionFromSpeech(text){
 const t=String(text||'').toLowerCase();
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
 lastEmotionText=text;
 if(performance.now()<manualExpressionUntil) return;
 setExpression(emotionFromSpeech(text));
}
function applyMorphs(dt,speaking,now){
 syncEmotionToFish();
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
 if(fishSpeaking) applySpeechShape(lipShapeForText(text,audio));
 else if(manualMouth>0){clearSpeechMorphs();setMorph('jawOpen',manualMouth)}
 else clearSpeechMorphs();
 // Grimassen (js/grimassen.js): liegen als Überlagerung oben drauf, damit das Aufräumen der Mundformen sie nicht löscht.
 if(grimass&&!fishSpeaking) for(const n in grimass) setMorph(n,grimass[n]);
 if(expression==='laugh'&&!fishSpeaking)setMorph('jawOpen',Math.max(target.jawOpen||0,.28));
 if(expression==='surprised'&&!fishSpeaking)setMorph('jawOpen',Math.max(target.jawOpen||0,.34));
 for(const n of morphNames){const want=target[n]||0;current[n]+=(want-current[n])*Math.min(1,dt*14)}
 { const b1=resolveMorphName('eyeBlink_L'),b2=resolveMorphName('eyeBlink_R'); if(b1)current[b1]=Math.max(0,Math.min(1,blinkVal)); if(b2)current[b2]=Math.max(0,Math.min(1,blinkVal)); }
 for(const m of morphMeshes)for(const n of morphNames){const i=morphIndex(m,n);if(i>=0)m.morphTargetInfluences[i]=current[n]||0}
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
 if(st!==lastAvatarState && now>=manualExpressionUntil){
   lastAvatarState=st;
   if(st==='listening')setExpression('friendly');
   else if(st==='thinking')setExpression('thinking');
   else if(st==='idle')setExpression('friendly');
 }
 return st;
}
// Kopf schaut von selbst mal hierhin, mal dorthin (Augen schauen zuerst), nickt leicht beim Sprechen.
const look={y:0,x:0,z:0,ty:0,tx:0,tz:0,next:0,nod:0};
function updateLook(now,dt,st,speaking){
  if(!JV_KOPFBEWEGUNG){look.y=look.x=look.z=0;return}
  if(now>look.next){
    const quiet=Math.random()<.35;
    const amp=(st==='thinking')?.55:(speaking?.45:.7);
    look.ty=quiet?(Math.random()-.5)*.12:(Math.random()<.5?-1:1)*(.18+Math.random()*.22)*amp/.7;
    look.tx=(Math.random()-.45)*(quiet?.05:.16);
    look.tz=(Math.random()-.5)*(quiet?.03:.09);
    look.next=now+(speaking?2200:3200)+Math.random()*(speaking?3200:6500);
  }
  const k=1-Math.exp(-dt*2.0);
  look.y+=(look.ty-look.y)*k; look.x+=(look.tx-look.x)*k; look.z+=(look.tz-look.z)*k;
  look.nod=speaking?Math.sin(now*.0062)*.028*(.4+.6*Math.max(0,Math.sin(now*.0019))):look.nod*.9;
  // Augen schauen etwas früher in die Blickrichtung
  if(expression!=='thinking'){
    const d=Math.max(-1,Math.min(1,look.ty/.4))*.6, u=Math.max(0,d), v=Math.max(0,-d);
    setMorph('eyeLookOut_L',u);setMorph('eyeLookIn_R',u);setMorph('eyeLookIn_L',v);setMorph('eyeLookOut_R',v);
  }
}
function loop(now){if(!active){raf=0;return}raf=requestAnimationFrame(loop);const dt=Math.min(.05,(now-(loop.last||now))/1000);loop.last=now;
 let speaking=!!(window.__jvLipAudio&&!window.__jvLipAudio.paused&&!window.__jvLipAudio.ended);
 const st=syncAvatarState(now); updateLook(now,dt,st,speaking); applyMorphs(dt,speaking,now);
 const baseY=Math.sin(now*.00055)*.035, baseX=Math.sin(now*.0007)*.008;
 root.rotation.y=baseY+(st==='thinking'?.055:0)+look.y;
 root.rotation.x=baseX+(st==='listening'?-.018:st==='thinking'?-.010:0)+look.x+look.nod; root.rotation.z=look.z;
 root.position.y=Math.sin(now*.0011)*.012+(st==='listening'?.008:0);
 updateBackground(now,dt,st,speaking);
 renderer.render(scene,camera)}
function setMode(on){active=!!on; const sphere=document.getElementById('jarvisSphere'); const holo=document.getElementById('jarvisHolo'); btn.classList.toggle('active',active); btn.textContent=active?'● 3D':'○ 3D'; if(!active){renderer.domElement.style.display='none';hideStatus();if(sphere)sphere.style.visibility='';if(holo)holo.style.visibility='';return;} if(!modelReady){renderer.domElement.style.display='none';showStatus('3D-Kopf wird geladen …');if(sphere)sphere.style.visibility='';if(holo)holo.style.visibility='';return;} renderer.domElement.style.display='block';hideStatus();if(sphere)sphere.style.visibility='hidden';if(holo)holo.style.visibility='hidden';if(!raf){loop.last=performance.now();raf=requestAnimationFrame(loop)}}
const btn=document.createElement('button');btn.id='jv3dToggle';btn.type='button';btn.textContent='● 3D';btn.title='JARVIS 3D-Kopf';btn.style.cssText='position:absolute;left:6px;top:6px;z-index:9;border:1px solid #16cce8;border-radius:999px;background:#07131ddd;color:#9df6ff;padding:7px 10px;font:700 11px system-ui;letter-spacing:.04em;cursor:pointer;box-shadow:0 0 16px #00bfff33';holder.appendChild(btn);btn.onclick=()=>setMode(!active);
window.jvAvatar3D={setMode,setExpression,expressions:['neutral','friendly','happy','laugh','sad','serious','surprised','thinking','concerned','skeptical','question','browsup','browsdown'],update(p={}){if(p.expression)setExpression(p.expression);if(p.mouth!=null)manualMouth=Math.max(0,Math.min(1,p.mouth));if(p.blink)blink=1;if(p.tongue){tongueUntil=performance.now()+Math.max(400,Number(p.tongueMs)||2200)}},tongue(ms=2200){const tn=tongueMorphName();if(!tn)return false;tongueUntil=performance.now()+ms;return true},grimasse:setGrimasse,get state(){return avatarState()},get active(){return active},get busy(){const n=performance.now();return n<manualExpressionUntil||n<tongueUntil},get ready(){return modelReady},get morphs(){return [...morphNames]},get hasTongue(){return !!tongueMorphName()}};
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
})();
