/* Jarvis 3D-Avatar: optionale 3D-Ansicht zusätzlich zum bisherigen Hologramm. */
(async function(){
'use strict';
let THREE;
try { THREE = await import('https://cdn.jsdelivr.net/npm/three@0.161.0/build/three.module.js'); }
catch(e){ console.warn('Jarvis 3D konnte Three.js nicht laden:',e); return; }
const holder=document.querySelector('.holo-container');
if(!holder) return;
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true});
renderer.setPixelRatio(Math.min(devicePixelRatio||1,2));
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.domElement.id='jarvisAvatar3D';
renderer.domElement.style.cssText='position:absolute;inset:0;width:100%;height:100%;display:none;z-index:3;pointer-events:none';
holder.appendChild(renderer.domElement);
const scene=new THREE.Scene();
const camera=new THREE.PerspectiveCamera(35,1,.1,50);camera.position.set(0,.05,7.5);
scene.add(new THREE.HemisphereLight(0x9defff,0x10141e,2));
const key=new THREE.DirectionalLight(0xc9f8ff,3);key.position.set(3,5,6);scene.add(key);
const rim=new THREE.PointLight(0x18ffc9,25,10);rim.position.set(-3,2,2);scene.add(rim);
const goldLight=new THREE.PointLight(0xffb51b,15,5);goldLight.position.set(0,1,2);scene.add(goldLight);
const mat=(c,m=.7,r=.28,e=0,ei=0)=>new THREE.MeshStandardMaterial({color:c,metalness:m,roughness:r,emissive:e,emissiveIntensity:ei});
const silver=mat(0xb9cbd0,.86,.25),dark=mat(0x101d26,.8,.25),black=mat(0x02080d,.3,.12),green=mat(0x18ffb0,.35,.18,0x00ff9d,2.5),gold=mat(0xffc844,.72,.2,0xffa900,2.1);
const glass=new THREE.MeshPhysicalMaterial({color:0x8dffe2,metalness:.15,roughness:.1,transparent:true,opacity:.2,transmission:.15});
const root=new THREE.Group();scene.add(root);const head=new THREE.Group();root.add(head);
function mesh(g,m,p,pos,sc){let o=new THREE.Mesh(g,m);o.position.set(...pos);if(sc)o.scale.set(...sc);p.add(o);return o}
function sph(p,m,pos,sc){return mesh(new THREE.SphereGeometry(1,32,24),m,p,pos,sc)}
// shoulders and chest
sph(root,silver,[0,-1.8,0],[1.48,.42,.55]);sph(root,dark,[0,-2.03,-.02],[1.05,.25,.4]);
for(const s of [-1,1]){sph(root,silver,[s*.9,-1.78,.04],[.42,.32,.45]);sph(root,dark,[s*.8,-1.58,.28],[.22,.3,.16]);}
sph(head,dark,[0,-1.28,-.03],[.43,.58,.38]);
for(const y of [-1.53,-1.3,-1.08]){let r=mesh(new THREE.TorusGeometry(.36,.04,8,36),silver,head,[0,y,.05]);r.scale.y=.9}
sph(head,gold,[0,-1.32,.36],[.12,.19,.07]);
sph(head,silver,[0,.02,0],[.88,1.16,.66]);sph(head,silver,[0,-.43,.25],[.72,.58,.47]);
mesh(new THREE.SphereGeometry(1,40,24,0,Math.PI*2,0,Math.PI*.56),glass,head,[0,.52,-.02],[.79,.76,.64]);
let rimD=mesh(new THREE.TorusGeometry(.77,.045,10,56),mat(0x8effdf,.5,.18,0x2bffbf,1.5),head,[0,.36,0]);rimD.scale.y=.75;
for(let i=0;i<5;i++){let coil=mesh(new THREE.TorusKnotGeometry(.14+i*.018,.016,64,6,2+i%3,3),mat(0x77ffd6,.3,.18,0x38ffb7,2),head,[(i-2)*.13,.58+Math.sin(i)*.07,.18]);coil.scale.set(.8,.75,.7)}
mesh(new THREE.OctahedronGeometry(.32,1),dark,head,[0,.52,.59],[.9,1.2,.32]);
let core=mesh(new THREE.OctahedronGeometry(.22,1),gold,head,[0,.52,.69],[.75,1.4,.35]);
sph(head,mat(0xffffff,.1,.1,0xffe68b,3),[0,.52,.76],[.06,.1,.03]);
const eyes=[];
for(const s of [-1,1]){
 sph(head,dark,[s*.87,.03,-.02],[.17,.4,.32]);sph(head,silver,[s*.96,.02,.04],[.11,.27,.22]);sph(head,green,[s*.99,.04,.22],[.04,.11,.07]);
 sph(head,dark,[s*.38,.06,.58],[.30,.18,.1]);sph(head,black,[s*.38,.06,.64],[.24,.13,.06]);sph(head,green,[s*.38,.06,.69],[.125,.095,.035]);sph(head,black,[s*.38,.06,.72],[.05,.06,.018]);
 let brow=mesh(new THREE.BoxGeometry(.52,.08,.12),dark,head,[s*.38,.29,.59]);brow.rotation.z=s*-.1;
 eyes.push({s,brow});
 sph(head,silver,[s*.58,-.31,.51],[.22,.38,.12]);
}
sph(head,silver,[0,-.08,.62],[.13,.38,.16]);sph(head,silver,[0,-.34,.68],[.17,.12,.17]);
const mouth=new THREE.Group();mouth.position.set(0,-.56,.68);head.add(mouth);
const cavity=sph(mouth,black,[0,0,0],[.27,.025,.035]);
const teeth=sph(mouth,mat(0xe8f5ef,.1,.2),[0,.01,.025],[.18,.012,.014]);
const upper=mesh(new THREE.TorusGeometry(.2,.027,8,32,Math.PI),silver,mouth,[0,.01,.025]);upper.rotation.z=Math.PI;
const lower=mesh(new THREE.TorusGeometry(.2,.027,8,32,Math.PI),silver,mouth,[0,-.01,.025]);
for(let s of [-1,1]){let plate=mesh(new THREE.BoxGeometry(.29,.38,.07),silver,head,[s*.58,-.34,.53]);plate.rotation.z=s*.4}
let smile=0,mouthOpen=0,blink=0,autoYaw=0,active=false,raf=0,last=performance.now();
function resize(){let w=holder.clientWidth||400,h=holder.clientHeight||400;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix()}
new ResizeObserver(resize).observe(holder);resize();
function loop(now){raf=requestAnimationFrame(loop);let dt=Math.min((now-last)/1000,.05);last=now;
let speaking=false;try{speaking=!!(window.speechSynthesis&&window.speechSynthesis.speaking)}catch(e){}
try{if(typeof currentAudio!=='undefined'&&currentAudio&&!currentAudio.paused&&!currentAudio.ended)speaking=true}catch(e){}
mouthOpen+=( (speaking ? .13+Math.abs(Math.sin(now*.018))*.42 : 0)-mouthOpen)*.24;
cavity.scale.y=.025+mouthOpen*.21;teeth.position.y=.01-mouthOpen*.03;teeth.scale.y=.012*(1-mouthOpen*.75);lower.position.y=-.01-mouthOpen*.09+smile*.015;
head.rotation.y+=(autoYaw-head.rotation.y)*.06;head.rotation.z+=(-.015-head.rotation.z)*.03;head.position.y=Math.sin(now*.0012)*.018;
if(Math.random()<.002)blink=1;blink=Math.max(0,blink-dt*5);
eyes.forEach(({brow})=>{brow.position.y=.29+blink*.02;brow.scale.y=1-blink*.75});
core.rotation.y=Math.sin(now*.001)*.12;core.material.emissiveIntensity=1.7+Math.sin(now*.004)*.4;
renderer.render(scene,camera)}
function setMode(on){active=on;renderer.domElement.style.display=on?'block':'none';const old=document.getElementById('jarvisHolo');if(old)old.style.display=on?'none':'';const btn=document.getElementById('jv3dToggle');if(btn){btn.textContent=on?'◉ 3D-Kopf':'◈ 3D-Kopf';btn.classList.toggle('active',on)}if(on&&!raf)raf=requestAnimationFrame(loop);if(!on){const c=document.getElementById('jarvisHolo');if(c&&document.body.classList.contains('jv-holo'))c.style.display='block'}}
const btn=document.createElement('button');btn.id='jv3dToggle';btn.type='button';btn.textContent='◈ 3D-Kopf';btn.title='Zwischen bisherigem Hologramm und neuem 3D-Kopf wechseln';btn.style.cssText='position:absolute;right:12px;top:12px;z-index:8;border:1px solid #4be7d1;border-radius:9px;background:#09232bdd;color:#bffff2;padding:8px 10px;font:600 12px system-ui;cursor:pointer;display:none';
holder.appendChild(btn);btn.addEventListener('click',()=>setMode(!active));
const css=document.createElement('style');css.textContent='body.jv-holo #jv3dToggle{display:block} body:not(.jv-holo) #jv3dToggle{display:none}';document.head.appendChild(css);
const mo=new MutationObserver(()=>{if(!document.body.classList.contains('jv-holo'))setMode(false)});mo.observe(document.body,{attributes:true,attributeFilter:['class']});
window.jvAvatar3D={setMode, setExpression(name){smile=name==='happy'?.8:0;}, update(p={}){if(p.mouth!=null)mouthOpen=Math.max(0,Math.min(1,p.mouth));if(p.smile!=null)smile=p.smile;if(p.blink)blink=1;}};
})();