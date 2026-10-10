/* Jarvis-Hologramm: Büste aus Lichtpunkten als Hauptansicht (ersetzt die Netzwerk-Ansicht, die per Sprache weiter erreichbar bleibt).
   Mund bewegt sich beim Sprechen, Augen blinzeln, Arme und Hände machen Gesten - passend zur Stimmung des gesprochenen Textes. */
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

// ---- Punktwolke (x,y,z, Farbe 0=blau .. 1=orange, Größe)
const P=[];
function ringE(y,rx,rz,n,c,s,rot=0){ for(let i=0;i<n;i++){const a=i/n*Math.PI*2+rot; P.push({x:Math.sin(a)*rx,y,z:Math.cos(a)*rz,c,s});} }
const sm=t=>t*t*(3-2*t);
// Kopf: Ellipsoid, oben breiter, zum Kinn schmaler
const HC=1.05, HRX=0.86, HRY=1.0, HRZ=0.92;
const taper=v=>0.80+0.20*sm(Math.min(1,Math.max(0,(v+0.95)/1.1)));
const hA=v=>Math.sqrt(Math.max(0,1-v*v))*taper(v);
for(let k=0;k<44;k++){ const v=-1+(k+0.5)/44*2, a=hA(v); ringE(HC+v*HRY,HRX*a,HRZ*a,Math.max(10,Math.round(a*86)),0.97-0.2*Math.abs(v),1.0,k*0.1); }
// Hals (länger, oval)
for(let k=0;k<7;k++){ const y=HC-HRY*0.95-k*0.065; ringE(y,0.34+k*0.006,0.36+k*0.006,36,0.62-k*0.05,0.95); }
// Schultern und Oberkörper: breit in x, flach in z, schräg ab dem Hals
const NY=HC-HRY*0.95-0.43;   // Halsansatz
for(let k=0;k<46;k++){
  const t=k/45, y=NY-t*2.05;
  const sl=sm(Math.min(1,t/0.15));                                   // Schulterlinie: vom Hals schräg nach außen
  const rx=0.38+(1.42-0.38)*sl - sm(Math.min(1,Math.max(0,(t-0.24)/0.34)))*0.40;   // darunter schmaler Brustkorb
  const rz=0.38+(0.58-0.38)*sm(Math.min(1,t/0.30));
  ringE(y,rx,rz,Math.round(56+rx*55),Math.max(0,0.5-t*0.9),0.95*(1-t*0.55),k*0.17);
}
// Streupunkte
const SP=[]; for(let i=0;i<110;i++){ SP.push({a:Math.random()*6.28,r:1.2+Math.random()*1.6,y:-1.8+Math.random()*3.6,sp:0.1+Math.random()*0.25,s:0.7+Math.random()*1.2}); }


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
    case 'stop':  return {E:V(X*1.40,SY-0.70,0.45), H:V(X*0.95,SY+0.15,1.05)};
    case 'welcome': return {E:V(X*1.62,SY-0.85,0.35), H:V(X*2.05,SY-0.30,0.95)};
    case 'ask':   return {E:V(X*1.45,SY-1.00,0.45), H:V(X*0.85,SY-0.70,1.30)};
    case 'sorry': return {E:V(X*1.36,SY-1.00,0.30), H:V(X*0.75,SY-1.35,0.85)};
  }
}
const GESTEN={
  neutral:['palm','open','point','chest','palm','open'],
  warn:['stop','stop','point','stop'],
  sorry:['sorry','sorry','rest','sorry'],
  question:['ask','ask','palm','ask'],
  greet:['welcome','welcome','open','welcome'],
  happy:['open','welcome','palm','open']
};
const arm=[{sd:1,cur:pose('rest',1),tgt:'rest',timer:0},{sd:-1,cur:pose('rest',-1),tgt:'rest',timer:0}];
function armsUpdate(dt){
  const GEST=GESTEN[emo]||GESTEN.neutral;
  arm.forEach((a,i)=>{
    a.timer-=dt;
    if(a.timer<=0){
      if(speaking){ // rechts öfter, links seltener
        const both=emo==='greet'||emo==='sorry'||emo==='question';
        const act=Math.random()<(i===0?0.85:(both?0.9:0.5));
        a.tgt=act?GEST[(Math.random()*GEST.length)|0]:'rest'; a.timer=(emo==='warn'?1.2:0.7)+Math.random()*1.0;
      } else { a.tgt='rest'; a.timer=0.3; }
    } else if(!speaking && a.tgt!=='rest'){ a.tgt='rest'; }
    const T=pose(a.tgt,a.sd), k=1-Math.pow(0.0009,dt);   // weiche Bewegung
    ['E','H'].forEach(j=>{ a.cur[j].x=lerp(a.cur[j].x,T[j].x,k); a.cur[j].y=lerp(a.cur[j].y,T[j].y,k); a.cur[j].z=lerp(a.cur[j].z,T[j].z,k); });
  });
}

