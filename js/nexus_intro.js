/* NEXUS – cineastische Vorstellung von Dinos persönlichem KI-Assistenten.
   Eigenständig, ohne externe Musikdatei: Soundtrack/SFX werden mit Web Audio erzeugt.
   Start manuell über window.startNexusIntro(). */
(function () {
  'use strict';
  var running = false, timers = [], audio = null, nodes = [];
  var scenes = [
    { t: 900,  kicker: 'EINE NEUE ART VON ASSISTENT', main: 'NEXUS', sub: 'Dein persönlicher KI-Assistent', hold: 3300, hit: 1 },
    { t: 4700, main: 'ER HÖRT ZU.', sub: 'Sprache. Fragen. Alltag.', hold: 3000, hit: 1 },
    { t: 8200, main: 'ER ERINNERT SICH.', sub: 'Was dir wichtig ist, bleibt im Kontext.', hold: 3200, hit: 1 },
    { t: 11900, main: 'ER PLANT.', sub: 'Termine · Erinnerungen · Ausflüge', hold: 3200, hit: 1 },
    { t: 15600, main: 'ER SIEHT VORAUS.', sub: 'Wetter · Verkehr · Hinweise', hold: 3200, hit: 1 },
    { t: 19300, main: 'ER ORGANISIERT.', sub: 'E-Mails · Aufgaben · Einkauf', hold: 3200, hit: 1 },
    { t: 23000, main: 'ER VERSTEHT BILDER.', sub: 'Fotoanalyse · Texte · Adressen', hold: 3200, hit: 1 },
    { t: 26700, main: 'ER HANDELT.', sub: 'Nicht nur antworten. Dinge erledigen.', hold: 3400, hit: 2 },
    { t: 30700, main: 'GEBAUT FÜR DEINEN ALLTAG.', sub: 'Persönlich. Proaktiv. Immer dabei.', hold: 3900, hit: 2 },
    { t: 35200, kicker: 'UND DAS IST', main: 'ERST DER ANFANG.', sub: '', hold: 3900, hit: 3 },
    { t: 39700, kicker: 'BEREIT?', main: 'NEXUS', sub: 'Dein Leben. Dein Assistent.', hold: 5200, hit: 4 }
  ];

  function later(fn, ms) { var id = setTimeout(fn, ms); timers.push(id); return id; }
  function clearTimers() { timers.forEach(clearTimeout); timers = []; }

  function ensureStyle() {
    if (document.getElementById('nexusIntroStyle')) return;
    var s = document.createElement('style'); s.id = 'nexusIntroStyle';
    s.textContent = `
#nexusIntro{position:fixed;inset:0;z-index:2147483000;background:#01050a;color:#eefbff;display:none;overflow:hidden;font-family:system-ui,-apple-system,Segoe UI,sans-serif;touch-action:none}
#nexusIntro.on{display:block;animation:nxIn .65s ease both} #nexusIntro.out{animation:nxOut .65s ease both}
#nexusIntro .nx-bg{position:absolute;inset:-15%;background:radial-gradient(circle at 50% 45%,rgba(0,190,255,.13),transparent 28%),radial-gradient(circle at 50% 50%,#071522 0,#02070d 42%,#000 72%);animation:nxBreath 5s ease-in-out infinite}
#nexusIntro .nx-grid{position:absolute;inset:45% -20% -25%;opacity:.18;background-image:linear-gradient(rgba(61,211,255,.22) 1px,transparent 1px),linear-gradient(90deg,rgba(61,211,255,.22) 1px,transparent 1px);background-size:42px 42px;transform:perspective(420px) rotateX(64deg);transform-origin:50% 0;mask-image:linear-gradient(to bottom,#000,transparent 82%)}
#nexusIntro .nx-vignette{position:absolute;inset:0;box-shadow:inset 0 0 120px 55px #000;pointer-events:none}
#nexusIntro .nx-scan{position:absolute;left:0;right:0;height:2px;background:linear-gradient(90deg,transparent,#67e7ff,transparent);opacity:.22;filter:blur(.4px);animation:nxScan 4.8s linear infinite}
#nexusIntro .nx-core{position:absolute;left:50%;top:38%;width:min(42vw,190px);aspect-ratio:1;transform:translate(-50%,-50%);border-radius:50%;opacity:.5;transition:opacity .8s,filter .8s,transform .8s;background:radial-gradient(circle,#dffcff 0 2%,#5ce8ff 3% 5%,rgba(0,190,255,.32) 8% 20%,rgba(0,91,160,.12) 35%,transparent 67%);box-shadow:0 0 28px rgba(67,224,255,.45),0 0 90px rgba(0,157,255,.22);animation:nxCore 7s linear infinite}
#nexusIntro .nx-core:before,#nexusIntro .nx-core:after{content:'';position:absolute;inset:10%;border:1px solid rgba(108,230,255,.35);border-radius:50%;animation:nxRing 8s linear infinite}#nexusIntro .nx-core:after{inset:24%;border-style:dashed;animation-direction:reverse;animation-duration:5s}
#nexusIntro.flash .nx-core{opacity:1;filter:brightness(1.8);transform:translate(-50%,-50%) scale(1.09)}
#nexusIntro .nx-copy{position:absolute;left:7vw;right:7vw;top:55%;transform:translateY(-50%);text-align:center;text-shadow:0 0 22px rgba(55,216,255,.45)}
#nexusIntro .nx-kicker{min-height:1.5em;color:#55dcff;font:700 clamp(11px,3vw,15px)/1.2 ui-monospace,monospace;letter-spacing:.34em;margin-bottom:13px;opacity:0}
#nexusIntro .nx-main{font-size:clamp(31px,10vw,62px);font-weight:950;line-height:.95;letter-spacing:.045em;opacity:0;transform:scale(.91);filter:blur(7px)}
#nexusIntro .nx-sub{min-height:2.2em;margin-top:18px;color:#a9c7d3;font:600 clamp(13px,3.8vw,18px)/1.45 ui-monospace,monospace;letter-spacing:.06em;opacity:0}
#nexusIntro.show .nx-kicker{animation:nxText .7s .05s ease both}#nexusIntro.show .nx-main{animation:nxMain .85s .12s cubic-bezier(.2,.8,.2,1) both}#nexusIntro.show .nx-sub{animation:nxText .8s .48s ease both}
#nexusIntro.leave .nx-kicker,#nexusIntro.leave .nx-main,#nexusIntro.leave .nx-sub{animation:nxLeave .55s ease both}
#nexusIntro .nx-skip{position:absolute;right:16px;top:max(16px,env(safe-area-inset-top));z-index:3;border:1px solid rgba(102,221,255,.25);background:rgba(2,12,20,.65);color:#89c8da;border-radius:999px;padding:9px 14px;font:700 11px ui-monospace,monospace;letter-spacing:.08em}
#nexusIntro .nx-progress{position:absolute;left:0;bottom:0;height:2px;width:0;background:#58ddff;box-shadow:0 0 14px #35d8ff}
#nexusIntro.on .nx-progress{animation:nxProgress 46s linear forwards}
@keyframes nxIn{from{opacity:0}to{opacity:1}}@keyframes nxOut{to{opacity:0}}@keyframes nxBreath{50%{filter:brightness(1.22)}}@keyframes nxScan{from{top:-2px}to{top:100%}}@keyframes nxCore{to{rotate:360deg}}@keyframes nxRing{to{transform:rotate(360deg)}}
@keyframes nxText{from{opacity:0;transform:translateY(13px)}to{opacity:1;transform:none}}@keyframes nxMain{from{opacity:0;transform:scale(.91);filter:blur(7px)}55%{filter:blur(0)}to{opacity:1;transform:scale(1);filter:blur(0)}}@keyframes nxLeave{to{opacity:0;transform:translateY(-10px);filter:blur(4px)}}@keyframes nxProgress{to{width:100%}}
@media(prefers-reduced-motion:reduce){#nexusIntro *{animation-duration:.01ms!important;animation-iteration-count:1!important}}
`;
    document.head.appendChild(s);
  }

  function ensureDom() {
    ensureStyle(); var el = document.getElementById('nexusIntro'); if (el) return el;
    el = document.createElement('div'); el.id = 'nexusIntro'; el.setAttribute('role','dialog'); el.setAttribute('aria-label','NEXUS Vorstellung');
    el.innerHTML = '<div class="nx-bg"></div><div class="nx-grid"></div><div class="nx-scan"></div><div class="nx-core"></div><div class="nx-copy"><div class="nx-kicker"></div><div class="nx-main"></div><div class="nx-sub"></div></div><div class="nx-vignette"></div><button class="nx-skip" type="button">ÜBERSPRINGEN</button><div class="nx-progress"></div>';
    el.querySelector('.nx-skip').addEventListener('click', function(e){e.stopPropagation(); stop(true);}); document.body.appendChild(el); return el;
  }

  function tone(freq, when, dur, gain, type) {
    if (!audio) return; var o=audio.createOscillator(), g=audio.createGain(); o.type=type||'sine'; o.frequency.setValueAtTime(freq,when); g.gain.setValueAtTime(.0001,when); g.gain.exponentialRampToValueAtTime(gain,when+.025); g.gain.exponentialRampToValueAtTime(.0001,when+dur); o.connect(g).connect(audio.destination); o.start(when); o.stop(when+dur+.04); nodes.push(o,g);
  }
  function hit(level) { if(!audio)return; var n=audio.currentTime; tone(46,n,.55,.045+(level||1)*.012,'sine'); tone(92,n,.18,.012,'triangle'); if(level>2) tone(184,n+.04,.35,.008,'sine'); }
  function soundtrack() {
    try { audio = new (window.AudioContext||window.webkitAudioContext)(); var now=audio.currentTime;
      // Tiefer, eigener Spannungspuls – keine externe/copyrightete Musik.
      for(var i=0;i<24;i++){ tone(i%4===3?55:42,now+i*1.9,.72,i<12?.012:.018,'sine'); if(i>8&&i%2===0) tone(110,now+i*1.9+.06,.22,.004,'triangle'); }
      tone(31,now,.9,.028,'sine');
    } catch(e){ audio=null; }
  }
  function showScene(el, sc) {
    el.classList.remove('show','leave','flash'); void el.offsetWidth;
    el.querySelector('.nx-kicker').textContent=sc.kicker||''; el.querySelector('.nx-main').textContent=sc.main||''; el.querySelector('.nx-sub').textContent=sc.sub||'';
    el.classList.add('show','flash'); hit(sc.hit||1); later(function(){el.classList.remove('flash');},280); later(function(){if(running){el.classList.remove('show');el.classList.add('leave');}},Math.max(1800,sc.hold-650));
  }
  function start() {
    if(running)return; running=true; clearTimers(); var el=ensureDom(); el.className='on'; document.documentElement.style.overflow='hidden'; soundtrack();
    scenes.forEach(function(sc){ later(function(){if(running)showScene(el,sc);},sc.t); }); later(function(){stop(false);},45800);
  }
  function stop(skipped) {
    if(!running)return; running=false; clearTimers(); var el=document.getElementById('nexusIntro'); if(el){el.classList.add('out'); setTimeout(function(){el.className='';el.style.display='none';},650);} document.documentElement.style.overflow='';
    try { if(audio){audio.close();audio=null;} }catch(e){} nodes=[];
    try { window.dispatchEvent(new CustomEvent('nexus-intro-ended',{detail:{skipped:!!skipped}})); } catch(e){}
  }
  window.startNexusIntro=start; window.stopNexusIntro=stop;
})();
