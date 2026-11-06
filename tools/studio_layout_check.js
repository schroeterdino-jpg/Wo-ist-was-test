/* Echter mobiler Layout-Test (Chromium über Playwright) für die Jarvis-Studio-Karte. Start: node tools/studio_layout_check.js [Breiten, z. B. 360,390,430]
   Lädt die ECHTE index.html samt style.css und allen Skripten (Tailwind kommt aus einer lokalen Kopie, weil dieser Test kein Internet braucht; Pfad per
   Umgebungsvariable TAILWIND_JS, sonst die Kopie aus /opt/npm-tools). Prüft je Breite und je Zustand (Start, mehrere Live-Updates, Freigabe, Fertig, Projekt/APK):
   kein Seitenüberlauf, Layout-Viewport bleibt = Gerätebreite, Karte und ALLE Knöpfe liegen links/rechts im Bild, Freigabe-/Pause-/Abbrechen-Knöpfe sind ohne
   Scrollen sichtbar, alle Knöpfe per Scrollen erreichbar. Nicht Teil der automatischen Tests (braucht einen Browser). */
const { chromium } = require('playwright'); const fs=require('fs'), path=require('path');
const ROOT=process.env.ROOT||path.join(__dirname,'..'), TW=process.env.TAILWIND_JS||'/opt/npm-tools/node_modules/@zenuml/core/dist/vendor/tailwindcss/tailwindcss.js';
const MIME={'.html':'text/html','.js':'application/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.jpg':'image/jpeg'};
const PRE=process.env.PRE||'', OUT=process.env.LAYOUT_OUT||require('os').tmpdir();
(async()=>{
 const b=await chromium.launch(); const res=[];
 for(const W of (process.argv[2]||'360,390,430').split(',').map(Number)){
 const ctx=await b.newContext({viewport:{width:W,height:780},isMobile:true,hasTouch:true,deviceScaleFactor:2,serviceWorkers:'block'});
 const page=await ctx.newPage();
 await page.route('**/*',rt=>{ const u=new URL(rt.request().url());
  if(u.host==='cdn.tailwindcss.com') return rt.fulfill({contentType:'application/javascript',body:fs.readFileSync(TW)});
  if(u.host==='jarvis.test'){ let p=u.pathname==='/'?'/index.html':u.pathname; const f=path.join(ROOT,decodeURIComponent(p)); if(fs.existsSync(f)&&fs.statSync(f).isFile()) return rt.fulfill({contentType:MIME[path.extname(f)]||'application/octet-stream',body:fs.readFileSync(f)}); return rt.fulfill({status:404,body:''}); }
  return rt.abort(); });
 await page.goto('http://jarvis.test/'); await page.waitForFunction(()=>window.jvStudioAnsicht&&window.jvMission,null,{timeout:20000}); await page.waitForTimeout(8000);
 await page.evaluate(()=>{ const hb=document.getElementById('jvBoot'); });
 const messe=async(tag)=>{ const o=await page.evaluate(()=>{ const vw=document.documentElement.clientWidth, iw=innerWidth;
   const k=document.getElementById('studioKarte'), kr=k&&k.getBoundingClientRect(); const bad=[]; if(k) k.querySelectorAll('*').forEach(e=>{const r=e.getBoundingClientRect(); if(r.width&&(r.right>kr.right+1||r.left<kr.left-1)) bad.push(e.tagName+'.'+(e.className||'')+' '+Math.round(r.left)+'-'+Math.round(r.right))});
   const btns=[...(k?k.querySelectorAll('button,a.skB'):[])].map(e=>{const r=e.getBoundingClientRect();return {t:(e.textContent||'').trim().slice(0,14),l:Math.round(r.left),r:Math.round(r.right),top:Math.round(r.top),bot:Math.round(r.bottom)}});
   const sticky=[...(k?k.querySelectorAll('.skUnten button'):[])].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight}); const erreichbar=sticky&&[...(k?k.querySelectorAll('button,a.skB'):[])].every(e=>{e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&r.left>=0&&r.right<=innerWidth}); window.scrollTo(0,0);
   return {erreichbar, iw, vw, docSW:document.documentElement.scrollWidth, kard:kr&&[Math.round(kr.left),Math.round(kr.right),Math.round(kr.top),Math.round(kr.bottom)], kScrollH:k&&k.scrollHeight, kClientH:k&&k.clientHeight, innerH:innerHeight, bodyScrollH:document.body.scrollHeight, kids:bad.slice(0,4), btns};});
   const ok = o.erreichbar && o.iw===W && o.docSW<=W && o.kard && o.kard[0]>=0 && o.kard[1]<=W && !o.kids.length && o.btns.every(x=>x.l>=0&&x.r<=W);
   res.push({W,tag,ok}); console.log(W,tag,ok?'OK':'FEHLER',JSON.stringify(o)); await page.screenshot({path:OUT+'/'+PRE+tag+'_'+W+'.png'}); };
 await page.evaluate(()=>{ const M=jvMission,P=jvStudioProjekte; const r=M.neu({titel:'Bau mir eine Zähler-App mit Plus, Minus und Reset',auftrag:'x',schritte:[{titel:'Anforderungen verstehen und Aufbau der Zähler-Oberfläche planen'},{titel:'Dateien index.html und app.js schreiben und im abgeschotteten Testlauf prüfen'},{titel:'Debug-APK ohne Berechtigungen auf GitHub bauen lassen und herunterladen'}]}); window.__mid=r.mission.id; P.arbeit.setze(__mid,{studio:true}); M.starten(__mid); jvStudioAnsicht.zeige(__mid); });
 await page.waitForTimeout(500); await messe('1_start');
 const lang='Die Zähler-Oberfläche mit Überschrift, Zahlenanzeige, Plus-, Minus- und Reset-Knopf wurde erfolgreich erstellt und im abgeschotteten Testlauf ohne Fehler geladen';
 await page.evaluate(async(lang)=>{ const M=jvMission,mid=__mid,m=M.hole(mid); for(let i=0;i<2;i++){ M.schrittStarten(mid,m.schritte[i].id); jvStudioRegie.werkzeug(mid,'start','Ich schreibe jetzt die Datei index.html und danach app.js für die Zähler-App'+i); jvStudioRegie.werkzeug(mid,'info',lang+' ('+i+')'); M.schrittErledigt(mid,m.schritte[i].id,{ergebnis:'ok'}); } },lang);
 await page.waitForTimeout(800); await messe('2_updates');
 await page.evaluate(()=>{ const M=jvMission,m=M.hole(__mid); M.schrittStarten(__mid,m.schritte[2].id); M.freigabeAnfordern(__mid,'Soll ich daraus jetzt eine APK-Datei bauen lassen? Der Bau läuft auf GitHub und dauert etwa drei bis fünf Minuten, dafür werden die Dateien dorthin hochgeladen.'); });
 await page.waitForTimeout(600); await messe('3_freigabe');
 await page.evaluate(()=>{ const M=jvMission,P=jvStudioProjekte; const p=P.neu({name:'Zähler-App mit Plus Minus und Reset',art:'app',auftrag:'x',dateien:[{pfad:'index.html',inhalt:'<html></html>'},{pfad:'app.js',inhalt:'var a=1'},{pfad:'sehr-lange-datei-mit-langem-namen-fuer-den-test.css',inhalt:'a{}'}]}); P.arbeit.setze(__mid,{studio:true,projektId:p.projekt.id}); P.setze&&0; window.__pid=p.projekt.id; M.freigeben(__mid,true,'ok'); const m=M.hole(__mid); M.schrittErledigt(__mid,m.schritte[2].id,{ergebnis:'ok'}); M.abschliessen(__mid,'fertig'); jvStudioAnsicht.neuZeichnen(__mid); });
 await page.waitForTimeout(800); await messe('4_fertig');
 await page.evaluate(()=>{ const P=jvStudioProjekte; try{P.apkSetzen? P.apkSetzen(__pid,{url:'https://github.com/schroeterdino-jpg/jarvis-studio-builds/releases/download/studio-pmhxyz1234ab/Zaehler-App-mit-Plus-Minus-und-Reset-debug.apk',bytes:9123}):0;}catch(e){} jvStudioAnsicht.zeigeProjekt(__pid); });
 await page.waitForTimeout(500); await messe('5_projekt');
 await ctx.close(); }
 await b.close(); const f=res.filter(r=>!r.ok).length; console.log('LAYOUT: '+(res.length-f)+' Prüfungen in Ordnung, '+f+' Fehler'); process.exit(f?1:0);
})();
