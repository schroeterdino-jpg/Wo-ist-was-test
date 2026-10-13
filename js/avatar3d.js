/* JARVIS 3D v10 – FaceCap + Robot-Look + Fish-Audio-Lippensynchronisation. */
(async function(){
'use strict';
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
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.25;
renderer.domElement.id='jarvisAvatar3D';
renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:none;z-index:4;pointer-events:none'; holder.appendChild(renderer.domElement);
const scene=new THREE.Scene(); const camera=new THREE.PerspectiveCamera(28,1,.01,100); camera.position.set(0,.03,4.4);
scene.add(new THREE.HemisphereLight(0xaeeeff,0x03070d,2.2));
let key=new THREE.DirectionalLight(0xdffaff,4.2);key.position.set(2.5,3.5,4);scene.add(key);
let rim=new THREE.DirectionalLight(0x00bfff,3.5);rim.position.set(-3,1,-1);scene.add(rim);
let fill=new THREE.PointLight(0x00eaff,18,8);fill.position.set(2,-1,2);scene.add(fill);
const root=new THREE.Group();scene.add(root); const faceRoot=new THREE.Group();root.add(faceRoot);
const cyan=0x00cfff, dark=0x111820;
const metalMat=new THREE.MeshPhysicalMaterial({color:0x66717a,metalness:.92,roughness:.28,clearcoat:.25,clearcoatRoughness:.3});
const darkMat=new THREE.MeshStandardMaterial({color:dark,metalness:.9,roughness:.3});
const glowMat=new THREE.MeshStandardMaterial({color:0x8df7ff,metalness:.2,roughness:.18,emissive:cyan,emissiveIntensity:5});
const morphMeshes=[]; let morphNames=new Set(), model=null, active=false, raf=0, blink=0, expression='neutral', manualMouth=0, modelReady=false;
const status=document.createElement('div'); status.id='jv3dStatus'; status.style.cssText='position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);z-index:10;display:none;max-width:86%;padding:9px 12px;border:1px solid #16cce8;border-radius:10px;background:#06111ee8;color:#aef7ff;font:700 12px system-ui;text-align:center;box-shadow:0 0 18px #00bfff44;pointer-events:none'; holder.appendChild(status);
function showStatus(t,err=false){status.textContent=t;status.style.borderColor=err?'#ff5b6e':'#16cce8';status.style.color=err?'#ffd5da':'#aef7ff';status.style.display='block'}
function hideStatus(){status.style.display='none'}
const target={}, current={};
function morphIndex(mesh,name){return mesh.morphTargetDictionary?.[name] ?? mesh.morphTargetDictionary?.[name.replace('_L','Left').replace('_R','Right')] ?? -1}
function setMorph(name,v){target[name]=Math.max(0,Math.min(1,v))}
function clearExpression(){for(const n of morphNames) if(!/^eyeBlink_|^jawOpen$|^mouthClose$/.test(n)) target[n]=0}
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
 }
}

// Mechanische Schulter-/Hals-Silhouette – unabhängig vom beweglichen Gesicht.
function addRobotFrame(){
 const neck=new THREE.Mesh(new THREE.CylinderGeometry(.31,.4,.72,24),darkMat);neck.position.set(0,-1.28,-.08);root.add(neck);
 const chest=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),darkMat);chest.scale.set(1.25,.30,.46);chest.position.set(0,-1.7,-.1);root.add(chest);
 for(const s of [-1,1]){const p=new THREE.Mesh(new THREE.BoxGeometry(.28,.78,.06),darkMat);p.position.set(s*.61,-.08,.14);p.rotation.z=s*.16;faceRoot.add(p);const l=new THREE.Mesh(new THREE.BoxGeometry(.045,.58,.075),glowMat);l.position.set(s*.62,-.08,.19);l.rotation.z=s*.16;faceRoot.add(l)}
 const core=new THREE.Mesh(new THREE.CylinderGeometry(.11,.11,.055,24),glowMat);core.rotation.x=Math.PI/2;core.position.set(0,.78,.28);faceRoot.add(core);
 const ring=new THREE.Mesh(new THREE.TorusGeometry(.17,.025,10,32),glowMat);ring.position.set(0,.78,.31);faceRoot.add(ring);
}
// v3: keine geometrischen Fallback-Teile mehr – erst das echte GLB anzeigen.
// addRobotFrame();

