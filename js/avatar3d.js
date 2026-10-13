/* JARVIS 3D v6.4 – v5-Basis + Fish-Audio-Lippensync + Robot-Material direkt auf FaceCap. */
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
renderer.toneMapping=THREE.ACESFilmicToneMapping; renderer.toneMappingExposure=1.38;
renderer.domElement.id='jarvisAvatar3D';
renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:none;z-index:4;pointer-events:none'; holder.appendChild(renderer.domElement);
const scene=new THREE.Scene(); const camera=new THREE.PerspectiveCamera(28,1,.01,100); camera.position.set(0,.03,4.4);
scene.add(new THREE.HemisphereLight(0xaeeeff,0x03070d,2.2));
let key=new THREE.DirectionalLight(0xdffaff,4.2);key.position.set(2.5,3.5,4);scene.add(key);
let rim=new THREE.DirectionalLight(0x00bfff,3.5);rim.position.set(-3,1,-1);scene.add(rim);
let fill=new THREE.PointLight(0x00eaff,18,8);fill.position.set(2,-1,2);scene.add(fill);
const root=new THREE.Group();scene.add(root); const faceRoot=new THREE.Group();root.add(faceRoot);
const cyan=0x00cfff, dark=0x111820;
const metalMat=new THREE.MeshPhysicalMaterial({color:0xb8c1c7,metalness:.58,roughness:.48,clearcoat:.10,clearcoatRoughness:.55});
const darkMat=new THREE.MeshStandardMaterial({color:dark,metalness:.9,roughness:.3});
const glowMat=new THREE.MeshStandardMaterial({color:0x8df7ff,metalness:.2,roughness:.18,emissive:cyan,emissiveIntensity:5});
const morphMeshes=[]; let morphNames=new Set(), model=null, active=false, raf=0, blink=0, expression='neutral', manualMouth=0, modelReady=false;
let speechMorphs={};
let tongueUntil=0, lastEmotionText='', manualExpressionUntil=0;
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
   if(o.material){o.material.side=THREE.DoubleSide;o.material.needsUpdate=true;}
   const nm=String(o.name||'').toLowerCase();
   const isEye=/eye|iris|pupil/.test(nm);
   if(o.morphTargetDictionary&&o.morphTargetInfluences){
     // Robot-Look DIREKT auf dem vorhandenen Mesh – keine zusätzliche Geometrie vor dem Gesicht.
     const oldMat=Array.isArray(o.material)?o.material[0]:o.material;
     if(isEye){
       o.material=new THREE.MeshStandardMaterial({color:0x36ff72,emissive:0x00e84f,emissiveIntensity:2.5,roughness:.32,metalness:.05,side:THREE.DoubleSide});
     } else {
       const robot=new THREE.MeshPhysicalMaterial({color:0xc3cbd0,metalness:.56,roughness:.48,clearcoat:.10,clearcoatRoughness:.58,side:THREE.DoubleSide});
       if(oldMat&&oldMat.normalMap) robot.normalMap=oldMat.normalMap;
       o.material=robot;
     }
     morphMeshes.push(o);Object.keys(o.morphTargetDictionary).forEach(n=>{morphNames.add(n);target[n]=0;current[n]=0})
   } else if(isEye){
     // Nur das vorhandene Augen-Mesh grün färben; nichts darüberlegen.
     o.material=new THREE.MeshStandardMaterial({color:0x36ff72,emissive:0x00e84f,emissiveIntensity:2.5,roughness:.32,metalness:.05,side:THREE.DoubleSide});
   }
 });
 // Robust zentrieren: erst Weltmatrizen aktualisieren, dann skalieren, danach erneut messen.
 model.updateMatrixWorld(true);
 let box=new THREE.Box3().setFromObject(model), size=new THREE.Vector3();box.getSize(size);
 const sc=2.34/Math.max(size.y,.001); model.scale.multiplyScalar(sc); model.updateMatrixWorld(true);
 box=new THREE.Box3().setFromObject(model); const center=new THREE.Vector3();box.getCenter(center);
 model.position.x-=center.x; model.position.y-=center.y+.04; model.position.z-=center.z;
 model.updateMatrixWorld(true);
 modelReady=true; setExpression('friendly'); btn.textContent='● 3D'; showStatus('✓ GLB geladen – Kopf bereit'); if(active){renderer.domElement.style.display='block'; const sphere=document.getElementById('jarvisSphere');const holo=document.getElementById('jarvisHolo');if(sphere)sphere.style.visibility='hidden';if(holo)holo.style.visibility='hidden';if(!raf){loop.last=performance.now();raf=requestAnimationFrame(loop)}} setTimeout(()=>{if(active)hideStatus()},1400);
 console.info('JARVIS 3D v6.4 bereit – Größe:',size,'Morph Targets:',[...morphNames]);
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
 if(Math.random()<.0022)blink=1; blink=Math.max(0,blink-dt*5.5);
 setMorph('eyeBlink_L',blink);setMorph('eyeBlink_R',blink);
 const audio=window.__jvLipAudio, text=window.__jvLipText||'';
 const fishSpeaking=!!(audio&&!audio.paused&&!audio.ended);
 if(fishSpeaking) applySpeechShape(lipShapeForText(text,audio));
 else if(manualMouth>0){clearSpeechMorphs();setMorph('jawOpen',manualMouth)}
 else clearSpeechMorphs();
 if(expression==='laugh'&&!fishSpeaking)setMorph('jawOpen',Math.max(target.jawOpen||0,.28));
 if(expression==='surprised'&&!fishSpeaking)setMorph('jawOpen',Math.max(target.jawOpen||0,.34));
 for(const n of morphNames){const want=target[n]||0;current[n]+=(want-current[n])*Math.min(1,dt*14)}
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
function loop(now){if(!active){raf=0;return}raf=requestAnimationFrame(loop);const dt=Math.min(.05,(now-(loop.last||now))/1000);loop.last=now;
 let speaking=!!(window.__jvLipAudio&&!window.__jvLipAudio.paused&&!window.__jvLipAudio.ended);
 const st=syncAvatarState(now); applyMorphs(dt,speaking,now);
 const baseY=Math.sin(now*.00055)*.035, baseX=Math.sin(now*.0007)*.008;
 root.rotation.y=baseY+(st==='thinking'?.055:0);
 root.rotation.x=baseX+(st==='listening'?-.018:st==='thinking'?-.010:0);
 root.position.y=Math.sin(now*.0011)*.012+(st==='listening'?.008:0);
 renderer.render(scene,camera)}