// Krümmung der Finger (0 = gestreckt, 1 = Faust) je Geste: Daumen, Zeige-, Mittel-, Ring-, kleiner Finger
const CURL={
  rest:[0.35,0.30,0.35,0.40,0.45], palm:[0.05,0.02,0.0,0.02,0.05], open:[0.20,0.15,0.18,0.22,0.25],
  point:[0.70,0.0,0.95,0.98,1.0], chest:[0.30,0.25,0.30,0.35,0.40],
  stop:[0.05,0.0,0.0,0.0,0.03], welcome:[0.10,0.05,0.05,0.08,0.12], ask:[0.10,0.08,0.08,0.10,0.15], sorry:[0.40,0.38,0.42,0.46,0.5]
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

function armPoints(out){
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
    for(let q=0;q<110;q++){ const yy=1-(q+0.5)/110*2, rr=Math.sqrt(1-yy*yy), th=q*2.39996; out.push({x:S.x+Math.cos(th)*rr*0.34,y:S.y+yy*0.34,z:S.z+Math.sin(th)*rr*0.34,c:0.12,s:1.1}); }   // Schultergelenk
    seg(S,E,0.31,0.21,22,0.12,0.18);
    seg(E,Hd,0.21,0.14,22,0.18,0.34);
    // Hand: Handfläche (Platte) und fünf Finger mit drei Gliedern, die sich je nach Geste krümmen
    handPoints(out,a,E,Hd);
  });
}