// Futuristische JARVIS-Hülle: bewusst als Zusatzgeometrie, damit das FaceCap-Gesicht und seine Morphs unangetastet bleiben.
function addJarvisShell(){
 if(faceRoot.getObjectByName('JARVIS_V10_SHELL')) return;
 model.updateMatrixWorld(true);
 const box=new THREE.Box3().setFromObject(model), sz=new THREE.Vector3(), ct=new THREE.Vector3(); box.getSize(sz); box.getCenter(ct);
 const W=sz.x,H=sz.y,D=Math.max(sz.z,W*.45), z=box.max.z+D*.025;
 const shell=new THREE.Group(); shell.name='JARVIS_V10_SHELL'; faceRoot.add(shell);
 const silver=new THREE.MeshPhysicalMaterial({color:0x7b8993,metalness:.9,roughness:.28,clearcoat:.35});
 const black=new THREE.MeshPhysicalMaterial({color:0x111820,metalness:.88,roughness:.34,clearcoat:.18});
 const green=new THREE.MeshStandardMaterial({color:0x83ffd1,emissive:0x19ff86,emissiveIntensity:4.6,roughness:.18});
 const amber=new THREE.MeshStandardMaterial({color:0xffd56a,emissive:0xff9d16,emissiveIntensity:4.2,roughness:.2});
 const glass=new THREE.MeshPhysicalMaterial({color:0x9cecff,transparent:true,opacity:.13,roughness:.08,transmission:.45,clearcoat:1,side:THREE.DoubleSide,depthWrite:false});
 function plate(w,h,x,y,r,mat=black){const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,D*.035),mat);m.position.set(x,y,z);m.rotation.z=r;shell.add(m);return m}
 // Schläfen, Wangen und Kiefer – Mitte des Gesichts bleibt frei.
 plate(W*.14,H*.25,ct.x-W*.44,ct.y+H*.10,-.13); plate(W*.14,H*.25,ct.x+W*.44,ct.y+H*.10,.13);
 plate(W*.16,H*.18,ct.x-W*.39,ct.y-H*.15,.18,silver); plate(W*.16,H*.18,ct.x+W*.39,ct.y-H*.15,-.18,silver);
 plate(W*.14,H*.15,ct.x-W*.30,ct.y-H*.36,.28); plate(W*.14,H*.15,ct.x+W*.30,ct.y-H*.36,-.28);
 plate(W*.40,H*.045,ct.x,ct.y+H*.34,0,black);
 // Stirnkern wie in der Vorlage.
 const core=new THREE.Mesh(new THREE.OctahedronGeometry(W*.07,0),amber);core.scale.set(.75,1.25,.38);core.position.set(ct.x,ct.y+H*.34,z+D*.045);shell.add(core);
 // Augen-Leuchtringe statt großer künstlicher Kugeln.
 for(const side of [-1,1]){const e=new THREE.Mesh(new THREE.TorusGeometry(W*.052,W*.009,8,28),green);e.position.set(ct.x+side*W*.185,ct.y+H*.095,z+D*.035);shell.add(e)}
 // Transparente obere Schädelkuppel + sichtbares technisches "Gehirn".
 const dome=new THREE.Mesh(new THREE.SphereGeometry(W*.46,36,18,0,Math.PI*2,0,Math.PI*.53),glass);dome.scale.set(1,.80,.72);dome.position.set(ct.x,ct.y+H*.38,ct.z);shell.add(dome);
 const brain=new THREE.Group();brain.name='JARVIS_BRAIN';brain.position.set(ct.x,ct.y+H*.40,ct.z+D*.10);shell.add(brain);
 for(let i=0;i<26;i++){const q=new THREE.Mesh(new THREE.SphereGeometry(W*(.027+(i%4)*.004),10,7),green);const a=i*2.399,r=W*(.07+(i%6)*.027);q.scale.set(1.5,.7,.8);q.position.set(Math.cos(a)*r,Math.sin(a)*r*.42,(i%5)*D*.018);brain.add(q)}
 const brainLight=new THREE.PointLight(0x24ff91,2.4,Math.max(W,H)*2.2);brainLight.position.set(ct.x,ct.y+H*.42,z+D*.12);shell.add(brainLight);
 // Mechanischer Hals und Schultern unter dem Kopf.
 const neck=new THREE.Mesh(new THREE.CylinderGeometry(W*.15,W*.21,H*.26,16),black);neck.position.set(ct.x,box.min.y-H*.10,ct.z);shell.add(neck);
 const shoulders=new THREE.Mesh(new THREE.SphereGeometry(1,28,12),black);shoulders.scale.set(W*.72,H*.12,D*.36);shoulders.position.set(ct.x,box.min.y-H*.28,ct.z-D*.04);shell.add(shoulders);
 const start=performance.now();(function pulse(){if(!brain.parent)return;const t=(performance.now()-start)/1000,q=1+.025*Math.sin(t*2.5);brain.scale.setScalar(q);brainLight.intensity=2.2+.55*Math.sin(t*2.5);requestAnimationFrame(pulse)})();
}

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
   // v3: Originalmaterial zunächst behalten. So prüfen wir zuerst zuverlässig das echte FaceCap-Modell.
   if(o.material){o.material.side=THREE.DoubleSide;o.material.needsUpdate=true;}
   if(o.morphTargetDictionary&&o.morphTargetInfluences){morphMeshes.push(o);Object.keys(o.morphTargetDictionary).forEach(n=>{morphNames.add(n);target[n]=0;current[n]=0})}
 });
 // Robust zentrieren: erst Weltmatrizen aktualisieren, dann skalieren, danach erneut messen.
 model.updateMatrixWorld(true);
 let box=new THREE.Box3().setFromObject(model), size=new THREE.Vector3();box.getSize(size);
 const sc=2.65/Math.max(size.y,.001); model.scale.multiplyScalar(sc); model.updateMatrixWorld(true);
 box=new THREE.Box3().setFromObject(model); const center=new THREE.Vector3();box.getCenter(center);
 model.position.x-=center.x; model.position.y-=center.y+.16; model.position.z-=center.z;
 model.updateMatrixWorld(true);
 addJarvisShell();
 modelReady=true; setExpression('friendly'); btn.textContent='● 3D'; showStatus('✓ GLB geladen – Kopf bereit'); if(active){renderer.domElement.style.display='block'; const sphere=document.getElementById('jarvisSphere');const holo=document.getElementById('jarvisHolo');if(sphere)sphere.style.visibility='hidden';if(holo)holo.style.visibility='hidden';if(!raf){loop.last=performance.now();raf=requestAnimationFrame(loop)}} setTimeout(()=>{if(active)hideStatus()},1400);
 console.info('JARVIS 3D v10 bereit – Größe:',size,'Morph Targets:',[...morphNames]);
},p=>{if(active&&p.total)showStatus('GLB lädt … '+Math.round(p.loaded/p.total*100)+' %')},e=>{console.error('JARVIS 3D: facecap.glb konnte nicht geladen werden',e);btn.textContent='⚠ 3D';btn.title='facecap.glb konnte nicht geladen werden';const msg=(e&&e.message)?e.message:String(e||'Unbekannter Fehler');
showStatus('✕ GLB-Fehler: '+msg.slice(0,120),true);});