function setMode(on){active=!!on; const sphere=document.getElementById('jarvisSphere'); const holo=document.getElementById('jarvisHolo'); btn.classList.toggle('active',active); btn.textContent=active?'● 3D':'○ 3D'; if(!active){renderer.domElement.style.display='none';hideStatus();if(sphere)sphere.style.visibility='';if(holo)holo.style.visibility='';return;} if(!modelReady){renderer.domElement.style.display='none';showStatus('3D-Kopf wird geladen …');if(sphere)sphere.style.visibility='';if(holo)holo.style.visibility='';return;} renderer.domElement.style.display='block';hideStatus();if(sphere)sphere.style.visibility='hidden';if(holo)holo.style.visibility='hidden';if(!raf){loop.last=performance.now();raf=requestAnimationFrame(loop)}}
const btn=document.createElement('button');btn.id='jv3dToggle';btn.type='button';btn.textContent='○ 3D';btn.title='JARVIS 3D-Kopf';btn.style.cssText='position:absolute;right:8px;top:8px;z-index:9;border:1px solid #16cce8;border-radius:999px;background:#07131ddd;color:#9df6ff;padding:7px 10px;font:700 11px system-ui;letter-spacing:.04em;cursor:pointer;box-shadow:0 0 16px #00bfff33';holder.appendChild(btn);btn.onclick=()=>setMode(!active);
window.jvAvatar3D={setMode,setExpression,expressions:['neutral','friendly','happy','laugh','sad','serious','surprised','thinking','concerned'],update(p={}){if(p.expression)setExpression(p.expression);if(p.mouth!=null)manualMouth=Math.max(0,Math.min(1,p.mouth));if(p.blink)blink=1;if(p.tongue){tongueUntil=performance.now()+Math.max(400,Number(p.tongueMs)||2200)}},tongue(ms=2200){const tn=tongueMorphName();if(!tn)return false;tongueUntil=performance.now()+ms;return true},get ready(){return modelReady},get morphs(){return [...morphNames]},get hasTongue(){return !!tongueMorphName()}};
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
 if(/\b(lächel|laechel|lächeln|laecheln|schau freundlich|sei freundlich)\b/.test(t)){exp='happy';answer='Natürlich.';}
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
