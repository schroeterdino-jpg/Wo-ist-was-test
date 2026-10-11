/* Jarvis-Figur: menschlicher Kopf mit Oberkörper als Hauptansicht (ersetzt die Netzwerk-Ansicht, die per Sprache weiter erreichbar bleibt).
   Mund mit Zähnen bewegt sich beim Sprechen, Augen mit Pupillen blinzeln und rollen, Brauen heben sich, Arme und Hände machen Gesten.
   Mimik und Gesten passen zum gesprochenen Text (Warnung, Frage, Freude, Entschuldigung, Schulterzucken, Augenrollen), beim Nachdenken fasst er sich ans Kinn. */
(function () {
    'use strict';
    const KEY = 'jv_holo';
    const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
    const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
    let cv = null, cx = null, btn = null, tg = null, W = 0, H = 0, DPR = 1, raf = 0;
    let emo = 'neutral', emoUntil = 0;

    /* ---------- Stimmung aus dem gesprochenen Text ---------- */
    function detect(text) {
        const t = ' ' + String(text || '').toLowerCase() + ' ';
        if (/stau|achtung|warnung|unwetter|sturm|glatteis|unfall|gefahr|vorsicht|sperrung|dringend|starkregen|gewitter|verspätung|ausfall/.test(t)) return 'warn';
        if (/keine ahnung|wei(?:ß|ss) (?:ich )?nicht|kommt darauf an|vielleicht|schwer zu sagen/.test(t)) return 'shrug';
        if (/schon wieder|mal wieder|na toll|wie immer|ach ja|ach nee|na klar|nat(?:ü|ue)rlich nicht|wer h(?:ä|ae)tte das gedacht/.test(t)) return 'roll';
        if (/leider|entschuldig|tut mir leid|keine ahnung|nicht gefunden|nichts gefunden|nicht verstanden|konnte .{0,25}nicht|fehler|kein zugriff|nicht möglich|nicht moeglich/.test(t)) return 'sorry';
        if (/\?\s*$/.test(t.trim()) || /\b(?:soll ich|möchten sie|moechten sie|willst du|wollen sie|welche[rsmn]?|was möchten)\b/.test(t)) return 'question';
        if (/\b(?:guten (?:morgen|tag|abend)|hallo|willkommen|moin|gute nacht|bis später|bis bald|tschüss)\b/.test(t)) return 'greet';
        if (/\b(?:super|toll|prima|erledigt|gerne|perfekt|glückwunsch|geschafft|alles frei|alles klar|trocken|gespeichert|eingetragen|fertig)\b/.test(t)) return 'happy';
        return 'neutral';
    }
    function wrapSpeak() {
        if (typeof window.speak !== 'function' || window.speak._holo) return;
        const orig = window.speak;
        const w = function (text) { try { emo = detect(text); emoUntil = performance.now() + 60000; } catch (e) {} return orig.apply(this, arguments); };
        w._holo = true;
        Object.keys(orig).forEach(k => { try { w[k] = orig[k]; } catch (e) {} });
        window.speak = w;
    }

    function resize() {
        if (!cv) return;
        const r = cv.getBoundingClientRect();
        DPR = Math.min(2, window.devicePixelRatio || 1);
        W = Math.max(50, r.width); H = Math.max(50, r.height);
        cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
        cx.setTransform(DPR, 0, 0, DPR, 0, 0);
    }
    const isOn = () => document.body.classList.contains('jv-holo');
    /* Mund und Arme erst bewegen, wenn die Stimme wirklich zu hören ist (Cloud-Stimme braucht 1-2 s Vorlauf, die Klasse "speaking" kommt schon vorher) */
    function hoerbar() {
        try { if (typeof currentAudio !== 'undefined' && currentAudio && !currentAudio.paused && !currentAudio.ended && currentAudio.currentTime > 0) return true; } catch (e) {}
        try { if (window.speechSynthesis && window.speechSynthesis.speaking) return true; } catch (e) {}
        return false;
    }
    const sprechen = () => { try { return btn.classList.contains('speaking') && hoerbar(); } catch (e) { return false; } };
    const hoeren = () => { try { return btn.classList.contains('recording'); } catch (e) { return false; } };

const CFG={"title": "ECHTER MENSCH", "mode": "real", "ns": 40, "pw": 1, "ex": 2, "smooth": 1, "glow": 0, "panel": 0, "head": [236, 190, 158], "body": [44, 52, 68], "hair": [52, 36, 28], "arm": "real", "f": {"sclera": "rgb(246,242,236)", "iris1": "rgb(84,58,38)", "iris2": "rgb(138,100,62)", "pupil": "rgb(6,4,4)", "eyeline": "rgba(70,40,30,0.95)", "brow": "rgb(52,36,28)", "browW": 4.5, "mouth": "rgb(176,84,92)", "mouthW": 4, "nose": "rgba(160,100,80,0.55)"}, "note": "Realistischeres Gesicht mit Haut, Haaren und nat\u00fcrlicher Mimik, im Anzug. Weicher Schatten statt Kanten."};
const sm=t=>t*t*(3-2*t), clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const P=[];function ringB(y,rx,rz,n,c,s,rot=0){for(let i=0;i<n;i++){const a=i/n*Math.PI*2+rot,sn=Math.sin(a),cs=Math.cos(a);P.push({x:rx*Math.sign(sn)*Math.sqrt(Math.abs(sn)),y,z:rz*Math.sign(cs)*Math.sqrt(Math.abs(cs)),c,s});}}
function ringE(y,rx,rz,n,c,s,rot=0){for(let i=0;i<n;i++){const a=i/n*Math.PI*2+rot;P.push({x:Math.sin(a)*rx,y,z:Math.cos(a)*rz,c,s});}}
// ----- Kopf: Kinn unten, Schädel oben; Breite je Höhe (t = 0 Kinn .. 1 Scheitel) -----
const CHIN=-0.05, HH=1.95, HC=CHIN+HH/2;
const WT=CFG.smooth?[[0,0.17],[0.04,0.34],[0.10,0.50],[0.18,0.63],[0.30,0.73],[0.45,0.79],[0.60,0.83],[0.72,0.84],[0.84,0.76],[0.93,0.56],[0.98,0.32],[1,0.05]]:[[0,0.24],[0.05,0.30],[0.17,0.60],[0.27,0.66],[0.50,0.76],[0.66,0.82],[0.80,0.82],[0.88,0.74],[0.95,0.60],[1,0.40]];
function wid(t){t=clamp(t,0,1);for(let i=0;i<WT.length-1;i++){if(t<=WT[i+1][0]){const u=(t-WT[i][0])/(WT[i+1][0]-WT[i][0]);return WT[i][1]+(WT[i+1][1]-WT[i][1])*(CFG.smooth?sm(u):u);}}return 0;}
const tOf=y=>(y-CHIN)/HH, yOf=t=>CHIN+t*HH;
const DEP=1.04;
for(let k=0;k<=58;k++){const t=k/58,w=wid(t);if(w<0.02)continue;const n=Math.max(8,Math.round(w*118));
  const hair=t>0.80; ringB(yOf(t),w,w*DEP,n,hair?0.55:0.96-0.15*Math.abs(t-0.5),hair?1.15:1.0,k*0.1);}
// Ohren
for(const sd of [-1,1])for(let i=0;i<28;i++){const u=i/28*4,e=Math.floor(u),f=u-e;const px=[-1,1,1,-1][e]+([2,0,-2,0][e])*f,py=[-1,-1,1,1][e]+([0,2,0,-2][e])*f;P.push({x:sd*(0.86+px*0.04),y:yOf(0.56)+py*0.13,z:-0.04+px*0.05,c:0.85,s:0.9});}
const NH=P.length;
// Hals (kräftig) und Schultern
const NY=CHIN-0.55;
for(let k=0;k<9;k++){const y=CHIN-0.04-k*0.065;ringE(y,0.46+k*0.012,0.44+k*0.01,40,0.6-0.04*k,0.95);}
for(let k=0;k<46;k++){const t=k/45,y=NY-t*2.05;const sl=sm(Math.min(1,t/0.15));
  const rx=0.52+(1.42-0.52)*sl-sm(Math.min(1,Math.max(0,(t-0.24)/0.34)))*0.40,rz=0.45+(0.58-0.45)*sm(Math.min(1,t/0.30));
  ringE(y,rx,rz,Math.round(56+rx*55),Math.max(0,0.5-t*0.9),0.95*(1-t*0.55),k*0.17);}

// ===== Massive Flächen: Kopf, Hals, Oberkörper als kantiges Netz =====
const NS=CFG.ns;
function sq(a){const sn=Math.sin(a),cs=Math.cos(a);return [Math.sign(sn)*Math.pow(Math.abs(sn),CFG.pw),Math.sign(cs)*Math.pow(Math.abs(cs),CFG.pw)];}
function buildMesh(rings,color){ // rings: [{y,rx,rz}], von oben nach unten oder unten nach oben
  const V=[],F=[];
  rings.forEach(r=>{for(let i=0;i<NS;i++){const [u,v]=sq(i/NS*Math.PI*2+0.157);V.push({x:r.rx*u,y:r.y,z:r.rz*v});}});
  const cb=V.length;V.push({x:0,y:rings[0].y,z:0});const ct=V.length;V.push({x:0,y:rings[rings.length-1].y,z:0});
  for(let k=0;k<rings.length-1;k++)for(let i=0;i<NS;i++){const a=k*NS+i,b=k*NS+(i+1)%NS,c=(k+1)*NS+(i+1)%NS,d=(k+1)*NS+i;F.push([a,b,c,d]);}
  for(let i=0;i<NS;i++){F.push([cb,(i+1)%NS,i]);F.push([ct,(rings.length-1)*NS+i,(rings.length-1)*NS+(i+1)%NS]);}
  F.forEach(f=>{let mx=0,my=0,mz=0;f.forEach(j=>{mx+=V[j].x;my+=V[j].y;mz+=V[j].z;});mx/=f.length;my/=f.length;mz/=f.length;
    const A=V[f[0]],B=V[f[1]],C=V[f[2]];const ux=B.x-A.x,uy=B.y-A.y,uz=B.z-A.z,vx=C.x-A.x,vy=C.y-A.y,vz=C.z-A.z;
    const nx=uy*vz-uz*vy,ny=uz*vx-ux*vz,nz=ux*vy-uy*vx;const cyv=(f.length===3&&(V[f[0]]===V[cb]||V[f[0]]===V[ct]))?(V[f[0]]===V[cb]?-1:1):0;
    const ox=mx,oy=cyv?cyv:0,oz=mz;f.sg=(nx*ox+ny*oy+nz*oz)>=0?1:-1;f.cy=my;f.cz=mz;if(f.length===4&&CFG.smooth){const w=Math.max(0.05,Math.abs(rings[0]?Math.hypot(V[f[0]].x,V[f[0]].z):0.5));const rr=Math.hypot(mx,mz)||1;let ny2=0;const k0=Math.floor(f[0]/NS);const ra=rings[k0],rb=rings[Math.min(rings.length-1,k0+1)];ny2=(rings.length>=20&&rings[0].y<rings[rings.length-1].y)?(my-(rings[0].y+rings[rings.length-1].y)/2)*0.9:0;let n3=[mx/rr,ny2*0.9,mz/rr];const nl=Math.hypot(n3[0],n3[1],n3[2])||1;f.nm=[n3[0]/nl,n3[1]/nl,n3[2]/nl];f.px=mx;f.py=my;f.pz=mz;}});
  return {V,F,color};
}
const HT=CFG.smooth?Array.from({length:44},(_,i)=>i/43):[0,0.05,0.11,0.17,0.27,0.38,0.5,0.66,0.8,0.88,0.95,1];
const headMesh=buildMesh(HT.map(t=>({y:yOf(t),rx:wid(t),rz:wid(t)*DEP})),CFG.head);
const bodyRings=[];
for(let k=0;k<=10;k++){const y=CHIN+0.45-k*0.1;bodyRings.push({y,rx:0.40+Math.max(0,k-4)*0.017,rz:0.38+Math.max(0,k-4)*0.014});}
for(let k=0;k<=15;k++){const t=k/15,y=NY-t*2.05;const sl=sm(Math.min(1,t/0.15));
  bodyRings.push({y,rx:0.52+(1.42-0.52)*sl-sm(Math.min(1,Math.max(0,(t-0.24)/0.34)))*0.40,rz:0.45+(0.58-0.45)*sm(Math.min(1,t/0.30))});}
const bodyMesh=buildMesh(bodyRings,CFG.body);
const LD=nrm(-0.5,0.65,0.6);
function drawMesh(m,xf,yAdd,isHead){
  const T=m.V.map(v=>{const y=v.y+(yAdd?yAdd(v.y):0);return xf(v.x,y,v.z);});
  const items=[];const noCull=CFG.mode==='glass';
  m.F.forEach(f=>{
    const A=T[f[0]],B=T[f[1]],C=T[f[2]];const ux=B.x3-A.x3,uy=B.y3-A.y3,uz=B.z3-A.z3,vx=C.x3-A.x3,vy=C.y3-A.y3,vz=C.z3-A.z3;
    let nx=(uy*vz-uz*vy)*f.sg,ny=(uz*vx-ux*vz)*f.sg,nz=(ux*vy-uy*vx)*f.sg;let l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;
    if(CFG.smooth&&f.nm){const P0=xf(f.px,f.py,f.pz),P1=xf(f.px+f.nm[0],f.py+f.nm[1],f.pz+f.nm[2]);nx=P1.x3-P0.x3;ny=P1.y3-P0.y3;nz=P1.z3-P0.z3;l=Math.hypot(nx,ny,nz)||1;nx/=l;ny/=l;nz/=l;}
    if(!noCull&&nz<=-0.02)return;
    let z=0;f.forEach(j=>z+=T[j].z3);items.push({f,nx,ny,nz,z:z/f.length});
  });
  items.sort((a,b)=>a.z-b.z);
  const path=it=>{cx.beginPath();it.f.forEach((j,i)=>{const q=T[j];if(i===0)cx.moveTo(q.sx,q.sy);else cx.lineTo(q.sx,q.sy);});cx.closePath();};
  if(CFG.mode==='toon'){cx.fillStyle='#14100e';cx.strokeStyle='#14100e';cx.lineWidth=7;cx.lineJoin='round';for(const it of items){path(it);cx.fill();cx.stroke();}}
  for(const it of items){
    const lam=Math.max(0,it.nx*LD[0]+it.ny*LD[1]+it.nz*LD[2]);
    const rim=Math.pow(1-Math.max(0,it.nz),3);
    let c=m.color;
    if(!isHead&&CFG.smooth&&it.f.cy>NY-0.02&&(CFG.mode==='toon'||CFG.mode==='real')) c=CFG.head;
    if(isHead&&CFG.hair&&(it.f.cy>yOf(0.80)||(it.f.cz<-0.05&&it.f.cy>yOf(0.50)))) c=CFG.hair;
    if(CFG.mode==='line'){
      path(it);cx.fillStyle='rgba(4,12,20,0.95)';cx.fill();cx.strokeStyle=`rgba(94,231,255,${0.55+rim*0.4})`;cx.lineWidth=1.3;cx.shadowColor='rgba(94,231,255,0.8)';cx.shadowBlur=4;cx.stroke();cx.shadowBlur=0;
    } else if(CFG.mode==='glass'){
      path(it);cx.fillStyle=`rgba(${c[0]},${c[1]},${c[2]},${0.03+0.16*lam+rim*0.16})`;cx.fill();cx.strokeStyle=`rgba(200,240,255,${0.18+rim*0.5})`;cx.lineWidth=0.8;cx.stroke();
      if(lam>0.82){cx.fillStyle=`rgba(255,255,255,${(lam-0.82)*0.9})`;cx.fill();}
    } else if(CFG.mode==='toon'){
      const band=lam<0.30?0.72:(lam<0.62?0.9:1.0);
      const col2=`rgb(${(c[0]*band)|0},${(c[1]*band)|0},${(c[2]*band)|0})`;path(it);cx.fillStyle=col2;cx.fill();cx.strokeStyle=col2;cx.lineWidth=1;cx.stroke();
    } else {
      const sh=0.45+0.62*lam;const col2=`rgb(${Math.min(255,c[0]*sh)|0},${Math.min(255,c[1]*sh)|0},${Math.min(255,c[2]*sh)|0})`;path(it);cx.fillStyle=col2;cx.fill();cx.strokeStyle=col2;cx.lineWidth=1;cx.stroke();
    }
  }
}
const SP=[];for(let i=0;i<110;i++)SP.push({a:Math.random()*6.28,r:1.4+Math.random()*1.6,y:-1.8+Math.random()*3.6,sp:0.1+Math.random()*0.25,s:0.7+Math.random()*1.2});
// ---- Arme mit Gesten ----
const SY=NY-0.50;                       // Schulterhöhe
const lerp=(a,b,t)=>a+(b-a)*t;
const V=(x,y,z)=>({x,y,z});
// Posen je Seite (sd=+1 rechts im Bild, -1 links): Ellbogen E, Hand H
function pose(name,sd){
  const X=sd;
  switch(name){
    case 'rest':  return {E:V(X*1.34,SY-0.95,0.04), H:V(X*1.34,SY-1.85,0.10)};
    case 'palm':  return {E:V(X*1.45,SY-1.00,0.40), H:V(X*1.00,SY-0.45,1.20)};
    case 'open':  return {E:V(X*1.52,SY-1.00,0.45), H:V(X*1.35,SY-0.50,1.25)};
    case 'point': return {E:V(X*1.42,SY-1.00,0.55), H:V(X*0.60,SY-0.75,1.50)};
    case 'chest': return {E:V(X*1.38,SY-1.00,0.50), H:V(X*0.50,SY-0.95,1.00)};
    case 'chin':  return sd>0?{E:V(X*0.85,SY-0.95,0.65), H:V(X*0.16,NY+0.55,0.95)}:{E:V(X*0.95,SY-1.15,0.60), H:V(X*0.60,SY-0.85,0.85)};
    case 'shrug': return {E:V(X*1.55,SY-0.55,0.35), H:V(X*1.75,SY-0.55,1.00)};
    case 'stop':  return {E:V(X*1.40,SY-0.70,0.45), H:V(X*0.95,SY+0.15,1.05)};
    case 'welcome': return {E:V(X*1.62,SY-0.85,0.35), H:V(X*2.05,SY-0.30,0.95)};
    case 'ask':   return {E:V(X*1.45,SY-1.00,0.45), H:V(X*0.85,SY-0.70,1.30)};
    case 'sorry': return {E:V(X*1.36,SY-1.00,0.30), H:V(X*0.75,SY-1.35,0.85)};
    case 'cupHold': return {E:V(X*0.95,SY-1.05,0.55), H:V(X*0.35,SY-0.80,1.10)};
    case 'cupMouth': return {E:V(X*0.85,SY-0.95,0.65), H:V(X*0.14,NY+0.42,1.00)};
    case 'yawnHand': return {E:V(X*0.90,SY-0.95,0.60), H:V(X*0.12,NY+0.50,1.00)};
    case 'stretch': return {E:V(X*1.55,SY+1.15,0.15), H:V(X*1.35,SY+2.35,0.10)};
    case 'neck':  return {E:V(X*1.45,SY+0.35,0.10), H:V(X*0.55,NY+1.45,0.00)};
    case 'coin':  return {E:V(X*1.10,SY-1.00,0.50), H:V(X*0.55,SY-0.55,1.15)};
    case 'watch': return {E:V(X*0.95,SY-1.00,0.55), H:V(X*0.30,NY+0.15,0.95)};
    case 'face':  return {E:V(X*1.30,SY-0.40,0.55), H:V(X*0.50,NY+1.25,0.85)};
  }
}
const GEST=['palm','open','point','chest','palm','open'];
let FORCE=null;
const arm=[{sd:1,cur:pose('rest',1),tgt:'rest',timer:0},{sd:-1,cur:pose('rest',-1),tgt:'rest',timer:0}];
function armsUpdate(dt){
  arm.forEach((a,i)=>{
    a.timer-=dt;
    if(FORCE){ a.tgt=FORCE[i]||'rest'; a.timer=0.2; }
    else if(a.timer<=0){
      if(speaking){ // rechts öfter, links seltener
        const act=Math.random()<(i===0?0.85:0.5);
        a.tgt=act?GEST[(Math.random()*GEST.length)|0]:'rest'; a.timer=0.7+Math.random()*1.0;
      } else { a.tgt='rest'; a.timer=0.3; }
    } else if(!speaking && a.tgt!=='rest'){ a.tgt='rest'; }
    const T=pose(a.tgt,a.sd), k=1-Math.pow(0.0009,dt);   // weiche Bewegung
    ['E','H'].forEach(j=>{ a.cur[j].x=lerp(a.cur[j].x,T[j].x,k); a.cur[j].y=lerp(a.cur[j].y,T[j].y,k); a.cur[j].z=lerp(a.cur[j].z,T[j].z,k); });
  });
}

// Krümmung der Finger (0 = gestreckt, 1 = Faust) je Geste: Daumen, Zeige-, Mittel-, Ring-, kleiner Finger
const CURL={
  rest:[0.35,0.30,0.35,0.40,0.45], palm:[0.05,0.02,0.0,0.02,0.05], open:[0.20,0.15,0.18,0.22,0.25],
  point:[0.70,0.0,0.95,0.98,1.0], chest:[0.30,0.25,0.30,0.35,0.40], chin:[0.40,0.35,0.45,0.5,0.55], shrug:[0.05,0.05,0.05,0.08,0.1], stop:[0.05,0.0,0.0,0.0,0.03], welcome:[0.10,0.05,0.05,0.08,0.12], ask:[0.10,0.08,0.08,0.10,0.15], sorry:[0.40,0.38,0.42,0.46,0.5], face:[0.5,0.5,0.55,0.6,0.6]
};
function nrm(x,y,z){ const l=Math.hypot(x,y,z)||1; return [x/l,y/l,z/l]; }
function handPoints(out,a,E,Hd){
  const target=CURL[a.tgt]||CURL.rest;
  if(!a.curl) a.curl=target.slice();
  for(let f=0;f<5;f++) a.curl[f]+= (target[f]-a.curl[f])*0.12;
  let [ux,uy,uz]=nrm(Hd.x-E.x,Hd.y-E.y,Hd.z-E.z);
  // Seitenrichtung der Hand (quer zum Unterarm)
  let [wx,wy,wz]=nrm(uy*1-uz*0, uz*0-ux*1, ux*0-uy*0);   // u x (0,0,1)
  if(Math.abs(uz)>0.92){ wx=1;wy=0;wz=0; }
  wx*=a.sd; wy*=a.sd; wz*=a.sd;                            // Daumenseite nach innen
  // Krümmungsrichtung: zur Handfläche (nach vorn / zum Körper)
  let cx0=-a.sd*0.35, cy0=0.0, cz0=1.0; const dp=cx0*ux+cy0*uy+cz0*uz; cx0-=dp*ux; cy0-=dp*uy; cz0-=dp*uz; [cx0,cy0,cz0]=nrm(cx0,cy0,cz0);
  const P0={x:Hd.x,y:Hd.y,z:Hd.z};
  // Handfläche
  const PL=0.27, PW=0.15;
  for(let i=0;i<=4;i++) for(let j=-3;j<=3;j++){ const l=i/4*PL, w=j/3*PW*(1-0.12*i/4); out.push({x:P0.x+ux*l+wx*w,y:P0.y+uy*l+wy*w,z:P0.z+uz*l+wz*w,c:0.40,s:1.25}); }
  // Finger (Daumen f=0 innen, dann Zeige- bis kleiner Finger)
  const base=[ -1.0, -0.5, 0.0, 0.5, 1.0 ];   // Querposition am oberen Rand der Handfläche
  const len=[0.9,1.0,1.1,1.0,0.8];
  for(let f=0;f<5;f++){
    const th=f===0;
    let px,py,pz,dx,dy,dz;
    if(th){ // Daumen: entspringt seitlich, zeigt schräg nach außen/vorn
      px=P0.x+ux*0.07+wx*PW; py=P0.y+uy*0.07+wy*PW; pz=P0.z+uz*0.07+wz*PW;
      [dx,dy,dz]=nrm(ux*0.8+wx*0.6,uy*0.8+wy*0.6,uz*0.8+wz*0.6);
    } else {
      const q=(f-3)*0.75;   // -1.5 .. 1.5 (Zeigefinger innen)
      px=P0.x+ux*PL+wx*PW*(-q/1.5)*0.85; py=P0.y+uy*PL+wy*PW*(-q/1.5)*0.85; pz=P0.z+uz*PL+wz*PW*(-q/1.5)*0.85;
      [dx,dy,dz]=[ux,uy,uz];
    }
    const segs=th?[0.11,0.085]:[0.125*len[f],0.09*len[f],0.065*len[f]];
    let ang=0;
    segs.forEach((sl,gi)=>{
      ang+=a.curl[f]*(th?0.8:0.95);
      const ca=Math.cos(ang), sa=Math.sin(ang);
      const mx=dx*ca+cx0*sa, my=dy*ca+cy0*sa, mz=dz*ca+cz0*sa;
      for(let k=0;k<=3;k++){ const t=k/3; out.push({x:px+mx*sl*t,y:py+my*sl*t,z:pz+mz*sl*t,c:0.55,s:1.35}); }
      px+=mx*sl; py+=my*sl; pz+=mz*sl;
    });
  }
}

function armPoints(out,handOnly){
  arm.forEach(a=>{
    const S=V(a.sd*1.22,SY,0.0), E=a.cur.E, Hd=a.cur.H;
    const seg=(A,B,r0,r1,n,c0,c1)=>{
      const dx=B.x-A.x, dy=B.y-A.y, dz=B.z-A.z, L=Math.hypot(dx,dy,dz)||1, ux=dx/L, uy=dy/L, uz=dz/L;
      // Senkrechte Basis
      let px=0,py=0,pz=1; if(Math.abs(uz)>0.9){px=1;pz=0;}
      let ax=uy*pz-uz*py, ay=uz*px-ux*pz, az=ux*py-uy*px; const al=Math.hypot(ax,ay,az)||1; ax/=al;ay/=al;az/=al;
      const bx=uy*az-uz*ay, by=uz*ax-ux*az, bz=ux*ay-uy*ax;
      for(let k=0;k<=n;k++){ const t=k/n, r=lerp(r0,r1,t), cx0=A.x+dx*t, cy0=A.y+dy*t, cz0=A.z+dz*t, m=18;
        for(let j=0;j<m;j++){ const th=j/m*6.283+k*0.4; const ca=Math.cos(th)*r, sa=Math.sin(th)*r;
          out.push({x:cx0+ax*ca+bx*sa,y:cy0+ay*ca+by*sa,z:cz0+az*ca+bz*sa,c:lerp(c0,c1,t),s:1.15}); } }
    };
    if(!handOnly){ for(let q=0;q<110;q++){ const yy=1-(q+0.5)/110*2, rr=Math.sqrt(1-yy*yy), th=q*2.39996; out.push({x:S.x+Math.cos(th)*rr*0.34,y:S.y+yy*0.34,z:S.z+Math.sin(th)*rr*0.34,c:0.12,s:1.1}); }   // Schultergelenk
    seg(S,E,0.31,0.21,22,0.12,0.18);
    seg(E,Hd,0.21,0.14,22,0.18,0.34); }
    // Hand: Handfläche (Platte) und fünf Finger mit drei Gliedern, die sich je nach Geste krümmen
    handPoints(out,a,E,Hd);
  });
}


// ----- Gesichts-Steuerung (alle Werte weich überblendet) -----
const EXP={
 neutral :{bL:0,bR:0,bin:0,open:1,sq:0,gx:0,gy:0,smL:0.05,smR:0.05,mw:1,tilt:0,yaw:0,pit:0,arms:null,cap:'NEUTRAL'},
 think   :{bL:0.25,bR:0.85,bin:0.35,open:0.9,sq:0.15,gx:-0.8,gy:0.9,smL:-0.1,smR:0.15,mw:0.8,tilt:0.10,yaw:0.22,pit:-0.08,arms:['face','chin'],cap:'NACHDENKEN'},
 roll    :{bL:0.9,bR:0.9,bin:-0.2,open:0.55,sq:0,gx:0,gy:1,smL:-0.15,smR:-0.15,mw:0.9,tilt:-0.07,yaw:0,pit:-0.12,arms:['shrug','shrug'],cap:'AUGENROLLEN',roll:true},
 skeptic :{bL:-0.15,bR:1.0,bin:0.25,open:0.8,sq:0.25,gx:0.5,gy:0,smL:-0.2,smR:0.45,mw:0.9,tilt:0.12,yaw:-0.12,pit:0,arms:['palm','rest'],cap:'SKEPTISCH'},
 surprise:{bL:1.0,bR:1.0,bin:-0.3,open:1.45,sq:0,gx:0,gy:0.1,smL:0,smR:0,mw:0.7,tilt:0,yaw:0,pit:-0.07,arms:['stop','stop'],cap:'STAUNEN',mouthO:0.7},
 happy   :{bL:0.4,bR:0.4,bin:-0.2,open:0.8,sq:0.45,gx:0,gy:0,smL:1,smR:1,mw:1.25,tilt:0.04,yaw:0,pit:-0.03,arms:['welcome','welcome'],cap:'FREUDE'},
 sad     :{bL:0.15,bR:0.15,bin:-0.9,open:0.75,sq:0,gx:0,gy:-0.6,smL:-0.8,smR:-0.8,mw:0.85,tilt:-0.05,yaw:0,pit:0.14,arms:['sorry','sorry'],cap:'TRAURIG'},
 angry   :{bL:-0.35,bR:-0.35,bin:1.0,open:0.85,sq:0.3,gx:0,gy:0,smL:-0.5,smR:-0.5,mw:0.9,tilt:0,yaw:0,pit:0.05,arms:['point','rest'],cap:'GENERVT'},
 listen  :{bL:0.35,bR:0.35,bin:-0.1,open:1.1,sq:0,gx:0,gy:0,smL:0.05,smR:0.05,mw:1,tilt:0.07,yaw:0.05,pit:-0.04,arms:null,cap:'ZUHOEREN'},
 sip     :{bL:0.2,bR:0.2,bin:-0.2,open:0.45,sq:0.5,gx:0,gy:-0.3,smL:0.25,smR:0.25,mw:0.7,tilt:0.05,yaw:0.05,pit:-0.12,arms:null,cap:'SIP'},
 yawn    :{bL:0.8,bR:0.8,bin:-0.3,open:0.12,sq:0.3,gx:0,gy:0,smL:0,smR:0,mw:0.8,tilt:0,yaw:0,pit:-0.18,arms:null,cap:'GAEHNEN',mouthO:2.8},
 focus   :{bL:0.2,bR:0.2,bin:0.2,open:1.0,sq:0.15,gx:0,gy:0.6,smL:0.2,smR:0.2,mw:0.9,tilt:0.04,yaw:0.0,pit:-0.05,arms:null,cap:'FOKUS'},
 sigh    :{bL:0.1,bR:0.1,bin:-0.6,open:0.6,sq:0,gx:0.4,gy:-0.3,smL:-0.4,smR:-0.4,mw:0.85,tilt:-0.05,yaw:-0.1,pit:0.08,arms:null,cap:'SEUFZEN'},
 shrug   :{bL:0.7,bR:0.7,bin:-0.5,open:1,sq:0,gx:0,gy:0.1,smL:-0.5,smR:-0.5,mw:0.8,tilt:0.12,yaw:0,pit:0,arms:['shrug','shrug'],cap:'SCHULTERZUCKEN'}
};
let cur=Object.assign({},EXP.neutral),tgt='neutral',rollT=-1;
const KEYS=['bL','bR','bin','open','sq','gx','gy','smL','smR','mw','tilt','yaw','pit'];

let mO=0,speaking=false,mo=0,target=0,blink=0,nextBlink=2200,tPrev=performance.now(),sig=0,nextSacc=1500,sx_=0,sy_=0;
function hAt(y){return wid(tOf(y));}
function fp(proj,x,y,dz){const t=clamp(tOf(y),0.02,0.98),w=wid(t),u=clamp(x/w,-0.98,0.98);return proj(x,y,w*DEP*Math.pow(1-Math.pow(Math.abs(u),4),0.25)+0.012+(dz||0));}
function col(c,a){const r=40+c*215,g=130+c*40-(c>0.6?(c-0.6)*100:0),b=255-c*230;return `rgba(${r|0},${g|0},${b|0},${a})`;}


/* ---------- Leerlauf-Gimmicks: wenn er nichts zu tun hat, trinkt er Kaffee, gähnt, spielt mit einer Münze oder schaut auf die Uhr ---------- */
const IDLE_MS=30000;
let lastActive=performance.now(), nextGim=0, gim=null, gimLast='', gimGaze=null;
const GIMS={
  kaffee:{dur:10500,prop:'cup',steps:[[0,['cupHold','rest'],'neutral',0],[1200,['cupMouth','rest'],'sip',0.45],[3600,['cupHold','rest'],'neutral',0],[5600,['cupMouth','rest'],'sip',0.5],[8200,['cupHold','rest'],'neutral',0],[9800,['rest','rest'],'neutral',0]]},
  gaehnen:{dur:8200,steps:[[0,['rest','rest'],'neutral'],[900,['yawnHand','rest'],'yawn'],[3300,['stretch','stretch'],'yawn'],[5600,['neck','rest'],'sigh'],[7600,['rest','rest'],'neutral']]},
  muenze:{dur:9000,prop:'coin',steps:[[0,['coin','rest'],'focus'],[8200,['rest','rest'],'neutral']]},
  uhr:{dur:7600,steps:[[0,['rest','watch'],'neutral'],[2600,['rest','watch'],'sigh'],[4400,['neck','rest'],'think'],[6800,['rest','rest'],'neutral']]}
};
function gimStart(now){
  const keys=Object.keys(GIMS).filter(k=>k!==gimLast);
  const k=keys[(Math.random()*keys.length)|0]; gimLast=k;
  gim={k,t0:now,tilt:0};
}
function gimStop(now){ gim=null; gimGaze=null; nextGim=now+45000+Math.random()*75000; }
/* liefert true, solange ein Gimmick läuft (setzt dann Ausdruck und Arme) */
function gimDrive(now,idle){
  if(!idle){ if(gim) gimStop(now); return false; }
  if(!gim){ if(now>=nextGim) gimStart(now); else return false; }
  const G=GIMS[gim.k], el=now-gim.t0;
  if(el>=G.dur){ gimStop(now); return false; }
  let st=G.steps[0]; for(const x of G.steps){ if(el>=x[0]) st=x; }
  tgt=st[2]; FORCE=st[1];
  gim.tiltT=st[3]||0; gim.tilt+=((gim.tiltT)-gim.tilt)*0.1;
  gimGaze=null;
  if(G.prop==='coin'){ const ph=((el/1000)%1.25)/1.25, h=4*ph*(1-ph); gim.coin=h; gimGaze={x:0.1,y:Math.max(-0.3,Math.min(1,h*1.4-0.15))}; }
  return true;
}
function gimProps(proj,lift,sc,t){
  if(!gim) return;
  const G=GIMS[gim.k]; if(!G.prop) return;
  const a=arm[0], Hd=a.cur.H; const q=proj(Hd.x,lift(Hd.y),Hd.z), k=q[2], u=sc*k;
  if(G.prop==='cup'){
    const cx0=q[0]-0.02*u, cy0=q[1]-0.24*u, w=0.36*u, h=0.42*u;
    cx.save(); cx.translate(q[0],q[1]-0.05*u); cx.rotate(-gim.tilt*0.9); cx.translate(-q[0],-(q[1]-0.05*u));
    cx.lineJoin='round'; cx.lineWidth=2.4; cx.strokeStyle='#4a3326';
    cx.beginPath(); cx.arc(cx0+w*0.52,cy0+h*0.15,h*0.30,-1.2,1.5); cx.stroke();   // Henkel
    cx.fillStyle='#f3efe9';
    cx.beginPath(); cx.moveTo(cx0-w/2,cy0-h/2); cx.lineTo(cx0+w/2,cy0-h/2); cx.lineTo(cx0+w*0.38,cy0+h/2); cx.lineTo(cx0-w*0.38,cy0+h/2); cx.closePath(); cx.fill(); cx.stroke();
    cx.fillStyle='#4a2c1a'; cx.beginPath(); cx.ellipse(cx0,cy0-h/2,w/2,h*0.12,0,0,6.283); cx.fill(); cx.stroke();
    cx.restore();
    // Dampf
    cx.strokeStyle='rgba(220,235,245,0.55)'; cx.lineWidth=2; cx.lineCap='round';
    for(let i=0;i<3;i++){ const bx=cx0+(i-1)*w*0.28; cx.beginPath();
      for(let j=0;j<=6;j++){ const y=cy0-h*0.7-j*h*0.16, x=bx+Math.sin(t*2.2+i*1.7+j*0.9)*w*0.10; if(j===0)cx.moveTo(x,y); else cx.lineTo(x,y); }
      cx.globalAlpha=0.55*(1-Math.min(1,(gim.tilt)*1.2)); cx.stroke(); }
    cx.globalAlpha=1;
  } else if(G.prop==='coin'){
    const h=gim.coin||0, x=q[0], y=q[1]-(0.12+h*1.1)*u, r=0.12*u, sq=Math.abs(Math.cos(((now2()/1000)*9)%6.283));
    cx.fillStyle='#e6b422'; cx.strokeStyle='#8a6410'; cx.lineWidth=1.8;
    cx.beginPath(); cx.ellipse(x,y,r,Math.max(1.5,r*(0.25+0.75*sq)),0,0,6.283); cx.fill(); cx.stroke();
    cx.fillStyle='rgba(255,255,255,0.65)'; cx.beginPath(); cx.ellipse(x-r*0.3,y-r*0.1*sq,r*0.25,Math.max(0.8,r*0.2*sq),0,0,6.283); cx.fill();
  }
}
const now2=()=>performance.now();

/* ---------- Zustand der App -> Ausdruck ---------- */
const EMO2EXP={warn:'surprise',sorry:'sad',question:'skeptic',happy:'happy',greet:'happy',roll:'roll',shrug:'shrug'};
function driveState(now){
  speaking=sprechen(); const listening=hoeren();
  let thinking=false;
  try { thinking=!speaking && !listening && typeof isProcessing!=='undefined' && !!isProcessing; } catch(e){}
  if(!speaking && now>emoUntil-59000) emo='neutral';
  let k='neutral';
  if(thinking) k='think'; else if(listening) k='listen'; else if(speaking) k=EMO2EXP[emo]||'neutral';
  if(k==='roll' && tgt!=='roll') rollT=0;
  if(tgt==='roll' && k==='roll' && rollT<0){ emo='neutral'; k='neutral'; }   // Augenrollen nur einmal
  tgt=k;
  FORCE=(k==='think'||k==='roll'||k==='shrug')?EXP[k].arms:null;
  // Leerlauf: nichts zu tun -> Gimmicks
  let aktiv=speaking||listening||thinking||k!=='neutral';
  try { if(window.jvPraesentation && window.jvPraesentation.isRunning()) aktiv=true; } catch(e){}
  try { if(typeof isPanelOpen==='function' && isPanelOpen()) aktiv=true; } catch(e){}
  if(aktiv) lastActive=now;
  gimDrive(now, !aktiv && now-lastActive>IDLE_MS);
}
function frame(now){
  raf=0;
  if(!isOn()||document.hidden||!cv) return;
  raf=requestAnimationFrame(frame);
  const dt=Math.min(0.05,(now-tPrev)/1000);tPrev=now;const t=now/1000;
  driveState(now);
  const E=EXP[tgt];
  armsUpdate(dt);
  for(const k of KEYS){cur[k]+=(E[k]-cur[k])*(1-Math.pow(0.0006,dt));}
  // Sprechen / Mund
  if(speaking){if(Math.random()<0.22)target=0.1+Math.random()*0.9;}else target=0;
  mo+=(target-mo)*(speaking?0.4:0.18);
  mO+=((E.mouthO||0)-mO)*0.15; const mouthO=mO;
  // Blinzeln
  nextBlink-=dt*1000;if(nextBlink<0){blink=1;nextBlink=Math.random()<0.2?250:2200+Math.random()*3200;}
  let ek=1;if(blink>0){ek=Math.max(0.05,Math.abs(1-blink*2));blink-=dt*7;if(blink<0)blink=0;}
  // Blick: Mikro-Bewegungen + Augenrollen
  nextSacc-=dt*1000;if(nextSacc<0){nextSacc=800+Math.random()*2200;sx_=(Math.random()-0.5)*0.5;sy_=(Math.random()-0.5)*0.3;}
  let gx=cur.gx+sx_*0.5,gy=cur.gy+sy_*0.5;
  if(rollT>=0){rollT+=dt;const p=rollT/1.5;if(p<1){const ang=-2.4+p*6.4;const e=Math.sin(Math.min(1,p*1.1)*Math.PI);gx=Math.cos(ang)*0.95*Math.min(1,e*2);gy=Math.sin(ang)*0.95*Math.min(1,e*2)+0.1;}else if(rollT>2.2)rollT=-1;}
  if(gimGaze){gx=gimGaze.x;gy=gimGaze.y;}
  // Kopf: einzeln bewegt
  const yaw=cur.yaw+Math.sin(t*0.6)*0.07+Math.sin(t*1.7)*0.02+(speaking?Math.sin(t*2.1)*0.06*(0.5+mo):0);
  const pit=cur.pit+Math.sin(t*0.9)*0.02+(speaking?Math.sin(t*3.3)*0.045*(0.4+mo):0);
  const rol=cur.tilt+Math.sin(t*0.5)*0.03;
  const PVY=CHIN-0.05,cY=Math.cos(yaw),sY=Math.sin(yaw),cP=Math.cos(pit),sP=Math.sin(pit),cR=Math.cos(rol),sR=Math.sin(rol);
  const sc=Math.min(W/4.6,H/5.4),ox=W/2,oy=H*0.42+Math.sin(t*1.3)*2.5;
  const shrugUp=(E.arms&&E.arms[0]==='shrug')?0.10:0;
  const proj=(x,y,z)=>{const X=x,Z=z,k=4.6/(4.6-Z+1.6);return [ox+X*sc*k,oy-(y-0.1)*sc*k,k,Z];};
  const htr=(x,y,z)=>{const dy=y-PVY;const x1=x*cR-dy*sR,y1=x*sR+dy*cR;const y2=y1*cP-z*sP,z2=y1*sP+z*cP;return [x1*cY+z2*sY,y2+PVY,-x1*sY+z2*cY];};
  const hproj=(x,y,z)=>{const dy=y-PVY;const x1=x*cR-dy*sR,y1=x*sR+dy*cR;const y2=y1*cP-z*sP,z2=y1*sP+z*cP;const x3=x1*cY+z2*sY,z3=-x1*sY+z2*cY;return proj(x3,y2+PVY,z3);};
  cx.clearRect(0,0,W,H);cx.globalCompositeOperation='lighter';
  const gr=cx.createRadialGradient(ox,oy-sc*0.9,10,ox,oy-sc*0.9,sc*1.7);gr.addColorStop(0,CFG.glow?col(1,0.10+mo*0.10):'rgba(120,150,200,'+(0.10+mo*0.06)+')');gr.addColorStop(1,'rgba(0,0,0,0)');cx.fillStyle=gr;cx.fillRect(0,0,W,H);
  cx.globalCompositeOperation='source-over';
  const xfB=(x,y,z)=>{const q=proj(x,y,z);return {sx:q[0],sy:q[1],x3:x,y3:y,z3:z};};
  const xfH=(x,y,z)=>{const r=htr(x,y,z),q=proj(r[0],r[1],r[2]);return {sx:q[0],sy:q[1],x3:r[0],y3:r[1],z3:r[2]};};
  drawMesh(bodyMesh,xfB,y=>shrugUp*Math.max(0,1-Math.abs(y-NY)/0.9),false);
  { const gy0=oy+sc*1.9, gy1=oy+sc*3.6, gg=cx.createLinearGradient(0,gy0,0,gy1); gg.addColorStop(0,'rgba(3,7,13,0)'); gg.addColorStop(1,'rgba(3,7,13,1)'); cx.fillStyle=gg; cx.fillRect(0,gy0,W,H-gy0); }
  drawMesh(headMesh,xfH,null,true);
  // Arme als glänzende Zylinder
  const lift=y=>y+shrugUp*(y>SY-0.4?1:0.5);
  const SK=CFG.head, SLV=CFG.body;
  const capsule=(A,B,r0,r1,skin)=>{const a=proj(A.x,lift(A.y),A.z),b=proj(B.x,lift(B.y),B.z);const w0=2*r0*sc*a[2],w1=2*r1*sc*b[2],w=(w0+w1)/2;
    cx.lineCap='round';const L=(wf,st,ox2)=>{cx.strokeStyle=st;cx.lineWidth=w*wf;cx.beginPath();cx.moveTo(a[0]+ox2*w,a[1]+ox2*w*0.8);cx.lineTo(b[0]+ox2*w,b[1]+ox2*w*0.8);cx.stroke();};
    const m=CFG.arm,rgb=(c,k)=>`rgb(${(c[0]*k)|0},${(c[1]*k)|0},${(c[2]*k)|0})`,cc=skin?SK:SLV;
    if(m==='line'){L(1,'rgb(94,231,255)',0);L(0.84,'rgb(4,12,20)',0);}
    else if(m==='glass'){L(1,'rgba(200,240,255,0.55)',0);L(0.88,'rgba(120,195,250,0.30)',0);L(0.25,'rgba(255,255,255,0.55)',-0.2);}
    else if(m==='toon'){L(1.16,'#14100e',0);L(1,rgb(cc,0.78),0);L(0.74,rgb(cc,1),-0.08);}
    else {L(1,rgb(cc,0.55),0);L(0.8,rgb(cc,0.85),-0.07);L(0.36,rgb(cc,1.08),-0.2);}
  };
  arm.forEach(a=>{const S=V(a.sd*1.22,SY,0);capsule(S,a.cur.E,0.31,0.21,false);capsule(a.cur.E,a.cur.H,0.21,0.14,CFG.arm==='toon'||CFG.arm==='real');});
  const AP=[];armPoints(AP,true);if(CFG.arm==='line'||CFG.arm==='glass')AP.sort((p,q)=>p.z-q.z);
  if(CFG.arm==='line'||CFG.arm==='glass'){
  for(const p of AP){const [sx,sy,k]=proj(p.x,lift(p.y),p.z);const r=(p.c>0.5?Math.max(2.5,p.s*k*2.4):Math.max(3.8,p.s*k*3.8));
    if(CFG.arm==='line'){cx.fillStyle='rgb(94,231,255)';cx.beginPath();cx.arc(sx,sy,r*0.9,0,6.283);cx.fill();}
    else if(CFG.arm==='glass'){cx.fillStyle='rgba(190,235,255,0.35)';cx.beginPath();cx.arc(sx,sy,r,0,6.283);cx.fill();}
    else{const sh=0.82+0.2*Math.max(0,Math.min(1,(p.z+0.5)*0.4));
      cx.fillStyle=CFG.arm==='toon'?'#14100e':`rgb(${(SK[0]*sh*0.55)|0},${(SK[1]*sh*0.5)|0},${(SK[2]*sh*0.5)|0})`;cx.beginPath();cx.arc(sx,sy,r+(p.c>0.5?1.0:0.8),0,6.283);cx.fill();
      cx.fillStyle=`rgb(${(SK[0]*sh)|0},${(SK[1]*sh)|0},${(SK[2]*sh)|0})`;cx.beginPath();cx.arc(sx,sy,r,0,6.283);cx.fill();}}
  } else {
  const HP=91;
  for(let h=0;h<AP.length/HP;h++){
    const pts=AP.slice(h*HP,(h+1)*HP).map(p=>{const q=proj(p.x,lift(p.y),p.z);return {x:q[0],y:q[1],k:q[2]};});
    const OL=CFG.arm==='toon'?'#14100e':`rgb(${(SK[0]*0.5)|0},${(SK[1]*0.45)|0},${(SK[2]*0.45)|0})`;
    const FL=`rgb(${(SK[0]*0.97)|0},${(SK[1]*0.97)|0},${(SK[2]*0.97)|0})`;
    const id=(i,j)=>pts[i*7+(j+3)];
    const bd=[];for(let j=-3;j<=3;j++)bd.push(id(0,j));for(let i=1;i<=4;i++)bd.push(id(i,3));for(let j=2;j>=-3;j--)bd.push(id(4,j));for(let i=3;i>=1;i--)bd.push(id(i,-3));
    const fw=0.062*sc*pts[0].k;
    cx.lineJoin='round';cx.lineCap='round';
    // Finger zuerst (unter der Handfläche), dann Handfläche
    const fing=[];let o=35;for(let f=0;f<5;f++){const sg=f===0?2:3,ln=[];for(let g=0;g<sg;g++)for(let k=0;k<=3;k++){if(g>0&&k===0)continue;ln.push(pts[o+g*4+k]);}o+=sg*4;fing.push(ln);}
    for(const ln of fing){cx.beginPath();ln.forEach((q,i)=>{if(i===0)cx.moveTo(q.x,q.y);else cx.lineTo(q.x,q.y);});cx.strokeStyle=OL;cx.lineWidth=fw+2.6;cx.stroke();}
    cx.beginPath();bd.forEach((q,i)=>{if(i===0)cx.moveTo(q.x,q.y);else cx.lineTo(q.x,q.y);});cx.closePath();cx.fillStyle=OL;cx.strokeStyle=OL;cx.lineWidth=fw*0.9+2.6;cx.fill();cx.stroke();
    for(const ln of fing){cx.beginPath();ln.forEach((q,i)=>{if(i===0)cx.moveTo(q.x,q.y);else cx.lineTo(q.x,q.y);});cx.strokeStyle=FL;cx.lineWidth=fw;cx.stroke();}
    cx.beginPath();bd.forEach((q,i)=>{if(i===0)cx.moveTo(q.x,q.y);else cx.lineTo(q.x,q.y);});cx.closePath();cx.fillStyle=FL;cx.strokeStyle=FL;cx.lineWidth=fw*0.9;cx.fill();cx.stroke();
  }
  }
  cx.globalCompositeOperation=CFG.glow?'lighter':'source-over';
  // ===== Gesicht =====
  const F=(x,y,dz)=>{const t2=clamp(tOf(y),0.02,0.98),w=wid(t2),u=clamp(x/w,-0.98,0.98);return hproj(x,y,w*DEP*Math.pow(1-Math.pow(Math.abs(u),CFG.ex),1/CFG.ex)+(CFG.smooth?0.035:0.02)+(dz||0));};
  cx.lineCap='round';cx.lineJoin='round';
  const YE=yOf(0.585),EX=0.33;
  // Kantige Platten-Linien
  if(CFG.panel){
  cx.shadowColor='rgba(120,220,255,0.7)';cx.shadowBlur=5;cx.strokeStyle='rgba(150,225,255,0.55)';cx.lineWidth=1.6;
  var pl=(arr)=>{cx.beginPath();arr.forEach((q,i)=>{const [x,y]=F(q[0],q[1],q[2]||0.01);if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});cx.stroke();};
  for(const sd of [-1,1]){
    pl([[sd*0.74,yOf(0.62)],[sd*0.52,yOf(0.50)],[sd*0.40,yOf(0.36)],[sd*0.26,yOf(0.12)]]);   // Wange/Kiefer
    pl([[sd*0.20,yOf(0.18)],[sd*0.34,yOf(0.20)],[sd*0.52,yOf(0.34)]]);                         // Kieferplatte
    pl([[sd*0.74,yOf(0.78)],[sd*0.40,yOf(0.76)],[sd*0.0,yOf(0.78)]]);                          // Stirnnaht
    pl([[sd*0.12,yOf(0.98)],[sd*0.12,yOf(0.78)]]);
  }
  pl([[-0.22,yOf(0.09)],[0.22,yOf(0.09)]]);
  }
  // Nase
  cx.shadowColor='rgba(120,220,255,0.7)';cx.shadowBlur=CFG.glow?5:0;cx.strokeStyle=CFG.f.nose;cx.lineWidth=CFG.glow?1.8:(CFG.mode==='toon'?3:2.2);
  {const pts=[[0.015,YE+0.02,0.03],[0.035,YE-0.18,0.10],[0.05,yOf(0.445)+0.01,0.15],[0.02,yOf(0.425),0.17],[-0.02,yOf(0.425),0.17],[-0.05,yOf(0.445)+0.01,0.15]];
   cx.beginPath();pts.forEach((q,i)=>{const [x,y]=F(q[0],q[1],q[2]);if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});cx.stroke();
   cx.beginPath();[[-0.015,YE+0.02,0.03],[-0.035,YE-0.18,0.10],[-0.05,yOf(0.445)+0.01,0.15]].forEach((q,i)=>{const [x,y]=F(q[0],q[1],q[2]);if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});cx.stroke();}
  // Lächel-Linien
  const smile=(cur.smL+cur.smR)/2; if(smile>0.2&&CFG.glow){cx.strokeStyle=col(0.7,0.5*smile);cx.lineWidth=1.6;for(const sd of [-1,1]){cx.beginPath();for(let i=0;i<=8;i++){const u=i/8;const x=sd*(0.14+u*0.16),y=yOf(0.42)-u*0.20;const [px,py]=F(x,y,0.03);if(i===0)cx.moveTo(px,py);else cx.lineTo(px,py);}cx.stroke();}}
  // Augen: helle Hornhaut, farbige Iris, schwarze Pupille (normales Zeichnen, damit Dunkel sichtbar ist)
  cx.globalCompositeOperation='source-over';cx.shadowBlur=0;cx.lineJoin='miter';
  for(const sd of [-1,1]){
    const ex=sd*EX, op=clamp(cur.open*ek-cur.sq*0.35,0.03,1.5), wE=0.19, hE=0.115*op;
    const up=[],lo=[];for(let i=0;i<=8;i++){const u=i/8*2-1;const lid=1-Math.abs(u)*0.95;up.push([ex+u*wE,YE+lid*hE]);lo.push([ex+u*wE,YE-lid*hE*0.75]);}
    cx.save();cx.beginPath();up.forEach((q,i)=>{const [x,y]=F(q[0],q[1],0.012);if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});lo.slice().reverse().forEach(q=>{const [x,y]=F(q[0],q[1],0.012);cx.lineTo(x,y);});cx.closePath();
    cx.fillStyle='rgba(8,18,28,0.92)';cx.fill();cx.clip();
    cx.fillStyle=CFG.f.sclera;cx.fillRect(0,0,W,H);
    const ix=ex+clamp(gx,-1,1)*wE*0.5, iy=YE+clamp(gy,-1,1)*hE*0.5;
    const [px,py,pk]=F(ix,iy,0.02);const ir=0.092*sc*pk;
    cx.fillStyle=CFG.f.iris1;cx.beginPath();cx.arc(px,py,ir,0,6.283);cx.fill();
    cx.fillStyle=CFG.f.iris2;cx.beginPath();cx.arc(px,py,ir*0.75,0,6.283);cx.fill();
    cx.fillStyle=CFG.f.pupil;cx.beginPath();cx.arc(px,py,ir*0.42,0,6.283);cx.fill();
    cx.fillStyle='rgba(255,255,255,0.95)';cx.beginPath();cx.arc(px-ir*0.3,py-ir*0.32,ir*0.16,0,6.283);cx.fill();
    // Lidschatten oben (macht Blick unter dem Lid sichtbar)
    cx.restore();
    cx.strokeStyle=CFG.f.eyeline;cx.lineWidth=CFG.mode==='toon'?4:(CFG.mode==='real'?2:2.4);if(CFG.smooth)cx.lineJoin='round';
    cx.beginPath();up.forEach((q,i)=>{const [x,y]=F(q[0],q[1],0.014);if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});cx.stroke();
    cx.beginPath();lo.forEach((q,i)=>{const [x,y]=F(q[0],q[1],0.014);if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});cx.stroke();
    // Braue: kantiger Knick
    const raise=(sd<0?cur.bL:cur.bR), bx0=ex+sd*0.19, bx1=ex-sd*0.19;
    const yb=YE+0.15+raise*0.08, yIn=yb-cur.bin*0.08;
    cx.globalCompositeOperation=CFG.glow?'lighter':'source-over';cx.shadowColor=CFG.f.brow;cx.shadowBlur=CFG.glow?10:0;cx.strokeStyle=CFG.f.brow;cx.lineWidth=CFG.f.browW;cx.lineCap=CFG.smooth?'round':'butt';cx.beginPath();
    for(let i=0;i<=(CFG.smooth?10:4);i++){const u=i/(CFG.smooth?10:4);const x=lerp(bx0,bx1,u),y=lerp(yb,yIn,u)+(CFG.smooth?Math.sin(u*Math.PI):(1-Math.abs(2*u-1)))*0.03;const [bx,by]=F(x,y,0.016);if(i===0)cx.moveTo(bx,by);else cx.lineTo(bx,by);}cx.stroke();
    cx.shadowBlur=0;cx.globalCompositeOperation='source-over';cx.lineCap='round';
  }
  cx.globalCompositeOperation=CFG.glow?'lighter':'source-over';cx.shadowColor=CFG.f.mouth;cx.shadowBlur=CFG.glow?12:0;
  // Mund
  const my=yOf(0.30),mw=0.20*cur.mw,od=0.012+mo*0.12+mouthO*0.10+Math.max(0,(cur.smL+cur.smR)/2-0.3)*0.10;cx.strokeStyle=CFG.f.mouth;cx.lineWidth=CFG.f.mouthW;cx.lineJoin=CFG.smooth?'round':'miter';
  if(od>0.022){
    const N=14,up=[],lo=[];
    for(let i=0;i<=N;i++){const u=i/N*2-1;const lift=(u<0?cur.smL:cur.smR)*0.05*u*u;const x=u*mw*(mouthO>0?(1-mouthO*0.3):1);
      up.push([x,my+lift+od*(1-u*u)*0.6,u]);lo.push([x,my+lift-od*(1-u*u),u]);}
    const P2=(q,dy)=>F(q[0],q[1]+(dy||0),0.02);
    const poly=(A,B)=>{cx.beginPath();A.forEach((q,i)=>{const [x,y]=q.p;if(i===0)cx.moveTo(x,y);else cx.lineTo(x,y);});B.slice().reverse().forEach(q=>{cx.lineTo(q.p[0],q.p[1]);});cx.closePath();};
    const mk=(arr,fn)=>arr.map(q=>({p:P2(q,fn?fn(q):0)}));
    const th=Math.min(0.07,od*1.3+0.018);
    cx.save();poly(mk(up),mk(lo));cx.clip();
    cx.fillStyle='rgb(52,15,20)';cx.fillRect(0,0,W,H);
    cx.fillStyle='rgb(168,74,82)';poly(mk(lo,q=>od*0.75*(1-q[2]*q[2])),mk(lo));cx.fill();
    cx.fillStyle='rgb(246,242,234)';poly(mk(up),mk(up,q=>-th*(1-0.45*q[2]*q[2])));cx.fill();
    if(od>0.06){poly(mk(lo,q=>th*0.75*(1-0.4*q[2]*q[2])),mk(lo));cx.fill();}
    cx.strokeStyle='rgba(150,138,126,0.55)';cx.lineWidth=1;
    for(let k=-5;k<=5;k++){const x=k*mw*0.17,u=k*0.17;const yU=my+od*(1-u*u)*0.6;const a2=F(x,yU,0.02),b2=F(x,yU-th*(1-0.45*u*u),0.02);cx.beginPath();cx.moveTo(a2[0],a2[1]);cx.lineTo(b2[0],b2[1]);cx.stroke();}
    cx.restore();
  }
  for(const dir of [-1,1]){cx.beginPath();for(let i=0;i<=(CFG.smooth?14:6);i++){const u=i/(CFG.smooth?14:6)*2-1;const lift=(u<0?cur.smL:cur.smR)*0.05*u*u;const x=u*mw*(mouthO>0?(1-mouthO*0.3):1),y=my+lift+dir*od*(1-u*u)*(dir>0?0.6:1)+(dir>0?Math.sin(Math.abs(u)*3.1416)*0.0:0);const [px,py]=F(x,y,0.02);if(i===0)cx.moveTo(px,py);else cx.lineTo(px,py);}cx.stroke();}
  cx.shadowBlur=0;cx.globalCompositeOperation='source-over';
  gimProps(proj,lift,sc,t);
}

    /* ---------- Ein-/Ausschalten ---------- */
    function setHolo(on, speakIt) {
        lsSet(KEY, on ? '1' : '0');
        if (on) {
            document.body.classList.remove('jv-brain');
            document.body.classList.add('jv-holo');
            tPrev = performance.now();
            setTimeout(() => { resize(); if (!raf) raf = requestAnimationFrame(frame); }, 30);
        } else {
            document.body.classList.remove('jv-holo');
            try { if (typeof window.__gehirnSet === 'function') window.__gehirnSet(lsGet('jv_ansicht') !== 'kugel', false); } catch (e) {}
        }
        if (tg) { tg.textContent = on ? '◯' : '🤖'; tg.title = on ? 'Andere Ansicht' : 'Jarvis-Hologramm'; tg.setAttribute('aria-label', tg.title); }
        if (speakIt) { try { speak(on ? 'Hier bin ich.' : 'Okay, die andere Ansicht ist wieder da.', typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} }
    }

    function mount() {
        const holder = document.querySelector('.holo-container');
        btn = document.getElementById('recordBtn');
        if (!holder || !btn) return;
        const css = document.createElement('style');
        css.textContent =
            '#jarvisHolo{position:absolute;left:0;top:0;width:100%;height:100%;display:none;-webkit-tap-highlight-color:transparent;cursor:pointer}' +
            'body.jv-holo #jarvisHolo{display:block}' +
            'body.jv-holo #jarvisSphere,body.jv-holo #jarvisBrain,body.jv-holo #brainToggle{display:none!important}' +
            'body.jv-holo .holo-container{position:relative!important;width:min(98vw,440px)!important;height:min(112vw,60vh)!important;top:calc(min(98vw,56vh) - min(112vw,60vh))!important;margin-bottom:calc(min(98vw,56vh) - min(112vw,60vh))!important}' +
            'body.jv-holo #reactor-wrap{overflow:visible!important}' +
            '#holoToggle{position:absolute;right:2px;top:2px;z-index:6;width:30px;height:30px;border-radius:50%;border:1px solid rgba(93,209,255,.35);background:rgba(10,22,33,.75);color:#49d7ff;font-size:14px;line-height:1;display:flex;align-items:center;justify-content:center;cursor:pointer;-webkit-tap-highlight-color:transparent}' +
            'body:not(.jv-holo) #holoToggle{right:36px}';
        document.head.appendChild(css);
        cv = document.createElement('canvas'); cv.id = 'jarvisHolo'; cv.setAttribute('aria-hidden', 'true');
        holder.appendChild(cv); cx = cv.getContext('2d');
        tg = document.createElement('button'); tg.id = 'holoToggle'; tg.type = 'button';
        tg.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); setHolo(!isOn(), false); });
        holder.appendChild(tg);
        window.addEventListener('resize', resize);
        ['pointerdown','touchstart','keydown'].forEach(ev => document.addEventListener(ev, () => { lastActive = performance.now(); }, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', () => { lastActive = performance.now(); if (!document.hidden && isOn() && !raf) { tPrev = performance.now(); raf = requestAnimationFrame(frame); } });
        wrapSpeak(); setTimeout(wrapSpeak, 1500);
        setHolo(lsGet(KEY) !== '0', false);   // erste Nutzung: Hologramm
    }

    /* ---------- Sprache ---------- */
    const HOLO_ON = /^(?:bitte\s+)?(?:zeig(?:e)?(?:\s+mir)?|schalte?|wechsel(?:e)?|stell(?:e)?)\s+(?:bitte\s+)?(?:(?:das|die|den|auf|zum|zur|zu|dich)\s+)*(?:hologramm|roboter|büste|bueste|jarvis(?:-?figur)?|figur)\b|^hologramm(?:-?ansicht)?(?:\s+an)?$/;
    const HOLO_OFF = /^(?:bitte\s+)?(?:hologramm(?:-?ansicht)?\s+aus|(?:schalte?|mach(?:e)?)\s+(?:das\s+)?hologramm\s+aus)$/;
    function handle(text, next) {
        const t = String(text || '').toLowerCase().replace(/[.,!?;:]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t || t.length > 60) return false;
        if (HOLO_OFF.test(t)) { if (isOn()) setHolo(false, true); return true; }
        if (HOLO_ON.test(t)) { if (!isOn()) setHolo(true, true); else { try { speak('Ich bin schon da.', typeof continueConversation === 'function' ? continueConversation : undefined); } catch (e) {} } return true; }
        if (isOn() && /gehirn|kugel|alte\s+ansicht|netzwerk/.test(t)) setHolo(false, false);   // Gehirn-/Kugel-Befehle übernimmt danach gehirn.js
        return false;
    }
    window.handleHologrammCommand = handle;
    window.jvHolo = { set: on => setHolo(!!on, false), on: isOn, emo: e => { emo = e; emoUntil = performance.now() + 60000; } };   // für die Präsentation (js/praesentation.js)
    window.__holoTest = { gimTest: k => { lastActive = -1e9; nextGim = 0; if (k) { gim = { k, t0: performance.now(), tilt: 0 }; } }, frame: t => frame(t), setEmo: e => { emo = e; emoUntil = performance.now() + 60000; }, detect };
    if (window.jvCommands) {
        window.jvCommands.use('hologramm', function (text, next) {
            try { if (handle(text)) return true; } catch (e) {}
            return next(text);
        }, 210);
    }
    function start() { try { mount(); } catch (e) { console.error('Hologramm-Ansicht', e); } }
    if (document.readyState === 'complete' || document.readyState === 'interactive') start(); else document.addEventListener('DOMContentLoaded', start);
})();