function resize(){const w=holder.clientWidth||360,h=holder.clientHeight||360;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(holder);resize();
function fishViseme(now){
 const L=window.__jvFishLip;if(!L||!L.active||!L.meta)return null;
 const dur=Math.max(.12,Number(L.meta.duration)||1), rate=Math.max(.5,Number(L.rate)||1), t=(performance.now()/1000-L.start)*rate;
 if(t<0||t>dur+.10){L.active=false;return null}
 const p=Math.max(0,Math.min(.999,t/dur)), units=L.meta.units||['REST'], env=L.meta.env||[];
 const u=units[Math.min(units.length-1,Math.floor(p*units.length))]||'REST';
 const amp=env.length?env[Math.min(env.length-1,Math.floor(p*env.length))]:.72;
 return {u,amp:Math.max(.06,Math.min(1,amp))};
}
let hadFishLip=false;
function applyMorphs(dt,speaking,now){
 if(Math.random()<.0022)blink=1; blink=Math.max(0,blink-dt*5.5); setMorph('eyeBlink_L',blink);setMorph('eyeBlink_R',blink);
 const v=fishViseme(now), both=(n,x)=>{setMorph(n+'_L',x);setMorph(n+'_R',x)};
 if(v){
   hadFishLip=true; const a=v.amp;
   // Nur Mund-Morphs verändern; Augen/Brauen/Mimik bleiben erhalten.
   ['jawOpen','mouthClose','mouthFunnel','mouthPucker','mouthRollLower','mouthRollUpper'].forEach(n=>setMorph(n,0));
   ['mouthPress','mouthStretch','mouthLowerDown','mouthUpperUp','mouthDimple'].forEach(n=>both(n,0));
   switch(v.u){
    case 'MBP': setMorph('mouthClose',.82);both('mouthPress',.42);setMorph('jawOpen',.015);break;
    case 'FV': setMorph('jawOpen',.07*a);setMorph('mouthRollLower',.52);both('mouthUpperUp',.16);break;
    case 'OU': setMorph('jawOpen',.24*a);setMorph('mouthFunnel',.62);setMorph('mouthPucker',.48);break;
    case 'A': setMorph('jawOpen',.68*a);both('mouthLowerDown',.25*a);both('mouthUpperUp',.10);break;
    case 'EI': setMorph('jawOpen',.22*a);both('mouthStretch',.48);both('mouthDimple',.10);break;
    case 'L': setMorph('jawOpen',.25*a);both('mouthUpperUp',.12);break;
    case 'K': setMorph('jawOpen',.36*a);both('mouthLowerDown',.10);break;
    case 'T': setMorph('jawOpen',.18*a);both('mouthStretch',.10);break;
    case 'S': setMorph('jawOpen',.10*a);both('mouthStretch',.30);break;
    default: setMorph('mouthClose',.18);setMorph('jawOpen',.015);
   }
 }else{
   if(hadFishLip){hadFishLip=false;setExpression(expression)}
   let talk=speaking ? .05+Math.abs(Math.sin(now*.017))*.16 : manualMouth;
   if(expression==='laugh')talk=Math.max(talk,.28); if(expression==='surprised')talk=Math.max(talk,.34);
   setMorph('jawOpen',Math.max(target.jawOpen||0,talk));
 }
 for(const n of morphNames){const want=target[n]||0;current[n]+=(want-current[n])*Math.min(1,dt*13)}
 for(const m of morphMeshes)for(const n of morphNames){const i=morphIndex(m,n);if(i>=0)m.morphTargetInfluences[i]=current[n]||0}
}
function loop(now){if(!active){raf=0;return}raf=requestAnimationFrame(loop);const dt=Math.min(.05,(now-(loop.last||now))/1000);loop.last=now;
 let speaking=!!window.speechSynthesis?.speaking; try{if(window.currentAudio&&!window.currentAudio.paused&&!window.currentAudio.ended)speaking=true}catch(e){}
 applyMorphs(dt,speaking,now); root.rotation.y=Math.sin(now*.00055)*.035; root.rotation.x=Math.sin(now*.0007)*.008;root.position.y=Math.sin(now*.0011)*.012;renderer.render(scene,camera)}
function setMode(on){active=!!on; const sphere=document.getElementById('jarvisSphere'); const holo=document.getElementById('jarvisHolo'); btn.classList.toggle('active',active); btn.textContent=active?'● 3D':'○ 3D'; if(!active){renderer.domElement.style.display='none';hideStatus();if(sphere)sphere.style.visibility='';if(holo)holo.style.visibility='';return;} if(!modelReady){renderer.domElement.style.display='none';showStatus('3D-Kopf wird geladen …');if(sphere)sphere.style.visibility='';if(holo)holo.style.visibility='';return;} renderer.domElement.style.display='block';hideStatus();if(sphere)sphere.style.visibility='hidden';if(holo)holo.style.visibility='hidden';if(!raf){loop.last=performance.now();raf=requestAnimationFrame(loop)}}
const btn=document.createElement('button');btn.id='jv3dToggle';btn.type='button';btn.textContent='○ 3D';btn.title='JARVIS 3D-Kopf';btn.style.cssText='position:absolute;right:8px;top:8px;z-index:9;border:1px solid #16cce8;border-radius:999px;background:#07131ddd;color:#9df6ff;padding:7px 10px;font:700 11px system-ui;letter-spacing:.04em;cursor:pointer;box-shadow:0 0 16px #00bfff33';holder.appendChild(btn);btn.onclick=()=>setMode(!active);
window.jvAvatar3D={setMode,setExpression,expressions:['neutral','friendly','laugh','sad','serious','surprised','thinking','concerned'],update(p={}){if(p.expression)setExpression(p.expression);if(p.mouth!=null)manualMouth=Math.max(0,Math.min(1,p.mouth));if(p.blink)blink=1},get ready(){return modelReady},get morphs(){return [...morphNames]}};
})();
