/* JARVIS v10 – Design + Fish-Audio-Lippensync Add-on
   Nach fish.js UND der aktuellen 3D-Kopfdatei laden. */
(async function(){
  'use strict';
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  for(let i=0;i<100 && !window.jvKopf3d;i++) await wait(100);
  if(!window.jvKopf3d || window.jvKopf3d.__v10) return;
  const K=window.jvKopf3d; K.__v10=true;

  // Kopf größer + weiter nach unten; Fish-Viseme werden vor dem vorhandenen draw() in dessen Zustandswerte übersetzt.
  const originalDraw=K.draw.bind(K);
  function viseme(){
    const L=window.__jvFishLip;
    if(!L||!L.active||!L.meta) return null;
    const now=performance.now()/1000, dur=Math.max(.15,L.meta.duration||1), rate=Math.max(.5,L.rate||1);
    const t=(now-L.start)*rate;
    if(t<0||t>dur+.12){L.active=false;return null;}
    const p=Math.max(0,Math.min(.999,t/dur));
    const units=L.meta.units||['REST'];
    const u=units[Math.min(units.length-1,Math.floor(p*units.length))];
    const env=L.meta.env||[]; const amp=env.length?env[Math.min(env.length-1,Math.floor(p*env.length))]:.75;
    return {u,amp:Math.max(.08,Math.min(1,amp))};
  }
  K.draw=function(st){
    const x=Object.assign({},st), c=Object.assign({},st.cur||{}); x.cur=c;
    // ca. 20 % größer; ca. 8 % Bildschirmhöhe tiefer.
    x.HH=(st.HH||1)*1.20;
    x.oy=(st.oy||0)+(st.H||0)*0.08;
    const v=viseme();
    if(v){
      const a=v.amp;
      // Keine Klappe: Lippenbreite/Rundung/Kiefer wechseln je Lautgruppe.
      switch(v.u){
        case 'MBP': x.mo=.015; x.mouthO=.00; c.mw=.72; break;       // M/B/P: Lippen zu
        case 'FV':  x.mo=.10*a; x.mouthO=.04; c.mw=1.10; break;    // F/V: schmal
        case 'OU':  x.mo=.24*a; x.mouthO=.90; c.mw=.58; break;    // O/U: rund
        case 'A':   x.mo=.72*a; x.mouthO=.34; c.mw=.94; break;    // A: offen
        case 'EI':  x.mo=.28*a; x.mouthO=.05; c.mw=1.42; break;    // E/I: breit
        case 'L':   x.mo=.24*a; x.mouthO=.10; c.mw=1.12; break;
        case 'K':   x.mo=.36*a; x.mouthO=.16; c.mw=.92; break;
        case 'T':   x.mo=.20*a; x.mouthO=.05; c.mw=1.06; break;
        case 'S':   x.mo=.12*a; x.mouthO=.02; c.mw=1.28; break;
        default:    x.mo=.02; x.mouthO=0; c.mw=.90;
      }
    }
    return originalDraw(x);
  };

  // Roboter-Design wird erst gebaut, wenn das GLB wirklich geladen ist.
  let THREE;
  try{THREE=await import('https://esm.sh/three@0.161.0');}catch(e){return;}
  async function build(){
    for(let i=0;i<150;i++){
      const d=K._dbg&&K._dbg(); if(d&&d.head&&d.pivot){
        const head=d.head, pivot=d.pivot, model=pivot.children&&pivot.children[0];
        if(!model||model.getObjectByName('JARVIS_V10_SHELL')) return;
        model.updateMatrixWorld(true);
        const b=new THREE.Box3().setFromObject(head,true), sz=new THREE.Vector3(), ct=new THREE.Vector3(); b.getSize(sz); b.getCenter(ct);
        // In Modellkoordinaten arbeiten. Die Kopf-BBox bestimmt alle Positionen – keine geratenen festen Meterwerte mehr.
        const root=new THREE.Group(); root.name='JARVIS_V10_SHELL'; model.add(root);
        const W=sz.x,H=sz.y,D=Math.max(sz.z,W*.45), front=b.max.z+D*.018;
        const dark=new THREE.MeshPhysicalMaterial({color:0x202a31,metalness:.72,roughness:.48,clearcoat:.08});
        const silver=new THREE.MeshPhysicalMaterial({color:0x8f9ba2,metalness:.62,roughness:.55,clearcoat:.06});
        const green=new THREE.MeshPhysicalMaterial({color:0x5dffc0,emissive:0x22ff8c,emissiveIntensity:3.4,roughness:.22,metalness:.05});
        const gold=new THREE.MeshPhysicalMaterial({color:0xffc84b,emissive:0xff9f12,emissiveIntensity:3.2,metalness:.25,roughness:.3});
        const glass=new THREE.MeshPhysicalMaterial({color:0xaeefff,transparent:true,opacity:.16,roughness:.08,metalness:.02,transmission:.35,clearcoat:.8,side:THREE.DoubleSide,depthWrite:false});
        function plate(n,w,h,x,y,rz,mat=dark){
          const m=new THREE.Mesh(new THREE.BoxGeometry(w,h,D*.035),mat); m.name=n; m.position.set(x,y,front); m.rotation.z=rz; root.add(m); return m;
        }
        // Seitliche Panzerplatten – Augen/Lippen bleiben frei beweglich.
        plate('TempleL',W*.16,H*.25,ct.x-W*.43,ct.y+H*.15,-.16);
        plate('TempleR',W*.16,H*.25,ct.x+W*.43,ct.y+H*.15,.16);
        plate('CheekL',W*.18,H*.18,ct.x-W*.38,ct.y-H*.16,.22,silver);
        plate('CheekR',W*.18,H*.18,ct.x+W*.38,ct.y-H*.16,-.22,silver);
        plate('JawL',W*.15,H*.16,ct.x-W*.29,ct.y-H*.38,.32);
        plate('JawR',W*.15,H*.16,ct.x+W*.29,ct.y-H*.38,-.32);
        plate('ForeheadRail',W*.42,H*.055,ct.x,ct.y+H*.34,0);
        // Goldener Stirnkern.
        const core=new THREE.Mesh(new THREE.OctahedronGeometry(W*.075,0),gold); core.scale.set(.72,1.28,.38); core.position.set(ct.x,ct.y+H*.34,front+D*.05); root.add(core);
        // Grüne Iris-Leuchten als dünne Kugeln knapp vor den vorhandenen Augen.
        for(const s of [-1,1]){const e=new THREE.Mesh(new THREE.SphereGeometry(W*.038,20,12),green);e.scale.set(1,.82,.28);e.position.set(ct.x+s*W*.185,ct.y+H*.105,front+D*.055);root.add(e);}
        // Transparente obere Schädelkuppel.
        const dome=new THREE.Mesh(new THREE.SphereGeometry(W*.48,36,20,0,Math.PI*2,0,Math.PI*.54),glass);
        dome.scale.set(1,.82,.78); dome.position.set(ct.x,ct.y+H*.38,ct.z); root.add(dome);
        // Organisch wirkendes, leuchtendes Gehirn unter der Kuppel.
        const brain=new THREE.Group();brain.name='JARVIS_BRAIN';brain.position.set(ct.x,ct.y+H*.40,ct.z+D*.12);root.add(brain);
        for(let i=0;i<22;i++){const q=new THREE.Mesh(new THREE.SphereGeometry(W*(.035+(i%3)*.007),12,8),green);const a=i*2.399,r=W*(.08+(i%5)*.035);q.scale.set(1.45,.72,.82);q.position.set(Math.cos(a)*r,Math.sin(a)*r*.48,(i%4)*D*.025);brain.add(q);}
        const gl=new THREE.PointLight(0x32ff9c,2.8,Math.max(W,H)*2.5);gl.position.set(ct.x,ct.y+H*.42,front+D*.2);root.add(gl);
        // Dunkler mechanischer Hals unter dem Kopf, ohne alten Cartoon-Körper.
        const neck=new THREE.Mesh(new THREE.CylinderGeometry(W*.17,W*.23,H*.30,14),dark);neck.position.set(ct.x,b.min.y-H*.13,ct.z);root.add(neck);
        // Pulsierendes Gehirn.
        const t0=performance.now(); (function pulse(){if(!brain.parent)return;const t=(performance.now()-t0)/1000,s=1+.035*Math.sin(t*2.4);brain.scale.setScalar(s);gl.intensity=2.5+.7*Math.sin(t*2.4);requestAnimationFrame(pulse);})();
        return;
      }
      await wait(100);
    }
  }
  build();
})();