function col(c,a){ const r=40+c*215, g=130+c*40-(c>0.6?(c-0.6)*100:0), b=255-c*230; return `rgba(${r|0},${g|0},${b|0},${a})`; }
let speaking=false, mo=0, target=0, blink=0, nextBlink=2200, t0=performance.now(), tPrev=performance.now();
let eyeH=1, eyeHappy=0, eyeTilt=0, smile=0;
function frame(now){
  raf=0;
  if(!isOn()||document.hidden||!cv) return;
  raf=requestAnimationFrame(frame);
  const t=(now-t0)/1000; const dt=Math.min(0.05,(now-tPrev)/1000); tPrev=now;
  speaking=sprechen(); const listening=hoeren();
  if(!speaking && now>emoUntil-59000) emo='neutral';
  armsUpdate(dt);
  if(speaking){ if(Math.random()<0.22) target=0.1+Math.random()*0.9; } else target=0;
  mo+=(target-mo)*(speaking?0.4:0.18);
  nextBlink-=16; if(nextBlink<0){blink=1; nextBlink=2200+Math.random()*3200;}
  let ek=1; if(blink>0){ ek=Math.max(0.08,Math.abs(1-blink*2)); blink-=0.13; if(blink<0) blink=0; }
  // Augen und Mundwinkel je nach Stimmung (weich überblendet)
  const tH=emo==='warn'?1.5:emo==='question'?1.25:listening?1.2:emo==='sorry'?0.8:1;
  const tHap=(emo==='happy'||emo==='greet')?1:0, tTilt=emo==='sorry'?1:0, tSm=(emo==='happy'||emo==='greet')?1:emo==='sorry'?-0.8:0;
  eyeH+=(tH-eyeH)*0.15; eyeHappy+=(tHap-eyeHappy)*0.15; eyeTilt+=(tTilt-eyeTilt)*0.15; smile+=(tSm-smile)*0.15;
  const th=Math.sin(t*0.45)*0.06+Math.sin(t*1.1)*0.015, cs=Math.cos(th), sn=Math.sin(th);
  const F=4.6, sc=Math.min(W/4.6,H/5.4), ox=W/2, oy=H*0.40+Math.sin(t*1.3)*2.5+(speaking?mo*2.5:0);
  cx.clearRect(0,0,W,H);
  cx.globalCompositeOperation='lighter';
  const gr=cx.createRadialGradient(ox,oy-sc*0.9,10,ox,oy-sc*0.9,sc*1.7);
  gr.addColorStop(0,col(emo==='warn'?0.85:1,0.10+mo*0.10+(emo==='warn'?0.05:0))); gr.addColorStop(1,'rgba(0,0,0,0)'); cx.fillStyle=gr; cx.fillRect(0,0,W,H);
  const proj=(x,y,z)=>{ const X=x*cs+z*sn, Z=-x*sn+z*cs, k=F/(F+Z+1.6); return [ox+X*sc*k, oy-(y-0.1)*sc*k, k, Z]; };
  for(const p of P){
    const [sx,sy,k,Z]=proj(p.x,p.y,p.z);
    const front=Z<0.15 ? 1 : 0.38; const a=Math.min(1,(0.75+0.6*(k-0.7))*front);
    const boost=p.c>0.6?(speaking?0.28*mo:0):0;
    cx.fillStyle=col(p.c,Math.min(1,a+boost));
    const s=p.s*k*1.7; cx.fillRect(sx-s/2,sy-s/2,s,s);
  }
  const AP=[]; armPoints(AP);
  for(const p of AP){ const [sx,sy,k,Z]=proj(p.x,p.y,p.z); const a=Math.min(1,0.8+0.5*(k-0.7)); cx.fillStyle=col(p.c,a*(p.y<NY-1.9?Math.max(0.15,1-(NY-1.9-p.y)*1.1):1)); const sz=p.s*k*1.7; cx.fillRect(sx-sz/2,sy-sz/2,sz,sz); }
  for(const q of SP){ const a=q.a+t*q.sp; const x=Math.cos(a)*q.r, z=Math.sin(a)*q.r, y=q.y+Math.sin(t*0.8+q.a)*0.1; const [sx,sy,k,Z]=proj(x,y,z); cx.fillStyle=col(0.1,Z<0?0.7:0.25); const s=q.s*k; cx.fillRect(sx,sy,s,s); }
  function fp(x,y){
    const v=Math.max(-0.99,Math.min(0.99,(y-HC)/HRY)), a=hA(v), rxx=HRX*a, rzz=HRZ*a;
    const u=Math.max(-0.98,Math.min(0.98,x/rxx)); const zz=rzz*Math.sqrt(1-u*u);
    return proj(x,y,zz+0.012);
  }
  cx.lineCap='round';
  for(const sx0 of [-0.27,0.27]){
    const [ex,ey,k]=fp(sx0,HC+0.14);
    const w=0.26*sc*k*(1+0.08*(eyeH-1)), h=Math.max(2,0.07*sc*k*Math.min(ek,1)*1.9*eyeH);
    cx.shadowColor=col(1,1); cx.shadowBlur=14;
    if(eyeHappy>0.5){   // lachende Augen: nach oben gewölbte Bögen
      cx.strokeStyle=col(1,0.95); cx.lineWidth=3; cx.beginPath(); cx.ellipse(ex,ey+h*0.5,w/2,Math.max(2,h*0.9)*ek,0,Math.PI*1.1,Math.PI*1.9); cx.stroke();
    } else {
      cx.fillStyle=col(1,0.95); cx.beginPath(); cx.ellipse(ex,ey,w/2,h/2,(sx0<0?1:-1)*0.28*eyeTilt,0,6.283); cx.fill();
    }
  }
  const my=HC-0.50, mw=0.22, od=0.025+mo*0.15;
  const seg=14; cx.shadowBlur=14; cx.shadowColor=col(1,1);
  for(const dir of [-1,1]){
    cx.beginPath();
    for(let i=0;i<=seg;i++){ const u=i/seg*2-1; const x=u*mw; const y=my+dir*(od*(1-u*u))+smile*0.05*u*u; const [px,py]=fp(x,y); if(i===0) cx.moveTo(px,py); else cx.lineTo(px,py); }
    cx.strokeStyle=col(1,0.95); cx.lineWidth=2.2; cx.stroke();
  }
  cx.shadowBlur=0;
  cx.globalCompositeOperation='source-over';
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
        document.addEventListener('visibilitychange', () => { if (!document.hidden && isOn() && !raf) { tPrev = performance.now(); raf = requestAnimationFrame(frame); } });
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
    window.__holoTest = { frame: t => frame(t), setEmo: e => { emo = e; emoUntil = performance.now() + 60000; }, detect };
    if (window.jvCommands) {
        window.jvCommands.use('hologramm', function (text, next) {
            try { if (handle(text)) return true; } catch (e) {}
            return next(text);
        }, 210);
    }
    function start() { try { mount(); } catch (e) { console.error('Hologramm-Ansicht', e); } }
    if (document.readyState === 'complete' || document.readyState === 'interactive') start(); else document.addEventListener('DOMContentLoaded', start);
})();
